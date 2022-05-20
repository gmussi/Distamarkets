// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "erc-payable-token/contracts/token/ERC1363/IERC1363Spender.sol";
//import "hardhat/console.sol";

contract Distamarkets is IERC1363Spender {
    using SafeERC20 for IERC20;

    event MarketCreated(bytes32 indexed marketId_, address indexed oracle_, uint indexed closingTime_, uint numOutcomes_);
    event StakeChanged(bytes32 indexed marketId, uint256 outcomeId_, address indexed user, uint256 oldBalance, uint256 newBalance);
    event MarketStateChanged(bytes32 indexed marketId, MarketState indexed oldState, MarketState indexed newState);

    enum MarketState { OPEN, ENDED, RESOLVED, DISPUTED, CLOSED, CANCELED } 

    struct Market {
        // market details
        address oracle;
        address creator;
        uint256 numOutcomes;
        uint256 closingTime;
        uint256 resolvedAt;
        uint256 totalStake;
        uint256 finalOutcomeId;
        MarketState state;
        // outcome index => user => user stake id
        mapping(uint256 => mapping(address => uint256)) stakes;
        mapping(uint256 => uint256) outcomeStakes;
    }

    struct UserStake {
        bytes32 marketId;
        uint256 outcomeId;
        uint256 amount;
        address user;
    }

    IERC20 internal immutable _token;
    uint256 internal _tokenBalance;

    // uint256 _depositFee = 0.3 ether; // 0.3% fee
    // uint256 _withdrawFee = 10 ether; // 10% fee

    // market id => Market
    mapping(bytes32 => Market) _markets;

    UserStake[] _userStakes;
    mapping(address => uint256[]) _stakesByUser; // User => UserStake Ids

    constructor(IERC20 token_) {
        _token = token_;
    }

    function createMarket(bytes32 marketId_, address oracle_, uint closingTime_, uint numOutcomes_) external {
        Market storage market = _markets[marketId_];
        market.oracle = oracle_;
        market.creator = msg.sender;
        market.numOutcomes = numOutcomes_;
        market.closingTime = closingTime_;
        market.state = MarketState.OPEN;

        emit MarketCreated(marketId_, oracle_, closingTime_, numOutcomes_); 
    }

    function onApprovalReceived(address sender_, uint256 amount_, bytes calldata data_) external override returns (bytes4) {
        require(amount_ > 0, "Cannot add 0 stake");
        require(sender_ != address(0), "Invalid sender");

        // extract encoded data
        bytes32 marketId_;
        uint256 outcomeId_;

        (marketId_, outcomeId_) = abi.decode(data_, (bytes32, uint256));

        Market storage market = _markets[marketId_];
        
        // validate data received
        require(market.oracle != address(0), "Market not found or not initialized");
        require(isMarketOpen(marketId_), "Market is not open");


        market.totalStake = market.totalStake + amount_;
        market.outcomeStakes[outcomeId_] = market.outcomeStakes[outcomeId_] + amount_;

        // user already has stake?
        uint256 stakeId = market.stakes[outcomeId_][sender_];
        UserStake storage stake;

        if (stakeId == 0) {
            // stake does not exist yet
            _userStakes.push();
            stakeId = _userStakes.length;
            stake = _userStakes[stakeId - 1];
            stake.marketId = marketId_;
            stake.outcomeId = outcomeId_;

            _stakesByUser[sender_].push(stakeId);
            market.stakes[outcomeId_][sender_] = stakeId;
        } else {
            // loading existing stake
            stake = _userStakes[stakeId - 1];
        }
        
        // update stake amount
        uint256 oldBalance = stake.amount;
        uint256 newBalance = stake.amount + amount_;
        stake.amount = newBalance;

        _token.safeTransferFrom(
            sender_,
            address(this),
            amount_
        );
        updateBalance();

        emit StakeChanged(marketId_, outcomeId_, sender_, oldBalance, newBalance);

        return this.onApprovalReceived.selector;
    }

    function removeStake(uint256 stakeId_, uint256 amount_) external openMarket(_userStakes[stakeId_ - 1].marketId) returns (uint256) {
        require(amount_ > 0, "Cannot remove 0 stake");

        UserStake storage stake = _userStakes[stakeId_ - 1];

        Market storage market = _markets[stake.marketId];

        require(stake.amount >= amount_, "Amount exceeds current stake");

        market.totalStake = market.totalStake - amount_;
        market.outcomeStakes[stake.outcomeId] = market.outcomeStakes[stake.outcomeId] - amount_;
        
        uint256 oldBalance = stake.amount;
        uint256 newBalance = stake.amount - amount_;
        stake.amount = newBalance;

        _token.safeTransfer(
            msg.sender,
            amount_
        );

        updateBalance();

        emit StakeChanged(stake.marketId, stake.outcomeId, msg.sender, oldBalance, newBalance);

        return stake.amount;
    }

    function getMarket(bytes32 marketId_) public view returns (address, address, uint256, uint256, uint256, uint256, uint256, MarketState) {
        Market storage market = _markets[marketId_];

        MarketState state = market.state;
        if (state == MarketState.OPEN && block.timestamp < market.closingTime) {
            state = MarketState.ENDED;
        }

        return (market.oracle, market.creator, market.numOutcomes, market.closingTime, market.resolvedAt, market.totalStake, market.finalOutcomeId, market.state);
    }

    function resolveMarket(bytes32 marketId_, uint256 finalOutcomeId_) external {
        Market storage market = _markets[marketId_];

        require(msg.sender == market.oracle, "Only the oracle can resolve the market");
        require(market.state == MarketState.OPEN, "Only open markets can be resolved");
        require(block.timestamp > market.closingTime, "Market can only be closed after the specified period");

        MarketState oldState = market.state;
        MarketState newState = MarketState.RESOLVED;

        market.state = newState;
        market.resolvedAt = block.timestamp;
        market.finalOutcomeId = finalOutcomeId_;

        emit MarketStateChanged(marketId_, oldState, newState);
    } 

    /*function withdrawReward(uint256 stakeId_) external {
        UserStake storage stake = _userStakes[stakeId_ - 1];

        uint256 reward = _getReward(stake);
    }*/

    function calculateReward(uint256 stakeId_) external view returns (uint256) {
        UserStake storage stake = _userStakes[stakeId_ - 1];

        return _calculateReward(stake);
    }

    function _calculateReward(UserStake storage stake_) internal view returns (uint256) {
        Market storage market = _markets[stake_.marketId];
        
        uint256 totalStake = market.totalStake; 

        uint256 outcomeStake = market.outcomeStakes[stake_.outcomeId];

        uint256 rewardBucket = totalStake - outcomeStake;

        uint256 finalStake = stake_.amount * rewardBucket / outcomeStake;

        return finalStake;
    }

    function updateBalance() public {
        // Retrieve amount of tokens held in contract
        _tokenBalance = _token.balanceOf(address(this));
    }

    function getStakeId(address holder_, bytes32 marketId_, uint256 outcomeId_) public view returns (uint256) {
        return _markets[marketId_].stakes[outcomeId_][holder_];
    }

    function getMarketTotalStake(bytes32 marketId_) public view returns (uint256) {
        return _markets[marketId_].totalStake;
    }

    function getUserStakes(address address_) public view returns(uint256[] memory) {
        return _stakesByUser[address_];
    }

    function getStake(uint256 stakeId_) public view returns(UserStake memory) {
        return _userStakes[stakeId_ - 1];
    }

    function token() public view returns (IERC20) {
        return _token;
    }

    function tokenBalance() public view returns (uint256) {
        return _tokenBalance;
    }

    function isMarketOpen(bytes32 marketId_) public view returns (bool) {
        Market storage market = _markets[marketId_];
        return 
            market.state == MarketState.OPEN
        &&
            block.timestamp < market.closingTime;
    }

    modifier openMarket(bytes32 marketId_) {
        require(isMarketOpen(marketId_));
        _;
    }
}
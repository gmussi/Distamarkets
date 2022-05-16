// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "erc-payable-token/contracts/token/ERC1363/IERC1363Spender.sol";

contract Distamarkets is IERC1363Spender {
    using SafeERC20 for IERC20;

    event MarketCreated(address indexed creator, uint256 indexed marketId, string name);
    event StakeChanged(uint256 indexed stakeId, uint256 amount, uint256 indexed marketId, address indexed user);
    event MarketStateChanged(uint256 indexed marketId, MarketState);

    enum MarketState { OPEN, ENDED, RESOLVED, DISPUTED, CLOSED, CANCELED } 

    struct Market {
        // market details
        string title;
        string image;
        uint numOutcomes;
        uint closingTime;
        uint resolvedAt;
        uint256 totalStake;
        uint256 finalOutcomeId;
        MarketState state;
        address creator;
        mapping(uint256 => MarketOutcome) outcomes;
    }

    struct MarketOutcome {
        // outcome details
        uint256 id;
        uint256 totalStake;
        bytes32 outcomeName;
        mapping(address => uint256) holders; // User => UserStake
    }

    struct UserStake {
        uint256 marketId;
        uint256 outcomeId;
        uint256 amount;
        address user;
    }

    IERC20 internal immutable _token;
    uint256 internal _tokenBalance;

    Market[] _markets;
    UserStake[] _userStakes;
    mapping(address => uint256[]) _stakesByUser; // User => UserStake Ids

    constructor(IERC20 token_) {
        _token = token_;
    }

    function createMarket(string calldata title_, string calldata image_, uint closingTime_, bytes32[] memory outcomeNames_) external returns(uint256) {
        _markets.push();
        uint marketId = _markets.length;
        
        Market storage market = _markets[marketId - 1];
        market.title = title_;
        market.image = image_;
        market.numOutcomes = outcomeNames_.length;
        market.closingTime = closingTime_;
        market.creator = msg.sender;
        market.state = MarketState.OPEN;

        for (uint i = 0; i < outcomeNames_.length; i++) {
            MarketOutcome storage outcome = market.outcomes[i];
            outcome.id = i;
            outcome.outcomeName = outcomeNames_[i];
        }

        emit MarketCreated(msg.sender, marketId, title_); 

        return marketId;
    }

    function onApprovalReceived(address sender_, uint256 amount_, bytes calldata data_) external override returns (bytes4) {
        require(amount_ > 0, "Cannot add 0 stake");
        require(sender_ != address(0), "Invalid sender");

        // extract encoded data
        uint256 marketId_;
        uint256 outcomeId_;

        (marketId_, outcomeId_) = abi.decode(data_, (uint256, uint256));

        // validate data received
        require(marketId_ != 0 && marketId_ <= _markets.length, "Invalid market id");
        require(isMarketOpen(marketId_), "Market is not open");

        Market storage market = _markets[marketId_ - 1];
        MarketOutcome storage outcome = market.outcomes[outcomeId_];

        market.totalStake = market.totalStake + amount_;
        outcome.totalStake = outcome.totalStake + amount_;

        // user already has stake?
        uint256 stakeId = outcome.holders[sender_];
        UserStake storage stake;

        if (stakeId == 0) {
            // stake does not exist yet
            _userStakes.push();
            stakeId = _userStakes.length;
            stake = _userStakes[stakeId - 1];
            stake.marketId = marketId_;
            stake.outcomeId = outcomeId_;

            _stakesByUser[sender_].push(stakeId);
            outcome.holders[sender_] = stakeId;
        } else {
            // loading existing stake
            stake = _userStakes[stakeId - 1];
        }
        
        // update stake amount
        stake.amount = stake.amount + amount_;

        _token.safeTransferFrom(
            sender_,
            address(this),
            amount_
        );
        updateBalance();

        emit StakeChanged(stakeId, amount_, marketId_, sender_);

        return this.onApprovalReceived.selector;
    }

    function removeStake(uint256 stakeId_, uint256 amount_) external openMarket(_userStakes[stakeId_ - 1].marketId) returns (uint256) {
        require(amount_ > 0, "Cannot remove 0 stake");

        // TODO There should be no way to reach this error condition:
        // require(amount_ <= _tokenBalance, "Contract does not have enough tokens");

        UserStake storage stake = _userStakes[stakeId_ - 1];

        Market storage market = _markets[stake.marketId - 1];
        MarketOutcome storage outcome = market.outcomes[stake.outcomeId];

        require(stake.amount >= amount_, "Amount exceeds current stake");

        market.totalStake = market.totalStake - amount_;
        outcome.totalStake = outcome.totalStake - amount_;
        stake.amount = stake.amount - amount_;

        _token.safeTransfer(
            msg.sender,
            amount_
        );

        updateBalance();

        emit StakeChanged(stakeId_, amount_, stake.marketId, msg.sender);

        return stake.amount;
    }

    function getMarket(uint256 marketId_) public view returns (string memory, string memory, MarketState, uint256, uint, bytes32[] memory, uint256[] memory) {
        Market storage market = _markets[marketId_ - 1];
        
        bytes32[] memory outcomeNames = new bytes32[](market.numOutcomes);
        uint256[] memory outcomeStakes = new uint256[](market.numOutcomes);

        for (uint i = 0; i < market.numOutcomes; i++) {
            outcomeNames[i] = (market.outcomes[i].outcomeName);
            outcomeStakes[i] = (market.outcomes[i].totalStake);
        }

        MarketState state = market.state;
        if (state == MarketState.OPEN && block.timestamp < market.closingTime) {
            state = MarketState.ENDED;
        }

        return (market.title, market.image, state, market.totalStake, market.closingTime, outcomeNames, outcomeStakes);
    }

    function resolveMarket(uint256 marketId_, uint256 finalOutcomeId_) external {
        Market storage market = _markets[marketId_ - 1];

        require(msg.sender == market.creator, "Only the creator can resolve the market");
        require(market.state == MarketState.OPEN, "Only open markets can be resolved");
        require(block.timestamp > market.closingTime, "Market can only be closed after the specified period");

        market.state = MarketState.RESOLVED;
        market.resolvedAt = block.timestamp;
        market.finalOutcomeId = finalOutcomeId_;
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
        Market storage market = _markets[stake_.marketId - 1];
        MarketOutcome storage outcome = market.outcomes[stake_.outcomeId];

        uint256 totalStake = market.totalStake; 

        uint256 outcomeStake = outcome.totalStake;

        uint256 rewardBucket = totalStake - outcomeStake;

        uint256 finalStake = stake_.amount * rewardBucket / outcomeStake;

        return finalStake;
    }

    function updateBalance() public {
        // Retrieve amount of tokens held in contract
        _tokenBalance = _token.balanceOf(address(this));
    }

    function getMarketIndex() public view returns (uint256) {
        return _markets.length;
    }

    function getStakeId(address holder_, uint256 marketId_, uint256 outcomeId_) public view returns (uint256) {
        return _markets[marketId_ - 1].outcomes[outcomeId_].holders[holder_];
    }

    function getMarketTotalStake(uint256 marketId_) public view returns (uint256) {
        return _markets[marketId_ - 1].totalStake;
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

    function isMarketOpen(uint256 marketId_) public view returns (bool) {
        Market storage market = _markets[marketId_ - 1];
        return 
            market.state == MarketState.OPEN
        &&
            block.timestamp < market.closingTime;
    }

    modifier openMarket(uint256 marketId_) {
        require(isMarketOpen(marketId_));
        _;
    }
}
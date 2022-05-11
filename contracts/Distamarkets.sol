// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract Distamarkets {
    using SafeERC20 for IERC20;

    event MarketCreated(address indexed creator, uint256 indexed marketId, string name);
    event StakeChanged(uint256 indexed stakeId, uint256 amount, uint256 indexed marketId, address indexed user);
    event MarketStateChanged(uint256 indexed marketId, MarketState);

    enum MarketState { OPEN, CLOSED, CANCELED }

    struct Market {
        // market details
        string title;
        string image;
        uint numOutcomes;
        uint256 totalStake;
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

    function createMarket(string calldata title_, string calldata image_, bytes32[] memory outcomeNames_) external returns(uint256) {
        _markets.push();
        uint marketId = _markets.length;
        
        Market storage market = _markets[marketId - 1];
        market.title = title_;
        market.image = image_;
        market.numOutcomes = outcomeNames_.length;
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

    function addStake(uint256 marketId_, uint256 outcomeId_, uint256 amount_) external openMarket(marketId_) returns (uint256) {
        require(amount_ > 0, "Cannot add 0 stake");

        // TODO investigate if the gas cost of next 2 lines are worth the good error message
        uint256 allowedToken = _token.allowance(msg.sender, address(this));
        require(amount_ <= allowedToken, "Approve amount is not high enough");

        Market storage market = _markets[marketId_ - 1];
        MarketOutcome storage outcome = market.outcomes[outcomeId_];

        market.totalStake = market.totalStake + amount_;
        outcome.totalStake = outcome.totalStake + amount_;

        // user already has stake?
        uint256 stakeId = outcome.holders[msg.sender];
        UserStake storage stake;

        if (stakeId == 0) {
            // stake does not exist yet
            _userStakes.push();
            stakeId = _userStakes.length;
            stake = _userStakes[stakeId - 1];
            stake.marketId = marketId_;
            stake.outcomeId = outcomeId_;

            _stakesByUser[msg.sender].push(stakeId);
            outcome.holders[msg.sender] = stakeId;
        } else {
            // loading existing stake
            stake = _userStakes[stakeId - 1];
        }
        
        // update stake amount
        stake.amount = stake.amount + amount_;

        _token.safeTransferFrom(
            msg.sender,
            address(this),
            amount_
        );
        updateBalance();

        emit StakeChanged(stakeId, amount_, marketId_, msg.sender);
        
        return stake.amount;
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

    function getMarket(uint256 marketId_) public view returns (string memory, string memory, MarketState, uint256, bytes32[] memory, uint256[] memory) {
        Market storage market = _markets[marketId_ - 1];
        
        bytes32[] memory outcomeNames = new bytes32[](market.numOutcomes);
        uint256[] memory outcomeStakes = new uint256[](market.numOutcomes);

        for (uint i = 0; i < market.numOutcomes; i++) {
            outcomeNames[i] = (market.outcomes[i].outcomeName);
            outcomeStakes[i] = (market.outcomes[i].totalStake);
        }

        return (market.title, market.image, market.state, market.totalStake, outcomeNames, outcomeStakes);
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

    modifier openMarket(uint256 marketId_) {
        require(_markets[marketId_ - 1].state == MarketState.OPEN);
        _;
    }
}
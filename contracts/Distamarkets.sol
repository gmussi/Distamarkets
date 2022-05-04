// SPDX-License-Identifier: MIT
pragma solidity >=0.8.6;

import "@openzeppelin/contracts/access/Ownable.sol";

contract Distamarkets is Ownable {
    event MarketCreated(address indexed creator, uint256 indexed marketId, string name);
    event StakeAdded(uint256 indexed marketId, uint256 indexed outcomeId, uint256 amount, address indexed user);
    event StakeRemoved(uint256 indexed marketId, uint256 indexed outcomeId, uint256 amount, address indexed user);
    event MarketStateChanged(uint256 indexed marketId, MarketState);

    enum MarketState { OPEN, CLOSED, CANCELED }

    struct Market {
        // market details
        string title;
        uint numOutcomes;
        uint256 totalStake;
        MarketState state;
        address creator;
        mapping(uint256 => MarketOutcome) outcomes;
    }

    struct MarketOutcome {
        // outcome details
        uint256 marketId;
        uint256 id;
        uint256 totalStake;
        bytes32 outcomeName;
        mapping(address => uint256) holders;
    }

    uint256[] marketIds;
    mapping(uint256 => Market) markets;
    uint256 public marketIndex;

    function createMarket(string calldata _title, bytes32[] memory _outcomeNames) external payable returns(uint256) {
        uint256 marketId = marketIndex;
        marketIds.push(marketId);

        Market storage market = markets[marketId];
        market.title = _title;
        market.numOutcomes = _outcomeNames.length;
        market.creator = msg.sender;
        market.state = MarketState.OPEN;

        for (uint i = 0; i < _outcomeNames.length; i++) {
            MarketOutcome storage outcome = market.outcomes[i];
            outcome.marketId = marketId;
            outcome.id = i;
            outcome.outcomeName = _outcomeNames[i];
        }

        marketIndex = marketIndex + 1;

        emit MarketCreated(msg.sender, marketId, _title); 

        return marketId;
    }

    function addStake(uint256 _marketId, uint256 _outcomeId) external payable openMarket(_marketId) returns (uint256) {
        require(msg.value > 0, "Cannot add 0 stake");

        Market storage market = markets[_marketId];
        MarketOutcome storage outcome = market.outcomes[_outcomeId];

        market.totalStake = market.totalStake + msg.value;
        outcome.totalStake = outcome.totalStake + msg.value;
        outcome.holders[msg.sender] = outcome.holders[msg.sender] + msg.value;

        emit StakeAdded(_marketId, _outcomeId, msg.value, msg.sender);
        
        return outcome.holders[msg.sender];
    }

    function removeStake(uint256 _marketId, uint256 _outcomeId, uint256 _amount) external payable openMarket(_marketId) returns (uint256) {
        require(_amount > 0, "Cannot remove 0 stake");

        Market storage market = markets[_marketId];
        MarketOutcome storage outcome = market.outcomes[_outcomeId];

        require(outcome.holders[msg.sender] > _amount, "Amount exceeds current stake");

        market.totalStake = market.totalStake - _amount;
        outcome.totalStake = outcome.totalStake - _amount;
        outcome.holders[msg.sender] = outcome.holders[msg.sender] - _amount;

        payable(msg.sender).transfer(_amount);

        emit StakeRemoved(_marketId, _outcomeId, _amount, msg.sender);

        return outcome.holders[msg.sender];
    }

    function getMarket(uint256 _marketId) public view returns (string memory, bytes32[] memory, MarketState, uint256) {
        Market storage market = markets[_marketId];
        
        bytes32[] memory outcomeNames = new bytes32[](market.numOutcomes);

        for (uint i = 0; i < market.numOutcomes; i++) {
            outcomeNames[i] = (market.outcomes[i].outcomeName);
        }
        return (market.title, outcomeNames, market.state, market.totalStake);
    }

    function getMarketIndex() public view returns (uint256) {
        return marketIndex;
    }

    function getStake(address _holder, uint256 _marketId, uint256 _outcomeId) public view returns (uint256) {
        return markets[_marketId].outcomes[_outcomeId].holders[_holder];
    }

    function getMarketTotalStake(uint256 _marketId) public view returns (uint256) {
        return markets[_marketId].totalStake;
    }

    modifier openMarket(uint256 _marketId) {
        require(markets[_marketId].state == MarketState.OPEN);
        _;
    }
}
// SPDX-License-Identifier: MIT
pragma solidity >=0.8.6;

import "@openzeppelin/contracts/access/Ownable.sol";

contract Distamarkets is Ownable {
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

    Market[] markets;
    UserStake[] userStakes;
    mapping(address => uint256[]) stakesByUser; // User => UserStake Ids

    function createMarket(string calldata _title, string calldata _image, bytes32[] memory _outcomeNames) external returns(uint256) {
        markets.push();
        uint marketId = markets.length;
        
        Market storage market = markets[marketId - 1];
        market.title = _title;
        market.image = _image;
        market.numOutcomes = _outcomeNames.length;
        market.creator = msg.sender;
        market.state = MarketState.OPEN;

        for (uint i = 0; i < _outcomeNames.length; i++) {
            MarketOutcome storage outcome = market.outcomes[i];
            outcome.id = i;
            outcome.outcomeName = _outcomeNames[i];
        }

        emit MarketCreated(msg.sender, marketId, _title); 

        return marketId;
    }

    function addStake(uint256 _marketId, uint256 _outcomeId) external payable openMarket(_marketId) returns (uint256) {
        require(msg.value > 0, "Cannot add 0 stake");

        Market storage market = markets[_marketId - 1];
        MarketOutcome storage outcome = market.outcomes[_outcomeId];

        market.totalStake = market.totalStake + msg.value;
        outcome.totalStake = outcome.totalStake + msg.value;

        // user already has stake?
        uint256 stakeId = outcome.holders[msg.sender];
        UserStake storage stake;

        if (stakeId == 0) {
            // stake does not exist yet
            userStakes.push();
            stakeId = userStakes.length;
            stake = userStakes[stakeId - 1];
            stake.marketId = _marketId;
            stake.outcomeId = _outcomeId;

            stakesByUser[msg.sender].push(stakeId);
            outcome.holders[msg.sender] = stakeId;
        } else {
            // loading existing stake
            stake = userStakes[stakeId - 1];
        }
        
        // update stake amount
        stake.amount = stake.amount + msg.value;

        emit StakeChanged(stakeId, msg.value, _marketId, msg.sender);
        
        return stake.amount;
    }

    function removeStake(uint256 _stakeId, uint256 _amount) external payable openMarket(userStakes[_stakeId - 1].marketId) returns (uint256) {
        require(_amount > 0, "Cannot remove 0 stake");

        UserStake storage stake = userStakes[_stakeId - 1];

        Market storage market = markets[stake.marketId - 1];
        MarketOutcome storage outcome = market.outcomes[stake.outcomeId];

        require(stake.amount >= _amount, "Amount exceeds current stake");

        market.totalStake = market.totalStake - _amount;
        outcome.totalStake = outcome.totalStake - _amount;
        stake.amount = stake.amount - _amount;

        payable(msg.sender).transfer(_amount);

        emit StakeChanged(_stakeId, msg.value, stake.marketId, msg.sender);

        return stake.amount;
    }

    function getMarket(uint256 _marketId) public view returns (string memory, string memory, MarketState, uint256, bytes32[] memory, uint256[] memory) {
        Market storage market = markets[_marketId - 1];
        
        bytes32[] memory outcomeNames = new bytes32[](market.numOutcomes);
        uint256[] memory outcomeStakes = new uint256[](market.numOutcomes);

        for (uint i = 0; i < market.numOutcomes; i++) {
            outcomeNames[i] = (market.outcomes[i].outcomeName);
            outcomeStakes[i] = (market.outcomes[i].totalStake);
        }

        return (market.title, market.image, market.state, market.totalStake, outcomeNames, outcomeStakes);
    }

    function getMarketIndex() public view returns (uint256) {
        return markets.length;
    }

    function getStakeId(address _holder, uint256 _marketId, uint256 _outcomeId) public view returns (uint256) {
        return markets[_marketId - 1].outcomes[_outcomeId].holders[_holder];
    }

    function getMarketTotalStake(uint256 _marketId) public view returns (uint256) {
        return markets[_marketId - 1].totalStake;
    }

    function getUserStakes(address _address) public view returns(uint256[] memory) {
        return stakesByUser[_address];
    }

    function getStake(uint256 stakeId) public view returns(UserStake memory) {
        return userStakes[stakeId - 1];
    }

    modifier openMarket(uint256 _marketId) {
        require(markets[_marketId - 1].state == MarketState.OPEN);
        _;
    }
}
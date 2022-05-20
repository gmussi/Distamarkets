// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "erc-payable-token/contracts/token/ERC1363/IERC1363Spender.sol";

//import "hardhat/console.sol";

/// @title A pot-style betting platform
/// @author Guilherme Mussi <github.com/gmussi>
/// @notice Contract current in MVP stage, being developed in increment steps towards Wallfair Whitepaper
/// @dev On every change, the entire contract should have full coverage and pass linter checks
contract Distamarkets is IERC1363Spender {
    using SafeERC20 for IERC20;

    event MarketCreated(
        bytes32 indexed marketId_,
        address indexed oracle_,
        uint256 indexed closingTime_,
        uint256 numOutcomes_
    );

    event StakeChanged(
        bytes32 indexed marketId,
        uint256 outcomeId_,
        address indexed user,
        uint256 oldBalance,
        uint256 newBalance
    );

    event MarketStateChanged(
        bytes32 indexed marketId,
        MarketState indexed oldState,
        MarketState indexed newState
    );

    enum MarketState {
        OPEN,
        ENDED,
        RESOLVED,
        DISPUTED,
        CLOSED,
        CANCELED
    }

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

    /// @notice This contract is intended to be used with WFAIR token (see README)
    /// @dev The contract operates bets using the specified ERC20 token
    /// @param token_ an ERC20 token
    constructor(IERC20 token_) {
        _token = token_;
    }

    /// @notice This function creates a new market with the specified settings
    /// @dev The marketId should be the hash of the ipfs file containing the metadata of this market
    /// @param marketId_ A unique bytes32 identifying this market
    /// @param oracle_ The address who will be able to resolve this market
    /// @param closingTime_ The time in which this market can be closed
    /// @param numOutcomes_ The number of outcomes this market has
    function createMarket(
        bytes32 marketId_,
        address oracle_,
        uint256 closingTime_,
        uint256 numOutcomes_
    ) external {
        require(
            _markets[marketId_].oracle == address(0),
            "Market already exists"
        );
        require(oracle_ != address(0), "Invalid oracle address");
        require(
            closingTime_ > block.timestamp,
            "Cannot create markets that close on the past"
        );
        require(numOutcomes_ >= 2, "Market needs at least 2 outcomes");

        // Creates a market
        Market storage market = _markets[marketId_];
        market.oracle = oracle_;
        market.creator = msg.sender;
        market.numOutcomes = numOutcomes_;
        market.closingTime = closingTime_;
        market.state = MarketState.OPEN;

        emit MarketCreated(marketId_, oracle_, closingTime_, numOutcomes_);
    }

    /// @notice Use ERC1363 callback to avoid user needing to approve deposit before-hand
    /// @param sender_ The user who made the ERC20 approval
    /// @param amount_ The amount of tokens approved
    /// @param data_ Encoded abi with (bytes32, uint256) for (market id, 0-based outcome index)
    function onApprovalReceived(
        address sender_,
        uint256 amount_,
        bytes calldata data_
    ) external override returns (bytes4) {
        require(amount_ > 0, "Cannot add 0 stake");
        require(sender_ != address(0), "Invalid sender");

        // extract encoded data
        bytes32 marketId_;
        uint256 outcomeId_;
        (marketId_, outcomeId_) = abi.decode(data_, (bytes32, uint256));

        // load market and validate initialization
        Market storage market = _markets[marketId_];
        require(
            market.oracle != address(0),
            "Market not found or not initialized"
        );
        require(isMarketOpen(marketId_), "Market is not open");

        // update indexed values
        market.totalStake = market.totalStake + amount_;
        market.outcomeStakes[outcomeId_] =
            market.outcomeStakes[outcomeId_] +
            amount_;

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

        // make the approved token transfer and update balance
        _token.safeTransferFrom(sender_, address(this), amount_);
        updateBalance();

        emit StakeChanged(
            marketId_,
            outcomeId_,
            sender_,
            oldBalance,
            newBalance
        );

        return this.onApprovalReceived.selector;
    }

    /// @notice Removes a stake (Cashout) from a market. User can remove only part of the stake.
    /// @param stakeId_ The stake id
    /// @param amount_ Amount to be removed
    function removeStake(uint256 stakeId_, uint256 amount_) external {
        require(amount_ > 0, "Cannot remove 0 stake");

        // load stake
        UserStake storage stake = _userStakes[stakeId_ - 1];

        // cannot remove stake from closed market
        require(isMarketOpen(stake.marketId), "Market must be open");

        // users cannot remove more stake then they have
        Market storage market = _markets[stake.marketId];
        require(stake.amount >= amount_, "Amount exceeds current stake");

        // update indexed values
        market.totalStake = market.totalStake - amount_;
        market.outcomeStakes[stake.outcomeId] =
            market.outcomeStakes[stake.outcomeId] -
            amount_;

        uint256 oldBalance = stake.amount;
        uint256 newBalance = stake.amount - amount_;
        stake.amount = newBalance;

        // transfer the tokens to the user
        _token.safeTransfer(msg.sender, amount_);
        updateBalance();

        emit StakeChanged(
            stake.marketId,
            stake.outcomeId,
            msg.sender,
            oldBalance,
            newBalance
        );
    }

    /// @notice Get the stored information of a market
    /// @param marketId_ Id of the market
    function getMarket(bytes32 marketId_)
        public
        view
        returns (
            address,
            address,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            MarketState
        )
    {
        // load market
        Market storage market = _markets[marketId_];

        // ensure the state is correct upon retrieval
        MarketState state = market.state;
        if (state == MarketState.OPEN && block.timestamp < market.closingTime) {
            state = MarketState.ENDED;
        }

        return (
            market.oracle,
            market.creator,
            market.numOutcomes,
            market.closingTime,
            market.resolvedAt,
            market.totalStake,
            market.finalOutcomeId,
            market.state
        );
    }

    /// @notice Set market to the RESOLVED state with the outcome provided
    /// @dev The final outcome provided will define who wins this bet
    /// @param marketId_ Id of the market
    /// @param finalOutcomeId_ 0-based outcome id of the winning outcome
    function resolveMarket(bytes32 marketId_, uint256 finalOutcomeId_)
        external
    {
        Market storage market = _markets[marketId_];

        require(
            msg.sender == market.oracle,
            "Only the oracle can resolve the market"
        );
        require(
            market.state == MarketState.OPEN,
            "Only open markets can be resolved"
        );
        require(
            block.timestamp > market.closingTime,
            "Market can only be closed after the specified period"
        );

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

    /// @notice Calculate the POTENTIAL reward for a stake position in case of a win scenario
    /// @param stakeId_ Id of the stake
    function calculateReward(uint256 stakeId_) external view returns (uint256) {
        UserStake storage stake = _userStakes[stakeId_ - 1];

        return _calculateReward(stake);
    }

    /// @dev Calculates the reward of a stake on a win scenario by dividing the entire pot among the holders
    /// @param stake_ The UserStake to be calculated from
    function _calculateReward(UserStake storage stake_)
        internal
        view
        returns (uint256)
    {
        Market storage market = _markets[stake_.marketId];

        uint256 totalStake = market.totalStake;

        uint256 outcomeStake = market.outcomeStakes[stake_.outcomeId];

        uint256 rewardBucket = totalStake - outcomeStake;

        uint256 finalStake = (stake_.amount * rewardBucket) / outcomeStake;

        return finalStake;
    }

    /// @notice Reloads the token balance for this contract
    function updateBalance() public {
        // Retrieve amount of tokens held in contract
        _tokenBalance = _token.balanceOf(address(this));
    }

    /// @notice Get the id of a stake based on the information provided
    /// @param holder_ the user to retrieve the stake from
    /// @param marketId_ Id of the market
    /// @param outcomeId_ Id of the outcome
    function getStakeId(
        address holder_,
        bytes32 marketId_,
        uint256 outcomeId_
    ) public view returns (uint256) {
        return _markets[marketId_].stakes[outcomeId_][holder_];
    }

    /// @notice Get the total stake (pot) of this market
    /// @param marketId_ Id of the market
    function getMarketTotalStake(bytes32 marketId_)
        public
        view
        returns (uint256)
    {
        return _markets[marketId_].totalStake;
    }

    /// @notice Get all stakes associated with a user
    /// @param address_ Address of user
    function getUserStakes(address address_)
        public
        view
        returns (uint256[] memory)
    {
        return _stakesByUser[address_];
    }

    /// @notice Get the stake information
    /// @param stakeId_ Id of the stake
    function getStake(uint256 stakeId_) public view returns (UserStake memory) {
        return _userStakes[stakeId_ - 1];
    }

    /// @notice This function returns the ERC20 token associated upon contract creation
    function token() public view returns (IERC20) {
        return _token;
    }

    /// @notice This function returns the current token balance of this contract
    function tokenBalance() public view returns (uint256) {
        return _tokenBalance;
    }

    /// @notice This function queries if a market is open
    /// @param marketId_ Id of the market
    function isMarketOpen(bytes32 marketId_) public view returns (bool) {
        Market storage market = _markets[marketId_];
        return
            market.state == MarketState.OPEN &&
            block.timestamp < market.closingTime;
    }
}

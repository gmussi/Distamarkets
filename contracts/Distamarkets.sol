// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "erc-payable-token/contracts/token/ERC1363/IERC1363Spender.sol";

import "hardhat/console.sol";

/// @title A pot-style betting platform
/// @author Guilherme Mussi <github.com/gmussi>
/// @notice Contract current in MVP stage, being developed in increment steps towards Wallfair Whitepaper
/// @dev On every change, the entire contract should have full coverage and pass linter checks
/// @dev TODO check all methods for require msg.sender == oracle
/// @dev TODO validate marketId in all methods
contract Distamarkets is IERC1363Spender {
    using SafeERC20 for IERC20;

    event MarketCreated(
        bytes32 indexed marketId,
        address indexed oracle,
        uint256 indexed closingTime,
        uint256 numOutcomes
    );

    event StakeChanged(
        bytes32 indexed marketId,
        uint256 outcomeId,
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
        uint256 disputeEnd;
        uint256 totalStake;
        uint256 finalOutcomeId;
        uint256 feeCollected;
        MarketState state;
        // outcome index => user => user stake id
        mapping(uint256 => mapping(address => uint256)) stakes;
        mapping(uint256 => uint256) outcomeStakes;
    }

    IERC20 internal immutable _token;
    uint256 internal _tokenBalance;

    // Contract settings (might be updateable later on)
    uint256 _withdrawFeeRatio = 10; // 10% fee
    uint256 _disputeTime = 86400; // 24 hours

    // market id => Market
    mapping(bytes32 => Market) _markets;

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
        require(
            _getMarketState(marketId_) == MarketState.OPEN,
            "Market is not open"
        );

        // update indexed values
        market.totalStake = market.totalStake + amount_;
        market.outcomeStakes[outcomeId_] =
            market.outcomeStakes[outcomeId_] +
            amount_;

        emit StakeChanged(
            marketId_,
            outcomeId_,
            sender_,
            market.stakes[outcomeId_][sender_],
            market.stakes[outcomeId_][sender_] + amount_
        );

        // update stake amount
        market.stakes[outcomeId_][sender_] =
            market.stakes[outcomeId_][sender_] +
            amount_;

        // make the approved token transfer and update balance
        _token.safeTransferFrom(sender_, address(this), amount_);
        updateBalance();

        return this.onApprovalReceived.selector;
    }

    /// @notice Refund the stake from a canceled market
    /// @param marketId_ Id of the market
    /// @param outcomeId_ Id of the outcome
    function refund(bytes32 marketId_, uint256 outcomeId_) external {
        // load market
        Market storage market = _markets[marketId_];

        uint256 balance = market.stakes[outcomeId_][msg.sender];

        // No need to use _calculateState here
        require(
            market.state == MarketState.CANCELED,
            "Market must be canceled"
        );

        // calculate reward to be given
        uint256 feeReward = (balance *
            ((market.feeCollected * 1000) / market.totalStake)) / 1000;

        // transfer amount and extra reward to user
        _token.safeTransfer(msg.sender, balance + feeReward);

        // update amounts
        market.feeCollected = market.feeCollected - feeReward;
        market.totalStake = market.totalStake - (balance + feeReward);
        market.outcomeStakes[outcomeId_] =
            market.outcomeStakes[outcomeId_] -
            balance;
        market.stakes[outcomeId_][msg.sender] = 0;

        emit StakeChanged(marketId_, outcomeId_, msg.sender, balance, 0);
    }

    /// @notice Removes a stake (minus withdraw fee) from a market. User can remove only part of the REPLACE_STAKE_HERE.
    /// @param marketId_ Id of the market
    /// @param outcomeId_ Id of the outcome
    /// @param amount_ Amount to be removed
    function removeStake(
        bytes32 marketId_,
        uint256 outcomeId_,
        uint256 amount_
    ) external {
        require(amount_ > 0, "Cannot remove 0 stake");

        // load market and balance
        Market storage market = _markets[marketId_];
        uint256 oldBalance = market.stakes[outcomeId_][msg.sender];

        // cannot remove stake from closed market
        require(
            _getMarketState(marketId_) == MarketState.OPEN,
            "Market must be open"
        );

        // users cannot remove more stake then they have
        require(oldBalance >= amount_, "Amount exceeds current stake");

        // calculate fees
        uint256 feeAmount = amount_ / _withdrawFeeRatio;
        uint256 amountMinusFee = amount_ - feeAmount;

        // update indexed values (do NOT remove fee)
        market.totalStake = market.totalStake - amountMinusFee;
        market.outcomeStakes[outcomeId_] =
            market.outcomeStakes[outcomeId_] -
            amountMinusFee;
        market.feeCollected = market.feeCollected + feeAmount;

        // update user balance (REMOVE whole amount (with fee) in this case)
        market.stakes[outcomeId_][msg.sender] = oldBalance - amount_;

        // transfer the tokens to the user (MINUS FEE)
        _token.safeTransfer(msg.sender, amountMinusFee);
        updateBalance();

        emit StakeChanged(
            marketId_,
            outcomeId_,
            msg.sender,
            oldBalance,
            oldBalance - amount_
        );
    }

    /// @notice Get the stored information of a market
    /// @param marketId_ Id of the market
    function getMarket(bytes32 marketId_)
        external
        view
        returns (
            address,
            address,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            MarketState state
        )
    {
        // load market
        Market storage market = _markets[marketId_];
        state = _getMarketState(marketId_);
        return (
            market.oracle,
            market.creator,
            market.numOutcomes,
            market.closingTime,
            market.disputeEnd,
            market.totalStake,
            market.finalOutcomeId,
            market.feeCollected,
            state
        );
    }

    /// @notice Allows any user with a stake to dispute the market
    /// @dev in order to save gas fees, user should specify also the outcome
    /// @param marketId_ Id of the market
    /// @param outcomeId_ Id of the outcome
    function disputeMarket(bytes32 marketId_, uint256 outcomeId_) external {
        require(
            _markets[marketId_].stakes[outcomeId_][msg.sender] > 0,
            "No stake for dispute"
        );
        require(
            _getMarketState(marketId_) == MarketState.RESOLVED,
            "Only resolved market can be disputed"
        );

        emit MarketStateChanged(
            marketId_,
            _markets[marketId_].state,
            MarketState.DISPUTED
        );

        _markets[marketId_].state = MarketState.DISPUTED;
    }

    /// @notice Set market to the RESOLVED state with the outcome provided
    /// @dev The final outcome provided here will define who wins this bet
    /// @param marketId_ Id of the market
    /// @param finalOutcomeId_ 0-based outcome id of the winning outcome
    function resolveMarket(bytes32 marketId_, uint256 finalOutcomeId_)
        external
    {
        Market storage market = _markets[marketId_];
        MarketState oldState = _getMarketState(marketId_);

        require(
            msg.sender == market.oracle,
            "Only the oracle can resolve the market"
        );
        require(
            oldState == MarketState.ENDED,
            "Only ended markets can be resolved"
        );

        require(
            block.timestamp > market.closingTime,
            "Dispute period not over"
        );

        market.state = MarketState.RESOLVED;
        market.disputeEnd = block.timestamp + _disputeTime;
        market.finalOutcomeId = finalOutcomeId_;

        emit MarketStateChanged(marketId_, oldState, MarketState.RESOLVED);
    }

    /// @notice This function allows the oracle to close a disputed market
    /// @param marketId_ Id of the market
    /// @param finalOutcomeId_ Final outcome, undisputable
    function closeMarket(bytes32 marketId_, uint256 finalOutcomeId_) external {
        require(
            _getMarketState(marketId_) == MarketState.DISPUTED,
            "Market not in dispute"
        );
        require(msg.sender == _markets[marketId_].oracle, "Sender not oracle");

        emit MarketStateChanged(
            marketId_,
            MarketState.DISPUTED,
            MarketState.CLOSED
        );

        _markets[marketId_].state = MarketState.CLOSED;
        _markets[marketId_].finalOutcomeId = finalOutcomeId_;
    }

    /// @notice This fu_nction sets the market as CANCELED
    /// @dev Check README.md for a breakdown of the rules
    /// @param marketId_ Id of the market
    function cancelMarket(bytes32 marketId_) external {
        MarketState oldState = _getMarketState(marketId_);
        Market storage market = _markets[marketId_];

        // validate the various rules for cancelation
        require(oldState != MarketState.CANCELED, "Market already CANCELED");
        require(
            oldState != MarketState.CLOSED,
            "CLOSED markets can't be canceled anymore"
        );
        require(
            oldState != MarketState.OPEN ||
                (msg.sender == market.creator || msg.sender == market.oracle),
            "Only creator OR oracle can cancel OPEN market"
        );
        require(
            oldState != MarketState.ENDED || msg.sender == market.oracle,
            "Only oracle can cancel ENDED markets"
        );
        require(
            oldState != MarketState.DISPUTED || msg.sender == market.oracle,
            "Only oracle can cancel DISPUTED markets"
        );
        require(
            oldState != MarketState.RESOLVED,
            "Resolved markets cannot be canceled without dispute"
        );

        // set new state as CANCELED
        market.state = MarketState.CANCELED;

        emit MarketStateChanged(marketId_, oldState, MarketState.CANCELED);
    }

    /// @notice This function allows users to withdraw their rewards when event is closed
    /// @dev TODO Update and decrease the outcome stakes in a balanced way
    /// @param marketId_ Id of the market
    /// @param outcomeId_ Id of the outcome
    function withdrawReward(bytes32 marketId_, uint256 outcomeId_) external {
        require(
            _getMarketState(marketId_) == MarketState.CLOSED,
            "Market must be closed"
        );

        uint256 balance = _markets[marketId_].stakes[outcomeId_][msg.sender];
        uint256 balancePlusReward = balance +
            _calculateReward(marketId_, outcomeId_, msg.sender);

        require(balancePlusReward > 0, "No reward to withdraw");

        // transfer reward
        _token.safeTransfer(msg.sender, balancePlusReward);

        // update values
        _markets[marketId_].stakes[outcomeId_][msg.sender] = 0;
        _markets[marketId_].totalStake =
            _markets[marketId_].totalStake -
            balancePlusReward;

        // emit event
        emit StakeChanged(marketId_, outcomeId_, msg.sender, balance, 0);
    }

    /// @notice Calculate the POTENTIAL reward for a stake position in case of a win scenario
    /// @param marketId_ Id of the stake
    /// @param outcomeId_ Id of the outcome
    /// @param user_ Address of the user to query
    function calculateReward(
        bytes32 marketId_,
        uint256 outcomeId_,
        address user_
    ) external view returns (uint256) {
        return _calculateReward(marketId_, outcomeId_, user_);
    }

    /// @dev Calculates the reward of a stake on a win scenario by dividing the entire pot among the holders
    /// @param marketId_ Id of the stake
    /// @param outcomeId_ Id of the outcome
    /// @param user_ Address of the user to query
    function _calculateReward(
        bytes32 marketId_,
        uint256 outcomeId_,
        address user_
    ) internal view returns (uint256 reward) {
        uint256 outcomeStake = _markets[marketId_].outcomeStakes[outcomeId_];

        reward =
            (_markets[marketId_].stakes[outcomeId_][user_] *
                (_markets[marketId_].totalStake - outcomeStake)) /
            outcomeStake;
    }

    /// @notice Reloads the token balance for this contract
    function updateBalance() public {
        // Retrieve amount of tokens held in contract
        _tokenBalance = _token.balanceOf(address(this));
    }

    /// @notice This function returns the stake of the specified user for the specified market and outcome
    /// @param marketId_ Id of the market
    /// @param outcomeId_ Id of the outcome
    /// @param user_ address of the user
    function getStake(
        bytes32 marketId_,
        uint256 outcomeId_,
        address user_
    ) external view returns (uint256) {
        return _markets[marketId_].stakes[outcomeId_][user_];
    }

    /// @notice This function allows market creator to wtihdraw fees from closed market
    /// @param marketId_ Id of the market
    function collectFees(bytes32 marketId_) external {
        require(_getMarketState(marketId_) == MarketState.CLOSED, "Market is not closed");
        
        Market storage market = _markets[marketId_];

    	// additional requirements
        require(market.feeCollected > 0, "No fees to collect");
        require(market.creator == msg.sender, "Must be market creator");

        // transfer the tokens
        _token.safeTransfer(msg.sender, market.feeCollected);

        // updated market
        market.feeCollected = 0;
    }

    /// @notice This function returns the ERC20 token associated upon contract creation
    function token() external view returns (IERC20) {
        return _token;
    }

    /// @notice This function returns the current token balance of this contract
    function tokenBalance() external view returns (uint256) {
        return _tokenBalance;
    }

    /// @notice This function returns the calculated market state
    /// @param marketId_ Id of the market
    function _getMarketState(bytes32 marketId_)
        internal
        view
        returns (MarketState)
    {
        // ensure the state is correct upon retrieval
        Market storage market = _markets[marketId_];
        if (
            market.state == MarketState.OPEN &&
            block.timestamp > market.closingTime
        ) {
            return MarketState.ENDED;
        } else if (
            market.state == MarketState.RESOLVED &&
            block.timestamp > market.disputeEnd
        ) {
            return MarketState.CLOSED;
        }
        return market.state;
    }
}

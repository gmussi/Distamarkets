# Contracts

## WFAIRToken

For more information on WFAIR token, check the [official repository](https://github.com/wallfair-organization/WFAIR-Token).

The `WFAIRToken` is an ERC20 token that uses ERC1363 extentions. 
The ERC20 implementation is provided by OpenZeppelin, and ERC1363 extensions are by https://github.com/vittominacori/erc1363-payable-token.

The extensions are intended for the token to be used within the Wallfair ecosystem, interacting with PLP, Staking, DAO without the need of an additional `approve` transaction.

## Distamarkets (Prototype name)

`Distamarkets` implement many of the functionalities as described by the [Wallfair whitepaper](https://uploads-ssl.webflow.com/61ba8371c8bbe82d0a9cf967/61c49c523f82eb0b156095a7_wallfair-whitepaper.pdf).

The contract allows the following:

1. Create markets
2. Place bets (add stake in outcome) in markets
3. Remove bets from markets early
4. Cancel markets and refunds
5. Resolution of markets and rewards distribution
6. Dispute resolution

## Markets

Markets can be in the following states:

### OPEN

1. Users can add stakes in outcomes
2. Users can remove stakes from outcomes (with fees)
3. Creator OR oracle can cancel the market

### ENDED
Ended is a state of an Open contract whose closing time has passed.

1. Oracle can resolve the market and provide an outcome
2. Oracle can cancel the market

### RESOLVED

1. Before the specified dispute time has passed, users can create a dispute to the resolution
2. After the specified dispute time has passed, oracle can close the contract

### DISPUTED

1. Oracle can close or cancel the contract

### CLOSED

1. Users can withdraw winnings
2. Creator can withdraw the collected fees

### CANCELED

1. Users can withdraw their stakes with collected fees

# Installation

Clone the repository:

`git clone https://github.com/gmussi/Distamarkets.git`

Ensure you have node.js and npm installed. You must be using **npm version >= 7**.

Then install the required packages for the Hardhat toolchain:

`npm install`

Next, try compiling the contracts to see if it has all worked:

`npm run compile`

# Testing
We use the `hardhat waffle` plugin to write tests. Tests can be run using:

`npm run test`

# Coverage
We use solidity-coverage with `npm run coverage`.

# Linter
We use the `hardhat solhint` plugin to check code styling. It can be run with:

`npm run linter`

Alternatively, to guarantee code is in good condition, we use prettify plugin with:

`npx prettier --write 'contracts/**/*.sol'`

# Deploying

TODO

# Paper
To learn more about the utility of the token, read the [litepaper](https://uploads-ssl.webflow.com/61ba8371c8bbe82d0a9cf967/61c49c523f82eb0b156095a7_wallfair-whitepaper.pdf).

# Copyright 
© 2021 Wallfair.
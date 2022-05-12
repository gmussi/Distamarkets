# Contracts

## WFAIRToken

For more information on WFAIR token, check the [official repository](https://github.com/wallfair-organization/WFAIR-Token).

The `WFAIRToken` is an ERC20 token that uses ERC1363 extentions. 
The ERC20 implementation is provided by OpenZeppelin, and ERC1363 extensions are by https://github.com/vittominacori/erc1363-payable-token.

The extensions are intended for the token to be used within the Wallfair ecosystem, interacting with PLP, Staking, DAO without the need of an additional `approve` transaction.

## Distamarkets (Prototype name)

`Distamarkets` implement many of the functionalities as described by the [Wallfair whitepaper](https://uploads-ssl.webflow.com/61ba8371c8bbe82d0a9cf967/61c49c523f82eb0b156095a7_wallfair-whitepaper.pdf).

The contract allows the following:

1. Creating a market by calling the `createMarket` method.
2. Allow users to stake tokens in an outcome of a market by using `approveAndCall` on the WFAIR token contract.
3. Allow users to remove stake from an outcome and get their tokens refunded.
4. Allow market creators and arbiters to cancel and resolve markets.
5. Allow users to dispute resolve markets before the limit time.
6. Allow a stake-and-slash voting style for dispute resolution in markets.

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

# Deploying

TODO

# Paper
To learn more about the utility of the token, read the [litepaper](https://uploads-ssl.webflow.com/61ba8371c8bbe82d0a9cf967/61c49c523f82eb0b156095a7_wallfair-whitepaper.pdf).

# Copyright 
© 2021 Wallfair.
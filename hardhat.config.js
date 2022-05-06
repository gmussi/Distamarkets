/**
 * @type import('hardhat/config').HardhatUserConfig
 */
require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-etherscan");
require('hardhat-gas-reporter');
require('solidity-coverage')
require('dotenv').config();

module.exports = {
  solidity: {
    version: '0.8.7',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },

  networks: {
    ropsten: {
      url: process.env.ROPSTEN_URL,
      accounts: [process.env.PKEY],
    }
  },

  etherscan: {
    apiKey: {
      ropsten: process.env.ETHERSCAN_API_KEY
    }
  }
};

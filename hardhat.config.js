/**
 * @type import('hardhat/config').HardhatUserConfig
 */
require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-etherscan");
require('dotenv').config();

module.exports = {
  solidity: "0.8.6",

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

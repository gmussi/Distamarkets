import { HardhatUserConfig } from "hardhat/config";

import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-solhint";
import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "hardhat-contract-sizer";
import "hardhat-gas-reporter";
import "solidity-coverage";
import * as dotenv from "dotenv";

dotenv.config();

const {
  ROPSTEN_API_URL,
  RINKEBY_API_URL,
  GOERLI_API_URL,
  MAINNET_API_URL,
  MUMBAI_API_URL,
  MATIC_API_URL,
  ROPSTEN_PRIVATE_KEY,
  RINKEBY_PRIVATE_KEY,
  GOERLI_PRIVATE_KEY,
  MAINNET_PRIVATE_KEY,
  MUMBAI_PRIVATE_KEY,
  MATIC_PRIVATE_KEY,
  KOVAN_API_URL,
  KOVAN_PRIVATE_KEY,
  ETHERSCAN_API_KEY,
  POLYGONSCAN_API_KEY,
  CMC_API_KEY
} = process.env;

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.7',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  
  defaultNetwork: 'hardhat',

  networks: {
    hardhat: {
      chainId: 1337,
    },
    localhost: {
      url: 'http://127.0.0.1:8545',
      // override chain ID to allow MetaMask to connect to localhost:8545
      // see https://hardhat.org/metamask-issue.html
      chainId: 1337,
    },
    mainnet: {
      url: MAINNET_API_URL,
      chainId: 1,
      gasPrice: 80000000000, // 120gwei
      accounts: [MAINNET_PRIVATE_KEY!],
    },
    rinkeby: {
      url: RINKEBY_API_URL,
      chainId: 4,
      gas: 'auto',
      gasPrice: 2000000000, // 2 gwei
      accounts: [RINKEBY_PRIVATE_KEY!],
    },
    ropsten: {
      url: ROPSTEN_API_URL,
      accounts: [ROPSTEN_PRIVATE_KEY!],
    },
    goerli: {
      url: GOERLI_API_URL,
      chainId: 5,
      // gas: "auto",
      gasPrice: 1000000000, // 1 gwei
      accounts: [GOERLI_PRIVATE_KEY!],
    },
    kovan: {
      url: KOVAN_API_URL,
      gas: 'auto',
      gasPrice: 1000000000, // 1 gwei
      accounts: [KOVAN_PRIVATE_KEY!],
    },
    matic: {
      url: MATIC_API_URL,
      accounts: [MATIC_PRIVATE_KEY!],
    },
    mumbai: {
      url: MUMBAI_API_URL,
      gasPrice: 30000000000, // 1 gwei
      accounts: [MUMBAI_PRIVATE_KEY!],
    }
  },

  etherscan: {
    apiKey: {
      mainnet: ETHERSCAN_API_KEY,
      ropsten: ETHERSCAN_API_KEY,
      kovan: ETHERSCAN_API_KEY,
      goerli: ETHERSCAN_API_KEY,
      rinkeby: ETHERSCAN_API_KEY,

      polygon: POLYGONSCAN_API_KEY,
      polygonMumbai: POLYGONSCAN_API_KEY
    }
  },

  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: true,
    strict: true,
    except: ["WFAIRToken.sol"],
  },

  gasReporter: {
    currency: 'EUR',
    coinmarketcap: CMC_API_KEY
  },

  typechain: {
    outDir: "build/types",
    target: "ethers-v5",
    alwaysGenerateOverloads: false,
  },
};

export default config;
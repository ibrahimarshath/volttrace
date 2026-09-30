import type { HardhatUserConfig } from "hardhat/config";
import hardhatToolbox from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import hardhatKeystore from "@nomicfoundation/hardhat-keystore";
import { configVariable } from "hardhat/config";

const config: HardhatUserConfig = {
  plugins: [hardhatToolbox, hardhatKeystore],
  solidity: {
    profiles: {
      default: {
        version: "0.8.24",
        settings: {
          evmVersion: "cancun",
        },
      },
      production: {
        version: "0.8.24",
        settings: {
          evmVersion: "cancun",
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    sepolia: {
      type: "http",
      url: "https://ethereum-sepolia-rpc.publicnode.com",
      accounts: [configVariable("PRIVATE_KEY")],
    },
  },
  etherscan: {
    apiKey: configVariable("ETHERSCAN_API_KEY"),
  },
};

export default config;
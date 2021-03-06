/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */

import { ethers } from "ethers";
import {
  FactoryOptions,
  HardhatEthersHelpers as HardhatEthersHelpersBase,
} from "@nomiclabs/hardhat-ethers/types";

import * as Contracts from ".";

declare module "hardhat/types/runtime" {
  interface HardhatEthersHelpers extends HardhatEthersHelpersBase {
    getContractFactory(
      name: "ERC20",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.ERC20__factory>;
    getContractFactory(
      name: "IERC20Metadata",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.IERC20Metadata__factory>;
    getContractFactory(
      name: "IERC20",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.IERC20__factory>;
    getContractFactory(
      name: "ERC165",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.ERC165__factory>;
    getContractFactory(
      name: "IERC165",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.IERC165__factory>;
    getContractFactory(
      name: "Distamarkets",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.Distamarkets__factory>;
    getContractFactory(
      name: "WFAIRToken",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.WFAIRToken__factory>;
    getContractFactory(
      name: "ERC1363",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.ERC1363__factory>;
    getContractFactory(
      name: "IERC1363",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.IERC1363__factory>;
    getContractFactory(
      name: "IERC1363Receiver",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.IERC1363Receiver__factory>;
    getContractFactory(
      name: "IERC1363Spender",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.IERC1363Spender__factory>;

    getContractAt(
      name: "ERC20",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.ERC20>;
    getContractAt(
      name: "IERC20Metadata",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.IERC20Metadata>;
    getContractAt(
      name: "IERC20",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.IERC20>;
    getContractAt(
      name: "ERC165",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.ERC165>;
    getContractAt(
      name: "IERC165",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.IERC165>;
    getContractAt(
      name: "Distamarkets",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.Distamarkets>;
    getContractAt(
      name: "WFAIRToken",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.WFAIRToken>;
    getContractAt(
      name: "ERC1363",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.ERC1363>;
    getContractAt(
      name: "IERC1363",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.IERC1363>;
    getContractAt(
      name: "IERC1363Receiver",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.IERC1363Receiver>;
    getContractAt(
      name: "IERC1363Spender",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.IERC1363Spender>;

    // default types
    getContractFactory(
      name: string,
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<ethers.ContractFactory>;
    getContractFactory(
      abi: any[],
      bytecode: ethers.utils.BytesLike,
      signer?: ethers.Signer
    ): Promise<ethers.ContractFactory>;
    getContractAt(
      nameOrAbi: string | any[],
      address: string,
      signer?: ethers.Signer
    ): Promise<ethers.Contract>;
  }
}

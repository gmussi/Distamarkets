// SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;

import "erc-payable-token/contracts/token/ERC1363/ERC1363.sol";

contract WFAIRToken is ERC1363 {
    // create WFAIR token instance and immediately mint all tokens, no further minting will be possible
    constructor(uint256 totalSupply_) ERC20("WFAIR Token", "WFAIR") {
        _mint(msg.sender, totalSupply_);
    }
}
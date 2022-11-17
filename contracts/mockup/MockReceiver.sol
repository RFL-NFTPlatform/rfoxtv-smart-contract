// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface INFT {
  function withdraw(address tokenSale) external;
  function transferOwnership(address owner) external;
}

contract MockReceiver {
  address public NFT;

  constructor(address _NFT) {
    NFT = _NFT;
  }

  function withdraw() external {
    INFT(NFT).withdraw(address(0));
  }

  function transferBackOwnership(address owner) external {
    INFT(NFT).transferOwnership(owner);
  }
}
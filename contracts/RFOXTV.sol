// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "erc721a/contracts/extensions/ERC721ABurnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract RFOXTV is ERC721ABurnable, Ownable {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    mapping(bytes => bool) usedSignature;

    /// mapped external id => tokenId
    mapping(bytes32 => uint256) public externalID;

    /// mapped external id => usedExternalId (bool)
    mapping(bytes32 => bool) public usedExternalID;

    address public authorizedSignerAddress;

    // Override the base token URI
    string private _baseURIPrefix;

    // NFTs Price
    uint256 public tokenPrice;

    // NFTs sale's currency
    IERC20 public saleToken;

    /** EVENT */
    event SetExternalID(uint256 indexed tokenId, bytes32 indexed externalId);
    event AuthorizedSignerAddress(address indexed sender, address oldAddress, address newAddress);
    event UpdateURI(address indexed sender, string oldURI, string newURI);
    event UpdatePriceSettings(
        IERC20 oldSaleToken,
        uint256 oldTokenPrice,
        IERC20 newSaleToken,
        uint256 newTokenPrice
    );
    event Withdraw(address indexed sender, address saleToken, uint256 totalWithdrawn);

    modifier checkUsedSignature(bytes calldata signature) {
        require(!usedSignature[signature], "Signature has been used");
        _;
    }

    constructor(
        string memory name_,
        string memory symbol_,
        address authorizedSigner_,
        IERC20 saleToken_,
        uint256 tokenPrice_
    ) ERC721A(name_, symbol_) {
        authorizedSignerAddress = authorizedSigner_;
        updatePriceSettings(saleToken_, tokenPrice_);

        emit AuthorizedSignerAddress(msg.sender, address(0), authorizedSignerAddress);
    }

    /**
     * @dev Only owner can migrate base URI
     *
     * @param newBaseURIPrefix string prefix of start URI
     */
    function setBaseURI(string memory newBaseURIPrefix) external onlyOwner {
        string memory _oldUri = _baseURIPrefix;
        _baseURIPrefix = newBaseURIPrefix;
        emit UpdateURI(msg.sender, _oldUri, _baseURIPrefix);
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseURIPrefix;
    }

    /**
     * @dev Getter for the base URI.
     *
     * @return Base URI of the NFT.
     */
    function baseURI() external view returns (string memory) {
        return _baseURI();
    }

    /**
     * @dev Owner can safe mint to address.
     * Limited to only 1 token per minting.
     *
     * @param to Receiver address.
     */

    /// @param to Address of receiver
    function safeMint(
        address to,
        uint256 totalMint,
        bytes32[] memory externalId,
        uint256 salt,
        bytes calldata signature
    ) external payable checkUsedSignature(signature) {
        require(
            _isValidSignature(
                keccak256(abi.encodePacked(msg.sender, keccak256(abi.encodePacked(externalId)), address(this), salt)),
                signature
            ),
            "Invalid signature"
        );
        require(externalId.length == totalMint, "ERR_MISSMATCH_COUNT_TOTALMINT");

        uint256 previousIndex = _currentIndex;
        uint256 counter;
        uint256 tempTokenId;
        bytes32 tempExternalId;

        if (address(saleToken) == address(0)) {
            require(msg.value == tokenPrice * totalMint, "Invalid eth for purchasing");
        } else {
            require(msg.value == 0, "ETH_NOT_ALLOWED");

            saleToken.safeTransferFrom(msg.sender, address(this), tokenPrice * totalMint);
        }

        _safeMint(to, totalMint);

        for (uint256 i = previousIndex; i < _currentIndex; i++) {
            tempTokenId = i;
            tempExternalId = externalId[counter];

            require(tempExternalId != 0 && usedExternalID[tempExternalId] == false, "INVALID_EXTERNAL_ID");

            externalID[tempExternalId] = tempTokenId;
            usedExternalID[tempExternalId] = true;
            counter++;
            emit SetExternalID(tempTokenId, tempExternalId);
        }

        usedSignature[signature] = true;
    }

    /**
     * @dev Verify hashed data.
     * param hash Hashed data bundle
     * @param signature Signature to check hash against
     * @return bool Is signature valid or not
     */
    function _isValidSignature(bytes32 hash, bytes memory signature) internal view returns (bool) {
        require(authorizedSignerAddress != address(0), "Invalid signer addr");
        bytes32 signedHash = hash.toEthSignedMessageHash();
        return signedHash.recover(signature) == authorizedSignerAddress;
    }

    /**
     * @dev Update the authorized signer address.
     *
     * @param signerAddress new authorized signer address.
     */
    function changeAuthorizedSignerAddress(address signerAddress) public onlyOwner {
        require(signerAddress != address(0), "ERR_ZERO_ADDRESS");
        address oldSignerAddress = authorizedSignerAddress;
        authorizedSignerAddress = signerAddress;
        emit AuthorizedSignerAddress(msg.sender, oldSignerAddress, signerAddress);
    }

    /**
     * @dev Update the token price.
     *
     * @param newTokenPrice The new token price.
     */
    function updatePriceSettings(IERC20 newSaleToken, uint256 newTokenPrice) public onlyOwner {
        IERC20 oldSaleToken = saleToken;
        uint256 oldTokenPrice = tokenPrice;

        tokenPrice = newTokenPrice;
        saleToken = newSaleToken;
        emit UpdatePriceSettings(oldSaleToken, oldTokenPrice, saleToken, tokenPrice);
    }

    /**
     * @dev Owner withdraw revenue from Sales
     *
     * @param token_ token address to be withdrawn.
     */
    function withdraw(IERC20 token_) external onlyOwner {
        uint256 balance;
        if (address(token_) == address(0)) {
            balance = address(this).balance;
            (bool succeed, ) = msg.sender.call{ value: balance }("");
            require(succeed, "Failed to withdraw Ether");
        } else {
            balance = token_.balanceOf(address(this));
            token_.safeTransfer(msg.sender, balance);
        }

        emit Withdraw(msg.sender, address(token_), balance);
    }
}

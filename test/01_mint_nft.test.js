const { expect } = require("chai");
const { ethers } = require("hardhat");
const { expectRevert, constants, BN } = require("@openzeppelin/test-helpers");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");


const salt = 1234567;
let globalContractAddress;

const getSignature = async function (senderAddress, privKey, externalIds, newSalt = null) {
  let _salt = newSalt ? newSalt : salt
  let hashExternalIds = ethers.utils.keccak256(ethers.utils.solidityPack(['bytes32[]'], [externalIds]))
  
  const hashMsg = web3.utils.soliditySha3(senderAddress, hashExternalIds, globalContractAddress, _salt);
  const signature = await web3.eth.accounts.sign(hashMsg, privKey);
  return signature;
}

describe("RFOXTV", function () {
  let nft, signerAccount, signerPrivKey, signerAddress;
  let localTotalSupply = new BN(0);
  const name = "RFOXTV";
  const symbol = "RFOXTV";
  const wei = web3.utils.toWei;
  const tokenPrice = wei("1", "ether");

  before(async () => {
    [owner, bob, jane, sara] = await ethers.getSigners();
    const mockTokenSupply = wei("100000000", "ether");

    signerAccount = await web3.eth.accounts.create();
    signerPrivKey = signerAccount.privateKey;
    signerAddress = signerAccount.address;

    const RFOXTVNFT = await ethers.getContractFactory("RFOXTV");
    const MockToken = await ethers.getContractFactory("MockERC20");
    mockToken = await MockToken.deploy();
    await mockToken.deployed()

    nft = await RFOXTVNFT.deploy(name, symbol, ZERO_ADDRESS, mockToken.address, tokenPrice);
    await nft.deployed();

    globalContractAddress = nft.address;

    await mockToken.approve(nft.address, mockTokenSupply);
  })

  it("Check NFT name", async () => {
    expect(await nft.name()).to.equal(name);
  })

  it("Check NFT symbol", async () => {
    expect(await nft.symbol()).to.equal(symbol);
  })

  it("Initial total supply should be 0", async () => {
    expect((await nft.totalSupply()).toString()).to.equal("0");
  })

  it("Mint nft should revert if signer address has not been set", async () => {
    const localExternalId = ethers.utils.formatBytes32String("ID1");
    await expectRevert (nft.safeMint(owner.address, 1, [localExternalId], salt, constants.ZERO_BYTES32), "Invalid signer addr");
  })

  it("Update price settings should fail if called by non-owner", async () => {
  await expectRevert(nft.connect(sara).updatePriceSettings(ZERO_ADDRESS, tokenPrice), "Ownable: caller is not the owner");
  })

  it("Update signer address", async () => {
    await expectRevert(nft.changeAuthorizedSignerAddress(constants.ZERO_ADDRESS), "ERR_ZERO_ADDRESS");
    await expectRevert(nft.connect(sara).changeAuthorizedSignerAddress(sara.address), "Ownable: caller is not the owner");
    await nft.changeAuthorizedSignerAddress(signerAddress);
    expect(await nft.authorizedSignerAddress()).to.equal(signerAddress);
  })

  it("Mint nft should revert if given wrong signature", async () => {
    const localExternalId = ethers.utils.formatBytes32String("ID1");
    const sign = (await getSignature(bob.address, signerPrivKey, [localExternalId]));
    await expectRevert (nft.safeMint(owner.address, 1, [localExternalId], salt, sign.signature), "Invalid signature");
  })

  it("Mint nft should revert if given right signature but wrong salt", async () => {
    const localExternalId = ethers.utils.formatBytes32String("ID1");
    const sign = (await getSignature(owner.address, signerPrivKey, [localExternalId]));
    const wrongSalt = Math.floor(Date.now());
    await expectRevert (nft.safeMint(owner.address, 1, [localExternalId], wrongSalt, sign.signature), "Invalid signature");
  })

  it("Mint nft should revert if given mismatch length between external id and the total mint", async () => {
    const localExternalId = ethers.utils.formatBytes32String("ID1");
    const sign = (await getSignature(owner.address, signerPrivKey, [localExternalId]));
    await expectRevert (nft.safeMint(owner.address, 2, [localExternalId], salt, sign.signature), "ERR_MISSMATCH_COUNT_TOTALMINT");
    const newSalt = 123;
    const sign2 = (await getSignature(owner.address, signerPrivKey, [localExternalId,localExternalId], newSalt));
    await expectRevert (nft.safeMint(owner.address, 1, [localExternalId,localExternalId], newSalt, sign2.signature), "ERR_MISSMATCH_COUNT_TOTALMINT");
  })

  it("Mint nft should revert if token erc20 balance is insufficient", async () => {
    const localExternalId = ethers.utils.formatBytes32String("ID1");
    const sign = (await getSignature(sara.address, signerPrivKey, [localExternalId]));
    await expectRevert (nft.connect(sara).safeMint(owner.address, 1, [localExternalId], salt, sign.signature), "ERC20: insufficient allowance");
  })

  it("Mint nft should revert if try to send ETH if the tokenSale is erc20", async () => {
    const localExternalId = ethers.utils.formatBytes32String("ID1");
    const sign = (await getSignature(sara.address, signerPrivKey, [localExternalId]));
    await expectRevert (nft.connect(sara).safeMint(owner.address, 1, [localExternalId], salt, sign.signature, {value: tokenPrice}), "ETH_NOT_ALLOWED");
  })

  it("Mint nft should revert if eth sent not match with the price)", async () => {
    const localExternalId = ethers.utils.formatBytes32String("ID1");
    const sign = (await getSignature(owner.address, signerPrivKey, [localExternalId]));

    await nft.updatePriceSettings(ZERO_ADDRESS, tokenPrice);
    expect(await nft.saleToken()).to.equal(ZERO_ADDRESS);
    expect( (await nft.tokenPrice()).toString() ).to.equal(tokenPrice);

    await expectRevert (nft.safeMint(owner.address, 1, [localExternalId], salt, sign.signature, {value: wei("0.5", "ether")}), "Invalid eth for purchasing");

    await nft.updatePriceSettings(mockToken.address, tokenPrice);
    expect(await nft.saleToken()).to.equal(mockToken.address);
    expect( (await nft.tokenPrice()).toString() ).to.equal(tokenPrice);
    expect( await nft.usedExternalID(localExternalId)).to.equal(false);
  })

  it("Mint nft should revert if using zero externalID", async () => {
    const totalMint = new BN(1);
    const sign = (await getSignature(owner.address, signerPrivKey, [constants.ZERO_BYTES32]));
    await expectRevert(nft.safeMint(owner.address, totalMint.toString(), [constants.ZERO_BYTES32], salt, sign.signature), "INVALID_EXTERNAL_ID");
    expect( await nft.usedExternalID(constants.ZERO_BYTES32)).to.equal(false);
  })
  
  it("Mint nft", async () => {
    const totalMint = new BN(1);
    const localExternalId = ethers.utils.formatBytes32String("ID1");
    const sign = (await getSignature(owner.address, signerPrivKey, [localExternalId]));
    await  nft.safeMint(owner.address, totalMint.toString(), [localExternalId], salt, sign.signature);
    localTotalSupply = localTotalSupply.add(totalMint);
    expect( (await nft.totalSupply()).toString() ).to.equal(localTotalSupply.toString())
    expect( (await nft.externalID(localExternalId)).toString() ).to.equal("0");
    expect( await nft.usedExternalID(localExternalId)).to.equal(true);
    await expectRevert(nft.safeMint(owner.address, totalMint.toString(), [localExternalId], salt, sign.signature), "Signature has been used");
  })

  it("Mint nft should revert if externalID has been set", async () => {
    const totalMint = new BN(1);
    const localExternalId = ethers.utils.formatBytes32String("ID1");
    const newSalt = Math.floor(Date.now());
    const sign = (await getSignature(owner.address, signerPrivKey, [localExternalId], newSalt));
    await expectRevert(nft.safeMint(owner.address, totalMint.toString(), [localExternalId], newSalt, sign.signature), "INVALID_EXTERNAL_ID");
  })

  it("Mint nft more than 1 from different user", async() => {
    const totalMint = new BN(3);
    const localExternalId = [ethers.utils.formatBytes32String("ID2"),ethers.utils.formatBytes32String("ID3"),ethers.utils.formatBytes32String("ID4")]
    const newSalt = Math.floor(Date.now());
    const oldLocalTotalSupply = localTotalSupply;
    const sign = (await getSignature(owner.address, signerPrivKey, localExternalId, newSalt));
    await  nft.safeMint(owner.address, totalMint.toString(), localExternalId, newSalt, sign.signature);
    localTotalSupply = localTotalSupply.add(totalMint);
    expect( (await nft.totalSupply()).toString() ).to.equal(localTotalSupply.toString())

    for(let i = 0; i < 3; i++) {
      expect( (await nft.externalID(localExternalId[i])).toString() ).to.equal( (oldLocalTotalSupply.add(new BN(i))).toString() );
      expect( await nft.usedExternalID(localExternalId[i])).to.equal(true);
    }
  })

  it("Update base URI", async function () {
    await expectRevert(nft.connect(bob).setBaseURI("updatedLink"), "Ownable: caller is not the owner");
    await nft.setBaseURI("updatedLink");
    expect(await nft.tokenURI(0)).to.equal("updatedLink0");
    expect(await nft.baseURI()).to.equal("updatedLink");
  })

  it("Withdraw eth", async function() {
    await nft.updatePriceSettings(ZERO_ADDRESS, tokenPrice);
    

    // Should failed if eth transfer failed
    const MockReceiver = await ethers.getContractFactory("MockReceiver")
    const receiverContract = await MockReceiver.deploy(nft.address);
    await receiverContract.deployed();

    expect(await receiverContract.NFT()).to.equal(nft.address);
    await nft.transferOwnership(receiverContract.address);
    expect(await nft.owner()).to.equal(receiverContract.address);
    await expectRevert(receiverContract.withdraw(), "Failed to withdraw Ether");
    await receiverContract.transferBackOwnership(owner.address);
    expect(await nft.owner()).to.equal(owner.address)
    // end eth transfer failed
    
    const totalMint = new BN(1);
    const newSalt = Math.floor(Date.now());
    const localExternalId = ethers.utils.formatBytes32String("IDETH1");
    const sign = (await getSignature(owner.address, signerPrivKey, [localExternalId], newSalt));
    await  nft.safeMint(owner.address, totalMint.toString(), [localExternalId], newSalt, sign.signature, {value: tokenPrice});
    localTotalSupply = localTotalSupply.add(totalMint);
    expect( (await nft.totalSupply()).toString() ).to.equal(localTotalSupply.toString())
    expect( (await nft.externalID(localExternalId)).toString() ).to.equal("4");
    await expectRevert(nft.safeMint(owner.address, totalMint.toString(), [localExternalId], salt, sign.signature), "Signature has been used");
    expect( await nft.usedExternalID(localExternalId)).to.equal(true);

    // set back to mock token as payment
    await nft.updatePriceSettings(mockToken.address, tokenPrice);
    
    // Withdraw eth
    // Should fail if call by non-owner
    await expectRevert(nft.connect(sara).withdraw(ZERO_ADDRESS), "Ownable: caller is not the owner")

    const previousOwnerETHBalance = new BN(await web3.eth.getBalance(owner.address))
    const rawTx = await nft.withdraw(ZERO_ADDRESS);
    const tx = await rawTx.wait();

    const gasPrice = tx.effectiveGasPrice;
    const txFee = new BN(tx.gasUsed.mul(gasPrice).toString());
    const latestOwnerETHBalance = new BN(await web3.eth.getBalance(owner.address))
    expect( (previousOwnerETHBalance.add(new BN(tokenPrice))).sub(txFee).toString() ).to.equal(latestOwnerETHBalance.toString(), "Mismatch owner balance")
  })

  it("Withdraw erc20", async function () {
    let nftERC20Balance = await mockToken.balanceOf(nft.address)
    let previousOwnerERC20Balance = await mockToken.balanceOf(owner.address)
    nft.withdraw(mockToken.address)
    let latestOwnerERC20Balance = await mockToken.balanceOf(owner.address)
    expect( (previousOwnerERC20Balance.add(nftERC20Balance)).toString() ).to.equal(latestOwnerERC20Balance.toString(), "Mismatch owner balance")
  })
});

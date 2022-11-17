const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");

module.exports = async ({getNamedAccounts, deployments}) => {
  const {deploy} = deployments;
  const {deployer} = await getNamedAccounts();
  const tokenPrice = "10000000000000000" // 0.01 ether
  console.log(deployer)
  await deploy('RFOXTV', {
    from: deployer,
    args: ["TVTEST", "TVTEST", "0x6BbaF8dE2Da04d5F9933a9AdC2fC40fD125C0a6b", ZERO_ADDRESS, tokenPrice],
    log: true,
  });
};
module.exports.tags = ['RFOXTV'];

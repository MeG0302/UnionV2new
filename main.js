require('dotenv').config();
const { ethers } = require("ethers");
const fs = require("fs");
const usdcAbi = require("./abis/usdc.json");
const bridgeAbi = require("./abis/bridge.json");

const SEPOLIA_USDC_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const SEPOLIA_BRIDGE_ADDRESS = "0x5FbE74A283f7954f10AA04C2eDf55578811aeb03";

const sepoliaProvider = new ethers.providers.JsonRpcProvider("https://ethereum-sepolia.publicnode.com");

async function bridgeUSDC(wallet, maxTransaction = 1) {
  const address = await wallet.getAddress();
  const usdc = new ethers.Contract(SEPOLIA_USDC_ADDRESS, usdcAbi, wallet);
  const bridge = new ethers.Contract(SEPOLIA_BRIDGE_ADDRESS, bridgeAbi, wallet);

  const decimals = await usdc.decimals();
  const balance = await usdc.balanceOf(address);
  if (balance.eq(0)) {
    console.log(`No USDC balance for ${address}`);
    return;
  }

  const babyWallets = JSON.parse(fs.readFileSync("./babylon-wallets.json", "utf8"));
  const babyAddress = babyWallets[address.toLowerCase()];

  if (!babyAddress) {
    console.log(`No Babylon address mapped for ${address}`);
    return;
  }

  const allowance = await usdc.allowance(address, SEPOLIA_BRIDGE_ADDRESS);
  if (allowance.lt(balance)) {
    const approveTx = await usdc.approve(SEPOLIA_BRIDGE_ADDRESS, balance);
    await approveTx.wait();
    console.log(`Approved USDC for bridging from ${address}`);
  }

  const transferTx = await bridge.transferToBabylon(SEPOLIA_USDC_ADDRESS, balance, babyAddress);
  await transferTx.wait();
  console.log(`Bridged ${ethers.utils.formatUnits(balance, decimals)} USDC from ${address} to ${babyAddress} on Babylon.`);
}

module.exports = {
  bridgeUSDCToBabylon: bridgeUSDC
};

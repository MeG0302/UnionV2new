const fs = require('fs');
const path = require('path');
const { ethers, JsonRpcProvider } = require('ethers');
const axios = require('axios');
const moment = require('moment-timezone');
const blessed = require('blessed');
const contrib = require('blessed-contrib');

// Babylon-specific constants
const BABYLON_USDC_ADDRESS = 'bbn1zsrv23akkgxdnwul72sftgv2xjt5khsnt3wwjhp0ffh683hzp5aq5a0h6n';
const BABYLON_CHANNEL_ID = 7; // Updated to match input data
const BABYLON_RPC_URL = 'https://rpc.testnet-5.babylon.union.build';
const BABYLON_WALLET_FILE = path.join(__dirname, 'baby_wallet.json');

// Helper function for random USDC amounts
function getRandomUSDCAmount() {
  const min = 0.007;
  const max = 0.04;
  return (Math.random() * (max - min) + min).toFixed(6);
}

// Create screen and UI components
const screen = blessed.screen({
  smartCSR: true,
  title: 'Union Testnet Auto Bot - MeG'
});

const grid = new contrib.grid({
  rows: 12,
  cols: 12,
  screen: screen
});

// [Previous UI component setup remains exactly the same...]

async function sendFromWallet(walletInfo, maxTransaction, transferType, destination) {
  const wallet = new ethers.Wallet(walletInfo.privatekey, provider());
  logger.loading(`Sending from ${wallet.address} (${walletInfo.name || 'Unnamed'}) to ${destination}`);

  // Load Babylon wallets if destination is Babylon
  let babylonWallets = [];
  if (destination === 'babylon') {
    if (!fs.existsSync(BABYLON_WALLET_FILE)) {
      logger.error(`baby_wallet.json not found at ${BABYLON_WALLET_FILE}`);
      await delay(5000);
      process.exit(1);
    }
    try {
      babylonWallets = require(BABYLON_WALLET_FILE).wallets;
      if (!babylonWallets || !Array.isArray(babylonWallets)) {
        throw new Error("Invalid baby_wallet.json format");
      }
    } catch (err) {
      logger.error(`Error loading baby_wallet.json: ${err.message}`);
      await delay(5000);
      process.exit(1);
    }
  }

  let shouldProceed = false;
  let tokenName = '';
  let tokenAddress = '';
  let tokenAbi = [];
  let channelId = 0;

  if (transferType === 'usdc') {
    tokenName = 'USDC';
    tokenAddress = USDC_ADDRESS;
    tokenAbi = USDC_ABI;
    channelId = destination === 'babylon' ? BABYLON_CHANNEL_ID : 8;
    shouldProceed = await checkBalanceAndApprove(wallet, tokenAddress, tokenAbi, contractAddress, tokenName);
  } else if (transferType === 'weth') {
    // [Previous WETH logic remains exactly the same...]
  }

  if (!shouldProceed) return;

  const contract = new ethers.Contract(contractAddress, UCS03_ABI, wallet);
  const addressHex = wallet.address.slice(2).toLowerCase();
  const timeoutHeight = 0;

  for (let i = 1; i <= maxTransaction; i++) {
    const babylonWallet = destination === 'babylon' 
      ? babylonWallets[Math.floor(Math.random() * babylonWallets.length)]
      : null;

    logger.step(`${walletInfo.name || 'Unnamed'} | ${tokenName} Transaction ${i}/${maxTransaction} to ${destination}` + 
      (babylonWallet ? ` (${babylonWallet.name || 'Babylon wallet'})` : ''));

    const now = BigInt(Date.now()) * 1_000_000n;
    const oneDayNs = 86_400_000_000_000n;
    const timeoutTimestamp = (now + oneDayNs).toString();
    const timestampNow = Math.floor(Date.now() / 1000);
    const salt = ethers.keccak256(ethers.solidityPacked(['address', 'uint256'], [wallet.address, timestampNow]));

    let operand;
    if (transferType === 'usdc') {
      const randomAmount = getRandomUSDCAmount();
      const amountInUnits = ethers.parseUnits(randomAmount, 6);
      
      logger.step(`Using random USDC amount: ${randomAmount} (${amountInUnits.toString()} units)`);
      
      if (destination === 'babylon') {
        const babylonAddress = babylonWallet.address.startsWith('bbn1') 
          ? babylonWallet.address.slice(4)
          : babylonWallet.address;
        
        const babylonAddressBytes = ethers.toUtf8Bytes(babylonAddress);
        const babylonAddressHex = ethers.hexlify(babylonAddressBytes);
        const amountHex = ethers.toBeHex(amountInUnits).slice(2).padStart(64, '0');
        
        operand = ethers.solidityPacked(
          ['bytes'],
          [
            '0xff0d7c2f' + // Function selector
            '0000000000000000000000000000000000000000000000000000000000000007' + // Channel ID
            '0000000000000000000000000000000000000000000000000000000000000000' + // Timeout height
            timeoutTimestamp.slice(2).padStart(64, '0') + // Timeout timestamp
            salt.slice(2) + // Salt
            '00000000000000000000000000000000000000000000000000000000000000a0' + // Instruction offset
            '0000000000000000000000000000000000000000000000000000000000000000' + // Empty bytes
            '0000000000000000000000000000000000000000000000000000000000000002' + // Array length?
            '0000000000000000000000000000000000000000000000000000000000000060' + // Offset 1
            '00000000000000000000000000000000000000000000000000000000000003e0' + // Offset 2
            '0000000000000000000000000000000000000000000000000000000000000020' + // ?
            '0000000000000000000000000000000000000000000000000000000000000001' + // ?
            '0000000000000000000000000000000000000000000000000000000000000020' + // ?
            '0000000000000000000000000000000000000000000000000000000000000001' + // ?
            '0000000000000000000000000000000000000000000000000000000000000003' + // ?
            '0000000000000000000000000000000000000000000000000000000000000060' + // ?
            '0000000000000000000000000000000000000000000000000000000000000300' + // ?
            '0000000000000000000000000000000000000000000000000000000000000140' + // ?
            '0000000000000000000000000000000000000000000000000000000000000180' + // ?
            '00000000000000000000000000000000000000000000000000000000000001e0' + // ?
            '00000000000000000000000000000000000000000000000000000000000003e8' + // ?
            '0000000000000000000000000000000000000000000000000000000000000220' + // ?
            '0000000000000000000000000000000000000000000000000000000000000260' + // ?
            '0000000000000000000000000000000000000000000000000000000000000006' + // ?
            '0000000000000000000000000000000000000000000000000000000000000000' + // ?
            '00000000000000000000000000000000000000000000000000000000000002a0' + // ?
            amountHex + // Amount
            '000000000000000000000000' + addressHex + // Source address
            '0000000000000000000000000000000000000000000000000000000000000000' + // Padding
            '000000000000000000000000' + babylonAddressHex.slice(2) + // Babylon destination
            '0000000000000000000000000000000000000000000000000000000000000000' + // Padding
            '000000000000000000000000' + USDC_ADDRESS.slice(2) + // Token address
            '0000000000000000000000000000000000000000000000000000000000000000' + // Padding
            '0000000000000000000000000000000000000000000000000000000000000004' + // Length
            '5553444300000000000000000000000000000000000000000000000000000000' + // USDC symbol
            '0000000000000000000000000000000000000000000000000000000000000004' + // Length
            '5553444300000000000000000000000000000000000000000000000000000000' + // USDC symbol
            babylonAddressHex.slice(2).padEnd(64, '0') // Babylon address
          ]
        );
      } else {
        // [Previous Holesky USDC operand remains the same...]
      }
    } else if (transferType === 'weth') {
      // [Previous WETH operand remains the same...]
    }

    const instruction = {
      version: 0,
      opcode: 2,
      operand,
    };

    try {
      const startTime = Date.now();
      txStats.pending++;
      updateCharts();
      
      const tx = await contract.send(channelId, timeoutHeight, timeoutTimestamp, salt, instruction, {
        gasLimit: 500000
      });
      
      const receipt = await tx.wait(1);
      
      const endTime = Date.now();
      const txTime = endTime - startTime;
      txStats.times.push(txTime);
      txStats.pending--;
      txStats.success++;
      updateCharts();
      
      const logMsg = `${timelog()} | ${walletInfo.name || 'Unnamed'} | ${tokenName} to ` +
        (babylonWallet ? `${babylonWallet.name || 'Babylon wallet'}` : destination) +
        ` Confirmed: ${explorer.tx(tx.hash)} (${txTime}ms)`;
      logger.success(logMsg);
      
      const txHash = tx.hash.startsWith('0x') ? tx.hash : `0x${tx.hash}`;
      const packetHash = await pollPacketHash(txHash);
      if (packetHash) {
        logger.success(`${timelog()} | ${walletInfo.name || 'Unnamed'} | Packet Submitted: ${union.tx(packetHash)}`);
      }
    } catch (err) {
      // [Previous error handling remains the same...]
    }

    if (i < maxTransaction) {
      await delay(1000);
    }

    updateStatusInfo(destination);
  }
}

// [Rest of the code remains exactly the same...]

// Initialize the application
main().catch((err) => {
  logger.error(`Main error: ${err.message}`);
  setTimeout(() => process.exit(1), 5000);
});

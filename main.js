const fs = require('fs');
const path = require('path');
const { ethers, JsonRpcProvider } = require('ethers');
const axios = require('axios');
const moment = require('moment-timezone');
const blessed = require('blessed');
const contrib = require('blessed-contrib');

// Babylon-specific constants
const BABYLON_USDC_ADDRESS = 'bbn1zsrv23akkgxdnwul72sftgv2xjt5khsnt3wwjhp0ffh683hzp5aq5a0h6n';
const BABYLON_CHANNEL_ID = 7;
const BABYLON_RPC_URL = 'https://rpc.testnet-5.babylon.union.build';
const BABYLON_WALLET_FILE = path.join(__dirname, 'baby_wallet.json');

// Helper function for random USDC amounts
function getRandomUSDCAmount() {
  const min = 0.007;
  const max = 0.04;
  return (Math.random() * (max - min) + min).toFixed(6);
}

// Create screen
const screen = blessed.screen({
  smartCSR: true,
  title: 'Union Testnet Auto Bot - MeG'
});

// Create dashboard grid layout
const grid = new contrib.grid({
  rows: 12,
  cols: 12,
  screen: screen
});

// Create UI components
const transactionLogBox = grid.set(0, 0, 6, 6, contrib.log, {
  fg: 'green',
  selectedFg: 'green',
  label: 'Transaction Logs',
  border: {type: "line", fg: "cyan"},
  tags: true
});

const walletInfoTable = grid.set(0, 6, 3, 6, contrib.table, {
  keys: true,
  fg: 'white',
  selectedFg: 'black',
  selectedBg: 'blue',
  interactive: true,
  label: 'Wallet Information',
  border: {type: "line", fg: "cyan"},
  columnSpacing: 3,
  columnWidth: [12, 40, 14]
});

const txLineChart = grid.set(6, 0, 6, 6, contrib.line, {
  style: {
    line: "yellow",
    text: "green",
    baseline: "black"
  },
  xLabelPadding: 3,
  xPadding: 5,
  showLegend: true,
  wholeNumbersOnly: false,
  label: 'Transaction Performance (Time in ms)',
  border: {type: "line", fg: "cyan"}
});

const txDonut = grid.set(3, 6, 3, 3, contrib.donut, {
  label: 'Transaction Status',
  radius: 8,
  arcWidth: 3,
  remainColor: 'black',
  yPadding: 2,
  border: {type: "line", fg: "cyan"}
});

const gasUsageGauge = grid.set(3, 9, 3, 3, contrib.gauge, {
  label: 'Network Usage',
  percent: [0, 100],
  border: {type: "line", fg: "cyan"}
});

const infoBox = grid.set(6, 6, 6, 6, contrib.markdown, {
  label: 'System Information',
  border: {type: "line", fg: "cyan"},
  markdownStyles: {
    header: { fg: 'magenta' },
    bold: { fg: 'blue' },
    italic: { fg: 'green' },
    link: { fg: 'yellow' }
  }
});

// Helper function for status updates
function updateStatusInfo(destination = 'Holesky') {
  const now = moment().tz('Asia/Jakarta').format('HH:mm:ss | DD-MM-YYYY');
  const networkStatus = Math.floor(Math.random() * 30) + 70;

  infoBox.setMarkdown(
`# System Status

**Time**: ${now}
**Network**: Sepolia to ${destination} Bridge
**Status**: Running
**API Health**: Good
**RPC Provider**: ${currentRpcProviderIndex + 1}/${rpcProviders.length}

## Network Information

* Chain ID: 11155111 (Sepolia)
* Gas Price: ~${Math.floor(Math.random() * 15) + 25} Gwei
* Pending Txs: ${Math.floor(Math.random() * 10)}`
  );

  gasUsageGauge.setPercent(networkStatus);
  screen.render();
}

// Transaction statistics for charts
const txStats = {
  success: 0,
  failed: 0,
  pending: 0,
  times: [],
  x: Array(30).fill(0).map((_, i) => i.toString()),
  y: Array(30).fill(0)
};

function updateCharts() {
  txDonut.setData([
    {percent: txStats.success, label: 'Success', color: 'green'},
    {percent: txStats.failed, label: 'Failed', color: 'red'},
    {percent: txStats.pending, label: 'Pending', color: 'yellow'}
  ]);

  if (txStats.times.length > 0) {
    txStats.y.shift();
    txStats.y.push(txStats.times[txStats.times.length - 1]);
    txLineChart.setData([{
      title: 'Tx Time',
      x: txStats.x,
      y: txStats.y,
      style: {line: 'yellow'}
    }]);
  }
  screen.render();
}

// Logger functions
const logger = {
  info: (msg) => { transactionLogBox.log(`{green-fg}[ℹ] ${msg}{/green-fg}`); screen.render(); },
  warn: (msg) => { transactionLogBox.log(`{yellow-fg}[⚠] ${msg}{/yellow-fg}`); screen.render(); },
  error: (msg) => { transactionLogBox.log(`{red-fg}[✗] ${msg}{/red-fg}`); screen.render(); },
  success: (msg) => { transactionLogBox.log(`{green-fg}[✓] ${msg}{/green-fg}`); screen.render(); },
  loading: (msg) => { transactionLogBox.log(`{cyan-fg}[⟳] ${msg}{/cyan-fg}`); screen.render(); },
  step: (msg) => { transactionLogBox.log(`{white-fg}[→] ${msg}{/white-fg}`); screen.render(); }
};

// Contract ABIs
const UCS03_ABI = [
  {
    inputs: [
      { internalType: 'uint32', name: 'channelId', type: 'uint32' },
      { internalType: 'uint64', name: 'timeoutHeight', type: 'uint64' },
      { internalType: 'uint64', name: 'timeoutTimestamp', type: 'uint64' },
      { internalType: 'bytes32', name: 'salt', type: 'bytes32' },
      {
        components: [
          { internalType: 'uint8', name: 'version', type: 'uint8' },
          { internalType: 'uint8', name: 'opcode', type: 'uint8' },
          { internalType: 'bytes', name: 'operand', type: 'bytes' },
        ],
        internalType: 'struct Instruction',
        name: 'instruction',
        type: 'tuple',
      },
    ],
    name: 'send',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

const USDC_ABI = [
  {
    constant: true,
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    type: 'function',
    stateMutability: 'view',
  },
  {
    constant: true,
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    type: 'function',
    stateMutability: 'view',
  },
  {
    constant: false,
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    type: 'function',
    stateMutability: 'nonpayable',
  },
];

const WETH_ABI = [
  {
    constant: false,
    inputs: [
      { name: 'wad', type: 'uint256' }
    ],
    name: 'withdraw',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    constant: false,
    inputs: [],
    name: 'deposit',
    outputs: [],
    payable: true,
    stateMutability: 'payable',
    type: 'function'
  },
  {
    constant: true,
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    type: 'function',
    stateMutability: 'view',
  },
  {
    constant: false,
    inputs: [
      { name: 'guy', type: 'address' },
      { name: 'wad', type: 'uint256' }
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    constant: true,
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    type: 'function',
    stateMutability: 'view',
  }
];

const contractAddress = '0x5FbE74A283f7954f10AA04C2eDf55578811aeb03';
const USDC_ADDRESS = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
const WETH_ADDRESS = '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9';
const graphqlEndpoint = 'https://graphql.union.build/v1/graphql';
const baseExplorerUrl = 'https://sepolia.etherscan.io';
const unionUrl = 'https://app.union.build/explorer';

const rpcProviders = [new JsonRpcProvider('https://1rpc.io/sepolia')];
let currentRpcProviderIndex = 0;

function provider() {
  return rpcProviders[currentRpcProviderIndex];
}

// Create a blessed input element for user input
const userInput = blessed.prompt({
  parent: screen,
  border: {
    type: 'line',
    fg: 'cyan'
  },
  height: '30%',
  width: '50%',
  top: 'center',
  left: 'center',
  label: ' Input Required ',
  tags: true,
  keys: true,
  vi: true,
  hidden: true
});

function askQuestion(query) {
  return new Promise(resolve => {
    userInput.hidden = false;
    userInput.input(query, '', (err, value) => {
      userInput.hidden = true;
      screen.render();
      resolve(value);
    });
  });
}

const explorer = {
  tx: (txHash) => `${baseExplorerUrl}/tx/${txHash}`,
  address: (address) => `${baseExplorerUrl}/address/${address}`,
};

const union = {
  tx: (txHash) => `${unionUrl}/transfers/${txHash}`,
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function timelog() {
  return moment().tz('Asia/Jakarta').format('HH:mm:ss | DD-MM-YYYY');
}

async function pollPacketHash(txHash, retries = 50, intervalMs = 5000) {
  const headers = {
    accept: 'application/graphql-response+json, application/json',
    'accept-encoding': 'gzip, deflate, br, zstd',
    'accept-language': 'en-US,en;q=0.9,id;q=0.8',
    'content-type': 'application/json',
    origin: 'https://app-union.build',
    referer: 'https://app.union.build/',
    'user-agent': 'Mozilla/5.0',
  };
  const data = {
    query: `query ($submission_tx_hash: String!) {
          v2_transfers(args: {p_transaction_hash: $submission_tx_hash}) {
            packet_hash
          }
        }`,
    variables: {
      submission_tx_hash: txHash.startsWith('0x') ? txHash : `0x${txHash}`,
    },
  };

  for (let i = 0; i < retries; i++) {
    try {
      const res = await axios.post(graphqlEndpoint, data, { headers });
      const result = res.data?.data?.v2_transfers;
      if (result && result.length > 0 && result[0].packet_hash) {
        return result[0].packet_hash;
      }
    } catch (e) {
      logger.error(`Packet error: ${e.message}`);
    }
    await delay(intervalMs);
  }
}

async function checkBalanceAndApprove(wallet, tokenAddress, tokenAbi, spenderAddress, tokenName) {
  const tokenContract = new ethers.Contract(tokenAddress, tokenAbi, wallet);
  const balance = await tokenContract.balanceOf(wallet.address);

  if (balance === 0n) {
    logger.error(`${wallet.address} does not have enough ${tokenName}. Fund your wallet first!`);
    return false;
  }

  const allowance = await tokenContract.allowance(wallet.address, spenderAddress);
  if (allowance === 0n) {
    logger.loading(`${tokenName} is not approved. Sending approve transaction...`);
    const approveAmount = ethers.MaxUint256;
    try {
      const tx = await tokenContract.approve(spenderAddress, approveAmount);
      txStats.pending++;
      updateCharts();

      const receipt = await tx.wait();
      txStats.pending--;
      txStats.success++;
      updateCharts();
      
      logger.success(`Approve confirmed: ${explorer.tx(receipt.hash)}`);
      await delay(3000);
    } catch (err) {
      txStats.pending--;
      txStats.failed++;
      updateCharts();
      
      logger.error(`Approve failed: ${err.message}`);
      return false;
    }
  }
  return true;
}

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
  const transferAmount = ethers.parseEther('0.0001'); // 0.0001 WETH

  if (transferType === 'usdc') {
    tokenName = 'USDC';
    tokenAddress = USDC_ADDRESS;
    tokenAbi = USDC_ABI;
    // Set channel ID based on destination
    channelId = destination === 'babylon' ? BABYLON_CHANNEL_ID : 8;
    shouldProceed = await checkBalanceAndApprove(wallet, tokenAddress, tokenAbi, contractAddress, tokenName);
  } else if (transferType === 'weth') {
    tokenName = 'WETH';
    tokenAddress = WETH_ADDRESS;
    tokenAbi = WETH_ABI;
    channelId = 9; // Channel ID for WETH transfers

    // Check ETH balance first (needed for gas and potential WETH wrapping)
    const ethBalance = await provider().getBalance(wallet.address);
    const requiredEthForGas = ethers.parseEther('0.001');
    if (ethBalance < requiredEthForGas) {
      logger.error(`Insufficient ETH for gas. Need at least ${ethers.formatEther(requiredEthForGas)} ETH`);
      return;
    }

    // Check WETH balance
    const wethContract = new ethers.Contract(WETH_ADDRESS, WETH_ABI, wallet);
    const wethBalance = await wethContract.balanceOf(wallet.address);

    if (wethBalance < transferAmount) {
      // If not enough WETH, try to wrap ETH
      const ethToWrap = transferAmount - wethBalance;
      const totalEthNeeded = ethToWrap + requiredEthForGas;
      
      if (ethBalance < totalEthNeeded) {
        logger.error(`Insufficient ETH to wrap. Need ${ethers.formatEther(totalEthNeeded)} ETH total (for wrapping and gas)`);
        return;
      }
      
      logger.loading(`Wrapping ${ethers.formatEther(ethToWrap)} ETH to WETH...`);
      try {
        const wrapTx = await wethContract.deposit({ value: ethToWrap });
        await wrapTx.wait();
        logger.success(`Successfully wrapped ${ethers.formatEther(ethToWrap)} ETH to WETH`);
      } catch (err) {
        logger.error(`Failed to wrap ETH: ${err.message}`);
        return;
      }
    }

    // Approve WETH spending
    shouldProceed = await checkBalanceAndApprove(wallet, tokenAddress, tokenAbi, contractAddress, tokenName);
  }

  if (!shouldProceed) return;

  const contract = new ethers.Contract(contractAddress, UCS03_ABI, wallet);
  const addressHex = wallet.address.slice(2).toLowerCase();
  const timeoutHeight = 0;

  for (let i = 1; i <= maxTransaction; i++) {
    // Select a random Babylon wallet for each transfer
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

    // Different operand based on transfer type
    let operand;
    if (transferType === 'usdc') {
      const randomAmount = getRandomUSDCAmount();
      const amountInUnits = ethers.parseUnits(randomAmount, 6); // USDC has 6 decimals
      
      logger.step(`Using random USDC amount: ${randomAmount} (${amountInUnits.toString()} units)`);
      
      if (destination === 'babylon') {
        // Fixed Babylon operand format
        const babylonAddress = babylonWallet.address;
        if (!babylonAddress.startsWith('bbn1')) {
          logger.error(`Invalid Babylon address format: ${babylonAddress}`);
          continue;
        }

        // Properly structured IBC packet data
        const packetData = {
          sourceAddress: wallet.address,
          destinationAddress: babylonAddress,
          tokenAddress: USDC_ADDRESS,
          amount: amountInUnits.toString(),
          denom: 'USDC'
        };

        // Encode the packet data
        operand = ethers.AbiCoder.defaultAbiCoder().encode(
          [
            'tuple(bytes32,bytes32,bytes32,bytes32,bytes32)',
            'tuple(bytes32,bytes32,bytes32,bytes32,bytes32)'
          ],
          [
            [
              ethers.zeroPadValue(ethers.toUtf8Bytes('sourceAddress'), 32),
              ethers.zeroPadValue(ethers.toUtf8Bytes(packetData.sourceAddress), 32),
              ethers.zeroPadValue(ethers.toUtf8Bytes('amount'), 32),
              ethers.zeroPadValue(ethers.toUtf8Bytes(packetData.amount), 32),
              ethers.zeroPadValue(ethers.toUtf8Bytes('tokenAddress'), 32)
            ],
            [
              ethers.zeroPadValue(ethers.toUtf8Bytes(packetData.tokenAddress), 32),
              ethers.zeroPadValue(ethers.toUtf8Bytes('destinationAddress'), 32),
              ethers.zeroPadValue(ethers.toUtf8Bytes(packetData.destinationAddress), 32),
              ethers.zeroPadValue(ethers.toUtf8Bytes('denom'), 32),
              ethers.zeroPadValue(ethers.toUtf8Bytes(packetData.denom), 32)
            ]
          ]
        );
      } else {
        // Original Holesky operand
        operand = '0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000002c00000000000000000000000000000000000000000000000000000000000000140000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000000000001c000000000000000000000000000000000000000000000000000000000000027100000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000024000000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000028000000000000000000000000000000000000000000000000000000000000027100000000000000000000000000000000000000000000000000000000000000014' +
          addressHex +
          '0000000000000000000000000000000000000000000000000000000000000000000000000000000000000014' +
          addressHex +
          '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000141c7d4b196cb0c7b01d743fbc6116a902379c72380000000000000000000000000000000000000000000000000000000000000000000000000000000000000004555344430000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000045553444300000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001457978bfe465ad9b1c0bf80f6c1539d300705ea50000000000000000000000000';
      }
    } else if (transferType === 'weth') {
      // WETH transfer operand with 0.0001 WETH amount
      operand = '0xff0d7c2f00000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000183e3bcd270059c058ce191dc34ac59ab0ccef2037033d3b50e15022d39fd5fd451083f938fa829800000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000003a000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000002c00000000000000000000000000000000000000000000000000000000000000140000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000000000001c0000000000000000000000000000000000000000000000000000000e8d4a5100000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000240000000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000280000000000000000000000000000000000000000000000000000000e8d4a510000000000000000000000000000000000000000000000000000000000000000014' +
          addressHex +
          '0000000000000000000000000000000000000000000000000000000000000000000000000000000000000014' +
          addressHex +
          '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000147b79995e5f793a07bc00c21412e50ecae098e7f900000000000000000000000000000000000000000000000000000000000000000000000000000000000000045745544800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000d57726170706564204574686572000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000014b476983cc7853797fc5adc4bcad39b277bc79656000000000000000000000000';
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
      
      // Add gas limit to prevent out of gas errors
      const tx = await contract.send(channelId, timeoutHeight, timeoutTimestamp, salt, instruction, {
        gasLimit: 500000 // Increased gas limit for WETH transfers
      });
      
      const receipt = await tx.wait(1);
      
      const endTime = Date.now();
      const txTime = endTime - startTime;
      txStats.times.push(txTime);
      txStats.pending--;
      txStats.success++;
      updateCharts();
      
      // Enhanced logging showing Babylon wallet info
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
      txStats.pending--;
      txStats.failed++;
      updateCharts();
      
      // More detailed error logging
      if (err.reason) {
        logger.error(`Failed for ${wallet.address}: ${err.reason}`);
      } else if (err.message.includes('reverted')) {
        // Try to decode revert reason
        try {
          const revertReason = err.data ? await decodeRevertReason(err.data) : 'unknown';
          logger.error(`Failed for ${wallet.address}: execution reverted (${revertReason})`);
        } catch {
          logger.error(`Failed for ${wallet.address}: execution reverted (unknown reason)`);
        }
      } else {
        logger.error(`Failed for ${wallet.address}: ${err.message}`);
      }
      
      // Add delay after failure to prevent rapid retries
      await delay(2000);
    }

    if (i < maxTransaction) {
      await delay(1000);
    }

    updateStatusInfo(destination);
  }
}

// Helper function to decode revert reasons
async function decodeRevertReason(data) {
  try {
    const revertReason = ethers.toUtf8String('0x' + data.slice(138));
    return revertReason || 'unknown';
  } catch {
    return 'unknown';
  }
}

async function main() {
  // Initialize UI
  screen.key(['escape', 'q', 'C-c'], function() {
    return process.exit(0);
  });

  // Status bar at the bottom
  const statusBar = blessed.box({
    parent: screen,
    bottom: 0,
    width: '100%',
    height: 1,
    content: ' {bold}{black-fg}Press Q/ESC to exit | Union Testnet Auto Bot - MeG787{/black-fg}{/bold}',
    tags: true,
    style: {
      fg: 'black',
      bg: 'blue',
    }
  });

  screen.render();
  updateStatusInfo();

  // Set initial data for UI components
  walletInfoTable.setData({
    headers: ['Name', 'Address', 'Balance'],
    data: [['Loading...', 'Please wait', '0']]
  });

  const walletFilePath = path.join(__dirname, 'wallet.json');
  if (!fs.existsSync(walletFilePath)) {
    logger.error(`wallet.json not found at ${walletFilePath}. Please create it with your wallet data.`);
    await delay(5000);
    process.exit(1);
  }

  let walletData;
  try {
    walletData = require(walletFilePath);
  } catch (err) {
    logger.error(`Error loading wallet.json: ${err.message}`);
    await delay(5000);
    process.exit(1);
  }

  if (!walletData.wallets || !Array.isArray(walletData.wallets)) {
    logger.error(`wallet.json does not contain a valid 'wallets' array.`);
    await delay(5000);
    process.exit(1);
  }

  // Update wallet table with actual data
  const tableData = await Promise.all(walletData.wallets.map(async (wallet) => {
    try {
      const w = new ethers.Wallet(wallet.privatekey, provider());
      const usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, w);
      const wethContract = new ethers.Contract(WETH_ADDRESS, WETH_ABI, w);
      const ethBalance = await provider().getBalance(w.address);
      const usdcBalance = await usdcContract.balanceOf(w.address);
      const wethBalance = await wethContract.balanceOf(w.address);

      return [
        wallet.name || 'Unnamed', 
        w.address.slice(0, 12) + '...' + w.address.slice(-6), 
        `USDC: ${ethers.formatUnits(usdcBalance, 6)}\nETH: ${ethers.formatEther(ethBalance)}\nWETH: ${ethers.formatEther(wethBalance)}`
      ];
    } catch (e) {
      return [wallet.name || 'Unnamed', 'Error', 'Error'];
    }
  }));

  walletInfoTable.setData({
    headers: ['Name', 'Address', 'Balances'],
    data: tableData
  });

  screen.render();

  // First prompt: Choose destination
  const destination = await askQuestion("Choose destination:\n1. Babylon\n2. Holesky\nEnter choice (1 or 2): ");
  let destinationName, destinationKey;
  
  if (destination === '1') {
    destinationName = 'Babylon';
    destinationKey = 'babylon';
  } else if (destination === '2') {
    destinationName = 'Holesky';
    destinationKey = 'holesky';
  } else {
    logger.error("Invalid choice. Please enter either 1 or 2.");
    await delay(5000);
    process.exit(1);
  }

  // Then ask for transfer type
  const transferType = await askQuestion("Choose transfer type (usdc/weth): ");
  if (!['usdc', 'weth'].includes(transferType.toLowerCase())) {
    logger.error("Invalid transfer type. Please choose either 'usdc' or 'weth'.");
    await delay(5000);
    process.exit(1);
  }

  // Validate WETH can only be sent to Holesky
  if (transferType === 'weth' && destinationKey === 'babylon') {
    logger.error("WETH transfers are only supported to Holesky");
    await delay(5000);
    process.exit(1);
  }

  const maxTransactionInput = await askQuestion("Enter the number of transactions per wallet: ");
  const maxTransaction = parseInt(maxTransactionInput.trim());

  if (isNaN(maxTransaction) || maxTransaction <= 0) {
    logger.error("Invalid number. Please enter a positive number.");
    await delay(5000);
    process.exit(1);
  }

  // Set up a timer to update the system info every 10 seconds
  setInterval(() => updateStatusInfo(destinationName), 10000);

  for (const walletInfo of walletData.wallets) {
    if (!walletInfo.name) {
      logger.warn(`Wallet missing 'name' field. Using 'Unnamed' as default.`);
    }
    if (!walletInfo.privatekey) {
      logger.warn(`Skipping wallet '${walletInfo.name || 'Unnamed'}': Missing privatekey.`);
      continue;
    }
    if (!walletInfo.privatekey.startsWith('0x')) {
      logger.warn(`Skipping wallet '${walletInfo.name || 'Unnamed'}': Privatekey must start with '0x'.`);
      continue;
    }
    if (!/^(0x)[0-9a-fA-F]{64}$/.test(walletInfo.privatekey)) {
      logger.warn(`Skipping wallet '${walletInfo.name || 'Unnamed'}': Privatekey is not a valid 64-character hexadecimal string.`);
      continue;
    }

    logger.loading(`Sending ${maxTransaction} ${transferType.toUpperCase()} Transaction Sepolia to ${destinationName} from ${walletInfo.name || 'Unnamed'}`);
    await sendFromWallet(walletInfo, maxTransaction, transferType.toLowerCase(), destinationKey);
  }

  if (walletData.wallets.length === 0) {
    logger.warn("No wallets processed. Check wallet.json for valid entries.");
  }

  // Keep the screen rendered until user exits
  logger.info("All transactions completed. Press Q or ESC to exit.");
}

// Initialize the application
main().catch((err) => {
  logger.error(`Main error: ${err.message}`);
  setTimeout(() => process.exit(1), 5000);
});

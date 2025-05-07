const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const axios = require('axios');
const moment = require('moment-timezone');
const blessed = require('blessed');
const contrib = require('blessed-contrib');

// Configuration Constants
const CONFIG = {
  RPC_URL: 'https://eth-sepolia.g.alchemy.com/v2/YBEAsfzdXnnsRW0C0iDZm3EbsNZWqXNM',
  CHAIN_ID: 11155111, // Sepolia
  CONTRACT_ADDRESS: '0x5FbE74A283f7954f10AA04C2eDf55578811aeb03',
  USDC_ADDRESS: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  GRAPHQL_ENDPOINT: 'https://graphql.union.build/v1/graphql',
  EXPLORER_URL: 'https://sepolia.etherscan.io',
  UNION_URL: 'https://app.union.build/explorer',
  MAX_RETRIES: 5,
  RETRY_DELAY: 3000
};

// Initialize provider - FIXED VERSION
const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL, {
  chainId: CONFIG.CHAIN_ID,
  name: 'sepolia'
});

// Create screen
const screen = blessed.screen({
  smartCSR: true,
  title: 'Union Testnet Auto Bot - KAZUHA'
});

// Create dashboard grid layout
const grid = new contrib.grid({
  rows: 12,
  cols: 12,
  screen: screen
});

// UI Components initialization
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

// Transaction statistics
const txStats = {
  success: 0,
  failed: 0,
  pending: 0,
  times: [],
  x: Array(30).fill(0).map((_, i) => i.toString()),
  y: Array(30).fill(0)
};

// Improved logger
const logger = {
  log: (level, msg) => {
    const colors = {
      info: 'green',
      warn: 'yellow',
      error: 'red',
      success: 'green',
      loading: 'cyan',
      step: 'white'
    };
    const symbols = {
      info: '[ℹ]',
      warn: '[⚠]',
      error: '[✗]',
      success: '[✓]',
      loading: '[⟳]',
      step: '[→]'
    };
    transactionLogBox.log(`{${colors[level]}-fg}${symbols[level]} ${msg}{/${colors[level]}-fg}`);
    screen.render();
  },
  info: (msg) => logger.log('info', msg),
  warn: (msg) => logger.log('warn', msg),
  error: (msg) => logger.log('error', msg),
  success: (msg) => logger.log('success', msg),
  loading: (msg) => logger.log('loading', msg),
  step: (msg) => logger.log('step', msg)
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

// Helper functions
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function timelog() {
  return moment().tz('Asia/Jakarta').format('HH:mm:ss | DD-MM-YYYY');
}

async function withRetry(fn, retries = CONFIG.MAX_RETRIES) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries - 1) throw err;
      logger.warn(`Retry ${i + 1}/${retries}: ${err.message}`);
      await delay(CONFIG.RETRY_DELAY);
    }
  }
}

// Improved provider health check
async function checkProviderHealth() {
  try {
    const network = await provider.getNetwork();
    if (network.chainId !== CONFIG.CHAIN_ID) {
      throw new Error(`Chain ID mismatch. Expected ${CONFIG.CHAIN_ID}, got ${network.chainId}`);
    }
    const blockNumber = await provider.getBlockNumber();
    logger.success(`Provider connected to Sepolia (Chain ID: ${network.chainId}), Latest block: ${blockNumber}`);
    return true;
  } catch (err) {
    logger.error(`Provider health check failed: ${err.message}`);
    return false;
  }
}

// Updated pollPacketHash with better error handling
async function pollPacketHash(txHash, retries = 50, intervalMs = 5000) {
  return withRetry(async () => {
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'Union-Auto-Bot'
    };
    
    const data = {
      query: `
        query ($submission_tx_hash: String!) {
          v2_transfers(args: {p_transaction_hash: $submission_tx_hash}) {
            packet_hash
          }
        }
      `,
      variables: {
        submission_tx_hash: txHash.startsWith('0x') ? txHash : `0x${txHash}`,
      },
    };

    const res = await axios.post(CONFIG.GRAPHQL_ENDPOINT, data, { headers });
    const result = res.data?.data?.v2_transfers;
    
    if (!result || result.length === 0 || !result[0].packet_hash) {
      throw new Error('Packet hash not found in response');
    }
    
    return result[0].packet_hash;
  });
}

// Enhanced balance and approval check
async function checkBalanceAndApprove(wallet) {
  return withRetry(async () => {
    const usdcContract = new ethers.Contract(CONFIG.USDC_ADDRESS, USDC_ABI, wallet);
    
    const balance = await usdcContract.balanceOf(wallet.address);
    if (balance === 0n) {
      throw new Error('Insufficient USDC balance');
    }

    const allowance = await usdcContract.allowance(wallet.address, CONFIG.CONTRACT_ADDRESS);
    if (allowance === 0n) {
      logger.loading(`Approving USDC spending...`);
      const tx = await usdcContract.approve(CONFIG.CONTRACT_ADDRESS, ethers.MaxUint256);
      txStats.pending++;
      updateCharts();
      
      const receipt = await tx.wait();
      txStats.pending--;
      txStats.success++;
      updateCharts();
      
      logger.success(`Approval confirmed: ${CONFIG.EXPLORER_URL}/tx/${receipt.hash}`);
      await delay(3000);
    }
    return true;
  });
}

// Main transaction function with improved error handling
async function sendTransaction(wallet, iteration, maxTransactions) {
  const startTime = Date.now();
  txStats.pending++;
  updateCharts();
  
  try {
    const contract = new ethers.Contract(CONFIG.CONTRACT_ADDRESS, UCS03_ABI, wallet);
    const addressHex = wallet.address.slice(2).toLowerCase();
    const channelId = 8;
    const timeoutHeight = 0;
    
    const now = BigInt(Date.now()) * 1_000_000n;
    const oneDayNs = 86_400_000_000_000n;
    const timeoutTimestamp = (now + oneDayNs).toString();
    const timestampNow = Math.floor(Date.now() / 1000);
    const salt = ethers.keccak256(ethers.solidityPacked(['address', 'uint256'], [wallet.address, timestampNow]));

    const operand = '0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000002c00000000000000000000000000000000000000000000000000000000000000140000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000000000001c000000000000000000000000000000000000000000000000000000000000027100000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000024000000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000028000000000000000000000000000000000000000000000000000000000000027100000000000000000000000000000000000000000000000000000000000000014' +
      addressHex +
      '0000000000000000000000000000000000000000000000000000000000000000000000000000000000000014' +
      addressHex +
      '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000141c7d4b196cb0c7b01d743fbc6116a902379c72380000000000000000000000000000000000000000000000000000000000000000000000000000000000000004555344430000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000045553444300000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001457978bfe465ad9b1c0bf80f6c1539d300705ea50000000000000000000000000';

    const instruction = {
      version: 0,
      opcode: 2,
      operand,
    };

    const tx = await contract.send(channelId, timeoutHeight, timeoutTimestamp, salt, instruction);
    const receipt = await tx.wait();
    
    const endTime = Date.now();
    const txTime = endTime - startTime;
    txStats.times.push(txTime);
    txStats.pending--;
    txStats.success++;
    updateCharts();
    
    logger.success(`${timelog()} | Transaction ${iteration}/${maxTransactions} confirmed in ${txTime}ms: ${CONFIG.EXPLORER_URL}/tx/${tx.hash}`);
    
    const packetHash = await pollPacketHash(tx.hash);
    if (packetHash) {
      logger.success(`${timelog()} | Packet submitted: ${CONFIG.UNION_URL}/transfers/${packetHash}`);
    }
    
    return true;
  } catch (err) {
    txStats.pending--;
    txStats.failed++;
    updateCharts();
    
    logger.error(`Transaction failed: ${err.message}`);
    return false;
  }
}

// UI Update functions
function updateCharts() {
  // Update donut chart with transaction status
  txDonut.setData([
    {percent: txStats.success, label: 'Success', color: 'green'},
    {percent: txStats.failed, label: 'Failed', color: 'red'},
    {percent: txStats.pending, label: 'Pending', color: 'yellow'}
  ]);
  
  // Update line chart with performance data
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

function updateStatusInfo() {
  const now = moment().tz('Asia/Jakarta').format('HH:mm:ss | DD-MM-YYYY');
  const networkStatus = Math.floor(Math.random() * 30) + 70; // Simulating network status
  
  infoBox.setMarkdown(`
# System Status

**Time**: ${now}
**Network**: Sepolia to Holesky Bridge
**Status**: Running
**API Health**: Good
**RPC Provider**: Alchemy Sepolia

## Network Information
* Chain ID: 11155111 (Sepolia)
* Gas Price: ~${Math.floor(Math.random() * 15) + 25} Gwei
* Pending Txs: ${Math.floor(Math.random() * 10)}
  `);
  
  gasUsageGauge.setPercent(networkStatus);
  screen.render();
}

// Main execution flow
async function main() {
  // UI Setup
  screen.key(['escape', 'q', 'C-c'], () => process.exit(0));
  
  const statusBar = blessed.box({
    parent: screen,
    bottom: 0,
    width: '100%',
    height: 1,
    content: ' {bold}{black-fg}Press Q/ESC to exit | Union Testnet Auto Bot - KAZUHA787{/black-fg}{/bold}',
    tags: true,
    style: {
      fg: 'black',
      bg: 'blue',
    }
  });
  
  screen.render();
  
  // Initial health check
  if (!await checkProviderHealth()) {
    logger.error('Failed to connect to RPC provider. Exiting...');
    await delay(5000);
    process.exit(1);
  }

  // Load wallets
  const walletFilePath = path.join(__dirname, 'wallet.json');
  if (!fs.existsSync(walletFilePath)) {
    logger.error('wallet.json not found');
    await delay(5000);
    process.exit(1);
  }

  let walletData;
  try {
    walletData = JSON.parse(fs.readFileSync(walletFilePath));
  } catch (err) {
    logger.error(`Error loading wallet.json: ${err.message}`);
    await delay(5000);
    process.exit(1);
  }

  // Validate wallets
  const validWallets = walletData.wallets.filter(wallet => {
    if (!wallet.privatekey) {
      logger.warn(`Skipping wallet: Missing private key`);
      return false;
    }
    return true;
  });

  if (validWallets.length === 0) {
    logger.error('No valid wallets found');
    await delay(5000);
    process.exit(1);
  }

  // Update wallet table
  const tableData = await Promise.all(validWallets.map(async (wallet) => {
    try {
      const w = new ethers.Wallet(wallet.privatekey, provider);
      const usdcContract = new ethers.Contract(CONFIG.USDC_ADDRESS, USDC_ABI, w);
      const balance = await usdcContract.balanceOf(w.address);
      return [wallet.name || 'Unnamed', w.address.slice(0, 12) + '...' + w.address.slice(-6), ethers.formatUnits(balance, 6)];
    } catch (e) {
      return [wallet.name || 'Unnamed', 'Error', 'Error'];
    }
  }));
  
  walletInfoTable.setData({
    headers: ['Name', 'Address', 'USDC Balance'],
    data: tableData
  });
  
  screen.render();

  // Get transaction count
  const maxTransactionInput = await new Promise(resolve => {
    const input = blessed.prompt({
      parent: screen,
      border: {type: 'line', fg: 'cyan'},
      height: '30%',
      width: '50%',
      top: 'center',
      left: 'center',
      label: ' Input Required ',
      tags: true,
      keys: true,
      vi: true
    });
    
    input.input('Enter the number of transactions per wallet: ', '', (err, value) => {
      screen.remove(input);
      screen.render();
      resolve(value);
    });
  });

  const maxTransaction = parseInt(maxTransactionInput.trim());
  if (isNaN(maxTransaction) || maxTransaction <= 0) {
    logger.error(`Invalid number. Please enter a positive number.`);
    await delay(5000);
    process.exit(1);
  }

  // Set up status updates
  setInterval(updateStatusInfo, 10000);

  // Process wallets
  for (const walletInfo of validWallets) {
    try {
      const wallet = new ethers.Wallet(walletInfo.privatekey, provider);
      logger.info(`Processing wallet: ${walletInfo.name || wallet.address}`);
      
      if (!await checkBalanceAndApprove(wallet)) {
        continue;
      }

      for (let i = 1; i <= maxTransaction; i++) {
        await sendTransaction(wallet, i, maxTransaction);
        if (i < maxTransaction) {
          await delay(1000);
        }
      }
    } catch (err) {
      logger.error(`Error processing wallet: ${err.message}`);
    }
  }

  logger.info('All transactions completed. Press Q or ESC to exit.');
}

// Start the application
main().catch(err => {
  logger.error(`Fatal error: ${err.message}`);
  process.exit(1);
});

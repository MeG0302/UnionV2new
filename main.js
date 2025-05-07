const fs = require('fs');
const path = require('path');
const { ethers, JsonRpcProvider } = require('ethers');
const axios = require('axios');
const moment = require('moment-timezone');
const blessed = require('blessed');
const contrib = require('blessed-contrib');

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
function updateStatusInfo() {
  const now = moment().tz('Asia/Jakarta').format('HH:mm:ss | DD-MM-YYYY');
  const networkStatus = Math.floor(Math.random() * 30) + 70; // Simulating network status
  
  infoBox.setMarkdown(`
# System Status

**Time**: ${now}
**Network**: Sepolia to Holesky Bridge
**Status**: Running
**API Health**: Good
**RPC Provider**: ${currentRpcProviderIndex + 1}/${rpcProviders.length}

## Network Information
* Chain ID: 11155111 (Sepolia)
* Gas Price: ~${Math.floor(Math.random() * 15) + 25} Gwei
* Pending Txs: ${Math.floor(Math.random() * 10)}
  `);
  
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

// Original code with modifications to update UI
const colors = {
  reset: "\x1b[0m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  white: "\x1b[37m",
  bold: "\x1b[1m"
};

// Modified logger to use the dashboard
const logger = {
  info: (msg) => {
    transactionLogBox.log(`{green-fg}[ℹ] ${msg}{/green-fg}`);
    screen.render();
  },
  warn: (msg) => {
    transactionLogBox.log(`{yellow-fg}[⚠] ${msg}{/yellow-fg}`);
    screen.render();
  },
  error: (msg) => {
    transactionLogBox.log(`{red-fg}[✗] ${msg}{/red-fg}`);
    screen.render();
  },
  success: (msg) => {
    transactionLogBox.log(`{green-fg}[✓] ${msg}{/green-fg}`);
    screen.render();
  },
  loading: (msg) => {
    transactionLogBox.log(`{cyan-fg}[⟳] ${msg}{/cyan-fg}`);
    screen.render();
  },
  step: (msg) => {
    transactionLogBox.log(`{white-fg}[→] ${msg}{/white-fg}`);
    screen.render();
  },
  banner: () => {
    // Banner is now part of the UI title
  }
};

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

const contractAddress = '0x5FbE74A283f7954f10AA04C2eDf55578811aeb03';
const USDC_ADDRESS = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
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
  tags: true,
  keys: true,
  style: {
    fg: 'white',
    bg: 'black'
  }
});

screen.render();

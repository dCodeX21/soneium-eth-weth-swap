const { Web3 } = require('web3');
const swap_ABI = require('./abi/weth_abi');
const cliProgress = require('cli-progress');

require('dotenv').config();

const rpcUrl = process.env.RPC_URL;
const privateKey = process.env.WALLET_PRIVATEKEY;
const depositCA = process.env.WETH_CA;

process.removeAllListeners('warning');

const web3 = new Web3(rpcUrl);
const account = web3.eth.accounts.privateKeyToAccount(privateKey);
  web3.eth.accounts.wallet.add(account);

const wethContract = new web3.eth.Contract(
  swap_ABI,
  depositCA
);

let totalAmountDeposited = 0;
let totalGasSpent = 0;
let totalWETHBalance = 0;

//===================================//
async function depositETH(sendIndex) {

  const gasLimit = parseInt(process.env.GAS_LIMIT);

  const gasPrice = await web3.eth.getGasPrice();

  const randomAmount = getRandomAmount();

  const amountToDeposit = web3.utils.toWei(randomAmount, 'ether');

  const valueToDeposit = parseFloat(amountToDeposit);

  const depETH = wethContract.methods.deposit().encodeABI();

  const nonce = await web3.eth.getTransactionCount(account.address, "latest")

  const transactionObject = {
    from: account.address,
    to: depositCA,
    value: valueToDeposit,
    gas:web3.utils.toHex(gasLimit),
    gasPrice: web3.utils.toHex(gasPrice),
    nonce: nonce,
    data: depETH,
  };

  const amountSent = web3.utils.fromWei(amountToDeposit, 'ether');

  totalAmountDeposited += parseFloat(amountSent);

  try {
    const transactionReceipt = await web3.eth.sendTransaction(transactionObject);

    totalGasSpent += parseFloat(web3.utils.fromWei((transactionReceipt.gasUsed * transactionReceipt.effectiveGasPrice).toString(), 'ether'));

    const blockNumber = transactionReceipt.blockNumber;

    let blockDetails =
      (await web3.eth.getBlock(blockNumber)) ||
      (await web3.eth.getBlock(transactionReceipt.blockHash));

    for (let i = 0, delay = 250; !blockDetails || blockDetails.timestamp == null; i++) {
      if (i % 10 === 0) console.log(`\nWaiting for block \x1b[32m${blockNumber}\x1b[0m`);
      await new Promise(r => setTimeout(r, delay));
      delay = Math.min((delay * 1.5) | 0, 5000);
      blockDetails =
        (await web3.eth.getBlock(blockNumber)) ||
        (await web3.eth.getBlock(transactionReceipt.blockHash));
    }

    const date = new Date(Number(blockDetails.timestamp) * 1000);

    const formattedDate = formatDateToTimezone(date, 'Asia/Manila');

    console.log(`\n${sendIndex + 1}. \x1b[91m${amountSent}\x1b[0m ETH wrap (deposit) success @ \x1b[93m${formattedDate}\x1b[0m with Block # \x1b[32m${blockNumber}\x1b[0m`);

    console.log(`\n   Transaction hash: \x1b[96m${transactionReceipt.transactionHash}\x1b[0m`);

    console.log(`   Transaction details -> \x1b[1;94mhttps://soneium.blockscout.com/tx/${transactionReceipt.transactionHash}\x1b[0m`);

    const wethBalance = await wethContract.methods.balanceOf(account.address).call();

    totalWETHBalance = parseFloat(web3.utils.fromWei((wethBalance).toString(), 'ether'));

    console.log('\nTotal WETH balance: \x1b[95m' + totalWETHBalance.toFixed(8) + '\x1b[0m WETH');
  } catch (depositError) {
    console.error(`Error depositing ETH:`, depositError);
  }

  let sendIndexNew = sendIndex + 1;

  let txCount = parseInt(process.env.DEPOSIT_TX_COUNT);

  if (sendIndexNew >= txCount) {
    finalizeTransaction()
    return;
  }

  const minDelay = 30000;   // 30 seconds
  const maxDelay = 300000;  // 5 minutes

  const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

  console.log(`\nWaiting for ${formatDelay(randomDelay)} before processing the next transaction.\n`);

  waitWithProgress(randomDelay, () => {
    depositETH(sendIndexNew);
  });
}

//===================================//
function waitWithProgress(delay, callback) {
  const totalSeconds = Math.ceil(delay / 1000);
  const progressBar = new cliProgress.SingleBar({
    format: 'Waiting [{bar}] {percentage}% | {value}/{total} seconds',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
  });
  let elapsed = 0;
  progressBar.start(totalSeconds, 0);
  const interval = setInterval(() => {
    elapsed++;
    progressBar.update(elapsed);
    if (elapsed >= totalSeconds) {
      clearInterval(interval);
      progressBar.stop();
      callback();
    }
  }, 1000);
}

//===================================//
async function finalizeTransaction() {
  console.log('\n\x1b[94mAll Wrap ETH (Deposit) Transactions Completed.\x1b[0m');

  console.log('\nOverall ETH deposit: \x1b[91m' + totalAmountDeposited.toFixed(8) + '\x1b[0m ETH');

  console.log('Overall Txn fee spent: \x1b[93m' + totalGasSpent.toFixed(10) + '\x1b[0m ETH');

  const wethBalance = await wethContract.methods.balanceOf(account.address).call();

  totalWETHBalance = parseFloat(web3.utils.fromWei((wethBalance).toString(), 'ether'));

  console.log('\nOverall WETH balance: \x1b[95m' + totalWETHBalance.toFixed(8) + '\x1b[0m WETH');

  const queryRemainingBalance = await web3.eth.getBalance(account.address);

  const remainingBalance = parseFloat(web3.utils.fromWei(queryRemainingBalance, 'ether')).toFixed(8);

  console.log('Overall ETH balance: \x1b[92m' + remainingBalance + '\x1b[0m ETH');
}

//===================================//
function getRandomAmount() {
  const min = parseFloat(process.env.DEPOSIT_RANDOM_AMOUNT_MIN);
  const max = parseFloat(process.env.DEPOSIT_RANDOM_AMOUNT_MAX);
  const randomValue = Math.random() * (max - min) + min;
  const roundedValue = randomValue.toFixed(8);
  return roundedValue.toString();
}

//===================================//
function formatDelay(delay) {
  const totalSeconds = Math.floor(delay / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (minutes > 0) {
    parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
  }
  if (seconds > 0) {
    parts.push(`${seconds} second${seconds !== 1 ? 's' : ''}`);
  }
  return parts.join(' and ');
}

//===================================//
function formatDateToTimezone(date, timeZone) {
  const timeOptions = {
    hour: 'numeric',
    minute: 'numeric',
    hour12: true,
    timeZone: timeZone
  };
  const timeFormatter = new Intl.DateTimeFormat('en-US', timeOptions);
  const formattedTime = timeFormatter.format(date);

  const dateOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: timeZone
  };
  const dateFormatter = new Intl.DateTimeFormat('en-US', dateOptions);
  const formattedDate = dateFormatter.format(date);

  return `${formattedTime} · ${formattedDate}`;
}

depositETH(0);

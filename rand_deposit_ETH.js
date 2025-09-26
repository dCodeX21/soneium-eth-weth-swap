const { Web3 } = require('web3')
const swap_ABI = require('./abi/weth_abi')

require('dotenv').config()

const rpcUrl = process.env.RPC_URL
const privateKey = process.env.WALLET_PRIVATEKEY
const depositCA = process.env.WETH_CA

process.removeAllListeners('warning');

const web3 = new Web3(rpcUrl)
const account = web3.eth.accounts.privateKeyToAccount(privateKey)
web3.eth.accounts.wallet.add(account)

const wethContract = new web3.eth.Contract(swap_ABI, depositCA)

async function depositETH() {
  try {
    const gasLimit = parseInt(process.env.GAS_LIMIT)
    const gasPrice = await web3.eth.getGasPrice()

    const randomAmount = getRandomAmount()
    const amountToDeposit = web3.utils.toWei(randomAmount.toString(), 'ether')
    const valueToDeposit = parseFloat(amountToDeposit);

    const depETH = wethContract.methods.deposit().encodeABI()
    const nonce = await web3.eth.getTransactionCount(account.address, 'latest')

    const transactionObject = {
      from: account.address,
      to: depositCA,
      value: valueToDeposit,
      gas: web3.utils.toHex(gasLimit),
      gasPrice: web3.utils.toHex(gasPrice),
      nonce: nonce,
      data: depETH,
    }

    const amountSent = web3.utils.fromWei(amountToDeposit, 'ether')

    const transactionReceipt = await web3.eth.sendTransaction(transactionObject)

    const totalGasSpent = parseFloat(web3.utils.fromWei((transactionReceipt.gasUsed * transactionReceipt.effectiveGasPrice).toString(), 'ether'))

    const blockNumber = transactionReceipt.blockNumber
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
    const formattedDate = formatDateToTimezone(new Date(Number(blockDetails.timestamp) * 1000), 'Asia/Manila')

    const wethBalanceUpdated = await wethContract.methods.balanceOf(account.address).call()
    const totalWETHBalance = parseFloat(web3.utils.fromWei(wethBalanceUpdated, 'ether'))

    const queryRemainingBalance = await web3.eth.getBalance(account.address)
    const remainingBalance = parseFloat(web3.utils.fromWei(queryRemainingBalance, 'ether')).toFixed(8)

    console.log(`\n\x1b[91m${amountSent}\x1b[0m ETH wrap (deposit) success @ \x1b[93m${formattedDate}\x1b[0m with Block # \x1b[32m${blockNumber}\x1b[0m`)

    console.log(`\n Transaction hash: \x1b[96m${transactionReceipt.transactionHash}\x1b[0m`)

    console.log(` Transaction details -> \x1b[1;94mhttps://soneium.blockscout.com/tx/${transactionReceipt.transactionHash}\x1b[0m`)

    console.log('\nTotal WETH balance: \x1b[95m' + totalWETHBalance.toFixed(8) + '\x1b[0m WETH')

    console.log('Total ETH balance: \x1b[92m' + remainingBalance + '\x1b[0m ETH')

    const result = {
      status: 'success',
      transactionType: 'Deposit',
      amountSent: web3.utils.fromWei(amountToDeposit, 'ether'),
      totalGasSpent: totalGasSpent.toString(),
      totalWETHBalance: totalWETHBalance.toString(),
      remainingBalance: remainingBalance.toString(),
    }

    process.send(result)
    process.exit(0)
  } catch (error) {
    console.error(`Error depositing ETH: ${error.message}`)
    process.send({ status: 'error', message: error.message })
    process.exit(1)
  }
}

function getRandomAmount() {
  const min = parseFloat(process.env.DEPOSIT_RANDOM_AMOUNT_MIN)
  const max = parseFloat(process.env.DEPOSIT_RANDOM_AMOUNT_MAX)
  return parseFloat((Math.random() * (max - min) + min).toFixed(8))
}

function formatDateToTimezone(date, timeZone) {
  const timeOptions = {
    hour: 'numeric',
    minute: 'numeric',
    hour12: true,
    timeZone: timeZone,
  }
  const timeFormatter = new Intl.DateTimeFormat('en-US', timeOptions)
  const formattedTime = timeFormatter.format(date)

  const dateOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: timeZone,
  }
  const dateFormatter = new Intl.DateTimeFormat('en-US', dateOptions)
  const formattedDate = dateFormatter.format(date)

  return `${formattedTime} · ${formattedDate}`
}

depositETH()

const { exec, fork, spawn  } = require('child_process');
const readline = require('readline');
const cliProgress = require('cli-progress');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

process.removeAllListeners('warning');

const depScriptHeader = '\n==================================================\nETH Wrapping (Deposit) Transaction Started!';
const withScriptHeader = '\n==================================================\nETH Unwrapping (Withdrawal) Transaction Started!';

/* ------------------------------ Option 1-3 (Using exec) ------------------------------ */
function runScript(scriptName, scriptHeader, exitOnComplete, callback) {
  console.log(scriptHeader);

  const child = spawn('node', [scriptName], { stdio: 'inherit' });

  child.on('error', (error) => {
    console.error(`Error executing ${scriptName}: ${error}`);
  });

  child.on('close', () => {
    if (exitOnComplete) {
      process.exit(0);
    } else if (callback) {
      callback();
    }
  });
}

function runBothScripts(firstScript, firstHeader, secondScript, secondHeader) {
  runScript(firstScript, firstHeader, false, () => {
    console.log('\nPreparing the next transaction. Please wait...');
    setTimeout(() => {
      runScript(secondScript, secondHeader, true);
    }, 60000);
  });
}

/* ------------------------------ Option 4 (Using fork) ------------------------------ */
let totalDeposited = 0;
let totalWithdrawn = 0;
let totalDepositFees = 0;
let totalWithdrawFees = 0;
let finalWETHBalance = 0;
let finalETHBalance = 0;
let completedTransactions = 0;
let totalTransactions = 0;

function generateRandomSequence(depositCount, withdrawCount) {
  let dLeft = depositCount;
  let wLeft = withdrawCount;
  const sequence = [];
  let last = null;
  let streak = 0;

  while (dLeft > 0 || wLeft > 0) {
    const choices = [];
    if (dLeft > 0) {
      if (last === 'D' && streak === 3) {
        if (wLeft === 0) {
          choices.push('D');
        }
      } else {
        choices.push('D');
      }
    }

    if (wLeft > 0) {
      if (last === 'W' && streak === 3) {
        if (dLeft === 0) {
          choices.push('W');
        }
      } else {
        choices.push('W');
      }
    }

    if (choices.length === 0) {
      if (dLeft > 0) choices.push('D');
      else if (wLeft > 0) choices.push('W');
    }

    const pick = choices[Math.floor(Math.random() * choices.length)];
    sequence.push(pick);
    if (pick === 'D') {
      dLeft--;
    } else {
      wLeft--;
    }

    if (last === pick) {
      streak++;
    } else {
      last = pick;
      streak = 1;
    }
  }
  return sequence;
}

const minDelay = 30000;    // 30 seconds
const maxDelay = 300000;   // 5 minutes

function executeTransactions(sequence, index = 0) {
  if (index >= sequence.length) {
    console.log('All transactions completed.');
    displayOverallStats();
    return;
  }

  const type = sequence[index];
  let scriptName, scriptHeader;
  if (type === 'D') {
    scriptName = 'rand_deposit_ETH.js';
    scriptHeader = `Transaction \x1b[97m${index + 1}\x1b[0m/${sequence.length}: Executing Deposit Transaction`;
  } else {
    scriptName = 'rand_withdraw_ETH.js';
    scriptHeader = `Transaction \x1b[97m${index + 1}\x1b[0m/${sequence.length}: Executing Withdrawal Transaction`;
  }

  console.log('\n-------------------------------------------------------------------------------------------------------------------');
  console.log(scriptHeader);

  const child = fork(`./${scriptName}`);

  child.on('message', (message) => {
    if (message.status === "success") {
      if (type === 'D') {
        totalDeposited += parseFloat(message.amountSent);
        totalDepositFees += parseFloat(message.totalGasSpent);
      } else {
        totalWithdrawn += parseFloat(message.amountSent);
        totalWithdrawFees += parseFloat(message.totalGasSpent);
      }
      finalWETHBalance = parseFloat(message.totalWETHBalance);
      finalETHBalance = parseFloat(message.remainingBalance);
    }
  });

  child.on('exit', () => {
    completedTransactions++;
    if (completedTransactions === totalTransactions) {
      displayOverallStats();
    } else {
      const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
      console.log(`\nWaiting for ${formatDelay(randomDelay)} before processing the next transaction.\n`);
      waitWithProgress(randomDelay, () => {
        executeTransactions(sequence, index + 1);
      });
    }
  });
}

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

function displayOverallStats() {
  console.log('\n==================================================');
  console.log('\n\x1b[94m----------Overall Transaction Summary----------\x1b[0m');
  console.log(`Total ETH Deposited: \x1b[92m${totalDeposited.toFixed(8)}\x1b[0m ETH`);
  console.log(`Total ETH Withdrawn: \x1b[91m${totalWithdrawn.toFixed(8)}\x1b[0m ETH`);
  console.log(`Total ETH Deposit Txn Fees: \x1b[93m${totalDepositFees.toFixed(10)}\x1b[0m ETH`);
  console.log(`Total ETH Withdrawal Txn Fees: \x1b[93m${totalWithdrawFees.toFixed(10)}\x1b[0m ETH`);
  console.log(`Final WETH Balance: \x1b[95m${finalWETHBalance.toFixed(8)}\x1b[0m WETH`);
  console.log(`Final ETH Balance: \x1b[92m${finalETHBalance}\x1b[0m ETH`);
  console.log('\n==================================================');
  process.exit(0);
}

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

/* ------------------------------ Main Process ------------------------------ */
rl.question(
  'Choose the action you want to perform:\n' +
    'Choose the action you want to perform:\n' +
    '1. Wrap (Deposit) Ethereum\n' +
    '2. Unwrap (Withdraw) Ethereum\n' +
    '3. Do Both (Sequential with Delay)\n' +
    '4. Interleaving Transactions (Randomized Order)\n' +
    '5. Exit\n' +
    'Enter your choice (1, 2, 3, 4, or 5): ',
  (choice) => {
    if (choice === '1' || choice === '2' || choice === '3' || choice === '4') {
      if (choice === '1') {
        // Option 1: Only Deposit transactions.
        rl.question('\nHow many Wrap (Deposit) transactions to run? ', (count) => {
          if (!isNaN(count) && count > 0) {
            count = parseInt(count);
            process.env.DEPOSIT_TX_COUNT = count;
            runScript('deposit_ETH.js', depScriptHeader, true);
          } else {
            console.log('The number of deposit transactions must be greater than 0.');
            rl.close();
          }
        });
      } else if (choice === '2') {
        // Option 2: Only Withdrawal transactions.
        rl.question('\nHow many Unwrap (Withdraw) transactions to run? ', (count) => {
          if (!isNaN(count) && count > 0) {
            count = parseInt(count);
            process.env.WITHDRAW_TX_COUNT = count;
            runScript('withdraw_ETH.js', withScriptHeader, true);
          } else {
            console.log('The number of withdrawal transactions must be greater than 0.');
            rl.close();
          }
        });
      } else if (choice === '3') {
        // Option 3: Sequential execution.
        rl.question(
          '\nOrder of swapping to be executed:\n' +
            '1. Wrap (Deposit) First\n' +
            '2. Unwrap (Withdraw) First\n' +
            'Enter the order number you want to run first: ',
          (order) => {
            if (order === '1' || order === '2') {
              rl.question('\nHow many transactions for Wrap (Deposit) to run? ', (depositCount) => {
                if (!isNaN(depositCount) && depositCount > 0) {
                  depositCount = parseInt(depositCount);
                  process.env.DEPOSIT_TX_COUNT = depositCount;
                  const scriptHeaderDep = depScriptHeader;
                  rl.question('How many transactions for Unwrap (Withdraw) to run? ', (withdrawCount) => {
                    if (!isNaN(withdrawCount) && withdrawCount > 0) {
                      withdrawCount = parseInt(withdrawCount);
                      process.env.WITHDRAW_TX_COUNT = withdrawCount;
                      const scriptHeaderWith = withScriptHeader;
                      if (order === '1') {
                        runBothScripts('deposit_ETH.js', scriptHeaderDep, 'withdraw_ETH.js', scriptHeaderWith);
                      } else {
                        runBothScripts('withdraw_ETH.js', scriptHeaderWith, 'deposit_ETH.js', scriptHeaderDep);
                      }
                    } else {
                      console.log('The number of withdrawal transactions must be greater than 0.');
                      rl.close();
                    }
                  });
                } else {
                  console.log('The number of deposit transactions must be greater than 0.');
                  rl.close();
                }
              });
            } else {
              console.log('Invalid order choice.');
              rl.close();
            }
          }
        );
      } else if (choice === '4') {
        // Option 4: Interleaving Transactions (Randomized Order with Random Delay and Progress Bar) using fork.
        rl.question('\nHow many Wrap (Deposit) transactions to run? ', (depositCount) => {
          if (!isNaN(depositCount) && depositCount > 0) {
            depositCount = parseInt(depositCount);
            rl.question('How many Unwrap (Withdraw) transactions to run? ', (withdrawCount) => {
              if (!isNaN(withdrawCount) && withdrawCount > 0) {
                withdrawCount = parseInt(withdrawCount);
                const sequence = generateRandomSequence(depositCount, withdrawCount);
                console.log('\nRandom Transaction Sequence:', sequence.join(' '));
                totalTransactions = sequence.length;
                executeTransactions(sequence);
              } else {
                console.log('The number of withdrawal transactions must be greater than 0.');
                rl.close();
              }
            });
          } else {
            console.log('The number of deposit transactions must be greater than 0.');
            rl.close();
          }
        });
      }
    } else if (choice === '5') {
      console.log('Looser!');
      rl.close();
    } else {
      console.log('Invalid choice.');
      rl.close();
    }
  }
);

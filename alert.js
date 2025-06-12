const axios = require('axios');
const dotenv = require('dotenv')
const express = require('express');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.listen(PORT, (req,res) => {
    console.log(`Example app listening on port ${PORT}`)
})

app.get("/", (req, res) => {
    return res.status(200).json({status: "success"})
})

// Telegram configuration
const TELEGRAM_BOT_TOKEN = "8125987558:AAHcWxHEqTkqJIoZestOeWY3kOYKGgFVTSU";
const TELEGRAM_USER_ID = '-1002662637300';

// API endpoints
const API_URL_ALL = 'https://server.sahulatpay.com/transactions/tele/last-15-mins';
const MERCHANTS = {
    51: 'https://server.sahulatpay.com/transactions/tele/last-15-mins?merchantId=51', // Monetix
    5: 'https://server.sahulatpay.com/transactions/tele/last-15-mins?merchantId=5',
    16: 'https://server.sahulatpay.com/transactions/tele/last-15-mins?merchantId=16'   // Add more as needed
};

// Function to fetch transactions
async function fetchTransactions(url) {
    try {
        const response = await axios.get(url);
        return response.data.transactions || [];
    } catch (error) {
        console.error(`Error fetching transactions from ${url}: ${error.message}`);
        return [];
    }
}

// Function to filter Easypaisa transactions
function filterEasypaisaTransactions(transactions) {
    return transactions.filter(txn => txn.providerDetails?.name === "Easypaisa");
}

// Function to filter JazzCash transactions
function filterJazzCashTransactions(transactions) {
    return transactions.filter(txn => txn.providerDetails?.name === "JazzCash");
}

// Function to calculate transaction stats
function calculateTransactionStats(transactions) {
    const total = transactions.length;
    const completed = transactions.filter(txn => txn.status === "completed").length;
    const failed = transactions.filter(txn => txn.status === "failed").length;
    const pending = transactions.filter(txn => txn.status === "pending").length;
    const successRate = total === 0 ? 0 : (completed / total) * 100;
    return { total, completed, failed, pending, successRate };
}

// Function to send Telegram message
async function sendTelegramMessage(message) {
    const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    try {
        await axios.post(telegramUrl, {
            chat_id: TELEGRAM_USER_ID,
            text: message,
            parse_mode: 'Markdown'
        });
        console.log("✅ Message sent to Telegram!");
    } catch (error) {
        console.error(`❌ Failed to send Telegram message: ${error.message}`);
    }
}

// Function to send consolidated Telegram alerts
async function sendConsolidatedAlerts(data) {
    let message = "🚨 Transaction Success Rate Report 🚨\n\n";

    for (const [type, stats] of Object.entries(data)) {
        const { total, completed, failed, pending, successRate } = stats;
        if (successRate === 0 && total === 0) {
            message += `⚠️ *${type}*: Server might be down (No response from API)\n`;
        } else if (successRate < 60) {
            message += `*${type}* (Below 60%):\n` +
                       `📊 Success Rate: ${successRate.toFixed(2)}%\n` +
                       `✅ Completed: ${completed}\n` +
                       `❌ Failed: ${failed}\n` +
                       `⏳ Pending: ${pending}\n` +
                       `📈 Total: ${total}\n\n`;
        } else {
            message += `*${type}*:\n` +
                       `📊 Success Rate: ${successRate.toFixed(2)}%\n` +
                       `✅ Completed: ${completed}\n` +
                       `❌ Failed: ${failed}\n` +
                       `⏳ Pending: ${pending}\n` +
                       `📈 Total: ${total}\n\n`;
        }
    }

    await sendTelegramMessage(message);
    await new Promise(resolve => setTimeout(resolve, 60 * 1000)); // Wait 60 seconds
    console.log("⚠️ Stopping alerts until next cycle.");
}

// Main monitoring function
async function monitorTransactions() {
    while (true) {
        const data = {};

        // All Transactions
        const allTransactions = await fetchTransactions(API_URL_ALL);
        data["All Transactions"] = calculateTransactionStats(allTransactions);

        // All Easypaisa Transactions
        const allEasypaisaTransactions = filterEasypaisaTransactions(allTransactions);
        data["All Easypaisa"] = calculateTransactionStats(allEasypaisaTransactions);

        // All JazzCash Transactions
        const allJazzCashTransactions = filterJazzCashTransactions(allTransactions);
        data["All JazzCash"] = calculateTransactionStats(allJazzCashTransactions);

        // Merchant-specific transactions
        for (const [merchantId, url] of Object.entries(MERCHANTS)) {
            const merchantTransaction = await fetchTransactions(url);
            const merchantEasypaisaTransactions = filterEasypaisaTransactions(merchantTransaction);
            const merchantJazzCashTransactions = filterJazzCashTransactions(merchantTransaction);

            const merchantName = merchantId === "51" ? "Monetix" : `Merchant ${merchantId}`;
            if (merchantEasypaisaTransactions.length > 0) {
                data[`${merchantName} Easypaisa`] = calculateTransactionStats(merchantEasypaisaTransactions);
            }
            if (merchantJazzCashTransactions.length > 0) {
                data[`${merchantName} JazzCash`] = calculateTransactionStats(merchantJazzCashTransactions);
            }
        }

        console.log("Transaction Success Rates:");
        for (const [type, { successRate, total, completed, failed, pending }] of Object.entries(data)) {
            console.log(`${type}: Success Rate = ${successRate.toFixed(2)}%, Total = ${total}, Completed = ${completed}, Failed = ${failed}, Pending = ${pending}`);
        }

        // Check if any success rate is below 60% or 0% with no transactions
        if (Object.values(data).some(d => d.successRate < 60 || (d.successRate === 0 && d.total === 0))) {
            await sendConsolidatedAlerts(data);
        }

        await new Promise(resolve => setTimeout(resolve, 3 * 60 * 1000)); // Wait 10 minutes
    }
}

// Start monitoring
async function startMonitoring() {
    console.log("Starting transaction monitoring...");
    try {
        await monitorTransactions();
    } catch (err) {
        console.error("Error in monitoring tasks:", err);
    }
}

// Start the bot
startMonitoring();
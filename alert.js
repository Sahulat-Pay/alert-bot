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
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_USER_ID = process.env.TELEGRAM_USER_ID;

// API endpoints
const API_URL_ALL = 'https://server.sahulatpay.com/transactions/tele/last-15-mins';
const MERCHANTS = {
    51: 'https://server.sahulatpay.com/transactions/tele/last-15-mins?merchantId=51', // Monetix
    5: 'https://server.sahulatpay.com/transactions/tele/last-15-mins?merchantId=5',
    16: 'https://server.sahulatpay.com/transactions/tele/last-15-mins?merchantId=16'   // Add more as needed
};

// Global offset to track processed Telegram updates
let lastUpdateId = 0;

// Function to delete Telegram webhook
async function deleteWebhook() {
    try {
        const response = await axios.get(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook`);
        console.log("Webhook deleted:", response.data);
    } catch (error) {
        console.error("Error deleting webhook:", error.response?.data || error.message);
    }
}

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
        console.error(`❌ Failed to send Telegram message: ${error.response?.data || error.message}`);
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

    message += "Reply /check to stop alerts!";
    
    let userAcknowledged = false;
    for (let i = 0; i < 1 && !userAcknowledged; i++) {
        await sendTelegramMessage(message);
        await new Promise(resolve => setTimeout(resolve, 60 * 1000)); // Wait 60 seconds
        // userAcknowledged = await checkUserResponse();
    }

    if (userAcknowledged) {
        await sendTelegramMessage("✅ Alerts stopped by user response.");
    } else {
        console.log("⚠️ No response from user. Stopping alerts until next cycle.");
    }
}

// Function to check user messages for commands
// async function checkUserResponse() {
//     const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}`;
//     try {
//         console.log("Fetching Telegram updates...");
//         const response = await axios.get(telegramUrl);
//         const updates = response.data.result;

//         let stopAlerts = false;

//         for (let update of updates) {
//             lastUpdateId = update.update_id; // Update the offset
//             if (update.message && update.message.chat.id == TELEGRAM_USER_ID) {
//                 const text = update.message.text;
//                 if (text === "/check" || text === "/check@Devtectalertbot") {
//                     console.log("✅ User acknowledged an alert.");
//                     stopAlerts = true;
//                 } else if (text.startsWith("/update ")) {
//                     const merchantId = text.split(" ")[1];
//                     if (MERCHANTS[merchantId]) {
//                         console.log(`🔹 User requested update for Merchant ID ${merchantId}`);
//                         const type = merchantId === "51" ? "Monetix Easypaisa" : `Merchant ${merchantId} Easypaisa`;
//                         await handleUpdateCommand(type, MERCHANTS[merchantId], true, "Easypaisa");
//                     } else {
//                         await sendTelegramMessage(`❌ Invalid Merchant ID: ${merchantId}\nAvailable IDs: ${Object.keys(MERCHANTS).join(", ")}`);
//                     }
//                 } else if (text === "/updateeasy") {
//                     console.log("🔹 User requested update for All Easypaisa.");
//                     await handleUpdateCommand("All Easypaisa", API_URL_ALL, true, "Easypaisa");
//                 } else if (text === "/updatejazz") {
//                     console.log("🔹 User requested update for All JazzCash.");
//                     await handleUpdateCommand("All JazzCash", API_URL_ALL, true, "JazzCash");
//                 } else if (text === "/updateall") {
//                     console.log("🔹 User requested update for All Transactions.");
//                     await handleUpdateCommand("All Transactions", API_URL_ALL, false);
//                 }
//             }
//         }
//         return stopAlerts;
//     } catch (error) {
//         if (error.response && error.response.status === 409) {
//             console.warn("⚠️ Conflict detected in getUpdates. Retrying after delay...");
//             await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds before retrying
//             return await checkUserResponse(); // Retry
//         }
//         console.error("❌ Error checking Telegram messages: ", error.response?.data || error.message);
//         return false;
//     }
// }

// Function to handle update commands
async function handleUpdateCommand(type, url, filterProvider, providerName = null) {
    const transactions = await fetchTransactions(url);
    let relevantTransactions = transactions;
    if (filterProvider) {
        relevantTransactions = providerName === "Easypaisa" 
            ? filterEasypaisaTransactions(transactions) 
            : filterJazzCashTransactions(transactions);
    }
    const { total, completed, failed, pending, successRate } = calculateTransactionStats(relevantTransactions);
    const message = `📊 *${type}* Success Rate Update:\n\n` +
                    `✅ Success Rate: ${successRate.toFixed(2)}%\n` +
                    `✅ Completed: ${completed}\n` +
                    `❌ Failed: ${failed}\n` +
                    `⏳ Pending: ${pending}\n` +
                    `📈 Total: ${total}`;
    await sendTelegramMessage(message);
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

        await new Promise(resolve => setTimeout(resolve, 600 * 1000)); // Wait 10 minutes
    }
}

// Function to periodically check for user commands
// async function monitorCommands() {
//     while (true) {
//         // await checkUserResponse();
//         await new Promise(resolve => setTimeout(resolve, 30 * 1000)); // Check every 30 seconds
//     }
// }

// Start all monitoring tasks concurrently
async function startMonitoring() {
    console.log("Starting all monitoring tasks...");
    // Delete webhook to ensure polling works
    await deleteWebhook();
    // Add delay to ensure previous instance terminates (helps with nodemon restarts)
    await new Promise(resolve => setTimeout(resolve, 1000));
    // Ensure only one instance is running (manually check Task Manager or use taskkill /F /IM node.exe if needed)
    Promise.all([
        monitorTransactions(),
        // monitorCommands()
    ]).catch(err => console.error("Error in monitoring tasks:", err));
}

// Start the bot
startMonitoring();

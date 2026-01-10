import "dotenv/config";
import fetch from "node-fetch";
import fs from "fs";
import { ethers } from "ethers";
import { ABI } from "./abi.js";

/* ================= CONFIG ================= */

const USERS_FILE = "./users.json";
const PAYMENTS_FILE = "./payments.json";
const STATE_FILE = "./state.json";
const TG_OFFSET_FILE = "./tg-offset.json";

const MAX_BLOCK_RANGE = 2000;
const TG_POLL_INTERVAL = 3000;
const CHAIN_POLL_INTERVAL = 10_000;
const COUNTDOWN_INTERVAL = 60_000;

const ARCSCAN_TX = "https://testnet.arcscan.app/tx/";
const ARCSCAN_ADDR = "https://testnet.arcscan.app/address/";


/* ================= HELPERS ================= */

function loadJSON(path, fallback) {
  if (!fs.existsSync(path)) return fallback;
  const raw = fs.readFileSync(path, "utf8");
  if (!raw.trim()) return fallback;
  return JSON.parse(raw);
}

function saveJSON(path, data) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

/* ================= STATE ================= */

let users = loadJSON(USERS_FILE, {});
let payments = loadJSON(PAYMENTS_FILE, {});
let state = loadJSON(STATE_FILE, { lastBlock: 0 });
let tgOffset = loadJSON(TG_OFFSET_FILE, { offset: 0 }).offset;

/* ================= METRICS ================= */

const metrics = {
  startTime: Date.now(),
  telegramLinks: 0,
  eventsProcessed: 0,
  notificationsSent: 0,
  errors: 0
};

/* ================= PROVIDER ================= */

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const contract = new ethers.Contract(
  process.env.CONTRACT_ADDRESS,
  ABI,
  provider
);

/* ================= TELEGRAM SEND ================= */

async function sendTelegram(chatId, text) {
  try {
    await fetch(
      `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "Markdown"
        })
      }
    );

    metrics.notificationsSent++;
  } catch (err) {
    metrics.errors++;
    console.error("Telegram send failed:", err.message);
  }
}

async function notifyPair({
  sender,
  receiver,
  senderMessage,
  receiverMessage
}) {
  const senderUser = users[sender];
  const receiverUser = users[receiver];

  // same wallet + same chat = one notification only
  const sameChat =
    sender === receiver &&
    senderUser &&
    receiverUser &&
    senderUser.chatId === receiverUser.chatId;

  if (senderUser && senderMessage) {
    await sendTelegram(senderUser.chatId, senderMessage);
  }

  if (!sameChat && receiverUser && receiverMessage) {
    await sendTelegram(receiverUser.chatId, receiverMessage);
  }

  if (!senderUser && !receiverUser) return;

}


async function sendTelegramWithButtons(chatId, text, buttons) {
  await fetch(
    `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: buttons
        }
      })
    }
  );

  metrics.notificationsSent++;
}

/* ================= TELEGRAM POLLING ================= */

async function pollTelegram() {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${process.env.BOT_TOKEN}/getUpdates?offset=${tgOffset}`
    );

    const data = await res.json();
    if (!data.ok) return;

    for (const update of data.result) {
      tgOffset = update.update_id + 1;
      saveJSON(TG_OFFSET_FILE, { offset: tgOffset });

      /* ===== BUTTON CLICKS ===== */
      if (update.callback_query) {
        const query = update.callback_query;
        const chatId = query.message.chat.id.toString();
        const action = query.data;

        // acknowledge click
        await fetch(
          `https://api.telegram.org/bot${process.env.BOT_TOKEN}/answerCallbackQuery`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ callback_query_id: query.id })
          }
        );

        if (action === "STATUS") {
          const linkedWallets = Object.keys(users).filter(
            w => users[w].chatId === chatId
          );

          if (linkedWallets.length === 0) {
            await sendTelegram(chatId, "❌ You are not subscribed.");
          } else {
            await sendTelegram(
              chatId,
              `📊 Status\n\nLinked wallet(s):\n${linkedWallets.join("\n")}`
            );
          }
        }

        if (action === "STOP") {
          let removed = false;

          for (const wallet of Object.keys(users)) {
            if (users[wallet].chatId === chatId) {
              delete users[wallet];
              removed = true;
            }
          }

          saveJSON(USERS_FILE, users);

          await sendTelegram(
            chatId,
            removed
              ? "❌ You have unsubscribed from alerts."
              : "ℹ️ You were not subscribed."
          );
        }

        continue;
      }

      /* ===== NORMAL MESSAGES ===== */
      const msg = update.message;
      if (!msg || !msg.text) continue;

      const text = msg.text.trim();
      const chatId = msg.chat.id.toString();

      /* ===== /start <wallet> ===== */
      if (text.startsWith("/start")) {
        const wallet = text.split(" ")[1]?.toLowerCase();
        if (!wallet) continue;

        users[wallet] = {
          chatId,
          linkedAt: Date.now()
        };

        saveJSON(USERS_FILE, users);
        metrics.telegramLinks++;

        await sendTelegramWithButtons(
          chatId,
          "✅ Telegram alerts enabled!\n\nChoose an option:",
          [
            [{ text: "📊 Status", callback_data: "STATUS" }],
            [{ text: "❌ Unsubscribe", callback_data: "STOP" }]
          ]
        );

        console.log("🔗 Telegram linked:", wallet);
      }

      /* ===== /status ===== */
      if (text === "/status") {
        const linkedWallets = Object.keys(users).filter(
          w => users[w].chatId === chatId
        );

        if (linkedWallets.length === 0) {
          await sendTelegram(chatId, "❌ You are not subscribed.");
        } else {
          await sendTelegram(
            chatId,
            `📊 Status\n\nLinked wallet(s):\n${linkedWallets.join("\n")}`
          );
        }
      }

      /* ===== /stop ===== */
      if (text === "/stop") {
        let removed = false;

        for (const wallet of Object.keys(users)) {
          if (users[wallet].chatId === chatId) {
            delete users[wallet];
            removed = true;
          }
        }

        saveJSON(USERS_FILE, users);

        await sendTelegram(
          chatId,
          removed
            ? "❌ You have unsubscribed from alerts."
            : "ℹ️ You were not subscribed."
        );
      }
    }
  } catch (err) {
    metrics.errors++;
    console.error("Telegram polling error:", err.message);
  }
}

/* ================= CONTRACT POLLING ================= */

async function pollContract() {
  try {
    const currentBlock = await provider.getBlockNumber();

    if (state.lastBlock === 0) {
      state.lastBlock = currentBlock;
      saveJSON(STATE_FILE, state);
      return;
    }

    let fromBlock = state.lastBlock + 1;

    while (fromBlock <= currentBlock) {
      const toBlock = Math.min(fromBlock + MAX_BLOCK_RANGE, currentBlock);

      const events = await contract.queryFilter("*", fromBlock, toBlock);

      for (const e of events) {
        metrics.eventsProcessed++;

        if (e.eventName === "Scheduled") {
          const [id, sender, receiver, amount, executeAfter] = e.args;
          const senderAddr = sender.toLowerCase();

          payments[id.toString()] = {
            sender: sender.toLowerCase(),
            receiver: receiver.toLowerCase(),
            executeAt: Number(executeAfter),
            reminded1h: false,
            reminded10m: false
          };

saveJSON(PAYMENTS_FILE, payments);


          await notifyPair({
  sender: senderAddr,
  receiver: receiver.toLowerCase(),

  senderMessage: `📅 *Payment Scheduled*

🆔 ID: \`${id}\`
💰 Amount: ${ethers.formatUnits(amount, 6)} USDC
⏰ Executes: ${new Date(Number(executeAfter) * 1000).toUTCString()}

🔗 [View Wallet](${ARCSCAN_ADDR}${senderAddr})`,

  receiverMessage: `📥 *Incoming Payment Scheduled*

From: ${senderAddr}
💰 Amount: ${ethers.formatUnits(amount, 6)} USDC
⏰ Executes: ${new Date(Number(executeAfter) * 1000).toUTCString()}`
});



        }

        if (e.eventName === "Executed") {
  const [id, feePaid] = e.args;
  const entry = payments[id.toString()];
if (!entry) continue;

const senderAddr = entry.sender;
const receiverAddr = entry.receiver;

  await notifyPair({
  sender: senderAddr,
  receiver: receiverAddr,

  senderMessage: `✅ *Payment Executed*

🆔 ID: \`${id}\`
💸 Fee: ${ethers.formatUnits(feePaid, 6)} USDC

🔗 [View Transaction](${ARCSCAN_TX}${e.transactionHash})`,

  receiverMessage: `💰 *Payment Received*

From: ${senderAddr}
🆔 ID: \`${id}\`

🔗 [View Transaction](${ARCSCAN_TX}${e.transactionHash})`
});



          delete payments[id.toString()];
          saveJSON(PAYMENTS_FILE, payments);
        }

        if (e.eventName === "Cancelled") {
          const [id] = e.args;
          const entry = payments[id.toString()];
if (!entry) continue;

const senderAddr = entry.sender;
const receiverAddr = entry.receiver;


          if (!senderAddr) continue;

          await notifyPair({
  sender: senderAddr,
  receiver: receiverAddr,

  senderMessage: `❌ *Payment Cancelled*

🆔 ID: \`${id}\`
🔗 [View Transaction](${ARCSCAN_TX}${e.transactionHash})`,

  receiverMessage: `❌ *Incoming Payment Cancelled*

From: ${senderAddr}
🆔 ID: \`${id}\`

🔗 [View Transaction](${ARCSCAN_TX}${e.transactionHash})`
});



          delete payments[id.toString()];
          saveJSON(PAYMENTS_FILE, payments);
        }
      }

      fromBlock = toBlock + 1;
    }

    state.lastBlock = currentBlock;
    saveJSON(STATE_FILE, state);
  } catch (err) {
    metrics.errors++;
    console.error("Contract polling error:", err.message);
  }
}

async function checkCountdowns() {
  const now = Math.floor(Date.now() / 1000);

  for (const [id, p] of Object.entries(payments)) {
    const { sender, receiver, executeAt } = p;

    const senderUser = users[sender];
    const receiverUser = users[receiver];

    const diff = executeAt - now;

    // ⏰ 1 hour reminder
    if (diff <= 3600 && diff > 3540 && !p.reminded1h) {
      await notifyPair({
  sender,
  receiver,

  senderMessage: `⏳ *Reminder*

Payment #${id} will execute in **1 hour**

🔗 [View Wallet](${ARCSCAN_ADDR}${sender})`,

  receiverMessage: `📥 *Incoming Payment Reminder*

Payment #${id} will arrive in **1 hour**

🔗 [View Wallet](${ARCSCAN_ADDR}${receiver})`
});

p.reminded1h = true;

    }

    // ⏰ 10 minute reminder
    if (diff <= 600 && diff > 540 && !p.reminded10m) {
      await notifyPair({
  sender,
  receiver,

  senderMessage: `⚠️ *Reminder*

Payment #${id} executes in **10 minutes**`,

  receiverMessage: `💰 *Incoming Payment*

Payment #${id} arriving in **10 minutes**`
});

p.reminded10m = true;

    }
  }

  saveJSON(PAYMENTS_FILE, payments);
}


/* ================= START ================= */

setInterval(pollTelegram, TG_POLL_INTERVAL);
setInterval(pollContract, CHAIN_POLL_INTERVAL);
setInterval(checkCountdowns, COUNTDOWN_INTERVAL);

setInterval(() => {
  
  console.log("📊 METRICS", {
    uptimeMin: Math.floor((Date.now() - metrics.startTime) / 60000),
    ...metrics
  });
}, 60_000);

console.log("🤖 Telegram + Contract notifier running");

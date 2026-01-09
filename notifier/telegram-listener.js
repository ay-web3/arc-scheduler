import "dotenv/config";
import fs from "fs";
import http from "http";
import { ethers, verifyMessage } from "ethers";
import fetch from "node-fetch";
import { ABI } from "./abi.js";

/* ================= FILES ================= */

const USERS_FILE = "./users.json";
const PAYMENTS_FILE = "./payments.json";
const STATE_FILE = "./state.json";

/* ================= HELPERS ================= */

function loadJSON(path, fallback = {}) {
  if (!fs.existsSync(path)) return fallback;
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function saveJSON(path, data) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

/* ================= STATE ================= */

let state = loadJSON(STATE_FILE, { lastBlock: 0 });

/* ================= METRICS ================= */

const metrics = {
  startTime: Date.now(),
  eventsProcessed: 0,
  notificationsSent: 0,
  errors: 0,
  lastBlockSeen: 0,
  usersRegistered: 0
};

/* ================= PROVIDER ================= */

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const contract = new ethers.Contract(
  process.env.CONTRACT_ADDRESS,
  ABI,
  provider
);

/* ================= TELEGRAM ================= */

async function sendTelegramTo(chatId, message) {
  const url = `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`;

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: message
    })
  });

  metrics.notificationsSent++;
}

/* ================= INIT ================= */

if (state.lastBlock === 0) {
  state.lastBlock = await provider.getBlockNumber();
  saveJSON(STATE_FILE, state);
}

let lastBlock = state.lastBlock;
const seenTxs = new Set();

/* ================= POLLING ================= */

async function pollEvents() {
  try {
    const currentBlock = await provider.getBlockNumber();
    metrics.lastBlockSeen = currentBlock;

    if (currentBlock <= lastBlock) return;

    const events = await contract.queryFilter(
      "*",
      lastBlock + 1,
      currentBlock
    );

    const users = loadJSON(USERS_FILE);
    const payments = loadJSON(PAYMENTS_FILE);

    for (const e of events) {
      const key = `${e.transactionHash}-${e.logIndex}`;
      if (seenTxs.has(key)) continue;
      seenTxs.add(key);

      metrics.eventsProcessed++;

      if (e.eventName === "Scheduled") {
        const [id, sender, , amount, executeAfter] = e.args;
        const senderAddr = sender.toLowerCase();

        payments[id.toString()] = senderAddr;
        saveJSON(PAYMENTS_FILE, payments);

        const user = users[senderAddr];
        if (!user) continue;

        await sendTelegramTo(
          user.chatId,
          `📅 Payment Scheduled
ID: ${id}
Amount: ${ethers.formatUnits(amount, 6)} USDC
Executes: ${new Date(Number(executeAfter) * 1000).toUTCString()}`
        );
      }

      if (e.eventName === "Executed") {
        const [id, feePaid] = e.args;
        const senderAddr = payments[id.toString()];
        if (!senderAddr) continue;

        const user = users[senderAddr];
        if (!user) continue;

        await sendTelegramTo(
          user.chatId,
          `✅ Payment Executed
ID: ${id}
Fee: ${ethers.formatUnits(feePaid, 6)} USDC`
        );

        delete payments[id.toString()];
        saveJSON(PAYMENTS_FILE, payments);
      }

      if (e.eventName === "Cancelled") {
        const [id] = e.args;
        const senderAddr = payments[id.toString()];
        if (!senderAddr) continue;

        const user = users[senderAddr];
        if (!user) continue;

        await sendTelegramTo(
          user.chatId,
          `❌ Payment Cancelled
ID: ${id}`
        );

        delete payments[id.toString()];
        saveJSON(PAYMENTS_FILE, payments);
      }
    }

    lastBlock = currentBlock;
    state.lastBlock = currentBlock;
    saveJSON(STATE_FILE, state);

  } catch (err) {
    metrics.errors++;
    console.error("Polling error:", err.message);
    await new Promise(r => setTimeout(r, 30_000));
  }
}

/* ================= OPT-IN SERVER ================= */

const server = http.createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/opt-in") {
    res.writeHead(404);
    return res.end();
  }

  let body = "";
  req.on("data", chunk => body += chunk);
  req.on("end", () => {
    try {
      const { wallet, chatId, signature } = JSON.parse(body);
      const message = `Link Telegram alerts
Wallet: ${wallet}
Chat ID: ${chatId}`;

      const recovered = verifyMessage(message, signature);

      if (recovered.toLowerCase() !== wallet.toLowerCase()) {
        res.writeHead(401);
        return res.end("Invalid signature");
      }

      const users = loadJSON(USERS_FILE);
      users[wallet.toLowerCase()] = {
        chatId,
        linkedAt: Date.now()
      };
      saveJSON(USERS_FILE, users);

      metrics.usersRegistered++;

      res.writeHead(200);
      res.end("Telegram alerts enabled");

    } catch (e) {
      metrics.errors++;
      res.writeHead(400);
      res.end("Bad request");
    }
  });
});

server.listen(process.env.PORT || 3000);

/* ================= METRICS LOG ================= */

setInterval(() => {
  console.log("📊 METRICS", {
    uptimeMin: Math.floor((Date.now() - metrics.startTime) / 60000),
    ...metrics
  });
}, 60_000);

/* ================= START ================= */

setInterval(pollEvents, 10_000);
console.log("🚀 Notifier running with wallet-signed opt-in");

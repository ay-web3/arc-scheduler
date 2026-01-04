import "dotenv/config";
import { ethers } from "ethers";
import http from "http";

const PORT = 3001;

http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      timestamp: Date.now()
    }));
  }
}).listen(PORT, () => {
  console.log(`🩺 Executor health server on port ${PORT}`);
});


// ================= CONFIG =================
const RPC_URLS = [
  process.env.RPC_URL,
  "https://rpc.quicknode.testnet.arc.network",
  "https://rpc.blockdaemon.testnet.arc.network",
  "https://rpc.drpc.testnet.arc.network",
];

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;

const CHAIN_ID = 5042002;
const NETWORK = { name: "arc-testnet", chainId: CHAIN_ID };

const CHECK_INTERVAL_MS = 15_000;
const EXECUTION_COOLDOWN_MS = 3_000;
const RATE_LIMIT_BACKOFF_MS = 10_000;
const RPC_SWITCH_COOLDOWN_MS = 30_000;
// =========================================

// ================= SAFETY =================
if (!PRIVATE_KEY || !CONTRACT_ADDRESS) {
  throw new Error("❌ Missing PRIVATE_KEY or CONTRACT_ADDRESS in .env");
}
// =========================================

// ================= STATE =================
let rpcIndex = 0;
let lastRpcSwitch = 0;

let provider;
let wallet;
let scheduler;
// =========================================

// ================= ABI ==================
const abi = [
  "function paymentCount() view returns (uint256)",
  "function payments(uint256) view returns (address,address,uint256,uint256,bool,bool)",
  "function executePayment(uint256)",
];
// =======================================

// ================= UTILS =================
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isRpcError(err) {
  return (
    err?.message?.includes("limit") ||
    err?.message?.includes("429") ||
    err?.code === -32007 ||
    err?.code === "NETWORK_ERROR"
  );
}
// =========================================

// ================= PROVIDER MGMT =================
function rebuildProvider() {
  provider = new ethers.JsonRpcProvider(
    RPC_URLS[rpcIndex],
    NETWORK,
    { staticNetwork: true }
  );

  wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  scheduler = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);

  console.log(
    new Date().toISOString(),
    `🌐 Active RPC → ${RPC_URLS[rpcIndex]}`
  );
}

function rotateRpc() {
  const now = Date.now();
  if (now - lastRpcSwitch < RPC_SWITCH_COOLDOWN_MS) return;

  lastRpcSwitch = now;
  rpcIndex = (rpcIndex + 1) % RPC_URLS.length;

  console.log(
    new Date().toISOString(),
    "🔁 Switching RPC"
  );

  rebuildProvider();
}
// =========================================

// ================= STARTUP =================
rebuildProvider();

console.log("🤖 Auto Executor running");
console.log("Executor address:", wallet.address);
// =========================================

// ================= MAIN LOOP =================
async function tick() {
  console.log(new Date().toISOString(), "🤖 Auto Executor tick");

  try {
    const total = Number(await scheduler.paymentCount());

    for (let id = 0; id < total; id++) {
      const p = await scheduler.payments(id);

      const executed = p[4];
      const cancelled = p[5];
      const executeAfter = Number(p[3]);
      const now = Math.floor(Date.now() / 1000);

      if (executed || cancelled) continue;
      if (executeAfter > now) continue;

      console.log(
        new Date().toISOString(),
        `⏳ Executing payment #${id}`
      );

      try {
        const tx = await scheduler.executePayment(id);
        await tx.wait();

        console.log(
          new Date().toISOString(),
          `✅ Executed payment #${id}`
        );

        await sleep(EXECUTION_COOLDOWN_MS);
        return;
      } catch (err) {
        if (isRpcError(err)) {
          console.error(
            new Date().toISOString(),
            "🚦 RPC issue detected"
          );

          rotateRpc();
          await sleep(RATE_LIMIT_BACKOFF_MS);
          return;
        }

        console.error(
          new Date().toISOString(),
          `❌ Failed payment #${id}:`,
          err.message || err
        );

        await sleep(EXECUTION_COOLDOWN_MS);
        return;
      }
    }
  } catch (err) {
    console.error(
      new Date().toISOString(),
      "🔥 Executor tick error:",
      err.message || err
    );

    rotateRpc();
    await sleep(RATE_LIMIT_BACKOFF_MS);
  }
}
// =========================================

// ================= RUN ====================
setInterval(tick, CHECK_INTERVAL_MS);
// =========================================

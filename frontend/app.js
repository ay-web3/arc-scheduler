let isRenderingHistory = false;

const erc20Abi = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)"
];

import EthereumProvider from "@walletconnect/ethereum-provider";

const CONTRACT_ADDRESS = "0x29CB84e6941314c20D659ECDBb7197e1A2B6fdd6";
const CHAIN_ID = 5042002;
const DECIMALS = 6;
const USDC_ADDRESS = "0x3600000000000000000000000000000000000000"; 

let provider, signer, scheduler, userAddress;
let currentFilter = "all";
let currentView = "outgoing";

const connectBtn = document.getElementById("connectBtn");
const walletPill = document.getElementById("walletPill");
const walletAddressEl = document.getElementById("walletAddress");
const statFee = document.getElementById("statFee");


const abi = [
  "function paymentCount() view returns (uint256)",
  "function payments(uint256) view returns (address,address,uint256,uint256,bool,bool)",
  "function sendNow(address,uint256)",
  "function schedulePayment(address,uint256,uint256)",
  "function executePayment(uint256)",
  "function cancelPayment(uint256)",
  "function feeBps() view returns (uint256)",
  "event Executed(uint256 indexed id)"
];


async function getWalletProvider() {
  // 1️⃣ Desktop or injected wallet
  if (window.ethereum) {
    return new ethers.BrowserProvider(window.ethereum);
  }

  // 2️⃣ WalletConnect fallback
  const wcProvider = await EthereumProvider.init({
    projectId: "80c8d3c2330d5eeb1684b3f3f7a1dff6",
    chains: [5042002], // Arc Testnet
    showQrModal: true,
    rpcMap: {
      5042002: "https://rpc.testnet.arc.network"
    },
    methods: [
      "eth_sendTransaction",
      "eth_sign",
      "eth_signTransaction",
      "personal_sign"
    ],
    events: ["accountsChanged", "chainChanged"]
  });

  await wcProvider.enable();

  return new ethers.BrowserProvider(wcProvider);
}

// ================= WALLET =================
async function connectWallet() {
  provider = await getWalletProvider();

  await provider.send("eth_accounts", []);
  signer = await provider.getSigner();


  // 2. Robust Chain Check (Ethers v6 uses BigInt)
  const network = await provider.getNetwork();
const chainId = Number(network.chainId);

if (chainId !== CHAIN_ID) {
  try {
    await provider.send("wallet_switchEthereumChain", [
      { chainId: ethers.toBeHex(CHAIN_ID) }
    ]);
  } catch {
    alert("Please switch to Arc Testnet in your wallet");
    return;
  }

  }

  
  // 3. Setup contract + state
  userAddress = await signer.getAddress();
  scheduler = new ethers.Contract(CONTRACT_ADDRESS, abi, signer);
  // Load executor fee
try {
  const rawFee = await scheduler.feeBps(); // basis points
  const percent = (Number(rawFee) / 100).toFixed(2);
  statFee.innerText = `${percent}%`;
} catch (err) {
  console.error("Failed to load executor fee:", err);
  statFee.innerText = "—";
}


  // 4. Update UI
  walletPill.classList.remove("hidden");
walletAddressEl.innerText =
  `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;
connectBtn.classList.add("hidden");



  loadPaymentHistory();
}

connectBtn.innerText = "Connect Wallet";


async function ensureAllowance(amount) {
  const usdc = new ethers.Contract(USDC_ADDRESS, erc20Abi, signer);

  const allowance = await usdc.allowance(
    userAddress,
    CONTRACT_ADDRESS
  );

  if (allowance >= amount) return;

  const tx = await usdc.approve(
    CONTRACT_ADDRESS,
    amount
  );

  await tx.wait();
}


// ================= ACTIONS =================
async function sendNow() {
  const status = sendStatus;
  if (!sendRecipient.value || !sendAmount.value) {
    status.innerText = "❌ Please fill all fields";
    return;
  }
  
  try {
    status.innerText = "⏳ Approving…";

    const amount = ethers.parseUnits(sendAmount.value, DECIMALS);
    await ensureAllowance(amount);

    status.innerText = "⏳ Sending…";
    const tx = await scheduler.sendNow(
      sendRecipient.value,
      amount
    );

    status.innerHTML = `⏳ Sent<br/>
      <a href="https://testnet.arcscan.app/tx/${tx.hash}" target="_blank">
        View on ArcScan
      </a>`;

    await tx.wait();

    status.innerHTML = `✅ Sent<br/>
      <a href="https://testnet.arcscan.app/tx/${tx.hash}" target="_blank">
        View on ArcScan
      </a>`;
  loadPaymentHistory();
  } catch (err) {
    status.innerText = "❌ " + humanizeError(err);
  }
}


async function schedulePayment() {
  const status = schedStatus;
  if (!schedRecipient.value || !schedAmount.value || !schedTime.value) {
    status.innerText = "❌ Please fill all fields";
    return;
  }

  try {
    status.innerText = "⏳ Approving…";

    const amount = ethers.parseUnits(schedAmount.value, DECIMALS);
    await ensureAllowance(amount);

    status.innerText = "⏳ Scheduling…";
    const executeAt = Math.floor(
      new Date(schedTime.value).getTime() / 1000
    );

    const tx = await scheduler.schedulePayment(
      schedRecipient.value,
      amount,
      executeAt
    );

    status.innerHTML = `⏳ Scheduled<br/>
      <a href="https://testnet.arcscan.app/tx/${tx.hash}" target="_blank">
        View on ArcScan
      </a>`;

    await tx.wait();
    loadPaymentHistory();
  } catch (err) {
    status.innerText = "❌ " + humanizeError(err);
  }
}


async function manualExecute() {
  const status = manualExecStatus;
  try {
    const id = Number(manualExecId.value);
    if (isNaN(id)) {
      status.innerText = "❌ Invalid payment ID";
      return;
    }

    status.innerText = "⏳ Executing…";
    const tx = await scheduler.executePayment(id);
    status.innerHTML = `⏳ Executing<br/>
      <a href="https://testnet.arcscan.app/tx/${tx.hash}" target="_blank">View on ArcScan</a>`;
    await tx.wait();
    status.innerHTML = `✅ Executed<br/>
      <a href="https://testnet.arcscan.app/tx/${tx.hash}" target="_blank">View on ArcScan</a>`;
    loadPaymentHistory();
  } catch (e) {
    status.innerText = "❌ " + (e.reason || e.message);
  }
}

// ================= CANCEL =================
async function cancelPayment(id) {
  try {
    const ok = confirm(
      "Cancel this payment?\n\nFunds will be refunded immediately."
    );
    if (!ok) return;

    const tx = await scheduler.cancelPayment(id);
    await tx.wait();
    loadPaymentHistory();
  } catch (e) {
    alert("❌ " + (e.reason || e.message));
  }
}

// ================= EXECUTE BUTTON HANDLER (FIX) =================
document.addEventListener("click", async (e) => {
  const btn = e.target.closest(".exec-btn");
  if (!btn) return;

  const id = Number(btn.dataset.id);
  if (isNaN(id)) return;

  try {
    btn.disabled = true;
    btn.innerText = "⏳";

    const tx = await scheduler.executePayment(id);
    await tx.wait();

    loadPaymentHistory();
  } catch (err) {
    alert("❌ " + (err.reason || err.message));
  } finally {
    btn.disabled = false;
    btn.innerText = "Execute";
  }
});


// ================= FILTER HANDLING (NEW) =================
document.addEventListener("click", (e) => {
  if (!e.target.classList.contains("filter-btn")) return;

  document.querySelectorAll(".filter-btn").forEach(btn =>
    btn.classList.remove("active")
  );

  e.target.classList.add("active");
  currentFilter = e.target.dataset.filter;
  loadPaymentHistory();
});

// ================= VIEW TOGGLE =================
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".view-btn");
  if (!btn) return;

  document.querySelectorAll(".view-btn").forEach(b =>
    b.classList.remove("active")
  );

  btn.classList.add("active");
  currentView = btn.dataset.view;

  loadPaymentHistory();
});

// ================= HISTORY =================
async function loadPaymentHistory() {
  if (isRenderingHistory) return;
  isRenderingHistory = true;

  const body = paymentTableBody;
  body.innerHTML = "";

  try {
    const total = Number(await scheduler.paymentCount());
    let pending = 0, executed = 0, shown = 0;

    for (let i = 0; i < total; i++) {
      const p = await scheduler.payments(i);

      const sender = p[0].toLowerCase();
      const recipient = p[1].toLowerCase();

      const isOutgoing = sender === userAddress.toLowerCase();
      const isIncoming = recipient === userAddress.toLowerCase();

      if (
        (currentView === "outgoing" && !isOutgoing) ||
        (currentView === "incoming" && !isIncoming)
      ) continue;

      const isExecuted = p[4];
      const isCancelled = p[5];

      if (
        (currentFilter === "pending" && (isExecuted || isCancelled)) ||
        (currentFilter === "executed" && !isExecuted) ||
        (currentFilter === "cancelled" && !isCancelled)
      ) continue;

      shown++;
      if (isExecuted) executed++;
      else if (!isCancelled) pending++;

      body.insertAdjacentHTML(
        "beforeend",
        `
        <tr>
          <td>#${i}</td>
          <td>${(currentView === "incoming" ? p[0] : p[1]).slice(0,6)}…</td>
          <td>${ethers.formatUnits(p[2], DECIMALS)} USDC</td>
          <td>${new Date(Number(p[3]) * 1000).toLocaleString()}</td>
          <td class="${isExecuted ? "success" : isCancelled ? "danger" : "warning"}">
            ${isExecuted ? "Executed" : isCancelled ? "Cancelled" : "Scheduled"}
          </td>
          <td>
            <button class="btn small copy-btn" onclick="copyPaymentId(${i}, this)">📋</button>
            ${
              isExecuted || isCancelled
                ? "—"
                : `
                  <button class="btn small exec-btn" data-id="${i}">Execute</button>
                  ${
                    currentView === "outgoing"
                      ? `<button class="btn small danger" onclick="cancelPayment(${i})">Cancel</button>`
                      : ""
                  }
                `
            }
          </td>
        </tr>
        `
      );
    }

    statTotal.innerText = shown;
    statPending.innerText = pending;
    statExecuted.innerText = executed;
  } finally {
    isRenderingHistory = false;
  }
}


// ================= EVENT DELEGATION =================
document.addEventListener("click", (e) => {
  const menu = walletMenu;
  const pill = walletPill;

  if (!menu || menu.classList.contains("hidden")) return;
  if (menu.contains(e.target) || pill.contains(e.target)) return;

  menu.classList.add("hidden");
});

// ================= WALLET MENU =================
function toggleWalletMenu(e) {
  e.stopPropagation();
  walletMenu.classList.toggle("hidden");
}
function copyWalletAddress(e) {
  e.stopPropagation();

  navigator.clipboard.writeText(userAddress);

  const btn = e.target;
  const original = btn.innerText;
  btn.innerText = "✓ Copied";

  setTimeout(() => {
    btn.innerText = original;
  }, 1200);
}

function openExplorer() {
  window.open(`https://testnet.arcscan.app/address/${userAddress}`);
}
function disconnectWallet() {
  location.reload();
}
function subscribe() {
  scheduler.on("Executed", loadPaymentHistory);
}

// ================= COPY PAYMENT ID =================
function copyPaymentId(id, btn) {
  navigator.clipboard.writeText(String(id));

  if (!btn) return;

  const original = btn.innerText;
  btn.innerText = "✓ Copied";
  btn.classList.add("copied");
  btn.disabled = true;

  setTimeout(() => {
    btn.innerText = original;
    btn.classList.remove("copied");
    btn.disabled = false;
  }, 1500);
}

// ================= EXECUTOR HEALTH =================
async function checkExecutorHealth() {
  try {
    const r = await fetch("https://arc-scheduler.onrender.com/health");
    botHealth.innerText = r.ok ? "Executor: Online" : "Executor: Offline";
    botHealth.className = r.ok ? "badge online" : "badge error";
  } catch {
    botHealth.innerText = "Executor: Offline";
    botHealth.className = "badge error";
  }
}
setInterval(checkExecutorHealth, 10000);
checkExecutorHealth();

const BOT_USERNAME = "arc_scheduler_bot"; 

function enableTelegramAlerts() {
  if (!userAddress) {
    alert("Please connect your wallet first");
    return;
  }

  const url = `https://t.me/${BOT_USERNAME}?start=${userAddress}`;
  window.open(url, "_blank");

  alert("Telegram opened.\n\nClick START in Telegram to enable alerts.");
}


// ================= EXPOSE =================
window.connectWallet = connectWallet;
window.sendNow = sendNow;
window.schedulePayment = schedulePayment;
window.manualExecute = manualExecute;
window.cancelPayment = cancelPayment;
window.enableTelegramAlerts = enableTelegramAlerts;


document.addEventListener("DOMContentLoaded", () => {
  const manualBtn = document.getElementById("manualExecBtn");

  if (manualBtn) {
    manualBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      manualExecute();
    });
  }
  

});



function humanizeError(err) {
  if (!err) return "Something went wrong";

  const msg = err.reason || err.message || String(err);

  if (msg.includes("invalid FixedNumber") || msg.includes("INVALID_ARGUMENT")) {
    return "Please enter a valid amount";
  }

  if (msg.includes("insufficient funds")) {
    return "Insufficient balance";
  }

  if (msg.includes("exceeds allowance")) {
    return "Approval required before sending";
  }

  if (msg.includes("user rejected")) {
    return "Transaction cancelled by wallet";
  }

  if (msg.includes("execution reverted")) {
    return "Transaction reverted by contract";
  }

  return "Transaction failed. Please try again.";
}

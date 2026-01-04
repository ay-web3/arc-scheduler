const CONTRACT_ADDRESS = "0x29CB84e6941314c20D659ECDBb7197e1A2B6fdd6";
const CHAIN_ID = 5042002;
const DECIMALS = 6;

let provider, signer, scheduler, userAddress;

const abi = [
  "function paymentCount() view returns (uint256)",
  "function payments(uint256) view returns (address,address,uint256,uint256,bool,bool)",
  "function sendNow(address,uint256)",
  "function schedulePayment(address,uint256,uint256)",
  "function executePayment(uint256)",
  "function feeBps() view returns (uint256)",
  "event Executed(uint256 indexed id)"
];

// ================= WALLET =================
async function connectWallet() {
  if (!window.ethereum) return alert("MetaMask required");

  provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  signer = await provider.getSigner();
  userAddress = await signer.getAddress();

  const net = await provider.getNetwork();
  if (Number(net.chainId) !== CHAIN_ID)
    return alert("Switch to Arc Testnet");

  scheduler = new ethers.Contract(CONTRACT_ADDRESS, abi, signer);

  // ---------- FIX: LOAD EXECUTOR FEE ----------
  try {
    const rawFee = await scheduler.feeBps(); // basis points
    const percent = (Number(rawFee) / 100).toFixed(2);
    document.getElementById("statFee").innerText = `${percent}%`;
  } catch (err) {
    console.error("Failed to load executor fee:", err);
    document.getElementById("statFee").innerText = "—";
  }
  // ------------------------------------------

  document.getElementById("connectBtn").classList.add("hidden");
  document.getElementById("walletAddress").innerText =
    userAddress.slice(0, 6) + "..." + userAddress.slice(-4);
  document.getElementById("walletPill").classList.remove("hidden");

  loadPaymentHistory();
  subscribe();
}

// ================= ACTIONS =================
async function sendNow() {
  const status = sendStatus;
  try {
    status.innerText = "⏳ Sending…";
    const tx = await scheduler.sendNow(
      sendRecipient.value,
      ethers.parseUnits(sendAmount.value, DECIMALS)
    );
    status.innerHTML = `⏳ Sent<br/>
      <a href="https://testnet.arcscan.app/tx/${tx.hash}" target="_blank">View on ArcScan</a>`;
    await tx.wait();
    status.innerHTML = `✅ Sent<br/>
      <a href="https://testnet.arcscan.app/tx/${tx.hash}" target="_blank">View on ArcScan</a>`;
  } catch (e) {
    status.innerText = "❌ " + (e.reason || e.message);
  }
}

async function schedulePayment() {
  const status = schedStatus;
  try {
    status.innerText = "⏳ Scheduling…";
    const executeAt = Math.floor(new Date(schedTime.value).getTime() / 1000);
    const tx = await scheduler.schedulePayment(
      schedRecipient.value,
      ethers.parseUnits(schedAmount.value, DECIMALS),
      executeAt
    );
    status.innerHTML = `⏳ Scheduled<br/>
      <a href="https://testnet.arcscan.app/tx/${tx.hash}" target="_blank">View on ArcScan</a>`;
    await tx.wait();
    loadPaymentHistory();
  } catch (e) {
    status.innerText = "❌ " + (e.reason || e.message);
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

// ================= HISTORY =================
async function loadPaymentHistory() {
  const body = paymentTableBody;
  body.innerHTML = "";

  const total = Number(await scheduler.paymentCount());
  let pending = 0, executed = 0, shown = 0;

  for (let i = 0; i < total; i++) {
    const p = await scheduler.payments(i);
    if (p[0].toLowerCase() !== userAddress.toLowerCase()) continue;

    shown++;
    p[4] ? executed++ : pending++;

    body.innerHTML += `
      <tr>
        <td>#${i}</td>
        <td>${p[1].slice(0,6)}…</td>
        <td>${ethers.formatUnits(p[2], DECIMALS)} USDC</td>
        <td>${new Date(Number(p[3])*1000).toLocaleString()}</td>
        <td class="${p[4] ? "success" : "warning"}">
          ${p[4] ? "Executed" : "Scheduled"}
        </td>
        <td>
  <button
    class="btn small copy-btn"
    onclick="copyPaymentId(${i}, this)"
  >
    📋
  </button>

  ${
    p[4]
      ? "—"
      : `<button class="btn small exec-btn" data-id="${i}">Execute</button>`
  }
</td>

      </tr>
    `;
  }

  statTotal.innerText = shown;
  statPending.innerText = pending;
  statExecuted.innerText = executed;
}

// ================= EVENT DELEGATION =================
document.addEventListener("click", (e) => {
  const menu = walletMenu;
  const pill = walletPill;

  if (!menu || menu.classList.contains("hidden")) return;

  // If click is INSIDE menu or pill → do nothing
  if (menu.contains(e.target) || pill.contains(e.target)) {
    return;
  }

  // Otherwise → close menu
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
    const r = await fetch("http://localhost:3001/health");
    botHealth.innerText = r.ok ? "Executor: Online" : "Executor: Offline";
    botHealth.className = r.ok ? "badge online" : "badge error";
  } catch {
    botHealth.innerText = "Executor: Offline";
    botHealth.className = "badge error";
  }
}
setInterval(checkExecutorHealth, 10000);
checkExecutorHealth();

// ================= EXPOSE =================
window.connectWallet = connectWallet;
window.sendNow = sendNow;
window.schedulePayment = schedulePayment;
window.manualExecute = manualExecute;

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

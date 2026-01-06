/***********************
 * CONFIG
 ***********************/
const CONTRACT_ADDRESS = "0x29CB84e6941314c20D659ECDBb7197e1A2B6fdd6";
const USDC_ADDRESS = "0x3600000000000000000000000000000000000000"; // ✅ PUT ARC TESTNET USDC ADDRESS HERE
const CHAIN_ID = 5042002;
const DECIMALS = 6;

/***********************
 * GLOBAL STATE
 ***********************/
let provider, signer, scheduler, userAddress;
let currentFilter = "all";
let currentView = "outgoing";

/***********************
 * DOM
 ***********************/
const connectBtn = document.getElementById("connectBtn");
const walletPill = document.getElementById("walletPill");
const walletAddressEl = document.getElementById("walletAddress");
const statFee = document.getElementById("statFee");

/***********************
 * ABIs
 ***********************/
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

const erc20Abi = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)"
];

/***********************
 * WALLET
 ***********************/
async function connectWallet() {
  provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  signer = await provider.getSigner();

  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);

  if (chainId !== CHAIN_ID) {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: ethers.toBeHex(CHAIN_ID) }],
      });
    } catch (err) {
      if (err.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: ethers.toBeHex(CHAIN_ID),
            chainName: "Arc Testnet",
            nativeCurrency: {
              name: "USDC",
              symbol: "USDC",
              decimals: 6
            },
            rpcUrls: ["https://rpc.testnet.arc.network"],
            blockExplorerUrls: ["https://testnet.arcscan.app"]
          }]
        });
      } else {
        alert("Failed to switch to Arc Testnet");
        return;
      }
    }
  }

  userAddress = await signer.getAddress();
  scheduler = new ethers.Contract(CONTRACT_ADDRESS, abi, signer);

  // Load executor fee
  try {
    const rawFee = await scheduler.feeBps();
    statFee.innerText = `${(Number(rawFee) / 100).toFixed(2)}%`;
  } catch {
    statFee.innerText = "—";
  }

  walletPill.classList.remove("hidden");
  walletAddressEl.innerText =
    `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;
  connectBtn.classList.add("hidden");

  loadPaymentHistory();
}

/***********************
 * ALLOWANCE
 ***********************/
async function ensureAllowance(amount) {
  const usdc = new ethers.Contract(USDC_ADDRESS, erc20Abi, signer);
  const allowance = await usdc.allowance(userAddress, CONTRACT_ADDRESS);

  if (allowance >= amount) return;

  const tx = await usdc.approve(CONTRACT_ADDRESS, amount);
  await tx.wait();
}

/***********************
 * ACTIONS
 ***********************/
async function sendNow() {
  try {
    sendStatus.innerText = "⏳ Approving…";

    const amount = ethers.parseUnits(sendAmount.value, DECIMALS);
    await ensureAllowance(amount);

    sendStatus.innerText = "⏳ Sending…";
    const tx = await scheduler.sendNow(sendRecipient.value, amount);
    await tx.wait();

    sendStatus.innerHTML = `✅ Sent<br/>
      <a href="https://testnet.arcscan.app/tx/${tx.hash}" target="_blank">View</a>`;
  } catch (e) {
    sendStatus.innerText = "❌ " + (e.reason || e.message);
  }
}

async function schedulePayment() {
  try {
    schedStatus.innerText = "⏳ Approving…";

    const amount = ethers.parseUnits(schedAmount.value, DECIMALS);
    await ensureAllowance(amount);

    const executeAt = Math.floor(new Date(schedTime.value).getTime() / 1000);

    schedStatus.innerText = "⏳ Scheduling…";
    const tx = await scheduler.schedulePayment(
      schedRecipient.value,
      amount,
      executeAt
    );
    await tx.wait();

    schedStatus.innerHTML = `✅ Scheduled<br/>
      <a href="https://testnet.arcscan.app/tx/${tx.hash}" target="_blank">View</a>`;

    loadPaymentHistory();
  } catch (e) {
    schedStatus.innerText = "❌ " + (e.reason || e.message);
  }
}

/***********************
 * KEEP ALL EXISTING FEATURES
 ***********************/
async function manualExecute() {
  const id = Number(manualExecId.value);
  if (isNaN(id)) return;

  manualExecStatus.innerText = "⏳ Executing…";
  const tx = await scheduler.executePayment(id);
  await tx.wait();
  manualExecStatus.innerText = "✅ Executed";
  loadPaymentHistory();
}

async function cancelPayment(id) {
  if (!confirm("Cancel this payment?")) return;
  const tx = await scheduler.cancelPayment(id);
  await tx.wait();
  loadPaymentHistory();
}

/***********************
 * EXEC BUTTON
 ***********************/
document.addEventListener("click", async (e) => {
  const btn = e.target.closest(".exec-btn");
  if (!btn) return;

  btn.disabled = true;
  btn.innerText = "⏳";

  const id = Number(btn.dataset.id);
  const tx = await scheduler.executePayment(id);
  await tx.wait();

  btn.innerText = "Execute";
  btn.disabled = false;
  loadPaymentHistory();
});

/***********************
 * FILTER + VIEW
 ***********************/
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("filter-btn")) {
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    e.target.classList.add("active");
    currentFilter = e.target.dataset.filter;
    loadPaymentHistory();
  }

  if (e.target.classList.contains("view-btn")) {
    document.querySelectorAll(".view-btn").forEach(b => b.classList.remove("active"));
    e.target.classList.add("active");
    currentView = e.target.dataset.view;
    loadPaymentHistory();
  }
});

/***********************
 * HISTORY (UNCHANGED LOGIC)
 ***********************/
async function loadPaymentHistory() {
  if (!scheduler) return;

  paymentTableBody.innerHTML = "";
  const total = Number(await scheduler.paymentCount());

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

    paymentTableBody.innerHTML += `
      <tr>
        <td>#${i}</td>
        <td>${(currentView === "incoming" ? p[0] : p[1]).slice(0,6)}…</td>
        <td>${ethers.formatUnits(p[2], DECIMALS)} USDC</td>
        <td>${new Date(Number(p[3])*1000).toLocaleString()}</td>
        <td>${isExecuted ? "Executed" : isCancelled ? "Cancelled" : "Scheduled"}</td>
        <td>
          ${!isExecuted && !isCancelled
            ? `<button class="btn small exec-btn" data-id="${i}">Execute</button>
               ${currentView === "outgoing"
                 ? `<button class="btn small danger" onclick="cancelPayment(${i})">Cancel</button>`
                 : ""}`
            : "—"}
        </td>
      </tr>
    `;
  }
}

/***********************
 * EXPOSE
 ***********************/
window.connectWallet = connectWallet;
window.sendNow = sendNow;
window.schedulePayment = schedulePayment;
window.manualExecute = manualExecute;
window.cancelPayment = cancelPayment;

# Arc USDC Scheduler ⏱️💸

A decentralized USDC payment scheduler built on Arc Testnet, enabling users to send, schedule, and execute payments trustlessly — with optional automated execution and manual fallbacks.

# **✨ Features**

**🔹 Core**

- **Send USDC instantly**

- **Schedule USDC payments for future execution**
  
- **On-chain escrow – funds are locked in the contract**

- **Cancelable schedules (refunds sender if not executed)**
  
- **Executor fee (basis points) for sustainable automation**

**🔹 Execution**

- **Auto Executor (bot) – executes payments when due**

- **Manual execution fallback – sender or recipient can execute**

- **Recipient visibility – recipients can see incoming scheduled payments**

- **Incoming / Outgoing views in the UI**
  
**🔹 UX & Safety**

- **Wallet-based authentication (MetaMask, Rabby, etc.)**
  
- **Network auto-switch to Arc Testnet**

- **ERC-20 allowance checks + approvals**

- **Human-readable error messages**

- **Explorer links for every transaction**
#
   
**🧠 Why Arc?**

Arc is a **stablecoin-native blockchain** optimized for payments:

- USDC used as gas

- Deterministic finality

- Designed for real-world financial workflows

This project showcases stablecoin scheduling as a primitive, similar to payroll, subscriptions, and recurring transfers.
#

**🏗️ Architecture**

    Frontend (HTML/CSS/JS)

     |
   
     |  ethers.js
   
     |
   
    Smart Contract (Arc Testnet)

     |
   
     |  ERC-20 USDC
   
     |
    Auto Executor (optional bot)


- **Frontend:** Vanilla JS + Ethers v6

- **Smart Contract:** Solidity

- **Token:** USDC (Arc Testnet)

- **Explorer:** ArcScan

# 📦 Smart Contract

- **Contract Address:**

        0x29CB84e6941314c20D659ECDBb7197e1A2B6fdd6

- **Key Functions:**

        sendNow()
    
        schedulePayment()

        executePayment()

        cancelPayment()

        feeBps()
#

**🖥️ Frontend**

Live demo (Vercel):

👉 https://arc-scheduler.vercel.app/

**Features:**

- Connect wallet

- Send & schedule USDC

- View scheduled payments

- Toggle Incoming / Outgoing

- Execute or cancel payments

- Copy payment IDs

- View executor status
#
**🔐 ERC-20 Allowance Flow**

Before sending or scheduling:

1. App checks USDC allowance

2. Prompts approval if needed

3. Executes transaction safely

This prevents:

- Failed transfers

- Unexpected reverts

- Poor UX
#

**🚨 Error Handling**

Raw blockchain errors are translated into human-readable messages, e.g.:

- “Please enter a valid amount”

- “Approval required before sending”

- “Transaction cancelled by wallet”

- “Insufficient balance”
#

**🧪 Network Configuration (Arc Testnet)**

    Network Name: Arc Testnet
    RPC URL: https://rpc.testnet.arc.network
    Chain ID: 5042002
    Currency Symbol: USDC
    Explorer: https://testnet.arcscan.app
#

**🧭 Roadmap**
**v1 (Current)**

- One-time scheduled payments

- Manual + automated execution

- Sender & recipient views

**v2 (Planned)**

- Recurring payments

- Multi-executor support

- Fee tiers (manual vs auto execution)

- Recipient opt-in visibility

- Mainnet deployment
#

**🆚 Why Not Chainlink / Gelato?**
| Feature             | Arc Scheduler | Chainlink / Gelato |
| ------------------- | ------------- | ------------------ |
| Stablecoin-native   | ✅             | ❌                  |
| USDC gas            | ✅             | ❌                  |
| Recipient execution | ✅             | ❌                  |
| Cancelable escrow   | ✅             | ❌                  |
| Lightweight & open  | ✅             | ❌                  |

This project is simpler, cheaper, and purpose-built for USDC payments.
#

**🤝 Contributing**

PRs and feedback are welcome.

1. Fork the repo

2. Create a feature branch

3. Submit a pull request
#

**📜 License**

MIT
#

**👤 Author**

Built by **ay-web3**
GitHub: https://github.com/ay-web3

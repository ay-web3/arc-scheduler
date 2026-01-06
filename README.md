# Arc USDC Scheduler ⏱️💸

A decentralized USDC payment scheduler built on Arc Testnet, enabling users to send, schedule, and execute payments trustlessly — with optional automated execution and manual fallbacks.

✨ Features
🔹 Core

Send USDC instantly

Schedule USDC payments for future execution

On-chain escrow – funds are locked in the contract

Cancelable schedules (refunds sender if not executed)

Executor fee (basis points) for sustainable automation

🔹 Execution

Auto Executor (bot) – executes payments when due

Manual execution fallback – sender or recipient can execute

Recipient visibility – recipients can see incoming scheduled payments

Incoming / Outgoing views in the UI

🔹 UX & Safety

Wallet-based authentication (MetaMask, Rabby, etc.)

Network auto-switch to Arc Testnet

ERC-20 allowance checks + approvals

Human-readable error messages

Explorer links for every transaction

🧠 Why Arc?

Arc is a stablecoin-native blockchain optimized for payments:

USDC used as gas

Deterministic finality

Designed for real-world financial workflows

This project showcases stablecoin scheduling as a primitive, similar to payroll, subscriptions, and recurring transfers.

🏗️ Architecture

    Frontend (HTML/CSS/JS)

     |
   
     |  ethers.js
   
     |
   
    Smart Contract (Arc Testnet)

     |
   
     |  ERC-20 USDC
   
     |
    Auto Executor (optional bot)


**Frontend:** Vanilla JS + Ethers v6

**Smart Contract:** Solidity

**Token:** USDC (Arc Testnet)

**Explorer:** ArcScan

# 📦 Smart Contract

**Contract Address:**
0x29CB84e6941314c20D659ECDBb7197e1A2B6fdd6

**Key Functions:**

    sendNow()
    
    schedulePayment()

    executePayment()

    cancelPayment()

    feeBps()
#
**🖥️ Frontend**

Live demo (Vercel):

👉 https://arc-usdc-scheduler.vercel.app

Features:

Connect wallet

Send & schedule USDC

View scheduled payments

Toggle Incoming / Outgoing

Execute or cancel payments

Copy payment IDs

View executor status
#

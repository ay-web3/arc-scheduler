import fetch from "node-fetch";
import fs from "fs";

const USERS_FILE = "./users.json";

function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return {};
  return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

async function handleTelegramUpdates() {
  const res = await fetch(
    `https://api.telegram.org/bot${process.env.BOT_TOKEN}/getUpdates`
  );

  const data = await res.json();
  if (!data.ok) return;

  for (const update of data.result) {
    const msg = update.message;
    if (!msg || !msg.text) continue;

    // Example: "/start 0xabc123..."
    if (msg.text.startsWith("/start")) {
      const parts = msg.text.split(" ");
      const wallet = parts[1]?.toLowerCase();
      const chatId = msg.chat.id.toString();

      if (!wallet) continue;

      const users = loadUsers();
      users[wallet] = {
        chatId,
        linkedAt: Date.now()
      };
      saveUsers(users);

      await fetch(
        `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: "✅ Telegram alerts enabled successfully!"
          })
        }
      );
    }
  }
}

setInterval(handleTelegramUpdates, 5000);
console.log("🤖 Telegram bot listening for /start");

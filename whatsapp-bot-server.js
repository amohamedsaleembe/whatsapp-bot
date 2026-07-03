const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(express.json());

// ENV VARIABLES
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// 1. Webhook verification (Meta checks this once)
app.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode && token === VERIFY_TOKEN) {
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

// 2. Receive messages
app.post("/webhook", async (req, res) => {
    try {
        const entry = req.body.entry?.[0];
        const changes = entry?.changes?.[0];
        const messages = changes?.value?.messages;

        if (!messages) return res.sendStatus(200);

        const message = messages[0];
        const from = message.from;
        const userText = message.text?.body;

        if (!userText) return res.sendStatus(200);

        // Send to Claude
        const reply = await askClaude(userText);

        // Send back to WhatsApp
        await sendWhatsAppMessage(from, reply);

        res.sendStatus(200);
    } catch (err) {
        console.error(err);
        res.sendStatus(500);
    }
});

// 3. Call Claude (Anthropic)
async function askClaude(text) {
    try {
        const response = await axios.post(
            "https://api.anthropic.com/v1/messages",
            {
                model: "claude-3-haiku-20240307",
                max_tokens: 300,
                messages: [
                    { role: "user", content: text }
                ]
            },
            {
                headers: {
                    "x-api-key": ANTHROPIC_API_KEY,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json"
                }
            }
        );

        return response.data.content[0].text;
    } catch (err) {
        console.error("Claude error:", err.response?.data || err.message);
        return "Sorry, I couldn't process that right now.";
    }
}

// 4. Send WhatsApp message
async function sendWhatsAppMessage(to, text) {
    try {
        await axios.post(
            `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: "whatsapp",
                to: to,
                text: { body: text }
            },
            {
                headers: {
                    Authorization: `Bearer ${WHATSAPP_TOKEN}`,
                    "Content-Type": "application/json"
                }
            }
        );
    } catch (err) {
        console.error("WhatsApp error:", err.response?.data || err.message);
    }
}

// 5. Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("Server running on port", PORT);
});
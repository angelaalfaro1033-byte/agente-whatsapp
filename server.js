const express = require("express");
require("dotenv").config();

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// Página principal
app.get("/", (req, res) => {
    res.send("Agente WhatsApp funcionando");
});

// Verificación del webhook de Meta
app.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
        return res.status(200).send(challenge);
    }

    return res.sendStatus(403);
});

// Recepción de mensajes de WhatsApp
app.post("/webhook", async (req, res) => {
    console.log("Webhook recibido:");
    console.log(JSON.stringify(req.body, null, 2));

    try {
        const message =
            req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

        if (!message) {
            return res.sendStatus(200);
        }

        const from = message.from;

        // Solo procesamos mensajes de texto
        if (message.type !== "text") {
            return res.sendStatus(200);
        }

        const response = await fetch(
            `https://graph.facebook.com/v23.0/${PHONE_NUMBER_ID}/messages`,
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    messaging_product: "whatsapp",
                    to: from,
                    type: "text",
                    text: {
                        body: "¡Hola! 👋 Gracias por escribir a Pipo Arte. ¿En qué podemos ayudarte?"
                    }
                })
            }
        );

        const data = await response.json();

        console.log("Respuesta de WhatsApp:");
        console.log(JSON.stringify(data, null, 2));

        if (!response.ok) {
            console.error("Error enviando mensaje:", data);
        }

        return res.sendStatus(200);

    } catch (error) {
        console.error("Error en webhook:", error);
        return res.sendStatus(200);
    }
});

app.listen(PORT, () => {
    console.log(`Servidor ejecutándose en puerto ${PORT}`);
});
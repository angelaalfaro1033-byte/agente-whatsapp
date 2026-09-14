const express = require("express");
const Groq = require("groq-sdk");
require("dotenv").config();

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const catalogo = require("./data/catalogo");
const groq = new Groq({
    apiKey: GROQ_API_KEY
});

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

// Recepción de mensajes
app.post("/webhook", async (req, res) => {
    console.log("Webhook recibido:");
    console.log(JSON.stringify(req.body, null, 2));

    try {
        const message =
            req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

        if (!message) {
            return res.sendStatus(200);
        }

        if (message.type !== "text") {
            return res.sendStatus(200);
        }

        const from = message.from;
        const userMessage = message.text.body;

        console.log("Mensaje del usuario:", userMessage);

        // Generar respuesta con Groq
        const completion = await groq.chat.completions.create({
            model: "openai/gpt-oss-20b",
            messages: [
                {
    role: "system",
    content: `
Eres el asistente virtual de Pipo Arte.

Tu función es atender clientes, mostrar los productos disponibles, resolver dudas y acompañar al cliente durante el proceso de compra.

REGLAS IMPORTANTES:

1. Responde siempre en español.
2. Usa únicamente la información disponible en el catálogo proporcionado.
3. NO inventes productos, precios, colores, flores, métodos de pago, costos de envío, tiempos de entrega ni otras condiciones.
4. Si una información no está en el catálogo, indica que necesitas confirmarla.
5. No agregues productos que no aparezcan en el catálogo.
6. Cuando el cliente pregunte por los productos, presenta las opciones disponibles de forma clara y sencilla.
7. Si el cliente muestra intención de compra, ayúdalo a avanzar paso a paso.
8. No afirmes que un pago fue recibido o confirmado. Los pagos deben ser verificados manualmente.
9. No menciones que eres una inteligencia artificial, salvo que el cliente lo pregunte directamente.

CATÁLOGO ACTUAL DE PIPO ARTE:

${JSON.stringify(catalogo, null, 2)}
    `
},
                {
                    role: "user",
                    content: userMessage
                }
            ],
            temperature: 0.7,
            max_tokens: 300
        });

        const aiResponse =
            completion.choices[0]?.message?.content ||
            "Gracias por escribir a Pipo Arte. ¿En qué podemos ayudarte?";

        console.log("Respuesta de Groq:", aiResponse);

        // Enviar respuesta por WhatsApp
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
                        body: aiResponse
                    }
                })
            }
        );

        const data = await response.json();

        console.log("Respuesta de WhatsApp:");
        console.log(JSON.stringify(data, null, 2));

        return res.sendStatus(200);

    } catch (error) {
        console.error("Error en webhook:", error);
        return res.sendStatus(200);
    }
});

app.listen(PORT, () => {
    console.log(`Servidor ejecutándose en puerto ${PORT}`);
});
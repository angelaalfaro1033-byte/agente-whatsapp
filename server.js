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

const groq = new Groq({
    apiKey: GROQ_API_KEY
});

const catalogo = require("./data/catalogo");

// Memoria temporal de las conversaciones
const sesiones = new Map();


// =====================================================
// RUTA PRINCIPAL
// =====================================================

app.get("/", (req, res) => {
    res.send("Agente WhatsApp funcionando");
});


// =====================================================
// VERIFICACIÓN DEL WEBHOOK DE META
// =====================================================

app.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
        return res.status(200).send(challenge);
    }

    return res.sendStatus(403);
});


// =====================================================
// WEBHOOK DE WHATSAPP
// =====================================================

app.post("/webhook", async (req, res) => {

    console.log("Webhook recibido:");
    console.log(JSON.stringify(req.body, null, 2));

    try {

        const message =
            req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

        // Si no hay mensaje, no hacemos nada
        if (!message) {
            return res.sendStatus(200);
        }

        // Por ahora solamente procesamos mensajes de texto
        if (message.type !== "text") {
            return res.sendStatus(200);
        }

        const from = message.from;
        const userMessage = message.text.body;

        console.log("Mensaje del usuario:", userMessage);


        // =================================================
        // CREAR O RECUPERAR SESIÓN
        // =================================================

        if (!sesiones.has(from)) {

            sesiones.set(from, {

                mensajes: [],

                pedido: {

                    producto: null,

                    personalizacion: null,

                    plantilla: null,

                    enlace: null,

                    mensaje: null,

                    cancion: null,

                    fotos: [],

                    nombre: null,

                    telefono: null,

                    ciudad: null,

                    direccion: null,

                    valor: null,

                    estado_pedido: "INICIO"

                }

            });

        }


        const sesion = sesiones.get(from);


        // Guardamos el mensaje del cliente
        sesion.mensajes.push({
            role: "user",
            content: userMessage
        });


        // =================================================
        // PREPARAR CONTEXTO PARA GROQ
        // =================================================

        const systemPrompt = `
Eres el asistente virtual de Pipo Arte.

Tu función es atender clientes y acompañarlos durante el proceso de compra.
REGLAS IMPORTANTES:
1. Responde siempre en español.
2. Utiliza únicamente la información disponible en el catálogo.
3. NO inventes productos, precios, colores, flores, métodos de pago, costos de envío, tiempos de entrega ni otras condiciones.
4. Si una información no está disponible en el catálogo, indica que necesitas confirmarla.
6. No afirmes que un pago fue recibido, confirmado o aprobado. Los pagos deben ser verificados manualmente.
7. Sé amable, natural y clara.
8. Haz solamente las preguntas necesarias para avanzar con la compra.
9. Recuerda la información que el cliente ya proporcionó durante esta conversación.
10. No vuelvas a preguntar información que el cliente ya proporcionó.
11. No menciones que eres una inteligencia artificial, salvo que el cliente lo pregunte directamente.
12. No inventes información para completar datos faltantes.
13. Si el cliente pregunta por productos, utiliza exclusivamente los productos del catálogo.
14. Si el cliente selecciona un producto, conserva esa selección durante la conversación.
15. El objetivo es ayudar al cliente a completar una compra, no solamente responder preguntas.

=====================================================
CATÁLOGO DE PIPO ARTE
=====================================================

${JSON.stringify(catalogo, null, 2)}

=====================================================
DATOS ACTUALES DEL PEDIDO
=====================================================

${JSON.stringify(sesion.pedido, null, 2)}

=====================================================
FLUJO DE COMPRA
=====================================================

Sigue este flujo de manera natural.

PASO 1 — PRODUCTOS

Si el cliente quiere conocer los productos:

- Muestra las materas disponibles.
- Incluye nombre, flor, color y precio.
- No agregues productos que no estén en el catálogo.

PASO 2 — FUNCIONAMIENTO

Si el cliente pregunta cómo funciona el producto:

Explica que puede acercar su celular al producto para acceder al contenido personalizado asociado a este.

No es necesario utilizar términos técnicos si no son necesarios.

PASO 3 — ELECCIÓN DEL PRODUCTO

Cuando el cliente seleccione una matera:

- Confirma cuál eligió.
- Conserva esa información.
- Pregunta cómo desea personalizarla.

Las opciones son:

1. Utilizar su propio enlace.
2. Utilizar una plantilla de Pipo Arte.

PASO 4 — ENLACE PERSONALIZADO

Si el cliente elige utilizar su propio enlace:

- Solicita el enlace.
- No inventes el enlace.
- Una vez recibido, continúa con el proceso.

PASO 5 — PLANTILLA

Si el cliente elige una plantilla:

- Muestra las plantillas disponibles.
- Permite que el cliente elija una.
- Después solicita los datos necesarios para personalizarla.

PASO 6 — PERSONALIZACIÓN

Según la plantilla seleccionada, recopila:
- Mensaje.
- Canción.
- Fotografías.
No inventes límites de fotografías si no están definidos en el catálogo.
PASO 7 — CONFIRMACIÓN
Cuando tengas producto y personalización:
- Resume el pedido.
- Indica el valor disponible en el catálogo.
- Pregunta al cliente si desea confirmar.
PASO 8 — DATOS DE ENTREGA
Después de que el cliente confirme el pedido, solicita:
- Nombre del destinatario.
- Teléfono.
- Ciudad.
- Dirección.
No inventes ninguno de estos datos.
PASO 9 — RESUMEN FINAL
Cuando los datos de entrega estén completos:

- Resume producto.
- Personalización.
- Datos de entrega.
- Valor del pedido.
- Pregunta si todo está correcto.

PASO 10 — PAGO

Si el cliente confirma que todo está correcto y pregunta cómo pagar o indica que está listo para pagar:

- Muestra únicamente los métodos de pago disponibles en el catálogo.
- No afirmes que el pago fue recibido.
- No afirmes que el pedido está pagado.
- El pago deberá ser verificado manualmente.

=====================================================
CONVERSACIÓN RECIENTE
=====================================================

Utiliza los últimos mensajes para mantener el contexto de la conversación.

`;


       

        const completion = await groq.chat.completions.create({

            model: "openai/gpt-oss-20b",

            messages: [

                {
                    role: "system",
                    content: systemPrompt
                },

                ...sesion.mensajes.slice(-10)

            ],

            temperature: 0.4,

            max_tokens: 500

        });

        const aiResponse =
            completion.choices[0]?.message?.content ||
            "Gracias por escribir a Pipo Arte. ¿En qué podemos ayudarte?";


        console.log("Respuesta de Groq:");
        console.log(aiResponse);
        sesion.mensajes.push({
            role: "assistant",
            content: aiResponse
        });

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

        console.error("Error en webhook:");

        console.error(error);

        return res.sendStatus(200);

    }

});

app.listen(PORT, () => {

    console.log(
        `Servidor ejecutándose en puerto ${PORT}`
    );

});
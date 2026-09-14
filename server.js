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
const ADMIN_WHATSAPP_NUMBER = process.env.ADMIN_WHATSAPP_NUMBER;

const groq = new Groq({
    apiKey: GROQ_API_KEY
});

const catalogo = require("./data/catalogo");

// Memoria temporal de las conversaciones
const sesiones = new Map();


// =====================================================
// ENVIAR MENSAJE POR WHATSAPP
// =====================================================

async function enviarWhatsApp(numero, mensaje) {

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

                to: numero,

                type: "text",

                text: {
                    body: mensaje
                }
            })
        }
    );

    const data = await response.json();

    console.log("Respuesta de WhatsApp:");

    console.log(JSON.stringify(data, null, 2));

    return data;
}


// =====================================================
// DETECTAR INTENCIÓN DE PAGO
// =====================================================

function detectarIntencionPago(mensaje) {

    const texto = mensaje
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    const frasesPago = [
        "quiero pagar",
        "voy a pagar",
        "puedo pagar",
        "como pago",
        "como puedo pagar",
        "donde pago",
        "pasame los datos para pagar",
        "pasame los datos de pago",
        "datos para pagar",
        "quiero hacer el pago",
        "hacer el pago",
        "listo para pagar",
        "estoy listo para pagar",
        "estoy lista para pagar",
        "ya puedo pagar",
        "quiero realizar el pago",
        "realizar el pago"
    ];

    return frasesPago.some(frase => texto.includes(frase));
}


// =====================================================
// COMPROBAR SI EL PEDIDO ESTÁ SUFICIENTEMENTE AVANZADO
// =====================================================

function pedidoEstaListoParaPago(sesion) {

    const mensajes = sesion.mensajes;

    const conversacion = mensajes
        .map(mensaje => mensaje.content)
        .join(" ")
        .toLowerCase();

    const tieneProducto =
        conversacion.includes("matera");

    const tieneDatosEntrega =
        conversacion.includes("ciudad") ||
        conversacion.includes("dirección") ||
        conversacion.includes("direccion");

    const tieneConfirmacion =
        conversacion.includes("confirmo") ||
        conversacion.includes("confirmado") ||
        conversacion.includes("todo está correcto") ||
        conversacion.includes("todo esta correcto") ||
        conversacion.includes("sí, está correcto") ||
        conversacion.includes("si, esta correcto");

    return tieneProducto && tieneDatosEntrega && tieneConfirmacion;
}


// =====================================================
// CREAR RESUMEN PARA LA NOTIFICACIÓN
// =====================================================

function crearNotificacionPedido(sesion, mensajeCliente) {

    const ultimosMensajes = sesion.mensajes
        .slice(-12)
        .map(mensaje => {

            const rol =
                mensaje.role === "user"
                    ? "Cliente"
                    : "Pipo Arte";

            return `${rol}: ${mensaje.content}`;

        })
        .join("\n\n");

    return `🛍️ PEDIDO LISTO PARA PAGO

El cliente indicó que está listo para realizar el pago.

Último mensaje:
"${mensajeCliente}"

Conversación reciente:

${ultimosMensajes}

⚠️ El pago todavía NO está confirmado.
Debes verificarlo manualmente.`;
}


// =====================================================
// RUTA PRINCIPAL
// =====================================================

app.get("/", (req, res) => {

    res.send("Agente WhatsApp funcionando");

});


// =====================================================
// VERIFICACIÓN DEL WEBHOOK
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

    console.log(
        JSON.stringify(req.body, null, 2)
    );


    try {

        const message =
            req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];


        // No hay mensaje
        if (!message) {

            return res.sendStatus(200);

        }


        // Por ahora solamente procesamos texto
        if (message.type !== "text") {

            return res.sendStatus(200);

        }


        const from = message.from;

        const userMessage = message.text.body;


        console.log(
            "Mensaje del usuario:",
            userMessage
        );


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

                },

                notificadoPago: false

            });

        }


        const sesion = sesiones.get(from);


        // =================================================
        // GUARDAR MENSAJE DEL CLIENTE
        // =================================================

        sesion.mensajes.push({

            role: "user",

            content: userMessage

        });


        // =================================================
        // PREPARAR PROMPT
        // =================================================

        const systemPrompt = `
Eres el asistente virtual de Pipo Arte.

Tu función es atender clientes y acompañarlos durante el proceso de compra.

REGLAS IMPORTANTES:

1. Responde siempre en español.

2. Utiliza únicamente la información disponible en el catálogo.

3. NO inventes productos, precios, colores, flores, métodos de pago, costos de envío, tiempos de entrega ni otras condiciones.

4. Si una información no está disponible en el catálogo, indica que necesitas confirmarla.

5. No incluyas las clases de Pipo Arte. Este flujo solamente gestiona productos y compras.

6. No afirmes que un pago fue recibido, confirmado o aprobado.

7. Sé amable, natural y clara.

8. Haz solamente las preguntas necesarias para avanzar con la compra.

9. Recuerda la información que el cliente ya proporcionó.

10. No vuelvas a preguntar información que el cliente ya proporcionó.

11. No menciones que eres una inteligencia artificial, salvo que el cliente lo pregunte.

12. No inventes información para completar datos faltantes.

13. Si el cliente pregunta por productos, utiliza exclusivamente los productos del catálogo.

14. Si el cliente selecciona un producto, conserva esa selección durante la conversación.

15. El objetivo es ayudar al cliente a completar una compra.

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

PASO 1 — PRODUCTOS

Si el cliente quiere conocer los productos:

- Muestra las materas disponibles.
- Incluye nombre, flor, color y precio.
- No agregues productos que no estén en el catálogo.

PASO 2 — FUNCIONAMIENTO

Si pregunta cómo funciona:

Explica que puede acercar su celular al producto para acceder al contenido personalizado asociado a este.

PASO 3 — ELECCIÓN

Cuando seleccione una matera:

- Confirma cuál eligió.
- Pregunta cómo desea personalizarla.

Opciones:

1. Utilizar su propio enlace.
2. Utilizar una plantilla de Pipo Arte.

PASO 4 — ENLACE

Si elige su propio enlace:

- Solicita el enlace.
- No inventes el enlace.

PASO 5 — PLANTILLA

Si elige una plantilla:

- Muestra las plantillas disponibles.
- Permite que el cliente elija.
- Solicita los datos necesarios.

PASO 6 — PERSONALIZACIÓN

Recopila:

- Mensaje.
- Canción.
- Fotografías.

No inventes límites de fotografías.

PASO 7 — CONFIRMACIÓN

Cuando tengas producto y personalización:

- Resume el pedido.
- Indica el valor.
- Pregunta si desea confirmar.

PASO 8 — DATOS DE ENTREGA

Después de confirmar:

- Nombre del destinatario.
- Teléfono.
- Ciudad.
- Dirección.

PASO 9 — RESUMEN

Cuando los datos estén completos:

- Resume producto.
- Personalización.
- Datos de entrega.
- Valor.
- Pregunta si todo está correcto.

PASO 10 — PAGO

Cuando el pedido esté confirmado y el cliente indique que está listo para pagar:

- Muestra únicamente los métodos de pago del catálogo.
- No afirmes que el pago fue recibido.
- El pago será verificado manualmente.

=====================================================
`;


        // =================================================
        // GROQ
        // =================================================

        const completion =
            await groq.chat.completions.create({

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


        console.log(
            "Respuesta de Groq:"
        );

        console.log(aiResponse);


        // =================================================
        // GUARDAR RESPUESTA DEL AGENTE
        // =================================================

        sesion.mensajes.push({

            role: "assistant",

            content: aiResponse

        });


        // =================================================
        // DETECTAR SI ESTÁ LISTO PARA PAGAR
        // =================================================

        const quierePagar =
            detectarIntencionPago(userMessage);

        const pedidoListo =
            pedidoEstaListoParaPago(sesion);


        console.log(
            "¿Intención de pago?:",
            quierePagar
        );

        console.log(
            "¿Pedido listo?:",
            pedidoListo
        );


        // =================================================
        // NOTIFICAR AL ADMINISTRADOR
        // =================================================

        if (
            quierePagar &&
            pedidoListo &&
            !sesion.notificadoPago
        ) {

            console.log(
                "Cliente listo para pagar. Enviando notificación..."
            );


            if (!ADMIN_WHATSAPP_NUMBER) {

                console.error(
                    "ERROR: ADMIN_WHATSAPP_NUMBER no está configurado."
                );

            } else {

                const notificacion =
                    crearNotificacionPedido(
                        sesion,
                        userMessage
                    );


                try {

                    await enviarWhatsApp(
                        ADMIN_WHATSAPP_NUMBER,
                        notificacion
                    );


                    sesion.notificadoPago = true;

                    sesion.pedido.estado_pedido =
                        "PENDIENTE_PAGO";


                    console.log(
                        "Notificación de pago enviada correctamente."
                    );


                } catch (error) {

                    console.error(
                        "Error enviando notificación de pago:",
                        error
                    );

                }

            }

        }


        // =================================================
        // ENVIAR RESPUESTA AL CLIENTE
        // =================================================

        await enviarWhatsApp(
            from,
            aiResponse
        );


        return res.sendStatus(200);


    } catch (error) {

        console.error(
            "Error en webhook:"
        );

        console.error(error);

        return res.sendStatus(200);

    }

});


// =====================================================
// INICIAR SERVIDOR
// =====================================================

app.listen(PORT, () => {

    console.log(
        `Servidor ejecutándose en puerto ${PORT}`
    );

});
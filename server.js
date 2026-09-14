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


// =====================================================
// DATOS DE PAGO DE PIPO ARTE
// =====================================================

const DATOS_PAGO = {
    nequi: "3223032562",
    davivienda: "@Davi3223032562"
};


// =====================================================
// MEMORIA TEMPORAL DE CONVERSACIONES
// =====================================================

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

    if (!response.ok) {
        throw new Error(
            `Error de WhatsApp: ${JSON.stringify(data)}`
        );
    }

    return data;
}


// =====================================================
// ANALIZAR INTENCIÓN Y ESTADO DEL PEDIDO
// =====================================================

async function analizarEstadoPago(sesion) {

    const conversacion = sesion.mensajes
        .slice(-15)
        .map(mensaje => {

            const rol =
                mensaje.role === "user"
                    ? "CLIENTE"
                    : "PIPO ARTE";

            return `${rol}: ${mensaje.content}`;

        })
        .join("\n\n");


    const prompt = `
Analiza la conversación de compra de Pipo Arte que aparece a continuación.

Tu tarea es determinar si el cliente ha llegado al punto en el que quiere realizar el pago.

NO debes buscar palabras específicas.

Debes interpretar el significado y el contexto de la conversación.

Por ejemplo, pueden existir muchas formas diferentes de expresar una intención de pago:

- El cliente puede decir que quiere pagar.
- Puede preguntar dónde hacer la transferencia.
- Puede escoger uno de los métodos de pago.
- Puede pedir los datos para realizar el pago.
- Puede indicar que ya está haciendo la transferencia.
- Puede decir algo corto como "listo", "dale", "perfecto", etc., si el contexto demuestra que está respondiendo a una solicitud relacionada con el pago.

También debes distinguir entre:

A) El cliente simplemente está preguntando información sobre productos.

B) El cliente todavía está completando su pedido.

C) El pedido ya fue confirmado y el cliente está entrando en la etapa de pago.

D) El cliente afirma que YA realizó el pago.

IMPORTANTE:

- "listo_para_pagar" debe ser true solamente cuando el contexto indique que el cliente está dispuesto a realizar el pago o necesita los datos para hacerlo.
- Si el cliente solamente confirmó que los datos del pedido son correctos y todavía no se ha hablado del pago, no necesariamente significa que ya esté intentando pagar.
- Si el cliente dice que ya realizó el pago, también debe considerarse que llegó a la etapa de pago, pero el pago NO debe considerarse confirmado.
- Nunca determines que un pago está confirmado solamente porque el cliente lo afirma.

Responde ÚNICAMENTE con JSON válido, sin Markdown:

{
  "pedido_confirmado": true o false,
  "listo_para_pagar": true o false,
  "pago_reportado_por_cliente": true o false,
  "explicacion": "explicación muy breve"
}

CONVERSACIÓN:

${conversacion}
`;


    try {

        const completion =
            await groq.chat.completions.create({

                model: "openai/gpt-oss-20b",

                messages: [
                    {
                        role: "system",
                        content: prompt
                    }
                ],

                temperature: 0,

                max_tokens: 200,

                response_format: {
                    type: "json_object"
                }

            });


        const contenido =
            completion.choices[0]?.message?.content || "{}";


        console.log(
            "Análisis de estado de pago:"
        );

        console.log(contenido);


        const resultado =
            JSON.parse(contenido);


        return {

            pedido_confirmado:
                resultado.pedido_confirmado === true,

            listo_para_pagar:
                resultado.listo_para_pagar === true,

            pago_reportado_por_cliente:
                resultado.pago_reportado_por_cliente === true,

            explicacion:
                resultado.explicacion || ""

        };


    } catch (error) {

        console.error(
            "Error analizando intención de pago:",
            error
        );


        return {

            pedido_confirmado: false,

            listo_para_pagar: false,

            pago_reportado_por_cliente: false,

            explicacion: ""

        };

    }

}


// =====================================================
// CREAR NOTIFICACIÓN PARA ANGELA
// =====================================================

function crearNotificacionPago(sesion, estadoPago) {

    const conversacion = sesion.mensajes
        .slice(-15)
        .map(mensaje => {

            const rol =
                mensaje.role === "user"
                    ? "Cliente"
                    : "Pipo Arte";

            return `${rol}: ${mensaje.content}`;

        })
        .join("\n\n");


    let titulo =
        "🛍️ PEDIDO LISTO PARA PAGO";


    if (estadoPago.pago_reportado_por_cliente) {

        titulo =
            "💰 CLIENTE REPORTA QUE YA REALIZÓ EL PAGO";

    }


    return `${titulo}

El sistema detectó que el cliente llegó a la etapa de pago.

⚠️ El pago NO está confirmado automáticamente.
Debe verificarse manualmente.

Conversación reciente:

${conversacion}
`;

}


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

    const mode =
        req.query["hub.mode"];

    const token =
        req.query["hub.verify_token"];

    const challenge =
        req.query["hub.challenge"];


    if (
        mode === "subscribe" &&
        token === VERIFY_TOKEN
    ) {

        return res
            .status(200)
            .send(challenge);

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


        // -------------------------------------------------
        // IGNORAR EVENTOS SIN MENSAJE
        // -------------------------------------------------

        if (!message) {

            return res.sendStatus(200);

        }


        // -------------------------------------------------
        // POR AHORA SOLO TEXTO
        // -------------------------------------------------

        if (message.type !== "text") {

            return res.sendStatus(200);

        }


        const from =
            message.from;

        const userMessage =
            message.text.body;


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


        const sesion =
            sesiones.get(from);


        // =================================================
        // GUARDAR MENSAJE DEL CLIENTE
        // =================================================

        sesion.mensajes.push({

            role: "user",

            content: userMessage

        });


        // =================================================
        // PROMPT PRINCIPAL DEL AGENTE
        // =================================================

        const systemPrompt = `
Eres el asistente virtual de Pipo Arte.

Tu función es atender clientes y acompañarlos durante todo el proceso de compra.

=====================================================
REGLAS GENERALES
=====================================================

1. Responde siempre en español.

2. Utiliza únicamente la información disponible en el catálogo.

3. NO inventes productos, precios, colores, flores, métodos de pago, costos de envío, tiempos de entrega ni otras condiciones.

4. Si una información no está disponible, indica que necesita ser confirmada.

5. No incluyas las clases de Pipo Arte. Este flujo solamente gestiona productos y compras.

6. No afirmes nunca que un pago fue recibido, confirmado o aprobado.

7. Sé amable, natural y clara.

8. Haz solamente las preguntas necesarias para avanzar con la compra.

9. Recuerda la información que el cliente ya proporcionó.

10. No vuelvas a preguntar información que el cliente ya proporcionó.

11. No menciones que eres una inteligencia artificial salvo que el cliente lo pregunte directamente.

12. No inventes información para completar datos faltantes.

13. Si el cliente pregunta por productos, utiliza exclusivamente los productos del catálogo.

14. Si el cliente selecciona un producto, conserva esa selección durante la conversación.

15. El objetivo es ayudar al cliente a completar una compra.
16. Nunca utilices tablas Markdown. En WhatsApp, presenta los productos como una lista limpia, utilizando saltos de línea y negrita para facilitar la lectura.
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

Las opciones son:

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
- Pregunta si todo está correcto.

PASO 8 — DATOS DE ENTREGA

Después de que el cliente confirme:

Solicita:

- Nombre del destinatario.
- Teléfono.
- Ciudad.
- Dirección.

PASO 9 — RESUMEN FINAL

Cuando los datos de entrega estén completos:

- Resume producto.
- Personalización.
- Datos de entrega.
- Valor.
- Pregunta si todo está correcto.

PASO 10 — PAGO

Cuando el cliente llegue a la etapa de pago:

Los datos de pago de Pipo Arte son:

Nequi:
${DATOS_PAGO.nequi}

Davivienda:
${DATOS_PAGO.davivienda}

IMPORTANTE:

- Estos son los datos de Pipo Arte.
- El cliente NO debe proporcionar su propio número de Nequi.
- El cliente NO debe proporcionar su propio número de cuenta para recibir el pago.
- Nunca preguntes al cliente cuál es su número de Nequi para realizar el pago.
- Nunca preguntes al cliente cuál es su número de cuenta para realizar el pago.
- Debes proporcionar directamente los datos de Pipo Arte cuando corresponda.

Puedes indicar que el cliente debe realizar el pago utilizando uno de esos medios.

Después de realizar el pago, puede enviar el comprobante por este mismo medio para que sea verificado manualmente.

NUNCA afirmes que el pago fue recibido solamente porque el cliente diga que pagó.

=====================================================
MÉTODOS DE PAGO
=====================================================

Los únicos métodos de pago disponibles son:

- Nequi
- Davivienda

No cambies ni inventes otros métodos de pago.

=====================================================
`;


        // =================================================
        // RESPUESTA NORMAL DE GROQ
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


        let aiResponse =
            completion.choices[0]?.message?.content ||
            "Gracias por escribir a Pipo Arte. ¿En qué podemos ayudarte?";


        console.log(
            "Respuesta de Groq:"
        );

        console.log(aiResponse);


        // =================================================
        // ANALIZAR CONTEXTO DE PAGO
        // =================================================

        const estadoPago =
            await analizarEstadoPago(sesion);


        console.log(
            "Estado de pago detectado:"
        );

        console.log(
            JSON.stringify(
                estadoPago,
                null,
                2
            )
        );


        // =================================================
        // SI ESTÁ LISTO PARA PAGAR
        // =================================================

        if (
            estadoPago.listo_para_pagar
        ) {

            sesion.pedido.estado_pedido =
                "PENDIENTE_PAGO";


            // ---------------------------------------------
            // FORZAR LOS DATOS CORRECTOS DE PAGO
            // ---------------------------------------------

            aiResponse = `Perfecto. Puedes realizar el pago por cualquiera de estos medios:

*Nequi:* ${DATOS_PAGO.nequi}

*Davivienda:* ${DATOS_PAGO.davivienda}

Cuando realices el pago, puedes enviarnos el comprobante por este mismo medio para verificarlo manualmente.

Tu pago quedará pendiente de verificación hasta que lo revisemos.`;


            // ---------------------------------------------
            // NOTIFICAR A ANGELA UNA SOLA VEZ
            // ---------------------------------------------

            if (!sesion.notificadoPago) {

                if (!ADMIN_WHATSAPP_NUMBER) {

                    console.error(
                        "ADMIN_WHATSAPP_NUMBER no está configurado en Render."
                    );

                } else {

                    try {

                        const notificacion =
                            crearNotificacionPago(
                                sesion,
                                estadoPago
                            );


                        await enviarWhatsApp(
                            ADMIN_WHATSAPP_NUMBER,
                            notificacion
                        );


                        sesion.notificadoPago =
                            true;


                        console.log(
                            "Notificación de pago enviada correctamente."
                        );


                    } catch (error) {

                        console.error(
                            "Error enviando notificación:",
                            error
                        );

                    }

                }

            }

        }


        // =================================================
        // SI EL CLIENTE DICE QUE YA PAGÓ
        // =================================================

        if (
            estadoPago.pago_reportado_por_cliente
        ) {

            sesion.pedido.estado_pedido =
                "PAGO_POR_VERIFICAR";


            aiResponse = `Gracias. Hemos recibido tu mensaje.

El pago todavía debe ser verificado manualmente.

Puedes enviarnos el comprobante de pago por este mismo medio y lo revisaremos.`;


            // ---------------------------------------------
            // NOTIFICAR A ANGELA
            // ---------------------------------------------

            if (!sesion.notificadoPago) {

                if (ADMIN_WHATSAPP_NUMBER) {

                    try {

                        const notificacion =
                            crearNotificacionPago(
                                sesion,
                                estadoPago
                            );


                        await enviarWhatsApp(
                            ADMIN_WHATSAPP_NUMBER,
                            notificacion
                        );


                        sesion.notificadoPago =
                            true;


                    } catch (error) {

                        console.error(
                            "Error enviando notificación de pago:",
                            error
                        );

                    }

                }

            }

        }


        // =================================================
        // GUARDAR RESPUESTA DEL AGENTE
        // =================================================

        sesion.mensajes.push({

            role: "assistant",

            content: aiResponse

        });


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
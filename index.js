import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import axios from "axios";
dotenv.config();

const app = express();
app.use(bodyParser.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// ✅ 1. Verificación del webhook con Meta
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token && mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verificado correctamente.");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ✅ 2. Recepción de mensajes
app.post("/webhook", async (req, res) => {
  try {
    const data = req.body;
    if (data.entry && data.entry[0].changes) {
      const message = data.entry[0].changes[0].value.messages?.[0];
      if (message) {
        const from = message.from;

        let userResponse = "";

        if (message.type === "text") {
          userResponse = message.text.body.toLowerCase();
        } else if (message.type === "interactive") {
          const interactive = message.interactive;
          if (interactive.type === "button_reply") {
            userResponse = interactive.button_reply.id.toLowerCase();
          } else if (interactive.type === "list_reply") {
            userResponse = interactive.list_reply.id.toLowerCase();
          }
        }

        // Lógica principal
        if (userResponse === "acepto") {
          await sendMainMenu(from);
        } else if (userResponse === "no_acepto") {
          await sendMessage({
            messaging_product: "whatsapp",
            to: from,
            type: "text",
            text: { body: "❌ Has rechazado la autorización. No podemos continuar." },
          });
        } else {
          await sendDataAuthorization(from);
        }
      }
    }
    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error en webhook:", err);
    res.sendStatus(500);
  }
});

// ✅ 3. Función: Solicitar autorización de datos
async function sendDataAuthorization(to) {
  const body = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text:
          "🛡️ *Autorización de tratamiento de datos personales*\n\n" +
          "Antes de continuar, confirma que autorizas a [Nombre de la Empresa] " +
          "a tratar tus datos conforme a la Ley 1581 de 2012.\n\n" +
          "¿Aceptas continuar?",
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: { id: "acepto", title: "✅ Acepto" },
          },
          {
            type: "reply",
            reply: { id: "no_acepto", title: "❌ No acepto" },
          },
        ],
      },
    },
  };
  await sendMessage(body);
}

// ✅ 4. Menú principal
async function sendMainMenu(to) {
  const body = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      header: { type: "text", text: "📋 Menú Principal" },
      body: {
        text: "Selecciona una opción para continuar:",
      },
      footer: { text: "Atención automatizada de la empresa" },
      action: {
        button: "Ver opciones",
        sections: [
          {
            title: "Opciones disponibles",
            rows: [
              { id: "servicios", title: "🧰 Servicios", description: "Ver catálogo o descripción" },
              { id: "contacto", title: "📞 Contacto", description: "Hablar con un asesor" },
              { id: "ubicacion", title: "📍 Ubicación", description: "Ver dirección o mapa" },
            ],
          },
        ],
      },
    },
  };
  await sendMessage(body);
}

// ✅ 5. Envío genérico a la API de WhatsApp
async function sendMessage(body) {
  try {
    await axios.post(
      `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
      body,
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
    );
  } catch (error) {
    console.error("Error enviando mensaje:", error.response?.data || error);
  }
}

app.listen(process.env.PORT, () => {
  console.log(`🚀 Servidor activo en puerto ${process.env.PORT}`);
});

import express from "express";
import axios from "axios";
import bodyParser from "body-parser";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(bodyParser.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// Estado por usuario (para guardar autorización y posición en el menú)
const userState = {};

// ✅ 1. Verificación del webhook con Meta
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verificado correctamente.");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// 📩 2. Recepción de mensajes entrantes
app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // confirmación rápida a Meta

  try {
    const data = req.body;
    if (data.entry && data.entry[0].changes && data.entry[0].changes[0].value.messages) {
      const message = data.entry[0].changes[0].value.messages[0];
      const from = message.from;

      // Inicializar estado si no existe
      if (!userState[from]) userState[from] = { autorizado: false, menu: "inicio" };

      let userResponse = "";

      // Detectar tipo de mensaje
      if (message.type === "text") {
        userResponse = message.text.body.toLowerCase().trim();
      } else if (message.type === "interactive") {
        const interactive = message.interactive;
        if (interactive.type === "button_reply") {
          userResponse = interactive.button_reply.id.toLowerCase();
        } else if (interactive.type === "list_reply") {
          userResponse = interactive.list_reply.id.toLowerCase();
        }
      }

      // --- Paso 1: Autorización de datos ---
      if (!userState[from].autorizado) {
        if (userResponse === "acepto") {
          userState[from].autorizado = true;
          await sendMainMenu(from);
          return;
        } else if (userResponse === "no_acepto") {
          await sendMessage(from, "❌ Has rechazado la autorización. No podemos continuar.");
          return;
        } else {
          await sendDataAuthorization(from);
          return;
        }
      }

      // --- Paso 2: Menú principal ---
      if (userResponse === "menu" || userResponse.includes("hola") || userResponse.includes("buen")) {
        userState[from].menu = "principal";
        await sendMainMenu(from);
        return;
      }

      // --- Paso 3: Procesar selección ---
      if (userState[from].menu === "principal") {
        switch (userResponse) {
          case "1":
          case "servicios":
            await sendMessage(
              from,
              "💳 *La Tarjeta Pabón Más* es una membresía exclusiva de la *Clínica Pabón*.\n\n" +
                "🔹 Ofrece descuentos de hasta *50%* en servicios médicos, laboratorios y bienestar.\n" +
                "🔹 Pensada para cuidar tu salud y la de tu familia a un precio accesible.\n\n" +
                "✳️ Escribe *menú* para volver al inicio."
            );
            break;

          case "2":
          case "beneficios":
            userState[from].menu = "beneficios";
            await sendMessage(
              from,
              "🎁 *Beneficios y Paquetes Disponibles*\n\n" +
                "1️⃣ Paquete Diabetes\n" +
                "2️⃣ Paquete Senior (Adulto Mayor)\n" +
                "3️⃣ Paquete Cesárea\n" +
                "4️⃣ Paquete Pediátrico\n\n" +
                "✳️ Escribe el número o nombre del paquete.\n" +
                "↩️ Escribe *menú* para volver al inicio."
            );
            break;

          case "3":
          case "comprar":
            await sendMessage(
              from,
              "💳 *¿Quieres adquirir la Tarjeta Pabón Más?*\n\n" +
                "Puedes hacerlo contactando a uno de nuestros asesores:\n" +
                "📞 *320 828 3812*\n\n" +
                "🏥 Clínica Pabón: Cra. 33 No. 12a-44, Pasto\n" +
                "🏢 Sede Especialidades: Cra. 36 No. 13-26, Av. Panamericana\n\n" +
                "✳️ Escribe *menú* para volver al inicio."
            );
            break;

          case "4":
          case "contacto":
            await sendMessage(
              from,
              "📞 *Contacto y Ubicación*\n\n" +
                "Teléfono: *320 828 3812*\n" +
                "🏥 Clínica Pabón: Cra. 33 No. 12a-44, Pasto\n" +
                "🏢 Sede Especialidades: Cra. 36 No. 13-26, Av. Panamericana\n\n" +
                "✳️ Escribe *menú* para volver al inicio."
            );
            break;

          default:
            await sendMainMenu(from);
        }
      }
    }
  } catch (err) {
    console.error("❌ Error al procesar mensaje:", err.message);
  }
});

// 🛡️ 3. Solicitud de autorización de datos personales
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
          "Antes de continuar, confirma que autorizas a *Clínica Pabón* " +
          "a tratar tus datos conforme a la Ley 1581 de 2012.\n\n" +
          "¿Aceptas continuar?",
      },
      action: {
        buttons: [
          { type: "reply", reply: { id: "acepto", title: "✅ Acepto" } },
          { type: "reply", reply: { id: "no_acepto", title: "❌ No acepto" } },
        ],
      },
    },
  };
  await sendMessageRaw(body);
}

// 📋 4. Menú principal (interactivo con lista)
async function sendMainMenu(to) {
  const body = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      header: { type: "text", text: "📋 Menú Principal" },
      body: { text: "Selecciona una opción para continuar:" },
      footer: { text: "Atención automatizada Clínica Pabón" },
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
  await sendMessageRaw(body);
}

// 🧠 5. Enviar mensajes de texto simples
async function sendMessage(to, text) {
  await sendMessageRaw({
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text },
  });
}

// 📡 6. Envío genérico a la API de WhatsApp
async function sendMessageRaw(body) {
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

// 🚀 7. Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor activo en puerto ${PORT}`));

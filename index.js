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

// Estado por usuario
const userState = {};

// 🟢 Verificación inicial del webhook
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verificado correctamente ✅");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// 📩 Recepción de mensajes
app.post("/webhook", async (req, res) => {
  const data = req.body;

  // Confirma recepción inmediata
  res.sendStatus(200);

  try {
    if (data.entry && data.entry[0].changes && data.entry[0].changes[0].value.messages) {
      const message = data.entry[0].changes[0].value.messages[0];
      const from = message.from; // Número del usuario
      const text = (message.text?.body || "").toLowerCase().trim();

      if (!userState[from]) userState[from] = { menu: "principal" };

      // --- MENÚ INICIO ---
      if (text === "menu" || text.includes("hola") || text.includes("buen")) {
        userState[from] = { menu: "principal" };
        await sendMessage(from,
          "👋 Hola! Bienvenido a *Tarjeta Pabón Más*.\n\n" +
          "📋 *Menú principal:*\n\n" +
          "1️⃣ Qué es la Tarjeta Pabón Más\n" +
          "2️⃣ Beneficios y Paquetes Especiales\n" +
          "3️⃣ Medios de Pago / Comprar Tarjeta\n" +
          "4️⃣ Contacto y Ubicación\n\n" +
          "👉 Escribe el número de la opción que desees."
        );
        return;
      }

      // --- MENÚ PRINCIPAL ---
      if (userState[from].menu === "principal") {
        if (text === "1") {
          await sendMessage(from,
            "💳 *La Tarjeta Pabón Más* es una membresía exclusiva de la *Clínica Pabón*.\n\n" +
            "🔹 Ofrece descuentos de hasta *50%* en servicios médicos, laboratorios y bienestar.\n" +
            "🔹 Pensada para cuidar tu salud y la de tu familia a un precio accesible.\n\n" +
            "✳️ Escribe *menú* para volver al inicio."
          );
          return;
        }

        if (text === "2") {
          userState[from].menu = "beneficios";
          await sendMessage(from,
            "🎁 *Beneficios y Paquetes Disponibles*\n\n" +
            "1️⃣ Paquete Diabetes\n" +
            "2️⃣ Paquete Senior (Adulto Mayor)\n" +
            "3️⃣ Paquete Cesárea\n" +
            "4️⃣ Paquete Pediátrico\n\n" +
            "✳️ Escribe el número o nombre del paquete.\n" +
            "↩️ Escribe *menú* para volver al inicio."
          );
          return;
        }

        if (text === "3" || text.includes("comprar")) {
          await sendMessage(from,
            "💳 *¿Quieres adquirir la Tarjeta Pabón Más?*\n\n" +
            "Puedes hacerlo contactando a uno de nuestros asesores:\n" +
            "📞 *320 828 3812*\n\n" +
            "🏥 Clínica Pabón: Cra. 33 No. 12a-44, Pasto\n" +
            "🏢 Sede Especialidades: Cra. 36 No. 13-26, Av. Panamericana\n\n" +
            "✳️ Escribe *menú* para volver al inicio."
          );
          return;
        }

        if (text === "4") {
          await sendMessage(from,
            "📞 *Contacto y Ubicación*\n\n" +
            "Teléfono: *320 828 3812*\n" +
            "🏥 Clínica Pabón: Cra. 33 No. 12a-44, Pasto\n" +
            "🏢 Sede Especialidades: Cra. 36 No. 13-26, Av. Panamericana\n\n" +
            "✳️ Escribe *menú* para volver al inicio."
          );
          return;
        }

        await sendMessage(from,
          "⚠️ *Opción no válida.*\nPor favor selecciona una opción del menú:\n" +
          "1️⃣ Qué es la Tarjeta Pabón Más\n" +
          "2️⃣ Beneficios y Paquetes\n" +
          "3️⃣ Medios de Pago\n" +
          "4️⃣ Contacto\n\n" +
          "✳️ Escribe *menú* para volver al inicio."
        );
      }
    }
  } catch (err) {
    console.error("❌ Error al procesar mensaje:", err.message);
  }
});

// 🧠 Función auxiliar para enviar mensajes
async function sendMessage(to, text) {
  await axios.post(
    `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    },
    {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
    }
  );
}

// 🚀 Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor activo en puerto ${PORT}`));

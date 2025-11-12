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

    // Validación robusta para evitar errores si el body no contiene mensajes
    if (
      !data.entry ||
      !data.entry[0].changes ||
      !data.entry[0].changes[0].value.messages
    )
      return;

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

    console.log(`👤 Usuario: ${from} | Respuesta: ${userResponse}`);

    // --- Paso 1: Autorización de datos ---
    if (!userState[from].autorizado) {
      if (userResponse === "acepto") {
        userState[from].autorizado = true;

        await sendMessage(
          from,
          "💳 *La Tarjeta Pabón Más* es una membresía exclusiva de la *Clínica Pabón*.\n\n" +
            "🔹 Ofrece descuentos de hasta *50%* en servicios médicos, laboratorios y bienestar.\n" +
            "🔹 Pensada para cuidar tu salud y la de tu familia a un precio accesible.\n\n" +
            "🔹 Facilita el acceso a servicios de salud privados de alta calidad a través de tarifas preferenciales.\n" +
            "🔹 Atención prioritaria y beneficios adicionales."
        );

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
    if (
      userResponse === "menu" ||
      userResponse.includes("hola") ||
      userResponse.includes("buen")
    ) {
      userState[from].menu = "principal";

      await sendMessage(
        from,
        "💳 *La Tarjeta Pabón Más* es una membresía exclusiva de la *Clínica Pabón*.\n\n" +
          "🔹 Ofrece descuentos de hasta *50%* en servicios médicos, laboratorios y bienestar.\n" +
          "🔹 Pensada para cuidar tu salud y la de tu familia a un precio accesible.\n\n" +
          "🔹 Facilita el acceso a servicios de salud privados de alta calidad a través de tarifas preferenciales.\n" +
          "🔹 Atención prioritaria y beneficios adicionales."
      );

      await sendMainMenu(from);
      return;
    }

    // --- Paso 3: Procesar selección ---
    console.log(`📋 Menú actual: ${userState[from].menu}`);

    if (userState[from].menu === "principal") {
      switch (userResponse) {
        case "portafolio":
          await sendMessage(
            from,
            "Conoce todo nuestro portafolio 👇\nhttps://heyzine.com/flip-book/f374307816.html"
          );
          await sendBackButton(from);
          break;

        case "suscribete":
          await sendMessage(
            from,
            "🪪 Con un único pago anual de *100.000* incluye:\n- 1 titular y 3 beneficiarios."
          );
          await sendBackButton(from);
          break;

        case "medios":
          await sendMessage(from, "💰 Medios de pago disponibles: Nequi, Bancolombia y efectivo.");
          await sendBackButton(from);
          break;

        case "contactos":
          await sendMessage(
            from,
            "📞 *Contacto y Ubicación*\n\n" +
              "Teléfono: *320 828 3812*\n" +
              "🏥 Clínica Pabón: Cra. 33 No. 12a-44, Pasto\n" +
              "🏢 Sede Especialidades: Cra. 36 No. 13-26, Av. Panamericana\n\n" +
              "✳️ Escribe *menú* para volver al inicio."
          );
          await sendBackButton(from);
          break;

        case "citas":
          await sendMessage(
            from,
            "📅 Para agendar una cita, comunícate al 📞 *320 828 3812* o visita nuestras sedes."
          );
          await sendBackButton(from);
          break;

        case "asesor":
          await sendMessage(
            from,
            "👩‍💼 Puedes contactar a un asesor directamente al 📞 *320 828 3812*."
          );
          await sendBackButton(from);
          break;

        default:
          await sendMainMenu(from);
      }
    }
  } catch (err) {
    console.error("❌ Error al procesar mensaje:", err);
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

// 🔙 4. Botón para volver al menú principal
async function sendBackButton(to) {
  const body = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: "¿Deseas volver al menú principal?",
      },
      action: {
        buttons: [{ type: "reply", reply: { id: "menu", title: "🏠 Volver al menú" } }],
      },
    },
  };
  await sendMessageRaw(body);
}

// 📋 5. Menú principal (interactivo con lista)
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
              { id: "portafolio", title: "🧰 Portafolio", description: "Explora nuestros servicios" },
              { id: "suscribete", title: "🔔 ¡Suscríbete!", description: "Beneficios de la Tarjeta Más" },
              { id: "medios", title: "💳 Medios de pago", description: "Formas de pago disponibles" },
              { id: "contactos", title: "📍 Contacto", description: "Ubicación y atención" },
              { id: "citas", title: "📅 Agenda tu cita", description: "Programa tu atención" },
              { id: "asesor", title: "📞 Comunícate", description: "Habla con un asesor" },
            ],
          },
        ],
      },
    },
  };
  await sendMessageRaw(body);
}

// 🧠 6. Enviar mensajes de texto simples
async function sendMessage(to, text) {
  await sendMessageRaw({
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text },
  });
}

// 📡 7. Envío genérico a la API de WhatsApp
async function sendMessageRaw(body) {
  try {
    await axios.post(
      `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
      body,
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
    );
  } catch (error) {
    console.error("❌ Error enviando mensaje:", error.response?.data || error);
  }
}

// 🚀 8. Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor activo en puerto ${PORT}`));

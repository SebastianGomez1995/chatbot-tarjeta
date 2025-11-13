import express from "express";
import axios from "axios";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();
const app = express();
app.use(bodyParser.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// === Persistencia de usuarios ===
const usersFile = path.join(process.cwd(), "./data/users.json");

function loadUsers() {
  if (!fs.existsSync(usersFile)) {
    fs.writeFileSync(usersFile, JSON.stringify({}, null, 2));
  }
  return JSON.parse(fs.readFileSync(usersFile));
}

function saveUsers(users) {
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
}

function getUser(numero) {
  const users = loadUsers();
  if (!users[numero]) {
    users[numero] = { autorizo: false, servicios: [], suscribete: false };
    saveUsers(users);
  }
  return users[numero];
}

function updateUser(numero, data) {
  const users = loadUsers();
  users[numero] = { ...users[numero], ...data };
  saveUsers(users);
}

// === 1. Verificación webhook Meta ===
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verificado.");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// === 2. Recepción de mensajes ===
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const data = req.body;
    if (data.entry?.[0]?.changes?.[0]?.value?.messages) {
      const message = data.entry[0].changes[0].value.messages[0];
      const from = message.from;
      const user = getUser(from);

      let userResponse = "";
      if (message.type === "text") userResponse = message.text.body.toLowerCase().trim();
      else if (message.type === "interactive") {
        const inter = message.interactive;
        userResponse =
          inter.type === "button_reply" ? inter.button_reply.id.toLowerCase() : inter.list_reply.id.toLowerCase();
      }

      // === Autorización ===
      if (!user.autorizo) {
        if (userResponse === "acepto") {
            updateUser(from, { autorizo: true, autorizo_fecha: new Date().toISOString() });
            await sendMessage(from, "✅ Gracias por autorizar el tratamiento de datos.");
            await sendMainMenu(from);
            return;
      }
      else if (userResponse === "no_acepto") {
          await sendMessage(from, "❌ No podemos continuar sin autorización.");
          return;
        } else {
          await sendDataAuthorization(from);
          return;
        }
      }

      // === Menú principal ===
      if (userResponse === "menu" || userResponse.includes("hola")) {
        await sendMainMenu(from);
        return;
      }

      switch (userResponse) {
        case "portafolio":
          await sendMessage(from, "🧰 Conoce nuestro portafolio:\nhttps://heyzine.com/flip-book/f374307816.html#page/1");
          updateUser(from, { servicios: [...new Set([...user.servicios, "portafolio"])] });
          break;

      case "suscribete":
      if (!user.suscribete) {
        // 🔔 Mostrar botones para confirmar suscripción
        const body = {
          messaging_product: "whatsapp",
          to: from,
          type: "interactive",
          interactive: {
            type: "button",
            body: {
              text:
                "🔔 *Suscripción a notificaciones*\n\n¿Deseas recibir novedades, recordatorios y avisos importantes por WhatsApp?",
            },
            action: {
              buttons: [
                { type: "reply", reply: { id: "confirmar_suscripcion", title: "✅ Sí, suscribirme" } },
                { type: "reply", reply: { id: "rechazar_suscripcion", title: "❌ No, gracias" } },
              ],
            },
          },
        };
        await sendMessageRaw(body);
      } else {
        // Ya está suscrito → ofrecer cancelar
        const body = {
          messaging_product: "whatsapp",
          to: from,
          type: "interactive",
          interactive: {
            type: "button",
            body: {
              text:
                "🔔 Ya tienes una suscripción activa para recibir notificaciones.\n\n¿Quieres cancelar tu suscripción?",
            },
            action: {
              buttons: [
                { type: "reply", reply: { id: "cancelar_suscripcion", title: "🛑 Cancelar" } },
                { type: "reply", reply: { id: "mantener_suscripcion", title: "👍 Mantenerme" } },
              ],
            },
          },
        };
        await sendMessageRaw(body);
      }
      break;

    case "confirmar_suscripcion":
      updateUser(from, {
        suscribete: true,
        suscribete_fecha: new Date().toISOString(),
        opt_out: false,
      });
      await sendMessage(
        from,
        "🎉 Te has suscrito con éxito a nuestras notificaciones. Puedes darte de baja cuando quieras escribiendo *STOP*."
      );
      break;

    case "rechazar_suscripcion":
      updateUser(from, { suscribete: false });
      await sendMessage(from, "❌ No recibirás notificaciones. Si cambias de opinión, ingresa a la opcion de menu-> suscribirte, para estar al tanto de todas nuestras ofertas !.");
      break;

    case "cancelar_suscripcion":
      updateUser(from, { suscribete: false, opt_out: true });
      await sendMessage(from, "🛑 Te extrañaremos! no recibiras mas notificaciones de las ofertas que tenemos para ti.");
      break;

    case "mantener_suscripcion":
      updateUser(from, {
        suscribete: true,
        opt_out: false,
      });
      await sendMessage(from, "👍 Perfecto, mantendremos activa tu suscripción a notificaciones.");
      break;



        case "medios":
          await sendMessage(from, "💵 Medios de pago: Nequi, Daviplata o efectivo en nuestras sedes.");
          updateUser(from, { servicios: [...new Set([...user.servicios, "medios"])] });
          break;

        case "contactos":
          await sendMessage(
            from,
            "📍 *Clínica Pabón*\nTel: 320 828 3812\nCra. 33 No. 12a-44, Pasto\n✳️ Escribe *menú* para volver."
          );
          updateUser(from, { servicios: [...new Set([...user.servicios, "contactos"])] });
          break;

        case "asesor":
          await sendMessage(from, "📞 Contacta con un asesor: 320 828 3812");
          updateUser(from, { servicios: [...new Set([...user.servicios, "asesor"])] });
          break;

        default:
          await sendMainMenu(from);
      }
    }
  } catch (err) {
    console.error("❌ Error procesando mensaje:", err.message);
  }
});

// === 3. Mensajes interactivos ===
async function sendDataAuthorization(to) {
  const body = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text:
          "🛡️ *Autorización de tratamiento de datos personales*\n\nAntes de continuar, confirma que autorizas a *Clínica Pabón* " +
          "a tratar tus datos conforme a la Ley 1581 de 2012.\n\n¿Aceptas continuar?",
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

async function sendMainMenu(to) {
  const body = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      header: { type: "text", text: "📋 Menú Principal" },
      body: { text: "Selecciona una opción:" },
      footer: { text: "Atención automatizada Clínica Pabón" },
      action: {
        button: "Ver opciones",
        sections: [
          {
            title: "Opciones disponibles",
            rows: [
              { id: "portafolio", title: "🧰 Portafolio", description: "Explora nuestros servicios" },
              { id: "suscribete", title: "🔔 ¡Suscríbete!", description: "Beneficios exclusivos" },
              { id: "medios", title: "💵 Medios de pago", description: "Opciones disponibles" },
              { id: "contactos", title: "📍 Contacto", description: "Ubicación y teléfono" },
              { id: "asesor", title: "📞 Asesor", description: "Habla con un asesor" },
            ],
          },
        ],
      },
    },
  };
  await sendMessageRaw(body);
}

// === 4. Envío genérico a API WhatsApp ===
async function sendMessage(to, text) {
  await sendMessageRaw({ messaging_product: "whatsapp", to, type: "text", text: { body: text } });
}

async function sendMessageRaw(body) {
  try {
    await axios.post(`https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`, body, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
    });
  } catch (error) {
    console.error("Error enviando mensaje:", error.response?.data || error);
  }
}

// === 5. Servidor activo ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor activo en puerto ${PORT}`));

// === API para dashboard ===
app.get("/api/users", (req, res) => {
  const users = loadUsers();
  res.json(users);
});

app.get("/api/users/:numero", (req, res) => {
  const users = loadUsers();
  const user = users[req.params.numero];
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
  res.json(user);
});

app.put("/api/users/:numero", (req, res) => {
  const users = loadUsers();
  if (!users[req.params.numero]) return res.status(404).json({ error: "Usuario no encontrado" });
  users[req.params.numero] = { ...users[req.params.numero], ...req.body };
  saveUsers(users);
  res.json({ ok: true, user: users[req.params.numero] });
});

// === 6. Envío de mensajes masivos ===
app.post("/send-broadcast", async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "Falta el campo 'message'" });

  const users = loadUsers();
  const recipients = Object.keys(users).filter(num => {
  const u = users[num];
  return u.autorizo && u.suscribete && !u.opt_out;
  });



  if (recipients.length === 0) {
    return res.status(200).json({ message: "No hay usuarios suscritos para enviar el mensaje." });
  }

  console.log(`🚀 Enviando mensaje masivo a ${recipients.length} usuarios...`);

  let enviados = 0;
  for (const to of recipients) {
    try {
      await sendMessage(to, message);
      enviados++;
      console.log(`✅ Mensaje enviado a ${to}`);
      // Espera 2 segundos entre mensajes para no saturar el API
      await new Promise(r => setTimeout(r, 2000));
    } catch (error) {
      console.error(`❌ Error enviando a ${to}:`, error.response?.data || error.message);
    }
  }

  res.json({ success: true, enviados, total: recipients.length });
});

app.post("/api/subscribe", (req, res) => {
  const { numero, opt_in } = req.body;
  if (!numero) return res.status(400).json({ error: "Número requerido" });

  const users = loadUsers();
  if (!users[numero]) {
    users[numero] = { autorizo: false, servicios: [], suscribete: false };
  }

  users[numero].suscribete = !!opt_in;
  users[numero].suscribete_fecha = new Date().toISOString();
  saveUsers(users);

  res.json({ ok: true, user: users[numero] });
});



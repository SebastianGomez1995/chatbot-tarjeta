import express from "express";
import axios from "axios";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { title } from "process";

dotenv.config();
const app = express();
app.use(bodyParser.json());

app.use("/media", express.static(path.join(process.cwd(), "media")));
const userState = {};

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const URLBOT = process.env.URLBOT;

// === Archivos ===
const usersFile = path.join(process.cwd(), "./data/users.json");
const paquetesFile = path.join(process.cwd(), "./data/paquetes.json");

// === Funciones para usuarios ===
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
    users[numero] = { autorizo: false, servicios: [],paquetes:[],suscribete: false, opt_out:false };
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
      if(!userState[from]) userState[from] = {menu: "principal"}
      let userResponse = "";
      if (message.type === "text") userResponse = message.text.body.toLowerCase().trim();
      else if (message.type === "interactive") {
        const inter = message.interactive;
        userResponse =
          inter.type === "button_reply" ? inter.button_reply.id.toLowerCase() : inter.list_reply.id.toLowerCase();
      }
      let button
      const now = Date.now();
      const lastMessage = user.lastMessage || 0;
      const diffHours = (now - lastMessage) / (1000 * 60 * 60);
      let messagecitas
      let url
      let encodedMessage

      updateUser(from, { lastMessage: now });

      
      if (diffHours >= 5) {
        await sendMessage(from,"👋 Hola, soy *Lorena* ☺️ chat bot de Tarjeta Pabón Más\n\n" +
                               "💳 Una Tarjeta Pensada para ti y tu familia, esta membresía te brinda acceso fácil y rápido a servicios de salud privados de alta calidad, con tarifas preferenciales, atención prioritaria y beneficios exclusivos que mejoran tu bienestar." );
      }
      // === Autorización ===
      if (!user.autorizo) {
        if (userResponse === "acepto") {
          updateUser(from, { autorizo: true, autorizo_fecha: new Date().toISOString() });
          await sendMessage(from, "✅ Gracias por autorizar el tratamiento de datos.");
          await sendMainMenu(from);
          return;
        } else if (userResponse === "no_acepto") {
          messagecitas = "Hola 👋 necesito hablar con un asesor";
          encodedMessage = encodeURIComponent(messagecitas);
          url = `https://wa.me/573208283812?text=${encodedMessage}`;
          await sendMessage(from, "☹️ No podemos continuar sin autorización.\n" + 
                                  "📞 Contacta con un asesor para mas informacion haciendo click en el siguiente enlace:\n\n"+
                                  url);
          
          return;
        } else {
          await sendDataAuthorization(from);
          return;
        }
      }

      // === Menú principal ===
      if (userResponse === "menu" || userResponse.includes("hola")|| userResponse.includes("buen")|| userResponse.includes("dias")|| userResponse.includes("noches")|| userResponse.includes("tardes")) {
        await sendMainMenu(from);
        userState[from].menu = "principal"
        return;
      }
      
      
        
      

      switch (userResponse) {
        case "portafolio":
          await sendMessage(from, "💬 Descubre todo lo que tenemos para ti\n\n" + 
                                  "Conoce nuestro portafolio de servicios y encuentra soluciones diseñadas para tus necesidades.");
            //"🧰 Conoce nuestro portafolio:\nhttps://heyzine.com/flip-book/f374307816.html#page/1");
          updateUser(from, { servicios: [...new Set([...user.servicios, "portafolio"])] });
          await sendPaquetesMenu(from);
          userState[from].menu = "portafolio"
          break;
        case "revista":
            updateUser(from, { paquetes: [...new Set([...user.paquetes, "revista"])] });
            
            await sendMessage(from,"📰 ¡Te invitamos a conocer nuestra revista digital!\n\n" +
                                   "Explora nuestro catálogo completo con todos los productos y servicios en un solo lugar.\n"+
                                   "✨ Inspírate, elige y descubre lo que tenemos para ti.\n\n" +
                                   "https://heyzine.com/flip-book/f374307816.html#page/1" );
            button = [{ type: "reply", reply: { id: "portafolio", title: "🏠 Menú Anterior" } },
                      { type: "reply", reply: { id: "menu", title: "🏠 Menú Principal" } }]
            await sendBackButton(from, button, "Seleccione una opcion:");
        break;
          
        case "suscribete":
          await sendMessage(from, "💥 ¡Aprovecha nuestra membresía anual!\n\n" +
                                  "Por solo $100.000 al año, obtienes beneficios exclusivos para 1 titular y 3 beneficiarios.\n" +
                                  "🔔 Activa las notificaciones y sé el primero en recibir novedades, promociones y contenido especial.\n\n" +

                                  "👉 ¡No te quedes por fuera!")
          button = [
                    { type: "reply", reply: { id: "adquirir", title: "💳 Adquirir" } },
    
                  ],
          await sendBackButton(from, button,"💳 Adquiere tu Tarjeta Pabón Más", false);
          if (!user.suscribete) {
            button = [
                    { type: "reply", reply: { id: "confirmar_suscripcion", title: "✅ Sí, suscribirme" } },
                    { type: "reply", reply: { id: "rechazar_suscripcion", title: "❌ No, gracias" } },
                  ]
            await sendBackButton(from, button,"🔔 *Suscripción a notificaciones*\n\n¿Deseas recibir novedades, recordatorios y avisos importantes por WhatsApp?" );
            
          } else {
            button = [
                    { type: "reply", reply: { id: "cancelar_suscripcion", title: "🛑 Cancelar" } },
                    { type: "reply", reply: { id: "mantener_suscripcion", title: "👍 Mantenerme" } },
                  ],
            await sendBackButton(from, button, "🔔 Ya tienes una suscripción activa para recibir notificaciones.\n\n¿Quieres cancelar tu suscripción?");
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
          button = [{ type: "reply", reply: { id: "menu", title: "🏠 Volver al menú" } },]
          await sendBackButton(from, button,"Selecciona para regresar: ");
          break;

        case "rechazar_suscripcion":
          updateUser(from, { suscribete: false });
          await sendMessage(from, "❌ No recibirás notificaciones. Si cambias de opinión, ve al menú → *Suscribirte*.");
          await sendMainMenu(from)
          break;

        case "cancelar_suscripcion":
          updateUser(from, { suscribete: false, opt_out: true });
          
          await sendMessage(from, "🛑 Has cancelado tu suscripción. Ya no recibirás notificaciones.");
          await sendMainMenu(from)
          break;

        case "mantener_suscripcion":
          updateUser(from, { suscribete: true, opt_out: false });
          await sendMessage(from, "👍 Mantendremos activa tu suscripción.");
          await sendMainMenu(from)
          break;

       case "medios":
          
          await sendImage(
            from,
            `${URLBOT}/media/pagos.jpg`,
            "🧾 Medios de pago disponibles para la Tarjeta Pabón Más"
          );
          await new Promise(res => setTimeout(res, 1000));

          await sendMessage(from, "💳 ¿Quieres adquirir la Tarjeta Pabón Más?\n\n" +
                                  "Puedes hacerlo visitando nuestras sedes:\n" +
                                  "🏥 Clínica Pabón: Cra. 33 No. 12a-44, Pasto\n" +
                                  "🏢 Sede Especialidades: Cra. 36 No. 13-26, Av. Panamericana\n\n");
                              
          updateUser(from, { servicios: [...new Set([...user.servicios, "medios"])] });

          button = [
                    { type: "reply", reply: { id: "asesor", title: "📞 Asesor" } },
                    { type: "reply", reply: { id: "menu", title: "🏠 Volver al menú" } },
                  ],
          await sendBackButton(from, button,"o contactando a uno de nuestros asesores:", false);
        break;

        case "contactos":
          await sendMessage(from, "📣 ¡Conéctate con nosotros!\n\n" +
                                  "Síguenos en nuestras redes sociales para estar al día con novedades y promociones 🎉\n" +
                                  "Facebook:\n"+
                                  "https://www.facebook.com/TarjetaPabonMas\n"+
                                  "Instagram\n"+
                                  "https://www.instagram.com/pabonmas/\n\n"+
                                  "📍 Visita nuestras sedes y vive la experiencia en persona\n"+
                                  "🏥 Clínica Pabón: Cra. 33 No. 12a-44, Pasto\n" +
                                  "🏢 Sede Especialidades: Cra. 36 No. 13-26, Av. Panamericana\n\n");
          button = [
                    { type: "reply", reply: { id: "asesor", title: "📞 Asesor" } },
                    { type: "reply", reply: { id: "menu", title: "🏠 Volver al menú" } },
                  ]
          await sendBackButton(from, button,"O si prefieres, habla con uno de nuestros asesores por WhatsApp y recibe atención personalizada 👇", false);
          updateUser(from, { servicios: [...new Set([...user.servicios, "contactos"])] });
          break;
          case "asesor":
            messagecitas = "Hola 👋 necesito hablar con un asesor";
            encodedMessage = encodeURIComponent(messagecitas);
            url = `https://wa.me/573208283812?text=${encodedMessage}`;
            await sendMessage(from, 
            "📞 *Habla directamente con un asesor*\n\n" +
            "Haz clic en el siguiente enlace para habla con uno de nuestros asesores por WhatsApp y recibe atención personalizada 👇:\n\n" +
            url
          );
          button = [{ type: "reply", reply: { id: "menu", title: "🏠 Volver al menú" } },]
          await sendBackButton(from, button,"Selecciona para regresar: ", false);

          updateUser(from, {
            servicios: [...new Set([...user.servicios, "asesor"])]
          });
        break;
        case "citas":
          messagecitas = "Hola 👋 necesito agendar una cita";
          encodedMessage = encodeURIComponent(messagecitas);
          url = `https://wa.me/573208283812?text=${encodedMessage}`;
          await sendMessage(from, 
            "📞 *Agenda tu cita via WhatsApp*\n\n" +
            "Haz clic en el siguiente enlace  👇:\n\n" + url
            
          );
          button = [
                    { type: "reply", reply: { id: "menu", title: "🏠 Volver al menú" } },
                  ]
          await sendBackButton(from, button,"Selecciona para regresar", false);
          updateUser(from, { servicios: [...new Set([...user.servicios, "citas"])] });
          
          
        break;
        case "adquirir":
          messagecitas = "Hola 👋 Quiero Comprar la Tarjeta Pabón Más";
          encodedMessage = encodeURIComponent(messagecitas);
          url = `https://wa.me/573208283812?text=${encodedMessage}`;
          await sendMessage(from, 
            "💳 *Adquiere Tu Tarjeta!*\n\n" +
            "Haz clic en el siguiente enlace  👇:\n\n" + url
            
          );
          button = [
                    { type: "reply", reply: { id: "menu", title: "🏠 Volver al menú" } },
                  ]
          await sendBackButton(from, button,"Selecciona para regresar", false);
          updateUser(from, { servicios: [...new Set([...user.servicios, "adquirir"])] });
          
          
        break;
        case "gracias":
          await sendMessage(from,"☺️ con mucho gusto, desde Tarjeta Pabón Más, estamos para ayudarte")  
        break;

        default:
          if(userState[from].menu === "principal"){
            await sendMessage(from," 🤔 ¡Lo siento! No entendí lo que escribiste, puedes seleccionar la opción que necesites tocando el botón 'Ver opciones'")  
            await sendMainMenu(from)
          }
          else{if (await handlePaqueteDetail(from, userResponse)) break;}
          
      }
    }
  } catch (err) {
    console.error("❌ Error procesando mensaje:", err.message);
  }
});

// === Cargar menú de paquetes desde JSON ===
async function sendPaquetesMenu(to) {
  const paquetes = JSON.parse(fs.readFileSync(paquetesFile));

  const rows = Object.keys(paquetes).map((key) => ({
    id: key,
    title: "📦 " + paquetes[key].nombre.substring(0, 22),
    description: `Ingresa para mas informacion`,
  }));
  rows.push({ id: "revista", title: "📰 Revista", description: "Explora nuestro catálogo completo" })
  rows.push({ id: "asesor", title: "📞 Asesor", description: "Habla con un asesor" })
  rows.push({ id: "menu", title: "🏠 Volver al menú", description: ""})

  const body = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      header: { type: "text", text: "🎯 Paquetes disponibles" },
      body: { text: "Selecciona un paquete para ver sus detalles:" },
      footer: { text: "Clínica Pabón" },
      action: { button: "Ver paquetes", sections: [{ title: "Nuestros Paquetes", rows }] },
    },
  };
  await sendMessageRaw(body);
}

// === Mostrar detalle del paquete ===
async function handlePaqueteDetail(to, id) {
  if (!fs.existsSync(paquetesFile)) return false;
  const paquetes = JSON.parse(fs.readFileSync(paquetesFile));

  if (!paquetes[id]) return false;

  const p = paquetes[id];
  const user = getUser(to);
  const messagecitas = `Hola 👋 quiero adquirir el paquete ${p.nombre}`;
  const encodedMessage = encodeURIComponent(messagecitas);
  const url = `https://wa.me/573208283812?text=${encodedMessage}`;
  const texto =
    `📦 *${p.nombre}*\n\n` +
    `Incluye:\n${p.incluye.map((i) => `- ${i}`).join("\n")}\n\n` +
    `💰 Valor Con Tarjeta Pabón Más: *$${p.valor}*\n💳 Particular: *$${p.valor_particular}*\n\n` +
    `Adquiere este paquete desde el link 👇\n`+
    `${url}`;

  updateUser(to, { paquetes: [...new Set([...user.paquetes, p.nombre])] });
  await sendMessage(to, texto);
  const button = [ 
                  { type: "reply", reply: { id: "portafolio", title: "🏠 Menú Anterior" } },
                  { type: "reply", reply: { id: "menu", title: "🏠 Menú Principal" } }]
  await sendBackButton(to, button, "Seleccione una opcion:", false);
  return true;
}

// === 3. Mensajes interactivos (autorización, botones, etc.) ===
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

async function sendBackButton(to, button=[], text1 = "", flag = true) {
  if (flag){
  button.push({ type: "reply", reply: { id: "asesor", title: "📞 Asesor" } })}
  const body = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: text1 },
      action: {
        buttons: button,
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
      header: { type: "text", text: "💬 Nuestro Menú Principal" },
      body: { text: "Estamos aquí para ayudarte 😊, Selecciona una opción para continuar:" },
      footer: { text: "Atención automatizada de la Clínica Pabón" },
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
              { id: "citas", title: "📅 Citas", description: "Agenta tu Citas" },
              { id: "asesor", title: "📞 Asesor", description: "Habla con un asesor" },
            ],
          },
        ],
      },
    },
  };
  await sendMessageRaw(body);
}

// === 4. Envío genérico ===
async function sendMessage(to, text) {
  await sendMessageRaw({ messaging_product: "whatsapp", to, type: "text", text: { body: text } });
}

async function sendImage(to, imageUrl, caption = "") {
  const body = {
    messaging_product: "whatsapp",
    to,
    type: "image",
    image: {
      link: imageUrl,
      caption,
    },
  };
  await sendMessageRaw(body)
}

async function sendMessageRaw(body) {
  try {
    await axios.post(`https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`, body, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` ,
          "Content-Type": "application/json",},
    });
  } catch (error) {
    console.error("Error enviando mensaje:", error.response?.data || error);
  }
}

// === 5. Servidor activo ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor activo en puerto ${PORT}`));

// === 6. Envío de mensajes masivos ===
app.post("/api/send-broadcast", async (req, res) => {
  try {
    const { message, image, recipients } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Falta el campo 'message'" });
    }

    const users = loadUsers();

    // Filtra los destinatarios válidos
    const allNumbers = Object.keys(users);
    let targetNumbers = [];

    if (Array.isArray(recipients) && recipients.length > 0) {
      // Filtrar solo los que están en users.json y suscritos
      targetNumbers = recipients.filter(num => {
        const u = users[num];
        return u && u.suscribete;
      });
    } else {
      // Si no se envió lista, usar todos los suscritos
      targetNumbers = allNumbers.filter(num => users[num].suscribete);
    }

    if (targetNumbers.length === 0) {
      return res.status(400).json({ error: "No hay usuarios suscritos válidos." });
    }

    let enviados = 0;

    for (const numero of targetNumbers) {
      try {
        if (image) {
          // Enviar imagen primero
          await sendImage(numero, image, message);
        } else {
          // Solo texto
          await sendMessage(numero, message);
        }
        enviados++;
      } catch (err) {
        console.error(`❌ Error enviando a ${numero}:`, err.message);
      }
    }

    res.json({
      success: true,
      enviados,
      total: targetNumbers.length,
      detalle: targetNumbers
    });
  } catch (err) {
    console.error("Error en broadcast:", err);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});




app.get("/api/users", (req, res) => {
  try {
    const users = loadUsers();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.send(JSON.stringify(users, null, 2)); // ← 2 espacios para identación
  } catch (error) {
    console.error("Error al obtener usuarios:", error);
    res.status(500).json({ error: "Error al obtener usuarios" });
  }
});


app.get("/api/users/suscriptos", (req, res) => {
  try {
    const users = loadUsers();
    const suscriptos = Object.entries(users)
      .filter(([_, u]) => u.suscribete === true && u.opt_out !== true)
      .reduce((acc, [num, u]) => ({ ...acc, [num]: u }), {});

    res.json(suscriptos);
  } catch (error) {
    console.error("Error al obtener usuarios suscriptos:", error);
    res.status(500).json({ error: "Error al obtener usuarios suscriptos" });
  }
});

app.put("/api/users/:numero", (req, res) => {
  try {
    const numero = req.params.numero; // <-- toma el número de la URL
    const data = req.body;             // <-- toma los nuevos datos del body

    if (!numero) {
      return res.status(400).json({ error: "Falta el parámetro 'numero' en la URL" });
    }

    const users = loadUsers();

    if (!users[numero]) {
      return res.status(404).json({ error: `El usuario ${numero} no existe` });
    }

    users[numero] = { ...users[numero], ...data };
    saveUsers(users);

    res.json({
      message: "Usuario actualizado correctamente",
      user: users[numero],
    });
  } catch (error) {
    console.error("Error al actualizar usuario:", error);
    res.status(500).json({ error: "Error interno al actualizar usuario" });
  }
});

app.post("/api/users", (req, res) => {
  try {
    const { numero, data } = req.body;

    if (!numero || typeof data !== "object") {
      return res.status(400).json({ error: "Faltan campos requeridos" });
    }

    const users = loadUsers();
    if (users[numero]) {
      return res.status(409).json({ error: "El usuario ya existe" });
    }

    users[numero] = data;
    saveUsers(users);

    res.status(201).json({ message: "Usuario creado correctamente", user: users[numero] });
  } catch (error) {
    console.error("Error al crear usuario:", error);
    res.status(500).json({ error: "Error al crear usuario" });
  }
});

app.delete("/api/users/:numero", (req, res) => {
  try {
    const numero = req.params.numero;
    const users = loadUsers();

    if (!users[numero]) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    delete users[numero];
    saveUsers(users);

    res.json({ message: "Usuario eliminado correctamente" });
  } catch (error) {
    console.error("Error al eliminar usuario:", error);
    res.status(500).json({ error: "Error al eliminar usuario" });
  }
});








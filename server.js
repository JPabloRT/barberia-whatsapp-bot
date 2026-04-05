require("dotenv").config();

const express = require("express");
const {
  getAvailableSlots,
  getConfig,
  getDebugState,
  handleIncomingMessage
} = require("./assets/barbershop-bot");
const db = require("./db");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const config = getConfig();
const META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || "";
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "";
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION || "v22.0";
const storage = {
  createAppointment: db.createAppointment,
  getAppointmentsForDate: db.getAppointmentsForDate
};

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get("/", async (_req, res) => {
  const debug = await getDebugState(storage);

  res.json({
    ok: true,
    app: "asistente-whatsapp-barberia",
    provider: "meta-cloud-api",
    timezone: config.timezone,
    bookingsCount: debug.bookings.length,
    openHour: debug.openHour,
    closeHour: debug.closeHour,
    appointmentDurationMinutes: debug.appointmentDurationMinutes,
    metaWebhookConfigured: Boolean(
      META_VERIFY_TOKEN && WHATSAPP_ACCESS_TOKEN && WHATSAPP_PHONE_NUMBER_ID
    ),
    databaseConfigured: Boolean(process.env.DATABASE_URL)
  });
});

app.get("/api/slots", async (req, res) => {
  const date = req.query.date;
  if (!date) {
    return res.status(400).json({ error: "Debes enviar la fecha en formato YYYY-MM-DD." });
  }

  return res.json({
    date,
    availableSlots: await getAvailableSlots(date, storage)
  });
});

app.get("/api/bookings", async (_req, res) => {
  const debug = await getDebugState(storage);
  res.json({ bookings: debug.bookings });
});

function getMessageValues(payload) {
  return (payload.entry || [])
    .flatMap((entry) => entry.changes || [])
    .map((change) => change.value || {})
    .filter((value) => Array.isArray(value.messages) && value.messages.length > 0);
}

function normalizeMetaRecipient(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("521") && digits.length === 13) {
    return `52${digits.slice(3)}`;
  }

  return digits;
}

async function sendWhatsAppMessage(to, body) {
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    throw new Error("Faltan variables de Meta: WHATSAPP_ACCESS_TOKEN o WHATSAPP_PHONE_NUMBER_ID.");
  }

  const normalizedTo = normalizeMetaRecipient(to);
  const response = await fetch(
    `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: normalizedTo,
        type: "text",
        text: {
          body
        }
      })
    }
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Meta API devolvio ${response.status}: ${details}`);
  }

  return response.json();
}

app.get("/webhook/meta", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === META_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

app.post("/webhook/meta", async (req, res) => {
  try {
    const values = getMessageValues(req.body);

    for (const value of values) {
      for (const message of value.messages) {
        if (message.type !== "text") {
          continue;
        }

        const phone = message.from || "unknown";
        const text = message.text?.body || "";
        const reply = await handleIncomingMessage(phone, text, config, storage);
        await sendWhatsAppMessage(phone, reply);
      }
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error("Error procesando webhook de Meta:", error.message);
    return res.sendStatus(500);
  }
});

async function start() {
  try {
    const databaseReady = await db.initDatabase();
    if (databaseReady) {
      console.log("Base de datos lista.");
    } else {
      console.log("DATABASE_URL no configurada. Se usara almacenamiento temporal en memoria.");
    }
  } catch (error) {
    console.error("No se pudo inicializar la base de datos:", error.message);
  }

  app.listen(PORT, () => {
    console.log(`Servidor activo en http://localhost:${PORT}`);
  });
}

start();

const OPEN_HOUR = 10;
const CLOSE_HOUR = 21;
const APPOINTMENT_DURATION_MINUTES = 60;
const LOOKAHEAD_DAYS = 5;

const sessions = new Map();
const memoryBookings = [];

function normalizeText(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function getConfig(overrides = {}) {
  return {
    businessName: overrides.businessName || process.env.BUSINESS_NAME || "Barberia Central",
    timezone: overrides.timezone || process.env.TIMEZONE || "America/Mexico_City"
  };
}

function getSession(phone) {
  if (!sessions.has(phone)) {
    sessions.set(phone, { step: "menu", selectedDate: null });
  }

  return sessions.get(phone);
}

function formatHour(hour) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function getDailySlots() {
  const slots = [];
  for (let hour = OPEN_HOUR; hour < CLOSE_HOUR; hour += 1) {
    slots.push(formatHour(hour));
  }
  return slots;
}

function formatBusinessHours() {
  return `${formatHour(OPEN_HOUR)} a ${formatHour(CLOSE_HOUR)}`;
}

function formatMenu(config) {
  return [
    `Hola, bienvenido a ${config.businessName}.`,
    `Atendemos citas de 1 hora de ${formatBusinessHours()}.`,
    "Puedo ayudarte con estas opciones:",
    "1. Agendar cita",
    "2. Ver citas de hoy",
    "3. Ver citas de manana",
    "",
    "Tambien puedes escribir: agendar, citas de hoy o citas de manana."
  ].join("\n");
}

function todayInTimezone(timezone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  return formatter.format(new Date());
}

function addDays(dateString, days) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getWeekday(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCDay();
}

function formatDateLabel(dateString) {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(new Date(`${dateString}T00:00:00Z`));
}

function isBusinessDay(dateString) {
  return getWeekday(dateString) !== 0;
}

function getNextAvailableDates(timezone, limit = LOOKAHEAD_DAYS) {
  const dates = [];
  const cursor = todayInTimezone(timezone);
  let offset = 0;

  while (dates.length < limit && offset < 14) {
    const candidate = addDays(cursor, offset);
    if (isBusinessDay(candidate)) {
      dates.push(candidate);
    }
    offset += 1;
  }

  return dates;
}

async function getBookingsForDate(dateString, storage) {
  if (storage?.getAppointmentsForDate) {
    return storage.getAppointmentsForDate(dateString);
  }

  return memoryBookings
    .filter((booking) => booking.date === dateString)
    .sort((a, b) => a.time.localeCompare(b.time));
}

async function getAvailableSlots(dateString, storage) {
  const baseSlots = isBusinessDay(dateString) ? getDailySlots() : [];
  const dayBookings = await getBookingsForDate(dateString, storage);
  const takenSlots = new Set(dayBookings.map((booking) => booking.time));

  return baseSlots.filter((slot) => !takenSlots.has(slot));
}

function formatDateOptions(timezone) {
  const dates = getNextAvailableDates(timezone);
  const lines = dates.map((date, index) => `${index + 1}. ${formatDateLabel(date)} (${date})`);

  return [
    "Estos son los proximos dias disponibles:",
    ...lines,
    "",
    "Escribe el numero del dia que prefieres."
  ].join("\n");
}

async function formatSlotOptions(dateString, storage) {
  const slots = await getAvailableSlots(dateString, storage);
  if (!slots.length) {
    return "Ese dia ya no tiene horarios disponibles. Escribe 1 para elegir otra fecha.";
  }

  const lines = slots.map((slot, index) => `${index + 1}. ${slot}`);
  return [
    `Horarios disponibles para ${formatDateLabel(dateString)}:`,
    ...lines,
    "",
    "Escribe el numero del horario que deseas reservar."
  ].join("\n");
}

async function formatBookingsForDate(dateString, label, storage) {
  const dayBookings = await getBookingsForDate(dateString, storage);
  if (!dayBookings.length) {
    return `No hay citas agendadas para ${label}.`;
  }

  const lines = dayBookings.map(
    (booking, index) => `${index + 1}. ${booking.time} - ${booking.phone}`
  );

  return [`Citas agendadas para ${label}:`, ...lines].join("\n");
}

async function bookAppointment(phone, session, slotIndex, storage) {
  const slots = await getAvailableSlots(session.selectedDate, storage);
  const chosenSlot = slots[slotIndex];
  if (!chosenSlot) {
    return null;
  }

  const appointment = {
    phone,
    date: session.selectedDate,
    time: chosenSlot,
    durationMinutes: APPOINTMENT_DURATION_MINUTES
  };

  let savedAppointment = appointment;

  if (storage?.createAppointment) {
    savedAppointment = await storage.createAppointment(appointment);
  } else {
    memoryBookings.push(appointment);
  }

  session.step = "menu";
  session.selectedDate = null;

  return savedAppointment;
}

function isTodayRequest(text) {
  return text === "2" || text.includes("citas de hoy") || text === "hoy";
}

function isTomorrowRequest(text) {
  return (
    text === "3" ||
    text.includes("citas de manana") ||
    text.includes("citas de mañana") ||
    text === "manana" ||
    text === "mañana"
  );
}

function isScheduleRequest(text) {
  return text === "1" || text.includes("agendar") || text.includes("cita");
}

async function handleIncomingMessage(phone, rawText, overrides = {}, storage) {
  const config = getConfig(overrides);
  const text = normalizeText(rawText);
  const session = getSession(phone);

  if (!text || ["hola", "buenas", "menu", "inicio", "empezar", "reiniciar", "cancelar"].includes(text)) {
    session.step = "menu";
    session.selectedDate = null;
    return formatMenu(config);
  }

  if (isTodayRequest(text)) {
    return formatBookingsForDate(todayInTimezone(config.timezone), "hoy", storage);
  }

  if (isTomorrowRequest(text)) {
    return formatBookingsForDate(addDays(todayInTimezone(config.timezone), 1), "manana", storage);
  }

  if (session.step === "menu") {
    if (isScheduleRequest(text)) {
      session.step = "awaiting_date";
      return formatDateOptions(config.timezone);
    }

    return formatMenu(config);
  }

  if (session.step === "awaiting_date") {
    const dates = getNextAvailableDates(config.timezone);
    const selectedDate = dates[Number(text) - 1];
    if (!selectedDate) {
      return "No reconoci ese dia. Escribe el numero de una fecha disponible.";
    }

    session.selectedDate = selectedDate;
    session.step = "awaiting_time";
    return formatSlotOptions(selectedDate, storage);
  }

  if (session.step === "awaiting_time") {
    const slotIndex = Number(text) - 1;

    try {
      const appointment = await bookAppointment(phone, session, slotIndex, storage);
      if (!appointment) {
        return "No reconoci ese horario. Escribe el numero de uno de los horarios disponibles.";
      }

      return [
        "Tu cita ha sido agendada con exito.",
        `Fecha: ${formatDateLabel(appointment.date)} (${appointment.date})`,
        `Hora: ${appointment.time}`,
        `Duracion: ${appointment.durationMinutes} minutos`,
        "",
        "Si deseas volver al menu, escribe hola."
      ].join("\n");
    } catch (error) {
      if (error.code === "23505") {
        return "Ese horario acaba de ocuparse. Escribe hola para volver al menu y elegir otro.";
      }

      throw error;
    }
  }

  session.step = "menu";
  session.selectedDate = null;
  return formatMenu(config);
}

async function getDebugState(storage) {
  const today = todayInTimezone(process.env.TIMEZONE || "America/Mexico_City");
  const bookings = await getBookingsForDate(today, storage).catch(() => memoryBookings);

  return {
    bookings,
    sessionsCount: sessions.size,
    openHour: OPEN_HOUR,
    closeHour: CLOSE_HOUR,
    appointmentDurationMinutes: APPOINTMENT_DURATION_MINUTES
  };
}

module.exports = {
  getConfig,
  getDebugState,
  getAvailableSlots,
  handleIncomingMessage
};

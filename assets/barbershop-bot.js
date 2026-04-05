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
    adminSecret: overrides.adminSecret || process.env.ADMIN_SECRET || "",
    businessName: overrides.businessName || process.env.BUSINESS_NAME || "Barberia Central",
    timezone: overrides.timezone || process.env.TIMEZONE || "America/Mexico_City"
  };
}

function getSession(phone) {
  if (!sessions.has(phone)) {
    sessions.set(phone, {
      step: "menu",
      selectedDate: null,
      customerName: null,
      cancellableAppointments: []
    });
  }

  return sessions.get(phone);
}

function resetSession(session) {
  session.step = "menu";
  session.selectedDate = null;
  session.customerName = null;
  session.cancellableAppointments = [];
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
    `Nuestro horario es de ${formatBusinessHours()} y cada cita dura 1 hora.`,
    "Con gusto te ayudo a agendar o cancelar una cita.",
    "",
    "Opciones disponibles:",
    "1. Agendar cita",
    "2. Cancelar mi cita",
    "",
    "Si agendaste un horario, ese espacio deja de mostrarse como disponible para otros clientes.",
    "Tambien puedes escribir: agendar, cancelar cita, hola, volver o reiniciar."
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

async function getAppointmentsByPhone(phone, storage) {
  if (storage?.getAppointmentsByPhone) {
    return storage.getAppointmentsByPhone(phone);
  }

  return memoryBookings
    .filter((booking) => booking.phone === phone)
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}

async function getAppointmentsInRange(startDate, endDate, storage) {
  if (storage?.getAppointmentsInRange) {
    return storage.getAppointmentsInRange(startDate, endDate);
  }

  return memoryBookings
    .filter((booking) => booking.date >= startDate && booking.date <= endDate)
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}

async function getAvailableSlots(dateString, storage) {
  const baseSlots = isBusinessDay(dateString) ? getDailySlots() : [];
  const dayBookings = await getBookingsForDate(dateString, storage);
  const takenSlots = new Set(dayBookings.map((booking) => booking.time));

  return baseSlots.filter((slot) => !takenSlots.has(slot));
}

function formatDateOptions(timezone) {
  const dates = getNextAvailableDates(timezone);
  const lines = dates.map((date, index) => `${index + 1}. ${formatDateLabel(date)}.`);

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
    return "Ese dia ya no tiene horarios disponibles. Escribe 1 para elegir otra fecha o escribe volver.";
  }

  const lines = slots.map((slot, index) => `${index + 1}. ${slot}`);
  return [
    `Estos son los horarios disponibles para ${formatDateLabel(dateString)}:`,
    ...lines,
    "",
    "Escribe el numero del horario que deseas reservar."
  ].join("\n");
}

function formatAdminBookings(label, bookings) {
  if (!bookings.length) {
    return `No hay citas agendadas para ${label}.`;
  }

  const lines = bookings.map((booking, index) => {
    const datePart = booking.date ? `${formatDateLabel(booking.date)} - ` : "";
    const namePart = booking.customerName ? `${booking.customerName} - ` : "";
    return `${index + 1}. ${datePart}${booking.time} - ${namePart}${booking.phone}`;
  });

  return [`Citas agendadas para ${label}:`, ...lines].join("\n");
}

function formatAdminWeek(bookings) {
  if (!bookings.length) {
    return "No hay citas agendadas para los proximos 7 dias.";
  }

  const lines = bookings.map((booking, index) => {
    const namePart = booking.customerName ? `${booking.customerName} - ` : "";
    return `${index + 1}. ${formatDateLabel(booking.date)} - ${booking.time} - ${namePart}${booking.phone}`;
  });

  return ["Citas agendadas para la semana:", ...lines].join("\n");
}

async function formatCancellationOptions(phone, timezone, storage) {
  const today = todayInTimezone(timezone);
  const bookings = await getAppointmentsByPhone(phone, storage);
  const upcoming = bookings.filter((booking) => booking.date >= today);

  if (!upcoming.length) {
    return {
      appointments: [],
      message: "No encontre citas futuras para este numero. Si quieres agendar una nueva, escribe hola."
    };
  }

  const lines = upcoming.map(
    (booking, index) => `${index + 1}. ${formatDateLabel(booking.date)} - ${booking.time}`
  );

  return {
    appointments: upcoming,
    message: [
      "Estas son tus citas futuras:",
      ...lines,
      "",
      "Escribe el numero de la cita que deseas cancelar."
    ].join("\n")
  };
}

async function bookAppointment(phone, session, slotIndex, storage) {
  const slots = await getAvailableSlots(session.selectedDate, storage);
  const chosenSlot = slots[slotIndex];
  if (!chosenSlot) {
    return null;
  }

  const appointment = {
    phone,
    customerName: session.customerName,
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

  resetSession(session);
  return savedAppointment;
}

async function deleteAppointment(appointment, phone, storage) {
  if (storage?.deleteAppointmentById && appointment.id) {
    return storage.deleteAppointmentById(appointment.id, phone);
  }

  const index = memoryBookings.findIndex(
    (booking) => booking.phone === phone && booking.date === appointment.date && booking.time === appointment.time
  );

  if (index === -1) {
    return null;
  }

  return memoryBookings.splice(index, 1)[0];
}

function isTodayRequest(text) {
  return text.includes("citas de hoy") || text === "hoy";
}

function isTomorrowRequest(text) {
  return text.includes("citas de manana") || text === "manana";
}

function isScheduleRequest(text) {
  return text === "1" || text.includes("agendar");
}

function isCancellationRequest(text) {
  return text === "2" || text.includes("cancelar cita");
}

function parseAdminRequest(text, adminSecret) {
  if (!adminSecret) {
    return null;
  }

  if (text === `admin hoy ${adminSecret}`) {
    return "today";
  }

  if (text === `admin manana ${adminSecret}`) {
    return "tomorrow";
  }

  if (text === `admin semana ${adminSecret}`) {
    return "week";
  }

  return null;
}

function isValidName(text) {
  return text.length >= 2 && text.length <= 80 && /[a-z]/i.test(text);
}

async function handleIncomingMessage(phone, rawText, overrides = {}, storage) {
  const config = getConfig(overrides);
  const text = normalizeText(rawText);
  const session = getSession(phone);
  const adminRequest = parseAdminRequest(text, normalizeText(config.adminSecret));

  if (!text || ["hola", "buenas", "menu", "inicio", "empezar"].includes(text)) {
    resetSession(session);
    return formatMenu(config);
  }

  if (["reiniciar", "volver"].includes(text)) {
    resetSession(session);
    return [
      "Listo, volvi al inicio.",
      "",
      formatMenu(config)
    ].join("\n");
  }

  if (adminRequest === "today") {
    resetSession(session);
    return formatAdminBookings("hoy", await getBookingsForDate(todayInTimezone(config.timezone), storage));
  }

  if (adminRequest === "tomorrow") {
    resetSession(session);
    return formatAdminBookings(
      "manana",
      await getBookingsForDate(addDays(todayInTimezone(config.timezone), 1), storage)
    );
  }

  if (adminRequest === "week") {
    const startDate = todayInTimezone(config.timezone);
    const endDate = addDays(startDate, 6);
    resetSession(session);
    return formatAdminWeek(await getAppointmentsInRange(startDate, endDate, storage));
  }

  if (isTodayRequest(text) || isTomorrowRequest(text)) {
    resetSession(session);
    return "Esa opcion es solo para administracion.";
  }

  if (session.step === "menu") {
    if (isScheduleRequest(text)) {
      session.step = "awaiting_name";
      return "Claro. Antes de agendar, comparteme tu nombre por favor.";
    }

    if (isCancellationRequest(text)) {
      const result = await formatCancellationOptions(phone, config.timezone, storage);
      session.cancellableAppointments = result.appointments;
      session.step = result.appointments.length ? "awaiting_cancellation_choice" : "menu";
      return result.message;
    }

    return formatMenu(config);
  }

  if (session.step === "awaiting_cancellation_choice") {
    const appointment = session.cancellableAppointments[Number(text) - 1];
    if (!appointment) {
      return "No reconoci esa cita. Escribe el numero de la cita que deseas cancelar o escribe volver.";
    }

    const deletedAppointment = await deleteAppointment(appointment, phone, storage);
    resetSession(session);

    if (!deletedAppointment) {
      return "No pude cancelar esa cita porque ya no estaba disponible. Escribe hola para volver al inicio.";
    }

    return [
      "Tu cita fue cancelada correctamente.",
      `Fecha: ${formatDateLabel(deletedAppointment.date)}`,
      `Hora: ${deletedAppointment.time}`,
      "",
      "Si deseas agendar otra, escribe hola."
    ].join("\n");
  }

  if (session.step === "awaiting_name") {
    if (!isValidName(text)) {
      return "No pude identificar bien tu nombre. Escribelo otra vez por favor, o escribe volver.";
    }

    session.customerName = rawText.trim();
    session.step = "awaiting_date";
    return [
      `Perfecto, ${session.customerName}.`,
      "",
      formatDateOptions(config.timezone)
    ].join("\n");
  }

  if (session.step === "awaiting_date") {
    const dates = getNextAvailableDates(config.timezone);
    const selectedDate = dates[Number(text) - 1];
    if (!selectedDate) {
      return "No reconoci ese dia. Escribe el numero de una fecha disponible o escribe volver.";
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
        return "No reconoci ese horario. Escribe el numero de uno de los horarios disponibles o escribe volver.";
      }

      return [
        `Listo, ${appointment.customerName || "tu cita"} ya quedo agendada.`,
        `Fecha: ${formatDateLabel(appointment.date)}`,
        `Hora: ${appointment.time}`,
        `Duracion: ${appointment.durationMinutes} minutos`,
        "",
        "Si necesitas otra cosa, escribe hola."
      ].join("\n");
    } catch (error) {
      if (error.code === "23505") {
        return "Ese horario acaba de ocuparse. Escribe hola para volver al menu y elegir otro.";
      }

      throw error;
    }
  }

  resetSession(session);
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

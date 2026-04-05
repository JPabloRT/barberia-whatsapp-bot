const { Pool } = require("pg");

let pool;

function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      return null;
    }

    const shouldUseSsl =
      process.env.DATABASE_SSL === "true" ||
      /supabase\.com/i.test(connectionString) ||
      /render\.com/i.test(connectionString) ||
      /railway\.app/i.test(connectionString);

    pool = new Pool({
      connectionString,
      ssl: shouldUseSsl ? { rejectUnauthorized: false } : false
    });
  }

  return pool;
}

async function initDatabase() {
  const activePool = getPool();
  if (!activePool) {
    return false;
  }

  await activePool.query(`
    CREATE TABLE IF NOT EXISTS appointments (
      id BIGSERIAL PRIMARY KEY,
      phone VARCHAR(32) NOT NULL,
      customer_name VARCHAR(120),
      appointment_date DATE NOT NULL,
      appointment_time VARCHAR(5) NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 60,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (appointment_date, appointment_time)
    )
  `);

  await activePool.query(`
    ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS customer_name VARCHAR(120)
  `);

  return true;
}

async function getAppointmentsForDate(dateString) {
  const activePool = getPool();
  if (!activePool) {
    return [];
  }

  const result = await activePool.query(
    `
      SELECT phone, appointment_date, appointment_time, duration_minutes
           , customer_name
      FROM appointments
      WHERE appointment_date = $1
      ORDER BY appointment_time ASC
    `,
    [dateString]
  );

  return result.rows.map((row) => ({
    phone: row.phone,
    customerName: row.customer_name,
    date: row.appointment_date.toISOString().slice(0, 10),
    time: row.appointment_time,
    durationMinutes: row.duration_minutes
  }));
}

async function createAppointment(appointment) {
  const activePool = getPool();
  if (!activePool) {
    return appointment;
  }

  const result = await activePool.query(
    `
      INSERT INTO appointments (phone, customer_name, appointment_date, appointment_time, duration_minutes)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING phone, customer_name, appointment_date, appointment_time, duration_minutes
    `,
    [
      appointment.phone,
      appointment.customerName,
      appointment.date,
      appointment.time,
      appointment.durationMinutes
    ]
  );

  const row = result.rows[0];
  return {
    phone: row.phone,
    customerName: row.customer_name,
    date: row.appointment_date.toISOString().slice(0, 10),
    time: row.appointment_time,
    durationMinutes: row.duration_minutes
  };
}

module.exports = {
  createAppointment,
  getAppointmentsForDate,
  initDatabase
};

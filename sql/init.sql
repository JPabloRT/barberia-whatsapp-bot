CREATE TABLE IF NOT EXISTS appointments (
  id BIGSERIAL PRIMARY KEY,
  phone VARCHAR(32) NOT NULL,
  appointment_date DATE NOT NULL,
  appointment_time VARCHAR(5) NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (appointment_date, appointment_time)
);

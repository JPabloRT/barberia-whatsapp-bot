# Asistente de WhatsApp para barberia

Este proyecto esta preparado para usar `Meta WhatsApp Cloud API` con un servidor `Express` y citas persistentes en `PostgreSQL`.

## Que hace el bot

Cuando el cliente escribe `hola`, el asistente:

1. saluda y da la bienvenida
2. ofrece agendar cita
3. permite consultar citas de hoy o de manana
4. muestra fechas y horarios disponibles
5. confirma la cita

## Estructura del proyecto

- `server.js`: webhook y respuestas con Meta Cloud API
- `assets/barbershop-bot.js`: logica del asistente
- `db.js`: conexion a PostgreSQL/Supabase
- `sql/init.sql`: esquema inicial de base de datos
- `railway.json`: configuracion basica para Railway

## Instalar dependencias

```bash
npm install
```

## Configurar variables

Crea un archivo `.env` tomando como base `.env.example`:

```env
PORT=3000
BUSINESS_NAME=Barberia Central
TIMEZONE=America/Mexico_City
META_VERIFY_TOKEN=barberia_verify_token
WHATSAPP_ACCESS_TOKEN=tu_access_token_de_meta
WHATSAPP_PHONE_NUMBER_ID=tu_phone_number_id
WHATSAPP_BUSINESS_ACCOUNT_ID=tu_waba_id
WHATSAPP_API_VERSION=v22.0
DATABASE_URL=postgresql://postgres:password@db.xxx.supabase.co:5432/postgres
DATABASE_SSL=true
```

## Probar local con Express

```bash
npm start
```

Webhook local de Meta:

```text
GET /webhook/meta
POST /webhook/meta
```

## Configurar en Meta

Cuando publiques tu servidor, en la seccion de webhooks de Meta usa:

- `Callback URL`: `https://tu-dominio.com/webhook/meta`
- `Verify token`: el valor de `META_VERIFY_TOKEN`

Tambien vas a necesitar estos datos de Meta:

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`

## Base de datos

Si defines `DATABASE_URL`, el bot guardara citas en PostgreSQL y ya no se perderan al reiniciar.

El servidor crea la tabla automaticamente al arrancar. Si prefieres crearla manualmente, usa:

```sql
-- archivo: sql/init.sql
CREATE TABLE IF NOT EXISTS appointments (
  id BIGSERIAL PRIMARY KEY,
  phone VARCHAR(32) NOT NULL,
  appointment_date DATE NOT NULL,
  appointment_time VARCHAR(5) NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (appointment_date, appointment_time)
);
```

## Despliegue recomendado

- `Backend`: Railway
- `Base de datos`: Supabase Postgres

### Variables para Railway

- `BUSINESS_NAME`
- `TIMEZONE`
- `META_VERIFY_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `WHATSAPP_API_VERSION`
- `DATABASE_URL`
- `DATABASE_SSL=true`

### Flujo sugerido

1. Crea un proyecto en Supabase
2. Copia la cadena `DATABASE_URL`
3. Crea un proyecto en Railway desde este repo
4. Agrega las variables de entorno
5. Railway te dara una URL fija
6. En Meta, cambia el webhook a `https://tu-app.up.railway.app/webhook/meta`

## Limitacion importante

Las sesiones conversacionales siguen en memoria, pero las citas ya pueden guardarse en PostgreSQL si configuras `DATABASE_URL`.

Para una barberia real, el siguiente paso correcto es guardar la informacion en una base de datos como:

- Supabase
- SQLite en otro hosting persistente
- Airtable
- Google Sheets

## Horario actual del negocio

- horario de atencion: `10:00` a `21:00`
- cada cita dura `60 minutos`
- el bot ofrece horarios por hora dentro de ese rango

## Comandos utiles en el chat

- `hola`
- `agendar`
- `citas de hoy`
- `citas de manana`

## Recomendacion realista

Usa esta version para:

- probar el flujo conversacional
- validar textos, servicios y horarios
- conectar tu numero real con Meta

Antes de atender clientes reales de forma confiable, conviene agregar persistencia de datos.

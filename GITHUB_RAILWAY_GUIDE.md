# Subir a GitHub y Railway

## Que si subir

- `server.js`
- `db.js`
- `package.json`
- `package-lock.json`
- `railway.json`
- `assets/`
- `sql/`
- `privacy.html`
- `README.md`
- `.env.example`
- `.gitignore`

## Que no subir

- `.env`
- `node_modules/`
- archivos `.log`
- archivos `.err`

## Railway

Variables necesarias:

- `BUSINESS_NAME`
- `TIMEZONE`
- `META_VERIFY_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `WHATSAPP_API_VERSION`
- `DATABASE_URL`
- `DATABASE_SSL=true`

Webhook final en Meta:

```text
https://tu-app.up.railway.app/webhook/meta
```

## Supabase

Ejecuta el SQL de `sql/init.sql`.

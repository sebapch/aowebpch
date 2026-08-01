# Guía de Inicio Local para Beta Cerrada (AOWeb)

Este documento detalla la arquitectura y los pasos para reiniciar la infraestructura del juego en tu PC local conectada a **Vercel** y **Supabase** (sin depender de Render).

---

## 🏗️ Arquitectura del Sistema

| Componente | Ubicación / Puerto | Función |
| :--- | :--- | :--- |
| **Frontend Web** | `https://csao2.vercel.app` (Vercel) | Interfaz web de usuario, cliente Next.js / PixiJS |
| **Base de Datos** | Supabase (`aws-0-ca-central-1...`) | PostgreSQL en la nube para cuentas y personajes |
| **API Server** | Local (`http://localhost:3002`) | Autenticación, gestión de cuentas y personajes |
| **Game Server** | Local (`ws://localhost:7666`) | Servidor en tiempo real (WebSocket), mapas y física |
| **Túneles Cloudflare** | Cloudflare Quick Tunnels (`cloudflared`) | Expone puertos 3002 y 7666 con HTTPS y WSS públicos |

---

## 🚀 Pasos para Reiniciar el Entorno Local (Instrucciones para IA / Dev)

Si la PC se reinicia o se apagan los procesos, sigue estos 4 pasos:

### 1. Iniciar la API Local (Puerto 3002)
Asegurar que `api/.env` contenga:
```env
PORT=3002
DATABASE_URL=postgresql://postgres.lxinzvdbghytoqbdowvu:j1Mjpd24qBs9ZdnD@aws-0-ca-central-1.pooler.supabase.com:6543/postgres
TOKEN_AUTH=a388a26218ce651b0aee0d400c0821a752384c11c75d416f9d43583511191403
CORS_ORIGIN=*
```
Comando para iniciar:
```powershell
cd c:\Users\seba9\Documents\Dev\aoweb\api
pnpm dev
```
*Verificación*: `GET http://localhost:3002/health` debe responder `{"ok": true}`.

---

### 2. Iniciar el Game Server (Puerto 7666)
Asegurar que `server/.env` contenga:
```env
NODE_ENV=development
PORT=7666
API_BASE_URL=http://localhost:3002
TOKEN_AUTH=a388a26218ce651b0aee0d400c0821a752384c11c75d416f9d43583511191403
EDITOR_ENABLED=true
```
Comando para iniciar:
```powershell
cd c:\Users\seba9\Documents\Dev\aoweb\server
pnpm dev
```
*Verificación*: El log dirá `[Servidor] Conexión con API establecida correctamente. Iniciado en XXXms.`

---

### 3. Abrir los Túneles de Cloudflare

Abrir dos instancias de `cloudflared` (en terminales separadas o procesos daemon):

1. **Túnel para Game Server (Puerto 7666)**:
   ```powershell
   cloudflared tunnel --url http://localhost:7666
   ```
   *Obtener URL del log*: Ejemplo `https://ejemplo-server.trycloudflare.com` (WS: `wss://ejemplo-server.trycloudflare.com`).

2. **Túnel para API (Puerto 3002)**:
   ```powershell
   cloudflared tunnel --url http://localhost:3002
   ```
   *Obtener URL del log*: Ejemplo `https://ejemplo-api.trycloudflare.com`.

---

### 4. Actualizar Variables de Entorno en Vercel

Ir al Dashboard de **[Vercel](https://vercel.com/)** -> Proyecto **csao2** -> **Settings** -> **Environment Variables** (Entorno: **Production**):

1. `NEXT_PUBLIC_WS_URL` = `wss://<URL-TUNEL-SERVER>`
2. `GAME_SERVER_HTTP_URL` = `https://<URL-TUNEL-SERVER>`
3. `API_BASE_URL` = `https://<URL-TUNEL-API>`
4. `NEXT_PUBLIC_API_BASE_URL` = `https://<URL-TUNEL-API>`

Hacer **Redeploy** en Vercel (Deployments -> Último deploy -> Redeploy).

---

## 🔍 Comandos Rápidos de Diagnóstico

```powershell
# Verificar si los puertos están activos
netstat -ano | findstr "3002 7666"

# Probar salud de la API local
Invoke-RestMethod -Uri "http://localhost:3002/health" -Method Get

# Probar salud del servidor de juego
Invoke-RestMethod -Uri "http://localhost:7666/health" -Method Get
```

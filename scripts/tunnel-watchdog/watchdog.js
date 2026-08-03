#!/usr/bin/env node
/**
 * Mantiene vivos los tuneles Pinggy (API HTTP + Game Server TCP) enrutados por Brasil,
 * y cuando la URL rota (reconexion o expiracion de sesion a los 60 min del free tier),
 * actualiza las env vars en Vercel y dispara un redeploy de produccion.
 *
 * Uso: node watchdog.js
 */

const { spawn } = require("child_process");
const https = require("https");
const path = require("path");

const FRONTEND_DIR = path.join(__dirname, "..", "..", "frontend");
const API_LOCAL_PORT = 3002;
const WS_LOCAL_PORT = 7666;
const HEALTH_CHECK_INTERVAL_MS = 30_000;
const RESTART_BACKOFF_MS = 5_000;

const state = {
  apiUrl: null,
  wsHost: null,
  wsPort: null,
  apiProc: null,
  wsProc: null,
  deploying: false,
  pendingRedeploy: false,
};

function log(...args) {
  console.log(`[watchdog ${new Date().toISOString()}]`, ...args);
}

function startApiTunnel() {
  const proc = spawn(
    "ssh",
    ["-p", "443", "-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=20", "-R0:localhost:" + API_LOCAL_PORT, "a.pinggy.io"],
    { stdio: ["ignore", "pipe", "pipe"] }
  );
  state.apiProc = proc;
  let buf = "";
  const onData = (data) => {
    buf += data.toString();
    const match = buf.match(/https:\/\/[a-z0-9-]+\.free\.pinggy\.net/);
    if (match && state.apiUrl !== match[0]) {
      state.apiUrl = match[0];
      log("Nueva URL API:", state.apiUrl);
      onUrlsChanged();
    }
  };
  proc.stdout.on("data", onData);
  proc.stderr.on("data", onData);
  proc.on("exit", (code) => {
    log("Tunel API cerrado (code " + code + "), reintentando en " + RESTART_BACKOFF_MS + "ms");
    state.apiUrl = null;
    setTimeout(startApiTunnel, RESTART_BACKOFF_MS);
  });
}

function startWsTunnel() {
  const proc = spawn(
    "ssh",
    ["-p", "443", "-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=20", "-R0:localhost:" + WS_LOCAL_PORT, "tcp@a.pinggy.io"],
    { stdio: ["ignore", "pipe", "pipe"] }
  );
  state.wsProc = proc;
  let buf = "";
  const onData = (data) => {
    buf += data.toString();
    const match = buf.match(/tcp:\/\/([a-z0-9.-]+):(\d+)/);
    if (match && (state.wsHost !== match[1] || state.wsPort !== match[2])) {
      state.wsHost = match[1];
      state.wsPort = match[2];
      log("Nueva URL WS:", `${state.wsHost}:${state.wsPort}`);
      onUrlsChanged();
    }
  };
  proc.stdout.on("data", onData);
  proc.stderr.on("data", onData);
  proc.on("exit", (code) => {
    log("Tunel WS cerrado (code " + code + "), reintentando en " + RESTART_BACKOFF_MS + "ms");
    state.wsHost = null;
    state.wsPort = null;
    setTimeout(startWsTunnel, RESTART_BACKOFF_MS);
  });
}

function onUrlsChanged() {
  if (!state.apiUrl || !state.wsHost || !state.wsPort) return;
  if (state.deploying) {
    state.pendingRedeploy = true;
    return;
  }
  deployWithCurrentUrls();
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"], shell: true, ...opts });
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.stderr.on("data", (d) => (err += d.toString()));
    proc.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`"${cmd} ${args.join(" ")}" exit ${code}\n${err}`));
    });
  });
}

async function setEnvVar(name, value) {
  try {
    await run("npx", ["--yes", "vercel", "env", "rm", name, "production", "preview", "--yes"], { cwd: FRONTEND_DIR });
  } catch (e) {
    // puede no existir todavia, no pasa nada
  }
  await run("npx", ["--yes", "vercel", "env", "add", name, "production,preview", "--value", value, "--yes", "--force"], {
    cwd: FRONTEND_DIR,
  });
}

async function deployWithCurrentUrls() {
  state.deploying = true;
  const apiUrl = state.apiUrl;
  const wsUrl = `wss://${state.wsHost}:${state.wsPort}`;
  log("Actualizando env vars en Vercel...", { apiUrl, wsUrl });
  try {
    await Promise.all([
      setEnvVar("NEXT_PUBLIC_API_BASE_URL", apiUrl),
      setEnvVar("API_BASE_URL", apiUrl),
      setEnvVar("NEXT_PUBLIC_WS_URL", wsUrl),
      setEnvVar("GAME_SERVER_HTTP_URL", apiUrl),
    ]);
    log("Env vars actualizadas. Disparando redeploy de produccion...");
    await run("npx", ["--yes", "vercel", "--prod", "--yes"], { cwd: FRONTEND_DIR });
    log("Redeploy completo.");
  } catch (e) {
    log("ERROR actualizando Vercel:", e.message);
  } finally {
    state.deploying = false;
    if (state.pendingRedeploy) {
      state.pendingRedeploy = false;
      deployWithCurrentUrls();
    }
  }
}

function healthCheck() {
  if (!state.apiUrl) return;
  const url = state.apiUrl + "/health";
  const req = https.get(url, { timeout: 8000 }, (res) => {
    if (res.statusCode !== 200) {
      log("Health check fallo con status", res.statusCode, "- matando tunel API para forzar reconexion");
      state.apiProc && state.apiProc.kill();
    }
    res.resume();
  });
  req.on("error", () => {
    log("Health check no pudo conectar - matando tunel API para forzar reconexion");
    state.apiProc && state.apiProc.kill();
  });
  req.on("timeout", () => {
    req.destroy();
  });
}

log("Iniciando tuneles Pinggy (API " + API_LOCAL_PORT + ", WS " + WS_LOCAL_PORT + ")...");
startApiTunnel();
startWsTunnel();
setInterval(healthCheck, HEALTH_CHECK_INTERVAL_MS);

process.on("SIGINT", () => {
  log("Cerrando tuneles...");
  state.apiProc && state.apiProc.kill();
  state.wsProc && state.wsProc.kill();
  process.exit(0);
});

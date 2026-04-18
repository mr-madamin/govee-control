const path = require("node:path");
const fs = require("node:fs");
const { app, BrowserWindow, ipcMain } = require("electron");

// ── Storage ──────────────────────────────────────────────────────────────────

let storePath;

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(storePath, "utf-8"));
  } catch {
    return {};
  }
}

function writeStore(data) {
  fs.writeFileSync(storePath, JSON.stringify(data, null, 2), "utf-8");
}

function getApiKey() {
  return readStore().apiKey || "";
}

function setApiKey(key) {
  const store = readStore();
  store.apiKey = key;
  writeStore(store);
}

function getPresets() {
  return readStore().presets || [];
}

function savePreset({ name, r, g, b }) {
  const store = readStore();
  const presets = store.presets || [];
  const idx = presets.findIndex((p) => p.name === name);
  if (idx >= 0) {
    presets[idx] = { name, r, g, b };
  } else {
    presets.push({ name, r, g, b });
  }
  store.presets = presets;
  writeStore(store);
}

function deletePreset(name) {
  const store = readStore();
  store.presets = (store.presets || []).filter((p) => p.name !== name);
  writeStore(store);
}

// ── Govee API client ──────────────────────────────────────────────────────────

const GOVEE_BASE = "https://openapi.api.govee.com/router/api/v1";

async function goveeGetDevices(apiKey) {
  const res = await fetch(`${GOVEE_BASE}/user/devices`, {
    headers: { "Govee-API-Key": apiKey },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `HTTP ${res.status}`);
  }
  const body = await res.json();
  console.log(body);
  return body.data;
}

async function goveeSetColor(apiKey, device, model, r, g, b) {
  const res = await fetch(`${GOVEE_BASE}/devices/control`, {
    method: "PUT",
    headers: {
      "Govee-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      device,
      model,
      cmd: { name: "color", value: { r, g, b } },
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `HTTP ${res.status}`);
  }
}

// ── Window ────────────────────────────────────────────────────────────────────

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, "../renderer/index.html"));
};

// ── IPC handlers ──────────────────────────────────────────────────────────────

function registerIpcHandlers() {
  ipcMain.handle("govee:get-api-key-status", () => {
    return { configured: !!getApiKey() };
  });

  ipcMain.handle("govee:save-api-key", (_e, { key }) => {
    try {
      setApiKey(key.trim());
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("govee:get-devices", async () => {
    try {
      const key = getApiKey();
      if (!key) return { ok: false, error: "No API key configured." };
      const devices = await goveeGetDevices(key);
      return { ok: true, devices };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("govee:set-color", async (_e, { device, model, r, g, b }) => {
    try {
      const key = getApiKey();
      await goveeSetColor(key, device, model, r, g, b);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("govee:get-presets", () => {
    return { ok: true, presets: getPresets() };
  });

  ipcMain.handle("govee:save-preset", (_e, { name, r, g, b }) => {
    try {
      savePreset({ name, r, g, b });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("govee:delete-preset", (_e, { name }) => {
    try {
      deletePreset(name);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("govee:apply-preset-to-all", async (_e, { name }) => {
    try {
      const key = getApiKey();
      const preset = getPresets().find((p) => p.name === name);
      if (!preset) return { ok: false, error: "Preset not found." };
      const devices = await goveeGetDevices(key);
      const results = await Promise.all(
        devices.map(async (d) => {
          try {
            await goveeSetColor(
              key,
              d.device,
              d.model,
              preset.r,
              preset.g,
              preset.b,
            );
            return { device: d.deviceName, ok: true };
          } catch (err) {
            return { device: d.deviceName, ok: false, error: err.message };
          }
        }),
      );
      return { ok: true, results };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  storePath = path.join(app.getPath("userData"), "govee-store.json");
  createWindow();
  registerIpcHandlers();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

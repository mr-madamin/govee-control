// ── Helpers ───────────────────────────────────────────────────────────────────

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

// ── DOM refs ──────────────────────────────────────────────────────────────────

const setupOverlay = document.getElementById("setup-overlay");
const apiKeyInput = document.getElementById("api-key-input");
const saveApiKeyBtn = document.getElementById("save-api-key-btn");
const setupError = document.getElementById("setup-error");

const appShell = document.getElementById("app");
const deviceContainer = document.getElementById("device-cards-container");
const loadingIndicator = document.getElementById("loading-indicator");
const errorBanner = document.getElementById("error-banner");
const errorBannerText = document.getElementById("error-banner-text");
const errorBannerDismiss = document.getElementById("error-banner-dismiss");
const refreshBtn = document.getElementById("refresh-btn");
const settingsBtn = document.getElementById("settings-btn");

const presetList = document.getElementById("preset-list");
const presetNameInput = document.getElementById("preset-name-input");
const presetColorInput = document.getElementById("preset-color-input");
const addPresetBtn = document.getElementById("add-preset-btn");
const presetError = document.getElementById("preset-error");

// ── Error banner ──────────────────────────────────────────────────────────────

function showBanner(msg) {
  errorBannerText.textContent = msg;
  errorBanner.classList.remove("hidden");
}

function hideBanner() {
  errorBanner.classList.add("hidden");
}

errorBannerDismiss.addEventListener("click", hideBanner);

// ── Setup overlay ─────────────────────────────────────────────────────────────

function showSetup() {
  setupOverlay.classList.remove("hidden");
  appShell.classList.add("hidden");
  setupError.classList.add("hidden");
  setupError.textContent = "";
  apiKeyInput.value = "";
  apiKeyInput.focus();
}

function showApp() {
  setupOverlay.classList.add("hidden");
  appShell.classList.remove("hidden");
}

saveApiKeyBtn.addEventListener("click", async () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    setupError.textContent = "Please enter an API key.";
    setupError.classList.remove("hidden");
    return;
  }
  saveApiKeyBtn.disabled = true;
  const res = await window.govee.saveApiKey(key);
  saveApiKeyBtn.disabled = false;
  if (res.ok) {
    showApp();
    loadDevices();
    loadPresets();
  } else {
    setupError.textContent = res.error || "Failed to save key.";
    setupError.classList.remove("hidden");
  }
});

apiKeyInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveApiKeyBtn.click();
});

settingsBtn.addEventListener("click", showSetup);

// ── Devices ───────────────────────────────────────────────────────────────────

async function loadDevices() {
  hideBanner();
  deviceContainer.innerHTML = "";
  loadingIndicator.classList.remove("hidden");

  const res = await window.govee.getDevices();
  loadingIndicator.classList.add("hidden");

  if (!res.ok) {
    showBanner(res.error || "Failed to load devices.");
    return;
  }

  if (res.devices.length === 0) {
    deviceContainer.innerHTML = '<p style="color:#888;padding:0.5rem">No devices found.</p>';
    return;
  }

  res.devices.forEach((device) => deviceContainer.appendChild(renderDeviceCard(device)));
}

function renderDeviceCard(device) {
  const card = document.createElement("div");
  card.className = "device-card";

  const name = document.createElement("h3");
  name.textContent = device.deviceName;

  const model = document.createElement("p");
  model.className = "device-model";
  model.textContent = device.model;

  const colorPicker = document.createElement("input");
  colorPicker.type = "color";
  colorPicker.value = "#ffffff";
  colorPicker.title = "Pick a color";

  const applyBtn = document.createElement("button");
  applyBtn.className = "apply-color-btn";
  applyBtn.textContent = "Apply Color";

  const status = document.createElement("p");
  status.className = "card-status";

  applyBtn.addEventListener("click", async () => {
    const { r, g, b } = hexToRgb(colorPicker.value);
    applyBtn.disabled = true;
    status.className = "card-status";
    status.textContent = "Sending…";

    const res = await window.govee.setColor(device.device, device.model, r, g, b);
    applyBtn.disabled = false;

    if (res.ok) {
      status.textContent = "Applied!";
      setTimeout(() => { status.textContent = ""; }, 2000);
    } else {
      status.className = "card-status err";
      status.textContent = res.error || "Error";
    }
  });

  card.append(name, model, colorPicker, applyBtn, status);
  return card;
}

refreshBtn.addEventListener("click", loadDevices);

// ── Presets ───────────────────────────────────────────────────────────────────

async function loadPresets() {
  const res = await window.govee.getPresets();
  if (res.ok) renderPresetList(res.presets);
}

function renderPresetList(presets) {
  presetList.innerHTML = "";

  presets.forEach((preset) => {
    const li = document.createElement("li");

    const swatch = document.createElement("span");
    swatch.className = "preset-swatch";
    swatch.style.backgroundColor = rgbToHex(preset.r, preset.g, preset.b);

    const nameSpan = document.createElement("span");
    nameSpan.className = "preset-name";
    nameSpan.textContent = preset.name;
    nameSpan.title = preset.name;

    const applyBtn = document.createElement("button");
    applyBtn.className = "apply-btn";
    applyBtn.textContent = "All";
    applyBtn.title = "Apply to all devices";
    applyBtn.addEventListener("click", async () => {
      applyBtn.disabled = true;
      const res = await window.govee.applyPresetToAll(preset.name);
      applyBtn.disabled = false;
      if (!res.ok) showBanner(res.error || "Failed to apply preset.");
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.textContent = "✕";
    deleteBtn.title = "Delete preset";
    deleteBtn.addEventListener("click", async () => {
      await window.govee.deletePreset(preset.name);
      loadPresets();
    });

    li.append(swatch, nameSpan, applyBtn, deleteBtn);
    presetList.appendChild(li);
  });
}

addPresetBtn.addEventListener("click", async () => {
  const name = presetNameInput.value.trim();
  if (!name) {
    presetError.textContent = "Enter a preset name.";
    presetError.classList.remove("hidden");
    return;
  }
  presetError.classList.add("hidden");

  const { r, g, b } = hexToRgb(presetColorInput.value);
  const res = await window.govee.savePreset(name, r, g, b);
  if (res.ok) {
    presetNameInput.value = "";
    loadPresets();
  } else {
    presetError.textContent = res.error || "Failed to save preset.";
    presetError.classList.remove("hidden");
  }
});

presetNameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addPresetBtn.click();
});

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  const { configured } = await window.govee.getApiKeyStatus();
  if (!configured) {
    showSetup();
  } else {
    showApp();
    loadDevices();
    loadPresets();
  }
});

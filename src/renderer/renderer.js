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

  // Load saved segment colors for all devices from local store
  const savedSegments = await Promise.all(
    res.devices.map((d) => window.govee.getDeviceSegments(d.device))
  );

  const cards = res.devices.map((device, i) => {
    const { card, updateState } = renderDeviceCard(device, savedSegments[i].segments);
    deviceContainer.appendChild(card);
    return { device, updateState };
  });

  // Fetch live API state per device in parallel
  cards.forEach(async ({ device, updateState }) => {
    const stateRes = await window.govee.getDeviceState(device.device, device.sku);
    if (stateRes.ok) updateState(stateRes.capabilities);
  });
}

const SUPPORTED_CAPABILITIES = [
  "colorRgb",
  "colorTemperatureK",
  "brightness",
  "segmentedColorRgb",
];

function hasCap(capabilities, instance) {
  return capabilities.some((c) => c.instance === instance);
}

function capParams(capabilities, instance) {
  const cap = capabilities.find((c) => c.instance === instance);
  return cap ? cap.parameters : null;
}

function intToHex(int) {
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return rgbToHex(r, g, b);
}

function getSegmentCount(capabilities) {
  const cap = capabilities.find((c) => c.instance === "segmentedColorRgb");
  if (!cap) return null;
  const segField = cap.parameters?.fields?.find((f) => f.fieldName === "segment");
  return segField ? segField.elementRange.max + 1 : null;
}

function renderDeviceCard(device, savedSegments) {
  const caps = device.capabilities || [];
  const supportedCaps = caps.filter((c) => SUPPORTED_CAPABILITIES.includes(c.instance));

  const card = document.createElement("div");
  card.className = "device-card";

  // Header
  const name = document.createElement("h3");
  name.textContent = device.deviceName;

  const model = document.createElement("p");
  model.className = "device-model";
  model.textContent = device.sku;

  // Capability tags
  const tags = document.createElement("div");
  tags.className = "cap-tags";
  supportedCaps.forEach((c) => {
    const tag = document.createElement("span");
    tag.className = "cap-tag";
    tag.textContent = c.instance;
    tags.appendChild(tag);
  });
  if (hasCap(caps, "segmentedColorRgb")) {
    const badge = document.createElement("span");
    badge.className = "cap-tag cap-tag--multi";
    badge.textContent = "multi-zone";
    tags.appendChild(badge);
  }

  card.append(name, model, tags);

  // Refs updated by updateState()
  let swatch = null, swatchHex = null, colorPicker = null;
  let brightnessValue = null, tempValue = null;

  // Color picker — shown whenever colorRgb is supported
  if (hasCap(caps, "colorRgb")) {
    const swatchRow = document.createElement("div");
    swatchRow.className = "swatch-row";

    const swatchLabel = document.createElement("span");
    swatchLabel.className = "swatch-label";
    swatchLabel.textContent = "Color";

    swatch = document.createElement("span");
    swatch.className = "color-swatch-large";
    swatch.style.backgroundColor = "#888";
    swatch.title = "Loading…";

    swatchHex = document.createElement("span");
    swatchHex.className = "swatch-hex";
    swatchHex.textContent = "…";

    swatchRow.append(swatchLabel, swatch, swatchHex);

    colorPicker = document.createElement("input");
    colorPicker.type = "color";
    colorPicker.value = "#ffffff";
    colorPicker.title = "Pick a color";

    colorPicker.addEventListener("input", () => {
      swatch.style.backgroundColor = colorPicker.value;
      swatchHex.textContent = colorPicker.value;
    });

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

      const res = await window.govee.setColor(device.device, device.sku, r, g, b);
      applyBtn.disabled = false;

      if (res.ok) {
        status.textContent = "Applied!";
        setTimeout(() => { status.textContent = ""; }, 2000);
      } else {
        status.className = "card-status err";
        status.textContent = res.error || "Error";
      }
    });

    card.append(swatchRow, colorPicker, applyBtn, status);
  }

  // Brightness row
  if (hasCap(caps, "brightness")) {
    const row = document.createElement("div");
    row.className = "state-row";
    const label = document.createElement("span");
    label.className = "state-label";
    label.textContent = "Brightness";
    brightnessValue = document.createElement("span");
    brightnessValue.className = "state-value";
    brightnessValue.textContent = "…";
    row.append(label, brightnessValue);
    card.appendChild(row);
  }

  // Color temperature row
  if (hasCap(caps, "colorTemperatureK")) {
    const row = document.createElement("div");
    row.className = "state-row";
    const label = document.createElement("span");
    label.className = "state-label";
    label.textContent = "Color temp";
    tempValue = document.createElement("span");
    tempValue.className = "state-value";
    tempValue.textContent = "…";
    row.append(label, tempValue);
    card.appendChild(row);
  }

  // Segment editor
  const segmentCount = getSegmentCount(caps);
  if (segmentCount !== null) {
    const segmentColors = savedSegments && savedSegments.length === segmentCount
      ? [...savedSegments]
      : Array(segmentCount).fill("#ffffff");

    const segEditor = document.createElement("div");
    segEditor.className = "seg-editor";

    const segHeader = document.createElement("div");
    segHeader.className = "state-row";
    segHeader.innerHTML = `<span class="state-label">Segments</span><span class="state-value">${segmentCount} zones</span>`;

    const strip = document.createElement("div");
    strip.className = "seg-strip";

    segmentColors.forEach((color, idx) => {
      const label = document.createElement("label");
      label.className = "seg-box";
      label.style.backgroundColor = color;
      label.title = `Segment ${idx + 1}`;

      const input = document.createElement("input");
      input.type = "color";
      input.value = color;
      input.className = "seg-input";
      input.addEventListener("input", () => {
        segmentColors[idx] = input.value;
        label.style.backgroundColor = input.value;
      });

      label.appendChild(input);
      strip.appendChild(label);
    });

    const applySegBtn = document.createElement("button");
    applySegBtn.className = "apply-color-btn";
    applySegBtn.textContent = "Apply Segments";

    const segStatus = document.createElement("p");
    segStatus.className = "card-status";

    applySegBtn.addEventListener("click", async () => {
      applySegBtn.disabled = true;
      segStatus.className = "card-status";
      segStatus.textContent = "Sending…";

      const res = await window.govee.setSegmentColors(device.device, device.sku, segmentColors);
      applySegBtn.disabled = false;

      if (res.ok) {
        segStatus.textContent = "Applied!";
        setTimeout(() => { segStatus.textContent = ""; }, 2000);
      } else {
        segStatus.className = "card-status err";
        segStatus.textContent = res.error || "Error";
      }
    });

    segEditor.append(segHeader, strip, applySegBtn, segStatus);
    card.appendChild(segEditor);
  }

  function updateState(stateCaps) {
    const stateFor = (instance) => {
      const cap = stateCaps.find((c) => c.instance === instance);
      return cap?.state?.value ?? null;
    };

    const colorVal = stateFor("colorRgb");
    if (colorVal !== null && swatch) {
      const hex = intToHex(colorVal);
      swatch.style.backgroundColor = hex;
      swatch.title = hex;
      swatchHex.textContent = hex;
      colorPicker.value = hex;
    } else if (swatch) {
      swatch.style.backgroundColor = "#444";
      swatchHex.textContent = "unknown";
    }

    const bVal = stateFor("brightness");
    if (brightnessValue) brightnessValue.textContent = bVal !== null ? `${bVal}%` : "—";

    const tVal = stateFor("colorTemperatureK");
    if (tempValue) tempValue.textContent = tVal !== null ? `${tVal}K` : "—";
  }

  return { card, updateState };
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

const canvas = document.getElementById("previewCanvas");
const canvasSizeLabel = document.getElementById("canvasSizeLabel");
const ctx = canvas.getContext("2d");
const fileInput = document.getElementById("fileInput");
const exportBtn = document.getElementById("exportBtn");
const renderSequenceBtn = document.getElementById("renderSequenceBtn");
const clearBtn = document.getElementById("clearBtn");
const renderStatus = document.getElementById("renderStatus");
const layersList = document.getElementById("layersList");
const presetSelect = document.getElementById("presetSelect");
const loadPresetBtn = document.getElementById("loadPresetBtn");
const savePresetBtn = document.getElementById("savePresetBtn");
const deletePresetBtn = document.getElementById("deletePresetBtn");
const exportPresetsBtn = document.getElementById("exportPresetsBtn");
const importPresetsBtn = document.getElementById("importPresetsBtn");
const importPresetsInput = document.getElementById("importPresetsInput");

const controls = {
  baseBlur: document.getElementById("baseBlur"),
  veilStep: document.getElementById("veilStep"),
  blurStep: document.getElementById("blurStep"),
  paperTranslucency: document.getElementById("paperTranslucency"),
  inkStrength: document.getElementById("inkStrength"),
  grainAmount: document.getElementById("grainAmount"),
  paperWhite: document.getElementById("paperWhite"),
  baseBlurOut: document.getElementById("baseBlurOut"),
  veilStepOut: document.getElementById("veilStepOut"),
  blurStepOut: document.getElementById("blurStepOut"),
  paperTranslucencyOut: document.getElementById("paperTranslucencyOut"),
  inkStrengthOut: document.getElementById("inkStrengthOut"),
  grainAmountOut: document.getElementById("grainAmountOut"),
  paperWhiteOut: document.getElementById("paperWhiteOut"),
};

let layers = [];
const parseSlideOrder = (n) => (n.match(/(\d+)(?!.*\d)/) ? Number(n.match(/(\d+)(?!.*\d)/)[1]) : Number.MAX_SAFE_INTEGER);
const layerCanvas = document.createElement("canvas");
const layerCtx = layerCanvas.getContext("2d", { willReadFrequently: true });
let dragIndex = -1;
let isRenderingSequence = false;
const PRESETS_STORAGE_KEY = "vellum-presets-v1";
const DEFAULT_PRESET_NAME = "default";

function isProtectedPreset(name) {
  return String(name).toLowerCase() === DEFAULT_PRESET_NAME;
}

function currentSettings() {
  return {
    baseBlur: Number(controls.baseBlur.value),
    veilStep: Number(controls.veilStep.value),
    blurStep: Number(controls.blurStep.value),
    paperTranslucency: Number(controls.paperTranslucency.value),
    inkStrength: Number(controls.inkStrength.value),
    grainAmount: Number(controls.grainAmount.value),
    paperWhite: Number(controls.paperWhite.value),
  };
}

function loadStoredPresets() {
  try {
    const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object") return parsed;
  } catch (error) {
    console.warn("could not load presets", error);
  }
  return { [DEFAULT_PRESET_NAME]: currentSettings() };
}

function saveStoredPresets(presets) {
  localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
}

function sanitizeSettings(settings) {
  if (!settings || typeof settings !== "object") return null;
  const out = {
    baseBlur: Number(settings.baseBlur),
    veilStep: Number(settings.veilStep),
    blurStep: Number(settings.blurStep),
    paperTranslucency: Number(settings.paperTranslucency),
    inkStrength: Number(settings.inkStrength),
    grainAmount: Number(settings.grainAmount),
    paperWhite: Number(settings.paperWhite),
  };
  if (Object.values(out).some((value) => Number.isNaN(value))) return null;
  return out;
}

function refreshPresetSelect(preferredName = "") {
  const presets = loadStoredPresets();
  const names = Object.keys(presets).sort((a, b) => a.localeCompare(b, "en"));
  presetSelect.innerHTML = "";
  for (const name of names) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    presetSelect.append(option);
  }
  if (preferredName && names.includes(preferredName)) {
    presetSelect.value = preferredName;
  } else if (names.length) {
    presetSelect.value = names[0];
  }
}

function applySettings(settings) {
  controls.baseBlur.value = String(settings.baseBlur ?? 0.35);
  controls.veilStep.value = String(settings.veilStep ?? 0.055);
  controls.blurStep.value = String(settings.blurStep ?? 1.3);
  controls.paperTranslucency.value = String(settings.paperTranslucency ?? 0.22);
  controls.inkStrength.value = String(settings.inkStrength ?? 1.05);
  controls.grainAmount.value = String(settings.grainAmount ?? 0.045);
  controls.paperWhite.value = String(settings.paperWhite ?? 248);
  render();
}

function exportPresetsToJson() {
  const presets = loadStoredPresets();
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    presets,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vellum-presets-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importPresetsFromJson(text) {
  const parsed = JSON.parse(text);
  const source = parsed?.presets && typeof parsed.presets === "object" ? parsed.presets : parsed;
  if (!source || typeof source !== "object") throw new Error("invalid presets json.");

  const current = loadStoredPresets();
  const merged = { ...current };
  let importedCount = 0;

  for (const [name, settings] of Object.entries(source)) {
    const cleanName = String(name).trim();
    if (!cleanName) continue;
    const sanitized = sanitizeSettings(settings);
    if (!sanitized) continue;
    merged[cleanName] = sanitized;
    importedCount += 1;
  }

  if (importedCount === 0) throw new Error("no valid presets in json.");
  saveStoredPresets(merged);
  refreshPresetSelect(DEFAULT_PRESET_NAME);
  return importedCount;
}

async function fileToImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Fill entire canvas; images stretch with drawImage (non-uniform scale if aspect ratios differ). */
function canvasStretchRect(targetCanvas) {
  const drawW = targetCanvas.width;
  const drawH = targetCanvas.height;
  return { x: 0, y: 0, drawW, drawH };
}

function updateCanvasSizeLabel() {
  if (!canvasSizeLabel || !canvas) return;
  canvasSizeLabel.textContent = `canvas ${canvas.width}x${canvas.height}px`;
}

function drawGrain(targetCtx, targetCanvas, alpha) {
  if (alpha <= 0) return;
  const imageData = targetCtx.getImageData(0, 0, targetCanvas.width, targetCanvas.height);
  const px = imageData.data;
  const strength = Math.max(2, Math.round(32 * alpha));
  for (let i = 0; i < px.length; i += 4) {
    const jitter = (Math.random() - 0.5) * strength;
    px[i] = Math.min(255, Math.max(0, px[i] + jitter));
    px[i + 1] = Math.min(255, Math.max(0, px[i + 1] + jitter));
    px[i + 2] = Math.min(255, Math.max(0, px[i + 2] + jitter));
  }
  targetCtx.putImageData(imageData, 0, 0);
}

function buildVellumLayer(image, drawW, drawH, paperTranslucency, inkStrength) {
  const w = Math.max(1, Math.round(drawW));
  const h = Math.max(1, Math.round(drawH));
  layerCanvas.width = w;
  layerCanvas.height = h;
  layerCtx.clearRect(0, 0, w, h);
  layerCtx.drawImage(image, 0, 0, w, h);

  const imgData = layerCtx.getImageData(0, 0, w, h);
  const px = imgData.data;

  for (let i = 0; i < px.length; i += 4) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    const a = px[i + 3] / 255;
    const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const ink = Math.pow(1 - luma, 0.85);
    const alphaFromTone = Math.min(1, paperTranslucency + ink * inkStrength);
    px[i + 3] = Math.round(255 * a * alphaFromTone);
  }

  layerCtx.putImageData(imgData, 0, 0);
  return layerCanvas;
}

function drawComposite(targetCtx, targetCanvas, layersToRender, settings) {
  const { baseBlur, white, grain, blurStep, veilStep, paperTranslucency, inkStrength } = settings;
  targetCtx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
  targetCtx.fillStyle = `rgb(${white}, ${white}, ${white})`;
  targetCtx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);

  const stretch = canvasStretchRect(targetCanvas);

  for (let i = 0; i < layersToRender.length; i += 1) {
    const layer = layersToRender[i];
    const { x, y, drawW, drawH } = stretch;
    const depthFromTop = layersToRender.length - 1 - i;
    const blurPx = baseBlur + depthFromTop * blurStep;
    const veilAlpha = Math.min(0.45, 0.02 + depthFromTop * veilStep);
    const vellumLayer = buildVellumLayer(layer.image, drawW, drawH, paperTranslucency, inkStrength);
    targetCtx.save();
    targetCtx.filter = `blur(${blurPx.toFixed(2)}px)`;
    targetCtx.drawImage(vellumLayer, x, y, drawW, drawH);
    targetCtx.restore();
    targetCtx.save();
    targetCtx.globalAlpha = veilAlpha;
    targetCtx.fillStyle = "#fff";
    targetCtx.fillRect(x, y, drawW, drawH);
    targetCtx.restore();
  }

  drawGrain(targetCtx, targetCanvas, grain);
}

function render() {
  const baseBlur = Number(controls.baseBlur.value);
  const white = Number(controls.paperWhite.value);
  const grain = Number(controls.grainAmount.value);
  const blurStep = Number(controls.blurStep.value);
  const veilStep = Number(controls.veilStep.value);
  const paperTranslucency = Number(controls.paperTranslucency.value);
  const inkStrength = Number(controls.inkStrength.value);

  controls.baseBlurOut.textContent = baseBlur.toFixed(2);
  controls.paperWhiteOut.textContent = String(white);
  controls.grainAmountOut.textContent = grain.toFixed(3);
  controls.veilStepOut.textContent = veilStep.toFixed(3);
  controls.blurStepOut.textContent = blurStep.toFixed(1);
  controls.paperTranslucencyOut.textContent = paperTranslucency.toFixed(2);
  controls.inkStrengthOut.textContent = inkStrength.toFixed(2);

  const visibleLayers = layers.filter((layer) => layer.visible);
  drawComposite(ctx, canvas, visibleLayers, {
    baseBlur,
    white,
    grain,
    blurStep,
    veilStep,
    paperTranslucency,
    inkStrength,
  });
}

function triggerDownload(dataUrl, filename) {
  const a = document.createElement("a");
  a.download = filename;
  a.href = dataUrl;
  a.click();
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function renderSequence() {
  if (isRenderingSequence) return;
  const sourceLayers = layers.filter((layer) => layer.visible);
  if (!sourceLayers.length) {
    window.alert("no visible layers to render.");
    return;
  }

  isRenderingSequence = true;
  renderSequenceBtn.disabled = true;
  renderStatus.textContent = "preparing...";

  const settings = {
    baseBlur: Number(controls.baseBlur.value),
    white: Number(controls.paperWhite.value),
    grain: Number(controls.grainAmount.value),
    blurStep: Number(controls.blurStep.value),
    veilStep: Number(controls.veilStep.value),
    paperTranslucency: Number(controls.paperTranslucency.value),
    inkStrength: Number(controls.inkStrength.value),
  };

  const offscreen = document.createElement("canvas");
  offscreen.width = canvas.width;
  offscreen.height = canvas.height;
  const offCtx = offscreen.getContext("2d");

  try {
    for (let step = 1; step <= sourceLayers.length; step += 1) {
      renderStatus.textContent = `rendering ${step}/${sourceLayers.length}...`;
      const stackSlice = sourceLayers.slice(0, step);
      drawComposite(offCtx, offscreen, stackSlice, settings);
      const padded = String(step).padStart(2, "0");
      const total = String(sourceLayers.length).padStart(2, "0");
      triggerDownload(offscreen.toDataURL("image/png"), `vellum-seq-${padded}-of-${total}.png`);
      await wait(120);
    }
    renderStatus.textContent = `exported sequence (${sourceLayers.length} images).`;
  } catch (error) {
    renderStatus.textContent = "sequence render failed.";
    window.alert(`sequence render error: ${error.message}`);
  } finally {
    isRenderingSequence = false;
    renderSequenceBtn.disabled = false;
    window.setTimeout(() => {
      if (!isRenderingSequence) renderStatus.textContent = "";
    }, 3000);
  }
}

function reorderLayers(fromIndex, toIndex) {
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
  const updated = [...layers];
  const [moved] = updated.splice(fromIndex, 1);
  updated.splice(toIndex, 0, moved);
  layers = updated;
}

function updateLayersUi() {
  layersList.innerHTML = "";
  const displayLayers = layers.map((layer, index) => ({ layer, index })).reverse();
  displayLayers.forEach(({ layer, index }) => {
    const li = document.createElement("li");
    li.className = "layer-row";
    li.draggable = true;
    li.dataset.index = String(index);

    li.addEventListener("dragstart", (event) => {
      dragIndex = index;
      li.classList.add("is-dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(index));
    });
    li.addEventListener("dragover", (event) => {
      event.preventDefault();
      li.classList.add("is-drop-target");
      event.dataTransfer.dropEffect = "move";
    });
    li.addEventListener("dragleave", () => {
      li.classList.remove("is-drop-target");
    });
    li.addEventListener("drop", (event) => {
      event.preventDefault();
      li.classList.remove("is-drop-target");
      const dropIndex = Number(li.dataset.index);
      reorderLayers(dragIndex, dropIndex);
      dragIndex = -1;
      updateLayersUi();
      render();
    });
    li.addEventListener("dragend", () => {
      dragIndex = -1;
      document.querySelectorAll(".layer-row").forEach((row) => {
        row.classList.remove("is-dragging", "is-drop-target");
      });
    });

    const meta = document.createElement("div");
    meta.innerHTML = `<div class="layer-name">${layer.fileName}</div><div class="layer-info">${index === layers.length - 1 ? "top" : index === 0 ? "bottom" : "middle"}</div>`;
    const btn = document.createElement("button");
    btn.className = "toggle-visibility";
    btn.textContent = layer.visible ? "visible" : "hidden";
    btn.onclick = () => { layer.visible = !layer.visible; updateLayersUi(); render(); };
    li.append(meta, btn);
    layersList.append(li);
  });
}

async function handleFiles(files) {
  const added = [];
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    const image = await fileToImage(file);
    added.push({ fileName: file.name, order: parseSlideOrder(file.name), image, visible: true });
  }
  layers = [...layers, ...added].sort((a, b) => (a.order - b.order) || a.fileName.localeCompare(b.fileName, "en"));
  updateLayersUi();
  render();
}

fileInput.addEventListener("change", (e) => {
  const files = Array.from(e.target.files || []);
  if (files.length) handleFiles(files);
});
["baseBlur", "veilStep", "blurStep", "paperTranslucency", "inkStrength", "grainAmount", "paperWhite"].forEach((k) => controls[k].addEventListener("input", render));
exportBtn.onclick = () => {
  if (!layers.length) return;
  triggerDownload(
    canvas.toDataURL("image/png"),
    `vellum-stack-${new Date().toISOString().replace(/[:.]/g, "-")}.png`
  );
};
renderSequenceBtn.onclick = () => {
  renderSequence();
};
clearBtn.onclick = () => { layers = []; fileInput.value = ""; updateLayersUi(); render(); };

savePresetBtn.onclick = () => {
  const name = window.prompt("preset name:", presetSelect.value || "");
  if (!name) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  const presets = loadStoredPresets();
  presets[trimmed] = currentSettings();
  saveStoredPresets(presets);
  refreshPresetSelect(trimmed);
};

loadPresetBtn.onclick = () => {
  const selected = presetSelect.value;
  if (!selected) return;
  const presets = loadStoredPresets();
  if (!presets[selected]) return;
  applySettings(presets[selected]);
};

deletePresetBtn.onclick = () => {
  const selected = presetSelect.value;
  if (!selected) return;
  if (isProtectedPreset(selected)) {
    window.alert("cannot delete default preset.");
    return;
  }
  const presets = loadStoredPresets();
  delete presets[selected];
  saveStoredPresets(presets);
  refreshPresetSelect(DEFAULT_PRESET_NAME);
};

exportPresetsBtn.onclick = () => {
  exportPresetsToJson();
};

importPresetsBtn.onclick = () => {
  importPresetsInput.click();
};

importPresetsInput.onchange = async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const count = importPresetsFromJson(text);
    window.alert(`imported ${count} presets.`);
  } catch (error) {
    window.alert(`import failed: ${error.message}`);
  } finally {
    importPresetsInput.value = "";
  }
};

if (!localStorage.getItem(PRESETS_STORAGE_KEY)) {
  saveStoredPresets({ [DEFAULT_PRESET_NAME]: currentSettings() });
}
refreshPresetSelect(DEFAULT_PRESET_NAME);
updateCanvasSizeLabel();
render();

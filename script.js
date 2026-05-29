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
const settingsContext = document.getElementById("settingsContext");
const settingsContextLabel = document.getElementById("settingsContextLabel");
const resetLayerOverridesBtn = document.getElementById("resetLayerOverridesBtn");

const controls = {
  baseBlur: document.getElementById("baseBlur"),
  veilStep: document.getElementById("veilStep"),
  paperWarmthStep: document.getElementById("paperWarmthStep"),
  blurStep: document.getElementById("blurStep"),
  paperTranslucency: document.getElementById("paperTranslucency"),
  colorTolerance: document.getElementById("colorTolerance"),
  inkStrength: document.getElementById("inkStrength"),
  grainAmount: document.getElementById("grainAmount"),
  scannerBgMode: document.getElementById("scannerBgMode"),
  scannerBgIntensity: document.getElementById("scannerBgIntensity"),
  stackOffsetY: document.getElementById("stackOffsetY"),
  stackOffsetZ: document.getElementById("stackOffsetZ"),
  stackRotation: document.getElementById("stackRotation"),
  stackRotationZoom: document.getElementById("stackRotationZoom"),
  stackOffsetYNum: document.getElementById("stackOffsetYNum"),
  stackOffsetZNum: document.getElementById("stackOffsetZNum"),
  stackRotationNum: document.getElementById("stackRotationNum"),
  stackRotationZoomNum: document.getElementById("stackRotationZoomNum"),
  baseBlurOut: document.getElementById("baseBlurOut"),
  veilStepOut: document.getElementById("veilStepOut"),
  paperWarmthStepOut: document.getElementById("paperWarmthStepOut"),
  blurStepOut: document.getElementById("blurStepOut"),
  paperTranslucencyOut: document.getElementById("paperTranslucencyOut"),
  colorToleranceOut: document.getElementById("colorToleranceOut"),
  inkStrengthOut: document.getElementById("inkStrengthOut"),
  grainAmountOut: document.getElementById("grainAmountOut"),
  scannerBgIntensityOut: document.getElementById("scannerBgIntensityOut"),
};

let layers = [];
let selectedLayerIndex = -1;
let cachedGlobalSettings = null;
const LAYER_OVERRIDE_KEYS = new Set([
  "baseBlur",
  "veilStep",
  "paperWarmthStep",
  "blurStep",
  "paperTranslucency",
  "colorTolerance",
  "inkStrength",
]);
const parseSlideOrder = (n) => (n.match(/(\d+)(?!.*\d)/) ? Number(n.match(/(\d+)(?!.*\d)/)[1]) : Number.MAX_SAFE_INTEGER);
const layerCanvas = document.createElement("canvas");
const layerCtx = layerCanvas.getContext("2d", { willReadFrequently: true });
let dragIndex = -1;
let isRenderingSequence = false;
const PRESETS_STORAGE_KEY = "vellum-presets-v1";
const DEFAULT_PRESET_NAME = "default";
const SETTINGS_DEFAULTS = {
  baseBlur: 0.35,
  veilStep: 0,
  paperWarmthStep: 0.049,
  blurStep: 1.5,
  paperTranslucency: 0.76,
  colorTolerance: 0.09,
  inkStrength: 1.05,
  grainAmount: 0.075,
  scannerBgMode: "white",
  scannerBgIntensity: 0.696,
  stackOffsetY: 0.5,
  stackOffsetZ: 0.0004,
  stackRotation: 0.42,
  stackRotationZoom: 0.0055,
};

function isProtectedPreset(name) {
  return String(name).toLowerCase() === DEFAULT_PRESET_NAME;
}

function legacyIntensityFromPaperWhite(settings) {
  if (settings.paperWhite === undefined) return SETTINGS_DEFAULTS.scannerBgIntensity;
  const level = Number(settings.paperWhite);
  if (settings.scannerBgMode === "black") {
    return Math.max(0, Math.min(1, 1 - level / 40));
  }
  return Math.max(0, Math.min(1, (level - 232) / 23));
}

function scannerBackgroundFromParts(mode, intensity) {
  const t = Math.max(0, Math.min(1, intensity));
  if (mode === "black") {
    const v = Math.round((1 - t) * 40);
    return { mode, intensity: t, r: v, g: v, b: v, paperTone: 248 };
  }
  const v = Math.round(232 + t * 23);
  return { mode, intensity: t, r: v, g: v, b: v, paperTone: v };
}

function scannerBackgroundFromSettings(settings) {
  const mode = settings.scannerBgMode === "black" ? "black" : "white";
  const rawIntensity = settings.scannerBgIntensity;
  const intensity = Number.isFinite(Number(rawIntensity))
    ? Number(rawIntensity)
    : legacyIntensityFromPaperWhite(settings);
  return scannerBackgroundFromParts(mode, intensity);
}

function formatScannerBedLabel(scannerBg) {
  if (scannerBg.mode === "black") {
    return `rgb ${scannerBg.r}`;
  }
  return String(scannerBg.r);
}

function currentSettings() {
  return {
    baseBlur: Number(controls.baseBlur.value),
    veilStep: Number(controls.veilStep.value),
    paperWarmthStep: Number(controls.paperWarmthStep.value),
    blurStep: Number(controls.blurStep.value),
    paperTranslucency: Number(controls.paperTranslucency.value),
    colorTolerance: Number(controls.colorTolerance.value),
    inkStrength: Number(controls.inkStrength.value),
    grainAmount: Number(controls.grainAmount.value),
    scannerBgMode: controls.scannerBgMode.value,
    scannerBgIntensity: Number(controls.scannerBgIntensity.value),
    stackOffsetY: Number(controls.stackOffsetY.value),
    stackOffsetZ: Number(controls.stackOffsetZ.value),
    stackRotation: Number(controls.stackRotation.value),
    stackRotationZoom: Number(controls.stackRotationZoom.value),
  };
}

function globalSettingsSnapshot() {
  if (selectedLayerIndex >= 0 && cachedGlobalSettings) return { ...cachedGlobalSettings };
  return currentSettings();
}

function layerOverrideValue(layer, key, globalValue) {
  const override = layer.overrides?.[key];
  return override === undefined ? globalValue : Number(override);
}

function layerHasOverrides(layer) {
  return Boolean(layer.overrides && Object.keys(layer.overrides).length);
}

function setLayerOverrideValue(layer, key, value) {
  if (!layer.overrides) layer.overrides = {};
  layer.overrides[key] = value;
}

function clearLayerOverrides(layer) {
  delete layer.overrides;
}

function effectiveControlValue(key, globals) {
  if (selectedLayerIndex < 0 || !LAYER_OVERRIDE_KEYS.has(key)) {
    return globals[key];
  }
  return layerOverrideValue(layers[selectedLayerIndex], key, globals[key]);
}

function syncControlsToSelection() {
  const globals = globalSettingsSnapshot();
  for (const key of LAYER_OVERRIDE_KEYS) {
    controls[key].value = String(effectiveControlValue(key, globals));
  }
  updateSettingsContextUi();
}

function updateSettingsContextUi() {
  if (!settingsContext || !settingsContextLabel || !resetLayerOverridesBtn) return;
  if (selectedLayerIndex < 0) {
    settingsContext.classList.remove("is-layer");
    settingsContextLabel.textContent = "global";
    resetLayerOverridesBtn.hidden = true;
    return;
  }
  const layer = layers[selectedLayerIndex];
  settingsContext.classList.add("is-layer");
  settingsContextLabel.textContent = layer?.fileName ?? "layer";
  resetLayerOverridesBtn.hidden = !layerHasOverrides(layer);
}

function selectLayer(index) {
  if (index < 0 || index >= layers.length) return;
  if (selectedLayerIndex === index) {
    deselectLayer();
    return;
  }
  if (selectedLayerIndex < 0) {
    cachedGlobalSettings = globalSettingsSnapshot();
  }
  selectedLayerIndex = index;
  syncControlsToSelection();
  updateLayersUi();
}

function deselectLayer() {
  if (selectedLayerIndex < 0) return;
  if (cachedGlobalSettings) {
    applySettings(cachedGlobalSettings, { renderPreview: false });
  }
  selectedLayerIndex = -1;
  cachedGlobalSettings = null;
  updateSettingsContextUi();
  updateLayersUi();
  render();
}

function handleLayerAwareControlInput(key, value) {
  if (selectedLayerIndex >= 0 && LAYER_OVERRIDE_KEYS.has(key)) {
    setLayerOverrideValue(layers[selectedLayerIndex], key, value);
    controls[key].value = String(value);
    updateSettingsContextUi();
    updateLayersUi();
    render();
    return;
  }
  controls[key].value = String(value);
  if (cachedGlobalSettings) cachedGlobalSettings[key] = value;
  render();
}

function clampStackValue(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function setRangeNumberPair(rangeEl, numberEl, value, format) {
  const clamped = clampStackValue(value, Number(rangeEl.min), Number(rangeEl.max));
  rangeEl.value = String(clamped);
  numberEl.value = format(clamped);
}

function bindRangeNumber(rangeEl, numberEl, format) {
  const min = Number(rangeEl.min);
  const max = Number(rangeEl.max);

  const apply = (value) => {
    setRangeNumberPair(rangeEl, numberEl, value, format);
    render();
  };

  rangeEl.addEventListener("input", () => apply(Number(rangeEl.value)));
  numberEl.addEventListener("input", () => {
    const raw = numberEl.value;
    if (raw === "" || raw === "-" || raw === "." || raw === "-.") return;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    apply(parsed);
  });
  numberEl.addEventListener("change", () => {
    const parsed = Number(numberEl.value);
    apply(Number.isFinite(parsed) ? parsed : Number(rangeEl.value));
  });
}

function loadStoredPresets() {
  try {
    const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object") return parsed;
  } catch (error) {
    console.warn("could not load presets", error);
  }
  return { [DEFAULT_PRESET_NAME]: { ...SETTINGS_DEFAULTS } };
}

function saveStoredPresets(presets) {
  localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
}

function sanitizeSettings(settings) {
  if (!settings || typeof settings !== "object") return null;
  const out = {
    baseBlur: Number(settings.baseBlur),
    veilStep: Number(settings.veilStep),
    paperWarmthStep: Number(settings.paperWarmthStep ?? SETTINGS_DEFAULTS.paperWarmthStep),
    blurStep: Number(settings.blurStep),
    paperTranslucency: Number(settings.paperTranslucency),
    colorTolerance: Number(settings.colorTolerance ?? SETTINGS_DEFAULTS.colorTolerance),
    inkStrength: Number(settings.inkStrength),
    grainAmount: Number(settings.grainAmount),
    scannerBgMode: settings.scannerBgMode === "black" ? "black" : "white",
    scannerBgIntensity: Number(
      settings.scannerBgIntensity ?? legacyIntensityFromPaperWhite(settings)
    ),
    stackOffsetY: Number(settings.stackOffsetY ?? SETTINGS_DEFAULTS.stackOffsetY),
    stackOffsetZ: Number(settings.stackOffsetZ ?? SETTINGS_DEFAULTS.stackOffsetZ),
    stackRotation: Number(settings.stackRotation ?? SETTINGS_DEFAULTS.stackRotation),
    stackRotationZoom: Number(settings.stackRotationZoom ?? SETTINGS_DEFAULTS.stackRotationZoom),
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

function applySettings(settings, options = {}) {
  const { renderPreview = true } = options;
  controls.baseBlur.value = String(settings.baseBlur ?? SETTINGS_DEFAULTS.baseBlur);
  controls.veilStep.value = String(settings.veilStep ?? SETTINGS_DEFAULTS.veilStep);
  controls.paperWarmthStep.value = String(settings.paperWarmthStep ?? SETTINGS_DEFAULTS.paperWarmthStep);
  controls.blurStep.value = String(settings.blurStep ?? SETTINGS_DEFAULTS.blurStep);
  controls.paperTranslucency.value = String(settings.paperTranslucency ?? SETTINGS_DEFAULTS.paperTranslucency);
  controls.colorTolerance.value = String(settings.colorTolerance ?? SETTINGS_DEFAULTS.colorTolerance);
  controls.inkStrength.value = String(settings.inkStrength ?? SETTINGS_DEFAULTS.inkStrength);
  controls.grainAmount.value = String(settings.grainAmount ?? SETTINGS_DEFAULTS.grainAmount);
  controls.scannerBgMode.value = settings.scannerBgMode === "black" ? "black" : "white";
  controls.scannerBgIntensity.value = String(
    settings.scannerBgIntensity ?? legacyIntensityFromPaperWhite(settings)
  );
  setRangeNumberPair(
    controls.stackOffsetY,
    controls.stackOffsetYNum,
    settings.stackOffsetY ?? SETTINGS_DEFAULTS.stackOffsetY,
    (v) => v.toFixed(1)
  );
  setRangeNumberPair(
    controls.stackOffsetZ,
    controls.stackOffsetZNum,
    settings.stackOffsetZ ?? SETTINGS_DEFAULTS.stackOffsetZ,
    (v) => v.toFixed(4)
  );
  setRangeNumberPair(
    controls.stackRotation,
    controls.stackRotationNum,
    settings.stackRotation ?? SETTINGS_DEFAULTS.stackRotation,
    (v) => v.toFixed(2)
  );
  setRangeNumberPair(
    controls.stackRotationZoom,
    controls.stackRotationZoomNum,
    settings.stackRotationZoom ?? SETTINGS_DEFAULTS.stackRotationZoom,
    (v) => v.toFixed(4)
  );
  if (renderPreview) render();
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

const filmGrainCache = new Map();

function buildFilmGrainTile(tileSize, paperWhite) {
  const noise = new Float32Array(tileSize * tileSize);
  for (let i = 0; i < noise.length; i += 1) {
    noise[i] = Math.random();
  }

  const tile = document.createElement("canvas");
  tile.width = tileSize;
  tile.height = tileSize;
  const tileCtx = tile.getContext("2d");
  const img = tileCtx.createImageData(tileSize, tileSize);
  const px = img.data;
  const warmShift = (paperWhite - 248) * 0.12;

  for (let y = 0; y < tileSize; y += 1) {
    for (let x = 0; x < tileSize; x += 1) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = (x + dx + tileSize) % tileSize;
          const ny = (y + dy + tileSize) % tileSize;
          sum += noise[ny * tileSize + nx];
        }
      }
      const v = sum / 9;
      const gray = Math.round(128 + (v - 0.32) * 92);
      const i = (y * tileSize + x) * 4;
      px[i] = Math.min(255, Math.max(0, gray + 5 + warmShift));
      px[i + 1] = Math.min(255, Math.max(0, gray + 2 + warmShift * 0.6));
      px[i + 2] = Math.min(255, Math.max(0, gray - 5 + warmShift * 0.2));
      px[i + 3] = 255;
    }
  }

  tileCtx.putImageData(img, 0, 0);
  return tile;
}

function getFilmGrainTile(paperWhite) {
  const tileSize = 128;
  const key = `${tileSize}-${paperWhite}`;
  if (!filmGrainCache.has(key)) {
    filmGrainCache.set(key, buildFilmGrainTile(tileSize, paperWhite));
  }
  return filmGrainCache.get(key);
}

function drawGrain(targetCtx, targetCanvas, amount, paperWhite) {
  if (amount <= 0) return;
  const tile = getFilmGrainTile(paperWhite);
  const { width, height } = targetCanvas;

  targetCtx.save();
  targetCtx.globalCompositeOperation = "screen";
  targetCtx.globalAlpha = Math.min(0.88, amount * 3.8);
  targetCtx.fillStyle = targetCtx.createPattern(tile, "repeat");
  targetCtx.fillRect(0, 0, width, height);
  targetCtx.restore();
}

function pixelChroma(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  return Math.max(rn, gn, bn) - Math.min(rn, gn, bn);
}

function neutralVellumOpacity(luma, inkStrength) {
  return Math.min(1, Math.pow(1 - luma, 0.85) * inkStrength);
}

function buildVellumLayer(image, drawW, drawH, paperTranslucency, inkStrength, colorTolerance) {
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
    const chroma = pixelChroma(r, g, b);

    let alphaFromTone = 1;
    if (chroma <= colorTolerance) {
      const vellumOpacity = neutralVellumOpacity(luma, inkStrength);
      alphaFromTone = paperTranslucency + (1 - paperTranslucency) * vellumOpacity;
    }

    px[i + 3] = Math.round(255 * a * alphaFromTone);
  }

  layerCtx.putImageData(imgData, 0, 0);
  return layerCanvas;
}

function rotationCoverScale(degrees, aspect) {
  if (degrees === 0) return 1;
  const rad = (Math.abs(degrees) * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const w = aspect;
  const h = 1;
  return Math.max((w * c + h * s) / w, (w * s + h * c) / h);
}

function applyStackTransform(
  targetCtx,
  x,
  y,
  drawW,
  drawH,
  depthFromBottom,
  stackOffsetY,
  stackOffsetZ,
  stackRotation,
  stackRotationZoom
) {
  const yShift = depthFromBottom * stackOffsetY;
  const depthScale = 1 + depthFromBottom * stackOffsetZ;
  const rotationSign = depthFromBottom % 2 === 0 ? 1 : -1;
  const layerRotationDeg = rotationSign * stackRotation;
  const rotationRad = (layerRotationDeg * Math.PI) / 180;
  let scale = depthScale;
  if (stackRotation !== 0) {
    const aspect = drawW / drawH;
    const cover = rotationCoverScale(Math.abs(layerRotationDeg), aspect);
    scale *= cover * (1 + stackRotationZoom);
  }
  targetCtx.translate(x + drawW * 0.5, y + drawH * 0.5 + yShift);
  targetCtx.rotate(rotationRad);
  targetCtx.scale(scale, scale);
  targetCtx.translate(-drawW * 0.5, -drawH * 0.5);
}

function paperWarmthScale(paperTranslucency) {
  const t = Math.max(0, Math.min(1, paperTranslucency));
  return 0.08 + t * t * 0.92;
}

function effectivePaperWarmth(paperWarmthStep, paperTranslucency, stackIndex, stackTotal) {
  const depthBoost = 0.8 + (stackIndex / Math.max(1, stackTotal)) * 0.45;
  return paperWarmthStep * paperWarmthScale(paperTranslucency) * depthBoost;
}

function warmVeilColor(paperWhite, depthFromTop, paperWarmthStep, paperTranslucency) {
  const warmthScale = paperWarmthScale(paperTranslucency);
  const stackBias = Math.min(1, depthFromTop * paperWarmthStep * 24 * warmthScale);
  const g = Math.min(255, Math.round(paperWhite + 4 + stackBias * 10));
  const b = Math.max(198, Math.round(paperWhite - 14 - stackBias * 38));
  return `rgb(255, ${g}, ${b})`;
}

function applyPaperWarmthAccumulation(targetCtx, targetCanvas, warmthAlpha, paperWhite, paperTranslucency) {
  if (warmthAlpha <= 0) return;
  const scaled = warmthAlpha * paperWarmthScale(paperTranslucency);
  const colorAlpha = Math.min(0.42, scaled * 1.15);
  const softAlpha = Math.min(0.28, scaled * 0.7);
  if (colorAlpha <= 0 && softAlpha <= 0) return;

  const wg = Math.min(255, paperWhite + 10);
  const wb = Math.max(196, paperWhite - 36);
  const warmFill = `rgb(255, ${wg}, ${wb})`;

  if (colorAlpha > 0) {
    targetCtx.save();
    targetCtx.globalCompositeOperation = "color";
    targetCtx.globalAlpha = colorAlpha;
    targetCtx.fillStyle = warmFill;
    targetCtx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);
    targetCtx.restore();
  }

  if (softAlpha > 0) {
    targetCtx.save();
    targetCtx.globalCompositeOperation = "soft-light";
    targetCtx.globalAlpha = softAlpha;
    targetCtx.fillStyle = warmFill;
    targetCtx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);
    targetCtx.restore();
  }
}

function drawComposite(targetCtx, targetCanvas, layersToRender, settings) {
  const {
    baseBlur,
    scannerBg,
    grain,
    blurStep,
    veilStep,
    paperWarmthStep,
    paperTranslucency,
    colorTolerance,
    inkStrength,
    stackOffsetY,
    stackOffsetZ,
    stackRotation,
    stackRotationZoom,
  } = settings;
  targetCtx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
  targetCtx.fillStyle = `rgb(${scannerBg.r}, ${scannerBg.g}, ${scannerBg.b})`;
  targetCtx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);

  const stretch = canvasStretchRect(targetCanvas);

  for (let i = 0; i < layersToRender.length; i += 1) {
    const layer = layersToRender[i];
    const { x, y, drawW, drawH } = stretch;
    const depthFromTop = layersToRender.length - 1 - i;
    const layerBaseBlur = layerOverrideValue(layer, "baseBlur", baseBlur);
    const layerBlurStep = layerOverrideValue(layer, "blurStep", blurStep);
    const layerVeilStep = layerOverrideValue(layer, "veilStep", veilStep);
    const layerPaperWarmthStep = layerOverrideValue(layer, "paperWarmthStep", paperWarmthStep);
    const layerPaperTranslucency = layerOverrideValue(layer, "paperTranslucency", paperTranslucency);
    const layerColorTolerance = layerOverrideValue(layer, "colorTolerance", colorTolerance);
    const layerInkStrength = layerOverrideValue(layer, "inkStrength", inkStrength);
    const blurPx = layerBaseBlur + depthFromTop * layerBlurStep;
    const veilAlpha = Math.min(0.45, 0.02 + depthFromTop * layerVeilStep);
    const vellumLayer = buildVellumLayer(
      layer.image,
      drawW,
      drawH,
      layerPaperTranslucency,
      layerInkStrength,
      layerColorTolerance
    );
    const depthFromBottom = i;
    targetCtx.save();
    applyStackTransform(
      targetCtx,
      x,
      y,
      drawW,
      drawH,
      depthFromBottom,
      stackOffsetY,
      stackOffsetZ,
      stackRotation,
      stackRotationZoom
    );
    targetCtx.filter = `blur(${blurPx.toFixed(2)}px)`;
    targetCtx.drawImage(vellumLayer, 0, 0, drawW, drawH);
    targetCtx.filter = "none";
    targetCtx.globalAlpha = veilAlpha;
    targetCtx.fillStyle = warmVeilColor(
      scannerBg.paperTone,
      depthFromTop,
      layerPaperWarmthStep,
      layerPaperTranslucency
    );
    targetCtx.fillRect(0, 0, drawW, drawH);
    targetCtx.restore();
    const layerWarmth = effectivePaperWarmth(
      layerPaperWarmthStep,
      layerPaperTranslucency,
      i + 1,
      layersToRender.length
    );
    applyPaperWarmthAccumulation(
      targetCtx,
      targetCanvas,
      layerWarmth,
      scannerBg.paperTone,
      layerPaperTranslucency
    );
  }

  drawGrain(targetCtx, targetCanvas, grain, scannerBg.paperTone);
}

function render() {
  const globals = globalSettingsSnapshot();
  const baseBlur = effectiveControlValue("baseBlur", globals);
  const scannerBg = scannerBackgroundFromParts(
    controls.scannerBgMode.value,
    Number(controls.scannerBgIntensity.value)
  );
  const grain = Number(controls.grainAmount.value);
  const blurStep = effectiveControlValue("blurStep", globals);
  const veilStep = effectiveControlValue("veilStep", globals);
  const paperWarmthStep = effectiveControlValue("paperWarmthStep", globals);
  const paperTranslucency = effectiveControlValue("paperTranslucency", globals);
  const colorTolerance = effectiveControlValue("colorTolerance", globals);
  const inkStrength = effectiveControlValue("inkStrength", globals);
  const stackOffsetY = Number(controls.stackOffsetY.value);
  const stackOffsetZ = Number(controls.stackOffsetZ.value);
  const stackRotation = Number(controls.stackRotation.value);
  const stackRotationZoom = Number(controls.stackRotationZoom.value);

  controls.baseBlurOut.textContent = baseBlur.toFixed(2);
  controls.scannerBgIntensityOut.textContent = formatScannerBedLabel(scannerBg);
  controls.grainAmountOut.textContent = grain.toFixed(3);
  controls.veilStepOut.textContent = veilStep.toFixed(3);
  controls.paperWarmthStepOut.textContent = paperWarmthStep.toFixed(3);
  controls.blurStepOut.textContent = blurStep.toFixed(1);
  controls.paperTranslucencyOut.textContent = paperTranslucency.toFixed(2);
  controls.colorToleranceOut.textContent = colorTolerance.toFixed(2);
  controls.inkStrengthOut.textContent = inkStrength.toFixed(2);

  const visibleLayers = layers.filter((layer) => layer.visible);
  drawComposite(ctx, canvas, visibleLayers, {
    baseBlur: globals.baseBlur,
    scannerBg,
    grain,
    blurStep: globals.blurStep,
    veilStep: globals.veilStep,
    paperWarmthStep: globals.paperWarmthStep,
    paperTranslucency: globals.paperTranslucency,
    colorTolerance: globals.colorTolerance,
    inkStrength: globals.inkStrength,
    stackOffsetY,
    stackOffsetZ,
    stackRotation,
    stackRotationZoom,
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
    ...globalSettingsSnapshot(),
    scannerBg: scannerBackgroundFromParts(
      controls.scannerBgMode.value,
      Number(controls.scannerBgIntensity.value)
    ),
    grain: Number(controls.grainAmount.value),
    stackOffsetY: Number(controls.stackOffsetY.value),
    stackOffsetZ: Number(controls.stackOffsetZ.value),
    stackRotation: Number(controls.stackRotation.value),
    stackRotationZoom: Number(controls.stackRotationZoom.value),
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
  if (selectedLayerIndex === fromIndex) {
    selectedLayerIndex = toIndex;
  } else if (fromIndex < selectedLayerIndex && toIndex >= selectedLayerIndex) {
    selectedLayerIndex -= 1;
  } else if (fromIndex > selectedLayerIndex && toIndex <= selectedLayerIndex) {
    selectedLayerIndex += 1;
  }
}

function updateLayersUi() {
  layersList.innerHTML = "";
  const displayLayers = layers.map((layer, index) => ({ layer, index })).reverse();
  displayLayers.forEach(({ layer, index }) => {
    const li = document.createElement("li");
    li.className = "layer-row";
    if (index === selectedLayerIndex) li.classList.add("is-selected");
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
    meta.className = "layer-meta";
    const overrideCount = layer.overrides ? Object.keys(layer.overrides).length : 0;
    const overrideHint = overrideCount
      ? `<div class="layer-override-badge">${overrideCount} override${overrideCount === 1 ? "" : "s"}</div>`
      : "";
    meta.innerHTML = `<div class="layer-name">${layer.fileName}</div><div class="layer-info">${index === layers.length - 1 ? "top" : index === 0 ? "bottom" : "middle"}</div>${overrideHint}`;
    meta.addEventListener("click", () => {
      selectLayer(index);
    });

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
    added.push({ fileName: file.name, order: parseSlideOrder(file.name), image, visible: true, overrides: {} });
  }
  layers = [...layers, ...added].sort((a, b) => (a.order - b.order) || a.fileName.localeCompare(b.fileName, "en"));
  updateLayersUi();
  render();
}

fileInput.addEventListener("change", (e) => {
  const files = Array.from(e.target.files || []);
  if (files.length) handleFiles(files);
});
[
  "baseBlur",
  "veilStep",
  "paperWarmthStep",
  "blurStep",
  "paperTranslucency",
  "colorTolerance",
  "inkStrength",
  "grainAmount",
  "scannerBgIntensity",
].forEach((k) => {
  controls[k].addEventListener("input", () => {
    handleLayerAwareControlInput(k, Number(controls[k].value));
  });
});

controls.scannerBgMode.addEventListener("change", render);

if (resetLayerOverridesBtn) {
  resetLayerOverridesBtn.onclick = () => {
    if (selectedLayerIndex < 0) return;
    clearLayerOverrides(layers[selectedLayerIndex]);
    syncControlsToSelection();
    updateLayersUi();
    render();
  };
}

if (settingsContextLabel) {
  settingsContextLabel.addEventListener("click", () => {
    if (selectedLayerIndex >= 0) deselectLayer();
  });
}

bindRangeNumber(controls.stackOffsetY, controls.stackOffsetYNum, (v) => v.toFixed(1));
bindRangeNumber(controls.stackOffsetZ, controls.stackOffsetZNum, (v) => v.toFixed(4));
bindRangeNumber(controls.stackRotation, controls.stackRotationNum, (v) => v.toFixed(2));
bindRangeNumber(controls.stackRotationZoom, controls.stackRotationZoomNum, (v) => v.toFixed(4));
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
clearBtn.onclick = () => {
  layers = [];
  selectedLayerIndex = -1;
  cachedGlobalSettings = null;
  fileInput.value = "";
  updateSettingsContextUi();
  updateLayersUi();
  render();
};

savePresetBtn.onclick = () => {
  const name = window.prompt("preset name:", presetSelect.value || "");
  if (!name) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  const presets = loadStoredPresets();
  presets[trimmed] = globalSettingsSnapshot();
  saveStoredPresets(presets);
  refreshPresetSelect(trimmed);
};

loadPresetBtn.onclick = () => {
  const selected = presetSelect.value;
  if (!selected) return;
  const presets = loadStoredPresets();
  if (!presets[selected]) return;
  deselectLayer();
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
  saveStoredPresets({ [DEFAULT_PRESET_NAME]: { ...SETTINGS_DEFAULTS } });
  applySettings(SETTINGS_DEFAULTS);
} else {
  const presets = loadStoredPresets();
  if (presets[DEFAULT_PRESET_NAME]) applySettings(presets[DEFAULT_PRESET_NAME]);
}
refreshPresetSelect(DEFAULT_PRESET_NAME);
updateSettingsContextUi();
updateCanvasSizeLabel();
render();

const canvas = document.getElementById("mapCanvas");
const ctx = canvas.getContext("2d");
const shell = document.querySelector(".canvas-shell");
const statusEl = document.getElementById("status");
const scaleReadout = document.getElementById("scaleReadout");

const controls = {
  upload: document.getElementById("mapUpload"),
  fit: document.getElementById("fitMap"),
  scaleMeters: document.getElementById("scaleMeters"),
  calibrate: document.getElementById("calibrateScale"),
  finishPipeline: document.getElementById("finishPipeline"),
  undo: document.getElementById("undo"),
  clearAll: document.getElementById("clearAll"),
  download: document.getElementById("downloadPng"),
  saveProject: document.getElementById("saveProject"),
  redRadius: document.getElementById("redRadius"),
  orangeRadius: document.getElementById("orangeRadius"),
  yellowRadius: document.getElementById("yellowRadius"),
  redValue: document.getElementById("redValue"),
  orangeValue: document.getElementById("orangeValue"),
  yellowValue: document.getElementById("yellowValue"),
  resetPreset: document.getElementById("resetPreset"),
};

const state = {
  image: new Image(),
  imageSrc: "assets/jurong-island-map.png",
  imageReady: false,
  mode: "pipeline",
  pipeSize: "10",
  contourStyle: "outline",
  scaleMode: false,
  scaleClicks: [],
  pixelsPerMeter: null,
  activePipeline: [],
  pipelines: [],
  sources: [],
  labels: [],
  history: [],
  radii: {
    red: 200,
    orange: 500,
    yellow: 1000,
  },
};

const pipePresets = {
  "10": {
    label: "10 inch",
    color: "#006b3c",
    radii: { red: 100, orange: 250, yellow: 500 },
  },
  "32": {
    label: "32 inch",
    color: "#b00020",
    radii: { red: 300, orange: 750, yellow: 1500 },
  },
  "18": {
    label: "18 inch",
    color: "#0047ab",
    radii: { red: 150, orange: 400, yellow: 800 },
  },
};

state.image.onload = () => {
  state.imageReady = true;
  canvas.width = state.image.naturalWidth;
  canvas.height = state.image.naturalHeight;
  fitCanvasToShell();
  draw();
};
loadSavedProject();

function fitCanvasToShell() {
  if (!state.imageReady) return;
  const available = shell.clientWidth;
  const scale = Math.min(1, Math.max(0.36, available / canvas.width));
  canvas.style.width = `${Math.round(canvas.width * scale)}px`;
  canvas.style.height = `${Math.round(canvas.height * scale)}px`;
}

function getPointer(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  };
}

function radiusPx(meters) {
  if (!state.pixelsPerMeter) return meters * 0.18;
  return meters * state.pixelsPerMeter;
}

function contourSet(radii = state.radii) {
  return [
    { key: "yellow", fill: "#f7ff3c", stroke: "#f7ff3c", alpha: 0.16, meters: radii.yellow },
    { key: "orange", fill: "#ff9f1c", stroke: "#ff9f1c", alpha: 0.16, meters: radii.orange },
    { key: "red", fill: "#ff2d55", stroke: "#ff2d55", alpha: 0.16, meters: radii.red },
  ];
}

function getPipeSizeData(size = state.pipeSize) {
  return pipePresets[size] || pipePresets["10"];
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (state.imageReady) ctx.drawImage(state.image, 0, 0);

  drawContours();
  drawPipelines();
  drawActivePipeline();
  drawSources();
  drawLabels();
  drawScaleClicks();
  drawExportNote();
  drawAutoLegend();
}

function drawContours() {
  const features = getContourFeatures();
  if (!features.length) return;
  const keys = ["yellow", "orange", "red"];
  keys.forEach((key) => {
    const baseZone = contourSet()[keys.indexOf(key)];
    const mask = createZoneMask(features, key);
    if (state.contourStyle === "shaded") {
      drawMaskFill(mask, baseZone.fill, baseZone.alpha);
    }
    drawMaskBoundary(mask, baseZone.stroke, state.contourStyle === "outline" ? 5 : 3);
  });
}

function getContourFeatures() {
  const features = [];
  state.pipelines.forEach((pipeline) => {
    if (pipeline.points.length > 1) {
      features.push({ type: "pipeline", points: pipeline.points, radii: pipeline.radii || getPipeSizeData(pipeline.size).radii });
    }
  });
  if (state.activePipeline.length > 1) {
    features.push({ type: "pipeline", points: state.activePipeline, radii: state.radii });
  }
  state.sources.forEach((source) => {
    features.push({ type: "source", x: source.x, y: source.y, radii: source.radii || state.radii });
  });
  return features;
}

function createZoneMask(features, key) {
  const mask = document.createElement("canvas");
  mask.width = canvas.width;
  mask.height = canvas.height;
  const maskCtx = mask.getContext("2d");
  maskCtx.fillStyle = "#000";
  maskCtx.strokeStyle = "#000";
  maskCtx.lineCap = "round";
  maskCtx.lineJoin = "round";

  features.forEach((feature) => {
    const meters = feature.radii[key];
    const px = radiusPx(meters);
    if (feature.type === "pipeline") {
      maskCtx.lineWidth = Math.max(2, px * 2);
      strokePathOn(maskCtx, feature.points);
    } else {
      maskCtx.beginPath();
      maskCtx.arc(feature.x, feature.y, px, 0, Math.PI * 2);
      maskCtx.fill();
    }
  });
  return mask;
}

function drawMaskFill(mask, color, alpha) {
  const layer = document.createElement("canvas");
  layer.width = canvas.width;
  layer.height = canvas.height;
  const layerCtx = layer.getContext("2d");
  layerCtx.fillStyle = color;
  layerCtx.fillRect(0, 0, layer.width, layer.height);
  layerCtx.globalCompositeOperation = "destination-in";
  layerCtx.drawImage(mask, 0, 0);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}

function drawMaskBoundary(mask, color, thickness) {
  const maskCtx = mask.getContext("2d");
  const source = maskCtx.getImageData(0, 0, mask.width, mask.height);
  const output = maskCtx.createImageData(mask.width, mask.height);
  const rgba = hexToRgba(color);
  const width = mask.width;
  const height = mask.height;
  const half = Math.max(1, Math.floor(thickness / 2));

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4 + 3;
      if (source.data[index] === 0) continue;
      const edge =
        source.data[index - 4] === 0 ||
        source.data[index + 4] === 0 ||
        source.data[index - width * 4] === 0 ||
        source.data[index + width * 4] === 0;
      if (!edge) continue;
      for (let oy = -half; oy <= half; oy += 1) {
        for (let ox = -half; ox <= half; ox += 1) {
          const tx = x + ox;
          const ty = y + oy;
          if (tx < 0 || ty < 0 || tx >= width || ty >= height) continue;
          const out = (ty * width + tx) * 4;
          output.data[out] = rgba.r;
          output.data[out + 1] = rgba.g;
          output.data[out + 2] = rgba.b;
          output.data[out + 3] = 235;
        }
      }
    }
  }
  const boundary = document.createElement("canvas");
  boundary.width = mask.width;
  boundary.height = mask.height;
  boundary.getContext("2d").putImageData(output, 0, 0);
  ctx.drawImage(boundary, 0, 0);
}

function hexToRgba(hex) {
  const normalized = hex.replace("#", "");
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function drawPipelines() {
  state.pipelines.forEach((pipeline) => drawPipeline(pipeline.points, false, pipeline.size));
}

function drawActivePipeline() {
  drawPipeline(state.activePipeline, true, state.pipeSize);
}

function drawPipeline(points, active, size) {
  if (!points.length) return;
  const pipe = getPipeSizeData(size);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (points.length > 1) {
    ctx.strokeStyle = pipe.color;
    ctx.lineWidth = active ? 8 : 7;
    strokePath(points);
    ctx.strokeStyle = "#f8fbfc";
    ctx.lineWidth = 2;
    strokePath(points);
  }
  points.forEach((point) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = pipe.color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#fff";
    ctx.stroke();
  });
  if (points.length > 1) {
    const end = points[points.length - 1];
    ctx.font = "bold 18px Arial";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.fillStyle = pipe.color;
    ctx.strokeText(pipe.label, end.x + 14, end.y - 12);
    ctx.fillText(pipe.label, end.x + 14, end.y - 12);
  }
  ctx.restore();
}

function drawSources() {
  state.sources.forEach((source) => {
    ctx.save();
    ctx.beginPath();
    ctx.arc(source.x, source.y, 12, 0, Math.PI * 2);
    ctx.fillStyle = "#053b49";
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#fff";
    ctx.stroke();
    ctx.font = "bold 20px Arial";
    ctx.fillStyle = "#053b49";
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 5;
    ctx.strokeText("Terminal", source.x + 18, source.y + 7);
    ctx.fillText("Terminal", source.x + 18, source.y + 7);
    ctx.restore();
  });
}

function drawLabels() {
  state.labels.forEach((label) => {
    ctx.save();
    ctx.font = "bold 22px Arial";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(255,255,255,0.94)";
    ctx.fillStyle = "#17202a";
    ctx.strokeText(label.text, label.x, label.y);
    ctx.fillText(label.text, label.x, label.y);
    ctx.restore();
  });
}

function drawScaleClicks() {
  if (!state.scaleClicks.length) return;
  ctx.save();
  ctx.fillStyle = "#076678";
  state.scaleClicks.forEach((point) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 9, 0, Math.PI * 2);
    ctx.fill();
  });
  if (state.scaleClicks.length === 2) {
    ctx.strokeStyle = "#076678";
    ctx.lineWidth = 4;
    strokePath(state.scaleClicks);
  }
  ctx.restore();
}

function drawExportNote() {
  ctx.save();
  ctx.font = "18px Arial";
  const note = "Illustrative screening contours only - actual CO2 contours require QRA/dispersion modelling";
  const pad = 12;
  const textWidth = ctx.measureText(note).width;
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.fillRect(16, canvas.height - 54, textWidth + pad * 2, 38);
  ctx.fillStyle = "#2e3f4c";
  ctx.fillText(note, 16 + pad, canvas.height - 29);
  ctx.restore();
}

function drawAutoLegend() {
  const usedPipeSizes = new Set(state.pipelines.map((pipeline) => pipeline.size));
  if (state.activePipeline.length > 1) usedPipeSizes.add(state.pipeSize);
  const usesContours = state.pipelines.length || state.activePipeline.length > 1 || state.sources.length;
  if (!usedPipeSizes.size && !usesContours) return;

  const lines = [];
  usedPipeSizes.forEach((size) => {
    const pipe = getPipeSizeData(size);
    lines.push({ type: "pipe", label: `${pipe.label} CO2 pipeline`, color: pipe.color });
  });
  if (usesContours) {
    lines.push({ type: "zone", label: "Red: immediate high-concern zone", color: "#ff2d55", stroke: "#ff2d55" });
    lines.push({ type: "zone", label: "Orange: emergency planning zone", color: "#ff9f1c", stroke: "#ff9f1c" });
    lines.push({ type: "zone", label: "Yellow: wider receptor screening zone", color: "#f7ff3c", stroke: "#f7ff3c" });
  }

  ctx.save();
  ctx.font = "bold 28px Arial";
  const title = "Legend";
  ctx.font = "22px Arial";
  const width = Math.max(390, ...lines.map((line) => ctx.measureText(line.label).width + 90));
  const rowHeight = 38;
  const height = 66 + lines.length * rowHeight;
  const x = canvas.width - width - 24;
  const y = 24;

  ctx.fillStyle = "rgba(255,255,255,0.94)";
  roundRect(x, y, width, height, 12);
  ctx.fill();
  ctx.strokeStyle = "rgba(23,32,42,0.18)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.font = "bold 28px Arial";
  ctx.fillStyle = "#17202a";
  ctx.fillText(title, x + 22, y + 39);

  lines.forEach((line, index) => {
    const rowY = y + 78 + index * rowHeight;
    if (line.type === "pipe") {
      ctx.strokeStyle = line.color;
      ctx.lineWidth = 10;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x + 24, rowY - 9);
      ctx.lineTo(x + 62, rowY - 9);
      ctx.stroke();
    } else {
      ctx.fillStyle = state.contourStyle === "shaded" ? line.color : "rgba(255,255,255,0.85)";
      ctx.strokeStyle = line.stroke;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x + 43, rowY - 10, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.font = "22px Arial";
    ctx.fillStyle = "#263746";
    ctx.fillText(line.label, x + 78, rowY - 2);
  });
  ctx.restore();
}

function roundRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function strokePath(points) {
  if (points.length < 2) return;
  strokePathOn(ctx, points);
}

function strokePathOn(targetCtx, points) {
  if (points.length < 2) return;
  targetCtx.beginPath();
  targetCtx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    targetCtx.lineTo(points[i].x, points[i].y);
  }
  targetCtx.stroke();
}

function pushHistory() {
  state.history.push(JSON.stringify({
    pipelines: state.pipelines,
    sources: state.sources,
    labels: state.labels,
    activePipeline: state.activePipeline,
    pixelsPerMeter: state.pixelsPerMeter,
    pipeSize: state.pipeSize,
    contourStyle: state.contourStyle,
    radii: state.radii,
    imageSrc: state.imageSrc,
  }));
  if (state.history.length > 50) state.history.shift();
}

function restoreHistory() {
  const previous = state.history.pop();
  if (!previous) return;
  const snapshot = JSON.parse(previous);
  state.pipelines = snapshot.pipelines;
  state.sources = snapshot.sources;
  state.labels = snapshot.labels;
  state.activePipeline = snapshot.activePipeline;
  state.pixelsPerMeter = snapshot.pixelsPerMeter;
  state.pipeSize = snapshot.pipeSize || "10";
  state.contourStyle = snapshot.contourStyle || "outline";
  state.radii = snapshot.radii || state.radii;
  state.imageSrc = snapshot.imageSrc || state.imageSrc;
  syncPipeSizeButtons();
  syncContourStyleButtons();
  syncRadiusControls();
  updateScaleReadout();
  draw();
}

function setMode(mode) {
  state.mode = mode;
  state.scaleMode = false;
  state.scaleClicks = [];
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });
  const names = { pipeline: "Pipeline mode: click points on the map.", source: "Terminal mode: click a source point.", label: "Label mode: click and type a label." };
  statusEl.textContent = names[mode];
  draw();
}

function finishPipeline() {
  if (state.activePipeline.length < 2) return;
  pushHistory();
  state.pipelines.push({ points: [...state.activePipeline], size: state.pipeSize, radii: { ...state.radii } });
  state.activePipeline = [];
  statusEl.textContent = "Pipeline saved.";
  draw();
}

function updateRadii() {
  state.radii.red = Number(controls.redRadius.value);
  state.radii.orange = Number(controls.orangeRadius.value);
  state.radii.yellow = Number(controls.yellowRadius.value);
  controls.redValue.value = `${state.radii.red} m`;
  controls.orangeValue.value = `${state.radii.orange} m`;
  controls.yellowValue.value = `${state.radii.yellow} m`;
  draw();
}

function syncRadiusControls() {
  controls.redRadius.value = state.radii.red;
  controls.orangeRadius.value = state.radii.orange;
  controls.yellowRadius.value = state.radii.yellow;
  controls.redValue.value = `${state.radii.red} m`;
  controls.orangeValue.value = `${state.radii.orange} m`;
  controls.yellowValue.value = `${state.radii.yellow} m`;
}

function setPipeSize(size) {
  state.pipeSize = size;
  state.radii = { ...getPipeSizeData(size).radii };
  syncPipeSizeButtons();
  syncRadiusControls();
  statusEl.textContent = `${getPipeSizeData(size).label} pipeline selected.`;
  draw();
}

function resetToSelectedPreset() {
  state.radii = { ...getPipeSizeData(state.pipeSize).radii };
  syncRadiusControls();
  statusEl.textContent = `${getPipeSizeData(state.pipeSize).label} screening defaults restored.`;
  draw();
}

function setContourStyle(style) {
  state.contourStyle = style;
  syncContourStyleButtons();
  statusEl.textContent = style === "shaded" ? "Connected shading enabled." : "Line contours enabled.";
  draw();
}

function saveProject() {
  const payload = {
    version: 1,
    imageSrc: state.imageSrc,
    pixelsPerMeter: state.pixelsPerMeter,
    pipeSize: state.pipeSize,
    contourStyle: state.contourStyle,
    radii: state.radii,
    pipelines: state.pipelines,
    sources: state.sources,
    labels: state.labels,
  };
  localStorage.setItem("co2-contour-sketcher", JSON.stringify(payload));
  statusEl.textContent = "Changes saved in this browser.";
}

function loadSavedProject() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem("co2-contour-sketcher"));
  } catch {
    saved = null;
  }
  if (saved) {
    state.imageSrc = saved.imageSrc || state.imageSrc;
    state.pixelsPerMeter = saved.pixelsPerMeter || null;
    state.pipeSize = saved.pipeSize || state.pipeSize;
    state.contourStyle = saved.contourStyle || state.contourStyle;
    state.radii = saved.radii || state.radii;
    state.pipelines = saved.pipelines || [];
    state.sources = saved.sources || [];
    state.labels = saved.labels || [];
    syncPipeSizeButtons();
    syncContourStyleButtons();
    syncRadiusControls();
    updateScaleReadout();
    statusEl.textContent = "Saved sketch loaded.";
  }
  state.image.src = state.imageSrc;
}

function syncPipeSizeButtons() {
  document.querySelectorAll("[data-size]").forEach((button) => {
    button.classList.toggle("active", button.dataset.size === state.pipeSize);
  });
}

function syncContourStyleButtons() {
  document.querySelectorAll("[data-contour-style]").forEach((button) => {
    button.classList.toggle("active", button.dataset.contourStyle === state.contourStyle);
  });
}

function updateScaleReadout() {
  if (!state.pixelsPerMeter) {
    scaleReadout.textContent = "Scale not calibrated";
    return;
  }
  scaleReadout.textContent = `500 m = ${Math.round(state.pixelsPerMeter * 500)} px`;
}

canvas.addEventListener("click", (event) => {
  const point = getPointer(event);

  if (state.scaleMode) {
    state.scaleClicks.push(point);
    if (state.scaleClicks.length === 2) {
      const [a, b] = state.scaleClicks;
      const px = Math.hypot(a.x - b.x, a.y - b.y);
      const meters = Math.max(1, Number(controls.scaleMeters.value));
      pushHistory();
      state.pixelsPerMeter = px / meters;
      state.scaleMode = false;
      statusEl.textContent = "Scale calibrated.";
      updateScaleReadout();
    } else {
      statusEl.textContent = "Click the other end of the scale bar.";
    }
    draw();
    return;
  }

  if (state.mode === "pipeline") {
    pushHistory();
    state.activePipeline.push(point);
    draw();
    return;
  }

  if (state.mode === "source") {
    pushHistory();
    state.sources.push({ ...point, radii: { ...state.radii } });
    draw();
    return;
  }

  if (state.mode === "label") {
    const text = window.prompt("Label text");
    if (!text) return;
    pushHistory();
    state.labels.push({ ...point, text: text.trim() });
    draw();
  }
});

canvas.addEventListener("dblclick", (event) => {
  event.preventDefault();
  finishPipeline();
});

document.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

document.querySelectorAll("[data-size]").forEach((button) => {
  button.addEventListener("click", () => setPipeSize(button.dataset.size));
});

document.querySelectorAll("[data-contour-style]").forEach((button) => {
  button.addEventListener("click", () => setContourStyle(button.dataset.contourStyle));
});

controls.finishPipeline.addEventListener("click", finishPipeline);
controls.saveProject.addEventListener("click", saveProject);
controls.undo.addEventListener("click", restoreHistory);
controls.clearAll.addEventListener("click", () => {
  pushHistory();
  state.pipelines = [];
  state.sources = [];
  state.labels = [];
  state.activePipeline = [];
  state.scaleClicks = [];
  draw();
});

controls.calibrate.addEventListener("click", () => {
  state.scaleMode = true;
  state.scaleClicks = [];
  statusEl.textContent = "Click one end of the map scale bar.";
  draw();
});

controls.fit.addEventListener("click", fitCanvasToShell);

[controls.redRadius, controls.orangeRadius, controls.yellowRadius].forEach((input) => {
  input.addEventListener("input", updateRadii);
});

controls.resetPreset.addEventListener("click", resetToSelectedPreset);

controls.upload.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.image = new Image();
    state.image.onload = () => {
      state.imageReady = true;
      canvas.width = state.image.naturalWidth;
      canvas.height = state.image.naturalHeight;
      fitCanvasToShell();
      draw();
    };
    state.imageSrc = reader.result;
    state.image.src = state.imageSrc;
  };
  reader.readAsDataURL(file);
});

controls.download.addEventListener("click", () => {
  draw();
  const link = document.createElement("a");
  link.download = "co2-risk-contour-sketch.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
});

window.addEventListener("resize", fitCanvasToShell);
updateRadii();
updateScaleReadout();

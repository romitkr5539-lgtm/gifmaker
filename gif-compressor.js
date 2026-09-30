import { parseGIF, decompressFrames } from 'https://cdn.jsdelivr.net/npm/gifuct-js@2.1.2/+esm';
import { GIFEncoder, quantize, applyPalette } from 'https://cdn.jsdelivr.net/npm/gifenc@1.0.3/+esm';

const state = {
  file: null,
  frames: [],
  compressedUrl: null,
  isCompressing: false,
};

const els = {
  uploadView: document.getElementById('compress-upload-view'),
  processView: document.getElementById('compress-process-view'),
  uploadAlert: document.getElementById('upload-alert'),
  processAlert: document.getElementById('process-alert'),
  dropZone: document.getElementById('gif-drop-zone'),
  fileInput: document.getElementById('gif-file-input'),
  sourceName: document.getElementById('source-file-name'),
  sourceMeta: document.getElementById('source-file-meta'),
  animationMeta: document.getElementById('source-animation-meta'),
  target: document.getElementById('target-kb-input'),
  originalDetails: document.getElementById('original-gif-details'),
  compressedDetails: document.getElementById('compressed-gif-details'),
  palette: document.getElementById('palette-size-select'),
  scale: document.getElementById('scale-select'),
  customOptionsToggle: document.getElementById('toggle-custom-options'),
  customOptionsPanel: document.getElementById('custom-options-panel'),
  progress: document.getElementById('compress-progress'),
  progressText: document.getElementById('compress-progress-text'),
  progressPercent: document.getElementById('compress-progress-percent'),
  progressFill: document.getElementById('compress-progress-fill'),
  compressButton: document.getElementById('compress-gif-button'),
  download: document.getElementById('download-compressed-gif'),
  summary: document.getElementById('compression-summary'),
};

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function showAlert(message) {
  const alert = els.processView.classList.contains('hidden') ? els.uploadAlert : els.processAlert;
  alert.textContent = message;
  alert.classList.remove('hidden');
}

function clearAlerts() {
  [els.uploadAlert, els.processAlert].forEach((alert) => {
    alert.textContent = '';
    alert.classList.add('hidden');
  });
}

function setProgress(label, value) {
  const percent = Math.max(0, Math.min(100, Math.round(value)));
  els.progressText.textContent = label;
  els.progressPercent.textContent = `${percent}%`;
  els.progressFill.style.width = `${percent}%`;
}

function showProcessView() {
  els.uploadView.classList.add('hidden');
  els.processView.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function loadGif(file) {
  clearAlerts();
  if (!file) return;
  if (file.size === 0) {
    showAlert('This GIF file is empty.');
    return;
  }
  if (file.type && file.type !== 'image/gif' && !file.name.toLowerCase().endsWith('.gif')) {
    showAlert('Choose an animated GIF file.');
    return;
  }

  try {
    const buffer = await file.arrayBuffer();
    const parsed = parseGIF(buffer);
    const frames = decompressFrames(parsed, true);
    const width = parsed.lsd.width;
    const height = parsed.lsd.height;
    if (!width || !height || !frames.length) throw new Error('No GIF frames were found in this file.');
    releaseUrls();
    state.file = file;
    state.frames = frames;
    state.width = width;
    state.height = height;
    state.frameCount = frames.length;

    els.sourceName.textContent = file.name;
    els.sourceMeta.textContent = `${formatBytes(file.size)} · ${width} × ${height} px`;
    els.animationMeta.textContent = `${frames.length} frames · ${formatDuration(frames)}`;
    els.originalDetails.textContent = `${formatBytes(file.size)} · ${width} × ${height} px`;
    els.compressedDetails.textContent = 'Compressing automatically...';
    els.summary.textContent = '';
    els.download.classList.add('hidden');
    els.compressButton.disabled = false;
    showProcessView();
    await compressGif();
  } catch (error) {
    showAlert(error.message || 'Could not read this GIF. Try another file.');
  }
}

function formatDuration(frames) {
  const ms = frames.reduce((total, frame) => total + Math.max(20, frame.delay || 100), 0);
  return `${(ms / 1000).toFixed(1)} sec`;
}

function yieldToBrowser() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function compressGif() {
  if (state.isCompressing || !state.frames.length) return;
  const targetBytes = Number(els.target.value) * 1024;
  if (!Number.isFinite(targetBytes) || targetBytes < 1024) {
    showAlert('Enter a target size of at least 1 KB.');
    return;
  }
  clearAlerts();
  state.isCompressing = true;
  els.compressButton.disabled = true;
  els.compressButton.textContent = 'Compressing...';
  els.download.classList.add('hidden');
  els.progress.classList.remove('hidden');
  els.summary.textContent = '';
  els.palette.disabled = true;
  els.scale.disabled = true;
  els.target.disabled = true;

  const startingColors = Number(els.palette.value);
  const startingScale = Number(els.scale.value);
  const candidates = [{ colors: startingColors, scale: startingScale }];
  [128, 64, 32].filter((colors) => colors < startingColors).forEach((colors) => {
    candidates.push({ colors, scale: startingScale });
  });
  [0.75, 0.5].filter((scale) => scale < startingScale).forEach((scale) => {
    candidates.push({ colors: 32, scale });
  });

  let bestResult = { blob: state.file, width: state.width, height: state.height };
  let targetReached = state.file.size <= targetBytes;

  try {
    for (let attempt = 0; attempt < candidates.length; attempt += 1) {
      const { colors, scale } = candidates[attempt];
      const width = Math.max(1, Math.round(state.width * scale));
      const height = Math.max(1, Math.round(state.height * scale));
      const sourceCanvas = document.createElement('canvas');
      sourceCanvas.width = state.width;
      sourceCanvas.height = state.height;
      const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
      const outputCanvas = document.createElement('canvas');
      outputCanvas.width = width;
      outputCanvas.height = height;
      const outputContext = outputCanvas.getContext('2d', { willReadFrequently: true });
      const encoder = GIFEncoder();
      let previousFrame = null;
      let restorePixels = null;

      for (let index = 0; index < state.frames.length; index += 1) {
        const frame = state.frames[index];
        if (previousFrame) {
          if (previousFrame.disposalType === 2) {
            sourceContext.clearRect(previousFrame.dims.left, previousFrame.dims.top, previousFrame.dims.width, previousFrame.dims.height);
          } else if (previousFrame.disposalType === 3 && restorePixels) {
            sourceContext.putImageData(restorePixels, 0, 0);
          }
        }

        restorePixels = frame.disposalType === 3
          ? sourceContext.getImageData(0, 0, state.width, state.height)
          : null;
        const patch = new ImageData(frame.patch, frame.dims.width, frame.dims.height);
        sourceContext.putImageData(patch, frame.dims.left, frame.dims.top);
        outputContext.clearRect(0, 0, width, height);
        outputContext.drawImage(sourceCanvas, 0, 0, width, height);

        const rgba = outputContext.getImageData(0, 0, width, height).data;
        const palette = quantize(rgba, colors, { format: 'rgba4444', oneBitAlpha: true });
        const indexedPixels = applyPalette(rgba, palette, 'rgba4444');
        const transparentIndex = palette.findIndex((color) => color[3] < 128);
        const delay = Math.max(20, frame.delay || 100);

        encoder.writeFrame(indexedPixels, width, height, {
          palette,
          delay,
          repeat: index === 0 ? 0 : undefined,
          dispose: 2,
          transparent: transparentIndex >= 0,
          transparentIndex: transparentIndex >= 0 ? transparentIndex : 0,
        });
        previousFrame = frame;
        const frameProgress = (attempt + (index + 1) / state.frames.length) / candidates.length;
        setProgress(`Pass ${attempt + 1}/${candidates.length} · ${colors} colors · ${Math.round(scale * 100)}%`, frameProgress * 95);
        if (index % 4 === 3) await yieldToBrowser();
      }

      encoder.finish();
      const blob = new Blob([encoder.bytes()], { type: 'image/gif' });
      if (blob.size < bestResult.blob.size) bestResult = { blob, width, height };
      if (blob.size <= targetBytes) {
        targetReached = true;
        break;
      }
      await yieldToBrowser();
    }

    if (els.compressedUrl) URL.revokeObjectURL(els.compressedUrl);
    state.compressedUrl = URL.createObjectURL(bestResult.blob);
    els.download.href = state.compressedUrl;
    els.download.download = `${state.file.name.replace(/\.gif$/i, '')}-compressed.gif`;
    els.download.classList.remove('hidden');
    els.compressedDetails.textContent = `${formatBytes(bestResult.blob.size)} · ${bestResult.width} × ${bestResult.height} px`;

    const difference = state.file.size - bestResult.blob.size;
    const ratio = Math.round(Math.abs(difference) / state.file.size * 100);
    const resultSummary = difference >= 0
      ? `Reduced by ${formatBytes(difference)} (${ratio}%).`
      : `Output is ${ratio}% larger than the original.`;
    const targetSummary = targetReached
      ? `Target reached: ${els.target.value} KB.`
      : `Closest result is ${formatBytes(bestResult.blob.size)}, above the ${els.target.value} KB target.`;
    els.summary.textContent = `${resultSummary} ${targetSummary}`;
    setProgress('Compression complete', 100);
  } catch (error) {
    showAlert(error.message || 'GIF compression failed. Try a smaller file or fewer frames.');
  } finally {
    state.isCompressing = false;
    els.compressButton.disabled = false;
    els.compressButton.textContent = 'Compress again';
    els.palette.disabled = false;
    els.scale.disabled = false;
    els.target.disabled = false;
    window.setTimeout(() => els.progress.classList.add('hidden'), 700);
  }
}

function releaseUrls() {
  if (state.compressedUrl) URL.revokeObjectURL(state.compressedUrl);
  state.compressedUrl = null;
}

function resetTool() {
  if (state.isCompressing) return;
  releaseUrls();
  state.file = null;
  state.frames = [];
  state.width = 0;
  state.height = 0;
  state.frameCount = 0;
  els.fileInput.value = '';
  els.sourceName.textContent = 'animation.gif';
  els.sourceMeta.textContent = '0 MB';
  els.animationMeta.textContent = 'Animated GIF';
  els.originalDetails.textContent = '';
  els.compressedDetails.textContent = 'Preparing output...';
  els.summary.textContent = '';
  els.download.classList.add('hidden');
  els.download.removeAttribute('href');
  els.download.download = 'compressed.gif';
  els.compressButton.disabled = false;
  els.compressButton.textContent = 'Compress again';
  els.progress.classList.add('hidden');
  els.progressFill.style.width = '0%';
  els.palette.disabled = false;
  els.palette.value = '128';
  els.scale.disabled = false;
  els.scale.value = '1';
  els.target.disabled = false;
  els.target.value = '500';
  els.customOptionsPanel.classList.add('hidden');
  els.customOptionsToggle.setAttribute('aria-expanded', 'false');
  els.customOptionsToggle.querySelector('span').textContent = 'Show custom options';
  els.uploadAlert.textContent = '';
  els.uploadAlert.classList.add('hidden');
  els.processAlert.textContent = '';
  els.processAlert.classList.add('hidden');
  els.processView.classList.add('hidden');
  els.uploadView.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function init() {
  document.getElementById('choose-gif-button').addEventListener('click', () => els.fileInput.click());
  document.getElementById('choose-another-gif-button').addEventListener('click', () => els.fileInput.click());
  document.getElementById('reset-compression-button').addEventListener('click', resetTool);
  els.customOptionsToggle.addEventListener('click', () => {
    const expanded = els.customOptionsToggle.getAttribute('aria-expanded') === 'true';
    els.customOptionsToggle.setAttribute('aria-expanded', String(!expanded));
    els.customOptionsPanel.classList.toggle('hidden', expanded);
    els.customOptionsToggle.querySelector('span').textContent = expanded ? 'Show custom options' : 'Hide custom options';
  });
  els.compressButton.addEventListener('click', compressGif);
  els.fileInput.addEventListener('change', (event) => {
    loadGif(event.target.files?.[0]);
    event.target.value = '';
  });
  els.dropZone.addEventListener('click', (event) => {
    if (!event.target.closest('button')) els.fileInput.click();
  });
  els.dropZone.addEventListener('dragover', (event) => {
    event.preventDefault();
    els.dropZone.classList.add('drag-active');
  });
  els.dropZone.addEventListener('dragleave', (event) => {
    if (!els.dropZone.contains(event.relatedTarget)) els.dropZone.classList.remove('drag-active');
  });
  els.dropZone.addEventListener('drop', (event) => {
    event.preventDefault();
    els.dropZone.classList.remove('drag-active');
    loadGif(event.dataTransfer.files?.[0]);
  });
  document.getElementById('theme-toggle').addEventListener('click', () => document.body.classList.toggle('light-theme'));
  window.addEventListener('beforeunload', releaseUrls);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

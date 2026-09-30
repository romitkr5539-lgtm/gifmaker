/**
 * ClipForge Video to GIF Studio
 * Features auto-convert on upload, client-side GIF rendering,
 * and dedicated processing & preview view.
 */

// ============================================================================
// CONSTANTS
// ============================================================================
const CORE_VERSION = '0.12.6';
const CDN_PRIMARY = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`;
const CDN_FALLBACK = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm`;

const MAX_FILE_SIZE_BYTES = 250 * 1024 * 1024; // 250 MB
const SUPPORTED_EXTENSIONS = ['.mp4', '.webm', '.mov'];
const SUPPORTED_MIME_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-m4v'
];

// ============================================================================
// APPLICATION STATE
// ============================================================================
const state = {
  currentFile: null,
  videoDuration: 0,
  videoWidth: 0,
  videoHeight: 0,
  startTime: 0,
  endTime: 0,
  selectedFps: 15,
  selectedWidth: 360, // 360px default: 45% fewer pixels than 480px, fast rendering
  selectedQuality: 'turbo', // 🚀 Turbo mode default: Direct single-pass streaming (5x faster)
  videoObjectUrl: null,
  gifBlobUrl: null,
  gifBlob: null,
  isConverting: false,
  isConverterReady: false,
  cancelRequested: false,
  autoConvert: true,
  optionsExpanded: false,
  conversionStartTime: 0,
};

let ffmpegInstance = null;

// ============================================================================
// DOM ELEMENTS
// ============================================================================
const els = {
  // Navigation
  btnSampleNav: document.getElementById('btn-sample-nav'),
  btnThemeToggle: document.getElementById('btn-theme-toggle'),

  // Alerts
  alertBanner: document.getElementById('alert-banner'),
  alertMessage: document.getElementById('alert-message'),
  alertCloseBtn: document.getElementById('alert-close-btn'),

  // Upload Zone & Split Button
  dropZoneCard: document.getElementById('drop-zone-card'),
  fileInput: document.getElementById('file-input'),
  btnSelectFileMain: document.getElementById('btn-select-file-main'),
  btnSelectFileArrow: document.getElementById('btn-select-file-arrow'),
  splitMenu: document.getElementById('split-menu'),
  menuOptComputer: document.getElementById('menu-opt-computer'),
  menuOptSample: document.getElementById('menu-opt-sample'),
  chkAutoConvert: document.getElementById('chk-auto-convert'),

  // Header Widget Display
  widgetSourceLabel: document.getElementById('widget-source-label'),

  // Queue Card (Active Item)
  queueCard: document.getElementById('queue-card'),
  queueFileName: document.getElementById('queue-file-name'),
  queueFileSize: document.getElementById('queue-file-size'),
  queueFileDuration: document.getElementById('queue-file-duration'),
  queueFileDim: document.getElementById('queue-file-dim'),
  btnToggleOptions: document.getElementById('btn-toggle-options'),
  btnQueueConvert: document.getElementById('btn-queue-convert'),
  btnQueueDownload: document.getElementById('btn-queue-download'),
  btnQueueRemove: document.getElementById('btn-queue-remove'),

  // Queue Progress
  queueProgressBarWrap: document.getElementById('queue-progress-bar-wrap'),
  queueStatusText: document.getElementById('queue-status-text'),
  queuePercentText: document.getElementById('queue-percent-text'),
  queueProgressFill: document.getElementById('queue-progress-fill'),
  btnQueueCancel: document.getElementById('btn-queue-cancel'),

  // Options Panel
  queueOptionsPanel: document.getElementById('queue-options-panel'),
  videoPlayer: document.getElementById('video-player'),
  timelineTrackWrap: document.getElementById('timeline-track-wrap'),
  timelineRangeHighlight: document.getElementById('timeline-range-highlight'),
  timelinePlayhead: document.getElementById('timeline-playhead'),
  sliderStart: document.getElementById('slider-start'),
  sliderEnd: document.getElementById('slider-end'),
  timelineStartVal: document.getElementById('timeline-start-val'),
  timelineEndVal: document.getElementById('timeline-end-val'),
  timelineClipVal: document.getElementById('timeline-clip-val'),
  btnPreviewClip: document.getElementById('btn-preview-clip'),
  btnResetTrim: document.getElementById('btn-reset-trim'),

  inputStartTime: document.getElementById('input-start-time'),
  inputEndTime: document.getElementById('input-end-time'),
  btnSetStartCur: document.getElementById('btn-set-start-cur'),
  btnSetEndCur: document.getElementById('btn-set-end-cur'),
  timeError: document.getElementById('time-error'),

  fpsButtons: document.querySelectorAll('[data-fps]'),
  widthButtons: document.querySelectorAll('[data-width]'),
  outputResolutionHint: document.getElementById('output-resolution-hint'),
  selectQuality: document.getElementById('select-quality'),

  // Result Preview Area
  queueResultPreview: document.getElementById('queue-result-preview'),
  resultSpecsBadge: document.getElementById('result-specs-badge'),
  gifResultImg: document.getElementById('gif-result-img'),
  copyNotificationBanner: document.getElementById('copy-notification-banner'),
  btnResultDownload: document.getElementById('btn-result-download'),
  btnResultCopy: document.getElementById('btn-result-copy'),
  btnResultNew: document.getElementById('btn-result-new'),

  // Page Views
  viewUpload: document.getElementById('view-upload'),
  viewProcessPreview: document.getElementById('view-process-preview'),
  btnBackUpload: document.getElementById('btn-back-upload'),
  procFileName: document.getElementById('proc-file-name'),
  procFileSize: document.getElementById('proc-file-size'),
  procFileFormat: document.getElementById('proc-file-format'),
  procInputFormat: document.getElementById('proc-input-format'),

  // FAQ Accordion
  faqAccordion: document.getElementById('faq-accordion'),
};

// ============================================================================
// UTILITIES
// ============================================================================

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatTime(seconds, includeDecimals = false) {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const minsStr = String(mins).padStart(2, '0');
  if (includeDecimals) {
    const secsStr = secs.toFixed(2).padStart(5, '0');
    return `${minsStr}:${secsStr}`;
  }
  const secsStr = String(Math.floor(secs)).padStart(2, '0');
  return `${minsStr}:${secsStr}`;
}

function parseTimeString(timeStr) {
  if (typeof timeStr === 'number') return timeStr;
  if (!timeStr) return NaN;
  const cleanStr = timeStr.trim();
  if (cleanStr.includes(':')) {
    const parts = cleanStr.split(':');
    if (parts.length === 2) {
      const mins = parseFloat(parts[0]);
      const secs = parseFloat(parts[1]);
      if (!isNaN(mins) && !isNaN(secs)) {
        return mins * 60 + secs;
      }
    } else if (parts.length === 3) {
      const hrs = parseFloat(parts[0]);
      const mins = parseFloat(parts[1]);
      const secs = parseFloat(parts[2]);
      if (!isNaN(hrs) && !isNaN(mins) && !isNaN(secs)) {
        return hrs * 3600 + mins * 60 + secs;
      }
    }
  }
  const directSecs = parseFloat(cleanStr);
  return isNaN(directSecs) ? NaN : directSecs;
}

function showAlert(message) {
  els.alertMessage.textContent = message;
  els.alertBanner.classList.remove('hidden');
  els.alertBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideAlert() {
  els.alertBanner.classList.add('hidden');
}

/** Converts a Blob to a Base64 Data URL */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Converts an Image Element to a standard PNG Blob for maximum clipboard compatibility */
function imageElementToPngBlob(imgEl) {
  return new Promise((resolve) => {
    try {
      const render = (img) => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 360;
        canvas.height = img.naturalHeight || 240;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => resolve(blob), 'image/png');
      };

      if (imgEl && imgEl.complete && imgEl.naturalWidth > 0) {
        render(imgEl);
      } else if (imgEl && imgEl.src) {
        const tempImg = new Image();
        tempImg.crossOrigin = 'anonymous';
        tempImg.onload = () => render(tempImg);
        tempImg.onerror = () => resolve(null);
        tempImg.src = imgEl.src;
      } else {
        resolve(null);
      }
    } catch {
      resolve(null);
    }
  });
}

// ============================================================================
// FILE VALIDATION & INGESTION
// ============================================================================

function validateFile(file) {
  if (!file) return { valid: false, error: 'No file was selected.' };
  if (file.size === 0) return { valid: false, error: 'File is empty (0 bytes).' };
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File is too large (${formatBytes(file.size)}). Max allowed is 250 MB for client-side processing.`
    };
  }

  const nameLower = file.name.toLowerCase();
  const hasValidExt = SUPPORTED_EXTENSIONS.some((ext) => nameLower.endsWith(ext));
  const hasValidMime = SUPPORTED_MIME_TYPES.includes(file.type) || file.type.startsWith('video/');

  if (!hasValidExt && !hasValidMime) {
    return {
      valid: false,
      error: 'Unsupported format. Please select an MP4, WebM, or MOV video file.'
    };
  }

  return { valid: true };
}

function handleFileSelect(file) {
  hideAlert();
  const validation = validateFile(file);
  if (!validation.valid) {
    showAlert(validation.error);
    return;
  }

  // Clean previous object URLs
  if (state.videoObjectUrl) {
    URL.revokeObjectURL(state.videoObjectUrl);
    state.videoObjectUrl = null;
  }
  if (state.gifBlobUrl) {
    URL.revokeObjectURL(state.gifBlobUrl);
    state.gifBlobUrl = null;
  }

  state.currentFile = file;
  state.videoObjectUrl = URL.createObjectURL(file);

  // Set up video element to inspect metadata
  els.videoPlayer.muted = true;
  els.videoPlayer.playsInline = true;
  els.videoPlayer.src = state.videoObjectUrl;
  els.videoPlayer.load();

  let metadataProcessed = false;

  const proceedWithMetadata = () => {
    if (metadataProcessed) return;
    metadataProcessed = true;

    let duration = els.videoPlayer.duration;
    if (isNaN(duration) || duration <= 0 || !isFinite(duration)) {
      duration = 4.0;
    }

    state.videoDuration = duration;
    state.videoWidth = els.videoPlayer.videoWidth || 640;
    state.videoHeight = els.videoPlayer.videoHeight || 360;

    // Display metadata in Queue Card
    if (els.queueFileName) els.queueFileName.textContent = file.name;
    if (els.queueFileSize) els.queueFileSize.textContent = formatBytes(file.size);
    if (els.queueFileDuration) els.queueFileDuration.textContent = formatTime(duration);
    if (els.queueFileDim) els.queueFileDim.textContent = `${state.videoWidth} × ${state.videoHeight} px`;

    // Update Header widget source format badge (e.g. MP4, WEBM)
    const ext = file.name.split('.').pop()?.toUpperCase() || 'VIDEO';
    if (els.widgetSourceLabel) {
      els.widgetSourceLabel.textContent = ext;
    }

    // Default trim timing: CONVERT WHOLE VIDEO BY DEFAULT (start: 0, end: full duration)
    state.startTime = 0;
    state.endTime = duration;

    setupTimeline();
    updateOutputResolutionHint();
    validateTrimTiming();
    state.optionsExpanded = !state.autoConvert;
    els.queueOptionsPanel.classList.toggle('hidden', !state.optionsExpanded);
    els.btnToggleOptions.setAttribute('aria-expanded', state.optionsExpanded.toString());
    const optionsLabel = els.btnToggleOptions.querySelector('span');
    if (optionsLabel) optionsLabel.textContent = state.optionsExpanded ? 'Close options' : 'Options';

    // Update file name & size on the new Process & Preview page
    if (els.procFileName) els.procFileName.textContent = file.name;
    if (els.procFileSize) els.procFileSize.textContent = formatBytes(file.size);
    if (els.procFileFormat) els.procFileFormat.textContent = `${ext} Video`;
    if (els.procInputFormat) els.procInputFormat.textContent = ext;

    // Open dedicated Process & Preview Page (hide upload page completely)
    if (els.viewUpload && els.viewProcessPreview) {
      els.viewUpload.classList.add('hidden');
      els.viewProcessPreview.classList.remove('hidden');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    if (els.queueCard) els.queueCard.classList.remove('hidden');
    if (els.queueResultPreview) els.queueResultPreview.classList.add('hidden');
    if (els.btnQueueDownload) els.btnQueueDownload.classList.add('hidden');
    if (els.btnQueueConvert) els.btnQueueConvert.classList.remove('hidden');

    // AUTO-CONVERT TO GIF:
    // Convert whole video immediately and quickly upon upload
    if (state.autoConvert) {
      convertVideoToGif();
    }
  };

  els.videoPlayer.onloadedmetadata = proceedWithMetadata;
  setTimeout(() => {
    if (!metadataProcessed && state.currentFile === file) {
      proceedWithMetadata();
    }
  }, 750);

  els.videoPlayer.onerror = () => {
    showAlert('This video could not be opened in the browser. Try an MP4 or WebM video.');
    resetToUpload();
  };
}

// ============================================================================
// TIMELINE & TRIM LOGIC
// ============================================================================

function setupTimeline() {
  const max = state.videoDuration;
  els.sliderStart.min = '0';
  els.sliderStart.max = max.toString();
  els.sliderStart.step = '0.05';
  els.sliderStart.value = state.startTime.toString();

  els.sliderEnd.min = '0';
  els.sliderEnd.max = max.toString();
  els.sliderEnd.step = '0.05';
  els.sliderEnd.value = state.endTime.toString();

  updateTimelineVisuals();
}

function updateTimelineVisuals() {
  const duration = state.videoDuration;
  if (duration <= 0) return;

  const startPct = (state.startTime / duration) * 100;
  const endPct = (state.endTime / duration) * 100;
  const widthPct = Math.max(0, endPct - startPct);

  els.timelineRangeHighlight.style.left = `${startPct}%`;
  els.timelineRangeHighlight.style.width = `${widthPct}%`;

  els.timelineStartVal.textContent = `${state.startTime.toFixed(2)}s`;
  els.timelineEndVal.textContent = `${state.endTime.toFixed(2)}s`;

  const clipDuration = Math.max(0, state.endTime - state.startTime);
  els.timelineClipVal.textContent = `Clip: ${clipDuration.toFixed(2)}s`;

  els.inputStartTime.value = formatTime(state.startTime, true);
  els.inputEndTime.value = formatTime(state.endTime, true);
}

function validateTrimTiming() {
  const start = state.startTime;
  const end = state.endTime;
  const max = state.videoDuration;

  if (isNaN(start) || isNaN(end)) {
    showTimeError('Please enter valid start and end times.');
    return false;
  }
  if (start < 0) {
    showTimeError('Start time cannot be negative.');
    return false;
  }
  if (end > max + 0.05) {
    showTimeError(`End time cannot exceed duration (${formatTime(max)}).`);
    return false;
  }
  if (end <= start) {
    showTimeError('End time must be greater than start time.');
    return false;
  }

  clearTimeError();
  return true;
}

function showTimeError(msg) {
  els.timeError.textContent = msg;
  els.timeError.classList.remove('hidden');
  els.btnQueueConvert.disabled = true;
}

function clearTimeError() {
  els.timeError.classList.add('hidden');
  els.timeError.textContent = '';
  if (!state.isConverting) {
    els.btnQueueConvert.disabled = false;
  }
}

function updateOutputResolutionHint() {
  if (state.videoWidth <= 0 || state.videoHeight <= 0) return;

  const origW = state.videoWidth;
  const origH = state.videoHeight;

  if (state.selectedWidth === 'original') {
    els.outputResolutionHint.textContent = `${origW} × ${origH} px`;
    return;
  }

  const targetW = parseInt(state.selectedWidth, 10);
  const targetH = Math.round((origH / origW) * targetW);
  const evenH = targetH % 2 === 0 ? targetH : targetH + 1;
  els.outputResolutionHint.textContent = `${targetW} × ${evenH} px`;
}

// ============================================================================
// SAMPLE VIDEO GENERATOR
// ============================================================================
async function createSampleVideo() {
  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');

  let mimeType = 'video/webm';
  if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
    mimeType = 'video/webm;codecs=vp9';
  } else if (MediaRecorder.isTypeSupported('video/mp4')) {
    mimeType = 'video/mp4';
  }

  const stream = canvas.captureStream(30);
  let mediaRecorder;
  try {
    mediaRecorder = new MediaRecorder(stream, { mimeType });
  } catch {
    showAlert('Sample video generation not supported by this browser. Please upload an MP4 or WebM video.');
    return;
  }

  const chunks = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const samplePromise = new Promise((resolve) => {
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      const sampleFile = new File([blob], 'cloudconvert_demo.webm', { type: mimeType });
      resolve(sampleFile);
    };
  });

  mediaRecorder.start();

  const totalFrames = 30 * 4; // 4 seconds at 30 fps
  let frame = 0;

  function renderFrame() {
    const t = frame / 30;

    // Dark sleek background
    ctx.fillStyle = '#141720';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Glowing rotating orbs
    for (let i = 0; i < 3; i++) {
      const angle = t * 2.2 + (i * Math.PI * 2) / 3;
      const x = canvas.width / 2 + Math.cos(angle) * 85;
      const y = canvas.height / 2 + Math.sin(angle) * 65;
      ctx.beginPath();
      ctx.arc(x, y, 26, 0, Math.PI * 2);
      ctx.fillStyle = i === 0 ? '#d9383a' : i === 1 ? '#10b981' : '#38bdf8';
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 15;
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // CloudConvert Demo Label
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('cloudconvert', canvas.width / 2, canvas.height / 2 - 10);

    ctx.font = '14px monospace';
    ctx.fillStyle = '#9ca3af';
    ctx.fillText(`00:0${Math.floor(t)}.${Math.floor((t % 1) * 100)}`, canvas.width / 2, canvas.height / 2 + 20);

    frame++;
    if (frame < totalFrames) {
      requestAnimationFrame(renderFrame);
    } else {
      mediaRecorder.stop();
    }
  }

  renderFrame();
  const sampleFile = await samplePromise;
  handleFileSelect(sampleFile);
}

// ============================================================================
// CONVERSION ENGINE (Browser-Native GIF Generation via Gifshot & Canvas)
// ============================================================================

function convertWithGifshot({ videoUrl, startTime, duration, fps, width, height }) {
  return new Promise((resolve, reject) => {
    const gs = window.gifshot;
    if (!gs || typeof gs.createGIF !== 'function') {
      reject(new Error('GIF generation library is still loading. Please check your internet connection.'));
      return;
    }

    // Determine optimal number of frames (capped to 120 for fast conversion)
    const calculatedFrames = Math.max(4, Math.min(120, Math.round(duration * fps)));
    const frameInterval = Math.max(0.04, duration / calculatedFrames);

    updateProgressUI('Extracting video frames...', 20);

    gs.createGIF({
      video: [videoUrl],
      gifWidth: width,
      gifHeight: height,
      interval: frameInterval,
      numFrames: calculatedFrames,
      offset: startTime,
      progressCallback: (captureProgress) => {
        if (state.cancelRequested) {
          reject(new Error('CANCELED'));
          return;
        }
        if (captureProgress >= 1) {
          updateProgressUI('Encoding GIF frames...', 92);
          return;
        }

        const pct = Math.min(88, Math.max(15, Math.round(15 + captureProgress * 73)));
        updateProgressUI(`Capturing video frames (${pct}%)...`, pct);
      },
    }, (obj) => {
      if (state.cancelRequested) {
        reject(new Error('CANCELED'));
        return;
      }

      if (obj.error) {
        reject(new Error(obj.errorMsg || 'Failed to render GIF from video'));
        return;
      }

      // Convert base64 data URL to Blob
      updateProgressUI('Preparing GIF preview...', 97);
      fetch(obj.image)
        .then(res => res.blob())
        .then(blob => {
          resolve({
            blob: blob,
            url: obj.image,
          });
        })
        .catch(reject);
    });
  });
}

function updateProgressUI(status, percent) {
  if (els.queueStatusText) els.queueStatusText.textContent = status;
  if (els.queuePercentText) els.queuePercentText.textContent = `${percent}%`;
  if (els.queueProgressFill) {
    els.queueProgressFill.style.width = `${percent}%`;
    els.queueProgressFill.classList.toggle('is-finalizing', percent >= 90 && percent < 100);
  }
}

// ============================================================================
// CONVERSION LOGIC
// ============================================================================

async function convertVideoToGif() {
  if (state.isConverting) return;
  if (!state.currentFile || !state.videoObjectUrl) {
    showAlert('Please choose a video file first.');
    return;
  }
  if (!validateTrimTiming()) return;

  hideAlert();
  state.isConverting = true;
  state.cancelRequested = false;
  state.conversionStartTime = performance.now();

  // Update UI for active conversion
  if (els.btnQueueConvert) {
    els.btnQueueConvert.disabled = true;
    els.btnQueueConvert.textContent = 'Generating GIF Preview...';
  }
  if (els.queueProgressBarWrap) els.queueProgressBarWrap.classList.remove('hidden');
  if (els.queueResultPreview) els.queueResultPreview.classList.add('hidden');
  if (els.btnQueueDownload) els.btnQueueDownload.classList.add('hidden');
  updateProgressUI('Analyzing video frames...', 10);

  const startTime = state.startTime || 0;
  const endTime = state.endTime || state.videoDuration || 5;
  const clipDuration = Math.max(0.2, endTime - startTime);
  const fps = state.selectedFps || 15;
  const widthOption = state.selectedWidth;
  const originalName = state.currentFile.name;

  let targetWidth = 480;
  if (widthOption === 'original') {
    targetWidth = state.videoWidth || 480;
  } else {
    targetWidth = parseInt(widthOption, 10) || 480;
  }
  targetWidth = Math.min(640, Math.max(240, targetWidth));
  const aspect = (state.videoHeight && state.videoWidth)
    ? (state.videoHeight / state.videoWidth)
    : 0.75;
  const targetHeight = Math.round(targetWidth * aspect);

  try {
    const result = await convertWithGifshot({
      videoUrl: state.videoObjectUrl,
      startTime: startTime,
      duration: clipDuration,
      fps: fps,
      width: targetWidth,
      height: targetHeight,
    });

    if (state.cancelRequested) throw new Error('CANCELED');

    updateProgressUI('Finalizing animated GIF...', 98);

    if (state.gifBlobUrl) {
      URL.revokeObjectURL(state.gifBlobUrl);
      state.gifBlobUrl = null;
    }

    state.gifBlob = result.blob;
    state.gifBlobUrl = result.url;

    displayGifResult({
      blob: state.gifBlob,
      url: state.gifBlobUrl,
      duration: clipDuration,
      fps: fps,
      originalBaseName: originalName.substring(0, originalName.lastIndexOf('.')) || 'animation',
    });
    if (els.btnQueueConvert) els.btnQueueConvert.textContent = 'Update GIF Preview';
  } catch (err) {
    console.error('Conversion error:', err);
    if (err.message === 'CANCELED') {
      showAlert('Conversion canceled by user.');
    } else {
      showAlert('Conversion issue: ' + (err.message || 'Please try another video.'));
    }
  } finally {
    state.isConverting = false;
    if (els.btnQueueConvert) {
      els.btnQueueConvert.disabled = false;
      if (state.gifBlob) els.btnQueueConvert.textContent = 'Update GIF Preview';
      else els.btnQueueConvert.textContent = 'Generate GIF Preview';
    }
    if (els.queueProgressBarWrap) els.queueProgressBarWrap.classList.add('hidden');
  }
}

function displayGifResult({ blob, url, duration, fps, originalBaseName }) {
  if (els.copyNotificationBanner) {
    els.copyNotificationBanner.classList.add('hidden');
  }

  els.gifResultImg.src = url;

  const safeBaseName = originalBaseName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const downloadFileName = `${safeBaseName}.gif`;

  // Set download links on both header button & embedded result bar
  els.btnQueueDownload.href = url;
  els.btnQueueDownload.download = downloadFileName;
  els.btnQueueDownload.classList.remove('hidden');

  els.btnResultDownload.href = url;
  els.btnResultDownload.download = downloadFileName;

  const elapsedSec = state.conversionStartTime
    ? ((performance.now() - state.conversionStartTime) / 1000).toFixed(1)
    : '';

  // Once loaded, read dimensions
  els.gifResultImg.onload = () => {
    const w = els.gifResultImg.naturalWidth;
    const h = els.gifResultImg.naturalHeight;
    const timeBadge = elapsedSec ? `⚡ ${elapsedSec}s • ` : '';
    els.resultSpecsBadge.textContent = `${timeBadge}${formatBytes(blob.size)} • ${w} × ${h} px • ${duration.toFixed(1)}s • ${fps} FPS`;
  };

  els.queueResultPreview.classList.remove('hidden');
}

// ============================================================================
// RESET
// ============================================================================

function resetToUpload() {
  if (els.copyNotificationBanner) {
    els.copyNotificationBanner.classList.add('hidden');
  }

  if (state.videoObjectUrl) {
    URL.revokeObjectURL(state.videoObjectUrl);
    state.videoObjectUrl = null;
  }
  if (state.gifBlobUrl) {
    URL.revokeObjectURL(state.gifBlobUrl);
    state.gifBlobUrl = null;
  }

  state.currentFile = null;
  state.videoDuration = 0;
  state.videoWidth = 0;
  state.videoHeight = 0;
  state.startTime = 0;
  state.endTime = 0;
  state.isConverting = false;

  els.fileInput.value = '';
  els.videoPlayer.pause();
  els.videoPlayer.removeAttribute('src');
  els.videoPlayer.load();

  // Switch back to upload homepage view
  if (els.viewUpload && els.viewProcessPreview) {
    els.viewProcessPreview.classList.add('hidden');
    els.viewUpload.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  els.queueCard.classList.add('hidden');
  els.queueProgressBarWrap.classList.add('hidden');
  els.queueResultPreview.classList.add('hidden');
  els.queueOptionsPanel.classList.add('hidden');
  state.optionsExpanded = false;
  els.btnToggleOptions.setAttribute('aria-expanded', 'false');

  if (els.widgetSourceLabel) {
    els.widgetSourceLabel.textContent = 'VIDEO';
  }

  els.dropZoneCard.classList.remove('hidden');
  hideAlert();
}

// ============================================================================
// EVENT LISTENERS & SETUP
// ============================================================================

function initEventListeners() {
  // Back to upload view button
  if (els.btnBackUpload) {
    els.btnBackUpload.addEventListener('click', resetToUpload);
  }
  // Theme toggle
  els.btnThemeToggle.addEventListener('click', () => {
    document.body.classList.toggle('light-theme');
  });

  // Alert dismiss
  els.alertCloseBtn.addEventListener('click', hideAlert);

  // Auto-convert toggle checkbox
  els.chkAutoConvert.addEventListener('change', (e) => {
    state.autoConvert = e.target.checked;
  });

  // Split Button Main Click -> triggers file input
  els.btnSelectFileMain.addEventListener('click', (e) => {
    e.stopPropagation();
    els.fileInput.click();
  });

  // Drop zone click (if clicked outside buttons)
  els.dropZoneCard.addEventListener('click', (e) => {
    if (!e.target.closest('.split-button') && !e.target.closest('.split-menu') && !e.target.closest('.auto-convert-toggle-label')) {
      els.fileInput.click();
    }
  });

  // Split Arrow -> toggle menu
  els.btnSelectFileArrow.addEventListener('click', (e) => {
    e.stopPropagation();
    els.splitMenu.classList.toggle('hidden');
  });

  // Close split menu if clicked outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.split-btn-wrap, .split-btn-group')) {
      els.splitMenu.classList.add('hidden');
    }
  });

  // Split Menu Items
  els.menuOptComputer.addEventListener('click', () => {
    els.splitMenu.classList.add('hidden');
    els.fileInput.click();
  });

  els.menuOptSample.addEventListener('click', () => {
    els.splitMenu.classList.add('hidden');
    createSampleVideo();
  });

  // Nav Demo Video button
  els.btnSampleNav.addEventListener('click', () => {
    createSampleVideo();
  });

  // File Input Change
  els.fileInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  });

  // Drag and Drop
  els.dropZoneCard.addEventListener('dragover', (e) => {
    e.preventDefault();
    els.dropZoneCard.classList.add('drag-active');
  });

  els.dropZoneCard.addEventListener('dragleave', (e) => {
    e.preventDefault();
    els.dropZoneCard.classList.remove('drag-active');
  });

  els.dropZoneCard.addEventListener('drop', (e) => {
    e.preventDefault();
    els.dropZoneCard.classList.remove('drag-active');
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFileSelect(file);
  });

  // Options Accordion Toggle
  els.btnToggleOptions.addEventListener('click', () => {
    state.optionsExpanded = !state.optionsExpanded;
    els.queueOptionsPanel.classList.toggle('hidden', !state.optionsExpanded);
    els.btnToggleOptions.setAttribute('aria-expanded', state.optionsExpanded.toString());
    const label = els.btnToggleOptions.querySelector('span');
    if (label) label.textContent = state.optionsExpanded ? 'Close options' : 'Options';
  });

  // Queue Action Buttons
  els.btnQueueConvert.addEventListener('click', convertVideoToGif);

  els.btnQueueCancel.addEventListener('click', () => {
    state.cancelRequested = true;
    updateProgressUI('Canceling...', 0);
  });

  els.btnQueueRemove.addEventListener('click', resetToUpload);

  // Result Buttons
  els.btnResultNew.addEventListener('click', resetToUpload);

  els.btnResultCopy.addEventListener('click', async () => {
    if (!state.gifBlob) {
      showAlert('No GIF available to copy. Please convert a video first.');
      return;
    }

    // Ensure focus so browser doesn't reject clipboard write due to lack of focus
    try {
      window.focus();
    } catch {
      // ignore
    }

    // Reveal the notification banner with pasting guidance
    if (els.copyNotificationBanner) {
      els.copyNotificationBanner.classList.remove('hidden');
    }

    const btn = els.btnResultCopy;
    const originalHtml = btn.innerHTML;
    btn.disabled = true;

    try {
      let copied = false;

      // Method 1: Try native image/gif in ClipboardItem (Supported in modern Chrome & Safari)
      if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({
              'image/gif': state.gifBlob,
            }),
          ]);
          copied = true;
        } catch (gifErr) {
          console.warn('Direct image/gif write not supported, trying rich HTML GIF...', gifErr);
        }
      }

      // Method 2: Async Clipboard API with rich text/html containing the animated GIF data URL
      // This preserves 100% of frames & animation for Slack, Discord, Google Docs, Gmail, WhatsApp, Teams, etc.
      // Notice: NO text/plain is added, so it NEVER pastes as a raw text URL!
      if (!copied && navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        try {
          const base64Gif = await blobToBase64(state.gifBlob);
          const htmlPayload = `<img src="${base64Gif}" alt="Animated GIF">`;
          await navigator.clipboard.write([
            new ClipboardItem({
              'text/html': new Blob([htmlPayload], { type: 'text/html' }),
            }),
          ]);
          copied = true;
        } catch (htmlErr) {
          console.warn('Clipboard text/html write failed, trying DOM image copy...', htmlErr);
        }
      }

      // Method 3: Native DOM Selection & execCommand('copy') on HTMLImageElement
      // Triggers browser's native Copy Image routine on the full animated GIF element
      if (!copied) {
        try {
          const base64Gif = await blobToBase64(state.gifBlob);
          const tempDiv = document.createElement('div');
          tempDiv.contentEditable = 'true';
          tempDiv.style.position = 'fixed';
          tempDiv.style.left = '-9999px';
          tempDiv.style.top = '0';
          tempDiv.style.opacity = '0';
          tempDiv.style.pointerEvents = 'none';

          const img = document.createElement('img');
          img.src = base64Gif;
          tempDiv.appendChild(img);
          document.body.appendChild(tempDiv);

          const range = document.createRange();
          range.selectNode(img);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);

          copied = document.execCommand('copy');
          selection.removeAllRanges();
          document.body.removeChild(tempDiv);
        } catch (domErr) {
          console.warn('DOM execCommand image copy failed:', domErr);
        }
      }

      if (copied) {
        btn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:14px;height:14px;color:#10b981;">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span style="color:#10b981;font-weight:600;">Animated GIF Copied!</span>
        `;
        setTimeout(() => {
          btn.innerHTML = originalHtml;
          btn.disabled = false;
        }, 2500);
      } else {
        // If the browser iframe sandbox strictly blocks programmatic clipboard write:
        // Automatically download the GIF file for instant access and explain the right-click option
        btn.disabled = false;
        els.btnResultDownload.click();
        showAlert('Browser blocked direct clipboard access in this sandbox window. The GIF has been downloaded, or you can right-click the GIF and choose "Copy Image".');
      }
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      btn.disabled = false;
      els.btnResultDownload.click();
      showAlert('Clipboard writing restricted by browser sandbox. Your GIF was downloaded, or right-click the image and choose "Copy Image".');
    }
  });

  // Also trigger copy when clicking the GIF preview image
  els.gifResultImg.addEventListener('click', () => {
    els.btnResultCopy.click();
  });

  // Native Drag and Drop: dragging the preview image drops the actual animated GIF file
  // This works 100% reliably in Discord, Slack, WhatsApp, Telegram, or desktop folders
  els.gifResultImg.addEventListener('dragstart', (e) => {
    if (state.gifBlob && state.gifBlobUrl) {
      const originalName = state.currentFile?.name || 'animation.mp4';
      const safeBaseName = originalName.substring(0, originalName.lastIndexOf('.')) || 'animation';
      const fileName = `${safeBaseName.replace(/[^a-zA-Z0-9_-]/g, '_')}.gif`;
      const absoluteUrl = new URL(state.gifBlobUrl, window.location.href).href;
      e.dataTransfer.setData('DownloadURL', `image/gif:${fileName}:${absoluteUrl}`);
      e.dataTransfer.setData('text/uri-list', absoluteUrl);
      e.dataTransfer.setData('text/html', `<img src="${state.gifBlobUrl}" alt="${fileName}">`);
      e.dataTransfer.effectAllowed = 'copy';
    }
  });

  // Timeline Sliders
  els.sliderStart.addEventListener('input', () => {
    let val = parseFloat(els.sliderStart.value);
    if (val >= state.endTime) {
      val = Math.max(0, state.endTime - 0.1);
      els.sliderStart.value = val.toString();
    }
    state.startTime = val;
    els.videoPlayer.currentTime = val;
    updateTimelineVisuals();
    validateTrimTiming();
  });

  els.sliderEnd.addEventListener('input', () => {
    let val = parseFloat(els.sliderEnd.value);
    if (val <= state.startTime) {
      val = Math.min(state.videoDuration, state.startTime + 0.1);
      els.sliderEnd.value = val.toString();
    }
    state.endTime = val;
    els.videoPlayer.currentTime = val;
    updateTimelineVisuals();
    validateTrimTiming();
  });

  els.videoPlayer.addEventListener('timeupdate', () => {
    const duration = state.videoDuration;
    if (duration > 0) {
      const curPct = (els.videoPlayer.currentTime / duration) * 100;
      els.timelinePlayhead.style.left = `${Math.min(100, Math.max(0, curPct))}%`;
    }
  });

  els.btnPreviewClip.addEventListener('click', () => {
    els.videoPlayer.currentTime = state.startTime;
    els.videoPlayer.play();

    const checkClipEnd = () => {
      if (els.videoPlayer.currentTime >= state.endTime) {
        els.videoPlayer.pause();
        els.videoPlayer.removeEventListener('timeupdate', checkClipEnd);
      }
    };
    els.videoPlayer.addEventListener('timeupdate', checkClipEnd);
  });

  els.btnResetTrim.addEventListener('click', () => {
    state.startTime = 0;
    state.endTime = state.videoDuration;
    setupTimeline();
    validateTrimTiming();
  });

  // Current timestamp capture buttons
  els.btnSetStartCur.addEventListener('click', () => {
    const cur = els.videoPlayer.currentTime;
    if (cur < state.endTime) {
      state.startTime = cur;
      els.sliderStart.value = cur.toString();
      updateTimelineVisuals();
      validateTrimTiming();
    }
  });

  els.btnSetEndCur.addEventListener('click', () => {
    const cur = els.videoPlayer.currentTime;
    if (cur > state.startTime) {
      state.endTime = Math.min(state.videoDuration, cur);
      els.sliderEnd.value = state.endTime.toString();
      updateTimelineVisuals();
      validateTrimTiming();
    }
  });

  // Text inputs manual change
  els.inputStartTime.addEventListener('change', () => {
    const parsed = parseTimeString(els.inputStartTime.value);
    if (!isNaN(parsed) && parsed >= 0 && parsed < state.endTime) {
      state.startTime = parsed;
      els.sliderStart.value = parsed.toString();
      updateTimelineVisuals();
      validateTrimTiming();
    } else {
      validateTrimTiming();
    }
  });

  els.inputEndTime.addEventListener('change', () => {
    const parsed = parseTimeString(els.inputEndTime.value);
    if (!isNaN(parsed) && parsed > state.startTime && parsed <= state.videoDuration) {
      state.endTime = parsed;
      els.sliderEnd.value = parsed.toString();
      updateTimelineVisuals();
      validateTrimTiming();
    } else {
      validateTrimTiming();
    }
  });

  // FPS Presets
  els.fpsButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      els.fpsButtons.forEach((b) => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      state.selectedFps = parseInt(btn.dataset.fps, 10);
    });
  });

  // Width Presets
  els.widthButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      els.widthButtons.forEach((b) => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      state.selectedWidth = btn.dataset.width === 'original' ? 'original' : parseInt(btn.dataset.width, 10);
      updateOutputResolutionHint();
    });
  });

  // Quality Preset
  els.selectQuality.addEventListener('change', (e) => {
    state.selectedQuality = e.target.value;
  });

  // FAQ Accordion
  if (els.faqAccordion) {
    const faqItems = els.faqAccordion.querySelectorAll('.faq-item');
    faqItems.forEach((item) => {
      const qBtn = item.querySelector('.faq-q-btn');
      const aDiv = item.querySelector('.faq-a-content');
      if (qBtn && aDiv) {
        qBtn.addEventListener('click', () => {
          const isExpanded = qBtn.getAttribute('aria-expanded') === 'true';
          qBtn.setAttribute('aria-expanded', (!isExpanded).toString());
          aDiv.classList.toggle('hidden', isExpanded);
        });
      }
    });
  }
}

// Initialize on DOM load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
  });
} else {
  initEventListeners();
}

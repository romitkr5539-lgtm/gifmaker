const MAX_IMAGE_COUNT = 30;
const MAX_IMAGE_BYTES = 100 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const state = {
  frames: [],
  gifUrl: null,
  isRendering: false,
};

const elements = {
  alert: document.getElementById('image-alert'),
  processAlert: document.getElementById('image-process-alert'),
  uploadView: document.getElementById('image-upload-view'),
  processView: document.getElementById('image-process-view'),
  processName: document.getElementById('image-process-name'),
  processMeta: document.getElementById('image-process-meta'),
  backButton: document.getElementById('back-to-images-button'),
  dropZone: document.getElementById('image-drop-zone'),
  fileInput: document.getElementById('image-file-input'),
  editor: document.getElementById('image-editor'),
  frameList: document.getElementById('image-frame-list'),
  exportMeta: document.getElementById('image-export-meta'),
  addImagesButton: document.getElementById('add-images-button'),
  clearImagesButton: document.getElementById('clear-images-button'),
  fps: document.getElementById('frame-rate-select'),
  outputSize: document.getElementById('output-size-select'),
  progress: document.getElementById('image-progress'),
  progressLabel: document.getElementById('image-progress-label'),
  progressValue: document.getElementById('image-progress-value'),
  progressFill: document.getElementById('image-progress-fill'),
  createButton: document.getElementById('create-gif-button'),
  result: document.getElementById('image-result'),
  resultMeta: document.getElementById('image-result-meta'),
  preview: document.getElementById('gif-preview'),
  download: document.getElementById('download-gif-button'),
};

function showAlert(message) {
  const alert = elements.processView.classList.contains('hidden') ? elements.alert : elements.processAlert;
  alert.textContent = message;
  alert.classList.remove('hidden');
}

function clearAlert() {
  elements.alert.textContent = '';
  elements.alert.classList.add('hidden');
  elements.processAlert.textContent = '';
  elements.processAlert.classList.add('hidden');
}

function showProcessView(scrollToTop = false) {
  elements.uploadView.classList.add('hidden');
  elements.processView.classList.remove('hidden');
  if (scrollToTop) window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showUploadView() {
  elements.processView.classList.add('hidden');
  elements.uploadView.classList.remove('hidden');
  elements.dropZone.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateProcessSummary() {
  const count = state.frames.length;
  const totalBytes = state.frames.reduce((sum, frame) => sum + frame.file.size, 0);
  elements.processName.textContent = count === 1 ? state.frames[0].file.name : `${count} images`;
  elements.processMeta.textContent = `${count} frames · ${(totalBytes / (1024 * 1024)).toFixed(2)} MB`;
}

function loadFrame(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ file, url, image, width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read ${file.name}.`));
    };
    image.src = url;
  });
}

async function addFiles(fileList) {
  clearAlert();
  const files = Array.from(fileList || []);
  if (!files.length) return;

  const invalidFile = files.find((file) => {
    const extension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
    return !ACCEPTED_IMAGE_TYPES.has(file.type) && !['.jpg', '.jpeg', '.png', '.webp'].includes(extension);
  });
  if (invalidFile) {
    showAlert(`${invalidFile.name} is not a supported image. Choose PNG, JPG, or WebP files.`);
    return;
  }

  const totalBytes = [...state.frames.map((frame) => frame.file), ...files].reduce((sum, file) => sum + file.size, 0);
  if (state.frames.length + files.length > MAX_IMAGE_COUNT) {
    showAlert(`Choose up to ${MAX_IMAGE_COUNT} images per GIF.`);
    return;
  }
  if (totalBytes > MAX_IMAGE_BYTES) {
    showAlert('The selected images are larger than the 100 MB total limit.');
    return;
  }

  try {
    const frames = await Promise.all(files.map(loadFrame));
    const shouldScroll = elements.processView.classList.contains('hidden');
    state.frames.push(...frames);
    elements.dropZone.classList.add('hidden');
    elements.editor.classList.remove('hidden');
    elements.result.classList.add('hidden');
    renderFrames();
    updateProcessSummary();
    showProcessView(shouldScroll);
  } catch (error) {
    showAlert(error.message || 'One or more images could not be opened.');
  }
}

function renderFrames() {
  elements.frameList.replaceChildren();
  state.frames.forEach((frame, index) => {
    const item = document.createElement('li');
    item.className = 'image-frame-item';

    const number = document.createElement('span');
    number.className = 'image-frame-number';
    number.textContent = String(index + 1).padStart(2, '0');

    const thumb = document.createElement('div');
    thumb.className = 'image-frame-thumb';
    const image = document.createElement('img');
    image.src = frame.url;
    image.alt = '';
    thumb.append(image);

    const footer = document.createElement('div');
    footer.className = 'image-frame-footer';
    const name = document.createElement('span');
    name.className = 'image-frame-name';
    name.title = frame.file.name;
    name.textContent = frame.file.name;

    const moveUp = createFrameButton('Move frame up', '↑', () => moveFrame(index, -1), state.isRendering || index === 0);
    const moveDown = createFrameButton('Move frame down', '↓', () => moveFrame(index, 1), state.isRendering || index === state.frames.length - 1);
    const remove = createFrameButton(`Remove ${frame.file.name}`, '×', () => removeFrame(index), state.isRendering);
    footer.append(name, moveUp, moveDown, remove);
    item.append(number, thumb, footer);
    elements.frameList.append(item);
  });

  const fps = Number(elements.fps.value);
  const duration = state.frames.length / fps;
  updateProcessSummary();
  elements.exportMeta.textContent = `${state.frames.length} frames · ${duration.toFixed(1)} seconds · ${fps} FPS`;
  elements.createButton.disabled = state.frames.length < 2 || state.isRendering;
}

function createFrameButton(label, text, onClick, disabled = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'image-frame-action';
  button.setAttribute('aria-label', label);
  button.title = label;
  button.textContent = text;
  button.disabled = disabled;
  button.addEventListener('click', onClick);
  return button;
}

function moveFrame(index, direction) {
  if (state.isRendering) return;
  const target = index + direction;
  if (target < 0 || target >= state.frames.length) return;
  [state.frames[index], state.frames[target]] = [state.frames[target], state.frames[index]];
  elements.result.classList.add('hidden');
  renderFrames();
}

function removeFrame(index) {
  if (state.isRendering) return;
  const [frame] = state.frames.splice(index, 1);
  URL.revokeObjectURL(frame.url);
  elements.result.classList.add('hidden');
  if (!state.frames.length) {
    elements.editor.classList.add('hidden');
    showUploadView();
  } else {
    renderFrames();
  }
}

function prepareFrames() {
  const base = state.frames[0];
  const longestEdge = Number(elements.outputSize.value);
  const scale = longestEdge / Math.max(base.width, base.height);
  const width = Math.max(1, Math.round(base.width * scale));
  const height = Math.max(1, Math.round(base.height * scale));

  const images = state.frames.map((frame) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    const fit = Math.min(width / frame.width, height / frame.height);
    const drawWidth = frame.width * fit;
    const drawHeight = frame.height * fit;
    context.drawImage(frame.image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
    return canvas.toDataURL('image/png');
  });

  return { images, width, height };
}

function setProgress(label, value) {
  const percent = Math.max(0, Math.min(100, Math.round(value)));
  elements.progressLabel.textContent = label;
  elements.progressValue.textContent = `${percent}%`;
  elements.progressFill.style.width = `${percent}%`;
}

function createGif() {
  if (state.isRendering) return;
  if (state.frames.length < 2) {
    showAlert('Add at least two images to create an animated GIF.');
    return;
  }
  if (!window.gifshot || typeof window.gifshot.createGIF !== 'function') {
    showAlert('The GIF encoder could not load. Check your internet connection and try again.');
    return;
  }

  clearAlert();
  state.isRendering = true;
  elements.result.classList.add('hidden');
  elements.progress.classList.remove('hidden');
  elements.createButton.disabled = true;
  elements.addImagesButton.disabled = true;
  elements.clearImagesButton.disabled = true;
  elements.createButton.textContent = 'Creating GIF...';
  renderFrames();
  setProgress('Preparing image frames', 8);

  let prepared;
  try {
    prepared = prepareFrames();
  } catch (error) {
    finishRender(error);
    return;
  }

  setProgress('Encoding animation', 18);
  window.gifshot.createGIF({
    images: prepared.images,
    gifWidth: prepared.width,
    gifHeight: prepared.height,
    interval: 1 / Number(elements.fps.value),
    numFrames: prepared.images.length,
    progressCallback: (progress) => setProgress('Encoding animation', 18 + progress * 78),
  }, async (result) => {
    if (result.error) {
      finishRender(new Error(result.errorMsg || 'GIF encoding failed.'));
      return;
    }

    try {
      setProgress('Finishing GIF', 98);
      const blob = await fetch(result.image).then((response) => response.blob());
      if (state.gifUrl) URL.revokeObjectURL(state.gifUrl);
      state.gifUrl = URL.createObjectURL(blob);
      elements.preview.src = state.gifUrl;
      elements.download.href = state.gifUrl;
      elements.resultMeta.textContent = `${state.frames.length} frames · ${elements.fps.value} FPS · ${prepared.width} × ${prepared.height} px · ${(blob.size / (1024 * 1024)).toFixed(2)} MB`;
      elements.result.classList.remove('hidden');
      setProgress('GIF ready', 100);
      elements.result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      finishRender();
    } catch (error) {
      finishRender(error);
    }
  });
}

function finishRender(error) {
  state.isRendering = false;
  elements.progress.classList.add('hidden');
  elements.addImagesButton.disabled = false;
  elements.clearImagesButton.disabled = false;
  elements.createButton.textContent = 'Create GIF';
  renderFrames();
  if (error) showAlert(error.message || 'Could not create the GIF.');
}

function clearImages() {
  if (state.isRendering) return;
  state.frames.forEach((frame) => URL.revokeObjectURL(frame.url));
  state.frames = [];
  elements.fileInput.value = '';
  elements.frameList.replaceChildren();
  elements.editor.classList.add('hidden');
  elements.result.classList.add('hidden');
  showUploadView();
  clearAlert();
}

function init() {
  document.getElementById('choose-images-button').addEventListener('click', (event) => {
    event.stopPropagation();
    elements.fileInput.click();
  });
  document.getElementById('add-images-button').addEventListener('click', () => elements.fileInput.click());
  document.getElementById('clear-images-button').addEventListener('click', clearImages);
  document.getElementById('make-another-button').addEventListener('click', clearImages);
  elements.backButton.addEventListener('click', clearImages);
  elements.createButton.addEventListener('click', createGif);
  elements.fileInput.addEventListener('change', (event) => {
    addFiles(event.target.files);
    event.target.value = '';
  });
  elements.fps.addEventListener('change', () => {
    elements.result.classList.add('hidden');
    renderFrames();
  });
  elements.outputSize.addEventListener('change', () => elements.result.classList.add('hidden'));

  elements.dropZone.addEventListener('click', (event) => {
    if (!event.target.closest('button')) elements.fileInput.click();
  });
  elements.dropZone.addEventListener('dragover', (event) => {
    event.preventDefault();
    elements.dropZone.classList.add('drag-active');
  });
  elements.dropZone.addEventListener('dragleave', (event) => {
    if (!elements.dropZone.contains(event.relatedTarget)) elements.dropZone.classList.remove('drag-active');
  });
  elements.dropZone.addEventListener('drop', (event) => {
    event.preventDefault();
    elements.dropZone.classList.remove('drag-active');
    addFiles(event.dataTransfer.files);
  });

  document.getElementById('theme-toggle').addEventListener('click', () => {
    document.body.classList.toggle('light-theme');
  });

  window.addEventListener('beforeunload', () => {
    state.frames.forEach((frame) => URL.revokeObjectURL(frame.url));
    if (state.gifUrl) URL.revokeObjectURL(state.gifUrl);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

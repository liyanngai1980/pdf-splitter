/**
 * PDF Page Splitter — Application Logic
 * Pure client-side PDF inspection, page count reading, splitting, and ZIP packaging.
 */

// Configure PDF.js worker
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
}

// State
let currentFile = null;
let currentArrayBuffer = null;
let currentPdfDoc = null; // pdf-lib document
let currentPdfJsDoc = null; // pdf.js document
let totalPages = 0;
let selectedPages = new Set(); // 0-based page indices
let activeMode = 'all'; // 'all' | 'ranges' | 'chunks' | 'extract' | 'delete'
let generatedFiles = []; // { filename, bytes, pageIndices, pageLabel }

// DOM Elements
const dropZone = document.getElementById('dropZone');
const pdfFileInput = document.getElementById('pdfFileInput');
const uploadSection = document.getElementById('uploadSection');
const docInfoSection = document.getElementById('docInfoSection');
const splitConfigSection = document.getElementById('splitConfigSection');
const resultsSection = document.getElementById('resultsSection');

const docFileName = document.getElementById('docFileName');
const docFileSize = document.getElementById('docFileSize');
const docPageCountBadge = document.getElementById('docPageCountBadge');
const docPageDimensions = document.getElementById('docPageDimensions');
const btnChangePdf = document.getElementById('btnChangePdf');

const allPagesCountText = document.getElementById('allPagesCountText');
const rangeInput = document.getElementById('rangeInput');
const btnAutoRanges = document.getElementById('btnAutoRanges');
const rangeValidationFeedback = document.getElementById('rangeValidationFeedback');

const chunkSizeInput = document.getElementById('chunkSizeInput');
const btnChunkDec = document.getElementById('btnChunkDec');
const btnChunkInc = document.getElementById('btnChunkInc');
const chunkEstimateText = document.getElementById('chunkEstimateText');

const namingPatternInput = document.getElementById('namingPatternInput');
const namingPreviewExample = document.getElementById('namingPreviewExample');

const selectedCountBadge = document.getElementById('selectedCountBadge');
const pagesGridContainer = document.getElementById('pagesGridContainer');
const actionSummaryText = document.getElementById('actionSummaryText');
const btnExecuteSplit = document.getElementById('btnExecuteSplit');

const progressModal = document.getElementById('progressModal');
const progressModalTitle = document.getElementById('progressModalTitle');
const progressBarFill = document.getElementById('progressBarFill');
const progressStepText = document.getElementById('progressStepText');
const progressPercentText = document.getElementById('progressPercentText');

const previewModal = document.getElementById('previewModal');
const previewModalTitle = document.getElementById('previewModalTitle');
const largePreviewCanvas = document.getElementById('largePreviewCanvas');

const generatedFilesList = document.getElementById('generatedFilesList');
const resultsSubtitle = document.getElementById('resultsSubtitle');
const btnDownloadZip = document.getElementById('btnDownloadZip');
const btnSplitAnother = document.getElementById('btnSplitAnother');
const themeToggleBtn = document.getElementById('themeToggleBtn');

// OCR DOM Elements
const ocrSection = document.getElementById('ocrSection');
const btnOcrToTxt = document.getElementById('btnOcrToTxt');
const btnOcrToHtml = document.getElementById('btnOcrToHtml');
const ocrLangSelect = document.getElementById('ocrLangSelect');
const ocrScopeSelect = document.getElementById('ocrScopeSelect');
const ocrStatusMsg = document.getElementById('ocrStatusMsg');

const ocrResultModal = document.getElementById('ocrResultModal');
const ocrModalFormatBadge = document.getElementById('ocrModalFormatBadge');
const ocrResultTitle = document.getElementById('ocrResultTitle');
const ocrResultPre = document.getElementById('ocrResultPre');
const ocrStatsSummary = document.getElementById('ocrStatsSummary');
const btnCopyOcrText = document.getElementById('btnCopyOcrText');
const btnSaveOcrTxtModal = document.getElementById('btnSaveOcrTxtModal');
const btnSaveOcrHtmlModal = document.getElementById('btnSaveOcrHtmlModal');

let lastExtractedPages = []; // [{ pageNum, text, method }]
let lastFullTxtString = '';
let lastFullHtmlString = '';

/* =========================================================
   Initialization & Event Listeners
   ========================================================= */
function init() {
  setupTheme();
  setupDragAndDrop();
  setupModeTabs();
  setupSelectionControls();
  setupInputs();
  setupOcrListeners();
}

function setupTheme() {
  const saved = localStorage.getItem('pdf_splitter_theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);

  themeToggleBtn.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') || 'light';
    const next = cur === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('pdf_splitter_theme', next);
    updateThemeIcon(next);
  });
}

function updateThemeIcon(theme) {
  themeToggleBtn.querySelector('.theme-icon').textContent = theme === 'light' ? '🌙' : '☀️';
}

function setupDragAndDrop() {
  // Click drop zone
  dropZone.addEventListener('click', () => pdfFileInput.click());
  dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pdfFileInput.click();
    }
  });

  // File picker change
  pdfFileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleIncomingFile(e.target.files[0]);
    }
  });

  // Drag over
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('dragover');
    });
  });

  // Drag leave / drop
  ['dragleave', 'dragend'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('dragover');
    });
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        handleIncomingFile(file);
      } else {
        alert('Please drop a valid PDF file.');
      }
    }
  });

  btnChangePdf.addEventListener('click', () => {
    pdfFileInput.value = '';
    pdfFileInput.click();
  });

  btnSplitAnother.addEventListener('click', () => {
    resultsSection.style.display = 'none';
    splitConfigSection.style.display = 'flex';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

function setupModeTabs() {
  const tabs = document.querySelectorAll('.mode-tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      activeMode = tab.getAttribute('data-mode');

      document.querySelectorAll('.mode-panel').forEach(panel => {
        panel.classList.remove('active');
      });
      const activePanel = document.getElementById(`panel-mode-all`) || null;
      const targetPanel = document.getElementById(`panel-mode-${activeMode}`);
      if (targetPanel) targetPanel.classList.add('active');

      // Update grid visual cards if in delete mode
      updateGridDeleteStyles();
      updateActionSummary();
      updateNamingPreview();
    });
  });
}

function setupSelectionControls() {
  document.getElementById('btnSelectAll').addEventListener('click', () => {
    for (let i = 0; i < totalPages; i++) selectedPages.add(i);
    renderGridSelectionState();
  });

  document.getElementById('btnDeselectAll').addEventListener('click', () => {
    selectedPages.clear();
    renderGridSelectionState();
  });

  document.getElementById('btnSelectOdd').addEventListener('click', () => {
    selectedPages.clear();
    for (let i = 0; i < totalPages; i++) {
      if ((i + 1) % 2 !== 0) selectedPages.add(i);
    }
    renderGridSelectionState();
  });

  document.getElementById('btnSelectEven').addEventListener('click', () => {
    selectedPages.clear();
    for (let i = 0; i < totalPages; i++) {
      if ((i + 1) % 2 === 0) selectedPages.add(i);
    }
    renderGridSelectionState();
  });

  document.getElementById('btnInvertSelection').addEventListener('click', () => {
    const newSet = new Set();
    for (let i = 0; i < totalPages; i++) {
      if (!selectedPages.has(i)) newSet.add(i);
    }
    selectedPages = newSet;
    renderGridSelectionState();
  });
}

function setupInputs() {
  // Range input live feedback
  rangeInput.addEventListener('input', () => {
    validateRangeInput();
    updateActionSummary();
    updateNamingPreview();
  });

  btnAutoRanges.addEventListener('click', () => {
    if (totalPages <= 0) return;
    if (totalPages === 1) {
      rangeInput.value = '1';
    } else if (totalPages <= 4) {
      const parts = [];
      for (let i = 1; i <= totalPages; i++) parts.push(`${i}`);
      rangeInput.value = parts.join(', ');
    } else {
      const half = Math.ceil(totalPages / 2);
      rangeInput.value = `1-${half}, ${half + 1}-${totalPages}`;
    }
    validateRangeInput();
    updateActionSummary();
  });

  // Chunk stepper
  btnChunkDec.addEventListener('click', () => {
    let val = parseInt(chunkSizeInput.value) || 2;
    if (val > 1) {
      chunkSizeInput.value = val - 1;
      updateChunkEstimate();
    }
  });

  btnChunkInc.addEventListener('click', () => {
    let val = parseInt(chunkSizeInput.value) || 2;
    if (val < totalPages) {
      chunkSizeInput.value = val + 1;
      updateChunkEstimate();
    }
  });

  chunkSizeInput.addEventListener('input', updateChunkEstimate);

  // Extract radio buttons
  document.querySelectorAll('input[name="extractFormat"]').forEach(radio => {
    radio.addEventListener('change', () => {
      updateActionSummary();
      updateNamingPreview();
    });
  });

  // Naming pattern
  namingPatternInput.addEventListener('input', updateNamingPreview);

  // Execute button
  btnExecuteSplit.addEventListener('click', executeSplitOperation);

  // ZIP download button
  btnDownloadZip.addEventListener('click', downloadAllAsZip);
}

/* =========================================================
   Step 2: PDF File Ingestion & Page Count Reading
   ========================================================= */
async function handleIncomingFile(file) {
  if (!file) return;
  currentFile = file;

  // Show reading progress
  docInfoSection.style.display = 'block';
  docFileName.textContent = file.name;
  docFileSize.textContent = formatBytes(file.size);
  docPageCountBadge.textContent = 'Analyzing pages...';
  docPageDimensions.textContent = 'Reading...';

  // Base naming prefix from file name
  const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
  namingPatternInput.value = baseName;

  showProgress('Reading PDF Document', 15, 'Loading file bytes into memory...');

  try {
    currentArrayBuffer = await file.arrayBuffer();

    // 1. Read with PDF-Lib (for fast page count & manipulation)
    updateProgress(40, 'Reading PDF structure & page count...');
    currentPdfDoc = await PDFLib.PDFDocument.load(currentArrayBuffer, { ignoreEncryption: true });
    
    // Exact requirement: read number of pages of the file!
    totalPages = currentPdfDoc.getPageCount();

    // 2. Read dimensions of first page
    if (totalPages > 0) {
      const firstPage = currentPdfDoc.getPage(0);
      const { width, height } = firstPage.getSize();
      const isLandscape = width > height;
      const dimName = getStandardPageFormat(width, height);
      docPageDimensions.textContent = `${dimName} (${Math.round(width)} × ${Math.round(height)} pt) ${isLandscape ? 'Landscape' : 'Portrait'}`;
    }

    // Update Header Badges
    docPageCountBadge.textContent = `📄 ${totalPages} ${totalPages === 1 ? 'Page' : 'Pages'}`;
    allPagesCountText.textContent = `${totalPages}-page`;

    // Initialize all pages as selected by default
    selectedPages.clear();
    for (let i = 0; i < totalPages; i++) selectedPages.add(i);

    // Update chunk inputs limit
    chunkSizeInput.max = totalPages;
    updateChunkEstimate();

    // Set sample default ranges
    if (totalPages > 1) {
      const third = Math.max(1, Math.floor(totalPages / 3));
      rangeInput.value = `1-${third}, ${third + 1}-${Math.min(totalPages, third * 2)}, ${Math.min(totalPages, third * 2 + 1)}-${totalPages}`;
    } else {
      rangeInput.value = '1';
    }
    validateRangeInput();

    // 3. Load with PDF.js for rendering visual thumbnails
    updateProgress(70, 'Rendering visual page previews...');
    if (window.pdfjsLib) {
      try {
        const loadingTask = pdfjsLib.getDocument({
          data: currentArrayBuffer.slice(0),
          disableAutoFetch: true,
          disableStream: true
        });
        currentPdfJsDoc = await loadingTask.promise;
      } catch (workerErr) {
        console.warn('PDF.js worker error or file:// restriction, falling back to clean page card layout:', workerErr);
        currentPdfJsDoc = null;
      }
    }

    updateProgress(100, 'Ready!');
    setTimeout(hideProgress, 300);

    // Reveal config & render grid
    ocrSection.style.display = 'block';
    splitConfigSection.style.display = 'flex';
    resultsSection.style.display = 'none';

    renderPagesGrid();
    updateActionSummary();
    updateNamingPreview();

  } catch (err) {
    console.error('PDF parsing error:', err);
    hideProgress();
    docPageCountBadge.textContent = 'Error parsing PDF';
    alert('Failed to read PDF document: ' + (err.message || 'The file may be password protected or corrupted.'));
  }
}

/* =========================================================
   Visual Page Grid & Thumbnail Rendering
   ========================================================= */
function renderPagesGrid() {
  pagesGridContainer.innerHTML = '';
  selectedCountBadge.textContent = `${selectedPages.size} / ${totalPages} pages selected`;

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const pageNum = pageIdx + 1;
    const isSelected = selectedPages.has(pageIdx);

    const card = document.createElement('div');
    card.className = `page-card ${isSelected ? 'selected' : ''}`;
    card.setAttribute('data-page-index', pageIdx);

    card.innerHTML = `
      <div class="page-card-header">
        <span class="page-num-pill">Page ${pageNum}</span>
        <input type="checkbox" class="page-checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation()">
      </div>
      <div class="page-thumb-wrapper" id="thumb-wrap-${pageIdx}">
        <div class="thumb-placeholder">
          <span>📄</span>
          <span>#${pageNum}</span>
        </div>
        <canvas class="page-canvas" id="canvas-page-${pageIdx}" style="display:none;"></canvas>
        <button class="page-zoom-btn" id="zoom-btn-${pageIdx}" title="View page preview" style="display:none;" onclick="openPagePreview(${pageIdx}); event.stopPropagation();">🔍</button>
      </div>
    `;

    // Click card to toggle selection
    card.addEventListener('click', (e) => {
      togglePageSelection(pageIdx);
    });

    const checkbox = card.querySelector('.page-checkbox');
    checkbox.addEventListener('change', (e) => {
      if (checkbox.checked) selectedPages.add(pageIdx);
      else selectedPages.delete(pageIdx);
      renderGridSelectionState();
    });

    pagesGridContainer.appendChild(card);
  }

  // Render thumbnails asynchronously in background
  renderThumbnailsAsync();
}

async function renderThumbnailsAsync() {
  if (!currentPdfJsDoc) return;

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    try {
      const page = await currentPdfJsDoc.getPage(pageIdx + 1);
      const canvas = document.getElementById(`canvas-page-${pageIdx}`);
      const placeholder = document.querySelector(`#thumb-wrap-${pageIdx} .thumb-placeholder`);

      if (!canvas) continue;

      // Scale thumbnail to fit container nicely (around 160-200px wide)
      const viewport = page.getViewport({ scale: 0.35 });
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const renderContext = {
        canvasContext: canvas.getContext('2d'),
        viewport: viewport
      };

      await page.render(renderContext).promise;

      if (placeholder) placeholder.style.display = 'none';
      canvas.style.display = 'block';
      const zoomBtn = document.querySelector(`#thumb-wrap-${pageIdx} .page-zoom-btn`);
      if (zoomBtn) zoomBtn.style.display = 'flex';

    } catch (e) {
      console.warn(`Could not render thumb for page ${pageIdx + 1}:`, e);
    }
  }
}

function togglePageSelection(pageIdx) {
  if (selectedPages.has(pageIdx)) {
    selectedPages.delete(pageIdx);
  } else {
    selectedPages.add(pageIdx);
  }
  renderGridSelectionState();
}

function renderGridSelectionState() {
  const cards = document.querySelectorAll('.page-card');
  cards.forEach(card => {
    const idx = parseInt(card.getAttribute('data-page-index'));
    const isSelected = selectedPages.has(idx);
    card.classList.toggle('selected', isSelected);
    const cb = card.querySelector('.page-checkbox');
    if (cb) cb.checked = isSelected;
  });

  selectedCountBadge.textContent = `${selectedPages.size} / ${totalPages} pages selected`;
  updateGridDeleteStyles();
  updateActionSummary();
}

function updateGridDeleteStyles() {
  const isDeleteMode = activeMode === 'delete';
  document.querySelectorAll('.page-card').forEach(card => {
    const idx = parseInt(card.getAttribute('data-page-index'));
    const isSelected = selectedPages.has(idx);
    card.classList.toggle('delete-marked', isDeleteMode && isSelected);
  });
}

/* =========================================================
   Mode Validation & Range Parsing
   ========================================================= */
function validateRangeInput() {
  const val = rangeInput.value.trim();
  if (!val) {
    rangeValidationFeedback.textContent = 'Please enter at least one page or range.';
    rangeValidationFeedback.className = 'range-feedback invalid';
    return false;
  }

  try {
    const parsed = parsePageRanges(val, totalPages);
    if (parsed.length === 0) {
      rangeValidationFeedback.textContent = 'No valid pages found in range expression.';
      rangeValidationFeedback.className = 'range-feedback invalid';
      return false;
    }

    const totalOutputFiles = parsed.length;
    const totalOutputPages = parsed.reduce((acc, r) => acc + r.length, 0);

    rangeValidationFeedback.textContent = `✓ Valid: Will create ${totalOutputFiles} PDF ${totalOutputFiles === 1 ? 'file' : 'files'} (covering ${totalOutputPages} pages).`;
    rangeValidationFeedback.className = 'range-feedback valid';
    return true;
  } catch (err) {
    rangeValidationFeedback.textContent = `⚠️ ${err.message}`;
    rangeValidationFeedback.className = 'range-feedback invalid';
    return false;
  }
}

/**
 * Parses expressions like "1-3, 4-6, 8" into array of page arrays [[0, 1, 2], [3, 4, 5], [7]]
 */
function parsePageRanges(str, maxPages) {
  const chunks = str.split(',').map(s => s.trim()).filter(Boolean);
  if (chunks.length === 0) throw new Error('Range cannot be empty.');

  const result = [];

  for (const chunk of chunks) {
    if (chunk.includes('-')) {
      const parts = chunk.split('-').map(p => p.trim());
      if (parts.length !== 2) throw new Error(`Invalid range format: "${chunk}"`);

      const start = parseInt(parts[0]);
      const end = parseInt(parts[1]);

      if (isNaN(start) || isNaN(end)) throw new Error(`Non-numeric range in "${chunk}"`);
      if (start < 1) throw new Error(`Start page cannot be less than 1 in "${chunk}"`);
      if (end > maxPages) throw new Error(`Page ${end} exceeds total pages (${maxPages}) in "${chunk}"`);
      if (start > end) throw new Error(`Start page ${start} is greater than end page ${end} in "${chunk}"`);

      const pageIndices = [];
      for (let p = start; p <= end; p++) {
        pageIndices.push(p - 1);
      }
      result.push(pageIndices);

    } else {
      const pageNum = parseInt(chunk);
      if (isNaN(pageNum)) throw new Error(`Invalid page number: "${chunk}"`);
      if (pageNum < 1 || pageNum > maxPages) throw new Error(`Page ${pageNum} is out of bounds (1–${maxPages})`);
      result.push([pageNum - 1]);
    }
  }

  return result;
}

function updateChunkEstimate() {
  const size = parseInt(chunkSizeInput.value) || 1;
  if (totalPages <= 0) return;
  const numFiles = Math.ceil(totalPages / size);
  chunkEstimateText.textContent = `Will generate ${numFiles} ${numFiles === 1 ? 'file' : 'files'} (every ${size} ${size === 1 ? 'page' : 'pages'})`;
  updateActionSummary();
  updateNamingPreview();
}

function updateActionSummary() {
  if (totalPages <= 0) return;

  const prefix = getPrefix();

  if (activeMode === 'all') {
    actionSummaryText.textContent = `Ready to split ${totalPages} pages into ${totalPages} separate PDF documents.`;
  } else if (activeMode === 'ranges') {
    try {
      const parsed = parsePageRanges(rangeInput.value.trim(), totalPages);
      actionSummaryText.textContent = `Ready to create ${parsed.length} PDF files based on specified intervals.`;
    } catch {
      actionSummaryText.textContent = `Specify valid page intervals above to proceed.`;
    }
  } else if (activeMode === 'chunks') {
    const size = parseInt(chunkSizeInput.value) || 1;
    const numFiles = Math.ceil(totalPages / size);
    actionSummaryText.textContent = `Ready to divide ${totalPages} pages into ${numFiles} consecutive chunks of ${size} pages.`;
  } else if (activeMode === 'extract') {
    const count = selectedPages.size;
    const format = document.querySelector('input[name="extractFormat"]:checked')?.value || 'merged';
    if (count === 0) {
      actionSummaryText.textContent = `Please select at least 1 page in the grid below to extract.`;
    } else if (format === 'merged') {
      actionSummaryText.textContent = `Ready to extract ${count} selected pages into 1 new merged PDF.`;
    } else {
      actionSummaryText.textContent = `Ready to extract ${count} selected pages into ${count} separate PDF files.`;
    }
  } else if (activeMode === 'delete') {
    const count = selectedPages.size;
    const remaining = totalPages - count;
    if (count === 0) {
      actionSummaryText.textContent = `Select pages in the grid to mark for removal.`;
    } else if (remaining <= 0) {
      actionSummaryText.textContent = `Cannot delete all pages. At least 1 page must remain.`;
    } else {
      actionSummaryText.textContent = `Ready to remove ${count} pages and save 1 PDF with the remaining ${remaining} pages.`;
    }
  }
}

function getPrefix() {
  return (namingPatternInput.value.trim() || 'split_document').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function updateNamingPreview() {
  const prefix = getPrefix();
  if (activeMode === 'all') {
    namingPreviewExample.textContent = `${prefix}_page_1.pdf ... ${prefix}_page_${totalPages}.pdf`;
  } else if (activeMode === 'ranges') {
    namingPreviewExample.textContent = `${prefix}_part_1_p1-3.pdf, ${prefix}_part_2_p4-6.pdf`;
  } else if (activeMode === 'chunks') {
    const size = parseInt(chunkSizeInput.value) || 2;
    namingPreviewExample.textContent = `${prefix}_chunk_1_p1-${Math.min(totalPages, size)}.pdf`;
  } else if (activeMode === 'extract') {
    const format = document.querySelector('input[name="extractFormat"]:checked')?.value || 'merged';
    if (format === 'merged') {
      namingPreviewExample.textContent = `${prefix}_extracted_${selectedPages.size}_pages.pdf`;
    } else {
      namingPreviewExample.textContent = `${prefix}_page_X.pdf`;
    }
  } else if (activeMode === 'delete') {
    namingPreviewExample.textContent = `${prefix}_cleaned.pdf`;
  }
}

/* =========================================================
   Step 3.5: Execute Split Operations (PDF-Lib Engine)
   ========================================================= */
async function executeSplitOperation() {
  if (!currentPdfDoc || totalPages <= 0) {
    alert('Please load a valid PDF file first.');
    return;
  }

  const prefix = getPrefix();
  generatedFiles = [];

  // Determine tasks based on active mode
  let taskList = []; // Array of { pageIndices: number[], filename: string, label: string }

  if (activeMode === 'all') {
    for (let i = 0; i < totalPages; i++) {
      taskList.push({
        pageIndices: [i],
        filename: `${prefix}_page_${i + 1}.pdf`,
        label: `Page ${i + 1}`
      });
    }
  } else if (activeMode === 'ranges') {
    let ranges;
    try {
      ranges = parsePageRanges(rangeInput.value.trim(), totalPages);
    } catch (err) {
      alert(err.message);
      return;
    }

    ranges.forEach((indices, idx) => {
      const minP = Math.min(...indices) + 1;
      const maxP = Math.max(...indices) + 1;
      const rangeLabel = minP === maxP ? `p${minP}` : `p${minP}-${maxP}`;
      taskList.push({
        pageIndices: indices,
        filename: `${prefix}_part_${idx + 1}_${rangeLabel}.pdf`,
        label: `Pages ${minP}–${maxP} (${indices.length} pages)`
      });
    });

  } else if (activeMode === 'chunks') {
    const chunkSize = parseInt(chunkSizeInput.value) || 2;
    let partNum = 1;
    for (let i = 0; i < totalPages; i += chunkSize) {
      const end = Math.min(i + chunkSize, totalPages);
      const indices = [];
      for (let p = i; p < end; p++) indices.push(p);

      const label = (i + 1 === end) ? `p${i + 1}` : `p${i + 1}-${end}`;
      taskList.push({
        pageIndices: indices,
        filename: `${prefix}_chunk_${partNum}_${label}.pdf`,
        label: `Pages ${i + 1}–${end} (${indices.length} pages)`
      });
      partNum++;
    }

  } else if (activeMode === 'extract') {
    if (selectedPages.size === 0) {
      alert('Please select at least 1 page to extract.');
      return;
    }
    const sortedIndices = Array.from(selectedPages).sort((a, b) => a - b);
    const format = document.querySelector('input[name="extractFormat"]:checked')?.value || 'merged';

    if (format === 'merged') {
      taskList.push({
        pageIndices: sortedIndices,
        filename: `${prefix}_extracted_${sortedIndices.length}pages.pdf`,
        label: `Selected ${sortedIndices.length} pages (merged)`
      });
    } else {
      sortedIndices.forEach(idx => {
        taskList.push({
          pageIndices: [idx],
          filename: `${prefix}_page_${idx + 1}.pdf`,
          label: `Page ${idx + 1}`
        });
      });
    }

  } else if (activeMode === 'delete') {
    if (selectedPages.size === 0) {
      alert('Please check at least 1 page to remove.');
      return;
    }
    const remainingIndices = [];
    for (let i = 0; i < totalPages; i++) {
      if (!selectedPages.has(i)) remainingIndices.push(i);
    }

    if (remainingIndices.length === 0) {
      alert('Cannot delete all pages! At least 1 page must remain in the document.');
      return;
    }

    taskList.push({
      pageIndices: remainingIndices,
      filename: `${prefix}_remaining_${remainingIndices.length}pages.pdf`,
      label: `Remaining ${remainingIndices.length} pages (excluding ${selectedPages.size} removed)`
    });
  }

  if (taskList.length === 0) {
    alert('No pages to process.');
    return;
  }

  // Show progress modal
  showProgress(`Generating ${taskList.length} PDF ${taskList.length === 1 ? 'File' : 'Files'}...`, 5, 'Preparing document engine...');

  try {
    const totalTasks = taskList.length;

    for (let i = 0; i < totalTasks; i++) {
      const task = taskList[i];
      const pct = Math.round(((i + 1) / totalTasks) * 90);
      updateProgress(pct, `Extracting and rendering ${task.filename} (${i + 1} of ${totalTasks})...`);

      // Create new PDFDoc and copy selected pages
      const subDoc = await PDFLib.PDFDocument.create();
      const copiedPages = await subDoc.copyPages(currentPdfDoc, task.pageIndices);

      copiedPages.forEach(p => subDoc.addPage(p));

      // Save bytes
      const pdfBytes = await subDoc.save();

      generatedFiles.push({
        filename: task.filename,
        bytes: pdfBytes,
        pageIndices: task.pageIndices,
        label: task.label,
        size: pdfBytes.length
      });

      // Small tick to allow UI to paint
      await new Promise(r => setTimeout(r, 8));
    }

    updateProgress(100, 'All files generated successfully!');
    setTimeout(() => {
      hideProgress();
      displayResults();
    }, 400);

  } catch (err) {
    console.error('Splitting error:', err);
    hideProgress();
    alert('Failed to split PDF: ' + err.message);
  }
}

/* =========================================================
   Step 4: Display Results & Downloads
   ========================================================= */
function displayResults() {
  resultsSection.style.display = 'block';
  splitConfigSection.style.display = 'none';

  resultsSubtitle.textContent = `Generated ${generatedFiles.length} ${generatedFiles.length === 1 ? 'file' : 'files'} from "${currentFile.name}" (${totalPages} total pages)`;

  generatedFilesList.innerHTML = '';

  generatedFiles.forEach((file, index) => {
    const item = document.createElement('div');
    item.className = 'file-item';

    const blob = new Blob([file.bytes], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(blob);

    item.innerHTML = `
      <div class="file-item-left">
        <div class="file-item-icon">📄</div>
        <div>
          <div class="file-item-title">${escapeHtml(file.filename)}</div>
          <div class="file-item-meta">
            <span>${file.label}</span>
            <span>•</span>
            <span>${formatBytes(file.size)}</span>
          </div>
        </div>
      </div>
      <div class="file-item-actions">
        <a href="${blobUrl}" target="_blank" class="btn btn-ghost btn-sm" title="Preview in browser">
          👁️ Preview
        </a>
        <button class="btn btn-primary btn-sm" onclick="downloadSingleFile(${index})">
          📥 Download
        </button>
      </div>
    `;

    generatedFilesList.appendChild(item);
  });

  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function downloadSingleFile(index) {
  const file = generatedFiles[index];
  if (!file) return;

  const blob = new Blob([file.bytes], { type: 'application/pdf' });
  triggerBrowserDownload(blob, file.filename);
}

async function downloadAllAsZip() {
  if (!generatedFiles.length) return;

  const zip = new JSZip();
  const folderName = getPrefix();

  showProgress('Creating ZIP Archive...', 10, 'Packing PDF files into ZIP...');

  generatedFiles.forEach(file => {
    zip.file(file.filename, file.bytes);
  });

  try {
    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    }, metadata => {
      const pct = Math.round(metadata.percent);
      updateProgress(pct, `Compressing files: ${pct}% complete...`);
    });

    hideProgress();
    const zipName = `${folderName}_split_pages.zip`;
    triggerBrowserDownload(zipBlob, zipName);

  } catch (err) {
    console.error('ZIP generation error:', err);
    hideProgress();
    alert('Failed to generate ZIP: ' + err.message);
  }
}

function triggerBrowserDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/* =========================================================
   LightBox Page Preview
   ========================================================= */
async function openPagePreview(pageIdx) {
  if (!currentPdfJsDoc) return;

  const pageNum = pageIdx + 1;
  previewModalTitle.textContent = `Page ${pageNum} of ${totalPages} — Full Preview`;

  try {
    const page = await currentPdfJsDoc.getPage(pageNum);
    const canvas = largePreviewCanvas;
    const context = canvas.getContext('2d');

    // High resolution preview viewport
    const viewport = page.getViewport({ scale: 1.5 });
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: context, viewport }).promise;

    previewModal.style.display = 'flex';
  } catch (e) {
    console.error('Preview error:', e);
  }
}

function closePreviewModal() {
  previewModal.style.display = 'none';
}

/* =========================================================
   Progress Bar Helpers
   ========================================================= */
function showProgress(title, percent, stepText) {
  progressModalTitle.textContent = title;
  progressBarFill.style.width = `${percent}%`;
  progressPercentText.textContent = `${percent}%`;
  progressStepText.textContent = stepText || '';
  progressModal.style.display = 'flex';
}

function updateProgress(percent, stepText) {
  progressBarFill.style.width = `${percent}%`;
  progressPercentText.textContent = `${percent}%`;
  if (stepText) progressStepText.textContent = stepText;
}

function hideProgress() {
  progressModal.style.display = 'none';
}

/* =========================================================
   Utilities
   ========================================================= */
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getStandardPageFormat(w, h) {
  const short = Math.min(w, h);
  const long = Math.max(w, h);
  // A4: ~595 x 842 pt
  if (Math.abs(short - 595.28) < 15 && Math.abs(long - 841.89) < 15) return 'A4';
  // Letter: ~612 x 792 pt
  if (Math.abs(short - 612) < 15 && Math.abs(long - 792) < 15) return 'Letter';
  // Legal: ~612 x 1008 pt
  if (Math.abs(short - 612) < 15 && Math.abs(long - 1008) < 15) return 'Legal';
  return 'Standard';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* =========================================================
   OCR & Text Extraction Engine (Chinese & English)
   ========================================================= */
function setupOcrListeners() {
  btnOcrToTxt.addEventListener('click', () => runOcrExtraction('txt'));
  btnOcrToHtml.addEventListener('click', () => runOcrExtraction('html'));

  btnCopyOcrText.addEventListener('click', () => {
    if (!lastFullTxtString) return;
    navigator.clipboard.writeText(lastFullTxtString).then(() => {
      const orig = btnCopyOcrText.textContent;
      btnCopyOcrText.textContent = '✅ Copied!';
      setTimeout(() => btnCopyOcrText.textContent = orig, 2000);
    }).catch(err => {
      alert('Failed to copy to clipboard: ' + err);
    });
  });

  btnSaveOcrTxtModal.addEventListener('click', () => {
    if (!lastFullTxtString) return;
    const base = getPrefix();
    const blob = new Blob([lastFullTxtString], { type: 'text/plain;charset=utf-8' });
    triggerBrowserDownload(blob, `${base}_ocr.txt`);
  });

  btnSaveOcrHtmlModal.addEventListener('click', () => {
    if (!lastFullHtmlString) return;
    const base = getPrefix();
    const blob = new Blob([lastFullHtmlString], { type: 'text/html;charset=utf-8' });
    triggerBrowserDownload(blob, `${base}_ocr.html`);
  });
}

function closeOcrResultModal() {
  ocrResultModal.style.display = 'none';
}

async function runOcrExtraction(format) {
  if (!currentPdfJsDoc || totalPages <= 0) {
    alert('Please upload a valid PDF file first.');
    return;
  }

  // 1. Determine target pages
  let targetIndices = [];
  if (ocrScopeSelect.value === 'selected') {
    targetIndices = Array.from(selectedPages).sort((a, b) => a - b);
    if (targetIndices.length === 0) {
      alert('No pages selected! Please select at least one page in the grid below, or choose "All Pages in Document".');
      return;
    }
  } else {
    for (let i = 0; i < totalPages; i++) targetIndices.push(i);
  }

  const langCode = ocrLangSelect.value;
  const langLabel = ocrLangSelect.options[ocrLangSelect.selectedIndex].text;
  const totalTasks = targetIndices.length;

  showProgress('Starting Text Recognition / OCR...', 5, `Preparing to process ${totalTasks} ${totalTasks === 1 ? 'page' : 'pages'} (${langLabel})...`);

  lastExtractedPages = [];

  try {
    for (let i = 0; i < totalTasks; i++) {
      const pageIdx = targetIndices[i];
      const pageNum = pageIdx + 1;
      const progressBase = Math.round((i / totalTasks) * 90);
      updateProgress(progressBase, `Extracting Page ${pageNum} (${i + 1} of ${totalTasks})...`);

      const page = await currentPdfJsDoc.getPage(pageNum);

      // Attempt A: Embedded Digital Text Extraction (fast, lossless)
      let extractedText = '';
      let method = 'Digital Text';

      try {
        const textContent = await page.getTextContent();
        extractedText = formatDigitalText(textContent);
      } catch (textErr) {
        console.warn(`TextContent error on page ${pageNum}:`, textErr);
      }

      // Check density of extracted text
      const cleanLen = extractedText.replace(/\s+/g, '').length;

      // Attempt B: If page has virtually no digital text (e.g. scanned image), invoke Tesseract OCR
      if (cleanLen < 12) {
        method = 'OCR';
        updateProgress(progressBase + 2, `Page ${pageNum}: Scanned image detected. Rendering high-res image for OCR...`);

        // Render page to high-res canvas (scale 2.0 ensures crisp Chinese & English glyph recognition)
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;

        if (window.Tesseract) {
          updateProgress(progressBase + 4, `Page ${pageNum}: Running OCR engine (${langCode})...`);
          try {
            const ocrResult = await Tesseract.recognize(canvas, langCode, {
              logger: m => {
                if (m.status === 'recognizing text') {
                  const subPct = Math.round((m.progress || 0) * 100);
                  const displayPct = progressBase + Math.round((subPct / totalTasks) * 0.9);
                  updateProgress(Math.min(95, displayPct), `Page ${pageNum}: Recognizing ${subPct}%...`);
                }
              }
            });
            if (ocrResult && ocrResult.data && ocrResult.data.text) {
              extractedText = ocrResult.data.text.trim();
            }
          } catch (tessErr) {
            console.error(`Tesseract OCR error on page ${pageNum}:`, tessErr);
            extractedText = `[OCR error on page ${pageNum}: ${tessErr.message || tessErr}]`;
          }
        } else {
          extractedText = `[Page ${pageNum}: Scanned image. Tesseract OCR library not ready.]`;
        }
      }

      lastExtractedPages.push({
        pageNum: pageNum,
        text: extractedText.trim() || `(Page ${pageNum} contains no text)`,
        method: method
      });

      // Small delay to allow UI to breathe
      await new Promise(r => setTimeout(r, 10));
    }

    updateProgress(96, 'Building output documents...');

    // 2. Build TXT and HTML representations
    const baseName = getPrefix();
    lastFullTxtString = buildTxtReport(lastExtractedPages, currentFile.name, langLabel);
    lastFullHtmlString = buildHtmlReport(lastExtractedPages, currentFile.name, langLabel);

    updateProgress(100, 'Done! Saving to local drive...');

    setTimeout(() => {
      hideProgress();

      // Trigger automatic save to local drive
      if (format === 'txt') {
        const txtBlob = new Blob([lastFullTxtString], { type: 'text/plain;charset=utf-8' });
        triggerBrowserDownload(txtBlob, `${baseName}_ocr.txt`);
      } else {
        const htmlBlob = new Blob([lastFullHtmlString], { type: 'text/html;charset=utf-8' });
        triggerBrowserDownload(htmlBlob, `${baseName}_ocr.html`);
      }

      // Show Result Modal
      openOcrResultModal(format);

    }, 350);

  } catch (err) {
    console.error('OCR Extraction error:', err);
    hideProgress();
    alert('OCR extraction failed: ' + (err.message || err));
  }
}

/**
 * Reconstructs natural lines and paragraphs from PDF.js textContent.
 * Carefully handles Chinese character flow and English word spacing.
 */
function formatDigitalText(textContent) {
  if (!textContent || !textContent.items || textContent.items.length === 0) return '';

  const items = textContent.items;
  const lines = [];
  let currentLine = [];
  let lastY = null;

  // Group items by vertical line position
  for (const item of items) {
    if (!item.str && item.str !== ' ') continue;

    // y is transform[5]
    const y = item.transform ? Math.round(item.transform[5]) : 0;
    const x = item.transform ? Math.round(item.transform[4]) : 0;

    if (lastY === null || Math.abs(y - lastY) > 3) {
      if (currentLine.length > 0) {
        lines.push(currentLine);
      }
      currentLine = [];
      lastY = y;
    }

    currentLine.push({ x: x, text: item.str });
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  // Sort each line horizontally and build line string
  const outputLines = [];
  for (const line of lines) {
    line.sort((a, b) => a.x - b.x);

    let lineStr = '';
    for (let i = 0; i < line.length; i++) {
      const piece = line[i].text;
      if (i > 0) {
        const prevPiece = line[i - 1].text;
        const prevLastChar = prevPiece.slice(-1);
        const currFirstChar = piece.slice(0, 1);

        // If English/Number -> English/Number, ensure space
        const isPrevAlnum = /[a-zA-Z0-9.,;:!?]/.test(prevLastChar);
        const isCurrAlnum = /[a-zA-Z0-9]/.test(currFirstChar);

        if (isPrevAlnum && isCurrAlnum && !prevPiece.endsWith(' ') && !piece.startsWith(' ')) {
          lineStr += ' ';
        }
      }
      lineStr += piece;
    }

    if (lineStr.trim()) {
      outputLines.push(lineStr.trim());
    }
  }

  return outputLines.join('\n');
}

/**
 * Builds clean UTF-8 plain text report
 */
function buildTxtReport(pagesData, fileName, langLabel) {
  const divider = '='.repeat(80);
  const now = new Date().toLocaleString();
  const totalChars = pagesData.reduce((acc, p) => acc + p.text.length, 0);

  let out = `${divider}\n`;
  out += `DOCUMENT OCR & TEXT EXTRACTION REPORT\n`;
  out += `Source File: ${fileName}\n`;
  out += `Total Pages Processed: ${pagesData.length}\n`;
  out += `Total Characters: ${totalChars.toLocaleString()}\n`;
  out += `Recognition Language: ${langLabel}\n`;
  out += `Exported Date: ${now}\n`;
  out += `${divider}\n\n`;

  pagesData.forEach(p => {
    out += `--- PAGE ${p.pageNum} (Method: ${p.method}) ---\n\n`;
    out += `${p.text}\n\n`;
  });

  out += `${divider}\n`;
  out += `END OF DOCUMENT\n`;
  out += `${divider}\n`;

  return out;
}

/**
 * Builds rich, responsive standalone HTML report with navigation TOC and clean typography
 */
function buildHtmlReport(pagesData, fileName, langLabel) {
  const now = new Date().toLocaleString();
  const totalChars = pagesData.reduce((acc, p) => acc + p.text.length, 0);
  const totalWords = pagesData.reduce((acc, p) => acc + (p.text.match(/\b\w+\b/g) || []).length, 0);

  // Generate page cards HTML
  const pagesHtml = pagesData.map(p => `
    <article class="page-section" id="page-${p.pageNum}">
      <header class="page-header">
        <div class="page-header-left">
          <span class="page-badge">Page ${p.pageNum}</span>
          <span class="method-tag">${escapeHtml(p.method)}</span>
        </div>
        <button class="copy-page-btn" onclick="navigator.clipboard.writeText(document.getElementById('content-${p.pageNum}').innerText).then(()=>alert('Page ${p.pageNum} copied!'))">📋 Copy Page</button>
      </header>
      <div class="page-body" id="content-${p.pageNum}">
        ${p.text.split('\n').map(l => `<p>${escapeHtml(l) || '&nbsp;'}</p>`).join('')}
      </div>
    </article>
  `).join('');

  // Table of Contents links
  const tocLinks = pagesData.map(p => `
    <a href="#page-${p.pageNum}" class="toc-link">Page ${p.pageNum}</a>
  `).join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(fileName)} — OCR & Extracted Text</title>
  <style>
    :root {
      --bg: #f5f5f7;
      --card-bg: #ffffff;
      --card-border: #e5e5ea;
      --text: #1d1d1f;
      --text-muted: #86868b;
      --primary: #0071e3;
      --primary-light: #edf5fe;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #121214;
        --card-bg: #1c1c1e;
        --card-border: rgba(255,255,255,0.12);
        --text: #f5f5f7;
        --text-muted: #98989d;
        --primary: #2997ff;
        --primary-light: rgba(41,151,255,0.15);
      }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.7;
      padding: 30px 20px;
    }
    .container {
      max-width: 960px;
      margin: 0 auto;
    }
    .doc-banner {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      padding: 24px 28px;
      margin-bottom: 24px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.04);
    }
    .doc-title {
      font-size: 24px;
      font-weight: 800;
      letter-spacing: -0.5px;
      margin-bottom: 8px;
    }
    .doc-stats-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 14px;
    }
    .stat-chip {
      background: var(--primary-light);
      color: var(--primary);
      padding: 4px 12px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
    }
    .toc-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 12px 16px;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      margin-bottom: 24px;
      align-items: center;
    }
    .toc-label {
      font-size: 12px;
      font-weight: 700;
      color: var(--text-muted);
      margin-right: 6px;
    }
    .toc-link {
      font-size: 12px;
      color: var(--primary);
      text-decoration: none;
      padding: 3px 8px;
      background: var(--bg);
      border-radius: 6px;
      font-weight: 600;
    }
    .toc-link:hover {
      background: var(--primary);
      color: #fff;
    }
    .page-section {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      padding: 24px 28px;
      margin-bottom: 20px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.03);
    }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 14px;
      border-bottom: 1px solid var(--card-border);
      margin-bottom: 16px;
    }
    .page-header-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .page-badge {
      font-size: 13px;
      font-weight: 800;
      background: var(--primary);
      color: #fff;
      padding: 2px 10px;
      border-radius: 6px;
    }
    .method-tag {
      font-size: 11px;
      color: var(--text-muted);
      background: var(--bg);
      padding: 2px 8px;
      border-radius: 4px;
    }
    .copy-page-btn {
      background: var(--bg);
      border: 1px solid var(--card-border);
      color: var(--text);
      font-size: 12px;
      padding: 4px 10px;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
    }
    .copy-page-btn:hover {
      background: var(--primary-light);
      color: var(--primary);
    }
    .page-body {
      font-size: 15px;
      color: var(--text);
      line-height: 1.8;
      word-break: break-word;
    }
    .page-body p {
      margin-bottom: 10px;
    }
    .page-body p:last-child {
      margin-bottom: 0;
    }
    @media print {
      body { background: #fff; color: #000; padding: 0; }
      .toc-bar, .copy-page-btn { display: none; }
      .page-section { border: none; box-shadow: none; page-break-after: always; padding: 20px 0; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="doc-banner">
      <h1 class="doc-title">📄 ${escapeHtml(fileName)}</h1>
      <p style="font-size:13px; color:var(--text-muted);">OCR / Text Recognition Export • Generated on ${now}</p>
      <div class="doc-stats-grid">
        <span class="stat-chip">${pagesData.length} Pages</span>
        <span class="stat-chip">${totalChars.toLocaleString()} Characters</span>
        <span class="stat-chip">${totalWords.toLocaleString()} Words</span>
        <span class="stat-chip">${escapeHtml(langLabel)}</span>
      </div>
    </div>

    <nav class="toc-bar">
      <span class="toc-label">Jump to page:</span>
      ${tocLinks}
    </nav>

    <main>
      ${pagesHtml}
    </main>
  </div>
</body>
</html>`;
}

function openOcrResultModal(format) {
  ocrModalFormatBadge.textContent = format.toUpperCase();
  ocrResultTitle.textContent = `OCR Text Export (${format.toUpperCase()}) — Saved to Local Drive`;

  const totalChars = lastExtractedPages.reduce((acc, p) => acc + p.text.length, 0);
  ocrStatsSummary.innerHTML = `
    <strong>${lastExtractedPages.length} pages processed</strong> • 
    <strong>${totalChars.toLocaleString()} characters</strong> • 
    Saved to downloads folder
  `;

  ocrResultPre.textContent = lastFullTxtString;
  ocrResultModal.style.display = 'flex';
}

// Kickoff
window.addEventListener('DOMContentLoaded', init);

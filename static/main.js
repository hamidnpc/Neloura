// Global variables
let currentDynamicRangeVersion = Date.now();
let fitsData = null;
let viewer = null;
let performanceTimer;
let isOverviewMode = true; // Start with overview mode
let activeCatalog = null; // Currently active catalog
let infoPopups = [];
let maxPopups = 5; // Maximum number of popups allowed
let isUpdatingHistogram = false;
let histogramUpdateRequested = false;
let histogramUpdateQueue = [];
let histogramUpdateTimer = null;


let currentColorMap = 'grayscale'; // Default color map
let currentScaling = 'linear'; // Default scaling function
let currentColorMapInverted = false; // Default orientation for color maps
let segmentOverlayState = null;
let segmentOverlayMetadata = null;
if (typeof window !== 'undefined') {
    window.segmentOverlayState = segmentOverlayState;
}

function setSegmentOverlayState(state) {
    segmentOverlayState = state;
    if (typeof window !== 'undefined') {
        window.segmentOverlayState = state;
    }
    return segmentOverlayState;
}
function ensureGlobalOverlayPortal() {
    try {
        const rootDoc = (() => {
            try { return window.top?.document || document; } catch (_) { return document; }
        })();
        if (!rootDoc) return null;
        let portal = rootDoc.getElementById('global-overlay-portal');
        if (!portal) {
            portal = rootDoc.createElement('div');
            portal.id = 'global-overlay-portal';
            Object.assign(portal.style, {
                position: 'fixed',
                inset: '0',
                zIndex: '2147480000',
                pointerEvents: 'none'
            });
            rootDoc.body.appendChild(portal);
        }
        return portal;
    } catch (err) {
        console.warn('[segments] Failed to ensure global overlay portal', err);
        return null;
    }
}

let cachedSegmentsList = null;
let segmentsPanelCloseHandler = null;
const segmentOverlayPreferences = window.segmentOverlayPreferences || (window.segmentOverlayPreferences = { colorMap: 'labels' });
let segmentOverlayControlsCollapsed = !!window.segmentOverlayControlsCollapsed;
const GLOBAL_DATA_PRECISION = 3; // Number of decimal places for displaying float data values
const DEFAULT_SEGMENT_OVERLAY_OPACITY = 0.6;

if (typeof window !== 'undefined') {
    window.currentColorMapInverted = typeof window.currentColorMapInverted === 'boolean'
        ? window.currentColorMapInverted
        : false;
    currentColorMapInverted = window.currentColorMapInverted;
}

const COLORCET_PALETTES = {};
let colorcetLoadPromise = null;
let colorcetColorMapOptions = [];
const FALLBACK_SEGMENT_COLOR_MAPS = [
    { value: 'labels', label: 'Distinct Labels', gradient: 'linear-gradient(90deg, #ef4444, #f59e0b, #22c55e, #0ea5e9, #a855f7)' },
    { value: 'grayscale', label: 'Grayscale', gradient: 'linear-gradient(to right, #000, #fff)' },
    { value: 'viridis', label: 'Viridis', gradient: 'linear-gradient(to right, #440154, #414487, #2a788e, #22a884, #7ad151, #fde725)' },
    { value: 'plasma', label: 'Plasma', gradient: 'linear-gradient(to right, #0d0887, #5302a3, #8b0aa5, #b83289, #db5c68, #f48849, #febc2a)' },
    { value: 'inferno', label: 'Inferno', gradient: 'linear-gradient(to right, #000004, #320a5a, #781c6d, #bb3754, #ec6824, #fbb41a)' },
    { value: 'rdbu', label: 'RdBu', gradient: 'linear-gradient(to right, #b2182b, #f7f7f7, #2166ac)' },
    { value: 'spectral', label: 'Spectral', gradient: 'linear-gradient(to right, #9e0142, #f46d43, #fee08b, #e6f598, #66c2a5, #5e4fa2)' },
    { value: 'cividis', label: 'Cividis', gradient: 'linear-gradient(to right, #00204c, #213d6b, #555b6c, #7b7a77, #a59c74, #d9d57a)' },
    { value: 'hot', label: 'Hot', gradient: 'linear-gradient(to right, #000, #f00, #ff0, #fff)' },
    { value: 'cool', label: 'Cool', gradient: 'linear-gradient(to right, #00f, #0ff, #0f0)' },
    { value: 'rainbow', label: 'Rainbow', gradient: 'linear-gradient(to right, #6e40aa, #be3caf, #fe4b83, #ff7847, #e2b72f, #aff05b)' },
    { value: 'jet', label: 'Jet', gradient: 'linear-gradient(to right, #00008f, #0020ff, #00ffff, #51ff77, #fdff00, #ff0000, #800000)' },
    { value: 'blue', label: 'Blue', gradient: 'linear-gradient(to right, #000000, #0000ff)' },
    { value: 'red', label: 'Red', gradient: 'linear-gradient(to right, #000000, #ff0000)' },
    { value: 'green', label: 'Green', gradient: 'linear-gradient(to right, #000000, #00ff00)' },
    { value: 'orange', label: 'Orange', gradient: 'linear-gradient(to right, #000000, #ffa500)' },
    { value: 'yellow', label: 'Yellow', gradient: 'linear-gradient(to right, #000000, #ffff00)' },
    { value: 'cyan', label: 'Cyan', gradient: 'linear-gradient(to right, #000000, #00ffff)' },
    { value: 'magenta', label: 'Magenta', gradient: 'linear-gradient(to right, #000000, #ff00ff)' }
];
function buildSegmentColorMapOptions() {
    const seen = new Set();
    const combined = [];
    const addList = (list) => {
        if (!Array.isArray(list)) return;
        list.forEach(entry => {
            if (!entry || typeof entry.value === 'undefined') return;
            const key = String(entry.value);
            if (seen.has(key)) return;
            seen.add(key);
            combined.push({
                value: key,
                label: entry.label || key,
                gradient: entry.gradient || null
            });
        });
    };
    addList(FALLBACK_SEGMENT_COLOR_MAPS);
    addList(window.__baseColorMapOptions);
    addList(window.__colorcetColorMapOptions);
    return combined;
}

function applySegmentOverlayColorMap(colorMap) {
    if (!colorMap) return;
    const normalized = String(colorMap);
    if (segmentOverlayPreferences.colorMap === normalized && (!segmentOverlayState || segmentOverlayState.colorMap === normalized)) {
        return;
    }
    segmentOverlayPreferences.colorMap = normalized;
    window.segmentOverlayPreferences = segmentOverlayPreferences;
    if (segmentOverlayState && segmentOverlayState.sourceSegmentName) {
        loadSegmentOverlay(segmentOverlayState.sourceSegmentName, { colorMap: normalized, silent: true });
    } else {
        syncSegmentOverlayControls();
    }
}

function clampPaletteIndex(val) {
    if (!Number.isFinite(val)) return 0;
    if (val <= 0) return 0;
    if (val >= 255) return 255;
    return val & 255;
}

function buildGradientFromPalette(palette) {
    if (!Array.isArray(palette) || palette.length === 0) {
        return 'linear-gradient(to right, #000, #fff)';
    }
    const samples = Math.min(6, palette.length);
    const step = (palette.length - 1) / Math.max(1, samples - 1);
    const stops = [];
    for (let i = 0; i < samples; i++) {
        const idx = Math.round(i * step);
        const color = palette[idx] || palette[palette.length - 1];
        const pct = (samples === 1) ? 0 : (i / (samples - 1)) * 100;
        stops.push(`rgb(${color[0]},${color[1]},${color[2]}) ${pct}%`);
    }
    return `linear-gradient(90deg, ${stops.join(', ')})`;
}

function ensureColorcetFunctionsRegistered() {
    if (typeof COLOR_MAPS === 'undefined') {
        setTimeout(ensureColorcetFunctionsRegistered, 50);
        return;
    }
    Object.keys(COLORCET_PALETTES).forEach((name) => {
        if (COLOR_MAPS[name]) return;
        COLOR_MAPS[name] = (val) => {
            const pal = COLORCET_PALETTES[name];
            if (!pal || !pal.length) return COLOR_MAPS.grayscale(val);
            const idx = clampPaletteIndex(val);
            const color = pal[idx] || pal[pal.length - 1];
            return [color[0], color[1], color[2]];
        };
    });
}

function createSearchableDropdown(labelText, selectId, optionsArray, globalVarName, defaultSelectedValue, hasSwatches = false) {
    const container = document.createElement('div');
    container.style.marginBottom = '10px';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';

    const label = document.createElement('label');
    label.textContent = labelText;
    Object.assign(label.style, { color: '#aaa', fontFamily: 'Arial, sans-serif', fontSize: '14px', alignSelf: 'flex-start', marginBottom: '5px' });

    const customSelectContainer = document.createElement('div');
    Object.assign(customSelectContainer.style, { width: '100%', position: 'relative' });

    const selectedOptionDisplay = document.createElement('div');
    Object.assign(selectedOptionDisplay.style, {
        display: 'flex', alignItems: 'center', padding: '8px 10px', backgroundColor: '#444',
        color: '#fff', border: '1px solid #555', borderRadius: '3px', cursor: 'pointer',
        fontFamily: 'Arial, sans-serif', fontSize: '14px', justifyContent: 'space-between'
    });

    const selectedSwatch = document.createElement('div');
    if (hasSwatches) {
        Object.assign(selectedSwatch.style, { width: '60px', height: '15px', marginRight: '10px', borderRadius: '2px', background: 'linear-gradient(to right, #000, #fff)' });
    }
    const selectedText = document.createElement('span');
    selectedText.style.flex = '1';
    const dropdownArrow = document.createElement('span');
    dropdownArrow.textContent = '▼';
    dropdownArrow.style.marginLeft = '10px';
    dropdownArrow.style.fontSize = '10px';

    if (hasSwatches) selectedOptionDisplay.appendChild(selectedSwatch);
    selectedOptionDisplay.appendChild(selectedText);
    selectedOptionDisplay.appendChild(dropdownArrow);

    const optionsOuterContainer = document.createElement('div');
    Object.assign(optionsOuterContainer.style, {
        position: 'absolute', top: '100%', left: '0', width: '100%', backgroundColor: '#3a3a3a',
        border: '1px solid #555', borderRadius: '0 0 3px 3px', zIndex: '20', display: 'none', borderTop: 'none',
        maxHeight: hasSwatches ? '340px' : '280px'
    });

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = `Search ${labelText.toLowerCase().replace(':', '')}...`;
    Object.assign(searchInput.style, {
        width: 'calc(100% - 0px)', padding: '8px 10px', margin: '0', border: 'none',
        borderBottom: '1px solid #555', borderRadius: '0', backgroundColor: '#3a3a3a',
        color: '#fff', boxSizing: 'border-box'
    });

    const optionsListContainer = document.createElement('div');
    Object.assign(optionsListContainer.style, { maxHeight: hasSwatches ? '320px' : '260px', overflowY: 'auto' });

    searchInput.addEventListener('input', () => {
        const filter = searchInput.value.toLowerCase();
        const options = optionsListContainer.querySelectorAll('.custom-dropdown-option');
        options.forEach(option => {
            const text = option.dataset.label.toLowerCase();
            option.style.display = text.includes(filter) ? (hasSwatches ? 'flex' : 'block') : 'none';
        });
    });

    optionsOuterContainer.appendChild(searchInput);
    optionsOuterContainer.appendChild(optionsListContainer);

    const hiddenSelect = document.createElement('select');
    hiddenSelect.id = selectId;
    hiddenSelect.style.display = 'none';

    let currentSelectionValue = window[globalVarName] || defaultSelectedValue;
    const initialSelection = optionsArray.find(opt => opt.value === currentSelectionValue) || optionsArray.find(opt => opt.value === defaultSelectedValue);
    if (initialSelection) {
        selectedText.textContent = initialSelection.label;
        if (hasSwatches && initialSelection.gradient) selectedSwatch.style.background = initialSelection.gradient;
    }

    optionsArray.forEach(opt => {
        const optionEl = document.createElement('option');
        optionEl.value = opt.value;
        optionEl.textContent = opt.label;
        if (opt.value === currentSelectionValue) optionEl.selected = true;
        hiddenSelect.appendChild(optionEl);

        const visualOption = document.createElement('div');
        visualOption.classList.add('custom-dropdown-option');
        visualOption.dataset.value = opt.value;
        visualOption.dataset.label = opt.label;
        Object.assign(visualOption.style, {
            padding: '8px 10px', cursor: 'pointer', borderBottom: '1px solid #505050',
            display: hasSwatches ? 'flex' : 'block', alignItems: hasSwatches ? 'center' : 'normal', color: '#fff'
        });
        if (opt.value === currentSelectionValue) visualOption.style.backgroundColor = '#555';

        if (hasSwatches) {
            const swatch = document.createElement('div');
            Object.assign(swatch.style, { minWidth: '60px', width: '60px', height: '15px', marginRight: '10px', borderRadius: '2px', background: opt.gradient || '#ccc' });
            visualOption.appendChild(swatch);
        }
        const textSpan = document.createElement('span');
        textSpan.textContent = opt.label;
        visualOption.appendChild(textSpan);

        visualOption.addEventListener('mouseover', () => visualOption.style.backgroundColor = '#555');
        visualOption.addEventListener('mouseout', () => {
            if (visualOption.dataset.value !== currentSelectionValue) visualOption.style.backgroundColor = 'transparent';
        });
        visualOption.addEventListener('click', () => {
            hiddenSelect.value = opt.value;
            selectedText.textContent = opt.label;
            if (hasSwatches && opt.gradient) selectedSwatch.style.background = opt.gradient;
            currentSelectionValue = opt.value;
            window[globalVarName] = opt.value;

            optionsListContainer.querySelectorAll('.custom-dropdown-option').forEach(vOpt => {
                vOpt.style.backgroundColor = (vOpt.dataset.value === currentSelectionValue) ? '#555' : 'transparent';
            });
            optionsOuterContainer.style.display = 'none';
            hiddenSelect.dispatchEvent(new Event('change'));
        });

        optionsListContainer.appendChild(visualOption);
    });
    if (optionsListContainer.lastChild && optionsListContainer.lastChild.style) {
        optionsListContainer.lastChild.style.borderBottom = 'none';
    }

    selectedOptionDisplay.addEventListener('click', () => {
        const isOpen = optionsOuterContainer.style.display === 'block';
        if (!isOpen) {
            optionsOuterContainer.style.display = 'block';
            searchInput.value = '';
            optionsListContainer.querySelectorAll('.custom-dropdown-option').forEach(opt => opt.style.display = hasSwatches ? 'flex' : 'block');
            searchInput.focus();

            optionsOuterContainer.style.top = '100%';
            optionsOuterContainer.style.bottom = 'auto';
            optionsOuterContainer.style.maxHeight = hasSwatches ? '340px' : '280px';

            const parentRect = customSelectContainer.getBoundingClientRect();
            const dropdownRect = optionsOuterContainer.getBoundingClientRect();
            if (dropdownRect.bottom > window.innerHeight) {
                if (parentRect.top - dropdownRect.height > 0) {
                    optionsOuterContainer.style.top = 'auto';
                    optionsOuterContainer.style.bottom = '100%';
                } else {
                    const availableHeight = window.innerHeight - parentRect.bottom - 10;
                    optionsOuterContainer.style.maxHeight = `${Math.max(50, availableHeight)}px`;
                }
            }
        } else {
            optionsOuterContainer.style.display = 'none';
        }
    });

    customSelectContainer.appendChild(selectedOptionDisplay);
    customSelectContainer.appendChild(optionsOuterContainer);
    customSelectContainer.appendChild(hiddenSelect);

    hiddenSelect.addEventListener('change', () => {
        window[globalVarName] = hiddenSelect.value;
        const selOpt = optionsArray.find(o => o.value === hiddenSelect.value);
        if (selOpt) {
            selectedText.textContent = selOpt.label;
            if (hasSwatches && selOpt.gradient) selectedSwatch.style.background = selOpt.gradient;
        }

        const ensureMinMax = () => {
            const minInput = document.getElementById('min-range-input');
            const maxInput = document.getElementById('max-range-input');
            const needsPrefill = !minInput || !maxInput || minInput.value === '' || maxInput.value === '' ||
                                 isNaN(parseFloat(minInput.value)) || isNaN(parseFloat(maxInput.value));
            if (needsPrefill) {
                const fallback = { min: (window.fitsData?.min_value ?? 0), max: (window.fitsData?.max_value ?? 1) };
                const defaults = (typeof resolveDefaultRange === 'function') ? resolveDefaultRange() : fallback;
                if (typeof setRangeInputs === 'function') setRangeInputs(defaults.min, defaults.max);
            }
        };

        if (selectId === 'color-map-select') {
            ensureMinMax();
            if (typeof applyColorMap === 'function') {
                applyColorMap(hiddenSelect.value);
            } else if (typeof applyDynamicRange === 'function') {
                applyDynamicRange();
            }
        } else if (selectId === 'scaling-select') {
            ensureMinMax();
            if (typeof applyDynamicRange === 'function') applyDynamicRange();
        }
    });

    container.appendChild(label);
    container.appendChild(customSelectContainer);
    return container;
}

if (typeof window !== 'undefined') {
    window.createSearchableDropdown = window.createSearchableDropdown || createSearchableDropdown;
}

function getColorMapOptions() {
    const baseOptions = [
        { value: 'grayscale', label: 'Grayscale', gradient: 'linear-gradient(to right, #000, #fff)' },
        { value: 'viridis', label: 'Viridis', gradient: 'linear-gradient(to right, #440154, #414487, #2a788e, #22a884, #7ad151, #fde725)' },
        { value: 'plasma', label: 'Plasma', gradient: 'linear-gradient(to right, #0d0887, #5302a3, #8b0aa5, #b83289, #db5c68, #f48849, #febc2a)' },
        { value: 'inferno', label: 'Inferno', gradient: 'linear-gradient(to right, #000004, #320a5a, #781c6d, #bb3754, #ec6824, #fbb41a)' },
        { value: 'rdbu', label: 'RdBu', gradient: 'linear-gradient(to right, #b2182b, #f7f7f7, #2166ac)' },
        { value: 'spectral', label: 'Spectral', gradient: 'linear-gradient(to right, #9e0142, #f46d43, #fee08b, #e6f598, #66c2a5, #5e4fa2)' },
        { value: 'cividis', label: 'Cividis', gradient: 'linear-gradient(to right, #00204c, #213d6b, #555b6c, #7b7a77, #a59c74, #d9d57a)' },
        { value: 'hot', label: 'Hot', gradient: 'linear-gradient(to right, #000, #f00, #ff0, #fff)' },
        { value: 'cool', label: 'Cool', gradient: 'linear-gradient(to right, #00f, #0ff, #0f0)' },
        { value: 'rainbow', label: 'Rainbow', gradient: 'linear-gradient(to right, #6e40aa, #be3caf, #fe4b83, #ff7847, #e2b72f, #aff05b)' },
        { value: 'jet', label: 'Jet', gradient: 'linear-gradient(to right, #00008f, #0020ff, #00ffff, #51ff77, #fdff00, #ff0000, #800000)' },
        { value: 'blue', label: 'Blue', gradient: 'linear-gradient(to right, #000000, #0000ff)' },
        { value: 'red', label: 'Red', gradient: 'linear-gradient(to right, #000000, #ff0000)' },
        { value: 'green', label: 'Green', gradient: 'linear-gradient(to right, #000000, #00ff00)' },
        { value: 'orange', label: 'Orange', gradient: 'linear-gradient(to right, #000000, #ffa500)' },
        { value: 'yellow', label: 'Yellow', gradient: 'linear-gradient(to right, #000000, #ffff00)' },
        { value: 'cyan', label: 'Cyan', gradient: 'linear-gradient(to right, #000000, #00ffff)' },
        { value: 'magenta', label: 'Magenta', gradient: 'linear-gradient(to right, #000000, #ff00ff)' }
    ];
    const extra = Array.isArray(window.__colorcetColorMapOptions) ? window.__colorcetColorMapOptions : [];
    return baseOptions.concat(extra);
}

function getSegmentColorMapOptions() {
    return buildSegmentColorMapOptions();
}

async function loadColorcetPalettes() {
    if (colorcetLoadPromise) return colorcetLoadPromise;
    colorcetLoadPromise = (async () => {
        try {
            const resp = await fetch('/static/colorcet_palettes.json', { cache: 'force-cache' });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            const names = Object.keys(data || {});
            names.forEach((name) => {
                const palette = data[name];
                if (!Array.isArray(palette) || palette.length === 0) return;
                COLORCET_PALETTES[name] = palette;
            });
            ensureColorcetFunctionsRegistered();
            const sorted = names.sort((a, b) => a.localeCompare(b));
            colorcetColorMapOptions = sorted.map((name) => ({
                value: name,
                label: `CET · ${name}`,
                gradient: buildGradientFromPalette(COLORCET_PALETTES[name])
            }));
            window.__colorcetColorMapOptions = colorcetColorMapOptions;
        } catch (err) {
            console.error('Failed to load Colorcet palettes', err);
            colorcetColorMapOptions = [];
            window.__colorcetColorMapOptions = [];
        }
    })();
    return colorcetLoadPromise;
}

function enablePopupDrag(popup, dragHandle, hostDoc) {
    if (!popup || !dragHandle) return;
    const doc = hostDoc || popup.ownerDocument || document;
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let originLeft = 0;
    let originTop = 0;
    const resetTransform = () => {
        if (popup.style.transform && popup.style.transform !== 'none') {
            const rect = popup.getBoundingClientRect();
            popup.style.left = `${rect.left}px`;
            popup.style.top = `${rect.top}px`;
            popup.style.transform = 'none';
        }
    };
    const onPointerMove = (e) => {
        if (pointerId === null || e.pointerId !== pointerId) return;
        e.preventDefault();
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        popup.style.left = `${originLeft + dx}px`;
        popup.style.top = `${originTop + dy}px`;
    };
    const endDrag = (e) => {
        if (pointerId === null || e.pointerId !== pointerId) return;
        pointerId = null;
        try { dragHandle.releasePointerCapture(e.pointerId); } catch(_) {}
        doc.removeEventListener('pointermove', onPointerMove, true);
        doc.removeEventListener('pointerup', endDrag, true);
        doc.removeEventListener('pointercancel', endDrag, true);
        dragHandle.style.cursor = 'grab';
    };
    const startDrag = (e) => {
        if (pointerId !== null) return;
        if (typeof e.button === 'number' && e.button !== 0) return;
        pointerId = e.pointerId;
        resetTransform();
        const rect = popup.getBoundingClientRect();
        originLeft = rect.left;
        originTop = rect.top;
        startX = e.clientX;
        startY = e.clientY;
        dragHandle.style.cursor = 'grabbing';
        try { dragHandle.setPointerCapture(e.pointerId); } catch(_) {}
        doc.addEventListener('pointermove', onPointerMove, true);
        doc.addEventListener('pointerup', endDrag, true);
        doc.addEventListener('pointercancel', endDrag, true);
        e.preventDefault();
    };
    dragHandle.addEventListener('pointerdown', startDrag);
    dragHandle.style.touchAction = 'none';
    dragHandle.style.cursor = 'grab';
}

// NEW: State for interactive histogram
let histogramScaleInfo = { padding: {}, histWidth: 0, dataMin: 0, dataRange: 1 };
let isDraggingLine = null; // Can be 'min', 'max', or null
const DRAG_THRESHOLD = 5; // Pixel tolerance for clicking lines
let throttledHistogramUpdate = null; // To be initialized later
let debouncedApplyDynamicRange = null; // To be initialized later


// static/main.js

// ... (other global variables like isUpdatingHistogram, currentColorMap, etc.)
let debouncedRequestHistogramUpdate = null; // For debouncing histogram updates
let histogramOverviewPixelData = null; // <-- ADD THIS LINE: For caching overview pixels

function getHistogramDocument() {
    try {
        const root = window.top || window;
        if (root.__histogramHostDoc && root.__histogramHostDoc.body) {
            return root.__histogramHostDoc;
        }
        return root.document || document;
    } catch (_) {
        return document;
    }
}

function getHistogramWindow() {
    try {
        const root = window.top || window;
        if (root.__histogramHostWin) return root.__histogramHostWin;
        return root;
    } catch (_) {
        return window;
    }
}

function getCurrentPaneId() {
    return window.__paneSyncId || window.__paneId || 'base-pane';
}

// NEW: State for line animation (if you have this section)
// ...

// NEW: State for line animation
let currentMinLineX = null;
let currentMaxLineX = null;
let lineAnimationId = null;
const LINE_ANIMATION_DURATION = 150; // ms

const ENV_DESCRIPTIONS = {
    1: "Center",
    2: "Bar ",
    3: "Bar ends",
    4: "Interbar",
    5: "Spiral arms inside interbar",
    6: "Spiral arms ",
    7: "Interarm",
    8: "Outer disc",
    9: "Interbar",
    10: "Disc"
};

let overviewLoadingStopped = false; // Added global flag

function loadCatalogs() {
    apiFetch('/list-catalogs/')
    .then(response => response.json())
    .then(data => {
        window.availableCatalogs = Array.isArray(data.catalogs) ? data.catalogs : [];
        if (typeof window.updateCatalogDropdown === 'function') {
            window.updateCatalogDropdown(window.availableCatalogs);
        }
    })
    .catch(error => {
        console.error('Error loading catalogs:', error);
    });
}

function getActiveViewerInstance() {
    const tryGetViewer = (ctx) => (ctx && (ctx.__ACTIVE_PANE_VIEWER || ctx.tiledViewer || ctx.viewer)) || null;
    const seen = new Set();
    let ctx = typeof window !== 'undefined' ? window : null;
    while (ctx && !seen.has(ctx)) {
        seen.add(ctx);
        const viewerCandidate = tryGetViewer(ctx);
        if (viewerCandidate) return viewerCandidate;
        if (ctx.parent && ctx.parent !== ctx) {
            try {
                ctx = ctx.parent;
                continue;
            } catch (_) {
                break;
            }
        }
        break;
    }
    const globalViewer = tryGetViewer(typeof globalThis !== 'undefined' ? globalThis : null);
    if (globalViewer) return globalViewer;
    const openerViewer = tryGetViewer(typeof window !== 'undefined' ? window.opener : null);
    if (openerViewer) return openerViewer;
    return null;
}

function getCurrentSessionId() {
    try {
        const sp = new URLSearchParams(window.location.search);
        return (window.__forcedSid) || sp.get('sid') || sp.get('pane_sid') || sessionStorage.getItem('sid');
    } catch (err) {
        try { return sessionStorage.getItem('sid'); } catch (_) { return null; }
    }
}

function clearSegmentOverlay(reason = 'reset') {
    if (segmentOverlayState && segmentOverlayState.tiledImage) {
        const activeViewer = getActiveViewerInstance();
        if (activeViewer && activeViewer.world) {
            try {
                activeViewer.world.removeItem(segmentOverlayState.tiledImage);
            } catch (err) {
                console.warn('[segments] Failed to remove overlay:', err);
            }
        }
    }
    setSegmentOverlayState(null);
    segmentOverlayMetadata = null;
    window.segmentOverlayMetadata = null;
    updateSegmentsPanelOverlayInfo();
    removeSegmentOverlayControls(true);
}

function removeSegmentOverlay(trigger = 'user') {
    if (!segmentOverlayState) return;
    clearSegmentOverlay(trigger);
    showNotification('Segment overlay removed', 1500, 'info');
}

function updateSegmentOverlayOpacity(value) {
    if (!segmentOverlayState || !segmentOverlayState.tiledImage) return;
    const clamped = Math.max(0, Math.min(1, Number(value)));
    segmentOverlayState.tiledImage.setOpacity(clamped);
    segmentOverlayState.opacity = clamped;
    updateSegmentsPanelOverlayInfo();
    syncSegmentOverlayControls();
}

async function fetchSegmentsList(forceRefresh = false) {
    if (!forceRefresh && Array.isArray(cachedSegmentsList)) {
        return cachedSegmentsList;
    }
    const response = await apiFetch('/segments/list/');
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    cachedSegmentsList = Array.isArray(data.segments) ? data.segments : [];
    return cachedSegmentsList;
}

function closeSegmentsPanel() {
    const panel = document.getElementById('segments-panel');
    if (panel) {
        panel.remove();
    }
    if (segmentsPanelCloseHandler) {
        document.removeEventListener('mousedown', segmentsPanelCloseHandler, true);
        segmentsPanelCloseHandler = null;
    }
}

function createSegmentsPanelElement() {
    const panel = document.createElement('div');
    panel.id = 'segments-panel';
    panel.style.position = 'absolute';
    panel.style.zIndex = '60010';
    panel.style.background = '#1f2937';
    panel.style.border = '1px solid #374151';
    panel.style.borderRadius = '8px';
    panel.style.padding = '14px';
    panel.style.width = '320px';
    panel.style.color = '#f3f4f6';
    panel.style.fontFamily = 'Arial, sans-serif';
    panel.style.boxShadow = '0 8px 16px rgba(0,0,0,0.4)';

    const toolbar = document.querySelector('.toolbar');
    if (toolbar) {
        const rect = toolbar.getBoundingClientRect();
        panel.style.left = `${rect.left + 10}px`;
        panel.style.top = `${rect.bottom + 8}px`;
    } else {
        panel.style.left = '20px';
        panel.style.top = '60px';
    }

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '8px';
    const title = document.createElement('strong');
    title.textContent = 'Segments';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.background = 'transparent';
    closeBtn.style.color = '#f3f4f6';
    closeBtn.style.border = 'none';
    closeBtn.style.fontSize = '18px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.addEventListener('click', () => closeSegmentsPanel());
    header.appendChild(title);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    const hint = document.createElement('div');
    hint.textContent = 'Place segmentation FITS files under files/segments/';
    hint.style.fontSize = '11px';
    hint.style.opacity = '0.8';
    hint.style.marginBottom = '10px';
    panel.appendChild(hint);

    const status = document.createElement('div');
    status.dataset.role = 'segments-status';
    status.style.fontSize = '12px';
    status.style.marginBottom = '10px';
    panel.appendChild(status);

    const opacityRow = document.createElement('div');
    opacityRow.style.display = 'flex';
    opacityRow.style.alignItems = 'center';
    opacityRow.style.gap = '8px';
    opacityRow.style.marginBottom = '10px';
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '1';
    slider.step = '0.05';
    slider.dataset.role = 'segments-opacity-slider';
    slider.addEventListener('input', (e) => updateSegmentOverlayOpacity(parseFloat(e.target.value)));
    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'Remove overlay';
    removeBtn.dataset.role = 'segments-remove-button';
    removeBtn.style.flex = '0 0 auto';
    removeBtn.addEventListener('click', () => removeSegmentOverlay('panel'));
    opacityRow.appendChild(slider);
    opacityRow.appendChild(removeBtn);
    panel.appendChild(opacityRow);

    const actionsRow = document.createElement('div');
    actionsRow.style.display = 'flex';
    actionsRow.style.justifyContent = 'space-between';
    actionsRow.style.alignItems = 'center';
    actionsRow.style.marginBottom = '10px';
    const refreshBtn = document.createElement('button');
    refreshBtn.textContent = 'Refresh list';
    refreshBtn.addEventListener('click', () => refreshSegmentsPanelList(true));
    actionsRow.appendChild(refreshBtn);
    panel.appendChild(actionsRow);

    const list = document.createElement('div');
    list.dataset.role = 'segments-list';
    list.style.maxHeight = '260px';
    list.style.overflowY = 'auto';
    list.style.display = 'flex';
    list.style.flexDirection = 'column';
    list.style.gap = '6px';
    list.textContent = 'Loading segments...';
    panel.appendChild(list);

    panel.addEventListener('mousedown', (e) => e.stopPropagation());
    document.body.appendChild(panel);

    segmentsPanelCloseHandler = (evt) => {
        const target = evt.target;
        if (!panel.contains(target)) {
            closeSegmentsPanel();
        }
    };
    document.addEventListener('mousedown', segmentsPanelCloseHandler, true);
    return panel;
}

function updateSegmentsPanelOverlayInfo() {
    const panel = document.getElementById('segments-panel');
    if (!panel) return;
    const status = panel.querySelector('[data-role="segments-status"]');
    const slider = panel.querySelector('[data-role="segments-opacity-slider"]');
    const removeBtn = panel.querySelector('[data-role="segments-remove-button"]');
    if (status) {
        if (segmentOverlayState && segmentOverlayState.name) {
            const opacityText = segmentOverlayState.opacity !== undefined ? segmentOverlayState.opacity.toFixed(2) : DEFAULT_SEGMENT_OVERLAY_OPACITY.toFixed(2);
            const colorMapName = segmentOverlayState.colorMap || segmentOverlayPreferences.colorMap || 'labels';
            status.textContent = `Active: ${segmentOverlayState.name} (opacity ${opacityText}, map ${colorMapName})`;
        } else {
            status.textContent = 'No segment overlay active';
        }
    }
    if (slider) {
        slider.disabled = !(segmentOverlayState && segmentOverlayState.tiledImage);
        slider.value = segmentOverlayState ? (segmentOverlayState.opacity ?? DEFAULT_SEGMENT_OVERLAY_OPACITY) : DEFAULT_SEGMENT_OVERLAY_OPACITY;
        slider.style.background = `linear-gradient(90deg, #22d3ee ${slider.value * 100}%, rgba(99,102,241,0.3) ${slider.value * 100}%)`;
    }
    if (removeBtn) {
        removeBtn.disabled = !(segmentOverlayState && segmentOverlayState.tiledImage);
    }
    syncSegmentOverlayControls();
}

function renderSegmentsList(panel, segments) {
    const list = panel.querySelector('[data-role="segments-list"]');
    if (!list) return;
    list.innerHTML = '';
    if (!segments || segments.length === 0) {
        const empty = document.createElement('div');
        empty.textContent = 'No segment FITS files found in files/segments/';
        empty.style.opacity = '0.8';
        empty.style.fontSize = '12px';
        list.appendChild(empty);
        return;
    }
    segments.forEach(segment => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.flexDirection = 'column';
        row.style.padding = '8px';
        row.style.border = '1px solid #374151';
        row.style.borderRadius = '6px';
        row.style.background = '#111827';

        const nameLine = document.createElement('div');
        nameLine.style.display = 'flex';
        nameLine.style.justifyContent = 'space-between';
        nameLine.style.alignItems = 'center';
        nameLine.style.gap = '8px';

        const name = document.createElement('span');
        name.textContent = segment.name;
        name.style.fontSize = '13px';
        name.style.fontWeight = '600';
        name.style.flex = '1';

        const loadBtn = document.createElement('button');
        loadBtn.textContent = 'Overlay';
        loadBtn.style.flex = '0 0 auto';
        loadBtn.addEventListener('click', () => loadSegmentOverlay(segment.name));

        nameLine.appendChild(name);
        nameLine.appendChild(loadBtn);

        const meta = document.createElement('div');
        meta.style.fontSize = '11px';
        meta.style.opacity = '0.8';
        const sizeText = typeof formatMemorySize === 'function' ? formatMemorySize(segment.size || 0) : `${Math.round((segment.size || 0)/1024)} KB`;
        const modified = segment.modified ? new Date(segment.modified * 1000).toLocaleString() : 'unknown';
        meta.textContent = `Size: ${sizeText} · Updated: ${modified}`;

        row.appendChild(nameLine);
        row.appendChild(meta);
        list.appendChild(row);
    });
}

async function refreshSegmentsPanelList(forceRefresh = false) {
    const panel = document.getElementById('segments-panel');
    if (!panel) return;
    const list = panel.querySelector('[data-role="segments-list"]');
    if (list) {
        list.textContent = 'Loading segments...';
    }
    try {
        const segments = await fetchSegmentsList(forceRefresh);
        renderSegmentsList(panel, segments);
    } catch (err) {
        console.error('[segments] Failed to fetch list', err);
        if (list) {
            list.textContent = `Failed to load segments: ${err.message}`;
        }
    }
}

function openSegmentsPanel() {
    const panel = createSegmentsPanelElement();
    updateSegmentsPanelOverlayInfo();
    refreshSegmentsPanelList(false);
}

function toggleSegmentsPanel(forceState = null) {
    const panel = document.getElementById('segments-panel');
    if (panel && (forceState === null || forceState === false)) {
        closeSegmentsPanel();
        return;
    }
    closeSegmentsPanel();
    openSegmentsPanel();
}

function removeSegmentOverlayControls(force = false) {
    const hostDoc = getTopLevelDocument();
    const panel = hostDoc.getElementById('segment-overlay-controls');
    if (panel) {
        const paneId = window.__paneSyncId || 'root';
        const ownerId = panel.dataset.ownerId || hostDoc.defaultView?.__segmentPanelOwnerId || null;
        if (force || !ownerId || ownerId === paneId) {
            try {
                if (typeof panel.__segmentsCleanup === 'function') {
                    panel.__segmentsCleanup();
                }
            } catch (_) {}
            panel.remove();
            try {
                if (hostDoc.defaultView) {
                    hostDoc.defaultView.__segmentPanelOwnerId = null;
                }
            } catch (_) {}
        } else {
            return;
        }
    }
    segmentOverlayControlsCollapsed = false;
    window.segmentOverlayControlsCollapsed = segmentOverlayControlsCollapsed;
}

function syncSegmentOverlayControls() {
    const hostDoc = getTopLevelDocument();
    const panel = hostDoc.getElementById('segment-overlay-controls');
    if (!panel) return;
    const slider = panel.querySelector('input[data-role="segment-opacity-slider"]');
    const valueLabel = panel.querySelector('span[data-role="segment-opacity-value"]');
    const value = segmentOverlayState ? (segmentOverlayState.opacity ?? DEFAULT_SEGMENT_OVERLAY_OPACITY) : DEFAULT_SEGMENT_OVERLAY_OPACITY;
    if (slider) {
        slider.disabled = !(segmentOverlayState && segmentOverlayState.tiledImage);
        slider.value = value;
        slider.style.background = `linear-gradient(90deg, #22d3ee ${value * 100}%, rgba(99,102,241,0.3) ${value * 100}%)`;
    }
    if (valueLabel) valueLabel.textContent = value.toFixed(2);
    const select = panel.querySelector('select[data-role="segment-color-map"]');
    if (select) {
        const colorMapValue = segmentOverlayPreferences.colorMap || 'labels';
        select.value = colorMapValue;
        const preview = panel.querySelector('.segment-colorbar-preview');
        const option = getSegmentColorMapOptions().find(opt => String(opt.value) === String(colorMapValue));
        if (preview) {
            const gradient = option && option.gradient ? option.gradient : 'linear-gradient(90deg, #e5e7eb, #111827)';
            preview.style.background = gradient;
        }
    }
}

function renderSegmentOverlayControls(info) {
    if (info) {
        segmentOverlayMetadata = { ...info };
        window.segmentOverlayMetadata = segmentOverlayMetadata;
    } else if (segmentOverlayMetadata) {
        info = { ...segmentOverlayMetadata };
    }
    const isPaneContext = !!(window.parent && window.parent !== window);
    const canControlPanel = !isPaneContext || !!window.__wcsIsActivePane;
    if (!canControlPanel) return;
    removeSegmentOverlayControls(true);
    if (!segmentOverlayState || !segmentOverlayState.tiledImage) return;
    const hostDoc = getTopLevelDocument();
    if (!hostDoc || !hostDoc.body) return;
    if (!info) {
        info = {
            color_map: segmentOverlayState.colorMap || segmentOverlayPreferences.colorMap || 'labels',
            segment_name: segmentOverlayState.name
        };
    }
    const colorMapOptions = getSegmentColorMapOptions();
    const selectedColorMap = info?.color_map || segmentOverlayPreferences.colorMap || 'labels';
    const createEl = (tag) => hostDoc.createElement(tag);

    const panel = createEl('div');
    panel.id = 'segment-overlay-controls';
    Object.assign(panel.style, {
        background: 'rgba(17,24,39,0.95)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '12px',
        padding: '12px 20px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.45)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: '10px',
        zIndex: '60020',
        color: '#f9fafb',
        fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
        minWidth: '260px',
        pointerEvents: 'auto'
    });

    const headerRow = createEl('div');
    Object.assign(headerRow.style, {
        display: 'flex',
        width: '100%',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '10px'
    });
    const titleLabel = createEl('span');
    const overlayName = info?.segment_name || segmentOverlayState.name || 'Segment';
    titleLabel.textContent = `Segments · ${overlayName}`;
    titleLabel.style.fontSize = '13px';
    titleLabel.style.fontWeight = '600';
    titleLabel.style.whiteSpace = 'nowrap';
    titleLabel.style.overflow = 'hidden';
    titleLabel.style.textOverflow = 'ellipsis';
    const collapseBtn = createEl('button');
    collapseBtn.type = 'button';
    collapseBtn.textContent = '×';
    Object.assign(collapseBtn.style, {
        border: 'none',
        background: 'rgba(255,255,255,0.08)',
        color: '#f9fafb',
        width: '24px',
        height: '24px',
        borderRadius: '50%',
        cursor: 'pointer',
        fontSize: '14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 150ms ease'
    });
    collapseBtn.addEventListener('mouseenter', () => collapseBtn.style.background = 'rgba(255,255,255,0.18)');
    collapseBtn.addEventListener('mouseleave', () => collapseBtn.style.background = 'rgba(255,255,255,0.08)');
    collapseBtn.setAttribute('aria-label', 'Collapse segments controls');
    headerRow.append(titleLabel, collapseBtn);
    panel.appendChild(headerRow);

    const expandedContent = createEl('div');
    Object.assign(expandedContent.style, {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
        gap: '10px',
        transition: 'opacity 200ms ease, max-height 220ms ease',
        overflow: 'visible',
        maxHeight: '600px'
    });
    panel.appendChild(expandedContent);

    const setCollapsedState = (collapsed) => {
        segmentOverlayControlsCollapsed = collapsed;
        window.segmentOverlayControlsCollapsed = collapsed;
        panel.dataset.state = collapsed ? 'collapsed' : 'expanded';
        if (collapsed) {
            expandedContent.style.opacity = '0';
            expandedContent.style.maxHeight = '0px';
            expandedContent.style.pointerEvents = 'none';
            expandedContent.style.overflow = 'hidden';
            panel.style.padding = '6px 12px';
            panel.style.minWidth = 'auto';
            collapseBtn.textContent = '➕';
            collapseBtn.setAttribute('aria-label', 'Show segments controls');
        } else {
            expandedContent.style.opacity = '1';
            expandedContent.style.maxHeight = '600px';
            expandedContent.style.pointerEvents = 'auto';
            expandedContent.style.overflow = 'visible';
            panel.style.padding = '12px 20px';
            panel.style.minWidth = '260px';
            collapseBtn.textContent = '×';
            collapseBtn.setAttribute('aria-label', 'Collapse segments controls');
        }
        // Use requestAnimationFrame to ensure DOM has updated before recalculating positions
        requestAnimationFrame(() => {
            positionSegmentControlsPanel(panel);
        });
    };

    collapseBtn.addEventListener('click', () => {
        setCollapsedState(!segmentOverlayControlsCollapsed);
    });

    const sliderRow = createEl('div');
    sliderRow.style.display = 'flex';
    sliderRow.style.alignItems = 'center';
    sliderRow.style.gap = '10px';

    const slider = createEl('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '1';
    slider.step = '0.05';
    slider.dataset.role = 'segment-opacity-slider';
    slider.value = segmentOverlayState.opacity ?? DEFAULT_SEGMENT_OVERLAY_OPACITY;
    Object.assign(slider.style, {
        width: '220px',
        appearance: 'none',
        height: '4px',
        borderRadius: '999px',
        background: `linear-gradient(90deg, #22d3ee ${(segmentOverlayState.opacity ?? DEFAULT_SEGMENT_OVERLAY_OPACITY) * 100}%, rgba(99,102,241,0.3) ${(segmentOverlayState.opacity ?? DEFAULT_SEGMENT_OVERLAY_OPACITY) * 100}%)`
    });
    slider.addEventListener('input', (e) => {
        e.target.style.background = `linear-gradient(90deg, #22d3ee ${e.target.value * 100}%, rgba(99,102,241,0.3) ${e.target.value * 100}%)`;
        const value = parseFloat(e.target.value);
        updateSegmentOverlayOpacity(value);
        const label = panel.querySelector('span[data-role="segment-opacity-value"]');
        if (label) label.textContent = value.toFixed(2);
    });
    sliderRow.appendChild(slider);

    const sliderValue = createEl('span');
    sliderValue.dataset.role = 'segment-opacity-value';
    sliderValue.style.fontSize = '12px';
    sliderValue.style.width = '40px';
    sliderValue.style.textAlign = 'right';
    sliderValue.textContent = (segmentOverlayState.opacity ?? DEFAULT_SEGMENT_OVERLAY_OPACITY).toFixed(2);
    sliderRow.appendChild(sliderValue);
    expandedContent.appendChild(sliderRow);

    const paletteContainer = createEl('div');
    paletteContainer.style.width = '100%';
    let selectEl = null;
    if (typeof createSearchableDropdown === 'function') {
        const dropdown = createSearchableDropdown(
            'Color Map:',
            'segment-color-map-select',
            colorMapOptions,
            'segmentOverlayColorMapSelection',
            selectedColorMap,
            true
        );
        selectEl = dropdown.querySelector('select');
        paletteContainer.appendChild(dropdown);
    } else {
        const label = createEl('label');
        label.textContent = 'Color Map:';
        Object.assign(label.style, { fontSize: '12px', color: '#d1d5db', marginBottom: '4px', display: 'block' });
        const select = createEl('select');
        Object.assign(select.style, {
            width: '100%',
            padding: '8px',
            background: '#1f2937',
            color: '#f3f4f6',
            borderRadius: '6px',
            border: '1px solid rgba(255,255,255,0.12)'
        });
        colorMapOptions.forEach(option => {
            const opt = createEl('option');
            opt.value = option.value;
            opt.textContent = option.label;
            select.appendChild(opt);
        });
        select.value = selectedColorMap;
        paletteContainer.appendChild(label);
        paletteContainer.appendChild(select);
        selectEl = select;
    }
    if (selectEl) {
        selectEl.dataset.role = 'segment-color-map';
    }
    expandedContent.appendChild(paletteContainer);

    if (selectEl) {
        selectEl.value = selectedColorMap;
        selectEl.addEventListener('change', (e) => {
            const newValue = e.target.value;
            applySegmentOverlayColorMap(newValue);
        });
    }

    const actionRow = createEl('div');
    actionRow.style.display = 'flex';
    actionRow.style.gap = '10px';
    const removeBtn = createEl('button');
    removeBtn.textContent = 'Remove';
    removeBtn.style.all = 'unset';
    removeBtn.style.cursor = 'pointer';
    removeBtn.style.fontSize = '12px';
    removeBtn.style.padding = '4px 10px';
    removeBtn.style.borderRadius = '999px';
    removeBtn.style.background = 'rgba(239,68,68,0.18)';
    removeBtn.style.color = '#fca5a5';
    removeBtn.addEventListener('click', () => removeSegmentOverlay('controls'));
    actionRow.appendChild(removeBtn);
    expandedContent.appendChild(actionRow);

    hostDoc.body.appendChild(panel);
    const paneId = window.__paneSyncId || 'root';
    panel.dataset.ownerId = paneId;
    try {
        if (hostDoc.defaultView) {
            hostDoc.defaultView.__segmentPanelOwnerId = paneId;
        }
    } catch (_) {}
    const reposition = () => positionSegmentControlsPanel(panel);
    reposition();
    const resizeTargets = [];
    if (typeof window !== 'undefined') resizeTargets.push(window);
    try {
        const topWin = window.top;
        if (topWin && topWin !== window && !resizeTargets.includes(topWin)) resizeTargets.push(topWin);
    } catch (_) {}
    resizeTargets.forEach((target) => {
        try { target.addEventListener('resize', reposition); } catch (_) {}
    });
    panel.__segmentsCleanup = () => {
        resizeTargets.forEach((target) => {
            try { target.removeEventListener('resize', reposition); } catch (_) {}
        });
    };

    setCollapsedState(!!segmentOverlayControlsCollapsed);
    syncSegmentOverlayControls();
}

// ---------------- Catalog Overlay Controls (bottom-center, per active pane) ----------------
let catalogOverlayControlsCollapsed = false;

// ---------------- Catalog boolean-column filtering (per catalog) ----------------
function __catalogFilterRootWin() {
    // Filters must be PER-PANE. Do not store them on `window.top`, otherwise
    // changing a filter in one pane affects the other pane (and can prevent
    // the other pane from fetching needed column values).
    return window;
}

function __normalizeCatalogKey(raw) {
    try {
        const s = String(raw || '').trim();
        if (!s) return '';
        if (s.startsWith('catalogs/')) return s;
        const base = s.split('/').pop().split('\\').pop();
        return base ? `catalogs/${base}` : s;
    } catch (_) {
        return String(raw || '');
    }
}

function __ensureCatalogBooleanFilterStore() {
    try {
        // IMPORTANT: In multi-panel mode, the renderer lives in an iframe but reads filter stores
        // from `window.top` (see `canvas.js`). Store filters on the root window so they apply.
        const rootWin = __catalogFilterRootWin();
        if (!rootWin.catalogBooleanFiltersByCatalog || typeof rootWin.catalogBooleanFiltersByCatalog !== 'object') {
            rootWin.catalogBooleanFiltersByCatalog = {};
        }
        return rootWin.catalogBooleanFiltersByCatalog;
    } catch (_) {
        // If window is not writable for some reason, fall back to a local store
        if (!__ensureCatalogBooleanFilterStore.__fallback) __ensureCatalogBooleanFilterStore.__fallback = {};
        return __ensureCatalogBooleanFilterStore.__fallback;
    }
}

function __ensureCatalogBooleanUiStateStore() {
    try {
        // UI state must also live on the root window so controls and renderer stay in sync
        const rootWin = __catalogFilterRootWin();
        if (!rootWin.__catalogBooleanFilterUiState || typeof rootWin.__catalogBooleanFilterUiState !== 'object') {
            rootWin.__catalogBooleanFilterUiState = { openKey: null, colsCache: {}, numColsCache: {} };
        }
        if (!rootWin.__catalogBooleanFilterUiState.colsCache) rootWin.__catalogBooleanFilterUiState.colsCache = {};
        if (!rootWin.__catalogBooleanFilterUiState.numColsCache) rootWin.__catalogBooleanFilterUiState.numColsCache = {};
        if (!rootWin.__catalogBooleanFilterUiState.allColsCache) rootWin.__catalogBooleanFilterUiState.allColsCache = {};
        return rootWin.__catalogBooleanFilterUiState;
    } catch (_) {
        if (!__ensureCatalogBooleanUiStateStore.__fallback) __ensureCatalogBooleanUiStateStore.__fallback = { openKey: null, colsCache: {}, numColsCache: {}, allColsCache: {} };
        return __ensureCatalogBooleanUiStateStore.__fallback;
    }
}

function __coerceBooleanLike(v) {
    if (v == null) return null;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') {
        if (v === 1) return true;
        if (v === 0) return false;
        return null;
    }
    if (typeof v === 'string') {
        const s = v.trim().toUpperCase();
        if (s === 'T' || s === 'TRUE' || s === 'YES' || s === 'Y' || s === '1') return true;
        if (s === 'F' || s === 'FALSE' || s === 'NO' || s === 'N' || s === '0') return false;
        return null;
    }
    return null;
}

function __detectBooleanColumnsForCatalog(catalogKey) {
    try {
        const key = __normalizeCatalogKey(String(catalogKey || ''));
        if (!key) return [];

        // Prefer per-catalog overlay store (contains the original record fields).
        let rows = null;
        try {
            if (window.catalogOverlaysByCatalog && window.catalogOverlaysByCatalog[key]) {
                const arr = window.catalogOverlaysByCatalog[key];
                if (Array.isArray(arr) && arr.length) rows = arr;
            }
        } catch (_) {}
        // Fallback: scan combined overlay (visible catalogs only).
        if (!rows) {
            try {
                const all = window.catalogDataForOverlay;
                if (Array.isArray(all) && all.length) {
                    rows = all.filter(r => r && (String(r.__catalogName || r.catalog_name || r.catalog || '') === key));
                }
            } catch (_) {}
        }
        if (!rows || !rows.length) return [];

        // Keys we should ignore (common renderer/style fields)
        const ignore = new Set([
            'x', 'y', 'ra', 'dec', 'index', 'radius', 'radius_pixels', 'size_pixels', 'size_arcsec',
            'opacity', 'color', 'fillColor', 'useTransparentFill', 'border_width', 'shape',
            'catalog_name', '__catalogName', 'passesFilter', 'colorCodeColumn', 'colorCodeValue', 'colorMapName'
        ]);

        const maxRows = Math.min(250, rows.length);
        const stats = new Map(); // col -> { seen, trueCount, falseCount, badCount }

        for (let i = 0; i < maxRows; i++) {
            const r = rows[i];
            if (!r || typeof r !== 'object') continue;
            const keys = Object.keys(r);
            for (const k of keys) {
                if (!k) continue;
                if (ignore.has(k)) continue;
                // Skip internal fields
                if (k.startsWith('_')) continue;
                const v = r[k];
                if (v == null) continue;
                const b = __coerceBooleanLike(v);
                let st = stats.get(k);
                if (!st) { st = { seen: 0, trueCount: 0, falseCount: 0, badCount: 0 }; stats.set(k, st); }
                st.seen++;
                if (b === true) st.trueCount++;
                else if (b === false) st.falseCount++;
                else st.badCount++;
            }
        }

        const cols = [];
        stats.forEach((st, col) => {
            // Consider boolean-like if we saw enough values and none were "bad"
            if (st.seen >= 3 && st.badCount === 0 && (st.trueCount + st.falseCount) >= 3) {
                cols.push(col);
            }
        });
        cols.sort((a, b) => a.localeCompare(b));
        return cols;
    } catch (_) {
        return [];
    }
}

function __getBooleanColumnsCached(catalogKey) {
    try {
        const key = String(catalogKey || '');
        if (!key) return [];
        const ui = __ensureCatalogBooleanUiStateStore();
        const cache = ui.colsCache || {};
        const cacheEntry = cache[key];
        const now = Date.now();

        // Try to use overlay length as a cheap invalidation key.
        let n = null;
        try {
            const arr = window.catalogOverlaysByCatalog && window.catalogOverlaysByCatalog[key];
            if (Array.isArray(arr)) n = arr.length;
        } catch (_) {}

        if (cacheEntry && Array.isArray(cacheEntry.cols)) {
            const ageOk = (now - (cacheEntry.ts || 0)) < 15000;
            const lenOk = (n == null) || (cacheEntry.n === n);
            if (ageOk && lenOk) return cacheEntry.cols;
        }

        // Prefer backend-provided list per-catalog (from /catalog-binary header).
        // This avoids needing boolean values to be embedded in each record.
        try {
            const metaBy = (window.catalogMetadataByCatalog && window.catalogMetadataByCatalog[key]) || null;
            const meta = metaBy || window.catalogMetadata || null;
            if (meta && Array.isArray(meta.boolean_columns) && meta.boolean_columns.length) {
                const cols = meta.boolean_columns.map(String).filter(Boolean).sort((a,b)=>a.localeCompare(b));
                cache[key] = { cols, ts: now, n };
                ui.colsCache = cache;
                return cols;
            }
        } catch (_) {}

        const cols = __detectBooleanColumnsForCatalog(key);
        cache[key] = { cols, ts: now, n };
        ui.colsCache = cache;
        return cols;
    } catch (_) {
        return [];
    }
}

// ---------------- Catalog numeric-condition filtering (per catalog) ----------------
function __ensureCatalogConditionFilterStore() {
    try {
        const rootWin = __catalogFilterRootWin();
        if (!rootWin.catalogConditionFiltersByCatalog || typeof rootWin.catalogConditionFiltersByCatalog !== 'object') {
            rootWin.catalogConditionFiltersByCatalog = {};
        }
        return rootWin.catalogConditionFiltersByCatalog;
    } catch (_) {
        if (!__ensureCatalogConditionFilterStore.__fallback) __ensureCatalogConditionFilterStore.__fallback = {};
        return __ensureCatalogConditionFilterStore.__fallback;
    }
}

function __detectNumericColumnsForCatalog(catalogKey) {
    try {
        const key = __normalizeCatalogKey(String(catalogKey || ''));
        if (!key) return [];

        // Prefer per-catalog overlay store (contains original record fields)
        let rows = null;
        try {
            if (window.catalogOverlaysByCatalog && window.catalogOverlaysByCatalog[key]) {
                const arr = window.catalogOverlaysByCatalog[key];
                if (Array.isArray(arr) && arr.length) rows = arr;
            }
        } catch (_) {}
        if (!rows) {
            try {
                const all = window.catalogDataForOverlay;
                if (Array.isArray(all) && all.length) {
                    rows = all.filter(r => r && (String(r.__catalogName || r.catalog_name || r.catalog || '') === key));
                }
            } catch (_) {}
        }
        if (!rows || !rows.length) return [];

        const ignore = new Set([
            'x', 'y', 'ra', 'dec', 'index', 'radius', 'radius_pixels', 'size_pixels', 'size_arcsec',
            'opacity', 'color', 'fillColor', 'useTransparentFill', 'border_width', 'shape',
            'catalog_name', '__catalogName', 'passesFilter', 'colorCodeColumn', 'colorCodeValue', 'colorMapName'
        ]);

        const maxRows = Math.min(300, rows.length);
        const stats = new Map(); // col -> { seen, numeric, bad }

        const coerceNum = (v) => {
            if (v == null) return null;
            if (typeof v === 'number') return Number.isFinite(v) ? v : null;
            if (typeof v === 'boolean') return null;
            if (typeof v === 'string') {
                const s = v.trim();
                if (!s) return null;
                const n = Number(s);
                return Number.isFinite(n) ? n : null;
            }
            return null;
        };

        for (let i = 0; i < maxRows; i++) {
            const r = rows[i];
            if (!r || typeof r !== 'object') continue;
            const keys = Object.keys(r);
            for (const k of keys) {
                if (!k) continue;
                if (ignore.has(k)) continue;
                if (k.startsWith('_')) continue;
                const v = r[k];
                if (v == null) continue;
                let st = stats.get(k);
                if (!st) { st = { seen: 0, numeric: 0, bad: 0 }; stats.set(k, st); }
                st.seen++;
                const n = coerceNum(v);
                if (n == null) st.bad++;
                else st.numeric++;
            }
        }

        const cols = [];
        stats.forEach((st, col) => {
            if (st.seen < 5) return;
            // Treat as numeric if most observed values were numeric
            const ratio = st.numeric / Math.max(1, st.seen);
            if (st.numeric >= 5 && ratio >= 0.8) cols.push(col);
        });
        cols.sort((a, b) => a.localeCompare(b));
        return cols;
    } catch (_) {
        return [];
    }
}

function __getNumericColumnsCached(catalogKey) {
    try {
        const key = String(catalogKey || '');
        if (!key) return [];
        const ui = __ensureCatalogBooleanUiStateStore();
        const cache = ui.numColsCache || {};
        const cacheEntry = cache[key];
        const now = Date.now();

        let n = null;
        try {
            const arr = window.catalogOverlaysByCatalog && window.catalogOverlaysByCatalog[key];
            if (Array.isArray(arr)) n = arr.length;
        } catch (_) {}

        if (cacheEntry && Array.isArray(cacheEntry.cols)) {
            const ageOk = (now - (cacheEntry.ts || 0)) < 15000;
            const lenOk = (n == null) || (cacheEntry.n === n);
            if (ageOk && lenOk) return cacheEntry.cols;
        }

        const cols = __detectNumericColumnsForCatalog(key);
        cache[key] = { cols, ts: now, n };
        ui.numColsCache = cache;
        return cols;
    } catch (_) {
        return [];
    }
}

// ---------------- Catalog column list (for Conditions UI) ----------------
function __getAllCatalogColumnsCached(catalogKey) {
    try {
        const key = __normalizeCatalogKey(String(catalogKey || ''));
        if (!key) return [];
        const ui = __ensureCatalogBooleanUiStateStore();
        const cache = ui.allColsCache || {};
        const cacheEntry = cache[key];
        const now = Date.now();

        // Try to read from overlay objects (fast, includes dotted names).
        try {
            const arr = window.catalogOverlaysByCatalog && window.catalogOverlaysByCatalog[key];
            if (Array.isArray(arr) && arr.length) {
                for (let i = 0; i < Math.min(5, arr.length); i++) {
                    const r = arr[i];
                    if (r && Array.isArray(r.__catalog_columns) && r.__catalog_columns.length) {
                        const cols = r.__catalog_columns.map(String).filter(Boolean);
                        cols.sort((a, b) => a.localeCompare(b));
                        cache[key] = { cols, ts: now, n: arr.length };
                        ui.allColsCache = cache;
                        return cols;
                    }
                }
            }
        } catch (_) {}

        // Use cached backend response if fresh.
        if (cacheEntry && Array.isArray(cacheEntry.cols)) {
            const ageOk = (now - (cacheEntry.ts || 0)) < 60000;
            if (ageOk) return cacheEntry.cols;
        }

        // Kick off async fetch once; UI will re-render when complete.
        if (!cacheEntry || !cacheEntry.inflight) {
            const inflight = (async () => {
                try {
                    const apiName = String(key || '').replace(/^catalogs\//, '');
                    const resp = await apiFetch(`/catalog-columns/?catalog_name=${encodeURIComponent(apiName)}`);
                    const j = await resp.json();
                    const cols = (j && Array.isArray(j.columns)) ? j.columns.map(String).filter(Boolean) : [];
                    cols.sort((a, b) => a.localeCompare(b));
                    cache[key] = { cols, ts: Date.now() };
                    ui.allColsCache = cache;
                } catch (_) {
                    cache[key] = { cols: [], ts: Date.now() };
                    ui.allColsCache = cache;
                }
                // Re-render controls to show populated columns
                try { renderCatalogOverlayControls(); } catch (_) {}
            })();
            cache[key] = { cols: [], ts: now, inflight };
            ui.allColsCache = cache;
        }

        return [];
    } catch (_) {
        return [];
    }
}

// Fetch and attach column values to overlay objects (by __row_index).
async function __ensureCatalogColumnsLoaded(catalogKey, columns) {
    const key = __normalizeCatalogKey(String(catalogKey || ''));
    const cols = Array.isArray(columns) ? columns.map(String).filter(Boolean) : [String(columns || '')].filter(Boolean);
    if (!key || !cols.length) return;

    // Root window holds the "loaded columns" flags because `canvas.js` reads it from there.
    const rootWin = __catalogFilterRootWin();

    // In multi-pane mode the overlay data may live in a different window (e.g. iframe).
    // Try to find the window that owns the overlay objects for this catalog.
    const hostWin = (() => {
        try {
            if (window.catalogOverlaysByCatalog && window.catalogOverlaysByCatalog[key]) return window;
        } catch (_) {}
        try {
            if (window.top && window.top !== window && window.top.catalogOverlaysByCatalog && window.top.catalogOverlaysByCatalog[key]) return window.top;
        } catch (_) {}
        return window;
    })();

    // Track which columns we already loaded for this catalog (client-side only)
    if (!rootWin.__catalogLoadedValueCols) rootWin.__catalogLoadedValueCols = {};
    if (!rootWin.__catalogLoadedValueCols[key]) rootWin.__catalogLoadedValueCols[key] = {};

    const need = cols.filter(c => !rootWin.__catalogLoadedValueCols[key][c]);
    if (!need.length) return;

    // Overlay store to update
    const arr = (hostWin.catalogOverlaysByCatalog && hostWin.catalogOverlaysByCatalog[key]) ? hostWin.catalogOverlaysByCatalog[key] : null;
    if (!Array.isArray(arr) || !arr.length) return;

    // Debug helper (opt-in by setting window.__catalogFilterDebug = true in console)
    const dbg = (() => { try { return !!(window.__catalogFilterDebug || hostWin.__catalogFilterDebug); } catch (_) { return false; } })();
    const dbgPrefix = `[catalog-filters][ensureCols]`;
    if (dbg) {
        try {
            console.debug(`${dbgPrefix} start`, {
                catalogKey: key,
                requested: cols,
                need,
                overlays: arr.length,
                hostWin: (hostWin === window ? 'window' : (hostWin === window.top ? 'top' : 'other'))
            });
        } catch (_) {}
    }

    // Collect row indices from overlay objects
    // Prefer __row_index (original FITS row). Fall back to sourceIndex/index if needed.
    const rowIdxs = [];
    const posByRow = new Map(); // row_index -> list of overlay positions
    for (let i = 0; i < arr.length; i++) {
        const r = arr[i];
        let ri = r && r.__row_index;
        if (!Number.isInteger(ri)) {
            ri = (r && Number.isInteger(r.sourceIndex)) ? r.sourceIndex : (r && Number.isInteger(r.index) ? r.index : null);
        }
        if (!Number.isInteger(ri)) continue;
        rowIdxs.push(ri);
        if (!posByRow.has(ri)) posByRow.set(ri, []);
        posByRow.get(ri).push(i);
    }
    if (!rowIdxs.length) return;

    const apiName = String(key).replace(/^catalogs\//, '');
    const CHUNK = 20000; // frontend chunk size; backend now has no hard limit
    const received = new Set();
    const assignedAnyByCol = Object.create(null);
    const assignedNonNullByCol = Object.create(null);
    for (const col of need) {
        assignedAnyByCol[col] = 0;
        assignedNonNullByCol[col] = 0;
    }
    for (let start = 0; start < rowIdxs.length; start += CHUNK) {
        const chunkIdxs = rowIdxs.slice(start, start + CHUNK);
        if (dbg) {
            try {
                console.debug(`${dbgPrefix} POST /catalog-column-values/`, {
                    apiName,
                    chunkStart: start,
                    chunkSize: chunkIdxs.length,
                    need
                });
            } catch (_) {}
        }
        const resp = await apiFetch('/catalog-column-values/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ catalog_name: apiName, row_indices: chunkIdxs, columns: need })
        });
        const data = await resp.json();
        if (!resp.ok) {
            throw new Error((data && (data.detail || data.error)) ? (data.detail || data.error) : `Failed to fetch column values (HTTP ${resp.status})`);
        }

        const outIdxs = Array.isArray(data.row_indices) ? data.row_indices : [];
        const outCols = Array.isArray(data.columns) ? data.columns : [];
        const values = (data && data.values && typeof data.values === 'object') ? data.values : {};
        for (const c of outCols) received.add(String(c));

        if (dbg) {
            try {
                console.debug(`${dbgPrefix} response`, {
                    http: resp.status,
                    outIdxs: outIdxs.length,
                    outCols,
                    valueKeys: Object.keys(values).slice(0, 40)
                });
            } catch (_) {}
        }

        // Build quick lookup: row_index -> offset in out arrays
        const offsetByRow = new Map();
        for (let i = 0; i < outIdxs.length; i++) offsetByRow.set(outIdxs[i], i);

        // Build case-insensitive key map for `values` (backend may return different key case)
        const valuesKeyByLower = new Map();
        try {
            for (const k of Object.keys(values)) valuesKeyByLower.set(String(k).toLowerCase(), k);
        } catch (_) {}

        for (const col of need) {
            let valKey = null;
            if (Array.isArray(values[col])) {
                valKey = col;
            } else {
                const k2 = valuesKeyByLower.get(String(col).toLowerCase());
                if (k2 && Array.isArray(values[k2])) valKey = k2;
            }
            const colArr = valKey ? values[valKey] : null;
            if (!Array.isArray(colArr)) continue;

            for (const ri of outIdxs) {
                const off = offsetByRow.get(ri);
                if (off == null) continue;
                const v = colArr[off];
                const positions = posByRow.get(ri);
                if (!positions) continue;
                for (const p of positions) {
                    try { arr[p][col] = v; } catch (_) {}
                }
                assignedAnyByCol[col] = (assignedAnyByCol[col] || 0) + 1;
                if (v !== null && typeof v !== 'undefined') {
                    assignedNonNullByCol[col] = (assignedNonNullByCol[col] || 0) + 1;
                }
            }
        }
    }

    // Only mark columns as loaded if the server actually returned them (prevents false "loaded" state).
    for (const col of need) {
        const ok = received.has(String(col)) || received.has(String(col).toLowerCase()) || Array.from(received).some(c => c.toLowerCase() === String(col).toLowerCase());
        if (!ok) {
            throw new Error(`Column not found in catalog: ${col}`);
        }
        const any = assignedAnyByCol[col] || 0;
        const nonNull = assignedNonNullByCol[col] || 0;
        if (dbg) {
            try { console.debug(`${dbgPrefix} stats`, { col, assignedAny: any, assignedNonNull: nonNull }); } catch (_) {}
        }
        // If we couldn't assign anything, we definitely didn't load values.
        if (any <= 0) {
            throw new Error(`Failed to populate column values for: ${col} (no assignments)`);
        }
        // If all assigned values are null/undefined, treat as "not loaded" to avoid hiding everything.
        if (nonNull <= 0) {
            throw new Error(`Failed to populate column values for: ${col} (all values are null/undefined)`);
        }
        rootWin.__catalogLoadedValueCols[key][col] = true;
    }

    if (dbg) {
        try {
            console.debug(`${dbgPrefix} done`, { catalogKey: key, loaded: need.slice() });
        } catch (_) {}
    }
}

function removeCatalogOverlayControls(force = false) {
    const hostDoc = getTopLevelDocument();
    const panel = hostDoc.getElementById('catalog-overlay-controls');
    if (!panel) return;
    const paneId = window.__paneSyncId || 'root';
    const ownerId = panel.dataset.ownerId || hostDoc.defaultView?.__catalogPanelOwnerId || null;
    if (!force && ownerId && ownerId !== paneId) {
        return;
    }
    try {
        if (typeof panel.__catalogCleanup === 'function') {
            panel.__catalogCleanup();
        }
    } catch (_) {}
    panel.remove();
    try {
        if (hostDoc.defaultView) {
            hostDoc.defaultView.__catalogPanelOwnerId = null;
        }
    } catch (_) {}
    catalogOverlayControlsCollapsed = false;
    try { window.catalogOverlayControlsCollapsed = catalogOverlayControlsCollapsed; } catch (_) {}
}

function syncCatalogOverlayControls() {
    const hostDoc = getTopLevelDocument();
    const panel = hostDoc.getElementById('catalog-overlay-controls');
    if (!panel) return;
    const slider = panel.querySelector('input[data-role="catalog-opacity-slider"]');
    const valueLabel = panel.querySelector('span[data-role="catalog-opacity-value"]');
    let value = 0.8;
    try {
        if (window.regionStyles && typeof window.regionStyles.opacity === 'number') {
            value = window.regionStyles.opacity;
        }
    } catch (_) {}
    if (slider) {
        slider.value = value;
        slider.disabled = false;
        slider.style.background = `linear-gradient(90deg, #22d3ee ${value * 100}%, rgba(99,102,241,0.3) ${value * 100}%)`;
    }
    if (valueLabel) {
        valueLabel.textContent = value.toFixed(2);
    }
}

function positionCatalogControlsPanel(panel) {
    if (!panel) return;
    const hostDoc = getTopLevelDocument();
    const topWin = (() => { try { return window.top || window; } catch (_) { return window; } })();
    const viewportHeight = (topWin && topWin.innerHeight) || hostDoc.documentElement?.clientHeight || window.innerHeight || 0;
    const anchor = getActivePaneBounds();
    panel.style.position = 'fixed';
    panel.style.transform = 'translateX(-50%)';
    
    // Check if segment controls exist and get their height and collapsed state
    const segmentPanel = hostDoc.getElementById('segment-overlay-controls');
    let segmentPanelHeight = 0;
    let segmentPanelBottom = 0;
    let segmentIsCollapsed = false;
    if (segmentPanel) {
        const segmentRect = segmentPanel.getBoundingClientRect();
        segmentPanelHeight = segmentRect.height;
        segmentPanelBottom = viewportHeight - segmentRect.bottom;
        segmentIsCollapsed = segmentPanel.dataset.state === 'collapsed';
    }
    
    // Check if catalog panel is collapsed
    const catalogIsCollapsed = panel.dataset.state === 'collapsed';
    
    // Use smaller gap when either panel is collapsed
    const panelGap = (catalogIsCollapsed || segmentIsCollapsed) ? 6 : 12;
    
    if (!anchor) {
        panel.style.left = '50%';
        // Position above segment panel if it exists, otherwise use default offset
        if (segmentPanel) {
            panel.style.bottom = `${24 + segmentPanelHeight + panelGap}px`;
        } else {
            panel.style.bottom = '72px';
        }
        return;
    }
    const centerX = anchor.left + (anchor.width / 2);
    const baseOffset = Math.max(16, viewportHeight - anchor.bottom + 24);
    
    // Position catalog panel above segment panel with gap
    if (segmentPanel) {
        panel.style.left = `${centerX}px`;
        panel.style.bottom = `${baseOffset + segmentPanelHeight + panelGap}px`;
    } else {
        panel.style.left = `${centerX}px`;
        panel.style.bottom = `${baseOffset + 48}px`;
    }
}

function repositionCatalogOverlayControls() {
    const hostDoc = getTopLevelDocument();
    const panel = hostDoc.getElementById('catalog-overlay-controls');
    if (panel) {
        positionCatalogControlsPanel(panel);
        // Also reposition segment panel in case catalog panel height changed
        const segmentPanel = hostDoc.getElementById('segment-overlay-controls');
        if (segmentPanel) {
            positionSegmentControlsPanel(segmentPanel);
        }
    }
}

function renderCatalogOverlayControls() {
    const isPaneContext = !!(window.parent && window.parent !== window);
    const canControlPanel = !isPaneContext || !!window.__wcsIsActivePane;
    if (!canControlPanel) return;

    // Check if we're in multi-panel mode to determine default collapsed state
    let isMultiPanelMode = false;
    let shouldStartCollapsed = false;
    try {
        const topWin = (window.top && window.top !== window) ? window.top : window;
        const wrap = topWin.document.getElementById('multi-panel-container');
        const grid = topWin.document.getElementById('multi-panel-grid');
        isMultiPanelMode = wrap && wrap.style.display !== 'none' && grid && grid.querySelectorAll('iframe').length >= 2;
        // In multi-panel mode, always start collapsed
        shouldStartCollapsed = isMultiPanelMode;
    } catch (_) {}

    removeCatalogOverlayControls(true);
    
    // If in multi-panel mode, force collapsed state
    if (shouldStartCollapsed) {
        catalogOverlayControlsCollapsed = true;
        try { window.catalogOverlayControlsCollapsed = true; } catch (_) {}
    }

    const hasOverlay = window.catalogDataForOverlay && Array.isArray(window.catalogDataForOverlay) && window.catalogDataForOverlay.length > 0;
    const loadedCats = (typeof window.getLoadedCatalogOverlays === 'function') ? window.getLoadedCatalogOverlays() : [];
    const hasAnyCatalog = Array.isArray(loadedCats) ? loadedCats.length > 0 : !!window.currentCatalogName;
    if (!hasOverlay || !hasAnyCatalog) return;

    const hostDoc = getTopLevelDocument();
    if (!hostDoc || !hostDoc.body) return;
    const createEl = (tag) => hostDoc.createElement(tag);

    const panel = createEl('div');
    panel.id = 'catalog-overlay-controls';
    Object.assign(panel.style, {
        background: 'rgba(17,24,39,0.95)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '12px',
        padding: '12px 20px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.45)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: '10px',
        // Keep above the image viewer, but below top-level popups (Plotter/Region Style/Catalog Viewer).
        zIndex: '3500',
        color: '#f9fafb',
        fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
        minWidth: '260px',
        pointerEvents: 'auto',
        // Prevent any child from causing horizontal scroll
        overflowX: 'hidden',
        boxSizing: 'border-box',
        // Prevent the panel from growing beyond the viewport (so the close button is always reachable)
        maxHeight: '82vh',
        overflowY: 'hidden'
    });

    // Ensure box-sizing is consistent inside the panel (prevents subtle width overflow from padding/borders)
    try {
        const styleId = 'catalog-overlay-controls-boxsizing';
        if (!hostDoc.getElementById(styleId)) {
            const st = createEl('style');
            st.id = styleId;
            st.textContent = `
            #catalog-overlay-controls, #catalog-overlay-controls * { box-sizing: border-box; }
            #catalog-overlay-controls { overflow-x: hidden; }
            @keyframes catalog-btn-pulse {
              0% { transform: scale(1); box-shadow: 0 0 0 rgba(34,211,238,0); }
              45% { transform: scale(1.06); box-shadow: 0 0 0 4px rgba(34,211,238,0.15); }
              100% { transform: scale(1); box-shadow: 0 0 0 rgba(34,211,238,0); }
            }
            @keyframes catalog-btn-shake {
              0%, 100% { transform: translateX(0); }
              25% { transform: translateX(-2px); }
              75% { transform: translateX(2px); }
            }
            @keyframes catalog-x-pop {
              0% { transform: scale(1); }
              100% { transform: scale(0.9); }
            }
            @keyframes catalog-row-out {
              0% { opacity: 1; transform: translateX(0); max-height: 40px; }
              100% { opacity: 0; transform: translateX(6px); max-height: 0px; }
            }
            @keyframes catalog-cond-pop {
              0% { opacity: 0; transform: translateY(-4px); }
              100% { opacity: 1; transform: translateY(0); }
            }
            `;
            hostDoc.head.appendChild(st);
        }
    } catch (_) {}

    // Header (similar to segment controls)
    const headerRow = createEl('div');
    Object.assign(headerRow.style, {
        display: 'flex',
        width: '100%',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '10px',
        position: 'sticky',
        top: '0',
        zIndex: '3',
        background: 'rgba(17,24,39,0.98)',
        paddingBottom: '6px'
    });
    const titleLabel = createEl('span');
    const activeName = window.currentCatalogName || window.activeCatalog || '';
    const activeShort = activeName ? (String(activeName).split(/[/\\]/).pop() || activeName) : '';
    const nLoaded = Array.isArray(loadedCats) ? loadedCats.length : 0;
    titleLabel.textContent = nLoaded > 1 ? `Catalogs · ${nLoaded} loaded` : `Catalogs · ${activeShort}`;
    titleLabel.style.fontSize = '13px';
    titleLabel.style.fontWeight = '600';
    titleLabel.style.whiteSpace = 'nowrap';
    titleLabel.style.overflow = 'hidden';
    titleLabel.style.textOverflow = 'ellipsis';
    const collapseBtn = createEl('button');
    collapseBtn.type = 'button';
    collapseBtn.textContent = '×';
    Object.assign(collapseBtn.style, {
        border: 'none',
        background: 'rgba(255,255,255,0.08)',
        color: '#f9fafb',
        width: '24px',
        height: '24px',
        borderRadius: '50%',
        cursor: 'pointer',
        fontSize: '14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 150ms ease'
    });
    collapseBtn.addEventListener('mouseenter', () => collapseBtn.style.background = 'rgba(255,255,255,0.18)');
    collapseBtn.addEventListener('mouseleave', () => collapseBtn.style.background = 'rgba(255,255,255,0.08)');
    collapseBtn.setAttribute('aria-label', 'Collapse catalog controls');
    headerRow.append(titleLabel, collapseBtn);
    panel.appendChild(headerRow);

    // Live visible-source counter (fed by canvasUpdateOverlay -> window.__catalogOverlayRenderStats)
    const statsRow = createEl('div');
    statsRow.dataset.role = 'catalog-shown-summary';
    Object.assign(statsRow.style, {
        fontSize: '12px',
        color: '#cbd5e1',
        marginTop: '-6px',
        position: 'sticky',
        top: '34px',
        zIndex: '2',
        background: 'rgba(17,24,39,0.98)',
        paddingBottom: '6px'
    });
    statsRow.textContent = 'Visible sources: —';
    panel.appendChild(statsRow);

    const expandedContent = createEl('div');
    Object.assign(expandedContent.style, {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
        gap: '10px',
        transition: 'opacity 200ms ease, max-height 220ms ease',
        overflowY: 'auto',
        overflowX: 'hidden',
        // Let this section scroll within the capped panel height
        maxHeight: 'calc(82vh - 72px)'
    });
    panel.appendChild(expandedContent);

    // Loaded catalogs list (visibility + active selection)
    const list = createEl('div');
    Object.assign(list.style, {
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        padding: '6px 10px',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '10px'
    });

    const listTitle = createEl('div');
    listTitle.textContent = 'Loaded catalogs';
    Object.assign(listTitle.style, { fontSize: '12px', color: '#cbd5e1', fontWeight: '600' });
    list.appendChild(listTitle);

    const rows = createEl('div');
    Object.assign(rows.style, { display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' });

    const cats = Array.isArray(loadedCats) ? loadedCats : [];
    const boolStore = __ensureCatalogBooleanFilterStore();
    const condStore = __ensureCatalogConditionFilterStore();
    const uiState = __ensureCatalogBooleanUiStateStore();
    const openKey = uiState.openKey || null;
    const countEnabledFilters = (key) => {
        try {
            const nk = __normalizeCatalogKey(key);
            const cfg = boolStore[nk];
            if (!cfg || typeof cfg !== 'object') return 0;
            const boolCount = Object.keys(cfg).filter((c) => c !== '__mode' && cfg[c] === true).length;
            const cCfg = condStore[nk];
            const condCount = (cCfg && typeof cCfg === 'object' && Array.isArray(cCfg.conditions)) ? cCfg.conditions.filter(Boolean).length : 0;
            return boolCount + condCount;
        } catch (_) { return 0; }
    };

    cats.slice(0, 8).forEach((c) => {
        const key = c.key || '';
        const short = String(key).split(/[/\\]/).pop() || key;
        const row = createEl('div');
        Object.assign(row.style, {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px'
        });

        const left = createEl('div');
        Object.assign(left.style, { display: 'flex', alignItems: 'center', gap: '8px', minWidth: '0', flex: '1' });

        const radio = createEl('input');
        radio.type = 'radio';
        radio.name = 'catalog-active-select';
        radio.checked = !!activeName && String(activeName) === String(key);
        radio.addEventListener('change', () => {
            try {
                if (typeof window.setActiveCatalogForControls === 'function') {
                    window.setActiveCatalogForControls(key);
                    syncCatalogOverlayControls();
                    // Re-render so boolean columns & title update immediately
                    renderCatalogOverlayControls();
                }
            } catch (_) {}
        });

        const checkbox = createEl('input');
        checkbox.type = 'checkbox';
        checkbox.checked = c.visible !== false;
        checkbox.title = 'Show/hide this catalog overlay';
        checkbox.addEventListener('change', () => {
            try {
                if (typeof window.setCatalogOverlayVisible === 'function') {
                    window.setCatalogOverlayVisible(key, checkbox.checked);
                }
            } catch (_) {}
        });

        const label = createEl('button');
        label.type = 'button';
        label.textContent = short;
        Object.assign(label.style, {
            border: 'none',
            background: 'transparent',
            color: '#e5e7eb',
            fontSize: '12px',
            cursor: 'pointer',
            textAlign: 'left',
            padding: '0',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            flex: '1',
            minWidth: '0'
        });
        label.addEventListener('click', () => {
            try {
                if (typeof window.setActiveCatalogForControls === 'function') {
                    window.setActiveCatalogForControls(key);
                    syncCatalogOverlayControls();
                    // re-render panel to update radio states/title
                    renderCatalogOverlayControls();
                }
            } catch (_) {}
        });

        const meta = createEl('span');
        meta.textContent = (typeof c.count === 'number') ? `${c.count}` : '';
        Object.assign(meta.style, { fontSize: '11px', color: '#94a3b8', flex: '0 0 auto' });

        left.append(radio, checkbox, label);

        // Right side: count + filter button
        const right = createEl('div');
        Object.assign(right.style, { display: 'flex', alignItems: 'center', gap: '8px', flex: '0 0 auto' });

        const filterCount = countEnabledFilters(key);
        const isFilterOpen = (openKey && String(openKey) === String(key));
        const filterBtn = createEl('button');
        filterBtn.type = 'button';
        filterBtn.title = 'Filter (boolean + conditions)';
        const chevron = isFilterOpen ? '⏶' : '⏷';
        filterBtn.textContent = filterCount > 0 ? `${chevron} Filter · ${filterCount}` : `${chevron} Filter`;
        Object.assign(filterBtn.style, {
            border: 'none',
            background: isFilterOpen
                ? 'rgba(37,99,235,0.35)'
                : (filterCount > 0 ? 'rgba(34,211,238,0.18)' : 'rgba(255,255,255,0.06)'),
            color: isFilterOpen
                ? '#bfdbfe'
                : (filterCount > 0 ? '#67e8f9' : '#e5e7eb'),
            padding: '3px 10px',
            borderRadius: '999px',
            cursor: 'pointer',
            fontSize: '11px',
            transition: 'background 150ms ease, transform 150ms ease, box-shadow 150ms ease',
            boxShadow: isFilterOpen ? '0 0 0 1px rgba(147,197,253,0.45) inset' : 'none'
        });
        filterBtn.addEventListener('mouseenter', () => { filterBtn.style.transform = 'scale(1.02)'; });
        filterBtn.addEventListener('mouseleave', () => { filterBtn.style.transform = 'scale(1)'; });
        filterBtn.addEventListener('click', (ev) => {
            try { ev.preventDefault(); ev.stopPropagation(); } catch (_) {}
            try {
                // Open/close this catalog's filter panel
                uiState.openKey = (uiState.openKey === key) ? null : key;
            } catch (_) {}
            try { renderCatalogOverlayControls(); } catch (_) {}
            // Ensure a redraw so filter changes show immediately if user opens/closes quickly
            try { if (typeof window.canvasUpdateOverlay === 'function') window.canvasUpdateOverlay(); } catch (_) {}
        });

        const removeBtn = createEl('button');
        removeBtn.type = 'button';
        removeBtn.title = 'Remove this catalog';
        removeBtn.textContent = '×';
        Object.assign(removeBtn.style, {
            border: 'none',
            background: 'rgba(239,68,68,0.18)',
            color: '#fecaca',
            width: '26px',
            height: '26px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '16px',
            lineHeight: '26px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center'
        });
        removeBtn.addEventListener('click', (ev) => {
            try { ev.preventDefault(); ev.stopPropagation(); } catch (_) {}
            // Animate then remove
            try {
                if (removeBtn.animate) {
                    removeBtn.animate([{ transform: 'scale(1)' }, { transform: 'scale(0.9)' }, { transform: 'scale(1)' }], { duration: 160, easing: 'ease-out' });
                }
            } catch (_) {}
            try {
                row.style.overflow = 'hidden';
                if (row.animate) {
                    row.animate([{ opacity: 1, transform: 'translateX(0)', maxHeight: '40px' }, { opacity: 0, transform: 'translateX(8px)', maxHeight: '0px' }], { duration: 180, easing: 'ease-out' });
                } else {
                    row.style.animation = 'catalog-row-out 180ms ease-out forwards';
                }
            } catch (_) {}
            setTimeout(() => {
                try {
                    if (typeof window.removeCatalogOverlayByKey === 'function') {
                        window.removeCatalogOverlayByKey(key);
                    } else if (typeof window.clearCatalog === 'function' && String(window.currentCatalogName || '') === String(key)) {
                        window.clearCatalog();
                    }
                } catch (_) {}
                try { renderCatalogOverlayControls(); } catch (_) {}
            }, 180);
        });

        right.append(meta, filterBtn, removeBtn);
        row.append(left, right);
        rows.appendChild(row);

        // Expandable filter panel (animated)
        const expanded = createEl('div');
        const isOpen = (openKey && String(openKey) === String(key));
        Object.assign(expanded.style, {
            width: '100%',
            marginTop: '2px',
            padding: '0 8px',
            overflow: 'hidden',
            // Increased so "Conditions" rows don't get clipped; inner content will scroll if needed.
            maxHeight: isOpen ? '760px' : '0px',
            opacity: isOpen ? '1' : '0',
            transition: 'max-height 220ms ease, opacity 180ms ease',
        });

        const inner = createEl('div');
        Object.assign(inner.style, {
            marginTop: '6px',
            marginBottom: '6px',
            padding: '8px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            // Allow long filter panels (many boolean cols + conditions) without hiding lower controls.
            maxHeight: '620px',
            overflowY: 'auto',
            overflowX: 'hidden'
        });

        // Build content only when open (cheaper, and avoids repeated boolean-column scans)
        if (isOpen) {
            const normalizedKey = __normalizeCatalogKey(key);
            const cols = __getBooleanColumnsCached(normalizedKey);
            if (!boolStore[normalizedKey] || typeof boolStore[normalizedKey] !== 'object') boolStore[normalizedKey] = { __mode: 'and' };
            if (typeof boolStore[normalizedKey].__mode !== 'string') boolStore[normalizedKey].__mode = 'and';
            const mode = (boolStore[normalizedKey].__mode === 'or') ? 'or' : 'and';

            if (!condStore[normalizedKey] || typeof condStore[normalizedKey] !== 'object') condStore[normalizedKey] = { __mode: 'and', conditions: [] };
            if (!Array.isArray(condStore[normalizedKey].conditions)) condStore[normalizedKey].conditions = [];
            const condMode = (condStore[normalizedKey].__mode === 'or') ? 'or' : 'and';
            const lastAdded = (() => {
                try { return uiState && uiState.lastAddedCondition ? uiState.lastAddedCondition : null; } catch (_) { return null; }
            })();
            const isLastAdded = (col, op, value) => {
                try {
                    if (!lastAdded) return false;
                    if (lastAdded.key !== normalizedKey) return false;
                    if (Date.now() - (lastAdded.ts || 0) > 1500) return false;
                    const sig = `${String(col)}|${String(op)}|${Number(value)}`;
                    return lastAdded.sig === sig;
                } catch (_) { return false; }
            };
            const animateAddButton = (btn, kind = 'success') => {
                if (!btn) return;
                try {
                    if (btn.animate) {
                        if (kind === 'error') {
                            btn.animate(
                                [{ transform: 'translateX(0)' }, { transform: 'translateX(-2px)' }, { transform: 'translateX(2px)' }, { transform: 'translateX(0)' }],
                                { duration: 220, easing: 'ease-out' }
                            );
                        } else {
                            btn.animate(
                                [{ transform: 'scale(1)', boxShadow: '0 0 0 rgba(34,211,238,0)' },
                                 { transform: 'scale(1.06)', boxShadow: '0 0 0 4px rgba(34,211,238,0.15)' },
                                 { transform: 'scale(1)', boxShadow: '0 0 0 rgba(34,211,238,0)' }],
                                { duration: 240, easing: 'ease-out' }
                            );
                        }
                        return;
                    }
                } catch (_) {}
                try {
                    btn.style.animation = 'none';
                    void btn.offsetHeight;
                    btn.style.animation = (kind === 'error')
                        ? 'catalog-btn-shake 220ms ease-out'
                        : 'catalog-btn-pulse 240ms ease-out';
                    setTimeout(() => { try { btn.style.animation = ''; } catch (_) {} }, 260);
                } catch (_) {}
            };

            const header = createEl('div');
            Object.assign(header.style, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' });

            const hLeft = createEl('div');
            hLeft.textContent = 'Boolean filters';
            Object.assign(hLeft.style, { fontSize: '12px', color: '#cbd5e1', fontWeight: '600' });

            const actions = createEl('div');
            actions.style.display = 'flex';
            actions.style.alignItems = 'center';
            actions.style.gap = '8px';

            const reset = createEl('button');
            reset.type = 'button';
            reset.textContent = 'Reset';
            Object.assign(reset.style, {
                border: 'none',
                background: 'rgba(148,163,184,0.18)',
                color: '#e5e7eb',
                padding: '3px 10px',
                borderRadius: '999px',
                cursor: 'pointer',
                fontSize: '11px'
            });
            reset.addEventListener('click', () => {
                try {
                    Object.keys(boolStore[normalizedKey] || {}).forEach((col) => {
                        if (col !== '__mode') boolStore[normalizedKey][col] = false;
                    });
                } catch (_) {}
                try {
                    if (condStore[normalizedKey] && Array.isArray(condStore[normalizedKey].conditions)) {
                        condStore[normalizedKey].conditions = [];
                    }
                } catch (_) {}
                try { if (typeof window.canvasUpdateOverlay === 'function') window.canvasUpdateOverlay(); } catch (_) {}
                try { renderCatalogOverlayControls(); } catch (_) {}
            });

            actions.append(reset);
            header.append(hLeft, actions);
            inner.appendChild(header);

            const modeRow = createEl('div');
            Object.assign(modeRow.style, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' });
            const modeLabel = createEl('div');
            modeLabel.textContent = 'Mode:';
            Object.assign(modeLabel.style, { fontSize: '11px', color: '#94a3b8' });
            const modeToggle = createEl('div');
            Object.assign(modeToggle.style, { display: 'flex', gap: '6px' });

            const makeModeBtn = (id, text) => {
                const b = createEl('button');
                b.type = 'button';
                b.textContent = text;
                const active = mode === id;
                Object.assign(b.style, {
                    border: 'none',
                    background: active ? 'rgba(37,99,235,0.75)' : 'rgba(255,255,255,0.08)',
                    color: '#fff',
                    padding: '3px 10px',
                    borderRadius: '999px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    transition: 'background 150ms ease'
                });
                b.addEventListener('click', () => {
                    boolStore[normalizedKey].__mode = id;
                    try { if (typeof window.canvasUpdateOverlay === 'function') window.canvasUpdateOverlay(); } catch (_) {}
                    try { renderCatalogOverlayControls(); } catch (_) {}
                });
                return b;
            };
            modeToggle.append(makeModeBtn('and', 'AND'), makeModeBtn('or', 'OR'));
            modeRow.append(modeLabel, modeToggle);
            inner.appendChild(modeRow);

            // Keep UI compact: no long hint text here (tooltip can be added later if needed).

            if (!cols.length) {
                const none = createEl('div');
                none.textContent = 'No boolean columns detected in this catalog.';
                Object.assign(none.style, { fontSize: '12px', color: '#e5e7eb', opacity: 0.9 });
                inner.appendChild(none);
            } else {
                const grid = createEl('div');
                Object.assign(grid.style, {
                    width: '100%',
                    display: 'grid',
                    gridTemplateColumns: '1fr',
                    gap: '6px',
                    maxHeight: '140px',
                    overflowY: 'auto',
                    paddingRight: '4px'
                });
                cols.slice(0, 30).forEach((col) => {
                    const wrap2 = createEl('label');
                    Object.assign(wrap2.style, {
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        cursor: 'pointer',
                        userSelect: 'none',
                        minWidth: '0'
                    });
                    const cb = createEl('input');
                    cb.type = 'checkbox';
                    cb.checked = !!boolStore[normalizedKey][col];
                    cb.addEventListener('change', () => {
                        (async () => {
                            try {
                                try {
                                    const dbg = !!(window.__catalogFilterDebug || window.top?.__catalogFilterDebug);
                                    if (dbg) {
                                        console.debug('[catalog-filters][bool] change', { catalog: normalizedKey, col, checked: cb.checked });
                                    }
                                } catch (_) {}
                                // Ensure the boolean column values exist on overlay objects before filtering.
                                if (cb.checked) {
                                    await __ensureCatalogColumnsLoaded(normalizedKey, [col]);
                                }
                            } catch (err) {
                                console.warn('[catalog-overlay-controls] Failed to load boolean column values:', err);
                                // Don't apply a filter that would hide everything if we couldn't load values.
                                try { cb.checked = false; } catch (_) {}
                                try { boolStore[normalizedKey][col] = false; } catch (_) {}
                                try { if (typeof window.showNotification === 'function') window.showNotification(String(err?.message || err), 4000, 'error'); } catch (_) {}
                                try { if (typeof window.canvasUpdateOverlay === 'function') window.canvasUpdateOverlay(); } catch (_) {}
                                return;
                            }
                            boolStore[normalizedKey][col] = !!cb.checked;
                            try { if (typeof window.canvasUpdateOverlay === 'function') window.canvasUpdateOverlay(); } catch (_) {}
                        })();
                    });
                    const text2 = createEl('span');
                    text2.textContent = col;
                    Object.assign(text2.style, {
                        fontSize: '12px',
                        color: '#e5e7eb',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                    });
                    wrap2.append(cb, text2);
                    grid.appendChild(wrap2);
                });
                if (cols.length > 30) {
                    const more = createEl('div');
                    more.textContent = `+${cols.length - 30} more`;
                    Object.assign(more.style, { fontSize: '11px', color: '#94a3b8' });
                    grid.appendChild(more);
                }
                inner.appendChild(grid);
            }

            // Numeric condition filters
            const numericHeader = createEl('div');
            Object.assign(numericHeader.style, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginTop: '6px' });
            const numericTitle = createEl('div');
            numericTitle.textContent = 'Conditions';
            Object.assign(numericTitle.style, { fontSize: '12px', color: '#cbd5e1', fontWeight: '600' });
            const numericReset = createEl('button');
            numericReset.type = 'button';
            numericReset.textContent = 'Clear';
            Object.assign(numericReset.style, {
                border: 'none',
                background: 'rgba(148,163,184,0.18)',
                color: '#e5e7eb',
                padding: '3px 10px',
                borderRadius: '999px',
                cursor: 'pointer',
                fontSize: '11px'
            });
            numericReset.addEventListener('click', () => {
                try { condStore[normalizedKey].conditions = []; } catch (_) {}
                try { if (typeof window.canvasUpdateOverlay === 'function') window.canvasUpdateOverlay(); } catch (_) {}
                try { renderCatalogOverlayControls(); } catch (_) {}
            });
            numericHeader.append(numericTitle, numericReset);
            inner.appendChild(numericHeader);

            const condModeRow = createEl('div');
            Object.assign(condModeRow.style, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' });
            const condModeLabel = createEl('div');
            condModeLabel.textContent = 'Mode:';
            Object.assign(condModeLabel.style, { fontSize: '11px', color: '#94a3b8' });
            const condModeToggle = createEl('div');
            Object.assign(condModeToggle.style, { display: 'flex', gap: '6px' });
            const makeCondModeBtn = (id, text) => {
                const b = createEl('button');
                b.type = 'button';
                b.textContent = text;
                const active = condMode === id;
                Object.assign(b.style, {
                    border: 'none',
                    background: active ? 'rgba(37,99,235,0.75)' : 'rgba(255,255,255,0.08)',
                    color: '#fff',
                    padding: '3px 10px',
                    borderRadius: '999px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    transition: 'background 150ms ease'
                });
                b.addEventListener('click', () => {
                    condStore[normalizedKey].__mode = id;
                    try { if (typeof window.canvasUpdateOverlay === 'function') window.canvasUpdateOverlay(); } catch (_) {}
                    try { renderCatalogOverlayControls(); } catch (_) {}
                });
                return b;
            };
            condModeToggle.append(makeCondModeBtn('and', 'AND'), makeCondModeBtn('or', 'OR'));
            condModeRow.append(condModeLabel, condModeToggle);
            inner.appendChild(condModeRow);

            const allCols = __getAllCatalogColumnsCached(normalizedKey);
            const numericCols = __getNumericColumnsCached(normalizedKey);
            const colsForDropdown = allCols.length ? allCols : numericCols;

            if (!colsForDropdown.length) {
                const noneNum = createEl('div');
                noneNum.textContent = 'Loading columns… If this takes long, you can still enter a column name manually below.';
                Object.assign(noneNum.style, { fontSize: '12px', color: '#e5e7eb', opacity: 0.9 });
                inner.appendChild(noneNum);

                // Manual condition row fallback (always available) - keep on one row
                const addRow = createEl('div');
                Object.assign(addRow.style, {
                    width: '100%',
                    display: 'grid',
                    gridTemplateColumns: '1fr 72px 96px auto',
                    gap: '6px',
                    alignItems: 'center',
                    overflowX: 'hidden'
                });

                const colInput = createEl('input');
                colInput.type = 'text';
                colInput.placeholder = 'Column name…';
                Object.assign(colInput.style, {
                    minWidth: '0',
                    background: 'rgba(255,255,255,0.06)',
                    color: '#e5e7eb',
                    border: '1px solid rgba(255,255,255,0.10)',
                    borderRadius: '8px',
                    padding: '6px 8px',
                    fontSize: '12px'
                });

                const opSel = createEl('select');
                Object.assign(opSel.style, {
                    background: 'rgba(255,255,255,0.06)',
                    color: '#e5e7eb',
                    border: '1px solid rgba(255,255,255,0.10)',
                    borderRadius: '8px',
                    padding: '6px 6px',
                    fontSize: '12px'
                });
                ['>', '>=', '<', '<=', '==', '!='].forEach((op) => {
                    const o = createEl('option');
                    o.value = op;
                    o.textContent = op;
                    opSel.appendChild(o);
                });
                opSel.value = '>';

                const valInput = createEl('input');
                valInput.type = 'number';
                valInput.step = 'any';
                valInput.placeholder = 'Value';
                Object.assign(valInput.style, {
                    background: 'rgba(255,255,255,0.06)',
                    color: '#e5e7eb',
                    border: '1px solid rgba(255,255,255,0.10)',
                    borderRadius: '8px',
                    padding: '6px 8px',
                    fontSize: '12px'
                });

                const addBtn = createEl('button');
                addBtn.type = 'button';
                addBtn.textContent = 'Add';
                Object.assign(addBtn.style, {
                    border: 'none',
                    background: 'rgba(34,211,238,0.18)',
                    color: '#67e8f9',
                    padding: '6px 10px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: '600',
                    whiteSpace: 'nowrap'
                });

                const msg = createEl('div');
                Object.assign(msg.style, { fontSize: '11px', color: '#fca5a5', minHeight: '14px' });

                const tryAddManual = () => {
                    msg.textContent = '';
                    const col = String(colInput.value || '').trim();
                    const op = String(opSel.value || '').trim();
                    const raw = valInput.value;
                    const value = Number(raw);
                    if (!col) { msg.textContent = 'Enter a column name.'; animateAddButton(addBtn, 'error'); return; }
                    if (!Number.isFinite(value)) { msg.textContent = 'Enter a numeric value.'; animateAddButton(addBtn, 'error'); return; }
                    const entry = { col, op, value };
                    const arr = condStore[normalizedKey].conditions || [];
                    const exists = arr.some((c) => c && c.col === entry.col && c.op === entry.op && Number(c.value) === entry.value);
                    if (!exists) arr.push(entry);
                    condStore[normalizedKey].conditions = arr;
                    try { uiState.lastAddedCondition = { key: normalizedKey, sig: `${entry.col}|${entry.op}|${Number(entry.value)}`, ts: Date.now() }; } catch (_) {}
                    animateAddButton(addBtn, 'success');
                    try { if (typeof window.canvasUpdateOverlay === 'function') window.canvasUpdateOverlay(); } catch (_) {}
                    try { renderCatalogOverlayControls(); } catch (_) {}
                };
                addBtn.addEventListener('click', tryAddManual);
                valInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryAddManual(); });

                addRow.append(colInput, opSel, valInput, addBtn);
                inner.appendChild(addRow);
                inner.appendChild(msg);
            } else {
                const addRow = createEl('div');
                Object.assign(addRow.style, {
                    width: '100%',
                    display: 'grid',
                    gridTemplateColumns: '1fr 72px 96px auto',
                    gap: '6px',
                    alignItems: 'center',
                    overflowX: 'hidden'
                });

                const colSel = createEl('select');
                Object.assign(colSel.style, {
                    minWidth: '0',
                    background: 'rgba(255,255,255,0.06)',
                    color: '#e5e7eb',
                    border: '1px solid rgba(255,255,255,0.10)',
                    borderRadius: '8px',
                    padding: '6px 8px',
                    fontSize: '12px'
                });
                const placeholderOpt = createEl('option');
                placeholderOpt.value = '';
                placeholderOpt.textContent = 'Column…';
                colSel.appendChild(placeholderOpt);
                colsForDropdown.forEach((cname) => {
                    const o = createEl('option');
                    o.value = cname;
                    o.textContent = cname;
                    colSel.appendChild(o);
                });

                const opSel = createEl('select');
                Object.assign(opSel.style, {
                    background: 'rgba(255,255,255,0.06)',
                    color: '#e5e7eb',
                    border: '1px solid rgba(255,255,255,0.10)',
                    borderRadius: '8px',
                    padding: '6px 6px',
                    fontSize: '12px'
                });
                ['>', '>=', '<', '<=', '==', '!='].forEach((op) => {
                    const o = createEl('option');
                    o.value = op;
                    o.textContent = op;
                    opSel.appendChild(o);
                });
                opSel.value = '>';

                const valInput = createEl('input');
                valInput.type = 'number';
                valInput.step = 'any';
                valInput.placeholder = 'Value';
                Object.assign(valInput.style, {
                    background: 'rgba(255,255,255,0.06)',
                    color: '#e5e7eb',
                    border: '1px solid rgba(255,255,255,0.10)',
                    borderRadius: '8px',
                    padding: '6px 8px',
                    fontSize: '12px'
                });

                const addBtn = createEl('button');
                addBtn.type = 'button';
                addBtn.textContent = 'Add';
                Object.assign(addBtn.style, {
                    border: 'none',
                    background: 'rgba(34,211,238,0.18)',
                    color: '#67e8f9',
                    padding: '6px 10px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: '600',
                    whiteSpace: 'nowrap'
                });

                const msg = createEl('div');
                Object.assign(msg.style, { fontSize: '11px', color: '#fca5a5', minHeight: '14px' });

                const tryAdd = () => {
                    msg.textContent = '';
                    const col = String(colSel.value || '').trim();
                    const op = String(opSel.value || '').trim();
                    const raw = valInput.value;
                    const value = Number(raw);
                    if (!col) { msg.textContent = 'Pick a column.'; animateAddButton(addBtn, 'error'); return; }
                    if (!Number.isFinite(value)) { msg.textContent = 'Enter a numeric value.'; animateAddButton(addBtn, 'error'); return; }
                    (async () => {
                        try {
                            // Ensure the numeric column values exist on overlay objects before filtering.
                            await __ensureCatalogColumnsLoaded(normalizedKey, [col]);
                        } catch (err) {
                            console.warn('[catalog-overlay-controls] Failed to load condition column values:', err);
                            msg.textContent = String(err?.message || err || 'Failed to load column values');
                            animateAddButton(addBtn, 'error');
                            try { if (typeof window.showNotification === 'function') window.showNotification(msg.textContent, 4500, 'error'); } catch (_) {}
                            return;
                        }
                        const entry = { col, op, value };
                        const arr = condStore[normalizedKey].conditions || [];
                        const exists = arr.some((c) => c && c.col === entry.col && c.op === entry.op && Number(c.value) === entry.value);
                        if (!exists) arr.push(entry);
                        condStore[normalizedKey].conditions = arr;
                        try { uiState.lastAddedCondition = { key: normalizedKey, sig: `${entry.col}|${entry.op}|${Number(entry.value)}`, ts: Date.now() }; } catch (_) {}
                        animateAddButton(addBtn, 'success');
                        try { if (typeof window.canvasUpdateOverlay === 'function') window.canvasUpdateOverlay(); } catch (_) {}
                        try { renderCatalogOverlayControls(); } catch (_) {}
                    })();
                };
                addBtn.addEventListener('click', tryAdd);
                valInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') tryAdd();
                });

                addRow.append(colSel, opSel, valInput, addBtn);
                inner.appendChild(addRow);
                inner.appendChild(msg);

                const listWrap = createEl('div');
                Object.assign(listWrap.style, {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    width: '100%',
                    maxHeight: '220px',
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    paddingRight: '4px'
                });
                const conds = Array.isArray(condStore[normalizedKey].conditions) ? condStore[normalizedKey].conditions.filter(Boolean) : [];
                if (!conds.length) {
                    const none2 = createEl('div');
                    none2.textContent = 'No conditions set.';
                    Object.assign(none2.style, { fontSize: '12px', color: '#e5e7eb', opacity: 0.85 });
                    listWrap.appendChild(none2);
                } else {
                    conds.slice(0, 10).forEach((c, idx) => {
                        const row = createEl('div');
                        Object.assign(row.style, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' });
                        try {
                            if (isLastAdded(c.col, c.op, c.value)) {
                                row.style.animation = 'catalog-cond-pop 260ms ease-out';
                                row.dataset.role = 'catalog-cond-last';
                            }
                        } catch (_) {}
                        const t = createEl('div');
                        t.textContent = `${c.col} ${c.op} ${c.value}`;
                        Object.assign(t.style, { fontSize: '12px', color: '#e5e7eb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
                        const rm = createEl('button');
                        rm.type = 'button';
                        rm.textContent = '×';
                        Object.assign(rm.style, {
                            border: 'none',
                            background: 'rgba(239,68,68,0.18)',
                            color: '#fecaca',
                            width: '24px',
                            height: '24px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            lineHeight: '24px'
                        });
                        rm.addEventListener('click', () => {
                            // Animate row removal before re-rendering
                            try {
                                rm.style.animation = 'none';
                                void rm.offsetHeight;
                                rm.style.animation = 'catalog-x-pop 160ms ease-out';
                            } catch (_) {}
                            try {
                                row.style.overflow = 'hidden';
                                if (row.animate) {
                                    row.animate(
                                        [{ opacity: 1, transform: 'translateX(0)', maxHeight: '40px' }, { opacity: 0, transform: 'translateX(6px)', maxHeight: '0px' }],
                                        { duration: 180, easing: 'ease-out' }
                                    );
                                } else {
                                    row.style.animation = 'catalog-row-out 180ms ease-out forwards';
                                }
                            } catch (_) {}
                            setTimeout(() => {
                                try {
                                    const arr = Array.isArray(condStore[normalizedKey].conditions) ? condStore[normalizedKey].conditions : [];
                                    const next = arr.filter((_, i2) => i2 !== idx);
                                    condStore[normalizedKey].conditions = next;
                                } catch (_) {}
                                try { if (typeof window.canvasUpdateOverlay === 'function') window.canvasUpdateOverlay(); } catch (_) {}
                                try { renderCatalogOverlayControls(); } catch (_) {}
                            }, 180);
                        });
                        row.append(t, rm);
                        listWrap.appendChild(row);
                    });
                    if (conds.length > 10) {
                        const more = createEl('div');
                        more.textContent = `+${conds.length - 10} more`;
                        Object.assign(more.style, { fontSize: '11px', color: '#94a3b8' });
                        listWrap.appendChild(more);
                    }
                }
                inner.appendChild(listWrap);
                // After adding a condition, auto-scroll the list so the new item is visible.
                try {
                    if (lastAdded && lastAdded.key === normalizedKey) {
                        setTimeout(() => {
                            try {
                                const elLast = inner.querySelector('[data-role="catalog-cond-last"]');
                                if (elLast && typeof elLast.scrollIntoView === 'function') {
                                    elLast.scrollIntoView({ block: 'nearest' });
                                }
                            } catch (_) {}
                        }, 0);
                    }
                } catch (_) {}
            }
        }

        expanded.appendChild(inner);
        rows.appendChild(expanded);
    });

    if (cats.length > 8) {
        const more = createEl('div');
        more.textContent = `+${cats.length - 8} more`;
        Object.assign(more.style, { fontSize: '11px', color: '#94a3b8', paddingLeft: '4px' });
        rows.appendChild(more);
    }

    list.appendChild(rows);
    expandedContent.appendChild(list);

    // Cross-match UI (only when 2+ catalogs are loaded)
    try {
        const catsLoaded = Array.isArray(loadedCats) ? loadedCats : [];
        if (catsLoaded.length >= 2) {
            const cfg = (() => {
                try {
                    if (!window.catalogCrossMatchConfig || typeof window.catalogCrossMatchConfig !== 'object') {
                        window.catalogCrossMatchConfig = { enabled: false, radius_arcsec: 1.0 };
                    }
                    if (typeof window.catalogCrossMatchConfig.enabled !== 'boolean') window.catalogCrossMatchConfig.enabled = false;
                    const r = Number(window.catalogCrossMatchConfig.radius_arcsec);
                    if (!Number.isFinite(r) || r <= 0) window.catalogCrossMatchConfig.radius_arcsec = 1.0;
                    return window.catalogCrossMatchConfig;
                } catch (_) {
                    return { enabled: false, radius_arcsec: 1.0 };
                }
            })();

            const xmWrap = createEl('div');
            Object.assign(xmWrap.style, {
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                padding: '10px 10px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '10px'
            });

            const xmTitle = createEl('div');
            xmTitle.textContent = 'Cross-match catalogs (common sources)';
            Object.assign(xmTitle.style, { fontSize: '12px', color: '#cbd5e1', fontWeight: '600' });
            xmWrap.appendChild(xmTitle);

            const row1 = createEl('div');
            Object.assign(row1.style, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' });

            const left = createEl('label');
            Object.assign(left.style, { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' });
            const toggle = createEl('input');
            toggle.type = 'checkbox';
            toggle.checked = !!cfg.enabled;
            const toggleText = createEl('span');
            toggleText.textContent = 'Only show sources matched in ALL loaded catalogs';
            Object.assign(toggleText.style, { fontSize: '12px', color: '#e5e7eb' });
            left.append(toggle, toggleText);

            const right = createEl('div');
            Object.assign(right.style, { display: 'flex', alignItems: 'center', gap: '6px' });
            const sepLabel = createEl('span');
            sepLabel.textContent = 'sep';
            Object.assign(sepLabel.style, { fontSize: '11px', color: '#94a3b8' });
            const sepInput = createEl('input');
            sepInput.type = 'number';
            sepInput.step = '0.1';
            sepInput.min = '0';
            sepInput.value = String(cfg.radius_arcsec ?? 1.0);
            sepInput.disabled = !cfg.enabled;
            Object.assign(sepInput.style, {
                width: '86px',
                background: 'rgba(255,255,255,0.06)',
                color: '#e5e7eb',
                border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: '8px',
                padding: '6px 8px',
                fontSize: '12px'
            });
            const unit = createEl('span');
            unit.textContent = 'arcsec';
            Object.assign(unit.style, { fontSize: '11px', color: '#94a3b8' });
            right.append(sepLabel, sepInput, unit);

            row1.append(left, right);
            xmWrap.appendChild(row1);

            const hint = createEl('div');
            hint.textContent = 'Matches are computed on RA/Dec';
            Object.assign(hint.style, { fontSize: '11px', color: '#94a3b8' });
            xmWrap.appendChild(hint);

            const applyCfg = () => {
                try {
                    const enabled = !!toggle.checked;
                    const r = Number(sepInput.value);
                    window.catalogCrossMatchConfig = window.catalogCrossMatchConfig || {};
                    window.catalogCrossMatchConfig.enabled = enabled;
                    if (Number.isFinite(r) && r > 0) window.catalogCrossMatchConfig.radius_arcsec = r;
                    sepInput.disabled = !enabled;
                } catch (_) {}
                try { if (typeof window.canvasUpdateOverlay === 'function') window.canvasUpdateOverlay(); } catch (_) {}
                try { hostDoc.defaultView.__updateCatalogOverlayShownCounts && hostDoc.defaultView.__updateCatalogOverlayShownCounts(); } catch (_) {}
            };
            toggle.addEventListener('change', applyCfg);
            sepInput.addEventListener('input', () => {
                // don't spam; but quick redraw feels fine
                applyCfg();
            });

            expandedContent.appendChild(xmWrap);
        }
    } catch (_) {}

    // Boolean filters UI moved into per-catalog expandable panels (via the Filter button next to the count).

    const setCollapsedState = (collapsed) => {
        catalogOverlayControlsCollapsed = collapsed;
        try { window.catalogOverlayControlsCollapsed = collapsed; } catch (_) {}
        panel.dataset.state = collapsed ? 'collapsed' : 'expanded';
        if (collapsed) {
            expandedContent.style.opacity = '0';
            expandedContent.style.maxHeight = '0px';
            expandedContent.style.pointerEvents = 'none';
            expandedContent.style.overflow = 'hidden';
            panel.style.padding = '6px 12px';
            panel.style.minWidth = 'auto';
            collapseBtn.textContent = '➕';
            collapseBtn.setAttribute('aria-label', 'Show catalog controls');
        } else {
            expandedContent.style.opacity = '1';
            expandedContent.style.maxHeight = '600px';
            expandedContent.style.pointerEvents = 'auto';
            expandedContent.style.overflow = 'visible';
            panel.style.padding = '12px 20px';
            panel.style.minWidth = '260px';
            collapseBtn.textContent = '×';
            collapseBtn.setAttribute('aria-label', 'Collapse catalog controls');
        }
        // Use requestAnimationFrame to ensure DOM has updated before recalculating positions
        requestAnimationFrame(() => {
            positionCatalogControlsPanel(panel);
        });
    };

    collapseBtn.addEventListener('click', () => {
        // Small click animation on the header X/➕ button
        try {
            if (collapseBtn.animate) {
                collapseBtn.animate(
                    [{ transform: 'scale(1)' }, { transform: 'scale(0.92)' }, { transform: 'scale(1)' }],
                    { duration: 160, easing: 'ease-out' }
                );
            } else {
                collapseBtn.style.animation = 'none';
                void collapseBtn.offsetHeight;
                collapseBtn.style.animation = 'catalog-x-pop 160ms ease-out';
                setTimeout(() => { try { collapseBtn.style.animation = ''; } catch (_) {} }, 190);
            }
        } catch (_) {}
        setCollapsedState(!catalogOverlayControlsCollapsed);
    });

    // Opacity slider row
    const sliderRow = createEl('div');
    sliderRow.style.display = 'flex';
    sliderRow.style.alignItems = 'center';
    sliderRow.style.gap = '10px';

    const slider = createEl('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '1';
    slider.step = '0.05';
    slider.dataset.role = 'catalog-opacity-slider';
    let initialOpacity = 0.8;
    try {
        if (window.regionStyles && typeof window.regionStyles.opacity === 'number') {
            initialOpacity = window.regionStyles.opacity;
        }
    } catch (_) {}
    slider.value = initialOpacity;
    Object.assign(slider.style, {
        width: '220px',
        appearance: 'none',
        height: '4px',
        borderRadius: '999px',
        background: `linear-gradient(90deg, #22d3ee ${initialOpacity * 100}%, rgba(99,102,241,0.3) ${initialOpacity * 100}%)`
    });
    slider.addEventListener('input', (e) => {
        const numeric = parseFloat(e.target.value);
        const pct = numeric * 100;
        e.target.style.background = `linear-gradient(90deg, #22d3ee ${pct}%, rgba(99,102,241,0.3) ${pct}%)`;
        const label = panel.querySelector('span[data-role="catalog-opacity-value"]');
        if (label) label.textContent = numeric.toFixed(2);
        try {
            if (typeof window.setCatalogOverlayOpacity === 'function') {
                window.setCatalogOverlayOpacity(numeric);
            }
        } catch (_) {}
    });
    sliderRow.appendChild(slider);

    const sliderValue = createEl('span');
    sliderValue.dataset.role = 'catalog-opacity-value';
    sliderValue.style.fontSize = '12px';
    sliderValue.style.width = '40px';
    sliderValue.style.textAlign = 'right';
    sliderValue.textContent = initialOpacity.toFixed(2);
    sliderRow.appendChild(sliderValue);
    expandedContent.appendChild(sliderRow);

    // Color selection row
    const colorRow = createEl('div');
    colorRow.style.display = 'flex';
    colorRow.style.alignItems = 'center';
    colorRow.style.gap = '8px';

    const colorLabel = createEl('span');
    colorLabel.textContent = 'Color:';
    Object.assign(colorLabel.style, {
        fontSize: '12px',
        color: '#d1d5db'
    });

    // Populate color options from catalog quick styles (if available)
    let colorOptions = [];
    try {
        if (typeof window.getCatalogQuickStyleOptions === 'function') {
            colorOptions = window.getCatalogQuickStyleOptions();
        }
    } catch (_) {}
    if (!Array.isArray(colorOptions) || !colorOptions.length) {
        colorOptions = [
            { id: 'amber', label: 'Amber' },
            { id: 'emerald', label: 'Emerald' },
            { id: 'sky', label: 'Sky' },
            { id: 'violet', label: 'Violet' }
        ];
    }

    const swatchContainer = createEl('div');
    swatchContainer.style.display = 'flex';
    swatchContainer.style.alignItems = 'center';
    swatchContainer.style.gap = '6px';

    const ownerWin = window;
    let activeStyleId = null;
    try {
        const rs = ownerWin.regionStyles;
        if (rs && rs.borderColor) {
            const match = colorOptions.find(opt => {
                const c = (opt.style && opt.style.borderColor) || opt.style?.color;
                if (!c) return false;
                return String(c).toLowerCase() === String(rs.borderColor).toLowerCase();
            });
            if (match) activeStyleId = match.id;
        }
    } catch (_) {}

    const updateSwatchSelection = (selectedId) => {
        Array.from(swatchContainer.children).forEach((child) => {
            if (!child.dataset) return;
            const isSelected = child.dataset.styleId === selectedId;
            child.style.boxShadow = isSelected
                ? '0 0 0 2px #e5e7eb, 0 0 0 4px rgba(37,99,235,0.7)'
                : '0 0 0 1px rgba(15,23,42,0.9)';
            child.style.transform = isSelected ? 'scale(1.05)' : 'scale(1)';
        });
    };

    colorOptions.slice(0, 9).forEach((opt) => {
        const style = opt.style || {};
        const swatch = createEl('button');
        swatch.type = 'button';
        swatch.dataset.styleId = opt.id;
        Object.assign(swatch.style, {
            width: '18px',
            height: '18px',
            borderRadius: '999px',
            padding: '0',
            border: 'none',
            cursor: 'pointer',
            backgroundColor: style.backgroundColor && style.backgroundColor !== 'transparent'
                ? style.backgroundColor
                : (style.borderColor || '#ffffff'),
            boxShadow: '0 0 0 1px rgba(15,23,42,0.9)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 120ms ease, box-shadow 120ms ease',
        });
        if (style.backgroundColor === 'transparent' && style.borderColor) {
            // Inner dot to hint at fill when only a stroke color is defined
            const inner = createEl('div');
            Object.assign(inner.style, {
                width: '11px',
                height: '11px',
                borderRadius: '999px',
                backgroundColor: style.borderColor
            });
            swatch.appendChild(inner);
        }
        swatch.title = opt.label || opt.id;
        swatch.addEventListener('mouseenter', () => {
            if (swatch.style.transform !== 'scale(1.05)') {
                swatch.style.transform = 'scale(1.08)';
            }
        });
        swatch.addEventListener('mouseleave', () => {
            const isSelected = swatch.dataset.styleId === activeStyleId;
            swatch.style.transform = isSelected ? 'scale(1.05)' : 'scale(1)';
        });
        swatch.addEventListener('click', () => {
            try {
                const name = ownerWin.currentCatalogName || catalogName;
                if (ownerWin && typeof ownerWin.applyCatalogQuickStyle === 'function') {
                    ownerWin.applyCatalogQuickStyle(name, opt.id);
                    activeStyleId = opt.id;
                    updateSwatchSelection(activeStyleId);
                }
            } catch (_) {}
        });
        swatchContainer.appendChild(swatch);
    });

    // Default selection if none matched
    if (!activeStyleId && colorOptions.length) {
        activeStyleId = colorOptions[0].id;
    }
    updateSwatchSelection(activeStyleId);

    colorRow.appendChild(colorLabel);
    colorRow.appendChild(swatchContainer);
    expandedContent.appendChild(colorRow);

    const clearBtn = createEl('button');
    clearBtn.type = 'button';
    clearBtn.textContent = 'Clear';
    Object.assign(clearBtn.style, {
        border: 'none',
        background: 'rgba(239,68,68,0.18)',
        color: '#fecaca',
        padding: '4px 12px',
        borderRadius: '999px',
        cursor: 'pointer',
        fontSize: '12px'
    });

    clearBtn.addEventListener('click', () => {
        try {
            // In multi-catalog mode, "Clear" should remove ALL loaded catalogs.
            if (ownerWin && typeof ownerWin.clearAllCatalogs === 'function') {
                ownerWin.clearAllCatalogs();
            } else if (ownerWin && typeof ownerWin.clearCatalog === 'function') {
                ownerWin.clearCatalog();
            }
        } catch (_) {}
    });

    const actionRow = createEl('div');
    actionRow.style.display = 'flex';
    actionRow.style.justifyContent = 'flex-end';
    actionRow.style.gap = '10px';
    actionRow.appendChild(clearBtn);
    expandedContent.appendChild(actionRow);

    hostDoc.body.appendChild(panel);
    const paneId = window.__paneSyncId || 'root';
    panel.dataset.ownerId = paneId;
    try {
        if (hostDoc.defaultView) {
            hostDoc.defaultView.__catalogPanelOwnerId = paneId;
        }
    } catch (_) {}

    const reposition = () => positionCatalogControlsPanel(panel);
    reposition();
    const resizeTargets = [];
    if (typeof window !== 'undefined') resizeTargets.push(window);
    try {
        const topWin = window.top;
        if (topWin && topWin !== window && !resizeTargets.includes(topWin)) resizeTargets.push(topWin);
    } catch (_) {}
    panel.__catalogCleanup = () => {
        resizeTargets.forEach((target) => {
            try { target.removeEventListener('resize', reposition); } catch (_) {}
        });
    };
    resizeTargets.forEach((target) => {
        try { target.addEventListener('resize', reposition); } catch (_) {}
    });

    setCollapsedState(!!catalogOverlayControlsCollapsed);
    syncCatalogOverlayControls();

    // Keep visible-source count updated; also run once after each render so "Visible sources: —" doesn't stick.
    try {
        const updateNow = hostDoc.defaultView.__updateCatalogOverlayShownCounts || (() => {
            try {
                const p = hostDoc.getElementById('catalog-overlay-controls');
                if (!p) return;
                const stats = hostDoc.defaultView.__catalogOverlayRenderStats || window.__catalogOverlayRenderStats || null;
                const total = stats && typeof stats.totalShown === 'number' ? stats.totalShown : null;
                const summary = p.querySelector('[data-role="catalog-shown-summary"]');
                if (summary) summary.textContent = (total == null) ? 'Visible sources: —' : `Visible sources: ${total}`;
            } catch (_) {}
        });
        hostDoc.defaultView.__updateCatalogOverlayShownCounts = updateNow;
        if (!hostDoc.defaultView.__catalogRenderStatsListenerInstalled) {
            hostDoc.defaultView.__catalogRenderStatsListenerInstalled = true;
            hostDoc.addEventListener('catalog:renderstats', () => {
                try { hostDoc.defaultView.__updateCatalogOverlayShownCounts(); } catch (_) {}
            });
        }
        // Run once after each render
        setTimeout(() => {
            try { hostDoc.defaultView.__updateCatalogOverlayShownCounts(); } catch (_) {}
        }, 0);
    } catch (_) {}
}

function formatSegmentAlignmentSummary(info) {
    const summary = info?.reprojection_summary || {};
    const rows = [];
    const baseReasons = Array.isArray(info?.reprojection_reasons)
        ? info.reprojection_reasons
        : (info?.reprojection_reason ? [info.reprojection_reason] : []);
    const summaryReasons = Array.isArray(summary.reasons) ? summary.reasons : [];
    const reasonLines = baseReasons.length ? baseReasons : summaryReasons;
    reasonLines.forEach((text) => {
        rows.push({
            label: '',
            value: text
        });
    });
    if (summary.base_shape && summary.segment_shape) {
        rows.push({
            label: 'Image size (px)',
            value: `Input ${summary.base_shape.join(' × ')}, Segment ${summary.segment_shape.join(' × ')}`
        });
    }
    if (summary.base_scale_arcsec && summary.segment_scale_arcsec) {
        const formatScale = (arr) => arr.map((v) => Number(v).toFixed(3)).join(' / ');
        rows.push({
            label: 'Pixel scale (arcsec)',
            value: `Input ${formatScale(summary.base_scale_arcsec)} — Segment ${formatScale(summary.segment_scale_arcsec)}`
        });
    }
    if (typeof summary.center_offset_arcsec === 'number') {
        rows.push({
            label: 'Pointing offset',
            value: `${summary.center_offset_arcsec.toFixed(2)} arcsec`
        });
    }
    return rows;
}

function getTopLevelDocument() {
    try {
        if (window.top && window.top.document) {
            return window.top.document;
        }
    } catch (err) {
        /* ignore cross-origin */
    }
    return document;
}

function getCurrentFitsDisplayName() {
    try {
        const raw = window?.fitsData?.filename || window?.currentFitsFile || '';
        if (!raw) return '';
        const parts = String(raw).split(/[/\\]/);
        const name = parts[parts.length - 1];
        return name && name.trim() ? name.trim() : String(raw);
    } catch (err) {
        return '';
    }
}

function getActivePaneBounds() {
    try {
        const topWin = window.top;
        if (!topWin || topWin === window) return null;
        const holder = topWin.__activePaneHolder;
        if (holder && typeof holder.getBoundingClientRect === 'function') {
            return holder.getBoundingClientRect();
        }
    } catch (_) {
        /* ignore */
    }
    return null;
}

function positionSegmentControlsPanel(panel) {
    if (!panel) return;
    const hostDoc = getTopLevelDocument();
    const topWin = (() => { try { return window.top || window; } catch (_) { return window; } })();
    const viewportHeight = (topWin && topWin.innerHeight) || hostDoc.documentElement?.clientHeight || window.innerHeight || 0;
    const anchor = getActivePaneBounds();
    panel.style.position = 'fixed';
    panel.style.transform = 'translateX(-50%)';
    
    // Segment panel is always bottom-most (catalog panel goes above it)
    if (!anchor) {
        panel.style.left = '50%';
        panel.style.bottom = '24px';
        return;
    }
    const centerX = anchor.left + (anchor.width / 2);
    const bottomOffset = Math.max(16, viewportHeight - anchor.bottom + 24);
    panel.style.left = `${centerX}px`;
    panel.style.bottom = `${bottomOffset}px`;
    
    // After positioning segment panel, reposition catalog panel if it exists
    // (so catalog panel can recalculate its position relative to segment panel)
    const catalogPanel = hostDoc.getElementById('catalog-overlay-controls');
    if (catalogPanel) {
        positionCatalogControlsPanel(catalogPanel);
    }
}

function repositionSegmentOverlayControls() {
    const hostDoc = getTopLevelDocument();
    const panel = hostDoc.getElementById('segment-overlay-controls');
    if (panel) {
        positionSegmentControlsPanel(panel);
        // positionSegmentControlsPanel already repositions catalog panel if it exists
    }
}

function createSegmentModal(contentBuilder) {
    const hostDoc = getTopLevelDocument();
    const parentBody = hostDoc.body || document.body;
    const backdrop = hostDoc.createElement('div');
    Object.assign(backdrop.style, {
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(1px)',
        zIndex: 60050,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'auto'
    });
    const modal = hostDoc.createElement('div');
    Object.assign(modal.style, {
        width: 'min(520px, 92vw)',
        background: '#333',
        border: '1px solid #555',
        borderRadius: '14px',
        padding: '26px',
        color: '#f5f5f5',
        boxShadow: '0 18px 45px rgba(0,0,0,0.45)',
        fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        gap: '18px'
    });
    const cleanup = () => {
        backdrop.remove();
    };
    contentBuilder(modal, cleanup, hostDoc);
    backdrop.appendChild(modal);
    parentBody.appendChild(backdrop);
    return cleanup;
}

function showSegmentProgressOverlay(message) {
    const existing = document.getElementById('segment-progress-overlay');
    if (existing) existing.remove();
    const container = document.createElement('div');
    container.id = 'segment-progress-overlay';
    Object.assign(container.style, {
        position: 'fixed',
        left: '50%',
        bottom: '28px',
        transform: 'translateX(-50%)',
        background: '#333',
        border: '1px solid #555',
        borderRadius: '999px',
        padding: '9px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        color: '#f5f5f5',
        zIndex: 60040,
        boxShadow: '0 10px 25px rgba(0,0,0,0.45)',
        fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
    });
    const label = document.createElement('div');
    label.textContent = message || 'Processing segment...';
    label.style.fontSize = '12px';
    label.style.fontWeight = '600';
    const bar = document.createElement('div');
    Object.assign(bar.style, {
        width: '140px',
        height: '6px',
        borderRadius: '999px',
        background: 'rgba(255,255,255,0.15)',
        overflow: 'hidden'
    });
    const fill = document.createElement('div');
    Object.assign(fill.style, {
        width: '40%',
        height: '100%',
        background: 'linear-gradient(90deg,#f5f5f5,#b5b5b5)',
        borderRadius: '999px',
        animation: 'segment-progress-sheen 1.2s ease-in-out infinite'
    });
    bar.appendChild(fill);
    const style = document.createElement('style');
    style.textContent = `
    @keyframes segment-progress-sheen {
        0% { transform: translateX(-100%); }
        50% { transform: translateX(20%); }
        100% { transform: translateX(120%); }
    }`;
    document.head.appendChild(style);
    container.append(label, bar);
    document.body.appendChild(container);
    return () => {
        container.remove();
        style.remove();
    };
}

function promptSegmentReprojection(info, segmentName) {
    const summaryRows = formatSegmentAlignmentSummary(info);
    return new Promise((resolve) => {
        let resolved = false;
        const cleanup = createSegmentModal((modal, closeModal, hostDoc) => {
            const docRef = hostDoc || document;
            const baseDisplayName = getCurrentFitsDisplayName();
            const baseLabel = baseDisplayName ? `“${baseDisplayName}” (input FITS view)` : 'the current FITS view';
            const title = docRef.createElement('div');
            title.textContent = 'Segment Alignment Mismatch';
            Object.assign(title.style, { fontSize: '17px', fontWeight: '600', color: '#fdfdfd' });
            const description = docRef.createElement('div');
            description.textContent = `“${segmentName}” does not line up with ${baseLabel}.`;
            Object.assign(description.style, { fontSize: '13px', opacity: 0.85, color: '#e5e5e5' });
            const reproNote = docRef.createElement('div');
            reproNote.textContent = 'We only regrid the segment header to the input image—no convolution or smoothing is applied.';
            Object.assign(reproNote.style, {
                fontSize: '11px',
                color: '#cfcfcf',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '8px',
                padding: '8px 10px'
            });
            const detailsBox = docRef.createElement('div');
            Object.assign(detailsBox.style, {
                background: '#2a2a2a',
                border: '1px solid #4b4b4b',
                borderRadius: '12px',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                fontSize: '12px',
                color: '#f0f0f0',
                maxHeight: '220px',
                overflowY: 'auto'
            });
            if (summaryRows.length) {
                summaryRows.forEach((row) => {
                    const rowEl = docRef.createElement('div');
                    rowEl.style.display = 'flex';
                    rowEl.style.flexDirection = 'column';
                    const label = docRef.createElement('span');
                    label.textContent = row.label;
                    label.style.fontSize = '10px';
                    label.style.letterSpacing = '0.05em';
                    label.style.textTransform = 'uppercase';
                    label.style.opacity = 0.65;
                    const value = docRef.createElement('span');
                    value.textContent = row.value;
                    value.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
                    value.style.fontSize = '12px';
                    value.style.color = '#fdfdfd';
                    rowEl.append(label, value);
                    detailsBox.appendChild(rowEl);
                });
            } else {
                detailsBox.textContent = 'Differences detected between the base image and this segmentation map.';
            }
            const actions = docRef.createElement('div');
            Object.assign(actions.style, {
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '12px'
            });
            const cancelBtn = docRef.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.textContent = 'Cancel';
            Object.assign(cancelBtn.style, {
                padding: '10px 18px',
                borderRadius: '999px',
                border: '1px solid #555',
                background: 'transparent',
                color: '#f8f8f8',
                cursor: 'pointer'
            });
            const confirmBtn = docRef.createElement('button');
            confirmBtn.type = 'button';
            confirmBtn.textContent = 'Reproject & Load';
            Object.assign(confirmBtn.style, {
                padding: '10px 20px',
                borderRadius: '999px',
                border: 'none',
                background: 'linear-gradient(135deg,#38bdf8,#818cf8)',
                color: '#0f172a',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: '0 10px 25px rgba(56,189,248,0.35)'
            });
            cancelBtn.addEventListener('click', () => {
                if (resolved) return;
                resolved = true;
                closeModal();
                escTarget.removeEventListener('keydown', escHandler);
                resolve(false);
            });
            confirmBtn.addEventListener('click', () => {
                if (resolved) return;
                resolved = true;
                closeModal();
                escTarget.removeEventListener('keydown', escHandler);
                resolve(true);
            });
            actions.append(cancelBtn, confirmBtn);
            modal.append(title, description, reproNote, detailsBox, actions);
        });
        const escTarget = getTopLevelDocument();
        const escHandler = (event) => {
            if (event.key === 'Escape') {
                if (!resolved) {
                    resolved = true;
                    cleanup();
                    resolve(false);
                }
                escTarget.removeEventListener('keydown', escHandler);
            }
        };
        escTarget.addEventListener('keydown', escHandler);
    });
}

async function loadSegmentOverlay(segmentName, options = {}) {
    if (!segmentName) return;
    const requestedColorMap = options.colorMap || segmentOverlayPreferences.colorMap || 'labels';
    const silent = !!options.silent;
    const forceReproject = !!options.forceReproject;
    segmentOverlayPreferences.colorMap = requestedColorMap;
    window.segmentOverlayPreferences = segmentOverlayPreferences;
    const segmentPath = segmentName;
    let dismissProgress = null;
    if (!silent) {
        if (forceReproject) {
            dismissProgress = showSegmentProgressOverlay(`Reprojecting “${segmentPath}” to align with the current image...`);
        } else {
            showNotification(true, `Loading segment "${segmentPath}"...`);
        }
    }
    try {
        const response = await apiFetch('/segments/open/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                segment_name: segmentPath,
                color_map: requestedColorMap,
                force_reproject: forceReproject
            })
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const info = await response.json();
        if (dismissProgress) dismissProgress();
        else if (!silent) showNotification(false);
        if (info && info.needs_reprojection && !forceReproject) {
            const proceed = await promptSegmentReprojection(info, segmentName);
            if (!proceed) {
                showNotification('Segment overlay canceled', 2500, 'info');
                return;
            }
            return loadSegmentOverlay(segmentName, {
                ...options,
                forceReproject: true,
                silent: false
            });
        }
        if (info && info.needs_reprojection && forceReproject) {
            const reason = (Array.isArray(info.reprojection_reasons) && info.reprojection_reasons[0])
                || info.reprojection_reason
                || 'Segment still requires reprojection.';
            showNotification(reason, 4000, 'error');
            return;
        }
        attachSegmentOverlay(info);
    } catch (err) {
        if (dismissProgress) dismissProgress();
        else if (!silent) showNotification(false);
        console.error('[segments] Failed to load overlay', err);
        showNotification(`Failed to load segment: ${err.message}`, 3500, 'error');
    }
}

function attachSegmentOverlay(info) {
    const activeViewer = getActiveViewerInstance();
    if (!activeViewer || !activeViewer.addTiledImage) {
        showNotification('Viewer not ready. Open an image first.', 3000, 'warning');
        return;
    }
    clearSegmentOverlay('replace');
    const versionToken = Date.now();
    const tileSource = {
        width: info.width,
        height: info.height,
        tileSize: info.tileSize,
        maxLevel: info.maxLevel,
        minLevel: 0,
        getTileUrl(level, x, y) {
            const sid = getCurrentSessionId();
            const sidParam = sid ? `sid=${encodeURIComponent(sid)}&` : '';
            const mapParam = segmentOverlayPreferences.colorMap ? `cm=${encodeURIComponent(segmentOverlayPreferences.colorMap)}&` : '';
            return `/segments-tile/${encodeURIComponent(info.segment_id)}/${level}/${x}/${y}?${sidParam}${mapParam}v=${versionToken}`;
        }
    };

    if (window.currentTileInfo) {
        if (window.currentTileInfo.width !== info.width || window.currentTileInfo.height !== info.height) {
            console.warn('[segments] Segment dimensions differ from base image', {
                segment: { width: info.width, height: info.height },
                image: window.currentTileInfo
            });
        }
    }

    const overlayInfo = { ...info };
    activeViewer.addTiledImage({
        tileSource,
        opacity: DEFAULT_SEGMENT_OVERLAY_OPACITY,
        success: (event) => {
            const resolvedColorMap = info.color_map || segmentOverlayPreferences.colorMap || 'labels';
            segmentOverlayPreferences.colorMap = resolvedColorMap;
            window.segmentOverlayPreferences = segmentOverlayPreferences;
            const overlayName = info.segment_name || segmentOverlayState?.name || 'Segment';
            overlayInfo.color_map = resolvedColorMap;
            overlayInfo.segment_name = overlayName;
            overlayInfo.reprojected = !!info.reprojected;
            setSegmentOverlayState({
                id: info.segment_id,
                name: overlayName,
                tiledImage: event.item,
                opacity: DEFAULT_SEGMENT_OVERLAY_OPACITY,
                width: info.width,
                height: info.height,
                version: versionToken,
                colorMap: resolvedColorMap,
                sourceSegmentName: info.segment_name || info.segmentName || info.name || overlayName
            });
            segmentOverlayMetadata = { ...overlayInfo };
            window.segmentOverlayMetadata = segmentOverlayMetadata;
            updateSegmentsPanelOverlayInfo();
            renderSegmentOverlayControls(overlayInfo);
            const successMessage = info?.reprojected ? 'Segment reprojected and loaded' : 'Segment overlay loaded';
            showNotification(successMessage, 1500, 'success');
        },
        error: (evt) => {
            console.error('[segments] addTiledImage error', evt);
            showNotification('Failed to render segment overlay', 3500, 'error');
        }
    });
}

window.toggleSegmentsPanel = toggleSegmentsPanel;
window.clearSegmentOverlay = clearSegmentOverlay;
window.loadSegmentOverlay = loadSegmentOverlay;
function resolveActivePaneWindow() {
    try {
        const host = window.top || window;
        if (host && typeof host.getActivePaneWindow === 'function') {
            const pane = host.getActivePaneWindow();
            if (pane) return pane;
        }
    } catch (_) {
        /* ignore */
    }
    return window;
}

function openSegmentsFileBrowser() {
    const hostWin = (() => {
        try { return window.top || window; } catch (_) { return window; }
    })();
    const resolveLoaderContext = () => {
        const paneCtx = resolveActivePaneWindow();
        if (paneCtx && typeof paneCtx.loadSegmentOverlay === 'function') {
            return paneCtx;
        }
        if (typeof window.loadSegmentOverlay === 'function') {
            return window;
        }
        return null;
    };
    let opener = null;
    if (hostWin && typeof hostWin.showFileBrowser === 'function') {
        opener = hostWin.showFileBrowser.bind(hostWin);
    } else if (typeof showFileBrowser === 'function') {
        opener = showFileBrowser;
    } else if (typeof window.showFileBrowser === 'function') {
        opener = window.showFileBrowser;
    }
    if (!opener) {
        showNotification('File browser not available', 3000, 'error');
        return;
    }
    ensureGlobalOverlayPortal();
    opener((selectedPath) => {
        if (!selectedPath) {
            return;
        }
        const loaderCtx = resolveLoaderContext();
        const loader = loaderCtx && typeof loaderCtx.loadSegmentOverlay === 'function'
            ? loaderCtx.loadSegmentOverlay.bind(loaderCtx)
            : null;
        if (!loader) {
            showNotification('Viewer not ready. Open an image first.', 3500, 'error');
            return;
        }
        loader(selectedPath);
    });
}

window.openSegmentsFileBrowser = openSegmentsFileBrowser;

async function ensureSession() {
    // Single-flight session bootstrap across all scripts in this tab.
    // Prevents racing /session/start calls that can cause mismatched SIDs between
    // `/load-file/...` and `/fits-binary/...` on the first page load.
    try {
        // Prefer pane-specific SID from URL or pre-set global
        let forced = null;
        try {
            if (typeof window !== 'undefined') {
                forced = (window.__forcedSid)
                    || (new URLSearchParams(window.location.search).get('sid'))
                    || (new URLSearchParams(window.location.search).get('pane_sid'));
            }
        } catch(_) {}
        if (forced) {
            try { window.__nelouraSid = forced; } catch (_) {}
            return forced;
        }

        try {
            if (window.__nelouraSid) return window.__nelouraSid;
        } catch (_) {}

        let sid = null;
        try { sid = sessionStorage.getItem('sid'); } catch (_) {}
        if (sid) {
            try { window.__nelouraSid = sid; } catch (_) {}
            return sid;
        }

        // If another module is already starting a session, await it.
        try {
            if (window.__nelouraSessionPromise) {
                const s = await window.__nelouraSessionPromise;
                if (s) {
                    try { sessionStorage.setItem('sid', s); } catch (_) {}
                    try { window.__nelouraSid = s; } catch (_) {}
                }
                return s;
            }
        } catch (_) {}

        // Start a new session exactly once.
        const starter = (async () => {
            const r = await fetch('/session/start', { credentials: 'same-origin' });
            if (!r.ok) throw new Error('Failed to start session');
            const j = await r.json();
            return j && j.session_id ? j.session_id : null;
        })();

        try { window.__nelouraSessionPromise = starter; } catch (_) {}

        sid = await starter;
        if (sid) {
            try { sessionStorage.setItem('sid', sid); } catch (_) {}
            try { window.__nelouraSid = sid; } catch (_) {}
        }
        return sid;
    } catch (e) {
        try { window.__nelouraSessionPromise = null; } catch (_) {}
        console.warn('Session init failed', e);
        return null;
    }
}



// Prefer pane SID very early for all modules loaded in this frame
try {
    (function seedForcedSid() {
        const sp = new URLSearchParams(window.location.search);
        const forced = (window.__forcedSid) || sp.get('sid') || sp.get('pane_sid') || null;
        if (forced) {
            window.__forcedSid = forced;
        }
    })();
} catch(_) {}

async function apiFetch(url, options = {}) {
    const sid = await ensureSession();
    const headers = options.headers ? { ...options.headers } : {};
    if (sid) headers['X-Session-ID'] = sid;
    try {
        const u = new URL(url, window.location.origin);
        if (sid && !u.searchParams.get('sid')) u.searchParams.set('sid', sid);
        return fetch(u.toString(), { ...options, headers });
    } catch(_) {
        return fetch(url, { ...options, headers });
    }
}

document.addEventListener("DOMContentLoaded", async function () {
    try {
        await loadColorcetPalettes();
    } catch (err) {
        console.warn('Continuing without Colorcet palettes:', err);
    }
    // Warm up session
    ensureSession().catch(() => {});
    // Create a main container for the app's primary content
    const mainContainer = document.createElement('div');
    mainContainer.id = 'main-container';
    document.body.appendChild(mainContainer);

    // Create a circular progress indicator (kept for future use but no auto popup)
    createProgressIndicator();
    
    // Load FITS data directly
    loadFitsData();

    // If a deep-linked catalog is provided (?catalog=...), apply it once the viewer is ready.
    // (No-op if no catalog params are present.)
    try { __applyCatalogDeepLinkIfPresent(); } catch (_) {}
    
    // Add keyboard shortcuts
    document.addEventListener("keydown", function (event) {
        if (event.key === "+") {
            zoomIn();
        } else if (event.key === "-") {
            zoomOut();
        } else if (event.key.toLowerCase() === "r") {
            resetView();
        }
    });

    // Load catalogs on startup
    loadCatalogs();
    
    // Add dynamic range control
    // createDynamicRangeControl();

    // Initialize the usage monitor icon and popup functionality
    if (typeof initializeUsageMonitor === 'function') {
        initializeUsageMonitor();
    } else {
        console.error('Usage monitor initialization function not found. Ensure usage.js is loaded correctly.');
    }

    // Initialize the credit button
    if (typeof initializeCreditButton === 'function') {
        initializeCreditButton();
    } else {
        console.error('Credit button initialization function not found. Ensure credit.js is loaded correctly.');
    }
});

function getXAxisLabelText() {
    const unit = (typeof getBunit === 'function') ? getBunit() : (
        (window.fitsData && window.fitsData.wcs && window.fitsData.wcs.bunit) ? window.fitsData.wcs.bunit :
        (window.fitsData && window.fitsData.bunit) ? window.fitsData.bunit :
        (window.parsedWCS && window.parsedWCS.bunit) ? window.parsedWCS.bunit : null
    );
    return unit ? `Pixel Values (${unit})` : 'Pixel Values';
}


function createProgressIndicator() {
    // Create container
    const progressContainer = document.createElement('div');
    progressContainer.id = 'progress-container';
    progressContainer.style.position = 'absolute';
    progressContainer.style.top = '50%';
    progressContainer.style.left = '50%';
    progressContainer.style.transform = 'translate(-50%, -50%)';
    progressContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    progressContainer.style.borderRadius = '10px';
    progressContainer.style.padding = '20px';
    progressContainer.style.display = 'none';
    progressContainer.style.zIndex = '2000';
    progressContainer.style.textAlign = 'center';
    
    // Create spinner
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    spinner.style.width = '50px';
    spinner.style.height = '50px';
    spinner.style.border = '5px solid rgba(255, 255, 255, 0.3)';
    spinner.style.borderRadius = '50%';
    spinner.style.borderTop = '5px solid white';
    spinner.style.margin = '0 auto 15px auto';
    spinner.style.animation = 'spin 1s linear infinite';
    
    // Create percentage text
    const percentage = document.createElement('div');
    percentage.id = 'progress-percentage';
    percentage.style.color = 'white';
    percentage.style.fontFamily = 'Arial, sans-serif';
    percentage.style.fontSize = '18px';
    percentage.style.fontWeight = 'bold';
    percentage.textContent = '0%';
    
    // Create message text
    const text = document.createElement('div');
    text.id = 'progress-text';
    text.style.color = 'white';
    text.style.fontFamily = 'Arial, sans-serif';
    text.style.fontSize = '14px';
    text.style.marginTop = '5px';
    
    // Add animation style
    const style = document.createElement('style');
    style.textContent = `
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
    
    // Append elements
    document.head.appendChild(style);
    progressContainer.appendChild(spinner);
    progressContainer.appendChild(percentage);
    progressContainer.appendChild(text);
    document.body.appendChild(progressContainer);
    
    // Start progress simulation when shown
    startProgressSimulation();
}


/**
 * Show a progress bar notification to the user
 * @param {string} message - The message to display
 * @param {number} duration - How long to show the message in milliseconds
 * @param {string} type - Type of notification ('info', 'success', 'error', 'warning')
 */

// Rate limiting storage
const notificationRateLimit = {
    messages: new Map(),
    cleanupInterval: null,
    
    // Check if message should be shown (not rate limited)
    canShow(message) {
        const now = Date.now();
        const lastShown = this.messages.get(message);
        
        // If message was shown less than 300ms ago, rate limit it
        if (lastShown && (now - lastShown) < 300) {
            return false;
        }
        
        // Update last shown time
        this.messages.set(message, now);
        
        // Start cleanup if not already running
        if (!this.cleanupInterval) {
            this.startCleanup();
        }
        
        return true;
    },
    
    // Clean up old entries every 5 seconds
    startCleanup() {
        this.cleanupInterval = setInterval(() => {
            const now = Date.now();
            const cutoff = now - 5000; // 5 seconds ago
            
            for (const [message, timestamp] of this.messages.entries()) {
                if (timestamp < cutoff) {
                    this.messages.delete(message);
                }
            }
            
            // Stop cleanup if no entries left
            if (this.messages.size === 0) {
                clearInterval(this.cleanupInterval);
                this.cleanupInterval = null;
            }
        }, 5000);
    }
};

function showNotification(message, duration = 1000, type = 'info') {
    // In multi-panel / diagonal split modes, panes are iframes. A notification created inside an iframe
    // cannot appear above sibling iframes regardless of z-index. Route notifications to the TOP window
    // so they always render above the grid.
    try {
        const topWin = window.top;
        const sp = new URLSearchParams(window.location.search || '');
        const inPane = (window.self !== window.top) || sp.has('pane_sid') || sp.get('mp') === '1';
        if (inPane && topWin && topWin !== window && typeof topWin.showNotification === 'function') {
            return topWin.showNotification(message, duration, type);
        }
    } catch (_) {}

    // Special-case loading semantics (used widely across the app):
    // - showNotification(true, 'Loading xyz...') => show a STICKY loading toast until cleared/replaced
    // - showNotification(false) => clear current toast(s)
    //
    // Many call sites pass the loading text in the 2nd argument position (historical API),
    // so we accept a string `duration` as the loading message here.
    const notificationContainerId = 'notification-container';
    if (message === false) {
        try {
            const c = document.getElementById(notificationContainerId);
            if (c) {
                const existing = c.querySelectorAll('.notification');
                existing.forEach(notif => {
                    try { if (notif.dataset.timerId) clearTimeout(notif.dataset.timerId); } catch (_) {}
                    try { notif.remove(); } catch (_) {}
                });
            }
        } catch (_) {}
        return null;
    }

    const isLoading = (message === true);
    let messageText = '';
    let durationMs = duration;
    if (isLoading) {
        messageText = (typeof duration === 'string' && duration.trim()) ? duration.trim() : 'Loading...';
        // Sticky by default while loading.
        durationMs = (typeof duration === 'number' && isFinite(duration) && duration > 0) ? duration : 0;
    } else {
        messageText = String(message || '');
        if (messageText.trim() === '') messageText = 'Loading...';
        durationMs = (typeof duration === 'number' && isFinite(duration)) ? duration : 1000;
        if (durationMs > 1500) durationMs = 1500;
    }
    message = messageText;
    duration = durationMs;
    
    // Rate limiting check
    if (!notificationRateLimit.canShow(message)) {
        console.log('Notification rate limited:', message);
        return null;
    }
    
    // console.log('Notification:', message);
    
    // Create notification container if it doesn't exist.
    // NOTE: `static/index.html` includes an empty <div id="notification-container"></div>.
    // If it already exists, we MUST still force the positioning styles; otherwise it behaves like
    // a normal block element (full-width near the top), which is what you were seeing.
    let notificationContainer = document.getElementById('notification-container');
    if (!notificationContainer) {
        notificationContainer = document.createElement('div');
        notificationContainer.id = 'notification-container';
        document.body.appendChild(notificationContainer);
    }
    // Idempotently enforce the container's placement/size (in case another script/CSS mutated it).
    try {
        notificationContainer.style.position = 'fixed';
        notificationContainer.style.left = '20px';
        notificationContainer.style.bottom = '20px';
        notificationContainer.style.right = 'auto';
        notificationContainer.style.top = 'auto';
        notificationContainer.style.width = '320px';
        notificationContainer.style.maxWidth = 'calc(100vw - 40px)';
        notificationContainer.style.zIndex = '20000000000';
        notificationContainer.style.display = 'flex';
        notificationContainer.style.flexDirection = 'column';
        notificationContainer.style.gap = '8px';
        notificationContainer.style.pointerEvents = 'none';
        notificationContainer.style.margin = '0';
        notificationContainer.style.padding = '0';
    } catch (_) {}


    // Clear all existing notifications before showing the new one
    const existingNotifications = notificationContainer.querySelectorAll('.notification');
    existingNotifications.forEach(notif => {
        // Clear any pending timers
        if (notif.dataset.timerId) {
            clearTimeout(notif.dataset.timerId);
        }
        // Remove immediately without animation for instant replacement
        notif.remove();
    });
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.style.position = 'relative';
    notification.style.width = '100%';
    notification.style.height = '60px';
    notification.style.backgroundColor = 'rgba(33, 33, 33, 0.95)';
    notification.style.color = 'white';
    notification.style.display = 'flex';
    notification.style.alignItems = 'center';
    notification.style.fontFamily = 'Arial, sans-serif';
    notification.style.fontSize = '14px';
    notification.style.backdropFilter = 'blur(8px)';
    notification.style.webkitBackdropFilter = 'blur(8px)';
    notification.style.borderTop = '1px solid rgba(255, 255, 255, 0.1)';
    notification.style.borderRadius = '8px';
    notification.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    notification.style.overflow = 'hidden';
    notification.style.transform = 'translateY(100%)';
    notification.style.opacity = '0';
    notification.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
    notification.style.pointerEvents = 'all';
    
    // Create progress bar background
    const progressBackground = document.createElement('div');
    progressBackground.style.position = 'absolute';
    progressBackground.style.top = '0';
    progressBackground.style.left = '0';
    progressBackground.style.width = '100%';
    progressBackground.style.height = '4px';
    progressBackground.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
    notification.appendChild(progressBackground);
    
    // Create progress bar fill
    const progressFill = document.createElement('div');
    progressFill.style.position = 'absolute';
    progressFill.style.top = '0';
    progressFill.style.left = '0';
    progressFill.style.width = '0%';
    progressFill.style.height = '4px';
    // If duration is 0, this is a "sticky" (indeterminate) loading toast.
    progressFill.style.transition = (typeof duration === 'number' && duration > 0) ? `width ${duration}ms linear` : 'none';
    
    // Set type-specific colors, gradients and icons
    let iconHtml = '';
    let progressGradient = '';
    if (type === 'success') {
        progressGradient = 'linear-gradient(90deg, #4CAF50, #66BB6A, #4CAF50)';
        iconHtml = `<div style="margin: 0 16px 0 20px; flex-shrink: 0;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" stroke-width="2" class="success-icon">
                <path d="M20 6L9 17l-5-5"/>
            </svg>
        </div>`;
    } else if (type === 'error') {
        progressGradient = 'linear-gradient(90deg, #F44336, #EF5350, #F44336)';
        iconHtml = `<div style="margin: 0 16px 0 20px; flex-shrink: 0;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F44336" stroke-width="2" class="error-icon">
                <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
        </div>`;
    } else if (type === 'warning') {
        progressGradient = 'linear-gradient(90deg, #FF9800, #FFB74D, #FF9800)';
        iconHtml = `<div style="margin: 0 16px 0 20px; flex-shrink: 0;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FF9800" stroke-width="2" class="warning-icon">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
        </div>`;
    } else {
        progressGradient = 'linear-gradient(90deg, #2196F3, #42A5F5, #2196F3)';
        iconHtml = `<div style="margin: 0 16px 0 20px; flex-shrink: 0;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2196F3" stroke-width="2" class="info-icon">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 8v4m0 4h.01"/>
            </svg>
        </div>`;
    }
    
    progressFill.style.background = progressGradient;
    progressFill.style.backgroundSize = '200% 100%';
    progressFill.style.animation = 'shimmer 2s infinite';
    progressBackground.appendChild(progressFill);
    
    // Add CSS animation for shimmer / indeterminate effect
    if (!document.getElementById('notification-styles')) {
        const style = document.createElement('style');
        style.id = 'notification-styles';
        style.textContent = `
            @keyframes shimmer {
                0% { background-position: 200% 0; }
                100% { background-position: -200% 0; }
            }

            @keyframes indeterminateBar {
                0% { transform: translateX(-120%); }
                100% { transform: translateX(320%); }
            }
            
            @keyframes bounce {
                0%, 20%, 53%, 80%, 100% { transform: translate3d(0, 0, 0); }
                40%, 43% { transform: translate3d(0, -4px, 0); }
                70% { transform: translate3d(0, -2px, 0); }
                90% { transform: translate3d(0, -1px, 0); }
            }
            
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            
            @keyframes shake {
                0%, 100% { transform: translateX(0); }
                10%, 30%, 50%, 70%, 90% { transform: translateX(-2px); }
                20%, 40%, 60%, 80% { transform: translateX(2px); }
            }
            
            @keyframes pulse {
                0% { transform: scale(1); }
                50% { transform: scale(1.1); }
                100% { transform: scale(1); }
            }
            
            .success-icon {
                animation: bounce 0.6s ease-out;
            }
            
            .error-icon {
                animation: shake 0.5s ease-in-out;
            }
            
            .warning-icon {
                animation: pulse 1s ease-in-out infinite;
            }
            
            .info-icon {
                animation: spin 2s linear infinite;
            }
        `;
        document.head.appendChild(style);
    }
    
    // Create content container
    const contentContainer = document.createElement('div');
    contentContainer.style.display = 'flex';
    contentContainer.style.alignItems = 'center';
    contentContainer.style.width = '100%';
    contentContainer.style.marginTop = '4px';
    
    // Create message content
    const messageContainer = document.createElement('div');
    messageContainer.style.flex = '1';
    messageContainer.style.padding = '0 20px';
    messageContainer.style.fontWeight = '500';
    messageContainer.textContent = message;
    
    // Create close button
    const closeButton = document.createElement('div');
    closeButton.innerHTML = '&times;';
    closeButton.style.marginRight = '20px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.color = '#aaa';
    closeButton.style.fontSize = '24px';
    closeButton.style.fontWeight = 'bold';
    closeButton.style.padding = '5px';
    closeButton.style.borderRadius = '50%';
    closeButton.style.width = '30px';
    closeButton.style.height = '30px';
    closeButton.style.display = 'flex';
    closeButton.style.alignItems = 'center';
    closeButton.style.justifyContent = 'center';
    closeButton.style.transition = 'background-color 0.2s ease';
    closeButton.style.flexShrink = '0';
    
    closeButton.addEventListener('mouseenter', () => {
        closeButton.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
    });
    
    closeButton.addEventListener('mouseleave', () => {
        closeButton.style.backgroundColor = 'transparent';
    });
    
    closeButton.addEventListener('click', () => {
        removeNotification(notification);
    });
    
    // Assemble the content
    contentContainer.innerHTML = iconHtml;
    contentContainer.appendChild(messageContainer);
    contentContainer.appendChild(closeButton);
    notification.appendChild(contentContainer);
    
    // Append to container and show
    notificationContainer.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.style.transform = 'translateY(0)';
        notification.style.opacity = '1';
    }, 50);

    // Configure progress bar + lifetime
    let timerId = null;
    if (typeof duration === 'number' && duration > 0) {
        // Timed toast: fill the bar and auto-dismiss
        setTimeout(() => { try { progressFill.style.width = '100%'; } catch (_) {} }, 80);
        timerId = setTimeout(() => {
            removeNotification(notification);
        }, duration);
        notification.dataset.timerId = String(timerId);
    } else {
        // Sticky toast: show an indeterminate bar, no auto-dismiss.
        try {
            progressFill.style.width = '35%';
            progressFill.style.animation = 'indeterminateBar 1.15s ease-in-out infinite';
        } catch (_) {}
        notification.dataset.timerId = '';
    }
    
    // Function to remove notification with animation
    function removeNotification(notif) {
        if (!notif) return;
        
        // Clear the timeout to prevent duplicate removals
        clearTimeout(notif.dataset.timerId);
        
        // Animate out
        notif.style.transform = 'translateY(100%)';
        notif.style.opacity = '0';
        
        // Wait for animation to finish, then remove
        setTimeout(() => {
            if (notif.parentNode) {
                notif.parentNode.removeChild(notif);
                
                // If container is empty, remove it too
                if (notificationContainer.children.length === 0) {
                    notificationContainer.parentNode.removeChild(notificationContainer);
                }
            }
        }, 300);
    }
    
    return notification;
}

// Example usage:
// showNotification("Task completed successfully!", 2000, "success");
// showNotification("An error occurred while processing", 3000, "error");
// showNotification("Please review your settings", 2500, "warning");
// showNotification("Loading data...", 1500, "info");

// Example usage:
// showNotification("Task completed successfully!", 2000, "success");
// showNotification("An error occurred while processing", 3000, "error");
// showNotification("Please review your settings", 2500, "warning");
// showNotification("Loading data...", 1500, "info");

// Example usage:
// showNotification("Task completed successfully!", 2000, "success");
// showNotification("An error occurred while processing", 3000, "error");
// showNotification("Please review your settings", 2500, "warning");
// showNotification("Loading data...", 1500, "info");

// Example usage:
// showNotification("Task completed successfully!", 2000, "success");
// showNotification("An error occurred while processing", 3000, "error");
// showNotification("Please review your settings", 2500, "warning");
// showNotification("Loading data...", 1500, "info");



// Simulate progress percentage
let progressInterval;
let currentProgress = 0;

function startProgressSimulation() {
    // Reset progress
    currentProgress = 0;
    const percentageElement = document.getElementById('progress-percentage');
    if (percentageElement) {
        percentageElement.textContent = '0%';
    }
    
    // Clear any existing interval
    stopProgressSimulation();
    
    // Start new interval - use a faster update interval (50ms instead of 200ms)
    progressInterval = setInterval(() => {
        const percentageElement = document.getElementById('progress-percentage');
        if (percentageElement) {
            // Increment progress more quickly
            if (currentProgress < 50) {
                currentProgress += 15;
            } else if (currentProgress < 80) {
                currentProgress += 10;
            } else if (currentProgress < 95) {
                currentProgress += 5;
            }
            
            // Cap at 95% - the final 5% happens when loading completes
            if (currentProgress > 95) {
                currentProgress = 95;
            }
            
            percentageElement.textContent = `${Math.floor(currentProgress)}%`;
        }
    }, 50);
}

function stopProgressSimulation() {
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
        
        // Set to 100% when complete
        const percentageElement = document.getElementById('progress-percentage');
        if (percentageElement) {
            percentageElement.textContent = '100%';
        }
    }
}


async function applyPercentile(percentileValue) {
    console.log(`Attempting to apply ${percentileValue * 100}% percentile`);

    // Multi-panel: toolbar/popups may invoke this in the top window which has no fitsData.
    // Delegate to the active pane (or a best-effort pane with fitsData) instead of erroring.
    if (!window.fitsData) {
        try {
            const isTop = (window.top === window);
            if (isTop) {
                const wrap = document.getElementById('multi-panel-container');
                const grid = document.getElementById('multi-panel-grid');
                const multiActive = !!(wrap && wrap.style.display !== 'none' && grid && grid.querySelectorAll('iframe').length >= 1);
                if (multiActive) {
                    const hasFits = (w) => !!(w && w.fitsData);
                    let target = (typeof window.getActivePaneWindow === 'function') ? window.getActivePaneWindow() : null;
                    if (!hasFits(target)) {
                        const frames = Array.from(grid.querySelectorAll('iframe'));
                        for (const f of frames) {
                            const w = f && f.contentWindow;
                            if (hasFits(w)) { target = w; break; }
                        }
                    }
                    if (target && target !== window && typeof target.applyPercentile === 'function') {
                        return target.applyPercentile(percentileValue);
                    }
                }
            }
        } catch (_) {}
        showNotification('Image metadata not loaded. Please load an image first.', 3000, 'error');
        return;
    }

    const isTiledViewActive = window.tiledViewer && typeof window.tiledViewer.isOpen === 'function' && window.tiledViewer.isOpen();

    try {
        showNotification(true, 'Applying percentile...');

        let newMinValue, newMaxValue;

        // 1) Prefer exact percentile from local pixel data (works even in tiled mode if overview cache exists)
        let usedLocal = false;
        try {
            const src = await getHistogramPixelDataSource();
            const arr = src && (Array.isArray(src.pixels) ? src.pixels : Array.from(src.pixels || []));
            const values = (arr || []).filter(v => isFinite(v));
            if (values.length > 0) {
                values.sort((a, b) => a - b);
                const N = values.length;
                const k = Math.max(0, Math.min(N - 1, Math.floor(percentileValue * (N - 1))));
                const cutoff = values[k];
                newMinValue = values[0];
                newMaxValue = Math.max(newMinValue + Math.max(1e-18, Math.abs(newMinValue) * 1e-6), cutoff);
                usedLocal = true;
            }
        } catch (e) {
            // fall through to server path
        }

        // 2) Fallback: server histogram CDF (increase bins for better resolution)
        if (!usedLocal && isTiledViewActive) {
            const histData = await fetchServerHistogram(null, null, 4096);
            const counts = Array.isArray(histData.counts) ? histData.counts : [];
            const overallMin = histData.min_value;
            const overallMax = histData.max_value;

            if (!counts.length || !isFinite(overallMin) || !isFinite(overallMax) || overallMax <= overallMin) {
                throw new Error('Invalid histogram or range from server');
            }

            let total = 0;
            for (let i = 0; i < counts.length; i++) total += counts[i];
            if (total <= 0) throw new Error('Histogram counts are all zero');

            const target = percentileValue * total;
            let cum = 0, idx = 0;
            for (; idx < counts.length; idx++) {
                const next = cum + counts[idx];
                if (next >= target) break;
                cum = next;
            }

            const binWidth = (overallMax - overallMin) / counts.length;
            const inBin = counts[idx] > 0 ? (target - cum) / counts[idx] : 0;
            const cutoff = overallMin + (idx + Math.max(0, Math.min(1, inBin))) * binWidth;

            newMinValue = overallMin;
            const eps = Math.max(1e-18, Math.abs(newMinValue) * 1e-6);
            newMaxValue = Math.min(overallMax, Math.max(newMinValue + eps, cutoff));
        }

        // 3) If still nothing (unlikely), bail
        if (!isFinite(newMinValue) || !isFinite(newMaxValue)) {
            throw new Error('Failed to compute percentile range');
        }

        // Update inputs and client state (formatted for tiny values)
        setRangeInputs(newMinValue, newMaxValue);
        window.fitsData.min_value = newMinValue;
        window.fitsData.max_value = newMaxValue;
        window.fitsData.initial_min_value = newMinValue;
        window.fitsData.initial_max_value = newMaxValue;

        // Immediate visual feedback
        if (typeof drawHistogramLines === 'function') {
            drawHistogramLines(newMinValue, newMaxValue, false);
        }
        if (typeof requestHistogramUpdate === 'function') {
            requestHistogramUpdate();
        }

        // Apply to viewer/server (handles tiled and non-tiled) and refresh tiles/UI
        applyDynamicRange();

        showNotification(`Applied ${percentileValue * 100}% percentile`, 1200, 'success');
    } catch (e) {
        console.error('Error applying percentile:', e);
        showNotification(`Error applying percentile: ${e.message || e}`, 2500, 'error');
    }
}
// ===== CRITICAL FIX FOR VERY LARGE HST FILES =====

// Fixed error handling function to properly detect large files and prevent crashes
function initializeViewerWithFitsData() {
    console.log("Initializing viewer with FITS data");
    
    if (!window.fitsData) {
        console.error("Error: No FITS data available");
        showNotification(false);
        showNotification("Error: No FITS data available", 3000);
        return;
    }
    
    try {
        // Validate FITS data first - with extra error handling
        if (!window.fitsData.data) {
            throw new Error("Missing FITS data array");
        }
        
        if (!Array.isArray(window.fitsData.data)) {
            throw new Error("FITS data is not an array");
        }
        
        if (window.fitsData.data.length === 0) {
            throw new Error("FITS data array is empty");
        }
        
        if (!Array.isArray(window.fitsData.data[0])) {
            throw new Error("FITS data rows are not arrays");
        }
        
        const width = window.fitsData.width;
        const height = window.fitsData.height;
        
        // Extra validation for width and height
        if (!width || !height || width <= 0 || height <= 0) {
            throw new Error(`Invalid dimensions: ${width}x${height}`);
        }
        
        // Check for very large images
        const totalPixels = width * height;
        console.log(`FITS data dimensions: ${width}x${height} (${totalPixels} pixels)`);
        
        // Enhanced large file detection - 100 million pixels threshold
        if (totalPixels > 100000000) { 
            console.log(`Large image detected: ${width}x${height} (${totalPixels} pixels)`);
            showNotification(`Large image detected (${width}x${height}). Processing using optimized method...`, 4000, 'info');
            
            // For very large images, always use the specialized large image handler
            // with null viewport settings since we're initializing from scratch
            console.log("Using dedicated large image handler");
            processLargeImageInMainThread(null);
            return;
        }
        
        console.log(`FITS data range: min=${window.fitsData.min_value}, max=${window.fitsData.max_value}`);
        
        // For smaller images, try the worker first
        if (window.Worker) {
            console.log("Using Web Worker for image processing");
            processImageInWorker();
        } else {
            console.log("Web Worker not available, processing image in main thread");
            processImageInMainThread();
        }
    } catch (error) {
        // Enhanced error reporting
        console.error("Error initializing viewer:", error);
        console.error("Error details:", error.message);
        console.error("FITS data structure:", window.fitsData ? 
            `width: ${window.fitsData.width}, height: ${window.fitsData.height}, has data: ${!!window.fitsData.data}` : 
            "No FITS data");
        
        showNotification(false);
        showNotification(`Error initializing viewer: ${error.message}. Trying fallback method...`, 3000, 'error');
        
        // Last resort fallback - if we have any FITS data at all, try the large image processor
        if (window.fitsData && window.fitsData.data) {
            console.log("Attempting fallback to large image processor");
            processLargeImageInMainThread(null);
        }
    }
}



// Modified process binary data function
function processBinaryData(arrayBuffer, filepath) {
    try {
        showNotification(true, 'Processing FITS data...');
        
        // Use a setTimeout to let the UI update before heavy processing
        setTimeout(() => {
            try {
                const dataView = new DataView(arrayBuffer);
                let offset = 0;
                
                // Read dimensions
                const width = dataView.getInt32(offset, true);
                offset += 4;
                const height = dataView.getInt32(offset, true);
                offset += 4;
                
                console.log(`Image dimensions: ${width}x${height}`);
                
                // Check if dimensions are reasonable and warn about large images
                const totalPixels = width * height;
                if (totalPixels > 100000000) { // 100 million pixels
                    console.warn(`Very large image detected: ${width}x${height} = ${totalPixels} pixels`);
                    showNotification(`Large image detected (${width}x${height}). Processing may take longer.`, 4000, 'warning');
                }
                
                // Read min/max values
                const minValue = dataView.getFloat32(offset, true);
                offset += 4;
                const maxValue = dataView.getFloat32(offset, true);
                offset += 4;
                
                console.log(`Data range: ${minValue} to ${maxValue}`);
                
                // Read WCS info
                const hasWCS = dataView.getUint8(offset);
                offset += 1;
                
                let wcsInfo = null;
                if (hasWCS) {
                    // Read WCS JSON length
                    const wcsJsonLength = dataView.getInt32(offset, true);
                    offset += 4;
                    
                    if (wcsJsonLength > 0 && wcsJsonLength < 10000) { // Sanity check
                        // Read WCS JSON string
                        const wcsJsonBytes = new Uint8Array(arrayBuffer, offset, wcsJsonLength);
                        const wcsJsonString = new TextDecoder().decode(wcsJsonBytes);
                        try {
                            wcsInfo = JSON.parse(wcsJsonString);
                            console.log("WCS Info:", wcsInfo);
                        } catch (e) {
                            console.error("Error parsing WCS JSON:", e);
                            wcsInfo = null;
                        }
                        offset += wcsJsonLength;
                    } else {
                        console.warn(`Invalid WCS JSON length: ${wcsJsonLength}`);
                    }
                }
                
                // Read BUNIT if available
                let bunit = '';
                const bunitLength = dataView.getInt32(offset, true);
                offset += 4;
                
                if (bunitLength > 0 && bunitLength < 100) { // Sanity check
                    // Read BUNIT string
                    const bunitBytes = new Uint8Array(arrayBuffer, offset, bunitLength);
                    bunit = new TextDecoder().decode(bunitBytes);
                    offset += bunitLength;
                    
                    console.log(`BUNIT: ${bunit}`);
                    
                    // Add padding to ensure 4-byte alignment for the image data
                    const padding = (4 - (offset % 4)) % 4;
                    offset += padding;
                }
                
                if (wcsInfo) {
                    wcsInfo.bunit = bunit;
                }
                
                // Ensure offset is aligned to 4 bytes for Float32Array
                offset = Math.ceil(offset / 4) * 4;
                
                // Calculate expected pixel count and validate against remaining buffer size
                const pixelCount = width * height;
                const remainingBytes = arrayBuffer.byteLength - offset;
                const remainingFloats = remainingBytes / 4;
                
                if (remainingFloats < pixelCount) {
                    throw new Error(`Buffer too small for image data: expected ${pixelCount} pixels, but only have space for ${remainingFloats}`);
                }
                
                console.log(`Reading ${pixelCount} pixels from offset ${offset} (buffer size: ${arrayBuffer.byteLength})`);
                
                // Create data structure with chunked processing
                showNotification(true, 'Creating image data structures...');
                
                // Determine optimal chunk size based on image dimensions
                // For very large images, use larger chunks to reduce overhead
                let chunkSize = 100000; // Default
                if (height > 10000) {
                    chunkSize = 200000;
                }
                
                const data = [];
                const imageDataArray = new Float32Array(arrayBuffer, offset, pixelCount);
                
                // Process in chunks with yield to UI thread
                let processedRows = 0;
                
                function processNextChunk() {
                    const endRow = Math.min(processedRows + chunkSize, height);
                    const progress = Math.round((processedRows / height) * 100);
                    
                    showNotification(true, `Processing data: ${progress}%`);
                    
                    // Process a chunk of rows
                    for (let y = processedRows; y < endRow; y++) {
                        const row = new Array(width); // Pre-allocate row array
                        for (let x = 0; x < width; x++) {
                            row[x] = imageDataArray[y * width + x];
                        }
                        data.push(row);
                    }
                    
                    processedRows = endRow;
                    
                    // If we have more rows to process, schedule the next chunk
                    if (processedRows < height) {
                        setTimeout(processNextChunk, 0); // Yield to UI thread
                    } else {
                        // All rows processed, finalize
                        finalizeImageProcessing();
                    }
                }
                
                // Start processing chunks
                processNextChunk();
                
                // Function to finalize processing after all chunks are done
                function finalizeImageProcessing() {
                    // Store FITS data globally
                    window.fitsData = {
                        data: data,
                        width: width,
                        height: height,
                        min_value: minValue,
                        max_value: maxValue,
                        wcs: wcsInfo,
                        filename: filepath
                    };

                    // Check if we're in multi-panel mode - if so, don't clear catalogs as they should persist across panels
                    let isMultiPanelMode = false;
                    try {
                        const topWin = (window.top && window.top !== window) ? window.top : window;
                        const wrap = topWin.document.getElementById('multi-panel-container');
                        const grid = topWin.document.getElementById('multi-panel-grid');
                        isMultiPanelMode = wrap && wrap.style.display !== 'none' && grid && grid.querySelectorAll('iframe').length >= 2;
                    } catch (_) {}

                    if (typeof clearAllCatalogs === 'function') {
                        let isPaneContext = false;
                        try {
                            const sp = new URLSearchParams(window.location.search || '');
                            isPaneContext = sp.has('pane_sid') || sp.get('mp') === '1';
                        } catch (_) {}
                        const shouldPreserveCatalogs = isMultiPanelMode || isPaneContext || !!window.__preserveCatalogs;
                        if (shouldPreserveCatalogs) {
                            console.log("Multi-panel mode detected - preserving catalogs across panels.");
                        } else {
                            console.log("New FITS file opened (fast loader), clearing all existing catalogs.");
                            clearAllCatalogs();
                        }
                    }

                    // console.timeEnd('parseBinaryData');
                    
                    // Apply 99% percentile for better initial display
                    try {
                        showNotification(true, 'Calculating optimal display range...');
                        
                        // Calculate and apply 99% percentile with sampling for efficiency
                        const validPixels = [];
                        const maxSampleSize = 500000; // Limit samples for speed
                        const skipFactor = Math.max(1, Math.floor((width * height) / maxSampleSize));
                        
                        // For very large images, use an even larger skip factor
                        const actualSkipFactor = (width * height > 100000000) ? skipFactor * 2 : skipFactor;
                        
                        // Sample in a grid pattern for better coverage
                        for (let y = 0; y < height; y += Math.max(1, Math.floor(Math.sqrt(actualSkipFactor)))) {
                            for (let x = 0; x < width; x += Math.max(1, Math.floor(Math.sqrt(actualSkipFactor)))) {
                                const value = data[y][x];
                                if (!isNaN(value) && isFinite(value)) {
                                    validPixels.push(value);
                                }
                                
                                // Limit total samples to maxSampleSize
                                if (validPixels.length >= maxSampleSize) break;
                            }
                            if (validPixels.length >= maxSampleSize) break;
                        }
                        
                        if (validPixels.length > 0) {
                            validPixels.sort((a, b) => a - b);
                            const minValue = validPixels[0];
                            const maxValue = validPixels[Math.floor(validPixels.length * 0.99)]; // Using 99% percentile
                            
                            // Apply the dynamic range directly
                            window.fitsData.min_value = minValue;
                            window.fitsData.max_value = maxValue;
                            
                            console.log(`Applied 99% percentile: min=${minValue}, max=${maxValue}`);
                        }
                    } catch (error) {
                        console.error("Error applying initial percentile:", error);
                    }
                    
                    // Initialize viewer with the data
                    showNotification(true, 'Creating viewer...');
                    setTimeout(() => {
                        if (typeof initializeViewerWithFitsData === 'function') {
                            initializeViewerWithFitsData();
                        } else {
                            showNotification(false);
                            showNotification('Error: Viewer initialization function not found', 3000, 'error');
                        }
                        
                        // Extract just the filename from the full path for the notification
                        const filename = filepath.split('/').pop();
                        showNotification(`Loaded ${filename} successfully`, 2000, 'success');
                    }, 100);
                }
                
            } catch (error) {
                console.error('Error processing binary data:', error);
                showNotification(false);
                showNotification(`Error: ${error.message}`, 5000, 'error');
            }
        }, 100); // Small delay to let the UI update
        
    } catch (error) {
        console.error('Error in processBinaryData:', error);
        showNotification(false);
        showNotification(`Error: ${error.message}`, 5000, 'error');
    }
}

function processImageInMainThread() {
    // Show progress indicator
    showNotification(true, 'Processing image...');
    
    // Store current viewport settings
    let currentZoom = 0;
    let currentPan = null;
    if (viewer && viewer.viewport) {
        currentZoom = viewer.viewport.getZoom();
        currentPan = viewer.viewport.getCenter();
        console.log("Stored viewport settings:", currentZoom, currentPan);
    }
    
    // Create a canvas to render the FITS data
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Set canvas dimensions to match the data
    canvas.width = fitsData.width;
    canvas.height = fitsData.height;
    
    // Create an ImageData object
    const imageData = ctx.createImageData(fitsData.width, fitsData.height);
    
    console.log("Creating image data from FITS values");
    
    // Fill the ImageData with FITS values
    let minVal = Infinity;
    let maxVal = -Infinity;
    let nanCount = 0;
    
    // Use a more efficient approach with typed arrays
    const data = imageData.data;
    
    // Pre-calculate range for faster scaling
    const minValue = fitsData.min_value;
    const maxValue = fitsData.max_value;
    const range = maxValue - minValue;
    // CHANGE: Use global COLOR_MAPS and SCALING_FUNCTIONS
    const colorMapFunc = COLOR_MAPS[currentColorMap] || COLOR_MAPS.grayscale;
    const scalingFunc = SCALING_FUNCTIONS[currentScaling] || SCALING_FUNCTIONS.linear;
    const invertColormap = !!(window.currentColorMapInverted ?? currentColorMapInverted);
    
    console.time('processPixels');
    for (let y = 0; y < fitsData.height; y++) {
        for (let x = 0; x < fitsData.width; x++) {
            const idx = (y * fitsData.width + x) * 4;
            
            // Get value
            let val = fitsData.data[y][x];
            
            // Track min/max for debugging
            if (!isNaN(val) && isFinite(val)) {
                minVal = Math.min(minVal, val);
                maxVal = Math.max(maxVal, val);
            } else {
                nanCount++;
                val = 0; // Replace NaN with 0
            }
            
            // Apply scaling using fixed min/max values
            val = Math.max(minValue, Math.min(val, maxValue));
            
            // Apply the selected scaling function
            const normalizedVal = scalingFunc(val, minValue, maxValue);
            
            // Convert to 0-255 range for display
            const scaledVal = Math.round(normalizedVal * 255);
            
            // Apply color map
            const colorIndex = invertColormap ? 255 - scaledVal : scaledVal;
            const [r, g, b] = colorMapFunc(colorIndex);
            
            // Set RGBA values
            data[idx] = r;     // R
            data[idx + 1] = g; // G
            data[idx + 2] = b; // B
            data[idx + 3] = 255; // A (fully opaque)
        }
    }
    console.timeEnd('processPixels');
    
    console.log(`Image data statistics: min=${minVal}, max=${maxVal}, NaN count=${nanCount}`);
    
    // Put the image data on the canvas
    ctx.putImageData(imageData, 0, 0);
    
    // Convert canvas to data URL
    const dataUrl = canvas.toDataURL('image/png');
    console.log("Created data URL from canvas");
    
    // If viewer already exists, update it; otherwise initialize a new one
    if (viewer) {
        console.log("Updating existing OpenSeadragon viewer");
        
        // Update the image
        viewer.open({
            type: 'image',
            url: dataUrl,
            buildPyramid: false
        });
        
        // Add handler to restore viewport settings immediately when the image is loaded
        viewer.addOnceHandler('open', function() {
            viewer.viewport.zoomTo(currentZoom);
            viewer.viewport.panTo(currentPan);
            console.log("Restored viewport settings:", currentZoom, currentPan);
            
            // Attempt to disable image smoothing again after new image is opened
            if (viewer.drawer) {
                viewer.drawer.setImageSmoothingEnabled(false);
            }

            // Hide progress indicator once the image is loaded
            showNotification(false);
        });
    } else {
        // Initialize a new viewer
        console.log("Initializing new OpenSeadragon viewer");
        initializeOpenSeadragonViewer(dataUrl);
    }
}




// Fixed processImageInWorker function that properly handles COLOR_MAPS and SCALING_FUNCTIONS
function processImageInWorker() {
    // Store current viewport settings before processing
    let viewportSettings = null;
    if (viewer && viewer.viewport) {
        viewportSettings = {
            zoom: viewer.viewport.getZoom(),
            center: viewer.viewport.getCenter()
        };
        console.log("Stored viewport settings:", viewportSettings);
    }
    
    // Show progress indicator
    showNotification(true, 'Processing image...');
    
    try {
        // For very large images, use chunked processing in main thread
        const totalPixels = window.fitsData.width * window.fitsData.height;
        if (totalPixels > 100000000) { // 100 million pixels
            console.log(`Very large image detected: ${window.fitsData.width}x${window.fitsData.height} = ${totalPixels} pixels`);
            console.log('Using chunked processing in main thread for large image');
            processLargeImageInMainThread(viewportSettings);
            return;
        }
        
        // We need to define the color maps and scaling functions directly in the worker code
        // const workerCode = `
        // self.onmessage = function(e) {
        //     const fitsData = e.data.fitsData;
        //     if (!fitsData || !fitsData.data || !fitsData.width || !fitsData.height) {
        //         self.postMessage({
        //             error: 'Invalid FITS data passed to worker'
        //         });
        //         return;
        //     }
            
        //     const colorMap = e.data.colorMap || 'grayscale';
        //     const scaling = e.data.scaling || 'linear';
        //     const width = fitsData.width;
        //     const height = fitsData.height;
            
        //     // Create array for image data
        //     const imageData = new Uint8ClampedArray(width * height * 4);
            
        //     // Define color maps within the worker
        //     const COLOR_MAPS = {
        //         grayscale: (val) => [val, val, val],
        //         viridis: (val) => {
        //             const v = val / 255; let r, g, b;
        //             if (v < 0.25) { r = 68 + v * 4 * (33 - 68); g = 1 + v * 4 * (144 - 1); b = 84 + v * 4 * (140 - 84); }
        //             else if (v < 0.5) { r = 33 + (v - 0.25) * 4 * (94 - 33); g = 144 + (v - 0.25) * 4 * (201 - 144); b = 140 + (v - 0.25) * 4 * (120 - 140); }
        //             else if (v < 0.75) { r = 94 + (v - 0.5) * 4 * (190 - 94); g = 201 + (v - 0.5) * 4 * (222 - 201); b = 120 + (v - 0.5) * 4 * (47 - 120); }
        //             else { r = 190 + (v - 0.75) * 4 * (253 - 190); g = 222 + (v - 0.75) * 4 * (231 - 222); b = 47 + (v - 0.75) * 4 * (37 - 47); }
        //             return [Math.round(r), Math.round(g), Math.round(b)];
        //         },
        //         plasma: (val) => {
        //             const v = val / 255; let r, g, b;
        //             if (v < 0.25) { r = 13 + v * 4 * (126 - 13); g = 8 + v * 4 * (8 - 8); b = 135 + v * 4 * (161 - 135); }
        //             else if (v < 0.5) { r = 126 + (v - 0.25) * 4 * (203 - 126); g = 8 + (v - 0.25) * 4 * (65 - 8); b = 161 + (v - 0.25) * 4 * (107 - 161); }
        //             else if (v < 0.75) { r = 203 + (v - 0.5) * 4 * (248 - 203); g = 65 + (v - 0.5) * 4 * (150 - 65); b = 107 + (v - 0.5) * 4 * (58 - 107); }
        //             else { r = 248 + (v - 0.75) * 4 * (239 - 248); g = 150 + (v - 0.75) * 4 * (204 - 150); b = 58 + (v - 0.75) * 4 * (42 - 58); }
        //             return [Math.round(r), Math.round(g), Math.round(b)];
        //         },
        //         // ADDED: Inferno
        //         inferno: (val) => {
        //             const v = val / 255; let r, g, b;
        //             if (v < 0.2) { r = 0 + v * 5 * 50; g = 0 + v * 5 * 10; b = 4 + v * 5 * 90; }
        //             else if (v < 0.4) { r = 50 + (v-0.2)*5 * (120-50); g = 10 + (v-0.2)*5 * (28-10); b = 94 + (v-0.2)*5 * (109-94); }
        //             else if (v < 0.6) { r = 120 + (v-0.4)*5 * (187-120); g = 28 + (v-0.4)*5 * (55-28); b = 109 + (v-0.4)*5 * (84-109); }
        //             else if (v < 0.8) { r = 187 + (v-0.6)*5 * (236-187); g = 55 + (v-0.6)*5 * (104-55); b = 84 + (v-0.6)*5 * (36-84); }
        //             else { r = 236 + (v-0.8)*5 * (251-236); g = 104 + (v-0.8)*5 * (180-104); b = 36 + (v-0.8)*5 * (26-36); }
        //             return [Math.round(r), Math.round(g), Math.round(b)];
        //         },
        //         // ADDED: Cividis
        //         cividis: (val) => {
        //             const v = val / 255; let r, g, b;
        //             if (v < 0.2) { r = 0 + v*5 * 33; g = 32 + v*5 * (61-32); b = 76 + v*5 * (107-76); }
        //             else if (v < 0.4) { r = 33 + (v-0.2)*5 * (85-33); g = 61 + (v-0.2)*5 * (91-61); b = 107 + (v-0.2)*5 * (108-107); }
        //             else if (v < 0.6) { r = 85 + (v-0.4)*5 * (123-85); g = 91 + (v-0.4)*5 * (122-91); b = 108 + (v-0.4)*5 * (119-108); }
        //             else if (v < 0.8) { r = 123 + (v-0.6)*5 * (165-123); g = 122 + (v-0.6)*5 * (156-122); b = 119 + (v-0.6)*5 * (116-119); }
        //             else { r = 165 + (v-0.8)*5 * (217-165); g = 156 + (v-0.8)*5 * (213-156); b = 116 + (v-0.8)*5 * (122-116); }
        //             return [Math.round(r), Math.round(g), Math.round(b)];
        //         },
        //         hot: (val) => {
        //             const v = val / 255; let r, g, b;
        //             if (v < 1/3) { r = v * 3 * 255; g = 0; b = 0; } 
        //             else if (v < 2/3) { r = 255; g = (v - 1/3) * 3 * 255; b = 0; }
        //             else { r = 255; g = 255; b = (v - 2/3) * 3 * 255; }
        //             return [Math.round(r), Math.round(g), Math.round(b)];
        //         },
        //         // ADDED: Cool
        //         cool: (val) => {
        //             const v = val / 255;
        //             return [Math.round(v * 255), Math.round((1 - v) * 255), 255];
        //         },
        //         rainbow: (val) => {
        //             const v = val / 255; const a = (1 - v) * 4; const X = Math.floor(a); const Y = a - X; let r, g, b;
        //             switch(X) {
        //                 case 0: r = 1.0; g = Y; b = 0.0; break;
        //                 case 1: r = 1.0 - Y; g = 1.0; b = 0.0; break;
        //                 case 2: r = 0.0; g = 1.0; b = Y; break;
        //                 case 3: r = 0.0; g = 1.0-Y; b = 1.0; break;
        //                 case 4: r = 0.0; g = 0.0; b = 1.0; break;
        //             }
                    
        //             return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
        //         },
        //         // ADDED: Jet
        //         jet: (val) => {
        //             const v = val / 255; let r = 0, g = 0, b = 0;
        //             if (v < 0.125) { b = 0.5 + 4 * v; } 
        //             else if (v < 0.375) { g = 4 * (v - 0.125); b = 1.0; } 
        //             else if (v < 0.625) { r = 4 * (v - 0.375); g = 1.0; b = 1.0 - 4 * (v - 0.375); } 
        //             else if (v < 0.875) { r = 1.0; g = 1.0 - 4 * (v - 0.625); } 
        //             else { r = 1.0 - 4 * (v - 0.875); } 
        //             return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
        //         }
        //     };
            
        //     // Define scaling functions within the worker
        //     const SCALING_FUNCTIONS = {
        //         // Linear scaling (default)
        //         linear: (val, min, max) => {
        //             if (min === max) return 0.5; // Handle edge case
        //             return (val - min) / (max - min);
        //         },
                
        //         // Logarithmic scaling
        //         logarithmic: (val, min, max) => {
        //             // Ensure we don't take log of zero or negative numbers
        //             const minPositive = Math.max(min, 1e-10);
        //             const adjustedVal = Math.max(val, minPositive);
        //             const logMin = Math.log(minPositive);
        //             const logMax = Math.log(max);
                    
        //             if (logMin === logMax) return 0.5; // Handle edge case
        //             return (Math.log(adjustedVal) - logMin) / (logMax - logMin);
        //         },
                
        //         // Square root scaling
        //         sqrt: (val, min, max) => {
        //             if (min === max) return 0.5; // Handle edge case
        //             const normalized = (val - min) / (max - min);
        //             return Math.sqrt(Math.max(0, normalized));
        //         },
                
        //         // Power scaling (gamma = 2)
        //         power: (val, min, max) => {
        //             if (min === max) return 0.5; // Handle edge case
        //             const normalized = (val - min) / (max - min);
        //             return Math.pow(Math.max(0, normalized), 2);
        //         },
                
        //         // Asinh (inverse hyperbolic sine) scaling
        //         asinh: (val, min, max) => {
        //             if (min === max) return 0.5; // Handle edge case
                    
        //             // Normalize to -1 to 1 range for asinh
        //             const normalized = 2 * ((val - min) / (max - min)) - 1;
                    
        //             // Apply asinh and rescale to 0-1
        //             const scaled = (Math.asinh(normalized * 3) / Math.asinh(3) + 1) / 2;
        //             return Math.max(0, Math.min(1, scaled));
        //         }
        //     };
            
        //     // Process pixels
        //     let minVal = Infinity;
        //     let maxVal = -Infinity;
        //     let nanCount = 0;
            
        //     // Pre-calculate range for faster scaling
        //     const minValue = fitsData.min_value;
        //     const maxValue = fitsData.max_value;
        //     const colorMapFunc = COLOR_MAPS[colorMap] || COLOR_MAPS.grayscale;
        //     const scalingFunc = SCALING_FUNCTIONS[scaling] || SCALING_FUNCTIONS.linear;
            
        //     try {
        //         // Process in smaller chunks to avoid UI freezes
        //         const chunkSize = 1000; // Process 1000 rows at a time
        //         let currentRow = 0;
                
        //         function processChunk() {
        //             const endRow = Math.min(currentRow + chunkSize, height);
                    
        //             for (let y = currentRow; y < endRow; y++) {
        //                 for (let x = 0; x < width; x++) {
        //                     const idx = (y * width + x) * 4;
                            
        //                     // Get value and handle NaN/Infinity
        //                     let val = fitsData.data[y][x];
        //                     if (isNaN(val) || !isFinite(val)) {
        //                         nanCount++;
        //                         val = 0; // Replace NaN/Infinity with 0
        //                     } else {
        //                         minVal = Math.min(minVal, val);
        //                         maxVal = Math.max(maxVal, val);
        //                     }
                            
        //                     // Apply scaling using fixed min/max values
        //                     val = Math.max(minValue, Math.min(val, maxValue));
                            
        //                     // Apply the selected scaling function
        //                     const normalizedVal = scalingFunc(val, minValue, maxValue);
                            
        //                     // Convert to 0-255 range for display
        //                     const scaledVal = Math.round(normalizedVal * 255);
                            
        //                     // Apply color map
        //                     const [r, g, b] = colorMapFunc(scaledVal);
                            
        //                     // Set RGBA values
        //                     imageData[idx] = r;     // R
        //                     imageData[idx + 1] = g; // G
        //                     imageData[idx + 2] = b; // B
        //                     imageData[idx + 3] = 255; // A (fully opaque)
        //                 }
        //             }
                    
        //             currentRow = endRow;
                    
        //             // If we've processed all rows, send the result
        //             if (currentRow >= height) {
        //                 self.postMessage({
        //                     imageData: imageData.buffer,
        //                     width: width,
        //                     height: height,
        //                     stats: {
        //                         minVal: minVal,
        //                         maxVal: maxVal,
        //                         nanCount: nanCount
        //                     }
        //                 }, [imageData.buffer]);  // Transfer the buffer for better performance
        //             } else {
        //                 // Otherwise, schedule the next chunk
        //                 setTimeout(processChunk, 0);
        //             }
        //         }
                
        //         // Start processing
        //         processChunk();
        //     } catch (error) {
        //         // Handle any errors
        //         self.postMessage({
        //             error: error.message || 'Error processing image data'
        //         });
        //     }
        // };
        // `;
        
        // Create a blob URL for the worker
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(blob);
        
        // Create and start the worker
        const worker = new Worker(workerUrl);
        
        // Handle errors
        worker.onerror = function(error) {
            console.error('Worker error:', error);
            URL.revokeObjectURL(workerUrl);
            worker.terminate();
            
            // Fall back to main thread processing for large images
            console.log('Worker error - falling back to main thread processing');
            processLargeImageInMainThread(viewportSettings);
        };
        
        // Send data to worker
        if (!window.fitsData || !window.fitsData.data) {
            console.error('Error: No valid FITS data to send to worker');
            URL.revokeObjectURL(workerUrl);
            worker.terminate();
            showNotification(false);
            showNotification('Error: No valid FITS data available', 3000, 'error');
            return;
        }
        
        console.log('Sending data to worker: width=' + window.fitsData.width + ', height=' + window.fitsData.height);
        worker.postMessage({
            fitsData: window.fitsData,
            colorMap: window.currentColorMap || 'grayscale',
            scaling: window.currentScaling || 'linear',
            invertColormap: !!(window.currentColorMapInverted ?? currentColorMapInverted)
        });
        
        // Handle the worker's response
        worker.onmessage = function(e) {
            const result = e.data;
            
            // Check for errors
            if (result.error) {
                console.error('Worker reported error:', result.error);
                URL.revokeObjectURL(workerUrl);
                worker.terminate();
                
                // Fall back to main thread processing
                console.log('Worker reported error - falling back to main thread processing');
                processLargeImageInMainThread(viewportSettings);
                return;
            }
            
            console.log(`Image data statistics: min=${result.stats.minVal}, max=${result.stats.maxVal}, NaN count=${result.stats.nanCount}`);
            
            // Create a canvas and put the image data on it
            const canvas = document.createElement('canvas');
            canvas.width = result.width;
            canvas.height = result.height;
            
            const ctx = canvas.getContext('2d');
            const imageData = new ImageData(new Uint8ClampedArray(result.imageData), result.width, result.height);
            ctx.putImageData(imageData, 0, 0);
            
            // Convert canvas to data URL
            const dataUrl = canvas.toDataURL('image/png');
            console.log("Created data URL from canvas");
            
            // If viewer already exists, update it; otherwise initialize a new one
            if (viewer) {
                console.log("Updating existing OpenSeadragon viewer");
                
                // Update the image
                viewer.open({
                    type: 'image',
                    url: dataUrl,
                    buildPyramid: false
                });
                
                // Add handler to restore viewport settings immediately when the image is loaded
                viewer.addOnceHandler('open', function() {
                    if (viewportSettings) {
                        viewer.viewport.zoomTo(viewportSettings.zoom);
                        viewer.viewport.panTo(viewportSettings.center);
                        console.log("Restored viewport settings:", viewportSettings);
                    }
                    // Hide progress indicator once the image is loaded
                    showNotification(false);
                });
            } else {
                // Initialize a new viewer
                console.log("Initializing new OpenSeadragon viewer");
                initializeOpenSeadragonViewer(dataUrl);
            }
            
            // Clean up
            URL.revokeObjectURL(workerUrl);
            worker.terminate();
        };
    } catch (error) {
        console.error('Error creating worker:', error);
        // Fall back to main thread processing
        console.log('Error creating worker - falling back to main thread processing');
        processLargeImageInMainThread(viewportSettings);
    }
}




// Fixed large image processor to handle very large files better
function processLargeImageInMainThread(viewportSettings) {
    console.log("Processing large image in main thread with safe chunking");
    showNotification(true, 'Processing large image...');
    
    try {
        // Validate FITS data first
        if (!window.fitsData || !window.fitsData.data || !window.fitsData.width || !window.fitsData.height) {
            throw new Error("Invalid FITS data for large image processing");
        }
        
        // Create a canvas to render the FITS data
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Set canvas dimensions to match the data
        canvas.width = window.fitsData.width;
        canvas.height = window.fitsData.height;
        
        // Create an ImageData object
        const imageData = ctx.createImageData(window.fitsData.width, window.fitsData.height);
        const data = imageData.data;
        
        // Pre-calculate range for scaling - with error protection
        const minValue = window.fitsData.min_value || 0;
        const maxValue = window.fitsData.max_value || 1;
        
        // Get color map function - with fallbacks
        const colorMapFunc = (window.COLOR_MAPS && window.COLOR_MAPS[window.currentColorMap]) || 
                            (window.COLOR_MAPS && window.COLOR_MAPS.grayscale) || 
                            ((val) => [val, val, val]); // Default grayscale
        
        // Get scaling function - with fallbacks
        const scalingFunc = (window.SCALING_FUNCTIONS && window.SCALING_FUNCTIONS[window.currentScaling]) || 
                           (window.SCALING_FUNCTIONS && window.SCALING_FUNCTIONS.linear) || 
                           ((val, min, max) => (val - min) / (max - min)); // Default linear
        const invertColormap = !!(window.currentColorMapInverted ?? currentColorMapInverted);
        
        // Process the image in smaller chunks
        const chunkSize = 50; // Use an even smaller chunk size for extremely large images
        let currentRow = 0;
        
        function processNextChunk() {
            showNotification(true, `Processing large image: ${Math.round((currentRow / window.fitsData.height) * 100)}%`);
            
            const endRow = Math.min(currentRow + chunkSize, window.fitsData.height);
            
            // Process this chunk of rows
            for (let y = currentRow; y < endRow; y++) {
                for (let x = 0; x < window.fitsData.width; x++) {
                    const idx = (y * window.fitsData.width + x) * 4;
                    
                    // Get value with error handling
                    let val;
                    try {
                        val = window.fitsData.data[y][x];
                        // Handle NaN and Infinity
                        if (isNaN(val) || !isFinite(val)) {
                            val = 0;
                        }
                    } catch (e) {
                        val = 0; // Fail gracefully for missing data
                    }
                    
                    // Apply scaling using min/max values
                    val = Math.max(minValue, Math.min(val, maxValue));
                    
                    // Apply scaling function with error handling
                    let normalizedVal;
                    try {
                        normalizedVal = scalingFunc(val, minValue, maxValue);
                        // Verify result is valid
                        if (isNaN(normalizedVal) || !isFinite(normalizedVal)) {
                            normalizedVal = 0;
                        }
                    } catch (e) {
                        normalizedVal = 0;
                    }
                    
                    // Convert to 0-255 range
                    const scaledVal = Math.min(255, Math.max(0, Math.round(normalizedVal * 255)));
                    
                    // Apply color map with error handling
                    let r = scaledVal, g = scaledVal, b = scaledVal;
                    try {
                        const rgb = colorMapFunc(invertColormap ? 255 - scaledVal : scaledVal);
                        r = rgb[0];
                        g = rgb[1];
                        b = rgb[2];
                    } catch (e) {
                        // Fall back to grayscale
                    }
                    
                    // Set RGBA values
                    data[idx] = r;
                    data[idx + 1] = g;
                    data[idx + 2] = b;
                    data[idx + 3] = 255;
                }
            }
            
            currentRow = endRow;
            
            // If we've processed all rows, finish up
            if (currentRow >= window.fitsData.height) {
                finishProcessing();
            } else {
                // Otherwise schedule the next chunk with a longer delay for very large images
                // This gives the browser more time to process UI events
                setTimeout(processNextChunk, 20);
            }
        }
        
        function finishProcessing() {
            try {
                // Put the image data on the canvas
                ctx.putImageData(imageData, 0, 0);
                
                // Convert canvas to data URL
                const dataUrl = canvas.toDataURL('image/png');
                console.log("Created data URL from canvas for large image");
                
                // If viewer already exists, update it; otherwise initialize a new one
                if (viewer) {
                    console.log("Updating existing OpenSeadragon viewer");
                    
                    // Update the image
                    viewer.open({
                        type: 'image',
                        url: dataUrl,
                        buildPyramid: false
                    });
                    
                    // Add handler to restore viewport settings immediately when the image is loaded
                    viewer.addOnceHandler('open', function() {
                        if (viewportSettings) {
                            viewer.viewport.zoomTo(viewportSettings.zoom);
                            viewer.viewport.panTo(viewportSettings.center);
                            console.log("Restored viewport settings:", viewportSettings);
                        }
                        // Hide progress indicator once the image is loaded
                        showNotification(false);
                    });
                } else {
                    // Initialize a new viewer optimized for large images
                    console.log("Initializing new OpenSeadragon viewer for large image");
                    initializeOpenSeadragonViewer(dataUrl, true); // true indicates this is a large image
                }
            } catch (error) {
                console.error("Error finalizing large image processing:", error);
                showNotification(false);
                showNotification('Error processing large image: ' + error.message, 5000, 'error');
            }
        }
        
        // Start processing
        processNextChunk();
    } catch (error) {
        console.error("Critical error in large image processor:", error);
        showNotification(false);
        showNotification(`Error processing image: ${error.message}. Please try a different file.`, 5000, 'error');
    }
}



// Helper function to close all popups
function closeAllInfoPopups() {
    if (window.infoPopups && window.infoPopups.length > 0) {
        // Create a copy of the array to avoid issues with array modification during iteration
        const popupsToClose = [...window.infoPopups];
        popupsToClose.forEach(popup => {
            if (popup && popup.style.display !== 'none') {
                hideInfoPopup(popup);
            }
        });
    }
}

// Modified hideInfoPopup that ensures proper cleanup for re-clicking
function hideInfoPopup(popup) {
    if (!popup) return;
    
    // Start the closing animation
    popup.style.transition = 'opacity 0.2s ease-out';
    popup.style.opacity = '0';
    
    // Complete the cleanup after animation finishes
    setTimeout(() => {
        // Clean up the temporary dot if it exists
        if (popup.tempDot && popup.tempDot.parentNode) {
            popup.tempDot.parentNode.removeChild(popup.tempDot);
        }
        
        // Hide the popup
        popup.style.display = 'none';
        
        // IMPORTANT: Clear the highlighting to allow re-clicking
        if (popup.dataset.dotIndex) {
            const dotIndex = parseInt(popup.dataset.dotIndex);
            
            // Only clear if this popup's region is currently highlighted
            if (window.currentHighlightedSourceIndex === dotIndex) {
                window.currentHighlightedSourceIndex = -1;
                
                // Redraw canvas to remove highlighting
                if (typeof canvasUpdateOverlay === 'function') {
                    canvasUpdateOverlay();
                }
            }
            
            // Restore original style of the highlighted dot (for DOM dots if you're using them)
            if (window.catalogDots && dotIndex >= 0 && dotIndex < window.catalogDots.length) {
                const dot = window.catalogDots[dotIndex];
                dot.style.border = dot.dataset.originalBorder || '1px solid rgba(255, 0, 0, 0.7)';
                dot.style.zIndex = dot.dataset.originalZIndex || 'auto';
            }
        }
        
        // Remove from DOM and array
        if (popup.parentNode) {
            popup.parentNode.removeChild(popup);
        }
        
        // Remove from array
        const index = infoPopups.indexOf(popup);
        if (index !== -1) {
            infoPopups.splice(index, 1);
        }
    }, 200); // Match the transition duration
}

// Also add this function to handle clicks on regions
function handleRegionClick(sourceIndex) {
    // Always allow clicking, even if the same region is highlighted
    // This ensures the popup can be reopened after closing
    
    // Set the new highlighted source
    window.currentHighlightedSourceIndex = sourceIndex;
    
    // Trigger canvas redraw to show highlighting
    if (typeof canvasUpdateOverlay === 'function') {
        canvasUpdateOverlay();
    }
    
    // Open the popup (your existing popup creation logic should go here)
    // For example:
    // showInfoPopup(sourceIndex);
}

// Alternative: If you want to ensure clicks always work, add this to your click handler
function ensureClickable() {
    // This function can be called before handling any region clicks
    // to ensure the system is in a clean state
    
    // Close any existing popups first
    if (window.infoPopups && window.infoPopups.length > 0) {
        window.infoPopups.forEach(popup => {
            if (popup.style.display !== 'none') {
                hideInfoPopup(popup);
            }
        });
    }
    
    // Clear highlighting
    window.currentHighlightedSourceIndex = -1;
    
    // Redraw canvas
    if (typeof canvasUpdateOverlay === 'function') {
        canvasUpdateOverlay();
    }
}

// Add this function to wrap the original hideInfoPopup function
const originalHideInfoPopup = window.hideInfoPopup;
window.hideInfoPopup = function(popup) {
    // Clean up the temporary dot if it exists
    if (popup && popup.tempDot && popup.tempDot.parentNode) {
        popup.tempDot.parentNode.removeChild(popup.tempDot);
    }
    
    // Call the original function
    return originalHideInfoPopup(popup);
};

// Hide all info popups
function hideAllInfoPopups() {
    // Make a copy of the array since we'll be modifying it while iterating
    const popupsCopy = [...infoPopups];
    
    // Hide each popup
    for (let popup of popupsCopy) {
        hideInfoPopup(popup);
    }
    
    // Clear the array (should already be empty, but just to be safe)
    infoPopups = [];
}


// Throttle function to limit how often a function can be called
function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// Debounce function to delay execution until after a period of inactivity
function debounce(func, delay) {
    let timeout;
    return function() {
        const context = this;
        const args = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}


// After the document ready function, add a new function to create the dynamic range control
function createDynamicRangeControl() {
    // Create a button for dynamic range adjustment
    const dynamicRangeButton = document.createElement('button');
    dynamicRangeButton.className = 'dynamic-range-button';
    dynamicRangeButton.title = 'Adjust Dynamic Range';
    
    // Create histogram icon using SVG
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.style.fill = "currentColor";
    
    // Create histogram bars
    const bars = [
        { x: 2, y: 14, width: 3, height: 6 },
        { x: 7, y: 8, width: 3, height: 12 },
        { x: 12, y: 12, width: 3, height: 8 },
        { x: 17, y: 6, width: 3, height: 14 }
    ];
    
    bars.forEach(bar => {
        const rect = document.createElementNS(svgNS, "rect");
        rect.setAttribute("x", bar.x);
        rect.setAttribute("y", bar.y);
        rect.setAttribute("width", bar.width);
        rect.setAttribute("height", bar.height);
        svg.appendChild(rect);
    });
    
    dynamicRangeButton.appendChild(svg);
    
    // Add event listener
    dynamicRangeButton.addEventListener('click', showDynamicRangePopup);
    
    // Find the toolbar and the first button (zoomIn)
    const toolbar = document.querySelector('.toolbar');
    const zoomInButton = toolbar.querySelector('button:first-child');
    
    // // Insert the dynamic range button before the zoom in button (to its left)
    // if (zoomInButton) {
    //     zoomInButton.insertAdjacentElement('beforebegin', dynamicRangeButton);
    // } else {
    //     // Fallback: just prepend to the toolbar
    //     toolbar.prepend(dynamicRangeButton);
    // }
}

function ensureHistogramOverlayReady() {
    const doc = getHistogramDocument();
    const bg = doc.getElementById('histogram-bg-canvas');
    const lines = doc.getElementById('histogram-lines-canvas');
    if (!bg || !lines) return false;

    // Match size to background canvas
    if (lines.width !== bg.width) lines.width = bg.width;
    if (lines.height !== bg.height) lines.height = bg.height;

    // Ensure overlay floats above and can receive input
    lines.style.position = 'absolute';
    lines.style.zIndex = '2';
    lines.style.pointerEvents = 'auto';

    // Make sure background is beneath
    bg.style.position = 'absolute';
    bg.style.zIndex = '1';

    return true;
}
// PASTE THE FOLLOWING CODE INTO static/main.js, REPLACING THE EXISTING showDynamicRangePopup function

function showDynamicRangePopup(options = {}) {
    const opts = options || {};
    console.log("showDynamicRangePopup called.");
    const isTiledViewActive = !!(window.tiledViewer && typeof window.tiledViewer.isOpen === 'function' && window.tiledViewer.isOpen());
    console.log(`isTiledViewActive: ${isTiledViewActive}`);

    // In multi-panel layouts, the top window toolbar may call this function,
    // but the actual image metadata lives inside the active iframe pane.
    // If we're the top window and multi-panel is visible, delegate to the active pane
    // (or a best-effort pane that has metadata) so histogram works in 2x2/diagonal/etc.
    try {
        const isTop = (window.top === window);
        if (isTop) {
            const wrap = document.getElementById('multi-panel-container');
            const grid = document.getElementById('multi-panel-grid');
            const multiActive = !!(wrap && wrap.style.display !== 'none' && grid && grid.querySelectorAll('iframe').length >= 1);
            if (multiActive) {
                const activePaneWin = (typeof window.getActivePaneWindow === 'function') ? window.getActivePaneWindow() : null;
                const hasMeta = (w) => !!(w && w.fitsData && typeof w.fitsData.min_value !== 'undefined' && typeof w.fitsData.max_value !== 'undefined');
                let target = (activePaneWin && activePaneWin !== window && typeof activePaneWin.showDynamicRangePopup === 'function') ? activePaneWin : null;
                if (!hasMeta(target)) {
                    // Fallback: first pane with metadata
                    const frames = Array.from(grid.querySelectorAll('iframe'));
                    for (const f of frames) {
                        const w = f && f.contentWindow;
                        if (w && w !== window && typeof w.showDynamicRangePopup === 'function' && hasMeta(w)) {
                            target = w;
                            break;
                        }
                    }
                }
                if (target && target !== window && typeof target.showDynamicRangePopup === 'function') {
                    return target.showDynamicRangePopup(opts);
                }
            }
        }
    } catch (_) {}

    // In tiled mode, the image can be open while fitsData min/max hasn't been seeded yet
    // (especially for pane #1 during base→multi transitions). Try to recover from currentTileInfo
    // or fetch tile-info once before warning.
    const hasMinMax = (fd) => !!(fd && typeof fd.min_value !== 'undefined' && typeof fd.max_value !== 'undefined' &&
                                isFinite(fd.min_value) && isFinite(fd.max_value) && fd.max_value > fd.min_value);
    if (!window.fitsData) window.fitsData = {};
    if (!hasMinMax(window.fitsData)) {
        try {
            const ti = (typeof currentTileInfo !== 'undefined' && currentTileInfo) ? currentTileInfo : (window.currentTileInfo || null);
            const pickMinMax = (tileInfo) => {
                if (!tileInfo) return null;
                const a = tileInfo.initial_display_min, b = tileInfo.initial_display_max;
                const c = tileInfo.data_min, d = tileInfo.data_max;
                if (isFinite(a) && isFinite(b) && b > a) return { min: a, max: b };
                if (isFinite(c) && isFinite(d) && d > c) return { min: c, max: d };
                return null;
            };
            const mm = pickMinMax(ti);
            if (mm) {
                window.fitsData.min_value = mm.min;
                window.fitsData.max_value = mm.max;
                window.fitsData.initial_min_value = window.fitsData.initial_min_value ?? mm.min;
                window.fitsData.initial_max_value = window.fitsData.initial_max_value ?? mm.max;
            }
        } catch (_) { }
    }
    if (!hasMinMax(window.fitsData)) {
        if (isTiledViewActive && !opts.__retryMeta) {
            try {
                showNotification(true, 'Loading image metadata...');
                apiFetch('/fits-tile-info/')
                    .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
                    .then(tileInfo => {
                        try {
                            if (typeof currentTileInfo !== 'undefined') currentTileInfo = tileInfo;
                            window.currentTileInfo = tileInfo;
                            const a = tileInfo && tileInfo.initial_display_min;
                            const b = tileInfo && tileInfo.initial_display_max;
                            const c = tileInfo && tileInfo.data_min;
                            const d = tileInfo && tileInfo.data_max;
                            const mm = (isFinite(a) && isFinite(b) && b > a) ? { min: a, max: b }
                                     : ((isFinite(c) && isFinite(d) && d > c) ? { min: c, max: d } : null);
                            if (mm) {
                                window.fitsData.min_value = mm.min;
                                window.fitsData.max_value = mm.max;
                                window.fitsData.initial_min_value = window.fitsData.initial_min_value ?? mm.min;
                                window.fitsData.initial_max_value = window.fitsData.initial_max_value ?? mm.max;
                            }
                        } catch (_) { }
                    })
                    .catch(() => { /* fall through */ })
                    .finally(() => {
                        try { showNotification(false); } catch (_) { }
                        try { showDynamicRangePopup({ ...(opts || {}), __retryMeta: true }); } catch (_) { }
                    });
                return;
            } catch (_) { }
        }
        showNotification('Image metadata not loaded. Please load an image first.', 3000, 'warning');
        return;
    }

    if (!isTiledViewActive && (!window.fitsData.data || (Array.isArray(window.fitsData.data) && window.fitsData.data.length === 0))) {
        showNotification('Image pixel data not available for local histogram. Please wait or reload.', 3000, 'warning');
        return;
    }
    console.log("All checks passed in showDynamicRangePopup, proceeding to show popup.");

    let hostDocument = null;
    let hostWindow = null;
    try {
        const root = window.top || window;
        if (root.document && root.document.body) {
            hostDocument = root.document;
            hostWindow = root;
        }
    } catch(_) {}
    if (!hostDocument) {
        hostDocument = window.document;
        hostWindow = window;
    }
    try {
        const root = window.top || window;
        root.__histogramHostDoc = hostDocument;
        root.__histogramHostWin = hostWindow;
    } catch(_) {
        window.__histogramHostDoc = hostDocument;
        window.__histogramHostWin = hostWindow;
    }
    const popupDoc = hostDocument;
    const document = hostDocument;

    const currentPaneId = getCurrentPaneId();
    let popup = document.getElementById('dynamic-range-popup');
    const titleElementId = 'dynamic-range-popup-title'; // For drag handling
    let preservedPosition = null;

    if (popup) {
        if (popup.dataset.ownerPaneId !== currentPaneId || opts.forceRebind || opts.forceRebuild) {
            preservedPosition = {
                top: popup.style.top,
                left: popup.style.left,
                transform: popup.style.transform
            };
            try { popup.remove(); } catch (_) {}
            popup = null;
        }
    }

    if (popup) {
        popup.style.display = 'block';
        popup.dataset.ownerPaneId = currentPaneId;
        const doc = getHistogramDocument();
        const minInput = doc.getElementById('min-range-input');
        const maxInput = doc.getElementById('max-range-input');
        if (minInput && maxInput && window.fitsData) {
            setRangeInputs(window.fitsData.min_value, window.fitsData.max_value);
        }
        const invertToggle = doc.getElementById('invert-colormap-toggle');
        if (invertToggle) {
            invertToggle.checked = !!window.currentColorMapInverted;
        }
        const fileNameLabel = popup.querySelector('.scaling-popup-filename');
        if (fileNameLabel) {
            fileNameLabel.textContent = window.fitsData?.filename || window.currentFitsFile || 'Current image';
        }
        requestHistogramUpdate();
        attachHistogramInteractionWhenReady();
        return;
    }

    popup = document.createElement('div');
    popup.id = 'dynamic-range-popup';
    popup.style.position = 'fixed';
    popup.style.top = '50%';
    popup.style.left = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
    popup.style.backgroundColor = '#333';
    popup.style.border = '1px solid #555';
    popup.style.borderRadius = '5px';
    popup.style.padding = '15px';
    popup.style.zIndex = '60000';
    popup.style.width = '500px'; // Keep reasonable width
    popup.style.boxSizing = 'border-box';
    popup.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)';
    popup.dataset.ownerPaneId = currentPaneId;
    if (preservedPosition) {
        if (preservedPosition.transform) popup.style.transform = preservedPosition.transform;
        if (preservedPosition.top) popup.style.top = preservedPosition.top;
        if (preservedPosition.left) popup.style.left = preservedPosition.left;
    }

    const title = document.createElement('div');
    title.id = titleElementId;
    Object.assign(title.style, {
        margin: '0 0 15px 0',
        color: '#fff',
        fontFamily: 'Arial, sans-serif',
        borderBottom: '1px solid #555',
        paddingBottom: '10px',
        cursor: 'grab',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px'
    });
    const titleText = document.createElement('div');
    Object.assign(titleText.style, { fontSize: '18px', fontWeight: 'bold' });
    titleText.textContent = 'Scaling Controls';
    const fileNameLabel = document.createElement('div');
    fileNameLabel.className = 'scaling-popup-filename';
    Object.assign(fileNameLabel.style, { fontSize: '13px', opacity: 0.8 });
    const fileName = (window.fitsData?.filename || window.currentFitsFile || 'Current image');
    fileNameLabel.textContent = fileName;
    title.appendChild(titleText);
    title.appendChild(fileNameLabel);

    const closeButton = document.createElement('button');
    closeButton.textContent = '×';
    closeButton.style.position = 'absolute';
    closeButton.style.top = '10px';
    closeButton.style.right = '10px';
    closeButton.style.backgroundColor = 'transparent';
    closeButton.style.border = 'none';
    closeButton.style.color = '#aaa';
    closeButton.style.fontSize = '20px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.padding = '0';
    closeButton.style.width = '24px';
    closeButton.style.height = '24px';
    closeButton.style.lineHeight = '24px';
    closeButton.style.textAlign = 'center';
    closeButton.style.borderRadius = '12px';
    closeButton.addEventListener('mouseover', () => {
        closeButton.style.backgroundColor = '#555';
        closeButton.style.color = '#fff';
    });
    closeButton.addEventListener('mouseout', () => {
        closeButton.style.backgroundColor = 'transparent';
        closeButton.style.color = '#aaa';
    });
    closeButton.addEventListener('click', () => {
        popup.style.display = 'none';
    });

    enablePopupDrag(popup, title, popupDoc);


    const canvasContainer = document.createElement('div');
    canvasContainer.style.width = '100%';
    canvasContainer.style.height = '200px';
    canvasContainer.style.marginBottom = '15px';
    canvasContainer.style.backgroundColor = '#222';
    canvasContainer.style.borderRadius = '3px';
    canvasContainer.style.position = 'relative';

    const bgCanvas = document.createElement('canvas');
    bgCanvas.id = 'histogram-bg-canvas';
    bgCanvas.width = 470; // Adjusted for padding within 500px popup
    bgCanvas.height = 200;
    bgCanvas.style.display = 'block';
    bgCanvas.style.position = 'absolute';
    bgCanvas.style.left = '0';
    bgCanvas.style.top = '0';
    bgCanvas.style.zIndex = '1';

    const linesCanvas = document.createElement('canvas');
    linesCanvas.id = 'histogram-lines-canvas';
    linesCanvas.width = 470;
    linesCanvas.height = 200;
    linesCanvas.style.display = 'block';
    linesCanvas.style.position = 'absolute';
    linesCanvas.style.left = '0';
    linesCanvas.style.top = '0';
    linesCanvas.style.zIndex = '2';
    linesCanvas.style.pointerEvents = 'auto';
    linesCanvas.style.touchAction = 'none';

    canvasContainer.appendChild(bgCanvas);
    canvasContainer.appendChild(linesCanvas);

    const percentileContainer = document.createElement('div');
    percentileContainer.style.display = 'flex';
    percentileContainer.style.justifyContent = 'space-between';
    percentileContainer.style.marginBottom = '15px';

    const percentiles = [
        { label: '99.9%', value: 0.999 }, { label: '99%', value: 0.99 },
        { label: '95%', value: 0.95 }, { label: '90%', value: 0.90 }
    ];
    percentiles.forEach(p => {
        const button = document.createElement('button');
        button.textContent = p.label;
        button.style.flex = '1';
        button.style.margin = '0 2px'; // Reduced margin
        button.style.padding = '8px 0';
        button.style.backgroundColor = '#444';
        button.style.color = '#fff';
        button.style.border = 'none';
        button.style.borderRadius = '3px';
        button.style.cursor = 'pointer';
        button.style.fontFamily = 'Arial, sans-serif';
        button.style.fontSize = '13px'; // Slightly smaller font
        button.addEventListener('mouseover', () => button.style.backgroundColor = '#555');
        button.addEventListener('mouseout', () => button.style.backgroundColor = '#444');
        button.addEventListener('click', () => applyPercentile(p.value));
        percentileContainer.appendChild(button);
    });

    const inputContainer = document.createElement('div');
    inputContainer.style.display = 'flex';
    inputContainer.style.alignItems = 'center';
    inputContainer.style.marginBottom = '15px';

    const minLabel = document.createElement('label');
    minLabel.textContent = 'Min:'; minLabel.style.color = '#aaa'; minLabel.style.marginRight = '5px'; minLabel.style.fontSize = '14px';
    const minInput = document.createElement('input');
    minInput.id = 'min-range-input'; minInput.type = 'text';
    Object.assign(minInput.style, { flex: '1', backgroundColor: '#444', color: '#fff', border: '1px solid #555', borderRadius: '3px', padding: '5px', marginRight: '10px', fontFamily: 'monospace', fontSize: '14px' });

    const maxLabel = document.createElement('label');
    maxLabel.textContent = 'Max:'; maxLabel.style.color = '#aaa'; maxLabel.style.marginRight = '5px'; maxLabel.style.fontSize = '14px';
    const maxInput = document.createElement('input');
    maxInput.id = 'max-range-input'; maxInput.type = 'text';
    Object.assign(maxInput.style, { flex: '1', backgroundColor: '#444', color: '#fff', border: '1px solid #555', borderRadius: '3px', padding: '5px', fontFamily: 'monospace', fontSize: '14px' });

    if (window.fitsData) {
        minInput.value = window.fitsData.min_value
        maxInput.value = window.fitsData.max_value
        setRangeInputs(window.fitsData.min_value, window.fitsData.max_value);
    }
    const debouncedHistogramUpdate = debounce(requestHistogramUpdate, 150);
    minInput.addEventListener('input', debouncedHistogramUpdate);
    maxInput.addEventListener('input', debouncedHistogramUpdate);

    inputContainer.appendChild(minLabel); inputContainer.appendChild(minInput);
    inputContainer.appendChild(maxLabel); inputContainer.appendChild(maxInput);
    attachRangeInputAutoApply(minInput, maxInput);

    // Helper function to create searchable dropdown is defined globally (createSearchableDropdown)

    function createInvertColorMapToggle() {
        const container = document.createElement('div');
        container.style.marginTop = '6px';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';

        const label = document.createElement('label');
        label.style.display = 'flex';
        label.style.alignItems = 'center';
        label.style.cursor = 'pointer';
        label.style.color = '#aaa';
        label.style.fontSize = '14px';
        label.htmlFor = 'invert-colormap-toggle';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = 'invert-colormap-toggle';
        checkbox.style.marginRight = '8px';
        checkbox.checked = !!window.currentColorMapInverted;

        const labelText = document.createElement('span');
        labelText.textContent = 'Invert color map';

        label.appendChild(checkbox);
        label.appendChild(labelText);

        const helper = document.createElement('div');
        helper.textContent = 'Flip the gradient direction';
        helper.style.fontSize = '11px';
        helper.style.color = '#777';
        helper.style.marginLeft = '26px';

        checkbox.addEventListener('change', () => {
            const checked = checkbox.checked;
            window.currentColorMapInverted = checked;
            currentColorMapInverted = checked;
            if (typeof applyColorMap === 'function' && window.currentColorMap) {
                applyColorMap(window.currentColorMap);
            } else if (typeof applyDynamicRange === 'function') {
                applyDynamicRange();
            } else if (typeof refreshImage === 'function') {
                refreshImage();
            }
        });

        container.appendChild(label);
        // container.appendChild(helper);
        return container;
    }

    // Define colormaps and scaling functions
    const colorMaps = getColorMapOptions();
    const scalingFunctions = [
        { value: 'linear', label: 'Linear' }, { value: 'logarithmic', label: 'Logarithmic' },
        { value: 'sqrt', label: 'Square Root' }, { value: 'power', label: 'Power (10^x)' }, // Corrected Power label
        { value: 'asinh', label: 'Asinh' }
    ];

    const colorMapDropdown = createSearchableDropdown('Color Map:', 'color-map-select', colorMaps, 'currentColorMap', 'grayscale', true);
    if (typeof window !== 'undefined') {
        window.__baseColorMapOptions = colorMaps.map(opt => ({ ...opt }));
    }
    const invertToggleControl = createInvertColorMapToggle();
    const scalingDropdown = createSearchableDropdown('Scaling:', 'scaling-select', scalingFunctions, 'currentScaling', 'linear', false);
    
    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
        const cmDropdown = colorMapDropdown.querySelector('.custom-select-container > div[style*="display: block"]'); // More specific selector
        const scDropdown = scalingDropdown.querySelector('.custom-select-container > div[style*="display: block"]');
        
        if (cmDropdown && !colorMapDropdown.querySelector('.custom-select-container').contains(e.target)) {
            cmDropdown.style.display = 'none';
        }
        if (scDropdown && !scalingDropdown.querySelector('.custom-select-container').contains(e.target)) {
            scDropdown.style.display = 'none';
        }
    });


    const controlsContainer = document.createElement('div');
    controlsContainer.style.display = 'flex';
    controlsContainer.style.flexDirection = 'row'; // Arrange side-by-side
    controlsContainer.style.justifyContent = 'space-between';
    controlsContainer.style.gap = '15px'; // Add gap between dropdowns

    const leftColumn = document.createElement('div');
    leftColumn.style.flex = '1';
    leftColumn.appendChild(colorMapDropdown);
    leftColumn.appendChild(invertToggleControl);

    const rightColumn = document.createElement('div');
    rightColumn.style.flex = '1';
    rightColumn.appendChild(scalingDropdown);

    controlsContainer.appendChild(leftColumn);
    controlsContainer.appendChild(rightColumn);


    const buttonsContainer = document.createElement('div');
    buttonsContainer.style.display = 'flex';
    buttonsContainer.style.justifyContent = 'flex-end';
    buttonsContainer.style.marginTop = '20px';

    const resetButton = document.createElement('button');
    resetButton.textContent = 'Reset';
    Object.assign(resetButton.style, { padding: '8px 15px', backgroundColor: '#555', color: '#fff', border: 'none', borderRadius: '3px', cursor: 'pointer', marginRight: '10px', fontFamily: 'Arial, sans-serif', fontSize: '14px' });
    resetButton.addEventListener('mouseover', () => resetButton.style.backgroundColor = '#666');
    resetButton.addEventListener('mouseout', () => resetButton.style.backgroundColor = '#555');
    resetButton.addEventListener('click', resetDynamicRange);

    const applyButton = document.createElement('button');
    applyButton.textContent = 'Apply';
    Object.assign(applyButton.style, { padding: '8px 15px', backgroundColor: '#007bff', color: '#fff', border: 'none', borderRadius: '3px', cursor: 'pointer', fontFamily: 'Arial, sans-serif', fontSize: '14px' });
    applyButton.addEventListener('mouseover', () => applyButton.style.backgroundColor = '#0056b3');
    applyButton.addEventListener('mouseout', () => applyButton.style.backgroundColor = '#007bff');
    applyButton.addEventListener('click', applyDynamicRange);

    // buttonsContainer.appendChild(resetButton);
    // buttonsContainer.appendChild(applyButton);

    popup.appendChild(title);
    popup.appendChild(closeButton);
    popup.appendChild(canvasContainer);
    popup.appendChild(percentileContainer);
    popup.appendChild(inputContainer);
    popup.appendChild(controlsContainer); // Add new container for dropdowns
    popup.appendChild(buttonsContainer);
    popupDoc.body.appendChild(popup);

    addHistogramInteraction(linesCanvas, minInput, maxInput);
    requestHistogramUpdate(); // Initial histogram draw
}

function attachRangeInputAutoApply(minInput, maxInput) {
    if (!minInput || !maxInput) return;

    const parsePair = () => {
        const vmin = parseFloat(minInput.value);
        const vmax = parseFloat(maxInput.value);
        return { vmin, vmax };
    };

    const formatIf = (v) => (typeof formatRangeValue === 'function' ? formatRangeValue(v) : String(v));

    // Always end up with a function; fallback if debounce is missing/broken
    let debouncedApply;
    try {
        if (typeof debounce === 'function') {
            debouncedApply = debounce(() => {
                try { applyDynamicRange(); } catch (e) { console.warn(e); }
            }, 250);
        }
    } catch (_) { /* ignore */ }
    if (typeof debouncedApply !== 'function') {
        debouncedApply = () => { try { applyDynamicRange(); } catch (e) { console.warn(e); } };
    }

    const commit = (immediate = false) => {
        let { vmin, vmax } = parsePair();
        if (!isFinite(vmin) || !isFinite(vmax)) return;

        if (vmin > vmax) [vmin, vmax] = [vmax, vmin];
        minInput.value = formatIf(vmin);
        maxInput.value = formatIf(vmax);

        if (typeof drawHistogramLines === 'function') {
            drawHistogramLines(vmin, vmax, false);
        }

        if (immediate) {
            try { applyDynamicRange(); } catch (e) { console.warn(e); }
        } else {
            debouncedApply();
        }
    };

    const onKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            commit(true); // immediate apply on Enter
        }
    };

    // Apply on change/blur; keep existing 'input' listeners for live histogram only
    minInput.addEventListener('change', () => commit(false));
    maxInput.addEventListener('change', () => commit(false));
    minInput.addEventListener('blur', () => commit(false));
    maxInput.addEventListener('blur', () => commit(false));
    minInput.addEventListener('keydown', onKeyDown);
    maxInput.addEventListener('keydown', onKeyDown);
}
// END OF REPLACEMENT CODE
// Function to apply the new dynamic range
function applyDynamicRange() {
    const doc = getHistogramDocument();
    const minInput = doc.getElementById('min-range-input');
    const maxInput = doc.getElementById('max-range-input');
    const colorMapSelect = doc.getElementById('color-map-select');
    const scalingSelect = doc.getElementById('scaling-select');
    const invertToggle = doc.getElementById('invert-colormap-toggle');
    
    if (!minInput || !maxInput) {
        console.error('Min/max input fields not found');
        return;
    }
    
    const minValue = parseFloat(minInput.value);
    const maxValue = parseFloat(maxInput.value);
    
    if (isNaN(minValue) || isNaN(maxValue)) {
        showNotification('Invalid min/max values', 2000, 'error');
        return;
    }
    
    if (minValue >= maxValue) {
        showNotification('Min value must be less than max value', 2000, 'error');
        return;
    }
    
    console.log(`Applying dynamic range: ${minValue} to ${maxValue}`);
    
    // Multi-panel: dynamic range UI may live in the top document but must apply to the active pane window.
    if (!window.fitsData) {
        try {
            const isTop = (window.top === window);
            if (isTop) {
                const wrap = document.getElementById('multi-panel-container');
                const grid = document.getElementById('multi-panel-grid');
                const multiActive = !!(wrap && wrap.style.display !== 'none' && grid && grid.querySelectorAll('iframe').length >= 1);
                if (multiActive) {
                    const hasFits = (w) => !!(w && w.fitsData);
                    let target = (typeof window.getActivePaneWindow === 'function') ? window.getActivePaneWindow() : null;
                    if (!hasFits(target)) {
                        const frames = Array.from(grid.querySelectorAll('iframe'));
                        for (const f of frames) {
                            const w = f && f.contentWindow;
                            if (hasFits(w)) { target = w; break; }
                        }
                    }
                    if (target && target !== window && typeof target.applyDynamicRange === 'function') {
                        return target.applyDynamicRange();
                    }
                }
            }
        } catch (_) {}
        console.error('No FITS data available in global scope for applyDynamicRange');
        showNotification('No image data available. Please load an image first.', 3000, 'error');
        return;
    }
    
    // Update the dynamic range in the FITS data (client-side copy)
    window.fitsData.min_value = minValue;
    window.fitsData.max_value = maxValue;
    
    // Apply color map if selected
    if (colorMapSelect) {
        window.currentColorMap = colorMapSelect.value;
    }
    
    // Apply scaling if selected
    if (scalingSelect) {
        window.currentScaling = scalingSelect.value;
    }
    
    if (invertToggle) {
        window.currentColorMapInverted = invertToggle.checked;
        currentColorMapInverted = invertToggle.checked;
    }

    const isTiledViewActive = window.tiledViewer && window.tiledViewer.isOpen && window.tiledViewer.isOpen();

    if (isTiledViewActive) {
        console.log("Applying dynamic range to tiled viewer");
        showNotification(true, 'Updating tiled view...');
        apiFetch('/update-dynamic-range/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                min_value: minValue,
                max_value: maxValue,
                color_map: window.currentColorMap,
                scaling_function: window.currentScaling,
                invert_colormap: !!window.currentColorMapInverted,
                file_id: window.currentLoadedFitsFileId 
            })
        })
        .then(response => {
            if (!response.ok) { // Check if response status is indicative of an error
                throw new Error(`Server error: ${response.status} ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            // The original server endpoint might not return a JSON with an 'error' field
            // if it's a simple 200 OK. The check above is more important.
            if (data.error) { // This is if the server *successfully* responds with a JSON containing an error message
                console.error('Error updating tiled view dynamic range:', data.error);
                showNotification('Error updating tiled view: ' + data.error, 3000, 'error');
            } else {
                console.log("Server dynamic range updated. Re-opening OpenSeadragon tile source to reflect changes.");
                currentDynamicRangeVersion = Date.now(); // Update the version for new tile URLs

                if (window.tiledViewer && currentTileInfo) {
                    // Store current viewport
                    const currentZoom = window.tiledViewer.viewport.getZoom();
                    const currentPan = window.tiledViewer.viewport.getCenter();
                    console.log("Storing viewport:", { zoom: currentZoom, pan: currentPan });

                    const newTileSourceOptions = {
                        width: currentTileInfo.width,
                        height: currentTileInfo.height,
                        tileSize: currentTileInfo.tileSize,
                        maxLevel: currentTileInfo.maxLevel,
                        getTileUrl: function(level, x, y) {
                            const sid = (function(){
                                try {
                                    return (window.__forcedSid) ||
                                           (new URLSearchParams(window.location.search).get('sid')) ||
                                           (new URLSearchParams(window.location.search).get('pane_sid')) ||
                                           sessionStorage.getItem('sid');
                                } catch(_) { return sessionStorage.getItem('sid'); }
                            })();
                            const sidParam = sid ? `sid=${encodeURIComponent(sid)}&` : '';
                            return `/fits-tile/${level}/${x}/${y}?${sidParam}v=${currentDynamicRangeVersion}`;
                        },
                        getLevelScale: function(level) { // Copied from initializeTiledViewer
                            return 1 / (1 << (this.maxLevel - level));
                        }
                        // Ensure other necessary tileSource properties from initializeTiledViewer are included
                        // if they are essential for it to work correctly.
                    };
                    window.tiledViewer.open(newTileSourceOptions);

                    // Restore viewport after new tile source is opened
                    window.tiledViewer.addOnceHandler('open', function() {
                        console.log("New tile source opened, restoring viewport:", { zoom: currentZoom, pan: currentPan });
                        window.tiledViewer.viewport.zoomTo(currentZoom, null, true); // true for immediate
                        window.tiledViewer.viewport.panTo(currentPan, true);       // true for immediate
                        
                        // Re-apply image smoothing
                        if (window.tiledViewer.drawer) {
                            window.tiledViewer.drawer.setImageSmoothingEnabled(false);
                        }
                        console.log("Viewport restored and image smoothing re-applied.");
                        if (segmentOverlayState && segmentOverlayState.sourceSegmentName) {
                            loadSegmentOverlay(segmentOverlayState.sourceSegmentName, {
                                colorMap: segmentOverlayState.colorMap || segmentOverlayPreferences.colorMap,
                                silent: true,
                                reuseCache: true
                            });
                        }
                    });

                    showNotification('Dynamic range applied.', 1000, 'success');
                } else {
                    console.error("Cannot re-open tile source: tiledViewer or currentTileInfo missing.");
                    showNotification('Error refreshing tiled view display. Viewer or tile info missing.', 3000, 'error');
                    // Fallback: Try force redraw if open fails to be set up
                    if (window.tiledViewer) {
                        window.tiledViewer.forceRedraw();
                    }
                }
            }
            showNotification(false);
        })
        .catch(error => { // This catches network errors or the error thrown from !response.ok
            console.error('Error updating tiled view dynamic range:', error);
            showNotification(false);
            showNotification(`Failed to update dynamic range on server: ${error.message}`, 4000, 'error');
        });
    } else {
        // For non-tiled views, refresh the image locally
        console.log("Applying dynamic range to non-tiled viewer");
        refreshImage(); // This will use window.fitsData.min_value, max_value, currentColorMap, currentScaling
    }
    
    // Update the histogram display (this should now work for both modes)
    requestHistogramUpdate();
    attachHistogramInteractionWhenReady();
}

function resolveDefaultRange() {
    const isFiniteNum = (v) => typeof v === 'number' && isFinite(v);
    let min = null, max = null;

    // 1) Current values
    if (window.fitsData) {
        if (isFiniteNum(window.fitsData.min_value) && isFiniteNum(window.fitsData.max_value)) {
            min = window.fitsData.min_value; max = window.fitsData.max_value;
        } else if (isFiniteNum(window.fitsData.initial_min_value) && isFiniteNum(window.fitsData.initial_max_value)) {
            min = window.fitsData.initial_min_value; max = window.fitsData.initial_max_value;
        }
    }

    // 2) Tiled viewer initial display range
    if ((!isFiniteNum(min) || !isFiniteNum(max)) && window.tiledViewer) {
        const tvMin = window.tiledViewer.initial_display_min;
        const tvMax = window.tiledViewer.initial_display_max;
        if (isFiniteNum(tvMin) && isFiniteNum(tvMax)) {
            min = (isFiniteNum(min) ? min : tvMin);
            max = (isFiniteNum(max) ? max : tvMax);
        }
    }

    // 3) Cached overview
    if ((!isFiniteNum(min) || !isFiniteNum(max)) && window.cachedOverviewForHistogram) {
        const ovMin = window.cachedOverviewForHistogram.dataMin;
        const ovMax = window.cachedOverviewForHistogram.dataMax;
        if (isFiniteNum(ovMin) && isFiniteNum(ovMax)) {
            min = (isFiniteNum(min) ? min : ovMin);
            max = (isFiniteNum(max) ? max : ovMax);
        }
    }

    // 4) Absolute fallback
    if (!isFiniteNum(min) || !isFiniteNum(max) || max <= min) {
        min = 0; max = 1;
    }

    return { min, max };
}

function resetDynamicRange() {
    const isTiledViewActive =
        window.tiledViewer && window.tiledViewer.isOpen && window.tiledViewer.isOpen();

    // Resolve default range
    const { min, max } = (typeof resolveDefaultRange === 'function')
        ? resolveDefaultRange()
        : { min: 0, max: 1 };

    // Update inputs
    const doc = getHistogramDocument();
    const minInput = doc.getElementById('min-range-input');
    const maxInput = doc.getElementById('max-range-input');
    if (typeof setRangeInputs === 'function') {
        setRangeInputs(min, max);
    } else {
        if (minInput) minInput.value = String(min);
        if (maxInput) maxInput.value = String(max);
    }

    // Update client-side state
    if (window.fitsData) {
        window.fitsData.min_value = min;
        window.fitsData.max_value = max;
        window.fitsData.initial_min_value = min;
        window.fitsData.initial_max_value = max;
    }

    // Ensure color map and scaling exist before apply
    const colorSel = doc.getElementById('color-map-select');
    const scalingSel = doc.getElementById('scaling-select');
    window.currentColorMap = window.currentColorMap || (colorSel && colorSel.value) || 'grayscale';
    window.currentScaling  = window.currentScaling  || (scalingSel && scalingSel.value) || 'linear';

    // Apply (this will POST min/max/color_map/scaling_function and reopen tiles)
    if (typeof applyDynamicRange === 'function') {
        applyDynamicRange();
    } else if (typeof refreshImage === 'function') {
        refreshImage();
    }

    if (typeof requestHistogramUpdate === 'function') {
        requestHistogramUpdate();
    }
}

/**
 * Apply the selected color map to the current image
 * @param {string} colorMapName - The name of the color map to apply
 */
function applyColorMap(colorMapName) {
    if (!colorMapName) return;

    // Persist selection for both old/new code paths
    window.currentColorMap = colorMapName;
    try { currentColorMap = colorMapName; } catch (_) {}
    if (typeof window.currentColorMapInverted === 'undefined') {
        window.currentColorMapInverted = false;
    }
    try { currentColorMapInverted = !!window.currentColorMapInverted; } catch (_) {}

    // Ensure Min/Max exist so applyDynamicRange can post correct payload
    const doc = getHistogramDocument();
    const minInput = doc.getElementById('min-range-input');
    const maxInput = doc.getElementById('max-range-input');
    const needsPrefill =
        !minInput || !maxInput ||
        minInput.value === '' || maxInput.value === '' ||
        isNaN(parseFloat(minInput.value)) || isNaN(parseFloat(maxInput.value));

    if (needsPrefill) {
        const fallback = { min: (window.fitsData?.min_value ?? 0), max: (window.fitsData?.max_value ?? 1) };
        const { min, max } = (typeof resolveDefaultRange === 'function') ? resolveDefaultRange() : fallback;
        if (typeof setRangeInputs === 'function') setRangeInputs(min, max);
        if (window.fitsData) {
            window.fitsData.min_value = min;
            window.fitsData.max_value = max;
        }
    }

    // Immediately apply to data (tiled and non-tiled paths)
    try {
        if (typeof applyDynamicRange === 'function') {
            applyDynamicRange();
        } else if (typeof refreshImage === 'function') {
            refreshImage();
        }
    } catch (e) {
        console.warn('applyColorMap auto-apply failed, attempting refresh:', e);
        if (typeof refreshImage === 'function') refreshImage();
    }
}


// Updated OpenSeadragon initialization with better large image handling
async function initializeOpenSeadragonViewer(dataUrl, isLargeImage) {
    console.log('[initializeOpenSeadragonViewer] Initializing OpenSeadragon viewer...');
    console.log('[initializeOpenSeadragonViewer] Data URL:', dataUrl ? dataUrl.substring(0, 100) + '...' : 'null');
    console.log('[initializeOpenSeadragonViewer] Is Large Image:', isLargeImage);

    const mainContainer = document.getElementById('openseadragon');
    const navigatorContainer = document.getElementById('navigatorDiv');

    // --- ROBUSTNESS CHECK ---
    // Wait for the main container to be available, with a timeout.
    const maxRetries = 10;
    let retries = 0;
    while (!mainContainer && retries < maxRetries) {
        console.warn(`[initializeOpenSeadragonViewer] Main container 'openseadragon' not found. Retrying... (${retries + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 200)); // Wait 200ms before retrying
        mainContainer = document.getElementById('openseadragon');
        retries++;
    }

    if (!mainContainer) {
        const errorMsg = "Critical Error: Could not find the 'openseadragon' container element after multiple retries. The viewer cannot be initialized.";
        console.error(errorMsg);
        showNotification(errorMsg, 5000, 'error');
        return; // Stop execution if container is missing
    }
    // --- END ROBUSTNESS CHECK ---

    // Ensure the container is empty before initializing a new viewer
    mainContainer.innerHTML = '';
    
    // Destroy the previous viewer instance if it exists
    if (viewer) {
        viewer.destroy();
        viewer = null;
    }

    const viewerOptions = {
        id: 'openseadragon',
        prefixUrl: '/static/vendor/openseadragon/images/',
        tileSources: {
            type: 'image',
            url: dataUrl
        },
        // Keep UI consistent with the tiled FITS viewer (avoid +/−/home flashing then disappearing)
        showZoomControl: false,
        showHomeControl: false,
        showFullPageControl: false,
        showRotationControl: false,
        animationTime: 0.5,
        blendTime: 0.1,
        constrainDuringPan: true,
        maxZoomPixelRatio: 2,
        visibilityRatio: 1,
        zoomPerClick: 1.4,
        showNavigator: true,
        navigatorId: 'navigatorDiv', // Explicitly provide the ID for the navigator
        navigatorPosition: 'TOP_RIGHT',
        imageSmoothingEnabled: false
    };

    console.log('[initializeOpenSeadragonViewer] Viewer options:', viewerOptions);

    try {
        viewer = OpenSeadragon(viewerOptions);
        window.viewer = viewer; 
        
        // Hide the welcome screen if it's still visible
        const welcomeScreen = document.querySelector('.welcome-screen');
        if (welcomeScreen) {
            welcomeScreen.style.display = 'none';
        }

        // Add event handlers for zoom and pan
        viewer.addHandler('zoom', updateHistogram);
        viewer.addHandler('pan', updateHistogram);

        viewer.addHandler('open', function() {
            console.log('[OpenSeadragon] Viewer is open and image is loaded.');
            requestHistogramUpdate();
            attachHistogramInteractionWhenReady();
          
            // add these two lines
            if (typeof attachWcsAxesWhenReady === 'function') attachWcsAxesWhenReady(viewer);
            document.dispatchEvent(new CustomEvent('viewer:open'));
          });

        // After the viewer is initialized, add the custom buttons
        if (typeof window.addPeakFinderButton === 'function') {
            window.addPeakFinderButton();
        }

    } catch (error) {
        console.error('[initializeOpenSeadragonViewer] Error initializing OpenSeadragon:', error);
        showNotification('Critical Error: Could not initialize image viewer. Please check console and refresh.', 5000, 'error');
    }
}

// === ADD THIS HELPER FUNCTION ===
// This will help debug and format large numbers
function formatMemorySize(bytes) {
    if (bytes < 1024) return bytes + " bytes";
    else if (bytes < 1048576) return (bytes / 1024).toFixed(2) + " KB";
    else if (bytes < 1073741824) return (bytes / 1048576).toFixed(2) + " MB";
    else return (bytes / 1073741824).toFixed(2) + " GB";
}


// Helper function to safely get pixel values from FITS data
function getFitsPixel(x, y) {
    if (!fitsData || !fitsData.data) return 0;
    
    // Bounds checking
    if (x < 0 || x >= fitsData.width || y < 0 || y >= fitsData.height) {
        return 0;
    }
    
    try {
        const val = fitsData.data[y][x];
        return (!isNaN(val) && isFinite(val)) ? val : 0;
    } catch (e) {
        console.error(`Error accessing pixel (${x},${y}):`, e);
        return 0;
    }
}

/**
 * Refresh the image with the current FITS data settings
 */
function refreshImage() {
    // Enhanced error handling with better checks
    if (!window.fitsData || !window.fitsData.data) {
        console.warn('Cannot refresh image: missing FITS data');
        showNotification('Cannot update image: missing image data', 3000, 'error');
        return;
    }
    
    if (!viewer) {
        console.warn('Cannot refresh image: viewer not initialized');
        showNotification('Cannot update image: viewer not initialized', 3000, 'error');
        return;
    }
    
    console.log('Refreshing image with dynamic range:', window.fitsData.min_value, 'to', window.fitsData.max_value);
    
    // Store current viewport settings to preserve zoom/pan state
    let viewportSettings = null;
    if (viewer && viewer.viewport) {
        viewportSettings = {
            zoom: viewer.viewport.getZoom(),
            center: viewer.viewport.getCenter()
        };
        console.log("Stored viewport settings:", viewportSettings);
    }
    
    // Show a brief processing indicator
    showNotification(true, 'Updating image...');
    
    // Use worker if available, otherwise process in main thread
    if (window.Worker) {
        processImageInWorker();
    } else {
        processImageInMainThread();
    }
    
    // Add a success notification
    setTimeout(() => {
        showNotification(false);
        showNotification('Image updated successfully', 1500, 'success');
    }, 500);
}



// Example usage:
// showNotification("Task completed successfully!", 3000, "success");
// showNotification("An error occurred while processing", 4000, "error");
// showNotification("Please review your settings", 3000, "warning");
// showNotification("New message received", 2500, "info");

/**
 * Update the histogram display with the current data
 */
function updateHistogram() {
    const doc = getHistogramDocument();
    const canvas = doc.getElementById('histogram-canvas');
    if (!canvas) {
        console.log('Histogram canvas not found, skipping update');
        return;
    }
    
    // Check if we're in tiled mode
    const inTiledMode = window.tiledViewer && window.tiledViewer.isOpen && window.tiledViewer.isOpen();
    
    if (inTiledMode) {
        console.log('Using server-side histogram for tiled data');
        const minInput = doc.getElementById('min-range-input');
        const maxInput = doc.getElementById('max-range-input');
        const uiMin = minInput ? parseFloat(minInput.value) : null;
        const uiMax = maxInput ? parseFloat(maxInput.value) : null;
        const haveUi = isFinite(uiMin) && isFinite(uiMax) && uiMin < uiMax;
        fetchServerHistogram(haveUi ? uiMin : null, haveUi ? uiMax : null);
        return;
    }

    // Check if we have access to fitsData with pixel data
    if (!window.fitsData) {
        console.log('No FITS data available for histogram');
        drawEmptyHistogram(canvas, 'No FITS data available');
        return;
    }
    
    // Additional check for proper data structure
    if (!window.fitsData.data || !Array.isArray(window.fitsData.data) || window.fitsData.data.length === 0) {
        console.log('Missing or invalid pixel data structure for histogram');
        drawEmptyHistogram(canvas, 'Invalid pixel data structure');
        return;
    }
    
    try {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        // Clear the canvas
        ctx.clearRect(0, 0, width, height);
        
        // Sample the data to build histogram
        const numBins = 100;
        const bins = new Array(numBins).fill(0);
        const minValue = window.fitsData.min_value;
        const maxValue = window.fitsData.max_value;
        const range = maxValue - minValue;
        
        if (range <= 0 || !isFinite(range)) {
            console.log('Invalid data range:', minValue, maxValue);
            drawEmptyHistogram(canvas, 'Invalid data range');
            return;
        }
        
        // Skip factor for large images
        const maxSampleSize = 500000;
        const skipFactor = Math.max(1, Math.floor((window.fitsData.width * window.fitsData.height) / maxSampleSize));
        
        let pixelCount = 0;
        let validPixelCount = 0;
        
        // Count pixels in each bin
        for (let y = 0; y < window.fitsData.height; y++) {
            for (let x = 0; x < window.fitsData.width; x += skipFactor) {
                pixelCount++;
                if (pixelCount % skipFactor !== 0) continue;
                
                // Safely access pixel data
                let val;
                try {
                    val = window.fitsData.data[y][x];
                } catch (e) {
                    console.warn('Error accessing pixel data at', y, x);
                    continue;
                }
                
                if (!isNaN(val) && isFinite(val)) {
                    validPixelCount++;
                    
                    // Skip values outside the current range
                    if (val < minValue || val > maxValue) continue;
                    
                    // Calculate bin index
                    const binIndex = Math.min(numBins - 1, Math.floor(((val - minValue) / range) * numBins));
                    bins[binIndex]++;
                }
            }
        }
        
        // Find the maximum bin count for scaling
        let maxBinCount = 0;
        for (let i = 0; i < numBins; i++) {
            maxBinCount = Math.max(maxBinCount, bins[i]);
        }
        
        // If no pixels in range, show a message
        if (maxBinCount === 0) {
            ctx.fillStyle = '#aaa';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('No pixels in the selected range', width / 2, height / 2);
            return;
        }
        
        console.log(`Max bin count: ${maxBinCount}`);
        
        // Calculate logarithmic scale
        const logMaxBinCount = Math.log(maxBinCount + 1);
        
        // Draw the histogram
        const padding = { top: 30, right: 20, bottom: 40, left: 60 };
        const histHeight = height - padding.top - padding.bottom;
        
        // Draw axes
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 1;
        
        // Y-axis
        ctx.beginPath();
        ctx.moveTo(padding.left, padding.top);
        ctx.lineTo(padding.left, height - padding.bottom);
        ctx.stroke();
        
        // X-axis
        ctx.beginPath();
        ctx.moveTo(padding.left, height - padding.bottom);
        ctx.lineTo(width - padding.right, height - padding.bottom);
        ctx.stroke();
        
        // Draw Y-axis tick marks and labels
        ctx.fillStyle = '#aaa';
        ctx.font = '10px Arial';
        ctx.textAlign = 'right';
        
        // Draw 5 tick marks on Y-axis
        const numYTicks = 5;
        for (let i = 0; i <= numYTicks; i++) {
            const y = height - padding.bottom - (i / numYTicks) * histHeight;
            
            // Draw tick mark
            ctx.beginPath();
            ctx.moveTo(padding.left - 5, y);
            ctx.lineTo(padding.left, y);
            ctx.stroke();
            
            // Calculate and draw label
            // For log scale, we need to convert back from the display position
            const logValue = (i / numYTicks) * logMaxBinCount;
            const actualValue = Math.round(Math.exp(logValue) - 1);
            
            ctx.fillText(actualValue.toLocaleString(), padding.left - 8, y + 4);
        }
        
        // Draw X-axis tick marks and labels
        ctx.textAlign = 'center';
        
        // Draw 5 tick marks on X-axis
        const numXTicks = 5;
        for (let i = 0; i <= numXTicks; i++) {
            const x = padding.left + (i / numXTicks) * (width - padding.left - padding.right);
            
            // Draw tick mark
            ctx.beginPath();
            ctx.moveTo(x, height - padding.bottom);
            ctx.lineTo(x, height - padding.bottom + 5);
            ctx.stroke();
            
            // Calculate and draw label
            const value = minValue + (i / numXTicks) * range;
            // CHANGE FORMAT
            ctx.fillText(value.toFixed(2), x, height - padding.bottom + 20);
        }
        
        // Draw Y-axis label (rotated)
        ctx.save();
        ctx.translate(15, height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = '#aaa';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Pixel Count (log)', 0, 0);
        ctx.restore();
        
        // Draw X-axis label
        ctx.fillStyle = '#aaa';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        const xAxisLabel = window.fitsData.wcs && window.fitsData.wcs.bunit ? window.fitsData.wcs.bunit : 'Value';
        // CHANGE Y-POSITION (increase from height - 10)
        ctx.fillText(xAxisLabel, width / 2, height - 5); 
        
        // Draw histogram bars
        ctx.fillStyle = 'rgba(0, 180, 0, 0.7)'; // Green bars
        const barWidth = (width - padding.left - padding.right) / numBins;
        
        for (let i = 0; i < numBins; i++) {
            const binCount = bins[i];
            if (binCount === 0) continue;
            
            // Use log scale for height
            const logHeight = Math.log(binCount + 1) / logMaxBinCount * histHeight;
            
            const x = padding.left + i * barWidth;
            const y = height - padding.bottom - logHeight;
            const barHeight = logHeight;
            
            ctx.fillRect(x, y, barWidth - 1, barHeight);
        }
        
        // Draw min/max lines
        const docForLines = getHistogramDocument();
        const minInput = docForLines.getElementById('min-range-input');
        const maxInput = docForLines.getElementById('max-range-input');
        
        if (minInput && maxInput) {
            const minVal = parseFloat(minInput.value);
            const maxVal = parseFloat(maxInput.value);
            
            if (!isNaN(minVal) && !isNaN(maxVal) && minVal < maxVal) {
                // Draw min line
                const minX = padding.left + ((minVal - minValue) / range) * (width - padding.left - padding.right);
                ctx.strokeStyle = 'rgba(50, 150, 255, 0.9)'; // Blue
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(minX, padding.top - 10); // Start slightly above the plot area
                ctx.lineTo(minX, height - padding.bottom + 10); // End slightly below
                ctx.stroke();
                
                // Draw max line
                const maxX = padding.left + ((maxVal - minValue) / range) * (width - padding.left - padding.right);
                ctx.strokeStyle = 'rgba(255, 0, 0, 0.9)'; // Red
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(maxX, padding.top - 10); // Start slightly above
                ctx.lineTo(maxX, height - padding.bottom + 10); // End slightly below
                ctx.stroke();

                 // Optional: Draw small handles/indicators on the lines
                 // Min Handle (Blue)
                 ctx.fillStyle = 'rgba(50, 150, 255, 0.9)'; // Explicitly Blue
                 ctx.fillRect(minX - 3, padding.top - 15, 6, 5); // Small rectangle handle for min
                 // Max Handle (Red)
                 ctx.fillStyle = 'rgba(255, 0, 0, 0.9)'; // Explicitly Red
                 ctx.fillRect(maxX - 3, padding.top - 15, 6, 5); // Small rectangle handle for max
            }
        }
        
        // Draw statistics
        ctx.fillStyle = '#aaa';
        ctx.font = '12px Arial';
        // COMMENT OUT Min text
        // ctx.textAlign = 'left';
        // ctx.fillText(`Min: ${minValue.toExponential(4)}`, padding.left, padding.top - 15);
        // COMMENT OUT Max text
        // ctx.textAlign = 'right';
        // ctx.fillText(`Max: ${maxValue.toExponential(4)}`, width - padding.right, padding.top - 15);
        // Keep Pixel Count text
        ctx.textAlign = 'center';
        ctx.fillText(`Pixels: ${validPixelCount.toLocaleString()}`, width / 2, padding.top - 15);

        // Store scale info for interaction handlers
        // Use actual min/max of the data for scaling, not necessarily the input values
        const dataMin = window.fitsData.min_value;
        const dataMax = window.fitsData.max_value;
        const dataRange = dataMax - dataMin;

        histogramScaleInfo = {
            padding: padding,
            histWidth: width - padding.left - padding.right,
            histHeight: histHeight,
            dataMin: dataMin, // Min value used for the current histogram rendering *scale*
            dataRange: dataRange, // Range used for the current histogram rendering *scale*
            canvasWidth: width,
            canvasHeight: height
        };

        if (histogramScaleInfo.histWidth <= 0 || !isFinite(histogramScaleInfo.dataRange) || histogramScaleInfo.dataRange <= 0) {
             console.warn('Invalid histogram scale parameters:', histogramScaleInfo);
             drawEmptyHistogram(canvas, 'Invalid scale');
             return;
        }

    } catch (error) {
        console.error('Error updating histogram:', error);
        drawEmptyHistogram(canvas, 'Error updating histogram');
    } finally {
        isUpdatingHistogram = false;
        // If another update was requested while this one was running, start it now
        if (histogramUpdateRequested) {
            histogramUpdateRequested = false;
            // Use a timeout to avoid potential stack overflow if updates are rapid
            setTimeout(requestHistogramUpdate, 0);
        }
    }
}

/**
 * Draw an empty histogram with a message
 */
function drawEmptyHistogram(canvas, message) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear the canvas
    ctx.clearRect(0, 0, width, height);
    
    // Draw a message
    ctx.fillStyle = '#aaa';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(message, width / 2, height / 2);
    
    // Add a hint for tiled mode
    if (window.tiledViewer && window.tiledViewer.isOpen && window.tiledViewer.isOpen()) {
        ctx.fillText('Using tiled viewing mode', width / 2, height / 2 + 25);
    }
}


// function fetchServerHistogram() {
//     const canvas = document.getElementById('histogram-bg-canvas'); // Target BG canvas
//     if (!canvas) {
//         console.warn("Histogram background canvas not found for fetchServerHistogram.");
//         return;
//     }

//     const minInput = document.getElementById('min-range-input');
//     const maxInput = document.getElementById('max-range-input');
//     let uiMin = null;
//     let uiMax = null;

//     if (minInput && maxInput) {
//         uiMin = parseFloat(minInput.value);
//         uiMax = parseFloat(maxInput.value);
//         // Validate that uiMin and uiMax are numbers and min < max
//         if (isNaN(uiMin) || isNaN(uiMax) || uiMin >= uiMax) {
//             console.warn("Invalid Min/Max values from UI for server histogram request. uiMin:", uiMin, "uiMax:", uiMax, ". Fetching default range.");
//             uiMin = null; // Fallback to server default if UI values are bad
//             uiMax = null;
//         }
//     } else {
//         console.warn("Min/Max input fields not found. Fetching default range for server histogram.");
//     }
    
//     const ctx = canvas.getContext('2d');
//     ctx.clearRect(0, 0, canvas.width, canvas.height);
//     ctx.fillStyle = '#aaa'; ctx.font = '14px Arial'; ctx.textAlign = 'center';
//     ctx.fillText('Loading histogram data...', canvas.width / 2, canvas.height / 2);
    
//     let fetchUrl = '/fits-histogram/';
//     if (uiMin !== null && uiMax !== null) {
//         fetchUrl += `?min_val=${encodeURIComponent(uiMin)}&max_val=${encodeURIComponent(uiMax)}`;
//     }
//     console.log("Fetching server histogram from:", fetchUrl);

//     fetch(fetchUrl)
//         .then(response => {
//             if (!response.ok) { // Check if response status is indicative of an error
//                 return response.text().then(text => { // Try to get error text from server
//                     throw new Error(`Server error: ${response.status} ${response.statusText}. ${text}`);
//                 });
//             }
//             return response.json();
//         })
//         .then(data => {
//             if (data.error) { // This is if the server *successfully* responds with a JSON containing an error message
//                 console.error("Server returned error for histogram:", data.error);
//                 throw new Error(data.error); // Propagate as an error to be caught by .catch
//             }
//             drawServerHistogram(data); // Draw the received data (assumes this draws on bg-canvas)
            
//             // After drawing background, draw lines based on current inputs
//             // (which might be different from the range server used if server doesn't support min/max params)
//             if (minInput && maxInput) {
//                 const currentMin = parseFloat(minInput.value);
//                 const currentMax = parseFloat(maxInput.value);
//                 if (!isNaN(currentMin) && !isNaN(currentMax)) {
//                     drawHistogramLines(currentMin, currentMax, false); 
//                 }
//             }
//         })
//         .catch(error => { // This catches network errors or errors thrown from !response.ok or data.error
//             console.error('Error fetching or processing server histogram:', error);
//             const message = error.message || 'Unknown error';
//             ctx.clearRect(0, 0, canvas.width, canvas.height);
//             ctx.fillStyle = '#aaa'; ctx.font = '14px Arial'; ctx.textAlign = 'center';
//             // Wrap text if too long
//             const maxTextWidth = canvas.width - 20;
//             const lines = [];
//             let currentLine = '';
//             const words = `Error: ${message}`.split(' ');
//             for (const word of words) {
//                 const testLine = currentLine + word + ' ';
//                 if (ctx.measureText(testLine).width > maxTextWidth && currentLine.length > 0) {
//                     lines.push(currentLine.trim());
//                     currentLine = word + ' ';
//                 } else {
//                     currentLine = testLine;
//                 }
//             }
//             lines.push(currentLine.trim());
            
//             let yPos = canvas.height / 2 - (lines.length -1) * 7; // Adjust start Y for multi-line
//             for (const line of lines) {
//                 ctx.fillText(line, canvas.width / 2, yPos);
//                 yPos += 15; // Line height
//             }
//         });
// }

/**
 * Draw a histogram with data from the server
 */
/**
 * Draw a histogram with data from the server
 */

function drawServerHistogram(histData) {
    const doc = getHistogramDocument();
    const canvas = doc.getElementById('histogram-bg-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    const bins = histData.counts;
    const minValue = histData.min_value;
    const maxValue = histData.max_value;
    const range = maxValue - minValue;

    if (!isFinite(range) || range <= 0) {
        drawEmptyHistogram(canvas, 'Invalid data range from server');
        return;
    }

    let maxBinCount = 0;
    for (let i = 0; i < bins.length; i++) {
        maxBinCount = Math.max(maxBinCount, bins[i]);
    }

    const logMaxBinCount = Math.log(maxBinCount + 1);
    const padding = { top: 30, right: 20, bottom: 40, left: 60 };
    const histHeight = height - padding.top - padding.bottom;
    const histWidth = width - padding.left - padding.right;

    // Helper: adaptive axis formatting
    const fmt = (v) => {
        if (!isFinite(v)) return '';
        const abs = Math.abs(v);
        if (abs === 0) return '0';
        if (abs < 1e-3 || abs >= 1e4) return v.toExponential(3); // e.g., 1.23e-15
        return v.toPrecision(3); // keep meaningful digits (e.g., 0.000123 or 123.456)
    };

    // Axes
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, height - padding.bottom);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(padding.left, height - padding.bottom);
    ctx.lineTo(width - padding.right, height - padding.bottom);
    ctx.stroke();

    // Y ticks
    ctx.fillStyle = '#aaa';
    ctx.font = '10px Arial';
    ctx.textAlign = 'right';
    const numYTicks = 5;
    for (let i = 0; i <= numYTicks; i++) {
        const y = height - padding.bottom - (i / numYTicks) * histHeight;
        ctx.beginPath();
        ctx.moveTo(padding.left - 5, y);
        ctx.lineTo(padding.left, y);
        ctx.stroke();
        const logValue = logMaxBinCount > 0 ? (i / numYTicks) * logMaxBinCount : 0;
        const actualValue = Math.round(Math.exp(logValue) - 1);
        ctx.fillText(actualValue.toLocaleString(), padding.left - 8, y + 4);
    }

    // X ticks (adaptive formatting)
    ctx.textAlign = 'center';
    const numXTicks = 5;
    for (let i = 0; i <= numXTicks; i++) {
        const x = padding.left + (i / numXTicks) * histWidth;
        ctx.beginPath();
        ctx.moveTo(x, height - padding.bottom);
        ctx.lineTo(x, height - padding.bottom + 5);
        ctx.stroke();
        const value = minValue + (i / numXTicks) * range;
        ctx.fillText(fmt(value), x, height - padding.bottom + 20);
    }

    // Labels
    ctx.save();
    ctx.translate(padding.left / 2 - 5, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#aaa';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Pixel Count (log)', 0, 0);
    ctx.restore();

    ctx.fillStyle = '#aaa';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    if (typeof getXAxisLabelText === 'function') {
        ctx.fillText(getXAxisLabelText(), width / 2, height - padding.bottom + 35);
    }

    // Bars (opaque)
    ctx.fillStyle = 'rgb(0, 180, 0)';
    const barWidth = histWidth / bins.length;
    for (let i = 0; i < bins.length; i++) {
        const binCount = bins[i];
        if (binCount === 0) continue;
        const logH = logMaxBinCount > 0 ? (Math.log(binCount + 1) / logMaxBinCount) * histHeight : 0;
        if (logH <= 0) continue;
        const x = padding.left + i * barWidth;
        const y = height - padding.bottom - logH;
        ctx.fillRect(x, y, barWidth - 1, logH);
    }

    // Expose scale info for interaction
    window.histogramScaleInfo = {
        padding,
        histWidth,
        histHeight,
        dataMin: minValue,
        dataRange: range,
        canvasWidth: width,
        canvasHeight: height
    };

    // Ensure overlay and initial lines
    const haveOverlay = typeof ensureHistogramOverlayReady === 'function' ? ensureHistogramOverlayReady() : false;
    const minInput = doc.getElementById('min-range-input');
    const maxInput = doc.getElementById('max-range-input');

    let lineMin = (minInput && isFinite(parseFloat(minInput.value))) ? parseFloat(minInput.value) : minValue;
    let lineMax = (maxInput && isFinite(parseFloat(maxInput.value))) ? parseFloat(maxInput.value) : (minValue + range);

    // Clamp
    lineMin = Math.max(minValue, Math.min(minValue + range, lineMin));
    lineMax = Math.max(minValue, Math.min(minValue + range, lineMax));

    if (haveOverlay && typeof drawHistogramLines === 'function') {
        drawHistogramLines(lineMin, lineMax, false);
    }

    // Signal readiness so drag handlers can attach
    getHistogramDocument().dispatchEvent(new CustomEvent('histogram:ready'));
}


function attachHistogramInteractionWhenReady() {
    const tryAttach = () => {
        // Re-query fresh each time to avoid stale nulls
        const doc = getHistogramDocument();
        const linesCanvas = doc.getElementById('histogram-lines-canvas');
        const minInput = doc.getElementById('min-range-input');
        const maxInput = doc.getElementById('max-range-input');

        if (!linesCanvas || !minInput || !maxInput) {
            return false;
        }

        if (typeof ensureHistogramOverlayReady === 'function') {
            ensureHistogramOverlayReady();
        }

        if (window.histogramScaleInfo && window.histogramScaleInfo.padding) {
            linesCanvas.style.pointerEvents = 'auto';
            linesCanvas.style.position = 'absolute';
            linesCanvas.style.zIndex = '2';
            addHistogramInteraction(linesCanvas, minInput, maxInput);
            return true;
        }
        return false;
    };

    if (tryAttach()) return;

    const onReady = () => {
        if (tryAttach()) {
            getHistogramDocument().removeEventListener('histogram:ready', onReady);
        }
    };
    getHistogramDocument().addEventListener('histogram:ready', onReady);
}
// REPLACE your existing applyLocalFilter function in main.js with this fixed version

function applyLocalFilter(flagColumn) {
    console.log('applyLocalFilter called with:', flagColumn);
    
    if (!window.catalogDataWithFlags || !window.catalogDataForOverlay) {
        console.warn('No catalog data available for filtering');
        showNotification('No catalog data available for filtering', 3000, 'warning');
        return;
    }
    
    showNotification(true, 'Applying filter...');
    
    let visibleCount = 0;
    
    // Create a set of indices that should be visible
    const visibleIndices = new Set();
    
    // Check each object for the flag
    for (let i = 0; i < window.catalogDataWithFlags.length; i++) {
        const flagObj = window.catalogDataWithFlags[i];
        
        if (!flagObj || !(flagColumn in flagObj)) {
            continue;
        }
        
        const flagValue = flagObj[flagColumn];
        const isFlagSet = flagValue === true || flagValue === 1 || flagValue === 'true';
        
        if (isFlagSet) {
            visibleIndices.add(i);
            visibleCount++;
        }
        
        // Debug first few
        if (i < 5) {
            console.log(`Object ${i}: ${flagColumn} = ${flagValue} (${typeof flagValue}), isFlagSet = ${isFlagSet}`);
        }
    }
    
    console.log(`Found ${visibleCount} objects with ${flagColumn} = true out of ${window.catalogDataWithFlags.length} total objects`);
    
    // FIXED: Update the canvas overlay data with filter information
    if (window.catalogDataForOverlay && typeof canvasUpdateOverlay === 'function') {
        console.log('Applying filter to canvas overlay data');
        
        // Mark each object in the overlay data with filter status
        window.catalogDataForOverlay.forEach((obj, index) => {
            if (index < window.catalogDataWithFlags.length) {
                const flagObj = window.catalogDataWithFlags[index];
                if (flagObj && flagColumn in flagObj) {
                    const flagValue = flagObj[flagColumn];
                    const isFlagSet = flagValue === true || flagValue === 1 || flagValue === 'true';
                    obj.passesFilter = isFlagSet;
                } else {
                    obj.passesFilter = false;
                }
            } else {
                obj.passesFilter = false;
            }
        });
        
        // Update the global filter state
        window.flagFilterEnabled = true;
        window.currentFlagColumn = flagColumn;
        window.visibleObjectIndices = visibleIndices;
        
        // Set the filter state variables
        flagFilterEnabled = true;
        currentFlagColumn = flagColumn;
        currentEnvValue = null;
        
        // Force canvas redraw with updated filter data
        console.log('Calling canvasUpdateOverlay to refresh display with filter');
        canvasUpdateOverlay();
        
    } else if (window.catalogDots && window.catalogDots.length > 0) {
        // Fallback for DOM-based overlay (original logic)
        console.log('Applying filter to DOM dots (fallback)');
        
        window.catalogDots.forEach(dot => {
            const dotIndex = parseInt(dot.dataset.index);
            if (isNaN(dotIndex) || dotIndex >= window.catalogDataWithFlags.length) {
                dot.style.display = 'none';
                dot.dataset.passesFilter = 'false';
                return;
            }
            
            const flagObj = window.catalogDataWithFlags[dotIndex];
            let isFlagSet = false;
            
            if (flagObj && flagColumn in flagObj) {
                const flagValue = flagObj[flagColumn];
                isFlagSet = flagValue === true || flagValue === 1 || flagValue === 'true';
            }
            
            dot.style.display = isFlagSet ? 'block' : 'none';
            dot.dataset.passesFilter = isFlagSet ? 'true' : 'false';
        });
        
        // Update DOM overlay if function exists
        if (typeof updateOverlay === 'function') {
            updateOverlay();
        }
    }
    
    showNotification(false);
    
    if (visibleCount === 0) {
        showNotification(`No objects match the "${flagColumn}" filter criteria`, 3000, 'warning');
    } else {
        showNotification(`Showing ${visibleCount} objects with "${flagColumn}" flag`, 2000, 'success');
    }
}

// Add this variable at the top with other global variables
let currentEnvValue = null;


// Replace your existing updateFlagFilterUI function with this one
function updateFlagFilterUI(dropdownContent) {
    // Update button appearance
    if (flagFilterButton) {
        if (flagFilterEnabled) {
            flagFilterButton.style.backgroundColor = 'white';
            flagFilterButton.style.color = 'black';
        } else {
            flagFilterButton.style.backgroundColor = '';
            flagFilterButton.style.color = '';
        }
    }
    
    // Update dropdown items
    const flagItems = dropdownContent.querySelectorAll('.flag-item');
    flagItems.forEach(item => {
        // Reset all items first
        item.style.backgroundColor = 'transparent';
        item.style.color = 'white';
        
        // Highlight selected item based on filtering mode
        if (item.textContent === 'No Filter (Show All)' && !flagFilterEnabled) {
            // No filter selected
            item.style.backgroundColor = 'white';
            item.style.color = 'black';
        } 
        else if (item.classList.contains('env-item') && 
                flagFilterEnabled && 
                currentFlagColumn === 'env' && 
                item.dataset.envValue == currentEnvValue) {
            // Environment value selected
            item.style.backgroundColor = 'white';
            item.style.color = 'black';
        }
        else if (!item.classList.contains('env-item') && 
                flagFilterEnabled &&
                item.textContent === currentFlagColumn && 
                currentEnvValue === null) {
            // Boolean flag selected
            item.style.backgroundColor = 'white';
            item.style.color = 'black';
        }
    });
}


// Add this new function to handle env-specific filtering
function applyEnvFilter(envValue) {
    if (!window.catalogDataWithFlags || !window.catalogDots) {
        console.warn('No catalog data available for environment filtering');
        return;
    }
    
    console.log(`Applying env filter with value: ${envValue} (${typeof envValue})`);
    
    showNotification(true, 'Applying environment filter...');
    
    let visibleCount = 0;
    const totalDots = window.catalogDots.length;
    let processedObjectsWithEnv = 0;
    let objectsWithMatchingEnv = 0;
    
    // Make sure envValue is treated as a number if possible
    let targetEnvValue = envValue;
    if (typeof envValue !== 'number') {
        const parsedEnv = parseInt(envValue);
        if (!isNaN(parsedEnv)) {
            targetEnvValue = parsedEnv;
        }
    }
    
    console.log(`Using target environment value: ${targetEnvValue} (${typeof targetEnvValue})`);
    
    // Process all dots at once using the cached data
    window.catalogDots.forEach((dot, i) => {
        // Get the object index from the dot's dataset
        const dotIndex = parseInt(dot.dataset.index);
        
        if (isNaN(dotIndex) || dotIndex >= window.catalogDataWithFlags.length) {
            // If we can't match the dot to data, hide it
            dot.style.display = 'none';
            dot.dataset.passesFilter = 'false';
            return;
        }
        
        // Get the corresponding data object
        const objData = window.catalogDataWithFlags[dotIndex];
        
        // Check if the env property exists and matches the value
        let matchesEnv = false;
        
        if (objData && 'env' in objData) {
            processedObjectsWithEnv++;
            
            // Store the raw object env value
            const rawObjEnv = objData.env;
            
            // Try multiple comparison approaches
            if (typeof rawObjEnv === 'number' && typeof targetEnvValue === 'number') {
                // Direct numeric comparison
                matchesEnv = (rawObjEnv === targetEnvValue);
            } else {
                // String comparison as fallback
                const objEnvString = String(rawObjEnv).trim();
                const targetEnvString = String(targetEnvValue).trim();
                matchesEnv = (objEnvString === targetEnvString);
                
                // Also try numeric comparison if both can be converted to numbers
                const numObjEnv = parseFloat(objEnvString);
                const numTargetEnv = parseFloat(targetEnvString);
                if (!isNaN(numObjEnv) && !isNaN(numTargetEnv)) {
                    matchesEnv = matchesEnv || (numObjEnv === numTargetEnv);
                }
            }
            
            if (matchesEnv) {
                objectsWithMatchingEnv++;
            }
            
            // Debug log for the first few dots
            if (i < 10) {
                console.log(`Dot ${i} (index ${dotIndex}): env = ${rawObjEnv} (${typeof rawObjEnv}), target = ${targetEnvValue} (${typeof targetEnvValue}), matches = ${matchesEnv}`);
            }
        }
        
        // Set dot visibility based on the filter
        dot.style.display = matchesEnv ? 'block' : 'none';
        dot.dataset.passesFilter = matchesEnv ? 'true' : 'false';
        
        if (matchesEnv) {
            visibleCount++;
        }
    });
    
    // Force a redraw of the overlay
    updateOverlay();
    
    console.log(`Environment filter results:`);
    console.log(`  Total dots: ${totalDots}`);
    console.log(`  Objects with env property: ${processedObjectsWithEnv}`);
    console.log(`  Objects matching env=${targetEnvValue}: ${objectsWithMatchingEnv}`);
    console.log(`  Visible dots after filtering: ${visibleCount}`);
    
    showNotification(false);
    
    if (visibleCount === 0) {
        showNotification(`No objects match Environment ${targetEnvValue} filter criteria`, 3000);
    } else {
        const envDescription = ENV_DESCRIPTIONS[targetEnvValue] || `Environment ${targetEnvValue}`;
        showNotification(`Showing ${visibleCount} objects in "${envDescription}"`, 2500);
    }
}


function applyFlagFilter(flagColumn) {
    if (!window.catalogDots || !activeCatalog) {
        console.warn('No catalog data or dots available for filtering');
        return;
    }
    
    // Show loading indicator
    showNotification(true, 'Applying flag filter...');
    
    // First, reset all dots to be visible
    if (window.catalogDots) {
        window.catalogDots.forEach(dot => {
            dot.style.display = 'block';
            dot.dataset.passesFilter = 'true'; // Reset the filter state
        });
    }
    
    // We need to fetch source properties for each dot to check flag values
    // Start by fetching the first few to determine if flags exist
    let promises = [];
    const maxObjectsToCheck = 10; // Check first 10 objects to determine if flag exists
    
    // Get a sample of dots to check
    const sampleDots = window.catalogDots.slice(0, maxObjectsToCheck);
    
    // Fetch properties for each sample dot
    sampleDots.forEach((dot, index) => {
        const ra = parseFloat(dot.dataset.ra);
        const dec = parseFloat(dot.dataset.dec);
        
        if (!isNaN(ra) && !isNaN(dec)) {
            promises.push(
                apiFetch(`/source-properties/?ra=${ra}&dec=${dec}&catalog_name=${activeCatalog}`)
                    .then(response => response.json())
                    .then(data => {
                        if (data.error) throw new Error(data.error);
                        return data.properties || {};
                    })
                    .catch(error => {
                        console.error(`Error fetching properties for sample ${index}:`, error);
                        return {};
                    })
            );
        }
    });
    
    // Process all the sample properties to determine if flag exists
    Promise.all(promises)
        .then(results => {
            // Check if any of the sample objects have the flag column
            const flagExists = results.some(props => 
                props.hasOwnProperty(flagColumn) &&
                (typeof props[flagColumn] === 'boolean' || 
                props[flagColumn] === 'True' || 
                props[flagColumn] === 'False' ||
                props[flagColumn] === true ||
                props[flagColumn] === false ||
                props[flagColumn] === 1 ||
                props[flagColumn] === 0)
            );
            
            if (!flagExists) {
                showNotification(`Flag column "${flagColumn}" not found or is not a boolean`, 3000);
                showNotification(false);
                return;
            }
            
            // If flag exists, fetch properties for all dots (with a limit) and apply filtering
            applyFilterToAllDots(flagColumn);
        })
        .catch(error => {
            console.error('Error checking flag existence:', error);
            showNotification('Error applying filter', 3000);
            showNotification(false);
        });
}


// After applying the filter, we need to preserve the filter state
function applyFilterToAllDots(flagColumn) {
    // Process dots in batches to avoid overwhelming the server
    const batchSize = 20;
    const totalDots = window.catalogDots.length;
    let processedCount = 0;
    let visibleCount = 0;
    
    console.log(`Applying filter ${flagColumn} to ${totalDots} dots in batches of ${batchSize}`);
    
    // Process one batch at a time
    function processBatch(startIndex) {
        const endIndex = Math.min(startIndex + batchSize, totalDots);
        const batchPromises = [];
        
        // Process this batch
        for (let i = startIndex; i < endIndex; i++) {
            const dot = window.catalogDots[i];
            const ra = parseFloat(dot.dataset.ra);
            const dec = parseFloat(dot.dataset.dec);
            
            // Store the current filter on the dot so we can maintain state during updates
            dot.dataset.currentFilter = flagColumn;
            
            if (!isNaN(ra) && !isNaN(dec)) {
                batchPromises.push(
                    apiFetch(`/source-properties/?ra=${ra}&dec=${dec}&catalog_name=${activeCatalog}`)
                        .then(response => response.json())
                        .then(data => {
                            if (data.error) throw new Error(data.error);
                            const props = data.properties || {};
                            
                            // Check if the flag property exists and is true
                            if (props.hasOwnProperty(flagColumn)) {
                                const flagValue = props[flagColumn];
                                
                                // Handle different formats of boolean values
                                const isFlagSet = (flagValue === true || 
                                                  flagValue === 'True' || 
                                                  flagValue === 'true' || 
                                                  flagValue === 1);
                                
                                // Show or hide the dot based on the flag
                                dot.style.display = isFlagSet ? 'block' : 'none';
                                
                                // Store filter state on the dot element itself
                                dot.dataset.passesFilter = isFlagSet ? 'true' : 'false';
                                
                                if (isFlagSet) visibleCount++;
                            } else {
                                dot.style.display = 'none';
                                dot.dataset.passesFilter = 'false';
                            }
                            
                            return null;
                        })
                        .catch(error => {
                            console.error(`Error processing dot ${i}:`, error);
                            return null;
                        })
                );
            }
        }
        
        // Process all promises for this batch
        Promise.all(batchPromises)
            .then(() => {
                processedCount += batchPromises.length;
                
                // Update progress
                const progress = Math.min(100, Math.round((processedCount / totalDots) * 100));
                showNotification(true, `Filtering: ${progress}% complete...`);
                
                // If there are more dots to process, schedule the next batch
                if (endIndex < totalDots) {
                    setTimeout(() => processBatch(endIndex), 100);
                } else {
                    // All done
                    showNotification(false);
                    updateOverlay();
                    console.log(`Filter complete: ${visibleCount} of ${totalDots} objects visible`);
                    
                    if (visibleCount === 0) {
                        showNotification(`No objects match the "${flagColumn}" filter criteria`, 3000);
                    } else {
                        showNotification(`Showing ${visibleCount} objects with "${flagColumn}" flag`, 2000);
                    }
                }
            })
            .catch(error => {
                console.error('Error processing batch:', error);
                showNotification(false);
                showNotification('Error applying filter', 3000);
            });
    }
    
    // Start processing with the first batch
    processBatch(0);
}


// Modify the document ready function to not load FITS data automatically
document.addEventListener("DOMContentLoaded", function () {
    // Create a circular progress indicator
    createProgressIndicator();
    
    // Instead of loading FITS data directly, we'll wait for user selection
    // Add keyboard shortcuts
    document.addEventListener("keydown", function (event) {
        if (event.key === "+") {
            zoomIn();
        } else if (event.key === "-") {
            zoomOut();
        } else if (event.key.toLowerCase() === "r") {
            resetView();
        }
    });

    // Load catalogs on startup
    loadCatalogs();
    
    // Add dynamic range control
    // createDynamicRangeControl();
    createWelcomeScreen();

});

// Create a welcome screen for initial view

function createWelcomeScreen() {
    const container = document.getElementById('openseadragon');
    if (!container) return;
    
    // Clear any content
    container.innerHTML = '';
    
    // Detect if we're inside a pane (iframe) — show a minimal welcome in panes
    let inPane = false;
    try {
        inPane = (window.self !== window.top) || new URLSearchParams(window.location.search).has('pane_sid');
    } catch(_) {
        inPane = true;
    }
    
    // Add styles for the animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeIn {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
        }

        .welcome-logo {
            animation: fadeIn 1s ease-out;
            max-width: 150px;
        }

        .welcome-actions {
            display: flex;
            gap: 12px;
            justify-content: center;
            flex-wrap: wrap;
            margin-top: 16px;
        }

        .welcome-btn {
            display: inline-flex;
            align-items: center;
            gap: 10px;
            padding: 12px 16px;
            border-radius: 12px;
            text-decoration: none;
            color: #fff;
            font-weight: 650;
            font-size: 14px;
            line-height: 1;
            border: 1px solid rgba(255,255,255,0.14);
            box-shadow: 0 14px 34px rgba(0,0,0,0.35);
            transform: translateZ(0);
            transition: transform 140ms ease, box-shadow 140ms ease, filter 140ms ease;
        }

        .welcome-btn:hover {
            transform: translateY(-1px);
            box-shadow: 0 18px 44px rgba(0,0,0,0.45);
            filter: brightness(1.06);
        }

        .welcome-btn:active {
            transform: translateY(0px);
            filter: brightness(0.98);
        }

        .welcome-btn__icon {
            width: 18px;
            height: 18px;
            display: inline-block;
            flex: 0 0 auto;
        }

        .welcome-btn--github {
            background: linear-gradient(135deg, #24292f, #0f172a);
        }

        /* Features button uses an inline SVG with fill="url(#cosmicGradient)" */
        .welcome-btn--features {
            background: none;
            padding: 0;
            border: none;
        }
    `;
    document.head.appendChild(style);

    // Create welcome message
    const welcomeDiv = document.createElement('div');
    welcomeDiv.className = 'welcome-screen';
    welcomeDiv.style.position = 'absolute';
    welcomeDiv.style.top = '50%';
    welcomeDiv.style.left = '50%';
    welcomeDiv.style.transform = 'translate(-50%, -50%)';
    welcomeDiv.style.textAlign = 'center';
    welcomeDiv.style.color = 'white';
    welcomeDiv.style.fontFamily = 'Arial, sans-serif';
    welcomeDiv.style.maxWidth = '80%';
    
    if (inPane) {
        // Minimal message for panes
        welcomeDiv.innerHTML = `
        <p>Please select a FITS file to open using the folder icon 📁 in the top toolbar.</p>
        `;
    } else {
        // Full welcome for top-level app
        welcomeDiv.innerHTML = `
        <img src="static/logo/logo.png" alt="Neloura Logo" class="welcome-logo">
        <h2 style="margin-top: 0px;">Welcome to Neloura</h2>
        <p>Please select a FITS file to open using the folder icon 📁 in the top toolbar.</p>
        <div class="welcome-actions">
          <a class="welcome-btn welcome-btn--github"
             href="https://github.com/hamidnpc/Neloura/"
             target="_blank" rel="noopener noreferrer"
             aria-label="View Neloura on GitHub">
            <svg class="welcome-btn__icon" viewBox="0 0 16 16" aria-hidden="true">
              <path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/>
            </svg>
            <span>Neloura on GitHub</span>
          </a>

          <a class="welcome-btn welcome-btn--features"
             href="https://neloura.com/features.html"
             target="_blank" rel="noopener noreferrer"
             aria-label="Explore Features"
             style="text-decoration:none;">
            <svg xmlns="http://www.w3.org/2000/svg" width="260" height="48" viewBox="0 0 260 48" aria-hidden="true" focusable="false">
              <defs>
                <linearGradient id="cosmicGradient" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stop-color="#4A3B5C"/>
                  <stop offset="50%" stop-color="#8B5C9B"/>
                  <stop offset="100%" stop-color="#A875B8"/>
                </linearGradient>
              </defs>
              <rect width="260" height="48" rx="12" fill="url(#cosmicGradient)" stroke="rgba(255,255,255,0.18)"/>
              <path fill="white" opacity="0.92" transform="translate(18,14) scale(0.75)"
                d="M12 2l1.6 5.2L19 9l-5.4 1.8L12 16l-1.6-5.2L5 9l5.4-1.8L12 2zm7 8l.9 2.9L23 14l-3.1 1.1L19 18l-.9-2.9L15 14l3.1-1.1L19 10zM5 14l.9 2.9L9 18l-3.1 1.1L5 22l-.9-2.9L1 18l3.1-1.1L5 14z"/>
              <text x="148" y="29" text-anchor="middle" font-size="15" fill="white" font-weight="700">Explore Neloura Features</text>
            </svg>
          </a>
        </div>
        `;
    }
    
    // Add animated arrow pointing to the file browser button
    let pointerDiv = null;
    if (!inPane) {
        pointerDiv = document.createElement('div');
        pointerDiv.className = 'welcome-pointer';
        pointerDiv.innerHTML = '&#10229;'; // Left arrow
    }
    
    container.appendChild(welcomeDiv);
    if (pointerDiv) container.appendChild(pointerDiv);
}

function loadFitsFromUrl() {
    const urlInput = document.getElementById('fits-url-input');
    const fileUrl = urlInput.value.trim();
    if (fileUrl) {
        console.log(`[loadFitsFromUrl] Loading FITS from URL: ${fileUrl}`);
        
        const welcomeScreen = document.getElementById('welcome-screen');
        if (welcomeScreen) {
            welcomeScreen.style.display = 'none';
        }
        
        loadFitsFileWithHduSelection(fileUrl);
    } else {
        showNotification('Please enter a valid FITS file URL.', 3000, 'warning');
    }
}
// Override the loadFitsData function to create welcome screen instead of automatically loading
function loadFitsData() {
    // Don't show loading indicator
    const progressContainer = document.getElementById('progress-container');
    if (progressContainer) {
        progressContainer.style.display = 'none';
    }

    // Hide welcome UI if we're about to auto-load a file.
    const hideWelcomeUi = () => {
        try {
            // Most of the welcome UI uses these classes
            document.querySelectorAll('.welcome-screen, .welcome-pointer').forEach((el) => {
                try { el.remove(); } catch (_) { try { el.style.display = 'none'; } catch (_) {} }
            });
            // Legacy/id-based fallback (some older code paths referenced this)
            const legacy = document.getElementById('welcome-screen');
            if (legacy) {
                try { legacy.remove(); } catch (_) { try { legacy.style.display = 'none'; } catch (_) {} }
            }
        } catch (_) {}
    };

    // Auto-open FITS from URL params, if provided.
    // Canonical form: /?file=<filepath>[&hdu=<int>]
    try {
        const sp = new URLSearchParams(window.location.search || '');
        const fileParam = sp.get('file');
        const hduParam = sp.get('hdu');
        if (fileParam && String(fileParam).trim() !== '') {
            const filepath = String(fileParam).trim();
            // When deep-linking via `/open/...` (redirects to `/?file=...`), do not auto-open
            // the in-app file browser. It can flash open before the file finishes loading.
            try { window.__DISABLE_AUTO_FILE_BROWSER = true; } catch (_) {}
            try { if (typeof window.hideFileBrowser === 'function') window.hideFileBrowser(); } catch (_) {}
            try { setTimeout(() => { try { window.hideFileBrowser && window.hideFileBrowser(); } catch (_) {} }, 0); } catch (_) {}
            hideWelcomeUi();
            // If a specific HDU is given, open directly; otherwise, show HDU picker if needed.
            if (hduParam !== null && String(hduParam).trim() !== '') {
                const hduIdx = parseInt(String(hduParam), 10);
                if (Number.isFinite(hduIdx)) {
                    selectHdu(hduIdx, filepath);
                    // Catalog deep-link (if present) will be applied after the viewer opens.
                    return;
                }
            }
            loadFitsFileWithHduSelection(filepath);
            // Catalog deep-link (if present) will be applied after the viewer opens.
            return;
        }
    } catch (_) {}

    // No URL-specified file: show welcome screen
    createWelcomeScreen();
}

// -------------------------
// Deep-link catalog overlay
// -------------------------
function __parseCatalogDeepLink() {
    try {
        const sp = new URLSearchParams(window.location.search || '');
        const catalog = sp.get('catalog');
        if (!catalog || String(catalog).trim() === '') return null;

        const spec = {
            name: String(catalog).trim(),
            // column mappings
            ra_col: sp.get('ra_col') ? String(sp.get('ra_col')).trim() : null,
            dec_col: sp.get('dec_col') ? String(sp.get('dec_col')).trim() : null,
            size_col: sp.get('size_col') ? String(sp.get('size_col')).trim() : null,
            size_unit: sp.get('size_unit') ? String(sp.get('size_unit')).trim() : null,
            color_col: sp.get('color_col') ? String(sp.get('color_col')).trim() : null,
            // basic style (optional)
            border_color: sp.get('border_color') ? String(sp.get('border_color')).trim() : null,
            fill_color: sp.get('fill_color') ? String(sp.get('fill_color')).trim() : null,
            opacity: sp.get('opacity') != null ? Number(sp.get('opacity')) : null,
            border_width: sp.get('border_width') != null ? Number(sp.get('border_width')) : null,
            color_map: sp.get('color_map') ? String(sp.get('color_map')).trim() : (sp.get('color_map_name') ? String(sp.get('color_map_name')).trim() : null)
        };

        return spec;
    } catch (_) {
        return null;
    }
}

function __applyCatalogDeepLinkIfPresent() {
    const spec = __parseCatalogDeepLink();
    if (!spec) return;

    // Only attempt once per page load.
    if (window.__deepLinkCatalogApplied) return;

    const tryApply = () => {
        try {
            const loader = window.loadCatalog; // catalogs.js sets window.loadCatalog = loadCatalogBinary
            const viewerReady = !!(window.tiledViewer && typeof window.tiledViewer.isOpen === 'function' && window.tiledViewer.isOpen());
            if (typeof loader !== 'function' || !viewerReady) return false;

            // Persist raw overrides so downstream (SED/RGB/properties) can respect the selected columns.
            try {
                if (!window.catalogOverridesByCatalog) window.catalogOverridesByCatalog = {};
                const key = spec.name;
                const apiKey = key.split('/').pop().split('\\').pop();
                const overrides = {};
                if (spec.ra_col) overrides.ra_col = spec.ra_col;
                if (spec.dec_col) overrides.dec_col = spec.dec_col;
                if (spec.size_col) overrides.size_col = spec.size_col;
                if (spec.size_unit) overrides.size_unit = spec.size_unit;
                if (spec.color_col) overrides.color_col = spec.color_col;
                window.catalogOverridesByCatalog[key] = { ...(window.catalogOverridesByCatalog[key] || {}), ...overrides };
                if (apiKey) window.catalogOverridesByCatalog[apiKey] = { ...(window.catalogOverridesByCatalog[apiKey] || {}), ...overrides };
            } catch (_) {}

            // Build styles object to pass to loader (preferred path).
            const styles = {};
            if (spec.ra_col) styles.raColumn = spec.ra_col;
            if (spec.dec_col) styles.decColumn = spec.dec_col;
            if (spec.size_col) styles.sizeColumn = spec.size_col;
            if (spec.size_unit) styles.sizeUnit = spec.size_unit;
            if (spec.color_col) styles.colorCodeColumn = spec.color_col;
            if (spec.color_map) styles.colorMapName = spec.color_map;
            if (spec.border_color) styles.borderColor = spec.border_color;
            if (spec.fill_color) styles.backgroundColor = spec.fill_color;
            if (Number.isFinite(spec.opacity)) styles.opacity = spec.opacity;
            if (Number.isFinite(spec.border_width)) styles.borderWidth = spec.border_width;

            window.__deepLinkCatalogApplied = true;
            loader(spec.name, Object.keys(styles).length ? styles : null);
            return true;
        } catch (_) {
            return false;
        }
    };

    // Try now, otherwise wait until the viewer opens.
    if (tryApply()) return;
    try {
        const onOpen = () => {
            try {
                if (tryApply()) {
                    document.removeEventListener('viewer:open', onOpen);
                }
            } catch (_) {}
        };
        document.addEventListener('viewer:open', onOpen);
        // Also poll briefly in case viewer:open fired before we attached.
        let attempts = 0;
        const t = setInterval(() => {
            attempts++;
            if (tryApply() || attempts > 60) clearInterval(t);
        }, 250);
    } catch (_) {}
}



// Global variables for tiled rendering
let tiledViewer = null;
let currentTileInfo = null;


        // static/main.js

        // Helper function to show an immediate, basic placeholder in the viewer area
        function showImmediatePlaceholder(message = 'Loading image preview...') {
            let mainContainer = document.getElementById('main-container');
            if (!mainContainer) return; // Cannot show if main container doesn't exist

            let placeholder = document.getElementById('immediate-placeholder');
            if (!placeholder) {
                placeholder = document.createElement('div');
                placeholder.id = 'immediate-placeholder';
                // Basic styles, assuming CSS will handle the rest
                mainContainer.appendChild(placeholder);
            }
            placeholder.textContent = message;
            placeholder.style.display = 'flex';
        }

        function hideImmediatePlaceholder() {
            const placeholder = document.getElementById('immediate-placeholder');
            if (placeholder) {
                placeholder.style.display = 'none';
            }
        }

// In static/main.js

// Also update the initializeTiledViewer function in main.js:

// Initialize tiled viewer
async function initializeTiledViewer() {
    console.log("Initializing tiled viewer");

    showImmediatePlaceholder('Preparing image preview...');
    showNotification(true, 'Loading detailed image information...');

    try {
        const response = await apiFetch('/fits-tile-info/');
        if (!response.ok) {
            let errorText = response.statusText;
            try {
                const errorData = await response.json();
                if (errorData && errorData.error) {
                    errorText = errorData.error;
                }
            } catch (e) { /* ignore if response is not json */ }
            throw new Error(`Failed to get tile info: ${errorText} (status: ${response.status})`);
        }
        let tileInfo = await response.json();
        if (!tileInfo || typeof tileInfo !== 'object') {
            console.warn('[initializeTiledViewer] Received null/invalid tileInfo; defaulting to empty object');
            tileInfo = {};
        }

        currentTileInfo = tileInfo;
        console.log("Tile info received:", tileInfo);
        
        // Ensure window.fitsData exists
        if (!window.fitsData) window.fitsData = {};


        // Check if we're in multi-panel mode - if so, don't clear catalogs as they should persist across panels
        let isMultiPanelMode = false;
        try {
            const topWin = (window.top && window.top !== window) ? window.top : window;
            const wrap = topWin.document.getElementById('multi-panel-container');
            const grid = topWin.document.getElementById('multi-panel-grid');
            isMultiPanelMode = wrap && wrap.style.display !== 'none' && grid && grid.querySelectorAll('iframe').length >= 2;
        } catch (_) {}
        
        // Also check for preserveCatalogs flag (set when transitioning to multi-panel)
        // Treat iframe panes as "multi-panel context" even before the parent can seed window flags.
        // This prevents the left pane from clearing catalogs during single→multi transitions.
        let isPaneContext = false;
        try {
            const sp = new URLSearchParams(window.location.search || '');
            isPaneContext = sp.has('pane_sid') || sp.get('mp') === '1';
        } catch (_) {}
        const shouldPreserveCatalogs = isMultiPanelMode || isPaneContext || !!window.__preserveCatalogs;

        if (typeof clearAllCatalogs === 'function') {
            if (shouldPreserveCatalogs) {
                console.log("Multi-panel mode detected - preserving catalogs across panels.");
            } else {
                console.log("New FITS file opened (fast loader), clearing all existing catalogs.");
                clearAllCatalogs();
            }
        }
        if (typeof clearSegmentOverlay === 'function') {
            // Only clear segments if not in multi-panel mode (segments should also persist)
            if (!isMultiPanelMode) {
                clearSegmentOverlay('new-image');
            }
        }

        // Store BUNIT if available
        window.fitsData.bunit = (tileInfo && tileInfo.bunit) ? tileInfo.bunit : null;

        // Store overall data min/max for reference
        window.fitsData.data_min = tileInfo.data_min;
        window.fitsData.data_max = tileInfo.data_max;

        // Check for pending restoreState with display settings (from multi-panel addPanel)
        // Apply them BEFORE setting defaults so tiles load with correct min/max
        let pendingDisplaySettings = null;
        try {
            if (window.__pendingRestoreState && window.__pendingRestoreState.display) {
                pendingDisplaySettings = window.__pendingRestoreState.display;
                // Apply display settings immediately to window.fitsData before defaults
                if (Number.isFinite(pendingDisplaySettings.min)) {
                    window.fitsData.min_value = pendingDisplaySettings.min;
                }
                if (Number.isFinite(pendingDisplaySettings.max)) {
                    window.fitsData.max_value = pendingDisplaySettings.max;
                }
                if (pendingDisplaySettings.colorMap) {
                    window.currentColorMap = pendingDisplaySettings.colorMap;
                }
                if (pendingDisplaySettings.scaling) {
                    window.currentScaling = pendingDisplaySettings.scaling;
                }
                window.currentColorMapInverted = !!pendingDisplaySettings.invert;
                
                // Also apply to backend immediately via API (before tiles load)
                // Update version immediately so tiles use correct min/max
                if (typeof currentDynamicRangeVersion !== 'undefined') {
                    currentDynamicRangeVersion = Date.now();
                } else {
                    window.currentDynamicRangeVersion = Date.now();
                }
                
                if (typeof apiFetch === 'function' && Number.isFinite(pendingDisplaySettings.min) && Number.isFinite(pendingDisplaySettings.max)) {
                    const fileId = window.currentLoadedFitsFileId || window.currentLoadedFitsFileID || (tileInfo && (tileInfo.file_id || tileInfo.fileId)) || null;
                    // Fire and forget - don't wait, just apply it
                    apiFetch('/update-dynamic-range/', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            min_value: pendingDisplaySettings.min,
                            max_value: pendingDisplaySettings.max,
                            color_map: pendingDisplaySettings.colorMap || window.currentColorMap || 'grayscale',
                            scaling_function: pendingDisplaySettings.scaling || window.currentScaling || 'linear',
                            invert_colormap: !!pendingDisplaySettings.invert,
                            file_id: fileId || undefined
                        })
                    }).catch(() => { });
                }
            }
        } catch (_) {}
        
        // Store initial display min/max from server (priority)
        // But only if we don't have pending restoreState (which already set the values)
        if (!pendingDisplaySettings) {
            if (typeof tileInfo.initial_display_min !== 'undefined' && typeof tileInfo.initial_display_max !== 'undefined') {
                window.fitsData.initial_min_value = tileInfo.initial_display_min;
                window.fitsData.initial_max_value = tileInfo.initial_display_max;
                window.fitsData.min_value = tileInfo.initial_display_min;
                window.fitsData.max_value = tileInfo.initial_display_max;
            } else if (typeof window.fitsData.data_min !== 'undefined' && typeof window.fitsData.data_max !== 'undefined') {
                console.warn("initial_display_min/max not in tileInfo. Using data_min/max for initial and current dynamic range.");
                window.fitsData.min_value = window.fitsData.data_min;
                window.fitsData.max_value = window.fitsData.data_max;
                window.fitsData.initial_min_value = window.fitsData.data_min; 
                window.fitsData.initial_max_value = window.fitsData.data_max;
            } else {
                console.error("Critical: Cannot determine initial dynamic range. Neither initial_display_min/max nor data_min/max were provided in tileInfo.");
                window.fitsData.min_value = 0;
                window.fitsData.max_value = 1;
                window.fitsData.initial_min_value = 0;
                window.fitsData.initial_max_value = 1;
            }
        } else {
            // We have pending settings, but still store initial values for reference
            if (typeof tileInfo.initial_display_min !== 'undefined' && typeof tileInfo.initial_display_max !== 'undefined') {
                window.fitsData.initial_min_value = tileInfo.initial_display_min;
                window.fitsData.initial_max_value = tileInfo.initial_display_max;
            } else if (typeof window.fitsData.data_min !== 'undefined' && typeof window.fitsData.data_max !== 'undefined') {
                window.fitsData.initial_min_value = window.fitsData.data_min;
                window.fitsData.initial_max_value = window.fitsData.data_max;
            }
        }

        // Update UI input fields for min/max
        const doc = getHistogramDocument();
        const minInputEl = doc.getElementById('min-range-input');
        const maxInputEl = doc.getElementById('max-range-input');
        if (minInputEl && maxInputEl) {
            minInputEl.value = window.fitsData.min_value.toFixed(GLOBAL_DATA_PRECISION || 2);
            maxInputEl.value = window.fitsData.max_value.toFixed(GLOBAL_DATA_PRECISION || 2);
        }

        // Set global current colormap and scaling from server or defaults, and update UI
        // But use pending display settings if available (already set above)
        if (!pendingDisplaySettings) {
            window.currentColorMap = tileInfo.color_map || 'grayscale';
            window.currentScaling = tileInfo.scaling_function || 'linear';
            window.currentColorMapInverted = !!tileInfo.invert_colormap;
        }
        currentColorMapInverted = window.currentColorMapInverted;

        const colorMapSelect = doc.getElementById('color-map-select');
        if (colorMapSelect) {
            colorMapSelect.value = window.currentColorMap;
        }
        const scalingSelect = doc.getElementById('scaling-select');
        if (scalingSelect) {
            scalingSelect.value = window.currentScaling;
        }
        const invertToggle = doc.getElementById('invert-colormap-toggle');
        if (invertToggle) {
            invertToggle.checked = !!window.currentColorMapInverted;
        }

        hideImmediatePlaceholder();

        if (tileInfo.overview) {
            showOverviewImage(tileInfo.overview);
        } else {
            console.warn("No tileInfo.overview received. The view might be blank until tiles load.");
        }

        // Guard: if essential dimensions are missing, retry shortly rather than opening invalid source
        if (!Number.isFinite(tileInfo.width) || !Number.isFinite(tileInfo.height) || tileInfo.width <= 0 || tileInfo.height <= 0) {
            console.warn('[initializeTiledViewer] Invalid or missing tileInfo dimensions, retrying in 200ms...', tileInfo);
            setTimeout(initializeTiledViewer, 200);
            return;
        }

        const tileSource = {
            width: tileInfo.width,
            height: tileInfo.height,
            tileSize: tileInfo.tileSize,
            maxLevel: tileInfo.maxLevel,
            minLevel: tileInfo.minLevel === undefined ? 0 : tileInfo.minLevel,
            getTileUrl: function(level, x, y) {
                const sid = (function(){
                    try {
                        return (window.__forcedSid) ||
                               (new URLSearchParams(window.location.search).get('sid')) ||
                               (new URLSearchParams(window.location.search).get('pane_sid')) ||
                               sessionStorage.getItem('sid');
                    } catch(_) { return sessionStorage.getItem('sid'); }
                })();
                const sidParam = sid ? `sid=${encodeURIComponent(sid)}&` : '';
                return `/fits-tile/${level}/${x}/${y}?${sidParam}v=${currentDynamicRangeVersion}`;
            }
        };
        
        const viewerOptions = {
            id: "openseadragon",
            tileSources: tileSource,
            prefixUrl: "/static/vendor/openseadragon/images/",
            showNavigator: true,
            navigatorPosition: "TOP_LEFT",
            showZoomControl: false,
            showHomeControl: false,
            showFullPageControl: false,
            showRotationControl: false,
            defaultZoomLevel: tileInfo.defaultZoomLevel || 0.8,
            minZoomLevel: tileInfo.minZoomLevel || 0.05,
            maxZoomLevel:75,
            immediateRender: true,
            blendTime: 0.1,
            placeholderFillStyle: "#000000",
            backgroundColor: "#000000",
            navigatorBackground: "#000000",
            timeout: 120000,
            springStiffness: 7,
            visibilityRatio: 0.1,
            constrainDuringPan: true,
            imageSmoothingEnabled: false,
            // Network/concurrency tuning for slow backends (e.g., Ceph)
            // Increase or decrease to match server throughput. 6 is the OSD default.
            imageLoaderLimit: 6,
            // Use XHR for tiles so they can be canceled if needed by OSD internals
            loadTilesWithAjax: true,
            ajaxWithCredentials: true,
            ajaxHeaders: (function(){
                try {
                    const sp = new URLSearchParams(window.location.search);
                    const sid = (window.__forcedSid) || sp.get('sid') || sp.get('pane_sid') || sessionStorage.getItem('sid');
                    return sid ? { 'X-Session-ID': sid } : {};
                } catch(_){ return {}; }
            })()
        };

        if (!window.tiledViewer) {
            window.tiledViewer = OpenSeadragon(viewerOptions);
            // emit fits:opened with best-known file/hdu
document.dispatchEvent(new CustomEvent('fits:opened', {
    detail: {
      file: window.currentFitsFile || (window.fitsData && (window.fitsData.filepath || window.fitsData.filePath || window.fitsData.filename)) || null,
      hdu: (window.currentHduIndex != null ? window.currentHduIndex : 0)
    }
  }));
            window.viewer = window.tiledViewer; // ADD THIS LINE
            window.tiledViewer.addHandler('open', function() {
                console.log("Tiled viewer opened. Hiding overview image.");
                showNotification(false);
                hideOverviewImage();
                hideImmediatePlaceholder();
                requestHistogramUpdate();
                attachHistogramInteractionWhenReady();
              
                // add these two lines
                if (typeof attachWcsAxesWhenReady === 'function') attachWcsAxesWhenReady(window.tiledViewer);
                document.dispatchEvent(new CustomEvent('viewer:open'));
              });
            window.tiledViewer.addHandler('open-failed', function(event) {
                console.error("Failed to open tiled image (window.tiledViewer):", event);
                showNotification(false);
                hideImmediatePlaceholder();
                hideOverviewImage(); 
                showNotification(`Error loading tiled image: ${event.message || 'Unknown error'}`, 5000, 'error');
            });

        } else {
            console.log("Existing window.tiledViewer found, opening new tileSource.");
            hideImmediatePlaceholder();
            hideOverviewImage(); 
            window.tiledViewer.open(tileSource);
        }

    } catch (error) {
        console.error("Error initializing tiled viewer:", error);
        showNotification(false);
        hideImmediatePlaceholder();
        hideOverviewImage();
        showNotification(`Error during tiled viewer setup: ${error.message}`, 5000, 'error');
    }
}

        // static/main.js

        // MODIFIED showOverviewImage function (replace existing one)
        function showOverviewImage(base64Image) {
            console.log("showOverviewImage called.");
            let overviewContainer = document.getElementById('overview-container');
            if (!overviewContainer) {
                overviewContainer = document.createElement('div');
                overviewContainer.id = 'overview-container';
                overviewContainer.style.position = 'absolute';
                overviewContainer.style.top = '0';
                overviewContainer.style.left = '0';
                overviewContainer.style.width = '100%';
                overviewContainer.style.height = '100%';
                overviewContainer.style.display = 'flex';
                overviewContainer.style.justifyContent = 'center';
                overviewContainer.style.alignItems = 'center';
                overviewContainer.style.backgroundColor = '#000';
                overviewContainer.style.zIndex = '999'; // Ensure it's above viewer but below popups
                
                const osdContainer = document.getElementById('openseadragon');
                if (osdContainer) {
                    osdContainer.appendChild(overviewContainer);
        } else {
                    console.error("OpenSeadragon container not found for overview image.");
                    // If osdContainer is not found, we can't display or process the image.
                    window.histogramOverviewPixelData = null; // Clear any old cache
                    return; 
                }
            }
            
            const img = document.createElement('img');
            img.style.maxWidth = '100%';
            img.style.maxHeight = '100%';
        
            img.onload = function() {
                console.log("Overview image loaded in showOverviewImage, attempting to cache for histogram.");
                // Build a dense histogram cache from the overview PNG (all pixels)
try {
    const imgEl = img; // your image element used for the overview
    const off = document.createElement('canvas');
    off.width = imgEl.naturalWidth || imgEl.width;
    off.height = imgEl.naturalHeight || imgEl.height;
    const octx = off.getContext('2d', { willReadFrequently: true });
    octx.drawImage(imgEl, 0, 0);
    const imageData = octx.getImageData(0, 0, off.width, off.height);
    const data = imageData.data; // RGBA
    const width = imageData.width;
    const height = imageData.height;
    const numPixels = width * height;

    // Convert RGB to luminance [0,1] (approx)
    const luminance01 = new Float32Array(numPixels);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
        luminance01[j] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    // Map luminance back to data units using initial display min/max if available
    const min = (window.tiledViewer && window.tiledViewer.initial_display_min)
        ?? (window.fitsData && window.fitsData.initial_display_min)
        ?? (window.fitsData && window.fitsData.wcs && window.fitsData.wcs.min_value)
        ?? null;
    const max = (window.tiledViewer && window.tiledViewer.initial_display_max)
        ?? (window.fitsData && window.fitsData.initial_display_max)
        ?? (window.fitsData && window.fitsData.wcs && window.fitsData.wcs.max_value)
        ?? null;

    let pixelsDataUnits;
    if (typeof min === 'number' && typeof max === 'number' && max > min) {
        const range = max - min;
        pixelsDataUnits = new Float32Array(numPixels);
        for (let k = 0; k < numPixels; k++) {
            pixelsDataUnits[k] = min + luminance01[k] * range;
        }
    } else {
        // Fallback: keep normalized 0..1 if we don't have min/max
        pixelsDataUnits = luminance01;
    }

    window.cachedOverviewForHistogram = {
        pixels: pixelsDataUnits,
        width,
        height,
        dataMin: (typeof min === 'number') ? min : 0,
        dataMax: (typeof max === 'number') ? max : 1,
        source: 'overview'
    };

    console.log('Cached overview pixel data for histogram:', {
        pixels: `Float32Array(${pixelsDataUnits.length})`,
        width,
        height,
        dataMin: window.cachedOverviewForHistogram.dataMin,
        dataMax: window.cachedOverviewForHistogram.dataMax
    });
} catch (e) {
    console.warn('Failed to cache overview pixels for histogram:', e);
}
            };
        
            img.onerror = function() {
                console.error("Error loading overview image in showOverviewImage. Cannot cache for histogram.");
                window.histogramOverviewPixelData = null; // Clear on error
            };
            
            // Setting src should be done after onload/onerror are attached.
            img.src = `data:image/png;base64,${base64Image}`; 
            
            overviewContainer.innerHTML = ''; // Clear previous image if any
            overviewContainer.appendChild(img);
            overviewContainer.style.display = 'flex'; // Ensure it's visible
            overviewContainer.style.opacity = '1';
        }
// Hide overview image once tiles start loading
function hideOverviewImage() {
    overviewLoadingStopped = true; // Set flag to stop overview loading
    const overviewContainer = document.getElementById('overview-container');
    if (overviewContainer) {
        // Fade out animation
        overviewContainer.style.transition = 'opacity 0.5s ease-out';
        overviewContainer.style.opacity = '0';
        
        // Remove after animation
        setTimeout(() => {
            if (overviewContainer.parentNode) {
                overviewContainer.parentNode.removeChild(overviewContainer);
            }
        }, 500);
    }
}



// Update the overview image with better quality
function updateOverviewImage(url, quality) {
    console.log(`Updating overview image with quality level ${quality}`);
    
    const overviewContainer = document.getElementById('overview-container');
    if (overviewContainer) {
        // Find or create the image element
        let img = overviewContainer.querySelector('img');
        if (!img) {
            img = document.createElement('img');
            img.style.maxWidth = '100%';
            img.style.maxHeight = '100%';
            overviewContainer.innerHTML = '';
            overviewContainer.appendChild(img);
        }
        
        // Update the image source
        img.src = url;
        
        // Make sure the container is visible
        overviewContainer.style.display = 'flex';
        overviewContainer.style.opacity = '1';
    }
}

// Load overview at specified quality level
function loadOverviewAtQuality(quality) {
    if (overviewLoadingStopped) { // Check flag
        console.log("Overview loading stopped because main tiles are loading.");
        return;
    }
    apiFetch(`/fits-overview/${quality}`)
        .then(response => {
            if (!response.ok) {
                if (response.status === 404) {
                    // Overview not yet available, retry later
                    setTimeout(() => loadOverviewAtQuality(quality), 1000);
                }
                return null;
            }
            return response.blob();
        })
        .then(blob => {
            if (blob) {
                // Update the overview image
                const url = URL.createObjectURL(blob);
                updateOverviewImage(url, quality);
                
                // Load the next quality level if below max and not stopped
                if (quality < 100 && !overviewLoadingStopped) { // Added condition to stop recursion
                    setTimeout(() => loadOverviewAtQuality(quality + 1), 1000);
                }
            }
        })
        .catch(error => {
            console.error(`Error loading overview at quality ${quality}:`, error);
        });
}



function parseWCS(header) {
    if (!header) {
        console.error("No FITS header provided to parseWCS.");
        return { hasWCS: false, worldToPixels: () => null, pixelsToWorld: () => null };
    }

    function getProperty(obj, propName) {
        if (!obj || typeof propName !== 'string') return undefined;
        const upperCasePropName = propName.toUpperCase();
        if (obj.hasOwnProperty(upperCasePropName)) {
            return obj[upperCasePropName];
        }
        const lowerCasePropName = propName.toLowerCase();
        for (const key in obj) {
            if (key.toLowerCase() === lowerCasePropName) {
                return obj[key];
            }
        }
        return undefined;
    }

    const wcsInfo = {
        hasWCS: false,
        crval1: getProperty(header, 'CRVAL1'),
        crval2: getProperty(header, 'CRVAL2'),
        crpix1: getProperty(header, 'CRPIX1'),
        crpix2: getProperty(header, 'CRPIX2'),
        cd11: getProperty(header, 'CD1_1') || getProperty(header, 'CDELT1') || 1,
        cd12: getProperty(header, 'CD1_2') || 0,
        cd21: getProperty(header, 'CD2_1') || 0,
        cd22: getProperty(header, 'CD2_2') || getProperty(header, 'CDELT2') || 1,
        ctype1: getProperty(header, 'CTYPE1') || '',
        ctype2: getProperty(header, 'CTYPE2') || '',
        naxis1: getProperty(header, 'NAXIS1'),
        naxis2: getProperty(header, 'NAXIS2')
    };

    if (wcsInfo.crval1 !== undefined && wcsInfo.crval2 !== undefined &&
        wcsInfo.crpix1 !== undefined && wcsInfo.crpix2 !== undefined) {
        wcsInfo.hasWCS = true;
    } else {
        return { hasWCS: false, worldToPixels: () => null, pixelsToWorld: () => null };
    }

    wcsInfo.worldToPixels = (ra, dec) => {
        // console.log('worldToPixels called:::::',ra, dec);
        if (wcsInfo.ctype1.includes('RA---TAN') && wcsInfo.ctype2.includes('DEC--TAN')) {
            const D2R = Math.PI / 180.0;
            const R2D = 180.0 / Math.PI;

            const ra_rad = ra * D2R;
            const dec_rad = dec * D2R;

            const ra0_rad = wcsInfo.crval1 * D2R;
            const dec0_rad = wcsInfo.crval2 * D2R;

            const cos_dec = Math.cos(dec_rad);
            const cos_dec0 = Math.cos(dec0_rad);
            const sin_dec = Math.sin(dec_rad);
            const sin_dec0 = Math.sin(dec0_rad);

            const A = cos_dec * Math.cos(ra_rad - ra0_rad);
            const F = 1 / (sin_dec * sin_dec0 + A * cos_dec0);

            const X = F * cos_dec * Math.sin(ra_rad - ra0_rad);
            const Y = F * (sin_dec * cos_dec0 - A * sin_dec0);

            const xi = X * R2D;
            const eta = Y * R2D;

            const det = wcsInfo.cd11 * wcsInfo.cd22 - wcsInfo.cd12 * wcsInfo.cd21;
            const inv_det = 1.0 / det;
            const inv_cd11 = wcsInfo.cd22 * inv_det;
            const inv_cd12 = -wcsInfo.cd12 * inv_det;
            const inv_cd21 = -wcsInfo.cd21 * inv_det;
            const inv_cd22 = wcsInfo.cd11 * inv_det;

            let x = wcsInfo.crpix1 + inv_cd11 * xi + inv_cd12 * eta;
            let y = wcsInfo.crpix2 + inv_cd21 * xi + inv_cd22 * eta;

            // Adjust for 1-based FITS indexing
            x = x - 1;
            y = y - 1;

            return { x: x, y: y };
        }
        return null;
    };

    wcsInfo.pixelsToWorld = (x, y) => {
        if (wcsInfo.ctype1.includes('RA---TAN') && wcsInfo.ctype2.includes('DEC--TAN')) {
            const D2R = Math.PI / 180.0;

            const x_prime = x - wcsInfo.crpix1 + 1;
            const y_prime = y - wcsInfo.crpix2 + 1;

            const xi = (wcsInfo.cd11 * x_prime + wcsInfo.cd12 * y_prime) * D2R;
            const eta = (wcsInfo.cd21 * x_prime + wcsInfo.cd22 * y_prime) * D2R;

            const ra0_rad = wcsInfo.crval1 * D2R;
            const dec0_rad = wcsInfo.crval2 * D2R;

            const cos_dec0 = Math.cos(dec0_rad);
            const sin_dec0 = Math.sin(dec0_rad);

            const H = Math.sqrt(xi * xi + eta * eta);
            const delta = Math.atan(H);
            const sin_delta = Math.sin(delta);
            const cos_delta = Math.cos(delta);

            const dec_rad = Math.asin(cos_delta * sin_dec0 + (eta * sin_delta * cos_dec0) / H);
            const ra_rad = ra0_rad + Math.atan2(xi * sin_delta, H * cos_dec0 * cos_delta - eta * sin_dec0 * sin_delta);

            return { ra: ra_rad * 180 / Math.PI, dec: dec_rad * 180 / Math.PI };
        }
        return null;
    };

    return wcsInfo;
}




// THIS IS THE NEW ENTRY POINT for tiled/fast loading
function handleFastLoadingResponse(data, filepath) {
    if (!data || !data.tile_info) {
        console.error("Fast loading response is missing tile_info.", data);
        showNotification("Error: Invalid response from server for tiled loading.", 5000, 'error');
        return;
    }

    // If user switched to a different FITS file, hard-reset cube slider state first
    // so we never show stale channel counts / previews from the previous cube.
    try {
        const prevFile = window.currentFitsFile;
        if (prevFile && prevFile !== filepath) {
            // Clear regions + zoom insets when switching to a NEW FITS file
            try { if (typeof window.clearAllRegions === 'function') window.clearAllRegions(); } catch (_) {}
            try { if (typeof window.removeAllZoomInsets === 'function') window.removeAllZoomInsets(); } catch (_) {}
            try { removeCubeSliceSlider(); } catch (_) {}
            try { window.currentCubeSliceIndex = 0; } catch (_) {}
            try { window.currentLoadedFitsFileId = null; } catch (_) {}
        }
    } catch (_) {}

    // Set the global filepath variable.
    window.currentFitsFile = filepath;

    // Store basic FITS information globally. THIS IS THE 2ND FIX.
    // The data is now nested inside the tile_info object from the server.
    const tileInfo = data.tile_info;
    // Track active generator id for dynamic-range updates (important for cube slices)
    try {
        window.currentLoadedFitsFileId =
            (data && (data.file_id || data.fileId)) ||
            (tileInfo && (tileInfo.file_id || tileInfo.fileId)) ||
            window.currentLoadedFitsFileId || null;
    } catch (_) {}
    // Preserve previously fetched WCS (and flip_y) ONLY when we're still on the same file+HDU.
    // In multi-panel mode, different panes can load different files; reusing WCS from a previous file
    // causes overlays/peak-finder coords to be computed against the wrong header (appears as "previous map").
    const prevFits = window.fitsData || {};
    const currentHduIdx = (typeof window.currentHduIndex === 'number') ? window.currentHduIndex : 0;
    const prevKey = `${String(prevFits.filename || '')}:${String(prevFits.hduIndex ?? '')}`;
    const nextKey = `${String(filepath || '')}:${String(currentHduIdx)}`;
    const isSameFileAndHdu = prevKey && nextKey && prevKey === nextKey;

    const preservedWcs = (tileInfo && tileInfo.wcs)
        ? tileInfo.wcs
        : (isSameFileAndHdu ? (prevFits.wcs || null) : null);

    const preservedFlipY = (tileInfo && typeof tileInfo.flip_y === 'boolean')
        ? tileInfo.flip_y
        : (isSameFileAndHdu && typeof prevFits.flip_y === 'boolean' ? prevFits.flip_y : null);
    window.fitsData = {
        width: tileInfo.width,
        height: tileInfo.height,
        min_value: tileInfo.min_value,
        max_value: tileInfo.max_value,
        overview: tileInfo.overview, // This might be an object or a base64 string
        wcs: preservedWcs,
        filename: filepath,
        hduIndex: currentHduIdx,
        ...(preservedFlipY != null ? { flip_y: preservedFlipY } : {})
    };

    // If we changed file/HDU and the fast path didn't supply WCS, ensure we don't keep a stale parsedWCS.
    try {
        if (!isSameFileAndHdu && window.parsedWCS) {
            delete window.parsedWCS;
        }
    } catch (_) {}

    // If this is a cube, ensure the bottom-center channel slider is present (2D mode).
    // Some load paths bypass selectHdu(), so we also hook here.
    try {
        const hduIdx = (typeof window.currentHduIndex === 'number') ? window.currentHduIndex : 0;
        setupCubeSliceSlider(filepath, hduIdx).catch(() => {});
    } catch (_) {}

    // Hide any previous notifications
    showNotification(false);

    console.log("Handling fast loading mode response:", data);

    // Check if we're in multi-panel mode - if so, don't clear catalogs as they should persist across panels
    let isMultiPanelMode = false;
    try {
        // Check from top window if we're in an iframe, otherwise check current window
        const topWin = (window.top && window.top !== window) ? window.top : window;
        const wrap = topWin.document.getElementById('multi-panel-container');
        const grid = topWin.document.getElementById('multi-panel-grid');
        isMultiPanelMode = wrap && wrap.style.display !== 'none' && grid && grid.querySelectorAll('iframe').length >= 2;
    } catch (_) {}

    // Also check for preserveCatalogs flag (set when transitioning to multi-panel)
    // Treat iframe panes as "multi-panel context" even before the parent can seed window flags.
    // This prevents the left pane from clearing catalogs during single→multi transitions.
    let isPaneContext = false;
    try {
        const sp = new URLSearchParams(window.location.search || '');
        isPaneContext = sp.has('pane_sid') || sp.get('mp') === '1';
    } catch (_) {}
    const shouldPreserveCatalogs = isMultiPanelMode || isPaneContext || !!window.__preserveCatalogs;
    
    if (typeof clearAllCatalogs === 'function') {
        if (shouldPreserveCatalogs) {
            console.log("Multi-panel mode detected - preserving catalogs across panels.");
        } else {
            console.log("New FITS file opened (fast loader), clearing all existing catalogs.");
            clearAllCatalogs();
        }
    }
    if (typeof clearSegmentOverlay === 'function') {
        // Only clear segments if not in multi-panel mode (segments should also persist)
        if (!shouldPreserveCatalogs) {
            clearSegmentOverlay('new-image');
        }
    }

    // Initialize the tiled viewer with the received tile info
    initializeTiledViewer(tileInfo, filepath)
        .then(() => {
            console.log("Tiled viewer initialized successfully after fast loading.");

            // Update UI elements now that the viewer is ready
            updateDynamicRangeButtonVisibility(true);

            // Fetch the full histogram from the server
            fetchServerHistogram();
            
            // Start loading overview images progressively
            loadProgressiveOverviews();
        })
        .catch(error => {
            console.error("Error initializing tiled viewer:", error);
            showNotification(`Error: ${error.message}`, 5000, 'error');
        });
}
// Load progressively better quality overviews
function loadProgressiveOverviews() {
    // Start with quality level 0
    loadOverviewAtQuality(0);
}





// Add this function to hide/show dynamic range controls based on image availability
function updateDynamicRangeButtonVisibility(show) {
    // const dynamicRangeButton = document.querySelector('.dynamic-range-button');
    // if (dynamicRangeButton) {
    //     dynamicRangeButton.style.display = show ? 'block' : 'none';
    // }
}

// Call this initially to hide the button when the app first loads
document.addEventListener("DOMContentLoaded", function() {
    // Initially hide the dynamic range button
    updateDynamicRangeButtonVisibility(false);
});


// Add this function to your code
function dumpWCSInfo() {
    if (!window.fitsData || !window.fitsData.wcs) {
      console.log("No WCS data available");
                return;
            }

    console.log("Raw WCS data:", window.fitsData.wcs);
    
    // If you've parsed the WCS
    if (window.parsedWCS) {
      console.log("Parsed WCS data:", window.parsedWCS);
      
      // Show transformation matrix
      if (window.parsedWCS.transformInfo) {
        console.log("Transform matrix:", {
          m11: window.parsedWCS.transformInfo.m11,
          m12: window.parsedWCS.transformInfo.m12,
          m21: window.parsedWCS.transformInfo.m21, 
          m22: window.parsedWCS.transformInfo.m22,
          rotation: window.parsedWCS.transformInfo.thetaDegrees + "°",
          flipped: window.parsedWCS.transformInfo.isFlipped
        });
      }
    }
  }


  


function formatRangeValue(v) {
    if (v == null || !isFinite(v)) return '';
    const abs = Math.abs(v);
    if (abs === 0) return '0';
    if (abs < 1e-3 || abs >= 1e4) return v.toExponential(3); // e.g. 1.23e-15
    return v.toPrecision(6); // keeps small values without turning into 0.00
}

function setRangeInputs(minVal, maxVal) {
    const doc = getHistogramDocument();
    const minInput = doc.getElementById('min-range-input');
    const maxInput = doc.getElementById('max-range-input');
    if (minInput) minInput.value = formatRangeValue(minVal);
    if (maxInput) maxInput.value = formatRangeValue(maxVal);
}

function getHduPopupDocument() {
    try {
        if (window.top && window.top !== window && window.top.document) {
            return window.top.document;
        }
    } catch(_) {}
    return document;
}

function removeExistingHduPopup(doc) {
    const targetDoc = doc || getHduPopupDocument();
    const existing = targetDoc.getElementById('hdu-selector-popup');
    if (existing && existing.parentNode) {
        existing.parentNode.removeChild(existing);
    }
}


  // Function to create HDU selection popup
function createHduSelectorPopup(hduList, filepath) {
    const popupDoc = (typeof getHduPopupDocument === 'function') ? getHduPopupDocument() : document;
    const createEl = (tag) => popupDoc.createElement(tag);
    const removePopup = () => {
        if (typeof removeExistingHduPopup === 'function') removeExistingHduPopup(popupDoc);
        else {
            const existing = popupDoc.getElementById('hdu-selector-popup');
            if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
        }
    };
    removePopup();
    // Create container for the popup
    const popup = createEl('div');
    popup.id = 'hdu-selector-popup';
    popup.style.position = 'fixed';
    popup.style.top = '50%';
    popup.style.left = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
    popup.style.backgroundColor = '#333';
    popup.style.border = '1px solid #555';
    popup.style.borderRadius = '5px';
    popup.style.padding = '15px';
    popup.style.zIndex = '65000';
    popup.style.width = '500px';
    popup.style.maxHeight = '80vh';
    popup.style.overflowY = 'auto';
    popup.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)';
    
    // Create title
    const title = createEl('h3');
    title.textContent = 'Select HDU to Display';
    title.style.margin = '0 0 15px 0';
    title.style.color = '#fff';
    title.style.fontFamily = 'Arial, sans-serif';
    title.style.fontSize = '18px';
    title.style.fontWeight = 'bold';
    title.style.borderBottom = '1px solid #555';
    title.style.paddingBottom = '10px';
    
    // Create description
    const description = createEl('p');
    description.textContent = 'This FITS file contains multiple data units (HDUs). Please select which one to open:';
    description.style.color = '#ddd';
    description.style.marginBottom = '15px';
    description.style.fontFamily = 'Arial, sans-serif';
    
    // Create selection container
    const selectionContainer = createEl('div');
    selectionContainer.style.display = 'flex';
    selectionContainer.style.flexDirection = 'column';
    selectionContainer.style.gap = '10px';
    selectionContainer.style.marginBottom = '15px';
    
    // Add each HDU as an option
    hduList.forEach((hdu, index) => {
        const option = createEl('div');
        option.className = 'hdu-option';
        option.style.padding = '10px';
        option.style.backgroundColor = '#444';
        option.style.borderRadius = '4px';
        option.style.cursor = 'pointer';
        option.style.transition = 'background-color 0.2s';
        
        // Hover effect
        option.addEventListener('mouseover', function() {
            this.style.backgroundColor = '#555';
        });
        option.addEventListener('mouseout', function() {
            this.style.backgroundColor = '#444';
        });
        
        // Create header for the option
        const header = createEl('div');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.marginBottom = '5px';
        
        // Title for the option
        const optionTitle = createEl('div');
        optionTitle.style.fontWeight = 'bold';
        optionTitle.style.color = '#fff';
        optionTitle.textContent = `HDU ${index}: ${hdu.type}`;
        if (hdu.name && hdu.name !== '') {
            optionTitle.textContent += ` (${hdu.name})`;
        }
        
        // Add recommended badge if this is likely the best HDU
        if (hdu.isRecommended) {
            const badge = createEl('span');
            badge.textContent = 'Recommended';
            badge.style.backgroundColor = '#4CAF50';
            badge.style.color = 'white';
            badge.style.padding = '2px 6px';
            badge.style.borderRadius = '3px';
            badge.style.fontSize = '12px';
            badge.style.marginLeft = '10px';
            optionTitle.appendChild(badge);
        }
        
        header.appendChild(optionTitle);
        
        // Details container
        const details = createEl('div');
        details.style.fontSize = '13px';
        details.style.color = '#ccc';
        details.style.marginTop = '5px';
        
        // Display appropriate details based on HDU type
        if (hdu.type === 'Image' && hdu.dimensions) {
            details.innerHTML = `
                <div>Dimensions: ${hdu.dimensions.join(' x ')}</div>
                ${hdu.bitpix ? `<div>Data type: ${getBitpixDescription(hdu.bitpix)}</div>` : ''}
                ${hdu.hasWCS ? '<div>WCS: Available</div>' : ''}
            `;
        } else if (hdu.type === 'Table' && hdu.rows !== undefined) {
            details.innerHTML = `
                <div>Rows: ${hdu.rows}</div>
                ${hdu.columns ? `<div>Columns: ${hdu.columns}</div>` : ''}
            `;
        } else {
            details.innerHTML = '<div>No additional information available</div>';
        }
        
        // Append header and details to option
        option.appendChild(header);
        option.appendChild(details);
        
        // Add click handler to select this HDU
        option.addEventListener('click', function() {
            selectHdu(index, filepath);
            removePopup();
        });
        
        selectionContainer.appendChild(option);
    });
    
    // Create button container
    const buttonContainer = createEl('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'space-between';
    
    // Cancel button
    const cancelButton = createEl('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.style.flex = '1';
    cancelButton.style.marginRight = '10px';
    cancelButton.style.padding = '8px 0';
    cancelButton.style.backgroundColor = '#f44336';
    cancelButton.style.color = '#fff';
    cancelButton.style.border = 'none';
    cancelButton.style.borderRadius = '3px';
    cancelButton.style.cursor = 'pointer';
    cancelButton.style.fontFamily = 'Arial, sans-serif';
    cancelButton.style.fontSize = '14px';
    
    cancelButton.addEventListener('mouseover', () => {
        cancelButton.style.backgroundColor = '#d32f2f';
    });
    cancelButton.addEventListener('mouseout', () => {
        cancelButton.style.backgroundColor = '#f44336';
    });
    cancelButton.addEventListener('click', () => {
        removePopup();
    });
    
    // Auto-select primary HDU button
    const autoSelectButton = createEl('button');
    autoSelectButton.textContent = 'Use Recommended HDU';
    autoSelectButton.style.flex = '1';
    autoSelectButton.style.padding = '8px 0';
    autoSelectButton.style.backgroundColor = '#4CAF50';
    autoSelectButton.style.color = '#fff';
    autoSelectButton.style.border = 'none';
    autoSelectButton.style.borderRadius = '3px';
    autoSelectButton.style.cursor = 'pointer';
    autoSelectButton.style.fontFamily = 'Arial, sans-serif';
    autoSelectButton.style.fontSize = '14px';
    
    autoSelectButton.addEventListener('mouseover', () => {
        autoSelectButton.style.backgroundColor = '#45a049';
    });
    autoSelectButton.addEventListener('mouseout', () => {
        autoSelectButton.style.backgroundColor = '#4CAF50';
    });
    autoSelectButton.addEventListener('click', () => {
        // Find the recommended HDU index
        const recommendedIndex = hduList.findIndex(hdu => hdu.isRecommended);
        if (recommendedIndex >= 0) {
            selectHdu(recommendedIndex, filepath);
        } else {
            // If no recommended HDU, use the first one
            selectHdu(0, filepath);
        }
        removePopup();
    });
    
    // Add buttons to container
    buttonContainer.appendChild(cancelButton);
    buttonContainer.appendChild(autoSelectButton);
    
    // Add all elements to popup
    popup.appendChild(title);
    popup.appendChild(description);
    popup.appendChild(selectionContainer);
    popup.appendChild(buttonContainer);
    
    // Add popup to document
    document.body.appendChild(popup);
    
    // Make popup draggable
    makeDraggable(popup, title);
}

// Helper function to convert BITPIX to a human-readable description
function getBitpixDescription(bitpix) {
    switch(bitpix) {
        case 8: return '8-bit unsigned integer';
        case 16: return '16-bit signed integer';
        case 32: return '32-bit signed integer';
        case -32: return '32-bit floating point';
        case -64: return '64-bit floating point';
        default: return `Unknown (${bitpix})`;
    }
}

// Function to select a specific HDU
// In static/main.js

async function selectHdu(hduIndex, filepath) {
    console.log(`Selected HDU ${hduIndex} from ${filepath}`);
    showNotification(`Loading HDU ${hduIndex}...`, 2000, "info");

    // Track the currently selected HDU globally for other modules (e.g., coords overlay)
    window.currentHduIndex = hduIndex;

    // Selecting an HDU changes the displayed image; clear existing regions + zoom insets
    // so old overlays don't stick to the new image/HDU.
    try { if (typeof window.clearAllRegions === 'function') window.clearAllRegions(); } catch (_) {}
    try { if (typeof window.removeAllZoomInsets === 'function') window.removeAllZoomInsets(); } catch (_) {}
    // If file changed, reset cube slice UI/state (prevents stale channel count)
    try {
        const prevFile = window.currentFitsFile;
        if (prevFile && prevFile !== filepath) {
            try { removeCubeSliceSlider(); } catch (_) {}
            try { window.currentCubeSliceIndex = 0; } catch (_) {}
            try { window.currentLoadedFitsFileId = null; } catch (_) {}
        }
    } catch (_) {}
    window.currentFitsFile = filepath;
    if (typeof window.refreshWcsForOverlay === 'function') {
        // Ensure overlay fetches header for the exact HDU we're opening
        window.refreshWcsForOverlay({ filepath, hduIndex });
    }

    const popupDoc = (typeof getHduPopupDocument === 'function') ? getHduPopupDocument() : document;
    const hduPopup = popupDoc.getElementById('hdu-selector-popup');
    if (hduPopup && hduPopup.parentNode) {
        hduPopup.parentNode.removeChild(hduPopup);
    }
    
    // The key change is here: We call /load-file which now returns the tileInfo.
    // This single call prepares the backend session and gives the frontend everything it needs.
    try {
        const safePath = encodeURI(String(filepath || '').replace(/^\/+/, ''));
        const response = await apiFetch(`/load-file/${safePath}?hdu=${encodeURIComponent(hduIndex)}`);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
        }
        
        const tileInfo = await response.json();
        
        // Pass the tileInfo to the handler that initializes the viewer
        await handleFastLoadingResponse(tileInfo, filepath);

        // If this HDU is a cube, show a bottom-center slice slider (2D mode)
        try { setupCubeSliceSlider(filepath, hduIndex); } catch (_) {}
        
    } catch (error) {
        console.error('Error loading FITS file for selected HDU:', error);
        showNotification(`Error loading HDU ${hduIndex}: ${error.message}`, "error");
    }
}

// ---------- Cube slice slider (2D mode) ----------
let __cubeSliceSliderEl = null;
let __cubeSliceSliderDebounce = null;
let __cubeAxis3Cache = {};
let __cubeSliceStyleInjected = false;
let __cubeFillPct = null;
let __cubeHoverTip = null;
let __cubeHoverTipActive = false;
let __cubeHoverTipCurrentObjectUrl = null;
let __cubeSliceLoading = false;
let __cubePreviewAbort = null;
let __cubePreviewReqSeq = 0;
let __cubePreviewLastIdx = null;
let __cubePreviewTimer = null;
let __cubeSliderContextKey = null;
let __cubePreviewContextKey = null;
let __cubeSetupReqSeq = 0;

function removeCubeSliceSlider() {
    // Reset preview state so switching cubes can't show stale preview thumbnails
    try { if (__cubePreviewTimer) clearTimeout(__cubePreviewTimer); } catch (_) {}
    __cubePreviewTimer = null;
    __cubePreviewLastIdx = null;
    try { if (__cubePreviewAbort) __cubePreviewAbort.abort(); } catch (_) {}
    __cubePreviewAbort = null;
    __cubePreviewReqSeq++;
    __cubeHoverTipActive = false;
    try {
        if (__cubeHoverTip) __cubeHoverTip.classList.remove('show');
        const img = __cubeHoverTip && __cubeHoverTip.querySelector ? __cubeHoverTip.querySelector('#cube-tip-img') : null;
        const loading = __cubeHoverTip && __cubeHoverTip.querySelector ? __cubeHoverTip.querySelector('#cube-tip-loading') : null;
        if (loading) loading.style.display = 'none';
        if (img) { img.style.display = 'none'; img.style.backgroundImage = ''; }
    } catch (_) {}
    try {
        if (__cubeHoverTipCurrentObjectUrl) {
            URL.revokeObjectURL(__cubeHoverTipCurrentObjectUrl);
            __cubeHoverTipCurrentObjectUrl = null;
        }
    } catch (_) {}
    __cubeSliderContextKey = null;

    // In multi-panel mode the slider may live in the TOP document. If this window doesn't
    // currently "own" the reference, still remove the shared element by id.
    try {
        if (__cubeSliceSliderEl && __cubeSliceSliderEl.parentNode) {
            __cubeSliceSliderEl.parentNode.removeChild(__cubeSliceSliderEl);
        } else {
            const topDoc = (window.top && window.top.document) ? window.top.document : null;
            const el = topDoc ? topDoc.getElementById('cube-slice-slider') : null;
            if (el && el.parentNode) el.parentNode.removeChild(el);
        }
    } catch (_) {}
    __cubeSliceSliderEl = null;
}

function reopenTiledViewerForCubeSlice() {
    try {
        const isTiledViewActive = window.tiledViewer && window.tiledViewer.isOpen && window.tiledViewer.isOpen();
        if (!isTiledViewActive || !currentTileInfo) return;

        const currentZoom = window.tiledViewer.viewport.getZoom();
        const currentPan = window.tiledViewer.viewport.getCenter();
        currentDynamicRangeVersion = Date.now(); // reuse the cache-busting mechanism

        const newTileSourceOptions = {
            width: currentTileInfo.width,
            height: currentTileInfo.height,
            tileSize: currentTileInfo.tileSize,
            maxLevel: currentTileInfo.maxLevel,
            getTileUrl: function(level, x, y) {
                const sid = (function(){
                    try {
                        return (window.__forcedSid) ||
                               (new URLSearchParams(window.location.search).get('sid')) ||
                               (new URLSearchParams(window.location.search).get('pane_sid')) ||
                               sessionStorage.getItem('sid');
                    } catch(_) { return sessionStorage.getItem('sid'); }
                })();
                const sidParam = sid ? `sid=${encodeURIComponent(sid)}&` : '';
                return `/fits-tile/${level}/${x}/${y}?${sidParam}v=${currentDynamicRangeVersion}`;
            },
            getLevelScale: function(level) {
                return 1 / (1 << (this.maxLevel - level));
            }
        };

        window.tiledViewer.open(newTileSourceOptions);
        window.tiledViewer.addOnceHandler('open', function() {
            try {
                window.tiledViewer.viewport.zoomTo(currentZoom, null, true);
                window.tiledViewer.viewport.panTo(currentPan, true);
                if (window.tiledViewer.drawer) window.tiledViewer.drawer.setImageSmoothingEnabled(false);
            } catch (_) {}
        });
    } catch (err) {
        console.warn('[cube-slice] Failed to reopen tiled viewer', err);
    }
}

async function setupCubeSliceSlider(filepath, hduIndex) {
    // Guard against async race when switching files quickly:
    // only the latest call is allowed to update/create the slider.
    const setupSeq = ++__cubeSetupReqSeq;
    const expectedFile = filepath;

    // Determine if the selected HDU is a cube by reading HDU info (dimensions length >= 3)
    let hduList = null;
    try {
        const r = await getFitsHduInfo(filepath);
        hduList = r;
    } catch (_) {
        hduList = null;
    }
    // If user switched files while we were awaiting, stop here.
    try {
        if (setupSeq !== __cubeSetupReqSeq) return;
        if (window.currentFitsFile && window.currentFitsFile !== expectedFile) return;
    } catch (_) {}

    const entry = Array.isArray(hduList) ? hduList.find(h => Number(h.index) === Number(hduIndex)) : null;
    const dims = entry && entry.dimensions ? entry.dimensions : null;
    const isCube = Array.isArray(dims) && dims.length >= 3;

    if (!isCube) {
        // Only remove if we're still on the same file; otherwise don't touch newer UI.
        try {
            if (setupSeq === __cubeSetupReqSeq && (!window.currentFitsFile || window.currentFitsFile === expectedFile)) {
                removeCubeSliceSlider();
            }
        } catch (_) {}
        return;
    }

    // In multi-panel mode, make the shared slider follow the ACTIVE pane.
    // toolbar.js emits `pane:activated` in the top window; we re-run setup in the active pane
    // so the slider range/value/handlers always target the selected cube panel.
    try {
        const isTop = (window.self === window.top);
        if (isTop && !window.__cubeSliderPaneActivatedListenerInstalled) {
            window.__cubeSliderPaneActivatedListenerInstalled = true;
            window.addEventListener('pane:activated', () => {
                try {
                    const paneWin = (typeof window.getActivePaneWindow === 'function') ? (window.getActivePaneWindow() || null) : null;
                    if (!paneWin) return;
                    const fp = paneWin.currentFitsFile || null;
                    const hdu = (typeof paneWin.currentHduIndex === 'number') ? paneWin.currentHduIndex : null;
                    if (!fp || hdu == null) {
                        // If the active pane doesn't have a cube context, hide the shared slider.
                        try { removeCubeSliceSlider(); } catch (_) {}
                        return;
                    }
                    if (typeof paneWin.setupCubeSliceSlider === 'function') {
                        paneWin.setupCubeSliceSlider(fp, hdu).catch(() => {});
                    }
                } catch (_) {}
            });
        }
    } catch (_) {}

    // If user opened a different cube/HDU, clear any in-flight preview fetch so we never show the old cube preview.
    try {
        const nextKey = `${filepath}::${hduIndex}`;
        if (__cubeSliderContextKey && __cubeSliderContextKey !== nextKey) {
            try { if (__cubePreviewTimer) clearTimeout(__cubePreviewTimer); } catch (_) {}
            __cubePreviewTimer = null;
            __cubePreviewLastIdx = null;
            try { if (__cubePreviewAbort) __cubePreviewAbort.abort(); } catch (_) {}
            __cubePreviewAbort = null;
            __cubePreviewReqSeq++;
            try {
                const img = __cubeHoverTip && __cubeHoverTip.querySelector ? __cubeHoverTip.querySelector('#cube-tip-img') : null;
                const loading = __cubeHoverTip && __cubeHoverTip.querySelector ? __cubeHoverTip.querySelector('#cube-tip-loading') : null;
                if (loading) loading.style.display = 'none';
                if (img) { img.style.display = 'none'; img.style.backgroundImage = ''; }
            } catch (_) {}
            try {
                if (__cubeHoverTipCurrentObjectUrl) {
                    URL.revokeObjectURL(__cubeHoverTipCurrentObjectUrl);
                    __cubeHoverTipCurrentObjectUrl = null;
                }
            } catch (_) {}
        }
        __cubeSliderContextKey = nextKey;
        __cubePreviewContextKey = nextKey;
    } catch (_) {}

    const sliceCount = Math.max(1, Number(dims[0]) || 1); // astropy shape is typically (z,y,x)
    // In multi-panel mode, center the cube slider in the TOP window (not inside a left/right pane).
    // This keeps the control visually centered on the overall app, regardless of which pane is active.
    const doc = (() => {
        try {
            const topWin = window.top;
            const sp = new URLSearchParams(window.location.search || '');
            const inPane = (window.self !== window.top) || sp.has('pane_sid') || sp.get('mp') === '1';
            if (!inPane) return document;
            const wrap = topWin && topWin.document ? topWin.document.getElementById('multi-panel-container') : null;
            if (wrap && wrap.style.display !== 'none') {
                return topWin.document;
            }
        } catch (_) {}
        return document;
    })();

    // If another pane already created the shared slider in the TOP doc, reuse it instead of
    // creating a duplicate element (important when multiple cubes are loaded side-by-side).
    try {
        if (!__cubeSliceSliderEl) {
            const existing = doc.getElementById('cube-slice-slider');
            if (existing) __cubeSliceSliderEl = existing;
        }
        if (!__cubeSliceStyleInjected) {
            const existingStyle = doc.getElementById('cube-slice-slider-style');
            if (existingStyle) __cubeSliceStyleInjected = true;
        }
    } catch (_) {}

    // If there's only a single slice, don't show the cube slider at all.
    if (sliceCount <= 1) {
        try {
            if (setupSeq === __cubeSetupReqSeq && (!window.currentFitsFile || window.currentFitsFile === expectedFile)) {
                removeCubeSliceSlider();
            }
        } catch (_) {}
        return;
    }

    if (!__cubeSliceSliderEl) {
        // Re-check before creating DOM
        try {
            if (setupSeq !== __cubeSetupReqSeq) return;
            if (window.currentFitsFile && window.currentFitsFile !== expectedFile) return;
        } catch (_) {}
        const wrap = doc.createElement('div');
        wrap.id = 'cube-slice-slider';
        wrap.className = 'cube-slice-slider';
        Object.assign(wrap.style, {
            position: 'fixed',
            left: '50%',
            transform: 'translateX(-50%)',
            bottom: '18px',
            zIndex: '60000',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 12px',
            borderRadius: '12px',
            background: 'rgba(17,24,39,0.85)',
            border: '1px solid rgba(255,255,255,0.14)',
            color: '#fff',
            fontFamily: 'Raleway, sans-serif',
            backdropFilter: 'blur(8px)'
        });
        // Inject slider styling once (nice animations, track fill, label transitions)
        try {
            if (!__cubeSliceStyleInjected) {
                __cubeSliceStyleInjected = true;
                const st = doc.createElement('style');
                st.id = 'cube-slice-slider-style';
                st.textContent = `
                #cube-slice-slider {
                  transition: transform 180ms ease, box-shadow 220ms ease, background 220ms ease;
                  box-shadow: 0 10px 28px rgba(0,0,0,0.35);
                }
                #cube-slice-slider.cube-slice-enter {
                  transform: translateX(-50%) translateY(14px);
                  opacity: 0;
                }
                #cube-slice-slider.cube-slice-enter.cube-slice-enter-active {
                  transform: translateX(-50%) translateY(0px);
                  opacity: 1;
                  transition: transform 380ms cubic-bezier(0.2, 0.9, 0.2, 1), opacity 280ms ease;
                }
                #cube-slice-slider.cube-slice-bump {
                  transform: translateX(-50%) scale(1.01);
                  box-shadow: 0 14px 36px rgba(0,0,0,0.45);
                }
                #cube-slice-slider.cube-slice-commit {
                  box-shadow: 0 18px 42px rgba(0,0,0,0.52);
                }
                #cube-slice-slider.cube-slice-commit::before{
                  content: "";
                  position: absolute;
                  inset: -2px;
                  border-radius: 14px;
                  border: 1px solid rgba(34,197,94,0.35);
                  opacity: 0;
                  animation: cubePulse 420ms ease-out;
                  pointer-events: none;
                }
                @keyframes cubePulse {
                  0% { opacity: 0; transform: scale(0.995); }
                  35% { opacity: 0.9; transform: scale(1.0); }
                  100% { opacity: 0; transform: scale(1.01); }
                }
                #cube-slice-slider #cube-slice-label {
                  transition: opacity 140ms ease, transform 140ms ease;
                  opacity: 0.92;
                }
                #cube-slice-slider.cube-slice-bump #cube-slice-label {
                  opacity: 1;
                  transform: translateY(-1px);
                }
                #cube-slice-slider input[type="range"]{
                  -webkit-appearance: none;
                  appearance: none;
                  height: 10px;
                  border-radius: 999px;
                  outline: none;
                  background: linear-gradient(90deg, rgba(34,197,94,0.95) 0%, rgba(34,197,94,0.95) var(--pct, 0%), rgba(255,255,255,0.16) var(--pct, 0%), rgba(255,255,255,0.16) 100%);
                  transition: background 140ms ease;
                }
                #cube-slice-slider input[type="range"]::-webkit-slider-thumb{
                  -webkit-appearance: none;
                  appearance: none;
                  width: 18px;
                  height: 18px;
                  border-radius: 50%;
                  background: rgba(255,255,255,0.95);
                  border: 2px solid rgba(34,197,94,0.9);
                  box-shadow: 0 6px 16px rgba(0,0,0,0.35);
                  transition: transform 120ms ease, box-shadow 120ms ease;
                }
                #cube-slice-slider input[type="range"]::-webkit-slider-thumb:hover{
                  transform: scale(1.08);
                  box-shadow: 0 8px 20px rgba(0,0,0,0.45);
                }
                #cube-slice-slider input[type="range"]::-webkit-slider-thumb:active{
                  transform: scale(1.14);
                }
                #cube-slice-slider input[type="range"]::-moz-range-thumb{
                  width: 18px;
                  height: 18px;
                  border-radius: 50%;
                  background: rgba(255,255,255,0.95);
                  border: 2px solid rgba(34,197,94,0.9);
                  box-shadow: 0 6px 16px rgba(0,0,0,0.35);
                  transition: transform 120ms ease, box-shadow 120ms ease;
                }
                #cube-slice-slider input[type="range"]::-moz-range-track{
                  height: 10px;
                  border-radius: 999px;
                  background: rgba(255,255,255,0.16);
                }
                #cube-slice-hover-tip{
                  position: fixed;
                  z-index: 65010;
                  padding: 6px 8px;
                  border-radius: 10px;
                  background: rgba(17,24,39,0.92);
                  border: 1px solid rgba(255,255,255,0.14);
                  color: #fff;
                  font-family: Raleway, sans-serif;
                  font-size: 12px;
                  pointer-events: none;
                  opacity: 0;
                  transform: translate(-50%, -100%) scale(0.98);
                  transition: opacity 120ms ease, transform 120ms ease;
                  white-space: nowrap;
                  box-shadow: 0 12px 28px rgba(0,0,0,0.45);
                }
                #cube-slice-hover-tip.show{
                  opacity: 1;
                  transform: translate(-50%, -110%) scale(1);
                }
                #cube-slice-hover-tip .cube-tip-row{
                  display: flex;
                  gap: 8px;
                  align-items: center;
                }
                #cube-slice-hover-tip .cube-tip-thumb{
                  width: 64px;
                  height: 64px;
                  border-radius: 10px;
                  background: rgba(0,0,0,0.35);
                  border: 1px solid rgba(255,255,255,0.12);
                  overflow: hidden;
                  flex: 0 0 auto;
                  position: relative;
                }
                #cube-slice-hover-tip .cube-tip-thumb .thumb-img{
                  position: absolute;
                  inset: 0;
                  background-position: center;
                  background-size: cover;
                  background-repeat: no-repeat;
                  display: none;
                }
                #cube-slice-hover-tip .cube-tip-thumb .thumb-loading{
                  position: absolute;
                  inset: 0;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  color: rgba(209,213,219,0.95);
                  background: rgba(0,0,0,0.18);
                }
                #cube-slice-hover-tip .cube-tip-thumb .thumb-loading .spinner{
                  width: 20px;
                  height: 20px;
                  border-radius: 50%;
                  border: 2px solid rgba(255,255,255,0.22);
                  border-top-color: rgba(34,197,94,0.95);
                  animation: cubeSpin 700ms linear infinite;
                }
                #cube-slice-hover-tip .cube-tip-thumb .thumb-loading .fallback{
                  font-size: 11px;
                  color: rgba(209,213,219,0.95);
                }
                @keyframes cubeSpin {
                  0% { transform: rotate(0deg); }
                  100% { transform: rotate(360deg); }
                }
                #cube-slice-hover-tip .cube-tip-text{
                  display: flex;
                  flex-direction: column;
                  gap: 2px;
                }
                #cube-slice-hover-tip .cube-tip-text .line1{
                  font-weight: 700;
                  letter-spacing: 0.2px;
                }
                #cube-slice-hover-tip .cube-tip-text .line2{
                  color: rgba(209,213,219,0.92);
                  font-size: 11px;
                }
                `;
                (doc.head || doc.documentElement).appendChild(st);
            }
        } catch (_) {}
        wrap.innerHTML = `
          <div style="font-weight:700;font-size:12px;">Channel</div>
          <button id="cube-slice-prev" title="Previous" style="width:30px;height:28px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.06);color:#fff;cursor:pointer;">‹</button>
          <input id="cube-slice-range" type="range" min="0" value="0" step="1" style="width: min(520px, 55vw);">
          <button id="cube-slice-next" title="Next" style="width:30px;height:28px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.06);color:#fff;cursor:pointer;">›</button>
          <label style="display:flex;gap:6px;align-items:center;font-size:12px;color:#d1d5db;">
            Step
            <input id="cube-slice-stepch" type="number" min="1" value="1" style="width:64px;background:#111827;color:#fff;border:1px solid rgba(255,255,255,0.14);border-radius:6px;padding:4px 6px;">
          </label>
          <label id="cube-slice-stepunit-wrap" style="display:none;gap:6px;align-items:center;font-size:12px;color:#d1d5db;">
            Step(<span id="cube-slice-unit"></span>)
            <input id="cube-slice-stepunit" type="number" step="any" style="width:92px;background:#111827;color:#fff;border:1px solid rgba(255,255,255,0.14);border-radius:6px;padding:4px 6px;">
          </label>
          <div id="cube-slice-label" style="font-size:12px; color:#d1d5db; min-width:80px; text-align:right;"></div>
        `;
        doc.body.appendChild(wrap);
        __cubeSliceSliderEl = wrap;
        // Slide-in animation
        try {
            __cubeSliceSliderEl.classList.add('cube-slice-enter');
            requestAnimationFrame(() => {
                try { __cubeSliceSliderEl.classList.add('cube-slice-enter-active'); } catch(_) {}
            });
            setTimeout(() => {
                try { __cubeSliceSliderEl.classList.remove('cube-slice-enter'); __cubeSliceSliderEl.classList.remove('cube-slice-enter-active'); } catch(_) {}
            }, 520);
        } catch (_) {}
    }

    const range = __cubeSliceSliderEl.querySelector('#cube-slice-range');
    const label = __cubeSliceSliderEl.querySelector('#cube-slice-label');
    const btnPrev = __cubeSliceSliderEl.querySelector('#cube-slice-prev');
    const btnNext = __cubeSliceSliderEl.querySelector('#cube-slice-next');
    const stepCh = __cubeSliceSliderEl.querySelector('#cube-slice-stepch');
    const stepUnitWrap = __cubeSliceSliderEl.querySelector('#cube-slice-stepunit-wrap');
    const stepUnit = __cubeSliceSliderEl.querySelector('#cube-slice-stepunit');
    const unitSpan = __cubeSliceSliderEl.querySelector('#cube-slice-unit');

    // Load axis-3 metadata from header once (for physical units)
    const cacheKey = `${filepath}::${hduIndex}`;
    if (!__cubeAxis3Cache.hasOwnProperty(cacheKey)) {
        __cubeAxis3Cache[cacheKey] = null;
        try {
            const resp = await apiFetch(`/fits-header/${encodeURIComponent(filepath)}?hdu_index=${encodeURIComponent(hduIndex)}`);
            if (resp && resp.ok) {
                const j = await resp.json();
                const hdr = {};
                (j.header || []).forEach(it => { if (it && it.key) hdr[it.key] = it.value; });
                const parseNum = (v) => {
                    if (v == null) return null;
                    const s = String(v).replace(/^['"]|['"]$/g, '');
                    const n = Number(s);
                    return Number.isFinite(n) ? n : null;
                };
                __cubeAxis3Cache[cacheKey] = {
                    ctype3: (hdr['CTYPE3'] ? String(hdr['CTYPE3']).replace(/^['"]|['"]$/g, '') : null),
                    cunit3: (hdr['CUNIT3'] ? String(hdr['CUNIT3']).replace(/^['"]|['"]$/g, '') : null),
                    crval3: parseNum(hdr['CRVAL3']),
                    cdelt3: parseNum(hdr['CDELT3']),
                    crpix3: parseNum(hdr['CRPIX3']),
                };
            }
        } catch (_) {}
    }
    const axis3 = __cubeAxis3Cache[cacheKey];
    const canUnits = axis3 && axis3.cdelt3 != null && axis3.crval3 != null && axis3.crpix3 != null;
    if (canUnits) {
        const u = axis3.cunit3 || '';
        if (unitSpan) unitSpan.textContent = u;
        if (stepUnitWrap) stepUnitWrap.style.display = 'flex';
    } else {
        if (stepUnitWrap) stepUnitWrap.style.display = 'none';
    }

    const formatAxis3 = (idx) => {
        if (!canUnits) return '';
        const i = Number(idx);
        const world = axis3.crval3 + ((i + 1) - axis3.crpix3) * axis3.cdelt3;
        const unit = axis3.cunit3 ? ` ${axis3.cunit3}` : '';
        const name = axis3.ctype3 ? `${axis3.ctype3}: ` : '';
        const v = (Math.abs(world) >= 1e4 || (Math.abs(world) > 0 && Math.abs(world) < 1e-3)) ? world.toExponential(3) : world.toPrecision(6);
        return `${name}${v}${unit}`;
    };

    // Hover tooltip that follows the slider thumb
    try {
        if (!__cubeHoverTip) {
            __cubeHoverTip = doc.createElement('div');
            __cubeHoverTip.id = 'cube-slice-hover-tip';
            __cubeHoverTip.innerHTML = `
              <div class="cube-tip-row">
                <div class="cube-tip-thumb">
                  <div id="cube-tip-img" class="thumb-img"></div>
                  <div id="cube-tip-loading" class="thumb-loading" style="display:none;"><div class="spinner"></div></div>
                </div>
                <div class="cube-tip-text">
                  <div id="cube-tip-line1" class="line1"></div>
                  <div id="cube-tip-line2" class="line2"></div>
                </div>
              </div>
            `;
            doc.body.appendChild(__cubeHoverTip);
        }
    } catch (_) {}

    const fetchPreviewBlobUrlNoCache = async (sliceIdx, ctxKey) => {
        if (sliceIdx == null) return null;
        try {
            // Don't even start if context already changed
            if (ctxKey && __cubeSliderContextKey && ctxKey !== __cubeSliderContextKey) return null;
            // Force no-cache behavior
            const v = Date.now();
            // Cancel previous preview fetch (latest hover wins)
            try { if (__cubePreviewAbort) __cubePreviewAbort.abort(); } catch (_) {}
            __cubePreviewAbort = new AbortController();
            const r = await apiFetch(
                `/cube/overview/?filepath=${encodeURIComponent(filepath)}&hdu=${encodeURIComponent(hduIndex)}&slice_index=${encodeURIComponent(sliceIdx)}&v=${v}`,
                { cache: 'no-store', signal: __cubePreviewAbort.signal }
            );
            if (!r || !r.ok) return null;
            const ct = (r.headers && r.headers.get) ? (r.headers.get('content-type') || '') : '';
            if (!ct.toLowerCase().includes('image/')) {
                // Server might have returned JSON/text (e.g. error); treat as no preview.
                return null;
            }
            const blob = await r.blob();
            const url = URL.createObjectURL(blob);
            // If context changed while fetching, drop + revoke immediately (prevents previous-cube preview)
            if (ctxKey && __cubeSliderContextKey && ctxKey !== __cubeSliderContextKey) {
                try { URL.revokeObjectURL(url); } catch (_) {}
                return null;
            }
            return url;
        } catch (_) {
            return null;
        }
    };

    const updateHoverTip = (clientX, fromValue) => {
        if (!__cubeHoverTip) return;
        try {
            const rect = range.getBoundingClientRect();
            const v = (typeof fromValue !== 'undefined' && fromValue !== null) ? Number(fromValue) : Number(range.value);
            const pct = (sliceCount <= 1) ? 0 : (v / (sliceCount - 1));
            // Thumb center x (more stable than raw mouse x)
            const x = rect.left + pct * rect.width;
            // Pin tooltip above the slider
            const y = rect.top - 6;
            const axisTxt = canUnits ? formatAxis3(v) : '';
            const l1 = __cubeHoverTip.querySelector('#cube-tip-line1');
            const l2 = __cubeHoverTip.querySelector('#cube-tip-line2');
            if (l1) l1.textContent = `ch ${v} / ${sliceCount - 1}`;
            if (l2) l2.textContent = axisTxt || '';
            __cubeHoverTip.style.left = `${Math.round(x)}px`;
            __cubeHoverTip.style.top = `${Math.round(y)}px`;
        } catch (_) {}
    };

    const showHoverTip = () => {
        if (!__cubeHoverTip) return;
        try { __cubeHoverTip.classList.add('show'); } catch (_) {}
        __cubeHoverTipActive = true;
        try { updateHoverTip(null, range.value); } catch (_) {}
        // Fetch thumbnail for the active slice generator id (NO caching); show loading state
        (async () => {
            try {
                const img = __cubeHoverTip.querySelector('#cube-tip-img');
                const loading = __cubeHoverTip.querySelector('#cube-tip-loading');
                if (loading) {
                    loading.style.display = 'flex';
                    loading.innerHTML = '<div class="spinner"></div>';
                }
                if (img) {
                    img.style.display = 'none';
                    img.style.backgroundImage = '';
                }
                const idx = Number(range.value) || 0;
                __cubePreviewLastIdx = idx;
                const reqId = ++__cubePreviewReqSeq;
                const ctxKey = __cubeSliderContextKey;
                const url = await fetchPreviewBlobUrlNoCache(idx, ctxKey);
                if (reqId !== __cubePreviewReqSeq) return; // stale
                if (ctxKey && __cubeSliderContextKey && ctxKey !== __cubeSliderContextKey) return; // context changed
                if (img && url) {
                    // Revoke previous URL only after the new one is decoded & applied (avoid blanks)
                    const prev = __cubeHoverTipCurrentObjectUrl;
                    __cubeHoverTipCurrentObjectUrl = url;
                    const tmp = new Image();
                    tmp.onload = () => {
                        try { prev && URL.revokeObjectURL(prev); } catch(_) {}
                        try { img.style.backgroundImage = `url("${url}")`; img.style.display = 'block'; } catch(_) {}
                    };
                    tmp.onerror = () => { try { prev && URL.revokeObjectURL(prev); } catch(_) {} };
                    tmp.src = url;
                } else {
                    // No preview available
                    if (loading) loading.innerHTML = '<div class="fallback">No preview</div>';
                }
                if (loading) {
                    // Hide loading if we have a preview, otherwise keep fallback text visible briefly
                    if (url) loading.style.display = 'none';
                }
            } catch (_) {}
        })();
    };
    const hideHoverTip = () => {
        if (!__cubeHoverTip) return;
        try { __cubeHoverTip.classList.remove('show'); } catch (_) {}
        __cubeHoverTipActive = false;
        // Release object URL on hide (no caching)
        try {
            if (__cubeHoverTipCurrentObjectUrl) {
                URL.revokeObjectURL(__cubeHoverTipCurrentObjectUrl);
                __cubeHoverTipCurrentObjectUrl = null;
            }
        } catch (_) {}
    };

    const previewSlice = async (sliceIdx) => {
        if (!__cubeHoverTip) return;
        try {
            const img = __cubeHoverTip.querySelector('#cube-tip-img');
            const loading = __cubeHoverTip.querySelector('#cube-tip-loading');
            if (loading) {
                loading.style.display = 'flex';
                loading.innerHTML = '<div class="spinner"></div>';
            }
            if (img) {
                img.style.display = 'none';
                img.style.backgroundImage = '';
            }
            __cubePreviewLastIdx = sliceIdx;
            const reqId = ++__cubePreviewReqSeq;
            const ctxKey = __cubeSliderContextKey;
            const url = await fetchPreviewBlobUrlNoCache(sliceIdx, ctxKey);
            if (reqId !== __cubePreviewReqSeq) return; // stale
            if (ctxKey && __cubeSliderContextKey && ctxKey !== __cubeSliderContextKey) return; // context changed
            if (img && url) {
                const prev = __cubeHoverTipCurrentObjectUrl;
                __cubeHoverTipCurrentObjectUrl = url;
                const tmp = new Image();
                tmp.onload = () => {
                    try { prev && URL.revokeObjectURL(prev); } catch(_) {}
                    try { img.style.backgroundImage = `url("${url}")`; img.style.display = 'block'; } catch(_) {}
                };
                tmp.onerror = () => { try { prev && URL.revokeObjectURL(prev); } catch(_) {} };
                tmp.src = url;
            } else {
                if (loading) loading.innerHTML = '<div class="fallback">No preview</div>';
            }
            if (loading) {
                if (url) loading.style.display = 'none';
            }
        } catch (_) {}
    };

    const schedulePreview = (sliceIdx, delayMs = 90) => {
        if (!__cubeHoverTipActive) return;
        try {
            if (__cubePreviewTimer) clearTimeout(__cubePreviewTimer);
            __cubePreviewTimer = setTimeout(() => {
                try {
                    if (__cubePreviewLastIdx === sliceIdx) return;
                    previewSlice(sliceIdx);
                } catch (_) {}
            }, delayMs);
        } catch (_) {}
    };
    range.max = String(sliceCount - 1);
    range.value = String(window.currentCubeSliceIndex || 0);
    label.textContent = `${range.value} / ${sliceCount - 1}${canUnits ? ' · ' + formatAxis3(range.value) : ''}`;
    // Update track fill
    try {
        const pct = (sliceCount <= 1) ? 0 : (Number(range.value) / (sliceCount - 1)) * 100;
        range.style.setProperty('--pct', `${pct.toFixed(2)}%`);
        __cubeFillPct = pct;
    } catch (_) {}

    const applySlice = async (val) => {
        try {
            const sliceIdx = Number(val) || 0;
            label.textContent = `${sliceIdx} / ${sliceCount - 1}${canUnits ? ' · ' + formatAxis3(sliceIdx) : ''}`;
            showNotification(true, `Loading channel ${sliceIdx}…`);
            __cubeSliceLoading = true;
            try {
                if (__cubeHoverTipActive && __cubeHoverTip) {
                    const loading = __cubeHoverTip.querySelector('#cube-tip-loading');
                    if (loading) loading.style.display = 'flex';
                }
            } catch (_) {}
            const resp = await apiFetch(`/cube/set-slice/?filepath=${encodeURIComponent(filepath)}&hdu=${encodeURIComponent(hduIndex)}&slice_index=${encodeURIComponent(sliceIdx)}`);
            if (!resp.ok) {
                const j = await resp.json().catch(() => ({}));
                throw new Error(j.detail || j.error || `HTTP ${resp.status}`);
            }
            const j = await resp.json();
            window.currentCubeSliceIndex = j.slice_index;
            try { window.currentLoadedFitsFileId = j.file_id || window.currentLoadedFitsFileId; } catch (_) {}
            if (window.fitsData && typeof j.flip_y === 'boolean') {
                window.fitsData.flip_y = j.flip_y;
            }
            // Update tile info for this slice (analyze_wcs_orientation can rotate/transpose, changing dims/maxLevel).
            try {
                if (j && j.tile_info && typeof j.tile_info === 'object') {
                    currentTileInfo = j.tile_info;
                    try { window.currentTileInfo = currentTileInfo; } catch (_) {}
                    if (!window.fitsData) window.fitsData = {};
                    if (typeof j.tile_info.width === 'number') window.fitsData.width = j.tile_info.width;
                    if (typeof j.tile_info.height === 'number') window.fitsData.height = j.tile_info.height;
                }
            } catch (_) {}
            // If backend included header, refresh WCS cache immediately (avoids stale transforms).
            try {
                if (j && j.wcs_header && window.fitsData) {
                    window.fitsData.wcs = j.wcs_header;
                    try { if (window.parsedWCS) delete window.parsedWCS; } catch (_) {}
                }
            } catch (_) {}
            // Bust OSD tile cache and reload tiles for new session slice
            reopenTiledViewerForCubeSlice();
            showNotification(false);
            __cubeSliceLoading = false;
            // Success pulse
            try {
                __cubeSliceSliderEl.classList.remove('cube-slice-commit');
                // reflow
                void __cubeSliceSliderEl.offsetWidth;
                __cubeSliceSliderEl.classList.add('cube-slice-commit');
                setTimeout(() => { try { __cubeSliceSliderEl.classList.remove('cube-slice-commit'); } catch(_){} }, 520);
            } catch (_) {}

            // Refresh thumbnail for the newly active slice (no caching)
            try {
                if (__cubeHoverTipActive && __cubeHoverTip) {
                    const img = __cubeHoverTip.querySelector('#cube-tip-img');
                    const loading = __cubeHoverTip.querySelector('#cube-tip-loading');
                    if (loading) loading.style.display = 'flex';
                    if (img) { img.style.display = 'none'; img.style.backgroundImage = ''; }
                    const ctxKey = __cubeSliderContextKey;
                    const reqId = ++__cubePreviewReqSeq;
                    const url = await fetchPreviewBlobUrlNoCache(sliceIdx, ctxKey);
                    if (reqId !== __cubePreviewReqSeq) return;
                    if (ctxKey && __cubeSliderContextKey && ctxKey !== __cubeSliderContextKey) return;
                    if (img && url) {
                        const prev = __cubeHoverTipCurrentObjectUrl;
                        __cubeHoverTipCurrentObjectUrl = url;
                        const tmp = new Image();
                        tmp.onload = () => {
                            try { prev && URL.revokeObjectURL(prev); } catch(_) {}
                            try { img.style.backgroundImage = `url("${url}")`; img.style.display = 'block'; } catch(_) {}
                        };
                        tmp.onerror = () => { try { prev && URL.revokeObjectURL(prev); } catch(_) {} };
                        tmp.src = url;
                    }
                    if (loading) loading.style.display = 'none';
                }
            } catch (_) {}
        } catch (err) {
            console.error('[cube-slice] failed', err);
            showNotification(false);
            __cubeSliceLoading = false;
            showNotification(`Failed to load channel: ${err.message || err}`, 3000, 'error');
        }
    };

    const animateFillTo = (targetPct) => {
        try {
            const startPct = (typeof __cubeFillPct === 'number') ? __cubeFillPct : targetPct;
            const endPct = targetPct;
            const t0 = performance.now();
            const dur = 140;
            const ease = (t) => 1 - Math.pow(1 - t, 3); // easeOutCubic
            const tick = (now) => {
                const u = Math.min(1, (now - t0) / dur);
                const v = startPct + (endPct - startPct) * ease(u);
                range.style.setProperty('--pct', `${v.toFixed(2)}%`);
                __cubeFillPct = v;
                if (u < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        } catch (_) {}
    };

    range.oninput = (e) => {
        const v = e && e.target ? e.target.value : range.value;
        label.textContent = `${v} / ${sliceCount - 1}${canUnits ? ' · ' + formatAxis3(v) : ''}`;
        // Animate fill + subtle bump
        try {
            const pct = (sliceCount <= 1) ? 0 : (Number(v) / (sliceCount - 1)) * 100;
            animateFillTo(pct);
            __cubeSliceSliderEl.classList.add('cube-slice-bump');
            setTimeout(() => { try { __cubeSliceSliderEl.classList.remove('cube-slice-bump'); } catch(_){} }, 170);
        } catch (_) {}
        // debounce heavy requests
        if (__cubeSliceSliderDebounce) clearTimeout(__cubeSliceSliderDebounce);
        __cubeSliceSliderDebounce = setTimeout(() => applySlice(v), 180);
    };

    // Tooltip hover handlers (install once)
    try {
        if (!range.__cubeTipBound) {
            range.__cubeTipBound = true;
            range.addEventListener('mouseenter', () => showHoverTip());
            range.addEventListener('mouseleave', () => hideHoverTip());
            range.addEventListener('focus', () => showHoverTip());
            range.addEventListener('blur', () => hideHoverTip());
            range.addEventListener('mousemove', (ev) => {
                // Map mouse position to value for better feedback when hovering
                try {
                    const rect = range.getBoundingClientRect();
                    const t = (ev.clientX - rect.left) / Math.max(1, rect.width);
                    const v = Math.round(t * (sliceCount - 1));
                    const idx = Math.max(0, Math.min(sliceCount - 1, v));
                    updateHoverTip(ev.clientX, idx);
                    schedulePreview(idx, 110);
                } catch (_) {
                    updateHoverTip(ev.clientX, range.value);
                }
            });
            // Click to force-refresh thumbnail for the current value (no caching)
            range.addEventListener('click', async () => {
                try {
                    if (!__cubeHoverTip) return;
                    const img = __cubeHoverTip.querySelector('#cube-tip-img');
                    const loading = __cubeHoverTip.querySelector('#cube-tip-loading');
                    if (loading) loading.style.display = 'flex';
                    if (img) { img.style.display = 'none'; img.style.backgroundImage = ''; }
                    const idx = Number(range.value) || 0;
                    const ctxKey = __cubeSliderContextKey;
                    const reqId = ++__cubePreviewReqSeq;
                    const url = await fetchPreviewBlobUrlNoCache(idx, ctxKey);
                    if (reqId !== __cubePreviewReqSeq) return;
                    if (ctxKey && __cubeSliderContextKey && ctxKey !== __cubeSliderContextKey) return;
                    if (img && url) {
                        const prev = __cubeHoverTipCurrentObjectUrl;
                        __cubeHoverTipCurrentObjectUrl = url;
                        const tmp = new Image();
                        tmp.onload = () => {
                            try { prev && URL.revokeObjectURL(prev); } catch(_) {}
                            try { img.style.backgroundImage = `url("${url}")`; img.style.display = 'block'; } catch(_) {}
                        };
                        tmp.onerror = () => { try { prev && URL.revokeObjectURL(prev); } catch(_) {} };
                        tmp.src = url;
                    }
                    if (loading) loading.style.display = 'none';
                } catch (_) {}
            });
        }
    } catch (_) {}

    const applyStepCh = (n) => {
        const step = Math.max(1, Math.floor(Number(n) || 1));
        range.step = String(step);
        if (stepCh) stepCh.value = String(step);
        if (canUnits && stepUnit) {
            const unitStep = Math.abs(axis3.cdelt3) * step;
            stepUnit.value = String(unitStep);
        }
    };

    // Initialize step UI
    applyStepCh(stepCh && stepCh.value ? stepCh.value : (range.step || 1));

    // IMPORTANT: make slice 0 go through the same codepath as other slices to keep orientation consistent
    // (ensures analyze_wcs_orientation is applied and sets slice-specific file_id).
    try {
        const current = Math.floor(Number(range.value) || 0);
        if (typeof window.currentLoadedFitsFileId === 'undefined' || !window.currentLoadedFitsFileId) {
            // Fire-and-forget; tile reload will happen but keeps everything consistent.
            setTimeout(() => { applySlice(current); }, 0);
        }
    } catch (_) {}

    if (stepCh) {
        stepCh.onchange = () => applyStepCh(stepCh.value);
    }
    if (canUnits && stepUnit) {
        stepUnit.onchange = () => {
            const desired = Number(stepUnit.value);
            if (!Number.isFinite(desired) || desired <= 0) return;
            const step = Math.max(1, Math.round(desired / Math.abs(axis3.cdelt3)));
            applyStepCh(step);
        };
    }

    const nudge = (dir) => {
        const step = Math.max(1, Math.floor(Number(range.step) || 1));
        const cur = Math.floor(Number(range.value) || 0);
        const next = Math.max(0, Math.min(sliceCount - 1, cur + dir * step));
        range.value = String(next);
        label.textContent = `${next} / ${sliceCount - 1}${canUnits ? ' · ' + formatAxis3(next) : ''}`;
        if (__cubeSliceSliderDebounce) clearTimeout(__cubeSliceSliderDebounce);
        __cubeSliceSliderDebounce = setTimeout(() => applySlice(next), 60);
    };
    if (btnPrev) btnPrev.onclick = () => nudge(-1);
    if (btnNext) btnNext.onclick = () => nudge(1);

    // Hovering on step / prev / next updates the preview (without changing slice)
    try {
        const computeNextPrev = (dir) => {
            const step = Math.max(1, Math.floor(Number(range.step) || 1));
            const cur = Math.floor(Number(range.value) || 0);
            return Math.max(0, Math.min(sliceCount - 1, cur + dir * step));
        };
        const bindPreviewHover = (el, getIdx) => {
            if (!el || el.__cubePreviewBound) return;
            el.__cubePreviewBound = true;
            el.addEventListener('mouseenter', () => {
                try { showHoverTip(); } catch(_) {}
                try {
                    const idx = getIdx();
                    updateHoverTip(null, idx);
                    // immediate on hover for buttons/step
                    previewSlice(idx);
                } catch (_) {}
            });
        };
        bindPreviewHover(btnPrev, () => computeNextPrev(-1));
        bindPreviewHover(btnNext, () => computeNextPrev(1));
        bindPreviewHover(stepCh, () => computeNextPrev(1)); // preview "next step" when hovering step
        bindPreviewHover(stepUnit, () => computeNextPrev(1));
    } catch (_) {}
}
// Function to analyze the FITS file and get HDU information
function getFitsHduInfo(filepath) {
    // Never cache HDU list: cube depth differs per file and stale values break the channel slider.
    const v = Date.now();
    return apiFetch(`/fits-hdu-info/${encodeURIComponent(filepath)}?v=${v}`, { cache: 'no-store' })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Failed to get HDU info: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.error) {
                throw new Error(data.error);
            }
            return data.hduList;
        });
}

// Modify the original loadFitsFile function to check for multiple HDUs
function loadFitsFileWithHduSelection(filepath) {
    // Hide welcome elements if they exist
    const welcomeScreen = document.querySelector('.welcome-screen');
    if (welcomeScreen && welcomeScreen.parentNode) {
        welcomeScreen.parentNode.removeChild(welcomeScreen);
    }
    
    const welcomePointer = document.querySelector('.welcome-pointer');
    if (welcomePointer && welcomePointer.parentNode) {
        welcomePointer.parentNode.removeChild(welcomePointer);
    }
    
    showNotification(true, `Analyzing ${filepath}...`);
    
    // First check how many HDUs this file has
    getFitsHduInfo(filepath)
        .then(hduList => {
            showNotification(false);
            
            // If the file has multiple HDUs, show the selection popup
            if (hduList && hduList.length > 1) {
                console.log(`FITS file has ${hduList.length} HDUs. Showing selection popup.`);
                createHduSelectorPopup(hduList, filepath);
            } else {
                // If there's only one HDU, load it directly
                console.log('FITS file has only one HDU. Loading directly.');
                // Use the original loading function with HDU 0
                selectHdu(0, filepath);
            }
        })
        .catch(error => {
            console.error('Error analyzing FITS file:', error);
            showNotification(false);
            showNotification(`Error: ${error.message || 'Failed to analyze FITS file'}`, 5000);
            
            // If analysis fails, fall back to loading the primary HDU
            console.log('Falling back to loading primary HDU');
            selectHdu(0, filepath);
        });
}





// Define a global variable to track the current flag filtering state
let flagFilterEnabled = false;
let currentFlagColumn = null; // Will store the name of the current boolean column being used for filtering

let flagFilterButton = null;


// Replace the existing populateFlagDropdown function with this fixed version

// REPLACE your existing populateFlagDropdown function in catalogs.js with this fixed version

function populateFlagDropdown(dropdownContent) {
    // Clear existing content
    dropdownContent.innerHTML = '';
    
    // Add a "No Filter" option
    const noFilterItem = document.createElement('div');
    noFilterItem.className = 'flag-item';
    noFilterItem.textContent = 'No Filter (Show All)';
    noFilterItem.style.padding = '10px';
    noFilterItem.style.cursor = 'pointer';
    noFilterItem.style.borderBottom = '1px solid #444';
    noFilterItem.style.color = 'white';
    
    // Highlight if currently selected
    if (!flagFilterEnabled) {
        noFilterItem.style.backgroundColor = 'white';
        noFilterItem.style.color = 'black';
    }
    
    // FIXED: Remove the condition that was preventing hover effects
    noFilterItem.addEventListener('mouseover', function() {
        if (!flagFilterEnabled) {
            this.style.backgroundColor = '#333';
        }
    });
    
    noFilterItem.addEventListener('mouseout', function() {
        if (!flagFilterEnabled) {
            this.style.backgroundColor = 'white';
            this.style.color = 'black';
        } else {
            this.style.backgroundColor = 'transparent';
            this.style.color = 'white';
        }
    });
    
// REPLACE the "No Filter" click handler in your populateFlagDropdown function in catalogs.js with this:

noFilterItem.addEventListener('click', function() {
    console.log('No Filter clicked - clearing all filters');
    
    // Disable flag filtering
    flagFilterEnabled = false;
    currentFlagColumn = null;
    currentEnvValue = null;
    
    // Clear global filter state
    window.flagFilterEnabled = false;
    window.currentFlagColumn = null;
    window.visibleObjectIndices = null;
    window.currentEnvValue = null;
    
    // FIXED: Clear passesFilter property on canvas overlay data
    if (window.catalogDataForOverlay) {
        console.log('Clearing passesFilter property on all canvas overlay objects');
        window.catalogDataForOverlay.forEach(obj => {
            obj.passesFilter = true; // Set to true to show all objects
        });
        
        // Force canvas redraw
        if (typeof canvasUpdateOverlay === 'function') {
            console.log('Calling canvasUpdateOverlay to refresh display');
            canvasUpdateOverlay();
        }
    }
    
    // Update the UI
    updateFlagFilterUI(dropdownContent);
    
    // Handle DOM-based dots (fallback for older system)
    if (window.catalogDots) {
        console.log('Also clearing DOM dots filter state');
        window.catalogDots.forEach(dot => {
            dot.style.display = 'block';
            dot.dataset.passesFilter = 'true';
        });
        
        // Update DOM overlay if function exists
        if (typeof updateOverlay === 'function') {
            updateOverlay();
        }
    }
    
    // Close the dropdown
    dropdownContent.style.display = 'none';
    
    showNotification('Showing all catalog objects', 1500, 'success');
});
    
    dropdownContent.appendChild(noFilterItem);
    
    // If no catalog is loaded, show a message
    if (!activeCatalog) {
        const noDataItem = document.createElement('div');
        noDataItem.style.padding = '10px';
        noDataItem.style.color = '#aaa';
        noDataItem.textContent = 'Load a catalog to see available flags';
        dropdownContent.appendChild(noDataItem);
        return;
    }
    
    // Check if we already have flag data in the cache
    if (window.catalogDataWithFlags) {
        // Use the cached data to build the flag dropdown
        buildFlagDropdownFromCache(dropdownContent);
    } else {
        // Show loading indicator
        const loadingItem = document.createElement('div');
        loadingItem.style.padding = '10px';
        loadingItem.style.color = '#aaa';
        loadingItem.textContent = 'Loading flag information...';
        dropdownContent.appendChild(loadingItem);
        
        // Load the flag data
        apiFetch(`/catalog-with-flags/${activeCatalog}`)
            .then(response => response.json())
            .then(data => {
                // Cache the data for future use
                window.catalogDataWithFlags = data;
                
                // Build the dropdown using the loaded data
                buildFlagDropdownFromCache(dropdownContent);
            })
            .catch(error => {
                console.error('Error loading flag data:', error);
                
                // Show error message
                dropdownContent.innerHTML = '';
                dropdownContent.appendChild(noFilterItem); // Keep the "No Filter" option
                
                const errorItem = document.createElement('div');
                errorItem.style.padding = '10px';
                errorItem.style.color = '#f44336';
                errorItem.textContent = 'Error loading catalog flags';
                dropdownContent.appendChild(errorItem);
            });
    }
}

// REPLACE your existing buildFlagDropdownFromCache function with this enhanced version

function buildFlagDropdownFromCache(dropdownContent) {
    // Clear everything after the "No Filter" option
    const noFilterItem = dropdownContent.querySelector('.flag-item');
    if (noFilterItem) {
        while (noFilterItem.nextSibling) {
            dropdownContent.removeChild(noFilterItem.nextSibling);
        }
    }
    
    if (!window.catalogDataWithFlags || window.catalogDataWithFlags.length === 0) {
        const noDataItem = document.createElement('div');
        noDataItem.style.padding = '10px';
        noDataItem.style.color = '#aaa';
        noDataItem.textContent = 'No catalog data available';
        dropdownContent.appendChild(noDataItem);
        return;
    }
    
    console.log("Inspecting catalog data:");
    console.log("Total catalog objects:", window.catalogDataWithFlags.length);
    
    // Get first object to check column types
    const firstObj = window.catalogDataWithFlags[0];
    if (!firstObj) {
        const noDataItem = document.createElement('div');
        noDataItem.style.padding = '10px';
        noDataItem.style.color = '#aaa';
        noDataItem.textContent = 'No catalog objects available';
        dropdownContent.appendChild(noDataItem);
        return;
    }
    
    const availableProperties = Object.keys(firstObj);
    console.log('Available properties in catalog data:', availableProperties);
    
    // Check for environment column and collect unique env values
    let hasEnvColumn = false;
    const envValues = new Set();
    
    if (availableProperties.includes('env')) {
        hasEnvColumn = true;
        console.log('Found env column, checking values...');
        
        // Sample more objects to get better coverage of env values
        const sampleSize = Math.min(200, window.catalogDataWithFlags.length);
        
        for (let i = 0; i < sampleSize; i++) {
            const obj = window.catalogDataWithFlags[i];
            if (obj && obj.env !== null && obj.env !== undefined) {
                const envVal = parseInt(obj.env);
                if (!isNaN(envVal) && envVal >= 1 && envVal <= 10) {
                    envValues.add(envVal);
                }
            }
        }
        
        console.log('Found environment values:', Array.from(envValues).sort((a, b) => a - b));
    }
    
    // Collect boolean columns
    const actualBooleanColumns = new Set();
    const sampleSize = Math.min(50, window.catalogDataWithFlags.length);
    
    for (const [key, value] of Object.entries(firstObj)) {
        // Skip coordinate and display columns
        if (['ra', 'dec', 'x', 'y', 'radius_pixels', 'env'].includes(key)) {
            continue;
        }
        
        let isActuallyBoolean = false;
        let allValuesAreBooleanType = true;
        let hasOnlyZeroOne = true;
        let uniqueValues = new Set();
        
        // Sample multiple objects to determine if column is truly boolean
        for (let i = 0; i < sampleSize; i++) {
            const obj = window.catalogDataWithFlags[i];
            if (!obj || !(key in obj)) continue;
            
            const val = obj[key];
            uniqueValues.add(val);
            
            if (typeof val !== 'boolean') {
                allValuesAreBooleanType = false;
            }
            
            if (!(val === 0 || val === 1 || val === true || val === false)) {
                hasOnlyZeroOne = false;
            }
        }
        
        // A column is boolean if it meets our criteria
        if (allValuesAreBooleanType || 
            (hasOnlyZeroOne && uniqueValues.size <= 3 && 
             (uniqueValues.has(0) || uniqueValues.has(1) || uniqueValues.has(true) || uniqueValues.has(false)))) {
            
            // Additional filtering to avoid measurement columns
            const keyLower = key.toLowerCase();
            const isMeasurementColumn = keyLower.includes('err') || keyLower.includes('snr') || 
                                       keyLower.includes('chi') || keyLower.includes('mass') ||
                                       keyLower.includes('dust') || keyLower.includes('best.');
            
            if (!isMeasurementColumn) {
                actualBooleanColumns.add(key);
            }
        }
    }
    
    console.log("Boolean columns found:", Array.from(actualBooleanColumns));
    
    // ENVIRONMENT FILTERS SECTION
    if (hasEnvColumn && envValues.size > 0) {
        // Add environment section header
        const envHeader = document.createElement('div');
        envHeader.style.padding = '8px 10px';
        envHeader.style.fontWeight = 'bold';
        envHeader.style.backgroundColor = '#2a2a2a';
        envHeader.style.borderBottom = '1px solid #555';
        envHeader.style.color = '#4CAF50';
        envHeader.style.fontSize = '13px';
        envHeader.textContent = `Environment Filters (${envValues.size} types)`;
        dropdownContent.appendChild(envHeader);
        
        // Sort environment values numerically
        const sortedEnvValues = Array.from(envValues).sort((a, b) => a - b);
        
        // Add each environment value using ENV_DESCRIPTIONS
        sortedEnvValues.forEach(envValue => {
            // Get description from ENV_DESCRIPTIONS or use default
            const description = ENV_DESCRIPTIONS[envValue] || `Environment ${envValue}`;
            
            const envItem = document.createElement('div');
            envItem.className = 'flag-item env-item';
            envItem.dataset.envValue = envValue;
            envItem.style.padding = '10px 15px'; // Indent environment items
            envItem.style.cursor = 'pointer';
            envItem.style.borderBottom = '1px solid #3a3a3a';
            envItem.style.color = 'white';
            envItem.style.fontSize = '13px';
            
            // Create the display text with value and description
            envItem.innerHTML = `
                <span style="color: #66bb6a; font-weight: bold;">Env ${envValue}:</span> 
                <span style="color: #fff;">${description}</span>
            `;
            
            // Highlight if currently selected
            if (flagFilterEnabled && currentFlagColumn === 'env' && currentEnvValue == envValue) {
                envItem.style.backgroundColor = 'white';
                envItem.style.color = 'black';
                envItem.innerHTML = `
                    <span style="color: #2e7d32; font-weight: bold;">Env ${envValue}:</span> 
                    <span style="color: #000;">${description}</span>
                `;
            }
            
            envItem.addEventListener('mouseover', function() {
                if (!(flagFilterEnabled && currentFlagColumn === 'env' && currentEnvValue == envValue)) {
                    this.style.backgroundColor = '#444';
                }
            });
            
            envItem.addEventListener('mouseout', function() {
                if (flagFilterEnabled && currentFlagColumn === 'env' && currentEnvValue == envValue) {
                    this.style.backgroundColor = 'white';
                    this.innerHTML = `
                        <span style="color: #2e7d32; font-weight: bold;">Env ${envValue}:</span> 
                        <span style="color: #000;">${description}</span>
                    `;
                } else {
                    this.style.backgroundColor = 'transparent';
                    this.innerHTML = `
                        <span style="color: #66bb6a; font-weight: bold;">Env ${envValue}:</span> 
                        <span style="color: #fff;">${description}</span>
                    `;
                }
            });
            
            envItem.addEventListener('click', function() {
                const selectedEnvValue = parseInt(this.dataset.envValue);
                console.log(`Environment filter clicked: Env ${selectedEnvValue} (${description})`);
                
                // Set filter state
                flagFilterEnabled = true;
                currentFlagColumn = 'env';
                currentEnvValue = selectedEnvValue;
                
                // Set global filter state
                window.flagFilterEnabled = true;
                window.currentFlagColumn = 'env';
                window.currentEnvValue = selectedEnvValue;
                
                // Apply the environment filter
                applyEnvironmentFilter(selectedEnvValue);
                
                // Update UI
                updateFlagFilterUI(dropdownContent);
                
                // Close dropdown
                dropdownContent.style.display = 'none';
            });
            
            dropdownContent.appendChild(envItem);
        });
        
        // Add section divider if we have boolean columns too
        if (actualBooleanColumns.size > 0) {
            const divider = document.createElement('div');
            divider.style.height = '1px';
            divider.style.backgroundColor = '#555';
            divider.style.margin = '5px 0';
            dropdownContent.appendChild(divider);
        }
    }
    
    // BOOLEAN FLAGS SECTION
    if (actualBooleanColumns.size > 0) {
        const booleanHeader = document.createElement('div');
        booleanHeader.style.padding = '8px 10px';
        booleanHeader.style.fontWeight = 'bold';
        booleanHeader.style.backgroundColor = '#2a2a2a';
        booleanHeader.style.borderBottom = '1px solid #555';
        booleanHeader.style.color = '#2196F3';
        booleanHeader.style.fontSize = '13px';
        booleanHeader.textContent = `Boolean Flags (${actualBooleanColumns.size})`;
        dropdownContent.appendChild(booleanHeader);
        
        // Convert to array and sort
        const sortedBooleanColumns = Array.from(actualBooleanColumns).sort();
        
        // Add each boolean column to the dropdown
        sortedBooleanColumns.forEach(column => {
            const flagItem = document.createElement('div');
            flagItem.className = 'flag-item boolean-flag-item';
            flagItem.dataset.flagProperty = column;
            flagItem.style.padding = '10px 15px';
            flagItem.style.cursor = 'pointer';
            flagItem.style.borderBottom = '1px solid #3a3a3a';
            flagItem.style.color = 'white';
            flagItem.style.fontSize = '13px';
            
            // Format property name for display
            const displayName = column.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            flagItem.textContent = displayName;
            
            // Highlight if currently selected
            if (flagFilterEnabled && currentFlagColumn === column && currentEnvValue === null) {
                flagItem.style.backgroundColor = 'white';
                flagItem.style.color = 'black';
            }
            
            flagItem.addEventListener('mouseover', function() {
                if (!(flagFilterEnabled && currentFlagColumn === column && currentEnvValue === null)) {
                    this.style.backgroundColor = '#444';
                }
            });
            
            flagItem.addEventListener('mouseout', function() {
                if (flagFilterEnabled && currentFlagColumn === column && currentEnvValue === null) {
                    this.style.backgroundColor = 'white';
                    this.style.color = 'black';
                } else {
                    this.style.backgroundColor = 'transparent';
                    this.style.color = 'white';
                }
            });
            
            flagItem.addEventListener('click', function() {
                const propertyName = this.dataset.flagProperty;
                console.log(`Boolean flag filter clicked: ${propertyName}`);
                
                // Set filter state
                flagFilterEnabled = true;
                currentFlagColumn = propertyName;
                currentEnvValue = null; // Not an environment filter
                
                // Set global filter state
                window.flagFilterEnabled = true;
                window.currentFlagColumn = propertyName;
                window.currentEnvValue = null;
                
                // Apply the boolean filter
                applyLocalFilter(propertyName);
                
                // Update UI
                updateFlagFilterUI(dropdownContent);
                
                // Close dropdown
                dropdownContent.style.display = 'none';
            });
            
            dropdownContent.appendChild(flagItem);
        });
    }
    
    // Show message if no filters available
    if (!hasEnvColumn && actualBooleanColumns.size === 0) {
        const noFlagsItem = document.createElement('div');
        noFlagsItem.style.padding = '10px';
        noFlagsItem.style.color = '#aaa';
        noFlagsItem.textContent = 'No environment values or boolean flags found';
        dropdownContent.appendChild(noFlagsItem);
    }
}

// ADD this new function to handle environment filtering

function applyEnvironmentFilter(envValue) {
    if (!window.catalogDataWithFlags) {
        console.warn('No catalog data available for environment filtering');
        showNotification('No catalog data available for filtering', 3000, 'warning');
        return;
    }
    
    console.log(`Applying environment filter for value: ${envValue} (${ENV_DESCRIPTIONS[envValue]})`);
    
    showNotification(true, `Filtering by ${ENV_DESCRIPTIONS[envValue]}...`);
    
    let visibleCount = 0;
    const targetEnvValue = parseInt(envValue);
    
    console.log(`Using target environment value: ${targetEnvValue} (${typeof targetEnvValue})`);
    
    // Handle canvas-based overlay
    if (window.catalogDataForOverlay && typeof updateCanvasOverlay === 'function') {
        console.log('Applying environment filter to canvas overlay');
        
        // Filter the overlay data
        window.catalogDataForOverlay.forEach((obj, index) => {
            if (obj && 'env' in obj) {
                const objEnvValue = parseInt(obj.env);
                const matchesEnv = (objEnvValue === targetEnvValue);
                
                // Set filter property on the object
                obj.passesFilter = matchesEnv;
                
                if (matchesEnv) {
                    visibleCount++;
                }
            } else {
                obj.passesFilter = false;
            }
        });
        
        // Update the canvas overlay
        updateCanvasOverlay();
    }
    
    // Handle DOM-based overlay (if catalogDots exist)
    if (window.catalogDots && window.catalogDots.length > 0) {
        console.log('Applying environment filter to DOM dots');
        
        window.catalogDots.forEach((dot, i) => {
            if (!dot || !dot.dataset) {
                console.warn(`Dot at index ${i} is invalid`);
                return;
            }
            
            // Get the object index from the dot's dataset
            const dotIndex = parseInt(dot.dataset.index);
            
            if (isNaN(dotIndex) || dotIndex >= window.catalogDataWithFlags.length) {
                dot.style.display = 'none';
                dot.dataset.passesFilter = 'false';
                return;
            }
            
            // Get the corresponding data object
            const objData = window.catalogDataWithFlags[dotIndex];
            let matchesEnv = false;
            
            if (objData && 'env' in objData) {
                const objEnvValue = parseInt(objData.env);
                matchesEnv = (objEnvValue === targetEnvValue);
                
                if (matchesEnv) {
                    visibleCount++;
                }
            }
            
            // Set dot visibility
            dot.style.display = matchesEnv ? 'block' : 'none';
            dot.dataset.passesFilter = matchesEnv ? 'true' : 'false';
        });
        
        // Update DOM overlay
        if (typeof updateOverlay === 'function') {
            updateOverlay();
        }
    }
    
    console.log(`Environment filter results: ${visibleCount} objects match env=${targetEnvValue}`);
    
    showNotification(false);
    
    if (visibleCount === 0) {
        showNotification(`No objects found in "${ENV_DESCRIPTIONS[targetEnvValue]}" environment`, 3000, 'warning');
    } else {
        showNotification(`Showing ${visibleCount} objects in "${ENV_DESCRIPTIONS[targetEnvValue]}"`, 2500, 'success');
    }
}

// Also add this improved updateFlagFilterUI function to ensure proper visual feedback

function updateFlagFilterUI(dropdownContent) {
    // Update button appearance
    if (flagFilterButton) {
        if (flagFilterEnabled) {
            flagFilterButton.style.backgroundColor = '#007bff'; // Blue when filter active
            flagFilterButton.style.borderColor = '#007bff';
            flagFilterButton.style.color = 'white';
        } else {
            flagFilterButton.style.backgroundColor = '#444'; // Default gray
            flagFilterButton.style.borderColor = '#666';
            flagFilterButton.style.color = '#fff';
        }
    }
    
    // Update dropdown items
    const flagItems = dropdownContent.querySelectorAll('.flag-item');
    flagItems.forEach(item => {
        // Reset all items first
        item.style.backgroundColor = 'transparent';
        item.style.color = 'white';
        
        // Highlight selected item based on filtering mode
        if (item.textContent === 'No Filter (Show All)' && !flagFilterEnabled) {
            // No filter selected
            item.style.backgroundColor = 'white';
            item.style.color = 'black';
        } 
        else if (item.classList.contains('env-item') && 
                flagFilterEnabled && 
                currentFlagColumn === 'env' && 
                item.dataset.envValue == currentEnvValue) {
            // Environment value selected
            item.style.backgroundColor = 'white';
            item.style.color = 'black';
        }
        else if (!item.classList.contains('env-item') && 
                flagFilterEnabled &&
                item.textContent === currentFlagColumn && 
                currentEnvValue === null) {
            // Boolean flag selected
            item.style.backgroundColor = 'white';
            item.style.color = 'black';
        }
    });
}



function updateFlagFilterUI(dropdownContent) {
    // Update button appearance
    if (flagFilterButton) {
        if (flagFilterEnabled) {
            flagFilterButton.style.backgroundColor = '#007bff'; // Blue when filter active
            flagFilterButton.style.borderColor = '#007bff';
            flagFilterButton.style.color = 'white';
        } else {
            flagFilterButton.style.backgroundColor = '#444'; // Default gray
            flagFilterButton.style.borderColor = '#666';
            flagFilterButton.style.color = '#fff';
        }
    }
    
    // Update dropdown items
    const flagItems = dropdownContent.querySelectorAll('.flag-item');
    flagItems.forEach(item => {
        // Reset all items first
        item.style.backgroundColor = 'transparent';
        item.style.color = 'white';
        
        // Highlight selected item based on filtering mode
        if (item.textContent === 'No Filter (Show All)' && !flagFilterEnabled) {
            // No filter selected
            item.style.backgroundColor = 'white';
            item.style.color = 'black';
        } 
        else if (item.classList.contains('env-item') && 
                flagFilterEnabled && 
                currentFlagColumn === 'env' && 
                item.dataset.envValue == currentEnvValue) {
            // Environment value selected
            item.style.backgroundColor = 'white';
            item.style.color = 'black';
        }
        else if (!item.classList.contains('env-item') && 
                flagFilterEnabled &&
                item.textContent === currentFlagColumn && 
                currentEnvValue === null) {
            // Boolean flag selected
            item.style.backgroundColor = 'white';
            item.style.color = 'black';
        }
    });
}

// Add this helper function to debug the filter state
function debugFilterState() {
    console.log('=== FILTER DEBUG STATE ===');
    console.log('flagFilterEnabled:', flagFilterEnabled);
    console.log('currentFlagColumn:', currentFlagColumn);
    console.log('currentEnvValue:', currentEnvValue);
    console.log('window.flagFilterEnabled:', window.flagFilterEnabled);
    console.log('window.catalogDots length:', window.catalogDots?.length);
    console.log('window.catalogDataWithFlags length:', window.catalogDataWithFlags?.length);
    
    if (window.catalogDots && window.catalogDots.length > 0) {
        const visibleCount = window.catalogDots.filter(dot => 
            dot.style.display !== 'none'
        ).length;
        console.log('Currently visible dots:', visibleCount);
    }
}


function debugFlagFilterButton() {
    const container = document.querySelector('.flag-filter-container');
    const button = document.querySelector('.flag-filter-button');
    const toolbar = document.querySelector('.toolbar');
    
    console.log('=== FLAG FILTER BUTTON DEBUG ===');
    console.log('Container exists:', !!container);
    console.log('Button exists:', !!button);
    console.log('Toolbar exists:', !!toolbar);
    
    if (container) {
        console.log('Container display:', window.getComputedStyle(container).display);
        console.log('Container visibility:', window.getComputedStyle(container).visibility);
        console.log('Container in DOM:', document.body.contains(container));
    }
    
    if (button) {
        console.log('Button display:', window.getComputedStyle(button).display);
        console.log('Button visibility:', window.getComputedStyle(button).visibility);
        console.log('Button dimensions:', button.getBoundingClientRect());
    }
    
    if (toolbar) {
        console.log('Toolbar children count:', toolbar.children.length);
        console.log('Toolbar children:', Array.from(toolbar.children).map(child => child.className));
    }
}

// Run this in your browser console after loading a catalog

function createFlagFilterButton() {
    // Check if button already exists
    const existingButton = document.querySelector('.flag-filter-container');
    if (existingButton) {
        // If it exists, force it to be visible
        existingButton.style.cssText = `
               display: inline-block !important;
    position: relative !important;
    width: auto !important;
    height: 100%;
    margin-right: 5px !important;
    margin-left: 5px;
    margin-top: 5px;
        `;
        const button = existingButton.querySelector('.flag-filter-button');
        if (button) {
            button.style.cssText = `
                  width: 38px !important;
    height: 41px !important;
    min-width: 32px !important;
    min-height: 32px !important;
    color: rgb(255, 255, 255) !important;
    border: 1px solid white !important;
    cursor: pointer !important;
    align-items: center !important;
    justify-content: center !important;
    box-sizing: border-box !important;
    margin: 0px 0px !important;
    border-radius: 0px !important;
    margin-top: 5px !important;
    position: relative;
    top: 1px;
            `;
        }
        return existingButton;
    }
    
    // Create a button container
    const flagFilterContainer = document.createElement('div');
    flagFilterContainer.className = 'flag-filter-container';
    flagFilterContainer.style.cssText = `
        display: inline-block !important;
    position: relative !important;
    width: auto !important;
    height: 100%;
    margin-right: 5px !important;
    margin-left: 5px;
    margin-top: 5px;
    `;
    
    // Create the main button with just an icon
    flagFilterButton = document.createElement('button');
    flagFilterButton.className = 'flag-filter-button';
    flagFilterButton.title = 'Filter regions by catalog flags';
    flagFilterButton.style.cssText = `
         width: 38px !important;
    height: 41px !important;
    min-width: 32px !important;
    min-height: 32px !important;
    color: rgb(255, 255, 255) !important;
    border: 1px solid white !important;
    cursor: pointer !important;
    align-items: center !important;
    justify-content: center !important;
    box-sizing: border-box !important;
    margin: 0px 0px !important;
    border-radius: 0px !important;
    margin-top: 5px !important;
    position: relative;
    top: 1px;
    `;

    // Use a filter icon
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.style.cssText = `
        fill: currentColor !important;
        display: block !important;
        width: 16px !important;
        height: 16px !important;
    `;
    
    // Create the filter icon paths
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", "M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z");
    svg.appendChild(path);
    
    flagFilterButton.appendChild(svg);
    
    // Add event listener for the dropdown
  // In createFlagFilterButton function, replace the click event listener with:
flagFilterButton.addEventListener('click', function(event) {
    event.stopPropagation();
    
    let dropdownContent = flagFilterContainer.querySelector('.flag-dropdown-content');
    
    if (!dropdownContent) {
        dropdownContent = document.createElement('div');
        dropdownContent.className = 'flag-dropdown-content';
        dropdownContent.style.cssText = `
            display: none !important;
            position: absolute !important;
            background-color: #222 !important;
            min-width: 250px !important;
            box-shadow: 0px 8px 16px 0px rgba(0,0,0,0.4) !important;
            z-index: 1000 !important;
            border-radius: 4px !important;
            top: 100% !important;
            right: 0 !important;
            margin-top: 5px !important;
            max-height: 400px !important;
            overflow-y: auto !important;
        `;
        flagFilterContainer.appendChild(dropdownContent);
    }
    
    if (dropdownContent.style.display === 'none') {
        dropdownContent.style.display = 'block';
        
        // Call populateFlagDropdown directly - it will handle the catalog detection
        if (typeof populateFlagDropdown === 'function') {
            populateFlagDropdown(dropdownContent);
        } else {
            console.error('populateFlagDropdown function not found');
            dropdownContent.innerHTML = '<div style="padding: 10px; color: #f44;">populateFlagDropdown function missing</div>';
        }
    } else {
        dropdownContent.style.display = 'none';
    }
});
    
    // Close dropdown when clicking outside
    document.addEventListener('click', function(event) {
        const dropdownContent = flagFilterContainer.querySelector('.flag-dropdown-content');
        if (dropdownContent && !flagFilterContainer.contains(event.target)) {
            dropdownContent.style.display = 'none';
        }
    });
    
    // Add the button to the container
    flagFilterContainer.appendChild(flagFilterButton);
    
    // Find the toolbar
    const toolbar = document.querySelector('.toolbar');
    if (!toolbar) {
        console.error('Toolbar not found for flag filter button');
        return null;
    }
    
    // Find the histogram button or any other reference element in the toolbar
    const existingHistogramButton = toolbar.querySelector('.dynamic-range-button');
    const zoomInButton = toolbar.querySelector('button:first-child');

    // Insert the flag filter button in the appropriate position
    if (existingHistogramButton) {
        // toolbar.insertBefore(flagFilterContainer, existingHistogramButton);
        console.log("Inserted flag filter button before histogram button");
    } else if (zoomInButton) {
        toolbar.insertBefore(flagFilterContainer, zoomInButton);
        console.log("Inserted flag filter button before first button");
    } else {
        toolbar.prepend(flagFilterContainer);
        console.log("Prepended flag filter button to toolbar");
    }
    
    console.log("Flag filter button created and added to toolbar");
    return flagFilterContainer;
}



// Update this function to make the button white when filter is applied
function updateFlagFilterUI(dropdownContent) {
    // Check if the button exists first
    if (flagFilterButton) {
        if (flagFilterEnabled) {
            // Make the button white when filter is applied
            flagFilterButton.style.color = '#ffffff'; // Bright white color
        } else {
            // Reset to default color (likely white already, but ensuring consistency)
            flagFilterButton.style.color = '#ffffff';
        }
    }
    
    // Update dropdown items
    const flagItems = dropdownContent.querySelectorAll('.flag-item');
    flagItems.forEach(item => {
        if ((item.textContent === 'No Filter (Show All)' && !flagFilterEnabled) ||
            (item.textContent === currentFlagColumn && flagFilterEnabled)) {
            item.style.backgroundColor = 'white';
            item.style.color = 'black';

        } else {
            item.style.backgroundColor = 'transparent';
        }
    });
}



// New endpoint to get all catalog data with flags in a single request
function loadCatalogWithFlags(catalogName) {
    showNotification(true, 'Loading catalog with flag data...');
    
    apiFetch(`/catalog-with-flags/${catalogName}`)
        .then(response => response.json())
        .then(data => {
            // Store the complete catalog data with flags in a global variable
            window.catalogDataWithFlags = data;
            
            // Add environment column if it doesn't exist
            console.log("Adding or verifying env column to catalog data");
            const envExists = data.length > 0 && 'env' in data[0];
            
            if (!envExists) {
                console.log("env column not found in data. Adding simulated environment values.");
                
                // Add env column with values 1-10 based on position in catalog
                // This distributes objects across all environment types for testing
                window.catalogDataWithFlags.forEach((obj, index) => {
                    // Determine environment value (1-10) based on object's position or other attributes
                    // This is just a demonstration - you'd replace this with your actual environment determination logic
                    const envValue = (index % 10) + 1; // Values from 1 to 10
                    obj.env = envValue; // Add the env property to each object
                });
                
                console.log("Added env column to catalog data. First few objects:");
                for (let i = 0; i < 5 && i < window.catalogDataWithFlags.length; i++) {
                    console.log(`  Object ${i} env value: ${window.catalogDataWithFlags[i].env}`);
                }
            } else {
                console.log("env column already exists in data");
            }
            
            // Apply any active filters without making additional requests
            if (flagFilterEnabled && currentFlagColumn) {
                applyLocalFilter(currentFlagColumn);
            }
            
            showNotification(false);
        })
        .catch(error => {
            console.error('Error loading catalog with flags:', error);
            showNotification(false);
            showNotification('Error loading catalog data', 3000);
        });
}



// Enhanced coordinates display with animations
(function() {
    // Set up DOM utility functions
    function waitForElement(selector, maxWaitTime = 10000) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(selector)) {
                return resolve(document.querySelector(selector));
            }
            
            const observer = new MutationObserver(mutations => {
                if (document.querySelector(selector)) {
                    observer.disconnect();
                    resolve(document.querySelector(selector));
                }
            });
            
            observer.observe(document.body, { childList: true, subtree: true });
            
            setTimeout(() => {
                observer.disconnect();
                resolve(document.querySelector(selector));
            }, maxWaitTime);
        });
    }
    
    // Create the coordinates display element with enhanced styling
    function createCoordinatesElement() {
        // Add CSS for animations
        const styleElement = document.createElement('style');
        styleElement.textContent = `
            @keyframes numberChange {
                0% { opacity: 0.3; transform: scale(0.95); }
                50% { opacity: 1; transform: scale(1.05); }
                100% { opacity: 1; transform: scale(1); }
            }
            
            .coord-value {
                display: inline-block;
                transition: all 0.2s ease-out;
                min-width: 3.5em;
                text-align: right;
            }
            
            .coord-value.changing {
                animation: numberChange 0.3s ease-out;
            }
            
            .coords-container {
                transition: all 0.3s ease;
                opacity: 0;
                transform: translateY(-5px);
            }
            
            .coords-container.visible {
                opacity: 1;
                transform: translateY(0);
            }
            
            .coord-label {
                color: #8899aa;
                font-weight: normal;
            }
            
            .coord-unit {
                color: #6699cc;
                font-size: 0.9em;
                margin-left: 4px;
            }
        `;
        document.head.appendChild(styleElement);
        
        // Create the main container
        const coords = document.createElement('div');
        coords.id = 'osd-coordinates';
        coords.style.position = 'absolute';
        coords.style.top = '10px';
        coords.style.left = '10px';
        coords.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        coords.style.color = 'white';
        coords.style.padding = '8px 10px';
        coords.style.borderRadius = '4px';
        coords.style.fontSize = '12px';
        coords.style.fontFamily = 'monospace';
        coords.style.zIndex = '1000';
        coords.style.pointerEvents = 'none';
        coords.style.backdropFilter = 'blur(2px)';
        coords.style.webkitBackdropFilter = 'blur(2px)';
        coords.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.3)';
        coords.style.textShadow = '0 1px 2px rgba(0, 0, 0, 0.5)';
        coords.style.width = 'auto';
        coords.style.whiteSpace = 'nowrap';
        
        // Add inner container for fade-in/out animation
        const container = document.createElement('div');
        container.className = 'coords-container';
        
        // Create structured layout for coordinates
        container.innerHTML = `
            <div class="coord-row">
                <span class="coord-label">X,Y:</span> 
                <span class="coord-value" id="coord-x">-</span>,
                <span class="coord-value" id="coord-y">-</span>
            </div>
            <div class="coord-row">
                <span class="coord-label">RA,DEC:</span> 
                <span class="coord-value" id="coord-ra">-</span>,
                <span class="coord-value" id="coord-dec">-</span>
            </div>
            <div class="coord-row">
                <span class="coord-label">Value:</span> 
                <span class="coord-value" id="coord-value">-</span>
                <span class="coord-unit" id="coord-unit"></span>
            </div>
        `;
        
        coords.appendChild(container);
        
        // Show the container with animation
        setTimeout(() => {
            container.classList.add('visible');
        }, 100);
        
        return coords;
    }
    
    // Function to update a value with animation
    function updateValueWithAnimation(elementId, newValue) {
        const element = document.getElementById(elementId);
        if (!element) return;
        
        // Only animate if value is actually changing
        if (element.textContent !== newValue) {
            // Remove animation class if it exists
            element.classList.remove('changing');
            
            // Trigger reflow to restart animation
            void element.offsetWidth;
            
            // Update value and add animation class
            element.textContent = newValue;
            element.classList.add('changing');
        }
    }
    
    function removeCoordinatesDisplay() {
        try {
            const coords = document.getElementById('osd-coordinates');
            if (coords && coords.parentNode) coords.parentNode.removeChild(coords);
        } catch (_) {}
    }

    // Initialize the coordinates display
    async function initCoordinates() {
        if (!window.fitsData) {
            removeCoordinatesDisplay();
            return;
        }
        console.log("Starting coordinates display initialization");
        
        // Wait for the OpenSeadragon container to be available
        const container = await waitForElement('#openseadragon');
        if (!container) {
            console.warn("OpenSeadragon container not found for coordinates");
            return;
        }
        
        console.log("Found OpenSeadragon container for coordinates");
        
        // Remove any existing coordinate display
        const existing = document.getElementById('osd-coordinates');
        if (existing) {
            console.log("Removing existing coordinates display");
            existing.remove();
        }
        
        // Create new coordinates display
        const coordsDisplay = createCoordinatesElement();
        if (!coordsDisplay) {
            console.error("Failed to create coordinates element!");
            return;
        }
        container.appendChild(coordsDisplay);
        
        console.log("Coordinates display element added to container");
        
        // Get the inner container for animations
        const innerContainer = coordsDisplay.querySelector('.coords-container');
        if (!innerContainer) {
            console.error("Could not find .coords-container within the coordinates display element");
            return;
        }
        
        // Set up event listeners using direct DOM events
        console.log("Adding mousemove listener for coordinates");
        container.addEventListener('mousemove', function(event) {
            // Ensure viewer and fitsData are available
            const currentViewer = window.viewer || window.tiledViewer; // Find the active viewer
            
            if (!currentViewer) {
                 // console.log("mousemove: No viewer found");
                 if (innerContainer) innerContainer.classList.remove('visible'); 
                 return;
            }
            if (!currentViewer.world) {
                 // console.log("mousemove: Viewer found, but no world");
                 if (innerContainer) innerContainer.classList.remove('visible');
                 return;
            }
             if (!currentViewer.world.getItemAt(0)) {
                 // console.log("mousemove: Viewer world found, but no item at index 0");
                 if (innerContainer) innerContainer.classList.remove('visible');
                 return;
            }
             if (!window.fitsData) {
                 // console.log("mousemove: No FITS data found");
                 if (innerContainer) innerContainer.classList.remove('visible');
                 return;
            }
             
             // console.log("mousemove: Viewer and FITS data OK"); // Log on success if needed

            // // Ensure WCS is parsed (assuming it's stored in window.parsedWCS after loading)
            // if (!window.parsedWCS && window.fitsData.wcs) {
            //      // console.log("mousemove: Attempting to parse WCS");
            //      try {
            //          window.parsedWCS = parseWCS(window.fitsData.wcs);
            //          // console.log("WCS parsed successfully for coordinate display.");
            //      } catch (e) {
            //          console.error("Failed to parse WCS for coordinate display:", e);
            //          window.parsedWCS = null; // Mark as failed
            //      }
            // }


            // Make sure container is visible
            if (innerContainer) {
                // console.log("mousemove: Adding 'visible' class"); // Optional log
                innerContainer.classList.add('visible');
            } else {
                 // console.log("mousemove: innerContainer not found when trying to make visible");
                 return; // Should not happen if init checks passed
            }

            // Get mouse position relative to the viewer element
            let viewportPoint;
            try {
                // More defensive check for mouseTracker
                if (!currentViewer.mouseTracker) {
                    // console.log("mousemove: currentViewer.mouseTracker is not available.");
                    if (innerContainer) innerContainer.classList.remove('visible');
                    return;
                }
                const mousePos = currentViewer.mouseTracker.getMousePosition(event);
                 if (!mousePos) {
                    // console.log("mousemove: getMousePosition returned null");
                    if (innerContainer) innerContainer.classList.remove('visible');
                    return;
                 }
                viewportPoint = currentViewer.viewport.pointFromPixel(mousePos);
                 if (!viewportPoint) {
                    // console.log("mousemove: pointFromPixel returned null");
                    if (innerContainer) innerContainer.classList.remove('visible');
                     return;
                 }
            } catch (e) {
                console.error("mousemove: Error getting viewport point:", e);
                if (innerContainer) innerContainer.classList.remove('visible');
                return;
            }
            // console.log("mousemove: Got viewport point:", viewportPoint);


            // Check if the point is within the image bounds
             const imageBounds = currentViewer.world.getItemAt(0).getBounds();
             if (!imageBounds) {
                 console.log("mousemove: Could not get image bounds");
                 return;
             }
             // console.log("mousemove: Image bounds:", imageBounds); // Optional log
             
             if (!imageBounds.containsPoint(viewportPoint)) {
                 // console.log("mousemove: Mouse is outside image bounds"); // Optional log
                 if (innerContainer) innerContainer.classList.remove('visible'); 
                 // Reset values or let mouseleave handle it
                 updateValueWithAnimation('coord-x', '-');
                 updateValueWithAnimation('coord-y', '-');
                 updateValueWithAnimation('coord-ra', '-');
                 updateValueWithAnimation('coord-dec', '-');
                 updateValueWithAnimation('coord-value', '-');
                 { const u = document.getElementById('coord-unit'); if (u) u.textContent = ''; }
                 return;
             }

            // Coordinates are in the image coordinate system (0 to width, 0 to height)
            const imageX = Math.round(viewportPoint.x);
            const imageY = Math.round(viewportPoint.y);
            // console.log(`mousemove: Image coords: (${imageX}, ${imageY})`); // Optional log


            // Update pixel coordinates with animation
            updateValueWithAnimation('coord-x', imageX);
            updateValueWithAnimation('coord-y', imageY);

            // Calculate RA/DEC if WCS info is available and parsed
            if (window.parsedWCS) {
                // console.log("mousemove: Calculating RA/DEC"); // Optional log
                try {
                    // Use the pre-parsed WCS object
                    const celestial = pixelToCelestial(imageX, imageY, window.parsedWCS);
                     if (!celestial) {
                         console.log("mousemove: pixelToCelestial returned null/undefined");
                         updateValueWithAnimation('coord-ra', '?'); // Indicate error
                         updateValueWithAnimation('coord-dec', '?');
                     } else {
                        updateValueWithAnimation('coord-ra', celestial.ra.toFixed(4));
                        updateValueWithAnimation('coord-dec', celestial.dec.toFixed(4));
                     }
                } catch (e) {
                     console.error("Error converting pixel to celestial:", e); // Log error
                    updateValueWithAnimation('coord-ra', 'Err'); // Indicate error
                    updateValueWithAnimation('coord-dec', 'Err');
                }
            } else {
                // console.log("mousemove: No parsed WCS for RA/DEC"); // Optional log
                updateValueWithAnimation('coord-ra', '-');
                updateValueWithAnimation('coord-dec', '-');
            }

            // Try to get pixel value using the dedicated function
             // console.log("mousemove: Getting pixel value"); // Optional log
             try {
                 // Use getFitsPixel for potentially complex data access
                 const value = getFitsPixel(imageX, imageY); // Assuming getFitsPixel handles data access logic
                 // console.log(`mousemove: Pixel value raw: ${value}`); // Optional log
                 
                 if (typeof value === 'number' && !isNaN(value)) {
                     // console.log(`mousemove: Pixel value formatted: ${value.toExponential(4)}`); // Optional log
                     updateValueWithAnimation('coord-value', value.toExponential(4));
                     const bunit = getBunit(); // Keep using helper for BUNIT
                     // console.log(`mousemove: Bunit: ${bunit}`); // Optional log
                     { const u = document.getElementById('coord-unit'); if (u) u.textContent = bunit || ''; }
                 } else {
                      // console.log("mousemove: Pixel value is not a valid number"); // Optional log
                      updateValueWithAnimation('coord-value', '-');
                      { const u = document.getElementById('coord-unit'); if (u) u.textContent = ''; }
                 }
             } catch (e) {
                  console.error("Error getting pixel value:", e); // Log error
                 updateValueWithAnimation('coord-value', 'Err'); // Indicate error
                 { const u = document.getElementById('coord-unit'); if (u) u.textContent = ''; }
             }
        });
        
        // Handle mouse leave
        console.log("Adding mouseleave listener for coordinates");
        container.addEventListener('mouseleave', function() {
            // console.log("mouseleave triggered for coordinates"); // Optional log
            // Fade out animation
            if (innerContainer) {
                innerContainer.classList.remove('visible');
            }
            
            // Reset values after animation completes
            setTimeout(() => {
                if (innerContainer && !innerContainer.classList.contains('visible')) {
                    // console.log("Resetting coordinate values on mouseleave timeout"); // Optional log
                    updateValueWithAnimation('coord-x', '-');
                    updateValueWithAnimation('coord-y', '-');
                    updateValueWithAnimation('coord-ra', '-');
                    updateValueWithAnimation('coord-dec', '-');
                    updateValueWithAnimation('coord-value', '-');
                    { const u = document.getElementById('coord-unit'); if (u) u.textContent = ''; }
                }
            }, 300); // Corresponds to CSS transition time
        });
        
        // Make this function available globally
        window.updateCoordinatesDisplay = function() {
            console.log("updateCoordinatesDisplay called");
            // This function can be called when new images are loaded
            const coordsContainer = document.querySelector('.coords-container');
            if (coordsContainer) coordsContainer.classList.remove('visible');
        };
        
        console.log("Coordinates display initialization finished.");
        return coordsDisplay;
    }
    
    // Helper function to get BUNIT from FITS data
    function getBunit() {
        // Check if bunit is available in wcs object
        if (window.fitsData && window.fitsData.wcs && window.fitsData.wcs.bunit) {
            return window.fitsData.wcs.bunit;
        }
        
        // Try parsedWCS if it exists
        if (window.parsedWCS && window.parsedWCS.bunit) {
            return window.parsedWCS.bunit;
        }
        
        // Check if bunit is directly in fitsData
        if (window.fitsData && window.fitsData.bunit) {
            return window.fitsData.bunit;
        }
        
        return '';
    }
    
    // Watch for OpenSeadragon initialization
    function watchForInitialization() {
        // Set a flag to track if initialization has been attempted
        if (window._coordsInitialized) return;
        window._coordsInitialized = true;
        
        console.log("Watching for OpenSeadragon initialization");
        
        // First attempt - delayed start
        setTimeout(initCoordinates, 2000);
        
        // Watch for FITS data changes which indicate a new image has been loaded
        let previousFitsData = null;
        
        // Check periodically for FITS data changes
        const dataCheckInterval = setInterval(function() {
            if (window.fitsData && window.fitsData !== previousFitsData) {
                console.log("FITS data changed, updating coordinates display");
                previousFitsData = window.fitsData;
                initCoordinates();
            }
        }, 2000);
        
        // Stop checking after 5 minutes to prevent resource waste
        setTimeout(function() {
            clearInterval(dataCheckInterval);
        }, 300000);
    }
    
    // Expose remover globally
    window.removeCoordinatesDisplay = removeCoordinatesDisplay;
    // Start watching for initialization
    watchForInitialization();
    
    // Add a dedicated function for manual initialization
    window.initNavigatorCoordinates = function() {
        console.log("Manual initialization of coordinates display");
        return initCoordinates();
    };
    
    // Execute initialization when script loads
    setTimeout(initCoordinates, 1000);
})();





// Function to enable pixel-perfect mode that waits for viewer to be ready
function enablePixelPerfectMode() {
    console.log("Searching for OpenSeadragon viewer...");
    
    // Find the viewer using various methods
    const findViewer = () => {
        // Direct references first
        if (window.viewer && window.viewer.drawer) return window.viewer;
        if (window.tiledViewer && window.tiledViewer.drawer) return window.tiledViewer;
        
        // Search for any property that looks like an OpenSeadragon viewer
        for (const key in window) {
            try {
                const obj = window[key];
                if (obj && 
                    typeof obj === 'object' && 
                    obj.drawer && 
                    obj.viewport && 
                    typeof obj.forceRedraw === 'function') {
                    console.log(`Found viewer at window.${key}`);
                    return obj;
                }
            } catch (e) {
                // Skip any properties that throw errors when accessed
            }
        }
        
        return null;
    };
    
    // Try to find the viewer
    let viewer = findViewer();
    
    // If we can't find it, wait and try again
    if (!viewer) {
        console.log("Viewer not found. Setting up observer to wait for it...");
        
        // Set up a MutationObserver to watch for the viewer being added
        const observer = new MutationObserver((mutations) => {
            // Check if we can find the viewer now
            viewer = findViewer();
            if (viewer) {
                observer.disconnect();
                console.log("Viewer found after waiting!");
                applyPixelMode(viewer);
            }
        });
        
        // Start observing
        observer.observe(document.body, { 
            childList: true, 
            subtree: true 
        });
        
        // Also try again after a delay
        setTimeout(() => {
            if (!viewer) {
                viewer = findViewer();
                if (viewer) {
                    observer.disconnect();
                    console.log("Viewer found after timeout!");
                    applyPixelMode(viewer);
                } else {
                    console.log("Still couldn't find viewer after waiting.");
                }
            }
        }, 2000);
        
        return false;
    }
    
    // If we found the viewer, apply pixel mode
    return applyPixelMode(viewer);
}

// Function to actually apply pixel mode once we have a viewer
function applyPixelMode(viewer) {
    if (!viewer) return false;
    
    console.log("Applying pixel mode to viewer:", viewer);
    
    try {
        // Don't try to set pixelMode property if it's causing errors
        // viewer.pixelMode = true;
        
        // Instead, directly apply the settings we need
        
        // Disable image smoothing on the drawer
        if (viewer.drawer && viewer.drawer.context) {
            viewer.drawer.context.imageSmoothingEnabled = false;
            viewer.drawer.context.mozImageSmoothingEnabled = false;
            viewer.drawer.context.webkitImageSmoothingEnabled = false;
            viewer.drawer.context.msImageSmoothingEnabled = false;
            console.log("Disabled smoothing on drawer context");
        }
        
        // Apply to all current tiles
        if (viewer.tileCache) {
            const tileKeys = Object.keys(viewer.tileCache.cache || {});
            console.log(`Found ${tileKeys.length} tiles in cache`);
            
            tileKeys.forEach(key => {
                const tile = viewer.tileCache.cache[key];
                if (tile && tile.context) {
                    tile.context.imageSmoothingEnabled = false;
                    tile.context.mozImageSmoothingEnabled = false;
                    tile.context.webkitImageSmoothingEnabled = false;
                    tile.context.msImageSmoothingEnabled = false;
                }
            });
        }
        
        // Set up handler for future tiles
        viewer.addHandler('tile-drawn', function(event) {
            if (event.tile && event.tile.context) {
                event.tile.context.imageSmoothingEnabled = false;
                event.tile.context.mozImageSmoothingEnabled = false;
                event.tile.context.webkitImageSmoothingEnabled = false;
                event.tile.context.msImageSmoothingEnabled = false;
            }
        });
        
        // Force a redraw to apply changes
        console.log("Forcing redraw...");
        viewer.forceRedraw();
        
        return true;
    } catch (error) {
        console.error("Error applying pixel mode:", error);
        return false;
    }
}

// Also try to directly modify any canvas elements we can find
function updateAllCanvases() {
    // Find all canvases in the document
    const canvases = document.querySelectorAll('canvas');
    console.log(`Found ${canvases.length} canvas elements`);
    
    canvases.forEach((canvas, index) => {
        try {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.imageSmoothingEnabled = false;
                ctx.mozImageSmoothingEnabled = false;
                ctx.webkitImageSmoothingEnabled = false;
                ctx.msImageSmoothingEnabled = false;
                console.log(`Disabled smoothing on canvas #${index}`);
            }
        } catch (e) {
            console.error(`Error updating canvas #${index}:`, e);
        }
    });
    
    return canvases.length;
}

// Try both approaches
console.log("Starting pixel-perfect mode implementation...");
const viewerResult = enablePixelPerfectMode();
const canvasCount = updateAllCanvases();
console.log(`Applied changes to canvases: ${canvasCount}, viewer update: ${viewerResult}`);



function attachHistogramInteractionWhenReady() {
    const tryAttach = () => {
        const doc = getHistogramDocument();
        const linesCanvas = doc.getElementById('histogram-lines-canvas');
        const minInput = doc.getElementById('min-range-input');
        const maxInput = doc.getElementById('max-range-input');
        if (!linesCanvas || !minInput || !maxInput) return false;

        if (typeof ensureHistogramOverlayReady === 'function') ensureHistogramOverlayReady();

        if (window.histogramScaleInfo && window.histogramScaleInfo.padding) {
            // Remove any previous handlers before re-attaching to prevent multiples
            if (typeof linesCanvas._removeHistogramInteraction === 'function') {
                linesCanvas._removeHistogramInteraction();
            }
            linesCanvas.style.pointerEvents = 'auto';
            linesCanvas.style.position = 'absolute';
            linesCanvas.style.zIndex = '2';
            addHistogramInteraction(linesCanvas, minInput, maxInput);
            return true;
        }
        return false;
    };

    if (tryAttach()) return;

    const onReady = () => {
        if (tryAttach()) {
            getHistogramDocument().removeEventListener('histogram:ready', onReady);
        }
    };
    getHistogramDocument().addEventListener('histogram:ready', onReady);
}

function addHistogramInteraction(canvas, minInput, maxInput) {
    if (!canvas || !minInput || !maxInput) return;
    if (!window.histogramScaleInfo || !window.histogramScaleInfo.padding) return;

    canvas.style.pointerEvents = 'auto';
    canvas.style.cursor = 'default';

    const { padding, histWidth, dataMin, dataRange } = window.histogramScaleInfo;
    if (!isFinite(histWidth) || histWidth <= 0 || !isFinite(dataRange) || dataRange <= 0) return;

    const clamp = (val, lo, hi) => Math.min(hi, Math.max(lo, val));

    const valueToX = (value) => {
        const clamped = clamp(value, dataMin, dataMin + dataRange);
        return padding.left + ((clamped - dataMin) / dataRange) * histWidth;
    };

    const xToValue = (x) => {
        const t = clamp((x - padding.left) / histWidth, 0, 1);
        return dataMin + t * dataRange;
    };

    const getMouseX = (evt) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = evt?.touches?.[0]?.clientX ?? evt?.clientX ?? 0;
        return clientX - rect.left;
    };

    // Debounced apply (safe fallback if debounce missing)
    let debouncedApply;
    try {
        if (typeof debounce === 'function') {
            debouncedApply = debounce(() => { try { applyDynamicRange(); } catch (e) { console.warn(e); } }, 250);
        }
    } catch (_) {}
    if (typeof debouncedApply !== 'function') {
        debouncedApply = () => { try { applyDynamicRange(); } catch (e) { console.warn(e); } };
    }

    const getTargetLine = (mouseX) => {
        const vmin = parseFloat(minInput.value);
        const vmax = parseFloat(maxInput.value);
        const xMin = valueToX(isFinite(vmin) ? vmin : dataMin);
        const xMax = valueToX(isFinite(vmax) ? vmax : dataMin + dataRange);
        const snap = 6;
        const dMin = Math.abs(mouseX - xMin);
        const dMax = Math.abs(mouseX - xMax);
        if (dMin <= snap && dMin <= dMax) return 'min';
        if (dMax <= snap) return 'max';
        return null;
    };

    let dragging = null;

    const handleDown = (evt) => {
        if (!window.histogramScaleInfo) return;
        evt.preventDefault?.();
        const mouseX = getMouseX(evt);
        dragging = getTargetLine(mouseX);
        if (dragging) canvas.style.cursor = 'ew-resize';
    };

    const handleMove = (evt) => {
        if (!window.histogramScaleInfo) return;
        evt.preventDefault?.();
        const mouseX = getMouseX(evt);

        if (!dragging) {
            const target = getTargetLine(mouseX);
            canvas.style.cursor = target ? 'ew-resize' : 'default';
            return;
        }

        let newVal = xToValue(mouseX);
        let curMin = parseFloat(minInput.value);
        let curMax = parseFloat(maxInput.value);
        if (!isFinite(curMin)) curMin = dataMin;
        if (!isFinite(curMax)) curMax = dataMin + dataRange;

        if (dragging === 'min') {
            newVal = clamp(newVal, dataMin, curMax);
            minInput.value = String(newVal);
        } else if (dragging === 'max') {
            newVal = clamp(newVal, curMin, dataMin + dataRange);
            maxInput.value = String(newVal);
        }

        const liveMin = parseFloat(minInput.value);
        const liveMax = parseFloat(maxInput.value);
        if (isFinite(liveMin) && isFinite(liveMax) && typeof drawHistogramLines === 'function') {
            drawHistogramLines(liveMin, liveMax, false);
        }
    };

    const handleUpOrLeave = (evt) => {
        // Only apply if we were actually dragging. Hover/leave alone should do nothing.
        if (dragging) {
            evt?.preventDefault?.();
            dragging = null;
            canvas.style.cursor = 'default';
            debouncedApply(); // apply once per completed drag
        } else {
            canvas.style.cursor = 'default';
        }
    };

    // Mouse
    canvas.addEventListener('mousedown', handleDown);
    canvas.addEventListener('mousemove', handleMove);
    canvas.addEventListener('mouseup', handleUpOrLeave);
    canvas.addEventListener('mouseleave', handleUpOrLeave);
    // Touch
    canvas.addEventListener('touchstart', handleDown, { passive: false });
    canvas.addEventListener('touchmove', handleMove, { passive: false });
    canvas.addEventListener('touchend', handleUpOrLeave, { passive: false });
    canvas.addEventListener('touchcancel', handleUpOrLeave, { passive: false });

    // Cleanup hook so we can rebind safely
    canvas._removeHistogramInteraction = () => {
        canvas.removeEventListener('mousedown', handleDown);
        canvas.removeEventListener('mousemove', handleMove);
        canvas.removeEventListener('mouseup', handleUpOrLeave);
        canvas.removeEventListener('mouseleave', handleUpOrLeave);
        canvas.removeEventListener('touchstart', handleDown);
        canvas.removeEventListener('touchmove', handleMove);
        canvas.removeEventListener('touchend', handleUpOrLeave);
        canvas.removeEventListener('touchcancel', handleUpOrLeave);
        canvas.style.cursor = 'default';
        // no-op if debouncedApply is pending; allow it to run once if already scheduled
    };
}


async function updateHistogramBackground() { // Renamed and made async
    const doc = getHistogramDocument();
    const canvas = doc.getElementById('histogram-bg-canvas'); // Use BG canvas ID
    if (!canvas) {
        console.log('Histogram background canvas not found, skipping update');
        return;
    }
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    try {
        const dataSource = await getHistogramPixelDataSource();
        if (dataSource.source === 'server_needed') {
            console.log('Client-side data unavailable or not ideal, fetching histogram from server.', dataSource.message);
            const minEl = doc.getElementById('min-range-input');
            const maxEl = doc.getElementById('max-range-input');
            const uiMin = minEl ? parseFloat(minEl.value) : null;
            const uiMax = maxEl ? parseFloat(maxEl.value) : null;
            const haveUi = isFinite(uiMin) && isFinite(uiMax) && uiMin < uiMax;
            fetchServerHistogram(haveUi ? uiMin : null, haveUi ? uiMax : null); // draws if canvas exists
            return;
        }
        if (dataSource.source === 'error' || dataSource.source === 'unavailable') {
            // ... unchanged error text drawing ...
            return;
        }

        const {
            pixels: pixelDataForHist, 
            width: dataWidth,
            height: dataHeight,
            dataMin: sourceDataMin, 
            dataMax: sourceDataMax
        } = dataSource;

        const canvasFullWidth = canvas.width;
        const canvasFullHeight = canvas.height;

        const numBins = 100;
        const uiMinStr = doc.getElementById('min-range-input')?.value;
        const uiMaxStr = doc.getElementById('max-range-input')?.value;
        const uiMin = uiMinStr != null ? parseFloat(uiMinStr) : null;
        const uiMax = uiMaxStr != null ? parseFloat(uiMaxStr) : null;
        const haveUi = isFinite(uiMin) && isFinite(uiMax) && uiMin < uiMax;
        const histUIMin = haveUi ? uiMin : ((typeof sourceDataMin === 'number') ? sourceDataMin : 0);
        const histUIMax = haveUi ? uiMax : ((typeof sourceDataMax === 'number') ? sourceDataMax : 1);
        const histDisplayRange = Math.max(1e-12, histUIMax - histUIMin);

        const bins = new Array(numBins).fill(0);
        let validPixelCount = 0;
        const values = pixelDataForHist;
        const n = values.length;
        for (let i = 0; i < n; i++) {
            const v = values[i];
            if (!isFinite(v)) continue;
            const norm = (v - histUIMin) / histDisplayRange;
            if (norm < 0 || norm > 1) continue;
            const idx = Math.min(numBins - 1, Math.max(0, Math.floor(norm * numBins)));
            bins[idx] += 1;
            validPixelCount++;
        }

        let maxBinCount = 0;
        for (let i = 0; i < numBins; i++) maxBinCount = Math.max(maxBinCount, bins[i]);
        if (maxBinCount === 0) {
            ctx.fillStyle = '#aaa'; ctx.font = '14px Arial'; ctx.textAlign = 'center';
            ctx.fillText('No pixels in selected range', canvasFullWidth / 2, canvasFullHeight / 2);
            return;
        }

        const logMaxBinCount = Math.log(maxBinCount + 1);

        const padding = { top: 30, right: 20, bottom: 40, left: 60 };
        const histCanvasRenderWidth = canvasFullWidth - padding.left - padding.right;
        const histCanvasRenderHeight = canvasFullHeight - padding.top - padding.bottom;

        // Axes + ticks + labels (unchanged)...

        // Bars (opaque color)
        ctx.fillStyle = 'rgb(0, 180, 0)'; // alpha = 1
        const barWidth = histCanvasRenderWidth / numBins;
        for (let i = 0; i < numBins; i++) {
            const binCount = bins[i];
            if (binCount === 0) continue;
            const logHeight = Math.log(binCount + 1) / logMaxBinCount * histCanvasRenderHeight;
            const xRect = padding.left + i * barWidth;
            const yRect = canvasFullHeight - padding.bottom - logHeight;
            ctx.fillRect(xRect, yRect, barWidth - 1, logHeight);
        }

        // Expose scale info and draw lines (unchanged)...
        window.histogramScaleInfo = {
            padding,
            histWidth: histCanvasRenderWidth,
            histHeight: histCanvasRenderHeight,
            dataMin: histUIMin,
            dataRange: histDisplayRange,
            canvasWidth: canvasFullWidth,
            canvasHeight: canvasFullHeight
        };

        const haveOverlay = typeof ensureHistogramOverlayReady === 'function' && ensureHistogramOverlayReady();
        const minInput = doc.getElementById('min-range-input');
        const maxInput = doc.getElementById('max-range-input');

        let lineMin = (minInput && isFinite(parseFloat(minInput.value))) ? parseFloat(minInput.value) : histUIMin;
        let lineMax = (maxInput && isFinite(parseFloat(maxInput.value))) ? parseFloat(maxInput.value) : (histUIMin + histDisplayRange);
        lineMin = Math.max(histUIMin, Math.min(histUIMin + histDisplayRange, lineMin));
        lineMax = Math.max(histUIMin, Math.min(histUIMin + histDisplayRange, lineMax));

        if (haveOverlay && typeof drawHistogramLines === 'function') {
            drawHistogramLines(lineMin, lineMax, false);
        }

        doc.dispatchEvent(new CustomEvent('histogram:ready'));
    } catch (error) {
        console.error('Error updating histogram background:', error);
        if (canvas) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#aaa'; ctx.font = '14px Arial'; ctx.textAlign = 'center';
            ctx.fillText('Error updating histogram', canvas.width / 2, canvas.height / 2);
        }
    }
}


function drawHistogramLines(targetMinVal, targetMaxVal, animate = false) {
    const doc = getHistogramDocument();
    const canvas = doc.getElementById('histogram-lines-canvas');
    if (!canvas) return;

    // Make sure the overlay canvas matches the background and is on top
    if (typeof ensureHistogramOverlayReady === 'function') {
        ensureHistogramOverlayReady();
    }

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Prefer window-scoped scale info (where the background/server draw stores it)
    const scale = (typeof window !== 'undefined' && window.histogramScaleInfo)
        ? window.histogramScaleInfo
        : (typeof histogramScaleInfo !== 'undefined' ? histogramScaleInfo : null);

    if (!scale || !scale.padding) {
        console.warn('Histogram scale info not available for drawing lines.');
        return;
    }

    const { padding, histWidth, dataMin, dataRange } = scale;

    if (!isFinite(histWidth) || histWidth <= 0 || !isFinite(dataRange) || dataRange <= 0) {
        return;
    }

    const valueToX = (value) => {
        const clamped = Math.max(dataMin, Math.min(dataMin + dataRange, value));
        return padding.left + ((clamped - dataMin) / dataRange) * histWidth;
    };

    const minX = valueToX(targetMinVal);
    const maxX = valueToX(targetMaxVal);

    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 2;

    // Min (Blue)
    if (isFinite(minX)) {
        ctx.strokeStyle = 'rgba(50, 150, 255, 0.9)';
        ctx.beginPath();
        ctx.moveTo(minX, padding.top);
        ctx.lineTo(minX, height - padding.bottom);
        ctx.stroke();
    }

    // Max (Red)
    if (isFinite(maxX)) {
        ctx.strokeStyle = 'rgba(255, 80, 80, 0.9)';
        ctx.beginPath();
        ctx.moveTo(maxX, padding.top);
        ctx.lineTo(maxX, height - padding.bottom);
        ctx.stroke();
    }
}

// Modify requestHistogramUpdate
function requestHistogramUpdate() {
    // If an update is already queued or running, do nothing for now
    // The finally block of updateHistogramBackground will handle queuing.
    // We might need more sophisticated debouncing/throttling here if needed.
    if (isUpdatingHistogram || histogramUpdateTimer) {
        histogramUpdateRequested = true;
        return;
    }

    // Set flag and potentially use a timer for debouncing
    isUpdatingHistogram = true;
    histogramUpdateRequested = false; // Clear request flag

    // Update background first
    updateHistogramBackground();
    
    // Draw lines based on current input values (no animation needed here as it follows background)
    const doc = getHistogramDocument();
    const minInput = doc.getElementById('min-range-input');
    const maxInput = doc.getElementById('max-range-input');
    if (minInput && maxInput) {
        const currentMin = parseFloat(minInput.value);
        const currentMax = parseFloat(maxInput.value);
        if (!isNaN(currentMin) && !isNaN(currentMax)) {
            drawHistogramLines(currentMin, currentMax, false); 
        }
    }
    
    // Reset flags after completion (or use finally block in updateHistBG)
    isUpdatingHistogram = false; 
    if (histogramUpdateRequested) { // Check if a new request came in during update
        histogramUpdateTimer = setTimeout(() => {
             histogramUpdateTimer = null;
             requestHistogramUpdate();
        }, 100); // Small delay before next update
    }
}

function refreshHistogramOnPaneActivate() {
    try {
        const doc = getHistogramDocument();
        const popup = doc.getElementById('dynamic-range-popup');
        if (!popup || popup.style.display === 'none') return;
        if (typeof showDynamicRangePopup === 'function') {
            showDynamicRangePopup({ forceRebind: true });
        } else {
            requestHistogramUpdate();
        }
    } catch (_) {}
}

function fetchServerHistogram(minVal = null, maxVal = null, bins = 1024) {
    // Canvas is optional for data fetch; only used if present for drawing
    const doc = getHistogramDocument();
    const canvas = doc.getElementById('histogram-bg-canvas');
    let ctx = null;
    if (canvas) {
        ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#aaa'; ctx.font = '14px Arial'; ctx.textAlign = 'center';
        ctx.fillText('Loading histogram data...', canvas.width / 2, canvas.height / 2);
    }

    let fetchUrl = `/fits-histogram/?bins=${encodeURIComponent(bins)}`;
    if (minVal !== null && maxVal !== null) {
        fetchUrl += `&min_val=${encodeURIComponent(minVal)}&max_val=${encodeURIComponent(maxVal)}`;
    }
    console.log("Fetching server histogram from:", fetchUrl);

    return apiFetch(fetchUrl)
        .then(response => {
            if (!response.ok) {
                return response.text().then(text => {
                    throw new Error(`Server error: ${response.status} ${response.statusText}. ${text}`);
                });
            }
            return response.json();
        })
        .then(data => {
            if (data.error) throw new Error(data.error);

            // If canvas exists, draw; otherwise just resolve with data
            if (canvas && typeof drawServerHistogram === 'function') {
                drawServerHistogram(data);

                // If min/max inputs exist, draw lines too
                const minInput = doc.getElementById('min-range-input');
                const maxInput = doc.getElementById('max-range-input');
                if (minInput && maxInput) {
                    const currentMin = parseFloat(minInput.value);
                    const currentMax = parseFloat(maxInput.value);
                    if (!isNaN(currentMin) && !isNaN(currentMax)) {
                        drawHistogramLines(currentMin, currentMax, false);
                    }
                }
            }

            return data;
        })
        .catch(error => {
            console.error('Error fetching or processing server histogram:', error);
            if (ctx && canvas) {
                const message = error.message || 'Unknown error';
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#aaa'; ctx.font = '14px Arial'; ctx.textAlign = 'center';
                const maxTextWidth = canvas.width - 20;
                const words = `Error: ${message}`.split(' ');
                const lines = [];
                let currentLine = '';
                for (const word of words) {
                    const testLine = currentLine + word + ' ';
                    if (ctx.measureText(testLine).width > maxTextWidth && currentLine.length > 0) {
                        lines.push(currentLine.trim());
                        currentLine = word + ' ';
                    } else {
                        currentLine = testLine;
                    }
                }
                lines.push(currentLine.trim());
                let y = canvas.height / 2 - (lines.length - 1) * 7;
                for (const line of lines) {
                    ctx.fillText(line, canvas.width / 2, y);
                    y += 15;
                }
            }
            throw error;
        });
}

// static/main.js

// NEW Helper function to get pixel data for histogram
function getHistogramPixelDataSource() {
    return new Promise((resolve, reject) => {
        // ---- CHECK CACHE FIRST ---- START ----
        if (window.histogramOverviewPixelData && 
            window.histogramOverviewPixelData.pixels && 
            (window.tiledViewer && typeof window.tiledViewer.isOpen === 'function' && window.tiledViewer.isOpen())) {
            
            let useDataMin = window.histogramOverviewPixelData.dataMin;
            let useDataMax = window.histogramOverviewPixelData.dataMax;

            // If cached overview lacks min/max, try to get them from current window.fitsData
            if ((useDataMin === null || useDataMax === null || typeof useDataMin === 'undefined' || typeof useDataMax === 'undefined') && 
                window.fitsData && 
                typeof window.fitsData.min_value !== 'undefined' && 
                typeof window.fitsData.max_value !== 'undefined') {
                console.log("Cached overview pixel data was missing min/max, updating from current window.fitsData for histogram.");
                useDataMin = window.fitsData.min_value;
                useDataMax = window.fitsData.max_value;
                // Update the cache with these values for next time
                window.histogramOverviewPixelData.dataMin = useDataMin;
                window.histogramOverviewPixelData.dataMax = useDataMax;
            }
            
            // Only proceed if we have valid dataMin and dataMax
            if (useDataMin !== null && useDataMax !== null && typeof useDataMin !== 'undefined' && typeof useDataMax !== 'undefined') {
                console.log('Histogram source: Using Cached Overview Pixel Data');
                resolve({
                    source: 'overview_cached', 
                    pixels: window.histogramOverviewPixelData.pixels,
                    width: window.histogramOverviewPixelData.width,
                    height: window.histogramOverviewPixelData.height,
                    dataMin: useDataMin,
                    dataMax: useDataMax,
                    pixelNativeMin: window.histogramOverviewPixelData.pixelNativeMin,
                    pixelNativeMax: window.histogramOverviewPixelData.pixelNativeMax
                });
                return; // IMPORTANT: Exit early if cached data is used
            } else {
                console.warn("Cached overview pixel data is present but still lacks essential dataMin/dataMax. Cannot use for client-side histogram. Will try other sources.");
            }
        }
        // ---- CHECK CACHE FIRST ---- END ----

        // Case 1: Full FITS data is available and seems valid
        if (window.fitsData && window.fitsData.data && Array.isArray(window.fitsData.data) && window.fitsData.data.length > 0 && Array.isArray(window.fitsData.data[0]) && window.fitsData.data[0].length > 0) {
            console.log('Histogram source: Full FITS data (window.fitsData.data)');
            resolve({
                source: 'fitsData',
                pixels: window.fitsData.data, // 2D array
                width: window.fitsData.width,
                height: window.fitsData.height,
                dataMin: window.fitsData.min_value,
                dataMax: window.fitsData.max_value
            });
            return; 
        } 
        // Case 2: Tiled mode, overview image in DOM (fallback if cache failed or not applicable)
        // This path is less ideal now that we have the cache.
        else if (window.fitsData && window.fitsData.overview && (window.tiledViewer && window.tiledViewer.isOpen())) {
            console.log('Histogram source: Attempting Overview image from DOM (fallback for tiled view).');
            
            let attemptCount = 0;
            const maxAttempts = 2; // Reduced attempts as this is a less preferred fallback
            const retryDelay = 200; 

            function findAndProcessOverview() {
                attemptCount++;
                const overviewContainer = document.getElementById('overview-container');
                const overviewImgElement = overviewContainer ? overviewContainer.querySelector('img') : null;

                const processOverview = () => {
                    if (overviewImgElement && overviewImgElement.complete && overviewImgElement.naturalWidth > 0) {
                        try {
                            const offscreenCanvas = document.createElement('canvas');
                            const imgWidth = overviewImgElement.naturalWidth;
                            const imgHeight = overviewImgElement.naturalHeight;
                            offscreenCanvas.width = imgWidth;
                            offscreenCanvas.height = imgHeight;
                            const offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
                            if (!offscreenCtx) {
                                console.error("Could not get 2D context for offscreen canvas in DOM overview processing.");
                                resolve({ source: 'error', message: 'Error processing overview data from DOM (no context)' });
                                return;
                            }
                            offscreenCtx.drawImage(overviewImgElement, 0, 0);
                            const imageDataArray = offscreenCtx.getImageData(0, 0, imgWidth, imgHeight).data;
                            const overviewPixels2D = [];
                            for (let y = 0; y < imgHeight; y++) {
                                const row = [];
                                for (let x = 0; x < imgWidth; x++) {
                                    row.push(imageDataArray[(y * imgWidth + x) * 4]);
                                }
                                overviewPixels2D.push(row);
                            }
                            console.log("Successfully processed overview image from DOM for histogram.");
                            // Try to populate min/max from window.fitsData if available
                            const dataMinValue = (window.fitsData && typeof window.fitsData.min_value !== 'undefined') ? window.fitsData.min_value : null;
                            const dataMaxValue = (window.fitsData && typeof window.fitsData.max_value !== 'undefined') ? window.fitsData.max_value : null;

                            if (dataMinValue !== null && dataMaxValue !== null) {
                                resolve({
                                    source: 'overview_dom',
                                    pixels: overviewPixels2D,
                                    width: imgWidth,
                                    height: imgHeight,
                                    dataMin: dataMinValue, 
                                    dataMax: dataMaxValue,
                                    pixelNativeMin: 0,
                                    pixelNativeMax: 255
                                });
                            } else {
                                console.warn("Could not determine dataMin/dataMax when processing DOM overview. Histogram may be incorrect.");
                                resolve({ source: 'unavailable', message: 'Overview (DOM) processed but min/max FITS values missing.' });
                            }
                        } catch (e) {
                            console.error('Error processing overview image from DOM for histogram source:', e);
                            resolve({ source: 'error', message: 'Error processing overview data from DOM' });
                        }
                    } else {
                        console.warn('Overview image element (DOM) found but not ready. Resolving as unavailable.');
                        resolve({ source: 'unavailable', message: 'Overview image (DOM) not ready' });
                    }
                };

                if (overviewImgElement) {
                    if (overviewImgElement.complete && overviewImgElement.naturalWidth > 0) {
                        processOverview();
                    } else {
                        console.log(`Overview image (DOM) not yet loaded (attempt ${attemptCount}), waiting for onload...`);
                        overviewImgElement.onload = () => {
                            console.log('Overview image (DOM) loaded via .onload callback.');
                            processOverview();
                        };
                        overviewImgElement.onerror = () => {
                            console.error('Error loading overview image (DOM) for histogram via .onerror.');
                            resolve({ source: 'server_needed', message: 'Overview image (DOM) load error, server histogram fallback.'});
                        };
                    }
                } else { // overviewImgElement not found
                    if (attemptCount < maxAttempts) {
                        console.log(`Overview image element (DOM) not found (attempt ${attemptCount}/${maxAttempts}). Retrying in ${retryDelay}ms...`);
                        setTimeout(findAndProcessOverview, retryDelay);
                    } else {
                        console.warn(`Overview image element (DOM) not found after ${maxAttempts} attempts. Likely hidden.`);
                        // If cache also failed, and we are here, then server might be needed if in tiled mode.
                         if (window.tiledViewer && window.tiledViewer.isOpen()) {
                            resolve({ source: 'server_needed', message: 'Overview (DOM) gone, and cache failed, server histogram needed.'});
                        } else {
                            resolve({ source: 'unavailable', message: 'Overview (DOM) gone, not tiled mode.' });
                        }
                    }
                }
            }
            findAndProcessOverview(); 
        } 
        // Fallback: If no other source, and tiled viewer is active, definitely request server histogram.
        else if (window.tiledViewer && typeof window.tiledViewer.isOpen === 'function' && window.tiledViewer.isOpen()){
             console.log('No suitable client-side data source for histogram, but tiled view is active. Requesting server histogram.');
             resolve({ source: 'server_needed', message: 'No client data, server histogram needed for tiled view.' });
        } 
        // Absolute fallback if no FITS data at all, or not tiled view and no other source found.
        else {
            console.log('No suitable FITS data or overview found for histogram (and not forcing server request).');
            resolve({ source: 'unavailable', message: 'No FITS data available for histogram processing.' });
        }
    });
}
// Add this function to static/main.js
async function fetchRgbCutouts(ra, dec, catalogName, galaxyName = "UnknownGalaxy") {
    if (typeof ra === 'undefined' || typeof dec === 'undefined' || !catalogName) {
        showNotification("RA, Dec, or Catalog Name is missing. Cannot generate RGB cutouts.", 3000, "error");
        console.error("RGB Cutouts: Missing parameters", { ra, dec, catalogName });
        return;
    }

    showNotification(true, "Generating RGB panels...");
    console.log(`Fetching RGB cutouts for RA: ${ra}, Dec: ${dec}, Catalog: ${catalogName}, Galaxy: ${galaxyName}`);

    let endpointUrl = `/generate-rgb-cutouts/?ra=${ra}&dec=${dec}&catalog_name=${encodeURIComponent(catalogName)}`;
    if (galaxyName && galaxyName !== "UnknownGalaxy") {
        endpointUrl += `&galaxy_name=${encodeURIComponent(galaxyName)}`;
    }

    try {
        const response = await apiFetch(endpointUrl);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || `Failed to generate RGB cutouts (HTTP ${response.status})`);
        }

        if (data.url) {
            console.log("RGB cutouts generated:", data);
            displayRgbCutoutImage(data.url, data.filename, data.data_found_summary, "RGB Cutout Panels");
        } else {
            throw new Error("Received success, but no image URL in response for RGB cutouts.");
        }

    } catch (error) {
        console.error("Error fetching RGB cutouts:", error);
        showNotification(`Error: ${error.message}`, 4000, "error");
    } finally {
        showNotification(false);
    }
}
function displayRgbCutoutImage(imageUrl, filename, dataFoundSummary, titleText = "RGB Cutout Panels") {
    closeSedContainer();
    let popup = document.getElementById('rgb-cutout-popup');

    if (popup) { // If popup exists, update its image and make sure it's visible
        const imgElement = popup.querySelector('img');
        if (imgElement) {
            imgElement.src = imageUrl + '?' + new Date().getTime(); // Add cache buster
        }
        popup.style.display = 'flex'; // Make sure it's visible
        popup.style.bottom = '0px'; // Slide in if it was somehow hidden
        return;
    }

    // Create new popup - using original CSS styles
    popup = document.createElement('div');
    popup.id = 'rgb-cutout-popup';
    Object.assign(popup.style, {
        position: 'fixed',
        bottom: '-100vh', // Start off-screen for slide-in animation
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%', 
        maxWidth: '100%', 
        height: 'auto', 
        minHeight: '250px', // Adjusted min-height
        maxHeight: '50vh', 
        backgroundColor: ' rgba(0,0,0,0.8)', 
        borderRadius: '10px 10px 0 0', 
        padding: '15PX 0PX', // General padding
        zIndex: '300002', 
        boxSizing: 'border-box',
        boxShadow: '0 -5px 20px rgba(0,0,0,0.7)', 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center',
        transition: 'bottom 0.4s ease-out' 
    });

    // Header container for title and buttons
    const headerContainer = document.createElement('div');
    Object.assign(headerContainer.style, {
        width: '100%',
        display: 'flex',
        justifyContent: 'space-between', // Puts title left, close button right
        alignItems: 'center',
        marginBottom: '10px', // Space below header
        paddingLeft: '5px', // Align title a bit from edge
        paddingRight: '5px' // Align close button a bit from edge
    });
    
    const title = document.createElement('h3');
    title.className = 'rgb-popup-title';
    title.textContent = "";
    Object.assign(title.style, {
        margin: '0', // Remove default margins
        color: '#eee',
        fontFamily: 'Arial, sans-serif',
        fontSize: '16px', // Slightly smaller title
        fontWeight: 'bold',
        textAlign: 'left' // Align title to the left within its space
    });

    // Button container for right-aligned buttons
    const buttonContainer = document.createElement('div');
    Object.assign(buttonContainer.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '10px' // Space between buttons
    });

    // Create Save Button
    const saveButton = document.createElement('button');
    saveButton.title = 'Save Panel Image';
    Object.assign(saveButton.style, {
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '5px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
    });
    // SVG icon for save (corrected)
    saveButton.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#cccccc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17,21 17,13 7,13 7,21"></polyline><polyline points="7,3 7,8 15,8"></polyline></svg>`;
    saveButton.onmouseover = () => { saveButton.querySelector('svg').style.stroke = '#ffffff'; };
    saveButton.onmouseout = () => { saveButton.querySelector('svg').style.stroke = '#cccccc'; };

    // Onclick handler for downloading the image
    saveButton.onclick = () => {
        if (!imageUrl) {
            showNotification('Image URL is not available.', 'error');
            return;
        }
        const link = document.createElement('a');
        link.href = imageUrl;
        link.download = filename || 'rgb_cutout_panel.png'; // Use provided filename or a default
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showNotification('Image download started.', 'success');
    };

    const closeButton = document.createElement('button');
    closeButton.textContent = '×';
    Object.assign(closeButton.style, {
        backgroundColor: 'transparent',
        border: 'none',
        color: '#aaa',
        fontSize: '28px', // Larger close button
        cursor: 'pointer',
        padding: '0 5px', // Padding around X
        lineHeight: '1',
        fontWeight: 'bold'
    });
    closeButton.onmouseover = () => { closeButton.style.color = '#fff'; };
    closeButton.onmouseout = () => { closeButton.style.color = '#aaa'; };
    closeButton.onclick = () => {
        popup.style.bottom = '-100vh'; 
        setTimeout(() => {
            const currentPopup = document.getElementById('rgb-cutout-popup');
            if (currentPopup === popup && currentPopup.parentNode) {
                currentPopup.parentNode.removeChild(currentPopup);
            }
        }, 400); 
    };

    headerContainer.appendChild(title);
    buttonContainer.appendChild(saveButton); // Add save button to container
    buttonContainer.appendChild(closeButton); // Add close button to container
    headerContainer.appendChild(buttonContainer); // Add button container to header
    
    popup.appendChild(headerContainer);

    // Image container using original styles
    const imageContainer = document.createElement('div');
    Object.assign(imageContainer.style, {
        margin: '0px 200px 0 200px', // Padding around X
        textAlign: 'center',
    });

    const img = document.createElement('img');
    img.src = imageUrl + '?' + new Date().getTime(); 
    img.alt = filename;
    Object.assign(img.style, {
        maxWidth: '100%',
        maxHeight: '100%', 
        display: 'block', 
        margin: '0 auto' 
    });
    imageContainer.appendChild(img);
    popup.appendChild(imageContainer);
    
    document.body.appendChild(popup);

    // Trigger slide-in animation
    setTimeout(() => {
        popup.style.bottom = '0px'; 
    }, 50); 
}

// Method 1: Create a separate function to close the popup
function closeRgbCutoutPopup() {
    const popup = document.getElementById('rgb-cutout-popup');
    if (popup) {
        popup.style.bottom = '-100vh'; 
        setTimeout(() => {
            const currentPopup = document.getElementById('rgb-cutout-popup');
            if (currentPopup && currentPopup.parentNode) {
                currentPopup.parentNode.removeChild(currentPopup);
            }
        }, 400); 
    }
}

// Method 2: Directly trigger the close button click
function triggerRgbPopupClose() {
    const popup = document.getElementById('rgb-cutout-popup');
    if (popup) {
        const closeButton = popup.querySelector('button[style*="font-size: 28px"]'); // Find close button by style
        if (closeButton) {
            closeButton.click();
        }
    }
}

// Method 3: More reliable - find close button by content
function clickRgbPopupCloseButton() {
    const popup = document.getElementById('rgb-cutout-popup');
    if (popup) {
        const buttons = popup.querySelectorAll('button');
        const closeButton = Array.from(buttons).find(btn => btn.textContent === '×');
        if (closeButton) {
            closeButton.click();
        }
    }
}

// Method 4: Check if popup exists and is visible
function isRgbPopupOpen() {
    const popup = document.getElementById('rgb-cutout-popup');
    return popup && popup.style.display !== 'none' && popup.style.bottom === '0px';
}

// Usage examples:
// closeRgbCutoutPopup(); // Direct close
// triggerRgbPopupClose(); // Simulate button click
// clickRgbPopupCloseButton(); // Find and click close button
// if (isRgbPopupOpen()) { closeRgbCutoutPopup(); } // Conditional close


// static/main.js

// ... at the very end of the file

function getImageHeightForTransforms() {
    try {
        const height = window?.fitsData?.height;
        if (typeof height === 'number' && isFinite(height)) return height;
        const header = window?.fitsData?.wcs;
        if (header) {
            const get = (k) => (k in header ? header[k]
                : (k.toUpperCase() in header ? header[k.toUpperCase()]
                : (k.toLowerCase() in header ? header[k.toLowerCase()] : undefined)));
            const axis2 = Number(get('NAXIS2'));
            if (isFinite(axis2)) return axis2;
        }
    } catch (_) {}
    return null;
}

// For WCS lock only: determine whether we need to flip Y when mapping between display pixels and WCS pixels.
// We intentionally DO NOT use determinant<0 here because many headers have CDELT1<0 (RA increases left),
// which flips handedness but does not mean the Y axis should be inverted (ALMA moment maps are common).
function getFlipYForWcsLock() {
    // Prefer the backend's analyze_wcs_orientation() decision (cached on fitsData.flip_y),
    // because WCS-lock mapping must match the actual displayed orientation.
    try {
        const fy = window?.fitsData?.flip_y;
        if (typeof fy === 'boolean') return fy;
    } catch (_) {}
    // Fallback: heuristic from header (legacy)
    try {
        const header = window?.fitsData?.wcs;
        if (!header) return false;
        const get = (k) => (k in header ? header[k]
            : (k.toUpperCase() in header ? header[k.toUpperCase()]
            : (k.toLowerCase() in header ? header[k.toLowerCase()] : undefined)));
        let cd22;
        if (get('CD2_2') !== undefined) {
            cd22 = Number(get('CD2_2'));
        } else if (get('PC2_2') !== undefined) {
            const pc22 = Number(get('PC2_2'));
            const cdelt2 = Number(get('CDELT2'));
            cd22 = pc22 * cdelt2;
        } else if (get('CDELT2') !== undefined) {
            cd22 = Number(get('CDELT2'));
        }
        if (Number.isFinite(cd22)) {
            return cd22 < 0;
        }
    } catch (_) {}
    return false;
}

function convertDisplayPixelToWcsInputForWcsLock(x, y) {
    const height = getImageHeightForTransforms();
    const flipY = getFlipYForWcsLock();
    const px = typeof x === 'number' ? x : Number(x);
    const py = typeof y === 'number' ? y : Number(y);
    if (!flipY || height == null || !isFinite(py)) return { x: px, y: py };
    return { x: px, y: height - 1 - py };
}

function convertWcsPixelToDisplayOutputForWcsLock(x, y) {
    const height = getImageHeightForTransforms();
    const flipY = getFlipYForWcsLock();
    const px = typeof x === 'number' ? x : Number(x);
    const py = typeof y === 'number' ? y : Number(y);
    if (!flipY || height == null || !isFinite(py)) return { x: px, y: py };
    return { x: px, y: height - 1 - py };
}

function convertDisplayPixelToWcsInput(x, y) {
    const height = getImageHeightForTransforms();
    const flipY = !!window?.fitsData?.flip_y;
    const px = typeof x === 'number' ? x : Number(x);
    const py = typeof y === 'number' ? y : Number(y);
    if (!flipY || height == null || !isFinite(py)) {
        return { x: px, y: py };
    }
    return { x: px, y: height - 1 - py };
}

function convertWcsPixelToDisplayOutput(x, y) {
    const height = getImageHeightForTransforms();
    const flipY = !!window?.fitsData?.flip_y;
    const px = typeof x === 'number' ? x : Number(x);
    const py = typeof y === 'number' ? y : Number(y);
    if (!flipY || height == null || !isFinite(py)) {
        return { x: px, y: py };
    }
    return { x: px, y: height - 1 - py };
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWorldToPixelBatch(points, signal) {
    if (!Array.isArray(points) || points.length === 0) return null;
    try {
        // Always bind conversion to the current pane's file/HDU so multi-panel sync can't drift
        // due to stale session context.
        const rawPath = window.currentFitsFile || window?.fitsData?.filename || null;
        const filepath = (typeof rawPath === 'string') ? rawPath : null;
        const hdu = (typeof window.currentHduIndex === 'number') ? window.currentHduIndex : null;
        const response = await apiFetch('/world-to-pixel/?origin=top', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal,
            body: JSON.stringify({
                points,
                filepath: filepath || undefined,
                hdu: (typeof hdu === 'number') ? hdu : undefined,
                origin: 'top'
            })
        });
        if (!response.ok) return null;
        return await response.json();
    } catch (err) {
        console.warn('[wcs] world-to-pixel request failed', err);
        return null;
    }
}

async function convertWorldQuadViaBackend(worldQuad, opts) {
    if (!Array.isArray(worldQuad) || worldQuad.length === 0) return [];
    const signal = opts && opts.signal;
    const payloadPoints = [];
    worldQuad.forEach((world, idx) => {
        if (!world || !isFinite(world.ra) || !isFinite(world.dec)) return;
        payloadPoints.push({ ra: world.ra, dec: world.dec, index: idx });
    });
    if (!payloadPoints.length) return [];
    const data = await fetchWorldToPixelBatch(payloadPoints, signal);
    if (!data || !Array.isArray(data.pixels)) return [];
    const points = [];
    data.pixels.forEach(entry => {
        if (!entry || !entry.valid || !isFinite(entry.x) || !isFinite(entry.y)) return;
        const disp = convertWcsPixelToDisplayOutputForWcsLock(entry.x, entry.y);
        if (!isFinite(disp.x) || !isFinite(disp.y)) return;
        points.push({ x: disp.x, y: disp.y });
    });
    return points;
}

function convertWorldQuadViaFallback(worldQuad) {
    if (!Array.isArray(worldQuad) || worldQuad.length === 0) return [];
    const pts = [];
    worldQuad.forEach(world => {
        if (!world || !isFinite(world.ra) || !isFinite(world.dec)) return;
        try {
            const parsed = getOrCreateParsedWcsForSync();
            if (parsed && parsed.hasWCS && typeof parsed.worldToPixels === 'function') {
                const raw = parsed.worldToPixels(world.ra, world.dec);
                if (raw && isFinite(raw.x) && isFinite(raw.y)) {
                    const disp = convertWcsPixelToDisplayOutputForWcsLock(raw.x, raw.y);
                    if (disp && isFinite(disp.x) && isFinite(disp.y)) { pts.push(disp); return; }
                }
            }
        } catch (_) {}
        try {
            const header = window?.fitsData?.wcs;
            if (header) {
                const raw2 = worldToPixelFromHeaderForWcsLock(header, world.ra, world.dec);
                if (raw2 && isFinite(raw2.x) && isFinite(raw2.y)) {
                    const disp2 = convertWcsPixelToDisplayOutputForWcsLock(raw2.x, raw2.y);
                    if (disp2 && isFinite(disp2.x) && isFinite(disp2.y)) pts.push(disp2);
                }
            }
        } catch (_) {}
    });
    return pts;
}

function pixelsToWorldFromHeader(header, x, y) {
    try {
        if (!header) return null;
        const get = (k) => (k in header ? header[k]
            : (k.toUpperCase() in header ? header[k.toUpperCase()]
            : (k.toLowerCase() in header ? header[k.toLowerCase()] : undefined)));
        const ctype1 = String(get('CTYPE1') || '');
        const ctype2 = String(get('CTYPE2') || '');
        if (!ctype1 || !ctype2) return null;
        const D2R = Math.PI / 180.0;
        const R2D = 180.0 / Math.PI;
        const crval1 = Number(get('CRVAL1'));
        const crval2 = Number(get('CRVAL2'));
        const crpix1 = Number(get('CRPIX1'));
        const crpix2 = Number(get('CRPIX2'));
        let cd11 = get('CD1_1'); let cd12 = get('CD1_2');
        let cd21 = get('CD2_1'); let cd22 = get('CD2_2');
        if (cd11 === undefined || cd22 === undefined) {
            const cdelt1 = Number(get('CDELT1') ?? 1);
            const cdelt2 = Number(get('CDELT2') ?? 1);
            cd11 = Number(cd11 ?? cdelt1);
            cd12 = Number(cd12 ?? 0);
            cd21 = Number(cd21 ?? 0);
            cd22 = Number(cd22 ?? cdelt2);
        } else {
            cd11 = Number(cd11); cd12 = Number(cd12 || 0);
            cd21 = Number(cd21 || 0); cd22 = Number(cd22);
        }
        if (![crval1, crval2, crpix1, crpix2, cd11, cd12, cd21, cd22].every(v => Number.isFinite(v))) return null;
        const xprime = x - crpix1 + 1;
        const yprime = y - crpix2 + 1;
        const xi_deg  = (cd11 * xprime + cd12 * yprime);
        const eta_deg = (cd21 * xprime + cd22 * yprime);
        const ra0 = crval1 * D2R;
        const dec0 = crval2 * D2R;
        if (ctype1.includes('TAN') && ctype2.includes('TAN')) {
            const xi  = xi_deg  * D2R;
            const eta = eta_deg * D2R;
            const H = Math.hypot(xi, eta);
            const delta = Math.atan(H);
            const sin_delta = Math.sin(delta);
            const cos_delta = Math.cos(delta);
            const cos_dec0 = Math.cos(dec0);
            const sin_dec0 = Math.sin(dec0);
            const dec = Math.asin(cos_delta * sin_dec0 + (eta * sin_delta * cos_dec0) / (H || 1e-16));
            const ra  = ra0 + Math.atan2(xi * sin_delta, H * cos_dec0 * cos_delta - eta * sin_dec0 * sin_delta);
            return { ra: (ra * R2D + 540) % 360 - 180, dec: dec * R2D };
        }
        if (ctype1.includes('SIN') && ctype2.includes('SIN')) {
            const l = -(xi_deg)  * D2R;
            const m =  (eta_deg) * D2R;
            const rho2 = l*l + m*m;
            if (rho2 > 1.0) return null;
            const n = Math.sqrt(Math.max(0, 1 - rho2));
            const cos_dec0 = Math.cos(dec0);
            const sin_dec0 = Math.sin(dec0);
            const dec = Math.asin(m * cos_dec0 + n * sin_dec0);
            const y_num = l;
            const x_den = n * cos_dec0 - m * sin_dec0;
            const ra  = ra0 + Math.atan2(y_num, x_den);
            return { ra: (ra * R2D + 540) % 360 - 180, dec: dec * R2D };
        }
        // Fallback linear approximation
        const ra = crval1 + xi_deg;
        const dec = crval2 + eta_deg;
        return { ra, dec };
    } catch(_) {
        return null;
    }
}

function worldToPixelFromHeader(header, raDeg, decDeg) {
    try {
        if (!header) return null;
        const get = (k) => (k in header ? header[k]
            : (k.toUpperCase() in header ? header[k.toUpperCase()]
            : (k.toLowerCase() in header ? header[k.toLowerCase()] : undefined)));
        const ctype1 = String(get('CTYPE1') || '');
        const ctype2 = String(get('CTYPE2') || '');
        const crval1 = Number(get('CRVAL1'));
        const crval2 = Number(get('CRVAL2'));
        const crpix1 = Number(get('CRPIX1'));
        const crpix2 = Number(get('CRPIX2'));
        let cd11 = get('CD1_1'); let cd12 = get('CD1_2');
        let cd21 = get('CD2_1'); let cd22 = get('CD2_2');
        if (cd11 === undefined || cd22 === undefined) {
            const cdelt1 = Number(get('CDELT1') ?? 1);
            const cdelt2 = Number(get('CDELT2') ?? 1);
            cd11 = Number(cd11 ?? cdelt1);
            cd12 = Number(cd12 ?? 0);
            cd21 = Number(cd21 ?? 0);
            cd22 = Number(cd22 ?? cdelt2);
        } else {
            cd11 = Number(cd11); cd12 = Number(cd12 || 0);
            cd21 = Number(cd21 || 0); cd22 = Number(cd22);
        }
        if (![crval1, crval2, crpix1, crpix2, cd11, cd12, cd21, cd22].every(v => Number.isFinite(v))) return null;
        const det = cd11 * cd22 - cd12 * cd21;
        if (Math.abs(det) < 1e-18) return null;
        const D2R = Math.PI / 180.0;
        const R2D = 180.0 / Math.PI;
        const raRad = raDeg * D2R;
        const decRad = decDeg * D2R;
        const ra0 = crval1 * D2R;
        const dec0 = crval2 * D2R;
        let xi_deg = null, eta_deg = null;
        if (ctype1.includes('TAN') && ctype2.includes('TAN')) {
            const cos_dec = Math.cos(decRad);
            const cos_dec0 = Math.cos(dec0);
            const sin_dec = Math.sin(decRad);
            const sin_dec0 = Math.sin(dec0);
            const delta_ra = raRad - ra0;
            const A = cos_dec * Math.cos(delta_ra);
            const denominator = sin_dec * sin_dec0 + A * cos_dec0;
            if (Math.abs(denominator) < 1e-15) return null;
            const X = cos_dec * Math.sin(delta_ra);
            const Y = sin_dec * cos_dec0 - cos_dec * sin_dec0 * Math.cos(delta_ra);
            const xi = X / denominator;
            const eta = Y / denominator;
            xi_deg = xi * R2D;
            eta_deg = eta * R2D;
        } else if (ctype1.includes('SIN') && ctype2.includes('SIN')) {
            const delta_ra = raRad - ra0;
            const l = Math.cos(decRad) * Math.sin(delta_ra);
            const m = Math.sin(decRad) * Math.cos(dec0) - Math.cos(decRad) * Math.sin(dec0) * Math.cos(delta_ra);
            xi_deg = -(l * R2D);
            eta_deg = (m * R2D);
        } else {
            let raDiff = raDeg - crval1;
            if (isFinite(raDiff)) raDiff = ((raDiff + 540) % 360) - 180;
            const decDiff = decDeg - crval2;
            const dxLin = ( cd22 * raDiff - cd12 * decDiff) / det;
            const dyLin = (-cd21 * raDiff + cd11 * decDiff) / det;
            return { x: crpix1 + dxLin - 1, y: crpix2 + dyLin - 1 };
        }
        const dx = ( cd22 * xi_deg - cd12 * eta_deg) / det;
        const dy = (-cd21 * xi_deg + cd11 * eta_deg) / det;
        return { x: crpix1 + dx - 1, y: crpix2 + dy - 1 };
    } catch(_) {
        return null;
    }
}

// --- WCS lock helpers (limited scope) ---
// Our WCS-lock sync must be robust for RA---SIN / DEC--SIN (ALMA moment maps).
// The generic SIN helper above historically applied an extra sign flip on the xi/l term.
// That can mirror the X direction when CDELT1 is negative (common in ALMA), causing the
// sync to "focus on the right when you are on the left".
function pixelsToWorldFromHeaderForWcsLock(header, x, y) {
    try {
        if (!header) return null;
        const get = (k) => (k in header ? header[k]
            : (k.toUpperCase() in header ? header[k.toUpperCase()]
            : (k.toLowerCase() in header ? header[k.toLowerCase()] : undefined)));
        const ctype1 = String(get('CTYPE1') || '');
        const ctype2 = String(get('CTYPE2') || '');
        if (!(ctype1.includes('SIN') && ctype2.includes('SIN'))) {
            return pixelsToWorldFromHeader(header, x, y);
        }
        const D2R = Math.PI / 180.0;
        const R2D = 180.0 / Math.PI;
        const crval1 = Number(get('CRVAL1'));
        const crval2 = Number(get('CRVAL2'));
        const crpix1 = Number(get('CRPIX1'));
        const crpix2 = Number(get('CRPIX2'));
        let cd11 = get('CD1_1'); let cd12 = get('CD1_2');
        let cd21 = get('CD2_1'); let cd22 = get('CD2_2');
        if (cd11 === undefined || cd22 === undefined) {
            const cdelt1 = Number(get('CDELT1') ?? 1);
            const cdelt2 = Number(get('CDELT2') ?? 1);
            cd11 = Number(cd11 ?? cdelt1);
            cd12 = Number(cd12 ?? 0);
            cd21 = Number(cd21 ?? 0);
            cd22 = Number(cd22 ?? cdelt2);
        } else {
            cd11 = Number(cd11); cd12 = Number(cd12 || 0);
            cd21 = Number(cd21 || 0); cd22 = Number(cd22);
        }
        if (![crval1, crval2, crpix1, crpix2, cd11, cd12, cd21, cd22].every(v => Number.isFinite(v))) return null;
        const xprime = x - crpix1 + 1;
        const yprime = y - crpix2 + 1;
        const xi_deg  = (cd11 * xprime + cd12 * yprime);
        const eta_deg = (cd21 * xprime + cd22 * yprime);
        const ra0 = crval1 * D2R;
        const dec0 = crval2 * D2R;
        // Correct SIN (orthographic): l = xi, m = eta (CD/CDELT already encode axis directions).
        const l = (xi_deg) * D2R;
        const m = (eta_deg) * D2R;
        const rho2 = l*l + m*m;
        if (rho2 > 1.0) return null;
        const n = Math.sqrt(Math.max(0, 1 - rho2));
        const cos_dec0 = Math.cos(dec0);
        const sin_dec0 = Math.sin(dec0);
        const dec = Math.asin(m * cos_dec0 + n * sin_dec0);
        const y_num = l;
        const x_den = n * cos_dec0 - m * sin_dec0;
        const ra  = ra0 + Math.atan2(y_num, x_den);
        return { ra: (ra * R2D + 540) % 360 - 180, dec: dec * R2D };
    } catch (_) {
        return null;
    }
}

function worldToPixelFromHeaderForWcsLock(header, raDeg, decDeg) {
    try {
        if (!header) return null;
        const get = (k) => (k in header ? header[k]
            : (k.toUpperCase() in header ? header[k.toUpperCase()]
            : (k.toLowerCase() in header ? header[k.toLowerCase()] : undefined)));
        const ctype1 = String(get('CTYPE1') || '');
        const ctype2 = String(get('CTYPE2') || '');
        if (!(ctype1.includes('SIN') && ctype2.includes('SIN'))) {
            return worldToPixelFromHeader(header, raDeg, decDeg);
        }
        const crval1 = Number(get('CRVAL1'));
        const crval2 = Number(get('CRVAL2'));
        const crpix1 = Number(get('CRPIX1'));
        const crpix2 = Number(get('CRPIX2'));
        let cd11 = get('CD1_1'); let cd12 = get('CD1_2');
        let cd21 = get('CD2_1'); let cd22 = get('CD2_2');
        if (cd11 === undefined || cd22 === undefined) {
            const cdelt1 = Number(get('CDELT1') ?? 1);
            const cdelt2 = Number(get('CDELT2') ?? 1);
            cd11 = Number(cd11 ?? cdelt1);
            cd12 = Number(cd12 ?? 0);
            cd21 = Number(cd21 ?? 0);
            cd22 = Number(cd22 ?? cdelt2);
        } else {
            cd11 = Number(cd11); cd12 = Number(cd12 || 0);
            cd21 = Number(cd21 || 0); cd22 = Number(cd22);
        }
        if (![crval1, crval2, crpix1, crpix2, cd11, cd12, cd21, cd22].every(v => Number.isFinite(v))) return null;
        const det = cd11 * cd22 - cd12 * cd21;
        if (Math.abs(det) < 1e-18) return null;
        const D2R = Math.PI / 180.0;
        const R2D = 180.0 / Math.PI;
        const raRad = raDeg * D2R;
        const decRad = decDeg * D2R;
        const ra0 = crval1 * D2R;
        const dec0 = crval2 * D2R;
        const delta_ra = raRad - ra0;
        const l = Math.cos(decRad) * Math.sin(delta_ra);
        const m = Math.sin(decRad) * Math.cos(dec0) - Math.cos(decRad) * Math.sin(dec0) * Math.cos(delta_ra);
        // Correct: xi = l, eta = m (no extra sign flip; CD/CDELT encodes axis direction).
        const xi_deg = (l * R2D);
        const eta_deg = (m * R2D);
        const dx = ( cd22 * xi_deg - cd12 * eta_deg) / det;
        const dy = (-cd21 * xi_deg + cd11 * eta_deg) / det;
        return { x: crpix1 + dx - 1, y: crpix2 + dy - 1 };
    } catch (_) {
        return null;
    }
}

function pixelToWorldGeneric(x, y) {
    const mapped = convertDisplayPixelToWcsInput(x, y);
    const parsed = getOrCreateParsedWcsForSync();
    if (parsed && parsed.hasWCS && typeof parsed.pixelsToWorld === 'function') {
        try {
            const world = parsed.pixelsToWorld(mapped.x, mapped.y);
            if (world && isFinite(world.ra) && isFinite(world.dec)) return world;
        } catch(_) {}
    }
    try {
        const header = window?.fitsData?.wcs;
        if (header) {
            const fallback = pixelsToWorldFromHeader(header, mapped.x, mapped.y);
            if (fallback && isFinite(fallback.ra) && isFinite(fallback.dec)) return fallback;
        }
    } catch(_) {}
    return null;
}

function worldToPixelGeneric(raDeg, decDeg) {
    const parsed = getOrCreateParsedWcsForSync();
    if (parsed && parsed.hasWCS && typeof parsed.worldToPixels === 'function') {
        try {
            const px = parsed.worldToPixels(raDeg, decDeg);
            if (px && isFinite(px.x) && isFinite(px.y)) {
                const disp = convertWcsPixelToDisplayOutput(px.x, px.y);
                if (disp && isFinite(disp.x) && isFinite(disp.y)) return disp;
            }
        } catch(_) {}
    }
    try {
        const header = window?.fitsData?.wcs;
        if (header) {
            const fallback = worldToPixelFromHeader(header, raDeg, decDeg);
            if (fallback && isFinite(fallback.x) && isFinite(fallback.y)) {
                const disp = convertWcsPixelToDisplayOutput(fallback.x, fallback.y);
                if (disp && isFinite(disp.x) && isFinite(disp.y)) return disp;
            }
        }
    } catch(_) {}
    return null;
}

function bufferedRectFromPoints(points, imgWidth, imgHeight, options) {
    if (!points || points.length < 2) return null;
    const opts = options || {};
    const padFraction = typeof opts.padFraction === 'number' ? opts.padFraction : 0.02;
    const padPixels = typeof opts.padPixels === 'number' ? opts.padPixels : 6;
    const minSize = typeof opts.minSize === 'number' ? opts.minSize : 8;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    points.forEach(pt => {
        if (!pt || !isFinite(pt.x) || !isFinite(pt.y)) return;
        minX = Math.min(minX, pt.x);
        minY = Math.min(minY, pt.y);
        maxX = Math.max(maxX, pt.x);
        maxY = Math.max(maxY, pt.y);
    });
    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) return null;
    if (typeof imgWidth === 'number') {
        minX = Math.max(0, Math.min(imgWidth, minX));
        maxX = Math.max(0, Math.min(imgWidth, maxX));
    }
    if (typeof imgHeight === 'number') {
        minY = Math.max(0, Math.min(imgHeight, minY));
        maxY = Math.max(0, Math.min(imgHeight, maxY));
    }
    const width = Math.max(minSize, maxX - minX);
    const height = Math.max(minSize, maxY - minY);
    if (!isFinite(width) || !isFinite(height)) return null;
    const expandX = width * padFraction + padPixels;
    const expandY = height * padFraction + padPixels;
    const finalMinX = Math.max(0, minX - expandX);
    const finalMinY = Math.max(0, minY - expandY);
    const finalMaxX = typeof imgWidth === 'number' ? Math.min(imgWidth, maxX + expandX) : maxX + expandX;
    const finalMaxY = typeof imgHeight === 'number' ? Math.min(imgHeight, maxY + expandY) : maxY + expandY;
    const finalWidth = Math.max(minSize, finalMaxX - finalMinX);
    const finalHeight = Math.max(minSize, finalMaxY - finalMinY);
    return new OpenSeadragon.Rect(finalMinX, finalMinY, finalWidth, finalHeight);
}

function getOrCreateParsedWcsForSync() {
    if (window.parsedWCS && window.parsedWCS.hasWCS) return window.parsedWCS;
    try {
        const header = window?.fitsData?.wcs;
        if (header && typeof parseWCS === 'function') {
            const parsed = parseWCS(header);
            parsed.__source = header;
            window.parsedWCS = parsed;
            return parsed;
        }
    } catch (_) {}
    return null;
}

window.ensureWcsData = function () {
    if (window?.fitsData?.wcs) return true;
    try {
        if (typeof window.refreshWcsForOverlay === 'function') {
            window.refreshWcsForOverlay({ filepath: window.currentFitsFile || undefined, hduIndex: window.currentHduIndex });
        }
    } catch (_) {}
    return false;
};

window.getWcsSyncState = function (opts) {
    try {
        const options = (opts && typeof opts === 'object') ? opts : {};
        // Default to "full" (include worldQuad) for manual sync calls, but allow the viewport emitter
        // to request a cheap "coarse" state during interaction.
        const includeQuad = (options.includeQuad !== false);
        const viewer = window.tiledViewer || window.viewer;
        if (!viewer || !viewer.viewport) return null;
        if (!window.fitsData) return null;
        // Best-effort: ensure we have WCS header cached so world-based sync can work.
        // Without WCS we fall back to pixel/zoom sync, which can drift across differently-oriented panes.
        try { if (typeof window.ensureWcsData === 'function') window.ensureWcsData(); } catch (_) {}
        const center = viewer.viewport.getCenter(true);
        const imagePt = viewer.viewport.viewportToImageCoordinates(center);
        if (!imagePt || !isFinite(imagePt.x) || !isFinite(imagePt.y)) return null;
        const candidatePath = window.currentFitsFile;
        const resolvedPath = (typeof candidatePath === 'string')
            ? candidatePath
            : (typeof window.fitsData?.filename === 'string' ? window.fitsData.filename : null);
        const state = {
            pixel: { x: imagePt.x, y: imagePt.y },
            zoom: viewer.viewport.getZoom(),
            rotation: typeof viewer.viewport.getRotation === 'function' ? viewer.viewport.getRotation() : 0,
            width: window.fitsData?.width || null,
            height: window.fitsData?.height || null,
            filepath: resolvedPath,
            hasWcs: false,
            // Include display-orientation hints (derived from analyze_wcs_orientation on backend).
            flip_y: !!window?.fitsData?.flip_y
        };
        const headerForLock = window?.fitsData?.wcs || null;
        const ctype1Lock = (() => { try { return headerForLock ? String((('CTYPE1' in headerForLock) ? headerForLock.CTYPE1 : (headerForLock.ctype1 || headerForLock.CTYPE1 || ''))) : ''; } catch (_) { return ''; } })();
        const ctype2Lock = (() => { try { return headerForLock ? String((('CTYPE2' in headerForLock) ? headerForLock.CTYPE2 : (headerForLock.ctype2 || headerForLock.CTYPE2 || ''))) : ''; } catch (_) { return ''; } })();
        const forceHeaderSin = (String(ctype1Lock).includes('SIN') && String(ctype2Lock).includes('SIN'));

        // Expensive: compute a world "quad" for bounding-box sync (used by fitBounds()).
        // Keep it small (corners+center) and allow callers to skip it during active dragging.
        if (includeQuad) {
            const worldQuad = [];
            try {
                const bounds = viewer.viewport.getBounds(true);
                if (bounds) {
                    const pts = [
                        { x: bounds.x, y: bounds.y },
                        { x: bounds.x + bounds.width, y: bounds.y },
                        { x: bounds.x, y: bounds.y + bounds.height },
                        { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
                        { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
                    ];
                    pts.forEach(pt => {
                        try {
                            const imgPt = viewer.viewport.viewportToImageCoordinates(pt.x, pt.y);
                            if (!imgPt || !isFinite(imgPt.x) || !isFinite(imgPt.y)) return;
                            const mapped = convertDisplayPixelToWcsInputForWcsLock(imgPt.x, imgPt.y);
                            let world = null;
                            if (!forceHeaderSin) {
                                try {
                                    const parsed = getOrCreateParsedWcsForSync();
                                    if (parsed && parsed.hasWCS && typeof parsed.pixelsToWorld === 'function') {
                                        world = parsed.pixelsToWorld(mapped.x, mapped.y);
                                    }
                                } catch (_) {}
                            }
                            if (!world) {
                                try {
                                    const header = window?.fitsData?.wcs;
                                    if (header) world = pixelsToWorldFromHeaderForWcsLock(header, mapped.x, mapped.y);
                                } catch (_) {}
                            }
                            if (world && isFinite(world.ra) && isFinite(world.dec)) worldQuad.push(world);
                        } catch(_) {}
                    });
                }
            } catch(_) {}
            if (worldQuad.length >= 2) state.worldQuad = worldQuad;
        }
        const parsed = getOrCreateParsedWcsForSync();
        let centerWorld = null;
        if (!forceHeaderSin && parsed && parsed.hasWCS && typeof parsed.pixelsToWorld === 'function') {
            const mapped = convertDisplayPixelToWcsInputForWcsLock(imagePt.x, imagePt.y);
            const world = parsed.pixelsToWorld(mapped.x, mapped.y);
            if (world && isFinite(world.ra) && isFinite(world.dec)) {
                centerWorld = { ra: world.ra, dec: world.dec };
            }
        }
        if (!centerWorld) {
            try {
                const mapped = convertDisplayPixelToWcsInputForWcsLock(imagePt.x, imagePt.y);
                const header = window?.fitsData?.wcs;
                const fallbackWorld = header ? pixelsToWorldFromHeaderForWcsLock(header, mapped.x, mapped.y) : null;
                if (fallbackWorld && isFinite(fallbackWorld.ra) && isFinite(fallbackWorld.dec)) centerWorld = fallbackWorld;
            } catch (_) {}
        }
        if (centerWorld) {
            state.world = centerWorld;
            state.hasWcs = true;
        }
        return state;
    } catch (_) {
        return null;
    }
};

async function applyWcsStateInternal(state, retries = 6, ctx) {
    if (!state) return false;
    const applySeq = ctx && ctx.seq;
    const signal = ctx && ctx.signal;
    const viewer = window.tiledViewer || window.viewer;
    if (!viewer || !viewer.viewport) {
        if (retries > 0) {
            await sleep(250);
            return applyWcsStateInternal(state, retries - 1);
        }
        return false;
    }
    if (!viewer.world || (viewer.world.getItemCount && viewer.world.getItemCount() === 0)) {
        if (retries > 0) {
            await sleep(300);
            return applyWcsStateInternal(state, retries - 1);
        }
        return false;
    }
    // If the incoming state expects WCS-based sync but this pane hasn't loaded WCS yet,
    // try to fetch it before applying. Otherwise we'll fall back to pixel sync and panes won't match.
    try {
        if (state.hasWcs && !(window.fitsData && window.fitsData.wcs)) {
            if (typeof window.ensureWcsData === 'function') window.ensureWcsData();
            // Give async WCS fetch a brief chance; retry loop will handle further waits.
            if (retries > 0) {
                await sleep(220);
            }
        }
    } catch (_) {}
    let boundsApplied = false;
    if (state.worldQuad && state.worldQuad.length >= 2) {
        let quadPx = await convertWorldQuadViaBackend(state.worldQuad, { signal });
        if (applySeq && window.__wcsApplySeq && applySeq !== window.__wcsApplySeq) return false;
        if (!Array.isArray(quadPx) || quadPx.length < 2) {
            quadPx = convertWorldQuadViaFallback(state.worldQuad);
        }
        if (quadPx && quadPx.length >= 2) {
            const rect = bufferedRectFromPoints(
                quadPx,
                window.fitsData?.width,
                window.fitsData?.height,
                { padFraction: 0, padPixels: 0, minSize: 4 }
            );
            if (rect) {
                try {
                    const vpRect = viewer.viewport.imageToViewportRectangle(rect);
                    viewer.viewport.fitBounds(vpRect, false);
                    boundsApplied = true;
                } catch(_) {}
            }
        }
    }
    let targetPixel = null;
    const parsed = getOrCreateParsedWcsForSync();
    if (state.world) {
        if (parsed && parsed.hasWCS && typeof parsed.worldToPixels === 'function') {
            try {
                const px = parsed.worldToPixels(state.world.ra, state.world.dec);
                if (px && isFinite(px.x) && isFinite(px.y)) {
                    // Convert WCS pixel -> display pixel using WCS-lock-specific flip decision
                    targetPixel = convertWcsPixelToDisplayOutputForWcsLock(px.x, px.y);
                }
            } catch (_) {}
        }
        if (!targetPixel) {
            let backendPoint = null;
            try {
                const pts = await convertWorldQuadViaBackend([state.world], { signal });
                if (applySeq && window.__wcsApplySeq && applySeq !== window.__wcsApplySeq) return false;
                if (Array.isArray(pts) && pts.length && pts[0] && isFinite(pts[0].x) && isFinite(pts[0].y)) {
                    backendPoint = pts[0];
                }
            } catch (_) {}
            if (!backendPoint) {
                // worldToPixelGeneric uses fitsData.flip_y; for WCS lock we want the header-based flip rule.
                try {
                    const header = window?.fitsData?.wcs;
                    const raw = header ? worldToPixelFromHeaderForWcsLock(header, state.world.ra, state.world.dec) : null;
                    if (raw && isFinite(raw.x) && isFinite(raw.y)) {
                        const disp = convertWcsPixelToDisplayOutputForWcsLock(raw.x, raw.y);
                        if (disp && isFinite(disp.x) && isFinite(disp.y)) backendPoint = disp;
                    }
                } catch (_) {}
                if (!backendPoint) {
                    const fallbackPx = worldToPixelGeneric(state.world.ra, state.world.dec);
                    if (fallbackPx && isFinite(fallbackPx.x) && isFinite(fallbackPx.y)) {
                        backendPoint = fallbackPx;
                    }
                }
            }
            if (backendPoint && isFinite(backendPoint.x) && isFinite(backendPoint.y)) {
                targetPixel = backendPoint;
            }
        }
    }
    if (!boundsApplied && !targetPixel && state.pixel && isFinite(state.pixel.x) && isFinite(state.pixel.y)) {
        const width = window.fitsData?.width;
        const height = window.fitsData?.height;
        if (width && height && state.width && state.height) {
            const rx = width / state.width;
            const ry = height / state.height;
            targetPixel = { x: state.pixel.x * rx, y: state.pixel.y * ry };
        } else {
            targetPixel = { x: state.pixel.x, y: state.pixel.y };
        }
    }
    if (!boundsApplied && !targetPixel) return false;
    if (!boundsApplied && targetPixel) {
        try {
            // Use TiledImage for accurate coordinate conversion (fixes multi-image warning)
            const tiledImage = viewer.world.getItemAt(0);
            const vpPoint = tiledImage ? tiledImage.imageToViewportCoordinates(targetPixel.x, targetPixel.y) : viewer.viewport.imageToViewportCoordinates(targetPixel.x, targetPixel.y);
            if (!vpPoint) return false;
            if (typeof viewer.viewport.panTo === 'function') viewer.viewport.panTo(vpPoint);
            if (state.zoom && isFinite(state.zoom) && typeof viewer.viewport.zoomTo === 'function') {
                viewer.viewport.zoomTo(state.zoom);
            }
        } catch (_) {
            return false;
        }
    }
    try {
        if (typeof viewer.viewport.setRotation === 'function' && state.rotation != null && isFinite(state.rotation)) {
            viewer.viewport.setRotation(state.rotation);
        }
    } catch(_) {}
    return true;
}

window.__wcsLockApplying = false;
window.applyWcsSyncState = async function (state) {
    if (!state) return false;
    // Latest-only semantics: abort any in-flight backend conversion and ignore stale apply calls.
    window.__wcsApplySeq = (window.__wcsApplySeq || 0) + 1;
    const applySeq = window.__wcsApplySeq;
    try { if (window.__wcsWorldToPixelAbort) window.__wcsWorldToPixelAbort.abort(); } catch (_) {}
    window.__wcsWorldToPixelAbort = new AbortController();
    const signal = window.__wcsWorldToPixelAbort.signal;

    window.__wcsLockApplying = true;
    try {
        const result = await applyWcsStateInternal(state, 8, { seq: applySeq, signal });
        if (result && state.sourceId) {
            window.__lastWcsSyncSourceId = state.sourceId;
            window.__lastWcsSyncTime = Date.now();
        }
        return result;
    } finally {
        window.__wcsLockApplying = false;
    }
};

if (window.parent && window.parent !== window) {
    window.__paneSyncId = window.__paneSyncId || `pane-${Math.random().toString(36).slice(2)}`;
    window.__wcsLockStateEnabled = !!window.__wcsLockStateEnabled;
    window.__wcsIsActivePane = !!window.__wcsIsActivePane;
    window.addEventListener('message', (event) => {
        try {
            if (event.source !== window.parent) return;
        } catch(_) {}
        const data = event.data;
        if (!data) return;
        if (data.type === 'neloura-wcs-lock-state') {
            window.__wcsLockStateEnabled = !!data.enabled;
        } else if (data.type === 'neloura-pane-active') {
            window.__wcsIsActivePane = !!data.active;
            if (data.active) {
                try { refreshHistogramOnPaneActivate(); } catch (_) {}
                try {
                    if (segmentOverlayState && segmentOverlayState.tiledImage) {
                        renderSegmentOverlayControls(segmentOverlayMetadata);
                    } else {
                        removeSegmentOverlayControls();
                    }
                } catch (_) {}
                try {
                    // Render catalog overlay controls if available
                    // In multi-panel mode, renderCatalogOverlayControls() will automatically start them collapsed
                    if (window.currentCatalogName && window.catalogDataForOverlay && window.catalogDataForOverlay.length) {
                        renderCatalogOverlayControls();
                    } else {
                        removeCatalogOverlayControls();
                    }
                } catch (_) {}
            } else {
                try { removeSegmentOverlayControls(); } catch (_) {}
                try { removeCatalogOverlayControls(); } catch (_) {}
            }
            try { repositionSegmentOverlayControls(); } catch (_) {}
            try { repositionCatalogOverlayControls(); } catch (_) {}
        }
    });
}

function installViewportSyncEmitter() {
    if (!window.parent || window.parent === window) return false;
    const viewer = window.tiledViewer || window.viewer;
    if (!viewer || !viewer.viewport || typeof viewer.addHandler !== 'function') return false;
    if (viewer.__wcsSyncEmitterInstalled) return true;
    viewer.__wcsSyncEmitterInstalled = true;
    let lastCoarseEmit = 0;
    let lastFullEmit = 0;
    let fullTimer = null;

    const postState = (includeQuad) => {
        if (!window.__wcsLockStateEnabled) return;
        if (!window.__wcsIsActivePane) return;
        if (window.__wcsLockApplying) return;
        if (window.__lastWcsSyncSourceId === window.__paneSyncId && Date.now() - (window.__lastWcsSyncTime || 0) < 50) return;
        const state = window.getWcsSyncState && window.getWcsSyncState({ includeQuad });
        if (!state) return;
        state.sourceId = window.__paneSyncId || null;
        try { window.parent.postMessage({ type: 'neloura-sync-viewport', state }, '*'); } catch(_) {}
    };

    const emitCoarse = () => {
        const now = Date.now();
        if (now - lastCoarseEmit < 120) return;
        lastCoarseEmit = now;
        postState(false);
        // After interaction settles, send a single full sync (worldQuad) for perfect alignment.
        if (fullTimer) clearTimeout(fullTimer);
        fullTimer = setTimeout(() => {
            try { emitFull(); } catch (_) {}
        }, 180);
    };

    const emitFull = () => {
        const now = Date.now();
        if (now - lastFullEmit < 120) return;
        lastFullEmit = now;
        if (fullTimer) { clearTimeout(fullTimer); fullTimer = null; }
        postState(true);
    };

    viewer.addHandler('animation', emitCoarse);
    viewer.addHandler('pan', emitCoarse);
    viewer.addHandler('zoom', emitCoarse);
    viewer.addHandler('rotate', emitCoarse);
    viewer.addHandler('animation-finish', emitFull);
    return true;
}

function scheduleViewportSyncEmitter() {
    if (!window.parent || window.parent === window) return;
    const poll = () => {
        if (window.__wcsLockStateEnabled) {
            if (installViewportSyncEmitter()) return;
        }
        setTimeout(poll, 800);
    };
    poll();
}

if (window.parent && window.parent !== window) {
    scheduleViewportSyncEmitter();
}

function zoomIn() {
    const activeViewer = window.tiledViewer || window.viewer;
    if (activeViewer && activeViewer.viewport) {
        activeViewer.viewport.zoomBy(1.2);
    }
}

function zoomOut() {
    const activeViewer = window.tiledViewer || window.viewer;
    if (activeViewer && activeViewer.viewport) {
        activeViewer.viewport.zoomBy(0.8);
    }
}

function resetView() {
    const activeViewer = window.tiledViewer || window.viewer;
    if (activeViewer && activeViewer.viewport) {
        activeViewer.viewport.goHome();
    }
}
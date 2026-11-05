// Contours from a chosen FITS file, drawn on the open image.
// Levels match the DS9 contour dialog. Lines are stored in display pixels
// and redrawn through the viewer, so pan, zoom, and rotation stay attached.
(function () {
    const state = {
        path: '',
        hdu: null,
        percentiles: null,
        percentilePreset: '99',
        lines: [],
        color: '#00e676',
        width: 1,
        dash: false,
        appliedKey: '',
        busy: false
    };

    let popup = null;
    let overlayCanvas = null;
    let overlayCtx = null;
    let redrawFrame = 0;
    let hookedViewer = null;

    function hostWindow() {
        try { return window.top || window; } catch (_) { return window; }
    }

    function currentImage() {
        return {
            path: window.currentFitsFile || (window.fitsData && (window.fitsData.filepath || window.fitsData.filename)) || '',
            hdu: (typeof window.currentHduIndex === 'number') ? window.currentHduIndex : 0,
            slice: (typeof window.currentCubeSliceIndex === 'number') ? window.currentCubeSliceIndex : null
        };
    }

    function imageKey(image) {
        const slice = image.slice == null ? '' : image.slice;
        return `${image.path}|${image.hdu}|${slice}`;
    }

    function pathsMatch(left, right) {
        const clean = (value) => String(value || '').replace(/\\/g, '/').replace(/^\.?\//, '');
        const a = clean(left);
        const b = clean(right);
        if (!a || !b) return false;
        return a === b || a.endsWith('/' + b) || b.endsWith('/' + a);
    }

    function fileLabel(path) {
        const text = String(path || '');
        const parts = text.split(/[\\/]/);
        return parts[parts.length - 1] || text;
    }

    function fieldStyle(element) {
        Object.assign(element.style, {
            backgroundColor: '#444',
            color: '#fff',
            border: '1px solid #555',
            borderRadius: '3px',
            padding: '5px 8px',
            fontFamily: 'Arial, sans-serif',
            fontSize: '13px',
            boxSizing: 'border-box'
        });
    }

    function labelStyle(element, text) {
        element.textContent = text;
        Object.assign(element.style, {
            color: '#aaa',
            fontFamily: 'Arial, sans-serif',
            fontSize: '13px',
            marginBottom: '4px',
            display: 'block'
        });
    }

    function actionButton(text) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = text;
        Object.assign(button.style, {
            flex: '1',
            margin: '0 4px',
            padding: '8px 0',
            backgroundColor: '#444',
            color: '#fff',
            border: 'none',
            borderRadius: '3px',
            cursor: 'pointer',
            fontFamily: 'Arial, sans-serif',
            fontSize: '13px'
        });
        button.addEventListener('mouseover', () => { if (!button.disabled) button.style.backgroundColor = '#555'; });
        button.addEventListener('mouseout', () => { button.style.backgroundColor = button.dataset.tone || '#444'; });
        return button;
    }

    function setStatus(text, tone) {
        if (!popup) return;
        const status = popup.querySelector('.contour-status');
        if (!status) return;
        status.textContent = text || '';
        status.style.color = tone === 'error' ? '#ff8a80' : '#bbb';
    }

    function readLevels(text) {
        const values = [];
        String(text || '').split(/[\s,;]+/).forEach((part) => {
            if (!part) return;
            const value = Number(part);
            if (Number.isFinite(value)) values.push(value);
        });
        return values;
    }

    async function contourError(response) {
        try {
            const body = await response.json();
            if (typeof body.detail === 'string' && body.detail) return body.detail;
        } catch (_) {}
        return 'Contours could not be calculated.';
    }

    function sourcePayload() {
        const current = currentImage();
        const same = pathsMatch(state.path, current.path);
        return {
            source_path: state.path,
            source_hdu: state.hdu,
            source_slice: same ? current.slice : null
        };
    }

    function imageHdus(list) {
        return (Array.isArray(list) ? list : []).filter((hdu) => (
            (hdu.type === 'Image' || hdu.type === 'Primary')
            && Array.isArray(hdu.dimensions)
            && hdu.dimensions.length >= 2
        ));
    }

    function renderFileInfo() {
        const root = (popup && popup.isConnected) ? popup : document.getElementById('contour-popup');
        if (!root) return;
        const fileSpan = root.querySelector('#contour-file-text');
        const hduHost = root.querySelector('#contour-hdu-host');
        if (!fileSpan || !hduHost) return;
        const name = state.path ? fileLabel(state.path) : '(none)';
        fileSpan.textContent = `File: ${name}`;
        fileSpan.title = state.path || '';
        hduHost.textContent = '';
        const choices = Array.isArray(state.hduChoices) ? state.hduChoices : [];
        if (choices.length > 1) {
            const select = document.createElement('select');
            select.id = 'contour-hdu';
            fieldStyle(select);
            select.style.padding = '2px 6px';
            select.style.fontFamily = 'monospace';
            select.style.fontSize = '12px';
            choices.forEach((hdu) => {
                const index = Number.isFinite(Number(hdu.index)) ? Number(hdu.index) : 0;
                const option = document.createElement('option');
                option.value = String(index);
                const extname = String(hdu.name || '').trim();
                option.textContent = extname && extname.toLowerCase() !== `hdu ${index}`
                    ? `HDU: ${index} ${extname}`
                    : `HDU: ${index}`;
                select.appendChild(option);
            });
            if (state.hdu != null) select.value = String(state.hdu);
            select.addEventListener('change', () => {
                state.hdu = Number(select.value);
                loadLimits('99');
            });
            hduHost.appendChild(select);
            return;
        }
        const hduSpan = document.createElement('span');
        hduSpan.id = 'contour-hdu-text';
        hduSpan.textContent = state.hdu == null ? 'HDU: —' : `HDU: ${state.hdu}`;
        hduHost.appendChild(hduSpan);
    }

    function ensureAnim(element) {
        if (!element || element.__nelouraAnimReady) return element;
        element.__nelouraAnimReady = true;
        element.__nelouraBaseTransform = 'translate(-50%, -50%)';
        const centered = () => String(element.style.transform || '').includes('translate(-50%, -50%)');
        element.__nelouraShow = () => {
            element.style.display = 'block';
            element.style.willChange = 'opacity, transform';
            element.style.transition = 'opacity 170ms ease, transform 170ms ease';
            element.style.opacity = '0';
            if (centered()) {
                element.style.transform = `${element.__nelouraBaseTransform} translateY(12px) scale(0.98)`;
            }
            requestAnimationFrame(() => {
                element.style.opacity = '1';
                if (centered()) {
                    element.style.transform = `${element.__nelouraBaseTransform} translateY(0px) scale(1)`;
                }
            });
            element.__nelouraEscHandler = (event) => {
                const key = event && (event.key || event.code || '');
                if (key === 'Escape' || key === 'Esc') {
                    event.preventDefault();
                    element.__nelouraHide && element.__nelouraHide();
                }
            };
            document.addEventListener('keydown', element.__nelouraEscHandler, true);
        };
        element.__nelouraHide = () => {
            if (element.__nelouraClosing) return;
            element.__nelouraClosing = true;
            if (element.__nelouraEscHandler) {
                document.removeEventListener('keydown', element.__nelouraEscHandler, true);
            }
            element.style.willChange = 'opacity, transform';
            element.style.transition = 'opacity 160ms ease, transform 160ms ease';
            element.style.opacity = '0';
            if (centered()) {
                element.style.transform = `${element.__nelouraBaseTransform} translateY(12px) scale(0.98)`;
            }
            const cleanup = () => {
                element.style.display = 'none';
                element.__nelouraClosing = false;
            };
            const timer = setTimeout(cleanup, 220);
            element.addEventListener('transitionend', (event) => {
                if (event.target !== element) return;
                clearTimeout(timer);
                cleanup();
            }, { once: true });
        };
        return element;
    }

    function ensureOverlay() {
        const viewerElement = document.getElementById('openseadragon');
        if (!viewerElement) return null;
        if (overlayCanvas && overlayCanvas.isConnected) return overlayCanvas;
        const canvas = document.createElement('canvas');
        canvas.className = 'contour-overlay-canvas';
        Object.assign(canvas.style, {
            position: 'absolute',
            left: '0',
            top: '0',
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: '34'
        });
        viewerElement.appendChild(canvas);
        overlayCanvas = canvas;
        overlayCtx = canvas.getContext('2d');
        resizeOverlay();
        if (typeof ResizeObserver === 'function') {
            const observer = new ResizeObserver(() => resizeOverlay());
            observer.observe(viewerElement);
        }
        return canvas;
    }

    function resizeOverlay() {
        if (!overlayCanvas) return;
        const viewerElement = document.getElementById('openseadragon');
        if (!viewerElement) return;
        const ratio = window.devicePixelRatio || 1;
        const width = Math.max(1, viewerElement.clientWidth);
        const height = Math.max(1, viewerElement.clientHeight);
        overlayCanvas.width = Math.round(width * ratio);
        overlayCanvas.height = Math.round(height * ratio);
        overlayCtx = overlayCanvas.getContext('2d');
        overlayCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
        drawContours();
    }

    function scheduleRedraw() {
        if (redrawFrame) return;
        redrawFrame = window.requestAnimationFrame(() => {
            redrawFrame = 0;
            drawContours();
        });
    }

    function hookViewer() {
        const viewer = (typeof getActiveOsdViewer === 'function') ? getActiveOsdViewer() : (window.tiledViewer || window.viewer);
        if (!viewer || viewer === hookedViewer || typeof viewer.addHandler !== 'function') return;
        hookedViewer = viewer;
        ['animation', 'animation-finish', 'rotate', 'zoom', 'pan', 'resize', 'open'].forEach((name) => {
            try { viewer.addHandler(name, scheduleRedraw); } catch (_) {}
        });
        try {
            viewer.addHandler('open', () => {
                state.lines = [];
                state.appliedKey = '';
                scheduleRedraw();
            });
        } catch (_) {}
    }

    function imageSize() {
        try {
            const viewer = hookedViewer || ((typeof getActiveOsdViewer === 'function') ? getActiveOsdViewer() : null);
            const item = viewer && viewer.world && viewer.world.getItemAt && viewer.world.getItemAt(0);
            if (item && item.getContentSize) {
                const size = item.getContentSize();
                return Math.max(size.x || 0, size.y || 0);
            }
        } catch (_) {}
        const width = Number(window.fitsData && window.fitsData.width) || 0;
        const height = Number(window.fitsData && window.fitsData.height) || 0;
        return Math.max(width, height, 1);
    }

    function drawContours() {
        if (!overlayCtx || !overlayCanvas) return;
        const width = overlayCanvas.clientWidth || overlayCanvas.width;
        const height = overlayCanvas.clientHeight || overlayCanvas.height;
        overlayCtx.clearRect(0, 0, width, height);
        if (!state.lines.length) return;
        if (state.appliedKey && state.appliedKey !== imageKey(currentImage())) return;
        if (typeof imagePointToScreen !== 'function') return;

        const jump = Math.max(48, imageSize() * 0.08);
        overlayCtx.save();
        overlayCtx.lineWidth = Math.max(0.5, Number(state.width) || 1);
        overlayCtx.strokeStyle = state.color || '#00e676';
        overlayCtx.lineJoin = 'round';
        overlayCtx.lineCap = 'round';
        overlayCtx.setLineDash(state.dash ? [6, 4] : []);
        state.lines.forEach((line) => {
            const points = line.points || [];
            let drawing = false;
            let previous = null;
            points.forEach((pair) => {
                const screen = imagePointToScreen({ x: pair[0], y: pair[1] });
                const usable = screen && Number.isFinite(screen.x) && Number.isFinite(screen.y);
                const broken = previous && Math.hypot(pair[0] - previous[0], pair[1] - previous[1]) > jump;
                if (!usable || broken) {
                    if (drawing) overlayCtx.stroke();
                    drawing = false;
                    previous = usable ? pair : null;
                    if (!usable) return;
                }
                if (!drawing) {
                    overlayCtx.beginPath();
                    overlayCtx.moveTo(screen.x, screen.y);
                    drawing = true;
                } else {
                    overlayCtx.lineTo(screen.x, screen.y);
                }
                previous = pair;
            });
            if (drawing) overlayCtx.stroke();
        });
        overlayCtx.restore();
    }

    function clearContours() {
        state.lines = [];
        state.appliedKey = '';
        ensureOverlay();
        drawContours();
        setStatus('Contours cleared.');
    }

    async function postContours(body) {
        const response = await apiFetch('/api/contours', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!response.ok) throw new Error(await contourError(response));
        return response.json();
    }

    async function generateLevels() {
        if (!state.path) {
            setStatus('Choose a file to take the contours from.', 'error');
            return;
        }
        const number = Math.round(Number(popup.querySelector('#contour-number').value));
        const scale = popup.querySelector('#contour-scale').value;
        const smooth = Math.round(Number(popup.querySelector('#contour-smooth').value));
        const low = popup.querySelector('#contour-min').value.trim();
        const high = popup.querySelector('#contour-max').value.trim();
        state.busy = true;
        setStatus('Generating levels…');
        try {
            const result = await postContours({
                action: 'generate',
                ...sourcePayload(),
                number: Number.isFinite(number) ? number : 5,
                scale,
                smooth: Number.isFinite(smooth) ? smooth : 1,
                low: low === '' ? null : Number(low),
                high: high === '' ? null : Number(high)
            });
            if (result.hdu != null) state.hdu = result.hdu;
            renderFileInfo();
            const levels = Array.isArray(result.levels) ? result.levels : [];
            popup.querySelector('#contour-levels').value = levels.map((value) => String(value)).join('\n');
            const notes = Array.isArray(result.messages) ? result.messages.filter(Boolean) : [];
            const range = `${formatNumber(result.min)} to ${formatNumber(result.max)}`;
            setStatus([`${levels.length} levels, ${range}.`, ...notes].join(' '));
        } catch (error) {
            setStatus(error.message || 'Contours could not be calculated.', 'error');
        } finally {
            state.busy = false;
        }
    }

    function formatNumber(value) {
        const number = Number(value);
        if (!Number.isFinite(number)) return '';
        const abs = Math.abs(number);
        if (abs !== 0 && (abs < 0.001 || abs >= 100000)) return number.toExponential(4);
        return String(Math.round(number * 1000000) / 1000000);
    }

    const PERCENTILE_PRESETS = [
        { id: '75', label: '75%', low: '25', high: '75' },
        { id: '90', label: '90%', low: '10', high: '90' },
        { id: '95', label: '95%', low: '5', high: '95' },
        { id: '99', label: '99%', low: '1', high: '99' },
        { id: '99.9', label: '99.9%', low: '0.1', high: '99.9' }
    ];
    let limitsToken = 0;

    function currentSmooth() {
        const input = popup && popup.querySelector('#contour-smooth');
        const smooth = input ? Math.round(Number(input.value)) : 1;
        return Number.isFinite(smooth) && smooth > 0 ? smooth : 1;
    }

    function markPercentile(presetId) {
        if (!popup) return;
        popup.querySelectorAll('[data-contour-percentile]').forEach((button) => {
            const active = button.dataset.contourPercentile === presetId;
            button.style.backgroundColor = active ? '#007bff' : '#444';
            button.dataset.tone = active ? '#007bff' : '#444';
        });
    }

    function applyPercentilePreset(presetId) {
        const preset = PERCENTILE_PRESETS.find((item) => item.id === presetId) || PERCENTILE_PRESETS[3];
        const table = state.percentiles || {};
        const low = table[preset.low];
        const high = table[preset.high];
        if (!Number.isFinite(Number(low)) || !Number.isFinite(Number(high))) return false;
        const minInput = popup && popup.querySelector('#contour-min');
        const maxInput = popup && popup.querySelector('#contour-max');
        if (minInput) minInput.value = formatNumber(low);
        if (maxInput) maxInput.value = formatNumber(high);
        state.percentilePreset = preset.id;
        markPercentile(preset.id);
        return true;
    }

    async function loadLimits(presetId) {
        if (!state.path) return;
        const wanted = presetId || state.percentilePreset || '99';
        const token = ++limitsToken;
        const smooth = currentSmooth();
        setStatus('Reading limits…');
        try {
            const result = await postContours({
                action: 'limits',
                ...sourcePayload(),
                smooth
            });
            if (token !== limitsToken) return;
            if (result.hdu != null) state.hdu = result.hdu;
            state.percentiles = result.percentiles || {};
            renderFileInfo();
            applyPercentilePreset(wanted);
            const preset = PERCENTILE_PRESETS.find((item) => item.id === wanted);
            setStatus(preset ? `Limits set from the ${preset.label} range.` : 'Limits updated.');
        } catch (error) {
            if (token !== limitsToken) return;
            setStatus(error.message || 'Could not read the limits.', 'error');
        }
    }

    async function applyContours() {
        if (!state.path) {
            setStatus('Choose a file to take the contours from.', 'error');
            return;
        }
        const target = currentImage();
        if (!target.path) {
            setStatus('Open an image first, then apply the contours.', 'error');
            return;
        }
        const levels = readLevels(popup.querySelector('#contour-levels').value);
        if (!levels.length) {
            setStatus('Generate levels, or type them in, before applying.', 'error');
            return;
        }
        const smooth = Math.round(Number(popup.querySelector('#contour-smooth').value));
        state.color = popup.querySelector('#contour-color').value || '#00e676';
        state.width = Math.max(0.5, Number(popup.querySelector('#contour-width').value) || 1);
        state.dash = !!popup.querySelector('#contour-dash').checked;
        state.busy = true;
        setStatus('Calculating contours…');
        try {
            const result = await postContours({
                action: 'apply',
                ...sourcePayload(),
                target_path: target.path,
                target_hdu: target.hdu,
                target_slice: target.slice,
                smooth: Number.isFinite(smooth) ? smooth : 1,
                levels
            });
            if (result.hdu != null) state.hdu = result.hdu;
            renderFileInfo();
            state.lines = Array.isArray(result.lines) ? result.lines : [];
            state.appliedKey = imageKey(target);
            ensureOverlay();
            hookViewer();
            drawContours();
            const notes = Array.isArray(result.messages) ? result.messages.filter(Boolean) : [];
            const count = Number(result.count) || state.lines.length;
            setStatus(count ? [`${count} contour${count === 1 ? '' : 's'} on the image.`, ...notes].join(' ') : 'No contour at these levels.');
        } catch (error) {
            setStatus(error.message || 'Contours could not be calculated.', 'error');
        } finally {
            state.busy = false;
        }
    }

    function chooseFile() {
        const host = hostWindow();
        const opener = (host && typeof host.showFileBrowser === 'function')
            ? host.showFileBrowser.bind(host)
            : (typeof showFileBrowser === 'function' ? showFileBrowser : null);
        if (!opener) {
            setStatus('File browser is not available.', 'error');
            return;
        }
        opener(async (selected) => {
            if (!selected) return;
            const current = currentImage();
            const same = pathsMatch(selected, current.path);
            state.path = selected;
            state.hdu = same ? current.hdu : null;
            state.hduChoices = [];
            renderFileInfo();
            setStatus('Reading the file…');
            try {
                const list = (typeof getFitsHduInfo === 'function') ? await getFitsHduInfo(selected) : [];
                const images = imageHdus(list);
                state.hduChoices = images;
                if (same && images.some((hdu) => Number(hdu.index) === Number(current.hdu))) {
                    state.hdu = current.hdu;
                } else if (images.length) {
                    const recommended = images.find((hdu) => hdu.isRecommended) || images[0];
                    state.hdu = Number.isFinite(Number(recommended.index)) ? Number(recommended.index) : 0;
                } else if (state.hdu == null) {
                    state.hdu = 0;
                }
                renderFileInfo();
                await loadLimits('99');
            } catch (error) {
                if (state.hdu == null) state.hdu = 0;
                renderFileInfo();
                setStatus(error.message || 'Could not read the HDU list.', 'error');
            }
        });
    }

    function buildPopup() {
        const element = document.createElement('div');
        element.id = 'contour-popup';
        Object.assign(element.style, {
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: '#333',
            border: '1px solid #555',
            borderRadius: '5px',
            padding: '15px',
            zIndex: '65010',
            width: '650px',
            maxWidth: 'calc(100vw - 24px)',
            boxSizing: 'border-box',
            boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
            display: 'none',
            maxHeight: 'calc(100vh - 24px)',
            overflowX: 'hidden',
            overflowY: 'auto',
            color: '#fff'
        });
        ensureAnim(element);

        const title = document.createElement('h3');
        title.textContent = 'Contours';
        Object.assign(title.style, {
            margin: '0 0 15px 0',
            color: '#fff',
            fontFamily: 'Arial, sans-serif',
            fontSize: '18px',
            fontWeight: 'bold',
            borderBottom: '1px solid #555',
            paddingBottom: '10px',
            cursor: 'grab'
        });

        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.textContent = '×';
        Object.assign(closeButton.style, {
            position: 'absolute',
            top: '10px',
            right: '10px',
            backgroundColor: 'transparent',
            border: 'none',
            color: '#aaa',
            fontSize: '20px',
            cursor: 'pointer',
            padding: '0',
            width: '24px',
            height: '24px',
            lineHeight: '24px',
            textAlign: 'center',
            borderRadius: '12px'
        });
        closeButton.addEventListener('mouseover', () => {
            closeButton.style.backgroundColor = '#555';
            closeButton.style.color = '#fff';
        });
        closeButton.addEventListener('mouseout', () => {
            closeButton.style.backgroundColor = 'transparent';
            closeButton.style.color = '#aaa';
        });
        closeButton.addEventListener('click', () => {
            element.__nelouraHide ? element.__nelouraHide() : (element.style.display = 'none');
        });

        const infoBar = document.createElement('div');
        infoBar.id = 'contour-file-info';
        Object.assign(infoBar.style, {
            backgroundColor: '#2a2a2a',
            color: '#ddd',
            padding: '8px 10px',
            border: '1px solid #444',
            borderRadius: '4px',
            marginBottom: '12px',
            fontFamily: 'monospace',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
        });
        const fileSpan = document.createElement('span');
        fileSpan.id = 'contour-file-text';
        Object.assign(fileSpan.style, { flex: '1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' });
        const hduHost = document.createElement('span');
        hduHost.id = 'contour-hdu-host';
        Object.assign(hduHost.style, { flex: 'none', whiteSpace: 'nowrap' });
        const openButton = actionButton('Open file');
        openButton.style.flex = '0 0 auto';
        openButton.style.margin = '0';
        openButton.style.padding = '4px 10px';
        openButton.style.fontFamily = 'monospace';
        openButton.style.fontSize = '12px';
        openButton.addEventListener('click', chooseFile);
        infoBar.appendChild(fileSpan);
        infoBar.appendChild(hduHost);
        infoBar.appendChild(openButton);

        function row(caption, control) {
            const wrap = document.createElement('div');
            wrap.style.marginBottom = '10px';
            const label = document.createElement('label');
            labelStyle(label, caption);
            wrap.appendChild(label);
            wrap.appendChild(control);
            return wrap;
        }

        const numberInput = document.createElement('input');
        numberInput.id = 'contour-number';
        numberInput.type = 'number';
        numberInput.min = '1';
        numberInput.max = '50';
        numberInput.value = '5';
        fieldStyle(numberInput);
        numberInput.style.width = '100%';

        const scaleInput = document.createElement('select');
        scaleInput.id = 'contour-scale';
        ['linear', 'log', 'pow', 'sqrt', 'squared', 'asinh'].forEach((name) => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name.charAt(0).toUpperCase() + name.slice(1);
            scaleInput.appendChild(option);
        });
        fieldStyle(scaleInput);
        scaleInput.style.width = '100%';

        const smoothInput = document.createElement('input');
        smoothInput.id = 'contour-smooth';
        smoothInput.type = 'number';
        smoothInput.min = '1';
        smoothInput.max = '64';
        smoothInput.value = '1';
        fieldStyle(smoothInput);
        smoothInput.style.width = '100%';

        const colorInput = document.createElement('input');
        colorInput.id = 'contour-color';
        colorInput.type = 'color';
        colorInput.value = '#00e676';
        Object.assign(colorInput.style, {
            width: '100%',
            height: '30px',
            cursor: 'pointer',
            backgroundColor: '#444',
            border: '1px solid #555',
            borderRadius: '3px',
            boxSizing: 'border-box',
            padding: '0'
        });
        const widthInput = document.createElement('input');
        widthInput.id = 'contour-width';
        widthInput.type = 'number';
        widthInput.min = '1';
        widthInput.max = '8';
        widthInput.value = '1';
        fieldStyle(widthInput);
        widthInput.style.width = '100%';
        const dashLabel = document.createElement('label');
        Object.assign(dashLabel.style, {
            color: '#ddd',
            fontSize: '13px',
            fontFamily: 'Arial, sans-serif',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginTop: '6px'
        });
        const dashInput = document.createElement('input');
        dashInput.id = 'contour-dash';
        dashInput.type = 'checkbox';
        dashLabel.appendChild(dashInput);
        dashLabel.appendChild(document.createTextNode('Dash'));

        const limits = document.createElement('div');
        Object.assign(limits.style, { display: 'flex', gap: '8px' });
        const minInput = document.createElement('input');
        minInput.id = 'contour-min';
        minInput.type = 'text';
        minInput.placeholder = 'data min';
        fieldStyle(minInput);
        minInput.style.flex = '1';
        minInput.style.width = '0';
        const maxInput = document.createElement('input');
        maxInput.id = 'contour-max';
        maxInput.type = 'text';
        maxInput.placeholder = 'data max';
        fieldStyle(maxInput);
        maxInput.style.flex = '1';
        maxInput.style.width = '0';
        limits.appendChild(minInput);
        limits.appendChild(maxInput);
        const percentileRow = document.createElement('div');
        Object.assign(percentileRow.style, { display: 'flex', gap: '4px', marginTop: '6px' });
        PERCENTILE_PRESETS.forEach((preset) => {
            const button = actionButton(preset.label);
            button.dataset.contourPercentile = preset.id;
            button.style.flex = '1';
            button.style.margin = '0';
            button.style.padding = '3px 0';
            button.style.fontSize = '11px';
            button.title = `Set the limits to the ${preset.low}% and ${preset.high}% levels`;
            if (preset.id === '99') {
                button.style.backgroundColor = '#007bff';
                button.dataset.tone = '#007bff';
            }
            button.addEventListener('click', () => loadLimits(preset.id));
            percentileRow.appendChild(button);
        });
        const limitsWrap = document.createElement('div');
        limitsWrap.appendChild(limits);
        limitsWrap.appendChild(percentileRow);

        const levelsInput = document.createElement('textarea');
        levelsInput.id = 'contour-levels';
        levelsInput.rows = 5;
        levelsInput.placeholder = 'Generate fills these. You can edit them.';
        fieldStyle(levelsInput);
        levelsInput.style.width = '100%';
        levelsInput.style.resize = 'vertical';
        levelsInput.style.fontFamily = 'monospace';

        const status = document.createElement('div');
        status.className = 'contour-status';
        Object.assign(status.style, {
            minHeight: '18px',
            margin: '2px 0 10px',
            color: '#bbb',
            fontFamily: 'Arial, sans-serif',
            fontSize: '12px',
            lineHeight: '1.4'
        });

        const buttons = document.createElement('div');
        Object.assign(buttons.style, { display: 'flex', gap: '8px', minWidth: '0' });
        const clearButton = actionButton('Clear');
        const generateButton = actionButton('Generate');
        const applyButton = actionButton('Apply');
        [clearButton, generateButton, applyButton].forEach((button) => { button.style.margin = '0'; });
        applyButton.dataset.tone = '#007bff';
        applyButton.style.backgroundColor = '#007bff';
        clearButton.addEventListener('click', clearContours);
        generateButton.addEventListener('click', generateLevels);
        applyButton.addEventListener('click', applyContours);
        buttons.appendChild(clearButton);
        buttons.appendChild(generateButton);
        buttons.appendChild(applyButton);

        function columnBox(legendText) {
            const section = document.createElement('fieldset');
            Object.assign(section.style, {
                border: '1px solid #555',
                borderRadius: '4px',
                padding: '10px',
                margin: '0',
                minWidth: '0',
                minInlineSize: '0',
                maxWidth: '100%',
                boxSizing: 'border-box'
            });
            const legend = document.createElement('legend');
            legend.textContent = legendText;
            Object.assign(legend.style, { color: '#ccc', padding: '0 5px', fontSize: '14px' });
            section.appendChild(legend);
            return section;
        }

        const columns = document.createElement('div');
        Object.assign(columns.style, {
            display: 'flex',
            flexDirection: 'row',
            gap: '15px',
            marginBottom: '12px',
            minWidth: '0',
            width: '100%'
        });
        const left = columnBox('Contour levels');
        left.appendChild(row('Number', numberInput));
        left.appendChild(row('Scale', scaleInput));
        left.appendChild(row('Smooth', smoothInput));
        left.appendChild(row('Limits', limitsWrap));
        left.appendChild(row('Levels', levelsInput));
        const right = columnBox('Appearance');
        right.appendChild(row('Color', colorInput));
        right.appendChild(row('Width', widthInput));
        right.appendChild(dashLabel);
        columns.appendChild(left);
        columns.appendChild(right);
        left.style.flex = '1.2';
        right.style.flex = '0.8';

        element.appendChild(title);
        element.appendChild(closeButton);
        element.appendChild(infoBar);
        element.appendChild(columns);
        element.appendChild(status);
        element.appendChild(buttons);
        document.body.appendChild(element);
        renderFileInfo();
        if (typeof makeDraggable === 'function') makeDraggable(element, title);
        else if (typeof enablePopupDrag === 'function') enablePopupDrag(element, title);
        return element;
    }

    function openContoursPopup() {
        if (!popup || !popup.isConnected) popup = buildPopup();
        if (popup.__nelouraShow) popup.__nelouraShow();
        else popup.style.display = 'block';
        hookViewer();
    }

    window.openContoursPopup = openContoursPopup;
    window.clearContours = clearContours;
})();

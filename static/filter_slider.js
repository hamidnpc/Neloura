(function () {
    'use strict';

    const state = {
        galaxy: '',
        items: [],
        index: 0,
        switching: false,
        queued: null,
        pending: null,
        blobUrls: [],
        rail: null,
        filters: [],
        others: [],
        othersOpen: false,
        nedCache: new Map(),
        nedToken: 0,
        identifyToken: 0
    };

    function request(url, options) {
        if (typeof window.apiFetch === 'function') return window.apiFetch(url, options || {});
        return fetch(url, options || {});
    }

    function arcsecPerPixel() {
        if (typeof window.catalogArcsecPerPixel === 'function') {
            const scale = window.catalogArcsecPerPixel();
            if (scale > 0) return scale;
        }
        try {
            const w = window.fitsData && window.fitsData.wcs;
            if (!w) return null;
            const num = (value) => {
                const n = Number(value);
                return Number.isFinite(n) ? n : null;
            };
            const cd11 = num(w.CD1_1 != null ? w.CD1_1 : w.CDELT1) || 0;
            const cd12 = num(w.CD1_2) || 0;
            const cd21 = num(w.CD2_1) || 0;
            const cd22 = num(w.CD2_2 != null ? w.CD2_2 : w.CDELT2) || 0;
            const scaleX = Math.hypot(cd11, cd21);
            const scaleY = Math.hypot(cd12, cd22);
            const avg = (scaleX > 0 && scaleY > 0) ? (scaleX + scaleY) / 2 : (scaleX > 0 ? scaleX : scaleY);
            return avg > 0 ? 3600 * avg : null;
        } catch (_) {
            return null;
        }
    }

    function imageWidthPx() {
        try {
            const view = viewer();
            const item = view && view.world && typeof view.world.getItemAt === 'function' ? view.world.getItemAt(0) : null;
            if (item && typeof item.getContentSize === 'function') {
                const size = item.getContentSize();
                if (size && Number(size.x) > 1) return Number(size.x);
            }
        } catch (_) { /* use the header size below */ }
        const width = Number(window.fitsData && window.fitsData.width);
        return Number.isFinite(width) && width > 1 ? width : null;
    }

    function viewer() {
        return window.tiledViewer || window.viewer || null;
    }

    function imageIsOpen() {
        const view = viewer();
        return !!(view && typeof view.isOpen === 'function' && view.isOpen());
    }

    function rgbMode() {
        return !!(window.__rgbModeActive || (window.fitsData && window.fitsData.rgb_mode));
    }

    function hideRail() {
        if (state.rail) state.rail.style.display = 'none';
    }

    function revokeBlobs() {
        state.blobUrls.forEach((url) => {
            try { URL.revokeObjectURL(url); } catch (_) { /* noop */ }
        });
        state.blobUrls = [];
    }

    function ensureRail() {
        if (state.rail && state.rail.isConnected) return state.rail;
        const rail = document.createElement('div');
        rail.id = 'filter-rail';
        rail.className = 'filter-rail';
        rail.style.display = 'none';
        rail.innerHTML = `
            <div class="filter-rail-galaxy"></div>
            <button type="button" class="filter-rail-ned" hidden title="Galaxy information from NED">Get info</button>
            <div class="filter-rail-window">
                <div class="filter-rail-track"></div>
                <div class="filter-rail-scroller">
                    <div class="filter-rail-strip"></div>
                </div>
            </div>
        `;
        document.body.appendChild(rail);
        const scroller = rail.querySelector('.filter-rail-scroller');
        if (scroller) scroller.addEventListener('scroll', hideFileTip, { passive: true });
        const nedButton = rail.querySelector('.filter-rail-ned');
        if (nedButton) {
            nedButton.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                openNedOverview();
            });
        }
        state.rail = rail;
        return rail;
    }

    function stripEl() {
        return state.rail && state.rail.querySelector('.filter-rail-strip');
    }

    function scrollCurrentIntoView() {
        const windowEl = state.rail && state.rail.querySelector('.filter-rail-scroller');
        const current = state.rail && state.rail.querySelector('.filter-rail-item.is-current');
        if (!windowEl || !current) return;
        const top = current.offsetTop - (windowEl.clientHeight - current.offsetHeight) / 2;
        windowEl.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }

    function renderRail(keepImages, scrollMode) {
        const rail = ensureRail();
        const filtersVisible = state.filters.length >= 2 || (state.filters.length >= 1 && state.others.length > 0);
        if ((!filtersVisible && !state.galaxy) || rgbMode()) {
            hideRail();
            return;
        }
        rail.classList.toggle('filter-rail-name-only', !filtersVisible);
        rail.style.display = 'flex';
        const galaxy = rail.querySelector('.filter-rail-galaxy');
        if (galaxy) galaxy.textContent = String(state.galaxy || '').toUpperCase();
        const nedButton = rail.querySelector('.filter-rail-ned');
        if (nedButton) nedButton.hidden = !state.galaxy;
        const strip = stripEl();
        if (!strip) return;
        if (!keepImages) {
            revokeBlobs();
            strip.innerHTML = '';
            const appendFile = (item, index) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'filter-rail-item';
                button.dataset.index = String(index);
                const fullName = thumbTitle(item);
                button.title = fullName;
                button.addEventListener('mouseenter', () => showFileTip(button, fullName));
                button.addEventListener('mouseleave', hideFileTip);
                const img = document.createElement('img');
                img.alt = item.label || '';
                img.draggable = false;
                const spinner = document.createElement('i');
                spinner.className = 'filter-rail-spinner';
                spinner.setAttribute('aria-hidden', 'true');
                const caption = document.createElement('span');
                caption.textContent = item.label || item.filter || '';
                button.appendChild(img);
                button.appendChild(spinner);
                button.appendChild(caption);
                button.classList.add('is-loading');
                button.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    switchTo(index);
                });
                strip.appendChild(button);
            };
            state.filters.forEach((item, index) => appendFile(item, index));
            if (state.others.length) {
                const more = document.createElement('button');
                more.type = 'button';
                more.className = 'filter-rail-others';
                if (state.othersOpen) more.classList.add('is-open');
                more.textContent = 'Others';
                more.title = state.othersOpen ? 'Hide the other files in this folder' : 'Show the other files in this folder';
                more.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    state.othersOpen = !state.othersOpen;
                    state.items = visibleItems();
                    renderRail(false, state.othersOpen ? 'end' : 'current');
                });
                strip.appendChild(more);
            }
            if (state.othersOpen) {
                state.others.forEach((item, index) => appendFile(item, state.filters.length + index));
            }
            loadThumbs().catch(() => {});
        }
        strip.querySelectorAll('.filter-rail-item').forEach((button, index) => {
            button.classList.toggle('is-current', index === state.index);
        });
        if (scrollMode === 'end') scrollOthersIntoView();
        else scrollCurrentIntoView();
    }

    function visibleItems() {
        return state.othersOpen ? state.filters.concat(state.others) : state.filters.slice();
    }

    function scrollOthersIntoView() {
        const windowEl = state.rail && state.rail.querySelector('.filter-rail-scroller');
        const button = state.rail && state.rail.querySelector('.filter-rail-others');
        if (!windowEl || !button) return;
        windowEl.scrollTo({ top: windowEl.scrollHeight, behavior: 'smooth' });
    }

    async function loadThumbs() {
        const buttons = state.rail ? Array.from(state.rail.querySelectorAll('.filter-rail-item')) : [];
        const order = buttons
            .map((button, index) => ({ button, index, distance: Math.abs(index - state.index) }))
            .sort((a, b) => a.distance - b.distance);
        let cursor = 0;
        async function worker() {
            while (cursor < order.length) {
                const job = order[cursor];
                cursor += 1;
                const item = state.items[job.index];
                const img = job.button.querySelector('img');
                if (!item || !img) continue;
                const finish = () => {
                    job.button.classList.remove('is-loading');
                    const spinner = job.button.querySelector('.filter-rail-spinner');
                    if (spinner) spinner.remove();
                };
                try {
                    const url = `/fits/preview/?filepath=${encodeURIComponent(item.filepath)}&max_dim=64&color_map=gray&scaling_function=sqrt&v=${Date.now()}`;
                    const response = await request(url, { cache: 'no-store' });
                    if (!response || !response.ok) {
                        finish();
                        continue;
                    }
                    const blob = await response.blob();
                    const objectUrl = URL.createObjectURL(blob);
                    state.blobUrls.push(objectUrl);
                    img.onload = finish;
                    img.onerror = finish;
                    img.src = objectUrl;
                } catch (_) {
                    finish();
                }
            }
        }
        await Promise.all([worker(), worker()]);
    }

    function fileTip() {
        let tip = document.getElementById('filter-rail-tip');
        if (tip) return tip;
        tip = document.createElement('div');
        tip.id = 'filter-rail-tip';
        tip.className = 'filter-rail-tip';
        tip.hidden = true;
        document.body.appendChild(tip);
        return tip;
    }

    function showFileTip(button, text) {
        const name = String(text || '').trim();
        if (!name || !button) return;
        const tip = fileTip();
        tip.textContent = name;
        tip.hidden = false;
        const rect = button.getBoundingClientRect();
        const top = Math.max(12, Math.min(window.innerHeight - 12, rect.top + rect.height / 2));
        tip.style.top = `${Math.round(top)}px`;
        tip.style.right = `${Math.round(window.innerWidth - rect.left + 10)}px`;
        tip.style.left = 'auto';
    }

    function hideFileTip() {
        const tip = document.getElementById('filter-rail-tip');
        if (tip) tip.hidden = true;
    }

    function thumbTitle(item) {
        const path = String((item && item.filepath) || '').replace(/\\/g, '/').replace(/^\/+/, '');
        const trimmed = path.replace(/^files\//, '');
        return trimmed || (item && (item.label || item.filter)) || '';
    }

    function finitePair(point) {
        return !!(point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y)));
    }

    function jsPixelToSky(x, y) {
        if (typeof window.pixelToWorldGeneric !== 'function') return null;
        const world = window.pixelToWorldGeneric(Number(x), Number(y));
        if (!world || !Number.isFinite(Number(world.ra)) || !Number.isFinite(Number(world.dec))) return null;
        return { ra: Number(world.ra), dec: Number(world.dec) };
    }

    function jsSkyToPixel(ra, dec) {
        if (typeof window.worldToPixelGeneric !== 'function') return null;
        const pixel = window.worldToPixelGeneric(Number(ra), Number(dec));
        if (!pixel || !Number.isFinite(Number(pixel.x)) || !Number.isFinite(Number(pixel.y))) return null;
        return { x: Number(pixel.x), y: Number(pixel.y) };
    }

    async function displayPixelToSky(x, y, filepath, hdu) {
        const ask = async (px, py) => {
            const params = new URLSearchParams({
                x: String(px),
                y: String(py),
                origin: 'top'
            });
            if (filepath) params.set('filepath', filepath);
            if (Number.isFinite(Number(hdu))) params.set('hdu', String(hdu));
            const response = await request('/pixel-to-world/?' + params.toString());
            if (!response || !response.ok) return null;
            const data = await response.json();
            if (!Number.isFinite(Number(data.ra)) || !Number.isFinite(Number(data.dec))) return null;
            return { ra: Number(data.ra), dec: Number(data.dec) };
        };
        try {
            const exact = await ask(x, y);
            if (exact) return exact;
            const ix = Math.round(Number(x));
            const iy = Math.round(Number(y));
            if (ix !== Number(x) || iy !== Number(y)) {
                const rounded = await ask(ix, iy);
                if (rounded) return rounded;
            }
        } catch (_) { /* use the local WCS below */ }
        return jsPixelToSky(x, y);
    }

    async function skyToDisplayPixels(points, filepath, hdu) {
        const result = new Array(points.length).fill(null);
        const pending = [];
        points.forEach((point, index) => {
            if (point && Number.isFinite(Number(point.ra)) && Number.isFinite(Number(point.dec))) {
                pending.push({ ra: Number(point.ra), dec: Number(point.dec), index: index });
            }
        });
        if (pending.length) {
            try {
                const response = await request('/world-to-pixel/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        points: pending,
                        filepath: filepath || undefined,
                        hdu: Number.isFinite(Number(hdu)) ? Number(hdu) : undefined,
                        origin: 'top'
                    })
                });
                if (response && response.ok) {
                    const data = await response.json();
                    const height = Number(data.height);
                    const flip = !!data.flip_y;
                    (data.pixels || []).forEach((pixel) => {
                        if (!pixel || !pixel.valid) return;
                        const x = Number(pixel.x);
                        let y = Number(pixel.y);
                        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
                        if (flip && Number.isFinite(height)) y = (height - 1) - y;
                        const index = Number(pixel.index);
                        if (index >= 0 && index < result.length) result[index] = { x: x, y: y };
                    });
                }
            } catch (_) { /* fill the gaps from the local WCS */ }
        }
        points.forEach((point, index) => {
            if (result[index] || !point) return;
            result[index] = jsSkyToPixel(point.ra, point.dec);
        });
        return result;
    }

    function attachMeasurablePoints(shape) {
        const points = [];
        const push = (point) => {
            if (finitePair(point)) points.push(point);
        };
        ['center', 'start', 'end'].forEach((key) => push(shape[key]));
        if (Array.isArray(shape.vertices)) shape.vertices.forEach(push);
        if (Number.isFinite(Number(shape.x1)) && Number.isFinite(Number(shape.y1))) {
            shape._c1 = { x: Number(shape.x1), y: Number(shape.y1) };
            push(shape._c1);
        }
        if (Number.isFinite(Number(shape.x2)) && Number.isFinite(Number(shape.y2))) {
            shape._c2 = { x: Number(shape.x2), y: Number(shape.y2) };
            push(shape._c2);
        }
        if (finitePair(shape.center)) {
            const cx = Number(shape.center.x);
            const cy = Number(shape.center.y);
            const addRim = (key, dx, dy) => {
                if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return;
                shape[key] = { x: cx + dx, y: cy + dy };
                push(shape[key]);
            };
            if (Number.isFinite(Number(shape.radius))) addRim('_rim', Number(shape.radius), 0);
            if (Number.isFinite(Number(shape.radiusX))) addRim('_rimX', Number(shape.radiusX), 0);
            if (Number.isFinite(Number(shape.radiusY))) addRim('_rimY', 0, Number(shape.radiusY));
            if (Number.isFinite(Number(shape.innerRadius))) addRim('_rimIn', Number(shape.innerRadius), 0);
            if (Number.isFinite(Number(shape.outerRadius))) addRim('_rimOut', Number(shape.outerRadius), 0);
            if (Number.isFinite(Number(shape.width))) addRim('_rimW', Number(shape.width), 0);
            if (Number.isFinite(Number(shape.height))) addRim('_rimH', 0, Number(shape.height));
        }
        return points;
    }

    function placePoint(point, pixel) {
        if (!point || !pixel) return;
        point.x = pixel.x;
        point.y = pixel.y;
        point._placed = true;
    }

    function applyRim(shape, lengthKey, rimKey) {
        const rim = shape[rimKey];
        const center = shape.center;
        if (rim && rim._placed && center && center._placed) {
            const distance = Math.hypot(Number(rim.x) - Number(center.x), Number(rim.y) - Number(center.y));
            if (Number.isFinite(distance) && distance > 0) shape[lengthKey] = distance;
        }
        delete shape[rimKey];
    }

    function finishShape(shape) {
        if (shape._c1 && shape._c1._placed) {
            shape.x1 = shape._c1.x;
            shape.y1 = shape._c1.y;
        }
        if (shape._c2 && shape._c2._placed) {
            shape.x2 = shape._c2.x;
            shape.y2 = shape._c2.y;
        }
        delete shape._c1;
        delete shape._c2;
        applyRim(shape, 'radius', '_rim');
        applyRim(shape, 'radiusX', '_rimX');
        applyRim(shape, 'radiusY', '_rimY');
        applyRim(shape, 'innerRadius', '_rimIn');
        applyRim(shape, 'outerRadius', '_rimOut');
        applyRim(shape, 'width', '_rimW');
        applyRim(shape, 'height', '_rimH');
        ['center', 'start', 'end'].forEach((key) => {
            if (shape[key]) delete shape[key]._placed;
        });
        if (Array.isArray(shape.vertices)) shape.vertices.forEach((point) => { if (point) delete point._placed; });
        return shape;
    }

    async function annotateRegions(regions, filepath, hdu) {
        const copies = (regions || []).map((shape) => JSON.parse(JSON.stringify(shape)));
        const jobs = [];
        copies.forEach((shape) => {
            attachMeasurablePoints(shape).forEach((point) => jobs.push(point));
        });
        await Promise.all(jobs.map(async (point) => {
            const sky = await displayPixelToSky(point.x, point.y, filepath, hdu);
            if (!sky) return;
            point.ra = sky.ra;
            point.dec = sky.dec;
        }));
        return copies;
    }

    async function reprojectRegions(regions, filepath, hdu) {
        const copies = (regions || []).map((shape) => JSON.parse(JSON.stringify(shape)));
        const points = [];
        copies.forEach((shape) => {
            ['center', 'start', 'end', '_c1', '_c2', '_rim', '_rimX', '_rimY', '_rimIn', '_rimOut', '_rimW', '_rimH'].forEach((key) => {
                if (shape[key]) points.push(shape[key]);
            });
            if (Array.isArray(shape.vertices)) shape.vertices.forEach((point) => points.push(point));
        });
        const pixels = await skyToDisplayPixels(points, filepath, hdu);
        points.forEach((point, index) => placePoint(point, pixels[index]));
        return copies.map(finishShape);
    }

    async function snapshotOverlays(filepath, hdu) {
        const snap = { regions: [], catalogs: [], view: null, activeCatalog: null, sourceFile: filepath, sourceHdu: hdu };
        // Capture catalogs and the view before the first await. An HDU switch
        // clears catalogs as soon as this function yields.
        try {
            const loaded = (typeof window.getLoadedCatalogOverlays === 'function') ? (window.getLoadedCatalogOverlays() || []) : [];
            const styles = window.__catalogStylesByName || {};
            snap.catalogs = loaded.map((entry) => {
                const key = entry && entry.key ? String(entry.key) : '';
                const apiKey = key.split('/').pop();
                const style = styles[key] || styles[apiKey] || null;
                let copied = null;
                try { copied = style ? JSON.parse(JSON.stringify(style)) : null; } catch (_) { copied = style; }
                return {
                    key,
                    visible: entry.visible !== false,
                    styles: copied
                };
            }).filter((entry) => entry.key);
            snap.activeCatalog = window.currentCatalogName || window.activeCatalog || null;
        } catch (_) { /* noop */ }
        let rawRegions = [];
        try {
            if (typeof window.listDrawnRegions === 'function') rawRegions = window.listDrawnRegions() || [];
        } catch (_) { rawRegions = []; }
        let zoom = null;
        let imagePoint = null;
        let angW = null;
        let angH = null;
        try {
            const view = viewer();
            if (view && view.viewport && typeof view.viewport.getCenter === 'function') {
                zoom = view.viewport.getZoom();
                const center = view.viewport.getCenter(true);
                imagePoint = view.viewport.viewportToImageCoordinates(center);
                const bounds = view.viewport.getBounds(true);
                const widthPx = imageWidthPx();
                const scale = arcsecPerPixel();
                if (bounds && bounds.width > 0 && bounds.height > 0 && widthPx > 0 && scale > 0) {
                    angW = bounds.width * widthPx * scale;
                    angH = bounds.height * widthPx * scale;
                }
            }
        } catch (_) { /* noop */ }
        try {
            snap.regions = await annotateRegions(rawRegions, filepath, hdu);
        } catch (_) { /* noop */ }
        try {
            let world = null;
            if (imagePoint) world = await displayPixelToSky(imagePoint.x, imagePoint.y, filepath, hdu);
            if (zoom != null || world) {
                snap.view = {
                    zoom,
                    ra: world && Number.isFinite(world.ra) ? world.ra : null,
                    dec: world && Number.isFinite(world.dec) ? world.dec : null,
                    arcsecPerPixel: arcsecPerPixel(),
                    imageWidth: imageWidthPx(),
                    angW: angW,
                    angH: angH
                };
            }
        } catch (_) { /* noop */ }
        return snap;
    }

    async function waitForWcs() {
        const started = Date.now();
        while (Date.now() - started < 4500) {
            try {
                if (typeof window.refreshWcsForOverlay === 'function') {
                    window.refreshWcsForOverlay({ filepath: window.currentFitsFile, hduIndex: window.currentHduIndex });
                }
            } catch (_) { /* noop */ }
            const openName = window.fitsData && window.fitsData.filename;
            const openFile = window.currentFitsFile;
            const headerIsCurrent = !!(openName && openFile && String(openName) === String(openFile) && window.fitsData.wcs);
            if (headerIsCurrent) return true;
            await new Promise((resolve) => setTimeout(resolve, 160));
        }
        return false;
    }

    function viewerShowsCurrentImage() {
        const expected = Number(window.fitsData && window.fitsData.width);
        const live = imageWidthPx();
        return expected > 1 && live > 1 && Math.abs(live - expected) < 2;
    }

    async function restoreView(viewState, filepath, hdu) {
        const view = viewer();
        if (!view || !view.viewport || !viewState) return;
        let pixel = null;
        try {
            if (Number.isFinite(viewState.ra) && Number.isFinite(viewState.dec) && typeof OpenSeadragon !== 'undefined') {
                const pixels = await skyToDisplayPixels([{ ra: viewState.ra, dec: viewState.dec }], filepath, hdu);
                pixel = pixels && pixels[0];
            }
        } catch (_) { pixel = null; }
        const apply = () => {
            const live = viewer();
            if (!live || !live.viewport || !viewerShowsCurrentImage()) return false;
            try {
                if (typeof live.viewport.setRotation === 'function') live.viewport.setRotation(0);
                const destScale = arcsecPerPixel();
                const centerOk = pixel && Number.isFinite(pixel.x) && Number.isFinite(pixel.y);
                if (centerOk && viewState.angW > 0 && viewState.angH > 0 && destScale > 0
                    && typeof live.viewport.imageToViewportRectangle === 'function') {
                    const widthPx = viewState.angW / destScale;
                    const heightPx = viewState.angH / destScale;
                    const imageRect = new OpenSeadragon.Rect(
                        pixel.x - widthPx / 2,
                        pixel.y - heightPx / 2,
                        widthPx,
                        heightPx
                    );
                    live.viewport.fitBounds(live.viewport.imageToViewportRectangle(imageRect), true);
                    return true;
                }
                let zoom = viewState.zoom;
                const destWidth = imageWidthPx();
                if (Number.isFinite(zoom) && viewState.arcsecPerPixel > 0 && viewState.imageWidth > 0 && destScale > 0 && destWidth > 0) {
                    zoom = zoom * (destWidth * destScale) / (viewState.imageWidth * viewState.arcsecPerPixel);
                }
                if (centerOk) {
                    const viewportPoint = live.viewport.imageToViewportCoordinates(new OpenSeadragon.Point(pixel.x, pixel.y));
                    if (Number.isFinite(zoom)) live.viewport.zoomTo(zoom, viewportPoint, true);
                    live.viewport.panTo(viewportPoint, true);
                    return true;
                }
                if (Number.isFinite(zoom)) live.viewport.zoomTo(zoom, null, true);
            } catch (_) { /* the next open event tries again */ }
            return false;
        };
        const token = (state.viewToken = (state.viewToken || 0) + 1);
        const onOpen = () => {
            if (state.viewToken !== token) return;
            if (!apply()) return;
            try { view.removeHandler('open', onOpen); } catch (_) { /* noop */ }
        };
        try { view.addHandler('open', onOpen); } catch (_) { /* noop */ }
        apply();
        setTimeout(() => {
            if (state.viewToken !== token) return;
            apply();
            try { view.removeHandler('open', onOpen); } catch (_) { /* noop */ }
        }, 2500);
    }

    function rememberActiveCatalog(name) {
        if (!name) return;
        try { window.currentCatalogName = name; } catch (_) {}
        try { window.activeCatalog = name; } catch (_) {}
        try { activeCatalog = name; } catch (_) {}
    }

    async function restoreOverlays(snap) {
        if (!snap) return;
        rememberActiveCatalog(snap.activeCatalog);
        const destFile = window.currentFitsFile || (window.fitsData && window.fitsData.filename) || snap.filepath;
        const destHdu = window.currentHduIndex;
        const lengthKeys = ['radius', 'radiusX', 'radiusY', 'innerRadius', 'outerRadius', 'width', 'height'];
        try {
            if (snap.regions && snap.regions.length && typeof window.restoreRegionsFromSerialized === 'function') {
                const before = snap.regions.map((shape) => {
                    const saved = {};
                    lengthKeys.forEach((key) => {
                        const value = Number(shape && shape[key]);
                        if (value > 0) saved[key] = value;
                    });
                    return saved;
                });
                const placed = await reprojectRegions(snap.regions, destFile, destHdu);
                await waitForWcs();
                const sourceScale = snap.view && Number(snap.view.arcsecPerPixel);
                const destScale = arcsecPerPixel();
                if (sourceScale > 0 && destScale > 0 && Math.abs(sourceScale / destScale - 1) > 0.05) {
                    const ratio = sourceScale / destScale;
                    placed.forEach((shape, index) => {
                        const saved = before[index] || {};
                        lengthKeys.forEach((key) => {
                            const oldValue = saved[key];
                            const newValue = Number(shape && shape[key]);
                            if (!(oldValue > 0) || !(newValue > 0)) return;
                            if (Math.abs(newValue - oldValue) / oldValue < 0.02) shape[key] = oldValue * ratio;
                        });
                    });
                }
                window.restoreRegionsFromSerialized(placed);
            } else {
                await waitForWcs();
            }
        } catch (_) {
            try { await waitForWcs(); } catch (__) { /* noop */ }
        }
        const catalogs = Array.isArray(snap.catalogs) ? snap.catalogs : [];
        for (let i = 0; i < catalogs.length; i += 1) {
            const entry = catalogs[i];
            try {
                if (typeof window.loadCatalogBinaryAsync === 'function') {
                    await window.loadCatalogBinaryAsync(entry.key, entry.styles, { quiet: true, skipCatalogRename: true });
                } else if (typeof window.loadCatalog === 'function') {
                    window.loadCatalog(entry.key, entry.styles);
                }
                if (entry.visible === false && typeof window.setCatalogOverlayVisible === 'function') {
                    window.setCatalogOverlayVisible(entry.key, false);
                }
            } catch (_) { /* keep going through the rest of the catalogs */ }
        }
        try {
            if (typeof window.rescaleCatalogOverlayRadii === 'function') window.rescaleCatalogOverlayRadii();
        } catch (_) { /* noop */ }
        try {
            if (snap.activeCatalog && typeof window.setActiveCatalogForControls === 'function') {
                window.setActiveCatalogForControls(snap.activeCatalog);
            }
        } catch (_) { /* noop */ }
        await restoreView(snap.view, destFile, destHdu);
    }

    async function switchTo(index) {
        if (!state.items.length) return;
        const next = Math.max(0, Math.min(state.items.length - 1, index));
        if (next === state.index) {
            scrollCurrentIntoView();
            return;
        }
        if (state.switching) {
            state.queued = next;
            return;
        }
        const item = state.items[next];
        if (!item || !item.filepath || typeof window.loadFitsFile !== 'function') return;
        state.switching = true;
        state.index = next;
        renderRail(true);
        const sourceFile = window.currentFitsFile || (window.fitsData && window.fitsData.filename) || '';
        const sourceHdu = window.currentHduIndex;
        const snap = await snapshotOverlays(sourceFile, sourceHdu);
        snap.filepath = item.filepath;
        snap.consumed = false;
        state.pending = snap;
        try {
            document.dispatchEvent(new CustomEvent('fits:fileSwitching', { detail: { filepath: item.filepath } }));
        } catch (_) { /* noop */ }
        try {
            window.loadFitsFile(item.filepath);
        } catch (_) {
            state.switching = false;
            state.pending = null;
        }
        setTimeout(() => {
            if (state.pending === snap && !snap.consumed) {
                state.switching = false;
            }
        }, 20000);
    }

    async function consumePending() {
        const snap = state.pending;
        if (!snap || snap.consumed) return;
        const current = window.currentFitsFile || (window.fitsData && window.fitsData.filename) || '';
        if (snap.filepath && current && String(current) !== String(snap.filepath)) return;
        snap.consumed = true;
        try {
            await restoreOverlays(snap);
        } finally {
            if (state.pending === snap) state.pending = null;
            state.switching = false;
            const queued = state.queued;
            state.queued = null;
            if (queued != null && queued !== state.index) switchTo(queued);
        }
    }

    async function refresh(filepath) {
        const path = filepath || window.currentFitsFile || (window.fitsData && window.fitsData.filename) || '';
        if (!path || !imageIsOpen() || rgbMode()) {
            hideRail();
            return;
        }
        try {
            const response = await request(`/api/galaxy-filters?filepath=${encodeURIComponent(path)}`);
            if (!response || !response.ok) {
                hideRail();
                return;
            }
            const data = await response.json();
            const filters = Array.isArray(data.filters) ? data.filters : [];
            const others = Array.isArray(data.others) ? data.others : [];
            const nextGalaxy = data.galaxy || '';
            const identifyToken = state.identifyToken + 1;
            state.identifyToken = identifyToken;
            if (filters.length < 2 && !(filters.length >= 1 && others.length > 0)) {
                state.items = [];
                state.filters = [];
                state.others = [];
                state.galaxy = nextGalaxy;
                if (nextGalaxy) {
                    renderRail(false);
                    return;
                }
                hideRail();
                resolveGalaxyFromHeader(path, identifyToken);
                return;
            }
            const wasOpen = state.othersOpen;
            if (state.galaxy && state.galaxy !== nextGalaxy) state.othersOpen = false;
            if (others.some((item) => item.current)) state.othersOpen = true;
            const same = state.galaxy === nextGalaxy
                && wasOpen === state.othersOpen
                && state.filters.length === filters.length
                && state.filters.every((item, index) => item.filepath === filters[index].filepath)
                && state.others.length === others.length
                && state.others.every((item, index) => item.filepath === others[index].filepath);
            state.galaxy = nextGalaxy;
            state.filters = filters;
            state.others = others;
            state.items = visibleItems();
            const found = state.items.findIndex((item) => item.current || item.filepath === path || item.filepath === data.current);
            state.index = found >= 0 ? found : 0;
            renderRail(same);
        } catch (_) {
            hideRail();
        }
    }

    function onReady(filepath) {
        if (!imageIsOpen()) return;
        refresh(filepath).catch(() => {});
        consumePending().catch(() => {});
    }

    async function resolveGalaxyFromHeader(path, token) {
        if (!path || state.galaxy) return;
        const hdu = Number.isFinite(Number(window.currentHduIndex)) ? Number(window.currentHduIndex) : 0;
        try {
            const response = await request(`/api/ned-identify?filepath=${encodeURIComponent(path)}&hdu=${hdu}`);
            if (!response || !response.ok || token !== state.identifyToken) return;
            const data = await response.json();
            const galaxy = data && data.galaxy ? String(data.galaxy) : '';
            const current = window.currentFitsFile || (window.fitsData && window.fitsData.filename) || '';
            if (!galaxy || token !== state.identifyToken || state.galaxy) return;
            if (current && String(current) !== String(path)) return;
            state.galaxy = galaxy;
            renderRail(false);
        } catch (_) { /* the name stays hidden when NED has no clear galaxy */ }
    }

    function nedQueryName(token) {
        const match = String(token || '').trim().match(/^(ngc|ic|ugc|eso|m)(\d+)$/i);
        if (!match) return String(token || '').trim().toUpperCase();
        return `${match[1].toUpperCase()} ${Number(match[2])}`;
    }

    function nedNumber(value, digits) {
        if (value == null || String(value).trim() === '') return '';
        const number = Number(value);
        if (!Number.isFinite(number)) return '';
        return String(Number(number.toFixed(digits)));
    }

    function nedWithUncertainty(value, uncertainty, digits, unit) {
        const main = nedNumber(value, digits);
        if (!main) return '';
        const error = nedNumber(uncertainty, digits);
        const body = error ? `${main} ± ${error}` : main;
        return unit ? `${body} ${unit}` : body;
    }

    function parseNedOverview(xmlText) {
        const doc = new DOMParser().parseFromString(String(xmlText || ''), 'application/xml');
        if (!doc || doc.querySelector('parsererror')) return null;
        const status = Array.from(doc.getElementsByTagName('*')).find((node) => node.localName === 'PARAM' && node.getAttribute('name') === 'QUERY_STATUS');
        if (status && String(status.getAttribute('value') || '').toUpperCase() === 'ERROR') return null;
        const fields = [];
        const cells = [];
        Array.from(doc.getElementsByTagName('*')).forEach((node) => {
            if (node.localName === 'FIELD') fields.push(node.getAttribute('name') || '');
            else if (node.localName === 'TD') cells.push((node.textContent || '').trim());
        });
        if (!fields.length || cells.length < fields.length) return null;
        const row = {};
        fields.forEach((name, index) => {
            if (name) row[name] = cells[index] || '';
        });
        return row;
    }

    function nedTypeLabel(code) {
        const labels = {
            G: 'Galaxy',
            GPair: 'Galaxy pair',
            GTrpl: 'Galaxy triple',
            GGroup: 'Galaxy group',
            GClstr: 'Galaxy cluster',
            QSO: 'Quasar'
        };
        const text = String(code || '').trim();
        return labels[text] || text;
    }

    function nedAliases(row, query) {
        const wanted = query.replace(/\s+/g, '').toUpperCase();
        return String(row['Cross-identifications'] || '')
            .split(';')
            .map((item) => item.trim())
            .filter((item) => item && item.replace(/\s+/g, '').toUpperCase() !== wanted)
            .slice(0, 4);
    }

    function ensureNedPopup() {
        let popup = document.getElementById('ned-overview-popup');
        if (popup) return popup;
        popup = document.createElement('div');
        popup.id = 'ned-overview-popup';
        Object.assign(popup.style, {
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: '#333',
            border: '1px solid #555',
            borderRadius: '5px',
            padding: '15px',
            zIndex: '60000',
            width: '420px',
            boxSizing: 'border-box',
            boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: 'calc(100vh - 24px)',
            overflow: 'hidden'
        });
        const title = document.createElement('div');
        Object.assign(title.style, {
            margin: '0 0 15px 0',
            color: '#fff',
            fontFamily: 'Arial, sans-serif',
            borderBottom: '1px solid #555',
            paddingBottom: '10px',
            cursor: 'grab',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            flexShrink: '0'
        });
        const titleText = document.createElement('div');
        Object.assign(titleText.style, { fontSize: '18px', fontWeight: 'normal' });
        titleText.textContent = 'NED';
        const fileNameLabel = document.createElement('div');
        fileNameLabel.className = 'scaling-popup-filename';
        Object.assign(fileNameLabel.style, { fontSize: '13px', opacity: '0.8' });
        title.appendChild(titleText);
        title.appendChild(fileNameLabel);
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
            popup.style.display = 'none';
        });
        const body = document.createElement('div');
        body.className = 'ned-overview-body';
        Object.assign(body.style, {
            overflowY: 'auto',
            overflowX: 'hidden',
            flex: '1 1 auto',
            minHeight: '0',
            maxHeight: 'calc(100vh - 110px)',
            paddingRight: '4px',
            color: '#fff',
            fontFamily: 'Arial, sans-serif',
            fontSize: '14px'
        });
        popup.appendChild(title);
        popup.appendChild(closeButton);
        popup.appendChild(body);
        document.body.appendChild(popup);
        if (typeof enablePopupDrag === 'function') enablePopupDrag(popup, title);
        return popup;
    }

    function nedMessage(text) {
        const node = document.createElement('div');
        node.textContent = text;
        node.style.color = '#aaa';
        node.style.fontSize = '14px';
        return node;
    }

    function nedProgress() {
        const wrap = document.createElement('div');
        const label = document.createElement('div');
        label.textContent = 'Loading NED';
        Object.assign(label.style, { color: '#aaa', fontSize: '14px', marginBottom: '10px', fontFamily: 'Arial, sans-serif' });
        const track = document.createElement('div');
        track.className = 'ned-progress-track';
        const fill = document.createElement('div');
        fill.className = 'ned-progress-fill';
        track.appendChild(fill);
        wrap.appendChild(label);
        wrap.appendChild(track);
        return wrap;
    }

    function nedRow(label, value) {
        if (!value) return null;
        const row = document.createElement('div');
        Object.assign(row.style, {
            display: 'flex',
            justifyContent: 'space-between',
            gap: '16px',
            marginBottom: '8px',
            fontFamily: 'Arial, sans-serif',
            fontSize: '14px'
        });
        const name = document.createElement('div');
        name.textContent = label;
        name.style.color = '#aaa';
        name.style.flex = '0 0 auto';
        const detail = document.createElement('div');
        detail.textContent = value;
        Object.assign(detail.style, {
            color: '#fff',
            textAlign: 'right',
            minWidth: '0',
            overflowWrap: 'anywhere'
        });
        row.appendChild(name);
        row.appendChild(detail);
        return row;
    }

    function renderNedOverview(popup, query, row) {
        const subtitle = popup.querySelector('.scaling-popup-filename');
        if (subtitle) subtitle.textContent = query;
        const body = popup.querySelector('.ned-overview-body');
        if (!body) return;
        body.innerHTML = '';
        if (!row) {
            body.appendChild(nedMessage('NED has no overview for this name.'));
            return;
        }
        const activity = String(row['Activity Type'] || '').trim();
        const other = String(row['Other'] || '').trim();
        const morphology = String(row['Morphology'] || '').trim();
        const classification = activity || (other && other !== morphology ? other : '');
        const angular = nedNumber(row['Major Axis'], 0);
        const band = String(row['Bandpass'] || '').trim();
        const physical = nedWithUncertainty(row['Physical Major Axis'], '', 1, 'kpc');
        const size = [physical, angular ? `${angular}″${band ? `, ${band}` : ''}` : ''].filter(Boolean).join(' · ');
        const extinction = [
            nedNumber(row['Galactic Extinction (Landolt V)'], 3) ? `A_V ${nedNumber(row['Galactic Extinction (Landolt V)'], 3)}` : '',
            nedNumber(row['Galactic Extinction (UKIRT K)'], 3) ? `A_K ${nedNumber(row['Galactic Extinction (UKIRT K)'], 3)}` : ''
        ].filter(Boolean).join(', ');
        const position = [row['Lon (Equatorial J2000) in sexagesimal'], row['Lat (Equatorial J2000) in sexagesimal']].filter(Boolean).join('  ');
        const raDeg = nedNumber(row['Lon (Equatorial J2000)'], 6);
        const decValue = row['Lat (Equatorial J2000)'];
        const decDeg = nedNumber(decValue, 6);
        const decText = decDeg && Number(decValue) > 0 ? `+${decDeg}` : decDeg;
        const positionDeg = raDeg && decText ? `${raDeg}°  ${decText}°` : '';
        [
            nedRow('Type', nedTypeLabel(row['Physical Type'])),
            nedRow('Morphology', morphology),
            nedRow('Classification', classification),
            nedRow('Redshift', nedWithUncertainty(row.Redshift, row['Redshift Unc'], 6)),
            nedRow('Velocity', nedWithUncertainty(row['v (Heliocentric)'], row['v Unc (Heliocentric)'], 0, 'km/s')),
            nedRow('Distance', nedWithUncertainty(row['Mean Distance'], row['SEM Distance'], 2, 'Mpc')),
            nedRow('Hubble flow', nedWithUncertainty(row['D (3K CMB)'], row['D Unc (3K CMB)'], 1, 'Mpc')),
            nedRow('Size', size),
            nedRow('Extinction', extinction),
            nedRow('Position', position),
            nedRow('Degrees', positionDeg),
            nedRow('Aliases', nedAliases(row, query).join(', '))
        ].forEach((item) => {
            if (item) body.appendChild(item);
        });
        const note = String(row['Overview Footnote'] || '').trim();
        if (note) {
            const footnote = document.createElement('div');
            footnote.textContent = note;
            Object.assign(footnote.style, { color: '#aaa', fontSize: '12px', marginTop: '8px', lineHeight: '1.4' });
            body.appendChild(footnote);
        }
        if (!body.childNodes.length) {
            body.appendChild(nedMessage('NED has no overview for this name.'));
            return;
        }
        const credit = document.createElement('div');
        credit.textContent = 'NASA/IPAC Extragalactic Database';
        Object.assign(credit.style, { color: '#777', fontSize: '11px', marginTop: '14px' });
        body.appendChild(credit);
    }

    async function openNedOverview() {
        const query = nedQueryName(state.galaxy);
        if (!query) return;
        const popup = ensureNedPopup();
        popup.style.display = 'flex';
        const subtitle = popup.querySelector('.scaling-popup-filename');
        if (subtitle) subtitle.textContent = query;
        const body = popup.querySelector('.ned-overview-body');
        const cached = state.nedCache.get(query);
        if (cached) {
            renderNedOverview(popup, query, cached);
            return;
        }
        if (body) {
            body.innerHTML = '';
            body.appendChild(nedProgress());
        }
        const token = state.nedToken + 1;
        state.nedToken = token;
        try {
            const response = await request(`/api/ned-overview?name=${encodeURIComponent(query)}`);
            if (!response || !response.ok) throw new Error('NED request failed');
            const row = parseNedOverview(await response.text());
            if (token !== state.nedToken) return;
            if (row) state.nedCache.set(query, row);
            renderNedOverview(popup, query, row);
        } catch (_) {
            if (token !== state.nedToken) return;
            if (body) {
                body.innerHTML = '';
                body.appendChild(nedMessage('NED could not be reached.'));
            }
        }
    }

    window.snapshotNelouraOverlays = snapshotOverlays;
    window.restoreNelouraOverlays = restoreOverlays;

    window.addEventListener('fits:imageLoaded', (event) => {
        const filepath = event && event.detail && event.detail.filepath;
        onReady(filepath);
    });
    document.addEventListener('viewer:open', () => onReady(window.currentFitsFile));
    window.addEventListener('message', (event) => {
        const data = event && event.data;
        if (!data || data.type !== 'neloura-side-rails') return;
        try {
            if (event.source !== window.parent) return;
        } catch (_) { return; }
        document.body.classList.toggle('neloura-hide-side-rails', !!data.hidden);
    });
})();

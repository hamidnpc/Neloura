(function () {
    'use strict';

    const QUANTITIES = [
        ['FLUX_ERR', 'Flux err'],
        ['VEL_ERR', 'Vel err'],
        ['SIGMA_ERR', 'Sigma err'],
        ['SIGMA_CORR', 'Sigma corr'],
        ['MOM0_ERR', 'Mom0 err'],
        ['MOM1_ERR', 'Mom1 err'],
        ['MOM2_ERR', 'Mom2 err'],
        ['MOM3_ERR', 'Mom3 err'],
        ['FLUX', 'Flux'],
        ['VEL', 'Vel'],
        ['SIGMA', 'Sigma'],
        ['MOM0', 'Mom0'],
        ['MOM1', 'Mom1'],
        ['MOM2', 'Mom2'],
        ['MOM3', 'Mom3']
    ];

    const state = {
        filepath: '',
        items: [],
        groups: [],
        multi: false,
        hdu: null,
        suffix: '',
        switching: false,
        queued: null,
        seq: 0,
        bar: null,
        thumbs: new Map(),
        listCache: new Map(),
        pendingFile: '',
        pendingTimer: 0,
        scrollTimer: 0,
        scrollLock: false
    };

    function request(url, options) {
        if (typeof window.apiFetch === 'function') return window.apiFetch(url, options || {});
        return fetch(url, options || {});
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

    function currentFile() {
        return window.currentFitsFile || (window.fitsData && window.fitsData.filename) || '';
    }

    function fileKey(path) {
        return String(path || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/^files\//, '');
    }

    function samePath(a, b) {
        const left = fileKey(a);
        return !!left && left === fileKey(b);
    }

    function hideBar() {
        if (state.bar) state.bar.style.display = 'none';
    }

    function splitName(name) {
        const text = String(name || '').trim();
        const upper = text.toUpperCase();
        for (let i = 0; i < QUANTITIES.length; i += 1) {
            const suffix = QUANTITIES[i][0];
            const token = `_${suffix}`;
            if (upper.endsWith(token) && upper.length > token.length) {
                return {
                    line: text.slice(0, text.length - token.length),
                    measure: QUANTITIES[i][1],
                    suffix
                };
            }
        }
        return { line: text || 'HDU', measure: text || 'Image', suffix: '' };
    }

    function isImageHdu(entry) {
        if (!entry) return false;
        const dims = entry.dimensions;
        return String(entry.type || '').toLowerCase() === 'image' && Array.isArray(dims) && dims.length >= 2;
    }

    function groupItems(items) {
        const groups = [];
        const byLine = new Map();
        items.forEach((item) => {
            let group = byLine.get(item.line);
            if (!group) {
                group = { line: item.line, items: [] };
                byLine.set(item.line, group);
                groups.push(group);
            }
            group.items.push(item);
        });
        return groups;
    }

    function ensureBar() {
        if (state.bar && state.bar.isConnected) return state.bar;
        const bar = document.createElement('div');
        bar.id = 'hdu-bar';
        bar.className = 'hdu-bar';
        bar.style.display = 'none';
        bar.innerHTML = `
            <div class="hdu-bar-window">
                <div class="hdu-bar-scroller"><div class="hdu-bar-strip"></div></div>
            </div>
        `;
        const scroller = bar.querySelector('.hdu-bar-scroller');
        bar.addEventListener('click', (event) => {
            const measure = event.target.closest('.hdu-bar-measure');
            if (!measure) return;
            const item = state.items.find((entry) => Number(entry.hdu) === Number(measure.dataset.hdu));
            if (item) switchTo(item);
        });
        bar.addEventListener('wheel', (event) => {
            if (!scroller) return;
            event.preventDefault();
            event.stopPropagation();
            const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
            scroller.scrollLeft += delta;
        }, { passive: false });
        if (scroller) {
            scroller.addEventListener('scroll', () => {
                hideHduTip();
                loadVisibleThumbs();
            }, { passive: true });
        }
        document.body.appendChild(bar);
        state.bar = bar;
        return bar;
    }

    function placeBar() {
        const bar = state.bar;
        if (!bar) return;
        const rail = document.getElementById('filter-rail');
        const anchor = rail && rail.querySelector('.filter-rail-window');
        const anchorRect = anchor && rail.style.display !== 'none' ? anchor.getBoundingClientRect() : null;
        const railOn = !!(anchorRect && anchorRect.height > 40 && anchorRect.width > 20);
        bar.style.left = 'auto';
        bar.style.bottom = 'auto';
        bar.style.transform = 'none';
        if (railOn) {
            const height = bar.offsetHeight || 72;
            const top = anchorRect.top + (anchorRect.height - height) / 2;
            bar.style.top = `${Math.round(top)}px`;
            bar.style.right = `${Math.round(window.innerWidth - anchorRect.left + 8)}px`;
            return;
        }
        const lane = 'var(--neloura-screen-cbar-lane-right, 0px)';
        bar.style.right = `calc(16px + ${lane})`;
        bar.style.top = '50%';
        bar.style.transform = 'translateY(-50%)';
    }

    function scrollerEl() {
        return state.bar && state.bar.querySelector('.hdu-bar-scroller');
    }

    function scrollCurrentIntoView() {
        const scroller = scrollerEl();
        const current = state.bar && state.bar.querySelector('.hdu-bar-measure.is-current');
        if (!scroller || !current) return;
        state.scrollLock = true;
        const left = current.offsetLeft - (scroller.clientWidth - current.offsetWidth) / 2;
        scroller.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
        clearTimeout(state.scrollTimer);
        state.scrollTimer = setTimeout(() => { state.scrollLock = false; }, 450);
    }

    function markCurrent() {
        if (!state.bar) return;
        state.bar.querySelectorAll('.hdu-bar-measure').forEach((button) => {
            button.classList.toggle('is-current', Number(button.dataset.hdu) === Number(state.hdu));
        });
    }

    function render() {
        const bar = ensureBar();
        if (!state.items.length || state.items.length < 2 || rgbMode() || !samePath(state.filepath, currentFile())) {
            hideBar();
            return;
        }
        bar.style.display = 'flex';
        const strip = bar.querySelector('.hdu-bar-strip');
        if (!strip) return;
        const active = state.items.find((item) => Number(item.hdu) === Number(state.hdu)) || state.items[0];
        state.hdu = active ? active.hdu : state.hdu;
        if (active && active.suffix) state.suffix = active.suffix;
        strip.innerHTML = '';
        state.items.forEach((item) => strip.appendChild(measureButton(item, item.name)));
        loadVisibleThumbs();
        scrollCurrentIntoView();
        placeBar();
    }

    function measureButton(item, label) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'hdu-bar-measure';
        button.dataset.hdu = String(item.hdu);
        if (Number(item.hdu) === Number(state.hdu)) button.classList.add('is-current');
        button.addEventListener('mouseenter', () => showHduTip(button, item.name));
        button.addEventListener('mouseleave', hideHduTip);
        const img = document.createElement('img');
        img.alt = item.name;
        img.draggable = false;
        const cached = state.thumbs.get(thumbKey(item));
        if (cached) img.src = cached;
        else button.classList.add('is-loading');
        const caption = document.createElement('span');
        caption.textContent = label;
        button.appendChild(img);
        button.appendChild(caption);
        return button;
    }

    function thumbKey(item) {
        return `${state.filepath}|${item.hdu}`;
    }

    function loadVisibleThumbs() {
        const scroller = scrollerEl();
        if (!scroller) return;
        const left = scroller.scrollLeft - 120;
        const right = scroller.scrollLeft + scroller.clientWidth + 120;
        const buttons = Array.from(scroller.querySelectorAll('.hdu-bar-measure')).filter((button) => {
            const start = button.offsetLeft;
            return start + button.offsetWidth >= left && start <= right;
        });
        let cursor = 0;
        const worker = async () => {
            while (cursor < buttons.length) {
                const button = buttons[cursor];
                cursor += 1;
                const hdu = Number(button.dataset.hdu);
                const item = state.items.find((entry) => Number(entry.hdu) === hdu);
                const img = button.querySelector('img');
                if (!item || !img || img.getAttribute('src') || button.dataset.loading === '1') {
                    if (img && img.getAttribute('src')) button.classList.remove('is-loading');
                    continue;
                }
                button.dataset.loading = '1';
                try {
                    const url = `/fits/preview/?filepath=${encodeURIComponent(state.filepath)}&hdu=${encodeURIComponent(item.hdu)}&max_dim=96&color_map=gray&scaling_function=sqrt&v=${Date.now()}`;
                    const response = await request(url, { cache: 'no-store' });
                    if (!response || !response.ok) {
                        button.classList.remove('is-loading');
                        continue;
                    }
                    const blob = await response.blob();
                    const objectUrl = URL.createObjectURL(blob);
                    state.thumbs.set(thumbKey(item), objectUrl);
                    img.onload = () => button.classList.remove('is-loading');
                    img.onerror = () => button.classList.remove('is-loading');
                    img.src = objectUrl;
                } catch (_) {
                    button.classList.remove('is-loading');
                }
            }
        };
        worker();
        worker();
    }

    function hduTip() {
        let tip = document.getElementById('filter-rail-tip');
        if (tip) return tip;
        tip = document.createElement('div');
        tip.id = 'filter-rail-tip';
        tip.className = 'filter-rail-tip';
        tip.hidden = true;
        document.body.appendChild(tip);
        return tip;
    }

    function showHduTip(button, text) {
        const name = String(text || '').trim();
        const caption = button && button.querySelector('span');
        if (!name || !caption) return;
        const clipped = caption.scrollWidth > caption.clientWidth + 1 || name.length > 12;
        if (!clipped) return;
        const tip = hduTip();
        tip.textContent = name;
        tip.hidden = false;
        const rect = button.getBoundingClientRect();
        const top = Math.max(12, Math.min(window.innerHeight - 12, rect.top + rect.height / 2));
        tip.style.top = `${Math.round(top)}px`;
        tip.style.right = `${Math.round(window.innerWidth - rect.left + 10)}px`;
        tip.style.left = 'auto';
    }

    function hideHduTip() {
        const tip = document.getElementById('filter-rail-tip');
        if (tip) tip.hidden = true;
    }

    async function switchTo(item) {
        if (!item || typeof selectHdu !== 'function') return;
        if (Number(item.hdu) === Number(state.hdu) && samePath(state.filepath, currentFile())) {
            markCurrent();
            scrollCurrentIntoView();
            return;
        }
        if (state.switching) {
            state.queued = item;
            return;
        }
        state.switching = true;
        state.hdu = item.hdu;
        if (item.suffix) state.suffix = item.suffix;
        markCurrent();
        scrollCurrentIntoView();
        hideHduTip();
        const file = state.filepath;
        try {
            await selectHdu(item.hdu, file);
        } catch (_) { /* selectHdu reports the error */ }
        state.switching = false;
        const queued = state.queued;
        state.queued = null;
        if (queued && Number(queued.hdu) !== Number(window.currentHduIndex)) switchTo(queued);
    }

    function clearThumbs() {
        state.thumbs.forEach((url) => {
            try { URL.revokeObjectURL(url); } catch (_) { /* noop */ }
        });
        state.thumbs.clear();
    }

    function itemsFromList(list) {
        return (Array.isArray(list) ? list : []).filter(isImageHdu).map((entry) => {
            const name = String(entry.name || `HDU ${entry.index}`);
            const parts = splitName(name);
            return {
                hdu: Number(entry.index),
                name,
                line: parts.line,
                measure: parts.measure,
                suffix: parts.suffix
            };
        });
    }

    function prefetch(filepath) {
        const key = fileKey(filepath);
        if (!key || typeof getFitsHduInfo !== 'function') return null;
        if (state.listCache.has(key)) return state.listCache.get(key);
        const job = getFitsHduInfo(filepath).then((list) => itemsFromList(list)).catch(() => {
            state.listCache.delete(key);
            return null;
        });
        state.listCache.set(key, job);
        if (state.listCache.size > 6) {
            const oldest = state.listCache.keys().next().value;
            if (oldest && oldest !== key) state.listCache.delete(oldest);
        }
        return job;
    }

    window.prefetchHduBar = prefetch;

    async function refresh(filepath) {
        const path = filepath || currentFile();
        const open = currentFile();
        if (state.pendingFile && !samePath(open, state.pendingFile)) {
            hideBar();
            return;
        }
        if (state.pendingFile && samePath(open, state.pendingFile)) state.pendingFile = '';
        if (!path || !imageIsOpen() || rgbMode() || (open && !samePath(path, open))) {
            if (!samePath(state.filepath, open)) hideBar();
            return;
        }
        if (state.filepath && !samePath(state.filepath, path)) {
            hideBar();
            state.items = [];
            state.groups = [];
            clearThumbs();
        }
        if (samePath(state.filepath, path) && state.items.length) {
            const nextHdu = Number(window.currentHduIndex);
            if (Number.isFinite(nextHdu)) state.hdu = nextHdu;
            render();
            return;
        }
        const token = ++state.seq;
        let items = [];
        try {
            items = await prefetch(path);
        } catch (_) {
            items = null;
        }
        if (token !== state.seq) return;
        if (!items) {
            hideBar();
            return;
        }
        if (state.filepath !== path) clearThumbs();
        state.filepath = path;
        state.items = items;
        state.groups = groupItems(items);
        state.multi = state.groups.some((group) => group.items.length > 1);
        const openHdu = Number(window.currentHduIndex);
        state.hdu = items.some((item) => item.hdu === openHdu) ? openHdu : (items[0] && items[0].hdu);
        const active = items.find((item) => item.hdu === state.hdu);
        if (active && active.suffix) state.suffix = active.suffix;
        render();
    }

    function onReady(event) {
        const filepath = event && event.detail && event.detail.filepath;
        refresh(filepath).catch(() => {});
    }

    document.addEventListener('fits:fileSwitching', (event) => {
        const next = event && event.detail && event.detail.filepath;
        if (next && !samePath(next, currentFile())) {
            prefetch(next);
            state.pendingFile = next;
            state.seq += 1;
            state.items = [];
            state.groups = [];
            hideBar();
            clearTimeout(state.pendingTimer);
            state.pendingTimer = setTimeout(() => {
                if (state.pendingFile && !samePath(state.pendingFile, currentFile())) {
                    state.pendingFile = '';
                    refresh().catch(() => {});
                }
            }, 8000);
        }
    });
    window.addEventListener('fits:imageLoaded', onReady);
    document.addEventListener('viewer:open', () => onReady());
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => onReady());
    } else {
        onReady();
    }
})();

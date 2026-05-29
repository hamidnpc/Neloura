// static/save.js
(function () {
    'use strict';

    // Public entry (optional)
    window.initializeSaveButton = init;
    // Expose stable APIs for other windows to trigger capture/save in THIS window.
    // (Used by multi-panel/grid mode where the toolbar lives in the top window.)
    window.__nelouraSavePng = (options) => savePngFromWindow(window, options || {});
    window.__nelouraSaveImage = (options) => saveImageFromWindow(window, options || {});
    window.__nelouraCapturePngBlob = (options) => capturePngBlobFromWindow(window, options || {});
    const DEFAULT_SAVE_DPI = 300;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        // In pane iframes we don't build toolbar UI (it lives in top window),
        // but we still expose __nelouraSavePng so the top window can trigger saving.
        // Colab/Jupyter notebook embeds are also iframes, so only skip Neloura's
        // own multi-panel pane frames.
        try {
            if (new URLSearchParams(window.location.search || '').get('mp') === '1') return;
        } catch (_) {}

        // Remove any floating button from older versions
        const old = document.getElementById('save-png-button');
        if (old) old.remove();

        ensureToolbarButton();           // create (hidden initially)
        installVisibilityWatchers();     // wire up visibility updates
        updateToolbarVisibility();       // initial state
    }

    // ---------- Toolbar button creation (Save PNG) ----------
    function ensureToolbarButton() {
        const toolbar = document.querySelector('.toolbar');
        if (!toolbar) {
            setTimeout(ensureToolbarButton, 200);
            return;
        }

        if (document.getElementById('save-png-toolbar-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'save-png-toolbar-btn';
        btn.title = 'Save image';
        btn.type = 'button';
        // Styling should come from CSS (.toolbar button in static/style.css).
        // Do not apply inline styles here.

        // SVG icon (stroke like in sed.js)
        btn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                 stroke="#cccccc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                 aria-hidden="true">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                <polyline points="17,21 17,13 7,13 7,21"></polyline>
                <polyline points="7,3 7,8 15,8"></polyline>
            </svg>
        `;
        btn.onmouseover = function () { btn.querySelector('svg').style.stroke = '#ffffff'; };
        btn.onmouseout  = function () { btn.querySelector('svg').style.stroke = '#cccccc'; };
        btn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleSaveDropdown(btn);
        });

        // Insert immediately after the Files button
        let filesBtn = toolbar.querySelector('#files-button');
        if (!filesBtn) {
            filesBtn = Array.from(toolbar.querySelectorAll('button, [role="button"]')).find(b =>
                (b.id && /files/i.test(b.id)) ||
                (b.title && /files/i.test(b.title)) ||
                (b.ariaLabel && /files/i.test(b.ariaLabel)) ||
                (/files/i.test((b.textContent || '').trim()))
            );
        }
        if (filesBtn) {
            filesBtn.insertAdjacentElement('afterend', btn);
        } else {
            toolbar.appendChild(btn); // fallback
        }
        ensureSaveDropdown();
    }

    function ensureSaveDropdown() {
        let menu = document.getElementById('save-export-dropdown');
        if (menu) return menu;

        menu = document.createElement('div');
        menu.id = 'save-export-dropdown';
        menu.className = 'mp-interactive';
        Object.assign(menu.style, {
            position: 'fixed',
            transform: 'translate(-9999px, -9999px)',
            display: 'none',
            width: '190px',
            padding: '10px',
            borderRadius: '10px',
            background: 'rgba(28,28,28,0.97)',
            border: '1px solid rgba(255,255,255,0.18)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
            color: '#fff',
            fontFamily: 'Arial, sans-serif',
            fontSize: '12px',
            zIndex: '65150',
            boxSizing: 'border-box'
        });

        const title = document.createElement('div');
        title.textContent = 'Save image';
        Object.assign(title.style, { fontWeight: '700', marginBottom: '8px' });

        const formatLabel = document.createElement('label');
        formatLabel.textContent = 'Format';
        formatLabel.setAttribute('for', 'save-export-format');
        Object.assign(formatLabel.style, { display: 'block', color: '#ccc', marginBottom: '4px' });

        const format = document.createElement('select');
        format.id = 'save-export-format';
        Object.assign(format.style, saveDropdownInputStyle());
        [
            { value: 'png', label: 'PNG' },
            { value: 'pdf', label: 'PDF' }
        ].forEach((opt) => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            format.appendChild(option);
        });

        const dpiLabel = document.createElement('label');
        dpiLabel.textContent = 'DPI';
        dpiLabel.setAttribute('for', 'save-export-dpi');
        Object.assign(dpiLabel.style, { display: 'block', color: '#ccc', margin: '8px 0 4px' });

        const dpi = document.createElement('input');
        dpi.id = 'save-export-dpi';
        dpi.type = 'number';
        dpi.inputMode = 'numeric';
        dpi.value = String(DEFAULT_SAVE_DPI);
        dpi.placeholder = String(DEFAULT_SAVE_DPI);
        Object.assign(dpi.style, saveDropdownInputStyle());

        const action = document.createElement('button');
        action.type = 'button';
        action.textContent = 'Save';
        Object.assign(action.style, {
            width: '100%',
            marginTop: '10px',
            padding: '7px 8px',
            borderRadius: '7px',
            border: '1px solid #2f8cff',
            background: '#007bff',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '12px'
        });
        action.addEventListener('click', () => {
            const selectedFormat = (format.value || 'png').toLowerCase();
            const selectedDpi = normalizeSaveDpi(dpi.value);
            hideSaveDropdown();
            executeToolbarSave({ format: selectedFormat, dpi: selectedDpi });
        });

        menu.addEventListener('pointerdown', (event) => event.stopPropagation());
        menu.appendChild(title);
        menu.appendChild(formatLabel);
        menu.appendChild(format);
        menu.appendChild(dpiLabel);
        menu.appendChild(dpi);
        menu.appendChild(action);
        document.body.appendChild(menu);

        document.addEventListener('pointerdown', (event) => {
            const btn = document.getElementById('save-png-toolbar-btn');
            if (menu.style.display === 'none') return;
            if (menu.contains(event.target) || (btn && btn.contains(event.target))) return;
            hideSaveDropdown();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') hideSaveDropdown();
        });

        return menu;
    }

    function saveDropdownInputStyle() {
        return {
            width: '100%',
            boxSizing: 'border-box',
            background: '#2b2b2b',
            color: '#fff',
            border: '1px solid #555',
            borderRadius: '6px',
            padding: '6px 7px',
            fontSize: '12px',
            outline: 'none'
        };
    }

    function toggleSaveDropdown(anchor) {
        const menu = ensureSaveDropdown();
        if (menu.style.display !== 'none') {
            hideSaveDropdown();
            return;
        }
        const rect = anchor.getBoundingClientRect();
        const x = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - 198));
        const y = Math.min(Math.max(8, rect.bottom + 8), Math.max(8, window.innerHeight - 170));
        menu.style.display = 'block';
        menu.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    }

    function hideSaveDropdown() {
        const menu = document.getElementById('save-export-dropdown');
        if (!menu) return;
        menu.style.display = 'none';
        menu.style.transform = 'translate(-9999px, -9999px)';
    }

    // (Removed) styleToolbarButton: inline styles for #save-png-toolbar-btn are no longer applied.

    // ---------- Visibility management ----------
    function installVisibilityWatchers() {
        // Update after histogram draw (signals image context is ready)
        document.addEventListener('histogram:ready', updateToolbarVisibility);

        // Hook into OSD viewer lifecycle
        const tryAttachViewerHandlers = () => {
            const targetWin = getSaveTargetWindow();
            const tv = targetWin && targetWin.tiledViewer;
            if (tv && !tv._saveBtnHandlersAttached) {
                try {
                    tv.addHandler('open', updateToolbarVisibility);
                    tv.addHandler('open-failed', updateToolbarVisibility);
                    tv.addHandler('close', updateToolbarVisibility);
                    tv._saveBtnHandlersAttached = true;
                    updateToolbarVisibility();
                    return true;
                } catch (_) {}
            }
            return false;
        };

        if (!tryAttachViewerHandlers()) {
            let attempts = 0;
            const maxAttempts = 40; // ~8s @ 200ms
            const iv = setInterval(() => {
                attempts++;
                if (tryAttachViewerHandlers() || attempts >= maxAttempts) {
                    clearInterval(iv);
                }
            }, 200);
        }

        // Layout changes can affect toolbar composition
        window.addEventListener('resize', updateToolbarVisibility);

        // In multi-panel/grid mode the active pane can change; keep visibility in sync.
        // This is intentionally light-weight and avoids depending on cross-window events.
        let lastTarget = null;
        setInterval(() => {
            try {
                const w = getSaveTargetWindow();
                if (w !== lastTarget) {
                    lastTarget = w;
                    tryAttachViewerHandlers();
                }
            } catch (_) {}
            updateToolbarVisibility();
        }, 800);
    }

    function getSaveTargetWindow() {
        // Only the top window has the multi-panel toolbar and knows the active pane.
        try {
            if (window.self === window.top && typeof window.getActivePaneWindow === 'function') {
                const w = window.getActivePaneWindow();
                if (w && w.document) return w;
            }
        } catch (_) {}
        return window;
    }

    function isImageLoaded(targetWin = window) {
        try {
            if (targetWin.tiledViewer && typeof targetWin.tiledViewer.isOpen === 'function' && targetWin.tiledViewer.isOpen()) {
                return true;
            }
        } catch (_) {}
        try {
            if (targetWin.fitsData && Number.isFinite(targetWin.fitsData.width) && Number.isFinite(targetWin.fitsData.height)) {
                return true;
            }
        } catch (_) {}
        return false;
    }

    // Toolbar should always be visible (even before an image is loaded).
    function updateToolbarVisibility() {
        const toolbar = document.querySelector('.toolbar');
        const saveBtn = document.getElementById('save-png-toolbar-btn');

        // Do not force inline display styling; leave it to CSS.

        if (!toolbar) return;

        const buttons = Array.from(toolbar.querySelectorAll('button'));
        for (const b of buttons) {
            const type = classifyToolbarButton(b);
            if (!type) continue; // unknown or leave alone

            // Keep these always visible — without inline style changes.
            // (If another script hides them inline, toolbar.js enforcer handles re-showing.)
        }
    }

    // Classify known toolbar buttons we want to control:
    // returns one of: 'zoom-in', 'zoom-out', 'reset', 'histogram' or null to ignore
    function classifyToolbarButton(btn) {
        try {
            // Histogram (our popup)
            if (btn.classList && btn.classList.contains('dynamic-range-button')) return 'histogram';

            const txt = (btn.textContent || '').trim();
            const title = (btn.title || '').toLowerCase();
            const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
            const id = (btn.id || '').toLowerCase();

            // Zoom in
            if (txt === '+' || title.includes('zoom in') || aria.includes('zoom in') || id.includes('zoom-in')) {
                normalizeToolbarButtonStyle(btn);
                return 'zoom-in';
            }

            // Zoom out
            if (txt === '-' || title.includes('zoom out') || aria.includes('zoom out') || id.includes('zoom-out')) {
                normalizeToolbarButtonStyle(btn);
                return 'zoom-out';
            }

            // Reset / Home (often 'R' in your UI)
            if (txt === 'R' || title.includes('reset') || title.includes('home') || aria.includes('reset') || aria.includes('home') || id.includes('home') || id.includes('reset')) {
                normalizeToolbarButtonStyle(btn);
                return 'reset';
            }

            // Histogram by text/title as fallback
            if (title.includes('histogram') || aria.includes('histogram')) {
                normalizeToolbarButtonStyle(btn);
                return 'histogram';
            }
        } catch (_) {}

        return null;
    }

    function normalizeToolbarButtonStyle(btn) {
        // No-op: avoid injecting inline styles. Toolbar styling comes from CSS.
        return btn;
    }

    // ---------- Save PNG pipeline ----------
    function notify(message, type = 'info') {
        try {
            if (typeof window.showNotification === 'function') {
                window.showNotification(message, 1200, type);
            } else {
                console.log(`[${type}] ${message}`);
            }
        } catch (_) {}
    }

    function getViewerContainer(targetWin = window) {
        try {
            const d = targetWin.document;
            return d.getElementById('openseadragon') || d.body;
        } catch (_) {
            return document.getElementById('openseadragon') || document.body;
        }
    }

    function computeExportUnionRect(targetWin, containerRect) {
        let left = containerRect.left;
        let top = containerRect.top;
        let right = containerRect.right;
        let bottom = containerRect.bottom;
        try {
            const bars = [
                { visible: !!targetWin.screenColorBarVisible, id: 'neloura-screen-colorbar' },
                { visible: !!(targetWin.catalogScreenColorBarVisible && targetWin.regionStyles && targetWin.regionStyles.colorCodeColumn), id: 'neloura-catalog-colorbar' }
            ];
            for (const item of bars) {
                if (!item.visible) continue;
                const bar = targetWin.document.getElementById(item.id);
                if (bar) {
                    const cs = targetWin.getComputedStyle(bar);
                    if (cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity || '1') > 0.02) {
                        const r = bar.getBoundingClientRect();
                        if (r.width > 2 && r.height > 2) {
                            left = Math.min(left, r.left);
                            top = Math.min(top, r.top);
                            right = Math.max(right, r.right);
                            bottom = Math.max(bottom, r.bottom);
                        }
                    }
                }
            }
        } catch (_) {}
        return {
            left,
            top,
            right,
            bottom,
            width: Math.max(1, right - left),
            height: Math.max(1, bottom - top)
        };
    }

    function drawScreenColorBarFromDom(targetWin, ctx, exportRect, dpr) {
        try {
            const ox = exportRect.left;
            const oy = exportRect.top;

            const drawTextEl = (el, opts = {}) => {
                if (!el) return;
                const t = (el.textContent || '').trim();
                if (!t) return;
                const r = el.getBoundingClientRect();
                const st = targetWin.getComputedStyle(el);
                if (st.display === 'none' || r.width < 1 || r.height < 1) return;
                const rawAlign = String(opts.align || st.textAlign || 'left').toLowerCase();
                const align = (rawAlign === 'center')
                    ? 'center'
                    : ((rawAlign === 'right' || rawAlign === 'end') ? 'right' : 'left');
                const xCss = align === 'center'
                    ? (r.left + r.width / 2)
                    : (align === 'right' ? r.right : r.left);
                const x = (xCss - ox) * dpr;
                const y = (r.top - oy) * dpr;
                const fs = parseFloat(st.fontSize) || 11;
                const fw = st.fontWeight && st.fontWeight !== 'normal' ? st.fontWeight : '400';
                const fam = (st.fontFamily || 'Arial,sans-serif').split(',')[0].replace(/['"]/g, '').trim();
                ctx.save();
                ctx.font = `${fw} ${Math.round(fs * dpr)}px ${fam || 'sans-serif'}`;
                ctx.fillStyle = st.color || '#eaeaea';
                ctx.textBaseline = 'top';
                ctx.textAlign = align;
                if (ctx.measureText(t).width > 0) {
                    ctx.shadowColor = 'rgba(0,0,0,0.85)';
                    ctx.shadowBlur = 3 * dpr;
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 1 * dpr;
                    ctx.fillText(t, x, y);
                }
                ctx.restore();
            };

            const drawOneBar = (id, visible) => {
                if (!visible) return;
                const root = targetWin.document.getElementById(id);
                if (!root) return;
                const cs = targetWin.getComputedStyle(root);
                if (cs.display === 'none' || parseFloat(cs.opacity || '1') < 0.05) return;
                const rr = root.getBoundingClientRect();
                const isHorizontalBar = rr.width > rr.height * 2;

                const stripCv = root.querySelector('.neloura-cbar-strip canvas');
                if (stripCv && stripCv.width > 0 && stripCv.height > 0) {
                    const sr = stripCv.getBoundingClientRect();
                    const dx = (sr.left - ox) * dpr;
                    const dy = (sr.top - oy) * dpr;
                    const dw = sr.width * dpr;
                    const dh = sr.height * dpr;
                    if (dw > 1 && dh > 1) {
                        ctx.drawImage(stripCv, 0, 0, stripCv.width, stripCv.height, dx, dy, dw, dh);
                        ctx.save();
                        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
                        ctx.lineWidth = Math.max(1, dpr);
                        ctx.strokeRect(dx + 0.5, dy + 0.5, dw - 1, dh - 1);
                        ctx.restore();
                    }
                }

                drawTextEl(root.querySelector('.neloura-cbar-unit'), { align: 'center' });
                root.querySelectorAll('.neloura-cbar-ticks > div').forEach(drawTextEl);
            };

            drawOneBar('neloura-screen-colorbar', !!targetWin.screenColorBarVisible);
            drawOneBar(
                'neloura-catalog-colorbar',
                !!(targetWin.catalogScreenColorBarVisible && targetWin.regionStyles && targetWin.regionStyles.colorCodeColumn)
            );
        } catch (_) {}
    }

    function isVisibleCanvas(el) {
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') < 0.01) return false;
        if (!el.width || !el.height || !el.clientWidth || !el.clientHeight) return false;
      
        // Exclude histogram layers
        if (el.id === 'histogram-bg-canvas' || el.id === 'histogram-lines-canvas') return false;
      
        // Exclude OSD navigator
        if (el.closest && el.closest('#navigatorDiv')) return false;
      
        // Exclude your zoom panel (mark parent or canvas with data-exclude-from-export="true")
        if (el.matches && (
          el.matches('canvas[data-exclude-from-export="true"]') ||
          (el.closest && el.closest('[data-exclude-from-export="true"]')) ||
          (el.id && /zoom|mini|overview/i.test(el.id)) ||
          (el.className && /zoom|mini|overview/i.test(String(el.className)))
        )) return false;
      
        return true;
      }

    function drawAllViewerCanvases(targetWin, container, ctx, dpr, originRect) {
        const containerRect = container.getBoundingClientRect();
        const ox = originRect || containerRect;
        const canvases = Array.from(container.querySelectorAll('canvas')).filter(isVisibleCanvas);

        let drawerCanvas = null;
        try { drawerCanvas = targetWin.tiledViewer?.drawer?.canvas || null; } catch (_) {}
        if (drawerCanvas && !isVisibleCanvas(drawerCanvas)) drawerCanvas = null;

        const list = [];
        if (drawerCanvas) list.push(drawerCanvas);
        for (const c of canvases) {
            if (c !== drawerCanvas) list.push(c);
        }

        for (const c of list) {
            const r = c.getBoundingClientRect();
            const dx = (r.left - ox.left) * dpr;
            const dy = (r.top - ox.top) * dpr;
            const dw = r.width * dpr;
            const dh = r.height * dpr;
            // WebGL overlay canvas may export blank with preserveDrawingBuffer=false.
            // If we have the renderer, readPixels from an offscreen FBO and draw it.
            const isWebglOverlay = (() => {
                try {
                    if (c.classList && c.classList.contains('catalog-webgl-canvas')) return true;
                    if (c.id && /webgl/i.test(c.id) && /catalog/i.test(c.id)) return true;
                } catch (_) {}
                return false;
            })();
            if (isWebglOverlay) {
                try {
                    const r0 = targetWin && targetWin.__catalogWebgl;
                    if (r0 && typeof r0.renderToRgbaPixels === 'function') {
                        const out = r0.renderToRgbaPixels();
                        if (out && out.pixels && out.width && out.height) {
                            const tmp = document.createElement('canvas');
                            tmp.width = out.width;
                            tmp.height = out.height;
                            const tctx = tmp.getContext('2d', { willReadFrequently: true });
                            const img = new ImageData(out.pixels, out.width, out.height);
                            tctx.putImageData(img, 0, 0);
                            ctx.drawImage(tmp, 0, 0, tmp.width, tmp.height, dx, dy, dw, dh);
                            continue;
                        }
                    }
                } catch (_) {}
            }
            ctx.drawImage(c, 0, 0, c.width, c.height, dx, dy, dw, dh);
        }
    }

    function drawDomDots(targetWin, container, ctx, dpr, originRect) {
        const containerRect = container.getBoundingClientRect();
        const ox = originRect || containerRect;

        let domDots = [];
        if (Array.isArray(targetWin.catalogDots) && targetWin.catalogDots.length) {
            domDots = targetWin.catalogDots.filter(el => el && el.getBoundingClientRect);
        } else {
            domDots = Array.from(container.querySelectorAll('.catalog-dot, .overlay-dot, [data-overlay-dot="true"]'));
        }
        if (!domDots.length) return;

        for (const el of domDots) {
            try {
                const style = getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') < 0.01) continue;

                const rect = el.getBoundingClientRect();
                const cx = (rect.left - ox.left + rect.width / 2) * dpr;
                const cy = (rect.top - ox.top + rect.height / 2) * dpr;
                const r = Math.max(1, (Math.min(rect.width, rect.height) / 2) * dpr);

                const fill = style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)'
                    ? style.backgroundColor : '#ffcc00';
                const stroke = style.borderColor && style.borderColor !== 'rgba(0, 0, 0, 0)'
                    ? style.borderColor : '#000';

                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.fillStyle = fill;
                ctx.fill();
                ctx.lineWidth = Math.max(1, (parseFloat(style.borderWidth) || 1) * dpr);
                ctx.strokeStyle = stroke;
                ctx.stroke();
            } catch (_) {}
        }
    }

    function roundedRectPath(ctx, x, y, w, h, r) {
        const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
        ctx.beginPath();
        ctx.moveTo(x + rr, y);
        ctx.lineTo(x + w - rr, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
        ctx.lineTo(x + w, y + h - rr);
        ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
        ctx.lineTo(x + rr, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
        ctx.lineTo(x, y + rr);
        ctx.quadraticCurveTo(x, y, x + rr, y);
        ctx.closePath();
    }

    function extractCssUrl(bgImage) {
        try {
            const s = String(bgImage || '').trim();
            if (!s || s === 'none') return null;
            const m = s.match(/url\((['"]?)(.*?)\1\)/i);
            return m && m[2] ? m[2] : null;
        } catch (_) {
            return null;
        }
    }

    async function drawZoomInsets(targetWin, container, ctx, dpr, originRect) {
        const containerRect = container.getBoundingClientRect();
        const ox = originRect || containerRect;
        const insets = Array.from(container.querySelectorAll('.region-zoom-inset[data-zoom-inset="true"]'));
        if (!insets.length) return;

        async function waitForImgReady(img, timeoutMs = 1500) {
            try {
                if (!img) return false;
                // If already loaded with dimensions, we're good.
                if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) return true;
                // Prefer decode() when available (doesn't require event wiring).
                if (typeof img.decode === 'function') {
                    const p = img.decode().then(() => true).catch(() => false);
                    const t = new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs));
                    return await Promise.race([p, t]);
                }
                // Fallback: wait for load/error events.
                await new Promise((resolve) => {
                    let done = false;
                    const finish = () => { if (done) return; done = true; cleanup(); resolve(); };
                    const cleanup = () => {
                        try { img.removeEventListener('load', finish); } catch (_) {}
                        try { img.removeEventListener('error', finish); } catch (_) {}
                    };
                    try { img.addEventListener('load', finish, { once: true }); } catch (_) {}
                    try { img.addEventListener('error', finish, { once: true }); } catch (_) {}
                    setTimeout(finish, timeoutMs);
                });
                return (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0);
            } catch (_) {
                return false;
            }
        }

        for (const inset of insets) {
            try {
                const r = inset.getBoundingClientRect();
                const dx = (r.left - ox.left) * dpr;
                const dy = (r.top - ox.top) * dpr;
                const dw = r.width * dpr;
                const dh = r.height * dpr;
                if (!(dw > 2 && dh > 2)) continue;

                // Background + border
                const bg = (() => { try { return getComputedStyle(inset).backgroundColor || 'rgba(10,10,10,0.92)'; } catch (_) { return 'rgba(10,10,10,0.92)'; } })();
                const borderColor = (() => { try { return getComputedStyle(inset).borderColor || 'rgba(255,255,255,0.15)'; } catch (_) { return 'rgba(255,255,255,0.15)'; } })();
                const radiusPx = (() => { try { return parseFloat(getComputedStyle(inset).borderRadius) || 14; } catch (_) { return 14; } })();
                const rr = radiusPx * dpr;

                ctx.save();
                roundedRectPath(ctx, dx, dy, dw, dh, rr);
                ctx.fillStyle = bg;
                ctx.fill();
                ctx.lineWidth = Math.max(1, dpr);
                ctx.strokeStyle = borderColor;
                ctx.stroke();
                // Clip for inset image
                roundedRectPath(ctx, dx, dy, dw, dh, rr);
                ctx.clip();

                // Draw inset image.
                // The zoom inset implementation uses <img> (preferred), but older builds used background-image.
                const imgEl = inset.querySelector('[data-zoom-inset-img="true"]');
                let bitmap = null;
                try {
                    if (imgEl && imgEl.tagName && imgEl.tagName.toLowerCase() === 'img') {
                        const img = imgEl;
                        const src = String(img.currentSrc || img.src || '').trim();
                        if (src) {
                            await waitForImgReady(img);
                            // createImageBitmap(img) avoids fetch() issues with blob: URLs.
                            bitmap = await createImageBitmap(img);
                        }
                    } else if (imgEl) {
                        const bgInline = extractCssUrl(imgEl.style && imgEl.style.backgroundImage);
                        const bgComputed = (() => {
                            try { return extractCssUrl(getComputedStyle(imgEl).backgroundImage); } catch (_) { return null; }
                        })();
                        const url = bgInline || bgComputed;
                        if (url) {
                            // Support blob/object URLs by fetching and creating an ImageBitmap
                            const resp = await fetch(url, { cache: 'no-store' }).catch(() => null);
                            if (resp && resp.ok) {
                                const blob = await resp.blob();
                                bitmap = await createImageBitmap(blob);
                            }
                        }
                    }
                } catch (_) {
                    bitmap = null;
                }

                if (bitmap) {
                    try {
                        // "contain" behavior
                        const iw = bitmap.width;
                        const ih = bitmap.height;
                        const scale = Math.min(dw / iw, dh / ih);
                        const tw = iw * scale;
                        const th = ih * scale;
                        const ix = dx + (dw - tw) / 2;
                        const iy = dy + (dh - th) / 2;
                        ctx.drawImage(bitmap, 0, 0, iw, ih, ix, iy, tw, th);
                    } finally {
                        try { bitmap.close && bitmap.close(); } catch (_) {}
                    }
                }
                ctx.restore();

                // Title pill + text label (buttons are intentionally not drawn)
                const titlePill = inset.querySelector('[data-zoom-inset-title-pill="true"]');
                const titleEl = inset.querySelector('[data-zoom-inset-title="true"]');
                if (titlePill && titleEl) {
                    const pr = titlePill.getBoundingClientRect();
                    const px = (pr.left - ox.left) * dpr;
                    const py = (pr.top - ox.top) * dpr;
                    const pw = pr.width * dpr;
                    const ph = pr.height * dpr;
                    const pillBg = (() => { try { return getComputedStyle(titlePill).backgroundColor || 'rgba(20,20,20,0.55)'; } catch (_) { return 'rgba(20,20,20,0.55)'; } })();
                    const pillBorder = (() => { try { return getComputedStyle(titlePill).borderColor || 'rgba(255,255,255,0.15)'; } catch (_) { return 'rgba(255,255,255,0.15)'; } })();
                    const pR = (() => { try { return parseFloat(getComputedStyle(titlePill).borderRadius) || 999; } catch (_) { return 999; } })() * dpr;

                    ctx.save();
                    roundedRectPath(ctx, px, py, pw, ph, pR);
                    ctx.fillStyle = pillBg;
                    ctx.fill();
                    ctx.lineWidth = Math.max(1, dpr);
                    ctx.strokeStyle = pillBorder;
                    ctx.stroke();
                    ctx.restore();

                    const text = (titleEl.textContent || '').trim();
                    if (text) {
                        const fontSize = (() => { try { return parseFloat(getComputedStyle(titlePill).fontSize) || 12; } catch (_) { return 12; } })();
                        ctx.save();
                        ctx.fillStyle = '#ffffff';
                        ctx.textBaseline = 'middle';
                        ctx.font = `600 ${Math.round(fontSize * dpr)}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
                        // padding similar to DOM pill padding
                        ctx.fillText(text, px + 10 * dpr, py + ph / 2);
                        ctx.restore();
                    }
                }
            } catch (_) {}
        }
    }
    const HIDE_FOR_EXPORT_SELECTORS = [
        '#navigatorDiv',
        '.navigator',
        '#displayregioncontainer',          // <- add this
        '[data-exclude-from-export="true"]',
        '.zoom-panel', '#zoom-panel', '.mini-map', '#miniMap'
      ];
      
      function hideForExport(targetDoc = document) {
        const nodes = [];
        for (const sel of HIDE_FOR_EXPORT_SELECTORS) {
          targetDoc.querySelectorAll(sel).forEach(el => {
            if (!el) return;
            nodes.push(el);
          });
        }
        nodes.forEach(el => {
          el.dataset.__prevVisibility = el.style.visibility || '';
          el.style.visibility = 'hidden';
        });
        return () => {
          nodes.forEach(el => {
            el.style.visibility = el.dataset.__prevVisibility || '';
            delete el.dataset.__prevVisibility;
          });
        };
      }

   
      async function executeToolbarSave(options = {}) {
        const format = String(options.format || 'png').toLowerCase() === 'pdf' ? 'pdf' : 'png';
        const dpi = normalizeSaveDpi(options.dpi);
        const targetWin = getSaveTargetWindow();

        // If we're in multi-panel/grid mode (2+ iframes visible), save a composite
        // image of the entire grid as currently displayed.
        try {
            if (window.self === window.top) {
                const grid = document.getElementById('multi-panel-grid');
                const wrap = document.getElementById('multi-panel-container');
                const holders = grid ? Array.from(grid.children || []).filter(h => h && h.querySelector && h.querySelector('iframe')) : [];
                const gridVisible = !!(wrap && (wrap.style.display !== 'none') && (getComputedStyle(wrap).display !== 'none'));
                if (gridVisible && holders.length >= 2) {
                    return saveGridCompositeImage({ gridEl: grid, holders, format, dpi });
                }
            }
        } catch (_) {}

        // Otherwise (single-panel or no grid), if we're in grid mode and the active pane
        // has its own saver, prefer that. This keeps all DOM querying strictly within the pane document.
        try {
            if (targetWin && targetWin !== window && typeof targetWin.__nelouraSaveImage === 'function') {
                return targetWin.__nelouraSaveImage({ format, dpi });
            }
            if (targetWin && targetWin !== window && format === 'png' && typeof targetWin.__nelouraSavePng === 'function') {
                return targetWin.__nelouraSavePng({ dpi });
            }
        } catch (_) {}

        return saveImageFromWindow(targetWin, { format, dpi });
      }

      function normalizeSaveDpi(value) {
        const dpi = Number(value);
        if (!Number.isFinite(dpi)) return DEFAULT_SAVE_DPI;
        return Math.max(0.01, dpi);
      }

      async function saveImageFromWindow(targetWin, options = {}) {
        const format = String(options.format || 'png').toLowerCase() === 'pdf' ? 'pdf' : 'png';
        if (format === 'pdf') return savePdfFromWindow(targetWin, options);
        return savePngFromWindow(targetWin, options);
      }

      async function savePngFromWindow(targetWin, options = {}) {
        const result = await capturePngCanvasFromWindow(targetWin, options);
        if (!result) return;
        const { out, filename, targetDoc, restore } = result;
        try {
            await downloadCanvasAsPng(out, filename, targetDoc);
            notify('PNG saved', 'success');
        } catch (e) {
            console.error('Save PNG failed:', e);
            notify('Failed to save PNG', 'error');
        } finally {
            try { restore && restore(); } catch (_) {}
        }
      }

      async function savePdfFromWindow(targetWin, options = {}) {
        const result = await capturePngCanvasFromWindow(targetWin, options);
        if (!result) return;
        const { out, filename, targetDoc, restore } = result;
        try {
            await downloadCanvasAsPdf(out, filenameWithExtension(filename, 'pdf'), targetDoc, normalizeSaveDpi(options.dpi));
            notify('PDF saved', 'success');
        } catch (e) {
            console.error('Save PDF failed:', e);
            notify('Failed to save PDF', 'error');
        } finally {
            try { restore && restore(); } catch (_) {}
        }
      }

      function canvasToBlob(canvas, type, quality) {
        return new Promise((resolve) => {
            try {
                canvas.toBlob((blob) => resolve(blob || null), type, quality);
            } catch (_) {
                resolve(null);
            }
        });
      }

      async function downloadCanvasAsPng(canvas, filename, targetDoc = document) {
        const blob = await canvasToBlob(canvas, 'image/png');
        if (!blob) {
            const a = targetDoc.createElement('a');
            a.href = canvas.toDataURL('image/png');
            a.download = filenameWithExtension(filename, 'png');
            a.click();
            return;
        }
        downloadBlob(blob, filenameWithExtension(filename, 'png'), targetDoc);
      }

      async function downloadCanvasAsPdf(canvas, filename, targetDoc = document, dpi = DEFAULT_SAVE_DPI) {
        const jpeg = await canvasToBlob(canvas, 'image/jpeg', 0.95);
        if (!jpeg) throw new Error('Failed to encode PDF image');
        const bytes = new Uint8Array(await jpeg.arrayBuffer());
        const widthPt = Math.max(1, canvas.width / normalizeSaveDpi(dpi) * 72);
        const heightPt = Math.max(1, canvas.height / normalizeSaveDpi(dpi) * 72);
        const pdf = buildSingleImagePdf(bytes, canvas.width, canvas.height, widthPt, heightPt);
        downloadBlob(pdf, filenameWithExtension(filename, 'pdf'), targetDoc);
      }

      function downloadBlob(blob, filename, targetDoc = document) {
        const url = URL.createObjectURL(blob);
        const a = targetDoc.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }

      function filenameWithExtension(filename, extension) {
        return String(filename || `image.${extension}`).replace(/\.[^.\\/]+$/, '') + `.${extension}`;
      }

      function buildSingleImagePdf(imageBytes, imageWidth, imageHeight, pageWidthPt, pageHeightPt) {
        const encoder = new TextEncoder();
        const chunks = [];
        let offset = 0;
        const offsets = [0];
        const pushText = (text) => {
            const bytes = encoder.encode(text);
            chunks.push(bytes);
            offset += bytes.length;
        };
        const pushBytes = (bytes) => {
            chunks.push(bytes);
            offset += bytes.length;
        };
        const addObject = (bodyWriter) => {
            offsets.push(offset);
            pushText(`${offsets.length - 1} 0 obj\n`);
            bodyWriter();
            pushText('\nendobj\n');
        };

        pushText('%PDF-1.4\n');
        addObject(() => pushText('<< /Type /Catalog /Pages 2 0 R >>'));
        addObject(() => pushText('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));
        addObject(() => pushText(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidthPt.toFixed(2)} ${pageHeightPt.toFixed(2)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`));
        addObject(() => {
            pushText(`<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`);
            pushBytes(imageBytes);
            pushText('\nendstream');
        });
        const content = `q\n${pageWidthPt.toFixed(2)} 0 0 ${pageHeightPt.toFixed(2)} 0 0 cm\n/Im0 Do\nQ\n`;
        addObject(() => pushText(`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream`));

        const xrefOffset = offset;
        pushText(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
        for (let i = 1; i < offsets.length; i++) {
            pushText(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
        }
        pushText(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
        return new Blob(chunks, { type: 'application/pdf' });
      }

      async function capturePngCanvasFromWindow(targetWin, options = {}) {
        if (!isImageLoaded(targetWin)) { notify('No image loaded to save', 'warning'); return null; }

        const container = getViewerContainer(targetWin);
        if (!container) { notify('Viewer not found', 'error'); return null; }

        const targetDoc = (() => { try { return targetWin.document; } catch (_) { return document; } })();
        const restore = hideForExport(targetDoc); // <— hide UI inside target doc
        try {
          // Force a redraw so WebGL overlay is current before capture.
          try {
              if (targetWin && typeof targetWin.canvasUpdateOverlay === 'function') {
                  targetWin.canvasUpdateOverlay({ mode: 'full' });
              }
          } catch (_) {}
          // Wait a frame so the browser presents the latest WebGL draw.
          await new Promise((resolve) => {
              try {
                  (targetWin.requestAnimationFrame || window.requestAnimationFrame)(() => {
                      (targetWin.requestAnimationFrame || window.requestAnimationFrame)(resolve);
                  });
              } catch (_) {
                  setTimeout(resolve, 32);
              }
          });

          const containerRect = container.getBoundingClientRect();
          const exportRect = computeExportUnionRect(targetWin, containerRect);
          const dpr = computeBestExportDpr(targetWin, container, containerRect, options);
          const outW = Math.max(1, Math.round(exportRect.width * dpr));
          const outH = Math.max(1, Math.round(exportRect.height * dpr));

          const out = targetDoc.createElement('canvas');
          out.width = outW;
          out.height = outH;
          const ctx = out.getContext('2d', { willReadFrequently: true });
          ctx.imageSmoothingEnabled = false;
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, outW, outH);

          drawAllViewerCanvases(targetWin, container, ctx, dpr, exportRect);
          drawDomDots(targetWin, container, ctx, dpr, exportRect);
          await drawZoomInsets(targetWin, container, ctx, dpr, exportRect);
          drawScreenColorBarFromDom(targetWin, ctx, exportRect, dpr);

          const filename = buildFilename(targetWin);
          return { out, filename, targetDoc, restore, dpr, rect: exportRect };
        } catch (e) {
          console.error('Capture PNG failed:', e);
          notify('Failed to capture PNG', 'error');
          try { restore && restore(); } catch (_) {}
          return null;
        }
      }

      function computeBestExportDpr(targetWin, container, containerRect, options = {}) {
        const hasRequestedDpi = options && options.dpi !== undefined && options.dpi !== null;
        if (hasRequestedDpi) return Math.max(0.01, normalizeSaveDpi(options.dpi) / 96);
        // PNG is lossless; "quality" here means resolution.
        // Prefer the viewer's internal canvas pixel density if it exceeds devicePixelRatio.
        let dpr = Math.max(1, (targetWin && targetWin.devicePixelRatio) || window.devicePixelRatio || 1);
        try {
            const drawerCanvas = targetWin && targetWin.tiledViewer && targetWin.tiledViewer.drawer && targetWin.tiledViewer.drawer.canvas;
            if (drawerCanvas && containerRect && containerRect.width > 0 && containerRect.height > 0) {
                const sx = drawerCanvas.width / containerRect.width;
                const sy = drawerCanvas.height / containerRect.height;
                if (Number.isFinite(sx) && sx > dpr) dpr = sx;
                if (Number.isFinite(sy) && sy > dpr) dpr = sy;
            }
        } catch (_) {}
        // Cap to avoid accidental gigantic exports on extreme DPI setups
        dpr = Math.max(1, dpr);
        return dpr;
      }

      async function capturePngBlobFromWindow(targetWin, options = {}) {
        const result = await capturePngCanvasFromWindow(targetWin, options);
        if (!result) return null;
        const { out, restore } = result;
        return new Promise((resolve) => {
            try {
                out.toBlob((blob) => {
                    try { restore && restore(); } catch (_) {}
                    resolve(blob || null);
                }, 'image/png');
            } catch (_) {
                try { restore && restore(); } catch (_) {}
                resolve(null);
            }
        });
      }

      function parsePolygonClipPath(clipPathText) {
        try {
            if (!clipPathText) return null;
            const text = String(clipPathText).trim();
            if (!text || text === 'none') return null;
            const m = text.match(/^polygon\((.*)\)$/i);
            if (!m || !m[1]) return null;
            const inner = m[1].trim();
            const pts = inner.split(',').map(s => s.trim()).filter(Boolean);
            const points = [];
            for (const p of pts) {
                // Expect "x% y%" (typical in our layouts)
                const parts = p.split(/\s+/).filter(Boolean);
                if (parts.length < 2) continue;
                const xs = parts[0], ys = parts[1];
                if (!xs.endsWith('%') || !ys.endsWith('%')) {
                    // For now only support percent-based polygons (used by toolbar layouts)
                    return null;
                }
                const x = parseFloat(xs);
                const y = parseFloat(ys);
                if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
                points.push({ xPct: x / 100, yPct: y / 100 });
            }
            return points.length >= 3 ? points : null;
        } catch (_) {
            return null;
        }
      }

      function applyPolygonClip(ctx, polyPts, dx, dy, dw, dh) {
        if (!polyPts || polyPts.length < 3) return false;
        try {
            ctx.beginPath();
            polyPts.forEach((pt, idx) => {
                const x = dx + pt.xPct * dw;
                const y = dy + pt.yPct * dh;
                if (idx === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.closePath();
            ctx.clip();
            return true;
        } catch (_) {
            return false;
        }
      }

      async function saveGridCompositeImage({ gridEl, holders, format = 'png', dpi = DEFAULT_SAVE_DPI }) {
        // Capture each pane as a PNG and stitch into one canvas based on the holder layout.
        const gridRect = gridEl.getBoundingClientRect();

        // Hide top-level multi-panel chrome while capturing
        const restoreTop = hideForExport(document);
        const extraHidden = [];
        try {
            const extraSelectors = ['#multi-panel-manager', '#multi-panel-fab', '#multi-panel-close-fab', '#multi-panel-wcs-lock', '.toolbar'];
            for (const sel of extraSelectors) {
                document.querySelectorAll(sel).forEach((el) => {
                    if (!el) return;
                    extraHidden.push(el);
                });
            }
            extraHidden.forEach(el => {
                el.dataset.__prevVisibility = el.style.visibility || '';
                el.style.visibility = 'hidden';
            });
        } catch (_) {}

        try {
            const captures = await Promise.all(holders.map(async (holder) => {
                try {
                    const frame = holder && holder.querySelector && holder.querySelector('iframe');
                    const w = frame && frame.contentWindow;
                    if (!w) return null;
                    if (typeof w.__nelouraCapturePngBlob === 'function') {
                        const blob = await w.__nelouraCapturePngBlob({ dpi });
                        if (!blob) return null;
                        const bitmap = await createImageBitmap(blob);
                        return { holder, frame, bitmap };
                    }
                    return null;
                } catch (_) {
                    return null;
                }
            }));

            // Choose an output scale that matches the highest pane capture density.
            // This prevents downsampling when panes are rendered at higher internal resolution.
            let dpr = Math.max(1, window.devicePixelRatio || 1);
            try {
                for (const cap of captures) {
                    if (!cap) continue;
                    const { holder, frame, bitmap } = cap;
                    const r = (holder && holder.getBoundingClientRect) ? holder.getBoundingClientRect() : (frame && frame.getBoundingClientRect ? frame.getBoundingClientRect() : null);
                    if (!r || !r.width || !r.height) continue;
                    const sx = bitmap.width / r.width;
                    const sy = bitmap.height / r.height;
                    if (Number.isFinite(sx) && sx > dpr) dpr = sx;
                    if (Number.isFinite(sy) && sy > dpr) dpr = sy;
                }
            } catch (_) {}
            dpr = Math.max(0.01, normalizeSaveDpi(dpi) / 96);

            const outW = Math.max(1, Math.round(gridRect.width * dpr));
            const outH = Math.max(1, Math.round(gridRect.height * dpr));
            const out = document.createElement('canvas');
            out.width = outW;
            out.height = outH;
            const ctx = out.getContext('2d', { willReadFrequently: true });
            ctx.imageSmoothingEnabled = false;
            // Fill background (matches viewer default)
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, outW, outH);

            // Sort by z-index so overlapping layouts (e.g., diagonal) render correctly.
            const ordered = captures
                .filter(Boolean)
                .map((cap, idx) => {
                    let z = idx;
                    try {
                        const zStr = (cap.holder && (cap.holder.style.zIndex || getComputedStyle(cap.holder).zIndex)) || '';
                        const zi = parseInt(zStr, 10);
                        if (Number.isFinite(zi)) z = zi;
                    } catch (_) {}
                    return { ...cap, __z: z, __idx: idx };
                })
                .sort((a, b) => (a.__z - b.__z) || (a.__idx - b.__idx));

            for (const cap of ordered) {
                const { holder, frame, bitmap } = cap;
                const r = (holder && holder.getBoundingClientRect) ? holder.getBoundingClientRect() : frame.getBoundingClientRect();
                const dx = Math.round((r.left - gridRect.left) * dpr);
                const dy = Math.round((r.top - gridRect.top) * dpr);
                const dw = Math.round(r.width * dpr);
                const dh = Math.round(r.height * dpr);

                // Respect clip-path for diagonal/tilted layouts so the composite matches the screen.
                let clipText = '';
                try { clipText = (holder && getComputedStyle(holder).clipPath) || ''; } catch (_) {}
                if (!clipText || clipText === 'none') {
                    try { clipText = (frame && getComputedStyle(frame).clipPath) || ''; } catch (_) {}
                }
                const poly = parsePolygonClipPath(clipText);

                try {
                    ctx.save();
                    if (poly) {
                        applyPolygonClip(ctx, poly, dx, dy, dw, dh);
                    }
                    ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, dx, dy, dw, dh);
                } catch (_) {
                    // ignore
                } finally {
                    try { ctx.restore(); } catch (_) {}
                    try { bitmap && bitmap.close && bitmap.close(); } catch (_) {}
                }
            }

            const filename = `grid_${new Date().toISOString().replace(/[:.]/g, '-')}.${format === 'pdf' ? 'pdf' : 'png'}`;
            if (format === 'pdf') {
                await downloadCanvasAsPdf(out, filename, document, dpi);
                notify('PDF saved', 'success');
            } else {
                await downloadCanvasAsPng(out, filename, document);
                notify('PNG saved', 'success');
            }
        } catch (e) {
            console.error('Save grid image failed:', e);
            notify(`Failed to save ${format === 'pdf' ? 'PDF' : 'PNG'}`, 'error');
        } finally {
            try { restoreTop && restoreTop(); } catch (_) {}
            try {
                extraHidden.forEach(el => {
                    el.style.visibility = el.dataset.__prevVisibility || '';
                    delete el.dataset.__prevVisibility;
                });
            } catch (_) {}
        }
      }

    function buildFilename(targetWin = window) {
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        let base = 'image';
        try {
            const path = (targetWin.fitsData && (targetWin.fitsData.filepath || targetWin.fitsData.filename)) || '';
            if (path) {
                const m = String(path).match(/([^/\\]+?)(\.[^.]+)?$/);
                if (m && m[1]) base = m[1];
            }
        } catch (_) {}
        return `${base}_${ts}.png`;
    }
})();
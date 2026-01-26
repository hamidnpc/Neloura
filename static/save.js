// static/save.js
(function () {
    'use strict';

    // Public entry (optional)
    window.initializeSaveButton = init;
    // Expose stable APIs for other windows to trigger capture/save in THIS window.
    // (Used by multi-panel/grid mode where the toolbar lives in the top window.)
    window.__nelouraSavePng = () => savePngFromWindow(window);
    window.__nelouraCapturePngBlob = () => capturePngBlobFromWindow(window);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        // In pane iframes we don't build toolbar UI (it lives in top window),
        // but we still expose __nelouraSavePng so the top window can trigger saving.
        try { if (window.self !== window.top) return; } catch (_) {}

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
        btn.title = 'Save PNG';
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
        btn.addEventListener('click', onSaveClick);

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

    function drawAllViewerCanvases(targetWin, container, ctx, dpr) {
        const containerRect = container.getBoundingClientRect();
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
            const dx = (r.left - containerRect.left) * dpr;
            const dy = (r.top - containerRect.top) * dpr;
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

    function drawDomDots(targetWin, container, ctx, dpr) {
        const containerRect = container.getBoundingClientRect();

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
                const cx = (rect.left - containerRect.left + rect.width / 2) * dpr;
                const cy = (rect.top - containerRect.top + rect.height / 2) * dpr;
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

    async function drawZoomInsets(targetWin, container, ctx, dpr) {
        const containerRect = container.getBoundingClientRect();
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
                const dx = (r.left - containerRect.left) * dpr;
                const dy = (r.top - containerRect.top) * dpr;
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
                    const px = (pr.left - containerRect.left) * dpr;
                    const py = (pr.top - containerRect.top) * dpr;
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

   
      async function onSaveClick() {
        const targetWin = getSaveTargetWindow();

        // If we're in multi-panel/grid mode (2+ iframes visible), save a composite
        // PNG of the entire grid as currently displayed.
        try {
            if (window.self === window.top) {
                const grid = document.getElementById('multi-panel-grid');
                const wrap = document.getElementById('multi-panel-container');
                const holders = grid ? Array.from(grid.children || []).filter(h => h && h.querySelector && h.querySelector('iframe')) : [];
                const gridVisible = !!(wrap && (wrap.style.display !== 'none') && (getComputedStyle(wrap).display !== 'none'));
                if (gridVisible && holders.length >= 2) {
                    return saveGridCompositePng({ gridEl: grid, holders });
                }
            }
        } catch (_) {}

        // Otherwise (single-panel or no grid), if we're in grid mode and the active pane
        // has its own saver, prefer that. This keeps all DOM querying strictly within the pane document.
        try {
            if (targetWin && targetWin !== window && typeof targetWin.__nelouraSavePng === 'function') {
                return targetWin.__nelouraSavePng();
            }
        } catch (_) {}

        return savePngFromWindow(targetWin);
      }

      async function savePngFromWindow(targetWin) {
        const result = await capturePngCanvasFromWindow(targetWin);
        if (!result) return;
        const { out, filename, targetDoc, restore } = result;
        try {
            out.toBlob((blob) => {
                if (!blob) {
                    const a = targetDoc.createElement('a');
                    a.href = out.toDataURL('image/png');
                    a.download = filename;
                    a.click();
                    return;
                }
                const url = URL.createObjectURL(blob);
                const a = targetDoc.createElement('a');
                a.href = url;
                a.download = filename;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            }, 'image/png');
            notify('PNG saved', 'success');
        } catch (e) {
            console.error('Save PNG failed:', e);
            notify('Failed to save PNG', 'error');
        } finally {
            try { restore && restore(); } catch (_) {}
        }
      }

      async function capturePngCanvasFromWindow(targetWin) {
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

          const rect = container.getBoundingClientRect();
          const dpr = computeBestExportDpr(targetWin, container, rect);
          const outW = Math.max(1, Math.round(rect.width * dpr));
          const outH = Math.max(1, Math.round(rect.height * dpr));

          const out = targetDoc.createElement('canvas');
          out.width = outW;
          out.height = outH;
          const ctx = out.getContext('2d', { willReadFrequently: true });
          ctx.imageSmoothingEnabled = false;

          drawAllViewerCanvases(targetWin, container, ctx, dpr);
          drawDomDots(targetWin, container, ctx, dpr);
          await drawZoomInsets(targetWin, container, ctx, dpr);

          const filename = buildFilename(targetWin);
          return { out, filename, targetDoc, restore, dpr, rect };
        } catch (e) {
          console.error('Capture PNG failed:', e);
          notify('Failed to capture PNG', 'error');
          try { restore && restore(); } catch (_) {}
          return null;
        }
      }

      function computeBestExportDpr(targetWin, container, containerRect) {
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
        dpr = Math.min(4, Math.max(1, dpr));
        return dpr;
      }

      async function capturePngBlobFromWindow(targetWin) {
        const result = await capturePngCanvasFromWindow(targetWin);
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

      async function saveGridCompositePng({ gridEl, holders }) {
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
                        const blob = await w.__nelouraCapturePngBlob();
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
            dpr = Math.min(4, Math.max(1, dpr));

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

            const filename = `grid_${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
            out.toBlob((blob) => {
                if (!blob) {
                    const a = document.createElement('a');
                    a.href = out.toDataURL('image/png');
                    a.download = filename;
                    a.click();
                    return;
                }
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            }, 'image/png');
            notify('PNG saved', 'success');
        } catch (e) {
            console.error('Save grid PNG failed:', e);
            notify('Failed to save PNG', 'error');
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
// static/save.js
(function () {
    'use strict';

    // Public entry (optional)
    window.initializeSaveButton = init;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
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
        styleToolbarButton(btn); // match toolbar button look

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

    function styleToolbarButton(btn) {
        Object.assign(btn.style, {
            display: 'none',              // hidden until image loaded
            width: '32px',
            height: '32px',
            padding: '0',
            marginLeft: '6px',
            background: 'transparent',
            border: '1px solid #555',
            borderRadius: '4px',
            cursor: 'pointer',
            color: '#ccc',
            alignItems: 'center',
            justifyContent: 'center'
        });
    }

    // ---------- Visibility management ----------
    function installVisibilityWatchers() {
        // Update after histogram draw (signals image context is ready)
        document.addEventListener('histogram:ready', updateToolbarVisibility);

        // Hook into OSD viewer lifecycle
        const tryAttachViewerHandlers = () => {
            if (window.tiledViewer && !window.tiledViewer._saveBtnHandlersAttached) {
                try {
                    window.tiledViewer.addHandler('open', updateToolbarVisibility);
                    window.tiledViewer.addHandler('open-failed', updateToolbarVisibility);
                    window.tiledViewer.addHandler('close', updateToolbarVisibility);
                    window.tiledViewer._saveBtnHandlersAttached = true;
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
    }

    function isImageLoaded() {
        try {
            if (window.tiledViewer && typeof window.tiledViewer.isOpen === 'function' && window.tiledViewer.isOpen()) {
                return true;
            }
        } catch (_) {}
        try {
            if (window.fitsData && Number.isFinite(window.fitsData.width) && Number.isFinite(window.fitsData.height)) {
                return true;
            }
        } catch (_) {}
        return false;
    }

    // Only show: +, -, R, Histogram, and Save when an image is loaded
    function updateToolbarVisibility() {
        const loaded = isImageLoaded();
        const toolbar = document.querySelector('.toolbar');
        const saveBtn = document.getElementById('save-png-toolbar-btn');

        if (saveBtn) {
            saveBtn.style.display = loaded ? 'inline-flex' : 'none';
        }

        if (!toolbar) return;

        const buttons = Array.from(toolbar.querySelectorAll('button'));
        for (const b of buttons) {
            const type = classifyToolbarButton(b);
            if (!type) continue; // unknown or leave alone

            // Only show these when image is loaded
            const shouldShow = loaded;
            b.style.display = shouldShow ? 'inline-flex' : 'none';
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
        // Ensure consistent look with rest of toolbar buttons
        btn.style.width = '32px';
        btn.style.height = '32px';
        if (!btn.style.border || btn.style.border === 'initial') {
            btn.style.border = '1px solid #555';
        }
        if (!btn.style.borderRadius || btn.style.borderRadius === 'initial') {
            btn.style.borderRadius = '4px';
        }
        if (!btn.style.background || btn.style.background === 'initial') {
            btn.style.background = 'transparent';
        }
        btn.style.display = btn.style.display || 'inline-flex';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'center';
        btn.style.padding = btn.style.padding || '0';
        btn.style.marginLeft = btn.style.marginLeft || '6px';
        btn.style.color = btn.style.color || '#ccc';
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

    function getViewerContainer() {
        return document.getElementById('openseadragon') || document.body;
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

    function drawAllViewerCanvases(container, ctx, dpr) {
        const containerRect = container.getBoundingClientRect();
        const canvases = Array.from(container.querySelectorAll('canvas')).filter(isVisibleCanvas);

        let drawerCanvas = null;
        try { drawerCanvas = window.tiledViewer?.drawer?.canvas || null; } catch (_) {}
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
            ctx.drawImage(c, 0, 0, c.width, c.height, dx, dy, dw, dh);
        }
    }

    function drawDomDots(container, ctx, dpr) {
        const containerRect = container.getBoundingClientRect();

        let domDots = [];
        if (Array.isArray(window.catalogDots) && window.catalogDots.length) {
            domDots = window.catalogDots.filter(el => el && el.getBoundingClientRect);
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
    const HIDE_FOR_EXPORT_SELECTORS = [
        '#navigatorDiv',
        '.navigator',
        '#displayregioncontainer',          // <- add this
        '[data-exclude-from-export="true"]',
        '.zoom-panel', '#zoom-panel', '.mini-map', '#miniMap'
      ];
      
      function hideForExport() {
        const nodes = [];
        for (const sel of HIDE_FOR_EXPORT_SELECTORS) {
          document.querySelectorAll(sel).forEach(el => {
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

   
      function onSaveClick() {
        if (!isImageLoaded()) { notify('No image loaded to save', 'warning'); return; }
      
        const container = getViewerContainer();
        if (!container) { notify('Viewer not found', 'error'); return; }
      
        const restore = hideForExport(); // <— hide UI (zoom panel, navigator, etc.)
        try {
          const dpr = Math.max(1, window.devicePixelRatio || 1);
          const rect = container.getBoundingClientRect();
          const outW = Math.max(1, Math.round(rect.width * dpr));
          const outH = Math.max(1, Math.round(rect.height * dpr));
      
          const out = document.createElement('canvas');
          out.width = outW;
          out.height = outH;
          const ctx = out.getContext('2d', { willReadFrequently: true });
          ctx.imageSmoothingEnabled = false;
      
          drawAllViewerCanvases(container, ctx, dpr);
          drawDomDots(container, ctx, dpr);
      
          const filename = buildFilename();
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
          console.error('Save PNG failed:', e);
          notify('Failed to save PNG', 'error');
        } finally {
          try { restore && restore(); } catch (_) {}
        }
      }

    function buildFilename() {
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        let base = 'image';
        try {
            const path = (window.fitsData && (window.fitsData.filepath || window.fitsData.filename)) || '';
            if (path) {
                const m = String(path).match(/([^/\\]+?)(\.[^.]+)?$/);
                if (m && m[1]) base = m[1];
            }
        } catch (_) {}
        return `${base}_${ts}.png`;
    }
})();
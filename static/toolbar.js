// static/toolbar.js
(function () {
    'use strict';

    // Order after Files; Plotter and Local Coding always visible; others only when image is loaded
    // "Mouse mode" (pointer tool) is its own toolbar button.
    // Requested UX: place it immediately to the RIGHT of the Settings button.
    const ORDER = ['save', 'histogram', 'zoom-in', 'zoom-out', 'reset', 'settings', 'mouse-mode', 'local-coding', 'plotter', 'catalog', 'segments', 'regions', 'peak'];
    const ALWAYS = new Set(['files', 'save', 'histogram', 'zoom-in', 'zoom-out', 'reset', 'plotter', 'catalog', 'segments', 'mouse-mode', 'regions', 'peak', 'settings']);
    const WHEN_LOADED = new Set();

    // Admin flag (fetched once on init)
    let __isAdmin = false;
    window.__multiPanelWcsLockEnabled = !!window.__multiPanelWcsLockEnabled;
    async function detectAdmin() {
        try { const r = await fetch('/settings/me'); const j = await r.json(); __isAdmin = !!(j && j.admin); }
        catch (_) { __isAdmin = false; }
    }
    // Lazy loader for local_coding.js in case it hasn't been loaded yet
    function ensureLocalCodingLoaded() {
        return new Promise((resolve, reject) => {
            try {
                if (typeof window.openLocalCoding === 'function' || typeof window.toggleLocalCodingPanel === 'function') {
                    return resolve();
                }
                // Check existing script
                const existing = Array.from(document.getElementsByTagName('script'))
                    .find(s => (s.src || '').includes('/static/local_coding.js'));
                if (existing) {
                    existing.addEventListener('load', () => resolve());
                    existing.addEventListener('error', () => resolve());
                    // If it is already loaded but functions not yet attached, give it a tick
                    setTimeout(() => resolve(), 50);
                    return;
                }
                // Inject script
                const s = document.createElement('script');
                s.defer = true; s.src = '/static/local_coding.js';
                s.onload = () => resolve();
                s.onerror = () => resolve();
                document.head.appendChild(s);
            } catch (_) { resolve(); }
        });
    }

    function getNodeForType(type) {
        const ids = {
            'save': 'save-png-toolbar-btn',
            'histogram': 'histogram-button',
            'zoom-in': 'zoom-in-button',
            'zoom-out': 'zoom-out-button',
            'reset': 'reset-button',
            'plotter': 'plotter-button',
            'local-coding': 'local-coding-button',
            'catalog': 'catalog-button',
            'peak': 'peak-finder-button',
            'settings': 'settings-button'
            , 'segments': 'segments-button'
            , 'regions': 'region-tools-button'
            , 'mouse-mode': 'mouse-mode-button'
        };
        const id = ids[type]; if (!id) return null;
        const el = document.getElementById(id); if (!el) return null;
        // Move Catalog’s dropdown wrapper (to keep the dropdown working)
        if (type === 'catalog') {
            const wrapper = el.closest('.dropdown');
            return wrapper || el;
        }
        if (type === 'regions') {
            const wrapper = el.closest('.region-tool-wrapper');
            return wrapper || el;
        }
        return el;
    }

    function reorderToolbar() {
        const a = anchorBtn(); if (!a) return;

        // 1) Pin Save right after Files
        const save = getNodeForType('save');
        let after = a;
        if (save) {
            if (after.nextElementSibling !== save) after.insertAdjacentElement('afterend', save);
            inheritAnchorClasses(save);
            after = save;
        }

        // 2) Place the rest as per ORDER
        ORDER.forEach(type => {
            if (type === 'save') return;
            const node = getNodeForType(type);
            if (!node) return;
            if (after.nextElementSibling !== node) after.insertAdjacentElement('afterend', node);
            inheritAnchorClasses(node);
            after = node;
        });
    }

    // ---------- Helpers ----------
    function toolbar() { return document.querySelector('.toolbar'); }
    function anchorBtn() {
        const tb = toolbar(); if (!tb) return null;
        return tb.querySelector('.file-browser-button')            // current Files button from files.js
            || tb.querySelector('#file-browser-button')            // legacy id (if ever present)
            || tb.querySelector('#files-button')                   // legacy id (if ever present)
            || Array.from(tb.querySelectorAll('button,[role="button"]')).find(b => {
                const id = (b.id || '').toLowerCase(), cls = (b.className || '').toLowerCase(), t = (b.title || '').toLowerCase(), x = (b.textContent || '').trim().toLowerCase();
                return id.includes('files') || cls.includes('file-browser') || t.includes('files') || x === 'files';
            }) || null;
    }
    function inheritAnchorClasses(el) {
        const target = el && el.__toolbarApplyAnchorTo ? el.__toolbarApplyAnchorTo : el;
        const a = anchorBtn(); if (!a || !target || target === a) return;
        // IMPORTANT: do not wipe inline styles.
        // Some toolbar buttons are "owned" by other modules (e.g. save.js, peak.js) and
        // rely on inline style + their own visibility management. Clearing styles here
        // causes buttons/icons to appear briefly and then "disappear" as those modules
        // later reapply their own state.
        (a.className || '').split(/\s+/).filter(Boolean).forEach(c => target.classList.add(c));
        const role = a.getAttribute('role'); if (role && !target.getAttribute('role')) target.setAttribute('role', role);
    }
    function isLoaded() {
        try { if (window.tiledViewer && window.tiledViewer.isOpen && window.tiledViewer.isOpen()) return true; } catch (_) { }
        try { if (window.fitsData && Number.isFinite(window.fitsData.width) && Number.isFinite(window.fitsData.height)) return true; } catch (_) { }
        return false;
    }
    function idToType(id) {
        if (id === 'save-png-toolbar-btn') return 'save';
        if (id === 'plotter-button') return 'plotter';
        if (id === 'local-coding-button') return 'local-coding';
        if (id === 'zoom-in-button') return 'zoom-in';
        if (id === 'zoom-out-button') return 'zoom-out';
        if (id === 'reset-button') return 'reset';
        if (id === 'histogram-button') return 'histogram';
        if (id === 'catalog-button') return 'catalog';
        if (id === 'peak-finder-button') return 'peak';
        if (id === 'region-tools-button') return 'regions';
        return '';
    }
    function getExistingText(id) {
        const el = document.getElementById(id);
        const txt = el ? (el.textContent || '').trim() : '';
        return txt || null;
    }

    function collectSegmentBrowserContexts() {
        const contexts = [];
        const pushCtx = (ctx) => {
            if (!ctx || typeof ctx !== 'object') return;
            if (!contexts.includes(ctx)) contexts.push(ctx);
        };
        pushCtx(window);
        try {
            const activePane = window.getActivePaneWindow && window.getActivePaneWindow();
            if (activePane) pushCtx(activePane);
        } catch (_) { }
        try {
            const grid = document.getElementById('multi-panel-grid');
            if (grid && grid.querySelectorAll) {
                grid.querySelectorAll('iframe').forEach((frame) => {
                    try {
                        const w = frame && frame.contentWindow;
                        if (w) pushCtx(w);
                    } catch (_) { }
                });
            }
        } catch (_) { }
        return contexts;
    }

    // ---------- Builders (create if missing; styling from Files via inherit) ----------
    const builders = {
        // Save button is owned by static/save.js (creates + styles + manages visibility).
        // Do NOT create it here or it will flicker/disappear when save.js applies state.
        'plotter': () => {
            const a = anchorBtn(); if (!a) return null;
            const b = document.createElement('button');
            b.id = 'plotter-button'; b.type = 'button'; b.className = a.className || ''; b.textContent = getExistingText('plotter-button') || 'Plotter';
            // Use the same inline handler behavior as original HTML: togglePlotter()
            b.setAttribute('onclick', 'togglePlotter()');
            b.addEventListener('click', (e) => { e.preventDefault(); if (typeof window.togglePlotter === 'function') window.togglePlotter(); }); return b;
        },
        'local-coding': () => {
            if (!__isAdmin) return null;
            const a = anchorBtn(); if (!a) return null;
            const b = document.createElement('button');
            b.id = 'local-coding-button'; b.type = 'button'; b.className = a.className || ''; b.title = 'Local Coding';
            b.innerHTML = `
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <polyline points="7 6 1 12 7 18"></polyline>
  <polyline points="17 6 23 12 17 18"></polyline>
  <line x1="11" y1="6" x2="13" y2="18"></line>
</svg>`;
            // Click handler is bound in bindToolbarActions() to avoid duplicate bindings
            return b;
        },
        'zoom-in': () => {
            const a = anchorBtn(); if (!a) return null;
            const b = document.createElement('button');
            b.id = 'zoom-in-button'; b.type = 'button'; b.className = a.className || ''; b.textContent = '+';
            b.addEventListener('click', (e) => {
                e.preventDefault();
                const w = (window.getActivePaneWindow && window.getActivePaneWindow()) || window;
                const v = (w && (w.tiledViewer || w.viewer)) || window.tiledViewer || window.viewer;
                if (v && v.viewport) v.viewport.zoomBy(1.2);
            });
            return b;
        },
        'zoom-out': () => {
            const a = anchorBtn(); if (!a) return null;
            const b = document.createElement('button');
            b.id = 'zoom-out-button'; b.type = 'button'; b.className = a.className || ''; b.textContent = '-';
            b.addEventListener('click', (e) => {
                e.preventDefault();
                const w = (window.getActivePaneWindow && window.getActivePaneWindow()) || window;
                const v = (w && (w.tiledViewer || w.viewer)) || window.tiledViewer || window.viewer;
                if (v && v.viewport) v.viewport.zoomBy(1 / 1.2);
            });
            return b;
        },
        'reset': () => {
            const a = anchorBtn(); if (!a) return null;
            const b = document.createElement('button');
            b.id = 'reset-button'; b.type = 'button'; b.className = a.className || ''; b.textContent = 'R';
            b.addEventListener('click', (e) => {
                e.preventDefault();
                const w = (window.getActivePaneWindow && window.getActivePaneWindow()) || window;
                const v = (w && (w.tiledViewer || w.viewer)) || window.tiledViewer || window.viewer;
                if (v && v.viewport) v.viewport.goHome(true);
            });
            return b;
        },
        'histogram': () => {
            const a = anchorBtn(); if (!a) return null;
            const b = document.createElement('button');
            b.id = 'histogram-button'; b.type = 'button'; b.className = a.className || ''; b.classList.add('dynamic-range-button'); b.title = 'Histogram';
            b.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <rect x="2" y="14" width="3" height="6"></rect>
                <rect x="7" y="8" width="3" height="12"></rect>
                <rect x="12" y="12" width="3" height="8"></rect>
                <rect x="17" y="6" width="3" height="14"></rect>
            </svg>`;
            b.addEventListener('click', (e) => {
                e.preventDefault();
                const w = window.getActivePaneWindow && window.getActivePaneWindow();
                if (w && typeof w.showDynamicRangePopup === 'function') return w.showDynamicRangePopup();
                if (typeof window.showDynamicRangePopup === 'function') window.showDynamicRangePopup();
            });
            return b;
        },
        'catalog': () => {
            const a = anchorBtn(); if (!a) return null;
            const b = document.createElement('button');
            b.id = 'catalog-button'; b.type = 'button'; b.className = a.className || ''; b.textContent = 'Catalogs';
            b.addEventListener('click', (e) => { e.preventDefault(); toggleCatalogDropdown(); });
            return b;
        },
        'segments': () => {
            const a = anchorBtn(); if (!a) return null;
            const b = document.createElement('button');
            b.id = 'segments-button'; b.type = 'button'; b.className = a.className || ''; b.textContent = 'Segments';
            const invokeSegmentsBrowser = () => {
                const candidates = collectSegmentBrowserContexts();
                for (const ctx of candidates) {
                    try {
                        if (ctx && typeof ctx.openSegmentsFileBrowser === 'function') {
                            ctx.openSegmentsFileBrowser();
                            return true;
                        }
                        if (ctx && typeof ctx.showFileBrowser === 'function' && typeof ctx.loadSegmentOverlay === 'function') {
                            ctx.showFileBrowser((selectedPath) => { if (selectedPath) ctx.loadSegmentOverlay(selectedPath); });
                            return true;
                        }
                    } catch (err) {
                        console.warn('[segments-button] Failed to invoke segment browser in context', err);
                    }
                }
                console.warn('[segments-button] segment file browser not available');
                return false;
            };
            b.addEventListener('click', (e) => { e.preventDefault(); invokeSegmentsBrowser(); });
            b.__segmentsInvoke = invokeSegmentsBrowser;
            return b;
        },
        'mouse-mode': () => {
            const a = anchorBtn(); if (!a) return null;
            const b = document.createElement('button');
            b.id = 'mouse-mode-button';
            b.type = 'button';
            b.className = a.className || '';
            b.title = 'Mouse mode';
            b.setAttribute('aria-label', 'Mouse mode');
            // Outline (inactive) icon by default; filled icon when active (pointer mode).
            b.dataset.active = '0';
            b.innerHTML = `
<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M5 3l14 8-6.4 1.6 2.8 7-2.3.9-2.8-7L6 18V3Z"
        stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path>
</svg>`;
            // Click handler is bound in bindToolbarActions()
            return b;
        },
        'peak': () => {
            const a = anchorBtn(); if (!a) return null;
            const b = document.createElement('button');
            b.id = 'peak-finder-button';
            b.type = 'button';
            b.className = a.className || '';
            b.title = 'Peak Finder';
            // Keep label simple; styling comes from CSS/classes
            b.textContent = 'Peak Finder';
            // Click handler is bound in bindToolbarActions()
            return b;
        }
        ,
        'regions': () => {
            const a = anchorBtn(); if (!a) return null;

            // Helper: pick the correct window to receive region-tool commands.
            // In multi-panel mode we want the ACTIVE pane iframe; otherwise fall back to this window.
            const getRegionTargetWindow = () => {
                try {
                    if (typeof window.getActivePaneWindow === 'function') {
                        const w = window.getActivePaneWindow();
                        if (w && w !== window) return w;
                    }
                } catch (_) { }
                return window;
            };

            const wrapper = document.createElement('div');
            wrapper.className = 'region-tool-wrapper';
            wrapper.setAttribute('data-region-tool-wrapper', '1');
            Object.assign(wrapper.style, {
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'stretch'
            });

            const b = document.createElement('button');
            b.id = 'region-tools-button';
            b.type = 'button';
            b.className = a.className || '';
            b.title = 'Draw regions';
            b.textContent = 'Regions';
            b.style.display = 'inline-flex';
            b.style.alignItems = 'center';
            b.style.justifyContent = 'center';
            b.style.gap = '4px';
            b.dataset.activeTool = '';

            const dropdown = document.createElement('div');
            dropdown.id = 'region-tools-dropdown';
            dropdown.className = 'region-tool-dropdown';
            Object.assign(dropdown.style, {
                position: 'absolute',
                top: 'calc(100% + 20px)',
                right: '0',
                // Ensure region type icons fit in a single row
                minWidth: '220px',
                /* iOS-style glass (less transparent, more blur) */
                background: 'rgba(18, 18, 20, 0.88)',
                border: '1px solid rgba(255, 255, 255, 0.16)',
                borderRadius: '14px',
                boxShadow: '0 18px 50px rgba(0,0,0,0.55)',
                backdropFilter: 'saturate(200%) blur(24px)',
                WebkitBackdropFilter: 'saturate(200%) blur(24px)',
                padding: '8px',
                display: 'none',
                flexDirection: 'column',
                gap: '4px',
                zIndex: '5000'
            });

            const sectionLabel = (text) => {
                const label = document.createElement('div');
                label.textContent = text;
                label.style.fontSize = '11px';
                label.style.textTransform = 'uppercase';
                label.style.letterSpacing = '0.08em';
                label.style.opacity = '0.65';
                label.style.padding = '6px 8px 2px';
                return label;
            };

            const makeOptionButton = (opt) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.textContent = opt.label;
                btn.dataset.toolId = opt.id || '';
                btn.title = opt.hint || '';
                btn.style.display = 'flex';
                btn.style.justifyContent = 'space-between';
                btn.style.alignItems = 'center';
                btn.style.padding = '8px 10px';
                btn.style.borderRadius = '8px';
                btn.style.border = '1px solid rgba(255,255,255,0.14)';
                btn.style.background = 'transparent';
                btn.style.color = 'inherit';
                btn.style.fontSize = '13px';
                btn.style.cursor = 'pointer';
                btn.style.gap = '6px';
                btn.style.transition = 'background-color 160ms ease, border-color 160ms ease';
                btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(255,255,255,0.10)'; btn.style.borderColor = 'rgba(255,255,255,0.18)'; });
                btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent'; btn.style.borderColor = 'rgba(255,255,255,0.14)'; });
                return btn;
            };

            const makeShapeIconButton = (opt) => {
                const btn = makeOptionButton(opt);
                // Icon-only; keep label accessible via aria-label/title
                btn.textContent = '';
                btn.setAttribute('aria-label', opt.label || opt.id || 'Region tool');
                btn.style.width = '42px';
                btn.style.height = '38px';
                btn.style.padding = '0';
                btn.style.justifyContent = 'center';
                btn.style.alignItems = 'center';
                btn.style.borderRadius = '10px';
                btn.innerHTML = opt.iconSvg || '';
                return btn;
            };

            const regionOptions = [
                {
                    id: 'circle', label: 'Circle', hint: 'Click + drag out radius',
                    iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <circle cx="12" cy="12" r="7.5" stroke="currentColor" stroke-width="2"></circle>
</svg>`
                },
                {
                    id: 'rectangle', label: 'Rectangle', hint: 'Drag diagonal corner',
                    iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <rect x="6" y="7" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="2"></rect>
</svg>`
                },
                {
                    id: 'ellipse', label: 'Ellipse', hint: 'Drag bounding box',
                    iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <ellipse cx="12" cy="12" rx="8" ry="5.5" stroke="currentColor" stroke-width="2"></ellipse>
</svg>`
                },
                {
                    id: 'hexagon', label: 'Hexagon', hint: 'Drag to size a six-sided region',
                    iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M8 4.5h8l4 7-4 7H8l-4-7 4-7Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path>
</svg>`
                }
            ];
            const optionButtons = new Map();

            const applyActiveState = (activeId) => {
                optionButtons.forEach((btn, key) => {
                    const isActive = !!activeId && key === activeId;
                    btn.classList.toggle('active', isActive);
                    btn.style.background = isActive ? 'rgba(59,130,246,0.25)' : 'transparent';
                    btn.style.borderColor = isActive ? 'rgba(59,130,246,0.6)' : 'rgba(255,255,255,0.08)';
                });
                b.dataset.activeTool = activeId || '';
            };

            dropdown.appendChild(sectionLabel('Region Types'));
            const regionTypesRow = document.createElement('div');
            Object.assign(regionTypesRow.style, {
                display: 'flex',
                flexWrap: 'nowrap',
                justifyContent: 'space-between',
                gap: '6px',
                padding: '4px 6px 6px'
            });
            regionOptions.forEach((opt) => {
                const btn = makeShapeIconButton(opt);
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    dropdown.style.display = 'none';
                    try {
                        const target = getRegionTargetWindow();
                        if (target && typeof target.setRegionDrawingTool === 'function') {
                            target.setRegionDrawingTool(opt.id);
                            applyActiveState(opt.id);
                        } else {
                            console.warn('[toolbar] Region drawing APIs not ready in target window');
                        }
                    } catch (err) {
                        console.warn('[toolbar] Failed to set region tool', err);
                    }
                });
                optionButtons.set(opt.id, btn);
                regionTypesRow.appendChild(btn);
            });
            dropdown.appendChild(regionTypesRow);

            dropdown.appendChild(sectionLabel('Actions'));
            const removeBtn = makeOptionButton({ id: '__remove__', label: 'Remove All Regions', hint: 'Clear every drawn region' });
            removeBtn.style.color = '#FCA5A5';
            removeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                dropdown.style.display = 'none';
                try {
                    const target = getRegionTargetWindow();
                    if (target && typeof target.clearAllRegions === 'function') {
                        target.clearAllRegions();
                    } else {
                        console.warn('[toolbar] clearAllRegions not available in target window');
                    }
                } catch (err) {
                    console.warn('[toolbar] Failed to clear regions', err);
                }
            });
            dropdown.appendChild(removeBtn);

            let hideTimeout = null;
            const showDropdown = () => {
                clearTimeout(hideTimeout);
                dropdown.style.display = 'flex';
            };
            const hideDropdown = () => {
                hideTimeout = setTimeout(() => { dropdown.style.display = 'none'; }, 150);
            };

            wrapper.addEventListener('mouseenter', showDropdown);
            wrapper.addEventListener('mouseleave', hideDropdown);
            b.addEventListener('click', (e) => {
                e.preventDefault();
                if (dropdown.style.display === 'none' || dropdown.style.display === '') showDropdown();
                else dropdown.style.display = 'none';
            });

            document.addEventListener('region-tool-changed', (evt) => {
                if (!evt || !evt.detail) return;
                applyActiveState(evt.detail.toolId || null);
            });
            applyActiveState(null);

            wrapper.appendChild(b);
            wrapper.appendChild(dropdown);
            wrapper.__toolbarApplyAnchorTo = b;
            return wrapper;
        }
        ,
        'settings': () => {
            const a = anchorBtn(); if (!a) return null;
            const b = document.createElement('button');
            b.id = 'settings-button'; b.type = 'button'; b.className = a.className || ''; b.title = 'Settings';
            b.innerHTML = `
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <circle cx="12" cy="12" r="3"></circle>
  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c0 .66.39 1.26 1 1.51.24.1.5.15.76.15H21a2 2 0 1 1 0 4h-.09c-.26 0-.52.05-.76.15-.61.25-1 .85-1 1.49z"></path>
</svg>`;
            b.addEventListener('click', (e) => { e.preventDefault(); if (typeof window.openSettingsPopup === 'function') window.openSettingsPopup(); });
            return b;
        }
    };

    function toggleCatalogDropdown() {
        const btn = document.getElementById('catalog-button');
        const dd = document.getElementById('catalog-dropdown');
        if (!btn || !dd) return;
        dd.style.display = dd.style.display === 'block' ? 'none' : 'block';
        const cats = Array.isArray(window.availableCatalogs) ? window.availableCatalogs : null;
        if (cats && typeof window.updateCatalogDropdown === 'function') {
            try { window.updateCatalogDropdown(cats); } catch (_) { }
        } else if (typeof window.loadCatalogs === 'function') {
            try { window.loadCatalogs(); } catch (_) { }
        }
        if (typeof window.updateCatalogDropdown === 'function') { try { window.updateCatalogDropdown(); } catch (_) { } }
        const closeIfOutside = (e) => {
            if (!dd.contains(e.target) && e.target !== btn) {
                dd.style.display = 'none';
                document.removeEventListener('click', closeIfOutside);
            }
        };
        setTimeout(() => document.addEventListener('click', closeIfOutside), 0);
    }

    // ---------- Create/Order ----------
    function ensureAllButtons() {
        const tb = toolbar(), a = anchorBtn(); if (!tb || !a) return;

        // Save button is created/managed by save.js; we only pin/reorder if present.

        // Ensure the rest exist; do NOT relocate Plotter/Catalog if they already exist (to preserve dropdown/layout)
        const idsByType = {
            'plotter': 'plotter-button',
            'local-coding': 'local-coding-button',
            'zoom-in': 'zoom-in-button',
            'zoom-out': 'zoom-out-button',
            'reset': 'reset-button',
            'histogram': 'histogram-button',
            'catalog': 'catalog-button',
            'segments': 'segments-button',
            'mouse-mode': 'mouse-mode-button',
            'peak': 'peak-finder-button',
            'regions': 'region-tools-button',
            'settings': 'settings-button'
        };

        ORDER.forEach(type => {
            if (type === 'save') return;
            if (type === 'local-coding' && !__isAdmin) return;
            const id = idsByType[type];
            let el = document.getElementById(id);
            if (!el) {
                el = builders[type] && builders[type]();
                if (el) {
                    // Insert new ones after Save; but skip inserting if it's Catalog and a dropdown wrapper exists
                    if (type === 'catalog' && document.getElementById('catalog-dropdown')) {
                        // catalog already has dedicated wrapper in index.html; builder only runs when not present
                    } else {
                        const after = document.getElementById('save-png-toolbar-btn') || a;
                        after.insertAdjacentElement('afterend', el);
                    }
                }
            }
            if (el) inheritAnchorClasses(el);
        });

        // If a static Local Coding button exists from HTML, hide it for non-admin
        const lc = document.getElementById('local-coding-button');
        if (lc && !__isAdmin) lc.style.display = 'none';
    }

    function pinSaveAfterFiles() {
        const a = anchorBtn(), s = document.getElementById('save-png-toolbar-btn');
        if (!a || !s) return;
        if (a.nextElementSibling !== s) a.insertAdjacentElement('afterend', s);
        inheritAnchorClasses(s);
    }

    function bindToolbarActions() {
        // In multi-panel mode, zoom/reset controls must target the ACTIVE pane iframe's viewer.
        const bindZoomLike = (id, handler) => {
            const el = document.getElementById(id);
            if (!el || el.dataset.bound) return;
            try { el.removeAttribute('onclick'); } catch (_) {}
            el.addEventListener('click', (e) => {
                e.preventDefault();
                try {
                    const w = (window.getActivePaneWindow && window.getActivePaneWindow()) || window;
                    const v = (w && (w.tiledViewer || w.viewer)) || window.tiledViewer || window.viewer;
                    if (v && v.viewport) handler(v);
                } catch (_) { }
            });
            el.dataset.bound = '1';
        };
        bindZoomLike('zoom-in-button', (v) => v.viewport.zoomBy(1.2));
        bindZoomLike('zoom-out-button', (v) => v.viewport.zoomBy(1 / 1.2));
        bindZoomLike('reset-button', (v) => v.viewport.goHome(true));

        const mouseMode = document.getElementById('mouse-mode-button');
        if (mouseMode && !mouseMode.dataset.bound) {
            const setMouseModeActive = (active) => {
                try {
                    const isActive = !!active;
                    mouseMode.dataset.active = isActive ? '1' : '0';
                    mouseMode.classList.toggle('active', isActive);
                    // Requested styling:
                    // - active: white button background, black icon
                    // - inactive: default toolbar styling (transparent bg, white icon)
                    mouseMode.style.background = isActive ? '#ffffff' : '';
                    mouseMode.style.borderColor = isActive ? 'rgba(0,0,0,0.25)' : '';
                    mouseMode.style.color = isActive ? '#111111' : '';

                    // Swap icon: outline (inactive) vs filled (active)
                    mouseMode.innerHTML = isActive
                        ? `
<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
  <path d="M5 3l14 8-6.4 1.6 2.8 7-2.3.9-2.8-7L6 18V3Z"></path>
</svg>`
                        : `
<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M5 3l14 8-6.4 1.6 2.8 7-2.3.9-2.8-7L6 18V3Z"
        stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path>
</svg>`;
                } catch (_) { }
            };

            mouseMode.addEventListener('click', (e) => {
                e.preventDefault();
                try {
                    const target = (typeof window.getActivePaneWindow === 'function') ? (window.getActivePaneWindow() || window) : window;
                    if (target && typeof target.setRegionDrawingTool === 'function') {
                        target.setRegionDrawingTool(null);
                    }
                } catch (_) { }
                try {
                    document.dispatchEvent(new CustomEvent('region-tool-changed', { detail: { toolId: null } }));
                } catch (_) { }
                setMouseModeActive(true);
            });
            mouseMode.dataset.bound = '1';

            // Keep the toggle state in sync with region-tool changes:
            // pointer mode = active when no toolId is selected.
            document.addEventListener('region-tool-changed', (evt) => {
                try {
                    const toolId = evt && evt.detail ? (evt.detail.toolId || null) : null;
                    setMouseModeActive(!toolId);
                } catch (_) { }
            });

            // Initial state: pointer mode (no active tool) => active.
            setMouseModeActive(true);
        }

        const localCoding = document.getElementById('local-coding-button');
        if (localCoding && !localCoding.dataset.bound) {
            // Remove any inline onclick to avoid calling undefined handlers
            try { localCoding.removeAttribute('onclick'); } catch (_) { }
            localCoding.addEventListener('click', async (e) => {
                e.preventDefault(); console.debug('[toolbar] Local Coding clicked (bind)');
                if (!__isAdmin) return;
                await ensureLocalCodingLoaded();
                console.debug('[toolbar] local_coding loaded, calling toggleLocalCodingPanel');
                if (typeof window.toggleLocalCodingPanel === 'function') return window.toggleLocalCodingPanel();
                console.warn('[toolbar] toggleLocalCodingPanel not found');
            });
            localCoding.dataset.bound = '1';
        }
        // Ensure onclick attribute present for Plotter (mirrors original button)
        const plotter = document.getElementById('plotter-button');
        if (plotter && !plotter.dataset.bound) {
            plotter.setAttribute('onclick', 'togglePlotter()');
            plotter.addEventListener('click', (e) => { e.preventDefault(); if (typeof window.togglePlotter === 'function') window.togglePlotter(); });
            plotter.dataset.bound = '1';
        }

        const catalog = document.getElementById('catalog-button');
        if (catalog && !catalog.dataset.bound) {
            catalog.addEventListener('click', (e) => { e.preventDefault(); toggleCatalogDropdown(); });
            catalog.dataset.bound = '1';
        }

        const segments = document.getElementById('segments-button');
        if (segments && !segments.dataset.bound) {
            const handler = segments.__segmentsInvoke || function () {
                if (typeof window.openSegmentsFileBrowser === 'function') {
                    window.openSegmentsFileBrowser();
                }
            };
            segments.addEventListener('click', (e) => { e.preventDefault(); handler(); });
            segments.dataset.bound = '1';
        }

        const peak = document.getElementById('peak-finder-button');
        if (peak && !peak.dataset.bound) {
            peak.addEventListener('click', (e) => {
                e.preventDefault();
                if (typeof window.startPeakFinderUI === 'function') return window.startPeakFinderUI();
                if (typeof window.createPeakFinderModal === 'function') return window.createPeakFinderModal();
                if (typeof window.openPeakFinderModal === 'function') return window.openPeakFinderModal();
            });
            peak.dataset.bound = '1';
        }

        ['plotter-button', 'local-coding-button', 'zoom-in-button', 'zoom-out-button', 'reset-button', 'histogram-button', 'catalog-button', 'mouse-mode-button', 'peak-finder-button', 'settings-button', 'save-png-toolbar-btn', 'region-tools-button']
            .forEach(id => { const el = document.getElementById(id); if (el) inheritAnchorClasses(el); });
    }

    // ---------- Visibility ----------
    function updateVisibility() {
        // Only manage visibility for buttons this module owns.
        // Other modules (save.js, peak.js/opendragon.js, etc.) will manage their own show/hide.
        [
            'save-png-toolbar-btn',
            'plotter-button',
            'local-coding-button',
            'zoom-in-button',
            'zoom-out-button',
            'reset-button',
            'histogram-button',
            'catalog-button',
            'segments-button',
            'mouse-mode-button',
            'region-tools-button',
            'peak-finder-button',
            'settings-button'
        ].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            if (id === 'local-coding-button') {
                el.style.display = __isAdmin ? '' : 'none';
                if (__isAdmin) inheritAnchorClasses(el);
                return;
            }
            el.style.display = '';
            inheritAnchorClasses(el);
        });
    }

    function observeToolbar() {
        const tb = toolbar(); if (!tb || tb._tbObs) return;
        const obs = new MutationObserver(() => {
            ensureAllButtons();
            bindToolbarActions();
            reorderToolbar();   // <-- add this
            pinSaveAfterFiles();
            updateVisibility();
        });
        obs.observe(tb, { childList: true, subtree: false });
        tb._tbObs = obs;
    }

    // Some scripts historically hide toolbar buttons until an image is loaded.
    // User preference: keep all toolbar buttons visible at all times.
    function startAlwaysVisibleEnforcer() {
        try { if (window.self !== window.top) return; } catch (_) { }
        if (window.__nelouraToolbarEnforcer) return;
        window.__nelouraToolbarEnforcer = true;
        const ids = [
            'file-browser-button',
            'save-png-toolbar-btn',
            'plotter-button',
            'local-coding-button',
            'zoom-in-button',
            'zoom-out-button',
            'reset-button',
            'histogram-button',
            'catalog-button',
            'segments-button',
            'region-tools-button',
            'peak-finder-button',
            'settings-button'
        ];
        setInterval(() => {
            try {
                ids.forEach(id => {
                    const el = document.getElementById(id);
                    if (!el) return;
                    if (id === 'local-coding-button' && !__isAdmin) return;
                    if (el.style.display === 'none') el.style.display = '';
                });
            } catch (_) { }
        }, 500);
    }

    function hookViewer() {
        const attach = () => {
            if (window.tiledViewer && !window.tiledViewer._tbVH) {
                window.tiledViewer.addHandler('open', () => {
                    ensureAllButtons(); bindToolbarActions();
                    reorderToolbar();   // <-- add this
                    updateVisibility(); pinSaveAfterFiles();
                    // poll remains
                });
                window.tiledViewer.addHandler('close', () => { updateVisibility(); pinSaveAfterFiles(); });
                window.tiledViewer.addHandler('open-failed', () => { updateVisibility(); pinSaveAfterFiles(); });
                window.tiledViewer._tbVH = true;
                ensureAllButtons(); bindToolbarActions(); updateVisibility(); pinSaveAfterFiles();
                return true;
            }
            return false;
        };
        if (!attach()) {
            let tries = 0; const iv = setInterval(() => { if (attach() || ++tries >= 40) clearInterval(iv); }, 200);
        }
    }

    // ---------- Init ----------
    async function init() {
        // Do not initialize the toolbar inside pane iframes
        try { if (window.self !== window.top) return; } catch (_) { }
        await detectAdmin();
        ensureAllButtons();
        bindToolbarActions();
        reorderToolbar();      // <-- add this
        pinSaveAfterFiles();
        observeToolbar();
        startAlwaysVisibleEnforcer();
        hookViewer();
        document.addEventListener('histogram:ready', () => { updateVisibility(); pinSaveAfterFiles(); });
        window.addEventListener('resize', () => { updateVisibility(); pinSaveAfterFiles(); });
        updateVisibility();
        // Initialize multi-panel floating action button
        try { createPanelFab(); } catch (_) { }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();

// ---------------- Multi-Panel (DS9-like) Basic UI via iframes ----------------
(function () {
    const BLINK_INTERVAL_MS = 650;
    const BLINK_PAUSE_AFTER_INTERACTION_MS = 70;

    function createWcsLockFab() {
        try { if (window.self !== window.top) return; } catch (_) { }
        if (document.getElementById('multi-panel-wcs-lock')) return;
        const btn = document.createElement('button');
        btn.id = 'multi-panel-wcs-lock';
        btn.title = 'Lock WCS and synchronize zoom/pan';
        btn.className = 'mp-interactive';
        Object.assign(btn.style, {
            position: 'fixed',
            right: '125px',
            bottom: '22px',
            width: '118px',
            height: '38px',
            borderRadius: '999px',
            background: '#374151',
            color: '#fff',
            border: 'none',
            boxShadow: '0 6px 14px rgba(0,0,0,0.3)',
            cursor: 'pointer',
            zIndex: '50000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '0 14px',
            fontSize: '13px',
            fontWeight: '600',
            letterSpacing: '0.4px',
            transition: 'background 0.2s ease, opacity 0.2s ease'
        });
        const icon = document.createElement('span');
        icon.textContent = '🔒';
        Object.assign(icon.style, { fontSize: '14px', lineHeight: '1' });
        const text = document.createElement('span');
        text.textContent = 'WCS Lock';
        btn.appendChild(icon);
        btn.appendChild(text);
        btn.__lockIcon = icon;
        btn.addEventListener('mouseenter', () => {
            if (!window.__multiPanelWcsLockEnabled) btn.style.background = '#465065';
        });
        btn.addEventListener('mouseleave', () => {
            if (!window.__multiPanelWcsLockEnabled) btn.style.background = '#374151';
        });
        btn.addEventListener('click', () => {
            const want = !window.__multiPanelWcsLockEnabled;
            setWcsLockEnabled(want);
        });
        document.body.appendChild(btn);
        updateWcsLockVisibility();
    }

    function createBlinkFab() {
        try { if (window.self !== window.top) return; } catch (_) { }
        if (document.getElementById('multi-panel-blink')) return;
        const btn = document.createElement('button');
        btn.id = 'multi-panel-blink';
        btn.title = 'Blink between panes (strip layouts: 1×N or N×1)';
        btn.className = 'mp-interactive';
        Object.assign(btn.style, {
            position: 'fixed',
            // Place just left of the WCS Lock pill (which is right: 125px, width: 118px)
            right: '251px',
            bottom: '22px',
            width: '38px',
            height: '38px',
            borderRadius: '999px',
            background: '#374151',
            color: '#fff',
            border: 'none',
            boxShadow: '0 6px 14px rgba(0,0,0,0.3)',
            cursor: 'pointer',
            zIndex: '50000',
            display: 'none',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px',
            lineHeight: '1',
            transition: 'background 0.2s ease, opacity 0.2s ease, transform 0.12s ease'
        });
        btn.textContent = '👁';
        btn.addEventListener('mouseenter', () => {
            if (!window.__multiPanelBlinkEnabled) btn.style.background = '#465065';
        });
        btn.addEventListener('mouseleave', () => {
            if (!window.__multiPanelBlinkEnabled) btn.style.background = '#374151';
        });
        btn.addEventListener('click', () => {
            const want = !window.__multiPanelBlinkEnabled;
            setBlinkEnabled(want);
        });
        document.body.appendChild(btn);
        updateBlinkVisibility();
    }

    function _getBlinkEligibleStripInfo() {
        try {
            const wrap = document.getElementById('multi-panel-container');
            const grid = document.getElementById('multi-panel-grid');
            if (!wrap || wrap.style.display === 'none' || !grid) return null;
            const layoutMode = grid.dataset && grid.dataset.layout;
            if (layoutMode !== 'grid') return null;
            const rows = parseInt((grid.dataset && grid.dataset.rows) || '1', 10);
            const cols = parseInt((grid.dataset && grid.dataset.cols) || '1', 10);
            // Only enable blink for strip layouts (1×N or N×1). This matches the user intent
            // (side-by-side or top-to-bottom comparisons, including 3+ panes).
            const isStrip = (rows === 1 && cols >= 2) || (cols === 1 && rows >= 2);
            if (!isStrip) return null;
            const holders = Array.from(grid.children || []).filter(h => {
                try { return !!(h && h.querySelector && h.querySelector('iframe')); } catch (_) { return false; }
            });
            if (holders.length < 2) return null;
            return { grid, rows, cols, holders: holders.slice(0) };
        } catch (_) {
            return null;
        }
    }

    function _sameHolderList(a, b) {
        try {
            if (!a || !b) return false;
            if (a.length !== b.length) return false;
            for (let i = 0; i < a.length; i++) {
                if (a[i] !== b[i]) return false;
            }
            return true;
        } catch (_) {
            return false;
        }
    }

    function _getHolderFrameWindow(holder) {
        try {
            const f = holder && holder.querySelector ? holder.querySelector('iframe') : null;
            return f ? f.contentWindow : null;
        } catch (_) {
            return null;
        }
    }

    function _setCatalogOverlayControlsHiddenForHolder(holder, hidden) {
        try {
            const w = _getHolderFrameWindow(holder);
            const doc = w && w.document;
            if (!doc) return;
            const el = doc.getElementById('catalog-overlay-controls');
            if (!el) return;
            if (hidden) {
                try {
                    if (el.__blinkPrevDisplay == null) el.__blinkPrevDisplay = el.style.display;
                } catch (_) { }
                el.style.display = 'none';
            } else {
                const prev = (() => { try { return el.__blinkPrevDisplay; } catch (_) { return ''; } })();
                el.style.display = prev || '';
                try { delete el.__blinkPrevDisplay; } catch (_) { }
            }
        } catch (_) { }
    }

    function _setCatalogOverlayControlsHiddenForHolders(holders, hidden) {
        try {
            (holders || []).forEach(h => {
                try { _setCatalogOverlayControlsHiddenForHolder(h, hidden); } catch (_) { }
            });
        } catch (_) { }
    }

    function _setTopCatalogOverlayControlsHidden(hidden) {
        // NOTE: The catalog controls panel is rendered into the TOP document (via getTopLevelDocument()).
        // So we must hide it here.
        try {
            const panel = document.getElementById('catalog-overlay-controls');
            if (!panel) return;
            if (hidden) {
                try { if (panel.__blinkPrevDisplay == null) panel.__blinkPrevDisplay = panel.style.display; } catch (_) { }
                panel.style.display = 'none';
                panel.style.pointerEvents = 'none';
            } else {
                const prev = (() => { try { return panel.__blinkPrevDisplay; } catch (_) { return ''; } })();
                panel.style.display = prev || '';
                panel.style.pointerEvents = '';
                try { delete panel.__blinkPrevDisplay; } catch (_) { }
            }
        } catch (_) { }
    }

    function _captureViewportState(holder) {
        try {
            const w = _getHolderFrameWindow(holder);
            const v = w && (w.tiledViewer || w.viewer);
            if (!v || !v.viewport) return null;
            return {
                zoom: v.viewport.getZoom ? v.viewport.getZoom() : null,
                center: v.viewport.getCenter ? v.viewport.getCenter(true) : null,
                rotation: (v.viewport.getRotation && typeof v.viewport.getRotation === 'function') ? v.viewport.getRotation() : 0
            };
        } catch (_) {
            return null;
        }
    }

    function _restoreViewportState(holder, state) {
        try {
            if (!state) return;
            const w = _getHolderFrameWindow(holder);
            const v = w && (w.tiledViewer || w.viewer);
            if (!v || !v.viewport) return;
            try {
                if (state.rotation != null && isFinite(state.rotation) && typeof v.viewport.setRotation === 'function') {
                    v.viewport.setRotation(state.rotation);
                }
            } catch (_) { }
            try {
                if (state.zoom != null && isFinite(state.zoom) && typeof v.viewport.zoomTo === 'function') {
                    v.viewport.zoomTo(state.zoom, null, true);
                }
            } catch (_) { }
            try {
                if (state.center && typeof v.viewport.panTo === 'function') {
                    v.viewport.panTo(state.center, true);
                }
            } catch (_) { }
            try { if (typeof v.forceRedraw === 'function') v.forceRedraw(); } catch (_) { }
        } catch (_) { }
    }

    function _setBlinkTop(holders, activeIdx, opts) {
        if (!holders || holders.length < 2) return;
        const options = opts || {};
        holders.forEach((h, idx) => {
            try {
                // We do NOT change visibility/opacity/clip-path to avoid "black iframe" artifacts.
                h.style.zIndex = (idx === activeIdx) ? '30' : '20';
                // Allow interaction only with the visible (top) pane.
                h.style.pointerEvents = (idx === activeIdx) ? 'auto' : 'none';
            } catch (_) { }
        });
        // IMPORTANT: Do NOT flip the active pane on every blink tick.
        // Doing so can cause WCS/viewport sync ping-pong (especially for different WCS headers).
        if (options.setActive) {
            try {
                if (typeof setActivePanel === 'function') {
                    const topHolder = holders[activeIdx];
                    if (topHolder) setActivePanel(topHolder);
                }
            } catch (_) { }
        }
        // During blinking, hide catalog overlay controls in ALL panes.
        try {
            if (window.__multiPanelBlinkEnabled) {
                _setCatalogOverlayControlsHiddenForHolders(holders, true);
                _setTopCatalogOverlayControlsHidden(true);
            }
        } catch (_) { }
        // Nudge the visible viewer to repaint (helps avoid stale/black frames on some browsers/GPU drivers).
        try {
            const w = _getHolderFrameWindow(holders[activeIdx]);
            const v = w && (w.tiledViewer || w.viewer);
            if (v && typeof v.forceRedraw === 'function') v.forceRedraw();
        } catch (_) { }
    }

    function _applyBlinkStyles(info, activeIdx) {
        if (!info || !info.holders || info.holders.length < 2) return;
        const holders = info.holders;
        const grid = info.grid;
        // Overlay approach: remove both holders from grid flow and stack them
        // with absolute positioning. This avoids iframe black/blank artifacts
        // from opacity/display toggles and ensures z-index swaps actually show A/B.

        // Remember grid styles once so we can restore later
        try {
            if (grid && !grid.__blinkPrev) {
                grid.__blinkPrev = {
                    gridTemplateColumns: grid.style.gridTemplateColumns,
                    gridTemplateRows: grid.style.gridTemplateRows,
                    gridAutoFlow: grid.style.gridAutoFlow,
                    position: grid.style.position
                };
            }
        } catch (_) { }
        try {
            if (grid) {
                // Needed so absolutely-positioned children are contained
                grid.style.position = grid.style.position || 'relative';
            }
        } catch (_) { }

        holders.forEach((h, idx) => {
            try {
                if (!h.__blinkPrev) {
                    h.__blinkPrev = {
                        display: h.style.display,
                        position: h.style.position,
                        top: h.style.top,
                        left: h.style.left,
                        right: h.style.right,
                        bottom: h.style.bottom,
                        width: h.style.width,
                        height: h.style.height,
                        margin: h.style.margin,
                        gridColumn: h.style.gridColumn,
                        gridRow: h.style.gridRow,
                        zIndex: h.style.zIndex,
                        pointerEvents: h.style.pointerEvents,
                        opacity: h.style.opacity,
                        transition: h.style.transition
                    };
                }
                h.style.display = '';
                // Take out of grid layout and overlay
                h.style.gridColumn = '';
                h.style.gridRow = '';
                h.style.margin = '0';
                h.style.position = 'absolute';
                h.style.top = '0';
                h.style.left = '0';
                h.style.right = '0';
                h.style.bottom = '0';
                h.style.width = '100%';
                h.style.height = '100%';
                h.style.transition = '';
                // Avoid touching opacity/clip-path; just stacking order.
                h.style.opacity = '';
            } catch (_) { }
        });
        _setBlinkTop(holders, activeIdx, { setActive: false });
    }

    function _restoreBlinkStyles(infoOrHolders) {
        if (!infoOrHolders) return;
        const holders = Array.isArray(infoOrHolders) ? infoOrHolders : (infoOrHolders.holders || []);
        const grid = (!Array.isArray(infoOrHolders) && infoOrHolders.grid) ? infoOrHolders.grid : null;

        holders.forEach((h) => {
            try {
                const prev = h.__blinkPrev || null;
                if (prev) {
                    h.style.display = prev.display || '';
                    h.style.position = prev.position || '';
                    h.style.top = prev.top || '';
                    h.style.left = prev.left || '';
                    h.style.right = prev.right || '';
                    h.style.bottom = prev.bottom || '';
                    h.style.width = prev.width || '';
                    h.style.height = prev.height || '';
                    h.style.margin = prev.margin || '';
                    h.style.gridColumn = prev.gridColumn || '';
                    h.style.gridRow = prev.gridRow || '';
                    h.style.zIndex = prev.zIndex || '';
                    h.style.pointerEvents = prev.pointerEvents || '';
                    h.style.opacity = prev.opacity || '';
                    h.style.transition = prev.transition || '';
                } else {
                    h.style.display = '';
                    h.style.position = '';
                    h.style.top = '';
                    h.style.left = '';
                    h.style.right = '';
                    h.style.bottom = '';
                    h.style.width = '';
                    h.style.height = '';
                    h.style.margin = '';
                    h.style.gridColumn = '';
                    h.style.gridRow = '';
                    h.style.zIndex = '';
                    h.style.pointerEvents = '';
                    h.style.opacity = '';
                    h.style.transition = '';
                }
                delete h.__blinkPrev;
            } catch (_) { }
        });

        // Restore grid style if we touched it
        try {
            if (grid && grid.__blinkPrev) {
                grid.style.gridTemplateColumns = grid.__blinkPrev.gridTemplateColumns || '';
                grid.style.gridTemplateRows = grid.__blinkPrev.gridTemplateRows || '';
                grid.style.gridAutoFlow = grid.__blinkPrev.gridAutoFlow || '';
                grid.style.position = grid.__blinkPrev.position || '';
                delete grid.__blinkPrev;
            }
        } catch (_) { }
    }

    function setBlinkEnabled(enabled) {
        const want = !!enabled;
        const info = _getBlinkEligibleStripInfo();
        const holders = info ? info.holders : null;
        const btn = document.getElementById('multi-panel-blink');
        if (!holders) {
            // Not eligible; force-disable without error
            try { if (window.__multiPanelBlinkTimer) clearInterval(window.__multiPanelBlinkTimer); } catch (_) { }
            window.__multiPanelBlinkTimer = null;
            window.__multiPanelBlinkEnabled = false;
            window.__multiPanelBlinkIdx = 0;
            try { _restoreBlinkStyles(window.__multiPanelBlinkLastInfo || (window.__multiPanelBlinkLastHolders || [])); } catch (_) { }
            window.__multiPanelBlinkLastHolders = null;
            window.__multiPanelBlinkLastInfo = null;
            if (btn) {
                btn.dataset.enabled = '0';
                btn.style.background = '#374151';
                btn.style.transform = '';
                btn.title = 'Blink between the two panes (A/B)';
            }
            updateBlinkVisibility();
            return;
        }

        if (!want) {
            try { if (window.__multiPanelBlinkTimer) clearInterval(window.__multiPanelBlinkTimer); } catch (_) { }
            window.__multiPanelBlinkTimer = null;
            window.__multiPanelBlinkEnabled = false;
            window.__multiPanelBlinkIdx = 0;
            try { _restoreBlinkStyles(info || holders); } catch (_) { }
            // Restore viewport states after layout returns to normal (prevents "zoomed out" panel).
            try {
                const toRestore = Array.isArray(holders) ? holders : (window.__multiPanelBlinkLastHolders || []);
                const states = window.__multiPanelBlinkViewportStates || [];
                requestAnimationFrame(() => {
                    try {
                        toRestore.forEach((h, i) => {
                            const st = (h && h.__blinkViewportState) ? h.__blinkViewportState : (states[i] || null);
                            _restoreViewportState(h, st);
                            try { delete h.__blinkViewportState; } catch (_) { }
                        });
                    } catch (_) { }
                    try { window.__multiPanelBlinkViewportStates = null; } catch (_) { }
                    // Restore catalog overlay controls visibility when blinking stops.
                    try {
                        _setCatalogOverlayControlsHiddenForHolders(toRestore, false);
                        _setTopCatalogOverlayControlsHidden(false);
                    } catch (_) { }
                    // Re-activate a pane so catalog/segment overlay controls re-render.
                    // (During blinking we toggle active panes rapidly, which can leave controls hidden.)
                    try {
                        const grid = document.getElementById('multi-panel-grid');
                        const prevActive = window.__multiPanelBlinkPrevActiveHolder || null;
                        const fallback = (Array.isArray(toRestore) && toRestore[0]) ? toRestore[0] : null;
                        const target = (prevActive && grid && prevActive.parentNode === grid) ? prevActive : fallback;
                        if (target && typeof setActivePanel === 'function') {
                            // First activation now, then again after layout settles.
                            try { setActivePanel(target); } catch (_) { }
                            setTimeout(() => { try { setActivePanel(target); } catch (_) { } }, 80);
                        }
                    } catch (_) { }
                    try { window.__multiPanelBlinkPrevActiveHolder = null; } catch (_) { }
                });
            } catch (_) { }
            window.__multiPanelBlinkLastHolders = null;
            window.__multiPanelBlinkLastInfo = null;
            try { window.__multiPanelBlinkHoldUntil = 0; window.__multiPanelBlinkPointerDown = false; } catch (_) { }
            if (btn) {
                btn.dataset.enabled = '0';
                btn.style.background = '#374151';
                btn.style.transform = '';
                btn.title = 'Blink between the two panes (A/B)';
            }
            // Tell panes blinking is disabled.
            try {
                const hs = holders || [];
                hs.forEach(h => {
                    try {
                        const f = h && h.querySelector ? h.querySelector('iframe') : null;
                        const w = f && f.contentWindow;
                        if (w && typeof w.postMessage === 'function') {
                            w.postMessage({ type: 'neloura-blink-state', enabled: false }, '*');
                        }
                    } catch (_) { }
                });
            } catch (_) { }
            return;
        }

        // Enable
        window.__multiPanelBlinkEnabled = true;
        try { window.__multiPanelBlinkHoldUntil = 0; window.__multiPanelBlinkPointerDown = false; } catch (_) { }
        window.__multiPanelBlinkIdx = window.__multiPanelBlinkIdx ? 1 : 0;
        window.__multiPanelBlinkLastHolders = holders;
        window.__multiPanelBlinkLastInfo = info;
        // Remember user-selected active pane so we can restore overlay controls afterwards.
        try { window.__multiPanelBlinkPrevActiveHolder = window.__activePaneHolder || null; } catch (_) { }
        // Hide catalog overlay controls during blinking (distracting panel at bottom).
        try {
            _setCatalogOverlayControlsHiddenForHolders(holders, true);
            _setTopCatalogOverlayControlsHidden(true);
        } catch (_) { }
        // Snapshot each pane's viewport before we change layout.
        try {
            window.__multiPanelBlinkViewportStates = holders.map(h => {
                const st = _captureViewportState(h);
                try { h.__blinkViewportState = st; } catch (_) { }
                return st;
            });
        } catch (_) { window.__multiPanelBlinkViewportStates = null; }
        if (btn) {
            btn.dataset.enabled = '1';
            btn.style.background = '#F59E0B';
            btn.style.transform = 'scale(1.02)';
            btn.title = 'Blinking enabled (click to stop)';
        }
        // Apply immediately, then start timer
        try {
            // One-time sync at blink start (helps ensure same region even for different WCS/pixel scales).
            // Avoid doing this repeatedly to prevent AbortErrors / drift.
            try {
                if (window.__multiPanelWcsLockEnabled && typeof synchronizeWcsAcrossPanes === 'function') {
                    const p = synchronizeWcsAcrossPanes({ silent: true });
                    if (p && typeof p.then === 'function') p.catch(() => { });
                }
            } catch (_) { }
            _applyBlinkStyles(info, window.__multiPanelBlinkIdx);
        } catch (_) { }

        // Tell panes blinking is enabled so they can report interactions (for pausing).
        try {
            const hs = holders || [];
            hs.forEach(h => {
                try {
                    const f = h && h.querySelector ? h.querySelector('iframe') : null;
                    const w = f && f.contentWindow;
                    if (w && typeof w.postMessage === 'function') {
                        w.postMessage({ type: 'neloura-blink-state', enabled: true }, '*');
                    }
                } catch (_) { }
            });
        } catch (_) { }
        try { if (window.__multiPanelBlinkTimer) clearInterval(window.__multiPanelBlinkTimer); } catch (_) { }
        window.__multiPanelBlinkTimer = setInterval(() => {
            try {
                if (!window.__multiPanelBlinkEnabled) return;
                // If user is interacting (drag/zoom), don't swap panels.
                try {
                    if (window.__multiPanelBlinkPointerDown) return;
                    if (window.__multiPanelBlinkHoldUntil && Date.now() < window.__multiPanelBlinkHoldUntil) return;
                } catch (_) { }
                const nextInfo = _getBlinkEligibleStripInfo();
                const hs = nextInfo ? nextInfo.holders : null;
                if (!nextInfo || !hs) {
                    setBlinkEnabled(false);
                    return;
                }
                // If holders changed, restore old then rebind
                const prev = window.__multiPanelBlinkLastHolders || null;
                const changed = !prev || !_sameHolderList(prev, hs);
                if (changed) {
                    try { _restoreBlinkStyles(window.__multiPanelBlinkLastInfo || prev); } catch (_) { }
                }
                window.__multiPanelBlinkLastHolders = hs;
                window.__multiPanelBlinkLastInfo = nextInfo;
                const n = (Array.isArray(hs) && hs.length) ? hs.length : 2;
                window.__multiPanelBlinkIdx = (window.__multiPanelBlinkIdx + 1) % n;
                // Only flip stacking order; avoid reflow/resizes on every blink tick.
                _setBlinkTop(hs, window.__multiPanelBlinkIdx, { setActive: false });
            } catch (_) { }
        }, BLINK_INTERVAL_MS);
    }

    function updateBlinkVisibility() {
        const btn = document.getElementById('multi-panel-blink');
        if (!btn) return;
        const info = _getBlinkEligibleStripInfo();
        const eligible = !!(info && info.holders && info.holders.length >= 2);
        btn.style.display = eligible ? 'flex' : 'none';
        if (!eligible && window.__multiPanelBlinkEnabled) {
            try { setBlinkEnabled(false); } catch (_) { }
        }
    }

    function updateWcsLockVisibility() {
        const btn = document.getElementById('multi-panel-wcs-lock');
        if (!btn) return;
        try {
            const wrap = document.getElementById('multi-panel-container');
            const grid = document.getElementById('multi-panel-grid');
            const active = grid ? grid.querySelectorAll('iframe').length : 0;
            const enabled = wrap && wrap.style.display !== 'none' && active >= 2;
            btn.style.opacity = enabled ? '1' : '0.35';
            btn.style.pointerEvents = enabled ? 'auto' : 'none';
            btn.title = enabled
                ? (window.__multiPanelWcsLockEnabled ? 'WCS lock enabled' : 'Sync panels to active WCS/zoom')
                : 'Add another panel to enable WCS sync';
        } catch (_) {
            btn.style.opacity = '0.35';
            btn.style.pointerEvents = 'none';
            btn.title = 'Add another panel to enable WCS sync';
        }
        try { updateBlinkVisibility(); } catch (_) { }
    }

    function broadcastWcsLockState(enabled) {
        const frames = getPaneFrames();
        frames.forEach(frame => {
            try {
                const w = frame && frame.contentWindow;
                if (w && typeof w.postMessage === 'function') {
                    w.postMessage({ type: 'neloura-wcs-lock-state', enabled }, '*');
                }
            } catch (_) { }
        });
    }

    function setWcsLockEnabled(enabled, opts) {
        const target = !!enabled;
        const options = opts || {};
        const changed = window.__multiPanelWcsLockEnabled !== target;
        window.__multiPanelWcsLockEnabled = target;
        const btn = document.getElementById('multi-panel-wcs-lock');
        if (btn) {
            btn.dataset.locked = target ? '1' : '0';
            btn.style.background = target ? '#2563EB' : '#374151';
            if (btn.__lockIcon) btn.__lockIcon.textContent = target ? '🔐' : '🔒';
        }
        updateWcsLockVisibility();
        broadcastWcsLockState(target);
        if (target && (changed || options.forceSync) && !options.skipSync) {
            const syncPromise = synchronizeWcsAcrossPanes(options);
            if (syncPromise && typeof syncPromise.then === 'function') {
                syncPromise.catch(() => { });
            }
        }
    }
    // Floating + button bottom-right
    function createPanelFab() {
        // Only in top-level window, never inside iframes
        try { if (window.self !== window.top) return; } catch (_) { }
        if (document.getElementById('multi-panel-fab')) return;
        const fab = document.createElement('button');
        fab.id = 'multi-panel-fab';
        fab.title = 'Add/Arrange Panels';
        fab.className = 'mp-interactive';
        Object.assign(fab.style, {
            position: 'fixed',
            right: '18px',
            bottom: '18px',
            width: '46px',
            height: '46px',
            borderRadius: '50%',
            background: '#6D28D9',
            color: '#fff',
            border: 'none',
            boxShadow: '0 6px 16px rgba(0,0,0,0.35)',
            cursor: 'pointer',
            zIndex: '50000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '26px',
            lineHeight: '1'
        });
        fab.textContent = '+';
        fab.onmouseenter = () => { fab.style.background = '#7C3AED'; };
        fab.onmouseleave = () => { fab.style.background = '#6D28D9'; };
        fab.addEventListener('click', togglePanelManager);
        document.body.appendChild(fab);
        // Also create global close-panels button and WCS sync
        createClosePanelsFab();
        createWcsLockFab();
        createBlinkFab();
        updateWcsLockVisibility();
    }
    function createClosePanelsFab() {
        try { if (window.self !== window.top) return; } catch (_) { }
        if (document.getElementById('multi-panel-close-fab')) return;
        const btn = document.createElement('button');
        btn.id = 'multi-panel-close-fab';
        btn.title = 'Close Panels';
        btn.className = 'mp-interactive';
        Object.assign(btn.style, {
            position: 'fixed',
            right: '70px',
            bottom: '18px',
            width: '46px',
            height: '46px',
            borderRadius: '50%',
            background: '#444',
            color: '#fff',
            border: 'none',
            boxShadow: '0 6px 16px rgba(0,0,0,0.35)',
            cursor: 'pointer',
            zIndex: '50000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '24px',
            lineHeight: '1'
        });
        btn.textContent = '×';
        btn.onmouseenter = () => { btn.style.background = '#555'; };
        btn.onmouseleave = () => { btn.style.background = '#444'; };
        btn.addEventListener('click', () => {
            try {
                const grid = document.getElementById('multi-panel-grid');
                const wrap = document.getElementById('multi-panel-container');
                
                // Check if we're in tilted 2x3 layout - if so, switch to single panel
                const layoutMode = grid && grid.dataset && grid.dataset.layout;
                if (layoutMode === 'tilted-2x3') {
                    // Switch to single panel layout
                    try {
                        setLayout(1, 1);
                    } catch (_) { }
                    return;
                }
                
                const active = window.__activePaneHolder;
                if (active && grid && active.parentNode === grid) {
                    try { active.remove(); } catch (_) { }
                }
                // If no active or removal failed, do nothing (avoid closing all accidentally)
                const remain = grid ? grid.querySelectorAll('iframe').length : 0;
                if (wrap && wrap.style.display !== 'none') {
                    if (remain <= 0) {
                        clearCustomLayoutArtifacts();
                        if (wrap) wrap.style.display = 'none';
                        disableBaseViewerInteraction(false);
                        setBaseViewerImageHidden(false);
                        raiseToolbarForPanels(false);
                        setWcsLockEnabled(false, { silent: true, skipSync: true });
                        try {
                            if (window.tiledViewer && typeof window.tiledViewer.close === 'function') {
                                window.tiledViewer.close();
                            } else if (window.viewer && typeof window.viewer.close === 'function') {
                                window.viewer.close();
                            }
                        } catch (_) { }
                        try {
                            if (typeof window.removeCoordinatesDisplay === 'function') {
                                window.removeCoordinatesDisplay();
                            } else {
                                const coords = document.getElementById('osd-coordinates');
                                if (coords && coords.parentNode) coords.parentNode.removeChild(coords);
                            }
                        } catch (_) { }
                        try {
                            if (typeof window.removeCoordOverlay === 'function') {
                                window.removeCoordOverlay();
                            }
                        } catch (_) { }
                        try { if (typeof window.createWelcomeScreen === 'function') window.createWelcomeScreen(); } catch (_) { }
                        try { if (typeof window.showNotification === 'function') window.showNotification(false); } catch (_) { }
                        try { window.__activePaneHolder = null; } catch (_) { }
                        try { window.currentFitsFile = null; } catch (_) { }
                        try { window.currentHduIndex = null; } catch (_) { }
                        try { window.fitsData = null; } catch (_) { }
                    } else {
                        // Rebalance grid to remove empty space and expand remaining panels
                        try { rebalanceGridAfterRemoval(); } catch (_) { }
                        // Reassign a new active holder for convenience
                        try { window.__activePaneHolder = grid.firstElementChild || null; } catch (_) { }
                    }
                    updateWcsLockVisibility();
                } else {
                    // No multi-panel active: close the main viewer and return to welcome
                    try {
                        if (window.tiledViewer && typeof window.tiledViewer.close === 'function') {
                            window.tiledViewer.close();
                        } else if (window.viewer && typeof window.viewer.close === 'function') {
                            window.viewer.close();
                        }
                    } catch (_) { }
                    try { if (typeof window.createWelcomeScreen === 'function') window.createWelcomeScreen(); } catch (_) { }
                    try { if (typeof window.showNotification === 'function') window.showNotification(false); } catch (_) { }
                    setWcsLockEnabled(false, { silent: true, skipSync: true });
                    updateWcsLockVisibility();
                }
            } catch (_) { }
        });
        document.body.appendChild(btn);
    }
    function rebalanceGridAfterRemoval() {
        const grid = document.getElementById('multi-panel-grid');
        if (!grid) return;
        const count = grid.children ? grid.children.length : 0;
        if (count <= 0) return;
        const prevRows = parseInt(grid.dataset.rows || '1', 10);
        const prevCols = parseInt(grid.dataset.cols || '1', 10);
        let rows, cols;
        if (count === 1) {
            rows = 1; cols = 1;
        } else if (prevRows === 1 && prevCols >= 1) {
            // Horizontal strip: keep one row, adjust columns
            rows = 1; cols = count;
        } else if (prevCols === 1 && prevRows >= 1) {
            // Vertical strip: keep one column, adjust rows
            cols = 1; rows = count;
        } else {
            // General grid: compact to near-square
            rows = Math.ceil(Math.sqrt(count));
            cols = Math.ceil(count / rows);
        }
        grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
        grid.dataset.rows = String(rows);
        grid.dataset.cols = String(cols);
    }
    // expose for external callers (first IIFE init)
    try { window.createPanelFab = createPanelFab; } catch (_) { }

    function ensureMultiPanelContainer() {
        let wrap = document.getElementById('multi-panel-container');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.id = 'multi-panel-container';
            Object.assign(wrap.style, {
                position: 'fixed',
                top: '0',
                left: '0',
                right: '0',
                bottom: '0',
                zIndex: '3000',
                display: 'none',
                pointerEvents: 'none'
            });
            // Always attach to body so hiding base viewer won't hide panels
            document.body.appendChild(wrap);
            // Grid container
            const grid = document.createElement('div');
            grid.id = 'multi-panel-grid';
            Object.assign(grid.style, {
                position: 'absolute',
                top: '0',
                left: '0',
                right: '0',
                bottom: '0',
                display: 'grid',
                gridTemplateColumns: '1fr',
                gridTemplateRows: '1fr',
                gap: '0px',
                padding: '0px',
                pointerEvents: 'auto',
                background: 'transparent'
            });
            wrap.appendChild(grid);
            // Consume input events so underlying viewer doesn't receive them
            const stop = (e) => {
                try {
                    const t = e.target;
                    const interactive = t && typeof t.closest === 'function' && t.closest('.mp-interactive');
                    if (interactive) {
                        // Only activate on explicit click/touch/mouse-down, never on hover/move
                        const ty = (e && e.type) || '';
                        const isActivationEvent = ty === 'click' || ty === 'mousedown' || ty === 'pointerdown' || ty === 'touchstart';
                        if (isActivationEvent) {
                            try {
                                if (interactive.querySelector && interactive.querySelector('iframe')) {
                                    setActivePanel(interactive);
                                }
                            } catch (_) { }
                        }
                        return; // allow clicks on our controls (e.g., close button, holders)
                    }
                } catch (_) { }
                try { e.preventDefault(); } catch (_) { }
                try { e.stopPropagation(); } catch (_) { }
            };
            const events = ['wheel', 'mousewheel', 'DOMMouseScroll', 'mousedown', 'mouseup', 'click', 'dblclick', 'touchstart', 'touchmove', 'touchend', 'pointerdown', 'pointermove', 'pointerup', 'contextmenu'];
            events.forEach(ev => {
                wrap.addEventListener(ev, stop, { passive: false, capture: true });
                grid.addEventListener(ev, stop, { passive: false, capture: true });
            });
            // As an extra safety, make clicks on holders activate via bubbling too
            const tryActivateFromEvent = (e) => {
                try {
                    // First try target.closest
                    const t = e.target;
                    let holder = t && typeof t.closest === 'function' ? t.closest('.mp-interactive') : null;
                    if ((!holder || holder.parentNode !== grid) && document.elementsFromPoint) {
                        const elems = document.elementsFromPoint(e.clientX, e.clientY) || [];
                        for (const el of elems) {
                            try {
                                const h = typeof el.closest === 'function' ? el.closest('.mp-interactive') : null;
                                if (h && h.parentNode === grid) { holder = h; break; }
                            } catch (_) { }
                        }
                    }
                    if (holder && holder.parentNode === grid) setActivePanel(holder);
                } catch (_) { }
            };
            grid.addEventListener('click', tryActivateFromEvent, true);
            grid.addEventListener('touchstart', (e) => {
                try {
                    const touch = e.changedTouches && e.changedTouches[0];
                    if (touch) {
                        // Synthesize clientX/clientY for elementsFromPoint usage
                        e.clientX = touch.clientX; e.clientY = touch.clientY;
                    }
                } catch (_) { }
                tryActivateFromEvent(e);
            }, true);
            // Parent listener for activation messages from panes
            try {
                if (!window.__mpMessageHandlerInstalled) {
                    window.addEventListener('message', (e) => {
                        try {
                            if (!e || !e.data) return;
                            const type = e.data.type;
                            if (type === 'neloura-activate-pane') {
                                const g = document.getElementById('multi-panel-grid'); if (!g) return;
                                const holders = Array.from(g.children || []);
                                for (const h of holders) {
                                    try {
                                        const f = h.querySelector('iframe');
                                        if (f && f.contentWindow === e.source) {
                                            setActivePanel(h);
                                            break;
                                        }
                                    } catch (_) { }
                                }
                            } else if (type === 'neloura-sync-viewport') {
                                if (!window.__multiPanelWcsLockEnabled) return;
                                const state = e.data.state;
                                if (!state) return;
                                const frames = getPaneFrames();
                                frames.forEach(frame => {
                                    try {
                                        if (frame.contentWindow === e.source) return;
                                        const res = applyFrameWcsState(frame, state);
                                        if (res && typeof res.then === 'function') {
                                            res.catch(() => { });
                                        }
                                    } catch (_) { }
                                });
                            } else if (type === 'neloura-blink-interaction') {
                                // Pause blinking while the user is actively dragging/zooming in a pane.
                                try {
                                    if (!window.__multiPanelBlinkEnabled) return;
                                    window.__multiPanelBlinkHoldUntil = Date.now() + BLINK_PAUSE_AFTER_INTERACTION_MS;
                                    if (e.data && e.data.pointerDown === true) window.__multiPanelBlinkPointerDown = true;
                                    if (e.data && e.data.pointerUp === true) window.__multiPanelBlinkPointerDown = false;
                                } catch (_) { }
                            }
                        } catch (_) { }
                    }, true);
                    window.__mpMessageHandlerInstalled = true;
                }
            } catch (_) { }
        }
        return wrap;
    }

    function panelManagerUI() {
        let panel = document.getElementById('multi-panel-manager');
        if (panel) return panel;
        panel = document.createElement('div');
        panel.id = 'multi-panel-manager';
        panel.className = 'mp-interactive';
        Object.assign(panel.style, {
            position: 'fixed',
            right: '18px',
            bottom: '74px',
            width: '300px',
            background: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(26px) saturate(180%)',
            WebkitBackdropFilter: 'blur(26px) saturate(180%)',
            color: '#fff',
            border: '1px solid rgba(255, 255, 255, 0.18)',
            borderRadius: '16px',
            zIndex: '50001',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
            overflow: 'hidden',
            fontFamily: 'Arial, sans-serif',
            opacity: '0',
            transform: 'translateY(10px) scale(0.95)',
            pointerEvents: 'none',
            transition: 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            display: 'block'
        });
        const header = document.createElement('div');
        Object.assign(header.style, {
            padding: '10px 12px',
            background: 'rgba(255, 255, 255, 0.05)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            fontWeight: 'bold'
        });
        header.textContent = 'Panels';
        const body = document.createElement('div');
        Object.assign(body.style, { padding: '10px', display: 'grid', gap: '8px' });

        // Add panel button
        const addBtn = document.createElement('button');
        addBtn.textContent = 'Add Panel';
        Object.assign(addBtn.style, baseBtnStyle());
        addBtn.addEventListener('click', () => {
            addPanel(false);
            try { 
                const mgr = document.getElementById('multi-panel-manager'); 
                if (mgr) {
                    mgr.style.opacity = '0';
                    mgr.style.transform = 'translateY(10px) scale(0.95)';
                    mgr.style.pointerEvents = 'none';
                }
            } catch (_) { }
        });

        // Layout selector
        const layoutRow = document.createElement('div');
        layoutRow.style.display = 'grid';
        layoutRow.style.gridTemplateColumns = 'repeat(6, 1fr)';
        layoutRow.style.gap = '6px';
        const l1x2 = makeLayoutBtn(1, 2);
        const l2x1 = makeLayoutBtn(2, 1);
        const l2x2 = makeLayoutBtn(2, 2);
        const l1x1 = makeLayoutBtn(1, 1);
        const diag = makeDiagonalLayoutBtn();
        const tilted = makeTiltedGridLayoutBtn();
        layoutRow.appendChild(l1x2);
        layoutRow.appendChild(l2x1);
        layoutRow.appendChild(l2x2);
        layoutRow.appendChild(l1x1);
        layoutRow.appendChild(diag);
        layoutRow.appendChild(tilted);

        // Close manager (icon)
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.className = 'mp-interactive';
        Object.assign(closeBtn.style, {
            position: 'absolute',
            top: '8px',
            right: '8px',
            width: '26px',
            height: '26px',
            lineHeight: '26px',
            borderRadius: '50%',
            background: '#6b7280',
            color: '#fff',
            border: '1px solid #4b5563',
            cursor: 'pointer',
            zIndex: '50002',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px'
        });
        closeBtn.onmouseenter = () => { closeBtn.style.background = '#7b8190'; };
        closeBtn.onmouseleave = () => { closeBtn.style.background = '#6b7280'; };
        closeBtn.addEventListener('click', () => { 
            panel.style.opacity = '0';
            panel.style.transform = 'translateY(10px) scale(0.95)';
            panel.style.pointerEvents = 'none';
        });

        body.appendChild(addBtn);
        body.appendChild(layoutRow);
        panel.appendChild(header);
        panel.appendChild(body);
        panel.appendChild(closeBtn);
        document.body.appendChild(panel);
        return panel;
    }

    function baseBtnStyle() {
        return {
            padding: '8px 10px',
            background: '#4F46E5',
            color: '#fff',
            border: '1px solid #4338CA',
            borderRadius: '6px',
            cursor: 'pointer'
        };
    }
    function smallBtnStyle() {
        return {
            padding: '6px 6px',
            background: '#374151',
            color: '#fff',
            border: '1px solid #4b5563',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '36px'
        };
    }
    function dangerBtnStyle() {
        return {
            padding: '8px 10px',
            background: '#6b7280',
            color: '#fff',
            border: '1px solid #4b5563',
            borderRadius: '6px',
            cursor: 'pointer'
        };
    }
    function makeLayoutBtn(rows, cols) {
        const b = document.createElement('button');
        b.title = `${rows} × ${cols}`;
        Object.assign(b.style, smallBtnStyle());
        b.innerHTML = createLayoutIcon(rows, cols);
        b.addEventListener('click', () => {
            setLayout(rows, cols);
            try { 
                const mgr = document.getElementById('multi-panel-manager'); 
                if (mgr) {
                    mgr.style.opacity = '0';
                    mgr.style.transform = 'translateY(10px) scale(0.95)';
                    mgr.style.pointerEvents = 'none';
                }
            } catch (_) { }
        });
        return b;
    }

    function makeDiagonalLayoutBtn() {
        const b = document.createElement('button');
        b.title = 'Diagonal Split';
        Object.assign(b.style, smallBtnStyle());
        b.innerHTML = `
            <svg width="28" height="28" viewBox="0 0 28 28">
                <rect x="0" y="0" width="28" height="28" rx="4" ry="4" fill="#111" stroke="#444"/>
                <line x1="24" y1="4" x2="4" y2="24" stroke="#5f90ff" stroke-width="2"/>
                <polygon points="4,4 24,4 4,24" fill="rgba(95,144,255,0.2)"/>
                <polygon points="24,24 4,24 24,4" fill="rgba(95,144,255,0.05)"/>
            </svg>`;
        b.addEventListener('click', () => {
            try { applyDiagonalLayout(); } catch (_) { }
            try { 
                const mgr = document.getElementById('multi-panel-manager'); 
                if (mgr) {
                    mgr.style.opacity = '0';
                    mgr.style.transform = 'translateY(10px) scale(0.95)';
                    mgr.style.pointerEvents = 'none';
                }
            } catch (_) { }
        });
        return b;
    }


    function makeTiltedGridLayoutBtn() {
        const b = document.createElement('button');
        b.title = 'Tilted 2 × 3';
        Object.assign(b.style, smallBtnStyle());
        b.innerHTML = `
            <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
                <rect x="0" y="0" width="28" height="28" rx="4" ry="4" fill="#111" stroke="#444"/>
                <path d="M4 4 L11 4 L9 14 L4 14 Z" fill="rgba(95,144,255,0.25)" stroke="rgba(95,144,255,0.45)" stroke-width="0.3"/>
                <path d="M11 4 L19 4 L17 14 L9 14 Z" fill="rgba(95,144,255,0.18)" stroke="rgba(95,144,255,0.35)" stroke-width="0.3"/>
                <path d="M19 4 L24 4 L24 14 L17 14 Z" fill="rgba(95,144,255,0.1)" stroke="rgba(95,144,255,0.3)" stroke-width="0.3"/>
                <path d="M4 14 L9 14 L7 24 L4 24 Z" fill="rgba(95,144,255,0.18)" stroke="rgba(95,144,255,0.35)" stroke-width="0.3"/>
                <path d="M9 14 L17 14 L15 24 L7 24 Z" fill="rgba(95,144,255,0.12)" stroke="rgba(95,144,255,0.3)" stroke-width="0.3"/>
                <path d="M17 14 L24 14 L24 24 L15 24 Z" fill="rgba(95,144,255,0.08)" stroke="rgba(95,144,255,0.25)" stroke-width="0.3"/>
                <line x1="4" y1="14" x2="24" y2="14" stroke="#79a9ff" stroke-width="0.8"/>
                <line x1="11" y1="4" x2="7" y2="24" stroke="#79a9ff" stroke-width="0.8"/>
                <line x1="19" y1="4" x2="15" y2="24" stroke="#79a9ff" stroke-width="0.8"/>
            </svg>`;
        b.addEventListener('click', () => {
            try { applyTiltedGridLayout(); } catch (_) { }
            try { 
                const mgr = document.getElementById('multi-panel-manager'); 
                if (mgr) {
                    mgr.style.opacity = '0';
                    mgr.style.transform = 'translateY(10px) scale(0.95)';
                    mgr.style.pointerEvents = 'none';
                }
            } catch (_) { }
        });
        return b;
    }


    function createLayoutIcon(rows, cols) {
        const size = 28;
        const padding = 4;
        const gap = 2;
        const innerW = size - padding * 2;
        const innerH = size - padding * 2;
        const cellW = (innerW - (cols - 1) * gap) / cols;
        const cellH = (innerH - (rows - 1) * gap) / rows;
        let rects = '';
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const x = padding + c * (cellW + gap);
                const y = padding + r * (cellH + gap);
                rects += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${cellW.toFixed(1)}" height="${cellH.toFixed(1)}" rx="2" ry="2" fill="rgba(95,144,255,0.18)" stroke="rgba(95,144,255,0.55)" stroke-width="0.8"></rect>`;
            }
        }
        return `
            <svg width="28" height="28" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <rect x="0.5" y="0.5" width="${size - 1}" height="${size - 1}" rx="4" ry="4" fill="#111" stroke="#444"/>
                ${rects}
            </svg>
        `;
    }

    function togglePanelManager() {
        const mgr = panelManagerUI();
        const isVisible = mgr.style.opacity === '1' && mgr.style.pointerEvents === 'auto';
        
        if (isVisible) {
            // Hide with animation
            mgr.style.opacity = '0';
            mgr.style.transform = 'translateY(10px) scale(0.95)';
            mgr.style.pointerEvents = 'none';
        } else {
            // Show with animation
            mgr.style.opacity = '1';
            mgr.style.transform = 'translateY(0) scale(1)';
            mgr.style.pointerEvents = 'auto';
        }
        
        // Do NOT create any panels or layouts here; user must pick layout or use Add Panel
        ensureMultiPanelContainer(); // prepare container but keep hidden until a layout is chosen
    }

    function setLayout(rows, cols) {
        const wrap = ensureMultiPanelContainer();
        const grid = document.getElementById('multi-panel-grid');
        if (!grid) return;
        clearCustomLayoutArtifacts();
        grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
        grid.style.gridAutoFlow = 'row';
        try {
            grid.dataset.rows = String(rows);
            grid.dataset.cols = String(cols);
            grid.dataset.layout = 'grid';
        } catch (_) { }
        wrap.style.display = 'block';
        const want = Math.max(1, rows * cols);
        const existing = Array.from(grid.children || []).filter(h => h && h.classList && h.classList.contains('mp-interactive'));

        const normalizeHolderForGrid = (holder) => {
            if (!holder) return;
            try {
                holder.classList.remove('mp-diagonal-pane');
                holder.classList.remove('mp-tilted-pane');
            } catch (_) { }
            try {
                holder.dataset.customBorderless = '';
                delete holder.dataset.customBorderless;
            } catch (_) { }
            try {
                holder.style.clipPath = '';
                holder.style.webkitClipPath = '';
                Object.assign(holder.style, {
                    position: 'relative',
                    top: '',
                    left: '',
                    width: '100%',
                    height: '100%',
                    margin: '',
                    borderRadius: '0',
                    overflow: 'hidden',
                    zIndex: '0'
                });
            } catch (_) { }
            try {
                const frame = holder.querySelector && holder.querySelector('iframe');
                if (frame) {
                    frame.style.clipPath = '';
                    frame.style.webkitClipPath = '';
                    Object.assign(frame.style, {
                        position: 'absolute',
                        top: '0',
                        left: '0',
                        width: '100%',
                        height: '100%',
                        borderRadius: '0',
                        border: '0'
                    });
                }
            } catch (_) { }
        };

        // If we're transitioning from single-panel → multi-panel via layout selection,
        // capture the current base state and restore it into the first pane.
        const transitioningFromBase = (existing.length === 0);
        let firstHolder = existing[0] || null;
        let mirrorState = null;
        let restoreState = null;
        if (transitioningFromBase) {
            try { mirrorState = getCurrentViewerStateForMirroring && getCurrentViewerStateForMirroring(); } catch (_) { mirrorState = null; }
            restoreState = (() => {
                const s = {};
                try { s.regions = (typeof window.listDrawnRegions === 'function') ? window.listDrawnRegions() : []; } catch (_) { s.regions = []; }
                try { s.zoomInsets = (typeof window.serializeZoomInsets === 'function') ? window.serializeZoomInsets() : []; } catch (_) { s.zoomInsets = []; }
                try {
                    if (typeof window.getActiveCatalogState === 'function') s.catalog = window.getActiveCatalogState();
                    else s.catalog = { name: window.currentCatalogName || window.activeCatalog || null, styles: null };
                } catch (_) { s.catalog = { name: null, styles: null }; }

                // Preserve ALL loaded catalogs (multi-catalog overlays) for the single → multi-panel transition.
                try {
                    s.activeCatalog = (window.currentCatalogName || window.activeCatalog) ? String(window.currentCatalogName || window.activeCatalog) : null;
                    const loaded = (typeof window.getLoadedCatalogOverlays === 'function') ? window.getLoadedCatalogOverlays() : [];
                    const stylesByName = window.__catalogStylesByName || {};
                    const overridesByCatalog = window.catalogOverridesByCatalog || null;

                    const mergeOverridesIntoStyles = (name, styles) => {
                        try {
                            if (!overridesByCatalog || !name) return styles;
                            const apiName = (name || '').toString().split('/').pop().split('\\').pop();
                            const overrides = overridesByCatalog[name] || overridesByCatalog[apiName] || null;
                            if (!overrides) return styles;
                            const out = (styles && typeof styles === 'object') ? { ...styles } : {};
                            if (overrides.ra_col && !out.raColumn) out.raColumn = overrides.ra_col;
                            if (overrides.dec_col && !out.decColumn) out.decColumn = overrides.dec_col;
                            if (overrides.size_col && !out.sizeColumn) out.sizeColumn = overrides.size_col;
                            return out;
                        } catch (_) { return styles; }
                    };

                    s.catalogs = (Array.isArray(loaded) ? loaded : []).map((entry) => {
                        const key = entry && entry.key ? String(entry.key) : '';
                        if (!key) return null;
                        const apiKey = key.split('/').pop().split('\\').pop();
                        let styles = stylesByName[key] || stylesByName[apiKey] || null;
                        styles = mergeOverridesIntoStyles(key, styles);
                        return { name: key, styles, visible: entry.visible !== false };
                    }).filter(Boolean);
                } catch (_) { s.catalogs = []; s.activeCatalog = null; }
                try {
                    const meta = window.segmentOverlayMetadata || null;
                    const prefs = window.segmentOverlayPreferences || null;
                    let opacity = null;
                    try {
                        const slider = document.querySelector('input[data-role="segments-opacity-slider"], input[data-role="segment-opacity-slider"]');
                        const v = slider ? Number(slider.value) : NaN;
                        if (Number.isFinite(v)) opacity = v;
                    } catch (_) { }
                    s.segment = meta ? {
                        name: meta.segment_name || meta.segmentName || meta.name || null,
                        colorMap: (prefs && prefs.colorMap) || meta.color_map || null,
                        opacity
                    } : null;
                } catch (_) { s.segment = null; }
                try {
                    // Try to get current min/max from UI inputs first (most accurate)
                    let currentMin = null;
                    let currentMax = null;
                    try {
                        // Try to get from histogram document if available
                        const getHistogramDoc = typeof window.getHistogramDocument === 'function' ? window.getHistogramDocument : 
                                               (typeof getHistogramDocument === 'function' ? getHistogramDocument : null);
                        if (getHistogramDoc) {
                            const doc = getHistogramDoc();
                            const minInput = doc.getElementById('min-range-input');
                            const maxInput = doc.getElementById('max-range-input');
                            if (minInput && maxInput) {
                                const minVal = parseFloat(minInput.value);
                                const maxVal = parseFloat(maxInput.value);
                                if (Number.isFinite(minVal)) currentMin = minVal;
                                if (Number.isFinite(maxVal)) currentMax = maxVal;
                            }
                        }
                    } catch (_) {}
                    
                    // Fallback to window.fitsData if UI inputs not available
                    if (currentMin === null && Number.isFinite(window.fitsData?.min_value)) {
                        currentMin = window.fitsData.min_value;
                    }
                    if (currentMax === null && Number.isFinite(window.fitsData?.max_value)) {
                        currentMax = window.fitsData.max_value;
                    }
                    
                    // Get color map and scaling from UI if available, otherwise from globals
                    let currentColorMap = window.currentColorMap || null;
                    let currentScaling = window.currentScaling || null;
                    try {
                        const getHistogramDoc = typeof window.getHistogramDocument === 'function' ? window.getHistogramDocument : 
                                               (typeof getHistogramDocument === 'function' ? getHistogramDocument : null);
                        if (getHistogramDoc) {
                            const doc = getHistogramDoc();
                            const colorMapSelect = doc.getElementById('color-map-select');
                            const scalingSelect = doc.getElementById('scaling-select');
                            const invertToggle = doc.getElementById('invert-colormap-toggle');
                            if (colorMapSelect) currentColorMap = colorMapSelect.value || currentColorMap;
                            if (scalingSelect) currentScaling = scalingSelect.value || currentScaling;
                            // Note: invert state is already in window.currentColorMapInverted
                        }
                    } catch (_) {}
                    
                    s.display = {
                        min: currentMin,
                        max: currentMax,
                        colorMap: currentColorMap,
                        scaling: currentScaling,
                        invert: !!window.currentColorMapInverted
                    };
                } catch (_) { s.display = null; }
                return s;
            })();

            // Hide base floating overlays so they don't float over the grid
            try {
                const box = document.getElementById('simple-region-popup');
                if (box) box.style.display = 'none';
            } catch (_) { }
            try { if (typeof window.removeAllZoomInsets === 'function') window.removeAllZoomInsets(); } catch (_) { }
        }

        // Adjust pane count without recreating existing panes (preserves session & overlays)
        try {
            const currentCount = existing.length;
            if (currentCount < want) {
                for (let i = currentCount; i < want; i++) {
                    const sid = (i === 0 && transitioningFromBase) ? (getTopLevelSid && getTopLevelSid()) : null;
                    const opts = (i === 0 && transitioningFromBase && mirrorState && mirrorState.filepath)
                        ? { initialFilepath: mirrorState.filepath, initialHdu: mirrorState.hdu, restoreState }
                        : ((i === 0 && transitioningFromBase && restoreState) ? { restoreState } : undefined);
                    const h = addPaneWithSid(sid, opts);
                    if (!firstHolder && h) firstHolder = h;
                }
            } else if (currentCount > want) {
                // Remove extras from the end so the first pane stays intact
                for (let i = currentCount - 1; i >= want; i--) {
                    try { grid.removeChild(existing[i]); } catch (_) { }
                }
            }
        } catch (_) {
            // Fallback to generic addPanel path
            if (!grid.firstElementChild) {
                for (let i = 0; i < want; i++) addPanel(true);
            }
            firstHolder = grid.firstElementChild || null;
        }

        // Normalize holder styles for grid mode
        try {
            Array.from(grid.children || []).forEach(normalizeHolderForGrid);
        } catch (_) { }

        // While multi-panel is active, ensure base viewer isn't interacting (but keep toolbar visible)
        disableBaseViewerInteraction(true);
        setBaseViewerImageHidden(true);
        raiseToolbarForPanels(true);
        // Set first panel active by default
        try {
            if (firstHolder) setActivePanel(firstHolder);
        } catch (_) { }
        updateWcsLockVisibility();
    }

    function clearCustomLayoutArtifacts() {
        const grid = document.getElementById('multi-panel-grid');
        if (!grid) return;
        grid.classList.remove('mp-diagonal-layout');
        grid.classList.remove('mp-tilted-grid');
        try { delete grid.dataset.layout; } catch (_) { }
        Object.assign(grid.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            right: '0',
            bottom: '0'
        });
        const diag = document.getElementById('mp-diagonal-line');
        if (diag && diag.parentNode) {
            diag.parentNode.removeChild(diag);
        }
        const tiltedOverlay = document.getElementById('mp-tilted-overlay');
        if (tiltedOverlay && tiltedOverlay.parentNode) {
            tiltedOverlay.parentNode.removeChild(tiltedOverlay);
        }
        Array.from(grid.querySelectorAll('iframe')).forEach(frame => {
            try {
                frame.style.clipPath = '';
                frame.style.webkitClipPath = '';
            } catch (_) { }
        });
        Array.from(grid.children).forEach(holder => {
            try {
                holder.style.clipPath = '';
                holder.style.webkitClipPath = '';
                if (holder.__mpHighlight && holder.__mpHighlight.parentNode) {
                    holder.__mpHighlight.remove();
                }
                delete holder.__mpHighlight;
            } catch (_) { }
        });
    }

    function applyDiagonalLayout() {
        const wrap = ensureMultiPanelContainer();
        const grid = document.getElementById('multi-panel-grid');
        if (!grid) return;
        clearCustomLayoutArtifacts();
        try {
            while (grid.firstChild) grid.removeChild(grid.firstChild);
        } catch (_) { }
        Object.assign(grid.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            right: '0',
            bottom: '0',
            display: 'grid',
            gridTemplateColumns: '1fr',
            gridTemplateRows: '1fr',
            gridAutoFlow: 'row',
            gap: '0px',
            columnGap: '0px',
            rowGap: '0px',
            padding: '0px',
            margin: '0px',
            border: 'none',
            background: 'transparent'
        });
        try {
            grid.dataset.rows = '1';
            grid.dataset.cols = '1';
            grid.dataset.layout = 'diagonal';
        } catch (_) { }
        wrap.style.display = 'block';
        disableBaseViewerInteraction(true);
        setBaseViewerImageHidden(true);
        raiseToolbarForPanels(true);
        const viewerState = getCurrentViewerStateForMirroring && getCurrentViewerStateForMirroring();
        
        // Capture display settings (min/max/colorbar) to preserve them
        const restoreState = (() => {
            const s = {};
            try { s.regions = (typeof window.listDrawnRegions === 'function') ? window.listDrawnRegions() : []; } catch (_) { s.regions = []; }
            try { s.zoomInsets = (typeof window.serializeZoomInsets === 'function') ? window.serializeZoomInsets() : []; } catch (_) { s.zoomInsets = []; }
            try {
                if (typeof window.getActiveCatalogState === 'function') s.catalog = window.getActiveCatalogState();
                else s.catalog = { name: window.currentCatalogName || window.activeCatalog || null, styles: null };
            } catch (_) { s.catalog = { name: null, styles: null }; }
            try {
                const meta = window.segmentOverlayMetadata || null;
                const prefs = window.segmentOverlayPreferences || null;
                let opacity = null;
                try {
                    const slider = document.querySelector('input[data-role="segments-opacity-slider"], input[data-role="segment-opacity-slider"]');
                    const v = slider ? Number(slider.value) : NaN;
                    if (Number.isFinite(v)) opacity = v;
                } catch (_) { }
                s.segment = meta ? {
                    name: meta.segment_name || meta.segmentName || meta.name || null,
                    colorMap: (prefs && prefs.colorMap) || meta.color_map || null,
                    opacity
                } : null;
            } catch (_) { s.segment = null; }
            try {
                // Try to get current min/max from UI inputs first (most accurate)
                let currentMin = null;
                let currentMax = null;
                try {
                    const getHistogramDoc = typeof window.getHistogramDocument === 'function' ? window.getHistogramDocument : 
                                           (typeof getHistogramDocument === 'function' ? getHistogramDocument : null);
                    if (getHistogramDoc) {
                        const doc = getHistogramDoc();
                        const minInput = doc.getElementById('min-range-input');
                        const maxInput = doc.getElementById('max-range-input');
                        if (minInput && maxInput) {
                            const minVal = parseFloat(minInput.value);
                            const maxVal = parseFloat(maxInput.value);
                            if (Number.isFinite(minVal)) currentMin = minVal;
                            if (Number.isFinite(maxVal)) currentMax = maxVal;
                        }
                    }
                } catch (_) {}
                
                if (currentMin === null && Number.isFinite(window.fitsData?.min_value)) {
                    currentMin = window.fitsData.min_value;
                }
                if (currentMax === null && Number.isFinite(window.fitsData?.max_value)) {
                    currentMax = window.fitsData.max_value;
                }
                
                let currentColorMap = window.currentColorMap || null;
                let currentScaling = window.currentScaling || null;
                try {
                    const getHistogramDoc = typeof window.getHistogramDocument === 'function' ? window.getHistogramDocument : 
                                           (typeof getHistogramDocument === 'function' ? getHistogramDocument : null);
                    if (getHistogramDoc) {
                        const doc = getHistogramDoc();
                        const colorMapSelect = doc.getElementById('color-map-select');
                        const scalingSelect = doc.getElementById('scaling-select');
                        if (colorMapSelect) currentColorMap = colorMapSelect.value || currentColorMap;
                        if (scalingSelect) currentScaling = scalingSelect.value || currentScaling;
                    }
                } catch (_) {}
                
                s.display = {
                    min: currentMin,
                    max: currentMax,
                    colorMap: currentColorMap,
                    scaling: currentScaling,
                    invert: !!window.currentColorMapInverted
                };
            } catch (_) { s.display = null; }
            return s;
        })();
        
        const mirrorOpts = (viewerState && viewerState.filepath) 
            ? { initialFilepath: viewerState.filepath, initialHdu: viewerState.hdu, restoreState }
            : { restoreState };
        const holders = [];
        try {
            const sid = getTopLevelSid && getTopLevelSid();
            const first = addPaneWithSid(sid, mirrorOpts);
            if (first) holders.push(first);
        } catch (_) { }
        try {
            const second = addPaneWithSid(null);
            if (second) holders.push(second);
        } catch (_) { }
        const clipPaths = [
            'polygon(0% 0%, 100% 0%, 0% 100%)',
            'polygon(100% 0%, 100% 100%, 0% 100%)'
        ];
        holders.forEach((holder, idx) => {
            if (!holder) return;
            holder.classList.add('mp-diagonal-pane');
            holder.dataset.customBorderless = '1';
            Object.assign(holder.style, {
                position: 'absolute',
                top: '0',
                left: '0',
                width: '100%',
                height: '100%',
                zIndex: String(idx + 1),
                borderRadius: '0',
                margin: '0',
                overflow: 'hidden',
                border: 'none',
                borderColor: 'transparent',
                outline: 'none',
                outlineColor: 'transparent',
                boxShadow: 'none'
            });
            const frame = holder.querySelector && holder.querySelector('iframe');
            if (frame) {
                const clip = clipPaths[idx] || clipPaths[clipPaths.length - 1];
                holder.style.clipPath = clip;
                holder.style.webkitClipPath = clip;
                frame.style.clipPath = clip;
                frame.style.webkitClipPath = clip;
                frame.style.borderRadius = '0';
                frame.style.position = 'absolute';
                frame.style.top = '0';
                frame.style.left = '0';
                frame.style.width = '100%';
                frame.style.height = '100%';
                frame.style.border = 'none';
                frame.style.borderWidth = '0';
                frame.style.borderColor = 'transparent';
                frame.style.borderStyle = 'none';
                frame.style.outline = 'none';
                frame.style.outlineWidth = '0';
                frame.style.outlineColor = 'transparent';
                frame.style.outlineStyle = 'none';
                frame.style.boxShadow = 'none';
                frame.style.margin = '0';
                frame.style.padding = '0';
            }
            const highlight = document.createElement('div');
            highlight.className = 'mp-diagonal-highlight';
            Object.assign(highlight.style, {
                position: 'absolute',
                inset: '0',
                pointerEvents: 'none',
                zIndex: '50',
                opacity: '0',
                transition: 'opacity 0.12s ease'
            });
            const strokeColor = '#7C3AED';
            if (idx === 0) {
                highlight.innerHTML = `
                    <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
                        <polyline points="0,0 100,0" fill="none" stroke="${strokeColor}" stroke-width="0.5"/>
                        <polyline points="0,0 0,100" fill="none" stroke="${strokeColor}" stroke-width="0.5"/>
                    </svg>`;
            } else {
                highlight.innerHTML = `
                    <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
                        <polyline points="100,0 100,100" fill="none" stroke="${strokeColor}" stroke-width="0.7"/>
                        <polyline points="100,100 0,100" fill="none" stroke="${strokeColor}" stroke-width="0.7"/>
                    </svg>`;
            }
            holder.appendChild(highlight);
            holder.__mpHighlight = highlight;
        });
        grid.classList.add('mp-diagonal-layout');
        const target = holders[1] || holders[0] || null;
        if (target) {
            try { setActivePanel(target); } catch (_) { }
        }
        try {
            holders.forEach((holder, idx) => {
                if (!holder) return;
                holder.dataset.diagonalPane = idx === 0 ? 'top' : 'bottom';
            });
        } catch (_) { }
        updateWcsLockVisibility();
    }

    function applyTiltedGridLayout() {
        const wrap = ensureMultiPanelContainer();
        const grid = document.getElementById('multi-panel-grid');
        if (!grid) return;
        clearCustomLayoutArtifacts();
        try { while (grid.firstChild) grid.removeChild(grid.firstChild); } catch (_) { }
        Object.assign(grid.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            right: '0',
            bottom: '0',
            display: 'grid',
            gridTemplateColumns: '1fr',
            gridTemplateRows: '1fr',
            gridAutoFlow: 'row',
            gap: '0px',
            columnGap: '0px',
            rowGap: '0px',
            padding: '0px',
            margin: '0px',
            border: 'none',
            background: 'transparent'
        });
        try {
            grid.dataset.rows = '2';
            grid.dataset.cols = '3';
            grid.dataset.layout = 'tilted-2x3';
        } catch (_) { }
        wrap.style.display = 'block';
        disableBaseViewerInteraction(true);
        setBaseViewerImageHidden(true);
        raiseToolbarForPanels(true);
        const viewerState = getCurrentViewerStateForMirroring && getCurrentViewerStateForMirroring();
        
        // Capture display settings (min/max/colorbar) to preserve them
        const restoreState = (() => {
            const s = {};
            try { s.regions = (typeof window.listDrawnRegions === 'function') ? window.listDrawnRegions() : []; } catch (_) { s.regions = []; }
            try { s.zoomInsets = (typeof window.serializeZoomInsets === 'function') ? window.serializeZoomInsets() : []; } catch (_) { s.zoomInsets = []; }
            try {
                if (typeof window.getActiveCatalogState === 'function') s.catalog = window.getActiveCatalogState();
                else s.catalog = { name: window.currentCatalogName || window.activeCatalog || null, styles: null };
            } catch (_) { s.catalog = { name: null, styles: null }; }
            try {
                const meta = window.segmentOverlayMetadata || null;
                const prefs = window.segmentOverlayPreferences || null;
                let opacity = null;
                try {
                    const slider = document.querySelector('input[data-role="segments-opacity-slider"], input[data-role="segment-opacity-slider"]');
                    const v = slider ? Number(slider.value) : NaN;
                    if (Number.isFinite(v)) opacity = v;
                } catch (_) { }
                s.segment = meta ? {
                    name: meta.segment_name || meta.segmentName || meta.name || null,
                    colorMap: (prefs && prefs.colorMap) || meta.color_map || null,
                    opacity
                } : null;
            } catch (_) { s.segment = null; }
            try {
                // Try to get current min/max from UI inputs first (most accurate)
                let currentMin = null;
                let currentMax = null;
                try {
                    const getHistogramDoc = typeof window.getHistogramDocument === 'function' ? window.getHistogramDocument : 
                                           (typeof getHistogramDocument === 'function' ? getHistogramDocument : null);
                    if (getHistogramDoc) {
                        const doc = getHistogramDoc();
                        const minInput = doc.getElementById('min-range-input');
                        const maxInput = doc.getElementById('max-range-input');
                        if (minInput && maxInput) {
                            const minVal = parseFloat(minInput.value);
                            const maxVal = parseFloat(maxInput.value);
                            if (Number.isFinite(minVal)) currentMin = minVal;
                            if (Number.isFinite(maxVal)) currentMax = maxVal;
                        }
                    }
                } catch (_) {}
                
                if (currentMin === null && Number.isFinite(window.fitsData?.min_value)) {
                    currentMin = window.fitsData.min_value;
                }
                if (currentMax === null && Number.isFinite(window.fitsData?.max_value)) {
                    currentMax = window.fitsData.max_value;
                }
                
                let currentColorMap = window.currentColorMap || null;
                let currentScaling = window.currentScaling || null;
                try {
                    const getHistogramDoc = typeof window.getHistogramDocument === 'function' ? window.getHistogramDocument : 
                                           (typeof getHistogramDocument === 'function' ? getHistogramDocument : null);
                    if (getHistogramDoc) {
                        const doc = getHistogramDoc();
                        const colorMapSelect = doc.getElementById('color-map-select');
                        const scalingSelect = doc.getElementById('scaling-select');
                        if (colorMapSelect) currentColorMap = colorMapSelect.value || currentColorMap;
                        if (scalingSelect) currentScaling = scalingSelect.value || currentScaling;
                    }
                } catch (_) {}
                
                s.display = {
                    min: currentMin,
                    max: currentMax,
                    colorMap: currentColorMap,
                    scaling: currentScaling,
                    invert: !!window.currentColorMapInverted
                };
            } catch (_) { s.display = null; }
            return s;
        })();
        
        const mirrorOpts = (viewerState && viewerState.filepath) 
            ? { initialFilepath: viewerState.filepath, initialHdu: viewerState.hdu, restoreState }
            : { restoreState };
        const sid = getTopLevelSid && getTopLevelSid();
        const columnNames = ['left', 'mid', 'right'];
        const topXs = [0, 32, 68, 100];
        const midXs = [0, 28, 64, 100];
        const bottomXs = [0, 24, 60, 100];
        const rowDefs = [
            { name: 'top', yStart: 0, yEnd: 50, xsStart: topXs, xsEnd: midXs },
            { name: 'bottom', yStart: 50, yEnd: 100, xsStart: midXs, xsEnd: bottomXs }
        ];
        const paneConfigs = [];
        rowDefs.forEach(row => {
            columnNames.forEach((colName, idx) => {
                const pts = [
                    [row.xsStart[idx], row.yStart],
                    [row.xsStart[idx + 1], row.yStart],
                    [row.xsEnd[idx + 1], row.yEnd],
                    [row.xsEnd[idx], row.yEnd]
                ];
                paneConfigs.push({
                    label: `tilt-${row.name}-${colName}`,
                    clip: `polygon(${pts.map(([x, y]) => `${x}% ${y}%`).join(', ')})`,
                    outline: pts
                });
            });
        });
        const holders = [];
        paneConfigs.forEach((cfg, idx) => {
            const holder = addPaneWithSid(idx === 0 ? sid : null, (idx === 0 ? mirrorOpts : undefined));
            if (!holder) return;
            holders.push(holder);
            const baseZ = 10 + idx;
            holder.dataset.tiltedPane = cfg.label;
            holder.dataset.tiltedZ = String(baseZ);
            holder.dataset.customBorderless = '1';
            Object.assign(holder.style, {
                position: 'absolute',
                top: '0',
                left: '0',
                width: '100%',
                height: '100%',
                margin: '0',
                borderRadius: '0',
                overflow: 'hidden',
                zIndex: String(baseZ),
                border: 'none',
                borderColor: 'transparent',
                outline: 'none',
                outlineColor: 'transparent',
                boxShadow: 'none'
            });
            holder.style.clipPath = cfg.clip;
            holder.style.webkitClipPath = cfg.clip;
            const frame = holder.querySelector && holder.querySelector('iframe');
            if (frame) {
                frame.style.clipPath = cfg.clip;
                frame.style.webkitClipPath = cfg.clip;
                frame.style.borderRadius = '0';
                frame.style.position = 'absolute';
                frame.style.top = '0';
                frame.style.left = '0';
                frame.style.width = '100%';
                frame.style.height = '100%';
                frame.style.border = 'none';
                frame.style.borderWidth = '0';
                frame.style.borderColor = 'transparent';
                frame.style.borderStyle = 'none';
                frame.style.outline = 'none';
                frame.style.outlineWidth = '0';
                frame.style.outlineColor = 'transparent';
                frame.style.outlineStyle = 'none';
                frame.style.boxShadow = 'none';
                frame.style.margin = '0';
                frame.style.padding = '0';
            }
            const highlight = document.createElement('div');
            highlight.className = 'mp-tilted-highlight';
            Object.assign(highlight.style, {
                position: 'absolute',
                inset: '0',
                pointerEvents: 'none',
                zIndex: '60',
                opacity: '0',
                transition: 'opacity 0.12s ease'
            });
            const outlinePoints = cfg.outline.map(([x, y]) => `${x},${y}`).join(' ');
            // Tilted layout outline (keep it subtle so it doesn't feel like a thick border)
            highlight.innerHTML = `
                <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <polygon points="${outlinePoints}" fill="none" stroke="#7C3AED" stroke-width="0.35" stroke-linejoin="round" stroke-linecap="round"></polygon>
                </svg>`;
            holder.appendChild(highlight);
            holder.__mpHighlight = highlight;
        });
        grid.classList.add('mp-tilted-grid');
        // Remove the tilted overlay separators (white strokes) for the 2×3 tilted layout.
        // The panel shapes already convey the layout; the overlay lines show up as "white borders".
        const existingOverlay = document.getElementById('mp-tilted-overlay');
        if (existingOverlay && existingOverlay.parentNode) existingOverlay.parentNode.removeChild(existingOverlay);
        reindexPanels();
        if (holders[0]) {
            try { setActivePanel(holders[0]); } catch (_) { }
        }
        updateWcsLockVisibility();
    }

    function getTopLevelSid() {
        try {
            const sp = new URLSearchParams(window.location.search);
            // IMPORTANT: the app often stores the active session on window.__sid (not sessionStorage).
            // If we don't mirror the correct sid, "Add panel" creates a brand-new session and everything resets.
            return (window.__forcedSid) || (window.__sid) || sp.get('sid') || sp.get('pane_sid') || (sessionStorage.getItem('sid') || null);
        } catch (_) { try { return sessionStorage.getItem('sid'); } catch (__) { return null; } }
    }

    async function restoreOverlayStateIntoWindow(w, st) {
        if (!w || !st) return;
        // Display settings (dynamic range + colormap/scaling)
        try {
            const d = st.display || null;
            if (d && w.fitsData) {
                if (Number.isFinite(d.min)) w.fitsData.min_value = d.min;
                if (Number.isFinite(d.max)) w.fitsData.max_value = d.max;
            }
            if (d) {
                if (d.colorMap) w.currentColorMap = d.colorMap;
                if (d.scaling) w.currentScaling = d.scaling;
                w.currentColorMapInverted = !!d.invert;
                
                // Update UI inputs to reflect the restored values
                try {
                    const getHistogramDoc = typeof w.getHistogramDocument === 'function' ? w.getHistogramDocument : 
                                           (typeof getHistogramDocument === 'function' ? getHistogramDocument : null);
                    if (getHistogramDoc) {
                        const doc = getHistogramDoc();
                        const minInput = doc.getElementById('min-range-input');
                        const maxInput = doc.getElementById('max-range-input');
                        const colorMapSelect = doc.getElementById('color-map-select');
                        const scalingSelect = doc.getElementById('scaling-select');
                        const invertToggle = doc.getElementById('invert-colormap-toggle');
                        
                        if (minInput && Number.isFinite(d.min)) {
                            minInput.value = String(d.min);
                        }
                        if (maxInput && Number.isFinite(d.max)) {
                            maxInput.value = String(d.max);
                        }
                        if (colorMapSelect && d.colorMap) {
                            colorMapSelect.value = d.colorMap;
                        }
                        if (scalingSelect && d.scaling) {
                            scalingSelect.value = d.scaling;
                        }
                        if (invertToggle && typeof d.invert === 'boolean') {
                            invertToggle.checked = d.invert;
                        }
                    }
                } catch (_) {}
                
                // Best-effort apply to backend generator and refresh tiles
                if (typeof w.apiFetch === 'function' && Number.isFinite(d.min) && Number.isFinite(d.max)) {
                    const fileId = w.currentLoadedFitsFileId || w.currentLoadedFitsFileID || (w.currentTileInfo && (w.currentTileInfo.file_id || w.currentTileInfo.fileId)) || null;
                    try {
                        const response = await w.apiFetch('/update-dynamic-range/', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                min_value: d.min,
                                max_value: d.max,
                                color_map: d.colorMap || (w.currentColorMap || 'grayscale'),
                                scaling_function: d.scaling || (w.currentScaling || 'linear'),
                                invert_colormap: !!d.invert,
                                file_id: fileId || undefined
                            })
                        });
                        
                        // After updating dynamic range, refresh tiles by re-opening tile source (like applyDynamicRange does)
                        if (response && response.ok && w.tiledViewer && w.tiledViewer.isOpen && w.tiledViewer.isOpen() && w.currentTileInfo) {
                            // Update dynamic range version to bust cache
                            if (typeof w.currentDynamicRangeVersion !== 'undefined') {
                                w.currentDynamicRangeVersion = Date.now();
                            } else {
                                w.currentDynamicRangeVersion = Date.now();
                            }
                            
                            // Store current viewport
                            const currentZoom = w.tiledViewer.viewport.getZoom();
                            const currentPan = w.tiledViewer.viewport.getCenter();
                            
                            // Create new tile source with updated version
                            const newTileSourceOptions = {
                                width: w.currentTileInfo.width,
                                height: w.currentTileInfo.height,
                                tileSize: w.currentTileInfo.tileSize,
                                maxLevel: w.currentTileInfo.maxLevel,
                                getTileUrl: function(level, x, y) {
                                    const sid = (function(){
                                        try {
                                            return (w.__forcedSid) ||
                                                   (new URLSearchParams(w.location.search).get('sid')) ||
                                                   (new URLSearchParams(w.location.search).get('pane_sid')) ||
                                                   (w.sessionStorage && w.sessionStorage.getItem('sid')) ||
                                                   null;
                                        } catch(_) { 
                                            try { return w.sessionStorage.getItem('sid'); } catch(__) { return null; }
                                        }
                                    })();
                                    const sidParam = sid ? `sid=${encodeURIComponent(sid)}&` : '';
                                    const version = w.currentDynamicRangeVersion || Date.now();
                                    return `/fits-tile/${level}/${x}/${y}?${sidParam}v=${version}`;
                                },
                                getLevelScale: function(level) {
                                    return 1 / (1 << (this.maxLevel - level));
                                }
                            };
                            
                            // Re-open tile source to refresh tiles
                            w.tiledViewer.open(newTileSourceOptions);
                            
                            // Restore viewport after new tile source is opened
                            w.tiledViewer.addOnceHandler('open', function() {
                                w.tiledViewer.viewport.zoomTo(currentZoom, null, true);
                                w.tiledViewer.viewport.panTo(currentPan, true);
                                
                                // Re-apply image smoothing
                                if (w.tiledViewer.drawer) {
                                    w.tiledViewer.drawer.setImageSmoothingEnabled(false);
                                }
                            });
                        }
                    } catch (err) {
                        console.warn('[restoreOverlayState] Failed to update dynamic range:', err);
                    }
                }
            }
        } catch (_) { }
        
        // Clear pending restore state after restoration completes
        try {
            if (w.__pendingRestoreState) {
                delete w.__pendingRestoreState;
            }
        } catch (_) {}
        
        // Regions
        try {
            if (Array.isArray(st.regions) && typeof w.restoreRegionsFromSerialized === 'function') {
                w.restoreRegionsFromSerialized(st.regions);
            }
        } catch (_) { }
        // Zoom insets
        try {
            if (Array.isArray(st.zoomInsets) && typeof w.restoreZoomInsetsFromSerialized === 'function') {
                await w.restoreZoomInsetsFromSerialized(st.zoomInsets);
            }
        } catch (_) { }
        // Catalog(s)
        try {
            const many = Array.isArray(st.catalogs) ? st.catalogs.filter(Boolean) : [];
            const c = st.catalog || {};
            const singleName = (c && c.name) ? String(c.name) : '';

            const wantMany = many.length > 0;
            const wantSingle = !wantMany && !!singleName;

            if ((wantMany || wantSingle) && typeof w.loadCatalog === 'function') {
                const ensureViewerAndLoad = () => {
                    const viewer = w.viewer || w.tiledViewer;
                    if (!(viewer && viewer.viewport)) {
                        setTimeout(ensureViewerAndLoad, 120);
                        return;
                    }

                    if (wantMany) {
                        many.forEach((entry, idx) => {
                            const nm = entry && entry.name ? String(entry.name) : '';
                            if (!nm) return;
                            const styles = (entry && entry.styles) ? entry.styles : null;
                            setTimeout(() => {
                                try { w.loadCatalog(nm, styles); } catch (_) { }
                                try {
                                    if (entry.visible === false && typeof w.setCatalogOverlayVisible === 'function') {
                                        w.setCatalogOverlayVisible(nm, false);
                                    }
                                } catch (_) { }
                            }, 220 * idx);
                        });
                        // Restore active catalog selection (best-effort)
                        try {
                            const activeNm = st.activeCatalog ? String(st.activeCatalog) : '';
                            if (activeNm && typeof w.setActiveCatalogForControls === 'function') {
                                setTimeout(() => { try { w.setActiveCatalogForControls(activeNm); } catch (_) { } }, 220 * many.length);
                            }
                        } catch (_) { }
                    } else if (wantSingle) {
                        try { w.loadCatalog(singleName, (c && c.styles) ? c.styles : null); } catch (_) { }
                    }

                    // After catalogs load, ensure overlay is updated and stays synced
                    const ensureOverlayRendered = () => {
                        const viewer2 = w.viewer || w.tiledViewer;
                        if (viewer2 && viewer2.viewport && viewer2.viewport.getBounds) {
                            try {
                                if (w.catalogDataForOverlay && Array.isArray(w.catalogDataForOverlay) && w.catalogDataForOverlay.length > 0) {
                                    if (typeof w.canvasUpdateOverlay === 'function') {
                                        w.canvasUpdateOverlay();
                                        if (viewer2.viewport && !viewer2.__catalogOverlayHandler) {
                                            viewer2.viewport.addHandler('animation', () => { try { if (typeof w.canvasUpdateOverlay === 'function') w.canvasUpdateOverlay(); } catch (_) { } });
                                            viewer2.viewport.addHandler('resize', () => { try { if (typeof w.canvasUpdateOverlay === 'function') w.canvasUpdateOverlay(); } catch (_) { } });
                                            viewer2.__catalogOverlayHandler = true;
                                        }
                                    }
                                }
                            } catch (_) { }
                        } else {
                            setTimeout(ensureOverlayRendered, 120);
                        }
                    };
                    setTimeout(ensureOverlayRendered, 450);
                };
                setTimeout(ensureViewerAndLoad, 200);
            }
        } catch (_) { }
        // Segment overlay
        try {
            const seg = st.segment || null;
            if (seg && seg.name && typeof w.loadSegmentOverlay === 'function') {
                await w.loadSegmentOverlay(seg.name, { silent: true, colorMap: seg.colorMap || undefined });
                if (typeof seg.opacity === 'number' && typeof w.updateSegmentOverlayOpacity === 'function') {
                    try { w.updateSegmentOverlayOpacity(seg.opacity); } catch (_) { }
                }
            }
        } catch (_) { }
    }

    // In-pane restore handler (runs in BOTH top window and iframe panes)
    // Allows the top window to restore regions/catalogs/zoom-insets into a newly created pane.
    try {
        if (!window.__nelouraPaneRestoreHandlerInstalled) {
            window.addEventListener('message', (e) => {
                try {
                    const msg = e && e.data;
                    if (!msg || msg.type !== 'neloura-restore-pane-state') return;
                    const st = msg.state || {};

                    // Restore regions
                    try {
                        if (Array.isArray(st.regions) && typeof window.restoreRegionsFromSerialized === 'function') {
                            window.restoreRegionsFromSerialized(st.regions);
                        }
                    } catch (_) { }

                    // Restore zoom insets
                    try {
                        if (Array.isArray(st.zoomInsets) && typeof window.restoreZoomInsetsFromSerialized === 'function') {
                            const p = window.restoreZoomInsetsFromSerialized(st.zoomInsets);
                            if (p && typeof p.then === 'function') p.catch(() => { });
                        }
                    } catch (_) { }

                    // Restore catalog(s)
                    try {
                        const many = Array.isArray(st.catalogs) ? st.catalogs.filter(Boolean) : [];
                        if (many.length && typeof window.loadCatalog === 'function') {
                            many.forEach((entry, idx) => {
                                const nm = entry && entry.name ? String(entry.name) : '';
                                if (!nm) return;
                                const styles = (entry && entry.styles) ? entry.styles : null;
                                setTimeout(() => {
                                    try { window.loadCatalog(nm, styles); } catch (_) { }
                                    try {
                                        if (entry.visible === false && typeof window.setCatalogOverlayVisible === 'function') {
                                            window.setCatalogOverlayVisible(nm, false);
                                        }
                                    } catch (_) { }
                                }, 220 * idx);
                            });
                            try {
                                const activeNm = st.activeCatalog ? String(st.activeCatalog) : '';
                                if (activeNm && typeof window.setActiveCatalogForControls === 'function') {
                                    setTimeout(() => { try { window.setActiveCatalogForControls(activeNm); } catch (_) { } }, 220 * many.length);
                                }
                            } catch (_) { }
                        } else {
                            const c = st.catalog || {};
                            const name = c && c.name ? String(c.name) : '';
                            if (name && typeof window.loadCatalog === 'function') {
                                window.loadCatalog(name, (c && c.styles) ? c.styles : null);
                            }
                        }
                    } catch (_) { }
                } catch (_) { }
            }, true);
            window.__nelouraPaneRestoreHandlerInstalled = true;
        }
    } catch (_) { }

    function getPaneViewerState(holder) {
        const state = { filepath: null, hdu: null };
        if (!holder) return state;
        try {
            const frame = holder.querySelector && holder.querySelector('iframe');
            const w = frame && frame.contentWindow;
            if (!w) return state;
            state.filepath = w.currentFitsFile ||
                (w.fitsData && (w.fitsData.filepath || w.fitsData.filePath || w.fitsData.filename)) ||
                null;
            if (typeof w.currentHduIndex === 'number') {
                state.hdu = w.currentHduIndex;
            } else if (typeof w.selectedHduIndex === 'number') {
                state.hdu = w.selectedHduIndex;
            }
        } catch (_) { }
        return state;
    }
    function getBaseViewerState() {
        let filepath = null;
        let hdu = null;
        try {
            filepath = window.currentFitsFile || null;
        } catch (_) { }
        try {
            if (typeof window.currentHduIndex === 'number') hdu = window.currentHduIndex;
        } catch (_) { }
        return { filepath, hdu };
    }
    function getCurrentViewerStateForMirroring() {
        const paneState = getPaneViewerState(window.__activePaneHolder);
        if (paneState && paneState.filepath) return paneState;
        return getBaseViewerState();
    }

    function addPaneWithSid(sid, options) {
        options = options || {};
        const grid = document.getElementById('multi-panel-grid') || ensureMultiPanelContainer().querySelector('#multi-panel-grid');
        if (!grid) return null;
        const frame = document.createElement('iframe');
        (async () => {
            try {
                // If sid provided use it; otherwise create a new session
                let paneSid = sid;
                if (!paneSid) {
                    const rs = await fetch('/session/start', { credentials: 'same-origin' });
                    if (rs && rs.ok) {
                        const j = await rs.json();
                        paneSid = j && j.session_id ? j.session_id : null;
                    }
                }
                // Mark panes as multi-panel via query param so the iframe can detect this *early*
                // (before any parent->iframe window property seeding happens).
                frame.src = paneSid ? `/?pane_sid=${encodeURIComponent(paneSid)}&mp=1` : '/?mp=1';
            } catch (_) {
                frame.src = '/?mp=1';
            }
        })();
        frame.loading = 'lazy';
        frame.setAttribute('allowfullscreen', 'true');
        frame.setAttribute('frameborder', '0');
        Object.assign(frame.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            border: 'none',
            borderWidth: '0',
            borderColor: 'transparent',
            borderStyle: 'none',
            borderRadius: '0',
            outline: 'none',
            outlineWidth: '0',
            outlineColor: 'transparent',
            outlineStyle: 'none',
            boxShadow: 'none',
            margin: '0',
            padding: '0',
            background: '#111',
            zIndex: '0'
        });
        const holder = document.createElement('div');
        holder.className = 'mp-interactive';
        Object.assign(holder.style, {
            position: 'relative',
            width: '100%',
            height: '100%',
            overflow: 'hidden',
            border: 'none',
            borderColor: 'transparent',
            borderRadius: '0',
            outline: 'none',
            outlineColor: 'transparent',
            outlineOffset: '0',
            boxShadow: 'none'
        });
        holder.appendChild(frame);
        grid.appendChild(holder);
        // Add a one-time activation layer to ensure first interaction activates this pane,
        // even before the iframe has fully loaded and installed its internal listeners.
        try {
            const activator = document.createElement('div');
            activator.className = 'mp-activation-layer';
            Object.assign(activator.style, {
                position: 'absolute',
                top: '0',
                left: '0',
                right: '0',
                bottom: '0',
                background: 'transparent',
                zIndex: '2',
                cursor: 'default'
            });
            const activateOnce = (e) => {
                try { e.stopPropagation(); } catch (_) { }
                try { setActivePanel(holder); } catch (_) { }
                // Remove layer after first activation so it never blocks interactions
                try { activator.remove(); } catch (_) { }
            };
            ['pointerdown', 'mousedown', 'click', 'touchstart'].forEach(ev => {
                try { activator.addEventListener(ev, activateOnce, { capture: true, passive: true }); } catch (_) { }
            });
            holder.appendChild(activator);
        } catch (_) { }
        // Hide in-pane UI, hook activation
        try {
            const activateByClick = (e) => { try { e.stopPropagation(); } catch (_) { } try { setActivePanel(holder); } catch (_) { } };
            holder.addEventListener('click', activateByClick, { capture: false });
            const focusActivate = () => { try { setActivePanel(holder); } catch (_) { } };
            // Also listen on the iframe element itself (parent doc) for reliable activation
            try {
                frame.addEventListener('click', (e) => { try { setActivePanel(holder); } catch (_) { } }, { capture: true });
                frame.addEventListener('focus', focusActivate, { capture: true });
                // Ensure iframe can receive focus
                try { frame.setAttribute('tabindex', '-1'); } catch (_) { }
            } catch (_) { }
            frame.addEventListener('load', () => {
                try {
                    const doc = frame.contentDocument || frame.contentWindow.document;
                    hideInnerToolbars(doc);
                    try {
                        // Also forward activation via postMessage so parent can always set active
                        try {
                            const w = frame.contentWindow;
                            // Important: the iframe navigates after creation, so anything set on the old
                            // contentWindow can be lost. Re-seed catalog state after each load so
                            // restored catalogs keep correct RA/Dec columns (prevents x/y=0,0).
                            try {
                                if (w) {
                                    if (options && options.preserveCatalogs) w.__preserveCatalogs = true;
                                    if (window.catalogOverridesByCatalog) {
                                        w.catalogOverridesByCatalog = JSON.parse(JSON.stringify(window.catalogOverridesByCatalog));
                                    }
                                    if (window.__catalogStylesByName) {
                                        w.__catalogStylesByName = JSON.parse(JSON.stringify(window.__catalogStylesByName));
                                    }
                                }
                            } catch (_) { }
                            if (w && w.parent) {
                                const sendActivate = () => { try { w.parent.postMessage({ type: 'neloura-activate-pane' }, '*'); } catch (_) { } };
                                // IMPORTANT: OSD and other viewers may prevent real 'click' events from firing.
                                // Use early pointer/mouse/touch events so the parent reliably tracks the active pane.
                                ['pointerdown', 'mousedown', 'touchstart', 'click'].forEach(ev => {
                                    try { doc.addEventListener(ev, sendActivate, { capture: true, passive: true }); } catch (_) { }
                                    try { if (doc.body) doc.body.addEventListener(ev, sendActivate, { capture: true, passive: true }); } catch (_) { }
                                });
                            }
                        } catch (_) { }
                        // Continuously hide any toolbars or file browsers inside the pane
                        const rehideUi = () => {
                            try {
                                hideInnerToolbars(doc);
                                const fb = doc.getElementById('file-browser-container');
                                if (fb) fb.style.display = 'none';
                                const overlays = doc.querySelectorAll('.file-browser-overlay, .file-browser, .browser-modal');
                                overlays.forEach(el => { try { el.style.display = 'none'; } catch (_) { } });
                            } catch (_) { }
                        };
                        rehideUi();
                        try {
                            if (doc && doc.body && !doc.__mpUiObserver) {
                                const obsUi = new MutationObserver(() => { try { rehideUi(); } catch (_) { } });
                                obsUi.observe(doc.body, { childList: true, subtree: true, attributes: true });
                                doc.__mpUiObserver = obsUi;
                            }
                        } catch (_) { }
                        // In panes: keep only the instruction line; remove heading/pointer/other extras
                        const welcomeNodes = Array.from(doc.querySelectorAll('.welcome-screen, #welcome-screen'));
                        if (welcomeNodes.length) {
                            welcomeNodes.forEach(ws => {
                                try {
                                    // Remove any headings/logos
                                    ws.querySelectorAll('h1,h2,h3,img,.welcome-logo').forEach(n => { try { n.remove(); } catch (_) { } });
                                    // Replace content with single instruction line
                                    ws.innerHTML = `<p style="margin:0; text-align:center;">Please select a FITS file to open using the folder icon 📁 in the top toolbar.</p>`;
                                } catch (_) { }
                            });
                        }
                        // Remove pointer/arrow if present
                        Array.from(doc.querySelectorAll('.welcome-pointer, #welcomePointer')).forEach(el => { try { el.remove(); } catch (_) { } });
                        // Remove welcome exactly when the pane's viewer opens an image (no polling)
                        try {
                            const w = frame.contentWindow;
                            const removeWelcomeNow = () => {
                                try {
                                    const nodes = Array.from(doc.querySelectorAll('.welcome-screen, #welcome-screen, .welcome-pointer, #welcomePointer'));
                                    nodes.forEach(n => { try { n.remove(); } catch (_) { } });
                                } catch (_) { }
                            };
                            if (w) {
                                // Attach to any existing viewers
                                try { if (w.tiledViewer && typeof w.tiledViewer.addHandler === 'function') w.tiledViewer.addHandler('open', removeWelcomeNow); } catch (_) { }
                                try { if (w.viewer && typeof w.viewer.addHandler === 'function') w.viewer.addHandler('open', removeWelcomeNow); } catch (_) { }
                                // Install setters to hook future viewer creation
                                try {
                                    if (!w.__mpViewerSetterInstalled) {
                                        let __tv = w.tiledViewer;
                                        Object.defineProperty(w, 'tiledViewer', {
                                            configurable: true,
                                            get() { return __tv; },
                                            set(v) {
                                                __tv = v;
                                                try { if (v && typeof v.addHandler === 'function') v.addHandler('open', removeWelcomeNow); } catch (_) { }
                                            }
                                        });
                                        let __v = w.viewer;
                                        Object.defineProperty(w, 'viewer', {
                                            configurable: true,
                                            get() { return __v; },
                                            set(v) {
                                                __v = v;
                                                try { if (v && typeof v.addHandler === 'function') v.addHandler('open', removeWelcomeNow); } catch (_) { }
                                            }
                                        });
                                        w.__mpViewerSetterInstalled = true;
                                    }
                                } catch (_) { }
                                // Also hide immediately on explicit load action within pane
                                try {
                                    if (typeof w.loadFitsFile === 'function' && !w.__mpWrapLoadFitsFile) {
                                        const orig = w.loadFitsFile;
                                        w.loadFitsFile = function () { try { removeWelcomeNow(); } catch (_) { } return orig.apply(this, arguments); };
                                        w.__mpWrapLoadFitsFile = true;
                                    }
                                } catch (_) { }
                            }
                        } catch (_) { }
                    } catch (_) { }
                    // Also set active on window-level interactions as a fallback
                    try {
                        const w = frame.contentWindow;
                        if (w && !w.__mpActiveHooks) {
                            ['click'].forEach(ev => {
                                try { w.addEventListener(ev, () => { try { setActivePanel(holder); } catch (_) { } }, { capture: true }); } catch (_) { }
                            });
                            w.__mpActiveHooks = true;
                        }
                    } catch (_) { }
                    const w = frame.contentWindow;
                    if (w) {
                        try {
                            const fb = doc.getElementById('file-browser-container');
                            if (fb) fb.style.display = 'none';
                            const overlays = doc.querySelectorAll('.file-browser-overlay, .file-browser, .browser-modal');
                            overlays.forEach(el => { try { el.style.display = 'none'; } catch (_) { } });
                        } catch (_) { }
                        try {
                            if (!w.__forwardedFileBrowser) {
                                const parentShow = (typeof window.showFileBrowser === 'function') ? window.showFileBrowser.bind(window) : null;
                                const parentHide = (typeof window.hideFileBrowser === 'function') ? window.hideFileBrowser.bind(window) : null;
                                const parentSegments = (typeof window.openSegmentsFileBrowser === 'function') ? window.openSegmentsFileBrowser.bind(window) : null;
                                if (parentShow) w.showFileBrowser = function (cb) { try { parentShow(cb); } catch (_) { } };
                                if (parentHide) w.hideFileBrowser = function () { try { parentHide(); } catch (_) { } };
                                if (parentSegments) w.openSegmentsFileBrowser = function () { try { parentSegments(); } catch (_) { } };
                                w.__DISABLE_AUTO_FILE_BROWSER = true;
                                w.__forwardedFileBrowser = true;
                            }
                        } catch (_) { }
                    }
                    try {
                        if (doc && !doc.__mpFocusActivation) {
                            const focusActivateDoc = () => { try { setActivePanel(holder); } catch (_) { } };
                            doc.addEventListener('click', focusActivateDoc, { capture: true });
                            doc.addEventListener('focus', focusActivateDoc, true);
                            doc.addEventListener('focusin', focusActivateDoc, true);
                            if (doc.body) {
                                doc.body.addEventListener('click', focusActivateDoc, { capture: true });
                                doc.body.addEventListener('focus', focusActivateDoc, true);
                                doc.body.addEventListener('focusin', focusActivateDoc, true);
                            }
                            doc.__mpFocusActivation = true;
                        }
                    } catch (_) { }
                    try {
                        const w = frame.contentWindow;
                        if (w && !w.__mpFocusActivation) {
                            const focusActivateWin = () => { try { setActivePanel(holder); } catch (_) { } };
                            w.addEventListener('focus', focusActivateWin, true);
                            w.addEventListener('focusin', focusActivateWin, true);
                            w.__mpFocusActivation = true;
                        }
                    } catch (_) { }
                    const initialFilepath = options.initialFilepath || null;
                    const initialHdu = (typeof options.initialHdu === 'number') ? options.initialHdu : null;
                    const restoreState = options.restoreState || null;
                    const preserveCatalogs = options.preserveCatalogs || false;
                    
                    // Store restoreState on the window so initializeTiledViewer can apply display settings immediately
                    if (restoreState && frame.contentWindow) {
                        try {
                            frame.contentWindow.__pendingRestoreState = restoreState;
                            // Also copy catalogOverridesByCatalog to iframe so RA/Dec columns are available
                            if (restoreState.catalog && restoreState.catalog.name && window.catalogOverridesByCatalog) {
                                try {
                                    const catalogName = restoreState.catalog.name;
                                    const apiName = (catalogName || '').toString().split('/').pop().split('\\').pop();
                                    const overrides = window.catalogOverridesByCatalog[catalogName] || window.catalogOverridesByCatalog[apiName] || null;
                                    if (overrides && frame.contentWindow) {
                                        if (!frame.contentWindow.catalogOverridesByCatalog) {
                                            frame.contentWindow.catalogOverridesByCatalog = {};
                                        }
                                        frame.contentWindow.catalogOverridesByCatalog[catalogName] = overrides;
                                        frame.contentWindow.catalogOverridesByCatalog[apiName] = overrides;
                                    }
                                } catch (_) {}
                            }
                        } catch (_) {}
                    }
                    
                    // Store preserveCatalogs flag so initializeTiledViewer knows not to clear catalogs
                    if (preserveCatalogs && frame.contentWindow) {
                        try {
                            frame.contentWindow.__preserveCatalogs = true;
                        } catch (_) {}
                    }
                    
                    if (initialFilepath) {
                        try {
                            let attempts = 0;
                            const maxAttempts = 60;
                            const tryInitialMirror = () => {
                                attempts++;
                                try {
                                    const innerWin = frame.contentWindow;
                                    if (!innerWin) return false;
                                    if (initialHdu !== null && typeof innerWin.selectHdu === 'function') {
                                        innerWin.selectHdu(initialHdu, initialFilepath);
                                        return true;
                                    }
                                    if (typeof innerWin.loadFitsFileWithHduSelection === 'function') {
                                        innerWin.loadFitsFileWithHduSelection(initialFilepath);
                                        return true;
                                    }
                                    if (typeof innerWin.loadFitsFile === 'function') {
                                        innerWin.loadFitsFile(initialFilepath);
                                        return true;
                                    }
                                } catch (_) { }
                                return attempts >= maxAttempts;
                            };
                            if (!tryInitialMirror()) {
                                const iv = setInterval(() => {
                                    if (tryInitialMirror()) clearInterval(iv);
                                }, 250);
                            }
                        } catch (_) { }
                    }

                    // Restore overlays after the mirrored viewer is actually open (prevents later clears).
                    if (restoreState) {
                        try {
                            const innerWin = frame.contentWindow;
                            let tries = 0;
                            const maxTries = 140;
                            const tickRestore = () => {
                                tries++;
                                try {
                                    const loadedFile =
                                        innerWin.currentFitsFile ||
                                        (innerWin.fitsData && (innerWin.fitsData.filepath || innerWin.fitsData.filename)) ||
                                        null;
                                    const okFile = !initialFilepath || (loadedFile && String(loadedFile) === String(initialFilepath));
                                    // Be permissive: some panes don't expose isOpen() but still have the image loaded.
                                    const viewerOpen = !!(
                                        (innerWin.tiledViewer && typeof innerWin.tiledViewer.isOpen === 'function' && innerWin.tiledViewer.isOpen()) ||
                                        (innerWin.viewer && typeof innerWin.viewer.isOpen === 'function' && innerWin.viewer.isOpen()) ||
                                        (innerWin.currentTileInfo && innerWin.currentTileInfo.width && innerWin.currentTileInfo.height) ||
                                        (innerWin.fitsData && innerWin.fitsData.width && innerWin.fitsData.height)
                                    );
                                    const hasHelpers =
                                        (typeof innerWin.restoreRegionsFromSerialized === 'function') ||
                                        (typeof innerWin.restoreZoomInsetsFromSerialized === 'function') ||
                                        (typeof innerWin.loadCatalog === 'function') ||
                                        (typeof innerWin.loadSegmentOverlay === 'function');
                                    if (okFile && viewerOpen && hasHelpers) {
                                        // Defer slightly to let any "new-image" clears complete and viewer fully initialize
                                        // Also ensure viewer is actually ready (not just "open" but fully initialized)
                                        const viewerReady = innerWin.tiledViewer && 
                                                           (typeof innerWin.tiledViewer.isOpen === 'function' ? innerWin.tiledViewer.isOpen() : true) &&
                                                           innerWin.tiledViewer.viewport;
                                        if (viewerReady) {
                                            setTimeout(() => { restoreOverlayStateIntoWindow(innerWin, restoreState).catch(() => { }); }, 150);
                                            return true;
                                        }
                                    }
                                } catch (_) { }
                                return tries >= maxTries;
                            };
                            if (!tickRestore()) {
                                const iv2 = setInterval(() => { if (tickRestore()) clearInterval(iv2); }, 200);
                            }
                        } catch (_) { }
                    }
                } catch (_) { }
            });
            try {
                const w = frame.contentWindow;
                if (w && typeof w.postMessage === 'function') {
                    w.postMessage({ type: 'neloura-wcs-lock-state', enabled: !!window.__multiPanelWcsLockEnabled }, '*');
                }
            } catch (_) { }
        } catch (_) { }
        return holder;
    }

    function addPanel(suppressAutoExpand) {
        const grid = document.getElementById('multi-panel-grid') || ensureMultiPanelContainer().querySelector('#multi-panel-grid');
        if (!grid) return;
        const layoutMode = grid.dataset && grid.dataset.layout;
        if (layoutMode === 'diagonal' || layoutMode === 'tilted-2x3') {
            try {
                if (typeof window.showNotification === 'function') {
                    window.showNotification('This layout has a fixed number of panels. Switch to another layout to add more.', 3200, 'warning');
                }
            } catch (_) { }
            return;
        }
        let wrap = ensureMultiPanelContainer();
        // If not in multi-panel yet (wrap hidden) → initialize 1×2 with left pane using current session, right as new
        if (wrap && wrap.style.display === 'none') {
            // Capture current single-pane state so the mirrored left pane keeps your overlays
            const baseOverlayState = (() => {
                const s = {};
                try { s.regions = (typeof window.listDrawnRegions === 'function') ? window.listDrawnRegions() : []; } catch (_) { s.regions = []; }
                try { s.zoomInsets = (typeof window.serializeZoomInsets === 'function') ? window.serializeZoomInsets() : []; } catch (_) { s.zoomInsets = []; }
                try {
                    if (typeof window.getActiveCatalogState === 'function') s.catalog = window.getActiveCatalogState();
                    else s.catalog = { name: window.currentCatalogName || window.activeCatalog || null, styles: null };
                } catch (_) { s.catalog = { name: null, styles: null }; }
                try {
                    // Segment overlay state (avoid relying on main.js modifications)
                    if (typeof window.getSegmentOverlayState === 'function') {
                        s.segment = window.getSegmentOverlayState();
                    } else {
                        const meta = window.segmentOverlayMetadata || null;
                        const prefs = window.segmentOverlayPreferences || null;
                        let opacity = null;
                        try {
                            const slider = document.querySelector('input[data-role="segments-opacity-slider"], input[data-role="segment-opacity-slider"]');
                            const v = slider ? Number(slider.value) : NaN;
                            if (Number.isFinite(v)) opacity = v;
                        } catch (_) { }
                        s.segment = meta ? {
                            name: meta.segment_name || meta.segmentName || meta.name || null,
                            colorMap: (prefs && prefs.colorMap) || meta.color_map || null,
                            opacity: opacity
                        } : null;
                    }
                } catch (_) { s.segment = null; }
                try {
                    // Try to get current min/max from UI inputs first (most accurate)
                    let currentMin = null;
                    let currentMax = null;
                    try {
                        // Try to get from histogram document if available
                        const getHistogramDoc = typeof window.getHistogramDocument === 'function' ? window.getHistogramDocument : 
                                               (typeof getHistogramDocument === 'function' ? getHistogramDocument : null);
                        if (getHistogramDoc) {
                            const doc = getHistogramDoc();
                            const minInput = doc.getElementById('min-range-input');
                            const maxInput = doc.getElementById('max-range-input');
                            if (minInput && maxInput) {
                                const minVal = parseFloat(minInput.value);
                                const maxVal = parseFloat(maxInput.value);
                                if (Number.isFinite(minVal)) currentMin = minVal;
                                if (Number.isFinite(maxVal)) currentMax = maxVal;
                            }
                        }
                    } catch (_) {}
                    
                    // Fallback to window.fitsData if UI inputs not available
                    if (currentMin === null && Number.isFinite(window.fitsData?.min_value)) {
                        currentMin = window.fitsData.min_value;
                    }
                    if (currentMax === null && Number.isFinite(window.fitsData?.max_value)) {
                        currentMax = window.fitsData.max_value;
                    }
                    
                    // Get color map and scaling from UI if available, otherwise from globals
                    let currentColorMap = window.currentColorMap || null;
                    let currentScaling = window.currentScaling || null;
                    try {
                        const getHistogramDoc = typeof window.getHistogramDocument === 'function' ? window.getHistogramDocument : 
                                               (typeof getHistogramDocument === 'function' ? getHistogramDocument : null);
                        if (getHistogramDoc) {
                            const doc = getHistogramDoc();
                            const colorMapSelect = doc.getElementById('color-map-select');
                            const scalingSelect = doc.getElementById('scaling-select');
                            const invertToggle = doc.getElementById('invert-colormap-toggle');
                            if (colorMapSelect) currentColorMap = colorMapSelect.value || currentColorMap;
                            if (scalingSelect) currentScaling = scalingSelect.value || currentScaling;
                            // Note: invert state is already in window.currentColorMapInverted
                        }
                    } catch (_) {}
                    
                    s.display = {
                        min: currentMin,
                        max: currentMax,
                        colorMap: currentColorMap,
                        scaling: currentScaling,
                        invert: !!window.currentColorMapInverted
                    };
                } catch (_) { s.display = null; }
                return s;
            })();
            // IMPORTANT: once we switch into multi-panel, the base window should not keep showing
            // any region popups / zoom insets. Those will be restored inside the left iframe pane.
            try {
                const box = document.getElementById('simple-region-popup');
                if (box) box.style.display = 'none';
            } catch (_) { }
            try { if (typeof window.removeAllZoomInsets === 'function') window.removeAllZoomInsets(); } catch (_) { }
            grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
            grid.style.gridTemplateRows = 'repeat(1, 1fr)';
            grid.dataset.rows = '1';
            grid.dataset.cols = '2';
            try { grid.dataset.layout = 'grid'; } catch (_) { }
            wrap.style.display = 'block';
            disableBaseViewerInteraction(true);
            setBaseViewerImageHidden(true);
            raiseToolbarForPanels(true);
            
            // Set preserveCatalogs flag on original window BEFORE creating panels
            // This prevents catalogs from being cleared when transitioning to multi-panel
            try {
                window.__preserveCatalogs = true;
            } catch (_) {}
            
            // Left pane mirrors current session
            const sid = getTopLevelSid();
            const state = getCurrentViewerStateForMirroring && getCurrentViewerStateForMirroring();
            const leftHolder = addPaneWithSid(
                sid,
                (state && state.filepath)
                    ? { initialFilepath: state.filepath, initialHdu: state.hdu, restoreState: baseOverlayState, preserveCatalogs: true }
                    : { restoreState: baseOverlayState, preserveCatalogs: true }
            );
            // Right pane is a fresh session
            const rightHolder = addPaneWithSid(null);
            // Keep the current view active (left), so "Add panel" doesn't feel like a reset
            try { setActivePanel(leftHolder || rightHolder); } catch (_) { }
            updateWcsLockVisibility();
            return;
        }
        // If a 1×N layout, grow columns; if an M×1 layout, grow rows (only when user explicitly clicks Add Panel)
        if (!suppressAutoExpand) {
            try {
                const currentRows = parseInt(grid.dataset.rows || '1', 10);
                const currentCols = parseInt(grid.dataset.cols || '1', 10);
                let rows = isNaN(currentRows) ? 1 : currentRows;
                let cols = isNaN(currentCols) ? 1 : currentCols;
                const currentCount = (grid.children && grid.children.length) ? grid.children.length : 0;
                const newCount = currentCount + 1;
                if (cols === 2 && rows >= 2) {
                    // 2-column mode: keep 2 columns and grow rows as needed
                    cols = 2;
                    rows = Math.max(rows, Math.ceil(newCount / 2));
                } else if (rows === 1 && cols >= 1) {
                    cols += 1;
                } else if (cols === 1 && rows >= 1) {
                    rows += 1;
                } else {
                    // Default: extend columns
                    cols += 1;
                }
                grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
                grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
                grid.style.gridAutoFlow = 'row';
                grid.dataset.rows = String(rows);
                grid.dataset.cols = String(cols);
            } catch (_) { }
        }
        const frame = document.createElement('iframe');
        // Create pane-specific server session and bind it to this iframe
        (async () => {
            try {
                const rs = await fetch('/session/start', { credentials: 'same-origin' });
                let paneSid = null;
                if (rs && rs.ok) {
                    const j = await rs.json();
                    paneSid = j && j.session_id ? j.session_id : null;
                }
                // Pass sid via query so the app inside prefers it without touching shared sessionStorage
                // Mark panes as multi-panel via query param so the iframe can detect this *early*
                // (before any parent->iframe window property seeding happens).
                frame.src = paneSid ? `/?pane_sid=${encodeURIComponent(paneSid)}&mp=1` : '/?mp=1';
            } catch (_) {
                frame.src = '/?mp=1';
            }
        })();
        frame.loading = 'lazy';
        frame.setAttribute('allowfullscreen', 'true');
        frame.setAttribute('frameborder', '0');
        Object.assign(frame.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            border: 'none',
            borderWidth: '0',
            borderColor: 'transparent',
            borderStyle: 'none',
            borderRadius: '0',
            outline: 'none',
            outlineWidth: '0',
            outlineColor: 'transparent',
            outlineStyle: 'none',
            boxShadow: 'none',
            margin: '0',
            padding: '0',
            background: '#111',
            zIndex: '0'
        });
        const holder = document.createElement('div');
        holder.className = 'mp-interactive';
        Object.assign(holder.style, {
            position: 'relative',
            width: '100%',
            height: '100%',
            overflow: 'hidden',
            border: 'none',
            borderColor: 'transparent',
            borderRadius: '0',
            outline: 'none',
            outlineColor: 'transparent',
            outlineOffset: '0',
            boxShadow: 'none'
        });
        holder.appendChild(frame);
        grid.appendChild(holder);
        // Add a one-time activation layer to ensure first interaction activates this pane,
        // even before the iframe has fully loaded and installed its internal listeners.
        try {
            const activator = document.createElement('div');
            activator.className = 'mp-activation-layer';
            Object.assign(activator.style, {
                position: 'absolute',
                top: '0',
                left: '0',
                right: '0',
                bottom: '0',
                background: 'transparent',
                zIndex: '2',
                cursor: 'default'
            });
            const activateOnce = (e) => {
                try { e.stopPropagation(); } catch (_) { }
                try { setActivePanel(holder); } catch (_) { }
                // Remove layer after first activation so it never blocks interactions
                try { activator.remove(); } catch (_) { }
            };
            ['pointerdown', 'mousedown', 'click', 'touchstart'].forEach(ev => {
                try { activator.addEventListener(ev, activateOnce, { capture: true, passive: true }); } catch (_) { }
            });
            holder.appendChild(activator);
        } catch (_) { }
        // Hide the manager so it doesn't block clicks on new panels
        try { 
            const mgr = document.getElementById('multi-panel-manager'); 
            if (mgr) {
                mgr.style.opacity = '0';
                mgr.style.transform = 'translateY(10px) scale(0.95)';
                mgr.style.pointerEvents = 'none';
            }
        } catch (_) { }
        // Make container visible
        wrap = ensureMultiPanelContainer();
        wrap.style.display = 'block';
        // While multi-panel is active, prevent base viewer interaction
        disableBaseViewerInteraction(true);
        setBaseViewerImageHidden(true);
        // Hide toolbars inside this pane; set click to activate
        try {
            const activateByClick = (e) => { try { e.stopPropagation(); } catch (_) { } try { setActivePanel(holder); } catch (_) { } };
            holder.addEventListener('click', activateByClick, { capture: false });
            const focusActivate = () => { try { setActivePanel(holder); } catch (_) { } };
            // Also listen on the iframe element itself (parent doc) for reliable activation
            try {
                frame.addEventListener('click', (e) => { try { setActivePanel(holder); } catch (_) { } }, { capture: true });
                frame.addEventListener('focus', focusActivate, { capture: true });
                // Ensure iframe can receive focus
                try { frame.setAttribute('tabindex', '-1'); } catch (_) { }
            } catch (_) { }
            frame.addEventListener('load', () => {
                try {
                    const doc = frame.contentDocument || frame.contentWindow.document;
                    hideInnerToolbars(doc);
                    try {
                        // Also forward activation via postMessage so parent can always set active
                        try {
                            const w = frame.contentWindow;
                            // Important: the iframe navigates after creation, so anything set on the old
                            // contentWindow can be lost. Re-seed catalog state after each load so
                            // restored catalogs keep correct RA/Dec columns (prevents x/y=0,0).
                            try {
                                if (w) {
                                    if (options && options.preserveCatalogs) w.__preserveCatalogs = true;
                                    if (window.catalogOverridesByCatalog) {
                                        w.catalogOverridesByCatalog = JSON.parse(JSON.stringify(window.catalogOverridesByCatalog));
                                    }
                                    if (window.__catalogStylesByName) {
                                        w.__catalogStylesByName = JSON.parse(JSON.stringify(window.__catalogStylesByName));
                                    }
                                }
                            } catch (_) { }
                            if (w && w.parent) {
                                const sendActivate = () => { try { w.parent.postMessage({ type: 'neloura-activate-pane' }, '*'); } catch (_) { } };
                                // IMPORTANT: OSD and other viewers may prevent real 'click' events from firing.
                                // Use early pointer/mouse/touch events so the parent reliably tracks the active pane.
                                ['pointerdown', 'mousedown', 'touchstart', 'click'].forEach(ev => {
                                    try { doc.addEventListener(ev, sendActivate, { capture: true, passive: true }); } catch (_) { }
                                    try { if (doc.body) doc.body.addEventListener(ev, sendActivate, { capture: true, passive: true }); } catch (_) { }
                                });
                            }
                        } catch (_) { }
                        // Continuously hide any toolbars or file browsers inside the pane
                        const rehideUi = () => {
                            try {
                                hideInnerToolbars(doc);
                                const fb = doc.getElementById('file-browser-container');
                                if (fb) fb.style.display = 'none';
                                const overlays = doc.querySelectorAll('.file-browser-overlay, .file-browser, .browser-modal');
                                overlays.forEach(el => { try { el.style.display = 'none'; } catch (_) { } });
                            } catch (_) { }
                        };
                        rehideUi();
                        try {
                            if (doc && doc.body && !doc.__mpUiObserver) {
                                const obsUi = new MutationObserver(() => { try { rehideUi(); } catch (_) { } });
                                obsUi.observe(doc.body, { childList: true, subtree: true, attributes: true });
                                doc.__mpUiObserver = obsUi;
                            }
                        } catch (_) { }
                        // Sanitize welcome overlays/messages inside panes to only keep the instruction line
                        const sanitizeWelcome = () => {
                            try {
                                const nodes = Array.from(doc.querySelectorAll('.welcome-screen, #welcome-screen'));
                                nodes.forEach(ws => {
                                    try {
                                        // If already sanitized, skip
                                        if (ws.dataset && ws.dataset.mpSanitized === '1') return;
                                        // Remove headings, logos, and extra links/buttons
                                        ws.querySelectorAll('h1,h2,h3,img,.welcome-logo,a').forEach(n => { try { n.remove(); } catch (_) { } });
                                        // Replace inner with the single instruction line
                                        ws.innerHTML = `<p style="margin:0; text-align:center;">Please select a FITS file to open using the folder icon 📁 in the top toolbar.</p>`;
                                        if (ws.dataset) ws.dataset.mpSanitized = '1';
                                    } catch (_) { }
                                });
                                // Remove any standalone pointers/arrows
                                Array.from(doc.querySelectorAll('.welcome-pointer, #welcomePointer')).forEach(el => { try { el.remove(); } catch (_) { } });
                            } catch (_) { }
                        };
                        sanitizeWelcome();
                        // Observe for late renders and re-sanitize if needed
                        try {
                            if (doc && doc.body && !doc.__mpWelcomeObserver) {
                                const obs = new MutationObserver(() => { try { sanitizeWelcome(); } catch (_) { } });
                                obs.observe(doc.body, { childList: true, subtree: true });
                                doc.__mpWelcomeObserver = obs;
                            }
                        } catch (_) { }
                        // Remove welcome exactly when the pane's viewer opens an image (no polling)
                        try {
                            const w = frame.contentWindow;
                            const removeWelcomeNow = () => {
                                try {
                                    const nodes = Array.from(doc.querySelectorAll('.welcome-screen, #welcome-screen, .welcome-pointer, #welcomePointer'));
                                    nodes.forEach(n => { try { n.remove(); } catch (_) { } });
                                } catch (_) { }
                            };
                            if (w) {
                                // Attach to any existing viewers
                                try { if (w.tiledViewer && typeof w.tiledViewer.addHandler === 'function') w.tiledViewer.addHandler('open', removeWelcomeNow); } catch (_) { }
                                try { if (w.viewer && typeof w.viewer.addHandler === 'function') w.viewer.addHandler('open', removeWelcomeNow); } catch (_) { }
                                // Install setters to hook future viewer creation
                                try {
                                    if (!w.__mpViewerSetterInstalled) {
                                        let __tv = w.tiledViewer;
                                        Object.defineProperty(w, 'tiledViewer', {
                                            configurable: true,
                                            get() { return __tv; },
                                            set(v) {
                                                __tv = v;
                                                try { if (v && typeof v.addHandler === 'function') v.addHandler('open', removeWelcomeNow); } catch (_) { }
                                            }
                                        });
                                        let __v = w.viewer;
                                        Object.defineProperty(w, 'viewer', {
                                            configurable: true,
                                            get() { return __v; },
                                            set(v) {
                                                __v = v;
                                                try { if (v && typeof v.addHandler === 'function') v.addHandler('open', removeWelcomeNow); } catch (_) { }
                                            }
                                        });
                                        w.__mpViewerSetterInstalled = true;
                                    }
                                } catch (_) { }
                                // Also hide immediately on explicit load action within pane
                                try {
                                    if (typeof w.loadFitsFile === 'function' && !w.__mpWrapLoadFitsFile) {
                                        const orig = w.loadFitsFile;
                                        w.loadFitsFile = function () { try { removeWelcomeNow(); } catch (_) { } return orig.apply(this, arguments); };
                                        w.__mpWrapLoadFitsFile = true;
                                    }
                                } catch (_) { }
                            }
                        } catch (_) { }
                        // Also set active on window-level interactions as a fallback
                        try {
                            const w = frame.contentWindow;
                            if (w && !w.__mpActiveHooks) {
                                ['click'].forEach(ev => {
                                    try { w.addEventListener(ev, () => { try { setActivePanel(holder); } catch (_) { } }, { capture: true }); } catch (_) { }
                                });
                                w.__mpActiveHooks = true;
                            }
                        } catch (_) { }
                        // Prevent in-pane file browser; forward to top-level
                        const w = frame.contentWindow;
                        if (w) {
                            try {
                                const fb = doc.getElementById('file-browser-container');
                                if (fb) fb.style.display = 'none';
                                const overlays = doc.querySelectorAll('.file-browser-overlay, .file-browser, .browser-modal');
                                overlays.forEach(el => { try { el.style.display = 'none'; } catch (_) { } });
                            } catch (_) { }
                            try {
                                if (!w.__forwardedFileBrowser) {
                                    const parentShow = (typeof window.showFileBrowser === 'function') ? window.showFileBrowser.bind(window) : null;
                                    const parentHide = (typeof window.hideFileBrowser === 'function') ? window.hideFileBrowser.bind(window) : null;
                                    if (parentShow) w.showFileBrowser = function () { try { parentShow(); } catch (_) { } };
                                    if (parentHide) w.hideFileBrowser = function () { try { parentHide(); } catch (_) { } };
                                    w.__DISABLE_AUTO_FILE_BROWSER = true;
                                    w.__forwardedFileBrowser = true;
                                }
                            } catch (_) { }
                        }
                        // Activate pane on any interaction inside iframe
                        try {
                            if (doc && !doc.__mpFocusActivation) {
                                const focusActivateDoc = () => { try { setActivePanel(holder); } catch (_) { } };
                                doc.addEventListener('click', focusActivateDoc, { capture: true });
                                doc.addEventListener('focus', focusActivateDoc, true);
                                doc.addEventListener('focusin', focusActivateDoc, true);
                                if (doc.body) {
                                    doc.body.addEventListener('click', focusActivateDoc, { capture: true });
                                    doc.body.addEventListener('focus', focusActivateDoc, true);
                                    doc.body.addEventListener('focusin', focusActivateDoc, true);
                                }
                                doc.__mpFocusActivation = true;
                            }
                        } catch (_) { }
                        try {
                            const w = frame.contentWindow;
                            if (w && !w.__mpFocusActivation) {
                                const focusActivateWin = () => { try { setActivePanel(holder); } catch (_) { } };
                                w.addEventListener('focus', focusActivateWin, true);
                                w.addEventListener('focusin', focusActivateWin, true);
                                w.__mpFocusActivation = true;
                            }
                        } catch (_) { }
                    } catch (_) { }
                } catch (_) { }
            });
            try {
                const w = frame.contentWindow;
                if (w && typeof w.postMessage === 'function') {
                    w.postMessage({ type: 'neloura-wcs-lock-state', enabled: !!window.__multiPanelWcsLockEnabled }, '*');
                }
            } catch (_) { }
        } catch (_) { }
        updateWcsLockVisibility();
    }

    function panelsActiveCount() {
        const grid = document.getElementById('multi-panel-grid');
        if (!grid) return 0;
        return Array.from(grid.children).length;
    }

    function disableBaseViewerInteraction(disable) {
        try {
            // Do not disable pointer events on the whole container to keep toolbar clickable
            disableCanvasPointerEvents(disable);
        } catch (_) { }
        try { if (window.tiledViewer && typeof window.tiledViewer.setMouseNavEnabled === 'function') window.tiledViewer.setMouseNavEnabled(!disable); } catch (_) { }
        try { if (window.viewer && typeof window.viewer.setMouseNavEnabled === 'function') window.viewer.setMouseNavEnabled(!disable); } catch (_) { }
    }
    function setBaseViewerVisible(visible) {
        try {
            const base = document.getElementById('openseadragon');
            if (base) base.style.display = visible ? '' : 'none';
        } catch (_) { }
    }
    function setBaseViewerImageHidden(hidden) {
        try {
            const base = document.getElementById('openseadragon');
            if (!base) return;
            // Hide OSD rendering layers, not the toolbar
            const layers = base.querySelectorAll('.openseadragon-container, .openseadragon-canvas, canvas, .openseadragon-canvas-overlay, .openseadragon-navigator, .region-zoom-inset, #region-zoom-inset, .region-overlay-container');
            layers.forEach(el => { try { el.style.display = hidden ? 'none' : ''; } catch (_) { } });
            // Remove any background so no black shows through
            try { base.style.background = hidden ? 'transparent' : ''; } catch (_) { }
        } catch (_) { }
        // Hide the region info popup (it's positioned relative to the full window, and would float over the grid)
        try {
            const box = document.getElementById('simple-region-popup');
            if (box) box.style.display = hidden ? 'none' : '';
        } catch (_) { }
    }
    function disableCanvasPointerEvents(disable) {
        try {
            const base = document.getElementById('openseadragon');
            if (!base) return;
            const layers = base.querySelectorAll('canvas, .openseadragon-canvas, .openseadragon-container > div, .openseadragon-container, .openseadragon-canvas-overlay');
            layers.forEach(el => { try { el.style.pointerEvents = disable ? 'none' : ''; } catch (_) { } });
        } catch (_) { }
    }
    // Keep original toolbar/file browser styling; only raise z-index for visibility over panels
    function raiseToolbarForPanels(raise) {
        try {
            const tb = document.querySelector('.toolbar');
            if (tb) tb.style.zIndex = raise ? '3501' : '';
        } catch (_) { }
        try {
            const fb = document.getElementById('file-browser-container');
            if (fb) fb.style.zIndex = raise ? '3502' : '';
        } catch (_) { }
    }
    // Keep original toolbar/file browser styling; no elevation needed

    // --------------- Single-toolbar UX across panes ---------------
    function getPaneFrames() {
        const grid = document.getElementById('multi-panel-grid');
        if (!grid) return [];
        return Array.from(grid.querySelectorAll('iframe'));
    }
    function broadcastPaneActivation(activeHolder) {
        const frames = getPaneFrames();
        frames.forEach(frame => {
            try {
                const holder = frame.parentElement;
                const isActive = holder === activeHolder;
                const w = frame.contentWindow;
                if (w && typeof w.postMessage === 'function') {
                    w.postMessage({ type: 'neloura-pane-active', active: isActive }, '*');
                }
            } catch (_) { }
        });
    }
    function prepareFrameForWcs(frame) {
        try {
            const w = frame && frame.contentWindow;
            if (w && typeof w.ensureWcsData === 'function') w.ensureWcsData();
        } catch (_) { }
    }
    function getFrameWcsState(frame) {
        try {
            const w = frame && frame.contentWindow;
            if (!w) return null;
            if (typeof w.ensureWcsData === 'function') w.ensureWcsData();
            if (typeof w.getWcsSyncState === 'function') return w.getWcsSyncState();
        } catch (_) { }
        return null;
    }
    async function waitForFrameWcsState(frame, opts) {
        const timeoutMs = (opts && typeof opts.timeoutMs === 'number') ? opts.timeoutMs : 2500;
        const intervalMs = (opts && typeof opts.intervalMs === 'number') ? opts.intervalMs : 120;
        const t0 = Date.now();
        while (Date.now() - t0 < timeoutMs) {
            try {
                const w = frame && frame.contentWindow;
                if (w && typeof w.ensureWcsData === 'function') {
                    try { w.ensureWcsData(); } catch (_) { }
                }
            } catch (_) { }
            const st = getFrameWcsState(frame);
            if (st && (st.world || st.pixel)) return st;
            await new Promise(r => setTimeout(r, intervalMs));
        }
        return null;
    }
    function applyFrameWcsState(frame, state) {
        try {
            const w = frame && frame.contentWindow;
            if (!w || typeof w.applyWcsSyncState !== 'function') {
                return Promise.resolve(false);
            }
            const result = w.applyWcsSyncState(state);
            if (result && typeof result.then === 'function') {
                return result;
            }
            return Promise.resolve(!!result);
        } catch (_) {
            return Promise.resolve(false);
        }
    }
    async function synchronizeWcsAcrossPanes(options) {
        const silent = !!(options && options.silent);
        const frames = getPaneFrames();
        if (frames.length < 2) {
            if (!silent) {
                try { showNotification && showNotification('Need at least two panels for WCS sync.', 2600, 'warning'); } catch (_) { }
            }
            return;
        }
        const active = window.__activePaneHolder;
        const refFrame = active && active.querySelector ? active.querySelector('iframe') : frames[0];
        if (!refFrame) {
            if (!silent) {
                try { showNotification && showNotification('Active panel not found for WCS sync.', 2600, 'warning'); } catch (_) { }
            }
            return;
        }
        prepareFrameForWcs(refFrame);
        // The active pane may have just been activated and its viewer/WCS may not be ready yet.
        // Wait briefly instead of erroring immediately (prevents confusing "no WCS" warnings).
        const refState = await waitForFrameWcsState(refFrame, { timeoutMs: 2600, intervalMs: 140 });
        if (!refState || (!refState.world && !refState.pixel)) {
            if (!silent) {
                try { showNotification && showNotification('Active panel is still loading WCS/viewport info. Try again in a moment.', 3000, 'warning'); } catch (_) { }
            }
            return;
        }
        let synced = 0;
        const tasks = [];
        frames.forEach(frame => {
            if (frame === refFrame) return;
            prepareFrameForWcs(frame);
            const task = applyFrameWcsState(frame, refState)
                .then(success => { if (success) synced++; })
                .catch(() => { });
            tasks.push(task);
        });
        if (tasks.length) {
            try {
                await Promise.allSettled(tasks);
            } catch (_) { }
        }
        if (!silent) {
            if (synced <= 0) {
                try { showNotification && showNotification('No other panels were ready for WCS sync.', 2800, 'warning'); } catch (_) { }
            } else {
                try { showNotification && showNotification(`WCS sync applied to ${synced} panel${synced === 1 ? '' : 's'}.`, 2600, 'success'); } catch (_) { }
            }
        }
        return synced;
    }
    function hideInnerToolbars(doc) {
        if (!doc) return;
        try {
            const candidates = Array.from(doc.querySelectorAll('.toolbar, #toolbar, [data-toolbar], .viewer-toolbar, .osd-toolbar, #file-browser-container, .file-browser-overlay'));
            candidates.forEach(el => { try { el.style.display = 'none'; } catch (_) { } });
        } catch (_) { }
    }
    function showInnerToolbar(doc, show) {
        if (!doc) return;
        try {
            const candidates = Array.from(doc.querySelectorAll('.toolbar, #toolbar, [data-toolbar], .viewer-toolbar, .osd-toolbar, #file-browser-container, .file-browser-overlay'));
            candidates.forEach(el => { try { el.style.display = show ? '' : 'none'; } catch (_) { } });
        } catch (_) { }
    }
    function reindexPanels() {
        try {
            const grid = document.getElementById('multi-panel-grid'); if (!grid) return;
            Array.from(grid.children).forEach((h, idx) => {
                try {
                    const badge = h.querySelector && h.querySelector('div');
                    if (badge && badge.textContent && badge.style && badge.title) {
                        // First div in holder is close; badge is second appended; find via class:
                    }
                } catch (_) { }
                try {
                    const b = h.querySelector('.mp-interactive') && Array.from(h.children).find(n => n !== h.querySelector('.mp-interactive') && n.textContent && n.title === 'Select this panel');
                } catch (_) { }
                try {
                    const all = h.querySelectorAll('.mp-interactive');
                    for (const el of all) {
                        if (el.title === 'Select this panel') { el.textContent = String(idx + 1); break; }
                    }
                } catch (_) { }
            });
        } catch (_) { }
    }
    function setActivePanel(holder) {
        try {
            const grid = document.getElementById('multi-panel-grid'); if (!grid) return;
            const layoutMode = grid.dataset && grid.dataset.layout;
            const isDiagonal = layoutMode === 'diagonal';
            const isTilted = layoutMode === 'tilted-2x3';
            Array.from(grid.children).forEach(h => {
                try {
                    h.style.border = 'none';
                    h.style.borderColor = 'transparent';
                    // For grid layouts, set outline to transparent (will be set to purple when active)
                    // For diagonal/tilted layouts, always keep outline transparent
                    if (isDiagonal || isTilted) {
                        h.style.outline = 'none';
                        h.style.outlineColor = 'transparent';
                        h.style.boxShadow = 'none';
                    } else {
                        // We use an internal overlay border for the active panel (so all 4 sides show),
                        // and keep outline off to avoid shared-edge clipping issues.
                        h.style.outline = 'none';
                        h.style.outlineColor = 'transparent';
                        // In grid layouts, make sure neighbors don't cover the active outline
                        h.style.zIndex = '0';
                        h.style.boxShadow = 'none';
                        // Hide per-panel grid highlight if present
                        try { if (h.__mpGridHighlight) h.__mpGridHighlight.style.opacity = '0'; } catch (_) { }
                    }
                    h.classList.remove('mp-active-pane');
                    if (isDiagonal) {
                        const paneLabel = h.dataset ? h.dataset.diagonalPane : null;
                        h.style.zIndex = paneLabel === 'bottom' ? '1' : '2';
                        h.style.boxShadow = 'none';
                        if (h.__mpHighlight) h.__mpHighlight.style.opacity = '0';
                        // Ensure no borders in diagonal layout
                        h.style.border = 'none';
                        h.style.borderColor = 'transparent';
                        h.style.outline = 'none';
                        h.style.outlineColor = 'transparent';
                        // Also remove borders from iframe
                        try {
                            const f = h.querySelector && h.querySelector('iframe');
                            if (f) {
                                f.style.border = 'none';
                                f.style.borderWidth = '0';
                                f.style.borderColor = 'transparent';
                                f.style.borderStyle = 'none';
                                f.style.outline = 'none';
                                f.style.outlineWidth = '0';
                                f.style.outlineColor = 'transparent';
                                f.style.outlineStyle = 'none';
                                f.style.boxShadow = 'none';
                                f.style.margin = '0';
                                f.style.padding = '0';
                            }
                        } catch (_) {}
                    }
                    if (isTilted) {
                        const baseZ = h.dataset && h.dataset.tiltedZ ? parseInt(h.dataset.tiltedZ, 10) : 1;
                        h.style.zIndex = String(baseZ);
                        if (h.__mpHighlight) h.__mpHighlight.style.opacity = '0';
                        // Ensure no borders in tilted layout
                        h.style.border = 'none';
                        h.style.borderColor = 'transparent';
                        h.style.outline = 'none';
                        h.style.outlineColor = 'transparent';
                        h.style.boxShadow = 'none';
                    }
                } catch (_) { }
                try {
                    const f = h.querySelector('iframe');
                    const doc = f && (f.contentDocument || f.contentWindow.document);
                    // Hide all inner toolbars; we will keep them all hidden by default (single-toolbar mode)
                    showInnerToolbar(doc, false);
                } catch (_) { }
            });
            const skipBorder = holder.dataset && holder.dataset.customBorderless === '1';
            holder.style.border = 'none';
            holder.style.borderColor = 'transparent';
            // For grid layouts (not diagonal/tilted), show purple outline when active
            if (!skipBorder && !isDiagonal && !isTilted) {
                // Bring active panel above its neighbors so outline isn't hidden
                holder.style.zIndex = '5';
                // Internal highlight border so all 4 sides are always visible
                try {
                    if (!holder.__mpGridHighlight) {
                        const hl = document.createElement('div');
                        hl.className = 'mp-grid-highlight';
                        Object.assign(hl.style, {
                            position: 'absolute',
                            inset: '0',
                            pointerEvents: 'none',
                            boxSizing: 'border-box',
                            border: '2px solid #7C3AED',
                            borderRadius: '0',
                            zIndex: '10',
                            opacity: '0',
                            transition: 'opacity 0.12s ease'
                        });
                        holder.appendChild(hl);
                        holder.__mpGridHighlight = hl;
                    }
                    holder.__mpGridHighlight.style.opacity = '1';
                } catch (_) { }
            } else {
                // For diagonal/tilted layouts, never show borders/outlines
                holder.style.outline = 'none';
                holder.style.outlineColor = 'transparent';
            }
            if (isDiagonal) {
                holder.style.zIndex = '5';
                if (holder.__mpHighlight) holder.__mpHighlight.style.opacity = '1';
                // Ensure no borders in diagonal layout
                holder.style.border = 'none';
                holder.style.borderColor = 'transparent';
                holder.style.outline = 'none';
                holder.style.outlineColor = 'transparent';
                holder.style.boxShadow = 'none';
                // Also remove borders from iframe
                try {
                    const f = holder.querySelector && holder.querySelector('iframe');
                    if (f) {
                        f.style.border = 'none';
                        f.style.borderWidth = '0';
                        f.style.borderColor = 'transparent';
                        f.style.borderStyle = 'none';
                        f.style.outline = 'none';
                        f.style.outlineWidth = '0';
                        f.style.outlineColor = 'transparent';
                        f.style.outlineStyle = 'none';
                        f.style.boxShadow = 'none';
                        f.style.margin = '0';
                        f.style.padding = '0';
                    }
                } catch (_) {}
            }
            if (isTilted) {
                holder.style.zIndex = '25';
                if (holder.__mpHighlight) holder.__mpHighlight.style.opacity = '1';
                // Ensure no borders in tilted layout
                holder.style.border = 'none';
                holder.style.borderColor = 'transparent';
                holder.style.outline = 'none';
                holder.style.outlineColor = 'transparent';
                holder.style.boxShadow = 'none';
                // Also remove borders from iframe
                try {
                    const f = holder.querySelector && holder.querySelector('iframe');
                    if (f) {
                        f.style.border = 'none';
                        f.style.borderWidth = '0';
                        f.style.borderColor = 'transparent';
                        f.style.borderStyle = 'none';
                        f.style.outline = 'none';
                        f.style.outlineWidth = '0';
                        f.style.outlineColor = 'transparent';
                        f.style.outlineStyle = 'none';
                        f.style.boxShadow = 'none';
                        f.style.margin = '0';
                        f.style.padding = '0';
                    }
                } catch (_) {}
            }
            // Mark active and store globally
            try { window.__activePaneHolder = holder; } catch (_) { }
            try { broadcastPaneActivation(holder); } catch (_) { }
            // Notify top-level listeners (e.g. Plotter) that the active pane changed.
            try {
                const sid = (typeof window.getActivePaneSid === 'function') ? window.getActivePaneSid() : null;
                window.dispatchEvent(new CustomEvent('pane:activated', { detail: { sid } }));
            } catch (_) { }
            try {
                const activeFrame = holder.querySelector && holder.querySelector('iframe');
                const w = activeFrame && activeFrame.contentWindow;
                if (w && typeof w.refreshHistogramOnPaneActivate === 'function') {
                    w.refreshHistogramOnPaneActivate();
                }
            } catch (_) { }
            reindexPanels();
        } catch (_) { }
    }
    try {
        // Expose helpers for other modules to route actions to active pane
        window.getActivePaneWindow = function () {
            try {
                const h = window.__activePaneHolder;
                const f = h && h.querySelector && h.querySelector('iframe');
                return f ? f.contentWindow : null;
            } catch (_) { return null; }
        };
        window.getActivePaneSid = function () {
            try {
                const h = window.__activePaneHolder;
                const f = h && h.querySelector && h.querySelector('iframe');
                if (!f) return null;
                const url = new URL(f.src, window.location.origin);
                return url.searchParams.get('pane_sid') || url.searchParams.get('sid') || null;
            } catch (_) { return null; }
        };
        // Forward file open calls to active pane when multi-panel is active
        const installForwarders = () => {
            try {
                if (typeof window.loadFitsFile === 'function') {
                    if (!window.__origLoadFitsFile) {
                        window.__origLoadFitsFile = window.loadFitsFile;
                        window.loadFitsFile = function (filepath) {
                            const w = window.getActivePaneWindow && window.getActivePaneWindow();
                            if (w && typeof w.loadFitsFile === 'function') return w.loadFitsFile(filepath);
                            return window.__origLoadFitsFile(filepath);
                        };
                    }
                    if (window.__forwarderIv) { clearInterval(window.__forwarderIv); window.__forwarderIv = null; }
                } else {
                    // Retry until files.js is loaded and loadFitsFile appears
                    if (!window.__forwarderIv) {
                        let tries = 0;
                        window.__forwarderIv = setInterval(() => {
                            tries++;
                            if (typeof window.loadFitsFile === 'function') {
                                try { installForwarders(); } catch (_) { }
                            }
                            if (tries > 60) { clearInterval(window.__forwarderIv); window.__forwarderIv = null; }
                        }, 250);
                    }
                }
                // Also forward URL-based loader
                if (typeof window.downloadAndLoadFitsFromUrl === 'function') {
                    if (!window.__origDownloadAndLoadFitsFromUrl) {
                        window.__origDownloadAndLoadFitsFromUrl = window.downloadAndLoadFitsFromUrl;
                        window.downloadAndLoadFitsFromUrl = function (url) {
                            const w = window.getActivePaneWindow && window.getActivePaneWindow();
                            if (w && typeof w.downloadAndLoadFitsFromUrl === 'function') return w.downloadAndLoadFitsFromUrl(url);
                            return window.__origDownloadAndLoadFitsFromUrl(url);
                        };
                    }
                }
                // Forward HDU selector popup to active pane so it appears above that pane, not background
                if (typeof window.createHduSelectorPopup === 'function') {
                    if (!window.__origCreateHduSelectorPopup) {
                        window.__origCreateHduSelectorPopup = window.createHduSelectorPopup;
                        window.createHduSelectorPopup = function (hduList, filepath) {
                            const w = window.getActivePaneWindow && window.getActivePaneWindow();
                            if (w && typeof w.createHduSelectorPopup === 'function') return w.createHduSelectorPopup(hduList, filepath);
                            return window.__origCreateHduSelectorPopup(hduList, filepath);
                        };
                    }
                }
                // Forward Region Style Settings popup to active pane
                if (typeof window.showStyleCustomizerPopup === 'function') {
                    if (!window.__origShowStyleCustomizerPopup) {
                        window.__origShowStyleCustomizerPopup = window.showStyleCustomizerPopup;
                        window.showStyleCustomizerPopup = function (catalogName) {
                            const w = window.getActivePaneWindow && window.getActivePaneWindow();
                            if (w && typeof w.showStyleCustomizerPopup === 'function') return w.showStyleCustomizerPopup(catalogName);
                            return window.__origShowStyleCustomizerPopup(catalogName);
                        };
                    }
                }
                // Forward histogram/dynamic-range popup to the active pane when multi-panel is active.
                // Otherwise the parent window has no image metadata (base viewer is hidden) and shows:
                // "Image metadata not loaded. Please load an image first."
                if (typeof window.showDynamicRangePopup === 'function') {
                    if (!window.__origShowDynamicRangePopup) {
                        window.__origShowDynamicRangePopup = window.showDynamicRangePopup;
                        window.showDynamicRangePopup = function (options) {
                            try {
                                const wrap = document.getElementById('multi-panel-container');
                                const grid = document.getElementById('multi-panel-grid');
                                const multiActive = !!(wrap && wrap.style.display !== 'none' && grid && grid.querySelectorAll('iframe').length >= 1);
                                if (multiActive) {
                                    const w = window.getActivePaneWindow && window.getActivePaneWindow();
                                    if (w && w !== window && typeof w.showDynamicRangePopup === 'function') {
                                        return w.showDynamicRangePopup(options || {});
                                    }
                                }
                            } catch (_) { }
                            return window.__origShowDynamicRangePopup(options || {});
                        };
                    }
                }
                // Forward percentile & dynamic-range apply helpers too (these can be called from popups created in the top window).
                if (typeof window.applyPercentile === 'function') {
                    if (!window.__origApplyPercentile) {
                        window.__origApplyPercentile = window.applyPercentile;
                        window.applyPercentile = function (percentileValue) {
                            const w = window.getActivePaneWindow && window.getActivePaneWindow();
                            if (w && w !== window && typeof w.applyPercentile === 'function') return w.applyPercentile(percentileValue);
                            return window.__origApplyPercentile(percentileValue);
                        };
                    }
                }
                if (typeof window.applyDynamicRange === 'function') {
                    if (!window.__origApplyDynamicRange) {
                        window.__origApplyDynamicRange = window.applyDynamicRange;
                        window.applyDynamicRange = function () {
                            const w = window.getActivePaneWindow && window.getActivePaneWindow();
                            if (w && w !== window && typeof w.applyDynamicRange === 'function') return w.applyDynamicRange();
                            return window.__origApplyDynamicRange();
                        };
                    }
                }
                // Forward selectHdu to active pane (safety for any direct calls)
                if (typeof window.selectHdu === 'function') {
                    if (!window.__origSelectHdu) {
                        window.__origSelectHdu = window.selectHdu;
                        window.selectHdu = function (hduIndex, filepath) {
                            const w = window.getActivePaneWindow && window.getActivePaneWindow();
                            if (w && typeof w.selectHdu === 'function') return w.selectHdu(hduIndex, filepath);
                            return window.__origSelectHdu(hduIndex, filepath);
                        };
                    }
                }
                // Forward segment helpers to the active pane
                if (typeof window.loadSegmentOverlay === 'function' && !window.__origLoadSegmentOverlay) {
                    window.__origLoadSegmentOverlay = window.loadSegmentOverlay;
                    window.loadSegmentOverlay = function (segmentPath, options) {
                        const w = window.getActivePaneWindow && window.getActivePaneWindow();
                        if (w && typeof w.loadSegmentOverlay === 'function') return w.loadSegmentOverlay(segmentPath, options);
                        return window.__origLoadSegmentOverlay(segmentPath, options);
                    };
                }
                // Forward catalog loading/clearing so overlays & source popups live in the active pane
                if (typeof window.loadCatalog === 'function' && !window.__origLoadCatalog) {
                    window.__origLoadCatalog = window.loadCatalog;
                    window.loadCatalog = function (catalogName, styles) {
                        const w = window.getActivePaneWindow && window.getActivePaneWindow();
                        if (w && typeof w.loadCatalog === 'function') {
                            return w.loadCatalog(catalogName, styles);
                        }
                        return window.__origLoadCatalog(catalogName, styles);
                    };
                }
                if (typeof window.clearCatalog === 'function' && !window.__origClearCatalog) {
                    window.__origClearCatalog = window.clearCatalog;
                    window.clearCatalog = function () {
                        const w = window.getActivePaneWindow && window.getActivePaneWindow();
                        if (w && typeof w.clearCatalog === 'function') {
                            return w.clearCatalog();
                        }
                        return window.__origClearCatalog();
                    };
                }
            } catch (_) { }
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', installForwarders);
        } else {
            installForwarders();
        }
    } catch (_) { }
    // Ensure FAB is created on DOM ready if not created by toolbar init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            try { createPanelFab(); } catch (_) { }
        });
    } else {
        try { createPanelFab(); } catch (_) { }
    }
})();
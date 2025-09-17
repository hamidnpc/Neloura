// static/toolbar.js
(function () {
    'use strict';

    // Order after Files; Plotter and Local Coding always visible; others only when image is loaded
    const ORDER = ['save','histogram','zoom-in','zoom-out','reset','settings','local-coding','plotter','catalog','peak'];
    const ALWAYS = new Set( ['files','save','histogram','zoom-in','zoom-out','reset','plotter','catalog','peak','settings']);
    const WHEN_LOADED = new Set();

    // Admin flag (fetched once on init)
    let __isAdmin = false;
    async function detectAdmin(){
        try { const r = await fetch('/settings/me'); const j = await r.json(); __isAdmin = !!(j && j.admin); }
        catch(_) { __isAdmin = false; }
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
                    .find(s => (s.src||'').includes('/static/local_coding.js'));
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
            } catch(_) { resolve(); }
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
        };
        const id = ids[type]; if (!id) return null;
        const el = document.getElementById(id); if (!el) return null;
        // Move Catalog’s dropdown wrapper (to keep the dropdown working)
        if (type === 'catalog') {
            const wrapper = el.closest('.dropdown');
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
            || Array.from(tb.querySelectorAll('button,[role="button"]')).find(b=>{
                const id=(b.id||'').toLowerCase(), cls=(b.className||'').toLowerCase(), t=(b.title||'').toLowerCase(), x=(b.textContent||'').trim().toLowerCase();
                return id.includes('files')||cls.includes('file-browser')||t.includes('files')||x==='files';
            }) || null;
    }
    function inheritAnchorClasses(btn) {
        const a = anchorBtn(); if (!a || btn===a) return;
        ['width','height','padding','margin','background','border','borderRadius','color','display','alignItems','justifyContent']
            .forEach(p=>{ try{ btn.style[p]=''; }catch(_){} });
        (a.className||'').split(/\s+/).filter(Boolean).forEach(c=>btn.classList.add(c));
        const role=a.getAttribute('role'); if (role && !btn.getAttribute('role')) btn.setAttribute('role', role);
    }
    function isLoaded() {
        try { if (window.tiledViewer && window.tiledViewer.isOpen && window.tiledViewer.isOpen()) return true; } catch(_){}
        try { if (window.fitsData && Number.isFinite(window.fitsData.width) && Number.isFinite(window.fitsData.height)) return true; } catch(_){}
        return false;
    }
    function idToType(id) {
        if (id==='save-png-toolbar-btn') return 'save';
        if (id==='plotter-button') return 'plotter';
        if (id==='local-coding-button') return 'local-coding';
        if (id==='zoom-in-button') return 'zoom-in';
        if (id==='zoom-out-button') return 'zoom-out';
        if (id==='reset-button') return 'reset';
        if (id==='histogram-button') return 'histogram';
        if (id==='catalog-button') return 'catalog';
        if (id==='peak-finder-button') return 'peak';
        return '';
    }
    function getExistingText(id) {
        const el=document.getElementById(id);
        const txt = el ? (el.textContent||'').trim() : '';
        return txt || null;
    }

    // ---------- Builders (create if missing; styling from Files via inherit) ----------
    const builders = {
        'save': () => {
            const a=anchorBtn(); if (!a) return null;
            const b=document.createElement('button');
            b.id='save-png-toolbar-btn'; b.title='Save PNG'; b.type='button'; b.className=a.className||'';
            const role=a.getAttribute('role'); if (role) b.setAttribute('role',role);
            b.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
        <polyline points="17,21 17,13 7,13 7,21"></polyline>
        <polyline points="7,3 7,8 15,8"></polyline>
    </svg>`;

            // Expose by save.js: window.onSaveClick = onSaveClick
            b.addEventListener('click', (e)=>{ e.preventDefault(); if (typeof window.onSaveClick==='function') window.onSaveClick(); });
            return b;
        },
        'plotter': () => {
            const a=anchorBtn(); if (!a) return null;
            const b=document.createElement('button');
            b.id='plotter-button'; b.type='button'; b.className=a.className||''; b.textContent=getExistingText('plotter-button')||'Plotter';
            // Use the same inline handler behavior as original HTML: togglePlotter()
            b.setAttribute('onclick','togglePlotter()');
            b.addEventListener('click', (e)=>{ e.preventDefault(); if (typeof window.togglePlotter==='function') window.togglePlotter(); });            return b;
        },
        'local-coding': () => {
            if (!__isAdmin) return null;
            const a=anchorBtn(); if (!a) return null;
            const b=document.createElement('button');
            b.id='local-coding-button'; b.type='button'; b.className=a.className||''; b.title='Local Coding';
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
            const a=anchorBtn(); if (!a) return null;
            const b=document.createElement('button');
            b.id='zoom-in-button'; b.type='button'; b.className=a.className||''; b.textContent='+';
            b.addEventListener('click',(e)=>{ e.preventDefault(); const v=window.tiledViewer; if (v&&v.viewport) v.viewport.zoomBy(1.2); });
            return b;
        },
        'zoom-out': () => {
            const a=anchorBtn(); if (!a) return null;
            const b=document.createElement('button');
            b.id='zoom-out-button'; b.type='button'; b.className=a.className||''; b.textContent='-';
            b.addEventListener('click',(e)=>{ e.preventDefault(); const v=window.tiledViewer; if (v&&v.viewport) v.viewport.zoomBy(1/1.2); });
            return b;
        },
        'reset': () => {
            const a=anchorBtn(); if (!a) return null;
            const b=document.createElement('button');
            b.id='reset-button'; b.type='button'; b.className=a.className||''; b.textContent='R';
            b.addEventListener('click',(e)=>{ e.preventDefault(); const v=window.tiledViewer; if (v&&v.viewport) v.viewport.goHome(true); });
            return b;
        },
        'histogram': () => {
            const a=anchorBtn(); if (!a) return null;
            const b=document.createElement('button');
            b.id='histogram-button'; b.type='button'; b.className=a.className||''; b.classList.add('dynamic-range-button'); b.title='Histogram';
            b.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <rect x="2" y="14" width="3" height="6"></rect>
                <rect x="7" y="8" width="3" height="12"></rect>
                <rect x="12" y="12" width="3" height="8"></rect>
                <rect x="17" y="6" width="3" height="14"></rect>
            </svg>`;
            b.addEventListener('click',(e)=>{ e.preventDefault(); if (typeof window.showDynamicRangePopup==='function') window.showDynamicRangePopup(); });
            return b;
        },
        'catalog': () => {
            const a=anchorBtn(); if (!a) return null;
            const b=document.createElement('button');
            b.id='catalog-button'; b.type='button'; b.className=a.className||''; b.textContent='Catalogs';
            b.addEventListener('click',(e)=>{ e.preventDefault(); toggleCatalogDropdown(); });
            return b;
        },
        'peak': () => {
            const a=anchorBtn(); if (!a) return null;
            const b=document.createElement('button');
            b.id='peak-finder-button'; b.type='button'; b.className=a.className||''; b.textContent='Peak Finder';
            // Call modal/popup opener directly, never add another toolbar button
            b.addEventListener('click',(e)=>{ e.preventDefault();
                if (typeof window.startPeakFinderUI==='function') return window.startPeakFinderUI();
                if (typeof window.createPeakFinderModal==='function') return window.createPeakFinderModal();
                if (typeof window.openPeakFinderModal==='function') return window.openPeakFinderModal();
            });
            return b;
        }
        ,
        'settings': () => {
            const a=anchorBtn(); if (!a) return null;
            const b=document.createElement('button');
            b.id='settings-button'; b.type='button'; b.className=a.className||''; b.title='Settings';
            b.innerHTML = `
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <circle cx="12" cy="12" r="3"></circle>
  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c0 .66.39 1.26 1 1.51.24.1.5.15.76.15H21a2 2 0 1 1 0 4h-.09c-.26 0-.52.05-.76.15-.61.25-1 .85-1 1.49z"></path>
</svg>`;
            b.addEventListener('click',(e)=>{ e.preventDefault(); if (typeof window.openSettingsPopup==='function') window.openSettingsPopup(); });
            return b;
        }
    };

    function toggleCatalogDropdown() {
        const btn = document.getElementById('catalog-button');
        const dd  = document.getElementById('catalog-dropdown');
        if (!btn || !dd) return;
        dd.style.display = dd.style.display === 'block' ? 'none' : 'block';
        const cats = Array.isArray(window.availableCatalogs) ? window.availableCatalogs : null;
        if (cats && typeof window.updateCatalogDropdown === 'function') {
            try { window.updateCatalogDropdown(cats); } catch (_) {}
        } else if (typeof window.loadCatalogs === 'function') {
            try { window.loadCatalogs(); } catch (_) {}
        }
        if (typeof window.updateCatalogDropdown === 'function') { try { window.updateCatalogDropdown(); } catch (_) {} }
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
    
        // Ensure Save exists and pinned immediately after Files
        if (!document.getElementById('save-png-toolbar-btn')) {
            const save = builders['save'] && builders['save']();
            if (save) a.insertAdjacentElement('afterend', save);
        }
    
        // Ensure the rest exist; do NOT relocate Plotter/Catalog if they already exist (to preserve dropdown/layout)
        const idsByType = {
            'plotter': 'plotter-button',
            'local-coding': 'local-coding-button',
            'zoom-in': 'zoom-in-button',
            'zoom-out': 'zoom-out-button',
            'reset': 'reset-button',
            'histogram': 'histogram-button',
            'catalog': 'catalog-button',
            'peak': 'peak-finder-button',
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
        if (lc && !__isAdmin) lc.style.display='none';
    }

    function pinSaveAfterFiles() {
        const a = anchorBtn(), s = document.getElementById('save-png-toolbar-btn');
        if (!a || !s) return;
        if (a.nextElementSibling !== s) a.insertAdjacentElement('afterend', s);
        inheritAnchorClasses(s);
    }

    function bindToolbarActions() {
        const localCoding=document.getElementById('local-coding-button');
        if (localCoding && !localCoding.dataset.bound) {
            // Remove any inline onclick to avoid calling undefined handlers
            try { localCoding.removeAttribute('onclick'); } catch(_){ }
            localCoding.addEventListener('click', async (e)=>{ e.preventDefault(); console.debug('[toolbar] Local Coding clicked (bind)');
                if (!__isAdmin) return;
                await ensureLocalCodingLoaded();
                console.debug('[toolbar] local_coding loaded, calling toggleLocalCodingPanel');
                if (typeof window.toggleLocalCodingPanel==='function') return window.toggleLocalCodingPanel();
                console.warn('[toolbar] toggleLocalCodingPanel not found');
            });
            localCoding.dataset.bound='1';
        }
        // Ensure onclick attribute present for Plotter (mirrors original button)
        const plotter=document.getElementById('plotter-button');
        if (plotter && !plotter.dataset.bound) {
            plotter.setAttribute('onclick','togglePlotter()');
            plotter.addEventListener('click',(e)=>{ e.preventDefault(); if (typeof window.togglePlotter==='function') window.togglePlotter(); });
            plotter.dataset.bound='1';
        }

        const catalog=document.getElementById('catalog-button');
        if (catalog && !catalog.dataset.bound) {
            catalog.addEventListener('click',(e)=>{ e.preventDefault(); toggleCatalogDropdown(); });
            catalog.dataset.bound='1';
        }

        const peak=document.getElementById('peak-finder-button');
        if (peak && !peak.dataset.bound) {
            peak.addEventListener('click',(e)=>{ e.preventDefault();
                if (typeof window.startPeakFinderUI==='function') return window.startPeakFinderUI();
                if (typeof window.createPeakFinderModal==='function') return window.createPeakFinderModal();
                if (typeof window.openPeakFinderModal==='function') return window.openPeakFinderModal();
            });
            peak.dataset.bound='1';
        }

        ['plotter-button','local-coding-button','zoom-in-button','zoom-out-button','reset-button','histogram-button','catalog-button','peak-finder-button','settings-button','save-png-toolbar-btn']
            .forEach(id=>{ const el=document.getElementById(id); if (el) inheritAnchorClasses(el); });
    }

    // ---------- Visibility ----------
    function updateVisibility() {
        const loaded=isLoaded();
        ['save-png-toolbar-btn','plotter-button','local-coding-button','zoom-in-button','zoom-out-button','reset-button','histogram-button','catalog-button','peak-finder-button','settings-button']
        .forEach(id=>{
            const el=document.getElementById(id); if (!el) return;
            const t=idToType(id);
            if (t==='local-coding') { el.style.display = __isAdmin ? '' : 'none'; if (__isAdmin) inheritAnchorClasses(el); return; }
            if (ALWAYS.has(t)) { el.style.display=''; inheritAnchorClasses(el); }
            else if (WHEN_LOADED.has(t)) { el.style.display=loaded?'':'none'; if (loaded) inheritAnchorClasses(el); }
        });
    }

    function observeToolbar() {
        const tb=toolbar(); if (!tb || tb._tbObs) return;
        const obs=new MutationObserver(()=>{
            ensureAllButtons();
            bindToolbarActions();
            reorderToolbar();   // <-- add this
            pinSaveAfterFiles();
            updateVisibility();
          });
                  obs.observe(tb,{childList:true,subtree:false});
        tb._tbObs=obs;
    }

    function hookViewer() {
        const attach = () => {
            if (window.tiledViewer && !window.tiledViewer._tbVH) {
                window.tiledViewer.addHandler('open', ()=>{
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
        await detectAdmin();
        ensureAllButtons();
        bindToolbarActions();
        reorderToolbar();      // <-- add this
        pinSaveAfterFiles();
        observeToolbar();
        hookViewer();
        document.addEventListener('histogram:ready', ()=>{ updateVisibility(); pinSaveAfterFiles(); });
        window.addEventListener('resize', ()=>{ updateVisibility(); pinSaveAfterFiles(); });
        updateVisibility();
    }

    if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
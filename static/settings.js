(function(){
    'use strict';

    async function ensureSession() {
        try { if (window.__sid) return window.__sid; } catch(_){}
        try {
            const r = await fetch('/session/start');
            const j = await r.json();
            window.__sid = j.session_id;
            return window.__sid;
        } catch(_) { return null; }
    }

    function authHeaders() {
        const h = { 'Content-Type': 'application/json' };
        if (window.__sid) h['X-Session-ID'] = window.__sid;
        return h;
    }

    async function api(path, opts={}) {
        await ensureSession();
        const res = await fetch(path, { headers: authHeaders(), credentials: 'same-origin', ...opts });
        if (!res.ok) {
            const text = await res.text();
            let data = null; try { data = JSON.parse(text); } catch(_){}
            const err = new Error(text || res.statusText || 'Request failed');
            err.status = res.status; err.data = data; err.url = path;
            throw err;
        }
        return res.json();
    }

    function closeExisting() {
        const e = document.getElementById('settings-popup');
        if (e) e.remove();
    }

    function label(title) {
        const l=document.createElement('div');
        l.textContent=title; l.style.color='#bbb'; l.style.fontSize='12px'; l.style.margin='6px 0 4px';
        return l;
    }

    // Friendly names and descriptions for parameters and groups
    const FRIENDLY_TITLES = {
        // Web/API
        'UVICORN_HOST': 'Server host',
        'UVICORN_PORT': 'Server port',
        'UVICORN_RELOAD_MODE': 'Auto-reload server',
        'DEFAULT_EXPORT_FORMAT': 'Default export format',
        'MAX_EXPORT_ROWS': 'Max export rows',
        'CATALOG_COLUMN_ANALYSIS_SAMPLE_SIZE': 'Catalog analysis sample size',
        'SYSTEM_STATS_UPDATE_INTERVAL': 'System stats update interval (s)',
        'PROXY_DOWNLOAD_TIMEOUT': 'Proxy download timeout (s)',
        'FIND_FILES_TIMEOUT': 'File search timeout (s)',
        'PEAK_FINDER_TIMEOUT': 'Peak finder timeout (s)',

        // Paths
        'CATALOGS_DIRECTORY': 'Catalogs directory',
        'UPLOADS_DIRECTORY': 'Uploads directory',
        'CATALOG_MAPPINGS_FILE': 'Catalog mappings file',
        'FILES_DIRECTORY': 'Files directory',
        'BASE_FITS_PATH': 'Base FITS path',
        'PSF_DIRECTORY': 'PSF directory',
        'BASE_PSF_PATH': 'Base PSF path',
        'IMAGE_DIR': 'Image output directory',

        // FITS/Tiles
        'DEFAULT_HDU_INDEX': 'Default HDU index',
        'IMAGE_TILE_SIZE_PX': 'Image tile size (px)',
        'DYNAMIC_RANGE_PERCENTILES': 'Dynamic range percentiles',

        // Algorithms
        'PEAK_FINDER_DEFAULTS': 'Peak finder defaults',
        'SOURCE_PROPERTIES_SEARCH_RADIUS_ARCSEC': 'Source search radius (arcsec)',
        'MAX_POINTS_FOR_FULL_HISTOGRAM': 'Histogram max points',
        'FITS_HISTOGRAM_DEFAULT_BINS': 'Histogram bins',
        'CATALOG_ANALYSIS_HISTOGRAM_BINS': 'Catalog analysis histogram bins',
        'RA_COLUMN_NAMES': 'RA column names',
        'DEC_COLUMN_NAMES': 'Dec column names',
        'RGB_GALAXY_COLUMN_NAMES': 'Galaxy column names',
        'RGB_INVALID_GALAXY_NAMES': 'Invalid galaxy names',
        'CUTOUT_SIZE_ARCSEC': 'Cutout size (arcsec)',
        'RGB_PANEL_TYPE_DEFAULT': 'Default RGB panel type',

        // Cache
        'TILE_CACHE_MAX_SIZE': 'Tile cache size',
        'SED_HST_FILTERS': 'HST filters (SED)',
        'SED_JWST_NIRCAM_FILTERS': 'NIRCam filters (SED)',
        'SED_JWST_MIRI_FILTERS': 'MIRI filters (SED)',

        // I/O
        'ENABLE_IN_MEMORY_FITS': 'Enable in-memory FITS',
        'IN_MEMORY_FITS_MAX_MB': 'Max in-memory FITS (MB)',
        'IN_MEMORY_FITS_RAM_FRACTION': 'RAM fraction for in-memory FITS',
        'ENABLE_PAGECACHE_WARMUP': 'Enable page cache warmup',
        'PAGECACHE_WARMUP_CHUNK_ROWS': 'Page cache warmup rows per chunk',
        'IN_MEMORY_FITS_MODE': 'In-memory FITS mode',
        'RANDOM_READ_BENCH_SAMPLES': 'Random-read bench samples',
        'RANDOM_READ_CHUNK_BYTES': 'Random-read chunk bytes',
        'RANDOM_READ_THRESHOLD_MBPS': 'Random-read threshold (MiB/s)'
    };
    // Uploads (admin) – friendly titles
    try {
        FRIENDLY_TITLES['UPLOADS_AUTO_CLEAN_ENABLE'] = 'Enable auto-clean of uploads';
        FRIENDLY_TITLES['UPLOADS_AUTO_CLEAN_INTERVAL_MINUTES'] = 'Auto-clean interval (minutes)';
    } catch(_) {}

    const FRIENDLY_DESCRIPTIONS = {
        'CATALOG_COLUMN_ANALYSIS_SAMPLE_SIZE': 'Rows sampled for quick column analysis to speed up UI.',
        'DEFAULT_EXPORT_FORMAT': 'Initial export format used when exporting catalog data.',
        'IN_MEMORY_FITS_MODE': 'Always promote slices to RAM, auto based on disk speed, or never.',
        'IMAGE_TILE_SIZE_PX': 'Tile size used for tiled image display.',
        'FITS_HISTOGRAM_DEFAULT_BINS': 'Default number of bins for FITS histogram endpoint.'
    };

    function toTitleCaseFromKey(key){
        return (key||'').toLowerCase().split('_').map(s=>s? (s[0].toUpperCase()+s.slice(1)) : s).join(' ');
    }

    // Helper: convert CSS color string to hex (if possible)
    function cssToHex(input) {
        try {
            if (!input) return null;
            if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(input)) return input;
            const d=document.createElement('div');
            d.style.color = input;
            document.body.appendChild(d);
            const cs = getComputedStyle(d).color;
            document.body.removeChild(d);
            const m = cs.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
            if (!m) return null;
            const r = (parseInt(m[1],10)||0).toString(16).padStart(2,'0');
            const g = (parseInt(m[2],10)||0).toString(16).padStart(2,'0');
            const b = (parseInt(m[3],10)||0).toString(16).padStart(2,'0');
            return `#${r}${g}${b}`;
        } catch(_) { return null; }
    }

    function inputForField(name, defVal, options) {
        let el;
        const type = Array.isArray(options) ? 'enum' : (typeof defVal);
        // Specialized widgets
        const markerKeys = new Set(['RGB_MARKER_SYMBOL']);
        const scaleKeys = new Set(['SED_XSCALE','SED_YSCALE']);
        const isColorKey = (k, v) => /color/i.test(k) || (typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v));

        if (markerKeys.has(name)) {
            const select = document.createElement('select');
            const opts = [
                {v:'o', l:'Circle ○'},
                {v:'s', l:'Square ■'},
                {v:'^', l:'Triangle ▲'},
                {v:'v', l:'Triangle ▼'},
                {v:'+', l:'Plus +'},
                {v:'x', l:'X ✕'},
                {v:'*', l:'Star ✦'},
                {v:'D', l:'Diamond ◆'},
                {v:'.', l:'Point ·'},
                {v:'p', l:'Pentagon ⬟'}
            ];
            opts.forEach(o=>{ const opt=document.createElement('option'); opt.value=o.v; opt.textContent=o.l; if (String(defVal)===o.v) opt.selected=true; select.appendChild(opt); });
            select.dataset.field=name;
            Object.assign(select.style,{ width:'100%', padding:'6px', border:'1px solid #555', borderRadius:'4px', background:'#1f1f1f', color:'#eee' });
            return select;
        }

        if (scaleKeys.has(name)) {
            const select = document.createElement('select');
            ['linear','log','symlog','logit'].forEach(v=>{ const opt=document.createElement('option'); opt.value=v; opt.textContent=v; if (String(defVal)===v) opt.selected=true; select.appendChild(opt); });
            select.dataset.field=name;
            Object.assign(select.style,{ width:'100%', padding:'6px', border:'1px solid #555', borderRadius:'4px', background:'#1f1f1f', color:'#eee' });
            return select;
        }

        if (isColorKey(name, defVal)) {
            const wrap=document.createElement('div'); wrap.style.display='flex'; wrap.style.gap='8px'; wrap.style.alignItems='center';
            const color=document.createElement('input'); color.type='color';
            const initText = (typeof defVal==='object'? JSON.stringify(defVal) : String(defVal));
            const initHex = cssToHex(initText) || '#ffffff';
            color.value = initHex;
            Object.assign(color.style,{ width:'44px', height:'32px', padding:'0', border:'1px solid #555', borderRadius:'4px', background:'#1f1f1f' });
            const text=document.createElement('input'); text.type='text'; text.value = initText;
            text.dataset.field=name;
            Object.assign(text.style,{ flex:'1', padding:'6px', border:'1px solid #555', borderRadius:'4px', background:'#1f1f1f', color:'#eee' });
            color.addEventListener('input', ()=>{ text.value = color.value; });
            text.addEventListener('input', ()=>{ const hx = cssToHex(text.value); if (hx) color.value=hx; });
            wrap.appendChild(color); wrap.appendChild(text);
            return wrap;
        }
        if (type==='enum') {
            el = document.createElement('select');
            options.forEach(opt=>{
                const o=document.createElement('option');
                o.value=String(opt); o.textContent=String(opt);
                if (String(defVal)===String(opt)) o.selected=true;
                el.appendChild(o);
            });
        } else if (type==='boolean' || type==='bool') {
            el = document.createElement('input'); el.type='checkbox'; el.checked=!!defVal;
        } else if (type==='number') {
            el = document.createElement('input'); el.type='number'; el.value=String(defVal);
        } else {
            el = document.createElement('input'); el.type='text'; el.value=(typeof defVal==='object'? JSON.stringify(defVal) : String(defVal));
        }
        el.dataset.field=name;
        el.style.width='100%'; el.style.padding='6px'; el.style.border='1px solid #555'; el.style.borderRadius='4px'; el.style.background='#1f1f1f'; el.style.color='#eee';
        return el;
    }

    function parseValue(el, defaultVal) {
        // Treat null/undefined defaults as free-form text (or numeric if input type is number)
        if (defaultVal === null || typeof defaultVal === 'undefined') {
            if (el.tagName === 'SELECT') return el.value;
            if (el.type === 'checkbox') return !!el.checked;
            if (el.type === 'number') return Number(el.value);
            return el.value;
        }
        if (el.tagName==='SELECT') {
            if (typeof defaultVal==='boolean') return el.value==='true';
            if (typeof defaultVal==='number') return Number(el.value);
            return el.value;
        }
        if (el.type==='checkbox') return !!el.checked;
        if (typeof defaultVal==='number') return Number(el.value);
        if (typeof defaultVal==='boolean') return el.value==='true';
        if (typeof defaultVal==='object') {
            try { return JSON.parse(el.value); } catch(_) { return defaultVal; }
        }
        return el.value;
    }

    function buildRow(field, defaultVal, options, current) {
        const row=document.createElement('div'); row.className='settings-row'; row.style.margin='8px 0';
        const title = FRIENDLY_TITLES[field] || toTitleCaseFromKey(field);
        const titleEl = label(title);
        if (FRIENDLY_DESCRIPTIONS[field]) {
            const desc=document.createElement('div'); desc.textContent=FRIENDLY_DESCRIPTIONS[field]; desc.style.color='#888'; desc.style.fontSize='11px'; desc.style.margin='2px 0 6px';
            row.appendChild(titleEl); row.appendChild(desc);
        } else {
            row.appendChild(titleEl);
        }
        const inp=inputForField(field, (current??defaultVal), options);
        row.appendChild(inp);
        row.dataset.name = field;
        row.dataset.title = title.toLowerCase();
        return row;
    }

    function buildPopupSkeleton() {
        const popup=document.createElement('div');
        popup.id='settings-popup';
        Object.assign(popup.style, {
            position:'fixed', top:'50%', left:'50%', transform:'translate(-50%, -50%)',
            background:'#333', border:'1px solid #555', borderRadius:'6px', padding:'16px', zIndex:'30000000',
            width:'min(1100px, 96vw)', height:'min(80vh, 720px)', display:'flex', flexDirection:'column', boxShadow:'0 10px 40px rgba(0,0,0,0.5)'
        });
        const header=document.createElement('div'); header.style.display='flex'; header.style.justifyContent='space-between'; header.style.alignItems='center'; header.style.marginBottom='8px';
        header.style.cursor='move';
        const title=document.createElement('div'); title.textContent='Settings'; title.style.color='#fff'; title.style.fontSize='16px'; title.style.fontWeight='600';
        const close=document.createElement('button'); close.textContent='×'; close.style.fontSize='18px'; close.style.background='transparent'; close.style.border='none'; close.style.color='#fff'; close.style.cursor='pointer'; close.onclick=()=>popup.remove();
        header.appendChild(title); header.appendChild(close);

        // Dragging logic
        (function enableDrag(){
            let dragging=false; let startX=0, startY=0; let startLeft=0, startTop=0;
            function onMouseDown(e){
                dragging=true; e.preventDefault();
                // On first drag, convert from translate center to absolute left/top
                const rect = popup.getBoundingClientRect();
                popup.style.transform='';
                // If position is still centered (50%/50%), convert to pixels
                if (popup.style.left.endsWith('%') || popup.style.top.endsWith('%')){
                    popup.style.left = `${Math.round(rect.left)}px`;
                    popup.style.top = `${Math.round(rect.top)}px`;
                }
                startX = e.clientX; startY = e.clientY;
                startLeft = parseInt(popup.style.left||rect.left+'',10);
                startTop = parseInt(popup.style.top||rect.top+'',10);
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            }
            function onMouseMove(e){
                if (!dragging) return;
                const dx = e.clientX - startX; const dy = e.clientY - startY;
                let newLeft = startLeft + dx; let newTop = startTop + dy;
                // Constrain to viewport
                const pw = popup.offsetWidth, ph = popup.offsetHeight;
                const vw = window.innerWidth, vh = window.innerHeight;
                newLeft = Math.min(Math.max(0, newLeft), Math.max(0, vw - pw));
                newTop = Math.min(Math.max(0, newTop), Math.max(0, vh - ph));
                popup.style.left = `${newLeft}px`;
                popup.style.top = `${newTop}px`;
            }
            function onMouseUp(){
                if (!dragging) return;
                dragging=false;
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                // Persist position
                try { localStorage.setItem('settings.popupPosition', JSON.stringify({ left: popup.style.left, top: popup.style.top })); } catch(_){ }
            }
            header.addEventListener('mousedown', onMouseDown);
        })();

        // Tabs container (vertical on left) + content on right (popular layout)
        const body=document.createElement('div'); body.style.flex='1'; body.style.display='grid'; body.style.gridTemplateColumns='220px 1fr'; body.style.gap='12px'; body.style.height='100%';
        const tabs=document.createElement('div'); tabs.style.display='flex'; tabs.style.flexDirection='column'; tabs.style.borderRight='1px solid #555'; tabs.style.overflow='auto'; tabs.style.height='100%';
        const content=document.createElement('div'); content.style.position='relative'; content.style.height='100%'; content.style.overflow='hidden';

        // Add CSS for tab animations once
        if (!document.getElementById('settings-popup-styles')) {
            const styles=document.createElement('style'); styles.id='settings-popup-styles';
            styles.textContent = `
                .settings-content { position: relative; height: 100%; overflow: hidden; }
                .settings-tab-panel { position: absolute; inset: 0; overflow-y: auto; overflow-x: hidden; opacity: 0; transform: translateX(6px); transition: opacity 180ms ease, transform 180ms ease; pointer-events: none; }
                .settings-tab-panel.active { opacity: 1; transform: translateX(0); pointer-events: auto; }
                .settings-tab-button { padding: 10px; border: none; background: transparent; color: #ddd; text-align: left; cursor: pointer; transition: background 120ms ease, color 120ms ease; }
                .settings-tab-button.active { background: #2a2a2a; color: #fff; }
                @keyframes pulseBorder { 0%{ box-shadow: 0 0 0 0 rgba(46,204,113,0.6);} 70%{ box-shadow: 0 0 0 8px rgba(46,204,113,0); } 100%{ box-shadow: 0 0 0 0 rgba(46,204,113,0);} }
                .profile-active-pulse { animation: pulseBorder 600ms ease; }
                .settings-field { display: flex; align-items: center; gap: 8px; }
                .settings-label { color:#bbb; font-size: 12px; min-width: 90px; text-align: right; }
            `;
            document.head.appendChild(styles);
        }

        const footer=document.createElement('div'); footer.style.display='flex'; footer.style.gap='8px'; footer.style.justifyContent='space-between'; footer.style.marginTop='8px';
        const left=document.createElement('div'); left.style.display='flex'; left.style.gap='8px';
        const right=document.createElement('div'); right.style.display='flex'; right.style.gap='8px';

        popup.appendChild(header); body.appendChild(tabs); body.appendChild(content); popup.appendChild(body); popup.appendChild(footer);
        footer.appendChild(left); footer.appendChild(right);
        return { popup, header, body, tabs, content, footer, left, right, title };
    }

    async function openSettingsPopup() {
        closeExisting();
        await ensureSession();
        const me = await api('/settings/me');
        const schema = await api('/settings/schema');
        const defaults = await api('/settings/defaults');
        let profiles = await api('/settings/profiles');
        let effective = await api('/settings/effective');
        let currentActiveName = profiles.active || null;
        if (me.admin) currentActiveName = 'admin';

        const { popup, tabs, content, left, right, title } = buildPopupSkeleton();
        title.textContent = 'Settings';
        // Active profile indicator in header
        const headerActive = document.createElement('span');
        headerActive.id = 'settings-active-header';
        headerActive.style.marginLeft = '8px';
        headerActive.style.color = '#9cd67b';
        headerActive.style.fontSize = '12px';
        title.appendChild(headerActive);

        // Tab buttons (left)
        const tabList=[
            {id:'general', label:'General'},
            {id:'web_api', label:'Web & API'},
            {id:'fits_tiles', label:'FITS & Tiles'},
            // Insert Uploads before WCS only when admin
            ...(me.admin ? [{id:'uploads', label:'Uploads'}] : []),
            {id:'wcs', label:'WCS'},
            {id:'algorithms', label:'Algorithms'},
            {id:'paths', label:'Paths'},
            {id:'io', label:'I/O & Performance'},
            {id:'cache', label:'Caching'},
            {id:'rgb', label:'RGB'},
            {id:'sed', label:'SED'},
            {id:'misc', label:'Misc'},
        ];
        const tabButtons={};
        tabList.forEach(t=>{
            const b=document.createElement('button');
            b.textContent=t.label; b.dataset.tab=t.id; b.className='settings-tab-button';
            b.addEventListener('click', ()=> selectTab(t.id));
            tabs.appendChild(b); tabButtons[t.id]=b;
        });

        const panels={};
        // Hoisted containers for advanced append targets
        let __sedCard = null;
        function createPanel(){ const p=document.createElement('div'); p.className='settings-tab-panel'; p.style.minHeight='100%'; return p; }
        tabList.forEach(t=> panels[t.id]=createPanel());

        // Build General tab (profiles + key general parameters)
        const generalPanel=panels['general'];
        const profilesPane=document.createElement('div'); profilesPane.style.border='1px solid #555'; profilesPane.style.borderRadius='6px'; profilesPane.style.padding='10px'; profilesPane.style.marginBottom='12px';
        const profHeader=document.createElement('div'); profHeader.textContent='Profiles'; profHeader.style.color='#fff'; profHeader.style.marginBottom='8px'; profHeader.style.fontWeight='600';
        const adminBadge=document.createElement('span'); adminBadge.style.marginLeft='8px'; adminBadge.style.fontSize='12px'; adminBadge.style.color= me.admin ? '#9cd67b' : '#aaa'; adminBadge.textContent = me.admin ? '(Admin mode enabled)' : '(Admin mode disabled)'; profHeader.appendChild(adminBadge);
        const activeLabel=document.createElement('div'); activeLabel.style.color='#aaa'; activeLabel.style.fontSize='12px'; activeLabel.style.margin='4px 0 8px';
        const profList=document.createElement('div'); profList.style.maxHeight='240px'; profList.style.overflow='auto'; profList.style.border='1px solid #444'; profList.style.borderRadius='4px';

        function renderProfiles() {
            profList.innerHTML='';
            activeLabel.textContent = currentActiveName ? `Active: ${currentActiveName}` : 'Active: (none)';
            (profiles.profiles||[]).forEach(p=>{
                const item=document.createElement('div'); item.style.display='flex'; item.style.justifyContent='space-between'; item.style.alignItems='center'; item.style.padding='6px 8px'; item.style.borderBottom='1px solid #444'; item.style.transition='border-color 180ms ease, box-shadow 180ms ease';
                item.dataset.profileName = p.name;
                if (p.name===currentActiveName) { item.style.border = '2px solid #2ecc71'; item.style.borderRadius = '6px'; item.style.boxShadow='0 0 0 2px rgba(46,204,113,0.2)'; }
                const name=document.createElement('span'); name.textContent=p.name; name.style.color='#eee'; if (p.name===currentActiveName) name.style.fontWeight='700';
                const actions=document.createElement('div'); actions.style.display='flex'; actions.style.gap='6px';
                const useBtn=document.createElement('button'); useBtn.textContent='Use'; useBtn.onclick=async()=>{
                    await api('/settings/active',{method:'POST', body: JSON.stringify({name:p.name})});
                    currentActiveName = p.name;
                    profiles = await api('/settings/profiles');
                    effective = await api('/settings/effective');
                    applyValuesToInputs(effective.settings||{});
                    if (typeof window.showNotification==='function') window.showNotification(`Activated profile: ${p.name}`, 1400, 'success');
                    updateActiveUI();
                    renderProfiles();
                };
                const delBtn=document.createElement('button'); delBtn.textContent='Delete'; delBtn.disabled = (p.locked === true); delBtn.style.opacity = delBtn.disabled ? '0.6' : '1'; delBtn.onclick=async()=>{
                    if (delBtn.disabled) { if (typeof window.showNotification==='function') window.showNotification('Admin profile cannot be deleted', 1600, 'warning'); return; }
                    // Custom confirm popup
                    const overlay=document.createElement('div'); overlay.style.position='fixed'; overlay.style.inset='0'; overlay.style.background='rgba(0,0,0,0.6)'; overlay.style.zIndex='4000';
                    const box=document.createElement('div'); Object.assign(box.style,{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%, -50%)',background:'#2b2b2b',border:'1px solid #555',borderRadius:'8px',padding:'16px',color:'#eee',minWidth:'280px'});
                    const msg=document.createElement('div'); msg.textContent=`Delete profile "${p.name}"?`; msg.style.marginBottom='12px';
                    const actions=document.createElement('div'); actions.style.display='flex'; actions.style.justifyContent='flex-end'; actions.style.gap='8px';
                    const cancel=document.createElement('button'); cancel.textContent='Cancel'; cancel.style.padding='6px 10px'; cancel.style.border='1px solid #555'; cancel.style.background='#3a3a3a'; cancel.style.color='#eee'; cancel.style.borderRadius='4px'; cancel.onclick=()=>document.body.removeChild(overlay);
                    const confirm=document.createElement('button'); confirm.textContent='Delete'; confirm.style.padding='6px 10px'; confirm.style.border='1px solid #a33'; confirm.style.background='#c0392b'; confirm.style.color='#fff'; confirm.style.borderRadius='4px';
                    confirm.onclick=async()=>{
                        await api('/settings/profile/'+encodeURIComponent(p.name), {method:'DELETE'});
                        profiles = await api('/settings/profiles');
                        if (profiles.active && profiles.active === p.name) {
                            await api('/settings/active',{method:'POST', body: JSON.stringify({name:null})});
                            currentActiveName = null;
                        }
                        effective = await api('/settings/effective');
                        applyValuesToInputs(effective.settings||{});
                        updateActiveUI();
                        renderProfiles();
                        document.body.removeChild(overlay);
                        if (typeof window.showNotification==='function') window.showNotification('Profile deleted', 1200, 'info');
                    };
                    actions.appendChild(cancel); actions.appendChild(confirm);
                    box.appendChild(msg); box.appendChild(actions); overlay.appendChild(box); document.body.appendChild(overlay);
                };
                [useBtn, delBtn].forEach(b=>{ b.style.padding='4px 8px'; b.style.background='#2a2a2a'; b.style.border='1px solid #555'; b.style.color='#eee'; b.style.borderRadius='4px'; b.style.cursor='pointer'; });
                actions.appendChild(useBtn); actions.appendChild(delBtn);
                item.appendChild(name); item.appendChild(actions);
                profList.appendChild(item);
            });
            // Pulse animation on the newly active profile
            if (currentActiveName) {
                const activeEl = profList.querySelector(`[data-profile-name="${CSS.escape(currentActiveName)}"]`);
                if (activeEl) {
                    activeEl.classList.remove('profile-active-pulse');
                    // Force reflow to restart animation
                    void activeEl.offsetWidth;
                    activeEl.classList.add('profile-active-pulse');
                }
            }
        }
        renderProfiles();

        const controlRow=document.createElement('div'); controlRow.style.display='flex'; controlRow.style.gap='8px'; controlRow.style.marginTop='8px';
        const nameInput=document.createElement('input'); nameInput.placeholder='Profile name'; nameInput.style.flex='1'; nameInput.style.padding='6px'; nameInput.style.border='1px solid #555'; nameInput.style.borderRadius='4px'; nameInput.style.background='#1f1f1f'; nameInput.style.color='#eee';
        const newBtn=document.createElement('button'); newBtn.textContent='Create Profile'; newBtn.style.padding='8px'; newBtn.style.border='1px solid #555'; newBtn.style.background='#2a2a2a'; newBtn.style.color='#eee'; newBtn.style.borderRadius='4px'; newBtn.style.cursor='pointer';
        controlRow.appendChild(nameInput); controlRow.appendChild(newBtn);

        newBtn.onclick=async()=>{
            const name=(nameInput.value||'').trim();
            if(!name){ if (typeof window.showNotification==='function') window.showNotification('Enter a profile name before creating.', 1600, 'warning'); return; }
            const exists = (profiles.profiles||[]).some(p=>p.name===name);
            if (exists) { if (typeof window.showNotification==='function') window.showNotification('A profile with this name already exists.', 1800, 'error'); return; }
            try {
                await api('/settings/profile',{method:'POST', body: JSON.stringify({name, settings: (defaults.defaults||{})})});
            } catch(e) {
                // Handle 409 conflict
                if ((e+"").includes('exists')) { if (typeof window.showNotification==='function') window.showNotification('A profile with this name already exists.', 1800, 'error'); return; }
                throw e;
            }
            profiles = await api('/settings/profiles');
            await api('/settings/active',{method:'POST', body: JSON.stringify({name})});
            currentActiveName = name;
            effective = await api('/settings/effective');
            applyValuesToInputs(effective.settings||{});
            updateActiveUI();
            renderProfiles();
            if (typeof window.showNotification==='function') window.showNotification('Profile created and activated', 1400, 'success');
        };

        profilesPane.appendChild(profHeader);
        profilesPane.appendChild(activeLabel);
        profilesPane.appendChild(profList);
        // Admin mode: hide profile creation UI
        if (!me.admin) {
            profilesPane.appendChild(controlRow);
        }

        // Reset to defaults button (loads parameters from main.py defaults)
        const resetRow=document.createElement('div'); resetRow.style.display='flex'; resetRow.style.justifyContent='flex-start'; resetRow.style.marginTop='8px';
        const resetBtn=document.createElement('button'); resetBtn.textContent='Reset to defaults';
        Object.assign(resetBtn.style,{ padding:'8px 12px', border:'1px solid #555', background:'#2a2a2a', color:'#eee', borderRadius:'4px', cursor:'pointer' });
        resetBtn.onclick=async()=>{
            try {
                // Clear active profile for this session → server falls back to defaults from main.py
                await api('/settings/active',{method:'POST', body: JSON.stringify({name:null})});
                profiles = await api('/settings/profiles');
                effective = await api('/settings/effective');
                currentActiveName = profiles.active || null;
                applyValuesToInputs(effective.settings||{});
                updateActiveUI();
                renderProfiles();
                // Broadcast new effective settings so overlays update immediately (no Save required)
                try { if (typeof window !== 'undefined') { window.__wcsEffective = { ...(window.__wcsEffective||{}), ...((effective&&effective.settings)||{}) }; } } catch(_){ }
                try { document.dispatchEvent(new CustomEvent('settings:updated', { detail: { settingsDelta: (effective&&effective.settings)||{}, group: 'all' } })); } catch(_){ }
                if (typeof window.showNotification==='function') window.showNotification('Reset to defaults parameters ', 1400, 'success');
            } catch(e) {
                const msg = (e && e.data && e.data.detail) ? e.data.detail : 'Failed to reset to defaults';
                if (typeof window.showNotification==='function') window.showNotification(msg, 1800, 'error');
            }
        };
        resetRow.appendChild(resetBtn);
        profilesPane.appendChild(resetRow);

        function collectSettings(root){
            const out={};
            (root||document).querySelectorAll('[data-field]').forEach(el=>{
                const key=el.dataset.field;
                const def=defaults.defaults?.[key];
                // For JSON-like fields: trim, and accept empty as {} or [] depending on default
                if (typeof def === 'object' && (el.tagName === 'TEXTAREA' || el.type === 'text')) {
                    const raw = String(el.value||'').trim();
                    if (raw === '') {
                        out[key] = Array.isArray(def) ? [] : {};
                    } else {
                        try { out[key] = JSON.parse(raw); }
                        catch(_) { out[key] = def; }
                    }
                } else {
                    out[key]=parseValue(el, def);
                }
            });
            return out;
        }

        function applyValuesToInputs(values){
            const setVal=(el,val,def)=>{
                if (el.tagName==='SELECT') el.value = String(val ?? def ?? '');
                else if (el.type==='checkbox') el.checked = !!(val ?? def ?? false);
                else if (typeof (val ?? def) === 'object') el.value = JSON.stringify(val ?? def ?? {});
                else el.value = String(val ?? def ?? '');
            };
            document.querySelectorAll('#settings-popup [data-field]').forEach(el=>{
                const key=el.dataset.field; const def=defaults.defaults?.[key];
                setVal(el, values[key], def);
            });
            // Also update any proxy fields used by custom UI (e.g., colors, JSON textareas)
            document.querySelectorAll('#settings-popup [data-proxy-field]').forEach(el=>{
                const key=el.dataset.proxyField; const def=defaults.defaults?.[key];
                let writeVal = (values && Object.prototype.hasOwnProperty.call(values, key)) ? values[key] : def;
                if (typeof writeVal === 'object') {
                    try { writeVal = JSON.stringify(writeVal, null, 2); } catch(_) { writeVal = ''; }
                }
                el.value = (writeVal ?? '');
                // If this proxy is paired with a preceding <input type=color>, sync the swatch
                try {
                    const prev = el.previousElementSibling;
                    if (prev && prev.tagName==='INPUT' && prev.type==='color'){
                        const hx = typeof cssToHex==='function' ? cssToHex(String(writeVal)) : null;
                        if (hx) prev.value = hx;
                    }
                } catch(_){ }
                // If there is an associated combo button nearby (e.g., cmap dropdown), update its label
                try {
                    if (key==='SED_CUTOUT_CMAP' || key==='RGB_HA_COLORMAP'){
                        const btn = el.parentElement && el.parentElement.querySelector('button');
                        if (btn && typeof writeVal!=='object') btn.textContent = String(writeVal ?? '');
                    }
                } catch(_){ }
            });
        }

        // Active badges per panel
        const panelActiveBadges = {};

        generalPanel.appendChild(profilesPane);

        // Populate other tabs by grouping
        const groupToPanel = {
            'Web/API': panels['web_api'],
            'FITS/Tiles': panels['fits_tiles'],
            ...(me.admin ? {'Uploads': panels['uploads']} : {}),
            'WCS': panels['wcs'],
            'Algorithms': panels['algorithms'],
            'Paths': panels['paths'],
            'I/O': panels['io'],
            'Cache': panels['cache'],
            'RGB': panels['rgb'],
            'SED': panels['sed'],
            'Misc': panels['misc']
        };
        const TITLE_OVERRIDES = {
            'WCS_ENABLE': 'Enable WCS overlay',
            'WCS_CATALOG_AUTO_CONVERT': 'Auto-convert catalogs using image WCS',
            'WCS_PREFER_CD': 'Prefer CD matrix over PC',
            'WCS_REFLECTION_FIX': 'Apply X-axis reflection fix',
            'WCS_LABEL_MODE': 'WCS label mode',
            'WCS_AXIS_COLOR': 'Axes border color',
            'WCS_TICK_COLOR': 'Tick marks color',
            'WCS_LABEL_TEXT_COLOR': 'Label text color',
            'WCS_LABEL_BG_COLOR': 'Label background color',
        };
        const grouped = (schema.schema||[]).reduce((acc, f)=>{
            if (TITLE_OVERRIDES[f.name]) {
                try { FRIENDLY_TITLES[f.name] = TITLE_OVERRIDES[f.name]; } catch(_){ }
            }
            (acc[f.group]=acc[f.group]||[]).push(f);
            return acc;
        },{});
        // Helper to prompt for a new profile name
        function promptForNewProfileName(suggestion) {
            return new Promise((resolve)=>{
                const overlay=document.createElement('div'); overlay.style.position='fixed'; overlay.style.inset='0'; overlay.style.background='rgba(0,0,0,0.6)'; overlay.style.zIndex='40000000';
                const box=document.createElement('div'); Object.assign(box.style,{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%, -50%)',background:'#2b2b2b',border:'1px solid #555',borderRadius:'8px',padding:'16px',color:'#eee',minWidth:'320px'});
                const title=document.createElement('div'); title.textContent='Save as new profile'; title.style.marginBottom='8px'; title.style.fontWeight='600';
                const input=document.createElement('input'); input.type='text'; input.placeholder='Enter new profile name'; input.value=suggestion||''; Object.assign(input.style,{width:'100%',padding:'8px',border:'1px solid #555',borderRadius:'4px',background:'#1f1f1f',color:'#eee'});
                const actions=document.createElement('div'); actions.style.display='flex'; actions.style.justifyContent='flex-end'; actions.style.gap='8px'; actions.style.marginTop='12px';
                const cancel=document.createElement('button'); cancel.textContent='Cancel'; cancel.style.padding='6px 10px'; cancel.style.border='1px solid #555'; cancel.style.background='#3a3a3a'; cancel.style.color='#eee'; cancel.style.borderRadius='4px'; cancel.onclick=()=>{ document.body.removeChild(overlay); resolve(null); };
                const ok=document.createElement('button'); ok.textContent='Save'; ok.style.padding='6px 10px'; ok.style.border='1px solid #555'; ok.style.background='#2a2a2a'; ok.style.color='#eee'; ok.style.borderRadius='4px'; ok.onclick=()=>{ const v=(input.value||'').trim(); if(!v){ if (typeof window.showNotification==='function') window.showNotification('Please enter a name', 1200, 'warning'); return; } document.body.removeChild(overlay); resolve(v); };
                actions.appendChild(cancel); actions.appendChild(ok);
                box.appendChild(title); box.appendChild(input); box.appendChild(actions); overlay.appendChild(box); document.body.appendChild(overlay); input.focus(); input.select();
            });
        }

        Object.keys(grouped).forEach(group=>{
            const panel = groupToPanel[group]; if (!panel) return;
            const topBar=document.createElement('div'); topBar.style.position='sticky'; topBar.style.top='0'; topBar.style.background='#333'; topBar.style.zIndex='1'; topBar.style.display='flex'; topBar.style.justifyContent='space-between'; topBar.style.alignItems='center'; topBar.style.padding='6px 0 6px'; topBar.style.gap='8px';
            const activeBadge=document.createElement('span'); activeBadge.style.color='#9cd67b'; activeBadge.style.fontSize='12px'; activeBadge.textContent=''; panelActiveBadges[group]=activeBadge;
            const saveTab=document.createElement('button'); saveTab.textContent='Save'; saveTab.style.padding='6px 10px'; saveTab.style.border='1px solid #555'; saveTab.style.background='#2a2a2a'; saveTab.style.color='#eee'; saveTab.style.borderRadius='4px'; saveTab.style.cursor='pointer';
            topBar.appendChild(activeBadge); topBar.appendChild(saveTab); panel.appendChild(topBar);

            // Ensure Save works for all groups, including those that return early (e.g., Uploads)
            saveTab.onclick = async()=>{
                // Determine the canonical profile name to save into
                let saveName = me.admin ? 'admin' : currentActiveName;
                if (!me.admin && (!saveName || saveName.toLowerCase() === 'default')){
                    const newName = await promptForNewProfileName('my-profile');
                    if (!newName) return;
                    await api('/settings/profile',{method:'POST', body: JSON.stringify({name: newName, settings: (defaults.defaults||{})})});
                    await api('/settings/active',{method:'POST', body: JSON.stringify({name:newName})});
                    saveName = newName; currentActiveName = newName;
                    try { profiles = await api('/settings/profiles'); } catch(_){ }
                    try { effective = await api('/settings/effective'); } catch(_){ }
                    updateActiveUI();
                    if (typeof window.showNotification==='function') window.showNotification(`Activated profile: ${newName}`, 1200, 'success');
                }
                if (!saveName){ if (typeof window.showNotification==='function') window.showNotification('Select or create a profile in General first.', 1800, 'warning'); return; }
                let base={};
                try { const pr = await api('/settings/profile/'+encodeURIComponent(saveName)); base = pr.settings||{}; } catch(_){ base = {}; }
                // Merge both generic rows and any proxy fields used by custom UI sections
                const upd = collectSettings(panel);
                // Also pull from proxy fields to ensure values are captured without relying on autosave
                const proxyNodes = panel.querySelectorAll('[data-proxy-field]');
                for (const node of proxyNodes) {
                    const key = node.dataset.proxyField;
                    const def = defaults.defaults?.[key];
                    let val;
                    // Robust handling for JSON-like fields in textareas: do NOT fall back to defaults on parse error
                    if (typeof def === 'object' && (node.tagName === 'TEXTAREA' || node.type === 'text')) {
                        const raw = String(node.value || '').trim();
                        if (raw === '') {
                            // Empty → treat as empty container of the same kind
                            val = Array.isArray(def) ? [] : {};
                        } else {
                            try {
                                val = JSON.parse(raw);
                            } catch (e) {
                                // Abort save to avoid silently reverting to defaults
                                if (typeof window.showNotification === 'function') {
                                    window.showNotification(`Invalid JSON for ${key}. Please fix and try again.`, 2500, 'error');
                                }
                                return; // cancel entire save handler
                            }
                        }
                    } else {
                        val = parseValue(node, def);
                    }
                    if (typeof val !== 'undefined') upd[key] = val;
                }
                const merged = { ...base, ...upd };
                try {
                    await api('/settings/profile',{method:'POST', body: JSON.stringify({name: saveName, settings: merged})});
                    // Avoid extra network: locally reflect and notify listeners with delta
                    try { applyValuesToInputs({ ...((effective&&effective.settings)||{}), ...merged }); } catch(_){ }
                    try {
                        // Update any global cache listeners might use
                        if (typeof window !== 'undefined') { window.__wcsEffective = { ...(window.__wcsEffective||{}), ...merged }; }
                    } catch(_){ }
                    try { document.dispatchEvent(new CustomEvent('settings:updated', { detail: { settingsDelta: merged, group } })); } catch(_){ }
                    if (typeof window.showNotification==='function') window.showNotification(`Saved ${group} settings`, 1500, 'success');
                } catch (e) {
                    if (e && e.status === 403) {
                        const msg = (e.data && e.data.detail) ? e.data.detail : 'Permission denied';
                        if (typeof window.showNotification==='function') window.showNotification(msg, 2500, 'warning');
                        return;
                    }
                    const fallback = (e && (e.data && e.data.detail)) ? e.data.detail : (e && e.message) ? e.message : 'Failed to save settings';
                    if (typeof window.showNotification==='function') window.showNotification(fallback, 2000, 'error');
                    throw e;
                }
            };

            const card=document.createElement('div'); card.className='settings-card'; card.style.border='1px solid #444'; card.style.borderRadius='6px'; card.style.padding='10px'; card.style.margin='6px 0 10px';
            // Search below title area inside the panel (above group title)
            const searchRow=document.createElement('div'); searchRow.style.margin='0 0 8px';
            const searchInput=document.createElement('input'); searchInput.type='text'; searchInput.placeholder='Search parameters…'; Object.assign(searchInput.style,{ width:'100%', padding:'6px', border:'1px solid #555', borderRadius:'4px', background:'#1f1f1f', color:'#eee' });
            searchRow.appendChild(searchInput);
            const gh=document.createElement('div'); gh.textContent=group; gh.style.color='#ddd'; gh.style.fontWeight='600'; gh.style.marginBottom='6px';
            const groupDescriptions = {
                'Web/API':'Server/API settings like host, port, timeouts and export options.',
                'Paths':'Filesystem locations for data, uploads, PSF, and images.',
                'FITS/Tiles':'FITS display settings and tile generation parameters.',
                'WCS':'WCS overlay, label mode, catalog conversion, and matrix preferences.',
                'Algorithms':'Analysis/search configuration and percentiles thresholds.',
                'I/O':'Memory and disk I/O optimizations for large FITS files.',
                'Cache':'Caching and filter sets used across the app.',
                'RGB':'RGB figure/display configuration options.',
                'SED':'Spectral Energy Distribution plot and cutout settings.',
                'Misc':'Other parameters.'
            };
            const gdesc = document.createElement('div'); gdesc.textContent = groupDescriptions[group] || (group==='WCS' ? 'World Coordinate System behavior and catalog conversion.' : ''); gdesc.style.color='#9a9a9a'; gdesc.style.fontSize='12px'; gdesc.style.margin='0 0 8px';
            card.appendChild(searchRow);
            card.appendChild(gh);
            if (gdesc.textContent) card.appendChild(gdesc);

            // RGB Panel Designer (drag to reorder panes)
            if (group === 'RGB') {
                const designer=document.createElement('div');
                Object.assign(designer.style,{ border:'1px dashed #555', borderRadius:'6px', padding:'10px', margin:'6px 0 10px', background:'#2a2a2a' });
                const title=document.createElement('div'); title.textContent='Panel layout (drag to reorder)'; title.style.color='#fff'; title.style.fontWeight='600'; title.style.marginBottom='8px'; designer.appendChild(title);

                const hint=document.createElement('div'); hint.textContent='Order determines left-to-right display. Indices update automatically.'; hint.style.color='#bbb'; hint.style.fontSize='12px'; hint.style.marginBottom='8px'; designer.appendChild(hint);

                // Live preview (moved to top)
                const previewBox=document.createElement('div'); previewBox.style.margin='8px 0 12px';
                const previewTitle=document.createElement('div'); previewTitle.textContent='Live preview (layout only)'; previewTitle.style.color='#fff'; previewTitle.style.fontWeight='600'; previewTitle.style.margin='6px 0'; previewBox.appendChild(previewTitle);
                const canvas=document.createElement('canvas'); canvas.width=900; canvas.height=200; canvas.style.width='100%'; canvas.style.border='1px solid #444'; canvas.style.background='#1a1a1a'; previewBox.appendChild(canvas);
                designer.appendChild(previewBox);

                const grid=document.createElement('div');
                Object.assign(grid.style, {
                    display:'grid',
                    gridTemplateColumns:'repeat(4, minmax(0, 1fr))',
                    columnGap:'8px',
                    rowGap:'0'
                });

                const panelDefs=[
                    {label:'HST', field:'RGB_HST_PANEL_INDEX'},
                    {label:'NIRCam', field:'RGB_NIRCAM_PANEL_INDEX'},
                    {label:'MIRI', field:'RGB_MIRI_PANEL_INDEX'},
                    {label:'H-alpha', field:'RGB_HA_PANEL_INDEX'}
                ];

                // Helper to get current index from effective/defaults (no dependency on input order)
                function currentIndexFor(field){
                    const eff = (effective && effective.settings) ? effective.settings[field] : undefined;
                    if (eff !== undefined && eff !== null && !Number.isNaN(parseInt(eff,10))) return parseInt(eff,10);
                    const def = (defaults && defaults.defaults) ? defaults.defaults[field] : undefined;
                    if (def !== undefined && def !== null && !Number.isNaN(parseInt(def,10))) return parseInt(def,10);
                    const el = card.querySelector(`[data-field="${CSS.escape(field)}"]`);
                    if (el && !Number.isNaN(parseInt(el.value,10))) return parseInt(el.value,10);
                    return 0;
                }

                // Build item list sorted by current indices
                const items = panelDefs.map(pd=>({ ...pd, index: currentIndexFor(pd.field) }))
                                       .sort((a,b)=> a.index - b.index);

                // Debounce helper
                let _debounceTimer=null; const debounce=(fn,ms=350)=>{ clearTimeout(_debounceTimer); _debounceTimer=setTimeout(fn,ms); };

                // Save selected fields to current profile
                async function saveFields(names){
                    try {
                        let saveName = me.admin ? 'admin' : currentActiveName;
                        if (!me.admin && (!saveName || saveName.toLowerCase() === 'default')) {
                            const suggested = 'my-profile';
                            const newName = await promptForNewProfileName(suggested);
                            if (!newName) return; // user cancelled
                            await api('/settings/profile',{method:'POST', body: JSON.stringify({name: newName, settings: (defaults.defaults||{})})});
                            await api('/settings/active',{method:'POST', body: JSON.stringify({name:newName})});
                            currentActiveName = newName;
                            // no localStorage persistence for active profile
                            try { profiles = await api('/settings/profiles'); } catch(_){ }
                            try { effective = await api('/settings/effective'); } catch(_){ }
                            updateActiveUI();
                            if (typeof window.showNotification==='function') window.showNotification(`Activated profile: ${newName}`, 1200, 'success');
                            saveName = newName;
                        }
                        let base={};
                        try { const pr = await api('/settings/profile/'+encodeURIComponent(saveName)); base = pr.settings||{}; } catch(_){ base = {}; }
                        const payloadNames = [];
                        // Build a fast lookup for current order
                        const indexByField = {};
                        try { items.forEach((it, idx)=>{ indexByField[it.field] = idx; }); } catch(_){ }
                        names.forEach(n=>{
                            let val;
                                const def = defaults.defaults?.[n];
                            // 1) Order: compute from current in-memory order first
                            if (/_PANEL_INDEX$/.test(n) && indexByField[n] !== undefined) {
                                val = indexByField[n];
                            } else {
                                // 2) Prefer bound row input
                                const elRow = card.querySelector(`[data-field="${CSS.escape(n)}"]`);
                                if (elRow) {
                                    val = parseValue(elRow, def);
                                } else {
                                    // 3) Fallback to proxy input used in mini-editors
                                    const elProxy = card.querySelector(`[data-proxy-field="${CSS.escape(n)}"]`);
                                    if (elProxy) {
                                        val = parseValue(elProxy, def);
                                    }
                                }
                            }
                            if (val !== undefined) {
                                // Coerce numeric-like values
                                if (typeof def === 'number') {
                                    const num = Number(val);
                                    if (!Number.isNaN(num)) val = num;
                                }
                                base[n] = val;
                                payloadNames.push(`${n}=${val}`);
                            }
                        });
                        // Debug: log what we are saving
                        try { console.debug('[settings] saveFields', saveName, payloadNames.join(', ')); } catch(_){ }
                        await api('/settings/profile',{method:'POST', body: JSON.stringify({name: saveName, settings: base})});
                        try { effective = await api('/settings/effective'); } catch(_){ }
                        try { applyValuesToInputs((effective&&effective.settings)||{}); } catch(_){ }
                        // Re-fetch profile to confirm persistence and reflect values
                        try {
                            const prAfter = await api('/settings/profile/'+encodeURIComponent(saveName));
                            const saved = (prAfter && prAfter.settings) ? prAfter.settings : {};
                            names.forEach(n=>{
                                const v = saved[n];
                                if (v !== undefined) {
                                    const elRow = card.querySelector(`[data-field="${CSS.escape(n)}"]`);
                                    const elProxy = card.querySelector(`[data-proxy-field="${CSS.escape(n)}"]`);
                                    const writeVal = (typeof v === 'object') ? JSON.stringify(v, null, 2) : String(v);
                                    if (elRow) elRow.value = writeVal;
                                    if (elProxy) elProxy.value = writeVal;
                                    // If proxy is a color text paired with <input type=color>, update swatch
                                    if (elProxy && (n==='RGB_TITLE_COLOR' || n==='RGB_TITLE_BBOX_FACECOLOR')){
                                        try {
                                            const hx = typeof cssToHex==='function' ? cssToHex(writeVal) : null;
                                            const colorInput = elProxy.previousElementSibling && elProxy.previousElementSibling.type==='color' ? elProxy.previousElementSibling : null;
                                            if (colorInput && hx) colorInput.value = hx;
                                        } catch(_){ }
                                    }
                                }
                            });
                            try {
                                const friendly = names.map(n=>{
                                    const vv = saved[n];
                                    return `${n}=${(typeof vv==='object')?'(json)':String(vv)}`;
                                }).join(', ');
                                console.debug('[settings] confirmed save', saveName, friendly);
                            } catch(_){ }
                        } catch(_){ }
                        if (typeof window.showNotification==='function') window.showNotification('Saved RGB layout', 1000, 'success');
                        // Update preview after saving
                        try { renderPreview(); } catch(_){ }
                    } catch(e) {
                        const msg=(e && e.data && e.data.detail) ? e.data.detail : 'Failed to save RGB layout';
                        if (typeof window.showNotification==='function') window.showNotification(msg, 1500, 'error');
                    }
                }

                // Create small inline editor for label and percentiles
                function attachMiniEditors(pill, panel){
                    const row=document.createElement('div'); row.style.display='flex'; row.style.flexDirection='column'; row.style.gap='6px'; row.style.marginTop='6px';
                    // Short title input
                    const shortTitleMap={ 'HST':'RGB_HST_SHORT_TITLE', 'NIRCam':'RGB_NIRCAM_SHORT_TITLE', 'MIRI':'RGB_MIRI_SHORT_TITLE', 'H-alpha':'RGB_HA_SHORT_TITLE' };
                    const titleField=shortTitleMap[panel.label];
                    if (titleField){
                        const t=document.createElement('input'); t.type='text'; t.placeholder=panel.label+' title'; Object.assign(t.style,{ width:'100%', padding:'6px', border:'1px solid #555', borderRadius:'4px', background:'#1f1f1f', color:'#eee' });
                        const src=card.querySelector(`[data-field="${CSS.escape(titleField)}"]`);
                        const effV = (effective && effective.settings) ? effective.settings[titleField] : undefined;
                        const defV = (defaults && defaults.defaults) ? defaults.defaults[titleField] : undefined;
                        if (src) t.value = src.value; else if (effV!==undefined) t.value = effV; else if (defV!==undefined) t.value = defV; else t.value='';
                        // Tag as proxy for save fallback
                        t.dataset.proxyField = titleField;
                        // Update pill label text locally and live preview
                        t.addEventListener('input', ()=>{
                            if (src) src.value=t.value;
                            try {
                                // Update pill's visible text if it has a title node
                                const titleNode = pill.querySelector('.pill-title') || pill.firstChild;
                                if (titleNode && titleNode.nodeType === Node.TEXT_NODE) {
                                    titleNode.textContent = (t.value || panel.label);
                                } else if (titleNode && titleNode.textContent !== undefined) {
                                    titleNode.textContent = (t.value || panel.label);
                                }
                            } catch(_){ }
                            try{renderPreview();}catch(_){ }
                        });
                        row.appendChild(t);
                    }
                    // Percentile inputs per panel
                    const pctDefs={
                        'HST': ['RGB_DISPLAY_HST_MIN_PERCENTILE','RGB_DISPLAY_HST_FIRST_SOURCE_MAX_PERCENTILE'],
                        'NIRCam': ['RGB_DISPLAY_NIRCAM_MIN_PERCENTILE','RGB_DISPLAY_NIRCAM_MAX_PERCENTILE'],
                        'MIRI': ['RGB_DISPLAY_MIRI_MIN_PERCENTILE','RGB_DISPLAY_MIRI_MAX_PERCENTILE'],
                        'H-alpha': ['RGB_HA_PERCENTILE']
                    };
                    const fields=pctDefs[panel.label]||[];
                    if (fields.length){
                        const pctRow=document.createElement('div'); Object.assign(pctRow.style,{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:'8px' });
                        fields.forEach(fName=>{
                            const wrap=document.createElement('div'); wrap.style.display='flex'; wrap.style.flexDirection='column'; wrap.style.gap='4px'; wrap.style.minWidth='0';
                            const lab=document.createElement('div'); lab.style.color='#bbb'; lab.style.fontSize='11px';
                            lab.textContent = /min/i.test(fName) ? 'Min percentile' : (/max/i.test(fName) ? 'Max percentile' : 'Percentile');
                            const i=document.createElement('input'); i.type='number'; i.step='0.1'; i.min='0'; i.max='100'; Object.assign(i.style,{ width:'100%', padding:'4px', border:'1px solid #555', borderRadius:'4px', background:'#1f1f1f', color:'#eee', boxSizing:'border-box' });
                            const src=card.querySelector(`[data-field="${CSS.escape(fName)}"]`);
                            const effV = (effective && effective.settings) ? effective.settings[fName] : undefined;
                            const defV = (defaults && defaults.defaults) ? defaults.defaults[fName] : undefined;
                            if (src) i.value = src.value; else if (effV!==undefined) i.value = effV; else if (defV!==undefined) i.value = defV; else i.value='';
                            i.dataset.proxyField = fName;
                            i.addEventListener('input', ()=>{ if (src) src.value = i.value; /* no auto-save */ try{renderPreview();}catch(_){ } });
                            wrap.appendChild(lab); wrap.appendChild(i); pctRow.appendChild(wrap);
                        });
                        row.appendChild(pctRow);
                    }
                    // Inline H-alpha colormap + stretch under its pill
                    if (panel.label === 'H-alpha'){
                        const haRow=document.createElement('div'); Object.assign(haRow.style,{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', marginTop:'6px' });
                        // Colormap
                        const cmWrap=document.createElement('div'); cmWrap.style.display='flex'; cmWrap.style.flexDirection='column'; cmWrap.style.gap='4px'; cmWrap.style.minWidth='0';
                        const cmLab=document.createElement('div'); cmLab.textContent='colormap'; cmLab.style.color='#bbb'; cmLab.style.fontSize='11px'; cmWrap.appendChild(cmLab);
                        const combo=document.createElement('div'); Object.assign(combo.style,{ position:'relative' });
                        const btn=document.createElement('button'); btn.type='button';
                        const effC = (effective && effective.settings) ? effective.settings['RGB_HA_COLORMAP'] : undefined;
                        const defC = (defaults && defaults.defaults) ? defaults.defaults['RGB_HA_COLORMAP'] : undefined;
                        btn.textContent = (effC!==undefined? effC : (defC!==undefined? defC : 'gray'));
                        Object.assign(btn.style,{ width:'100%', textAlign:'left', padding:'4px 8px', border:'1px solid #555', borderRadius:'4px', background:'#1f1f1f', color:'#eee', cursor:'pointer', boxSizing:'border-box' });
                        const panelDD=document.createElement('div'); Object.assign(panelDD.style,{ position:'absolute', top:'calc(100% + 6px)', left:0, minWidth:'220px', maxHeight:'220px', overflow:'auto', background:'#2a2a2a', border:'1px solid #555', borderRadius:'6px', padding:'8px', zIndex:'4000', display:'none' });
                        const search=document.createElement('input'); search.type='text'; search.placeholder='Search…'; Object.assign(search.style,{ width:'100%', padding:'6px', border:'1px solid #555', borderRadius:'4px', background:'#1f1f1f', color:'#eee', marginBottom:'6px' });
                        const list=document.createElement('div');
                        const cmaps=['gray','viridis','plasma','inferno','magma','cividis','Greys','Purples','Blues','Greens','Oranges','Reds','YlOrBr','YlOrRd','OrRd','PuRd','RdPu','BuPu','GnBu','PuBu','YlGnBu','PuBuGn','BuGn','YlGn','binary','gist_yarg','gist_gray','bone','pink','spring','summer','autumn','winter','cool','Wistia','hot','afmhot','gist_heat','copper','terrain','ocean','gist_earth','gist_stern','brg','CMRmap','cubehelix','gnuplot','gnuplot2','jet','nipy_spectral','prism','flag'];
                        function renderC(q){ list.innerHTML=''; const qq=(q||'').toLowerCase(); cmaps.filter(c=>!qq||c.toLowerCase().includes(qq)).forEach(c=>{ const item=document.createElement('div'); item.textContent=c; Object.assign(item.style,{ padding:'6px 8px', borderRadius:'4px', cursor:'pointer' }); item.addEventListener('mouseenter',()=>item.style.background='#3a3a3a'); item.addEventListener('mouseleave',()=>item.style.background=''); item.addEventListener('click',()=>{ btn.textContent=c; hidden.value=c; panelDD.style.display='none'; /* no auto-save */ try{renderPreview();}catch(_){ } }); list.appendChild(item); }); }
                        renderC(''); search.addEventListener('input', ()=>renderC(search.value));
                        panelDD.appendChild(search); panelDD.appendChild(list);
                        combo.appendChild(btn); combo.appendChild(panelDD);
                        btn.addEventListener('click',(e)=>{ e.stopPropagation(); panelDD.style.display = (panelDD.style.display==='none'?'block':'none'); if (panelDD.style.display==='block'){ search.focus(); search.select(); }});
                        document.addEventListener('click',(e)=>{ if (!combo.contains(e.target)) panelDD.style.display='none'; });
                        const hidden=document.createElement('input'); hidden.type='hidden'; hidden.dataset.proxyField='RGB_HA_COLORMAP'; hidden.value=(effC!==undefined?effC:(defC!==undefined?defC:'gray'));
                        cmWrap.appendChild(combo); cmWrap.appendChild(hidden);
                        // Stretch
                        const stWrap=document.createElement('div'); stWrap.style.display='flex'; stWrap.style.flexDirection='column'; stWrap.style.gap='4px'; stWrap.style.minWidth='0';
                        const stLab=document.createElement('div'); stLab.textContent='Stretch'; stLab.style.color='#bbb'; stLab.style.fontSize='11px'; stWrap.appendChild(stLab);
                        const stSel=document.createElement('select'); ['linear','log'].forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent=v; stSel.appendChild(o); });
                        const effS = (effective && effective.settings) ? effective.settings['RGB_HA_STRETCH'] : undefined;
                        const defS = (defaults && defaults.defaults) ? defaults.defaults['RGB_HA_STRETCH'] : undefined;
                        stSel.value = (effS!==undefined? effS : (defS!==undefined? defS : 'linear'));
                        stSel.dataset.proxyField='RGB_HA_STRETCH';
                        stSel.addEventListener('change', ()=> { /* no auto-save */ try{renderPreview();}catch(_){ } });
                        Object.assign(stSel.style,{ width:'100%', padding:'4px', border:'1px solid #555', borderRadius:'4px', background:'#1f1f1f', color:'#eee', boxSizing:'border-box' });
                        stWrap.appendChild(stSel);
                        haRow.appendChild(cmWrap); haRow.appendChild(stWrap);
                        row.appendChild(haRow);
                    }
                    pill.appendChild(row);
                }

                function renderGrid(){
                    grid.innerHTML='';
                    items.forEach((it, idx)=>{
                        const pill=document.createElement('div');
                        Object.assign(pill.style,{
                            padding:'4px 6px', background:'#333', color:'#eee', border:'1px solid #555', borderRadius:'6px', cursor:'grab', userSelect:'none',
                            textAlign:'center', boxSizing:'border-box', overflow:'hidden'
                        });
                        pill.draggable=true; pill.dataset.field = it.field; pill.dataset.label = it.label;
                        // Title span to update dynamically
                        const titleSpan=document.createElement('div'); titleSpan.className='rgb-pill-title'; titleSpan.textContent = `${idx+1}. ${it.label}`; titleSpan.style.fontWeight='600'; titleSpan.style.fontSize='11px';
                        pill.appendChild(titleSpan);
                        attachMiniEditors(pill, it);
                        pill.addEventListener('dragstart', e=>{ e.dataTransfer.setData('text/plain', it.field); e.dataTransfer.effectAllowed='move'; });
                        pill.addEventListener('dragover', e=>{ e.preventDefault(); e.dataTransfer.dropEffect='move'; pill.style.borderColor='#999'; });
                        pill.addEventListener('dragleave', ()=>{ pill.style.borderColor='#555'; });
                        pill.addEventListener('drop', e=>{
                            e.preventDefault(); pill.style.borderColor='#555';
                            const srcField = e.dataTransfer.getData('text/plain');
                            const fromIdx = items.findIndex(x=>x.field===srcField);
                            const toIdx = items.findIndex(x=>x.field===it.field);
                            if (fromIdx>=0 && toIdx>=0 && fromIdx!==toIdx){
                                const moved = items.splice(fromIdx,1)[0];
                                items.splice(toIdx,0,moved);
                                updateIndices();
                                renderGrid();
                                // Auto-save indices when reordered
                                saveFields(panelDefs.map(p=>p.field));
                                try{renderPreview();}catch(_){ }
                            }
                        });
                        grid.appendChild(pill);
                    });
                }

                function updateIndices(){
                    items.forEach((it, newIdx)=>{
                        it.index = newIdx;
                        // Update corresponding inputs within this card
                        const input = card.querySelector(`[data-field="${CSS.escape(it.field)}"]`);
                        if (input) input.value = String(newIdx);
                    });
                }

                renderGrid();
                designer.appendChild(grid);

                // Inline RGB marker properties editor
                const markerBox=document.createElement('div'); Object.assign(markerBox.style,{ borderTop:'1px solid #444', marginTop:'10px', paddingTop:'10px' });
                const markerTitle=document.createElement('div'); markerTitle.textContent='Marker properties'; markerTitle.style.color='#fff'; markerTitle.style.fontWeight='600'; markerTitle.style.marginBottom='6px'; markerBox.appendChild(markerTitle);
                const markerRow=document.createElement('div'); Object.assign(markerRow.style,{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', columnGap:'12px', rowGap:'8px' });
                function makeLabeled(labelText, el){ const w=document.createElement('div'); w.className='settings-field'; const lab=document.createElement('div'); lab.className='settings-label'; lab.textContent=labelText; w.appendChild(lab); w.appendChild(el); return w; }
                function makeNum(name, width){
                    const i=document.createElement('input'); i.type='number'; i.step='0.1'; i.style.width=width; Object.assign(i.style,{ padding:'6px', border:'1px solid #555', borderRadius:'4px', background:'#1f1f1f', color:'#eee' });
                    const effV = (effective && effective.settings) ? effective.settings[name] : undefined;
                    const defV = (defaults && defaults.defaults) ? defaults.defaults[name] : undefined;
                    i.value = (effV!==undefined? effV : (defV!==undefined? defV : ''));
                    i.dataset.proxyField = name;
                    i.addEventListener('input', ()=> { /* no auto-save */ try{renderPreview();}catch(_){ } });
                    return i;
                }
                function makeSelectSymbol(){
                    const select = document.createElement('select');
                    const opts = [
                        {v:'o', l:'Circle ○'}, {v:'s', l:'Square ■'}, {v:'^', l:'Triangle ▲'}, {v:'v', l:'Triangle ▼'},
                        {v:'+', l:'Plus +'}, {v:'x', l:'X ✕'}, {v:'*', l:'Star ✦'}, {v:'D', l:'Diamond ◆'}, {v:'.', l:'Point ·'}, {v:'p', l:'Pentagon ⬟'}
                    ];
                    opts.forEach(o=>{ const opt=document.createElement('option'); opt.value=o.v; opt.textContent=o.l; select.appendChild(opt); });
                    const effV = (effective && effective.settings) ? effective.settings['RGB_MARKER_SYMBOL'] : undefined;
                    const defV = (defaults && defaults.defaults) ? defaults.defaults['RGB_MARKER_SYMBOL'] : undefined;
                    select.value = (effV!==undefined? effV : (defV!==undefined? defV : 'o'));
                    select.dataset.proxyField = 'RGB_MARKER_SYMBOL';
                    select.addEventListener('change', ()=> { /* no auto-save */ try{renderPreview();}catch(_){ } });
                    Object.assign(select.style,{ minWidth:'160px', padding:'6px', border:'1px solid #555', borderRadius:'4px', background:'#1f1f1f', color:'#eee' });
                    return select;
                }
                const sizeInput = makeNum('RGB_MARKER_SIZE','110px');
                const alphaInput = makeNum('RGB_MARKER_ALPHA','110px');
                const edgeInput = makeNum('RGB_MARKER_EDGE_WIDTH','140px');
                const symSelect = makeSelectSymbol();
                // Marker face color (including 'none')
                const faceWrap = document.createElement('div'); faceWrap.className='settings-field';
                const faceLab = document.createElement('div'); faceLab.className='settings-label'; faceLab.textContent='Face color'; faceWrap.appendChild(faceLab);
                const faceColor=document.createElement('input'); faceColor.type='color'; Object.assign(faceColor.style,{ width:'44px', height:'32px', padding:'0', border:'1px solid #555', borderRadius:'4px', background:'#1f1f1f' });
                const faceText=document.createElement('input'); faceText.type='text'; Object.assign(faceText.style,{ width:'160px', padding:'6px', border:'1px solid #555', borderRadius:'4px', background:'#1f1f1f', color:'#eee' });
                const effFace = (effective && effective.settings) ? effective.settings['RGB_MARKER_FACE_COLOR'] : undefined;
                const defFace = (defaults && defaults.defaults) ? defaults.defaults['RGB_MARKER_FACE_COLOR'] : undefined;
                const initFace = (effFace!==undefined? effFace : (defFace!==undefined? defFace : 'none'));
                faceText.value = initFace;
                try { const hx = cssToHex(initFace); if (hx) faceColor.value = hx; } catch(_){ }
                faceText.dataset.proxyField='RGB_MARKER_FACE_COLOR';
                faceColor.addEventListener('input', ()=>{ faceText.value = faceColor.value; /* no auto-save */ try{renderPreview();}catch(_){ } });
                faceText.addEventListener('input', ()=>{ try{ const hx = cssToHex(faceText.value); if (hx) faceColor.value=hx; }catch(_){ } /* no auto-save */ try{renderPreview();}catch(_){ } });
                faceWrap.appendChild(faceColor); faceWrap.appendChild(faceText);
                // Marker edge color
                const edgeColorWrap = document.createElement('div'); edgeColorWrap.className='settings-field';
                const edgeColorLab = document.createElement('div'); edgeColorLab.className='settings-label'; edgeColorLab.textContent='Edge color'; edgeColorWrap.appendChild(edgeColorLab);
                const edgeColorInput=document.createElement('input'); edgeColorInput.type='color'; Object.assign(edgeColorInput.style,{ width:'44px', height:'32px', padding:'0', border:'1px solid #555', borderRadius:'4px', background:'#1f1f1f' });
                const edgeColorText=document.createElement('input'); edgeColorText.type='text'; Object.assign(edgeColorText.style,{ width:'160px', padding:'6px', border:'1px solid #555', borderRadius:'4px', background:'#1f1f1f', color:'#eee' });
                const effEdgeC = (effective && effective.settings) ? effective.settings['RGB_MARKER_EDGE_COLOR'] : undefined;
                const defEdgeC = (defaults && defaults.defaults) ? defaults.defaults['RGB_MARKER_EDGE_COLOR'] : undefined;
                const initEdgeC = (effEdgeC!==undefined? effEdgeC : (defEdgeC!==undefined? defEdgeC : '#ffcc00'));
                edgeColorText.value = initEdgeC;
                try { const hx = cssToHex(initEdgeC); if (hx) edgeColorInput.value = hx; } catch(_){ }
                edgeColorText.dataset.proxyField='RGB_MARKER_EDGE_COLOR';
                edgeColorInput.addEventListener('input', ()=>{ edgeColorText.value = edgeColorInput.value; /* no auto-save */ try{renderPreview();}catch(_){ } });
                edgeColorText.addEventListener('input', ()=>{ try{ const hx = cssToHex(edgeColorText.value); if (hx) edgeColorInput.value=hx; }catch(_){ } /* no auto-save */ try{renderPreview();}catch(_){ } });
                edgeColorWrap.appendChild(edgeColorInput); edgeColorWrap.appendChild(edgeColorText);
                markerRow.appendChild(makeLabeled('Symbol', symSelect));
                markerRow.appendChild(makeLabeled('Size (arcsec)', sizeInput));
                markerRow.appendChild(makeLabeled('Alpha', alphaInput));
                markerRow.appendChild(makeLabeled('Edge width', edgeInput));
                markerRow.appendChild(faceWrap);
                markerRow.appendChild(edgeColorWrap);
                markerBox.appendChild(markerRow);

                // Figure size controls
                const figBox=document.createElement('div'); figBox.style.marginTop='10px';
                const figTitle=document.createElement('div'); figTitle.textContent='Figure size'; figTitle.style.color='#fff'; figTitle.style.fontWeight='600'; figTitle.style.margin='6px 0'; figBox.appendChild(figTitle);
                const figRow=document.createElement('div'); Object.assign(figRow.style,{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', columnGap:'12px', rowGap:'8px' });
                const figW = makeNum('RGB_FIGURE_WIDTH','120px');
                const figH = makeNum('RGB_FIGURE_HEIGHT','120px');
                figRow.appendChild(makeLabeled('Width', figW));
                figRow.appendChild(makeLabeled('Height', figH));
                figBox.appendChild(figRow);

                // Title style controls
                const titleBox=document.createElement('div'); titleBox.style.marginTop='10px';
                const titleStyle=document.createElement('div'); titleStyle.textContent='Title style'; titleStyle.style.color='#fff'; titleStyle.style.fontWeight='600'; titleStyle.style.margin='6px 0'; titleBox.appendChild(titleStyle);
                const tsRow=document.createElement('div'); Object.assign(tsRow.style,{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', columnGap:'12px', rowGap:'8px' });
                function makeColorField(name, label){
                    const wrap=document.createElement('div'); wrap.className='settings-field';
                    const lab=document.createElement('div'); lab.className='settings-label'; lab.textContent=label; wrap.appendChild(lab);
                    const color=document.createElement('input'); color.type='color'; Object.assign(color.style,{ width:'44px', height:'32px', padding:'0', border:'1px solid #555', borderRadius:'4px', background:'#1f1f1f' });
                    const text=document.createElement('input'); text.type='text'; Object.assign(text.style,{ width:'160px', padding:'6px', border:'1px solid #555', borderRadius:'4px', background:'#1f1f1f', color:'#eee' });
                    const effV = (effective && effective.settings) ? effective.settings[name] : undefined;
                    const defV = (defaults && defaults.defaults) ? defaults.defaults[name] : undefined;
                    const init = (effV!==undefined? effV : (defV!==undefined? defV : '#ffffff'));
                    const initHex = (typeof cssToHex==='function' ? (cssToHex(init) || '#ffffff') : '#ffffff');
                    text.value = init;
                    try { color.value = initHex; } catch(_){ color.value = '#ffffff'; }
                    text.dataset.proxyField = name;
                    color.addEventListener('input', ()=>{ text.value = color.value; /* no auto-save */ try{renderPreview();}catch(_){ } });
                    text.addEventListener('input', ()=>{ try{ const hx = cssToHex(text.value); if (hx) color.value = hx; }catch(_){ } /* no auto-save */ try{renderPreview();}catch(_){ } });
                    wrap.appendChild(color); wrap.appendChild(text);
                    return wrap;
                }
                const titleColorField = makeColorField('RGB_TITLE_COLOR','Title color');
                const bboxFaceField = makeColorField('RGB_TITLE_BBOX_FACECOLOR','Bbox face');
                const fontSizeInput = makeNum('RGB_TITLE_FONT_SIZE','110px');
                const weightSelect=document.createElement('select'); ['normal','bold','bolder','lighter','100','200','300','400','500','600','700','800','900'].forEach(v=>{ const opt=document.createElement('option'); opt.value=v; opt.textContent=v; weightSelect.appendChild(opt); });
                const effW = (effective && effective.settings) ? effective.settings['RGB_TITLE_FONT_WEIGHT'] : undefined;
                const defW = (defaults && defaults.defaults) ? defaults.defaults['RGB_TITLE_FONT_WEIGHT'] : undefined;
                weightSelect.value = (effW!==undefined? effW : (defW!==undefined? defW : 'bold'));
                weightSelect.dataset.proxyField='RGB_TITLE_FONT_WEIGHT';
                weightSelect.addEventListener('change', ()=> { /* no auto-save */ try{renderPreview();}catch(_){ } });
                Object.assign(weightSelect.style,{ minWidth:'140px', padding:'6px', border:'1px solid #555', borderRadius:'4px', background:'#1f1f1f', color:'#eee' });
                const posRow=document.createElement('div'); Object.assign(posRow.style,{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', columnGap:'12px', rowGap:'8px', marginTop:'6px' });
                const posX = makeNum('RGB_TITLE_X_POSITION','120px');
                const posY = makeNum('RGB_TITLE_Y_POSITION','120px');
                tsRow.appendChild(titleColorField);
                tsRow.appendChild(bboxFaceField);
                tsRow.appendChild(makeLabeled('Font size', fontSizeInput));
                tsRow.appendChild(makeLabeled('Weight', weightSelect));
                posRow.appendChild(makeLabeled('Pos X', posX));
                posRow.appendChild(makeLabeled('Pos Y', posY));
                titleBox.appendChild(tsRow);
                titleBox.appendChild(posRow);

                // Cutout size control
                const cutoutBox=document.createElement('div'); cutoutBox.style.marginTop='10px';
                const cutoutTitle=document.createElement('div'); cutoutTitle.textContent='Cutout size'; cutoutTitle.style.color='#fff'; cutoutTitle.style.fontWeight='600'; cutoutTitle.style.margin='6px 0'; cutoutBox.appendChild(cutoutTitle);
                const cutoutRow=document.createElement('div'); Object.assign(cutoutRow.style,{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', columnGap:'12px', rowGap:'8px' });
                const cutoutSize = makeNum('CUTOUT_SIZE_ARCSEC','140px');
                cutoutRow.appendChild(makeLabeled('Size (arcsec)', cutoutSize));
                cutoutBox.appendChild(cutoutRow);

                // H-alpha colormap selector (matplotlib colormaps)
                const cmapBox=document.createElement('div'); cmapBox.style.marginTop='10px';
                const cmapTitle=document.createElement('div'); cmapTitle.textContent='colormap'; cmapTitle.style.color='#fff'; cmapTitle.style.fontWeight='600'; cmapTitle.style.margin='6px 0'; cmapBox.appendChild(cmapTitle);
                const cmaps = [
                    'gray','viridis','plasma','inferno','magma','cividis','Greys','Purples','Blues','Greens','Oranges','Reds','YlOrBr','YlOrRd','OrRd','PuRd','RdPu','BuPu','GnBu','PuBu','YlGnBu','PuBuGn','BuGn','YlGn',
                    'binary','gist_yarg','gist_gray','bone','pink','spring','summer','autumn','winter','cool','Wistia','hot','afmhot','gist_heat','copper',
                    'terrain','ocean','gist_earth','gist_stern','brg','CMRmap','cubehelix','gnuplot','gnuplot2','jet','nipy_spectral','prism','flag'
                ];
                const effC = (effective && effective.settings) ? effective.settings['RGB_HA_COLORMAP'] : undefined;
                const defC = (defaults && defaults.defaults) ? defaults.defaults['RGB_HA_COLORMAP'] : undefined;
                const initialCmap = (effC!==undefined? effC : (defC!==undefined? defC : 'gray'));
                // Hidden proxy to integrate with saveFields
                const cmapHidden=document.createElement('input'); cmapHidden.type='hidden'; cmapHidden.dataset.proxyField='RGB_HA_COLORMAP'; cmapHidden.value=initialCmap;
                // Custom searchable dropdown
                const combo=document.createElement('div'); Object.assign(combo.style,{ position:'relative', display:'inline-block' });
                const comboBtn=document.createElement('button');
                comboBtn.type='button';
                comboBtn.textContent = initialCmap;
                Object.assign(comboBtn.style,{ minWidth:'240px', textAlign:'left', padding:'6px 10px', border:'1px solid #555', borderRadius:'4px', background:'#1f1f1f', color:'#eee', cursor:'pointer' });
                const cmapPanel=document.createElement('div');
                Object.assign(cmapPanel.style,{ position:'absolute', top:'calc(100% + 6px)', left:0, minWidth:'280px', maxHeight:'280px', overflow:'auto', background:'#2a2a2a', border:'1px solid #555', borderRadius:'6px', padding:'8px', zIndex:'4000', display:'none', boxShadow:'0 10px 30px rgba(0,0,0,0.4)' });
                const search=document.createElement('input');
                search.type='text'; search.placeholder='Search…';
                Object.assign(search.style,{ width:'100%', padding:'6px', border:'1px solid #555', borderRadius:'4px', background:'#1f1f1f', color:'#eee', marginBottom:'8px' });
                const list=document.createElement('div');
                function renderList(filter){
                    list.innerHTML='';
                    const q = (filter||'').toLowerCase();
                    cmaps.filter(c=> !q || c.toLowerCase().includes(q)).forEach(c=>{
                        const item=document.createElement('div');
                        item.textContent=c; Object.assign(item.style,{ padding:'6px 8px', borderRadius:'4px', cursor:'pointer' });
                        item.addEventListener('mouseenter', ()=> item.style.background='#3a3a3a');
                        item.addEventListener('mouseleave', ()=> item.style.background='');
                        item.addEventListener('click', ()=>{
                            comboBtn.textContent = c;
                            cmapHidden.value = c;
                            cmapPanel.style.display='none';
                            debounce(()=>saveFields(['RGB_HA_COLORMAP']));
                            try{renderPreview();}catch(_){ }
                        });
                        list.appendChild(item);
                    });
                }
                renderList('');
                search.addEventListener('input', ()=> renderList(search.value));
                cmapPanel.appendChild(search); cmapPanel.appendChild(list);
                combo.appendChild(comboBtn); combo.appendChild(cmapPanel); combo.appendChild(cmapHidden);
                comboBtn.addEventListener('click', (e)=>{ e.stopPropagation(); cmapPanel.style.display = (cmapPanel.style.display==='none'?'block':'none'); if (cmapPanel.style.display==='block'){ search.focus(); search.select(); } });
                document.addEventListener('click', (e)=>{ if (!combo.contains(e.target)) cmapPanel.style.display='none'; });
                const cmapRow=document.createElement('div'); cmapRow.appendChild(makeLabeled('Colormap', combo));

                // H-alpha stretch
                const stretchRow=document.createElement('div'); stretchRow.style.marginTop='8px';
                const stretchSel=document.createElement('select'); ['linear','log'].forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent=v; stretchSel.appendChild(o); });
                const effS = (effective && effective.settings) ? effective.settings['RGB_HA_STRETCH'] : undefined;
                const defS = (defaults && defaults.defaults) ? defaults.defaults['RGB_HA_STRETCH'] : undefined;
                stretchSel.value = (effS!==undefined? effS : (defS!==undefined? defS : 'linear'));
                stretchSel.dataset.proxyField='RGB_HA_STRETCH';
                stretchSel.addEventListener('change', ()=> { debounce(()=>saveFields(['RGB_HA_STRETCH'])); try{renderPreview();}catch(_){ } });
                Object.assign(stretchSel.style,{ minWidth:'160px', padding:'6px', border:'1px solid #555', borderRadius:'4px', background:'#1f1f1f', color:'#eee' });
                stretchRow.appendChild(makeLabeled('Stretch', stretchSel));

                cmapBox.appendChild(cmapRow);
                cmapBox.appendChild(stretchRow);

                // Filters editor (multiline)
                const filtersBox=document.createElement('div'); filtersBox.style.marginTop='10px';
                const filtersTitle=document.createElement('div'); filtersTitle.textContent='Filters (JSON)'; filtersTitle.style.color='#fff'; filtersTitle.style.fontWeight='600'; filtersTitle.style.margin='6px 0'; filtersBox.appendChild(filtersTitle);
                const filtersArea=document.createElement('textarea');
                Object.assign(filtersArea.style,{ width:'100%', height:'160px', padding:'8px', border:'1px solid #555', borderRadius:'4px', background:'#1f1f1f', color:'#eee', fontFamily:'monospace', whiteSpace:'pre' });
                const effF = (effective && effective.settings) ? effective.settings['RGB_FILTERS'] : undefined;
                const defF = (defaults && defaults.defaults) ? defaults.defaults['RGB_FILTERS'] : undefined;
                try { filtersArea.value = JSON.stringify((effF!==undefined? effF : (defF!==undefined? defF : {})), null, 2); } catch(_){ filtersArea.value='{}'; }
                filtersArea.dataset.proxyField='RGB_FILTERS';
                // No auto-save for Filters (JSON); rely on Save button
                // filtersArea.addEventListener('input', ()=> debounce(()=>saveFields(['RGB_FILTERS'])) );
                filtersBox.appendChild(filtersArea);

                function renderPreview(){
                    const ctx=canvas.getContext('2d'); if (!ctx) return;
                    ctx.clearRect(0,0,canvas.width,canvas.height);
                    // Read current settings
                    const order = items.map(it=>it.label);
                    const panelTitles = {
                        'HST': (card.querySelector('[data-proxy-field="RGB_HST_SHORT_TITLE"]')||{}).value || 'HST',
                        'NIRCam': (card.querySelector('[data-proxy-field="RGB_NIRCAM_SHORT_TITLE"]')||{}).value || 'NIRCam',
                        'MIRI': (card.querySelector('[data-proxy-field="RGB_MIRI_SHORT_TITLE"]')||{}).value || 'MIRI',
                        'H-alpha': (card.querySelector('[data-proxy-field="RGB_HA_SHORT_TITLE"]')||{}).value || 'H-alpha'
                    };
                    const titleColor = (card.querySelector('[data-proxy-field="RGB_TITLE_COLOR"]')||{}).value || '#ffffff';
                    const bboxFace = (card.querySelector('[data-proxy-field="RGB_TITLE_BBOX_FACECOLOR"]')||{}).value || 'black';
                    const fontSize = Number((card.querySelector('[data-proxy-field="RGB_TITLE_FONT_SIZE"]')||{}).value || 11);
                    const fontWeight = (card.querySelector('[data-proxy-field="RGB_TITLE_FONT_WEIGHT"]')||{}).value || 'bold';
                    // Read Pos X/Y and map into [0,1]
                    const posXVal = Number((card.querySelector('[data-proxy-field="RGB_TITLE_X_POSITION"]')||{}).value ?? 0.97);
                    const posYVal = Number((card.querySelector('[data-proxy-field="RGB_TITLE_Y_POSITION"]')||{}).value ?? 0.06);
                    const markerSym = (card.querySelector('[data-proxy-field="RGB_MARKER_SYMBOL"]')||{}).value || 'o';
                    // Convert arcsec to a visible demo radius in px. Assume ~0.2"/px nominal scale for preview.
                    const markerArcsec = Number((card.querySelector('[data-proxy-field="RGB_MARKER_SIZE"]')||{}).value || 10);
                    const previewArcsecPerPixel = 0.2; // adjustable preview-only scaling
                    const markerSize = Math.max(2, markerArcsec / previewArcsecPerPixel);
                    const edgeColor = (card.querySelector('[data-proxy-field="RGB_MARKER_EDGE_COLOR"]')||{}).value || '#ffcc00';
                    const edgeWidth = Number((card.querySelector('[data-proxy-field="RGB_MARKER_EDGE_WIDTH"]')||{}).value || 1.5);
                    const markerAlpha = Number((card.querySelector('[data-proxy-field="RGB_MARKER_ALPHA"]')||{}).value || 0.8);

                    const W = canvas.width, H = canvas.height;
                    const cols = 4; const pad = 6; const panelW = Math.floor((W - pad*(cols+1))/cols); const panelH = H - pad*2;
                    ctx.font = `${fontWeight} ${fontSize}px sans-serif`;
                    order.forEach((label, i)=>{
                        const x = pad + i*(panelW+pad); const y = pad;
                        // panel bg
                        ctx.fillStyle = '#222'; ctx.fillRect(x, y, panelW, panelH);
                        // dummy gradient content
                        const grad = ctx.createLinearGradient(x, y, x+panelW, y+panelH);
                        grad.addColorStop(0, '#2e2e2e'); grad.addColorStop(1, '#3a3a3a');
                        ctx.fillStyle = grad; ctx.fillRect(x+2, y+2, panelW-4, panelH-4);
                        // title position from Pos X/Y (ha='right', va='top')
                        const clamp01 = v => Math.max(0, Math.min(1, Number(v)||0));
                        const vX = clamp01(posXVal);
                        const vY = clamp01(posYVal);
                        const tx = x + vX * panelW; // rightwards increases with x
                        // In Matplotlib, axes coords have origin at bottom; canvas origin is top.
                        // So invert Y for canvas: y_top = y + (1 - vY) * panelH
                        const ty = y + (1 - vY) * panelH;
                        const t = panelTitles[label] || label;
                        const textW = ctx.measureText(t).width; const textH = fontSize + 6;
                        // Small padding inside panel
                        const padX = 6, padY = 6;
                        const drawTx = Math.min(x + panelW - padX, Math.max(x + padX, tx));
                        const drawTy = Math.min(y + panelH - padY - textH, Math.max(y + padY, ty));
                        ctx.fillStyle = bboxFace; ctx.fillRect(drawTx - (textW + 8), drawTy, (textW + 8), textH);
                        ctx.fillStyle = titleColor; ctx.textAlign='right'; ctx.textBaseline='top'; ctx.fillText(t, drawTx - 4, drawTy + 2);
                        // marker (center)
                        const mx = x + panelW/2; const my = y + panelH/2;
                        const face = (card.querySelector('[data-proxy-field="RGB_MARKER_FACE_COLOR"]')||{}).value || 'none';
                        const isNone = (face||'').toLowerCase()==='none';
                        ctx.globalAlpha = isNone ? markerAlpha : markerAlpha;
                        ctx.lineWidth = edgeWidth;
                        ctx.strokeStyle = edgeColor;
                        ctx.fillStyle = isNone ? 'transparent' : face;
                        if (markerSym === 'o'){
                            ctx.beginPath(); ctx.arc(mx, my, markerSize/2, 0, Math.PI*2);
                            if (!isNone) ctx.fill(); ctx.stroke();
                        } else if (markerSym === '+'){
                            ctx.beginPath(); ctx.moveTo(mx-markerSize/2, my); ctx.lineTo(mx+markerSize/2, my); ctx.moveTo(mx, my-markerSize/2); ctx.lineTo(mx, my+markerSize/2); ctx.stroke();
                        } else if (markerSym === 'x'){
                            ctx.beginPath(); ctx.moveTo(mx-markerSize/2, my-markerSize/2); ctx.lineTo(mx+markerSize/2, my+markerSize/2); ctx.moveTo(mx+markerSize/2, my-markerSize/2); ctx.lineTo(mx-markerSize/2, my+markerSize/2); ctx.stroke();
                        } else if (markerSym === 's'){
                            const half = markerSize/2; const size = Math.max(2, markerSize);
                            if (!isNone){ ctx.fillStyle = face; ctx.fillRect(mx-half, my-half, size, size); }
                            ctx.strokeRect(mx-half, my-half, size, size);
                        } else if (markerSym === '^' || markerSym === 'v'){
                            const half = markerSize/2; const h = Math.max(4, markerSize);
                            ctx.beginPath();
                            if (markerSym === '^'){
                                ctx.moveTo(mx, my - half);
                                ctx.lineTo(mx - half, my + half);
                                ctx.lineTo(mx + half, my + half);
                            } else {
                                ctx.moveTo(mx, my + half);
                                ctx.lineTo(mx - half, my - half);
                                ctx.lineTo(mx + half, my - half);
                            }
                            ctx.closePath();
                            if (!isNone) ctx.fill(); ctx.stroke();
                        } else if (markerSym === 'D'){
                            const half = markerSize/2;
                            ctx.beginPath();
                            ctx.moveTo(mx, my - half);
                            ctx.lineTo(mx + half, my);
                            ctx.lineTo(mx, my + half);
                            ctx.lineTo(mx - half, my);
                            ctx.closePath();
                            if (!isNone) ctx.fill(); ctx.stroke();
                        } else if (markerSym === '*'){
                            // Approximate star as plus + x
                            ctx.beginPath(); ctx.moveTo(mx-markerSize/2, my); ctx.lineTo(mx+markerSize/2, my); ctx.moveTo(mx, my-markerSize/2); ctx.lineTo(mx, my+markerSize/2); ctx.stroke();
                            ctx.beginPath(); ctx.moveTo(mx-markerSize/2, my-markerSize/2); ctx.lineTo(mx+markerSize/2, my+markerSize/2); ctx.moveTo(mx+markerSize/2, my-markerSize/2); ctx.lineTo(mx-markerSize/2, my+markerSize/2); ctx.stroke();
                        } else if (markerSym === '.'){
                            ctx.beginPath(); ctx.arc(mx, my, Math.max(1.5, markerSize/6), 0, Math.PI*2);
                            ctx.fillStyle = isNone ? edgeColor : face; ctx.fill();
                        } else if (markerSym === 'p'){
                            // Regular pentagon
                            const R = markerSize/2; const n=5;
                            ctx.beginPath();
                            for (let k=0;k<n;k++){
                                const ang = -Math.PI/2 + k*(2*Math.PI/n);
                                const px = mx + R*Math.cos(ang);
                                const py = my + R*Math.sin(ang);
                                if (k===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
                            }
                            ctx.closePath();
                            if (!isNone) ctx.fill(); ctx.stroke();
                        } else {
                            ctx.beginPath(); ctx.arc(mx, my, Math.max(2, markerSize/3), 0, Math.PI*2);
                            if (!isNone) ctx.fill(); ctx.stroke();
                        }
                        ctx.globalAlpha = 1;
                    });
                }
                // Initial preview
                try { renderPreview(); } catch(_){ }

                // Place H-alpha colormap/stretch right after the panel pills (titles/percentiles)
                // Removed: separate H-alpha colormap block (now inline under H-alpha pill)
                designer.appendChild(markerBox);
                designer.appendChild(figBox);
                designer.appendChild(titleBox);
                designer.appendChild(cutoutBox);
                designer.appendChild(filtersBox);

                card.appendChild(designer);

                // Advanced RGB settings container
                const advancedBox=document.createElement('div'); advancedBox.style.marginTop='12px'; advancedBox.style.borderTop='1px solid #444'; advancedBox.style.paddingTop='10px';
                const advHeader=document.createElement('div'); advHeader.textContent='Advanced RGB settings'; advHeader.style.color='#fff'; advHeader.style.fontWeight='600'; advHeader.style.cursor='pointer'; advHeader.style.userSelect='none'; advHeader.style.marginBottom='6px';
                const advHint=document.createElement('div'); advHint.textContent='Toggle to show/hide'; advHint.style.color='#9a9a9a'; advHint.style.fontSize='11px'; advHint.style.marginBottom='6px';
                const advContent=document.createElement('div');
                advContent.style.display='none';
                advHeader.addEventListener('click', ()=>{ advContent.style.display = (advContent.style.display==='none'?'block':'none'); });
                advancedBox.appendChild(advHeader); advancedBox.appendChild(advHint); advancedBox.appendChild(advContent);
                card.appendChild(advancedBox);
                var __rgbAdvancedContainer = advContent;
                // Initial preview AFTER controls exist
                try { renderPreview(); } catch(_){ }
                panel.appendChild(card);
                // Continue to generic rows, appended into advanced container
            }
            else if (group === 'SED') {
                const sedCard=document.createElement('div'); sedCard.className='settings-card'; sedCard.style.border='1px solid #444'; sedCard.style.borderRadius='6px'; sedCard.style.padding='10px'; sedCard.style.margin='6px 0 10px';
                const sedTitle=document.createElement('div'); sedTitle.textContent='SED live demo'; sedTitle.style.color='#fff'; sedTitle.style.fontWeight='600'; sedTitle.style.marginBottom='8px'; sedCard.appendChild(sedTitle);
                const sedHint=document.createElement('div'); sedHint.textContent=''; sedHint.style.color='#bbb'; sedHint.style.fontSize='12px'; sedHint.style.marginBottom='8px'; sedCard.appendChild(sedHint);
                const sedCanvas=document.createElement('canvas'); sedCanvas.width=900; sedCanvas.height=260; sedCanvas.style.width='100%'; sedCanvas.style.border='1px solid #444'; sedCanvas.style.background='#1a1a1a'; sedCard.appendChild(sedCanvas);
                const sedControls=document.createElement('div');
                sedControls.style.marginTop='10px';
                // Grid layout for tidy alignment
                Object.assign(sedControls.style, {
                    display:'grid',
                    gridTemplateColumns:'repeat(3, minmax(220px, 1fr))',
                    columnGap:'12px',
                    rowGap:'8px'
                });
                sedCard.appendChild(sedControls);

                // Debounce helper for SED controls
                let _sedDebounceTimer = null;
                const sedDebounce = (fn, ms = 350) => {
                    clearTimeout(_sedDebounceTimer);
                    _sedDebounceTimer = setTimeout(fn, ms);
                };

                function makeLabel(txt){ const l=document.createElement('div'); l.className='settings-label'; l.textContent=txt; l.style.minWidth='140px'; l.style.textAlign='right'; return l; }
                function wrapField(label, el){ const w=document.createElement('div'); w.className='settings-field'; w.style.minWidth='0'; const lab=makeLabel(label); w.appendChild(lab); if (el && el.style) { el.style.width='100%'; } w.appendChild(el); return w; }
                function sedNum(name, width){ 
                    const i=document.createElement('input'); 
                    i.type='number'; 
                    i.step='0.1'; 
                    Object.assign(i.style,{ width:'100%', padding:'6px', border:'1px solid #555', borderRadius:'4px', background:'#1f1f1f', color:'#eee' }); 
                    const eff=(effective&&effective.settings)?effective.settings[name]:undefined; 
                    const def=(defaults&&defaults.defaults)?defaults.defaults[name]:undefined; 
                    const src=sedCard.querySelector(`[data-field="${name}"]`);
                    const init = src ? src.value : (eff??def??'');
                    i.value=init; 
                    i.dataset.proxyField=name; 
                    i.addEventListener('input', ()=>{ 
                        // Mirror into generic row if present so Save button sees it
                        try { const r = sedCard.querySelector(`[data-field="${name}"]`); if (r) r.value = i.value; } catch(_){ }
                        // no auto-save
                        try{sedPreview();}catch(_){ }
                    }); 
                    return i; 
                }
                function sedText(name, width){ 
                    const t=document.createElement('input'); 
                    t.type='text'; 
                    Object.assign(t.style,{ width:'100%', padding:'6px', border:'1px solid #555', borderRadius:'4px', background:'#1f1f1f', color:'#eee' }); 
                    const eff=(effective&&effective.settings)?effective.settings[name]:undefined; 
                    const def=(defaults&&defaults.defaults)?defaults.defaults[name]:undefined; 
                    const src=sedCard.querySelector(`[data-field="${name}"]`);
                    const init = src ? src.value : (eff??def??'');
                    t.value=init; 
                    t.dataset.proxyField=name; 
                    t.addEventListener('input', ()=>{ 
                        // Mirror into generic row if present so Save button sees it
                        try { const r = sedCard.querySelector(`[data-field="${name}"]`); if (r) r.value = t.value; } catch(_){ }
                        // no auto-save
                        try{sedPreview();}catch(_){ } 
                    }); 
                    return t; 
                }
                function sedSelect(name, options){ 
                    const s=document.createElement('select'); 
                    options.forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent=v; s.appendChild(o); }); 
                    const eff=(effective&&effective.settings)?effective.settings[name]:undefined; 
                    const def=(defaults&&defaults.defaults)?defaults.defaults[name]:undefined; 
                    const src=sedCard.querySelector(`[data-field="${name}"]`);
                    const init = src ? src.value : (eff??def??options[0]);
                    s.value=init; 
                    s.dataset.proxyField=name; 
                    s.addEventListener('change', ()=>{ 
                        // Mirror into generic row if present so Save button sees it
                        try { const r = sedCard.querySelector(`[data-field="${name}"]`); if (r) r.value = s.value; } catch(_){ }
                        // no auto-save
                        try{sedPreview();}catch(_){ }
                    }); 
                    Object.assign(s.style,{ width:'100%', minWidth:'140px', padding:'6px', border:'1px solid #555', borderRadius:'4px', background:'#1f1f1f', color:'#eee' }); 
                    return s; 
                }
                function sedColor(name){ 
                    const wrap=document.createElement('div'); 
                    const color=document.createElement('input'); 
                    color.type='color'; 
                    Object.assign(color.style,{ width:'44px', height:'32px', padding:'0', border:'1px solid #555', borderRadius:'4px', background:'#1f1f1f' }); 
                    const text=document.createElement('input'); 
                    text.type='text'; 
                    Object.assign(text.style,{ width:'100%', padding:'6px', border:'1px solid #555', borderRadius:'4px', background:'#1f1f1f', color:'#eee', flex:'1' }); 
                    const eff=(effective&&effective.settings)?effective.settings[name]:undefined; 
                    const def=(defaults&&defaults.defaults)?defaults.defaults[name]:undefined; 
                    const src=sedCard.querySelector(`[data-field="${name}"]`);
                    const init=(src? src.value : (eff??def??'#ffffff')); 

                    text.value=init; 
                    try{ const hx=cssToHex(init); if(hx) color.value=hx; }catch(_){ } 
                    text.dataset.proxyField=name; 
                    color.addEventListener('input', ()=>{ 
                        text.value=color.value; 
                        // Mirror into generic row
                        try { const r = sedCard.querySelector(`[data-field="${name}"]`); if (r) r.value = text.value; } catch(_){ }
                        // no auto-save
                        try{sedPreview();}catch(_){ } 
                    }); 
                    text.addEventListener('input', ()=>{ 
                        try{ const hx=cssToHex(text.value); if(hx) color.value=hx; }catch(_){ } 
                        // Mirror into generic row
                        try { const r = sedCard.querySelector(`[data-field="${name}"]`); if (r) r.value = text.value; } catch(_){ }
                        // no auto-save
                        try{sedPreview();}catch(_){ } 
                    }); 
                    wrap.style.display='flex'; wrap.style.gap='8px'; wrap.style.alignItems='center'; wrap.style.flex='1';
                    wrap.appendChild(color); 
                    wrap.appendChild(text); 
                    return wrap; 
                }

                // Controls
                const xscale = sedSelect('SED_XSCALE', ['linear','log','symlog','logit']);
                const yscale = sedSelect('SED_YSCALE', ['linear','log','symlog','logit']);
                const msize = sedNum('SED_MARKERSIZE','100px');
                const mfmtSel = (function(){ const s=document.createElement('select'); ['o','s','^','v','+','x','*','D','.','p'].forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent=v; s.appendChild(o); }); const eff=(effective&&effective.settings)?effective.settings['SED_MARKER_FMT']:undefined; const def=(defaults&&defaults.defaults)?defaults.defaults['SED_MARKER_FMT']:undefined; s.value=(eff??def??'o'); s.dataset.proxyField='SED_MARKER_FMT'; s.addEventListener('change', ()=>{ /* no auto-save */ try{sedPreview();}catch(_){ } }); Object.assign(s.style,{ minWidth:'120px', padding:'6px', border:'1px solid #555', borderRadius:'4px', background:'#1f1f1f', color:'#eee' }); return s; })();
                const obsColor = sedColor('SED_OBS_COLOR');
                const alphaNum = sedNum('SED_ALPHA','100px');
                sedControls.appendChild(wrapField('X scale', xscale));
                sedControls.appendChild(wrapField('Y scale', yscale));
                sedControls.appendChild(wrapField('Marker size', msize));
                sedControls.appendChild(wrapField('Marker fmt', mfmtSel));
                sedControls.appendChild(wrapField('Obs color', obsColor));
                sedControls.appendChild(wrapField('Alpha', alphaNum));

                // Plot configuration (before Labels)
                const plotCfgBox=document.createElement('div'); plotCfgBox.style.marginTop='10px';
                const plotCfgHdr=document.createElement('div'); plotCfgHdr.textContent='Plot configuration'; plotCfgHdr.style.color='#fff'; plotCfgHdr.style.fontWeight='600'; plotCfgHdr.style.margin='6px 0'; plotCfgBox.appendChild(plotCfgHdr);
                const plotCfgRow=document.createElement('div');
                Object.assign(plotCfgRow.style, { display:'grid', gridTemplateColumns:'repeat(3, minmax(220px, 1fr))', columnGap:'12px', rowGap:'8px' });
                const pcCircleColor = sedColor('CIRCLE_COLOR');
                const pcBkgColor = sedColor('SED_BKG_SUB_COLOR');
                const pcCircleR = sedNum('SED_CIRCLE_RADIUS_ARCSEC','160px');
                const pcCutSize = sedNum('SED_CUTOUT_SIZE_ARCSEC','160px');
                const pcFigH = sedNum('SED_FIGURE_SIZE_HEIGHT','120px');
                const pcFigW = sedNum('SED_FIGURE_SIZE_WIDTH','120px');
                const pcXMin = sedNum('SED_X_LIM_MIN','120px');
                const pcXMax = sedNum('SED_X_LIM_MAX','120px');
                const pcXTickRot = sedNum('SED_XTICK_ROTATION_DEGREES','140px');
                // Cutout cmap dropdown (searchable)
                const pcCutCmapWrap = (function(){
                    const wrap=document.createElement('div'); wrap.style.display='flex'; wrap.style.alignItems='center'; wrap.style.gap='8px';
                    const combo=document.createElement('div'); Object.assign(combo.style,{ position:'relative', display:'inline-block' });
                    const btn=document.createElement('button'); btn.type='button';
                    const effCmap=(effective&&effective.settings)?effective.settings['SED_CUTOUT_CMAP']:undefined; const defCmap=(defaults&&defaults.defaults)?defaults.defaults['SED_CUTOUT_CMAP']:undefined;
                    btn.textContent = (effCmap!==undefined? effCmap : (defCmap!==undefined? defCmap : 'gray'));
                    Object.assign(btn.style,{ minWidth:'160px', textAlign:'left', padding:'6px 10px', border:'1px solid #555', borderRadius:'4px', background:'#1f1f1f', color:'#eee', cursor:'pointer' });
                    const panel=document.createElement('div'); Object.assign(panel.style,{ position:'absolute', top:'calc(100% + 6px)', left:0, minWidth:'280px', maxHeight:'280px', overflow:'auto', background:'#2a2a2a', border:'1px solid #555', borderRadius:'6px', padding:'8px', zIndex:'4000', display:'none', boxShadow:'0 10px 30px rgba(0,0,0,0.4)' });
                    const search=document.createElement('input'); search.type='text'; search.placeholder='Search…'; Object.assign(search.style,{ width:'100%', padding:'6px', border:'1px solid #555', borderRadius:'4px', background:'#1f1f1f', color:'#eee', marginBottom:'8px' });
                    const list=document.createElement('div');
                    const cmaps=[ 'gray','viridis','plasma','inferno','magma','cividis','Greys','Purples','Blues','Greens','Oranges','Reds','YlOrBr','YlOrRd','OrRd','PuRd','RdPu','BuPu','GnBu','PuBu','YlGnBu','PuBuGn','BuGn','YlGn','binary','gist_yarg','gist_gray','bone','pink','spring','summer','autumn','winter','cool','Wistia','hot','afmhot','gist_heat','copper','terrain','ocean','gist_earth','gist_stern','brg','CMRmap','cubehelix','gnuplot','gnuplot2','jet','nipy_spectral','prism','flag' ];
                    function render(q){ list.innerHTML=''; const qq=(q||'').toLowerCase(); cmaps.filter(c=>!qq||c.toLowerCase().includes(qq)).forEach(c=>{ const item=document.createElement('div'); item.textContent=c; Object.assign(item.style,{ padding:'6px 8px', borderRadius:'4px', cursor:'pointer' }); item.addEventListener('mouseenter',()=>item.style.background='#3a3a3a'); item.addEventListener('mouseleave',()=>item.style.background=''); item.addEventListener('click',()=>{ btn.textContent=c; const proxy=wrap.querySelector('[data-proxy-field="SED_CUTOUT_CMAP"]'); if (proxy) proxy.value=c; panel.style.display='none'; /* no auto-save */ try{sedPreview();}catch(_){ } }); list.appendChild(item); }); }
                    render(''); search.addEventListener('input', ()=>render(search.value));
                    panel.appendChild(search); panel.appendChild(list); combo.appendChild(btn); combo.appendChild(panel);
                    btn.addEventListener('click',(e)=>{ e.stopPropagation(); panel.style.display=(panel.style.display==='none'?'block':'none'); if (panel.style.display==='block'){ search.focus(); search.select(); } });
                    document.addEventListener('click',(e)=>{ if (!combo.contains(e.target)) panel.style.display='none'; });
                    const hidden=document.createElement('input'); hidden.type='hidden'; hidden.dataset.proxyField='SED_CUTOUT_CMAP'; hidden.value=(effCmap!==undefined?effCmap:(defCmap!==undefined?defCmap:'gray'));
                    wrap.appendChild(combo); wrap.appendChild(hidden); return wrap;
                })();
                plotCfgRow.appendChild(wrapField('Circle color', pcCircleColor));
                plotCfgRow.appendChild(wrapField('BKG sub color', pcBkgColor));
                plotCfgRow.appendChild(wrapField('Circle radius (arcsec)', pcCircleR));
                plotCfgRow.appendChild(wrapField('Cutout size (arcsec)', pcCutSize));
                plotCfgRow.appendChild(wrapField('Cutout cmap', pcCutCmapWrap));
                plotCfgRow.appendChild(wrapField('Figure height', pcFigH));
                plotCfgRow.appendChild(wrapField('Figure width', pcFigW));
                plotCfgRow.appendChild(wrapField('X lim min', pcXMin));
                plotCfgRow.appendChild(wrapField('X lim max', pcXMax));
                plotCfgRow.appendChild(wrapField('Xtick rotation (deg)', pcXTickRot));
                plotCfgBox.appendChild(plotCfgRow);
                sedCard.appendChild(plotCfgBox);

                // Labels
                const labelsBox=document.createElement('div'); labelsBox.style.marginTop='10px';
                const labelsHdr=document.createElement('div'); labelsHdr.textContent='Labels'; labelsHdr.style.color='#fff'; labelsHdr.style.fontWeight='600'; labelsHdr.style.margin='6px 0'; labelsBox.appendChild(labelsHdr);
                const labelsRow=document.createElement('div'); Object.assign(labelsRow.style, { display:'grid', gridTemplateColumns:'repeat(3, minmax(220px, 1fr))', columnGap:'12px', rowGap:'8px' });
                const lblHST = sedText('SED_RGB_LABEL_HST','140px');
                const lblNIR = sedText('SED_RGB_LABEL_NIRCAM','140px');
                const lblMIRI= sedText('SED_RGB_LABEL_MIRI','140px');
                const lblHAT = sedText('SED_HA_TITLE','240px');
                const lblOBS = sedText('SED_OBS_LABEL','200px');
                const lblBKG = sedText('SED_BKG_SUB_LABEL','160px');
                const lblX = sedText('SED_X_LABEL','220px');
                const lblY = sedText('SED_Y_LABEL','220px');
                labelsRow.appendChild(wrapField('Label HST (SED)', lblHST));
                labelsRow.appendChild(wrapField('Label NIRCam (SED)', lblNIR));
                labelsRow.appendChild(wrapField('Label MIRI (SED)', lblMIRI));
                labelsRow.appendChild(wrapField('H-alpha title (SED)', lblHAT));
                labelsRow.appendChild(wrapField('Obs label', lblOBS));
                labelsRow.appendChild(wrapField('BKG sub label', lblBKG));
                labelsRow.appendChild(wrapField('X label', lblX));
                labelsRow.appendChild(wrapField('Y label', lblY));
                labelsBox.appendChild(labelsRow);
                sedCard.appendChild(labelsBox);

                // Percentiles
                const pctBox=document.createElement('div'); pctBox.style.marginTop='10px';
                const pctHdr=document.createElement('div'); pctHdr.textContent='Percentiles'; pctHdr.style.color='#fff'; pctHdr.style.fontWeight='600'; pctHdr.style.margin='6px 0'; pctBox.appendChild(pctHdr);
                const pctRow=document.createElement('div'); Object.assign(pctRow.style, { display:'grid', gridTemplateColumns:'repeat(2, minmax(320px, 1fr))', columnGap:'12px', rowGap:'8px' });
                const pHSTmin = sedNum('SED_RGB_HST_COMPOSITE_MIN_PERCENTILE','120px');
                const pHSTmax = sedNum('SED_RGB_HST_COMPOSITE_MAX_PERCENTILE','120px');
                const pNmin = sedNum('SED_RGB_NIRCAM_COMPOSITE_MIN_PERCENTILE','120px');
                const pNmax = sedNum('SED_RGB_NIRCAM_COMPOSITE_MAX_PERCENTILE','120px');
                const pMmin = sedNum('SED_RGB_MIRI_COMPOSITE_MIN_PERCENTILE','120px');
                const pMmax = sedNum('SED_RGB_MIRI_COMPOSITE_MAX_PERCENTILE','120px');
                const pHAcut = sedNum('SED_HA_CUTOUT_DISPLAY_MAX_PERCENTILE','120px');
                const pNMc  = sedNum('SED_NIRCAM_MIRI_CUTOUT_DISPLAY_MAX_PERCENTILE','120px');

                function pairRow(labelA, elA, labelB, elB){
                    const row=document.createElement('div'); Object.assign(row.style, { display:'grid', gridTemplateColumns:'repeat(2, minmax(220px, 1fr))', columnGap:'12px', rowGap:'8px' });
                    row.appendChild(wrapField(labelA, elA));
                    row.appendChild(wrapField(labelB, elB));
                    return row;
                }
                pctRow.appendChild(pairRow('HST min %', pHSTmin, 'HST max %', pHSTmax));
                pctRow.appendChild(pairRow('NIRCam min %', pNmin, 'NIRCam max %', pNmax));
                pctRow.appendChild(pairRow('MIRI min %', pMmin, 'MIRI max %', pMmax));
                pctRow.appendChild(pairRow('H-alpha cutout %', pHAcut, 'NIRCam/MIRI cutout %', pNMc));
                pctBox.appendChild(pctRow);
                sedCard.appendChild(pctBox);

                // Filters editors
                const filtBox=document.createElement('div'); filtBox.style.marginTop='10px';
                const filtHdr=document.createElement('div'); filtHdr.textContent='Filters'; filtHdr.style.color='#fff'; filtHdr.style.fontWeight='600'; filtHdr.style.margin='6px 0'; filtBox.appendChild(filtHdr);
                const namesArea=document.createElement('textarea'); Object.assign(namesArea.style,{ width:'48%', height:'120px', padding:'8px', border:'1px solid #555', borderRadius:'4px', background:'#1f1f1f', color:'#eee', fontFamily:'monospace' });
                const wavesArea=document.createElement('textarea'); Object.assign(wavesArea.style,{ width:'48%', height:'120px', padding:'8px', border:'1px solid #555', borderRadius:'4px', background:'#1f1f1f', color:'#eee', fontFamily:'monospace' });
                namesArea.dataset.proxyField='SED_FILTER_NAMES'; wavesArea.dataset.proxyField='SED_FILTER_WAVELENGTHS';
                try{ const effN=(effective&&effective.settings)?effective.settings['SED_FILTER_NAMES']:undefined; const defN=(defaults&&defaults.defaults)?defaults.defaults['SED_FILTER_NAMES']:undefined; namesArea.value=JSON.stringify((effN??defN??[]), null, 2); }catch(_){ namesArea.value='[]'; }
                try{ const effW=(effective&&effective.settings)?effective.settings['SED_FILTER_WAVELENGTHS']:undefined; const defW=(defaults&&defaults.defaults)?defaults.defaults['SED_FILTER_WAVELENGTHS']:undefined; wavesArea.value=JSON.stringify((effW??defW??[]), null, 2); }catch(_){ wavesArea.value='[]'; }
                // no auto-save for SED filter names
                // no auto-save for SED filter wavelengths
                const filtRow=document.createElement('div'); filtRow.style.display='flex'; filtRow.style.gap='12px'; filtRow.style.flexWrap='wrap';
                filtRow.appendChild(wrapField('Filter names (JSON)', namesArea));
                filtRow.appendChild(wrapField('Wavelengths (JSON, μm)', wavesArea));
                filtBox.appendChild(filtRow);
                sedCard.appendChild(filtBox);

                // Filter assignments for RGB composites
                const filterAssignBox = document.createElement('div');
                filterAssignBox.style.marginTop = '10px';
                const filterAssignHdr = document.createElement('div');
                filterAssignHdr.textContent = 'Filter Assignments for RGB';
                filterAssignHdr.style.color = '#fff';
                filterAssignHdr.style.fontWeight = '600';
                filterAssignHdr.style.margin = '6px 0';
                filterAssignBox.appendChild(filterAssignHdr);

                // HST filters
                const hstFilterRow = document.createElement('div');
                Object.assign(hstFilterRow.style, { display:'grid', gridTemplateColumns:'repeat(3, minmax(220px, 1fr))', columnGap:'12px', rowGap:'8px' });
                hstFilterRow.style.marginBottom = '8px';
                
                const hstBlueFilter = sedText('SED_HST_BLUE_FILTER', '160px');
                const hstGreenFilter = sedText('SED_HST_GREEN_FILTER', '160px');
                const hstRedFilters = sedText('SED_HST_RED_FILTERS', '160px');
                
                hstFilterRow.appendChild(wrapField('HST Blue', hstBlueFilter));
                hstFilterRow.appendChild(wrapField('HST Green', hstGreenFilter));
                hstFilterRow.appendChild(wrapField('HST Red', hstRedFilters));
                filterAssignBox.appendChild(hstFilterRow);

                // NIRCam filters
                const nircamFilterRow = document.createElement('div');
                Object.assign(nircamFilterRow.style, { display:'grid', gridTemplateColumns:'repeat(3, minmax(220px, 1fr))', columnGap:'12px', rowGap:'8px' });
                nircamFilterRow.style.marginBottom = '8px';
                
                const nircamBlueFilter = sedText('SED_NIRCAM_BLUE_FILTER', '160px');
                const nircamGreenFilter = sedText('SED_NIRCAM_GREEN_FILTER', '160px');
                const nircamRedFilter = sedText('SED_NIRCAM_RED_FILTER', '160px');
                
                nircamFilterRow.appendChild(wrapField('NIRCam Blue', nircamBlueFilter));
                nircamFilterRow.appendChild(wrapField('NIRCam Green', nircamGreenFilter));
                nircamFilterRow.appendChild(wrapField('NIRCam Red', nircamRedFilter));
                filterAssignBox.appendChild(nircamFilterRow);

                // MIRI filters
                const miriFilterRow = document.createElement('div');
                Object.assign(miriFilterRow.style, { display:'grid', gridTemplateColumns:'repeat(3, minmax(220px, 1fr))', columnGap:'12px', rowGap:'8px' });
                miriFilterRow.style.marginBottom = '8px';
                
                const miriBlueFilter = sedText('SED_MIRI_BLUE_FILTER', '160px');
                const miriGreenFilter = sedText('SED_MIRI_GREEN_FILTER', '160px');
                const miriRedFilter = sedText('SED_MIRI_RED_FILTER', '160px');
                
                miriFilterRow.appendChild(wrapField('MIRI Blue', miriBlueFilter));
                miriFilterRow.appendChild(wrapField('MIRI Green', miriGreenFilter));
                miriFilterRow.appendChild(wrapField('MIRI Red', miriRedFilter));
                filterAssignBox.appendChild(miriFilterRow);

                sedCard.appendChild(filterAssignBox);

                // Filter arrays
                const filterArraysBox = document.createElement('div');
                filterArraysBox.style.marginTop = '10px';
                const filterArraysHdr = document.createElement('div');
                filterArraysHdr.textContent = 'Filter Arrays';
                filterArraysHdr.style.color = '#fff';
                filterArraysHdr.style.fontWeight = '600';
                filterArraysHdr.style.margin = '6px 0';
                filterArraysBox.appendChild(filterArraysHdr);

                // HST filters array
                const hstFiltersArea = document.createElement('textarea');
                Object.assign(hstFiltersArea.style, { width: '100%', height: '80px', padding: '8px', border: '1px solid #555', borderRadius: '4px', background: '#1f1f1f', color: '#eee', fontFamily: 'monospace' });
                hstFiltersArea.dataset.proxyField = 'SED_HST_FILTERS';
                try { const effH = (effective && effective.settings) ? effective.settings['SED_HST_FILTERS'] : undefined; const defH = (defaults && defaults.defaults) ? defaults.defaults['SED_HST_FILTERS'] : undefined; hstFiltersArea.value = JSON.stringify((effH ?? defH ?? []), null, 2); } catch (_) { hstFiltersArea.value = '[]'; }
                // no auto-save for SED_HST_FILTERS
                
                const hstFiltersLabel = document.createElement('div');
                hstFiltersLabel.textContent = 'HST filters (SED)';
                hstFiltersLabel.style.color = '#bbb';
                hstFiltersLabel.style.fontSize = '12px';
                hstFiltersLabel.style.margin = '4px 0';
                
                filterArraysBox.appendChild(hstFiltersLabel);
                filterArraysBox.appendChild(hstFiltersArea);

                // NIRCam filters array
                const nircamFiltersArea = document.createElement('textarea');
                Object.assign(nircamFiltersArea.style, { width: '100%', height: '80px', padding: '8px', border: '1px solid #555', borderRadius: '4px', background: '#1f1f1f', color: '#eee', fontFamily: 'monospace' });
                nircamFiltersArea.dataset.proxyField = 'SED_JWST_NIRCAM_FILTERS';
                try { const effN = (effective && effective.settings) ? effective.settings['SED_JWST_NIRCAM_FILTERS'] : undefined; const defN = (defaults && defaults.defaults) ? defaults.defaults['SED_JWST_NIRCAM_FILTERS'] : undefined; nircamFiltersArea.value = JSON.stringify((effN ?? defN ?? []), null, 2); } catch (_) { nircamFiltersArea.value = '[]'; }
                // no auto-save for SED_JWST_NIRCAM_FILTERS
                
                const nircamFiltersLabel = document.createElement('div');
                nircamFiltersLabel.textContent = 'NIRCam filters (SED)';
                nircamFiltersLabel.style.color = '#bbb';
                nircamFiltersLabel.style.fontSize = '12px';
                nircamFiltersLabel.style.margin = '4px 0';
                
                filterArraysBox.appendChild(nircamFiltersLabel);
                filterArraysBox.appendChild(nircamFiltersArea);

                // MIRI filters array
                const miriFiltersArea = document.createElement('textarea');
                Object.assign(miriFiltersArea.style, { width: '100%', height: '80px', padding: '8px', border: '1px solid #555', borderRadius: '4px', background: '#1f1f1f', color: '#eee', fontFamily: 'monospace' });
                miriFiltersArea.dataset.proxyField = 'SED_JWST_MIRI_FILTERS';
                try { const effM = (effective && effective.settings) ? effective.settings['SED_JWST_MIRI_FILTERS'] : undefined; const defM = (defaults && defaults.defaults) ? defaults.defaults['SED_JWST_MIRI_FILTERS'] : undefined; miriFiltersArea.value = JSON.stringify((effM ?? defM ?? []), null, 2); } catch (_) { miriFiltersArea.value = '[]'; }
                // no auto-save for SED_JWST_MIRI_FILTERS
                
                const miriFiltersLabel = document.createElement('div');
                miriFiltersLabel.textContent = 'MIRI filters (SED)';
                miriFiltersLabel.style.color = '#bbb';
                miriFiltersLabel.style.fontSize = '12px';
                miriFiltersLabel.style.margin = '4px 0';
                
                filterArraysBox.appendChild(miriFiltersLabel);
                filterArraysBox.appendChild(miriFiltersArea);

                sedCard.appendChild(filterArraysBox);

                // Additional SED controls requested
                const extraBox=document.createElement('div'); extraBox.style.marginTop='10px';
                const extraHdr=document.createElement('div'); extraHdr.textContent='Additional'; extraHdr.style.color='#fff'; extraHdr.style.fontWeight='600'; extraHdr.style.margin='6px 0'; extraBox.appendChild(extraHdr);
                const extraRow=document.createElement('div'); extraRow.style.display='flex'; extraRow.style.flexWrap='wrap'; extraRow.style.gap='12px';
                const circleColor = sedColor('CIRCLE_COLOR');
                const bkgColor = sedColor('SED_BKG_SUB_COLOR');
                const bkgLabel = sedText('SED_BKG_SUB_LABEL','160px');
                const circleR = sedNum('SED_CIRCLE_RADIUS_ARCSEC','160px');
                const cutSize = sedNum('SED_CUTOUT_SIZE_ARCSEC','160px');
                // SED Cutout Cmap as searchable dropdown (like RGB panel)
                const cutCmapWrap = document.createElement('div');
                cutCmapWrap.style.display = 'flex';
                cutCmapWrap.style.alignItems = 'center';
                cutCmapWrap.style.gap = '8px';
                
                const cutCmapCombo = document.createElement('div');
                Object.assign(cutCmapCombo.style, { position: 'relative', display: 'inline-block' });
                
                const cutCmapBtn = document.createElement('button');
                cutCmapBtn.type = 'button';
                const effCmap = (effective && effective.settings) ? effective.settings['SED_CUTOUT_CMAP'] : undefined;
                const defCmap = (defaults && defaults.defaults) ? defaults.defaults['SED_CUTOUT_CMAP'] : undefined;
                cutCmapBtn.textContent = (effCmap !== undefined ? effCmap : (defCmap !== undefined ? defCmap : 'gray'));
                Object.assign(cutCmapBtn.style, { minWidth: '160px', textAlign: 'left', padding: '6px 10px', border: '1px solid #555', borderRadius: '4px', background: '#1f1f1f', color: '#eee', cursor: 'pointer' });
                
                const cutCmapPanel = document.createElement('div');
                Object.assign(cutCmapPanel.style, { position: 'absolute', top: 'calc(100% + 6px)', left: 0, minWidth: '280px', maxHeight: '280px', overflow: 'auto', background: '#2a2a2a', border: '1px solid #555', borderRadius: '6px', padding: '8px', zIndex: '4000', display: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.4)' });
                
                const cutCmapSearch = document.createElement('input');
                cutCmapSearch.type = 'text';
                cutCmapSearch.placeholder = 'Search…';
                Object.assign(cutCmapSearch.style, { width: '100%', padding: '6px', border: '1px solid #555', borderRadius: '4px', background: '#1f1f1f', color: '#eee', marginBottom: '8px' });
                
                const cutCmapList = document.createElement('div');
                
                // Common matplotlib colormaps
                const cutCmaps = [
                    'gray', 'viridis', 'plasma', 'inferno', 'magma', 'cividis', 'Greys', 'Purples', 'Blues', 'Greens', 'Oranges', 'Reds',
                    'YlOrBr', 'YlOrRd', 'OrRd', 'PuRd', 'RdPu', 'BuPu', 'GnBu', 'PuBu', 'YlGnBu', 'PuBuGn', 'BuGn', 'YlGn',
                    'binary', 'gist_yarg', 'gist_gray', 'bone', 'pink', 'spring', 'summer', 'autumn', 'winter', 'cool', 'Wistia', 'hot',
                    'afmhot', 'gist_heat', 'copper', 'terrain', 'ocean', 'gist_earth', 'gist_stern', 'brg', 'CMRmap', 'cubehelix',
                    'gnuplot', 'gnuplot2', 'jet', 'nipy_spectral', 'prism', 'flag'
                ];
                
                function renderCutCmapList(filter) {
                    cutCmapList.innerHTML = '';
                    const q = (filter || '').toLowerCase();
                    cutCmaps.filter(c => !q || c.toLowerCase().includes(q)).forEach(c => {
                        const item = document.createElement('div');
                        item.textContent = c;
                        Object.assign(item.style, { padding: '6px 8px', borderRadius: '4px', cursor: 'pointer' });
                        item.addEventListener('mouseenter', () => item.style.background = '#3a3a3a');
                        item.addEventListener('mouseleave', () => item.style.background = '');
                        item.addEventListener('click', () => {
                            cutCmapBtn.textContent = c;
                            // Update the hidden proxy field
                            const proxyField = cutCmapWrap.querySelector('[data-proxy-field="SED_CUTOUT_CMAP"]');
                            if (proxyField) proxyField.value = c;
                            cutCmapPanel.style.display = 'none';
                            sedDebounce(() => sedSave(['SED_CUTOUT_CMAP']));
                            try { sedPreview(); } catch (_) { }
                        });
                        cutCmapList.appendChild(item);
                    });
                }
                
                renderCutCmapList('');
                cutCmapSearch.addEventListener('input', () => renderCutCmapList(cutCmapSearch.value));
                
                cutCmapPanel.appendChild(cutCmapSearch);
                cutCmapPanel.appendChild(cutCmapList);
                cutCmapCombo.appendChild(cutCmapBtn);
                cutCmapCombo.appendChild(cutCmapPanel);
                
                // Hidden proxy field for saving
                const cutCmapHidden = document.createElement('input');
                cutCmapHidden.type = 'hidden';
                cutCmapHidden.dataset.proxyField = 'SED_CUTOUT_CMAP';
                cutCmapHidden.value = (effCmap !== undefined ? effCmap : (defCmap !== undefined ? defCmap : 'gray'));
                
                cutCmapBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    cutCmapPanel.style.display = (cutCmapPanel.style.display === 'none' ? 'block' : 'none');
                    if (cutCmapPanel.style.display === 'block') {
                        cutCmapSearch.focus();
                        cutCmapSearch.select();
                    }
                });
                
                document.addEventListener('click', (e) => {
                    if (!cutCmapCombo.contains(e.target)) cutCmapPanel.style.display = 'none';
                });
                
                cutCmapWrap.appendChild(cutCmapCombo);
                cutCmapWrap.appendChild(cutCmapHidden);
                const errTpl = sedText('SED_ERR_COLUMN_TEMPLATE','200px');
                const bkgTpl = sedText('SED_BKG_COLUMN_TEMPLATE','200px');
                const figH = sedNum('SED_FIGURE_SIZE_HEIGHT','120px');
                const figW = sedNum('SED_FIGURE_SIZE_WIDTH','120px');
                const fsInfo = sedNum('SED_FONTSIZE_INFO','100px');
                const fsLabels = sedNum('SED_FONTSIZE_LABELS','100px');
                const fsTicks = sedNum('SED_FONTSIZE_TICKS','100px');
                const fsTitle = sedNum('SED_FONTSIZE_TITLE','100px');
                const gaussSigma = sedNum('SED_GAUSSIAN_FILTER_SIGMA','140px');
                const xLabel = sedText('SED_X_LABEL','220px');
                const yLabel = sedText('SED_Y_LABEL','220px');
                // moved to Plot configuration and Labels sections above
                extraRow.appendChild(wrapField('Err column template', errTpl));
                extraRow.appendChild(wrapField('Bkg column template', bkgTpl));
                extraRow.appendChild(wrapField('Figure height', figH));
                extraRow.appendChild(wrapField('Figure width', figW));
                extraRow.appendChild(wrapField('Fontsize info', fsInfo));
                extraRow.appendChild(wrapField('Fontsize labels', fsLabels));
                extraRow.appendChild(wrapField('Fontsize ticks', fsTicks));
                extraRow.appendChild(wrapField('Fontsize title', fsTitle));
                extraRow.appendChild(wrapField('Gaussian σ', gaussSigma));
                // X/Y labels moved to Labels section above
                extraBox.appendChild(extraRow);
                sedCard.appendChild(extraBox);

                // Define sedSave function for this SED panel
                async function sedSave(names) {
                    try {
                        let saveName = me.admin ? 'admin' : currentActiveName;
                        if (!me.admin && (!saveName || saveName.toLowerCase() === 'default')) {
                            const suggested = 'my-profile';
                            const newName = await promptForNewProfileName(suggested);
                            if (!newName) return; // user cancelled
                            await api('/settings/profile',{method:'POST', body: JSON.stringify({name: newName, settings: (defaults.defaults||{})})});
                            await api('/settings/active',{method:'POST', body: JSON.stringify({name:newName})});
                            currentActiveName = newName;
                            // no localStorage persistence for active profile
                            try { profiles = await api('/settings/profiles'); } catch(_){ }
                            try { effective = await api('/settings/effective'); } catch(_){ }
                            updateActiveUI();
                            if (typeof window.showNotification==='function') window.showNotification(`Activated profile: ${newName}`, 1200, 'success');
                            saveName = newName;
                        }
                        let base = {};
                        try { const pr = await api('/settings/profile/'+encodeURIComponent(saveName)); base = pr.settings||{}; } catch(_){ base = {}; }
                        names.forEach(n => {
                            const el = sedCard.querySelector(`[data-proxy-field="${CSS.escape(n)}"]`);
                            if (el) {
                                const val = parseValue(el, defaults.defaults?.[n]);
                                if (val !== undefined) {
                                    base[n] = val;
                                }
                            }
                        });
                        await api('/settings/profile',{method:'POST', body: JSON.stringify({name: saveName, settings: base})});
                        try { effective = await api('/settings/effective'); } catch(_){ }
                        if (typeof window.showNotification==='function') window.showNotification('Saved SED settings', 1000, 'success');
                    } catch(e) {
                        const msg = (e && e.data && e.data.detail) ? e.data.detail : 'Failed to save SED settings';
                        if (typeof window.showNotification==='function') window.showNotification(msg, 1500, 'error');
                    }
                }

                // Helper function to draw markers
                function drawMarker(ctx, fmt, x, y, size) {
                    const half = size/2;
                    ctx.beginPath();
                    if (fmt === 'o') {
                        ctx.arc(x, y, half, 0, Math.PI*2);
                        ctx.fill();
                    } else if (fmt === 's') {
                        ctx.rect(x-half, y-half, size, size);
                        ctx.fill();
                    } else if (fmt === '^') {
                        ctx.moveTo(x, y-half);
                        ctx.lineTo(x-half, y+half);
                        ctx.lineTo(x+half, y+half);
                        ctx.closePath();
                        ctx.fill();
                    } else if (fmt === 'v') {
                        ctx.moveTo(x, y+half);
                        ctx.lineTo(x-half, y-half);
                        ctx.lineTo(x+half, y-half);
                        ctx.closePath();
                        ctx.fill();
                    } else if (fmt === '+') {
                        ctx.moveTo(x-half, y);
                        ctx.lineTo(x+half, y);
                        ctx.moveTo(x, y-half);
                        ctx.lineTo(x, y+half);
                        ctx.stroke();
                    } else if (fmt === 'x') {
                        ctx.moveTo(x-half, y-half);
                        ctx.lineTo(x+half, y+half);
                        ctx.moveTo(x+half, y-half);
                        ctx.lineTo(x-half, y+half);
                        ctx.stroke();
                    } else if (fmt === '*') {
                        // Star as plus + x
                        ctx.moveTo(x-half, y);
                        ctx.lineTo(x+half, y);
                        ctx.moveTo(x, y-half);
                        ctx.lineTo(x, y+half);
                        ctx.moveTo(x-half, y-half);
                        ctx.lineTo(x+half, y+half);
                        ctx.moveTo(x+half, y-half);
                        ctx.lineTo(x-half, y+half);
                        ctx.stroke();
                    } else if (fmt === 'D') {
                        // Diamond
                        ctx.moveTo(x, y-half);
                        ctx.lineTo(x+half, y);
                        ctx.lineTo(x, y+half);
                        ctx.lineTo(x-half, y);
                        ctx.closePath();
                        ctx.fill();
                    } else if (fmt === '.') {
                        ctx.arc(x, y, Math.max(1.5, size/6), 0, Math.PI*2);
                        ctx.fill();
                    } else if (fmt === 'p') {
                        // Pentagon
                        const R = half;
                        const n = 5;
                        ctx.beginPath();
                        for (let k = 0; k < n; k++) {
                            const ang = -Math.PI/2 + k*(2*Math.PI/n);
                            const px = x + R*Math.cos(ang);
                            const py = y + R*Math.sin(ang);
                            if (k === 0) ctx.moveTo(px, py);
                            else ctx.lineTo(px, py);
                        }
                        ctx.closePath();
                        ctx.fill();
                    } else {
                        // Default to circle
                        ctx.arc(x, y, half, 0, Math.PI*2);
                        ctx.fill();
                    }
                }

                // Enhanced SED preview that looks like generate_sed_optimized
                function sedPreview() {
                    const ctx = sedCanvas.getContext('2d');
                    if (!ctx) return;
                    
                    ctx.clearRect(0, 0, sedCanvas.width, sedCanvas.height);
                    const W = sedCanvas.width, H = sedCanvas.height;
                    
                    // Background
                    ctx.fillStyle = '#1a1a1a';
                    ctx.fillRect(0, 0, W, H);
                    
                    // Main SED plot area (full width, space reserved above for cutouts)
                    const plotPad = 40;
                    const plotY = Math.max(20, Math.floor(H * 0.35));
                    const plotW = W - plotPad * 2;
                    const plotH = (H - plotY) - plotPad;
                    
                    // Grid lines
                    ctx.strokeStyle = '#333';
                    ctx.lineWidth = 0.5;
                    for (let i = 0; i <= 10; i++) {
                        const x = plotPad + (i/10) * plotW;
                        ctx.beginPath();
                        ctx.moveTo(x, plotY);
                        ctx.lineTo(x, plotY + plotH);
                        ctx.stroke();
                    }
                    for (let i = 0; i <= 8; i++) {
                        const y = plotY + (i/8) * plotH;
                        ctx.beginPath();
                        ctx.moveTo(plotPad, y);
                        ctx.lineTo(plotPad + plotW, y);
                        ctx.stroke();
                    }
                    
                    // Axes
                    ctx.strokeStyle = '#666';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(plotPad, plotY + plotH);
                    ctx.lineTo(plotPad + plotW, plotY + plotH);
                    ctx.moveTo(plotPad, plotY);
                    ctx.lineTo(plotPad, plotY + plotH);
                    ctx.stroke();
                    
                    // Read current parameters
                    const xscale = (sedCard.querySelector('[data-proxy-field="SED_XSCALE"]')||{}).value || 'log';
                    const yscale = (sedCard.querySelector('[data-proxy-field="SED_YSCALE"]')||{}).value || 'log';
                    const msize = Number((sedCard.querySelector('[data-proxy-field="SED_MARKERSIZE"]')||{}).value || 8);
                    const mfmt = (sedCard.querySelector('[data-proxy-field="SED_MARKER_FMT"]')||{}).value || 'o';
                    const obsColor = (sedCard.querySelector('[data-proxy-field="SED_OBS_COLOR"]')||{}).value || '#ffffff';
                    const bkgColor = (sedCard.querySelector('[data-proxy-field="SED_BKG_SUB_COLOR"]')||{}).value || '#0000ff';
                    const alpha = Number((sedCard.querySelector('[data-proxy-field="SED_ALPHA"]')||{}).value || 0.8);
                    
                    // Generate synthetic SED data points (exponential growth)
                    const wavelengths = [0.5, 0.8, 1.2, 1.6, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 7.0, 8.0, 9.0, 10.0, 12.0, 15.0, 18.0, 21.0, 24.0];
                    const fluxes = wavelengths.map((w, idx) => 16 + 4 * Math.exp(idx/6));
                    const fluxesTotal = fluxes.map(f => f + 8 + Math.random() * 12); // Background included
                    
                    // Draw observation data points (total flux)
                    ctx.save();
                    ctx.globalAlpha = Math.max(0.1, Math.min(1, alpha));
                    ctx.fillStyle = obsColor;
                    ctx.strokeStyle = obsColor;
                    ctx.lineWidth = 1.5;
                    
                    wavelengths.forEach((w, i) => {
                        let x = plotPad + (w - 0.5) / (24 - 0.5) * plotW;
                        if (xscale === 'log') {
                            x = plotPad + Math.log10(w/0.5) / Math.log10(24/0.5) * plotW;
                        }
                        
                        let y = plotY + plotH - (fluxesTotal[i] - 16) / (170 - 16) * plotH;
                        if (yscale === 'log') {
                            y = plotY + plotH - Math.log10(fluxesTotal[i]/16) / Math.log10(170/16) * plotH;
                        }
                        
                        drawMarker(ctx, mfmt, x, y, msize);
                    });
                    
                    // Draw background-subtracted data points
                    ctx.fillStyle = bkgColor;
                    ctx.strokeStyle = bkgColor;
                    
                    wavelengths.forEach((w, i) => {
                        let x = plotPad + (w - 0.5) / (24 - 0.5) * plotW;
                        if (xscale === 'log') {
                            x = plotPad + Math.log10(w/0.5) / Math.log10(24/0.5) * plotW;
                        }
                        
                        let y = plotY + plotH - (fluxes[i] - 16) / (155 - 16) * plotH;
                        if (yscale === 'log') {
                            y = plotY + plotH - Math.log10(fluxes[i]/16) / Math.log10(155/16) * plotH;
                        }
                        
                        drawMarker(ctx, mfmt, x, y, msize);
                    });
                    
                    ctx.restore();
                    
                    // Draw filter bands
                    const filterColors = {
                        'HST': '#4ac7ff',
                        'NIRCam': '#ff7ad1', 
                        'MIRI': '#ffb84d'
                    };
                    
                    // Get filter information
                    const hstBlue = (sedCard.querySelector('[data-proxy-field="SED_HST_BLUE_FILTER"]')||{}).value || '[]';
                    const hstGreen = (sedCard.querySelector('[data-proxy-field="SED_HST_GREEN_FILTER"]')||{}).value || '[]';
                    const hstRed = (sedCard.querySelector('[data-proxy-field="SED_HST_RED_FILTERS"]')||{}).value || '[]';
                    const nirBlue = (sedCard.querySelector('[data-proxy-field="SED_NIRCAM_BLUE_FILTER"]')||{}).value || '';
                    const nirGreen = (sedCard.querySelector('[data-proxy-field="SED_NIRCAM_GREEN_FILTER"]')||{}).value || '';
                    const nirRed = (sedCard.querySelector('[data-proxy-field="SED_NIRCAM_RED_FILTER"]')||{}).value || '';
                    const miriBlue = (sedCard.querySelector('[data-proxy-field="SED_MIRI_BLUE_FILTER"]')||{}).value || '';
                    const miriGreen = (sedCard.querySelector('[data-proxy-field="SED_MIRI_GREEN_FILTER"]')||{}).value || '';
                    const miriRed = (sedCard.querySelector('[data-proxy-field="SED_MIRI_RED_FILTER"]')||{}).value || '';
                    
                    // Parse filter arrays
                    function parseFilterArray(str) {
                        try {
                            const parsed = JSON.parse(str);
                            return Array.isArray(parsed) ? parsed : [];
                        } catch(_) {
                            return [];
                        }
                    }
                    
                    const hstBlueFilters = parseFilterArray(hstBlue);
                    const hstGreenFilters = parseFilterArray(hstGreen);
                    const hstRedFilters = parseFilterArray(hstRed);
                    
                    // Draw filter bands
                    [...hstBlueFilters, ...hstGreenFilters, ...hstRedFilters].forEach(filter => {
                        if (filter && typeof filter === 'string') {
                            const w = parseFloat(filter.replace(/[^\d.]/g, ''));
                            if (!isNaN(w) && w >= 0.5 && w <= 24) {
                                let x = plotPad + (w - 0.5) / (24 - 0.5) * plotW;
                                if (xscale === 'log') {
                                    x = plotPad + Math.log10(w/0.5) / Math.log10(24/0.5) * plotW;
                                }
                                
                                ctx.strokeStyle = filterColors['HST'];
                                ctx.lineWidth = 3;
                                ctx.beginPath();
                                ctx.moveTo(x, plotY);
                                ctx.lineTo(x, plotY + plotH);
                                ctx.stroke();
                            }
                        }
                    });
                    
                    [nirBlue, nirGreen, nirRed].forEach(filter => {
                        if (filter && typeof filter === 'string') {
                            const w = parseFloat(filter.replace(/[^\d.]/g, ''));
                            if (!isNaN(w) && w >= 0.5 && w <= 24) {
                                let x = plotPad + (w - 0.5) / (24 - 0.5) * plotW;
                                if (xscale === 'log') {
                                    x = plotPad + Math.log10(w/0.5) / Math.log10(24/0.5) * plotW;
                                }
                                
                                ctx.strokeStyle = filterColors['NIRCam'];
                                ctx.lineWidth = 3;
                                ctx.beginPath();
                                ctx.moveTo(x, plotY);
                                ctx.lineTo(x, plotY + plotH);
                                ctx.stroke();
                            }
                        }
                    });
                    
                    [miriBlue, miriGreen, miriRed].forEach(filter => {
                        if (filter && typeof filter === 'string') {
                            const w = parseFloat(filter.replace(/[^\d.]/g, ''));
                            if (!isNaN(w) && w >= 0.5 && w <= 24) {
                                let x = plotPad + (w - 0.5) / (24 - 0.5) * plotW;
                                if (xscale === 'log') {
                                    x = plotPad + Math.log10(w/0.5) / Math.log10(24/0.5) * plotW;
                                }
                                
                                ctx.strokeStyle = filterColors['MIRI'];
                                ctx.lineWidth = 3;
                                ctx.beginPath();
                                ctx.moveTo(x, plotY);
                                ctx.lineTo(x, plotY + plotH);
                                ctx.stroke();
                            }
                        }
                    });
                    
                    // Labels
                    const xLabel = (sedCard.querySelector('[data-proxy-field="SED_X_LABEL"]')||{}).value || 'Wavelength (μm)';
                    const yLabel = (sedCard.querySelector('[data-proxy-field="SED_Y_LABEL"]')||{}).value || 'Flux (mJy)';
                    
                    ctx.fillStyle = '#ccc';
                    ctx.font = '14px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(xLabel, plotPad + plotW/2, H - 15);
                    
                    ctx.save();
                    ctx.translate(15, plotY + plotH/2);
                    ctx.rotate(-Math.PI/2);
                    ctx.textAlign = 'center';
                    ctx.fillText(yLabel, 0, 0);
                    ctx.restore();
                    
                    // RGB cutouts removed per request
                    
                    // Minimal legend - only total and background-subtracted (top-right)
                    ctx.fillStyle = '#ddd';
                    ctx.font = '11px sans-serif';
                    ctx.textAlign = 'left';
                    let legendY = plotY + 10;
                    let legendX = plotPad + plotW - 180;
                    ctx.fillStyle = obsColor; ctx.fillRect(legendX, legendY, 10, 10);
                    ctx.fillStyle = '#ddd'; ctx.fillText('Observation (total)', legendX + 16, legendY + 9);
                    legendY += 16;
                    ctx.fillStyle = bkgColor; ctx.fillRect(legendX, legendY, 10, 10);
                    ctx.fillStyle = '#ddd'; ctx.fillText('Background-subtracted', legendX + 16, legendY + 9);
                    
                    // Scale info
                    ctx.fillStyle = '#999';
                    ctx.font = '10px sans-serif';
                    ctx.textAlign = 'right';
                    ctx.fillText(`Scale: ${xscale}/${yscale}`, W - 10, H - 10);
                }
                

                
                // Initial preview
                try { sedPreview(); } catch(_){ }
                
                // Add ResizeObserver for canvas
                const resizeObserver = new ResizeObserver(() => {
                    try { sedPreview(); } catch(_){ }
                });
                resizeObserver.observe(sedCanvas);
                
                __sedCard = sedCard;
                panel.appendChild(sedCard);
            }
            // Custom layout for WCS: toggles first, then label mode, then colors
            if (group === 'WCS') {
                const byName = {}; (grouped[group]||[]).forEach(f=> byName[f.name]=f);
                function addRowTo(container, name){
                    const f = byName[name]; if (!f) return;
                    const current = effective.settings?.[f.name] ?? defaults.defaults?.[f.name];
                    const row = buildRow(f.name, defaults.defaults?.[f.name], f.options, current);
                    container.appendChild(row);
                }
                // Behavior/Toggles section
                const togglesBox = document.createElement('div');
                togglesBox.style.marginBottom = '10px';
                const togglesHdr = document.createElement('div'); togglesHdr.textContent='Behavior'; togglesHdr.style.color='#fff'; togglesHdr.style.fontWeight='600'; togglesHdr.style.margin='6px 0';
                togglesBox.appendChild(togglesHdr);
                ['WCS_ENABLE','WCS_CATALOG_AUTO_CONVERT','WCS_PREFER_CD','WCS_REFLECTION_FIX','WCS_LABEL_MODE']
                    .forEach(n=> addRowTo(togglesBox, n));
                // Colors section
                const colorsBox = document.createElement('div');
                const colorsHdr = document.createElement('div'); colorsHdr.textContent='Colors'; colorsHdr.style.color='#fff'; colorsHdr.style.fontWeight='600'; colorsHdr.style.margin='6px 0';
                colorsBox.appendChild(colorsHdr);
                ;['WCS_AXIS_COLOR','WCS_TICK_COLOR','WCS_LABEL_TEXT_COLOR','WCS_LABEL_BG_COLOR']
                    .forEach(n=> addRowTo(colorsBox, n));
                card.appendChild(togglesBox);
                card.appendChild(colorsBox);

                // Manual Save flow only: WCS changes apply on Save (no auto-save)
            }
            // Admin-only Uploads tab content
            if (group === 'Uploads') {
                if (!me.admin) { panel.style.display = 'none'; return; }
                const card=document.createElement('div'); card.className='settings-card'; card.style.border='1px solid #444'; card.style.borderRadius='6px'; card.style.padding='10px'; card.style.margin='6px 0 10px';
                const hdr=document.createElement('div'); hdr.textContent='Clean uploads folder'; hdr.style.color='#fff'; hdr.style.fontWeight='600'; hdr.style.margin='6px 0'; card.appendChild(hdr);
                // Render the two fields from schema
                const groupedUploads = (grouped['Uploads']||[]);
                const byName = {}; groupedUploads.forEach(f=> byName[f.name]=f);
                function addRow(name){ const f=byName[name]; if(!f) return; const current=effective.settings?.[f.name] ?? defaults.defaults?.[f.name]; const row=buildRow(f.name, defaults.defaults?.[f.name], f.options, current); card.appendChild(row); }
                addRow('UPLOADS_AUTO_CLEAN_ENABLE');
                addRow('UPLOADS_AUTO_CLEAN_INTERVAL_MINUTES');
                // Erase button
                const btn=document.createElement('button'); btn.textContent='Remove uploads folder content'; btn.style.marginTop='10px'; btn.style.padding='8px 12px'; btn.style.border='1px solid #a33'; btn.style.background='#c0392b'; btn.style.color='#fff'; btn.style.borderRadius='4px'; btn.style.cursor='pointer';
                btn.onclick=async()=>{
                    try{ await api('/admin/erase-uploads',{method:'POST', body: JSON.stringify({confirm:true})}); if(typeof window.showNotification==='function') window.showNotification('Uploads folder cleared',1200,'success'); }catch(e){ if(typeof window.showNotification==='function') window.showNotification('Failed to clear uploads',1500,'error'); }
                };
                card.appendChild(btn);
                panel.appendChild(card);
                return;
            }
            if (group !== 'WCS') grouped[group].sort((a,b)=> a.name.localeCompare(b.name)).forEach(f=>{
                // Hide specific RGB keys handled by the custom panel UI
                const HIDE_KEYS_RGB = new Set([
                    'RGB_HST_PANEL_INDEX','RGB_NIRCAM_PANEL_INDEX','RGB_MIRI_PANEL_INDEX','RGB_HA_PANEL_INDEX',
                    'RGB_HST_SHORT_TITLE','RGB_NIRCAM_SHORT_TITLE','RGB_MIRI_SHORT_TITLE','RGB_HA_SHORT_TITLE',
                    'RGB_DISPLAY_HST_MIN_PERCENTILE','RGB_DISPLAY_HST_FIRST_SOURCE_MAX_PERCENTILE',
                    'RGB_DISPLAY_NIRCAM_MIN_PERCENTILE','RGB_DISPLAY_NIRCAM_MAX_PERCENTILE',
                    'RGB_DISPLAY_MIRI_MIN_PERCENTILE','RGB_DISPLAY_MIRI_MAX_PERCENTILE','RGB_HA_PERCENTILE',
                    'RGB_MARKER_SYMBOL','RGB_MARKER_SIZE','RGB_MARKER_ALPHA','RGB_MARKER_EDGE_WIDTH','RGB_MARKER_FACE_COLOR','RGB_MARKER_EDGE_COLOR',
                    'RGB_FIGURE_WIDTH','RGB_FIGURE_HEIGHT','RGB_HA_COLORMAP','RGB_HA_STRETCH',
                    'RGB_TITLE_COLOR','RGB_TITLE_BBOX_FACECOLOR','RGB_TITLE_FONT_SIZE','RGB_TITLE_FONT_WEIGHT','RGB_TITLE_X_POSITION','RGB_TITLE_Y_POSITION',
                    'RGB_FILTERS','CUTOUT_SIZE_ARCSEC'
                ]);
                const HIDE_KEYS_SED = new Set([
                    'SED_XSCALE','SED_YSCALE','SED_MARKERSIZE','SED_MARKER_FMT','SED_OBS_COLOR','SED_ALPHA',
                    'SED_RGB_LABEL_HST','SED_RGB_LABEL_NIRCAM','SED_RGB_LABEL_MIRI','SED_HA_TITLE',
                    'SED_RGB_HST_COMPOSITE_MIN_PERCENTILE','SED_RGB_HST_COMPOSITE_MAX_PERCENTILE',
                    'SED_RGB_NIRCAM_COMPOSITE_MIN_PERCENTILE','SED_RGB_NIRCAM_COMPOSITE_MAX_PERCENTILE',
                    'SED_RGB_MIRI_COMPOSITE_MIN_PERCENTILE','SED_RGB_MIRI_COMPOSITE_MAX_PERCENTILE',
                    'SED_HA_CUTOUT_DISPLAY_MAX_PERCENTILE','SED_NIRCAM_MIRI_CUTOUT_DISPLAY_MAX_PERCENTILE',
                    'SED_FILTER_NAMES','SED_FILTER_WAVELENGTHS',
                    'CIRCLE_COLOR','SED_BKG_SUB_COLOR','SED_BKG_SUB_LABEL','SED_CIRCLE_RADIUS_ARCSEC','SED_CUTOUT_SIZE_ARCSEC','SED_CUTOUT_CMAP','SED_ERR_COLUMN_TEMPLATE',
                    'SED_FIGURE_SIZE_HEIGHT','SED_FIGURE_SIZE_WIDTH','SED_FONTSIZE_INFO','SED_FONTSIZE_LABELS','SED_FONTSIZE_TICKS','SED_FONTSIZE_TITLE','SED_GAUSSIAN_FILTER_SIGMA',
                    'SED_X_LABEL','SED_Y_LABEL'
                ]);
                if (group === 'RGB' && HIDE_KEYS_RGB.has(f.name)) return;
                if (group === 'SED' && HIDE_KEYS_SED.has(f.name)) return;
                const current = effective.settings?.[f.name] ?? defaults.defaults?.[f.name];
                const row = buildRow(f.name, defaults.defaults?.[f.name], f.options, current);
                if (group === 'RGB' && typeof __rgbAdvancedContainer !== 'undefined' && __rgbAdvancedContainer){ __rgbAdvancedContainer.appendChild(row); }
                else if (group === 'SED' && __sedCard) { __sedCard.appendChild(row); }
                else { card.appendChild(row); }
            });
            if (group !== 'SED') panel.appendChild(card);

            // Filter rows by search
            searchInput.addEventListener('input', ()=>{
                const q = (searchInput.value||'').trim().toLowerCase();
                card.querySelectorAll('.settings-row').forEach(r=>{
                    const name = r.dataset.name||''; const title = r.dataset.title||'';
                    r.style.display = (!q || name.toLowerCase().includes(q) || title.includes(q)) ? '' : 'none';
                });
            });

            saveTab.onclick = async()=>{
                // Determine the canonical profile name to save into
                let saveName = me.admin ? 'admin' : currentActiveName;
                if (!me.admin && (!saveName || saveName.toLowerCase() === 'default')){
                    const newName = await promptForNewProfileName('my-profile');
                    if (!newName) return;
                    await api('/settings/profile',{method:'POST', body: JSON.stringify({name: newName, settings: (defaults.defaults||{})})});
                    await api('/settings/active',{method:'POST', body: JSON.stringify({name:newName})});
                    saveName = newName; currentActiveName = newName;
                    // no localStorage persistence for active profile
                    try { profiles = await api('/settings/profiles'); } catch(_){ }
                    try { effective = await api('/settings/effective'); } catch(_){ }
                    updateActiveUI();
                    if (typeof window.showNotification==='function') window.showNotification(`Activated profile: ${newName}`, 1200, 'success');
                }
                if (!saveName){ if (typeof window.showNotification==='function') window.showNotification('Select or create a profile in General first.', 1800, 'warning'); return; }
                let base={};
                try { const pr = await api('/settings/profile/'+encodeURIComponent(saveName)); base = pr.settings||{}; } catch(_){ base = {}; }
                // Merge both generic rows and any proxy fields used by custom UI sections
                const upd = collectSettings(panel);
                // Also pull from proxy fields to ensure values are captured without relying on autosave
                const proxyNodes = panel.querySelectorAll('[data-proxy-field]');
                proxyNodes.forEach(node => {
                    const key = node.dataset.proxyField;
                    const def = defaults.defaults?.[key];
                    const val = parseValue(node, def);
                    if (typeof val !== 'undefined') upd[key] = val;
                });
                const merged = { ...base, ...upd };
                try {
                    await api('/settings/profile',{method:'POST', body: JSON.stringify({name: saveName, settings: merged})});
                    try { effective = await api('/settings/effective'); } catch(_){ }
                    try { applyValuesToInputs((effective&&effective.settings)||{}); } catch(_){ }
                    try { document.dispatchEvent(new CustomEvent('settings:updated')); } catch(_){ }
                    if (typeof window.showNotification==='function') window.showNotification(`Saved ${group} settings`, 1500, 'success');
                } catch (e) {
                    if (e && e.status === 403) {
                        const msg = (e.data && e.data.detail) ? e.data.detail : 'Permission denied';
                        if (typeof window.showNotification==='function') window.showNotification(msg, 2500, 'warning');
                        return;
                    }
                    const fallback = (e && (e.data && e.data.detail)) ? e.data.detail : (e && e.message) ? e.message : 'Failed to save settings';
                    if (typeof window.showNotification==='function') window.showNotification(fallback, 2000, 'error');
                    throw e;
                }
            };
        });

        function updateActiveUI(){
            headerActive.textContent = currentActiveName ? `— Active: ${currentActiveName}` : '';
            Object.keys(panelActiveBadges).forEach(g=>{ panelActiveBadges[g].textContent = currentActiveName ? `Active: ${currentActiveName}` : 'Active: (none)'; });
        }

        // Append panels to content
        content.classList.add('settings-content');
        Object.values(panels).forEach(p=> content.appendChild(p));

        // Restore popup position if stored
        try {
            const pos = JSON.parse(localStorage.getItem('settings.popupPosition')||'null');
            if (pos && pos.left && pos.top){
                const pop = document.getElementById('settings-popup');
                if (pop){ pop.style.transform=''; pop.style.left=pos.left; pop.style.top=pos.top; }
            }
        } catch(_){ }

        function selectTab(id){
            Object.entries(panels).forEach(([k,p])=>{
                const active = (k===id);
                if (active) p.classList.add('active'); else p.classList.remove('active');
            });
            Object.values(tabButtons).forEach(b=>{ b.classList.remove('active'); });
            const btn=tabButtons[id]; if (btn){ btn.classList.add('active'); }
        }
        applyValuesToInputs(effective.settings||{});
        updateActiveUI();
        selectTab('general');

        document.body.appendChild(popup);
    }

    // Expose
    window.openSettingsPopup = openSettingsPopup;
})();

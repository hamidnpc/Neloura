let localCodeMirrorEditor;
let currentExecutionId = null;
let executionTimerInterval = null;
let executionStartMs = null;

// Public toggler used by toolbar button
async function toggleLocalCodingPanel(){
    try {
        console.debug('[local-coding] toggle clicked');
        try { if (typeof ensureSession === 'function') { await ensureSession(); } } catch(_){ }
        const id = 'dynamic-local-coding-panel';
        let exists = document.getElementById(id);
        if (!exists) {
            console.debug('[local-coding] creating container');
            createLocalCodingContainer();
            exists = document.getElementById(id);
        }
        if (!exists) { console.warn('[local-coding] container missing after create'); return; }
        const visible = exists.classList.contains('open');
        console.debug('[local-coding] visible?', visible, 'classes=', exists.className);
        if (visible) { console.debug('[local-coding] hide'); hideLocalCodingPanel(); }
        else { console.debug('[local-coding] show'); showLocalCodingPanel(); }
    } catch(err) {
        console.error('[local-coding] toggle failed:', err);
    }
}

function createLocalCodingContainer() {
    const containerId = 'dynamic-local-coding-panel';
    if (document.getElementById(containerId)) {
        return;
    }

    const container = document.createElement('div');
    container.id = containerId;

    // Resizer handle (left edge)
    const resizer = document.createElement('div');
    resizer.style.position = 'absolute';
    resizer.style.left = '0';
    resizer.style.top = '0';
    resizer.style.width = '6px';
    resizer.style.height = '100%';
    resizer.style.cursor = 'col-resize';
    resizer.style.userSelect = 'none';
    resizer.style.zIndex = '1002';
    resizer.title = 'Drag to resize panel width';
    container.appendChild(resizer);

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;
    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        startWidth = parseInt(window.getComputedStyle(container).width, 10);
        document.body.style.cursor = 'col-resize';
        e.preventDefault();
    });
    const onMouseMove = (e) => {
        if (!isResizing) return;
        const deltaX = e.clientX - startX;
        const newWidth = Math.min(1000, Math.max(360, startWidth - deltaX));
        container.style.width = newWidth + 'px';
    };
    const onMouseUp = () => {
        if (!isResizing) return;
        isResizing = false;
        document.body.style.cursor = '';
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.paddingBottom = '10px';
    header.style.borderBottom = '1px solid rgba(255, 255, 255, 0.2)';

    const title = document.createElement('h2');
    title.textContent = 'Local Python Runner';
    title.style.margin = '0';
    title.style.fontSize = '18px';

    const closeButton = document.createElement('button');
    closeButton.innerHTML = '&times;';
    closeButton.className = 'coding-panel-button';
    closeButton.onclick = hideLocalCodingPanel;

    const statusWrap = document.createElement('div');
    statusWrap.style.display = 'flex';
    statusWrap.style.alignItems = 'center';
    statusWrap.style.gap = '10px';
    statusWrap.style.right = '60px';
    statusWrap.style.position = 'absolute';

    const statusLabel = document.createElement('span');
    statusLabel.id = 'local-status-label';
    statusLabel.textContent = 'Idle';
    statusLabel.style.opacity = '0.8';

    const timerLabel = document.createElement('span');
    timerLabel.id = 'local-timer-label';
    timerLabel.textContent = '0.0s';
    timerLabel.style.opacity = '0.8';

    statusWrap.appendChild(statusLabel);
    statusWrap.appendChild(timerLabel);

    const headerActions = document.createElement('div');
    headerActions.id = 'local-header-actions';
    headerActions.style.display = 'flex';
    headerActions.style.alignItems = 'center';
    headerActions.style.gap = '8px';
    headerActions.style.marginLeft = 'auto';

    header.appendChild(title);
    header.appendChild(statusWrap);
    header.appendChild(headerActions);
    header.appendChild(closeButton);
    container.appendChild(header);

    const editorSection = document.createElement('div');
    editorSection.style.flexGrow = '1';
    editorSection.style.display = 'flex';
    editorSection.style.flexDirection = 'column';
    editorSection.style.minHeight = '0'; // Flexbox fix for overflow

    const editorLabel = document.createElement('h3');
    // Show only a small hint, no main label text
    const editorHint = document.createElement('span');
    editorHint.textContent = '(drag the left edge to increase the panel width)';
    editorHint.style.fontWeight = 'normal';
    editorHint.style.fontSize = '0.85em';
    editorHint.style.opacity = '0.8';
    editorHint.style.marginLeft = '0';
    editorLabel.textContent = '';
    editorLabel.appendChild(editorHint);
    editorLabel.style.marginTop = '15px';
    editorLabel.style.marginBottom = '10px';

    const editorTitleRow = document.createElement('div');
    editorTitleRow.style.display = 'flex';
    editorTitleRow.style.alignItems = 'center';
    editorTitleRow.style.justifyContent = 'space-between';

    const editorActions = document.createElement('div');
    editorActions.id = 'local-editor-actions';
    editorActions.style.display = 'flex';
    editorActions.style.alignItems = 'center';
    editorActions.style.gap = '8px';

    editorTitleRow.appendChild(editorLabel);
    editorTitleRow.appendChild(editorActions);

    const codeEditorTextarea = document.createElement('textarea');
    codeEditorTextarea.id = 'local-code-editor';

    editorSection.appendChild(editorTitleRow);
    editorSection.appendChild(codeEditorTextarea);

    const controlsContainer = document.createElement('div');
    controlsContainer.style.display = 'flex';
    controlsContainer.style.alignItems = 'center';
    controlsContainer.style.marginTop = '10px';

    const runButton = document.createElement('button');
    runButton.id = 'local-run-button';
    runButton.className = 'coding-panel-button';
    runButton.innerHTML = `
        <span class="play-icon" style="display: flex; align-items: center;">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg>
        </span>
        <span class="button-text" style="margin-left: 8px;">Run</span>
    `;
    runButton.onclick = runLocalCodeV2;

    const stopButton = document.createElement('button');
    stopButton.id = 'local-stop-button';
    stopButton.className = 'coding-panel-button';
    stopButton.style.display = 'none'; // Initially hidden
    stopButton.style.backgroundColor = '#c0392b';
    stopButton.style.marginLeft = '10px';
    stopButton.innerHTML = `
        <span class="stop-icon" style="display: flex; align-items: center;">
             <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 6h12v12H6z"></path></svg>
        </span>
        <span class="button-text" style="margin-left: 8px;">Stop</span>
    `;
    stopButton.onclick = stopLocalCodeV2;

    const runSelButton = document.createElement('button');
    runSelButton.id = 'local-run-selection-button';
    runSelButton.className = 'coding-panel-button';
    runSelButton.style.marginLeft = '10px';
    runSelButton.innerHTML = `
        <span class="button-text">Run Selection</span>
    `;
    runSelButton.onclick = runLocalSelectionV2;

    const timeoutLabel = document.createElement('label');
    timeoutLabel.style.marginLeft = '10px';
    timeoutLabel.style.opacity = '0.85';
    timeoutLabel.textContent = 'Timeout (s)';

    const timeoutInput = document.createElement('input');
    timeoutInput.type = 'number';
    timeoutInput.min = '1';
    timeoutInput.value = '60';
    timeoutInput.id = 'local-timeout-input';
    timeoutInput.style.width = '70px';
    timeoutInput.style.marginLeft = '6px';

    const openImageButton = document.createElement('button');
    openImageButton.id = 'local-open-image-button';
    openImageButton.style.backgroundColor = '#7d1e7d';
    openImageButton.style.border = '1px solid #7d1e7d';

    openImageButton.style.marginLeft = '50px';
    openImageButton.className = 'coding-panel-button';
    openImageButton.innerHTML = `
        <span class="button-text">Open Image in Viewer</span>
    `;
    openImageButton.onclick = insertOpenImageTemplate;

    const loader = document.createElement('div');
    loader.id = 'local-run-loader';
    loader.className = 'button-loader';
    loader.style.display = 'none';
    loader.style.marginLeft = '10px';

    controlsContainer.appendChild(runButton);
    controlsContainer.appendChild(stopButton);
    controlsContainer.appendChild(runSelButton);
    controlsContainer.appendChild(timeoutLabel);
    controlsContainer.appendChild(timeoutInput);
    controlsContainer.appendChild(loader);
    // Ensure the button is visible inline in the controls row
    controlsContainer.appendChild(openImageButton);
    container.appendChild(editorSection);
    container.appendChild(controlsContainer);

    // Toolbar row
    const toolbar = document.createElement('div');
    toolbar.style.display = 'flex';
    toolbar.style.alignItems = 'center';
    toolbar.style.marginTop = '8px';

    // Astropy snippets dropdown
    const astroWrap = document.createElement('div');
    astroWrap.style.display = 'flex';
    astroWrap.style.alignItems = 'center';
    astroWrap.style.gap = '6px';

    const astroLabel = document.createElement('span');
    astroLabel.textContent = 'Insert Astropy code:';
    astroLabel.style.opacity = '0.85';

    const astroSelect = document.createElement('select');
    astroSelect.id = 'local-astro-select';
    astroSelect.className = 'coding-panel-select';
    astroSelect.style.background = '#222';
    astroSelect.style.color = '#fff';
    astroSelect.style.border = '1px solid #555';
    astroSelect.style.borderRadius = '4px';
    astroSelect.style.padding = '6px';
    astroSelect.style.minWidth = '220px';
    astroSelect.innerHTML = `
      <option value="">Insert Astropy code…</option>
      <option value="open_catalog">Open catalog viewer</option>
      <option value="write_fits">Write FITS</option>
      <option value="world_to_pix">WCS world->pixel</option>
      <option value="pix_to_world">WCS pixel->world</option>
      <option value="table_from_fits">Table from FITS catalog</option>
      <option value="table_write">Table write to FITS</option>
      <option value="coord_skycoord">SkyCoord parse</option>
      <option value="unit_convert">Units convert</option>
    `;

    astroSelect.onchange = () => insertAstropySnippet(astroSelect.value);
    astroWrap.appendChild(astroLabel);
    astroWrap.appendChild(astroSelect);

    const clearOutputBtn = document.createElement('button');
    clearOutputBtn.className = 'coding-panel-button';
    clearOutputBtn.innerHTML = `<span class="button-text">Clear Output</span>`;
    clearOutputBtn.onclick = () => {
        const output = document.getElementById('local-code-output');
        const imageOutput = document.getElementById('local-code-image-output');
        output.textContent = '';
        imageOutput.innerHTML = '';
    };

    const copyOutputBtn = document.createElement('button');
    copyOutputBtn.className = 'coding-panel-button';
    copyOutputBtn.style.marginLeft = '10px';
    copyOutputBtn.innerHTML = `<span class="button-text">Copy Output</span>`;
    copyOutputBtn.onclick = async () => {
        const output = document.getElementById('local-code-output');
        try { await navigator.clipboard.writeText(output.textContent || ''); } catch (e) {}
    };

    const clearCodeBtn = document.createElement('button');
    clearCodeBtn.className = 'coding-panel-button';
    clearCodeBtn.style.marginLeft = '10px';
    clearCodeBtn.innerHTML = `<span class="button-text">Clear Code</span>`;
    clearCodeBtn.onclick = () => { if (localCodeMirrorEditor) localCodeMirrorEditor.setValue(''); };

    const saveBtn = document.createElement('button');
    saveBtn.className = 'coding-panel-button';
    saveBtn.style.marginLeft = 'auto';
    saveBtn.innerHTML = `<span class="button-text">Save (.py)</span>`;
    saveBtn.onclick = () => {
        if (!localCodeMirrorEditor) return;
        const blob = new Blob([localCodeMirrorEditor.getValue()], { type: 'text/x-python' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'script.py';
        a.click();
        URL.revokeObjectURL(url);
    };

    const loadBtn = document.createElement('button');
    loadBtn.className = 'coding-panel-button';
    loadBtn.style.marginLeft = '10px';
    loadBtn.innerHTML = `<span class="button-text">Load (.py)</span>`;
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.py,text/x-python,text/plain';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const text = await file.text();
        if (localCodeMirrorEditor) localCodeMirrorEditor.setValue(text);
        fileInput.value = '';
    });
    loadBtn.onclick = () => fileInput.click();

    const themeBtn = document.createElement('button');
    themeBtn.className = 'coding-panel-button';
    themeBtn.style.marginLeft = '10px';
    themeBtn.innerHTML = `<span class="button-text">Toggle Theme</span>`;
    themeBtn.onclick = () => {
        if (!localCodeMirrorEditor) return;
        const current = localCodeMirrorEditor.getOption('theme');
        localCodeMirrorEditor.setOption('theme', current === 'dracula' ? 'default' : 'dracula');
    };

    toolbar.appendChild(clearOutputBtn);
    toolbar.appendChild(copyOutputBtn);
    toolbar.appendChild(clearCodeBtn);
    toolbar.appendChild(saveBtn);
    toolbar.appendChild(loadBtn);
    toolbar.appendChild(themeBtn);
    toolbar.appendChild(fileInput);
    container.appendChild(toolbar);

    // Place Astropy dropdown as its own row below the buttons and above Output
    const astroRow = document.createElement('div');
    astroRow.style.display = 'flex';
    astroRow.style.alignItems = 'center';
    astroRow.style.gap = '8px';
    astroRow.style.marginTop = '8px';
    astroRow.appendChild(astroLabel);
    astroRow.appendChild(astroSelect);
    container.appendChild(astroRow);

    const outputSection = document.createElement('div');
    outputSection.style.flexGrow = '1';
    outputSection.style.display = 'flex';
    outputSection.style.flexDirection = 'column';
    outputSection.style.minHeight = '0';
    outputSection.style.overflowY = 'auto';
    outputSection.style.overflowX = 'hidden';

    const outputLabel = document.createElement('h3');
    outputLabel.textContent = 'Output';
    outputLabel.style.marginTop = '15px';
    outputLabel.style.marginBottom = '10px';

    const codeOutput = document.createElement('pre');
    codeOutput.id = 'local-code-output';
    codeOutput.style.width = '100%';
    codeOutput.style.flexGrow = '1';
    codeOutput.style.backgroundColor = '#111';
    codeOutput.style.color = 'white';
    codeOutput.style.border = '1px solid #555';
    codeOutput.style.borderRadius = '4px';
    codeOutput.style.padding = '10px';
    codeOutput.style.whiteSpace = 'pre-wrap';
    codeOutput.style.wordBreak = 'break-all';
    codeOutput.textContent = 'Click "Run" to see the output.';

    const imageOutput = document.createElement('div');
    imageOutput.id = 'local-code-image-output';
    imageOutput.style.marginTop = '10px';
    imageOutput.style.textAlign = 'center';

    outputSection.appendChild(outputLabel);
    outputSection.appendChild(codeOutput);
    outputSection.appendChild(imageOutput);
    container.appendChild(outputSection);

    document.body.appendChild(container);
    // No inline positioning; CSS controls layout. Ensure it's hidden initially (no .open class).

    localCodeMirrorEditor = CodeMirror.fromTextArea(codeEditorTextarea, {
        mode: 'python',
        theme: 'dracula',
        lineNumbers: true,
        indentUnit: 4,
        extraKeys: {
            "Cmd-/": "toggleComment",
            "Ctrl-/": "toggleComment",
            "Ctrl-Space": "autocomplete",
            "Cmd-Enter": () => runLocalCodeV2(),
            "Ctrl-Enter": () => runLocalCodeV2(),
            "Shift-Cmd-Enter": () => runLocalSelectionV2(),
            "Shift-Ctrl-Enter": () => runLocalSelectionV2(),
            "Esc": () => stopLocalCodeV2()
        },
        hintOptions: {
            completeSingle: false,
            hint: combinedHint
        }
    });
    localCodeMirrorEditor.setValue(`# Autocomplete suggestions appear as you type.\n# Use Cmd+/ or Ctrl+/ to comment lines\n\nimport os\n\n# List files in the current directory\nprint(os.listdir("."))`);
    
    // Autocomplete on the fly
    localCodeMirrorEditor.on("inputRead", function(cm, change) {
        if (cm.state.completionActive) return;
        // Don't trigger on paste, cut, or when a non-word character is typed
        if (change.origin !== '+input' || /[\W]/.test(change.text[0])) return;
        
        const token = cm.getTokenAt(cm.getCursor());
        // Do not trigger inside of comments
        if (token.type === 'comment') return;
        
        // Otherwise, trigger the autocomplete
        CodeMirror.commands.autocomplete(cm, null, { completeSingle: false });
    });

    // Ensure the CodeMirror instance takes up the available space.
    localCodeMirrorEditor.getWrapperElement().style.flexGrow = '1';
    localCodeMirrorEditor.getWrapperElement().style.minHeight = '100px';
    localCodeMirrorEditor.getWrapperElement().style.borderRadius = '4px';
}

function insertOpenImageTemplate() {
    if (!localCodeMirrorEditor) return;
    const template = `
# Open a FITS image in the main viewer from in-memory data (optional header)
# Note: When reading from disk, use paths under 'files/'
# data = fits.getdata('files/your_file.fits', ext=0)
# header = fits.getheader('files/your_file.fits', ext=0)
# open_image(data=data, header=header)
`;
    localCodeMirrorEditor.replaceSelection(template);
    localCodeMirrorEditor.focus();
}

function insertAstropySnippet(kind) {
    if (!localCodeMirrorEditor || !kind) return;
    let snippet = '';
    switch (kind) {
        case 'read_fits':
            snippet = `# Open an existing FITS in the main viewer (no temp files)\nopen_image(filepath='files/your_file.fits', hdu_index=0)\n`;
            break;
        case 'write_fits':
            snippet = `from astropy.io import fits\nimport numpy as np\n\n# Write a new FITS\ndata = np.random.random((256, 256)).astype('float32')\nhdu = fits.PrimaryHDU(data=data)\nhdul = fits.HDUList([hdu])\nhdul.writeto('files/new_image.fits', overwrite=True)\n`;
            break;
        case 'open_catalog':
            snippet = `# Open catalog viewer by name (ensure it exists on server)\nopen_catalog('catalogs/your_catalog.fits')\n`;
            break;
        
        case 'world_to_pix':
            snippet = `from astropy.wcs import WCS\n\n# Convert world to pixel coords\nw = WCS(header)  # provide a FITS header with WCS\npx, py = w.world_to_pixel_values(150.0, 2.0)\nprint(px, py)\n`;
            break;
        case 'pix_to_world':
            snippet = `from astropy.wcs import WCS\n\n# Convert pixel to world coords\nw = WCS(header)  # provide a FITS header with WCS\nra, dec = w.pixel_to_world_values(256, 256)\nprint(ra, dec)\n`;
            break;
        case 'table_from_fits':
            snippet = `from astropy.table import Table\n\n# Load a table from a FITS catalog\ntbl = Table.read('files/catalog.fits', format='fits')\nprint(tbl[:5])\n`;
            break;
        case 'table_write':
            snippet = `from astropy.table import Table\n\n# Write a table to FITS\ntbl.write('files/catalog_out.fits', overwrite=True)\n`;
            break;
        case 'coord_skycoord':
            snippet = `from astropy.coordinates import SkyCoord\nimport astropy.units as u\n\n# Parse coordinates and convert units\ncoord = SkyCoord('10h21m0s +20d30m0s', frame='icrs')\nprint(coord.ra.deg, coord.dec.deg)\n`;
            break;
        case 'unit_convert':
            snippet = `import astropy.units as u\n\n# Unit conversion example\nval = 10 * u.arcsec\nprint(val.to(u.degree))\n`;
            break;
        default:
            return;
    }
    localCodeMirrorEditor.replaceSelection(snippet);
    localCodeMirrorEditor.focus();
}

async function pathCompletions(cm) {
    const cursor = cm.getCursor();
    const token = cm.getTokenAt(cursor);

    if (token.type !== 'string') {
        return CodeMirror.hint.anyword(cm);
    }

    const pathPrefix = token.string.substring(1, cursor.ch - token.start);

    try {
        const response = await apiFetch(`/local-coding/autocomplete-paths/?partial_path=${encodeURIComponent(pathPrefix)}`);
        if (!response.ok) return null;
        const completions = await response.json();
        if (!completions || completions.length === 0) return null;

        return {
            list: completions,
            from: CodeMirror.Pos(cursor.line, token.start + 1),
            to: CodeMirror.Pos(cursor.line, token.end - 1)
        };
    } catch (error) {
        console.error("Path completion error:", error);
        return null;
    }
}

// Lightweight Python-aware autocomplete (keywords + builtins)
const PY_KEYWORDS = [
    'and','as','assert','async','await','break','class','continue','def','del','elif','else','except','False','finally','for','from','global','if','import','in','is','lambda','None','nonlocal','not','or','pass','raise','return','True','try','while','with','yield'
];
const PY_BUILTINS = [
    'abs','all','any','bin','bool','bytearray','bytes','callable','chr','classmethod','compile','complex','delattr','dict','dir','divmod','enumerate','eval','exec','filter','float','format','frozenset','getattr','globals','hasattr','hash','help','hex','id','input','int','isinstance','issubclass','iter','len','list','locals','map','max','memoryview','min','next','object','oct','open','ord','pow','print','property','range','repr','reversed','round','set','setattr','slice','sorted','staticmethod','str','sum','super','tuple','type','vars','zip'
];

function pythonCompletions(cm) {
    const cursor = cm.getCursor();
    const token = cm.getTokenAt(cursor);
    // Avoid suggesting inside strings/comments (handled elsewhere)
    if (token.type === 'string' || token.type === 'comment') return null;

    const start = token.start;
    const end = cursor.ch;
    const current = token.string.slice(0, end - start);

    const pool = [...PY_KEYWORDS, ...PY_BUILTINS];
    const list = pool.filter(w => w.startsWith(current)).sort();
    if (list.length === 0) return null;

    return {
        list,
        from: CodeMirror.Pos(cursor.line, start),
        to: CodeMirror.Pos(cursor.line, end)
    };
}

async function combinedHint(cm) {
    const cursor = cm.getCursor();
    const token = cm.getTokenAt(cursor);
    // Matplotlib-aware completions first (e.g., plt., plt.imshow kwargs)
    const mpl = matplotlibCompletions(cm);
    if (mpl) return mpl;
    if (token.type === 'string') {
        return await pathCompletions(cm);
    }
    return pythonCompletions(cm) || CodeMirror.hint.anyword(cm);
}

// Matplotlib (pyplot) smart completions: members after `plt.` and kwargs inside `plt.imshow(...)`
const PYPLOT_MEMBERS = [
    'imshow','imread','imsave','plot','scatter','figure','subplots','subplot','colorbar','xlabel','ylabel','title','legend','xlim','ylim','savefig','gca','gcf','show','contour','contourf','pcolormesh','hist','bar','grid','tight_layout'
];
const IMSHOW_KWARGS = [
    'cmap','norm','vmin','vmax','alpha','interpolation','origin','extent','filternorm','filterrad','resample','url','data','animated','aspect','rasterized','clim'
];

function matplotlibCompletions(cm) {
    const cursor = cm.getCursor();
    const line = cm.getLine(cursor.line);
    const left = line.slice(0, cursor.ch);

    // Member completion after plt.
    const memberMatch = left.match(/([A-Za-z_][\w]*)\.(\w*)$/);
    if (memberMatch && memberMatch[1] === 'plt') {
        const partial = memberMatch[2] || '';
        const list = PYPLOT_MEMBERS.filter(m => m.startsWith(partial)).sort();
        if (list.length === 0) return null;
        const from = cursor.ch - partial.length;
        return {
            list,
            from: CodeMirror.Pos(cursor.line, from),
            to: CodeMirror.Pos(cursor.line, cursor.ch)
        };
    }

    // Kwarg completion inside plt.imshow(...)
    const imIdx = left.lastIndexOf('plt.imshow(');
    if (imIdx !== -1) {
        // Ensure we are still inside the imshow call by checking unmatched parentheses after the call
        const after = left.slice(imIdx + 'plt.imshow('.length);
        const openParens = (after.match(/\(/g) || []).length;
        const closeParens = (after.match(/\)/g) || []).length;
        if (openParens <= closeParens) {
            // likely cursor is not inside plt.imshow(...)
        } else {
            // Collect already used kwargs to avoid duplicates
            const used = new Set();
            let m;
            const kwRegex = /([A-Za-z_]\w*)\s*=/g;
            while ((m = kwRegex.exec(after)) !== null) {
                used.add(m[1]);
            }

            // Determine current partial arg name being typed
            const partMatch = after.match(/(?:^|,)\s*([A-Za-z_]\w*)?$/);
            const partial = (partMatch && partMatch[1]) ? partMatch[1] : '';

            const list = IMSHOW_KWARGS.filter(k => !used.has(k) && k.startsWith(partial))
                .map(k => k + '=');
            if (list.length === 0) return null;
            // Compute from position for replacement within the line
            const from = cursor.ch - partial.length;
            return {
                list,
                from: CodeMirror.Pos(cursor.line, from),
                to: CodeMirror.Pos(cursor.line, cursor.ch)
            };
        }
    }

    return null;
}

// (removed duplicate toggleLocalCodingPanel here; using the one defined near top with debug)

function showLocalCodingPanel() {
    const container = document.getElementById('dynamic-local-coding-panel');
    if (container) {
        container.style.display = 'flex';
        try { container.classList.add('open'); console.debug('[local-coding] show -> add .open'); } catch(_){}
        if (localCodeMirrorEditor) {
            localCodeMirrorEditor.refresh();
        }
    }
}

function hideLocalCodingPanel() {
    const container = document.getElementById('dynamic-local-coding-panel');
    if (container) {
        try { container.classList.remove('open'); console.debug('[local-coding] hide -> remove .open'); } catch(_){}
    }
}

function updateStatus(text) {
    const label = document.getElementById('local-status-label');
    if (label) label.textContent = text;
}

function startTimer() {
    const label = document.getElementById('local-timer-label');
    executionStartMs = Date.now();
    if (executionTimerInterval) clearInterval(executionTimerInterval);
    executionTimerInterval = setInterval(() => {
        if (!label) return;
        const elapsed = (Date.now() - executionStartMs) / 1000;
        label.textContent = `${elapsed.toFixed(1)}s`;
    }, 100);
}

function stopTimer() {
    if (executionTimerInterval) {
        clearInterval(executionTimerInterval);
        executionTimerInterval = null;
    }
}

// Safely inject HTML that contains <script> tags so they execute
function renderHtmlWithScripts(container, html) {
    container.innerHTML = html;
    const scripts = Array.from(container.querySelectorAll('script'));
    scripts.forEach((oldScript) => {
        const newScript = document.createElement('script');
        // Copy attributes (e.g., src, type)
        for (let i = 0; i < oldScript.attributes.length; i++) {
            const attr = oldScript.attributes[i];
            newScript.setAttribute(attr.name, attr.value);
        }
        if (oldScript.textContent) {
            newScript.textContent = oldScript.textContent;
        }
        oldScript.parentNode.replaceChild(newScript, oldScript);
    });
}

async function runLocalSelectionV2() {
    if (!localCodeMirrorEditor) return;
    const selection = localCodeMirrorEditor.getSelection();
    const code = selection && selection.trim() ? selection : localCodeMirrorEditor.getValue();
    await runCodeInternal(code);
}

async function runLocalCodeV2() {
    if (!localCodeMirrorEditor) return;
    const code = localCodeMirrorEditor.getValue();
    await runCodeInternal(code);
}

async function runCodeInternal(code) {
    const output = document.getElementById('local-code-output');
    const imageOutput = document.getElementById('local-code-image-output');
    const runButton = document.getElementById('local-run-button');
    const stopButton = document.getElementById('local-stop-button');
    const loader = document.getElementById('local-run-loader');
    const timeoutInput = document.getElementById('local-timeout-input');

    currentExecutionId = `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    updateStatus('Running');
    startTimer();

    output.textContent = 'Executing...';
    imageOutput.innerHTML = '';
    runButton.style.display = 'none';
    stopButton.style.display = 'flex';
    loader.style.display = 'block';

    try {
        const timeout = parseInt(timeoutInput && timeoutInput.value ? timeoutInput.value : '60', 10);
        const response = await apiFetch('/local-coding/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, execution_id: currentExecutionId, timeout }),
            credentials: 'include'
        });
        
        currentExecutionId = null; 
        const result = await response.json();

        if (response.ok) {
            let outputText = result.stdout || '';
            
            // Check for the magic command to open an image
            const openImageRegex = /__OPEN_IMAGE__\(([^,]+),([^)]+)\)/;
            const match = outputText.match(openImageRegex);

            if (match) {
                // Remove the command from the output
                outputText = outputText.replace(openImageRegex, '').trim();
                
                const filepath = match[1].replace(/[\'"`]/g, '').trim(); // Remove quotes
                const hdu = parseInt(match[2].trim(), 10);
                
                console.log(`Requesting to open image: ${filepath} with HDU: ${hdu}`);

                // Call the existing function from main.js
                if (typeof selectHdu === 'function') {
                    const ws = document.querySelector('.welcome-screen');
                    if (ws && ws.parentNode) { ws.parentNode.removeChild(ws); }
                    selectHdu(hdu, filepath);
                    // Add a confirmation message to the output
                    outputText += `\n\n[INFO] Sent command to open ${filepath} (HDU: ${hdu}) in the main viewer.`;
                } else {
                     outputText += `\n\n[ERROR] Could not find the 'selectHdu' function to open the image.`;
                }
            }

            // Check for the magic command to open a catalog viewer
            const openCatalogRegex = /__OPEN_CATALOG__\(([^)]+)\)/;
            const matchCatalog = outputText.match(openCatalogRegex);
            if (matchCatalog) {
                outputText = outputText.replace(openCatalogRegex, '').trim();
                const catalogName = matchCatalog[1].replace(/[\'"`]/g, '').trim();
                try {
                    await openCatalogFromLocalCoding(catalogName);
                    outputText += `\n\n[INFO] Opened catalog '${catalogName}' in viewer and loaded overlay.`;
                } catch (e) {
                    console.error(e);
                    outputText += `\n\n[ERROR] Could not open catalog: ${e.message || e}`;
                }
            }
            
            let stderrText = result.stderr || '';

            let finalOutput = '';
            if (outputText) {
                finalOutput += `--- STDOUT ---\n${outputText}`;
            }
            if (stderrText) {
                if(finalOutput) finalOutput += '\n\n';
                finalOutput += `--- STDERR ---\n${stderrText}`;
            }
            output.textContent = finalOutput || 'Execution finished with no output.';

            // Render interactive mpld3 plots, if any
            if (Array.isArray(result.plots_html) && result.plots_html.length > 0) {
                result.plots_html.forEach((html) => {
                    const wrapper = document.createElement('div');
                    wrapper.style.marginTop = '10px';
                    renderHtmlWithScripts(wrapper, html);
                    imageOutput.appendChild(wrapper);
                });
            }

            // Multiple images support
            if (Array.isArray(result.images) && result.images.length > 0) {
                result.images.forEach((src) => {
                    const img = document.createElement('img');
                    img.src = src;
                    img.style.maxWidth = '100%';
                    img.style.border = '1px solid #555';
                    img.style.borderRadius = '4px';
                    img.style.marginTop = '10px';
                    imageOutput.appendChild(img);
                });
            } else if (result.image) {
                const img = document.createElement('img');
                img.src = result.image;
                img.style.maxWidth = '100%';
                img.style.border = '1px solid #555';
                img.style.borderRadius = '4px';
                img.style.marginTop = '10px';
                imageOutput.appendChild(img);
            }
            updateStatus('Done');
        } else {
            if (result.detail && result.detail.includes("stopped")) {
                output.textContent = "Execution stopped by user.";
                updateStatus('Stopped');
            } else {
                throw new Error(result.detail || 'An unknown error occurred.');
            }
        }
    } catch (error) {
        output.textContent = `Error: ${error.message}`;
        updateStatus('Error');
    } finally {
        runButton.style.display = 'flex';
        stopButton.style.display = 'none';
        loader.style.display = 'none';
        currentExecutionId = null;
        stopTimer();
    }
}

// Wrapper for updated bindings
async function stopLocalCodeV2() {
    await stopLocalCode();
}
async function runLocalCode() {
    if (!localCodeMirrorEditor) return;
    const output = document.getElementById('local-code-output');
    const imageOutput = document.getElementById('local-code-image-output');
    const runButton = document.getElementById('local-run-button');
    const stopButton = document.getElementById('local-stop-button');
    const loader = document.getElementById('local-run-loader');
    
    const code = localCodeMirrorEditor.getValue();
    currentExecutionId = `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    output.textContent = 'Executing...';
    imageOutput.innerHTML = '';
    runButton.style.display = 'none';
    stopButton.style.display = 'flex';
    loader.style.display = 'block';

    try {
        const response = await apiFetch('/local-coding/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, execution_id: currentExecutionId })
        });
        
        currentExecutionId = null; 
        const result = await response.json();

        if (response.ok) {
            let outputText = result.stdout || '';
            
            // Check for the magic command to open an image
            const openImageRegex = /__OPEN_IMAGE__\(([^,]+),([^)]+)\)/;
            const match = outputText.match(openImageRegex);

            if (match) {
                // Remove the command from the output
                outputText = outputText.replace(openImageRegex, '').trim();
                
                const filepath = match[1].replace(/['"`]/g, '').trim(); // Remove quotes
                const hdu = parseInt(match[2].trim(), 10);
                
                console.log(`Requesting to open image: ${filepath} with HDU: ${hdu}`);

                // Call the existing function from main.js
                if (typeof selectHdu === 'function') {
                    selectHdu(hdu, filepath);
                    // Add a confirmation message to the output
                    outputText += `\n\n[INFO] Sent command to open ${filepath} (HDU: ${hdu}) in the main viewer.`;
                } else {
                     outputText += `\n\n[ERROR] Could not find the 'selectHdu' function to open the image.`;
                }
            }
            
            let stderrText = result.stderr || '';

            let finalOutput = '';
            if (outputText) {
                finalOutput += `--- STDOUT ---\n${outputText}`;
            }
            if (stderrText) {
                if(finalOutput) finalOutput += '\n\n';
                finalOutput += `--- STDERR ---\n${stderrText}`;
            }
            output.textContent = finalOutput || 'Execution finished with no output.';

            if (result.image) {
                const img = document.createElement('img');
                img.src = result.image;
                img.style.maxWidth = '100%';
                img.style.border = '1px solid #555';
                img.style.borderRadius = '4px';
                img.style.marginTop = '10px';
                imageOutput.appendChild(img);
            }
        } else {
            if (result.detail && result.detail.includes("stopped")) {
                output.textContent = "Execution stopped by user.";
            } else {
                throw new Error(result.detail || 'An unknown error occurred.');
            }
        }
    } catch (error) {
        output.textContent = `Error: ${error.message}`;
    } finally {
        runButton.style.display = 'flex';
        stopButton.style.display = 'none';
        loader.style.display = 'none';
        currentExecutionId = null;
    }
}

async function stopLocalCode() {
    if (!currentExecutionId) return;
    const output = document.getElementById('local-code-output');
    output.textContent = 'Stopping execution...';
    const status = document.getElementById('local-status-label');
    if (status) status.textContent = 'Stopping';
    
    try {
        await apiFetch('/local-coding/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ execution_id: currentExecutionId }),
            credentials: 'include'
        });
    } catch (error) {
        console.error(`Error stopping code: ${error.message}`);
    }
}

// Helper used only by Local Coding to open a catalog and ensure viewer is ready
async function openCatalogFromLocalCoding(catalogPath) {
    // Normalize to API name
    const catalogName = (catalogPath || '').toString().split('/').pop().split('\\').pop();
    // Open the catalog viewer UI immediately (no long waits)
    if (typeof showCatalogViewer === 'function') {
        try { showCatalogViewer(catalogName); } catch(_) {}
    }
    // Try one quick deferred overlay attempt; do not loop
    setTimeout(() => {
        try {
            const v = window.viewer || window.tiledViewer;
            if (v && typeof loadCatalogBinary === 'function') {
                loadCatalogBinary(catalogName);
            }
        } catch(_) {}
    }, 200);
    
    // If no viewer API, fall back to direct loaders immediately
    if (typeof showCatalogViewer !== 'function') {
        if (typeof loadCatalogBinary === 'function') {
            try { return await loadCatalogBinary(catalogName); } catch(_) {}
        }
        if (typeof loadCatalog === 'function') {
            return loadCatalog(catalogName);
        }
        throw new Error('No catalog loader function available');
    }
    return;
}
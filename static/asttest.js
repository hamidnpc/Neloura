async function createAstTab(container) {
    container.innerHTML = `
        <div style="padding: 10px; color: white;">
            <div class="ast-tabs" style="margin-bottom: 10px; display:flex; gap:8px;">
                <button id="ast-tab-inject" class="ast-tab-btn">Inject Fake sources</button>
                <button id="ast-tab-plot" class="ast-tab-btn">Plot AST</button>
            </div>
            <div id="ast-form-container"></div>
        </div>
    `;

    // Inject tab styles (one-time)
    if (!document.getElementById('ast-tabs-style')) {
        const style = document.createElement('style');
        style.id = 'ast-tabs-style';
        style.textContent = `
            .ast-tab-btn {
                background: #6D28D9; /* purple-700 */
                color: #fff;
                border: 1px solid #7C3AED; /* purple-600 */
                border-radius: 10px;
                padding: 10px 16px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transform: translateZ(0);
                transition: background 160ms ease, box-shadow 160ms ease, transform 120ms ease;
                box-shadow: 0 4px 10px rgba(109,40,217,0.3);
            }
            .ast-tab-btn:hover { background: #7C3AED; box-shadow: 0 6px 14px rgba(124,58,237,0.35); }
            .ast-tab-btn.active { background: #8B5CF6; border-color: #8B5CF6; }
            .ast-tab-content {
                transition: opacity 220ms ease, transform 220ms ease;
                will-change: opacity, transform;
            }
            .ast-tab-hidden { opacity: 0; transform: translateX(-8px); pointer-events: none; height: 0; overflow: hidden; }
            .ast-tab-visible { opacity: 1; transform: translateX(0); }
            .ast-section-title {
                font-weight: 700; margin: 10px 0 6px; color: #e5e7eb;
            }
            .ast-input {
                width: 100%; padding: 8px; background: #333; color: #fff; border: 1px solid #555; border-radius: 6px;
            }
        `;
        document.head.appendChild(style);
    }

    const formContainer = container.querySelector('#ast-form-container');
    let lastHduInfo = null;

    // Inline message bar for persistent status inside AST tab
    const astMessageBar = document.createElement('div');
    astMessageBar.id = 'ast-inline-message';
    astMessageBar.style.display = 'none';
    astMessageBar.style.margin = '10px 0';
    astMessageBar.style.padding = '10px 12px';
    astMessageBar.style.borderRadius = '6px';
    astMessageBar.style.border = '1px solid #444';
    astMessageBar.style.background = '#1f2a37';
    astMessageBar.style.color = '#e5e7eb';
    astMessageBar.style.position = 'relative';
    const astMessageClose = document.createElement('button');
    astMessageClose.textContent = '×';
    astMessageClose.style.position = 'absolute';
    astMessageClose.style.right = '8px';
    astMessageClose.style.top = '4px';
    astMessageClose.style.background = 'transparent';
    astMessageClose.style.border = 'none';
    astMessageClose.style.color = '#9ca3af';
    astMessageClose.style.cursor = 'pointer';
    astMessageClose.style.fontSize = '18px';
    astMessageClose.addEventListener('click', () => {
        astMessageBar.style.display = 'none';
    });
    astMessageBar.appendChild(astMessageClose);
    const astMessageText = document.createElement('div');
    astMessageText.style.paddingRight = '24px';
    astMessageBar.appendChild(astMessageText);
    formContainer.appendChild(astMessageBar);

    function showAstMessage(message, type = 'info', sticky = true) {
        astMessageText.textContent = String(message || '');
        if (type === 'success') {
            astMessageBar.style.background = '#0b3d2e';
            astMessageBar.style.borderColor = '#14532d';
            astMessageBar.style.color = '#d1fae5';
        } else if (type === 'error') {
            astMessageBar.style.background = '#3f1d1d';
            astMessageBar.style.borderColor = '#7f1d1d';
            astMessageBar.style.color = '#fee2e2';
        } else if (type === 'warning') {
            astMessageBar.style.background = '#3b2a1f';
            astMessageBar.style.borderColor = '#78350f';
            astMessageBar.style.color = '#ffedd5';
        } else {
            astMessageBar.style.background = '#1f2a37';
            astMessageBar.style.borderColor = '#374151';
            astMessageBar.style.color = '#e5e7eb';
        }
        astMessageBar.style.display = 'block';
        if (!sticky) {
            setTimeout(() => { astMessageBar.style.display = 'none'; }, 4000);
        }
    }

    // Helper function to create a file picker
    function createAstFilePicker(id, label, onFileSelected) {
        const wrapper = document.createElement('div');
        wrapper.style.marginBottom = '10px';

        const labelElement = document.createElement('label');
        labelElement.textContent = label;
        labelElement.style.display = 'block';
        labelElement.style.marginBottom = '5px';

        const pickerContainer = document.createElement('div');
        pickerContainer.style.display = 'flex';
        pickerContainer.style.alignItems = 'center';

        const selectedFileDisplay = document.createElement('span');
        selectedFileDisplay.id = `${id}-display`;
        selectedFileDisplay.textContent = 'No file selected';
        selectedFileDisplay.style.flexGrow = '1';
        selectedFileDisplay.style.padding = '8px';
        selectedFileDisplay.style.backgroundColor = '#2a2a2a';
        selectedFileDisplay.style.border = '1px solid #555';
        selectedFileDisplay.style.borderRadius = '4px 0 0 4px';
        selectedFileDisplay.style.whiteSpace = 'nowrap';
        selectedFileDisplay.style.overflow = 'hidden';
        selectedFileDisplay.style.textOverflow = 'ellipsis';


        const browseButton = document.createElement('button');
        browseButton.textContent = 'Browse...';
        browseButton.style.padding = '8px 12px';
        browseButton.style.backgroundColor = '#007bff';
        browseButton.style.color = 'white';
        browseButton.style.border = '1px solid #007bff';
        browseButton.style.borderLeft = 'none';
        browseButton.style.borderRadius = '0 4px 4px 0';
        browseButton.style.cursor = 'pointer';

        browseButton.addEventListener('click', () => {
            showFileBrowser((filepath) => {
                selectedFileDisplay.textContent = filepath;
                selectedFileDisplay.title = filepath;
                if (onFileSelected) {
                    onFileSelected(filepath);
                }
            });
        });
        pickerContainer.appendChild(selectedFileDisplay);
        pickerContainer.appendChild(browseButton);
        wrapper.appendChild(labelElement);
        wrapper.appendChild(pickerContainer);

        return wrapper;
    }

    // Helper function to create a dropdown
    function createDropdown(id, label, options) {
        const wrapper = document.createElement('div');
        wrapper.style.marginBottom = '10px';
        const labelElement = document.createElement('label');
        labelElement.textContent = label;
        labelElement.style.display = 'block';
        labelElement.style.marginBottom = '5px';
        const select = document.createElement('select');
        select.id = id;
        select.style.width = '100%';
        select.style.padding = '8px';
        select.style.backgroundColor = '#333';
        select.style.color = 'white';
        select.style.border = '1px solid #555';
        options.forEach(option => {
            const opt = document.createElement('option');
            opt.value = option.value;
            opt.textContent = option.text;
            select.appendChild(opt);
        });
        wrapper.appendChild(labelElement);
        wrapper.appendChild(select);
        return wrapper;
    }

    // Helper function to fetch files
    async function fetchFiles(directory) {
        try {
            const response = await apiFetch(`/list-files/${directory}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            return data.files.filter(file => file.type === 'file').map(file => ({ value: file.path, text: file.name }));
        } catch (error) {
            console.error(`Error fetching files from ${directory}:`, error);
            return [{ value: '', text: `Error loading files from ${directory}` }];
        }
    }

    // Tab switching
    const tabInjectBtn = container.querySelector('#ast-tab-inject');
    const tabPlotBtn = container.querySelector('#ast-tab-plot');
    function setActiveTab(which) {
        if (which === 'inject') {
            tabInjectBtn.style.background = '#374151';
            tabPlotBtn.style.background = '#111827';
        } else {
            tabInjectBtn.style.background = '#111827';
            tabPlotBtn.style.background = '#374151';
        }
    }

    // Containers for each tab
    const injectContainer = document.createElement('div');
    injectContainer.className = 'ast-tab-content ast-tab-visible';
    const plotContainer = document.createElement('div');
    plotContainer.className = 'ast-tab-content ast-tab-hidden';
    formContainer.appendChild(injectContainer);
    formContainer.appendChild(plotContainer);

    tabInjectBtn.addEventListener('click', () => {
        injectContainer.classList.remove('ast-tab-hidden');
        injectContainer.classList.add('ast-tab-visible');
        plotContainer.classList.remove('ast-tab-visible');
        plotContainer.classList.add('ast-tab-hidden');
        setActiveTab('inject');
    });
    tabPlotBtn.addEventListener('click', () => {
        injectContainer.classList.remove('ast-tab-visible');
        injectContainer.classList.add('ast-tab-hidden');
        plotContainer.classList.remove('ast-tab-hidden');
        plotContainer.classList.add('ast-tab-visible');
        setActiveTab('plot');
    });

    setActiveTab('inject');

    // Build Inject Tab UI inside injectContainer
    // 1. FITS file picker
    const fitsFilePicker = createAstFilePicker('ast-fits-file', 'Select FITS File', async (fitsFile) => {
        const hduSelect = hduDropdown.querySelector('select');
        hduSelect.innerHTML = ''; // Clear previous options

        // Update pixel scale display
        updatePixelScaleDisplay(fitsFile, 'ast-image-scale-display');

        if (fitsFile) {
            try {
                const response = await apiFetch(`/fits-hdu-info/${encodeURIComponent(fitsFile)}`);
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
                }
                const hduData = await response.json();
                const hduInfo = hduData.hduList || [];
                lastHduInfo = hduInfo;

                const imageHdus = hduInfo.filter(h => h.dimensions);
                if (imageHdus.length === 0) {
                    const opt = document.createElement('option');
                    opt.value = '';
                    opt.textContent = 'No image HDUs found';
                    hduSelect.appendChild(opt);
                    return;
                }

                imageHdus.forEach(hdu => {
                    const opt = document.createElement('option');
                    const dims = Array.isArray(hdu.dimensions) ? ` ${hdu.dimensions.join('x')}` : '';
                    const rec = hdu.isRecommended ? ' (recommended)' : '';
                    opt.value = hdu.index;
                    opt.textContent = `HDU ${hdu.index}: ${hdu.name || 'Primary'}${dims}${rec}`;
                    hduSelect.appendChild(opt);
                });

                const recommended = imageHdus.find(h => h.isRecommended);
                if (recommended) {
                    hduSelect.value = recommended.index;
                } else {
                    hduSelect.selectedIndex = 0;
                }
            } catch (error) {
                console.error('Error fetching HDU info:', error);
                const opt = document.createElement('option');
                opt.textContent = 'Error loading HDUs';
                hduSelect.appendChild(opt);
            }
        } else {
            const opt = document.createElement('option');
            opt.textContent = 'Select FITS file first';
            hduSelect.appendChild(opt);
        }
    });
    injectContainer.appendChild(fitsFilePicker);

    // --- Pixel Scale Display ---
    function createScaleDisplay(id, label) {
        const wrapper = document.createElement('div');
        wrapper.style.marginBottom = '5px';
        wrapper.style.padding = '6px';
        wrapper.style.backgroundColor = '#222';
        wrapper.style.border = '1px solid #444';
        wrapper.style.borderRadius = '4px';
        wrapper.style.fontSize = '0.8em';
        wrapper.innerHTML = `${label}: <span id="${id}" style="font-weight: bold; color: #66bfff;">Not selected</span>`;
        return wrapper;
    }

    // This container will hold both displays and be appended after the PSF dropdown
    const scaleDisplayContainer = document.createElement('div');
    scaleDisplayContainer.style.marginTop = '10px';
    injectContainer.appendChild(scaleDisplayContainer);

    const imageScaleDisplay = createScaleDisplay('ast-image-scale-display', 'Input Image Scale');
    scaleDisplayContainer.appendChild(imageScaleDisplay);

    const psfScaleDisplay = createScaleDisplay('ast-psf-scale-display', 'PSF Scale');
    scaleDisplayContainer.appendChild(psfScaleDisplay);

    async function updatePixelScaleDisplay(filepath, displayId) {
        const displaySpan = document.getElementById(displayId);
        if (!filepath) {
            displaySpan.textContent = 'Not selected';
            return;
        }
        displaySpan.textContent = 'Loading...';
        try {
            const response = await apiFetch(`/get-pixel-scale/${encodeURIComponent(filepath)}`);
            const data = await response.json();
            if (response.ok) {
                displaySpan.textContent = `${data.pixel_scale_arcsec.toFixed(5)} arcsec/pixel`;
                displaySpan.style.color = '#66bfff';
            } else {
                displaySpan.textContent = `Error: ${data.detail || 'Unknown error'}`;
                displaySpan.style.color = '#ff6666';
            }
        } catch (error) {
            displaySpan.textContent = 'Error fetching scale';
            displaySpan.style.color = '#ff6666';
        }
    }

    // 2. HDU dropdown
    const hduDropdown = createDropdown('ast-hdu', 'Select HDU', [{text: 'Select FITS file first', value: ''}]);
    injectContainer.appendChild(hduDropdown);

    // 3. PSF file picker
    const psfFilePicker = createAstFilePicker('ast-psf-file', 'Select PSF File', (psfFile) => {
        updatePixelScaleDisplay(psfFile, 'ast-psf-scale-display');
    });
    injectContainer.appendChild(psfFilePicker);

    // Removed separation feature (checkbox, catalog picker, separation value)

    // JWST Filter dropdown (moved here, before Number of sources)
    const jwstFilterOptions = [
        { value: 'F200W', text: 'F200W' },
        { value: 'F300M', text: 'F300M' },
        { value: 'F335M', text: 'F335M' },
        { value: 'F360M', text: 'F360M' },
        { value: 'F770M', text: 'F770M' },
        { value: 'F1000W', text: 'F1000W' },
        { value: 'F1130W', text: 'F1130W' },
        { value: 'F2100W', text: 'F2100W' },
    ];
    const filterDropdown = createDropdown('ast-filter', 'JWST Filter for Photomtery', jwstFilterOptions);
    injectContainer.appendChild(filterDropdown);

    // Flux range multipliers (min/max) before Number of sources
    const fluxMultipliersWrapper = document.createElement('div');
    fluxMultipliersWrapper.style.marginBottom = '10px';
    const fluxLabel = document.createElement('label');
    fluxLabel.textContent = 'Flux range multipliers (uniform in [min×sky, max×sky])';
    fluxLabel.style.display = 'block';
    fluxLabel.style.marginBottom = '5px';
    const fluxInputsContainer = document.createElement('div');
    fluxInputsContainer.style.display = 'flex';
    fluxInputsContainer.style.gap = '10px';
    
    const fluxMinInput = document.createElement('input');
    fluxMinInput.type = 'number';
    fluxMinInput.id = 'ast-flux-min-multiplier';
    fluxMinInput.placeholder = 'Min (e.g., 5)';
    fluxMinInput.value = 5;
    fluxMinInput.min = '0';
    fluxMinInput.step = '0.1';
    fluxMinInput.style.flex = '1';
    fluxMinInput.style.padding = '8px';
    fluxMinInput.style.backgroundColor = '#333';
    fluxMinInput.style.color = 'white';
    fluxMinInput.style.border = '1px solid #555';
    
    const fluxMaxInput = document.createElement('input');
    fluxMaxInput.type = 'number';
    fluxMaxInput.id = 'ast-flux-max-multiplier';
    fluxMaxInput.placeholder = 'Max (e.g., 1000)';
    fluxMaxInput.value = 1000;
    fluxMaxInput.min = '0';
    fluxMaxInput.step = '1';
    fluxMaxInput.style.flex = '1';
    fluxMaxInput.style.padding = '8px';
    fluxMaxInput.style.backgroundColor = '#333';
    fluxMaxInput.style.color = 'white';
    fluxMaxInput.style.border = '1px solid #555';
    
    fluxInputsContainer.appendChild(fluxMinInput);
    fluxInputsContainer.appendChild(fluxMaxInput);
    fluxMultipliersWrapper.appendChild(fluxLabel);
    fluxMultipliersWrapper.appendChild(fluxInputsContainer);
    injectContainer.appendChild(fluxMultipliersWrapper);

    // 7. Number of sources input
    const numSourcesInput = document.createElement('input');
    numSourcesInput.type = 'number';
    numSourcesInput.id = 'ast-num-sources';
    numSourcesInput.placeholder = 'Number of sources to inject';
    numSourcesInput.value = 2000;
    numSourcesInput.style.width = '100%';
    numSourcesInput.style.padding = '8px';
    numSourcesInput.style.backgroundColor = '#333';
    numSourcesInput.style.color = 'white';
    numSourcesInput.style.border = '1px solid #555';
    numSourcesInput.style.marginBottom = '10px';
    const numSourcesLabel = document.createElement('label');
    numSourcesLabel.textContent = 'Number of sources';
    numSourcesLabel.style.display = 'block';
    numSourcesLabel.style.marginBottom = '5px';
    const numSourcesWrapper = document.createElement('div');
    numSourcesWrapper.appendChild(numSourcesLabel);
    numSourcesWrapper.appendChild(numSourcesInput);
    injectContainer.appendChild(numSourcesWrapper);
    
    // 8. Submit button
    const submitButton = document.createElement('button');
    submitButton.textContent = 'Inject Sources';
    submitButton.style.padding = '10px 15px';
    submitButton.style.backgroundColor = '#4CAF50';
    submitButton.style.color = 'white';
    submitButton.style.border = 'none';
    submitButton.style.borderRadius = '4px';
    submitButton.style.cursor = 'pointer';

    submitButton.addEventListener('click', async () => {

        // Validate HDU has image data
        const selectedHduVal = document.getElementById('ast-hdu').value;
        const selectedHduIdx = parseInt(selectedHduVal);
        if (!lastHduInfo || !Number.isInteger(selectedHduIdx)) {
            alert('Please select a valid image HDU.');
            return;
        }
        const selectedHduInfo = (lastHduInfo || []).find(h => h.index === selectedHduIdx);
        if (!selectedHduInfo || !selectedHduInfo.dimensions) {
            alert('Selected HDU has no image data. Please choose another HDU (try the recommended one).');
            return;
        }

        const formData = {
            fitsFile: document.getElementById('ast-fits-file-display').textContent,
            hdu: parseInt(document.getElementById('ast-hdu').value),
            psfFile: document.getElementById('ast-psf-file-display').textContent,
            // separation options removed
            numSources: parseInt(document.getElementById('ast-num-sources').value),
            filterName: document.getElementById('ast-filter').value,
            fluxMinMultiplier: parseFloat(document.getElementById('ast-flux-min-multiplier').value),
            fluxMaxMultiplier: parseFloat(document.getElementById('ast-flux-max-multiplier').value)
        };
        
        // Basic validation
        if (!formData.fitsFile || !formData.psfFile) {
            alert('Please select a FITS file and a PSF file.');
            return;
        }
        if (!formData.filterName) {
            alert('Please select a JWST filter.');
            return;
        }
        if (!(isFinite(formData.fluxMinMultiplier) && isFinite(formData.fluxMaxMultiplier) && formData.fluxMinMultiplier >= 0 && formData.fluxMaxMultiplier > formData.fluxMinMultiplier)) {
            alert('Please provide valid flux multipliers (min >= 0 and max > min).');
            return;
        }

        submitButton.textContent = 'Injecting...';
        submitButton.disabled = true;

        try {
            const response = await apiFetch('/ast-inject/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            const result = await response.json();

            if (response.ok) {
                showAstMessage('Injection successful! Check Upload folder.', 'success', true);
            } else {
                const detail = (result && (result.detail || result.error)) ? (result.detail || result.error) : 'Unknown error';
                let friendly = detail;
                if (/NoneType.*astype/.test(detail)) {
                    friendly = 'Selected HDU has no image data. Please choose another HDU (try the recommended one).';
                }
                showAstMessage(`Error: ${friendly}`, 'error', true);
            }
        } catch (error) {
            console.error('Error during AST injection:', error);
            showAstMessage('An error occurred during AST injection. Check the console for details.', 'error', true);
        } finally {
            submitButton.textContent = 'Inject Sources';
            submitButton.disabled = false;
        }
    });

    injectContainer.appendChild(submitButton);

    // Build AST Plot Tab UI inside plotContainer
    const plotControls = document.createElement('div');
    plotControls.style.marginTop = '10px';
    plotControls.style.display = 'block';
    plotControls.style.gap = '10px';

    // Catalog selectors with refresh button
    const catalogsHeader = document.createElement('div');
    catalogsHeader.style.display = 'flex';
    catalogsHeader.style.alignItems = 'center';
    catalogsHeader.style.justifyContent = 'space-between';
    const catalogsTitle = document.createElement('div');
    catalogsTitle.className = 'ast-section-title';
    catalogsTitle.textContent = 'Catalogs';
    const refreshBtn = document.createElement('button');
    refreshBtn.textContent = 'Refresh';
    refreshBtn.style.background = '#374151';
    refreshBtn.style.color = '#fff';
    refreshBtn.style.border = '1px solid #4b5563';
    refreshBtn.style.borderRadius = '6px';
    refreshBtn.style.padding = '6px 10px';
    refreshBtn.style.cursor = 'pointer';
    refreshBtn.style.fontSize = '12px';
    refreshBtn.addEventListener('click', async () => {
        try {
            refreshBtn.disabled = true;
            refreshBtn.textContent = 'Refreshing...';
            await populateCatalogDropdowns();
            showAstMessage('Catalog lists refreshed.', 'success', false);
        } catch (_) {
            showAstMessage('Failed to refresh catalogs.', 'error', false);
        } finally {
            refreshBtn.disabled = false;
            refreshBtn.textContent = 'Refresh';
        }
    });
    // Upload button (uploads to files/uploads using progress circle)
    const uploadBtn = document.createElement('button');
    uploadBtn.textContent = 'Upload';
    uploadBtn.style.background = '#2563EB';
    uploadBtn.style.color = '#fff';
    uploadBtn.style.border = '1px solid #1d4ed8';
    uploadBtn.style.borderRadius = '6px';
    uploadBtn.style.padding = '6px 10px';
    uploadBtn.style.cursor = 'pointer';
    uploadBtn.style.fontSize = '12px';
    uploadBtn.style.marginLeft = '8px';

    function showCircleProgress(show) {
        try {
            const el = document.getElementById('progress-container');
            if (!el) return;
            el.style.display = show ? '' : 'none';
            const eta = document.getElementById('progress-eta');
            if (eta && show) eta.textContent = 'Uploading...';
        } catch (_) {}
    }
    function updateCircleProgress(percent) {
        try {
            const bar = document.getElementById('progress-bar');
            if (!bar) return;
            const p = Math.max(0, Math.min(100, Number(percent || 0)));
            const dashOffset = 100 - p; // stroke-dasharray 100 100
            bar.style.strokeDashoffset = String(dashOffset);
            const eta = document.getElementById('progress-eta');
            if (eta) eta.textContent = `${Math.round(p)}%`;
        } catch (_) {}
    }

    uploadBtn.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.fits,.fit';
        input.style.display = 'none';
        input.addEventListener('change', () => {
            const file = input.files && input.files[0];
            if (!file) return;
            const form = new FormData();
            form.append('file', file);
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/upload-fits/', true);
            xhr.upload.onprogress = (evt) => {
                if (evt.lengthComputable) {
                    const pct = (evt.loaded / Math.max(1, evt.total)) * 100;
                    updateCircleProgress(pct);
                } else {
                    updateCircleProgress(0);
                }
            };
            xhr.onreadystatechange = async () => {
                if (xhr.readyState !== 4) return;
                try {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        showAstMessage('Upload complete. Refreshing catalogs...', 'success', false);
                        await populateCatalogDropdowns();
                    } else {
                        showAstMessage('Upload failed.', 'error', false);
                    }
                } finally {
                    showCircleProgress(false);
                    updateCircleProgress(0);
                }
            };
            try {
                showCircleProgress(true);
                updateCircleProgress(0);
                xhr.send(form);
            } catch (e) {
                showCircleProgress(false);
                showAstMessage('Upload error.', 'error', false);
            }
        });
        document.body.appendChild(input);
        input.click();
        setTimeout(() => { try { document.body.removeChild(input); } catch (_) {} }, 0);
    });

    catalogsHeader.appendChild(catalogsTitle);
    catalogsHeader.appendChild(refreshBtn);
    catalogsHeader.appendChild(uploadBtn);
    plotControls.appendChild(catalogsHeader);

    // Replace file pickers with simple dropdowns populated from /list-files/CATALOGS_DIRECTORY
    function createCatalogDropdown(id, label) {
        const wrap = document.createElement('div');
        wrap.style.display = 'block';
        const lbl = document.createElement('label');
        lbl.textContent = label;
        lbl.style.margin = '6px 0';
        const sel = document.createElement('select');
        sel.id = id;
        sel.className = 'ast-input';
        wrap.appendChild(lbl);
        wrap.appendChild(sel);
        return { wrap, sel };
    }

    const fakeDropdown = createCatalogDropdown('ast-plot-fake', 'Fake Sources Catalog');
    const detDropdown = createCatalogDropdown('ast-plot-detected', 'Detected (real+fake) Catalog');
    plotControls.appendChild(fakeDropdown.wrap);
    plotControls.appendChild(detDropdown.wrap);

    // No explicit galaxy input (handled automatically on backend if present)

    // Helper available to both flux/color population and catalog population
    async function loadColumnsFor(catalogPath) {
        if (!catalogPath) return [];
        try {
            // Pass full relative path so uploads work server-side
            const resp = await apiFetch(`/catalog-columns/?catalog_name=${encodeURIComponent(catalogPath)}`);
            const data = await resp.json();
            return Array.isArray(data.columns) ? data.columns : [];
        } catch (e) {
            console.warn('Failed to load columns for', catalogPath, e);
            return [];
        }
    }

    // Flux column selector (must exist before we populate catalogs)
    const fluxTitle = document.createElement('div');
    fluxTitle.className = 'ast-section-title';
    fluxTitle.textContent = 'Flux column';
    plotControls.appendChild(fluxTitle);

    const fluxWrap = document.createElement('div');
    const fluxLabelEl = document.createElement('label');
    fluxLabelEl.textContent = 'Select flux column (from Fake Sources Catalog)';
    fluxLabelEl.style.display = 'block';
    fluxLabelEl.style.margin = '6px 0';
    const fluxSelect = document.createElement('select');
    fluxSelect.id = 'ast-plot-flux-select';
    fluxSelect.className = 'ast-input';
    fluxWrap.appendChild(fluxLabelEl);
    fluxWrap.appendChild(fluxSelect);
    plotControls.appendChild(fluxWrap);

    // Color code selector (depends on loadColumnsFor and fakeDropdown)
    const colorWrap = document.createElement('div');
    const colorLabelEl = document.createElement('label');
    colorLabelEl.textContent = 'Color code by column';
    colorLabelEl.style.display = 'block';
    colorLabelEl.style.margin = '6px 0';
    const colorSelect = document.createElement('select');
    colorSelect.id = 'ast-plot-color-select';
    colorSelect.className = 'ast-input';
    colorWrap.appendChild(colorLabelEl);
    colorWrap.appendChild(colorSelect);
    plotControls.appendChild(colorWrap);

    // Populate color dropdown with columns
    async function refreshColorColumns() {
        const fakeSelVal = fakeDropdown.sel.value;
        const cols = await loadColumnsFor(fakeSelVal);
        colorSelect.innerHTML = '';
        const noneOpt = document.createElement('option');
        noneOpt.value = '';
        noneOpt.textContent = 'None';
        colorSelect.appendChild(noneOpt);

        cols.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            colorSelect.appendChild(opt);
        });
    }

    // Refresh color options when fake catalog changes
    fakeDropdown.sel.addEventListener('change', refreshColorColumns);

    async function populateCatalogDropdowns() {
        try {
            // Fetch main catalogs and uploads catalogs
            const [resMain, resUploads] = await Promise.all([
                apiFetch(`/list-files/catalogs`),
                apiFetch(`/list-files/files/uploads`)
            ]);
            const [jsMain, jsUploads] = await Promise.all([resMain.json(), resUploads.json()]);
            const mainFiles = (jsMain.files || []).filter(f => f.type === 'file' && /\.fits$/i.test(f.name));
            const uploadFiles = (jsUploads.files || []).filter(f => {
                if (f.type !== 'file') return false;
                const name = f.name || '';
                if (!/\.fits$/i.test(name)) return false;
                return /^(injected_catalog_|peak_catalog_)/i.test(name);
            });

            // Merge lists (main first, then uploads)
            const files = mainFiles.concat(uploadFiles);

            function fill(sel) {
                sel.innerHTML = '';
                const placeholder = document.createElement('option');
                placeholder.value = '';
                placeholder.textContent = 'Select a catalog (.fits)';
                sel.appendChild(placeholder);
                files.forEach(f => {
                    const opt = document.createElement('option');
                    opt.value = f.path; // full relative path works for uploads and main
                    opt.textContent = f.name;
                    sel.appendChild(opt);
                });
            }
            fill(fakeDropdown.sel);
            fill(detDropdown.sel);

            async function refreshFluxColumns() {
                const fakeSelVal = fakeDropdown.sel.value;
                const cols = await loadColumnsFor(fakeSelVal);
                fluxSelect.innerHTML = '';
                cols.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c;
                    opt.textContent = c;
                    fluxSelect.appendChild(opt);
                });
                // try to preselect a common column if present
                const preferred = ['FLUX','F2100W','F1130W','F1000W','F770M','F360M','F335M','F300M','F200W'];
                for (const p of preferred) {
                    const opt = Array.from(fluxSelect.options).find(o => o.value.toLowerCase() === p.toLowerCase());
                    if (opt) { fluxSelect.value = opt.value; break; }
                }
            }

            fakeDropdown.sel.addEventListener('change', refreshFluxColumns);
            await refreshFluxColumns();
            await refreshColorColumns();
        } catch (e) {
            console.error('Failed to load catalogs', e);
        }
    }
    await populateCatalogDropdowns();

    const paramsTitle = document.createElement('div');
    paramsTitle.className = 'ast-section-title';
    paramsTitle.textContent = 'Matching parameters';
    plotControls.appendChild(paramsTitle);

    // Numeric inputs (100% width)
    const minSepLabel = document.createElement('label');
    minSepLabel.textContent = 'Minimum fake-fake separation (arcsec)';
    minSepLabel.style.display = 'block';
    minSepLabel.style.margin = '6px 0';
    const minSepInput = document.createElement('input');
    minSepInput.type = 'number';
    minSepInput.id = 'ast-plot-min-sep';
    minSepInput.placeholder = 'Min fake-fake sep (arcsec)';
    minSepInput.value = 1.5;
    minSepInput.step = '0.1';
    minSepInput.className = 'ast-input';

    const matchRadiusLabel = document.createElement('label');
    matchRadiusLabel.textContent = 'Match radius (arcsec)';
    matchRadiusLabel.style.display = 'block';
    matchRadiusLabel.style.margin = '6px 0';
    const matchRadiusInput = document.createElement('input');
    matchRadiusInput.type = 'number';
    matchRadiusInput.id = 'ast-plot-match-radius';
    matchRadiusInput.placeholder = 'Match radius (arcsec)';
    matchRadiusInput.value = 0.67;
    matchRadiusInput.step = '0.01';
    matchRadiusInput.className = 'ast-input';

    plotControls.appendChild(minSepLabel);
    plotControls.appendChild(minSepInput);
    plotControls.appendChild(matchRadiusLabel);
    plotControls.appendChild(matchRadiusInput);

    

    // Colormap selector
    const colormapWrap = document.createElement('div');
    const colormapLabelEl = document.createElement('label');
    colormapLabelEl.textContent = 'Colormap';
    colormapLabelEl.style.display = 'block';
    colormapLabelEl.style.margin = '6px 0';
    const colormapSelect = document.createElement('select');
    colormapSelect.id = 'ast-plot-colormap-select';
    colormapSelect.className = 'ast-input';
    
    const colormaps = [
        { name: 'viridis', colors: ['#440154', '#414487', '#2a788e', '#22a884', '#7ad151', '#fde725'] },
        { name: 'plasma', colors: ['#0d0887', '#5302a3', '#8b0aa5', '#b83289', '#db5c68', '#f48849', '#febc2a'] },
        { name: 'inferno', colors: ['#000004', '#320a5a', '#781c6d', '#bb3754', '#ec6824', '#fbb41a'] },
        { name: 'magma', colors: ['#000004', '#2c115f', '#721f81', '#b73779', '#f0605d', '#febc2a'] },
        { name: 'cividis', colors: ['#00204c', '#213d6b', '#555b6c', '#7b7a77', '#a59c74', '#d9d57a'] },
        { name: 'rainbow', colors: ['#6e40aa', '#be3caf', '#fe4b83', '#ff7847', '#e2b72f', '#aff05b'] },
        { name: 'turbo', colors: ['#30123b', '#4145ab', '#4675ed', '#39a8fd', '#1bcfd4', '#24eca6', '#63f14e', '#b8e93b', '#feca12', '#fc8a15', '#ea4a1f', '#a52b19'] },
        { name: 'jet', colors: ['#00008f', '#0020ff', '#00ffff', '#51ff77', '#fdff00', '#ff0000', '#800000'] }
    ];

    colormaps.forEach(cmap => {
        const opt = document.createElement('option');
        opt.value = cmap.name;
        opt.textContent = cmap.name;
        colormapSelect.appendChild(opt);
    });

    colormapWrap.appendChild(colormapLabelEl);
    colormapWrap.appendChild(colormapSelect);
    plotControls.appendChild(colormapWrap);

    // Helper to draw a vertical colorbar with ticks and label on the right
    function drawColorbar(ctx, dimensions, colormapName, values, labelText, textColor = '#bbb') {
        if (!colormapName || !Array.isArray(values) || values.length === 0) return;
        const cmap = colormaps.find(cm => cm.name === colormapName);
        if (!cmap) return;

        const barWidth = 10;
        const barHeight = dimensions.height;
        const barX = dimensions.leftMargin + dimensions.width + 8;
        const barY = dimensions.topMargin;

        // Gradient top = max, bottom = min
        const grad = ctx.createLinearGradient(0, barY + barHeight, 0, barY);
        for (let i = 0; i < cmap.colors.length; i++) {
            const t = i / (cmap.colors.length - 1);
            grad.addColorStop(t, cmap.colors[i]);
        }
        ctx.fillStyle = grad;
        ctx.fillRect(barX, barY, barWidth, barHeight);

        // Outline
        ctx.strokeStyle = '#666';
        ctx.strokeRect(barX, barY, barWidth, barHeight);

        // Ticks
        const cmin = Math.min(...values);
        const cmax = Math.max(...values);
        const numTicks = 5;
        ctx.fillStyle = textColor;
        ctx.strokeStyle = textColor;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = '11px sans-serif';
        for (let i = 0; i < numTicks; i++) {
            const t = i / (numTicks - 1); // 0..1 bottom->top position
            const y = barY + barHeight - t * barHeight; // invert so top is max
            const v = cmin + t * (cmax - cmin);
            ctx.beginPath();
            ctx.moveTo(barX + barWidth, y);
            ctx.lineTo(barX + barWidth + 4, y);
            ctx.stroke();
            ctx.fillText(v.toFixed(2), barX + barWidth + 8, y);
        }

        // Label rotated on the right
        if (labelText) {
            ctx.save();
            ctx.translate(barX + barWidth + 44, barY + barHeight / 2);
            ctx.rotate(Math.PI / 2);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(labelText), 0, 0);
            ctx.restore();
        }
    }

    // Styling controls: scatter and fitted line
    const styleWrap = document.createElement('div');
    styleWrap.style.display = 'grid';
    styleWrap.style.gridTemplateColumns = 'minmax(0, 1fr)';
    styleWrap.style.gap = '10px';

    const styleTitle = document.createElement('div');
    styleTitle.className = 'ast-section-title';
    styleTitle.textContent = 'Styling';
    plotControls.appendChild(styleTitle);

    function makeLabeledControl(label, control) {
        const w = document.createElement('div');
        const l = document.createElement('label');
        l.textContent = label;
        l.style.display = 'block';
        l.style.margin = '6px 0';
        w.appendChild(l);
        w.appendChild(control);
        return w;
    }

    // Scatter controls
    const scatterColorInput = document.createElement('input');
    scatterColorInput.type = 'color';
    scatterColorInput.value = '#F59E0B';
    scatterColorInput.className = 'ast-input';
    const scatterAlphaInput = document.createElement('input');
    scatterAlphaInput.type = 'number';
    scatterAlphaInput.step = '0.05';
    scatterAlphaInput.min = '0';
    scatterAlphaInput.max = '1';
    scatterAlphaInput.value = '0.5';
    scatterAlphaInput.className = 'ast-input';
    const scatterSizeInput = document.createElement('input');
    scatterSizeInput.type = 'number';
    scatterSizeInput.min = '1';
    scatterSizeInput.max = '10';
    scatterSizeInput.step = '1';
    scatterSizeInput.value = '2';
    scatterSizeInput.className = 'ast-input';

    // Curve controls
    const curveColorInput = document.createElement('input');
    curveColorInput.type = 'color';
    curveColorInput.value = '#F59E0B';
    curveColorInput.className = 'ast-input';
    const curveAlphaInput = document.createElement('input');
    curveAlphaInput.type = 'number';
    curveAlphaInput.step = '0.05';
    curveAlphaInput.min = '0';
    curveAlphaInput.max = '1';
    curveAlphaInput.value = '1';
    curveAlphaInput.className = 'ast-input';

    styleWrap.appendChild(makeLabeledControl('Scatter Color', scatterColorInput));
    styleWrap.appendChild(makeLabeledControl('Scatter Transparency (0-1)', scatterAlphaInput));
    styleWrap.appendChild(makeLabeledControl('Scatter Size (px)', scatterSizeInput));
    styleWrap.appendChild(makeLabeledControl('Line Color', curveColorInput));
    styleWrap.appendChild(makeLabeledControl('Line Transparency (0-1)', curveAlphaInput));
    plotControls.appendChild(styleWrap);

    // Utility: hex to rgba
    function hexToRgba(hex, alpha) {
        const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (!m) return `rgba(0,0,0,${alpha ?? 1})`;
        const r = parseInt(m[1], 16);
        const g = parseInt(m[2], 16);
        const b = parseInt(m[3], 16);
        const a = Math.max(0, Math.min(1, Number(alpha ?? 1)));
        return `rgba(${r}, ${g}, ${b}, ${a})`;
    }

    // Cache last data for quick re-render on style changes
    let lastAstPlotData = null;


    // Compute button
    const computeButton = document.createElement('button');
    computeButton.textContent = 'Compute & Draw AST Plot';
    computeButton.style.padding = '10px 15px';
    computeButton.style.backgroundColor = '#7C3AED';
    computeButton.style.color = 'white';
    computeButton.style.border = 'none';
    computeButton.style.borderRadius = '8px';
    computeButton.style.cursor = 'pointer';

    plotContainer.appendChild(plotControls);
    const buttonRow = document.createElement('div');
    buttonRow.style.marginTop = '8px';
    plotContainer.appendChild(buttonRow);
    buttonRow.appendChild(computeButton);
    // Container for multiple plot panels
    const plotsContainer = document.createElement('div');
    plotsContainer.id = 'ast-plots-container';
    plotsContainer.style.display = 'flex';
    plotsContainer.style.flexDirection = 'column';
    plotsContainer.style.gap = '14px';
    plotsContainer.style.marginTop = '10px';
    plotContainer.appendChild(plotsContainer);

    async function requestAstPlotData() {
        const fakePath = document.getElementById('ast-plot-fake').value;
        const detPath = document.getElementById('ast-plot-detected').value;
        if (!fakePath || !detPath) {
            showAstMessage('Please select both catalogs for AST plot.', 'warning', false);
            return null;
        }
        const fluxColumn = fluxSelect.value || null;
        const colorColumn = colorSelect.value || null;
        const payload = {
            fakeCatalogFile: fakePath,
            detectedCatalogFile: detPath,
            minFakeSeparationArcsec: parseFloat(minSepInput.value),
            matchRadiusArcsec: parseFloat(matchRadiusInput.value),
            fluxColumn,
            colorColumn,
            overlapRadiusDeg: parseFloat(document.getElementById('ast-plot-overlap-deg')?.value || '2')
        };
        const res = await apiFetch('/ast-plot/', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const js = await res.json();
        if (!res.ok) {
            showAstMessage(`AST Plot error: ${js.detail || 'Unknown error'}`, 'error', true);
            return null;
        }
        lastAstPlotData = js;
        return js;
    }

        function drawPlotOnContext(ctx, g, dimensions, colors, fluxColumnName, xDomain, scale = 1, colormap, colorData) {
        const { logMin, logMax } = xDomain;
        const { width, height, topMargin, leftMargin } = dimensions;

        const toX = (v) => {
            const xmin = Math.pow(10, logMin);
            const lvRaw = Math.log10(Math.max(v, xmin));
            // Clamp to domain so ticks/points never render outside the frame
            const lv = Math.min(Math.max(lvRaw, logMin), logMax);
            const t = (lv - logMin) / (logMax - logMin);
            return leftMargin + t * width;
        };
        const toY = (v) => topMargin + (1 - v) * height;

        // axes frame
        ctx.strokeStyle = colors.axisColor;
        ctx.lineWidth = 1 / scale;
        ctx.beginPath();
        ctx.moveTo(leftMargin, topMargin);
        ctx.lineTo(leftMargin, topMargin + height);
        ctx.lineTo(leftMargin + width, topMargin + height);
        ctx.stroke();

        const xData = g.curve_flux || [];
        const yData = g.curve_detection || [];
        if (xData.length > 1) {
            // curve
            // Apply user-selected curve color and alpha
            ctx.strokeStyle = hexToRgba(curveColorInput.value, Number(curveAlphaInput.value));
            ctx.lineWidth = 2 / scale;
            ctx.beginPath();
            let started = false;
            for (let i = 0; i < xData.length; i++) {
                if (xData[i] > 0) {
                    if (!started) {
                        ctx.moveTo(toX(xData[i]), toY(yData[i]));
                        started = true;
                    } else {
                        ctx.lineTo(toX(xData[i]), toY(yData[i]));
                    }
                }
            }
            ctx.stroke();
            ctx.lineWidth = 1 / scale;
        }
        
        // scatter
        const sf = g.scatter_flux || [];
        const sd = g.scatter_detection || [];
        const sc = g.scatter_color || [];

        if (colormap && sc.length === sf.length) {
            const cmap = colormaps.find(cm => cm.name === colormap);
            const cmin = Math.min(...sc);
            const cmax = Math.max(...sc);
            for (let i = 0; i < sf.length; i++) {
                if (sf[i] > 0) {
                    const t = (sc[i] - cmin) / (cmax - cmin || 1);
                    const colorIndex = Math.floor(t * (cmap.colors.length - 1));
                    // Respect scatter alpha
                    const base = cmap.colors[colorIndex];
                    // Convert known hex to rgba if needed
                    const rgba = /^#/.test(base) ? hexToRgba(base, Number(scatterAlphaInput.value)) : base;
                    ctx.fillStyle = rgba;
                    const x = toX(sf[i]);
                    const y = toY(sd[i]);
                    ctx.beginPath();
                    ctx.arc(x, y, Math.max(1, Number(scatterSizeInput.value) || 2), 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        } else {
            ctx.fillStyle = hexToRgba(scatterColorInput.value, Number(scatterAlphaInput.value));
            for (let i = 0; i < sf.length; i++) {
                if (sf[i] > 0) {
                    const x = toX(sf[i]);
                    const y = toY(sd[i]);
                    ctx.beginPath();
                    ctx.arc(x, y, Math.max(1, Number(scatterSizeInput.value) || 2), 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }


        // y ticks
        ctx.fillStyle = colors.textColor;
        ctx.font = `${11 / scale}px sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'right';
        [0, 0.5, 1].forEach((yt) => {
            const y = toY(yt);
            ctx.strokeStyle = colors.tickColor;
            ctx.beginPath();
            ctx.moveTo(leftMargin - 4, y);
            ctx.lineTo(leftMargin, y);
            ctx.stroke();
            ctx.fillText(yt.toFixed(2), leftMargin - 8, y);
        });

        // X ticks
        const drawExp = (x, y, exp) => {
            ctx.fillStyle = colors.textColor;
            ctx.textAlign = 'center';
            ctx.font = `${11 / scale}px sans-serif`;
            ctx.textBaseline = 'top';
            ctx.fillText('10', x - (3 / scale), y);
            ctx.font = `${9 / scale}px sans-serif`;
            ctx.fillText(String(exp), x + (7 / scale), y - (1 / scale));
        };

        // Only draw ticks within the visible domain and avoid label overlap
        const minExp = Math.ceil(logMin);
        const maxExp = Math.floor(logMax);
        let lastTickX = -Infinity;
        const minSpacing = 40 / scale; // px between tick labels
        for (let e = minExp; e <= maxExp; e++) {
            const val = Math.pow(10, e);
            const x = toX(val);
            if (x - lastTickX < minSpacing) continue;
            ctx.strokeStyle = colors.tickColor;
            ctx.beginPath();
            ctx.moveTo(x, topMargin + height);
            ctx.lineTo(x, topMargin + height + 5);
            ctx.stroke();
            drawExp(x, topMargin + height + 10, e);
            lastTickX = x;
        }

        // Axis labels
        ctx.fillStyle = colors.textColor;
        ctx.font = `${12 / scale}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(`${fluxColumnName || 'Flux'} (log)`, leftMargin + width / 2, topMargin + height + 24);
        ctx.save();
        ctx.translate(leftMargin - 44, topMargin + height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.fillText('Completeness Fraction', 0, 0);
        ctx.restore();

        // Galaxy name
        if (g.galaxy_name) {
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(String(g.galaxy_name).toUpperCase(), leftMargin + 6, topMargin + 6);
        }

        // Fit parameter
        const fit_val = g.fit_c ?? g.fit_b;
        if (typeof fit_val === 'number') {
            ctx.textAlign = 'right';
            ctx.textBaseline = 'top';
            ctx.fillText(`c = ${Math.round(fit_val)} µJy`, leftMargin + width - 6, topMargin + 6);
        }
    }

    function drawAstPlot(data) {
        // Clear previous plots
        while (plotsContainer.firstChild) plotsContainer.removeChild(plotsContainer.firstChild);

        const groups = Array.isArray(data.groups) ? data.groups : [];
        if (groups.length === 0) return;

        let xmin = Infinity, xmax = -Infinity;
        for (const g of groups) {
            const xs = (g.curve_flux || []).filter(v => v > 0);
            if (xs.length) {
                xmin = Math.min(xmin, ...xs);
                xmax = Math.max(xmax, ...xs);
            }
        }
        if (!isFinite(xmin) || !isFinite(xmax) || xmin <= 0) {
            return;
        }
        if (xmax < xmin * 10) xmax = xmin * 10;
        const logMin = Math.log10(xmin);
        const logMax = Math.log10(xmax);

        groups.forEach((g) => {
            const panel = document.createElement('div');
            panel.style.display = 'flex';
            panel.style.flexDirection = 'column';
            panel.style.gap = '6px';
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.justifyContent = 'space-between';
            row.style.alignItems = 'center';
            const title = document.createElement('div');
            title.style.color = '#ddd';
            title.style.fontSize = '14px';
            title.style.fontWeight = '600';
            title.textContent = g.galaxy_name || '';
            const saveBtn = document.createElement('button');
            saveBtn.textContent = 'Save Figure';
            saveBtn.style.padding = '6px 10px';
            saveBtn.style.backgroundColor = '#6B7280';
            saveBtn.style.color = 'white';
            saveBtn.style.border = 'none';
            saveBtn.style.borderRadius = '6px';
            saveBtn.style.cursor = 'pointer';
            row.appendChild(title);
            row.appendChild(saveBtn);

            const canvas = document.createElement('canvas');
            canvas.width = 400; // Narrower plot area
            canvas.height = 280;
            canvas.style.background = 'transparent';
            canvas.style.border = '1px solid #333';
            canvas.style.borderRadius = '4px';

            panel.appendChild(row);
            panel.appendChild(canvas);
            plotsContainer.appendChild(panel);

            const ctx = canvas.getContext('2d');
            const topMargin = 28, bottomMargin = 44, leftMargin = 58, rightMargin = 70;
            const dimensions = {
                width: canvas.width - leftMargin - rightMargin,
                height: canvas.height - topMargin - bottomMargin,
                topMargin, bottomMargin, leftMargin, rightMargin
            };
            // Per-group X domain based on available data (curve + scatter), with padding
            // Filter out extreme outliers by quantiles to prevent crowded labels and axis stretching
            const xsCurve = (g.curve_flux || []).filter(v => v > 0);
            const xsScatter = (g.scatter_flux || []).filter(v => v > 0);
            const xsAll = xsCurve.concat(xsScatter);
            if (!xsAll.length) {
                return; // nothing to draw for this group
            }
            // Robust range using 1st and 99th percentiles in log space
            const logs = xsAll.map(v => Math.log10(v)).sort((a,b) => a-b);
            const q = (arr, p) => arr[Math.min(arr.length-1, Math.max(0, Math.floor(p*(arr.length-1))))];
            let lgmin = q(logs, 0.01);
            let lgmax = q(logs, 0.99);
            if (!isFinite(lgmin) || !isFinite(lgmax)) return;
            // Guard against degenerate domain
            if (lgmax - lgmin < 0.1) {
                const mid = (lgmin + lgmax) / 2;
                lgmin = mid - 0.05;
                lgmax = mid + 0.05;
            }
            const span = Math.max(lgmax - lgmin, 0.1);
            lgmin = lgmin - 0.05 * span;
            lgmax = lgmax + 0.05 * span;
            const xDomain = { logMin: lgmin, logMax: lgmax };
            const fluxColumnName = fluxSelect.value;
            const screenColors = {
                axisColor: '#666', curveColor: hexToRgba(curveColorInput.value, Number(curveAlphaInput.value)), scatterColor: hexToRgba(scatterColorInput.value, Number(scatterAlphaInput.value)),
                textColor: '#bbb', tickColor: '#555'
            };

            const colormap = colormapSelect.value;
            drawPlotOnContext(ctx, g, dimensions, screenColors, fluxColumnName, xDomain, 1, colormap, g.scatter_color);

            // Colorbar on the right when applicable (screen)
            if (colormap && Array.isArray(g.scatter_color) && g.scatter_color.length) {
                drawColorbar(ctx, dimensions, colormap, g.scatter_color, colorSelect && colorSelect.value, '#bbb');
            }

            saveBtn.addEventListener('click', () => {
                try {
                    const scale = 4; // Higher quality export
                    const exportCanvas = document.createElement('canvas');
                    exportCanvas.width = canvas.width * scale;
                    exportCanvas.height = canvas.height * scale;
                    const ex = exportCanvas.getContext('2d');

                    ex.fillStyle = '#ffffff';
                    ex.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
                    ex.scale(scale, scale);

                    const exportColors = {
                        axisColor: '#000', curveColor: hexToRgba(curveColorInput.value, Number(curveAlphaInput.value)), scatterColor: hexToRgba(scatterColorInput.value, Number(scatterAlphaInput.value)),
                        textColor: '#000', tickColor: '#000'
                    };

                    drawPlotOnContext(ex, g, dimensions, exportColors, fluxColumnName, xDomain, 1, colormap, g.scatter_color);

                    // Colorbar on export as well
                    if (colormap && Array.isArray(g.scatter_color) && g.scatter_color.length) {
                        // For export, use black text for ticks and label
                        drawColorbar(ex, dimensions, colormap, g.scatter_color, colorSelect && colorSelect.value, '#000');
                    }

                    const link = document.createElement('a');
                    link.download = `ast_plot_${(g.galaxy_name || 'group')}_${Date.now()}.png`;
                    link.href = exportCanvas.toDataURL('image/png');
                    link.click();
                } catch (e) {
                    console.error('Failed to save figure', e);
                    showAstMessage('Failed to save figure.', 'error', false);
                }
            });
        });
    }

    computeButton.addEventListener('click', async () => {
        const data = await requestAstPlotData();
        if (data) drawAstPlot(data);
    });

    // Re-render plots when styling controls change (if we already have data)
    [scatterColorInput, scatterAlphaInput, scatterSizeInput, curveColorInput, curveAlphaInput, colormapSelect].forEach(ctrl => {
        ctrl.addEventListener('input', () => {
            if (lastAstPlotData) {
                drawAstPlot(lastAstPlotData);
            }
        });
        ctrl.addEventListener('change', () => {
            if (lastAstPlotData) {
                drawAstPlot(lastAstPlotData);
            }
        });
    });

    // (Per-plot save handled per canvas panel)
} 

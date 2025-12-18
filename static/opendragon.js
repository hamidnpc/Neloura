function runPeakFinder(filepath, customParams = {}) {
    console.log('[DEBUG PeakFinder] Starting job with params:', customParams);

    if (!filepath) {
        showNotification("No FITS file is currently loaded.", 3000, 'error');
        return;
    }
    
    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress-bar');
    const progressPercentage = document.getElementById('progress-percentage');
    const progressEta = document.getElementById('progress-eta');
    const circumference = 2 * Math.PI * progressBar.r.baseVal.value;

    function showProgressUI(show) {
        progressContainer.style.display = show ? 'block' : 'none';
    }

    function updateProgressUI(progress, eta) {
        const p = (typeof progress === 'number') ? Math.round(progress) : 0;
        const offset = circumference - (p / 100) * circumference;
        progressBar.style.strokeDashoffset = offset;
        progressPercentage.textContent = `${p}`;

        if (typeof eta === 'number' && eta >= 0) {
            progressEta.textContent = `ETA: ${eta}s`;
        } else {
            progressEta.textContent = `ETA: ...`;
        }
    }

    showProgressUI(true);
    updateProgressUI(0, -1);

    const formData = new FormData();
    formData.append('fits_file', filepath);
    Object.keys(customParams).forEach(key => {
        formData.append(key, customParams[key]);
    });

     apiFetch('/start-peak-finder/', { method: 'POST', body: formData })
    .then(response => response.json())
    .then(data => {
        if (data.error || !data.job_id) {
            throw new Error(data.error || "Server did not return a job ID.");
        }
        
        const jobId = data.job_id;
        console.log(`Job started with ID: ${jobId}`);

        const intervalId = setInterval(() => {
            apiFetch(`/peak-finder-status/${jobId}`)
            .then(response => response.json())
            .then(statusData => {
                if (statusData.status === 'complete') {
                    clearInterval(intervalId);
                    updateProgressUI(100, 0);
                    
                    requestIdleCallback(() => {
                        processPeakFinderResults(statusData.result, customParams);
                        requestIdleCallback(() => showProgressUI(false));
                    });

                } else if (statusData.status === 'error') {
                    clearInterval(intervalId);
                    showProgressUI(false);
                    showNotification(`Error: ${statusData.error}`, 5000, 'error');
                } else {
                    updateProgressUI(statusData.progress, statusData.eta);
                }
            })
            .catch(error => {
                clearInterval(intervalId);
                showProgressUI(false);
                console.error('Polling error:', error);
                showNotification(`Error checking job status: ${error.message}`, 3000, 'error');
            });
        }, 1000);
    })
    .catch(error => {
        showProgressUI(false);
        console.error('Request failed:', error);
        showNotification(`Request failed: ${error.message}`, 3000, 'error');
    });
}

function processPeakFinderResults(data, customParams) {
    if (data.error) {
        console.error('Peak finder error:', data.error);
        showNotification(`Error: ${data.error}`, 3000, 'error');
    } else {
        const sources = data.sources;
        const sourceCatalog = [];
        const radiusInPixels = customParams.pix_across_beam || 5;

        if (sources && sources.source_count > 0) {
            for (let i = 0; i < sources.source_count; i++) {
                const catalogEntry = {
                    x: sources.x[i],
                    y: sources.y[i],
                    ra: sources.ra[i],
                    dec: sources.dec[i],
                    radius_pixels: radiusInPixels,
                    value: sources.values[i],
                    id: i
                };
                sourceCatalog.push(catalogEntry);
            }

            transformSourceCoordinates(sourceCatalog);
            
            const catalogName = `Found Sources (${sources.source_count})`;
            const catalogOptions = {
                name: catalogName,
                isPeakFinder: true,
                ...customParams
            };

            createNewCatalog(sourceCatalog, catalogOptions);
            showNotification(`Found ${sources.source_count} sources`, 2000, 'success');
        } else {
            showNotification('No sources found.', 2000, 'info');
        }
    }
}

// Apply the patch to replace the existing peak finder with our improved version
function patchPeakFinderWithFillColorSupport() {
    if (typeof window.originalRunPeakFinder === 'undefined') {
        // Save the original function if not already saved
        window.originalRunPeakFinder = window.runPeakFinder;
    }
    
    // Replace with our improved version
    window.runPeakFinder = runPeakFinder;
    
    console.log("Peak finder function has been patched with fill color support");
    return "Peak finder successfully patched with fill color support";
}

// Apply the patch
patchPeakFinderWithFillColorSupport();


// Create a patch function to replace the existing peak finder with our improved version
function patchPeakFinderWithImprovedWCS() {
    if (typeof window.originalRunPeakFinder === 'undefined') {
        // Save the original function if not already saved
        window.originalRunPeakFinder = window.runPeakFinder;
    }
    
    // Replace with our improved version
    window.runPeakFinder = runPeakFinder;
    
    console.log("Peak finder function has been patched with improved WCS handling");
    return "Peak finder successfully patched with improved WCS handling";
}

// Apply the patch
patchPeakFinderWithImprovedWCS();



// Function to transform source coordinates for proper alignment
function transformSourceCoordinates(sources) {
    if (!sources || !sources.length || !window.fitsData) {
        console.warn("transformSourceCoordinates: Missing sources or FITS data. Aborting.");
        return;
    }
    
    // Get image dimensions from the global fitsData object
    const width = window.fitsData.width;
    const height = window.fitsData.height;
    
    console.log(`Transforming ${sources.length} source coordinates for display. Image size: ${width}x${height}`);
    
    // Apply transformation to each source
    sources.forEach((source, index) => {
        const origX = source.x;
        const origY = source.y;
        
        // The peak finder backend (Python/astropy) likely uses a FITS standard
        // coordinate system with the origin (0,0) at the bottom-left. The frontend
        // canvas rendering uses a top-left origin. We need to flip the Y-axis for correct display.
        const newX = origX;
        const newY = height - origY;
        
        // Update source coordinates and ensure they are within the image bounds.
        source.x = Math.max(0, Math.min(newX, width - 1));
        source.y = Math.max(0, Math.min(newY, height - 1));
        
        if (index < 5) { // Log first few for debugging
            console.log(`Transformed source ${index}: Original (${origX.toFixed(2)}, ${origY.toFixed(2)}) -> Canvas (${source.x.toFixed(2)}, ${source.y.toFixed(2)})`);
        }
    });
}

// Function to log detailed information about the current FITS data's WCS information
function inspectCurrentWCS() {
    console.log("Inspecting current FITS data WCS information:");
    
    if (!window.fitsData) {
        console.log("No FITS data loaded");
        return "No FITS data loaded";
    }
    
    console.log("FITS data dimensions:", window.fitsData.width, "x", window.fitsData.height);
    
    if (!window.fitsData.wcs) {
        console.log("No WCS information available in FITS data");
        return "No WCS information available in FITS data";
    }
    
    console.log("Raw WCS information from FITS data:", window.fitsData.wcs);
    
    // Parse the WCS information
    const wcs = parseWCSFromHeader(window.fitsData.wcs);
    
    console.log("Parsed WCS information:", wcs);
    
    if (wcs.hasWCS) {
        console.log("WCS Information Summary:");
        console.log(`Reference pixel: (${wcs.crpix1}, ${wcs.crpix2})`);
        console.log(`Reference world coordinates: (${wcs.crval1}°, ${wcs.crval2}°)`);
        
        if (wcs.rotmat) {
            console.log(`Rotation angle: ${wcs.rotmat.thetaDeg.toFixed(2)}°`);
            console.log(`Coordinate system flipped: ${wcs.rotmat.isFlipped}`);
            console.log(`Scales: ${wcs.rotmat.scale1.toExponential(4)}, ${wcs.rotmat.scale2.toExponential(4)}`);
        }
        
        console.log(`Projection: ${wcs.projection}`);
        
        // Test coordinate conversion
        const centerRa = wcs.crval1;
        const centerDec = wcs.crval2;
        const centerPixel = worldToPixel(wcs, centerRa, centerDec);
        
        console.log(`Test conversion: (${centerRa}°, ${centerDec}°) -> (${centerPixel.x.toFixed(1)}, ${centerPixel.y.toFixed(1)})`);
        console.log(`Reference pixel should be: (${wcs.crpix1}, ${wcs.crpix2})`);
        
        return "WCS information available and parsed successfully";
    } else {
        console.log("Invalid or incomplete WCS information");
        return "Invalid or incomplete WCS information";
    }
}

// Run the inspection to check the current FITS data
inspectCurrentWCS();

function createPeakFinderModal(filepath) {
    let popup = document.getElementById('peak-finder-modal');
    if (popup) {
        if (document.readyState === 'complete' && document.visibilityState === 'visible') {
            popup.style.display = 'block';
        }
        return popup;
    }

    popup = document.createElement('div');
    popup.id = 'peak-finder-modal';
    Object.assign(popup.style, {
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        backgroundColor: '#333', border: '1px solid #555', borderRadius: '5px',
        padding: '15px', zIndex: '1500', width: '650px', // Increased width for two columns
        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)', boxSizing: 'border-box'
    });

    const title = document.createElement('h3');
    title.textContent = 'Peak Finder Settings';
    Object.assign(title.style, {
        margin: '0 0 15px 0', color: '#fff', fontFamily: 'Arial, sans-serif',
        fontSize: '18px', fontWeight: 'bold', borderBottom: '1px solid #555',
        paddingBottom: '10px', cursor: 'grab' // Make title draggable
    });

    const closeButton = document.createElement('button');
    closeButton.textContent = '×';
    Object.assign(closeButton.style, {
        position: 'absolute', top: '10px', right: '10px', backgroundColor: 'transparent',
        border: 'none', color: '#aaa', fontSize: '20px', cursor: 'pointer',
        padding: '0', width: '24px', height: '24px', lineHeight: '24px',
        textAlign: 'center', borderRadius: '12px'
    });
    closeButton.addEventListener('mouseover', () => { closeButton.style.backgroundColor = '#555'; closeButton.style.color = '#fff'; });
    closeButton.addEventListener('mouseout', () => { closeButton.style.backgroundColor = 'transparent'; closeButton.style.color = '#aaa'; });
    closeButton.addEventListener('click', () => { popup.style.display = 'none'; });

    // Main container for the two columns
    const columnsContainer = document.createElement('div');
    Object.assign(columnsContainer.style, {
        display: 'flex',
        flexDirection: 'row',
        gap: '15px', // Space between columns
        marginBottom: '15px' // Space before action buttons
    });

    // Left Column: Algorithm Parameters
    const leftColumn = document.createElement('div');
    Object.assign(leftColumn.style, {
        flex: '1', // Takes up 50% of the space
        display: 'flex',
        flexDirection: 'column',
        gap: '10px' // Space between elements in this column
    });

    const algorithmSection = document.createElement('fieldset');
    Object.assign(algorithmSection.style, { border: '1px solid #555', borderRadius: '4px', padding: '10px' });
    const algorithmLegend = document.createElement('legend');
    algorithmLegend.textContent = 'Algorithm Parameters';
    Object.assign(algorithmLegend.style, { color: '#ccc', padding: '0 5px', fontSize: '14px' });
    algorithmSection.appendChild(algorithmLegend);

    const algorithmGrid = document.createElement('div');
    Object.assign(algorithmGrid.style, { display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }); // Single column grid for params

    const parameters = [
        { id: 'pix-across-beam', label: 'Pixels Across Beam:', value: 5, min: 1, max: 20, step: 1, title: 'Typical beam FWHM in pixels. Used for smoothing and source size.' },
        { id: 'min-beams', label: 'Minimum Beams in Source:', value: 1.0, min: 0.1, max: 10, step: 0.1, title: 'Minimum number of beams a source must span to be considered valid.' },
        { id: 'beams-to-search', label: 'Beams to Search For Merge:', value: 1.0, min: 0.1, max: 10, step: 0.1, title: 'Radius (in beamwidths) to search for nearby peaks to merge.' },
        { id: 'delta-rms', label: 'Peak Detection Threshold (ΔRMS):', value: 3.0, min: 0.1, max: 20, step: 0.1, title: 'Threshold above local RMS for initial peak detection.' },
        { id: 'minval-rms', label: 'Min Valid Peak Value (RMS):', value: 5.0, min: 0.1, max: 20, step: 0.1, title: 'Minimum peak value (relative to global RMS) for a source to be considered valid after merging.' }
    ];

    parameters.forEach(param => {
        const paramGroup = document.createElement('div');
        const paramLabel = document.createElement('label');
        paramLabel.textContent = param.label;
        paramLabel.title = param.title || '';
        Object.assign(paramLabel.style, { display: 'block', marginBottom: '5px', color: '#aaa', fontFamily: 'Arial, sans-serif', fontSize: '13px' });
        const paramInput = document.createElement('input');
        paramInput.type = 'number'; paramInput.id = param.id; paramInput.value = param.value;
        paramInput.min = param.min; paramInput.max = param.max; paramInput.step = param.step; paramInput.title = param.title || '';
        Object.assign(paramInput.style, { width: '100%', padding: '6px', backgroundColor: '#444', color: 'white', border: '1px solid #555', borderRadius: '3px', boxSizing: 'border-box', fontSize:'13px' });
        paramGroup.appendChild(paramLabel);
        paramGroup.appendChild(paramInput);
        algorithmGrid.appendChild(paramGroup);
    });
    algorithmSection.appendChild(algorithmGrid);
    leftColumn.appendChild(algorithmSection);

    // Right Column: Visual Style
    const rightColumn = document.createElement('div');
    Object.assign(rightColumn.style, {
        flex: '1', // Takes up 50% of the space
        display: 'flex',
        flexDirection: 'column',
        gap: '10px' // Space between elements in this column
    });

    const styleSection = document.createElement('fieldset');
    Object.assign(styleSection.style, { border: '1px solid #555', borderRadius: '4px', padding: '10px' });
    const styleLegend = document.createElement('legend');
    styleLegend.textContent = 'Visual Style';
    Object.assign(styleLegend.style, { color: '#ccc', padding: '0 5px', fontSize: '14px' });
    styleSection.appendChild(styleLegend);

    // Helper to create a style control group
    function createStyleControl(labelTextContent, inputElement, helpText = "") {
        const group = document.createElement('div');
        group.style.marginBottom = '8px'; // Reduced margin
        const label = document.createElement('label');
        label.textContent = labelTextContent;
        if (helpText) label.title = helpText;
        Object.assign(label.style, { display: 'block', marginBottom: '3px', color: '#aaa', fontFamily: 'Arial, sans-serif', fontSize: '13px' });
        group.appendChild(label);
        group.appendChild(inputElement);
        return group;
    }
    
    const defaultBorderColor = '#FF8C00'; // DarkOrange
    const defaultFillColor = '#FF8C00'; // DarkOrange

    // Border color selector
    const borderColorInput = document.createElement('input');
    borderColorInput.type = 'color'; borderColorInput.id = 'source-color'; borderColorInput.value = defaultBorderColor;
    Object.assign(borderColorInput.style, { width: '100%', height: '30px', cursor: 'pointer', backgroundColor: '#444', border: '1px solid #555', borderRadius: '3px', boxSizing: 'border-box' });
    styleSection.appendChild(createStyleControl('Border Color:', borderColorInput, 'Color of the source marker border.'));

    // Fill color selector
    const bgColorContainer = document.createElement('div'); // Container for color input and checkbox
    Object.assign(bgColorContainer.style, { display: 'flex', alignItems: 'center', gap: '10px' });

    const bgColorInput = document.createElement('input');
    bgColorInput.type = 'color'; bgColorInput.id = 'fill-color'; bgColorInput.value = defaultFillColor;
    Object.assign(bgColorInput.style, { flexGrow: '1', height: '30px', cursor: 'pointer', backgroundColor: '#444', border: '1px solid #555', borderRadius: '3px', boxSizing: 'border-box' });

    const transparentCheckbox = document.createElement('input');
    transparentCheckbox.type = 'checkbox'; transparentCheckbox.id = 'transparent-fill-checkbox'; transparentCheckbox.checked = true;
    Object.assign(transparentCheckbox.style, { margin: '0', cursor: 'pointer', width:'16px', height:'16px' });
    
    const transparentLabel = document.createElement('label');
    transparentLabel.textContent = 'Transparent Fill';
    transparentLabel.htmlFor = 'transparent-fill-checkbox';
    Object.assign(transparentLabel.style, { color: '#aaa', fontFamily: 'Arial, sans-serif', fontSize: '13px', cursor: 'pointer', userSelect:'none' });

    const transparentFillContainer = document.createElement('div');
    Object.assign(transparentFillContainer.style, {display: 'flex', alignItems: 'center', gap: '5px', marginTop:'3px'});
    transparentFillContainer.appendChild(transparentCheckbox);
    transparentFillContainer.appendChild(transparentLabel);
    
    bgColorContainer.appendChild(bgColorInput);
    bgColorContainer.appendChild(transparentFillContainer);

    styleSection.appendChild(createStyleControl('Fill Color:', bgColorContainer, 'Color of the source marker fill. Check "Transparent Fill" to use a semi-transparent version of the Border Color.'));

    // Border width slider
    const borderWidthContainer = document.createElement('div');
    Object.assign(borderWidthContainer.style, { display: 'flex', alignItems: 'center', gap: '10px' });
    const borderWidthSlider = document.createElement('input');
    borderWidthSlider.type = 'range'; borderWidthSlider.id = 'border-width-slider'; borderWidthSlider.min = '1'; borderWidthSlider.max = '5'; borderWidthSlider.step = '1'; borderWidthSlider.value = '2'; // Default to 2px
    Object.assign(borderWidthSlider.style, { flex: '1', height: '8px', appearance: 'none', backgroundColor: '#555', borderRadius: '4px', outline: 'none', cursor: 'pointer' });
    const borderWidthValue = document.createElement('span');
    borderWidthValue.id = 'border-width-value'; borderWidthValue.textContent = borderWidthSlider.value + 'px';
    Object.assign(borderWidthValue.style, { minWidth: '30px', textAlign: 'right', color: '#fff', fontFamily: 'Arial, sans-serif', fontSize: '13px' });
    borderWidthSlider.addEventListener('input', function() { borderWidthValue.textContent = this.value + 'px'; updatePreview(); });
    borderWidthContainer.appendChild(borderWidthSlider); borderWidthContainer.appendChild(borderWidthValue);
    styleSection.appendChild(createStyleControl('Border Width:', borderWidthContainer, 'Width of the source marker border in pixels.'));

    // Opacity slider
    const opacityContainer = document.createElement('div');
    Object.assign(opacityContainer.style, { display: 'flex', alignItems: 'center', gap: '10px' });
    const opacitySlider = document.createElement('input');
    opacitySlider.type = 'range'; opacitySlider.id = 'opacity-slider'; opacitySlider.min = '0.1'; opacitySlider.max = '1'; opacitySlider.step = '0.1'; opacitySlider.value = '0.7'; // Default opacity
    Object.assign(opacitySlider.style, { flex: '1', height: '8px', appearance: 'none', backgroundColor: '#555', borderRadius: '4px', outline: 'none', cursor: 'pointer' });
    const opacityValue = document.createElement('span');
    opacityValue.id = 'opacity-value'; opacityValue.textContent = opacitySlider.value;
    Object.assign(opacityValue.style, { minWidth: '30px', textAlign: 'right', color: '#fff', fontFamily: 'Arial, sans-serif', fontSize: '13px' });
    opacitySlider.addEventListener('input', function() { opacityValue.textContent = this.value; updatePreview(); });
    opacityContainer.appendChild(opacitySlider); opacityContainer.appendChild(opacityValue);
    styleSection.appendChild(createStyleControl('Marker Opacity:', opacityContainer, 'Overall opacity of the source markers.'));
    
    // Add slider thumb styling
    const sliderStyle = document.getElementById('peak-finder-slider-styles') || document.createElement('style');
    sliderStyle.id = 'peak-finder-slider-styles';
    sliderStyle.textContent = `
        #border-width-slider::-webkit-slider-thumb, #opacity-slider::-webkit-slider-thumb {
            -webkit-appearance: none; appearance: none; width: 16px; height: 16px;
            border-radius: 50%; background: #007bff; cursor: pointer;
        }
        #border-width-slider::-moz-range-thumb, #opacity-slider::-moz-range-thumb {
            width: 16px; height: 16px; border-radius: 50%; background: #007bff; cursor: pointer; border: none;
        }`;
    document.head.appendChild(sliderStyle);

    // Preview area
    const previewArea = document.createElement('div');
    Object.assign(previewArea.style, { width: '100%', height: '60px', backgroundColor: '#222', borderRadius: '3px', display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: '10px', boxSizing:'border-box' });
    const previewDot = document.createElement('div');
    previewDot.id = 'preview-dot';
    Object.assign(previewDot.style, { width: '30px', height: '30px', borderRadius: '50%', transition: 'all 0.2s ease' });
    previewArea.appendChild(previewDot);
    styleSection.appendChild(createStyleControl('Preview:', previewArea));

    function updatePreview() {
        const bw = borderWidthSlider.value;
        const op = opacitySlider.value;
        const bc = borderColorInput.value;
        const useTransparent = transparentCheckbox.checked;
        const fc = bgColorInput.value;

        previewDot.style.borderWidth = bw + 'px';
        previewDot.style.borderStyle = 'solid';
        previewDot.style.borderColor = bc;
        previewDot.style.opacity = op;

        if (useTransparent) {
            const r = parseInt(bc.slice(1, 3), 16);
            const g = parseInt(bc.slice(3, 5), 16);
            const b = parseInt(bc.slice(5, 7), 16);
            previewDot.style.backgroundColor = `rgba(${r}, ${g}, ${b}, 0.3)`;
        } else {
            previewDot.style.backgroundColor = fc;
        }
        bgColorInput.disabled = useTransparent;
        bgColorInput.style.opacity = useTransparent ? '0.5' : '1';
    }
    
    [borderColorInput, bgColorInput, transparentCheckbox, borderWidthSlider, opacitySlider].forEach(el => {
        el.addEventListener('input', updatePreview);
        if (el.type === 'checkbox') el.addEventListener('change', updatePreview);
    });
    
    rightColumn.appendChild(styleSection);

    columnsContainer.appendChild(leftColumn);
    columnsContainer.appendChild(rightColumn);

    const buttonContainer = document.createElement('div');
    Object.assign(buttonContainer.style, { display: 'flex', justifyContent: 'flex-end', marginTop: '15px', gap: '10px' });

    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    Object.assign(cancelButton.style, { padding: '8px 15px', backgroundColor: '#6c757d', color: '#fff', border: 'none', borderRadius: '3px', cursor: 'pointer', fontFamily: 'Arial, sans-serif', fontSize: '14px' });
    cancelButton.addEventListener('mouseover', () => cancelButton.style.backgroundColor = '#5a6268');
    cancelButton.addEventListener('mouseout', () => cancelButton.style.backgroundColor = '#6c757d');
    cancelButton.addEventListener('click', () => { popup.style.display = 'none'; });

    const findSourcesButton = document.createElement('button');
    findSourcesButton.textContent = 'Find Sources';
    Object.assign(findSourcesButton.style, { padding: '8px 15px', backgroundColor: '#007bff', color: '#fff', border: 'none', borderRadius: '3px', cursor: 'pointer', fontFamily: 'Arial, sans-serif', fontSize: '14px' });
    findSourcesButton.addEventListener('mouseover', () => findSourcesButton.style.backgroundColor = '#0056b3');
    findSourcesButton.addEventListener('mouseout', () => findSourcesButton.style.backgroundColor = '#007bff');
    findSourcesButton.addEventListener('click', () => {
        const params = {
            pix_across_beam: parseFloat(document.getElementById('pix-across-beam').value),
            min_beams: parseFloat(document.getElementById('min-beams').value),
            beams_to_search: parseFloat(document.getElementById('beams-to-search').value),
            delta_rms: parseFloat(document.getElementById('delta-rms').value),
            minval_rms: parseFloat(document.getElementById('minval-rms').value),
            color: document.getElementById('source-color').value,
            fillColor: document.getElementById('fill-color').value,
            useTransparentFill: document.getElementById('transparent-fill-checkbox').checked,
            border_width: parseInt(document.getElementById('border-width-slider').value),
            opacity: parseFloat(document.getElementById('opacity-slider').value)
        };
        popup.style.display = 'none';

        // Add the 'files/' prefix to the filepath before sending to the backend
        const fullFilepath = `files/${filepath}`;

        // Use the filepath that was passed into createPeakFinderModal
        runPeakFinder(fullFilepath, params);
    });

    buttonContainer.appendChild(cancelButton);
    buttonContainer.appendChild(findSourcesButton);

    popup.appendChild(title);
    popup.appendChild(closeButton);
    popup.appendChild(columnsContainer); // Add the new two-column container
    popup.appendChild(buttonContainer);

    makeDraggable(popup, title); // Ensure makeDraggable is defined and works
    document.body.appendChild(popup);
    updatePreview(); // Initial preview
    return popup;
}

// Ensure makeDraggable function is available
if (typeof makeDraggable !== 'function') {
    function makeDraggable(elmnt, dragHandle) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        const handle = dragHandle || elmnt;

        handle.onmousedown = dragMouseDown;

        function dragMouseDown(e) {
            e = e || window.event;
            if (e.button !== 0) return; // Only left click
            
            // Prevent drag if clicking on input/button/select elements within the handle
            const nonDragTags = ['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA'];
            if (nonDragTags.includes(e.target.tagName) || e.target.closest('input, button, select, textarea')) {
                 if (e.target !== handle) return; // Allow drag if mousedown on handle itself, even if it's one of these tags
            }

            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;

            // If popup is centered with transform, convert to pixel values for dragging
            if (elmnt.style.transform.includes('translate')) {
                const rect = elmnt.getBoundingClientRect();
                elmnt.style.top = `${rect.top}px`;
                elmnt.style.left = `${rect.left}px`;
                elmnt.style.transform = 'none'; 
            }
            
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
            handle.style.cursor = 'grabbing';
        }

        function elementDrag(e) {
            e = e || window.event;
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
            elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
            handle.style.cursor = 'grab';
        }
    }
}

// Helper function to update styling of catalog dots for peak finder results
function updatePeakFinderDotStyling(dots, customParams = {}) {
    if (!dots || dots.length === 0) return;
    
    const sourceColor = customParams.color || '#ff9800';
    const sourceRadius = customParams.size || 5.0;
    const showLabels = customParams.show_labels || false;
    
    dots.forEach((dot, index) => {
        // Apply custom styling
        dot.style.border = `${Math.max(1, Math.round(sourceRadius / 5))}px solid ${sourceColor}`;
        dot.style.backgroundColor = sourceColor.replace(')', ', 0.3)').replace('rgb', 'rgba');
        
        // Remove any existing labels
        const existingLabel = dot.querySelector('.catalog-label');
        if (existingLabel) {
            dot.removeChild(existingLabel);
        }
        
        // Add labels if requested
        if (showLabels) {
            const label = document.createElement('div');
            label.className = 'catalog-label';
            label.textContent = index + 1; // 1-based indexing for user readability
            label.style.position = 'absolute';
            label.style.top = '-15px';
            label.style.left = '10px';
            label.style.color = sourceColor;
            label.style.backgroundColor = 'rgba(0,0,0,0.5)';
            label.style.padding = '1px 4px';
            label.style.fontSize = '10px';
            label.style.borderRadius = '2px';
            label.style.pointerEvents = 'none';
            dot.appendChild(label);
        }
    });
}

// Existing function, we'll add dropdown update functionality
function createNewCatalog(sources, options = {}) {
    const newCatalogName = options.name || `Catalog-${Date.now()}`;
    console.log(`[createNewCatalog] Creating new catalog: '${newCatalogName}' with ${sources.length} sources.`);
    console.log(`[createNewCatalog] Options received:`, options);

    // --- FIX START ---
    // The `options` object contains style settings from the modal, including a `size`
    // property that conflicts with the `radius_pixels` we calculated.
    // By deleting `size` from the options before mapping, we prevent it from
    // overwriting the correct value when the objects are merged.
    delete options.size;
    // --- FIX END ---

    // If sources already have x and y, preserve them. This is crucial for peak finder.
    const processedSources = sources.map((source, index) => {
        const finalSource = {
            ...options,
            ...source,
            catalog_name: newCatalogName,
            magnitude: source.value, // Add magnitude property from peak value
            source_type: 'peak_finder', // Mark as a peak finder source
            startIndex: 0,
            id: index
        };

        // --- DEFINITIVE FIX ---
        // Per user instruction, directly set radius_pixels from pix_across_beam.
        // This bypasses any incorrect default values assigned earlier.
        if (options.pix_across_beam !== undefined) {
            finalSource.radius_pixels = options.pix_across_beam;
        }

        return finalSource;
    });
    
    // --- FIX START ---
    // Define catalogMetadata before it is used.
    const catalogMetadata = {
        name: newCatalogName,
        color: options.color || '#ff9800',
        showLabels: options.showLabels !== undefined ? options.showLabels : true,
        source_count: processedSources.length
    };
    // --- FIX END ---

    // Initialize global catalog data if not exists
    if (!window.catalogData) {
        window.catalogData = [];
    }
    if (!window.loadedCatalogs) {
        window.loadedCatalogs = [];
    }

    // Append the new catalog
    const startIndex = window.catalogData.length;
    window.catalogData.push(...processedSources);
    window.loadedCatalogs.push(catalogMetadata);
    
    // Pass the full set of options along to the overlay update function
    triggerCatalogOverlayUpdate(processedSources, {
        ...options, // Pass all original options
        name: newCatalogName,
        startIndex: startIndex
    });
    
    // Update catalog selection dropdown
    updateCatalogSelectionDropdown();
    
    // Show notification
    showNotification(`Created catalog: ${newCatalogName} with ${sources.length} sources`, 2000, 'success');
    
    return {
        name: newCatalogName,
        sources: processedSources
    };
}

// Update catalog selection dropdown with newly added catalogs
function updateCatalogSelectionDropdown() {
    console.log('Updating catalog selection dropdown');
    
    // // Get the catalog select element
    // const catalogSelect = document.getElementById('catalog-select');
    
    // if (!catalogSelect) {
    //     console.warn('Catalog select dropdown not found');
    //     return;
    // }
    
    // // Clear existing options
    // catalogSelect.innerHTML = '';
    
    // // Add new options for each loaded catalog
    // if (window.loadedCatalogs && window.loadedCatalogs.length > 0) {
    //     window.loadedCatalogs.forEach(catalog => {
    //         const option = document.createElement('option');
    //         option.value = catalog.name;
    //         option.textContent = `${catalog.name} (${catalog.source_count} sources)`;
    //         catalogSelect.appendChild(option);
    //     });
        
    //     // Select the last added catalog
    //     catalogSelect.value = window.loadedCatalogs[window.loadedCatalogs.length - 1].name;
        
    //     // Trigger any necessary update events
    //     const event = new Event('change', { bubbles: true });
    //     catalogSelect.dispatchEvent(event);
    // }
}


// New function to trigger catalog overlay update
function triggerCatalogOverlayUpdate(sources, options = {}) {
    // console.log('Triggering catalog overlay update', sources, options);
    
    // Ensure we have the necessary global objects
    window.catalogDataForOverlay = window.catalogDataForOverlay || [];
    
    // Add new sources to the overlay data
    const startIndex = options.startIndex !== undefined 
        ? options.startIndex 
        : window.catalogDataForOverlay.length;
    
    // Convert sources and add to overlay data, carrying over all style properties
    const convertedSources = sources.map((source, index) => ({
        ...source,
        ...options, // Apply all options (color, opacity, etc.) to each source
        index: startIndex + index,
        catalog_name: options.name || 'Default Catalog'
    }));
    
    // Extend existing overlay data
    window.catalogDataForOverlay.push(...convertedSources);
    
    // Try to update the overlay using the correct, modern function
    try {
        if (typeof canvasAddCatalogOverlay === 'function') {
            // This is the correct function to call for the new canvas system
            canvasAddCatalogOverlay(convertedSources);
        } else {
            console.warn('canvasAddCatalogOverlay function not found');
        }
    } catch (error) {
        console.error('Error updating catalog overlay:', error);
    }
}

// Add peak finder button to toolbar with fix to prevent auto-opening
function addPeakFinderButton() {
    const toolbar = document.querySelector('.toolbar');
    if (!toolbar) {
        console.warn('Toolbar not found');
        return;
    }

    // Check if the button already exists to prevent duplicates
    if (document.getElementById('peak-finder-button')) return;

    const peakFinderButton = document.createElement('button');
    peakFinderButton.id = 'peak-finder-button';
    peakFinderButton.type = 'button';
    peakFinderButton.textContent = 'Peak Finder';

    peakFinderButton.addEventListener('click', () => {
        let path = null;
        try { if (window.currentFitsFile) path = window.currentFitsFile; } catch (_) {}
        try {
            if (typeof createPeakFinderModal === 'function') return createPeakFinderModal(path);
        } catch (e) {
            console.error('Peak Finder failed:', e);
        }
    });

    toolbar.appendChild(peakFinderButton);
}

// Make the function globally available so it can be called from other scripts
window.addPeakFinderButton = addPeakFinderButton;

// Ensure the Peak Finder button is visible on initial page load too.
document.addEventListener('DOMContentLoaded', () => {
    try { addPeakFinderButton(); } catch (_) {}
    let tries = 0;
    const iv = setInterval(() => {
        tries++;
        try { addPeakFinderButton(); } catch (_) {}
        if (document.getElementById('peak-finder-button') || tries >= 20) clearInterval(iv);
    }, 250);
});

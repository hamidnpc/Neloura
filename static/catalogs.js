
// Helper function to convert RGB array to hex color
function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// Update the catalog dropdown menu
function updateCatalogDropdown(catalogs) {
    const dropdown = document.getElementById('catalog-dropdown');
    // Constrain dropdown width for better readability
    if (dropdown && dropdown.style) {
        dropdown.style.minWidth = '260px';
        dropdown.style.maxWidth = '520px';
        dropdown.style.whiteSpace = 'normal';
        dropdown.style.wordBreak = 'break-word';
    }

    // Fallback to cached catalogs if none provided
    if (!catalogs) {
        catalogs = Array.isArray(window.availableCatalogs) ? window.availableCatalogs : [];
    }

    // Preserve existing refresh option if present
    const refreshOption = dropdown.querySelector('a[onclick="refreshCatalogs()"]');
    dropdown.innerHTML = '';
    if (refreshOption) dropdown.appendChild(refreshOption);

    // Optional: quick clear option at the top
    const noneOption = document.createElement('a');
    noneOption.href = '#';
    noneOption.textContent = 'None (Clear catalogs)';
    noneOption.onclick = function() { clearCatalog(); return false; };
    dropdown.appendChild(noneOption);

    // Tabs container
    const tabsBar = document.createElement('div');
    tabsBar.style.display = 'flex';
    tabsBar.style.gap = '6px';
    tabsBar.style.margin = '4px 0 8px 0';
    tabsBar.style.position = 'relative';
    tabsBar.style.paddingBottom = '6px';

    // Inject styles for smooth tab transitions (one-time)
    if (!document.getElementById('catalog-tabs-style')) {
        const style = document.createElement('style');
        style.id = 'catalog-tabs-style';
        style.textContent = `
            #catalog-dropdown .cat-tab-content { transition: opacity 200ms ease, transform 200ms ease; }
            #catalog-dropdown .cat-tab-hidden { opacity: 0; transform: translateX(-6px); pointer-events: none; height: 0; overflow: hidden; }
            #catalog-dropdown .cat-tab-visible { opacity: 1; transform: translateX(0); }
            #catalog-dropdown .cat-tab-underline { position: absolute; bottom: 0; left: 0; height: 2px; width: 0; background: #8B5CF6; border-radius: 2px; transition: left 220ms ease, width 220ms ease; }
        `;
        document.head.appendChild(style);
    }

    function makeTabButton(text) {
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.style.background = '#374151';
        btn.style.color = '#fff';
        btn.style.border = '1px solid #4b5563';
        btn.style.borderRadius = '8px';
        btn.style.padding = '6px 10px';
        btn.style.cursor = 'pointer';
        btn.style.fontSize = '12px';
        btn.style.fontWeight = '600';
        return btn;
    }

    const btnMain = makeTabButton('Main Catalogs');
    const btnUploads = makeTabButton('Uploaded Catalogs');
    tabsBar.appendChild(btnMain);
    tabsBar.appendChild(btnUploads);
    dropdown.appendChild(tabsBar);

    // Search (filters the currently shown tab)
    const searchWrap = document.createElement('div');
    Object.assign(searchWrap.style, { margin: '0 0 10px 0' });
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search catalogs...';
    searchInput.autocomplete = 'off';
    searchInput.spellcheck = false;
    searchInput.id = 'catalog-search-input';
    Object.assign(searchInput.style, {
        width: '95%',
        boxSizing: 'border-box',
        padding: '8px 10px',
        borderRadius: '12px',
        border: '1px solid rgba(255,255,255,0.16)',
        background: 'rgba(0,0,0,0.22)',
        color: '#fff',
        outline: 'none',
        fontSize: '13px',
        padding: '13px',
        marginleft: '10px',
        marginright: '12px',
    });
    searchInput.addEventListener('focus', () => {
        searchInput.style.borderColor = 'rgba(255,255,255,0.26)';
        searchInput.style.boxShadow = '0 0 0 3px rgba(139, 92, 246, 0.18)';
    });
    searchInput.addEventListener('blur', () => {
        searchInput.style.borderColor = 'rgba(255,255,255,0.16)';
        searchInput.style.boxShadow = 'none';
    });
    searchWrap.appendChild(searchInput);
    dropdown.appendChild(searchWrap);

    // Tab contents
    const mainWrap = document.createElement('div');
    mainWrap.className = 'cat-tab-content cat-tab-visible';
    const uploadsWrap = document.createElement('div');
    uploadsWrap.className = 'cat-tab-content cat-tab-hidden';

    const noMatchMain = document.createElement('div');
    noMatchMain.textContent = 'No matches.';
    Object.assign(noMatchMain.style, { color: 'rgba(255,255,255,0.65)', padding: '10px 12px', display: 'none', fontSize: '12px' });
    const noMatchUploads = document.createElement('div');
    noMatchUploads.textContent = 'No matches.';
    Object.assign(noMatchUploads.style, { color: 'rgba(255,255,255,0.65)', padding: '10px 12px', display: 'none', fontSize: '12px' });

    // Animated underline indicator
    const underline = document.createElement('div');
    underline.className = 'cat-tab-underline';
    tabsBar.appendChild(underline);

    function moveUnderline(targetBtn) {
        try {
            const barRect = tabsBar.getBoundingClientRect();
            const btnRect = targetBtn.getBoundingClientRect();
            underline.style.left = `${Math.max(0, btnRect.left - barRect.left)}px`;
            underline.style.width = `${btnRect.width}px`;
        } catch (_) {}
    }

    function setActive(which) {
        const activeBg = '#6D28D9';
        const inactiveBg = '#374151';
        if (which === 'main') {
            mainWrap.classList.remove('cat-tab-hidden');
            mainWrap.classList.add('cat-tab-visible');
            uploadsWrap.classList.remove('cat-tab-visible');
            uploadsWrap.classList.add('cat-tab-hidden');
            btnMain.style.background = activeBg;
            btnUploads.style.background = inactiveBg;
            moveUnderline(btnMain);
        } else {
            uploadsWrap.classList.remove('cat-tab-hidden');
            uploadsWrap.classList.add('cat-tab-visible');
            mainWrap.classList.remove('cat-tab-visible');
            mainWrap.classList.add('cat-tab-hidden');
            btnMain.style.background = inactiveBg;
            btnUploads.style.background = activeBg;
            moveUnderline(btnUploads);
        }
    }

    btnMain.onclick = () => setActive('main');
    btnUploads.onclick = () => setActive('uploads');

    // Populate Main Catalogs (from catalogs directory)
    if (catalogs && catalogs.length > 0) {
        catalogs.forEach(catalog => {
            const a = document.createElement('a');
            a.href = '#';
            a.textContent = catalog.name;
            a.onclick = function() {
                showStyleCustomizerPopup(catalog.name);
                return false;
            };
            mainWrap.appendChild(a);
        });
    } else {
        const noItems = document.createElement('a');
        noItems.href = '#';
        noItems.textContent = 'No catalogs found';
        noItems.style.color = 'gray';
        noItems.style.cursor = 'default';
        noItems.onclick = function() { return false; };
        mainWrap.appendChild(noItems);
    }
    mainWrap.appendChild(noMatchMain);

    // Populate Uploaded Catalogs (files/uploads) filtered by patterns
    (async () => {
        try {
            const res = await apiFetch('/list-files/files/uploads');
            const js = await res.json();
            const files = (js.files || []).filter(f => {
                const name = (f && f.name) || '';
                const isFits = /\.(fits|fit)$/i.test(name);
                const matches = /^(injected_catalog_|peak_catalog_|upload_).+\.(fits|fit)$/i.test(name);
                return f.type === 'file' && isFits && matches;
            });
            if (files.length === 0) {
                const noUp = document.createElement('a');
                noUp.href = '#';
                noUp.textContent = 'No uploaded catalogs found.';
                noUp.style.color = 'gray';
                noUp.style.cursor = 'default';
                noUp.onclick = function() { return false; };
                uploadsWrap.appendChild(noUp);
            } else {
                files.forEach(f => {
                    const a = document.createElement('a');
                    a.href = '#';
                    a.textContent = f.name;
                    a.title = 'Open uploaded catalog';
                    a.onclick = function() {
                        // Open like main catalogs using full relative path under files/uploads
                        const relPath = `files/uploads/${f.name}`;
                        showStyleCustomizerPopup(relPath);
                        return false;
                    };
                    uploadsWrap.appendChild(a);
                });
            }
        } catch (e) {
            const err = document.createElement('a');
            err.href = '#';
            err.textContent = 'Failed to load uploaded catalogs';
            err.style.color = 'tomato';
            err.style.cursor = 'default';
            err.onclick = function() { return false; };
            uploadsWrap.appendChild(err);
        }
        uploadsWrap.appendChild(noMatchUploads);
        // Apply filter after async upload list is ready
        try { applyCatalogFilter(); } catch (_) {}
    })();

    dropdown.appendChild(mainWrap);
    dropdown.appendChild(uploadsWrap);

    function applyFilterToWrap(wrap, noMatchEl, q) {
        const query = (q || '').trim().toLowerCase();
        const links = Array.from(wrap.querySelectorAll('a')).filter(a => a && a.textContent);
        let shown = 0;
        for (const a of links) {
            // Keep static "empty/error" links visible if they are the only content
            const isStatic = (a.style && (a.style.cursor === 'default')) || /no .*found|failed to load/i.test(a.textContent || '');
            if (!query) {
                a.style.display = '';
                if (!isStatic) shown++;
                continue;
            }
            if (isStatic) {
                a.style.display = 'none';
                continue;
            }
            const ok = String(a.textContent || '').toLowerCase().includes(query);
            a.style.display = ok ? '' : 'none';
            if (ok) shown++;
        }
        if (noMatchEl) noMatchEl.style.display = (query && shown === 0) ? 'block' : 'none';
    }

    function applyCatalogFilter() {
        const q = searchInput.value || '';
        applyFilterToWrap(mainWrap, noMatchMain, q);
        applyFilterToWrap(uploadsWrap, noMatchUploads, q);
    }

    // debounce light (avoid relayout spam)
    let __catSearchT = null;
    searchInput.addEventListener('input', () => {
        try { if (__catSearchT) clearTimeout(__catSearchT); } catch (_) {}
        __catSearchT = setTimeout(() => {
            applyCatalogFilter();
        }, 80);
    });

    // Default active tab (allow forcing to 'uploads' after an upload)
    try {
        const desired = (window.__forceCatalogTab === 'uploads') ? 'uploads' : 'main';
        setActive(desired);
    } finally {
        if (window.__forceCatalogTab) window.__forceCatalogTab = null;
    }
    setTimeout(() => moveUnderline(btnMain), 0);
    // Apply initial filter (empty -> show all)
    try { applyCatalogFilter(); } catch (_) {}
}

// Refresh the catalog list (global helper used by the Catalog dropdown)
function refreshCatalogs() {
    try { console.log('[catalogs] Refreshing catalog list'); } catch (_) {}
    try { loadCatalogs(); } catch (err) { try { console.error('[catalogs] refreshCatalogs failed', err); } catch(_) {} }
    return false; // Prevent default anchor behavior
}
try { window.refreshCatalogs = refreshCatalogs; } catch (_) {}

// function loadCatalog(catalogName) {


//     if (!catalogName) {
//         showNotification('Please select a catalog first', 3000);
//         return;
//     }
    
//     console.log(`Loading catalog: ${catalogName}`);
    
//     // Store the current catalog name globally
//     window.currentCatalogName = catalogName;
    
//     // Set the active catalog
//     activeCatalog = catalogName;
    
//     // Show loading indicator
//     showNotification(true, 'Loading catalog...');
    
//     // Clear any existing catalog overlay
//     clearCatalogOverlay();
    
//     // Clear any existing flag data
//     window.catalogDataWithFlags = null;
    
//     // Fetch catalog data from server
//     fetch(`/catalog-with-flags/${encodeURIComponent(catalogName)}`, {
//         method: 'GET'
//     })
//     .then(response => {
//         if (!response.ok) {
//             throw new Error(`Failed to load catalog: ${response.statusText}`);
//         }
//         return response.json();
//     })
//     .then(responseData => {
//         console.time('parseJsonCatalog');

//         let catalogData;
//         if (Array.isArray(responseData)) {
//             catalogData = responseData;
//         } else if (responseData && responseData.data && Array.isArray(responseData.data)) {
//             catalogData = responseData.data;
//         } else if (responseData && responseData.catalog && Array.isArray(responseData.catalog)) {
//             catalogData = responseData.catalog;
//         } else if (responseData && responseData.catalog_data && Array.isArray(responseData.catalog_data)) {
//             catalogData = responseData.catalog_data;
//         } else {
//             console.error('Parsed catalog data is not an array and does not contain a "data", "catalog", or "catalog_data" property with an array:', responseData);
//             throw new Error('Invalid catalog data format: expected an array or an object with a data array.');
//         }
        
//         console.log(`Received JSON data with ${catalogData.length} objects.`);

//         // Ensure that the catalogData is an array
//         if (!Array.isArray(catalogData)) {
//             console.error('Parsed catalog data is not an array:', catalogData);
//             throw new Error('Invalid catalog data format: expected an array.');
//         }

//         // Optional: Log the first few objects to verify structure
//         if (catalogData.length > 0) {
//             console.log('First catalog object:', catalogData[0]);
//         }

//         console.timeEnd('parseJsonCatalog');
//         console.log(`Loaded ${catalogData.length} objects from catalog`);
        
//         // Store the complete catalog data with flags for filtering
//         window.catalogDataWithFlags = catalogData;
//         console.log('Stored catalog data with flags for filtering');
        
//         // Log available properties for debugging
//         if (catalogData.length > 0) {
//             const sampleObj = catalogData[0];
//             const allProps = Object.keys(sampleObj);
//             const booleanProps = allProps.filter(key => {
//                 const val = sampleObj[key];
//                 return typeof val === 'boolean' || val === 'True' || val === 'False' || 
//                        val === true || val === false || val === 1 || val === 0;
//             });
//             console.log('All properties in catalog:', allProps);
//             console.log('Boolean properties found:', booleanProps);
//         }
        
//         // Get catalog info for display
//         fetch(`/catalog-info/?catalog_name=${encodeURIComponent(catalogName)}`)
//             .then(response => response.json())
//             .then(catalogInfo => {
//                 // Function to safely add catalog overlay, waiting for viewer if necessary
//                 let retryCount = 0; // Initialize retry counter
//                 const maxRetries = 50; // Maximum number of retries (50 * 100ms = 5 seconds)

//                 function safeAddOverlay() {
//                     console.log(`[safeAddOverlay Attempt ${retryCount + 1}/${maxRetries}] Checking viewer and addCatalogOverlay function...`);
//                     const activeViewer = window.viewer || window.tiledViewer; // Check for either viewer
//                     console.log(`[safeAddOverlay] window.viewer:`, window.viewer);
//                     console.log(`[safeAddOverlay] window.tiledViewer:`, window.tiledViewer);
//                     console.log(`[safeAddOverlay] activeViewer:`, activeViewer);
//                     console.log(`[safeAddOverlay] typeof window.addCatalogOverlay:`, typeof window.addCatalogOverlay);

//                     if (activeViewer && typeof window.addCatalogOverlay === 'function') {
//                         console.log('[safeAddOverlay] Viewer ready, adding catalog overlay.');
//                         // Pass the active viewer to addCatalogOverlay if it needs it
//                         // For now, assuming addCatalogOverlay uses a global or can find it.
//                         addCatalogOverlay(catalogData);

//                         // Display catalog info
//                         displayCatalogInfo(catalogInfo);

//                         // Create flag filter button
//                         createFlagFilterButton();

//                         // Hide loading indicator
//                         showNotification(false);
                        
//                         // Show success message with boolean flag count
//                         if (catalogData.length > 0) {
//                             const sampleObj = catalogData[0];
//                             const booleanCount = Object.keys(sampleObj).filter(key => {
//                                 const val = sampleObj[key];
//                                 return typeof val === 'boolean' || val === 'True' || val === 'False' || 
//                                        val === true || val === false || val === 1 || val === 0;
//                             }).length;
                            
//                             if (booleanCount > 0) {
//                                 showNotification(`Catalog loaded with ${booleanCount} boolean flags available for filtering`, 3000, 'success');
//                             } else {
//                                 showNotification('Catalog loaded successfully', 2000, 'success');
//                             }
//                         }
//                     } else {
//                         retryCount++;
//                         if (retryCount > maxRetries) {
//                             console.error('[safeAddOverlay] Max retries reached. Viewer or addCatalogOverlay function not available.');
//                             showNotification(false); // Hide loading indicator
//                             showNotification('Error: Viewer initialization failed. Catalog cannot be displayed.', 5000, 'error');
//                             return;
//                         }
//                         console.warn(`[safeAddOverlay] Viewer not ready, retrying to add catalog overlay in 100ms... (Attempt ${retryCount}/${maxRetries})`);
//                         setTimeout(safeAddOverlay, 100); // Retry after 100ms
//                     }
//                 }
//                 safeAddOverlay(); // Initial attempt
//             })
//             .catch(error => {
//                 console.error('Error fetching catalog info:', error);
//                 // Still try to add the overlay even if info fails, but wait for viewer
//                 let errorRetryCount = 0; // Initialize retry counter for error path
//                 const maxErrorRetries = 50; // Maximum number of retries for error path

//                 function safeAddOverlayWithError() {
//                     console.log(`[safeAddOverlayWithError Attempt ${errorRetryCount + 1}/${maxErrorRetries}] Checking viewer and addCatalogOverlay function...`);
//                     const activeViewer = window.viewer || window.tiledViewer; // Check for either viewer
//                     console.log(`[safeAddOverlayWithError] window.viewer:`, window.viewer);
//                     console.log(`[safeAddOverlayWithError] window.tiledViewer:`, window.tiledViewer);
//                     console.log(`[safeAddOverlayWithError] activeViewer:`, activeViewer);
//                     console.log(`[safeAddOverlayWithError] typeof window.addCatalogOverlay:`, typeof window.addCatalogOverlay);

//                     if (activeViewer && typeof window.addCatalogOverlay === 'function') {
//                         console.log('[safeAddOverlayWithError] Viewer ready (error path), adding catalog overlay.');
//                         // Pass the active viewer to addCatalogOverlay if it needs it
//                         addCatalogOverlay(catalogData);
                        
//                         // Create flag filter button even if catalog info failed
//                         createFlagFilterButton();
                        
//                         // Hide loading indicator
//                         showNotification(false);
                        
//                         // Show success message even if catalog info failed
//                         showNotification('Catalog loaded successfully (info unavailable)', 2000, 'success');
//                     } else {
//                         errorRetryCount++;
//                         if (errorRetryCount > maxErrorRetries) {
//                             console.error('[safeAddOverlayWithError] Max retries reached in error path. Viewer or addCatalogOverlay function not available.');
//                             showNotification(false); // Hide loading indicator
//                             // Potentially show a different notification if needed
//                             return;
//                         }
//                         console.warn(`[safeAddOverlayWithError] Viewer not ready (error path), retrying to add catalog overlay in 100ms... (Attempt ${errorRetryCount}/${maxErrorRetries})`);
//                         setTimeout(safeAddOverlayWithError, 100); // Retry after 100ms
//                     }
//                 }
//                 safeAddOverlayWithError();
//             });
//     })
//     .catch(error => {
//         console.error('Error loading catalog:', error);
//         showNotification(false);
//         showNotification(`Error: ${error.message || 'Failed to load catalog'}`, 3000, 'error');
        
//         // Clear flag data on error
//         window.catalogDataWithFlags = null;
//     });
// }

// Keep a reference to the core loadCatalog function
// const coreLoadCatalog = loadCatalog;

// FIND your updateCanvasOverlay function in catalogs.js and REPLACE the viewer detection logic

// REPLACE this section at the beginning of updateCanvasOverlay:
function updateCanvasOverlay() {
    console.log('[updateCanvasOverlay] Entered function.');
    
    // FIXED: Check for both viewer types
    const activeViewer = viewer || window.viewer || tiledViewer || window.tiledViewer;
    
    console.log('[updateCanvasOverlay] Checking prerequisites:', {
        viewer: !!viewer,
        windowViewer: !!window.viewer,
        tiledViewer: !!tiledViewer,
        windowTiledViewer: !!window.tiledViewer,
        activeViewer: !!activeViewer,
        canvasExists: typeof window.catalogCanvas !== 'undefined' && window.catalogCanvas !== null,
        dataExists: typeof window.catalogDataForOverlay !== 'undefined' && window.catalogDataForOverlay !== null
    });

    if (!activeViewer || !window.catalogCanvas || !window.catalogDataForOverlay) {
        console.log('[updateCanvasOverlay] Exiting early due to missing prerequisites.');
        console.log('[updateCanvasOverlay] Missing:', {
            viewer: !activeViewer,
            canvas: !window.catalogCanvas,
            data: !window.catalogDataForOverlay
        });
        return;
    }

    const canvas = window.catalogCanvas;
    const ctx = canvas.getContext('2d');
    
    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Get viewport bounds with margin for panning - USE ACTIVE VIEWER
    const bounds = activeViewer.viewport.getBounds();
    const viewportBounds = {
        left: bounds.x - 0.2,
        top: bounds.y - 0.2,
        right: bounds.x + bounds.width + 0.2,
        bottom: bounds.y + bounds.height + 0.2
    };
    
    // Clear the source map for click detection
    window.catalogSourceMap = [];
    
    // Count visible objects
    let visibleCount = 0;
    let filteredOutCount = 0;
    
    // Set dot styling based on current styles (used only as fallback per-object)
    const FIXED_RADIUS = 5; // Default radius in pixels
    const rs = (() => {
        if (window.regionStyles && typeof window.regionStyles === 'object') return window.regionStyles;
        try {
            const topRs = window.top && window.top.regionStyles;
            if (topRs && typeof topRs === 'object') return topRs;
        } catch (_) {}
        return regionStyles;
    })();
    const dotBorderWidth = rs.borderWidth || 1;
    const dotBorderColor = rs.borderColor || 'rgba(255, 165, 0, 0.7)';
    const dotFillColor = rs.backgroundColor || 'transparent';
    const dotOpacity = rs.opacity || 0.7;
    
    console.log('[updateCanvasOverlay] Using styles:', {
        borderWidth: dotBorderWidth,
        borderColor: dotBorderColor,
        fillColor: dotFillColor,
        opacity: dotOpacity
    });
    
    // Per-object alpha is applied per draw; keep canvas default alpha at 1
    ctx.globalAlpha = 1.0;
    
    // Process each catalog object
    for (let i = 0; i < window.catalogDataForOverlay.length; i++) {
        const obj = window.catalogDataForOverlay[i];
        
        // FIXED: Check filter state properly
        if (obj.passesFilter === false) {
            filteredOutCount++;
            continue; // Skip objects that don't pass the filter
        }
        
        // Get coordinates, preserving original values
        let x = obj.x;
        let y = obj.y;
        
        // Convert RA/DEC to pixel coordinates if we have WCS
        if (obj.ra !== undefined && obj.dec !== undefined && window.parsedWCS && window.parsedWCS.hasWCS) {
            const pixelCoords = celestialToPixel(obj.ra, obj.dec, window.parsedWCS);
            console.log('pixelCoords2:::::',pixelCoords);
            x = pixelCoords.x;
            y = pixelCoords.y;
        }
        
        // Convert image coordinates to viewport coordinates - USE TILED IMAGE (fixes multi-image warning)
        const tiledImage = activeViewer.world.getItemAt(0);
        const viewportPoint = tiledImage ? tiledImage.imageToViewportCoordinates(x, y) : activeViewer.viewport.imageToViewportCoordinates(x, y);
        
        // Check if the point is within the viewport bounds
        if (viewportPoint.x >= viewportBounds.left && 
            viewportPoint.x <= viewportBounds.right && 
            viewportPoint.y >= viewportBounds.top && 
            viewportPoint.y <= viewportBounds.bottom) {
            
            // Convert viewport coordinates to canvas coordinates - USE ACTIVE VIEWER
            const pagePoint = activeViewer.viewport.viewportToViewerElementCoordinates(viewportPoint);
            
            // Get the radius in pixels (use the object's radius if available)
            const radius = (obj.radius_pixels || FIXED_RADIUS);
            
            // Draw the dot
            const shapeHere = ((obj && obj.shape) ? String(obj.shape) : String(rs.shape || 'circle'));
            const dotShape = (shapeHere === 'hexagon') ? 'hexagon' : 'circle';
            ctx.beginPath();
            if (dotShape === 'hexagon') {
                const sides = 6;
                const angleOffset = -Math.PI / 2; // pointy top/bottom
                for (let s = 0; s < sides; s++) {
                    const ang = angleOffset + (s * 2 * Math.PI) / sides;
                    const px = pagePoint.x + radius * Math.cos(ang);
                    const py = pagePoint.y + radius * Math.sin(ang);
                    if (s === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.closePath();
            } else {
                ctx.arc(pagePoint.x, pagePoint.y, radius, 0, 2 * Math.PI, false);
            }
            
            // --- Per-object styling (enables multiple catalogs at once) ---
            const objOpacity = (typeof obj.opacity === 'number') ? obj.opacity : dotOpacity;
            ctx.globalAlpha = Math.max(0, Math.min(1, objOpacity));

            const stroke = obj.color || dotBorderColor;
            const lineW = (typeof obj.border_width === 'number') ? obj.border_width : dotBorderWidth;
            ctx.lineWidth = lineW;
            ctx.strokeStyle = stroke;

            const fill = obj.fillColor || dotFillColor;
            const fillIsTransparent = obj.useTransparentFill === true || fill === 'transparent' || fill === 'rgba(0, 0, 0, 0)';
            if (!fillIsTransparent) {
                ctx.fillStyle = fill;
                ctx.fill();
            }
            ctx.stroke();

            // reset alpha so subsequent calculations aren't affected
            ctx.globalAlpha = 1.0;
            
            // Store the source location for click detection
            window.catalogSourceMap.push({
                x: pagePoint.x,
                y: pagePoint.y,
                radius: radius,
                sourceIndex: i,
                imageX: x,
                imageY: y,
                ra: obj.ra,
                dec: obj.dec,
                catalogName: obj.__catalogName || null
            });
            
            visibleCount++;
        }
    }
    
    // Log results
    console.log(`[updateCanvasOverlay] Canvas rendering complete:`, {
        totalObjects: window.catalogDataForOverlay.length,
        filteredOut: filteredOutCount,
        visibleInViewport: visibleCount,
        totalSourceMap: window.catalogSourceMap.length
    });
}

// ALSO ADD this improved applyEnvironmentFilter function to your catalogs.js:

function applyEnvironmentFilter(envValue) {
    console.log(`Applying environment filter for value: ${envValue} (${ENV_DESCRIPTIONS[envValue]})`);
    
    if (!window.catalogDataWithFlags) {
        console.warn('No catalog data available for environment filtering');
        showNotification('No catalog data available for filtering', 3000, 'warning');
        return;
    }
    
    showNotification(true, `Filtering by ${ENV_DESCRIPTIONS[envValue]}...`);
    
    let visibleCount = 0;
    const targetEnvValue = parseInt(envValue);
    
    console.log(`Using target environment value: ${targetEnvValue} (${typeof targetEnvValue})`);
    
    // IMPROVED: Handle canvas-based overlay with better filtering
    if (window.catalogDataForOverlay && typeof updateCanvasOverlay === 'function') {
        console.log('Applying environment filter to canvas overlay');
        
        // Filter the overlay data
        window.catalogDataForOverlay.forEach((obj, index) => {
            if (obj && 'env' in obj) {
                const objEnvValue = parseInt(obj.env);
                const matchesEnv = (objEnvValue === targetEnvValue);
                
                // Set filter property on the object
                obj.passesFilter = matchesEnv;
                
                if (matchesEnv) {
                    visibleCount++;
                }
                
                // Debug first few objects
                if (index < 5) {
                    console.log(`Object ${index}: env = ${obj.env} (${typeof obj.env}), target = ${targetEnvValue}, matches = ${matchesEnv}, passesFilter = ${obj.passesFilter}`);
                }
            } else {
                obj.passesFilter = false;
            }
        });
        
        // IMPORTANT: Force immediate canvas update
        console.log('Calling updateCanvasOverlay to refresh display...');
        updateCanvasOverlay();
        
        // Also update global filter state for consistency
        window.flagFilterEnabled = true;
        window.currentFlagColumn = 'env';
        window.currentEnvValue = targetEnvValue;
    }
    
    // Handle DOM-based overlay (if catalogDots exist) - for backwards compatibility
    if (window.catalogDots && window.catalogDots.length > 0) {
        console.log('Also applying environment filter to DOM dots');
        
        window.catalogDots.forEach((dot, i) => {
            if (!dot || !dot.dataset) {
                return;
            }
            
            const dotIndex = parseInt(dot.dataset.index);
            
            if (isNaN(dotIndex) || dotIndex >= window.catalogDataWithFlags.length) {
                dot.style.display = 'none';
                dot.dataset.passesFilter = 'false';
                return;
            }
            
            const objData = window.catalogDataWithFlags[dotIndex];
            let matchesEnv = false;
            
            if (objData && 'env' in objData) {
                const objEnvValue = parseInt(objData.env);
                matchesEnv = (objEnvValue === targetEnvValue);
            }
            
            dot.style.display = matchesEnv ? 'block' : 'none';
            dot.dataset.passesFilter = matchesEnv ? 'true' : 'false';
        });
        
        if (typeof updateOverlay === 'function') {
            updateOverlay();
        }
    }
    
    console.log(`Environment filter results: ${visibleCount} objects match env=${targetEnvValue}`);
    
    showNotification(false);
    
    if (visibleCount === 0) {
        showNotification(`No objects found in "${ENV_DESCRIPTIONS[targetEnvValue]}" environment`, 3000, 'warning');
    } else {
        showNotification(`Showing ${visibleCount} objects in "${ENV_DESCRIPTIONS[targetEnvValue]}"`, 2500, 'success');
    }
}


// tion handles click detection for the canvas overlay
function handleCanvasClick(event) {
    if (!window.catalogSourceMap || !window.catalogDataForOverlay) return;
    
    // Get click coordinates relative to the viewer
    const viewerElement = document.getElementById('openseadragon');
    const rect = viewerElement.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;
    
    // Find the closest source to the click point
    let closestSource = null;
    let closestDistance = Infinity;
    const hitRadius = 10; // Click tolerance in pixels
    
    for (const source of window.catalogSourceMap) {
        const dx = source.x - clickX;
        const dy = source.y - clickY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Check if click is within hit radius
        if (distance <= Math.max(hitRadius, source.radius) && distance < closestDistance) {
            closestDistance = distance;
            closestSource = source;
        }
    }
    
    // If we found a source, show info about it
    if (closestSource) {
        const sourceObj = window.catalogDataForOverlay[closestSource.sourceIndex];
        
        // Create a temporary dot-like object to pass to the existing showRegionInfo function
        const tempDot = {
            dataset: {
                x: closestSource.imageX,
                y: closestSource.imageY,
                ra: closestSource.ra,
                dec: closestSource.dec,
                radius: sourceObj.radius_pixels || 5,
                index: closestSource.sourceIndex
            }
        };
        
        // Highlight the selected source
        highlightSelectedSource(closestSource.sourceIndex);
        
        // Show the info popup
        showRegionInfo(tempDot, sourceObj,event);
    }
}

// Function to highlight a selected source
function highlightSelectedSource(selectedIndex) {
    if (!viewer || !window.catalogCanvas || !window.catalogDataForOverlay) return;
    
    // Get the canvas context
    const canvas = window.catalogCanvas;
    const ctx = canvas.getContext('2d');
    
    // Find the source in our source map
    const source = window.catalogSourceMap.find(s => s.sourceIndex === selectedIndex);
    if (!source) return;
    
    // Draw highlight
    ctx.globalAlpha = 1.0; // Full opacity for highlight
    
    // Outer glow
    ctx.beginPath();
    ctx.arc(source.x, source.y, source.radius + 3, 0, 2 * Math.PI, false);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'yellow';
    ctx.stroke();
    
    // Reset opacity
    ctx.globalAlpha = regionStyles.opacity || 0.7;
}


// Create a new info popup element
function createInfoPopup(dotIndex) {
    // Create popup element
    const popup = document.createElement('div');
    popup.className = 'region-info-popup';
    popup.style.position = 'absolute';
    popup.style.zIndex = '2000';
    popup.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    popup.style.color = 'white';
    popup.style.padding = '10px';
    popup.style.borderRadius = '5px';
    popup.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.5)';
    popup.style.fontSize = '14px';
    popup.style.fontFamily = 'Arial, sans-serif';
    popup.style.width = '340px';
    popup.style.display = 'none';
    popup.style.pointerEvents = 'auto';
    popup.style.cursor = 'move'; // Show move cursor to indicate draggability
    
    // Create header for dragging
    const header = document.createElement('div');
    header.style.padding = '5px';
    header.style.marginBottom = '10px';
    header.style.borderBottom = '1px solid #555';
    header.style.fontWeight = 'bold';
    header.style.cursor = 'move';
    header.innerHTML = 'Region Information <span style="font-size: 12px; font-weight: normal; font-style: italic; color: #aaa;"></span>';
    popup.appendChild(header);
    
    // Add close button
    const closeButton = document.createElement('div');
    closeButton.innerHTML = '×';
    closeButton.style.position = 'absolute';
    closeButton.style.top = '5px';
    closeButton.style.right = '8px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.fontSize = '16px';
    closeButton.style.fontWeight = 'bold';
    closeButton.addEventListener('click', function(event) {
        event.stopPropagation();
        hideInfoPopup(popup);
    });
    popup.appendChild(closeButton);
    
    // Add content container
    const contentContainer = document.createElement('div');
    contentContainer.className = 'popup-content';
    popup.appendChild(contentContainer);
    
    // Store the dot index
    popup.dataset.dotIndex = dotIndex;
    
    // Add to document
    document.body.appendChild(popup);
    
    // Make the popup draggable
    makeDraggable(popup, header);
    
    // Add to popups array
    infoPopups.push(popup);
    
    return popup;
}

// Function to make an element draggable
function makeDraggable(element, dragHandle) {
    if (!element) return;
    const doc = element.ownerDocument || document;
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

    const handle = dragHandle || element;
    if (!handle) return;

    const dragMouseDown = (e) => {
        if (!e) return;
        try {
            e.preventDefault();
            e.stopPropagation();
        } catch(_) {}
        pos3 = e.clientX;
        pos4 = e.clientY;
        if (element.dataset) element.dataset.isDragging = 'true';
        doc.addEventListener('mousemove', elementDrag, true);
        doc.addEventListener('mouseup', closeDragElement, true);
    };

    const elementDrag = (e) => {
        if (!e) return;
        try { e.preventDefault(); } catch(_) {}
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        element.style.top = (element.offsetTop - pos2) + 'px';
        element.style.left = (element.offsetLeft - pos1) + 'px';
    };

    const closeDragElement = () => {
        doc.removeEventListener('mouseup', closeDragElement, true);
        doc.removeEventListener('mousemove', elementDrag, true);
        if (element.dataset) {
            setTimeout(() => {
                element.dataset.isDragging = 'false';
            }, 10);
        }
    };

    handle.addEventListener('mousedown', dragMouseDown, true);
}




// Display catalog information
function displayCatalogInfo(catalogInfo) {
    // Function disabled to remove catalog info display
    console.log(`Catalog loaded: ${catalogInfo.name} with ${catalogInfo.row_count} objects`);
    
    // Keep the reference to the catalog info but don't display it
    const infoElement = document.getElementById('catalog-info');
    if (infoElement) {
        infoElement.style.display = 'none';
    }
}

function _ensureCatalogOverlayStore() {
    if (!window.catalogOverlaysByCatalog || typeof window.catalogOverlaysByCatalog !== 'object') {
        window.catalogOverlaysByCatalog = {};
    }
}

function _catalogKey(name) {
    const raw = String(name || '');
    if (!raw) return '';
    // Prefer the internal tracking name in window.catalogData (often "catalogs/<file>")
    if (raw.startsWith('catalogs/')) return raw;
    // Otherwise keep basename but prefix for consistency
    const base = raw.split('/').pop().split('\\').pop();
    return `catalogs/${base}`;
}

function rebuildCombinedCatalogOverlay() {
    _ensureCatalogOverlayStore();
    if (!window.catalogVisibilityByCatalog || typeof window.catalogVisibilityByCatalog !== 'object') {
        window.catalogVisibilityByCatalog = {};
    }
    const keys = Object.keys(window.catalogOverlaysByCatalog);
    const combined = [];
    keys.forEach((k) => {
        if (!(k in window.catalogVisibilityByCatalog)) window.catalogVisibilityByCatalog[k] = true;
        if (window.catalogVisibilityByCatalog[k] === false) return;
        const arr = window.catalogOverlaysByCatalog[k];
        if (Array.isArray(arr) && arr.length) {
            // Avoid `push(...arr)` which can throw for very large arrays ("too many arguments"/call stack).
            for (let i = 0; i < arr.length; i += 1) combined.push(arr[i]);
        }
    });
    // IMPORTANT: make overlay indices globally unique across catalogs.
    // Many click paths use `sourceIndex` / `__overlay_index` to look up the clicked object in
    // `window.catalogDataForOverlay`. If per-catalog indices (like `index: 0..N`) are reused,
    // clicks will fetch a valid-but-wrong row from a different catalog.
    for (let i = 0; i < combined.length; i++) {
        const obj = combined[i];
        if (!obj || typeof obj !== 'object') continue;
        try { obj.__overlay_index = i; } catch (_) {}
        try { obj.sourceIndex = i; } catch (_) {}
        // Keep `index` as-is (some UIs display it), but provide a stable global index above.
    }
    window.catalogDataForOverlay = combined;

    // Build a simple spatial grid index in image-pixel space.
    // This speeds up drawing and hit-testing for very large catalogs by letting the renderer
    // iterate only sources inside (or near) the current viewport.
    try {
        // For extremely large catalogs, building a full JS Map-based spatial index can freeze the UI
        // and consume a lot of memory. We skip it and let the renderer rely on sampling/preview mode.
        if (combined.length > 250000) {
            window.__catalogSpatialGrid = null;
            try { if (window.top && window.top !== window) window.top.__catalogSpatialGrid = null; } catch (_) {}
            throw new Error('skip-grid');
        }
        const cellSize = 256; // image pixels; trade-off between bucket size and overhead
        const cells = new Map(); // "cx,cy" -> array of overlay indices
        const addToCell = (idx, x, y) => {
            const cx = Math.floor(x / cellSize);
            const cy = Math.floor(y / cellSize);
            const key = `${cx},${cy}`;
            const arr = cells.get(key);
            if (arr) arr.push(idx);
            else cells.set(key, [idx]);
        };
        for (let i = 0; i < combined.length; i++) {
            const s = combined[i];
            if (!s || typeof s !== 'object') continue;
            let x = Number.isFinite(s.x) ? s.x : (Number.isFinite(s.x_pixels) ? s.x_pixels : NaN);
            let y = Number.isFinite(s.y) ? s.y : (Number.isFinite(s.y_pixels) ? s.y_pixels : NaN);
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            if (x === 0 && y === 0) continue;
            addToCell(i, x, y);
            try { s.__gridKey = `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`; } catch (_) {}
        }
        window.__catalogSpatialGrid = { cellSize, cells };
        try { if (window.top && window.top !== window) window.top.__catalogSpatialGrid = window.__catalogSpatialGrid; } catch (_) {}
    } catch (_) {
        try { window.__catalogSpatialGrid = null; } catch (_) {}
    }
    try {
        if (typeof canvasUpdateOverlay === 'function' && window.catalogCanvas) {
            canvasUpdateOverlay();
        } else if (typeof updateCanvasOverlay === 'function' && window.catalogCanvas) {
            updateCanvasOverlay();
        }
    } catch (_) {}

    // Notify other UI modules (e.g., Plotter) that the set of loaded catalogs changed.
    // This is emitted on load/unload/toggle visibility, not only when a catalog is clicked in controls.
    try {
        const evt = new CustomEvent('catalogs:updated', {
            detail: {
                keys: Object.keys(window.catalogOverlaysByCatalog || {}),
                active: window.activeCatalog || window.currentCatalogName || (typeof activeCatalog !== 'undefined' ? activeCatalog : null) || null
            }
        });
        window.dispatchEvent(evt);
        // Multi-panel: also notify the top window so Plotter (which lives in top) can react immediately.
        try {
            const topWin = (window.top && window.top !== window) ? window.top : null;
            if (topWin && typeof topWin.dispatchEvent === 'function') {
                topWin.dispatchEvent(new CustomEvent('catalogs:updated', { detail: evt.detail }));
            }
        } catch (_) {}
    } catch (_) {}
}

function getLoadedCatalogOverlays() {
    _ensureCatalogOverlayStore();
    if (!window.catalogVisibilityByCatalog || typeof window.catalogVisibilityByCatalog !== 'object') {
        window.catalogVisibilityByCatalog = {};
    }
    const keys = Object.keys(window.catalogOverlaysByCatalog);
    return keys.map((k) => {
        if (!(k in window.catalogVisibilityByCatalog)) window.catalogVisibilityByCatalog[k] = true;
        const arr = window.catalogOverlaysByCatalog[k];
        return {
            key: k,
            visible: window.catalogVisibilityByCatalog[k] !== false,
            count: Array.isArray(arr) ? arr.length : 0
        };
    });
}

function setCatalogOverlayVisible(catalogKeyOrName, visible) {
    _ensureCatalogOverlayStore();
    if (!window.catalogVisibilityByCatalog || typeof window.catalogVisibilityByCatalog !== 'object') {
        window.catalogVisibilityByCatalog = {};
    }
    const key = _catalogKey(catalogKeyOrName);
    window.catalogVisibilityByCatalog[key] = !!visible;
    rebuildCombinedCatalogOverlay();
}

function setActiveCatalogForControls(catalogKeyOrName) {
    const key = _catalogKey(catalogKeyOrName);
    // set both globals used across modules
    try { window.currentCatalogName = key; } catch (_) {}
    try { window.activeCatalog = key; } catch (_) {}
    try { activeCatalog = key; } catch (_) {}
    // try to sync regionStyles from stored catalog style so slider reflects correct opacity
    try {
        const entry = Array.isArray(window.catalogData)
            ? window.catalogData.find(c => String(c?.name || '') === key)
            : null;
        const style = entry?.style || (window.__catalogStylesByName && window.__catalogStylesByName[key]) || null;
        if (style && typeof style === 'object') {
            window.regionStyles = { ...(window.regionStyles || {}), ...style };
        }
    } catch (_) {}
    try {
        const evt = new CustomEvent('catalog:changed', { detail: { name: key } });
        window.dispatchEvent(evt);
        // Multi-panel: also notify the top window so Plotter (which lives in top) can react.
        try {
            const topWin = (window.top && window.top !== window) ? window.top : null;
            if (topWin && typeof topWin.dispatchEvent === 'function') {
                topWin.dispatchEvent(new CustomEvent('catalog:changed', { detail: evt.detail }));
            }
        } catch (_) {}
    } catch (_) {}
}

// Remove a specific catalog overlay by key (used by catalog-overlay-controls list).
function removeCatalogOverlayByKey(catalogKeyOrName) {
    try {
        _ensureCatalogOverlayStore();
        const key = _catalogKey(catalogKeyOrName);
        if (!key) return;

        // Remove overlay data
        try {
            if (window.catalogOverlaysByCatalog && window.catalogOverlaysByCatalog[key]) {
                delete window.catalogOverlaysByCatalog[key];
            }
        } catch (_) {}

        // Remove visibility state
        try {
            if (window.catalogVisibilityByCatalog && typeof window.catalogVisibilityByCatalog === 'object') {
                delete window.catalogVisibilityByCatalog[key];
            }
        } catch (_) {}

        // Clear per-catalog filter state so reload starts clean
        try {
            if (window.catalogBooleanFiltersByCatalog && typeof window.catalogBooleanFiltersByCatalog === 'object') {
                delete window.catalogBooleanFiltersByCatalog[key];
            }
        } catch (_) {}
        try {
            if (window.catalogConditionFiltersByCatalog && typeof window.catalogConditionFiltersByCatalog === 'object') {
                delete window.catalogConditionFiltersByCatalog[key];
            }
        } catch (_) {}

        // If this was the active catalog, clear active pointers
        try {
            if (String(activeCatalog || '') === String(key)) activeCatalog = null;
        } catch (_) {}
        try {
            if (String(window.currentCatalogName || '') === String(key)) window.currentCatalogName = null;
        } catch (_) {}
        try {
            if (String(window.activeCatalog || '') === String(key)) window.activeCatalog = null;
        } catch (_) {}

        // Rebuild combined overlay (may still contain other catalogs)
        try { rebuildCombinedCatalogOverlay(); } catch (_) {}

        // If nothing left, clear canvas fully and remove controls panel
        try {
            if (!Object.keys(window.catalogOverlaysByCatalog || {}).length) {
                try { clearCatalogOverlay(); } catch (_) {}
                try { if (typeof removeCatalogOverlayControls === 'function') removeCatalogOverlayControls(true); } catch (_) {}
            }
        } catch (_) {}
    } catch (_) {}
}

try {
    window.getLoadedCatalogOverlays = getLoadedCatalogOverlays;
    window.setCatalogOverlayVisible = setCatalogOverlayVisible;
    window.setActiveCatalogForControls = setActiveCatalogForControls;
    window.removeCatalogOverlayByKey = removeCatalogOverlayByKey;
} catch (_) {}

// Clear the active catalog
function clearCatalog() {
    if (!activeCatalog) return;
    // Remove only the active catalog overlay; keep others loaded.
    try {
        _ensureCatalogOverlayStore();
        const key = _catalogKey(activeCatalog);
        if (window.catalogOverlaysByCatalog && window.catalogOverlaysByCatalog[key]) {
            delete window.catalogOverlaysByCatalog[key];
        }
        // Also clear per-catalog filter state so reload starts clean
        try {
            if (window.catalogBooleanFiltersByCatalog && typeof window.catalogBooleanFiltersByCatalog === 'object') {
                delete window.catalogBooleanFiltersByCatalog[key];
            }
        } catch (_) {}
        try {
            if (window.catalogConditionFiltersByCatalog && typeof window.catalogConditionFiltersByCatalog === 'object') {
                delete window.catalogConditionFiltersByCatalog[key];
            }
        } catch (_) {}
    } catch (_) {}
    activeCatalog = null;
    
    // Hide catalog info
    const catalogInfo = document.getElementById('catalog-info');
    if (catalogInfo) {
        catalogInfo.style.display = 'none';
    }
    
    // Rebuild combined overlay (may still contain other catalogs)
    try {
        rebuildCombinedCatalogOverlay();
    } catch (_) {}
    // If nothing left, clear canvas fully
    try {
        _ensureCatalogOverlayStore();
        if (!Object.keys(window.catalogOverlaysByCatalog || {}).length) {
            clearCatalogOverlay();
        }
    } catch (_) {}
    
    // Hide SED container
    hideSed();
    
    // Hide properties container
    hideProperties();
    
    // Clear active catalog
    window.currentCatalogName = null;
    
    // Remove any shared catalog controls
    try { removeCatalogOverlayControls(true); } catch (_) {}
    // Reset cross-match config (no memory after unload)
    try { if (window.catalogCrossMatchConfig) window.catalogCrossMatchConfig = { enabled: false, radius_arcsec: 1.0 }; } catch (_) {}
}


// Update the updateOverlay function to handle multiple popups
function updateOverlay() {
    if (!viewer || !window.catalogDots) return;

    // Round zoom level to reduce shaking
    const zoom = Math.round(viewer.viewport.getZoom() * 10) / 10;
    
    // Get viewport bounds
    const bounds = viewer.viewport.getBounds();
    const viewportBounds = {
        left: bounds.x,
        top: bounds.y,
        right: bounds.x + bounds.width,
        bottom: bounds.y + bounds.height
    };
    
    // Add margin to viewport for smoother panning
    const margin = 0.2;
    viewportBounds.left -= margin;
    viewportBounds.top -= margin;
    viewportBounds.right += margin;
    viewportBounds.bottom += margin;
    
    // Count visible objects
    let visibleCount = 0;
    
    // Update each dot position
    for (let i = 0; i < window.catalogDots.length; i++) {
        const dot = window.catalogDots[i];
        
        // Skip dots that should be hidden by filter
        if (flagFilterEnabled && dot.dataset.passesFilter === 'false') {
            dot.style.display = 'none';
            continue;
        }
        
        const x = parseFloat(dot.dataset.x);
        const y = parseFloat(dot.dataset.y);
        
        // Convert image coordinates to viewport coordinates - USE TILED IMAGE (fixes multi-image warning)
        const tiledImage = viewer.world.getItemAt(0);
        const viewportPoint = tiledImage ? tiledImage.imageToViewportCoordinates(x, y) : viewer.viewport.imageToViewportCoordinates(x, y);
        
        // Check if the point is within the viewport bounds
        if (viewportPoint.x >= viewportBounds.left && 
            viewportPoint.x <= viewportBounds.right && 
            viewportPoint.y >= viewportBounds.top && 
            viewportPoint.y <= viewportBounds.bottom) {
            
            // Convert viewport coordinates to web page coordinates
            const pagePoint = viewer.viewport.viewportToViewerElementCoordinates(viewportPoint);
            
            // Get the radius in pixels (use the object's radius if available)
            const baseRadius = parseFloat(dot.dataset.radius) || 5; // Default to 5 if not specified
            
            // Position the dot
            dot.style.left = `${pagePoint.x}px`;
            dot.style.top = `${pagePoint.y}px`;
            dot.style.width = `${baseRadius * 2}px`;
            dot.style.height = `${baseRadius * 2}px`;
            dot.style.display = 'block';
            
            visibleCount++;
        } else {
            // Hide dots outside the viewport, but only if they're not filtered out
            dot.style.display = 'none';
        }
    }
    
    // console.log(`Updated overlay: ${visibleCount} visible objects out of ${window.catalogDots.length}`);
}






// // Keep a reference to the original loadCatalog function
// const originalLoadCatalog = window.loadCatalog;

// // Override the original loadCatalog function to show the style customizer popup first
// if (originalLoadCatalog) {
//     window.loadCatalog = function(catalogName) {
//         // Check if this is a direct call from apply button using stored catalog name
//         if (window.currentStyleCatalogName === catalogName) {
//             // Reset the stored name
//             window.currentStyleCatalogName = null;
            
//             // Call the original function
//             return originalLoadCatalog.call(this, catalogName);
//         } else {
//             // Show the style customizer popup first
//             showStyleCustomizerPopup(catalogName);
            
//             // We don't immediately load the catalog here - it will be loaded when the user clicks Apply
//             return false; // Prevent original click handler from continuing
//         }
//     };
// }

// // Modify the clearCatalog function to remove the filter button when catalog is cleared
// const originalClearCatalog = window.clearCatalog;
// if (originalClearCatalog) {
//     window.clearCatalog = function() {
//         // Call the original function to clear the catalog
//         const result = originalClearCatalog();
        
//         // Remove the filter button
//         const filterButton = document.querySelector('.flag-filter-container');
//         if (filterButton) {
//             filterButton.remove();
//         }
        
//         return result;
//     };
// }

// // Don't create the button on initial page load unless a catalog is already loaded
// document.addEventListener("DOMContentLoaded", function() {
//     // Only create the flag filter button if a catalog is already active
//     if (activeCatalog) {
//         createFlagFilterButton();
//     }
// });



// // Replace your existing populateFlagDropdown function with this one
// function populateFlagDropdown(dropdownContent) {
//     // Clear existing content
//     dropdownContent.innerHTML = '';
    
//     // Add a "No Filter" option
//     const noFilterItem = document.createElement('div');
//     noFilterItem.className = 'flag-item';
//     noFilterItem.textContent = 'No Filter (Show All)';
//     noFilterItem.style.padding = '10px';
//     noFilterItem.style.cursor = 'pointer';
//     noFilterItem.style.borderBottom = '1px solid #444';
//     noFilterItem.style.color = 'white';
    
//     // Highlight if currently selected
//     if (!flagFilterEnabled) {
//         noFilterItem.style.backgroundColor = 'white';
//         noFilterItem.style.color = 'black';
//     }
    
//     noFilterItem.addEventListener('mouseover', function() {
//         if (!flagFilterEnabled) return;
//         this.style.backgroundColor = '#333';
//     });
    
//     noFilterItem.addEventListener('mouseout', function() {
//         if (!flagFilterEnabled) return;
//         this.style.backgroundColor = 'transparent';
//     });
    
//     noFilterItem.addEventListener('click', function() {
//         // Disable flag filtering
//         flagFilterEnabled = false;
//         currentFlagColumn = null;
//         currentEnvValue = null;
        
//         // Update the UI
//         updateFlagFilterUI(dropdownContent);
        
//         // Show all catalog dots
//         if (window.catalogDots) {
//             window.catalogDots.forEach(dot => {
//                 dot.style.display = 'block';
//                 dot.dataset.passesFilter = 'true';
//             });
//         }
        
//         // Update overlay to refresh visibility
//         updateOverlay();
        
//         // Close the dropdown
//         dropdownContent.style.display = 'none';
//     });
    
//     dropdownContent.appendChild(noFilterItem);
    
//     // If no catalog is loaded, show a message
//     if (!activeCatalog) {
//         const noDataItem = document.createElement('div');
//         noDataItem.style.padding = '10px';
//         noDataItem.style.color = '#aaa';
//         noDataItem.textContent = 'Load a catalog to see available flags';
//         dropdownContent.appendChild(noDataItem);
//         return;
//     }
    
//     // Check if we already have flag data in the cache
//     if (window.catalogDataWithFlags) {
//         // Use the cached data to build the flag dropdown
//         buildFlagDropdownFromCache(dropdownContent);
//     } else {
//         // Show loading indicator
//         const loadingItem = document.createElement('div');
//         loadingItem.style.padding = '10px';
//         loadingItem.style.color = '#aaa';
//         loadingItem.textContent = 'Loading flag information...';
//         dropdownContent.appendChild(loadingItem);
        
//         // Load the flag data
//         fetch(`/catalog-with-flags/${activeCatalog}`)
//             .then(response => response.json())
//             .then(data => {
//                 // Cache the data for future use
//                 window.catalogDataWithFlags = data;
                
//                 // Build the dropdown using the loaded data
//                 buildFlagDropdownFromCache(dropdownContent);
//             })
//             .catch(error => {
//                 console.error('Error loading flag data:', error);
                
//                 // Show error message
//                 dropdownContent.innerHTML = '';
//                 dropdownContent.appendChild(noFilterItem); // Keep the "No Filter" option
                
//                 const errorItem = document.createElement('div');
//                 errorItem.style.padding = '10px';
//                 errorItem.style.color = '#f44336';
//                 errorItem.textContent = 'Error loading catalog flags';
//                 dropdownContent.appendChild(errorItem);
//             });
//     }
// }




function buildFlagDropdownFromCache(dropdownContent) {
    // Clear everything after the "No Filter" option
    const noFilterItem = dropdownContent.querySelector('.flag-item');
    if (noFilterItem) {
        while (noFilterItem.nextSibling) {
            dropdownContent.removeChild(noFilterItem.nextSibling);
        }
    }
    
    if (!window.catalogDataWithFlags || window.catalogDataWithFlags.length === 0) {
        const noDataItem = document.createElement('div');
        noDataItem.style.padding = '10px';
        noDataItem.style.color = '#aaa';
        noDataItem.textContent = 'No catalog data available';
        dropdownContent.appendChild(noDataItem);
        return;
    }
    
    console.log("Inspecting catalog data:");
    console.log("Total catalog objects:", window.catalogDataWithFlags.length);
    
    // Get first object to check column types
    const firstObj = window.catalogDataWithFlags[0];
    if (!firstObj) {
        const noDataItem = document.createElement('div');
        noDataItem.style.padding = '10px';
        noDataItem.style.color = '#aaa';
        noDataItem.textContent = 'No catalog objects available';
        dropdownContent.appendChild(noDataItem);
        return;
    }
    
    const availableProperties = Object.keys(firstObj);
    console.log('Available properties in catalog data:', availableProperties);
    
    // FIXED: Check for environment column and collect unique env values
    let hasEnvColumn = false;
    const envValues = new Set();
    
    if (availableProperties.includes('env')) {
        hasEnvColumn = true;
        console.log('Found env column, checking ALL objects for environment values...');
        
        // FIXED: Check ALL objects to find all environment values
        const totalObjects = window.catalogDataWithFlags.length;
        console.log(`Sampling all ${totalObjects} objects for environment values...`);
        
        for (let i = 0; i < totalObjects; i++) {
            const obj = window.catalogDataWithFlags[i];
            if (obj && obj.env !== null && obj.env !== undefined) {
                const envVal = parseInt(obj.env);
                if (!isNaN(envVal) && envVal >= 1 && envVal <= 10) {
                    envValues.add(envVal);
                }
            }
        }
        
        console.log('Found environment values:', Array.from(envValues).sort((a, b) => a - b));
        console.log(`Total unique environment types: ${envValues.size}`);
    }
    
    // Collect boolean columns
    const actualBooleanColumns = new Set();
    const sampleSize = Math.min(50, window.catalogDataWithFlags.length);
    
    for (const [key, value] of Object.entries(firstObj)) {
        // Skip coordinate and display columns
        if (['ra', 'dec', 'x', 'y', 'radius_pixels', 'env'].includes(key)) {
            continue;
        }
        
        let isActuallyBoolean = false;
        let allValuesAreBooleanType = true;
        let hasOnlyZeroOne = true;
        let uniqueValues = new Set();
        
        // Sample multiple objects to determine if column is truly boolean
        for (let i = 0; i < sampleSize; i++) {
            const obj = window.catalogDataWithFlags[i];
            if (!obj || !(key in obj)) continue;
            
            const val = obj[key];
            uniqueValues.add(val);
            
            if (typeof val !== 'boolean') {
                allValuesAreBooleanType = false;
            }
            
            if (!(val === 0 || val === 1 || val === true || val === false)) {
                hasOnlyZeroOne = false;
            }
        }
        
        // A column is boolean if it meets our criteria
        if (allValuesAreBooleanType || 
            (hasOnlyZeroOne && uniqueValues.size <= 3 && 
             (uniqueValues.has(0) || uniqueValues.has(1) || uniqueValues.has(true) || uniqueValues.has(false)))) {
            
            // Additional filtering to avoid measurement columns
            const keyLower = key.toLowerCase();
            const isMeasurementColumn = keyLower.includes('err') || keyLower.includes('snr') || 
                                       keyLower.includes('chi') || keyLower.includes('mass') ||
                                       keyLower.includes('dust') || keyLower.includes('best.');
            
            if (!isMeasurementColumn) {
                actualBooleanColumns.add(key);
            }
        }
    }
    
    console.log("Boolean columns found:", Array.from(actualBooleanColumns));
    
    // ENVIRONMENT FILTERS SECTION
    // if (hasEnvColumn && envValues.size > 0) {
    //     // Add environment section header
    //     const envHeader = document.createElement('div');
    //     envHeader.style.padding = '8px 10px';
    //     envHeader.style.fontWeight = 'bold';
    //     envHeader.style.backgroundColor = '#2a2a2a';
    //     envHeader.style.borderBottom = '1px solid #555';
    //     envHeader.style.color = '#4CAF50';
    //     envHeader.style.fontSize = '13px';
    //     envHeader.textContent = `Environment Filters (${envValues.size} types)`;
    //     dropdownContent.appendChild(envHeader);
        
    //     // Sort environment values numerically
    //     const sortedEnvValues = Array.from(envValues).sort((a, b) => a - b);
        
    //     // Add each environment value using ENV_DESCRIPTIONS
    //     sortedEnvValues.forEach(envValue => {
    //         // Get description from ENV_DESCRIPTIONS or use default
    //         const description = ENV_DESCRIPTIONS[envValue] || `Environment ${envValue}`;
            
    //         const envItem = document.createElement('div');
    //         envItem.className = 'flag-item env-item';
    //         envItem.dataset.envValue = envValue;
    //         envItem.style.padding = '10px 15px'; // Indent environment items
    //         envItem.style.cursor = 'pointer';
    //         envItem.style.borderBottom = '1px solid #3a3a3a';
    //         envItem.style.color = 'white';
    //         envItem.style.fontSize = '13px';
            
    //         // Create the display text with value and description
    //         envItem.innerHTML = `
    //             <span style="color: #66bb6a; font-weight: bold;">Env ${envValue}:</span> 
    //             <span style="color: #fff;">${description}</span>
    //         `;
            
    //         // Highlight if currently selected
    //         if (flagFilterEnabled && currentFlagColumn === 'env' && currentEnvValue == envValue) {
    //             envItem.style.backgroundColor = 'white';
    //             envItem.style.color = 'black';
    //             envItem.innerHTML = `
    //                 <span style="color: #2e7d32; font-weight: bold;">Env ${envValue}:</span> 
    //                 <span style="color: #000;">${description}</span>
    //             `;
    //         }
            
    //         envItem.addEventListener('mouseover', function() {
    //             if (!(flagFilterEnabled && currentFlagColumn === 'env' && currentEnvValue == envValue)) {
    //                 this.style.backgroundColor = '#444';
    //             }
    //         });
            
    //         envItem.addEventListener('mouseout', function() {
    //             if (flagFilterEnabled && currentFlagColumn === 'env' && currentEnvValue == envValue) {
    //                 this.style.backgroundColor = 'white';
    //                 this.innerHTML = `
    //                     <span style="color: #2e7d32; font-weight: bold;">Env ${envValue}:</span> 
    //                     <span style="color: #000;">${description}</span>
    //                 `;
    //             } else {
    //                 this.style.backgroundColor = 'transparent';
    //                 this.innerHTML = `
    //                     <span style="color: #66bb6a; font-weight: bold;">Env ${envValue}:</span> 
    //                     <span style="color: #fff;">${description}</span>
    //                 `;
    //             }
    //         });
            
    //         envItem.addEventListener('click', function() {
    //             const selectedEnvValue = parseInt(this.dataset.envValue);
    //             console.log(`Environment filter clicked: Env ${selectedEnvValue} (${description})`);
                
    //             // Set filter state
    //             flagFilterEnabled = true;
    //             currentFlagColumn = 'env';
    //             currentEnvValue = selectedEnvValue;
                
    //             // Set global filter state
    //             window.flagFilterEnabled = true;
    //             window.currentFlagColumn = 'env';
    //             window.currentEnvValue = selectedEnvValue;
                
    //             // FIXED: Call the correct function name
    //             applyEnvironmentFilter(selectedEnvValue);
                
    //             // Update UI
    //             updateFlagFilterUI(dropdownContent);
                
    //             // Close dropdown
    //             dropdownContent.style.display = 'none';
    //         });
            
    //         dropdownContent.appendChild(envItem);
    //     });
        
    //     // Add section divider if we have boolean columns too
    //     if (actualBooleanColumns.size > 0) {
    //         const divider = document.createElement('div');
    //         divider.style.height = '1px';
    //         divider.style.backgroundColor = '#555';
    //         divider.style.margin = '5px 0';
    //         dropdownContent.appendChild(divider);
    //     }
    // }
    
    // BOOLEAN FLAGS SECTION
    if (actualBooleanColumns.size > 0) {
        const booleanHeader = document.createElement('div');
        booleanHeader.style.padding = '8px 10px';
        booleanHeader.style.fontWeight = 'bold';
        booleanHeader.style.backgroundColor = '#2a2a2a';
        booleanHeader.style.borderBottom = '1px solid #555';
        booleanHeader.style.color = '#2196F3';
        booleanHeader.style.fontSize = '13px';
        booleanHeader.textContent = `Boolean Flags (${actualBooleanColumns.size})`;
        dropdownContent.appendChild(booleanHeader);
        
        // Convert to array and sort
        const sortedBooleanColumns = Array.from(actualBooleanColumns).sort();
        
        // Add each boolean column to the dropdown
        sortedBooleanColumns.forEach(column => {
            const flagItem = document.createElement('div');
            flagItem.className = 'flag-item boolean-flag-item';
            flagItem.dataset.flagProperty = column;
            flagItem.style.padding = '10px 15px';
            flagItem.style.cursor = 'pointer';
            flagItem.style.borderBottom = '1px solid #3a3a3a';
            flagItem.style.color = 'white';
            flagItem.style.fontSize = '13px';
            
            // Format property name for display
            const displayName = column.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            flagItem.textContent = displayName;
            
            // Highlight if currently selected
            if (flagFilterEnabled && currentFlagColumn === column && currentEnvValue === null) {
                flagItem.style.backgroundColor = 'white';
                flagItem.style.color = 'black';
            }
            
            flagItem.addEventListener('mouseover', function() {
                if (!(flagFilterEnabled && currentFlagColumn === column && currentEnvValue === null)) {
                    this.style.backgroundColor = '#444';
                }
            });
            
            flagItem.addEventListener('mouseout', function() {
                if (flagFilterEnabled && currentFlagColumn === column && currentEnvValue === null) {
                    this.style.backgroundColor = 'white';
                    this.style.color = 'black';
                } else {
                    this.style.backgroundColor = 'transparent';
                    this.style.color = 'white';
                }
            });
            
            flagItem.addEventListener('click', function() {
                const propertyName = this.dataset.flagProperty;
                console.log(`Boolean flag filter clicked: ${propertyName}`);
                
                // Set filter state
                flagFilterEnabled = true;
                currentFlagColumn = propertyName;
                currentEnvValue = null; // Not an environment filter
                
                // Set global filter state
                window.flagFilterEnabled = true;
                window.currentFlagColumn = propertyName;
                window.currentEnvValue = null;
                
                // Apply the boolean filter
                applyLocalFilter(propertyName);
                
                // Update UI
                updateFlagFilterUI(dropdownContent);
                
                // Close dropdown
                dropdownContent.style.display = 'none';
            });
            
            dropdownContent.appendChild(flagItem);
        });
    }
    
    // Show message if no filters available
    if (!hasEnvColumn && actualBooleanColumns.size === 0) {
        const noFlagsItem = document.createElement('div');
        noFlagsItem.style.padding = '10px';
        noFlagsItem.style.color = '#aaa';
        noFlagsItem.textContent = 'No environment values or boolean flags found';
        dropdownContent.appendChild(noFlagsItem);
    }
}

// Add event listener to initialize flag filter button when catalog is loaded
// document.addEventListener("DOMContentLoaded", function() {
//     // Create the flag filter button
//     createFlagFilterButton();
    
// Update the original loadCatalog function to preload flag data
// const originalLoadCatalog = window.loadCatalog;
// if (originalLoadCatalog) {
//     window.loadCatalog = function(catalogName) {
//         // Call the original function to load basic catalog data
//         const result = originalLoadCatalog(catalogName);
        
//         // Clear any previously cached flag data
//         window.catalogDataWithFlags = null;
        
//         // After loading the basic catalog, preload the flag data
//         if (window.catalogDataForOverlay && window.catalogDataForOverlay.length > 0) {
//             console.log('Preloading catalog flag data...');
            
//             // Load the flag data in the background
//             fetch(`/catalog-with-flags/${catalogName}`)
//                 .then(response => response.json())
//                 .then(data => {
//                     window.catalogDataWithFlags = data;
//                     console.log('Flag data preloaded successfully');
//                 })
//                 .catch(error => {
//                     console.error('Error preloading flag data:', error);
//                 });
//         }
        
//         return result;
//     };
// }
// });


function addCatalogOverlay(catalogData, styles) {
    // Ensure catalog data is available
    console.log("addCatalogOverlay called");
    if (!catalogData || catalogData.length === 0) {
        console.warn('No catalog data available to display.');
        return;
    }

    console.log('[addCatalogOverlay] Function started');
    const activeViewer = window.viewer || window.tiledViewer;
    if (!activeViewer) {
        console.error("No active viewer found for catalog overlay.");
        return;
    }

    // Use the new wcsInfo object from main.js
    const wcs = window.wcsInfo;
    console.log("[addCatalogOverlay] WCS info:", wcs);
    if (!wcs || !wcs.hasWCS) {
        console.warn("[addCatalogOverlay] WCS info not available, cannot display catalog overlay.");
        return;
    }

    const imageWidth = wcs.naxis1;
    const imageHeight = wcs.naxis2;
    console.log(`[addCatalogOverlay] Image dimensions: ${imageWidth}x${imageHeight}`);

    // Clear existing overlays managed by this function
    clearCatalogOverlay(); 
    console.log('[addCatalogOverlay] Cleared existing overlays');


    catalogData.forEach((obj, index) => {
        const ra = obj.ra;
        const dec = obj.dec;

        if (ra === undefined || dec === undefined) {
            console.warn(`[addCatalogOverlay] Skipping object at index ${index} due to missing coordinates`);
            return;
        }

        // // Use the new worldToPixels function
        // const pixelCoords = wcs.worldToPixels(ra, dec);
        // console.log('hello??!?!,pixelCoords:::::',pixelCoords);
        // console.log(`[addCatalogOverlay] Object ${index}: RA=${ra}, Dec=${dec} -> Pixel X=${pixelCoords?.x}, Y=${pixelCoords?.y}`);

        // if (pixelCoords) {
        //     const pixelX = pixelCoords.x;
        //     const pixelY = pixelCoords.y;

        //     // OpenSeadragon's imageToViewportCoordinates handles the coordinate system correctly.
        //     if (pixelX >= 0 && pixelX < imageWidth && pixelY >= 0 && pixelY < imageHeight) {
        //         console.log(`[addCatalogOverlay] Object ${index} is within image bounds. Creating dot.`);
        //         const dotElement = createCatalogDotWithStyles(obj, index, styles);

        //         // Use pixelY directly, OpenSeadragon will handle the correct placement.
        //         const viewportPoint = activeViewer.viewport.imageToViewportCoordinates(pixelX, pixelY);
        //         console.log(`[addCatalogOverlay] Viewport point for object ${index}:`, viewportPoint);

        //         activeViewer.addOverlay({
        //             element: dotElement,
        //             location: viewportPoint,
        //             placement: 'CENTER'
        //         });
        //         console.log(`[addCatalogOverlay] Added overlay for object ${index}`);
        //     } else {
        //         console.warn(`[addCatalogOverlay] Object ${index} is outside image bounds.`);
        //     }
        // } else {
        //     console.warn(`[addCatalogOverlay] Could not convert world to pixel coordinates for object ${index}`);
        // }
    });
    console.log('[addCatalogOverlay] Function finished');
}

/**
 * Removes all catalog overlays from the viewer.
 */
function clearCatalogOverlay() {
    const activeViewer = window.viewer || window.tiledViewer;
    if (activeViewer) {
        activeViewer.removeAllOverlays();
    }
}

// Region Style Customizer
// This code adds a popup to customize region styles when loading a catalog

// Store current style settings
let regionStyles = {
    borderColor: '#ff0000', // Default red border
    backgroundColor: 'transparent', // Default transparent background
    borderWidth: 1, // Default 1px border width
    opacity: 0.7, // Default opacity
    shape: 'circle', // Default shape
    colorCodeColumn: null,
    colorMapName: 'viridis'
};

const REGION_COLOR_MAPS = [
    {
        value: 'viridis',
        text: 'Viridis',
        colors: ['#440154', '#3b528b', '#21918c', '#5dc863', '#fde725'],
        gradient: 'linear-gradient(90deg, #440154, #3b528b, #21918c, #5dc863, #fde725)'
    },
    {
        value: 'plasma',
        text: 'Plasma',
        colors: ['#0d0887', '#7e03a8', '#cc4778', '#fca636', '#f0f921'],
        gradient: 'linear-gradient(90deg, #0d0887, #7e03a8, #cc4778, #fca636, #f0f921)'
    },
    {
        value: 'magma',
        text: 'Magma',
        colors: ['#000004', '#3b0f70', '#8c2981', '#de4968', '#fe9f6d', '#fcfdbf'],
        gradient: 'linear-gradient(90deg, #000004, #3b0f70, #8c2981, #de4968, #fe9f6d, #fcfdbf)'
    },
    {
        value: 'cividis',
        text: 'Cividis',
        colors: ['#00204c', '#29397d', '#5c4f99', '#8b659c', '#ba7a8a', '#e79362', '#f7c966'],
        gradient: 'linear-gradient(90deg, #00204c, #29397d, #5c4f99, #8b659c, #ba7a8a, #e79362, #f7c966)'
    },
    {
        value: 'categorical',
        text: 'Categorical',
        colors: ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#a65628', '#f781bf', '#999999'],
        gradient: 'linear-gradient(90deg, #e41a1c, #377eb8, #4daf4a, #984ea3, #ff7f00, #a65628, #f781bf, #999999)'
    }
];

function getColorMapDefinition(name) {
    return REGION_COLOR_MAPS.find((m) => m.value === name) || REGION_COLOR_MAPS[0];
}

function hexToRgb(hex) {
    if (typeof hex !== 'string') return { r: 255, g: 255, b: 255 };
    const normalized = hex.replace('#', '');
    const bigint = parseInt(normalized.length === 3 ? normalized.split('').map(ch => ch + ch).join('') : normalized, 16);
    return {
        r: (bigint >> 16) & 255,
        g: (bigint >> 8) & 255,
        b: bigint & 255
    };
}

function rgbToHex(r, g, b) {
    const toHex = (value) => {
        const clamped = Math.max(0, Math.min(255, value));
        return clamped.toString(16).padStart(2, '0');
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function interpolatePaletteColor(palette, t) {
    if (!Array.isArray(palette) || palette.length === 0) return '#ffffff';
    if (palette.length === 1) return palette[0];
    const clamped = Math.max(0, Math.min(1, t));
    const scaled = clamped * (palette.length - 1);
    const idxLow = Math.floor(scaled);
    const idxHigh = Math.min(palette.length - 1, Math.ceil(scaled));
    const frac = scaled - idxLow;
    if (idxLow === idxHigh) return palette[idxLow];
    const c1 = hexToRgb(palette[idxLow]);
    const c2 = hexToRgb(palette[idxHigh]);
    const r = Math.round(c1.r + (c2.r - c1.r) * frac);
    const g = Math.round(c1.g + (c2.g - c1.g) * frac);
    const b = Math.round(c1.b + (c2.b - c1.b) * frac);
    return rgbToHex(r, g, b);
}

function hexToRgba(hex, alpha = 0.4) {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

function findValueCaseInsensitive(target, column) {
    if (!target || !column) return undefined;
    if (Object.prototype.hasOwnProperty.call(target, column)) return target[column];
    const trimmed = column.trim ? column.trim() : column;
    if (trimmed && Object.prototype.hasOwnProperty.call(target, trimmed)) return target[trimmed];
    const lower = typeof trimmed === 'string' ? trimmed.toLowerCase() : trimmed;
    for (const key in target) {
        if (!Object.prototype.hasOwnProperty.call(target, key)) continue;
        if (typeof key !== 'string') continue;
        const normalizedKey = key.trim().toLowerCase();
        if (normalizedKey === lower) {
            return target[key];
        }
    }
    return undefined;
}

function getRecordValue(record, column) {
    if (!record || !column) return undefined;
    const direct = findValueCaseInsensitive(record, column);
    if (direct !== undefined) return direct;
    const nestedSources = [
        record.__catalog_columns,
        record.metadata,
        record.meta
    ];
    for (const source of nestedSources) {
        const val = findValueCaseInsensitive(source, column);
        if (val !== undefined) return val;
    }
    return undefined;
}

function coerceScalarValue(raw) {
    // Some catalogs embed column values as objects like {value: 1.23} or {v: 1.23}.
    // Color-coding needs a primitive (number/string) to compute min/max or categories.
    try {
        if (raw === undefined || raw === null) return raw;
        if (typeof raw === 'number' || typeof raw === 'string' || typeof raw === 'boolean') return raw;
        if (Array.isArray(raw)) {
            if (raw.length === 0) return undefined;
            if (raw.length === 1) return coerceScalarValue(raw[0]);
            return raw;
        }
        if (typeof raw === 'object') {
            const keys = ['value', 'val', 'v', 'num', 'n', 'scalar', 'raw', 'x', 'y'];
            for (const k of keys) {
                if (Object.prototype.hasOwnProperty.call(raw, k)) {
                    const inner = coerceScalarValue(raw[k]);
                    if (inner !== undefined && inner !== null && inner !== '') return inner;
                }
            }
            if (Object.prototype.hasOwnProperty.call(raw, 'data')) {
                const inner = coerceScalarValue(raw.data);
                if (inner !== undefined && inner !== null && inner !== '') return inner;
            }
        }
        return raw;
    } catch (_) {
        return raw;
    }
}

async function __attachColumnValuesToRawRecords(catalogApiName, records, columns) {
    const cols = Array.isArray(columns) ? columns.map(String).filter(Boolean) : [String(columns || '')].filter(Boolean);
    if (!catalogApiName || !Array.isArray(records) || !records.length || !cols.length) return;

    // Only fetch columns that are missing from the raw record payload.
    const missingCols = cols.filter((c) => {
        try { return (getRecordValue(records[0], c) === undefined); } catch (_) { return true; }
    });
    if (!missingCols.length) return;

    const rowIdxs = [];
    const posByRow = new Map(); // row_index -> list of record positions
    for (let i = 0; i < records.length; i += 1) {
        const r = records[i];
        if (!r) continue;
        let ri = r.__row_index;
        if (!Number.isInteger(ri)) ri = i;
        rowIdxs.push(ri);
        if (!posByRow.has(ri)) posByRow.set(ri, []);
        posByRow.get(ri).push(i);
    }
    if (!rowIdxs.length) return;

    const CHUNK = 20000;
    const received = new Set();
    for (let start = 0; start < rowIdxs.length; start += CHUNK) {
        const chunkIdxs = rowIdxs.slice(start, start + CHUNK);
        const resp = await apiFetch('/catalog-column-values/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ catalog_name: catalogApiName, row_indices: chunkIdxs, columns: missingCols })
        });
        const data = await resp.json();
        if (!resp.ok) {
            throw new Error((data && (data.detail || data.error)) ? (data.detail || data.error) : `Failed to fetch column values (HTTP ${resp.status})`);
        }

        const outIdxs = Array.isArray(data.row_indices) ? data.row_indices : [];
        const outCols = Array.isArray(data.columns) ? data.columns : [];
        const values = (data && data.values && typeof data.values === 'object') ? data.values : {};
        for (const c of outCols) received.add(String(c));

        const offsetByRow = new Map();
        for (let i = 0; i < outIdxs.length; i++) offsetByRow.set(outIdxs[i], i);

        const valuesKeyByLower = new Map();
        try { for (const k of Object.keys(values)) valuesKeyByLower.set(String(k).toLowerCase(), k); } catch (_) {}

        for (const col of missingCols) {
            let valKey = null;
            if (Array.isArray(values[col])) {
                valKey = col;
            } else {
                const k2 = valuesKeyByLower.get(String(col).toLowerCase());
                if (k2 && Array.isArray(values[k2])) valKey = k2;
            }
            const colArr = valKey ? values[valKey] : null;
            if (!Array.isArray(colArr)) continue;

            for (const ri of outIdxs) {
                const off = offsetByRow.get(ri);
                if (off == null) continue;
                const v = colArr[off];
                const positions = posByRow.get(ri);
                if (!positions) continue;
                for (const p of positions) {
                    try { records[p][col] = v; } catch (_) {}
                    try {
                        if (!records[p].__catalog_columns || typeof records[p].__catalog_columns !== 'object') records[p].__catalog_columns = {};
                        records[p].__catalog_columns[col] = v;
                    } catch (_) {}
                }
            }
        }
    }

    for (const col of missingCols) {
        const ok = received.has(String(col)) || Array.from(received).some(c => c.toLowerCase() === String(col).toLowerCase());
        if (!ok) throw new Error(`Column not found in catalog: ${col}`);
    }
}

function buildColorCoder(records, column, colorMapName) {
    if (!Array.isArray(records) || !column) return null;
    const mapDef = getColorMapDefinition(colorMapName);
    if (!mapDef || !Array.isArray(mapDef.colors) || mapDef.colors.length === 0) return null;
    try {
        console.log('[ColorCoder] building palette', {
            column,
            map: mapDef.value,
            recordCount: records.length
        });
        if (records.length > 0) {
            const keys = Object.keys(records[0] || {});
            console.log('[ColorCoder] example keys', keys.slice(0, 20));
            console.log('[ColorCoder] sample raw value', {
                requestedColumn: column,
                exactMatch: records[0][column],
                resolvedValue: getRecordValue(records[0], column)
            });
        }
    } catch (_) {}
    const numericValues = [];
    const categoryOrder = [];
    const categoryIndex = new Map();
    records.forEach((rec) => {
        if (!rec) return;
        const raw = coerceScalarValue(getRecordValue(rec, column));
        if (raw === undefined || raw === null || raw === '') return;
        const num = Number(raw);
        if (typeof raw === 'number' || (isFinite(num) && raw !== '')) {
            numericValues.push(num);
        } else {
            const key = String(raw);
            if (!categoryIndex.has(key)) {
                categoryIndex.set(key, categoryOrder.length);
                categoryOrder.push(key);
            }
        }
    });
    try {
        console.log('[ColorCoder] stats', {
            numericCount: numericValues.length,
            categoryCount: categoryOrder.length
        });
    } catch (_) {}
    if (numericValues.length >= 2) {
        const minVal = Math.min(...numericValues);
        const maxVal = Math.max(...numericValues);
        if (maxVal === minVal) {
            const staticColor = interpolatePaletteColor(mapDef.colors, 0.5);
            return () => staticColor;
        }
        return (rawValue) => {
            const num = Number(rawValue);
            if (!isFinite(num)) return interpolatePaletteColor(mapDef.colors, 0);
            const t = (num - minVal) / (maxVal - minVal);
            return interpolatePaletteColor(mapDef.colors, Math.max(0, Math.min(1, t)));
        };
    }
    if (numericValues.length === 1) {
        const staticColor = interpolatePaletteColor(mapDef.colors, 0.5);
        return () => staticColor;
    }
    if (categoryOrder.length > 0) {
        const total = categoryOrder.length;
        return (rawValue) => {
            if (rawValue === undefined || rawValue === null) return interpolatePaletteColor(mapDef.colors, 0);
            const key = String(rawValue);
            const idx = categoryIndex.has(key) ? categoryIndex.get(key) : 0;
            const t = total <= 1 ? 0.5 : idx / (total - 1);
            return interpolatePaletteColor(mapDef.colors, t);
        };
    }
    return null;
}

function resolveCatalogStyle(catalogName, explicitStyles) {
    if (explicitStyles && typeof explicitStyles === 'object') {
        return explicitStyles;
    }

    const catalogEntries = Array.isArray(window.catalogData) ? window.catalogData : [];
    const normalized = typeof catalogName === 'string' && catalogName.startsWith('catalogs/')
        ? catalogName
        : `catalogs/${catalogName}`;
    const basename = typeof catalogName === 'string'
        ? catalogName.split('/').pop()
        : catalogName;

    // Multi-panel: styles are often created in one pane and need to be reused in another pane.
    // Keep styles in a per-catalog store and also look up via window.top.
    const tryGetStyleFromStore = (store, key) => {
        try {
            if (!store || typeof store !== 'object') return null;
            const s = store[key];
            return (s && typeof s === 'object') ? s : null;
        } catch (_) {
            return null;
        }
    };
    const lookupKeys = (() => {
        const keys = [];
        if (catalogName) keys.push(String(catalogName));
        if (normalized) keys.push(String(normalized));
        if (basename) keys.push(String(basename));
        if (basename) keys.push(`catalogs/${basename}`);
        return keys;
    })();
    // First: local style store
    try {
        const localStore = window.__catalogStylesByName;
        for (const k of lookupKeys) {
            const s = tryGetStyleFromStore(localStore, k);
            if (s) return s;
        }
    } catch (_) {}
    // Second: top style store (other pane may have saved it)
    try {
        const topWin = (window.top && window.top !== window) ? window.top : null;
        const topStore = topWin ? topWin.__catalogStylesByName : null;
        for (const k of lookupKeys) {
            const s = tryGetStyleFromStore(topStore, k);
            if (s) return s;
        }
    } catch (_) {}

    const entry = catalogEntries.find((c) => {
        if (!c) return false;
        if (c.name === catalogName || c.name === normalized) return true;
        if (basename && typeof c.name === 'string' && c.name.split('/').pop() === basename) return true;
        if (basename && typeof c.apiName === 'string' && c.apiName === basename) return true;
        return false;
    });

    if (entry && entry.style) {
        return entry.style;
    }

    if (window.regionStyles) return window.regionStyles;
    try {
        const topWin = (window.top && window.top !== window) ? window.top : null;
        if (topWin && topWin.regionStyles) return topWin.regionStyles;
    } catch (_) {}

    return null;
}



// Updated applyStylesToRegions function
function applyStylesToRegions(catalogName, styles) {
    console.log('=== applyStylesToRegions START ===');
    console.log('Catalog name:', catalogName);
    console.log('Styles to apply:', styles);
    console.log('Current window.catalogData:', window.catalogData);
    
    // Initialize window.catalogData if it doesn't exist
    if (!window.catalogData || !Array.isArray(window.catalogData)) {
        console.log('Initializing window.catalogData as empty array');
        window.catalogData = [];
    }

    // Validate inputs
    if (!catalogName || typeof catalogName !== 'string') {
        console.error('Invalid catalog name provided:', catalogName);
        return false;
    }

    if (!styles || typeof styles !== 'object') {
        console.error('Invalid styles provided:', styles);
        return false;
    }

    // Handle folder paths - normalize the catalog name
    let normalizedCatalogName = catalogName;
    let catalogNameForEndpoint = catalogName;
    
    // If catalog name includes 'catalogs/' prefix, remove it for API calls
    if (catalogName.startsWith('catalogs/')) {
        catalogNameForEndpoint = catalogName.replace('catalogs/', '');
        console.log('Removed catalogs/ prefix for API calls:', catalogNameForEndpoint);
    } else if (!catalogName.includes('/')) {
        // If no folder path, add catalogs/ prefix for internal tracking
        normalizedCatalogName = `catalogs/${catalogName}`;
        catalogNameForEndpoint = catalogName;
        console.log('Added catalogs/ prefix for internal tracking:', normalizedCatalogName);
    }

    // Extract just the filename for comparison
    const searchFilename = catalogName.split('/').pop();
    console.log('Searching for catalog with filename:', searchFilename);
    console.log('Normalized catalog name:', normalizedCatalogName);
    console.log('Catalog name for endpoint:', catalogNameForEndpoint);

    // Multiple search strategies to find the catalog
    let catalogIndex = -1;
    
    // Strategy 1: Exact match with the provided name
    catalogIndex = window.catalogData.findIndex(c => {
        return c && c.name === catalogName;
    });
    
    if (catalogIndex !== -1) {
        console.log('Found catalog with exact name match at index:', catalogIndex);
    }

    // Strategy 2: Exact match with normalized name (with catalogs/ prefix)
    if (catalogIndex === -1) {
        catalogIndex = window.catalogData.findIndex(c => {
            return c && c.name === normalizedCatalogName;
        });
        
        if (catalogIndex !== -1) {
            console.log('Found catalog with normalized name match at index:', catalogIndex);
        }
    }

    // Strategy 3: Filename match (compare just the filenames)
    if (catalogIndex === -1) {
        catalogIndex = window.catalogData.findIndex(c => {
            if (!c || !c.name) return false;
            const dataFilename = c.name.split('/').pop();
            return dataFilename === searchFilename;
        });
        
        if (catalogIndex !== -1) {
            console.log('Found catalog with filename match at index:', catalogIndex);
        }
    }

    // Strategy 4: Partial match (in case of path differences)
    if (catalogIndex === -1) {
        catalogIndex = window.catalogData.findIndex(c => {
            if (!c || !c.name) return false;
            return c.name.includes(searchFilename) || 
                   searchFilename.includes(c.name.split('/').pop()) ||
                   c.name.endsWith(searchFilename);
        });
        
        if (catalogIndex !== -1) {
            console.log('Found catalog with partial match at index:', catalogIndex);
        }
    }

    // If still not found, create a new entry using the normalized name
    if (catalogIndex === -1) {
        console.log('Catalog not found in window.catalogData, creating new entry');
        const newCatalogEntry = {
            name: normalizedCatalogName, // Use the normalized name with catalogs/ prefix
            apiName: catalogNameForEndpoint, // Store the name to use for API calls
            style: {
                // Default values
                borderColor: '#FF0000',
                backgroundColor: 'transparent',
                borderWidth: 2,
                opacity: 0.8,
                raColumn: 'ra',
                decColumn: 'dec',
                radius: 5
            }
        };
        window.catalogData.push(newCatalogEntry);
        catalogIndex = window.catalogData.length - 1;
        console.log('Created new catalog entry at index:', catalogIndex, 'with name:', normalizedCatalogName);
    } else {
        console.log('Found existing catalog at index:', catalogIndex, 'with name:', window.catalogData[catalogIndex].name);
        // Ensure existing entries have apiName
        if (!window.catalogData[catalogIndex].apiName) {
            window.catalogData[catalogIndex].apiName = catalogNameForEndpoint;
        }
    }

    // Ensure the catalog entry has a style object
    if (!window.catalogData[catalogIndex].style) {
        window.catalogData[catalogIndex].style = {};
    }

    // Update the style object for the catalog
    const previousStyles = { ...window.catalogData[catalogIndex].style };
    const nextStyle = {
        ...window.catalogData[catalogIndex].style, // Preserve any existing styles
        ...styles
    };
    // Preserve color-coding configuration unless caller explicitly changed it.
    try {
        const hasOwn = (obj, k) => Object.prototype.hasOwnProperty.call(obj || {}, k);
        if (!hasOwn(styles, 'colorCodeColumn')) nextStyle.colorCodeColumn = previousStyles.colorCodeColumn || null;
        if (!hasOwn(styles, 'colorMapName')) nextStyle.colorMapName = previousStyles.colorMapName || null;
    } catch (_) {}
    window.catalogData[catalogIndex].style = nextStyle;
    
    console.log('Previous styles:', previousStyles);
    console.log('New styles applied:', styles);
    console.log(`Final styles for catalog "${window.catalogData[catalogIndex].name}":`, window.catalogData[catalogIndex].style);
    
    // Also update the global regionStyles for immediate use
    const resolvedShape = resolveShapeForStyleUpdate(
        window.catalogData?.[catalogIndex]?.name || catalogName,
        styles && styles.shape
    );
    window.regionStyles = {
        borderColor: styles.borderColor || window.regionStyles?.borderColor || '#FF0000',
        backgroundColor: styles.backgroundColor || window.regionStyles?.backgroundColor || 'transparent',
        borderWidth: styles.borderWidth || window.regionStyles?.borderWidth || 2,
        opacity: styles.opacity || window.regionStyles?.opacity || 0.8,
        shape: resolvedShape,
        // Preserve color-coding config unless explicitly changed.
        colorCodeColumn: (Object.prototype.hasOwnProperty.call(styles || {}, 'colorCodeColumn'))
            ? (styles.colorCodeColumn || null)
            : (window.regionStyles?.colorCodeColumn || null),
        colorMapName: (Object.prototype.hasOwnProperty.call(styles || {}, 'colorMapName'))
            ? (styles.colorMapName || null)
            : (window.regionStyles?.colorMapName || REGION_COLOR_MAPS[0].value)
    };
    
    console.log('Updated global regionStyles:', window.regionStyles);

    // Store both the original and normalized catalog names for reloading
    window.currentCatalogName = window.catalogData[catalogIndex].name; // Use the actual stored name
    window.activeCatalog = window.catalogData[catalogIndex].name;
    try { window.dispatchEvent(new CustomEvent('catalog:changed', { detail: { name: window.activeCatalog } })); } catch (_) {}

        // If we have overlay data, update the styles for immediate visual feedback
        if (window.catalogDataForOverlay && Array.isArray(window.catalogDataForOverlay)) {
        console.log('Updating overlay data with new styles...');
        const overlayColorCoder = styles.colorCodeColumn
            ? buildColorCoder(window.catalogDataForOverlay, styles.colorCodeColumn, styles.colorMapName)
            : null;
        // Apply styles to each object in the overlay
        window.catalogDataForOverlay.forEach((obj) => {
            if (!obj) return;
                // Only update objects belonging to this catalog (multi-catalog support)
                try {
                    const key = _catalogKey(window.catalogData?.[catalogIndex]?.name || catalogName);
                    if (obj.__catalogName && obj.__catalogName !== key) return;
                } catch (_) {}
            let colorApplied = false;
            if (overlayColorCoder) {
                const colorHex = overlayColorCoder(obj[styles.colorCodeColumn]);
                if (colorHex) {
                    const opacityVal = styles.opacity || obj.opacity || 0.8;
                    obj.color = colorHex;
                    // Keep fill alpha independent of opacity so the opacity slider behaves linearly.
                    // Renderer will apply `obj.opacity` as the overall alpha multiplier.
                    obj.fillColor = hexToRgba(colorHex, 0.3);
                    obj.opacity = opacityVal;
                    obj.useTransparentFill = false;
                    colorApplied = true;
                }
            }
            if (!colorApplied) {
                obj.color = styles.borderColor || '#FF0000';
                obj.fillColor = styles.backgroundColor === 'transparent' ? 'rgba(255, 0, 0, 0.3)' : styles.backgroundColor;
                obj.opacity = styles.opacity || 0.8;
                obj.useTransparentFill = styles.backgroundColor === 'transparent';
            }
            obj.border_width = styles.borderWidth || 2;
            // Persist shape per-source so canvas overlay can render hexagon/circle.
            // If caller didn't send a shape, keep existing per-object shape; otherwise apply resolved.
            obj.shape = (styles && styles.shape) ? resolvedShape : (obj.shape || resolvedShape);
            if (styles.radius && typeof styles.radius === 'number') {
                obj.radius_pixels = styles.radius;
            }
        });
            try { rebuildCombinedCatalogOverlay(); } catch (_) {}
        
        console.log('Updated overlay data with new styles');
        
        // Force immediate redraw if canvas overlay is active
        if (typeof canvasUpdateOverlay === 'function' && window.catalogCanvas) {
            console.log('Triggering canvas overlay update...');
            canvasUpdateOverlay();
        } else if (typeof updateOverlay === 'function') {
            console.log('Triggering DOM overlay update...');
            updateOverlay();
        }
    }

    console.log('=== applyStylesToRegions END ===');
    console.log('Returning catalog info for reload:', {
        catalogName: window.catalogData[catalogIndex].name,
        apiName: window.catalogData[catalogIndex].apiName || catalogNameForEndpoint
    });
    
    // Return the proper catalog names that should be used for reloading
    return {
        success: true,
        catalogName: window.catalogData[catalogIndex].name,
        apiName: window.catalogData[catalogIndex].apiName || catalogNameForEndpoint
    };
}

// Quick style presets for one-click catalog styling (used by toolbar controls)
// These drive both toolbar buttons and the color swatches in the overlay controls.
// Use simple, common color names so the choices are obvious.
const CATALOG_QUICK_STYLE_OPTIONS = [
    { id: 'red',      label: 'Red',      style: { borderColor: '#EF4444', backgroundColor: 'transparent', borderWidth: 2, opacity: 0.9 } },
    { id: 'orange',   label: 'Orange',   style: { borderColor: '#F97316', backgroundColor: 'transparent', borderWidth: 2, opacity: 0.9 } },
    { id: 'yellow',   label: 'Yellow',   style: { borderColor: '#EAB308', backgroundColor: 'transparent', borderWidth: 2, opacity: 0.9 } },
    { id: 'green',    label: 'Green',    style: { borderColor: '#22C55E', backgroundColor: 'transparent', borderWidth: 2, opacity: 0.9 } },
    { id: 'cyan',     label: 'Cyan',     style: { borderColor: '#22D3EE', backgroundColor: 'transparent', borderWidth: 2, opacity: 0.9 } },
    { id: 'blue',     label: 'Blue',     style: { borderColor: '#3B82F6', backgroundColor: 'transparent', borderWidth: 2, opacity: 0.9 } },
    { id: 'purple',   label: 'Purple',   style: { borderColor: '#8B5CF6', backgroundColor: 'transparent', borderWidth: 2, opacity: 0.9 } },
    { id: 'pink',     label: 'Pink',     style: { borderColor: '#EC4899', backgroundColor: 'transparent', borderWidth: 2, opacity: 0.9 } },
    { id: 'white',    label: 'White',    style: { borderColor: '#FFFFFF', backgroundColor: 'transparent', borderWidth: 2, opacity: 0.9 } },
    { id: 'black',    label: 'Black',    style: { borderColor: '#000000', backgroundColor: 'transparent', borderWidth: 2, opacity: 0.9 } }
];

function getCatalogQuickStyleOptions() {
    return CATALOG_QUICK_STYLE_OPTIONS.slice();
}

function getEffectiveRegionStylesForOverlay() {
    try {
        if (window.regionStyles && typeof window.regionStyles === 'object') return window.regionStyles;
    } catch (_) {}
    try {
        const topRs = window.top && window.top.regionStyles;
        if (topRs && typeof topRs === 'object') return topRs;
    } catch (_) {}
    try {
        // Fallback to this module's default styles object if present
        if (typeof regionStyles === 'object' && regionStyles) return regionStyles;
    } catch (_) {}
    return {};
}

function normalizeShape(value) {
    return (String(value || '').toLowerCase() === 'hexagon') ? 'hexagon' : 'circle';
}

function getCurrentOverlayShapeHint(catalogName = null) {
    try {
        const key = catalogName ? _catalogKey(catalogName) : null;
        const perCat = (key && window.catalogOverlaysByCatalog && window.catalogOverlaysByCatalog[key]) ? window.catalogOverlaysByCatalog[key] : null;
        const arr = Array.isArray(perCat) ? perCat : window.catalogDataForOverlay;
        if (Array.isArray(arr)) {
            for (let i = 0; i < arr.length && i < 80; i++) {
                const sh = arr[i]?.shape;
                if (sh) return normalizeShape(sh);
            }
        }
    } catch (_) {}
    return null;
}

function getCatalogStoredShapeHint(catalogName) {
    try {
        const name = String(catalogName || '').trim();
        if (!name) return null;
        const list = Array.isArray(window.catalogData) ? window.catalogData : [];
        const needle = name.includes('/') ? name.split('/').pop() : name;
        const entry = list.find(c => {
            const n = String(c?.name || '');
            if (!n) return false;
            const base = n.includes('/') ? n.split('/').pop() : n;
            return n === name || base === needle;
        });
        const sh = entry?.style?.shape;
        if (sh) return normalizeShape(sh);
    } catch (_) {}
    return null;
}

function resolveShapeForStyleUpdate(catalogName, explicitShape) {
    // If caller explicitly passed a shape, honor it.
    if (explicitShape !== undefined && explicitShape !== null && String(explicitShape).length) {
        return normalizeShape(explicitShape);
    }
    // Prefer this catalog's current overlay shape (multi-catalog safe).
    const fromOverlay = getCurrentOverlayShapeHint(catalogName);
    if (fromOverlay) return fromOverlay;
    // Then prefer catalog's stored style.
    const fromCatalog = getCatalogStoredShapeHint(catalogName);
    if (fromCatalog) return fromCatalog;
    // Finally fall back to region styles.
    const rs = getEffectiveRegionStylesForOverlay();
    return normalizeShape(rs.shape);
}

function applyCatalogQuickStyle(catalogName, styleId) {
    const name = catalogName || window.currentCatalogName || window.activeCatalog;
    if (!name) {
        console.warn('[catalogs] applyCatalogQuickStyle: no active catalog');
        return;
    }
    const opt = CATALOG_QUICK_STYLE_OPTIONS.find(o => o.id === styleId) || CATALOG_QUICK_STYLE_OPTIONS[0];
    if (!opt) return;
    try {
        const shape = resolveShapeForStyleUpdate(name, opt?.style?.shape);
        const mergedStyle = { ...(opt.style || {}), shape };
        console.log('[catalogs] Applying quick style', opt.id, 'to catalog', name, mergedStyle);
        applyStylesToRegions(name, mergedStyle);
    } catch (err) {
        console.error('[catalogs] applyCatalogQuickStyle failed', err);
    }
}

// Allow external UIs (e.g. main.js overlay controls) to smoothly adjust catalog
// overlay opacity without having to know the full styling object.
function setCatalogOverlayOpacity(opacity) {
    const name = window.currentCatalogName || window.activeCatalog;
    if (!name) {
        console.warn('[catalogs] setCatalogOverlayOpacity: no active catalog');
        return;
    }
    const numeric = Number(opacity);
    if (!Number.isFinite(numeric)) {
        console.warn('[catalogs] setCatalogOverlayOpacity: non‑numeric value', opacity);
        return;
    }
    const clamped = Math.max(0, Math.min(1, numeric));
    // IMPORTANT:
    // The opacity slider must NOT reset color / borderWidth / etc.
    // So we preserve the current effective styles as base and only override opacity.
    const baseStyles = (() => {
        try {
            if (Array.isArray(window.catalogData) && window.catalogData.length) {
                const key = _catalogKey(name);
                const idx = window.catalogData.findIndex(c => c && _catalogKey(c.name) === key);
                if (idx >= 0 && window.catalogData[idx] && window.catalogData[idx].style) return window.catalogData[idx].style;
            }
        } catch (_) {}
        try {
            if (window.regionStyles && typeof window.regionStyles === 'object') return window.regionStyles;
        } catch (_) {}
        try {
            const arr = window.catalogDataForOverlay;
            if (Array.isArray(arr) && arr.length) {
                const key = _catalogKey(name);
                const o = arr.find(x => x && x.__catalogName && _catalogKey(x.__catalogName) === key) || arr[0];
                if (o) {
                    return {
                        borderColor: o.color,
                        backgroundColor: (o.useTransparentFill ? 'transparent' : (o.fillColor || 'transparent')),
                        borderWidth: o.border_width,
                        opacity: o.opacity,
                        colorCodeColumn: o.colorCodeColumn || null,
                        colorMapName: o.colorMapName || null
                    };
                }
            }
        } catch (_) {}
        return getEffectiveRegionStylesForOverlay() || {};
    })();

    // - Do not pass `shape` here (opacity slider should not change shape).
    // - Do not pass any radius/size fields here (opacity slider should not change marker size).
    // - But DO pass current borderColor/borderWidth/background so applyStylesToRegions won't fall back to defaults.
    const merged = {
        borderColor: baseStyles.borderColor,
        backgroundColor: baseStyles.backgroundColor,
        borderWidth: baseStyles.borderWidth,
        // Preserve color-coding config if present (do not clear on opacity-only changes)
        colorCodeColumn: baseStyles.colorCodeColumn,
        colorMapName: baseStyles.colorMapName,
        opacity: clamped
    };
    try {
        delete merged.shape;
        delete merged.radius;
        delete merged.radius_pixels;
        delete merged.radius_arcsec;
        delete merged.arcsec_per_pixel;
        delete merged.sizeColumn;
        delete merged.size_col;
        delete merged.resolution_col;
    } catch (_) {}
    try {
        applyStylesToRegions(name, merged);
    } catch (err) {
        console.error('[catalogs] setCatalogOverlayOpacity failed', err);
    }
}

try {
    window.getCatalogQuickStyleOptions = getCatalogQuickStyleOptions;
    window.applyCatalogQuickStyle = applyCatalogQuickStyle;
    window.setCatalogOverlayOpacity = setCatalogOverlayOpacity;
} catch (_) {}

// Updated populateDropdowns function in showStyleCustomizerPopup
function populateDropdowns(catalogName) {
    const dropdowns = [raDropdown, decDropdown, sizeDropdown];
    dropdowns.forEach(dd => {
        dd.dropdownList.innerHTML = '<div class="dropdown-item">Loading...</div>';
        dd.hiddenSelect.innerHTML = '';
    });

    // Extract just the filename for the API call (remove catalogs/ prefix if present)
    let catalogNameForApi = catalogName;
    if (catalogName.startsWith('catalogs/')) {
        catalogNameForApi = catalogName.replace('catalogs/', '');
    }
    
    console.log('Populating dropdowns for catalog:', catalogName);
    console.log('Using API name:', catalogNameForApi);

    apiFetch(`/catalog-columns/?catalog_name=${encodeURIComponent(catalogNameForApi)}`)
        .then(response => { 
            if (!response.ok) {
                throw new Error(`Failed to load columns: ${response.status} - ${response.statusText}`);
            }
            return response.json(); 
        })
        .then(data => {
            const allColumns = data.columns || [];
            dropdowns.forEach(dd => dd.dropdownList.innerHTML = '');

            const addOption = (dropdown, value, text) => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = text;
                dropdown.hiddenSelect.appendChild(option);

                const item = document.createElement('div');
                item.className = 'dropdown-item';
                item.textContent = text;
                item.dataset.value = value;
                item.addEventListener('click', () => {
                    dropdown.hiddenSelect.value = value;
                    dropdown.searchInput.value = text;
                    dropdown.dropdownList.style.display = 'none';
                    dropdown.hiddenSelect.dispatchEvent(new Event('change'));
                });
                dropdown.dropdownList.appendChild(item);
            };

            addOption(sizeDropdown, '', 'No size column');

            allColumns.forEach(colName => {
                dropdowns.forEach(dd => addOption(dd, colName, colName));
            });
            
            const findDefaultColumn = (columns, keywords) => {
                for (const keyword of keywords) {
                    try {
                        const regex = new RegExp(`^${keyword}$`, 'i');
                        const match = columns.find(c => regex.test(c));
                        if (match) return match;
                    } catch (e) { console.error(`Invalid regex keyword: ${keyword}`, e); }
                }
                for (const keyword of keywords) {
                    const match = columns.find(c => c.toLowerCase().includes(keyword));
                    if (match) return match;
                }
                return null;
            };

            const raKeywords = ['ra', 'right_ascension'];
            const decKeywords = ['dec', 'declination'];
            const sizeKeywords = ['radius', 'size', 'rad', 'fwhm', 'bmaj', 'maj'];

            if (allColumns.length > 0) {
                const defaultRa = findDefaultColumn(allColumns, raKeywords) || allColumns[0];
                raDropdown.searchInput.value = defaultRa;
                raDropdown.hiddenSelect.value = defaultRa;
                
                const defaultDec = findDefaultColumn(allColumns, decKeywords) || (allColumns.length > 1 ? allColumns[1] : allColumns[0]);
                decDropdown.searchInput.value = defaultDec;
                decDropdown.hiddenSelect.value = defaultDec;

                const defaultSize = findDefaultColumn(allColumns, sizeKeywords);
                sizeDropdown.searchInput.value = defaultSize || 'No size column';
                sizeDropdown.hiddenSelect.value = defaultSize || '';
                sizeDropdown.hiddenSelect.dispatchEvent(new Event('change'));
            }
        })
        .catch(error => {
            console.error('Error populating dropdowns:', error);
            dropdowns.forEach(dd => {
                dd.dropdownList.innerHTML = '<div class="dropdown-item">Error loading</div>';
            });
        });
}

// Updated apply button handler
function createUpdatedApplyButtonHandler(catalogName, popup, newStyles) {
    return () => {
        // Apply styles and get the result
        const result = applyStylesToRegions(catalogName, newStyles);
        
        if (result && result.success) {
            console.log('[Apply Styles] Styles applied successfully');
            // Persist the selected RA/DEC/SIZE mapping on the server to avoid relying on per-request overrides
            try {
                const apiName = (result.apiName || result.catalogName || catalogName);
                const payload = {
                    catalog_name: apiName,
                    ra_col: newStyles && newStyles.raColumn ? newStyles.raColumn : null,
                    dec_col: newStyles && newStyles.decColumn ? newStyles.decColumn : null,
                    resolution_col: newStyles && newStyles.sizeColumn ? newStyles.sizeColumn : null,
                };
                console.log('[Apply Styles] Saving server-side column mapping:', payload);
                apiFetch('/save-catalog-mapping/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                }).then(r => r.json()).then(resp => {
                    console.log('[Apply Styles] Mapping save response:', resp);
                }).catch(err => {
                    console.warn('[Apply Styles] Failed to save mapping:', err);
                });
            } catch (e) {
                console.warn('[Apply Styles] Error preparing mapping save:', e);
            }
            // Persist the selected RA/DEC/SIZE column overrides so subsequent loads can use them
            try {
                window.catalogOverridesByCatalog = window.catalogOverridesByCatalog || {};
                const catalogNameForReload = result.apiName || result.catalogName || catalogName;
                window.catalogOverridesByCatalog[catalogNameForReload] = {
                    ra_col: newStyles && newStyles.raColumn ? newStyles.raColumn : null,
                    dec_col: newStyles && newStyles.decColumn ? newStyles.decColumn : null,
                    size_col: newStyles && newStyles.sizeColumn ? newStyles.sizeColumn : null,
                };
                console.log('[Apply Styles] Saved overrides for', catalogNameForReload, window.catalogOverridesByCatalog[catalogNameForReload]);
            } catch (e) {
                console.warn('[Apply Styles] Could not persist overrides:', e);
            }
            
            // Use the apiName for reloading (this is the name without catalogs/ prefix)
            const catalogNameForReload = result.apiName || result.catalogName;
            console.log(`[Apply Styles] Reloading catalog '${catalogNameForReload}' to display new styles.`);
            
            if (typeof loadCatalog === 'function') {
                // Load using the API-compatible name
                loadCatalog(catalogNameForReload, newStyles);
            } else {
                console.error("loadCatalog function not found! Cannot reload catalog after applying styles.");
            }
        } else {
            console.error('[Apply Styles] Failed to apply styles');
            if (typeof showNotification === 'function') {
                showNotification('Failed to apply styles', 3000, 'error');
            }
        }
        
        // Close the popup
        if (popup && popup.parentNode) {
            popup.parentNode.removeChild(popup);
        }
    };
}

// Replace the current loadCatalog function with this fixed version
function loadCatalog(catalogName, styles = null) {
    console.log(`[DEBUG] loadCatalog called with:`, { catalogName, styles });
    console.log(`[DEBUG] Current window functions:`, {
        canvasAddCatalogOverlay: typeof window.canvasAddCatalogOverlay,
        canvasUpdateOverlay: typeof window.canvasUpdateOverlay,
        canvasClearCatalogOverlay: typeof window.canvasClearCatalogOverlay
    });
    console.log(`[loadCatalog] Function started with catalog: ${catalogName}`);
    if (styles) {
        console.log('[loadCatalog] Received styles:', styles);
    }

    if (!catalogName) {
        console.error('[loadCatalog] No catalog name provided, exiting.');
        showNotification('Please select a catalog first', 3000);
        return;
    }

    const effectiveStyles = resolveCatalogStyle(catalogName, styles);
    if (!styles && effectiveStyles) {
        styles = effectiveStyles;
    }
    if (styles) {
        try {
            console.log('[loadCatalog] styles summary', {
                colorCodeColumn: styles.colorCodeColumn,
                colorMapName: styles.colorMapName,
                borderColor: styles.borderColor,
                bg: styles.backgroundColor
            });
        } catch (_) {}
    } else {
        try { console.log('[loadCatalog] No styles available (falling back to defaults)'); } catch (_) {}
    }
    
    // Initialize catalogData if needed
    if (!window.catalogData || !Array.isArray(window.catalogData)) {
        window.catalogData = [];
    }
    
    // Store the current catalog name globally
    window.currentCatalogName = catalogName;
    activeCatalog = catalogName;
    // Cache last-used styles so multi-panel can restore catalog state across panes
    try {
        if (!window.__catalogStylesByName) window.__catalogStylesByName = {};
        if (styles && typeof styles === 'object') {
            const stylesToStore = JSON.parse(JSON.stringify(styles));
            // Also include RA/Dec column overrides if available in catalogOverridesByCatalog
            try {
                const apiName = (catalogName || '').toString().split('/').pop().split('\\').pop();
                const overrides = (window.catalogOverridesByCatalog && (
                    window.catalogOverridesByCatalog[catalogName] ||
                    window.catalogOverridesByCatalog[apiName]
                )) || null;
                if (overrides) {
                    if (overrides.ra_col && !stylesToStore.raColumn) stylesToStore.raColumn = overrides.ra_col;
                    if (overrides.dec_col && !stylesToStore.decColumn) stylesToStore.decColumn = overrides.dec_col;
                    if (overrides.size_col && !stylesToStore.sizeColumn) stylesToStore.sizeColumn = overrides.size_col;
                }
            } catch (_) {}
            window.__catalogStylesByName[catalogName] = stylesToStore;
            // Also mirror into top window so other panes can reuse the same catalog styles
            try {
                const topWin = (window.top && window.top !== window) ? window.top : null;
                if (topWin) {
                    if (!topWin.__catalogStylesByName) topWin.__catalogStylesByName = {};
                    const apiKey = (catalogName || '').toString().split('/').pop().split('\\').pop();
                    const normKey = (catalogName && String(catalogName).startsWith('catalogs/')) ? String(catalogName) : `catalogs/${apiKey}`;
                    topWin.__catalogStylesByName[catalogName] = stylesToStore;
                    if (apiKey) topWin.__catalogStylesByName[apiKey] = stylesToStore;
                    if (normKey) topWin.__catalogStylesByName[normKey] = stylesToStore;
                }
            } catch (_) {}
        }
    } catch (_) {}
    try { window.dispatchEvent(new CustomEvent('catalog:changed', { detail: { name: activeCatalog } })); } catch (_) {}
    
    // Show loading indicator
    showNotification(true, 'Loading catalog...');
    
    // NOTE: We no longer clear existing overlays here. Neloura supports multiple catalogs at once.
    
    // Clear any existing flag data
    window.catalogDataWithFlags = null;
    
    console.log(`[loadCatalog] Fetching data from: /catalog-with-flags/${encodeURIComponent(catalogNameForApi)}`);

    // Prepare optional RA/DEC/size overrides from UI styles if present
    const urlParams = new URLSearchParams();
    // Try persisted overrides by several keys: raw name, api name (basename), and current catalog
    const apiName = (catalogName || '').toString().split('/').pop().split('\\').pop();
    const persisted = (window.catalogOverridesByCatalog && (
        window.catalogOverridesByCatalog[catalogName] ||
        window.catalogOverridesByCatalog[apiName]
    )) || null;
    const raCol = (styles && styles.raColumn) || (persisted && persisted.ra_col);
    const decCol = (styles && styles.decColumn) || (persisted && persisted.dec_col);
    const sizeCol = (styles && styles.sizeColumn) || (persisted && persisted.size_col);
    if (raCol) urlParams.set('ra_col', raCol);
    if (decCol) urlParams.set('dec_col', decCol);
    if (sizeCol) urlParams.set('size_col', sizeCol);
    // Also mirror overrides in headers for robustness
    const extraHeaders = {};
    if (raCol) extraHeaders['X-RA-Col'] = raCol;
    if (decCol) extraHeaders['X-DEC-Col'] = decCol;
    if (sizeCol) extraHeaders['X-Size-Col'] = sizeCol;
    const querySuffix = urlParams.toString() ? `?${urlParams.toString()}` : '';
    if (!urlParams.has('ra_col') && raColBin) urlParams.set('ra_col', raColBin);
    if (!urlParams.has('dec_col') && decColBin) urlParams.set('dec_col', decColBin);
    const finalQuery = urlParams.toString();
    const finalUrl = `/catalog-binary/${encodeURIComponent(catalogNameForApi)}${finalQuery ? `?${finalQuery}` : ''}`;
    // Mirror overrides in headers for robustness
    const extraHeadersBin = {};
    if (styles && styles.raColumn) extraHeadersBin['X-RA-Col'] = styles.raColumn;
    if (styles && styles.decColumn) extraHeadersBin['X-DEC-Col'] = styles.decColumn;
    if (styles && styles.sizeColumn) extraHeadersBin['X-Size-Col'] = styles.sizeColumn;
    
    // Fetch catalog data from server
    // IMPORTANT: /catalog-with-flags expects the API name (basename), not the internal "catalogs/<file>" key.
    apiFetch(`/catalog-with-flags/${encodeURIComponent(catalogNameForApi)}${querySuffix}` , {
        method: 'GET',
        headers: extraHeaders
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Failed to load catalog: ${response.statusText}`);
        }
        return response.json();
    })
    .then(responseData => {
        console.log('[loadCatalog] Received response from server.');
        
        let catalogData;
        if (Array.isArray(responseData)) {
            catalogData = responseData;
        } else if (responseData && responseData.catalog_data && Array.isArray(responseData.catalog_data)) {
            catalogData = responseData.catalog_data;
        } else if (responseData && responseData.data && Array.isArray(responseData.data)) {
            catalogData = responseData.data;
        } else if (responseData && responseData.catalog && Array.isArray(responseData.catalog)) {
            catalogData = responseData.catalog;
        } else {
            console.error('[loadCatalog] Invalid catalog data format:', responseData);
            throw new Error('Invalid catalog data format: expected an array or an object with a data array.');
        }
        
        console.log(`[loadCatalog] Parsed ${catalogData.length} objects from response.`);

        if (!Array.isArray(catalogData) || catalogData.length === 0) {
            throw new Error('No catalog data found or invalid format.');
        }

        // Store the complete catalog data and prepare styled overlay entries
        window.catalogDataWithFlags = catalogData;
        _ensureCatalogOverlayStore();
        const key = _catalogKey(catalogName);
        window.catalogOverlaysByCatalog[key] = prepareCatalogOverlayData(catalogData, styles, key);
        rebuildCombinedCatalogOverlay();

        console.log('[loadCatalog] Prepared overlay data with styles. Sample object:', window.catalogOverlaysByCatalog[key]?.[0]);
        
        console.log('[loadCatalog] Prepared overlay data with', window.catalogOverlaysByCatalog[key]?.length, 'objects (catalog), total overlay:', (window.catalogDataForOverlay || []).length);
        
        // Wait for viewer to be ready and add overlay
        function safeAddOverlay() {
            const activeViewer = window.viewer || window.tiledViewer;
            console.log('[loadCatalog] Checking for active viewer:', !!activeViewer);
            
            if (activeViewer) {
                console.log('[loadCatalog] Viewer ready, adding canvas overlay');
                
                // Use canvas overlay system
                if (typeof canvasAddCatalogOverlay === 'function') {
                    const addedCount = canvasAddCatalogOverlay(window.catalogDataForOverlay);
                    console.log(`[loadCatalog] Canvas overlay added ${addedCount} objects`);
                } else {
                    console.error('[loadCatalog] canvasAddCatalogOverlay function not found');
                    // Fallback to DOM overlay
                    if (typeof addCatalogOverlay === 'function') {
                        addCatalogOverlay(window.catalogDataForOverlay, styles);
                    }
                }
                
                // Create flag filter button
                // createFlagFilterButton();
                
                showNotification(false);
                showNotification(`Catalog loaded.`, 2000, 'success');
                
            } else {
                console.log('[loadCatalog] Viewer not ready, retrying...');
                setTimeout(safeAddOverlay, 100);
            }
        }
        
        safeAddOverlay();
    })
    .catch(error => {
        console.error('[loadCatalog] Error loading catalog:', error);
        showNotification(false);
        showNotification(`Error: ${error.message || 'Failed to load catalog'}`, 3000, 'error');
        window.catalogDataWithFlags = null;
    });
}

try {
    window.getActiveCatalogState = function() {
        const name = window.currentCatalogName || window.activeCatalog || null;
        let styles = null;
        try {
            styles = (name && window.__catalogStylesByName && window.__catalogStylesByName[name]) ? window.__catalogStylesByName[name] : null;
            // Also try API name (basename) if full name didn't match
            if (!styles && name && window.__catalogStylesByName) {
                const apiName = (name || '').toString().split('/').pop().split('\\').pop();
                if (apiName !== name && window.__catalogStylesByName[apiName]) {
                    styles = window.__catalogStylesByName[apiName];
                }
            }
        } catch (_) {}
        
        // Also include RA/Dec column overrides if available
        try {
            if (name && window.catalogOverridesByCatalog) {
                const apiName = (name || '').toString().split('/').pop().split('\\').pop();
                const overrides = window.catalogOverridesByCatalog[name] || window.catalogOverridesByCatalog[apiName] || null;
                if (overrides) {
                    // Merge overrides into styles
                    if (!styles) styles = {};
                    if (overrides.ra_col && !styles.raColumn) styles.raColumn = overrides.ra_col;
                    if (overrides.dec_col && !styles.decColumn) styles.decColumn = overrides.dec_col;
                    if (overrides.size_col && !styles.sizeColumn) styles.sizeColumn = overrides.size_col;
                }
            }
        } catch (e) {
            console.warn('[getActiveCatalogState] Error merging overrides:', e);
        }
        
        console.log('[getActiveCatalogState] Returning:', { name, styles: styles ? Object.keys(styles) : null, hasRaColumn: !!(styles && styles.raColumn), hasDecColumn: !!(styles && styles.decColumn) });
        return { name, styles };
    };
} catch (_) {}

// Binary catalog loader with fast parsing
function loadCatalogBinary(catalogName, styles = null) {
    console.log(`[DEBUG] loadCatalogBinary called with:`, { catalogName, styles });
    console.log(`[loadCatalogBinary] Function started with catalog: ${catalogName}`);
    
    if (!catalogName) {
        console.error('[loadCatalogBinary] No catalog name provided, exiting.');
        showNotification('Please select a catalog first', 3000);
        return;
    }

    const effectiveStyles = resolveCatalogStyle(catalogName, styles);
    if (!styles && effectiveStyles) {
        styles = effectiveStyles;
    }
    // If we resolved styles from another pane, mirror them locally so subsequent reloads keep them.
    try {
        if (!window.__catalogStylesByName) window.__catalogStylesByName = {};
        if (styles && typeof styles === 'object') {
            const apiKey = (catalogName || '').toString().split('/').pop().split('\\').pop();
            const normKey = (catalogName && String(catalogName).startsWith('catalogs/')) ? String(catalogName) : `catalogs/${apiKey}`;
            window.__catalogStylesByName[catalogName] = JSON.parse(JSON.stringify(styles));
            if (apiKey) window.__catalogStylesByName[apiKey] = window.__catalogStylesByName[catalogName];
            if (normKey) window.__catalogStylesByName[normKey] = window.__catalogStylesByName[catalogName];
            // Mirror to top as well
            try {
                const topWin = (window.top && window.top !== window) ? window.top : null;
                if (topWin) {
                    if (!topWin.__catalogStylesByName) topWin.__catalogStylesByName = {};
                    topWin.__catalogStylesByName[catalogName] = window.__catalogStylesByName[catalogName];
                    if (apiKey) topWin.__catalogStylesByName[apiKey] = window.__catalogStylesByName[catalogName];
                    if (normKey) topWin.__catalogStylesByName[normKey] = window.__catalogStylesByName[catalogName];
                }
            } catch (_) {}
        }
    } catch (_) {}
    if (styles) {
        try {
            console.log('[loadCatalogBinary] styles summary', {
                colorCodeColumn: styles.colorCodeColumn,
                colorMapName: styles.colorMapName,
                borderColor: styles.borderColor,
                bg: styles.backgroundColor
            });
        } catch (_) {}
    } else {
        try { console.log('[loadCatalogBinary] No styles available (falling back to defaults)'); } catch (_) {}
    }
    
    // Initialize catalogData if needed
    if (!window.catalogData || !Array.isArray(window.catalogData)) {
        window.catalogData = [];
    }
    
    // Store the current catalog name globally
    window.currentCatalogName = catalogName;
    activeCatalog = catalogName;
    try { window.dispatchEvent(new CustomEvent('catalog:changed', { detail: { name: activeCatalog } })); } catch (_) {}
    
    // Show loading indicator
    showNotification(true, 'Loading catalog...');
    
    // NOTE: We no longer clear existing overlays here. Neloura supports multiple catalogs at once.
    
    // Clear any existing flag data
    window.catalogDataWithFlags = null;
    
    // Normalize to API name (server expects basename inside catalogs dir)
    const catalogNameForApi = (catalogName || '').toString().split('/').pop().split('\\').pop();
    // We log final URL after building query
    
    // Prepare optional RA/DEC/size overrides from UI styles or persisted overrides if present
    const urlParams = new URLSearchParams();
    const persistedBin = (window.catalogOverridesByCatalog && (
        window.catalogOverridesByCatalog[catalogName] ||
        window.catalogOverridesByCatalog[catalogNameForApi]
    )) || null;
    const raColBin = (styles && styles.raColumn) || (persistedBin && persistedBin.ra_col);
    const decColBin = (styles && styles.decColumn) || (persistedBin && persistedBin.dec_col);
    const sizeColBin = (styles && styles.sizeColumn) || (persistedBin && persistedBin.size_col);
    const colorColBin = (styles && styles.colorCodeColumn) || (persistedBin && persistedBin.color_col);
    if (raColBin) urlParams.set('ra_col', raColBin);
    if (decColBin) urlParams.set('dec_col', decColBin);
    if (sizeColBin) urlParams.set('size_col', sizeColBin);
    if (colorColBin) urlParams.set('color_col', colorColBin);

    const querySuffix = urlParams.toString() ? `?${urlParams.toString()}` : '';
    // Build final URL explicitly (guarantee ra_col/dec_col in URL if present)
    const finalQuery = urlParams.toString();
    const finalUrl = `/catalog-binary/${encodeURIComponent(catalogNameForApi)}${finalQuery ? `?${finalQuery}` : ''}`;

    // Fetch binary catalog data from server
    console.log(`[loadCatalogBinary] Request URL: ${finalUrl}`);
    console.log('[loadCatalogBinary] Overrides resolved:', { ra: raColBin, dec: decColBin, size: sizeColBin, persisted: !!persistedBin });

    // Build headers for overrides (scoped to this function)
    const extraHeadersBin = {};
    if (raColBin) extraHeadersBin['X-RA-Col'] = raColBin;
    if (decColBin) extraHeadersBin['X-DEC-Col'] = decColBin;
    if (sizeColBin) extraHeadersBin['X-Size-Col'] = sizeColBin;
    if (colorColBin) extraHeadersBin['X-Color-Col'] = colorColBin;
    console.log('[loadCatalogBinary] Headers to send:', extraHeadersBin);
    apiFetch(finalUrl, {
        method: 'GET',
        headers: { ...extraHeadersBin }
    })
    .then(async response => {
        if (!response.ok) {
            // Fallback for sessions without WCS: try raw endpoint
            if (response.status === 500) {
                console.warn('[loadCatalogBinary] /catalog-binary failed (likely no WCS). Falling back to /catalog-binary-raw');
                const rawResp = await apiFetch(`/catalog-binary-raw/${encodeURIComponent(catalogNameForApi)}${finalQuery ? `?${finalQuery}` : ''}` , {
                    method: 'GET',
                    headers: { ...extraHeadersBin }
                });
                if (!rawResp.ok) {
                    throw new Error(`Failed to load catalog (raw): ${rawResp.statusText}`);
                }
                return rawResp.arrayBuffer();
            }
            throw new Error(`Failed to load catalog: ${response.statusText}`);
        }
        return response.arrayBuffer();
    })
    .then(async arrayBuffer => {
        console.log('[loadCatalogBinary] Received binary response, size:', arrayBuffer.byteLength);
        
        // Parse binary data
        let catalogData = parseBinaryCatalog(arrayBuffer);
        console.log('[loadCatalogBinary] Header from primary endpoint:', catalogData && catalogData.header);
        console.log(`[loadCatalogBinary] Parsed ${catalogData.records.length} objects from binary data (primary).`);
        
        // If no records from session/WCS-scoped endpoint, fall back to raw
        if (!catalogData.records || catalogData.records.length === 0) {
            console.warn('[loadCatalogBinary] Primary endpoint returned 0 records. Falling back to /catalog-binary-raw ...');
            try {
                const rawResp = await apiFetch(`/catalog-binary-raw/${encodeURIComponent(catalogNameForApi)}${finalQuery ? `?${finalQuery}` : ''}`, {
                    method: 'GET',
                    headers: { ...extraHeadersBin }
                });
                if (!rawResp.ok) {
                    throw new Error(`Fallback /catalog-binary-raw failed: ${rawResp.status} ${rawResp.statusText}`);
                }
                const rawBuf = await rawResp.arrayBuffer();
                console.log('[loadCatalogBinary] Received fallback raw binary, size:', rawBuf.byteLength);
                const parsedRaw = parseBinaryCatalog(rawBuf);
                console.log('[loadCatalogBinary] Header from fallback endpoint:', parsedRaw && parsedRaw.header);
                console.log(`[loadCatalogBinary] Parsed ${parsedRaw.records.length} objects from binary data (fallback).`);
                catalogData = parsedRaw;
            } catch (fallbackErr) {
                console.error('[loadCatalogBinary] Fallback to /catalog-binary-raw failed:', fallbackErr);
            }
        }
        
        // Track current in-memory flags dataset name to avoid using stale data across catalogs
        try {
            const activeName = (catalogData && catalogData.header && catalogData.header.catalog_name) ? catalogData.header.catalog_name : null;
            window.catalogDataWithFlagsName = activeName;
        } catch(_) { window.catalogDataWithFlagsName = null; }
        
        if (!catalogData.records || catalogData.records.length === 0) {
            console.error('[loadCatalogBinary] No records even after fallback. Header was:', catalogData && catalogData.header);
            throw new Error('No catalog data found or invalid format.');
        }
        
        // If color-coding needs a column not included in the binary payload,
        // fetch it via /catalog-column-values/ and attach to raw records before styling.
        try {
            if (styles && styles.colorCodeColumn) {
                await __attachColumnValuesToRawRecords(catalogNameForApi, catalogData.records, [styles.colorCodeColumn]);
            }
        } catch (e) {
            console.warn('[loadCatalogBinary] Failed to fetch color-code column values; color coding may be disabled.', e);
        }

        // Store the complete catalog data and build styled overlay entries
        window.catalogDataWithFlags = catalogData.records;
        _ensureCatalogOverlayStore();
        const key = _catalogKey(catalogName);
        window.catalogOverlaysByCatalog[key] = prepareCatalogOverlayData(catalogData.records, styles, key);
        rebuildCombinedCatalogOverlay();
        
        console.log('[loadCatalogBinary] Prepared overlay data with styles. Sample object:',
                    window.catalogOverlaysByCatalog[key]?.[0]);
        
        // Store metadata (global + per-catalog)
        try {
            window.catalogMetadata = catalogData.header;
            window.catalogMetadataByCatalog = window.catalogMetadataByCatalog || {};
            window.catalogMetadataByCatalog[key] = catalogData.header;
            // Multi-pane: also publish to top window so catalog-overlay-controls can see it.
            try {
                if (window.top && window.top !== window) {
                    window.top.catalogMetadata = catalogData.header;
                    window.top.catalogMetadataByCatalog = window.top.catalogMetadataByCatalog || {};
                    window.top.catalogMetadataByCatalog[key] = catalogData.header;
                }
            } catch (_) {}
        } catch (_) {}
        
        // Wait for viewer to be ready and add overlay
        function safeAddOverlay() {
            const activeViewer = window.viewer || window.tiledViewer;
            console.log('[loadCatalogBinary] Checking for active viewer:', !!activeViewer);
            
            if (activeViewer) {
                console.log('[loadCatalogBinary] Viewer ready, adding canvas overlay');
                
                // Use canvas overlay system
                if (typeof canvasAddCatalogOverlay === 'function') {
                    const addedCount = canvasAddCatalogOverlay(window.catalogDataForOverlay);
                    console.log(`[loadCatalogBinary] Canvas overlay added ${addedCount} objects`);
                } else {
                    console.error('[loadCatalogBinary] canvasAddCatalogOverlay function not found');
                    // Fallback to DOM overlay
                    if (typeof addCatalogOverlay === 'function') {
                        addCatalogOverlay(window.catalogDataForOverlay, styles);
                    }
                }
                
                // Create flag filter button if boolean columns exist
                if (catalogData.header.boolean_columns && catalogData.header.boolean_columns.length > 0) {
                    // createFlagFilterButton();
                }
                
                showNotification(false);
                showNotification(`Catalog loaded.`, 2000, 'success');
                
            } else {
                console.log('[loadCatalogBinary] Viewer not ready, retrying...');
                setTimeout(safeAddOverlay, 100);
            }
        }
        
        safeAddOverlay();
    })
    .catch(error => {
        console.error('[loadCatalogBinary] Error loading catalog:', error);
        showNotification(false);
        showNotification(`Error: ${error.message || 'Failed to load catalog'}`, 3000, 'error');
        window.catalogDataWithFlags = null;
    });
}

// Parse binary catalog format
function parseBinaryCatalog(arrayBuffer) {
    function sanitizeNonStandardNumbers(s) {
        // Replace NaN, Infinity, -Infinity with null, but only outside of strings
        let result = '';
        let i = 0;
        let inString = false;
        let escapeNext = false;
        while (i < s.length) {
            const ch = s[i];
            if (inString) {
                result += ch;
                if (escapeNext) {
                    escapeNext = false;
                } else if (ch === '\\') {
                    escapeNext = true;
                } else if (ch === '"') {
                    inString = false;
                }
                i++;
                continue;
            }
            if (ch === '"') {
                inString = true;
                result += ch;
                i++;
                continue;
            }
            // Outside of strings: replace tokens
            if (s.startsWith('NaN', i)) {
                result += 'null';
                i += 3;
                continue;
            }
            if (s.startsWith('Infinity', i)) {
                result += 'null';
                i += 8;
                continue;
            }
            if (s.startsWith('-Infinity', i)) {
                result += 'null';
                i += 9;
                continue;
            }
            result += ch;
            i++;
        }
        return result;
    }
    const dataView = new DataView(arrayBuffer);
    let offset = 0;
    
    // Read header length (4 bytes)
    const headerLength = dataView.getUint32(offset, true);
    offset += 4;
    
    // Read header JSON
    const headerBytes = new Uint8Array(arrayBuffer, offset, headerLength);
    const headerJson = new TextDecoder().decode(headerBytes);
    let header;
    try {
        header = JSON.parse(headerJson);
    } catch (e) {
        // Fallback if header ever contains NaN/Infinity
        const sanitized = sanitizeNonStandardNumbers(headerJson);
        header = JSON.parse(sanitized);
    }
    offset += headerLength;
    
    console.log('[parseBinaryCatalog] Header:', header);
    
    // Parse records
    const records = [];
    const numRecords = header.num_records;
    
    for (let i = 0; i < numRecords; i++) {
        // Read numeric fields
        const ra = dataView.getFloat64(offset, true);
        offset += 8;
        
        const dec = dataView.getFloat64(offset, true);
        offset += 8;
        
        const x_pixels = dataView.getFloat32(offset, true);
        offset += 4;
        
        const y_pixels = dataView.getFloat32(offset, true);
        offset += 4;
        
        const radius_pixels = dataView.getFloat32(offset, true);
        offset += 4;
        
        // Read metadata length and content
        const metadataLength = dataView.getUint32(offset, true);
        offset += 4;
        
        const metadataBytes = new Uint8Array(arrayBuffer, offset, metadataLength);
        const metadataJson = new TextDecoder().decode(metadataBytes);
        let metadata;
        try {
            metadata = JSON.parse(metadataJson);
        } catch (e) {
            try {
                const sanitized = sanitizeNonStandardNumbers(metadataJson);
                metadata = JSON.parse(sanitized);
            } catch (e2) {
                console.warn('[parseBinaryCatalog] Failed to parse metadata JSON, using empty object. Sample:', metadataJson.slice(0, 200));
                metadata = {};
            }
        }
        offset += metadataLength;
        
        // Combine into record
        const record = {
            ra,
            dec,
            x_pixels,
            y_pixels,
            radius_pixels,
            ...metadata
        };
        
        records.push(record);
    }
    
    return {
        header,
        records
    };
}

// Optimized binary catalog loader with streaming support (for very large catalogs)
async function loadCatalogBinaryStream(catalogName, styles = null) {
    console.log(`[loadCatalogBinaryStream] Starting streaming load for: ${catalogName}`);
    
    if (!catalogName) {
        console.error('[loadCatalogBinaryStream] No catalog name provided');
        showNotification('Please select a catalog first', 3000);
        return;
    }
    
    // Initialize
    window.currentCatalogName = catalogName;
    activeCatalog = catalogName;
    try { window.dispatchEvent(new CustomEvent('catalog:changed', { detail: { name: activeCatalog } })); } catch (_) {}
    showNotification(true, 'Loading catalog...');
    
    // Clear existing overlays
    if (typeof canvasClearCatalogOverlay === 'function') {
        canvasClearCatalogOverlay();
    }
    
    try {
        const response = await apiFetch(`/catalog-binary/${encodeURIComponent(catalogName)}`, {
            method: 'GET',
            headers: {
                'Accept-Encoding': 'gzip'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to load catalog: ${response.statusText}`);
        }
        
        // For streaming, we need to process chunks
        const reader = response.body.getReader();
        const chunks = [];
        let totalBytes = 0;
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            chunks.push(value);
            totalBytes += value.length;
            
            // Update progress
            showNotification(true, `Loading catalog... ${Math.round(totalBytes / 1024)}KB`);
        }
        
        // Combine chunks into single ArrayBuffer
        const fullBuffer = new ArrayBuffer(totalBytes);
        const uint8Array = new Uint8Array(fullBuffer);
        let position = 0;
        
        for (const chunk of chunks) {
            uint8Array.set(chunk, position);
            position += chunk.length;
        }
        
        // Parse the complete buffer
        const catalogData = parseBinaryCatalog(fullBuffer);
        // Attach color-coding columns if needed (binary payload may omit them)
        try {
            if (styles && styles.colorCodeColumn) {
                const apiName = String(catalogName || '').replace(/^catalogs\//, '').split('/').pop().split('\\').pop();
                await __attachColumnValuesToRawRecords(apiName, catalogData.records, [styles.colorCodeColumn]);
            }
        } catch (e) {
            console.warn('[loadCatalogBinaryStream] Failed to fetch color-code column values; color coding may be disabled.', e);
        }
        
        // Process and display as before
        window.catalogDataWithFlags = catalogData.records;
        _ensureCatalogOverlayStore();
        const key = _catalogKey(catalogName);
        window.catalogOverlaysByCatalog[key] = prepareCatalogOverlayData(catalogData.records, styles, key);
        rebuildCombinedCatalogOverlay();
        try {
            window.catalogMetadata = catalogData.header;
            window.catalogMetadataByCatalog = window.catalogMetadataByCatalog || {};
            window.catalogMetadataByCatalog[key] = catalogData.header;
            try {
                if (window.top && window.top !== window) {
                    window.top.catalogMetadata = catalogData.header;
                    window.top.catalogMetadataByCatalog = window.top.catalogMetadataByCatalog || {};
                    window.top.catalogMetadataByCatalog[key] = catalogData.header;
                }
            } catch (_) {}
        } catch (_) {}
        
        // Add overlay when viewer is ready
        await waitForViewerAndAddOverlay();
        
        showNotification(false);
        showNotification(`Catalog loaded: ${catalogData.records.length} objects`, 2000, 'success');
        
    } catch (error) {
        console.error('[loadCatalogBinaryStream] Error:', error);
        showNotification(false);
        showNotification(`Error: ${error.message}`, 3000, 'error');
        window.catalogDataWithFlags = null;
    }
}

// Helper function to prepare overlay data with styles
function prepareCatalogOverlayData(records, styles, catalogKey = null) {
    // Huge catalogs: avoid cloning 900k objects with `{...obj}` (slow + memory heavy).
    // Instead, build lightweight overlay records containing only what the renderer needs.
    const HUGE_CATALOG_N = 250000;
    if (Array.isArray(records) && records.length > HUGE_CATALOG_N) {
        const out = new Array(records.length);
        const styleOpacity = styles && typeof styles.opacity === 'number' ? styles.opacity : 0.8;
        const fallbackRs = getEffectiveRegionStylesForOverlay();
        const resolvedShape = normalizeShape((styles && styles.shape) || fallbackRs.shape);
        const stroke = (styles && styles.borderColor) ? styles.borderColor : '#FF0000';
        const fill = (styles && styles.backgroundColor && styles.backgroundColor !== 'transparent')
            ? styles.backgroundColor
            : 'rgba(255, 0, 0, 0.3)';
        const borderW = (styles && styles.borderWidth) ? styles.borderWidth : 2;
        const radiusPx = (styles && typeof styles.radius === 'number' && isFinite(styles.radius) && styles.radius > 0)
            ? styles.radius
            : 5;
        const transparentFill = !(styles && styles.backgroundColor && styles.backgroundColor !== 'transparent');
        const colorCoder = (styles && styles.colorCodeColumn)
            ? buildColorCoder(records, styles.colorCodeColumn, styles.colorMapName)
            : null;

        for (let i = 0; i < records.length; i += 1) {
            const r = records[i] || {};
            let sStroke = stroke;
            let sFill = fill;
            let sTransparent = transparentFill;
            if (colorCoder && styles && styles.colorCodeColumn) {
                const valueForColorRaw = getRecordValue(r, styles.colorCodeColumn);
                const valueForColor = coerceScalarValue(valueForColorRaw);
                const colorHex = colorCoder(valueForColor);
                if (colorHex) {
                    sStroke = colorHex;
                    sFill = hexToRgba(colorHex, 0.3);
                    sTransparent = false;
                }
            }
            out[i] = {
                // minimal coords
                ra: r.ra,
                dec: r.dec,
                x_pixels: r.x_pixels,
                y_pixels: r.y_pixels,
                x: r.x,
                y: r.y,
                radius_pixels: radiusPx,
                __row_index: r.__row_index,
                // bookkeeping
                index: i,
                passesFilter: true,
                __catalogName: catalogKey || null,
                // style
                color: sStroke,
                fillColor: sFill,
                border_width: borderW,
                opacity: styleOpacity,
                useTransparentFill: sTransparent,
                shape: resolvedShape
            };
        }
        return out;
    }

    // Derive arcsec/pixel from current WCS if available
    let arcsecPerPixel = null;
    try {
        const w = window?.fitsData?.wcs;
        if (w) {
            const cd11 = Number(w.CD1_1 ?? w.cd11 ?? w.CDELT1 ?? w.cdelt1 ?? 0);
            const cd12 = Number(w.CD1_2 ?? w.cd12 ?? 0);
            const cd21 = Number(w.CD2_1 ?? w.cd21 ?? 0);
            const cd22 = Number(w.CD2_2 ?? w.cd22 ?? w.CDELT2 ?? w.cdelt2 ?? 0);
            const scaleXDeg = Math.sqrt(cd11*cd11 + cd21*cd21);
            const scaleYDeg = Math.sqrt(cd12*cd12 + cd22*cd22);
            const avgDeg = (isFinite(scaleXDeg) && isFinite(scaleYDeg) && scaleXDeg>0 && scaleYDeg>0) ? (scaleXDeg + scaleYDeg) / 2 : (isFinite(scaleXDeg) && scaleXDeg>0 ? scaleXDeg : (isFinite(scaleYDeg) && scaleYDeg>0 ? scaleYDeg : 0.0));
            if (avgDeg > 0) arcsecPerPixel = 3600 * avgDeg;
        }
    } catch (_) {}
    const colorCoder = (styles && styles.colorCodeColumn)
        ? buildColorCoder(records, styles.colorCodeColumn, styles.colorMapName)
        : null;
    if (colorCoder) {
        try {
            console.log('[Overlay] Applying color coding', {
                column: styles.colorCodeColumn,
                colorMap: styles.colorMapName
            });
        } catch (_) {}
    } else if (styles && styles.colorCodeColumn) {
        try {
            console.warn('[Overlay] color coding requested but palette could not be built', {
                column: styles.colorCodeColumn,
                map: styles.colorMapName
            });
            if (records.length > 0) {
                console.warn('[Overlay] first record keys', Object.keys(records[0] || {}).slice(0, 20));
                console.warn('[Overlay] first record sample value', {
                    value: getRecordValue(records[0], styles.colorCodeColumn)
                });
            }
        } catch (_) {}
    }
    const styleOpacity = styles && typeof styles.opacity === 'number' ? styles.opacity : 0.8;
    const fallbackRs = getEffectiveRegionStylesForOverlay();
    const resolvedShape = normalizeShape((styles && styles.shape) || fallbackRs.shape);
    return records.map((obj, index) => {
        const styledObj = {
            ...obj,
            index: index,
            passesFilter: true,
            __catalogName: catalogKey || null
        };
        
        if (styles) {
            let colorApplied = false;
            if (colorCoder) {
                const valueForColorRaw = getRecordValue(obj, styles.colorCodeColumn);
                const valueForColor = coerceScalarValue(valueForColorRaw);
                const colorHex = colorCoder(valueForColor);
                if (colorHex) {
                    styledObj.color = colorHex;
                    // Keep fill alpha independent of opacity so the opacity slider behaves linearly.
                    // Renderer will apply `styledObj.opacity` as the overall alpha multiplier.
                    styledObj.fillColor = hexToRgba(colorHex, 0.3);
                    styledObj.border_width = styles.borderWidth || 2;
                    styledObj.opacity = styleOpacity;
                    styledObj.useTransparentFill = false;
                    styledObj.colorCodeColumn = styles.colorCodeColumn;
                    styledObj.colorCodeValue = valueForColor;
                    styledObj.colorMapName = styles.colorMapName || null;
                    colorApplied = true;
                    if (index < 3) {
                        try {
                            console.log('[Overlay] sample color', {
                                index,
                                value: valueForColorRaw,
                                scalar: valueForColor,
                                color: styledObj.color
                            });
                        } catch (_) {}
                    }
                }
            }
            if (!colorApplied) {
                styledObj.color = styles.borderColor || '#FF0000';
                styledObj.fillColor = (styles.backgroundColor !== 'transparent') ? 
                    styles.backgroundColor : 'rgba(255, 0, 0, 0.3)';
                styledObj.border_width = styles.borderWidth || 2;
                styledObj.opacity = styleOpacity;
                styledObj.useTransparentFill = styles.backgroundColor === 'transparent';
            }
            styledObj.radius_pixels = styles.radius || obj.radius_pixels || 5;
            // IMPORTANT: carry shape into each overlay object so canvas renderers don't fall back to circles
            styledObj.shape = resolvedShape;
            // If a size column (arcsec) was chosen and WCS is known, convert to pixels per-object
            if (styles.sizeColumn && obj.hasOwnProperty(styles.sizeColumn)) {
                const sizeArcsec = parseFloat(obj[styles.sizeColumn]);
                if (isFinite(sizeArcsec) && sizeArcsec > 0 && arcsecPerPixel && arcsecPerPixel > 0) {
                    styledObj.size_arcsec = sizeArcsec;
                    styledObj.size_pixels = sizeArcsec / arcsecPerPixel;
                }
            }
        } else {
            styledObj.color = '#FF0000';
            styledObj.fillColor = 'rgba(255, 0, 0, 0.3)';
            styledObj.border_width = 2;
            styledObj.opacity = 0.8;
            styledObj.useTransparentFill = true;
            styledObj.radius_pixels = obj.radius_pixels || 5;
            styledObj.shape = normalizeShape(getEffectiveRegionStylesForOverlay()?.shape);
            // No styles provided, still convert size column if present
            const defaultSizeCol = (window?.catalogMetadata?.sizeColumnName) || null;
            const sizeCol = defaultSizeCol && obj.hasOwnProperty(defaultSizeCol) ? defaultSizeCol : null;
            if (sizeCol) {
                const sizeArcsec = parseFloat(obj[sizeCol]);
                if (isFinite(sizeArcsec) && sizeArcsec > 0 && arcsecPerPixel && arcsecPerPixel > 0) {
                    styledObj.size_arcsec = sizeArcsec;
                    styledObj.size_pixels = sizeArcsec / arcsecPerPixel;
                }
            }
        }
        
        return styledObj;
    });
}

// Helper function to wait for viewer and add overlay
async function waitForViewerAndAddOverlay() {
    return new Promise((resolve) => {
        function checkAndAdd() {
            const activeViewer = window.viewer || window.tiledViewer;
            
            if (activeViewer) {
                if (typeof canvasAddCatalogOverlay === 'function') {
                    const addedCount = canvasAddCatalogOverlay(window.catalogDataForOverlay);
                    console.log(`[Overlay] Added ${addedCount} objects`);
                } else if (typeof addCatalogOverlay === 'function') {
                    addCatalogOverlay(window.catalogDataForOverlay);
                }
                
                if (window.catalogMetadata?.boolean_columns?.length > 0) {
                    // createFlagFilterButton();
                }
                
                resolve();
            } else {
                setTimeout(checkAndAdd, 100);
            }
        }
        
        checkAndAdd();
    });
}

window.loadCatalog = loadCatalogBinary;

function showStyleCustomizerPopup(catalogName) {
    // Always render the style popup in the top-level document (above multi-panel panes)
    let hostDocument = null;
    let hostWindow = null;
    try {
        const root = window.top || window;
        if (root.document && root.document.body) {
            hostDocument = root.document;
            hostWindow = root;
        }
    } catch (_) {}
    if (!hostDocument) {
        hostDocument = window.document;
        hostWindow = window;
    }
    const document = hostDocument;
    // Prevent multiple popups (close existing with animation if available)
    const existingPopup = document.getElementById('region-style-popup');
    if (existingPopup) {
        try {
            if (typeof existingPopup.__nelouraClose === 'function') {
                existingPopup.__nelouraClose();
            } else if (existingPopup.parentNode) {
                existingPopup.parentNode.removeChild(existingPopup);
            }
        } catch (_) {
            try { if (existingPopup.parentNode) existingPopup.parentNode.removeChild(existingPopup); } catch (_) {}
        }
    }

    // Default styles
    const regionStyles = {
        borderColor: '#FF0000',
        backgroundColor: 'transparent',
        borderWidth: 2,
        opacity: 0.8,
        shape: (window.regionStyles && window.regionStyles.shape) ? window.regionStyles.shape : 'circle',
    };

    // Extract the API-compatible catalog name (remove catalogs/ prefix if present)
    let catalogNameForApi = catalogName;
    if (catalogName.startsWith('catalogs/')) {
        catalogNameForApi = catalogName.replace('catalogs/', '');
    }
    // Track current catalog in case the user changes catalog while popup is open
    let currentCatalogNameForApi = catalogNameForApi;
    
    console.log('showStyleCustomizerPopup - Original catalog name:', catalogName);
    console.log('showStyleCustomizerPopup - API catalog name:', catalogNameForApi);

    // Create popup container
    const popup = document.createElement('div');
    popup.id = 'region-style-popup';
    // Simple open/close animation (fade + slight slide/scale)
    const baseTransform = 'translate(-50%, -50%)';
    const animateIn = () => {
        try {
            popup.style.willChange = 'opacity, transform';
            popup.style.transition = 'opacity 170ms ease, transform 170ms ease';
            popup.style.opacity = '0';
            popup.style.transform = `${baseTransform} translateY(12px) scale(0.98)`;
            // next frame -> animate in
            requestAnimationFrame(() => {
                popup.style.opacity = '1';
                popup.style.transform = `${baseTransform} translateY(0px) scale(1)`;
            });
        } catch (_) {}
    };
    const animateOut = () => {
        try {
            if (popup.__nelouraClosing) return;
            popup.__nelouraClosing = true;
            // detach ESC listener
            try {
                if (popup.__nelouraEscHandler) {
                    document.removeEventListener('keydown', popup.__nelouraEscHandler, true);
                }
            } catch (_) {}
            popup.style.willChange = 'opacity, transform';
            popup.style.transition = 'opacity 160ms ease, transform 160ms ease';
            popup.style.opacity = '0';
            // If it's still centered, animate transform; if user dragged it (transform='none'), just fade
            if (String(popup.style.transform || '').includes('translate(-50%, -50%)')) {
                popup.style.transform = `${baseTransform} translateY(12px) scale(0.98)`;
            }
            const cleanup = () => {
                try { if (popup && popup.parentNode) popup.parentNode.removeChild(popup); } catch (_) {}
            };
            const t = setTimeout(cleanup, 220);
            popup.addEventListener('transitionend', (ev) => {
                if (ev && ev.target !== popup) return;
                clearTimeout(t);
                cleanup();
            }, { once: true });
        } catch (_) {
            try { if (popup && popup.parentNode) popup.parentNode.removeChild(popup); } catch (_) {}
        }
    };
    // Expose close hook so callers can close existing popups smoothly
    try { popup.__nelouraClose = animateOut; } catch (_) {}
    // Close on Escape
    try {
        popup.__nelouraEscHandler = (e) => {
            try {
                if (!e) return;
                const key = e.key || e.code || '';
                if (key === 'Escape' || key === 'Esc') {
                    e.preventDefault();
                    e.stopPropagation();
                    animateOut();
                }
            } catch (_) {}
        };
        document.addEventListener('keydown', popup.__nelouraEscHandler, true);
    } catch (_) {}
    Object.assign(popup.style, {
        position: 'fixed', top: '50%', left: '50%', transform: baseTransform,
        backgroundColor: '#333', border: '1px solid #555', borderRadius: '5px',
        padding: '15px', zIndex: '3600', width: '700px',
        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)', boxSizing: 'border-box'
    });
    
    // Add custom styles for sliders and dropdowns
    const customStyles = document.createElement('style');
    customStyles.textContent = `
        #region-style-popup input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none; appearance: none; width: 16px; height: 16px;
            border-radius: 50%; background: #007bff; cursor: pointer;
        }
        #region-style-popup input[type="range"]::-moz-range-thumb {
            width: 16px; height: 16px; border-radius: 50%; background: #007bff; cursor: pointer; border: none;
        }
        .custom-dropdown-list {
            position: absolute; background-color: #3c3c3c; border: 1px solid #555;
            border-top: none; z-index: 3601; max-height: 150px; overflow-y: auto;
            width: 100%; box-sizing: border-box; left: 0;
        }
        .custom-dropdown-list .dropdown-item {
            display: flex; align-items: center; justify-content: space-between;
            padding: 8px; cursor: pointer; border-bottom: 1px solid #555;
            font-size: 13px; color: #fff;
        }
        .custom-dropdown-list .dropdown-item:last-child { border-bottom: none; }
        .custom-dropdown-list .dropdown-item:hover { background-color: #555; }
        .colormap-preview {
            width: 80px; height: 12px; border: 1px solid #777; border-radius: 3px;
        }
    `;
    popup.appendChild(customStyles);

    const title = document.createElement('h3');
    title.innerHTML = 'Region Style Settings';
    Object.assign(title.style, { margin: '0 0 15px 0', color: '#fff', fontFamily: 'Arial, sans-serif', fontSize: '18px', fontWeight: 'bold', borderBottom: '1px solid #555', paddingBottom: '10px', cursor: 'grab' });

    const catalogNameDisplay = document.createElement('div');
    catalogNameDisplay.textContent = `Catalog: ${catalogNameForApi}`; // Show the API name to user
    Object.assign(catalogNameDisplay.style, { color: '#4CAF50', fontSize: '14px', marginBottom: '4px' });

    // Also show the currently selected FITS file, similar to the scaling controls popup
    const fitsLabel = document.createElement('div');
    // Prefer the active pane's image (multi-panel), otherwise fall back to top-level image
    let fitsContext = hostWindow;
    try {
        if (hostWindow && typeof hostWindow.getActivePaneWindow === 'function') {
            const paneWin = hostWindow.getActivePaneWindow();
            if (paneWin && (paneWin.fitsData || paneWin.currentFitsFile)) {
                fitsContext = paneWin;
            }
        }
    } catch (_) {}
    const currentFitsName =
        (fitsContext && fitsContext.fitsData && (fitsContext.fitsData.filename || fitsContext.fitsData.filepath || fitsContext.fitsData.filePath)) ||
        (fitsContext && fitsContext.currentFitsFile) ||
        (hostWindow && hostWindow.fitsData && (hostWindow.fitsData.filename || hostWindow.fitsData.filepath || hostWindow.fitsData.filePath)) ||
        (hostWindow && hostWindow.currentFitsFile) ||
        'Current image';
    fitsLabel.textContent = `Image: ${currentFitsName}`;
    Object.assign(fitsLabel.style, { color: '#9CA3AF', fontSize: '13px', marginBottom: '10px' });
    
    const closeButton = document.createElement('button');
    closeButton.textContent = '×';
    Object.assign(closeButton.style, { position: 'absolute', top: '10px', right: '10px', backgroundColor: 'transparent', border: 'none', color: '#aaa', fontSize: '20px', cursor: 'pointer', padding: '0', width: '24px', height: '24px', lineHeight: '24px', textAlign: 'center', borderRadius: '12px' });
    closeButton.addEventListener('click', () => { try { animateOut(); } catch (_) { if (popup && popup.parentNode) popup.parentNode.removeChild(popup); } });

    const columnsContainer = document.createElement('div');
    Object.assign(columnsContainer.style, { display: 'flex', flexDirection: 'row', gap: '20px', marginBottom: '15px' });

    const leftColumn = document.createElement('div');
    Object.assign(leftColumn.style, { flex: '1', display: 'flex', flexDirection: 'column', gap: '15px' });
    const rightColumn = document.createElement('div');
    Object.assign(rightColumn.style, { flex: '1', display: 'flex', flexDirection: 'column', gap: '15px' });
    
    function createFieldSet(legendText) {
        const fieldset = document.createElement('fieldset');
        Object.assign(fieldset.style, { border: '1px solid #555', borderRadius: '4px', padding: '10px', margin: '0', display: 'flex', flexDirection: 'column', gap: '10px' });
        const legend = document.createElement('legend');
        legend.textContent = legendText;
        Object.assign(legend.style, { color: '#ccc', padding: '0 5px', fontSize: '14px' });
        fieldset.appendChild(legend);
        return fieldset;
    }

    const inputStyle = { width: '100%', padding: '6px', backgroundColor: '#444', color: 'white', border: '1px solid #555', borderRadius: '3px', boxSizing: 'border-box', fontSize: '13px' };

    function createSearchableDropdown(label) {
        const container = document.createElement('div');
        container.style.position = 'relative';
        const labelElement = document.createElement('label');
        labelElement.textContent = label;
        Object.assign(labelElement.style, { display: 'block', marginBottom: '5px', color: '#aaa', fontFamily: 'Arial, sans-serif', fontSize: '13px' });
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        Object.assign(searchInput.style, inputStyle);
        const dropdownList = document.createElement('div');
        dropdownList.className = 'custom-dropdown-list';
        dropdownList.style.display = 'none';
        const hiddenSelect = document.createElement('select');
        hiddenSelect.style.display = 'none';
        searchInput.addEventListener('input', () => {
            const filter = searchInput.value.toLowerCase();
            Array.from(dropdownList.children).forEach(item => {
                item.style.display = item.textContent.toLowerCase().includes(filter) ? '' : 'none';
            });
        });
        searchInput.addEventListener('focus', () => dropdownList.style.display = 'block');
        document.addEventListener('click', (e) => {
            if (!container.contains(e.target)) dropdownList.style.display = 'none';
        });
        container.appendChild(labelElement);
        container.appendChild(searchInput);
        container.appendChild(dropdownList);
        container.appendChild(hiddenSelect);
        return { container, searchInput, dropdownList, hiddenSelect };
    }
    
    function createStyledDropdown(label, options) {
        const container = document.createElement('div');
        container.style.position = 'relative';
        const labelElement = document.createElement('label');
        labelElement.textContent = label;
        Object.assign(labelElement.style, { display: 'block', marginBottom: '5px', color: '#aaa', fontFamily: 'Arial, sans-serif', fontSize: '13px' });
        const visibleDisplay = document.createElement('div');
        Object.assign(visibleDisplay.style, inputStyle, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' });
        const dropdownList = document.createElement('div');
        dropdownList.className = 'custom-dropdown-list';
        dropdownList.style.display = 'none';
        const hiddenSelect = document.createElement('select');
        hiddenSelect.style.display = 'none';
        visibleDisplay.addEventListener('click', () => {
            dropdownList.style.display = dropdownList.style.display === 'none' ? 'block' : 'none';
        });
        document.addEventListener('click', (e) => {
            if (!container.contains(e.target)) dropdownList.style.display = 'none';
        });
        const updateVisibleDisplay = (value) => {
            const selectedOption = options.find(opt => opt.value === value);
            if (selectedOption) {
                visibleDisplay.innerHTML = `<span>${selectedOption.text}</span><div class="colormap-preview" style="background: ${selectedOption.gradient};"></div>`;
            }
        };
        options.forEach(opt => {
            const optionEl = document.createElement('option');
            optionEl.value = opt.value;
            optionEl.textContent = opt.text;
            hiddenSelect.appendChild(optionEl);
            const item = document.createElement('div');
            item.className = 'dropdown-item';
            item.innerHTML = `<span>${opt.text}</span><div class="colormap-preview" style="background: ${opt.gradient};"></div>`;
            item.addEventListener('click', () => {
                hiddenSelect.value = opt.value;
                updateVisibleDisplay(opt.value);
                dropdownList.style.display = 'none';
                hiddenSelect.dispatchEvent(new Event('change'));
            });
            dropdownList.appendChild(item);
        });
        if (options.length > 0) {
            hiddenSelect.value = options[0].value;
            updateVisibleDisplay(options[0].value);
            setTimeout(() => hiddenSelect.dispatchEvent(new Event('change')), 0);
        }
        container.appendChild(labelElement);
        container.appendChild(visibleDisplay);
        container.appendChild(dropdownList);
        container.appendChild(hiddenSelect);
        return { container, hiddenSelect };
    }

    const coordsFieldSet = createFieldSet('Coordinate & Size Settings');
    const raDropdown = createSearchableDropdown('RA Column:');
    const decDropdown = createSearchableDropdown('Dec Column:');
    const sizeDropdown = createSearchableDropdown('Size Column (arcsec):');
    const colorCodeDropdown = createSearchableDropdown('Color Code Column:');
    colorCodeDropdown.searchInput.value = 'No color coding';
    // Display selected size value (arcsec) and pixel equivalent
    let lastSizeMedianArcsec = null;
    const medianCache = Object.create(null); // key: `${catalog}|${column}` -> median arcsec
    const medianPending = Object.create(null); // key -> true while fetching
    const sizeInfo = document.createElement('div');
    const sizeValueText = document.createElement('div');
    const sizePixelText = document.createElement('div');
    Object.assign(sizeInfo.style, { marginTop: '6px', color: '#cfe6ff', fontFamily: 'Arial, sans-serif', fontSize: '12px' });
    sizeInfo.appendChild(sizeValueText);
    sizeInfo.appendChild(sizePixelText);
    function toggleSizeControls(show) {
        // Always keep the Size Column dropdown visible so users can make a selection.
        try { sizeDropdown.container.style.display = ''; } catch(_){}
        // Only hide/show the computed size summary block.
        sizeInfo.style.display = show ? '' : 'none';
    }
    toggleSizeControls(true);
    const radiusInput = document.createElement('input');
    radiusInput.type = 'number';
    radiusInput.min = '0';
    radiusInput.step = '0.1';
    Object.assign(radiusInput.style, inputStyle);
    const radiusGroup = document.createElement('div');
    const radiusLabel = document.createElement('label');
    radiusLabel.textContent = 'Radius (arcsec):';
    Object.assign(radiusLabel.style, { display: 'block', marginBottom: '5px', color: '#aaa', fontFamily: 'Arial, sans-serif', fontSize: '13px' });
    // Pixel scale info (arcsec/pixel) and live pixel conversion helper
    const pixelScaleInfo = document.createElement('div');
    const pixelScaleText = document.createElement('div');
    const pixelRadiusText = document.createElement('div');
    Object.assign(pixelScaleInfo.style, { marginTop: '6px', color: '#9ecbff', fontFamily: 'Arial, sans-serif', fontSize: '12px' });
    pixelScaleInfo.appendChild(pixelScaleText);
    pixelScaleInfo.appendChild(pixelRadiusText);
    function getArcsecPerPixel() {
        try {
            const w = window?.fitsData?.wcs;
            if (!w) {
                try { console.log('[RegionStyle] getArcsecPerPixel: window.fitsData.wcs missing'); } catch (_) {}
                return null;
            }
            // Prefer CD matrix; fall back to CDELT if needed
            const cd11 = Number(w.CD1_1 ?? w.cd11 ?? w.CDELT1 ?? w.cdelt1 ?? 0);
            const cd12 = Number(w.CD1_2 ?? w.cd12 ?? 0);
            const cd21 = Number(w.CD2_1 ?? w.cd21 ?? 0);
            const cd22 = Number(w.CD2_2 ?? w.cd22 ?? w.CDELT2 ?? w.cdelt2 ?? 0);
            // Pixel scale along X and Y in deg/pixel
            const scaleXDeg = Math.sqrt(cd11*cd11 + cd21*cd21);
            const scaleYDeg = Math.sqrt(cd12*cd12 + cd22*cd22);
            let arcsecPerPixel = 3600 * (isFinite(scaleXDeg) && isFinite(scaleYDeg) && scaleXDeg>0 && scaleYDeg>0
                ? (scaleXDeg + scaleYDeg) / 2
                : (isFinite(scaleXDeg) && scaleXDeg>0 ? scaleXDeg : (isFinite(scaleYDeg) && scaleYDeg>0 ? scaleYDeg : 0.0)));
            if (!(arcsecPerPixel > 0)) return null;
            try { console.log('[RegionStyle] getArcsecPerPixel:', { cd11, cd12, cd21, cd22, scaleXDeg, scaleYDeg, arcsecPerPixel }); } catch (_) {}
            return arcsecPerPixel;
        } catch (_) { return null; }
    }
    function computeMedian(nums) {
        if (!Array.isArray(nums) || nums.length === 0) return null;
        const arr = nums.slice().sort((a,b)=>a-b);
        const mid = Math.floor(arr.length/2);
        return (arr.length % 2) ? arr[mid] : (arr[mid-1] + arr[mid]) / 2;
    }

    async function refreshSizeSummary(asp) {
        try { console.log('[RegionStyle] refreshSizeSummary called with asp:', asp); } catch (_) {}
        try {
            let sizeCol = sizeDropdown.hiddenSelect.value;
            const cat = currentCatalogNameForApi || catalogNameForApi || '';
            const cacheKey = `${cat}|${sizeCol}`;
            let values = [];
            // If no size column selected, hide summary and exit (no overlay-based text)
            if (!sizeCol) {
                toggleSizeControls(false);
                sizeValueText.textContent = '';
                sizePixelText.textContent = '';
                lastSizeMedianArcsec = null;
                try { console.log('[RegionStyle] No size column selected — hiding controls'); } catch (_) {}
                return;
            }
            if (Array.isArray(window.catalogDataWithFlags) && window.catalogDataWithFlags.length > 0 && window.catalogDataWithFlagsName === cat) {
                try { console.log('[RegionStyle] Using in-memory records for median. count=', window.catalogDataWithFlags.length, 'sizeCol=', sizeCol); } catch (_) {}
                values = window.catalogDataWithFlags.map(r => parseFloat(r[sizeCol])).filter(v => isFinite(v) && v > 0);
            } else if (Array.isArray(window.catalogDataWithFlags) && window.catalogDataWithFlags.length > 0 && window.catalogDataWithFlagsName !== cat) {
                // Stale cache from a previous catalog — ignore and clear to prevent confusion
                try { console.log('[RegionStyle] Ignoring stale in-memory records from', window.catalogDataWithFlagsName, 'expected', cat); } catch(_){}
                window.catalogDataWithFlags = null;
                window.catalogDataWithFlagsName = null;
            } else if (typeof cat === 'string' && cat.length > 0) {
                // Try cache first to avoid repeated requests
                if (cacheKey in medianCache) {
                    const cached = medianCache[cacheKey];
                    if (typeof cached === 'number' && isFinite(cached)) {
                        values = [cached];
                        try { console.log('[RegionStyle] Using cached median arcsec=', cached, 'for', cacheKey); } catch (_) {}
                    }
                } else if (!medianPending[cacheKey]) {
                    // Fallback: ask server for column analysis (returns JSON with median)
                    const url = `/catalog-column-analysis/${encodeURIComponent(cat)}/${encodeURIComponent(sizeCol)}?sample_size=2000`;
                    medianPending[cacheKey] = true;
                    try { console.log('[RegionStyle] Fetching column analysis for median:', url); } catch (_) {}
                    try {
                        const resp = await apiFetch(url);
                        try { console.log('[RegionStyle] Analysis fetch status:', resp.status, resp.statusText); } catch (_) {}
                        if (resp.ok) {
                            const data = await resp.json();
                            const median = data?.numeric_stats?.median;
                            if (typeof median === 'number' && isFinite(median)) {
                                medianCache[cacheKey] = median;
                                values = [median];
                                try { console.log('[RegionStyle] Analysis median arcsec=', median); } catch (_) {}
                            } else {
                                try { console.log('[RegionStyle] Analysis missing numeric_stats.median'); } catch (_) {}
                            }
                        }
                    } finally {
                        delete medianPending[cacheKey];
                    }
                } else {
                    // Already fetching; skip this cycle
                    try { console.log('[RegionStyle] Analysis fetch already pending for', cacheKey); } catch (_) {}
                    return;
                }
            }

            if (values.length > 0 && asp && asp > 0) {
                const medianArcsec = computeMedian(values);
                const medianPix = medianArcsec / asp;
                try { console.log('[RegionStyle] Median computed:', { sizeCol, count: values.length, medianArcsec, medianPix, asp }); } catch (_) {}
                lastSizeMedianArcsec = medianArcsec;
                toggleSizeControls(true);
                sizeValueText.textContent = `Size column (${sizeCol}) median: ${medianArcsec.toFixed(3)} arcsec`;
                sizePixelText.textContent = `≈ ${medianPix.toFixed(2)} px`;
            } else {
                try { console.log('[RegionStyle] No values or asp not ready — hiding size controls', { valuesCount: values.length, asp }); } catch (_) {}
                toggleSizeControls(false);
                sizeValueText.textContent = '';
                sizePixelText.textContent = '';
            }
        } catch (_) {
            try { console.log('[RegionStyle] refreshSizeSummary threw'); } catch (_) {}
            toggleSizeControls(false);
            sizeValueText.textContent = '';
            sizePixelText.textContent = '';
        }
    }

    async function refreshPixelScaleReadout() {
        const asp = getArcsecPerPixel();
        try { console.log('[RegionStyle] refreshPixelScaleReadout asp=', asp); } catch (_) {}
        if (asp) {
            pixelScaleText.textContent = `Pixel size: ${asp.toFixed(4)} arcsec/pixel`;
            const rArcsec = parseFloat(radiusInput.value);
            try { console.log('[RegionStyle] Radius arcsec input=', rArcsec); } catch (_) {}
            if (isFinite(rArcsec) && rArcsec > 0) {
                const rPix = rArcsec / asp;
                try { console.log('[RegionStyle] Radius px=', rPix); } catch (_) {}
                pixelRadiusText.textContent = `Radius ≈ ${rPix.toFixed(2)} px`;
            } else {
                pixelRadiusText.textContent = '';
            }
            // Update size column summary (median arcsec and pixel)
            await refreshSizeSummary(asp);
        } else {
            pixelScaleText.textContent = 'Pixel size: (unknown - WCS not ready)';
            pixelRadiusText.textContent = '';
            toggleSizeControls(false);
            sizeValueText.textContent = '';
            sizePixelText.textContent = '';
        }
    }
    radiusInput.addEventListener('input', refreshPixelScaleReadout);
    // Update size summary when size column selection changes, and toggle radius editability
    sizeDropdown.hiddenSelect.addEventListener('change', () => {
        const hasSize = !!sizeDropdown.hiddenSelect.value;
        // Disable manual radius when a size column is chosen
        radiusInput.disabled = hasSize;
        radiusInput.style.opacity = hasSize ? '0.6' : '1';
        radiusInput.style.pointerEvents = hasSize ? 'none' : 'auto';
        refreshPixelScaleReadout();
    });
    // Initial attempt and light polling to handle WCS arriving after popup opens
    setTimeout(refreshPixelScaleReadout, 0);
    (function pollWcsReady(maxTries = 12, intervalMs = 500) {
        let tries = 0;
        const timer = setInterval(() => {
            tries++;
            refreshPixelScaleReadout();
            const hasWcs = !!(window?.parsedWCS?.hasWCS || window?.fitsData?.wcs);
            if (hasWcs || tries >= maxTries) clearInterval(timer);
        }, intervalMs);
    })();
    // Also refresh once when WCS becomes available (event-driven)
    try {
        const onWcsReady = () => {
            try { console.log('[RegionStyle] wcs-ready event received'); } catch(_) {}
            refreshPixelScaleReadout();
        };
        window.addEventListener('wcs-ready', onWcsReady, { once: true });
    } catch (_) {}
    radiusGroup.appendChild(radiusLabel);
    radiusGroup.appendChild(radiusInput);
    radiusGroup.appendChild(pixelScaleInfo);
    coordsFieldSet.appendChild(raDropdown.container);
    coordsFieldSet.appendChild(decDropdown.container);
    coordsFieldSet.appendChild(sizeDropdown.container);
    coordsFieldSet.appendChild(sizeInfo);
    coordsFieldSet.appendChild(radiusGroup);
    coordsFieldSet.appendChild(colorCodeDropdown.container);
    leftColumn.appendChild(coordsFieldSet);

    const styleFieldSet = createFieldSet('Region Style');
    // Shape selector (Circle / Hexagon)
    const shapeGroup = document.createElement('div');
    const shapeLabel = document.createElement('label');
    shapeLabel.textContent = 'Shape:';
    Object.assign(shapeLabel.style, { display: 'block', marginBottom: '6px', color: '#aaa', fontFamily: 'Arial, sans-serif', fontSize: '13px' });

    const shapeButtons = document.createElement('div');
    Object.assign(shapeButtons.style, { display: 'flex', gap: '10px' });

    const mkShapeBtn = (shape) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.title = shape === 'hexagon' ? 'Hexagon' : 'Circle';
        Object.assign(btn.style, {
            width: '44px',
            height: '36px',
            borderRadius: '10px',
            border: '1px solid rgba(255,255,255,0.18)',
            background: 'rgba(255,255,255,0.06)',
            color: '#fff',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center'
        });
        btn.innerHTML = (shape === 'hexagon')
            ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                 <polygon points="12,2 20,7 20,17 12,22 4,17 4,7"
                          stroke="currentColor" stroke-width="2" stroke-linejoin="round" fill="none"></polygon>
               </svg>`
            : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                 <circle cx="12" cy="12" r="7.5" stroke="currentColor" stroke-width="2"></circle>
               </svg>`;
        btn.dataset.shape = shape;
        return btn;
    };

    const circleBtn = mkShapeBtn('circle');
    const hexBtn = mkShapeBtn('hexagon');
    shapeButtons.appendChild(circleBtn);
    shapeButtons.appendChild(hexBtn);
    shapeGroup.appendChild(shapeLabel);
    shapeGroup.appendChild(shapeButtons);
    styleFieldSet.appendChild(shapeGroup);

    const manualColorContainer = document.createElement('div');
    const borderColorInput = document.createElement('input');
    borderColorInput.type = 'color';
    borderColorInput.value = regionStyles.borderColor;
    Object.assign(borderColorInput.style, { width: '100%', height: '30px', cursor: 'pointer', ...inputStyle, padding: '2px' });
    const borderColorGroup = document.createElement('div');
    const borderColorLabel = document.createElement('label');
    borderColorLabel.textContent = 'Border Color:';
    Object.assign(borderColorLabel.style, { display: 'block', marginBottom: '5px', color: '#aaa', fontFamily: 'Arial, sans-serif', fontSize: '13px' });
    borderColorGroup.appendChild(borderColorLabel);
    borderColorGroup.appendChild(borderColorInput);
    manualColorContainer.appendChild(borderColorGroup);
    const bgColorContainer = document.createElement('div');
    Object.assign(bgColorContainer.style, { display: 'flex', alignItems: 'center', gap: '10px' });
    const bgColorInput = document.createElement('input');
    bgColorInput.type = 'color';
    bgColorInput.value = regionStyles.backgroundColor === 'transparent' ? '#ffffff' : regionStyles.backgroundColor;
    Object.assign(bgColorInput.style, { flexGrow: '1', height: '30px', cursor: 'pointer', ...inputStyle, padding: '2px' });
    const transparentCheckbox = document.createElement('input');
    transparentCheckbox.type = 'checkbox';
    transparentCheckbox.checked = regionStyles.backgroundColor === 'transparent';
    const transparentLabel = document.createElement('label');
    transparentLabel.textContent = 'Transparent Fill';
    Object.assign(transparentLabel.style, { color: '#aaa', fontFamily: 'Arial, sans-serif', fontSize: '13px', cursor: 'pointer' });
    bgColorContainer.appendChild(bgColorInput);
    bgColorContainer.appendChild(transparentCheckbox);
    bgColorContainer.appendChild(transparentLabel);
    const bgColorGroup = document.createElement('div');
    const bgColorLabel = document.createElement('label');
    bgColorLabel.textContent = 'Fill Color:';
    Object.assign(bgColorLabel.style, { display: 'block', marginBottom: '5px', color: '#aaa', fontFamily: 'Arial, sans-serif', fontSize: '13px' });
    bgColorGroup.appendChild(bgColorLabel);
    bgColorGroup.appendChild(bgColorContainer);
    manualColorContainer.appendChild(bgColorGroup);
    styleFieldSet.appendChild(manualColorContainer);
    const colorMapDropdown = createStyledDropdown('Color Map (for color-coded regions):', REGION_COLOR_MAPS);
    colorMapDropdown.container.style.display = 'none';
    try {
        colorMapDropdown.hiddenSelect.value = regionStyles.colorMapName || REGION_COLOR_MAPS[0].value;
        setTimeout(() => colorMapDropdown.hiddenSelect.dispatchEvent(new Event('change')), 0);
    } catch (_) {}
    styleFieldSet.appendChild(colorMapDropdown.container);
    const borderWidthContainer = document.createElement('div');
    Object.assign(borderWidthContainer.style, { display: 'flex', alignItems: 'center', gap: '10px' });
    const borderWidthSlider = document.createElement('input');
    borderWidthSlider.type = 'range';
    borderWidthSlider.min = '1';
    borderWidthSlider.max = '10';
    borderWidthSlider.step = '1';
    borderWidthSlider.value = regionStyles.borderWidth;
    Object.assign(borderWidthSlider.style, { flex: '1', height: '8px', appearance: 'none', backgroundColor: '#555', borderRadius: '4px', outline: 'none', cursor: 'pointer' });
    const borderWidthValue = document.createElement('span');
    borderWidthValue.textContent = regionStyles.borderWidth + 'px';
    borderWidthValue.style.color = '#fff';
    borderWidthSlider.addEventListener('input', () => { borderWidthValue.textContent = borderWidthSlider.value + 'px'; updatePreview(); });
    borderWidthContainer.appendChild(borderWidthSlider);
    borderWidthContainer.appendChild(borderWidthValue);
    const borderWidthGroup = document.createElement('div');
    const borderWidthLabel = document.createElement('label');
    borderWidthLabel.textContent = 'Border Width:';
    Object.assign(borderWidthLabel.style, { display: 'block', marginBottom: '5px', color: '#aaa', fontFamily: 'Arial, sans-serif', fontSize: '13px' });
    borderWidthGroup.appendChild(borderWidthLabel);
    borderWidthGroup.appendChild(borderWidthContainer);
    styleFieldSet.appendChild(borderWidthGroup);
    const opacityContainer = document.createElement('div');
    Object.assign(opacityContainer.style, { display: 'flex', alignItems: 'center', gap: '10px' });
    const opacitySlider = document.createElement('input');
    opacitySlider.type = 'range';
    opacitySlider.min = '0.1';
    opacitySlider.max = '1';
    opacitySlider.step = '0.05';
    opacitySlider.value = regionStyles.opacity;
    Object.assign(opacitySlider.style, { flex: '1', height: '8px', appearance: 'none', backgroundColor: '#555', borderRadius: '4px', outline: 'none', cursor: 'pointer' });
    const opacityValue = document.createElement('span');
    opacityValue.textContent = regionStyles.opacity;
    opacitySlider.addEventListener('input', () => { opacityValue.textContent = opacitySlider.value; updatePreview(); });
    opacityContainer.appendChild(opacitySlider);
    opacityContainer.appendChild(opacityValue);
    const opacityGroup = document.createElement('div');
    const opacityLabel = document.createElement('label');
    opacityLabel.textContent = 'Opacity:';
    Object.assign(opacityLabel.style, { display: 'block', marginBottom: '5px', color: '#aaa', fontFamily: 'Arial, sans-serif', fontSize: '13px' });
    opacityGroup.appendChild(opacityLabel);
    opacityGroup.appendChild(opacityContainer);
    styleFieldSet.appendChild(opacityGroup);
    rightColumn.appendChild(styleFieldSet);
    const previewFieldSet = createFieldSet('Preview');
    const previewContainer = document.createElement('div');
    Object.assign(previewContainer.style, { height: '96px', backgroundColor: '#2e2e2e', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #555', overflow: 'hidden' });
    const previewMarker = document.createElement('div');
    // SVG-based preview (avoids CSS hexagon aspect ratio issues + ensures border width updates reliably)
    Object.assign(previewMarker.style, { width: '72px', height: '72px', opacity: regionStyles.opacity, transition: 'opacity 0.15s ease' });
    previewContainer.appendChild(previewMarker);
    previewFieldSet.appendChild(previewContainer);
    rightColumn.appendChild(previewFieldSet);

    function populateDropdowns(catalogNameParam) {
        const dropdowns = [raDropdown, decDropdown, sizeDropdown, colorCodeDropdown];
        dropdowns.forEach(dd => {
            dd.dropdownList.innerHTML = '<div class="dropdown-item">Loading...</div>';
            dd.hiddenSelect.innerHTML = '';
        });

        // FIXED: Use the API-compatible catalog name
        console.log('populateDropdowns called with:', catalogNameParam);
        console.log('Using catalogNameForApi:', catalogNameForApi);

        apiFetch(`/catalog-columns/?catalog_name=${encodeURIComponent(catalogNameForApi)}`)
            .then(response => { 
                if (!response.ok) {
                    throw new Error(`Failed to load columns: ${response.status} - ${response.statusText}`);
                }
                return response.json(); 
            })
            .then(data => {
                const allColumns = data.columns || [];
                dropdowns.forEach(dd => dd.dropdownList.innerHTML = '');

                const addOption = (dropdown, value, text) => {
                    const option = document.createElement('option');
                    option.value = value;
                    option.textContent = text;
                    dropdown.hiddenSelect.appendChild(option);

                    const item = document.createElement('div');
                    item.className = 'dropdown-item';
                    item.textContent = text;
                    item.dataset.value = value;
                    item.addEventListener('click', () => {
                        dropdown.hiddenSelect.value = value;
                        dropdown.searchInput.value = text;
                        dropdown.dropdownList.style.display = 'none';
                        dropdown.hiddenSelect.dispatchEvent(new Event('change'));
                    });
                    dropdown.dropdownList.appendChild(item);
                };

            addOption(sizeDropdown, '', 'No size column');
            addOption(colorCodeDropdown, '', 'No color coding');

                allColumns.forEach(colName => {
                [raDropdown, decDropdown, sizeDropdown, colorCodeDropdown].forEach(dd => addOption(dd, colName, colName));
                });
                
                const findDefaultColumn = (columns, keywords) => {
                    for (const keyword of keywords) {
                        try {
                            const regex = new RegExp(`^${keyword}$`, 'i');
                            const match = columns.find(c => regex.test(c));
                            if (match) return match;
                        } catch (e) { console.error(`Invalid regex keyword: ${keyword}`, e); }
                    }
                    for (const keyword of keywords) {
                        const match = columns.find(c => c.toLowerCase().includes(keyword));
                        if (match) return match;
                    }
                    return null;
                };

                const raKeywords = ['ra', 'right_ascension'];
                const decKeywords = ['dec', 'declination'];
                const sizeKeywords = ['radius', 'size', 'rad', 'fwhm', 'bmaj', 'maj'];

            if (allColumns.length > 0) {
                const defaultRa = findDefaultColumn(allColumns, raKeywords) || allColumns[0];
                raDropdown.searchInput.value = defaultRa;
                raDropdown.hiddenSelect.value = defaultRa;
                
                const defaultDec = findDefaultColumn(allColumns, decKeywords) || (allColumns.length > 1 ? allColumns[1] : allColumns[0]);
                decDropdown.searchInput.value = defaultDec;
                decDropdown.hiddenSelect.value = defaultDec;

                const defaultSize = findDefaultColumn(allColumns, sizeKeywords);
                sizeDropdown.searchInput.value = defaultSize || 'No size column';
                sizeDropdown.hiddenSelect.value = defaultSize || '';
                sizeDropdown.hiddenSelect.dispatchEvent(new Event('change'));
            }

            colorCodeDropdown.searchInput.value = 'No color coding';
            colorCodeDropdown.hiddenSelect.value = '';
            colorCodeDropdown.hiddenSelect.dispatchEvent(new Event('change'));
            })
            .catch(error => {
                console.error('Error populating dropdowns:', error);
                dropdowns.forEach(dd => {
                    dd.dropdownList.innerHTML = '<div class="dropdown-item">Error loading</div>';
                });
            });
    }
    
    // FIXED: Call populateDropdowns with the API-compatible name
    populateDropdowns(catalogNameForApi);

    sizeDropdown.hiddenSelect.addEventListener('change', () => {
        const hasSizeColumn = sizeDropdown.hiddenSelect.value !== '';
        radiusInput.disabled = false;
        radiusInput.style.opacity = '1';
        if (hasSizeColumn && radiusInput.value) {
            // radiusInput.value = '';
        }
        refreshPixelScaleReadout();
    });
    colorCodeDropdown.hiddenSelect.addEventListener('change', () => {
        updateColorModeUI();
    });
    colorMapDropdown.hiddenSelect.addEventListener('change', updatePreview);
    updateColorModeUI();
    
    function updateColorModeUI() {
        const hasColorCode = !!colorCodeDropdown.hiddenSelect.value;
        manualColorContainer.style.display = hasColorCode ? 'none' : '';
        [borderColorInput, bgColorInput].forEach((input) => {
            if (!input) return;
            input.disabled = hasColorCode;
            input.style.opacity = hasColorCode ? '0.6' : '1';
        });
        transparentCheckbox.disabled = hasColorCode;
        colorMapDropdown.container.style.display = hasColorCode ? '' : 'none';
        updatePreview();
    }

    function updatePreview() {
        const usingColorCode = !!colorCodeDropdown.hiddenSelect.value;
        const shape = regionStyles.shape === 'hexagon' ? 'hexagon' : 'circle';
        const borderWidth = Math.max(1, Number(borderWidthSlider.value) || 2);
        const opacityVal = Math.max(0, Math.min(1, Number(opacitySlider.value) || 0.8));

        // Resolve fill + stroke colors
        let strokeColor = borderColorInput.value || '#ffffff';
        let fillValue = transparentCheckbox.checked ? 'transparent' : (bgColorInput.value || 'transparent');
        let gradientStops = null;
        if (usingColorCode) {
            const mapDef = getColorMapDefinition(colorMapDropdown.hiddenSelect.value);
            strokeColor = '#ffffff';
            gradientStops = (mapDef && Array.isArray(mapDef.colors)) ? mapDef.colors : null;
            fillValue = gradientStops ? 'url(#previewGradient)' : '#777';
        }

        previewMarker.style.opacity = String(opacityVal);

        // SVG render (regular pointy-top hexagon / circle)
        const pad = Math.min(18, 6 + borderWidth); // keeps stroke inside viewBox
        const r = 50 - pad;
        const xOff = r * Math.sqrt(3) / 2;
        const yOff = r / 2;
        const points = [
            [50, 50 - r],
            [50 + xOff, 50 - yOff],
            [50 + xOff, 50 + yOff],
            [50, 50 + r],
            [50 - xOff, 50 + yOff],
            [50 - xOff, 50 - yOff],
        ].map(p => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');

        const defs = gradientStops
            ? `<defs>
                 <linearGradient id="previewGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                   ${gradientStops.map((c, i) => {
                       const pct = gradientStops.length === 1 ? 0 : (i / (gradientStops.length - 1)) * 100;
                       return `<stop offset="${pct.toFixed(2)}%" stop-color="${c}"></stop>`;
                   }).join('')}
                 </linearGradient>
               </defs>`
            : '';

        const shapeEl = (shape === 'hexagon')
            ? `<polygon points="${points}" fill="${fillValue}" stroke="${strokeColor}" stroke-width="${borderWidth}" stroke-linejoin="round"></polygon>`
            : `<circle cx="50" cy="50" r="${r}" fill="${fillValue}" stroke="${strokeColor}" stroke-width="${borderWidth}"></circle>`;

        previewMarker.innerHTML = `<svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true" style="display:block;">
            ${defs}
            ${shapeEl}
        </svg>`;
    }
    

    const updateShapeButtons = () => {
        const current = regionStyles.shape === 'hexagon' ? 'hexagon' : 'circle';
        [circleBtn, hexBtn].forEach((btn) => {
            const active = btn.dataset.shape === current;
            btn.style.background = active ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)';
            btn.style.borderColor = active ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.18)';
        });
    };
    circleBtn.addEventListener('click', () => { regionStyles.shape = 'circle'; updateShapeButtons(); updatePreview(); });
    hexBtn.addEventListener('click', () => { regionStyles.shape = 'hexagon'; updateShapeButtons(); updatePreview(); });
    // Default selection: circle
    if (!regionStyles.shape) regionStyles.shape = 'circle';
    updateShapeButtons();
    [borderColorInput, bgColorInput, transparentCheckbox, borderWidthSlider, opacitySlider].forEach(el => el.addEventListener('input', updatePreview));

    const actionsContainer = document.createElement('div');
    Object.assign(actionsContainer.style, { display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '15px', borderTop: '1px solid #555' });
    
    const viewCatalogButton = document.createElement('button');
    viewCatalogButton.textContent = 'View Catalog';
    Object.assign(viewCatalogButton.style, { padding: '8px 16px', border: '1px solid #666', borderRadius: '4px', backgroundColor: '#555', color: '#fff', cursor: 'pointer', marginRight: 'auto' });
    viewCatalogButton.onclick = (e) => {
        e.preventDefault();
        try {
            const key = catalogNameForApi.startsWith('catalogs/') ? catalogNameForApi.replace('catalogs/', '') : catalogNameForApi;
            if (window.catalogBinaryCache && window.catalogBinaryCache[key]) {
                delete window.catalogBinaryCache[key];
            }
        } catch (_) {}
        // Open the catalog viewer in the TOP document so it doesn't appear behind the region style popup.
        try {
            const w = hostWindow || window.top || window;
            if (w && typeof w.showCatalogViewer === 'function') {
                w.showCatalogViewer(catalogNameForApi);
            } else if (typeof showCatalogViewer === 'function') {
                showCatalogViewer(catalogNameForApi);
            }
        } catch (_) {
            try { if (typeof showCatalogViewer === 'function') showCatalogViewer(catalogNameForApi); } catch (_) {}
        }
    };

    const applyButton = document.createElement('button');
    applyButton.textContent = 'Apply';
    Object.assign(applyButton.style, { padding: '8px 16px', border: 'none', borderRadius: '4px', backgroundColor: '#4CAF50', color: '#fff', cursor: 'pointer' });
    

    applyButton.addEventListener('click', () => {
        // Compute pixel scale and radius in pixels
        const arcsecPerPixel = (function(){
            try {
                const w = window?.fitsData?.wcs;
                if (!w) return null;
                const cd11 = Number(w.CD1_1 ?? w.cd11 ?? w.CDELT1 ?? w.cdelt1 ?? 0);
                const cd12 = Number(w.CD1_2 ?? w.cd12 ?? 0);
                const cd21 = Number(w.CD2_1 ?? w.cd21 ?? 0);
                const cd22 = Number(w.CD2_2 ?? w.cd22 ?? w.CDELT2 ?? w.cdelt2 ?? 0);
                const scaleXDeg = Math.sqrt(cd11*cd11 + cd21*cd21);
                const scaleYDeg = Math.sqrt(cd12*cd12 + cd22*cd22);
                let asp = 3600 * (isFinite(scaleXDeg) && isFinite(scaleYDeg) && scaleXDeg>0 && scaleYDeg>0
                    ? (scaleXDeg + scaleYDeg) / 2
                    : (isFinite(scaleXDeg) && scaleXDeg>0 ? scaleXDeg : (isFinite(scaleYDeg) && scaleYDeg>0 ? scaleYDeg : 0.0)));
                if (!(asp > 0)) return null;
                return asp;
            } catch (_) { return null; }
        })();
        // Prefer size column median (arcsec) for radius when available; otherwise require manual radius input.
        const sizeColMedianArcsec = (typeof lastSizeMedianArcsec === 'number' && isFinite(lastSizeMedianArcsec)) ? lastSizeMedianArcsec : null;
        const radiusRaw = (radiusInput && typeof radiusInput.value === 'string') ? radiusInput.value.trim() : '';
        if (sizeColMedianArcsec == null && !radiusRaw) {
            showNotification('Region Style: set a Radius (arcsec) or choose a valid Size Column first.', 3500, 'error');
            return;
        }
        const radiusArcsec = (sizeColMedianArcsec != null)
            ? sizeColMedianArcsec
            : parseFloat(radiusRaw);
        if (!isFinite(radiusArcsec) || !(radiusArcsec > 0)) {
            showNotification('Region Style: Radius must be a positive number (arcsec).', 3500, 'error');
            return;
        }
        const radiusPixels = (arcsecPerPixel && arcsecPerPixel > 0 && isFinite(radiusArcsec)) ? (radiusArcsec / arcsecPerPixel) : radiusArcsec;
        const newStyles = {
            raColumn: raDropdown.hiddenSelect.value,
            decColumn: decDropdown.hiddenSelect.value,
            sizeColumn: sizeDropdown.hiddenSelect.value,
            // Send pixel-based radius to overlay/plotting, plus arcsec metadata
            radius: radiusPixels,
            radius_pixels: radiusPixels,
            radius_arcsec: radiusArcsec,
            arcsec_per_pixel: arcsecPerPixel,
            borderColor: borderColorInput.value,
            backgroundColor: transparentCheckbox.checked ? 'transparent' : bgColorInput.value,
            borderWidth: parseInt(borderWidthSlider.value, 10),
            opacity: parseFloat(opacitySlider.value),
            shape: (regionStyles.shape === 'hexagon') ? 'hexagon' : 'circle'
        };
        newStyles.colorCodeColumn = colorCodeDropdown.hiddenSelect.value || null;
        if (newStyles.colorCodeColumn) {
            newStyles.colorMapName = colorMapDropdown.hiddenSelect.value || REGION_COLOR_MAPS[0].value;
        }
        
        console.log('[Apply Styles] Detailed style values:');
        console.log('  - borderColor (from color picker):', borderColorInput.value);
        console.log('  - backgroundColor:', transparentCheckbox.checked ? 'transparent' : bgColorInput.value);
        console.log('  - borderWidth (from slider):', parseInt(borderWidthSlider.value, 10));
        console.log('  - opacity (from slider):', parseFloat(opacitySlider.value));
        console.log('  - arcsec_per_pixel:', arcsecPerPixel);
        console.log('  - radius_arcsec:', radiusArcsec);
        console.log('  - radius_pixels:', radiusPixels);
        console.log('  - Complete newStyles object:', newStyles);
        
        // Get the catalog name for loading
        const catalogNameForApi = catalogName.startsWith('catalogs/')
            ? catalogName.replace('catalogs/', '')
            : catalogName;
    
        console.log(`[Apply Styles] About to call loadCatalog with '${catalogNameForApi}' and styles:`, newStyles);
        
        // Close popup (animated)
        try { animateOut(); } catch (_) { try { if (popup && popup.parentNode) popup.parentNode.removeChild(popup); } catch (_) {} }
        
        // Check if loadCatalog function exists and call it with BOTH parameters
        if (typeof loadCatalog === 'function') {
            console.log('[Apply Styles] Calling loadCatalog function with styles');
            loadCatalog(catalogNameForApi, newStyles); // Make sure BOTH parameters are passed
        } else if (typeof window.loadCatalog === 'function') {
            console.log('[Apply Styles] Calling window.loadCatalog function with styles');
            window.loadCatalog(catalogNameForApi, newStyles); // Make sure BOTH parameters are passed
        } else {
            console.error('[Apply Styles] loadCatalog function not found!');
            showNotification('Error: Cannot load catalog - function not found', 3000, 'error');
        }
        
        console.log('[Apply Styles] loadCatalog call completed');
    });
    actionsContainer.appendChild(viewCatalogButton);
    actionsContainer.appendChild(applyButton);

    popup.appendChild(title);
    popup.appendChild(catalogNameDisplay);
    popup.appendChild(fitsLabel);
    popup.appendChild(closeButton);
    columnsContainer.appendChild(leftColumn);
    columnsContainer.appendChild(rightColumn);
    popup.appendChild(columnsContainer);
    popup.appendChild(actionsContainer);
    document.body.appendChild(popup);
    makeDraggable(popup, title);
    animateIn();
}


// Create catalog dots with custom styles
function createCatalogDotWithStyles(obj, dotIndex, styles) {
    console.log(`[createCatalogDotWithStyles] Function started for object at index ${dotIndex}`);
    const FIXED_RADIUS = 5;
    
    // Create a dot element
    const dot = document.createElement('div');
    dot.className = 'catalog-dot';
    dot.style.position = 'absolute';

    // Get the specific style for this catalog
    console.log('[createCatalogDotWithStyles] Received styles:', styles);
    const catalogStyle = styles || (window.catalogData.find(c => c.name.includes(window.currentCatalogName)) || {}).style || {};
    console.log('[createCatalogDotWithStyles] Final styles being applied:', catalogStyle);
    
    // Apply styles
    dot.style.width = `${catalogStyle.radius || FIXED_RADIUS}px`;
    dot.style.height = `${catalogStyle.radius || FIXED_RADIUS}px`;
    const shape = (catalogStyle.shape || window.regionStyles?.shape || 'circle');
    if (shape === 'hexagon') {
        dot.style.borderRadius = '0';
        dot.style.clipPath = 'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)';
    } else {
        dot.style.borderRadius = '50%';
        dot.style.clipPath = '';
    }
    dot.style.backgroundColor = catalogStyle.backgroundColor || 'transparent';
    dot.style.border = `${catalogStyle.borderWidth || 2}px solid ${catalogStyle.borderColor || '#ff0000'}`;
    dot.style.opacity = catalogStyle.opacity || 0.8;
    dot.style.cursor = 'pointer';
    dot.style.boxSizing = 'border-box';
    
    dot.style.transform = 'translate(-50%, -50%)';
    dot.style.pointerEvents = 'auto';  // Make dots clickable
    
    // Store the object data with the dot
    dot.dataset.catalogIndex = dotIndex;

    console.log(`[createCatalogDotWithStyles] Created dot for object ${dotIndex} with style:`, dot.style.cssText);
    return dot;
}

// Add styles to the original catalog loading function for backwards compatibility
const originalCreateInfoPopup = window.createInfoPopup;
if (originalCreateInfoPopup) {
    window.createInfoPopup = function(dotIndex) {
        // Call the original function to create the popup
        const popup = originalCreateInfoPopup(dotIndex);
        
        // Add a button to the popup to change styles for the specific dot
        if (popup) {
            const styleButton = document.createElement('button');
            styleButton.textContent = 'Change Style';
            styleButton.style.padding = '6px 12px';
            styleButton.style.backgroundColor = '#FF9800';
            styleButton.style.color = 'white';
            styleButton.style.border = 'none';
            styleButton.style.borderRadius = '4px';
            styleButton.style.cursor = 'pointer';
            styleButton.style.marginTop = '5px';
            
            styleButton.addEventListener('click', function(event) {
                event.stopPropagation();
                
                // Show style customizer for this specific dot
                if (window.catalogDots && dotIndex >= 0 && dotIndex < window.catalogDots.length) {
                    const dot = window.catalogDots[dotIndex];
                    showDotStyleCustomizer(dot, popup);
                }
            });
            
            // Add the button to the popup
            const contentContainer = popup.querySelector('.popup-content');
            if (contentContainer) {
                const buttonDiv = document.createElement('div');
                buttonDiv.style.textAlign = 'center';
                buttonDiv.style.marginTop = '10px';
                buttonDiv.appendChild(styleButton);
                contentContainer.appendChild(buttonDiv);
            }
        }
        
        return popup;
    };
}

// Function to show style customizer for a specific dot
function showDotStyleCustomizer(dot, parentPopup) {
    // Create a mini style customizer popup specifically for this dot
    const popup = document.createElement('div');
    popup.style.position = 'absolute';
    popup.style.top = '50%';
    popup.style.left = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
    popup.style.backgroundColor = '#333';
    popup.style.border = '1px solid #555';
    popup.style.borderRadius = '5px';
    popup.style.padding = '15px';
    popup.style.zIndex = '2000';
    popup.style.width = '300px';
    popup.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)';
    
    // Create title
    const title = document.createElement('h3');
    title.textContent = 'Region Style';
    title.style.margin = '0 0 15px 0';
    title.style.color = '#fff';
    title.style.fontFamily = 'Arial, sans-serif';
    title.style.fontSize = '16px';
    title.style.fontWeight = 'bold';
    
    // Create close button
    const closeButton = document.createElement('button');
    closeButton.textContent = '×';
    closeButton.style.position = 'absolute';
    closeButton.style.top = '10px';
    closeButton.style.right = '10px';
    closeButton.style.backgroundColor = 'transparent';
    closeButton.style.border = 'none';
    closeButton.style.color = '#aaa';
    closeButton.style.fontSize = '20px';
    closeButton.style.cursor = 'pointer';
    
    closeButton.addEventListener('click', () => {
        document.body.removeChild(popup);
    });
    
    // Create color picker
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = dot.style.borderColor || regionStyles.borderColor;
    colorInput.style.width = '100%';
    colorInput.style.height = '30px';
    colorInput.style.marginBottom = '10px';
    
    // Create border width input
    const borderWidthInput = document.createElement('input');
    borderWidthInput.type = 'range';
    borderWidthInput.min = '1';
    borderWidthInput.max = '5';
    borderWidthInput.value = (dot.style.borderWidth && parseInt(dot.style.borderWidth)) || regionStyles.borderWidth;
    borderWidthInput.style.width = '100%';
    borderWidthInput.style.marginBottom = '10px';
    
    // Apply button
    const applyButton = document.createElement('button');
    applyButton.textContent = 'Apply';
    applyButton.style.width = '100%';
    applyButton.style.padding = '8px';
    applyButton.style.backgroundColor = '#4CAF50';
    applyButton.style.color = '#fff';
    applyButton.style.border = 'none';
    applyButton.style.borderRadius = '3px';
    applyButton.style.cursor = 'pointer';
    
    applyButton.addEventListener('click', () => {
        // Apply styles to this specific dot
        dot.style.borderColor = colorInput.value;
        dot.style.borderWidth = `${borderWidthInput.value}px`;
        
        // Remove popup
        document.body.removeChild(popup);
    });
    
    // Add elements to popup
    popup.appendChild(title);
    popup.appendChild(closeButton);
    popup.appendChild(colorInput);
    popup.appendChild(borderWidthInput);
    popup.appendChild(applyButton);
    
    // Add popup to document
    document.body.appendChild(popup);
}






// Update this function in static/catalogs.js and any other relevant JavaScript files

function detectCoordinateColumns(columns) {
    // Result object to return
    const result = {
        ra_column: null,
        dec_column: null,
        radius_column: null
    };
    
    // Only use these exact column names or patterns
    // We're making this list very specific to avoid false positives
    
    // Columns that are definitely RA (only these will be considered)
    const raColumns = [
        'ra', 'RA', 'Ra',                                         // Just RA
        'ra_deg', 'RA_deg', 'ra_degrees', 'RA_degrees',           // RA in degrees
        'raj2000', 'RAJ2000', 'ra_j2000', 'RA_J2000',             // J2000 RA
        'ra_icrs', 'RA_ICRS',                                     // ICRS RA
        'right_ascension', 'RIGHT_ASCENSION',                     // Full name
        'ra_rad', 'RA_rad', 'ra_radians', 'RA_radians',           // RA in radians
        'alpha', 'ALPHA', 'Alpha',                                // Just Alpha
        'cen_ra', 'CEN_RA',                                       // Central RA
        'ra_hms', 'RA_HMS',                                       // HMS format
        'ra_fk5', 'RA_FK5'                                        // FK5 system
    ];
    
    // Columns that are definitely DEC (only these will be considered)
    const decColumns = [
        'dec', 'DEC', 'Dec',                                      // Just DEC
        'dec_deg', 'DEC_deg', 'dec_degrees', 'DEC_degrees',       // DEC in degrees
        'dej2000','decj2000', 'DECJ2000', 'dec_j2000', 'DEC_J2000',         // J2000 DEC
        'dec_icrs', 'DEC_ICRS',                                   // ICRS DEC
        'declination', 'DECLINATION',                             // Full name
        'dec_rad', 'DEC_rad', 'dec_radians', 'DEC_radians',       // DEC in radians
        'delta', 'DELTA', 'Delta',                                // Just Delta
        'cen_dec', 'CEN_DEC',                                     // Central DEC
        'dec_dms', 'DEC_DMS',                                     // DMS format
        'dec_fk5', 'DEC_FK5',                                     // FK5 system
        'de', 'DE', 'De'                                          // Short DE
    ];
    
    // Columns that are definitely radius (only these will be considered)
    const radiusColumns = [
        'radius', 'RADIUS', 'Radius',                            // Just radius 
        'rad', 'RAD', 'Rad',                                     // Abbreviated radius
        'size', 'SIZE', 'Size',                                  // Size
        'diameter', 'DIAMETER', 'Diameter',                      // Diameter
        'width', 'WIDTH', 'Width',                               // Width
        'r_eff', 'R_EFF', 'R_eff',                               // Effective radius
        'r_50', 'R_50',                                          // Half-light radius
        'r_kron', 'R_KRON', 'R_kron',                            // Kron radius
        'r_petro', 'R_PETRO', 'R_petro'                          // Petrosian radius
    ];
    
    // First pass: try to find exact column name matches
    for (const col of columns) {
        // Check for RA
        if (raColumns.includes(col) && !result.ra_column) {
            result.ra_column = col;
            continue;
        }
        
        // Check for DEC    
        if (decColumns.includes(col) && !result.dec_column) {
            result.dec_column = col;
            continue;
        }
        
        // Check for radius
        if (radiusColumns.includes(col) && !result.radius_column) {
            result.radius_column = col;
            continue;
        }
    }
    
    // Second pass: check if a column starts with or ends with any of our keywords
    if (!result.ra_column) {
        const safeRaPrefixes = ['ra_', 'RA_', 'Ra_', 'RAJ', 'raj'];
        const safeRaSuffixes = ['_ra', '_RA', '_Ra'];
        
        for (const col of columns) {
            // Check prefixes
            if (safeRaPrefixes.some(prefix => col.startsWith(prefix))) {
                // Exclude columns with keywords that indicate they're not RA
                const lowerCol = col.toLowerCase();
                if (!['err', 'error', 'sigma', 'std', 'var', 'dust'].some(substr => lowerCol.includes(substr))) {
                    result.ra_column = col;
                    break;
                }
            }
            
            // Check suffixes
            if (safeRaSuffixes.some(suffix => col.endsWith(suffix))) {
                result.ra_column = col;
                break;
            }
        }
    }
    
    // Similar for DEC
    if (!result.dec_column) {
        const safeDecPrefixes = ['dec_', 'DEC_', 'Dec_', 'DECJ', 'decj', 'de_', 'DE_'];
        const safeDecSuffixes = ['_dec', '_DEC', '_Dec', '_de', '_DE'];
        
        for (const col of columns) {
            // Check prefixes
            if (safeDecPrefixes.some(prefix => col.startsWith(prefix))) {
                // Exclude columns with keywords that indicate they're not DEC
                const lowerCol = col.toLowerCase();
                if (!['err', 'error', 'sigma', 'std', 'var', 'dust', 'met_', 'scal'].some(substr => lowerCol.includes(substr))) {
                    result.dec_column = col;
                    break;
                }
            }
            
            // Check suffixes
            if (safeDecSuffixes.some(suffix => col.endsWith(suffix))) {
                result.dec_column = col;
                break;
            }
        }
    }
    
    // Similar for radius
    if (!result.radius_column) {
        const safeRadiusPrefixes = ['radius_', 'RADIUS_', 'rad_', 'RAD_', 'r_', 'R_'];
        const safeRadiusSuffixes = ['_radius', '_RADIUS', '_rad', '_RAD', '_size', '_SIZE'];
        
        for (const col of columns) {
            // Check prefixes
            if (safeRadiusPrefixes.some(prefix => col.startsWith(prefix))) {
                result.radius_column = col;
                break;
            }
            
            // Check suffixes
            if (safeRadiusSuffixes.some(suffix => col.endsWith(suffix))) {
                result.radius_column = col;
                break;
            }
        }
    }
    
    // Third pass: If a column is named alpha or delta but there are better candidates, avoid them
    if (['alpha', 'ALPHA', 'Alpha'].includes(result.ra_column)) {
        // Look for a better candidate
        for (const col of columns) {
            if (['ra', 'RA', 'Ra', 'raj2000', 'RAJ2000', 'cen_ra'].includes(col)) {
                result.ra_column = col;
                break;
            }
        }
    }
    
    if (['delta', 'DELTA', 'Delta'].includes(result.dec_column)) {
        // Look for a better candidate
        for (const col of columns) {
            if (['dec', 'DEC', 'Dec', 'decj2000', 'DECJ2000', 'cen_dec'].includes(col)) {
                result.dec_column = col;
                break;
            }
        }
    }
    
    // Extra safety: never select columns with these substrings
    const dangerousSubstrings = [
        'dust', 'met_', 'metallicity', 'metal', '_scal', '_scale', 
        'best.dust', 'param', '_err', '_error', 'ratio', 'weight'
    ];
    
    // Final safety check - if our selected columns contain dangerous substrings, reject them
    if (result.ra_column && dangerousSubstrings.some(substr => result.ra_column.toLowerCase().includes(substr))) {
        result.ra_column = null;
    }
    
    if (result.dec_column && dangerousSubstrings.some(substr => result.dec_column.toLowerCase().includes(substr))) {
        result.dec_column = null;
    }
    
    return result;
}

// Function to handle catalog file uploads
async function uploadCatalog() {
    // Create a file input element dynamically
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.fits, .fit, .csv, .txt, .cat'; // Specify acceptable file types
    fileInput.style.display = 'none'; // Keep it hidden

    // Add an event listener for when a file is selected
    fileInput.addEventListener('change', async function() {
        if (!this.files || this.files.length === 0) {
            // No file selected or dialog cancelled
            document.body.removeChild(fileInput); // Clean up the input element
            return;
        }

        const file = this.files[0];
        const formData = new FormData();
        formData.append('file', file);

        showNotification(true, 'Uploading catalog...');

        try {
            // Use XHR with session header and circular progress UI (#progress-container)
            const sid = (typeof sessionStorage !== 'undefined') ? (sessionStorage.getItem('sid') || '') : '';
            const progressContainer = document.getElementById('progress-container');
            const progressBar = document.getElementById('progress-bar');
            const progressEta = document.getElementById('progress-eta');

            const showCircleProgress = (show) => {
                if (!progressContainer) return;
                progressContainer.style.display = show ? '' : 'none';
                if (progressEta && show) progressEta.textContent = 'Uploading...';
            };
            const updateCircleProgress = (percent) => {
                if (!progressBar) return;
                const p = Math.max(0, Math.min(100, Number(percent || 0)));
                progressBar.style.strokeDashoffset = String(100 - p);
                if (progressEta) progressEta.textContent = `${Math.round(p)}%`;
            };

            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/upload-catalog/', true);
            if (sid) xhr.setRequestHeader('X-Session-ID', sid);
            xhr.upload.onprogress = (evt) => {
                if (evt.lengthComputable) updateCircleProgress((evt.loaded / Math.max(1, evt.total)) * 100);
            };
            xhr.onreadystatechange = () => {
                if (xhr.readyState !== 4) return;
                try {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        const result = JSON.parse(xhr.responseText || '{}');
                        showNotification((result && result.message) || 'Catalog uploaded successfully!', 3000, 'success');
                        // Force dropdown to show uploads tab on next render and refresh lists
                        window.__forceCatalogTab = 'uploads';
                        if (typeof refreshCatalogs === 'function') refreshCatalogs();
                    } else {
                        let errMsg = 'Upload failed';
                        try { errMsg = (JSON.parse(xhr.responseText || '{}').error) || errMsg; } catch (_) {}
                        showNotification(`Error: ${xhr.status} - ${errMsg}`, 4000, 'error');
                    }
                } finally {
                    showCircleProgress(false);
                    updateCircleProgress(0);
                    showNotification(false);
                    document.body.removeChild(fileInput);
                }
            };
            showCircleProgress(true);
            updateCircleProgress(0);
            xhr.send(formData);

        } catch (error) {
            console.error('Error uploading catalog:', error);
            showNotification(`Error: ${error.message}`, 4000, 'error');
            showNotification(false);
            document.body.removeChild(fileInput);
        }
    });

    // Append the input to the body temporarily
    document.body.appendChild(fileInput);
    // Programmatically click the hidden file input to open the dialog
    fileInput.click();
}

// Function to create and show the catalog field mapping popup
// ... (rest of the function, which will no longer be called automatically after upload)

function addUploadCatalogButton() {
    // Get the catalog dropdown
    const catalogDropdown = document.getElementById('catalog-dropdown');
    
    if (!catalogDropdown) return;
    
    // Check if the upload button already exists
    const existingButton = catalogDropdown.querySelector('a[onclick="uploadCatalog()"]');
    if (existingButton) return;
    
    // Find the refresh button
    const refreshButton = catalogDropdown.querySelector('a[onclick="refreshCatalogs()"]');
    
    // Create the upload button
    const uploadButton = document.createElement('a');
    uploadButton.href = "#";
    uploadButton.textContent = "Upload Catalog";
    uploadButton.onclick = function() {
        uploadCatalog();
        return false;
    };
    
    // Insert the upload button before the refresh button
    if (refreshButton) {
        catalogDropdown.insertBefore(uploadButton, refreshButton);
    } else {
        // If refresh button not found, add to the beginning
        catalogDropdown.prepend(uploadButton);
    }
}

// Initialize the upload button when the page loads
document.addEventListener("DOMContentLoaded", function() {
    // Add the upload button to the catalog dropdown
    addUploadCatalogButton();
});

// Override the updateCatalogDropdown function to add the upload button
const originalUpdateCatalogDropdown = window.updateCatalogDropdown;
window.updateCatalogDropdown = function(catalogs) {
    // Call the original function
    originalUpdateCatalogDropdown(catalogs);
    
    // Add the upload button
    addUploadCatalogButton();
};

// Function to create and show the style customizer popup
// ... existing code ...

// Add this to the end of static/catalogs.js

function clearAllCatalogs() {
    console.log("Clearing all loaded catalogs and overlays.");

    // Clear overlay stores (multi-catalog support)
    try {
        if (typeof _ensureCatalogOverlayStore === 'function') _ensureCatalogOverlayStore();
    } catch (_) {}
    try { if (window.catalogOverlaysByCatalog && typeof window.catalogOverlaysByCatalog === 'object') window.catalogOverlaysByCatalog = {}; } catch (_) {}
    try { if (window.catalogVisibilityByCatalog && typeof window.catalogVisibilityByCatalog === 'object') window.catalogVisibilityByCatalog = {}; } catch (_) {}

    // Reset globals used across UI modules
    try { window.loadedCatalogs = []; } catch (_) {}
    try { window.catalogData = []; } catch (_) {}
    try { window.catalogDataForOverlay = []; } catch (_) {}
    try { window.catalogDataWithFlags = null; } catch (_) {}
    try { window.catalogDataWithFlagsName = null; } catch (_) {}
    try { window.currentCatalogName = null; } catch (_) {}
    try { window.activeCatalog = null; } catch (_) {}
    try { activeCatalog = null; } catch (_) {}
    // Clear per-catalog boolean filter settings (from catalog overlay controls)
    try { if (window.catalogBooleanFiltersByCatalog && typeof window.catalogBooleanFiltersByCatalog === 'object') window.catalogBooleanFiltersByCatalog = {}; } catch (_) {}
    // Clear per-catalog condition filter settings (from catalog overlay controls)
    try { if (window.catalogConditionFiltersByCatalog && typeof window.catalogConditionFiltersByCatalog === 'object') window.catalogConditionFiltersByCatalog = {}; } catch (_) {}
    // Reset cross-match config (no memory after unload)
    try { if (window.catalogCrossMatchConfig) window.catalogCrossMatchConfig = { enabled: false, radius_arcsec: 1.0 }; } catch (_) {}

    // Clear visual overlays
    try { if (typeof rebuildCombinedCatalogOverlay === 'function') rebuildCombinedCatalogOverlay(); } catch (_) {}
    try { if (typeof clearCatalogOverlay === 'function') clearCatalogOverlay(); } catch (_) {}
    try { if (typeof canvasClearCatalogOverlay === 'function') canvasClearCatalogOverlay(); } catch (_) {}

    // Clear the catalog selection dropdown in the UI
    const dropdown = document.getElementById('catalog-select');
    if (dropdown) {
        // Remove all options except the placeholder
        while (dropdown.options.length > 1) {
            dropdown.remove(1);
        }
        // Hide the dropdown container if it's meant to be hidden when empty
        const dropdownContainer = document.getElementById('catalog-selector-container');
        if (dropdownContainer) {
            dropdownContainer.style.display = 'none';
        }
    }
    
    // Also clear any peak finder specific UI if necessary
    // (This part is a placeholder in case we need it later)
    
    // Hide SED / properties panes (best-effort)
    try { if (typeof hideSed === 'function') hideSed(); } catch (_) {}
    try { if (typeof hideProperties === 'function') hideProperties(); } catch (_) {}

    // Remove catalog controls panel (best-effort)
    try { if (typeof removeCatalogOverlayControls === 'function') removeCatalogOverlayControls(true); } catch (_) {}

    console.log("All catalogs cleared.");
}

// Expose so UI (catalog overlay controls / toolbar) can clear everything, not only the active catalog.
try { window.clearAllCatalogs = clearAllCatalogs; } catch (_) {}

// Add this debugging function to check styles
function debugCatalogStyles() {
    if (window.catalogDataForOverlay && window.catalogDataForOverlay.length > 0) {
        console.log('=== CATALOG STYLE DEBUG ===');
        console.log('Total objects:', window.catalogDataForOverlay.length);
        
        // Check first few objects
        for (let i = 0; i < Math.min(5, window.catalogDataForOverlay.length); i++) {
            const obj = window.catalogDataForOverlay[i];
            console.log(`Object ${i} styles:`, {
                color: obj.color,
                fillColor: obj.fillColor,
                border_width: obj.border_width,
                opacity: obj.opacity,
                useTransparentFill: obj.useTransparentFill,
                radius_pixels: obj.radius_pixels
            });
        }
    } else {
        console.log('No catalog data for overlay found');
    }
}

// Call this in the console after applying styles to debug:
// debugCatalogStyles();
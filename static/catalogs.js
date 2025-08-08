// Load available catalogs

// // Color map functions for catalog styling
// const COLOR_MAPS = {
//     viridis: (val) => {
//         const v = val / 255;
//         let r, g, b;
//         if (v < 0.25) { 
//             r = 68 + v * 4 * (33 - 68); 
//             g = 1 + v * 4 * (144 - 1); 
//             b = 84 + v * 4 * (140 - 84); 
//         } else if (v < 0.5) { 
//             r = 33 + (v - 0.25) * 4 * (94 - 33); 
//             g = 144 + (v - 0.25) * 4 * (201 - 144); 
//             b = 140 + (v - 0.25) * 4 * (120 - 140); 
//         } else if (v < 0.75) { 
//             r = 94 + (v - 0.5) * 4 * (190 - 94); 
//             g = 201 + (v - 0.5) * 4 * (222 - 201); 
//             b = 120 + (v - 0.5) * 4 * (47 - 120); 
//         } else { 
//             r = 190 + (v - 0.75) * 4 * (253 - 190); 
//             g = 222 + (v - 0.75) * 4 * (231 - 222); 
//             b = 47 + (v - 0.75) * 4 * (37 - 47); 
//         }
//         return [Math.round(r), Math.round(g), Math.round(b)];
//     },
    
//     plasma: (val) => {
//         const v = val / 255;
//         let r, g, b;
//         if (v < 0.25) { 
//             r = 13 + v * 4 * (126 - 13); 
//             g = 8 + v * 4 * (8 - 8); 
//             b = 135 + v * 4 * (161 - 135); 
//         } else if (v < 0.5) { 
//             r = 126 + (v - 0.25) * 4 * (203 - 126); 
//             g = 8 + (v - 0.25) * 4 * (65 - 8); 
//             b = 161 + (v - 0.25) * 4 * (107 - 161); 
//         } else if (v < 0.75) { 
//             r = 203 + (v - 0.5) * 4 * (248 - 203); 
//             g = 65 + (v - 0.5) * 4 * (150 - 65); 
//             b = 107 + (v - 0.5) * 4 * (58 - 107); 
//         } else { 
//             r = 248 + (v - 0.75) * 4 * (239 - 248); 
//             g = 150 + (v - 0.75) * 4 * (204 - 150); 
//             b = 58 + (v - 0.75) * 4 * (42 - 58); 
//         }
//         return [Math.round(r), Math.round(g), Math.round(b)];
//     },
    
//     inferno: (val) => {
//         const v = val / 255;
//         let r, g, b;
//         if (v < 0.2) { 
//             r = 0 + v * 5 * 50; 
//             g = 0 + v * 5 * 10; 
//             b = 4 + v * 5 * 90; 
//         } else if (v < 0.4) { 
//             r = 50 + (v-0.2)*5 * (120-50); 
//             g = 10 + (v-0.2)*5 * (28-10); 
//             b = 94 + (v-0.2)*5 * (109-94); 
//         } else if (v < 0.6) { 
//             r = 120 + (v-0.4)*5 * (187-120); 
//             g = 28 + (v-0.4)*5 * (55-28); 
//             b = 109 + (v-0.4)*5 * (84-109); 
//         } else if (v < 0.8) { 
//             r = 187 + (v-0.6)*5 * (236-187); 
//             g = 55 + (v-0.6)*5 * (104-55); 
//             b = 84 + (v-0.6)*5 * (36-84); 
//         } else { 
//             r = 236 + (v-0.8)*5 * (251-236); 
//             g = 104 + (v-0.8)*5 * (180-104); 
//             b = 36 + (v-0.8)*5 * (26-36); 
//         }
//         return [Math.round(r), Math.round(g), Math.round(b)];
//     },
    
//     cividis: (val) => {
//         const v = val / 255;
//         let r, g, b;
//         if (v < 0.2) { 
//             r = 0 + v*5 * 33; 
//             g = 32 + v*5 * (61-32); 
//             b = 76 + v*5 * (107-76); 
//         } else if (v < 0.4) { 
//             r = 33 + (v-0.2)*5 * (85-33); 
//             g = 61 + (v-0.2)*5 * (91-61); 
//             b = 107 + (v-0.2)*5 * (108-107); 
//         } else if (v < 0.6) { 
//             r = 85 + (v-0.4)*5 * (123-85); 
//             g = 91 + (v-0.4)*5 * (122-91); 
//             b = 108 + (v-0.4)*5 * (119-108); 
//         } else if (v < 0.8) { 
//             r = 123 + (v-0.6)*5 * (165-123); 
//             g = 122 + (v-0.6)*5 * (156-122); 
//             b = 119 + (v-0.6)*5 * (116-119); 
//         } else { 
//             r = 165 + (v-0.8)*5 * (217-165); 
//             g = 156 + (v-0.8)*5 * (213-156); 
//             b = 116 + (v-0.8)*5 * (122-116); 
//         }
//         return [Math.round(r), Math.round(g), Math.round(b)];
//     },
    
//     hot: (val) => {
//         const v = val / 255;
//         let r, g, b;
//         if (v < 1/3) { 
//             r = v * 3 * 255; 
//             g = 0; 
//             b = 0; 
//         } else if (v < 2/3) { 
//             r = 255; 
//             g = (v - 1/3) * 3 * 255; 
//             b = 0; 
//         } else { 
//             r = 255; 
//             g = 255; 
//             b = (v - 2/3) * 3 * 255; 
//         }
//         return [Math.round(r), Math.round(g), Math.round(b)];
//     },
    
//     cool: (val) => {
//         const v = val / 255;
//         return [Math.round(v * 255), Math.round((1 - v) * 255), 255];
//     },
    
//     grayscale: (val) => [val, val, val],
    
//     jet: (val) => {
//         const v = val / 255;
//         let r = 0, g = 0, b = 0;
//         if (v < 0.125) { 
//             b = 0.5 + 4 * v; 
//         } else if (v < 0.375) { 
//             g = 4 * (v - 0.125); 
//             b = 1.0; 
//         } else if (v < 0.625) { 
//             r = 4 * (v - 0.375); 
//             g = 1.0; 
//             b = 1.0 - 4 * (v - 0.375); 
//         } else if (v < 0.875) { 
//             r = 1.0; 
//             g = 1.0 - 4 * (v - 0.625); 
//         } else { 
//             r = 1.0 - 4 * (v - 0.875); 
//         }
//         return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
//     }
// };

// Helper function to convert RGB array to hex color
function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// Update the catalog dropdown menu
function updateCatalogDropdown(catalogs) {
    const dropdown = document.getElementById('catalog-dropdown');
    
    // Clear existing items except the refresh option
    const refreshOption = dropdown.querySelector('a[onclick="refreshCatalogs()"]');
    dropdown.innerHTML = '';
    if (refreshOption) {
        dropdown.appendChild(refreshOption);
    }
    
    // Add a "None" option to clear catalogs
    const noneOption = document.createElement('a');
    noneOption.href = "#";
    noneOption.textContent = "None (Clear catalogs)";
    noneOption.onclick = function() {
        clearCatalog();
        return false;
    };
    dropdown.appendChild(noneOption);
    
    // Add separator
    const separator = document.createElement('div');
    separator.style.borderBottom = '1px solid rgba(255, 255, 255, 0.3)';
    separator.style.margin = '5px 0';
    dropdown.appendChild(separator);
    
    // Add catalog options
    if (catalogs && catalogs.length > 0) {
        catalogs.forEach(catalog => {
            const option = document.createElement('a');
            option.href = "#";
            option.textContent = catalog.name;
            option.onclick = function() {
                // Show the style customizer FIRST
                showStyleCustomizerPopup(catalog.name);
                // Don't load immediately, let the popup handle it via Apply button
                // loadCatalog(catalog.name); // Remove or comment this out
                return false;
            };
            dropdown.appendChild(option);
        });
    } else {
        const noItems = document.createElement('a');
        noItems.href = "#";
        noItems.textContent = "No catalogs found";
        noItems.style.color = 'gray';
        noItems.style.cursor = 'default';
        noItems.onclick = function() { return false; };
        dropdown.appendChild(noItems);
    }
}

// Refresh the catalog list
function refreshCatalogs() {
    loadCatalogs();
    return false;
}

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
    
    // Set dot styling based on current styles
    const FIXED_RADIUS = 5; // Default radius in pixels
    const dotBorderWidth = regionStyles.borderWidth || 1;
    const dotBorderColor = regionStyles.borderColor || 'rgba(255, 165, 0, 0.7)';
    const dotFillColor = regionStyles.backgroundColor || 'transparent';
    const dotOpacity = regionStyles.opacity || 0.7;
    
    console.log('[updateCanvasOverlay] Using styles:', {
        borderWidth: dotBorderWidth,
        borderColor: dotBorderColor,
        fillColor: dotFillColor,
        opacity: dotOpacity
    });
    
    // Set global alpha for transparency
    ctx.globalAlpha = dotOpacity;
    
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
            x = pixelCoords.x;
            y = pixelCoords.y;
        }
        
        // Convert image coordinates to viewport coordinates - USE ACTIVE VIEWER
        const viewportPoint = activeViewer.viewport.imageToViewportCoordinates(x, y);
        
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
            ctx.beginPath();
            ctx.arc(pagePoint.x, pagePoint.y, radius, 0, 2 * Math.PI, false);
            
            // Set border style
            ctx.lineWidth = dotBorderWidth;
            ctx.strokeStyle = dotBorderColor;
            
            // Fill if not transparent
            if (dotFillColor !== 'transparent') {
                ctx.fillStyle = dotFillColor;
                ctx.fill();
            }
            
            // Draw border
            ctx.stroke();
            
            // Store the source location for click detection
            window.catalogSourceMap.push({
                x: pagePoint.x,
                y: pagePoint.y,
                radius: radius,
                sourceIndex: i,
                imageX: x,
                imageY: y,
                ra: obj.ra,
                dec: obj.dec
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


// Refresh the catalog list
function refreshCatalogs() {
    console.log("Refreshing catalog list");
    loadCatalogs();
    return false; // Prevent default anchor behavior
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
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    
    // Use the header as drag handle if provided, otherwise use the element itself
    const handle = dragHandle || element;
    
    handle.onmousedown = dragMouseDown;
    
    function dragMouseDown(e) {
        e.preventDefault();
        e.stopPropagation();
        
        // Get the mouse cursor position at startup
        pos3 = e.clientX;
        pos4 = e.clientY;
        
        // Set a flag to indicate we're dragging
        element.dataset.isDragging = 'true';
        
        // Add event listeners for mouse movement and release
        document.onmousemove = elementDrag;
        document.onmouseup = closeDragElement;
    }
    
    function elementDrag(e) {
        e.preventDefault();
        
        // Calculate the new cursor position
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        
        // Set the element's new position
        element.style.top = (element.offsetTop - pos2) + "px";
        element.style.left = (element.offsetLeft - pos1) + "px";
    }
    
    function closeDragElement() {
        // Stop moving when mouse button is released
        document.onmouseup = null;
        document.onmousemove = null;
        
        // Clear the dragging flag
        setTimeout(() => {
            element.dataset.isDragging = 'false';
        }, 10);
    }
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

// Clear the active catalog
function clearCatalog() {
    if (!activeCatalog) return;
    
    activeCatalog = null;
    
    // Hide catalog info
    const catalogInfo = document.getElementById('catalog-info');
    if (catalogInfo) {
        catalogInfo.style.display = 'none';
    }
    
    // Remove catalog overlay
    clearCatalogOverlay();
    
    // Hide SED container
    hideSed();
    
    // Hide properties container
    hideProperties();
    
    // Clear active catalog
    window.currentCatalogName = null;
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
        
        // Convert image coordinates to viewport coordinates
        const viewportPoint = viewer.viewport.imageToViewportCoordinates(x, y);
        
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

        // Use the new worldToPixels function
        const pixelCoords = wcs.worldToPixels(ra, dec);
        console.log(`[addCatalogOverlay] Object ${index}: RA=${ra}, Dec=${dec} -> Pixel X=${pixelCoords?.x}, Y=${pixelCoords?.y}`);

        if (pixelCoords) {
            const pixelX = pixelCoords.x;
            const pixelY = pixelCoords.y;

            // OpenSeadragon's imageToViewportCoordinates handles the coordinate system correctly.
            if (pixelX >= 0 && pixelX < imageWidth && pixelY >= 0 && pixelY < imageHeight) {
                console.log(`[addCatalogOverlay] Object ${index} is within image bounds. Creating dot.`);
                const dotElement = createCatalogDotWithStyles(obj, index, styles);

                // Use pixelY directly, OpenSeadragon will handle the correct placement.
                const viewportPoint = activeViewer.viewport.imageToViewportCoordinates(pixelX, pixelY);
                console.log(`[addCatalogOverlay] Viewport point for object ${index}:`, viewportPoint);

                activeViewer.addOverlay({
                    element: dotElement,
                    location: viewportPoint,
                    placement: 'CENTER'
                });
                console.log(`[addCatalogOverlay] Added overlay for object ${index}`);
            } else {
                console.warn(`[addCatalogOverlay] Object ${index} is outside image bounds.`);
            }
        } else {
            console.warn(`[addCatalogOverlay] Could not convert world to pixel coordinates for object ${index}`);
        }
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
    opacity: 0.7 // Default opacity
};



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
    window.catalogData[catalogIndex].style = {
        ...window.catalogData[catalogIndex].style, // Preserve any existing styles
        ...styles // Apply new styles
    };
    
    console.log('Previous styles:', previousStyles);
    console.log('New styles applied:', styles);
    console.log(`Final styles for catalog "${window.catalogData[catalogIndex].name}":`, window.catalogData[catalogIndex].style);
    
    // Also update the global regionStyles for immediate use
    window.regionStyles = {
        borderColor: styles.borderColor || window.regionStyles?.borderColor || '#FF0000',
        backgroundColor: styles.backgroundColor || window.regionStyles?.backgroundColor || 'transparent',
        borderWidth: styles.borderWidth || window.regionStyles?.borderWidth || 2,
        opacity: styles.opacity || window.regionStyles?.opacity || 0.8
    };
    
    console.log('Updated global regionStyles:', window.regionStyles);

    // Store both the original and normalized catalog names for reloading
    window.currentCatalogName = window.catalogData[catalogIndex].name; // Use the actual stored name
    window.activeCatalog = window.catalogData[catalogIndex].name;

    // If we have overlay data, update the styles for immediate visual feedback
    if (window.catalogDataForOverlay && Array.isArray(window.catalogDataForOverlay)) {
        console.log('Updating overlay data with new styles...');
        
        // Apply styles to each object in the overlay
        window.catalogDataForOverlay.forEach((obj, index) => {
            if (obj) {
                // Apply visual styles
                obj.color = styles.borderColor || '#FF0000';
                obj.fillColor = styles.backgroundColor === 'transparent' ? 'rgba(255, 0, 0, 0.3)' : styles.backgroundColor;
                obj.border_width = styles.borderWidth || 2;
                obj.opacity = styles.opacity || 0.8;
                obj.useTransparentFill = styles.backgroundColor === 'transparent';
                
                // Apply coordinate/size settings
                if (styles.radius && typeof styles.radius === 'number') {
                    obj.radius_pixels = styles.radius;
                }
            }
        });
        
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

    fetch(`/catalog-columns/?catalog_name=${encodeURIComponent(catalogNameForApi)}`)
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
            const sizeKeywords = ['radius', 'size', 'rad', 'fwhm', 'major', 'maj'];

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
            
            // Use the apiName for reloading (this is the name without catalogs/ prefix)
            const catalogNameForReload = result.apiName || result.catalogName;
            console.log(`[Apply Styles] Reloading catalog '${catalogNameForReload}' to display new styles.`);
            
            if (typeof loadCatalog === 'function') {
                // Load using the API-compatible name
                loadCatalog(catalogNameForReload);
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
    
    // Initialize catalogData if needed
    if (!window.catalogData || !Array.isArray(window.catalogData)) {
        window.catalogData = [];
    }
    
    // Store the current catalog name globally
    window.currentCatalogName = catalogName;
    activeCatalog = catalogName;
    
    // Show loading indicator
    showNotification(true, 'Loading catalog...');
    
    // Clear any existing catalog overlay
    if (typeof canvasClearCatalogOverlay === 'function') {
        canvasClearCatalogOverlay();
    } else if (typeof clearCatalogOverlay === 'function') {
        clearCatalogOverlay();
    }
    
    // Clear any existing flag data
    window.catalogDataWithFlags = null;
    
    console.log(`[loadCatalog] Fetching data from: /catalog-with-flags/${encodeURIComponent(catalogName)}`);
    
    // Fetch catalog data from server
    fetch(`/catalog-with-flags/${encodeURIComponent(catalogName)}`, {
        method: 'GET'
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

        // Store the complete catalog data
        window.catalogDataWithFlags = catalogData;
// In the loadCatalog function, replace this part:
window.catalogDataForOverlay = catalogData.map((obj, index) => {
    // Create the styled object with proper defaults
    const styledObj = {
        ...obj,
        index: index,
        passesFilter: true
    };
    
    // Apply styles if provided, otherwise use defaults
    if (styles) {
        styledObj.color = styles.borderColor || '#FF0000';
        styledObj.fillColor = (styles.backgroundColor !== 'transparent') ? styles.backgroundColor : 'rgba(255, 0, 0, 0.3)';
        styledObj.border_width = styles.borderWidth || 2;
        styledObj.opacity = styles.opacity || 0.8;
        styledObj.useTransparentFill = styles.backgroundColor === 'transparent';
        styledObj.radius_pixels = styles.radius || obj.radius_pixels || 5;
        
    
    } else {
        // Default styles
        styledObj.color = '#FF0000';
        styledObj.fillColor = 'rgba(255, 0, 0, 0.3)';
        styledObj.border_width = 2;
        styledObj.opacity = 0.8;
        styledObj.useTransparentFill = true;
        styledObj.radius_pixels = obj.radius_pixels || 5;
    }
    
    return styledObj;
});

console.log('[loadCatalog] Prepared overlay data with styles. Sample object:', window.catalogDataForOverlay[0]);
        
        console.log('[loadCatalog] Prepared overlay data with', window.catalogDataForOverlay.length, 'objects');
        
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
                createFlagFilterButton();
                
                showNotification(false);
                showNotification(`Catalog loaded: ${catalogData.length} objects`, 2000, 'success');
                
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

// Binary catalog loader with fast parsing
function loadCatalogBinary(catalogName, styles = null) {
    console.log(`[DEBUG] loadCatalogBinary called with:`, { catalogName, styles });
    console.log(`[loadCatalogBinary] Function started with catalog: ${catalogName}`);
    
    if (!catalogName) {
        console.error('[loadCatalogBinary] No catalog name provided, exiting.');
        showNotification('Please select a catalog first', 3000);
        return;
    }
    
    // Initialize catalogData if needed
    if (!window.catalogData || !Array.isArray(window.catalogData)) {
        window.catalogData = [];
    }
    
    // Store the current catalog name globally
    window.currentCatalogName = catalogName;
    activeCatalog = catalogName;
    
    // Show loading indicator
    showNotification(true, 'Loading catalog...');
    
    // Clear any existing catalog overlay
    if (typeof canvasClearCatalogOverlay === 'function') {
        canvasClearCatalogOverlay();
    } else if (typeof clearCatalogOverlay === 'function') {
        clearCatalogOverlay();
    }
    
    // Clear any existing flag data
    window.catalogDataWithFlags = null;
    
    console.log(`[loadCatalogBinary] Fetching binary data from: /catalog-binary/${encodeURIComponent(catalogName)}`);
    
    // Fetch binary catalog data from server
    fetch(`/catalog-binary/${encodeURIComponent(catalogName)}`, {
        method: 'GET',
        headers: {
            'Accept-Encoding': 'gzip'  // Request compressed data
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Failed to load catalog: ${response.statusText}`);
        }
        return response.arrayBuffer();
    })
    .then(arrayBuffer => {
        console.log('[loadCatalogBinary] Received binary response, size:', arrayBuffer.byteLength);
        
        // Parse binary data
        const catalogData = parseBinaryCatalog(arrayBuffer);
        
        console.log(`[loadCatalogBinary] Parsed ${catalogData.records.length} objects from binary data.`);
        
        if (!catalogData.records || catalogData.records.length === 0) {
            throw new Error('No catalog data found or invalid format.');
        }
        
        // Store the complete catalog data
        window.catalogDataWithFlags = catalogData.records;
        
        // Prepare overlay data with styles
        window.catalogDataForOverlay = catalogData.records.map((obj, index) => {
            // Create the styled object with proper defaults
            const styledObj = {
                ...obj,
                index: index,
                passesFilter: true
            };
            
            // Apply styles if provided, otherwise use defaults
            if (styles) {
                styledObj.color = styles.borderColor || '#FF0000';
                styledObj.fillColor = (styles.backgroundColor !== 'transparent') ? 
                    styles.backgroundColor : 'rgba(255, 0, 0, 0.3)';
                styledObj.border_width = styles.borderWidth || 2;
                styledObj.opacity = styles.opacity || 0.8;
                styledObj.useTransparentFill = styles.backgroundColor === 'transparent';
                styledObj.radius_pixels = styles.radius || obj.radius_pixels || 5;
            } else {
                // Default styles
                styledObj.color = '#FF0000';
                styledObj.fillColor = 'rgba(255, 0, 0, 0.3)';
                styledObj.border_width = 2;
                styledObj.opacity = 0.8;
                styledObj.useTransparentFill = true;
                styledObj.radius_pixels = obj.radius_pixels || 5;
            }
            
            return styledObj;
        });
        
        console.log('[loadCatalogBinary] Prepared overlay data with styles. Sample object:', 
                    window.catalogDataForOverlay[0]);
        
        // Store metadata
        window.catalogMetadata = catalogData.header;
        
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
                    createFlagFilterButton();
                }
                
                showNotification(false);
                showNotification(`Catalog loaded: ${catalogData.records.length} objects`, 2000, 'success');
                
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
    const dataView = new DataView(arrayBuffer);
    let offset = 0;
    
    // Read header length (4 bytes)
    const headerLength = dataView.getUint32(offset, true);
    offset += 4;
    
    // Read header JSON
    const headerBytes = new Uint8Array(arrayBuffer, offset, headerLength);
    const headerJson = new TextDecoder().decode(headerBytes);
    const header = JSON.parse(headerJson);
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
        const metadata = JSON.parse(metadataJson);
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
    showNotification(true, 'Loading catalog...');
    
    // Clear existing overlays
    if (typeof canvasClearCatalogOverlay === 'function') {
        canvasClearCatalogOverlay();
    }
    
    try {
        const response = await fetch(`/catalog-binary/${encodeURIComponent(catalogName)}`, {
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
        
        // Process and display as before
        window.catalogDataWithFlags = catalogData.records;
        window.catalogDataForOverlay = prepareCatalogOverlayData(catalogData.records, styles);
        window.catalogMetadata = catalogData.header;
        
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
function prepareCatalogOverlayData(records, styles) {
    return records.map((obj, index) => {
        const styledObj = {
            ...obj,
            index: index,
            passesFilter: true
        };
        
        if (styles) {
            styledObj.color = styles.borderColor || '#FF0000';
            styledObj.fillColor = (styles.backgroundColor !== 'transparent') ? 
                styles.backgroundColor : 'rgba(255, 0, 0, 0.3)';
            styledObj.border_width = styles.borderWidth || 2;
            styledObj.opacity = styles.opacity || 0.8;
            styledObj.useTransparentFill = styles.backgroundColor === 'transparent';
            styledObj.radius_pixels = styles.radius || obj.radius_pixels || 5;
        } else {
            styledObj.color = '#FF0000';
            styledObj.fillColor = 'rgba(255, 0, 0, 0.3)';
            styledObj.border_width = 2;
            styledObj.opacity = 0.8;
            styledObj.useTransparentFill = true;
            styledObj.radius_pixels = obj.radius_pixels || 5;
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
                    createFlagFilterButton();
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

// Updated showStyleCustomizerPopup function - fix the populateDropdowns call
function showStyleCustomizerPopup(catalogName) {
    // Prevent multiple popups
    const existingPopup = document.getElementById('region-style-popup');
    if (existingPopup) {
        existingPopup.parentNode.removeChild(existingPopup);
    }

    // Default styles
    const regionStyles = {
        borderColor: '#FF0000',
        backgroundColor: 'transparent',
        borderWidth: 2,
        opacity: 0.8,
    };

    // Extract the API-compatible catalog name (remove catalogs/ prefix if present)
    let catalogNameForApi = catalogName;
    if (catalogName.startsWith('catalogs/')) {
        catalogNameForApi = catalogName.replace('catalogs/', '');
    }
    
    console.log('showStyleCustomizerPopup - Original catalog name:', catalogName);
    console.log('showStyleCustomizerPopup - API catalog name:', catalogNameForApi);

    // Create popup container
    const popup = document.createElement('div');
    popup.id = 'region-style-popup';
    Object.assign(popup.style, {
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        backgroundColor: '#333', border: '1px solid #555', borderRadius: '5px',
        padding: '15px', zIndex: '1500', width: '700px',
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
            border-top: none; z-index: 1600; max-height: 150px; overflow-y: auto;
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
    Object.assign(catalogNameDisplay.style, { color: '#4CAF50', fontSize: '14px', marginBottom: '10px' });
    
    const closeButton = document.createElement('button');
    closeButton.textContent = '×';
    Object.assign(closeButton.style, { position: 'absolute', top: '10px', right: '10px', backgroundColor: 'transparent', border: 'none', color: '#aaa', fontSize: '20px', cursor: 'pointer', padding: '0', width: '24px', height: '24px', lineHeight: '24px', textAlign: 'center', borderRadius: '12px' });
    closeButton.addEventListener('click', () => { if (popup && popup.parentNode) popup.parentNode.removeChild(popup); });

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
            });
            dropdownList.appendChild(item);
        });
        if (options.length > 0) {
            hiddenSelect.value = options[0].value;
            updateVisibleDisplay(options[0].value);
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
    const sizeDropdown = createSearchableDropdown('Size Column (Optional):');
    const radiusInput = document.createElement('input');
    radiusInput.type = 'number';
    radiusInput.min = '0';
    radiusInput.step = '0.1';
    Object.assign(radiusInput.style, inputStyle);
    const radiusGroup = document.createElement('div');
    const radiusLabel = document.createElement('label');
    radiusLabel.textContent = 'Radius (pixels):';
    Object.assign(radiusLabel.style, { display: 'block', marginBottom: '5px', color: '#aaa', fontFamily: 'Arial, sans-serif', fontSize: '13px' });
    radiusGroup.appendChild(radiusLabel);
    radiusGroup.appendChild(radiusInput);
    coordsFieldSet.appendChild(raDropdown.container);
    coordsFieldSet.appendChild(decDropdown.container);
    coordsFieldSet.appendChild(sizeDropdown.container);
    coordsFieldSet.appendChild(radiusGroup);
    leftColumn.appendChild(coordsFieldSet);

    const styleFieldSet = createFieldSet('Region Style');
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
    Object.assign(previewContainer.style, { height: '80px', backgroundColor: '#2e2e2e', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #555', overflow: 'hidden' });
    const previewMarker = document.createElement('div');
    Object.assign(previewMarker.style, { width: '50px', height: '50px', border: `${regionStyles.borderWidth}px solid ${regionStyles.borderColor}`, borderRadius: '50%', backgroundColor: regionStyles.backgroundColor, opacity: regionStyles.opacity, transition: 'all 0.2s ease' });
    previewContainer.appendChild(previewMarker);
    previewFieldSet.appendChild(previewContainer);
    rightColumn.appendChild(previewFieldSet);

    function populateDropdowns(catalogNameParam) {
        const dropdowns = [raDropdown, decDropdown, sizeDropdown];
        dropdowns.forEach(dd => {
            dd.dropdownList.innerHTML = '<div class="dropdown-item">Loading...</div>';
            dd.hiddenSelect.innerHTML = '';
        });

        // FIXED: Use the API-compatible catalog name
        console.log('populateDropdowns called with:', catalogNameParam);
        console.log('Using catalogNameForApi:', catalogNameForApi);

        fetch(`/catalog-columns/?catalog_name=${encodeURIComponent(catalogNameForApi)}`)
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
                const sizeKeywords = ['radius', 'size', 'rad', 'fwhm', 'major', 'maj'];

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
    
    // FIXED: Call populateDropdowns with the API-compatible name
    populateDropdowns(catalogNameForApi);

    sizeDropdown.hiddenSelect.addEventListener('change', () => {
        const hasSizeColumn = sizeDropdown.hiddenSelect.value !== '';
        radiusInput.disabled = hasSizeColumn;
        radiusInput.style.opacity = hasSizeColumn ? '0.5' : '1';
        if (hasSizeColumn) radiusInput.value = '';
    });
    
    function updatePreview() {
        previewMarker.style.borderColor = borderColorInput.value;
        previewMarker.style.backgroundColor = transparentCheckbox.checked ? 'transparent' : bgColorInput.value;
        previewMarker.style.borderWidth = borderWidthSlider.value + 'px';
        previewMarker.style.opacity = opacitySlider.value;
    }
    [borderColorInput, bgColorInput, transparentCheckbox, borderWidthSlider, opacitySlider].forEach(el => el.addEventListener('input', updatePreview));

    const actionsContainer = document.createElement('div');
    Object.assign(actionsContainer.style, { display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '15px', borderTop: '1px solid #555' });
    
    const viewCatalogButton = document.createElement('button');
    viewCatalogButton.textContent = 'View Catalog';
    Object.assign(viewCatalogButton.style, { padding: '8px 16px', border: '1px solid #666', borderRadius: '4px', backgroundColor: '#555', color: '#fff', cursor: 'pointer', marginRight: 'auto' });
    viewCatalogButton.onclick = (e) => {
        e.preventDefault();
        showCatalogViewer(catalogNameForApi);
    };

    const applyButton = document.createElement('button');
    applyButton.textContent = 'Apply';
    Object.assign(applyButton.style, { padding: '8px 16px', border: 'none', borderRadius: '4px', backgroundColor: '#4CAF50', color: '#fff', cursor: 'pointer' });
    

    applyButton.addEventListener('click', () => {
        const newStyles = {
            raColumn: raDropdown.hiddenSelect.value,
            decColumn: decDropdown.hiddenSelect.value,
            sizeColumn: sizeDropdown.hiddenSelect.value,
            radius: radiusInput.value ? parseFloat(radiusInput.value) : 5,
            borderColor: borderColorInput.value,
            backgroundColor: transparentCheckbox.checked ? 'transparent' : bgColorInput.value,
            borderWidth: parseInt(borderWidthSlider.value, 10),
            opacity: parseFloat(opacitySlider.value)
        };
        
        console.log('[Apply Styles] Detailed style values:');
        console.log('  - borderColor (from color picker):', borderColorInput.value);
        console.log('  - backgroundColor:', transparentCheckbox.checked ? 'transparent' : bgColorInput.value);
        console.log('  - borderWidth (from slider):', parseInt(borderWidthSlider.value, 10));
        console.log('  - opacity (from slider):', parseFloat(opacitySlider.value));
        console.log('  - radius:', radiusInput.value ? parseFloat(radiusInput.value) : 5);
        console.log('  - Complete newStyles object:', newStyles);
        
        // Get the catalog name for loading
        const catalogNameForApi = catalogName.startsWith('catalogs/')
            ? catalogName.replace('catalogs/', '')
            : catalogName;
    
        console.log(`[Apply Styles] About to call loadCatalog with '${catalogNameForApi}' and styles:`, newStyles);
        
        // Close popup first
        if (popup && popup.parentNode) {
            popup.parentNode.removeChild(popup);
        }
        
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
    popup.appendChild(closeButton);
    columnsContainer.appendChild(leftColumn);
    columnsContainer.appendChild(rightColumn);
    popup.appendChild(columnsContainer);
    popup.appendChild(actionsContainer);
    document.body.appendChild(popup);
    makeDraggable(popup, title);
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
    dot.style.borderRadius = '50%';
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
            const response = await fetch('/upload-catalog/', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response' }));
                throw new Error(`Upload failed: ${response.status} - ${errorData.error || 'Unknown error'}`);
            }

            const result = await response.json();
            const newFilename = result.filename; // Get the unique filename from the response

            showNotification(result.message || 'Catalog uploaded successfully!', 3000, 'success');
            
            // --- REMOVED MAPPING POPUP ---
            // Don't show the mapping popup anymore
            // showCatalogFieldMappingPopup(newFilename);

            // Refresh the catalog list in the dropdown instead
            if (typeof refreshCatalogs === 'function') {
                 refreshCatalogs();
            }
            
            // Optional: Automatically load the newly uploaded catalog?
            // loadCatalog(newFilename);

        } catch (error) {
            console.error('Error uploading catalog:', error);
            showNotification(`Error: ${error.message}`, 4000, 'error');
        } finally {
            showNotification(false);
            // Clean up the dynamically created input element
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

    // Clear the overlay from the canvas
    if (typeof canvasClearCatalogOverlay === 'function') {
        canvasClearCatalogOverlay();
    }

    // Reset the global catalog data arrays
    window.loadedCatalogs = [];
    window.catalogData = [];
    window.catalogDataForOverlay = [];

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
    
    console.log("All catalogs cleared.");
}

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
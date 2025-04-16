// Load available catalogs


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

function loadCatalog(catalogName) {
    if (!catalogName) {
        showNotification('Please select a catalog first', 3000);
        return;
    }
    
    console.log(`Loading catalog: ${catalogName}`);
    
    // Store the current catalog name globally
    window.currentCatalogName = catalogName;
    
    // Set the active catalog
    activeCatalog = catalogName;
    
    // Show loading indicator
    showProgress(true, 'Loading catalog...');
    
    // Clear any existing catalog overlay
    clearCatalogOverlay();
    
    // Fetch catalog data from server using binary format for better performance
    // Add prevent_auto_load parameter to prevent unintended catalog loading
    fetch(`/catalog-binary/?catalog_name=${encodeURIComponent(catalogName)}&prevent_auto_load=true`, {
        method: 'GET'
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Failed to load catalog: ${response.statusText}`);
        }
        return response.arrayBuffer();
    })
    .then(arrayBuffer => {
        console.time('parseBinaryCatalog');
        
        // Parse binary data
        const dataView = new DataView(arrayBuffer);
        const numObjects = dataView.getUint32(0, false); // Big-endian
        
        const catalogData = [];
        let offset = 4; // Start after the count (4 bytes)
        
        for (let i = 0; i < numObjects; i++) {
            // Read x, y coordinates (2 floats)
            const x = dataView.getFloat32(offset, false);
            offset += 4;
            const y = dataView.getFloat32(offset, false);
            offset += 4;
            
            // Read ra, dec coordinates (2 floats)
            const ra = dataView.getFloat32(offset, false);
            offset += 4;
            const dec = dataView.getFloat32(offset, false);
            offset += 4;
            
            // Read radius (1 float)
            const radius = dataView.getFloat32(offset, false);
            offset += 4;
            
            // Read magnitude (1 float)
            const magnitude = dataView.getFloat32(offset, false);
            offset += 4;
            
            // Add to catalog data
            catalogData.push({
                x: x,
                y: y,
                ra: ra,
                dec: dec,
                radius_pixels: radius,
                magnitude: magnitude
            });
        }
        
        console.timeEnd('parseBinaryCatalog');
        console.log(`Loaded ${catalogData.length} objects from catalog`);
        
        // Get catalog info for display
        fetch(`/catalog-info/?catalog_name=${encodeURIComponent(catalogName)}`)
            .then(response => response.json())
            .then(catalogInfo => {
                // Add catalog overlay
                addCatalogOverlay(catalogData);

                // Display catalog info
                displayCatalogInfo(catalogInfo);

                createFlagFilterButton();

                
                // Hide loading indicator
                showProgress(false);
            })
            .catch(error => {
                console.error('Error fetching catalog info:', error);
                
                // Still add the overlay even if info fails
                addCatalogOverlay(catalogData);

                // Hide loading indicator
                showProgress(false);
            });
    })
    .catch(error => {
        console.error('Error loading catalog:', error);
        showProgress(false);
        showNotification(`Error: ${error.message || 'Failed to load catalog'}`, 3000);
    });
}

// Keep a reference to the core loadCatalog function
const coreLoadCatalog = loadCatalog;

// Make sure this function is added/updated
function updateCanvasOverlay() {
    console.log('[updateCanvasOverlay] Entered function.');
    console.log('[updateCanvasOverlay] Checking prerequisites:', {
        viewerExists: typeof viewer !== 'undefined' && viewer !== null,
        canvasExists: typeof window.catalogCanvas !== 'undefined' && window.catalogCanvas !== null,
        dataExists: typeof window.catalogDataForOverlay !== 'undefined' && window.catalogDataForOverlay !== null
    });

    if (!viewer || !window.catalogCanvas || !window.catalogDataForOverlay) {
        console.log('[updateCanvasOverlay] Exiting early due to missing prerequisites.');
        return;
    }

    const canvas = window.catalogCanvas;
    const ctx = canvas.getContext('2d');
    
    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Get viewport bounds with margin for panning
    const bounds = viewer.viewport.getBounds();
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
    
    // Set dot styling based on current styles
    const FIXED_RADIUS = 5; // Default radius in pixels
    const dotBorderWidth = regionStyles.borderWidth || 1;
    const dotBorderColor = regionStyles.borderColor || 'rgba(255, 165, 0, 0.7)';
    const dotFillColor = regionStyles.backgroundColor || 'transparent';
    const dotOpacity = regionStyles.opacity || 0.7;
    
    console.log('[updateCanvasOverlay] Reading styles:', {
        raw: regionStyles, // Log the whole object
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
        
        // Skip dots that should be hidden by filter
        if (flagFilterEnabled && obj.dataset && obj.dataset.passesFilter === 'false') {
            continue;
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
        
        // Convert image coordinates to viewport coordinates
        const viewportPoint = viewer.viewport.imageToViewportCoordinates(x, y);
        
        // Check if the point is within the viewport bounds
        if (viewportPoint.x >= viewportBounds.left && 
            viewportPoint.x <= viewportBounds.right && 
            viewportPoint.y >= viewportBounds.top && 
            viewportPoint.y <= viewportBounds.bottom) {
            
            // Convert viewport coordinates to canvas coordinates
            const pagePoint = viewer.viewport.viewportToViewerElementCoordinates(viewportPoint);
            
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
    
    // Optionally log the number of visible objects
    // console.log(`Canvas rendering: ${visibleCount} visible objects out of ${window.catalogDataForOverlay.length}`);
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
        showRegionInfo(tempDot, sourceObj);
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
    popup.style.maxWidth = '300px';
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






// Keep a reference to the original loadCatalog function
const originalLoadCatalog = window.loadCatalog;

// Override the original loadCatalog function to show the style customizer popup first
if (originalLoadCatalog) {
    window.loadCatalog = function(catalogName) {
        // Check if this is a direct call from apply button using stored catalog name
        if (window.currentStyleCatalogName === catalogName) {
            // Reset the stored name
            window.currentStyleCatalogName = null;
            
            // Call the original function
            return originalLoadCatalog.call(this, catalogName);
        } else {
            // Show the style customizer popup first
            showStyleCustomizerPopup(catalogName);
            
            // We don't immediately load the catalog here - it will be loaded when the user clicks Apply
            return false; // Prevent original click handler from continuing
        }
    };
}

// Modify the clearCatalog function to remove the filter button when catalog is cleared
const originalClearCatalog = window.clearCatalog;
if (originalClearCatalog) {
    window.clearCatalog = function() {
        // Call the original function to clear the catalog
        const result = originalClearCatalog();
        
        // Remove the filter button
        const filterButton = document.querySelector('.flag-filter-container');
        if (filterButton) {
            filterButton.remove();
        }
        
        return result;
    };
}

// Don't create the button on initial page load unless a catalog is already loaded
document.addEventListener("DOMContentLoaded", function() {
    // Only create the flag filter button if a catalog is already active
    if (activeCatalog) {
        createFlagFilterButton();
    }
});



// Replace your existing populateFlagDropdown function with this one
function populateFlagDropdown(dropdownContent) {
    // Clear existing content
    dropdownContent.innerHTML = '';
    
    // Add a "No Filter" option
    const noFilterItem = document.createElement('div');
    noFilterItem.className = 'flag-item';
    noFilterItem.textContent = 'No Filter (Show All)';
    noFilterItem.style.padding = '10px';
    noFilterItem.style.cursor = 'pointer';
    noFilterItem.style.borderBottom = '1px solid #444';
    noFilterItem.style.color = 'white';
    
    // Highlight if currently selected
    if (!flagFilterEnabled) {
        noFilterItem.style.backgroundColor = 'white';
        noFilterItem.style.color = 'black';
    }
    
    noFilterItem.addEventListener('mouseover', function() {
        if (!flagFilterEnabled) return;
        this.style.backgroundColor = '#333';
    });
    
    noFilterItem.addEventListener('mouseout', function() {
        if (!flagFilterEnabled) return;
        this.style.backgroundColor = 'transparent';
    });
    
    noFilterItem.addEventListener('click', function() {
        // Disable flag filtering
        flagFilterEnabled = false;
        currentFlagColumn = null;
        currentEnvValue = null;
        
        // Update the UI
        updateFlagFilterUI(dropdownContent);
        
        // Show all catalog dots
        if (window.catalogDots) {
            window.catalogDots.forEach(dot => {
                dot.style.display = 'block';
                dot.dataset.passesFilter = 'true';
            });
        }
        
        // Update overlay to refresh visibility
        updateOverlay();
        
        // Close the dropdown
        dropdownContent.style.display = 'none';
    });
    
    dropdownContent.appendChild(noFilterItem);
    
    // If no catalog is loaded, show a message
    if (!activeCatalog) {
        const noDataItem = document.createElement('div');
        noDataItem.style.padding = '10px';
        noDataItem.style.color = '#aaa';
        noDataItem.textContent = 'Load a catalog to see available flags';
        dropdownContent.appendChild(noDataItem);
        return;
    }
    
    // Check if we already have flag data in the cache
    if (window.catalogDataWithFlags) {
        // Use the cached data to build the flag dropdown
        buildFlagDropdownFromCache(dropdownContent);
    } else {
        // Show loading indicator
        const loadingItem = document.createElement('div');
        loadingItem.style.padding = '10px';
        loadingItem.style.color = '#aaa';
        loadingItem.textContent = 'Loading flag information...';
        dropdownContent.appendChild(loadingItem);
        
        // Load the flag data
        fetch(`/catalog-with-flags/${activeCatalog}`)
            .then(response => response.json())
            .then(data => {
                // Cache the data for future use
                window.catalogDataWithFlags = data;
                
                // Build the dropdown using the loaded data
                buildFlagDropdownFromCache(dropdownContent);
            })
            .catch(error => {
                console.error('Error loading flag data:', error);
                
                // Show error message
                dropdownContent.innerHTML = '';
                dropdownContent.appendChild(noFilterItem); // Keep the "No Filter" option
                
                const errorItem = document.createElement('div');
                errorItem.style.padding = '10px';
                errorItem.style.color = '#f44336';
                errorItem.textContent = 'Error loading catalog flags';
                dropdownContent.appendChild(errorItem);
            });
    }
}



// Replace the existing buildFlagDropdownFromCache function with this updated version
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
    
    // Debug logging to inspect the catalog data
    console.log("Inspecting catalog data:");
    console.log("Total catalog objects:", window.catalogDataWithFlags.length);
    
    // Collect all boolean columns from the cached data
    const booleanColumns = new Set();
    
    // Check for env column and collect unique env values
    let hasEnvColumn = false;
    const envValues = new Set();
    const rawEnvValues = []; // Store raw env values for debugging
    
    // Extract available columns from the first object
    const firstObj = window.catalogDataWithFlags[0];
    const columns = firstObj ? Object.keys(firstObj) : [];
    
    // Use the new detection function if we need to find RA/DEC columns
    const detectedColumns = detectCoordinateColumns(columns);
    const ra_col = detectedColumns.ra_column;
    const dec_col = detectedColumns.dec_column;
    
    // Loop through catalog objects to detect boolean columns and env values
    for (let i = 0; i < window.catalogDataWithFlags.length; i++) {
        const obj = window.catalogDataWithFlags[i];
        if (!obj) continue;
        
        // Check all keys in the object
        for (const [key, value] of Object.entries(obj)) {
            // Look specifically for env column
            if (key === 'env') {
                hasEnvColumn = true;
                if (value !== null && value !== undefined) {
                    // Store the raw value for inspection
                    rawEnvValues.push({index: i, value: value, type: typeof value});
                    
                    // Try to convert to number if it's not already
                    let envVal;
                    if (typeof value === 'number') {
                        envVal = value;
                    } else {
                        envVal = parseInt(value);
                    }
                    
                    if (!isNaN(envVal)) {
                        envValues.add(envVal);
                    }
                }
            }
            // Add boolean columns to the list
            else if (typeof value === 'boolean' || value === true || value === false || 
                value === 'True' || value === 'False' || value === 1 || value === 0) {
                booleanColumns.add(key);
            }
        }
        
        // Break early if we've found enough samples and have env values
        if (hasEnvColumn && envValues.size > 0 && i > 100) {
            break;
        }
    }
    
    // Print detailed debug info about env values
    console.log("Has env column:", hasEnvColumn);
    console.log("Raw env values found (first 20):", rawEnvValues.slice(0, 20));
    console.log("Unique env values after processing:", Array.from(envValues));
    console.log("Boolean columns:", Array.from(booleanColumns));
    
    // Convert boolean columns to array and sort
    const sortedColumns = Array.from(booleanColumns).sort();
    
    // Handle the case where we have no boolean columns or environment values
    if (sortedColumns.length === 0 && (!hasEnvColumn || envValues.size === 0)) {
        const noBooleansItem = document.createElement('div');
        noBooleansItem.style.padding = '10px';
        noBooleansItem.style.color = '#aaa';
        noBooleansItem.textContent = 'No boolean flags or environment values found';
        dropdownContent.appendChild(noBooleansItem);
        return;
    }
    
    // Start with environment section if available - place it at the top
    if (hasEnvColumn && envValues.size > 0) {
        // Add environment section header
        const envHeader = document.createElement('div');
        envHeader.style.padding = '8px 10px';
        envHeader.style.fontWeight = 'bold';
        envHeader.style.backgroundColor = '#333';
        envHeader.style.borderBottom = '1px solid #555';
        envHeader.textContent = 'Environment Filters';
        dropdownContent.appendChild(envHeader);
        
        // Convert envValues to array and sort numerically
        const sortedEnvValues = Array.from(envValues).sort((a, b) => a - b);
        
        // Add each environment value as a filter option
        sortedEnvValues.forEach(envValue => {
            const description = ENV_DESCRIPTIONS[envValue] || `Environment ${envValue}`;
            
            const envItem = document.createElement('div');
            envItem.className = 'flag-item env-item';
            envItem.textContent = `${envValue}: ${description}`;
            envItem.dataset.envValue = envValue;
            envItem.style.padding = '10px';
            envItem.style.cursor = 'pointer';
            envItem.style.borderBottom = '1px solid #444';
            envItem.style.color = 'white';
            
            // Highlight if currently selected
            if (flagFilterEnabled && currentFlagColumn === 'env' && 
                (currentEnvValue === envValue || String(currentEnvValue) === String(envValue))) {
                envItem.style.backgroundColor = 'white';
                envItem.style.color = 'black';
            }
            
            envItem.addEventListener('mouseover', function() {
                if (flagFilterEnabled && currentFlagColumn === 'env' && 
                    (currentEnvValue === envValue || String(currentEnvValue) === String(envValue))) return;
                this.style.backgroundColor = '#333';
            });
            
            envItem.addEventListener('mouseout', function() {
                if (flagFilterEnabled && currentFlagColumn === 'env' && 
                    (currentEnvValue === envValue || String(currentEnvValue) === String(envValue))) return;
                this.style.backgroundColor = 'transparent';
            });
            
            envItem.addEventListener('click', function() {
                // Enable environment filtering
                flagFilterEnabled = true;
                currentFlagColumn = 'env';
                currentEnvValue = envValue;
                
                console.log(`Selected environment filter: ${envValue} (${typeof envValue})`);
                
                // Update UI
                updateFlagFilterUI(dropdownContent);
                
                // Apply environment filter
                applyEnvFilter(envValue);
                
                // Close dropdown
                dropdownContent.style.display = 'none';
            });
            
            dropdownContent.appendChild(envItem);
        });
        
        // Add section divider if we have boolean columns too
        if (sortedColumns.length > 0) {
            const divider = document.createElement('div');
            divider.style.height = '1px';
            divider.style.backgroundColor = '#555';
            divider.style.margin = '5px 0';
            dropdownContent.appendChild(divider);
            
            // Add boolean section header
            const booleanHeader = document.createElement('div');
            booleanHeader.style.padding = '8px 10px';
            booleanHeader.style.fontWeight = 'bold';
            booleanHeader.style.backgroundColor = '#333';
            booleanHeader.style.borderBottom = '1px solid #555';
            booleanHeader.textContent = 'Boolean Flags';
            dropdownContent.appendChild(booleanHeader);
        }
    } else if (sortedColumns.length > 0) {
        // Only add boolean header if we don't have env values
        const booleanHeader = document.createElement('div');
        booleanHeader.style.padding = '8px 10px';
        booleanHeader.style.fontWeight = 'bold';
        booleanHeader.style.backgroundColor = '#333';
        booleanHeader.style.borderBottom = '1px solid #555';
        booleanHeader.textContent = 'Boolean Flags';
        dropdownContent.appendChild(booleanHeader);
    }
    
    // Add each boolean column to the dropdown
    sortedColumns.forEach(column => {
        const flagItem = document.createElement('div');
        flagItem.className = 'flag-item';
        // Just show the column name without "Filter by:" prefix
        flagItem.textContent = column;
        flagItem.style.padding = '10px';
        flagItem.style.cursor = 'pointer';
        flagItem.style.borderBottom = '1px solid #444';
        flagItem.style.color = 'white';
        
        // Highlight if currently selected
        if (flagFilterEnabled && currentFlagColumn === column && currentEnvValue === null) {
            flagItem.style.backgroundColor = 'white';
            flagItem.style.color = 'black';
        }
        
        flagItem.addEventListener('mouseover', function() {
            if (flagFilterEnabled && currentFlagColumn === column && currentEnvValue === null) return;
            this.style.backgroundColor = '#333';
        });
        
        flagItem.addEventListener('mouseout', function() {
            if (flagFilterEnabled && currentFlagColumn === column && currentEnvValue === null) return;
            this.style.backgroundColor = 'transparent';
        });
        
        flagItem.addEventListener('click', function() {
            // Enable flag filtering with this column
            flagFilterEnabled = true;
            currentFlagColumn = column;
            currentEnvValue = null;
            
            // Update the UI
            updateFlagFilterUI(dropdownContent);
            
            // Apply the filter locally
            applyLocalFilter(column);
            
            // Close the dropdown
            dropdownContent.style.display = 'none';
        });
        
        dropdownContent.appendChild(flagItem);
    });
}

// Add event listener to initialize flag filter button when catalog is loaded
document.addEventListener("DOMContentLoaded", function() {
    // Create the flag filter button
    createFlagFilterButton();
    
// Update the original loadCatalog function to preload flag data
const originalLoadCatalog = window.loadCatalog;
if (originalLoadCatalog) {
    window.loadCatalog = function(catalogName) {
        // Call the original function to load basic catalog data
        const result = originalLoadCatalog(catalogName);
        
        // Clear any previously cached flag data
        window.catalogDataWithFlags = null;
        
        // After loading the basic catalog, preload the flag data
        if (window.catalogDataForOverlay && window.catalogDataForOverlay.length > 0) {
            console.log('Preloading catalog flag data...');
            
            // Load the flag data in the background
            fetch(`/catalog-with-flags/${catalogName}`)
                .then(response => response.json())
                .then(data => {
                    window.catalogDataWithFlags = data;
                    console.log('Flag data preloaded successfully');
                })
                .catch(error => {
                    console.error('Error preloading flag data:', error);
                });
        }
        
        return result;
    };
}
});


// Modify the addCatalogOverlay function to store additional properties
function extendCatalogOverlay() {
    const originalAddCatalogOverlay = window.addCatalogOverlay;
    if (originalAddCatalogOverlay) {
        window.addCatalogOverlay = function(catalogData) {
            console.log("Canvas-based addCatalogOverlay called with styles:", regionStyles);
            
            // Clear any existing overlay
            clearCatalogOverlay();
            
            if (!viewer) {
                console.error("No viewer available for catalog overlay");
                return;
            }
            
            if (!catalogData || catalogData.length === 0) {
                console.error("No catalog data available");
                return;
            }
            
            console.log(`Adding overlay with ${catalogData.length} objects with canvas rendering`);
            
            // Store catalog data for later use
            window.catalogDataForOverlay = catalogData;
            
            // Create container for the canvas
            const container = document.createElement('div');
            container.className = 'catalog-overlay-container';
            container.style.position = 'absolute';
            container.style.top = '0';
            container.style.left = '0';
            container.style.width = '100%';
            container.style.height = '100%';
            container.style.pointerEvents = 'none'; // IMPORTANT: Set to none so mouse events pass through
            
            // Create canvas element
            const canvas = document.createElement('canvas');
            canvas.className = 'catalog-canvas';
            canvas.style.position = 'absolute';
            canvas.style.top = '0';
            canvas.style.left = '0';
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            canvas.style.pointerEvents = 'none'; // IMPORTANT: Let mouse events pass through
            
            // Set canvas size to match container
            const viewerElement = document.getElementById('openseadragon');
            canvas.width = viewerElement.clientWidth;
            canvas.height = viewerElement.clientHeight;
            
            // Add canvas to container
            container.appendChild(canvas);
            
            // Add the container to the viewer
            viewerElement.appendChild(container);
            
            // Store the container and canvas for later reference
            window.catalogOverlayContainer = container;
            window.catalogCanvas = canvas;
            
            // Create a source reference map for click detection
            window.catalogSourceMap = [];
            
            // Instead of putting click handler on canvas, put it on the viewer element
            // This allows normal OpenSeadragon interactions but still enables our click detection
            viewerElement.addEventListener('click', function(event) {
                // Only handle clicks if not dragging
                if (viewer.isMouseDown()) return;
                
                handleCanvasClick(event);
            });
            
            // Add window resize handler to update canvas size
            window.addEventListener('resize', function() {
                if (window.catalogCanvas) {
                    window.catalogCanvas.width = viewerElement.clientWidth;
                    window.catalogCanvas.height = viewerElement.clientHeight;
                    updateCanvasOverlay(); // Redraw after resize
                }
            });
            
            // Initial update
            updateCanvasOverlay();
            
            // Add event handlers for viewer movement
            viewer.addHandler('animation', updateCanvasOverlay);
            viewer.addHandler('open', updateCanvasOverlay);
            
            // Use throttled update for pan events to improve performance
            const throttledUpdate = throttle(updateCanvasOverlay, 100);
            viewer.addHandler('pan', throttledUpdate);
            
            // Use debounced update for zoom to reduce flickering
            const debouncedZoomUpdate = debounce(updateCanvasOverlay, 50);
            viewer.addHandler('zoom', debouncedZoomUpdate);
            
            return catalogData.length; // Return the number of objects added
        };
        
    }
}

// Call the extension function
extendCatalogOverlay();






// Region Style Customizer
// This code adds a popup to customize region styles when loading a catalog

// Store current style settings
let regionStyles = {
    borderColor: '#ff0000', // Default red border
    backgroundColor: 'transparent', // Default transparent background
    borderWidth: 1, // Default 1px border width
    opacity: 0.7 // Default opacity
};

// Function to create and show the style customizer popup
// Function to create and show the style customizer popup
function showStyleCustomizerPopup(catalogName) {
    // Check if popup already exists
    let popup = document.getElementById('style-customizer-popup');
    
    if (popup) {
        // If popup exists, check if the catalog-name-display element exists before updating it
        const catalogNameDisplay = document.getElementById('catalog-name-display');
        if (catalogNameDisplay) {
            catalogNameDisplay.textContent = catalogName;
        }
        popup.style.display = 'block';
        return;
    }
    
    // Create popup container
    popup = document.createElement('div');
    popup.id = 'style-customizer-popup';
    popup.style.position = 'fixed';
    popup.style.top = '50%';
    popup.style.left = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
    popup.style.backgroundColor = '#333';
    popup.style.border = '1px solid #555';
    popup.style.borderRadius = '5px';
    popup.style.padding = '15px';
    popup.style.zIndex = '1500';
    popup.style.width = '350px';
    popup.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)';
    
    // Create title
    const title = document.createElement('h3');
    title.innerHTML = 'Region Style Settings';
    title.style.margin = '0 0 15px 0';
    title.style.color = '#fff';
    title.style.fontFamily = 'Arial, sans-serif';
    title.style.fontSize = '18px';
    title.style.fontWeight = 'bold';
    title.style.borderBottom = '1px solid #555';
    title.style.paddingBottom = '10px';
    
    // Add catalog name display
    const catalogNameDisplay = document.createElement('div');
    catalogNameDisplay.id = 'catalog-name-display';
    catalogNameDisplay.textContent = catalogName;
    catalogNameDisplay.style.color = '#4CAF50';
    catalogNameDisplay.style.fontSize = '14px';
    catalogNameDisplay.style.marginBottom = '10px';
    
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
    closeButton.style.padding = '0';
    closeButton.style.width = '24px';
    closeButton.style.height = '24px';
    closeButton.style.lineHeight = '24px';
    closeButton.style.textAlign = 'center';
    closeButton.style.borderRadius = '12px';
    closeButton.addEventListener('mouseover', () => {
        closeButton.style.backgroundColor = '#555';
        closeButton.style.color = '#fff';
    });
    closeButton.addEventListener('mouseout', () => {
        closeButton.style.backgroundColor = 'transparent';
        closeButton.style.color = '#aaa';
    });
    closeButton.addEventListener('click', () => {
        // popup.style.display = 'none'; // Hide the popup
        if (popup && popup.parentNode) { // Remove the popup from the DOM
             popup.parentNode.removeChild(popup);
        }
    });
    
    // Create form content
    const formContainer = document.createElement('div');
    formContainer.style.display = 'flex';
    formContainer.style.flexDirection = 'column';
    formContainer.style.gap = '15px';
    
    // Border color selector
    const borderColorGroup = document.createElement('div');
    
    const borderColorLabel = document.createElement('label');
    borderColorLabel.textContent = 'Border Color:';
    borderColorLabel.style.display = 'block';
    borderColorLabel.style.marginBottom = '5px';
    borderColorLabel.style.color = '#aaa';
    borderColorLabel.style.fontFamily = 'Arial, sans-serif';
    
    const borderColorInput = document.createElement('input');
    borderColorInput.type = 'color';
    borderColorInput.id = 'border-color-input';
    borderColorInput.value = regionStyles.borderColor;
    borderColorInput.style.width = '100%';
    borderColorInput.style.height = '30px';
    borderColorInput.style.cursor = 'pointer';
    borderColorInput.style.backgroundColor = '#444';
    borderColorInput.style.border = '1px solid #555';
    borderColorInput.style.borderRadius = '3px';
    
    borderColorGroup.appendChild(borderColorLabel);
    borderColorGroup.appendChild(borderColorInput);
    
    // Background color selector
    const bgColorGroup = document.createElement('div');
    
    const bgColorLabel = document.createElement('label');
    bgColorLabel.textContent = 'Fill Color:';
    bgColorLabel.style.display = 'block';
    bgColorLabel.style.marginBottom = '5px';
    bgColorLabel.style.color = '#aaa';
    bgColorLabel.style.fontFamily = 'Arial, sans-serif';
    
    const bgColorContainer = document.createElement('div');
    bgColorContainer.style.display = 'flex';
    bgColorContainer.style.alignItems = 'center';
    bgColorContainer.style.gap = '10px';
    
    const bgColorInput = document.createElement('input');
    bgColorInput.type = 'color';
    bgColorInput.id = 'bg-color-input';
    bgColorInput.value = regionStyles.backgroundColor === 'transparent' ? '#ffffff' : regionStyles.backgroundColor;
    bgColorInput.style.width = '85%';
    bgColorInput.style.height = '30px';
    bgColorInput.style.cursor = 'pointer';
    bgColorInput.style.backgroundColor = '#444';
    bgColorInput.style.border = '1px solid #555';
    bgColorInput.style.borderRadius = '3px';
    
    const transparentCheckbox = document.createElement('input');
    transparentCheckbox.type = 'checkbox';
    transparentCheckbox.id = 'transparent-bg-checkbox';
    transparentCheckbox.checked = regionStyles.backgroundColor === 'transparent';
    transparentCheckbox.style.margin = '0';
    transparentCheckbox.style.cursor = 'pointer';
    
    const transparentLabel = document.createElement('label');
    transparentLabel.textContent = 'Transparent';
    transparentLabel.htmlFor = 'transparent-bg-checkbox';
    transparentLabel.style.color = '#aaa';
    transparentLabel.style.fontFamily = 'Arial, sans-serif';
    transparentLabel.style.marginLeft = '5px';
    
    // Toggle background color input based on transparent checkbox
    transparentCheckbox.addEventListener('change', () => {
        bgColorInput.disabled = transparentCheckbox.checked;
        bgColorInput.style.opacity = transparentCheckbox.checked ? '0.5' : '1';
    });
    
    // Initialize state
    bgColorInput.disabled = transparentCheckbox.checked;
    bgColorInput.style.opacity = transparentCheckbox.checked ? '0.5' : '1';
    
    bgColorContainer.appendChild(bgColorInput);
    
    const transparentContainer = document.createElement('div');
    transparentContainer.style.display = 'flex';
    transparentContainer.style.alignItems = 'center';
    transparentContainer.appendChild(transparentCheckbox);
    transparentContainer.appendChild(transparentLabel);
    
    bgColorContainer.appendChild(transparentContainer);
    
    bgColorGroup.appendChild(bgColorLabel);
    bgColorGroup.appendChild(bgColorContainer);
    
    // Border width slider
    const borderWidthGroup = document.createElement('div');
    
    const borderWidthLabel = document.createElement('label');
    borderWidthLabel.textContent = 'Border Width:';
    borderWidthLabel.style.display = 'block';
    borderWidthLabel.style.marginBottom = '5px';
    borderWidthLabel.style.color = '#aaa';
    borderWidthLabel.style.fontFamily = 'Arial, sans-serif';
    
    const borderWidthContainer = document.createElement('div');
    borderWidthContainer.style.display = 'flex';
    borderWidthContainer.style.alignItems = 'center';
    borderWidthContainer.style.gap = '10px';
    
    const borderWidthSlider = document.createElement('input');
    borderWidthSlider.type = 'range';
    borderWidthSlider.id = 'border-width-slider';
    borderWidthSlider.min = '1';
    borderWidthSlider.max = '5';
    borderWidthSlider.step = '1';
    borderWidthSlider.value = regionStyles.borderWidth;
    borderWidthSlider.style.flex = '1';
    borderWidthSlider.style.height = '6px';
    borderWidthSlider.style.appearance = 'none';
    borderWidthSlider.style.backgroundColor = '#555';
    borderWidthSlider.style.borderRadius = '3px';
    borderWidthSlider.style.outline = 'none';
    borderWidthSlider.style.cursor = 'pointer';
    
    // Add custom CSS for the slider thumb
    const sliderStyle = document.createElement('style');
    sliderStyle.textContent = `
        #border-width-slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #4CAF50;
            cursor: pointer;
        }
        #border-width-slider::-moz-range-thumb {
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #4CAF50;
            cursor: pointer;
            border: none;
        }
    `;
    document.head.appendChild(sliderStyle);
    
    const borderWidthValue = document.createElement('span');
    borderWidthValue.id = 'border-width-value';
    borderWidthValue.textContent = regionStyles.borderWidth + 'px';
    borderWidthValue.style.minWidth = '35px';
    borderWidthValue.style.textAlign = 'center';
    borderWidthValue.style.color = '#fff';
    borderWidthValue.style.fontFamily = 'Arial, sans-serif';
    
    // Update the displayed value when the slider changes
    borderWidthSlider.addEventListener('input', function() {
        borderWidthValue.textContent = this.value + 'px';
    });
    
    borderWidthContainer.appendChild(borderWidthSlider);
    borderWidthContainer.appendChild(borderWidthValue);
    
    borderWidthGroup.appendChild(borderWidthLabel);
    borderWidthGroup.appendChild(borderWidthContainer);
    
    // Opacity slider
    const opacityGroup = document.createElement('div');
    
    const opacityLabel = document.createElement('label');
    opacityLabel.textContent = 'Opacity:';
    opacityLabel.style.display = 'block';
    opacityLabel.style.marginBottom = '5px';
    opacityLabel.style.color = '#aaa';
    opacityLabel.style.fontFamily = 'Arial, sans-serif';
    
    const opacityContainer = document.createElement('div');
    opacityContainer.style.display = 'flex';
    opacityContainer.style.alignItems = 'center';
    opacityContainer.style.gap = '10px';
    
    const opacitySlider = document.createElement('input');
    opacitySlider.type = 'range';
    opacitySlider.id = 'opacity-slider';
    opacitySlider.min = '0';
    opacitySlider.max = '1';
    opacitySlider.step = '0.1';
    opacitySlider.value = regionStyles.opacity;
    opacitySlider.style.flex = '1';
    opacitySlider.style.height = '6px';
    opacitySlider.style.appearance = 'none';
    opacitySlider.style.backgroundColor = '#555';
    opacitySlider.style.borderRadius = '3px';
    opacitySlider.style.outline = 'none';
    opacitySlider.style.cursor = 'pointer';
    
    const opacityStyle = document.createElement('style');
    opacityStyle.textContent = `
        #opacity-slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #2196F3;
            cursor: pointer;
        }
        #opacity-slider::-moz-range-thumb {
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #2196F3;
            cursor: pointer;
            border: none;
        }
    `;
    document.head.appendChild(opacityStyle);
    
    const opacityValue = document.createElement('span');
    opacityValue.id = 'opacity-value';
    opacityValue.textContent = regionStyles.opacity;
    opacityValue.style.minWidth = '35px';
    opacityValue.style.textAlign = 'center';
    opacityValue.style.color = '#fff';
    opacityValue.style.fontFamily = 'Arial, sans-serif';
    
    // Update the displayed value when the slider changes
    opacitySlider.addEventListener('input', function() {
        opacityValue.textContent = this.value;
    });
    
    opacityContainer.appendChild(opacitySlider);
    opacityContainer.appendChild(opacityValue);
    
    opacityGroup.appendChild(opacityLabel);
    opacityGroup.appendChild(opacityContainer);
    
    // Preview area
    const previewGroup = document.createElement('div');
    
    const previewLabel = document.createElement('label');
    previewLabel.textContent = 'Preview:';
    previewLabel.style.display = 'block';
    previewLabel.style.marginBottom = '5px';
    previewLabel.style.color = '#aaa';
    previewLabel.style.fontFamily = 'Arial, sans-serif';
    
    const previewArea = document.createElement('div');
    previewArea.style.width = '100%';
    previewArea.style.height = '60px';
    previewArea.style.backgroundColor = '#222';
    previewArea.style.borderRadius = '3px';
    previewArea.style.display = 'flex';
    previewArea.style.justifyContent = 'center';
    previewArea.style.alignItems = 'center';
    
    const previewDot = document.createElement('div');
    previewDot.id = 'preview-dot';
    previewDot.style.width = '30px';
    previewDot.style.height = '30px';
    previewDot.style.borderRadius = '50%';
    previewDot.style.borderWidth = regionStyles.borderWidth + 'px';
    previewDot.style.borderStyle = 'solid';
    previewDot.style.borderColor = regionStyles.borderColor;
    previewDot.style.backgroundColor = regionStyles.backgroundColor;
    previewDot.style.opacity = regionStyles.opacity;
    
    // Function to update preview dot
    function updatePreview() {
        const bgColor = transparentCheckbox.checked ? 'transparent' : bgColorInput.value;
        previewDot.style.borderWidth = borderWidthSlider.value + 'px';
        previewDot.style.borderColor = borderColorInput.value;
        previewDot.style.backgroundColor = bgColor;
        previewDot.style.opacity = opacitySlider.value;
    }
    
    // Add event listeners to update preview in real-time
    borderColorInput.addEventListener('input', updatePreview);
    bgColorInput.addEventListener('input', updatePreview);
    transparentCheckbox.addEventListener('change', updatePreview);
    borderWidthSlider.addEventListener('input', updatePreview);
    opacitySlider.addEventListener('input', updatePreview);
    
    previewArea.appendChild(previewDot);
    previewGroup.appendChild(previewLabel);
    previewGroup.appendChild(previewArea);
    
    // Button container
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'space-between';
    buttonContainer.style.marginTop = '10px';
    
    // Apply button
    const applyButton = document.createElement('button');
    applyButton.textContent = 'Apply';
    applyButton.style.flex = '1';
    applyButton.style.marginRight = '10px';
    applyButton.style.padding = '8px 0';
    applyButton.style.backgroundColor = '#4CAF50';
    applyButton.style.color = '#fff';
    applyButton.style.border = 'none';
    applyButton.style.borderRadius = '3px';
    applyButton.style.cursor = 'pointer';
    applyButton.style.fontFamily = 'Arial, sans-serif';
    applyButton.style.fontSize = '14px';
    
    applyButton.addEventListener('mouseover', () => {
        applyButton.style.backgroundColor = '#45a049';
    });
    applyButton.addEventListener('mouseout', () => {
        applyButton.style.backgroundColor = '#4CAF50';
    });
    applyButton.addEventListener('click', () => {
        const newBorderColor = borderColorInput.value;
        const newBgColor = transparentCheckbox.checked ? 'transparent' : bgColorInput.value;
        const newBorderWidth = parseInt(borderWidthSlider.value);
        const newOpacity = parseFloat(opacitySlider.value);

        console.log('[Apply Styles] Values from inputs:', {
            borderColor: newBorderColor,
            backgroundColor: newBgColor,
            borderWidth: newBorderWidth,
            opacity: newOpacity
        });

        // Save settings
        regionStyles = { // Update the local regionStyles object
            borderColor: newBorderColor,
            backgroundColor: newBgColor,
            borderWidth: newBorderWidth,
            opacity: newOpacity
        };
        console.log('[Apply Styles] Updated regionStyles object:', regionStyles);

        // Hide popup
        // popup.style.display = 'none'; // Instead of hiding, remove it
        if (popup && popup.parentNode) {
             popup.parentNode.removeChild(popup);
        }

        // Apply styles to existing regions - REMOVED as we use canvas overlay now
        // console.log('[Apply Styles] Calling applyStylesToRegions...');
        // applyStylesToRegions();

        // REMOVED: Update the overlay immediately - loadCatalog will handle the initial draw
        // console.log('[Apply Styles] Triggering immediate overlay update...');
        // if (typeof updateCanvasOverlay === 'function') {
        //     updateCanvasOverlay(); // Prefer canvas update if available
        // } else if (typeof updateOverlay === 'function') {
        //     updateOverlay(); // Fallback to div overlay update
        // }

        // NOW load the catalog using the selected styles
        if (typeof coreLoadCatalog === 'function') { // Use the core load function
             console.log('[Apply Styles] Calling coreLoadCatalog to load/display with new styles...');
             coreLoadCatalog(catalogName); // <-- Call the core function directly
         } else {
              console.error("coreLoadCatalog function not found! Cannot load catalog after applying styles.");
         }
    });
    
    // Cancel button
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.style.flex = '1';
    cancelButton.style.padding = '8px 0';
    cancelButton.style.backgroundColor = '#f44336';
    cancelButton.style.color = '#fff';
    cancelButton.style.border = 'none';
    cancelButton.style.borderRadius = '3px';
    cancelButton.style.cursor = 'pointer';
    cancelButton.style.fontFamily = 'Arial, sans-serif';
    cancelButton.style.fontSize = '14px';
    
    cancelButton.addEventListener('mouseover', () => {
        cancelButton.style.backgroundColor = '#d32f2f';
    });
    cancelButton.addEventListener('mouseout', () => {
        cancelButton.style.backgroundColor = '#f44336';
    });
    cancelButton.addEventListener('click', () => {
        // popup.style.display = 'none'; // Hide the popup
        if (popup && popup.parentNode) { // Remove the popup from the DOM
             popup.parentNode.removeChild(popup);
        }
    });
    
    buttonContainer.appendChild(applyButton);
    buttonContainer.appendChild(cancelButton);
    
    // Add all elements to form container
    formContainer.appendChild(borderColorGroup);
    formContainer.appendChild(bgColorGroup);
    formContainer.appendChild(borderWidthGroup);
    formContainer.appendChild(opacityGroup);
    formContainer.appendChild(previewGroup);
    
    // Add all elements to popup
    popup.appendChild(title);
    popup.appendChild(catalogNameDisplay); // Add the catalog name display element
    popup.appendChild(closeButton);
    popup.appendChild(formContainer);
    popup.appendChild(buttonContainer);
    
    // Make popup draggable
    makeDraggable(popup, title);
    
    // Add popup to document
    document.body.appendChild(popup);
}

// Function to apply styles to all catalog regions
function applyStylesToRegions() {
    if (!window.catalogDots) return;
    
    console.log("Applying styles to regions:", regionStyles);
    
    // Apply to all dots
    window.catalogDots.forEach(dot => {
        dot.style.border = `${regionStyles.borderWidth}px solid ${regionStyles.borderColor}`;
        dot.style.backgroundColor = regionStyles.backgroundColor;
        dot.style.opacity = regionStyles.opacity;
        
        // Also store the original style to restore later - this is needed for proper styling persistence
        dot.dataset.originalBorder = `${regionStyles.borderWidth}px solid ${regionStyles.borderColor}`;
    });
}


// Create catalog dots with custom styles
function createCatalogDotWithStyles(obj, dotIndex) {
    const FIXED_RADIUS = 5;
    
    // Create a dot element
    const dot = document.createElement('div');
    dot.className = 'catalog-dot';
    dot.style.position = 'absolute';
    dot.style.width = `${FIXED_RADIUS * 2}px`;
    dot.style.height = `${FIXED_RADIUS * 2}px`;
    dot.style.borderRadius = '50%';
    
    // Apply custom styles
    dot.style.backgroundColor = regionStyles.backgroundColor;
    dot.style.border = `${regionStyles.borderWidth}px solid ${regionStyles.borderColor}`;
    dot.style.opacity = regionStyles.opacity;
    
    dot.style.boxSizing = 'border-box';
    dot.style.transform = 'translate(-50%, -50%)';
    dot.style.pointerEvents = 'auto';  // Make dots clickable
    dot.style.cursor = 'pointer';  // Show pointer cursor on hover
    dot.style.transition = 'width 0.1s, height 0.1s';
    
    // Store the object data with the dot
    dot.dataset.x = obj.x;
    dot.dataset.y = obj.y;
    dot.dataset.ra = obj.ra;
    dot.dataset.dec = obj.dec;
    dot.dataset.radius = obj.radius_pixels || FIXED_RADIUS;
    dot.dataset.index = dotIndex;  // Store the index for reference
    
    // Store original style
    dot.dataset.originalBorder = `${regionStyles.borderWidth}px solid ${regionStyles.borderColor}`;
    dot.dataset.originalZIndex = 'auto';

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

        showProgress(true, 'Uploading catalog...');

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
            showProgress(false);
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
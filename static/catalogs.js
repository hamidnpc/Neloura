// Load available catalogs
function loadCatalogs() {
    fetch('/list-catalogs/')
    .then(response => response.json())
    .then(data => {
        updateCatalogDropdown(data.catalogs);
    })
    .catch(error => {
        console.error('Error loading catalogs:', error);
    });
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
                loadCatalog(catalog.name);
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


// Add catalog overlay to the viewer
function addCatalogOverlay(catalogData) {
    console.log("Adding catalog overlay");
    
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
    
    console.log(`Adding overlay with ${catalogData.length} objects`);
    
    // Initialize WCS transformation
    initializeWCSTransformation();
    
    // Store catalog data for later use
    window.catalogDataForOverlay = catalogData;
    
    // Create a container for all dots
    const container = document.createElement('div');
    container.className = 'catalog-overlay-container';
    container.style.position = 'absolute';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.pointerEvents = 'none';
    
    // Add the container to the viewer
    const viewerElement = document.getElementById('openseadragon');
    viewerElement.appendChild(container);
    
    // Store the container for later reference
    window.catalogOverlayContainer = container;
    
    // Fixed radius for all dots (in pixels)
    const FIXED_RADIUS = 5;
    
    // Create dots for each catalog object
    const dots = [];
    for (let i = 0; i < catalogData.length; i++) {
        const obj = catalogData[i];
        
        // Convert RA/DEC to pixel coordinates if we have WCS
        if (obj.ra !== undefined && obj.dec !== undefined && window.parsedWCS && window.parsedWCS.hasWCS) {
            const pixelCoords = celestialToPixel(obj.ra, obj.dec, window.parsedWCS);
            obj.x = pixelCoords.x;
            obj.y = pixelCoords.y;
            
            // Log the first few conversions for debugging
            if (i < 5) {
                console.log(`Catalog object ${i}: RA=${obj.ra.toFixed(6)}, DEC=${obj.dec.toFixed(6)} -> X=${obj.x.toFixed(2)}, Y=${obj.y.toFixed(2)}`);
            }
        }
        
        // Create a dot element
        const dot = document.createElement('div');
        dot.className = 'catalog-dot';
        dot.style.position = 'absolute';
        dot.style.width = `${FIXED_RADIUS * 2}px`;
        dot.style.height = `${FIXED_RADIUS * 2}px`;
        dot.style.borderRadius = '50%';
        dot.style.backgroundColor = 'transparent';
        dot.style.border = '1px solid rgba(255, 165, 0, 0.7)';  // Orange border
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
        dot.dataset.index = i;  // Store the index for reference
        
        // Add click event listener
        dot.addEventListener('click', function(event) {
            event.stopPropagation();  // Prevent the click from propagating to the viewer
            showRegionInfo(this, obj);
        });
        
        // Add to container
        container.appendChild(dot);
        dots.push(dot);
    }
    
    // Store dots for later reference
    window.catalogDots = dots;
    
    // Initial update
    updateOverlay();
    
    // Add event handlers for viewer movement
    viewer.addHandler('animation', updateOverlay);
    viewer.addHandler('open', updateOverlay);
    
    // Use throttled update for pan events to improve performance
    const throttledUpdate = throttle(updateOverlay, 100);
    viewer.addHandler('pan', throttledUpdate);
    
    // Use debounced update for zoom to reduce flickering
    const debouncedZoomUpdate = debounce(updateOverlay, 50);
    viewer.addHandler('zoom', debouncedZoomUpdate);
    
    // No notification about loaded catalog objects
    return dots;
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


// Update clearCatalogOverlay to hide all popups
function clearCatalogOverlay() {
    // Hide all info popups
    hideAllInfoPopups();
    
    // Remove the overlay container
    if (window.catalogOverlayContainer) {
        const viewerElement = document.getElementById('openseadragon');
        if (viewerElement && viewerElement.contains(window.catalogOverlayContainer)) {
            viewerElement.removeChild(window.catalogOverlayContainer);
        }
        window.catalogOverlayContainer = null;
    }
    
    // Clear the dots array
    window.catalogDots = null;
    
    // Clear the catalog data
    window.catalogDataForOverlay = null;
    
    console.log("Cleared catalog overlay");
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



// Define a global variable to track the current flag filtering state
let flagFilterEnabled = false;
let currentFlagColumn = null; // Will store the name of the current boolean column being used for filtering

let flagFilterButton = null;

function createFlagFilterButton() {
    // Check if button already exists
    const existingButton = document.querySelector('.flag-filter-container');
    if (existingButton) {
        return existingButton;
    }
    
    // Create a button container
    const flagFilterContainer = document.createElement('div');
    flagFilterContainer.className = 'flag-filter-container';
    flagFilterContainer.style.display = 'inline-block'; // Make sure it's visible
    
    // Create the main button with just an icon
    flagFilterButton = document.createElement('button');
    flagFilterButton.className = 'flag-filter-button';
    flagFilterButton.style.display = 'none'; // Hide by default

    // Use a filter icon
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.style.fill = "currentColor";
    
    // Create the filter icon paths
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", "M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z");
    svg.appendChild(path);
    
    flagFilterButton.appendChild(svg);
    flagFilterButton.title = 'Filter regions by catalog flags';
    
    // Find the histogram button to copy styles
    const histogramButton = document.querySelector('.dynamic-range-button');
    
    // Copy all styles from histogram button if it exists
    if (histogramButton) {
        // Get computed style of histogram button
        const histoStyle = window.getComputedStyle(histogramButton);
        
        // Apply the same styles to our filter button
        flagFilterButton.style.padding = histoStyle.padding;
        flagFilterButton.style.backgroundColor = histoStyle.backgroundColor;
        flagFilterButton.style.color = histoStyle.color;
        flagFilterButton.style.border = histoStyle.border;
        flagFilterButton.style.borderRadius = histoStyle.borderRadius;
        flagFilterButton.style.width = histoStyle.width;
        flagFilterButton.style.height = histoStyle.height;
        flagFilterButton.style.cursor = 'pointer';
        flagFilterButton.style.display = 'flex';
        flagFilterButton.style.alignItems = 'center';
        flagFilterButton.style.justifyContent = 'center';
        flagFilterButton.style.marginRight = '5px';
    } else {
        // Fallback styles if histogram button is not found
        flagFilterButton.style.padding = '6px';
        flagFilterButton.style.backgroundColor = '#444';
        flagFilterButton.style.color = '#fff';
        flagFilterButton.style.border = 'none';
        flagFilterButton.style.borderRadius = '4px';
        flagFilterButton.style.cursor = 'pointer';
        flagFilterButton.style.width = '32px';
        flagFilterButton.style.height = '32px';
        flagFilterButton.style.display = 'flex';
        flagFilterButton.style.alignItems = 'center';
        flagFilterButton.style.justifyContent = 'center';
        flagFilterButton.style.marginRight = '5px';
    }
    
    // Add event listener
    flagFilterButton.addEventListener('click', function() {
        // Create dropdown content if it doesn't exist yet
        if (!flagFilterContainer.querySelector('.flag-dropdown-content')) {
            const dropdownContent = document.createElement('div');
            dropdownContent.className = 'flag-dropdown-content';
            dropdownContent.style.display = 'none';
            dropdownContent.style.position = 'absolute';
            dropdownContent.style.backgroundColor = '#222';
            dropdownContent.style.minWidth = '200px';
            dropdownContent.style.boxShadow = '0px 8px 16px 0px rgba(0,0,0,0.4)';
            dropdownContent.style.zIndex = '1000';
            dropdownContent.style.borderRadius = '4px';
            dropdownContent.style.top = '100%';
            dropdownContent.style.right = '0';
            dropdownContent.style.marginTop = '5px';
            
            // Add a loading message initially
            const loadingItem = document.createElement('div');
            loadingItem.style.padding = '10px';
            loadingItem.style.color = '#aaa';
            loadingItem.textContent = 'Loading flag options...';
            dropdownContent.appendChild(loadingItem);
            
            flagFilterContainer.appendChild(dropdownContent);
        }
        
        const dropdownContent = flagFilterContainer.querySelector('.flag-dropdown-content');
        if (dropdownContent.style.display === 'none') {
            dropdownContent.style.display = 'block';
            
            // If a catalog is loaded, populate the dropdown with boolean columns
            if (activeCatalog) {
                populateFlagDropdown(dropdownContent);
            }
        } else {
            dropdownContent.style.display = 'none';
        }
    });
    
    // Add the button to the container
    flagFilterContainer.appendChild(flagFilterButton);
    
    // Find the toolbar
    const toolbar = document.querySelector('.toolbar');
        
    // Find the histogram button or any other reference element in the toolbar
    const existingHistogramButton = toolbar.querySelector('.dynamic-range-button');
    const zoomInButton = toolbar.querySelector('button:first-child'); // Fallback reference

    // Insert the flag filter button in the appropriate position
  // Insert the flag filter button in the appropriate position
    if (existingHistogramButton) {
        // Insert before the histogram button
        toolbar.insertBefore(flagFilterContainer, existingHistogramButton);
        console.log("Inserted flag filter button before histogram button");
    } else if (zoomInButton) {
        // Fallback: Insert before the first button (likely zoom in)
        toolbar.insertBefore(flagFilterContainer, zoomInButton);
        console.log("Inserted flag filter button before first button");
    } else {
        // Last resort: Add to beginning of toolbar
        toolbar.prepend(flagFilterContainer);
        console.log("Prepended flag filter button to toolbar");
    }
        
    console.log("Flag filter button created and added to toolbar");
    return flagFilterContainer;
}

// Update this function to make the button white when filter is applied
function updateFlagFilterUI(dropdownContent) {
    // Check if the button exists first
    if (flagFilterButton) {
        if (flagFilterEnabled) {
            // Make the button white when filter is applied
            flagFilterButton.style.color = '#ffffff'; // Bright white color
        } else {
            // Reset to default color (likely white already, but ensuring consistency)
            flagFilterButton.style.color = '#ffffff';
        }
    }
    
    // Update dropdown items
    const flagItems = dropdownContent.querySelectorAll('.flag-item');
    flagItems.forEach(item => {
        if ((item.textContent === 'No Filter (Show All)' && !flagFilterEnabled) ||
            (item.textContent === currentFlagColumn && flagFilterEnabled)) {
            item.style.backgroundColor = 'white';
            item.style.color = 'black';

        } else {
            item.style.backgroundColor = 'transparent';
        }
    });
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



// Replace your existing buildFlagDropdownFromCache function with this one
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
    
    // Add debug logging to inspect the catalog data
    console.log("Inspecting catalog data:");
    console.log("Total catalog objects:", window.catalogDataWithFlags.length);
    
    // Log the first 5 catalog objects to see their structure
    console.log("First 5 catalog objects:");
    for (let i = 0; i < 5 && i < window.catalogDataWithFlags.length; i++) {
        console.log(`Object ${i}:`, window.catalogDataWithFlags[i]);
        if (window.catalogDataWithFlags[i] && 'env' in window.catalogDataWithFlags[i]) {
            console.log(`  env value: ${window.catalogDataWithFlags[i].env} (${typeof window.catalogDataWithFlags[i].env})`);
        } else {
            console.log(`  env column not found in object ${i}`);
        }
    }
    
    // Collect all boolean columns from the cached data
    const booleanColumns = new Set();
    
    // Check for env column and collect unique env values
    let hasEnvColumn = false;
    const envValues = new Set();
    const rawEnvValues = []; // Store raw env values for debugging
    
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
            // Call the original function
            const result = originalAddCatalogOverlay(catalogData);
            
            // Ensure the flag filter button exists
            createFlagFilterButton();
            
            // Make sure we load catalog data with flags for filtering
            if (activeCatalog) {
                loadCatalogWithFlags(activeCatalog);  // ADD THIS LINE
            }
            
            // Apply any existing filter
            if (flagFilterEnabled && currentFlagColumn) {
                if (currentFlagColumn === 'env' && currentEnvValue !== null) {
                    applyEnvFilter(currentEnvValue);
                } else {
                    applyLocalFilter(currentFlagColumn);
                }
            }
            
            return result;
        };
    }
}

// Call the extension function
extendCatalogOverlay();


// New endpoint to get all catalog data with flags in a single request
function loadCatalogWithFlags(catalogName) {
    showProgress(true, 'Loading catalog with flag data...');
    
    fetch(`/catalog-with-flags/${catalogName}`)
        .then(response => response.json())
        .then(data => {
            // Store the complete catalog data with flags in a global variable
            window.catalogDataWithFlags = data;
            
            // Add environment column if it doesn't exist
            console.log("Adding or verifying env column to catalog data");
            const envExists = data.length > 0 && 'env' in data[0];
            
            if (!envExists) {
                console.log("env column not found in data. Adding simulated environment values.");
                
                // Add env column with values 1-10 based on position in catalog
                // This distributes objects across all environment types for testing
                window.catalogDataWithFlags.forEach((obj, index) => {
                    // Determine environment value (1-10) based on object's position or other attributes
                    // This is just a demonstration - you'd replace this with your actual environment determination logic
                    const envValue = (index % 10) + 1; // Values from 1 to 10
                    obj.env = envValue; // Add the env property to each object
                });
                
                console.log("Added env column to catalog data. First few objects:");
                for (let i = 0; i < 5 && i < window.catalogDataWithFlags.length; i++) {
                    console.log(`  Object ${i} env value: ${window.catalogDataWithFlags[i].env}`);
                }
            } else {
                console.log("env column already exists in data");
            }
            
            // Apply any active filters without making additional requests
            if (flagFilterEnabled && currentFlagColumn) {
                applyLocalFilter(currentFlagColumn);
            }
            
            showProgress(false);
        })
        .catch(error => {
            console.error('Error loading catalog with flags:', error);
            showProgress(false);
            showNotification('Error loading catalog data', 3000);
        });
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
        popup.style.display = 'none';
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
        // Save settings and apply to catalog regions
        regionStyles = {
            borderColor: borderColorInput.value,
            backgroundColor: transparentCheckbox.checked ? 'transparent' : bgColorInput.value,
            borderWidth: parseInt(borderWidthSlider.value),
            opacity: parseFloat(opacitySlider.value)
        };
        
        // Hide popup
        popup.style.display = 'none';
        
        // Store the current catalog name to use in subsequent functions
        window.currentStyleCatalogName = catalogName;
        
        // Call the original loadCatalog function directly
        originalLoadCatalog(catalogName);
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
        popup.style.display = 'none';
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

// Override the original addCatalogOverlay function to apply styles
const originalAddCatalogOverlay = window.addCatalogOverlay;
if (originalAddCatalogOverlay) {
    window.addCatalogOverlay = function(catalogData) {
        console.log("Custom addCatalogOverlay called with styles:", regionStyles);
        
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
        
        console.log(`Adding overlay with ${catalogData.length} objects and custom styles`);
        
        // Store catalog data for later use
        window.catalogDataForOverlay = catalogData;
        
        // Create a container for all dots
        const container = document.createElement('div');
        container.className = 'catalog-overlay-container';
        container.style.position = 'absolute';
        container.style.top = '0';
        container.style.left = '0';
        container.style.width = '100%';
        container.style.height = '100%';
        container.style.pointerEvents = 'none';
        
        // Add the container to the viewer
        const viewerElement = document.getElementById('openseadragon');
        viewerElement.appendChild(container);
        
        // Store the container for later reference
        window.catalogOverlayContainer = container;
        
        // Create dots for each catalog object with custom styles
        const dots = [];
        for (let i = 0; i < catalogData.length; i++) {
            const obj = catalogData[i];
            
            // Create a dot with custom styles
            const dot = createCatalogDotWithStyles(obj, i);
            
            // Add click event listener
            dot.addEventListener('click', function(event) {
                event.stopPropagation();  // Prevent the click from propagating to the viewer
                showRegionInfo(this, obj);
            });
            
            // Add to container
            container.appendChild(dot);
            dots.push(dot);
        }
        
        // Store dots for later reference
        window.catalogDots = dots;
        
        // Initial update
        updateOverlay();
        
        // Add event handlers for viewer movement
        viewer.addHandler('animation', updateOverlay);
        viewer.addHandler('open', updateOverlay);
        
        // Use throttled update for pan events to improve performance
        const throttledUpdate = throttle(updateOverlay, 100);
        viewer.addHandler('pan', throttledUpdate);
        
        // Use debounced update for zoom to reduce flickering
        const debouncedZoomUpdate = debounce(updateOverlay, 50);
        viewer.addHandler('zoom', debouncedZoomUpdate);
        
        return dots;
    };
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

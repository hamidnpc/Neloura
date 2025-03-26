// canvas-catalog-overlay.js - Fixed canvas implementation

// Utility functions for throttling and debouncing
function throttle(func, wait) {
    let lastCall = 0;
    return function(...args) {
        const now = Date.now();
        if (now - lastCall >= wait) {
            lastCall = now;
            return func.apply(this, args);
        }
    };
}

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// Main function to add the catalog overlay using canvas
function canvasAddCatalogOverlay(catalogData) {
    console.log("Using canvas catalog overlay function");
    
    // Clear any existing overlay
    canvasClearCatalogOverlay();
    
    if (!viewer) {
        console.error("No viewer available for catalog overlay");
        return;
    }
    
    if (!catalogData || catalogData.length === 0) {
        console.error("No catalog data available");
        return;
    }
    
    console.log(`Adding overlay with ${catalogData.length} objects using canvas rendering`);
    
    // Initialize WCS transformation if needed
    if (typeof initializeWCSTransformation === 'function') {
        initializeWCSTransformation();
    }
    
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
    container.style.pointerEvents = 'none'; // Container doesn't block events
    
    // Create canvas element
    const canvas = document.createElement('canvas');
    canvas.className = 'catalog-canvas';
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none'; // Canvas doesn't block events
    
    // Set canvas size
    const viewerElement = document.getElementById('openseadragon');
    canvas.width = viewerElement.clientWidth;
    canvas.height = viewerElement.clientHeight;
    
    // Add canvas to container
    container.appendChild(canvas);
    
    // Create an invisible overlay for click handling ONLY
    const clickOverlay = document.createElement('div');
    clickOverlay.className = 'catalog-click-overlay';
    clickOverlay.style.position = 'absolute';
    clickOverlay.style.top = '0';
    clickOverlay.style.left = '0';
    clickOverlay.style.width = '100%';
    clickOverlay.style.height = '100%';
    clickOverlay.style.pointerEvents = 'none'; // Changed to 'none' - doesn't block events
    clickOverlay.style.background = 'transparent';
    clickOverlay.style.zIndex = '5';
    
    // Add to container
    container.appendChild(clickOverlay);
    
    // Add container to viewer
    viewerElement.appendChild(container);
    
    // Set up a separate click detector with special handling
    const clickDetector = document.createElement('div');
    clickDetector.className = 'catalog-click-detector';
    clickDetector.style.position = 'absolute';
    clickDetector.style.top = '0';
    clickDetector.style.left = '0';
    clickDetector.style.width = '100%';
    clickDetector.style.height = '100%';
    clickDetector.style.background = 'transparent';
    clickDetector.style.pointerEvents = 'auto'; // This will catch clicks
    clickDetector.style.zIndex = '4'; // Below other UI elements
    
    viewerElement.appendChild(clickDetector);
    window.catalogClickDetector = clickDetector;
    
    // Store references
    window.catalogOverlayContainer = container;
    window.catalogCanvas = canvas;
    window.catalogClickOverlay = clickOverlay;
    window.catalogSourceMap = [];
    
    // Track mouse position for click vs. drag detection
    let mouseDownPos = null;
    let isDragging = false; // Track if a drag is in progress
    
    // Set up a proper click detection system on the click detector
    // that won't interfere with OpenSeadragon's drag and zoom
    
    clickDetector.addEventListener('mousedown', function(event) {
        mouseDownPos = {
            x: event.clientX,
            y: event.clientY
        };
        isDragging = false;
    });
    
    clickDetector.addEventListener('mousemove', function(event) {
        if (mouseDownPos) {
            const dx = event.clientX - mouseDownPos.x;
            const dy = event.clientY - mouseDownPos.y;
            const distance = Math.sqrt(dx*dx + dy*dy);
            
            if (distance > 5) {
                isDragging = true;
            }
        }
    });
    
    clickDetector.addEventListener('mouseup', function(event) {
        if (!mouseDownPos) return;
        
        // Only handle as a click if it wasn't a drag
        if (!isDragging) {
            canvasHandleClick(event);
        }
        
        mouseDownPos = null;
        isDragging = false;
    });
    
    // Add resize handler
    window.addEventListener('resize', function() {
        if (window.catalogCanvas) {
            window.catalogCanvas.width = viewerElement.clientWidth;
            window.catalogCanvas.height = viewerElement.clientHeight;
            canvasUpdateOverlay(); // Redraw after resize
        }
    });
    
    // Initial update
    canvasUpdateOverlay();
    
    // Add event handlers
    viewer.addHandler('animation', canvasUpdateOverlay);
    viewer.addHandler('open', canvasUpdateOverlay);
    
    const throttledUpdate = throttle(canvasUpdateOverlay, 100);
    viewer.addHandler('pan', throttledUpdate);
    
    const debouncedZoomUpdate = debounce(canvasUpdateOverlay, 50);
    viewer.addHandler('zoom', debouncedZoomUpdate);
    
    return catalogData.length;
}

// Function to update the canvas overlay
function canvasUpdateOverlay() {
    if (!viewer || !window.catalogCanvas || !window.catalogDataForOverlay) return;

    const canvas = window.catalogCanvas;
    const ctx = canvas.getContext('2d');
    
    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Get viewport bounds
    const bounds = viewer.viewport.getBounds();
    const viewportBounds = {
        left: bounds.x - 0.2,
        top: bounds.y - 0.2,
        right: bounds.x + bounds.width + 0.2,
        bottom: bounds.y + bounds.height + 0.2
    };
    
    // Clear the source map
    window.catalogSourceMap = [];
    
    // Count visible objects
    let visibleCount = 0;
    
    // Get styles
    const FIXED_RADIUS = 5;
    const dotBorderWidth = window.regionStyles ? window.regionStyles.borderWidth || 1 : 1;
    const dotBorderColor = window.regionStyles ? window.regionStyles.borderColor || 'rgba(255, 165, 0, 0.7)' : 'rgba(255, 165, 0, 0.7)';
    const dotFillColor = window.regionStyles ? window.regionStyles.backgroundColor || 'transparent' : 'transparent';
    const dotOpacity = window.regionStyles ? window.regionStyles.opacity || 0.7 : 0.7;
    
    // Set opacity
    ctx.globalAlpha = dotOpacity;
    
    // Process each object
    for (let i = 0; i < window.catalogDataForOverlay.length; i++) {
        const obj = window.catalogDataForOverlay[i];
        
        // Skip filtered objects
        if (window.flagFilterEnabled && obj.dataset && obj.dataset.passesFilter === 'false') {
            continue;
        }
        
        // Get coordinates
        let x = obj.x;
        let y = obj.y;
        
        // Convert RA/DEC if needed
        if (obj.ra !== undefined && obj.dec !== undefined && window.parsedWCS && window.parsedWCS.hasWCS) {
            if (typeof celestialToPixel === 'function') {
                const pixelCoords = celestialToPixel(obj.ra, obj.dec, window.parsedWCS);
                x = pixelCoords.x;
                y = pixelCoords.y;
            }
        }
        
        // Convert to viewport
        const viewportPoint = viewer.viewport.imageToViewportCoordinates(x, y);
        
        // Check if in viewport
        if (viewportPoint.x >= viewportBounds.left && 
            viewportPoint.x <= viewportBounds.right && 
            viewportPoint.y >= viewportBounds.top && 
            viewportPoint.y <= viewportBounds.bottom) {
            
            // Convert to screen coordinates
            const pagePoint = viewer.viewport.viewportToViewerElementCoordinates(viewportPoint);
            
            // Get radius
            const radius = obj.radius_pixels || FIXED_RADIUS;
            
            // Draw dot
            ctx.beginPath();
            ctx.arc(pagePoint.x, pagePoint.y, radius, 0, 2 * Math.PI, false);
            
            // Style
            ctx.lineWidth = dotBorderWidth;
            ctx.strokeStyle = dotBorderColor;
            
            // Fill if needed
            if (dotFillColor !== 'transparent') {
                ctx.fillStyle = dotFillColor;
                ctx.fill();
            }
            
            // Draw border
            ctx.stroke();
            
            // Store for click detection
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
    
    console.log(`Canvas rendering: ${visibleCount} visible objects out of ${window.catalogDataForOverlay.length}`);
}

// Function to handle clicks on the canvas overlay
function canvasHandleClick(event) {
    console.log("Canvas click handler called", event);
    
    if (!window.catalogSourceMap || !window.catalogDataForOverlay) {
        console.error("Missing data for click handling", {
            sourcesAvailable: !!window.catalogSourceMap,
            catalogAvailable: !!window.catalogDataForOverlay
        });
        return;
    }
    
    // Get click coordinates relative to the viewer
    const viewerElement = document.getElementById('openseadragon');
    const rect = viewerElement.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;
    
    console.log("Click coordinates:", clickX, clickY);
    console.log("Source map has", window.catalogSourceMap.length, "items");
    
    // Find closest source to the click point
    let closestSource = null;
    let closestDistance = Infinity;
    const hitRadius = 10; // Increased click radius
    
    for (const source of window.catalogSourceMap) {
        const dx = source.x - clickX;
        const dy = source.y - clickY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance <= Math.max(hitRadius, source.radius) && distance < closestDistance) {
            closestDistance = distance;
            closestSource = source;
        }
    }
    
    // Show info if source found
    if (closestSource) {
        console.log("Found closest source:", closestSource);
        const sourceObj = window.catalogDataForOverlay[closestSource.sourceIndex];
        if (!sourceObj) {
            console.error("Source object not found at index:", closestSource.sourceIndex);
            return;
        }
        
        console.log("Source object:", sourceObj);
        
        // Create a temporary dot element for the popup
        const tempDot = document.createElement('div');
        tempDot.className = 'catalog-dot temp-dot';
        
        // Add all properties from source object to dataset
        tempDot.dataset.x = sourceObj.x?.toString() || '';
        tempDot.dataset.y = sourceObj.y?.toString() || '';
        tempDot.dataset.ra = sourceObj.ra ? sourceObj.ra.toString() : "";
        tempDot.dataset.dec = sourceObj.dec ? sourceObj.dec.toString() : "";
        tempDot.dataset.radius = (sourceObj.radius_pixels || 5).toString();
        tempDot.dataset.index = closestSource.sourceIndex.toString();
        
        // Style and position it like a real catalog dot
        tempDot.style.position = 'absolute';
        tempDot.style.left = closestSource.x + 'px';
        tempDot.style.top = closestSource.y + 'px';
        tempDot.style.width = (sourceObj.radius_pixels || 5) * 2 + 'px';
        tempDot.style.height = (sourceObj.radius_pixels || 5) * 2 + 'px';
        tempDot.style.borderRadius = '50%';
        tempDot.style.backgroundColor = 'transparent';
        tempDot.style.border = '1px solid rgba(255, 165, 0, 0.7)';
        tempDot.style.boxSizing = 'border-box';
        tempDot.style.transform = 'translate(-50%, -50%)';
        tempDot.style.zIndex = '1000';
        tempDot.style.pointerEvents = 'none'; // Ensure it doesn't interfere with interactions
        
        // Add to the viewer
        viewerElement.appendChild(tempDot);
        
        // Highlight source in the canvas
        canvasHighlightSource(closestSource.sourceIndex);
        
        try {
            // Show region info popup
            if (typeof showRegionInfo === 'function') {
                showRegionInfo(tempDot, sourceObj);
            } else {
                console.error("showRegionInfo function not available");
                
                // Clean up temp dot if we can't show info
                if (tempDot.parentNode) {
                    tempDot.parentNode.removeChild(tempDot);
                }
            }
        } catch (error) {
            console.error("Error showing region info:", error);
            
            // Clean up temp dot on error
            if (tempDot.parentNode) {
                tempDot.parentNode.removeChild(tempDot);
            }
        }
    } else {
        console.log("No source found near click position");
    }
}

// Function to highlight a selected source
function canvasHighlightSource(selectedIndex) {
    if (!viewer || !window.catalogCanvas || !window.catalogDataForOverlay) return;
    
    // Get context
    const canvas = window.catalogCanvas;
    const ctx = canvas.getContext('2d');
    
    // Find source
    const source = window.catalogSourceMap.find(s => s.sourceIndex === selectedIndex);
    if (!source) return;
    
    // Draw highlight
    ctx.globalAlpha = 1.0;
    
    // Outer glow
    ctx.beginPath();
    ctx.arc(source.x, source.y, source.radius + 3, 0, 2 * Math.PI, false);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'yellow';
    ctx.stroke();
    
    // Reset opacity
    ctx.globalAlpha = window.regionStyles ? window.regionStyles.opacity || 0.7 : 0.7;
}

// Function to clear the catalog overlay
function canvasClearCatalogOverlay() {
    // Hide popups
    if (typeof hideAllInfoPopups === 'function') {
        hideAllInfoPopups();
    }
    
    // Remove container
    if (window.catalogOverlayContainer) {
        const viewerElement = document.getElementById('openseadragon');
        if (viewerElement && viewerElement.contains(window.catalogOverlayContainer)) {
            viewerElement.removeChild(window.catalogOverlayContainer);
        }
        window.catalogOverlayContainer = null;
    }
    
    // Remove click detector
    if (window.catalogClickDetector) {
        const viewerElement = document.getElementById('openseadragon');
        if (viewerElement && viewerElement.contains(window.catalogClickDetector)) {
            viewerElement.removeChild(window.catalogClickDetector);
        }
        window.catalogClickDetector = null;
    }
    
    // Clear references
    window.catalogCanvas = null;
    window.catalogSourceMap = null;
    window.catalogDataForOverlay = null;
    
    console.log("CANVAS VERSION: Cleared catalog overlay");
}

// Debug helper for showRegionInfo
function debugShowRegionInfo() {
    console.log("Checking showRegionInfo function...");
    console.log("showRegionInfo exists:", typeof showRegionInfo === 'function');
    
    if (typeof showRegionInfo === 'function') {
        // Get the function source
        const funcStr = showRegionInfo.toString();
        console.log("showRegionInfo first 100 characters:", funcStr.substring(0, 100) + "...");
        
        // Check if it uses getBoundingClientRect
        console.log("Uses getBoundingClientRect:", funcStr.includes("getBoundingClientRect"));
        
        // Check if it uses any specific class names
        console.log("Uses catalog-dot class:", funcStr.includes("catalog-dot"));
    }
}

// Main initialization function to override existing methods with canvas versions
function initCanvasImplementation() {
    console.log("INSTALLING CANVAS IMPLEMENTATION");
    
    // Store original functions (if they exist)
    const originalAddCatalogOverlay = window.addCatalogOverlay;
    const originalClearCatalogOverlay = window.clearCatalogOverlay;
    
    // Replace with canvas versions
    window.addCatalogOverlay = canvasAddCatalogOverlay;
    window.clearCatalogOverlay = canvasClearCatalogOverlay;
    
    // Also expose canvas functions with their original names
    window.canvasAddCatalogOverlay = canvasAddCatalogOverlay;
    window.canvasUpdateOverlay = canvasUpdateOverlay;
    window.canvasHandleClick = canvasHandleClick;
    window.canvasHighlightSource = canvasHighlightSource;
    window.canvasClearCatalogOverlay = canvasClearCatalogOverlay;
    
    // Add testing function
    window.testCanvasImplementation = function() {
        const dots = document.querySelectorAll('.catalog-dot');
        const canvas = document.querySelector('.catalog-canvas');
        
        console.log("CANVAS IMPLEMENTATION TEST:");
        console.log("- DOM dots:", dots.length);
        console.log("- Canvas exists:", canvas ? "YES" : "NO");
        console.log("- Using canvas implementation:", window.addCatalogOverlay === canvasAddCatalogOverlay ? "YES" : "NO");
        console.log("- Click detector exists:", document.querySelector('.catalog-click-detector') ? "YES" : "NO");
        
        // Try to diagnose any OpenSeadragon issues
        console.log("- OpenSeadragon viewer exists:", !!window.viewer);
        if (window.viewer) {
            console.log("- Viewer element:", document.getElementById('openseadragon') ? "YES" : "NO");
            console.log("- Mouse tracker enabled:", window.viewer.mouseTracker ? "YES" : "NO");
        }
    };
    
    // Try to fix any existing OpenSeadragon mouse tracker issues
    setTimeout(function() {
        if (window.viewer && !window.viewer.mouseTracker) {
            console.log("Attempting to reinitialize mouse tracker");
            // This is a workaround in case OpenSeadragon's mouse tracking got disabled
            try {
                window.viewer.addHandler('open', function() {
                    console.log("Viewer open - checking mouse tracker");
                    if (!window.viewer.mouseTracker) {
                        console.log("Viewer missing mouse tracker - attempting to fix");
                        // Force mouse tracker to reinitialize if possible
                        if (typeof OpenSeadragon !== 'undefined') {
                            window.viewer.innerTracker = new OpenSeadragon.MouseTracker({
                                element: window.viewer.canvas,
                                startDisabled: false
                            });
                        }
                    }
                });
            } catch (e) {
                console.error("Error fixing mouse tracker:", e);
            }
        }
    }, 1000);
    
    console.log("CANVAS IMPLEMENTATION COMPLETE");
    console.log("Original addCatalogOverlay:", originalAddCatalogOverlay ? "defined" : "undefined");
    console.log("New addCatalogOverlay:", window.addCatalogOverlay ? "defined" : "undefined");
}

// Set up the initialization to run when the page loads
if (document.readyState === 'complete') {
    initCanvasImplementation();
} else {
    window.addEventListener('load', initCanvasImplementation);
}
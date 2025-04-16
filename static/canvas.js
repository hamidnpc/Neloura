// canvas-catalog-overlay.js - Pure Canvas Implementation

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



// Function to verify all methods are present
function verifyCanvasPopupMethods() {
    console.log("Verifying canvasPopup methods:");
    
    // Create the object if it doesn't exist
    window.canvasPopup = window.canvasPopup || {};
    
    // List of required methods
    const requiredMethods = [
        'render', 'show', 'hide', 'isCloseButtonClicked', 'isPopupClicked',
        'isDragHandleClicked', 'startDrag', 'doDrag', 'endDrag'
    ];
    
    // Check each method
    for (const method of requiredMethods) {
        if (typeof window.canvasPopup[method] !== 'function') {
            console.error(`Method ${method} is missing or not a function!`);
            // Create stub method to prevent errors
            window.canvasPopup[method] = window.canvasPopup[method] || function() {
                console.log(`Stub method ${method} called`);
            };
        } else {
            console.log(`Method ${method} is properly defined`);
        }
    }
}

// Track the currently highlighted source index globally
window.currentHighlightedSourceIndex = -1;


// Create a custom popup system for the canvas with improved styling
// Add these properties to the canvasPopup object
// Create a hybrid canvasPopup system that maintains compatibility
// with the canvas implementation but actually uses DOM elements
window.canvasPopup = {
    // Properties
    active: false,
    sourceIndex: -1,
    x: 0,
    y: 0,
    width: 300,
    height: 200,
    content: {},
    isDragging: false,
    dragOffsetX: 0,
    dragOffsetY: 0,
    domElement: null,
    
    // Initialize the DOM element for the popup
    initDomElement: function() {
        // If already initialized, return
        if (this.domElement) return;
        
        // Create container for the popup
        const popup = document.createElement('div');
        popup.id = 'canvas-dom-popup';
        popup.style.position = 'absolute';
        popup.style.top = '0';
        popup.style.left = '0';
        popup.style.backgroundColor = 'rgba(42, 42, 42, 0.95)';
        popup.style.color = 'white';
        popup.style.padding = '0';
        popup.style.borderRadius = '8px';
        popup.style.boxShadow = '0 4px 10px rgba(0, 0, 0, 0.5)';
        popup.style.fontFamily = 'Arial, sans-serif';
        popup.style.fontSize = '14px';
        popup.style.zIndex = '1000';
        popup.style.display = 'none';
        popup.style.width = this.width + 'px';
        popup.style.maxWidth = '350px';
        popup.style.border = '1px solid rgba(255, 255, 255, 0.2)';
        popup.style.backdropFilter = 'blur(5px)';
        popup.style.webkitBackdropFilter = 'blur(5px)';
        
        // Create header with title and close button
        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.padding = '10px 12px';
        header.style.borderBottom = '1px solid rgba(255, 255, 255, 0.2)';
        header.style.cursor = 'move';
        
        // Add title
        const title = document.createElement('div');
        title.textContent = 'Source Information';
        title.style.fontWeight = 'bold';
        title.style.fontSize = '14px';
        
        // Add drag handle
        const dragHandle = document.createElement('div');
        dragHandle.style.display = 'flex';
        dragHandle.style.alignItems = 'center';
        dragHandle.style.gap = '8px';
        
        // Drag handle indicator (three lines)
        const dragIndicator = document.createElement('div');
        dragIndicator.style.display = 'flex';
        dragIndicator.style.flexDirection = 'column';
        dragIndicator.style.gap = '3px';
        dragIndicator.style.cursor = 'move';
        
        for (let i = 0; i < 3; i++) {
            const line = document.createElement('div');
            line.style.width = '15px';
            line.style.height = '2px';
            line.style.backgroundColor = 'rgba(255, 255, 255, 0.5)';
            dragIndicator.appendChild(line);
        }
        
        // Add close button
        const closeButton = document.createElement('button');
        closeButton.innerHTML = '&times;';
        closeButton.style.background = 'none';
        closeButton.style.border = 'none';
        closeButton.style.color = 'rgba(255, 255, 255, 0.7)';
        closeButton.style.fontSize = '20px';
        closeButton.style.cursor = 'pointer';
        closeButton.style.padding = '0 0 0 10px';
        closeButton.style.marginLeft = '5px';
        closeButton.style.display = 'flex';
        closeButton.style.alignItems = 'center';
        closeButton.style.justifyContent = 'center';
        closeButton.style.width = '24px';
        closeButton.style.height = '24px';
        
        closeButton.addEventListener('mouseover', () => {
            closeButton.style.color = 'white';
        });
        
        closeButton.addEventListener('mouseout', () => {
            closeButton.style.color = 'rgba(255, 255, 255, 0.7)';
        });
        
        closeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            this.hide();
        });
        
        dragHandle.appendChild(dragIndicator);
        dragHandle.appendChild(closeButton);
        
        header.appendChild(title);
        header.appendChild(dragHandle);
        
        // Create content area
        const content = document.createElement('div');
        content.id = 'canvas-dom-popup-content';
        content.style.padding = '12px';
        
        // Add header and content to popup
        popup.appendChild(header);
        popup.appendChild(content);
        
        // Add to document
        const viewerElement = document.getElementById('openseadragon');
        if (viewerElement) {
            viewerElement.appendChild(popup);
        } else {
            document.body.appendChild(popup);
        }
        
        // Store reference
        this.domElement = popup;
        
        // Make draggable
        this.makeDomPopupDraggable(popup, header);
        
        return popup;
    },
    
    // Make the DOM popup draggable
    makeDomPopupDraggable: function(popup, dragHandle) {
        let isDragging = false;
        let startX, startY;
        let startLeft, startTop;
        
        const startDrag = (e) => {
            isDragging = true;
            
            // Get initial positions
            startX = e.clientX;
            startY = e.clientY;
            startLeft = parseInt(popup.style.left) || 0;
            startTop = parseInt(popup.style.top) || 0;
            
            // Prevent text selection during drag
            document.body.style.userSelect = 'none';
            
            // Add drop shadow to indicate dragging
            popup.style.boxShadow = '0 10px 20px rgba(0, 0, 0, 0.7)';
        };
        
        const doDrag = (e) => {
            if (!isDragging) return;
            
            // Calculate new position
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            
            // Update position
            popup.style.left = (startLeft + dx) + 'px';
            popup.style.top = (startTop + dy) + 'px';
        };
        
        const endDrag = () => {
            if (!isDragging) return;
            isDragging = false;
            
            // Restore normal state
            document.body.style.userSelect = '';
            popup.style.boxShadow = '0 4px 10px rgba(0, 0, 0, 0.5)';
        };
        
        // Add event listeners
        dragHandle.addEventListener('mousedown', startDrag);
        document.addEventListener('mousemove', doDrag);
        document.addEventListener('mouseup', endDrag);
    },
    
    // Format a property value for display
    formatValue: function(value) {
        if (value === null || value === undefined) {
            return 'N/A';
        } else if (typeof value === 'number') {
            // Format numbers appropriately
            if (Math.abs(value) < 0.001 || Math.abs(value) >= 10000) {
                return value.toExponential(4);
            } else if (Number.isInteger(value)) {
                return value.toString();
            } else {
                return value.toFixed(4);
            }
        } else if (typeof value === 'boolean') {
            return value ? 'Yes' : 'No';
        } else {
            return String(value);
        }
    },
    
    // Render method - now updates the DOM element instead of drawing on canvas
    render: function(ctx) {
        if (!this.active || !this.domElement) return;
        
        // Position the DOM element
        const viewerElement = document.getElementById('openseadragon');
        const viewerWidth = viewerElement.clientWidth;
        const viewerHeight = viewerElement.clientHeight;
        
        // Position popup to the right of the point by default
        let popupX = this.x + 15;
        let popupY = this.y - this.height / 2;
        
        // Adjust if popup would extend beyond right edge
        if (popupX + this.width > viewerWidth) {
            popupX = this.x - this.width - 15;
        }
        
        // Adjust if popup would extend beyond top or bottom
        if (popupY < 10) {
            popupY = 10;
        } else if (popupY + this.height > viewerHeight - 10) {
            popupY = viewerHeight - this.height - 10;
        }
        
        // Update DOM element position
        this.domElement.style.left = popupX + 'px';
        this.domElement.style.top = popupY + 'px';
        
        // Ensure the DOM element is visible
        this.domElement.style.display = 'block';
    },
    
    // Show method - displays the popup for a source
    show: function(sourceIndex, x, y, content) {
        this.active = true;
        this.sourceIndex = sourceIndex;
        this.x = x;
        this.y = y;
        this.content = content || {};
        this.isDragging = false;
        
        // Make sure the DOM element is initialized
        this.initDomElement();
        
        // Base height calculation
        let baseHeight = 70; // Header + padding
        
        // Add height for standard fields
        const hasX = 'x' in this.content;
        const hasY = 'y' in this.content;
        const hasRA = 'ra' in this.content;
        const hasDec = 'dec' in this.content;
        const hasRadius = 'radius' in this.content;
        
        if (hasX && hasY) baseHeight += 24;
        if (hasRA && hasDec) baseHeight += 24;
        if (hasRadius) baseHeight += 24;
        
        // Add height for buttons
        baseHeight += 60;
        
        // Count remaining properties
        const standardFields = ['x', 'y', 'ra', 'dec', 'radius'];
        const remainingProps = Object.keys(this.content).filter(key => 
            !standardFields.includes(key) && !key.startsWith('_') && typeof this.content[key] !== 'function'
        ).length;
        
        // Calculate final height
        this.height = Math.min(baseHeight + remainingProps * 22, 400);
        
        // Update DOM content
        const contentElement = document.getElementById('canvas-dom-popup-content');
        if (contentElement) {
            let html = '';
            
            // Format coordinates with 6 decimal places
            if (hasX && hasY) {
                const x = typeof this.content.x === 'number' ? this.content.x.toFixed(2) : this.content.x;
                const y = typeof this.content.y === 'number' ? this.content.y.toFixed(2) : this.content.y;
                html += `
                    <div style="margin-bottom: 8px;">
                        <span style="color: #aaa;">Position (x, y):</span> ${x}, ${y}
                    </div>
                `;
            }
            
            if (hasRA && hasDec) {
                const ra = typeof this.content.ra === 'number' ? this.content.ra.toFixed(6) : this.content.ra;
                const dec = typeof this.content.dec === 'number' ? this.content.dec.toFixed(6) : this.content.dec;
                html += `
                    <div style="margin-bottom: 8px;">
                        <span style="color: #aaa;">Coordinates (RA, Dec):</span> ${ra}°, ${dec}°
                    </div>
                `;
            }
            
            if (hasRadius) {
                const radius = typeof this.content.radius === 'number' ? this.content.radius.toFixed(2) : this.content.radius;
                html += `
                    <div style="margin-bottom: 8px;">
                        <span style="color: #aaa;">Region Size:</span> ${radius} pixels
                    </div>
                `;
            }
            
            // Add links instead of buttons
            html += `
                <div style="margin-top: 12px; text-align: center;">
                    <button id="show-sed-btn" class="sed-button" style="padding: 6px 12px; background-color: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 5px;">Show SED</button>
                    <button id="show-properties-btn" class="properties-button" style="padding: 6px 12px; background-color: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer;">Show Properties</button>
                </div>
            `;
            
            // Display other properties but skip color, fillColor and anything below them
            // First create an array of keys we want to display
            const propertiesToDisplay = [];
            const skipAfter = ['color', 'fillColor'];
            let foundSkipProperty = false;
            
            for (const key of Object.keys(this.content)) {
                // Skip already displayed properties and internal ones
                if (['x', 'y', 'ra', 'dec', 'radius'].includes(key) || 
                    key.startsWith('_') || typeof this.content[key] === 'function') {
                    continue;
                }
                
                // Check if we've hit a property that we should skip after
                if (skipAfter.includes(key)) {
                    foundSkipProperty = true;
                    continue;
                }
                
                // Skip this property and all subsequent ones if we've found a skip property
                if (foundSkipProperty) {
                    continue;
                }
                
                propertiesToDisplay.push(key);
            }
            
            // Now display the filtered properties
            if (propertiesToDisplay.length > 0) {
                html += `<div style="margin-top: 15px; border-top: 1px solid rgba(255, 255, 255, 0.2); padding-top: 10px;">`;
                
                for (const key of propertiesToDisplay) {
                    // Format the value
                    let displayValue = this.formatValue(this.content[key]);
                    
                    // Don't show empty values
                    if (displayValue === 'N/A') continue;
                    
                    html += `
                        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                            <span style="color: #aaa; margin-right: 10px;">${key}:</span>
                            <span style="text-align: right;">${displayValue}</span>
                        </div>
                    `;
                }
                
                html += `</div>`;
            }
            
            contentElement.innerHTML = html;
            
            // Add event listeners to the buttons
            setTimeout(() => {
                const sedButton = document.getElementById('show-sed-btn');
                const propertiesButton = document.getElementById('show-properties-btn');
                
                if (sedButton) {
                    sedButton.addEventListener('click', (e) => {
                        e.stopPropagation();
                        
                        // Get the current catalog name
                        const catalogName = window.currentCatalogName || window.activeCatalog;
                        
                        // Show SED
                        if (typeof window.showSed === 'function') {
                            window.showSed(this.content.ra, this.content.dec, catalogName);
                        } else {
                            console.error('showSed function not found');
                        }
                    });
                }
                
                if (propertiesButton) {
                    propertiesButton.addEventListener('click', (e) => {
                        e.stopPropagation();
                        
                        // Get the current catalog name
                        const catalogName = window.currentCatalogName || window.activeCatalog;
                        
                        // Show properties
                        if (typeof window.showProperties === 'function') {
                            window.showProperties(this.content.ra, this.content.dec, catalogName);
                        } else {
                            console.error('showProperties function not found');
                        }
                    });
                }
            }, 0);
        }
        
        // Update position and show
        this.render(null);
        
        // Highlight the source on canvas
        if (window.currentHighlightedSourceIndex !== sourceIndex) {
            window.currentHighlightedSourceIndex = sourceIndex;
            
            // Force redraw canvas overlay
            if (typeof canvasUpdateOverlay === 'function') {
                canvasUpdateOverlay();
            }
        }
    },
    
    // Hide method - hides the popup
    hide: function() {
        this.active = false;
        
        // Reset highlighted source
        window.currentHighlightedSourceIndex = -1;
        
        // Reset dragging state
        this.isDragging = false;
        
        // Hide DOM element
        if (this.domElement) {
            this.domElement.style.display = 'none';
        }
        
        // Redraw canvas
        if (typeof canvasUpdateOverlay === 'function') {
            canvasUpdateOverlay();
        }
        
        console.log("Popup hidden successfully");
    },
    
    // Method to check if close button was clicked - not needed for DOM popup
    // but maintained for compatibility
    isCloseButtonClicked: function(x, y) {
        return false; // Not needed for DOM popup
    },
    
    // Method to check if popup was clicked - not needed for DOM popup
    // but maintained for compatibility
    isPopupClicked: function(x, y) {
        return false; // Not needed for DOM popup
    },
    
    // Method to check if drag handle was clicked - not needed for DOM popup
    // but maintained for compatibility
    isDragHandleClicked: function(x, y) {
        return false; // Not needed for DOM popup
    },
    
    // Method to start dragging - not needed for DOM popup
    // but maintained for compatibility
    startDrag: function(x, y) {
        // Not needed for DOM popup
    },
    
    // Method to update position during drag - not needed for DOM popup
    // but maintained for compatibility
    doDrag: function(x, y) {
        // Not needed for DOM popup
    },
    
    // Method to end dragging - not needed for DOM popup
    // but maintained for compatibility
    endDrag: function() {
        // Not needed for DOM popup
    }
};

// Function to highlight a selected source
function canvasHighlightSource(selectedIndex) {
    // Store the highlighted index globally
    window.currentHighlightedSourceIndex = selectedIndex;
    
    // Force redraw with highlight
    canvasUpdateOverlay();
}

// Function to update the canvas overlay with regions that scale correctly with zoom
function canvasUpdateOverlay() {
    if (!viewer || !window.catalogCanvas || !window.catalogDataForOverlay) return;

    const canvas = window.catalogCanvas;
    const ctx = canvas.getContext('2d');
    
    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Get viewport bounds
    const bounds = viewer.viewport.getBounds();
    const viewportBounds = {
        left: bounds.x - 0.5,
        top: bounds.y - 0.5,
        right: bounds.x + bounds.width + 0.5,
        bottom: bounds.y + bounds.height + 0.5
    };
    
    // Performance optimization for large datasets
    const totalSources = window.catalogDataForOverlay.length;
    
    // Skip processing if we have no sources
    if (totalSources === 0) return;
    
    // Clear source map and prepare batch collection
    window.catalogSourceMap = [];
    const regularPoints = [];
    const highlightedPoint = {exists: false};
    
    // Direct pixel-based rendering for maximum performance
    // Use TypedArrays to quickly process all the sources
    const floatBytes = 4; // 4 bytes per float
    const sourceProperties = 4; // x, y, radius, index
    const bufferSize = totalSources * sourceProperties * floatBytes;
    
    // Create typed array for processing source positions efficiently
    const sourceBuffer = new Float32Array(totalSources * sourceProperties);
    let visibleCount = 0;
    
    // Get styles from the correct local variable in catalogs.js
    const FIXED_RADIUS = 5;
    const dotBorderWidth = regionStyles.borderWidth || 1;
    const dotBorderColor = regionStyles.borderColor || 'rgba(255, 165, 0, 0.7)';
    const dotFillColor = regionStyles.backgroundColor || 'transparent';
    const dotOpacity = regionStyles.opacity || 0.7;
    
    // OPTIMIZATION: Batch update all source coordinates in a single pass
    // This significantly reduces function call overhead by using fast array operations
    for (let i = 0; i < totalSources; i++) {
        const obj = window.catalogDataForOverlay[i];
        
        // Skip filtered objects
        if (window.flagFilterEnabled && obj.dataset && obj.dataset.passesFilter === 'false') {
            continue;
        }
        
        // Get coordinates (reuse calculations when possible)
        let x = obj.x;
        let y = obj.y;
        
        // Convert RA/DEC if needed (only once per source)
        if (obj.ra !== undefined && obj.dec !== undefined && window.parsedWCS && window.parsedWCS.hasWCS) {
            if (typeof celestialToPixel === 'function') {
                const pixelCoords = celestialToPixel(obj.ra, obj.dec, window.parsedWCS);
                x = pixelCoords.x;
                y = pixelCoords.y;
            }
        }
        
        // Get radius
        const imageRadius = obj.radius_pixels || 5; // Use 5 as default
        
        // PERFORMANCE: Convert to viewport only once per source
        const viewportPoint = viewer.viewport.imageToViewportCoordinates(x, y);
        const pagePoint = viewer.viewport.viewportToViewerElementCoordinates(viewportPoint);
        
        // Use a single coordinate transformation for radius calculation
        const offsetPoint = viewer.viewport.imageToViewportCoordinates(x + imageRadius, y);
        const offsetPagePoint = viewer.viewport.viewportToViewerElementCoordinates(offsetPoint);
        
        // Get screen radius
        const screenRadius = Math.sqrt(
            Math.pow(offsetPagePoint.x - pagePoint.x, 2) +
            Math.pow(offsetPagePoint.y - pagePoint.y, 2)
        );
        
        // Store source in map for hit detection
        window.catalogSourceMap.push({
            x: pagePoint.x,
            y: pagePoint.y,
            radius: screenRadius,
            imageRadius: imageRadius,
            sourceIndex: i,
            imageX: x,
            imageY: y,
            viewportX: viewportPoint.x,
            viewportY: viewportPoint.y,
            ra: obj.ra,
            dec: obj.dec
        });
        
        // OPTIMIZATION: Use simple bounds check for viewport culling
        const isInViewport = (
            viewportPoint.x >= viewportBounds.left && 
            viewportPoint.x <= viewportBounds.right && 
            viewportPoint.y >= viewportBounds.top && 
            viewportPoint.y <= viewportBounds.bottom
        );
        
        // OPTIMIZATION: Special case for highlighted source
        const isHighlighted = (i === window.currentHighlightedSourceIndex);
        
        // Collect visible points efficiently
        if (isInViewport) {
            if (isHighlighted) {
                highlightedPoint.x = pagePoint.x;
                highlightedPoint.y = pagePoint.y;
                highlightedPoint.radius = screenRadius;
                highlightedPoint.exists = true;
            } else {
                // OPTIMIZATION: Store only the minimal data needed
                regularPoints.push({
                    x: pagePoint.x,
                    y: pagePoint.y,
                    radius: screenRadius
                });
            }
            visibleCount++;
        } else if (isHighlighted) {
            highlightedPoint.x = pagePoint.x;
            highlightedPoint.y = pagePoint.y;
            highlightedPoint.radius = screenRadius;
            highlightedPoint.exists = true;
            visibleCount++;
        }
        
        // --- BEGIN PER-OBJECT STYLES (Using globalRegionStyles as fallback) ---
        // If specific styles are needed per object, they would be fetched here
        // For now, using the globally applied regionStyles from catalogs.js
        const objBorderWidth = regionStyles.borderWidth || 1;
        const objBorderColor = regionStyles.borderColor || 'rgba(255, 165, 0, 0.7)';
        const objOpacity = regionStyles.opacity || 0.7;
        let objFillColor = regionStyles.backgroundColor || 'transparent';

        // Example logic for per-object fill (can be adapted):
        // const objData = window.catalogDataForOverlay[i];
        // if (objData.useTransparentFill === false) {
        //     objFillColor = objData.fillColor || regionStyles.backgroundColor || 'rgba(255, 152, 0, 0.3)';
        // } else if (objData.useTransparentFill === true) { 
        //     try {
        //         const r = parseInt(objBorderColor.slice(1, 3), 16);
        //         const g = parseInt(objBorderColor.slice(3, 5), 16);
        //         const b = parseInt(objBorderColor.slice(5, 7), 16);
        //         objFillColor = `rgba(${r}, ${g}, ${b}, 0.3)`; 
        //     } catch (e) { 
        //         objFillColor = regionStyles.backgroundColor !== 'transparent' ? regionStyles.backgroundColor : 'rgba(255, 152, 0, 0.3)';
        //     }
        // } else { 
        //     objFillColor = regionStyles.backgroundColor || 'transparent';
        // } 
        // --- END PER-OBJECT STYLES ---
        
        // Draw the object if visible (moved drawing inside main loop)
        if (isInViewport && !isHighlighted) { // Draw regular points directly
            ctx.globalAlpha = objOpacity;
            ctx.lineWidth = objBorderWidth;
            ctx.strokeStyle = objBorderColor;
            ctx.fillStyle = objFillColor;

            ctx.beginPath();
            ctx.moveTo(pagePoint.x + screenRadius, pagePoint.y);
            ctx.arc(pagePoint.x, pagePoint.y, screenRadius, 0, 2 * Math.PI);
            ctx.stroke();
            if (objFillColor !== 'transparent') {
                ctx.fill();
            }
        }
    }
    
    // Handle highlighted point separately with special styling
    if (highlightedPoint.exists) {
        // Get the original highlighted object to fetch its style for fill
        const highlightedObj = window.catalogDataForOverlay[window.currentHighlightedSourceIndex];
        const highlightedFillColor = regionStyles.backgroundColor || 'transparent'; // Use global style
        // const highlightedUseTransparentFill = highlightedObj.useTransparentFill !== undefined ? highlightedObj.useTransparentFill : true; // Per-object logic removed for now
        let finalHighlightFill = highlightedFillColor; // Simpler logic

        // if (highlightedUseTransparentFill === false) {
        //     finalHighlightFill = highlightedFillColor;
        // }
        
        ctx.save();
        ctx.globalAlpha = 1.0;
        ctx.lineWidth = regionStyles.borderWidth || 1; // Use global style
        ctx.strokeStyle = 'yellow'; // Keep highlight stroke yellow
        
        // Draw highlighted circle
        ctx.beginPath();
        ctx.arc(highlightedPoint.x, highlightedPoint.y, highlightedPoint.radius, 0, 2 * Math.PI);
        
        // Fill if needed
        if (finalHighlightFill !== 'transparent') {
            ctx.fillStyle = finalHighlightFill;
            ctx.fill();
        }
        
        ctx.stroke();
        
        // Draw outer glow
        ctx.beginPath();
        ctx.arc(highlightedPoint.x, highlightedPoint.y, highlightedPoint.radius + 3, 0, 2 * Math.PI);
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.restore();
    }
    
    // Draw popup if active
    window.canvasPopup.render(ctx);
    
    // Reset global alpha
    ctx.globalAlpha = 1.0;
}






// Fixed hide method for the DOM-based popup
// Replace just the hide method in the canvasPopup object

window.canvasPopup.hide = function() {
    // Set active state to false
    this.active = false;
    
    // Debug log to track hide method calls
    console.log("canvasPopup hide method called");
    
    // Reset highlighted source
    if (typeof window.currentHighlightedSourceIndex !== 'undefined') {
        window.currentHighlightedSourceIndex = -1;
    }
    
    // Reset dragging state
    this.isDragging = false;
    
    // Hide the DOM element - with extra error checking
    try {
        if (this.domElement) {
            console.log("Hiding DOM element", this.domElement);
            this.domElement.style.display = 'none';
            
            // Additional attempt in case the style property is being overridden
            this.domElement.setAttribute('style', this.domElement.getAttribute('style') + '; display: none !important;');
            
            // Add a class that might be used for styling
            this.domElement.classList.add('hidden');
        } else {
            console.log("No DOM element found to hide");
            
            // Try finding the element by ID as a fallback
            const popupElement = document.getElementById('canvas-dom-popup');
            if (popupElement) {
                console.log("Found popup element by ID, hiding it");
                popupElement.style.display = 'none';
                popupElement.setAttribute('style', popupElement.getAttribute('style') + '; display: none !important;');
                popupElement.classList.add('hidden');
            } else {
                console.log("Could not find popup element by ID either");
            }
        }
    } catch (e) {
        console.error("Error hiding DOM element:", e);
    }
    
    // Try another approach - remove the element entirely and recreate it later
    try {
        const popup = document.getElementById('canvas-dom-popup');
        if (popup && popup.parentNode) {
            console.log("Removing popup element from DOM");
            popup.parentNode.removeChild(popup);
            this.domElement = null;  // Force recreation next time
        }
    } catch (e) {
        console.error("Error removing popup from DOM:", e);
    }
    
    // Redraw canvas
    if (typeof canvasUpdateOverlay === 'function') {
        try {
            console.log("Calling canvasUpdateOverlay");
            canvasUpdateOverlay();
        } catch (e) {
            console.error("Error calling canvasUpdateOverlay:", e);
        }
    } else {
        console.log("canvasUpdateOverlay function not found");
    }
    
    console.log("Popup hide method completed");
    
    // Return this for chaining
    return this;
};

// Also add an explicit global function to hide the popup that can be called from anywhere
window.hideCanvasPopup = function() {
    console.log("Global hideCanvasPopup function called");
    
    try {
        // Try using the object method first
        if (window.canvasPopup && typeof window.canvasPopup.hide === 'function') {
            window.canvasPopup.hide();
        }
        
        // Also try direct DOM manipulation as a fallback
        const popup = document.getElementById('canvas-dom-popup');
        if (popup) {
            console.log("Directly hiding popup element");
            popup.style.display = 'none';
            
            // Remove from DOM
            if (popup.parentNode) {
                popup.parentNode.removeChild(popup);
            }
        }
        
        // Reset the global state variable
        if (typeof window.currentHighlightedSourceIndex !== 'undefined') {
            window.currentHighlightedSourceIndex = -1;
        }
        
        // Force canvas update
        if (typeof canvasUpdateOverlay === 'function') {
            canvasUpdateOverlay();
        }
        
        console.log("Global hideCanvasPopup completed");
        return true;
    } catch (e) {
        console.error("Error in global hideCanvasPopup:", e);
        return false;
    }
};



// Function to verify all methods are present
function verifyCanvasPopupMethods() {
    console.log("Verifying canvasPopup methods:");
    
    // Create the object if it doesn't exist
    window.canvasPopup = window.canvasPopup || {};
    
    // List of required methods
    const requiredMethods = [
        'render', 'show', 'hide', 'isCloseButtonClicked', 'isPopupClicked',
        'isDragHandleClicked', 'startDrag', 'doDrag', 'endDrag'
    ];
    
    // Check each method
    for (const method of requiredMethods) {
        if (typeof window.canvasPopup[method] !== 'function') {
            console.error(`Method ${method} is missing or not a function!`);
            // Create stub method to prevent errors
            window.canvasPopup[method] = window.canvasPopup[method] || function() {
                console.log(`Stub method ${method} called`);
            };
        } else {
            console.log(`Method ${method} is properly defined`);
        }
    }
}

// Call the verification function
verifyCanvasPopupMethods();

// Connect the canvas popup's "Show SED" and "Show Properties" buttons
// to the existing sed.js functions
function connectPopupToSedFunctions() {
    // Override the canvasHandleClick function if needed to add event listeners to the SED buttons
    const originalCanvasHandleClick = window.canvasHandleClick;
    
    if (typeof originalCanvasHandleClick === 'function') {
        window.canvasHandleClick = function(event) {
            // Call the original handler first
            originalCanvasHandleClick.call(this, event);
            
            // Get click coordinates relative to the viewer
            const viewerElement = document.getElementById('openseadragon');
            const rect = viewerElement.getBoundingClientRect();
            const clickX = event.clientX - rect.left;
            const clickY = event.clientY - rect.top;
            
            // Check if a popup is active
            if (window.canvasPopup && window.canvasPopup.active) {
                // Find clickable elements within the popup
                // Find "Show SED" button click area
                const popupX = window.canvasPopup.x;
                const popupY = window.canvasPopup.y;
                const popupWidth = window.canvasPopup.width;
                const popupHeight = window.canvasPopup.height;
                
                // Simple check if the click is within the popup
                if (window.canvasPopup.isPopupClicked(clickX, clickY)) {
                    // Check for clicks on the SED or Properties links
                    // This is an approximate position - adjust based on actual render method
                    const linkY = popupY + popupHeight - 40; // Approximate Y position of links
                    const sedLinkX = popupX + 50; // Approximate X position of "Show SED" link
                    const propLinkX = sedLinkX + 80; // Approximate X position of "Properties" link
                    
                    // Very rough approximation of link click areas
                    // Better to adjust these based on actual UI positions
                    const isSedLinkClicked = (Math.abs(clickX - sedLinkX) < 40 && Math.abs(clickY - linkY) < 20);
                    const isPropLinkClicked = (Math.abs(clickX - propLinkX) < 40 && Math.abs(clickY - linkY) < 20);
                    
                    if (isSedLinkClicked) {
                        console.log("SED link clicked in canvas popup");
                        const sourceObj = window.catalogDataForOverlay[window.canvasPopup.sourceIndex];
                        
                        // Get the current catalog name
                        const catalogName = window.currentCatalogName || "catalog";
                        
                        // Call the showSed function with the source coordinates
                        if (typeof window.showSed === 'function') {
                            window.showSed(sourceObj.ra, sourceObj.dec, catalogName);
                        }
                    } else if (isPropLinkClicked) {
                        console.log("Properties link clicked in canvas popup");
                        const sourceObj = window.catalogDataForOverlay[window.canvasPopup.sourceIndex];
                        
                        // Get the current catalog name
                        const catalogName = window.currentCatalogName || "catalog";
                        
                        // Call the showProperties function with the source coordinates
                        if (typeof window.showProperties === 'function') {
                            window.showProperties(sourceObj.ra, sourceObj.dec, catalogName);
                        }
                    }
                }
            }
        };
    }
}

// Connect the popup to SED functions
connectPopupToSedFunctions();

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
    
    // Check if popup is already active and was clicked
    if (window.canvasPopup.active) {
        // Check if close button was clicked
        if (window.canvasPopup.isCloseButtonClicked(clickX, clickY)) {
            window.canvasPopup.hide();
            return;
        }
        
        // Check if drag handle was clicked (or header area)
        if (window.canvasPopup.isDragHandleClicked(clickX, clickY) || 
           (window.canvasPopup.isPopupClicked(clickX, clickY) && clickY < window.canvasPopup.y - window.canvasPopup.height/2 + 36)) {
            window.canvasPopup.startDrag(clickX, clickY);
            return;
        }
        
        // Check if popup area was clicked (to prevent processing clicks through it)
        if (window.canvasPopup.isPopupClicked(clickX, clickY)) {
            return;
        }
    }
    
    // Find closest source to the click point
    let closestSource = null;
    let closestDistance = Infinity;
    const hitRadius = 10;
    
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
        
        // Highlight the source on canvas
        canvasHighlightSource(closestSource.sourceIndex);

        // --- Highlight corresponding point in scatter plot ---
        const scatterPlotArea = document.getElementById('plot-area');
        if (scatterPlotArea) {
            // Clear previous scatter highlight
            if (window.highlightedScatterCircle) {
                try { // Add try-catch for safety
                    const originalRadius = window.highlightedScatterCircle.dataset.originalRadius || 4; // Assume 4 if dataset not set
                    window.highlightedScatterCircle.setAttribute('stroke', '#333');
                    window.highlightedScatterCircle.setAttribute('stroke-width', '1');
                    window.highlightedScatterCircle.setAttribute('r', originalRadius);
                } catch (err) {
                    console.warn("Error clearing previous scatter highlight:", err);
                }
            }
            
            // Find and highlight the new circle
            const targetCircle = scatterPlotArea.querySelector(`circle[data-index='${closestSource.sourceIndex}']`);
            if (targetCircle) {
                 try { // Add try-catch for safety
                    targetCircle.dataset.originalRadius = targetCircle.getAttribute('r'); // Store original radius
                    targetCircle.setAttribute('stroke', 'yellow');
                    targetCircle.setAttribute('stroke-width', '2');
                    targetCircle.setAttribute('r', parseFloat(targetCircle.dataset.originalRadius) * 1.5);
                    window.highlightedScatterCircle = targetCircle; // Store reference
                    console.log("Canvas Click: Highlighted scatter plot circle for index", closestSource.sourceIndex);
                 } catch (err) {
                     console.warn("Error highlighting new scatter circle:", err);
                 }
            } else {
                console.log("Canvas Click: Could not find scatter plot circle for index", closestSource.sourceIndex);
                window.highlightedScatterCircle = null; // Ensure no stale reference
            }
        } else {
             window.highlightedScatterCircle = null; // Ensure no stale reference if plot area gone
        }
        // --- End scatter plot highlight ---
        
        // Show popup with source info using our canvas popup system
        window.canvasPopup.show(
            closestSource.sourceIndex,
            closestSource.x, // Screen X for popup position
            closestSource.y, // Screen Y for popup position
            sourceObj
        );
    } else {
        console.log("No source found near click position");
        
        // If clicking empty space, hide any active popup and clear highlights
        if (window.canvasPopup.active) {
            window.canvasPopup.hide(); 
        }
        // Also clear scatter highlight if clicking empty space
        if (window.highlightedScatterCircle) {
            try {
                const originalRadius = window.highlightedScatterCircle.dataset.originalRadius || 4;
                window.highlightedScatterCircle.setAttribute('stroke', '#333');
                window.highlightedScatterCircle.setAttribute('stroke-width', '1');
                 window.highlightedScatterCircle.setAttribute('r', originalRadius);
            } catch (err) { console.warn("Error clearing scatter highlight on empty click:", err); }
             window.highlightedScatterCircle = null;
        }
    }
}


// Update the canvasHandleClick function to handle drag and drop
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
    
    // Check if popup is already active and was clicked
    if (window.canvasPopup.active) {
        // Check if close button was clicked
        if (window.canvasPopup.isCloseButtonClicked(clickX, clickY)) {
            window.canvasPopup.hide();
            return;
        }
        
        // Check if drag handle was clicked
        if (window.canvasPopup.isDragHandleClicked(clickX, clickY) || 
            // Also allow dragging by the header area
            window.canvasPopup.isPopupClicked(clickX, clickY) && clickY < window.canvasPopup.y - window.canvasPopup.height/2 + 36) {
            window.canvasPopup.startDrag(clickX, clickY);
            return;
        }
        
        // Check if popup area was clicked (to prevent processing clicks through it)
        if (window.canvasPopup.isPopupClicked(clickX, clickY)) {
            return;
        }
    }
    
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
        
        // Highlight the source on canvas
        canvasHighlightSource(closestSource.sourceIndex);
        
        // Show popup with source info using our canvas popup system
        window.canvasPopup.show(
            closestSource.sourceIndex,
            closestSource.x,
            closestSource.y,
            sourceObj
        );
    } else {
        console.log("No source found near click position");
        
        // If clicking empty space, hide any active popup
        if (window.canvasPopup.active) {
            window.canvasPopup.hide();
        }
    }
}

// Add this to the canvasAddCatalogOverlay function to set up mouse tracking for drag events
function setupDragHandlers() {
    const viewerElement = document.getElementById('openseadragon');
    
    // We'll track mouse move events globally
    let isMouseDown = false;
    
    // Add mouse move handler to the document
    document.addEventListener('mousemove', function(event) {
        if (window.canvasPopup.isDragging) {
            const rect = viewerElement.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            window.canvasPopup.doDrag(x, y);
            
            // Prevent default behavior and stop propagation
            event.preventDefault();
            event.stopPropagation();
        }
    });
    
    // Add mouse up handler to document to catch releases outside the viewer
    document.addEventListener('mouseup', function(event) {
        if (window.canvasPopup.isDragging) {
            window.canvasPopup.endDrag();
            
            // Prevent this event from being handled by other handlers
            event.preventDefault();
            event.stopPropagation();
        }
    });
    
    console.log("Drag handlers set up");
}

// Insert this into the canvasAddCatalogOverlay function
// Add right after the event handlers are set up, before the return statement:
/*
    // Set up drag handlers
    setupDragHandlers();
    
    // Initial update
    canvasUpdateOverlay();
    
    return catalogData.length;
*/

// Update the main function to add the catalog overlay using canvas
function canvasAddCatalogOverlay(catalogData) {
    console.log("Using pure canvas catalog overlay function");
    
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
    
    console.log(`Adding overlay with ${catalogData.length} objects using pure canvas rendering`);
    

    
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
    
    // Add container to viewer
    viewerElement.appendChild(container);
    
    // Store references
    window.catalogOverlayContainer = container;
    window.catalogCanvas = canvas;
    window.catalogSourceMap = [];
    
    // Track if a drag is in progress
    let isDragging = false;
    let dragStartPos = null;
    
    // Set up the click handler directly on the viewer
    viewer.addHandler('canvas-press', function(event) {
        // Store the starting position for drag detection
        dragStartPos = {
            x: event.position.x,
            y: event.position.y
        };
        isDragging = false;
    });
    
    viewer.addHandler('canvas-drag', function(event) {
        if (!dragStartPos) return;
        
        // Check if we've moved far enough to consider this a drag
        const dx = event.position.x - dragStartPos.x;
        const dy = event.position.y - dragStartPos.y;
        const distance = Math.sqrt(dx*dx + dy*dy);
        
        if (distance > 5) {
            isDragging = true;
        }
    });
    
    viewer.addHandler('canvas-release', function(event) {
        if (!dragStartPos) return;
        
        // Only handle as a click if it wasn't a drag
        if (!isDragging) {
            // Create a synthetic event object with the necessary properties
            const viewerElement = document.getElementById('openseadragon');
            const rect = viewerElement.getBoundingClientRect();
            const clickEvent = {
                clientX: event.position.x + rect.left,
                clientY: event.position.y + rect.top
            };
            
            canvasHandleClick(clickEvent);
        }
        
        dragStartPos = null;
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
    
    // Set up drag handlers for the popup
    setupDragHandlers();
    
    // Initial update
    canvasUpdateOverlay();
    
    // Add event handlers
    viewer.addHandler('animation', canvasUpdateOverlay);
    viewer.addHandler('open', canvasUpdateOverlay);
    
    const throttledUpdate = throttle(function() {
        canvasUpdateOverlay();
    }, 100);
    viewer.addHandler('pan', throttledUpdate);
    
    const debouncedZoomUpdate = debounce(function() {
        canvasUpdateOverlay();
    }, 50);
    viewer.addHandler('zoom', debouncedZoomUpdate);
    
    return catalogData.length;
}


// Function to clear the catalog overlay
function canvasClearCatalogOverlay() {
    // Hide popup
    if (window.canvasPopup && window.canvasPopup.active) {
        window.canvasPopup.hide(); // This should also clear scatter highlight now
    }
    
    // Remove container
    if (window.catalogOverlayContainer) {
        const viewerElement = document.getElementById('openseadragon');
        if (viewerElement && viewerElement.contains(window.catalogOverlayContainer)) {
            viewerElement.removeChild(window.catalogOverlayContainer);
        }
        window.catalogOverlayContainer = null;
    }
    
    // Remove any handlers added to the viewer (if possible)
    if (window.viewer) {
        // No reliable way to remove specific handlers added by name, 
        // but OpenSeadragon usually handles cleanup on close/destroy.
        // We might need to explicitly remove the canvas-press/drag/release handlers if added globally.
    }
    
    // Clear references
    window.catalogCanvas = null;
    window.catalogSourceMap = null;
    window.catalogDataForOverlay = null;
    window.currentHighlightedSourceIndex = -1;
    
    // --- Clear scatter plot highlight ---
    if (window.highlightedScatterCircle) {
         try {
            const originalRadius = window.highlightedScatterCircle.dataset.originalRadius || 4;
            window.highlightedScatterCircle.setAttribute('stroke', '#333');
            window.highlightedScatterCircle.setAttribute('stroke-width', '1');
             window.highlightedScatterCircle.setAttribute('r', originalRadius);
        } catch (err) { console.warn("Error clearing scatter highlight in canvasClearCatalogOverlay:", err); }
        window.highlightedScatterCircle = null;
    }
    // --- End clear scatter highlight ---
    
}

// Main initialization function to override existing methods with canvas versions
function initPureCanvasImplementation() {
    
    // Store original functions (if they exist)
    const originalAddCatalogOverlay = window.addCatalogOverlay;
    const originalClearCatalogOverlay = window.clearCatalogOverlay;
    const originalShowRegionInfo = window.showRegionInfo;
    
    // Replace with canvas versions
    window.addCatalogOverlay = canvasAddCatalogOverlay;
    window.clearCatalogOverlay = canvasClearCatalogOverlay;
    
    // Override showRegionInfo to be a no-op since we're using canvas popups
    window.showRegionInfo = function() {
        console.log("showRegionInfo called but we're using canvas popups instead");
        return null;
    };
    
    // Also expose canvas functions with their original names
    window.canvasAddCatalogOverlay = canvasAddCatalogOverlay;
    window.canvasUpdateOverlay = canvasUpdateOverlay;
    window.canvasHandleClick = canvasHandleClick;
    window.canvasHighlightSource = canvasHighlightSource;
    window.canvasClearCatalogOverlay = canvasClearCatalogOverlay;
    
    // Add testing function
    window.testCanvasImplementation = function() {
        console.log("PURE CANVAS IMPLEMENTATION TEST:");
        console.log("- Canvas exists:", window.catalogCanvas ? "YES" : "NO");
        console.log("- Using canvas implementation:", window.addCatalogOverlay === canvasAddCatalogOverlay ? "YES" : "NO");
        console.log("- Canvas popup system initialized:", !!window.canvasPopup ? "YES" : "NO");
        console.log("- DOM-based popups overridden:", window.showRegionInfo !== originalShowRegionInfo ? "YES" : "NO");
        
        // Try to diagnose any OpenSeadragon issues
        console.log("- OpenSeadragon viewer exists:", !!window.viewer);
        if (window.viewer) {
            console.log("- Viewer element:", document.getElementById('openseadragon') ? "YES" : "NO");
            console.log("- Mouse tracker enabled:", window.viewer.mouseTracker ? "YES" : "NO");
        }
    };
    
    console.log("PURE CANVAS IMPLEMENTATION COMPLETE");
}

// Set up the initialization to run when the page loads
if (document.readyState === 'complete') {
    initPureCanvasImplementation();
} else {
    window.addEventListener('load', initPureCanvasImplementation);
}



// Add initialization function
window.initDomPopupSystem = function() {
    console.log("Initializing DOM-based popup system");
    
    // Force initialization of DOM element
    window.canvasPopup.initDomElement();
    
    // Create a custom event for when a popup is shown
    document.addEventListener('popupShown', function(e) {
        console.log("Popup shown event received:", e.detail);
    });
    
    console.log("DOM-based popup system initialized");
};

// Call initialization on load
if (document.readyState === 'complete') {
    window.initDomPopupSystem();
} else {
    window.addEventListener('load', window.initDomPopupSystem);
}

console.log("DOM-based popup replacement loaded");

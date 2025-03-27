
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

// First, verify the canvasPopup object has all required methods
window.canvasPopup = window.canvasPopup || {};

// Explicitly redefine the hide method to ensure it's properly attached
window.canvasPopup.hide = function() {
    this.active = false;
    
    // Reset highlighted source
    window.currentHighlightedSourceIndex = -1;
    
    // Reset dragging state
    this.isDragging = false;
    
    // Redraw canvas
    if (typeof canvasUpdateOverlay === 'function') {
        canvasUpdateOverlay();
    }
    
    console.log("Popup hidden");
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

// Track the currently highlighted source index globally
window.currentHighlightedSourceIndex = -1;


// Create a custom popup system for the canvas with improved styling
// Add these properties to the canvasPopup object
window.canvasPopup = {
    // Existing properties
    active: false,
    sourceIndex: -1,
    x: 0,
    y: 0,
    width: 300,
    height: 200,
    content: {},
    
    // Add dragging state properties
    isDragging: false,
    dragOffsetX: 0,
    dragOffsetY: 0,
    
    // Modified render method with solid background
    render: function(ctx) {
        if (!this.active) return;
        
        // Constants for popup styling
        const padding = 12;
        const radius = 8;
        
        // Calculate popup position and dimensions
        // Make sure popup stays within viewport
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
        
        // Draw popup background with rounded corners
        ctx.save();
        
        // Solid background with border - changed from transparent
        ctx.fillStyle = '#2a2a2a'; // Dark background
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 1;
        
        // Add shadow effect
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        
        // Draw rounded rectangle
        ctx.beginPath();
        ctx.moveTo(popupX + radius, popupY);
        ctx.lineTo(popupX + this.width - radius, popupY);
        ctx.quadraticCurveTo(popupX + this.width, popupY, popupX + this.width, popupY + radius);
        ctx.lineTo(popupX + this.width, popupY + this.height - radius);
        ctx.quadraticCurveTo(popupX + this.width, popupY + this.height, popupX + this.width - radius, popupY + this.height);
        ctx.lineTo(popupX + radius, popupY + this.height);
        ctx.quadraticCurveTo(popupX, popupY + this.height, popupX, popupY + this.height - radius);
        ctx.lineTo(popupX, popupY + radius);
        ctx.quadraticCurveTo(popupX, popupY, popupX + radius, popupY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Draw a subtle header divider
        ctx.beginPath();
        ctx.moveTo(popupX, popupY + 36);
        ctx.lineTo(popupX + this.width, popupY + 36);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.stroke();
        
        // Reset shadow
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        
        // Draw content
        // Title
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = 'bold 14px Arial, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText('Source Information', popupX + padding, popupY + 18);
        
        // Draw draggable indicator (horizontal lines) in the header
        ctx.beginPath();
        const dragX = popupX + this.width - 50;
        const dragY = popupY + 18;
        for (let i = 0; i < 3; i++) {
            ctx.moveTo(dragX, dragY - 4 + (i * 3));
            ctx.lineTo(dragX + 15, dragY - 4 + (i * 3));
        }
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        // Source details - structured like the second code snippet
        let yOffset = popupY + 48;
        
        // Format key properties that we want to display in a specific way
        const hasX = 'x' in this.content;
        const hasY = 'y' in this.content;
        const hasRA = 'ra' in this.content;
        const hasDec = 'dec' in this.content;
        const hasRadius = 'radius' in this.content;
        
        // Position (x, y)
        if (hasX && hasY) {
            const x = typeof this.content.x === 'number' ? this.content.x.toFixed(2) : this.content.x;
            const y = typeof this.content.y === 'number' ? this.content.y.toFixed(2) : this.content.y;
            
            // Label
            ctx.font = '12px Arial, sans-serif';
            ctx.fillStyle = 'rgba(170, 170, 170, 0.9)';
            ctx.textBaseline = 'top';
            ctx.fillText('Position (x, y):', popupX + padding, yOffset);
            
            // Value
            ctx.fillStyle = 'rgb(255, 255, 255)';
            ctx.fillText(`${x}, ${y}`, popupX + padding + 110, yOffset);
            
            yOffset += 24;
        }
        
        // Coordinates (RA, Dec)
        if (hasRA && hasDec) {
            const ra = typeof this.content.ra === 'number' ? this.content.ra.toFixed(6) : this.content.ra;
            const dec = typeof this.content.dec === 'number' ? this.content.dec.toFixed(6) : this.content.dec;
            
            // Label
            ctx.font = '12px Arial, sans-serif';
            ctx.fillStyle = 'rgba(170, 170, 170, 0.9)';
            ctx.textBaseline = 'top';
            ctx.fillText('Coordinates (RA, Dec):', popupX + padding, yOffset);
            
            // Value
            ctx.fillStyle = 'rgb(255, 255, 255)';
            ctx.fillText(`${ra}°, ${dec}°`, popupX + padding + 110, yOffset);
            
            yOffset += 24;
        }
        
        // Region Size
        if (hasRadius) {
            const radius = typeof this.content.radius === 'number' ? this.content.radius.toFixed(2) : this.content.radius;
            
            // Label
            ctx.font = '12px Arial, sans-serif';
            ctx.fillStyle = 'rgba(170, 170, 170, 0.9)';
            ctx.textBaseline = 'top';
            ctx.fillText('Region Size:', popupX + padding, yOffset);
            
            // Value
            ctx.fillStyle = 'rgb(255, 255, 255)';
            ctx.fillText(`${radius} pixels`, popupX + padding + 110, yOffset);
            
            yOffset += 24;
        }
        
        // Add links instead of buttons
        if (yOffset + 30 < popupY + this.height) {
            const linkY = yOffset + 12;
            const linkSpacing = 20;
            
            // SED Link
            const sedLinkX = popupX + padding + 10;
            ctx.fillStyle = '#66a3ff';
            ctx.font = '12px Arial, sans-serif';
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';
            
            // Underline for the link
            const sedText = 'Show SED';
            const sedTextWidth = ctx.measureText(sedText).width;
            ctx.fillText(sedText, sedLinkX, linkY);
            
            ctx.beginPath();
            ctx.moveTo(sedLinkX, linkY + 7);
            ctx.lineTo(sedLinkX + sedTextWidth, linkY + 7);
            ctx.strokeStyle = '#66a3ff';
            ctx.lineWidth = 1;
            ctx.stroke();
            
            // Properties Link
            const propLinkX = sedLinkX + sedTextWidth + linkSpacing;
            
            // Underline for the link
            const propText = 'Properties';
            const propTextWidth = ctx.measureText(propText).width;
            ctx.fillText(propText, propLinkX, linkY);
            
            ctx.beginPath();
            ctx.moveTo(propLinkX, linkY + 7);
            ctx.lineTo(propLinkX + propTextWidth, linkY + 7);
            ctx.strokeStyle = '#66a3ff';
            ctx.lineWidth = 1;
            ctx.stroke();
            
            // Reset text alignment
            ctx.textAlign = 'left';
            
            yOffset += 30;
        }
        
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
        for (const key of propertiesToDisplay) {
            // Format the value
            let displayValue = this.content[key];
            if (typeof displayValue === 'number') {
                // Format numbers nicely
                displayValue = displayValue.toFixed(displayValue % 1 === 0 ? 0 : 4);
            } else if (typeof displayValue === 'object') {
                // Skip objects
                continue;
            }
            
            // Don't show empty values
            if (displayValue === undefined || displayValue === null || displayValue === '') continue;
            
            // Property label
            ctx.font = '12px Arial, sans-serif';
            ctx.fillStyle = 'rgba(170, 170, 170, 0.9)';
            ctx.textBaseline = 'top';
            ctx.fillText(`${key}:`, popupX + padding, yOffset);
            
            // Property value
            ctx.fillStyle = 'rgb(255, 255, 255)';
            ctx.font = '12px Arial, sans-serif';
            ctx.fillText(`${displayValue}`, popupX + padding + 110, yOffset);
            
            yOffset += 22;
            
            // Limit the number of properties shown
            if (yOffset > popupY + this.height - padding - 10) {
                ctx.fillText('...', popupX + padding, yOffset);
                break;
            }
        }
        
        // Draw close button (just X with no background)
        const closeX = popupX + this.width - 20;
        const closeY = popupY + 18;
        
        ctx.beginPath();
        ctx.moveTo(closeX - 5, closeY - 5);
        ctx.lineTo(closeX + 5, closeY + 5);
        ctx.moveTo(closeX + 5, closeY - 5);
        ctx.lineTo(closeX - 5, closeY + 5);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        
        ctx.restore();
    },
    
    // Modified show method to reset dragging state
    show: function(sourceIndex, x, y, content) {
        this.active = true;
        this.sourceIndex = sourceIndex;
        this.x = x;
        this.y = y;
        this.content = content || {};
        this.isDragging = false;
        
        // Base height calculation
        let baseHeight = 70; // Header + padding
        
        // Add height for standard fields (x, y, ra, dec, radius)
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
        this.height = Math.min(baseHeight + remainingProps * 22, 300);
        
        // Redraw canvas
        canvasUpdateOverlay();
    },
    
    // Modified isCloseButtonClicked method
    isCloseButtonClicked: function(x, y) {
        if (!this.active) return false;
        
        // Calculate popup position
        const viewerElement = document.getElementById('openseadragon');
        const viewerWidth = viewerElement.clientWidth;
        const viewerHeight = viewerElement.clientHeight;
        
        // Calculate popup position the same way as in render method
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
        
        // Calculate close button position
        const closeX = popupX + this.width - 20;
        const closeY = popupY + 18;
        
        // Check if click is within close button
        const distance = Math.sqrt((x - closeX) ** 2 + (y - closeY) ** 2);
        return distance <= 9;
    },
    
    // Modified isPopupClicked method
    isPopupClicked: function(x, y) {
        if (!this.active) return false;
        
        // Calculate popup position
        const viewerElement = document.getElementById('openseadragon');
        const viewerWidth = viewerElement.clientWidth;
        const viewerHeight = viewerElement.clientHeight;
        
        let popupX = this.x + 15;
        let popupY = this.y - this.height / 2;
        
        if (popupX + this.width > viewerWidth) {
            popupX = this.x - this.width - 15;
        }
        
        if (popupY < 10) {
            popupY = 10;
        } else if (popupY + this.height > viewerHeight - 10) {
            popupY = viewerHeight - this.height - 10;
        }
        
        // Check if click is within popup
        return (
            x >= popupX && 
            x <= popupX + this.width && 
            y >= popupY && 
            y <= popupY + this.height
        );
    },
    
    // New method to check if drag handle was clicked
    isDragHandleClicked: function(x, y) {
        if (!this.active) return false;
        
        // Calculate popup position
        const viewerElement = document.getElementById('openseadragon');
        const viewerWidth = viewerElement.clientWidth;
        const viewerHeight = viewerElement.clientHeight;
        
        let popupX = this.x + 15;
        let popupY = this.y - this.height / 2;
        
        if (popupX + this.width > viewerWidth) {
            popupX = this.x - this.width - 15;
        }
        
        if (popupY < 10) {
            popupY = 10;
        } else if (popupY + this.height > viewerHeight - 10) {
            popupY = viewerHeight - this.height - 10;
        }
        
        // Check if click is within drag handle area
        const dragX = popupX + this.width - 50;
        const dragY = popupY + 18;
        
        return (
            x >= dragX && 
            x <= dragX + 15 && 
            y >= dragY - 5 && 
            y <= dragY + 5
        );
    },
    
    // New method to start dragging
    startDrag: function(x, y) {
        if (!this.active) return;
        
        this.isDragging = true;
        
        // Calculate popup position to get correct offset
        const viewerElement = document.getElementById('openseadragon');
        const viewerWidth = viewerElement.clientWidth;
        const viewerHeight = viewerElement.clientHeight;
        
        let popupX = this.x + 15;
        let popupY = this.y - this.height / 2;
        
        if (popupX + this.width > viewerWidth) {
            popupX = this.x - this.width - 15;
        }
        
        if (popupY < 10) {
            popupY = 10;
        } else if (popupY + this.height > viewerHeight - 10) {
            popupY = viewerHeight - this.height - 10;
        }
        
        // Calculate how far from the top-left corner of the popup the user clicked
        this.dragOffsetX = x - popupX;
        this.dragOffsetY = y - popupY;
    },
    
    // New method to update position during drag
    doDrag: function(x, y) {
        if (!this.isDragging) return;
        
        // Calculate new position 
        const viewerElement = document.getElementById('openseadragon');
        const viewerWidth = viewerElement.clientWidth;
        const viewerHeight = viewerElement.clientHeight;
        
        // Calculate new position based on mouse position and offset
        let newPopupX = x - this.dragOffsetX;
        let newPopupY = y - this.dragOffsetY;
        
        // Constrain to viewport
        newPopupX = Math.max(10, Math.min(viewerWidth - this.width - 10, newPopupX));
        newPopupY = Math.max(10, Math.min(viewerHeight - this.height - 10, newPopupY));
        
        // Convert back to source coords (the reverse of the calculation done in render)
        this.x = newPopupX;
        this.y = newPopupY + this.height / 2;
        
        // Redraw
        canvasUpdateOverlay();
    },
    
    // New method to end dragging
    endDrag: function() {
        this.isDragging = false;
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
    
    // Clear the source map
    window.catalogSourceMap = [];
    
    // Count visible objects
    let visibleCount = 0;
    
    // Get styles
    const FIXED_RADIUS = 5; // This is now in image coordinates (not screen pixels)
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
        
        // Get the radius in image coordinates
        const imageRadius = obj.radius_pixels || FIXED_RADIUS;
        
        // Convert the center point to viewport coordinates
        const viewportPoint = viewer.viewport.imageToViewportCoordinates(x, y);
        
        // Calculate screen position
        const pagePoint = viewer.viewport.viewportToViewerElementCoordinates(viewportPoint);
        
        // Calculate a point offset by the radius in image coordinates
        const offsetPoint = viewer.viewport.imageToViewportCoordinates(x + imageRadius, y);
        const offsetPagePoint = viewer.viewport.viewportToViewerElementCoordinates(offsetPoint);
        
        // Calculate the radius in screen pixels based on the difference
        const screenRadius = Math.sqrt(
            Math.pow(offsetPagePoint.x - pagePoint.x, 2) +
            Math.pow(offsetPagePoint.y - pagePoint.y, 2)
        );
        
        // Store in source map with both image and screen radius
        window.catalogSourceMap.push({
            x: pagePoint.x,
            y: pagePoint.y,
            radius: screenRadius, // Screen radius for hit detection
            imageRadius: imageRadius, // Original image radius
            sourceIndex: i,
            imageX: x,
            imageY: y,
            viewportX: viewportPoint.x,
            viewportY: viewportPoint.y,
            ra: obj.ra,
            dec: obj.dec
        });
        
        // Only draw if in viewport
        if (viewportPoint.x >= viewportBounds.left && 
            viewportPoint.x <= viewportBounds.right && 
            viewportPoint.y >= viewportBounds.top && 
            viewportPoint.y <= viewportBounds.bottom) {
            
            // Check if this is the highlighted source
            const isHighlighted = (i === window.currentHighlightedSourceIndex);
            
            // Draw regular dot
            ctx.beginPath();
            ctx.arc(pagePoint.x, pagePoint.y, screenRadius, 0, 2 * Math.PI, false);
            
            // Style
            ctx.lineWidth = dotBorderWidth;
            ctx.strokeStyle = isHighlighted ? 'yellow' : dotBorderColor;
            
            // Fill if needed
            if (dotFillColor !== 'transparent') {
                ctx.fillStyle = dotFillColor;
                ctx.fill();
            }
            
            // Draw border
            ctx.stroke();
            
            // If highlighted, draw the outer glow
            if (isHighlighted) {
                // Save context state
                ctx.save();
                
                // Draw highlight with full opacity
                ctx.globalAlpha = 1.0;
                ctx.beginPath();
                ctx.arc(pagePoint.x, pagePoint.y, screenRadius + 3, 0, 2 * Math.PI, false);
                ctx.lineWidth = 2;
                ctx.strokeStyle = 'yellow';
                ctx.stroke();
                
                // Restore context
                ctx.restore();
            }
            
            visibleCount++;
        } else if (i === window.currentHighlightedSourceIndex) {
            // Highlighted source but outside viewport - draw it anyway
            
            // Save context state
            ctx.save();
            
            // Draw highlight with full opacity
            ctx.globalAlpha = 1.0;
            
            // Draw regular dot
            ctx.beginPath();
            ctx.arc(pagePoint.x, pagePoint.y, screenRadius, 0, 2 * Math.PI, false);
            ctx.lineWidth = dotBorderWidth;
            ctx.strokeStyle = 'yellow';
            ctx.stroke();
            
            // Draw outer glow
            ctx.beginPath();
            ctx.arc(pagePoint.x, pagePoint.y, screenRadius + 3, 0, 2 * Math.PI, false);
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'yellow';
            ctx.stroke();
            
            // Restore context
            ctx.restore();
            
            visibleCount++;
        }
    }
    
    // Draw popup if active
    window.canvasPopup.render(ctx);
    
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
    
    // Check if popup is already active and was clicked
    if (window.canvasPopup.active) {
        // Check if close button was clicked
        if (window.canvasPopup.isCloseButtonClicked(clickX, clickY)) {
            window.canvasPopup.hide();
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
        window.canvasPopup.hide();
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
        try {
            viewer.removeHandler('canvas-release');
            viewer.removeHandler('canvas-press');
            viewer.removeHandler('canvas-drag');
        } catch (e) {
            console.log("Note: Could not remove all handlers", e);
        }
    }
    
    // Clear references
    window.catalogCanvas = null;
    window.catalogSourceMap = null;
    window.catalogDataForOverlay = null;
    window.currentHighlightedSourceIndex = -1;
    
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
    
    // Override showRegionInfo to be a no-op since we're using canvas popup
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
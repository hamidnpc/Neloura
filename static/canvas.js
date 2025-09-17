// canvas-catalog-overlay.js - Pure Canvas Implementation

// Utility functions for throttling and debouncing
function throttle(func, wait) {
    // let lastCall = 0;
    // return function(...args) {
    //     const now = Date.now();
    //     if (now - lastCall >= wait) {
    //         lastCall = now;
    //         return func.apply(this, args);
    //     }
    // };
}

function debounce(func, wait) {
    // let timeout;
    // return function(...args) {
    //     clearTimeout(timeout);
    //     timeout = setTimeout(() => func.apply(this, args), wait);
    // };
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
    width:400,
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
        const hasImgX = 'imageX' in this.content;
        const hasImgY = 'imageY' in this.content;

        const hasRadiusPixels = 'radius_pixels' in this.content;
        
        if (hasX && hasY) baseHeight += 24;
        if (hasRA && hasDec) baseHeight += 24;
        if (hasRadiusPixels) baseHeight += 24;
        
        // Add height for galaxy name display
        baseHeight += 24;
        
        // Add height for buttons (now 3 buttons)
        baseHeight += 70;
        
        // Count remaining properties
        const standardFields = ['x', 'y', 'ra', 'dec', 'radius', 'radius_pixels'];
        const remainingProps = Object.keys(this.content).filter(key => 
            !standardFields.includes(key) && !key.startsWith('_') && typeof this.content[key] !== 'function'
        ).length;
        
        // Calculate final height
        this.height = Math.min(baseHeight + remainingProps * 22, 400);
        // console.log('hasImgX:::::', this.content.imageX, this.content.imageY);
        // console.log('x:::::', this.content.x, this.content.y);
        // console.log('this.content::::: need', this.content.x_bottom_left, this.content.y_bottom_left);
        // Update DOM content
        const contentElement = document.getElementById('canvas-dom-popup-content');
        if (contentElement) {
            let html = '';
                    // Format coordinates with 6 decimal places
        const x = typeof this.content.x_bottom_left === 'number' ? this.content.x_bottom_left.toFixed(2) : this.content.x_bottom_left;
        const y = typeof this.content.y_bottom_left === 'number' ? this.content.y_bottom_left.toFixed(2) : this.content.y_bottom_left;
        html += `
            <div style="margin-bottom: 8px;">
                <span style="color: #aaa;">Position (image x, y):</span> ${x}, ${y}
            </div>
        `;
        
            
            if (hasRA && hasDec) {
                const ra = typeof this.content.ra === 'number' ? this.content.ra.toFixed(6) : this.content.ra;
                const dec = typeof this.content.dec === 'number' ? this.content.dec.toFixed(6) : this.content.dec;
                html += `
                    <div style="margin-bottom: 8px;">
                        <span style="color: #aaa;">Coordinates (RA, Dec):</span> ${ra}°, ${dec}°
                    </div>
                `;
            }
            
            if (hasRadiusPixels) {
                const radius = typeof this.content.radius_pixels === 'number' ? this.content.radius_pixels.toFixed(2) : this.content.radius_pixels;
                html += `
                    <div style="margin-bottom: 8px;">
                        <span style="color: #aaa;">Region Radius:</span> ${radius} pixels
                    </div>
                `;
            }
            
            // Get and display galaxy name
            let galaxyName = "UnknownGalaxy";
            if (this.content.galaxy_name && typeof this.content.galaxy_name === 'string' && this.content.galaxy_name.trim() !== "") {
                galaxyName = this.content.galaxy_name.trim();
                console.log('galaxyName?????????', galaxyName)
            } else if (this.content.NAME && typeof this.content.NAME === 'string' && this.content.NAME.trim() !== "") {
                galaxyName = this.content.NAME.trim();
            } else if (this.content.name && typeof this.content.name === 'string' && this.content.name.trim() !== "") {
                galaxyName = this.content.name.trim();
            } else if (this.content.galaxy && typeof this.content.galaxy === 'string' && this.content.galaxy.trim() !== "") {
                galaxyName = this.content.galaxy.trim();
            } else if (this.content.PHANGS_GALAXY && typeof this.content.PHANGS_GALAXY === 'string' && this.content.PHANGS_GALAXY.trim() !== "") {
                galaxyName = this.content.PHANGS_GALAXY.trim();
            } else if (window.galaxyNameFromSearch && typeof window.galaxyNameFromSearch === 'string' && window.galaxyNameFromSearch.trim() !== "") {
                galaxyName = window.galaxyNameFromSearch.trim();
            }
            
            html += `
              
            `;
            
            // Add buttons container with all three buttons
            if(this.content.source_type === 'peak_finder'){
                html += `
               
            `;
            }
            else{
                html += `
                <div style="margin-top: 12px; text-align: center;">
                    <button id="show-sed-btn" class="sed-button" style="padding: 6px 12px; background-color: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; margin: 0 3px;">Show SED</button>
                    <button id="show-properties-btn" class="properties-button" style="padding: 6px 12px; background-color: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; margin: 0 3px;">Show Properties</button>
                    <button id="show-rgb-btn" class="rgb-button" style="padding: 6px 12px; background-color: #FF9800; color: white; border: none; border-radius: 4px; cursor: pointer; margin: 0 3px;">Show RGB</button>
                </div>
            `;
            }
          
            
            // Additional properties section removed - only showing coordinates and buttons
            
            contentElement.innerHTML = html;
            
            // Add event listeners to the buttons
            setTimeout(() => {
                const sedButton = document.getElementById('show-sed-btn');
                const propertiesButton = document.getElementById('show-properties-btn');
                const rgbButton = document.getElementById('show-rgb-btn');
                
                if (sedButton) {
                    sedButton.addEventListener('click', (e) => {
                        e.stopPropagation();
                        
                        // Get the current catalog name
                        const catalogName = window.currentCatalogName || window.activeCatalog;
                        

                                                // Get galaxy name (robust)
                        const getGalaxyFrom = (obj) => {
                            if (!obj) return null;
                            const candidates = [obj.galaxy_name, obj.PHANGS_GALAXY, obj.NAME, obj.name, obj.galaxy];
                            for (const v of candidates) {
                                if (typeof v === 'string') {
                                    const s = v.trim();
                                    if (s) return s;
                                }
                            }
                            return null;
                        };

                        let galaxyNameForSed =
                            getGalaxyFrom(this.content) ||
                            getGalaxyFrom(window.catalogDataForOverlay && window.catalogDataForOverlay[this.sourceIndex]) ||
                            (typeof window.galaxyNameFromSearch === 'string' && window.galaxyNameFromSearch.trim()) ||
                            "UnknownGalaxy";
                            
                        
                        console.log('[canvasPopup] Show SED button clicked for RA:', this.content.ra, 'DEC:', this.content.dec, 'Catalog:', catalogName, 'Galaxy:', galaxyNameForSed);
                        
                        // Show SED with galaxy name
                        if (typeof window.showSed === 'function') {
                            window.showSed(this.content.ra, this.content.dec, catalogName, galaxyNameForSed);
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
                
                if (rgbButton) {
                    rgbButton.addEventListener('click', (e) => {
                        e.stopPropagation();
                        
                        // Get the current catalog name with multiple fallbacks
                        let catalogName = window.currentCatalogName || window.activeCatalog || "UnknownCatalog";
                        
                        // Additional fallbacks for catalog name
                        if (!catalogName || catalogName === "undefined") {
                            if (this.content.catalogName) {
                                catalogName = this.content.catalogName;
                            } else if (this.content.catalog) {
                                catalogName = this.content.catalog;
                            } else if (this.content.source) {
                                catalogName = this.content.source;
                            } else {
                                catalogName = "UnknownCatalog";
                            }
                        }
                        
                        let galaxyNameForRgb = "UnknownGalaxy";
                        // Flexible resolver (case-insensitive, multiple aliases)
                        try {
                            const lowerToOrig = {};
                            for (const k in this.content) lowerToOrig[k.toLowerCase()] = k;
                            const candidates = ['gal_name','PHANGS_GALAXY','phangs_galaxy','galaxy','galaxy_name','name','object_name','obj_name','target'];
                            for (const key of candidates) {
                                const orig = lowerToOrig[key];
                                if (orig && typeof this.content[orig] === 'string') {
                                    const v = this.content[orig].trim();
                                    if (v) { galaxyNameForRgb = v; break; }
                                }
                            }
                        } catch(_) {}
                        if (galaxyNameForRgb === 'UnknownGalaxy' && window.galaxyNameFromSearch && typeof window.galaxyNameFromSearch === 'string' && window.galaxyNameFromSearch.trim() !== "") {
                            galaxyNameForRgb = window.galaxyNameFromSearch.trim();
                        }
                        
                        console.log('[canvasPopup] Show RGB button clicked for RA:', this.content.ra, 'DEC:', this.content.dec, 'Catalog:', catalogName, 'Galaxy:???????????', galaxyNameForRgb);
                        console.log('[canvasPopup] Content object:', this.content);
                        console.log('[canvasPopup] Available global variables - currentCatalogName:', window.currentCatalogName, 'activeCatalog:', window.activeCatalog);
                        
                        // Validate required parameters before calling fetchRgbCutouts
                        if (!this.content.ra || !this.content.dec) {
                            console.error('[canvasPopup] Missing RA or Dec coordinates');
                            return;
                        }
                        
                        // Show RGB panels
                        if (typeof fetchRgbCutouts === 'function') {
                            fetchRgbCutouts(this.content.ra, this.content.dec, catalogName, galaxyNameForRgb);
                        } else {
                            console.error('fetchRgbCutouts function not found. Ensure it is defined in main.js and the script is loaded.');
                        }
                    });
                    
                    // Add hover effects for RGB button
                    rgbButton.addEventListener('mouseover', () => {
                        rgbButton.style.backgroundColor = '#E68900';
                    });
                    
                    rgbButton.addEventListener('mouseout', () => {
                        rgbButton.style.backgroundColor = '#FF9800';
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


function canvasUpdateOverlay() {
    // console.log('info:::::',msource.x, source.y, source.radius_pixels);
    const activeOsViewer = window.viewer || window.tiledViewer;
    if (!activeOsViewer || !window.catalogCanvas || !window.catalogDataForOverlay) {
        return;
    }

    const ctx = window.catalogCanvas.getContext('2d');
    const catalogData = window.catalogDataForOverlay;

    // Clear canvas
    ctx.clearRect(0, 0, window.catalogCanvas.width, window.catalogCanvas.height);

    // Reset source map
    window.catalogSourceMap = [];

    // Resolve image coordinates for each source (handle RC maps / missing x,y)
    const visibleSources = catalogData.filter((source, index) => {
        if (!source) return false;

        // Prefer explicit image coords if finite
        let imgX = (Number.isFinite(source.x) ? source.x : (Number.isFinite(source.x_pixels) ? source.x_pixels : null));
        let imgY = (Number.isFinite(source.y) ? source.y : (Number.isFinite(source.y_pixels) ? source.y_pixels : null));

        // If missing, compute from RA/Dec via current WCS
        if ((!Number.isFinite(imgX) || !Number.isFinite(imgY)) && Number.isFinite(source.ra) && Number.isFinite(source.dec) && window.parsedWCS && window.parsedWCS.hasWCS) {
            try {
                const p = celestialToPixel(source.ra, source.dec, window.parsedWCS);
                if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
                    imgX = p.x;
                    imgY = p.y;
                }
            } catch (_) {}
        }

        if (!Number.isFinite(imgX) || !Number.isFinite(imgY)) return false;

        // Persist resolved coordinates so renderer can use them
        source.x = imgX;
        source.y = imgY;

        // Ensure the source has an index property
        if (typeof source.index === 'undefined') {
            source.index = index;
        }

        return true;
    });

    // Draw each source with its individual style
    visibleSources.forEach((source, visibleIndex) => {
        const imagePoint = new OpenSeadragon.Point(source.x, source.y);
        const center = activeOsViewer.viewport.imageToViewerElementCoordinates(imagePoint);

        // Get radius from source or use default
        const radiusInImageCoords = source.radius_pixels || 5;
        
        // Calculate on-screen radius correctly
        const sourceCenter = new OpenSeadragon.Point(source.x, source.y);
        const sourceEdge = new OpenSeadragon.Point(source.x + radiusInImageCoords, source.y);

        const screenCenter = activeOsViewer.viewport.imageToViewerElementCoordinates(sourceCenter);
        const screenEdge = activeOsViewer.viewport.imageToViewerElementCoordinates(sourceEdge);
        
        // Calculate distance for radius (handles rotation correctly)
        const dx = screenEdge.x - screenCenter.x;
        const dy = screenEdge.y - screenCenter.y;
        const radius = Math.sqrt(dx * dx + dy * dy);
        
        // Store source position for click detection with proper index
        window.catalogSourceMap.push({ 
            x: center.x, 
            y: center.y, 
            radius: radius, 
            sourceIndex: source.index,
            imageX: source.x,
            imageY: source.y,
            ra: source.ra,
            dec: source.dec,
            radius_pixels: source.radius_pixels
        });

        // Apply the source's individual styling
        ctx.globalAlpha = source.opacity || 0.7;
        
        // Use the source's color, not a default
        ctx.strokeStyle = source.color || '#FF8C00';
        ctx.lineWidth = source.border_width || 2;

        // Set fill color based on source's fill settings
        if (source.useTransparentFill) {
            // Create transparent fill based on stroke color
            try {
                const strokeColor = source.color || '#FF8C00';
                const r = parseInt(strokeColor.slice(1, 3), 16);
                const g = parseInt(strokeColor.slice(3, 5), 16);
                const b = parseInt(strokeColor.slice(5, 7), 16);
                ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.3)`;
            } catch (e) {
                ctx.fillStyle = 'rgba(255, 140, 0, 0.3)';
            }
        } else {
            ctx.fillStyle = source.fillColor || 'rgba(255, 140, 0, 0.3)';
        }

        // Draw the circle
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI, false);
        ctx.fill();
        ctx.stroke();

        // Add highlight effect for selected source
        if (source.index === window.currentHighlightedSourceIndex) {
            ctx.globalAlpha = 1.0;
            ctx.strokeStyle = 'yellow';
            ctx.lineWidth = 3;
            ctx.stroke();
        }


    });
    
    // Restore global alpha
    ctx.globalAlpha = 1.0;

    // console.log(`[canvasUpdateOverlay] Drew ${visibleSources.length} sources with individual styles`);
}

// Also update the canvasHandleClick function to add better error handling
function canvasHandleClick_forCanvasPopup(event) {
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
    
    // console.log("Click coordinates:", clickX, clickY);
    
    // Check if popup is already active and was clicked
    if (window.canvasPopup.active) {
        // Check if close button was clicked
        if (window.canvasPopup.isCloseButtonClicked(clickX, clickY)) {
            window.canvasPopup.hide();
            return;
        }
        
        // Check if drag handle was clicked
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
        console.log("Found closest source:", closestSource.x, closestSource.y, closestSource.radius );
        
        // Add better error checking for sourceIndex
        if (typeof closestSource.sourceIndex === 'undefined') {
            console.error("sourceIndex is undefined for closest source:", closestSource);
            return;
        }
        
        const sourceObj = window.catalogDataForOverlay[closestSource.sourceIndex];
        if (!sourceObj) {
            console.error("Source object not found at index:", closestSource.sourceIndex);
            console.error("Available catalog data length:", window.catalogDataForOverlay.length);
            console.error("Catalog data sample:", window.catalogDataForOverlay.slice(0, 3));
            return;
        }

        // Merge source data to ensure all properties are available
        const mergedSourceData = { ...sourceObj, ...closestSource };
        console.log("Source object for popup:", mergedSourceData);

        // Highlight the source on canvas
        canvasHighlightSource(closestSource.sourceIndex);
        
        // Show popup with source info
        window.canvasPopup.show(
            closestSource.sourceIndex,
            closestSource.x,
            closestSource.y,
            mergedSourceData
        );

    } else {
        console.log("No source found near click position");
        
        // If clicking empty space, hide any active popup
        if (window.canvasPopup.active) {
            window.canvasPopup.hide();
        }
    }
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
                        const catalogName = window.currentCatalogName || window.activeCatalog || "UnknownCatalog";
                    
                        // Derive galaxy name (same logic as the dedicated SED button)
                        let galaxyNameForSed = "UnknownGalaxy";
                        if (sourceObj && typeof sourceObj === 'object') {
                            if (typeof sourceObj.galaxy_name === 'string' && sourceObj.galaxy_name.trim() !== "") {
                                galaxyNameForSed = sourceObj.galaxy_name.trim();
                            } else if (typeof sourceObj.PHANGS_GALAXY === 'string' && sourceObj.PHANGS_GALAXY.trim() !== "") {
                                galaxyNameForSed = sourceObj.PHANGS_GALAXY.trim();
                            } else if (typeof sourceObj.NAME === 'string' && sourceObj.NAME.trim() !== "") {
                                galaxyNameForSed = sourceObj.NAME.trim();
                            } else if (typeof sourceObj.name === 'string' && sourceObj.name.trim() !== "") {
                                galaxyNameForSed = sourceObj.name.trim();
                            } else if (typeof sourceObj.galaxy === 'string' && sourceObj.galaxy.trim() !== "") {
                                galaxyNameForSed = sourceObj.galaxy.trim();
                            }
                        }
                        if (window.galaxyNameFromSearch && typeof window.galaxyNameFromSearch === 'string' && window.galaxyNameFromSearch.trim() !== "") {
                            galaxyNameForSed = window.galaxyNameFromSearch.trim();
                        }
                    
                        // Call the showSed function with galaxy name
                        if (typeof window.showSed === 'function') {
                            // Forward RA/DEC column overrides for SED
                            try {
                                const apiName = (catalogName || '').toString().split('/').pop();
                                const ov = (window.catalogOverridesByCatalog && (window.catalogOverridesByCatalog[catalogName] || window.catalogOverridesByCatalog[apiName])) || {};
                                if (ov && (ov.ra_col || ov.dec_col)) {
                                    // Append to URL via global hook consumed by sed.js through apiFetch
                                    window.__lastSedOverrides = { ra_col: ov.ra_col || null, dec_col: ov.dec_col || null };
                                }
                            } catch(_) {}
                            window.showSed(sourceObj.ra, sourceObj.dec, catalogName, galaxyNameForSed);
                        }
                    } else if (isPropLinkClicked) {
                        console.log("Properties link clicked in canvas popup");
                        const sourceObj = window.catalogDataForOverlay[window.canvasPopup.sourceIndex];
                        
                        // Get the current catalog name
                        const catalogName = window.currentCatalogName || "catalog";
                        
                        // Call the showProperties function with the source coordinates
                        if (typeof window.showProperties === 'function') {
                            try {
                                const apiName = (catalogName || '').toString().split('/').pop();
                                const ov = (window.catalogOverridesByCatalog && (window.catalogOverridesByCatalog[catalogName] || window.catalogOverridesByCatalog[apiName])) || {};
                                if (ov && (ov.ra_col || ov.dec_col)) {
                                    window.catalogOverridesByCatalog = window.catalogOverridesByCatalog || {};
                                    window.catalogOverridesByCatalog[apiName] = { ...window.catalogOverridesByCatalog[apiName], ...ov };
                                }
                            } catch(_) {}
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

// This is the version that *should* be calling showRegionInfo from main.js
// -- MODIFIED FOR MAIN.JS POPUP ---
// --- MODIFICATION START ---
// // This function is intended to replace the one below if using main.js popups
// function canvasHandleClick_forMainJsPopup(event) { // RENAMED and THIS IS THE INTENDED HANDLER
//     // console.log("[[DEBUG]] INTENDED canvasHandleClick (for showRegionInfo) CALLED. Event:", event);

//     if (!window.catalogSourceMap || !window.catalogDataForOverlay) {
//         console.error("Missing data for click handling", {
//             sourcesAvailable: !!window.catalogSourceMap,
//             catalogAvailable: !!window.catalogDataForOverlay
//         });
//         return;
//     }
    
//     // Get click coordinates relative to the viewer
//     const viewerElement = document.getElementById('openseadragon');
//     const rect = viewerElement.getBoundingClientRect();
//     const clickX = event.clientX - rect.left;
//     const clickY = event.clientY - rect.top;
    
//     console.log("Click coordinates:", clickX, clickY);
    
//     // Check if popup is already active and was clicked
//     if (window.canvasPopup.active) {
//         // Check if close button was clicked
//         if (window.canvasPopup.isCloseButtonClicked(clickX, clickY)) {
//             window.canvasPopup.hide();
//             return;
//         }
        
//         // Check if drag handle was clicked (or header area)
//         if (window.canvasPopup.isDragHandleClicked(clickX, clickY) || 
//            (window.canvasPopup.isPopupClicked(clickX, clickY) && clickY < window.canvasPopup.y - window.canvasPopup.height/2 + 36)) {
//             window.canvasPopup.startDrag(clickX, clickY);
//             return;
//         }
        
//         // Check if popup area was clicked (to prevent processing clicks through it)
//         if (window.canvasPopup.isPopupClicked(clickX, clickY)) {
//             return;
//         }
//     }
    
//     // Find closest source to the click point
//     let closestSource = null;
//     let closestDistance = Infinity;
//     const hitRadius = 10;
    
//     for (const source of window.catalogSourceMap) {
//         const dx = source.x - clickX;
//         const dy = source.y - clickY;
//         const distance = Math.sqrt(dx * dx + dy * dy);
        
//         if (distance <= Math.max(hitRadius, source.radius) && distance < closestDistance) {
//             closestDistance = distance;
//             closestSource = source;
//         }
//     }
    
//     // Show info if source found
//     if (closestSource) {
//         console.log("Found closest source (in the truly active canvasHandleClick that originally called window.canvasPopup.show):", closestSource);
//         const sourceObj = window.catalogDataForOverlay[closestSource.sourceIndex];
//         if (!sourceObj) {
//             console.error("Source object not found at index (in truly active canvasHandleClick):", closestSource.sourceIndex);
//             return;
//         }
        
//         console.log("Source object (in truly active canvasHandleClick):", sourceObj);
        
//         // Highlight the source on canvas
//         canvasHighlightSource(closestSource.sourceIndex);
        
//         // --- MODIFICATION START ---
//         // REPLACED the original window.canvasPopup.show(...) call with this:
//         const tempDot = {
//             dataset: {
//                 x: closestSource.imageX, // Use imageX from the source map
//                 y: closestSource.imageY, // Use imageY from the source map
//                 ra: closestSource.ra,
//                 dec: closestSource.dec,
//                 radius: closestSource.radius_pixels, // Use actual radius if available
//                 index: closestSource.sourceIndex
//             }
//         };
        
//         console.log("[TRULY Active canvasHandleClick] Calling showRegionInfo from main.js. tempDot:", tempDot, "sourceObj:", sourceObj, "event:", event);
        
//         if (typeof showRegionInfo === 'function') {
//             // console.log("[[DEBUG]] INTENDED canvasHandleClick: Attempting to call showRegionInfo.");
//             showRegionInfo(tempDot, sourceObj, event); // Pass the original event for positioning
//         } else {
//             console.error("[TRULY Active canvasHandleClick] showRegionInfo function from main.js is NOT defined or not accessible!");
//         }
//         // --- MODIFICATION END ---

//     } else {
//         console.log("No source found near click position");
        
//         // If clicking empty space, hide any active popup (this was part of the original logic)
//         if (window.canvasPopup && window.canvasPopup.active) {
//             window.canvasPopup.hide();
//         }
//     }
// }


// Update the canvasHandleClick function to handle drag and drop
function canvasHandleClick_forCanvasPopup(event) { // RENAMED. THIS WAS THE CURRENTLY RUNNING HANDLER
    // console.error("[[DEBUG]] CURRENTLY RUNNING canvasHandleClick (using canvasPopup.show) CALLED. THIS IS LIKELY THE WRONG ONE FOR 'Show RGB Panels' BUTTON. Event:", event);
    
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
        // console.log("Found closest source:", closestSource);
        const sourceObj = window.catalogDataForOverlay[closestSource.sourceIndex];
        if (!sourceObj) {
            console.error("Source object not found at index:", closestSource.sourceIndex);
            return;
        }

        // --- FIX START ---
        // To ensure all data is present for the popup, we'll use the rich `closestSource`
        // object we created earlier, which now contains all necessary properties.
        // We will merge it with any extra properties from `sourceObj` just in case.
        // const mergedSourceData = { ...sourceObj, ...closestSource };
        
        const mergedSourceData = {
            ...closestSource,
            ...sourceObj,               // sourceObj.x/sourceObj.y (image pixels) win
            imageX: closestSource.imageX,
            imageY: closestSource.imageY,
            screenX: closestSource.x,
            screenY: closestSource.y
          };

        console.log("Source object for popup:", mergedSourceData);

        // Highlight the source on canvas
        canvasHighlightSource(closestSource.sourceIndex);
        
        // Show popup with source info using our canvas popup system
        window.canvasPopup.show(
            closestSource.sourceIndex,
            closestSource.x, // screen x
            closestSource.y, // screen y
            mergedSourceData // Pass the complete source data
        );
        // --- FIX END ---

        console.log(
            `[Hit] screen: (${closestSource.x.toFixed(2)}, ${closestSource.y.toFixed(2)}) | ` +
            `image: (${
              Number.isFinite(closestSource.imageX) ? closestSource.imageX.toFixed(2) : 'NA'
            }, ${
              Number.isFinite(closestSource.imageY) ? closestSource.imageY.toFixed(2) : 'NA'
            }) | r(px): ${
              typeof closestSource.radius === 'number' ? closestSource.radius.toFixed(2) : closestSource.radius
            } | idx: ${closestSource.sourceIndex}`
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
    
    const activeOsViewer = window.viewer || window.tiledViewer; // Use the same logic to find the active viewer

    if (!activeOsViewer) {
        console.error("No active viewer (window.viewer or window.tiledViewer) available for catalog overlay");
        return;
    }

    if (!catalogData || catalogData.length === 0) {
        console.error("No catalog data available");
        return;
    }
    
    console.log(`Adding overlay with ${catalogData.length} objects using pure canvas rendering`);
    

    
    // Store catalog data for later use
    window.catalogDataForOverlay = catalogData;

    // Helper to resolve galaxy name from any common column (case-insensitive)
    function getGalaxyFlexible(obj) {
        if (!obj || typeof obj !== 'object') return null;
        const lowerToOrig = {};
        try {
            for (const k in obj) {
                lowerToOrig[k.toLowerCase()] = k;
            }
        } catch(_) {}
        const candidates = ['gal_name','phangs_galaxy','galaxy','galaxy_name','name','object_name','obj_name','target'];
        for (const key of candidates) {
            const orig = lowerToOrig[key];
            if (orig && typeof obj[orig] === 'string') {
                const v = obj[orig].trim();
                if (v) return v;
            }
        }
        return null;
    }
    
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
    activeOsViewer.addHandler('canvas-press', function(event) {
        // Store the starting position for drag detection
        dragStartPos = {
            x: event.position.x,
            y: event.position.y
        };
        isDragging = false;
    });
    
    activeOsViewer.addHandler('canvas-drag', function(event) {
        if (!dragStartPos) return;
        
        // Check if we've moved far enough to consider this a drag
        const dx = event.position.x - dragStartPos.x;
        const dy = event.position.y - dragStartPos.y;
        const distance = Math.sqrt(dx*dx + dy*dy);
        
        if (distance > 5) {
            isDragging = true;
        }
    });
    
    activeOsViewer.addHandler('canvas-release', function(event) {
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
            
            canvasHandleClick_forCanvasPopup(clickEvent); // MODIFIED to call the correct handler
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
    activeOsViewer.addHandler('animation', canvasUpdateOverlay);
    activeOsViewer.addHandler('open', canvasUpdateOverlay);
    
    const throttledUpdate = throttle(function() {
        canvasUpdateOverlay();
    }, 100);
    activeOsViewer.addHandler('pan', throttledUpdate);
    
    const debouncedZoomUpdate = debounce(function() {
        canvasUpdateOverlay();
    }, 50);
    activeOsViewer.addHandler('zoom', debouncedZoomUpdate);
    
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
    const activeOsViewer = window.viewer || window.tiledViewer;
    if (activeOsViewer) {
        // Explicitly remove handlers if they were added. 
        // Note: OSD typically needs handler functions themselves to remove them, 
        // so this might not be fully effective without storing handler references.
        // However, OSD should clean up on close/destroy.
        // Example of attempting removal (might need more robust handler management):
        // activeOsViewer.removeHandler('canvas-press', THE_ACTUAL_HANDLER_FUNCTION_REFERENCE);
        // activeOsViewer.removeHandler('animation', canvasUpdateOverlay); // This might work if canvasUpdateOverlay is the exact ref.
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
    // window.showRegionInfo = function() { // COMMENTED OUT to prevent override
    //     console.log("showRegionInfo called but we're using canvas popups instead");
    //     return null;
    // };
    
    // Also expose canvas functions with their original names
    window.canvasAddCatalogOverlay = canvasAddCatalogOverlay;
    window.canvasUpdateOverlay = canvasUpdateOverlay;
    window.canvasHandleClick = canvasHandleClick_forCanvasPopup; // MODIFIED to assign correct handler
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


// Ensure canvas system is ready when DOM loads
document.addEventListener('DOMContentLoaded', function() {
    // Force canvas implementation to be active
    if (typeof initPureCanvasImplementation === 'function') {
        console.log('Initializing pure canvas implementation...');
        initPureCanvasImplementation();
    }
    
    // Verify canvas functions are available
    setTimeout(() => {
        console.log('Canvas overlay functions available:', {
            canvasAddCatalogOverlay: typeof window.canvasAddCatalogOverlay,
            canvasUpdateOverlay: typeof window.canvasUpdateOverlay,
            canvasClearCatalogOverlay: typeof window.canvasClearCatalogOverlay
        });
    }, 1000);
});
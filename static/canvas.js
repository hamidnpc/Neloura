// canvas-catalog-overlay.js - Pure Canvas Implementation

// Utility functions for throttling and debouncing
function throttle(func, wait) {
    let lastCall = 0;
    let trailingTimer = null;
    return function (...args) {
        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const elapsed = now - lastCall;
        const invoke = () => {
            lastCall = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
            trailingTimer = null;
            return func.apply(this, args);
        };
        if (elapsed >= wait) {
            if (trailingTimer) {
                clearTimeout(trailingTimer);
                trailingTimer = null;
            }
            return invoke();
        }
        if (!trailingTimer) {
            trailingTimer = setTimeout(invoke, Math.max(0, wait - elapsed));
        }
    };
}

function debounce(func, wait) {
    let timeout = null;
    return function (...args) {
        if (timeout) clearTimeout(timeout);
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

// Keep the overlay canvas aligned with the OpenSeadragon container in both CSS pixels and DPR.
// If the browser scales the canvas backing store, markers can drift slightly during pan/zoom,
// especially when zoomed out.
function __syncCatalogCanvasDprSize() {
    try {
        const canvas = window.catalogCanvas;
        if (!canvas) return;
        const viewerElement = document.getElementById('openseadragon');
        if (!viewerElement) return;
        const cssW = Math.max(1, viewerElement.clientWidth || 1);
        const cssH = Math.max(1, viewerElement.clientHeight || 1);
        const dpr = Math.max(1, (window.devicePixelRatio || 1));
        const wantW = Math.max(1, Math.round(cssW * dpr));
        const wantH = Math.max(1, Math.round(cssH * dpr));
        if (canvas.width !== wantW || canvas.height !== wantH || canvas.__nelouraDpr !== dpr) {
            canvas.width = wantW;
            canvas.height = wantH;
            canvas.__nelouraDpr = dpr;
        }
        const ctx = canvas.getContext('2d');
        // Draw in CSS pixels; scale backing store by DPR.
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    } catch (_) {}
}

// NOTE: We intentionally do NOT translate the overlay container during pan.
// That approach can easily over/under-shoot and amplify drift. Instead we redraw
// in a very fast "preview" mode during interaction.

// Ensure overlay handlers are always bound to the *current* OpenSeadragon viewer instance.
// Dynamic-range/histogram changes may recreate/re-open the viewer and replace `window.viewer` / `window.tiledViewer`.
// If our handlers are still attached to the old viewer, the overlay won't redraw during pan/zoom
// and will look like it "slides" in the opposite direction.
function __ensureCatalogOverlayHandlersBound() {
    try {
        if (!window.catalogCanvas || !window.catalogOverlayContainer) return;
        const v = window.viewer || window.tiledViewer;
        if (!v || typeof v.addHandler !== 'function') return;
        if (window.__catalogOverlayBoundViewer === v) return;

        const H = window.__catalogOverlayViewerHandlers || (window.__catalogOverlayViewerHandlers = {});

        // Remove from old viewer if possible
        try {
            const old = window.__catalogOverlayBoundViewer;
            if (old && typeof old.removeHandler === 'function') {
                if (H.onOpen) old.removeHandler('open', H.onOpen);
                if (H.onAnimation) old.removeHandler('animation', H.onAnimation);
                if (H.onAnimationFinish) old.removeHandler('animation-finish', H.onAnimationFinish);
                if (H.onPan) old.removeHandler('pan', H.onPan);
                if (H.onZoom) old.removeHandler('zoom', H.onZoom);
                if (H.onPress) old.removeHandler('canvas-press', H.onPress);
                if (H.onDrag) old.removeHandler('canvas-drag', H.onDrag);
                if (H.onRelease) old.removeHandler('canvas-release', H.onRelease);
            }
        } catch (_) {}

        // Coalesced redraw function (shared across handlers)
        H.__rafPending = false;
        H.requestUpdate = H.requestUpdate || ((mode = 'preview') => {
            try { window.__catalogRenderMode = mode; } catch (_) {}
            if (H.__rafPending) return;
            H.__rafPending = true;
            requestAnimationFrame(() => {
                H.__rafPending = false;
                try { canvasUpdateOverlay({ mode }); } catch (_) {}
            });
        });

        H.onOpen = H.onOpen || (() => H.requestUpdate('full'));
        H.onAnimation = H.onAnimation || (() => H.requestUpdate('preview'));
        H.onAnimationFinish = H.onAnimationFinish || (() => { try { window.__catalogRenderMode = 'full'; } catch (_) {} try { canvasUpdateOverlay({ mode: 'full' }); } catch (_) {} });
        // Pan: just request a preview redraw (coalesced via rAF in requestUpdate)
        H.onPan = H.onPan || (() => H.requestUpdate('preview'));
        H.__debouncedZoom = H.__debouncedZoom || debounce(() => {
            try { window.__catalogRenderMode = 'full'; } catch (_) {}
            try { canvasUpdateOverlay({ mode: 'full' }); } catch (_) {}
        }, 40);
        H.onZoom = H.onZoom || (() => { H.requestUpdate('preview'); H.__debouncedZoom(); });

        // Drag/click handlers for popup (rebind to new viewer)
        H.__dragStartPos = null;
        H.__isDragging = false;
        H.onPress = H.onPress || ((event) => {
            try {
                H.__dragStartPos = { x: event.position.x, y: event.position.y };
                H.__isDragging = false;
            } catch (_) {}
        });
        H.onDrag = H.onDrag || ((event) => {
            try {
                const p = H.__dragStartPos;
                if (!p) return;
                const dx = event.position.x - p.x;
                const dy = event.position.y - p.y;
                if (Math.sqrt(dx * dx + dy * dy) > 5) H.__isDragging = true;
            } catch (_) {}
        });
        H.onRelease = H.onRelease || ((event) => {
            try {
                if (!H.__dragStartPos) return;
                if (!H.__isDragging) {
                    const viewerElement = document.getElementById('openseadragon');
                    const rect = viewerElement.getBoundingClientRect();
                    const clickEvent = { clientX: event.position.x + rect.left, clientY: event.position.y + rect.top };
                    canvasHandleClick_forCanvasPopup(clickEvent);
                }
            } catch (_) {}
            H.__dragStartPos = null;
            H.__isDragging = false;
        });

        // Bind to current viewer
        v.addHandler('open', H.onOpen);
        v.addHandler('animation', H.onAnimation);
        try { v.addHandler('animation-finish', H.onAnimationFinish); } catch (_) {}
        v.addHandler('pan', H.onPan);
        v.addHandler('zoom', H.onZoom);
        try { v.addHandler('canvas-press', H.onPress); } catch (_) {}
        try { v.addHandler('canvas-drag', H.onDrag); } catch (_) {}
        try { v.addHandler('canvas-release', H.onRelease); } catch (_) {}

        window.__catalogOverlayBoundViewer = v;
    } catch (_) {}
}

// When WCS becomes available (common right after adding a new panel), redraw catalog overlay so
// sources that were loaded with placeholder pixel coords (0,0) get reprojected via RA/Dec.
try {
    if (!window.__catalogOverlayWcsReadyListenerInstalled) {
        const onWcsReady = () => {
            try {
                if (window.catalogCanvas && typeof canvasUpdateOverlay === 'function') {
                    canvasUpdateOverlay();
                }
            } catch (_) {}
        };
        document.addEventListener('wcs:ready', onWcsReady);
        document.addEventListener('wcs-ready', onWcsReady);
        window.__catalogOverlayWcsReadyListenerInstalled = true;
    }
} catch (_) {}


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
        // If already initialized, verify it's still in the DOM
        if (this.domElement) {
            // Check if element is still attached to DOM
            if (!document.body.contains(this.domElement) && 
                !(document.getElementById('openseadragon') && document.getElementById('openseadragon').contains(this.domElement))) {
                console.warn('[canvasPopup.initDomElement] DOM element exists but is not attached, reinitializing');
                this.domElement = null;
            } else {
                return this.domElement;
            }
        }
        
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
        // Ensure the popup is always above region overlays, catalogs, etc.
        popup.style.zIndex = '6000';
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
        
        // Add to document – attach inside the viewer so it tracks its position,
        // but make sure the viewer is a proper positioning context.
        const viewerElement = document.getElementById('openseadragon');
        if (viewerElement) {
            try {
                const cs = window.getComputedStyle ? window.getComputedStyle(viewerElement) : null;
                const pos = cs ? cs.position : viewerElement.style.position;
                if (!pos || pos === 'static') {
                    viewerElement.style.position = 'relative';
                }
            } catch (_) {}
            viewerElement.appendChild(popup);
        } else {
            // Fallback: attach to body using viewport coordinates
            popup.style.position = 'fixed';
            document.body.appendChild(popup);
        }
        
        // Store reference
        this.domElement = popup;
        
        // Make draggable
        this.makeDomPopupDraggable(popup, header);
        
        console.log('[canvasPopup.initDomElement] DOM element created and attached, position:', popup.style.position);
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
        if (!this.active || !this.domElement) {
            console.warn('[canvasPopup.render] Cannot render: active=', this.active, 'domElement=', !!this.domElement);
            return;
        }
        
        // Check if popup is attached to body (fixed) or viewer (absolute)
        const isFixed = this.domElement.style.position === 'fixed' || 
                       window.getComputedStyle(this.domElement).position === 'fixed';
        
        // Position the DOM element
        const viewerElement = document.getElementById('openseadragon');
        
        let popupX, popupY;
        let viewerWidth, viewerHeight;
        
        if (isFixed) {
            // Popup is fixed to viewport - need to convert viewer-relative coords to viewport coords
            if (viewerElement) {
                const rect = viewerElement.getBoundingClientRect();
                popupX = rect.left + this.x + 15;
                popupY = rect.top + this.y - this.height / 2;
                viewerWidth = window.innerWidth;
                viewerHeight = window.innerHeight;
            } else {
                // Fallback: use click coordinates directly (assuming they're already viewport coords)
                popupX = this.x + 15;
                popupY = this.y - this.height / 2;
                viewerWidth = window.innerWidth;
                viewerHeight = window.innerHeight;
            }
        } else {
            // Popup is absolute relative to viewer
            if (!viewerElement) {
                console.error('[canvasPopup.render] Viewer element not found, cannot position popup');
                // Still try to show it at the click position as fallback
                this.domElement.style.left = this.x + 'px';
                this.domElement.style.top = this.y + 'px';
                this.domElement.style.display = 'block';
                return;
            }
            
            viewerWidth = viewerElement.clientWidth || window.innerWidth;
            viewerHeight = viewerElement.clientHeight || window.innerHeight;
            
            // Position popup to the right of the point by default
            popupX = this.x + 15;
            popupY = this.y - this.height / 2;
        }
        
        // Adjust if popup would extend beyond right edge
        if (popupX + this.width > viewerWidth) {
            popupX = (isFixed && viewerElement ? viewerElement.getBoundingClientRect().left + this.x : this.x) - this.width - 15;
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
        
        // Debug log to verify popup is being shown
        console.log('[canvasPopup.render] Popup rendered at:', popupX, popupY, 'display:', this.domElement.style.display, 'isFixed:', isFixed);
    },
    
    // Show method - displays the popup for a source
    show: function(sourceIndex, x, y, content) {
        console.log('[canvasPopup.show] Called with:', { sourceIndex, x, y, contentKeys: Object.keys(content || {}) });
        
        this.active = true;
        this.sourceIndex = sourceIndex;
        this.x = x;
        this.y = y;
        this.content = content || {};
        this.isDragging = false;
        
        // Make sure the DOM element is initialized
        this.initDomElement();
        
        // Verify DOM element was created
        if (!this.domElement) {
            console.error('[canvasPopup.show] Failed to initialize DOM element');
            return;
        }
        
        // Adjust width for regions (to accommodate cutout and delete buttons)
        const isRegion = this.content.source_type === 'region';
        if (isRegion && this.domElement) {
            this.width = 520;
            this.domElement.style.width = this.width + 'px';
            this.domElement.style.maxWidth = '520px';
        } else if (this.domElement) {
            this.width = 400;
            this.domElement.style.width = this.width + 'px';
            this.domElement.style.maxWidth = '350px';
        }
        
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
        // Display coordinates using bottom-left origin (to match the coords overlay readout).
        // Some call sites mistakenly pass OSD/top-left `imageY` into `y_bottom_left`, so prefer
        // deriving bottom-left from `imageY` when available.
        const resolvedXBottomLeft =
            (typeof this.content.x_bottom_left === 'number' && Number.isFinite(this.content.x_bottom_left))
                ? this.content.x_bottom_left
                : ((typeof this.content.imageX === 'number' && Number.isFinite(this.content.imageX))
                    ? this.content.imageX
                    : ((typeof this.content.x === 'number' && Number.isFinite(this.content.x)) ? this.content.x : this.content.x_bottom_left));

        let resolvedYBottomLeft =
            (typeof this.content.y_bottom_left === 'number' && Number.isFinite(this.content.y_bottom_left))
                ? this.content.y_bottom_left
                : ((typeof this.content.imageY === 'number' && Number.isFinite(this.content.imageY))
                    ? convertYToBottomOrigin(this.content.imageY)
                    : ((typeof this.content.y === 'number' && Number.isFinite(this.content.y))
                        ? convertYToBottomOrigin(this.content.y)
                        : this.content.y_bottom_left));

        // If we have imageY, ensure the displayed Y matches its bottom-left conversion.
        // This fixes cases where y_bottom_left was accidentally set to the raw top-left imageY.
        if (typeof this.content.imageY === 'number' && Number.isFinite(this.content.imageY)) {
            const yFromImage = convertYToBottomOrigin(this.content.imageY);
            if (typeof yFromImage === 'number' && Number.isFinite(yFromImage) &&
                typeof resolvedYBottomLeft === 'number' && Number.isFinite(resolvedYBottomLeft) &&
                Math.abs(yFromImage - resolvedYBottomLeft) > 1e-3) {
                resolvedYBottomLeft = yFromImage;
            }
        }

        const x = (typeof resolvedXBottomLeft === 'number' && Number.isFinite(resolvedXBottomLeft)) ? resolvedXBottomLeft.toFixed(2) : resolvedXBottomLeft;
        const y = (typeof resolvedYBottomLeft === 'number' && Number.isFinite(resolvedYBottomLeft)) ? resolvedYBottomLeft.toFixed(2) : resolvedYBottomLeft;
        html += `
            <div style="margin-bottom: 8px;">
                <span style="color: #aaa;">Position (image x, y):</span> ${x}, ${y}
            </div>
        `;
        
            
            // Prefer computing RA/Dec from current WCS at the clicked image pixel.
            // Catalogs may contain RA/Dec in a different convention or stale values; WCS readout
            // should match the viewer's coordinate overlay.
            try {
                const ix = (typeof this.content.imageX === 'number' && Number.isFinite(this.content.imageX))
                    ? this.content.imageX
                    : ((typeof this.content.x === 'number' && Number.isFinite(this.content.x)) ? this.content.x : null);
                const iy = (typeof this.content.imageY === 'number' && Number.isFinite(this.content.imageY))
                    ? this.content.imageY
                    : ((typeof this.content.y === 'number' && Number.isFinite(this.content.y)) ? this.content.y : null);
                if (ix != null && iy != null) {
                    const world = getWorldCoordinatesFromImage(ix, iy);
                    if (world && Number.isFinite(world.ra) && Number.isFinite(world.dec)) {
                        this.content.ra = world.ra;
                        this.content.dec = world.dec;
                    }
                }
            } catch (_) {}

            if (('ra' in this.content) && ('dec' in this.content) && Number.isFinite(this.content.ra) && Number.isFinite(this.content.dec)) {
                const ra = this.content.ra.toFixed(6);
                const dec = this.content.dec.toFixed(6);
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
                const isRegion = this.content.source_type === 'region';
                html += `
                <div style="margin-top: 12px; display: flex; flex-wrap: wrap; justify-content: center; gap: 6px;">
                    <button id="show-sed-btn" class="sed-button" style="padding: 6px 12px; background-color: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">Show SED</button>
                    <button id="show-properties-btn" class="properties-button" style="padding: 6px 12px; background-color: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer;">Show Properties</button>
                    <button id="show-rgb-btn" class="rgb-button" style="padding: 6px 12px; background-color: #FF9800; color: white; border: none; border-radius: 4px; cursor: pointer;">Show RGB</button>
                    ${isRegion ? '<button id="cutout-region-btn" class="cutout-region-button" style="padding: 6px 12px; background-color: #9C27B0; color: white; border: none; border-radius: 4px; cursor: pointer;">Cutout</button>' : ''}
                    ${isRegion ? '<button id="delete-region-btn" class="delete-region-button" style="padding: 6px 12px; background-color: #DC2626; color: white; border: none; border-radius: 4px; cursor: pointer;">Delete Region</button>' : ''}
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
                const cutoutRegionButton = document.getElementById('cutout-region-btn');
                const deleteRegionButton = document.getElementById('delete-region-btn');

                // For some FITS (notably certain radio maps), catalog RA/Dec can be expressed in a
                // different longitude convention (e.g. negative RA) and/or a different frame than
                // what the current map WCS uses. To ensure RGB/SED are generated for the *clicked*
                // location on the currently displayed map, resolve RA/Dec from the map WCS using
                // the clicked pixel coordinates when available.
                const __isFiniteNum = (v) => (typeof v === 'number' && Number.isFinite(v));
                async function __resolvePopupWorldCoordsFromCurrentMap() {
                    try {
                        const c = this && this.content ? this.content : null;
                        if (!c) return null;

                        const x = __isFiniteNum(c.imageX) ? Math.round(c.imageX)
                            : (__isFiniteNum(c.x_pixels) ? Math.round(c.x_pixels)
                                : (__isFiniteNum(c.x) ? Math.round(c.x) : null));
                        const y = __isFiniteNum(c.imageY) ? Math.round(c.imageY)
                            : (__isFiniteNum(c.y_pixels) ? Math.round(c.y_pixels)
                                : (__isFiniteNum(c.y) ? Math.round(c.y) : null));

                        if (!__isFiniteNum(x) || !__isFiniteNum(y)) return null;

                        const fitsPath = window.currentFitsFile || (window.fitsData && window.fitsData.filename) || null;
                        const hduIndex = (typeof window.currentHduIndex === 'number') ? window.currentHduIndex : 0;
                        if (!fitsPath) return null;

                        // Ensure session header exists (same pattern used elsewhere)
                        if (!window.__sid) {
                            const sessionRes = await fetch('/session/start');
                            const sessionJson = await sessionRes.json().catch(() => null);
                            if (sessionJson && sessionJson.session_id) window.__sid = sessionJson.session_id;
                        }
                        const headers = {};
                        if (window.__sid) headers['X-Session-ID'] = window.__sid;

                        const url =
                            `/pixel-to-world/?x=${encodeURIComponent(x)}&y=${encodeURIComponent(y)}` +
                            `&origin=top` +
                            `&filepath=${encodeURIComponent(fitsPath)}` +
                            `&hdu=${encodeURIComponent(hduIndex)}` +
                            `&_t=${Date.now()}`;

                        const resp = await fetch(url, { headers, cache: 'no-store' });
                        if (!resp.ok) return null;
                        const data = await resp.json().catch(() => null);
                        if (data && __isFiniteNum(data.ra) && __isFiniteNum(data.dec)) {
                            return { ra: data.ra, dec: data.dec };
                        }
                        return null;
                    } catch (_) {
                        return null;
                    }
                }
                
                if (sedButton) {
                    sedButton.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        
                        // Use the clicked source's catalog (NOT the globally selected/last-loaded catalog).
                        const catalogName = (() => {
                            try {
                                const raw =
                                    this.content?.__catalogName ||
                                    this.content?.catalog_name ||
                                    this.content?.catalogName ||
                                    this.content?.catalog ||
                                    window.currentCatalogName ||
                                    window.activeCatalog ||
                                    '';
                                const s = String(raw || '').trim();
                                const noPrefix = s.replace(/^catalogs\//, '');
                                const base = noPrefix.split('/').pop().split('\\').pop();
                                return base || s || 'catalog';
                            } catch (_) {
                                return window.currentCatalogName || window.activeCatalog || 'catalog';
                            }
                        })();
                        

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
                            
                        
                        // Prefer WCS-derived coords for the clicked pixel on the current map when possible.
                        let ra = this.content && __isFiniteNum(this.content.ra) ? this.content.ra : null;
                        let dec = this.content && __isFiniteNum(this.content.dec) ? this.content.dec : null;
                        const wcsCoords = await __resolvePopupWorldCoordsFromCurrentMap.call(this);
                        if (wcsCoords && __isFiniteNum(wcsCoords.ra) && __isFiniteNum(wcsCoords.dec)) {
                            ra = wcsCoords.ra;
                            dec = wcsCoords.dec;
                        }

                        console.log('[canvasPopup] Show SED button clicked for RA:', ra, 'DEC:', dec, 'Catalog:', catalogName, 'Galaxy:', galaxyNameForSed);
                        
                        // Show SED with galaxy name.
                        // In multi-panel (iframe) mode, call the top window so it renders full-width.
                        const hostWin = (() => { try { return (window.top && window.top !== window) ? window.top : window; } catch (_) { return window; } })();
                        if (hostWin && typeof hostWin.showSed === 'function') {
                            hostWin.showSed(ra, dec, catalogName, galaxyNameForSed);
                        } else if (typeof window.showSed === 'function') {
                            window.showSed(ra, dec, catalogName, galaxyNameForSed);
                        } else {
                            console.error('showSed function not found');
                        }
                    });
                }
                
                if (propertiesButton) {
                    propertiesButton.addEventListener('click', (e) => {
                        e.stopPropagation();
                        
                        // Use the clicked source's catalog (NOT the globally selected/last-loaded catalog).
                        const catalogName = (() => {
                            try {
                                const raw =
                                    this.content?.__catalogName ||
                                    this.content?.catalog_name ||
                                    this.content?.catalogName ||
                                    this.content?.catalog ||
                                    window.currentCatalogName ||
                                    window.activeCatalog ||
                                    '';
                                const s = String(raw || '').trim();
                                const noPrefix = s.replace(/^catalogs\//, '');
                                const base = noPrefix.split('/').pop().split('\\').pop();
                                return base || s || 'catalog';
                            } catch (_) {
                                return window.currentCatalogName || window.activeCatalog || 'catalog';
                            }
                        })();
                        
                        // Show properties
                        if (typeof window.showProperties === 'function') {
                            window.showProperties(this.content.ra, this.content.dec, catalogName, this.content.radius_pixels, this.content);
                        } else {
                            console.error('showProperties function not found');
                        }
                    });
                }
                
                if (rgbButton) {
                    rgbButton.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        
                        // Get the current catalog name with multiple fallbacks
                        let catalogName =
                            (this.content && (this.content.__catalogName || this.content.catalog_name || this.content.catalogName || this.content.catalog)) ||
                            window.currentCatalogName ||
                            window.activeCatalog ||
                            "UnknownCatalog";
                        try {
                            const s = String(catalogName || '').trim().replace(/^catalogs\//, '');
                            catalogName = s.split('/').pop().split('\\').pop() || s || catalogName;
                        } catch (_) {}
                        
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
                        
                        // Prefer WCS-derived coords for the clicked pixel on the current map when possible.
                        let ra = this.content && __isFiniteNum(this.content.ra) ? this.content.ra : null;
                        let dec = this.content && __isFiniteNum(this.content.dec) ? this.content.dec : null;
                        const wcsCoords = await __resolvePopupWorldCoordsFromCurrentMap.call(this);
                        if (wcsCoords && __isFiniteNum(wcsCoords.ra) && __isFiniteNum(wcsCoords.dec)) {
                            ra = wcsCoords.ra;
                            dec = wcsCoords.dec;
                        }

                        console.log('[canvasPopup] Show RGB button clicked for RA:', ra, 'DEC:', dec, 'Catalog:', catalogName, 'Galaxy:', galaxyNameForRgb);
                        console.log('[canvasPopup] Content object:', this.content);
                        console.log('[canvasPopup] Available global variables - currentCatalogName:', window.currentCatalogName, 'activeCatalog:', window.activeCatalog);
                        
                        // Validate required parameters before calling fetchRgbCutouts
                        if (!__isFiniteNum(ra) || !__isFiniteNum(dec)) {
                            console.error('[canvasPopup] Missing RA or Dec coordinates');
                            return;
                        }
                        
                        // Show RGB panels.
                        // In multi-panel (iframe) mode, call the top window so it renders full-width.
                        const hostWin = (() => { try { return (window.top && window.top !== window) ? window.top : window; } catch (_) { return window; } })();
                        if (hostWin && typeof hostWin.fetchRgbCutouts === 'function') {
                            hostWin.fetchRgbCutouts(ra, dec, catalogName, galaxyNameForRgb);
                        } else if (typeof fetchRgbCutouts === 'function') {
                            fetchRgbCutouts(ra, dec, catalogName, galaxyNameForRgb);
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
                
                if (cutoutRegionButton) {
                    cutoutRegionButton.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        if (!this.content.ra || !this.content.dec) {
                            console.error('[canvasPopup] Missing RA or Dec coordinates for cutout');
                            if (typeof window.showNotification === 'function') {
                                window.showNotification('Cannot create cutout: Missing coordinates', 3500, 'error');
                            } else {
                                alert('Cannot create cutout: Missing coordinates');
                            }
                            return;
                        }
                        
                        const regionData = {
                            ra: this.content.ra,
                            dec: this.content.dec,
                            region_type: this.content.region_type,
                            region_id: this.content.region_id,
                            radius_pixels: this.content.radius_pixels,
                            width_pixels: this.content.width_pixels,
                            height_pixels: this.content.height_pixels,
                            minor_radius_pixels: this.content.minor_radius_pixels,
                            vertices: Array.isArray(this.content.vertices) ? this.content.vertices : null,
                            fits_path: window.currentFitsFile || null,
                            hdu_index: typeof window.currentHduIndex === 'number' ? window.currentHduIndex : null
                        };
                        regionData.galaxy_name = resolveGalaxyNameForCutout(this.content);
                        
                        try {
                            cutoutRegionButton.disabled = true;
                            cutoutRegionButton.textContent = 'Creating...';
                            
                            // Ensure session ID exists
                            if (!window.__sid) {
                                const sessionRes = await fetch('/session/start');
                                const sessionJson = await sessionRes.json();
                                if (sessionJson && sessionJson.session_id) {
                                    window.__sid = sessionJson.session_id;
                                }
                            }
                            
                            const headers = { 'Content-Type': 'application/json' };
                            if (window.__sid) {
                                headers['X-Session-ID'] = window.__sid;
                            }
                            
                            const response = await fetch('/region-cutout/', {
                                method: 'POST',
                                headers: headers,
                                body: JSON.stringify(regionData)
                            });
                            
                            if (!response.ok) {
                                const error = await response.json().catch(() => ({ detail: `HTTP ${response.status}: ${response.statusText}` }));
                                throw new Error(error.detail || 'Failed to create cutout');
                            }
                            
                            const result = await response.json();
                            if (typeof window.showNotification === 'function') {
                                window.showNotification(`Cutout saved: ${result.filename}`, 3000, 'success');
                            } else {
                                console.log('Cutout saved successfully:', result.filename);
                            }
                        } catch (err) {
                            console.error('[canvasPopup] Error creating cutout:', err);
                            if (typeof window.showNotification === 'function') {
                                window.showNotification(`Error creating cutout: ${err.message}`, 4000, 'error');
                            } else {
                                console.error('Error creating cutout:', err.message);
                            }
                        } finally {
                            cutoutRegionButton.disabled = false;
                            cutoutRegionButton.textContent = 'Cutout';
                        }
                    });
                }
                
                if (deleteRegionButton) {
                    deleteRegionButton.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (typeof window.deleteRegionById === 'function' && this.content.region_id) {
                            window.deleteRegionById(this.content.region_id);
                        } else {
                            console.warn('[canvasPopup] deleteRegionById not available or missing region_id');
                        }
                    });
                }
            }, 0);
        }
        
        // Update position and show
        this.render(null);
        
        // Verify popup is actually visible
        if (this.domElement && this.domElement.style.display !== 'block') {
            console.error('[canvasPopup.show] Popup DOM element display is not "block" after render:', this.domElement.style.display);
            // Force it to be visible
            this.domElement.style.display = 'block';
        }
        
        // Double-check popup is in DOM and visible
        if (this.domElement && (!document.body.contains(this.domElement) && 
            !(document.getElementById('openseadragon') && document.getElementById('openseadragon').contains(this.domElement)))) {
            console.error('[canvasPopup.show] Popup DOM element is not attached to DOM after render');
        }
        
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
    canvasUpdateOverlay({ mode: 'full' });
}

function canvasUpdateOverlay(opts = null) {
    // console.log('info:::::',msource.x, source.y, source.radius_pixels);
    const activeOsViewer = window.viewer || window.tiledViewer;
    if (!activeOsViewer || !window.catalogCanvas || !window.catalogDataForOverlay) {
        return;
    }

    __syncCatalogCanvasDprSize();
    const ctx = window.catalogCanvas.getContext('2d');
    const catalogData = window.catalogDataForOverlay;
    const renderMode = (opts && opts.mode) ? String(opts.mode) : String(window.__catalogRenderMode || 'full');
    const isPreview = (renderMode === 'preview');
    // Full redraw should reset any pan-translation so positions are correct.
    if (!isPreview) {
        try {
            if (window.catalogOverlayContainer) {
                window.catalogOverlayContainer.style.transform = '';
                const st = __getOverlayPanState();
                const origin = __computeViewerOriginScreen(activeOsViewer);
                st.baseOrigin = origin || st.baseOrigin;
            }
        } catch (_) {}
    }

    // Per-catalog boolean/condition filters (controlled by #catalog-overlay-controls in main.js).
    // IMPORTANT: In multi-panel mode, each pane has its own overlay + filters.
    // Filters must be per-pane (not shared via window.top), otherwise toggling a filter in one pane
    // will affect the other pane and also break value-loading (one pane thinks columns are loaded).
    const rootWin = window;

    // Per-catalog boolean filters
    const boolFilterStore = (rootWin.catalogBooleanFiltersByCatalog && typeof rootWin.catalogBooleanFiltersByCatalog === 'object')
        ? rootWin.catalogBooleanFiltersByCatalog
        : {};
    const coerceBool = (v) => {
        if (v == null) return null;
        if (typeof v === 'boolean') return v;
        if (typeof v === 'number') {
            if (v === 1) return true;
            if (v === 0) return false;
            return null;
        }
        if (typeof v === 'string') {
            const s = v.trim().toUpperCase();
            if (s === 'T' || s === 'TRUE' || s === 'YES' || s === 'Y' || s === '1') return true;
            if (s === 'F' || s === 'FALSE' || s === 'NO' || s === 'N' || s === '0') return false;
            return null;
        }
        return null;
    };

    // Normalize catalog keys so filters are truly per-catalog (prevents accidental sharing when
    // records use different naming conventions like "foo.fits" vs "catalogs/foo.fits").
    const normalizeCatalogKey = (raw) => {
        try {
            const s = String(raw || '').trim();
            if (!s) return '';
            if (s.startsWith('catalogs/')) return s;
            const base = s.split('/').pop().split('\\').pop();
            return base ? `catalogs/${base}` : s;
        } catch (_) {
            return String(raw || '');
        }
    };
    const passesBooleanFilters = (source) => {
        try {
            const key = normalizeCatalogKey(source.__catalogName || source.catalog_name || source.catalogName || source.catalog || '');
            if (!key) return true;
            const cfg = boolFilterStore[key];
            if (!cfg || typeof cfg !== 'object') return true;
            const loadedCols = (rootWin.__catalogLoadedValueCols && rootWin.__catalogLoadedValueCols[key]) ? rootWin.__catalogLoadedValueCols[key] : null;
            const mode = (typeof cfg.__mode === 'string' && (cfg.__mode === 'or' || cfg.__mode === 'and')) ? cfg.__mode : 'and';
            const cols = Object.keys(cfg).filter((c) => c !== '__mode' && cfg[c] === true);
            if (!cols.length) return true;
            // Optional debug: set `window.__catalogFilterDebug = true`
            try {
                const dbg = !!(rootWin.__catalogFilterDebug || window.__catalogFilterDebug);
                if (dbg && !passesBooleanFilters.__loggedOnce) {
                    passesBooleanFilters.__loggedOnce = true;
                    const sampleCol = cols[0];
                    const v = source ? source[sampleCol] : undefined;
                    console.debug('[catalog-filters][canvas][bool] sample', {
                        catalog: key,
                        mode,
                        enabledCols: cols.slice(0, 10),
                        sampleCol,
                        sampleValue: v,
                        sampleType: (v === null ? 'null' : typeof v),
                        loadedFlag: loadedCols ? loadedCols[sampleCol] : undefined
                    });
                }
            } catch (_) {}
            if (mode === 'or') {
                for (const col of cols) {
                    // If values for this column are not loaded yet, don't hide everything.
                    if ((typeof source[col] === 'undefined') || (loadedCols && !loadedCols[col] && source[col] == null)) return true;
                    const b = coerceBool(source[col]);
                    if (b === true) return true;
                }
                return false;
            }
            // default AND
            for (const col of cols) {
                if ((typeof source[col] === 'undefined') || (loadedCols && !loadedCols[col] && source[col] == null)) return true;
                const b = coerceBool(source[col]);
                if (b !== true) return false;
            }
            return true;
        } catch (_) {
            return true;
        }
    };

    // Per-catalog numeric conditions (controlled by #catalog-overlay-controls in main.js)
    const condFilterStore = (rootWin.catalogConditionFiltersByCatalog && typeof rootWin.catalogConditionFiltersByCatalog === 'object')
        ? rootWin.catalogConditionFiltersByCatalog
        : {};
    const coerceNum = (v) => {
        if (v == null) return null;
        if (typeof v === 'number') return Number.isFinite(v) ? v : null;
        if (typeof v === 'boolean') return null;
        if (typeof v === 'string') {
            const s = v.trim();
            if (!s) return null;
            const n = Number(s);
            return Number.isFinite(n) ? n : null;
        }
        return null;
    };
    const cmp = (a, op, b) => {
        if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
        switch (op) {
            case '>': return a > b;
            case '>=': return a >= b;
            case '<': return a < b;
            case '<=': return a <= b;
            case '!=': return Math.abs(a - b) > 1e-9;
            case '==': return Math.abs(a - b) <= 1e-9;
            default: return false;
        }
    };
    const passesConditionFilters = (source) => {
        try {
            const key = normalizeCatalogKey(source.__catalogName || source.catalog_name || source.catalogName || source.catalog || '');
            if (!key) return true;
            const cfg = condFilterStore[key];
            if (!cfg) return true;
            const loadedCols = (rootWin.__catalogLoadedValueCols && rootWin.__catalogLoadedValueCols[key]) ? rootWin.__catalogLoadedValueCols[key] : null;
            const mode = (cfg && typeof cfg === 'object' && typeof cfg.__mode === 'string' && (cfg.__mode === 'or' || cfg.__mode === 'and'))
                ? cfg.__mode
                : 'and';
            const conds = (cfg && typeof cfg === 'object' && Array.isArray(cfg.conditions))
                ? cfg.conditions.filter(Boolean)
                : (Array.isArray(cfg) ? cfg.filter(Boolean) : []);
            if (!conds.length) return true;

            const evalOne = (c) => {
                const col = c && (c.col || c.column || c.field);
                const op = c && (c.op || c.operator);
                const value = c && (typeof c.value !== 'undefined' ? c.value : c.v);
                if (!col || !op) return true;
                // If the column values are not loaded yet, do not filter out everything.
                if ((typeof source[col] === 'undefined') || (loadedCols && !loadedCols[col] && source[col] == null)) return true;
                const a = coerceNum(source[col]);
                const b = coerceNum(value);
                return cmp(a, String(op), b);
            };

            if (mode === 'or') {
                for (const c of conds) {
                    if (evalOne(c)) return true;
                }
                return false;
            }
            // default AND
            for (const c of conds) {
                if (!evalOne(c)) return false;
            }
            return true;
        } catch (_) {
            return true;
        }
    };

    // Cross-match filter (controlled by #catalog-overlay-controls in main.js)
    const crossCfg = (() => {
        try {
            const cfg = window.catalogCrossMatchConfig;
            if (!cfg || typeof cfg !== 'object') return { enabled: false, radius_arcsec: 1.0 };
            const enabled = !!cfg.enabled;
            const r = Number(cfg.radius_arcsec);
            return { enabled, radius_arcsec: (Number.isFinite(r) && r > 0) ? r : 1.0 };
        } catch (_) {
            return { enabled: false, radius_arcsec: 1.0 };
        }
    })();

    const computeCrossMatchedIndexSet = () => {
        try {
            if (!crossCfg.enabled) return null;
            const sepArcsec = crossCfg.radius_arcsec;
            if (!Number.isFinite(sepArcsec) || sepArcsec <= 0) return null;
            const sepDeg = sepArcsec / 3600.0;

            // Build candidate list (after boolean + condition filters) and group by catalog key
            const points = []; // { idx, cat, ra, dec }
            const byCat = new Map(); // cat -> array of point indices in `points`
            for (let i = 0; i < catalogData.length; i += 1) {
                const s = catalogData[i];
                if (!s) continue;
                if (!passesBooleanFilters(s)) continue;
                if (!passesConditionFilters(s)) continue;
                if (!Number.isFinite(s.ra) || !Number.isFinite(s.dec)) continue;
                const cat = normalizeCatalogKey(s.__catalogName || s.catalog_name || s.catalogName || s.catalog || '');
                if (!cat) continue;
                let ra = Number(s.ra);
                if (Number.isFinite(ra)) ra = ((ra % 360) + 360) % 360;
                const dec = Number(s.dec);
                const p = { idx: i, cat, ra, dec };
                const pIndex = points.length;
                points.push(p);
                if (!byCat.has(cat)) byCat.set(cat, []);
                byCat.get(cat).push(pIndex);
            }
            const cats = Array.from(byCat.keys());
            if (cats.length < 2) return null;

            // Bin-based neighbor search for speed (global bins across all cats)
            const step = Math.max(sepDeg, 1e-6);
            const raBins = Math.ceil(360 / step);
            const binKey = (ra, dec) => {
                const bx = Math.floor(ra / step);
                const by = Math.floor((dec + 90) / step);
                return `${bx}:${by}`;
            };
            const bins = new Map(); // cell -> array of point indices
            for (let pi = 0; pi < points.length; pi += 1) {
                const p = points[pi];
                const k = binKey(p.ra, p.dec);
                const arr = bins.get(k);
                if (arr) arr.push(pi);
                else bins.set(k, [pi]);
            }

            const degToRad = Math.PI / 180;
            const maxRad = (sepArcsec / 3600.0) * degToRad;
            const maxRad2 = maxRad * maxRad;

            // small-angle squared separation in radians (good for arcsec-level matching)
            const sep2 = (ra1, dec1, ra2, dec2) => {
                let dra = (ra2 - ra1) * degToRad;
                // wrap dra to [-pi, pi]
                if (dra > Math.PI) dra -= 2 * Math.PI;
                if (dra < -Math.PI) dra += 2 * Math.PI;
                const ddec = (dec2 - dec1) * degToRad;
                const decm = ((dec1 + dec2) * 0.5) * degToRad;
                const x = dra * Math.cos(decm);
                const y = ddec;
                return x * x + y * y;
            };

            // Union-find across all points; connect edges between different catalogs within sep.
            const parent = new Array(points.length);
            const rank = new Array(points.length).fill(0);
            for (let i = 0; i < points.length; i += 1) parent[i] = i;
            const find = (x) => {
                while (parent[x] !== x) {
                    parent[x] = parent[parent[x]];
                    x = parent[x];
                }
                return x;
            };
            const union = (a, b) => {
                let ra = find(a);
                let rb = find(b);
                if (ra === rb) return;
                if (rank[ra] < rank[rb]) { const t = ra; ra = rb; rb = t; }
                parent[rb] = ra;
                if (rank[ra] === rank[rb]) rank[ra] += 1;
            };

            // For each point, check neighbor bins and union with close points from other catalogs
            for (let pi = 0; pi < points.length; pi += 1) {
                const p = points[pi];
                const bx = Math.floor(p.ra / step);
                const by = Math.floor((p.dec + 90) / step);
                for (let dx = -1; dx <= 1; dx += 1) {
                    let nbx = bx + dx;
                    if (nbx < 0) nbx += raBins;
                    if (nbx >= raBins) nbx -= raBins;
                    for (let dy = -1; dy <= 1; dy += 1) {
                        const nby = by + dy;
                        const key = `${nbx}:${nby}`;
                        const cand = bins.get(key);
                        if (!cand) continue;
                        for (const qi of cand) {
                            if (qi <= pi) continue; // avoid double work
                            const q = points[qi];
                            if (q.cat === p.cat) continue; // only cross-catalog edges
                            if (sep2(p.ra, p.dec, q.ra, q.dec) <= maxRad2) {
                                union(pi, qi);
                            }
                        }
                    }
                }
            }

            // Collect components and require the component to include ALL loaded catalogs (AND semantics).
            const need = new Set(cats);
            const catMaskByRoot = new Map(); // root -> Set(cats)
            const membersByRoot = new Map(); // root -> array of points indices
            for (let pi = 0; pi < points.length; pi += 1) {
                const r = find(pi);
                let s = catMaskByRoot.get(r);
                if (!s) { s = new Set(); catMaskByRoot.set(r, s); }
                s.add(points[pi].cat);
                const m = membersByRoot.get(r);
                if (m) m.push(pi);
                else membersByRoot.set(r, [pi]);
            }

            const matched = new Set(); // indices in catalogData that are part of full cross-match components
            for (const [root, setCats] of catMaskByRoot.entries()) {
                // must include every catalog
                if (setCats.size !== need.size) continue;
                let ok = true;
                for (const c of need) { if (!setCats.has(c)) { ok = false; break; } }
                if (!ok) continue;
                const members = membersByRoot.get(root) || [];
                for (const pi of members) matched.add(points[pi].idx);
            }
            return matched;
        } catch (_) {
            return null;
        }
    };

    // -------------------------------------------------------------
    // Filter stats cache (so "Visible sources" doesn't change with zoom/pan)
    // -------------------------------------------------------------
    const buildFilterSignature = () => {
        try {
            const b = {};
            for (const k of Object.keys(boolFilterStore || {})) {
                const cfg = boolFilterStore[k];
                if (!cfg || typeof cfg !== 'object') continue;
                const mode = (cfg.__mode === 'or' || cfg.__mode === 'and') ? cfg.__mode : 'and';
                const cols = Object.keys(cfg).filter(c => c !== '__mode' && cfg[c] === true).sort();
                if (cols.length) b[k] = { mode, cols };
            }
            const c = {};
            for (const k of Object.keys(condFilterStore || {})) {
                const cfg = condFilterStore[k];
                if (!cfg) continue;
                const mode = (cfg && typeof cfg === 'object' && (cfg.__mode === 'or' || cfg.__mode === 'and')) ? cfg.__mode : 'and';
                const conds = (cfg && typeof cfg === 'object' && Array.isArray(cfg.conditions)) ? cfg.conditions : (Array.isArray(cfg) ? cfg : []);
                const norm = (conds || []).filter(Boolean).map(x => ({
                    col: x && (x.col || x.column || x.field),
                    op: x && (x.op || x.operator),
                    value: (x && (typeof x.value !== 'undefined' ? x.value : x.v))
                }));
                if (norm.length) c[k] = { mode, conds: norm };
            }
            const x = { enabled: !!crossCfg.enabled, radius_arcsec: Number(crossCfg.radius_arcsec || 0) };
            return JSON.stringify({ b, c, x, n: (catalogData && catalogData.length) || 0 });
        } catch (_) {
            return String((catalogData && catalogData.length) || 0);
        }
    };

    const cacheHost = (() => { try { return rootWin || window; } catch (_) { return window; } })();
    const sig = buildFilterSignature();
    const prevCache = (cacheHost.__catalogOverlayFilterStatsCache && typeof cacheHost.__catalogOverlayFilterStatsCache === 'object')
        ? cacheHost.__catalogOverlayFilterStatsCache
        : null;

    let crossMatchedIndexSet = null;
    let filteredTotal = null;
    let filteredByCatalog = null;
    if (prevCache && prevCache.sig === sig) {
        crossMatchedIndexSet = prevCache.crossMatchedIndexSet || null;
        filteredTotal = (typeof prevCache.filteredTotal === 'number') ? prevCache.filteredTotal : null;
        filteredByCatalog = (prevCache.filteredByCatalog && typeof prevCache.filteredByCatalog === 'object') ? prevCache.filteredByCatalog : null;
    } else {
        // Recompute expensive parts only when filters change.
        // For huge catalogs, avoid scanning all rows unless filters are actually enabled.
        let hasBool = false;
        try {
            for (const k of Object.keys(boolFilterStore || {})) {
                const cfg = boolFilterStore[k];
                if (!cfg || typeof cfg !== 'object') continue;
                for (const c of Object.keys(cfg)) {
                    if (c !== '__mode' && cfg[c] === true) { hasBool = true; break; }
                }
                if (hasBool) break;
            }
        } catch (_) {}
        let hasCond = false;
        try {
            for (const k of Object.keys(condFilterStore || {})) {
                const cfg = condFilterStore[k];
                const conds = (cfg && typeof cfg === 'object' && Array.isArray(cfg.conditions)) ? cfg.conditions : (Array.isArray(cfg) ? cfg : []);
                if (conds && conds.length) { hasCond = true; break; }
            }
        } catch (_) {}

        const huge = (catalogData && catalogData.length > 250000);
        if (huge && !hasBool && !hasCond && !crossCfg.enabled) {
            // No filters => total is just number of rows. Avoid O(N) scan.
            crossMatchedIndexSet = null;
            filteredTotal = catalogData.length;
            filteredByCatalog = {};
            try { cacheHost.__catalogOverlayFilterStatsCache = { sig, crossMatchedIndexSet, filteredTotal, filteredByCatalog }; } catch (_) {}
        } else {
            crossMatchedIndexSet = computeCrossMatchedIndexSet();
            const byCatalog = {};
            let total = 0;
            for (let i = 0; i < catalogData.length; i += 1) {
                const s = catalogData[i];
                if (!s) continue;
                if (!passesBooleanFilters(s)) continue;
                if (!passesConditionFilters(s)) continue;
                if (crossMatchedIndexSet && !crossMatchedIndexSet.has(i)) continue;
                total += 1;
                const k = normalizeCatalogKey(s && (s.__catalogName || s.catalog_name || s.catalogName || s.catalog || ''));
                if (k) byCatalog[k] = (byCatalog[k] || 0) + 1;
            }
            filteredTotal = total;
            filteredByCatalog = byCatalog;
            try { cacheHost.__catalogOverlayFilterStatsCache = { sig, crossMatchedIndexSet, filteredTotal, filteredByCatalog }; } catch (_) {}
        }
    }

    // -------------------------------------------------------------
    // WebGL rendering path: keep filter stats working + apply filters/styles on GPU.
    // -------------------------------------------------------------
    try {
        const r = window.__catalogWebgl;
        if (r && typeof r.draw === 'function') {
            // Viewer can be replaced (e.g. dynamic range); keep renderer synced.
            try { r.viewer = activeOsViewer; } catch (_) {}

            // If the overlay data array was replaced, rebuild GPU buffers.
            try {
                if (r.__catalogDataRef !== catalogData || r.count !== ((catalogData && catalogData.length) || 0)) {
                    r.__catalogDataRef = catalogData;
                    if (typeof r.setData === 'function') r.setData(catalogData);
                    // Force re-apply visibility mask next pass
                    r.__filterSig = null;
                }
            } catch (_) {}

            // Publish render stats (so controls update even though we skip 2D loops)
            try {
                const stats = {
                    totalShown: (typeof filteredTotal === 'number') ? filteredTotal : ((catalogData && catalogData.length) || 0),
                    byCatalog: filteredByCatalog || {}
                };
                window.__catalogOverlayRenderStats = stats;
                try { if (window.top && window.top !== window) window.top.__catalogOverlayRenderStats = stats; } catch (_) {}
                try {
                    document.dispatchEvent(new CustomEvent('catalog:renderstats', { detail: stats }));
                    try {
                        if (window.top && window.top.document && window.top.document !== document) {
                            window.top.document.dispatchEvent(new CustomEvent('catalog:renderstats', { detail: stats }));
                        }
                    } catch (_) {}
                } catch (_) {}
            } catch (_) {}

            // Update per-catalog style textures (so multi-catalog colors/borders work)
            try {
                if (typeof r.updateStyleTexturesFromOverlayData === 'function') r.updateStyleTexturesFromOverlayData(catalogData);
            } catch (_) {}

            // Apply filters by updating a visibility mask only when filters change.
            try {
                if (r.__filterSig !== sig) {
                    const n = (catalogData && catalogData.length) || 0;
                    const mask = new Uint8Array(n);
                    for (let i = 0; i < n; i += 1) {
                        const s = catalogData[i];
                        if (!s) continue;
                        if (!passesBooleanFilters(s)) continue;
                        if (!passesConditionFilters(s)) continue;
                        if (crossMatchedIndexSet && !crossMatchedIndexSet.has(i)) continue;
                        // Visibility mask for WebGL uses normalized UNSIGNED_BYTE: 255 => 1.0
                        mask[i] = 255;
                    }
                    if (typeof r.setVisibilityMask === 'function') r.setVisibilityMask(mask);
                    r.__filterSig = sig;
                }
            } catch (_) {}

            if (!r.__loggedActive) {
                r.__loggedActive = true;
                console.log('[WebGL] Active: drawing via GPU. count=', r.count);
            }
            r.draw();

            // Draw selection highlight (yellow border) on the 2D canvas on top of WebGL.
            try {
                const hi = window.currentHighlightedSourceIndex;
                const src = (Number.isInteger(hi) && hi >= 0 && catalogData && hi < catalogData.length) ? catalogData[hi] : null;
                const canvas2d = window.catalogCanvas;
                if (src && canvas2d) {
                    const ctx2 = canvas2d.getContext('2d');
                    const viewerElement = document.getElementById('openseadragon');
                    const wCss = viewerElement ? viewerElement.clientWidth : canvas2d.width;
                    const hCss = viewerElement ? viewerElement.clientHeight : canvas2d.height;
                    // Always clear 2D overlay first (otherwise the last highlight can "stick" after deselect).
                    // Clear in CSS pixels; DPR already handled by __syncCatalogCanvasDprSize()
                    try { ctx2.clearRect(0, 0, wCss, hCss); } catch (_) { try { ctx2.clearRect(0, 0, canvas2d.width, canvas2d.height); } catch (_) {} }

                    const tiledImage = activeOsViewer.world && activeOsViewer.world.getItemAt && activeOsViewer.world.getItemAt(0);
                    const hasTiledImageMethod = tiledImage && typeof tiledImage.imageToViewportCoordinates === 'function';
                    if (hasTiledImageMethod) {
                        const imgX = Number.isFinite(src.x) ? src.x : (Number.isFinite(src.x_pixels) ? src.x_pixels : null);
                        const imgY = Number.isFinite(src.y) ? src.y : (Number.isFinite(src.y_pixels) ? src.y_pixels : null);
                        if (Number.isFinite(imgX) && Number.isFinite(imgY)) {
                            const imagePoint = new OpenSeadragon.Point(imgX, imgY);
                            const viewportPoint = tiledImage.imageToViewportCoordinates(imagePoint);
                            const center = activeOsViewer.viewport.viewportToViewerElementCoordinates(viewportPoint);

                            const radiusInImageCoords = Number.isFinite(src.radius_pixels) ? src.radius_pixels : 5;
                            const sourceCenter = new OpenSeadragon.Point(imgX, imgY);
                            const sourceEdge = new OpenSeadragon.Point(imgX + radiusInImageCoords, imgY);
                            const viewportCenter = tiledImage.imageToViewportCoordinates(sourceCenter);
                            const viewportEdge = tiledImage.imageToViewportCoordinates(sourceEdge);
                            const screenCenter = activeOsViewer.viewport.viewportToViewerElementCoordinates(viewportCenter);
                            const screenEdge = activeOsViewer.viewport.viewportToViewerElementCoordinates(viewportEdge);
                            const dx = screenEdge.x - screenCenter.x;
                            const dy = screenEdge.y - screenCenter.y;
                            const radius = Math.sqrt(dx * dx + dy * dy);

                            ctx2.globalAlpha = 1.0;
                            ctx2.strokeStyle = 'yellow';
                            ctx2.lineWidth = 3;
                            ctx2.beginPath();
                            // Match the underlying marker shape so selection doesn't look like it "turns into a circle".
                            const rs = (() => {
                                if (window.regionStyles && typeof window.regionStyles === 'object') return window.regionStyles;
                                try {
                                    const topRs = window.top && window.top.regionStyles;
                                    if (topRs && typeof topRs === 'object') return topRs;
                                } catch (_) {}
                                return {};
                            })();
                            const shapeType = (src && src.shape) ? String(src.shape).toLowerCase() : (rs.shape ? String(rs.shape).toLowerCase() : 'circle');
                            if (shapeType === 'hexagon') {
                                // Flat-top regular hexagon (matches WebGL shader)
                                const sides = 6;
                                const angleOffset = 0; // 0 => vertex on +X axis
                                for (let s = 0; s < sides; s++) {
                                    const ang = angleOffset + (s * 2 * Math.PI) / sides;
                                    const px = center.x + radius * Math.cos(ang);
                                    const py = center.y + radius * Math.sin(ang);
                                    if (s === 0) ctx2.moveTo(px, py);
                                    else ctx2.lineTo(px, py);
                                }
                                ctx2.closePath();
                            } else if (shapeType === 'square' || shapeType === 'rectangle' || shapeType === 'rect' || shapeType === 'box') {
                                ctx2.rect(center.x - radius, center.y - radius, radius * 2, radius * 2);
                            } else {
                                ctx2.arc(center.x, center.y, radius, 0, 2 * Math.PI, false);
                            }
                            ctx2.stroke();
                        }
                    }
                } else if (canvas2d) {
                    // No selection: still clear the highlight layer so it returns to default.
                    const ctx2 = canvas2d.getContext('2d');
                    const viewerElement = document.getElementById('openseadragon');
                    const wCss = viewerElement ? viewerElement.clientWidth : canvas2d.width;
                    const hCss = viewerElement ? viewerElement.clientHeight : canvas2d.height;
                    try { ctx2.clearRect(0, 0, wCss, hCss); } catch (_) { try { ctx2.clearRect(0, 0, canvas2d.width, canvas2d.height); } catch (_) {} }
                }
            } catch (_) {}
            return;
        }
    } catch (_) {}

    // For large catalogs, restrict work to the current viewport using the spatial grid built in catalogs.js.
    const candidateIndices = (() => {
        try {
            const grid = (rootWin.__catalogSpatialGrid || window.__catalogSpatialGrid);
            if (!grid || !grid.cells || typeof grid.cellSize !== 'number') return null;
            const active = activeOsViewer;
            const tiledImage = active.world && active.world.getItemAt && active.world.getItemAt(0);
            if (!tiledImage || typeof tiledImage.viewportToImageRectangle !== 'function') return null;

            const vb = active.viewport.getBounds(true); // viewport coordinates
            const imgRect = tiledImage.viewportToImageRectangle(vb); // image pixels
            if (!imgRect) return null;
            const pad = 64; // expand a bit to avoid edge pop-in
            const minX = Math.max(0, imgRect.x - pad);
            const minY = Math.max(0, imgRect.y - pad);
            const maxX = imgRect.x + imgRect.width + pad;
            const maxY = imgRect.y + imgRect.height + pad;

            const cs = grid.cellSize;
            const minCx = Math.floor(minX / cs);
            const maxCx = Math.floor(maxX / cs);
            const minCy = Math.floor(minY / cs);
            const maxCy = Math.floor(maxY / cs);
            const out = [];
            for (let cx = minCx; cx <= maxCx; cx++) {
                for (let cy = minCy; cy <= maxCy; cy++) {
                    const arr = grid.cells.get(`${cx},${cy}`);
                    if (arr && arr.length) {
                        // Avoid `push(...arr)` which can throw for very large buckets.
                        for (let i = 0; i < arr.length; i += 1) out.push(arr[i]);
                    }
                }
            }
            return out.length ? out : null;
        } catch (_) {
            return null;
        }
    })();

    // If we compute missing pixel coordinates for a source, also insert/update it in the spatial grid
    // so it won't “jump” (pop in/out) when we later rely on viewport-based candidate selection.
    const maybeUpdateSpatialGrid = (idx, x, y) => {
        try {
            const grid = (rootWin.__catalogSpatialGrid || window.__catalogSpatialGrid);
            if (!grid || !grid.cells || typeof grid.cellSize !== 'number') return;
            if (!Number.isFinite(x) || !Number.isFinite(y)) return;
            if (x === 0 && y === 0) return;
            const cs = grid.cellSize;
            const cx = Math.floor(x / cs);
            const cy = Math.floor(y / cs);
            const key = `${cx},${cy}`;
            const s = catalogData[idx];
            if (s && typeof s === 'object') {
                // If already placed in same cell, skip
                if (s.__gridKey === key) return;
                s.__gridKey = key;
            }
            const arr = grid.cells.get(key);
            if (arr) arr.push(idx);
            else grid.cells.set(key, [idx]);
        } catch (_) {}
    };

    // Clear canvas (in CSS pixels; ctx transform already applies DPR)
    try {
        const viewerElement = document.getElementById('openseadragon');
        const w = viewerElement ? viewerElement.clientWidth : window.catalogCanvas.width;
        const h = viewerElement ? viewerElement.clientHeight : window.catalogCanvas.height;
        ctx.clearRect(0, 0, w, h);
    } catch (_) {
        ctx.clearRect(0, 0, window.catalogCanvas.width, window.catalogCanvas.height);
    }

    // Reset source map
    window.catalogSourceMap = [];

    // Resolve image coordinates for each source (handle RC maps / missing x,y).
    // Important: some loaders (e.g. /catalog-binary-raw) can return x_pixels=y_pixels=0 for all rows.
    // Treat (0,0) as "missing" and recompute from RA/Dec via current WCS when available.
    const visibleSources = [];
    let iter = Array.isArray(candidateIndices) ? candidateIndices : null;
    const huge = (catalogData && catalogData.length > 250000);
    const MAX_DRAW = huge ? 50000 : (isPreview ? 30000 : 120000);
    const addIfVisible = (source, index) => {
        if (!source) return;
        if (!passesBooleanFilters(source)) return;
        if (!passesConditionFilters(source)) return;
        if (crossMatchedIndexSet && !crossMatchedIndexSet.has(index)) return;
        if (visibleSources.length >= MAX_DRAW) return;

        // Prefer explicit image coords if finite
        let imgX = (Number.isFinite(source.x) ? source.x : null);
        let imgY = (Number.isFinite(source.y) ? source.y : null);
        if (Number.isFinite(imgX) && Number.isFinite(imgY) && imgX === 0 && imgY === 0) {
            imgX = null;
            imgY = null;
        }

        // Fallback to backend-provided pixel coords (if present)
        if (!Number.isFinite(imgX) || !Number.isFinite(imgY)) {
            const px = Number.isFinite(source.x_pixels) ? source.x_pixels : null;
            const py = Number.isFinite(source.y_pixels) ? source.y_pixels : null;
            if (Number.isFinite(px) && Number.isFinite(py) && !(px === 0 && py === 0)) {
                imgX = px;
                imgY = py;
            }
        }

        // If missing, compute from RA/Dec via current WCS
        if ((!Number.isFinite(imgX) || !Number.isFinite(imgY)) && Number.isFinite(source.ra) && Number.isFinite(source.dec)) {
            try {
                // Prefer the generic helper from main.js (handles flip_y and parseWCS fallback)
                if (typeof worldToPixelGeneric === 'function') {
                    const p = worldToPixelGeneric(source.ra, source.dec);
                    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
                        imgX = p.x;
                        imgY = p.y;
                    }
                } else if (window.parsedWCS && window.parsedWCS.hasWCS && typeof window.parsedWCS.worldToPixels === 'function') {
                    const p2 = window.parsedWCS.worldToPixels(source.ra, source.dec);
                    if (p2 && Number.isFinite(p2.x) && Number.isFinite(p2.y)) {
                        imgX = p2.x;
                        imgY = p2.y;
                    }
                }
            } catch (_) {}
        }

        if (!Number.isFinite(imgX) || !Number.isFinite(imgY)) return;

        // Persist resolved coordinates so renderer can use them
        source.x = imgX;
        source.y = imgY;
        // Keep spatial grid consistent when coords were missing at build time
        try { maybeUpdateSpatialGrid(index, imgX, imgY); } catch (_) {}

        // Ensure the source has an index property
        if (typeof source.index === 'undefined') {
            source.index = index;
        }
        visibleSources.push(source);
    };

    if (iter) {
        // Cap candidates to keep FPS high for huge catalogs (even in full mode when zoomed out).
        if (iter.length > MAX_DRAW) {
            const step = Math.ceil(iter.length / MAX_DRAW);
            const sampled = [];
            for (let k = 0; k < iter.length; k += step) sampled.push(iter[k]);
            iter = sampled;
        }
        // De-dup cell hits
        const seen = new Set();
        for (const idx of iter) {
            const i = Number(idx);
            if (!Number.isInteger(i) || i < 0 || i >= catalogData.length) continue;
            if (seen.has(i)) continue;
            seen.add(i);
            addIfVisible(catalogData[i], i);
            if (visibleSources.length >= MAX_DRAW) break;
        }
    } else {
        // Full scan is expensive; sample for huge catalogs even in full mode.
        const target = Math.min(MAX_DRAW, catalogData.length);
        const step = (catalogData.length > target) ? Math.ceil(catalogData.length / target) : 1;
        for (let i = 0; i < catalogData.length; i += 1) {
            if (step > 1 && (i % step) !== 0) continue;
            addIfVisible(catalogData[i], i);
            if (visibleSources.length >= MAX_DRAW) break;
        }
    }

    // Publish render stats (used by #catalog-overlay-controls to show "Visible sources: N").
    // IMPORTANT: `totalShown` must be filter-based only (not viewport-based), so it doesn't change on pan/zoom.
    try {
        const stats = {
            totalShown: (typeof filteredTotal === 'number') ? filteredTotal : visibleSources.length,
            byCatalog: filteredByCatalog || {}
        };
        window.__catalogOverlayRenderStats = stats;
        try { if (window.top && window.top !== window) window.top.__catalogOverlayRenderStats = stats; } catch (_) {}
        try {
            // Dispatch on this document
            document.dispatchEvent(new CustomEvent('catalog:renderstats', { detail: stats }));
            // Also dispatch on top-level document (panel lives there in multi-pane mode)
            try {
                if (window.top && window.top.document && window.top.document !== document) {
                    window.top.document.dispatchEvent(new CustomEvent('catalog:renderstats', { detail: stats }));
                }
            } catch (_) {}
        } catch (_) {}
    } catch (_) {}

    // Draw each source with its individual style
    // Get base TiledImage (index 0) for accurate coordinate conversion (fixes multi-image warning)
    // When segments are loaded, they're at index 1+, so we always use index 0 for the base image
    const tiledImage = activeOsViewer.world && activeOsViewer.world.getItemAt && activeOsViewer.world.getItemAt(0);
    const hasTiledImageMethod = tiledImage && typeof tiledImage.imageToViewportCoordinates === 'function';
    
    // Check for multiple images: count items or check if item at index 1 exists
    let hasMultipleImages = false;
    if (activeOsViewer.world) {
        if (typeof activeOsViewer.world.getItemsCount === 'function') {
            hasMultipleImages = activeOsViewer.world.getItemsCount() > 1;
        } else if (activeOsViewer.world.getItemAt) {
            // Fallback: check if second item exists
            hasMultipleImages = !!activeOsViewer.world.getItemAt(1);
        }
    }
    
    // If multiple images exist but TiledImage method unavailable, skip overlay to avoid warnings
    if (hasMultipleImages && !hasTiledImageMethod) {
        console.warn('[canvas] Multiple images detected but TiledImage method unavailable, skipping overlay update');
        return;
    }
    
    // When there are many points, draw a cheaper representation to keep interaction smooth.
    // (Drawing arcs/strokes for tens of thousands of points will lock up the UI.)
    const previewFastDraw = (isPreview && visibleSources.length > 4000) || (visibleSources.length > 20000);

    visibleSources.forEach((source, visibleIndex) => {
        const imagePoint = new OpenSeadragon.Point(source.x, source.y);
        // Use TiledImage for image->viewport, then viewport->viewerElement
        // NEVER use viewport method if multiple images exist (already checked above)
        let viewportPoint;
        if (hasTiledImageMethod) {
            viewportPoint = tiledImage.imageToViewportCoordinates(imagePoint);
        } else if (hasMultipleImages) {
            // Multiple images but TiledImage unavailable - skip this source
            return;
        } else {
            // Fallback only if single image and TiledImage method unavailable
            viewportPoint = activeOsViewer.viewport.imageToViewportCoordinates(imagePoint);
        }
        const center = activeOsViewer.viewport.viewportToViewerElementCoordinates(viewportPoint);

        // Get radius from source or use default
        const radiusInImageCoords = source.radius_pixels || 5;
        
        // Calculate on-screen radius correctly
        const sourceCenter = new OpenSeadragon.Point(source.x, source.y);
        const sourceEdge = new OpenSeadragon.Point(source.x + radiusInImageCoords, source.y);

        // Use TiledImage for image->viewport, then viewport->viewerElement
        let viewportCenter, viewportEdge;
        if (hasTiledImageMethod) {
            viewportCenter = tiledImage.imageToViewportCoordinates(sourceCenter);
            viewportEdge = tiledImage.imageToViewportCoordinates(sourceEdge);
        } else if (hasMultipleImages) {
            // Multiple images but TiledImage unavailable - skip this source
            return;
        } else {
            viewportCenter = activeOsViewer.viewport.imageToViewportCoordinates(sourceCenter);
            viewportEdge = activeOsViewer.viewport.imageToViewportCoordinates(sourceEdge);
        }
        const screenCenter = activeOsViewer.viewport.viewportToViewerElementCoordinates(viewportCenter);
        const screenEdge = activeOsViewer.viewport.viewportToViewerElementCoordinates(viewportEdge);
        
        // Calculate distance for radius (handles rotation correctly)
        const dx = screenEdge.x - screenCenter.x;
        const dy = screenEdge.y - screenCenter.y;
        const radius = Math.sqrt(dx * dx + dy * dy);
        
        // Store source position for click detection with proper index
        const overlayIdx = (Number.isInteger(source.__overlay_index) ? source.__overlay_index : (Number.isInteger(source.sourceIndex) ? source.sourceIndex : source.index));
        window.catalogSourceMap.push({ 
            x: center.x, 
            y: center.y, 
            radius: radius, 
            // Must be global across multiple loaded catalogs
            sourceIndex: overlayIdx,
            imageX: source.x,
            imageY: source.y,
            ra: source.ra,
            dec: source.dec,
            radius_pixels: source.radius_pixels
        });

        if (previewFastDraw) {
            // Fast preview: draw tiny squares (no stroke) – much faster than arcs.
            const a = (typeof source.opacity === 'number') ? source.opacity : 0.8;
            ctx.globalAlpha = Math.max(0, Math.min(1, a));
            ctx.fillStyle = source.color || '#FF8C00';
            // 2x2 pixel marker
            ctx.fillRect(center.x - 1, center.y - 1, 2, 2);
            ctx.globalAlpha = 1.0;
            return;
        }

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

        // Draw shape (circle / hexagon)
        const rs = (() => {
            if (window.regionStyles && typeof window.regionStyles === 'object') return window.regionStyles;
            try {
                const topRs = window.top && window.top.regionStyles;
                if (topRs && typeof topRs === 'object') return topRs;
            } catch (_) {}
            return {};
        })();
        const shapeType = (source && source.shape) ? String(source.shape) : (rs.shape ? String(rs.shape) : 'circle');
        ctx.beginPath();
        if (shapeType === 'hexagon') {
            const sides = 6;
            const angleOffset = -Math.PI / 2; // pointy top/bottom
            for (let s = 0; s < sides; s++) {
                const ang = angleOffset + (s * 2 * Math.PI) / sides;
                const px = center.x + radius * Math.cos(ang);
                const py = center.y + radius * Math.sin(ang);
                if (s === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
        } else {
            ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI, false);
        }
        ctx.fill();
        ctx.stroke();

        // Add highlight effect for selected source
        if (overlayIdx === window.currentHighlightedSourceIndex) {
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
    // Reset highlighted source
    try { window.currentHighlightedSourceIndex = -1; } catch (_) {}
    // Reset dragging state
    this.isDragging = false;
    // Hide the DOM element (do NOT remove from DOM; removing can cause flicker/races with duplicate handlers)
    try {
        const el = this.domElement || document.getElementById('canvas-dom-popup');
        if (el) {
            el.style.display = 'none';
            try { el.classList.add('hidden'); } catch (_) {}
        }
    } catch (_) {}
    // Redraw overlay (keeps highlight in sync)
    try { if (typeof canvasUpdateOverlay === 'function') canvasUpdateOverlay(); } catch (_) {}
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
                        
                        // Use the clicked source's catalog (NOT the globally selected/last-loaded catalog).
                        const catalogName = (() => {
                            try {
                                const raw =
                                    sourceObj?.__catalogName ||
                                    sourceObj?.catalog_name ||
                                    sourceObj?.catalogName ||
                                    sourceObj?.catalog ||
                                    window.currentCatalogName ||
                                    "catalog";
                                const s = String(raw || '').trim();
                                const noPrefix = s.replace(/^catalogs\//, '');
                                const base = noPrefix.split('/').pop().split('\\').pop();
                                return base || s || "catalog";
                            } catch (_) {
                                return window.currentCatalogName || "catalog";
                            }
                        })();
                        
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
                            window.showProperties(sourceObj.ra, sourceObj.dec, catalogName, sourceObj.radius_pixels, sourceObj);
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
    
    // WebGL picking fast path
    try {
        const viewerElement = document.getElementById('openseadragon');
        const rect = viewerElement.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const clickY = event.clientY - rect.top;
        if (window.__catalogWebgl && typeof window.__catalogWebgl.pick === 'function') {
            // Pass client coords so WebGL picking can reliably map to its canvas rect.
            const idx = window.__catalogWebgl.pick(event.clientX, event.clientY);
            if (Number.isInteger(idx) && idx >= 0 && idx < window.catalogDataForOverlay.length) {
                const sourceObj = window.catalogDataForOverlay[idx];
                const merged = { ...(sourceObj || {}), screenX: clickX, screenY: clickY };
                // Ensure popup has image coords even if overlay objects only have x_pixels/y_pixels
                try {
                    if (!Number.isFinite(merged.x) && Number.isFinite(merged.x_pixels)) merged.x = merged.x_pixels;
                    if (!Number.isFinite(merged.y) && Number.isFinite(merged.y_pixels)) merged.y = merged.y_pixels;
                    if (!Number.isFinite(merged.imageX) && Number.isFinite(merged.x)) merged.imageX = merged.x;
                    if (!Number.isFinite(merged.imageY) && Number.isFinite(merged.y)) merged.imageY = merged.y;
                } catch (_) {}
                try { canvasHighlightSource(idx); } catch (_) {}
                try {
                    window.canvasPopup.show(idx, clickX, clickY, merged);
                } catch (_) {}
                return;
            }
        }
    } catch (_) {}

    // Find closest source to the click point (2D fallback)
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
        // Resolve image coordinates - try multiple sources
        let imgX = closestSource.imageX;
        let imgY = closestSource.imageY;
        
        // If image coordinates are missing or invalid, try to get from sourceObj
        if (!Number.isFinite(imgX) || !Number.isFinite(imgY) || imgX === 0 || imgY === 0) {
            imgX = Number.isFinite(sourceObj.x) ? sourceObj.x : (Number.isFinite(sourceObj.x_pixels) ? sourceObj.x_pixels : null);
            imgY = Number.isFinite(sourceObj.y) ? sourceObj.y : (Number.isFinite(sourceObj.y_pixels) ? sourceObj.y_pixels : null);
        }
        
        // If still missing, compute from RA/Dec via WCS
        if ((!Number.isFinite(imgX) || !Number.isFinite(imgY) || imgX === 0 || imgY === 0) && 
            Number.isFinite(sourceObj.ra) && Number.isFinite(sourceObj.dec)) {
            try {
                if (typeof worldToPixelGeneric === 'function') {
                    const p = worldToPixelGeneric(sourceObj.ra, sourceObj.dec);
                    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
                        imgX = p.x;
                        imgY = p.y;
                    }
                } else if (window.parsedWCS && window.parsedWCS.hasWCS && typeof window.parsedWCS.worldToPixels === 'function') {
                    const p2 = window.parsedWCS.worldToPixels(sourceObj.ra, sourceObj.dec);
                    if (p2 && Number.isFinite(p2.x) && Number.isFinite(p2.y)) {
                        imgX = p2.x;
                        imgY = p2.y;
                    }
                }
            } catch (_) {}
        }
        
        // To ensure all data is present for the popup, we'll use the rich `closestSource`
        // object we created earlier, which now contains all necessary properties.
        // We will merge it with any extra properties from `sourceObj` just in case.
        const mergedSourceData = {
            ...closestSource,
            ...sourceObj,               // sourceObj.x/sourceObj.y (image pixels) win
            imageX: Number.isFinite(imgX) ? imgX : closestSource.imageX,
            imageY: Number.isFinite(imgY) ? imgY : closestSource.imageY,
            screenX: closestSource.x,
            screenY: closestSource.y,
            // Map image coordinates to the format expected by popup
            x_bottom_left: Number.isFinite(imgX) ? imgX : (Number.isFinite(closestSource.imageX) ? closestSource.imageX : (Number.isFinite(sourceObj.x) ? sourceObj.x : undefined)),
            // Bottom-left convention for display / backend cutouts (matches coords overlay).
            y_bottom_left: Number.isFinite(imgY)
                ? convertYToBottomOrigin(imgY)
                : (Number.isFinite(closestSource.imageY)
                    ? convertYToBottomOrigin(closestSource.imageY)
                    : (Number.isFinite(sourceObj.y_bottom_left)
                        ? sourceObj.y_bottom_left
                        : (Number.isFinite(sourceObj.y) ? convertYToBottomOrigin(sourceObj.y) : undefined))),
            // Also include x and y for backward compatibility
            x: Number.isFinite(imgX) ? imgX : (Number.isFinite(closestSource.imageX) ? closestSource.imageX : (Number.isFinite(sourceObj.x) ? sourceObj.x : undefined)),
            y: Number.isFinite(imgY) ? imgY : (Number.isFinite(closestSource.imageY) ? closestSource.imageY : (Number.isFinite(sourceObj.y) ? sourceObj.y : undefined))
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
    
    // Create a dedicated WebGL canvas (keeps 2D canvas free for highlights/popup UI).
    const webglCanvas = document.createElement('canvas');
    webglCanvas.className = 'catalog-webgl-canvas';
    webglCanvas.style.position = 'absolute';
    webglCanvas.style.top = '0';
    webglCanvas.style.left = '0';
    webglCanvas.style.width = '100%';
    webglCanvas.style.height = '100%';
    webglCanvas.style.pointerEvents = 'none';

    // Create 2D canvas element (fallback renderer + highlight layer)
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
    // Ensure the overlay container is positioned relative to the viewer element.
    // If #openseadragon is `position: static` (default), absolutely-positioned overlays will be
    // laid out relative to the page, causing a constant screen-space offset.
    try {
        const cs = window.getComputedStyle ? window.getComputedStyle(viewerElement) : null;
        const pos = cs ? cs.position : (viewerElement && viewerElement.style ? viewerElement.style.position : '');
        if (!pos || pos === 'static') {
            viewerElement.style.position = 'relative';
        }
    } catch (_) {}
    const __dpr = Math.max(1, (window.devicePixelRatio || 1));
    const __w = Math.max(1, Math.round((viewerElement.clientWidth || 1) * __dpr));
    const __h = Math.max(1, Math.round((viewerElement.clientHeight || 1) * __dpr));
    canvas.width = __w;
    canvas.height = __h;
    canvas.__nelouraDpr = __dpr;
    webglCanvas.width = __w;
    webglCanvas.height = __h;
    webglCanvas.__nelouraDpr = __dpr;
    
    // Add canvases to container (WebGL below, 2D on top)
    container.appendChild(webglCanvas);
    container.appendChild(canvas);
    
    // Add container to viewer
    viewerElement.appendChild(container);
    
    // Store references
    window.catalogOverlayContainer = container;
    window.catalogCanvas = canvas;
    window.catalogWebglCanvas = webglCanvas;
    window.catalogSourceMap = [];
    __syncCatalogCanvasDprSize();

    // Initialize WebGL renderer for ALL catalogs (fallback to 2D if WebGL unavailable).
    try {
        console.log('[WebGL] init attempt. CatalogWebGLRenderer=', typeof window.CatalogWebGLRenderer, 'dataLen=', (window.catalogDataForOverlay ? window.catalogDataForOverlay.length : 0));
        if (!window.CatalogWebGLRenderer) {
            console.warn('[WebGL] catalog_webgl.js not loaded (CatalogWebGLRenderer missing) — using 2D');
        } else {
            const r = new window.CatalogWebGLRenderer(webglCanvas, activeOsViewer);
            r.setData(window.catalogDataForOverlay);
            window.__catalogWebgl = r;
            console.log('[WebGL] Catalog renderer enabled. maxPointSize=', r.maxPointSize, 'count=', r.count, 'webgl2=', !!r.webgl2);

            // Clear the 2D canvas so we don't display old CPU-drawn points.
            try {
                const ctx2 = canvas.getContext('2d');
                if (ctx2) {
                    ctx2.clearRect(0, 0, (viewerElement.clientWidth || 1), (viewerElement.clientHeight || 1));
                }
            } catch (_) {}
        }
    } catch (e) {
        window.__catalogWebgl = null;
        console.warn('[WebGL] Init failed, falling back to 2D canvas:', e);
    }

    // Ensure handlers are bound to the current viewer (and keep them bound if viewer is replaced).
    __ensureCatalogOverlayHandlersBound();
    try {
        if (!window.__catalogOverlayRebindTimer) {
            window.__catalogOverlayRebindTimer = setInterval(() => {
                try { __ensureCatalogOverlayHandlersBound(); } catch (_) {}
            }, 500);
        }
    } catch (_) {}
    
    // NOTE: Click/drag + pan/zoom handlers are managed by __ensureCatalogOverlayHandlersBound()
    // so they survive viewer re-inits (e.g., histogram/dynamic range changes).
    // Avoid attaching duplicate handlers here.
    
    // Add resize handler
    window.addEventListener('resize', function() {
        if (window.catalogCanvas) {
            __syncCatalogCanvasDprSize();
            canvasUpdateOverlay({ mode: 'preview' }); // Redraw after resize
        }
    });
    
    // Set up drag handlers for the popup
    setupDragHandlers();
    
    // Initial update
    canvasUpdateOverlay();
    
    // Viewer handlers are bound/rebound via `__ensureCatalogOverlayHandlersBound()` so they survive
    // viewer re-inits (e.g., histogram/dynamic range changes). Do not attach a second set here.
    
    // Initial render - ensure overlay is drawn immediately with correct coordinates
    // Use a small delay to ensure canvas is fully set up and viewer viewport is ready
    setTimeout(() => {
        if (typeof canvasUpdateOverlay === 'function') {
            canvasUpdateOverlay();
        }
    }, 100);
    
    // Let the shared top-level controls know a catalog overlay is active for this pane
    try {
        if (typeof renderCatalogOverlayControls === 'function') {
            renderCatalogOverlayControls();
        }
    } catch (_) {}
    
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
    window.catalogWebglCanvas = null;
    window.catalogSourceMap = null;
    window.catalogDataForOverlay = null;
    window.currentHighlightedSourceIndex = -1;
    window.__catalogWebgl = null;

    // Stop rebind timer
    try {
        if (window.__catalogOverlayRebindTimer) {
            clearInterval(window.__catalogOverlayRebindTimer);
            window.__catalogOverlayRebindTimer = null;
        }
    } catch (_) {}
    
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

// -------------------------------------------------------------
// Region drawing overlay + toolbar integration
// -------------------------------------------------------------
const REGION_TOOLS = [
    { id: 'circle', cursor: 'crosshair' },
    { id: 'rectangle', cursor: 'crosshair' },
    { id: 'ellipse', cursor: 'crosshair' },
    { id: 'hexagon', cursor: 'crosshair' }
];

const regionDrawingState = {
    activeTool: null,
    // Mouse mode controls behavior when no drawing tool is active:
    // - 'pointer': clicking a region selects it / opens popup
    // - 'pan': ignore region hit-testing so user can freely pan/zoom
    mouseMode: 'pointer',
    shapes: [],
    previewShape: null,
    startImagePoint: null,
    currentImagePoint: null,
    isDrawing: false,
    pointerMoved: false,
    pointerDownImage: null,
    pointerDownPixel: null,
    selectedShapeId: null,
    counter: 1
};

let regionOverlayContainer = null;
let regionOverlayCanvas = null;
let regionOverlayPixelRatio = window.devicePixelRatio || 1;
let regionViewerHandlersBound = false;
let regionResizeTimeoutId = null;
let regionViewerPollId = null;
const REGION_CLICK_TOLERANCE_PX = 5;
const regionWorldCache = { header: null, wcs: null };

// -------------------------------------------------------------
// Multi zoom inset (region cutout) overlays
// -------------------------------------------------------------
let __regionZoomInsets = [];
let __regionZoomInsetIdCounter = 1;

function _iosGlassStyle() {
    return {
        background: 'rgba(255,255,255,0.14)',
        border: '1px solid rgba(255,255,255,0.22)',
        backdropFilter: 'blur(14px) saturate(160%)',
        WebkitBackdropFilter: 'blur(14px) saturate(160%)'
    };
}

// -------------------------------------------------------------
// Zoom inset (region cutout) overlay
// -------------------------------------------------------------
let __regionZoomInset = null;
let __regionZoomInsetAbort = null;
let __regionZoomInsetUrl = null;
let __regionZoomInsetTargetRegionId = null;
let __regionZoomInsetCalloutStyle = {
    color: '#60A5FA',      // sky-ish blue
    width: 6,              // px
    style: 'solid'         // 'solid' | 'dashed'
};

function _cleanupRegionZoomInsetUrl() {
    if (__regionZoomInsetUrl) {
        try { URL.revokeObjectURL(__regionZoomInsetUrl); } catch (_) {}
        __regionZoomInsetUrl = null;
    }
}

function ensureRegionZoomInsetOverlay() {
    if (__regionZoomInset && __regionZoomInset.el) return __regionZoomInset;
    const viewerElement = document.getElementById('openseadragon') || document.body;

    const el = document.createElement('div');
    el.id = 'region-zoom-inset';
    Object.assign(el.style, {
        position: viewerElement === document.body ? 'fixed' : 'absolute',
        right: '12px',
        bottom: '12px',
        width: '260px',
        height: '260px',
        background: 'rgba(10,10,10,0.92)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: '10px',
        boxShadow: '0 10px 26px rgba(0,0,0,0.55)',
        zIndex: '9000',
        overflow: 'hidden',
        display: 'none',
        color: '#fff',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
    });

    const header = document.createElement('div');
    Object.assign(header.style, {
        height: '34px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 10px',
        borderBottom: '1px solid rgba(255,255,255,0.12)',
        cursor: 'move',
        userSelect: 'none',
        background: 'rgba(255,255,255,0.04)'
    });

    const title = document.createElement('div');
    title.textContent = 'Zoom inset';
    Object.assign(title.style, { fontSize: '12px', fontWeight: '600', opacity: '0.92' });
    header.appendChild(title);

    // Allow users to rename the inset title inline (no popup)
    title.style.cursor = 'text';
    title.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        title.contentEditable = 'true';
        title.spellcheck = false;
        title.style.outline = 'none';
        title.style.background = 'rgba(255,255,255,0.06)';
        title.style.borderRadius = '6px';
        title.style.padding = '2px 6px';
        try {
            const range = document.createRange();
            range.selectNodeContents(title);
            const sel = window.getSelection();
            sel && sel.removeAllRanges();
            sel && sel.addRange(range);
        } catch (_) {}
        try { title.focus(); } catch (_) {}
    });
    const finishTitleEdit = (commit) => {
        if (title.contentEditable !== 'true') return;
        const current = (title.textContent || '').trim() || 'Zoom inset';
        title.contentEditable = 'false';
        title.style.background = '';
        title.style.padding = '';
        // If user cleared it, revert
        title.textContent = current;
        try { renderRegionOverlay(); } catch (_) {}
    };
    title.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            finishTitleEdit(true);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            // revert by just finishing; current text already present, but we keep it non-empty
            finishTitleEdit(false);
        }
    });
    title.addEventListener('blur', () => finishTitleEdit(true));

    const close = document.createElement('button');
    close.type = 'button';
    close.innerHTML = '&times;';
    close.setAttribute('aria-label', 'Close zoom inset');
    Object.assign(close.style, {
        width: '26px',
        height: '26px',
        borderRadius: '7px',
        border: '1px solid rgba(255,255,255,0.14)',
        background: 'rgba(0,0,0,0.25)',
        color: 'rgba(255,255,255,0.85)',
        cursor: 'pointer',
        lineHeight: '1',
        fontSize: '18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
    });
    close.addEventListener('click', (e) => {
        e.stopPropagation();
        try { el.style.display = 'none'; } catch (_) {}
        __regionZoomInsetTargetRegionId = null;
        try { renderRegionOverlay(); } catch (_) {}
    });
    header.appendChild(close);

    // Very simple config: callout color + line style + thickness
    const cfgWrap = document.createElement('div');
    Object.assign(cfgWrap.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        marginLeft: '10px'
    });

    const gear = document.createElement('button');
    gear.type = 'button';
    gear.setAttribute('aria-label', 'Inset settings');
    gear.innerHTML = '&#9881;'; // gear
    Object.assign(gear.style, {
        width: '26px',
        height: '26px',
        borderRadius: '7px',
        border: '1px solid rgba(255,255,255,0.14)',
        background: 'rgba(0,0,0,0.25)',
        color: 'rgba(255,255,255,0.85)',
        cursor: 'pointer',
        fontSize: '14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
    });

    const cfg = document.createElement('div');
    Object.assign(cfg.style, {
        position: 'absolute',
        top: '36px',
        right: '10px',
        background: 'rgba(10,10,10,0.92)',
        border: '1px solid rgba(255,255,255,0.14)',
        borderRadius: '10px',
        padding: '8px',
        display: 'none',
        zIndex: '9010',
        backdropFilter: 'blur(3px)'
    });

    const row = (labelText) => {
        const r = document.createElement('div');
        Object.assign(r.style, { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' });
        const lab = document.createElement('div');
        lab.textContent = labelText;
        Object.assign(lab.style, { fontSize: '11px', opacity: '0.8', width: '76px' });
        r.appendChild(lab);
        return { r, lab };
    };

    const r1 = row('Color');
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = __regionZoomInsetCalloutStyle.color || '#60A5FA';
    Object.assign(colorInput.style, { width: '36px', height: '22px', padding: '0', border: 'none', background: 'transparent', cursor: 'pointer' });
    r1.r.appendChild(colorInput);
    cfg.appendChild(r1.r);

    const r2 = row('Style');
    const styleSelect = document.createElement('select');
    styleSelect.innerHTML = `<option value="solid">Solid</option><option value="dashed">Dashed</option>`;
    styleSelect.value = __regionZoomInsetCalloutStyle.style || 'solid';
    Object.assign(styleSelect.style, {
        fontSize: '12px',
        color: '#fff',
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: '8px',
        padding: '4px 8px',
        cursor: 'pointer'
    });
    r2.r.appendChild(styleSelect);
    cfg.appendChild(r2.r);

    const r3 = row('Width');
    const widthRange = document.createElement('input');
    widthRange.type = 'range';
    widthRange.min = '2';
    widthRange.max = '12';
    widthRange.step = '1';
    widthRange.value = String(__regionZoomInsetCalloutStyle.width || 6);
    r3.r.appendChild(widthRange);
    cfg.appendChild(r3.r);

    const applyCfg = () => {
        __regionZoomInsetCalloutStyle = {
            color: colorInput.value || '#60A5FA',
            style: styleSelect.value === 'dashed' ? 'dashed' : 'solid',
            width: Math.max(2, Math.min(12, parseInt(widthRange.value || '6', 10) || 6))
        };
        // Tint inset border to match
        try {
            el.style.borderColor = __regionZoomInsetCalloutStyle.color;
        } catch (_) {}
        try { renderRegionOverlay(); } catch (_) {}
    };
    colorInput.addEventListener('input', applyCfg);
    styleSelect.addEventListener('change', applyCfg);
    widthRange.addEventListener('input', applyCfg);

    gear.addEventListener('click', (e) => {
        e.stopPropagation();
        cfg.style.display = (cfg.style.display === 'none' || cfg.style.display === '') ? 'block' : 'none';
    });
    // Close config if clicking elsewhere inside inset
    el.addEventListener('mousedown', (e) => {
        try {
            if (cfg.style.display === 'block' && !cfg.contains(e.target) && e.target !== gear) {
                cfg.style.display = 'none';
            }
        } catch (_) {}
    });

    // Put gear next to close (right side)
    cfgWrap.appendChild(gear);
    header.insertBefore(cfgWrap, close);
    el.appendChild(cfg);

    const body = document.createElement('div');
    Object.assign(body.style, {
        position: 'relative',
        width: '100%',
        height: 'calc(100% - 34px)',
        background: '#000'
    });

    const img = document.createElement('div');
    Object.assign(img.style, {
        position: 'absolute',
        inset: '0',
        backgroundSize: 'contain',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center'
    });
    body.appendChild(img);

    const spinner = document.createElement('div');
    Object.assign(spinner.style, {
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: '22px',
        height: '22px',
        marginLeft: '-11px',
        marginTop: '-11px',
        borderRadius: '50%',
        border: '2px solid rgba(255,255,255,0.22)',
        borderTopColor: 'rgba(255,255,255,0.85)',
        animation: 'regionInsetSpin 0.9s linear infinite',
        display: 'none'
    });
    body.appendChild(spinner);

    if (!document.getElementById('region-inset-style')) {
        const st = document.createElement('style');
        st.id = 'region-inset-style';
        st.textContent = `@keyframes regionInsetSpin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }`;
        document.head.appendChild(st);
    }

    el.appendChild(header);
    el.appendChild(body);
    viewerElement.appendChild(el);

    // draggable
    (function makeDraggable() {
        let dragging = false;
        let sx = 0, sy = 0;
        let startLeft = 0, startTop = 0;
        const onDown = (e) => {
            e.preventDefault();
            dragging = true;
            const r = el.getBoundingClientRect();
            sx = e.clientX; sy = e.clientY;
            startLeft = r.left; startTop = r.top;
            el.style.right = 'auto';
            el.style.bottom = 'auto';
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        };
        const onMove = (e) => {
            if (!dragging) return;
            const dx = e.clientX - sx;
            const dy = e.clientY - sy;
            el.style.left = `${startLeft + dx}px`;
            el.style.top = `${startTop + dy}px`;
            try { renderRegionOverlay(); } catch (_) {}
        };
        const onUp = () => {
            dragging = false;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        header.addEventListener('mousedown', onDown);
    })();

    // resizable (bottom-right handle)
    const resizeHandle = document.createElement('div');
    Object.assign(resizeHandle.style, {
        position: 'absolute',
        right: '6px',
        bottom: '6px',
        width: '14px',
        height: '14px',
        borderRight: '2px solid rgba(255,255,255,0.35)',
        borderBottom: '2px solid rgba(255,255,255,0.35)',
        borderRadius: '2px',
        cursor: 'nwse-resize',
        opacity: '0.8',
        pointerEvents: 'auto'
    });
    el.appendChild(resizeHandle);
    (function makeResizable() {
        let resizing = false;
        let sx = 0, sy = 0;
        let startW = 260, startH = 260;
        const minSize = 180;
        const maxSize = 560;
        const onDown = (e) => {
            e.preventDefault();
            e.stopPropagation();
            resizing = true;
            sx = e.clientX; sy = e.clientY;
            const r = el.getBoundingClientRect();
            startW = r.width; startH = r.height;
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        };
        const onMove = (e) => {
            if (!resizing) return;
            const dx = e.clientX - sx;
            const dy = e.clientY - sy;
            const next = Math.max(minSize, Math.min(maxSize, Math.round(Math.max(startW + dx, startH + dy))));
            el.style.width = `${next}px`;
            el.style.height = `${next}px`;
            try { renderRegionOverlay(); } catch (_) {}
        };
        const onUp = () => {
            resizing = false;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        resizeHandle.addEventListener('mousedown', onDown);
    })();

    __regionZoomInset = { el, title, img, spinner };
    // Apply style once on creation
    try { el.style.borderColor = __regionZoomInsetCalloutStyle.color; } catch (_) {}
    return __regionZoomInset;
}

function _removeZoomInsetById(insetId) {
    const idx = __regionZoomInsets.findIndex(z => z && z.id === insetId);
    if (idx >= 0) {
        const z = __regionZoomInsets[idx];
        __regionZoomInsets.splice(idx, 1);
        try { if (z.abort) z.abort.abort(); } catch (_) {}
        try { if (z.objectUrl) URL.revokeObjectURL(z.objectUrl); } catch (_) {}
        try { if (z.el && z.el.parentNode) z.el.parentNode.removeChild(z.el); } catch (_) {}
    }
}

function _removeZoomInsetsForRegion(regionId) {
    if (!regionId) return;
    const ids = __regionZoomInsets.filter(z => z && String(z.regionId) === String(regionId)).map(z => z.id);
    ids.forEach(_removeZoomInsetById);
}

function _removeAllZoomInsets() {
    const ids = __regionZoomInsets.map(z => z && z.id).filter(Boolean);
    ids.forEach(_removeZoomInsetById);
}

function _serializeZoomInsets() {
    try {
        return (__regionZoomInsets || []).filter(Boolean).map((z) => {
            const el = z.el;
            const r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
            const left = el && el.style ? el.style.left : '';
            const top = el && el.style ? el.style.top : '';
            const width = el && el.style ? el.style.width : '';
            const height = el && el.style ? el.style.height : '';
            return {
                filepathRel: z.filepathRel || null,
                title: (z.titleEl && z.titleEl.textContent) ? String(z.titleEl.textContent).trim() : 'Zoom inset',
                regionId: z.regionId || null,
                sourceRegionData: z.sourceRegionData || null,
                // Prefer explicit styles; fall back to current rect in px
                left: left || (r ? `${r.left}px` : ''),
                top: top || (r ? `${r.top}px` : ''),
                width: width || (r ? `${r.width}px` : ''),
                height: height || (r ? `${r.height}px` : '')
            };
        });
    } catch (_) {
        return [];
    }
}

async function _restoreZoomInsetsFromSerialized(list) {
    try { _removeAllZoomInsets(); } catch (_) {}
    const items = Array.isArray(list) ? list : [];
    for (const it of items) {
        try {
            if (!it || !it.filepathRel) continue;
            const z = createRegionZoomInsetOverlay({ filepathRel: it.filepathRel, titleText: it.title || 'Zoom inset', regionId: it.regionId || null });
            try { z.sourceRegionData = it.sourceRegionData || null; } catch (_) {}
            try {
                // Position/size
                z.el.style.right = 'auto';
                z.el.style.bottom = 'auto';
                if (it.left) z.el.style.left = String(it.left);
                if (it.top) z.el.style.top = String(it.top);
                if (it.width) z.el.style.width = String(it.width);
                if (it.height) z.el.style.height = String(it.height);
            } catch (_) {}
            try { await z.reload(); } catch (_) {}
        } catch (_) {}
    }
    try { renderRegionOverlay(); } catch (_) {}
}

function _restoreRegionsFromSerialized(shapes) {
    try {
        if (!Array.isArray(shapes)) return 0;
        try { if (typeof ensureRegionInfrastructure === 'function') ensureRegionInfrastructure(); } catch (_) {}
        // Deep clone to avoid cross-window object graph issues
        const cloned = JSON.parse(JSON.stringify(shapes));
        if (!Array.isArray(cloned)) return 0;
        regionDrawingState.shapes = cloned;
        regionDrawingState.previewShape = null;
        regionDrawingState.selectedShapeId = null;
        try { if (window.canvasPopup && typeof window.canvasPopup.hide === 'function') window.canvasPopup.hide(); } catch (_) {}
        renderRegionOverlay();
        return cloned.length;
    } catch (_) {
        return 0;
    }
}

function createRegionZoomInsetOverlay({ filepathRel, titleText, regionId }) {
    const viewerElement = document.getElementById('openseadragon') || document.body;
    const insetId = __regionZoomInsetIdCounter++;
    const glass = _iosGlassStyle();

    const el = document.createElement('div');
    el.className = 'region-zoom-inset';
    el.dataset.insetId = String(insetId);
    el.dataset.zoomInset = 'true';
    Object.assign(el.style, {
        position: viewerElement === document.body ? 'fixed' : 'absolute',
        right: `${12 + (insetId - 1) * 10}px`,
        bottom: `${12 + (insetId - 1) * 10}px`,
        width: '260px',
        height: '260px',
        borderRadius: '14px',
        boxShadow: '0 14px 34px rgba(0,0,0,0.55)',
        zIndex: String(9000 + insetId),
        overflow: 'hidden',
        color: '#fff',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
        background: 'rgba(10,10,10,0.92)',
        border: `1px solid rgba(255,255,255,0.15)`
    });

    const body = document.createElement('div');
    Object.assign(body.style, { position: 'relative', width: '100%', height: '100%', background: '#000' });
    el.appendChild(body);

    // Use <img> instead of background-image so we can force crisp pixel rendering.
    const img = document.createElement('img');
    img.dataset.zoomInsetImg = 'true';
    img.alt = 'Zoom inset preview';
    Object.assign(img.style, {
        position: 'absolute',
        inset: '0',
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        // Critical: prevent browser smoothing so pixels stay sharp
        imageRendering: 'pixelated'
    });
    // Some browsers use vendor-specific values
    try { img.style.imageRendering = 'pixelated'; } catch (_) {}
    try { img.style.setProperty('image-rendering', 'pixelated'); } catch (_) {}
    try { img.style.setProperty('image-rendering', 'crisp-edges'); } catch (_) {}
    body.appendChild(img);

    const spinner = document.createElement('div');
    Object.assign(spinner.style, {
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: '22px',
        height: '22px',
        marginLeft: '-11px',
        marginTop: '-11px',
        borderRadius: '50%',
        border: '2px solid rgba(255,255,255,0.22)',
        borderTopColor: 'rgba(255,255,255,0.85)',
        animation: 'regionInsetSpin 0.9s linear infinite',
        display: 'none'
    });
    body.appendChild(spinner);

    if (!document.getElementById('region-inset-style')) {
        const st = document.createElement('style');
        st.id = 'region-inset-style';
        st.textContent = `
        @keyframes regionInsetSpin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }
        /* Ensure crisp pixel scaling inside zoom insets */
        .region-zoom-inset img[data-zoom-inset-img="true"],
        .region-zoom-inset img[data-zoominsetimg="true"],
        .region-zoom-inset img[data-zoomInsetImg="true"],
        .region-zoom-inset img[data-zoomInsetImg] {
          image-rendering: pixelated;
          image-rendering: crisp-edges;
        }
        `;
        document.head.appendChild(st);
    }

    const makeCircleBtn = (html, title, onClick) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.title = title || '';
        b.innerHTML = html;
        const BTN_SIZE = 34; // slightly larger touch target
        Object.assign(b.style, {
            width: `${BTN_SIZE}px`,
            height: `${BTN_SIZE}px`,
            borderRadius: '999px',
            border: glass.border,
            background: glass.background,
            backdropFilter: glass.backdropFilter,
            WebkitBackdropFilter: glass.WebkitBackdropFilter,
            color: 'rgba(255,255,255,0.92)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 6px 16px rgba(0,0,0,0.25)',
            fontSize: '18px',
            lineHeight: '1'
        });
        b.addEventListener('click', (e) => { e.stopPropagation(); onClick && onClick(e); });
        return b;
    };

    // Title pill (editable) near top-left
    const titlePill = document.createElement('div');
    titlePill.dataset.zoomInsetTitlePill = 'true';
    Object.assign(titlePill.style, {
        position: 'absolute',
        top: '8px',
        left: '8px',
        maxWidth: 'calc(100% - 52px)', // leave room for close button on the right
        padding: '6px 8px',
        borderRadius: '999px',
        border: glass.border,
        background: glass.background,
        backdropFilter: glass.backdropFilter,
        WebkitBackdropFilter: glass.WebkitBackdropFilter,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '12px',
        fontWeight: '600',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        zIndex: '2'
    });
    body.appendChild(titlePill);

    const titleTextEl = document.createElement('div');
    titleTextEl.dataset.zoomInsetTitle = 'true';
    titleTextEl.textContent = (titleText && String(titleText).trim()) ? String(titleText).trim() : 'Zoom inset';
    Object.assign(titleTextEl.style, {
        flex: '1',
        minWidth: '0',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        cursor: 'text'
    });
    titlePill.appendChild(titleTextEl);

    // Close button (outside title pill, on the right)
    const closeBtn = makeCircleBtn('&times;', 'Close', () => {
        _removeZoomInsetById(insetId);
        try { renderRegionOverlay(); } catch (_) {}
    });
    closeBtn.dataset.zoomInsetControl = 'true';
    Object.assign(closeBtn.style, {
        position: 'absolute',
        top: '8px',
        right: '8px',
        zIndex: '2'
    });
    body.appendChild(closeBtn);

    // "Open another image" button (next to close)
    const openOtherBtn = makeCircleBtn(
        `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7.5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
  <path d="M12 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M9 14h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>`,
        'Open another image (same RA/Dec)',
        async () => {
            const getInset = () => __regionZoomInsets.find(zz => zz && zz.id === insetId);
            const zcur = getInset();
            const src = zcur && zcur.sourceRegionData ? zcur.sourceRegionData : null;
            if (!src || typeof src.ra !== 'number' || typeof src.dec !== 'number') {
                try { window.showNotification && window.showNotification('Zoom inset has no saved RA/Dec context.', 3500, 'error'); } catch (_) {}
                return;
            }

            if (typeof window.showFileBrowser !== 'function') {
                try { window.showNotification && window.showNotification('File browser not available.', 3500, 'error'); } catch (_) {}
                return;
            }

            window.showFileBrowser(async (pickedPath) => {
                try {
                    const p = String(pickedPath || '');
                    const low = p.toLowerCase();
                    const isFits = low.endsWith('.fits') || low.endsWith('.fit') || low.endsWith('.fts') || low.endsWith('.fits.gz') || low.endsWith('.fit.gz') || low.endsWith('.fts.gz');
                    if (!isFits) {
                        try { window.showNotification && window.showNotification('Please select a FITS file.', 2500, 'error'); } catch (_) {}
                        return;
                    }

                    const znow = getInset();
                    if (!znow) return;

                    // Pick best image HDU for this file (prevents 400 on multi-HDU FITS)
                    let pickedHdu = 0;
                    try {
                        // Important: keep slashes unescaped for FastAPI {filepath:path}
                        // and include session header (some deployments require it even for this endpoint).
                        const hHeaders = {};
                        if (window.__sid) hHeaders['X-Session-ID'] = window.__sid;
                        const hduResp = await fetch(`/fits-hdu-info/${encodeURI(p)}`, { headers: hHeaders, cache: 'no-store' });
                        if (hduResp.ok) {
                            const hj = await hduResp.json();
                            const list = Array.isArray(hj?.hduList) ? hj.hduList : [];
                            const rec = list.find(x => x && x.isRecommended);
                            if (rec && Number.isFinite(rec.index)) pickedHdu = Number(rec.index);
                        }
                    } catch (_) {}

                    // Re-cutout at same RA/Dec (and same region geometry if available), but from chosen FITS
                    const regionData = Object.assign({}, src, {
                        fits_path: p,
                        hdu_index: pickedHdu
                    });

                    // Ensure session for region-cutout (existing backend expects it in some flows)
                    if (!window.__sid) {
                        try {
                            const sessionRes = await fetch('/session/start');
                            const sessionJson = await sessionRes.json();
                            if (sessionJson && sessionJson.session_id) window.__sid = sessionJson.session_id;
                        } catch (_) {}
                    }

                    const headers = { 'Content-Type': 'application/json' };
                    if (window.__sid) headers['X-Session-ID'] = window.__sid;

                    // UI
                    try { znow.spinner.style.display = 'block'; } catch (_) {}

                    const resp = await fetch('/region-cutout/', {
                        method: 'POST',
                        headers,
                        body: JSON.stringify(regionData)
                    });
                    if (!resp.ok) {
                        const err = await resp.json().catch(() => ({ detail: `HTTP ${resp.status}: ${resp.statusText}` }));
                        throw new Error(err.detail || 'Failed to create cutout');
                    }
                    const result = await resp.json();
                    const cutoutRel = `uploads/${result.filename}`;
                    znow.filepathRel = cutoutRel;
                    await znow.reload();
                    try { renderRegionOverlay(); } catch (_) {}
                } catch (err) {
                    try { window.showNotification && window.showNotification(`Zoom inset: ${err.message}`, 4000, 'error'); } catch (_) {}
                } finally {
                    const znow = getInset();
                    try { if (znow) znow.spinner.style.display = 'none'; } catch (_) {}
                }
            });
        }
    );
    openOtherBtn.dataset.zoomInsetControl = 'true';
    Object.assign(openOtherBtn.style, {
        position: 'absolute',
        top: '8px',
        right: '48px',
        zIndex: '2'
    });
    body.appendChild(openOtherBtn);

    // Inline title editing
    titleTextEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        titleTextEl.contentEditable = 'true';
        titleTextEl.spellcheck = false;
        titleTextEl.style.outline = 'none';
        titleTextEl.style.whiteSpace = 'normal';
        try { titleTextEl.focus(); } catch (_) {}
    });
    const finishTitle = () => {
        if (titleTextEl.contentEditable !== 'true') return;
        const t = (titleTextEl.textContent || '').trim() || 'Zoom inset';
        titleTextEl.contentEditable = 'false';
        titleTextEl.textContent = t;
        titleTextEl.style.whiteSpace = 'nowrap';
        try { renderRegionOverlay(); } catch (_) {}
    };
    titleTextEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); finishTitle(); }
        if (e.key === 'Escape') { e.preventDefault(); finishTitle(); }
    });
    titleTextEl.addEventListener('blur', finishTitle);

    const z = {
        id: insetId,
        regionId: regionId || null,
        filepathRel,
        el,
        body,
        img,
        spinner,
        titleEl: titleTextEl,
        objectUrl: null,
        abort: null,
        // Default callout: white, 1px
        calloutStyle: { color: '#FFFFFF', width: 1, style: 'solid' },
        // Default display: grayscale (not session-dependent)
        display: { min: null, max: null, colorMap: 'grayscale', fontSize: 12 },
        // Used for "open another image" -> re-cutout at same RA/Dec
        sourceRegionData: null
    };

    // Settings panels (callout + display)
    const makePanel = () => {
        const p = document.createElement('div');
        Object.assign(p.style, {
            position: 'absolute',
            top: '44px',
            left: '8px',
            padding: '10px',
            borderRadius: '14px',
            border: glass.border,
            background: glass.background,
            backdropFilter: glass.backdropFilter,
            WebkitBackdropFilter: glass.WebkitBackdropFilter,
            color: '#fff',
            zIndex: '3',
            display: 'none',
            opacity: '0',
            transform: 'translateY(8px) scale(0.98)',
            pointerEvents: 'none',
            transition: 'opacity 160ms ease, transform 160ms ease',
            boxShadow: '0 10px 26px rgba(0,0,0,0.35)',
            minWidth: '210px'
        });
        return p;
    };

    const calloutPanel = makePanel();
    const displayPanel = makePanel();
    displayPanel.style.top = 'auto';
    displayPanel.style.bottom = '44px';
    body.appendChild(calloutPanel);
    body.appendChild(displayPanel);

    const __setPanelOpen = (panel, open) => {
        if (!panel) return;
        // Cancel any pending close timer
        try { if (panel.__closeT) { clearTimeout(panel.__closeT); panel.__closeT = null; } } catch (_) {}
        if (open) {
            panel.style.display = 'block';
            // Force to initial hidden state before animating in
            panel.style.opacity = '0';
            panel.style.transform = 'translateY(8px) scale(0.98)';
            panel.style.pointerEvents = 'none';
            requestAnimationFrame(() => {
                // Guard: could have been closed immediately
                if (panel.style.display !== 'block') return;
                panel.style.opacity = '1';
                panel.style.transform = 'translateY(0) scale(1)';
                panel.style.pointerEvents = 'auto';
            });
        } else {
            if (panel.style.display === 'none' || panel.style.display === '') return;
            panel.style.opacity = '0';
            panel.style.transform = 'translateY(8px) scale(0.98)';
            panel.style.pointerEvents = 'none';
            panel.__closeT = setTimeout(() => {
                panel.style.display = 'none';
            }, 170);
        }
    };

    const row = (labelText) => {
        const r = document.createElement('div');
        Object.assign(r.style, { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' });
        const lab = document.createElement('div');
        lab.textContent = labelText;
        Object.assign(lab.style, { fontSize: '11px', opacity: '0.85', width: '76px' });
        r.appendChild(lab);
        return { r, lab };
    };

    // Callout panel controls
    const c1 = row('Color');
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = z.calloutStyle.color;
    Object.assign(colorInput.style, { width: '36px', height: '24px', padding: '0', border: 'none', background: 'transparent', cursor: 'pointer' });
    c1.r.appendChild(colorInput);
    calloutPanel.appendChild(c1.r);

    const c2 = row('Style');
    const styleSelect = document.createElement('select');
    styleSelect.innerHTML = `<option value="solid">Solid</option><option value="dashed">Dashed</option>`;
    styleSelect.value = z.calloutStyle.style;
    Object.assign(styleSelect.style, {
        fontSize: '12px',
        color: '#fff',
        background: 'rgba(0,0,0,0.25)',
        border: '1px solid rgba(255,255,255,0.18)',
        borderRadius: '10px',
        padding: '6px 10px',
        cursor: 'pointer'
    });
    c2.r.appendChild(styleSelect);
    calloutPanel.appendChild(c2.r);

    const c3 = row('Width');
    const widthRange = document.createElement('input');
    widthRange.type = 'range';
    widthRange.min = '1';
    widthRange.max = '12';
    widthRange.step = '1';
    widthRange.value = String(z.calloutStyle.width);
    c3.r.appendChild(widthRange);
    calloutPanel.appendChild(c3.r);

    const applyCallout = () => {
        z.calloutStyle = {
            color: colorInput.value || '#FFFFFF',
            style: styleSelect.value === 'dashed' ? 'dashed' : 'solid',
            width: Math.max(1, Math.min(12, parseInt(widthRange.value || '1', 10) || 1))
        };
        try { z.el.style.borderColor = z.calloutStyle.color; } catch (_) {}
        try { renderRegionOverlay(); } catch (_) {}
    };
    colorInput.addEventListener('input', applyCallout);
    styleSelect.addEventListener('change', applyCallout);
    widthRange.addEventListener('input', applyCallout);

    // Display panel (min/max + colormap)
    const d1 = row('Min');
    const minInput = document.createElement('input');
    minInput.type = 'number';
    minInput.step = 'any';
    Object.assign(minInput.style, { width: '110px', padding: '6px 8px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(0,0,0,0.25)', color: '#fff' });
    d1.r.appendChild(minInput);
    displayPanel.appendChild(d1.r);

    const d2 = row('Max');
    const maxInput = document.createElement('input');
    maxInput.type = 'number';
    maxInput.step = 'any';
    Object.assign(maxInput.style, { width: '110px', padding: '6px 8px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(0,0,0,0.25)', color: '#fff' });
    d2.r.appendChild(maxInput);
    displayPanel.appendChild(d2.r);

    const d3 = row('Colormap');
    const cmap = document.createElement('select');
    cmap.innerHTML = `
        <option value="grayscale">Grayscale</option>
        <option value="viridis">Viridis</option>
        <option value="inferno">Inferno</option>
        <option value="plasma">Plasma</option>
        <option value="cividis">Cividis</option>
        <option value="spectral">Spectral</option>
        <option value="rdbu">RdBu</option>
        <option value="hot">Hot</option>
        <option value="cool">Cool</option>
        <option value="rainbow">Rainbow</option>
        <option value="jet">Jet</option>
        <option value="red">Red</option>
        <option value="green">Green</option>
        <option value="blue">Blue</option>
        <option value="cyan">Cyan</option>
        <option value="magenta">Magenta</option>
        <option value="yellow">Yellow</option>
        <option value="orange">Orange</option>
    `;
    cmap.value = 'grayscale';
    Object.assign(cmap.style, {
        fontSize: '12px',
        color: '#fff',
        background: 'rgba(0,0,0,0.25)',
        border: '1px solid rgba(255,255,255,0.18)',
        borderRadius: '10px',
        padding: '6px 10px',
        cursor: 'pointer'
    });
    d3.r.appendChild(cmap);
    displayPanel.appendChild(d3.r);

    // Font size (title pill)
    const d4 = row('Font size');
    const fsWrap = document.createElement('div');
    Object.assign(fsWrap.style, { display: 'flex', alignItems: 'center', gap: '10px', width: '100%' });
    const fs = document.createElement('input');
    fs.type = 'range';
    fs.min = '10';
    fs.max = '20';
    fs.step = '1';
    fs.value = String(z.display.fontSize || 12);
    Object.assign(fs.style, { flex: '1' });
    const fsVal = document.createElement('div');
    fsVal.textContent = `${fs.value}px`;
    Object.assign(fsVal.style, { width: '44px', textAlign: 'right', color: 'rgba(255,255,255,0.85)', fontSize: '12px' });
    fsWrap.appendChild(fs);
    fsWrap.appendChild(fsVal);
    d4.r.appendChild(fsWrap);
    displayPanel.appendChild(d4.r);

    const applyFontSize = () => {
        const v = parseInt(fs.value || '12', 10);
        const px = (isFinite(v) ? Math.max(10, Math.min(20, v)) : 12);
        z.display.fontSize = px;
        fsVal.textContent = `${px}px`;
        try { titlePill.style.fontSize = `${px}px`; } catch (_) {}
    };
    fs.addEventListener('input', applyFontSize);
    fs.addEventListener('change', applyFontSize);
    // apply initial
    try { titlePill.style.fontSize = `${z.display.fontSize || 12}px`; } catch (_) {}

    const applyDisplay = () => {
        const mn = minInput.value === '' ? null : Number(minInput.value);
        const mx = maxInput.value === '' ? null : Number(maxInput.value);
        z.display.min = (mn != null && isFinite(mn)) ? mn : null;
        z.display.max = (mx != null && isFinite(mx)) ? mx : null;
        z.display.colorMap = cmap.value || 'grayscale';
        z.reload && z.reload();
    };
    minInput.addEventListener('change', applyDisplay);
    maxInput.addEventListener('change', applyDisplay);
    cmap.addEventListener('change', applyDisplay);

    // Bottom-left buttons: histogram + settings (settings on the right of histogram)
    const bottomLeft = document.createElement('div');
    Object.assign(bottomLeft.style, { position: 'absolute', left: '8px', bottom: '8px', display: 'flex', gap: '6px', zIndex: '2' });
    body.appendChild(bottomLeft);

    const histBtn = makeCircleBtn(
        `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M4 19V5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M4 19H20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M7 19V11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M11 19V7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M15 19V14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M19 19V9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>`,
        'Display (min/max, colormap)',
        () => {
            const open = (displayPanel.style.display === 'none' || displayPanel.style.display === '');
            __setPanelOpen(displayPanel, open);
            __setPanelOpen(calloutPanel, false);
        });
    bottomLeft.appendChild(histBtn);
    histBtn.dataset.zoomInsetControl = 'true';

    const settingsBtn = makeCircleBtn(
        `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M4 12h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M8 6h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M4 18h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <circle cx="8" cy="6" r="2" fill="currentColor"/>
  <circle cx="16" cy="12" r="2" fill="currentColor"/>
  <circle cx="16" cy="18" r="2" fill="currentColor"/>
</svg>`,
        'Callout style',
        () => {
            const open = (calloutPanel.style.display === 'none' || calloutPanel.style.display === '');
            __setPanelOpen(calloutPanel, open);
            __setPanelOpen(displayPanel, false);
        }
    );
    bottomLeft.appendChild(settingsBtn);
    settingsBtn.dataset.zoomInsetControl = 'true';

    // Click outside panels closes them
    el.addEventListener('mousedown', (e) => {
        try {
            if (!calloutPanel.contains(e.target) && e.target !== settingsBtn) __setPanelOpen(calloutPanel, false);
            if (!displayPanel.contains(e.target) && e.target !== histBtn) __setPanelOpen(displayPanel, false);
        } catch (_) {}
    });

    // Draggable: grab anywhere on the inset (except controls/panels/resize), so it doesn't feel "locked"
    (function makeDraggable() {
        let dragging = false;
        let sx = 0, sy = 0;
        let startLeft = 0, startTop = 0;
        const isBlockedTarget = (t) => {
            const tag = t && t.tagName ? String(t.tagName).toLowerCase() : '';
            if (!t) return false;
            if (tag === 'button' || tag === 'input' || tag === 'select' || tag === 'textarea') return true;
            if (t.isContentEditable) return true;
            if (calloutPanel.contains(t) || displayPanel.contains(t)) return true;
            // Resize handle (bottom-right)
            if (t === resizeHandle) return true;
            return false;
        };
        const onDown = (e) => {
            if (titleTextEl.contentEditable === 'true') return;
            if (isBlockedTarget(e.target)) return;
            e.preventDefault();
            dragging = true;
            const r = el.getBoundingClientRect();
            sx = e.clientX; sy = e.clientY;
            if (viewerElement === document.body) {
                startLeft = r.left; startTop = r.top;
            } else {
                const pr = viewerElement.getBoundingClientRect();
                startLeft = r.left - pr.left;
                startTop = r.top - pr.top;
            }
            el.style.right = 'auto';
            el.style.bottom = 'auto';
            el.style.left = `${startLeft}px`;
            el.style.top = `${startTop}px`;
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        };
        const onMove = (e) => {
            if (!dragging) return;
            const dx = e.clientX - sx;
            const dy = e.clientY - sy;
            el.style.left = `${startLeft + dx}px`;
            el.style.top = `${startTop + dy}px`;
            try { renderRegionOverlay(); } catch (_) {}
        };
        const onUp = () => {
            dragging = false;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        el.addEventListener('mousedown', onDown);
    })();

    // Resizable handle (bottom-right)
    const resizeHandle = document.createElement('div');
    Object.assign(resizeHandle.style, {
        position: 'absolute',
        right: '7px',
        bottom: '7px',
        width: '14px',
        height: '14px',
        borderRight: '2px solid rgba(255,255,255,0.50)',
        borderBottom: '2px solid rgba(255,255,255,0.50)',
        borderRadius: '2px',
        cursor: 'nwse-resize',
        opacity: '0.95',
        zIndex: '2'
    });
    body.appendChild(resizeHandle);
    (function makeResizable() {
        let resizing = false;
        let sx = 0, sy = 0;
        let startW = 260, startH = 260;
        const minSize = 180;
        const maxSize = 560;
        const onDown = (e) => {
            e.preventDefault();
            e.stopPropagation();
            resizing = true;
            sx = e.clientX; sy = e.clientY;
            const r = el.getBoundingClientRect();
            startW = r.width; startH = r.height;
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        };
        const onMove = (e) => {
            if (!resizing) return;
            const dx = e.clientX - sx;
            const dy = e.clientY - sy;
            const next = Math.max(minSize, Math.min(maxSize, Math.round(Math.max(startW + dx, startH + dy))));
            el.style.width = `${next}px`;
            el.style.height = `${next}px`;
            try { renderRegionOverlay(); } catch (_) {}
        };
        const onUp = () => {
            resizing = false;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        resizeHandle.addEventListener('mousedown', onDown);
    })();

    // Reload preview
    z.reload = async () => {
        try {
            try { if (z.abort) z.abort.abort(); } catch (_) {}
            z.abort = new AbortController();
            if (z.objectUrl) { try { URL.revokeObjectURL(z.objectUrl); } catch (_) {} z.objectUrl = null; }
            z.img.style.backgroundImage = '';
            z.spinner.style.display = 'block';

        // Ensure session
        if (!window.__sid) {
            try {
                const sessionRes = await fetch('/session/start');
                const sessionJson = await sessionRes.json();
                if (sessionJson && sessionJson.session_id) window.__sid = sessionJson.session_id;
            } catch (_) {}
        }
        const headers = {};
        if (window.__sid) headers['X-Session-ID'] = window.__sid;

        const v = Date.now();
        const params = new URLSearchParams();
        params.set('filepath', z.filepathRel || filepathRel);
        // IMPORTANT: <img> / direct URL loads cannot send headers.
        // Even though we fetch with X-Session-ID, also include sid in the query so:
        // - the backend session middleware can authenticate image-style requests
        // - opening the preview URL in a new tab still works
        try {
            const sid = window.__nelouraSid || window.__sid || (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('sid') : null);
            if (sid && String(sid).trim() !== '') params.set('sid', String(sid));
        } catch (_) {}
        // Higher-quality preview for zoom insets (dynamic, capped)
        let maxDim = 1024;
        try {
            const r = z.el.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            const base = Math.max(260, Math.max(r.width || 0, r.height || 0));
            // Request very high resolution so the inset can show true pixels when zoomed/scaled.
            // (The backend will still downsample only if needed.)
            maxDim = Math.round(base * dpr * 4);
            // IMPORTANT: some deployments enforce max_dim <= 2048 (FastAPI validation).
            // Clamp here so zoom insets don't 422 even if the server wasn't updated.
            maxDim = Math.max(1024, Math.min(2048, maxDim));
        } catch (_) {}
        params.set('max_dim', String(maxDim));
        // For "show me the pixels", force nearest downsampling and disable browser smoothing (see CSS below).
        params.set('downsample', 'nearest');
        params.set('v', String(v));
        if (z.display.min != null && z.display.max != null) {
            params.set('min_value', String(z.display.min));
            params.set('max_value', String(z.display.max));
        }
        if (z.display.colorMap) params.set('color_map', z.display.colorMap);

        const url = `/fits/preview/?${params.toString()}`;
        const resp = await fetch(url, { headers, cache: 'no-store', signal: z.abort.signal });
        if (!resp.ok) throw new Error(`Preview failed: ${resp.status}`);
        const blob = await resp.blob();
        const objUrl = URL.createObjectURL(blob);
        z.objectUrl = objUrl;
            // Use <img> for better control over image-rendering / smoothing.
            try {
                if (z.img && z.img.tagName && z.img.tagName.toLowerCase() === 'img') {
                    z.img.src = objUrl;
                } else {
                    z.img.style.backgroundImage = `url("${objUrl}")`;
                }
            } catch (_) {}
        } finally {
            z.spinner.style.display = 'none';
        }
    };

    // tint border (default: white)
    try { el.style.borderColor = z.calloutStyle.color; } catch (_) {}

    viewerElement.appendChild(el);
    __regionZoomInsets.push(z);
    return z;
}

async function showRegionZoomInsetFromCutout(filepathRel, label, regionId, sourceRegionData = null) {
    const z = createRegionZoomInsetOverlay({ filepathRel, titleText: label, regionId });
    try { z.sourceRegionData = sourceRegionData ? JSON.parse(JSON.stringify(sourceRegionData)) : null; } catch (_) { try { z.sourceRegionData = sourceRegionData || null; } catch (_) {} }
    await z.reload();
    try { renderRegionOverlay(); } catch (_) {}
}

function getImageHeight() {
    const height = window?.fitsData?.height;
    return (typeof height === 'number' && Number.isFinite(height)) ? height : null;
}

function convertYToBottomOrigin(y) {
    if (!Number.isFinite(y)) return y;
    const height = getImageHeight();
    if (height == null) return y;
    return (height - 1) - y;
}

function convertYForWorld(y) {
    if (!Number.isFinite(y)) return y;
    const height = getImageHeight();
    const flipY = !!(window?.fitsData?.flip_y);
    if (flipY && height != null) {
        return (height - 1) - y;
    }
    return y;
}

function resolveGalaxyNameForCutout(content) {
    const fallback = 'UnknownGalaxy';
    const candidates = [
        'galaxy_name',
        'galaxy',
        'PHANGS_GALAXY',
        'gal_name',
        'object_name',
        'obj_name',
        'NAME',
        'name',
        'target'
    ];

    if (content && typeof content === 'object') {
        for (const key of candidates) {
            const value = content[key];
            if (typeof value === 'string' && value.trim()) {
                return value.trim();
            }
        }
    }

    if (typeof window.galaxyNameFromSearch === 'string' && window.galaxyNameFromSearch.trim()) {
        return window.galaxyNameFromSearch.trim();
    }

    return fallback;
}

function buildHexagonVertices(center, radiusX, radiusY) {
    if (!center) return [];
    const rx = Math.max(radiusX || 0, 1);
    const ry = Math.max(radiusY || 0, 1);
    const verts = [];
    for (let i = 0; i < 6; i += 1) {
        const angle = (Math.PI / 3) * i + Math.PI / 6; // flat-top orientation
        verts.push({
            x: center.x + rx * Math.cos(angle),
            y: center.y + ry * Math.sin(angle)
        });
    }
    return verts;
}

function pointInPolygon(point, vertices) {
    if (!point || !Array.isArray(vertices) || vertices.length < 3) return false;
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i, i += 1) {
        const xi = vertices[i].x;
        const yi = vertices[i].y;
        const xj = vertices[j].x;
        const yj = vertices[j].y;
        const intersect = ((yi > point.y) !== (yj > point.y))
            && (point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + Number.EPSILON) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function getActiveOsdViewer() {
    return window.viewer || window.tiledViewer || null;
}

function ensureRegionOverlayCanvas() {
    const viewerElement = document.getElementById('openseadragon');
    if (!viewerElement) {
        return null;
    }

    if (regionOverlayCanvas && regionOverlayCanvas.parentElement) {
        return regionOverlayCanvas;
    }

    const container = document.createElement('div');
    container.className = 'region-overlay-container';
    Object.assign(container.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: '35'
    });

    const canvas = document.createElement('canvas');
    canvas.className = 'region-overlay-canvas';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';

    container.appendChild(canvas);
    viewerElement.appendChild(container);

    regionOverlayContainer = container;
    regionOverlayCanvas = canvas;
    regionOverlayPixelRatio = window.devicePixelRatio || 1;
    window.regionOverlayCanvas = canvas;

    resizeRegionCanvas();
    return regionOverlayCanvas;
}

function resizeRegionCanvas() {
    if (!regionOverlayCanvas) return;
    const viewerElement = document.getElementById('openseadragon');
    if (!viewerElement) return;
    regionOverlayPixelRatio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(viewerElement.clientWidth));
    const height = Math.max(1, Math.round(viewerElement.clientHeight));
    regionOverlayCanvas.width = Math.round(width * regionOverlayPixelRatio);
    regionOverlayCanvas.height = Math.round(height * regionOverlayPixelRatio);
    regionOverlayCanvas.style.width = '100%';
    regionOverlayCanvas.style.height = '100%';
    renderRegionOverlay();
}

function scheduleRegionCanvasResize() {
    if (regionResizeTimeoutId) {
        clearTimeout(regionResizeTimeoutId);
    }
    regionResizeTimeoutId = setTimeout(() => {
        regionResizeTimeoutId = null;
        resizeRegionCanvas();
    }, 120);
}

function attachRegionViewerHandlers(viewer) {
    if (!viewer || regionViewerHandlersBound) return;

    const pressHandler = (event) => {
        regionDrawingState.pointerMoved = false;
        regionDrawingState.pointerDownImage = convertPixelPointToImage(event.position);
        regionDrawingState.pointerDownPixel = event && event.position
            ? { x: event.position.x, y: event.position.y }
            : null;

        if (!regionDrawingState.activeTool) {
            regionDrawingState.isDrawing = false;
            regionDrawingState.startImagePoint = null;
            regionDrawingState.currentImagePoint = null;
            regionDrawingState.previewShape = null;
            return;
        }
        const imagePoint = convertPixelPointToImage(event.position);
        if (!imagePoint) return;

        regionDrawingState.isDrawing = true;
        regionDrawingState.startImagePoint = imagePoint;
        regionDrawingState.currentImagePoint = imagePoint;
        regionDrawingState.previewShape = null;

        if (event) {
            event.preventDefaultAction = true;
        }
    };

    const dragHandler = (event) => {
        if (regionDrawingState.isDrawing && regionDrawingState.activeTool) {
            const imagePoint = convertPixelPointToImage(event.position);
            if (!imagePoint) return;
            regionDrawingState.pointerMoved = true;
            regionDrawingState.currentImagePoint = imagePoint;
            regionDrawingState.previewShape = buildRegionShape(regionDrawingState.activeTool, regionDrawingState.startImagePoint, imagePoint, true);
            renderRegionOverlay();
            if (event) {
                event.preventDefaultAction = true;
            }
            return;
        }

        if (regionDrawingState.pointerDownPixel && event && event.position) {
            const dx = event.position.x - regionDrawingState.pointerDownPixel.x;
            const dy = event.position.y - regionDrawingState.pointerDownPixel.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance >= REGION_CLICK_TOLERANCE_PX) {
                regionDrawingState.pointerMoved = true;
            }
        }
    };

    const releaseHandler = (event) => {
        const imagePoint = convertPixelPointToImage(event.position);

        if (regionDrawingState.isDrawing && regionDrawingState.activeTool) {
            finalizeRegionShape(imagePoint);
            if (event) {
                event.preventDefaultAction = true;
            }
        } else if (!regionDrawingState.pointerMoved && imagePoint) {
            if (regionDrawingState.mouseMode === 'pan') {
                // In pan mode, ignore region hit-testing/popups.
                return;
            }
            const hitShape = hitTestRegions(imagePoint);
            if (hitShape) {
                showRegionPopup(hitShape);
                if (event) {
                    event.preventDefaultAction = true;
                }
            }
        }

        regionDrawingState.pointerDownImage = null;
        regionDrawingState.pointerDownPixel = null;
        regionDrawingState.pointerMoved = false;
    };

    const scheduleRedraw = () => {
        window.requestAnimationFrame(() => renderRegionOverlay());
    };

    // Fallback DOM click handler, for cases where OSD canvas-click doesn't fire (e.g. complex layouts)
    const domClickHandler = (ev) => {
        try {
            if (regionDrawingState.activeTool) return;
            if (regionDrawingState.mouseMode === 'pan') return;
            const viewerElement = document.getElementById('openseadragon');
            if (!viewerElement) return;
            const rect = viewerElement.getBoundingClientRect();
            const pixelPoint = {
                x: ev.clientX - rect.left,
                y: ev.clientY - rect.top
            };
            const imagePoint = convertPixelPointToImage(pixelPoint);
            if (!imagePoint) return;
            const hitShape = hitTestRegions(imagePoint);
            if (hitShape) {
                showRegionPopup(hitShape);
                ev.preventDefault();
                ev.stopPropagation();
            }
        } catch (err) {
            console.warn('[regions] DOM click handler failed', err);
        }
    };

    const clickHandler = (event) => {
        if (regionDrawingState.activeTool) return;
        if (regionDrawingState.mouseMode === 'pan') return;
        const imagePoint = convertPixelPointToImage(event.position);
        if (!imagePoint) return;
        const hitShape = hitTestRegions(imagePoint);
        if (hitShape) {
            showRegionPopup(hitShape);
            if (event) {
                event.preventDefaultAction = true;
            }
        }
    };

    viewer.addHandler('canvas-press', pressHandler);
    viewer.addHandler('canvas-drag', dragHandler);
    viewer.addHandler('canvas-release', releaseHandler);
    viewer.addHandler('canvas-click', clickHandler);
    viewer.addHandler('animation', scheduleRedraw);
    viewer.addHandler('zoom', scheduleRedraw);
    viewer.addHandler('pan', scheduleRedraw);
    viewer.addHandler('open', () => {
        resizeRegionCanvas();
        scheduleRedraw();
    });

    // Also listen to DOM click events (capturing) for robustness (multi-grid panes, etc.)
    try {
        const viewerElement = document.getElementById('openseadragon');
        if (viewerElement && !viewerElement.__regionDomClickBound) {
            document.addEventListener('click', domClickHandler, { capture: true });
            viewerElement.__regionDomClickBound = true;
        }
    } catch (_) {}

    regionViewerHandlersBound = true;
}

function ensureRegionInfrastructure() {
    const viewer = getActiveOsdViewer();
    if (viewer && viewer.viewport) {
        ensureRegionOverlayCanvas();
        attachRegionViewerHandlers(viewer);
        return viewer;
    }

    if (!regionViewerPollId) {
        regionViewerPollId = setInterval(() => {
            const v = getActiveOsdViewer();
            if (v && v.viewport) {
                clearInterval(regionViewerPollId);
                regionViewerPollId = null;
                ensureRegionInfrastructure();
            }
        }, 400);
    }
    return null;
}

function convertPixelPointToImage(pixelPoint) {
    const viewer = getActiveOsdViewer();
    if (!viewer || !viewer.viewport || !pixelPoint) return null;
    try {
        // OpenSeadragon expects an OpenSeadragon.Point (with plus/minus methods)
        // event.position is already a Point; DOM clicks pass a plain {x,y}
        let osPixelPoint = pixelPoint;
        try {
            // Heuristic: if minus is not a function, wrap it
            if (!osPixelPoint || typeof osPixelPoint.minus !== 'function') {
                osPixelPoint = new OpenSeadragon.Point(pixelPoint.x, pixelPoint.y);
            }
        } catch (_) {
            osPixelPoint = new OpenSeadragon.Point(pixelPoint.x, pixelPoint.y);
        }

        const viewportPoint = viewer.viewport.pointFromPixel(osPixelPoint);
        if (!viewportPoint) return null;
        const imagePoint = viewer.viewport.viewportToImageCoordinates(viewportPoint);
        if (!imagePoint) return null;
        return { x: imagePoint.x, y: imagePoint.y };
    } catch (err) {
        console.warn('[regions] Failed to convert point', err);
        return null;
    }
}

function buildRegionShape(type, start, end, isPreview = false) {
    if (!type || !start || !end) return null;
    const MIN_DELTA = 2;

    if (type === 'circle') {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const radius = Math.sqrt(dx * dx + dy * dy);
        if (radius < MIN_DELTA) return null;
        return {
            type,
            center: { x: start.x, y: start.y },
            radius,
            isPreview
        };
    }

    if (type === 'rectangle') {
        const width = Math.abs(end.x - start.x);
        const height = Math.abs(end.y - start.y);
        if (width < MIN_DELTA || height < MIN_DELTA) return null;
        return {
            type,
            x1: Math.min(start.x, end.x),
            y1: Math.min(start.y, end.y),
            x2: Math.max(start.x, end.x),
            y2: Math.max(start.y, end.y),
            isPreview
        };
    }

    if (type === 'ellipse') {
        const radiusX = Math.abs(end.x - start.x) / 2;
        const radiusY = Math.abs(end.y - start.y) / 2;
        if (radiusX < MIN_DELTA || radiusY < MIN_DELTA) return null;
        return {
            type,
            center: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
            radiusX,
            radiusY,
            isPreview
        };
    }

    if (type === 'hexagon') {
        const radiusX = Math.abs(end.x - start.x) / 2;
        const radiusY = Math.abs(end.y - start.y) / 2;
        if (radiusX < MIN_DELTA || radiusY < MIN_DELTA) return null;
        return {
            type,
            center: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
            radiusX,
            radiusY,
            isPreview
        };
    }

    return null;
}

function finalizeRegionShape(endPoint) {
    const shape = buildRegionShape(regionDrawingState.activeTool, regionDrawingState.startImagePoint, endPoint);
    regionDrawingState.isDrawing = false;
    regionDrawingState.previewShape = null;
    regionDrawingState.startImagePoint = null;
    regionDrawingState.currentImagePoint = null;

    if (!shape) {
        if (endPoint) {
            const hitShape = hitTestRegions(endPoint);
            if (hitShape) {
                showRegionPopup(hitShape);
            }
        }
        renderRegionOverlay();
        return;
    }

    const index = regionDrawingState.counter++;
    shape.id = `region-${Date.now()}-${index}`;
    shape.label = `Region ${index}`;
    shape.createdAt = Date.now();
    regionDrawingState.shapes.push(shape);
    regionDrawingState.selectedShapeId = shape.id;
    renderRegionOverlay();
    showRegionPopup(shape);
}

function hitTestRegions(imagePoint) {
    if (!imagePoint) return null;
    for (let i = regionDrawingState.shapes.length - 1; i >= 0; i -= 1) {
        const shape = regionDrawingState.shapes[i];
        if (isPointInsideShape(shape, imagePoint)) {
            return shape;
        }
    }
    return null;
}

function isPointInsideShape(shape, point) {
    if (!shape || !point) return false;

    if (shape.type === 'circle') {
        const dx = point.x - shape.center.x;
        const dy = point.y - shape.center.y;
        return Math.sqrt(dx * dx + dy * dy) <= shape.radius;
    }

    if (shape.type === 'rectangle') {
        const xMin = Math.min(shape.x1, shape.x2);
        const xMax = Math.max(shape.x1, shape.x2);
        const yMin = Math.min(shape.y1, shape.y2);
        const yMax = Math.max(shape.y1, shape.y2);
        return point.x >= xMin && point.x <= xMax && point.y >= yMin && point.y <= yMax;
    }

    if (shape.type === 'ellipse') {
        const dx = point.x - shape.center.x;
        const dy = point.y - shape.center.y;
        const rx = Math.max(shape.radiusX, 1);
        const ry = Math.max(shape.radiusY, 1);
        const value = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
        return value <= 1;
    }

    if (shape.type === 'hexagon') {
        const vertices = buildHexagonVertices(shape.center, shape.radiusX, shape.radiusY);
        return pointInPolygon(point, vertices);
    }

    return false;
}

function renderRegionOverlay() {
    const canvas = ensureRegionOverlayCanvas();
    const viewer = getActiveOsdViewer();
    if (!canvas || !viewer || !viewer.viewport) return;

    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(regionOverlayPixelRatio, 0, 0, regionOverlayPixelRatio, 0, 0);

    regionDrawingState.shapes.forEach((shape) => {
        drawRegionShape(ctx, shape, { highlight: shape.id === regionDrawingState.selectedShapeId });
    });

    if (regionDrawingState.previewShape) {
        drawRegionShape(ctx, regionDrawingState.previewShape, { preview: true });
    }

    // Draw callout connector lines from regions -> zoom insets (if visible)
    try {
        if (Array.isArray(__regionZoomInsets) && __regionZoomInsets.length) {
            const viewerEl = document.getElementById('openseadragon');
            if (viewerEl) {
                const viewerRect = viewerEl.getBoundingClientRect();
                __regionZoomInsets.forEach((zinset) => {
                    try {
                        if (!zinset || !zinset.el || zinset.el.style.display === 'none') return;
                        if (!zinset.regionId) return;
                        const shape = regionDrawingState.shapes.find(s => s && String(s.id) === String(zinset.regionId)) || null;
                        if (!shape) return;
                        const insetRect = zinset.el.getBoundingClientRect();

                    const centerImage = (() => {
                        if (shape.type === 'circle' && shape.center) return shape.center;
                        if (shape.type === 'ellipse' && shape.center) return shape.center;
                        if (shape.type === 'hexagon' && shape.center) return shape.center;
                        if (shape.type === 'rectangle') {
                            const cx = (Number(shape.x1) + Number(shape.x2)) / 2;
                            const cy = (Number(shape.y1) + Number(shape.y2)) / 2;
                            return { x: cx, y: cy };
                        }
                        return null;
                    })();

                    const centerScreen = centerImage ? imagePointToScreen(centerImage) : null;
                    if (centerScreen) {
                        const callout = zinset.calloutStyle || { color: '#60A5FA', width: 6, style: 'solid' };
                        const stroke = callout.color || '#60A5FA';
                        const lw = Math.max(1, Math.min(16, Number(callout.width) || 1));
                        const dashed = (callout.style === 'dashed');

                        // Choose the side of inset closest to region center
                        const insetLeft = insetRect.left - viewerRect.left;
                        const insetRight = insetRect.right - viewerRect.left;
                        const insetTop = insetRect.top - viewerRect.top;
                        const insetBottom = insetRect.bottom - viewerRect.top;
                        const insetMidY = (insetTop + insetBottom) / 2;

                        const useLeft = Math.abs(centerScreen.x - insetLeft) < Math.abs(centerScreen.x - insetRight);
                        const xEdge = useLeft ? insetLeft : insetRight;

                        // For rectangle callout like your example, use inset corner points on the facing side.
                        // For circle callout, use two points on inset edge (top/bottom) like a "bridge".
                        const insetA = useLeft ? { x: insetLeft, y: insetTop } : { x: insetRight, y: insetTop };
                        const insetB = useLeft ? { x: insetLeft, y: insetBottom } : { x: insetRight, y: insetBottom };
                        const p1 = (shape.type === 'rectangle') ? insetA : { x: xEdge, y: insetTop + (insetBottom - insetTop) * 0.30 };
                        const p2 = (shape.type === 'rectangle') ? insetB : { x: xEdge, y: insetTop + (insetBottom - insetTop) * 0.70 };

                        // Pick two anchor points ON THE REGION BOUNDARY (not center)
                        const anchors = (() => {
                            // Circle
                            if (shape.type === 'circle' && shape.center) {
                                const edgeScreen = imagePointToScreen({ x: shape.center.x + shape.radius, y: shape.center.y });
                                if (!edgeScreen) return null;
                                const r = Math.hypot(edgeScreen.x - centerScreen.x, edgeScreen.y - centerScreen.y);
                                // Start callout from TOP and BOTTOM of the circle (matches reference style)
                                return [
                                    { x: centerScreen.x, y: centerScreen.y - r },
                                    { x: centerScreen.x, y: centerScreen.y + r }
                                ];
                            }
                            // Ellipse
                            if (shape.type === 'ellipse' && shape.center) {
                                const xAxisPoint = imagePointToScreen({ x: shape.center.x + shape.radiusX, y: shape.center.y });
                                const yAxisPoint = imagePointToScreen({ x: shape.center.x, y: shape.center.y + shape.radiusY });
                                if (!xAxisPoint || !yAxisPoint) return null;
                                const rx = Math.hypot(xAxisPoint.x - centerScreen.x, xAxisPoint.y - centerScreen.y);
                                const ry = Math.hypot(yAxisPoint.x - centerScreen.x, yAxisPoint.y - centerScreen.y);
                                // Start callout from TOP and BOTTOM of the ellipse
                                return [
                                    { x: centerScreen.x, y: centerScreen.y - ry },
                                    { x: centerScreen.x, y: centerScreen.y + ry }
                                ];
                            }
                            // Rectangle: use side nearest inset
                            if (shape.type === 'rectangle') {
                                const topLeft = imagePointToScreen({ x: shape.x1, y: shape.y1 });
                                const bottomRight = imagePointToScreen({ x: shape.x2, y: shape.y2 });
                                if (!topLeft || !bottomRight) return null;
                                const x0 = Math.min(topLeft.x, bottomRight.x);
                                const x1 = Math.max(topLeft.x, bottomRight.x);
                                const y0 = Math.min(topLeft.y, bottomRight.y);
                                const y1 = Math.max(topLeft.y, bottomRight.y);
                                const xSide = useLeft ? x0 : x1;
                                // Use corners on that side (matches the trapezoid look)
                                return [
                                    { x: xSide, y: y0 },
                                    { x: xSide, y: y1 }
                                ];
                            }
                            // Hexagon: choose extreme x vertices on the side toward inset
                            if (shape.type === 'hexagon' && shape.center) {
                                const verts = buildHexagonVertices(shape.center, shape.radiusX, shape.radiusY)
                                    .map(imagePointToScreen)
                                    .filter(Boolean);
                                if (verts.length < 3) return null;
                                const extremeX = useLeft
                                    ? Math.min(...verts.map(v => v.x))
                                    : Math.max(...verts.map(v => v.x));
                                const near = verts.filter(v => Math.abs(v.x - extremeX) < 2.5);
                                const pool = near.length ? near : verts;
                                const topV = pool.reduce((a, b) => (a.y < b.y ? a : b));
                                const botV = pool.reduce((a, b) => (a.y > b.y ? a : b));
                                return [topV, botV];
                            }
                            return null;
                        })();
                        const a1 = anchors && anchors[0] ? anchors[0] : centerScreen;
                        const a2 = anchors && anchors[1] ? anchors[1] : centerScreen;

                        ctx.save();
                        ctx.globalAlpha = 0.92;
                        ctx.lineWidth = lw;
                        ctx.strokeStyle = stroke;
                        ctx.lineCap = 'round';
                        ctx.lineJoin = 'round';
                        ctx.setLineDash(dashed ? [10, 8] : []);

                        ctx.beginPath();
                        ctx.moveTo(a1.x, a1.y);
                        ctx.lineTo(p1.x, p1.y);
                        ctx.stroke();

                        ctx.beginPath();
                        ctx.moveTo(a2.x, a2.y);
                        ctx.lineTo(p2.x, p2.y);
                        ctx.stroke();

                        // Anchor dots on region boundary + inset edge
                        ctx.setLineDash([]);
                        ctx.fillStyle = stroke;
                        ctx.beginPath();
                        ctx.arc(a1.x, a1.y, 2.4, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.beginPath();
                        ctx.arc(a2.x, a2.y, 2.4, 0, Math.PI * 2);
                        ctx.fill();

                        // Dot near inset edge mid
                        ctx.beginPath();
                        ctx.arc(xEdge, insetMidY, 2.2, 0, Math.PI * 2);
                        ctx.fill();

                        ctx.restore();
                    }
                    } catch (_) {}
                });
            }
        }
    } catch (_) {}
}

function imagePointToScreen(point) {
    const viewer = getActiveOsdViewer();
    if (!viewer || !viewer.viewport || typeof OpenSeadragon === 'undefined' || !point) return null;
    try {
        const osPoint = new OpenSeadragon.Point(point.x, point.y);
        // Use base TiledImage (index 0) for accurate coordinate conversion (fixes multi-image warning)
        const tiledImage = viewer.world && viewer.world.getItemAt && viewer.world.getItemAt(0);
        const hasTiledImageMethod = tiledImage && typeof tiledImage.imageToViewportCoordinates === 'function';
        // If multiple images exist (base + segments), we MUST use TiledImage to avoid warnings
        const hasMultipleImages = viewer.world && typeof viewer.world.getItemsCount === 'function' && viewer.world.getItemsCount() > 1;
        const mustUseTiledImage = hasMultipleImages && hasTiledImageMethod;
        
        let viewportPoint;
        if (mustUseTiledImage || hasTiledImageMethod) {
            viewportPoint = tiledImage.imageToViewportCoordinates(osPoint);
        } else {
            // Fallback only if TiledImage method truly unavailable and single image
            viewportPoint = viewer.viewport.imageToViewportCoordinates(osPoint);
        }
        return viewer.viewport.viewportToViewerElementCoordinates(viewportPoint);
    } catch (err) {
        console.warn('[regions] Failed to convert image point to screen', err);
        return null;
    }
}

function drawRegionShape(ctx, shape, options = {}) {
    if (!shape) return;
    const isPreview = options.preview;
    const highlight = options.highlight;

    ctx.save();
    ctx.globalAlpha = isPreview ? 0.5 : 0.85;
    ctx.lineWidth = highlight ? 3 : (isPreview ? 1.5 : 2);
    ctx.strokeStyle = highlight ? '#FBBF24' : '#38BDF8';
    ctx.fillStyle = highlight ? 'rgba(251,191,36,0.15)' : 'rgba(56,189,248,0.12)';

    if (shape.type === 'circle') {
        const centerScreen = imagePointToScreen(shape.center);
        const edgeScreen = imagePointToScreen({ x: shape.center.x + shape.radius, y: shape.center.y });
        if (!centerScreen || !edgeScreen) {
            ctx.restore();
            return;
        }
        const radius = Math.sqrt(Math.pow(edgeScreen.x - centerScreen.x, 2) + Math.pow(edgeScreen.y - centerScreen.y, 2));
        ctx.beginPath();
        ctx.arc(centerScreen.x, centerScreen.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        return;
    }

    if (shape.type === 'rectangle') {
        const topLeft = imagePointToScreen({ x: shape.x1, y: shape.y1 });
        const bottomRight = imagePointToScreen({ x: shape.x2, y: shape.y2 });
        if (!topLeft || !bottomRight) {
            ctx.restore();
            return;
        }
        const x = Math.min(topLeft.x, bottomRight.x);
        const y = Math.min(topLeft.y, bottomRight.y);
        const width = Math.abs(bottomRight.x - topLeft.x);
        const height = Math.abs(bottomRight.y - topLeft.y);
        ctx.beginPath();
        ctx.rect(x, y, width, height);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        return;
    }

    if (shape.type === 'ellipse') {
        const centerScreen = imagePointToScreen(shape.center);
        const xAxisPoint = imagePointToScreen({ x: shape.center.x + shape.radiusX, y: shape.center.y });
        const yAxisPoint = imagePointToScreen({ x: shape.center.x, y: shape.center.y + shape.radiusY });
        if (!centerScreen || !xAxisPoint || !yAxisPoint) {
            ctx.restore();
            return;
        }
        const radiusX = Math.sqrt(Math.pow(xAxisPoint.x - centerScreen.x, 2) + Math.pow(xAxisPoint.y - centerScreen.y, 2));
        const radiusY = Math.sqrt(Math.pow(yAxisPoint.x - centerScreen.x, 2) + Math.pow(yAxisPoint.y - centerScreen.y, 2));
        ctx.beginPath();
        ctx.ellipse(centerScreen.x, centerScreen.y, radiusX, radiusY, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        return;
    }

    if (shape.type === 'hexagon') {
        const vertices = buildHexagonVertices(shape.center, shape.radiusX, shape.radiusY)
            .map(imagePointToScreen)
            .filter(Boolean);
        if (vertices.length < 3) {
            ctx.restore();
            return;
        }
        ctx.beginPath();
        ctx.moveTo(vertices[0].x, vertices[0].y);
        for (let i = 1; i < vertices.length; i += 1) {
            ctx.lineTo(vertices[i].x, vertices[i].y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        return;
    }

    ctx.restore();
}

function getShapeCenter(shape) {
    if (!shape) return null;
    if (shape.type === 'circle') return { x: shape.center.x, y: shape.center.y };
    if (shape.type === 'ellipse') return { x: shape.center.x, y: shape.center.y };
    if (shape.type === 'hexagon') return { x: shape.center.x, y: shape.center.y };
    if (shape.type === 'rectangle') {
        return {
            x: (shape.x1 + shape.x2) / 2,
            y: (shape.y1 + shape.y2) / 2
        };
    }
    return null;
}

function getWorldCoordinatesFromImage(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const parsed = window.parsedWCS;
    const yForWorld = convertYForWorld(y);
    if (parsed && parsed.hasWCS && typeof parsed.pixelsToWorld === 'function') {
        try {
            const world = parsed.pixelsToWorld(x, yForWorld);
            if (world && Number.isFinite(world.ra) && Number.isFinite(world.dec)) {
                return world;
            }
        } catch (err) {
            console.warn('[regions] pixelsToWorld (parsed) failed', err);
        }
    }
    const header = window.fitsData && window.fitsData.wcs;
    if (header) {
        // Prefer header-based direct converter which supports SIN as well as TAN (implemented in main.js)
        try {
            if (typeof pixelsToWorldFromHeader === 'function') {
                const world = pixelsToWorldFromHeader(header, x, yForWorld);
                if (world && Number.isFinite(world.ra) && Number.isFinite(world.dec)) {
                    return world;
                }
            }
        } catch (err) {
            console.warn('[regions] pixelsToWorldFromHeader failed', err);
        }
        // Legacy fallback (TAN-only parseWCS)
        if (typeof window.parseWCS === 'function') {
            try {
                if (regionWorldCache.header !== header) {
                    const parsedHeader = window.parseWCS(header);
                    regionWorldCache.header = header;
                    regionWorldCache.wcs = parsedHeader && parsedHeader.hasWCS ? parsedHeader : null;
                }
                const fallback = regionWorldCache.wcs;
                if (fallback && fallback.hasWCS && typeof fallback.pixelsToWorld === 'function') {
                    const world = fallback.pixelsToWorld(x, yForWorld);
                    if (world && Number.isFinite(world.ra) && Number.isFinite(world.dec)) {
                        return world;
                    }
                }
            } catch (err) {
                console.warn('[regions] pixelsToWorld fallback failed', err);
            }
        }
    }
    return null;
}

function showSimpleRegionPopup(content, anchor) {
    try {
        let box = document.getElementById('simple-region-popup');
        const viewerElement = document.getElementById('openseadragon');
        if (!box) {
            box = document.createElement('div');
            box.id = 'simple-region-popup';
            Object.assign(box.style, {
                position: viewerElement ? 'absolute' : 'fixed',
                maxWidth: '380px',
                background: 'rgba(42,42,42,0.95)',
                color: '#fff',
                padding: '0',
                borderRadius: '8px',
                boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
                fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
                fontSize: '14px',
                zIndex: '6500'
            });
            // Make the simple popup draggable by its header area
            (function makeDraggable(el) {
                let isDragging = false;
                let startX = 0, startY = 0;
                let startLeft = 0, startTop = 0;
                const onMouseDown = (e) => {
                    e.preventDefault();
                    isDragging = true;
                    startX = e.clientX;
                    startY = e.clientY;
                    const rect = el.getBoundingClientRect();
                    startLeft = rect.left;
                    startTop = rect.top;
                    document.addEventListener('mousemove', onMouseMove);
                    document.addEventListener('mouseup', onMouseUp);
                };
                const onMouseMove = (e) => {
                    if (!isDragging) return;
                    const dx = e.clientX - startX;
                    const dy = e.clientY - startY;
                    el.style.left = `${startLeft + dx}px`;
                    el.style.top = `${startTop + dy}px`;
                    el.style.right = 'auto';
                };
                const onMouseUp = () => {
                    isDragging = false;
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                };
                // Attach later to the header element once it's created
                el.__attachDragHandle = (handle) => {
                    if (!handle) return;
                    handle.style.cursor = 'move';
                    handle.addEventListener('mousedown', onMouseDown);
                };
            })(box);
            if (viewerElement) {
                viewerElement.appendChild(box);
            } else {
                document.body.appendChild(box);
            }
        }
        const ra = typeof content.ra === 'number' ? content.ra.toFixed(6) : (content.ra ?? 'N/A');
        const dec = typeof content.dec === 'number' ? content.dec.toFixed(6) : (content.dec ?? 'N/A');
        // Display coordinates using bottom-left origin (to match coords overlay).
        const resolvedXBottomLeft =
            (typeof content.x_bottom_left === 'number' && Number.isFinite(content.x_bottom_left))
                ? content.x_bottom_left
                : ((typeof content.imageX === 'number' && Number.isFinite(content.imageX))
                    ? content.imageX
                    : ((typeof content.x === 'number' && Number.isFinite(content.x)) ? content.x : content.x_bottom_left));

        let resolvedYBottomLeft =
            (typeof content.y_bottom_left === 'number' && Number.isFinite(content.y_bottom_left))
                ? content.y_bottom_left
                : ((typeof content.imageY === 'number' && Number.isFinite(content.imageY))
                    ? convertYToBottomOrigin(content.imageY)
                    : ((typeof content.y === 'number' && Number.isFinite(content.y))
                        ? convertYToBottomOrigin(content.y)
                        : content.y_bottom_left));

        // If we have imageY, ensure the displayed Y matches its bottom-left conversion.
        if (typeof content.imageY === 'number' && Number.isFinite(content.imageY)) {
            const yFromImage = convertYToBottomOrigin(content.imageY);
            if (typeof yFromImage === 'number' && Number.isFinite(yFromImage) &&
                typeof resolvedYBottomLeft === 'number' && Number.isFinite(resolvedYBottomLeft) &&
                Math.abs(yFromImage - resolvedYBottomLeft) > 1e-3) {
                resolvedYBottomLeft = yFromImage;
            }
        }

        const x = (typeof resolvedXBottomLeft === 'number' && Number.isFinite(resolvedXBottomLeft)) ? resolvedXBottomLeft.toFixed(2) : (resolvedXBottomLeft ?? 'N/A');
        const y = (typeof resolvedYBottomLeft === 'number' && Number.isFinite(resolvedYBottomLeft)) ? resolvedYBottomLeft.toFixed(2) : (resolvedYBottomLeft ?? 'N/A');
        const isRegion = content.source_type === 'region';
        // Track which region this popup is showing (so deletes can close it)
        try {
            box.dataset.regionId = (isRegion && content.region_id) ? String(content.region_id) : '';
        } catch (_) {}

        box.innerHTML = `
            <div id="simple-region-header" style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,0.2);">
              <div style="font-weight:bold;font-size:14px;">Source Information</div>
              <button type="button" id="simple-region-close-btn" style="background:none;border:none;color:rgba(255,255,255,0.7);cursor:pointer;font-size:20px;line-height:1;padding:0 2px;width:24px;height:24px;display:flex;align-items:center;justify-content:center;" aria-label="Close">
                &times;
              </button>
            </div>
            <div id="simple-region-content" style="padding:12px;"></div>
        `;

        const headerEl = box.querySelector('#simple-region-header');
        if (box.__attachDragHandle && headerEl) {
            try { box.__attachDragHandle(headerEl); } catch (_) {}
        }

        const contentElement = box.querySelector('#simple-region-content');
        if (contentElement) {
            let html = '';
            html += `
                <div style="margin-bottom:8px;">
                    <span style="color:#aaa;">Position (image x, y):</span> ${x}, ${y}
                </div>
            `;
            // Always show RA/Dec row. Some maps (e.g. RA---SIN/DEC--SIN) may need header/backend fallback.
            html += `
                <div style="margin-bottom:8px;">
                    <span style="color:#aaa;">Coordinates (RA, Dec):</span>
                    <span id="simple-region-radec-value">${(ra !== 'N/A' && dec !== 'N/A') ? `${ra}°, ${dec}°` : 'Calculating…'}</span>
                </div>
            `;
            if (typeof content.radius_pixels === 'number') {
                const radius = content.radius_pixels.toFixed(2);
                html += `
                    <div style="margin-bottom:8px;">
                        <span style="color:#aaa;">Region Radius:</span> ${radius} pixels
                    </div>
                `;
            }

            // Galaxy name resolution (similar to canvasPopup)
            let galaxyName = 'UnknownGalaxy';
            if (typeof content.galaxy_name === 'string' && content.galaxy_name.trim() !== '') {
                galaxyName = content.galaxy_name.trim();
            } else if (typeof content.NAME === 'string' && content.NAME.trim() !== '') {
                galaxyName = content.NAME.trim();
            } else if (typeof content.name === 'string' && content.name.trim() !== '') {
                galaxyName = content.name.trim();
            } else if (typeof content.galaxy === 'string' && content.galaxy.trim() !== '') {
                galaxyName = content.galaxy.trim();
            } else if (typeof content.PHANGS_GALAXY === 'string' && content.PHANGS_GALAXY.trim() !== '') {
                galaxyName = content.PHANGS_GALAXY.trim();
            } else if (typeof window.galaxyNameFromSearch === 'string' && window.galaxyNameFromSearch.trim() !== '') {
                galaxyName = window.galaxyNameFromSearch.trim();
            }

            // Action buttons (identical set: SED, Properties, RGB, Cutout/Delete for regions)
            html += `
                <div style="margin-top:12px;display:flex;flex-wrap:wrap;justify-content:center;gap:6px;">
                    <button id="simple-show-sed-btn" style="padding:6px 12px;background-color:#4CAF50;color:white;border:none;border-radius:4px;cursor:pointer;">Show SED</button>
                    <button id="simple-show-properties-btn" style="padding:6px 12px;background-color:#2196F3;color:white;border:none;border-radius:4px;cursor:pointer;">Show Properties</button>
                    <button id="simple-show-rgb-btn" style="padding:6px 12px;background-color:#FF9800;color:white;border:none;border-radius:4px;cursor:pointer;">Show RGB</button>
                    ${isRegion ? '<button id="simple-cutout-region-btn" style="padding:6px 12px;background-color:#9C27B0;color:white;border:none;border-radius:4px;cursor:pointer;">Cutout</button>' : ''}
                    ${isRegion ? '<button id="simple-zoom-inset-btn" style="padding:6px 12px;background-color:#111827;color:white;border:1px solid rgba(255,255,255,0.15);border-radius:4px;cursor:pointer;">Zoom inset</button>' : ''}
                    ${isRegion ? '<button id="simple-delete-region-btn" style="padding:6px 12px;background-color:#DC2626;color:white;border:none;border-radius:4px;cursor:pointer;">Delete Region</button>' : ''}
                </div>
            `;

            contentElement.innerHTML = html;

            // Wire up buttons (using same logic as canvasPopup.show but without "this")
            setTimeout(() => {
                const closeBtn = box.querySelector('#simple-region-close-btn');
                if (closeBtn) {
                    closeBtn.onclick = (e) => {
                        e.stopPropagation();
                        try { box.style.display = 'none'; } catch (_) {}
                    };
                }

                const sedButton = box.querySelector('#simple-show-sed-btn');
                const propertiesButton = box.querySelector('#simple-show-properties-btn');
                const rgbButton = box.querySelector('#simple-show-rgb-btn');
                const cutoutRegionButton = box.querySelector('#simple-cutout-region-btn');
                const zoomInsetButton = box.querySelector('#simple-zoom-inset-btn');
                const deleteRegionButton = box.querySelector('#simple-delete-region-btn');

                // Ensure RA/Dec exist for actions (cutout/inset/RGB). Some maps (e.g. RA---SIN/DEC--SIN)
                // won't resolve RA/Dec reliably in JS; use backend Astropy WCS instead.
                async function ensureRegionWorldCoords() {
                    try {
                        if (Number.isFinite(content.ra) && Number.isFinite(content.dec)) return true;

                        const x = (typeof content.x_bottom_left === 'number' && Number.isFinite(content.x_bottom_left))
                            ? Math.round(content.x_bottom_left)
                            : ((typeof content.x === 'number' && Number.isFinite(content.x)) ? Math.round(content.x) : null);

                        const yBottom = (typeof content.y_bottom_left === 'number' && Number.isFinite(content.y_bottom_left))
                            ? Math.round(content.y_bottom_left)
                            : null;

                        if (!Number.isFinite(x) || !Number.isFinite(yBottom)) return false;

                        const fitsPath = window.currentFitsFile || (window.fitsData && window.fitsData.filename) || null;
                        const hduIndex = (typeof window.currentHduIndex === 'number') ? window.currentHduIndex : 0;

                        // Ensure session header exists (same pattern used by cutout/inset calls)
                        if (!window.__sid) {
                            const sessionRes = await fetch('/session/start');
                            const sessionJson = await sessionRes.json();
                            if (sessionJson && sessionJson.session_id) window.__sid = sessionJson.session_id;
                        }

                        const headers = {};
                        if (window.__sid) headers['X-Session-ID'] = window.__sid;

                        const url =
                            `/pixel-to-world/?x=${encodeURIComponent(x)}&y=${encodeURIComponent(yBottom)}` +
                            `&origin=bottom` +
                            (fitsPath ? `&filepath=${encodeURIComponent(fitsPath)}` : '') +
                            `&hdu=${encodeURIComponent(hduIndex)}` +
                            `&_t=${Date.now()}`;

                        const resp = await fetch(url, { headers, cache: 'no-store' });
                        if (!resp.ok) return false;
                        const data = await resp.json().catch(() => null);
                        if (data && Number.isFinite(data.ra) && Number.isFinite(data.dec)) {
                            content.ra = data.ra;
                            content.dec = data.dec;
                            return true;
                        }
                        return false;
                    } catch (_) {
                        return false;
                    }
                }

                // If RA/Dec are missing, resolve them and update the displayed row.
                try {
                    const raDecEl = box.querySelector('#simple-region-radec-value');
                    if (raDecEl && (!Number.isFinite(content.ra) || !Number.isFinite(content.dec))) {
                        ensureRegionWorldCoords().then((ok) => {
                            if (!ok) return;
                            try {
                                const el2 = box.querySelector('#simple-region-radec-value');
                                if (el2 && Number.isFinite(content.ra) && Number.isFinite(content.dec)) {
                                    el2.textContent = `${Number(content.ra).toFixed(6)}°, ${Number(content.dec).toFixed(6)}°`;
                                }
                            } catch (_) {}
                        });
                    }
                } catch (_) {}

                if (sedButton) {
                    sedButton.onclick = (e) => {
                        e.stopPropagation();
                        // Use the clicked region/source's catalog (NOT the globally selected/last-loaded catalog).
                        const catalogName = (() => {
                            try {
                                const raw =
                                    content?.__catalogName ||
                                    content?.catalog_name ||
                                    content?.catalogName ||
                                    content?.catalog ||
                                    window.currentCatalogName ||
                                    window.activeCatalog ||
                                    '';
                                const s = String(raw || '').trim();
                                const noPrefix = s.replace(/^catalogs\//, '');
                                const base = noPrefix.split('/').pop().split('\\').pop();
                                return base || s || 'catalog';
                            } catch (_) {
                                return window.currentCatalogName || window.activeCatalog || 'catalog';
                            }
                        })();
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
                            getGalaxyFrom(content) ||
                            (typeof window.galaxyNameFromSearch === 'string' && window.galaxyNameFromSearch.trim()) ||
                            galaxyName;

                        const hostWin = (() => { try { return (window.top && window.top !== window) ? window.top : window; } catch (_) { return window; } })();
                        if (hostWin && typeof hostWin.showSed === 'function') {
                            hostWin.showSed(content.ra, content.dec, catalogName, galaxyNameForSed || 'UnknownGalaxy');
                        } else if (typeof window.showSed === 'function') {
                            window.showSed(content.ra, content.dec, catalogName, galaxyNameForSed || 'UnknownGalaxy');
                        }
                    };
                }

                if (propertiesButton) {
                    propertiesButton.onclick = (e) => {
                        e.stopPropagation();
                        // Use the clicked region/source's catalog (NOT the globally selected/last-loaded catalog).
                        const catalogName = (() => {
                            try {
                                const raw =
                                    content?.__catalogName ||
                                    content?.catalog_name ||
                                    content?.catalogName ||
                                    content?.catalog ||
                                    window.currentCatalogName ||
                                    window.activeCatalog ||
                                    '';
                                const s = String(raw || '').trim();
                                const noPrefix = s.replace(/^catalogs\//, '');
                                const base = noPrefix.split('/').pop().split('\\').pop();
                                return base || s || 'catalog';
                            } catch (_) {
                                return window.currentCatalogName || window.activeCatalog || 'catalog';
                            }
                        })();
                        if (typeof window.showProperties === 'function') {
                            window.showProperties(content.ra, content.dec, catalogName, content.radius_pixels, content);
                        }
                    };
                }

                if (rgbButton) {
                    rgbButton.onclick = async (e) => {
                        e.stopPropagation();
                        let catalogName =
                            (content && (content.__catalogName || content.catalog_name || content.catalogName || content.catalog)) ||
                            window.currentCatalogName ||
                            window.activeCatalog ||
                            'UnknownCatalog';
                        try {
                            const s = String(catalogName || '').trim().replace(/^catalogs\//, '');
                            catalogName = s.split('/').pop().split('\\').pop() || s || catalogName;
                        } catch (_) {}
                        if (!catalogName || catalogName === 'undefined') {
                            if (content.catalogName) catalogName = content.catalogName;
                            else if (content.catalog) catalogName = content.catalog;
                            else if (content.source) catalogName = content.source;
                        }
                        let galaxyNameForRgb = 'UnknownGalaxy';
                        try {
                            const lowerToOrig = {};
                            for (const k in content) lowerToOrig[k.toLowerCase()] = k;
                            const candidates = ['gal_name','PHANGS_GALAXY','phangs_galaxy','galaxy','galaxy_name','name','object_name','obj_name','target'];
                            for (const key of candidates) {
                                const orig = lowerToOrig[key];
                                if (orig && typeof content[orig] === 'string') {
                                    const v = content[orig].trim();
                                    if (v) { galaxyNameForRgb = v; break; }
                                }
                            }
                        } catch (_) {}
                        if (galaxyNameForRgb === 'UnknownGalaxy' && typeof window.galaxyNameFromSearch === 'string' && window.galaxyNameFromSearch.trim() !== '') {
                            galaxyNameForRgb = window.galaxyNameFromSearch.trim();
                        }
                        if (!(Number.isFinite(content.ra) && Number.isFinite(content.dec))) {
                            const ok = await ensureRegionWorldCoords();
                            if (!ok) {
                                if (typeof window.showNotification === 'function') {
                                    window.showNotification('Cannot open RGB: Missing coordinates', 3500, 'error');
                                }
                                return;
                            }
                        }
                        const hostWin = (() => { try { return (window.top && window.top !== window) ? window.top : window; } catch (_) { return window; } })();
                        if (hostWin && typeof hostWin.fetchRgbCutouts === 'function') {
                            hostWin.fetchRgbCutouts(content.ra, content.dec, catalogName, galaxyNameForRgb);
                        } else if (typeof fetchRgbCutouts === 'function') {
                            fetchRgbCutouts(content.ra, content.dec, catalogName, galaxyNameForRgb);
                        }
                    };
                }

                if (cutoutRegionButton) {
                    cutoutRegionButton.onclick = async (e) => {
                        e.stopPropagation();
                        if (!(Number.isFinite(content.ra) && Number.isFinite(content.dec))) {
                            const ok = await ensureRegionWorldCoords();
                            if (!ok) {
                                console.error('[simpleRegionPopup] Missing RA or Dec coordinates for cutout');
                                if (typeof window.showNotification === 'function') {
                                    window.showNotification('Cannot create cutout: Missing coordinates', 3500, 'error');
                                } else {
                                    alert('Cannot create cutout: Missing coordinates');
                                }
                                return;
                            }
                        }
                        const regionData = {
                            ra: content.ra,
                            dec: content.dec,
                            region_type: content.region_type,
                            region_id: content.region_id,
                            radius_pixels: content.radius_pixels,
                            width_pixels: content.width_pixels,
                            height_pixels: content.height_pixels,
                            minor_radius_pixels: content.minor_radius_pixels,
                            vertices: Array.isArray(content.vertices) ? content.vertices : null,
                            fits_path: window.currentFitsFile || null,
                            hdu_index: typeof window.currentHduIndex === 'number' ? window.currentHduIndex : null
                        };
                        regionData.galaxy_name = galaxyName;
                        try {
                            cutoutRegionButton.disabled = true;
                            cutoutRegionButton.textContent = 'Creating...';
                            if (!window.__sid) {
                                const sessionRes = await fetch('/session/start');
                                const sessionJson = await sessionRes.json();
                                if (sessionJson && sessionJson.session_id) {
                                    window.__sid = sessionJson.session_id;
                                }
                            }
                            const headers = { 'Content-Type': 'application/json' };
                            if (window.__sid) headers['X-Session-ID'] = window.__sid;
                            const response = await fetch('/region-cutout/', {
                                method: 'POST',
                                headers,
                                body: JSON.stringify(regionData)
                            });
                            if (!response.ok) {
                                const error = await response.json().catch(() => ({ detail: `HTTP ${response.status}: ${response.statusText}` }));
                                throw new Error(error.detail || 'Failed to create cutout');
                            }
                            const result = await response.json();
                            if (typeof window.showNotification === 'function') {
                                window.showNotification(`Cutout saved: ${result.filename}`, 3000, 'success');
                            }
                        } catch (err) {
                            console.error('[simpleRegionPopup] Error creating cutout:', err);
                            if (typeof window.showNotification === 'function') {
                                window.showNotification(`Error creating cutout: ${err.message}`, 4000, 'error');
                            }
                        } finally {
                            cutoutRegionButton.disabled = false;
                            cutoutRegionButton.textContent = 'Cutout';
                        }
                    };
                }

                if (zoomInsetButton) {
                    // Use onclick (not addEventListener) and scope queries to this popup to avoid duplicate handlers
                    zoomInsetButton.onclick = async (e) => {
                        e.stopPropagation();
                        if (!(Number.isFinite(content.ra) && Number.isFinite(content.dec))) {
                            const ok = await ensureRegionWorldCoords();
                            if (!ok) {
                                if (typeof window.showNotification === 'function') {
                                    window.showNotification('Cannot create inset: Missing coordinates', 3500, 'error');
                                } else {
                                    alert('Cannot create inset: Missing coordinates');
                                }
                                return;
                            }
                        }
                        const regionData = {
                            ra: content.ra,
                            dec: content.dec,
                            region_type: content.region_type,
                            region_id: content.region_id,
                            radius_pixels: content.radius_pixels,
                            width_pixels: content.width_pixels,
                            height_pixels: content.height_pixels,
                            minor_radius_pixels: content.minor_radius_pixels,
                            vertices: Array.isArray(content.vertices) ? content.vertices : null,
                            fits_path: window.currentFitsFile || null,
                            hdu_index: typeof window.currentHduIndex === 'number' ? window.currentHduIndex : null
                        };
                        regionData.galaxy_name = galaxyName;
                        try {
                            zoomInsetButton.disabled = true;
                            zoomInsetButton.textContent = 'Loading...';
                            if (!window.__sid) {
                                const sessionRes = await fetch('/session/start');
                                const sessionJson = await sessionRes.json();
                                if (sessionJson && sessionJson.session_id) {
                                    window.__sid = sessionJson.session_id;
                                }
                            }
                            const headers = { 'Content-Type': 'application/json' };
                            if (window.__sid) headers['X-Session-ID'] = window.__sid;
                            const response = await fetch('/region-cutout/', {
                                method: 'POST',
                                headers,
                                body: JSON.stringify(regionData)
                            });
                            if (!response.ok) {
                                const error = await response.json().catch(() => ({ detail: `HTTP ${response.status}: ${response.statusText}` }));
                                throw new Error(error.detail || 'Failed to create cutout');
                            }
                            const result = await response.json();
                            const cutoutRel = `uploads/${result.filename}`;
                            await showRegionZoomInsetFromCutout(
                                cutoutRel,
                                (content.region_type || 'Zoom').toString(),
                                content.region_id,
                                regionData
                            );
                        } catch (err) {
                            if (typeof window.showNotification === 'function') {
                                window.showNotification(`Zoom inset error: ${err.message}`, 4000, 'error');
                            }
                        } finally {
                            zoomInsetButton.disabled = false;
                            zoomInsetButton.textContent = 'Zoom inset';
                        }
                    };
                }

                if (deleteRegionButton) {
                    deleteRegionButton.onclick = (e) => {
                        e.stopPropagation();
                        if (typeof window.deleteRegionById === 'function' && content.region_id) {
                            window.deleteRegionById(content.region_id);
                        }
                    };
                }
            }, 0);
        }

        // Position near the region center (anchor), clamped to viewer bounds
        try {
            const target = box;
            if (viewerElement) {
                const vw = viewerElement.clientWidth || 0;
                const vh = viewerElement.clientHeight || 0;
                let px = anchor && typeof anchor.x === 'number' ? anchor.x + 15 : vw / 2;
                let py = anchor && typeof anchor.y === 'number' ? anchor.y - 40 : vh / 2;
                const rect = target.getBoundingClientRect();
                const w = rect.width || 320;
                const h = rect.height || 160;
                if (px + w > vw - 10) px = Math.max(10, vw - w - 10);
                if (px < 10) px = 10;
                if (py + h > vh - 10) py = Math.max(10, vh - h - 10);
                if (py < 10) py = 10;
                target.style.left = `${px}px`;
                target.style.top = `${py}px`;
            } else if (anchor && typeof anchor.x === 'number' && typeof anchor.y === 'number') {
                target.style.left = `${anchor.x + 15}px`;
                target.style.top = `${Math.max(10, anchor.y - 40)}px`;
            }
            target.style.right = 'auto';
        } catch (_) {}

        box.style.display = 'block';
    } catch (e) {
        console.warn('[regions] simple region popup fallback failed', e);
    }
}

function computeRegionPopupContent(shape) {
    const center = getShapeCenter(shape);
    const content = {
        source_type: 'region',
        region_type: shape?.type || 'unknown',
        region_label: shape?.label || 'Region',
        region_id: shape?.id || null,
        x_bottom_left: center && Number.isFinite(center.x) ? Number(center.x.toFixed(2)) : undefined,
        y_bottom_left: center && Number.isFinite(center.y)
            ? Number(convertYToBottomOrigin(center.y).toFixed(2))
            : undefined
    };

    if (shape.type === 'circle') {
        content.radius_pixels = Number(shape.radius.toFixed(2));
    } else if (shape.type === 'rectangle') {
        content.width_pixels = Number(Math.abs(shape.x2 - shape.x1).toFixed(2));
        content.height_pixels = Number(Math.abs(shape.y2 - shape.y1).toFixed(2));
    } else if (shape.type === 'ellipse') {
        // Preserve ellipse orientation for cutouts by sending explicit axis-aligned width/height.
        // (If we only send major/minor, the backend can't know whether the major axis was X or Y,
        //  and the masked cutout will appear "always horizontal".)
        content.width_pixels = Number((shape.radiusX * 2).toFixed(2));
        content.height_pixels = Number((shape.radiusY * 2).toFixed(2));
        // Keep the legacy fields too (used elsewhere / backward compatibility).
        content.radius_pixels = Number(Math.max(shape.radiusX, shape.radiusY).toFixed(2));
        content.minor_radius_pixels = Number(Math.min(shape.radiusX, shape.radiusY).toFixed(2));
    } else if (shape.type === 'hexagon') {
        content.width_pixels = Number((shape.radiusX * 2).toFixed(2));
        content.height_pixels = Number((shape.radiusY * 2).toFixed(2));
        const verts = buildHexagonVertices(shape.center, shape.radiusX, shape.radiusY) || [];
        content.vertices = verts.map((v) => ({
            x: Number(v.x.toFixed(3)),
            y: Number(v.y.toFixed(3))
        }));
    }

    if (center) {
        const world = getWorldCoordinatesFromImage(center.x, center.y);
        if (world) {
            content.ra = world.ra;
            content.dec = world.dec;
        }
    }

    return content;
}

function showRegionPopup(shape) {
    if (!shape) return;
    const center = getShapeCenter(shape);
    const screenPoint = center ? imagePointToScreen(center) : null;
    if (!screenPoint) return;

    // Mark selection for highlight
    regionDrawingState.selectedShapeId = shape.id;
    const content = computeRegionPopupContent(shape);

    // Use unified DOM popup implementation for regions (works in single + multi-panel)
    showSimpleRegionPopup(content, screenPoint);
    renderRegionOverlay();
}

// Expose simple popup helper globally so the top-level window can render popups for panes
try { window.showSimpleRegionPopup = showSimpleRegionPopup; } catch (_) {}

function updateRegionCursor() {
    const viewerElement = document.getElementById('openseadragon');
    if (!viewerElement) return;
    const tool = REGION_TOOLS.find(t => t.id === regionDrawingState.activeTool);
    if (tool) {
        viewerElement.style.cursor = tool.cursor || 'crosshair';
        return;
    }
    viewerElement.style.cursor = (regionDrawingState.mouseMode === 'pan') ? 'grab' : '';
}

function setRegionMouseMode(mode) {
    const normalized = (mode === 'pan') ? 'pan' : 'pointer';
    if (regionDrawingState.mouseMode === normalized) return;
    regionDrawingState.mouseMode = normalized;
    updateRegionCursor();
    try {
        document.dispatchEvent(new CustomEvent('region-mouse-mode-changed', { detail: { mode: normalized } }));
    } catch (_) {}
}

function setRegionDrawingTool(toolId) {
    const normalized = toolId || null;
    if (regionDrawingState.activeTool === normalized) {
        regionDrawingState.activeTool = null;
    } else {
        regionDrawingState.activeTool = normalized;
        if (normalized) {
            ensureRegionInfrastructure();
            // Drawing implies pointer intent
            regionDrawingState.mouseMode = 'pointer';
        }
    }
    updateRegionCursor();
    document.dispatchEvent(new CustomEvent('region-tool-changed', { detail: { toolId: regionDrawingState.activeTool } }));
}

function clearRegionSelections() {
    regionDrawingState.selectedShapeId = null;
    renderRegionOverlay();
}

function clearAllRegions() {
    if (!regionDrawingState.shapes.length && !regionDrawingState.previewShape) return 0;
    regionDrawingState.shapes = [];
    regionDrawingState.previewShape = null;
    regionDrawingState.selectedShapeId = null;
    try {
        if (window.canvasPopup && typeof window.canvasPopup.hide === 'function') {
            window.canvasPopup.hide();
        }
    } catch (_) {}
    renderRegionOverlay();
    return 0;
}

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && regionDrawingState.activeTool) {
        setRegionDrawingTool(null);
    }
    // Delete selected region with Delete/Backspace (when not typing in an input)
    try {
        const key = event.key;
        if (key === 'Delete' || key === 'Backspace') {
            const t = event.target;
            const tag = (t && t.tagName) ? String(t.tagName).toLowerCase() : '';
            const isTypingTarget =
                (tag === 'input' || tag === 'textarea' || tag === 'select') ||
                (t && t.isContentEditable);
            if (isTypingTarget) return;
            const selId = regionDrawingState.selectedShapeId;
            if (selId) {
                event.preventDefault();
                if (typeof window.deleteRegionById === 'function') {
                    window.deleteRegionById(selId);
                } else {
                    // Fallback: delete locally
                    const idx = regionDrawingState.shapes.findIndex((shape) => shape.id === selId);
                    if (idx >= 0) {
                        regionDrawingState.shapes.splice(idx, 1);
                        regionDrawingState.selectedShapeId = null;
                        renderRegionOverlay();
                    }
                }
            }
        }
    } catch (_) {}
});

window.addEventListener('resize', scheduleRegionCanvasResize);

window.setRegionDrawingTool = setRegionDrawingTool;
window.clearRegionDrawingTool = () => setRegionDrawingTool(null);
window.setRegionMouseMode = setRegionMouseMode;
window.listDrawnRegions = () => regionDrawingState.shapes.slice();
window.clearRegionSelections = clearRegionSelections;
window.clearAllRegions = clearAllRegions;
window.removeAllZoomInsets = _removeAllZoomInsets;
window.serializeZoomInsets = _serializeZoomInsets;
window.restoreZoomInsetsFromSerialized = _restoreZoomInsetsFromSerialized;
window.restoreRegionsFromSerialized = _restoreRegionsFromSerialized;
window.deleteRegionById = (regionId) => {
    if (!regionId) return;
    const idx = regionDrawingState.shapes.findIndex((shape) => shape.id === regionId);
    if (idx >= 0) {
        regionDrawingState.shapes.splice(idx, 1);
        if (regionDrawingState.selectedShapeId === regionId) {
            regionDrawingState.selectedShapeId = null;
        }
        renderRegionOverlay();
        if (window.canvasPopup && typeof window.canvasPopup.hide === 'function') {
            window.canvasPopup.hide();
        }
        // Remove any zoom insets associated with this region
        try { _removeZoomInsetsForRegion(regionId); } catch (_) {}
        // Also hide the "Source Information" (simple region) popup if it was showing this region
        try {
            const box = document.getElementById('simple-region-popup');
            const shownId = box && box.dataset ? box.dataset.regionId : '';
            if (box && (String(shownId || '') === String(regionId))) {
                box.style.display = 'none';
            }
        } catch (_) {}
    }
};

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
// Global variables
let currentDynamicRangeVersion = Date.now();
let fitsData = null;
let viewer = null;
let performanceTimer;
let isOverviewMode = true; // Start with overview mode
let activeCatalog = null; // Currently active catalog
let infoPopups = [];
let maxPopups = 5; // Maximum number of popups allowed
let isUpdatingHistogram = false;
let histogramUpdateRequested = false;
let histogramUpdateQueue = [];
let histogramUpdateTimer = null;
let currentColorMap = 'grayscale'; // Default color map
let currentScaling = 'linear'; // Default scaling function
const GLOBAL_DATA_PRECISION = 3; // Number of decimal places for displaying float data values

// NEW: State for interactive histogram
let histogramScaleInfo = { padding: {}, histWidth: 0, dataMin: 0, dataRange: 1 };
let isDraggingLine = null; // Can be 'min', 'max', or null
const DRAG_THRESHOLD = 5; // Pixel tolerance for clicking lines
let throttledHistogramUpdate = null; // To be initialized later
let debouncedApplyDynamicRange = null; // To be initialized later


// static/main.js

// ... (other global variables like isUpdatingHistogram, currentColorMap, etc.)
let debouncedRequestHistogramUpdate = null; // For debouncing histogram updates
let histogramOverviewPixelData = null; // <-- ADD THIS LINE: For caching overview pixels

// NEW: State for line animation (if you have this section)
// ...

// NEW: State for line animation
let currentMinLineX = null;
let currentMaxLineX = null;
let lineAnimationId = null;
const LINE_ANIMATION_DURATION = 150; // ms

const ENV_DESCRIPTIONS = {
    1: "Center",
    2: "Bar ",
    3: "Bar ends",
    4: "Interbar",
    5: "Spiral arms inside interbar",
    6: "Spiral arms ",
    7: "Interarm",
    8: "Outer disc",
    9: "Interbar",
    10: "Disc"
};

let overviewLoadingStopped = false; // Added global flag

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

document.addEventListener("DOMContentLoaded", function () {
    // Create a main container for the app's primary content
    const mainContainer = document.createElement('div');
    mainContainer.id = 'main-container';
    document.body.appendChild(mainContainer);

    // Create a circular progress indicator
    createProgressIndicator();
    showNotification(true, "Loading FITS image...");
    
    // Load FITS data directly
    loadFitsData();
    
    // Add keyboard shortcuts
    document.addEventListener("keydown", function (event) {
        if (event.key === "+") {
            zoomIn();
        } else if (event.key === "-") {
            zoomOut();
        } else if (event.key.toLowerCase() === "r") {
            resetView();
        }
    });

    // Load catalogs on startup
    loadCatalogs();
    
    // Add dynamic range control
    createDynamicRangeControl();

    // Initialize the usage monitor icon and popup functionality
    if (typeof initializeUsageMonitor === 'function') {
        initializeUsageMonitor();
    } else {
        console.error('Usage monitor initialization function not found. Ensure usage.js is loaded correctly.');
    }

    // Initialize the credit button
    if (typeof initializeCreditButton === 'function') {
        initializeCreditButton();
    } else {
        console.error('Credit button initialization function not found. Ensure credit.js is loaded correctly.');
    }
});

function createProgressIndicator() {
    // Create container
    const progressContainer = document.createElement('div');
    progressContainer.id = 'progress-container';
    progressContainer.style.position = 'absolute';
    progressContainer.style.top = '50%';
    progressContainer.style.left = '50%';
    progressContainer.style.transform = 'translate(-50%, -50%)';
    progressContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    progressContainer.style.borderRadius = '10px';
    progressContainer.style.padding = '20px';
    progressContainer.style.display = 'none';
    progressContainer.style.zIndex = '2000';
    progressContainer.style.textAlign = 'center';
    
    // Create spinner
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    spinner.style.width = '50px';
    spinner.style.height = '50px';
    spinner.style.border = '5px solid rgba(255, 255, 255, 0.3)';
    spinner.style.borderRadius = '50%';
    spinner.style.borderTop = '5px solid white';
    spinner.style.margin = '0 auto 15px auto';
    spinner.style.animation = 'spin 1s linear infinite';
    
    // Create percentage text
    const percentage = document.createElement('div');
    percentage.id = 'progress-percentage';
    percentage.style.color = 'white';
    percentage.style.fontFamily = 'Arial, sans-serif';
    percentage.style.fontSize = '18px';
    percentage.style.fontWeight = 'bold';
    percentage.textContent = '0%';
    
    // Create message text
    const text = document.createElement('div');
    text.id = 'progress-text';
    text.style.color = 'white';
    text.style.fontFamily = 'Arial, sans-serif';
    text.style.fontSize = '14px';
    text.style.marginTop = '5px';
    
    // Add animation style
    const style = document.createElement('style');
    style.textContent = `
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
    
    // Append elements
    document.head.appendChild(style);
    progressContainer.appendChild(spinner);
    progressContainer.appendChild(percentage);
    progressContainer.appendChild(text);
    document.body.appendChild(progressContainer);
    
    // Start progress simulation when shown
    startProgressSimulation();
}


/**
 * Show a progress bar notification to the user
 * @param {string} message - The message to display
 * @param {number} duration - How long to show the message in milliseconds
 * @param {string} type - Type of notification ('info', 'success', 'error', 'warning')
 */

// Rate limiting storage
const notificationRateLimit = {
    messages: new Map(),
    cleanupInterval: null,
    
    // Check if message should be shown (not rate limited)
    canShow(message) {
        const now = Date.now();
        const lastShown = this.messages.get(message);
        
        // If message was shown less than 300ms ago, rate limit it
        if (lastShown && (now - lastShown) < 300) {
            return false;
        }
        
        // Update last shown time
        this.messages.set(message, now);
        
        // Start cleanup if not already running
        if (!this.cleanupInterval) {
            this.startCleanup();
        }
        
        return true;
    },
    
    // Clean up old entries every 5 seconds
    startCleanup() {
        this.cleanupInterval = setInterval(() => {
            const now = Date.now();
            const cutoff = now - 5000; // 5 seconds ago
            
            for (const [message, timestamp] of this.messages.entries()) {
                if (timestamp < cutoff) {
                    this.messages.delete(message);
                }
            }
            
            // Stop cleanup if no entries left
            if (this.messages.size === 0) {
                clearInterval(this.cleanupInterval);
                this.cleanupInterval = null;
            }
        }, 5000);
    }
};

function showNotification(message, duration = 1000, type = 'info') {
    if(duration>1500){
        duration = 1500;
    }
    // Convert message to string and handle special cases
    if (message === true || message === false) {
        message = 'Loading...';
    } else {
        message = String(message || '');
        if (message.trim() === '') {
            message = 'Loading...';
        }
    }
    
    // Rate limiting check
    if (!notificationRateLimit.canShow(message)) {
        console.log('Notification rate limited:', message);
        return null;
    }
    
    // console.log('Notification:', message);
    
    // Create notification container if it doesn't exist
    let notificationContainer = document.getElementById('notification-container');
    if (!notificationContainer) {
        notificationContainer = document.createElement('div');
        notificationContainer.id = 'notification-container';
        notificationContainer.style.position = 'fixed';
        notificationContainer.style.bottom = '20px';
        notificationContainer.style.left = '20px';
        notificationContainer.style.width = '320px';
        notificationContainer.style.zIndex = '20000000000';
        notificationContainer.style.display = 'flex';
        notificationContainer.style.flexDirection = 'column';
        notificationContainer.style.pointerEvents = 'none';
        document.body.appendChild(notificationContainer);
    }
    
    // Clear all existing notifications before showing the new one
    const existingNotifications = notificationContainer.querySelectorAll('.notification');
    existingNotifications.forEach(notif => {
        // Clear any pending timers
        if (notif.dataset.timerId) {
            clearTimeout(notif.dataset.timerId);
        }
        // Remove immediately without animation for instant replacement
        notif.remove();
    });
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.style.position = 'relative';
    notification.style.width = '100%';
    notification.style.height = '60px';
    notification.style.backgroundColor = 'rgba(33, 33, 33, 0.95)';
    notification.style.color = 'white';
    notification.style.display = 'flex';
    notification.style.alignItems = 'center';
    notification.style.fontFamily = 'Arial, sans-serif';
    notification.style.fontSize = '14px';
    notification.style.backdropFilter = 'blur(8px)';
    notification.style.webkitBackdropFilter = 'blur(8px)';
    notification.style.borderTop = '1px solid rgba(255, 255, 255, 0.1)';
    notification.style.borderRadius = '8px';
    notification.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    notification.style.overflow = 'hidden';
    notification.style.transform = 'translateY(100%)';
    notification.style.opacity = '0';
    notification.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
    notification.style.pointerEvents = 'all';
    
    // Create progress bar background
    const progressBackground = document.createElement('div');
    progressBackground.style.position = 'absolute';
    progressBackground.style.top = '0';
    progressBackground.style.left = '0';
    progressBackground.style.width = '100%';
    progressBackground.style.height = '4px';
    progressBackground.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
    notification.appendChild(progressBackground);
    
    // Create progress bar fill
    const progressFill = document.createElement('div');
    progressFill.style.position = 'absolute';
    progressFill.style.top = '0';
    progressFill.style.left = '0';
    progressFill.style.width = '0%';
    progressFill.style.height = '4px';
    progressFill.style.transition = `width ${duration}ms linear`;
    
    // Set type-specific colors, gradients and icons
    let iconHtml = '';
    let progressGradient = '';
    if (type === 'success') {
        progressGradient = 'linear-gradient(90deg, #4CAF50, #66BB6A, #4CAF50)';
        iconHtml = `<div style="margin: 0 16px 0 20px; flex-shrink: 0;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" stroke-width="2" class="success-icon">
                <path d="M20 6L9 17l-5-5"/>
            </svg>
        </div>`;
    } else if (type === 'error') {
        progressGradient = 'linear-gradient(90deg, #F44336, #EF5350, #F44336)';
        iconHtml = `<div style="margin: 0 16px 0 20px; flex-shrink: 0;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F44336" stroke-width="2" class="error-icon">
                <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
        </div>`;
    } else if (type === 'warning') {
        progressGradient = 'linear-gradient(90deg, #FF9800, #FFB74D, #FF9800)';
        iconHtml = `<div style="margin: 0 16px 0 20px; flex-shrink: 0;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FF9800" stroke-width="2" class="warning-icon">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
        </div>`;
    } else {
        progressGradient = 'linear-gradient(90deg, #2196F3, #42A5F5, #2196F3)';
        iconHtml = `<div style="margin: 0 16px 0 20px; flex-shrink: 0;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2196F3" stroke-width="2" class="info-icon">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 8v4m0 4h.01"/>
            </svg>
        </div>`;
    }
    
    progressFill.style.background = progressGradient;
    progressFill.style.backgroundSize = '200% 100%';
    progressFill.style.animation = 'shimmer 2s infinite';
    progressBackground.appendChild(progressFill);
    
    // Add CSS animation for shimmer effect
    if (!document.getElementById('notification-styles')) {
        const style = document.createElement('style');
        style.id = 'notification-styles';
        style.textContent = `
            @keyframes shimmer {
                0% { background-position: 200% 0; }
                100% { background-position: -200% 0; }
            }
            
            @keyframes bounce {
                0%, 20%, 53%, 80%, 100% { transform: translate3d(0, 0, 0); }
                40%, 43% { transform: translate3d(0, -4px, 0); }
                70% { transform: translate3d(0, -2px, 0); }
                90% { transform: translate3d(0, -1px, 0); }
            }
            
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            
            @keyframes shake {
                0%, 100% { transform: translateX(0); }
                10%, 30%, 50%, 70%, 90% { transform: translateX(-2px); }
                20%, 40%, 60%, 80% { transform: translateX(2px); }
            }
            
            @keyframes pulse {
                0% { transform: scale(1); }
                50% { transform: scale(1.1); }
                100% { transform: scale(1); }
            }
            
            .success-icon {
                animation: bounce 0.6s ease-out;
            }
            
            .error-icon {
                animation: shake 0.5s ease-in-out;
            }
            
            .warning-icon {
                animation: pulse 1s ease-in-out infinite;
            }
            
            .info-icon {
                animation: spin 2s linear infinite;
            }
        `;
        document.head.appendChild(style);
    }
    
    // Create content container
    const contentContainer = document.createElement('div');
    contentContainer.style.display = 'flex';
    contentContainer.style.alignItems = 'center';
    contentContainer.style.width = '100%';
    contentContainer.style.marginTop = '4px';
    
    // Create message content
    const messageContainer = document.createElement('div');
    messageContainer.style.flex = '1';
    messageContainer.style.padding = '0 20px';
    messageContainer.style.fontWeight = '500';
    messageContainer.textContent = message;
    
    // Create close button
    const closeButton = document.createElement('div');
    closeButton.innerHTML = '&times;';
    closeButton.style.marginRight = '20px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.color = '#aaa';
    closeButton.style.fontSize = '24px';
    closeButton.style.fontWeight = 'bold';
    closeButton.style.padding = '5px';
    closeButton.style.borderRadius = '50%';
    closeButton.style.width = '30px';
    closeButton.style.height = '30px';
    closeButton.style.display = 'flex';
    closeButton.style.alignItems = 'center';
    closeButton.style.justifyContent = 'center';
    closeButton.style.transition = 'background-color 0.2s ease';
    closeButton.style.flexShrink = '0';
    
    closeButton.addEventListener('mouseenter', () => {
        closeButton.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
    });
    
    closeButton.addEventListener('mouseleave', () => {
        closeButton.style.backgroundColor = 'transparent';
    });
    
    closeButton.addEventListener('click', () => {
        removeNotification(notification);
    });
    
    // Assemble the content
    contentContainer.innerHTML = iconHtml;
    contentContainer.appendChild(messageContainer);
    contentContainer.appendChild(closeButton);
    notification.appendChild(contentContainer);
    
    // Append to container and show
    notificationContainer.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.style.transform = 'translateY(0)';
        notification.style.opacity = '1';
    }, 50);

    // Set timeout to remove notification
    const timerId = setTimeout(() => {
        removeNotification(notification);
    }, duration);
    
    // Store the timer ID for potential early removal
    notification.dataset.timerId = timerId;
    
    // Function to remove notification with animation
    function removeNotification(notif) {
        if (!notif) return;
        
        // Clear the timeout to prevent duplicate removals
        clearTimeout(notif.dataset.timerId);
        
        // Animate out
        notif.style.transform = 'translateY(100%)';
        notif.style.opacity = '0';
        
        // Wait for animation to finish, then remove
        setTimeout(() => {
            if (notif.parentNode) {
                notif.parentNode.removeChild(notif);
                
                // If container is empty, remove it too
                if (notificationContainer.children.length === 0) {
                    notificationContainer.parentNode.removeChild(notificationContainer);
                }
            }
        }, 300);
    }
    
    return notification;
}

// Example usage:
// showNotification("Task completed successfully!", 2000, "success");
// showNotification("An error occurred while processing", 3000, "error");
// showNotification("Please review your settings", 2500, "warning");
// showNotification("Loading data...", 1500, "info");

// Example usage:
// showNotification("Task completed successfully!", 2000, "success");
// showNotification("An error occurred while processing", 3000, "error");
// showNotification("Please review your settings", 2500, "warning");
// showNotification("Loading data...", 1500, "info");

// Example usage:
// showNotification("Task completed successfully!", 2000, "success");
// showNotification("An error occurred while processing", 3000, "error");
// showNotification("Please review your settings", 2500, "warning");
// showNotification("Loading data...", 1500, "info");

// Example usage:
// showNotification("Task completed successfully!", 2000, "success");
// showNotification("An error occurred while processing", 3000, "error");
// showNotification("Please review your settings", 2500, "warning");
// showNotification("Loading data...", 1500, "info");



// Simulate progress percentage
let progressInterval;
let currentProgress = 0;

function startProgressSimulation() {
    // Reset progress
    currentProgress = 0;
    const percentageElement = document.getElementById('progress-percentage');
    if (percentageElement) {
        percentageElement.textContent = '0%';
    }
    
    // Clear any existing interval
    stopProgressSimulation();
    
    // Start new interval - use a faster update interval (50ms instead of 200ms)
    progressInterval = setInterval(() => {
        const percentageElement = document.getElementById('progress-percentage');
        if (percentageElement) {
            // Increment progress more quickly
            if (currentProgress < 50) {
                currentProgress += 15;
            } else if (currentProgress < 80) {
                currentProgress += 10;
            } else if (currentProgress < 95) {
                currentProgress += 5;
            }
            
            // Cap at 95% - the final 5% happens when loading completes
            if (currentProgress > 95) {
                currentProgress = 95;
            }
            
            percentageElement.textContent = `${Math.floor(currentProgress)}%`;
        }
    }, 50);
}

function stopProgressSimulation() {
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
        
        // Set to 100% when complete
        const percentageElement = document.getElementById('progress-percentage');
        if (percentageElement) {
            percentageElement.textContent = '100%';
        }
    }
}



function applyPercentile(percentileValue) {
    console.log(`Attempting to apply ${percentileValue * 100}% percentile`);
    let viewerInitialized = false; // Keep track if any viewer update was initiated

    // Check if FITS data global object exists (it should, if popup is visible)
    if (!window.fitsData) {
        console.error('No FITS data object available in global scope');
        showNotification('Image metadata not loaded. Please load an image first.', 3000, 'error');
        return;
    }

    const isTiledViewActive = window.tiledViewer && typeof window.tiledViewer.isOpen === 'function' && window.tiledViewer.isOpen();

    try {
        showNotification(true, 'Applying percentile...'); // Show progress early

        if (isTiledViewActive) {
            viewerInitialized = true; // Assume we will attempt an update
            console.log("Using tiled viewer for percentile application");
            showNotification(true, 'Calculating percentile from server data...');

            // 1. Fetch full range histogram from server
            fetchServerHistogram(null, null, 256) // bins = 256, or any reasonable number
                .then(histData => {
                    if (!histData || typeof histData.data_overall_min === 'undefined' || typeof histData.data_overall_max === 'undefined') {
                        throw new Error('Missing overall data range from server histogram.');
                    }

                    const overallMin = histData.data_overall_min;
                    const overallMax = histData.data_overall_max;

                    // 2. Calculate new min/max based on percentile and overall range
                    // For percentile, minValue is typically the absolute min of the data
                    let newMinValue = overallMin;
                    let newMaxValue = overallMin + (overallMax - overallMin) * percentileValue;

                    // Ensure newMaxValue does not exceed overallMax and newMinValue is not less than overallMin
                    newMinValue = Math.max(overallMin, newMinValue);
                    newMaxValue = Math.min(overallMax, newMaxValue);

                    // Ensure min < max, handle flat data or edge cases
                    if (newMinValue >= newMaxValue) {
                        if (overallMin === overallMax) { // Flat data
                            newMaxValue = newMinValue + 1e-6; // Add a tiny epsilon
                        } else {
                            // If calculation results in min >= max, default to a small fraction of the range
                            // This might happen if percentileValue is very low or data is skewed
                            newMaxValue = newMinValue + (overallMax - overallMin) * 0.01; // e.g., 1% of range above min
                            if (newMinValue >= newMaxValue) newMaxValue = newMinValue + 1e-6; // fallback epsilon
                        }
                        newMaxValue = Math.min(overallMax, newMaxValue); // Re-clip to ensure it's not over overallMax
                    }

                    console.log(`Server overall range: ${overallMin}-${overallMax}. New percentile range for ${percentileValue*100}%: ${newMinValue} to ${newMaxValue}`);

                    // 3. Update UI input fields
                    const minInput = document.getElementById('min-range-input');
                    const maxInput = document.getElementById('max-range-input');
                    if (minInput && maxInput) {
                        minInput.value = newMinValue.toFixed(2);
                        maxInput.value = newMaxValue.toFixed(2);
                    }

                    // 4. Update client-side fitsData (for consistency, though server is truth for tiles)
                    // Ensure window.fitsData exists, which it should if the popup is open.
                    window.fitsData.min_value = newMinValue;
                    window.fitsData.max_value = newMaxValue;
                    // Also store the percentile values as initial if they are being set by this function
                    window.fitsData.initial_min_value = newMinValue;
                    window.fitsData.initial_max_value = newMaxValue;


                    // 5. Update the server-side settings with the new calculated range
                    return fetch('/update-dynamic-range/', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            min_value: newMinValue,
                            max_value: newMaxValue,
                            color_map: window.currentColorMap,      // Send current colormap
                            scaling_function: window.currentScaling // Send current scaling
                        })
                    });
                })
                .then(response => {
                    if (!response) throw new Error('No response from /update-dynamic-range/ fetch.');
                    if (!response.ok) {
                        return response.json().then(errData => { // Try to parse error from server
                            throw new Error(errData.error || `Server error: ${response.status}`);
                        }).catch(() => { // Fallback if .json() fails or no .error field
                            throw new Error(`Server error: ${response.status} ${response.statusText}`);
                        });
                    }
                    return response.json();
                })
                .then(data => {
                    if (!data) throw new Error('No data from /update-dynamic-range/ response.');
                    if (data.error) { // Explicit error message from server's JSON response
                        throw new Error(data.error);
                    }
                    
                    console.log("Server dynamic range updated for percentile. Re-opening OpenSeadragon tile source.");
                    currentDynamicRangeVersion = Date.now(); // Crucial for cache busting tile URLs

                    if (window.tiledViewer && currentTileInfo) {
                        const currentZoom = window.tiledViewer.viewport.getZoom();
                        const currentPan = window.tiledViewer.viewport.getCenter();

                        const newTileSourceOptions = {
                            width: currentTileInfo.width,
                            height: currentTileInfo.height,
                            tileSize: currentTileInfo.tileSize,
                            maxLevel: currentTileInfo.maxLevel,
                            getTileUrl: function(level, x, y) {
                                return `/fits-tile/${level}/${x}/${y}?v=${currentDynamicRangeVersion}`;
                            },
                            getLevelScale: function(level) { // Ensure this is present if needed
                                return 1 / (1 << (this.maxLevel - level));
                            }
                        };
                        window.tiledViewer.open(newTileSourceOptions);
                        window.tiledViewer.addOnceHandler('open', function() {
                            window.tiledViewer.viewport.zoomTo(currentZoom, null, true); // immediate
                            window.tiledViewer.viewport.panTo(currentPan, true);       // immediate
                            if (window.tiledViewer.drawer) {
                                window.tiledViewer.drawer.setImageSmoothingEnabled(false);
                            }
                            console.log("Viewport restored after percentile update in tiled view.");
                        });
                        showNotification(`Applied ${percentileValue * 100}% percentile`, 1500, 'success');
                    } else {
                        throw new Error('Cannot re-open tile source: tiledViewer or currentTileInfo missing.');
                    }
                })
                .catch(error => {
                    console.error('Error applying percentile in tiled view:', error.message);
                    showNotification(`Failed to apply percentile: ${error.message}`, 4000, 'error');
                })
                .finally(() => {
                    showNotification(false);
                    requestHistogramUpdate(); // Update histogram UI
                });

        } else { // Non-tiled view (original logic for local data)
            if (!window.fitsData.data || (Array.isArray(window.fitsData.data) && window.fitsData.data.length === 0)) {
                console.error('FITS data has no pixel array or is empty (non-tiled view).');
                showNotification('Image data is incomplete. Try reloading the image (non-tiled).', 3000, 'error');
                showNotification(false); // Hide progress shown at the start of try block
                return;
            }
            viewerInitialized = true; // We will attempt local processing

            console.log(`Applying ${percentileValue * 100}% percentile locally`);
            const validPixels = [];
            const height = window.fitsData.height;
            const width = window.fitsData.width;
            const maxSampleSize = 1000000;
            const skipFactor = Math.max(1, Math.floor((width * height) / maxSampleSize));
            let pixelCount = 0;

            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x += skipFactor) {
                    pixelCount++;
                    if (pixelCount % skipFactor !== 0) continue;
                    try {
                        const value = window.fitsData.data[y][x];
                        if (!isNaN(value) && isFinite(value)) {
                            validPixels.push(value);
                        }
                    } catch (e) {
                        console.warn(`Error accessing pixel data at (${x},${y})`, e);
                    }
                }
            }

            if (validPixels.length === 0) {
                console.error('No valid pixels found for local percentile calculation');
                showNotification('No valid pixels found in image data', 2000, 'warning');
                showNotification(false);
                return;
            }

            validPixels.sort((a, b) => a - b);
            
            // For percentiles, min is typically the data's true min (0th percentile)
            const newMinValue = validPixels[0]; 
            // Max is the value at the chosen percentile
            let maxIndex = Math.floor(validPixels.length * percentileValue) -1; // -1 because array is 0-indexed
            maxIndex = Math.max(0, Math.min(maxIndex, validPixels.length - 1)); // Clamp index

            let newMaxValue = validPixels[maxIndex];

            if (newMinValue >= newMaxValue) { // Handle edge case where min >= max after percentile
                 if (validPixels[0] === validPixels[validPixels.length -1]){ // flat data
                    newMaxValue = newMinValue + 1e-6;
                 } else {
                    newMaxValue = validPixels[Math.min(maxIndex + 1, validPixels.length - 1)]; // Try next value
                    if (newMinValue >= newMaxValue) newMaxValue = newMinValue + 1e-6; // fallback epsilon
                 }
            }

            console.log(`Local Percentile ${percentileValue * 100}%: min=${newMinValue}, max=${newMaxValue}`);

            const minInput = document.getElementById('min-range-input');
            const maxInput = document.getElementById('max-range-input');
            if (minInput && maxInput) {
                minInput.value = newMinValue.toFixed(2);
                maxInput.value = newMaxValue.toFixed(2);
            }

            window.fitsData.min_value = newMinValue;
            window.fitsData.max_value = newMaxValue;
            // Also store the percentile values as initial if they are being set by this function
            window.fitsData.initial_min_value = newMinValue;
            window.fitsData.initial_max_value = newMaxValue;


            // Process the image with the new range (this logic might need to be adapted based on how non-tiled views are handled)
            if (window.Worker) {
                processImageInWorker();
            } else {
                processImageInMainThread();
            }
            // Hide progress after a short delay for local processing
            setTimeout(() => {
                showNotification(false);
                showNotification(`Applied ${percentileValue * 100}% percentile`, 1500, 'success');
            }, 500);
            requestHistogramUpdate(); // Update histogram UI
        }

    } catch (error) { // Catch errors from the main try block (e.g., local processing issues)
        console.error('Error applying percentile:', error);
        showNotification(false); // Ensure progress is hidden on error
        showNotification(`Error: ${error.message}`, 3000, 'error');
    }
}
// ===== CRITICAL FIX FOR VERY LARGE HST FILES =====

// Fixed error handling function to properly detect large files and prevent crashes
function initializeViewerWithFitsData() {
    console.log("Initializing viewer with FITS data");
    
    if (!window.fitsData) {
        console.error("Error: No FITS data available");
        showNotification(false);
        showNotification("Error: No FITS data available", 3000);
        return;
    }
    
    try {
        // Validate FITS data first - with extra error handling
        if (!window.fitsData.data) {
            throw new Error("Missing FITS data array");
        }
        
        if (!Array.isArray(window.fitsData.data)) {
            throw new Error("FITS data is not an array");
        }
        
        if (window.fitsData.data.length === 0) {
            throw new Error("FITS data array is empty");
        }
        
        if (!Array.isArray(window.fitsData.data[0])) {
            throw new Error("FITS data rows are not arrays");
        }
        
        const width = window.fitsData.width;
        const height = window.fitsData.height;
        
        // Extra validation for width and height
        if (!width || !height || width <= 0 || height <= 0) {
            throw new Error(`Invalid dimensions: ${width}x${height}`);
        }
        
        // Check for very large images
        const totalPixels = width * height;
        console.log(`FITS data dimensions: ${width}x${height} (${totalPixels} pixels)`);
        
        // Enhanced large file detection - 100 million pixels threshold
        if (totalPixels > 100000000) { 
            console.log(`Large image detected: ${width}x${height} (${totalPixels} pixels)`);
            showNotification(`Large image detected (${width}x${height}). Processing using optimized method...`, 4000, 'info');
            
            // For very large images, always use the specialized large image handler
            // with null viewport settings since we're initializing from scratch
            console.log("Using dedicated large image handler");
            processLargeImageInMainThread(null);
            return;
        }
        
        console.log(`FITS data range: min=${window.fitsData.min_value}, max=${window.fitsData.max_value}`);
        
        // For smaller images, try the worker first
        if (window.Worker) {
            console.log("Using Web Worker for image processing");
            processImageInWorker();
        } else {
            console.log("Web Worker not available, processing image in main thread");
            processImageInMainThread();
        }
    } catch (error) {
        // Enhanced error reporting
        console.error("Error initializing viewer:", error);
        console.error("Error details:", error.message);
        console.error("FITS data structure:", window.fitsData ? 
            `width: ${window.fitsData.width}, height: ${window.fitsData.height}, has data: ${!!window.fitsData.data}` : 
            "No FITS data");
        
        showNotification(false);
        showNotification(`Error initializing viewer: ${error.message}. Trying fallback method...`, 3000, 'error');
        
        // Last resort fallback - if we have any FITS data at all, try the large image processor
        if (window.fitsData && window.fitsData.data) {
            console.log("Attempting fallback to large image processor");
            processLargeImageInMainThread(null);
        }
    }
}



// Modified process binary data function
function processBinaryData(arrayBuffer, filepath) {
    try {
        showNotification(true, 'Processing FITS data...');
        
        // Use a setTimeout to let the UI update before heavy processing
        setTimeout(() => {
            try {
                const dataView = new DataView(arrayBuffer);
                let offset = 0;
                
                // Read dimensions
                const width = dataView.getInt32(offset, true);
                offset += 4;
                const height = dataView.getInt32(offset, true);
                offset += 4;
                
                console.log(`Image dimensions: ${width}x${height}`);
                
                // Check if dimensions are reasonable and warn about large images
                const totalPixels = width * height;
                if (totalPixels > 100000000) { // 100 million pixels
                    console.warn(`Very large image detected: ${width}x${height} = ${totalPixels} pixels`);
                    showNotification(`Large image detected (${width}x${height}). Processing may take longer.`, 4000, 'warning');
                }
                
                // Read min/max values
                const minValue = dataView.getFloat32(offset, true);
                offset += 4;
                const maxValue = dataView.getFloat32(offset, true);
                offset += 4;
                
                console.log(`Data range: ${minValue} to ${maxValue}`);
                
                // Read WCS info
                const hasWCS = dataView.getUint8(offset);
                offset += 1;
                
                let wcsInfo = null;
                if (hasWCS) {
                    // Read WCS JSON length
                    const wcsJsonLength = dataView.getInt32(offset, true);
                    offset += 4;
                    
                    if (wcsJsonLength > 0 && wcsJsonLength < 10000) { // Sanity check
                        // Read WCS JSON string
                        const wcsJsonBytes = new Uint8Array(arrayBuffer, offset, wcsJsonLength);
                        const wcsJsonString = new TextDecoder().decode(wcsJsonBytes);
                        try {
                            wcsInfo = JSON.parse(wcsJsonString);
                            console.log("WCS Info:", wcsInfo);
                        } catch (e) {
                            console.error("Error parsing WCS JSON:", e);
                            wcsInfo = null;
                        }
                        offset += wcsJsonLength;
                    } else {
                        console.warn(`Invalid WCS JSON length: ${wcsJsonLength}`);
                    }
                }
                
                // Read BUNIT if available
                let bunit = '';
                const bunitLength = dataView.getInt32(offset, true);
                offset += 4;
                
                if (bunitLength > 0 && bunitLength < 100) { // Sanity check
                    // Read BUNIT string
                    const bunitBytes = new Uint8Array(arrayBuffer, offset, bunitLength);
                    bunit = new TextDecoder().decode(bunitBytes);
                    offset += bunitLength;
                    
                    console.log(`BUNIT: ${bunit}`);
                    
                    // Add padding to ensure 4-byte alignment for the image data
                    const padding = (4 - (offset % 4)) % 4;
                    offset += padding;
                }
                
                if (wcsInfo) {
                    wcsInfo.bunit = bunit;
                }
                
                // Ensure offset is aligned to 4 bytes for Float32Array
                offset = Math.ceil(offset / 4) * 4;
                
                // Calculate expected pixel count and validate against remaining buffer size
                const pixelCount = width * height;
                const remainingBytes = arrayBuffer.byteLength - offset;
                const remainingFloats = remainingBytes / 4;
                
                if (remainingFloats < pixelCount) {
                    throw new Error(`Buffer too small for image data: expected ${pixelCount} pixels, but only have space for ${remainingFloats}`);
                }
                
                console.log(`Reading ${pixelCount} pixels from offset ${offset} (buffer size: ${arrayBuffer.byteLength})`);
                
                // Create data structure with chunked processing
                showNotification(true, 'Creating image data structures...');
                
                // Determine optimal chunk size based on image dimensions
                // For very large images, use larger chunks to reduce overhead
                let chunkSize = 100000; // Default
                if (height > 10000) {
                    chunkSize = 200000;
                }
                
                const data = [];
                const imageDataArray = new Float32Array(arrayBuffer, offset, pixelCount);
                
                // Process in chunks with yield to UI thread
                let processedRows = 0;
                
                function processNextChunk() {
                    const endRow = Math.min(processedRows + chunkSize, height);
                    const progress = Math.round((processedRows / height) * 100);
                    
                    showNotification(true, `Processing data: ${progress}%`);
                    
                    // Process a chunk of rows
                    for (let y = processedRows; y < endRow; y++) {
                        const row = new Array(width); // Pre-allocate row array
                        for (let x = 0; x < width; x++) {
                            row[x] = imageDataArray[y * width + x];
                        }
                        data.push(row);
                    }
                    
                    processedRows = endRow;
                    
                    // If we have more rows to process, schedule the next chunk
                    if (processedRows < height) {
                        setTimeout(processNextChunk, 0); // Yield to UI thread
                    } else {
                        // All rows processed, finalize
                        finalizeImageProcessing();
                    }
                }
                
                // Start processing chunks
                processNextChunk();
                
                // Function to finalize processing after all chunks are done
                function finalizeImageProcessing() {
                    // Store FITS data globally
                    window.fitsData = {
                        data: data,
                        width: width,
                        height: height,
                        min_value: minValue,
                        max_value: maxValue,
                        wcs: wcsInfo,
                        filename: filepath
                    };

                    if (typeof clearAllCatalogs === 'function') {
                        console.log("New FITS file opened (fast loader), clearing all existing catalogs.");
                        clearAllCatalogs();
                    }

                    // console.timeEnd('parseBinaryData');
                    
                    // Apply 99% percentile for better initial display
                    try {
                        showNotification(true, 'Calculating optimal display range...');
                        
                        // Calculate and apply 99% percentile with sampling for efficiency
                        const validPixels = [];
                        const maxSampleSize = 500000; // Limit samples for speed
                        const skipFactor = Math.max(1, Math.floor((width * height) / maxSampleSize));
                        
                        // For very large images, use an even larger skip factor
                        const actualSkipFactor = (width * height > 100000000) ? skipFactor * 2 : skipFactor;
                        
                        // Sample in a grid pattern for better coverage
                        for (let y = 0; y < height; y += Math.max(1, Math.floor(Math.sqrt(actualSkipFactor)))) {
                            for (let x = 0; x < width; x += Math.max(1, Math.floor(Math.sqrt(actualSkipFactor)))) {
                                const value = data[y][x];
                                if (!isNaN(value) && isFinite(value)) {
                                    validPixels.push(value);
                                }
                                
                                // Limit total samples to maxSampleSize
                                if (validPixels.length >= maxSampleSize) break;
                            }
                            if (validPixels.length >= maxSampleSize) break;
                        }
                        
                        if (validPixels.length > 0) {
                            validPixels.sort((a, b) => a - b);
                            const minValue = validPixels[0];
                            const maxValue = validPixels[Math.floor(validPixels.length * 0.99)]; // Using 99% percentile
                            
                            // Apply the dynamic range directly
                            window.fitsData.min_value = minValue;
                            window.fitsData.max_value = maxValue;
                            
                            console.log(`Applied 99% percentile: min=${minValue}, max=${maxValue}`);
                        }
                    } catch (error) {
                        console.error("Error applying initial percentile:", error);
                    }
                    
                    // Initialize viewer with the data
                    showNotification(true, 'Creating viewer...');
                    setTimeout(() => {
                        if (typeof initializeViewerWithFitsData === 'function') {
                            initializeViewerWithFitsData();
                        } else {
                            showNotification(false);
                            showNotification('Error: Viewer initialization function not found', 3000, 'error');
                        }
                        
                        // Extract just the filename from the full path for the notification
                        const filename = filepath.split('/').pop();
                        showNotification(`Loaded ${filename} successfully`, 2000, 'success');
                    }, 100);
                }
                
            } catch (error) {
                console.error('Error processing binary data:', error);
                showNotification(false);
                showNotification(`Error: ${error.message}`, 5000, 'error');
            }
        }, 100); // Small delay to let the UI update
        
    } catch (error) {
        console.error('Error in processBinaryData:', error);
        showNotification(false);
        showNotification(`Error: ${error.message}`, 5000, 'error');
    }
}

function processImageInMainThread() {
    // Show progress indicator
    showNotification(true, 'Processing image...');
    
    // Store current viewport settings
    let currentZoom = 0;
    let currentPan = null;
    if (viewer && viewer.viewport) {
        currentZoom = viewer.viewport.getZoom();
        currentPan = viewer.viewport.getCenter();
        console.log("Stored viewport settings:", currentZoom, currentPan);
    }
    
    // Create a canvas to render the FITS data
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Set canvas dimensions to match the data
    canvas.width = fitsData.width;
    canvas.height = fitsData.height;
    
    // Create an ImageData object
    const imageData = ctx.createImageData(fitsData.width, fitsData.height);
    
    console.log("Creating image data from FITS values");
    
    // Fill the ImageData with FITS values
    let minVal = Infinity;
    let maxVal = -Infinity;
    let nanCount = 0;
    
    // Use a more efficient approach with typed arrays
    const data = imageData.data;
    
    // Pre-calculate range for faster scaling
    const minValue = fitsData.min_value;
    const maxValue = fitsData.max_value;
    const range = maxValue - minValue;
    // CHANGE: Use global COLOR_MAPS and SCALING_FUNCTIONS
    const colorMapFunc = COLOR_MAPS[currentColorMap] || COLOR_MAPS.grayscale;
    const scalingFunc = SCALING_FUNCTIONS[currentScaling] || SCALING_FUNCTIONS.linear;
    
    console.time('processPixels');
    for (let y = 0; y < fitsData.height; y++) {
        for (let x = 0; x < fitsData.width; x++) {
            const idx = (y * fitsData.width + x) * 4;
            
            // Get value
            let val = fitsData.data[y][x];
            
            // Track min/max for debugging
            if (!isNaN(val) && isFinite(val)) {
                minVal = Math.min(minVal, val);
                maxVal = Math.max(maxVal, val);
            } else {
                nanCount++;
                val = 0; // Replace NaN with 0
            }
            
            // Apply scaling using fixed min/max values
            val = Math.max(minValue, Math.min(val, maxValue));
            
            // Apply the selected scaling function
            const normalizedVal = scalingFunc(val, minValue, maxValue);
            
            // Convert to 0-255 range for display
            const scaledVal = Math.round(normalizedVal * 255);
            
            // Apply color map
            const [r, g, b] = colorMapFunc(scaledVal);
            
            // Set RGBA values
            data[idx] = r;     // R
            data[idx + 1] = g; // G
            data[idx + 2] = b; // B
            data[idx + 3] = 255; // A (fully opaque)
        }
    }
    console.timeEnd('processPixels');
    
    console.log(`Image data statistics: min=${minVal}, max=${maxVal}, NaN count=${nanCount}`);
    
    // Put the image data on the canvas
    ctx.putImageData(imageData, 0, 0);
    
    // Convert canvas to data URL
    const dataUrl = canvas.toDataURL('image/png');
    console.log("Created data URL from canvas");
    
    // If viewer already exists, update it; otherwise initialize a new one
    if (viewer) {
        console.log("Updating existing OpenSeadragon viewer");
        
        // Update the image
        viewer.open({
            type: 'image',
            url: dataUrl,
            buildPyramid: false
        });
        
        // Add handler to restore viewport settings immediately when the image is loaded
        viewer.addOnceHandler('open', function() {
            viewer.viewport.zoomTo(currentZoom);
            viewer.viewport.panTo(currentPan);
            console.log("Restored viewport settings:", currentZoom, currentPan);
            
            // Attempt to disable image smoothing again after new image is opened
            if (viewer.drawer) {
                viewer.drawer.setImageSmoothingEnabled(false);
            }

            // Hide progress indicator once the image is loaded
            showNotification(false);
        });
    } else {
        // Initialize a new viewer
        console.log("Initializing new OpenSeadragon viewer");
        initializeOpenSeadragonViewer(dataUrl);
    }
}




// Fixed processImageInWorker function that properly handles COLOR_MAPS and SCALING_FUNCTIONS
function processImageInWorker() {
    // Store current viewport settings before processing
    let viewportSettings = null;
    if (viewer && viewer.viewport) {
        viewportSettings = {
            zoom: viewer.viewport.getZoom(),
            center: viewer.viewport.getCenter()
        };
        console.log("Stored viewport settings:", viewportSettings);
    }
    
    // Show progress indicator
    showNotification(true, 'Processing image...');
    
    try {
        // For very large images, use chunked processing in main thread
        const totalPixels = window.fitsData.width * window.fitsData.height;
        if (totalPixels > 100000000) { // 100 million pixels
            console.log(`Very large image detected: ${window.fitsData.width}x${window.fitsData.height} = ${totalPixels} pixels`);
            console.log('Using chunked processing in main thread for large image');
            processLargeImageInMainThread(viewportSettings);
            return;
        }
        
        // We need to define the color maps and scaling functions directly in the worker code
        const workerCode = `
        self.onmessage = function(e) {
            const fitsData = e.data.fitsData;
            if (!fitsData || !fitsData.data || !fitsData.width || !fitsData.height) {
                self.postMessage({
                    error: 'Invalid FITS data passed to worker'
                });
                return;
            }
            
            const colorMap = e.data.colorMap || 'grayscale';
            const scaling = e.data.scaling || 'linear';
            const width = fitsData.width;
            const height = fitsData.height;
            
            // Create array for image data
            const imageData = new Uint8ClampedArray(width * height * 4);
            
            // Define color maps within the worker
            const COLOR_MAPS = {
                grayscale: (val) => [val, val, val],
                viridis: (val) => {
                    const v = val / 255; let r, g, b;
                    if (v < 0.25) { r = 68 + v * 4 * (33 - 68); g = 1 + v * 4 * (144 - 1); b = 84 + v * 4 * (140 - 84); }
                    else if (v < 0.5) { r = 33 + (v - 0.25) * 4 * (94 - 33); g = 144 + (v - 0.25) * 4 * (201 - 144); b = 140 + (v - 0.25) * 4 * (120 - 140); }
                    else if (v < 0.75) { r = 94 + (v - 0.5) * 4 * (190 - 94); g = 201 + (v - 0.5) * 4 * (222 - 201); b = 120 + (v - 0.5) * 4 * (47 - 120); }
                    else { r = 190 + (v - 0.75) * 4 * (253 - 190); g = 222 + (v - 0.75) * 4 * (231 - 222); b = 47 + (v - 0.75) * 4 * (37 - 47); }
                    return [Math.round(r), Math.round(g), Math.round(b)];
                },
                plasma: (val) => {
                    const v = val / 255; let r, g, b;
                    if (v < 0.25) { r = 13 + v * 4 * (126 - 13); g = 8 + v * 4 * (8 - 8); b = 135 + v * 4 * (161 - 135); }
                    else if (v < 0.5) { r = 126 + (v - 0.25) * 4 * (203 - 126); g = 8 + (v - 0.25) * 4 * (65 - 8); b = 161 + (v - 0.25) * 4 * (107 - 161); }
                    else if (v < 0.75) { r = 203 + (v - 0.5) * 4 * (248 - 203); g = 65 + (v - 0.5) * 4 * (150 - 65); b = 107 + (v - 0.5) * 4 * (58 - 107); }
                    else { r = 248 + (v - 0.75) * 4 * (239 - 248); g = 150 + (v - 0.75) * 4 * (204 - 150); b = 58 + (v - 0.75) * 4 * (42 - 58); }
                    return [Math.round(r), Math.round(g), Math.round(b)];
                },
                // ADDED: Inferno
                inferno: (val) => {
                    const v = val / 255; let r, g, b;
                    if (v < 0.2) { r = 0 + v * 5 * 50; g = 0 + v * 5 * 10; b = 4 + v * 5 * 90; }
                    else if (v < 0.4) { r = 50 + (v-0.2)*5 * (120-50); g = 10 + (v-0.2)*5 * (28-10); b = 94 + (v-0.2)*5 * (109-94); }
                    else if (v < 0.6) { r = 120 + (v-0.4)*5 * (187-120); g = 28 + (v-0.4)*5 * (55-28); b = 109 + (v-0.4)*5 * (84-109); }
                    else if (v < 0.8) { r = 187 + (v-0.6)*5 * (236-187); g = 55 + (v-0.6)*5 * (104-55); b = 84 + (v-0.6)*5 * (36-84); }
                    else { r = 236 + (v-0.8)*5 * (251-236); g = 104 + (v-0.8)*5 * (180-104); b = 36 + (v-0.8)*5 * (26-36); }
                    return [Math.round(r), Math.round(g), Math.round(b)];
                },
                // ADDED: Cividis
                cividis: (val) => {
                    const v = val / 255; let r, g, b;
                    if (v < 0.2) { r = 0 + v*5 * 33; g = 32 + v*5 * (61-32); b = 76 + v*5 * (107-76); }
                    else if (v < 0.4) { r = 33 + (v-0.2)*5 * (85-33); g = 61 + (v-0.2)*5 * (91-61); b = 107 + (v-0.2)*5 * (108-107); }
                    else if (v < 0.6) { r = 85 + (v-0.4)*5 * (123-85); g = 91 + (v-0.4)*5 * (122-91); b = 108 + (v-0.4)*5 * (119-108); }
                    else if (v < 0.8) { r = 123 + (v-0.6)*5 * (165-123); g = 122 + (v-0.6)*5 * (156-122); b = 119 + (v-0.6)*5 * (116-119); }
                    else { r = 165 + (v-0.8)*5 * (217-165); g = 156 + (v-0.8)*5 * (213-156); b = 116 + (v-0.8)*5 * (122-116); }
                    return [Math.round(r), Math.round(g), Math.round(b)];
                },
                hot: (val) => {
                    const v = val / 255; let r, g, b;
                    if (v < 1/3) { r = v * 3 * 255; g = 0; b = 0; } 
                    else if (v < 2/3) { r = 255; g = (v - 1/3) * 3 * 255; b = 0; }
                    else { r = 255; g = 255; b = (v - 2/3) * 3 * 255; }
                    return [Math.round(r), Math.round(g), Math.round(b)];
                },
                // ADDED: Cool
                cool: (val) => {
                    const v = val / 255;
                    return [Math.round(v * 255), Math.round((1 - v) * 255), 255];
                },
                rainbow: (val) => {
                    const v = val / 255; const a = (1 - v) * 4; const X = Math.floor(a); const Y = a - X; let r, g, b;
                    switch(X) {
                        case 0: r = 1.0; g = Y; b = 0.0; break;
                        case 1: r = 1.0 - Y; g = 1.0; b = 0.0; break;
                        case 2: r = 0.0; g = 1.0; b = Y; break;
                        case 3: r = 0.0; g = 1.0-Y; b = 1.0; break;
                        case 4: r = 0.0; g = 0.0; b = 1.0; break;
                    }
                    
                    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
                },
                // ADDED: Jet
                jet: (val) => {
                    const v = val / 255; let r = 0, g = 0, b = 0;
                    if (v < 0.125) { b = 0.5 + 4 * v; } 
                    else if (v < 0.375) { g = 4 * (v - 0.125); b = 1.0; } 
                    else if (v < 0.625) { r = 4 * (v - 0.375); g = 1.0; b = 1.0 - 4 * (v - 0.375); } 
                    else if (v < 0.875) { r = 1.0; g = 1.0 - 4 * (v - 0.625); } 
                    else { r = 1.0 - 4 * (v - 0.875); } 
                    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
                }
            };
            
            // Define scaling functions within the worker
            const SCALING_FUNCTIONS = {
                // Linear scaling (default)
                linear: (val, min, max) => {
                    if (min === max) return 0.5; // Handle edge case
                    return (val - min) / (max - min);
                },
                
                // Logarithmic scaling
                logarithmic: (val, min, max) => {
                    // Ensure we don't take log of zero or negative numbers
                    const minPositive = Math.max(min, 1e-10);
                    const adjustedVal = Math.max(val, minPositive);
                    const logMin = Math.log(minPositive);
                    const logMax = Math.log(max);
                    
                    if (logMin === logMax) return 0.5; // Handle edge case
                    return (Math.log(adjustedVal) - logMin) / (logMax - logMin);
                },
                
                // Square root scaling
                sqrt: (val, min, max) => {
                    if (min === max) return 0.5; // Handle edge case
                    const normalized = (val - min) / (max - min);
                    return Math.sqrt(Math.max(0, normalized));
                },
                
                // Power scaling (gamma = 2)
                power: (val, min, max) => {
                    if (min === max) return 0.5; // Handle edge case
                    const normalized = (val - min) / (max - min);
                    return Math.pow(Math.max(0, normalized), 2);
                },
                
                // Asinh (inverse hyperbolic sine) scaling
                asinh: (val, min, max) => {
                    if (min === max) return 0.5; // Handle edge case
                    
                    // Normalize to -1 to 1 range for asinh
                    const normalized = 2 * ((val - min) / (max - min)) - 1;
                    
                    // Apply asinh and rescale to 0-1
                    const scaled = (Math.asinh(normalized * 3) / Math.asinh(3) + 1) / 2;
                    return Math.max(0, Math.min(1, scaled));
                }
            };
            
            // Process pixels
            let minVal = Infinity;
            let maxVal = -Infinity;
            let nanCount = 0;
            
            // Pre-calculate range for faster scaling
            const minValue = fitsData.min_value;
            const maxValue = fitsData.max_value;
            const colorMapFunc = COLOR_MAPS[colorMap] || COLOR_MAPS.grayscale;
            const scalingFunc = SCALING_FUNCTIONS[scaling] || SCALING_FUNCTIONS.linear;
            
            try {
                // Process in smaller chunks to avoid UI freezes
                const chunkSize = 1000; // Process 1000 rows at a time
                let currentRow = 0;
                
                function processChunk() {
                    const endRow = Math.min(currentRow + chunkSize, height);
                    
                    for (let y = currentRow; y < endRow; y++) {
                        for (let x = 0; x < width; x++) {
                            const idx = (y * width + x) * 4;
                            
                            // Get value and handle NaN/Infinity
                            let val = fitsData.data[y][x];
                            if (isNaN(val) || !isFinite(val)) {
                                nanCount++;
                                val = 0; // Replace NaN/Infinity with 0
                            } else {
                                minVal = Math.min(minVal, val);
                                maxVal = Math.max(maxVal, val);
                            }
                            
                            // Apply scaling using fixed min/max values
                            val = Math.max(minValue, Math.min(val, maxValue));
                            
                            // Apply the selected scaling function
                            const normalizedVal = scalingFunc(val, minValue, maxValue);
                            
                            // Convert to 0-255 range for display
                            const scaledVal = Math.round(normalizedVal * 255);
                            
                            // Apply color map
                            const [r, g, b] = colorMapFunc(scaledVal);
                            
                            // Set RGBA values
                            imageData[idx] = r;     // R
                            imageData[idx + 1] = g; // G
                            imageData[idx + 2] = b; // B
                            imageData[idx + 3] = 255; // A (fully opaque)
                        }
                    }
                    
                    currentRow = endRow;
                    
                    // If we've processed all rows, send the result
                    if (currentRow >= height) {
                        self.postMessage({
                            imageData: imageData.buffer,
                            width: width,
                            height: height,
                            stats: {
                                minVal: minVal,
                                maxVal: maxVal,
                                nanCount: nanCount
                            }
                        }, [imageData.buffer]);  // Transfer the buffer for better performance
                    } else {
                        // Otherwise, schedule the next chunk
                        setTimeout(processChunk, 0);
                    }
                }
                
                // Start processing
                processChunk();
            } catch (error) {
                // Handle any errors
                self.postMessage({
                    error: error.message || 'Error processing image data'
                });
            }
        };
        `;
        
        // Create a blob URL for the worker
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(blob);
        
        // Create and start the worker
        const worker = new Worker(workerUrl);
        
        // Handle errors
        worker.onerror = function(error) {
            console.error('Worker error:', error);
            URL.revokeObjectURL(workerUrl);
            worker.terminate();
            
            // Fall back to main thread processing for large images
            console.log('Worker error - falling back to main thread processing');
            processLargeImageInMainThread(viewportSettings);
        };
        
        // Send data to worker
        if (!window.fitsData || !window.fitsData.data) {
            console.error('Error: No valid FITS data to send to worker');
            URL.revokeObjectURL(workerUrl);
            worker.terminate();
            showNotification(false);
            showNotification('Error: No valid FITS data available', 3000, 'error');
            return;
        }
        
        console.log('Sending data to worker: width=' + window.fitsData.width + ', height=' + window.fitsData.height);
        worker.postMessage({
            fitsData: window.fitsData,
            colorMap: window.currentColorMap || 'grayscale',
            scaling: window.currentScaling || 'linear'
        });
        
        // Handle the worker's response
        worker.onmessage = function(e) {
            const result = e.data;
            
            // Check for errors
            if (result.error) {
                console.error('Worker reported error:', result.error);
                URL.revokeObjectURL(workerUrl);
                worker.terminate();
                
                // Fall back to main thread processing
                console.log('Worker reported error - falling back to main thread processing');
                processLargeImageInMainThread(viewportSettings);
                return;
            }
            
            console.log(`Image data statistics: min=${result.stats.minVal}, max=${result.stats.maxVal}, NaN count=${result.stats.nanCount}`);
            
            // Create a canvas and put the image data on it
            const canvas = document.createElement('canvas');
            canvas.width = result.width;
            canvas.height = result.height;
            
            const ctx = canvas.getContext('2d');
            const imageData = new ImageData(new Uint8ClampedArray(result.imageData), result.width, result.height);
            ctx.putImageData(imageData, 0, 0);
            
            // Convert canvas to data URL
            const dataUrl = canvas.toDataURL('image/png');
            console.log("Created data URL from canvas");
            
            // If viewer already exists, update it; otherwise initialize a new one
            if (viewer) {
                console.log("Updating existing OpenSeadragon viewer");
                
                // Update the image
                viewer.open({
                    type: 'image',
                    url: dataUrl,
                    buildPyramid: false
                });
                
                // Add handler to restore viewport settings immediately when the image is loaded
                viewer.addOnceHandler('open', function() {
                    if (viewportSettings) {
                        viewer.viewport.zoomTo(viewportSettings.zoom);
                        viewer.viewport.panTo(viewportSettings.center);
                        console.log("Restored viewport settings:", viewportSettings);
                    }
                    // Hide progress indicator once the image is loaded
                    showNotification(false);
                });
            } else {
                // Initialize a new viewer
                console.log("Initializing new OpenSeadragon viewer");
                initializeOpenSeadragonViewer(dataUrl);
            }
            
            // Clean up
            URL.revokeObjectURL(workerUrl);
            worker.terminate();
        };
    } catch (error) {
        console.error('Error creating worker:', error);
        // Fall back to main thread processing
        console.log('Error creating worker - falling back to main thread processing');
        processLargeImageInMainThread(viewportSettings);
    }
}




// Fixed large image processor to handle very large files better
function processLargeImageInMainThread(viewportSettings) {
    console.log("Processing large image in main thread with safe chunking");
    showNotification(true, 'Processing large image...');
    
    try {
        // Validate FITS data first
        if (!window.fitsData || !window.fitsData.data || !window.fitsData.width || !window.fitsData.height) {
            throw new Error("Invalid FITS data for large image processing");
        }
        
        // Create a canvas to render the FITS data
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Set canvas dimensions to match the data
        canvas.width = window.fitsData.width;
        canvas.height = window.fitsData.height;
        
        // Create an ImageData object
        const imageData = ctx.createImageData(window.fitsData.width, window.fitsData.height);
        const data = imageData.data;
        
        // Pre-calculate range for scaling - with error protection
        const minValue = window.fitsData.min_value || 0;
        const maxValue = window.fitsData.max_value || 1;
        
        // Get color map function - with fallbacks
        const colorMapFunc = (window.COLOR_MAPS && window.COLOR_MAPS[window.currentColorMap]) || 
                            (window.COLOR_MAPS && window.COLOR_MAPS.grayscale) || 
                            ((val) => [val, val, val]); // Default grayscale
        
        // Get scaling function - with fallbacks
        const scalingFunc = (window.SCALING_FUNCTIONS && window.SCALING_FUNCTIONS[window.currentScaling]) || 
                           (window.SCALING_FUNCTIONS && window.SCALING_FUNCTIONS.linear) || 
                           ((val, min, max) => (val - min) / (max - min)); // Default linear
        
        // Process the image in smaller chunks
        const chunkSize = 50; // Use an even smaller chunk size for extremely large images
        let currentRow = 0;
        
        function processNextChunk() {
            showNotification(true, `Processing large image: ${Math.round((currentRow / window.fitsData.height) * 100)}%`);
            
            const endRow = Math.min(currentRow + chunkSize, window.fitsData.height);
            
            // Process this chunk of rows
            for (let y = currentRow; y < endRow; y++) {
                for (let x = 0; x < window.fitsData.width; x++) {
                    const idx = (y * window.fitsData.width + x) * 4;
                    
                    // Get value with error handling
                    let val;
                    try {
                        val = window.fitsData.data[y][x];
                        // Handle NaN and Infinity
                        if (isNaN(val) || !isFinite(val)) {
                            val = 0;
                        }
                    } catch (e) {
                        val = 0; // Fail gracefully for missing data
                    }
                    
                    // Apply scaling using min/max values
                    val = Math.max(minValue, Math.min(val, maxValue));
                    
                    // Apply scaling function with error handling
                    let normalizedVal;
                    try {
                        normalizedVal = scalingFunc(val, minValue, maxValue);
                        // Verify result is valid
                        if (isNaN(normalizedVal) || !isFinite(normalizedVal)) {
                            normalizedVal = 0;
                        }
                    } catch (e) {
                        normalizedVal = 0;
                    }
                    
                    // Convert to 0-255 range
                    const scaledVal = Math.min(255, Math.max(0, Math.round(normalizedVal * 255)));
                    
                    // Apply color map with error handling
                    let r = scaledVal, g = scaledVal, b = scaledVal;
                    try {
                        const rgb = colorMapFunc(scaledVal);
                        r = rgb[0];
                        g = rgb[1];
                        b = rgb[2];
                    } catch (e) {
                        // Fall back to grayscale
                    }
                    
                    // Set RGBA values
                    data[idx] = r;
                    data[idx + 1] = g;
                    data[idx + 2] = b;
                    data[idx + 3] = 255;
                }
            }
            
            currentRow = endRow;
            
            // If we've processed all rows, finish up
            if (currentRow >= window.fitsData.height) {
                finishProcessing();
            } else {
                // Otherwise schedule the next chunk with a longer delay for very large images
                // This gives the browser more time to process UI events
                setTimeout(processNextChunk, 20);
            }
        }
        
        function finishProcessing() {
            try {
                // Put the image data on the canvas
                ctx.putImageData(imageData, 0, 0);
                
                // Convert canvas to data URL
                const dataUrl = canvas.toDataURL('image/png');
                console.log("Created data URL from canvas for large image");
                
                // If viewer already exists, update it; otherwise initialize a new one
                if (viewer) {
                    console.log("Updating existing OpenSeadragon viewer");
                    
                    // Update the image
                    viewer.open({
                        type: 'image',
                        url: dataUrl,
                        buildPyramid: false
                    });
                    
                    // Add handler to restore viewport settings immediately when the image is loaded
                    viewer.addOnceHandler('open', function() {
                        if (viewportSettings) {
                            viewer.viewport.zoomTo(viewportSettings.zoom);
                            viewer.viewport.panTo(viewportSettings.center);
                            console.log("Restored viewport settings:", viewportSettings);
                        }
                        // Hide progress indicator once the image is loaded
                        showNotification(false);
                    });
                } else {
                    // Initialize a new viewer optimized for large images
                    console.log("Initializing new OpenSeadragon viewer for large image");
                    initializeOpenSeadragonViewer(dataUrl, true); // true indicates this is a large image
                }
            } catch (error) {
                console.error("Error finalizing large image processing:", error);
                showNotification(false);
                showNotification('Error processing large image: ' + error.message, 5000, 'error');
            }
        }
        
        // Start processing
        processNextChunk();
    } catch (error) {
        console.error("Critical error in large image processor:", error);
        showNotification(false);
        showNotification(`Error processing image: ${error.message}. Please try a different file.`, 5000, 'error');
    }
}



// Helper function to close all popups
function closeAllInfoPopups() {
    if (window.infoPopups && window.infoPopups.length > 0) {
        // Create a copy of the array to avoid issues with array modification during iteration
        const popupsToClose = [...window.infoPopups];
        popupsToClose.forEach(popup => {
            if (popup && popup.style.display !== 'none') {
                hideInfoPopup(popup);
            }
        });
    }
}

// Modified hideInfoPopup that ensures proper cleanup for re-clicking
function hideInfoPopup(popup) {
    if (!popup) return;
    
    // Start the closing animation
    popup.style.transition = 'opacity 0.2s ease-out';
    popup.style.opacity = '0';
    
    // Complete the cleanup after animation finishes
    setTimeout(() => {
        // Clean up the temporary dot if it exists
        if (popup.tempDot && popup.tempDot.parentNode) {
            popup.tempDot.parentNode.removeChild(popup.tempDot);
        }
        
        // Hide the popup
        popup.style.display = 'none';
        
        // IMPORTANT: Clear the highlighting to allow re-clicking
        if (popup.dataset.dotIndex) {
            const dotIndex = parseInt(popup.dataset.dotIndex);
            
            // Only clear if this popup's region is currently highlighted
            if (window.currentHighlightedSourceIndex === dotIndex) {
                window.currentHighlightedSourceIndex = -1;
                
                // Redraw canvas to remove highlighting
                if (typeof canvasUpdateOverlay === 'function') {
                    canvasUpdateOverlay();
                }
            }
            
            // Restore original style of the highlighted dot (for DOM dots if you're using them)
            if (window.catalogDots && dotIndex >= 0 && dotIndex < window.catalogDots.length) {
                const dot = window.catalogDots[dotIndex];
                dot.style.border = dot.dataset.originalBorder || '1px solid rgba(255, 0, 0, 0.7)';
                dot.style.zIndex = dot.dataset.originalZIndex || 'auto';
            }
        }
        
        // Remove from DOM and array
        if (popup.parentNode) {
            popup.parentNode.removeChild(popup);
        }
        
        // Remove from array
        const index = infoPopups.indexOf(popup);
        if (index !== -1) {
            infoPopups.splice(index, 1);
        }
    }, 200); // Match the transition duration
}

// Also add this function to handle clicks on regions
function handleRegionClick(sourceIndex) {
    // Always allow clicking, even if the same region is highlighted
    // This ensures the popup can be reopened after closing
    
    // Set the new highlighted source
    window.currentHighlightedSourceIndex = sourceIndex;
    
    // Trigger canvas redraw to show highlighting
    if (typeof canvasUpdateOverlay === 'function') {
        canvasUpdateOverlay();
    }
    
    // Open the popup (your existing popup creation logic should go here)
    // For example:
    // showInfoPopup(sourceIndex);
}

// Alternative: If you want to ensure clicks always work, add this to your click handler
function ensureClickable() {
    // This function can be called before handling any region clicks
    // to ensure the system is in a clean state
    
    // Close any existing popups first
    if (window.infoPopups && window.infoPopups.length > 0) {
        window.infoPopups.forEach(popup => {
            if (popup.style.display !== 'none') {
                hideInfoPopup(popup);
            }
        });
    }
    
    // Clear highlighting
    window.currentHighlightedSourceIndex = -1;
    
    // Redraw canvas
    if (typeof canvasUpdateOverlay === 'function') {
        canvasUpdateOverlay();
    }
}

// Add this function to wrap the original hideInfoPopup function
const originalHideInfoPopup = window.hideInfoPopup;
window.hideInfoPopup = function(popup) {
    // Clean up the temporary dot if it exists
    if (popup && popup.tempDot && popup.tempDot.parentNode) {
        popup.tempDot.parentNode.removeChild(popup.tempDot);
    }
    
    // Call the original function
    return originalHideInfoPopup(popup);
};

// Hide all info popups
function hideAllInfoPopups() {
    // Make a copy of the array since we'll be modifying it while iterating
    const popupsCopy = [...infoPopups];
    
    // Hide each popup
    for (let popup of popupsCopy) {
        hideInfoPopup(popup);
    }
    
    // Clear the array (should already be empty, but just to be safe)
    infoPopups = [];
}


// Throttle function to limit how often a function can be called
function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// Debounce function to delay execution until after a period of inactivity
function debounce(func, delay) {
    let timeout;
    return function() {
        const context = this;
        const args = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}


// After the document ready function, add a new function to create the dynamic range control
function createDynamicRangeControl() {
    // Create a button for dynamic range adjustment
    const dynamicRangeButton = document.createElement('button');
    dynamicRangeButton.className = 'dynamic-range-button';
    dynamicRangeButton.title = 'Adjust Dynamic Range';
    
    // Create histogram icon using SVG
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.style.fill = "currentColor";
    
    // Create histogram bars
    const bars = [
        { x: 2, y: 14, width: 3, height: 6 },
        { x: 7, y: 8, width: 3, height: 12 },
        { x: 12, y: 12, width: 3, height: 8 },
        { x: 17, y: 6, width: 3, height: 14 }
    ];
    
    bars.forEach(bar => {
        const rect = document.createElementNS(svgNS, "rect");
        rect.setAttribute("x", bar.x);
        rect.setAttribute("y", bar.y);
        rect.setAttribute("width", bar.width);
        rect.setAttribute("height", bar.height);
        svg.appendChild(rect);
    });
    
    dynamicRangeButton.appendChild(svg);
    
    // Add event listener
    dynamicRangeButton.addEventListener('click', showDynamicRangePopup);
    
    // Find the toolbar and the first button (zoomIn)
    const toolbar = document.querySelector('.toolbar');
    const zoomInButton = toolbar.querySelector('button:first-child');
    
    // Insert the dynamic range button before the zoom in button (to its left)
    if (zoomInButton) {
        zoomInButton.insertAdjacentElement('beforebegin', dynamicRangeButton);
    } else {
        // Fallback: just prepend to the toolbar
        toolbar.prepend(dynamicRangeButton);
    }
}

// PASTE THE FOLLOWING CODE INTO static/main.js, REPLACING THE EXISTING showDynamicRangePopup function

function showDynamicRangePopup() {
    console.log("showDynamicRangePopup called.");
    const isTiledViewActive = !!(window.tiledViewer && typeof window.tiledViewer.isOpen === 'function' && window.tiledViewer.isOpen());
    console.log(`isTiledViewActive: ${isTiledViewActive}`);

    if (!window.fitsData || typeof window.fitsData.min_value === 'undefined' || typeof window.fitsData.max_value === 'undefined') {
        showNotification('Image metadata not loaded. Please load an image first.', 3000, 'warning');
        return;
    }

    if (!isTiledViewActive && (!window.fitsData.data || (Array.isArray(window.fitsData.data) && window.fitsData.data.length === 0))) {
        showNotification('Image pixel data not available for local histogram. Please wait or reload.', 3000, 'warning');
        return;
    }
    console.log("All checks passed in showDynamicRangePopup, proceeding to show popup.");

    let popup = document.getElementById('dynamic-range-popup');
    const titleElementId = 'dynamic-range-popup-title'; // For drag handling

    if (popup) {
        popup.style.display = 'block';
        const minInput = document.getElementById('min-range-input');
        const maxInput = document.getElementById('max-range-input');
        if (minInput && maxInput && window.fitsData) {
            minInput.value = window.fitsData.min_value.toFixed(2);
            maxInput.value = window.fitsData.max_value.toFixed(2);
        }
        requestHistogramUpdate();
        return;
    }

    popup = document.createElement('div');
    popup.id = 'dynamic-range-popup';
    popup.style.position = 'fixed';
    popup.style.top = '50%';
    popup.style.left = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
    popup.style.backgroundColor = '#333';
    popup.style.border = '1px solid #555';
    popup.style.borderRadius = '5px';
    popup.style.padding = '15px';
    popup.style.zIndex = '1000';
    popup.style.width = '500px'; // Keep reasonable width
    popup.style.boxSizing = 'border-box';
    popup.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)';

    const title = document.createElement('h3');
    title.id = titleElementId;
    title.textContent = 'Dynamic Range Control';
    title.style.margin = '0 0 15px 0';
    title.style.color = '#fff';
    title.style.fontFamily = 'Arial, sans-serif';
    title.style.fontSize = '18px';
    title.style.fontWeight = 'bold';
    title.style.borderBottom = '1px solid #555';
    title.style.paddingBottom = '10px';
    title.style.cursor = 'grab'; // Indicate title is draggable

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

    // Draggable functionality for the entire popup
    let offsetX, offsetY;
    const dragMouseDown = (e) => {
        if (e.button !== 0) return; // Only drag with left mouse button

        let target = e.target;
        let allowDrag = false;

        // Allow dragging if mousedown is on the popup background or its title
        if (target === popup || target === title) {
            allowDrag = true;
        }

        // Prevent dragging if clicking on specific interactive child elements
        const nonDragTags = ['INPUT', 'BUTTON', 'SELECT', 'CANVAS'];
        if (nonDragTags.includes(target.tagName) || 
            target.closest('.custom-dropdown-option') || 
            target === closeButton || // Explicitly prevent drag on close button
            (target.style && target.style.cursor === 'pointer') // General check for pointer cursor elements
           ) {
            allowDrag = false;
        }
        
        if (!allowDrag) return;

        e.preventDefault(); // Prevent text selection and other default behaviors

        // If popup is centered with transform, convert to pixel values
        if (popup.style.transform.includes('translate')) {
            const rect = popup.getBoundingClientRect();
            popup.style.top = `${rect.top}px`;
            popup.style.left = `${rect.left}px`;
            popup.style.transform = 'none';
        }

        offsetX = e.clientX - popup.offsetLeft;
        offsetY = e.clientY - popup.offsetTop;
        title.style.cursor = 'grabbing'; // Change cursor on title during drag
        popup.style.cursor = 'grabbing'; // Change cursor on popup during drag


        document.addEventListener('mousemove', elementDrag);
        document.addEventListener('mouseup', closeDragElement);
    };

    const elementDrag = (e) => {
        e.preventDefault();
        popup.style.top = (e.clientY - offsetY) + 'px';
        popup.style.left = (e.clientX - offsetX) + 'px';
    };

    const closeDragElement = () => {
        document.removeEventListener('mouseup', closeDragElement);
        document.removeEventListener('mousemove', elementDrag);
        title.style.cursor = 'grab'; // Restore cursor
        popup.style.cursor = 'default'; // Restore cursor
    };

    popup.addEventListener('mousedown', dragMouseDown);


    const canvasContainer = document.createElement('div');
    canvasContainer.style.width = '100%';
    canvasContainer.style.height = '200px';
    canvasContainer.style.marginBottom = '15px';
    canvasContainer.style.backgroundColor = '#222';
    canvasContainer.style.borderRadius = '3px';
    canvasContainer.style.position = 'relative';

    const bgCanvas = document.createElement('canvas');
    bgCanvas.id = 'histogram-bg-canvas';
    bgCanvas.width = 470; // Adjusted for padding within 500px popup
    bgCanvas.height = 200;
    bgCanvas.style.display = 'block';
    bgCanvas.style.position = 'absolute';
    bgCanvas.style.left = '0';
    bgCanvas.style.top = '0';
    bgCanvas.style.zIndex = '1';

    const linesCanvas = document.createElement('canvas');
    linesCanvas.id = 'histogram-lines-canvas';
    linesCanvas.width = 470;
    linesCanvas.height = 200;
    linesCanvas.style.display = 'block';
    linesCanvas.style.position = 'absolute';
    linesCanvas.style.left = '0';
    linesCanvas.style.top = '0';
    linesCanvas.style.zIndex = '2';
    linesCanvas.style.pointerEvents = 'auto';
    linesCanvas.style.touchAction = 'none';

    canvasContainer.appendChild(bgCanvas);
    canvasContainer.appendChild(linesCanvas);

    const percentileContainer = document.createElement('div');
    percentileContainer.style.display = 'flex';
    percentileContainer.style.justifyContent = 'space-between';
    percentileContainer.style.marginBottom = '15px';

    const percentiles = [
        { label: '99.9%', value: 0.999 }, { label: '99%', value: 0.99 },
        { label: '95%', value: 0.95 }, { label: '90%', value: 0.90 }
    ];
    percentiles.forEach(p => {
        const button = document.createElement('button');
        button.textContent = p.label;
        button.style.flex = '1';
        button.style.margin = '0 2px'; // Reduced margin
        button.style.padding = '8px 0';
        button.style.backgroundColor = '#444';
        button.style.color = '#fff';
        button.style.border = 'none';
        button.style.borderRadius = '3px';
        button.style.cursor = 'pointer';
        button.style.fontFamily = 'Arial, sans-serif';
        button.style.fontSize = '13px'; // Slightly smaller font
        button.addEventListener('mouseover', () => button.style.backgroundColor = '#555');
        button.addEventListener('mouseout', () => button.style.backgroundColor = '#444');
        button.addEventListener('click', () => applyPercentile(p.value));
        percentileContainer.appendChild(button);
    });

    const inputContainer = document.createElement('div');
    inputContainer.style.display = 'flex';
    inputContainer.style.alignItems = 'center';
    inputContainer.style.marginBottom = '15px';

    const minLabel = document.createElement('label');
    minLabel.textContent = 'Min:'; minLabel.style.color = '#aaa'; minLabel.style.marginRight = '5px'; minLabel.style.fontSize = '14px';
    const minInput = document.createElement('input');
    minInput.id = 'min-range-input'; minInput.type = 'text';
    Object.assign(minInput.style, { flex: '1', backgroundColor: '#444', color: '#fff', border: '1px solid #555', borderRadius: '3px', padding: '5px', marginRight: '10px', fontFamily: 'monospace', fontSize: '14px' });

    const maxLabel = document.createElement('label');
    maxLabel.textContent = 'Max:'; maxLabel.style.color = '#aaa'; maxLabel.style.marginRight = '5px'; maxLabel.style.fontSize = '14px';
    const maxInput = document.createElement('input');
    maxInput.id = 'max-range-input'; maxInput.type = 'text';
    Object.assign(maxInput.style, { flex: '1', backgroundColor: '#444', color: '#fff', border: '1px solid #555', borderRadius: '3px', padding: '5px', fontFamily: 'monospace', fontSize: '14px' });

    if (window.fitsData) {
        minInput.value = window.fitsData.min_value.toFixed(2);
        maxInput.value = window.fitsData.max_value.toFixed(2);
    }
    const debouncedHistogramUpdate = debounce(requestHistogramUpdate, 150);
    minInput.addEventListener('input', debouncedHistogramUpdate);
    maxInput.addEventListener('input', debouncedHistogramUpdate);

    inputContainer.appendChild(minLabel); inputContainer.appendChild(minInput);
    inputContainer.appendChild(maxLabel); inputContainer.appendChild(maxInput);

    // Helper function to create searchable dropdown
    function createSearchableDropdown(labelText, selectId, optionsArray, globalVarName, defaultSelectedValue, hasSwatches = false) {
        const container = document.createElement('div');
        container.style.marginBottom = '10px'; // Spacing between dropdowns
        container.style.display = 'flex';
        container.style.flexDirection = 'column';

        const label = document.createElement('label');
        label.textContent = labelText;
        Object.assign(label.style, { color: '#aaa', fontFamily: 'Arial, sans-serif', fontSize: '14px', alignSelf: 'flex-start', marginBottom: '5px' });

        const customSelectContainer = document.createElement('div');
        Object.assign(customSelectContainer.style, { width: '100%', position: 'relative' });

        const selectedOptionDisplay = document.createElement('div');
        Object.assign(selectedOptionDisplay.style, { display: 'flex', alignItems: 'center', padding: '8px 10px', backgroundColor: '#444', color: '#fff', border: '1px solid #555', borderRadius: '3px', cursor: 'pointer', fontFamily: 'Arial, sans-serif', fontSize: '14px', justifyContent: 'space-between' });

        const selectedSwatch = document.createElement('div');
        if (hasSwatches) {
            Object.assign(selectedSwatch.style, { width: '60px', height: '15px', marginRight: '10px', borderRadius: '2px', background: 'linear-gradient(to right, #000, #fff)' });
        }
        const selectedText = document.createElement('span');
        selectedText.style.flex = '1';
        const dropdownArrow = document.createElement('span');
        dropdownArrow.textContent = '▼'; dropdownArrow.style.marginLeft = '10px'; dropdownArrow.style.fontSize = '10px';

        if (hasSwatches) selectedOptionDisplay.appendChild(selectedSwatch);
        selectedOptionDisplay.appendChild(selectedText);
        selectedOptionDisplay.appendChild(dropdownArrow);

        const optionsOuterContainer = document.createElement('div'); // Needed for border around search + list
        Object.assign(optionsOuterContainer.style, { position: 'absolute', top: '100%', left: '0', width: '100%', backgroundColor: '#3a3a3a', border: '1px solid #555', borderRadius: '0 0 3px 3px', zIndex: '20', display: 'none', borderTop:'none' });


        const searchInput = document.createElement('input');
        searchInput.type = 'text'; searchInput.placeholder = `Search ${labelText.toLowerCase().replace(':', '')}...`;
        Object.assign(searchInput.style, { width: 'calc(100% - 0px)', padding: '8px 10px', margin: '0', border: 'none', borderBottom: '1px solid #555', borderRadius: '0', backgroundColor: '#3a3a3a', color: '#fff', boxSizing: 'border-box' });
        
        const optionsListContainer = document.createElement('div');
        Object.assign(optionsListContainer.style, { maxHeight: '150px', overflowY: 'auto' });


        searchInput.addEventListener('input', () => {
            const filter = searchInput.value.toLowerCase();
            const options = optionsListContainer.querySelectorAll('.custom-dropdown-option');
            options.forEach(option => {
                const text = option.dataset.label.toLowerCase(); // Use data-label for searching
                option.style.display = text.includes(filter) ? (hasSwatches ? 'flex' : 'block') : 'none';
            });
        });
        
        optionsOuterContainer.appendChild(searchInput);
        optionsOuterContainer.appendChild(optionsListContainer);


        const hiddenSelect = document.createElement('select');
        hiddenSelect.id = selectId; hiddenSelect.style.display = 'none';

        let currentSelectionValue = window[globalVarName] || defaultSelectedValue;
        const initialSelection = optionsArray.find(opt => opt.value === currentSelectionValue) || optionsArray.find(opt => opt.value === defaultSelectedValue);
        if (initialSelection) {
            selectedText.textContent = initialSelection.label;
            if (hasSwatches && initialSelection.gradient) selectedSwatch.style.background = initialSelection.gradient;
        }


        optionsArray.forEach(opt => {
            const optionEl = document.createElement('option');
            optionEl.value = opt.value; optionEl.textContent = opt.label;
            if (opt.value === currentSelectionValue) optionEl.selected = true;
            hiddenSelect.appendChild(optionEl);

            const visualOption = document.createElement('div');
            visualOption.classList.add('custom-dropdown-option');
            visualOption.dataset.value = opt.value;
            visualOption.dataset.label = opt.label; // Store label for search
            Object.assign(visualOption.style, { padding: '8px 10px', cursor: 'pointer', borderBottom: '1px solid #505050', display: hasSwatches ? 'flex' : 'block', alignItems: hasSwatches ? 'center' : 'normal', color:'#fff' });
            if (opt.value === currentSelectionValue) visualOption.style.backgroundColor = '#555';


            if (hasSwatches) {
                const swatch = document.createElement('div');
                Object.assign(swatch.style, { minWidth: '60px', width: '60px', height: '15px', marginRight: '10px', borderRadius: '2px', background: opt.gradient || '#ccc' });
                visualOption.appendChild(swatch);
            }
            const textSpan = document.createElement('span'); textSpan.textContent = opt.label;
            visualOption.appendChild(textSpan);

            visualOption.addEventListener('mouseover', () => visualOption.style.backgroundColor = '#555');
            visualOption.addEventListener('mouseout', () => {
                if (visualOption.dataset.value !== currentSelectionValue) visualOption.style.backgroundColor = 'transparent';
            });
            visualOption.addEventListener('click', () => {
                hiddenSelect.value = opt.value;
                selectedText.textContent = opt.label;
                if (hasSwatches && opt.gradient) selectedSwatch.style.background = opt.gradient;
                currentSelectionValue = opt.value;
                window[globalVarName] = opt.value; // Update global variable

                optionsListContainer.querySelectorAll('.custom-dropdown-option').forEach(vOpt => {
                    vOpt.style.backgroundColor = vOpt.dataset.value === currentSelectionValue ? '#555' : 'transparent';
                });
                optionsOuterContainer.style.display = 'none';
                const event = new Event('change');
                hiddenSelect.dispatchEvent(event);
                console.log(`${labelText} changed to: ${window[globalVarName]}`);
            });
            optionsListContainer.appendChild(visualOption);
        });
        // Remove border from last item
        if(optionsListContainer.lastChild && optionsListContainer.lastChild.style) optionsListContainer.lastChild.style.borderBottom = 'none';


        selectedOptionDisplay.addEventListener('click', () => {
            const isOpen = optionsOuterContainer.style.display === 'block';
            if (!isOpen) {
                optionsOuterContainer.style.display = 'block';
                searchInput.value = ''; // Clear search
                optionsListContainer.querySelectorAll('.custom-dropdown-option').forEach(opt => opt.style.display = hasSwatches ? 'flex' : 'block'); // Show all
                searchInput.focus();

                // Dropdown position adjustment
                optionsOuterContainer.style.top = '100%'; // Default open downwards
                optionsOuterContainer.style.bottom = 'auto';
                optionsOuterContainer.style.maxHeight = hasSwatches ? '240px' : '180px'; // Default max height

                const parentRect = customSelectContainer.getBoundingClientRect();
                const dropdownRect = optionsOuterContainer.getBoundingClientRect(); // Get rect after display block

                if (dropdownRect.bottom > window.innerHeight) { // If overflows viewport bottom
                    if (parentRect.top - dropdownRect.height > 0) { // Enough space to open upwards?
                        optionsOuterContainer.style.top = 'auto';
                        optionsOuterContainer.style.bottom = '100%';
                    } else { // Not enough space upwards, adjust max-height to fit downwards
                        const availableHeight = window.innerHeight - parentRect.bottom - 10; // 10px buffer
                        optionsOuterContainer.style.maxHeight = `${Math.max(50, availableHeight)}px`; // Min 50px height
                    }
                }

            } else {
                optionsOuterContainer.style.display = 'none';
            }
        });
        
        customSelectContainer.appendChild(selectedOptionDisplay);
        customSelectContainer.appendChild(optionsOuterContainer);
        customSelectContainer.appendChild(hiddenSelect);
        hiddenSelect.addEventListener('change', () => { // Ensure global var updates if changed externally
            window[globalVarName] = hiddenSelect.value;
             const selOpt = optionsArray.find(o => o.value === hiddenSelect.value);
             if(selOpt) {
                selectedText.textContent = selOpt.label;
                if (hasSwatches && selOpt.gradient) selectedSwatch.style.background = selOpt.gradient;
             }
        });

        container.appendChild(label);
        container.appendChild(customSelectContainer);
        return container;
    }

    // Define colormaps and scaling functions
    const colorMaps = [
        { value: 'grayscale', label: 'Grayscale', gradient: 'linear-gradient(to right, #000, #fff)' },
        { value: 'viridis', label: 'Viridis', gradient: 'linear-gradient(to right, #440154, #414487, #2a788e, #22a884, #7ad151, #fde725)' },
        { value: 'plasma', label: 'Plasma', gradient: 'linear-gradient(to right, #0d0887, #5302a3, #8b0aa5, #b83289, #db5c68, #f48849, #febc2a)' },
        { value: 'inferno', label: 'Inferno', gradient: 'linear-gradient(to right, #000004, #320a5a, #781c6d, #bb3754, #ec6824, #fbb41a)' },
        { value: 'cividis', label: 'Cividis', gradient: 'linear-gradient(to right, #00204c, #213d6b, #555b6c, #7b7a77, #a59c74, #d9d57a)' },
        { value: 'hot', label: 'Hot', gradient: 'linear-gradient(to right, #000, #f00, #ff0, #fff)' },
        { value: 'cool', label: 'Cool', gradient: 'linear-gradient(to right, #00f, #0ff, #0f0)' }, // Corrected cool gradient
        { value: 'rainbow', label: 'Rainbow', gradient: 'linear-gradient(to right, #6e40aa, #be3caf, #fe4b83, #ff7847, #e2b72f, #aff05b)' },
        { value: 'jet', label: 'Jet', gradient: 'linear-gradient(to right, #00008f, #0020ff, #00ffff, #51ff77, #fdff00, #ff0000, #800000)' }
    ];
    const scalingFunctions = [
        { value: 'linear', label: 'Linear' }, { value: 'logarithmic', label: 'Logarithmic' },
        { value: 'sqrt', label: 'Square Root' }, { value: 'power', label: 'Power (10^x)' }, // Corrected Power label
        { value: 'asinh', label: 'Asinh' }
    ];

    const colorMapDropdown = createSearchableDropdown('Color Map:', 'color-map-select', colorMaps, 'currentColorMap', 'grayscale', true);
    const scalingDropdown = createSearchableDropdown('Scaling:', 'scaling-select', scalingFunctions, 'currentScaling', 'linear', false);
    
    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
        const cmDropdown = colorMapDropdown.querySelector('.custom-select-container > div[style*="display: block"]'); // More specific selector
        const scDropdown = scalingDropdown.querySelector('.custom-select-container > div[style*="display: block"]');
        
        if (cmDropdown && !colorMapDropdown.querySelector('.custom-select-container').contains(e.target)) {
            cmDropdown.style.display = 'none';
        }
        if (scDropdown && !scalingDropdown.querySelector('.custom-select-container').contains(e.target)) {
            scDropdown.style.display = 'none';
        }
    });


    const controlsContainer = document.createElement('div');
    controlsContainer.style.display = 'flex';
    controlsContainer.style.flexDirection = 'row'; // Arrange side-by-side
    controlsContainer.style.justifyContent = 'space-between';
    controlsContainer.style.gap = '15px'; // Add gap between dropdowns

    const leftColumn = document.createElement('div');
    leftColumn.style.flex = '1';
    leftColumn.appendChild(colorMapDropdown);

    const rightColumn = document.createElement('div');
    rightColumn.style.flex = '1';
    rightColumn.appendChild(scalingDropdown);

    controlsContainer.appendChild(leftColumn);
    controlsContainer.appendChild(rightColumn);


    const buttonsContainer = document.createElement('div');
    buttonsContainer.style.display = 'flex';
    buttonsContainer.style.justifyContent = 'flex-end';
    buttonsContainer.style.marginTop = '20px';

    const resetButton = document.createElement('button');
    resetButton.textContent = 'Reset';
    Object.assign(resetButton.style, { padding: '8px 15px', backgroundColor: '#555', color: '#fff', border: 'none', borderRadius: '3px', cursor: 'pointer', marginRight: '10px', fontFamily: 'Arial, sans-serif', fontSize: '14px' });
    resetButton.addEventListener('mouseover', () => resetButton.style.backgroundColor = '#666');
    resetButton.addEventListener('mouseout', () => resetButton.style.backgroundColor = '#555');
    resetButton.addEventListener('click', resetDynamicRange);

    const applyButton = document.createElement('button');
    applyButton.textContent = 'Apply';
    Object.assign(applyButton.style, { padding: '8px 15px', backgroundColor: '#007bff', color: '#fff', border: 'none', borderRadius: '3px', cursor: 'pointer', fontFamily: 'Arial, sans-serif', fontSize: '14px' });
    applyButton.addEventListener('mouseover', () => applyButton.style.backgroundColor = '#0056b3');
    applyButton.addEventListener('mouseout', () => applyButton.style.backgroundColor = '#007bff');
    applyButton.addEventListener('click', applyDynamicRange);

    buttonsContainer.appendChild(resetButton);
    buttonsContainer.appendChild(applyButton);

    popup.appendChild(title);
    popup.appendChild(closeButton);
    popup.appendChild(canvasContainer);
    popup.appendChild(percentileContainer);
    popup.appendChild(inputContainer);
    popup.appendChild(controlsContainer); // Add new container for dropdowns
    popup.appendChild(buttonsContainer);
    document.body.appendChild(popup);

    addHistogramInteraction(linesCanvas, minInput, maxInput);
    requestHistogramUpdate(); // Initial histogram draw
}
// END OF REPLACEMENT CODE
// Function to apply the new dynamic range
function applyDynamicRange() {
    const minInput = document.getElementById('min-range-input');
    const maxInput = document.getElementById('max-range-input');
    const colorMapSelect = document.getElementById('color-map-select');
    const scalingSelect = document.getElementById('scaling-select');
    
    if (!minInput || !maxInput) {
        console.error('Min/max input fields not found');
        return;
    }
    
    const minValue = parseFloat(minInput.value);
    const maxValue = parseFloat(maxInput.value);
    
    if (isNaN(minValue) || isNaN(maxValue)) {
        showNotification('Invalid min/max values', 2000, 'error');
        return;
    }
    
    if (minValue >= maxValue) {
        showNotification('Min value must be less than max value', 2000, 'error');
        return;
    }
    
    console.log(`Applying dynamic range: ${minValue} to ${maxValue}`);
    
    if (!window.fitsData) {
        console.error('No FITS data available in global scope for applyDynamicRange');
        showNotification('No image data available. Please load an image first.', 3000, 'error');
        return;
    }
    
    // Update the dynamic range in the FITS data (client-side copy)
    window.fitsData.min_value = minValue;
    window.fitsData.max_value = maxValue;
    
    // Apply color map if selected
    if (colorMapSelect) {
        window.currentColorMap = colorMapSelect.value;
    }
    
    // Apply scaling if selected
    if (scalingSelect) {
        window.currentScaling = scalingSelect.value;
    }

    const isTiledViewActive = window.tiledViewer && window.tiledViewer.isOpen && window.tiledViewer.isOpen();

    if (isTiledViewActive) {
        console.log("Applying dynamic range to tiled viewer");
        showNotification(true, 'Updating tiled view...');
        fetch('/update-dynamic-range/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                min_value: minValue,
                max_value: maxValue,
                color_map: window.currentColorMap,
                scaling_function: window.currentScaling,
                file_id: window.currentLoadedFitsFileId 
            })
        })
        .then(response => {
            if (!response.ok) { // Check if response status is indicative of an error
                throw new Error(`Server error: ${response.status} ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            // The original server endpoint might not return a JSON with an 'error' field
            // if it's a simple 200 OK. The check above is more important.
            if (data.error) { // This is if the server *successfully* responds with a JSON containing an error message
                console.error('Error updating tiled view dynamic range:', data.error);
                showNotification('Error updating tiled view: ' + data.error, 3000, 'error');
            } else {
                console.log("Server dynamic range updated. Re-opening OpenSeadragon tile source to reflect changes.");
                currentDynamicRangeVersion = Date.now(); // Update the version for new tile URLs

                if (window.tiledViewer && currentTileInfo) {
                    // Store current viewport
                    const currentZoom = window.tiledViewer.viewport.getZoom();
                    const currentPan = window.tiledViewer.viewport.getCenter();
                    console.log("Storing viewport:", { zoom: currentZoom, pan: currentPan });

                    const newTileSourceOptions = {
                        width: currentTileInfo.width,
                        height: currentTileInfo.height,
                        tileSize: currentTileInfo.tileSize,
                        maxLevel: currentTileInfo.maxLevel,
                        getTileUrl: function(level, x, y) {
                            // Ensure this function uses the LATEST currentDynamicRangeVersion
                            return `/fits-tile/${level}/${x}/${y}?v=${currentDynamicRangeVersion}`;
                        },
                        getLevelScale: function(level) { // Copied from initializeTiledViewer
                            return 1 / (1 << (this.maxLevel - level));
                        }
                        // Ensure other necessary tileSource properties from initializeTiledViewer are included
                        // if they are essential for it to work correctly.
                    };
                    window.tiledViewer.open(newTileSourceOptions);

                    // Restore viewport after new tile source is opened
                    window.tiledViewer.addOnceHandler('open', function() {
                        console.log("New tile source opened, restoring viewport:", { zoom: currentZoom, pan: currentPan });
                        window.tiledViewer.viewport.zoomTo(currentZoom, null, true); // true for immediate
                        window.tiledViewer.viewport.panTo(currentPan, true);       // true for immediate
                        
                        // Re-apply image smoothing
                        if (window.tiledViewer.drawer) {
                            window.tiledViewer.drawer.setImageSmoothingEnabled(false);
                        }
                        console.log("Viewport restored and image smoothing re-applied.");
                    });

                    showNotification('Dynamic range applied.', 1000, 'success');
                } else {
                    console.error("Cannot re-open tile source: tiledViewer or currentTileInfo missing.");
                    showNotification('Error refreshing tiled view display. Viewer or tile info missing.', 3000, 'error');
                    // Fallback: Try force redraw if open fails to be set up
                    if (window.tiledViewer) {
                        window.tiledViewer.forceRedraw();
                    }
                }
            }
            showNotification(false);
        })
        .catch(error => { // This catches network errors or the error thrown from !response.ok
            console.error('Error updating tiled view dynamic range:', error);
            showNotification(false);
            showNotification(`Failed to update dynamic range on server: ${error.message}`, 4000, 'error');
        });
    } else {
        // For non-tiled views, refresh the image locally
        console.log("Applying dynamic range to non-tiled viewer");
        refreshImage(); // This will use window.fitsData.min_value, max_value, currentColorMap, currentScaling
    }
    
    // Update the histogram display (this should now work for both modes)
    requestHistogramUpdate();
}

function resetDynamicRange() {
    if (!window.fitsData) {
        showNotification('Image metadata not loaded. Cannot reset dynamic range.', 3000, 'warning');
        return;
    }

    let minValue, maxValue;
    const isTiledViewActive = window.tiledViewer && window.tiledViewer.isOpen && window.tiledViewer.isOpen();

    if (!isTiledViewActive && window.fitsData.data && window.fitsData.data.length > 0) {
        // For non-tiled views with local pixel data, calculate percentiles
        console.log("Resetting dynamic range using local pixel data percentiles.");
        try {
            const validPixels = [];
            const maxSampleSize = 500000;
            const skipFactor = Math.max(1, Math.floor((window.fitsData.width * window.fitsData.height) / maxSampleSize));
            let pixelCount = 0;
            for (let y = 0; y < window.fitsData.height; y++) {
                for (let x = 0; x < window.fitsData.width; x += skipFactor) {
                    pixelCount++;
                    if (pixelCount % skipFactor !== 0) continue;
                    const value = window.fitsData.data[y][x];
                    if (!isNaN(value) && isFinite(value)) {
                        validPixels.push(value);
                    }
                }
            }
            if (validPixels.length === 0) {
                showNotification('No valid pixels found for percentile calculation.', 2000, 'warning');
                return; // Or use initial min/max as fallback
            }
            validPixels.sort((a, b) => a - b);
            const lowerPercentile = 0.005;
            const upperPercentile = 0.995;
            minValue = validPixels[Math.floor(lowerPercentile * (validPixels.length - 1))];
            maxValue = validPixels[Math.ceil(upperPercentile * (validPixels.length - 1))];
        } catch (error) {
            console.error('Error calculating percentiles for reset:', error);
            showNotification(`Error calculating reset range: ${error.message}`, 3000, 'error');
            // Fallback to initial min/max if percentile calculation fails
            if (window.fitsData.initial_min_value !== undefined && window.fitsData.initial_max_value !== undefined) {
                 minValue = window.fitsData.initial_min_value;
                 maxValue = window.fitsData.initial_max_value;
            } else {
                return; // Cannot proceed
            }
        }
    } else if (window.fitsData.initial_min_value !== undefined && window.fitsData.initial_max_value !== undefined) {
        // For tiled views OR if local data is unavailable, use initial min/max fetched from server (if stored)
        // This assumes 'initial_min_value' and 'initial_max_value' are stored when /fits-tile-info or /fits-binary is loaded.
        // If not, this part needs adjustment based on how original/default range is known.
        console.log("Resetting dynamic range to initial server-provided or calculated min/max values.");
        minValue = window.fitsData.initial_min_value;
        maxValue = window.fitsData.initial_max_value;
    } else {
        // Absolute fallback if no other range is determinable
        showNotification('Initial image range not available for reset.', 3000, 'warning');
        return;
    }

    console.log(`Resetting to range: min=${minValue}, max=${maxValue}`);

    const minInput = document.getElementById('min-range-input');
    const maxInput = document.getElementById('max-range-input');
    if (minInput && maxInput) {
        minInput.value = minValue.toFixed(2);
        maxInput.value = maxValue.toFixed(2);
    }

    // Update client-side FITS data (this is important for subsequent applyDynamicRange calls)
    window.fitsData.min_value = minValue;
    window.fitsData.max_value = maxValue;

    // Now, apply these reset values using the same logic as applyDynamicRange
    if (isTiledViewActive) {
        console.log("Applying reset dynamic range to tiled viewer");
        showNotification(true, 'Resetting tiled view range...');
        fetch('/update-dynamic-range/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ min_value: minValue, max_value: maxValue })
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                console.error('Error resetting tiled view dynamic range:', data.error);
                showNotification('Error resetting tiled view: ' + data.error, 3000, 'error');
            } else {
                window.tiledViewer.forceRedraw();
                showNotification('Tiled view dynamic range reset.', 1500, 'success');
            }
            showNotification(false);
        })
        .catch(error => {
            console.error('Error resetting tiled view dynamic range:', error);
            showNotification(false);
            showNotification('Error communicating with server to reset dynamic range.', 3000, 'error');
        });
    } else if (window.fitsData.data && window.fitsData.data.length > 0) {
        // For non-tiled views with local pixel data
        console.log("Applying reset dynamic range to non-tiled viewer (local refresh)");
        refreshImage();
    } else {
        console.warn("Cannot visually apply reset: No tiled viewer and no local data to refresh.");
        // Values are set in inputs and window.fitsData, histogram will update.
    }

    requestHistogramUpdate();
}

/**
 * Apply the selected color map to the current image
 * @param {string} colorMapName - The name of the color map to apply
 */
function applyColorMap(colorMapName) {
    if (!viewer) return;
    
    console.log(`Applying color map: ${colorMapName}`);
    
    // Store the selected color map
    currentColorMap = colorMapName;
    
    // Apply the color map when refreshing the image
    refreshImage();
}


// Updated OpenSeadragon initialization with better large image handling
async function initializeOpenSeadragonViewer(dataUrl, isLargeImage) {
    console.log('[initializeOpenSeadragonViewer] Initializing OpenSeadragon viewer...');
    console.log('[initializeOpenSeadragonViewer] Data URL:', dataUrl ? dataUrl.substring(0, 100) + '...' : 'null');
    console.log('[initializeOpenSeadragonViewer] Is Large Image:', isLargeImage);

    const mainContainer = document.getElementById('openseadragon');
    const navigatorContainer = document.getElementById('navigatorDiv');

    // --- ROBUSTNESS CHECK ---
    // Wait for the main container to be available, with a timeout.
    const maxRetries = 10;
    let retries = 0;
    while (!mainContainer && retries < maxRetries) {
        console.warn(`[initializeOpenSeadragonViewer] Main container 'openseadragon' not found. Retrying... (${retries + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 200)); // Wait 200ms before retrying
        mainContainer = document.getElementById('openseadragon');
        retries++;
    }

    if (!mainContainer) {
        const errorMsg = "Critical Error: Could not find the 'openseadragon' container element after multiple retries. The viewer cannot be initialized.";
        console.error(errorMsg);
        showNotification(errorMsg, 5000, 'error');
        return; // Stop execution if container is missing
    }
    // --- END ROBUSTNESS CHECK ---

    // Ensure the container is empty before initializing a new viewer
    mainContainer.innerHTML = '';
    
    // Destroy the previous viewer instance if it exists
    if (viewer) {
        viewer.destroy();
        viewer = null;
    }

    const viewerOptions = {
        id: 'openseadragon',
        prefixUrl: '/static/vendor/openseadragon/images/',
        tileSources: {
            type: 'image',
            url: dataUrl
        },
        animationTime: 0.5,
        blendTime: 0.1,
        constrainDuringPan: true,
        maxZoomPixelRatio: 2,
        visibilityRatio: 1,
        zoomPerClick: 1.4,
        showNavigator: true,
        navigatorId: 'navigatorDiv', // Explicitly provide the ID for the navigator
        navigatorPosition: 'TOP_RIGHT',
        imageSmoothingEnabled: false
    };

    console.log('[initializeOpenSeadragonViewer] Viewer options:', viewerOptions);

    try {
        viewer = OpenSeadragon(viewerOptions);
        window.viewer = viewer; 
        
        // Hide the welcome screen if it's still visible
        const welcomeScreen = document.querySelector('.welcome-screen');
        if (welcomeScreen) {
            welcomeScreen.style.display = 'none';
        }

        // Add event handlers for zoom and pan
        viewer.addHandler('zoom', updateHistogram);
        viewer.addHandler('pan', updateHistogram);

        // Add a handler to know when the image is fully loaded and ready
        viewer.addHandler('open', function() {
            console.log('[OpenSeadragon] Viewer is open and image is loaded.');
            // Any actions to perform after the image is displayed can go here.
            
            // For example, trigger an initial histogram update.
            requestHistogramUpdate();
        });

        // After the viewer is initialized, add the custom buttons
        if (typeof window.addPeakFinderButton === 'function') {
            window.addPeakFinderButton();
        }

    } catch (error) {
        console.error('[initializeOpenSeadragonViewer] Error initializing OpenSeadragon:', error);
        showNotification('Critical Error: Could not initialize image viewer. Please check console and refresh.', 5000, 'error');
    }
}

// === ADD THIS HELPER FUNCTION ===
// This will help debug and format large numbers
function formatMemorySize(bytes) {
    if (bytes < 1024) return bytes + " bytes";
    else if (bytes < 1048576) return (bytes / 1024).toFixed(2) + " KB";
    else if (bytes < 1073741824) return (bytes / 1048576).toFixed(2) + " MB";
    else return (bytes / 1073741824).toFixed(2) + " GB";
}


// Helper function to safely get pixel values from FITS data
function getFitsPixel(x, y) {
    if (!fitsData || !fitsData.data) return 0;
    
    // Bounds checking
    if (x < 0 || x >= fitsData.width || y < 0 || y >= fitsData.height) {
        return 0;
    }
    
    try {
        const val = fitsData.data[y][x];
        return (!isNaN(val) && isFinite(val)) ? val : 0;
    } catch (e) {
        console.error(`Error accessing pixel (${x},${y}):`, e);
        return 0;
    }
}

/**
 * Refresh the image with the current FITS data settings
 */
function refreshImage() {
    // Enhanced error handling with better checks
    if (!window.fitsData || !window.fitsData.data) {
        console.warn('Cannot refresh image: missing FITS data');
        showNotification('Cannot update image: missing image data', 3000, 'error');
        return;
    }
    
    if (!viewer) {
        console.warn('Cannot refresh image: viewer not initialized');
        showNotification('Cannot update image: viewer not initialized', 3000, 'error');
        return;
    }
    
    console.log('Refreshing image with dynamic range:', window.fitsData.min_value, 'to', window.fitsData.max_value);
    
    // Store current viewport settings to preserve zoom/pan state
    let viewportSettings = null;
    if (viewer && viewer.viewport) {
        viewportSettings = {
            zoom: viewer.viewport.getZoom(),
            center: viewer.viewport.getCenter()
        };
        console.log("Stored viewport settings:", viewportSettings);
    }
    
    // Show a brief processing indicator
    showNotification(true, 'Updating image...');
    
    // Use worker if available, otherwise process in main thread
    if (window.Worker) {
        processImageInWorker();
    } else {
        processImageInMainThread();
    }
    
    // Add a success notification
    setTimeout(() => {
        showNotification(false);
        showNotification('Image updated successfully', 1500, 'success');
    }, 500);
}



// Example usage:
// showNotification("Task completed successfully!", 3000, "success");
// showNotification("An error occurred while processing", 4000, "error");
// showNotification("Please review your settings", 3000, "warning");
// showNotification("New message received", 2500, "info");

/**
 * Update the histogram display with the current data
 */
function updateHistogram() {
    const canvas = document.getElementById('histogram-canvas');
    if (!canvas) {
        console.log('Histogram canvas not found, skipping update');
        return;
    }
    
    // Check if we're in tiled mode
    const inTiledMode = window.tiledViewer && window.tiledViewer.isOpen && window.tiledViewer.isOpen();
    
    if (inTiledMode) {
        console.log('Using server-side histogram for tiled data');
        fetchServerHistogram();
        return;
    }

    // Check if we have access to fitsData with pixel data
    if (!window.fitsData) {
        console.log('No FITS data available for histogram');
        drawEmptyHistogram(canvas, 'No FITS data available');
        return;
    }
    
    // Additional check for proper data structure
    if (!window.fitsData.data || !Array.isArray(window.fitsData.data) || window.fitsData.data.length === 0) {
        console.log('Missing or invalid pixel data structure for histogram');
        drawEmptyHistogram(canvas, 'Invalid pixel data structure');
        return;
    }
    
    try {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        // Clear the canvas
        ctx.clearRect(0, 0, width, height);
        
        // Sample the data to build histogram
        const numBins = 100;
        const bins = new Array(numBins).fill(0);
        const minValue = window.fitsData.min_value;
        const maxValue = window.fitsData.max_value;
        const range = maxValue - minValue;
        
        if (range <= 0 || !isFinite(range)) {
            console.log('Invalid data range:', minValue, maxValue);
            drawEmptyHistogram(canvas, 'Invalid data range');
            return;
        }
        
        // Skip factor for large images
        const maxSampleSize = 500000;
        const skipFactor = Math.max(1, Math.floor((window.fitsData.width * window.fitsData.height) / maxSampleSize));
        
        let pixelCount = 0;
        let validPixelCount = 0;
        
        // Count pixels in each bin
        for (let y = 0; y < window.fitsData.height; y++) {
            for (let x = 0; x < window.fitsData.width; x += skipFactor) {
                pixelCount++;
                if (pixelCount % skipFactor !== 0) continue;
                
                // Safely access pixel data
                let val;
                try {
                    val = window.fitsData.data[y][x];
                } catch (e) {
                    console.warn('Error accessing pixel data at', y, x);
                    continue;
                }
                
                if (!isNaN(val) && isFinite(val)) {
                    validPixelCount++;
                    
                    // Skip values outside the current range
                    if (val < minValue || val > maxValue) continue;
                    
                    // Calculate bin index
                    const binIndex = Math.min(numBins - 1, Math.floor(((val - minValue) / range) * numBins));
                    bins[binIndex]++;
                }
            }
        }
        
        // Find the maximum bin count for scaling
        let maxBinCount = 0;
        for (let i = 0; i < numBins; i++) {
            maxBinCount = Math.max(maxBinCount, bins[i]);
        }
        
        // If no pixels in range, show a message
        if (maxBinCount === 0) {
            ctx.fillStyle = '#aaa';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('No pixels in the selected range', width / 2, height / 2);
            return;
        }
        
        console.log(`Max bin count: ${maxBinCount}`);
        
        // Calculate logarithmic scale
        const logMaxBinCount = Math.log(maxBinCount + 1);
        
        // Draw the histogram
        const padding = { top: 30, right: 20, bottom: 40, left: 60 };
        const histHeight = height - padding.top - padding.bottom;
        
        // Draw axes
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 1;
        
        // Y-axis
        ctx.beginPath();
        ctx.moveTo(padding.left, padding.top);
        ctx.lineTo(padding.left, height - padding.bottom);
        ctx.stroke();
        
        // X-axis
        ctx.beginPath();
        ctx.moveTo(padding.left, height - padding.bottom);
        ctx.lineTo(width - padding.right, height - padding.bottom);
        ctx.stroke();
        
        // Draw Y-axis tick marks and labels
        ctx.fillStyle = '#aaa';
        ctx.font = '10px Arial';
        ctx.textAlign = 'right';
        
        // Draw 5 tick marks on Y-axis
        const numYTicks = 5;
        for (let i = 0; i <= numYTicks; i++) {
            const y = height - padding.bottom - (i / numYTicks) * histHeight;
            
            // Draw tick mark
            ctx.beginPath();
            ctx.moveTo(padding.left - 5, y);
            ctx.lineTo(padding.left, y);
            ctx.stroke();
            
            // Calculate and draw label
            // For log scale, we need to convert back from the display position
            const logValue = (i / numYTicks) * logMaxBinCount;
            const actualValue = Math.round(Math.exp(logValue) - 1);
            
            ctx.fillText(actualValue.toLocaleString(), padding.left - 8, y + 4);
        }
        
        // Draw X-axis tick marks and labels
        ctx.textAlign = 'center';
        
        // Draw 5 tick marks on X-axis
        const numXTicks = 5;
        for (let i = 0; i <= numXTicks; i++) {
            const x = padding.left + (i / numXTicks) * (width - padding.left - padding.right);
            
            // Draw tick mark
            ctx.beginPath();
            ctx.moveTo(x, height - padding.bottom);
            ctx.lineTo(x, height - padding.bottom + 5);
            ctx.stroke();
            
            // Calculate and draw label
            const value = minValue + (i / numXTicks) * range;
            // CHANGE FORMAT
            ctx.fillText(value.toFixed(2), x, height - padding.bottom + 20);
        }
        
        // Draw Y-axis label (rotated)
        ctx.save();
        ctx.translate(15, height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = '#aaa';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Pixel Count (log)', 0, 0);
        ctx.restore();
        
        // Draw X-axis label
        ctx.fillStyle = '#aaa';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        const xAxisLabel = window.fitsData.wcs && window.fitsData.wcs.bunit ? window.fitsData.wcs.bunit : 'Value';
        // CHANGE Y-POSITION (increase from height - 10)
        ctx.fillText(xAxisLabel, width / 2, height - 5); 
        
        // Draw histogram bars
        ctx.fillStyle = 'rgba(0, 180, 0, 0.7)'; // Green bars
        const barWidth = (width - padding.left - padding.right) / numBins;
        
        for (let i = 0; i < numBins; i++) {
            const binCount = bins[i];
            if (binCount === 0) continue;
            
            // Use log scale for height
            const logHeight = Math.log(binCount + 1) / logMaxBinCount * histHeight;
            
            const x = padding.left + i * barWidth;
            const y = height - padding.bottom - logHeight;
            const barHeight = logHeight;
            
            ctx.fillRect(x, y, barWidth - 1, barHeight);
        }
        
        // Draw min/max lines
        const minInput = document.getElementById('min-range-input');
        const maxInput = document.getElementById('max-range-input');
        
        if (minInput && maxInput) {
            const minVal = parseFloat(minInput.value);
            const maxVal = parseFloat(maxInput.value);
            
            if (!isNaN(minVal) && !isNaN(maxVal) && minVal < maxVal) {
                // Draw min line
                const minX = padding.left + ((minVal - minValue) / range) * (width - padding.left - padding.right);
                ctx.strokeStyle = 'rgba(50, 150, 255, 0.9)'; // Blue
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(minX, padding.top - 10); // Start slightly above the plot area
                ctx.lineTo(minX, height - padding.bottom + 10); // End slightly below
                ctx.stroke();
                
                // Draw max line
                const maxX = padding.left + ((maxVal - minValue) / range) * (width - padding.left - padding.right);
                ctx.strokeStyle = 'rgba(255, 0, 0, 0.9)'; // Red
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(maxX, padding.top - 10); // Start slightly above
                ctx.lineTo(maxX, height - padding.bottom + 10); // End slightly below
                ctx.stroke();

                 // Optional: Draw small handles/indicators on the lines
                 // Min Handle (Blue)
                 ctx.fillStyle = 'rgba(50, 150, 255, 0.9)'; // Explicitly Blue
                 ctx.fillRect(minX - 3, padding.top - 15, 6, 5); // Small rectangle handle for min
                 // Max Handle (Red)
                 ctx.fillStyle = 'rgba(255, 0, 0, 0.9)'; // Explicitly Red
                 ctx.fillRect(maxX - 3, padding.top - 15, 6, 5); // Small rectangle handle for max
            }
        }
        
        // Draw statistics
        ctx.fillStyle = '#aaa';
        ctx.font = '12px Arial';
        // COMMENT OUT Min text
        // ctx.textAlign = 'left';
        // ctx.fillText(`Min: ${minValue.toExponential(4)}`, padding.left, padding.top - 15);
        // COMMENT OUT Max text
        // ctx.textAlign = 'right';
        // ctx.fillText(`Max: ${maxValue.toExponential(4)}`, width - padding.right, padding.top - 15);
        // Keep Pixel Count text
        ctx.textAlign = 'center';
        ctx.fillText(`Pixels: ${validPixelCount.toLocaleString()}`, width / 2, padding.top - 15);

        // Store scale info for interaction handlers
        // Use actual min/max of the data for scaling, not necessarily the input values
        const dataMin = window.fitsData.min_value;
        const dataMax = window.fitsData.max_value;
        const dataRange = dataMax - dataMin;

        histogramScaleInfo = {
            padding: padding,
            histWidth: width - padding.left - padding.right,
            histHeight: histHeight,
            dataMin: dataMin, // Min value used for the current histogram rendering *scale*
            dataRange: dataRange, // Range used for the current histogram rendering *scale*
            canvasWidth: width,
            canvasHeight: height
        };

        if (histogramScaleInfo.histWidth <= 0 || !isFinite(histogramScaleInfo.dataRange) || histogramScaleInfo.dataRange <= 0) {
             console.warn('Invalid histogram scale parameters:', histogramScaleInfo);
             drawEmptyHistogram(canvas, 'Invalid scale');
             return;
        }

    } catch (error) {
        console.error('Error updating histogram:', error);
        drawEmptyHistogram(canvas, 'Error updating histogram');
    } finally {
        isUpdatingHistogram = false;
        // If another update was requested while this one was running, start it now
        if (histogramUpdateRequested) {
            histogramUpdateRequested = false;
            // Use a timeout to avoid potential stack overflow if updates are rapid
            setTimeout(requestHistogramUpdate, 0);
        }
    }
}

/**
 * Draw an empty histogram with a message
 */
function drawEmptyHistogram(canvas, message) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear the canvas
    ctx.clearRect(0, 0, width, height);
    
    // Draw a message
    ctx.fillStyle = '#aaa';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(message, width / 2, height / 2);
    
    // Add a hint for tiled mode
    if (window.tiledViewer && window.tiledViewer.isOpen && window.tiledViewer.isOpen()) {
        ctx.fillText('Using tiled viewing mode', width / 2, height / 2 + 25);
    }
}

/**
 * Fetch histogram data from the server for tiled mode
 */
function fetchServerHistogram() {
    const canvas = document.getElementById('histogram-bg-canvas'); // Target BG canvas
    if (!canvas) {
        console.warn("Histogram background canvas not found for fetchServerHistogram.");
        return;
    }

    const minInput = document.getElementById('min-range-input');
    const maxInput = document.getElementById('max-range-input');
    let uiMin = null;
    let uiMax = null;

    if (minInput && maxInput) {
        uiMin = parseFloat(minInput.value);
        uiMax = parseFloat(maxInput.value);
        // Validate that uiMin and uiMax are numbers and min < max
        if (isNaN(uiMin) || isNaN(uiMax) || uiMin >= uiMax) {
            console.warn("Invalid Min/Max values from UI for server histogram request. uiMin:", uiMin, "uiMax:", uiMax, ". Fetching default range.");
            uiMin = null; // Fallback to server default if UI values are bad
            uiMax = null;
        }
    } else {
        console.warn("Min/Max input fields not found. Fetching default range for server histogram.");
    }
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#aaa'; ctx.font = '14px Arial'; ctx.textAlign = 'center';
    ctx.fillText('Loading histogram data...', canvas.width / 2, canvas.height / 2);
    
    let fetchUrl = '/fits-histogram/';
    if (uiMin !== null && uiMax !== null) {
        fetchUrl += `?min_val=${encodeURIComponent(uiMin)}&max_val=${encodeURIComponent(uiMax)}`;
    }
    console.log("Fetching server histogram from:", fetchUrl);

    fetch(fetchUrl)
        .then(response => {
            if (!response.ok) { // Check if response status is indicative of an error
                return response.text().then(text => { // Try to get error text from server
                    throw new Error(`Server error: ${response.status} ${response.statusText}. ${text}`);
                });
            }
            return response.json();
        })
        .then(data => {
            if (data.error) { // This is if the server *successfully* responds with a JSON containing an error message
                console.error("Server returned error for histogram:", data.error);
                throw new Error(data.error); // Propagate as an error to be caught by .catch
            }
            drawServerHistogram(data); // Draw the received data (assumes this draws on bg-canvas)
            
            // After drawing background, draw lines based on current inputs
            // (which might be different from the range server used if server doesn't support min/max params)
            if (minInput && maxInput) {
                const currentMin = parseFloat(minInput.value);
                const currentMax = parseFloat(maxInput.value);
                if (!isNaN(currentMin) && !isNaN(currentMax)) {
                    drawHistogramLines(currentMin, currentMax, false); 
                }
            }
        })
        .catch(error => { // This catches network errors or errors thrown from !response.ok or data.error
            console.error('Error fetching or processing server histogram:', error);
            const message = error.message || 'Unknown error';
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#aaa'; ctx.font = '14px Arial'; ctx.textAlign = 'center';
            // Wrap text if too long
            const maxTextWidth = canvas.width - 20;
            const lines = [];
            let currentLine = '';
            const words = `Error: ${message}`.split(' ');
            for (const word of words) {
                const testLine = currentLine + word + ' ';
                if (ctx.measureText(testLine).width > maxTextWidth && currentLine.length > 0) {
                    lines.push(currentLine.trim());
                    currentLine = word + ' ';
                } else {
                    currentLine = testLine;
                }
            }
            lines.push(currentLine.trim());
            
            let yPos = canvas.height / 2 - (lines.length -1) * 7; // Adjust start Y for multi-line
            for (const line of lines) {
                ctx.fillText(line, canvas.width / 2, yPos);
                yPos += 15; // Line height
            }
        });
}

/**
 * Draw a histogram with data from the server
 */
/**
 * Draw a histogram with data from the server
 */
function drawServerHistogram(histData) {
    const canvas = document.getElementById('histogram-bg-canvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    ctx.clearRect(0, 0, width, height);
    
    const bins = histData.counts;
    const minValue = histData.min_value;
    const maxValue = histData.max_value;
    const range = maxValue - minValue;

    if (range <= 0 || !isFinite(range)) {
        console.log('Invalid data range from server histogram:', minValue, maxValue);
        drawEmptyHistogram(canvas, 'Invalid data range from server');
        return;
    }

    let maxBinCount = 0;
    for (let i = 0; i < bins.length; i++) {
        maxBinCount = Math.max(maxBinCount, bins[i]);
    }
    
    if (maxBinCount === 0 && bins.length > 0) {
         console.log('Server histogram has bins, but all counts are zero.');
    } else if (bins.length === 0) {
        drawEmptyHistogram(canvas, 'No histogram data from server');
        return;
    }
    
    const logMaxBinCount = Math.log(maxBinCount + 1); 
    
    const padding = { top: 30, right: 20, bottom: 40, left: 60 };
    const histHeight = height - padding.top - padding.bottom;
    const histWidth = width - padding.left - padding.right;

    // Draw Axes
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1;
    ctx.beginPath(); 
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, height - padding.bottom);
    ctx.stroke();
    ctx.beginPath(); 
    ctx.moveTo(padding.left, height - padding.bottom);
    ctx.lineTo(width - padding.right, height - padding.bottom);
    ctx.stroke();

    // Y Ticks & Labels
    ctx.fillStyle = '#aaa';
    ctx.font = '10px Arial';
    ctx.textAlign = 'right';
    const numYTicks = 5;
    for (let i = 0; i <= numYTicks; i++) {
        const y = height - padding.bottom - (i / numYTicks) * histHeight;
        ctx.beginPath();
        ctx.moveTo(padding.left - 5, y);
        ctx.lineTo(padding.left, y);
        ctx.stroke();
        const logValue = logMaxBinCount > 0 ? (i / numYTicks) * logMaxBinCount : 0;
        const actualValue = Math.round(Math.exp(logValue) - 1);
        ctx.fillText(actualValue.toLocaleString(), padding.left - 8, y + 4);
    }

    // X Ticks & Labels
    ctx.textAlign = 'center';
    const numXTicks = 5;
    const numBins = bins.length;
    for (let i = 0; i <= numXTicks; i++) {
        const x = padding.left + (i / numXTicks) * histWidth;
        ctx.beginPath();
        ctx.moveTo(x, height - padding.bottom);
        ctx.lineTo(x, height - padding.bottom + 5);
        ctx.stroke();
        const value = minValue + (i / numXTicks) * range;
        ctx.fillText(value.toFixed(2), x, height - padding.bottom + 20);
    }

    // Axis Labels
    ctx.save();
    ctx.translate(padding.left / 2 - 5, height / 2); 
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#aaa';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Pixel Count (log)', 0, 0);
    ctx.restore();

    ctx.fillStyle = '#aaa';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    
    // Use bunit from window.fitsData if available, otherwise use a generic label
    const unitString = (window.fitsData && window.fitsData.bunit && String(window.fitsData.bunit).trim() !== '') ? String(window.fitsData.bunit).trim() : 'Value';
    const xAxisLabelText = `Pixel Values (${unitString})`;
    ctx.fillText(xAxisLabelText, width / 2, height - padding.bottom + 35);


    // Stats Texts
    ctx.font = '12px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`Min: ${minValue.toExponential(2)}`, padding.left, padding.top - 10);
    ctx.textAlign = 'right';
    ctx.fillText(`Max: ${maxValue.toExponential(2)}`, width - padding.right, padding.top - 10);
    if (histData.total_pixels_in_range) { 
        ctx.textAlign = 'center';
        ctx.fillText(`Pixels in Range: ${histData.total_pixels_in_range.toLocaleString()}`, width / 2, padding.top - 10);
    }

    // Draw histogram bars
    ctx.fillStyle = '#4CAF50'; 
    const barWidth = histWidth / numBins;
    for (let i = 0; i < numBins; i++) {
        const binCount = bins[i];
        if (binCount === 0) continue;
        const logHeight = logMaxBinCount > 0 ? (Math.log(binCount + 1) / logMaxBinCount * histHeight) : 0;
        if (logHeight <= 0) continue; 

        const x = padding.left + i * barWidth;
        const y = height - padding.bottom - logHeight;
        ctx.fillRect(x, y, barWidth -1, logHeight); 
    }

    if (maxBinCount === 0 && bins.length > 0) {
        ctx.fillStyle = '#ccc'; ctx.font = '12px Arial'; ctx.textAlign = 'center';
        ctx.fillText('Counts are zero in this range', width / 2, padding.top + histHeight / 2);
    }
    
    ctx.fillStyle = '#aaa';
    ctx.font = '10px Arial';
    ctx.textAlign = 'right';
    ctx.fillText('', width - padding.right, height - 5);

    histogramScaleInfo = {
        padding: padding,
        histWidth: histWidth,
        histHeight: histHeight,
        dataMin: minValue, 
        dataRange: range,   
        canvasWidth: width,
        canvasHeight: height
    };
    if (histogramScaleInfo.histWidth <= 0 || !isFinite(histogramScaleInfo.dataRange) || histogramScaleInfo.dataRange <= 0) {
        console.warn('Invalid histogram scale parameters from server data:', histogramScaleInfo);
    }
}


// REPLACE your existing applyLocalFilter function in main.js with this fixed version

function applyLocalFilter(flagColumn) {
    console.log('applyLocalFilter called with:', flagColumn);
    
    if (!window.catalogDataWithFlags || !window.catalogDataForOverlay) {
        console.warn('No catalog data available for filtering');
        showNotification('No catalog data available for filtering', 3000, 'warning');
        return;
    }
    
    showNotification(true, 'Applying filter...');
    
    let visibleCount = 0;
    
    // Create a set of indices that should be visible
    const visibleIndices = new Set();
    
    // Check each object for the flag
    for (let i = 0; i < window.catalogDataWithFlags.length; i++) {
        const flagObj = window.catalogDataWithFlags[i];
        
        if (!flagObj || !(flagColumn in flagObj)) {
            continue;
        }
        
        const flagValue = flagObj[flagColumn];
        const isFlagSet = flagValue === true || flagValue === 1 || flagValue === 'true';
        
        if (isFlagSet) {
            visibleIndices.add(i);
            visibleCount++;
        }
        
        // Debug first few
        if (i < 5) {
            console.log(`Object ${i}: ${flagColumn} = ${flagValue} (${typeof flagValue}), isFlagSet = ${isFlagSet}`);
        }
    }
    
    console.log(`Found ${visibleCount} objects with ${flagColumn} = true out of ${window.catalogDataWithFlags.length} total objects`);
    
    // FIXED: Update the canvas overlay data with filter information
    if (window.catalogDataForOverlay && typeof canvasUpdateOverlay === 'function') {
        console.log('Applying filter to canvas overlay data');
        
        // Mark each object in the overlay data with filter status
        window.catalogDataForOverlay.forEach((obj, index) => {
            if (index < window.catalogDataWithFlags.length) {
                const flagObj = window.catalogDataWithFlags[index];
                if (flagObj && flagColumn in flagObj) {
                    const flagValue = flagObj[flagColumn];
                    const isFlagSet = flagValue === true || flagValue === 1 || flagValue === 'true';
                    obj.passesFilter = isFlagSet;
                } else {
                    obj.passesFilter = false;
                }
            } else {
                obj.passesFilter = false;
            }
        });
        
        // Update the global filter state
        window.flagFilterEnabled = true;
        window.currentFlagColumn = flagColumn;
        window.visibleObjectIndices = visibleIndices;
        
        // Set the filter state variables
        flagFilterEnabled = true;
        currentFlagColumn = flagColumn;
        currentEnvValue = null;
        
        // Force canvas redraw with updated filter data
        console.log('Calling canvasUpdateOverlay to refresh display with filter');
        canvasUpdateOverlay();
        
    } else if (window.catalogDots && window.catalogDots.length > 0) {
        // Fallback for DOM-based overlay (original logic)
        console.log('Applying filter to DOM dots (fallback)');
        
        window.catalogDots.forEach(dot => {
            const dotIndex = parseInt(dot.dataset.index);
            if (isNaN(dotIndex) || dotIndex >= window.catalogDataWithFlags.length) {
                dot.style.display = 'none';
                dot.dataset.passesFilter = 'false';
                return;
            }
            
            const flagObj = window.catalogDataWithFlags[dotIndex];
            let isFlagSet = false;
            
            if (flagObj && flagColumn in flagObj) {
                const flagValue = flagObj[flagColumn];
                isFlagSet = flagValue === true || flagValue === 1 || flagValue === 'true';
            }
            
            dot.style.display = isFlagSet ? 'block' : 'none';
            dot.dataset.passesFilter = isFlagSet ? 'true' : 'false';
        });
        
        // Update DOM overlay if function exists
        if (typeof updateOverlay === 'function') {
            updateOverlay();
        }
    }
    
    showNotification(false);
    
    if (visibleCount === 0) {
        showNotification(`No objects match the "${flagColumn}" filter criteria`, 3000, 'warning');
    } else {
        showNotification(`Showing ${visibleCount} objects with "${flagColumn}" flag`, 2000, 'success');
    }
}

// Add this variable at the top with other global variables
let currentEnvValue = null;

// Replace your existing updateFlagFilterUI function with this one
function updateFlagFilterUI(dropdownContent) {
    // Update button appearance
    if (flagFilterButton) {
        if (flagFilterEnabled) {
            flagFilterButton.style.backgroundColor = 'white';
            flagFilterButton.style.color = 'black';
        } else {
            flagFilterButton.style.backgroundColor = '';
            flagFilterButton.style.color = '';
        }
    }
    
    // Update dropdown items
    const flagItems = dropdownContent.querySelectorAll('.flag-item');
    flagItems.forEach(item => {
        // Reset all items first
        item.style.backgroundColor = 'transparent';
        item.style.color = 'white';
        
        // Highlight selected item based on filtering mode
        if (item.textContent === 'No Filter (Show All)' && !flagFilterEnabled) {
            // No filter selected
            item.style.backgroundColor = 'white';
            item.style.color = 'black';
        } 
        else if (item.classList.contains('env-item') && 
                flagFilterEnabled && 
                currentFlagColumn === 'env' && 
                item.dataset.envValue == currentEnvValue) {
            // Environment value selected
            item.style.backgroundColor = 'white';
            item.style.color = 'black';
        }
        else if (!item.classList.contains('env-item') && 
                flagFilterEnabled &&
                item.textContent === currentFlagColumn && 
                currentEnvValue === null) {
            // Boolean flag selected
            item.style.backgroundColor = 'white';
            item.style.color = 'black';
        }
    });
}


// Add this new function to handle env-specific filtering
function applyEnvFilter(envValue) {
    if (!window.catalogDataWithFlags || !window.catalogDots) {
        console.warn('No catalog data available for environment filtering');
        return;
    }
    
    console.log(`Applying env filter with value: ${envValue} (${typeof envValue})`);
    
    showNotification(true, 'Applying environment filter...');
    
    let visibleCount = 0;
    const totalDots = window.catalogDots.length;
    let processedObjectsWithEnv = 0;
    let objectsWithMatchingEnv = 0;
    
    // Make sure envValue is treated as a number if possible
    let targetEnvValue = envValue;
    if (typeof envValue !== 'number') {
        const parsedEnv = parseInt(envValue);
        if (!isNaN(parsedEnv)) {
            targetEnvValue = parsedEnv;
        }
    }
    
    console.log(`Using target environment value: ${targetEnvValue} (${typeof targetEnvValue})`);
    
    // Process all dots at once using the cached data
    window.catalogDots.forEach((dot, i) => {
        // Get the object index from the dot's dataset
        const dotIndex = parseInt(dot.dataset.index);
        
        if (isNaN(dotIndex) || dotIndex >= window.catalogDataWithFlags.length) {
            // If we can't match the dot to data, hide it
            dot.style.display = 'none';
            dot.dataset.passesFilter = 'false';
            return;
        }
        
        // Get the corresponding data object
        const objData = window.catalogDataWithFlags[dotIndex];
        
        // Check if the env property exists and matches the value
        let matchesEnv = false;
        
        if (objData && 'env' in objData) {
            processedObjectsWithEnv++;
            
            // Store the raw object env value
            const rawObjEnv = objData.env;
            
            // Try multiple comparison approaches
            if (typeof rawObjEnv === 'number' && typeof targetEnvValue === 'number') {
                // Direct numeric comparison
                matchesEnv = (rawObjEnv === targetEnvValue);
            } else {
                // String comparison as fallback
                const objEnvString = String(rawObjEnv).trim();
                const targetEnvString = String(targetEnvValue).trim();
                matchesEnv = (objEnvString === targetEnvString);
                
                // Also try numeric comparison if both can be converted to numbers
                const numObjEnv = parseFloat(objEnvString);
                const numTargetEnv = parseFloat(targetEnvString);
                if (!isNaN(numObjEnv) && !isNaN(numTargetEnv)) {
                    matchesEnv = matchesEnv || (numObjEnv === numTargetEnv);
                }
            }
            
            if (matchesEnv) {
                objectsWithMatchingEnv++;
            }
            
            // Debug log for the first few dots
            if (i < 10) {
                console.log(`Dot ${i} (index ${dotIndex}): env = ${rawObjEnv} (${typeof rawObjEnv}), target = ${targetEnvValue} (${typeof targetEnvValue}), matches = ${matchesEnv}`);
            }
        }
        
        // Set dot visibility based on the filter
        dot.style.display = matchesEnv ? 'block' : 'none';
        dot.dataset.passesFilter = matchesEnv ? 'true' : 'false';
        
        if (matchesEnv) {
            visibleCount++;
        }
    });
    
    // Force a redraw of the overlay
    updateOverlay();
    
    console.log(`Environment filter results:`);
    console.log(`  Total dots: ${totalDots}`);
    console.log(`  Objects with env property: ${processedObjectsWithEnv}`);
    console.log(`  Objects matching env=${targetEnvValue}: ${objectsWithMatchingEnv}`);
    console.log(`  Visible dots after filtering: ${visibleCount}`);
    
    showNotification(false);
    
    if (visibleCount === 0) {
        showNotification(`No objects match Environment ${targetEnvValue} filter criteria`, 3000);
    } else {
        const envDescription = ENV_DESCRIPTIONS[targetEnvValue] || `Environment ${targetEnvValue}`;
        showNotification(`Showing ${visibleCount} objects in "${envDescription}"`, 2500);
    }
}


function applyFlagFilter(flagColumn) {
    if (!window.catalogDots || !activeCatalog) {
        console.warn('No catalog data or dots available for filtering');
        return;
    }
    
    // Show loading indicator
    showNotification(true, 'Applying flag filter...');
    
    // First, reset all dots to be visible
    if (window.catalogDots) {
        window.catalogDots.forEach(dot => {
            dot.style.display = 'block';
            dot.dataset.passesFilter = 'true'; // Reset the filter state
        });
    }
    
    // We need to fetch source properties for each dot to check flag values
    // Start by fetching the first few to determine if flags exist
    let promises = [];
    const maxObjectsToCheck = 10; // Check first 10 objects to determine if flag exists
    
    // Get a sample of dots to check
    const sampleDots = window.catalogDots.slice(0, maxObjectsToCheck);
    
    // Fetch properties for each sample dot
    sampleDots.forEach((dot, index) => {
        const ra = parseFloat(dot.dataset.ra);
        const dec = parseFloat(dot.dataset.dec);
        
        if (!isNaN(ra) && !isNaN(dec)) {
            promises.push(
                fetch(`/source-properties/?ra=${ra}&dec=${dec}&catalog_name=${activeCatalog}`)
                    .then(response => response.json())
                    .then(data => {
                        if (data.error) throw new Error(data.error);
                        return data.properties || {};
                    })
                    .catch(error => {
                        console.error(`Error fetching properties for sample ${index}:`, error);
                        return {};
                    })
            );
        }
    });
    
    // Process all the sample properties to determine if flag exists
    Promise.all(promises)
        .then(results => {
            // Check if any of the sample objects have the flag column
            const flagExists = results.some(props => 
                props.hasOwnProperty(flagColumn) &&
                (typeof props[flagColumn] === 'boolean' || 
                props[flagColumn] === 'True' || 
                props[flagColumn] === 'False' ||
                props[flagColumn] === true ||
                props[flagColumn] === false ||
                props[flagColumn] === 1 ||
                props[flagColumn] === 0)
            );
            
            if (!flagExists) {
                showNotification(`Flag column "${flagColumn}" not found or is not a boolean`, 3000);
                showNotification(false);
                return;
            }
            
            // If flag exists, fetch properties for all dots (with a limit) and apply filtering
            applyFilterToAllDots(flagColumn);
        })
        .catch(error => {
            console.error('Error checking flag existence:', error);
            showNotification('Error applying filter', 3000);
            showNotification(false);
        });
}


// After applying the filter, we need to preserve the filter state
function applyFilterToAllDots(flagColumn) {
    // Process dots in batches to avoid overwhelming the server
    const batchSize = 20;
    const totalDots = window.catalogDots.length;
    let processedCount = 0;
    let visibleCount = 0;
    
    console.log(`Applying filter ${flagColumn} to ${totalDots} dots in batches of ${batchSize}`);
    
    // Process one batch at a time
    function processBatch(startIndex) {
        const endIndex = Math.min(startIndex + batchSize, totalDots);
        const batchPromises = [];
        
        // Process this batch
        for (let i = startIndex; i < endIndex; i++) {
            const dot = window.catalogDots[i];
            const ra = parseFloat(dot.dataset.ra);
            const dec = parseFloat(dot.dataset.dec);
            
            // Store the current filter on the dot so we can maintain state during updates
            dot.dataset.currentFilter = flagColumn;
            
            if (!isNaN(ra) && !isNaN(dec)) {
                batchPromises.push(
                    fetch(`/source-properties/?ra=${ra}&dec=${dec}&catalog_name=${activeCatalog}`)
                        .then(response => response.json())
                        .then(data => {
                            if (data.error) throw new Error(data.error);
                            const props = data.properties || {};
                            
                            // Check if the flag property exists and is true
                            if (props.hasOwnProperty(flagColumn)) {
                                const flagValue = props[flagColumn];
                                
                                // Handle different formats of boolean values
                                const isFlagSet = (flagValue === true || 
                                                  flagValue === 'True' || 
                                                  flagValue === 'true' || 
                                                  flagValue === 1);
                                
                                // Show or hide the dot based on the flag
                                dot.style.display = isFlagSet ? 'block' : 'none';
                                
                                // Store filter state on the dot element itself
                                dot.dataset.passesFilter = isFlagSet ? 'true' : 'false';
                                
                                if (isFlagSet) visibleCount++;
                            } else {
                                dot.style.display = 'none';
                                dot.dataset.passesFilter = 'false';
                            }
                            
                            return null;
                        })
                        .catch(error => {
                            console.error(`Error processing dot ${i}:`, error);
                            return null;
                        })
                );
            }
        }
        
        // Process all promises for this batch
        Promise.all(batchPromises)
            .then(() => {
                processedCount += batchPromises.length;
                
                // Update progress
                const progress = Math.min(100, Math.round((processedCount / totalDots) * 100));
                showNotification(true, `Filtering: ${progress}% complete...`);
                
                // If there are more dots to process, schedule the next batch
                if (endIndex < totalDots) {
                    setTimeout(() => processBatch(endIndex), 100);
                } else {
                    // All done
                    showNotification(false);
                    updateOverlay();
                    console.log(`Filter complete: ${visibleCount} of ${totalDots} objects visible`);
                    
                    if (visibleCount === 0) {
                        showNotification(`No objects match the "${flagColumn}" filter criteria`, 3000);
                    } else {
                        showNotification(`Showing ${visibleCount} objects with "${flagColumn}" flag`, 2000);
                    }
                }
            })
            .catch(error => {
                console.error('Error processing batch:', error);
                showNotification(false);
                showNotification('Error applying filter', 3000);
            });
    }
    
    // Start processing with the first batch
    processBatch(0);
}


// Modify the document ready function to not load FITS data automatically
document.addEventListener("DOMContentLoaded", function () {
    // Create a circular progress indicator
    createProgressIndicator();
    
    // Instead of loading FITS data directly, we'll wait for user selection
    // Add keyboard shortcuts
    document.addEventListener("keydown", function (event) {
        if (event.key === "+") {
            zoomIn();
        } else if (event.key === "-") {
            zoomOut();
        } else if (event.key.toLowerCase() === "r") {
            resetView();
        }
    });

    // Load catalogs on startup
    loadCatalogs();
    
    // Add dynamic range control
    // createDynamicRangeControl();
    createWelcomeScreen();

});

// Create a welcome screen for initial view

function createWelcomeScreen() {
    const container = document.getElementById('openseadragon');
    if (!container) return;
    
    // Clear any content
    container.innerHTML = '';
    
    // Add styles for the animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeIn {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
        }

        .welcome-logo {
            animation: fadeIn 1s ease-out;
            max-width: 150px;
        }
    `;
    document.head.appendChild(style);

    // Create welcome message
    const welcomeDiv = document.createElement('div');
    welcomeDiv.className = 'welcome-screen';
    welcomeDiv.style.position = 'absolute';
    welcomeDiv.style.top = '50%';
    welcomeDiv.style.left = '50%';
    welcomeDiv.style.transform = 'translate(-50%, -50%)';
    welcomeDiv.style.textAlign = 'center';
    welcomeDiv.style.color = 'white';
    welcomeDiv.style.fontFamily = 'Arial, sans-serif';
    welcomeDiv.style.maxWidth = '80%';
    
    welcomeDiv.innerHTML = `
    <img src="static/logo/logo.png" alt="Neloura Logo" class="welcome-logo">
    <h2 style="margin-top: 0px;">Welcome to Neloura</h2>
    <p>Please select a FITS file to open using the folder icon 📁 in the top toolbar.</p>
<a href="https://neloura.com/app.zip" target="_blank" rel="noopener noreferrer" aria-label="Download Neloura for macOS" style="display:inline-block; margin-top: 12px; text-decoration: none;">
  <svg xmlns="http://www.w3.org/2000/svg" width="240" height="48" viewBox="0 0 240 48">
    <defs>
      <linearGradient id="cosmicGradient" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#4A3B5C"/>
        <stop offset="50%" stop-color="#8B5C9B"/>
        <stop offset="100%" stop-color="#A875B8"/>
      </linearGradient>
    </defs>
    <rect width="240" height="48" rx="6" fill="url(#cosmicGradient)" stroke="none"/>
    <path fill="white" transform="translate(16,14) scale(0.5)" d="M16.365 12.265c-.019-2.241 1.186-4.281 3.003-5.412-1.093-1.572-2.904-2.78-4.835-2.942-2.056-.204-4.06 1.216-5.112 1.216-1.07 0-2.724-1.19-4.48-1.158-2.304.037-4.449 1.337-5.63 3.388-2.41 4.172-.613 10.341 1.73 13.725 1.145 1.64 2.493 3.471 4.27 3.403 1.732-.07 2.381-1.108 4.47-1.108 2.07 0 2.676 1.108 4.487 1.07 1.863-.03 3.038-1.64 4.17-3.29.73-1.063 1.03-1.597 1.614-2.796-4.247-1.606-4.925-7.637-1.717-10.096zM13.8 2.3c.96-1.163 1.6-2.79 1.43-4.3-1.39.057-3.07.923-4.06 2.07-.89 1.028-1.65 2.69-1.44 4.27 1.53.12 3.1-.77 4.07-2.04z"/>
    <text x="120" y="22" text-anchor="middle" font-size="16" fill="white">Download for MacOS</text>
    <text x="120" y="36" text-anchor="middle" font-size="11" fill="white" opacity="0.8">(ARM version)</text>
  </svg>
</a>
    `;
    
    // Add animated arrow pointing to the file browser button
    const pointerDiv = document.createElement('div');
    pointerDiv.className = 'welcome-pointer';
    pointerDiv.innerHTML = '&#10229;'; // Left arrow
    
    container.appendChild(welcomeDiv);
    container.appendChild(pointerDiv);
}

function loadFitsFromUrl() {
    const urlInput = document.getElementById('fits-url-input');
    const fileUrl = urlInput.value.trim();
    if (fileUrl) {
        console.log(`[loadFitsFromUrl] Loading FITS from URL: ${fileUrl}`);
        
        const welcomeScreen = document.getElementById('welcome-screen');
        if (welcomeScreen) {
            welcomeScreen.style.display = 'none';
        }
        
        loadFitsFileWithHduSelection(fileUrl);
    } else {
        showNotification('Please enter a valid FITS file URL.', 3000, 'warning');
    }
}
// Override the loadFitsData function to create welcome screen instead of automatically loading
function loadFitsData() {
    // Don't show loading indicator
    const progressContainer = document.getElementById('progress-container');
    if (progressContainer) {
        progressContainer.style.display = 'none';
    }
    
    // Instead of loading a specific file, show welcome screen
    createWelcomeScreen();
}



// Global variables for tiled rendering
let tiledViewer = null;
let currentTileInfo = null;


        // static/main.js

        // Helper function to show an immediate, basic placeholder in the viewer area
        function showImmediatePlaceholder(message = 'Loading image preview...') {
            let mainContainer = document.getElementById('main-container');
            if (!mainContainer) return; // Cannot show if main container doesn't exist

            let placeholder = document.getElementById('immediate-placeholder');
            if (!placeholder) {
                placeholder = document.createElement('div');
                placeholder.id = 'immediate-placeholder';
                // Basic styles, assuming CSS will handle the rest
                mainContainer.appendChild(placeholder);
            }
            placeholder.textContent = message;
            placeholder.style.display = 'flex';
        }

        function hideImmediatePlaceholder() {
            const placeholder = document.getElementById('immediate-placeholder');
            if (placeholder) {
                placeholder.style.display = 'none';
            }
        }

// In static/main.js

// Also update the initializeTiledViewer function in main.js:

// Initialize tiled viewer
async function initializeTiledViewer() {
    console.log("Initializing tiled viewer");

    showImmediatePlaceholder('Preparing image preview...');
    showNotification(true, 'Loading detailed image information...');

    try {
        const response = await fetch('/fits-tile-info/');
        if (!response.ok) {
            let errorText = response.statusText;
            try {
                const errorData = await response.json();
                if (errorData && errorData.error) {
                    errorText = errorData.error;
                }
            } catch (e) { /* ignore if response is not json */ }
            throw new Error(`Failed to get tile info: ${errorText} (status: ${response.status})`);
        }
        const tileInfo = await response.json();

        currentTileInfo = tileInfo;
        console.log("Tile info received:", tileInfo);
        
        // Ensure window.fitsData exists
        if (!window.fitsData) window.fitsData = {};


        if (typeof clearAllCatalogs === 'function') {
            console.log("New FITS file opened (fast loader), clearing all existing catalogs.");
            clearAllCatalogs();
        }

        // Store BUNIT if available
        window.fitsData.bunit = tileInfo.bunit || null;

        // Store overall data min/max for reference
        window.fitsData.data_min = tileInfo.data_min;
        window.fitsData.data_max = tileInfo.data_max;

        // Store initial display min/max from server (priority)
        if (typeof tileInfo.initial_display_min !== 'undefined' && typeof tileInfo.initial_display_max !== 'undefined') {
            window.fitsData.initial_min_value = tileInfo.initial_display_min;
            window.fitsData.initial_max_value = tileInfo.initial_display_max;
            window.fitsData.min_value = tileInfo.initial_display_min;
            window.fitsData.max_value = tileInfo.initial_display_max;
        } else if (typeof window.fitsData.data_min !== 'undefined' && typeof window.fitsData.data_max !== 'undefined') {
            console.warn("initial_display_min/max not in tileInfo. Using data_min/max for initial and current dynamic range.");
            window.fitsData.min_value = window.fitsData.data_min;
            window.fitsData.max_value = window.fitsData.data_max;
            window.fitsData.initial_min_value = window.fitsData.data_min; 
            window.fitsData.initial_max_value = window.fitsData.data_max;
        } else {
            console.error("Critical: Cannot determine initial dynamic range. Neither initial_display_min/max nor data_min/max were provided in tileInfo.");
            window.fitsData.min_value = 0;
            window.fitsData.max_value = 1;
            window.fitsData.initial_min_value = 0;
            window.fitsData.initial_max_value = 1;
        }

        // Update UI input fields for min/max
        const minInputEl = document.getElementById('min-range-input');
        const maxInputEl = document.getElementById('max-range-input');
        if (minInputEl && maxInputEl) {
            minInputEl.value = window.fitsData.min_value.toFixed(GLOBAL_DATA_PRECISION || 2);
            maxInputEl.value = window.fitsData.max_value.toFixed(GLOBAL_DATA_PRECISION || 2);
        }

        // Set global current colormap and scaling from server or defaults, and update UI
        window.currentColorMap = tileInfo.color_map || 'grayscale';
        window.currentScaling = tileInfo.scaling_function || 'linear';

        const colorMapSelect = document.getElementById('color-map-select');
        if (colorMapSelect) {
            colorMapSelect.value = window.currentColorMap;
        }
        const scalingSelect = document.getElementById('scaling-select');
        if (scalingSelect) {
            scalingSelect.value = window.currentScaling;
        }

        hideImmediatePlaceholder();

        if (tileInfo.overview) {
            showOverviewImage(tileInfo.overview);
        } else {
            console.warn("No tileInfo.overview received. The view might be blank until tiles load.");
        }

        const tileSource = {
            width: tileInfo.width,
            height: tileInfo.height,
            tileSize: tileInfo.tileSize,
            maxLevel: tileInfo.maxLevel,
            minLevel: tileInfo.minLevel === undefined ? 0 : tileInfo.minLevel,
            getTileUrl: function(level, x, y) {
                return `/fits-tile/${level}/${x}/${y}?v=${currentDynamicRangeVersion}`;
            }
        };
        
        const viewerOptions = {
            id: "openseadragon",
            tileSources: tileSource,
            prefixUrl: "/static/vendor/openseadragon/images/",
            showNavigator: true,
            navigatorPosition: "TOP_LEFT",
            showZoomControl: false,
            showHomeControl: false,
            showFullPageControl: false,
            showRotationControl: false,
            defaultZoomLevel: tileInfo.defaultZoomLevel || 0.8,
            minZoomLevel: tileInfo.minZoomLevel || 0.05,
            maxZoomLevel:75,
            immediateRender: true,
            blendTime: 0.1,
            placeholderFillStyle: "#000000",
            backgroundColor: "#000000",
            navigatorBackground: "#000000",
            timeout: 120000,
            springStiffness: 7,
            visibilityRatio: 0.1,
            constrainDuringPan: true,
            imageSmoothingEnabled: false 
        };

        if (!window.tiledViewer) {
            window.tiledViewer = OpenSeadragon(viewerOptions);
            window.viewer = window.tiledViewer; // ADD THIS LINE
            window.tiledViewer.addHandler('open', function() {
                console.log("Tiled viewer opened. Hiding overview image.");
                showNotification(false);
                hideOverviewImage(); 
                hideImmediatePlaceholder(); 
                requestHistogramUpdate(); 
            });

            window.tiledViewer.addHandler('open-failed', function(event) {
                console.error("Failed to open tiled image (window.tiledViewer):", event);
                showNotification(false);
                hideImmediatePlaceholder();
                hideOverviewImage(); 
                showNotification(`Error loading tiled image: ${event.message || 'Unknown error'}`, 5000, 'error');
            });

        } else {
            console.log("Existing window.tiledViewer found, opening new tileSource.");
            hideImmediatePlaceholder();
            hideOverviewImage(); 
            window.tiledViewer.open(tileSource);
        }

    } catch (error) {
        console.error("Error initializing tiled viewer:", error);
        showNotification(false);
        hideImmediatePlaceholder();
        hideOverviewImage();
        showNotification(`Error during tiled viewer setup: ${error.message}`, 5000, 'error');
    }
}

        // static/main.js

        // MODIFIED showOverviewImage function (replace existing one)
        function showOverviewImage(base64Image) {
            console.log("showOverviewImage called.");
            let overviewContainer = document.getElementById('overview-container');
            if (!overviewContainer) {
                overviewContainer = document.createElement('div');
                overviewContainer.id = 'overview-container';
                overviewContainer.style.position = 'absolute';
                overviewContainer.style.top = '0';
                overviewContainer.style.left = '0';
                overviewContainer.style.width = '100%';
                overviewContainer.style.height = '100%';
                overviewContainer.style.display = 'flex';
                overviewContainer.style.justifyContent = 'center';
                overviewContainer.style.alignItems = 'center';
                overviewContainer.style.backgroundColor = '#000';
                overviewContainer.style.zIndex = '999'; // Ensure it's above viewer but below popups
                
                const osdContainer = document.getElementById('openseadragon');
                if (osdContainer) {
                    osdContainer.appendChild(overviewContainer);
        } else {
                    console.error("OpenSeadragon container not found for overview image.");
                    // If osdContainer is not found, we can't display or process the image.
                    window.histogramOverviewPixelData = null; // Clear any old cache
                    return; 
                }
            }
            
            const img = document.createElement('img');
            img.style.maxWidth = '100%';
            img.style.maxHeight = '100%';
        
            img.onload = function() {
                console.log("Overview image loaded in showOverviewImage, attempting to cache for histogram.");
                try {
                    const offscreenCanvas = document.createElement('canvas');
                    const imgWidth = img.naturalWidth;
                    const imgHeight = img.naturalHeight;
        
                    if (imgWidth === 0 || imgHeight === 0) {
                        console.warn("Overview image has zero dimensions, cannot cache for histogram.");
                        window.histogramOverviewPixelData = null;
                        return;
                    }
        
                    offscreenCanvas.width = imgWidth;
                    offscreenCanvas.height = imgHeight;
                    // Use { willReadFrequently: true } for potential performance benefits
                    const offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
                    if (!offscreenCtx) {
                         console.error("Could not get 2D context for offscreen canvas in showOverviewImage.");
                         window.histogramOverviewPixelData = null;
                         return;
                    }
                    offscreenCtx.drawImage(img, 0, 0);
                    const imageData = offscreenCtx.getImageData(0, 0, imgWidth, imgHeight);
                    const rawPixels = imageData.data;
                    
                    const overviewPixels2D = [];
                    for (let y = 0; y < imgHeight; y++) {
                        const row = [];
                        for (let x = 0; x < imgWidth; x++) {
                            // Assuming overview is grayscale, take the Red channel (index 0).
                            row.push(rawPixels[(y * imgWidth + x) * 4]); 
                        }
                        overviewPixels2D.push(row);
                    }
        
                    // IMPORTANT: Ensure window.fitsData and its min/max values are populated
                    // when this overview is being shown, or update this cache later if they arrive later.
                    // The initializeTiledViewer now attempts to set window.fitsData.min_value/max_value from tileInfo.
                    if (window.fitsData && typeof window.fitsData.min_value !== 'undefined' && typeof window.fitsData.max_value !== 'undefined') {
                        window.histogramOverviewPixelData = {
                            pixels: overviewPixels2D,
                            width: imgWidth,
                            height: imgHeight,
                            dataMin: window.fitsData.min_value, 
                            dataMax: window.fitsData.max_value,
                            pixelNativeMin: 0, // Assuming overview is 0-255 range after decoding
                            pixelNativeMax: 255
                        };
                        console.log("Cached overview pixel data for histogram:", window.histogramOverviewPixelData);
                    } else {
                        console.warn("window.fitsData or its min/max not available when caching overview in showOverviewImage. Histogram dataMin/dataMax might be incorrect or missing.");
                        window.histogramOverviewPixelData = {
                            pixels: overviewPixels2D,
                            width: imgWidth,
                            height: imgHeight,
                            dataMin: null, // Explicitly null if not available
                            dataMax: null, // Explicitly null if not available
                            pixelNativeMin: 0,
                            pixelNativeMax: 255
                        };
                    }
                } catch (e) {
                    console.error("Error processing and caching overview image for histogram in showOverviewImage:", e);
                    window.histogramOverviewPixelData = null; // Clear if error
                }
            };
        
            img.onerror = function() {
                console.error("Error loading overview image in showOverviewImage. Cannot cache for histogram.");
                window.histogramOverviewPixelData = null; // Clear on error
            };
            
            // Setting src should be done after onload/onerror are attached.
            img.src = `data:image/png;base64,${base64Image}`; 
            
            overviewContainer.innerHTML = ''; // Clear previous image if any
            overviewContainer.appendChild(img);
            overviewContainer.style.display = 'flex'; // Ensure it's visible
            overviewContainer.style.opacity = '1';
        }
// Hide overview image once tiles start loading
function hideOverviewImage() {
    overviewLoadingStopped = true; // Set flag to stop overview loading
    const overviewContainer = document.getElementById('overview-container');
    if (overviewContainer) {
        // Fade out animation
        overviewContainer.style.transition = 'opacity 0.5s ease-out';
        overviewContainer.style.opacity = '0';
        
        // Remove after animation
        setTimeout(() => {
            if (overviewContainer.parentNode) {
                overviewContainer.parentNode.removeChild(overviewContainer);
            }
        }, 500);
    }
}



// Update the overview image with better quality
function updateOverviewImage(url, quality) {
    console.log(`Updating overview image with quality level ${quality}`);
    
    const overviewContainer = document.getElementById('overview-container');
    if (overviewContainer) {
        // Find or create the image element
        let img = overviewContainer.querySelector('img');
        if (!img) {
            img = document.createElement('img');
            img.style.maxWidth = '100%';
            img.style.maxHeight = '100%';
            overviewContainer.innerHTML = '';
            overviewContainer.appendChild(img);
        }
        
        // Update the image source
        img.src = url;
        
        // Make sure the container is visible
        overviewContainer.style.display = 'flex';
        overviewContainer.style.opacity = '1';
    }
}

// Load overview at specified quality level
function loadOverviewAtQuality(quality) {
    if (overviewLoadingStopped) { // Check flag
        console.log("Overview loading stopped because main tiles are loading.");
        return;
    }
    fetch(`/fits-overview/${quality}`)
        .then(response => {
            if (!response.ok) {
                if (response.status === 404) {
                    // Overview not yet available, retry later
                    setTimeout(() => loadOverviewAtQuality(quality), 1000);
                }
                return null;
            }
            return response.blob();
        })
        .then(blob => {
            if (blob) {
                // Update the overview image
                const url = URL.createObjectURL(blob);
                updateOverviewImage(url, quality);
                
                // Load the next quality level if below max and not stopped
                if (quality < 100 && !overviewLoadingStopped) { // Added condition to stop recursion
                    setTimeout(() => loadOverviewAtQuality(quality + 1), 1000);
                }
            }
        })
        .catch(error => {
            console.error(`Error loading overview at quality ${quality}:`, error);
        });
}



function parseWCS(header) {
    if (!header) {
        console.error("No FITS header provided to parseWCS.");
        return { hasWCS: false, worldToPixels: () => null, pixelsToWorld: () => null };
    }

    function getProperty(obj, propName) {
        if (!obj || typeof propName !== 'string') return undefined;
        const upperCasePropName = propName.toUpperCase();
        if (obj.hasOwnProperty(upperCasePropName)) {
            return obj[upperCasePropName];
        }
        const lowerCasePropName = propName.toLowerCase();
        for (const key in obj) {
            if (key.toLowerCase() === lowerCasePropName) {
                return obj[key];
            }
        }
        return undefined;
    }

    const wcsInfo = {
        hasWCS: false,
        crval1: getProperty(header, 'CRVAL1'),
        crval2: getProperty(header, 'CRVAL2'),
        crpix1: getProperty(header, 'CRPIX1'),
        crpix2: getProperty(header, 'CRPIX2'),
        cd11: getProperty(header, 'CD1_1') || getProperty(header, 'CDELT1') || 1,
        cd12: getProperty(header, 'CD1_2') || 0,
        cd21: getProperty(header, 'CD2_1') || 0,
        cd22: getProperty(header, 'CD2_2') || getProperty(header, 'CDELT2') || 1,
        ctype1: getProperty(header, 'CTYPE1') || '',
        ctype2: getProperty(header, 'CTYPE2') || '',
        naxis1: getProperty(header, 'NAXIS1'),
        naxis2: getProperty(header, 'NAXIS2')
    };

    if (wcsInfo.crval1 !== undefined && wcsInfo.crval2 !== undefined &&
        wcsInfo.crpix1 !== undefined && wcsInfo.crpix2 !== undefined) {
        wcsInfo.hasWCS = true;
    } else {
        return { hasWCS: false, worldToPixels: () => null, pixelsToWorld: () => null };
    }

    wcsInfo.worldToPixels = (ra, dec) => {
        if (wcsInfo.ctype1.includes('RA---TAN') && wcsInfo.ctype2.includes('DEC--TAN')) {
            const D2R = Math.PI / 180.0;
            const R2D = 180.0 / Math.PI;

            const ra_rad = ra * D2R;
            const dec_rad = dec * D2R;

            const ra0_rad = wcsInfo.crval1 * D2R;
            const dec0_rad = wcsInfo.crval2 * D2R;

            const cos_dec = Math.cos(dec_rad);
            const cos_dec0 = Math.cos(dec0_rad);
            const sin_dec = Math.sin(dec_rad);
            const sin_dec0 = Math.sin(dec0_rad);

            const A = cos_dec * Math.cos(ra_rad - ra0_rad);
            const F = 1 / (sin_dec * sin_dec0 + A * cos_dec0);

            const X = F * cos_dec * Math.sin(ra_rad - ra0_rad);
            const Y = F * (sin_dec * cos_dec0 - A * sin_dec0);

            const xi = X * R2D;
            const eta = Y * R2D;

            const det = wcsInfo.cd11 * wcsInfo.cd22 - wcsInfo.cd12 * wcsInfo.cd21;
            const inv_det = 1.0 / det;
            const inv_cd11 = wcsInfo.cd22 * inv_det;
            const inv_cd12 = -wcsInfo.cd12 * inv_det;
            const inv_cd21 = -wcsInfo.cd21 * inv_det;
            const inv_cd22 = wcsInfo.cd11 * inv_det;

            let x = wcsInfo.crpix1 + inv_cd11 * xi + inv_cd12 * eta;
            let y = wcsInfo.crpix2 + inv_cd21 * xi + inv_cd22 * eta;

            // Adjust for 1-based FITS indexing
            x = x - 1;
            y = y - 1;

            return { x: x, y: y };
        }
        return null;
    };

    wcsInfo.pixelsToWorld = (x, y) => {
        if (wcsInfo.ctype1.includes('RA---TAN') && wcsInfo.ctype2.includes('DEC--TAN')) {
            const D2R = Math.PI / 180.0;

            const x_prime = x - wcsInfo.crpix1 + 1;
            const y_prime = y - wcsInfo.crpix2 + 1;

            const xi = (wcsInfo.cd11 * x_prime + wcsInfo.cd12 * y_prime) * D2R;
            const eta = (wcsInfo.cd21 * x_prime + wcsInfo.cd22 * y_prime) * D2R;

            const ra0_rad = wcsInfo.crval1 * D2R;
            const dec0_rad = wcsInfo.crval2 * D2R;

            const cos_dec0 = Math.cos(dec0_rad);
            const sin_dec0 = Math.sin(dec0_rad);

            const H = Math.sqrt(xi * xi + eta * eta);
            const delta = Math.atan(H);
            const sin_delta = Math.sin(delta);
            const cos_delta = Math.cos(delta);

            const dec_rad = Math.asin(cos_delta * sin_dec0 + (eta * sin_delta * cos_dec0) / H);
            const ra_rad = ra0_rad + Math.atan2(xi * sin_delta, H * cos_dec0 * cos_delta - eta * sin_dec0 * sin_delta);

            return { ra: ra_rad * 180 / Math.PI, dec: dec_rad * 180 / Math.PI };
        }
        return null;
    };

    return wcsInfo;
}




// THIS IS THE NEW ENTRY POINT for tiled/fast loading
function handleFastLoadingResponse(data, filepath) {
    if (!data || !data.tile_info) {
        console.error("Fast loading response is missing tile_info.", data);
        showNotification("Error: Invalid response from server for tiled loading.", 5000, 'error');
        return;
    }

    // Set the global filepath variable. THIS IS THE FIX.
    window.currentFitsFile = filepath;

    // Store basic FITS information globally. THIS IS THE 2ND FIX.
    // The data is now nested inside the tile_info object from the server.
    const tileInfo = data.tile_info;
    window.fitsData = {
        width: tileInfo.width,
        height: tileInfo.height,
        min_value: tileInfo.min_value,
        max_value: tileInfo.max_value,
        overview: tileInfo.overview, // This might be an object or a base64 string
        wcs: tileInfo.wcs,
        filename: filepath
    };

    // Hide any previous notifications
    showNotification(false);

    console.log("Handling fast loading mode response:", data);

    if (typeof clearAllCatalogs === 'function') {
        console.log("New FITS file opened (fast loader), clearing all existing catalogs.");
        clearAllCatalogs();
    }

    // Initialize the tiled viewer with the received tile info
    initializeTiledViewer(tileInfo, filepath)
        .then(() => {
            console.log("Tiled viewer initialized successfully after fast loading.");

            // Update UI elements now that the viewer is ready
            updateDynamicRangeButtonVisibility(true);

            // Fetch the full histogram from the server
            fetchServerHistogram();
            
            // Start loading overview images progressively
            loadProgressiveOverviews();
        })
        .catch(error => {
            console.error("Error initializing tiled viewer:", error);
            showNotification(`Error: ${error.message}`, 5000, 'error');
        });
}
// Load progressively better quality overviews
function loadProgressiveOverviews() {
    // Start with quality level 0
    loadOverviewAtQuality(0);
}





// Add this function to hide/show dynamic range controls based on image availability
function updateDynamicRangeButtonVisibility(show) {
    // const dynamicRangeButton = document.querySelector('.dynamic-range-button');
    // if (dynamicRangeButton) {
    //     dynamicRangeButton.style.display = show ? 'block' : 'none';
    // }
}

// Call this initially to hide the button when the app first loads
document.addEventListener("DOMContentLoaded", function() {
    // Initially hide the dynamic range button
    updateDynamicRangeButtonVisibility(false);
});


// Add this function to your code
function dumpWCSInfo() {
    if (!window.fitsData || !window.fitsData.wcs) {
      console.log("No WCS data available");
                return;
            }

    console.log("Raw WCS data:", window.fitsData.wcs);
    
    // If you've parsed the WCS
    if (window.parsedWCS) {
      console.log("Parsed WCS data:", window.parsedWCS);
      
      // Show transformation matrix
      if (window.parsedWCS.transformInfo) {
        console.log("Transform matrix:", {
          m11: window.parsedWCS.transformInfo.m11,
          m12: window.parsedWCS.transformInfo.m12,
          m21: window.parsedWCS.transformInfo.m21, 
          m22: window.parsedWCS.transformInfo.m22,
          rotation: window.parsedWCS.transformInfo.thetaDegrees + "°",
          flipped: window.parsedWCS.transformInfo.isFlipped
        });
      }
    }
  }


  


  


  // Function to create HDU selection popup
function createHduSelectorPopup(hduList, filepath) {
    // Create container for the popup
    const popup = document.createElement('div');
    popup.id = 'hdu-selector-popup';
    popup.style.position = 'fixed';
    popup.style.top = '50%';
    popup.style.left = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
    popup.style.backgroundColor = '#333';
    popup.style.border = '1px solid #555';
    popup.style.borderRadius = '5px';
    popup.style.padding = '15px';
    popup.style.zIndex = '2000';
    popup.style.width = '500px';
    popup.style.maxHeight = '80vh';
    popup.style.overflowY = 'auto';
    popup.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)';
    
    // Create title
    const title = document.createElement('h3');
    title.textContent = 'Select HDU to Display';
    title.style.margin = '0 0 15px 0';
    title.style.color = '#fff';
    title.style.fontFamily = 'Arial, sans-serif';
    title.style.fontSize = '18px';
    title.style.fontWeight = 'bold';
    title.style.borderBottom = '1px solid #555';
    title.style.paddingBottom = '10px';
    
    // Create description
    const description = document.createElement('p');
    description.textContent = 'This FITS file contains multiple data units (HDUs). Please select which one to open:';
    description.style.color = '#ddd';
    description.style.marginBottom = '15px';
    description.style.fontFamily = 'Arial, sans-serif';
    
    // Create selection container
    const selectionContainer = document.createElement('div');
    selectionContainer.style.display = 'flex';
    selectionContainer.style.flexDirection = 'column';
    selectionContainer.style.gap = '10px';
    selectionContainer.style.marginBottom = '15px';
    
    // Add each HDU as an option
    hduList.forEach((hdu, index) => {
        const option = document.createElement('div');
        option.className = 'hdu-option';
        option.style.padding = '10px';
        option.style.backgroundColor = '#444';
        option.style.borderRadius = '4px';
        option.style.cursor = 'pointer';
        option.style.transition = 'background-color 0.2s';
        
        // Hover effect
        option.addEventListener('mouseover', function() {
            this.style.backgroundColor = '#555';
        });
        option.addEventListener('mouseout', function() {
            this.style.backgroundColor = '#444';
        });
        
        // Create header for the option
        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.marginBottom = '5px';
        
        // Title for the option
        const optionTitle = document.createElement('div');
        optionTitle.style.fontWeight = 'bold';
        optionTitle.style.color = '#fff';
        optionTitle.textContent = `HDU ${index}: ${hdu.type}`;
        if (hdu.name && hdu.name !== '') {
            optionTitle.textContent += ` (${hdu.name})`;
        }
        
        // Add recommended badge if this is likely the best HDU
        if (hdu.isRecommended) {
            const badge = document.createElement('span');
            badge.textContent = 'Recommended';
            badge.style.backgroundColor = '#4CAF50';
            badge.style.color = 'white';
            badge.style.padding = '2px 6px';
            badge.style.borderRadius = '3px';
            badge.style.fontSize = '12px';
            badge.style.marginLeft = '10px';
            optionTitle.appendChild(badge);
        }
        
        header.appendChild(optionTitle);
        
        // Details container
        const details = document.createElement('div');
        details.style.fontSize = '13px';
        details.style.color = '#ccc';
        details.style.marginTop = '5px';
        
        // Display appropriate details based on HDU type
        if (hdu.type === 'Image' && hdu.dimensions) {
            details.innerHTML = `
                <div>Dimensions: ${hdu.dimensions.join(' x ')}</div>
                ${hdu.bitpix ? `<div>Data type: ${getBitpixDescription(hdu.bitpix)}</div>` : ''}
                ${hdu.hasWCS ? '<div>WCS: Available</div>' : ''}
            `;
        } else if (hdu.type === 'Table' && hdu.rows !== undefined) {
            details.innerHTML = `
                <div>Rows: ${hdu.rows}</div>
                ${hdu.columns ? `<div>Columns: ${hdu.columns}</div>` : ''}
            `;
        } else {
            details.innerHTML = '<div>No additional information available</div>';
        }
        
        // Append header and details to option
        option.appendChild(header);
        option.appendChild(details);
        
        // Add click handler to select this HDU
        option.addEventListener('click', function() {
            selectHdu(index, filepath);
            document.body.removeChild(popup);
        });
        
        selectionContainer.appendChild(option);
    });
    
    // Create button container
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'space-between';
    
    // Cancel button
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.style.flex = '1';
    cancelButton.style.marginRight = '10px';
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
        document.body.removeChild(popup);
    });
    
    // Auto-select primary HDU button
    const autoSelectButton = document.createElement('button');
    autoSelectButton.textContent = 'Use Recommended HDU';
    autoSelectButton.style.flex = '1';
    autoSelectButton.style.padding = '8px 0';
    autoSelectButton.style.backgroundColor = '#4CAF50';
    autoSelectButton.style.color = '#fff';
    autoSelectButton.style.border = 'none';
    autoSelectButton.style.borderRadius = '3px';
    autoSelectButton.style.cursor = 'pointer';
    autoSelectButton.style.fontFamily = 'Arial, sans-serif';
    autoSelectButton.style.fontSize = '14px';
    
    autoSelectButton.addEventListener('mouseover', () => {
        autoSelectButton.style.backgroundColor = '#45a049';
    });
    autoSelectButton.addEventListener('mouseout', () => {
        autoSelectButton.style.backgroundColor = '#4CAF50';
    });
    autoSelectButton.addEventListener('click', () => {
        // Find the recommended HDU index
        const recommendedIndex = hduList.findIndex(hdu => hdu.isRecommended);
        if (recommendedIndex >= 0) {
            selectHdu(recommendedIndex, filepath);
        } else {
            // If no recommended HDU, use the first one
            selectHdu(0, filepath);
        }
        document.body.removeChild(popup);
    });
    
    // Add buttons to container
    buttonContainer.appendChild(cancelButton);
    buttonContainer.appendChild(autoSelectButton);
    
    // Add all elements to popup
    popup.appendChild(title);
    popup.appendChild(description);
    popup.appendChild(selectionContainer);
    popup.appendChild(buttonContainer);
    
    // Add popup to document
    document.body.appendChild(popup);
    
    // Make popup draggable
    makeDraggable(popup, title);
}

// Helper function to convert BITPIX to a human-readable description
function getBitpixDescription(bitpix) {
    switch(bitpix) {
        case 8: return '8-bit unsigned integer';
        case 16: return '16-bit signed integer';
        case 32: return '32-bit signed integer';
        case -32: return '32-bit floating point';
        case -64: return '64-bit floating point';
        default: return `Unknown (${bitpix})`;
    }
}

// Function to select a specific HDU
// In static/main.js

async function selectHdu(hduIndex, filepath) {
    console.log(`Selected HDU ${hduIndex} from ${filepath}`);
    showNotification(`Loading HDU ${hduIndex}...`, 2000, "info");

    const hduPopup = document.getElementById('hdu-selector-popup');
    if (hduPopup) {
        hduPopup.style.display = 'none';
    }
    
    // The key change is here: We call /load-file which now returns the tileInfo.
    // This single call prepares the backend session and gives the frontend everything it needs.
    try {
        const response = await fetch(`/load-file/${filepath}?hdu=${hduIndex}`);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
        }
        
        const tileInfo = await response.json();
        
        // Pass the tileInfo to the handler that initializes the viewer
        await handleFastLoadingResponse(tileInfo, filepath);
        
    } catch (error) {
        console.error('Error loading FITS file for selected HDU:', error);
        showNotification(`Error loading HDU ${hduIndex}: ${error.message}`, "error");
    }
}
// Function to analyze the FITS file and get HDU information
function getFitsHduInfo(filepath) {
    return fetch(`/fits-hdu-info/${encodeURIComponent(filepath)}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Failed to get HDU info: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.error) {
                throw new Error(data.error);
            }
            return data.hduList;
        });
}

// Modify the original loadFitsFile function to check for multiple HDUs
function loadFitsFileWithHduSelection(filepath) {
    // Hide welcome elements if they exist
    const welcomeScreen = document.querySelector('.welcome-screen');
    if (welcomeScreen && welcomeScreen.parentNode) {
        welcomeScreen.parentNode.removeChild(welcomeScreen);
    }
    
    const welcomePointer = document.querySelector('.welcome-pointer');
    if (welcomePointer && welcomePointer.parentNode) {
        welcomePointer.parentNode.removeChild(welcomePointer);
    }
    
    showNotification(true, `Analyzing ${filepath}...`);
    
    // First check how many HDUs this file has
    getFitsHduInfo(filepath)
        .then(hduList => {
            showNotification(false);
            
            // If the file has multiple HDUs, show the selection popup
            if (hduList && hduList.length > 1) {
                console.log(`FITS file has ${hduList.length} HDUs. Showing selection popup.`);
                createHduSelectorPopup(hduList, filepath);
            } else {
                // If there's only one HDU, load it directly
                console.log('FITS file has only one HDU. Loading directly.');
                // Use the original loading function with HDU 0
                selectHdu(0, filepath);
            }
        })
        .catch(error => {
            console.error('Error analyzing FITS file:', error);
            showNotification(false);
            showNotification(`Error: ${error.message || 'Failed to analyze FITS file'}`, 5000);
            
            // If analysis fails, fall back to loading the primary HDU
            console.log('Falling back to loading primary HDU');
            selectHdu(0, filepath);
        });
}





// Define a global variable to track the current flag filtering state
let flagFilterEnabled = false;
let currentFlagColumn = null; // Will store the name of the current boolean column being used for filtering

let flagFilterButton = null;


// Replace the existing populateFlagDropdown function with this fixed version

// REPLACE your existing populateFlagDropdown function in catalogs.js with this fixed version

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
    
    // FIXED: Remove the condition that was preventing hover effects
    noFilterItem.addEventListener('mouseover', function() {
        if (!flagFilterEnabled) {
            this.style.backgroundColor = '#333';
        }
    });
    
    noFilterItem.addEventListener('mouseout', function() {
        if (!flagFilterEnabled) {
            this.style.backgroundColor = 'white';
            this.style.color = 'black';
        } else {
            this.style.backgroundColor = 'transparent';
            this.style.color = 'white';
        }
    });
    
// REPLACE the "No Filter" click handler in your populateFlagDropdown function in catalogs.js with this:

noFilterItem.addEventListener('click', function() {
    console.log('No Filter clicked - clearing all filters');
    
    // Disable flag filtering
    flagFilterEnabled = false;
    currentFlagColumn = null;
    currentEnvValue = null;
    
    // Clear global filter state
    window.flagFilterEnabled = false;
    window.currentFlagColumn = null;
    window.visibleObjectIndices = null;
    window.currentEnvValue = null;
    
    // FIXED: Clear passesFilter property on canvas overlay data
    if (window.catalogDataForOverlay) {
        console.log('Clearing passesFilter property on all canvas overlay objects');
        window.catalogDataForOverlay.forEach(obj => {
            obj.passesFilter = true; // Set to true to show all objects
        });
        
        // Force canvas redraw
        if (typeof canvasUpdateOverlay === 'function') {
            console.log('Calling canvasUpdateOverlay to refresh display');
            canvasUpdateOverlay();
        }
    }
    
    // Update the UI
    updateFlagFilterUI(dropdownContent);
    
    // Handle DOM-based dots (fallback for older system)
    if (window.catalogDots) {
        console.log('Also clearing DOM dots filter state');
        window.catalogDots.forEach(dot => {
            dot.style.display = 'block';
            dot.dataset.passesFilter = 'true';
        });
        
        // Update DOM overlay if function exists
        if (typeof updateOverlay === 'function') {
            updateOverlay();
        }
    }
    
    // Close the dropdown
    dropdownContent.style.display = 'none';
    
    showNotification('Showing all catalog objects', 1500, 'success');
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

// REPLACE your existing buildFlagDropdownFromCache function with this enhanced version

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
    
    // Check for environment column and collect unique env values
    let hasEnvColumn = false;
    const envValues = new Set();
    
    if (availableProperties.includes('env')) {
        hasEnvColumn = true;
        console.log('Found env column, checking values...');
        
        // Sample more objects to get better coverage of env values
        const sampleSize = Math.min(200, window.catalogDataWithFlags.length);
        
        for (let i = 0; i < sampleSize; i++) {
            const obj = window.catalogDataWithFlags[i];
            if (obj && obj.env !== null && obj.env !== undefined) {
                const envVal = parseInt(obj.env);
                if (!isNaN(envVal) && envVal >= 1 && envVal <= 10) {
                    envValues.add(envVal);
                }
            }
        }
        
        console.log('Found environment values:', Array.from(envValues).sort((a, b) => a - b));
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
    if (hasEnvColumn && envValues.size > 0) {
        // Add environment section header
        const envHeader = document.createElement('div');
        envHeader.style.padding = '8px 10px';
        envHeader.style.fontWeight = 'bold';
        envHeader.style.backgroundColor = '#2a2a2a';
        envHeader.style.borderBottom = '1px solid #555';
        envHeader.style.color = '#4CAF50';
        envHeader.style.fontSize = '13px';
        envHeader.textContent = `Environment Filters (${envValues.size} types)`;
        dropdownContent.appendChild(envHeader);
        
        // Sort environment values numerically
        const sortedEnvValues = Array.from(envValues).sort((a, b) => a - b);
        
        // Add each environment value using ENV_DESCRIPTIONS
        sortedEnvValues.forEach(envValue => {
            // Get description from ENV_DESCRIPTIONS or use default
            const description = ENV_DESCRIPTIONS[envValue] || `Environment ${envValue}`;
            
            const envItem = document.createElement('div');
            envItem.className = 'flag-item env-item';
            envItem.dataset.envValue = envValue;
            envItem.style.padding = '10px 15px'; // Indent environment items
            envItem.style.cursor = 'pointer';
            envItem.style.borderBottom = '1px solid #3a3a3a';
            envItem.style.color = 'white';
            envItem.style.fontSize = '13px';
            
            // Create the display text with value and description
            envItem.innerHTML = `
                <span style="color: #66bb6a; font-weight: bold;">Env ${envValue}:</span> 
                <span style="color: #fff;">${description}</span>
            `;
            
            // Highlight if currently selected
            if (flagFilterEnabled && currentFlagColumn === 'env' && currentEnvValue == envValue) {
                envItem.style.backgroundColor = 'white';
                envItem.style.color = 'black';
                envItem.innerHTML = `
                    <span style="color: #2e7d32; font-weight: bold;">Env ${envValue}:</span> 
                    <span style="color: #000;">${description}</span>
                `;
            }
            
            envItem.addEventListener('mouseover', function() {
                if (!(flagFilterEnabled && currentFlagColumn === 'env' && currentEnvValue == envValue)) {
                    this.style.backgroundColor = '#444';
                }
            });
            
            envItem.addEventListener('mouseout', function() {
                if (flagFilterEnabled && currentFlagColumn === 'env' && currentEnvValue == envValue) {
                    this.style.backgroundColor = 'white';
                    this.innerHTML = `
                        <span style="color: #2e7d32; font-weight: bold;">Env ${envValue}:</span> 
                        <span style="color: #000;">${description}</span>
                    `;
                } else {
                    this.style.backgroundColor = 'transparent';
                    this.innerHTML = `
                        <span style="color: #66bb6a; font-weight: bold;">Env ${envValue}:</span> 
                        <span style="color: #fff;">${description}</span>
                    `;
                }
            });
            
            envItem.addEventListener('click', function() {
                const selectedEnvValue = parseInt(this.dataset.envValue);
                console.log(`Environment filter clicked: Env ${selectedEnvValue} (${description})`);
                
                // Set filter state
                flagFilterEnabled = true;
                currentFlagColumn = 'env';
                currentEnvValue = selectedEnvValue;
                
                // Set global filter state
                window.flagFilterEnabled = true;
                window.currentFlagColumn = 'env';
                window.currentEnvValue = selectedEnvValue;
                
                // Apply the environment filter
                applyEnvironmentFilter(selectedEnvValue);
                
                // Update UI
                updateFlagFilterUI(dropdownContent);
                
                // Close dropdown
                dropdownContent.style.display = 'none';
            });
            
            dropdownContent.appendChild(envItem);
        });
        
        // Add section divider if we have boolean columns too
        if (actualBooleanColumns.size > 0) {
            const divider = document.createElement('div');
            divider.style.height = '1px';
            divider.style.backgroundColor = '#555';
            divider.style.margin = '5px 0';
            dropdownContent.appendChild(divider);
        }
    }
    
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

// ADD this new function to handle environment filtering

function applyEnvironmentFilter(envValue) {
    if (!window.catalogDataWithFlags) {
        console.warn('No catalog data available for environment filtering');
        showNotification('No catalog data available for filtering', 3000, 'warning');
        return;
    }
    
    console.log(`Applying environment filter for value: ${envValue} (${ENV_DESCRIPTIONS[envValue]})`);
    
    showNotification(true, `Filtering by ${ENV_DESCRIPTIONS[envValue]}...`);
    
    let visibleCount = 0;
    const targetEnvValue = parseInt(envValue);
    
    console.log(`Using target environment value: ${targetEnvValue} (${typeof targetEnvValue})`);
    
    // Handle canvas-based overlay
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
            } else {
                obj.passesFilter = false;
            }
        });
        
        // Update the canvas overlay
        updateCanvasOverlay();
    }
    
    // Handle DOM-based overlay (if catalogDots exist)
    if (window.catalogDots && window.catalogDots.length > 0) {
        console.log('Applying environment filter to DOM dots');
        
        window.catalogDots.forEach((dot, i) => {
            if (!dot || !dot.dataset) {
                console.warn(`Dot at index ${i} is invalid`);
                return;
            }
            
            // Get the object index from the dot's dataset
            const dotIndex = parseInt(dot.dataset.index);
            
            if (isNaN(dotIndex) || dotIndex >= window.catalogDataWithFlags.length) {
                dot.style.display = 'none';
                dot.dataset.passesFilter = 'false';
                return;
            }
            
            // Get the corresponding data object
            const objData = window.catalogDataWithFlags[dotIndex];
            let matchesEnv = false;
            
            if (objData && 'env' in objData) {
                const objEnvValue = parseInt(objData.env);
                matchesEnv = (objEnvValue === targetEnvValue);
                
                if (matchesEnv) {
                    visibleCount++;
                }
            }
            
            // Set dot visibility
            dot.style.display = matchesEnv ? 'block' : 'none';
            dot.dataset.passesFilter = matchesEnv ? 'true' : 'false';
        });
        
        // Update DOM overlay
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

// Also add this improved updateFlagFilterUI function to ensure proper visual feedback

function updateFlagFilterUI(dropdownContent) {
    // Update button appearance
    if (flagFilterButton) {
        if (flagFilterEnabled) {
            flagFilterButton.style.backgroundColor = '#007bff'; // Blue when filter active
            flagFilterButton.style.borderColor = '#007bff';
            flagFilterButton.style.color = 'white';
        } else {
            flagFilterButton.style.backgroundColor = '#444'; // Default gray
            flagFilterButton.style.borderColor = '#666';
            flagFilterButton.style.color = '#fff';
        }
    }
    
    // Update dropdown items
    const flagItems = dropdownContent.querySelectorAll('.flag-item');
    flagItems.forEach(item => {
        // Reset all items first
        item.style.backgroundColor = 'transparent';
        item.style.color = 'white';
        
        // Highlight selected item based on filtering mode
        if (item.textContent === 'No Filter (Show All)' && !flagFilterEnabled) {
            // No filter selected
            item.style.backgroundColor = 'white';
            item.style.color = 'black';
        } 
        else if (item.classList.contains('env-item') && 
                flagFilterEnabled && 
                currentFlagColumn === 'env' && 
                item.dataset.envValue == currentEnvValue) {
            // Environment value selected
            item.style.backgroundColor = 'white';
            item.style.color = 'black';
        }
        else if (!item.classList.contains('env-item') && 
                flagFilterEnabled &&
                item.textContent === currentFlagColumn && 
                currentEnvValue === null) {
            // Boolean flag selected
            item.style.backgroundColor = 'white';
            item.style.color = 'black';
        }
    });
}



function updateFlagFilterUI(dropdownContent) {
    // Update button appearance
    if (flagFilterButton) {
        if (flagFilterEnabled) {
            flagFilterButton.style.backgroundColor = '#007bff'; // Blue when filter active
            flagFilterButton.style.borderColor = '#007bff';
            flagFilterButton.style.color = 'white';
        } else {
            flagFilterButton.style.backgroundColor = '#444'; // Default gray
            flagFilterButton.style.borderColor = '#666';
            flagFilterButton.style.color = '#fff';
        }
    }
    
    // Update dropdown items
    const flagItems = dropdownContent.querySelectorAll('.flag-item');
    flagItems.forEach(item => {
        // Reset all items first
        item.style.backgroundColor = 'transparent';
        item.style.color = 'white';
        
        // Highlight selected item based on filtering mode
        if (item.textContent === 'No Filter (Show All)' && !flagFilterEnabled) {
            // No filter selected
            item.style.backgroundColor = 'white';
            item.style.color = 'black';
        } 
        else if (item.classList.contains('env-item') && 
                flagFilterEnabled && 
                currentFlagColumn === 'env' && 
                item.dataset.envValue == currentEnvValue) {
            // Environment value selected
            item.style.backgroundColor = 'white';
            item.style.color = 'black';
        }
        else if (!item.classList.contains('env-item') && 
                flagFilterEnabled &&
                item.textContent === currentFlagColumn && 
                currentEnvValue === null) {
            // Boolean flag selected
            item.style.backgroundColor = 'white';
            item.style.color = 'black';
        }
    });
}

// Add this helper function to debug the filter state
function debugFilterState() {
    console.log('=== FILTER DEBUG STATE ===');
    console.log('flagFilterEnabled:', flagFilterEnabled);
    console.log('currentFlagColumn:', currentFlagColumn);
    console.log('currentEnvValue:', currentEnvValue);
    console.log('window.flagFilterEnabled:', window.flagFilterEnabled);
    console.log('window.catalogDots length:', window.catalogDots?.length);
    console.log('window.catalogDataWithFlags length:', window.catalogDataWithFlags?.length);
    
    if (window.catalogDots && window.catalogDots.length > 0) {
        const visibleCount = window.catalogDots.filter(dot => 
            dot.style.display !== 'none'
        ).length;
        console.log('Currently visible dots:', visibleCount);
    }
}


function debugFlagFilterButton() {
    const container = document.querySelector('.flag-filter-container');
    const button = document.querySelector('.flag-filter-button');
    const toolbar = document.querySelector('.toolbar');
    
    console.log('=== FLAG FILTER BUTTON DEBUG ===');
    console.log('Container exists:', !!container);
    console.log('Button exists:', !!button);
    console.log('Toolbar exists:', !!toolbar);
    
    if (container) {
        console.log('Container display:', window.getComputedStyle(container).display);
        console.log('Container visibility:', window.getComputedStyle(container).visibility);
        console.log('Container in DOM:', document.body.contains(container));
    }
    
    if (button) {
        console.log('Button display:', window.getComputedStyle(button).display);
        console.log('Button visibility:', window.getComputedStyle(button).visibility);
        console.log('Button dimensions:', button.getBoundingClientRect());
    }
    
    if (toolbar) {
        console.log('Toolbar children count:', toolbar.children.length);
        console.log('Toolbar children:', Array.from(toolbar.children).map(child => child.className));
    }
}

// Run this in your browser console after loading a catalog

function createFlagFilterButton() {
    // Check if button already exists
    const existingButton = document.querySelector('.flag-filter-container');
    if (existingButton) {
        // If it exists, force it to be visible
        existingButton.style.cssText = `
               display: inline-block !important;
    position: relative !important;
    width: auto !important;
    height: 100%;
    margin-right: 5px !important;
    margin-left: 5px;
    margin-top: 5px;
        `;
        const button = existingButton.querySelector('.flag-filter-button');
        if (button) {
            button.style.cssText = `
                  width: 38px !important;
    height: 41px !important;
    min-width: 32px !important;
    min-height: 32px !important;
    color: rgb(255, 255, 255) !important;
    border: 1px solid white !important;
    cursor: pointer !important;
    align-items: center !important;
    justify-content: center !important;
    box-sizing: border-box !important;
    margin: 0px 0px !important;
    border-radius: 0px !important;
    margin-top: 5px !important;
    position: relative;
    top: 1px;
            `;
        }
        return existingButton;
    }
    
    // Create a button container
    const flagFilterContainer = document.createElement('div');
    flagFilterContainer.className = 'flag-filter-container';
    flagFilterContainer.style.cssText = `
        display: inline-block !important;
    position: relative !important;
    width: auto !important;
    height: 100%;
    margin-right: 5px !important;
    margin-left: 5px;
    margin-top: 5px;
    `;
    
    // Create the main button with just an icon
    flagFilterButton = document.createElement('button');
    flagFilterButton.className = 'flag-filter-button';
    flagFilterButton.title = 'Filter regions by catalog flags';
    flagFilterButton.style.cssText = `
         width: 38px !important;
    height: 41px !important;
    min-width: 32px !important;
    min-height: 32px !important;
    color: rgb(255, 255, 255) !important;
    border: 1px solid white !important;
    cursor: pointer !important;
    align-items: center !important;
    justify-content: center !important;
    box-sizing: border-box !important;
    margin: 0px 0px !important;
    border-radius: 0px !important;
    margin-top: 5px !important;
    position: relative;
    top: 1px;
    `;

    // Use a filter icon
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.style.cssText = `
        fill: currentColor !important;
        display: block !important;
        width: 16px !important;
        height: 16px !important;
    `;
    
    // Create the filter icon paths
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", "M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z");
    svg.appendChild(path);
    
    flagFilterButton.appendChild(svg);
    
    // Add event listener for the dropdown
  // In createFlagFilterButton function, replace the click event listener with:
flagFilterButton.addEventListener('click', function(event) {
    event.stopPropagation();
    
    let dropdownContent = flagFilterContainer.querySelector('.flag-dropdown-content');
    
    if (!dropdownContent) {
        dropdownContent = document.createElement('div');
        dropdownContent.className = 'flag-dropdown-content';
        dropdownContent.style.cssText = `
            display: none !important;
            position: absolute !important;
            background-color: #222 !important;
            min-width: 250px !important;
            box-shadow: 0px 8px 16px 0px rgba(0,0,0,0.4) !important;
            z-index: 1000 !important;
            border-radius: 4px !important;
            top: 100% !important;
            right: 0 !important;
            margin-top: 5px !important;
            max-height: 400px !important;
            overflow-y: auto !important;
        `;
        flagFilterContainer.appendChild(dropdownContent);
    }
    
    if (dropdownContent.style.display === 'none') {
        dropdownContent.style.display = 'block';
        
        // Call populateFlagDropdown directly - it will handle the catalog detection
        if (typeof populateFlagDropdown === 'function') {
            populateFlagDropdown(dropdownContent);
        } else {
            console.error('populateFlagDropdown function not found');
            dropdownContent.innerHTML = '<div style="padding: 10px; color: #f44;">populateFlagDropdown function missing</div>';
        }
    } else {
        dropdownContent.style.display = 'none';
    }
});
    
    // Close dropdown when clicking outside
    document.addEventListener('click', function(event) {
        const dropdownContent = flagFilterContainer.querySelector('.flag-dropdown-content');
        if (dropdownContent && !flagFilterContainer.contains(event.target)) {
            dropdownContent.style.display = 'none';
        }
    });
    
    // Add the button to the container
    flagFilterContainer.appendChild(flagFilterButton);
    
    // Find the toolbar
    const toolbar = document.querySelector('.toolbar');
    if (!toolbar) {
        console.error('Toolbar not found for flag filter button');
        return null;
    }
    
    // Find the histogram button or any other reference element in the toolbar
    const existingHistogramButton = toolbar.querySelector('.dynamic-range-button');
    const zoomInButton = toolbar.querySelector('button:first-child');

    // Insert the flag filter button in the appropriate position
    if (existingHistogramButton) {
        // toolbar.insertBefore(flagFilterContainer, existingHistogramButton);
        console.log("Inserted flag filter button before histogram button");
    } else if (zoomInButton) {
        toolbar.insertBefore(flagFilterContainer, zoomInButton);
        console.log("Inserted flag filter button before first button");
    } else {
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



// New endpoint to get all catalog data with flags in a single request
function loadCatalogWithFlags(catalogName) {
    showNotification(true, 'Loading catalog with flag data...');
    
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
            
            showNotification(false);
        })
        .catch(error => {
            console.error('Error loading catalog with flags:', error);
            showNotification(false);
            showNotification('Error loading catalog data', 3000);
        });
}



// Enhanced coordinates display with animations
(function() {
    // Set up DOM utility functions
    function waitForElement(selector, maxWaitTime = 10000) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(selector)) {
                return resolve(document.querySelector(selector));
            }
            
            const observer = new MutationObserver(mutations => {
                if (document.querySelector(selector)) {
                    observer.disconnect();
                    resolve(document.querySelector(selector));
                }
            });
            
            observer.observe(document.body, { childList: true, subtree: true });
            
            setTimeout(() => {
                observer.disconnect();
                resolve(document.querySelector(selector));
            }, maxWaitTime);
        });
    }
    
    // Create the coordinates display element with enhanced styling
    function createCoordinatesElement() {
        // Add CSS for animations
        const styleElement = document.createElement('style');
        styleElement.textContent = `
            @keyframes numberChange {
                0% { opacity: 0.3; transform: scale(0.95); }
                50% { opacity: 1; transform: scale(1.05); }
                100% { opacity: 1; transform: scale(1); }
            }
            
            .coord-value {
                display: inline-block;
                transition: all 0.2s ease-out;
                min-width: 3.5em;
                text-align: right;
            }
            
            .coord-value.changing {
                animation: numberChange 0.3s ease-out;
            }
            
            .coords-container {
                transition: all 0.3s ease;
                opacity: 0;
                transform: translateY(-5px);
            }
            
            .coords-container.visible {
                opacity: 1;
                transform: translateY(0);
            }
            
            .coord-label {
                color: #8899aa;
                font-weight: normal;
            }
            
            .coord-unit {
                color: #6699cc;
                font-size: 0.9em;
                margin-left: 4px;
            }
        `;
        document.head.appendChild(styleElement);
        
        // Create the main container
        const coords = document.createElement('div');
        coords.id = 'osd-coordinates';
        coords.style.position = 'absolute';
        coords.style.top = '10px';
        coords.style.left = '10px';
        coords.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        coords.style.color = 'white';
        coords.style.padding = '8px 10px';
        coords.style.borderRadius = '4px';
        coords.style.fontSize = '12px';
        coords.style.fontFamily = 'monospace';
        coords.style.zIndex = '1000';
        coords.style.pointerEvents = 'none';
        coords.style.backdropFilter = 'blur(2px)';
        coords.style.webkitBackdropFilter = 'blur(2px)';
        coords.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.3)';
        coords.style.textShadow = '0 1px 2px rgba(0, 0, 0, 0.5)';
        coords.style.width = 'auto';
        coords.style.whiteSpace = 'nowrap';
        
        // Add inner container for fade-in/out animation
        const container = document.createElement('div');
        container.className = 'coords-container';
        
        // Create structured layout for coordinates
        container.innerHTML = `
            <div class="coord-row">
                <span class="coord-label">X,Y:</span> 
                <span class="coord-value" id="coord-x">-</span>,
                <span class="coord-value" id="coord-y">-</span>
            </div>
            <div class="coord-row">
                <span class="coord-label">RA,DEC:</span> 
                <span class="coord-value" id="coord-ra">-</span>,
                <span class="coord-value" id="coord-dec">-</span>
            </div>
            <div class="coord-row">
                <span class="coord-label">Value:</span> 
                <span class="coord-value" id="coord-value">-</span>
                <span class="coord-unit" id="coord-unit"></span>
            </div>
        `;
        
        coords.appendChild(container);
        
        // Show the container with animation
        setTimeout(() => {
            container.classList.add('visible');
        }, 100);
        
        return coords;
    }
    
    // Function to update a value with animation
    function updateValueWithAnimation(elementId, newValue) {
        const element = document.getElementById(elementId);
        if (!element) return;
        
        // Only animate if value is actually changing
        if (element.textContent !== newValue) {
            // Remove animation class if it exists
            element.classList.remove('changing');
            
            // Trigger reflow to restart animation
            void element.offsetWidth;
            
            // Update value and add animation class
            element.textContent = newValue;
            element.classList.add('changing');
        }
    }
    
    // Initialize the coordinates display
    async function initCoordinates() {
        console.log("Starting coordinates display initialization");
        
        // Wait for the OpenSeadragon container to be available
        const container = await waitForElement('#openseadragon');
        if (!container) {
            console.warn("OpenSeadragon container not found for coordinates");
            return;
        }
        
        console.log("Found OpenSeadragon container for coordinates");
        
        // Remove any existing coordinate display
        const existing = document.getElementById('osd-coordinates');
        if (existing) {
            console.log("Removing existing coordinates display");
            existing.remove();
        }
        
        // Create new coordinates display
        const coordsDisplay = createCoordinatesElement();
        if (!coordsDisplay) {
            console.error("Failed to create coordinates element!");
            return;
        }
        container.appendChild(coordsDisplay);
        
        console.log("Coordinates display element added to container");
        
        // Get the inner container for animations
        const innerContainer = coordsDisplay.querySelector('.coords-container');
        if (!innerContainer) {
            console.error("Could not find .coords-container within the coordinates display element");
            return;
        }
        
        // Set up event listeners using direct DOM events
        console.log("Adding mousemove listener for coordinates");
        container.addEventListener('mousemove', function(event) {
            // Ensure viewer and fitsData are available
            const currentViewer = window.viewer || window.tiledViewer; // Find the active viewer
            
            if (!currentViewer) {
                 // console.log("mousemove: No viewer found");
                 if (innerContainer) innerContainer.classList.remove('visible'); 
                 return;
            }
            if (!currentViewer.world) {
                 // console.log("mousemove: Viewer found, but no world");
                 if (innerContainer) innerContainer.classList.remove('visible');
                 return;
            }
             if (!currentViewer.world.getItemAt(0)) {
                 // console.log("mousemove: Viewer world found, but no item at index 0");
                 if (innerContainer) innerContainer.classList.remove('visible');
                 return;
            }
             if (!window.fitsData) {
                 // console.log("mousemove: No FITS data found");
                 if (innerContainer) innerContainer.classList.remove('visible');
                 return;
            }
             
             // console.log("mousemove: Viewer and FITS data OK"); // Log on success if needed

            // // Ensure WCS is parsed (assuming it's stored in window.parsedWCS after loading)
            // if (!window.parsedWCS && window.fitsData.wcs) {
            //      // console.log("mousemove: Attempting to parse WCS");
            //      try {
            //          window.parsedWCS = parseWCS(window.fitsData.wcs);
            //          // console.log("WCS parsed successfully for coordinate display.");
            //      } catch (e) {
            //          console.error("Failed to parse WCS for coordinate display:", e);
            //          window.parsedWCS = null; // Mark as failed
            //      }
            // }


            // Make sure container is visible
            if (innerContainer) {
                // console.log("mousemove: Adding 'visible' class"); // Optional log
                innerContainer.classList.add('visible');
            } else {
                 // console.log("mousemove: innerContainer not found when trying to make visible");
                 return; // Should not happen if init checks passed
            }

            // Get mouse position relative to the viewer element
            let viewportPoint;
            try {
                // More defensive check for mouseTracker
                if (!currentViewer.mouseTracker) {
                    // console.log("mousemove: currentViewer.mouseTracker is not available.");
                    if (innerContainer) innerContainer.classList.remove('visible');
                    return;
                }
                const mousePos = currentViewer.mouseTracker.getMousePosition(event);
                 if (!mousePos) {
                    // console.log("mousemove: getMousePosition returned null");
                    if (innerContainer) innerContainer.classList.remove('visible');
                    return;
                 }
                viewportPoint = currentViewer.viewport.pointFromPixel(mousePos);
                 if (!viewportPoint) {
                    // console.log("mousemove: pointFromPixel returned null");
                    if (innerContainer) innerContainer.classList.remove('visible');
                     return;
                 }
            } catch (e) {
                console.error("mousemove: Error getting viewport point:", e);
                if (innerContainer) innerContainer.classList.remove('visible');
                return;
            }
            // console.log("mousemove: Got viewport point:", viewportPoint);


            // Check if the point is within the image bounds
             const imageBounds = currentViewer.world.getItemAt(0).getBounds();
             if (!imageBounds) {
                 console.log("mousemove: Could not get image bounds");
                 return;
             }
             // console.log("mousemove: Image bounds:", imageBounds); // Optional log
             
             if (!imageBounds.containsPoint(viewportPoint)) {
                 // console.log("mousemove: Mouse is outside image bounds"); // Optional log
                 if (innerContainer) innerContainer.classList.remove('visible'); 
                 // Reset values or let mouseleave handle it
                 updateValueWithAnimation('coord-x', '-');
                 updateValueWithAnimation('coord-y', '-');
                 updateValueWithAnimation('coord-ra', '-');
                 updateValueWithAnimation('coord-dec', '-');
                 updateValueWithAnimation('coord-value', '-');
                 document.getElementById('coord-unit').textContent = '';
                 return;
             }

            // Coordinates are in the image coordinate system (0 to width, 0 to height)
            const imageX = Math.round(viewportPoint.x);
            const imageY = Math.round(viewportPoint.y);
            // console.log(`mousemove: Image coords: (${imageX}, ${imageY})`); // Optional log


            // Update pixel coordinates with animation
            updateValueWithAnimation('coord-x', imageX);
            updateValueWithAnimation('coord-y', imageY);

            // Calculate RA/DEC if WCS info is available and parsed
            if (window.parsedWCS) {
                // console.log("mousemove: Calculating RA/DEC"); // Optional log
                try {
                    // Use the pre-parsed WCS object
                    const celestial = pixelToCelestial(imageX, imageY, window.parsedWCS);
                     if (!celestial) {
                         console.log("mousemove: pixelToCelestial returned null/undefined");
                         updateValueWithAnimation('coord-ra', '?'); // Indicate error
                         updateValueWithAnimation('coord-dec', '?');
                     } else {
                        updateValueWithAnimation('coord-ra', celestial.ra.toFixed(4));
                        updateValueWithAnimation('coord-dec', celestial.dec.toFixed(4));
                     }
                } catch (e) {
                     console.error("Error converting pixel to celestial:", e); // Log error
                    updateValueWithAnimation('coord-ra', 'Err'); // Indicate error
                    updateValueWithAnimation('coord-dec', 'Err');
                }
            } else {
                // console.log("mousemove: No parsed WCS for RA/DEC"); // Optional log
                updateValueWithAnimation('coord-ra', '-');
                updateValueWithAnimation('coord-dec', '-');
            }

            // Try to get pixel value using the dedicated function
             // console.log("mousemove: Getting pixel value"); // Optional log
             try {
                 // Use getFitsPixel for potentially complex data access
                 const value = getFitsPixel(imageX, imageY); // Assuming getFitsPixel handles data access logic
                 // console.log(`mousemove: Pixel value raw: ${value}`); // Optional log
                 
                 if (typeof value === 'number' && !isNaN(value)) {
                     // console.log(`mousemove: Pixel value formatted: ${value.toExponential(4)}`); // Optional log
                     updateValueWithAnimation('coord-value', value.toExponential(4));
                     const bunit = getBunit(); // Keep using helper for BUNIT
                     // console.log(`mousemove: Bunit: ${bunit}`); // Optional log
                     document.getElementById('coord-unit').textContent = bunit || '';
                 } else {
                      // console.log("mousemove: Pixel value is not a valid number"); // Optional log
                      updateValueWithAnimation('coord-value', '-');
                      document.getElementById('coord-unit').textContent = '';
                 }
             } catch (e) {
                  console.error("Error getting pixel value:", e); // Log error
                 updateValueWithAnimation('coord-value', 'Err'); // Indicate error
                 document.getElementById('coord-unit').textContent = '';
             }
        });
        
        // Handle mouse leave
        console.log("Adding mouseleave listener for coordinates");
        container.addEventListener('mouseleave', function() {
            // console.log("mouseleave triggered for coordinates"); // Optional log
            // Fade out animation
            if (innerContainer) {
                innerContainer.classList.remove('visible');
            }
            
            // Reset values after animation completes
            setTimeout(() => {
                if (innerContainer && !innerContainer.classList.contains('visible')) {
                    // console.log("Resetting coordinate values on mouseleave timeout"); // Optional log
                    updateValueWithAnimation('coord-x', '-');
                    updateValueWithAnimation('coord-y', '-');
                    updateValueWithAnimation('coord-ra', '-');
                    updateValueWithAnimation('coord-dec', '-');
                    updateValueWithAnimation('coord-value', '-');
                    document.getElementById('coord-unit').textContent = '';
                }
            }, 300); // Corresponds to CSS transition time
        });
        
        // Make this function available globally
        window.updateCoordinatesDisplay = function() {
            console.log("updateCoordinatesDisplay called");
            // This function can be called when new images are loaded
            const coordsContainer = document.querySelector('.coords-container');
            if (coordsContainer) coordsContainer.classList.remove('visible');
        };
        
        console.log("Coordinates display initialization finished.");
        return coordsDisplay;
    }
    
    // Helper function to get BUNIT from FITS data
    function getBunit() {
        // Check if bunit is available in wcs object
        if (window.fitsData && window.fitsData.wcs && window.fitsData.wcs.bunit) {
            return window.fitsData.wcs.bunit;
        }
        
        // Try parsedWCS if it exists
        if (window.parsedWCS && window.parsedWCS.bunit) {
            return window.parsedWCS.bunit;
        }
        
        // Check if bunit is directly in fitsData
        if (window.fitsData && window.fitsData.bunit) {
            return window.fitsData.bunit;
        }
        
        return '';
    }
    
    // Watch for OpenSeadragon initialization
    function watchForInitialization() {
        // Set a flag to track if initialization has been attempted
        if (window._coordsInitialized) return;
        window._coordsInitialized = true;
        
        console.log("Watching for OpenSeadragon initialization");
        
        // First attempt - delayed start
        setTimeout(initCoordinates, 2000);
        
        // Watch for FITS data changes which indicate a new image has been loaded
        let previousFitsData = null;
        
        // Check periodically for FITS data changes
        const dataCheckInterval = setInterval(function() {
            if (window.fitsData && window.fitsData !== previousFitsData) {
                console.log("FITS data changed, updating coordinates display");
                previousFitsData = window.fitsData;
                initCoordinates();
            }
        }, 2000);
        
        // Stop checking after 5 minutes to prevent resource waste
        setTimeout(function() {
            clearInterval(dataCheckInterval);
        }, 300000);
    }
    
    // Start watching for initialization
    watchForInitialization();
    
    // Add a dedicated function for manual initialization
    window.initNavigatorCoordinates = function() {
        console.log("Manual initialization of coordinates display");
        return initCoordinates();
    };
    
    // Execute initialization when script loads
    setTimeout(initCoordinates, 1000);
})();





// Function to enable pixel-perfect mode that waits for viewer to be ready
function enablePixelPerfectMode() {
    console.log("Searching for OpenSeadragon viewer...");
    
    // Find the viewer using various methods
    const findViewer = () => {
        // Direct references first
        if (window.viewer && window.viewer.drawer) return window.viewer;
        if (window.tiledViewer && window.tiledViewer.drawer) return window.tiledViewer;
        
        // Search for any property that looks like an OpenSeadragon viewer
        for (const key in window) {
            try {
                const obj = window[key];
                if (obj && 
                    typeof obj === 'object' && 
                    obj.drawer && 
                    obj.viewport && 
                    typeof obj.forceRedraw === 'function') {
                    console.log(`Found viewer at window.${key}`);
                    return obj;
                }
            } catch (e) {
                // Skip any properties that throw errors when accessed
            }
        }
        
        return null;
    };
    
    // Try to find the viewer
    let viewer = findViewer();
    
    // If we can't find it, wait and try again
    if (!viewer) {
        console.log("Viewer not found. Setting up observer to wait for it...");
        
        // Set up a MutationObserver to watch for the viewer being added
        const observer = new MutationObserver((mutations) => {
            // Check if we can find the viewer now
            viewer = findViewer();
            if (viewer) {
                observer.disconnect();
                console.log("Viewer found after waiting!");
                applyPixelMode(viewer);
            }
        });
        
        // Start observing
        observer.observe(document.body, { 
            childList: true, 
            subtree: true 
        });
        
        // Also try again after a delay
        setTimeout(() => {
            if (!viewer) {
                viewer = findViewer();
                if (viewer) {
                    observer.disconnect();
                    console.log("Viewer found after timeout!");
                    applyPixelMode(viewer);
                } else {
                    console.log("Still couldn't find viewer after waiting.");
                }
            }
        }, 2000);
        
        return false;
    }
    
    // If we found the viewer, apply pixel mode
    return applyPixelMode(viewer);
}

// Function to actually apply pixel mode once we have a viewer
function applyPixelMode(viewer) {
    if (!viewer) return false;
    
    console.log("Applying pixel mode to viewer:", viewer);
    
    try {
        // Don't try to set pixelMode property if it's causing errors
        // viewer.pixelMode = true;
        
        // Instead, directly apply the settings we need
        
        // Disable image smoothing on the drawer
        if (viewer.drawer && viewer.drawer.context) {
            viewer.drawer.context.imageSmoothingEnabled = false;
            viewer.drawer.context.mozImageSmoothingEnabled = false;
            viewer.drawer.context.webkitImageSmoothingEnabled = false;
            viewer.drawer.context.msImageSmoothingEnabled = false;
            console.log("Disabled smoothing on drawer context");
        }
        
        // Apply to all current tiles
        if (viewer.tileCache) {
            const tileKeys = Object.keys(viewer.tileCache.cache || {});
            console.log(`Found ${tileKeys.length} tiles in cache`);
            
            tileKeys.forEach(key => {
                const tile = viewer.tileCache.cache[key];
                if (tile && tile.context) {
                    tile.context.imageSmoothingEnabled = false;
                    tile.context.mozImageSmoothingEnabled = false;
                    tile.context.webkitImageSmoothingEnabled = false;
                    tile.context.msImageSmoothingEnabled = false;
                }
            });
        }
        
        // Set up handler for future tiles
        viewer.addHandler('tile-drawn', function(event) {
            if (event.tile && event.tile.context) {
                event.tile.context.imageSmoothingEnabled = false;
                event.tile.context.mozImageSmoothingEnabled = false;
                event.tile.context.webkitImageSmoothingEnabled = false;
                event.tile.context.msImageSmoothingEnabled = false;
            }
        });
        
        // Force a redraw to apply changes
        console.log("Forcing redraw...");
        viewer.forceRedraw();
        
        return true;
    } catch (error) {
        console.error("Error applying pixel mode:", error);
        return false;
    }
}

// Also try to directly modify any canvas elements we can find
function updateAllCanvases() {
    // Find all canvases in the document
    const canvases = document.querySelectorAll('canvas');
    console.log(`Found ${canvases.length} canvas elements`);
    
    canvases.forEach((canvas, index) => {
        try {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.imageSmoothingEnabled = false;
                ctx.mozImageSmoothingEnabled = false;
                ctx.webkitImageSmoothingEnabled = false;
                ctx.msImageSmoothingEnabled = false;
                console.log(`Disabled smoothing on canvas #${index}`);
            }
        } catch (e) {
            console.error(`Error updating canvas #${index}:`, e);
        }
    });
    
    return canvases.length;
}

// Try both approaches
console.log("Starting pixel-perfect mode implementation...");
const viewerResult = enablePixelPerfectMode();
const canvasCount = updateAllCanvases();
console.log(`Applied changes to canvases: ${canvasCount}, viewer update: ${viewerResult}`);

// --- NEW: Interaction Logic ---
function addHistogramInteraction(canvas, minInput, maxInput) {
    let startX = 0;

    const getMousePos = (evt) => {
        const rect = canvas.getBoundingClientRect();
        // Adjust for touch events
        const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
        return {
            x: clientX - rect.left,
            y: (evt.touches ? evt.touches[0].clientY : evt.clientY) - rect.top
        };
    };

    const xToValue = (x) => {
        const { padding, histWidth, dataMin, dataRange } = histogramScaleInfo;
        const plotX = Math.max(padding.left, Math.min(padding.left + histWidth, x));
        const value = dataMin + ((plotX - padding.left) / histWidth) * dataRange;
        // Ensure the value respects potential bounds if necessary, e.g., non-negative
        // For now, just return the calculated value
        return value;
    };

     const valueToX = (value) => {
         const { padding, histWidth, dataMin, dataRange } = histogramScaleInfo;
         // Clamp value to the *currently displayed* histogram range before converting
         const clampedValue = Math.max(dataMin, Math.min(dataMin + dataRange, value));
         return padding.left + ((clampedValue - dataMin) / dataRange) * histWidth;
     };


    const handleMouseDown = (evt) => {
        evt.preventDefault(); // Prevent text selection, etc.
        const pos = getMousePos(evt);
        const currentMin = parseFloat(minInput.value);
        const currentMax = parseFloat(maxInput.value);

        if (isNaN(currentMin) || isNaN(currentMax) || !histogramScaleInfo.histWidth) return; // Need valid inputs and scale

        const minX = valueToX(currentMin);
        const maxX = valueToX(currentMax);

        if (Math.abs(pos.x - minX) <= DRAG_THRESHOLD) {
            isDraggingLine = 'min';
            startX = pos.x;
            canvas.style.cursor = 'ew-resize';
        } else if (Math.abs(pos.x - maxX) <= DRAG_THRESHOLD) {
            isDraggingLine = 'max';
            startX = pos.x;
            canvas.style.cursor = 'ew-resize';
        } else {
            isDraggingLine = null;
        }
    };

    const handleMouseMove = (evt) => {
        if (!isDraggingLine) return;
        evt.preventDefault();

        const pos = getMousePos(evt);
        const newValue = xToValue(pos.x);
        const currentMin = parseFloat(minInput.value);
        const currentMax = parseFloat(maxInput.value);

        if (isDraggingLine === 'min') {
             // Ensure min doesn't go above max
             if (newValue < currentMax) {
                minInput.value = newValue.toFixed(2);
                // Throttle the histogram update for performance during drag
                if (throttledHistogramUpdate) throttledHistogramUpdate();
             }
        } else if (isDraggingLine === 'max') {
             // Ensure max doesn't go below min
             if (newValue > currentMin) {
                maxInput.value = newValue.toFixed(2);
                 // Throttle the histogram update for performance during drag
                if (throttledHistogramUpdate) throttledHistogramUpdate();
             }
        }
    };

    const handleMouseUpOrLeave = (evt) => {
        if (isDraggingLine) {
            isDraggingLine = null;
            canvas.style.cursor = 'default';
            // Apply the changes after dragging stops (debounced)
             if (debouncedApplyDynamicRange) {
                 debouncedApplyDynamicRange();
             } else {
                 // Fallback if debounce isn't ready
                 applyDynamicRange();
             }
        }
    };

    // Add listeners
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUpOrLeave);
    canvas.addEventListener('mouseleave', handleMouseUpOrLeave);

    // Add touch listeners
    canvas.addEventListener('touchstart', handleMouseDown, { passive: false });
    canvas.addEventListener('touchmove', handleMouseMove, { passive: false });
    canvas.addEventListener('touchend', handleMouseUpOrLeave);
    canvas.addEventListener('touchcancel', handleMouseUpOrLeave);


     // Store cleanup function to remove listeners if popup is destroyed
     // (Although in this app, the popup seems to be hidden, not destroyed)
     canvas._removeHistogramInteraction = () => {
         canvas.removeEventListener('mousedown', handleMouseDown);
         canvas.removeEventListener('mousemove', handleMouseMove);
         canvas.removeEventListener('mouseup', handleMouseUpOrLeave);
         canvas.removeEventListener('mouseleave', handleMouseUpOrLeave);
         canvas.removeEventListener('touchstart', handleMouseDown);
         canvas.removeEventListener('touchmove', handleMouseMove);
         canvas.removeEventListener('touchend', handleMouseUpOrLeave);
         canvas.removeEventListener('touchcancel', handleMouseUpOrLeave);
         console.log("Removed histogram interaction listeners.");
     };
}
// --- End NEW ---
// --- End NEW ---

// Rename updateHistogram and modify its content
async function updateHistogramBackground() { // Renamed and made async
    const canvas = document.getElementById('histogram-bg-canvas'); // Use BG canvas ID
    if (!canvas) {
        console.log('Histogram background canvas not found, skipping update');
        return;
    }
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear at the beginning

    try {
        const dataSource = await getHistogramPixelDataSource(); // Await the promise

        if (dataSource.source === 'server_needed') {
            console.log('Client-side data unavailable or not ideal, fetching histogram from server.', dataSource.message);
            fetchServerHistogram(); // This function will handle drawing on the canvas
            return; // Exit, as fetchServerHistogram will take over
        }

        if (dataSource.source === 'error' || dataSource.source === 'unavailable') {
            console.log('Histogram data source issue:', dataSource.message);
            ctx.fillStyle = '#aaa'; ctx.font = '14px Arial'; ctx.textAlign = 'center';
            // ... (text wrapping for message remains the same)
            const maxTextWidth = canvas.width - 20;
            const lines = [];
            let currentLine = '';
            const words = dataSource.message.split(' ');
            for (const word of words) {
                const testLine = currentLine + word + ' ';
                if (ctx.measureText(testLine).width > maxTextWidth && currentLine.length > 0) {
                    lines.push(currentLine.trim());
                    currentLine = word + ' ';
                } else {
                    currentLine = testLine;
                }
            }
            lines.push(currentLine.trim());
            
            let yPos = canvas.height / 2 - (lines.length -1) * 7; 
            for (const line of lines) {
                ctx.fillText(line, canvas.width / 2, yPos);
                yPos += 15; 
            }
            return;
        }

        const {
            pixels: pixelDataForHist, 
            width: dataWidth,
            height: dataHeight,
            dataMin: sourceDataMin, 
            dataMax: sourceDataMax, 
            pixelNativeMin, 
            pixelNativeMax  
        } = dataSource;
        
        // --- Keep the data processing and bar/axis drawing logic --- 
        // const ctx = canvas.getContext('2d'); // Already got context
        const canvasFullWidth = canvas.width;
        const canvasFullHeight = canvas.height;
        
        const numBins = 100;
        const bins = new Array(numBins).fill(0);

        const minInput = document.getElementById('min-range-input');
        const maxInput = document.getElementById('max-range-input');
        let histUIMin = sourceDataMin;
        let histUIMax = sourceDataMax;

        if (minInput && maxInput && minInput.value !== "" && maxInput.value !== "") {
            const parsedMin = parseFloat(minInput.value);
            const parsedMax = parseFloat(maxInput.value);
            if (!isNaN(parsedMin) && !isNaN(parsedMax) && parsedMin < parsedMax) {
                histUIMin = parsedMin;
                histUIMax = parsedMax;
            }
        }
        
        const histDisplayRange = histUIMax - histUIMin;
        
        if (histDisplayRange <= 0 || !isFinite(histDisplayRange)) {
            console.log('Invalid histogram display range:', histUIMin, histUIMax);
            ctx.fillStyle = '#aaa'; ctx.font = '14px Arial'; ctx.textAlign = 'center';
            ctx.fillText('Invalid data range for display', canvasFullWidth / 2, canvasFullHeight / 2);
            return;
        }
        
        const maxSampleSize = 500000;
        const skipFactor = Math.max(1, Math.floor((dataWidth * dataHeight) / maxSampleSize));
        let validPixelCount = 0;

        for (let y = 0; y < dataHeight; y += skipFactor) {
            if (!pixelDataForHist[y]) continue; 
            for (let x = 0; x < dataWidth; x += skipFactor) {
                let rawPixelVal = pixelDataForHist[y][x];
                if (rawPixelVal === undefined) continue;

                let actualVal = rawPixelVal; 

                if (dataSource.source === 'overview') {
                    if (pixelNativeMax !== pixelNativeMin) { 
                        actualVal = (rawPixelVal - pixelNativeMin) / (pixelNativeMax - pixelNativeMin) * (sourceDataMax - sourceDataMin) + sourceDataMin;
                    } else {
                        actualVal = sourceDataMin; 
                    }
                }

                if (!isNaN(actualVal) && isFinite(actualVal)) {
                    validPixelCount++;
                    if (actualVal < histUIMin || actualVal > histUIMax) continue;
                    const binIndex = Math.min(numBins - 1, Math.floor(((actualVal - histUIMin) / histDisplayRange) * numBins));
                    bins[binIndex]++;
                }
            }
        }
        
        let maxBinCount = 0; for (let i = 0; i < numBins; i++) { maxBinCount = Math.max(maxBinCount, bins[i]); }
        if (maxBinCount === 0) {
            ctx.fillStyle = '#aaa'; ctx.font = '14px Arial'; ctx.textAlign = 'center';
            ctx.fillText('No pixels in selected range', canvasFullWidth / 2, canvasFullHeight / 2);
            return;
        }
        const logMaxBinCount = Math.log(maxBinCount + 1);

        const padding = { top: 30, right: 20, bottom: 40, left: 60 };
        const histCanvasRenderWidth = canvasFullWidth - padding.left - padding.right;
        const histCanvasRenderHeight = canvasFullHeight - padding.top - padding.bottom;

        ctx.strokeStyle = '#888'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(padding.left, padding.top); ctx.lineTo(padding.left, canvasFullHeight - padding.bottom); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(padding.left, canvasFullHeight - padding.bottom); ctx.lineTo(canvasFullWidth - padding.right, canvasFullHeight - padding.bottom); ctx.stroke();
        
        ctx.fillStyle = '#aaa'; ctx.font = '10px Arial'; ctx.textAlign = 'right';
        const numYTicks = 5;
        for (let i = 0; i <= numYTicks; i++) { 
            const yPos = canvasFullHeight - padding.bottom - (i / numYTicks) * histCanvasRenderHeight;
            ctx.beginPath(); ctx.moveTo(padding.left - 5, yPos); ctx.lineTo(padding.left, yPos); ctx.stroke();
            const logValue = (i / numYTicks) * logMaxBinCount;
            const actualCountValue = Math.round(Math.exp(logValue) - 1);
            ctx.fillText(actualCountValue.toLocaleString(), padding.left - 8, yPos + 4);
        }
        ctx.textAlign = 'center';
        const numXTicks = 5;
        for (let i = 0; i <= numXTicks; i++) {
            const xPos = padding.left + (i / numXTicks) * histCanvasRenderWidth;
            ctx.beginPath(); ctx.moveTo(xPos, canvasFullHeight - padding.bottom); ctx.lineTo(xPos, canvasFullHeight - padding.bottom + 5); ctx.stroke();
            const value = histUIMin + (i / numXTicks) * histDisplayRange;
            ctx.fillText(value.toExponential(2), xPos, canvasFullHeight - padding.bottom + 20); 
        }
        ctx.save(); ctx.translate(10, padding.top + histCanvasRenderHeight / 2); ctx.rotate(-Math.PI / 2); ctx.fillStyle = '#aaa'; ctx.font = '12px Arial'; ctx.textAlign = 'center';
        ctx.fillText('Pixel Count (log)', 0, 0); ctx.restore();
        ctx.fillStyle = '#aaa'; ctx.font = '12px Arial'; ctx.textAlign = 'center';
        const xAxisLabelText = (window.fitsData && window.fitsData.wcs && window.fitsData.wcs.bunit) ? window.fitsData.wcs.bunit : 'Value (UNIT)';
        ctx.fillText(xAxisLabelText, canvasFullWidth / 2, canvasFullHeight - 5);
        
        ctx.fillStyle = '#aaa'; ctx.font = '12px Arial'; ctx.textAlign = 'center';
        ctx.fillText(`Pixels in Hist: ${validPixelCount.toLocaleString()}`, canvasFullWidth / 2, padding.top - 15);

        ctx.textAlign = 'left';
        ctx.fillText(`Hist Min: ${histUIMin.toExponential(2)}`, padding.left, padding.top - 10);
        ctx.textAlign = 'right';
        ctx.fillText(`Hist Max: ${histUIMax.toExponential(2)}`, canvasFullWidth - padding.right, padding.top - 10);

        ctx.fillStyle = 'rgba(0, 180, 0, 0.7)'; 
        const barWidth = histCanvasRenderWidth / numBins;
        for (let i = 0; i < numBins; i++) {
            const binCount = bins[i];
            if (binCount === 0) continue;
            const logHeight = Math.log(binCount + 1) / logMaxBinCount * histCanvasRenderHeight;
            const xRect = padding.left + i * barWidth;
            const yRect = canvasFullHeight - padding.bottom - logHeight;
            ctx.fillRect(xRect, yRect, barWidth -1, logHeight); 
        }

        histogramScaleInfo = {
            padding: padding,
            histWidth: histCanvasRenderWidth, 
            histHeight: histCanvasRenderHeight, 
            dataMin: histUIMin, 
            dataRange: histDisplayRange, 
            canvasWidth: canvasFullWidth,
            canvasHeight: canvasFullHeight
        };
        if (histogramScaleInfo.histWidth <= 0 || !isFinite(histogramScaleInfo.dataRange) || histogramScaleInfo.dataRange <= 0) {
             console.warn('Invalid histogram scale parameters calculated in background update:', histogramScaleInfo);
        }

    } catch (error) {
        console.error('Error updating histogram background:', error);
        if(canvas) {
           ctx.clearRect(0, 0, canvas.width, canvas.height);
           ctx.fillStyle = '#aaa'; ctx.font = '14px Arial'; ctx.textAlign = 'center';
           ctx.fillText('Error updating histogram', canvas.width / 2, canvas.height / 2);
        }
    } 
}

// NEW Function to draw lines (with animation)
function drawHistogramLines(targetMinVal, targetMaxVal, animate = false) {
    const canvas = document.getElementById('histogram-lines-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Need scale info from the background draw
    if (!histogramScaleInfo || !histogramScaleInfo.padding) {
        console.warn('Histogram scale info not available for drawing lines.');
        return;
    }
    const { padding, histWidth, dataMin, dataRange, histHeight } = histogramScaleInfo;

    // Helper to calculate X coordinate from data value
    const valueToX = (value) => {
        if (!isFinite(dataRange) || dataRange <= 0 || histWidth <= 0) return padding.left; // Fallback
        const clampedValue = Math.max(dataMin, Math.min(dataMin + dataRange, value));
        return padding.left + ((clampedValue - dataMin) / dataRange) * histWidth;
    };

    const targetMinX = valueToX(targetMinVal);
    const targetMaxX = valueToX(targetMaxVal);

    // Cancel any ongoing animation
    if (lineAnimationId) {
        cancelAnimationFrame(lineAnimationId);
        lineAnimationId = null;
    }

    const startMinX = (currentMinLineX === null) ? targetMinX : currentMinLineX;
    const startMaxX = (currentMaxLineX === null) ? targetMaxX : currentMaxLineX;

    const drawLinesAt = (minX, maxX) => {
        ctx.clearRect(0, 0, width, height);
        ctx.lineWidth = 2;

        // Draw Min Line (Blue)
        if (isFinite(minX)) {
            ctx.strokeStyle = 'rgba(50, 150, 255, 0.9)';
            ctx.fillStyle = 'rgba(50, 150, 255, 0.9)';
            ctx.beginPath();
            ctx.moveTo(minX, padding.top - 10);
            ctx.lineTo(minX, height - padding.bottom + 10);
            ctx.stroke();
            ctx.fillRect(minX - 3, padding.top - 15, 6, 5);
        }

        // Draw Max Line (Red)
        if (isFinite(maxX)) {
            ctx.strokeStyle = 'rgba(255, 0, 0, 0.9)';
            ctx.fillStyle = 'rgba(255, 0, 0, 0.9)';
            ctx.beginPath();
            ctx.moveTo(maxX, padding.top - 10);
            ctx.lineTo(maxX, height - padding.bottom + 10);
            ctx.stroke();
            ctx.fillRect(maxX - 3, padding.top - 15, 6, 5);
        }
    };

    if (animate && (startMinX !== targetMinX || startMaxX !== targetMaxX)) {
        const startTime = performance.now();

        const step = (timestamp) => {
            const elapsed = timestamp - startTime;
            const progress = Math.min(1, elapsed / LINE_ANIMATION_DURATION);
            // Ease out function (quad) progress = progress * (2 - progress);

            const interpolatedMinX = startMinX + (targetMinX - startMinX) * progress;
            const interpolatedMaxX = startMaxX + (targetMaxX - startMaxX) * progress;

            drawLinesAt(interpolatedMinX, interpolatedMaxX);

            currentMinLineX = interpolatedMinX;
            currentMaxLineX = interpolatedMaxX;

            if (progress < 1) {
                lineAnimationId = requestAnimationFrame(step);
            } else {
                lineAnimationId = null;
                currentMinLineX = targetMinX; // Ensure final position is exact
                currentMaxLineX = targetMaxX;
            }
        };
        lineAnimationId = requestAnimationFrame(step);
    } else {
        // No animation, draw directly
        drawLinesAt(targetMinX, targetMaxX);
        currentMinLineX = targetMinX;
        currentMaxLineX = targetMaxX;
    }
}

// Modify requestHistogramUpdate
function requestHistogramUpdate() {
    // If an update is already queued or running, do nothing for now
    // The finally block of updateHistogramBackground will handle queuing.
    // We might need more sophisticated debouncing/throttling here if needed.
    if (isUpdatingHistogram || histogramUpdateTimer) {
        histogramUpdateRequested = true;
        return;
    }

    // Set flag and potentially use a timer for debouncing
    isUpdatingHistogram = true;
    histogramUpdateRequested = false; // Clear request flag

    // Update background first
    updateHistogramBackground();
    
    // Draw lines based on current input values (no animation needed here as it follows background)
    const minInput = document.getElementById('min-range-input');
    const maxInput = document.getElementById('max-range-input');
    if (minInput && maxInput) {
        const currentMin = parseFloat(minInput.value);
        const currentMax = parseFloat(maxInput.value);
        if (!isNaN(currentMin) && !isNaN(currentMax)) {
            drawHistogramLines(currentMin, currentMax, false); 
        }
    }
    
    // Reset flags after completion (or use finally block in updateHistBG)
    isUpdatingHistogram = false; 
    if (histogramUpdateRequested) { // Check if a new request came in during update
        histogramUpdateTimer = setTimeout(() => {
             histogramUpdateTimer = null;
             requestHistogramUpdate();
        }, 100); // Small delay before next update
    }
}

// Modify fetchServerHistogram if it exists to draw on bg canvas
function fetchServerHistogram() {
    const canvas = document.getElementById('histogram-bg-canvas'); // Target BG canvas
    if (!canvas) {
        console.warn("Histogram background canvas not found for fetchServerHistogram.");
        return; // Explicitly return undefined if canvas isn't found.
                // applyPercentile expects a promise, so this case needs careful handling
                // or ensure this function isn't called if canvas isn't ready.
                // For now, this matches existing early returns.
                // A better fix might be to return Promise.reject("Canvas not found")
    }

    const minInput = document.getElementById('min-range-input');
    const maxInput = document.getElementById('max-range-input');
    let uiMin = null;
    let uiMax = null;

    if (minInput && maxInput) {
        uiMin = parseFloat(minInput.value);
        uiMax = parseFloat(maxInput.value);
        // Validate that uiMin and uiMax are numbers and min < max
        if (isNaN(uiMin) || isNaN(uiMax) || uiMin >= uiMax) {
            console.warn("Invalid Min/Max values from UI for server histogram request. uiMin:", uiMin, "uiMax:", uiMax, ". Fetching default range.");
            uiMin = null; // Fallback to server default if UI values are bad
            uiMax = null;
        }
    } else {
        console.warn("Min/Max input fields not found. Fetching default range for server histogram.");
    }
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#aaa'; ctx.font = '14px Arial'; ctx.textAlign = 'center';
    ctx.fillText('Loading histogram data...', canvas.width / 2, canvas.height / 2);
    
    let fetchUrl = '/fits-histogram/';
    if (uiMin !== null && uiMax !== null) {
        fetchUrl += `?min_val=${encodeURIComponent(uiMin)}&max_val=${encodeURIComponent(uiMax)}`;
    }
    console.log("Fetching server histogram from:", fetchUrl);

    return fetch(fetchUrl) 
        .then(response => {
            if (!response.ok) { // Check if response status is indicative of an error
                return response.text().then(text => { // Try to get error text from server
                    throw new Error(`Server error: ${response.status} ${response.statusText}. ${text}`);
                });
            }
            return response.json();
        })
        .then(data => {
            if (data.error) { // This is if the server *successfully* responds with a JSON containing an error message
                console.error("Server returned error for histogram:", data.error);
                throw new Error(data.error); // Propagate as an error to be caught by .catch
            }
            // This function is expected by applyPercentile to resolve with histData
            // The original function drew directly and didn't resolve with the data.
            // We need to ensure it resolves with the data for applyPercentile
            drawServerHistogram(data); // Keep drawing for other uses.
            
            // After drawing background, draw lines based on current inputs
            if (minInput && maxInput) {
                const currentMin = parseFloat(minInput.value);
                const currentMax = parseFloat(maxInput.value);
                if (!isNaN(currentMin) && !isNaN(currentMax)) {
                    drawHistogramLines(currentMin, currentMax, false); 
                }
            }
            return data; // Resolve the promise with the histogram data
        })
        .catch(error => { // This catches network errors or errors thrown from !response.ok or data.error
            console.error('Error fetching or processing server histogram:', error);
            const message = error.message || 'Unknown error';
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#aaa'; ctx.font = '14px Arial'; ctx.textAlign = 'center';
            // Wrap text if too long
            const maxTextWidth = canvas.width - 20;
            const lines = [];
            let currentLine = '';
            const words = `Error: ${message}`.split(' ');
            for (const word of words) {
                const testLine = currentLine + word + ' ';
                if (ctx.measureText(testLine).width > maxTextWidth && currentLine.length > 0) {
                    lines.push(currentLine.trim());
                    currentLine = word + ' ';
                } else {
                    currentLine = testLine;
                }
            }
            lines.push(currentLine.trim());
            
            let yPos = canvas.height / 2 - (lines.length -1) * 7; // Adjust start Y for multi-line
            for (const line of lines) {
                ctx.fillText(line, canvas.width / 2, yPos);
                yPos += 15; // Line height
            }
            throw error; // Re-throw the error so the caller's .catch() in applyPercentile can handle it
        });
}

// static/main.js

// NEW Helper function to get pixel data for histogram
function getHistogramPixelDataSource() {
    return new Promise((resolve, reject) => {
        // ---- CHECK CACHE FIRST ---- START ----
        if (window.histogramOverviewPixelData && 
            window.histogramOverviewPixelData.pixels && 
            (window.tiledViewer && typeof window.tiledViewer.isOpen === 'function' && window.tiledViewer.isOpen())) {
            
            let useDataMin = window.histogramOverviewPixelData.dataMin;
            let useDataMax = window.histogramOverviewPixelData.dataMax;

            // If cached overview lacks min/max, try to get them from current window.fitsData
            if ((useDataMin === null || useDataMax === null || typeof useDataMin === 'undefined' || typeof useDataMax === 'undefined') && 
                window.fitsData && 
                typeof window.fitsData.min_value !== 'undefined' && 
                typeof window.fitsData.max_value !== 'undefined') {
                console.log("Cached overview pixel data was missing min/max, updating from current window.fitsData for histogram.");
                useDataMin = window.fitsData.min_value;
                useDataMax = window.fitsData.max_value;
                // Update the cache with these values for next time
                window.histogramOverviewPixelData.dataMin = useDataMin;
                window.histogramOverviewPixelData.dataMax = useDataMax;
            }
            
            // Only proceed if we have valid dataMin and dataMax
            if (useDataMin !== null && useDataMax !== null && typeof useDataMin !== 'undefined' && typeof useDataMax !== 'undefined') {
                console.log('Histogram source: Using Cached Overview Pixel Data');
                resolve({
                    source: 'overview_cached', 
                    pixels: window.histogramOverviewPixelData.pixels,
                    width: window.histogramOverviewPixelData.width,
                    height: window.histogramOverviewPixelData.height,
                    dataMin: useDataMin,
                    dataMax: useDataMax,
                    pixelNativeMin: window.histogramOverviewPixelData.pixelNativeMin,
                    pixelNativeMax: window.histogramOverviewPixelData.pixelNativeMax
                });
                return; // IMPORTANT: Exit early if cached data is used
            } else {
                console.warn("Cached overview pixel data is present but still lacks essential dataMin/dataMax. Cannot use for client-side histogram. Will try other sources.");
            }
        }
        // ---- CHECK CACHE FIRST ---- END ----

        // Case 1: Full FITS data is available and seems valid
        if (window.fitsData && window.fitsData.data && Array.isArray(window.fitsData.data) && window.fitsData.data.length > 0 && Array.isArray(window.fitsData.data[0]) && window.fitsData.data[0].length > 0) {
            console.log('Histogram source: Full FITS data (window.fitsData.data)');
            resolve({
                source: 'fitsData',
                pixels: window.fitsData.data, // 2D array
                width: window.fitsData.width,
                height: window.fitsData.height,
                dataMin: window.fitsData.min_value,
                dataMax: window.fitsData.max_value
            });
            return; 
        } 
        // Case 2: Tiled mode, overview image in DOM (fallback if cache failed or not applicable)
        // This path is less ideal now that we have the cache.
        else if (window.fitsData && window.fitsData.overview && (window.tiledViewer && window.tiledViewer.isOpen())) {
            console.log('Histogram source: Attempting Overview image from DOM (fallback for tiled view).');
            
            let attemptCount = 0;
            const maxAttempts = 2; // Reduced attempts as this is a less preferred fallback
            const retryDelay = 200; 

            function findAndProcessOverview() {
                attemptCount++;
                const overviewContainer = document.getElementById('overview-container');
                const overviewImgElement = overviewContainer ? overviewContainer.querySelector('img') : null;

                const processOverview = () => {
                    if (overviewImgElement && overviewImgElement.complete && overviewImgElement.naturalWidth > 0) {
                        try {
                            const offscreenCanvas = document.createElement('canvas');
                            const imgWidth = overviewImgElement.naturalWidth;
                            const imgHeight = overviewImgElement.naturalHeight;
                            offscreenCanvas.width = imgWidth;
                            offscreenCanvas.height = imgHeight;
                            const offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
                            if (!offscreenCtx) {
                                console.error("Could not get 2D context for offscreen canvas in DOM overview processing.");
                                resolve({ source: 'error', message: 'Error processing overview data from DOM (no context)' });
                                return;
                            }
                            offscreenCtx.drawImage(overviewImgElement, 0, 0);
                            const imageDataArray = offscreenCtx.getImageData(0, 0, imgWidth, imgHeight).data;
                            const overviewPixels2D = [];
                            for (let y = 0; y < imgHeight; y++) {
                                const row = [];
                                for (let x = 0; x < imgWidth; x++) {
                                    row.push(imageDataArray[(y * imgWidth + x) * 4]);
                                }
                                overviewPixels2D.push(row);
                            }
                            console.log("Successfully processed overview image from DOM for histogram.");
                            // Try to populate min/max from window.fitsData if available
                            const dataMinValue = (window.fitsData && typeof window.fitsData.min_value !== 'undefined') ? window.fitsData.min_value : null;
                            const dataMaxValue = (window.fitsData && typeof window.fitsData.max_value !== 'undefined') ? window.fitsData.max_value : null;

                            if (dataMinValue !== null && dataMaxValue !== null) {
                                resolve({
                                    source: 'overview_dom',
                                    pixels: overviewPixels2D,
                                    width: imgWidth,
                                    height: imgHeight,
                                    dataMin: dataMinValue, 
                                    dataMax: dataMaxValue,
                                    pixelNativeMin: 0,
                                    pixelNativeMax: 255
                                });
                            } else {
                                console.warn("Could not determine dataMin/dataMax when processing DOM overview. Histogram may be incorrect.");
                                resolve({ source: 'unavailable', message: 'Overview (DOM) processed but min/max FITS values missing.' });
                            }
                        } catch (e) {
                            console.error('Error processing overview image from DOM for histogram source:', e);
                            resolve({ source: 'error', message: 'Error processing overview data from DOM' });
                        }
                    } else {
                        console.warn('Overview image element (DOM) found but not ready. Resolving as unavailable.');
                        resolve({ source: 'unavailable', message: 'Overview image (DOM) not ready' });
                    }
                };

                if (overviewImgElement) {
                    if (overviewImgElement.complete && overviewImgElement.naturalWidth > 0) {
                        processOverview();
                    } else {
                        console.log(`Overview image (DOM) not yet loaded (attempt ${attemptCount}), waiting for onload...`);
                        overviewImgElement.onload = () => {
                            console.log('Overview image (DOM) loaded via .onload callback.');
                            processOverview();
                        };
                        overviewImgElement.onerror = () => {
                            console.error('Error loading overview image (DOM) for histogram via .onerror.');
                            resolve({ source: 'server_needed', message: 'Overview image (DOM) load error, server histogram fallback.'});
                        };
                    }
                } else { // overviewImgElement not found
                    if (attemptCount < maxAttempts) {
                        console.log(`Overview image element (DOM) not found (attempt ${attemptCount}/${maxAttempts}). Retrying in ${retryDelay}ms...`);
                        setTimeout(findAndProcessOverview, retryDelay);
                    } else {
                        console.warn(`Overview image element (DOM) not found after ${maxAttempts} attempts. Likely hidden.`);
                        // If cache also failed, and we are here, then server might be needed if in tiled mode.
                         if (window.tiledViewer && window.tiledViewer.isOpen()) {
                            resolve({ source: 'server_needed', message: 'Overview (DOM) gone, and cache failed, server histogram needed.'});
                        } else {
                            resolve({ source: 'unavailable', message: 'Overview (DOM) gone, not tiled mode.' });
                        }
                    }
                }
            }
            findAndProcessOverview(); 
        } 
        // Fallback: If no other source, and tiled viewer is active, definitely request server histogram.
        else if (window.tiledViewer && typeof window.tiledViewer.isOpen === 'function' && window.tiledViewer.isOpen()){
             console.log('No suitable client-side data source for histogram, but tiled view is active. Requesting server histogram.');
             resolve({ source: 'server_needed', message: 'No client data, server histogram needed for tiled view.' });
        } 
        // Absolute fallback if no FITS data at all, or not tiled view and no other source found.
        else {
            console.log('No suitable FITS data or overview found for histogram (and not forcing server request).');
            resolve({ source: 'unavailable', message: 'No FITS data available for histogram processing.' });
        }
    });
}



// Add this function to static/main.js
async function fetchRgbCutouts(ra, dec, catalogName, galaxyName = "UnknownGalaxy") {
    if (typeof ra === 'undefined' || typeof dec === 'undefined' || !catalogName) {
        showNotification("RA, Dec, or Catalog Name is missing. Cannot generate RGB cutouts.", 3000, "error");
        console.error("RGB Cutouts: Missing parameters", { ra, dec, catalogName });
        return;
    }

    showNotification(true, "Generating RGB panels...");
    console.log(`Fetching RGB cutouts for RA: ${ra}, Dec: ${dec}, Catalog: ${catalogName}, Galaxy: ${galaxyName}`);

    let endpointUrl = `/generate-rgb-cutouts/?ra=${ra}&dec=${dec}&catalog_name=${encodeURIComponent(catalogName)}`;
    if (galaxyName && galaxyName !== "UnknownGalaxy") {
        endpointUrl += `&galaxy_name=${encodeURIComponent(galaxyName)}`;
    }

    try {
        const response = await fetch(endpointUrl);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || `Failed to generate RGB cutouts (HTTP ${response.status})`);
        }

        if (data.url) {
            console.log("RGB cutouts generated:", data);
            displayRgbCutoutImage(data.url, data.filename, data.data_found_summary, "RGB Cutout Panels");
        } else {
            throw new Error("Received success, but no image URL in response for RGB cutouts.");
        }

    } catch (error) {
        console.error("Error fetching RGB cutouts:", error);
        showNotification(`Error: ${error.message}`, 4000, "error");
    } finally {
        showNotification(false);
    }
}
function displayRgbCutoutImage(imageUrl, filename, dataFoundSummary, titleText = "RGB Cutout Panels") {
    closeSedContainer();
    let popup = document.getElementById('rgb-cutout-popup');

    if (popup) { // If popup exists, update its image and make sure it's visible
        const imgElement = popup.querySelector('img');
        if (imgElement) {
            imgElement.src = imageUrl + '?' + new Date().getTime(); // Add cache buster
        }
        popup.style.display = 'flex'; // Make sure it's visible
        popup.style.bottom = '0px'; // Slide in if it was somehow hidden
        return;
    }

    // Create new popup - using original CSS styles
    popup = document.createElement('div');
    popup.id = 'rgb-cutout-popup';
    Object.assign(popup.style, {
        position: 'fixed',
        bottom: '-100vh', // Start off-screen for slide-in animation
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%', 
        maxWidth: '100%', 
        height: 'auto', 
        minHeight: '250px', // Adjusted min-height
        maxHeight: '50vh', 
        backgroundColor: ' rgba(0,0,0,0.8)', 
        borderRadius: '10px 10px 0 0', 
        padding: '15PX 0PX', // General padding
        zIndex: '1002', 
        boxSizing: 'border-box',
        boxShadow: '0 -5px 20px rgba(0,0,0,0.7)', 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center',
        transition: 'bottom 0.4s ease-out' 
    });

    // Header container for title and buttons
    const headerContainer = document.createElement('div');
    Object.assign(headerContainer.style, {
        width: '100%',
        display: 'flex',
        justifyContent: 'space-between', // Puts title left, close button right
        alignItems: 'center',
        marginBottom: '10px', // Space below header
        paddingLeft: '5px', // Align title a bit from edge
        paddingRight: '5px' // Align close button a bit from edge
    });
    
    const title = document.createElement('h3');
    title.className = 'rgb-popup-title';
    title.textContent = "";
    Object.assign(title.style, {
        margin: '0', // Remove default margins
        color: '#eee',
        fontFamily: 'Arial, sans-serif',
        fontSize: '16px', // Slightly smaller title
        fontWeight: 'bold',
        textAlign: 'left' // Align title to the left within its space
    });

    // Button container for right-aligned buttons
    const buttonContainer = document.createElement('div');
    Object.assign(buttonContainer.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '10px' // Space between buttons
    });

    // Create Save Button
    const saveButton = document.createElement('button');
    saveButton.title = 'Save Panel Image';
    Object.assign(saveButton.style, {
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '5px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
    });
    // SVG icon for save (corrected)
    saveButton.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#cccccc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17,21 17,13 7,13 7,21"></polyline><polyline points="7,3 7,8 15,8"></polyline></svg>`;
    saveButton.onmouseover = () => { saveButton.querySelector('svg').style.stroke = '#ffffff'; };
    saveButton.onmouseout = () => { saveButton.querySelector('svg').style.stroke = '#cccccc'; };

    // Onclick handler for downloading the image
    saveButton.onclick = () => {
        if (!imageUrl) {
            showNotification('Image URL is not available.', 'error');
            return;
        }
        const link = document.createElement('a');
        link.href = imageUrl;
        link.download = filename || 'rgb_cutout_panel.png'; // Use provided filename or a default
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showNotification('Image download started.', 'success');
    };

    const closeButton = document.createElement('button');
    closeButton.textContent = '×';
    Object.assign(closeButton.style, {
        backgroundColor: 'transparent',
        border: 'none',
        color: '#aaa',
        fontSize: '28px', // Larger close button
        cursor: 'pointer',
        padding: '0 5px', // Padding around X
        lineHeight: '1',
        fontWeight: 'bold'
    });
    closeButton.onmouseover = () => { closeButton.style.color = '#fff'; };
    closeButton.onmouseout = () => { closeButton.style.color = '#aaa'; };
    closeButton.onclick = () => {
        popup.style.bottom = '-100vh'; 
        setTimeout(() => {
            const currentPopup = document.getElementById('rgb-cutout-popup');
            if (currentPopup === popup && currentPopup.parentNode) {
                currentPopup.parentNode.removeChild(currentPopup);
            }
        }, 400); 
    };

    headerContainer.appendChild(title);
    buttonContainer.appendChild(saveButton); // Add save button to container
    buttonContainer.appendChild(closeButton); // Add close button to container
    headerContainer.appendChild(buttonContainer); // Add button container to header
    
    popup.appendChild(headerContainer);

    // Image container using original styles
    const imageContainer = document.createElement('div');
    Object.assign(imageContainer.style, {
        margin: '0px 200px 0 200px', // Padding around X
        textAlign: 'center',
    });

    const img = document.createElement('img');
    img.src = imageUrl + '?' + new Date().getTime(); 
    img.alt = filename;
    Object.assign(img.style, {
        maxWidth: '100%',
        maxHeight: '100%', 
        display: 'block', 
        margin: '0 auto' 
    });
    imageContainer.appendChild(img);
    popup.appendChild(imageContainer);
    
    document.body.appendChild(popup);

    // Trigger slide-in animation
    setTimeout(() => {
        popup.style.bottom = '0px'; 
    }, 50); 
}

// Method 1: Create a separate function to close the popup
function closeRgbCutoutPopup() {
    const popup = document.getElementById('rgb-cutout-popup');
    if (popup) {
        popup.style.bottom = '-100vh'; 
        setTimeout(() => {
            const currentPopup = document.getElementById('rgb-cutout-popup');
            if (currentPopup && currentPopup.parentNode) {
                currentPopup.parentNode.removeChild(currentPopup);
            }
        }, 400); 
    }
}

// Method 2: Directly trigger the close button click
function triggerRgbPopupClose() {
    const popup = document.getElementById('rgb-cutout-popup');
    if (popup) {
        const closeButton = popup.querySelector('button[style*="font-size: 28px"]'); // Find close button by style
        if (closeButton) {
            closeButton.click();
        }
    }
}

// Method 3: More reliable - find close button by content
function clickRgbPopupCloseButton() {
    const popup = document.getElementById('rgb-cutout-popup');
    if (popup) {
        const buttons = popup.querySelectorAll('button');
        const closeButton = Array.from(buttons).find(btn => btn.textContent === '×');
        if (closeButton) {
            closeButton.click();
        }
    }
}

// Method 4: Check if popup exists and is visible
function isRgbPopupOpen() {
    const popup = document.getElementById('rgb-cutout-popup');
    return popup && popup.style.display !== 'none' && popup.style.bottom === '0px';
}

// Usage examples:
// closeRgbCutoutPopup(); // Direct close
// triggerRgbPopupClose(); // Simulate button click
// clickRgbPopupCloseButton(); // Find and click close button
// if (isRgbPopupOpen()) { closeRgbCutoutPopup(); } // Conditional close


// static/main.js

// ... at the very end of the file

function zoomIn() {
    const activeViewer = window.tiledViewer || window.viewer;
    if (activeViewer && activeViewer.viewport) {
        activeViewer.viewport.zoomBy(1.2);
    }
}

function zoomOut() {
    const activeViewer = window.tiledViewer || window.viewer;
    if (activeViewer && activeViewer.viewport) {
        activeViewer.viewport.zoomBy(0.8);
    }
}

function resetView() {
    const activeViewer = window.tiledViewer || window.viewer;
    if (activeViewer && activeViewer.viewport) {
        activeViewer.viewport.goHome();
    }
}
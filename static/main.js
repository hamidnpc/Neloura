// Global variables
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

// NEW: State for interactive histogram
let histogramScaleInfo = { padding: {}, histWidth: 0, dataMin: 0, dataRange: 1 };
let isDraggingLine = null; // Can be 'min', 'max', or null
const DRAG_THRESHOLD = 5; // Pixel tolerance for clicking lines
let throttledHistogramUpdate = null; // To be initialized later
let debouncedApplyDynamicRange = null; // To be initialized later

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
    // Create a circular progress indicator
    createProgressIndicator();
    showProgress(true, "Loading FITS image...");
    
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

function showProgress(show, message = '') {
    console.log(`${show ? 'Showing' : 'Hiding'} progress indicator${message ? ': ' + message : ''}`);
    const container = document.getElementById('progress-container');
    const text = document.getElementById('progress-text');
    
    if (container) {
        container.style.display = show ? 'block' : 'none';
        if (text && message) {
            text.textContent = message;
        } else if (text) {
            text.textContent = '';
        }
        
        if (show) {
            // Reset and start the progress simulation
            const percentageElement = document.getElementById('progress-percentage');
            if (percentageElement) {
                percentageElement.textContent = '0%';
            }
            startProgressSimulation();
        } else {
            // When hiding, always set to 100% first
            const percentageElement = document.getElementById('progress-percentage');
            if (percentageElement) {
                percentageElement.textContent = '100%';
            }
            stopProgressSimulation();
        }
    }
}


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
    
    // Check if FITS data exists in window scope
    if (!window.fitsData) {
        console.error('No FITS data available in global scope');
        showNotification('No image data available. Please load an image first.', 3000, 'error');
        return;
    }
    
    // Check if data array exists within FITS data
    if (!window.fitsData.data) {
        console.error('FITS data has no pixel array');
        showNotification('Image data is incomplete. Try reloading the image.', 3000, 'error');
        return;
    }
    
    try {
        console.log(`Applying ${percentileValue * 100}% percentile`);
        
        // Collect all valid pixel values with sampling for large images
        const validPixels = [];
        const height = window.fitsData.height;
        const width = window.fitsData.width;
        const maxSampleSize = 1000000; // Limit sample size for performance
        const skipFactor = Math.max(1, Math.floor((width * height) / maxSampleSize));
        
        let pixelCount = 0;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x += skipFactor) {
                pixelCount++;
                if (pixelCount % skipFactor !== 0) continue; // Sample only every Nth pixel
                
                // Safely access pixel value
                try {
                    const value = window.fitsData.data[y][x];
                    if (!isNaN(value) && isFinite(value)) {
                        validPixels.push(value);
                    }
                } catch (e) {
                    console.warn(`Error accessing pixel data at (${x},${y})`, e);
                    // Continue with other pixels
                }
            }
        }
        
        if (validPixels.length === 0) {
            console.error('No valid pixels found');
            showNotification('No valid pixels found in image data', 2000, 'warning');
            return;
        }
        
        // Sort pixels for percentile calculation
        validPixels.sort((a, b) => a - b);
        
        // Calculate min and max values based on percentile
        const minIndex = 0;
        const maxIndex = Math.floor(validPixels.length * percentileValue);
        
        if (maxIndex >= validPixels.length) {
            console.error('Invalid percentile: index out of bounds');
            showNotification('Error calculating percentile', 2000, 'error');
            return;
        }
        
        const minValue = validPixels[minIndex];
        const maxValue = validPixels[maxIndex];
        
        console.log(`Percentile ${percentileValue * 100}%: min=${minValue}, max=${maxValue}`);
        
        // Apply the dynamic range directly
        const minInput = document.getElementById('min-range-input');
        const maxInput = document.getElementById('max-range-input');
        
        if (minInput && maxInput) {
            minInput.value = minValue.toFixed(2);
            maxInput.value = maxValue.toFixed(2);
        }
        
        // Update the FITS data with new range
        window.fitsData.min_value = minValue;
        window.fitsData.max_value = maxValue;
        
        // Show brief processing indicator
        showProgress(true, 'Updating image...');
        
        // Check which viewer is active and update accordingly
        let viewerInitialized = false;
        
        // Check for standard OpenSeadragon viewer
        if (typeof viewer !== 'undefined' && viewer) {
            viewerInitialized = true;
            console.log("Using standard viewer");
            
            // Process the image with the new range
            if (window.Worker) {
                processImageInWorker();
            } else {
                processImageInMainThread();
            }
        }
        // Check for window.viewer
        else if (window.viewer) {
            viewerInitialized = true;
            console.log("Using window.viewer");
            
            // Process the image with the new range
            if (window.Worker) {
                processImageInWorker();
            } else {
                processImageInMainThread();
            }
        }
        // Check for tiled viewer
        else if (window.tiledViewer && window.tiledViewer.isOpen && window.tiledViewer.isOpen()) {
            viewerInitialized = true;
            console.log("Using tiled viewer");
            
            // For tiled viewing, update the server-side settings
            fetch('/update-dynamic-range/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    min_value: minValue,
                    max_value: maxValue
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    console.error('Error updating tiled view:', data.error);
                } else {
                    window.tiledViewer.forceRedraw();
                }
                showProgress(false);
            })
            .catch(error => {
                console.error('Error updating tiled view:', error);
                showProgress(false);
            });
        }
        
        if (!viewerInitialized) {
            console.error("No viewer found - trying direct refresh");
            
            // Last resort: try direct image refresh
            try {
                refreshImage();
                viewerInitialized = true;
            } catch(e) {
                console.error("Failed to refresh image:", e);
            }
        }
        
        if (!viewerInitialized) {
            showProgress(false);
            showNotification('Unable to update image: viewer not initialized', 2000, 'error');
        } else {
            // Hide progress after a short delay for standard viewers
            if (!window.tiledViewer || !window.tiledViewer.isOpen()) {
                setTimeout(() => {
                    showProgress(false);
                    showNotification(`Applied ${percentileValue * 100}% percentile`, 1500, 'success');
                }, 500);
            }
        }
        
        // Update the histogram if the popup is visible
        const popup = document.getElementById('dynamic-range-popup');
        if (popup && popup.style.display !== 'none') {
            // Use the safe update function
            requestHistogramUpdate();
        }
    } catch (error) {
        console.error('Error applying percentile:', error);
        showProgress(false);
        showNotification(`Error: ${error.message}`, 3000, 'error');
    }
}
// ===== CRITICAL FIX FOR VERY LARGE HST FILES =====

// Fixed error handling function to properly detect large files and prevent crashes
function initializeViewerWithFitsData() {
    console.log("Initializing viewer with FITS data");
    
    if (!window.fitsData) {
        console.error("Error: No FITS data available");
        showProgress(false);
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
        
        showProgress(false);
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
        showProgress(true, 'Processing FITS data...');
        
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
                showProgress(true, 'Creating image data structures...');
                
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
                    
                    showProgress(true, `Processing data: ${progress}%`);
                    
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

                    // console.timeEnd('parseBinaryData');
                    
                    // Apply 99% percentile for better initial display
                    try {
                        showProgress(true, 'Calculating optimal display range...');
                        
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
                    showProgress(true, 'Creating viewer...');
                    setTimeout(() => {
                        if (typeof initializeViewerWithFitsData === 'function') {
                            initializeViewerWithFitsData();
                        } else {
                            showProgress(false);
                            showNotification('Error: Viewer initialization function not found', 3000, 'error');
                        }
                        
                        // Extract just the filename from the full path for the notification
                        const filename = filepath.split('/').pop();
                        showNotification(`Loaded ${filename} successfully`, 2000, 'success');
                    }, 100);
                }
                
            } catch (error) {
                console.error('Error processing binary data:', error);
                showProgress(false);
                showNotification(`Error: ${error.message}`, 5000, 'error');
            }
        }, 100); // Small delay to let the UI update
        
    } catch (error) {
        console.error('Error in processBinaryData:', error);
        showProgress(false);
        showNotification(`Error: ${error.message}`, 5000, 'error');
    }
}

function processImageInMainThread() {
    // Show progress indicator
    showProgress(true, 'Processing image...');
    
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
            
            // Hide progress indicator once the image is loaded
            showProgress(false);
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
    showProgress(true, 'Processing image...');
    
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
            showProgress(false);
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
                    showProgress(false);
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
    showProgress(true, 'Processing large image...');
    
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
            showProgress(true, `Processing large image: ${Math.round((currentRow / window.fitsData.height) * 100)}%`);
            
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
                        showProgress(false);
                    });
                } else {
                    // Initialize a new viewer optimized for large images
                    console.log("Initializing new OpenSeadragon viewer for large image");
                    initializeOpenSeadragonViewer(dataUrl, true); // true indicates this is a large image
                }
            } catch (error) {
                console.error("Error finalizing large image processing:", error);
                showProgress(false);
                showNotification('Error processing large image: ' + error.message, 5000, 'error');
            }
        }
        
        // Start processing
        processNextChunk();
    } catch (error) {
        console.error("Critical error in large image processor:", error);
        showProgress(false);
        showNotification(`Error processing image: ${error.message}. Please try a different file.`, 5000, 'error');
    }
}


function zoomIn() {
    if (viewer) {
        viewer.viewport.zoomBy(1.2);
        viewer.viewport.applyConstraints();
    }
}

function zoomOut() {
    if (viewer) {
        viewer.viewport.zoomBy(0.8);
        viewer.viewport.applyConstraints();
    }
}

function resetView() {
    if (viewer) {
        viewer.viewport.goHome();
    }
}

// Show region info in a popup
function showRegionInfo(dot, obj) {
    const dotIndex = parseInt(dot.dataset.index);
    
    // Check if this dot already has a popup
    let popup = findPopupByDotIndex(dotIndex);
    
    // If no popup exists for this dot, create a new one (if under the limit)
    if (!popup) {
        // Check if we've reached the maximum number of popups
        if (infoPopups.length >= maxPopups) {
            // Remove the oldest popup to make room for the new one
            const oldestPopup = infoPopups.shift();
            if (oldestPopup && oldestPopup.parentNode) {
                oldestPopup.parentNode.removeChild(oldestPopup);
            }
        }
        
        // Create a new popup
        popup = createInfoPopup(dotIndex);
    }
    
    // Format coordinates with 6 decimal places
    const ra = parseFloat(dot.dataset.ra).toFixed(6);
    const dec = parseFloat(dot.dataset.dec).toFixed(6);
    const x = parseFloat(dot.dataset.x).toFixed(2);
    const y = parseFloat(dot.dataset.y).toFixed(2);
    const radius = parseFloat(dot.dataset.radius).toFixed(2);
    
    // Get the content container
    const contentContainer = popup.querySelector('.popup-content');
    if (!contentContainer) return;
    
    // Create content
    contentContainer.innerHTML = `
        <div style="margin-bottom: 8px;">
            <span style="color: #aaa;">Position (x, y):</span> ${x}, ${y}
        </div>
        <div style="margin-bottom: 8px;">
            <span style="color: #aaa;">Coordinates (RA, Dec):</span> ${ra}°, ${dec}°
        </div>
        <div style="margin-bottom: 8px;">
            <span style="color: #aaa;">Region Size:</span> ${radius} pixels
        </div>
        <div style="margin-top: 12px; text-align: center;">
            <button id="show-sed-${dotIndex}" class="sed-button" style="padding: 6px 12px; background-color: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 5px;">Show SED</button>
            <button id="show-properties-${dotIndex}" class="properties-button" style="padding: 6px 12px; background-color: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer;">Show Properties</button>
        </div>
    `;
    
    // Only position the popup near the dot if it's not already visible
    if (popup.style.display !== 'block') {
        // Position popup near the dot
        const dotRect = dot.getBoundingClientRect();
        popup.style.left = `${dotRect.right + 10}px`;
        popup.style.top = `${dotRect.top}px`;
    }
    
    // Show popup
    popup.style.display = 'block';
    
    // Highlight the selected dot
    if (dot.style) {
        dot.style.border = '2px solid yellow';
        dot.style.zIndex = '1000';
        
        // Store the original style to restore later
        dot.dataset.originalBorder = '1px solid rgba(255, 0, 0, 0.7)';
        dot.dataset.originalZIndex = 'auto';
    }
    
    // Store reference to the dot in the popup (for canvas implementation)
    popup.tempDot = dot;
    
    // Add event listener for the SED button
    const sedButton = document.getElementById(`show-sed-${dotIndex}`);
    if (sedButton) {
        sedButton.addEventListener('click', function() {
            // Get the current catalog name from the loaded catalog
            const catalogName = window.currentCatalogName;
            
            if (!catalogName) {
                showNotification('Error: No catalog loaded', 3000);
                return;
            }
            
            // Show SED at the bottom of the screen
            showSed(dot.dataset.ra, dot.dataset.dec, catalogName);
        });
    }
    
    // Add event listener for the Properties button
    const propertiesButton = document.getElementById(`show-properties-${dotIndex}`);
    if (propertiesButton) {
        propertiesButton.addEventListener('click', function() {
            // Get the current catalog name from the loaded catalog
            const catalogName = window.currentCatalogName;
            
            if (!catalogName) {
                showNotification('Error: No catalog loaded', 3000);
                return;
            }
            
            // Show properties in the left panel
            showProperties(dot.dataset.ra, dot.dataset.dec, catalogName);
        });
    }
    
    // Add event listener to the popup's close button to clean up temp dot
    const closeButton = popup.querySelector('div[style*="cursor: pointer"]');
    if (closeButton) {
        closeButton.addEventListener('click', function() {
            if (dot.classList && dot.classList.contains('temp-dot') && dot.parentNode) {
                dot.parentNode.removeChild(dot);
            }
        }, { once: true });
    }
}
// Find a popup by dot index
function findPopupByDotIndex(dotIndex) {
    for (let i = 0; i < infoPopups.length; i++) {
        if (parseInt(infoPopups[i].dataset.dotIndex) === dotIndex) {
            return infoPopups[i];
        }
    }
    return null;
}

// Replace the existing hideInfoPopup function
function hideInfoPopup(popup) {
    if (!popup) return;
    
    // Clean up the temporary dot if it exists
    if (popup.tempDot && popup.tempDot.parentNode) {
        popup.tempDot.parentNode.removeChild(popup.tempDot);
    }
    
    // Hide the popup
    popup.style.display = 'none';
    
    // Restore original style of the highlighted dot
    if (popup.dataset.dotIndex) {
        const dotIndex = parseInt(popup.dataset.dotIndex);
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

// Modify the showDynamicRangePopup function to properly initialize min/max values
function showDynamicRangePopup() {
    // First check if an image is loaded
    if (!window.fitsData || !window.fitsData.data) {
        showNotification('No image loaded. Please load an image first.', 3000, 'warning');
        return;
    }
    
    // Check if popup already exists
    let popup = document.getElementById('dynamic-range-popup');
    
    if (popup) {
        // If it exists, just show it
        popup.style.display = 'block';
        
        // Make sure the min/max inputs display the current values
        const minInput = document.getElementById('min-range-input');
        const maxInput = document.getElementById('max-range-input');
        
        if (minInput && maxInput && window.fitsData) {
            minInput.value = window.fitsData.min_value.toFixed(2);
            maxInput.value = window.fitsData.max_value.toFixed(2);
        }
        
        // Update the histogram with current data using the safe method
        requestHistogramUpdate();
        return;
    }
    
    // Create popup container
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
    popup.style.width = '500px';
    popup.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)';
    
    // Create title
    const title = document.createElement('h3');
    title.textContent = 'Dynamic Range Control';
    title.style.margin = '0 0 15px 0';
    title.style.color = '#fff';
    title.style.fontFamily = 'Arial, sans-serif';
    title.style.fontSize = '18px';
    title.style.fontWeight = 'bold';
    title.style.borderBottom = '1px solid #555';
    title.style.paddingBottom = '10px';
    
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
    
    // Create histogram canvas container
    const canvasContainer = document.createElement('div');
    canvasContainer.style.width = '100%';
    canvasContainer.style.height = '200px';
    canvasContainer.style.marginBottom = '15px';
    canvasContainer.style.backgroundColor = '#222';
    canvasContainer.style.borderRadius = '3px';
    canvasContainer.style.position = 'relative'; // Needed for absolute positioning of overlay

    // Create background canvas (bars, axes)
    const bgCanvas = document.createElement('canvas');
    bgCanvas.id = 'histogram-bg-canvas'; // New ID
    bgCanvas.width = 470;
    bgCanvas.height = 200;
    bgCanvas.style.display = 'block';
    bgCanvas.style.position = 'absolute';
    bgCanvas.style.left = '0';
    bgCanvas.style.top = '0';
    bgCanvas.style.zIndex = '1'; // Background layer

    // Create foreground canvas (lines)
    const linesCanvas = document.createElement('canvas');
    linesCanvas.id = 'histogram-lines-canvas'; // New ID
    linesCanvas.width = 470;
    linesCanvas.height = 200;
    linesCanvas.style.display = 'block';
    linesCanvas.style.position = 'absolute';
    linesCanvas.style.left = '0';
    linesCanvas.style.top = '0';
    linesCanvas.style.zIndex = '2'; // Foreground layer
    linesCanvas.style.pointerEvents = 'auto'; // Allow mouse events on this layer
    linesCanvas.style.touchAction = 'none';

    canvasContainer.appendChild(bgCanvas);
    canvasContainer.appendChild(linesCanvas);
    
    // Create percentile buttons container
    const percentileContainer = document.createElement('div');
    percentileContainer.style.display = 'flex';
    percentileContainer.style.justifyContent = 'space-between';
    percentileContainer.style.marginBottom = '15px';
    
    // Create percentile buttons
    const percentiles = [
        { label: '99.9%', value: 0.999 },
        { label: '99%', value: 0.99 },
        { label: '95%', value: 0.95 },
        { label: '90%', value: 0.90 }
    ];
    
    percentiles.forEach(percentile => {
        const button = document.createElement('button');
        button.textContent = percentile.label;
        button.style.flex = '1';
        button.style.margin = '0 5px';
        button.style.padding = '8px 0';
        button.style.backgroundColor = '#444';
        button.style.color = '#fff';
        button.style.border = 'none';
        button.style.borderRadius = '3px';
        button.style.cursor = 'pointer';
        button.style.fontFamily = 'Arial, sans-serif';
        button.style.fontSize = '14px';
        
        button.addEventListener('mouseover', () => {
            button.style.backgroundColor = '#555';
        });
        button.addEventListener('mouseout', () => {
            button.style.backgroundColor = '#444';
        });
        button.addEventListener('click', () => {
            applyPercentile(percentile.value);
        });
        
        percentileContainer.appendChild(button);
    });
    
    // Create input container
    const inputContainer = document.createElement('div');
    inputContainer.style.display = 'flex';
    inputContainer.style.alignItems = 'center';
    inputContainer.style.marginBottom = '15px';
    
    // Min input
    const minLabel = document.createElement('label');
    minLabel.textContent = 'Min:';
    minLabel.style.color = '#aaa';
    minLabel.style.marginRight = '5px';
    minLabel.style.fontFamily = 'Arial, sans-serif';
    minLabel.style.fontSize = '14px';
    
    const minInput = document.createElement('input');
    minInput.id = 'min-range-input';
    minInput.type = 'text';
    minInput.style.flex = '1';
    minInput.style.backgroundColor = '#444';
    minInput.style.color = '#fff';
    minInput.style.border = '1px solid #555';
    minInput.style.borderRadius = '3px';
    minInput.style.padding = '5px';
    minInput.style.marginRight = '15px';
    minInput.style.fontFamily = 'monospace';
    minInput.style.fontSize = '14px';
    
    // Max input
    const maxLabel = document.createElement('label');
    maxLabel.textContent = 'Max:';
    maxLabel.style.color = '#aaa';
    maxLabel.style.marginRight = '5px';
    maxLabel.style.fontFamily = 'Arial, sans-serif';
    maxLabel.style.fontSize = '14px';
    
    const maxInput = document.createElement('input');
    maxInput.id = 'max-range-input';
    maxInput.type = 'text';
    maxInput.style.flex = '1';
    maxInput.style.backgroundColor = '#444';
    maxInput.style.color = '#fff';
    maxInput.style.border = '1px solid #555';
    maxInput.style.borderRadius = '3px';
    maxInput.style.padding = '5px';
    maxInput.style.fontFamily = 'monospace';
    maxInput.style.fontSize = '14px';
    
    // Initialize min/max inputs with current FITS data values
    if (window.fitsData) {
        minInput.value = window.fitsData.min_value.toFixed(2);
        maxInput.value = window.fitsData.max_value.toFixed(2);
    }
    
    // --- MOVE THIS BLOCK --- 
    // NEW: Add input event listeners to update histogram lines on manual change
    // Use debounce to avoid excessive updates
    const debouncedHistogramUpdate = debounce(requestHistogramUpdate, 150);
    minInput.addEventListener('input', () => {
        // Optional: Add basic validation here if needed
        debouncedHistogramUpdate();
    });
    maxInput.addEventListener('input', () => {
        // Optional: Add basic validation here if needed
        debouncedHistogramUpdate();
    });
    // --- END MOVE --- 
    
    // Add inputs to container
    inputContainer.appendChild(minLabel);
    inputContainer.appendChild(minInput);
    inputContainer.appendChild(maxLabel);
    inputContainer.appendChild(maxInput);
    
    // Create color map container
    const colorMapContainer = document.createElement('div');
    colorMapContainer.style.marginBottom = '15px';
    colorMapContainer.style.display = 'flex';
    colorMapContainer.style.alignItems = 'center';
    colorMapContainer.style.flexDirection = 'column';
    
    // Color map label
    const colorMapLabel = document.createElement('label');
    colorMapLabel.textContent = 'Color Map:';
    colorMapLabel.style.color = '#aaa';
    colorMapLabel.style.marginRight = '10px';
    colorMapLabel.style.fontFamily = 'Arial, sans-serif';
    colorMapLabel.style.fontSize = '14px';
    colorMapLabel.style.alignSelf = 'flex-start';
    colorMapLabel.style.marginBottom = '5px';
    
    // Create a custom select container for colormap selection
    const customSelectContainer = document.createElement('div');
    customSelectContainer.style.width = '100%';
    customSelectContainer.style.position = 'relative';
    
    // Create the selected option display
    const selectedOption = document.createElement('div');
    selectedOption.style.display = 'flex';
    selectedOption.style.alignItems = 'center';
    selectedOption.style.padding = '8px 10px';
    selectedOption.style.backgroundColor = '#444';
    selectedOption.style.color = '#fff';
    selectedOption.style.border = '1px solid #555';
    selectedOption.style.borderRadius = '3px';
    selectedOption.style.cursor = 'pointer';
    selectedOption.style.fontFamily = 'Arial, sans-serif';
    selectedOption.style.fontSize = '14px';
    selectedOption.style.justifyContent = 'space-between';
    
    // Create the preview swatch for the selected option
    const selectedSwatch = document.createElement('div');
    selectedSwatch.style.width = '60px';
    selectedSwatch.style.height = '15px';
    selectedSwatch.style.marginRight = '10px';
    selectedSwatch.style.borderRadius = '2px';
    selectedSwatch.style.background = 'linear-gradient(to right, #000, #fff)'; // Default grayscale
    
    // Create the text for the selected option
    const selectedText = document.createElement('span');
    selectedText.textContent = 'Grayscale';
    selectedText.style.flex = '1';
    
    // Create the dropdown arrow
    const dropdownArrow = document.createElement('span');
    dropdownArrow.textContent = '▼';
    dropdownArrow.style.marginLeft = '10px';
    dropdownArrow.style.fontSize = '10px';
    
    // Add elements to the selected option display
    selectedOption.appendChild(selectedSwatch);
    selectedOption.appendChild(selectedText);
    selectedOption.appendChild(dropdownArrow);
    
    // Create the dropdown options container
    const optionsContainer = document.createElement('div');
    optionsContainer.style.position = 'absolute';
    optionsContainer.style.top = '100%';
    optionsContainer.style.left = '0';
    optionsContainer.style.width = '100%';
    optionsContainer.style.backgroundColor = '#444';
    optionsContainer.style.border = '1px solid #555';
    optionsContainer.style.borderTop = 'none';
    optionsContainer.style.borderRadius = '0 0 3px 3px';
    optionsContainer.style.zIndex = '10';
    optionsContainer.style.maxHeight = '200px';
    optionsContainer.style.overflowY = 'auto';
    optionsContainer.style.display = 'none';
    
    // Add color map options
    const colorMaps = [
        { value: 'grayscale', label: 'Grayscale', gradient: 'linear-gradient(to right, #000, #fff)' },
        { value: 'viridis', label: 'Viridis', gradient: 'linear-gradient(to right, #440154, #414487, #2a788e, #22a884, #7ad151, #fde725)' },
        { value: 'plasma', label: 'Plasma', gradient: 'linear-gradient(to right, #0d0887, #5302a3, #8b0aa5, #b83289, #db5c68, #f48849, #febc2a)' },
        { value: 'inferno', label: 'Inferno', gradient: 'linear-gradient(to right, #000004, #320a5a, #781c6d, #bb3754, #ec6824, #fbb41a)' },
        { value: 'cividis', label: 'Cividis', gradient: 'linear-gradient(to right, #00204c, #213d6b, #555b6c, #7b7a77, #a59c74, #d9d57a)' },
        { value: 'hot', label: 'Hot', gradient: 'linear-gradient(to right, #000, #f00, #ff0, #fff)' },
        { value: 'cool', label: 'Cool', gradient: 'linear-gradient(to right, #00f, #0ff, #0f0)' },
        { value: 'rainbow', label: 'Rainbow', gradient: 'linear-gradient(to right, #6e40aa, #be3caf, #fe4b83, #ff7847, #e2b72f, #aff05b)' },
        { value: 'jet', label: 'Jet', gradient: 'linear-gradient(to right, #00008f, #0020ff, #00ffff, #51ff77, #fdff00, #ff0000, #800000)' }
    ];
    
    // Create a hidden select element to store the actual value
    const hiddenSelect = document.createElement('select');
    hiddenSelect.id = 'color-map-select';
    hiddenSelect.style.display = 'none';
    
    // Set the default value based on current color map
    let currentSelection = currentColorMap || 'grayscale';
    
    // Add options to the hidden select and create visual options
    colorMaps.forEach(colorMap => {
        // Add to hidden select
        const option = document.createElement('option');
        option.value = colorMap.value;
        option.textContent = colorMap.label;
        if (colorMap.value === currentSelection) {
            option.selected = true;
            selectedSwatch.style.background = colorMap.gradient;
            selectedText.textContent = colorMap.label;
        }
        hiddenSelect.appendChild(option);
        
        // Create visual option
        const optionElement = document.createElement('div');
        optionElement.style.display = 'flex';
        optionElement.style.alignItems = 'center';
        optionElement.style.padding = '8px 10px';
        optionElement.style.cursor = 'pointer';
        optionElement.style.borderBottom = '1px solid #555';
        optionElement.dataset.value = colorMap.value;
        
        // Highlight the current selection
        if (colorMap.value === currentSelection) {
            optionElement.style.backgroundColor = '#555';
        }
        
        // Add hover effect
        optionElement.addEventListener('mouseover', () => {
            optionElement.style.backgroundColor = '#555';
        });
        optionElement.addEventListener('mouseout', () => {
            if (colorMap.value !== currentSelection) {
                optionElement.style.backgroundColor = 'transparent';
            }
        });
        
        // Create swatch for this option
        const swatch = document.createElement('div');
        swatch.style.width = '60px';
        swatch.style.height = '15px';
        swatch.style.marginRight = '10px';
        swatch.style.borderRadius = '2px';
        swatch.style.background = colorMap.gradient;
        
        // Create text for this option
        const text = document.createElement('span');
        text.textContent = colorMap.label;
        
        // Add elements to the option
        optionElement.appendChild(swatch);
        optionElement.appendChild(text);
        
        // Add click handler
        optionElement.addEventListener('click', () => {
            // Update hidden select value
            hiddenSelect.value = colorMap.value;
            
            // Update the selected display
            selectedSwatch.style.background = colorMap.gradient;
            selectedText.textContent = colorMap.label;
            
            // Update current selection
            currentSelection = colorMap.value;
            
            // Update all option backgrounds
            optionsContainer.querySelectorAll('div').forEach(opt => {
                if (opt.dataset.value === currentSelection) {
                    opt.style.backgroundColor = '#555';
                } else {
                    opt.style.backgroundColor = 'transparent';
                }
            });
            
            // Hide the options
            optionsContainer.style.display = 'none';
            
            // Update the current color map
            currentColorMap = colorMap.value;
            console.log(`Color map changed to: ${currentColorMap}`);
            
            // Trigger change event on hidden select
            const event = new Event('change');
            hiddenSelect.dispatchEvent(event);
        });
        
        // Add to options container
        optionsContainer.appendChild(optionElement);
    });
    
    // Toggle dropdown when clicking the selected option
    selectedOption.addEventListener('click', () => {
        if (optionsContainer.style.display === 'none') {
            optionsContainer.style.display = 'block';
        } else {
            optionsContainer.style.display = 'none';
        }
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!customSelectContainer.contains(e.target)) {
            optionsContainer.style.display = 'none';
        }
    });
    
    // Add elements to the custom select container
    customSelectContainer.appendChild(selectedOption);
    customSelectContainer.appendChild(optionsContainer);
    customSelectContainer.appendChild(hiddenSelect);
    
    // Add event listener to update color map when changed (using the hidden select)
    hiddenSelect.addEventListener('change', () => {
        currentColorMap = hiddenSelect.value;
    });
    
    // Add color map elements to container
    colorMapContainer.appendChild(colorMapLabel);
    colorMapContainer.appendChild(customSelectContainer);
    
    // Create scaling container
    const scalingContainer = document.createElement('div');
    scalingContainer.style.marginBottom = '15px';
    scalingContainer.style.display = 'flex';
    scalingContainer.style.alignItems = 'center';
    scalingContainer.style.flexDirection = 'column';
    
    // Scaling label
    const scalingLabel = document.createElement('label');
    scalingLabel.textContent = 'Scaling:';
    scalingLabel.style.color = '#aaa';
    scalingLabel.style.marginRight = '10px';
    scalingLabel.style.fontFamily = 'Arial, sans-serif';
    scalingLabel.style.fontSize = '14px';
    scalingLabel.style.alignSelf = 'flex-start';
    scalingLabel.style.marginBottom = '5px';
    
    // Create a custom select container for scaling
    const scalingSelectContainer = document.createElement('div');
    scalingSelectContainer.style.width = '100%';
    scalingSelectContainer.style.position = 'relative';
    
    // Create the selected option display
    const selectedScalingOption = document.createElement('div');
    selectedScalingOption.style.display = 'flex';
    selectedScalingOption.style.alignItems = 'center';
    selectedScalingOption.style.padding = '8px 10px';
    selectedScalingOption.style.backgroundColor = '#444';
    selectedScalingOption.style.color = '#fff';
    selectedScalingOption.style.border = '1px solid #555';
    selectedScalingOption.style.borderRadius = '3px';
    selectedScalingOption.style.cursor = 'pointer';
    selectedScalingOption.style.fontFamily = 'Arial, sans-serif';
    selectedScalingOption.style.fontSize = '14px';
    selectedScalingOption.style.justifyContent = 'space-between';
    
    // Create the text for the selected option
    const selectedScalingText = document.createElement('span');
    selectedScalingText.textContent = 'Linear';
    selectedScalingText.style.flex = '1';
    
    // Create the dropdown arrow
    const scalingDropdownArrow = document.createElement('span');
    scalingDropdownArrow.textContent = '▼';
    scalingDropdownArrow.style.marginLeft = '10px';
    scalingDropdownArrow.style.fontSize = '10px';
    
    // Add elements to the selected option display
    selectedScalingOption.appendChild(selectedScalingText);
    selectedScalingOption.appendChild(scalingDropdownArrow);
    
    // Create the dropdown options container
    const scalingOptionsContainer = document.createElement('div');
    scalingOptionsContainer.style.position = 'absolute';
    scalingOptionsContainer.style.top = '100%';
    scalingOptionsContainer.style.left = '0';
    scalingOptionsContainer.style.width = '100%';
    scalingOptionsContainer.style.backgroundColor = '#444';
    scalingOptionsContainer.style.border = '1px solid #555';
    scalingOptionsContainer.style.borderTop = 'none';
    scalingOptionsContainer.style.borderRadius = '0 0 3px 3px';
    scalingOptionsContainer.style.zIndex = '10';
    scalingOptionsContainer.style.maxHeight = '200px';
    scalingOptionsContainer.style.overflowY = 'auto';
    scalingOptionsContainer.style.display = 'none';
    
    // Add scaling options
    const scalingOptions = [
        { value: 'linear', label: 'Linear' },
        { value: 'logarithmic', label: 'Logarithmic' },
        { value: 'sqrt', label: 'Square Root' },
        { value: 'power', label: 'Power' },
        { value: 'asinh', label: 'Asinh' }
    ];
    
    // Create a hidden select element to store the actual value
    const hiddenScalingSelect = document.createElement('select');
    hiddenScalingSelect.id = 'scaling-select';
    hiddenScalingSelect.style.display = 'none';
    
    // Set the default value based on current scaling
    let currentScalingSelection = currentScaling || 'linear';
    
    // Add options to the hidden select and create visual options
    scalingOptions.forEach(option => {
        // Add to hidden select
        const selectOption = document.createElement('option');
        selectOption.value = option.value;
        selectOption.textContent = option.label;
        if (option.value === currentScalingSelection) {
            selectOption.selected = true;
            selectedScalingText.textContent = option.label;
        }
        hiddenScalingSelect.appendChild(selectOption);
        
        // Create visual option
        const optionElement = document.createElement('div');
        optionElement.style.display = 'flex';
        optionElement.style.alignItems = 'center';
        optionElement.style.padding = '8px 10px';
        optionElement.style.cursor = 'pointer';
        optionElement.style.borderBottom = '1px solid #555';
        optionElement.dataset.value = option.value;
        
        // Highlight the current selection
        if (option.value === currentScalingSelection) {
            optionElement.style.backgroundColor = '#555';
        }
        
        // Add hover effect
        optionElement.addEventListener('mouseover', () => {
            optionElement.style.backgroundColor = '#555';
        });
        optionElement.addEventListener('mouseout', () => {
            if (option.value !== currentScalingSelection) {
                optionElement.style.backgroundColor = 'transparent';
            }
        });
        
        // Create text for this option
        const text = document.createElement('span');
        text.textContent = option.label;
        text.style.flex = '1';
        
        // Add elements to the option
        optionElement.appendChild(text);
        
        // Add click handler
        optionElement.addEventListener('click', () => {
            // Update hidden select value
            hiddenScalingSelect.value = option.value;
            
            // Update the selected display
            selectedScalingText.textContent = option.label;
            
            // Update current selection
            currentScalingSelection = option.value;
            
            // Update all option backgrounds
            scalingOptionsContainer.querySelectorAll('div').forEach(opt => {
                if (opt.dataset.value === currentScalingSelection) {
                    opt.style.backgroundColor = '#555';
                } else {
                    opt.style.backgroundColor = 'transparent';
                }
            });
            
            // Hide the options
            scalingOptionsContainer.style.display = 'none';
            
            // Update the current scaling
            currentScaling = option.value;
            console.log(`Scaling changed to: ${currentScaling}`);
            
            // Trigger change event on hidden select
            const event = new Event('change');
            hiddenScalingSelect.dispatchEvent(event);
        });
        
        // Add to options container
        scalingOptionsContainer.appendChild(optionElement);
    });
    
    // Toggle dropdown when clicking the selected option
    selectedScalingOption.addEventListener('click', () => {
        if (scalingOptionsContainer.style.display === 'none') {
            scalingOptionsContainer.style.display = 'block';
        } else {
            scalingOptionsContainer.style.display = 'none';
        }
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!scalingSelectContainer.contains(e.target)) {
            scalingOptionsContainer.style.display = 'none';
        }
    });
    
    // Add elements to the custom select container
    scalingSelectContainer.appendChild(selectedScalingOption);
    scalingSelectContainer.appendChild(scalingOptionsContainer);
    scalingSelectContainer.appendChild(hiddenScalingSelect);
    
    // Add event listener to update scaling when changed
    hiddenScalingSelect.addEventListener('change', () => {
        currentScaling = hiddenScalingSelect.value;
    });
    
    // Add scaling elements to container
    scalingContainer.appendChild(scalingLabel);
    scalingContainer.appendChild(scalingSelectContainer);
    
    // Create button container
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'space-between';
    
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
        applyDynamicRange();
    });
    
    // Reset button
    const resetButton = document.createElement('button');
    resetButton.textContent = 'Reset';
    resetButton.style.flex = '1';
    resetButton.style.padding = '8px 0';
    resetButton.style.backgroundColor = '#f44336';
    resetButton.style.color = '#fff';
    resetButton.style.border = 'none';
    resetButton.style.borderRadius = '3px';
    resetButton.style.cursor = 'pointer';
    resetButton.style.fontFamily = 'Arial, sans-serif';
    resetButton.style.fontSize = '14px';
    
    resetButton.addEventListener('mouseover', () => {
        resetButton.style.backgroundColor = '#d32f2f';
    });
    resetButton.addEventListener('mouseout', () => {
        resetButton.style.backgroundColor = '#f44336';
    });
    resetButton.addEventListener('click', () => {
        resetDynamicRange();
    });
    
    // Add buttons to container
    buttonContainer.appendChild(applyButton);
    buttonContainer.appendChild(resetButton);
    
    // Add all elements to popup
    popup.appendChild(title);
    popup.appendChild(closeButton);
    popup.appendChild(canvasContainer);
    popup.appendChild(percentileContainer);
    popup.appendChild(inputContainer);
    popup.appendChild(colorMapContainer);
    popup.appendChild(scalingContainer);
    popup.appendChild(buttonContainer);
    
    // Make popup draggable
    makeDraggable(popup, title);
    
    // Add popup to document
    document.body.appendChild(popup);
    
    // Initialize min/max values if we have FITS data
    if (window.fitsData && window.fitsData.data) {
        // Use current values
        minInput.value = window.fitsData.min_value.toFixed(2);
        maxInput.value = window.fitsData.max_value.toFixed(2);
        
        // Update the histogram
        requestHistogramUpdate();
    } else {
        // If no data, just update the histogram
        requestHistogramUpdate();
    }

    // NEW: Initialize throttled/debounced functions if not already done
    if (!throttledHistogramUpdate) {
        throttledHistogramUpdate = throttle(requestHistogramUpdate, 50); // Update histogram max 20fps during drag
    }
    if (!debouncedApplyDynamicRange) {
        debouncedApplyDynamicRange = debounce(applyDynamicRange, 250); // Apply changes 250ms after drag stops
    }

    // NEW: Add event listeners for interactive histogram lines
    addHistogramInteraction(linesCanvas, minInput, maxInput);

    // Initialize the histogram display (will call background + lines drawing)
    requestHistogramUpdate();
}
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
        showNotification('Invalid min/max values', 2000);
        return;
    }
    
    if (minValue >= maxValue) {
        showNotification('Min value must be less than max value', 2000);
        return;
    }
    
    console.log(`Applying dynamic range: ${minValue} to ${maxValue}`);
    
    // Check if fitsData exists in window scope
    if (!window.fitsData) {
        console.error('No FITS data available in global scope');
        showNotification('No image data available. Please load an image first.', 3000);
        return;
    }
    
    // Update the dynamic range in the FITS data
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
    
    // Refresh the image
    refreshImage();
    
    // Update the histogram
    requestHistogramUpdate();
}

function resetDynamicRange() {
    // FIX: Explicitly check window.fitsData and its properties
    if (!window.fitsData || !window.fitsData.data || !window.fitsData.width || !window.fitsData.height) {
        showNotification('No image data available or data is incomplete', 2000);
        return;
    }
    
    try {
        // Collect all valid pixel values with sampling for performance
        const validPixels = [];
        const maxSampleSize = 500000; // Limit sample size for performance
        // FIX: Use window.fitsData consistently
        const skipFactor = Math.max(1, Math.floor((window.fitsData.width * window.fitsData.height) / maxSampleSize));
        
        let pixelCount = 0;
        // FIX: Use window.fitsData consistently
        for (let y = 0; y < window.fitsData.height; y++) {
            // FIX: Use window.fitsData consistently
            for (let x = 0; x < window.fitsData.width; x += skipFactor) {
                pixelCount++;
                if (pixelCount % skipFactor !== 0) continue; // Sample only every Nth pixel
                
                // FIX: Use window.fitsData consistently
                const value = window.fitsData.data[y][x];
                if (!isNaN(value) && isFinite(value)) {
                    validPixels.push(value);
                }
            }
        }
        
        if (validPixels.length === 0) {
            console.error('No valid pixels found');
            showNotification('No valid pixels found', 2000);
            return;
        }
        
        // --- CHANGE: Calculate Percentiles instead of Min/Max ---
        // Sort the pixel values
        validPixels.sort((a, b) => a - b);

        // Calculate indices for 0.5% and 99.5% percentiles
        const lowerPercentile = 0.005;
        const upperPercentile = 0.995;
        const lowerIndex = Math.floor(lowerPercentile * (validPixels.length - 1));
        const upperIndex = Math.ceil(upperPercentile * (validPixels.length - 1));

        // Get the values at these percentiles
        const minValue = validPixels[lowerIndex];
        const maxValue = validPixels[upperIndex];
        // --- End CHANGE ---

        console.log(`Resetting to 99% range: min=${minValue.toFixed(2)}, max=${maxValue.toFixed(2)}`);

        // Apply the calculated percentile range
        const minInput = document.getElementById('min-range-input');
        const maxInput = document.getElementById('max-range-input');
        
        if (minInput && maxInput) {
            minInput.value = minValue.toFixed(2);
            maxInput.value = maxValue.toFixed(2);
        }
        
        // Update the dynamic range in the FITS data
        if (window.fitsData && viewer) {
            window.fitsData.min_value = minValue;
            window.fitsData.max_value = maxValue;

            refreshImage();
        }
        
        requestHistogramUpdate();
        
    } catch (error) {
        console.error('Error resetting dynamic range:', error);
        showNotification(`Error: ${error.message}`, 3000);
    }
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
function initializeOpenSeadragonViewer(dataUrl, isLargeImage) {
    console.log("Initializing OpenSeadragon viewer");
    console.log("Light mode");

    // Determine if we're working with a large image
    isLargeImage = isLargeImage || (window.fitsData && (window.fitsData.width * window.fitsData.height) > 100000000);
    
    // Configure options based on image size
    const viewerOptions = {
        id: "openseadragon",
        tileSources: {
            type: 'image',
            url: dataUrl,
            buildPyramid: false
        },
        prefixUrl: "https://cdnjs.cloudflare.com/ajax/libs/openseadragon/2.4.2/images/",
        showNavigator: true,
        navigatorPosition: "TOP_LEFT",
        showZoomControl: false,
        showHomeControl: false,
        showFullPageControl: false,
        showRotationControl: false,
        defaultZoomLevel: isLargeImage ? 0.2 : 0.8, // Start more zoomed out for large images
        minZoomLevel: 0.02, // Allow zooming out more for large images
        maxZoomLevel: 20,
        immediateRender: !isLargeImage, // Disable immediate render for large images
        blendTime: 0, // No blend for better performance
        placeholderFillStyle: "#000000",
        backgroundColor: "#000000",
        navigatorBackground: "#000000",
        timeout: 120000, // Increased timeout for large images
        
        // Performance optimizations for large images
        animationTime: isLargeImage ? 0.3 : 1.2,
        // springStiffness: isLargeImage ? 15 : 5.5,
        // visibilityRatio: 0.05, // Only load what's visible
        constrainDuringPan: true,
        wrapHorizontal: false,
        wrapVertical: false,
        
        // Additional performance tweaks for very large images
        degrees: 0,
        navigatorAutoFade: false, // Keep navigator visible
        
                // Add or modify these options:
        minPixelRatio: 1.0, // Increase from 0.5 or 0.8 to 1.0 for better quality
        immediateRender: true, // Force immediate render for small files
        blendTime: 0, // No blend for crisp transitions
        preserveViewport: true,             // Maintain current view when switching images
        immediateRender: true,              // Don't defer rendering (better quality)
        blendTime: 0,                       // Disable blending for sharper transitions
        wrapHorizontal: false,
        wrapVertical: false,

        springStiffness: 5,                 // More gentle animations for clearer viewing
        visibilityRatio: 0.1, 
    // Memory management for large images
        maxImageCacheCount: 500,            // Cache more images in memory
        subPixelRoundingForTransparency: 1, // Best subpixel rounding

        // Better interpolation:
        placeholderFillStyle: "#000000",
        subPixelRoundingForTransparency: 1, // Improved sub-pixel rendering
        
        // Setup appropriate rendering parameters for large images
        pixelsPerWheelLine: isLargeImage ? 120 : 40, // Faster zooming for large images
        gestureSettingsMouse: {
            clickToZoom: !isLargeImage, // Disable click-to-zoom for large images
            flickEnabled: false, // Disable flick as it can cause performance issues
            scrollToZoom: true,
            pinchToZoom: true
        }
    };
    
    // Initialize the viewer
    viewer = OpenSeadragon(viewerOptions);
    
    // Hide loading indicator when image is loaded
    viewer.addHandler('open', function() {
        console.log("OpenSeadragon viewer opened successfully");
        showProgress(false);
    updateAllCanvases();
        
        
        // For large images, add a notification with tips
        if (isLargeImage) {
            showNotification(
                `Large image loaded successfully (${window.fitsData.width}x${window.fitsData.height}). ` +
                'Use mouse wheel to zoom and drag to pan.', 
                4000, 'success'
            );
        }
    });
    
    // Add optimizations for large images
    if (isLargeImage) {
        // Throttle mouse move events to improve performance
        viewer.addHandler('canvas-drag', function(event) {
            event.preventDefaultAction = true;
            // This creates a smoother drag experience for large images
            viewer.viewport.panBy(viewer.viewport.deltaPointsFromPixels(event.delta));
        });
        
        // Use simpler animation for large images
        viewer.addHandler('animation', function(event) {
            if (event.userData && event.userData === 'wheel') {
                event.frame = event.frames; // Complete animation immediately
            }
        });
    }
    
    // Handle errors during loading
    viewer.addHandler('open-failed', function(event) {
        console.error("Failed to open image:", event);
        showProgress(false);
        showNotification(`Error loading image: ${event.message || 'Unknown error'}`, 3000, 'error');
    });
    // updateAllCanvases();

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
    showProgress(true, 'Updating image...');
    
    // Use worker if available, otherwise process in main thread
    if (window.Worker) {
        processImageInWorker();
    } else {
        processImageInMainThread();
    }
    
    // Add a success notification
    setTimeout(() => {
        showProgress(false);
        showNotification('Image updated successfully', 1500, 'success');
    }, 500);
}

/**
 * Show a notification message to the user
 * @param {string} message - The message to display
 * @param {number} duration - How long to show the message in milliseconds
 */
function showNotification(message, duration = 2000, type = 'info') {
    console.log('Notification:', message);
    
    // Create notification container if it doesn't exist
    let notificationContainer = document.getElementById('notification-container');
    if (!notificationContainer) {
        notificationContainer = document.createElement('div');
        notificationContainer.id = 'notification-container';
        notificationContainer.style.position = 'fixed';
        notificationContainer.style.bottom = '20px';
        notificationContainer.style.left = '20px';
        notificationContainer.style.zIndex = '2000';
        notificationContainer.style.display = 'flex';
        notificationContainer.style.flexDirection = 'column';
        notificationContainer.style.gap = '10px';
        notificationContainer.style.maxWidth = '300px';
        document.body.appendChild(notificationContainer);
    }
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.style.backgroundColor = 'rgba(33, 33, 33, 0.9)';
    notification.style.color = 'white';
    notification.style.padding = '12px 16px';
    notification.style.borderRadius = '6px';
    notification.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
    notification.style.fontFamily = 'Arial, sans-serif';
    notification.style.fontSize = '14px';
    notification.style.opacity = '0';
    notification.style.transform = 'translateY(20px)';
    notification.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    notification.style.display = 'flex';
    notification.style.alignItems = 'center';
    notification.style.backdropFilter = 'blur(4px)';
    notification.style.webkitBackdropFilter = 'blur(4px)';
    notification.style.borderLeft = '4px solid';
    
    // Set type-specific styles
    let iconHtml = '';
    if (type === 'success') {
        notification.style.borderLeftColor = '#4CAF50';
        iconHtml = '<div style="margin-right: 10px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg></div>';
    } else if (type === 'error') {
        notification.style.borderLeftColor = '#F44336';
        iconHtml = '<div style="margin-right: 10px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F44336" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></div>';
    } else if (type === 'warning') {
        notification.style.borderLeftColor = '#FF9800';
        iconHtml = '<div style="margin-right: 10px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FF9800" stroke-width="2"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg></div>';
    } else {
        notification.style.borderLeftColor = '#2196F3';
        iconHtml = '<div style="margin-right: 10px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2196F3" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg></div>';
    }
    
    // Create content with icon
    notification.innerHTML = iconHtml + '<div>' + message + '</div>';
    
    // Add close button
    const closeButton = document.createElement('div');
    closeButton.innerHTML = '&times;';
    closeButton.style.marginLeft = 'auto';
    closeButton.style.marginRight = '-5px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.color = '#aaa';
    closeButton.style.fontSize = '18px';
    closeButton.style.fontWeight = 'bold';
    closeButton.style.padding = '0 5px';
    closeButton.addEventListener('click', () => {
        removeNotification(notification);
    });
    notification.appendChild(closeButton);
    
    // Add to container
    notificationContainer.appendChild(notification);
    
    // Trigger animation
    setTimeout(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateY(0)';
    }, 10);
    
    // Auto-remove after duration
    const timerId = setTimeout(() => {
        removeNotification(notification);
    }, duration);
    
    // Store the timer ID for potential early removal
    notification.dataset.timerId = timerId;
    
    // Function to remove notification with animation
    function removeNotification(notif) {
        // Clear the timeout to prevent duplicate removals
        clearTimeout(notif.dataset.timerId);
        
        // Animate out
        notif.style.opacity = '0';
        notif.style.transform = 'translateY(20px)';
        
        // Remove after animation completes
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

/**
 * Request a histogram update in a safe way that prevents multiple simultaneous updates
 */
function requestHistogramUpdate() {
    // If we're already updating the histogram, queue this request
    if (isUpdatingHistogram) {
        console.log('Histogram update already in progress, queueing request');
        histogramUpdateRequested = true;
        return;
    }
    
    // If there's a pending timer, clear it
    if (histogramUpdateTimer) {
        clearTimeout(histogramUpdateTimer);
        histogramUpdateTimer = null;
    }
    
    // Start a new update
    updateHistogram();
}

/**
 * Update the histogram display with the current data
 */
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
    console.log('Fetching histogram data from server');
    
    const canvas = document.getElementById('histogram-canvas');
    if (!canvas) return;
    
    // Show a loading message
    drawEmptyHistogram(canvas, 'Loading histogram data...');
    
    // Fetch histogram data from the server
    fetch('/fits-histogram/')
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to fetch histogram data');
            }
            return response.json();
        })
        .then(data => {
            if (data.error) {
                throw new Error(data.error);
            }
            
            // Draw the histogram with the server data
            drawServerHistogram(data);
        })
        .catch(error => {
            console.error('Error fetching histogram:', error);
            drawEmptyHistogram(canvas, 'Error: ' + error.message);
        });
}

/**
 * Draw a histogram with data from the server
 */
function drawServerHistogram(histData) {
    const canvas = document.getElementById('histogram-canvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear the canvas
    ctx.clearRect(0, 0, width, height);
    
    // Extract data
    const bins = histData.counts;
    const binEdges = histData.bin_edges;
    const minValue = histData.min_value;
    const maxValue = histData.max_value;
    
    // Find the maximum bin count for scaling
    let maxBinCount = 0;
    for (let i = 0; i < bins.length; i++) {
        maxBinCount = Math.max(maxBinCount, bins[i]);
    }
    
    // If no bins, show a message
    if (maxBinCount === 0) {
        drawEmptyHistogram(canvas, 'No pixels in the selected range');
        return;
    }
    
    // Calculate logarithmic scale
    const logMaxBinCount = Math.log(maxBinCount + 1);
    
    // Draw the histogram (using the same drawing code as regular updateHistogram)
    const padding = { top: 30, right: 20, bottom: 40, left: 60 };
    const histHeight = height - padding.top - padding.bottom;
    
    // Draw axes, labels, etc. (same as in updateHistogram)
    // ...
    
    // Draw histogram bars
    ctx.fillStyle = '#4CAF50';
    const barWidth = (width - padding.left - padding.right) / bins.length;
    
    for (let i = 0; i < bins.length; i++) {
        const binCount = bins[i];
        if (binCount === 0) continue;
        
        // Use log scale for height
        const logHeight = Math.log(binCount + 1) / logMaxBinCount * histHeight;
        
        const x = padding.left + i * barWidth;
        const y = height - padding.bottom - logHeight;
        
        ctx.fillRect(x, y, barWidth - 1, logHeight);
    }
    
    // Draw min/max markers and statistics (same as in updateHistogram)
    // ...
    
    // Add server-side indicator
    ctx.fillStyle = '#aaa';
    ctx.font = '10px Arial';
    ctx.textAlign = 'right';
    ctx.fillText('Server-side histogram', width - padding.right, height - 5);
}

// Add this to static.js in the appropriate location

// The local filtering function that uses the cached data

// Modify applyLocalFilter to handle the env filter case
function applyLocalFilter(flagColumn) {
    // If this is an env filter with a specific value, use applyEnvFilter instead
    if (flagColumn === 'env' && currentEnvValue !== null) {
        applyEnvFilter(currentEnvValue);
        return;
    }
    
    if (!window.catalogDataWithFlags || !window.catalogDots) {
        console.warn('No catalog data available for filtering');
        return;
    }
    
    showProgress(true, 'Applying filter...');
    
    let visibleCount = 0;
    const totalDots = window.catalogDots.length;
    
    // Process all dots at once using the cached data
    window.catalogDots.forEach((dot, i) => {
        // Get the object index from the dot's dataset
        const dotIndex = parseInt(dot.dataset.index);
        
        if (isNaN(dotIndex) || dotIndex >= window.catalogDataWithFlags.length) {
            // If we can't match the dot to data, hide it
            dot.style.display = 'none';
            return;
        }
        
        // Get the corresponding data object
        const objData = window.catalogDataWithFlags[dotIndex];
        
        // Check if the flag property exists and is true
        let isFlagSet = false;
        
        if (objData && flagColumn in objData) {
            const flagValue = objData[flagColumn];
            
            // Handle different formats of boolean values
            isFlagSet = (flagValue === true || 
                         flagValue === 'True' || 
                         flagValue === 'true' || 
                         flagValue === 1);
        }
        
        // Debug: Log information for a few dots to check values
        if (i < 5) {
            console.log(`Dot ${i} (index ${dotIndex}): ${flagColumn} = ${objData[flagColumn]}, isFlagSet = ${isFlagSet}`);
        }
        
        // Explicitly set the display style based on the flag
        dot.style.display = isFlagSet ? 'block' : 'none';
        
        // Also set the dataset property for tracking
        dot.dataset.passesFilter = isFlagSet ? 'true' : 'false';
        
        if (isFlagSet) {
            visibleCount++;
        }
    });
    
    // Force a redraw of the overlay
    updateOverlay();
    
    showProgress(false);
    
    if (visibleCount === 0) {
        showNotification(`No objects match the "${flagColumn}" filter criteria`, 3000);
    } else {
        // showNotification(`Showing ${visibleCount} objects with "${flagColumn}" flag`, 2000);
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
    
    showProgress(true, 'Applying environment filter...');
    
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
    
    showProgress(false);
    
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
    showProgress(true, 'Applying flag filter...');
    
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
                showProgress(false);
                return;
            }
            
            // If flag exists, fetch properties for all dots (with a limit) and apply filtering
            applyFilterToAllDots(flagColumn);
        })
        .catch(error => {
            console.error('Error checking flag existence:', error);
            showNotification('Error applying filter', 3000);
            showProgress(false);
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
                showProgress(true, `Filtering: ${progress}% complete...`);
                
                // If there are more dots to process, schedule the next batch
                if (endIndex < totalDots) {
                    setTimeout(() => processBatch(endIndex), 100);
                } else {
                    // All done
                    showProgress(false);
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
                showProgress(false);
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
    createDynamicRangeControl();
    createWelcomeScreen();

});

// Create a welcome screen for initial view
function createWelcomeScreen() {
    const container = document.getElementById('openseadragon');
    if (!container) return;
    
    // Clear any content
    container.innerHTML = '';
    
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
        <h2>Welcome to Neloura</h2>
        <p>Please select a FITS file to open using the folder icon 📁 in the top-right corner.</p>
    `;
    
    // Add animated arrow pointing to the file browser button
    const pointerDiv = document.createElement('div');
    pointerDiv.className = 'welcome-pointer';
    pointerDiv.innerHTML = '&#10229;'; // Left arrow
    
    container.appendChild(welcomeDiv);
    container.appendChild(pointerDiv);
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

// Initialize tiled viewer
function initializeTiledViewer() {
    console.log("Initializing tiled viewer");
    
    // Hide loading indicator
    showProgress(true, 'Loading tile information...');
    
    // Fetch tile information
    fetch('/fits-tile-info/')
        .then(response => {
            if (!response.ok) {
                throw new Error(`Failed to get tile info: ${response.statusText}`);
            }
            return response.json();
        })
        .then(tileInfo => {
            // Store tile info globally
            currentTileInfo = tileInfo;
            console.log("Tile info:", tileInfo);
            
            // Show loading indicator while initializing OpenSeadragon
            showProgress(true, 'Initializing tiled viewer...');
            
            // Create a custom tile source for OpenSeadragon
            const tileSource = {
                width: tileInfo.width,
                height: tileInfo.height,
                tileSize: tileInfo.tileSize,
                maxLevel: tileInfo.maxLevel,
                getTileUrl: function(level, x, y) {
                    return `/fits-tile/${level}/${x}/${y}`;
                },
                // Add image data for initial low-resolution overview
                getLevelScale: function(level) {
                    return 1 / (1 << (this.maxLevel - level));
                }
            };
            
            // Configure OpenSeadragon options
            const viewerOptions = {
                id: "openseadragon",
                tileSources: tileSource,
                prefixUrl: "https://cdnjs.cloudflare.com/ajax/libs/openseadragon/2.4.2/images/",
                showNavigator: true,
                navigatorPosition: "TOP_LEFT",
                showZoomControl: true,
                showHomeControl: true,
                showFullPageControl: false,
                showRotationControl: false,
                defaultZoomLevel: 0.8,
                minZoomLevel: 0.05,
                maxZoomLevel: 20,
                immediateRender: false,
                blendTime: 0.1,
                placeholderFillStyle: "#000000",
                backgroundColor: "#000000",
                navigatorBackground: "#000000",
                timeout: 60000,
                springStiffness: 7,
                visibilityRatio: 0.1,
                constrainDuringPan: true,
                wrapHorizontal: false,
                wrapVertical: false,
                minPixelRatio: 0.8,
                crossOriginPolicy: 'Anonymous',
                pixelsPerWheelLine: 40,
                debugMode: false,
                // Add custom loading image - low-resolution overview
                loadTilesWithAjax: true,
                ajaxHeaders: {}
            };
            
            // If we have an overview image, show it immediately
            if (tileInfo.overview) {
                viewerOptions.loadTilesWithAjax = true;
                // Show the overview image while tiles are loading
                showOverviewImage(tileInfo.overview);
            }
            
            // Initialize OpenSeadragon
            if (!tiledViewer) {
                tiledViewer = OpenSeadragon(viewerOptions);
                
                // Add event handlers
                tiledViewer.addHandler('open', function() {
                    console.log("Tiled viewer opened successfully");
                    showProgress(false);
                    
                    // Hide the overview image once tiles start loading
                    hideOverviewImage();
                });
                
                tiledViewer.addHandler('open-failed', function(event) {
                    console.error("Failed to open tiled image:", event);
                    showProgress(false);
                    showNotification(`Error loading tiled image: ${event.message || 'Unknown error'}`, 3000, 'error');
                });
                
                // Add a loading indicator for tiles
                tiledViewer.addHandler('tile-load-failed', function(event) {
                    console.warn(`Tile load failed: level=${event.tile.level}, x=${event.tile.x}, y=${event.tile.y}`);
                });
                
                // Add an error handler
                tiledViewer.addHandler('error', function(event) {
                    console.error("Tiled viewer error:", event);
                });
            } else {
                // Update the tile source if the viewer already exists
                tiledViewer.open(tileSource);
            }
        })
        .catch(error => {
            console.error("Error initializing tiled viewer:", error);
            showProgress(false);
            showNotification(`Error initializing tiled viewer: ${error.message}`, 3000, 'error');
            
            // Fall back to regular viewer
            if (!viewer && window.fitsData) {
                console.log("Falling back to regular viewer");
                initializeViewerWithFitsData();
            }
        });
}

// Show overview image while tiles are loading
function showOverviewImage(base64Image) {
    // Create or get the overview container
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
        overviewContainer.style.zIndex = '999';
        
        // Add to the openseadragon container
        const osdContainer = document.getElementById('openseadragon');
        if (osdContainer) {
            osdContainer.appendChild(overviewContainer);
        }
    }
    
    // Create image element
    const img = document.createElement('img');
    img.src = `data:image/png;base64,${base64Image}`;
    img.style.maxWidth = '100%';
    img.style.maxHeight = '100%';
    
    // Clear and add the image
    overviewContainer.innerHTML = '';
    overviewContainer.appendChild(img);
    overviewContainer.style.display = 'flex';
}

// Hide overview image once tiles start loading
function hideOverviewImage() {
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
                
                // Load the next quality level
                setTimeout(() => loadOverviewAtQuality(quality + 1), 1000);
            }
        })
        .catch(error => {
            console.error(`Error loading overview at quality ${quality}:`, error);
        });
}


// Function to check if valid WCS information is available
function checkValidWCS() {
    // First check if fitsData exists and has WCS information
    if (!window.fitsData || !window.fitsData.wcs) {
        console.warn("No WCS information available in FITS data");
        return false;
    }
    
    // Parse the WCS properly
    const wcs = parseWCS(window.fitsData.wcs);
    
    // Store the properly parsed WCS for future use
    window.parsedWCS = wcs;
    
    // Log WCS information for debugging
    console.log("Parsed WCS information:", wcs);
    
    return wcs.hasWCS;
}


function parseWCS(header) {
    if (!header) return null;
    
    // console.log("Parsing WCS from header with properties:", Object.keys(header));
    
    // Create an empty WCS object with default values
    const wcs = {
        hasWCS: false
    };
    
    // Helper function to get properties safely, checking both camelCase and UPPERCASE formats
    function getProperty(obj, propName) {
        // Try different case variations
        const variations = [
            propName.toLowerCase(),             // lowercase (crval1)
            propName.toUpperCase(),             // uppercase (CRVAL1)
            propName,                           // as provided (crval1)
            propName.charAt(0).toUpperCase() + propName.slice(1) // Title case (Crval1)
        ];
        
        // Check all variations
        for (const variant of variations) {
            if (obj[variant] !== undefined) {
                return obj[variant];
            }
        }
        
        // Special case for properties that might have different naming
        if (propName.includes('_')) {
            // Try without underscore (cd1_1 -> cd11)
            const withoutUnderscore = propName.replace('_', '');
            return getProperty(obj, withoutUnderscore);
        }
        
        return undefined;
    }
    
    // Get basic WCS parameters
    wcs.crval1 = getProperty(header, 'crval1');
    wcs.crval2 = getProperty(header, 'crval2');
    wcs.crpix1 = getProperty(header, 'crpix1');
    wcs.crpix2 = getProperty(header, 'crpix2');
    wcs.cdelt1 = getProperty(header, 'cdelt1');
    wcs.cdelt2 = getProperty(header, 'cdelt2');
    
    // Get transformation matrix elements - CD matrix
    wcs.cd1_1 = getProperty(header, 'cd1_1');
    wcs.cd1_2 = getProperty(header, 'cd1_2');
    wcs.cd2_1 = getProperty(header, 'cd2_1');
    wcs.cd2_2 = getProperty(header, 'cd2_2');
    
    // Get transformation matrix elements - PC matrix
    wcs.pc1_1 = getProperty(header, 'pc1_1');
    wcs.pc1_2 = getProperty(header, 'pc1_2');
    wcs.pc2_1 = getProperty(header, 'pc2_1');
    wcs.pc2_2 = getProperty(header, 'pc2_2');
    
    // Get ORIENTAT if available
    wcs.orientat = getProperty(header, 'orientat');
    
    // Get coordinate types
    wcs.ctype1 = getProperty(header, 'ctype1');
    wcs.ctype2 = getProperty(header, 'ctype2');

    // Fix for JWST MIRI and similar images - use ra_ref/dec_ref/x_ref/y_ref if available
    if (!wcs.crval1 && header.ra_ref !== undefined) wcs.crval1 = header.ra_ref;
    if (!wcs.crval2 && header.dec_ref !== undefined) wcs.crval2 = header.dec_ref;
    if (!wcs.crpix1 && header.x_ref !== undefined) wcs.crpix1 = header.x_ref;
    if (!wcs.crpix2 && header.y_ref !== undefined) wcs.crpix2 = header.y_ref;
    
    // // Log what we found
    // console.log("Found WCS parameters:", {
    //     crval1: wcs.crval1, 
    //     crval2: wcs.crval2,
    //     crpix1: wcs.crpix1,
    //     crpix2: wcs.crpix2,
    //     cd1_1: wcs.cd1_1,
    //     cd2_2: wcs.cd2_2,
    //     pc1_1: wcs.pc1_1,
    //     pc2_2: wcs.pc2_2,
    //     orientat: wcs.orientat
    // });
    
    // Calculate CD matrix if it's not provided but PC matrix and CDELT are available
    if (wcs.cd1_1 === undefined && wcs.pc1_1 !== undefined && wcs.cdelt1 !== undefined) {
        wcs.cd1_1 = wcs.pc1_1 * wcs.cdelt1;
        wcs.cd1_2 = (wcs.pc1_2 || 0) * wcs.cdelt1;
        wcs.cd2_1 = (wcs.pc2_1 || 0) * wcs.cdelt2;
        wcs.cd2_2 = wcs.pc2_2 * wcs.cdelt2;
        console.log("Calculated CD matrix from PC and CDELT");
    }
    
    // Check if we have enough information for coordinate transformation
    wcs.hasWCS = (wcs.crval1 !== undefined && wcs.crval2 !== undefined &&
                 wcs.crpix1 !== undefined && wcs.crpix2 !== undefined &&
                 ((wcs.cd1_1 !== undefined && wcs.cd2_2 !== undefined) ||
                  (wcs.cdelt1 !== undefined && wcs.cdelt2 !== undefined)));
    
    // console.log("WCS is valid:", wcs.hasWCS);
    
    // Calculate effective transformation matrix and determine orientation
    if (wcs.hasWCS) {
        // Prioritize CD matrix over PC matrix if both are available
        let m11, m12, m21, m22;
        
        if (wcs.cd1_1 !== undefined) {
            // Use CD matrix
            m11 = wcs.cd1_1;
            m12 = wcs.cd1_2 || 0;
            m21 = wcs.cd2_1 || 0;
            m22 = wcs.cd2_2;
            // console.log("Using CD matrix for transformation");
        } else {
            // Use PC matrix with CDELT
            m11 = wcs.pc1_1 * wcs.cdelt1;
            m12 = (wcs.pc1_2 || 0) * wcs.cdelt1;
            m21 = (wcs.pc2_1 || 0) * wcs.cdelt2;
            m22 = wcs.pc2_2 * wcs.cdelt2;
            console.log("Using PC matrix with CDELT for transformation");
        }
        
        // Calculate determinant to check for coordinate flips
        const det = m11 * m22 - m12 * m21;
        
        // Calculate rotation angle correctly for astronomical images:
        // The position angle (East of North) is given by atan2(CD2_1, CD1_1)
        let theta = Math.atan2(m21, m11);
        
        // Convert to degrees
        let thetaDegrees = (theta * 180 / Math.PI);
        
        // Check against ORIENTAT if available
        if (wcs.orientat !== undefined) {
            const orientatDiff = Math.abs(thetaDegrees - wcs.orientat) % 360;
            console.log(`Calculated rotation: ${thetaDegrees.toFixed(2)}°, ORIENTAT: ${wcs.orientat}°, difference: ${orientatDiff.toFixed(2)}°`);
            
            // If more than 1 degree difference, issue a warning
            if (orientatDiff > 1 && orientatDiff < 359) {
                console.warn(`Calculated rotation angle differs from ORIENTAT by ${orientatDiff.toFixed(2)}°`);
            }
        }
        
        // Store the transformation info
        wcs.transformInfo = {
            det: det,
            isFlipped: det < 0,
            theta: theta,
            thetaDegrees: thetaDegrees,
            m11: m11,
            m12: m12,
            m21: m21,
            m22: m22
        };
        
        // console.log(`WCS matrix transform: rotation=${thetaDegrees.toFixed(2)}°, flipped=${det < 0}`);
    }
    
    return wcs;
}



function celestialToPixel(ra, dec, wcs) {
    if (!wcs || !wcs.hasWCS) return { x: 0, y: 0 };
    
    try {
        // Get reference points
        const crpix1 = wcs.crpix1;
        const crpix2 = wcs.crpix2;
        const crval1 = wcs.crval1;
        const crval2 = wcs.crval2;
        
        // Calculate deltas in sky coordinates
        const dra = (ra - crval1) * Math.cos(crval2 * Math.PI / 180);
        const ddec = dec - crval2;
        
        // Use the transformation matrix from the WCS object
        const transform = wcs.transformInfo;
        if (!transform) {
            console.warn("No transformation matrix available in WCS object");
            return { x: 0, y: 0 };
        }
        
        // PC Matrix information logging
        const pcInfo = {
            pc1_1: wcs.pc1_1 !== undefined ? wcs.pc1_1 : 'N/A',
            pc1_2: wcs.pc1_2 !== undefined ? wcs.pc1_2 : 'N/A',
            pc2_1: wcs.pc2_1 !== undefined ? wcs.pc2_1 : 'N/A',
            pc2_2: wcs.pc2_2 !== undefined ? wcs.pc2_2 : 'N/A'
        };
        
        // Check for negative PC matrix values
        const negativePCs = Object.entries(pcInfo)
            .filter(([key, value]) => value !== 'N/A' && value < 0)
            .map(([key, value]) => `${key}: ${value}`);
        
        // Modify transformation if PC1_1 is negative
        let reflectedX = false;
        if (wcs.pc1_1 < 0) {
            reflectedX = true;
        }
        
        // Compute matrix determinant
        const det = transform.m11 * transform.m22 - transform.m12 * transform.m21;
        
        if (Math.abs(det) < 1e-10) {
            console.warn("Transformation matrix is singular");
            return { x: 0, y: 0 };
        }
        
        // Standard coordinate transformation
        const dx = (transform.m22 * dra - transform.m12 * ddec) / det;
        const dy = (-transform.m21 * dra + transform.m11 * ddec) / det;
        
        // Calculate pixel coordinates
        let x = crpix1 + dx;
        let y = crpix2 + dy;
        
        // Apply X-axis reflection if needed
        if (reflectedX) {
            x = (wcs.width || 2 * crpix1) - x;
        }
        
        
        return { x, y };
    } catch (error) {
        console.error("Error in celestial to pixel conversion:", error);
        return { x: 0, y: 0 };
    }
}

function pixelToCelestial(x, y, wcs) {
    // Early exit if WCS info is missing or invalid
    if (!wcs || !wcs.hasWCS) return { ra: 0, dec: 0 };
    
    try {
        // Get reference points
        const crpix1 = wcs.crpix1;
        const crpix2 = wcs.crpix2;
        const crval1 = wcs.crval1;
        const crval2 = wcs.crval2;
        
        // Apply X-axis reflection if needed
        let adjustedX = x;
        if (wcs.pc1_1 !== undefined && wcs.pc1_1 < 0) {
            adjustedX = (wcs.width || 2 * crpix1) - x;
            // console.log('Applying X-axis reflection in pixelToCelestial');
        }
        
        // Calculate pixel offsets from reference pixel
        const dx = adjustedX - crpix1;
        const dy = y - crpix2;
        
        // Use the transformation matrix from the WCS object
        const transform = wcs.transformInfo;
        if (!transform) {
            // console.warn("No transformation matrix available in WCS object");
            return { ra: 0, dec: 0 };
        }
        
        // Compute matrix determinant
        const det = transform.m11 * transform.m22 - transform.m12 * transform.m21;
        
        if (Math.abs(det) < 1e-10) {
            console.warn("Transformation matrix is singular");
            return { ra: 0, dec: 0 };
        }
        
        // Apply the transformation matrix to get sky coordinate offsets
        // This is the inverse of the transformation used in celestialToPixel
        const dra = (transform.m11 * dx + transform.m12 * dy);
        const ddec = (transform.m21 * dx + transform.m22 * dy);
        
        // Calculate celestial coordinates
        // Note: We need to divide RA by cos(dec) to account for spherical projection
        let ra = crval1 + dra / Math.cos(crval2 * Math.PI / 180);
        let dec = crval2 + ddec;
        
        // Normalize RA to be in the range [0, 360)
        ra = ((ra % 360) + 360) % 360;
        
        // Clamp Dec to valid range [-90, 90]
        dec = Math.max(-90, Math.min(90, dec));
        
        return { ra, dec };
    } catch (error) {
        console.error("Error in pixel to celestial conversion:", error);
        return { ra: 0, dec: 0 };
    }
}



// Add this initialization function where appropriate in your code
function initializeWCSTransformation() {
    if (!window.fitsData || !window.fitsData.wcs) {
        console.warn("No WCS information available");
        return false;
    }
    
    // Parse the WCS data
    const wcs = parseWCS(window.fitsData.wcs);
    
    // Store the parsed WCS data globally
    window.parsedWCS = wcs;
    
    return wcs.hasWCS;
}


// Handle fast loading mode for large FITS files
function handleFastLoadingResponse(data, filepath) {
    console.log("Handling fast loading mode response:", data);
    
    // Hide the progress indicator
    showProgress(false);
    
    // Store basic FITS information globally
    window.fitsData = {
        width: data.width,
        height: data.height,
        min_value: data.min_value,
        max_value: data.max_value,
        overview: data.overview,
        wcs: data.wcs,
        filename: filepath
    };


    
    // Add the debug function call right here
    if (window.fitsData && window.fitsData.filename && 
        (window.fitsData.filename.includes('jwst') || window.fitsData.filename.includes('miri'))) {
        console.log("JWST image detected - running debug functions");
        dumpWCSInfo();
    }
    
    // Show notification
    showNotification(`Fast loading mode: ${data.width}×${data.height} pixels`, 3000, 'info');
    
    // Initialize the tiled viewer immediately
    initializeTiledViewer();
    
    // Start progressive loading of better quality overviews
    loadProgressiveOverviews();
}

// Load progressively better quality overviews
function loadProgressiveOverviews() {
    // Start with quality level 0
    loadOverviewAtQuality(0);
}




// Add this function to hide/show dynamic range controls based on image availability
function updateDynamicRangeButtonVisibility(show) {
    const dynamicRangeButton = document.querySelector('.dynamic-range-button');
    if (dynamicRangeButton) {
        dynamicRangeButton.style.display = show ? 'block' : 'none';
    }
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
function selectHdu(hduIndex, filepath) {
    console.log(`Selected HDU ${hduIndex} from ${filepath}`);
    
    // Show loading progress
    showProgress(true, `Loading HDU ${hduIndex}...`);
    
    // Call a modified version of the load-file endpoint that supports HDU selection
    fetch(`/load-file/${encodeURIComponent(filepath)}?hdu=${hduIndex}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Failed to load file: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.error) {
                showNotification(`Error: ${data.error}`, 3000);
                showProgress(false);
                return;
            }
            
            // Clear any existing error messages
            window.loadingError = null;
            
            // Clear any existing catalog
            if (typeof clearCatalog === 'function') {
                clearCatalog();
            }
            
            // Get file size to determine loading method
            return checkFileSize(filepath)
                .then(fileSize => {
                    // Use fast loading for files larger than 100MB
                    const useFastLoading = fileSize > 1300 * 1024 * 1024;
                    
                    if (useFastLoading) {
                        console.log(`Large file detected (${formatFileSize(fileSize)}). Using fast loading.`);
                        
                        // Use JSON endpoint for fast loading mode with HDU parameter
                        return fetch(`/fits-binary/?fast_loading=true&hdu=${hduIndex}`)
                            .then(response => response.json())
                            .then(data => {
                                if (data.error) {
                                    throw new Error(data.error);
                                }
                                
                                if (data.fast_loading) {
                                    // Handle fast loading response
                                    if (typeof handleFastLoadingResponse === 'function') {
                                        return handleFastLoadingResponse(data, filepath);
                                    } else {
                                        throw new Error('Fast loading handler not available');
                                    }
                                } else {
                                    // Fall back to binary processing
                                    return fetchBinaryWithProgress(`/fits-binary/?fast_loading=false&hdu=${hduIndex}`)
                                        .then(arrayBuffer => processBinaryData(arrayBuffer, filepath));
                                }
                            });
                    } else {
                        console.log(`Regular file (${formatFileSize(fileSize)}). Using standard loading.`);
                        // For smaller files, use the regular viewer
                        return fetchBinaryWithProgress(`/fits-binary/?fast_loading=false&hdu=${hduIndex}`)
                            .then(arrayBuffer => {
                                if (!arrayBuffer) {
                                    throw new Error('Failed to load FITS data');
                                }
                                
                                // Process binary data and initialize viewer
                                console.time('parseBinaryData');
                                return processBinaryData(arrayBuffer, filepath);
                            });
                    }
                });
        })
        .catch(error => {
            console.error('Error loading FITS file:', error);
            showProgress(false);
            showNotification(`Error: ${error.message || 'Failed to load FITS file'}`, 5000);
        });
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
    
    showProgress(true, `Analyzing ${filepath}...`);
    
    // First check how many HDUs this file has
    getFitsHduInfo(filepath)
        .then(hduList => {
            showProgress(false);
            
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
            showProgress(false);
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
                 console.log("mousemove: No viewer found");
                 if (innerContainer) innerContainer.classList.remove('visible'); 
                 return;
            }
            if (!currentViewer.world) {
                 console.log("mousemove: Viewer found, but no world");
                 if (innerContainer) innerContainer.classList.remove('visible');
                 return;
            }
             if (!currentViewer.world.getItemAt(0)) {
                 console.log("mousemove: Viewer world found, but no item at index 0");
                 if (innerContainer) innerContainer.classList.remove('visible');
                 return;
            }
             if (!window.fitsData) {
                 console.log("mousemove: No FITS data found");
                 if (innerContainer) innerContainer.classList.remove('visible');
                 return;
            }
             
             // console.log("mousemove: Viewer and FITS data OK"); // Log on success if needed

            // Ensure WCS is parsed (assuming it's stored in window.parsedWCS after loading)
            if (!window.parsedWCS && window.fitsData.wcs) {
                 console.log("mousemove: Attempting to parse WCS");
                 try {
                     window.parsedWCS = parseWCS(window.fitsData.wcs);
                     console.log("WCS parsed successfully for coordinate display.");
                 } catch (e) {
                     console.error("Failed to parse WCS for coordinate display:", e);
                     window.parsedWCS = null; // Mark as failed
                 }
            }


            // Make sure container is visible
            if (innerContainer) {
                // console.log("mousemove: Adding 'visible' class"); // Optional log
                innerContainer.classList.add('visible');
            } else {
                 console.log("mousemove: innerContainer not found when trying to make visible");
                 return; // Should not happen if init checks passed
            }

            // Get mouse position relative to the viewer element
            let viewportPoint;
            try {
                const mousePos = currentViewer.mouseTracker.getMousePosition(event);
                 if (!mousePos) {
                    console.log("mousemove: getMousePosition returned null");
                    return;
                 }
                viewportPoint = currentViewer.viewport.pointFromPixel(mousePos);
                 if (!viewportPoint) {
                    console.log("mousemove: pointFromPixel returned null");
                     return;
                 }
            } catch (e) {
                console.error("mousemove: Error getting viewport point:", e);
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
function updateHistogramBackground() { // Renamed
    const canvas = document.getElementById('histogram-bg-canvas'); // Use BG canvas ID
    if (!canvas) {
        console.log('Histogram background canvas not found, skipping update');
        return;
    }
    
    // Check if we're in tiled mode - if so, fetch server histogram (which draws on bg canvas? Need to verify)
    const inTiledMode = window.tiledViewer && window.tiledViewer.isOpen && window.tiledViewer.isOpen();
    if (inTiledMode) {
        console.log('Tiled mode: Fetching server histogram for background');
        fetchServerHistogram(); // Assuming this function now targets 'histogram-bg-canvas'
        return;
    }

    // Check if we have access to fitsData with pixel data
    if (!window.fitsData || !window.fitsData.data || !window.fitsData.data.length === 0) {
        console.log('No FITS data available for histogram background');
        // Optionally draw an empty message on the background canvas
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#aaa'; ctx.font = '14px Arial'; ctx.textAlign = 'center';
        ctx.fillText('No FITS data available', canvas.width / 2, canvas.height / 2);
        return;
    }
    
    // --- Keep the data processing and bar/axis drawing logic --- 
    try {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        // Clear the background canvas
        ctx.clearRect(0, 0, width, height);
        
        // ... (Calculate bins, range, skipFactor, validPixelCount etc. as before) ...
         const numBins = 100;
         const bins = new Array(numBins).fill(0);
         const minValue = window.fitsData.min_value;
         const maxValue = window.fitsData.max_value;
         const range = maxValue - minValue;
        
         if (range <= 0 || !isFinite(range)) {
             console.log('Invalid data range:', minValue, maxValue);
             // Draw empty message on bg canvas
             ctx.fillStyle = '#aaa'; ctx.font = '14px Arial'; ctx.textAlign = 'center';
             ctx.fillText('Invalid data range', width / 2, height / 2);
             return;
         }
        
         const maxSampleSize = 500000;
         const skipFactor = Math.max(1, Math.floor((window.fitsData.width * window.fitsData.height) / maxSampleSize));
         let pixelCount = 0;
         let validPixelCount = 0;
         for (let y = 0; y < window.fitsData.height; y++) {
             for (let x = 0; x < window.fitsData.width; x += skipFactor) {
                 pixelCount++;
                 if (pixelCount % skipFactor !== 0) continue;
                 let val; try { val = window.fitsData.data[y][x]; } catch (e) { continue; }
                 if (!isNaN(val) && isFinite(val)) {
                     validPixelCount++;
                     if (val < minValue || val > maxValue) continue;
                     const binIndex = Math.min(numBins - 1, Math.floor(((val - minValue) / range) * numBins));
                     bins[binIndex]++;
                 }
             }
         }
        
         let maxBinCount = 0; for (let i = 0; i < numBins; i++) { maxBinCount = Math.max(maxBinCount, bins[i]); }
         if (maxBinCount === 0) {
             // Draw empty message on bg canvas
             ctx.fillStyle = '#aaa'; ctx.font = '14px Arial'; ctx.textAlign = 'center';
             ctx.fillText('No pixels in selected range', width / 2, height / 2);
             return;
         }
         const logMaxBinCount = Math.log(maxBinCount + 1);

        // Draw the axes and labels (directly on bg canvas)
        const padding = { top: 30, right: 20, bottom: 40, left: 60 };
        const histHeight = height - padding.top - padding.bottom;
        ctx.strokeStyle = '#888'; ctx.lineWidth = 1;
        // Y-axis line
        ctx.beginPath(); ctx.moveTo(padding.left, padding.top); ctx.lineTo(padding.left, height - padding.bottom); ctx.stroke();
        // X-axis line
        ctx.beginPath(); ctx.moveTo(padding.left, height - padding.bottom); ctx.lineTo(width - padding.right, height - padding.bottom); ctx.stroke();
        // Y Ticks & Labels
        ctx.fillStyle = '#aaa'; ctx.font = '10px Arial'; ctx.textAlign = 'right';
        const numYTicks = 5;
        for (let i = 0; i <= numYTicks; i++) { 
            const y = height - padding.bottom - (i / numYTicks) * histHeight;
            ctx.beginPath(); ctx.moveTo(padding.left - 5, y); ctx.lineTo(padding.left, y); ctx.stroke();
            const logValue = (i / numYTicks) * logMaxBinCount;
            const actualValue = Math.round(Math.exp(logValue) - 1);
            ctx.fillText(actualValue.toLocaleString(), padding.left - 8, y + 4);
        }
        // X Ticks & Labels
        ctx.textAlign = 'center';
        const numXTicks = 5;
        for (let i = 0; i <= numXTicks; i++) {
            const x = padding.left + (i / numXTicks) * (width - padding.left - padding.right);
            ctx.beginPath(); ctx.moveTo(x, height - padding.bottom); ctx.lineTo(x, height - padding.bottom + 5); ctx.stroke();
            const value = minValue + (i / numXTicks) * range;
            ctx.fillText(value.toFixed(2), x, height - padding.bottom + 20);
        }
        // Axis Labels
        ctx.save(); ctx.translate(15, height / 2); ctx.rotate(-Math.PI / 2); ctx.fillStyle = '#aaa'; ctx.font = '12px Arial'; ctx.textAlign = 'center';
        ctx.fillText('Pixel Count (log)', 0, 0); ctx.restore();
        ctx.fillStyle = '#aaa'; ctx.font = '12px Arial'; ctx.textAlign = 'center';
        const xAxisLabel = window.fitsData.wcs && window.fitsData.wcs.bunit ? window.fitsData.wcs.bunit : 'Value';
        ctx.fillText(xAxisLabel, width / 2, height - 5);
        // Pixel Count Stat
        ctx.fillStyle = '#aaa'; ctx.font = '12px Arial'; ctx.textAlign = 'center';
        ctx.fillText(`Pixels: ${validPixelCount.toLocaleString()}`, width / 2, padding.top - 15);

        // Draw histogram bars (directly on bg canvas)
        ctx.fillStyle = 'rgba(0, 180, 0, 0.7)'; // Green bars
        const barWidth = (width - padding.left - padding.right) / numBins;
        for (let i = 0; i < numBins; i++) {
            const binCount = bins[i];
            if (binCount === 0) continue;
            const logHeight = Math.log(binCount + 1) / logMaxBinCount * histHeight;
            const x = padding.left + i * barWidth;
            const y = height - padding.bottom - logHeight;
            ctx.fillRect(x, y, barWidth - 1, logHeight); // Use barWidth - 1 for slight gap
        }

        // --- REMOVE Min/Max Line Drawing from here --- 

        // Store scale info globally (needed by drawHistogramLines)
        histogramScaleInfo = {
            padding: padding,
            histWidth: width - padding.left - padding.right,
            histHeight: histHeight,
            // Store the range used for THIS specific background render
            dataMin: minValue, 
            dataRange: range,
            canvasWidth: width,
            canvasHeight: height
        };
        if (histogramScaleInfo.histWidth <= 0 || !isFinite(histogramScaleInfo.dataRange) || histogramScaleInfo.dataRange <= 0) {
             console.warn('Invalid histogram scale parameters calculated in background update:', histogramScaleInfo);
        }

    } catch (error) {
        console.error('Error updating histogram background:', error);
        // Optionally draw error message on bg canvas
        const canvas = document.getElementById('histogram-bg-canvas');
        if(canvas) {
           const ctx = canvas.getContext('2d');
           ctx.clearRect(0, 0, canvas.width, canvas.height);
           ctx.fillStyle = '#aaa'; ctx.font = '14px Arial'; ctx.textAlign = 'center';
           ctx.fillText('Error updating histogram', canvas.width / 2, canvas.height / 2);
        }
    } finally {
        // No need for isUpdatingHistogram flags here if it only draws background
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
    // ... rest of fetch logic ...
    // Inside .then(data => { ... drawServerHistogram(data); ... })
     if (!canvas) return;
    
     // Show a loading message on BG canvas
     const ctx = canvas.getContext('2d');
     ctx.clearRect(0, 0, canvas.width, canvas.height);
     ctx.fillStyle = '#aaa'; ctx.font = '14px Arial'; ctx.textAlign = 'center';
     ctx.fillText('Loading histogram data...', canvas.width / 2, canvas.height / 2);
    
     fetch('/fits-histogram/')
         .then(response => response.json())
         .then(data => {
             if (data.error) throw new Error(data.error);
             drawServerHistogram(data); // Draw the received data
             // Also draw lines based on current inputs
             const minInput = document.getElementById('min-range-input');
             const maxInput = document.getElementById('max-range-input');
             if (minInput && maxInput) {
                 const currentMin = parseFloat(minInput.value);
                 const currentMax = parseFloat(maxInput.value);
                 if (!isNaN(currentMin) && !isNaN(currentMax)) {
                     drawHistogramLines(currentMin, currentMax, false); // Draw lines over server BG
                 }
             }
         })
         .catch(error => {
             console.error('Error fetching histogram:', error);
             // Draw error message on BG canvas
             ctx.clearRect(0, 0, canvas.width, canvas.height);
             ctx.fillStyle = '#aaa'; ctx.font = '14px Arial'; ctx.textAlign = 'center';
             ctx.fillText('Error: ' + error.message, canvas.width / 2, canvas.height / 2);
         });
}



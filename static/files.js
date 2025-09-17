// Ensure session and attach header for all API requests
async function ensureSession() {
    try {
        let sid = sessionStorage.getItem('sid');
        if (!sid) {
            const r = await fetch('/session/start');
            if (!r.ok) throw new Error('Failed to start session');
            const j = await r.json();
            sid = j.session_id;
            sessionStorage.setItem('sid', sid);
        }
        return sid;
    } catch (e) { console.warn('Session init failed', e); return null; }
}

async function apiFetch(url, options = {}) {
    const sid = await ensureSession();
    const headers = options.headers ? { ...options.headers } : {};
    if (sid) headers['X-Session-ID'] = sid;
    return fetch(url, { ...options, headers });
}

function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}


// Format file size to human readable format
function formatFileSize(bytes) {
    if (bytes < 1024) {
        return bytes + ' B';
    } else if (bytes < 1024 * 1024) {
        return (bytes / 1024).toFixed(1) + ' KB';
    } else if (bytes < 1024 * 1024 * 1024) {
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    } else {
        return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
    }
}

// Load the selected FITS file
function loadFitsFile(filepath) {
    // Hide welcome elements if they exist
    const welcomeScreen = document.querySelector('.welcome-screen');
    if (welcomeScreen && welcomeScreen.parentNode) {
        welcomeScreen.parentNode.removeChild(welcomeScreen);
    }
    
    const welcomePointer = document.querySelector('.welcome-pointer');
    if (welcomePointer && welcomePointer.parentNode) {
        welcomePointer.parentNode.removeChild(welcomePointer);
    }
    
    showNotification(true, `Loading ${filepath}...`);
    
    // First set the active file on the server
    apiFetch(`/load-file/${encodeURIComponent(filepath)}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Failed to load file: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.error) {
                showNotification(`Error: ${data.error}`, 3000);
                showNotification(false);
                return;
            }
            
            // Clear any existing error messages
            window.loadingError = null;
            
            // Clear any existing catalog
            if (typeof clearCatalog === 'function') {
                clearCatalog();
            }
            
            // Always use the tiled loading mechanism for consistent user experience.
            console.log(`Using fast/tiled loading for ${filepath}.`);

            // Use JSON endpoint for fast loading mode
            return apiFetch(`/fits-binary/?fast_loading=true`)
                .then(response => response.json())
                .then(data => {
                    if (data.error) {
                        throw new Error(data.error);
                    }
                    
                    if (data.fast_loading) {
                        // Handle fast loading response (which initializes the tiled viewer)
                        if (typeof handleFastLoadingResponse === 'function') {
                            return handleFastLoadingResponse(data, filepath);
                        } else {
                            throw new Error('Fast loading handler not available');
                        }
                    } else {
                        // This is a fallback in case the server doesn't respond as expected.
                        console.warn("[loadFitsFile] Server did not confirm fast_loading. Falling back to client-side binary processing.");
                        return fetchBinaryWithProgress('/fits-binary/?fast_loading=false')
                            .then(arrayBuffer => processBinaryData(arrayBuffer, filepath));
                    }
                })
                .then(()=>{ try { window.dispatchEvent(new CustomEvent('fits:imageLoaded', { detail: { filepath } })); } catch (_) {} });
        })
        .catch(error => {
            console.error('Error loading FITS file:', error);
            showNotification(false);
            showNotification(`Error: ${error.message || 'Failed to load FITS file'}`, 5000);
        });
}

// Function to check the file size
function checkFileSize(filepath) {
    return apiFetch(`/file-size/${encodeURIComponent(filepath)}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Failed to get file size: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.error) {
                throw new Error(data.error);
            }
            return data.size || 0;
        });
}


// Also update the fetchBinaryWithProgress function to be more robust in handling different response types
function fetchBinaryWithProgress(url) {
    return new Promise((resolve, reject) => {
        // Use XMLHttpRequest to track progress
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'arraybuffer';
        
        // Track loading progress
        xhr.onprogress = function(event) {
            if (event.lengthComputable) {
                const percentComplete = Math.round((event.loaded / event.total) * 100);
                showNotification(true, `Loading FITS file: ${percentComplete}%`);
                
                // Update progress indicator with actual progress
                const percentageElement = document.getElementById('progress-percentage');
                if (percentageElement) {
                    percentageElement.textContent = `${percentComplete}%`;
                }
            }
        };
        
        xhr.onload = function() {
            if (this.status === 200) {
                // Check if the response is actually a JSON error message
                try {
                    // First few bytes of response to check for JSON
                    const headBytes = new Uint8Array(this.response.slice(0, 20));
                    const headString = String.fromCharCode.apply(null, headBytes);
                    
                    // If it starts with { it's likely JSON
                    if (headString.trim().startsWith('{')) {
                        // Try to parse as JSON
                        const jsonString = new TextDecoder().decode(this.response);
                        const jsonData = JSON.parse(jsonString);
                        
                        // If it's an error response, reject with the error
                        if (jsonData.error) {
                            reject(new Error(jsonData.error));
                            return;
                        }
                    }
                } catch (e) {
                    // Not JSON or couldn't parse, continue treating as binary
                }
                
                resolve(this.response);
            } else {
                reject(new Error(`Failed to load data: ${this.statusText}`));
            }
        };
        
        xhr.onerror = function() {
            reject(new Error('Network error occurred while loading FITS data'));
        };
        
        xhr.send();
    });
}

// Download a FITS file from a URL, save it to the server, and then load it with HDU selection.
async function downloadAndLoadFitsFromUrl(url) {
    const filename = url.split('/').pop() || 'downloaded_file.fits';
    const startTime = Date.now();
    
    updateProgressCircle(0, 0, 0, startTime);
    // Ensure the initial 0% renders before starting the network work
    try { await new Promise(r => requestAnimationFrame(r)); } catch(_) {}

    try {
        // If this is an internal API path (e.g., /mast/download?...), call it directly.
        // Otherwise, use the proxy for external URLs.
        const isInternal = typeof url === 'string' && url.startsWith('/');
        const fetchUrl = isInternal ? url : `/proxy-download/?url=${encodeURIComponent(url)}`;
        const response = await apiFetch(fetchUrl);

        if (!response.ok) {
            const errorText = await response.text();
            let errorDetails = errorText;
            try {
                const errJson = JSON.parse(errorText);
                errorDetails = errJson.error || errorText;
            } catch(e) { /* Not a JSON error, use raw text */ }
            throw new Error(`Download failed: ${response.status} ${response.statusText}. Server says: ${errorDetails}`);
        }

        const contentLengthHeader = response.headers.get('Content-Length');
        const contentLength = contentLengthHeader ? +contentLengthHeader : null;
        let receivedLength = 0;
        const chunks = [];
        const reader = response.body.getReader();

        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                break;
            }

            chunks.push(value);
            receivedLength += value.length;

            if (contentLength && isFinite(contentLength) && contentLength > 0) {
                const percent = Math.round((receivedLength / contentLength) * 100);
                updateProgressCircle(percent, receivedLength, contentLength, startTime);
            } else {
                // Unknown length: show spinner style progress with received bytes and speed
                const elapsedSeconds = (Date.now() - startTime) / 1000;
                const speedBps = elapsedSeconds > 0 ? receivedLength / elapsedSeconds : 0;
                // Start at 0% and grow smoothly (0.5% per MB), capped at 95%
                const pseudoPercent = Math.min(95, Math.max(0, Math.floor(receivedLength / (2 * 1024 * 1024))));
                updateProgressCircle(pseudoPercent, receivedLength, 0, startTime);
            }
        }

        updateProgressCircle(null);

        const blob = new Blob(chunks);
        const arrayBuffer = await blob.arrayBuffer();
        
        showNotification(true, 'Processing downloaded file...');
        const serverFilePath = await uploadFitsToServer(arrayBuffer, filename);
        await loadFitsFileWithHduSelection(serverFilePath);

    } catch (error) {
        console.error('Error in proxy download and load process:', error);
        showNotification(false);
        showNotification(`Download error: ${error.message}`, 5000, 'error');
        updateProgressCircle(null);
    }
}


// Upload a FITS file to the server and return the server path
function uploadFitsToServer(fileData, filename) {
    // XHR-based upload with progress updates into #download-progress-container
    return new Promise(async (resolve, reject) => {
        try {
            const sid = await ensureSession();

            const formData = new FormData();
            const blob = new Blob([fileData], { type: 'application/octet-stream' });
            formData.append('file', blob, filename);

            // Show 0% on the existing progress UI
            const startTime = Date.now();
            try { updateProgressCircle(0, 0, blob.size || 0, startTime); } catch (_) {}

            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/upload-fits/', true);
            if (sid) xhr.setRequestHeader('X-Session-ID', sid);

            xhr.upload.onprogress = function (event) {
                if (event.lengthComputable) {
                    const percent = Math.round((event.loaded / event.total) * 100);
                    try { updateProgressCircle(percent, event.loaded, event.total, startTime); } catch (_) {}
                }
            };

            xhr.onload = function () {
                try { updateProgressCircle(null); } catch (_) {}
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const resp = JSON.parse(xhr.responseText || '{}');
                        if (resp.error) return reject(new Error(resp.error));
                        return resolve(resp.path || resp.filepath || resp.filename || resp); // prefer filepath
                    } catch (e) {
                        return reject(new Error('Invalid server response for upload'));
                    }
                } else {
                    return reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
                }
            };

            xhr.onerror = function () {
                try { updateProgressCircle(null); } catch (_) {}
                return reject(new Error('Network error during upload'));
            };

            xhr.send(formData);
        } catch (e) {
            try { updateProgressCircle(null); } catch (_) {}
            reject(e);
        }
    });
}

// Load a local FITS file from the user's computer
function loadLocalFitsFile(file) {
    // Show loading progress
    showNotification(true, 'Reading local file...');
    
    const reader = new FileReader();
    
    reader.onload = function(event) {
        // Show processing message
        showNotification(true, 'Processing file...');
        
        // Upload the file to the server
        uploadFitsToServer(event.target.result, file.name)
            .then(serverFilePath => {
                // Load the file that's now on the server
                return loadFitsFile(serverFilePath);
            })
            .catch(error => {
                console.error('Error processing local FITS file:', error);
                showNotification(false);
                showNotification(`Error: ${error.message}`, 5000, 'error');
            });
    };
    
    reader.onerror = function() {
        showNotification(false);
        showNotification('Error reading file', 3000, 'error');
    };
    
    // Read the file as an ArrayBuffer
    reader.readAsArrayBuffer(file);
}










// Enhanced HDU selector with search functionality and close button
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
    
    // Create header container with title and close button
    const headerContainer = document.createElement('div');
    headerContainer.style.display = 'flex';
    headerContainer.style.justifyContent = 'space-between';
    headerContainer.style.alignItems = 'center';
    headerContainer.style.marginBottom = '15px';
    headerContainer.style.borderBottom = '1px solid #555';
    headerContainer.style.paddingBottom = '10px';
    
    // Create title
    const title = document.createElement('h3');
    title.textContent = 'Select HDU to Display';
    title.style.margin = '0';
    title.style.color = '#fff';
    title.style.fontFamily = 'Arial, sans-serif';
    title.style.fontSize = '18px';
    title.style.fontWeight = 'bold';
    
    // Create close button
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '&times;';
    closeButton.style.background = 'transparent';
    closeButton.style.border = 'none';
    closeButton.style.color = '#aaa';
    closeButton.style.fontSize = '24px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.lineHeight = '24px';
    closeButton.style.width = '30px';
    closeButton.style.height = '30px';
    closeButton.style.borderRadius = '50%';
    closeButton.style.display = 'flex';
    closeButton.style.alignItems = 'center';
    closeButton.style.justifyContent = 'center';
    closeButton.title = 'Close';
    
    // Add hover effects
    closeButton.addEventListener('mouseover', function() {
        this.style.backgroundColor = 'rgba(255,255,255,0.1)';
        this.style.color = '#fff';
    });
    
    closeButton.addEventListener('mouseout', function() {
        this.style.backgroundColor = 'transparent';
        this.style.color = '#aaa';
    });
    
    // Add click handler
    closeButton.addEventListener('click', function() {
        document.body.removeChild(popup);
    });
    
    // Add title and close button to header
    headerContainer.appendChild(title);
    headerContainer.appendChild(closeButton);
    
    // Add description
    const description = document.createElement('p');
    description.textContent = 'This FITS file contains multiple data units (HDUs). Please select which one to open:';
    description.style.color = '#ddd';
    description.style.marginBottom = '15px';
    description.style.fontFamily = 'Arial, sans-serif';
    
    // Create search box
    const searchContainer = document.createElement('div');
    searchContainer.style.marginBottom = '15px';
    
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search HDUs...';
    searchInput.style.width = '100%';
    searchInput.style.padding = '8px 12px';
    searchInput.style.backgroundColor = '#444';
    searchInput.style.border = '1px solid #555';
    searchInput.style.borderRadius = '4px';
    searchInput.style.color = '#fff';
    searchInput.style.fontSize = '14px';
    searchInput.style.boxSizing = 'border-box';
    
    // Focus style
    searchInput.addEventListener('focus', function() {
        this.style.border = '1px solid #2196F3';
        this.style.outline = 'none';
    });
    
    // Blur style
    searchInput.addEventListener('blur', function() {
        this.style.border = '1px solid #555';
    });
    
    searchContainer.appendChild(searchInput);
    
    // Create selection container
    const selectionContainer = document.createElement('div');
    selectionContainer.style.display = 'flex';
    selectionContainer.style.flexDirection = 'column';
    selectionContainer.style.gap = '10px';
    selectionContainer.style.marginBottom = '15px';
    selectionContainer.id = 'hdu-selection-container';
    
    // Store all option elements to show/hide based on search
    const optionElements = [];
    
    // Add each HDU as an option
    hduList.forEach((hdu, index) => {
        const option = document.createElement('div');
        option.className = 'hdu-option';
        option.style.padding = '10px';
        option.style.backgroundColor = '#444';
        option.style.borderRadius = '4px';
        option.style.cursor = 'pointer';
        option.style.transition = 'background-color 0.2s, transform 0.1s';
        
        // Store searchable text for this option
        let searchText = `HDU ${index} ${hdu.type} `;
        if (hdu.name) searchText += hdu.name + ' ';
        if (hdu.dimensions) searchText += hdu.dimensions.join('x') + ' ';
        if (hdu.bunit) searchText += hdu.bunit + ' ';
        option.dataset.searchText = searchText.toLowerCase();
        
        // Hover effect
        option.addEventListener('mouseover', function() {
            this.style.backgroundColor = '#555';
            this.style.transform = 'translateY(-2px)';
        });
        
        option.addEventListener('mouseout', function() {
            this.style.backgroundColor = '#444';
            this.style.transform = 'translateY(0)';
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
            // Create HTML for dimensions only (no data type)
            let detailsHTML = `
                <div>Dimensions: ${hdu.dimensions.join(' x ')}</div>
            `;
            
            // Add WCS information
            if (hdu.hasWCS) {
                detailsHTML += '<div>WCS: Available</div>';
            } else {
                detailsHTML += '<div>WCS: Not available</div>';
            }
            
            // Add BUNIT information only if available
            if (hdu.bunit && hdu.bunit.trim() !== '') {
                detailsHTML += `<div>Unit: ${hdu.bunit}</div>`;
            }
            
            details.innerHTML = detailsHTML;
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
        optionElements.push(option);
    });
    
    // Add search functionality
    searchInput.addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase().trim();
        
        // Show/hide options based on search
        if (searchTerm === '') {
            // Show all if search is empty
            optionElements.forEach(option => {
                option.style.display = 'block';
            });
        } else {
            // Filter based on search term
            optionElements.forEach(option => {
                const searchText = option.dataset.searchText;
                if (searchText.includes(searchTerm)) {
                    option.style.display = 'block';
                } else {
                    option.style.display = 'none';
                }
            });
        }
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
    cancelButton.style.padding = '10px 0';
    cancelButton.style.backgroundColor = '#f44336';
    cancelButton.style.color = '#fff';
    cancelButton.style.border = 'none';
    cancelButton.style.borderRadius = '4px';
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
    
    // Auto-select recommended HDU button
    const autoSelectButton = document.createElement('button');
    autoSelectButton.textContent = 'Use Recommended HDU';
    autoSelectButton.style.flex = '1';
    autoSelectButton.style.padding = '10px 0';
    autoSelectButton.style.backgroundColor = '#4CAF50';
    autoSelectButton.style.color = '#fff';
    autoSelectButton.style.border = 'none';
    autoSelectButton.style.borderRadius = '4px';
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
    popup.appendChild(headerContainer);
    popup.appendChild(description);
    popup.appendChild(searchContainer);
    popup.appendChild(selectionContainer);
    popup.appendChild(buttonContainer);
    
    // Add popup to document
    document.body.appendChild(popup);
    
    // Make popup draggable
    makeDraggable(popup, title);
    
    // Focus the search input for immediate typing
    setTimeout(() => {
        searchInput.focus();
    }, 100);
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


// Modify this part of the loadFitsFile or selectHdu function to correctly handle binary vs JSON responses
function selectHdu(hduIndex, filepath) {
    console.log(`Selected HDU ${hduIndex} from ${filepath}`);
    
    // Show loading progress
    showNotification(true, `Loading HDU ${hduIndex}...`);
    
    // Track selected file/HDU globally for other modules (e.g., WCS/coords overlay)
    window.currentHduIndex = hduIndex;
    window.currentFitsFile = filepath;
    if (typeof window.refreshWcsForOverlay === 'function') {
        window.refreshWcsForOverlay({ filepath, hduIndex });
    }
    
    // Call the load-file endpoint with the selected HDU
    apiFetch(`/load-file/${encodeURIComponent(filepath)}?hdu=${hduIndex}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Failed to load file: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.error) {
                showNotification(`Error: ${data.error}`, 3000);
                showNotification(false);
                return;
            }
            
            // Clear any existing error messages
            window.loadingError = null;
            
            // Clear any existing catalog
            if (typeof clearCatalog === 'function') {
                clearCatalog();
            }
            
            // Always use the tiled loading mechanism for consistent user experience.
            console.log(`Using fast/tiled loading for HDU ${hduIndex}.`);
            
            // Use JSON endpoint for fast loading mode with HDU parameter
            return apiFetch(`/fits-binary/?fast_loading=true&hdu=${hduIndex}`)
                .then(response => {
                    // Check content type to determine how to process the response
                    const contentType = response.headers.get('content-type');
                    if (!response.ok) {
                        throw new Error(`Failed to load data: ${response.statusText}`);
                    }
                    
                    // If content type is JSON, parse as JSON, otherwise as arrayBuffer
                    if (contentType && contentType.includes('application/json')) {
                        return response.json();
                    } else {
                        // This path is a fallback and should ideally not be taken.
                        // It indicates the server sent binary data unexpectedly.
                        console.warn("[selectHdu] Server sent binary data unexpectedly for a fast_loading request. Processing it client-side.");
                        return response.arrayBuffer().then(buffer => processBinaryData(buffer, filepath));
                    }
                })
                .then(data => {
                    // Only process as JSON if it's actually JSON data
                    if (typeof data === 'object' && data !== null && !ArrayBuffer.isView(data)) {
                        if (data.error) {
                            throw new Error(data.error);
                        }
                        
                        if (data.fast_loading) {
                            // Handle fast loading response (which initializes the tiled viewer)
                            if (typeof handleFastLoadingResponse === 'function') {
                                return handleFastLoadingResponse(data, filepath);
                            } else {
                                throw new Error('Fast loading handler not available');
                            }
                        }
                    }
                    // If we got here with binary data, it's already been processed by the fallback.
                    return data;
                });
        })
        .catch(error => {
            console.error('Error loading FITS file:', error);
            showNotification(false);
            showNotification(`Error: ${error.message || 'Failed to load FITS file'}`, 5000);
        });
}

// Function to analyze the FITS file and get HDU information
function getFitsHduInfo(filepath) {
    return apiFetch(`/fits-hdu-info/${encodeURIComponent(filepath)}`)
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

            if (!hduList || hduList.length === 0) {
                showNotification('Error: Could not read HDU information from file.', 4000, 'error');
                return;
            }

            // Filter for HDUs that contain actual image data that can be displayed
            const imageHdus = hduList.filter(hdu => 
                (hdu.type === 'Image' || hdu.type === 'Primary') && hdu.dimensions && hdu.dimensions.length >= 2
            );

            if (imageHdus.length > 1) {
                // If there are multiple image HDUs, show the selection popup
                console.log(`FITS file has ${imageHdus.length} image HDUs. Showing selection popup.`);
                createHduSelectorPopup(hduList, filepath); // Show popup with all HDUs
            } else if (imageHdus.length === 1) {
                // If there's only one image HDU, load it directly
                const hduIndex = imageHdus[0].index;
                console.log(`FITS file has one usable image HDU (${hduIndex}). Loading directly.`);
                selectHdu(hduIndex, filepath);
            } else {
                // If no image HDUs are found, show an informative error.
                console.log('FITS file contains no usable image data.');
                showNotification('Error: This FITS file does not contain any displayable image data.', 4000, 'error');
            }
        })
        .catch(error => {
            console.error('Error analyzing FITS file:', error);
            showNotification(false);
            showNotification(`Error: ${error.message || 'Failed to analyze FITS file'}`, 5000, 'error');
        });
}

// Override the original loadFitsFile function to use our new version
// const originalLoadFitsFile = window.loadFitsFile;
// window.loadFitsFile = loadFitsFileWithHduSelection;

// Function to load and display FITS header in a modal
async function loadAndDisplayFitsHeader(filepath, hduIndex = 0) { // Add hduIndex parameter
    const modal = document.getElementById('fits-header-modal');
    const filenameElement = document.getElementById('fits-header-filename');
    const tableContainer = document.getElementById('fits-header-table-container');
    const searchInput = document.getElementById('fits-header-search');

    if (!modal || !filenameElement || !tableContainer || !searchInput) {
        console.error('Header modal elements not found!');
        showNotification('Error: Could not display header - UI elements missing.', 3000);
        return;
    }

    // Show loading state in modal
    filenameElement.textContent = `Loading Header for ${filepath.split('/').pop()} (HDU ${hduIndex})...`; // Update title
    tableContainer.innerHTML = '<div style="text-align: center; padding: 20px;">Loading...</div>';
    searchInput.value = ''; // Clear previous search
    modal.style.display = 'block';
    modal.classList.remove('fade-out'); // Ensure fade-out class is removed

    try {
        // Include hduIndex in the fetch request
        const response = await apiFetch(`/fits-header/${encodeURIComponent(filepath)}?hdu_index=${hduIndex}`);
        if (!response.ok) {
             let errorMsg = `Error ${response.status}: ${response.statusText}`;
             try {
                 const errorData = await response.json();
                 errorMsg = errorData.detail || errorMsg;
             } catch (e) { /* Ignore if response is not JSON */ }
             throw new Error(`Failed to fetch header. ${errorMsg}`);
        }
        const data = await response.json();

        filenameElement.textContent = `Header: ${data.filename} (HDU ${data.hdu_index})`;
        
        // Build the table
        const table = document.createElement('table');
        table.id = 'fits-header-table';
        const tbody = document.createElement('tbody');

        data.header.forEach(item => {
            const row = tbody.insertRow();
            row.dataset.key = item.key.toLowerCase();
            row.dataset.value = String(item.value).toLowerCase(); // Ensure value is string
            row.dataset.comment = item.comment ? item.comment.toLowerCase() : '';

            const keyCell = row.insertCell();
            keyCell.className = 'header-key';
            keyCell.textContent = item.key;

            const valueCell = row.insertCell();
            valueCell.className = 'header-value';
            valueCell.textContent = item.value;

            const commentCell = row.insertCell();
            commentCell.className = 'header-comment';
            commentCell.textContent = item.comment || ''; // Handle null comments
        });

        table.appendChild(tbody);
        tableContainer.innerHTML = ''; // Clear loading message
        tableContainer.appendChild(table);

        // Implement search functionality
        const filterHeader = () => {
             const searchTerm = searchInput.value.toLowerCase().trim();
             const rows = tbody.getElementsByTagName('tr');
             let visibleCount = 0;

             for (let i = 0; i < rows.length; i++) {
                 const row = rows[i];
                 const key = row.dataset.key;
                 const value = row.dataset.value;
                 const comment = row.dataset.comment;
                 const textContent = `${key} ${value} ${comment}`;

                 // Simple text highlighting (optional)
                 const keyCell = row.cells[0];
                 const valueCell = row.cells[1];
                 const commentCell = row.cells[2];

                 // Clear previous highlights
                 keyCell.innerHTML = keyCell.textContent;
                 valueCell.innerHTML = valueCell.textContent;
                 commentCell.innerHTML = commentCell.textContent;

                 if (!searchTerm || textContent.includes(searchTerm)) {
                     row.style.display = ''; // Show row
                     visibleCount++;
                     
                     // Apply highlighting if searching
                     if (searchTerm) {
                         const regex = new RegExp(`(${_.escapeRegExp(searchTerm)})`, 'gi');
                         keyCell.innerHTML = keyCell.textContent.replace(regex, '<span class="highlight">$1</span>');
                         valueCell.innerHTML = valueCell.textContent.replace(regex, '<span class="highlight">$1</span>');
                         commentCell.innerHTML = commentCell.textContent.replace(regex, '<span class="highlight">$1</span>');
                     }
                 } else {
                     row.style.display = 'none'; // Hide row
                 }
             }
             // Optionally show a message if no results
             // Add logic here if needed
        };

        // Debounce search input to avoid excessive filtering on fast typing
        searchInput.oninput = _.debounce(filterHeader, 250); // Using lodash debounce

    } catch (error) {
        console.error('Error loading or displaying FITS header:', error);
        filenameElement.textContent = 'Error Loading Header';
        tableContainer.innerHTML = `<div style="color: red; padding: 20px;">Error: ${error.message}</div>`;
        showNotification(`Error loading header: ${error.message}`, 5000);
    }
}

// Function to close the FITS header modal with animation
function closeFitsHeaderModal() {
    const modal = document.getElementById('fits-header-modal');
    const animationDuration = 300; // Must match the CSS animation duration (0.3s)

    if (modal) {
        modal.classList.add('fade-out'); // Add fade-out class to trigger animation
        
        // Wait for animation to finish before hiding
        setTimeout(() => {
            modal.style.display = 'none'; 
            modal.classList.remove('fade-out'); // Clean up class for next time
        }, animationDuration);
    }
}

// Ensure the modal closes if the user clicks outside of the content area
window.onclick = function(event) {
    const modal = document.getElementById('fits-header-modal');
    if (event.target == modal) { // Check if the click is directly on the modal backdrop
        closeFitsHeaderModal();
    }
}

// NEW function: Popup for selecting which FITS HEADER to view (styled like createHduSelectorPopup)
function showHduHeaderSelectionPopup(hduList, filepath) {
    // Create container for the popup (similar structure to createHduSelectorPopup)
    const popup = document.createElement('div');
    popup.id = 'hdu-header-selector-popup'; // Use a distinct ID
    popup.style.position = 'fixed';
    popup.style.top = '50%';
    popup.style.left = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
    popup.style.backgroundColor = '#333'; // Match styling
    popup.style.border = '1px solid #555';
    popup.style.borderRadius = '5px';
    popup.style.padding = '15px';
    popup.style.zIndex = '2000'; // Ensure it's on top
    popup.style.width = '500px';
    popup.style.maxHeight = '80vh';
    popup.style.overflowY = 'auto';
    popup.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)';

    // --- Replicate Header and Content from createHduSelectorPopup --- 

    // Header container
    const headerContainer = document.createElement('div');
    headerContainer.style.display = 'flex';
    headerContainer.style.justifyContent = 'space-between';
    headerContainer.style.alignItems = 'center';
    headerContainer.style.marginBottom = '15px';
    headerContainer.style.borderBottom = '1px solid #555';
    headerContainer.style.paddingBottom = '10px';

    // Title
    const title = document.createElement('h3');
    title.textContent = 'Select HDU Header to View'; // Adjusted title
    title.style.margin = '0';
    title.style.color = '#fff';
    title.style.fontFamily = 'Arial, sans-serif';
    title.style.fontSize = '18px';
    title.style.fontWeight = 'bold';

    // Close button (identical styling)
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '&times;';
    closeButton.style.background = 'transparent';
    closeButton.style.border = 'none';
    closeButton.style.color = '#aaa';
    closeButton.style.fontSize = '24px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.lineHeight = '24px';
    closeButton.style.width = '30px';
    closeButton.style.height = '30px';
    closeButton.style.borderRadius = '50%';
    closeButton.style.display = 'flex';
    closeButton.style.alignItems = 'center';
    closeButton.style.justifyContent = 'center';
    closeButton.title = 'Close';
    closeButton.addEventListener('mouseover', function() { this.style.backgroundColor = 'rgba(255,255,255,0.1)'; this.style.color = '#fff'; });
    closeButton.addEventListener('mouseout', function() { this.style.backgroundColor = 'transparent'; this.style.color = '#aaa'; });
    closeButton.addEventListener('click', function() { document.body.removeChild(popup); });
    headerContainer.appendChild(title);
    headerContainer.appendChild(closeButton);

    // Description
    const description = document.createElement('p');
    description.textContent = 'This FITS file contains multiple headers. Please select which one to view:';
    description.style.color = '#ddd';
    description.style.marginBottom = '15px';
    description.style.fontFamily = 'Arial, sans-serif';

    // Search box (identical styling)
    const searchContainer = document.createElement('div');
    searchContainer.style.marginBottom = '15px';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search HDUs...';
    searchInput.style.width = '100%';
    searchInput.style.padding = '8px 12px';
    searchInput.style.backgroundColor = '#444';
    searchInput.style.border = '1px solid #555';
    searchInput.style.borderRadius = '4px';
    searchInput.style.color = '#fff';
    searchInput.style.fontSize = '14px';
    searchInput.style.boxSizing = 'border-box';
    searchInput.addEventListener('focus', function() { this.style.border = '1px solid #2196F3'; this.style.outline = 'none'; });
    searchInput.addEventListener('blur', function() { this.style.border = '1px solid #555'; });
    searchContainer.appendChild(searchInput);

    // Selection container
    const selectionContainer = document.createElement('div');
    selectionContainer.style.display = 'flex';
    selectionContainer.style.flexDirection = 'column';
    selectionContainer.style.gap = '10px';
    selectionContainer.style.marginBottom = '15px';
    selectionContainer.id = 'hdu-header-selection-container'; // Distinct ID

    const optionElements = [];

    // Add each HDU as an option (using same styling as createHduSelectorPopup)
    hduList.forEach((hdu, index) => {
        const option = document.createElement('div');
        option.className = 'hdu-option'; // Reuse class for styling
        option.style.padding = '10px';
        option.style.backgroundColor = '#444';
        option.style.borderRadius = '4px';
        option.style.cursor = 'pointer';
        option.style.transition = 'background-color 0.2s, transform 0.1s';
        option.addEventListener('mouseover', function() { this.style.backgroundColor = '#555'; this.style.transform = 'translateY(-2px)'; });
        option.addEventListener('mouseout', function() { this.style.backgroundColor = '#444'; this.style.transform = 'translateY(0)'; });

        // Store searchable text
        let searchText = `HDU ${index} ${hdu.type} `;
        if (hdu.name) searchText += hdu.name + ' ';
        if (hdu.dimensions) searchText += hdu.dimensions.join('x') + ' ';
        if (hdu.bunit) searchText += hdu.bunit + ' ';
        option.dataset.searchText = searchText.toLowerCase();

        // Option header
        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.marginBottom = '5px';
        const optionTitle = document.createElement('div');
        optionTitle.style.fontWeight = 'bold';
        optionTitle.style.color = '#fff';
        optionTitle.textContent = `HDU ${index}: ${hdu.type}`; 
        if (hdu.name && hdu.name !== '') optionTitle.textContent += ` (${hdu.name})`;
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

        // Details (simplified)
        const details = document.createElement('div');
        details.style.fontSize = '13px';
        details.style.color = '#ccc';
        details.style.marginTop = '5px';
        // Display only row count for tables, otherwise minimal info
        if (hdu.type === 'Table' && hdu.rows !== undefined) {
            details.innerHTML = `<div>Rows: ${hdu.rows}</div>`;
        } else {
            // For Image HDUs or others, don't show dimensions/WCS/unit here
            // details.innerHTML = '<div>(Image Data)</div>'; // Or leave empty
            details.innerHTML = ''; 
        }
        option.appendChild(header);
        option.appendChild(details);

        // *** KEY DIFFERENCE: Click handler calls loadAndDisplayFitsHeader ***
        option.addEventListener('click', function() {
            if (typeof loadAndDisplayFitsHeader === 'function') {
                loadAndDisplayFitsHeader(filepath, index); // Call header display function
            } else {
                console.error('loadAndDisplayFitsHeader function not found.');
                showNotification('Error: Header display function not available.', 3000, 'error');
            }
            document.body.removeChild(popup);
        });

        selectionContainer.appendChild(option);
        optionElements.push(option);
    });

    // Add search functionality (identical logic)
    searchInput.addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase().trim();
        if (searchTerm === '') {
            optionElements.forEach(option => { option.style.display = 'block'; });
        } else {
            optionElements.forEach(option => {
                const searchText = option.dataset.searchText;
                option.style.display = searchText.includes(searchTerm) ? 'block' : 'none';
            });
        }
    });

    // Button container (Cancel only, or add Recommended? Let's add Recommended for consistency)
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'space-between';
    buttonContainer.style.marginTop = '15px'; // Added margin top

    // Cancel button (identical)
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.style.flex = '1';
    cancelButton.style.marginRight = '10px';
    cancelButton.style.padding = '10px 0';
    cancelButton.style.backgroundColor = '#f44336';
    cancelButton.style.color = '#fff';
    cancelButton.style.border = 'none';
    cancelButton.style.borderRadius = '4px';
    cancelButton.style.cursor = 'pointer';
    cancelButton.style.fontFamily = 'Arial, sans-serif';
    cancelButton.style.fontSize = '14px';
    cancelButton.addEventListener('mouseover', () => { cancelButton.style.backgroundColor = '#d32f2f'; });
    cancelButton.addEventListener('mouseout', () => { cancelButton.style.backgroundColor = '#f44336'; });
    cancelButton.addEventListener('click', () => { document.body.removeChild(popup); });

    // Auto-select recommended HDU button (calls loadAndDisplayFitsHeader)
    const autoSelectButton = document.createElement('button');
    autoSelectButton.textContent = 'View Recommended Header';
    autoSelectButton.style.flex = '1';
    autoSelectButton.style.padding = '10px 0';
    autoSelectButton.style.backgroundColor = '#4CAF50';
    autoSelectButton.style.color = '#fff';
    autoSelectButton.style.border = 'none';
    autoSelectButton.style.borderRadius = '4px';
    autoSelectButton.style.cursor = 'pointer';
    autoSelectButton.style.fontFamily = 'Arial, sans-serif';
    autoSelectButton.style.fontSize = '14px';
    autoSelectButton.addEventListener('mouseover', () => { autoSelectButton.style.backgroundColor = '#45a049'; });
    autoSelectButton.addEventListener('mouseout', () => { autoSelectButton.style.backgroundColor = '#4CAF50'; });
    autoSelectButton.addEventListener('click', () => {
        const recommendedIndex = hduList.findIndex(hdu => hdu.isRecommended);
        const indexToLoad = (recommendedIndex >= 0) ? recommendedIndex : 0; // Default to 0 if none recommended
        if (typeof loadAndDisplayFitsHeader === 'function') {
            loadAndDisplayFitsHeader(filepath, indexToLoad);
        } else {
             console.error('loadAndDisplayFitsHeader function not found.');
             showNotification('Error: Header display function not available.', 3000, 'error');
        }
        document.body.removeChild(popup);
    });

    buttonContainer.appendChild(cancelButton);
    buttonContainer.appendChild(autoSelectButton);

    // Assemble popup
    popup.appendChild(headerContainer);
    popup.appendChild(description);
    popup.appendChild(searchContainer);
    popup.appendChild(selectionContainer);
    popup.appendChild(buttonContainer);

    // Add popup to document
    document.body.appendChild(popup);
    
    // Make popup draggable (assuming makeDraggable function exists and works with the title element)
    if (typeof makeDraggable === 'function') {
         makeDraggable(popup, title); // Use the title element as the drag handle
    } else {
        console.warn('makeDraggable function not found, popup will not be draggable.');
    }

    // Focus search input
    setTimeout(() => { searchInput.focus(); }, 100);
}


// Ensure the modal closes if the user clicks outside of the content area
// ... existing code ...
// ... existing code ...formatFileSize

// =================================================================
// 1. UTILITY/HELPER FUNCTIONS
// =================================================================

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}


// =================================================================
// 2. CORE UI CONTROL FUNCTIONS
// =================================================================

function switchTab(activeTabId) {
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(content => {
        content.style.display = 'none';
    });

    const tabButtons = document.querySelectorAll('.file-browser-tab');
    tabButtons.forEach(button => {
        button.style.color = '#aaa';
        button.style.borderBottom = '3px solid transparent';
        button.style.background = 'transparent';
        button.classList.remove('active-tab');
    });

    const activeTab = document.getElementById(activeTabId);
    if (activeTab) {
        activeTab.style.color = '#2196F3';
        activeTab.style.borderBottom = '3px solid #2196F3';
        activeTab.style.background = 'rgba(33, 150, 243, 0.1)';
        activeTab.classList.add('active-tab');
    }

    let contentId;
    switch (activeTabId) {
        case 'directory-tab':
            contentId = 'directory-content';
            break;
        case 'upload-tab':
            contentId = 'upload-content';
            break;
        case 'download-tab':
            contentId = 'download-content';
            break;
        case 'ned-tab':
            contentId = 'ned-content';
            break;
        case 'mast-tab':
            contentId = 'mast-content';
            break;
    }

    if (contentId) {
        const contentSection = document.getElementById(contentId);
        if (contentSection) {
            contentSection.style.display = 'block';
        }
    }
}

function showFileBrowser(onFileSelectCallback = null) {
    createFileBrowserContainer();
    const fileBrowserContainer = document.getElementById('file-browser-container');
    if (fileBrowserContainer) {
        fileBrowserContainer.style.transform = 'translateX(-520px)';
        fileBrowserContainer.onFileSelect = onFileSelectCallback;
    }
}

function hideFileBrowser() {
    const fileBrowserContainer = document.getElementById('file-browser-container');
    if (fileBrowserContainer) {
        fileBrowserContainer.style.transform = 'translateX(0)';
    }
}


// =================================================================
// 3. DATA LOADING AND DISPLAY
// =================================================================

function loadFilesList(path = '', search = null) {
    const fileBrowserContainer = document.getElementById('file-browser-container');
    if (fileBrowserContainer) {
        fileBrowserContainer.dataset.currentPath = path;
        const title = fileBrowserContainer.querySelector('h2');
        if (title) {
            title.textContent = search ? `Search results for "${search}"` : (path ? `Files: /${path}` : 'Browser');
        }
    }

    const directoryContent = document.getElementById('directory-content');
    if (directoryContent) {
        // Do not wipe the entire UI while user is typing in the search box; it causes focus loss
        if (!search) {
            directoryContent.innerHTML = `<div style="text-align: center; padding: 20px; color: #aaa;">Loading directory content...</div>`;
        }
    }

    let url = path ? `/list-files-for-frontend/${path}` : '/list-files-for-frontend/';
    if (search) {
        url += `?search=${encodeURIComponent(search)}`;
    }

    apiFetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                showFilesListError(data.error);
                return;
            }
            displayFilesList(data.items, data.current_path, search);
        })
        .catch(error => {
            console.error('Error loading files list:', error);
            showFilesListError("Failed to load files. Please try again later.");
        });
}

function showFilesListError(message) {
    const directoryContent = document.getElementById('directory-content');
    if (!directoryContent) return;
    directoryContent.innerHTML = '';
    const errorContainer = document.createElement('div');
    errorContainer.style.padding = '20px';
    errorContainer.style.color = '#ff6b6b';
    errorContainer.innerHTML = `<strong>Error:</strong> ${message}`;
    directoryContent.appendChild(errorContainer);
}

function displayFilesList(items, currentPath = '', search = null) {
    const directoryContent = document.getElementById('directory-content');
    if (!directoryContent) return;

    // Preserve search input focus and caret position across re-renders
    let prevSearchValue = '';
    let prevSelectionStart = 0;
    let prevSelectionEnd = 0;
    let wasFocused = false;
    let existingSearchInput = directoryContent.querySelector('#files-search-input');
    if (!existingSearchInput) {
        existingSearchInput = directoryContent.querySelector('input[placeholder="Search files recursively..."]');
    }
    if (existingSearchInput) {
        prevSearchValue = existingSearchInput.value || '';
        try {
            prevSelectionStart = existingSearchInput.selectionStart ?? 0;
            prevSelectionEnd = existingSearchInput.selectionEnd ?? prevSelectionStart;
        } catch (e) { /* ignore */ }
        wasFocused = document.activeElement === existingSearchInput;
    }

    directoryContent.innerHTML = '';
    
    const breadcrumbContainer = document.createElement('div');
    Object.assign(breadcrumbContainer.style, {
        marginBottom: '15px', display: 'flex', flexWrap: 'wrap',
        alignItems: 'center', gap: '5px'
    });
    
    const rootLink = document.createElement('a');
    rootLink.textContent = 'Home';
    rootLink.href = '#';
    Object.assign(rootLink.style, { color: '#2196F3', textDecoration: 'none', cursor: 'pointer' });
    rootLink.addEventListener('click', (e) => {
        e.preventDefault();
        loadFilesList('');
    });
    breadcrumbContainer.appendChild(rootLink);
    
    if (currentPath) {
        const separator = document.createElement('span');
        separator.textContent = ' / ';
        separator.style.color = '#aaa';
        breadcrumbContainer.appendChild(separator);
        
        const segments = currentPath.split('/');
        segments.forEach((segment, index) => {
            if (segment) {
                const isLast = index === segments.length - 1;
                const segmentPath = segments.slice(0, index + 1).join('/');
                const segmentLink = document.createElement(isLast ? 'span' : 'a');
                segmentLink.textContent = segment;
                
                if (isLast) {
                    segmentLink.style.color = '#aaa';
                } else {
                    Object.assign(segmentLink.style, {
                        href: '#', color: '#2196F3', textDecoration: 'none', cursor: 'pointer'
                    });
                    segmentLink.addEventListener('click', (e) => {
                        e.preventDefault();
                        loadFilesList(segmentPath);
                    });
                }
                breadcrumbContainer.appendChild(segmentLink);
                
                if (!isLast) {
                    const sep = document.createElement('span');
                    sep.textContent = ' / ';
                    sep.style.color = '#aaa';
                    breadcrumbContainer.appendChild(sep);
                }
            }
        });
    }
    directoryContent.appendChild(breadcrumbContainer);
    
    const searchContainer = document.createElement('div');
    searchContainer.style.marginBottom = '15px';
    
    const searchInput = document.createElement('input');
    searchInput.id = 'files-search-input';
    searchInput.type = 'text';
    searchInput.placeholder = 'Search files recursively...';
    // Restore the previous value if we had one; otherwise use the provided search param
    if (prevSearchValue) {
        searchInput.value = prevSearchValue;
    } else if (search) {
        searchInput.value = search;
    }
    Object.assign(searchInput.style, {
        width: '100%', padding: '8px', backgroundColor: '#333',
        color: 'white', border: '1px solid #555', borderRadius: '4px',
        transition: 'all 0.3s ease'
    });
    
    searchInput.addEventListener('focus', () => {
        searchInput.style.borderColor = '#2196F3';
        searchInput.style.boxShadow = '0 0 0 2px rgba(33, 150, 243, 0.2)';
    });
    searchInput.addEventListener('blur', () => {
        searchInput.style.borderColor = '#555';
        searchInput.style.boxShadow = 'none';
    });

    // Use lodash's debounce to avoid any naming collisions with local helpers
    const debouncedSearch = _.debounce(() => {
        loadFilesList(currentPath, searchInput.value.trim());
    }, 300);
    searchInput.addEventListener('input', debouncedSearch);
    
    searchContainer.appendChild(searchInput);
    directoryContent.appendChild(searchContainer);

    // Restore focus and caret after rebuilding DOM
    if (wasFocused) {
        setTimeout(() => {
            searchInput.focus();
            try { searchInput.setSelectionRange(prevSelectionStart, prevSelectionEnd); } catch (e) { /* ignore */ }
        }, 0);
    }
    
    if (!items || items.length === 0) {
        const emptyMessage = document.createElement('div');
        Object.assign(emptyMessage.style, { padding: '20px', textAlign: 'center', color: '#aaa' });
        emptyMessage.innerHTML = `<p>No files or directories found.</p>`;
        directoryContent.appendChild(emptyMessage);
        return;
    }
    
    const fileItems = document.createElement('div');
    fileItems.className = 'file-items';
    Object.assign(fileItems.style, { display: 'flex', flexDirection: 'column', gap: '5px' });
    
    const directories = items.filter(item => item.type === 'directory');
    const files = items.filter(item => item.type === 'file');

    [...directories, ...files].forEach((item, index) => {
        const itemElement = createItemElement(item, currentPath);
        fileItems.appendChild(itemElement);
        setTimeout(() => {
            itemElement.style.opacity = '1';
            itemElement.style.transform = 'translateY(0)';
        }, index * 30);
    });
    
    directoryContent.appendChild(fileItems);
}


// =================================================================
// 4. UI COMPONENT CREATION
// =================================================================

function createItemElement(item, currentPath) {
    const itemElement = document.createElement('div');
    itemElement.className = 'file-item';
    itemElement.dataset.name = item.name;
    itemElement.dataset.path = item.path;
    itemElement.dataset.type = item.type;
    Object.assign(itemElement.style, {
        padding: '8px 12px 8px 8px', borderRadius: '4px', backgroundColor: '#333',
        cursor: 'pointer', transition: 'background-color 0.2s, opacity 0.3s, transform 0.2s',
        display: 'flex', alignItems: 'flex-start', borderLeft: `3px solid ${item.type === 'directory' ? '#FFC107' : '#2196F3'}`
    });

    const contentContainer = document.createElement('div');
    Object.assign(contentContainer.style, {
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        flexGrow: '1', overflow: 'hidden', marginRight: '5px'
    });

    const nameElement = document.createElement('div');
    nameElement.className = 'file-name';
    nameElement.textContent = item.name;
    nameElement.title = item.name;
    nameElement.style.fontWeight = 'bold';
    contentContainer.appendChild(nameElement);

    if (item.type === 'file') {
        if (item.size !== undefined) {
            const sizeElement = document.createElement('div');
            sizeElement.className = 'file-size';
            sizeElement.textContent = formatFileSize(item.size);
            Object.assign(sizeElement.style, { fontSize: '12px', color: '#aaa', marginTop: '4px' });
            contentContainer.appendChild(sizeElement);
        }

        if (item.path && item.path.startsWith('uploads/')) {
            // Add download button for uploads only
            const downloadBtn = document.createElement('button');
            downloadBtn.textContent = 'Download';
            downloadBtn.className = 'download-upload-button';
            Object.assign(downloadBtn.style, {
                padding: '3px 6px', fontSize: '10px', cursor: 'pointer',
                backgroundColor: '#9C27B0', color: 'white', border: 'none',
                borderRadius: '3px', transition: 'background-color 0.2s',
                flexShrink: '0', marginTop: '6px', width: 'fit-content', marginRight: '6px'
            });
            downloadBtn.addEventListener('mouseover', () => downloadBtn.style.backgroundColor = '#7B1FA2');
            downloadBtn.addEventListener('mouseout', () => downloadBtn.style.backgroundColor = '#9C27B0');
            downloadBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                try {
                    const rel = item.path.replace(/^uploads\//,'');
                    const resp = await apiFetch(`/download/${encodeURIComponent(rel)}`);
                    if (!resp.ok) throw new Error(`Download failed: ${resp.status} ${resp.statusText}`);
                    const blob = await resp.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = item.name;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                } catch (err) {
                    console.error('Download error:', err);
                    showNotification(`Download error: ${err.message}`, 4000, 'error');
                }
            });
            contentContainer.appendChild(downloadBtn);
        }

        if (item.name.toLowerCase().endsWith('.fits') || item.name.toLowerCase().endsWith('.fits.gz')) {
            const headerButton = document.createElement('button');
            headerButton.textContent = 'Header';
            headerButton.className = 'load-header-button';
            Object.assign(headerButton.style, {
                padding: '3px 6px', fontSize: '10px', cursor: 'pointer',
                backgroundColor: '#007bff', color: 'white', border: 'none',
                borderRadius: '3px', transition: 'background-color 0.2s',
                flexShrink: '0', marginTop: '6px', width: 'fit-content'
            });

            headerButton.addEventListener('click', async (event) => {
                event.stopPropagation();
                hideFileBrowser();
                showNotification(true, 'Fetching HDU info...');
                try {
                    const hduList = await getFitsHduInfo(item.path);
                    showNotification(false);
                    if (hduList && hduList.length > 1) {
                        if (typeof showHduHeaderSelectionPopup === 'function') {
                            showHduHeaderSelectionPopup(hduList, item.path);
                        } else {
                            console.error('showHduHeaderSelectionPopup function not found.');
                            loadAndDisplayFitsHeader(item.path, 0);
                        }
                    } else {
                        loadAndDisplayFitsHeader(item.path, 0);
                    }
                } catch (error) {
                    showNotification(false);
                    console.error('Error fetching HDU info:', error);
                    showNotification(`Error getting HDU info: ${error.message}. Loading primary header.`, 4000, 'error');
                    loadAndDisplayFitsHeader(item.path, 0);
                }
            });
            headerButton.addEventListener('mouseover', () => headerButton.style.backgroundColor = '#0056b3');
            headerButton.addEventListener('mouseout', () => headerButton.style.backgroundColor = '#007bff');
            contentContainer.appendChild(headerButton);
        }
    }

    itemElement.appendChild(contentContainer);
    itemElement.addEventListener('mouseover', () => {
        itemElement.style.backgroundColor = '#444';
        itemElement.style.transform = 'translateY(-2px)';
    });
    itemElement.addEventListener('mouseout', () => {
        itemElement.style.backgroundColor = '#333';
        itemElement.style.transform = 'translateY(0)';
    });
    
    Object.assign(itemElement.style, { opacity: '0', transform: 'translateY(10px)' });

    itemElement.addEventListener('click', (event) => {
        if (event.target.classList.contains('load-header-button')) return;
        if (item.type === 'directory') {
            loadFilesList(item.path);
        } else {
            const fileBrowserContainer = document.getElementById('file-browser-container');
            if (fileBrowserContainer && fileBrowserContainer.onFileSelect) {
                fileBrowserContainer.onFileSelect(item.path);
                fileBrowserContainer.onFileSelect = null;
            } else {
                loadFitsFileWithHduSelection(item.path);
            }
            hideFileBrowser();
        }
    });
    
    return itemElement;
}

function createTabInterface(contentContainer) {
    const tabContainer = document.createElement('div');
    tabContainer.id = 'file-browser-tabs';
    tabContainer.style.display = 'flex';
    tabContainer.style.borderBottom = '1px solid rgba(255, 255, 255, 0.1)';

    const tabs = [
        { id: 'directory-tab', label: 'Directory', contentId: 'directory-content' },
        { id: 'upload-tab', label: 'Upload', contentId: 'upload-content' },
        { id: 'download-tab', label: 'Download', contentId: 'download-content' },
        { id: 'ned-tab', label: 'NED', contentId: 'ned-content' },
        { id: 'mast-tab', label: 'MAST', contentId: 'mast-content' }
    ];

    tabs.forEach(tab => {
        const tabButton = document.createElement('button');
        tabButton.id = tab.id;
        tabButton.textContent = tab.label;
        tabButton.className = 'file-browser-tab';
        Object.assign(tabButton.style, {
            padding: '12px 15px', background: 'transparent', border: 'none',
            borderBottom: '3px solid transparent', color: '#aaa', cursor: 'pointer',
            fontSize: '14px', fontWeight: 'bold', transition: 'all 0.2s ease',
            flex: '1', textAlign: 'center'
        });
        
        tabButton.addEventListener('mouseover', function() {
            if (!this.classList.contains('active-tab')) {
                this.style.color = '#fff';
                this.style.background = 'rgba(255, 255, 255, 0.05)';
            }
        });
        
        tabButton.addEventListener('mouseout', function() {
            if (!this.classList.contains('active-tab')) {
                this.style.color = '#aaa';
                this.style.background = 'transparent';
            }
        });
        
        tabButton.addEventListener('click', () => switchTab(tab.id));
        tabContainer.appendChild(tabButton);
    });
    
    contentContainer.appendChild(tabContainer);

    tabs.forEach(tab => {
        const tabContent = document.createElement('div');
        tabContent.id = tab.contentId;
        tabContent.className = 'tab-content';
        tabContent.style.display = 'none';
        tabContent.style.padding = '15px 20px';
        contentContainer.appendChild(tabContent);
    });
}

function createFileBrowserContainer() {
    if (document.getElementById('file-browser-container')) return;
    
    const fileBrowserContainer = document.createElement('div');
    fileBrowserContainer.id = 'file-browser-container';
    Object.assign(fileBrowserContainer.style, {
        position: 'fixed', top: '0', right: '-520px', width: '520px', height: '100vh',
        backgroundColor: 'rgba(0, 0, 0, 0.9)', color: 'white', padding: '0',
        boxSizing: 'border-box', boxShadow: '-2px 0 10px rgba(0, 0, 0, 0.5)',
        zIndex: '10000', transition: 'transform 0.3s ease-in-out',overflowX: 'hidden',
        overflowY: 'auto', fontFamily: 'Raleway, Arial, sans-serif'
    });

    const header = document.createElement('div');
    Object.assign(header.style, {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '15px 20px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        backgroundColor: 'rgba(0, 0, 0, 1)', position: 'sticky', top: '0', zIndex: '10'
    });
    
    const title = document.createElement('h2');
    title.textContent = 'Images';
    Object.assign(title.style, { margin: '0', fontSize: '18px', fontWeight: '500' });
    
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '&times;';
    Object.assign(closeButton.style, {
        background: 'transparent', border: 'none', color: 'white', fontSize: '24px',
        cursor: 'pointer', width: '30px', height: '30px', display: 'flex',
        alignItems: 'center', justifyContent: 'center', borderRadius: '50%',
        transition: 'background-color 0.2s'
    });
    closeButton.onclick = hideFileBrowser;
    closeButton.addEventListener('mouseover', () => closeButton.style.backgroundColor = 'rgba(255, 255, 255, 0.1)');
    closeButton.addEventListener('mouseout', () => closeButton.style.backgroundColor = 'transparent');
    
    header.appendChild(title);
    header.appendChild(closeButton);
    
    const content = document.createElement('div');
    content.id = 'file-browser-content';
    content.style.padding = '0';
    
    createTabInterface(content);
    
    fileBrowserContainer.appendChild(header);
    fileBrowserContainer.appendChild(content);
    
    document.body.appendChild(fileBrowserContainer);
    
    initializeDirectoryContent();
    initializeUploadContent();
    initializeDownloadContent();
    initializeNedContent(); 
    if (typeof window.initializeMastContent === 'function') {
        window.initializeMastContent();
    }
    
    switchTab('directory-tab');
}


// =================================================================
// 5. TAB CONTENT INITIALIZATION
// =================================================================

function initializeDirectoryContent() {
    const directoryContent = document.getElementById('directory-content');
    if (!directoryContent) return;
    directoryContent.innerHTML = ''; // Clear previous content
    loadFilesList('');
}

function initializeUploadContent() {
    const uploadContent = document.getElementById('upload-content');
    if (!uploadContent || uploadContent.childElementCount > 0) return;

    const uploadContainer = document.createElement('div');
    uploadContainer.style.textAlign = 'center';

    const title = document.createElement('h3');
    title.textContent = 'Upload FITS File';
    title.style.margin = '0 0 15px 0';

    const fileInputWrapper = document.createElement('div');
    fileInputWrapper.style.position = 'relative';
    fileInputWrapper.style.overflow = 'hidden';
    fileInputWrapper.style.display = 'inline-block';
    fileInputWrapper.style.marginBottom = '10px';

    const uploadButton = document.createElement('button');
    uploadButton.textContent = 'Choose FITS File';
    Object.assign(uploadButton.style, {
        padding: '10px 15px', backgroundColor: '#007bff', color: 'white',
        border: 'none', borderRadius: '4px', cursor: 'pointer'
    });

    const fileInput = document.createElement('input');
    fileInput.id = 'fits-file-input';
    fileInput.type = 'file';
    fileInput.accept = '.fits,.fit,.fits.gz,.fit.gz';
    Object.assign(fileInput.style, {
        position: 'absolute', fontSize: '100px', opacity: '0',
        right: '0', top: '0', cursor: 'pointer'
    });

    uploadButton.addEventListener('click', () => fileInput.click());

    const selectedFile = document.createElement('div');
    selectedFile.id = 'selected-file-name';
    Object.assign(selectedFile.style, {
        marginTop: '10px', padding: '8px', backgroundColor: 'rgba(0,0,0,0.2)',
        borderRadius: '4px', fontSize: '13px', color: '#aaa'
    });
    selectedFile.textContent = 'No file selected';

    const loadSelectedButton = document.createElement('button');
    loadSelectedButton.id = 'load-selected-button';
    loadSelectedButton.textContent = 'Load Selected File';
    Object.assign(loadSelectedButton.style, {
        padding: '10px 15px', backgroundColor: '#28a745', color: 'white',
        border: 'none', borderRadius: '4px', cursor: 'not-allowed',
        marginTop: '15px', width: '100%', opacity: '0.5'
    });
    loadSelectedButton.disabled = true;

    fileInput.addEventListener('change', function() {
        if (this.files.length > 0) {
            selectedFile.textContent = `Selected: ${this.files[0].name}`;
            selectedFile.style.color = '#4CAF50';
            loadSelectedButton.style.opacity = '1';
            loadSelectedButton.style.cursor = 'pointer';
            loadSelectedButton.disabled = false;
        } else {
            selectedFile.textContent = 'No file selected';
            selectedFile.style.color = '#aaa';
            loadSelectedButton.style.opacity = '0.5';
            loadSelectedButton.style.cursor = 'not-allowed';
            loadSelectedButton.disabled = true;
        }
    });

    loadSelectedButton.addEventListener('click', function() {
        const file = fileInput.files[0];
        if (file) {
            hideFileBrowser();
            loadLocalFitsFile(file);
        } else {
            showNotification('No file selected.', 2000, 'warning');
        }
    });

    fileInputWrapper.appendChild(uploadButton);
    fileInputWrapper.appendChild(fileInput);
    uploadContainer.appendChild(title);
    uploadContainer.appendChild(fileInputWrapper);
    uploadContainer.appendChild(selectedFile);
    uploadContainer.appendChild(loadSelectedButton);
    uploadContent.appendChild(uploadContainer);
}

function initializeDownloadContent() {
    const downloadContent = document.getElementById('download-content');
    if (!downloadContent || downloadContent.childElementCount > 0) return;
    
    // Create heading
    const heading = document.createElement('h3');
    heading.textContent = 'Download FITS File';
    heading.style.fontSize = '16px';
    heading.style.margin = '0 0 15px 0';
    heading.style.color = '#fff';
    
    // Create input for URL
    const urlLabel = document.createElement('label');
    urlLabel.textContent = 'Enter a URL to download a FITS file:';
    urlLabel.style.display = 'block';
    urlLabel.style.marginBottom = '8px';
    urlLabel.style.color = '#ddd';
    
    const urlInput = document.createElement('input');
    urlInput.id = 'fits-url-input';
    urlInput.type = 'text';
    urlInput.placeholder = 'https://example.com/path/to/file.fits';
    urlInput.style.width = '100%';
    urlInput.style.padding = '10px';
    urlInput.style.marginBottom = '15px';
    urlInput.style.backgroundColor = '#333';
    urlInput.style.color = 'white';
    urlInput.style.border = '1px solid #555';
    urlInput.style.borderRadius = '4px';
    urlInput.style.fontSize = '14px';
    
    // Create download button
    const downloadButton = document.createElement('button');
    downloadButton.id = 'download-fits-button';
    downloadButton.textContent = 'Download & Open';
    downloadButton.style.backgroundColor = '#2196F3';
    downloadButton.style.color = 'white';
    downloadButton.style.border = 'none';
    downloadButton.style.borderRadius = '4px';
    downloadButton.style.padding = '10px 16px';
    downloadButton.style.cursor = 'pointer';
    downloadButton.style.width = '100%';
    downloadButton.style.fontWeight = 'bold';
    downloadButton.style.transition = 'background-color 0.2s';
    
    // Hover effect
    downloadButton.addEventListener('mouseover', function() {
        this.style.backgroundColor = '#0b7dda';
    });
    
    downloadButton.addEventListener('mouseout', function() {
        this.style.backgroundColor = '#2196F3';
    });
    
    // URL download and load handler
    downloadButton.addEventListener('click', function() {
        const url = urlInput.value.trim();
        if (!url) {
            showNotification('Please enter a valid URL', 3000, 'warning');
            return;
        }
        
        // Hide the file browser
        hideFileBrowser(); 
        
        // Use the new function to download, save, and then load the file
        downloadAndLoadFitsFromUrl(url);
    });
    
    // Add example URLs
    const examplesContainer = document.createElement('div');
    examplesContainer.style.marginTop = '20px';
    examplesContainer.style.marginBottom = '10px';
    
    const examplesHeading = document.createElement('p');
    examplesHeading.textContent = 'Example URLs to try:';
    examplesHeading.style.margin = '0 0 10px 0';
    examplesHeading.style.color = '#ddd';
    examplesHeading.style.fontWeight = 'bold';
    
    const examplesList = document.createElement('div');
    examplesList.style.display = 'flex';
    examplesList.style.flexDirection = 'column';
    examplesList.style.gap = '8px';
    
    // Example URLs
    const examples = [
        {
            name: 'JWST NGC 0628 MIRI F2100W',
            url: 'https://www.canfar.net/storage/vault/file/phangs/RELEASES/PHANGS-JWST/v1p0p1/ngc0628/hlsp_phangs-jwst_jwst_miri_ngc0628_f2100w_v1p0p1_img.fits'
        },
        {
            name: 'ALMA NGC 0628',
            url: 'https://www.canfar.net/storage/vault/file/phangs/RELEASES/PHANGS-ALMA/by_galaxy/ngc0628/ngc0628_12m+7m+tp_co21_broad_mom0.fits'
        }
    ];
    
    examples.forEach(example => {
        const exampleItem = document.createElement('div');
        exampleItem.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
        exampleItem.style.padding = '8px 12px';
        exampleItem.style.borderRadius = '4px';
        exampleItem.style.cursor = 'pointer';
        
        exampleItem.innerHTML = `
            <p style="margin: 0; font-weight: bold; color: #ddd;">${example.name}</p>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #2196F3; word-break: break-all;">${example.url}</p>
        `;
        
        // Hover effect
        exampleItem.addEventListener('mouseover', function() {
            this.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
        });
        
        exampleItem.addEventListener('mouseout', function() {
            this.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
        });
        
        // Click to fill in the URL
        exampleItem.addEventListener('click', function() {
            urlInput.value = example.url;
            // Focus and scroll to make it obvious
            urlInput.focus();
            urlInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        
        examplesList.appendChild(exampleItem);
    });
    
    examplesContainer.appendChild(examplesHeading);
    examplesContainer.appendChild(examplesList);
    
    // Add a note about astronomy repositories
    const repositoryInfo = document.createElement('div');
    repositoryInfo.style.marginTop = '20px';
    repositoryInfo.style.padding = '10px';
    repositoryInfo.style.backgroundColor = 'rgba(33, 150, 243, 0.1)';
    repositoryInfo.style.borderRadius = '4px';
    repositoryInfo.style.borderLeft = '3px solid #2196F3';
    repositoryInfo.style.fontSize = '13px';
    
    repositoryInfo.innerHTML = `
        <p style="margin: 0 0 8px 0; color: #ddd;"><strong>Astronomy data repositories:</strong></p>
        <ul style="margin: 0; padding-left: 20px; color: #bbb;">
            <li>NASA/IPAC Infrared Science Archive</li>
            <li>ESA Hubble Science Archive</li>
            <li>MAST: Mikulski Archive for Space Telescopes</li>
            <li>SDSS: Sloan Digital Sky Survey</li>
        </ul>
    `;
    
    // Add all elements to the download tab
    downloadContent.appendChild(heading);
    downloadContent.appendChild(urlLabel);
    downloadContent.appendChild(urlInput);
    downloadContent.appendChild(downloadButton);
    downloadContent.appendChild(examplesContainer);
    downloadContent.appendChild(repositoryInfo);
}

function initializeExamplesContent() {
    const examplesContent = document.getElementById('examples-content');
    // ... existing code ...
}

function initializeNedContent() {
    const nedContent = document.getElementById('ned-content');
    if (!nedContent || nedContent.childElementCount > 0) return;
    
    // Create heading
    const heading = document.createElement('h3');
    heading.textContent = 'Search NED Database';
    heading.style.fontSize = '16px';
    heading.style.margin = '0 0 15px 0';
    heading.style.color = '#fff';
    
    // Create search container
    const searchContainer = document.createElement('div');
    searchContainer.style.marginBottom = '20px';
    
    // Create search field label
    const searchLabel = document.createElement('label');
    searchLabel.textContent = 'Enter object name or coordinates:';
    searchLabel.style.display = 'block';
    searchLabel.style.marginBottom = '8px';
    searchLabel.style.color = '#ddd';
    
    // Create search input field
    const searchInput = document.createElement('input');
    searchInput.id = 'ned-search-input';
    searchInput.type = 'text';
    searchInput.placeholder = 'e.g., NGC 628, M74, or 01h36m41.7s +15d47m01s';
    searchInput.style.width = '100%';
    searchInput.style.padding = '10px';
    searchInput.style.marginBottom = '15px';
    searchInput.style.backgroundColor = '#333';
    searchInput.style.color = 'white';
    searchInput.style.border = '1px solid #555';
    searchInput.style.borderRadius = '4px';
    searchInput.style.fontSize = '14px';
    
    // Create search button
    const searchButton = document.createElement('button');
    searchButton.id = 'ned-search-button';
    searchButton.textContent = 'Search NED';
    searchButton.style.backgroundColor = '#2196F3';
    searchButton.style.color = 'white';
    searchButton.style.border = 'none';
    searchButton.style.borderRadius = '4px';
    searchButton.style.padding = '10px 16px';
    searchButton.style.cursor = 'pointer';
    searchButton.style.width = '100%';
    searchButton.style.fontWeight = 'bold';
    searchButton.style.transition = 'background-color 0.2s';
    
    // Hover effect for search button
    searchButton.addEventListener('mouseover', function() {
        this.style.backgroundColor = '#0b7dda';
    });
    
    searchButton.addEventListener('mouseout', function() {
        this.style.backgroundColor = '#2196F3';
    });
    
    // Create results container
    const resultsContainer = document.createElement('div');
    resultsContainer.id = 'ned-results-container';
    resultsContainer.style.marginTop = '20px';
    resultsContainer.style.display = 'none'; // Initially hidden
    
    // Search results heading
    const resultsHeading = document.createElement('h4');
    resultsHeading.id = 'ned-results-heading';
    resultsHeading.textContent = 'Search Results';
    resultsHeading.style.fontSize = '14px';
    resultsHeading.style.margin = '0 0 10px 0';
    resultsHeading.style.color = '#fff';
    
    // Create loading indicator
    const loadingIndicator = document.createElement('div');
    loadingIndicator.id = 'ned-loading-indicator';
    loadingIndicator.style.display = 'none';
    loadingIndicator.style.textAlign = 'center';
    loadingIndicator.style.padding = '20px 0';
    
    const spinner = document.createElement('div');
    spinner.className = 'spinner'; // Assuming you have a CSS spinner class
    spinner.style.width = '40px';
    spinner.style.height = '40px';
    spinner.style.border = '4px solid rgba(255, 255, 255, 0.3)';
    spinner.style.borderRadius = '50%';
    spinner.style.borderTop = '4px solid white';
    spinner.style.margin = '0 auto 10px auto';
    spinner.style.animation = 'spin 1s linear infinite'; // Keyframe animation for spinning
    
    const loadingText = document.createElement('div');
    loadingText.textContent = 'Searching NED...';
    loadingText.style.color = '#ddd';
    
    loadingIndicator.appendChild(spinner);
    loadingIndicator.appendChild(loadingText);
    
    // Create results list
    const resultsList = document.createElement('div');
    resultsList.id = 'ned-results-list';
    resultsList.style.height = 'calc(100vh - 250px)'; // Adjust height as needed
    resultsList.style.overflowY = 'auto';
    resultsList.style.backgroundColor = '#222';
    resultsList.style.borderRadius = '4px';
    resultsList.style.padding = '10px';
    resultsList.style.marginTop = '10px';
    resultsList.style.overflowX = 'hidden';

    // Add elements to containers
    resultsContainer.appendChild(resultsHeading);
    resultsContainer.appendChild(resultsList);
    
    searchContainer.appendChild(searchLabel);
    searchContainer.appendChild(searchInput);
    searchContainer.appendChild(searchButton);
    
    // Add all elements to ned content
    nedContent.appendChild(heading);
    nedContent.appendChild(searchContainer);
    nedContent.appendChild(loadingIndicator);
    nedContent.appendChild(resultsContainer);
    
    // Add search functionality
    searchButton.addEventListener('click', function() {
        performNedSearch();
    });
    
    // Allow enter key to trigger search
    searchInput.addEventListener('keyup', function(event) {
        if (event.key === 'Enter') {
            performNedSearch();
        }
    });
}

// Enhanced function to perform NED search with comprehensive details
function performNedSearch() {
    const searchInput = document.getElementById('ned-search-input');
    const query = searchInput.value.trim();
    
    if (!query) {
        showNotification('Please enter a search term', 2000, 'warning');
        return;
    }
    
    // Show loading indicator
    const loadingIndicator = document.getElementById('ned-loading-indicator');
    const resultsContainer = document.getElementById('ned-results-container');
    
    if (loadingIndicator) loadingIndicator.style.display = 'block';
    if (resultsContainer) resultsContainer.style.display = 'none';
    
    // First, query the NED ObjectLookup service
    const lookupUrl = `https://ned.ipac.caltech.edu/srs/ObjectLookup?name=${encodeURIComponent(query)}&aliases=true`;
    const proxyUrl = `/proxy-download/?url=${encodeURIComponent(lookupUrl)}`;
    
    // First get object information
    apiFetch(proxyUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
    .then(data => {
        // Show results container
        if (resultsContainer) resultsContainer.style.display = 'block';
        
        // Get results list
        const resultsList = document.getElementById('ned-results-list');
        if (!resultsList) return;
        
        // Clear previous results
        resultsList.innerHTML = '';
        
        // Create target info section
        const targetInfo = document.createElement('div');
        targetInfo.style.backgroundColor = '#222';
        targetInfo.style.borderRadius = '4px';
        targetInfo.style.padding = '15px';
        targetInfo.style.marginBottom = '15px';
        
        if (data.ResultCode === 3) {
            // Known object - display information
            const preferred = data.Preferred;
            const position = preferred?.Position;
            const redshift = preferred?.Redshift;
            const objType = preferred?.ObjType;
            
            targetInfo.innerHTML = `
                <div style="font-size: 16px; font-weight: bold; color: #fff; margin-bottom: 10px;">${preferred?.Name || 'Unknown'}</div>
                <div style="color: #aaa; font-size: 13px;">
                    <div>Object Type: ${objType?.Value || 'Unknown'}</div>
                    <div>Position: RA = ${position?.RA?.toFixed(6) || 'Unknown'}°, Dec = ${position?.Dec?.toFixed(6) || 'Unknown'}°</div>
                    <div>Redshift: ${redshift?.Value?.toFixed(6) || 'Unknown'} ± ${redshift?.Uncertainty?.toFixed(6) || 'Unknown'}</div>
                </div>
            `;
        } else if (data.ResultCode === 1) {
            // Ambiguous name - show list of possibilities
            targetInfo.innerHTML = `
                <div style="color: #ff9800; font-size: 14px; margin-bottom: 10px;">Multiple objects found. Please select one:</div>
                <div style="max-height: 150px; overflow-y: auto;">
                    ${(data.Interpreted?.Aliases || []).map(alias => `
                        <div style="padding: 5px; cursor: pointer; color: #aaa; border-radius: 3px;" 
                             onclick="document.getElementById('ned-search-input').value='${alias}'; performNedSearch();">
                            ${alias}
                        </div>
                    `).join('')}
                </div>
            `;
        } else if (data.ResultCode === 2) {
            // Valid name but unknown object
            targetInfo.innerHTML = `
                <div style="color: #ff9800; font-size: 14px;">
                    Object "${data.Interpreted?.Name || 'Unknown'}" not found in NED database.
                </div>
            `;
        } else {
            // Invalid name
            targetInfo.innerHTML = `
                <div style="color: #f44336; font-size: 14px;">
                    Invalid object name: "${data.Supplied || 'Unknown'}"
                </div>
            `;
        }
        
        resultsList.appendChild(targetInfo);
        
        // If we have a valid object, proceed with image search
        if (data.ResultCode === 3) {
            // Create URL for NED SIA API query
            const encodedQuery = encodeURIComponent(query);
            const nedApiUrl = `https://vo.ned.ipac.caltech.edu/services/sia?TARGET=${encodedQuery}`;
            
            // Use a proxy to avoid CORS issues
            const imageProxyUrl = `/proxy-download/?url=${encodeURIComponent(nedApiUrl)}`;
            
            // Fetch image results
            return apiFetch(imageProxyUrl)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! Status: ${response.status}`);
                    }
                    return response.text();
                })
                .then(data => {
                    if (loadingIndicator) loadingIndicator.style.display = 'none';
                    
                    // Process XML response
                    const parser = new DOMParser();
                    const xmlDoc = parser.parseFromString(data, "text/xml");
                    
                    // Check for error messages
                    const errorMsg = xmlDoc.querySelector('INFO[name="QUERY_STATUS"][value="ERROR"]');
                    if (errorMsg) {
                        showNotification(`NED Error: ${errorMsg.textContent.trim()}`, 3000, 'error');
                        return;
                    }
                    
                    // Add enhanced filter controls
                    const filterContainer = document.createElement('div');
                    filterContainer.style.marginBottom = '15px';
                    filterContainer.style.display = 'grid';
                    filterContainer.style.gridTemplateColumns = '1fr 1fr';
                    filterContainer.style.gap = '10px';
                    
                    // Create facility filter dropdown
                    const facilityFilter = document.createElement('select');
                    facilityFilter.id = 'facility-filter';
                    facilityFilter.style.padding = '8px';
                    facilityFilter.style.backgroundColor = '#333';
                    facilityFilter.style.color = 'white';
                    facilityFilter.style.border = '1px solid #555';
                    facilityFilter.style.borderRadius = '4px';
                    
                    // Add "All Facilities" option
                    const allOption = document.createElement('option');
                    allOption.value = '';
                    allOption.textContent = 'All Facilities';
                    facilityFilter.appendChild(allOption);
                    
                    // Create search box for filtering results
                    const searchFilter = document.createElement('input');
                    searchFilter.type = 'text';
                    searchFilter.id = 'results-search';
                    searchFilter.placeholder = 'Search in results...';
                    searchFilter.style.padding = '8px';
                    searchFilter.style.backgroundColor = '#333';
                    searchFilter.style.color = 'white';
                    searchFilter.style.border = '1px solid #555';
                    searchFilter.style.borderRadius = '4px';
                    
                    // Create wavelength range filter
                    const wavelengthFilter = document.createElement('select');
                    wavelengthFilter.id = 'wavelength-filter';
                    wavelengthFilter.style.padding = '8px';
                    wavelengthFilter.style.backgroundColor = '#333';
                    wavelengthFilter.style.color = 'white';
                    wavelengthFilter.style.border = '1px solid #555';
                    wavelengthFilter.style.borderRadius = '4px';
                    
                    const allWavelengthOption = document.createElement('option');
                    allWavelengthOption.value = '';
                    allWavelengthOption.textContent = 'All Wavelengths';
                    wavelengthFilter.appendChild(allWavelengthOption);
                    
                    // Create resolution filter
                    const resolutionFilter = document.createElement('select');
                    resolutionFilter.id = 'resolution-filter';
                    resolutionFilter.style.padding = '8px';
                    resolutionFilter.style.backgroundColor = '#333';
                    resolutionFilter.style.color = 'white';
                    resolutionFilter.style.border = '1px solid #555';
                    resolutionFilter.style.borderRadius = '4px';
                    
                    const allResolutionOption = document.createElement('option');
                    allResolutionOption.value = '';
                    allResolutionOption.textContent = 'All Resolutions';
                    resolutionFilter.appendChild(allResolutionOption);
                    
                    filterContainer.appendChild(facilityFilter);
                    filterContainer.appendChild(searchFilter);
                    filterContainer.appendChild(wavelengthFilter);
                    filterContainer.appendChild(resolutionFilter);
                    resultsList.appendChild(filterContainer);
                    
                    // Process the VOTable results
                    const rows = xmlDoc.getElementsByTagName('TR');
                    if (!rows || rows.length === 0) {
                        resultsList.innerHTML += '<p style="color: #aaa; text-align: center;">No images found</p>';
                        return;
                    }
                    
                    // Store all unique values for filters
                    const facilities = new Set();
                    const wavelengthRanges = new Set();
                    const resolutionRanges = new Set();
                    
                    // Helper function to format wavelength for display
                    function formatWavelength(wavelengthInMeters) {
                        if (!wavelengthInMeters || wavelengthInMeters === '') return 'Unknown';
                        const wl = parseFloat(wavelengthInMeters);
                        if (isNaN(wl)) return 'Unknown';
                        
                        if (wl < 1e-9) return `${(wl * 1e12).toFixed(1)} pm`;  // picometers
                        if (wl < 1e-6) return `${(wl * 1e9).toFixed(1)} nm`;   // nanometers
                        if (wl < 1e-3) return `${(wl * 1e6).toFixed(1)} μm`;   // micrometers
                        if (wl < 1) return `${(wl * 1e3).toFixed(1)} mm`;      // millimeters
                        return `${wl.toFixed(3)} m`;                           // meters
                    }
                    
                    // Helper function to categorize wavelength
                    function categorizeWavelength(wavelengthInMeters) {
                        if (!wavelengthInMeters || wavelengthInMeters === '') return 'Unknown';
                        const wl = parseFloat(wavelengthInMeters);
                        if (isNaN(wl)) return 'Unknown';
                        
                        if (wl < 10e-9) return 'X-ray';
                        if (wl < 400e-9) return 'UV';
                        if (wl < 700e-9) return 'Visible';
                        if (wl < 25e-6) return 'Near-IR';
                        if (wl < 350e-6) return 'Mid-IR';
                        if (wl < 1e-3) return 'Far-IR';
                        if (wl < 1e-2) return 'Sub-mm';
                        return 'Radio';
                    }
                    
                    // Helper function to categorize resolution
                    function categorizeResolution(resolutionInArcsec) {
                        if (!resolutionInArcsec || resolutionInArcsec === '') return 'Unknown';
                        const res = parseFloat(resolutionInArcsec);
                        if (isNaN(res)) return 'Unknown';
                        
                        if (res < 0.1) return 'Ultra-high (< 0.1")';
                        if (res < 1) return 'High (0.1" - 1")';
                        if (res < 10) return 'Medium (1" - 10")';
                        if (res < 60) return 'Low (10" - 60")';
                        return 'Very Low (> 60")';
                    }
                    
                    // Helper function to format file size
                    function formatFileSize(sizeInKb) {
                        if (!sizeInKb || sizeInKb === '') return 'Unknown';
                        const size = parseFloat(sizeInKb);
                        if (isNaN(size)) return 'Unknown';
                        
                        if (size < 1024) return `${size.toFixed(0)} KB`;
                        if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} MB`;
                        return `${(size / (1024 * 1024)).toFixed(1)} GB`;
                    }
                    
                    // Helper function to format coordinates
                    function formatCoordinate(coord, isRA = false) {
                        if (!coord || coord === '') return 'Unknown';
                        const c = parseFloat(coord);
                        if (isNaN(c)) return 'Unknown';
                        
                        if (isRA) {
                            // Convert RA degrees to hours:minutes:seconds
                            const hours = c / 15;
                            const h = Math.floor(hours);
                            const m = Math.floor((hours - h) * 60);
                            const s = ((hours - h) * 60 - m) * 60;
                            return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
                        } else {
                            // Convert Dec degrees to degrees:arcminutes:arcseconds
                            const sign = c >= 0 ? '+' : '-';
                            const absC = Math.abs(c);
                            const d = Math.floor(absC);
                            const m = Math.floor((absC - d) * 60);
                            const s = ((absC - d) * 60 - m) * 60;
                            return `${sign}${d.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toFixed(0).padStart(2, '0')}`;
                        }
                    }
                    
                    // Helper function to format FOV
                    function formatFOV(fovInDegrees) {
                        if (!fovInDegrees || fovInDegrees === '') return 'Unknown';
                        const fov = parseFloat(fovInDegrees);
                        if (isNaN(fov)) return 'Unknown';
                        
                        if (fov < 1/3600) return `${(fov * 3600 * 1000).toFixed(1)} mas`;  // milliarcseconds
                        if (fov < 1/60) return `${(fov * 3600).toFixed(1)}"`;             // arcseconds
                        if (fov < 1) return `${(fov * 60).toFixed(1)}'`;                  // arcminutes
                        return `${fov.toFixed(3)}°`;                                      // degrees
                    }
                    
                    // Process each row to collect filter data
                    Array.from(rows).forEach(row => {
                        const cells = row.getElementsByTagName('TD');
                        if (cells.length >= 30) {
                            const facility = cells[4]?.textContent || 'Unknown';
                            const wavelength = cells[26]?.textContent || '';
                            const resolution = cells[17]?.textContent || '';
                            
                            facilities.add(facility);
                            wavelengthRanges.add(categorizeWavelength(wavelength));
                            resolutionRanges.add(categorizeResolution(resolution));
                        }
                    });
                    
                    // Add facilities to dropdown
                    Array.from(facilities).sort().forEach(facility => {
                        const option = document.createElement('option');
                        option.value = facility;
                        option.textContent = facility;
                        facilityFilter.appendChild(option);
                    });
                    
                    // Add wavelength ranges to dropdown
                    Array.from(wavelengthRanges).sort().forEach(range => {
                        const option = document.createElement('option');
                        option.value = range;
                        option.textContent = range;
                        wavelengthFilter.appendChild(option);
                    });
                    
                    // Add resolution ranges to dropdown
                    Array.from(resolutionRanges).sort().forEach(range => {
                        const option = document.createElement('option');
                        option.value = range;
                        option.textContent = range;
                        resolutionFilter.appendChild(option);
                    });
                    
                    // Function to filter and display results with comprehensive details
                    function filterAndDisplayResults() {
                        const selectedFacility = facilityFilter.value;
                        const selectedWavelength = wavelengthFilter.value;
                        const selectedResolution = resolutionFilter.value;
                        const searchTerm = (searchFilter.value || '').toLowerCase().trim();
                        
                        // Clear current display (except target info and filters)
                        const existingResults = resultsList.querySelectorAll('.ned-result-item');
                        existingResults.forEach(result => result.remove());
                        
                        let resultCount = 0;
                        
                        // Process each row with comprehensive details
                        Array.from(rows).forEach((row, index) => {
                            const cells = row.getElementsByTagName('TD');
                            if (cells.length >= 30) {
                                // Extract all available data based on your VOTable structure
                                const dataProductType = cells[0]?.textContent || 'Unknown';
                                const calibLevel = cells[1]?.textContent || 'Unknown';
                                const obsCollection = cells[2]?.textContent || 'Unknown';
                                const obsId = cells[3]?.textContent || '';
                                const facilityName = cells[4]?.textContent || 'Unknown';
                                const instrumentName = cells[5]?.textContent || 'Unknown';
                                const obsImageId = cells[6]?.textContent || '';
                                const accessUrl = cells[7]?.textContent || '';
                                const accessFormat = cells[8]?.textContent || 'Unknown';
                                const accessEstSize = cells[9]?.textContent || '';
                                const targetName = cells[10]?.textContent || 'Unknown';
                                const sRa = cells[11]?.textContent || '';
                                const sDec = cells[12]?.textContent || '';
                                const sFov = cells[13]?.textContent || '';
                                const sFov1 = cells[14]?.textContent || '';
                                const sFov2 = cells[15]?.textContent || '';
                                const sRegion = cells[16]?.textContent || '';
                                const sResolution = cells[17]?.textContent || '';
                                const sXel1 = cells[18]?.textContent || '';
                                const sXel2 = cells[19]?.textContent || '';
                                const tMin = cells[20]?.textContent || '';
                                const tMax = cells[21]?.textContent || '';
                                const tExptime = cells[22]?.textContent || '';
                                const tResolution = cells[23]?.textContent || '';
                                const emMin = cells[24]?.textContent || '';
                                const emMax = cells[25]?.textContent || '';
                                const emWl = cells[26]?.textContent || '';
                                const emResPower = cells[27]?.textContent || '';
                                const polStates = cells[28]?.textContent || '';
                                const oUcd = cells[29]?.textContent || '';
                                const obsPublisherDid = cells[30]?.textContent || '';
                                
                                // Apply filters
                                const wavelengthCategory = categorizeWavelength(emWl);
                                const resolutionCategory = categorizeResolution(sResolution);
                                
                                if (selectedFacility && facilityName !== selectedFacility) return;
                                if (selectedWavelength && wavelengthCategory !== selectedWavelength) return;
                                if (selectedResolution && resolutionCategory !== selectedResolution) return;
                                if (searchTerm) {
                                    const haystack = [
                                        targetName, facilityName, instrumentName, obsId, obsCollection,
                                        (sRa||''), (sDec||''), (oUcd||''), (obsPublisherDid||''),
                                        dataProductType, calibLevel, accessFormat,
                                        (sResolution||''), wavelengthCategory, (emWl||''),
                                        (accessEstSize||''), (tExptime||''), (sFov||''), (sFov1||''), (sFov2||'')
                                    ].join(' ').toLowerCase();
                                    if (!haystack.includes(searchTerm)) return;
                                }
                                
                                resultCount++;
                                
                                // Create comprehensive result item
                                const resultItem = document.createElement('div');
                                resultItem.className = 'ned-result-item';
                                resultItem.style.padding = '15px';
                                resultItem.style.marginBottom = '10px';
                                resultItem.style.backgroundColor = '#333';
                                resultItem.style.borderRadius = '6px';
                                resultItem.style.cursor = 'pointer';
                                resultItem.style.transition = 'all 0.2s ease';
                                resultItem.style.border = '1px solid #444';
                                
                                // Store image URL
                                resultItem.dataset.url = accessUrl;
                                
                                // Enhanced hover effect
                                resultItem.addEventListener('mouseover', function() {
                                    this.style.backgroundColor = '#3a3a3a';
                                    this.style.borderColor = '#2196F3';
                                    this.style.transform = 'translateY(-2px)';
                                    this.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)';
                                });
                                
                                resultItem.addEventListener('mouseout', function() {
                                    this.style.backgroundColor = '#333';
                                    this.style.borderColor = '#444';
                                    this.style.transform = 'translateY(0)';
                                    this.style.boxShadow = 'none';
                                });
                                
                                // Add click handler to download image
                                resultItem.addEventListener('click', function() {
                                    downloadAndLoadFitsFromUrl(this.dataset.url);
                                    hideFileBrowser();
                                });
                                
                                // Create comprehensive layout
                                resultItem.innerHTML = `
                                <div style="display: grid; gap: 15px;">
                                    <!-- Main Content -->
                                    <div>
                                        <div style="font-weight: bold; color: #fff; font-size: 18px; margin-bottom: 8px;">
                                            ${targetName} 
                                            <span style="font-size: 14px; color: #aaa; font-weight: normal;">(${dataProductType})</span>
                                        </div>
                                        
                                        <!-- Observatory & Instrument -->
                                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 8px;">
                                            <div>
                                                <div style="color: #2196F3; font-size: 12px; font-weight: bold;">FACILITY</div>
                                                <div style="color: #fff; font-size: 14px;">${facilityName}</div>
                                            </div>
                                        </div>
                                        
                                        <!-- Observation Details -->
                                        <div style="display: grid; grid-template-columns: auto; gap: 10px; margin-bottom: 8px;">
                                            <div>
                                                <div style="color: #4CAF50; font-size: 12px; font-weight: bold;">WAVELENGTH</div>
                                                <div style="color: #fff; font-size: 14px;">${formatWavelength(emWl)}</div>
                                                <div style="color: #aaa; font-size: 12px;">${wavelengthCategory}</div>
                                            </div>
                                            <div>
                                                <div style="color: #4CAF50; font-size: 12px; font-weight: bold;">RESOLUTION</div>
                                                <div style="color: #fff; font-size: 14px;">${sResolution ? parseFloat(sResolution).toFixed(2) + '"' : 'Unknown'}</div>
                                                <div style="color: #aaa; font-size: 12px;">${resolutionCategory}</div>
                                            </div>
                                            <div>
                                                <div style="color: #4CAF50; font-size: 12px; font-weight: bold;">FIELD OF VIEW</div>
                                                <div style="color: #fff; font-size: 14px;">${formatFOV(sFov)}</div>
                                                <div style="color: #aaa; font-size: 12px;">${sFov1 && sFov2 ? (parseFloat(sFov1).toFixed(1) + "' × " + parseFloat(sFov2).toFixed(1) + "'") : ''}</div>
                                            </div>
                                        </div>
                                        
                                        <!-- Position & Dimensions -->
                                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 8px;">
                                            <div>
                                                <div style="color: #FF9800; font-size: 12px; font-weight: bold;">POSITION (J2000)</div>
                                                <div style="color: #fff; font-size: 13px; font-family: monospace;">
                                                    RA: ${formatCoordinate(sRa, true)}<br>
                                                    Dec: ${formatCoordinate(sDec, false)}
                                                </div>
                                            </div>
                                            <div>
                                                <div style="color: #FF9800; font-size: 12px; font-weight: bold;">DIMENSIONS</div>
                                                <div style="color: #fff; font-size: 14px;">${sXel1 && sXel2 ? (sXel1 + ' × ' + sXel2 + ' pixels') : 'Unknown'}</div>
                                            </div>
                                            <div>
                                                <div style="color: #FF9800; font-size: 12px; font-weight: bold;">FILE SIZE</div>
                                                <div style="color: #fff; font-size: 14px;">${formatFileSize(accessEstSize)}</div>
                                            </div>
                                        </div>
                                        
                                        <!-- Observation Metadata -->
                                        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #444;">
                                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                                                <div>
                                                    <div style="color: #9C27B0; font-size: 12px; font-weight: bold;">REFERENCE</div>
                                                    <div style="color: #aaa; font-size: 13px; font-family: monospace;">${obsId}</div>
                                                </div>
                            
                                            </div>
                                            ${tExptime ? `
                                            <div style="margin-top: 4px;">
                                                <span style="color: #9C27B0; font-size: 12px; font-weight: bold;">EXPOSURE TIME: </span>
                                                <span style="color: #aaa; font-size: 13px;">${parseFloat(tExptime).toFixed(0)} seconds</span>
                                            </div>
                                            ` : ''}
                                            ${polStates ? `
                                            <div style="margin-top: 4px;">
                                                <span style="color: #9C27B0; font-size: 12px; font-weight: bold;">POLARIZATION: </span>
                                                <span style="color: #aaa; font-size: 13px;">${polStates}</span>
                                            </div>
                                            ` : ''}
                                        </div>
                                    </div>
                                    
                                </div>
                            `;
                                
                                resultsList.appendChild(resultItem);
                            }
                        });
                        
                        // Update results count
                        const resultsHeading = document.getElementById('ned-results-heading');
                        if (resultsHeading) {
                            resultsHeading.textContent = `Found ${resultCount} images`;
                        }
                        
                        // Show "no results" message if needed
                        if (resultCount === 0) {
                            const noResults = document.createElement('div');
                            noResults.className = 'ned-result-item';
                            noResults.style.textAlign = 'center';
                            noResults.style.padding = '20px';
                            noResults.style.color = '#aaa';
                            noResults.style.backgroundColor = '#2a2a2a';
                            noResults.style.borderRadius = '4px';
                            noResults.style.border = '1px dashed #555';
                            noResults.innerHTML = `
                                <div style="font-size: 14px; margin-bottom: 8px;">No images match your current filters</div>
                                <div style="font-size: 12px;">Try adjusting the facility, wavelength, or resolution filters</div>
                            `;
                            resultsList.appendChild(noResults);
                        }
                    }
                    
                    // Add event listeners for all filters
                    facilityFilter.addEventListener('change', filterAndDisplayResults);
                    wavelengthFilter.addEventListener('change', filterAndDisplayResults);
                    resolutionFilter.addEventListener('change', filterAndDisplayResults);
                    
                    // Search box: update immediately and also debounce bursts
                    const debouncedFilter = debounce(filterAndDisplayResults, 150);
                    searchFilter.addEventListener('input', filterAndDisplayResults);
                    searchFilter.addEventListener('keyup', debouncedFilter);
                    searchFilter.addEventListener('change', filterAndDisplayResults);
                    searchFilter.addEventListener('search', filterAndDisplayResults);
                    
                    // Initial display of all results
                    filterAndDisplayResults();
                });
        } else {
            if (loadingIndicator) loadingIndicator.style.display = 'none';
        }
    })
    .catch(error => {
        console.error('Error fetching from NED:', error);
        
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        
        // Show results container with error message
        if (resultsContainer) resultsContainer.style.display = 'block';
        const resultsList = document.getElementById('ned-results-list');
        if (resultsList) {
            resultsList.innerHTML = `
                <div style="padding: 20px; text-align: center; color: #f44336; background: rgba(244, 67, 54, 0.1); border-radius: 4px; border: 1px solid #f44336;">
                    <div style="font-size: 16px; font-weight: bold; margin-bottom: 8px;">Search Error</div>
                    <div style="font-size: 14px; margin-bottom: 12px;">${error.message}</div>
                    <div style="font-size: 12px; color: #aaa;">
                        This could be due to network issues, server problems, or the object not being found in NED.
                        <br>Please check your connection and try again.
                    </div>
                </div>
            `;
        }
        
        showNotification(`Error searching NED: ${error.message}`, 4000, 'error');
    });
}

// Helper function to add CSS animation for the spinner
function addSpinnerCSS() {
    if (!document.getElementById('spinner-styles')) {
        const style = document.createElement('style');
        style.id = 'spinner-styles';
        style.textContent = `
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            
            .ned-result-item {
                transition: all 0.2s ease !important;
            }
            
            .ned-result-item:hover {
                transform: translateY(-2px) !important;
                box-shadow: 0 4px 12px rgba(33, 150, 243, 0.2) !important;
            }
        `;
        document.head.appendChild(style);
    }
}

// Call this when the page loads
document.addEventListener('DOMContentLoaded', addSpinnerCSS);

// Download a FITS file from a URL and load it
function downloadAndLoadFits(url) {
    // This function will now use the same implementation as downloadAndLoadFitsFromUrl
    // to ensure consistent behavior with the progress bar.
    downloadAndLoadFitsFromUrl(url);
}


// Direct download method with CORS fix
function downloadAndLoadFitsDirect(url) {
    // Create a unique filename based on the URL
    const filename = url.split('/').pop() || 'downloaded_file.fits';
    
    showNotification(true, 'Downloading FITS file...');
    
    // ALWAYS use the server-side proxy to avoid CORS issues
    apiFetch(`/proxy-download/?url=${encodeURIComponent(url)}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Download failed: ${response.status} ${response.statusText}`);
            }
            return response.arrayBuffer();
        })
        .then(arrayBuffer => {
            // Show processing message
            showNotification(true, 'Processing downloaded file...');
            
            // Send the file to the server
            return uploadFitsToServer(arrayBuffer, filename);
        })
        .then(serverFilePath => {
            // Load the file that's now on the server
            return loadFitsFile(serverFilePath);
        })
        .catch(error => {
            console.error('Error downloading or loading FITS file:', error);
            showNotification(false);
            showNotification(`Error: ${error.message}. Check your server logs for details.`, 5000, 'error');
        });
}

// Download a FITS file from a URL and load it - all downloads go through proxy
function downloadAndLoadFits(url) {
    // Create a unique filename based on the URL
    const filename = url.split('/').pop() || 'downloaded_file.fits';
    
    // Always use the proxy for ALL external files to avoid CORS issues
    showNotification(true, 'Downloading via proxy...');
    
    // Use the server's proxy-download endpoint for all files
    apiFetch(`/proxy-download/?url=${encodeURIComponent(url)}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Proxy download failed: ${response.status} ${response.statusText}`);
            }
            return response.arrayBuffer();
        })
        .then(arrayBuffer => {
            // Show processing message
            showNotification(true, 'Processing downloaded file...');
            
            // Send the file to the server
            return uploadFitsToServer(arrayBuffer, filename);
        })
        .then(serverFilePath => {
            // Load the file that's now on the server
            return loadFitsFile(serverFilePath);
        })
        .catch(error => {
            console.error('Error in proxy download:', error);
            showNotification(false);
            showNotification(`Download error: ${error.message}`, 5000, 'error');
        });
}


async function retrieveNedImages(objectName, ra, dec) {
    console.log(`Retrieving images for ${objectName} at RA=${ra}, Dec=${dec}`);
    const resultsContainer = document.getElementById('ned-image-results');
    resultsContainer.innerHTML = 'Searching for FITS images... <div class="spinner"></div>';

    try {
        const encodedUrl = encodeURIComponent(`http://ned.ipac.caltech.edu/cgi-bin/imgdata?objname=${encodeURIComponent(objectName)}`);
        const response = await apiFetch(`/proxy-download/?url=${encodedUrl}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const html = await response.text();
        const imageLinks = extractImageLinksFromHtml(html);

        if (imageLinks.length > 0) {
            let listHtml = '<ul>';
            imageLinks.forEach(link => {
                // Use the proxy for the download link as well
                const downloadUrl = `/proxy-download/?url=${encodeURIComponent(link.href)}`;
                listHtml += `<li>
                    <span class="ned-link-text">${link.text}</span>
                    <button class="small-button" onclick="downloadAndLoadFitsFromUrl('${downloadUrl}')">Display</button>
                </li>`;
            });
            listHtml += '</ul>';
            resultsContainer.innerHTML = listHtml;
        } else {
            resultsContainer.textContent = 'No FITS images found for this object.';
        }
    } catch (error) {
        console.error('Error retrieving NED images:', error);
        resultsContainer.textContent = 'Failed to retrieve image list. See console for details.';
    }
}

function extractImageLinksFromHtml(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const links = [];

    // This selector is based on the known structure of the NED results page from the working backup.
    // It looks for a table with a specific width and then finds the 'Retrieve' links inside.
    const dataRows = doc.querySelectorAll('table[width="95%"] tr');

    dataRows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length > 5) {
            const linkCell = cells[5];
            const anchor = linkCell.querySelector('a[href*=".fits"]');
            
            if (anchor && anchor.textContent.trim() === 'Retrieve') {
                const descriptionCell = cells[1];
                let description = descriptionCell.textContent.trim();
                
                if (!description) {
                    const objectNameCell = cells[0];
                    description = objectNameCell.textContent.trim();
                }

                links.push({
                    text: description,
                    href: anchor.href
                });
            }
        }
    });
    
    if (links.length === 0) {
        console.warn("Could not extract any FITS links. The HTML structure from NED might have changed or the page content was unexpected.");
    }

    return links;
}
// =================================================================
// 6. APP INITIALIZATION & TOOLBAR
// =================================================================

function addFileBrowserButton() {
    const fileBrowserButton = document.createElement('button');
    fileBrowserButton.className = 'file-browser-button';
    fileBrowserButton.title = 'Browse Files';
    
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.style.fill = "currentColor";
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", "M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z");
    svg.appendChild(path);
    
    fileBrowserButton.appendChild(svg);
    fileBrowserButton.addEventListener('click', () => showFileBrowser());
    
    const toolbar = document.querySelector('.toolbar');
    if (toolbar) {
        // Insert the file browser button at the beginning of the toolbar
        toolbar.insertBefore(fileBrowserButton, toolbar.firstChild);

        // Ensure the custom button container exists before adding the peak finder button
        let customButtonContainer = document.getElementById('custom-button-container');
        if (!customButtonContainer) {
            customButtonContainer = document.createElement('div');
            customButtonContainer.id = 'custom-button-container';
            // Add it to the main toolbar. Other buttons are added relative to each other,
            // so appending it is a safe default.
            toolbar.appendChild(customButtonContainer);
        }

        // Now that the toolbar is confirmed to exist, add the peak finder button
        if (typeof window.addPeakFinderButton === 'function') {
            console.log("Calling addPeakFinderButton from files.js");
            // window.addPeakFinderButton();
        } else {
            console.warn("addPeakFinderButton function not found when trying to add it to the toolbar.");
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    addFileBrowserButton();
    setTimeout(() => {
        showFileBrowser();
        showNotification('Please select a FITS file to open', 1000);
    }, 500);
});

// NOTE: Other functions like loadFitsFile, checkFileSize, getFitsHduInfo, etc.
// should be placed here, as they are not part of the file browser's structural setup.
// I am omitting them here for brevity, but they should be included in your final file.

// Helper function to update the progress circle
function updateProgressCircle(percent, receivedLength, totalLength, startTime) {
    const progressContainer = document.getElementById('download-progress-container');
    const progressCircle = document.getElementById('progress-circle-fg');
    const progressText = document.getElementById('progress-text');

    if (!progressContainer || !progressCircle || !progressText) {
        console.log('Progress bar elements not found. Skipping update.');
        return;
    }

    if (percent === null) {
        progressContainer.style.display = 'none';
        return;
    }

    const radius = progressCircle.r.baseVal.value;
    const circumference = 2 * Math.PI * radius;
    progressCircle.style.strokeDasharray = `${circumference} ${circumference}`;

    if (percent === 0) {
        progressCircle.style.strokeDashoffset = circumference;
        progressText.innerHTML = '0%<br>0 MB';
        progressContainer.style.display = 'block';
    } else {
        const offset = circumference - (percent / 100) * circumference;
        progressCircle.style.strokeDashoffset = offset;

        const receivedMb = Math.round((receivedLength || 0) / (1024 * 1024));
        const totalMb = Math.round((totalLength || 0) / (1024 * 1024));
        
        const elapsedSeconds = (Date.now() - startTime) / 1000;
        const speedBps = elapsedSeconds > 0 ? receivedLength / elapsedSeconds : 0;
        const speedMbps = (speedBps * 8 / (1024 * 1024)).toFixed(0);

        const sizeLine = totalLength && totalLength > 0 ? `${receivedMb} / ${totalMb} MB` : `${receivedMb} MB`;
        progressText.innerHTML = `${percent}%<br>${sizeLine}<br>${speedMbps} Mbps`;
    }
}

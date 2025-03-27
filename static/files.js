// Create file browser container with enhanced tabbed interface
function createFileBrowserContainer() {
    // Check if container already exists
    if (document.getElementById('file-browser-container')) {
        return;
    }
    
    // Create container
    const fileBrowserContainer = document.createElement('div');
    fileBrowserContainer.id = 'file-browser-container';
    fileBrowserContainer.style.position = 'fixed';
    fileBrowserContainer.style.top = '0';
    fileBrowserContainer.style.right = '-400px'; // Start off-screen
    fileBrowserContainer.style.width = '400px';
    fileBrowserContainer.style.height = '100vh';
    fileBrowserContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
    fileBrowserContainer.style.color = 'white';
    fileBrowserContainer.style.padding = '0';
    fileBrowserContainer.style.boxSizing = 'border-box';
    fileBrowserContainer.style.boxShadow = '-2px 0 10px rgba(0, 0, 0, 0.5)';
    fileBrowserContainer.style.zIndex = '1000';
    fileBrowserContainer.style.transition = 'transform 0.3s ease-in-out';
    fileBrowserContainer.style.overflowY = 'auto';
    fileBrowserContainer.style.fontFamily = 'Raleway, Arial, sans-serif';
    
    // Create header
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.padding = '15px 20px';
    header.style.borderBottom = '1px solid rgba(255, 255, 255, 0.1)';
    header.style.backgroundColor = 'rgba(0, 0, 0, 1)';
    header.style.position = 'sticky';
    header.style.top = '0';
    header.style.zIndex = '10';
    
    const title = document.createElement('h2');
    title.textContent = 'Available Files';
    title.style.margin = '0';
    title.style.fontSize = '18px';
    title.style.fontWeight = '500';
    
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '&times;';
    closeButton.style.background = 'transparent';
    closeButton.style.border = 'none';
    closeButton.style.color = 'white';
    closeButton.style.fontSize = '24px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.width = '30px';
    closeButton.style.height = '30px';
    closeButton.style.display = 'flex';
    closeButton.style.alignItems = 'center';
    closeButton.style.justifyContent = 'center';
    closeButton.style.borderRadius = '50%';
    closeButton.style.transition = 'background-color 0.2s';
    closeButton.onclick = hideFileBrowser;
    
    // Add hover effects to close button
    closeButton.addEventListener('mouseover', function() {
        this.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
    });
}

// Helper function to create an item element (directory or file)
function createItemElement(item, currentPath) {
    const itemElement = document.createElement('div');
    itemElement.className = 'file-item';
    itemElement.dataset.name = item.name;
    itemElement.dataset.path = item.path;
    itemElement.dataset.type = item.type;
    itemElement.style.padding = '8px';
    itemElement.style.borderRadius = '4px';
    itemElement.style.backgroundColor = '#333';
    itemElement.style.cursor = 'pointer';
    itemElement.style.transition = 'background-color 0.2s, opacity 0.3s, transform 0.2s';
    itemElement.style.display = 'flex'; // Use flexbox for better alignment
    itemElement.style.alignItems = 'center'; // Center items vertically
    
    // Set color based on item type
    itemElement.style.borderLeft = '3px solid';
    
    if (item.type === 'directory') {
        // Use yellow for directories
        itemElement.style.borderLeftColor = '#FFC107';
    } else {
        // Use blue for FITS files
        itemElement.style.borderLeftColor = '#2196F3';
    }
    
    // Create item icon based on type
    const icon = document.createElement('div');
    icon.className = 'item-icon';
    icon.style.marginRight = '8px';
    icon.style.width = '20px';
    icon.style.height = '20px'; // Give fixed height to stabilize layout
    icon.style.display = 'flex'; // Use flexbox for icon content
    icon.style.alignItems = 'center'; // Center icon vertically
    icon.style.justifyContent = 'center'; // Center icon horizontally
    
    if (item.type === 'directory') {
        // Folder icon
        icon.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="#FFC107"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"></path></svg>';
    } else {
        // File icon
        icon.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="#2196F3"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"></path></svg>';
    }
    
    // Create content container for text
    const contentContainer = document.createElement('div');
    contentContainer.style.display = 'flex';
    contentContainer.style.flexDirection = 'column';
    contentContainer.style.justifyContent = 'center';
    contentContainer.style.flexGrow = '1';
    
    // Item name
    const nameElement = document.createElement('div');
    nameElement.className = 'file-name';
    nameElement.textContent = item.name;
    nameElement.style.fontWeight = 'bold';
    
    // Add name to content container
    contentContainer.appendChild(nameElement);
    
    // For files, also add size information
    if (item.type === 'file' && item.size) {
        const sizeElement = document.createElement('div');
        sizeElement.className = 'file-size';
        sizeElement.textContent = formatFileSize(item.size);
        sizeElement.style.fontSize = '12px';
        sizeElement.style.color = '#aaa';
        sizeElement.style.marginTop = '4px';
        
        // Add size to content container
        contentContainer.appendChild(sizeElement);
    }
    
    // Add elements to the item
    itemElement.appendChild(icon);
    itemElement.appendChild(contentContainer);
    
    // Hover effects
    itemElement.addEventListener('mouseover', function() {
        this.style.backgroundColor = '#444';
        this.style.transform = 'translateY(-2px)';
    });
    
    itemElement.addEventListener('mouseout', function() {
        this.style.backgroundColor = '#333';
        this.style.transform = 'translateY(0)';
    });
    
    // Add a subtle animation on load
    itemElement.style.opacity = '0';
    itemElement.style.transform = 'translateY(10px)';
    
    // Click handling based on item type
    itemElement.addEventListener('click', function() {
        if (item.type === 'directory') {
            // Navigate to directory
            loadFilesList(item.path);
        } else {
            // Load the file
            loadFitsFile(item.path);
            hideFileBrowser();
        }
    });
    
    return itemElement;
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
    
    showProgress(true, `Loading ${filepath}...`);
    
    // First set the active file on the server
    fetch(`/load-file/${encodeURIComponent(filepath)}`)
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
                    const useFastLoading = fileSize > 100 * 1024 * 1024;
                    
                    if (useFastLoading) {
                        console.log(`Large file detected (${formatFileSize(fileSize)}). Using fast loading.`);
                        
                        // Use JSON endpoint for fast loading mode
                        return fetch(`/fits-binary/?fast_loading=true`)
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
                                    return fetchBinaryWithProgress('/fits-binary/?fast_loading=false')
                                        .then(arrayBuffer => processBinaryData(arrayBuffer, filepath));
                                }
                            });
                    } else {
                        console.log(`Regular file (${formatFileSize(fileSize)}). Using standard loading.`);
                        // For smaller files, use the regular viewer
                        return fetchBinaryWithProgress('/fits-binary/?fast_loading=false')
                            .then(arrayBuffer => {
                                if (!arrayBuffer) {
                                    throw new Error('Failed to load FITS data');
                                }
                                
                                // Process binary data and initialize viewer
                                // console.time('parseBinaryData');
                                return processBinaryData(arrayBuffer, filepath);
                            });
                    }
                })
                .catch(error => {
                    console.error('Error checking file size:', error);
                    
                    // Fallback to regular processing if size check fails
                    return fetchBinaryWithProgress('/fits-binary/')
                        .then(arrayBuffer => {
                            if (!arrayBuffer) {
                                throw new Error('Failed to load FITS data');
                            }
                            
                            // Process binary data and initialize viewer
                            // console.time('parseBinaryData');
                            return processBinaryData(arrayBuffer, filepath);
                        });
                });
        })
        .catch(error => {
            console.error('Error loading FITS file:', error);
            showProgress(false);
            showNotification(`Error: ${error.message || 'Failed to load FITS file'}`, 5000);
        });
}

// Function to check the file size
function checkFileSize(filepath) {
    return fetch(`/file-size/${encodeURIComponent(filepath)}`)
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
                showProgress(true, `Loading FITS file: ${percentComplete}%`);
                
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

// Download a FITS file from a URL and load it
function downloadAndLoadFits(url) {
    // Create a unique filename based on the URL
    const filename = url.split('/').pop() || 'downloaded_file.fits';
    
    // Check if the URL is an astronomy data source that might have SSL issues
    const isAstronomySource = 
        url.includes('ned.ipac.caltech.edu') || 
        url.includes('irsa.ipac.caltech.edu') || 
        url.includes('archive.stsci.edu') ||
        url.includes('mast.stsci.edu') ||
        url.includes('nvo.stsci.edu') ||
        url.includes('cdsarc.u-strasbg.fr') ||
        url.includes('vizier.u-strasbg.fr') ||
        url.includes('aladin.u-strasbg.fr');
    
    // For astronomy data sources with potential SSL issues, use the server-side proxy
    if (isAstronomySource) {
        console.log('Using server-side proxy for astronomy data source:', url);
        showProgress(true, 'Downloading via proxy...');
        
        // Use the server's proxy-download endpoint to handle SSL verification issues
        fetch(`/proxy-download/?url=${encodeURIComponent(url)}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Proxy download failed: ${response.status} ${response.statusText}`);
                }
                return response.arrayBuffer();
            })
            .then(arrayBuffer => {
                // Show processing message
                showProgress(true, 'Processing downloaded file...');
                
                // Send the file to the server
                return uploadFitsToServer(arrayBuffer, filename);
            })
            .then(serverFilePath => {
                // Load the file that's now on the server
                return loadFitsFile(serverFilePath);
            })
            .catch(error => {
                console.error('Error in proxy download:', error);
                showProgress(false);
                
                // Try without the proxy as a fallback (with user confirmation)
                if (confirm('Secure download failed. Try direct download instead? (This may be less secure but sometimes works for astronomy data)')) {
                    downloadAndLoadFitsDirect(url);
                } else {
                    showNotification(`Error: ${error.message}`, 5000, 'error');
                }
            });
    } else {
        // For regular URLs, use the direct method
        downloadAndLoadFitsDirect(url);
    }
}


// Direct download method with CORS fix
function downloadAndLoadFitsDirect(url) {
    // Create a unique filename based on the URL
    const filename = url.split('/').pop() || 'downloaded_file.fits';
    
    showProgress(true, 'Downloading FITS file...');
    
    // ALWAYS use the server-side proxy to avoid CORS issues
    fetch(`/proxy-download/?url=${encodeURIComponent(url)}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Download failed: ${response.status} ${response.statusText}`);
            }
            return response.arrayBuffer();
        })
        .then(arrayBuffer => {
            // Show processing message
            showProgress(true, 'Processing downloaded file...');
            
            // Send the file to the server
            return uploadFitsToServer(arrayBuffer, filename);
        })
        .then(serverFilePath => {
            // Load the file that's now on the server
            return loadFitsFile(serverFilePath);
        })
        .catch(error => {
            console.error('Error downloading or loading FITS file:', error);
            showProgress(false);
            showNotification(`Error: ${error.message}. Check your server logs for details.`, 5000, 'error');
        });
}

// Download a FITS file from a URL and load it - all downloads go through proxy
function downloadAndLoadFits(url) {
    // Create a unique filename based on the URL
    const filename = url.split('/').pop() || 'downloaded_file.fits';
    
    // Always use the proxy for ALL external files to avoid CORS issues
    showProgress(true, 'Downloading via proxy...');
    
    // Use the server's proxy-download endpoint for all files
    fetch(`/proxy-download/?url=${encodeURIComponent(url)}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Proxy download failed: ${response.status} ${response.statusText}`);
            }
            return response.arrayBuffer();
        })
        .then(arrayBuffer => {
            // Show processing message
            showProgress(true, 'Processing downloaded file...');
            
            // Send the file to the server
            return uploadFitsToServer(arrayBuffer, filename);
        })
        .then(serverFilePath => {
            // Load the file that's now on the server
            return loadFitsFile(serverFilePath);
        })
        .catch(error => {
            console.error('Error in proxy download:', error);
            showProgress(false);
            showNotification(`Download error: ${error.message}`, 5000, 'error');
        });
}


// Upload a FITS file to the server and return the server path
function uploadFitsToServer(fileData, filename) {
    return new Promise((resolve, reject) => {
        // Create a FormData object to send the file
        const formData = new FormData();
        const blob = new Blob([fileData], { type: 'application/octet-stream' });
        formData.append('file', blob, filename);
        
        // Send the file to the server
        fetch('/upload-fits/', {
            method: 'POST',
            body: formData
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.error) {
                throw new Error(data.error);
            }
            
            // Return the server file path
            resolve(data.filepath);
        })
        .catch(error => {
            reject(error);
        });
    });
}

// Load a local FITS file from the user's computer
function loadLocalFitsFile(file) {
    // Show loading progress
    showProgress(true, 'Reading local file...');
    
    const reader = new FileReader();
    
    reader.onload = function(event) {
        // Show processing message
        showProgress(true, 'Processing file...');
        
        // Upload the file to the server
        uploadFitsToServer(event.target.result, file.name)
            .then(serverFilePath => {
                // Load the file that's now on the server
                return loadFitsFile(serverFilePath);
            })
            .catch(error => {
                console.error('Error processing local FITS file:', error);
                showProgress(false);
                showNotification(`Error: ${error.message}`, 5000, 'error');
            });
    };
    
    reader.onerror = function() {
        showProgress(false);
        showNotification('Error reading file', 3000, 'error');
    };
    
    // Read the file as an ArrayBuffer
    reader.readAsArrayBuffer(file);
}






// Create file browser container with enhanced tabbed interface
function createFileBrowserContainer() {
    // Check if container already exists
    if (document.getElementById('file-browser-container')) {
        return;
    }
    
    // Create container
    const fileBrowserContainer = document.createElement('div');
    fileBrowserContainer.id = 'file-browser-container';
    fileBrowserContainer.style.position = 'fixed';
    fileBrowserContainer.style.top = '0';
    fileBrowserContainer.style.right = '-400px'; // Start off-screen
    fileBrowserContainer.style.width = '400px';
    fileBrowserContainer.style.height = '100vh';
    fileBrowserContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
    fileBrowserContainer.style.color = 'white';
    fileBrowserContainer.style.padding = '0';
    fileBrowserContainer.style.boxSizing = 'border-box';
    fileBrowserContainer.style.boxShadow = '-2px 0 10px rgba(0, 0, 0, 0.5)';
    fileBrowserContainer.style.zIndex = '1000';
    fileBrowserContainer.style.transition = 'transform 0.3s ease-in-out';
    fileBrowserContainer.style.overflowY = 'auto';
    fileBrowserContainer.style.fontFamily = 'Raleway, Arial, sans-serif';
    
    // Create header
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.padding = '15px 20px';
    header.style.borderBottom = '1px solid rgba(255, 255, 255, 0.1)';
    header.style.backgroundColor = 'rgba(0, 0, 0, 1)';
    header.style.position = 'sticky';
    header.style.top = '0';
    header.style.zIndex = '10';
    
    const title = document.createElement('h2');
    title.textContent = 'Available Files';
    title.style.margin = '0';
    title.style.fontSize = '18px';
    title.style.fontWeight = '500';
    
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '&times;';
    closeButton.style.background = 'transparent';
    closeButton.style.border = 'none';
    closeButton.style.color = 'white';
    closeButton.style.fontSize = '24px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.width = '30px';
    closeButton.style.height = '30px';
    closeButton.style.display = 'flex';
    closeButton.style.alignItems = 'center';
    closeButton.style.justifyContent = 'center';
    closeButton.style.borderRadius = '50%';
    closeButton.style.transition = 'background-color 0.2s';
    closeButton.onclick = hideFileBrowser;
    
    // Add hover effects to close button
    closeButton.addEventListener('mouseover', function() {
        this.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
    });
    
    closeButton.addEventListener('mouseout', function() {
        this.style.backgroundColor = 'transparent';
    });
    
    header.appendChild(title);
    header.appendChild(closeButton);
    fileBrowserContainer.appendChild(header);
    
    // Create content container
    const content = document.createElement('div');
    content.id = 'file-browser-content';
    content.style.padding = '0';
    fileBrowserContainer.appendChild(content);
    
    // Add to document
    document.body.appendChild(fileBrowserContainer);
    
    // Initialize current path as empty (root directory)
    fileBrowserContainer.dataset.currentPath = '';
    
    // Create tab interface inside the content
    createTabInterface(content);
}

// Add file browser button to the toolbar
function addFileBrowserButton() {
    // Create a button for the file browser
    const fileBrowserButton = document.createElement('button');
    fileBrowserButton.className = 'file-browser-button';
    fileBrowserButton.title = 'Browse Files';
    
    // Create folder icon using SVG
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.style.fill = "currentColor";
    // Create folder icon
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", "M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z");
    svg.appendChild(path);
    
    fileBrowserButton.appendChild(svg);
    
    // Add event listener
    fileBrowserButton.addEventListener('click', showFileBrowser);
    
    // Find the toolbar
    const toolbar = document.querySelector('.toolbar');
    if (toolbar) {
        // Insert the file browser button at the beginning of the toolbar
        toolbar.insertBefore(fileBrowserButton, toolbar.firstChild);
    }
}

// Initialize the file browser
document.addEventListener('DOMContentLoaded', function() {
    // Add the file browser button
    addFileBrowserButton();
    
    // Show the file browser immediately on launch
    setTimeout(function() {
        showFileBrowser();
        
        // Show welcome message
        showNotification('Please select a FITS file to open', 3000);
    }, 500); // Small delay to ensure UI is ready
});



// First, modify the createTabInterface function to include the NED tab
function createTabInterface(contentContainer) {
    // Create tab navigation container
    const tabContainer = document.createElement('div');
    tabContainer.id = 'file-browser-tabs';
    tabContainer.style.display = 'flex';
    tabContainer.style.borderBottom = '1px solid rgba(255, 255, 255, 0.1)';
    
    // Define tabs - add NED tab
    const tabs = [
        { id: 'directory-tab', label: 'Directory', contentId: 'directory-content' },
        { id: 'upload-tab', label: 'Upload', contentId: 'upload-content' },
        { id: 'download-tab', label: 'Download', contentId: 'download-content' },
        { id: 'ned-tab', label: 'NED', contentId: 'ned-content' }  // New NED tab
    ];
    
    // Create tab buttons
    tabs.forEach(tab => {
        const tabButton = document.createElement('button');
        tabButton.id = tab.id;
        tabButton.textContent = tab.label;
        tabButton.className = 'file-browser-tab';
        tabButton.style.padding = '12px 15px';
        tabButton.style.background = 'transparent';
        tabButton.style.border = 'none';
        tabButton.style.borderBottom = '3px solid transparent';
        tabButton.style.color = '#aaa';
        tabButton.style.cursor = 'pointer';
        tabButton.style.fontSize = '14px';
        tabButton.style.fontWeight = 'bold';
        tabButton.style.transition = 'all 0.2s ease';
        tabButton.style.flex = '1';
        tabButton.style.textAlign = 'center';
        
        // Hover effects
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
        
        // Click handler to switch tabs
        tabButton.addEventListener('click', function() {
            switchTab(tab.id);
        });
        
        tabContainer.appendChild(tabButton);
    });
    
    contentContainer.appendChild(tabContainer);
    
    // Create content containers for each tab
    tabs.forEach(tab => {
        const tabContent = document.createElement('div');
        tabContent.id = tab.contentId;
        tabContent.className = 'tab-content';
        tabContent.style.display = 'none';
        tabContent.style.padding = '15px 20px';
        contentContainer.appendChild(tabContent);
    });
    
    // Initialize the directory content
    initializeDirectoryContent();
    
    // Initialize the upload content
    initializeUploadContent();
    
    // Initialize the download content
    initializeDownloadContent();
    
    // Initialize the NED content
    initializeNedContent();
    
    // Set directory tab as active by default
    switchTab('directory-tab');
}



// Initialize NED content tab
function initializeNedContent() {
    const nedContent = document.getElementById('ned-content');
    if (!nedContent) return;
    
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
    resultsContainer.style.display = 'none';
    
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
    spinner.className = 'spinner';
    spinner.style.width = '40px';
    spinner.style.height = '40px';
    spinner.style.border = '4px solid rgba(255, 255, 255, 0.3)';
    spinner.style.borderRadius = '50%';
    spinner.style.borderTop = '4px solid white';
    spinner.style.margin = '0 auto 10px auto';
    spinner.style.animation = 'spin 1s linear infinite';
    
    const loadingText = document.createElement('div');
    loadingText.textContent = 'Searching NED...';
    loadingText.style.color = '#ddd';
    
    loadingIndicator.appendChild(spinner);
    loadingIndicator.appendChild(loadingText);
    
    // Create results list
    const resultsList = document.createElement('div');
    resultsList.id = 'ned-results-list';
    resultsList.style.height = 'calc(100vh - 250px)'; // Full height minus header and search area
    resultsList.style.overflowY = 'auto';
    resultsList.style.backgroundColor = '#222';
    resultsList.style.borderRadius = '4px';
    resultsList.style.padding = '10px';
    resultsList.style.marginTop = '10px';
    
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

// Function to perform NED search
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
    
    // Use a proxy to avoid CORS issues
    const proxyUrl = `/proxy-download/?url=${encodeURIComponent(lookupUrl)}`;
    
    // First get object information
    fetch(proxyUrl)
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
            return fetch(imageProxyUrl)
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
                    
                    // Add filter controls
                    const filterContainer = document.createElement('div');
                    filterContainer.style.marginBottom = '15px';
                    filterContainer.style.display = 'flex';
                    filterContainer.style.gap = '10px';
                    filterContainer.style.alignItems = 'center';
                    
                    // Create facility filter dropdown
                    const facilityFilter = document.createElement('select');
                    facilityFilter.id = 'facility-filter';
                    facilityFilter.style.padding = '8px';
                    facilityFilter.style.backgroundColor = '#333';
                    facilityFilter.style.color = 'white';
                    facilityFilter.style.border = '1px solid #555';
                    facilityFilter.style.borderRadius = '4px';
                    facilityFilter.style.flex = '1';
                    
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
                    searchFilter.style.flex = '1';
                    
                    filterContainer.appendChild(facilityFilter);
                    filterContainer.appendChild(searchFilter);
                    resultsList.appendChild(filterContainer);
                    
                    // Process the VOTable results
                    const rows = xmlDoc.getElementsByTagName('TR');
                    if (!rows || rows.length === 0) {
                        resultsList.innerHTML += '<p style="color: #aaa; text-align: center;">No images found</p>';
                        return;
                    }
                    
                    // Store all facilities for the dropdown
                    const facilities = new Set();
                    
                    // Process each row
                    Array.from(rows).forEach(row => {
                        const cells = row.getElementsByTagName('TD');
                        if (cells.length >= 24) {
                            const facility = cells[4]?.textContent || 'Unknown';
                            facilities.add(facility);
                        }
                    });
                    
                    // Add facilities to dropdown
                    Array.from(facilities).sort().forEach(facility => {
                        const option = document.createElement('option');
                        option.value = facility;
                        option.textContent = facility;
                        facilityFilter.appendChild(option);
                    });
                    
                    // Function to filter and display results with animation
                    function filterAndDisplayResults() {
                        const selectedFacility = facilityFilter.value;
                        const searchTerm = searchFilter.value.toLowerCase();
                        
                        // Clear current display (except target info and filters)
                        const existingResults = resultsList.querySelectorAll('.ned-result-item');
                        existingResults.forEach(result => {
                            // Remove immediately without animation for faster response
                            result.remove();
                        });
                        
                        // Process each row with minimal animation
                        Array.from(rows).forEach((row, index) => {
                            const cells = row.getElementsByTagName('TD');
                            if (cells.length >= 24) {
                                const targetName = cells[10]?.textContent || 'Unknown';
                                const facility = cells[4]?.textContent || 'Unknown';
                                const refCode = cells[3]?.textContent || '';
                                const imageUrl = cells[7]?.textContent || '';
                                const wavelength = cells[19]?.textContent || 'N/A';
                                const resolution = cells[15]?.textContent || 'N/A';
                                const fov = cells[13]?.textContent || 'N/A';
                                
                                // Apply filters - make search more flexible and faster
                                if (selectedFacility && facility !== selectedFacility) return;
                                if (searchTerm && 
                                    !targetName.toLowerCase().includes(searchTerm) && 
                                    !facility.toLowerCase().includes(searchTerm) && 
                                    !refCode.toLowerCase().includes(searchTerm)) return;
                                
                                // Create result item with minimal initial state
                                const resultItem = document.createElement('div');
                                resultItem.className = 'ned-result-item';
                                resultItem.style.padding = '10px';
                                resultItem.style.marginBottom = '8px';
                                resultItem.style.backgroundColor = '#333';
                                resultItem.style.borderRadius = '4px';
                                resultItem.style.cursor = 'pointer';
                                resultItem.style.transition = 'background-color 0.2s';
                                
                                // Store image URL
                                resultItem.dataset.url = imageUrl;
                                
                                // Hover effect with minimal transition
                                resultItem.addEventListener('mouseover', function() {
                                    this.style.backgroundColor = '#444';
                                });
                                
                                resultItem.addEventListener('mouseout', function() {
                                    this.style.backgroundColor = '#333';
                                });
                                
                                // Add click handler to download image
                                resultItem.addEventListener('click', function() {
                                    downloadAndLoadFits(this.dataset.url);
                                    hideFileBrowser(); // Close the file browser after selecting an image
                                });
                                
                                // Format result item content with more details
                                resultItem.innerHTML = `
                                    <div style="font-weight: bold; color: #fff; margin-bottom: 5px;">${targetName}</div>
                                    <div style="color: #aaa; font-size: 12px;">Facility: ${facility}</div>
                                    <div style="color: #aaa; font-size: 12px;">Reference: ${refCode}</div>
                                    <div style="color: #aaa; font-size: 12px;">Wavelength: ${wavelength} m</div>
                                    <div style="color: #aaa; font-size: 12px;">Resolution: ${resolution} arcsec</div>
                                    <div style="color: #aaa; font-size: 12px;">FOV: ${fov} deg</div>
                                    <div style="color: #2196F3; font-size: 12px; margin-top: 5px;">Click to download and view</div>
                                `;
                                
                                resultsList.appendChild(resultItem);
                            }
                        });
                    }
                    
                    // Add event listeners for filters
                    facilityFilter.addEventListener('change', filterAndDisplayResults);
                    searchFilter.addEventListener('input', filterAndDisplayResults);
                    
                    // Initial display of all results
                    filterAndDisplayResults();
                    
                    // Update results heading
                    const resultsHeading = document.getElementById('ned-results-heading');
                    if (resultsHeading) {
                        resultsHeading.textContent = ``;
                    }
                });
        } else {
            if (loadingIndicator) loadingIndicator.style.display = 'none';
        }
    })
    .catch(error => {
        console.error('Error fetching from NED:', error);
        
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        
        showNotification(`Error searching NED: ${error.message}`, 3000, 'error');
    });
}

// Function to retrieve image list for an object
function retrieveNedImages(objectName, ra, dec) {
    // Show loading indicator
    const loadingIndicator = document.getElementById('ned-loading-indicator');
    const imageListContainer = document.getElementById('ned-image-list-container');
    
    if (loadingIndicator) loadingIndicator.style.display = 'block';
    if (imageListContainer) imageListContainer.style.display = 'none';
    
    // Create URL for NED image search
    const nedImageUrl = `https://ned.ipac.caltech.edu/cgi-bin/imglist?objname=${encodeURIComponent(objectName)}&extend=Y&fits_type=fits`;
    
    // Use proxy to avoid CORS issues
    const proxyUrl = `/proxy-download/?url=${encodeURIComponent(nedImageUrl)}`;
    
    // Fetch image list from NED
    fetch(proxyUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.text();
        })
        .then(html => {
            if (loadingIndicator) loadingIndicator.style.display = 'none';
            
            // Extract image links from HTML response (basic parsing)
            const imageLinks = extractImageLinksFromHtml(html);
            
            // Show image list container
            if (imageListContainer) imageListContainer.style.display = 'block';
            
            // Get image list
            const imageList = document.getElementById('ned-image-list');
            if (!imageList) return;
            
            // Clear previous list
            imageList.innerHTML = '';
            
            // Update heading
            const imageListHeading = document.getElementById('ned-image-list-heading');
            if (imageListHeading) {
                imageListHeading.textContent = `Available Images for ${objectName}`;
            }
            
            // Display images
            if (imageLinks.length === 0) {
                imageList.innerHTML = '<p style="color: #aaa; text-align: center;">No FITS images found</p>';
                return;
            }
            
            // Process each image
            imageLinks.forEach(image => {
                // Create image item
                const imageItem = document.createElement('div');
                imageItem.className = 'ned-image-item';
                imageItem.style.padding = '10px';
                imageItem.style.marginBottom = '8px';
                imageItem.style.backgroundColor = '#333';
                imageItem.style.borderRadius = '4px';
                imageItem.style.cursor = 'pointer';
                imageItem.style.transition = 'background-color 0.2s';
                
                // Store image data
                imageItem.dataset.url = image.url;
                imageItem.dataset.name = objectName;
                
                // Hover effect
                imageItem.addEventListener('mouseover', function() {
                    this.style.backgroundColor = '#444';
                });
                
                imageItem.addEventListener('mouseout', function() {
                    this.style.backgroundColor = '#333';
                });
                
                // Add click handler to download image
                imageItem.addEventListener('click', function() {
                    downloadAndLoadFits(this.dataset.url);
                    hideFileBrowser(); // Close the file browser after selecting an image
                });
                
                // Format image item content
                imageItem.innerHTML = `
                    <div style="font-weight: bold; color: #fff; margin-bottom: 5px;">${image.name}</div>
                    <div style="color: #aaa; font-size: 12px;">${image.description}</div>
                    <div style="color: #aaa; font-size: 12px;">Source: ${image.source}</div>
                    <div style="color: #2196F3; font-size: 12px; margin-top: 5px;">Click to download and view</div>
                `;
                
                imageList.appendChild(imageItem);
            });
        })
        .catch(error => {
            console.error('Error retrieving NED images:', error);
            
            if (loadingIndicator) loadingIndicator.style.display = 'none';
            
            showNotification(`Error retrieving images: ${error.message}`, 3000, 'error');
        });
}

// Helper function to extract image links from NED HTML response
function extractImageLinksFromHtml(html) {
    const imageLinks = [];
    
    // Create a temporary DOM element to parse the HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Find all table rows in the document
    const rows = doc.querySelectorAll('tr');
    
    // Process each row to find FITS file links
    rows.forEach(row => {
        // Look for links with FITS extension
        const fitsLinks = row.querySelectorAll('a[href*=".fits"]');
        
        if (fitsLinks.length > 0) {
            // Extract information from the row
            const cells = row.querySelectorAll('td');
            
            // Skip if not enough cells
            if (cells.length < 3) return;
            
            // Extract image description and source
            const description = cells[1]?.textContent?.trim() || 'Unknown image';
            const source = cells[2]?.textContent?.trim() || 'Unknown source';
            
            // Process each FITS link
            fitsLinks.forEach(link => {
                const url = link.href;
                const name = link.textContent.trim();
                
                // Filter out non-FITS links
                if (url.toLowerCase().endsWith('.fits') || url.toLowerCase().includes('.fits.')) {
                    imageLinks.push({
                        url: url,
                        name: name,
                        description: description,
                        source: source
                    });
                }
            });
        }
    });
    
    return imageLinks;
}



// Switch between tabs
function switchTab(activeTabId) {
    // Hide all content sections
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(content => {
        content.style.display = 'none';
    });
    
    // Reset all tab button styles
    const tabButtons = document.querySelectorAll('.file-browser-tab');
    tabButtons.forEach(button => {
        button.style.color = '#aaa';
        button.style.borderBottom = '3px solid transparent';
        button.style.background = 'transparent';
        button.classList.remove('active-tab');
    });
    
    // Activate the selected tab
    const activeTab = document.getElementById(activeTabId);
    if (activeTab) {
        activeTab.style.color = '#2196F3';
        activeTab.style.borderBottom = '3px solid #2196F3';
        activeTab.style.background = 'rgba(33, 150, 243, 0.1)';
        activeTab.classList.add('active-tab');
    }
    
    // Show the corresponding content
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
    }
    
    if (contentId) {
        const contentSection = document.getElementById(contentId);
        if (contentSection) {
            contentSection.style.display = 'block';
        }
    }
}

// Initialize directory content tab
function initializeDirectoryContent() {
    const directoryContent = document.getElementById('directory-content');
    if (!directoryContent) return;
    
    // Create loading indicator initially
    const loadingIndicator = document.createElement('div');
    loadingIndicator.id = 'directory-loading';
    loadingIndicator.textContent = 'Loading directory content...';
    loadingIndicator.style.textAlign = 'center';
    loadingIndicator.style.padding = '20px';
    loadingIndicator.style.color = '#aaa';
    
    directoryContent.appendChild(loadingIndicator);
    
    // Get the current path from the file browser container
    const fileBrowserContainer = document.getElementById('file-browser-container');
    const currentPath = fileBrowserContainer ? fileBrowserContainer.dataset.currentPath || '' : '';
    
    // Load the file list for the current path
    loadFilesList(currentPath);
}

// Initialize upload content tab
function initializeUploadContent() {
    const uploadContent = document.getElementById('upload-content');
    if (!uploadContent) return;
    
    // Create heading
    const heading = document.createElement('h3');
    heading.textContent = 'Upload FITS File';
    heading.style.fontSize = '16px';
    heading.style.margin = '0 0 15px 0';
    heading.style.color = '#fff';
    
    // Create file upload section
    const uploadContainer = document.createElement('div');
    uploadContainer.style.marginBottom = '20px';
    
    const uploadLabel = document.createElement('label');
    uploadLabel.textContent = 'Select a FITS file from your computer:';
    uploadLabel.style.display = 'block';
    uploadLabel.style.marginBottom = '10px';
    uploadLabel.style.color = '#ddd';
    
    // Create a styled file input button
    const fileButtonContainer = document.createElement('div');
    fileButtonContainer.style.position = 'relative';
    fileButtonContainer.style.overflow = 'hidden';
    fileButtonContainer.style.display = 'inline-block';
    fileButtonContainer.style.width = '100%';
    
    const uploadButton = document.createElement('button');
    uploadButton.textContent = 'Choose FITS File';
    uploadButton.style.backgroundColor = '#4CAF50';
    uploadButton.style.color = 'white';
    uploadButton.style.border = 'none';
    uploadButton.style.borderRadius = '4px';
    uploadButton.style.padding = '10px 16px';
    uploadButton.style.cursor = 'pointer';
    uploadButton.style.width = '100%';
    uploadButton.style.fontWeight = 'bold';
    uploadButton.style.transition = 'background-color 0.2s';
    
    // Hover effect
    uploadButton.addEventListener('mouseover', function() {
        this.style.backgroundColor = '#45a049';
    });
    
    uploadButton.addEventListener('mouseout', function() {
        this.style.backgroundColor = '#4CAF50';
    });
    
    const fileInput = document.createElement('input');
    fileInput.id = 'fits-file-input';
    fileInput.type = 'file';
    fileInput.accept = '.fits,.fit,.fits.gz,.fit.gz';
    fileInput.style.position = 'absolute';
    fileInput.style.fontSize = '100px';
    fileInput.style.opacity = '0';
    fileInput.style.right = '0';
    fileInput.style.top = '0';
    fileInput.style.cursor = 'pointer';
    
    // Add click event to trigger file input
    uploadButton.addEventListener('click', function() {
        fileInput.click();
    });
    
    // Add selected file name display
    const selectedFile = document.createElement('div');
    selectedFile.id = 'selected-file-name';
    selectedFile.style.marginTop = '10px';
    selectedFile.style.padding = '8px';
    selectedFile.style.backgroundColor = 'rgba(0,0,0,0.2)';
    selectedFile.style.borderRadius = '4px';
    selectedFile.style.fontSize = '13px';
    selectedFile.style.color = '#aaa';
    selectedFile.textContent = 'No file selected';
    
    // Update file name when a file is selected
    fileInput.addEventListener('change', function() {
        if (this.files.length > 0) {
            selectedFile.textContent = `Selected: ${this.files[0].name}`;
            selectedFile.style.color = '#4CAF50';
            
            // Enable the load button
            loadSelectedButton.style.opacity = '1';
            loadSelectedButton.style.cursor = 'pointer';
            loadSelectedButton.disabled = false;
        } else {
            selectedFile.textContent = 'No file selected';
            selectedFile.style.color = '#aaa';
            
            // Disable the load button
            loadSelectedButton.style.opacity = '0.5';
            loadSelectedButton.style.cursor = 'not-allowed';
            loadSelectedButton.disabled = true;
        }
    });
    
    // Create load selected file button
    const loadSelectedButton = document.createElement('button');
    loadSelectedButton.id = 'load-selected-button';
    loadSelectedButton.textContent = 'Upload & Open Selected File';
    loadSelectedButton.style.backgroundColor = '#FF9800';
    loadSelectedButton.style.color = 'white';
    loadSelectedButton.style.border = 'none';
    loadSelectedButton.style.borderRadius = '4px';
    loadSelectedButton.style.padding = '10px 16px';
    loadSelectedButton.style.marginTop = '15px';
    loadSelectedButton.style.width = '100%';
    loadSelectedButton.style.fontWeight = 'bold';
    loadSelectedButton.style.transition = 'background-color 0.2s';
    loadSelectedButton.style.opacity = '0.5';
    loadSelectedButton.style.cursor = 'not-allowed';
    loadSelectedButton.disabled = true;
    
    // Hover effect
    loadSelectedButton.addEventListener('mouseover', function() {
        if (!this.disabled) {
            this.style.backgroundColor = '#e68900';
        }
    });
    
    loadSelectedButton.addEventListener('mouseout', function() {
        if (!this.disabled) {
            this.style.backgroundColor = '#FF9800';
        }
    });
    
    // Local file upload and load handler
    loadSelectedButton.addEventListener('click', function() {
        const fileInput = document.getElementById('fits-file-input');
        if (fileInput.files.length === 0) {
            showNotification('Please select a file', 3000, 'warning');
            return;
        }
        
        // Load the selected file
        loadLocalFitsFile(fileInput.files[0]);
    });
    
    // Supported formats info
    const formatsInfo = document.createElement('div');
    formatsInfo.style.marginTop = '20px';
    formatsInfo.style.padding = '10px';
    formatsInfo.style.backgroundColor = 'rgba(33, 150, 243, 0.1)';
    formatsInfo.style.borderRadius = '4px';
    formatsInfo.style.borderLeft = '3px solid #2196F3';
    formatsInfo.style.fontSize = '13px';
    
    formatsInfo.innerHTML = `
        <p style="margin: 0 0 8px 0; color: #ddd;"><strong>Supported formats:</strong></p>
        <ul style="margin: 0; padding-left: 20px; color: #bbb;">
            <li>FITS files (.fits, .fit)</li>
            <li>Compressed FITS files (.fits.gz, .fit.gz)</li>
        </ul>
    `;
    
    // Build the upload UI structure
    fileButtonContainer.appendChild(uploadButton);
    fileButtonContainer.appendChild(fileInput);
    
    uploadContainer.appendChild(uploadLabel);
    uploadContainer.appendChild(fileButtonContainer);
    uploadContainer.appendChild(selectedFile);
    uploadContainer.appendChild(loadSelectedButton);
    
    // Add all elements to the upload tab
    uploadContent.appendChild(heading);
    uploadContent.appendChild(uploadContainer);
    uploadContent.appendChild(formatsInfo);
}

// Initialize download content tab
function initializeDownloadContent() {
    const downloadContent = document.getElementById('download-content');
    if (!downloadContent) return;
    
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
        
        // Show download progress
        showProgress(true, 'Downloading FITS file...');
        
        // Download and load the file
        downloadAndLoadFits(url);
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
            name: 'Hubble Deep Field',
            url: 'https://fits.gsfc.nasa.gov/samples/WFPC2u5780205r_c0fx.fits'
        },
        {
            name: 'Orion Nebula (M42)',
            url: 'https://fits.gsfc.nasa.gov/samples/FOCx38i0101t_c0f.fits'
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

// Show file browser
function showFileBrowser() {
    createFileBrowserContainer();
    const fileBrowserContainer = document.getElementById('file-browser-container');
    if (fileBrowserContainer) {
        fileBrowserContainer.style.transform = 'translateX(-400px)';
    }
}

// Hide file browser
function hideFileBrowser() {
    const fileBrowserContainer = document.getElementById('file-browser-container');
    if (fileBrowserContainer) {
        fileBrowserContainer.style.transform = 'translateX(0)';
        
        // Remove the container after animation completes
        setTimeout(() => {
            if (fileBrowserContainer.parentNode) {
                fileBrowserContainer.parentNode.removeChild(fileBrowserContainer);
            }
        }, 300);
    }
}

// Load the list of files from the server for a specific path
function loadFilesList(path = '') {
    const fileBrowserContainer = document.getElementById('file-browser-container');
    if (fileBrowserContainer) {
        // Store the current path
        fileBrowserContainer.dataset.currentPath = path;
        
        // Update the browser title to show current path
        const title = fileBrowserContainer.querySelector('h2');
        if (title) {
            title.textContent = path ? `Files: /${path}` : 'Available Files';
        }
    }
    
    // Show loading indicator in the directory tab
    const directoryContent = document.getElementById('directory-content');
    if (directoryContent) {
        directoryContent.innerHTML = `
            <div style="text-align: center; padding: 20px; color: #aaa;">
                Loading directory content...
            </div>
        `;
    }
    
    // Construct the URL with the path
    const url = path ? `/list-files/${path}` : '/list-files/';
    
    // Fetch the files list for the specified path
    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                showFilesListError(data.error);
                return;
            }
            
            // Note: API returns 'items' instead of 'files'
            displayFilesList(data.items, path);
        })
        .catch(error => {
            console.error('Error loading files list:', error);
            showFilesListError("Failed to load files. Please try again later.");
        });
}

// Display error message in the file browser
function showFilesListError(message) {
    const directoryContent = document.getElementById('directory-content');
    if (directoryContent) {
        directoryContent.innerHTML = `
            <div style="color: #ff6b6b; padding: 20px; text-align: center;">
                <p>${message}</p>
                <button style="padding: 8px 16px; background-color: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; margin-top: 10px;">Retry</button>
            </div>
        `;
        
        // Add retry button event listener
        const retryButton = directoryContent.querySelector('button');
        if (retryButton) {
            retryButton.addEventListener('click', () => {
                const fileBrowserContainer = document.getElementById('file-browser-container');
                const currentPath = fileBrowserContainer ? fileBrowserContainer.dataset.currentPath || '' : '';
                loadFilesList(currentPath);
            });
        }
    }
}

// Display the list of files and directories in the file browser
function displayFilesList(items, currentPath = '') {
    const directoryContent = document.getElementById('directory-content');
    if (!directoryContent) return;
    
    // Clear directory content
    directoryContent.innerHTML = '';
    
    // Add breadcrumb navigation
    const breadcrumbContainer = document.createElement('div');
    breadcrumbContainer.style.marginBottom = '15px';
    breadcrumbContainer.style.display = 'flex';
    breadcrumbContainer.style.flexWrap = 'wrap';
    breadcrumbContainer.style.alignItems = 'center';
    breadcrumbContainer.style.gap = '5px';
    
    // Root directory link
    const rootLink = document.createElement('a');
    rootLink.textContent = 'Home';
    rootLink.href = '#';
    rootLink.style.color = '#2196F3';
    rootLink.style.textDecoration = 'none';
    rootLink.style.cursor = 'pointer';
    rootLink.addEventListener('click', (e) => {
        e.preventDefault();
        loadFilesList('');
    });
    
    breadcrumbContainer.appendChild(rootLink);
    
    // Add path segments if we're in a subdirectory
    if (currentPath) {
        // Add separator
        const separator = document.createElement('span');
        separator.textContent = ' / ';
        separator.style.color = '#aaa';
        breadcrumbContainer.appendChild(separator);
        
        // Split the path into segments
        const segments = currentPath.split('/');
        
        // Add each segment as a link
        segments.forEach((segment, index) => {
            const isLast = index === segments.length - 1;
            
            if (segment) {
                // Create path up to this segment
                const segmentPath = segments.slice(0, index + 1).join('/');
                
                const segmentLink = document.createElement(isLast ? 'span' : 'a');
                segmentLink.textContent = segment;
                
                if (isLast) {
                    // Current directory is not clickable
                    segmentLink.style.color = '#aaa';
                } else {
                    // Parent directories are clickable
                    segmentLink.href = '#';
                    segmentLink.style.color = '#2196F3';
                    segmentLink.style.textDecoration = 'none';
                    segmentLink.style.cursor = 'pointer';
                    segmentLink.addEventListener('click', (e) => {
                        e.preventDefault();
                        loadFilesList(segmentPath);
                    });
                }
                
                breadcrumbContainer.appendChild(segmentLink);
                
                // Add separator if not the last segment
                if (!isLast) {
                    const separator = document.createElement('span');
                    separator.textContent = ' / ';
                    separator.style.color = '#aaa';
                    breadcrumbContainer.appendChild(separator);
                }
            }
        });
    }
    
    directoryContent.appendChild(breadcrumbContainer);
    
    // Show no items message if empty
    if (!items || items.length === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.style.padding = '20px';
        emptyMessage.style.textAlign = 'center';
        emptyMessage.style.color = '#aaa';
        emptyMessage.innerHTML = `
            <p>No files or directories found in this location.</p>
            <p>Click "Home" above to return to the main directory.</p>
        `;
        directoryContent.appendChild(emptyMessage);
        return;
    }
    
    // Add search field
    const searchContainer = document.createElement('div');
    searchContainer.style.marginBottom = '15px';
    
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search files...';
    searchInput.style.width = '100%';
    searchInput.style.padding = '8px';
    searchInput.style.backgroundColor = '#333';
    searchInput.style.color = 'white';
    searchInput.style.border = '1px solid #555';
    searchInput.style.borderRadius = '4px';
    searchInput.style.transition = 'all 0.3s ease';
    
    // Focus effect for search input
    searchInput.addEventListener('focus', function() {
        this.style.borderColor = '#2196F3';
        this.style.boxShadow = '0 0 0 2px rgba(33, 150, 243, 0.2)';
    });
    
    searchInput.addEventListener('blur', function() {
        this.style.borderColor = '#555';
        this.style.boxShadow = 'none';
    });
    
    searchContainer.appendChild(searchInput);
    directoryContent.appendChild(searchContainer);
    
    // Create a single list with all items (directories and files)
    const fileItems = document.createElement('div');
    fileItems.className = 'file-items';
    fileItems.style.display = 'flex';
    fileItems.style.flexDirection = 'column';
    fileItems.style.gap = '5px';
    
    // Group items: directories first, then files
    const directories = [];
    const files = [];
    
    items.forEach(item => {
        if (item.type === 'directory') {
            directories.push(item);
        } else {
            files.push(item);
        }
    });
    
    // Add directories first
    directories.forEach(item => {
        const itemElement = createItemElement(item, currentPath);
        fileItems.appendChild(itemElement);
        
        // Stagger the appearance of items
        setTimeout(() => {
            itemElement.style.opacity = '1';
            itemElement.style.transform = 'translateY(0)';
        }, directories.indexOf(item) * 30); // Stagger by 30ms per item
    });
    
    // Then add files
    files.forEach(item => {
        const itemElement = createItemElement(item, currentPath);
        fileItems.appendChild(itemElement);
        
        // Stagger the appearance of items (continue from where directories left off)
        setTimeout(() => {
            itemElement.style.opacity = '1';
            itemElement.style.transform = 'translateY(0)';
        }, (directories.length + files.indexOf(item)) * 30); // Stagger by 30ms per item
    });
    
    directoryContent.appendChild(fileItems);
    
    // Add search functionality with animations and text highlighting
    searchInput.addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase().trim();
        const itemElements = directoryContent.querySelectorAll('.file-item');
        
        // First, remove any existing highlights
        directoryContent.querySelectorAll('.highlight-match').forEach(highlight => {
            const parent = highlight.parentNode;
            parent.textContent = parent.textContent; // This removes the span and keeps the text
        });
        
        // If search is empty, show all items
        if (searchTerm === '') {
            itemElements.forEach((item, index) => {
                // Make sure the item is displayed
                item.style.display = 'block';
                
                // If the item was previously hidden, animate it back in
                if (item.style.opacity === '0') {
                    item.style.transform = 'translateY(5px)';
                    
                    // Stagger the animations slightly
                    setTimeout(() => {
                        item.style.opacity = '1';
                        item.style.transform = 'translateY(0)';
                    }, index * 20); // 20ms stagger
                } else {
                    // Ensure opacity is 1 for all visible items
                    item.style.opacity = '1';
                    item.style.transform = 'translateY(0)';
                }
            });
            return; // Exit early, no need to process further
        }
        
        // Process search results if there's a search term
        itemElements.forEach(item => {
            const itemName = item.dataset.name.toLowerCase();
            const itemNameElement = item.querySelector('.file-name');
            
            if (itemName.includes(searchTerm)) {
                // Show the item with animation
                if (item.style.display === 'none' || item.style.opacity === '0') {
                    item.style.display = 'block';
                    item.style.opacity = '0';
                    item.style.transform = 'translateY(5px)';
                    
                    // Trigger reflow for animation to work
                    void item.offsetWidth;
                    
                    // Animate in
                    setTimeout(() => {
                        item.style.opacity = '1';
                        item.style.transform = 'translateY(0)';
                    }, 10);
                }
                
                // Highlight matching text
                const originalText = itemNameElement.textContent;
                const startIndex = originalText.toLowerCase().indexOf(searchTerm);
                
                if (startIndex >= 0) {
                    const endIndex = startIndex + searchTerm.length;
                    const beforeMatch = originalText.substring(0, startIndex);
                    const match = originalText.substring(startIndex, endIndex);
                    const afterMatch = originalText.substring(endIndex);
                    
                    itemNameElement.innerHTML = beforeMatch + 
                                               '<span class="highlight-match" style="background-color: rgba(33, 150, 243, 0.3); border-radius: 2px; padding: 0 2px;">' + 
                                               match + 
                                               '</span>' + 
                                               afterMatch;
                }
            } else {
                // Hide with animation if it's currently visible
                if (item.style.display !== 'none') {
                    item.style.opacity = '0';
                    item.style.transform = 'translateY(5px)';
                    
                    // Hide after animation completes
                    setTimeout(() => {
                        item.style.display = 'none';
                    }, 300);
                }
            }
        });
    });
}
// Modify the createHduSelectorPopup function to display BUNIT information


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
    showProgress(true, `Loading HDU ${hduIndex}...`);
    
    // Call the load-file endpoint with the selected HDU
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
                    const useFastLoading = fileSize > 100 * 1024 * 1024;
                    
                    if (useFastLoading) {
                        console.log(`Large file detected (${formatFileSize(fileSize)}). Using fast loading.`);
                        
                        // Use JSON endpoint for fast loading mode with HDU parameter
                        return fetch(`/fits-binary/?fast_loading=true&hdu=${hduIndex}`)
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
                                    // Handle as binary data
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
                                        // Handle fast loading response
                                        if (typeof handleFastLoadingResponse === 'function') {
                                            return handleFastLoadingResponse(data, filepath);
                                        } else {
                                            throw new Error('Fast loading handler not available');
                                        }
                                    }
                                }
                                // If we got here with binary data, it's already been processed
                                return data;
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

// Override the original loadFitsFile function to use our new version
const originalLoadFitsFile = window.loadFitsFile;
window.loadFitsFile = loadFitsFileWithHduSelection;
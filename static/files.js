// Create file browser container
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
    fileBrowserContainer.style.padding = '10px';
    fileBrowserContainer.style.boxSizing = 'border-box';
    fileBrowserContainer.style.boxShadow = '-2px 0 10px rgba(0, 0, 0, 0.5)';
    fileBrowserContainer.style.zIndex = '1000';
    fileBrowserContainer.style.transition = 'transform 0.3s ease-in-out';
    fileBrowserContainer.style.overflowY = 'auto';
    fileBrowserContainer.style.fontFamily = 'Raleway, sans-serif';
    
    // Create header
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '15px';
    header.style.paddingBottom = '10px';
    header.style.borderBottom = '1px solid rgba(255, 255, 255, 0.2)';
    
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
    closeButton.style.fontSize = '20px';
    closeButton.style.cursor = 'pointer';
    closeButton.onclick = hideFileBrowser;
    
    header.appendChild(title);
    header.appendChild(closeButton);
    fileBrowserContainer.appendChild(header);
    
    // Create content
    const content = document.createElement('div');
    content.id = 'file-browser-content';
    
    // Create loading indicator
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'file-browser-loading';
    loadingDiv.textContent = 'Loading files...';
    loadingDiv.style.textAlign = 'center';
    loadingDiv.style.padding = '20px';
    loadingDiv.style.color = '#aaa';
    
    content.appendChild(loadingDiv);
    fileBrowserContainer.appendChild(content);
    
    // Add to document
    document.body.appendChild(fileBrowserContainer);
    
    // Initialize current path as empty (root directory)
    fileBrowserContainer.dataset.currentPath = '';
    
    // Load files
    loadFilesList();
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
    
    // Show loading indicator
    const content = document.getElementById('file-browser-content');
    if (content) {
        content.innerHTML = `
            <div id="file-browser-loading" style="text-align: center; padding: 20px; color: #aaa;">
                Loading files...
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
            
            // Note: New API returns 'items' instead of 'files'
            displayFilesList(data.items, path);
        })
        .catch(error => {
            console.error('Error loading files list:', error);
            showFilesListError("Failed to load files. Please try again later.");
        });
}

// Display error message in the file browser
function showFilesListError(message) {
    const content = document.getElementById('file-browser-content');
    if (content) {
        content.innerHTML = `
            <div style="color: #ff6b6b; padding: 20px; text-align: center;">
                <p>${message}</p>
                <button id="retry-load-files" style="padding: 8px 16px; background-color: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; margin-top: 10px;">Retry</button>
            </div>
        `;
        
        // Add retry button event listener
        const retryButton = document.getElementById('retry-load-files');
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
// Display the list of files and directories in the file browser
function displayFilesList(items, currentPath = '') {
    const content = document.getElementById('file-browser-content');
    if (!content) return;
    
    // Clear content
    content.innerHTML = '';
    
    // Create a file list element
    const fileListContainer = document.createElement('div');
    fileListContainer.className = 'file-list-container';
    fileListContainer.style.display = 'flex';
    fileListContainer.style.flexDirection = 'column';
    fileListContainer.style.gap = '10px';
    
    // Add breadcrumb navigation - ALWAYS show this even for empty directories
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
    
    fileListContainer.appendChild(breadcrumbContainer);
    
    // Show no items message if empty BUT after adding breadcrumbs
    if (!items || items.length === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.style.padding = '20px';
        emptyMessage.style.textAlign = 'center';
        emptyMessage.style.color = '#aaa';
        emptyMessage.innerHTML = `
            <p>No files or directories found in this location.</p>
            <p>Click "Home" above to return to the main directory.</p>
        `;
        fileListContainer.appendChild(emptyMessage);
        
        // Add the file list to the content
        content.appendChild(fileListContainer);
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
        this.classList.add('search-active');
    });
    
    searchInput.addEventListener('blur', function() {
        this.style.borderColor = '#555';
        this.style.boxShadow = 'none';
        this.classList.remove('search-active');
    });
    
    searchContainer.appendChild(searchInput);
    fileListContainer.appendChild(searchContainer);
    
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
    
    fileListContainer.appendChild(fileItems);
    
    // Add search functionality with animations and text highlighting
    searchInput.addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase().trim();
        const itemElements = document.querySelectorAll('.file-item');
        
        // First, remove any existing highlights
        document.querySelectorAll('.highlight-match').forEach(highlight => {
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
    
    // Add the file list to the content
    content.appendChild(fileListContainer);
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
            
            // Get binary data with fetch, but use streaming approach for large files
            return fetchBinaryWithProgress('/fits-binary/');
        })
        .then(arrayBuffer => {
            if (!arrayBuffer) {
                throw new Error('Failed to load FITS data');
            }
            
            // Clear any existing catalog
            if (typeof clearCatalog === 'function') {
                clearCatalog();
            }
            
            // Process binary data and initialize viewer
            console.time('parseBinaryData');
            processBinaryData(arrayBuffer, filepath);
        })
        .catch(error => {
            console.error('Error loading FITS file:', error);
            showProgress(false);
            showNotification(`Error: ${error.message || 'Failed to load FITS file'}`, 5000);
        });
}

// Fetch binary data with progress tracking
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

// Process binary data in smaller chunks to avoid memory issues
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
                
                // Check if dimensions are reasonable
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
                
                // For very large images, process data in chunks to avoid memory issues
                showProgress(true, 'Creating image data structures...');
                
                // Create data structure with chunked processing
                const chunkSize = 1000; // Process rows in chunks
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
                        const row = [];
                        for (let x = 0; x < width; x++) {
                            row.push(imageDataArray[y * width + x]);
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
                    
                    console.timeEnd('parseBinaryData');
                    
                    // Apply 99% percentile for better initial display
                    try {
                        showProgress(true, 'Calculating optimal display range...');
                        
                        // Calculate and apply 99% percentile with sampling for efficiency
                        const validPixels = [];
                        const maxSampleSize = 500000; // Limit samples for speed
                        const skipFactor = Math.max(1, Math.floor((width * height) / maxSampleSize));
                        
                        let pixelCount = 0;
                        for (let y = 0; y < height; y += Math.ceil(skipFactor / width)) {
                            for (let x = 0; x < width; x += Math.ceil(skipFactor)) {
                                pixelCount++;
                                if (pixelCount % skipFactor !== 0) continue;
                                
                                const value = data[y][x];
                                if (!isNaN(value) && isFinite(value)) {
                                    validPixels.push(value);
                                }
                            }
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







// Add download button to the file browser
function addDownloadButton() {
    // Find the file browser content section
    const content = document.getElementById('file-browser-content');
    if (!content) return;
    
    // Check if the download section already exists
    if (document.getElementById('download-section')) return;
    
    // Add a prominent title for downloading FITS files
    
    // Create a separator
    const separator = document.createElement('div');
    separator.style.borderTop = '1px solid rgba(255, 255, 255, 0.2)';
    separator.style.margin = '20px 0';
    
    // Create a section for download functionality
    const downloadSection = document.createElement('div');
    downloadSection.id = 'download-section';
    downloadSection.style.marginBottom = '20px';
    
    // Create a heading
    const heading = document.createElement('h3');
    heading.textContent = 'Download FITS File';
    heading.style.fontSize = '16px';
    heading.style.margin = '0 0 10px 0';
    
    
    // Create input for URL
    const urlInput = document.createElement('input');
    urlInput.id = 'fits-url-input';
    urlInput.type = 'text';
    urlInput.placeholder = 'Enter FITS file URL';
    urlInput.style.width = '100%';
    urlInput.style.padding = '8px';
    urlInput.style.marginBottom = '10px';
    urlInput.style.backgroundColor = '#333';
    urlInput.style.color = 'white';
    urlInput.style.border = '1px solid #555';
    urlInput.style.borderRadius = '4px';
    
    // Create download button
    const downloadButton = document.createElement('button');
    downloadButton.id = 'download-fits-button';
    downloadButton.textContent = 'Download & Load';
    downloadButton.style.backgroundColor = '#2196F3';
    downloadButton.style.color = 'white';
    downloadButton.style.border = 'none';
    downloadButton.style.borderRadius = '4px';
    downloadButton.style.padding = '8px 16px';
    downloadButton.style.cursor = 'pointer';
    downloadButton.style.marginBottom = '15px';
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
    
    // Create file upload section
    const uploadSection = document.createElement('div');
    uploadSection.style.marginTop = '20px';
    
    const uploadLabel = document.createElement('label');
    uploadLabel.textContent = 'Or upload from your computer:';
    uploadLabel.style.display = 'block';
    uploadLabel.style.marginBottom = '8px';
    uploadLabel.style.color = '#ddd';
    
    // Create a styled file input container
    const uploadContainer = document.createElement('div');
    uploadContainer.style.position = 'relative';
    uploadContainer.style.overflow = 'hidden';
    uploadContainer.style.display = 'inline-block';
    uploadContainer.style.width = '100%';
    
    const uploadButton = document.createElement('button');
    uploadButton.textContent = 'Choose FITS File';
    uploadButton.style.backgroundColor = '#4CAF50';
    uploadButton.style.color = 'white';
    uploadButton.style.border = 'none';
    uploadButton.style.borderRadius = '4px';
    uploadButton.style.padding = '8px 16px';
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
    selectedFile.style.marginTop = '8px';
    selectedFile.style.fontSize = '12px';
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
    loadSelectedButton.textContent = 'Load Selected File';
    loadSelectedButton.style.backgroundColor = '#FF9800';
    loadSelectedButton.style.color = 'white';
    loadSelectedButton.style.border = 'none';
    loadSelectedButton.style.borderRadius = '4px';
    loadSelectedButton.style.padding = '8px 16px';
    loadSelectedButton.style.marginTop = '10px';
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
    
    // Add usage tips for astronomy repositories
    const tipsContainer = document.createElement('div');
    tipsContainer.id = 'astronomy-tips';
    tipsContainer.style.margin = '15px 0';
    tipsContainer.style.padding = '10px';
    tipsContainer.style.backgroundColor = 'rgba(33, 150, 243, 0.1)';
    tipsContainer.style.borderRadius = '4px';
    tipsContainer.style.borderLeft = '3px solid #2196F3';
    
    
    // Build the DOM structure
    uploadContainer.appendChild(uploadButton);
    uploadContainer.appendChild(fileInput);
    
    uploadSection.appendChild(uploadLabel);
    uploadSection.appendChild(uploadContainer);
    uploadSection.appendChild(selectedFile);
    uploadSection.appendChild(loadSelectedButton);
    
    // Add elements to the download section
    downloadSection.appendChild(heading);
    downloadSection.appendChild(urlInput);
    downloadSection.appendChild(downloadButton);
    downloadSection.appendChild(uploadSection);
    
    // Add separator, tips, and download section to the content
    content.appendChild(separator);
    content.appendChild(downloadSection);
    
    // Add event handlers for downloading and loading files
    
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

// Direct download method without proxy
function downloadAndLoadFitsDirect(url) {
    // Create a unique filename based on the URL
    const filename = url.split('/').pop() || 'downloaded_file.fits';
    
    showProgress(true, 'Downloading directly...');
    
    fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Network error: ${response.status} ${response.statusText}`);
            }
            
            // Check if the response is a FITS file (based on content type or extension)
            const contentType = response.headers.get('content-type');
            const isValidFile = contentType && (
                contentType.includes('application/fits') || 
                contentType.includes('image/fits') || 
                /\.(fits|fit|fts)(\.gz)?$/i.test(url)
            );
            
            if (!isValidFile) {
                console.warn('Warning: Downloaded file might not be a valid FITS file');
                showNotification('Warning: File might not be a valid FITS file, but will try to load it', 3000, 'warning');
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
            showNotification(`Error: ${error.message}`, 5000, 'error');
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

// Update the file browser to include the download button
function updateFileBrowser() {
    // Find the file browser content section
    const content = document.getElementById('file-browser-content');
    if (!content) return;
    
    // Check if we need to add the download button
    const existingSection = document.getElementById('download-section');
    if (!existingSection) {
        // Get the file list container if it exists
        const fileListContainer = content.querySelector('.file-list-container');
        const breadcrumbContainer = content.querySelector('div > div');
        
        // Clear content
        content.innerHTML = '';
        
        // Add the download button first
        addDownloadButton();
        
        // Add back the file browser elements if they exist
        if (fileListContainer) {
            const showFilesButton = document.createElement('button');
            showFilesButton.textContent = 'Show Directory Files';
            showFilesButton.style.backgroundColor = '#555';
            showFilesButton.style.color = 'white';
            showFilesButton.style.border = 'none';
            showFilesButton.style.borderRadius = '4px';
            showFilesButton.style.padding = '8px 16px';
            showFilesButton.style.margin = '15px 0';
            showFilesButton.style.cursor = 'pointer';
            showFilesButton.style.width = '100%';
            
            // Add hover effects
            showFilesButton.addEventListener('mouseover', function() {
                this.style.backgroundColor = '#666';
            });
            
            showFilesButton.addEventListener('mouseout', function() {
                this.style.backgroundColor = '#555';
            });
            
            // Click handler to toggle file list visibility
            showFilesButton.addEventListener('click', function() {
                const fileSection = document.getElementById('file-browser-directory-section');
                if (fileSection) {
                    if (fileSection.style.display === 'none') {
                        fileSection.style.display = 'block';
                        this.textContent = 'Hide Directory Files';
                    } else {
                        fileSection.style.display = 'none';
                        this.textContent = 'Show Directory Files';
                    }
                }
            });
            
            content.appendChild(showFilesButton);
            
            // Create a container for the file browser section
            const fileSection = document.createElement('div');
            fileSection.id = 'file-browser-directory-section';
            fileSection.style.display = 'none'; // Initially hidden
            
            // If we have breadcrumbs, add them first
            if (breadcrumbContainer) {
                fileSection.appendChild(breadcrumbContainer);
            }
            
            // Add the file list
            fileSection.appendChild(fileListContainer);
            
            // Add to the content
            content.appendChild(fileSection);
        }
    }
}

// Update the loadFilesList function to add the download button after loading files
const originalLoadFilesList = loadFilesList;
loadFilesList = function(path = '') {
    // Call the original function
    originalLoadFilesList(path);
    
    // Add the download button after a short delay to ensure the content is updated
    setTimeout(updateFileBrowser, 500);
};

// Make sure to call updateFileBrowser when the file browser is shown
const originalShowFileBrowser = showFileBrowser;
showFileBrowser = function() {
    // Call the original function
    originalShowFileBrowser();
    
    // Add the download button after a short delay
    setTimeout(updateFileBrowser, 500);
};

// Call updateFileBrowser when the page loads
document.addEventListener('DOMContentLoaded', function() {
    // Wait for the file browser to be shown
    setTimeout(updateFileBrowser, 1000);
});





let sedImageGlobalUrl = null; // Store the SED image URL globally for download
let currentSedRa = null;
let currentSedDec = null;

// Create a container for the SED display at the bottom of the screen
function createSedContainer() {
    // Check if container already exists
    if (document.getElementById('sed-container')) {
        return;
    }
    
    // Create container
    const sedContainer = document.createElement('div');
    sedContainer.id = 'sed-container';
    sedContainer.style.position = 'fixed';
    sedContainer.style.bottom = '0';
    sedContainer.style.left = '0';
    sedContainer.style.width = '100%';
    sedContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    sedContainer.style.color = 'white';
    sedContainer.style.padding = '10px';
    sedContainer.style.boxShadow = '0 -2px 10px rgba(0, 0, 0, 0.5)';
    sedContainer.style.zIndex = '1000';
    sedContainer.style.display = 'none';
    sedContainer.style.textAlign = 'center';
    sedContainer.style.fontFamily = "'Raleway', sans-serif";
    
    // Create header
    const header = document.createElement('div');
    header.id = 'sed-header';
    header.style.display = 'flex';
    header.style.justifyContent = 'flex-end';
    header.style.alignItems = 'center';
    header.style.padding = '10px';
    header.style.backgroundColor = 'transparent';
    header.style.borderTopLeftRadius = '8px';
    header.style.borderTopRightRadius = '8px';
    header.style.cursor = 'move';
    
    // Make the header draggable
    makeDraggable(sedContainer, header);
    
    // Create buttons container
    const buttonsContainer = document.createElement('div');
    buttonsContainer.style.display = 'flex';
    buttonsContainer.style.alignItems = 'center';
    buttonsContainer.style.gap = '10px'; // Space between buttons
    
    // Create Save button with nice SVG icon
    const saveButton = document.createElement('button');
    saveButton.title = 'Save SED as PNG';
    saveButton.style.background = 'none';
    saveButton.style.border = 'none';
    saveButton.style.cursor = 'pointer';
    saveButton.style.padding = '5px';
    saveButton.style.display = 'flex';
    saveButton.style.alignItems = 'center';
    saveButton.style.justifyContent = 'center';
    saveButton.style.transition = 'all 0.2s ease';
    
    // SVG icon for save (corrected)
    saveButton.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#cccccc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
        <polyline points="17,21 17,13 7,13 7,21"></polyline>
        <polyline points="7,3 7,8 15,8"></polyline>
    </svg>`;
    
    saveButton.onmouseover = function() { 
        saveButton.querySelector('svg').style.stroke = '#ffffff'; 
    };
    saveButton.onmouseout = function() { 
        saveButton.querySelector('svg').style.stroke = '#cccccc'; 
    };
    
    saveButton.onclick = function() {
        downloadSedImage();
    };
    
    buttonsContainer.appendChild(saveButton); // Add save button before close
    
    // Create close button
    const closeButton = document.createElement('div');
    closeButton.innerHTML = '&times;';
    closeButton.style.fontSize = '20px';
    closeButton.style.fontWeight = 'bold';
    closeButton.style.color = 'white';
    closeButton.style.cursor = 'pointer';
    closeButton.style.padding = '0 10px';
    closeButton.style.fontFamily = "'Raleway', sans-serif";
    closeButton.onclick = function() {
        hideSed();
    };
    
    buttonsContainer.appendChild(closeButton);
    header.appendChild(buttonsContainer);
    sedContainer.appendChild(header);
    
    // Create content area
    const contentArea = document.createElement('div');
    contentArea.id = 'sed-content';
    contentArea.style.display = 'flex';
    contentArea.style.justifyContent = 'center';
    contentArea.style.alignItems = 'center';
    contentArea.style.maxHeight = '300px';
    contentArea.style.overflow = 'auto';
    
    // Create image container
    const imageContainer = document.createElement('div');
    imageContainer.id = 'sed-image-container';
    
    // Create image element
    const sedImage = document.createElement('img');
    sedImage.id = 'sed-image';
    sedImage.style.maxWidth = '100%';
    sedImage.style.maxHeight = '280px';
    sedImage.style.borderRadius = '4px';
    sedImage.alt = 'SED Plot';
    
    imageContainer.appendChild(sedImage);
    contentArea.appendChild(imageContainer);
    sedContainer.appendChild(contentArea);
    
    // Add to document
    document.body.appendChild(sedContainer);
}

// Function to close SED container
function closeSedContainer() {
    const sedContainer = document.getElementById('sed-container');
    if (sedContainer) {
        // Add slide-out animation
        sedContainer.style.opacity = '0';
        sedContainer.style.transform = 'translateY(20px)';
        
        // Hide after animation completes
        setTimeout(() => {
            const currentSedContainer = document.getElementById('sed-container');
            if (currentSedContainer) {
                currentSedContainer.style.display = 'none';
                
                // Clean up any loading elements
                const progressBar = document.getElementById('sed-progress-bar');
                const loadingText = document.getElementById('sed-loading-text');
                const sedImage = document.getElementById('sed-image');
                
                if (progressBar) progressBar.remove();
                if (loadingText) loadingText.remove();
                if (sedImage) {
                    sedImage.src = '';
                    sedImage.style.display = 'none';
                }
                
                // Reset global variables
                if (typeof sedImageGlobalUrl !== 'undefined') {
                    sedImageGlobalUrl = null;
                }
                if (typeof currentSedRa !== 'undefined') {
                    currentSedRa = null;
                }
                if (typeof currentSedDec !== 'undefined') {
                    currentSedDec = null;
                }
            }
        }, 300); // Match the transition duration
    }
}

// Function to check if SED container is open
function isSedContainerOpen() {
    const sedContainer = document.getElementById('sed-container');
    return sedContainer && 
           sedContainer.style.display !== 'none' && 
           sedContainer.style.opacity !== '0';
}

// Function to toggle SED container
function toggleSedContainer() {
    if (isSedContainerOpen()) {
        closeSedContainer();
    }
    // Note: No else clause to open, as opening requires ra, dec, catalogName parameters
}

// Usage examples:
// closeSedContainer(); // Direct close
// if (isSedContainerOpen()) { closeSedContainer(); } // Conditional close

// Close SED on escape key (optional)
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        if (isSedContainerOpen()) {
            closeSedContainer();
        } else if (isRgbPopupOpen()) {
            closeRgbCutoutPopup();
        }
    }
});

// Close both popups function (useful for cleanup)
function closeAllPopups() {
    closeSedContainer();
    closeRgbCutoutPopup();
}

// Updated showSed function - pass galaxy name
function showSed(ra, dec, catalogName, galaxyName = null) {
    triggerRgbPopupClose();
    // Create SED container if it doesn't exist
    createSedContainer();
    
    currentSedRa = ra; // Store RA for filename
    currentSedDec = dec; // Store DEC for filename
    
    sedImageGlobalUrl = null; // Reset image URL for new SED
    
    // Get container and image elements
    const sedContainer = document.getElementById('sed-container');
    const sedImage = document.getElementById('sed-image');
    const imageContainer = document.getElementById('sed-image-container');
    
    // Show container and set loading state
    sedContainer.style.opacity = '1';
    sedContainer.style.transform = 'translateY(0)';
    sedContainer.style.display = 'block';
    sedImage.src = '';
    sedImage.alt = 'Loading SED...';
    sedImage.style.display = 'none';
    
    // Remove any existing progress elements
    const existingProgressBar = document.getElementById('sed-progress-bar');
    if (existingProgressBar) {
        existingProgressBar.remove();
    }
    
    const existingLoadingText = document.getElementById('sed-loading-text');
    if (existingLoadingText) {
        existingLoadingText.remove();
    }
    
    // Create new progress bar container
    const progressBar = document.createElement('div');
    progressBar.id = 'sed-progress-bar';
    progressBar.style.width = '100%';
    progressBar.style.height = '8px';
    progressBar.style.backgroundColor = '#f0f0f0';
    progressBar.style.borderRadius = '4px';
    progressBar.style.overflow = 'hidden';
    progressBar.style.marginTop = '20px';
    progressBar.style.marginBottom = '10px';
    
    // Create progress bar fill element
    const progressBarFill = document.createElement('div');
    progressBarFill.id = 'sed-progress-bar-fill';
    progressBarFill.style.width = '0%';
    progressBarFill.style.height = '100%';
    progressBarFill.style.backgroundColor = '#4CAF50';
    progressBarFill.style.borderRadius = '4px';
    progressBarFill.style.transition = 'width 0.3s ease';
    progressBarFill.setAttribute('aria-valuenow', '0');
    progressBarFill.setAttribute('aria-valuemin', '0');
    progressBarFill.setAttribute('aria-valuemax', '100');
    
    // Add fill to progress bar
    progressBar.appendChild(progressBarFill);
    
    // Create loading text
    const loadingText = document.createElement('div');
    loadingText.id = 'sed-loading-text';
    loadingText.textContent = 'Preparing to load SED...';
    loadingText.style.textAlign = 'center';
    loadingText.style.marginBottom = '20px';
    loadingText.style.color = '#555';
    
    // Add progress elements to container
    imageContainer.appendChild(progressBar);
    imageContainer.appendChild(loadingText);
    
    // Set up progress simulation
    let progress = 0;
    const progressInterval = setInterval(() => {
        progress += Math.random() * 5;
        if (progress > 100) {
            progress = 95;
        }
        progressBarFill.style.width = `${progress}%`;
        
        // Update loading text based on progress
        if (progress < 30) {
            loadingText.textContent = 'Preparing to load SED...';
        } else if (progress < 60) {
            loadingText.textContent = 'Generating SED...';
        } else if (progress < 90) {
            loadingText.textContent = 'Finalizing visualization...';
        }
    }, 300);
    
    // Call the updated fallback function with galaxy name
    fallbackToStandardMethod(ra, dec, catalogName, galaxyName);
}

// Updated fallbackToStandardMethod function - include galaxy name in URL
function fallbackToStandardMethod(ra, dec, catalogName, galaxyName = null) {
    console.log("Falling back to standard SED generation method", ra, dec, catalogName, galaxyName);
    
    // Reset progress for fallback method
    updateSedProgress(10, "Generating SED using standard method...");
    
    // Construct the URL for the standard endpoint with galaxy name
    let url = `/generate-sed/?ra=${ra}&dec=${dec}&catalog_name=${encodeURIComponent(catalogName)}`;
    if (galaxyName && galaxyName !== null && galaxyName !== 'Unknown') {
        url += `&galaxy_name=${encodeURIComponent(galaxyName)}`;
    }
    
    // Fetch the SED data
    fetch(url)
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        updateSedProgress(50, "Processing SED data...");
        return response.json();
    })
    .then(data => {
        if (data.error) {
            throw new Error(data.error);
        }
        
        updateSedProgress(80, "Loading SED image...");
        
        const sedImage = document.getElementById('sed-image');
        if (!sedImage) {
            console.error("SED image element not found with ID 'sed-image'");
            throw new Error("SED image element not found");
        }
        
        const timestamp = new Date().getTime();
        let imageLoadSucceeded = false;
        
        sedImage.onload = function() {
            imageLoadSucceeded = true;
            console.log("SED image loaded successfully via standard method");
            updateSedProgress(100, "SED image loaded successfully!");
            
            setTimeout(() => {
                const progressBar = document.getElementById('sed-progress-bar');
                const loadingText = document.getElementById('sed-loading-text');
                if (progressBar) progressBar.style.display = 'none';
                if (loadingText) loadingText.style.display = 'none';
                sedImage.style.display = 'block';
            }, 500);
        };
        
        sedImage.onerror = function(event) {
            if (imageLoadSucceeded) return;
            console.warn("SED Image: 'error' event triggered during loading.", event);
        };
        
        sedImage.src = `${data.url || `/images/${data.filename}`}?t=${timestamp}`;
        sedImageGlobalUrl = data.url || `/images/${data.filename}`;
    })
    .catch(error => {
        console.log("Error in standard method:", error);
        updateSedProgress(0, "Failed to generate SED");
        showNotification(`Error generating SED: ${error.message}`, "error");
    });
}
function updateSedProgress(percent, message) {
    const progressBarFill = document.getElementById('sed-progress-bar-fill');
    const loadingText = document.getElementById('sed-loading-text');
    
    if (progressBarFill) {
        progressBarFill.style.width = `${percent}%`;
        progressBarFill.setAttribute('aria-valuenow', percent);
    }
    
    if (loadingText) {
        loadingText.textContent = message;
    }

    if (percent >= 99) {
        setTimeout(() => {
            const progressBar = document.getElementById('sed-progress-bar');
            const currentLoadingText = document.getElementById('sed-loading-text');
            if (progressBar) progressBar.remove();
            if (currentLoadingText) currentLoadingText.remove();
        }, 500);
    }
}

// Add function to hide SED container
function hideSed() {
    const sedContainer = document.getElementById('sed-container');
    if (sedContainer) {
        sedContainer.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';
        sedContainer.style.transform = 'translateY(100%)';
        sedContainer.style.opacity = '0';
        
        // Wait for animation to finish before hiding and resetting
        setTimeout(() => {
            sedContainer.style.display = 'none';
            // Reset styles for next time it's shown
            sedContainer.style.transform = 'translateY(0)';
            sedContainer.style.opacity = '1'; // Ensure opacity is reset for the next show
        }, 300); // Match transition duration
    }
}

// Function to download the SED image
function downloadSedImage() {
    if (sedImageGlobalUrl) {
        const a = document.createElement('a');
        a.href = sedImageGlobalUrl;

        let filename = 'sed_plot.png'; // Default
        if (currentSedRa !== null && currentSedDec !== null) {
            try {
                filename = `SED_RA${currentSedRa.toFixed(4)}_DEC${currentSedDec.toFixed(4)}.png`;
            } catch (e) {
                console.error("Error formatting filename, using default:", e);
                filename = 'sed_plot_error.png'; // Fallback if toFixed fails (e.g. null values)
            }
        }
        a.download = filename;

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } else {
        console.error("No SED image URL available for download.");
        showNotification("SED image not available for download.", 3000, "error");
    }
}

// Create a container for the Properties display on the left side of the screen
function createPropertiesContainer() {
    // Check if container already exists
    if (document.getElementById('properties-container')) {
        return;
    }
    
    // Create container
    const propertiesContainer = document.createElement('div');
    propertiesContainer.id = 'properties-container';
    propertiesContainer.style.position = 'fixed';
    propertiesContainer.style.top = '0';
    propertiesContainer.style.left = '0';
    propertiesContainer.style.width = '400px'; // Increased width from 300px
    propertiesContainer.style.height = '100%';
    propertiesContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
    propertiesContainer.style.color = 'white';
    propertiesContainer.style.padding = '10px';
    propertiesContainer.style.boxShadow = '2px 0 10px rgba(0, 0, 0, 0.5)';
    propertiesContainer.style.zIndex = '1000';
    propertiesContainer.style.display = 'none';
    propertiesContainer.style.overflowY = 'auto';
    propertiesContainer.style.transition = 'transform 0.3s ease-in-out';
    propertiesContainer.style.transform = 'translateX(-100%)';
    propertiesContainer.style.fontFamily = "'Raleway', sans-serif";
    
    // --- Header Section --- 
    const headerSection = document.createElement('div');
    headerSection.style.padding = '10px 0'; // Keep padding consistent with old header
    headerSection.style.borderBottom = '1px solid rgba(255, 255, 255, 0.3)';
    headerSection.style.marginBottom = '10px'; // Space before search and content

    const titleAndClose = document.createElement('div');
    titleAndClose.style.display = 'flex';
    titleAndClose.style.justifyContent = 'space-between';
    titleAndClose.style.alignItems = 'center';
    titleAndClose.style.marginBottom = '10px'; // Space between title/close and search input
    
    // Create title
    const title = document.createElement('h3');
    title.id = 'properties-title';
    title.style.margin = '0';
    title.style.fontSize = '16px';
    title.textContent = 'Source Properties';
    title.style.fontFamily = "'Raleway', sans-serif";
    title.style.color = 'white';
    
    // Create close button
    const closeButton = document.createElement('div');
    closeButton.innerHTML = '&times;';
    closeButton.style.fontSize = '20px';
    closeButton.style.cursor = 'pointer';
    
    closeButton.style.padding = '0 5px';
    closeButton.style.color = 'white';
    closeButton.style.fontFamily = "'Raleway', sans-serif";
    closeButton.onclick = function() {
        hideProperties();
    };
    
    titleAndClose.appendChild(title);
    titleAndClose.appendChild(closeButton);
    headerSection.appendChild(titleAndClose);

    // --- Search Input --- 
    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.id = 'properties-search-input';
    searchInput.placeholder = 'Search properties...';
    Object.assign(searchInput.style, {
        width: 'calc(100% - 20px)', // Full width minus padding
        padding: '8px 10px',
        margin: '0 auto 10px auto', // Centered with bottom margin
        display: 'block',
        backgroundColor: '#222',
        color: '#fff',
        border: '1px solid #555',
        borderRadius: '3px',
        fontFamily: "'Raleway', sans-serif",
        fontSize: '13px'
    });
    searchInput.addEventListener('input', filterProperties);
    headerSection.appendChild(searchInput);
    
    propertiesContainer.appendChild(headerSection);
    
    // Create content area
    const contentArea = document.createElement('div');
    contentArea.id = 'properties-content';
    contentArea.style.fontSize = '14px';
    contentArea.style.fontFamily = "'Raleway', sans-serif";
    contentArea.style.color = 'white';
    propertiesContainer.appendChild(contentArea);
    
    // Add to document
    document.body.appendChild(propertiesContainer);
}

// Format numbers with appropriate precision and handle large values
function formatNumber(value) {
    if (value === null || value === undefined) return 'N/A';
    
    // Handle very large or very small numbers with scientific notation
    if (Math.abs(value) >= 1e6 || (Math.abs(value) < 0.001 && value !== 0)) {
        return value.toExponential(3);
    }
    
    // For numbers with decimal places
    if (value % 1 !== 0) {
        // Determine appropriate precision based on magnitude
        if (Math.abs(value) < 0.1) return value.toFixed(4);
        if (Math.abs(value) < 1) return value.toFixed(3);
        if (Math.abs(value) < 10) return value.toFixed(2);
        if (Math.abs(value) < 100) return value.toFixed(1);
        return value.toFixed(0);
    }
    
    // For integers, use toLocaleString to add thousands separators
    return value.toLocaleString();
}

function filterProperties() {
    const searchTerm = document.getElementById('properties-search-input').value.toLowerCase();
    const contentArea = document.getElementById('properties-content');
    if (!contentArea) return;

    const entries = contentArea.querySelectorAll('.property-entry');
    entries.forEach(entry => {
        const text = entry.textContent.toLowerCase();
        if (text.includes(searchTerm)) {
            entry.style.display = ''; // Reset to default (will respect parent grid/flex)
        } else {
            entry.style.display = 'none';
        }
    });

    // Handle visibility of section headers if all their content is filtered out (optional advanced enhancement)
    // For now, headers always remain visible.
}

function showProperties(ra, dec, catalogName) {
    // Create properties container if it doesn't exist
    createPropertiesContainer();
    
    // Reset search input when showing new properties
    const searchInput = document.getElementById('properties-search-input');
    if (searchInput) {
        searchInput.value = '';
    }

    // Get container and content elements
    const propertiesContainer = document.getElementById('properties-container');
    const propertiesContent = document.getElementById('properties-content');
    
    // Show container with loading message
    propertiesContainer.style.display = 'block';
    setTimeout(() => {
        propertiesContainer.style.transform = 'translateX(0)';
    }, 10);
    
    propertiesContent.innerHTML = '<div style="text-align: center; padding: 20px; color: white;">Loading properties...</div>';

    // Fetch properties from the server
    fetch(`/source-properties/?ra=${ra}&dec=${dec}&catalog_name=${catalogName}`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to load properties');
            }
            return response.json();
        })
        .then(data => {
            console.log("Properties data:", data);
            
            if (data.error) {
                propertiesContent.innerHTML = `<div style="color: #ff6b6b; padding: 10px;">Error: ${data.error}</div>`;
                return;
            }
            
            // Store the data globally so the save function can access it
            window.currentPropertiesData = {
                ra: ra,
                dec: dec,
                catalogName: catalogName,
                properties: data.properties || {}
            };
            
            // Add save button to the header after data is loaded
            addSaveButtonToPropertiesHeader();
            
            // Format properties
            let html = '';
            
            // Get properties from the response
            const properties = data.properties || {};
            
            // Find RA/DEC columns
            let raValue = ra;
            let decValue = dec;
            
            // Look for RA/DEC in properties
            for (const key in properties) {
                if (key.toLowerCase() === 'ra' || key.toLowerCase().includes('right_ascension') || key.toLowerCase() === 'alpha') {
                    raValue = properties[key];
                }
                if (key.toLowerCase() === 'dec' || key.toLowerCase().includes('declination') || key.toLowerCase() === 'delta') {
                    decValue = properties[key];
                }
            }
            
            // Add coordinates section
            html += `<div class="property-section" style="margin-bottom: 15px; font-family: 'Raleway', sans-serif;">
                <h4 class="property-section-header" style="margin: 0 0 8px 0; color: #4CAF50; border-bottom: 1px solid #4CAF50; padding-bottom: 5px; font-family: 'Raleway', sans-serif; color: white;">Coordinates</h4>
                <div style="display: grid; grid-template-columns: auto 1fr; gap: 3px 8px;">`; // Changed grid template for auto key width
            
            html += `<div class="property-entry" style="display: contents;"><div style="color: #aaa; white-space: nowrap;">RA:</div><div style="color: white; word-break: break-all;">${raValue}°</div></div>`;
            html += `<div class="property-entry" style="display: contents;"><div style="color: #aaa; white-space: nowrap;">DEC:</div><div style="color: white; word-break: break-all;">${decValue}°</div></div>`;
            if (properties.galaxy) {
                 html += `<div class="property-entry" style="display: contents;"><div style="color: #aaa; white-space: nowrap;">Galaxy:</div><div style="font-weight: bold; color: white; word-break: break-all;">${properties.galaxy}</div></div>`;
            }
            html += `</div></div>`; // Close coordinates grid and section
            
            // Find all boolean properties
            const booleanProps = {};
            
            // Scan all properties for boolean values
            for (const key in properties) {
                if (typeof properties[key] === 'boolean') {
                    booleanProps[key] = properties[key];
                }
            }
            
            // Add boolean properties section if any are found
            if (Object.keys(booleanProps).length > 0) {
                html += `<div class="property-section" style="margin-bottom: 5px; margin-top: 5px; font-family: 'Raleway', sans-serif;">
                         <h4 class="property-section-header" style="margin: 0 0 8px 0; color: #ffeb3b; border-bottom: 1px solid #ffeb3b; padding-bottom: 5px; font-family: 'Raleway', sans-serif; color: white;">Flags</h4>
                         <div style="display: grid; grid-template-columns: auto 1fr; gap: 3px 8px;">`;
                
                // Sort boolean properties alphabetically (case-insensitive)
                const sortedBoolProps = Object.keys(booleanProps).sort((a, b) => 
                    a.toLowerCase().localeCompare(b.toLowerCase()));
                
                for (const prop of sortedBoolProps) {
                    const value = booleanProps[prop];
                    let formattedValue, valueStyle = '';
                    
                    if (value) {
                        formattedValue = 'Yes';
                        valueStyle = 'color: #4CAF50; font-weight: bold;';
                    } else {
                        formattedValue = 'No';
                        valueStyle = 'color: #F44336;';
                    }
                    
                    html += `<div class="property-entry" style="display: contents;">
                                <div style="color: #aaa; font-weight: bold; white-space: nowrap;">${prop}:</div>
                                <div style="${valueStyle}; word-break: break-all;">${formattedValue}</div>
                             </div>`;
                }
                
                html += `</div></div>`; // Close boolean grid and section
            }
            
            // Add all remaining properties
            if (Object.keys(properties).length > 0) {
                const remainingPropsExist = Object.keys(properties).some(key => typeof properties[key] !== 'boolean' && key.toLowerCase() !== 'galaxy');
                if (remainingPropsExist) {
                    html += `<div class="property-section" style="font-family: 'Raleway', sans-serif;">
                        <h4 class="property-section-header" style="margin: 0 0 8px 0; color: #2196F3; border-bottom: 1px solid #2196F3; padding-bottom: 5px; font-family: 'Raleway', sans-serif; color: white;">Catalog Properties</h4>
                        <div style="display: grid; grid-template-columns: auto 1fr; gap: 3px 8px;">`;
                
                    // Group properties by category
                    const groupedProps = {};
                    const errorProps = {};
                    
                    // First pass: identify error properties and group them
                    for (const key of Object.keys(properties)) {
                        // Skip boolean properties as they're already displayed
                        if (typeof properties[key] === 'boolean') {
                            continue;
                        }
                        
                        // Skip null or empty Bayes and best properties
                        if ((key.startsWith('bayes.') || key.startsWith('best.')) && 
                            (properties[key] === null || properties[key] === '' || properties[key] === 0)) {
                            continue;
                        }
                        
                        if (key.endsWith('_err') || key.endsWith('_error')) {
                            const baseKey = key.replace(/_err$|_error$/, '');
                            errorProps[baseKey] = key;
                        } else {
                            // Group by first part of the name (before first dot or underscore)
                            const group = key.split(/[._]/)[0];
                            if (!groupedProps[group]) {
                                groupedProps[group] = [];
                            }
                            groupedProps[group].push(key);
                        }
                    }
                    
                    // Sort groups alphabetically
                    const sortedGroups = Object.keys(groupedProps).sort();
                    
                    // Process each group
                    for (const group of sortedGroups) {
                        // Sort properties within group
                        const sortedPropsInGroup = groupedProps[group].sort((a,b) => a.toLowerCase().localeCompare(b.toLowerCase()));
                        
                        // Add group header if there are multiple groups and more than one property in this group
                        if (sortedGroups.length > 1 && sortedPropsInGroup.length > 0 && (group.toLowerCase() === 'bayes' || group.toLowerCase() === 'best')) {
                            let groupTitle = group.toUpperCase();
                            if (group.toLowerCase() === 'bayes' || group.toLowerCase() === 'best') {
                                groupTitle = `CIGALE ${groupTitle}`;
                            }
                            // This group header itself is not a property-entry, so it won't be hidden by search unless all its items are.
                            html += `<div style="grid-column: 1 / -1; margin-top: 10px; margin-bottom: 5px; color: #03A9F4; font-weight: bold; border-top: 1px dashed #03A9F4; padding-top: 5px;">${groupTitle}</div>`;
                        }
                        
                        for (const key of sortedPropsInGroup) {
                            // Skip RA/DEC as they're already included separately
                            if (key.toLowerCase() === 'ra' || key.toLowerCase() === 'dec' || 
                                key.toLowerCase().includes('right_ascension') || key.toLowerCase().includes('declination') ||
                                key.toLowerCase() === 'galaxy') { // Also skip galaxy as it's already in the coordinates section
                                continue;
                            }
                            if (typeof properties[key] === 'boolean') continue; // Already handled by booleanProps

                            const propData = properties[key];
                            let value, unit;
                            
                            // Handle both old and new format
                            if (propData && typeof propData === 'object' && 'value' in propData) {
                                // New format with units
                                value = propData.value;
                                unit = propData.unit;
                            } else {
                                // Old format without units
                                value = propData;
                                
                                // Try to infer unit from key name
                                if (key.includes('mass')) unit = 'M☉';
                                else if (key.includes('luminosity')) unit = 'L☉';
                                else if (key.includes('age')) unit = 'Myr';
                                else if (key.includes('sfr')) unit = 'M☉/yr';
                                else if (key.includes('metallicity')) unit = 'Z☉';
                                else if (key.includes('distance')) unit = 'kpc';
                                else if (key.includes('radius')) unit = 'kpc';
                                else if (key.includes('flux')) unit = 'μJy';
                                else if (key.includes('mag')) unit = 'mag';
                                else unit = '';
                            }
                            
                            // Format the value based on type
                            let formattedValue;
                            let valueStyle = '';
                            
                            if (value === null || value === undefined) {
                                formattedValue = 'N/A';
                            } else if (typeof value === 'boolean') {
                                // Special formatting for boolean values
                                if (value) {
                                    formattedValue = 'Yes';
                                    valueStyle = 'color: #4CAF50; font-weight: bold;';
                                } else {
                                    formattedValue = 'No';
                                    valueStyle = 'color: #F44336;';
                                }
                            } else if (typeof value === 'number') {
                                // Use our improved number formatting function
                                formattedValue = formatNumber(value);
                            } else {
                                formattedValue = value.toString();
                            }
                            
                            // Check if there's an error value for this property
                            let errorDisplay = '';
                            if (errorProps[key] && properties[errorProps[key]] !== undefined) {
                                const errorValue = properties[errorProps[key]];
                                if (typeof errorValue === 'number') {
                                    // Use our improved number formatting for errors too
                                    errorDisplay = ` ± ${formatNumber(errorValue)}`;
                                } else {
                                    errorDisplay = ` ± ${errorValue}`;
                                }
                            }
                            
                            // Display with unit if available
                            const displayValue = unit ? `${formattedValue}${errorDisplay} ${unit}` : `${formattedValue}${errorDisplay}`;
                            
                            html += `<div class="property-entry" style="display: contents;">
                                        <div style="color: #aaa; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${key}:</div>
                                        <div style="overflow: hidden; text-overflow: ellipsis; ${valueStyle}; color: white; word-break: break-all;">${displayValue}</div>
                                     </div>`;
                        }
                    }
                    html += `</div></div>`; // Close catalog properties grid and section
                } // end if remainingPropsExist
            } else if (Object.keys(booleanProps).length === 0) { // if no properties at all (neither regular nor boolean)
                html += `<div style="color: #ff9800; padding: 10px;">No properties found for this source.</div>`;
            }
            
            // Add extra space at the end
            html += `<div style="height: 40px;"></div>`;
            
            propertiesContent.innerHTML = html;
            filterProperties(); // Apply filter initially (e.g. if search input had text from previous view)
        })
        .catch(error => {
            console.error('Error loading properties:', error);
            propertiesContent.innerHTML = `<div style="color: #ff6b6b; padding: 10px;">Error loading properties: ${error.message}</div>`;
        });
}

// Function to add save button to properties header
function addSaveButtonToPropertiesHeader() {
    console.log('Attempting to add save button to properties header...');
    
    // Try multiple ways to find the header
    let header = document.getElementById('properties-header');
    if (!header) {
        header = document.querySelector('#properties-container .header');
    }
    if (!header) {
        header = document.querySelector('#properties-container [style*="flex"][style*="justify-content"]');
    }
    
    console.log('Properties header found:', !!header);
    if (!header) {
        console.warn('Properties header not found');
        return;
    }
    
    // Check if save button already exists
    if (document.getElementById('properties-save-button')) {
        console.log('Save button already exists');
        return;
    }
    
    // Try multiple ways to find the close button
    let closeButton = header.querySelector('[onclick*="hideProperties"]');
    if (!closeButton) {
        closeButton = header.querySelector('button:last-child');
    }
    if (!closeButton) {
        closeButton = header.querySelector('[style*="cursor: pointer"]:last-child');
    }
    if (!closeButton) {
        closeButton = header.querySelector('div:last-child');
    }
    
    console.log('Close button found:', !!closeButton);
    if (!closeButton) {
        console.warn('Close button not found in header');
        return;
    }
    
    // Create save button
    const saveButton = document.createElement('button');
    saveButton.id = 'properties-save-button';
    saveButton.title = 'Save Properties as Text';
    saveButton.style.background = 'none';
    saveButton.style.border = 'none';
    saveButton.style.cursor = 'pointer';
    saveButton.style.padding = '5px';
    saveButton.style.display = 'flex';
    saveButton.style.position = 'absolute';
    saveButton.style.right = '30px';
    saveButton.style.alignItems = 'center';
    saveButton.style.justifyContent = 'center';
    saveButton.style.marginRight = '10px';
    
    // SVG icon for save (same as other save buttons)
    saveButton.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#cccccc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
        <polyline points="17,21 17,13 7,13 7,21"></polyline>
        <polyline points="7,3 7,8 15,8"></polyline>
    </svg>`;
    
    saveButton.onmouseover = function() { 
        saveButton.querySelector('svg').style.stroke = '#ffffff'; 
    };
    saveButton.onmouseout = function() { 
        saveButton.querySelector('svg').style.stroke = '#cccccc'; 
    };
    
    saveButton.onclick = function() {
        savePropertiesAsText();
    };
    
    // Insert save button before close button
    try {
        closeButton.parentNode.insertBefore(saveButton, closeButton);
        console.log('Save button added successfully');
    } catch (error) {
        console.error('Error inserting save button:', error);
        // Fallback: append to header
        header.appendChild(saveButton);
        console.log('Save button appended to header as fallback');
    }
}

// Function to save properties as text file
function savePropertiesAsText() {
    if (!window.currentPropertiesData) {
        showNotification('No properties data available to save.', 'error');
        return;
    }
    
    const data = window.currentPropertiesData;
    const properties = data.properties;
    
    // Create header line with all property names
    const propertyNames = [];
    const propertyValues = [];
    
    // Add basic info first
    propertyNames.push('source_id', 'ra', 'dec');
    
    // Create a simple source ID from coordinates
    const raStr = typeof data.ra === 'number' ? data.ra.toFixed(6) : data.ra;
    const decStr = typeof data.dec === 'number' ? data.dec.toFixed(6) : data.dec;
    const sourceId = `source_${raStr}_${decStr}`;
    
    propertyValues.push(sourceId, raStr, decStr);
    
    // Add galaxy if available
    if (properties.galaxy) {
        propertyNames.push('galaxy');
        propertyValues.push(properties.galaxy);
    }
    
    // Collect all other properties in order
    const allProps = [];
    
    // Group properties by prefix for better organization
    const groupedProps = {};
    for (const key in properties) {
        if (key.toLowerCase() === 'galaxy') continue; // Already handled
        
        const prefix = key.split(/[._]/)[0];
        if (!groupedProps[prefix]) {
            groupedProps[prefix] = [];
        }
        groupedProps[prefix].push(key);
    }
    
    // Sort groups and properties within groups
    const sortedGroups = Object.keys(groupedProps).sort();
    
    for (const group of sortedGroups) {
        const sortedProps = groupedProps[group].sort();
        allProps.push(...sortedProps);
    }
    
    // Add properties and their values
    for (const key of allProps) {
        propertyNames.push(key);
        
        const propData = properties[key];
        let value;
        
        if (propData && typeof propData === 'object' && 'value' in propData) {
            value = propData.value;
        } else {
            value = propData;
        }
        
        // Format the value
        if (value === null || value === undefined) {
            propertyValues.push('NaN');
        } else if (typeof value === 'boolean') {
            propertyValues.push(value ? '1' : '0');
        } else if (typeof value === 'number') {
            // Keep full precision for numbers
            propertyValues.push(value.toString());
        } else {
            propertyValues.push(value.toString());
        }
    }
    
    // Create the output - header line followed by data line
    let textContent = '';
    
    // Header line (column names)
    textContent += propertyNames.join('\t') + '\n';
    
    // Data line (values)
    textContent += propertyValues.join('\t') + '\n';
    
    // Create and download file
    const blob = new Blob([textContent], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    // Create filename
    const filename = `${sourceId}.txt`;
    
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    
    showNotification('Properties saved as tabular data.', 'success');
}

// Hide properties panel
function hideProperties() {
    const propertiesContainer = document.getElementById('properties-container');
    if (propertiesContainer) {
        propertiesContainer.style.transform = 'translateX(-100%)';
        setTimeout(() => {
            propertiesContainer.style.display = 'none';
        }, 300);
    }
}

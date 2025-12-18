// Generate histogram from the selected data
function generateHistogram() {
    // Get the selected axis
    const xAxisSelect = document.getElementById('x-axis-select');
    const xAxisSearch = document.getElementById('x-axis-search');
    
    // Get the selected value (either from the select or the search input)
    const xAxisName = xAxisSelect.value || xAxisSearch.value;
    
    // Validate selection
    if (!xAxisName) {
        showNotification('Please select an X axis for the histogram', 3000);
        return;
    }
    
    // Get customization options
    const plotTitle = document.getElementById('plot-title-input')?.value || '';
    const xLabel = document.getElementById('x-label-input')?.value || xAxisName;
    const yLabel = document.getElementById('y-label-input')?.value || 'Count';
    const xScale = document.getElementById('x-scale-select')?.value || 'linear';
    const yScale = document.getElementById('y-scale-select')?.value || 'linear';
    const autoLimits = document.getElementById('auto-limits-checkbox')?.checked ?? true;
    const numBins = parseInt(document.getElementById('bins-slider')?.value || 20);
    const barColor = document.getElementById('bar-color-picker')?.value || '#4CAF50';
    const normalization = document.getElementById('normalization-select')?.value || 'count';
    
    // Get manual limits if auto-limits is disabled
    let xMin = null, xMax = null, yMin = null, yMax = null;
    
    if (!autoLimits) {
        xMin = document.getElementById('x-min-input')?.value !== '' ? 
            parseFloat(document.getElementById('x-min-input').value) : null;
        xMax = document.getElementById('x-max-input')?.value !== '' ? 
            parseFloat(document.getElementById('x-max-input').value) : null;
        yMin = document.getElementById('y-min-input')?.value !== '' ? 
            parseFloat(document.getElementById('y-min-input').value) : null;
        yMax = document.getElementById('y-max-input')?.value !== '' ? 
            parseFloat(document.getElementById('y-max-input').value) : null;
    }
    
    // --- BEGIN MODIFICATION: Adjust manual log limits ---
    let limitsAdjusted = false;
    if (!autoLimits) {
        if (xScale === 'log') {
            if (xMin !== null && xMin <= 0) {
                xMin = 0.1; // Or calculate min positive value from data if needed
                limitsAdjusted = true;
                console.warn("Manual X Min <= 0 adjusted to 0.1 for log scale.");
            }
            if (xMax !== null && xMin !== null && xMax <= xMin) {
                xMax = xMin * 10; // Ensure max is greater than min
                limitsAdjusted = true;
                console.warn("Manual X Max <= X Min adjusted for log scale.");
            }
        }
        if (yScale === 'log') {
            if (yMin !== null && yMin <= 0) {
                yMin = 0.1; // Or calculate min positive value from data if needed
                limitsAdjusted = true;
                console.warn("Manual Y Min <= 0 adjusted to 0.1 for log scale.");
            }
            if (yMax !== null && yMin !== null && yMax <= yMin) {
                yMax = yMin * 10; // Ensure max is greater than min
                limitsAdjusted = true;
                console.warn("Manual Y Max <= Y Min adjusted for log scale.");
            }
        }
    }
    if (limitsAdjusted) {
        showNotification("Manual axis limits adjusted for log scale (must be > 0)", 4000);
    }
    // --- END MODIFICATION ---
    
    // Get the plot area
    const plotArea = document.getElementById('plot-area');
    if (!plotArea) return;
    
    // Clear the plot area completely before showing loading message
    plotArea.innerHTML = '';
    plotArea.style.position = 'relative';
    
    // Create a centered loading container
    const loadingContainer = document.createElement('div');
    loadingContainer.style.display = 'flex';
    loadingContainer.style.flexDirection = 'column';
    loadingContainer.style.alignItems = 'center';
    loadingContainer.style.justifyContent = 'center';
    loadingContainer.style.width = '100%';
    loadingContainer.style.height = '100%';
    
    // Create a loading spinner
    const spinner = document.createElement('div');
    spinner.style.border = '5px solid #f3f3f3';
    spinner.style.borderTop = '5px solid #3498db';
    spinner.style.borderRadius = '50%';
    spinner.style.width = '40px';
    spinner.style.height = '40px';
    spinner.style.animation = 'spin 2s linear infinite';
    spinner.style.marginBottom = '10px';
    
    // Add the animation style for the spinner if it doesn't exist
    if (!document.querySelector('style[data-spinner]')) {
        const styleElement = document.createElement('style');
        styleElement.setAttribute('data-spinner', 'true');
        styleElement.textContent = `
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(styleElement);
    }
    
    // Create loading text
    const loadingText = document.createElement('div');
    loadingText.textContent = 'Processing data for histogram...';
    loadingText.style.color = '#aaa';
    loadingText.style.marginTop = '10px';
    
    // Add spinner and text to the loading container
    loadingContainer.appendChild(spinner);
    loadingContainer.appendChild(loadingText);
    
    // Add the loading container to the plot area
    plotArea.appendChild(loadingContainer);
    
    // Determine current catalog
    const catalogSelect = document.getElementById('catalog-select');
    const selectedCatalog = catalogSelect ? catalogSelect.value : null;
    const catalogToUse =
        selectedCatalog ||
        window.plotterSelectedCatalogName ||
        window.currentCatalogName ||
        window.activeCatalog ||
        (typeof activeCatalog !== 'undefined' ? activeCatalog : null);

    // Use the existing data only if it matches the current catalog
    if (window.sourcePropertiesData && window.sourcePropertiesData.length > 0 && window.sourcePropertiesCatalogName === catalogToUse) {
        // Process the existing data
        processHistogramData(
            plotArea, 
            window.sourcePropertiesData, 
            xAxisName, 
            {
                title: plotTitle,
                xLabel: xLabel,
                yLabel: yLabel,
                xScale: xScale,
                yScale: yScale,
                xMin: xMin,
                xMax: xMax,
                yMin: yMin,
                yMax: yMax,
                autoLimits: autoLimits,
                numBins: numBins,
                barColor: barColor,
                normalization: normalization
            }
        );
        return;
    }
    
    // If we don't have data already or cache is for another catalog, load it
    if (!catalogToUse) {
        // Clear loading container and show error message
        plotArea.innerHTML = '';
        
        const errorMessage = document.createElement('div');
        errorMessage.textContent = 'No catalog selected. Please select a catalog first.';
        errorMessage.style.color = '#aaa';
        errorMessage.style.textAlign = 'center';
        errorMessage.style.width = '100%';
        errorMessage.style.height = '100%';
        errorMessage.style.display = 'flex';
        errorMessage.style.alignItems = 'center';
        errorMessage.style.justifyContent = 'center';
        
        plotArea.appendChild(errorMessage);
        return;
    }
    
    // Use either the selected catalog or active catalog
    
    // Update loading message
    loadingText.textContent = 'Loading catalog data...';
    
    // Load the catalog data (pass RA/DEC overrides if available)
    {
        const urlParams = new URLSearchParams();
        // Try persisted overrides by several keys: raw name and API basename
        const apiName = (catalogToUse || '').toString().split('/').pop().split('\\').pop();
        const persisted = (window.catalogOverridesByCatalog && (
            window.catalogOverridesByCatalog[catalogToUse] ||
            window.catalogOverridesByCatalog[apiName]
        )) || null;
        const raCol = persisted && persisted.ra_col ? persisted.ra_col : 'ra';
        const decCol = persisted && persisted.dec_col ? persisted.dec_col : 'dec';
        const sizeCol = persisted && persisted.size_col ? persisted.size_col : null;
        if (raCol) urlParams.set('ra_col', raCol);
        if (decCol) urlParams.set('dec_col', decCol);
        if (sizeCol) urlParams.set('size_col', sizeCol);
        const headers = {};
        if (raCol) headers['X-RA-Col'] = raCol;
        if (decCol) headers['X-DEC-Col'] = decCol;
        if (sizeCol) headers['X-Size-Col'] = sizeCol;
        const suffix = urlParams.toString() ? `?${urlParams.toString()}` : '';
        // Load the catalog data
        console.log('[plotter] /plotter/load-catalog bootstrap URL:', `/plotter/load-catalog/${apiName}${suffix}`, 'headers:', headers);
        apiFetch(`/plotter/load-catalog/${apiName}${suffix}`, { headers })
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to load catalog');
            }
            return response.json();
        })
        .then(catalogData => {
            if (!catalogData || catalogData.length === 0) {
                throw new Error('No catalog data available');
            }
            
            // Create an array to store all properties
            const maxObjectsToProcess = 500; // Limit to prevent too many requests
            
            // If there are too many objects, sample them
            let objectsToFetch = catalogData;
            if (catalogData.length > maxObjectsToProcess) {
                // Sample objects evenly
                const step = Math.floor(catalogData.length / maxObjectsToProcess);
                objectsToFetch = [];
                for (let i = 0; i < catalogData.length; i += step) {
                    objectsToFetch.push(catalogData[i]);
                }
            }
            
            // Update loading text
            loadingText.textContent = 'Loading data: 0%';
            
            // Create an array of promises to fetch properties for each object
            const fetchPromises = objectsToFetch.map((obj, index) => {
                return new Promise((resolve, reject) => {
                    // Add a small delay to prevent overwhelming the server
                    setTimeout(() => {
                        apiFetch(`/source-properties/?ra=${obj.ra}&dec=${obj.dec}&catalog_name=${catalogToUse}`)
                            .then(response => {
                                if (!response.ok) {
                                    throw new Error(`Failed to load properties for object ${index}`);
                                }
                                return response.json();
                            })
                            .then(data => {
                                if (data.error) {
                                    throw new Error(data.error);
                                }
                                
                                // Update loading indicator
                                const progress = Math.round((index + 1) / objectsToFetch.length * 100);
                                loadingText.textContent = `Loading data: ${progress}%`;
                                
                                // Add the original object reference for tooltip
                                const properties = data.properties || {};
                                properties._originalObj = obj;
                                
                                resolve(properties);
                            })
                            .catch(error => {
                                console.error(`Error fetching properties for object ${index}:`, error);
                                resolve(null); // Resolve with null to continue processing other objects
                            });
                    }, index * 10); // Small delay between requests
                });
            });
            
            // Process all data once fetched
            return Promise.all(fetchPromises)
                .then(results => {
                    // Filter out null results
                    const validResults = results.filter(result => result !== null);
                    
                    if (validResults.length === 0) {
                        throw new Error('No valid data found');
                    }
                    
                    // Store the data for future use
                    window.sourcePropertiesData = validResults;
                    try { window.sourcePropertiesCatalogName = catalogToUse; } catch(_) {}
                    
                    // Clear the loading container completely
                    plotArea.innerHTML = '';
                    
                    // Process the data for histogram
                    return processHistogramData(
                        plotArea, 
                        validResults, 
                        xAxisName, 
                        {
                            title: plotTitle,
                            xLabel: xLabel,
                            yLabel: yLabel,
                            xScale: xScale,
                            yScale: yScale,
                            xMin: xMin,
                            xMax: xMax,
                            yMin: yMin,
                            yMax: yMax,
                            autoLimits: autoLimits,
                            numBins: numBins,
                            barColor: barColor,
                            normalization: normalization
                        }
                    );
                });
        })
        .catch(error => {
            console.error('Error loading catalog data:', error);
            
            // Clear loading container and show error message
            plotArea.innerHTML = '';
            
            const errorMessage = document.createElement('div');
            errorMessage.textContent = `Error loading catalog data: ${error.message}`;
            errorMessage.style.color = '#ff6b6b';
            errorMessage.style.textAlign = 'center';
            errorMessage.style.width = '100%';
            errorMessage.style.height = '100%';
            errorMessage.style.display = 'flex';
            errorMessage.style.alignItems = 'center';
            errorMessage.style.justifyContent = 'center';
            
            plotArea.appendChild(errorMessage);
        });
    }
}

// Process data for histogram
function processHistogramData(plotArea, allData, xAxisName, customizationOptions) {
    // Check if we have data
    if (!allData || allData.length === 0) {
        plotArea.textContent = 'No data available for histogram';
        return;
    }
    
    // Extract values for the selected axis
    const allValues = [];
    const categoryMap = new Map(); // For categorical X values
    
    // First pass: collect all values
    allData.forEach(obj => {
        const xValue = obj[xAxisName];
        
        // Skip if value is undefined or null
        if (xValue === undefined || xValue === null) {
            return;
        }
        
        // Handle categorical values
        if (typeof xValue === 'string') {
            if (!categoryMap.has(xValue)) {
                categoryMap.set(xValue, categoryMap.size + 1);
            }
            allValues.push(categoryMap.get(xValue));
        } else {
            // Handle numeric values
            const numericValue = parseFloat(xValue);
            if (!isNaN(numericValue)) {
                allValues.push(numericValue);
            }
        }
    });
    
    // Check if we have any valid values
    if (allValues.length === 0) {
        plotArea.textContent = `No valid values found for ${xAxisName}`;
        return;
    }
    
    // Check if using logarithmic scale with non-positive values
    if (customizationOptions.xScale === 'log') {
        const positiveValues = allValues.filter(v => v > 0);
        if (positiveValues.length === 0) {
            plotArea.innerHTML = '<div style="color: #ff6b6b; text-align: center; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">Cannot create log-scale histogram with non-positive values</div>';
            return;
        }
        if (positiveValues.length < allValues.length) {
            // Show warning but proceed with positive values only
            const warningDiv = document.createElement('div');
            warningDiv.style.position = 'absolute';
            warningDiv.style.top = '0';
            warningDiv.style.left = '0';
            warningDiv.style.backgroundColor = 'rgba(255, 193, 7, 0.8)';
            warningDiv.style.color = 'black';
            warningDiv.style.padding = '5px 10px';
            warningDiv.style.fontSize = '12px';
            warningDiv.style.borderRadius = '0 0 4px 0';
            warningDiv.textContent = `Warning: ${allValues.length - positiveValues.length} non-positive values excluded from log scale`;
            plotArea.appendChild(warningDiv);
        }
    }
    
    // Create the histogram with the processed data
    createHistogram(
        plotArea, 
        allValues, 
        xAxisName, 
        categoryMap,
        customizationOptions
    );
}
// Create a histogram with the processed data
function createHistogram(plotArea, values, xAxisName, categoryMap, customizationOptions) {
    // Extract customization options with defaults
    const {
        title = '',
        xLabel = xAxisName,
        yLabel = 'Count',
        xScale = 'linear',
        yScale = 'linear',
        xMin = null,
        xMax = null,
        yMin = null,
        yMax = null,
        autoLimits = true,
        numBins = 20,
        barColor = '#4CAF50',
        normalization = 'count'
    } = customizationOptions || {};
    
    // Ensure min and max are valid for logarithmic scales
    let min, max;
    
    if (xScale === 'log') {
        // For log scale, filter out non-positive values
        const positiveValues = values.filter(v => v > 0);
        if (positiveValues.length === 0) {
            plotArea.innerHTML = '<div style="color: #ff6b6b; text-align: center; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">Cannot create log-scale histogram with non-positive values</div>';
            return;
        }
        min = autoLimits ? Math.min(...positiveValues) : (xMin !== null && xMin > 0 ? xMin : Math.min(...positiveValues));
        max = autoLimits ? Math.max(...positiveValues) : (xMax !== null ? xMax : Math.max(...positiveValues));
    } else {
        // For linear scale, use all values
        min = autoLimits ? Math.min(...values) : (xMin !== null ? xMin : Math.min(...values));
        max = autoLimits ? Math.max(...values) : (xMax !== null ? xMax : Math.max(...values));
    }
    
    // Prepare bins and edges
    const bins = Array(numBins).fill(0);
    const binEdges = [];
    let binWidths = [];
    
    if (xScale === 'log') {
        const logMin = Math.log10(min);
        const logMax = Math.log10(max);
        const logRange = logMax - logMin;
        for (let i = 0; i <= numBins; i++) {
            const edge = Math.pow(10, logMin + (i / numBins) * logRange);
            binEdges.push(edge);
            if (i > 0) {
                binWidths.push(edge - binEdges[i - 1]);
            }
        }
        values.forEach(value => {
            if (value <= 0) return;
            if (value >= min && value <= max) {
                const idx = Math.min(Math.floor(((Math.log10(value) - logMin) / (logRange)) * numBins), numBins - 1);
                bins[idx]++;
            }
        });
    } else {
        const linearBinWidth = (max - min) / numBins;
        for (let i = 0; i <= numBins; i++) binEdges.push(min + i * linearBinWidth);
        binWidths = Array(numBins).fill(linearBinWidth);
        values.forEach(value => {
            if (value >= min && value <= max) {
                const idx = Math.min(Math.floor((value - min) / linearBinWidth), numBins - 1);
                bins[idx]++;
            }
        });
    }
    const totalValues = values.length;
    
    // Normalize bin values based on the selected normalization type
    let normalizedBins = [...bins];
    let normalizedYLabel = yLabel;
    
    switch (normalization) {
        case 'frequency':
            normalizedBins = bins.map((count, i) => count / (binWidths[i] || 1));
            normalizedYLabel = yLabel !== 'Count' ? yLabel : 'Frequency (count/bin width)';
            break;
        case 'density':
            // Normalize so the total area equals 1
            const totalArea = bins.reduce((sum, count, i) => sum + count * (binWidths[i] || 0), 0);
            normalizedBins = bins.map((count, i) => totalArea > 0 ? count / totalArea : 0);
            normalizedYLabel = yLabel !== 'Count' ? yLabel : 'Density (area = 1)';
            break;
        case 'percent':
            // Normalize so the sum equals 100
            const totalCount = bins.reduce((sum, count) => sum + count, 0);
            normalizedBins = bins.map(count => totalCount > 0 ? (count / totalCount) * 100 : 0);
            normalizedYLabel = yLabel !== 'Count' ? yLabel : 'Percent (%)';
            break;
        case 'probability':
            // Normalize so the sum equals 1
            const total = bins.reduce((sum, count) => sum + count, 0);
            normalizedBins = bins.map(count => total > 0 ? count / total : 0);
            normalizedYLabel = yLabel !== 'Count' ? yLabel : 'Probability';
            break;
        default:
            // No normalization (raw counts)
            normalizedYLabel = yLabel !== 'Count' ? yLabel : 'Count';
            break;
    }
    
    // Find max count for Y axis scaling
    const maxCount = Math.max(...normalizedBins);
    
    // Calculate y-axis limits
    let yMinValue, yMaxValue;
    
    if (yScale === 'log') {
        // For log scale, ensure minimum positive value
        const minPositiveValue = normalizedBins.filter(v => v > 0).reduce((min, v) => Math.min(min, v), Infinity) || 0.1;
        yMinValue = yMin !== null ? Math.max(0.1, yMin) : minPositiveValue;
        yMaxValue = yMax !== null ? yMax : Math.max(yMinValue * 10, maxCount * 1.1);
    } else {
        // For linear scale
        yMinValue = yMin !== null ? yMin : 0;
        yMaxValue = yMax !== null ? yMax : maxCount * 1.1;
    }
    
    // Create SVG element
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.style.backgroundColor = '#222';
    
    // Calculate plot area dimensions
    const margin = { top: 40, right: 30, bottom: 50, left: 60 };
    const width = plotArea.clientWidth - margin.left - margin.right;
    const height = plotArea.clientHeight - margin.top - margin.bottom;
    
    // Create a group for the plot
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `translate(${margin.left}, ${margin.top})`);
    
    // Add title if provided
    if (title) {
        const titleElement = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        titleElement.setAttribute('x', width / 2);
        titleElement.setAttribute('y', -20);
        titleElement.setAttribute('text-anchor', 'middle');
        titleElement.setAttribute('fill', 'white');
        titleElement.setAttribute('font-size', '16px');
        titleElement.setAttribute('font-weight', 'bold');
        titleElement.textContent = title;
        g.appendChild(titleElement);
    }
    
    // Add axes
    const axisColor = '#888';
    const axisWidth = 1;
    const tickLength = 5;
    const tickWidth = 1;
    const tickColor = '#888';
    const labelColor = '#aaa';
    const labelFontSize = 10;
    
    // Create x-axis line
    const xAxisLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    xAxisLine.setAttribute('x1', 0);
    xAxisLine.setAttribute('y1', height);
    xAxisLine.setAttribute('x2', width);
    xAxisLine.setAttribute('y2', height);
    xAxisLine.setAttribute('stroke', axisColor);
    xAxisLine.setAttribute('stroke-width', axisWidth);
    g.appendChild(xAxisLine);
    
    // Create y-axis line
    const yAxisLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    yAxisLine.setAttribute('x1', 0);
    yAxisLine.setAttribute('y1', 0);
    yAxisLine.setAttribute('x2', 0);
    yAxisLine.setAttribute('y2', height);
    yAxisLine.setAttribute('stroke', axisColor);
    yAxisLine.setAttribute('stroke-width', axisWidth);
    g.appendChild(yAxisLine);
    
    // Add x-axis label
    const xAxisLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    xAxisLabel.setAttribute('x', width / 2);
    xAxisLabel.setAttribute('y', height + 35);
    xAxisLabel.setAttribute('text-anchor', 'middle');
    xAxisLabel.setAttribute('fill', 'white');
    xAxisLabel.setAttribute('font-size', '12px');
    xAxisLabel.innerHTML = renderLatexLabel(xLabel);
    g.appendChild(xAxisLabel);
    
    // Add y-axis label
    const yAxisLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    yAxisLabel.setAttribute('transform', `translate(-40, ${height / 2}) rotate(-90)`);
    yAxisLabel.setAttribute('text-anchor', 'middle');
    yAxisLabel.setAttribute('fill', 'white');
    yAxisLabel.setAttribute('font-size', '12px');
    yAxisLabel.innerHTML = renderLatexLabel(normalizedYLabel);
    g.appendChild(yAxisLabel);
    
    // Helper function to format tick values
    function formatTickValue(value, isLog = false) {
        if (isLog) {
            // For log scale, format powers of 10 nicely
            const exponent = Math.log10(value);
            const roundedExponent = Math.round(exponent);
            if (Math.abs(exponent - roundedExponent) < 0.01) {
                if (roundedExponent === 0) return '1';
                if (roundedExponent === 1) return '10';
                if (roundedExponent === 2) return '100';
                return `10^${roundedExponent}`;
            }
        }
        
        // For small values or integers, show full value
        if (Number.isInteger(value) || Math.abs(value) < 0.001 || Math.abs(value) >= 10000) {
            return value.toExponential(1);
        }
        
        // For other values, format with appropriate precision
        return value.toPrecision(3);
    }
    
    // Create x-axis ticks
    const numXTicks = Math.min(10, numBins);
    const categoryThreshold = (max - min) / numBins;
    
    for (let i = 0; i <= numXTicks; i++) {
        const position = i / numXTicks;
        let tickX;
        let tickValue;
        
        if (xScale === 'log') {
            // For log scale
            const logMin = Math.log10(min);
            const logMax = Math.log10(max);
            tickValue = Math.pow(10, logMin + position * (logMax - logMin));
            const tickPos = (Math.log10(tickValue) - logMin) / (logMax - logMin);
            tickX = tickPos * width;
        } else {
            // For linear scale
            tickValue = min + position * (max - min);
            tickX = position * width;
        }
        
        // Create tick line
        const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        tick.setAttribute('x1', tickX);
        tick.setAttribute('y1', height);
        tick.setAttribute('x2', tickX);
        tick.setAttribute('y2', height + tickLength);
        tick.setAttribute('stroke', tickColor);
        tick.setAttribute('stroke-width', tickWidth);
        g.appendChild(tick);
        
        // Create tick label
        const tickLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        tickLabel.setAttribute('x', tickX);
        tickLabel.setAttribute('y', height + tickLength + 10);
        tickLabel.setAttribute('text-anchor', 'middle');
        tickLabel.setAttribute('fill', labelColor);
        tickLabel.setAttribute('font-size', labelFontSize);
        
        // Format the label based on the scale
        let labelText = formatTickValue(tickValue, xScale === 'log');
        
        // If this is a categorical axis, use category names
        if (categoryMap.size > 0) {
            // Find the category that maps to this value or closest to it
            const entries = Array.from(categoryMap.entries());
            const closest = entries.reduce((prev, curr) => {
                return (Math.abs(curr[1] - tickValue) < Math.abs(prev[1] - tickValue)) ? curr : prev;
            });
            
            if (Math.abs(closest[1] - tickValue) < categoryThreshold) {
                labelText = closest[0];
            }
        }
        
        tickLabel.textContent = labelText;
        g.appendChild(tickLabel);
    }
    
    // Create y-axis ticks
    const numYTicks = 5;
    
    for (let i = 0; i <= numYTicks; i++) {
        const position = i / numYTicks;
        const tickY = height - position * height;
        let tickValue;
        
        if (yScale === 'log') {
            // For log scale
            const logMin = Math.log10(yMinValue);
            const logMax = Math.log10(yMaxValue);
            tickValue = Math.pow(10, logMin + position * (logMax - logMin));
        } else {
            // For linear scale
            tickValue = yMinValue + position * (yMaxValue - yMinValue);
        }
        
        // Create tick line
        const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        tick.setAttribute('x1', 0);
        tick.setAttribute('y1', tickY);
        tick.setAttribute('x2', -tickLength);
        tick.setAttribute('y2', tickY);
        tick.setAttribute('stroke', tickColor);
        tick.setAttribute('stroke-width', tickWidth);
        g.appendChild(tick);
        
        // Create tick label
        const tickLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        tickLabel.setAttribute('x', -tickLength - 5);
        tickLabel.setAttribute('y', tickY + 4); // +4 for vertical centering
        tickLabel.setAttribute('text-anchor', 'end');
        tickLabel.setAttribute('fill', labelColor);
        tickLabel.setAttribute('font-size', labelFontSize);
        tickLabel.textContent = formatTickValue(tickValue, yScale === 'log');
        g.appendChild(tickLabel);
    }
    
    // Create a clip path to ensure bars stay within the plot area
    const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
    clipPath.setAttribute('id', 'plot-area-clip-hist');
    
    const clipRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    clipRect.setAttribute('x', 0);
    clipRect.setAttribute('y', 0);
    clipRect.setAttribute('width', width);
    clipRect.setAttribute('height', height);
    clipPath.appendChild(clipRect);
    
    svg.appendChild(clipPath);
    
    // Create a group for the histogram bars with clipping
    const barsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    barsGroup.setAttribute('clip-path', 'url(#plot-area-clip-hist)');
    barsGroup.setAttribute('class', 'plot-content'); // Add class for print styling
    g.appendChild(barsGroup);
    
    // Draw the histogram bars
    
    normalizedBins.forEach((value, i) => {
        // Skip empty bins
        if (value === 0) return;
        
        // Calculate bar position and dimensions
        let x;
        let barWidthPx;
        if (xScale === 'log') {
            const logMin = Math.log10(min);
            const logMax = Math.log10(max);
            const logRange = logMax - logMin;
            const startEdge = binEdges[i];
            const endEdge = binEdges[i + 1];
            const startPos = (Math.log10(startEdge) - logMin) / logRange;
            const endPos = (Math.log10(endEdge) - logMin) / logRange;
            x = startPos * width;
            barWidthPx = Math.max(1, (endPos - startPos) * width - 1);
        } else {
            const startEdge = binEdges[i];
            const endEdge = binEdges[i + 1];
            const startPos = (startEdge - min) / (max - min);
            const endPos = (endEdge - min) / (max - min);
            x = startPos * width;
            barWidthPx = Math.max(1, (endPos - startPos) * width - 1);
        }
        
        // Calculate y position and height based on scale
        let y, barHeight;
        
        if (yScale === 'log') {
            // For log scale
            const logMin = Math.log10(yMinValue);
            const logMax = Math.log10(yMaxValue);
            const logRange = logMax - logMin;
            
            // Ensure value is at least minimum for log scale
            const adjustedValue = Math.max(yMinValue, value);
            const logValue = Math.log10(adjustedValue);
            
            // Calculate normalized height in log space
            const normalizedHeight = (logValue - logMin) / logRange;
            barHeight = normalizedHeight * height;
            y = height - barHeight;
        } else {
            // For linear scale
            const normalizedHeight = value / (yMaxValue - yMinValue);
            barHeight = normalizedHeight * height;
            y = height - barHeight;
        }
        
        // Create the bar rectangle
        const bar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bar.setAttribute('x', x);
        bar.setAttribute('y', y);
        bar.setAttribute('width', barWidthPx); // spacing already applied
        bar.setAttribute('height', barHeight);
        bar.setAttribute('fill', barColor);
        bar.setAttribute('stroke', '#333');
        bar.setAttribute('stroke-width', '1');
        
        // Add tooltip on hover
        bar.addEventListener('mouseover', function(e) {
            // Highlight the bar
            this.setAttribute('fill', '#ff9800');
            
            // Create tooltip
            // Create tooltip
            const tooltip = document.createElement('div');
            tooltip.className = 'histogram-tooltip';
            tooltip.style.position = 'absolute';
            tooltip.style.backgroundColor = 'rgba(154, 25, 214, 0.8)';
            tooltip.style.color = 'white';
            tooltip.style.padding = '5px 10px';
            tooltip.style.borderRadius = '4px';
            tooltip.style.fontSize = '12px';
            tooltip.style.pointerEvents = 'none';
            tooltip.style.zIndex = '30001';
            
            // Calculate bin start and end values
            const binStart = binEdges[i];
            const binEnd = binEdges[i + 1];
            
            // Format the tooltip content
            let tooltipContent = '';
            
            if (categoryMap.size > 0) {
                // For categorical data, find categories in this bin
                const categories = Array.from(categoryMap.entries())
                    .filter(([_, value]) => value >= binStart && value < binEnd)
                    .map(([category, _]) => category);
                
                if (categories.length > 0) {
                    tooltipContent = `Categories: ${categories.join(', ')}<br>`;
                }
            } else {
                // For numeric data, show bin range
                tooltipContent = `Range: ${binStart.toPrecision(4)} to ${binEnd.toPrecision(4)}<br>`;
            }
            
            // Add the count and normalized value
            tooltipContent += `Count: ${bins[i]}<br>`;
            
            // Add normalized value based on normalization type
            switch (normalization) {
                case 'frequency':
                    tooltipContent += `Frequency: ${value.toPrecision(4)}`;
                    break;
                case 'density':
                    tooltipContent += `Density: ${value.toPrecision(4)}`;
                    break;
                case 'percent':
                    tooltipContent += `Percent: ${value.toPrecision(4)}%`;
                    break;
                case 'probability':
                    tooltipContent += `Probability: ${value.toPrecision(4)}`;
                    break;
                default:
                    // For raw count, don't add anything extra
                    break;
            }
            
            tooltip.innerHTML = tooltipContent;
            document.body.appendChild(tooltip);
            
            // Position the tooltip
            const rect = svg.getBoundingClientRect();
            const tooltipX = rect.left + margin.left + x + (barWidthPx / 2);
            const tooltipY = rect.top + margin.top + y - 10;
            
            tooltip.style.left = `${tooltipX}px`;
            tooltip.style.top = `${tooltipY}px`;
            
            // Store the tooltip reference
            this._tooltip = tooltip;
        });
        
        bar.addEventListener('mousemove', function(e) {
            if (this._tooltip) {
                // Update tooltip position
                const rect = svg.getBoundingClientRect();
                const tooltipX = e.clientX + 10;
                const tooltipY = e.clientY - 10;
                
                this._tooltip.style.left = `${tooltipX}px`;
                this._tooltip.style.top = `${tooltipY}px`;
            }
        });
        
        bar.addEventListener('mouseout', function(e) {
            // Restore original color
            this.setAttribute('fill', barColor);
            
            // Remove tooltip
            if (this._tooltip) {
                document.body.removeChild(this._tooltip);
                this._tooltip = null;
            }
        });
        
        barsGroup.appendChild(bar);
    });
    
    // Add the SVG to the plot area
    svg.appendChild(g);
    plotArea.innerHTML = '';
    plotArea.appendChild(svg);
    const saveButton = document.getElementById('save-plot-button');
    if (saveButton) {
        saveButton.style.display = 'block';
    }
    // Add a note about the bin count and normalization
    const infoNote = document.createElement('div');
    infoNote.style.position = 'absolute';
    infoNote.style.top = '5px';
    infoNote.style.right = '5px';
    infoNote.style.color = '#aaa';
    infoNote.style.fontSize = '11px';
    infoNote.style.textAlign = 'right';
    
    let infoText = `${numBins} bins`;
    if (normalization !== 'count') {
        infoText += `, ${normalization} normalization`;
    }
    infoNote.textContent = infoText;
    plotArea.appendChild(infoNote);
}

// Add this to the createPlotterContainer function to include normalization options
function addNormalizationControls(histogramControls) {
    // Normalization type selector
    const normalizationDiv = document.createElement('div');
    normalizationDiv.style.marginBottom = '15px';
    
    const normalizationLabel = document.createElement('label');
    normalizationLabel.textContent = 'Normalization:';
    normalizationLabel.style.display = 'block';
    normalizationLabel.style.marginBottom = '5px';
    normalizationDiv.appendChild(normalizationLabel);
    
    const normalizationSelect = document.createElement('select');
    normalizationSelect.id = 'normalization-select';
    normalizationSelect.style.width = '100%';
    normalizationSelect.style.padding = '8px';
    normalizationSelect.style.backgroundColor = '#333';
    normalizationSelect.style.color = 'white';
    normalizationSelect.style.border = '1px solid #555';
    normalizationSelect.style.borderRadius = '4px';
    
    // Add normalization options
    const normOptions = [
        { value: 'count', label: 'Count' },
        { value: 'frequency', label: 'Frequency (count/bin width)' },
        { value: 'density', label: 'Density (area = 1)' },
        { value: 'percent', label: 'Percent (sum = 100%)' },
        { value: 'probability', label: 'Probability (sum = 1)' }
    ];
    
    normOptions.forEach(option => {
        const optionElem = document.createElement('option');
        optionElem.value = option.value;
        optionElem.textContent = option.label;
        normalizationSelect.appendChild(optionElem);
    });
    
    normalizationDiv.appendChild(normalizationSelect);
    histogramControls.appendChild(normalizationDiv);
    
    return normalizationSelect;
}

// Update the existing createPlotterContainer function to include these controls
// You'll need to modify your existing function to include this code in the histogram controls section
// Add this code after creating the barColorDiv and before adding histogramControls to customizationSection:

// addNormalizationControls(histogramControls);

// // Process data for histogram
// function processHistogramData(plotArea, allData, xAxisName, customizationOptions) {
//     // Check if we have data
//     if (!allData || allData.length === 0) {
//         plotArea.textContent = 'No data available for histogram';
//         return;
//     }
    
//     // Extract values for the selected axis
//     const allValues = [];
//     const categoryMap = new Map(); // For categorical X values
    
//     // First pass: collect all values
//     allData.forEach(obj => {
//         const xValue = obj[xAxisName];
        
//         // Skip if value is undefined or null
//         if (xValue === undefined || xValue === null) {
//             return;
//         }
        
//         // Handle categorical values
//         if (typeof xValue === 'string') {
//             if (!categoryMap.has(xValue)) {
//                 categoryMap.set(xValue, categoryMap.size + 1);
//             }
//             allValues.push(categoryMap.get(xValue));
//         } else {
//             // Handle numeric values
//             const numericValue = parseFloat(xValue);
//             if (!isNaN(numericValue)) {
//                 allValues.push(numericValue);
//             }
//         }
//     });
    
//     // Check if we have any valid values
//     if (allValues.length === 0) {
//         plotArea.textContent = `No valid values found for ${xAxisName}`;
//         return;
//     }
    
//     // Create the histogram with the processed data
//     createHistogram(
//         plotArea, 
//         allValues, 
//         xAxisName, 
//         categoryMap,
//         customizationOptions
//     );
// }

// // Create a histogram with the processed data
// function createHistogram(plotArea, values, xAxisName, categoryMap, customizationOptions) {
//     // Extract customization options with defaults
//     const {
//         title = '',
//         xLabel = xAxisName,
//         yLabel = 'Count',
//         xScale = 'linear',
//         yScale = 'linear',
//         xMin = null,
//         xMax = null,
//         yMin = null,
//         yMax = null,
//         autoLimits = true,
//         numBins = 20,
//         barColor = '#4CAF50'
//     } = customizationOptions || {};
    
//     // Calculate min and max values for X axis
//     const min = autoLimits ? Math.min(...values) : (xMin !== null ? xMin : Math.min(...values));
//     const max = autoLimits ? Math.max(...values) : (xMax !== null ? xMax : Math.max(...values));
    
//     // Calculate bin width and create bins
//     const binWidth = (max - min) / numBins;
//     const bins = Array(numBins).fill(0);
    
//     // Fill the bins
//     values.forEach(value => {
//         if (value >= min && value <= max) {
//             // Calculate bin index
//             const binIndex = Math.min(Math.floor((value - min) / binWidth), numBins - 1);
//             bins[binIndex]++;
//         }
//     });
    
//     // Find max count for Y axis scaling
//     const maxCount = Math.max(...bins);
    
//     // Calculate y-axis limits
//     const yMinValue = yMin !== null ? yMin : 0;
//     const yMaxValue = yMax !== null ? yMax : (yScale === 'log' ? Math.max(1, maxCount) : maxCount * 1.1);
    
//     // Create SVG element
//     const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
//     svg.setAttribute('width', '100%');
//     svg.setAttribute('height', '100%');
//     svg.style.backgroundColor = '#222';
    
//     // Calculate plot area dimensions
//     const margin = { top: 40, right: 30, bottom: 50, left: 60 };
//     const width = plotArea.clientWidth - margin.left - margin.right;
//     const height = plotArea.clientHeight - margin.top - margin.bottom;
    
//     // Create a group for the plot
//     const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
//     g.setAttribute('transform', `translate(${margin.left}, ${margin.top})`);
    
//     // Add title if provided
//     if (title) {
//         const titleElement = document.createElementNS('http://www.w3.org/2000/svg', 'text');
//         titleElement.setAttribute('x', width / 2);
//         titleElement.setAttribute('y', -20);
//         titleElement.setAttribute('text-anchor', 'middle');
//         titleElement.setAttribute('fill', 'white');
//         titleElement.setAttribute('font-size', '16px');
//         titleElement.setAttribute('font-weight', 'bold');
//         titleElement.textContent = title;
//         g.appendChild(titleElement);
//     }
    
//     // Add axes
//     const axisColor = '#888';
//     const axisWidth = 1;
//     const tickLength = 5;
//     const tickWidth = 1;
//     const tickColor = '#888';
//     const labelColor = '#aaa';
//     const labelFontSize = 10;
    
//     // Create x-axis line
//     const xAxisLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
//     xAxisLine.setAttribute('x1', 0);
//     xAxisLine.setAttribute('y1', height);
//     xAxisLine.setAttribute('x2', width);
//     xAxisLine.setAttribute('y2', height);
//     xAxisLine.setAttribute('stroke', axisColor);
//     xAxisLine.setAttribute('stroke-width', axisWidth);
//     g.appendChild(xAxisLine);
    
//     // Create y-axis line
//     const yAxisLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
//     yAxisLine.setAttribute('x1', 0);
//     yAxisLine.setAttribute('y1', 0);
//     yAxisLine.setAttribute('x2', 0);
//     yAxisLine.setAttribute('y2', height);
//     yAxisLine.setAttribute('stroke', axisColor);
//     yAxisLine.setAttribute('stroke-width', axisWidth);
//     g.appendChild(yAxisLine);
    
//     // Add x-axis label
//     const xAxisLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
//     xAxisLabel.setAttribute('x', width / 2);
//     xAxisLabel.setAttribute('y', height + 35);
//     xAxisLabel.setAttribute('text-anchor', 'middle');
//     xAxisLabel.setAttribute('fill', 'white');
//     xAxisLabel.setAttribute('font-size', '12px');
//     xAxisLabel.innerHTML = renderLatexLabel(xLabel);
//     g.appendChild(xAxisLabel);
    
//     // Add y-axis label
//     const yAxisLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
//     yAxisLabel.setAttribute('transform', `translate(-40, ${height / 2}) rotate(-90)`);
//     yAxisLabel.setAttribute('text-anchor', 'middle');
//     yAxisLabel.setAttribute('fill', 'white');
//     yAxisLabel.setAttribute('font-size', '12px');
//     yAxisLabel.innerHTML = renderLatexLabel(yLabel);
//     g.appendChild(yAxisLabel);
    
//     // Helper function to format tick values
//     function formatTickValue(value, isLog = false) {
//         if (isLog) {
//             // For log scale, format powers of 10 nicely
//             const exponent = Math.log10(value);
//             const roundedExponent = Math.round(exponent);
//             if (Math.abs(exponent - roundedExponent) < 0.01) {
//                 if (roundedExponent === 0) return '1';
//                 if (roundedExponent === 1) return '10';
//                 if (roundedExponent === 2) return '100';
//                 return `10^${roundedExponent}`;
//             }
//         }
        
//         // For small values or integers, show full value
//         if (Number.isInteger(value) || Math.abs(value) < 0.001 || Math.abs(value) >= 10000) {
//             return value.toExponential(1);
//         }
        
//         // For other values, format with appropriate precision
//         return value.toPrecision(3);
//     }
    
//     // Create x-axis ticks
//     const numXTicks = Math.min(10, numBins);
    
//     for (let i = 0; i <= numXTicks; i++) {
//         const position = i / numXTicks;
//         const tickX = position * width;
//         let tickValue;
        
//         if (xScale === 'log') {
//             // For log scale
//             const logMin = Math.log10(min);
//             const logMax = Math.log10(max);
//             tickValue = Math.pow(10, logMin + position * (logMax - logMin));
//         } else {
//             // For linear scale
//             tickValue = min + position * (max - min);
//         }
        
//         // Create tick line
//         const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
//         tick.setAttribute('x1', tickX);
//         tick.setAttribute('y1', height);
//         tick.setAttribute('x2', tickX);
//         tick.setAttribute('y2', height + tickLength);
//         tick.setAttribute('stroke', tickColor);
//         tick.setAttribute('stroke-width', tickWidth);
//         g.appendChild(tick);
        
//         // Create tick label
//         const tickLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
//         tickLabel.setAttribute('x', tickX);
//         tickLabel.setAttribute('y', height + tickLength + 10);
//         tickLabel.setAttribute('text-anchor', 'middle');
//         tickLabel.setAttribute('fill', labelColor);
//         tickLabel.setAttribute('font-size', labelFontSize);
        
//         // Format the label based on the scale
//         let labelText = formatTickValue(tickValue, xScale === 'log');
        
//         // If this is a categorical axis, use category names
//         if (categoryMap.size > 0) {
//             // Find the category that maps to this value or closest to it
//             const entries = Array.from(categoryMap.entries());
//             const closest = entries.reduce((prev, curr) => {
//                 return (Math.abs(curr[1] - tickValue) < Math.abs(prev[1] - tickValue)) ? curr : prev;
//             });
//            
//             if (Math.abs(closest[1] - tickValue) < binWidth) {
//                 labelText = closest[0];
//             }
//         }
        
//         tickLabel.textContent = labelText;
//         g.appendChild(tickLabel);
//     }
    
//     // Create y-axis ticks
//     const numYTicks = 5;
    
//     for (let i = 0; i <= numYTicks; i++) {
//         const position = i / numYTicks;
//         const tickY = height - position * height;
//         let tickValue;
        
//         if (yScale === 'log') {
//             // For log scale (ensure minimum is at least 1 for log scale)
//             const logMin = Math.log10(Math.max(1, yMinValue));
//             const logMax = Math.log10(yMaxValue);
//             tickValue = Math.pow(10, logMin + position * (logMax - logMin));
//         } else {
//             // For linear scale
//             tickValue = yMinValue + position * (yMaxValue - yMinValue);
//         }
        
//         // Create tick line
//         const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
//         tick.setAttribute('x1', 0);
//         tick.setAttribute('y1', tickY);
//         tick.setAttribute('x2', -tickLength);
//         tick.setAttribute('y2', tickY);
//         tick.setAttribute('stroke', tickColor);
//         tick.setAttribute('stroke-width', tickWidth);
//         g.appendChild(tick);
        
//         // Create tick label
//         const tickLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
//         tickLabel.setAttribute('x', -tickLength - 5);
//         tickLabel.setAttribute('y', tickY + 4); // +4 for vertical centering
//         tickLabel.setAttribute('text-anchor', 'end');
//         tickLabel.setAttribute('fill', labelColor);
//         tickLabel.setAttribute('font-size', labelFontSize);
//         tickLabel.textContent = formatTickValue(tickValue, yScale === 'log');
//         g.appendChild(tickLabel);
//     }
    
//     // Create a clip path to ensure bars stay within the plot area
//     const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
//     clipPath.setAttribute('id', 'plot-area-clip-hist');
    
//     const clipRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
//     clipRect.setAttribute('x', 0);
//     clipRect.setAttribute('y', 0);
//     clipRect.setAttribute('width', width);
//     clipRect.setAttribute('height', height);
//     clipPath.appendChild(clipRect);
    
//     svg.appendChild(clipPath);
    
//     // Create a group for the histogram bars with clipping
//     const barsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
//     barsGroup.setAttribute('clip-path', 'url(#plot-area-clip-hist)');
//     g.appendChild(barsGroup);
    
//     // Draw the histogram bars
//     const barWidth = width / numBins;
    
//     bins.forEach((count, i) => {
//         // Skip empty bins
//         if (count === 0) return;
        
//         // Calculate bar position and dimensions
//         const x = i * barWidth;
        
//         // Calculate y position and height based on scale
//         let y, barHeight;
        
//         if (yScale === 'log') {
//             // For log scale
//             const logMin = Math.log10(Math.max(1, yMinValue));
//             const logMax = Math.log10(yMaxValue);
//             const logRange = logMax - logMin;
            
//             // Ensure count is at least 1 for log scale
//             const adjustedCount = Math.max(1, count);
//             const logCount = Math.log10(adjustedCount);
            
//             // Calculate normalized height in log space
//             const normalizedHeight = (logCount - logMin) / logRange;
//             barHeight = normalizedHeight * height;
//             y = height - barHeight;
//         } else {
//             // For linear scale
//             const normalizedHeight = count / (yMaxValue - yMinValue);
//             barHeight = normalizedHeight * height;
//             y = height - barHeight;
//         }
        
//         // Create the bar rectangle
//         const bar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
//         bar.setAttribute('x', x);
//         bar.setAttribute('y', y);
//         bar.setAttribute('width', barWidth - 1); // -1 for spacing between bars
//         bar.setAttribute('height', barHeight);
//         bar.setAttribute('fill', barColor);
//         bar.setAttribute('stroke', '#333');
//         bar.setAttribute('stroke-width', '1');
        
//         // Add tooltip on hover
//         bar.addEventListener('mouseover', function(e) {
//             // Highlight the bar
//             this.setAttribute('fill', '#ff9800');
            
//             // Create tooltip
//             const tooltip = document.createElement('div');
//             tooltip.className = 'histogram-tooltip';
//             tooltip.style.position = 'absolute';
//             tooltip.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
//             tooltip.style.color = 'white';
//             tooltip.style.padding = '5px 10px';
//             tooltip.style.borderRadius = '4px';
//             tooltip.style.fontSize = '12px';
//             tooltip.style.pointerEvents = 'none';
//             tooltip.style.zIndex = '1001';
            
//             // Calculate bin start and end values
//             const binStart = min + i * binWidth;
//             const binEnd = min + (i + 1) * binWidth;
            
//             // Format the tooltip content
//             let tooltipContent = '';
            
//             if (categoryMap.size > 0) {
//                 // For categorical data, find categories in this bin
//                 const categories = Array.from(categoryMap.entries())
//                     .filter(([_, value]) => value >= binStart && value < binEnd)
//                     .map(([category, _]) => category);
                
//                 if (categories.length > 0) {
//                     tooltipContent = `Categories: ${categories.join(', ')}<br>`;
//                 }
//             } else {
//                 // For numeric data, show bin range
//                 tooltipContent = `Range: ${binStart.toPrecision(4)} to ${binEnd.toPrecision(4)}<br>`;
//             }
            
//             tooltipContent += `Count: ${count}`;
            
//             tooltip.innerHTML = tooltipContent;
//             document.body.appendChild(tooltip);
            
//             // Position the tooltip
//             const rect = svg.getBoundingClientRect();
//             const tooltipX = rect.left + margin.left + x + barWidth / 2;
//             const tooltipY = rect.top + margin.top + y - 10;
            
//             tooltip.style.left = `${tooltipX}px`;
//             tooltip.style.top = `${tooltipY}px`;
            
//             // Store the tooltip reference
//             this._tooltip = tooltip;
//         });
        
//         bar.addEventListener('mousemove', function(e) {
//             if (this._tooltip) {
//                 // Update tooltip position
//                 const rect = svg.getBoundingClientRect();
//                 const tooltipX = e.clientX + 10;
//                 const tooltipY = e.clientY - 10;
                
//                 this._tooltip.style.left = `${tooltipX}px`;
//                 this._tooltip.style.top = `${tooltipY}px`;
//             }
//         });
        
//         bar.addEventListener('mouseout', function(e) {
//             // Restore original color
//             this.setAttribute('fill', barColor);
            
//             // Remove tooltip
//             if (this._tooltip) {
//                 document.body.removeChild(this._tooltip);
//                 this._tooltip = null;
//             }
//         });
        
//         barsGroup.appendChild(bar);
//     });
    
//     // Add the SVG to the plot area
//     svg.appendChild(g);
//     plotArea.innerHTML = '';
//     plotArea.appendChild(svg);
    
//     // Add a note about the bin count
//     const binCountNote = document.createElement('div');
//     binCountNote.style.position = 'absolute';
//     binCountNote.style.top = '5px';
//     binCountNote.style.right = '5px';
//     binCountNote.style.color = '#aaa';
//     binCountNote.style.fontSize = '11px';
//     binCountNote.textContent = `${numBins} bins`;
//     plotArea.appendChild(binCountNote);
// }



// Toggle plotter panel
function togglePlotter() {
    const containerId = 'dynamic-plotter-panel'; // USE NEW ID
    console.log(`[Plotter] togglePlotter called for ID: ${containerId}`); // Log entry
    createPlotterContainer(); 
    
    const plotterContainer = document.getElementById(containerId); // FIND NEW ID
    if (!plotterContainer) { 
        console.error(`[Plotter] Could not find plotter container with ID ${containerId} even after create attempt.`);
        return;
    }
    
    // Check if plotter is currently visible (transform is translateX(0))
    const isVisible = plotterContainer.style.transform === 'translateX(0px)' || plotterContainer.style.transform === 'translateX(0)';
    console.log(`[Plotter] togglePlotter - current transform: '${plotterContainer.style.transform}', isVisible: ${isVisible}`);
    
    if (isVisible) {
        hidePlotter();
    } else {
        showPlotter();
    }
}

// Show plotter panel
function showPlotter() {
    const containerId = 'dynamic-plotter-panel'; // USE NEW ID
    console.log(`[Plotter] showPlotter called for ID: ${containerId}`); // Log entry
    const plotterContainer = document.getElementById(containerId); // FIND NEW ID
    if (!plotterContainer) {
         console.error(`[Plotter] showPlotter - Could not find plotter container with ID ${containerId}.`);
         return;
    }
    
    // Show the plotter by translating it into view
    console.log(`[Plotter] Applying transform translateX(0) to show plotter ${containerId}.`);
    plotterContainer.style.transform = 'translateX(0)';
}

// Hide plotter panel
function hidePlotter() {
    const containerId = 'dynamic-plotter-panel'; // USE NEW ID
    console.log(`[Plotter] hidePlotter called for ID: ${containerId}`); // Log entry
    const plotterContainer = document.getElementById(containerId); // FIND NEW ID
    if (!plotterContainer) {
         console.error(`[Plotter] hidePlotter - Could not find plotter container with ID ${containerId}.`);
         return;
    }
    
    // Hide the plotter by translating it out of view
    console.log(`[Plotter] Applying transform translateX(100%) to hide plotter ${containerId}.`);
    plotterContainer.style.transform = 'translateX(100%)';
}

// Further improved function to ensure all columns are properly detected and listed
function populateAxisDropdowns() {
    // Get the select elements
    const xAxisSelect = document.getElementById('x-axis-select');
    const yAxisSelect = document.getElementById('y-axis-select');
    const colorSelect = document.getElementById('color-axis-select');
    
    // Get the dropdown containers
    const xAxisDropdown = document.getElementById('x-axis-dropdown');
    const yAxisDropdown = document.getElementById('y-axis-dropdown');
    const colorDropdown = document.getElementById('color-axis-dropdown');
    
    // Get the search inputs
    const xAxisSearch = document.getElementById('x-axis-search');
    const yAxisSearch = document.getElementById('y-axis-search');
    const colorSearch = document.getElementById('color-axis-search');
    
    // --> ADDED: Check if all required elements exist
    if (!xAxisSelect || !yAxisSelect || !colorSelect || 
        !xAxisDropdown || !yAxisDropdown || !colorDropdown ||
        !xAxisSearch || !yAxisSearch || !colorSearch) {
        console.error("[Plotter] populateAxisDropdowns - Required dropdown elements NOT found. Cannot populate."); // Log the failure
        // Log which elements were found/not found for debugging
        console.log("xAxisSelect:", !!xAxisSelect, "yAxisSelect:", !!yAxisSelect, "colorSelect:", !!colorSelect);
        console.log("xAxisDropdown:", !!xAxisDropdown, "yAxisDropdown:", !!yAxisDropdown, "colorDropdown:", !!colorDropdown);
        console.log("xAxisSearch:", !!xAxisSearch, "yAxisSearch:", !!yAxisSearch, "colorSearch:", !!colorSearch);
        return; // Exit if elements are missing
    }
    console.log("[Plotter] populateAxisDropdowns - All dropdown elements found. Proceeding..."); // Log success
    // <-- END ADDED
    
    // Function to clear a dropdown
    function clearDropdown(dropdown) {
        if (!dropdown) return;
        while (dropdown.firstChild) {
            dropdown.removeChild(dropdown.firstChild);
        }
    }
    
    // Clear existing options in selects and dropdowns
    clearDropdown(xAxisSelect);
    clearDropdown(yAxisSelect);
    clearDropdown(colorSelect);
    clearDropdown(xAxisDropdown);
    clearDropdown(yAxisDropdown);
    clearDropdown(colorDropdown);
    
    // Add a "None" option for color (to allow no coloring)
    const noneOption = document.createElement('option');
    noneOption.value = '';
    noneOption.textContent = 'None';
    colorSelect.appendChild(noneOption);
    
    const noneItem = document.createElement('div');
    noneItem.className = 'dropdown-item';
    noneItem.textContent = 'None';
    noneItem.style.padding = '8px';
    noneItem.style.cursor = 'pointer';
    noneItem.style.borderBottom = '1px solid #444';
    noneItem.style.transition = 'background-color 0.2s';
    
    // Hover effect
    noneItem.addEventListener('mouseover', function() {
        this.style.backgroundColor = '#444';
    });
    
    noneItem.addEventListener('mouseout', function() {
        this.style.backgroundColor = 'transparent';
    });
    
    // Click event
    noneItem.addEventListener('click', function() {
        colorSelect.value = '';
        colorSearch.value = 'None';
        colorDropdown.style.display = 'none';
    });
    
    colorDropdown.appendChild(noneItem);

    // Function to show loading indicators
    function showLoadingIndicators() {
        const loadingMessage = '<div class="dropdown-item" style="padding: 8px; color: #aaa;">Loading...</div>';
        xAxisDropdown.innerHTML = loadingMessage;
        yAxisDropdown.innerHTML = loadingMessage;
        colorDropdown.innerHTML = colorDropdown.innerHTML + loadingMessage; // Keep the "None" option
    }
    
    // Function to show error messages
    function showErrorMessage(message) {
        const errorMessage = `<div class="dropdown-item" style="padding: 8px; color: #aaa;">${message}</div>`;
        clearDropdown(xAxisDropdown);
        clearDropdown(yAxisDropdown);
        
        // Keep the "None" option in colorDropdown
        const noneItem = colorDropdown.querySelector('.dropdown-item');
        clearDropdown(colorDropdown);
        if (noneItem) colorDropdown.appendChild(noneItem);
        
        xAxisDropdown.innerHTML = errorMessage;
        yAxisDropdown.innerHTML = errorMessage;
        colorDropdown.innerHTML = colorDropdown.innerHTML + errorMessage;
    }

    // Helper: in multi-panel mode, use the active pane's window for image/catalog state.
    function getPlotterActivePaneWindow() {
        try {
            if (typeof window.getActivePaneWindow === 'function') {
                const w = window.getActivePaneWindow();
                if (w) return w;
            }
        } catch (_) {}
        return window;
    }
    const paneWin = getPlotterActivePaneWindow();

    // Small context note (helps when multiple catalogs / images are loaded)
    function updatePlotterContextNote() {
        const noteEl = document.getElementById('plotter-context-note');
        if (!noteEl) return;
        try {
            const paneWin = getPlotterActivePaneWindow();
            // Catalog name: prefer plotter-selected, otherwise active pane's active/current catalog,
            // otherwise last loaded in active pane.
            const plotterPicked = (window.plotterSelectedCatalogName || '').toString();
            const paneActive = (paneWin && (paneWin.currentCatalogName || paneWin.activeCatalog)) || '';
            let paneLast = '';
            try {
                if (paneWin && typeof paneWin.getLoadedCatalogOverlays === 'function') {
                    const entries = paneWin.getLoadedCatalogOverlays() || [];
                    if (Array.isArray(entries) && entries.length) {
                        const lastKey = entries[entries.length - 1]?.key;
                        if (lastKey) paneLast = String(lastKey);
                    }
                }
            } catch (_) {}
            const catalogName = (plotterPicked || paneActive || paneLast || window.sourcePropertiesCatalogName || window.currentCatalogName || window.activeCatalog || '').toString();
            const cleanCatalog = catalogName ? catalogName.split('/').pop().split('\\').pop().replace(/\.fits$/i, '') : '—';

            const fileRaw = (paneWin && paneWin.fitsData && paneWin.fitsData.filename) || (paneWin && paneWin.currentFitsFile) || '';
            const cleanImage = fileRaw ? fileRaw.toString().split('/').pop().split('\\').pop().replace(/\.fits$/i, '') : '—';

            noteEl.textContent = `Catalog: ${cleanCatalog} | Image: ${cleanImage}`;
        } catch (_) {
            noteEl.textContent = '';
        }
    }
    // Expose so other listeners (e.g. active pane change) can refresh it.
    try { window.updatePlotterContextNote = updatePlotterContextNote; } catch (_) {}
    updatePlotterContextNote();

    // If multiple catalogs are loaded, show a selector above "Select Axes"
    function updatePlotterCatalogPicker() {
        const row = document.getElementById('plotter-catalog-picker-row');
        const sel = document.getElementById('plotter-catalog-select');
        if (!row || !sel) return;
        let entries = [];
        try {
            const paneWin = getPlotterActivePaneWindow();
            if (paneWin && typeof paneWin.getLoadedCatalogOverlays === 'function') {
                entries = paneWin.getLoadedCatalogOverlays() || [];
            } else if (typeof window.getLoadedCatalogOverlays === 'function') {
                entries = window.getLoadedCatalogOverlays() || [];
            }
        } catch (_) { entries = []; }
        if (!Array.isArray(entries)) entries = [];
        // Filter to those with any objects (but keep zero-count if it's the only one)
        const nonEmpty = entries.filter(e => e && e.key && (e.count == null || e.count > 0));
        const list = nonEmpty.length ? nonEmpty : entries.filter(e => e && e.key);

        if (!list || list.length < 2) {
            row.style.display = 'none';
            return;
        }
        row.style.display = 'flex';

        // Default selection: LAST loaded catalog (last entry in list), unless user already picked one.
        const paneWin = getPlotterActivePaneWindow();
        const fallbackActive = (paneWin && (paneWin.currentCatalogName || paneWin.activeCatalog)) || (typeof activeCatalog !== 'undefined' ? activeCatalog : null);
        const lastKey = (list[list.length - 1] && list[list.length - 1].key) ? String(list[list.length - 1].key) : null;
        const current =
            (window.plotterSelectedCatalogName || null) ||
            lastKey ||
            (paneWin && paneWin.currentCatalogName) ||
            (paneWin && paneWin.activeCatalog) ||
            window.currentCatalogName ||
            window.activeCatalog ||
            fallbackActive ||
            null;

        // Rebuild options
        while (sel.firstChild) sel.removeChild(sel.firstChild);
        list.forEach(e => {
            const key = String(e.key || '');
            if (!key) return;
            const opt = document.createElement('option');
            opt.value = key;
            const label = key.split('/').pop().split('\\').pop().replace(/\.fits$/i, '');
            opt.textContent = label || key;
            sel.appendChild(opt);
        });
        if (current) sel.value = String(current);
        // Persist default so Generate Plot uses it even before user changes the dropdown.
        if (!window.plotterSelectedCatalogName && sel.value) {
            window.plotterSelectedCatalogName = sel.value;
        }

        if (!sel.__plotterBound) {
            sel.addEventListener('change', () => {
                const v = sel.value || '';
                window.plotterSelectedCatalogName = v || null;
                // Force dropdowns to refresh for the newly selected catalog
                try { window.plotterColumnSampleData = null; } catch (_) {}
                try { window.plotterColumnSampleCatalogName = null; } catch (_) {}
                try { window.sourcePropertiesData = null; } catch (_) {}
                try { window.sourcePropertiesCatalogName = null; } catch (_) {}

                // Clear any stale UI selections so it doesn't look like we're still using the previous catalog
                try {
                    const idsToClear = [
                        'x-axis-search', 'y-axis-search', 'color-axis-search',
                        'x-axis-select', 'y-axis-select', 'color-axis-select',
                        'boolean-filter-search', 'boolean-filter-column-select', 'boolean-filter-value-select'
                    ];
                    idsToClear.forEach((id) => {
                        const el = document.getElementById(id);
                        if (!el) return;
                        if (el.tagName === 'SELECT') el.value = '';
                        if (el.tagName === 'INPUT') el.value = '';
                    });
                    // Hide any open dropdowns
                    ['x-axis-dropdown', 'y-axis-dropdown', 'color-axis-dropdown', 'boolean-filter-dropdown'].forEach((id) => {
                        const el = document.getElementById(id);
                        if (el && el.style) el.style.display = 'none';
                    });
                    const valWrap = document.getElementById('boolean-filter-value-wrap');
                    if (valWrap && valWrap.style) valWrap.style.display = 'none';
                } catch (_) {}
                // Keep other modules in sync (optional)
                try {
                    if (typeof window.setActiveCatalogForControls === 'function' && v) {
                        window.setActiveCatalogForControls(v);
                    }
                } catch (_) {}
                try { populateAxisDropdowns(); } catch (_) {}
                try { updatePlotterContextNote(); } catch (_) {}
            });
            sel.__plotterBound = true;
        }
    }
    updatePlotterCatalogPicker();

    // Also refresh the picker automatically when catalogs change while Plotter is open.
    // catalogs.js emits:
    // - 'catalog:changed' when a catalog is activated via controls
    // - 'catalogs:updated' when catalogs are loaded/unloaded/toggled
    try {
        if (!window.__plotterCatalogEventsListenerInstalled) {
            const __plotterOnCatalogEvent = () => {
                try {
                    // Only do work if plotter UI exists
                    if (!document.getElementById('dynamic-plotter-panel')) return;
                    if (!document.getElementById('plotter-catalog-select')) return;
                    // Rebuild list and update context
                    try { updatePlotterCatalogPicker(); } catch (_) {}
                    try { updatePlotterContextNote(); } catch (_) {}
                } catch (_) {}
            };
            window.addEventListener('catalog:changed', __plotterOnCatalogEvent);
            window.addEventListener('catalogs:updated', __plotterOnCatalogEvent);
            window.__plotterCatalogEventsListenerInstalled = true;
        }
    } catch (_) {}
    
    // If we have cached data, use it to populate dropdowns.
    // IMPORTANT: Only treat window.sourcePropertiesData as usable if it looks like REAL plot data
    // (it will include _originalObj from /plotter/load-catalog + /source-properties).
    const __activeFallback = (typeof activeCatalog !== 'undefined' ? activeCatalog : null);
    const __catalogSelectForDropdowns = document.getElementById('catalog-select');
    const __selectedCatalogForDropdowns = __catalogSelectForDropdowns ? (__catalogSelectForDropdowns.value || null) : null;
        const __catalogToUseForDropdowns =
            __selectedCatalogForDropdowns ||
            window.plotterSelectedCatalogName ||
            window.sourcePropertiesCatalogName ||
            window.currentCatalogName ||
            window.activeCatalog ||
            __activeFallback ||
            null;

    const __sourcePropsLooksReal =
        Array.isArray(window.sourcePropertiesData) &&
        window.sourcePropertiesData.length > 0 &&
        // If we know the current catalog, ensure cache matches it
        (!__catalogToUseForDropdowns || window.sourcePropertiesCatalogName === __catalogToUseForDropdowns) &&
        window.sourcePropertiesData.some(o => o && (o._originalObj || (o.ra != null && o.dec != null)));

    const __columnSampleLooksUsable =
        Array.isArray(window.plotterColumnSampleData) &&
        window.plotterColumnSampleData.length > 0 &&
        (!__catalogToUseForDropdowns || window.plotterColumnSampleCatalogName === __catalogToUseForDropdowns);

    const __dropdownData =
        __sourcePropsLooksReal ? window.sourcePropertiesData :
        (__columnSampleLooksUsable ? window.plotterColumnSampleData : null);

    if (__dropdownData) {
        showLoadingIndicators();
        setTimeout(() => {
            processDropdownOptions(__dropdownData);
            // Populate boolean filter columns using backend helper
            const boolSelect = document.getElementById('boolean-filter-column-select');
            if (boolSelect) {
                const catalogToUse = __catalogToUseForDropdowns;
                if (catalogToUse) {
                    detectBooleanColumns(catalogToUse).then(cols => {
                        // Reset options (keep 'None')
                        for (let i = boolSelect.options.length - 1; i >= 1; i--) boolSelect.remove(i);
                        const dropdown = document.getElementById('boolean-filter-dropdown');
                        if (dropdown) {
                            while (dropdown.firstChild) dropdown.removeChild(dropdown.firstChild);
                            // Add 'None' option
                            const noneItem = document.createElement('div');
                            noneItem.className = 'dropdown-item';
                            noneItem.textContent = 'None';
                            noneItem.style.padding = '8px';
                            noneItem.style.cursor = 'pointer';
                            noneItem.style.borderBottom = '1px solid #444';
                            noneItem.style.transition = 'background-color 0.2s';
                            noneItem.addEventListener('mouseover', function(){ this.style.backgroundColor = '#444'; });
                            noneItem.addEventListener('mouseout', function(){ this.style.backgroundColor = 'transparent'; });
                            noneItem.addEventListener('click', function(){
                                const searchEl = document.getElementById('boolean-filter-search');
                                const selectEl = document.getElementById('boolean-filter-column-select');
                                const dd = document.getElementById('boolean-filter-dropdown');
                                const valWrap = document.getElementById('boolean-filter-value-wrap');
                                if (searchEl) searchEl.value = '';
                                if (selectEl) selectEl.value = '';
                                if (valWrap) valWrap.style.display = 'none';
                                if (dd) dd.style.display = 'none';
                            });
                            dropdown.appendChild(noneItem);
                        }
                        (cols || []).forEach(c => {
                            // hidden select option
                            const o = document.createElement('option');
                            o.value = c; o.textContent = c;
                            boolSelect.appendChild(o);
                            // visual dropdown item
                            if (dropdown) {
                                const item = document.createElement('div');
                                item.className = 'dropdown-item';
                                item.textContent = c;
                                item.style.padding = '8px';
                                item.style.cursor = 'pointer';
                                item.style.borderBottom = '1px solid #444';
                                item.style.transition = 'background-color 0.2s';
                                item.addEventListener('mouseover', function(){ this.style.backgroundColor = '#444'; });
                                item.addEventListener('mouseout', function(){ this.style.backgroundColor = 'transparent'; });
                                item.addEventListener('click', function(){
                                    const searchEl = document.getElementById('boolean-filter-search');
                                    const selectEl = document.getElementById('boolean-filter-column-select');
                                    const dd = document.getElementById('boolean-filter-dropdown');
                                    const valWrap = document.getElementById('boolean-filter-value-wrap');
                                    if (searchEl) searchEl.value = c;
                                    if (selectEl) selectEl.value = c;
                                    if (valWrap) valWrap.style.display = 'block';
                                    if (dd) dd.style.display = 'none';
                                });
                                dropdown.appendChild(item);
                            }
                        });
                    }).catch(()=>{});
                }
            }
        }, 10); // Small delay to allow loading indicators to be displayed
        return;
    }
    
    // Otherwise, check if we have catalog overlay data (prefer active pane in multi-grid)
    const paneHasOverlay = !!(paneWin && paneWin.catalogDataForOverlay && paneWin.catalogDataForOverlay.length > 0);
    const topHasOverlay = !!(window.catalogDataForOverlay && window.catalogDataForOverlay.length > 0);
    const paneCatalogName = (paneWin && (paneWin.currentCatalogName || paneWin.activeCatalog)) || null;
    const topCatalogName = window.currentCatalogName || window.activeCatalog || (typeof activeCatalog !== 'undefined' ? activeCatalog : null);
    if ((paneHasOverlay || topHasOverlay) && (paneCatalogName || topCatalogName)) {
        showLoadingIndicators();

        // Use /catalog-columns/ to populate axis dropdowns (more robust than probing /source-properties/)
        const catalogSelect = document.getElementById('catalog-select');
        const selectedCatalog = catalogSelect ? catalogSelect.value : null;
        const catalogToUse =
            selectedCatalog ||
            window.plotterSelectedCatalogName ||
            paneCatalogName ||
            window.currentCatalogName ||
            window.activeCatalog ||
            (typeof activeCatalog !== 'undefined' ? activeCatalog : null);
        apiFetch(`/catalog-columns/?catalog_name=${encodeURIComponent(String(catalogToUse || ''))}`)
            .then(response => {
                if (!response.ok) {
                    return response.json().then(err => { throw new Error(err.detail || err.error || 'Failed to load columns'); });
                }
                return response.json();
            })
            .then(data => {
                const cols = (data && data.columns) ? data.columns : [];
                if (!Array.isArray(cols) || cols.length === 0) {
                    throw new Error('No columns returned');
                }
                const sample = {};
                cols.forEach(c => { sample[c] = null; });
                // Store as a "columns-only" sample for dropdown population only (do NOT overwrite plot data cache)
                try { window.plotterColumnSampleData = [sample]; } catch (_) {}
                try { window.plotterColumnSampleCatalogName = catalogToUse; } catch (_) {}
                processDropdownOptions([sample]);

                // Populate boolean filter columns
                const boolSelect = document.getElementById('boolean-filter-column-select');
                if (boolSelect && catalogToUse) {
                    detectBooleanColumns(catalogToUse).then(cols => {
                        for (let i = boolSelect.options.length - 1; i >= 1; i--) boolSelect.remove(i);
                        const dropdown = document.getElementById('boolean-filter-dropdown');
                        if (dropdown) {
                            while (dropdown.firstChild) dropdown.removeChild(dropdown.firstChild);
                            // Add 'None' option
                            const noneItem = document.createElement('div');
                            noneItem.className = 'dropdown-item';
                            noneItem.textContent = 'None';
                            noneItem.style.padding = '8px';
                            noneItem.style.cursor = 'pointer';
                            noneItem.style.borderBottom = '1px solid #444';
                            noneItem.style.transition = 'background-color 0.2s';
                            noneItem.addEventListener('mouseover', function(){ this.style.backgroundColor = '#444'; });
                            noneItem.addEventListener('mouseout', function(){ this.style.backgroundColor = 'transparent'; });
                            noneItem.addEventListener('click', function(){
                                const searchEl = document.getElementById('boolean-filter-search');
                                const selectEl = document.getElementById('boolean-filter-column-select');
                                const dd = document.getElementById('boolean-filter-dropdown');
                                const valWrap = document.getElementById('boolean-filter-value-wrap');
                                if (searchEl) searchEl.value = '';
                                if (selectEl) selectEl.value = '';
                                if (valWrap) valWrap.style.display = 'none';
                                if (dd) dd.style.display = 'none';
                            });
                            dropdown.appendChild(noneItem);
                        }
                        (cols || []).forEach(c => {
                            const o = document.createElement('option'); o.value=c; o.textContent=c; boolSelect.appendChild(o);
                            if (dropdown) {
                                const item = document.createElement('div');
                                item.className = 'dropdown-item';
                                item.textContent = c;
                                item.style.padding = '8px';
                                item.style.cursor = 'pointer';
                                item.style.borderBottom = '1px solid #444';
                                item.style.transition = 'background-color 0.2s';
                                item.addEventListener('mouseover', function(){ this.style.backgroundColor = '#444'; });
                                item.addEventListener('mouseout', function(){ this.style.backgroundColor = 'transparent'; });
                                item.addEventListener('click', function(){
                                    const searchEl = document.getElementById('boolean-filter-search');
                                    const selectEl = document.getElementById('boolean-filter-column-select');
                                    const dd = document.getElementById('boolean-filter-dropdown');
                                    const valWrap = document.getElementById('boolean-filter-value-wrap');
                                    if (searchEl) searchEl.value = c;
                                    if (selectEl) selectEl.value = c;
                                    if (valWrap) valWrap.style.display = 'block';
                                    if (dd) dd.style.display = 'none';
                                });
                                dropdown.appendChild(item);
                            }
                        });
                    }).catch(()=>{});
                }
            })
            .catch(error => {
                console.error('Error loading catalog columns:', error);
                showErrorMessage('Error loading columns: ' + (error && error.message ? error.message : String(error)));
            });
        return;
    }
    
    // If we don't have any data yet, check for catalog selection
    const catalogSelect = document.getElementById('catalog-select');
    const selectedCatalog = catalogSelect ? catalogSelect.value : null;
    
    if (
        !selectedCatalog &&
        !window.plotterSelectedCatalogName &&
        !paneCatalogName &&
        !(typeof activeCatalog !== 'undefined' ? activeCatalog : null) &&
        !window.currentCatalogName &&
        !window.activeCatalog
    ) {
        showErrorMessage('No catalog selected');
        return;
    }
    // Use either the selected catalog or active catalog
    const catalogToUse =
        selectedCatalog ||
        window.plotterSelectedCatalogName ||
        paneCatalogName ||
        window.currentCatalogName ||
        window.activeCatalog ||
        (typeof activeCatalog !== 'undefined' ? activeCatalog : null);
    // Show loading indicators
    showLoadingIndicators();
    // Use /catalog-columns/ to populate dropdowns without requiring a RA/Dec match.
    apiFetch(`/catalog-columns/?catalog_name=${encodeURIComponent(String(catalogToUse || ''))}`)
        .then(response => {
            if (!response.ok) {
                return response.json().then(err => { throw new Error(err.detail || err.error || 'Failed to load columns'); });
            }
            return response.json();
        })
        .then(data => {
            const cols = (data && data.columns) ? data.columns : [];
            if (!Array.isArray(cols) || cols.length === 0) {
                throw new Error('No columns returned');
            }
            const sample = {};
            cols.forEach(c => { sample[c] = null; });
            // Store as a "columns-only" sample for dropdown population only (do NOT overwrite plot data cache)
            try { window.plotterColumnSampleData = [sample]; } catch (_) {}
            try { window.plotterColumnSampleCatalogName = catalogToUse; } catch (_) {}
            processDropdownOptions([sample]);
        })
        .catch(error => {
            console.error('Error loading catalog columns:', error);
            showErrorMessage('Error: ' + (error && error.message ? error.message : String(error)));
        });
    
    function processDropdownOptions(data) {
        // Get column names from all objects
        if (data.length === 0) {
            showErrorMessage('No data available');
            return;
        }
        
        console.log("Processing dropdown options with", data.length, "data objects");
        
        // Create Maps to track columns and column types
        const allColumns = new Map(); // All column names -> data type or "mixed"
        const skippedColumns = new Set(); // Columns skipped for any reason
        
        // Debug: Check for missing columns
        let hasMissingColumn = false;
        if (data[0] && Object.keys(data[0]).some(key => key.includes('halpha') || key.includes('Halpha'))) {
            console.log("Found Halpha-related columns in the data");
            hasMissingColumn = true;
        }
        
        // First pass: collect all column names and their types from all data objects
        data.forEach((item, index) => {
            if (!item) {
                console.log("Skipping null/undefined item at index", index);
                return;
            }
            
            // Debug: log the object to inspect it
            if (index === 0) {
                console.log("First data object keys:", Object.keys(item).join(", "));
                
                // If we're specifically looking for Hst_halpha
                const halphaKey = Object.keys(item).find(key => key.includes('halpha') || key.includes('Halpha'));
                if (halphaKey) {
                    console.log(`Found key matching Halpha: ${halphaKey}, value:`, item[halphaKey]);
                } else {
                    console.log("No key matching Halpha found");
                }
            }
            
            Object.entries(item).forEach(([key, value]) => {
                // Skip internal properties
                if (key.startsWith('_')) {
                    skippedColumns.add(key);
                    return;
                }
                
                let dataType = typeof value;
                
                // Handle special case for null/undefined
                if (value === null || value === undefined) {
                    dataType = 'null';
                }
                // Handle objects with value property
                else if (dataType === 'object' && value !== null && 'value' in value) {
                    dataType = typeof value.value;
                    if (dataType === 'undefined' || value.value === null) {
                        dataType = 'null';
                    }
                }
                
                // Update the column type in the map
                if (allColumns.has(key)) {
                    const currentType = allColumns.get(key);
                    // If types don't match, mark as mixed
                    if (currentType !== dataType && currentType !== 'mixed') {
                        allColumns.set(key, 'mixed');
                    }
                } else {
                    allColumns.set(key, dataType);
                }
            });
        });
        
        // Debug: show all columns and their types
        console.log("All detected columns and types:", Array.from(allColumns.entries()));
        
        // Function to check if a value can be treated as numeric
        function isNumericValue(value) {
            // Handle direct number type
            if (typeof value === 'text' && isFinite(value)) {
                return true;
            }
            
            // Handle string that can be parsed as number
            if (typeof value === 'string') {
                const parsed = parseFloat(value);
                return !isNaN(parsed) && isFinite(parsed);
            }
            
            // Handle objects with value property
            if (typeof value === 'object' && value !== null && 'value' in value) {
                const subValue = value.value;
                if (typeof subValue === 'text' && isFinite(subValue)) {
                    return true;
                }
                if (typeof subValue === 'string') {
                    const parsed = parseFloat(subValue);
                    return !isNaN(parsed) && isFinite(parsed);
                }
            }
            
            return false;
        }
        
        // Second pass: collect columns with numeric values (even if type is mixed)
        const numericColumns = new Set();
        
        data.forEach(item => {
            if (!item) return;
            
            Object.entries(item).forEach(([key, value]) => {
                // Skip if already added or internal property
                if (key.startsWith('_') || numericColumns.has(key)) return;
                
                // Check if any value for this column is numeric
                if (isNumericValue(value)) {
                    numericColumns.add(key);
                }
                
                // Special case for objects with numeric value property
                if (typeof value === 'object' && value !== null && 'value' in value) {
                    if (isNumericValue(value.value)) {
                        numericColumns.add(key);
                    }
                }
            });
        });
        
        // Debug: check specifically for Halpha columns
        const halphaColumns = Array.from(allColumns.keys()).filter(key => 
            key.toLowerCase().includes('halpha') || key.toLowerCase().includes('hst_h'));
            
        console.log("Halpha-related columns detected:", halphaColumns);
        if (halphaColumns.length > 0) {
            halphaColumns.forEach(key => {
                // Check why it might be excluded from numeric columns
                if (!numericColumns.has(key)) {
                    console.log(`Column ${key} excluded from numeric columns. Type:`, allColumns.get(key));
                    
                    // Check values in all data objects
                    data.forEach((item, index) => {
                        if (item && key in item) {
                            console.log(`Value in data[${index}][${key}]:`, item[key], "type:", typeof item[key]);
                        }
                    });
                    
                    // Force include it in numeric columns
                    numericColumns.add(key);
                }
            });
        }
        
        // Convert to array and sort alphabetically (case-insensitive)
        // Include all columns, not just detected numeric ones - we'll let the user decide
        const sortedColumns = Array.from(allColumns.keys())
            .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
        
        console.log("Found", sortedColumns.length, "total columns");
        console.log("Found", numericColumns.size, "numeric columns");
        
        // Clear the dropdowns before adding new items (but keep the "None" option for color)
        clearDropdown(xAxisSelect);
        clearDropdown(yAxisSelect);
        clearDropdown(colorSelect);
        
        // Keep the "None" option for colorSelect
        const noneOpt = document.createElement('option');
        noneOpt.value = '';
        noneOpt.textContent = 'None';
        colorSelect.appendChild(noneOpt);
        
        // Clear the visual dropdowns
        clearDropdown(xAxisDropdown);
        clearDropdown(yAxisDropdown);
        
        // Keep the "None" item in colorDropdown
        const noneItemOrig = colorDropdown.querySelector('.dropdown-item');
        clearDropdown(colorDropdown);
        if (noneItemOrig) colorDropdown.appendChild(noneItemOrig);
        
        // Track which columns have been added to avoid duplicates
        const addedToX = new Set();
        const addedToY = new Set();
        const addedToColor = new Set();
        
        // Add ALL columns to the dropdowns, not just numeric ones
        // This allows the user to select any column, even if we couldn't determine if it's numeric
        sortedColumns.forEach(columnName => {
            // Skip internal properties and already added columns
            if (columnName.startsWith('_') || addedToX.has(columnName)) return;
            addedToX.add(columnName);
            
            // Create option for the hidden select element for X axis
            const xOption = document.createElement('option');
            xOption.value = columnName;
            xOption.textContent = columnName;
            xAxisSelect.appendChild(xOption);
            
            // Create item for the X-axis dropdown list
            const xItem = document.createElement('div');
            xItem.className = 'dropdown-item';
            xItem.textContent = columnName;
            xItem.style.padding = '8px';
            xItem.style.cursor = 'pointer';
            xItem.style.borderBottom = '1px solid #444';
            xItem.style.transition = 'background-color 0.2s';
            
            // Hover effect
            xItem.addEventListener('mouseover', function() {
                this.style.backgroundColor = '#444';
            });
            
            xItem.addEventListener('mouseout', function() {
                this.style.backgroundColor = 'transparent';
            });
            
            // Click event
            xItem.addEventListener('click', function() {
                xAxisSelect.value = columnName;
                xAxisSearch.value = columnName;
                xAxisDropdown.style.display = 'none';
            });
            
            xAxisDropdown.appendChild(xItem);
        });
        
        // Add ALL columns to Y-axis
        sortedColumns.forEach(columnName => {
            // Skip internal properties and already added columns
            if (columnName.startsWith('_') || addedToY.has(columnName)) return;
            addedToY.add(columnName);
            
            // Create option for the hidden select element for Y axis
            const yOption = document.createElement('option');
            yOption.value = columnName;
            yOption.textContent = columnName;
            yAxisSelect.appendChild(yOption);
            
            // Create item for Y-axis dropdown
            const yItem = document.createElement('div');
            yItem.className = 'dropdown-item';
            yItem.textContent = columnName;
            yItem.style.padding = '8px';
            yItem.style.cursor = 'pointer';
            yItem.style.borderBottom = '1px solid #444';
            yItem.style.transition = 'background-color 0.2s';
            
            // Hover effect
            yItem.addEventListener('mouseover', function() {
                this.style.backgroundColor = '#444';
            });
            
            yItem.addEventListener('mouseout', function() {
                this.style.backgroundColor = 'transparent';
            });
            
            // Click event
            yItem.addEventListener('click', function() {
                yAxisSelect.value = columnName;
                yAxisSearch.value = columnName;
                yAxisDropdown.style.display = 'none';
            });
            
            yAxisDropdown.appendChild(yItem);
        });
        
        // Add ALL columns to Color
        sortedColumns.forEach(columnName => {
            // Skip internal properties and already added columns
            if (columnName.startsWith('_') || addedToColor.has(columnName)) return;
            addedToColor.add(columnName);
            
            // Create option for the hidden select element for Color
            const colorOption = document.createElement('option');
            colorOption.value = columnName;
            colorOption.textContent = columnName;
            colorSelect.appendChild(colorOption);
            
            // Create item for Color dropdown
            const colorItem = document.createElement('div');
            colorItem.className = 'dropdown-item';
            colorItem.textContent = columnName;
            colorItem.style.padding = '8px';
            colorItem.style.cursor = 'pointer';
            colorItem.style.borderBottom = '1px solid #444';
            colorItem.style.transition = 'background-color 0.2s';
            
            // Hover effect
            colorItem.addEventListener('mouseover', function() {
                this.style.backgroundColor = '#444';
            });
            
            colorItem.addEventListener('mouseout', function() {
                this.style.backgroundColor = 'transparent';
            });
            
            // Click event
            colorItem.addEventListener('click', function() {
                colorSelect.value = columnName;
                colorSearch.value = columnName;
                colorDropdown.style.display = 'none';
            });
            
            colorDropdown.appendChild(colorItem);
        });
        
        // If no columns were found
        if (sortedColumns.length === 0) {
            showErrorMessage('No columns found in the data');
        }
        
        console.log("Dropdowns populated with", addedToX.size, "columns");
    }
}
// Enhanced createPlotterContainer function with better tab styling
function createPlotterContainer() {
    const containerId = 'dynamic-plotter-panel';
    console.log(`[Plotter] createPlotterContainer called for ID: ${containerId}`);
    
    // Check if container already exists
    if (document.getElementById(containerId)) {
        console.log(`[Plotter] Container with ID ${containerId} already exists, returning.`);
        return;
    }
    
    // Add custom styles for tabs
    if (!document.querySelector('style[data-plotter-tabs]')) {
        const tabStyles = document.createElement('style');
        tabStyles.setAttribute('data-plotter-tabs', 'true');
        tabStyles.textContent = `
            /* Tab container styles */
            .plotter-tab-container {
                display: flex;
                gap: 0;
                margin-bottom: 20px;
                background: rgba(30, 30, 30, 0.8);
                border-radius: 10px;
                padding: 4px;
                position: relative;
                overflow: hidden;
                box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.3);
            }
            
            /* Tab button styles */
            .plotter-tab-button {
                flex: 1;
                padding: 10px 16px;
                background: transparent;
                color: rgba(255, 255, 255, 0.6);
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-size: 13px;
                font-weight: 500;
                transition: all 0.3s ease;
                position: relative;
                z-index: 2;
                letter-spacing: 0.3px;
                text-transform: uppercase;
            }
            
            .plotter-tab-button:hover:not(.active) {
                color: rgba(255, 255, 255, 0.85);
                background: rgba(255, 255, 255, 0.03);
            }
            
            .plotter-tab-button.active {
                color: white;
                text-shadow: 0 0 8px rgba(76, 175, 80, 0.4);
            }
            
            /* Sliding indicator */
            .tab-indicator {
                position: absolute;
                height: calc(100% - 8px);
                background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
                border-radius: 6px;
                transition: all 0.4s ease;
                box-shadow: 0 2px 10px rgba(76, 175, 80, 0.4);
                z-index: 1;
            }
            
            /* Tab content animation */
            .tab-content-panel {
                opacity: 0;
                transform: translateY(10px);
                transition: all 0.3s ease;
                display: none;
            }
            
            .tab-content-panel.active {
                opacity: 1;
                transform: translateY(0);
                display: block;
            }
        `;
        document.head.appendChild(tabStyles);
    }
    
    // Create container
    const plotterContainer = document.createElement('div');
    plotterContainer.id = containerId;
    plotterContainer.style.position = 'fixed';
    plotterContainer.style.top = '0';
    plotterContainer.style.right = '0';
    plotterContainer.style.transform = 'translateX(100%)';
    plotterContainer.style.width = '540px';
    plotterContainer.style.height = '100vh';
    plotterContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.95)';
    plotterContainer.style.color = 'white';
    plotterContainer.style.padding = '15px';
    plotterContainer.style.boxSizing = 'border-box';
    plotterContainer.style.boxShadow = '-2px 0 20px rgba(0, 0, 0, 0.8)';
    // Must be above toolbar/file-browser in multi-panel mode (toolbar.js raises them to ~3501/3502)
    plotterContainer.style.zIndex = '3605';
    plotterContainer.style.transition = 'transform 0.3s ease';
    plotterContainer.style.overflowY = 'auto';
    plotterContainer.style.overflowX = 'hidden';
    plotterContainer.style.fontFamily = 'Raleway, Arial, sans-serif';
    
    // Create header
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.paddingBottom = '15px';
    header.style.borderBottom = '1px solid rgba(255, 255, 255, 0.1)';
    header.style.marginBottom = '20px';
    
    const title = document.createElement('h2');
    title.textContent = 'Plotter';
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
    closeButton.style.transition = 'all 0.3s ease';
    closeButton.style.padding = '0';
    closeButton.style.width = '30px';
    closeButton.style.height = '30px';
    closeButton.style.display = 'flex';
    closeButton.style.alignItems = 'center';
    closeButton.style.justifyContent = 'center';
    closeButton.onclick = hidePlotter;
    
    header.appendChild(title);
    header.appendChild(closeButton);
    plotterContainer.appendChild(header);

    // (Top status bar removed; inline status is shown within scatter/histogram controls)

    // Create tab container with indicator
    const plotTypeContainer = document.createElement('div');
    plotTypeContainer.className = 'plotter-tab-container';
    
    // Create sliding indicator
    const indicator = document.createElement('div');
    indicator.className = 'tab-indicator';
    plotTypeContainer.appendChild(indicator);
    
    // Create scatter plot button
    const scatterButton = document.createElement('button');
    scatterButton.id = 'scatter-plot-button';
    scatterButton.className = 'plotter-tab-button active';
    scatterButton.textContent = 'Scatter Plot';
    
    // Create histogram button (use unique ID to avoid conflict with toolbar histogram button)
    const histogramButton = document.createElement('button');
    histogramButton.id = 'plotter-histogram-button';
    histogramButton.className = 'plotter-tab-button';
    histogramButton.textContent = 'Histogram';
    
    // Create SED button
    const sedButton = document.createElement('button');
    sedButton.id = 'sed-button';
    sedButton.className = 'plotter-tab-button';
    sedButton.textContent = 'SED';
    
    // Create AST button
    const astButton = document.createElement('button');
    astButton.id = 'ast-button';
    astButton.className = 'plotter-tab-button';
    astButton.textContent = 'AST';
    
    // Add event listeners to buttons
    scatterButton.addEventListener('click', function() {
        switchToTab('scatter', plotTypeContainer);
    });
    
    histogramButton.addEventListener('click', function() {
        switchToTab('histogram', plotTypeContainer);
    });
    
    sedButton.addEventListener('click', function() {
        switchToTab('sed', plotTypeContainer);
    });
    
    astButton.addEventListener('click', function() {
        switchToTab('ast', plotTypeContainer);
    });
    
    plotTypeContainer.appendChild(scatterButton);
    plotTypeContainer.appendChild(histogramButton);
    plotTypeContainer.appendChild(sedButton);
    plotTypeContainer.appendChild(astButton);
    plotterContainer.appendChild(plotTypeContainer);
    
    // Set initial indicator position
    setTimeout(() => updateIndicatorPosition(plotTypeContainer, scatterButton), 100);
    
    window.currentPlotType = 'scatter';
    
    // Create content
    const content = document.createElement('div');

    // Wrapper for scatter and histogram controls
    const scatterControls = document.createElement('div');
    scatterControls.id = 'scatter-controls';
    scatterControls.className = 'tab-content-panel active';
    scatterControls.style.display = 'block';
    scatterControls.style.opacity = '1';
    scatterControls.style.transform = 'translateY(0)';
    
    // Axis selection section
    const axisSelectionSection = document.createElement('div');
    axisSelectionSection.id = 'axis-selection-section';
    axisSelectionSection.style.marginBottom = '20px';
    
    // Context note shown ABOVE the "Select Axes" heading (requested UX)
    const contextNote = document.createElement('div');
    contextNote.id = 'plotter-context-note';
    contextNote.style.margin = '0 0 6px 0';
    contextNote.style.fontSize = '12px';
    contextNote.style.color = '#aaa';
    contextNote.textContent = 'Catalog: — | Image: —';
    axisSelectionSection.appendChild(contextNote);

    // Catalog picker (only shown when 2+ catalogs are loaded)
    const catalogPickerRow = document.createElement('div');
    catalogPickerRow.id = 'plotter-catalog-picker-row';
    catalogPickerRow.style.display = 'none';
    catalogPickerRow.style.margin = '0 0 8px 0';
    catalogPickerRow.style.gap = '8px';
    catalogPickerRow.style.alignItems = 'center';
    catalogPickerRow.style.fontSize = '12px';
    catalogPickerRow.style.color = '#ccc';
    catalogPickerRow.style.flexWrap = 'wrap';
    catalogPickerRow.style.display = 'flex';

    const catalogPickerLabel = document.createElement('span');
    catalogPickerLabel.textContent = 'Catalog:';
    catalogPickerLabel.style.opacity = '0.9';
    catalogPickerRow.appendChild(catalogPickerLabel);

    const catalogPickerSelect = document.createElement('select');
    catalogPickerSelect.id = 'plotter-catalog-select';
    catalogPickerSelect.style.padding = '6px 8px';
    catalogPickerSelect.style.backgroundColor = '#333';
    catalogPickerSelect.style.color = 'white';
    catalogPickerSelect.style.border = '1px solid #555';
    catalogPickerSelect.style.borderRadius = '6px';
    catalogPickerSelect.style.minWidth = '220px';
    catalogPickerRow.appendChild(catalogPickerSelect);

    axisSelectionSection.appendChild(catalogPickerRow);

    const axisSelectionTitle = document.createElement('h3');
    axisSelectionTitle.textContent = 'Select Axes';
    axisSelectionTitle.style.fontSize = '16px';
    axisSelectionTitle.style.marginBottom = '10px';
    axisSelectionSection.appendChild(axisSelectionTitle);
    
    // Create searchable X-axis dropdown
    const xAxisLabel = document.createElement('label');
    xAxisLabel.textContent = 'X-Axis:';
    xAxisLabel.style.display = 'block';
    xAxisLabel.style.marginBottom = '5px';
    axisSelectionSection.appendChild(xAxisLabel);
    
    const xAxisContainer = document.createElement('div');
    xAxisContainer.style.position = 'relative';
    xAxisContainer.style.marginBottom = '15px';
    
    const xAxisSearch = document.createElement('input');
    xAxisSearch.id = 'x-axis-search';
    xAxisSearch.type = 'text';
    xAxisSearch.placeholder = 'Search for column...';
    xAxisSearch.style.width = '100%';
    xAxisSearch.style.padding = '8px';
    xAxisSearch.style.backgroundColor = '#333';
    xAxisSearch.style.color = 'white';
    xAxisSearch.style.border = '1px solid #555';
    xAxisSearch.style.borderRadius = '4px';
    xAxisSearch.style.marginBottom = '5px';
    xAxisContainer.appendChild(xAxisSearch);
    
    const xAxisDropdown = document.createElement('div');
    xAxisDropdown.id = 'x-axis-dropdown';
    xAxisDropdown.style.display = 'none';
    xAxisDropdown.style.position = 'absolute';
    xAxisDropdown.style.width = '100%';
    xAxisDropdown.style.maxHeight = '200px';
    xAxisDropdown.style.overflowY = 'auto';
    xAxisDropdown.style.backgroundColor = '#333';
    xAxisDropdown.style.border = '1px solid #555';
    xAxisDropdown.style.borderRadius = '4px';
    xAxisDropdown.style.zIndex = '1002';
    xAxisContainer.appendChild(xAxisDropdown);
    
    const xAxisSelect = document.createElement('select');
    xAxisSelect.id = 'x-axis-select';
    xAxisSelect.style.display = 'none';
    xAxisContainer.appendChild(xAxisSelect);
    
    // Add event listeners for X-axis search
    xAxisSearch.addEventListener('focus', function() {
        xAxisDropdown.style.display = 'block';
    });
    
    xAxisSearch.addEventListener('blur', function() {
        setTimeout(() => {
            xAxisDropdown.style.display = 'none';
        }, 200);
    });
    
    xAxisSearch.addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase();
        const options = xAxisDropdown.querySelectorAll('.dropdown-item');
        
        options.forEach(option => {
            const text = option.textContent.toLowerCase();
            if (text.includes(searchTerm)) {
                option.style.display = 'block';
            } else {
                option.style.display = 'none';
            }
        });
    });
    
    axisSelectionSection.appendChild(xAxisContainer);
    
    // Create searchable Y-axis dropdown
    const yAxisLabel = document.createElement('label');
    yAxisLabel.textContent = 'Y-Axis:';
    yAxisLabel.style.display = 'block';
    yAxisLabel.style.marginBottom = '5px';
    axisSelectionSection.appendChild(yAxisLabel);
    
    const yAxisContainer = document.createElement('div');
    yAxisContainer.id = 'y-axis-container';
    yAxisContainer.style.position = 'relative';
    yAxisContainer.style.marginBottom = '15px';
    
    const yAxisSearch = document.createElement('input');
    yAxisSearch.id = 'y-axis-search';
    yAxisSearch.type = 'text';
    yAxisSearch.placeholder = 'Search for column...';
    yAxisSearch.style.width = '100%';
    yAxisSearch.style.padding = '8px';
    yAxisSearch.style.backgroundColor = '#333';
    yAxisSearch.style.color = 'white';
    yAxisSearch.style.border = '1px solid #555';
    yAxisSearch.style.borderRadius = '4px';
    yAxisSearch.style.marginBottom = '5px';
    yAxisContainer.appendChild(yAxisSearch);
    
    const yAxisDropdown = document.createElement('div');
    yAxisDropdown.id = 'y-axis-dropdown';
    yAxisDropdown.style.display = 'none';
    yAxisDropdown.style.position = 'absolute';
    yAxisDropdown.style.width = '100%';
    yAxisDropdown.style.maxHeight = '200px';
    yAxisDropdown.style.overflowY = 'auto';
    yAxisDropdown.style.backgroundColor = '#333';
    yAxisDropdown.style.border = '1px solid #555';
    yAxisDropdown.style.borderRadius = '4px';
    yAxisDropdown.style.zIndex = '1002';
    yAxisContainer.appendChild(yAxisDropdown);
    
    const yAxisSelect = document.createElement('select');
    yAxisSelect.id = 'y-axis-select';
    yAxisSelect.style.display = 'none';
    yAxisContainer.appendChild(yAxisSelect);
    
    // Add event listeners for Y-axis search
    yAxisSearch.addEventListener('focus', function() {
        yAxisDropdown.style.display = 'block';
    });
    
    yAxisSearch.addEventListener('blur', function() {
        setTimeout(() => {
            yAxisDropdown.style.display = 'none';
        }, 200);
    });
    
    yAxisSearch.addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase();
        const options = yAxisDropdown.querySelectorAll('.dropdown-item');
        
        options.forEach(option => {
            const text = option.textContent.toLowerCase();
            if (text.includes(searchTerm)) {
                option.style.display = 'block';
            } else {
                option.style.display = 'none';
            }
        });
    });
    
    axisSelectionSection.appendChild(yAxisContainer);
    
    // Create searchable Color dropdown
    const colorLabel = document.createElement('label');
    colorLabel.textContent = 'Color By:';
    colorLabel.style.display = 'block';
    colorLabel.style.marginBottom = '5px';
    axisSelectionSection.appendChild(colorLabel);
    
    const colorContainer = document.createElement('div');
    colorContainer.id = 'color-container';
    colorContainer.style.position = 'relative';
    colorContainer.style.marginBottom = '15px';
    
    const colorSearch = document.createElement('input');
    colorSearch.id = 'color-axis-search';
    colorSearch.type = 'text';
    colorSearch.placeholder = 'Search for column...';
    colorSearch.style.width = '100%';
    colorSearch.style.padding = '8px';
    colorSearch.style.backgroundColor = '#333';
    colorSearch.style.color = 'white';
    colorSearch.style.border = '1px solid #555';
    colorSearch.style.borderRadius = '4px';
    colorSearch.style.marginBottom = '5px';
    colorContainer.appendChild(colorSearch);
    
    const colorDropdown = document.createElement('div');
    colorDropdown.id = 'color-axis-dropdown';
    colorDropdown.style.display = 'none';
    colorDropdown.style.position = 'absolute';
    colorDropdown.style.width = '100%';
    colorDropdown.style.maxHeight = '200px';
    colorDropdown.style.overflowY = 'auto';
    colorDropdown.style.backgroundColor = '#333';
    colorDropdown.style.border = '1px solid #555';
    colorDropdown.style.borderRadius = '4px';
    colorDropdown.style.zIndex = '1002';
    colorContainer.appendChild(colorDropdown);
    
    const colorSelect = document.createElement('select');
    colorSelect.id = 'color-axis-select';
    colorSelect.style.display = 'none';
    colorContainer.appendChild(colorSelect);
    
    // Add event listeners for Color search
    colorSearch.addEventListener('focus', function() {
        colorDropdown.style.display = 'block';
    });
    
    colorSearch.addEventListener('blur', function() {
        setTimeout(() => {
            colorDropdown.style.display = 'none';
        }, 200);
    });
    
    colorSearch.addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase();
        const options = colorDropdown.querySelectorAll('.dropdown-item');
        
        options.forEach(option => {
            const text = option.textContent.toLowerCase();
            if (text.includes(searchTerm)) {
                option.style.display = 'block';
            } else {
                option.style.display = 'none';
            }
        });
    });
    
    axisSelectionSection.appendChild(colorContainer);
    
    // Create colormap selection dropdown with preview
    const colormapLabel = document.createElement('label');
    colormapLabel.textContent = 'Colormap:';
    colormapLabel.htmlFor = 'colormap-select';
    colormapLabel.style.display = 'block';
    colormapLabel.style.marginBottom = '5px';
    axisSelectionSection.appendChild(colormapLabel);
    
    const colormapContainer = document.createElement('div');
    colormapContainer.style.marginBottom = '15px';
    
    const colormapSelect = document.createElement('select');
    colormapSelect.id = 'colormap-select';
    colormapSelect.style.width = '100%';
    colormapSelect.style.padding = '8px';
    colormapSelect.style.backgroundColor = '#333';
    colormapSelect.style.color = 'white';
    colormapSelect.style.border = '1px solid #555';
    colormapSelect.style.borderRadius = '4px';
    colormapSelect.style.marginBottom = '10px';
    
    // Add colormap options
    const colormaps = [
        { name: 'viridis', colors: ['#440154', '#414487', '#2a788e', '#22a884', '#7ad151', '#fde725'] },
        { name: 'plasma', colors: ['#0d0887', '#5302a3', '#8b0aa5', '#b83289', '#db5c68', '#f48849', '#febc2a'] },
        { name: 'inferno', colors: ['#000004', '#320a5a', '#781c6d', '#bb3754', '#ec6824', '#fbb41a'] },
        { name: 'magma', colors: ['#000004', '#2c115f', '#721f81', '#b73779', '#f0605d', '#febc2a'] },
        { name: 'cividis', colors: ['#00204c', '#213d6b', '#555b6c', '#7b7a77', '#a59c74', '#d9d57a'] },
        { name: 'rainbow', colors: ['#6e40aa', '#be3caf', '#fe4b83', '#ff7847', '#e2b72f', '#aff05b'] },
        { name: 'turbo', colors: ['#30123b', '#4145ab', '#4675ed', '#39a8fd', '#1bcfd4', '#24eca6', '#63f14e', '#b8e93b', '#feca12', '#fc8a15', '#ea4a1f', '#a52b19'] },
        { name: 'jet', colors: ['#00008f', '#0020ff', '#00ffff', '#51ff77', '#fdff00', '#ff0000', '#800000'] }
    ];
    
    colormaps.forEach(colormap => {
        const option = document.createElement('option');
        option.value = colormap.name;
        option.textContent = colormap.name;
        colormapSelect.appendChild(option);
    });
    
    colormapContainer.appendChild(colormapSelect);
    
    // Create colormap preview
    const colormapPreview = document.createElement('div');
    colormapPreview.id = 'colormap-preview';
    colormapPreview.style.height = '20px';
    colormapPreview.style.width = '100%';
    colormapPreview.style.borderRadius = '4px';
    colormapPreview.style.border = '1px solid #555';
    colormapPreview.style.marginBottom = '5px';
    
    // Function to update colormap preview
    function updateColormapPreview() {
        const selectedColormap = colormapSelect.value;
        const colormap = colormaps.find(cm => cm.name === selectedColormap);
        if (colormap) {
            const gradient = `linear-gradient(to right, ${colormap.colors.join(', ')})`;
            colormapPreview.style.background = gradient;
        }
    }
    
    // Add event listener to update preview when selection changes
    colormapSelect.addEventListener('change', updateColormapPreview);
    
    colormapContainer.appendChild(colormapPreview);
    axisSelectionSection.appendChild(colormapContainer);
    
    // Set initial preview
    updateColormapPreview();
    
    // Add Color Axis Scale selector
    const colorScaleContainer = document.createElement('div');
    colorScaleContainer.id = 'color-scale-container';
    colorScaleContainer.style.marginBottom = '15px';
    
    const colorScaleLabel = document.createElement('label');
    colorScaleLabel.textContent = 'Color-Axis Scale:';
    colorScaleLabel.style.display = 'block';
    colorScaleLabel.style.marginBottom = '5px';
    colorScaleContainer.appendChild(colorScaleLabel);
    
    const colorScaleSelect = document.createElement('select');
    colorScaleSelect.id = 'color-scale-select';
    colorScaleSelect.style.width = '100%';
    colorScaleSelect.style.padding = '8px';
    colorScaleSelect.style.backgroundColor = '#333';
    colorScaleSelect.style.color = 'white';
    colorScaleSelect.style.border = '1px solid #555';
    colorScaleSelect.style.borderRadius = '4px';
    
    const colorScaleLinear = document.createElement('option');
    colorScaleLinear.value = 'linear';
    colorScaleLinear.textContent = 'Linear';
    colorScaleSelect.appendChild(colorScaleLinear);
    
    const colorScaleLog = document.createElement('option');
    colorScaleLog.value = 'log';
    colorScaleLog.textContent = 'Logarithmic';
    colorScaleSelect.appendChild(colorScaleLog);
    
    colorScaleContainer.appendChild(colorScaleSelect);
    axisSelectionSection.appendChild(colorScaleContainer);
    
    scatterControls.appendChild(axisSelectionSection);
    
    // Plot customization section
    const customizationSection = document.createElement('div');
    customizationSection.id = 'customization-section';
    customizationSection.style.marginBottom = '20px';
    
    const customizationTitle = document.createElement('h3');
    customizationTitle.textContent = 'Plot Customization';
    customizationTitle.style.fontSize = '16px';
    customizationTitle.style.marginBottom = '10px';
    customizationSection.appendChild(customizationTitle);
    
    // Plot title
    const plotTitleLabel = document.createElement('label');
    plotTitleLabel.textContent = 'Plot Title:';
    plotTitleLabel.style.display = 'block';
    plotTitleLabel.style.marginBottom = '5px';
    customizationSection.appendChild(plotTitleLabel);
    
    const plotTitleInput = document.createElement('input');
    plotTitleInput.id = 'plot-title-input';
    plotTitleInput.type = 'text';
    plotTitleInput.placeholder = 'Enter plot title';
    plotTitleInput.style.width = '100%';
    plotTitleInput.style.padding = '5px';
    plotTitleInput.style.marginBottom = '10px';
    plotTitleInput.style.backgroundColor = '#333';
    plotTitleInput.style.color = 'white';
    plotTitleInput.style.border = '1px solid #555';
    plotTitleInput.style.borderRadius = '4px';
    customizationSection.appendChild(plotTitleInput);
    
    // X-axis label
    const xLabelLabel = document.createElement('label');
    xLabelLabel.textContent = 'X-Axis Label (supports LaTeX-like syntax):';
    xLabelLabel.style.display = 'block';
    xLabelLabel.style.marginBottom = '5px';
    customizationSection.appendChild(xLabelLabel);
    
    const xLabelInput = document.createElement('input');
    xLabelInput.id = 'x-label-input';
    xLabelInput.type = 'text';
    xLabelInput.placeholder = 'Enter x-axis label (e.g. "Mass)';
    xLabelInput.style.width = '100%';
    xLabelInput.style.padding = '5px';
    xLabelInput.style.marginBottom = '10px';
    xLabelInput.style.backgroundColor = '#333';
    xLabelInput.style.color = 'white';
    xLabelInput.style.border = '1px solid #555';
    xLabelInput.style.borderRadius = '4px';
    customizationSection.appendChild(xLabelInput);
    
    // Y-axis label
    const yLabelLabel = document.createElement('label');
    yLabelLabel.textContent = 'Y-Axis Label (supports LaTeX-like syntax):';
    yLabelLabel.style.display = 'block';
    yLabelLabel.style.marginBottom = '5px';
    customizationSection.appendChild(yLabelLabel);
    
    const yLabelInput = document.createElement('input');
    yLabelInput.id = 'y-label-input';
    yLabelInput.type = 'text';
    yLabelInput.placeholder = 'Enter y-axis label (e.g. "Luminosity")';
    yLabelInput.style.width = '100%';
    yLabelInput.style.padding = '5px';
    yLabelInput.style.marginBottom = '10px';
    yLabelInput.style.backgroundColor = '#333';
    yLabelInput.style.color = 'white';
    yLabelInput.style.border = '1px solid #555';
    yLabelInput.style.borderRadius = '4px';
    customizationSection.appendChild(yLabelInput);
    
    // Axis scales
    const scalesDiv = document.createElement('div');
    scalesDiv.style.display = 'flex';
    scalesDiv.style.justifyContent = 'space-between';
    scalesDiv.style.marginBottom = '10px';
    
    // X-axis scale
    const xScaleDiv = document.createElement('div');
    xScaleDiv.style.width = '48%';
    
    const xScaleLabel = document.createElement('label');
    xScaleLabel.textContent = 'X-Axis Scale:';
    xScaleLabel.style.display = 'block';
    xScaleLabel.style.marginBottom = '5px';
    xScaleDiv.appendChild(xScaleLabel);
    
    const xScaleSelect = document.createElement('select');
    xScaleSelect.id = 'x-scale-select';
    xScaleSelect.style.width = '100%';
    xScaleSelect.style.padding = '5px';
    xScaleSelect.style.backgroundColor = '#333';
    xScaleSelect.style.color = 'white';
    xScaleSelect.style.border = '1px solid #555';
    xScaleSelect.style.borderRadius = '4px';
    
    const xScaleLinear = document.createElement('option');
    xScaleLinear.value = 'linear';
    xScaleLinear.textContent = 'Linear';
    xScaleSelect.appendChild(xScaleLinear);
    
    const xScaleLog = document.createElement('option');
    xScaleLog.value = 'log';
    xScaleLog.textContent = 'Logarithmic';
    xScaleSelect.appendChild(xScaleLog);
    
    xScaleDiv.appendChild(xScaleSelect);
    scalesDiv.appendChild(xScaleDiv);
    
    // Y-axis scale
    const yScaleDiv = document.createElement('div');
    yScaleDiv.style.width = '48%';
    
    const yScaleLabel = document.createElement('label');
    yScaleLabel.textContent = 'Y-Axis Scale:';
    yScaleLabel.style.display = 'block';
    yScaleLabel.style.marginBottom = '5px';
    yScaleDiv.appendChild(yScaleLabel);
    
    const yScaleSelect = document.createElement('select');
    yScaleSelect.id = 'y-scale-select';
    yScaleSelect.style.width = '100%';
    yScaleSelect.style.padding = '5px';
    yScaleSelect.style.backgroundColor = '#333';
    yScaleSelect.style.color = 'white';
    yScaleSelect.style.border = '1px solid #555';
    yScaleSelect.style.borderRadius = '4px';
    
    const yScaleLinear = document.createElement('option');
    yScaleLinear.value = 'linear';
    yScaleLinear.textContent = 'Linear';
    yScaleSelect.appendChild(yScaleLinear);
    
    const yScaleLog = document.createElement('option');
    yScaleLog.value = 'log';
    yScaleLog.textContent = 'Logarithmic';
    yScaleSelect.appendChild(yScaleLog);
    
    yScaleDiv.appendChild(yScaleSelect);
    scalesDiv.appendChild(yScaleDiv);
    
    customizationSection.appendChild(scalesDiv);
    
    // Point transparency (alpha) slider
    const alphaDiv = document.createElement('div');
    alphaDiv.id = 'alpha-div';
    alphaDiv.style.marginBottom = '15px';
    
    const alphaLabel = document.createElement('label');
    alphaLabel.textContent = 'Point Transparency:';
    alphaLabel.style.display = 'block';
    alphaLabel.style.marginBottom = '5px';
    alphaDiv.appendChild(alphaLabel);
    
    const alphaSliderContainer = document.createElement('div');
    alphaSliderContainer.style.display = 'flex';
    alphaSliderContainer.style.alignItems = 'center';
    alphaSliderContainer.style.gap = '10px';
    
    const alphaSlider = document.createElement('input');
    alphaSlider.id = 'alpha-slider';
    alphaSlider.type = 'range';
    alphaSlider.min = '0';
    alphaSlider.max = '100';
    alphaSlider.value = '70';
    alphaSlider.style.flex = '1';
    alphaSlider.style.height = '6px';
    alphaSlider.style.appearance = 'none';
    alphaSlider.style.backgroundColor = '#555';
    alphaSlider.style.borderRadius = '3px';
    alphaSlider.style.outline = 'none';
    alphaSlider.style.webkitAppearance = 'none';
    alphaSlider.style.cursor = 'pointer';
    
    // Add custom CSS for the slider thumb
    const alphaStyle = document.createElement('style');
    alphaStyle.textContent = `
        #alpha-slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #4CAF50;
            cursor: pointer;
        }
        #alpha-slider::-moz-range-thumb {
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #4CAF50;
            cursor: pointer;
            border: none;
        }
    `;
    document.head.appendChild(alphaStyle);
    
    const alphaValue = document.createElement('span');
    alphaValue.id = 'alpha-value';
    alphaValue.textContent = '70%';
    alphaValue.style.minWidth = '40px';
    alphaValue.style.textAlign = 'right';
    
    alphaSlider.addEventListener('input', function() {
        alphaValue.textContent = `${this.value}%`;
    });
    
    alphaSliderContainer.appendChild(alphaSlider);
    alphaSliderContainer.appendChild(alphaValue);
    alphaDiv.appendChild(alphaSliderContainer);
    customizationSection.appendChild(alphaDiv);
    
    // Histogram-specific controls
    const histogramControls = document.createElement('div');
    histogramControls.id = 'histogram-controls';
    histogramControls.style.display = 'none';
    histogramControls.style.marginBottom = '15px';
    
    // Number of bins slider
    const binsDiv = document.createElement('div');
    binsDiv.style.marginBottom = '15px';
    
    const binsLabel = document.createElement('label');
    binsLabel.textContent = 'Number of Bins:';
    binsLabel.style.display = 'block';
    binsLabel.style.marginBottom = '5px';
    binsDiv.appendChild(binsLabel);
    
    const binsSliderContainer = document.createElement('div');
    binsSliderContainer.style.display = 'flex';
    binsSliderContainer.style.alignItems = 'center';
    binsSliderContainer.style.gap = '10px';
    
    const binsSlider = document.createElement('input');
    binsSlider.id = 'bins-slider';
    binsSlider.type = 'range';
    binsSlider.min = '5';
    binsSlider.max = '50';
    binsSlider.value = '20';
    binsSlider.style.flex = '1';
    binsSlider.style.height = '6px';
    binsSlider.style.appearance = 'none';
    binsSlider.style.backgroundColor = '#555';
    binsSlider.style.borderRadius = '3px';
    binsSlider.style.outline = 'none';
    binsSlider.style.webkitAppearance = 'none';
    binsSlider.style.cursor = 'pointer';
    
    const binsValue = document.createElement('span');
    binsValue.id = 'bins-value';
    binsValue.textContent = '20';
    binsValue.style.minWidth = '30px';
    binsValue.style.textAlign = 'right';
    
    binsSlider.addEventListener('input', function() {
        binsValue.textContent = this.value;
    });
    binsSliderContainer.appendChild(binsSlider);
    binsSliderContainer.appendChild(binsValue);
    binsDiv.appendChild(binsSliderContainer);
    histogramControls.appendChild(binsDiv);
    
    // Bar color picker
    const barColorDiv = document.createElement('div');
    barColorDiv.style.marginBottom = '15px';
    
    const barColorLabel = document.createElement('label');
    barColorLabel.textContent = 'Bar Color:';
    barColorLabel.style.display = 'block';
    barColorLabel.style.marginBottom = '5px';
    barColorDiv.appendChild(barColorLabel);
    
    const barColorPicker = document.createElement('input');
    barColorPicker.id = 'bar-color-picker';
    barColorPicker.type = 'color';
    barColorPicker.value = '#4CAF50';
    barColorPicker.style.width = '40px';
    barColorPicker.style.height = '30px';
    barColorPicker.style.borderRadius = '4px';
    barColorPicker.style.border = 'none';
    barColorPicker.style.cursor = 'pointer';
    barColorDiv.appendChild(barColorPicker);
    histogramControls.appendChild(barColorDiv);
    
    // Add normalization controls to histogram
    addNormalizationControls(histogramControls);
    customizationSection.appendChild(histogramControls);
    
    // Axis limits
    const limitsTitle = document.createElement('h4');
    limitsTitle.textContent = 'Axis Limits';
    limitsTitle.style.fontSize = '14px';
    limitsTitle.style.marginTop = '15px';
    limitsTitle.style.marginBottom = '10px';
    customizationSection.appendChild(limitsTitle);
    
    // Auto limits checkbox
    const autoLimitsDiv = document.createElement('div');
    autoLimitsDiv.style.marginBottom = '10px';
    
    const autoLimitsCheckbox = document.createElement('input');
    autoLimitsCheckbox.type = 'checkbox';
    autoLimitsCheckbox.id = 'auto-limits-checkbox';
    autoLimitsCheckbox.checked = true;
    autoLimitsCheckbox.style.marginRight = '5px';
    autoLimitsDiv.appendChild(autoLimitsCheckbox);
    
    const autoLimitsLabel = document.createElement('label');
    autoLimitsLabel.textContent = 'Auto-detect axis limits';
    autoLimitsLabel.htmlFor = 'auto-limits-checkbox';
    autoLimitsDiv.appendChild(autoLimitsLabel);
    customizationSection.appendChild(autoLimitsDiv);
    
    // Manual limits container
    const manualLimitsDiv = document.createElement('div');
    manualLimitsDiv.id = 'manual-limits-div';
    manualLimitsDiv.style.display = 'none';
    
    // X-axis limits
    const xLimitsDiv = document.createElement('div');
    xLimitsDiv.style.display = 'flex';
    xLimitsDiv.style.justifyContent = 'space-between';
    xLimitsDiv.style.marginBottom = '10px';
    
    const xMinDiv = document.createElement('div');
    xMinDiv.style.width = '48%';
    
    const xMinLabel = document.createElement('label');
    xMinLabel.textContent = 'X Min:';
    xMinLabel.style.display = 'block';
    xMinLabel.style.marginBottom = '5px';
    xMinDiv.appendChild(xMinLabel);
    
    const xMinInput = document.createElement('input');
    xMinInput.id = 'x-min-input';
    xMinInput.type = 'number';
    xMinInput.placeholder = 'Min';
    xMinInput.style.width = '100%';
    xMinInput.style.padding = '5px';
    xMinInput.style.backgroundColor = '#333';
    xMinInput.style.color = 'white';
    xMinInput.style.border = '1px solid #555';
    xMinInput.style.borderRadius = '4px';
    xMinDiv.appendChild(xMinInput);
    xLimitsDiv.appendChild(xMinDiv);
    
    const xMaxDiv = document.createElement('div');
    xMaxDiv.style.width = '48%';
    
    const xMaxLabel = document.createElement('label');
    xMaxLabel.textContent = 'X Max:';
    xMaxLabel.style.display = 'block';
    xMaxLabel.style.marginBottom = '5px';
    xMaxDiv.appendChild(xMaxLabel);
    
    const xMaxInput = document.createElement('input');
    xMaxInput.id = 'x-max-input';
    xMaxInput.type = 'number';
    xMaxInput.placeholder = 'Max';
    xMaxInput.style.width = '100%';
    xMaxInput.style.padding = '5px';
    xMaxInput.style.backgroundColor = '#333';
    xMaxInput.style.color = 'white';
    xMaxInput.style.border = '1px solid #555';
    xMaxInput.style.borderRadius = '4px';
    xMaxDiv.appendChild(xMaxInput);
    xLimitsDiv.appendChild(xMaxDiv);
    manualLimitsDiv.appendChild(xLimitsDiv);
    
    // Y-axis limits
    const yLimitsDiv = document.createElement('div');
    yLimitsDiv.style.display = 'flex';
    yLimitsDiv.style.justifyContent = 'space-between';
    
    const yMinDiv = document.createElement('div');
    yMinDiv.style.width = '48%';
    
    const yMinLabel = document.createElement('label');
    yMinLabel.textContent = 'Y Min:';
    yMinLabel.style.display = 'block';
    yMinLabel.style.marginBottom = '5px';
    yMinDiv.appendChild(yMinLabel);
    
    const yMinInput = document.createElement('input');
    yMinInput.id = 'y-min-input';
    yMinInput.type = 'number';
    yMinInput.placeholder = 'Min';
    yMinInput.style.width = '100%';
    yMinInput.style.padding = '5px';
    yMinInput.style.backgroundColor = '#333';
    yMinInput.style.color = 'white';
    yMinInput.style.border = '1px solid #555';
    yMinInput.style.borderRadius = '4px';
    yMinDiv.appendChild(yMinInput);
    yLimitsDiv.appendChild(yMinDiv);
    
    const yMaxDiv = document.createElement('div');
    yMaxDiv.style.width = '48%';
    
    const yMaxLabel = document.createElement('label');
    yMaxLabel.textContent = 'Y Max:';
    yMaxLabel.style.display = 'block';
    yMaxLabel.style.marginBottom = '5px';
    yMaxDiv.appendChild(yMaxLabel);
    
    const yMaxInput = document.createElement('input');
    yMaxInput.id = 'y-max-input';
    yMaxInput.type = 'number';
    yMaxInput.placeholder = 'Max';
    yMaxInput.style.width = '100%';
    yMaxInput.style.padding = '5px';
    yMaxInput.style.backgroundColor = '#333';
    yMaxInput.style.color = 'white';
    yMaxInput.style.border = '1px solid #555';
    yMaxInput.style.borderRadius = '4px';
    yMaxDiv.appendChild(yMaxInput);
    yLimitsDiv.appendChild(yMaxDiv);
    manualLimitsDiv.appendChild(yLimitsDiv);
    
    // Color axis limits
    const cLimitsDiv = document.createElement('div');
    cLimitsDiv.style.display = 'flex';
    cLimitsDiv.style.justifyContent = 'space-between';
    cLimitsDiv.style.marginTop = '10px';
    
    const cMinDiv = document.createElement('div');
    cMinDiv.style.width = '48%';
    
    const cMinLabel = document.createElement('label');
    cMinLabel.textContent = 'Color Min:';
    cMinLabel.style.display = 'block';
    cMinLabel.style.marginBottom = '5px';
    cMinDiv.appendChild(cMinLabel);
    
    const cMinInput = document.createElement('input');
    cMinInput.id = 'c-min-input';
    cMinInput.type = 'number';
    cMinInput.placeholder = 'Min';
    cMinInput.style.width = '100%';
    cMinInput.style.padding = '5px';
    cMinInput.style.backgroundColor = '#333';
    cMinInput.style.color = 'white';
    cMinInput.style.border = '1px solid #555';
    cMinInput.style.borderRadius = '4px';
    cMinDiv.appendChild(cMinInput);
    cLimitsDiv.appendChild(cMinDiv);
    
    const cMaxDiv = document.createElement('div');
    cMaxDiv.style.width = '48%';
    
    const cMaxLabel = document.createElement('label');
    cMaxLabel.textContent = 'Color Max:';
    cMaxLabel.style.display = 'block';
    cMaxLabel.style.marginBottom = '5px';
    cMaxDiv.appendChild(cMaxLabel);
    
    const cMaxInput = document.createElement('input');
    cMaxInput.id = 'c-max-input';
    cMaxInput.type = 'number';
    cMaxInput.placeholder = 'Max';
    cMaxInput.style.width = '100%';
    cMaxInput.style.padding = '5px';
    cMaxInput.style.backgroundColor = '#333';
    cMaxInput.style.color = 'white';
    cMaxInput.style.border = '1px solid #555';
    cMaxInput.style.borderRadius = '4px';
    cMaxDiv.appendChild(cMaxInput);
    cLimitsDiv.appendChild(cMaxDiv);
    manualLimitsDiv.appendChild(cLimitsDiv);
    
    customizationSection.appendChild(manualLimitsDiv);
    
    // Boolean filter (below axis limits)
    const booleanFilterContainer = document.createElement('div');
    booleanFilterContainer.id = 'boolean-filter-container';
    booleanFilterContainer.style.marginTop = '12px';
    booleanFilterContainer.style.marginBottom = '12px';
    
    const booleanFilterTitle = document.createElement('h4');
    booleanFilterTitle.textContent = 'Boolean Filter';
    booleanFilterTitle.style.fontSize = '14px';
    booleanFilterTitle.style.margin = '0 0 8px 0';
    booleanFilterContainer.appendChild(booleanFilterTitle);
    // Hide boolean filter when Histogram tab is active
    try {
        const plotTypeSel = document.getElementById('plot-type-select');
        const isHistogram = plotTypeSel && plotTypeSel.value === 'histogram';
        if (isHistogram) {
            booleanFilterContainer.style.display = 'none';
        }
        // Also react to changes
        if (plotTypeSel && !plotTypeSel.__bfListenerAttached) {
            plotTypeSel.addEventListener('change', () => {
                const hist = plotTypeSel.value === 'histogram';
                booleanFilterContainer.style.display = hist ? 'none' : '';
            });
            plotTypeSel.__bfListenerAttached = true;
        }
    } catch(_) {}
    
    const booleanRow = document.createElement('div');
    booleanRow.style.display = 'flex';
    booleanRow.style.gap = '10px';
    booleanRow.style.flexWrap = 'wrap'; // allow wrapping to next line
    
    const boolColWrap = document.createElement('div');
    boolColWrap.style.flex = '2';
    const boolColLabel = document.createElement('label');
    boolColLabel.textContent = 'Column:';
    boolColLabel.style.display = 'block';
    boolColLabel.style.marginBottom = '5px';
    // Container for search + dropdown + hidden select
    const boolColContainer = document.createElement('div');
    boolColContainer.style.position = 'relative';
    // Search input for boolean columns
    const boolColSearch = document.createElement('input');
    boolColSearch.id = 'boolean-filter-search';
    boolColSearch.type = 'text';
    boolColSearch.placeholder = 'Search boolean columns...';
    Object.assign(boolColSearch.style, {
        width: '100%', padding: '8px', backgroundColor: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px', marginBottom: '6px'
    });
    // Dropdown list for boolean columns
    const boolColDropdown = document.createElement('div');
    boolColDropdown.id = 'boolean-filter-dropdown';
    boolColDropdown.style.display = 'none';
    boolColDropdown.style.position = 'absolute';
    boolColDropdown.style.width = '100%';
    boolColDropdown.style.maxHeight = '200px';
    boolColDropdown.style.overflowY = 'auto';
    boolColDropdown.style.backgroundColor = '#333';
    boolColDropdown.style.border = '1px solid #555';
    boolColDropdown.style.borderRadius = '4px';
    boolColDropdown.style.zIndex = '1002';
    // Hidden select to store value
    const boolColSelect = document.createElement('select');
    boolColSelect.id = 'boolean-filter-column-select';
    boolColSelect.style.display = 'none';
    const boolNoneOpt = document.createElement('option');
    boolNoneOpt.value = '';
    boolNoneOpt.textContent = 'None';
    boolColSelect.appendChild(boolNoneOpt);
    // Wire search focus/blur/input like X-axis
    boolColSearch.addEventListener('focus', function() {
        boolColDropdown.style.display = 'block';
    });
    boolColSearch.addEventListener('blur', function() {
        setTimeout(() => { boolColDropdown.style.display = 'none'; }, 200);
    });
    boolColSearch.addEventListener('input', function() {
        const term = this.value.toLowerCase();
        const options = boolColDropdown.querySelectorAll('.dropdown-item');
        options.forEach(option => {
            const text = option.textContent.toLowerCase();
            option.style.display = text.includes(term) ? 'block' : 'none';
        });
    });
    boolColContainer.appendChild(boolColSearch);
    boolColContainer.appendChild(boolColDropdown);
    boolColContainer.appendChild(boolColSelect);
    boolColWrap.appendChild(boolColLabel);
    boolColWrap.appendChild(boolColContainer);
    
    const boolValWrap = document.createElement('div');
    boolValWrap.id = 'boolean-filter-value-wrap';
    boolValWrap.style.flex = '1';
    boolValWrap.style.flexBasis = '100%'; // force onto next line
    const boolValLabel = document.createElement('label');
    boolValLabel.textContent = 'Include rows where value is:';
    boolValLabel.style.display = 'block';
    boolValLabel.style.marginBottom = '5px';
    const boolValSelect = document.createElement('select');
    boolValSelect.id = 'boolean-filter-value-select';
    Object.assign(boolValSelect.style, {
        width: '100%', padding: '8px', backgroundColor: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px'
    });
    const boolTrue = document.createElement('option');
    boolTrue.value = 'true';
    boolTrue.textContent = 'true';
    const boolFalse = document.createElement('option');
    boolFalse.value = 'false';
    boolFalse.textContent = 'false';
    boolValSelect.appendChild(boolTrue);
    boolValSelect.appendChild(boolFalse);
    boolValWrap.appendChild(boolValLabel);
    boolValWrap.appendChild(boolValSelect);
    // Hide value selection by default until a boolean column is chosen
    boolValWrap.style.display = 'none';
    
    booleanRow.appendChild(boolColWrap);
    booleanRow.appendChild(boolValWrap);
    booleanFilterContainer.appendChild(booleanRow);
    customizationSection.appendChild(booleanFilterContainer);
    
    // Toggle manual limits visibility based on checkbox
    autoLimitsCheckbox.addEventListener('change', function() {
        manualLimitsDiv.style.display = this.checked ? 'none' : 'block';
    });
    
    scatterControls.appendChild(customizationSection);
    content.appendChild(scatterControls);
 
    // SED controls (initially hidden)
    const sedControls = document.createElement('div');
    sedControls.id = 'sed-controls';
    sedControls.className = 'tab-content-panel';
    createSedTab(sedControls);
    content.appendChild(sedControls);
    
    // Generate plot button
    const generateButton = document.createElement('button');
    generateButton.id = 'generate-plot-button';
    generateButton.textContent = 'Generate Plot';
    generateButton.style.width = '100%';
    generateButton.style.padding = '10px';
    generateButton.style.backgroundColor = '#4CAF50';
    generateButton.style.color = 'white';
    generateButton.style.border = 'none';
    generateButton.style.borderRadius = '4px';
    generateButton.style.cursor = 'pointer';
    generateButton.style.marginBottom = '10px';
    generateButton.style.transition = 'all 0.3s ease';
    generateButton.onclick = function() {
        if (window.currentPlotType === 'histogram') {
            generateHistogram();
        } else {
            generatePlot();
        }
    };
    
    generateButton.onmouseover = () => {
        generateButton.style.backgroundColor = '#45a049';
        generateButton.style.transform = 'translateY(-1px)';
        generateButton.style.boxShadow = '0 2px 8px rgba(76, 175, 80, 0.3)';
    };
    
    generateButton.onmouseout = () => {
        generateButton.style.backgroundColor = '#4CAF50';
        generateButton.style.transform = 'translateY(0)';
        generateButton.style.boxShadow = 'none';
    };
    
    scatterControls.appendChild(generateButton);

    // Save Plot Button
    const saveButton = document.createElement('button');
    saveButton.id = 'save-plot-button';
    saveButton.textContent = 'Save Plot as PNG';
    saveButton.style.width = '100%';
    saveButton.style.padding = '10px';
    saveButton.style.backgroundColor = '#007BFF';
    saveButton.style.color = 'white';
    saveButton.style.border = 'none';
    saveButton.style.borderRadius = '4px';
    saveButton.style.cursor = 'pointer';
    saveButton.style.marginBottom = '20px';
    saveButton.style.display = 'none';
    saveButton.style.transition = 'all 0.3s ease';
    saveButton.onclick = savePlotAsPng;
    
    saveButton.onmouseover = () => {
        saveButton.style.backgroundColor = '#0056b3';
        saveButton.style.transform = 'translateY(-1px)';
        saveButton.style.boxShadow = '0 2px 8px rgba(0, 123, 255, 0.3)';
    };
    
    saveButton.onmouseout = () => {
        saveButton.style.backgroundColor = '#007BFF';
        saveButton.style.transform = 'translateY(0)';
        saveButton.style.boxShadow = 'none';
    };
    
    scatterControls.appendChild(saveButton);

    // Inline status inside scatter/histogram tools
    // (Removed) inline status row: was showing "Catalog: ... | Image: ..." under the buttons.

    // Preload notice (shown when image/catalog not loaded)
    const preloadNotice = document.createElement('div');
    preloadNotice.id = 'plotter-preload-notice';
    preloadNotice.style.display = 'none';
    preloadNotice.style.margin = '8px 0 12px 0';
    preloadNotice.style.padding = '10px 12px';
    preloadNotice.style.backgroundColor = 'rgba(255, 193, 7, 0.12)';
    preloadNotice.style.border = '1px solid rgba(255, 193, 7, 0.35)';
    preloadNotice.style.borderRadius = '6px';
    preloadNotice.style.color = '#f0c36d';
    preloadNotice.style.fontSize = '12px';
    scatterControls.appendChild(preloadNotice);

    // Plot area
    const plotArea = document.createElement('div');
    plotArea.id = 'plot-area';
    plotArea.style.width = '100%';
    plotArea.style.height = '400px';
    plotArea.style.backgroundColor = '#222';
    plotArea.style.borderRadius = '4px';
    plotArea.style.display = 'flex';
    plotArea.style.alignItems = 'center';
    plotArea.style.justifyContent = 'center';
    plotArea.style.color = '#aaa';
    plotArea.textContent = 'Select X and Y axes to generate a plot';
    scatterControls.appendChild(plotArea);
    
    plotterContainer.appendChild(content);
    document.body.appendChild(plotterContainer);
    console.log(`[Plotter] Container ${containerId} created and appended to body.`);
    
    // Populate axis dropdowns AFTER the container is added to the DOM and rendered
    setTimeout(() => {
        console.log(`[Plotter] setTimeout calling populateAxisDropdowns for ${containerId}`);
        populateAxisDropdowns(); 
    }, 10);
    // Initial availability state update
    if (typeof window.updatePlotterAvailability === 'function') {
        window.updatePlotterAvailability();
    }
}

// Helper function to switch tabs with animation
function switchToTab(tabName, container) {
    // Remove active class from all buttons
    const buttons = container.querySelectorAll('.plotter-tab-button');
    buttons.forEach(btn => btn.classList.remove('active'));
    
    // Hide all content panels with animation
    const panels = document.querySelectorAll('.tab-content-panel');
    panels.forEach(panel => {
        panel.classList.remove('active');
        setTimeout(() => {
            if (!panel.classList.contains('active')) {
                panel.style.display = 'none';
            }
        }, 300);
    });
    
    // Update based on tab
    let activeButton;
    let targetPanel;
    
    switch(tabName) {
        case 'scatter':
            activeButton = document.getElementById('scatter-plot-button');
            targetPanel = document.getElementById('scatter-controls');
            window.currentPlotType = 'scatter';
            updateScatterControlsVisibility('scatter');
            break;
            
        case 'histogram':
            activeButton = document.getElementById('plotter-histogram-button');
            targetPanel = document.getElementById('scatter-controls');
            window.currentPlotType = 'histogram';
            updateScatterControlsVisibility('histogram');
            break;
            
        case 'sed':
            activeButton = document.getElementById('sed-button');
            targetPanel = document.getElementById('sed-controls');
            window.currentPlotType = 'sed';
            break;
            
        case 'ast':
            activeButton = document.getElementById('ast-button');
            let astControls = document.getElementById('ast-controls');
            if (!astControls) {
                astControls = document.createElement('div');
                astControls.id = 'ast-controls';
                astControls.className = 'tab-content-panel';
                const plotterContainer = document.getElementById('dynamic-plotter-panel');
                if (plotterContainer) {
                    plotterContainer.appendChild(astControls);
                }
                createAstTab(astControls);
            }
            targetPanel = astControls;
            window.currentPlotType = 'ast';
            break;
    }
    
    // Add active class to button and update indicator
    if (activeButton) {
        activeButton.classList.add('active');
        updateIndicatorPosition(container, activeButton);
    }
    
    // Show target panel with animation
    if (targetPanel) {
        setTimeout(() => {
            targetPanel.style.display = 'block';
            setTimeout(() => {
                targetPanel.classList.add('active');
            }, 10);
        }, 150);
    }

    // Refresh availability/UI prompts when switching tabs
    if (typeof window.updatePlotterAvailability === 'function') {
        window.updatePlotterAvailability();
    }
}

// Helper function to update indicator position
function updateIndicatorPosition(container, activeButton) {
    const indicator = container.querySelector('.tab-indicator');
    if (indicator && activeButton) {
        const containerRect = container.getBoundingClientRect();
        const buttonRect = activeButton.getBoundingClientRect();
        
        indicator.style.width = `${buttonRect.width}px`;
        indicator.style.left = `${buttonRect.left - containerRect.left + 4}px`;
    }
}

// Helper function to update scatter controls visibility
// Helper function to update scatter controls visibility
function updateScatterControlsVisibility(plotType) {
    const yAxisContainer = document.getElementById('y-axis-container');
    const colorContainer = document.getElementById('color-container');
    const colormapLabel = document.querySelector('label[for="colormap-select"]');
    const colormapSelect = document.getElementById('colormap-select');
    const colormapPreview = document.getElementById('colormap-preview');
    const colorScaleContainer = document.getElementById('color-scale-container');
    const alphaDiv = document.getElementById('alpha-div');
    const histogramControls = document.getElementById('histogram-controls');
    const booleanFilterContainer = document.getElementById('boolean-filter-container');
    const generateButton = document.getElementById('generate-plot-button');
    
    if (plotType === 'histogram') {
        // Hide scatter-specific controls
        if (yAxisContainer) {
            yAxisContainer.style.display = 'none';
            // Also hide the Y-Axis label
            const yAxisLabel = yAxisContainer.previousElementSibling;
            if (yAxisLabel && yAxisLabel.tagName === 'LABEL') {
                yAxisLabel.style.display = 'none';
            }
        }
        if (colorContainer) {
            colorContainer.style.display = 'none';
            // Also hide the Color By label
            const colorLabel = colorContainer.previousElementSibling;
            if (colorLabel && colorLabel.tagName === 'LABEL') {
                colorLabel.style.display = 'none';
            }
        }
        if (colormapLabel) colormapLabel.style.display = 'none';
        if (colormapSelect) colormapSelect.parentElement.style.display = 'none';
        if (colorScaleContainer) colorScaleContainer.style.display = 'none';
        if (alphaDiv) alphaDiv.style.display = 'none';
        if (histogramControls) histogramControls.style.display = 'block';
        if (generateButton) generateButton.textContent = 'Generate Histogram';
        if (booleanFilterContainer) booleanFilterContainer.style.display = 'none';
        
    } else {
        // Show scatter controls
        if (yAxisContainer) {
            yAxisContainer.style.display = 'block';
            // Show the Y-Axis label
            const yAxisLabel = yAxisContainer.previousElementSibling;
            if (yAxisLabel && yAxisLabel.tagName === 'LABEL') {
                yAxisLabel.style.display = 'block';
            }
        }
        if (colorContainer) {
            colorContainer.style.display = 'block';
            // Show the Color By label
            const colorLabel = colorContainer.previousElementSibling;
            if (colorLabel && colorLabel.tagName === 'LABEL') {
                colorLabel.style.display = 'block';
            }
        }
        if (colormapLabel) colormapLabel.style.display = 'block';
        if (colormapSelect) colormapSelect.parentElement.style.display = 'block';
        if (colorScaleContainer) colorScaleContainer.style.display = 'block';
        if (alphaDiv) alphaDiv.style.display = 'block';
        if (histogramControls) histogramControls.style.display = 'none';
        if (generateButton) generateButton.textContent = 'Generate Plot';
        if (booleanFilterContainer) booleanFilterContainer.style.display = '';
    }

    // Also re-evaluate availability whenever controls visibility toggles
    if (typeof window.updatePlotterAvailability === 'function') {
        window.updatePlotterAvailability();
    }
}

// Global helper to toggle Scatter/Histogram availability based on loaded image/catalog
window.updatePlotterAvailability = function updatePlotterAvailability() {
    try {
        // In multi-panel mode, availability should reflect the ACTIVE pane's loaded image.
        let paneWin = null;
        try { paneWin = (typeof window.getActivePaneWindow === 'function') ? (window.getActivePaneWindow() || null) : null; } catch (_) { paneWin = null; }
        const imgWin = paneWin || window;
        const hasImage = !!(imgWin.currentFitsFile || (imgWin.fitsData && (imgWin.fitsData.filename || imgWin.fitsData.width)));
        // Catalogs may be loaded inside the active pane (iframe) in multi-grid mode.
        const hasCatalog = !!(
            window.currentCatalogName || window.activeCatalog ||
            (paneWin && (paneWin.currentCatalogName || paneWin.activeCatalog)) ||
            // Or: overlay store populated (best signal when multiple catalogs are loaded)
            (typeof window.getLoadedCatalogOverlays === 'function' && (window.getLoadedCatalogOverlays() || []).length > 0) ||
            (paneWin && typeof paneWin.getLoadedCatalogOverlays === 'function' && (paneWin.getLoadedCatalogOverlays() || []).length > 0) ||
            (window.catalogDataForOverlay && Array.isArray(window.catalogDataForOverlay) && window.catalogDataForOverlay.length > 0) ||
            (paneWin && paneWin.catalogDataForOverlay && Array.isArray(paneWin.catalogDataForOverlay) && paneWin.catalogDataForOverlay.length > 0)
        );
        const isScatterOrHist = (window.currentPlotType === 'scatter' || window.currentPlotType === 'histogram');

        const axis = document.getElementById('axis-selection-section');
        const custom = document.getElementById('customization-section');
        const generateBtn = document.getElementById('generate-plot-button');
        const saveBtn = document.getElementById('save-plot-button');
        const plotArea = document.getElementById('plot-area');
        const notice = document.getElementById('plotter-preload-notice');
        const status = null; // top status removed
        // (Removed) inline status text under buttons: context is shown above "Select Axes" instead.

        // If not in scatter/histogram, do not show notice, but keep everything as-is
        if (!isScatterOrHist) {
            if (notice) notice.style.display = 'none';
            return;
        }

        // Build notice text
        let msg = '';
        if (!hasImage && !hasCatalog) {
            msg = 'To use Scatter/Histogram, first load a FITS image, then load a catalog.';
        } else if (!hasImage) {
            msg = 'To use Scatter/Histogram, load a FITS image.';
        } else if (!hasCatalog) {
            msg = 'To use Scatter/Histogram, load a catalog.';
        }

        const shouldHide = !(hasImage && hasCatalog);

        if (notice) {
            notice.textContent = msg;
            notice.style.display = shouldHide ? 'block' : 'none';
        }

        // Toggle controls visibility
        const displayControls = shouldHide ? 'none' : 'block';
        if (axis) axis.style.display = displayControls;
        if (custom) custom.style.display = displayControls;
        if (plotArea) plotArea.style.display = shouldHide ? 'none' : 'flex';
        if (generateBtn) generateBtn.style.display = shouldHide ? 'none' : 'block';
        if (saveBtn) saveBtn.style.display = shouldHide ? 'none' : 'block';
    } catch (e) {
        console.warn('updatePlotterAvailability error:', e);
    }
};

// Helper to infer current galaxy name from FITS header (OBJECT) or filename
function getCurrentGalaxyName() {
    try {
        let paneWin = null;
        try { paneWin = (typeof window.getActivePaneWindow === 'function') ? (window.getActivePaneWindow() || null) : null; } catch (_) { paneWin = null; }
        const imgWin = paneWin || window;
        const headerObj = (imgWin?.fitsData?.wcs && (imgWin.fitsData.wcs.OBJECT || imgWin.fitsData.wcs.object)) || null;
        if (headerObj && String(headerObj).trim()) return String(headerObj).trim();
        const fp = imgWin.currentFitsFile || (imgWin.fitsData && imgWin.fitsData.filename) || '';
        if (fp) {
            const base = fp.split('/').pop() || fp;
            const name = base.replace(/\.fits$/i, '').trim();
            if (name) return name;
        }
    } catch (_) {}
    return null;
}
// Updated generatePlot function to handle color scale
function generatePlot() {
    // Get the selected axes
    const xAxisSelect = document.getElementById('x-axis-select');
    const yAxisSelect = document.getElementById('y-axis-select');
    const xAxisSearch = document.getElementById('x-axis-search');
    const yAxisSearch = document.getElementById('y-axis-search');
    const colorSelect = document.getElementById('color-axis-select');
    const colorSearch = document.getElementById('color-axis-search');
    const colormapSelect = document.getElementById('colormap-select');
    const colorScaleSelect = document.getElementById('color-scale-select');
    
    // Resolve axis selection: only accept values that exist in the current dropdown options.
    // This prevents "empty plot" after switching catalogs when an input still contains a column
    // that isn't present in the newly-selected catalog.
    const resolveAxis = (selectEl, searchEl) => {
        try {
            const vSel = (selectEl && selectEl.value) ? String(selectEl.value) : '';
            if (vSel) return vSel;
            const vSearch = (searchEl && searchEl.value) ? String(searchEl.value).trim() : '';
            if (!vSearch) return '';
            const opts = selectEl && selectEl.options ? Array.from(selectEl.options) : [];
            const ok = opts.some(o => o && String(o.value) === vSearch);
            return ok ? vSearch : '';
        } catch (_) {
            return '';
        }
    };

    // Get the selected values
    const xAxisName = resolveAxis(xAxisSelect, xAxisSearch);
    const yAxisName = resolveAxis(yAxisSelect, yAxisSearch);
    const colorAxisName = resolveAxis(colorSelect, colorSearch);
    const colormap = colormapSelect.value || 'viridis';
    const colorScale = colorScaleSelect ? colorScaleSelect.value || 'linear' : 'linear';
    
    // Validate selections
    if (!xAxisName || !yAxisName) {
        showNotification('Please select both X and Y axes', 3000);
        return;
    }
    
    // Determine current catalog to use early so we can validate cache.
    // In multi-panel mode, the plotter lives in the top window but catalogs live in the active pane window,
    // so we must fall back to the active pane's catalog state if the dropdown is empty.
    const catalogSelect = document.getElementById('catalog-select');
    const plotterCatalogSelect = document.getElementById('plotter-catalog-select');
    const selectedCatalog = catalogSelect ? (catalogSelect.value || null) : null;
    const selectedPlotterCatalog = plotterCatalogSelect ? (plotterCatalogSelect.value || null) : null;
    let paneWin = null;
    try { paneWin = (typeof window.getActivePaneWindow === 'function') ? (window.getActivePaneWindow() || null) : null; } catch (_) { paneWin = null; }
    const paneCatalogName = (paneWin && (paneWin.currentCatalogName || paneWin.activeCatalog)) || null;
    let paneLast = null;
    try {
        if (paneWin && typeof paneWin.getLoadedCatalogOverlays === 'function') {
            const entries = paneWin.getLoadedCatalogOverlays() || [];
            if (Array.isArray(entries) && entries.length) {
                const lastKey = entries[entries.length - 1]?.key;
                if (lastKey) paneLast = String(lastKey);
            }
        }
    } catch (_) {}
    let catalogToUse =
        selectedPlotterCatalog ||
        selectedCatalog ||
        window.plotterSelectedCatalogName ||
        paneCatalogName ||
        paneLast ||
        window.currentCatalogName ||
        window.activeCatalog ||
        (typeof activeCatalog !== 'undefined' ? activeCatalog : null);
    // Persist the derived selection so subsequent calls behave consistently.
    try {
        if (catalogToUse && !window.plotterSelectedCatalogName) {
            window.plotterSelectedCatalogName = String(catalogToUse);
        }
        if (catalogToUse && plotterCatalogSelect && !plotterCatalogSelect.value) {
            plotterCatalogSelect.value = String(catalogToUse);
        }
        if (catalogToUse && catalogSelect && !catalogSelect.value) {
            catalogSelect.value = String(catalogToUse);
        }
    } catch (_) {}

    // Remember which pane the plot was generated from (critical for multi-panel scatter-click behavior).
    // Scatter points should pan/highlight inside the SAME pane/WCS used for plotting, not whatever pane
    // happens to be active at click time.
    try {
        let plotPaneWin = null;
        try { plotPaneWin = (typeof window.getActivePaneWindow === 'function') ? (window.getActivePaneWindow() || null) : null; } catch (_) { plotPaneWin = null; }
        window.__plotterLastPlotPaneWindow = plotPaneWin;
        window.__plotterLastPlotCatalogName = catalogToUse || null;
    } catch (_) {}
    
    // Get customization options
    const plotTitle = document.getElementById('plot-title-input')?.value || '';
    const xLabel = document.getElementById('x-label-input')?.value || xAxisName;
    const yLabel = document.getElementById('y-label-input')?.value || yAxisName;
    const xScale = document.getElementById('x-scale-select')?.value || 'linear';
    const yScale = document.getElementById('y-scale-select')?.value || 'linear';
    const autoLimits = document.getElementById('auto-limits-checkbox')?.checked ?? true;
    const pointAlpha = document.getElementById('alpha-slider')?.value / 100 || 0.7;
    
    // Get manual limits if auto-limits is disabled
    let xMin = null, xMax = null, yMin = null, yMax = null;
    
    if (!autoLimits) {
        xMin = document.getElementById('x-min-input')?.value !== '' ? 
            parseFloat(document.getElementById('x-min-input').value) : null;
        xMax = document.getElementById('x-max-input')?.value !== '' ? 
            parseFloat(document.getElementById('x-max-input').value) : null;
        yMin = document.getElementById('y-min-input')?.value !== '' ? 
            parseFloat(document.getElementById('y-min-input').value) : null;
        yMax = document.getElementById('y-max-input')?.value !== '' ?
            parseFloat(document.getElementById('y-max-input').value) : null;
    }

    // --- BEGIN MODIFICATION: Get manual color limits ---
    let cMin = null, cMax = null;
    if (!autoLimits) {
        cMin = document.getElementById('c-min-input')?.value !== '' ?
            parseFloat(document.getElementById('c-min-input').value) : null;
        cMax = document.getElementById('c-max-input')?.value !== '' ?
            parseFloat(document.getElementById('c-max-input').value) : null;
    }
    // --- END MODIFICATION ---

    // Adjust manual log limits
    let limitsAdjustedPlot = false;
    if (!autoLimits) {
        if (xScale === 'log') {
            if (xMin !== null && xMin <= 0) {
                xMin = 0.1;
                limitsAdjustedPlot = true;
                console.warn("Manual X Min <= 0 adjusted to 0.1 for log scale.");
            }
            if (xMax !== null && xMin !== null && xMax <= xMin) {
                xMax = xMin * 10;
                limitsAdjustedPlot = true;
                console.warn("Manual X Max <= X Min adjusted for log scale.");
            }
        }
        if (yScale === 'log') {
            if (yMin !== null && yMin <= 0) {
                yMin = 0.1;
                limitsAdjustedPlot = true;
                console.warn("Manual Y Min <= 0 adjusted to 0.1 for log scale.");
            }
            if (yMax !== null && yMin !== null && yMax <= yMin) {
                yMax = yMin * 10;
                limitsAdjustedPlot = true;
                console.warn("Manual Y Max <= Y Min adjusted for log scale.");
            }
        }
        // --- BEGIN MODIFICATION: Adjust color log limits ---
        if (colorScale === 'log') {
            if (cMin !== null && cMin <= 0) {
                cMin = 0.1;
                limitsAdjustedPlot = true;
                console.warn("Manual Color Min <= 0 adjusted to 0.1 for log scale.");
            }
            if (cMax !== null && cMin !== null && cMax <= cMin) {
                cMax = cMin * 10;
                limitsAdjustedPlot = true;
                console.warn("Manual Color Max <= Color Min adjusted for log scale.");
            }
        }
        // --- END MODIFICATION ---
    }
    if (limitsAdjustedPlot) {
        showNotification("Manual axis limits adjusted for log scale (must be > 0)", 4000);
    }
    
    // Get the plot area
    const plotArea = document.getElementById('plot-area');
    if (!plotArea) return;

    const saveButton = document.getElementById('save-plot-button');
    if (saveButton) {
        saveButton.style.display = 'none';
    }
    
    // Clear the plot area and show loading
    plotArea.innerHTML = '';
    plotArea.style.position = 'relative';
    
    const loadingContainer = document.createElement('div');
    loadingContainer.style.display = 'flex';
    loadingContainer.style.flexDirection = 'column';
    loadingContainer.style.alignItems = 'center';
    loadingContainer.style.justifyContent = 'center';
    loadingContainer.style.width = '100%';
    loadingContainer.style.height = '100%';
    
    const spinner = document.createElement('div');
    spinner.style.border = '5px solid #f3f3f3';
    spinner.style.borderTop = '5px solid #3498db';
    spinner.style.borderRadius = '50%';
    spinner.style.width = '40px';
    spinner.style.height = '40px';
    spinner.style.animation = 'spin 2s linear infinite';
    spinner.style.marginBottom = '10px';
    
    if (!document.querySelector('style[data-spinner]')) {
        const styleElement = document.createElement('style');
        styleElement.setAttribute('data-spinner', 'true');
        styleElement.textContent = `
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(styleElement);
    }
    
    const loadingText = document.createElement('div');
    loadingText.textContent = 'Processing data for plot...';
    loadingText.style.color = '#aaa';
    loadingText.style.marginTop = '10px';
    
    loadingContainer.appendChild(spinner);
    loadingContainer.appendChild(loadingText);
    plotArea.appendChild(loadingContainer);
    
    // Use existing data only if it matches the current catalog AND looks like real data for the chosen axes.
    // (Avoid using the "columns-only" sample that is meant just for dropdowns.)
    const canUseCache =
        !!catalogToUse &&
        Array.isArray(window.sourcePropertiesData) &&
        window.sourcePropertiesData.length > 0 &&
        window.sourcePropertiesCatalogName === catalogToUse &&
        window.sourcePropertiesData.some(o =>
            o &&
            o._originalObj &&
            o[xAxisName] != null &&
            o[yAxisName] != null
        );
    if (canUseCache) {
        processPlotData(
            plotArea, 
            window.sourcePropertiesData, 
            xAxisName, 
            yAxisName, 
            {
                title: plotTitle,
                xLabel: xLabel,
                yLabel: yLabel,
                xScale: xScale,
                yScale: yScale,
                xMin: xMin,
                xMax: xMax,
                yMin: yMin,
                yMax: yMax,
                autoLimits: autoLimits,
                pointAlpha: pointAlpha,
                colorAxisName: colorAxisName,
                colormap: colormap,
                colorScale: colorScale,
                colorMin: cMin, // Pass color min
                colorMax: cMax  // Pass color max
            }
        );
        return;
    }
    
    // Load data from catalog if not available (or cache for different catalog)
    if (!catalogToUse) {
        plotArea.innerHTML = '';
        const errorMessage = document.createElement('div');
        errorMessage.textContent = 'No catalog selected. Please select a catalog first.';
        errorMessage.style.color = '#aaa';
        errorMessage.style.textAlign = 'center';
        errorMessage.style.width = '100%';
        errorMessage.style.height = '100%';
        errorMessage.style.display = 'flex';
        errorMessage.style.alignItems = 'center';
        errorMessage.style.justifyContent = 'center';
        plotArea.appendChild(errorMessage);
        return;
    }
    
    loadingText.textContent = 'Loading catalog data...';
    
    // Load catalog data and process (ensure RA/DEC overrides are sent)
    {
        const apiName = (catalogToUse || '').toString().split('/').pop().split('\\').pop();
        const persisted = (window.catalogOverridesByCatalog && (
            window.catalogOverridesByCatalog[catalogToUse] ||
            window.catalogOverridesByCatalog[apiName]
        )) || null;
        // Only use persisted overrides; do NOT default to 'ra'/'dec'
        const raCol = persisted && persisted.ra_col ? persisted.ra_col : null;
        const decCol = persisted && persisted.dec_col ? persisted.dec_col : null;
        const sizeCol = persisted && persisted.size_col ? persisted.size_col : null;
        // If overrides are missing, auto-detect from columns first
        const doFetch = (raFinal, decFinal, sizeFinal) => {
            const urlParams = new URLSearchParams();
            if (raFinal) urlParams.set('ra_col', raFinal);
            if (decFinal) urlParams.set('dec_col', decFinal);
            if (sizeFinal) urlParams.set('size_col', sizeFinal);
            const headers = {};
            if (raFinal) headers['X-RA-Col'] = raFinal;
            if (decFinal) headers['X-DEC-Col'] = decFinal;
            if (sizeFinal) headers['X-Size-Col'] = sizeFinal;
            const suffix = urlParams.toString() ? `?${urlParams.toString()}` : '';
            console.log('[plotter] /plotter/load-catalog generatePlot URL:', `/plotter/load-catalog/${apiName}${suffix}`, 'headers:', headers);
            return apiFetch(`/plotter/load-catalog/${apiName}${suffix}`, { headers })
        };

        const fetchPromise = (raCol && decCol)
            ? doFetch(raCol, decCol, sizeCol)
            : apiFetch(`/catalog-columns/?catalog_name=${encodeURIComponent(apiName)}`)
                .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load catalog columns')))
                .then(data => {
                    const cols = (data && data.columns) || [];
                    const lower = new Map(cols.map(c => [String(c).toLowerCase(), c]));
                    const tryKeys = (arr) => { for (const k of arr) { const m = lower.get(k.toLowerCase()); if (m) return m; } return null; };
                    const RA_CANDIDATES = [
                        'PHANGS_RA','XCTR_DEG','cen_ra','CEN_RA','RA','ra','Ra','RightAscension','right_ascension','raj2000','RAJ2000'
                    ];
                    const DEC_CANDIDATES = [
                        'PHANGS_DEC','YCTR_DEG','cen_dec','CEN_DEC','DEC','dec','Dec','Declination','declination','DECLINATION','decj2000','DECJ2000','dej2000','DEJ2000'
                    ];
                    const raAuto = tryKeys(RA_CANDIDATES);
                    const decAuto = tryKeys(DEC_CANDIDATES);
                    if (!raAuto || !decAuto) throw new Error('Could not auto-detect RA/DEC columns');
                    return doFetch(raAuto, decAuto, null);
                });

        fetchPromise
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to load catalog');
            }
            return response.json();
        })
        .then(catalogData => {
            if (!catalogData || catalogData.length === 0) {
                throw new Error('No catalog data available');
            }
            
            const maxObjectsToProcess = 500;
            let objectsToFetch = catalogData;
            if (catalogData.length > maxObjectsToProcess) {
                const step = Math.floor(catalogData.length / maxObjectsToProcess);
                objectsToFetch = [];
                for (let i = 0; i < catalogData.length; i += step) {
                    objectsToFetch.push(catalogData[i]);
                }
            }
            
            loadingText.textContent = 'Loading data: 0%';
            
            const fetchPromises = objectsToFetch.map((obj, index) => {
                return new Promise((resolve, reject) => {
                    setTimeout(() => {
                        apiFetch(`/source-properties/?ra=${obj.ra}&dec=${obj.dec}&catalog_name=${catalogToUse}`)
                            .then(response => {
                                if (!response.ok) {
                                    throw new Error(`Failed to load properties for object ${index}`);
                                }
                                return response.json();
                            })
                            .then(data => {
                                if (data.error) {
                                    throw new Error(data.error);
                                }
                                
                                const progress = Math.round((index + 1) / objectsToFetch.length * 100);
                                loadingText.textContent = `Loading data: ${progress}%`;
                                
                                const properties = data.properties || {};
                                properties._originalObj = obj;
                                resolve(properties);
                            })
                            .catch(error => {
                                console.error(`Error fetching properties for object ${index}:`, error);
                                resolve(null);
                            });
                    }, index * 10);
                });
            });
            
            return Promise.all(fetchPromises)
                .then(results => {
                    const validResults = results.filter(result => result !== null);
                    
                    if (validResults.length === 0) {
                        throw new Error('No valid data found');
                    }
                    
                    window.sourcePropertiesData = validResults;
                    try { window.sourcePropertiesCatalogName = catalogToUse; } catch(_) {}
                    plotArea.innerHTML = '';
                    
                    return processPlotData(
                        plotArea, 
                        validResults, 
                        xAxisName, 
                        yAxisName, 
                        {
                            title: plotTitle,
                            xLabel: xLabel,
                            yLabel: yLabel,
                            xScale: xScale,
                            yScale: yScale,
                            xMin: xMin,
                            xMax: xMax,
                            yMin: yMin,
                            yMax: yMax,
                            autoLimits: autoLimits,
                            pointAlpha: pointAlpha,
                            colorAxisName: colorAxisName,
                            colormap: colormap,
                            colorScale: colorScale,
                            colorMin: cMin, // Pass color min
                            colorMax: cMax  // Pass color max
                        }
                    );
                });
        })
        .catch(error => {
            console.error('Error loading catalog data:', error);
            plotArea.innerHTML = '';
            const errorMessage = document.createElement('div');
            errorMessage.textContent = `Error loading catalog data: ${error.message}`;
            errorMessage.style.color = '#ff6b6b';
            errorMessage.style.textAlign = 'center';
            errorMessage.style.width = '100%';
            errorMessage.style.height = '100%';
            errorMessage.style.display = 'flex';
            errorMessage.style.alignItems = 'center';
            errorMessage.style.justifyContent = 'center';
            plotArea.appendChild(errorMessage);
        });
    }
}

// Updated processPlotData function to handle color scale
function processPlotData(plotArea, allData, xAxisName, yAxisName, customizationOptions) {
    if (!allData || allData.length === 0) {
        plotArea.textContent = 'No data available for plotting';
        return;
    }
    
    const { colorAxisName, colormap, colorScale, colorMin: manualCMin, colorMax: manualCMax, autoLimits } = customizationOptions || {};
    
    const processedData = [];
    const categoryMapsX = new Map();
    const categoryMapsY = new Map();
    let colorValues = [];
    
    // First pass: collect all unique categorical values and color values
    allData.forEach(obj => {
        const xValue = obj[xAxisName];
        const yValue = obj[yAxisName];
        const colorValue = colorAxisName ? obj[colorAxisName] : null;
        
        if (xValue === undefined || xValue === null || yValue === undefined || yValue === null) {
            return;
        }
        
        // Handle categorical X values
        if (typeof xValue === 'string') {
            if (!categoryMapsX.has(xValue)) {
                categoryMapsX.set(xValue, categoryMapsX.size + 1);
            }
        }
        
        // Handle categorical Y values
        if (typeof yValue === 'string') {
            if (!categoryMapsY.has(yValue)) {
                categoryMapsY.set(yValue, categoryMapsY.size + 1);
            }
        }
        
        // Collect color values for normalization
        if (colorValue !== undefined && colorValue !== null && typeof colorValue === 'number') {
            colorValues.push(colorValue);
        }
    });
    
    // Calculate color min/max with log scale consideration
    let colorMin = null, colorMax = null;
    if (colorValues.length > 0) {
        if (!autoLimits && manualCMin !== null && manualCMax !== null) {
            colorMin = manualCMin;
            colorMax = manualCMax;
        } else {
            if (colorScale === 'log') {
                const positiveColorValues = colorValues.filter(v => v > 0);
                if (positiveColorValues.length > 0) {
                    colorMin = Math.min(...positiveColorValues);
                    colorMax = Math.max(...positiveColorValues);
                    colorValues = positiveColorValues;
                } else {
                    colorMin = Math.min(...colorValues);
                    colorMax = Math.max(...colorValues);
                    console.warn('No positive color values found for log scale, falling back to linear');
                    customizationOptions.colorScale = 'linear';
                }
            } else {
                colorMin = Math.min(...colorValues);
                colorMax = Math.max(...colorValues);
            }
        }
    }
    
    // Optional boolean filtering
    const boolCol = (document.getElementById('boolean-filter-column-select') || {}).value || '';
    const boolValSel = (document.getElementById('boolean-filter-value-select') || {}).value || 'true';
    const boolTarget = boolValSel === 'true';
    
    // Second pass: create processed data points
    allData.forEach((obj, index) => {
        // Apply boolean filter if set
        if (boolCol) {
            const v = obj[boolCol];
            const normalized = (typeof v === 'string') ? v.trim().toLowerCase() : v;
            const isTrue = normalized === true || normalized === 1 || normalized === '1' || normalized === 'true';
            const isFalse = normalized === false || normalized === 0 || normalized === '0' || normalized === 'false';
            const passes = boolTarget ? isTrue : isFalse;
            if (!passes) return;
        }
        const xValue = obj[xAxisName];
        const yValue = obj[yAxisName];
        const colorValue = colorAxisName ? obj[colorAxisName] : null;
        
        if (xValue === undefined || xValue === null || yValue === undefined || yValue === null) {
            return;
        }
        
        // Skip if using log color scale and color value is non-positive
        if (colorScale === 'log' && colorValue !== null && colorValue <= 0) {
            return;
        }
        
        // Convert categorical values to numeric
        let xNumeric, yNumeric;
        
        if (typeof xValue === 'string') {
            xNumeric = categoryMapsX.get(xValue);
        } else {
            xNumeric = parseFloat(xValue);
        }
        
        if (typeof yValue === 'string') {
            yNumeric = categoryMapsY.get(yValue);
        } else {
            yNumeric = parseFloat(yValue);
        }
        
        if (isNaN(xNumeric) || isNaN(yNumeric)) {
            return;
        }
        
        processedData.push({
            x: xNumeric,
            y: yNumeric,
            originalX: xValue,
            originalY: yValue,
            colorValue: colorValue,
            index: index,
            obj: obj
        });
    });
    
    createScatterPlot(
        plotArea, 
        processedData, 
        xAxisName, 
        yAxisName, 
        categoryMapsX, 
        categoryMapsY, 
        {
            ...customizationOptions,
            colorMin,
            colorMax,
            colorAxisName
        }
    );
}

// Enhanced getColorFromMap function with improved color scale support
function getColorFromMap(value, min, max, colormap, colorScale = 'linear') {
    let normalizedValue;
    
    if (colorScale === 'log') {
        if (value <= 0 || min <= 0 || max <= 0) {
            normalizedValue = (value - min) / (max - min);
        } else {
            const logValue = Math.log10(value);
            const logMin = Math.log10(min);
            const logMax = Math.log10(max);
            normalizedValue = (logValue - logMin) / (logMax - logMin);
        }
    } else {
        normalizedValue = (value - min) / (max - min);
    }
    
    normalizedValue = Math.max(0, Math.min(1, normalizedValue));
    
    const colormaps = {
        viridis: (t) => {
            const colorStops = [
                { t: 0.0, r: 68, g: 1, b: 84 },
                { t: 0.2, r: 65, g: 67, b: 135 },
                { t: 0.4, r: 42, g: 118, b: 142 },
                { t: 0.6, r: 34, g: 167, b: 132 },
                { t: 0.8, r: 124, g: 207, b: 80 },
                { t: 1.0, r: 253, g: 231, b: 37 }
            ];
            return interpolateColor(t, colorStops);
        },
        plasma: (t) => {
            const colorStops = [
                { t: 0.0, r: 13, g: 8, b: 135 },
                { t: 0.2, r: 84, g: 2, b: 163 },
                { t: 0.4, r: 156, g: 23, b: 158 },
                { t: 0.6, r: 205, g: 55, b: 120 },
                { t: 0.8, r: 237, g: 104, b: 60 },
                { t: 1.0, r: 250, g: 209, b: 56 }
            ];
            return interpolateColor(t, colorStops);
        },
        inferno: (t) => {
            const colorStops = [
                { t: 0.0, r: 0, g: 0, b: 4 },
                { t: 0.2, r: 51, g: 4, b: 82 },
                { t: 0.4, r: 120, g: 28, b: 109 },
                { t: 0.6, r: 190, g: 55, b: 82 },
                { t: 0.8, r: 236, g: 121, b: 36 },
                { t: 1.0, r: 252, g: 254, b: 164 }
            ];
            return interpolateColor(t, colorStops);
        },
        magma: (t) => {
            const colorStops = [
                { t: 0.0, r: 0, g: 0, b: 4 },
                { t: 0.2, r: 42, g: 7, b: 81 },
                { t: 0.4, r: 114, g: 31, b: 129 },
                { t: 0.6, r: 183, g: 55, b: 121 },
                { t: 0.8, r: 240, g: 112, b: 74 },
                { t: 1.0, r: 252, g: 253, b: 191 }
            ];
            return interpolateColor(t, colorStops);
        },
        cividis: (t) => {
            const colorStops = [
                { t: 0.0, r: 0, g: 32, b: 76 },
                { t: 0.2, r: 24, g: 59, b: 101 },
                { t: 0.4, r: 85, g: 91, b: 108 },
                { t: 0.6, r: 128, g: 126, b: 116 },
                { t: 0.8, r: 178, g: 167, b: 120 },
                { t: 1.0, r: 253, g: 253, b: 150 }
            ];
            return interpolateColor(t, colorStops);
        },
        rainbow: (t) => {
            const colorStops = [
                { t: 0.0, r: 110, g: 64, b: 170 },
                { t: 0.2, r: 190, g: 60, b: 175 },
                { t: 0.4, r: 254, g: 75, b: 131 },
                { t: 0.6, r: 255, g: 120, b: 71 },
                { t: 0.8, r: 226, g: 183, b: 47 },
                { t: 1.0, r: 170, g: 220, b: 50 }
            ];
            return interpolateColor(t, colorStops);
        },
        turbo: (t) => {
            const colorStops = [
                { t: 0.0, r: 48, g: 18, b: 59 },
                { t: 0.125, r: 65, g: 69, b: 171 },
                { t: 0.25, r: 57, g: 118, b: 211 },
                { t: 0.375, r: 44, g: 168, b: 220 },
                { t: 0.5, r: 31, g: 206, b: 162 },
                { t: 0.625, r: 127, g: 231, b: 58 },
                { t: 0.75, r: 218, g: 215, b: 24 },
                { t: 0.875, r: 252, g: 138, b: 21 },
                { t: 1.0, r: 165, g: 43, b: 25 }
            ];
            return interpolateColor(t, colorStops);
        },
        jet: (t) => {
            const colorStops = [
                { t: 0.0, r: 0, g: 0, b: 143 },
                { t: 0.125, r: 0, g: 32, b: 255 },
                { t: 0.25, r: 0, g: 140, b: 255 },
                { t: 0.375, r: 0, g: 229, b: 237 },
                { t: 0.5, r: 41, g: 255, b: 169 },
                { t: 0.625, r: 153, g: 255, b: 60 },
                { t: 0.75, r: 253, g: 229, b: 0 },
                { t: 0.875, r: 255, g: 60, b: 0 },
                { t: 1.0, r: 128, g: 0, b: 0 }
            ];
            return interpolateColor(t, colorStops);
        }
    };
    
    function interpolateColor(t, colorStops) {
        t = Math.max(0, Math.min(1, t));
        
        for (let i = 1; i < colorStops.length; i++) {
            if (t <= colorStops[i].t) {
                const stop1 = colorStops[i-1];
                const stop2 = colorStops[i];
                const segmentT = (t - stop1.t) / (stop2.t - stop1.t);
                const r = Math.round(stop1.r + segmentT * (stop2.r - stop1.r));
                const g = Math.round(stop1.g + segmentT * (stop2.g - stop1.g));
                const b = Math.round(stop1.b + segmentT * (stop2.b - stop1.b));
                return `rgb(${r}, ${g}, ${b})`;
            }
        }
        
        const lastStop = colorStops[colorStops.length - 1];
        return `rgb(${lastStop.r}, ${lastStop.g}, ${lastStop.b})`;
    }
    
    const colorFunc = colormaps[colormap] || colormaps.viridis;
    return colorFunc(normalizedValue);
}
// COMPLETE createScatterPlot function - REPLACE the entire function
function createScatterPlot(plotArea, processedData, xAxisName, yAxisName, categoryMapsX, categoryMapsY, customizationOptions) {
    // Extract customization options with defaults
    const {
        title = '',
        xLabel = xAxisName,
        yLabel = yAxisName,
        xScale = 'linear',
        yScale = 'linear',
        xMin = null,
        xMax = null,
        yMin = null,
        yMax = null,
        autoLimits = true,
        pointAlpha = 0.7,
        colorAxisName = null,
        colorMin = null,
        colorMax = null,
        colormap = 'viridis',
        colorScale = 'linear' // NEW: Color scale parameter
    } = customizationOptions || {};

    // Capture the pane for this plot ONCE so each scatter plot is bound to the correct viewer/WCS.
    // (In dual-panel mode, "active pane" can differ from the pane that generated the plot.)
    let plotPaneWin = null;
    try { plotPaneWin = window.__plotterLastPlotPaneWindow || null; } catch (_) { plotPaneWin = null; }
    if (!plotPaneWin) {
        try { plotPaneWin = (typeof window.getActivePaneWindow === 'function') ? (window.getActivePaneWindow() || null) : null; } catch (_) { plotPaneWin = null; }
    }
    const plotTargetWin = plotPaneWin || window;
    
    // Find min and max values for axes
    const xValues = processedData.map(point => point.x);
    const yValues = processedData.map(point => point.y);
    
    // Apply log scale if needed (filter out non-positive values for log scale)
    const filteredXValues = xScale === 'log' ? xValues.filter(val => val > 0) : xValues;
    const filteredYValues = yScale === 'log' ? yValues.filter(val => val > 0) : yValues;
    
    // If we have no valid values after filtering for log scale, switch to linear scale
    const effectiveXScale = xScale === 'log' && filteredXValues.length === 0 ? 'linear' : xScale;
    const effectiveYScale = yScale === 'log' && filteredYValues.length === 0 ? 'linear' : yScale;
    
    // Calculate min/max values
    let xMinValue = autoLimits ? Math.min(...(effectiveXScale === 'log' ? filteredXValues : xValues)) : (xMin !== null ? xMin : Math.min(...(effectiveXScale === 'log' ? filteredXValues : xValues)));
    let xMaxValue = autoLimits ? Math.max(...(effectiveXScale === 'log' ? filteredXValues : xValues)) : (xMax !== null ? xMax : Math.max(...(effectiveXScale === 'log' ? filteredXValues : xValues)));
    let yMinValue = autoLimits ? Math.min(...(effectiveYScale === 'log' ? filteredYValues : yValues)) : (yMin !== null ? yMin : Math.min(...(effectiveYScale === 'log' ? filteredYValues : yValues)));
    let yMaxValue = autoLimits ? Math.max(...(effectiveYScale === 'log' ? filteredYValues : yValues)) : (yMax !== null ? yMax : Math.max(...(effectiveYScale === 'log' ? filteredYValues : yValues)));
    
    // For log scale, ensure min values are positive
    if (effectiveXScale === 'log' && xMinValue <= 0) xMinValue = 0.1;
    if (effectiveYScale === 'log' && yMinValue <= 0) yMinValue = 0.1;
    
    // Add padding to the ranges (disable padding for log scales to avoid bad auto limits)
    const xPadding = (xMaxValue - xMinValue) * 0.1 || 0.5;
    const yPadding = (yMaxValue - yMinValue) * 0.1 || 0.5;
    const padX = (autoLimits && effectiveXScale === 'linear') ? xPadding : 0;
    const padY = (autoLimits && effectiveYScale === 'linear') ? yPadding : 0;
    let xRange = [xMinValue - padX, xMaxValue + padX];
    let yRange = [yMinValue - padY, yMaxValue + padY];
    
    // For log scale, ensure range bounds are positive
    if (effectiveXScale === 'log') {
        xRange[0] = Math.max(xRange[0], 0.1);
        if (!(xRange[1] > xRange[0])) {
            xRange[1] = xRange[0] * 10;
        }
    }
    if (effectiveYScale === 'log') {
        yRange[0] = Math.max(yRange[0], 0.1);
        if (!(yRange[1] > yRange[0])) {
            yRange[1] = yRange[0] * 10;
        }
    }
    
    // Create SVG element
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.style.backgroundColor = '#222';
    
    // Create axes
    const axisColor = '#888';
    const axisWidth = 1;
    const tickLength = 5;
    const tickWidth = 1;
    const tickColor = '#888';
    const labelColor = '#aaa';
    const labelFontSize = 10;
    
    // Calculate plot area dimensions
    // Increase right margin to ensure colorbar labels are fully visible
    const margin = { top: 40, right: colorAxisName ? 110 : 40, bottom: 50, left: 60 };
    const width = plotArea.clientWidth - margin.left - margin.right;
    const height = plotArea.clientHeight - margin.top - margin.bottom;
    
    // Create a group for the plot
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `translate(${margin.left}, ${margin.top})`);
    
    // Add title if provided
    if (title) {
        const titleElement = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        titleElement.setAttribute('x', width / 2);
        titleElement.setAttribute('y', -20);
        titleElement.setAttribute('text-anchor', 'middle');
        titleElement.setAttribute('fill', 'white');
        titleElement.setAttribute('font-size', '16px');
        titleElement.setAttribute('font-weight', 'bold');
        titleElement.textContent = title;
        g.appendChild(titleElement);
    }
    
    // Create x-axis line
    const xAxisLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    xAxisLine.setAttribute('x1', 0);
    xAxisLine.setAttribute('y1', height);
    xAxisLine.setAttribute('x2', width);
    xAxisLine.setAttribute('y2', height);
    xAxisLine.setAttribute('stroke', axisColor);
    xAxisLine.setAttribute('stroke-width', axisWidth);
    g.appendChild(xAxisLine);
    
    // Create y-axis line
    const yAxisLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    yAxisLine.setAttribute('x1', 0);
    yAxisLine.setAttribute('y1', 0);
    yAxisLine.setAttribute('x2', 0);
    yAxisLine.setAttribute('y2', height);
    yAxisLine.setAttribute('stroke', axisColor);
    yAxisLine.setAttribute('stroke-width', axisWidth);
    g.appendChild(yAxisLine);
    
    // ENHANCED: Add x-axis label with LaTeX support
    const xAxisLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    xAxisLabel.setAttribute('x', width / 2);
    xAxisLabel.setAttribute('y', height + 35);
    xAxisLabel.setAttribute('text-anchor', 'middle');
    xAxisLabel.setAttribute('fill', 'white');
    xAxisLabel.setAttribute('font-size', '12px');
    setSvgTextWithLatex(xAxisLabel, xLabel);
    g.appendChild(xAxisLabel);
    
    // ENHANCED: Add y-axis label with LaTeX support
    const yAxisLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    yAxisLabel.setAttribute('transform', `translate(-40, ${height / 2}) rotate(-90)`);
    yAxisLabel.setAttribute('text-anchor', 'middle');
    yAxisLabel.setAttribute('fill', 'white');
    yAxisLabel.setAttribute('font-size', '12px');
    setSvgTextWithLatex(yAxisLabel, yLabel);
    g.appendChild(yAxisLabel);
    
    // Helper function to format tick values
    function formatTickValue(value, isLog = false) {
        if (isLog) {
            // For log scale, format powers of 10 nicely
            const exponent = Math.log10(value);
            const roundedExponent = Math.round(exponent);
            if (Math.abs(exponent - roundedExponent) < 0.01) {
                if (roundedExponent === 0) return '1';
                if (roundedExponent === 1) return '10';
                if (roundedExponent === 2) return '100';
                return `10^${roundedExponent}`;
            }
        }
        
        // For small values or integers, show full value
        if (Number.isInteger(value) || Math.abs(value) < 0.001 || Math.abs(value) >= 10000) {
            return value.toExponential(1);
        }
        
        // For other values, format with appropriate precision
        return value.toPrecision(3);
    }
    
    // Create x-axis ticks
    if (effectiveXScale === 'log') {
        // Generate ticks at clean powers of 10
        const logMin = Math.log10(xRange[0]);
        const logMax = Math.log10(xRange[1]);
        
        // Find the range of powers of 10 to show
        const minPower = Math.floor(logMin);
        const maxPower = Math.ceil(logMax);
        
        // Generate ticks only at integer powers of 10
        const powers = [];
        for (let power = minPower; power <= maxPower; power++) {
            const value = Math.pow(10, power);
            if (value >= xRange[0] && value <= xRange[1]) {
                powers.push(power);
            }
        }
        
        // If we have too many powers, thin them out
        let step = 1;
        if (powers.length > 6) {
            step = Math.ceil(powers.length / 6);
        }
        
        powers.forEach((power, index) => {
            if (index % step !== 0) return; // Skip some ticks if too many
            
            const tickValue = Math.pow(10, power);
            const logValue = Math.log10(tickValue);
            const tickX = ((logValue - logMin) / (logMax - logMin)) * width;
            
            // Create tick line
            const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            tick.setAttribute('x1', tickX);
            tick.setAttribute('y1', height);
            tick.setAttribute('x2', tickX);
            tick.setAttribute('y2', height + tickLength);
            tick.setAttribute('stroke', tickColor);
            tick.setAttribute('stroke-width', tickWidth);
            g.appendChild(tick);
            
            // Create tick label with proper formatting
            const tickLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            tickLabel.setAttribute('x', tickX);
            tickLabel.setAttribute('y', height + tickLength + 10);
            tickLabel.setAttribute('text-anchor', 'middle');
            tickLabel.setAttribute('fill', labelColor);
            tickLabel.setAttribute('font-size', labelFontSize);
            
            // Format as clean powers of 10
            if (power >= 0 && power <= 3) {
                // Show as 1, 10, 100, 1000
                tickLabel.textContent = Math.pow(10, power).toString();
            } else {
                // Show as 10^n with LaTeX-style superscript
                tickLabel.appendChild(document.createTextNode('10'));
                const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
                tspan.setAttribute('baseline-shift', 'super');
                tspan.setAttribute('font-size', '8px');
                tspan.textContent = power.toString();
                tickLabel.appendChild(tspan);
            }
            
            // Handle categorical axis override
            if (categoryMapsX.size > 0) {
                const category = [...categoryMapsX.entries()]
                    .find(([_, index]) => Math.abs(index - tickValue) < 0.5);
                if (category) {
                    tickLabel.textContent = category[0];
                }
            }
            
            g.appendChild(tickLabel);
        });
    } else {
        // Linear scale x-axis ticks
        const numXTicks = 5;
        for (let i = 0; i <= numXTicks; i++) {
            const tickValue = xRange[0] + (i / numXTicks) * (xRange[1] - xRange[0]);
            const tickX = (i / numXTicks) * width;
            
            // Create tick line
            const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            tick.setAttribute('x1', tickX);
            tick.setAttribute('y1', height);
            tick.setAttribute('x2', tickX);
            tick.setAttribute('y2', height + tickLength);
            tick.setAttribute('stroke', tickColor);
            tick.setAttribute('stroke-width', tickWidth);
            g.appendChild(tick);
            
            // Create tick label
            const tickLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            tickLabel.setAttribute('x', tickX);
            tickLabel.setAttribute('y', height + tickLength + 10);
            tickLabel.setAttribute('text-anchor', 'middle');
            tickLabel.setAttribute('fill', labelColor);
            tickLabel.setAttribute('font-size', labelFontSize);
            
            // Format the tick label
            let labelText;
            if (Math.abs(tickValue) < 1000 && Math.abs(tickValue) > 0.01) {
                labelText = tickValue.toFixed(2);
            } else {
                labelText = tickValue.toExponential(1);
            }
            
            // If this is a categorical axis, show the category name
            if (categoryMapsX.size > 0) {
                const category = [...categoryMapsX.entries()]
                    .find(([_, index]) => Math.abs(index - tickValue) < 0.5);
                if (category) {
                    labelText = category[0];
                }
            }
            
            tickLabel.textContent = labelText;
            g.appendChild(tickLabel);
        }
    }
    
    // Create y-axis ticks
    if (effectiveYScale === 'log') {
        // Generate ticks at clean powers of 10
        const logMin = Math.log10(yRange[0]);
        const logMax = Math.log10(yRange[1]);
        
        // Find the range of powers of 10 to show
        const minPower = Math.floor(logMin);
        const maxPower = Math.ceil(logMax);
        
        // Generate ticks only at integer powers of 10
        const powers = [];
        for (let power = minPower; power <= maxPower; power++) {
            const value = Math.pow(10, power);
            if (value >= yRange[0] && value <= yRange[1]) {
                powers.push(power);
            }
        }
        
        // If we have too many powers, thin them out
        let step = 1;
        if (powers.length > 6) {
            step = Math.ceil(powers.length / 6);
        }
        
        powers.forEach((power, index) => {
            if (index % step !== 0) return; // Skip some ticks if too many
            
            const tickValue = Math.pow(10, power);
            const logValue = Math.log10(tickValue);
            const tickY = height - ((logValue - logMin) / (logMax - logMin)) * height;
            
            // Create tick line
            const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            tick.setAttribute('x1', 0);
            tick.setAttribute('y1', tickY);
            tick.setAttribute('x2', -tickLength);
            tick.setAttribute('y2', tickY);
            tick.setAttribute('stroke', tickColor);
            tick.setAttribute('stroke-width', tickWidth);
            g.appendChild(tick);
            
            // Create tick label with proper formatting
            const tickLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            tickLabel.setAttribute('x', -tickLength - 5);
            tickLabel.setAttribute('y', tickY + 4);
            tickLabel.setAttribute('text-anchor', 'end');
            tickLabel.setAttribute('fill', labelColor);
            tickLabel.setAttribute('font-size', labelFontSize);
            
            // Format as clean powers of 10
            if (power >= 0 && power <= 3) {
                // Show as 1, 10, 100, 1000
                tickLabel.textContent = Math.pow(10, power).toString();
            } else {
                // Show as 10^n with LaTeX-style superscript
                tickLabel.appendChild(document.createTextNode('10'));
                const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
                tspan.setAttribute('baseline-shift', 'super');
                tspan.setAttribute('font-size', '8px');
                tspan.textContent = power.toString();
                tickLabel.appendChild(tspan);
            }
            
            // Handle categorical axis override
            if (categoryMapsY.size > 0) {
                const category = [...categoryMapsY.entries()]
                    .find(([_, index]) => Math.abs(index - tickValue) < 0.5);
                if (category) {
                    tickLabel.textContent = category[0];
                }
            }
            
            g.appendChild(tickLabel);
        });
    } else {
        // Linear scale y-axis ticks
        const numYTicks = 5;
        for (let i = 0; i <= numYTicks; i++) {
            const tickValue = yRange[0] + (i / numYTicks) * (yRange[1] - yRange[0]);
            const tickY = height - (i / numYTicks) * height;
            
            // Create tick line
            const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            tick.setAttribute('x1', 0);
            tick.setAttribute('y1', tickY);
            tick.setAttribute('x2', -tickLength);
            tick.setAttribute('y2', tickY);
            tick.setAttribute('stroke', tickColor);
            tick.setAttribute('stroke-width', tickWidth);
            g.appendChild(tick);
            
            // Create tick label
            const tickLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            tickLabel.setAttribute('x', -tickLength - 5);
            tickLabel.setAttribute('y', tickY + 4);
            tickLabel.setAttribute('text-anchor', 'end');
            tickLabel.setAttribute('fill', labelColor);
            tickLabel.setAttribute('font-size', labelFontSize);
            
            // Format the tick label
            let labelText;
            if (Math.abs(tickValue) < 1000 && Math.abs(tickValue) > 0.01) {
                labelText = tickValue.toFixed(2);
            } else {
                labelText = tickValue.toExponential(1);
            }
            
            // If this is a categorical axis, show the category name
            if (categoryMapsY.size > 0) {
                const category = [...categoryMapsY.entries()]
                    .find(([_, index]) => Math.abs(index - tickValue) < 0.5);
                if (category) {
                    labelText = category[0];
                }
            }
            
            tickLabel.textContent = labelText;
            g.appendChild(tickLabel);
        }
    }
    
    // Create a clip path to ensure points stay within the plot area
    const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
    clipPath.setAttribute('id', 'plot-area-clip');
    
    const clipRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    clipRect.setAttribute('x', 0);
    clipRect.setAttribute('y', 0);
    clipRect.setAttribute('width', width);
    clipRect.setAttribute('height', height);
    clipPath.appendChild(clipRect);
    
    svg.appendChild(clipPath);
    
    // Create a group for the data points with clipping
    const pointsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    pointsGroup.setAttribute('clip-path', 'url(#plot-area-clip)');
    pointsGroup.setAttribute('class', 'plot-content');
    g.appendChild(pointsGroup);
    
    // Define color mapping function based on the selected colormap with scale support
    function getColorFromMap(value, min, max, colormap, colorScale = 'linear') {
        // Normalize value based on scale type
        let normalizedValue;
        
        if (colorScale === 'log') {
            // Handle log scale for color mapping
            if (value <= 0 || min <= 0 || max <= 0) {
                // If any values are non-positive, fall back to linear
                normalizedValue = (value - min) / (max - min);
            } else {
                const logValue = Math.log10(value);
                const logMin = Math.log10(min);
                const logMax = Math.log10(max);
                normalizedValue = (logValue - logMin) / (logMax - logMin);
            }
        } else {
            // Linear scale
            normalizedValue = (value - min) / (max - min);
        }
        
        // Clamp to [0, 1]
        normalizedValue = Math.max(0, Math.min(1, normalizedValue));
        
        const colormaps = {
            viridis: (t) => {
                const colorStops = [
                    { t: 0.0, r: 68, g: 1, b: 84 },
                    { t: 0.2, r: 65, g: 67, b: 135 },
                    { t: 0.4, r: 42, g: 118, b: 142 },
                    { t: 0.6, r: 34, g: 167, b: 132 },
                    { t: 0.8, r: 124, g: 207, b: 80 },
                    { t: 1.0, r: 253, g: 231, b: 37 }
                ];
                return interpolateColor(t, colorStops);
            },
            plasma: (t) => {
                const colorStops = [
                    { t: 0.0, r: 13, g: 8, b: 135 },
                    { t: 0.2, r: 84, g: 2, b: 163 },
                    { t: 0.4, r: 156, g: 23, b: 158 },
                    { t: 0.6, r: 205, g: 55, b: 120 },
                    { t: 0.8, r: 237, g: 104, b: 60 },
                    { t: 1.0, r: 250, g: 209, b: 56 }
                ];
                return interpolateColor(t, colorStops);
            },
            inferno: (t) => {
                const colorStops = [
                    { t: 0.0, r: 0, g: 0, b: 4 },
                    { t: 0.2, r: 51, g: 4, b: 82 },
                    { t: 0.4, r: 120, g: 28, b: 109 },
                    { t: 0.6, r: 190, g: 55, b: 82 },
                    { t: 0.8, r: 236, g: 121, b: 36 },
                    { t: 1.0, r: 252, g: 254, b: 164 }
                ];
                return interpolateColor(t, colorStops);
            },
            magma: (t) => {
                const colorStops = [
                    { t: 0.0, r: 0, g: 0, b: 4 },
                    { t: 0.2, r: 42, g: 7, b: 81 },
                    { t: 0.4, r: 114, g: 31, b: 129 },
                    { t: 0.6, r: 183, g: 55, b: 121 },
                    { t: 0.8, r: 240, g: 112, b: 74 },
                    { t: 1.0, r: 252, g: 253, b: 191 }
                ];
                return interpolateColor(t, colorStops);
            },
            cividis: (t) => {
                const colorStops = [
                    { t: 0.0, r: 0, g: 32, b: 76 },
                    { t: 0.2, r: 24, g: 59, b: 101 },
                    { t: 0.4, r: 85, g: 91, b: 108 },
                    { t: 0.6, r: 128, g: 126, b: 116 },
                    { t: 0.8, r: 178, g: 167, b: 120 },
                    { t: 1.0, r: 253, g: 253, b: 150 }
                ];
                return interpolateColor(t, colorStops);
            },
            rainbow: (t) => {
                const colorStops = [
                    { t: 0.0, r: 110, g: 64, b: 170 },
                    { t: 0.2, r: 190, g: 60, b: 175 },
                    { t: 0.4, r: 254, g: 75, b: 131 },
                    { t: 0.6, r: 255, g: 120, b: 71 },
                    { t: 0.8, r: 226, g: 183, b: 47 },
                    { t: 1.0, r: 170, g: 220, b: 50 }
                ];
                return interpolateColor(t, colorStops);
            },
            turbo: (t) => {
                const colorStops = [
                    { t: 0.0, r: 48, g: 18, b: 59 },
                    { t: 0.125, r: 65, g: 69, b: 171 },
                    { t: 0.25, r: 57, g: 118, b: 211 },
                    { t: 0.375, r: 44, g: 168, b: 220 },
                    { t: 0.5, r: 31, g: 206, b: 162 },
                    { t: 0.625, r: 127, g: 231, b: 58 },
                    { t: 0.75, r: 218, g: 215, b: 24 },
                    { t: 0.875, r: 252, g: 138, b: 21 },
                    { t: 1.0, r: 165, g: 43, b: 25 }
                ];
                return interpolateColor(t, colorStops);
            },
            jet: (t) => {
                const colorStops = [
                    { t: 0.0, r: 0, g: 0, b: 143 },
                    { t: 0.125, r: 0, g: 32, b: 255 },
                    { t: 0.25, r: 0, g: 140, b: 255 },
                    { t: 0.375, r: 0, g: 229, b: 237 },
                    { t: 0.5, r: 41, g: 255, b: 169 },
                    { t: 0.625, r: 153, g: 255, b: 60 },
                    { t: 0.75, r: 253, g: 229, b: 0 },
                    { t: 0.875, r: 255, g: 60, b: 0 },
                    { t: 1.0, r: 128, g: 0, b: 0 }
                ];
                return interpolateColor(t, colorStops);
            }
        };
        
        // Helper function to interpolate between color stops
        function interpolateColor(t, colorStops) {
            t = Math.max(0, Math.min(1, t));
            
            for (let i = 1; i < colorStops.length; i++) {
                if (t <= colorStops[i].t) {
                    const stop1 = colorStops[i-1];
                    const stop2 = colorStops[i];
                    
                    const segmentT = (t - stop1.t) / (stop2.t - stop1.t);
                    
                    const r = Math.round(stop1.r + segmentT * (stop2.r - stop1.r));
                    const g = Math.round(stop1.g + segmentT * (stop2.g - stop1.g));
                    const b = Math.round(stop1.b + segmentT * (stop2.b - stop1.b));
                    
                    return `rgb(${r}, ${g}, ${b})`;
                }
            }
            
            const lastStop = colorStops[colorStops.length - 1];
            return `rgb(${lastStop.r}, ${lastStop.g}, ${lastStop.b})`;
        }
        
        const colorFunc = colormaps[colormap] || colormaps.viridis;
        return colorFunc(normalizedValue);
    }
    // Plot the data points
    const pointRadius = 4;
    const defaultPointColor = '#4CAF50';
    
    processedData.forEach(point => {
        // Skip non-positive values for log scale
        if ((effectiveXScale === 'log' && point.x <= 0) || (effectiveYScale === 'log' && point.y <= 0)) {
            return;
        }
        
        // Scale the point to the plot area
        let x, y;
        
        if (effectiveXScale === 'log') {
            const logMin = Math.log10(xRange[0]);
            const logMax = Math.log10(xRange[1]);
            const logX = Math.log10(point.x);
            x = ((logX - logMin) / (logMax - logMin)) * width;
        } else {
            x = ((point.x - xRange[0]) / (xRange[1] - xRange[0])) * width;
        }
        
        if (effectiveYScale === 'log') {
            const logMin = Math.log10(yRange[0]);
            const logMax = Math.log10(yRange[1]);
            const logY = Math.log10(point.y);
            y = height - ((logY - logMin) / (logMax - logMin)) * height;
        } else {
            y = height - ((point.y - yRange[0]) / (yRange[1] - yRange[0])) * height;
        }
        
        // ENHANCED: Determine point color based on color axis with scale support
        let pointColor = defaultPointColor;
        if (colorAxisName && point.colorValue !== null && point.colorValue !== undefined && 
            colorMin !== null && colorMax !== null) {
            pointColor = getColorFromMap(point.colorValue, colorMin, colorMax, colormap, colorScale);
        }
        
        // Create the point
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', x);
        circle.setAttribute('cy', y);
        circle.setAttribute('r', pointRadius);
        circle.setAttribute('fill', pointColor);
        circle.setAttribute('fill-opacity', pointAlpha.toString());
        circle.setAttribute('stroke', '#333');
        circle.setAttribute('stroke-width', '1');
        circle.setAttribute('data-index', point.index);
        
        // Add tooltip functionality
        circle.setAttribute('data-original-x', point.originalX);
        circle.setAttribute('data-original-y', point.originalY);
        if (colorAxisName) {
            circle.setAttribute('data-color-value', point.colorValue);
        }
        
        // Add hover effect
        circle.addEventListener('mouseover', function(e) {
            this.setAttribute('r', pointRadius * 1.5);
            this.setAttribute('fill', '#ff9800');
            
            // Show tooltip
            const tooltip = document.createElement('div');
            tooltip.className = 'plot-tooltip';
            tooltip.style.position = 'absolute';
            tooltip.style.backgroundColor = 'rgba(154, 25, 214, 0.8)';
            tooltip.style.color = 'white';
            tooltip.style.padding = '5px 10px';
            tooltip.style.borderRadius = '4px';
            tooltip.style.fontSize = '12px';
            tooltip.style.pointerEvents = 'none';
            tooltip.style.zIndex = '300001';
            
            // Format tooltip content
            let tooltipContent = `<strong>${renderLatexLabel(xAxisName)}:</strong> `;
            if (typeof point.originalX === 'number') {
                tooltipContent += point.originalX.toFixed(2);
            } else {
                tooltipContent += point.originalX;
            }
            
            tooltipContent += `<br><strong>${renderLatexLabel(yAxisName)}:</strong> `;
            if (typeof point.originalY === 'number') {
                tooltipContent += point.originalY.toFixed(2);
            } else {
                tooltipContent += point.originalY;
            }
            
            // Add color value if available
            if (colorAxisName && point.colorValue !== null && point.colorValue !== undefined) {
                tooltipContent += `<br><strong>${renderLatexLabel(colorAxisName)}:</strong> `;
                if (typeof point.colorValue === 'number') {
                    tooltipContent += point.colorValue.toFixed(2);
                } else {
                    tooltipContent += point.colorValue;
                }
            }
            
            // Add RA/DEC if available
            if (point.obj._originalObj && point.obj._originalObj.ra !== undefined && point.obj._originalObj.dec !== undefined) {
                tooltipContent += `<br><strong>RA:</strong> ${point.obj._originalObj.ra.toFixed(6)}<br><strong>DEC:</strong> ${point.obj._originalObj.dec.toFixed(6)}`;
            }
            
            tooltip.innerHTML = tooltipContent;
            document.body.appendChild(tooltip);
            
            // Position the tooltip
            const rect = svg.getBoundingClientRect();
            const tooltipX = rect.left + margin.left + x + 10;
            const tooltipY = rect.top + margin.top + y - 10;
            
            tooltip.style.left = `${tooltipX}px`;
            tooltip.style.top = `${tooltipY}px`;
            
            // Store the tooltip reference
            this._tooltip = tooltip;
        });
        
        circle.addEventListener('mousemove', function(e) {
            if (this._tooltip) {
                const rect = svg.getBoundingClientRect();
                const tooltipX = e.clientX + 10;
                const tooltipY = e.clientY - 10;
                
                this._tooltip.style.left = `${tooltipX}px`;
                this._tooltip.style.top = `${tooltipY}px`;
            }
        });
        
        circle.addEventListener('mouseout', function(e) {
            this.setAttribute('r', pointRadius);
            this.setAttribute('fill', pointColor);
            
            // Remove tooltip
            if (this._tooltip) {
                document.body.removeChild(this._tooltip);
                this._tooltip = null;
            }
        });
        
        // Add click event to highlight corresponding region on the map
        circle.addEventListener('click', function(e) {
            // Get the RA and DEC from the original object
            if (point.obj._originalObj && point.obj._originalObj.ra !== undefined && point.obj._originalObj.dec !== undefined) {
                const ra = point.obj._originalObj.ra;
                const dec = point.obj._originalObj.dec;
                const clickedCircle = this; // Reference to the clicked SVG circle
                console.log(`Plotter Click: RA=${ra}, DEC=${dec}`);

                // Use the pane bound to THIS plot (not necessarily the currently-active pane).
                const targetWin = plotTargetWin || window;

                // Helper: normalize catalog names to the same key used by overlays ("catalogs/<basename>")
                const plotterCatalogKey = (name) => {
                    const raw = String(name || '').trim();
                    if (!raw) return null;
                    if (raw.startsWith('catalogs/')) return raw;
                    const base = raw.split('/').pop().split('\\').pop();
                    return `catalogs/${base}`;
                };

                // The plot is tied to a specific catalog; when multiple catalogs are loaded/visible,
                // we must match/highlight within that catalog only (otherwise we can jump to the wrong source).
                let plotCatalogKey = null;
                try { plotCatalogKey = plotterCatalogKey(window.__plotterLastPlotCatalogName || null); } catch (_) { plotCatalogKey = null; }

                // Find the closest source in the catalog data
                let closestSourceIndex = -1;
                let minDistance = Infinity;

                // Use the canvas overlay catalog data; NOTE: catalogSourceMap only contains VISIBLE sources,
                // so we must not depend on it for matching (otherwise clicks fail when the target is offscreen).
                const catalogData = targetWin.catalogDataForOverlay;
                if (catalogData && catalogData.length > 0) {
                    catalogData.forEach((source, index) => {
                        if (!source) return;
                        // Restrict matching to the catalog that generated this plot (when available)
                        if (plotCatalogKey && source.__catalogName && source.__catalogName !== plotCatalogKey) return;
                        if (source.ra !== undefined && source.dec !== undefined) {
                            const sourceRa = parseFloat(source.ra);
                            const sourceDec = parseFloat(source.dec);
                            if (!isNaN(sourceRa) && !isNaN(sourceDec)) {
                                // Normalize RA difference into [-180, +180] to avoid wrap issues near 0/360.
                                let dra = ra - sourceRa;
                                if (isFinite(dra)) dra = ((dra + 540) % 360) - 180;
                                const ddec = dec - sourceDec;
                                const distance = Math.sqrt(dra * dra + ddec * ddec);
                                if (distance < minDistance) {
                                    minDistance = distance;
                                    closestSourceIndex = index;
                                }
                            }
                        }
                    });
                }

                console.log(`Plotter Click: Closest source search complete. Index: ${closestSourceIndex}`);

                // Always try to pan/zoom based on the clicked point's RA/Dec using the plot pane's WCS.
                // This avoids jumping due to stale/incorrect cached overlay x/y.
                const activeViewer = (targetWin.tiledViewer || targetWin.viewer || (typeof targetWin.viewer !== 'undefined' ? targetWin.viewer : null));
                let imgX = undefined;
                let imgY = undefined;
                try {
                    const raNum = Number(ra);
                    const decNum = Number(dec);
                    if (Number.isFinite(raNum) && Number.isFinite(decNum)) {
                        if (typeof targetWin.worldToPixelGeneric === 'function') {
                            const p = targetWin.worldToPixelGeneric(raNum, decNum);
                            if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
                                imgX = Number(p.x);
                                imgY = Number(p.y);
                            }
                        } else if (targetWin.parsedWCS && targetWin.parsedWCS.hasWCS && typeof targetWin.parsedWCS.worldToPixels === 'function') {
                            const p2 = targetWin.parsedWCS.worldToPixels(raNum, decNum);
                            if (p2 && Number.isFinite(p2.x) && Number.isFinite(p2.y)) {
                                // parsedWCS.worldToPixels returns WCS pixels; convert to display/output if needed
                                if (typeof targetWin.convertWcsPixelToDisplayOutput === 'function') {
                                    const disp = targetWin.convertWcsPixelToDisplayOutput(Number(p2.x), Number(p2.y));
                                    if (disp && Number.isFinite(disp.x) && Number.isFinite(disp.y)) {
                                        imgX = Number(disp.x);
                                        imgY = Number(disp.y);
                                    } else {
                                        imgX = Number(p2.x);
                                        imgY = Number(p2.y);
                                    }
                                } else {
                                    imgX = Number(p2.x);
                                    imgY = Number(p2.y);
                                }
                            }
                        }
                    }
                } catch (_) {}

                // Sanity check: if computed pixels are wildly outside the image, treat as invalid
                try {
                    const w = Number(targetWin?.fitsData?.width);
                    const h = Number(targetWin?.fitsData?.height);
                    if (Number.isFinite(imgX) && Number.isFinite(imgY) && Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
                        const margin = 5;
                        if (imgX < -margin || imgY < -margin || imgX > (w + margin) || imgY > (h + margin)) {
                            console.warn('Plotter Click: computed image coords out of bounds; will not pan', { imgX, imgY, w, h });
                            imgX = undefined;
                            imgY = undefined;
                        }
                    }
                } catch (_) {}

                // 1) Highlight Scatter Plot Point (always)
                if (window.highlightedScatterCircle) {
                    window.highlightedScatterCircle.setAttribute('stroke', '#333');
                    window.highlightedScatterCircle.setAttribute('stroke-width', '1');
                    window.highlightedScatterCircle.setAttribute('r', pointRadius);
                }
                clickedCircle.setAttribute('stroke', 'yellow');
                clickedCircle.setAttribute('stroke-width', '2');
                clickedCircle.setAttribute('r', pointRadius * 1.5);
                window.highlightedScatterCircle = clickedCircle;

                // Pan immediately (if possible)
                let viewportCoords = null;
                if (activeViewer && activeViewer.viewport && Number.isFinite(imgX) && Number.isFinite(imgY) && typeof OpenSeadragon !== 'undefined') {
                    try {
                        const imageCoords = new OpenSeadragon.Point(imgX, imgY);
                        const tiledImage = activeViewer.world && typeof activeViewer.world.getItemAt === 'function'
                            ? activeViewer.world.getItemAt(0)
                            : null;
                        viewportCoords = tiledImage && typeof tiledImage.imageToViewportCoordinates === 'function'
                            ? tiledImage.imageToViewportCoordinates(imageCoords)
                            : activeViewer.viewport.imageToViewportCoordinates(imageCoords);
                        if (!viewportCoords || !Number.isFinite(viewportCoords.x) || !Number.isFinite(viewportCoords.y)) {
                            throw new Error('viewportCoords not finite');
                        }
                        activeViewer.viewport.panTo(viewportCoords, true);
                        // Prevent getting "stuck" on black background by clamping to image bounds.
                        try {
                            if (typeof activeViewer.viewport.applyConstraints === 'function') {
                                activeViewer.viewport.applyConstraints(true);
                            } else if (typeof activeViewer.viewport.ensureVisible === 'function') {
                                activeViewer.viewport.ensureVisible(true);
                            }
                        } catch (_) {}
                    } catch (zoomError) {
                        console.warn('Plotter Click: pan/zoom failed', zoomError);
                        viewportCoords = null;
                    }
                }

                // Compute popup coordinates directly from the viewer (no need to wait for sourceMap).
                let screenX = 10, screenY = 10;
                if (viewportCoords && activeViewer && activeViewer.viewport && typeof activeViewer.viewport.viewportToViewerElementCoordinates === 'function') {
                    try {
                        const p = activeViewer.viewport.viewportToViewerElementCoordinates(viewportCoords);
                        if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
                            screenX = p.x;
                            screenY = p.y;
                        }
                    } catch (_) {}
                }

                // Trigger highlight/popup if we can match to an overlay entry for this catalog.
                // Use a tight tolerance (arcseconds) to avoid snapping to a different catalog/source.
                const tolerance = 10 / 3600; // 10 arcsec
                const hasOverlayMatch = (closestSourceIndex !== -1 && minDistance < tolerance);
                if (hasOverlayMatch) {
                    console.log(`Plotter Click: Found matching source at index ${closestSourceIndex}`);

                    // Highlight immediately (no intentional delay)
                    try {
                        if (targetWin && typeof targetWin.canvasHighlightSource === 'function') {
                            targetWin.canvasHighlightSource(closestSourceIndex);
                        } else {
                            // Fallback: set global and request redraw if available
                            try { targetWin.currentHighlightedSourceIndex = closestSourceIndex; } catch (_) {}
                            try { if (targetWin && typeof targetWin.canvasUpdateOverlay === 'function') targetWin.canvasUpdateOverlay(); } catch (_) {}
                        }
                    } catch (_) {}

                    try {
                        const sourceObj = catalogData && catalogData[closestSourceIndex] ? catalogData[closestSourceIndex] : null;
                        if (targetWin && targetWin.canvasPopup && typeof targetWin.canvasPopup.show === 'function' && sourceObj) {
                            targetWin.canvasPopup.show(closestSourceIndex, screenX, screenY, sourceObj);
                        }
                    } catch (_) {}

                } else {
                    console.log(`Plotter Click: No matching source found within tolerance (${tolerance}).`);
                    if (closestSourceIndex !== -1) {
                        console.log(`Plotter Click: Closest source found had distance ${minDistance}`);
                    }
                    // Still show a minimal popup at the computed location if possible
                    try {
                        if (targetWin && targetWin.canvasPopup && typeof targetWin.canvasPopup.show === 'function') {
                            targetWin.canvasPopup.show(-1, screenX, screenY, {
                                ra: Number(ra),
                                dec: Number(dec),
                                imageX: Number.isFinite(imgX) ? imgX : undefined,
                                imageY: Number.isFinite(imgY) ? imgY : undefined,
                                galaxy: point?.obj?._originalObj?.galaxy
                            });
                        }
                    } catch (_) {}
                }

                // Add/Update Clear Selection Button
                 const plotAreaElement = document.getElementById('plot-area');
                 let clearBtn = document.getElementById('clear-selection-btn');

                 if (!clearBtn && plotAreaElement) {
                    clearBtn = document.createElement('button');
                    clearBtn.id = 'clear-selection-btn';
                    clearBtn.className = 'btn btn-sm btn-outline-secondary';
                    clearBtn.textContent = 'Clear Map Selection';
                    clearBtn.style.position = 'absolute';
                    clearBtn.style.top = '10px';
                    clearBtn.style.right = '10px';
                    clearBtn.style.zIndex = '3000'; 
                    clearBtn.style.padding = '3px 8px';
                    clearBtn.style.fontSize = '12px';
                    
                    clearBtn.addEventListener('click', function() {
                        // Clear map highlight
                        window.currentHighlightedSourceIndex = -1;
                        if (typeof canvasUpdateOverlay === 'function') { 
                             console.log("Clear Selection: Calling canvasUpdateOverlay to clear map highlight.");
                            canvasUpdateOverlay();
                        } else {
                           console.warn("Clear Selection: canvasUpdateOverlay function not found.");
                        }
                        
                        // Clear scatter plot highlight
                        if (window.highlightedScatterCircle) {
                            window.highlightedScatterCircle.setAttribute('stroke', '#333');
                            window.highlightedScatterCircle.setAttribute('stroke-width', '1');
                            window.highlightedScatterCircle.setAttribute('r', pointRadius);
                            window.highlightedScatterCircle = null;
                        }
                        
                        // Hide popups
                         if (window.canvasPopup && typeof window.canvasPopup.hide === 'function') {
                            window.canvasPopup.hide();
                        } else if (typeof hideAllInfoPopups === 'function') {
                            hideAllInfoPopups();
                        }
                        // Remove button
                        this.remove();
                    });
                    
                    plotAreaElement.appendChild(clearBtn);
                }
            }
        });
        
        pointsGroup.appendChild(circle);
    });
    
    // ENHANCED: Add colorbar if color axis is specified with log scale support
    if (colorAxisName && colorMin !== null && colorMax !== null) {
        // Create colorbar container
        const colorbarWidth = 20;
        const colorbarHeight = height * 0.7;
        const colorbarX = width + 30;
        const colorbarY = height * 0.15;
        
        // Create colorbar background
        const colorbarBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        colorbarBg.setAttribute('x', colorbarX - 1);
        colorbarBg.setAttribute('y', colorbarY - 1);
        colorbarBg.setAttribute('width', colorbarWidth + 2);
        colorbarBg.setAttribute('height', colorbarHeight + 2);
        colorbarBg.setAttribute('fill', 'none');
        colorbarBg.setAttribute('stroke', '#888');
        colorbarBg.setAttribute('stroke-width', '1');
        g.appendChild(colorbarBg);
        
        // Create continuous colorbar using a linear gradient
        const gradientId = `colorbar-gradient-${Math.random().toString(36).substr(2, 9)}`;
        
        // Create linear gradient definition
        const linearGradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
        linearGradient.setAttribute('id', gradientId);
        linearGradient.setAttribute('x1', '0%');
        linearGradient.setAttribute('y1', '100%');
        linearGradient.setAttribute('x2', '0%');
        linearGradient.setAttribute('y2', '0%');
        
        // Add gradient stops
        const numStops = 10;
        for (let i = 0; i <= numStops; i++) {
            const offset = i / numStops;
            let value;
            
            if (colorScale === 'log') {
                // Log scale gradient
                const logMin = Math.log10(colorMin);
                const logMax = Math.log10(colorMax);
                value = Math.pow(10, logMin + offset * (logMax - logMin));
            } else {
                // Linear scale gradient
                value = colorMin + offset * (colorMax - colorMin);
            }
            
            const stopColor = getColorFromMap(value, colorMin, colorMax, colormap, colorScale);
            
            const stop = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
            stop.setAttribute('offset', `${offset * 100}%`);
            stop.setAttribute('stop-color', stopColor);
            linearGradient.appendChild(stop);
        }
        
        // Add the gradient definition to the SVG
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        defs.appendChild(linearGradient);
        svg.appendChild(defs);
        
        // Create the colorbar rectangle with the gradient fill
        const colorbarRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        colorbarRect.setAttribute('x', colorbarX);
        colorbarRect.setAttribute('y', colorbarY);
        colorbarRect.setAttribute('width', colorbarWidth);
        colorbarRect.setAttribute('height', colorbarHeight);
        colorbarRect.setAttribute('fill', `url(#${gradientId})`);
        g.appendChild(colorbarRect);
        
        // ENHANCED: Add colorbar ticks with log scale support
        if (colorScale === 'log') {
            const logMin = Math.log10(colorMin);
            const logMax = Math.log10(colorMax);
            // Only place integer power ticks that fall within [logMin, logMax]
            let startPow = Math.ceil(logMin);
            let endPow = Math.floor(logMax);
            // If no integer powers inside range, fallback to min/max ticks only
            if (endPow < startPow) {
                const ticks = [
                    { t: 0, p: Math.round(logMin) },
                    { t: 1, p: Math.round(logMax) },
                ];
                ticks.forEach(({ t, p }) => {
                    const yRaw = colorbarY + colorbarHeight - t * colorbarHeight;
                    const y = Math.max(colorbarY + 8, Math.min(colorbarY + colorbarHeight - 4, yRaw));
                    const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                    tick.setAttribute('x1', colorbarX + colorbarWidth);
                    tick.setAttribute('y1', y);
                    tick.setAttribute('x2', colorbarX + colorbarWidth + 5);
                    tick.setAttribute('y2', y);
                    tick.setAttribute('stroke', '#888');
                    tick.setAttribute('stroke-width', '1');
                    g.appendChild(tick);
                    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    label.setAttribute('x', colorbarX + colorbarWidth + 8);
                    label.setAttribute('y', y + 4);
                    label.setAttribute('fill', '#aaa');
                    label.setAttribute('font-size', '10px');
                    label.setAttribute('text-anchor', 'start');
                    label.appendChild(document.createTextNode('10'));
                    const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
                    tspan.setAttribute('baseline-shift', 'super');
                    tspan.setAttribute('font-size', '8px');
                    tspan.textContent = String(p);
                    label.appendChild(tspan);
                    g.appendChild(label);
                });
            } else {
                // Thin ticks to ~6
                let step = 1;
                const count = endPow - startPow + 1;
                if (count > 6) step = Math.ceil(count / 6);
                for (let p = startPow; p <= endPow; p += step) {
                    const t = (p - logMin) / (logMax - logMin);
                    const yRaw = colorbarY + colorbarHeight - t * colorbarHeight;
                    const y = Math.max(colorbarY + 8, Math.min(colorbarY + colorbarHeight - 4, yRaw));
                    const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                    tick.setAttribute('x1', colorbarX + colorbarWidth);
                    tick.setAttribute('y1', y);
                    tick.setAttribute('x2', colorbarX + colorbarWidth + 5);
                    tick.setAttribute('y2', y);
                    tick.setAttribute('stroke', '#888');
                    tick.setAttribute('stroke-width', '1');
                    g.appendChild(tick);
                    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    label.setAttribute('x', colorbarX + colorbarWidth + 8);
                    label.setAttribute('y', y + 4);
                    label.setAttribute('fill', '#aaa');
                    label.setAttribute('font-size', '10px');
                    label.setAttribute('text-anchor', 'start');
                    label.appendChild(document.createTextNode('10'));
                    const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
                    tspan.setAttribute('baseline-shift', 'super');
                    tspan.setAttribute('font-size', '8px');
                    tspan.textContent = String(p);
                    label.appendChild(tspan);
                    g.appendChild(label);
                }
            }
        } else {
            const numTicks = 5;
            for (let i = 0; i <= numTicks; i++) {
                const value = colorMin + (i / numTicks) * (colorMax - colorMin);
                const y = colorbarY + colorbarHeight - (i / numTicks) * colorbarHeight;
                const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                tick.setAttribute('x1', colorbarX + colorbarWidth);
                tick.setAttribute('y1', y);
                tick.setAttribute('x2', colorbarX + colorbarWidth + 5);
                tick.setAttribute('y2', y);
                tick.setAttribute('stroke', '#888');
                tick.setAttribute('stroke-width', '1');
                g.appendChild(tick);
                const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                label.setAttribute('x', colorbarX + colorbarWidth + 8);
                label.setAttribute('y', y + 4);
                label.setAttribute('fill', '#aaa');
                label.setAttribute('font-size', '10px');
                label.setAttribute('text-anchor', 'start');
                if (Math.abs(value) < 0.01 || Math.abs(value) > 1000) {
                    label.textContent = value.toExponential(1);
                } else {
                    label.textContent = value.toFixed(2);
                }
                g.appendChild(label);
            }
        }
        
        // ENHANCED: Add colorbar title with LaTeX support
        const colorbarTitle = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        colorbarTitle.setAttribute('x', colorbarX + colorbarWidth / 2);
        colorbarTitle.setAttribute('y', colorbarY - 10);
        colorbarTitle.setAttribute('text-anchor', 'middle');
        colorbarTitle.setAttribute('fill', 'white');
        colorbarTitle.setAttribute('font-size', '12px');
        setSvgTextWithLatex(colorbarTitle, colorAxisName);
        g.appendChild(colorbarTitle);
    }
    
    // Add the SVG to the plot area
    svg.appendChild(g);
    plotArea.innerHTML = '';
    plotArea.appendChild(svg);
    const saveButton = document.getElementById('save-plot-button');
    if (saveButton) {
        saveButton.style.display = 'block';
    }
}

// Function to parse and render LaTeX-like formulas
// Enhanced LaTeX-like rendering function
function renderLatexLabel(text) {
    if (!text) return '';
    // Escape <, >, &
    let result = text.replace(/[&<>]/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;'
    }[c]));

    // Subscripts (curly then simple)
    // Accept _{} as empty subscript (renders as empty)
    result = result.replace(/_\{\}/g, '<sub></sub>');
    result = result.replace(/_\{([^}]+)\}/g, '<sub>$1</sub>');
    result = result.replace(/_([a-zA-Z0-9]+)/g, '<sub>$1</sub>');
    // Handle .. as subscript dot (optional: can use '·' or '…')
    result = result.replace(/(\w)\.\./g, '$1<sub>·</sub>'); // subscript dot

    // Superscripts (curly then simple)
    result = result.replace(/\^\{\}/g, '<sup></sup>');
    result = result.replace(/\^\{([^}]+)\}/g, '<sup>$1</sup>');
    result = result.replace(/\^([a-zA-Z0-9+-]+)/g, '<sup>$1</sup>');
    result = result.replace(/(\w)\^\./g, '$1<sup>·</sup>'); // superscript dot if "^." (optional)

    // LaTeX symbols
    const symbols = {
        '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ',
        '\\epsilon': 'ε', '\\zeta': 'ζ', '\\eta': 'η', '\\theta': 'θ',
        '\\iota': 'ι', '\\kappa': 'κ', '\\lambda': 'λ', '\\mu': 'μ',
        '\\nu': 'ν', '\\xi': 'ξ', '\\pi': 'π', '\\rho': 'ρ',
        '\\sigma': 'σ', '\\tau': 'τ', '\\upsilon': 'υ', '\\phi': 'φ',
        '\\chi': 'χ', '\\psi': 'ψ', '\\omega': 'ω',
        '\\Alpha': 'Α', '\\Beta': 'Β', '\\Gamma': 'Γ', '\\Delta': 'Δ',
        '\\Epsilon': 'Ε', '\\Zeta': 'Ζ', '\\Eta': 'Η', '\\Theta': 'Θ',
        '\\Iota': 'Ι', '\\Kappa': 'Κ', '\\Lambda': 'Λ', '\\Mu': 'Μ',
        '\\Nu': 'Ν', '\\Xi': 'Ξ', '\\Pi': 'Π', '\\Rho': 'Ρ',
        '\\Sigma': 'Σ', '\\Tau': 'Τ', '\\Upsilon': 'Υ', '\\Phi': 'Φ',
        '\\Chi': 'Χ', '\\Psi': 'Ψ', '\\Omega': 'Ω',
        '\\odot': '⊙', '\\oplus': '⊕', '\\otimes': '⊗',
        '\\pm': '±', '\\mp': '∓', '\\times': '×', '\\div': '÷',
        '\\le': '≤', '\\ge': '≥', '\\ne': '≠', '\\approx': '≈',
        '\\sim': '∼', '\\propto': '∝', '\\infty': '∞',
        '\\partial': '∂', '\\nabla': '∇', '\\int': '∫',
        '\\sum': '∑', '\\prod': '∏', '\\sqrt': '√'
    };
    for (const [latex, unicode] of Object.entries(symbols)) {
        const regex = new RegExp(latex.replace(/\\/g, '\\\\'), 'g');
        result = result.replace(regex, unicode);
    }

    // Fractions
    result = result.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, 
        '<span style="display:inline-block;text-align:center;vertical-align:middle;">' +
        '<span style="display:block; border-bottom:1px solid;line-height:1;">$1</span>' +
        '<span style="display:block;line-height:1;">$2</span></span>');

    // Text modes
    result = result.replace(/\\text\{([^}]+)\}/g, '$1');
    result = result.replace(/\\mathrm\{([^}]+)\}/g, '<span style="font-style:normal;">$1</span>');
    result = result.replace(/\\mathit\{([^}]+)\}/g, '<span style="font-style:italic;">$1</span>');
    result = result.replace(/\\mathbf\{([^}]+)\}/g, '<span style="font-weight:bold;">$1</span>');

    // Units in brackets
    result = result.replace(/\[([^\]]+)\]/g, '<span style="font-size:0.9em;">[$1]</span>');

    return result;
}

// Helper to set SVG text content with basic LaTeX-like support including underscores with braces
function setSvgTextWithLatex(textNode, text) {
    if (!textNode) return;
    // Allow labels like l_21um and l_{21um}
    // Use the same rendering as renderLatexLabel but assign via innerHTML
    const html = renderLatexLabel(String(text || ''));
    // textNode may be <text>; safe to set innerHTML for <text> content spans
    textNode.innerHTML = html;
}
function createSedTab(container) {
    console.log("createSedTab: Creating SED tab content programmatically.");
    // Clear any previous content
    container.innerHTML = '';

    // Inject animation styles
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeIn {
            from {
                opacity: 0;
                transform: translateY(10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        .sed-result-item-fade-in {
            animation: fadeIn 0.4s ease-out forwards;
            opacity: 0;
        }
    `;
    document.head.appendChild(style);

    const wrapper = document.createElement('div');
    wrapper.style.marginBottom = '20px';

    const title = document.createElement('h3');
    title.textContent = 'SED Search';
    title.style.fontSize = '16px';
    title.style.marginBottom = '10px';
    wrapper.appendChild(title);

    // Catalog Dropdown
    const catalogDiv = document.createElement('div');
    catalogDiv.style.marginBottom = '15px';
    const catalogLabel = document.createElement('label');
    catalogLabel.htmlFor = 'sed-catalog-select';
    catalogLabel.textContent = 'Catalog:';
    catalogLabel.style.display = 'block';
    catalogLabel.style.marginBottom = '5px';
    const catalogSelect = document.createElement('select');
    catalogSelect.id = 'sed-catalog-select';
    Object.assign(catalogSelect.style, {
        width: '100%', padding: '8px', backgroundColor: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px'
    });
    catalogDiv.appendChild(catalogLabel);
    catalogDiv.appendChild(catalogSelect);
    wrapper.appendChild(catalogDiv);

    // Search Type Selector
    const searchTypeDiv = document.createElement('div');
    searchTypeDiv.style.marginBottom = '15px';
    searchTypeDiv.innerHTML = `
        <label style="display: block; margin-bottom: 5px;">Search Type:</label>
        <input type="radio" id="search-type-nearby" name="search-type" value="nearby" checked>
        <label for="search-type-nearby">Nearby</label>
        <input type="radio" id="search-type-flag" name="search-type" value="flag" style="margin-left: 15px;">
        <label for="search-type-flag">By Flag</label>
        <input type="radio" id="search-type-range" name="search-type" value="range" style="margin-left: 15px;">
        <label for="search-type-range">By Range</label>
    `;
    wrapper.appendChild(searchTypeDiv);

    // Nearby Search Container
    const nearbySearchContainer = document.createElement('div');
    nearbySearchContainer.id = 'nearby-search-container';

    // RA/Dec Inputs
    const coordDiv = document.createElement('div');
    Object.assign(coordDiv.style, { display: 'flex', gap: '10px', marginBottom: '10px',marginRight: '20px' });
    
    const raDiv = document.createElement('div');
    raDiv.style.flex = '1';
    raDiv.style.marginRight = '15px';

    const raLabel = document.createElement('label');
    raLabel.htmlFor = 'sed-ra-input';
    raLabel.textContent = 'RA (deg):';
    raLabel.style.display = 'block';
    raLabel.style.marginBottom = '5px';
    const raInput = document.createElement('input');
    raInput.type = 'text';
    raInput.id = 'sed-ra-input';
    raInput.placeholder = 'e.g., 149.9';
    Object.assign(raInput.style, {
        width: '100%', padding: '8px', backgroundColor: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px'
    });
    raDiv.appendChild(raLabel);
    raDiv.appendChild(raInput);

    const decDiv = document.createElement('div');
    decDiv.style.flex = '1';
    const decLabel = document.createElement('label');
    decLabel.htmlFor = 'sed-dec-input';
    decLabel.textContent = 'Dec (deg):';
    decLabel.style.display = 'block';
    decLabel.style.marginBottom = '5px';
    const decInput = document.createElement('input');
    decInput.type = 'text';
    decInput.id = 'sed-dec-input';
    decInput.placeholder = 'e.g., 2.5';
    Object.assign(decInput.style, {
        width: '100%', padding: '8px', backgroundColor: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px'
    });
    decDiv.appendChild(decLabel);
    decDiv.appendChild(decInput);

    coordDiv.appendChild(raDiv);
    coordDiv.appendChild(decDiv);
    nearbySearchContainer.appendChild(coordDiv);

    // Search Radius
    const radiusDiv = document.createElement('div');
    radiusDiv.style.marginBottom = '15px';
    radiusDiv.style.marginRight = '15px';

    const radiusLabel = document.createElement('label');
    radiusLabel.htmlFor = 'sed-radius-input';
    radiusLabel.textContent = 'Search Radius (arcsec):';
    radiusLabel.style.display = 'block';
    radiusLabel.style.marginBottom = '5px';
    const radiusInput = document.createElement('input');
    radiusInput.type = 'number';
    radiusInput.id = 'sed-radius-input';
    radiusInput.value = '10';
    Object.assign(radiusInput.style, {
        width: '100%', padding: '8px', backgroundColor: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px'
    });
    radiusDiv.appendChild(radiusLabel);
    radiusDiv.appendChild(radiusInput);
    nearbySearchContainer.appendChild(radiusDiv);
    
    wrapper.appendChild(nearbySearchContainer);

    // Flag Search Container
    const flagSearchContainer = document.createElement('div');
    flagSearchContainer.id = 'flag-search-container';
    flagSearchContainer.style.display = 'none';

    const flagDiv = document.createElement('div');
    flagDiv.style.marginBottom = '15px';
    const flagLabel = document.createElement('label');
    flagLabel.htmlFor = 'sed-flag-select';
    flagLabel.textContent = 'Flag:';
    flagLabel.style.display = 'block';
    flagLabel.style.marginBottom = '5px';
    const flagSelect = document.createElement('select');
    flagSelect.id = 'sed-flag-select';
    Object.assign(flagSelect.style, {
        width: '100%', padding: '8px', backgroundColor: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px'
    });
    flagDiv.appendChild(flagLabel);
    flagDiv.appendChild(flagSelect);
    flagSearchContainer.appendChild(flagDiv);
    wrapper.appendChild(flagSearchContainer);

    // Range Search Container
    const rangeSearchContainer = document.createElement('div');
    rangeSearchContainer.id = 'range-search-container';
    rangeSearchContainer.style.display = 'none';

    // Container for the rows of conditions
    const conditionsContainer = document.createElement('div');
    conditionsContainer.id = 'sed-range-conditions-container';
    rangeSearchContainer.appendChild(conditionsContainer);
    
    // Logical operator choice (AND/OR)
    const logicalOpContainer = document.createElement('div');
    logicalOpContainer.id = 'sed-range-logical-op-container';
    logicalOpContainer.style.display = 'none'; // Initially hidden
    logicalOpContainer.style.margin = '10px 0';
    logicalOpContainer.innerHTML = `
        <label style="margin-right: 10px;">Combine with:</label>
        <input type="radio" id="sed-range-op-and" name="sed-range-logical-op" value="AND" checked>
        <label for="sed-range-op-and">AND</label>
        <input type="radio" id="sed-range-op-or" name="sed-range-logical-op" value="OR" style="margin-left: 15px;">
        <label for="sed-range-op-or">OR</label>
    `;
    rangeSearchContainer.appendChild(logicalOpContainer);

    // "Add Condition" button
    const addConditionButton = document.createElement('button');
    addConditionButton.textContent = '+ Add Condition';
    Object.assign(addConditionButton.style, {
        padding: '5px 10px',
        border: '1px solid #555',
        backgroundColor: '#3a3a3a',
        color: 'white',
        borderRadius: '4px',
        cursor: 'pointer',
        marginTop: '5px',
        width: 'auto'
    });
    addConditionButton.addEventListener('click', () => addRangeConditionRow(conditionsContainer, catalogSelect.value));
    rangeSearchContainer.appendChild(addConditionButton);
    
    // Initial single condition row
    addRangeConditionRow(conditionsContainer, catalogSelect.value, false); // Don't show remove button for the first row

    wrapper.appendChild(rangeSearchContainer);

    // Search Button
    const searchButton = document.createElement('button');
    searchButton.id = 'sed-search-button';
    searchButton.textContent = 'Search';
    Object.assign(searchButton.style, {
        width: '100%', padding: '10px', backgroundColor: '#2196F3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'
    });
    searchButton.addEventListener('click', dispatchSedSearch);
    wrapper.appendChild(searchButton);

    // Results Container
    const resultsContainer = document.createElement('div');
    resultsContainer.id = 'sed-results-container';
    Object.assign(resultsContainer.style, { maxHeight: '400px', overflowY: 'auto', marginTop: '20px' });
    
    container.appendChild(wrapper);
    container.appendChild(resultsContainer);

    // Add event listeners
    const nearbyRadio = wrapper.querySelector('#search-type-nearby');
    const flagRadio = wrapper.querySelector('#search-type-flag');
    const rangeRadio = wrapper.querySelector('#search-type-range');
    const resultsContainerRef = container.querySelector('#sed-results-container');

    nearbyRadio.addEventListener('change', () => {
        nearbySearchContainer.style.display = 'block';
        flagSearchContainer.style.display = 'none';
        rangeSearchContainer.style.display = 'none';
        searchButton.textContent = 'Search Nearby';
        if (resultsContainerRef) resultsContainerRef.innerHTML = '';
    });

    flagRadio.addEventListener('change', () => {
        nearbySearchContainer.style.display = 'none';
        flagSearchContainer.style.display = 'block';
        rangeSearchContainer.style.display = 'none';
        searchButton.textContent = 'Search by Flag';
        if (resultsContainerRef) resultsContainerRef.innerHTML = '';
        populateSedFlagDropdown();
    });

    rangeRadio.addEventListener('change', () => {
        nearbySearchContainer.style.display = 'none';
        flagSearchContainer.style.display = 'none';
        rangeSearchContainer.style.display = 'block';
        searchButton.textContent = 'Search by Range';
        if (resultsContainerRef) resultsContainerRef.innerHTML = '';
        // Populate the dropdown in the first condition row, if it exists
        const firstRow = document.querySelector('.sed-range-condition-row');
        if (firstRow) {
            populateSedColumnDropdown(firstRow.querySelector('.sed-range-column-select'), catalogSelect.value);
        }
    });

    catalogSelect.addEventListener('change', () => {
        if (flagRadio.checked) {
            populateSedFlagDropdown();
        } else if (rangeRadio.checked) {
            // If range search is active, populate all existing column dropdowns
            const allColumnSelects = document.querySelectorAll('.sed-range-column-select');
            allColumnSelects.forEach(select => populateSedColumnDropdown(select, catalogSelect.value));
        }
    });

    // Populate catalog dropdown
    apiFetch('/list-catalogs/')
        .then(response => response.json())
        .then(data => {
            console.log("Populating SED catalog dropdown with:", data);
            catalogSelect.innerHTML = ''; // Clear existing options
            data.catalogs.forEach(catalog => {
                const option = document.createElement('option');
                option.value = catalog.name;
                option.textContent = catalog.name;
                if (catalog.name === window.currentCatalogName) {
                    option.selected = true;
                }
                catalogSelect.appendChild(option);
            });
            // After populating, if the flag search is active, populate its dropdown too.
            if (document.getElementById('search-type-flag').checked) {
                 populateSedFlagDropdown();
            } else if (document.getElementById('search-type-range').checked) {
                // If range search is selected, populate the dropdowns in the first row
                const firstRow = document.querySelector('.sed-range-condition-row');
                if (firstRow) {
                    populateSedColumnDropdown(firstRow.querySelector('.sed-range-column-select'), catalogSelect.value);
                }
            }
        })
        .catch(error => {
            console.error("Error fetching catalogs for SED tab:", error);
            catalogSelect.innerHTML = '<option>Error loading catalogs</option>';
        });

    // Set initial button text
    searchButton.textContent = 'Search Nearby';
}

function addRangeConditionRow(conditionsContainer, catalogName, showRemoveButton = true) {
    const conditionRow = document.createElement('div');
    conditionRow.className = 'sed-range-condition-row';
    conditionRow.style.display = 'flex';
    conditionRow.style.gap = '10px';
    conditionRow.style.marginBottom = '10px';

    const uniqueId = `condition-${Date.now()}-${Math.random()}`;

    // Column selector
    const colDiv = document.createElement('div');
    colDiv.style.flex = '3';
    colDiv.innerHTML = `
        <select class="sed-range-column-select" style="width: 100%; padding: 8px; background-color: #333; color: white; border: 1px solid #555; border-radius: 4px;"></select>
    `;
    
    // Operator selector
    const opDiv = document.createElement('div');
    opDiv.style.flex = '1';
    opDiv.innerHTML = `
        <select class="sed-range-operator-select" style="width: 100%; padding: 8px; background-color: #333; color: white; border: 1px solid #555; border-radius: 4px;">
            <option value=">">&gt;</option>
            <option value="<">&lt;</option>
            <option value=">=">&ge;</option>
            <option value="<=">&le;</option>
            <option value="==">=</option>
            <option value="!=">!=</option>
        </select>
    `;
    
    // Value input container (will be populated based on column type)
    const valDiv = document.createElement('div');
    valDiv.style.flex = '2';
    valDiv.className = 'sed-range-value-container';
    // Start with text input that accepts both text and numbers
    valDiv.innerHTML = `
        <input type="text" class="sed-range-value-input" placeholder="Enter value (text or number)" style="width: 100%; padding: 8px; background-color: #333; color: white; border: 1px solid #555; border-radius: 4px;">
    `;
    
    conditionRow.appendChild(colDiv);
    conditionRow.appendChild(opDiv);
    conditionRow.appendChild(valDiv);

    // Remove button
    if (showRemoveButton) {
        const removeBtnDiv = document.createElement('div');
        removeBtnDiv.style.flex = '0 0 auto';
        const removeButton = document.createElement('button');
        removeButton.textContent = '–';
        Object.assign(removeButton.style, {
             padding: '5px 10px', backgroundColor: '#555', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', height: '100%'
        });
        removeButton.onclick = () => {
            conditionRow.remove();
            updateLogicalOpVisibility(conditionsContainer.parentElement);
        };
        removeBtnDiv.appendChild(removeButton);
        conditionRow.appendChild(removeBtnDiv);
    } else {
        // Add a placeholder for alignment
        const placeholder = document.createElement('div');
        placeholder.style.flex = '0 0 auto';
        placeholder.style.width = '30px'; // Approx width of button
        conditionRow.appendChild(placeholder);
    }
    
    conditionsContainer.appendChild(conditionRow);
    
    // Populate the newly added column dropdown
    const newColumnSelect = colDiv.querySelector('.sed-range-column-select');
    populateSedColumnDropdown(newColumnSelect, catalogName);

    updateLogicalOpVisibility(conditionsContainer.parentElement);
}

function updateLogicalOpVisibility(rangeSearchContainer) {
    const conditionsContainer = rangeSearchContainer.querySelector('#sed-range-conditions-container');
    const logicalOpContainer = rangeSearchContainer.querySelector('#sed-range-logical-op-container');
    const conditionRows = conditionsContainer.getElementsByClassName('sed-range-condition-row');
    
    if (conditionRows.length > 1) {
        logicalOpContainer.style.display = 'block';
    } else {
        logicalOpContainer.style.display = 'none';
    }
}


// Updated function to detect boolean columns - now returns a Promise
function detectBooleanColumns(catalogName) {
    if (!catalogName) {
        return Promise.resolve([]);
    }

    // IMPORTANT: /catalog-with-flags expects an API catalog name (basename). In multi-panel mode we often
    // track catalogs internally as "catalogs/<file>", which will 500 the endpoint ("catalogs/catalogs/...").
    const apiName = String(catalogName || '').split('/').pop().split('\\').pop();
    return apiFetch(`/catalog-with-flags/${encodeURIComponent(apiName)}?prevent_auto_load=true`)
        .then(response => {
            if (!response.ok) {
                console.warn('Failed to load boolean columns, will treat all as numeric');
                return [];
            }
            return response.json();
        })
        .then(data => {
            const booleanColumns = data.boolean_columns || [];
            return booleanColumns;
        })
        .catch(error => {
            console.warn('Error fetching boolean columns:', error);
            return [];
        });
}




// Helper function to get sample data for column type detection
function getColumnSampleData(catalogName) {
    return apiFetch(`/catalog-info/?catalog_name=${encodeURIComponent(catalogName)}`)
        .then(response => response.ok ? response.json() : null)
        .then(data => data ? data.sample_data : [])
        .catch(() => []);
}

// Helper function to check if a column contains string-like data
function isStringLikeColumn(columnName, sampleData) {
    if (!sampleData || sampleData.length === 0) return false;
    
    // Check sample values for string-like content
    for (const row of sampleData.slice(0, 5)) { // Check first 5 rows
        const value = row[columnName];
        if (value !== null && value !== undefined && value !== 'NaN') {
            const stringValue = String(value).toLowerCase();
            // If it's not a number and contains letters, likely a string column
            if (isNaN(parseFloat(value)) && /[a-z]/.test(stringValue)) {
                return true;
            }
        }
    }
    return false;
}







// Updated function to add range condition row with universal text input
function addRangeConditionRow(conditionsContainer, catalogName, showRemoveButton = true) {
    const conditionRow = document.createElement('div');
    conditionRow.className = 'sed-range-condition-row';
    conditionRow.style.display = 'flex';
    conditionRow.style.gap = '10px';
    conditionRow.style.marginBottom = '10px';

    const uniqueId = `condition-${Date.now()}-${Math.random()}`;

    // Column selector
    const colDiv = document.createElement('div');
    colDiv.style.flex = '3';
    colDiv.innerHTML = `
        <select class="sed-range-column-select" style="width: 100%; padding: 8px; background-color: #333; color: white; border: 1px solid #555; border-radius: 4px;"></select>
    `;
    
    // Operator selector
    const opDiv = document.createElement('div');
    opDiv.style.flex = '1';
    opDiv.innerHTML = `
        <select class="sed-range-operator-select" style="width: 100%; padding: 8px; background-color: #333; color: white; border: 1px solid #555; border-radius: 4px;">
            <option value=">">&gt;</option>
            <option value="<">&lt;</option>
            <option value=">=">&ge;</option>
            <option value="<=">&le;</option>
            <option value="==">=</option>
            <option value="!=">!=</option>
        </select>
    `;
    
    // Value input container (will be populated based on column type)
    const valDiv = document.createElement('div');
    valDiv.style.flex = '2';
    valDiv.className = 'sed-range-value-container';
    // Start with text input that accepts both text and numbers
    valDiv.innerHTML = `
        <input type="text" class="sed-range-value-input" placeholder="Enter value (text or number)" style="width: 100%; padding: 8px; background-color: #333; color: white; border: 1px solid #555; border-radius: 4px;">
    `;
    
    conditionRow.appendChild(colDiv);
    conditionRow.appendChild(opDiv);
    conditionRow.appendChild(valDiv);

    // Remove button
    if (showRemoveButton) {
        const removeBtnDiv = document.createElement('div');
        removeBtnDiv.style.flex = '0 0 auto';
        const removeButton = document.createElement('button');
        removeButton.textContent = '–';
        Object.assign(removeButton.style, {
             padding: '5px 10px', backgroundColor: '#555', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', height: '100%'
        });
        removeButton.onclick = () => {
            conditionRow.remove();
            updateLogicalOpVisibility(conditionsContainer.parentElement);
        };
        removeBtnDiv.appendChild(removeButton);
        conditionRow.appendChild(removeBtnDiv);
    } else {
        // Add a placeholder for alignment
        const placeholder = document.createElement('div');
        placeholder.style.flex = '0 0 auto';
        placeholder.style.width = '30px'; // Approx width of button
        conditionRow.appendChild(placeholder);
    }
    
    conditionsContainer.appendChild(conditionRow);
    
    // Populate the newly added column dropdown
    const newColumnSelect = colDiv.querySelector('.sed-range-column-select');
    populateSedColumnDropdown(newColumnSelect, catalogName);

    updateLogicalOpVisibility(conditionsContainer.parentElement);
}


function populateSedFlagDropdown() {
    const catalogName = document.getElementById('sed-catalog-select').value;
    const flagSelect = document.getElementById('sed-flag-select');
    flagSelect.innerHTML = '<option>Loading flags...</option>';

    if (!catalogName) {
        flagSelect.innerHTML = '<option>Select a catalog first</option>';
        return;
    }

    // IMPORTANT: /catalog-with-flags expects an API catalog name (basename), not "catalogs/<file>"
    const apiName = String(catalogName || '').split('/').pop().split('\\').pop();
    apiFetch(`/catalog-with-flags/${encodeURIComponent(apiName)}?prevent_auto_load=true`)
        .then(response => {
            if (!response.ok) {
                return response.text().then(text => { 
                    throw new Error(`Failed to load catalog flags: ${text}`);
                });
            }
            return response.json();
        })
        .then(data => {
            flagSelect.innerHTML = '';
            const flags = data.boolean_columns || (data.dropdownContent ? data.dropdownContent.flag_columns : []);
            
            if (flags && flags.length > 0) {
                flags.forEach(flag => {
                    const option = document.createElement('option');
                    option.value = flag;
                    option.textContent = flag;
                    flagSelect.appendChild(option);
                });
            } else {
                flagSelect.innerHTML = '<option>No flags available</option>';
            }
        })
        .catch(error => {
            console.error('Error fetching flag columns:', error);
            flagSelect.innerHTML = `<option>Error loading flags</option>`;
            showNotification(error.message, 3000, 'error');
        });
}


function dispatchSedSearch() {
    const searchType = document.querySelector('input[name="search-type"]:checked').value;
    if (searchType === 'nearby') {
        performSedSearch();
    } else if (searchType === 'flag') {
        performFlagSearch();
    } else if (searchType === 'range') {
        performRangeSearch();
    }
}




// Replace the isKnownStringColumn function in plotter.js with this improved version:

function isKnownStringColumn(columnName) {
    const stringColumnIndicators = [
        'galaxy', 'name', 'object', 'target', 'source', 'id', 'identifier', 
        'designation', 'catalog', 'class', 'type', 'field', 'region', 'group'
    ];
    
    const lowerColumnName = columnName.toLowerCase();
    return stringColumnIndicators.some(indicator => 
        lowerColumnName.includes(indicator) || lowerColumnName === indicator
    );
}

// Replace the detectStringColumns function with this improved version:
function detectStringColumns(catalogName) {
    if (!catalogName) {
        return Promise.resolve([]);
    }

    // First check for known string columns by name
    return apiFetch(`/catalog-columns/?catalog_name=${encodeURIComponent(catalogName)}`)
        .then(response => {
            if (!response.ok) {
                console.warn('Failed to load catalog columns for string detection');
                return [];
            }
            return response.json();
        })
        .then(data => {
            const allColumns = data.columns || [];
            const knownStringColumns = allColumns.filter(col => isKnownStringColumn(col));
            
            if (knownStringColumns.length > 0) {
                console.log(`Detected known string columns by name: ${knownStringColumns.join(', ')}`);
                return knownStringColumns;
            }
            
            // If no known string columns, try loading sample data
            const apiName = (catalogName || '').toString().split('/').pop().split('\\').pop();
            const persisted = (window.catalogOverridesByCatalog && (
                window.catalogOverridesByCatalog[catalogName] ||
                window.catalogOverridesByCatalog[apiName]
            )) || null;
            const raCol = persisted && persisted.ra_col ? persisted.ra_col : 'ra';
            const decCol = persisted && persisted.dec_col ? persisted.dec_col : 'dec';
            const sizeCol = persisted && persisted.size_col ? persisted.size_col : null;
            const urlParams = new URLSearchParams();
            if (raCol) urlParams.set('ra_col', raCol);
            if (decCol) urlParams.set('dec_col', decCol);
            if (sizeCol) urlParams.set('size_col', sizeCol);
            const headers = {};
            if (raCol) headers['X-RA-Col'] = raCol;
            if (decCol) headers['X-DEC-Col'] = decCol;
            if (sizeCol) headers['X-Size-Col'] = sizeCol;
            const suffix = urlParams.toString() ? `?${urlParams.toString()}` : '';
            return apiFetch(`/plotter/load-catalog/${encodeURIComponent(apiName)}${suffix}`, { headers })
                .then(response => {
                    if (!response.ok) {
                        console.warn('Failed to load catalog sample for string detection');
                        return [];
                    }
                    return response.json();
                })
                .then(catalogData => {
                    if (!catalogData || catalogData.length === 0) {
                        return [];
                    }

                    // Take a sample of objects to analyze
                    const sampleSize = Math.min(10, catalogData.length);
                    const stringColumns = new Set();

                    // Analyze the first few objects to determine column types
                    for (let i = 0; i < sampleSize; i++) {
                        const obj = catalogData[i];
                        if (!obj) continue;

                        Object.entries(obj).forEach(([key, value]) => {
                            // Skip internal properties
                            if (key.startsWith('_')) return;

                            // Check if value is a string (and not a stringified number)
                            if (typeof value === 'string' && value.trim() !== '') {
                                // Try to parse as number - if it fails, it's likely a true string
                                const numValue = parseFloat(value);
                                if (isNaN(numValue) || value.includes(' ') || /[a-zA-Z]/.test(value)) {
                                    stringColumns.add(key);
                                }
                            }
                        });
                    }

                    return Array.from(stringColumns);
                })
                .catch(error => {
                    console.warn('Error detecting string columns from sample data:', error);
                    return [];
                });
        })
        .catch(error => {
            console.warn('Error detecting string columns:', error);
            return [];
        });
}

// Replace the populateSedColumnDropdown function with this improved version:
function populateSedColumnDropdown(columnSelectElement, catalogName) {
    const columnSelect = columnSelectElement;
    columnSelect.innerHTML = '<option>Loading...</option>';

    if (!catalogName) {
        columnSelect.innerHTML = '<option>Select catalog</option>';
        return;
    }

    // First get all columns
    apiFetch(`/catalog-columns/?catalog_name=${encodeURIComponent(catalogName)}`)
        .then(response => {
            if (!response.ok) {
                return response.text().then(text => { 
                    throw new Error(`Failed to load catalog columns: ${text}`);
                });
            }
            return response.json();
        })
        .then(data => {
            const allColumns = data.columns;
            
            if (!allColumns || allColumns.length === 0) {
                columnSelect.innerHTML = '<option>No columns available</option>';
                return;
            }

            // Get column type information
            Promise.all([
                detectBooleanColumns(catalogName),
                detectStringColumns(catalogName)
            ]).then(([booleanColumns, stringColumns]) => {
                columnSelect.innerHTML = '';

                // Prioritize and annotate RA/DEC candidates in the dropdown
                const RA_CANDIDATES = [
                    'PHANGS_RA','XCTR_DEG','cen_ra','CEN_RA','RA','ra','Ra','RightAscension','right_ascension','raj2000','RAJ2000'
                ];
                const DEC_CANDIDATES = [
                    'PHANGS_DEC','YCTR_DEG','cen_dec','CEN_DEC','DEC','dec','Dec','Declination','declination','DECLINATION','decj2000','DECJ2000','dej2000','DEJ2000'
                ];
                const lowerMap = new Map(allColumns.map(c => [String(c).toLowerCase(), c]));
                const resolveMany = (arr) => {
                    const seen = new Set();
                    const out = [];
                    for (const key of arr) {
                        const m = lowerMap.get(key.toLowerCase());
                        if (m && !seen.has(m)) { seen.add(m); out.push(m); }
                    }
                    return out;
                };
                const raResolved = resolveMany(RA_CANDIDATES);
                const decResolved = resolveMany(DEC_CANDIDATES);
                const raSet = new Set(raResolved);
                const decSet = new Set(decResolved);
                const others = allColumns.filter(c => !(raSet.has(c) || decSet.has(c)));
                const orderedColumns = [...raResolved, ...decResolved, ...others];

                orderedColumns.forEach(colName => {
                    const option = document.createElement('option');
                    option.value = colName;
                    const isRa = raSet.has(colName);
                    const isDec = decSet.has(colName);
                    const baseLabel = isRa ? `${colName} (RA)` : isDec ? `${colName} (DEC)` : colName;
                    option.textContent = baseLabel;
                    
                    // Determine column type - prioritize known string columns
                    if (booleanColumns && booleanColumns.includes && booleanColumns.includes(colName)) {
                        option.setAttribute('data-column-type', 'boolean');
                        option.textContent = `${baseLabel} (boolean)`;
                    } else if (isKnownStringColumn(colName)) {
                        // PRIORITY: Known string columns like 'galaxy', 'name', etc.
                        option.setAttribute('data-column-type', 'string');
                        option.textContent = `${baseLabel} (text)`;
                        console.log(`Marked ${colName} as string column by name pattern`);
                    } else if ((stringColumns && stringColumns.includes && stringColumns.includes(colName))) {
                        option.setAttribute('data-column-type', 'string');
                        option.textContent = `${baseLabel} (text)`;
                    } else {
                        option.setAttribute('data-column-type', 'general');
                    }
                    
                    columnSelect.appendChild(option);
                });

                // Add event listener to handle column selection change
                columnSelect.removeEventListener('change', handleColumnSelectionChange);
                columnSelect.addEventListener('change', handleColumnSelectionChange);
                
                // IMPORTANT: If the first option is selected and it's a known string column, trigger the change event
                if (columnSelect.options.length > 0) {
                    const firstOption = columnSelect.options[0];
                    if (firstOption.getAttribute('data-column-type') === 'string') {
                        console.log(`Auto-triggering string column setup for first option: ${firstOption.value}`);
                        // Trigger the change event to set up the UI correctly
                        const changeEvent = new Event('change');
                        columnSelect.dispatchEvent(changeEvent);
                    }
                }
            }).catch(error => {
                console.error('Error in Promise.all for column type detection:', error);
                // Fallback: just populate with all columns, but prioritize known string columns
                columnSelect.innerHTML = '';
                allColumns.forEach(colName => {
                    const option = document.createElement('option');
                    option.value = colName;
                    option.textContent = colName;
                    
                    // At minimum, detect known string columns
                    if (isKnownStringColumn(colName)) {
                        option.setAttribute('data-column-type', 'string');
                        option.textContent = `${colName} (text)`;
                        console.log(`Fallback: Marked ${colName} as string column by name pattern`);
                    } else {
                        option.setAttribute('data-column-type', 'general');
                    }
                    columnSelect.appendChild(option);
                });
                
                columnSelect.removeEventListener('change', handleColumnSelectionChange);
                columnSelect.addEventListener('change', handleColumnSelectionChange);
                
                // IMPORTANT: Auto-trigger for known string columns even in fallback
                if (columnSelect.options.length > 0) {
                    const firstOption = columnSelect.options[0];
                    if (firstOption.getAttribute('data-column-type') === 'string') {
                        console.log(`Fallback: Auto-triggering string column setup for first option: ${firstOption.value}`);
                        const changeEvent = new Event('change');
                        columnSelect.dispatchEvent(changeEvent);
                    }
                }
            });
        })
        .catch(error => {
            console.error('Error fetching columns:', error);
            columnSelect.innerHTML = `<option>Error loading columns</option>`;
            showNotification(error.message, 3000, 'error');
        });
}
// Enhanced function to handle column selection with better string column detection
function handleColumnSelectionChange(event) {
    const columnSelect = event.target;
    const selectedOption = columnSelect.options[columnSelect.selectedIndex];
    const columnType = selectedOption ? selectedOption.getAttribute('data-column-type') : 'general';
    const columnName = columnSelect.value;
    
    // Find the corresponding containers in the same row
    const conditionRow = columnSelect.closest('.sed-range-condition-row');
    if (!conditionRow) return;
    
    const operatorSelect = conditionRow.querySelector('.sed-range-operator-select');
    const valueContainer = conditionRow.querySelector('.sed-range-value-container') || 
                          conditionRow.children[2]; // Third child is the value div
    
    if (!valueContainer || !operatorSelect) return;

    // Clear the existing input
    valueContainer.innerHTML = '';
    
    // Double-check if this is a known string column (override detected type if needed)
    const isStringColumn = columnType === 'string' || columnType === 'boolean' || isKnownStringColumn(columnName);
    
    if (columnType === 'boolean') {
        // Boolean columns: only == operator, true/false dropdown
        operatorSelect.innerHTML = '<option value="==">=</option>';
        
        const booleanSelect = document.createElement('select');
        booleanSelect.className = 'sed-range-value-input';
        Object.assign(booleanSelect.style, {
            width: '100%',
            padding: '8px',
            backgroundColor: '#333',
            color: 'white',
            border: '1px solid #555',
            borderRadius: '4px'
        });
        
        const trueOption = document.createElement('option');
        trueOption.value = 'true';
        trueOption.textContent = 'True';
        
        const falseOption = document.createElement('option');
        falseOption.value = 'false';
        falseOption.textContent = 'False';
        
        booleanSelect.appendChild(trueOption);
        booleanSelect.appendChild(falseOption);
        valueContainer.appendChild(booleanSelect);
        
    } else if (isStringColumn) {
        // Known string columns: only == and != operators
        operatorSelect.innerHTML = `
            <option value="==">=</option>
            <option value="!=">!=</option>
        `;
        
        const textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.className = 'sed-range-value-input';
        textInput.placeholder = `Enter ${columnName.toLowerCase()} name (e.g., ngc0628)`;
        Object.assign(textInput.style, {
            width: '100%',
            padding: '8px',
            backgroundColor: '#333',
            color: 'white',
            border: '1px solid #555',
            borderRadius: '4px'
        });
        
        valueContainer.appendChild(textInput);
        
        // Add helper text for string columns
        const helperText = document.createElement('div');
        helperText.className = 'helper-text';
        helperText.style.fontSize = '11px';
        helperText.style.color = '#4CAF50';
        helperText.style.marginTop = '2px';
        helperText.textContent = `✓ Text column: use == or != operators`;
        
        valueContainer.appendChild(helperText);
        
    } else {
        // General columns: all operators, text input that accepts both text and numbers
        operatorSelect.innerHTML = `
            <option value=">">&gt;</option>
            <option value="<">&lt;</option>
            <option value=">=">&ge;</option>
            <option value="<=">&le;</option>
            <option value="==">=</option>
            <option value="!=">!=</option>
        `;
        
        const textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.className = 'sed-range-value-input';
        textInput.placeholder = 'Enter value (text or number)';
        Object.assign(textInput.style, {
            width: '100%',
            padding: '8px',
            backgroundColor: '#333',
            color: 'white',
            border: '1px solid #555',
            borderRadius: '4px'
        });
        
        // Add real-time validation for general columns
        textInput.addEventListener('input', function() {
            validateValueInput(this, operatorSelect, 'general');
        });
        
        valueContainer.appendChild(textInput);
        
        // Add helper text for guidance
        const helperText = document.createElement('div');
        helperText.className = 'helper-text';
        helperText.style.fontSize = '11px';
        helperText.style.color = '#888';
        helperText.style.marginTop = '2px';
        helperText.textContent = 'Numbers: >, <, >=, <=, ==, !=; Text: == or != only';
        
        valueContainer.appendChild(helperText);
        
        // Add event listener to operator select for validation
        operatorSelect.addEventListener('change', function() {
            validateValueInput(textInput, this, 'general');
        });
    }
}

// Function to validate value input in real-time
function validateValueInput(valueInput, operatorSelect, columnType) {
    // Guard against cases where the input node was removed/replaced (e.g., after changing column)
    if (!valueInput || !valueInput.parentElement) return;
    const value = valueInput.value.trim();
    const operator = operatorSelect.value;
    const helperText = valueInput.parentElement.querySelector('.helper-text');
    
    if (!value || !operator || !helperText) return;
    
    const isNumericValue = !isNaN(parseFloat(value)) && isFinite(parseFloat(value)) && !/[a-zA-Z]/.test(value);
    
    // Reset styling
    valueInput.style.borderColor = '#555';
    helperText.style.color = '#888';
    
    // Check for invalid combinations
    if (['>', '<', '>=', '<='].includes(operator) && !isNumericValue) {
        valueInput.style.borderColor = '#ff6b6b';
        helperText.style.color = '#ff6b6b';
        helperText.textContent = `⚠ Operator '${operator}' requires a numeric value`;
    } else {
        // Valid combination
        valueInput.style.borderColor = '#4CAF50';
        helperText.style.color = '#4CAF50';
        
        if (columnType === 'string') {
            helperText.textContent = '';
        } else if (isNumericValue) {
            helperText.textContent = '';
        } else {
            helperText.textContent = '';
        }
    }
}

// Updated performRangeSearch function with all values sent as strings
function performRangeSearch() {
    console.log("performRangeSearch triggered for multiple conditions.");
    const catalog = document.getElementById('sed-catalog-select').value;
    const conditionRows = document.querySelectorAll('.sed-range-condition-row');
    const resultsContainer = document.getElementById('sed-results-container');
    
    const conditions = [];
    let validationFailed = false;
    let validationErrors = [];
    
    conditionRows.forEach((row, rowIndex) => {
        const columnSelect = row.querySelector('.sed-range-column-select');
        const operatorSelect = row.querySelector('.sed-range-operator-select');
        const valueInput = row.querySelector('.sed-range-value-input');
        
        const column = columnSelect.value;
        const operator = operatorSelect.value;
        let value = valueInput.value;

        // Check if this is a boolean column
        const selectedOption = columnSelect.options[columnSelect.selectedIndex];
        const columnType = selectedOption ? selectedOption.getAttribute('data-column-type') : 'general';

        if (!column || !operator || value === '' || column.startsWith('Select') || column.startsWith('No') || column.startsWith('Error')) {
            validationFailed = true;
            validationErrors.push(`Row ${rowIndex + 1}: Please fill in all fields`);
            return;
        }

        // Validate based on column type and value
        if (columnType === 'boolean') {
            // For boolean columns, ensure value is 'true' or 'false'
            if (!['true', 'false'].includes(value)) {
                validationFailed = true;
                validationErrors.push(`Row ${rowIndex + 1}: Boolean column requires true/false value`);
                return;
            }
            
            if (operator !== '==') {
                validationFailed = true;
                validationErrors.push(`Row ${rowIndex + 1}: Boolean columns only support '==' operator`);
                return;
            }
        } else {
            // For all other columns, validate based on the operator and value
            value = value.trim();
            if (value === '') {
                validationFailed = true;
                validationErrors.push(`Row ${rowIndex + 1}: Please enter a value`);
                return;
            }
            
            // Check if the value looks like a number
            const isNumericValue = !isNaN(parseFloat(value)) && isFinite(parseFloat(value)) && !/[a-zA-Z]/.test(value);
            
            // For numeric operators, the value should be numeric
            if (['>', '<', '>=', '<='].includes(operator)) {
                if (!isNumericValue) {
                    validationFailed = true;
                    validationErrors.push(`Row ${rowIndex + 1}: Operator '${operator}' requires a numeric value, but got '${value}'. Use '==' or '!=' for text values.`);
                    return;
                }
            }
        }

        // Always send value as string - let backend handle conversion
        conditions.push({ column_name: column, operator, value: String(value) });
    });

    if (validationFailed) {
        const errorMessage = validationErrors.join('\n');
        showNotification(errorMessage, 5000, 'error');
        console.error('Validation errors:', validationErrors);
        return;
    }
    
    if (conditions.length === 0) {
        showNotification('Please add at least one search condition.', 3000, 'warning');
        return;
    }

    const logicalOperator = document.querySelector('input[name="sed-range-logical-op"]:checked')?.value || 'AND';

    resultsContainer.innerHTML = '<div style="text-align: center; color: #aaa;">Searching by range...</div>';

    const requestBody = {
        catalog_name: catalog,
        conditions: conditions,
        logical_operator: logicalOperator
    };

    console.log("Fetching with POST, body:", requestBody);

    apiFetch('/range-search/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
    })
        .then(async response => {
            if (!response.ok) {
                const errorText = await response.text();
                try {
                    const errorJson = JSON.parse(errorText);
                    throw new Error(errorJson.detail || `Server error: ${response.status}`);
                } catch (e) {
                    if (e.message.includes('detail')) {
                        throw e; // Re-throw our custom error message
                    }
                    throw new Error(errorText || `Server error: ${response.status}`);
                }
            }
            return response.json();
        })
        .then(data => {
            if (data.sources) {
                displaySedResults(data.sources, catalog);
            } else {
                displaySedResults([], catalog);
            }
        })
        .catch(error => {
            console.error('Error during range search:', error);
            let errorMessage = error.message;
            
            resultsContainer.innerHTML = `<div style="text-align: center; color: #ff6b6b;">Search failed: ${errorMessage}</div>`;
            showNotification(`Search Error: ${errorMessage}`, 5000, 'error');
        });
}



function performFlagSearch() {
    console.log("performFlagSearch triggered.");
    const catalog = document.getElementById('sed-catalog-select').value;
    const flagColumn = document.getElementById('sed-flag-select').value;

    if (!catalog || !flagColumn || flagColumn === 'No flags available' || flagColumn === 'Error loading flags') {
        showNotification('Please select a catalog and a valid flag.', 3000, 'warning');
        console.error("Validation failed: Invalid catalog or flag selected.");
        return;
    }

    const resultsContainer = document.getElementById('sed-results-container');
    resultsContainer.innerHTML = '<div style="text-align: center; color: #aaa;">Searching by flag...</div>';

    const url = `/flag-search/?catalog_name=${encodeURIComponent(catalog)}&flag_column=${encodeURIComponent(flagColumn)}`;
    console.log("Fetching URL:", url);

    apiFetch(url)
        .then(async response => {
            if (!response.ok) {
                const errorText = await response.text();
                try {
                    const errorJson = JSON.parse(errorText);
                    throw new Error(errorJson.detail || `Server error: ${response.status}`);
                } catch (e) {
                    throw new Error(errorText || `Server error: ${response.status}`);
                }
            }
            return response.json();
        })
        .then(data => {
            if (data.sources) {
                displaySedResults(data.sources, catalog);
            } else {
                // Handle cases where the key is not 'sources' or data is not as expected
                displaySedResults([], catalog);
            }
        })
        .catch(error => {
            console.error('Error during flag search:', error);
            resultsContainer.innerHTML = `<div style="text-align: center; color: #ff6b6b;">Search failed: ${error.message}</div>`;
            showNotification(`Search Error: ${error.message}`, 4000, 'error');
        });
}


function performSedSearch() {
    console.log("performSedSearch triggered.");
    const catalog = document.getElementById('sed-catalog-select').value;
    const ra = document.getElementById('sed-ra-input').value;
    const dec = document.getElementById('sed-dec-input').value;
    const radius = document.getElementById('sed-radius-input').value;

    console.log("Search Parameters:", { catalog, ra, dec, radius });

    if (!catalog || !ra || !dec || !radius) {
        showNotification('Please fill in all search fields.', 3000, 'warning');
        console.error("Validation failed: One or more search fields are empty.");
        return;
    }

    const resultsContainer = document.getElementById('sed-results-container');
    Object.assign(resultsContainer.style, {
        scrollbarWidth: 'none', // Firefox
        msOverflowStyle: 'none'  // IE/Edge
    });
    
    // Hide scrollbar for WebKit browsers (Chrome, Safari)
    const styleElement = document.createElement('style');
    styleElement.textContent = `
        #sed-results-container::-webkit-scrollbar {
            display: none;
        }
    `;
    if (!document.querySelector('style[data-sed-scrollbar]')) {
        styleElement.setAttribute('data-sed-scrollbar', 'true');
        document.head.appendChild(styleElement);
    }
    resultsContainer.innerHTML = '<div style="text-align: center; color: #aaa;">Searching...</div>';

    const url = `/cone-search/?ra=${ra}&dec=${dec}&radius=${radius}&catalog_name=${encodeURIComponent(catalog)}`;
    console.log("Fetching URL:", url);

    apiFetch(url)
        .then(response => {
            console.log("Received response from server:", response);
            if (!response.ok) {
                console.error("Server response was not OK.", response.status, response.statusText);
                return response.json().then(err => { 
                    // Try to parse the error detail from the server response
                    const errorMessage = err.detail || `Server returned status ${response.status}`;
                    throw new Error(errorMessage);
                });
            }
            return response.json();
        })
        .then(data => {
            console.log("Parsed JSON data from server:", data);
            if (data.error) {
                throw new Error(data.error);
            }
            displaySedResults(data.sources, catalog);
        })
        .catch(error => {
            console.error("An error occurred during the search fetch:", error);
            resultsContainer.innerHTML = `<div style="color: #ff6b6b; text-align: center;">Error: ${error.message}</div>`;
            showNotification(`Search Error: ${error.message}`, 4000, 'error');
        });
}

let fullSedSources = [];
let displayedSedSourcesCount = 0;
const SED_PAGE_SIZE = 100;

function displaySedResults(sources, catalogName) {
    const resultsContainer = document.getElementById('sed-results-container');
    if (!resultsContainer) {
        console.error("SED results container not found!");
        return;
    }
    resultsContainer.innerHTML = ''; // Clear previous results

    fullSedSources = sources || [];
    displayedSedSourcesCount = 0;

    if (fullSedSources.length === 0) {
        resultsContainer.innerHTML = '<div style="text-align: center; color: #aaa; padding: 20px;">No sources found.</div>';
        return;
    }

    appendSedResults(catalogName);
}

function appendSedResults(catalogName) {
    const resultsContainer = document.getElementById('sed-results-container');
    if (!resultsContainer) return;

    // Find or create the list container
    let list = resultsContainer.querySelector('.sed-results-list');
    if (!list) {
        list = document.createElement('div');
        list.className = 'sed-results-list';
        resultsContainer.appendChild(list);
    }

    const startIndex = displayedSedSourcesCount;
    const endIndex = Math.min(startIndex + SED_PAGE_SIZE, fullSedSources.length);
    const sourcesToAppend = fullSedSources.slice(startIndex, endIndex);

    sourcesToAppend.forEach((source, index) => {
        const globalIndex = startIndex + index;
        const listItem = document.createElement('div');
        listItem.className = 'sed-result-item';
        Object.assign(listItem.style, {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px',
            marginBottom: '5px',
            borderRadius: '4px',
            backgroundColor: '#444',
            cursor: 'pointer',
            transition: 'background-color 0.2s',
        });
        
        listItem.classList.add('sed-result-item-fade-in');
        listItem.style.animationDelay = `${globalIndex * 0.02}s`; // Faster animation for many items

        listItem.onmouseover = () => listItem.style.backgroundColor = '#555';
        listItem.onmouseout = () => listItem.style.backgroundColor = '#444';

        const leftDiv = document.createElement('div');
        leftDiv.style.flex = '1';

        let sourceName = source.Name || source.NAME || source.name || source.ID || source.id || `Source #${globalIndex + 1}`;
        // Normalize RA/DEC from multiple possible column names
        const sourceRa = source.ra ?? source.RA ?? source.Ra ?? source.cen_ra ?? source.CEN_RA ?? source.PHANGS_RA ?? source.raj2000 ?? source.RAJ2000 ?? source.XCTR_DEG;
        const sourceDec = source.dec ?? source.DEC ?? source.Dec ?? source.cen_dec ?? source.CEN_DEC ?? source.PHANGS_DEC ?? source.dej2000 ?? source.DECJ2000 ?? source.YCTR_DEG;
        // Derive galaxy name from common columns; fallback to parsing from catalog filename
        let galaxyName = (source.galaxy || source.GALAXY || source.PHANGS_GALAXY || source.gal_name || source.galaxy_name || source.object_name || source.obj_name || source.target || '').toString();
        if (!galaxyName) {
            try {
                const base = (catalogName || '').toString().split('/').pop().toLowerCase();
                const m = base.match(/(?<![a-z0-9])(ngc|ic|m|ugc|eso|pgc|arp)\s*0*(\d+)[a-z]*?(?=[^a-z0-9]|$)/i);
                if (m) {
                    const prefix = m[1].toLowerCase();
                    const digits = m[2];
                    if (prefix === 'ngc' || prefix === 'ic') galaxyName = `${prefix.toUpperCase()}${digits.padStart(4,'0')}`;
                    else if (prefix === 'm') galaxyName = `M${digits}`;
                    else galaxyName = `${prefix.toUpperCase()}${digits}`;
                }
            } catch(_) {}
        }

        const nameDiv = document.createElement('div');
        nameDiv.innerHTML = `<strong>${sourceName}</strong>`;

        const infoDiv = document.createElement('div');
        Object.assign(infoDiv.style, { fontSize: '12px', color: '#ccc', marginTop: '4px' });
        
        let infoHtml = `RA: ${typeof sourceRa === 'number' ? sourceRa.toFixed(6) : sourceRa}, Dec: ${typeof sourceDec === 'number' ? sourceDec.toFixed(6) : sourceDec}`;
        if(source.distance_arcsec !== undefined) {
            infoHtml += `<br>Distance: ${source.distance_arcsec.toFixed(2)}"`;
        }
        infoDiv.innerHTML = infoHtml;

        leftDiv.appendChild(nameDiv);
        leftDiv.appendChild(infoDiv);

        const buttonDiv = document.createElement('div');
        Object.assign(buttonDiv.style, { 
            display: 'flex', 
            gap: '5px',
            marginLeft: '15px',
            flexShrink: '0'
        });

        const sedButton = document.createElement('button');
        sedButton.textContent = 'SED';
        Object.assign(sedButton.style, { padding: '5px 8px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '11px' });
        sedButton.dataset.ra = sourceRa;
        sedButton.dataset.dec = sourceDec;
        sedButton.dataset.catalog = catalogName;
        sedButton.dataset.galaxy = galaxyName;
        sedButton.onclick = (e) => { e.stopPropagation(); window.showSed?.(sedButton.dataset.ra, sedButton.dataset.dec, sedButton.dataset.catalog, sedButton.dataset.galaxy); };

        const rgbButton = document.createElement('button');
        rgbButton.textContent = 'RGB';
        Object.assign(rgbButton.style, { padding: '5px 8px', backgroundColor: '#FF9800', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '11px' });
        rgbButton.dataset.ra = sourceRa;
        rgbButton.dataset.dec = sourceDec;
        rgbButton.dataset.catalog = catalogName;
        rgbButton.dataset.name = sourceName;
        rgbButton.dataset.galaxy = galaxyName;
        rgbButton.onclick = (e) => { e.stopPropagation(); window.fetchRgbCutouts?.(rgbButton.dataset.ra, rgbButton.dataset.dec, rgbButton.dataset.catalog, rgbButton.dataset.galaxy); };

        const propertiesButton = document.createElement('button');
        propertiesButton.textContent = 'Props';
        Object.assign(propertiesButton.style, { padding: '5px 8px', backgroundColor: '#2196f3', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '11px' });
        propertiesButton.dataset.ra = sourceRa;
        propertiesButton.dataset.dec = sourceDec;
        propertiesButton.dataset.catalog = catalogName;
        propertiesButton.onclick = (e) => { e.stopPropagation(); window.showProperties?.(sourceRa, sourceDec, window.currentCatalogName || catalogName); };

        buttonDiv.appendChild(sedButton);
        buttonDiv.appendChild(rgbButton);
        buttonDiv.appendChild(propertiesButton);
        listItem.appendChild(leftDiv);
        listItem.appendChild(buttonDiv);
        list.appendChild(listItem);
    });

    displayedSedSourcesCount = endIndex;

    const existingButton = resultsContainer.querySelector('.load-more-btn');
    if (existingButton) {
        existingButton.remove();
    }

    if (displayedSedSourcesCount < fullSedSources.length) {
        const loadMoreButton = document.createElement('button');
        const remaining = fullSedSources.length - displayedSedSourcesCount;
        loadMoreButton.textContent = `Load ${Math.min(SED_PAGE_SIZE, remaining)} more (${remaining} remaining)`;
        loadMoreButton.className = 'load-more-btn';
        Object.assign(loadMoreButton.style, {
            display: 'block',
            width: 'calc(100% - 20px)',
            margin: '10px',
            padding: '10px',
            backgroundColor: '#3a3a3a',
            color: 'white',
            border: '1px solid #555',
            borderRadius: '4px',
            cursor: 'pointer'
        });
        loadMoreButton.onclick = () => appendSedResults(catalogName);
        resultsContainer.appendChild(loadMoreButton);
    }
}


// Initialize plotter functionality when the DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // DO NOT Populate dropdowns here either
    // populateAxisDropdowns();

    // Add event listeners for plotter controls if they exist
    // (This assumes controls are part of the initial HTML or added before this listener runs)
    const plotTypeSelect = document.getElementById('plot-type-select');
    if (plotTypeSelect) {
        plotTypeSelect.addEventListener('change', () => {
            // Handle plot type change (e.g., show/hide relevant controls)
        });
    }

    const generatePlotButton = document.getElementById('generate-plot-button');
    if (generatePlotButton) {
        generatePlotButton.addEventListener('click', () => {
             const plotType = document.getElementById('plot-type-select')?.value;
             if (plotType === 'histogram') {
                 generateHistogram();
             } else {
                 generatePlot(); // Assuming scatter plot is the other main type
             }
        });
    }
    
    // You might want to add other listeners here for sliders, color pickers etc.
    // Example:
    const binsSlider = document.getElementById('bins-slider');
    const binsValue = document.getElementById('bins-value');
    if (binsSlider && binsValue) {
         binsSlider.addEventListener('input', () => {
             binsValue.textContent = binsSlider.value;
         });
         // Set initial value
         binsValue.textContent = binsSlider.value;
    }

    // Add listener for auto/manual limits checkbox
    const autoLimitsCheckbox = document.getElementById('auto-limits-checkbox');
    const manualLimitsContainer = document.getElementById('manual-limits-container');
    if (autoLimitsCheckbox && manualLimitsContainer) {
        autoLimitsCheckbox.addEventListener('change', () => {
            manualLimitsContainer.style.display = autoLimitsCheckbox.checked ? 'none' : 'block';
        });
        // Set initial state
        manualLimitsContainer.style.display = autoLimitsCheckbox.checked ? 'none' : 'block';
    }

    // When catalog changes globally, refresh plotter availability/status
    const __plotterOnCatalogChangedOrUpdated = ()=>{
        if (typeof window.updatePlotterAvailability==='function') window.updatePlotterAvailability();
        // If plotter is open, repopulate dropdowns after catalog change
        if (document.getElementById('dynamic-plotter-panel')) {
            try { window.sourcePropertiesData = null; } catch(_) {}
            try { window.plotterColumnSampleData = null; } catch(_) {}
            // Clear current plot so next Generate uses the updated catalog
            try {
                const plotArea = document.getElementById('plot-area');
                if (plotArea) {
                    plotArea.innerHTML = 'Select X and Y axes to generate a plot';
                }
                const saveBtn = document.getElementById('save-plot-button');
                if (saveBtn) saveBtn.style.display = 'none';
                if (window.highlightedScatterCircle) {
                    try {
                        window.highlightedScatterCircle.setAttribute('stroke', '#333');
                        window.highlightedScatterCircle.setAttribute('stroke-width', '1');
                    } catch (_) {}
                    window.highlightedScatterCircle = null;
                }
                // Reset axis selections so user selects valid fields for new catalog
                const xSel = document.getElementById('x-axis-select');
                const ySel = document.getElementById('y-axis-select');
                const cSel = document.getElementById('color-axis-select');
                const xInp = document.getElementById('x-axis-search');
                const yInp = document.getElementById('y-axis-search');
                const cInp = document.getElementById('color-axis-search');
                if (xSel) xSel.value = '';
                if (ySel) ySel.value = '';
                if (cSel) cSel.value = '';
                if (xInp) xInp.value = '';
                if (yInp) yInp.value = '';
                if (cInp) cInp.value = '';
            } catch(_) {}
            setTimeout(()=>{ try { populateAxisDropdowns(); } catch(_) {} }, 0);
            // Also refresh boolean column list for new catalog
            try {
                const boolSelect = document.getElementById('boolean-filter-column-select');
                const search = document.getElementById('boolean-filter-search');
                const dropdown = document.getElementById('boolean-filter-dropdown');
                const catalogSelectEl = document.getElementById('catalog-select');
                const selectedCatalog = catalogSelectEl ? catalogSelectEl.value : null;
                const catalogToUse =
                    selectedCatalog ||
                    window.plotterSelectedCatalogName ||
                    window.currentCatalogName ||
                    window.activeCatalog ||
                    (typeof activeCatalog !== 'undefined' ? activeCatalog : null);
                if (boolSelect && catalogToUse) {
                    detectBooleanColumns(catalogToUse).then(cols => {
                        // Reset options (keep 'None')
                        for (let i = boolSelect.options.length - 1; i >= 1; i--) boolSelect.remove(i);
                        if (dropdown) {
                            while (dropdown.firstChild) dropdown.removeChild(dropdown.firstChild);
                            // Add 'None' visual item
                            const noneItem = document.createElement('div');
                            noneItem.className = 'dropdown-item';
                            noneItem.textContent = 'None';
                            noneItem.style.padding = '8px';
                            noneItem.style.cursor = 'pointer';
                            noneItem.style.borderBottom = '1px solid #444';
                            noneItem.style.transition = 'background-color 0.2s';
                            noneItem.addEventListener('mouseover', function(){ this.style.backgroundColor = '#444'; });
                            noneItem.addEventListener('mouseout', function(){ this.style.backgroundColor = 'transparent'; });
                            noneItem.addEventListener('click', function(){
                                const searchEl = document.getElementById('boolean-filter-search');
                                const selectEl = document.getElementById('boolean-filter-column-select');
                                const dd = document.getElementById('boolean-filter-dropdown');
                                const valWrap = document.getElementById('boolean-filter-value-wrap');
                                if (searchEl) searchEl.value = '';
                                if (selectEl) selectEl.value = '';
                                if (valWrap) valWrap.style.display = 'none';
                                if (dd) dd.style.display = 'none';
                            });
                            dropdown.appendChild(noneItem);
                        }
                        (cols || []).forEach(c => {
                            // hidden select option
                            const o = document.createElement('option');
                            o.value = c; o.textContent = c;
                            boolSelect.appendChild(o);
                            // visual dropdown item
                            if (dropdown) {
                                const item = document.createElement('div');
                                item.className = 'dropdown-item';
                                item.textContent = c;
                                item.style.padding = '8px';
                                item.style.cursor = 'pointer';
                                item.style.borderBottom = '1px solid #444';
                                item.style.transition = 'background-color 0.2s';
                                item.addEventListener('mouseover', function(){ this.style.backgroundColor = '#444'; });
                                item.addEventListener('mouseout', function(){ this.style.backgroundColor = 'transparent'; });
                                item.addEventListener('click', function(){
                                    const searchEl = document.getElementById('boolean-filter-search');
                                    const selectEl = document.getElementById('boolean-filter-column-select');
                                    const dd = document.getElementById('boolean-filter-dropdown');
                                    const valWrap = document.getElementById('boolean-filter-value-wrap');
                                    if (searchEl) searchEl.value = c;
                                    if (selectEl) selectEl.value = c;
                                    if (valWrap) valWrap.style.display = 'block';
                                    if (dd) dd.style.display = 'none';
                                });
                                dropdown.appendChild(item);
                            }
                        });
                        if (search) {
                            search.value = '';
                            // Filtering handled by dropdown list
                        }
                    }).catch(()=>{});
                }
            } catch(_) {}
        }
    };
    window.addEventListener('catalog:changed', __plotterOnCatalogChangedOrUpdated);
    window.addEventListener('catalogs:updated', __plotterOnCatalogChangedOrUpdated);
    
    // Active pane changed (toolbar.js emits this in the top window)
    window.addEventListener('pane:activated', () => {
        try {
            if (document.getElementById('dynamic-plotter-panel')) {
                // If the previously selected catalog isn't available in the newly active pane, reset it.
                try {
                    const paneWin = (typeof window.getActivePaneWindow === 'function') ? (window.getActivePaneWindow() || null) : null;
                    if (paneWin && typeof paneWin.getLoadedCatalogOverlays === 'function') {
                        const entries = paneWin.getLoadedCatalogOverlays() || [];
                        const keys = Array.isArray(entries) ? entries.map(e => String(e && e.key || '')).filter(Boolean) : [];
                        const current = window.plotterSelectedCatalogName ? String(window.plotterSelectedCatalogName) : '';
                        if (current && keys.length && !keys.includes(current)) {
                            window.plotterSelectedCatalogName = null;
                        }
                        if (!window.plotterSelectedCatalogName && keys.length) {
                            window.plotterSelectedCatalogName = keys[keys.length - 1];
                        }
                        // Sync dropdown UI if present
                        const sel = document.getElementById('plotter-catalog-select');
                        if (sel && window.plotterSelectedCatalogName) {
                            sel.value = window.plotterSelectedCatalogName;
                        }
                    }
                } catch (_) {}
                // Reset caches so dropdowns reflect the newly active pane context/catalogs
                try { window.plotterColumnSampleData = null; } catch(_) {}
                try { window.plotterColumnSampleCatalogName = null; } catch(_) {}
                try { window.sourcePropertiesData = null; } catch(_) {}
                try { window.sourcePropertiesCatalogName = null; } catch(_) {}
                // Refresh UI
                try { if (typeof window.updatePlotterContextNote === 'function') window.updatePlotterContextNote(); } catch (_) {}
                try { if (typeof window.updatePlotterAvailability === 'function') window.updatePlotterAvailability(); } catch (_) {}
                setTimeout(()=>{ try { populateAxisDropdowns(); } catch(_) {} }, 0);
            }
        } catch (_) {}
    });

    // When the active pane changes in multi-panel mode, update Plotter's image context and availability.
    // toolbar.js updates window.__activePaneHolder; we hook selection clicks on the grid to refresh.
    try {
        if (!window.__plotterActivePaneListenerInstalled) {
            const refresh = () => {
                try { if (typeof window.updatePlotterContextNote === 'function') window.updatePlotterContextNote(); } catch (_) {}
                try { if (typeof window.updatePlotterAvailability === 'function') window.updatePlotterAvailability(); } catch (_) {}
            };
            document.addEventListener('click', (e) => {
                try {
                    const grid = document.getElementById('multi-panel-grid');
                    if (!grid) return;
                    const t = e && e.target;
                    if (!t || !t.closest) return;
                    if (t.closest('#multi-panel-grid')) {
                        refresh();
                    }
                } catch (_) {}
            }, { capture: true });
            window.__plotterActivePaneListenerInstalled = true;
        }
    } catch (_) {}
    window.addEventListener('fits:imageLoaded', ()=>{
        if (typeof window.updatePlotterAvailability==='function') window.updatePlotterAvailability();
        // If plotter is open, repopulate dropdowns after image load
        if (document.getElementById('dynamic-plotter-panel')) {
            try { window.sourcePropertiesData = null; } catch(_) {}
            // Clear current plot so next Generate uses the updated image+catalog
            try {
                const plotArea = document.getElementById('plot-area');
                if (plotArea) {
                    plotArea.innerHTML = 'Select X and Y axes to generate a plot';
                }
                const saveBtn = document.getElementById('save-plot-button');
                if (saveBtn) saveBtn.style.display = 'none';
                if (window.highlightedScatterCircle) {
                    try {
                        window.highlightedScatterCircle.setAttribute('stroke', '#333');
                        window.highlightedScatterCircle.setAttribute('stroke-width', '1');
                    } catch (_) {}
                    window.highlightedScatterCircle = null;
                }
                // Reset axis selections (image change may affect valid columns)
                const xSel = document.getElementById('x-axis-select');
                const ySel = document.getElementById('y-axis-select');
                const cSel = document.getElementById('color-axis-select');
                const xInp = document.getElementById('x-axis-search');
                const yInp = document.getElementById('y-axis-search');
                const cInp = document.getElementById('color-axis-search');
                if (xSel) xSel.value = '';
                if (ySel) ySel.value = '';
                if (cSel) cSel.value = '';
                if (xInp) xInp.value = '';
                if (yInp) yInp.value = '';
                if (cInp) cInp.value = '';
            } catch(_) {}
            setTimeout(()=>{ try { populateAxisDropdowns(); } catch(_) {} }, 0);
        }
    });
});
// Save the current plot as a high-quality PNG file with white background
function savePlotAsPng() {
    const plotArea = document.getElementById('plot-area');
    const svgElement = plotArea.querySelector('svg');

    if (!svgElement) {
        showNotification('No plot available to save.', 3000, 'warning');
        return;
    }

    // Get plot title for filename, fallback to a default
    const plotTitleInput = document.getElementById('plot-title-input');
    let filename = 'plot.png';
    if (plotTitleInput && plotTitleInput.value) {
        // Sanitize the title to create a valid filename
        filename = `${plotTitleInput.value.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.png`;
    }

    // High DPI scaling factor for better quality
    const dpiScale = 4; // 4x resolution for very high quality

    // Get the actual SVG dimensions from its bounding box
    const svgRect = svgElement.getBoundingClientRect();
    const svgWidth = svgRect.width;
    const svgHeight = svgRect.height;
    
    // Create a canvas with high resolution
    const canvas = document.createElement('canvas');
    canvas.width = svgWidth * dpiScale;
    canvas.height = svgHeight * dpiScale;
    const context = canvas.getContext('2d');
    context.scale(dpiScale, dpiScale);

    // Clone the SVG to modify it for saving
    const svgClone = svgElement.cloneNode(true);
    
    // Ensure the clone has explicit dimensions
    svgClone.setAttribute('width', svgWidth);
    svgClone.setAttribute('height', svgHeight);
    svgClone.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);

    // Recursively copy styles and adjust colors for printing
    function applyPrintStyles(sourceElement, targetElement) {
        // If target is missing, or source is not an element, abort.
        if (!targetElement || sourceElement.nodeType !== Node.ELEMENT_NODE) {
            return;
        }
        
        const computedStyle = window.getComputedStyle(sourceElement);
        
        // Properties to copy
        const styleProps = [
            'fill', 'stroke', 'stroke-width', 'opacity', 
            'font-family', 'font-size', 'font-weight', 'text-anchor'
        ];
        
        styleProps.forEach(prop => {
            targetElement.style[prop] = computedStyle.getPropertyValue(prop);
        });

        // Make text and axes black for visibility on white background
        if (targetElement.tagName === 'text' || targetElement.tagName === 'line' || targetElement.tagName === 'path' || targetElement.tagName === 'tspan') {
            const isPlotContent = sourceElement.closest('.plot-content');
            if (!isPlotContent) {
                 if (targetElement.style.fill !== 'none') {
                    targetElement.style.fill = 'black';
                 }
                 if (targetElement.style.stroke !== 'none') {
                    targetElement.style.stroke = 'black';
                 }
            }
        }

        // Recurse for children
        for (let i = 0; i < sourceElement.children.length; i++) {
            applyPrintStyles(sourceElement.children[i], targetElement.children[i]);
        }
    }

    // First, apply styles, then modify the structure.
    applyPrintStyles(svgElement, svgClone);

    // Add a white background AFTER styles are copied
    const backgroundRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    backgroundRect.setAttribute('width', '100%');
    backgroundRect.setAttribute('height', '100%');
    backgroundRect.setAttribute('fill', 'white');
    svgClone.insertBefore(backgroundRect, svgClone.firstChild);

    // Serialize the modified SVG to a string
    const svgString = new XMLSerializer().serializeToString(svgClone);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);

    // Draw the SVG onto the canvas via an Image element
    const img = new Image();
    img.onload = function() {
        // Fill canvas with white just in case
        context.fillStyle = 'white';
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw the image
        context.drawImage(img, 0, 0, svgWidth, svgHeight);

        // Trigger download
        const downloadLink = document.createElement('a');
        downloadLink.href = canvas.toDataURL('image/png', 1.0);
        downloadLink.download = filename;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        
        // Clean up
        URL.revokeObjectURL(svgUrl);
        
        showNotification(`High-quality plot saved as ${filename}`, 4000, 'success');
    };
    
    img.onerror = function(err) {
        console.error("Error loading SVG image for saving:", err);
        showNotification('An error occurred while saving the plot.', 3000, 'error');
        URL.revokeObjectURL(svgUrl);
    };
    
    img.src = svgUrl;
}
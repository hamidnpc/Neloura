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
    
    // Use the existing data if available
    if (window.sourcePropertiesData && window.sourcePropertiesData.length > 0) {
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
    
    // If we don't have data already, load it from the selected catalog
    const catalogSelect = document.getElementById('catalog-select');
    const selectedCatalog = catalogSelect ? catalogSelect.value : null;
    
    if (!selectedCatalog && !activeCatalog) {
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
    const catalogToUse = selectedCatalog || activeCatalog;
    
    // Update loading message
    loadingText.textContent = 'Loading catalog data...';
    
    // Load the catalog data
    fetch(`/load-catalog/${catalogToUse}`)
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
                        fetch(`/source-properties/?ra=${obj.ra}&dec=${obj.dec}&catalog_name=${catalogToUse}`)
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
    
    // Calculate bin width and create bins
    const binWidth = (max - min) / numBins;
    const bins = Array(numBins).fill(0);
    const totalValues = values.length;
    
    // Fill the bins
    values.forEach(value => {
        // Skip non-positive values for log scale
        if (xScale === 'log' && value <= 0) return;
        
        if (value >= min && value <= max) {
            // Calculate bin index
            const binIndex = Math.min(Math.floor((value - min) / binWidth), numBins - 1);
            bins[binIndex]++;
        }
    });
    
    // Normalize bin values based on the selected normalization type
    let normalizedBins = [...bins];
    let normalizedYLabel = yLabel;
    
    switch (normalization) {
        case 'frequency':
            normalizedBins = bins.map(count => count / binWidth);
            normalizedYLabel = yLabel !== 'Count' ? yLabel : 'Frequency (count/bin width)';
            break;
        case 'density':
            // Normalize so the total area equals 1
            const totalArea = bins.reduce((sum, count) => sum + count * binWidth, 0);
            normalizedBins = bins.map(count => totalArea > 0 ? count / totalArea : 0);
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
    
    for (let i = 0; i <= numXTicks; i++) {
        const position = i / numXTicks;
        const tickX = position * width;
        let tickValue;
        
        if (xScale === 'log') {
            // For log scale
            const logMin = Math.log10(min);
            const logMax = Math.log10(max);
            tickValue = Math.pow(10, logMin + position * (logMax - logMin));
        } else {
            // For linear scale
            tickValue = min + position * (max - min);
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
            
            if (Math.abs(closest[1] - tickValue) < binWidth) {
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
    g.appendChild(barsGroup);
    
    // Draw the histogram bars
    const barWidth = width / numBins;
    
    normalizedBins.forEach((value, i) => {
        // Skip empty bins
        if (value === 0) return;
        
        // Calculate bar position and dimensions
        const x = i * barWidth;
        
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
        bar.setAttribute('width', barWidth - 1); // -1 for spacing between bars
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
            tooltip.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
            tooltip.style.color = 'white';
            tooltip.style.padding = '5px 10px';
            tooltip.style.borderRadius = '4px';
            tooltip.style.fontSize = '12px';
            tooltip.style.pointerEvents = 'none';
            tooltip.style.zIndex = '1001';
            
            // Calculate bin start and end values
            const binStart = min + i * binWidth;
            const binEnd = min + (i + 1) * binWidth;
            
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
            const tooltipX = rect.left + margin.left + x + barWidth / 2;
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

// Create plotter container
function createPlotterContainer() {
    const containerId = 'dynamic-plotter-panel'; // NEW ID
    console.log(`[Plotter] createPlotterContainer called for ID: ${containerId}`); // Log start
    // Check if container already exists
    if (document.getElementById(containerId)) {
        console.log(`[Plotter] Container with ID ${containerId} already exists, returning.`);
        return;
    }
    
    // Create container
    const plotterContainer = document.createElement('div');
    plotterContainer.id = containerId; // USE NEW ID
    plotterContainer.style.position = 'fixed';
    plotterContainer.style.top = '0';
    plotterContainer.style.right = '0'; // Position flush right
    plotterContainer.style.transform = 'translateX(100%)'; // Hide using transform
    plotterContainer.style.width = '500px'; // INCREASED WIDTH
    plotterContainer.style.height = '100vh';
    plotterContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
    plotterContainer.style.color = 'white';
    plotterContainer.style.padding = '15px'; // ADDED PADDING
    plotterContainer.style.boxSizing = 'border-box';
    plotterContainer.style.boxShadow = '-2px 0 10px rgba(0, 0, 0, 0.5)';
    plotterContainer.style.zIndex = '1000'; // Ensure it's above most content
    plotterContainer.style.transition = 'transform 0.3s ease-in-out'; // Smooth transition
    plotterContainer.style.overflowY = 'auto'; // Allow vertical scrolling within the panel
    plotterContainer.style.overflowX = 'hidden'; // PREVENT horizontal scrolling
    plotterContainer.style.fontFamily = 'Raleway, Arial, sans-serif';
    
    // Create header (padding adjusted for container padding)
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    // Remove bottom margin from header, rely on container padding
    // header.style.marginBottom = '15px'; 
    header.style.paddingBottom = '10px'; 
    header.style.borderBottom = '1px solid rgba(255, 255, 255, 0.2)';
    
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
    closeButton.style.fontSize = '20px';
    closeButton.style.cursor = 'pointer';
    closeButton.onclick = hidePlotter;
    
    header.appendChild(title);
    header.appendChild(closeButton);
    plotterContainer.appendChild(header);

    const plotTypeContainer = document.createElement('div');
    plotTypeContainer.style.display = 'flex';
    plotTypeContainer.style.marginBottom = '20px';
    plotTypeContainer.style.gap = '10px';
    
    // Create scatter plot button
    const scatterButton = document.createElement('button');
    scatterButton.id = 'scatter-plot-button';
    scatterButton.textContent = 'Scatter Plot';
    scatterButton.style.flex = '1';
    scatterButton.style.padding = '10px';
    scatterButton.style.backgroundColor = '#4CAF50';
    scatterButton.style.color = 'white';
    scatterButton.style.border = 'none';
    scatterButton.style.borderRadius = '4px';
    scatterButton.style.cursor = 'pointer';
    scatterButton.style.fontWeight = 'bold';
    
    // Create histogram button
    const histogramButton = document.createElement('button');
    histogramButton.id = 'histogram-button';
    histogramButton.textContent = 'Histogram';
    histogramButton.style.flex = '1';
    histogramButton.style.padding = '10px';
    histogramButton.style.backgroundColor = '#555';
    histogramButton.style.color = 'white';
    histogramButton.style.border = 'none';
    histogramButton.style.borderRadius = '4px';
    histogramButton.style.cursor = 'pointer';



// Add event listeners to toggle plot type
scatterButton.addEventListener('click', function() {
    scatterButton.style.backgroundColor = '#4CAF50';
    scatterButton.style.fontWeight = 'bold';
    histogramButton.style.backgroundColor = '#555';
    histogramButton.style.fontWeight = 'normal';
    
    // Show scatter-specific controls, hide histogram-specific controls
    document.getElementById('histogram-controls').style.display = 'none';
    document.getElementById('y-axis-search').parentNode.style.display = 'block';
    document.getElementById('color-axis-search').parentNode.style.display = 'block';
    document.getElementById('colormap-select').style.display = 'block';
    document.getElementById('colormap-select').previousElementSibling.style.display = 'block';
    document.getElementById('alpha-slider').parentNode.parentNode.style.display = 'block';
    
    // Update current plot type
    window.currentPlotType = 'scatter';
});

histogramButton.addEventListener('click', function() {
    histogramButton.style.backgroundColor = '#4CAF50';
    histogramButton.style.fontWeight = 'bold';
    scatterButton.style.backgroundColor = '#555';
    scatterButton.style.fontWeight = 'normal';
    
    // Check elements before accessing their style
    const histogramControls = document.getElementById('histogram-controls');
    if (histogramControls) histogramControls.style.display = 'block';
    
    const yAxisSearch = document.getElementById('y-axis-search');
    if (yAxisSearch && yAxisSearch.parentNode) yAxisSearch.parentNode.style.display = 'none';
    
    const colorAxisSearch = document.getElementById('color-axis-search');
    if (colorAxisSearch && colorAxisSearch.parentNode) colorAxisSearch.parentNode.style.display = 'none';
    
    const colormapSelect = document.getElementById('colormap-select');
    if (colormapSelect) {
        colormapSelect.style.display = 'none';
        if (colormapSelect.previousElementSibling) 
            colormapSelect.previousElementSibling.style.display = 'none';
    }
    
    const alphaSlider = document.getElementById('alpha-slider');
    if (alphaSlider && alphaSlider.parentNode && alphaSlider.parentNode.parentNode)
        alphaSlider.parentNode.parentNode.style.display = 'none';
    
    // Update current plot type
    window.currentPlotType = 'histogram';
});
// Add the buttons to the container
plotTypeContainer.appendChild(scatterButton);
plotTypeContainer.appendChild(histogramButton);

// Add the plot type container to plotterContainer
// plotterContainer.appendChild(plotTypeContainer);
// content.insertBefore(plotTypeContainer, customizationSection);

// Set the default plot type
window.currentPlotType = 'scatter';

    
    // Create content
    const content = document.createElement('div');
    content.insertBefore(plotTypeContainer, content.firstChild);

    
    // Axis selection section
    const axisSelectionSection = document.createElement('div');
    axisSelectionSection.style.marginBottom = '20px';
    
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
    
    // Create a container for the searchable dropdown
    const xAxisContainer = document.createElement('div');
    xAxisContainer.style.position = 'relative';
    xAxisContainer.style.marginBottom = '15px';
    
    // Create search input for X-axis
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
    
    // Create dropdown list for X-axis
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
    
    // Create hidden select element for X-axis (to store the selected value)
    const xAxisSelect = document.createElement('select');
    xAxisSelect.id = 'x-axis-select';
    xAxisSelect.style.display = 'none';
    xAxisContainer.appendChild(xAxisSelect);
    
    // Add event listeners for X-axis search
    xAxisSearch.addEventListener('focus', function() {
        xAxisDropdown.style.display = 'block';
    });
    
    xAxisSearch.addEventListener('blur', function() {
        // Delay hiding to allow for click on dropdown items
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
    
    // Create a container for the searchable dropdown
    const yAxisContainer = document.createElement('div');
    yAxisContainer.style.position = 'relative';
    yAxisContainer.style.marginBottom = '15px';
    
    // Create search input for Y-axis
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
    
    // Create dropdown list for Y-axis
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
    
    // Create hidden select element for Y-axis (to store the selected value)
    const yAxisSelect = document.createElement('select');
    yAxisSelect.id = 'y-axis-select';
    yAxisSelect.style.display = 'none';
    yAxisContainer.appendChild(yAxisSelect);
    
    // Add event listeners for Y-axis search
    yAxisSearch.addEventListener('focus', function() {
        yAxisDropdown.style.display = 'block';
    });
    
    yAxisSearch.addEventListener('blur', function() {
        // Delay hiding to allow for click on dropdown items
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
    
    // Create a container for the searchable dropdown
    const colorContainer = document.createElement('div');
    colorContainer.style.position = 'relative';
    colorContainer.style.marginBottom = '15px';
    
    // Create search input for Color
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
    
    // Create dropdown list for Color
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
    
    // Create hidden select element for Color (to store the selected value)
    const colorSelect = document.createElement('select');
    colorSelect.id = 'color-axis-select';
    colorSelect.style.display = 'none';
    colorContainer.appendChild(colorSelect);
    
    // Add event listeners for Color search
    colorSearch.addEventListener('focus', function() {
        colorDropdown.style.display = 'block';
    });
    
    colorSearch.addEventListener('blur', function() {
        // Delay hiding to allow for click on dropdown items
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
    
    // Create colormap selection dropdown
    const colormapLabel = document.createElement('label');
    colormapLabel.textContent = 'Colormap:';
    colormapLabel.style.display = 'block';
    colormapLabel.style.marginBottom = '5px';
    axisSelectionSection.appendChild(colormapLabel);
    
    const colormapSelect = document.createElement('select');
    colormapSelect.id = 'colormap-select';
    colormapSelect.style.width = '100%';
    colormapSelect.style.padding = '8px';
    colormapSelect.style.backgroundColor = '#333';
    colormapSelect.style.color = 'white';
    colormapSelect.style.border = '1px solid #555';
    colormapSelect.style.borderRadius = '4px';
    colormapSelect.style.marginBottom = '15px';
    
    // Add colormap options with preview
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
        
        // Create a preview of the colormap
        const previewContainer = document.createElement('div');
        previewContainer.style.display = 'flex';
        previewContainer.style.alignItems = 'center';
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = colormap.name;
        nameSpan.style.marginRight = '10px';
        previewContainer.appendChild(nameSpan);
        
        const preview = document.createElement('div');
        preview.style.display = 'flex';
        preview.style.height = '10px';
        preview.style.width = '80px';
        preview.style.marginLeft = 'auto';
        
        // Create gradient segments
        colormap.colors.forEach((color, index) => {
            const segment = document.createElement('div');
            segment.style.flex = '1';
            segment.style.height = '100%';
            segment.style.backgroundColor = color;
            preview.appendChild(segment);
        });
        
        previewContainer.appendChild(preview);
        
        // Set the HTML content of the option
        option.innerHTML = `${colormap.name} <span style="float:right; display:inline-block; width:80px; height:10px; background: linear-gradient(to right, ${colormap.colors.join(', ')});"></span>`;
        
        colormapSelect.appendChild(option);
    });
    
    axisSelectionSection.appendChild(colormapSelect);
    
    content.appendChild(axisSelectionSection);
    
    // Plot customization section
    const customizationSection = document.createElement('div');
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
    xLabelInput.placeholder = 'Enter x-axis label (e.g. "Mass (M_\\odot)")';
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
    yLabelInput.placeholder = 'Enter y-axis label (e.g. "Luminosity (L_\\odot)")';
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
    alphaSlider.value = '70'; // Default 70% opacity
    alphaSlider.style.flex = '1';
    alphaSlider.style.height = '6px';
    alphaSlider.style.appearance = 'none';
    alphaSlider.style.backgroundColor = '#555';
    alphaSlider.style.borderRadius = '3px';
    alphaSlider.style.outline = 'none';
    
    // Slider thumb styling
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
    
    // Update the displayed value when the slider changes
    alphaSlider.addEventListener('input', function() {
        alphaValue.textContent = `${this.value}%`;
    });
    
    alphaSliderContainer.appendChild(alphaSlider);
    alphaSliderContainer.appendChild(alphaValue);
    alphaDiv.appendChild(alphaSliderContainer);
    
    customizationSection.appendChild(alphaDiv);
    
    // Histogram-specific controls (initially hidden)
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
    binsSlider.value = '20'; // Default 20 bins
    binsSlider.style.flex = '1';
    binsSlider.style.height = '6px';
    binsSlider.style.appearance = 'none';
    binsSlider.style.backgroundColor = '#555';
    binsSlider.style.borderRadius = '3px';
    binsSlider.style.outline = 'none';
    
    // Slider thumb styling (reuse the style from the alpha slider)
    binsSlider.style.webkitAppearance = 'none';
    binsSlider.style.cursor = 'pointer';
    
    const binsValue = document.createElement('span');
    binsValue.id = 'bins-value';
    binsValue.textContent = '20';
    binsValue.style.minWidth = '30px';
    binsValue.style.textAlign = 'right';
    
    // Update the displayed value when the slider changes
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
    barColorPicker.value = '#4CAF50'; // Default green color
    barColorPicker.style.width = '40px';
    barColorPicker.style.height = '30px';
    barColorPicker.style.borderRadius = '4px';
    barColorPicker.style.border = 'none';
    barColorPicker.style.cursor = 'pointer';
    barColorDiv.appendChild(barColorPicker);
    
    histogramControls.appendChild(barColorDiv);
    
    // Add histogram controls to the customization section
    customizationSection.appendChild(histogramControls);
    addNormalizationControls(histogramControls);


    
    content.appendChild(customizationSection);
    
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
    customizationSection.appendChild(manualLimitsDiv);
    
    // Toggle manual limits visibility based on checkbox
    autoLimitsCheckbox.addEventListener('change', function() {
        manualLimitsDiv.style.display = this.checked ? 'none' : 'block';
    });
    

 


    // Add the plot type container to the content
    // content.insertBefore(plotTypeContainer, customizationSection);
    
    // Set the default plot type
    // window.currentPlotType = 'scatter';
    
    // Generate plot button
    const generateButton = document.createElement('button');
    generateButton.textContent = 'Generate Plot';
    generateButton.style.width = '100%';
    generateButton.style.padding = '10px';
    generateButton.style.backgroundColor = '#4CAF50';
    generateButton.style.color = 'white';
    generateButton.style.border = 'none';
    generateButton.style.borderRadius = '4px';
    generateButton.style.cursor = 'pointer';
    generateButton.style.marginBottom = '20px';
    generateButton.onclick = function() {
        // Call the appropriate plot generation function based on current plot type
        if (window.currentPlotType === 'histogram') {
            generateHistogram();
        } else {
            generatePlot();
        }
    };
    content.appendChild(generateButton);
    
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
    content.appendChild(plotArea);
    
    plotterContainer.appendChild(content);
    document.body.appendChild(plotterContainer);
    console.log(`[Plotter] Container ${containerId} created and appended to body.`); // Log end
    
    // Populate axis dropdowns AFTER the container is added to the DOM and rendered
    setTimeout(() => {
        console.log(`[Plotter] setTimeout calling populateAxisDropdowns for ${containerId}`);
        populateAxisDropdowns(); 
    }, 10); // Small delay
}

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
    
    // If we have catalog data, use it
    if (window.sourcePropertiesData && window.sourcePropertiesData.length > 0) {
        showLoadingIndicators();
        setTimeout(() => {
            processDropdownOptions(window.sourcePropertiesData);
        }, 10); // Small delay to allow loading indicators to be displayed
        return;
    }
    
    // Otherwise, check if we have catalog overlay data
    if (window.catalogDataForOverlay && window.catalogDataForOverlay.length > 0 && activeCatalog) {
        showLoadingIndicators();
        
        // Get a sample object to fetch properties
        const sampleObject = window.catalogDataForOverlay[0];
        
        // Fetch properties for the sample object to get column names
        fetch(`/source-properties/?ra=${sampleObject.ra}&dec=${sampleObject.dec}&catalog_name=${activeCatalog}`)
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    console.error('Error fetching properties:', data.error);
                    showErrorMessage('Error loading data');
                    return;
                }
                
                // Get properties and create a sample data array
                const properties = data.properties || {};
                const sampleData = [properties];
                
                // Process the sample data to populate dropdowns
                processDropdownOptions(sampleData);
            })
            .catch(error => {
                console.error('Error loading catalog data:', error);
                showErrorMessage('Error loading data: ' + error.message);
            });
        return;
    }
    
    // If we don't have any data yet, check for catalog selection
    const catalogSelect = document.getElementById('catalog-select');
    const selectedCatalog = catalogSelect ? catalogSelect.value : null;
    
    if (!selectedCatalog && !activeCatalog) {
        showErrorMessage('No catalog selected');
        return;
    }
    
    // Use either the selected catalog or active catalog
    const catalogToUse = selectedCatalog || activeCatalog;
    
    // Show loading indicators
    showLoadingIndicators();
    
    // Load the catalog data - use the source-properties endpoint with a sample object
    // First, load the catalog to get a sample object
    fetch(`/load-catalog/${catalogToUse}`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to load catalog');
            }
            return response.json();
        })
        .then(catalogData => {
            if (!catalogData || !catalogData.length) {
                throw new Error('No catalog data available');
            }
            
            // Get a sample object
            const sampleObject = catalogData[0];
            
            // Fetch properties for the sample object
            return fetch(`/source-properties/?ra=${sampleObject.ra}&dec=${sampleObject.dec}&catalog_name=${catalogToUse}`);
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to load properties');
            }
            return response.json();
        })
        .then(data => {
            if (data.error) {
                throw new Error(data.error);
            }
            
            // Get properties and create a sample data array
            const properties = data.properties || {};
            
            // Store the properties for future use
            window.sourcePropertiesData = [properties];
            
            // Process the sample data to populate dropdowns
            processDropdownOptions([properties]);
        })
        .catch(error => {
            console.error('Error loading catalog data:', error);
            showErrorMessage('Error: ' + error.message);
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
            if (typeof value === 'number' && isFinite(value)) {
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
                if (typeof subValue === 'number' && isFinite(subValue)) {
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

// Generate scatter plot - fixed version
function generatePlot() {
    // Get the selected axes
    const xAxisSelect = document.getElementById('x-axis-select');
    const yAxisSelect = document.getElementById('y-axis-select');
    const xAxisSearch = document.getElementById('x-axis-search');
    const yAxisSearch = document.getElementById('y-axis-search');
    const colorSelect = document.getElementById('color-axis-select');
    const colorSearch = document.getElementById('color-axis-search');
    const colormapSelect = document.getElementById('colormap-select');
    
    // Get the selected values (either from the select or the search input)
    const xAxisName = xAxisSelect.value || xAxisSearch.value;
    const yAxisName = yAxisSelect.value || yAxisSearch.value;
    const colorAxisName = colorSelect.value || colorSearch.value;
    const colormap = colormapSelect.value || 'viridis';
    
    // Validate selections
    if (!xAxisName || !yAxisName) {
        showNotification('Please select both X and Y axes', 3000);
        return;
    }
    
    // Get customization options
    const plotTitle = document.getElementById('plot-title-input')?.value || '';
    const xLabel = document.getElementById('x-label-input')?.value || xAxisName;
    const yLabel = document.getElementById('y-label-input')?.value || yAxisName;
    const xScale = document.getElementById('x-scale-select')?.value || 'linear';
    const yScale = document.getElementById('y-scale-select')?.value || 'linear';
    const autoLimits = document.getElementById('auto-limits-checkbox')?.checked ?? true;
    const pointAlpha = document.getElementById('alpha-slider')?.value / 100 || 0.7; // Convert percentage to decimal
    
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
    let limitsAdjustedPlot = false;
    if (!autoLimits) {
        if (xScale === 'log') {
            if (xMin !== null && xMin <= 0) {
                xMin = 0.1; // Or calculate min positive value from data if needed
                limitsAdjustedPlot = true;
                console.warn("Manual X Min <= 0 adjusted to 0.1 for log scale.");
            }
            if (xMax !== null && xMin !== null && xMax <= xMin) {
                xMax = xMin * 10; // Ensure max is greater than min
                limitsAdjustedPlot = true;
                console.warn("Manual X Max <= X Min adjusted for log scale.");
            }
        }
        if (yScale === 'log') {
            if (yMin !== null && yMin <= 0) {
                yMin = 0.1; // Or calculate min positive value from data if needed
                limitsAdjustedPlot = true;
                console.warn("Manual Y Min <= 0 adjusted to 0.1 for log scale.");
            }
            if (yMax !== null && yMin !== null && yMax <= yMin) {
                yMax = yMin * 10; // Ensure max is greater than min
                limitsAdjustedPlot = true;
                console.warn("Manual Y Max <= Y Min adjusted for log scale.");
            }
        }
    }
     if (limitsAdjustedPlot) {
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
    
    // Add the animation style for the spinner
    const styleElement = document.createElement('style');
    styleElement.textContent = `
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(styleElement);
    
    // Create loading text
    const loadingText = document.createElement('div');
    loadingText.textContent = 'Processing data for plot...';
    loadingText.style.color = '#aaa';
    loadingText.style.marginTop = '10px';
    
    // Add spinner and text to the loading container
    loadingContainer.appendChild(spinner);
    loadingContainer.appendChild(loadingText);
    
    // Add the loading container to the plot area
    plotArea.appendChild(loadingContainer);
    
    // Use the existing catalog data instead of reloading it
    // We'll use the data from the source properties panel if available
    if (window.sourcePropertiesData && window.sourcePropertiesData.length > 0) {
        // Process the existing data
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
                colormap: colormap
            }
        );
        return;
    }
    
    // If we don't have data already, load it from the selected catalog
    const catalogSelect = document.getElementById('catalog-select');
    const selectedCatalog = catalogSelect ? catalogSelect.value : null;
    
    if (!selectedCatalog && !activeCatalog) {
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
    const catalogToUse = selectedCatalog || activeCatalog;
    
    // Update loading message
    loadingText.textContent = 'Loading catalog data...';
    
    // Load the catalog data
    fetch(`/load-catalog/${catalogToUse}`)
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
            const allProperties = [];
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
                
                // Add a note about sampling
                const noteDiv = document.createElement('div');
                noteDiv.style.position = 'absolute';
                noteDiv.style.top = '10px';
                noteDiv.style.left = '10px';
                noteDiv.style.color = '#ffcc00';
                noteDiv.style.fontSize = '12px';
                noteDiv.textContent = ``;
                plotArea.appendChild(noteDiv);
            }
            
            // Update loading text
            loadingText.textContent = 'Loading data: 0%';
            
            // Create an array of promises to fetch properties for each object
            const fetchPromises = objectsToFetch.map((obj, index) => {
                return new Promise((resolve, reject) => {
                    // Add a small delay to prevent overwhelming the server
                    setTimeout(() => {
                        fetch(`/source-properties/?ra=${obj.ra}&dec=${obj.dec}&catalog_name=${catalogToUse}`)
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
                    
                    // Clear the loading container completely
                    plotArea.innerHTML = '';
                    
                    // Process the data for plotting
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
                            colormap: colormap
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

// Process data for plotting
function processPlotData(plotArea, allData, xAxisName, yAxisName, customizationOptions) {
    // Check if we have data
    if (!allData || allData.length === 0) {
        plotArea.textContent = 'No data available for plotting';
        return;
    }
    
    // Extract color axis name from customization options
    const { colorAxisName, colormap } = customizationOptions || {};
    
    // Process the data for plotting
    const processedData = [];
    const categoryMapsX = new Map(); // For categorical X values
    const categoryMapsY = new Map(); // For categorical Y values
    const colorValues = []; // For color mapping
    
    // First pass: collect all unique categorical values and color values
    allData.forEach(obj => {
        const xValue = obj[xAxisName];
        const yValue = obj[yAxisName];
        const colorValue = colorAxisName ? obj[colorAxisName] : null;
        
        // Skip if either value is undefined or null
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
    
    // Second pass: create processed data points
    allData.forEach((obj, index) => {
        const xValue = obj[xAxisName];
        const yValue = obj[yAxisName];
        const colorValue = colorAxisName ? obj[colorAxisName] : null;
        
        // Skip if either value is undefined or null
        if (xValue === undefined || xValue === null || yValue === undefined || yValue === null) {
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
        
        // Skip if either value is NaN
        if (isNaN(xNumeric) || isNaN(yNumeric)) {
            return;
        }
        
        // Add to processed data
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
    
    // Calculate color min/max for normalization
    let colorMin = null, colorMax = null;
    if (colorValues.length > 0) {
        colorMin = Math.min(...colorValues);
        colorMax = Math.max(...colorValues);
    }
    
    // Create the plot with customization options
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



// Create a scatter plot with the processed data
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
        pointAlpha = 0.7, // Default alpha if not provided
        colorAxisName = null,
        colorMin = null,
        colorMax = null,
        colormap = 'viridis' // Default colormap
    } = customizationOptions || {};
    
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
    
    // Add padding to the ranges
    const xPadding = (xMaxValue - xMinValue) * 0.1 || 0.5; // Handle case where min=max
    const yPadding = (yMaxValue - yMinValue) * 0.1 || 0.5; // Handle case where min=max
    
    const xRange = [xMinValue - (autoLimits ? xPadding : 0), xMaxValue + (autoLimits ? xPadding : 0)];
    const yRange = [yMinValue - (autoLimits ? yPadding : 0), yMaxValue + (autoLimits ? yPadding : 0)];
    
    // For log scale, ensure range bounds are positive
    if (effectiveXScale === 'log') {
        xRange[0] = Math.max(xRange[0], 0.1);
    }
    if (effectiveYScale === 'log') {
        yRange[0] = Math.max(yRange[0], 0.1);
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
    const margin = { top: 40, right: colorAxisName ? 80 : 30, bottom: 50, left: 60 };
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
    yAxisLabel.innerHTML = renderLatexLabel(yLabel);
    g.appendChild(yAxisLabel);
    
    // Create x-axis ticks
    const numXTicks = 5;
    
    // Helper function to format tick values
    function formatTickValue(value) {
        // For linear scale, show integer values
        if (Math.abs(value) < 0.001) return '0';
        
        // For larger values, round to integer
        return Math.round(value).toString();
    }
    
    // Helper function to format log tick values
    function formatLogTickValue(value) {
        if (value === 0) return '0';
        
        // Get the exponent (power of 10)
        const exponent = Math.log10(value);
        const roundedExponent = Math.round(exponent);
        
        // Check if the value is close to a power of 10
        if (Math.abs(exponent - roundedExponent) < 0.01) {
            // For powers of 10, format as 1, 10, 100, etc. for small values
            if (roundedExponent >= 0 && roundedExponent <= 5) {
                return Math.pow(10, roundedExponent).toString();
            } else {
                // For larger powers, use scientific notation
                return `1e${roundedExponent}`;
            }
        } else {
            // For values between powers of 10, round to integer
            return Math.round(value).toString();
        }
    }
    
    for (let i = 0; i <= numXTicks; i++) {
        let tickValue, tickX;
        
        if (effectiveXScale === 'log') {
            // For log scale, use logarithmic spacing
            const logMin = Math.log10(xRange[0]);
            const logMax = Math.log10(xRange[1]);
            const logValue = logMin + (i / numXTicks) * (logMax - logMin);
            tickValue = Math.pow(10, logValue);
            tickX = (Math.log10(tickValue) - logMin) / (logMax - logMin) * width;
        } else {
            // For linear scale, use linear spacing
            tickValue = xRange[0] + (i / numXTicks) * (xRange[1] - xRange[0]);
            tickX = (i / numXTicks) * width;
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
        
        // Format the tick label
        let labelText;
        
        if (effectiveXScale === 'log') {
            // For log scale, use special formatting
            labelText = formatLogTickValue(tickValue);
        } else {
            // For linear scale, use fixed notation for small numbers
            if (Math.abs(tickValue) < 1000 && Math.abs(tickValue) > 0.01) {
                labelText = tickValue.toFixed(2);
            } else {
                labelText = tickValue.toExponential(1);
            }
        }
        
        // If this is a categorical axis, show the category name
        if (categoryMapsX.size > 0) {
            // Find the category that maps to this value or closest to it
            const category = [...categoryMapsX.entries()]
                .find(([_, index]) => Math.abs(index - tickValue) < 0.5);
            if (category) {
                labelText = category[0];
            }
        }
        
        tickLabel.textContent = labelText;
        g.appendChild(tickLabel);
    }
    
    // Create y-axis ticks
    const numYTicks = 5;
    
    for (let i = 0; i <= numYTicks; i++) {
        let tickValue, tickY;
        
        if (effectiveYScale === 'log') {
            // For log scale, use logarithmic spacing
            const logMin = Math.log10(yRange[0]);
            const logMax = Math.log10(yRange[1]);
            const logValue = logMin + (i / numYTicks) * (logMax - logMin);
            tickValue = Math.pow(10, logValue);
            tickY = height - (Math.log10(tickValue) - logMin) / (logMax - logMin) * height;
        } else {
            // For linear scale, use linear spacing
            tickValue = yRange[0] + (i / numYTicks) * (yRange[1] - yRange[0]);
            tickY = height - (i / numYTicks) * height;
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
        
        // Format the tick label
        let labelText;
        
        if (effectiveYScale === 'log') {
            // For log scale, use special formatting
            labelText = formatLogTickValue(tickValue);
        } else {
            // For linear scale, use fixed notation for small numbers
            if (Math.abs(tickValue) < 1000 && Math.abs(tickValue) > 0.01) {
                labelText = tickValue.toFixed(2);
            } else {
                labelText = tickValue.toExponential(1);
            }
        }
        
        // If this is a categorical axis, show the category name
        if (categoryMapsY.size > 0) {
            // Find the category that maps to this value or closest to it
            const category = [...categoryMapsY.entries()]
                .find(([_, index]) => Math.abs(index - tickValue) < 0.5);
            if (category) {
                labelText = category[0];
            }
        }
        
        tickLabel.textContent = labelText;
        g.appendChild(tickLabel);
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
    g.appendChild(pointsGroup);
    
    // Define color mapping function based on the selected colormap
    function getColorFromMap(value, min, max, colormap) {
        // Normalize value to 0-1 range
        const normalizedValue = (value - min) / (max - min);
        
        const colormaps = {
            viridis: (t) => {
                // Viridis colormap - perceptually uniform, colorblind-friendly
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
                // Plasma colormap - perceptually uniform
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
                // Inferno colormap - perceptually uniform with high contrast
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
                // Magma colormap - perceptually uniform
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
                // Cividis colormap - color-vision-deficiency friendly
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
                // Rainbow colormap - not perceptually uniform but popular
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
                // Turbo colormap - improved rainbow with better perceptual properties
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
                // Jet colormap - classic but not perceptually uniform
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
            // Ensure t is clamped between 0 and 1
            t = Math.max(0, Math.min(1, t));
            
            // Find the two color stops that t falls between
            for (let i = 1; i < colorStops.length; i++) {
                if (t <= colorStops[i].t) {
                    const stop1 = colorStops[i-1];
                    const stop2 = colorStops[i];
                    
                    // Calculate interpolation factor between the two stops
                    const segmentT = (t - stop1.t) / (stop2.t - stop1.t);
                    
                    // Linear interpolation for each RGB component
                    const r = Math.round(stop1.r + segmentT * (stop2.r - stop1.r));
                    const g = Math.round(stop1.g + segmentT * (stop2.g - stop1.g));
                    const b = Math.round(stop1.b + segmentT * (stop2.b - stop1.b));
                    
                    return `rgb(${r}, ${g}, ${b})`;
                }
            }
            
            // Fallback for t = 1
            const lastStop = colorStops[colorStops.length - 1];
            return `rgb(${lastStop.r}, ${lastStop.g}, ${lastStop.b})`;
        }
        
        
        // Use the selected colormap or default to viridis
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
            // For log scale, use logarithmic mapping
            const logMin = Math.log10(xRange[0]);
            const logMax = Math.log10(xRange[1]);
            const logX = Math.log10(point.x);
            x = ((logX - logMin) / (logMax - logMin)) * width;
        } else {
            // For linear scale, use linear mapping
            x = ((point.x - xRange[0]) / (xRange[1] - xRange[0])) * width;
        }
        
        if (effectiveYScale === 'log') {
            // For log scale, use logarithmic mapping
            const logMin = Math.log10(yRange[0]);
            const logMax = Math.log10(yRange[1]);
            const logY = Math.log10(point.y);
            y = height - ((logY - logMin) / (logMax - logMin)) * height;
        } else {
            // For linear scale, use linear mapping
            y = height - ((point.y - yRange[0]) / (yRange[1] - yRange[0])) * height;
        }
        
        // Determine point color based on color axis
        let pointColor = defaultPointColor;
        if (colorAxisName && point.colorValue !== null && point.colorValue !== undefined && 
            colorMin !== null && colorMax !== null) {
            pointColor = getColorFromMap(point.colorValue, colorMin, colorMax, colormap);
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
            tooltip.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
            tooltip.style.color = 'white';
            tooltip.style.padding = '5px 10px';
            tooltip.style.borderRadius = '4px';
            tooltip.style.fontSize = '12px';
            tooltip.style.pointerEvents = 'none';
            tooltip.style.zIndex = '1001';
            
            // Format tooltip content
            let tooltipContent = '';
            
            // // Format X value
            // tooltipContent += `<strong>${renderLatexLabel(xLabel)}:</strong> `;
            // if (typeof point.originalX === 'number') {
            //     tooltipContent += point.originalX.toFixed(2);
            // } else {
            //     tooltipContent += point.originalX;
            // }
            
            // // Format Y value
            // tooltipContent += `<br><strong>${renderLatexLabel(yLabel)}:</strong> `;
            // if (typeof point.originalY === 'number') {
            //     tooltipContent += point.originalY.toFixed(2);
            // } else {
            //     tooltipContent += point.originalY;
            // }
            
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

                // Check if the canvas overlay data and source map exist
                const catalogData = window.catalogDataForOverlay;
                const sourceMap = window.catalogSourceMap; 
                if (!catalogData || catalogData.length === 0 || !sourceMap || sourceMap.length === 0) {
                    console.error("Plotter Click: window.catalogDataForOverlay or window.catalogSourceMap is empty or not available.");
                    return;
                }

                // Find the closest source in the catalog data
                let closestSourceIndex = -1;
                let minDistance = Infinity;

                catalogData.forEach((source, index) => {
                    if (source.ra !== undefined && source.dec !== undefined) {
                        const sourceRa = parseFloat(source.ra);
                        const sourceDec = parseFloat(source.dec);

                        if (!isNaN(sourceRa) && !isNaN(sourceDec)) {
                            const distance = Math.sqrt(
                                Math.pow(ra - sourceRa, 2) +
                                Math.pow(dec - sourceDec, 2)
                            );

                            if (distance < minDistance) {
                                minDistance = distance;
                                closestSourceIndex = index;
                            }
                        }
                    }
                });

                console.log(`Plotter Click: Closest source search complete. Index: ${closestSourceIndex}`);

                // Trigger canvas click, highlight scatter point, and zoom if found
                const tolerance = 0.1; 
                if (closestSourceIndex !== -1 && minDistance < tolerance) {
                    console.log(`Plotter Click: Found matching source at index ${closestSourceIndex}`);
                    const sourceMapEntry = sourceMap.find(s => s.sourceIndex === closestSourceIndex);

                    if (!sourceMapEntry) {
                        console.warn(`Plotter Click: Could not find sourceMapEntry for index ${closestSourceIndex}. Cannot trigger map interaction.`);
                        return;
                    }

                    // 1. Highlight Scatter Plot Point
                    // Clear previous scatter highlight
                    if (window.highlightedScatterCircle) {
                        window.highlightedScatterCircle.setAttribute('stroke', '#333');
                        window.highlightedScatterCircle.setAttribute('stroke-width', '1');
                        window.highlightedScatterCircle.setAttribute('r', pointRadius); 
                    }
                    // Apply new highlight
                    clickedCircle.setAttribute('stroke', 'yellow');
                    clickedCircle.setAttribute('stroke-width', '2');
                    clickedCircle.setAttribute('r', pointRadius * 1.5); 
                    window.highlightedScatterCircle = clickedCircle; // Store reference
                    
                    // 2. Trigger Map Interaction (Highlight + Popup via canvasHandleClick)
                    // -- REVISED: Call canvasHighlightSource and canvasPopup.show directly --
                    const sourceObj = catalogData[closestSourceIndex];
                    if (sourceObj && sourceMapEntry) {
                        // Highlight on Canvas first
                        if (typeof canvasHighlightSource === 'function') {
                             console.log(`Plotter Click: Calling canvasHighlightSource for index ${closestSourceIndex}`);
                             canvasHighlightSource(closestSourceIndex);
                         } else {
                            console.warn("Plotter Click: canvasHighlightSource function not available.");
                         }
                         
                         // Then show the popup directly
                         if (window.canvasPopup && typeof window.canvasPopup.show === 'function') {
                             console.log(`Plotter Click: Calling window.canvasPopup.show for index ${closestSourceIndex}`);
                              window.canvasPopup.show(
                                 closestSourceIndex,
                                 sourceMapEntry.x, // Screen X for popup position
                                 sourceMapEntry.y, // Screen Y for popup position
                                 sourceObj
                             );
                         } else {
                             console.warn("Plotter Click: window.canvasPopup.show function not available.");
                         }
                    } else {
                         console.warn(`Plotter Click: Could not find sourceObj or sourceMapEntry for index ${closestSourceIndex}. Cannot show popup.`);
                    }
                    // -- End Revised Map Interaction --
                    
                    // 3. Zoom and Pan on Map (Keep this logic)
                    if (typeof viewer !== 'undefined' && viewer && sourceMapEntry.imageX !== undefined && sourceMapEntry.imageY !== undefined) {
                        try {
                            console.log(`Plotter Click: Zooming to image coordinates (${sourceMapEntry.imageX}, ${sourceMapEntry.imageY})`);
                            const imageCoords = new OpenSeadragon.Point(sourceMapEntry.imageX, sourceMapEntry.imageY);
                            const viewportCoords = viewer.viewport.imageToViewportCoordinates(imageCoords);
                            const currentZoom = viewer.viewport.getZoom();
                            const targetZoom = Math.max(currentZoom * 1.5, 5); 
                            viewer.viewport.panTo(viewportCoords, false);
                            // viewer.viewport.zoomTo(targetZoom, viewportCoords, false); 
                            console.log(`Plotter Click: Panning and zooming.`);
                        } catch (zoomError) {
                            console.error("Plotter Click: Error during zoom/pan:", zoomError);
                        }
                    } else {
                        console.warn("Plotter Click: Viewer not available or source map entry missing image coordinates for zoom.");
                    }

                } else {
                    console.log(`Plotter Click: No matching source found within tolerance (${tolerance}).`);
                    if (closestSourceIndex !== -1) {
                        console.log(`Plotter Click: Closest source found had distance ${minDistance}`);
                    }
                    // Optionally clear highlight if no match
                    // if (typeof clearHighlight === 'function') clearHighlight();
                }

                // Add/Update Clear Selection Button
                 const plotAreaElement = document.getElementById('plot-area'); // Ensure we append to the correct element
                 let clearBtn = document.getElementById('clear-selection-btn');

                 if (!clearBtn && plotAreaElement) {
                    clearBtn = document.createElement('button');
                    clearBtn.id = 'clear-selection-btn';
                    clearBtn.className = 'btn btn-sm btn-outline-secondary';
                    clearBtn.textContent = 'Clear Map Selection';
                    clearBtn.style.position = 'absolute';
                    clearBtn.style.top = '10px';
                    clearBtn.style.right = '10px';
                    clearBtn.style.zIndex = '1000'; 
                    clearBtn.style.padding = '3px 8px';
                    clearBtn.style.fontSize = '12px';
                    
                    clearBtn.addEventListener('click', function() {
                        // Clear map highlight
                        window.currentHighlightedSourceIndex = -1; // Reset the global index
                        if (typeof canvasUpdateOverlay === 'function') { 
                             console.log("Clear Selection: Calling canvasUpdateOverlay to clear map highlight.");
                            canvasUpdateOverlay(); // Redraw canvas without highlight
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
                        
                        // Hide popups (use the canvas popup hide method if available)
                         if (window.canvasPopup && typeof window.canvasPopup.hide === 'function') {
                            window.canvasPopup.hide();
                        } else if (typeof hideAllInfoPopups === 'function') { // Fallback to old method
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
    
    // Add colorbar if color axis is specified
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
            const value = colorMin + offset * (colorMax - colorMin);
            const stopColor = getColorFromMap(value, colorMin, colorMax, colormap);
            
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
        
        // Add colorbar ticks and labels
        const numTicks = 5;
        for (let i = 0; i <= numTicks; i++) {
            const value = colorMin + (i / numTicks) * (colorMax - colorMin);
            const y = colorbarY + colorbarHeight - (i / numTicks) * colorbarHeight;
            
            // Create tick
            const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            tick.setAttribute('x1', colorbarX + colorbarWidth);
            tick.setAttribute('y1', y);
            tick.setAttribute('x2', colorbarX + colorbarWidth + 5);
            tick.setAttribute('y2', y);
            tick.setAttribute('stroke', '#888');
            tick.setAttribute('stroke-width', '1');
            g.appendChild(tick);
            
            // Create label
            const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.setAttribute('x', colorbarX + colorbarWidth + 8);
            label.setAttribute('y', y + 4); // +4 for vertical centering
            label.setAttribute('fill', '#aaa');
            label.setAttribute('font-size', '10px');
            label.setAttribute('text-anchor', 'start');
            
            // Format the label
            let labelText;
            if (Math.abs(value) < 0.01 || Math.abs(value) > 1000) {
                labelText = value.toExponential(1);
            } else {
                labelText = value.toFixed(2);
            }
            
            label.textContent = labelText;
            g.appendChild(label);
        }
        
        // Add colorbar title
        const colorbarTitle = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        colorbarTitle.setAttribute('x', colorbarX + colorbarWidth / 2);
        colorbarTitle.setAttribute('y', colorbarY - 10);
        colorbarTitle.setAttribute('text-anchor', 'middle');
        colorbarTitle.setAttribute('fill', 'white');
        colorbarTitle.setAttribute('font-size', '12px');
        colorbarTitle.innerHTML = renderLatexLabel(colorAxisName);
        g.appendChild(colorbarTitle);
    }
    
    // Add the SVG to the plot area
    svg.appendChild(g);
    plotArea.innerHTML = '';
    plotArea.appendChild(svg);
}

// Function to parse and render LaTeX-like formulas
function renderLatexLabel(text) {
    // Placeholder for potential future LaTeX rendering
    return text;
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
});

// --- Remove populateAxisDropdowns() calls from toggle/show functions if they exist --- 
// Example: If it was called in showPlotter, remove it:
/*
function showPlotter() {
    const plotterContainer = document.getElementById('plotter-container');
    if (plotterContainer) {
        plotterContainer.style.display = 'block';
        // populateAxisDropdowns(); // REMOVE THIS CALL if it was here
    }
}
*/

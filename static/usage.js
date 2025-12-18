// static/usage.js

let usageUpdateInterval = null;
const UPDATE_INTERVAL_MS = 2000; // Update every 2 seconds
let latestStats = null; // Store the latest fetched stats
let previousStats = null; // Store previous stats for animation

// Animation helper function
function animateValue(element, start, end, duration, decimals = 0, prefix = '', suffix = '') {
    if (!element) return;

    let startTimestamp = null;
    const MINT_ANIM_THRESHOLD = 0.01; // Minimum change to animate to avoid jitter for tiny changes

    // If no previous value or element just created, or change is too small, set directly
    if (typeof start !== 'number' || typeof end !== 'number' || Math.abs(start - end) < MINT_ANIM_THRESHOLD) {
        element.textContent = prefix + end.toFixed(decimals) + suffix;
        return;
    }
    
    // If element has an ongoing animation, let it finish or restart smoothly
    if (element._animationFrameId) {
        cancelAnimationFrame(element._animationFrameId);
    }
    // Store the target end value in case of new updates during animation
    element._targetEndValue = end;


    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        
        // Use the most recent targetEndValue if it changed mid-animation
        const currentTargetEnd = element._targetEndValue !== undefined ? element._targetEndValue : end;

        const currentValue = start + progress * (currentTargetEnd - start);
        element.textContent = prefix + currentValue.toFixed(decimals) + suffix;

        if (progress < 1) {
            element._animationFrameId = requestAnimationFrame(step);
        } else {
            element.textContent = prefix + currentTargetEnd.toFixed(decimals) + suffix; // Ensure final value is exact
            delete element._targetEndValue; // Clean up
            delete element._animationFrameId;
        }
    };
    element._animationFrameId = requestAnimationFrame(step);
}

function initializeUsageMonitor() {
    // Only create once in the top-level window, never inside iframes
    try {
        if (window.self !== window.top) return;
        if (document.getElementById('usage-icon-container')) return;
    } catch(_) {}
    createUsageIcon();
    connectToUsageWebSocket();
}

function connectToUsageWebSocket() {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/system-stats`;
    const socket = new WebSocket(wsUrl);

    socket.onmessage = function(event) {
        try {
            previousStats = latestStats;
            latestStats = JSON.parse(event.data);
            
            updateUsageIconDisplay(latestStats);
            
            const popup = document.getElementById('usage-popup');
            if (popup && popup.style.display === 'block') {
                renderUsagePopupContent(latestStats, previousStats);
            }
        } catch (error) {
            console.error("Error processing system stats from WebSocket:", error);
        }
    };

    socket.onopen = function() {
        console.log("System stats WebSocket connected.");
        // The server sends initial data on connection, so no need to fetch here.
    };

    socket.onclose = function(event) {
        console.warn("System stats WebSocket disconnected. Attempting to reconnect in 5 seconds.", event.reason);
        // Clean up previous stats to avoid showing stale data on reconnect
        previousStats = latestStats;
        latestStats = null;
        updateUsageIconDisplay(null);
        
        setTimeout(connectToUsageWebSocket, 5000); // Reconnect logic
    };

    socket.onerror = function(error) {
        console.error("WebSocket error:", error);
        // onclose will be called next, which handles the reconnect.
    };
}

function updateUsageIconDisplay(stats) {
    const iconContainer = document.getElementById('usage-icon-container');
    if (!iconContainer) return;
    const svgIcon = iconContainer.querySelector('svg');
    if (!svgIcon) return;

    let iconPathColor = '#888888'; // Grey for unknown/error

    if (stats && stats.cpu_percent !== undefined) {
        const cpuLoad = stats.cpu_percent;
        if (cpuLoad > 80) {
            iconPathColor = '#D32F2F'; // Red-ish for high load
        } else if (cpuLoad > 50) {
            iconPathColor = '#FBC02D'; // Yellow-ish for medium
        } else {
            iconPathColor = '#4CAF50'; // Green-ish for low
        }
    }
    
    // Change the color of the SVG paths
    const paths = svgIcon.querySelectorAll('path');
    paths.forEach(path => {
        path.style.stroke = iconPathColor;
    });
    // Keep iOS-glass background while icon color changes
    iconContainer.style.background = 'rgba(18, 18, 20, 0.58)';
    iconContainer.style.border = '1px solid rgba(255, 255, 255, 0.16)';
    iconContainer.style.boxShadow = '0 18px 50px rgba(0,0,0,0.35)';
    iconContainer.style.backdropFilter = 'saturate(180%) blur(18px)';
    iconContainer.style.webkitBackdropFilter = 'saturate(180%) blur(18px)';
}

function createUsageIcon() {
    // Guard: only one instance in top-level
    if (document.getElementById('usage-icon-container')) return;
    const iconContainer = document.createElement('div');
    iconContainer.id = 'usage-icon-container';
    iconContainer.style.position = 'fixed';
    iconContainer.style.bottom = '12px';
    iconContainer.style.left = '12px';
    // iOS-style glass
    iconContainer.style.background = 'rgba(18, 18, 20, 0.58)';
    iconContainer.style.border = '1px solid rgba(255, 255, 255, 0.16)';
    iconContainer.style.backdropFilter = 'saturate(180%) blur(18px)';
    iconContainer.style.webkitBackdropFilter = 'saturate(180%) blur(18px)';
    iconContainer.style.borderRadius = '50%';
    iconContainer.style.cursor = 'pointer';
    iconContainer.style.zIndex = '3500';
    iconContainer.style.display = 'flex';
    iconContainer.style.alignItems = 'center';
    iconContainer.style.justifyContent = 'center';
    iconContainer.style.width = '44px';
    iconContainer.style.height = '44px';
    iconContainer.title = 'Show Resource Usage';
    iconContainer.style.boxShadow = '0 18px 50px rgba(0,0,0,0.35)';

    const svgIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgIcon.setAttribute("width", "24");
    svgIcon.setAttribute("height", "24");
    svgIcon.setAttribute("viewBox", "0 0 24 24");
    svgIcon.setAttribute("fill", "none");
    svgIcon.style.strokeWidth = "2";
    svgIcon.style.strokeLinecap = "round";
    svgIcon.style.strokeLinejoin = "round";
    svgIcon.innerHTML = `
        <path d="M21 10h-4.01" style="transition: stroke 0.5s ease;"></path>
        <path d="M3 10h-4.01" style="transition: stroke 0.5s ease;"></path>
        <path d="M12 2a10 10 0 0 0-6.88 17.14" style="transition: stroke 0.5s ease;"></path>
        <path d="M12 22a10 10 0 0 0 6.88-17.14" style="transition: stroke 0.5s ease;"></path>
        <path d="M20 14h-3.32" style="transition: stroke 0.5s ease;"></path>
        <path d="M7.32 14H4" style="transition: stroke 0.5s ease;"></path>
        <path d="m15 4-3 3-3-3" style="transition: stroke 0.5s ease;"></path>
    `;
    
    iconContainer.appendChild(svgIcon);
    iconContainer.addEventListener('click', toggleUsagePopup);
    document.body.appendChild(iconContainer);
    updateUsageIconDisplay(latestStats); // Initialize icon color
}

function toggleUsagePopup() {
    let popup = document.getElementById('usage-popup');
    if (popup) {
        const isVisible = popup.style.display === 'block' && !popup.classList.contains('popup-closing');
        if (isVisible) {
            // Start closing animation
            popup.classList.add('popup-closing');
            popup.classList.remove('popup-opening');
            setTimeout(() => {
                popup.style.display = 'none';
                popup.classList.remove('popup-closing'); // Clean up after animation
            }, 300); // Must match animation duration
        } else {
            // Start opening animation
            popup.style.display = 'block';
            popup.classList.add('popup-opening');
            popup.classList.remove('popup-closing');
            renderUsagePopupContent(latestStats, previousStats);
        }
    } else {
        createUsagePopup();
        // Trigger opening animation for the newly created popup
        const newPopup = document.getElementById('usage-popup');
        if (newPopup) {
            newPopup.classList.add('popup-opening');
        }
    }
}

function createUsagePopup() {
    const popup = document.createElement('div');
    popup.id = 'usage-popup';
    popup.style.position = 'fixed';
    popup.style.bottom = '60px'; 
    popup.style.left = '10px';
    popup.style.width = '300px'; // Increased width
    popup.style.background = 'rgba(255, 255, 255, 0.1)'; // iOS-style translucent white
    popup.style.color = '#f0f0f0';
    popup.style.border = '1px solid rgba(255, 255, 255, 0.18)'; // Lighter border
    popup.style.backdropFilter = 'blur(26px) saturate(180%)'; // iOS blur effect
    popup.style.webkitBackdropFilter = 'blur(26px) saturate(180%)'; // Safari compatibility
    popup.style.boxShadow = '0 5px 15px rgba(0,0,0,0.3)';
    popup.style.zIndex = '30000';
    popup.style.padding = '15px'; // Increased padding
    popup.style.borderRadius = '8px';
    popup.style.fontFamily = 'Arial, sans-serif';
    popup.style.fontSize = '14px'; // Increased base font size
    popup.style.boxSizing = 'border-box';

    // Add styles for animation
    const style = document.createElement('style');
    style.id = 'usage-popup-animations';
    style.textContent = `
        #usage-popup.popup-opening {
            animation: popup-fade-in 0.3s ease-out forwards;
        }
        #usage-popup.popup-closing {
            animation: popup-fade-out 0.3s ease-out forwards;
        }
        @keyframes popup-fade-in {
            from { opacity: 0; transform: translateY(15px); }
            to { opacity: 1; transform: translateY(0); }
        }
        @keyframes popup-fade-out {
            from { opacity: 1; transform: translateY(0); }
            to { opacity: 0; transform: translateY(15px); }
        }
    `;
    // Ensure styles are added only once
    if (!document.getElementById('usage-popup-animations')) {
        document.head.appendChild(style);
    }

    // Close ("X") icon button
    const closeButton = document.createElement('div');
    closeButton.innerHTML = '&times;'; // Simple times symbol for X
    closeButton.style.position = 'absolute';
    closeButton.style.top = '10px';
    closeButton.style.right = '15px';
    closeButton.style.fontSize = '24px'; // Larger X
    closeButton.style.color = '#aaa';
    closeButton.style.cursor = 'pointer';
    closeButton.style.lineHeight = '1';
    closeButton.title = 'Close';
    closeButton.onmouseover = () => { closeButton.style.color = '#fff'; };
    closeButton.onmouseout = () => { closeButton.style.color = '#aaa'; };
    closeButton.onclick = () => {
        popup.classList.add('popup-closing');
        popup.classList.remove('popup-opening');
        setTimeout(() => {
            popup.style.display = 'none';
            popup.classList.remove('popup-closing'); // Clean up
        }, 300);
    };

    const title = document.createElement('h3');
    title.textContent = 'System Resources';
    title.style.marginTop = '0';
    title.style.marginBottom = '15px'; // Increased margin
    title.style.borderBottom = '1px solid #555';
    title.style.paddingBottom = '10px'; // Increased padding
    title.style.fontSize = '17px'; // Increased title font size
    title.style.fontWeight = '500';
    title.style.marginRight = '20px'; // Ensure space for close button

    const contentArea = document.createElement('div');
    contentArea.id = 'usage-popup-content';
    contentArea.style.display = 'flex';
    contentArea.style.flexDirection = 'column';
    contentArea.style.gap = '15px'; // Increased gap

    popup.appendChild(closeButton); // Add close X icon first for proper layering if needed, or ensure title doesn't overlap
    popup.appendChild(title);
    popup.appendChild(contentArea);
    document.body.appendChild(popup);

    renderUsagePopupContent(latestStats, previousStats);
}


function renderUsagePopupContent(currentStats, prevStats) {
    const contentArea = document.getElementById('usage-popup-content');
    if (!contentArea) return;

    if (!currentStats) {
        contentArea.innerHTML = '<p style="text-align:center; color: #aaa;"><em>System stats not available. Retrying...</em></p>';
        return;
    }
    
    // Element IDs
    const cpuLoadId = 'cpu-load-value';
    const cpuAvailId = 'cpu-avail-value';
    const cpuProgressCenterTextId = 'cpu-progress-center-text';

    const ramUsedGbId = 'ram-used-gb';
    const ramTotalGbId = 'ram-total-gb';
    const ramUsedPercentId = 'ram-used-percent';
    const ramAvailGbId = 'ram-avail-gb';
    const ramAvailPercentId = 'ram-avail-percent';
    const ramProgressCenterTextId = 'ram-progress-center-text';

    const diskUsedGbId = 'disk-used-gb';
    const diskTotalGbId = 'disk-total-gb';
    const diskUsedPercentId = 'disk-used-percent';
    const diskFreeGbId = 'disk-free-gb';
    const diskFreePercentId = 'disk-free-percent';
    const diskProgressCenterTextId = 'disk-progress-center-text';

    // CPU Values
    const cpuLoadCurrent = currentStats.cpu_percent;
    const cpuAvailablePercentCurrent = 100 - cpuLoadCurrent;
    const cpuLoadPrev = prevStats ? prevStats.cpu_percent : cpuLoadCurrent;
    const cpuAvailablePercentPrev = prevStats ? (100 - prevStats.cpu_percent) : cpuAvailablePercentCurrent;

    // RAM Values
    const ramUsedPercentCurrent = currentStats.ram.percent_used;
    const ramAvailableGbCurrent = currentStats.ram.available_gb;
    const ramTotalGbCurrent = currentStats.ram.total_gb;
    const ramUsedGbCurrent = currentStats.ram.used_gb;
    const ramAvailablePercentCurrent = (ramAvailableGbCurrent / ramTotalGbCurrent) * 100;
    const ramUsedPercentPrev = prevStats ? prevStats.ram.percent_used : ramUsedPercentCurrent;
    const ramAvailableGbPrev = prevStats ? prevStats.ram.available_gb : ramAvailableGbCurrent;
    const ramUsedGbPrev = prevStats ? prevStats.ram.used_gb : ramUsedGbCurrent;
    const ramAvailablePercentPrev = prevStats ? ((prevStats.ram.available_gb / prevStats.ram.total_gb) * 100) : ramAvailablePercentCurrent;

    // Disk Values
    const diskStats = currentStats.disk;
    let diskUsedPercentCurrent, diskFreeGbCurrent, diskTotalGbCurrent, diskUsedGbCurrent, diskFreePercentCurrent;
    let diskUsedPercentPrev, diskFreeGbPrev, diskUsedGbPrev, diskFreePercentPrev;
    if (diskStats) {
        diskUsedPercentCurrent = diskStats.percent_used;
        diskFreeGbCurrent = diskStats.free_gb;
        diskTotalGbCurrent = diskStats.total_gb;
        diskUsedGbCurrent = diskStats.used_gb;
        diskFreePercentCurrent = (diskFreeGbCurrent / diskTotalGbCurrent) * 100;
        
        const prevDiskStats = prevStats ? prevStats.disk : null;
        diskUsedPercentPrev = prevDiskStats ? prevDiskStats.percent_used : diskUsedPercentCurrent;
        diskFreeGbPrev = prevDiskStats ? prevDiskStats.free_gb : diskFreeGbCurrent;
        diskUsedGbPrev = prevDiskStats ? prevDiskStats.used_gb : diskUsedGbCurrent;
        diskFreePercentPrev = prevDiskStats ? ((prevDiskStats.free_gb / prevDiskStats.total_gb) * 100) : diskFreePercentCurrent;
    }

    // --- Build or update sections ---
    let cpuSection = contentArea.querySelector('#usage-cpu-section');
    if (!cpuSection) {
        contentArea.innerHTML = ''; // Clear and rebuild if sections are missing
        cpuSection = document.createElement('div');
        cpuSection.id = 'usage-cpu-section';
        contentArea.appendChild(cpuSection);
    }
    let cpuCircleColor = '#4CAF50';
    if (cpuLoadCurrent > 80) cpuCircleColor = '#D32F2F';
    else if (cpuLoadCurrent > 50) cpuCircleColor = '#FBC02D';

    cpuSection.innerHTML = `
        <div style="margin-bottom: 5px; font-weight: bold;">CPU Usage</div>
        <div style="display: flex; align-items: center; justify-content: space-around;">
            ${createCircularProgress(cpuLoadCurrent, cpuProgressCenterTextId, null, cpuCircleColor, '', cpuLoadCurrent.toFixed(1) , '%')}
            <div style="text-align: right; font-size: 13px;">
                Used: <span id="${cpuLoadId}">${cpuLoadCurrent.toFixed(1)}</span>%<br>
                Available: <span id="${cpuAvailId}" style="color: #4CAF50; font-weight: bold;">${cpuAvailablePercentCurrent.toFixed(1)}%</span>
            </div>
        </div>
    `;

    let ramSection = contentArea.querySelector('#usage-ram-section');
    if (!ramSection) {
        ramSection = document.createElement('div');
        ramSection.id = 'usage-ram-section';
        contentArea.appendChild(ramSection);
    }
    const ramCircleColor = '#2196F3';
    const availableRamColor = '#4CAF50';
    ramSection.innerHTML = `
        <div style="margin-bottom: 5px; font-weight: bold; margin-top: 10px;">System RAM</div>
        <div style="display: flex; align-items: center; justify-content: space-around;">
            ${createCircularProgress(ramUsedPercentCurrent, ramProgressCenterTextId, null, ramCircleColor, '', ramUsedPercentCurrent.toFixed(1), '%')}
            <div style="text-align: right; font-size: 13px;">
                Used: <span id="${ramUsedGbId}">${ramUsedGbCurrent.toFixed(1)}</span> / <span id="${ramTotalGbId}">${ramTotalGbCurrent.toFixed(1)}</span> GB (<span id="${ramUsedPercentId}">${ramUsedPercentCurrent.toFixed(1)}</span>%)<br>
                Available: <span id="${ramAvailGbId}" style="color: ${availableRamColor}; font-weight: bold;">${ramAvailableGbCurrent.toFixed(1)} GB</span> (<span id="${ramAvailPercentId}" style="color: ${availableRamColor}; font-weight: bold;">${ramAvailablePercentCurrent.toFixed(1)}%</span>)
            </div>
        </div>
    `;

    // Disk Section
    let diskSection = contentArea.querySelector('#usage-disk-section');
    if (diskStats) {
        if (!diskSection) {
            diskSection = document.createElement('div');
            diskSection.id = 'usage-disk-section';
            contentArea.appendChild(diskSection);
        }
        let diskCircleColor = '#9C27B0'; // Purple for disk
        if (diskUsedPercentCurrent > 90) diskCircleColor = '#D32F2F';
        else if (diskUsedPercentCurrent > 75) diskCircleColor = '#FBC02D';

        diskSection.innerHTML = `
            <div style="margin-bottom: 5px; font-weight: bold; margin-top: 10px;">Disk Storage</div>
            <div style="display: flex; align-items: center; justify-content: space-around;">
                ${createCircularProgress(diskUsedPercentCurrent, diskProgressCenterTextId, null, diskCircleColor, '', diskUsedPercentCurrent.toFixed(1), '%')}
                <div style="text-align: right; font-size: 13px;">
                    Used: <span id="${diskUsedGbId}">${diskUsedGbCurrent.toFixed(1)}</span> / <span id="${diskTotalGbId}">${diskTotalGbCurrent.toFixed(1)}</span> GB (<span id="${diskUsedPercentId}">${diskUsedPercentCurrent.toFixed(1)}</span>%)<br>
                    Free: <span id="${diskFreeGbId}" style="color: #4CAF50; font-weight: bold;">${diskFreeGbCurrent.toFixed(1)} GB</span> (<span id="${diskFreePercentId}" style="color: #4CAF50; font-weight: bold;">${diskFreePercentCurrent.toFixed(1)}%</span>)
                </div>
            </div>
        `;
    } else if (diskSection) {
        diskSection.remove();
    }
    
    // --- THIS IS THE RESTORED SECTION FOR RUNNING THREADS ---
    let topProcessesSection = contentArea.querySelector('#usage-top-processes-section');
    if (currentStats.top_processes && currentStats.top_processes.length > 0) {
        if (!topProcessesSection) {
            topProcessesSection = document.createElement('div');
            topProcessesSection.id = 'usage-top-processes-section';
            contentArea.appendChild(topProcessesSection);
        }
        let processesHtml = '<div style="margin-bottom: 5px; font-weight: bold; margin-top: 10px;">Running Threads</div><ul style="margin: 0; padding-left: 20px; font-size: 12px; list-style-type: none;">';
        currentStats.top_processes.forEach(proc => {
            let procName = proc.name;
            if (proc.name.toLowerCase().includes('python')) { // Made more generic
                procName = 'Thread';
            }
            processesHtml += `<li style="display: flex; justify-content: space-between;"><span>${procName.length > 25 ? procName.substring(0,22) + '...' : procName}</span> <span>${proc.cpu.toFixed(1)}%</span></li>`;
        });
        processesHtml += '</ul>';
        topProcessesSection.innerHTML = processesHtml;
    } else if (topProcessesSection) {
        topProcessesSection.remove();
    }

    // --- Animate numerical values ---
    const animDuration = 500;
    animateValue(document.getElementById(cpuLoadId), cpuLoadPrev, cpuLoadCurrent, animDuration, 1);
    animateValue(document.getElementById(cpuAvailId), cpuAvailablePercentPrev, cpuAvailablePercentCurrent, animDuration, 1, '', '%');
    const cpuCenterValEl = document.getElementById(cpuProgressCenterTextId + '-value');
    if(cpuCenterValEl) animateValue(cpuCenterValEl, cpuLoadPrev, cpuLoadCurrent, animDuration, 1);

    animateValue(document.getElementById(ramUsedGbId), ramUsedGbPrev, ramUsedGbCurrent, animDuration, 1);
    animateValue(document.getElementById(ramTotalGbId), prevStats ? prevStats.ram.total_gb : ramTotalGbCurrent, ramTotalGbCurrent, animDuration, 1);
    animateValue(document.getElementById(ramUsedPercentId), ramUsedPercentPrev, ramUsedPercentCurrent, animDuration, 1);
    animateValue(document.getElementById(ramAvailGbId), ramAvailableGbPrev, ramAvailableGbCurrent, animDuration, 1, '', ' GB');
    animateValue(document.getElementById(ramAvailPercentId), ramAvailablePercentPrev, ramAvailablePercentCurrent, animDuration, 1, '', '%');
    const ramCenterValEl = document.getElementById(ramProgressCenterTextId + '-value');
    if(ramCenterValEl) animateValue(ramCenterValEl, ramUsedPercentPrev, ramUsedPercentCurrent, animDuration, 1, '', '%');

    if (diskStats) {
        animateValue(document.getElementById(diskUsedGbId), diskUsedGbPrev, diskUsedGbCurrent, animDuration, 1);
        animateValue(document.getElementById(diskTotalGbId), prevStats && prevStats.disk ? prevStats.disk.total_gb : diskTotalGbCurrent, diskTotalGbCurrent, animDuration, 1);
        animateValue(document.getElementById(diskUsedPercentId), diskUsedPercentPrev, diskUsedPercentCurrent, animDuration, 1);
        animateValue(document.getElementById(diskFreeGbId), diskFreeGbPrev, diskFreeGbCurrent, animDuration, 1, '', ' GB');
        animateValue(document.getElementById(diskFreePercentId), diskFreePercentPrev, diskFreePercentCurrent, animDuration, 1, '', '%');
        const diskCenterValEl = document.getElementById(diskProgressCenterTextId + '-value');
        if(diskCenterValEl) animateValue(diskCenterValEl, diskUsedPercentPrev, diskUsedPercentCurrent, animDuration, 1);
    }

    // --- Update circle visuals (SVG progress rings) ---
    const cpuSvg = document.getElementById(cpuProgressCenterTextId+"-svg");
    if (cpuSvg) {
        const circle = cpuSvg.querySelector(".progress-ring-circle");
        const textElement = cpuSvg.querySelector("text");
        circle.style.stroke = cpuCircleColor;
        if (textElement) textElement.setAttribute('fill', cpuCircleColor);
        const radius = parseFloat(circle.getAttribute('r'));
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (cpuLoadCurrent / 100) * circumference;
        circle.style.strokeDashoffset = offset;
    }
    const ramSvg = document.getElementById(ramProgressCenterTextId+"-svg");
    if (ramSvg) {
        const circle = ramSvg.querySelector(".progress-ring-circle");
        const textElement = ramSvg.querySelector("text");
        circle.style.stroke = ramCircleColor;
        if (textElement) textElement.setAttribute('fill', ramCircleColor);
        const radius = parseFloat(circle.getAttribute('r'));
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (ramUsedPercentCurrent / 100) * circumference;
        circle.style.strokeDashoffset = offset;
    }
    if (diskStats) {
        const diskSvg = document.getElementById(diskProgressCenterTextId+"-svg");
        if (diskSvg) {
            const circle = diskSvg.querySelector(".progress-ring-circle");
            const textElement = diskSvg.querySelector("text");
            let diskCircleColor = '#9C27B0'; // Purple for disk
            if (diskUsedPercentCurrent > 90) diskCircleColor = '#D32F2F';
            else if (diskUsedPercentCurrent > 75) diskCircleColor = '#FBC02D';
            circle.style.stroke = diskCircleColor;
            if (textElement) textElement.setAttribute('fill', diskCircleColor);
            const radius = parseFloat(circle.getAttribute('r'));
            const circumference = 2 * Math.PI * radius;
            const offset = circumference - (diskUsedPercentCurrent / 100) * circumference;
            circle.style.strokeDashoffset = offset;
        }
    }
}

function createCircularProgress(percentage, centerTextId, label, color, centerTextPrefix = '', centerTextValue = '', centerTextSuffix = '') {
    const size = 70; // Increased SVG size
    const strokeWidth = 8; // Adjusted stroke width for larger circle
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percentage / 100) * circumference;

    let displayValue = typeof centerTextValue === 'number' ? centerTextValue.toFixed(1) : centerTextValue;

    let centerTextHtml = `
        <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="11" fill="${color}"> <!-- Increased font size -->
            ${centerTextPrefix}<tspan id="${centerTextId}-value">${displayValue}</tspan>${centerTextSuffix}
        </text>
    `;
    
    let labelHtml = '';
    if (label) { 
        labelHtml = `<div style="font-size: 11px; margin-top: 5px; color: #ccc;">${label}</div>`; // Increased font size
    }

    return `
        <div style="text-align: center; width: 80px;"> <!-- Adjusted width for larger SVG -->
            <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" id="${centerTextId}-svg">
                <circle
                    stroke="#555"
                    fill="transparent"
                    stroke-width="${strokeWidth}"
                    r="${radius}"
                    cx="${size/2}"
                    cy="${size/2}"
                />
                <circle
                    class="progress-ring-circle" // Added class for easier selection
                    stroke="${color}"
                    fill="transparent"
                    stroke-width="${strokeWidth}"
                    stroke-dasharray="${circumference} ${circumference}"
                    style="stroke-dashoffset: ${offset}; transition: stroke-dashoffset 0.35s ease-out;"
                    transform="rotate(-90 ${size/2} ${size/2})"
                    r="${radius}"
                    cx="${size/2}"
                    cy="${size/2}"
                />
                ${centerTextHtml}
            </svg>
            ${labelHtml}
        </div>
    `;
}

// Expose the initialization function if needed, or call it directly if this script is loaded last.
// For now, we'll assume main.js will call initializeUsageMonitor.

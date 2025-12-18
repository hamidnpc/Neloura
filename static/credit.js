// static/credit.js

function initializeCreditButton() {
    // Only initialize in top-level window; never inside iframes (multi-panel panes)
    try { if (window.self !== window.top) return; } catch(_) {}
    // Ensure single instance
    if (document.getElementById('credit-icon-container')) return;
    createCreditIcon();
}

function createCreditIcon() {
    // Only one instance in top-level
    if (document.getElementById('credit-icon-container')) return;
    const iconContainer = document.createElement('div');
    iconContainer.id = 'credit-icon-container';
    iconContainer.style.position = 'fixed';
    iconContainer.style.bottom = '10px';
    
    // Position it next to the usage icon.
    const usageIcon = document.getElementById('usage-icon-container');
    if (usageIcon) {
        // Position dynamically based on the usage icon's location.
        const usageIconRect = usageIcon.getBoundingClientRect();
        iconContainer.style.left = `${usageIconRect.right + 10}px`;
    } else {
        // Fallback position if usage icon isn't found.
        iconContainer.style.left = '64px';
    }

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
    iconContainer.title = 'Show Credits';
    iconContainer.style.boxShadow = '0 18px 50px rgba(0,0,0,0.35)';

    const svgIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgIcon.setAttribute("width", "24");
    svgIcon.setAttribute("height", "24");
    svgIcon.setAttribute("viewBox", "0 0 24 24");
    svgIcon.setAttribute("fill", "none");
    svgIcon.style.stroke = "#4CAF50"; // Start with a default color
    svgIcon.style.strokeWidth = "2";
    svgIcon.style.strokeLinecap = "round";
    svgIcon.style.strokeLinejoin = "round";
    svgIcon.innerHTML = `
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
    `;

    iconContainer.appendChild(svgIcon);
    iconContainer.addEventListener('click', toggleCreditPopup);
    document.body.appendChild(iconContainer);
}

function toggleCreditPopup() {
    let popup = document.getElementById('credit-popup');
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
            // Hide usage popup if it is open
            const usagePopup = document.getElementById('usage-popup');
            if (usagePopup && usagePopup.style.display === 'block') {
                 // Close the usage popup with its animation
                if (typeof toggleUsagePopup === 'function') {
                    toggleUsagePopup();
                } else {
                    usagePopup.style.display = 'none';
                }
            }
        }
    } else {
        createCreditPopup();
        // Trigger opening animation for the newly created popup
        const newPopup = document.getElementById('credit-popup');
        if (newPopup) {
            newPopup.classList.add('popup-opening');
        }
    }
}

function createCreditPopup() {
    const popup = document.createElement('div');
    popup.id = 'credit-popup';
    popup.style.position = 'fixed';
    popup.style.bottom = '60px';
    popup.style.left = '10px';
    popup.style.width = '420px';
    popup.style.background = 'rgba(255, 255, 255, 0.1)'; // iOS-style translucent white
    popup.style.color = '#f0f0f0';
    popup.style.border = '1px solid rgba(255, 255, 255, 0.18)'; // Lighter border
    popup.style.backdropFilter = 'blur(26px) saturate(180%)'; // iOS blur effect
    popup.style.webkitBackdropFilter = 'blur(26px) saturate(180%)'; // Safari compatibility
    popup.style.boxShadow = '0 5px 15px rgba(0,0,0,0.3)';
    popup.style.zIndex = '3000';
    popup.style.padding = '15px';
    popup.style.borderRadius = '8px';
    popup.style.fontFamily = 'Arial, sans-serif';
    popup.style.fontSize = '14px';
    popup.style.boxSizing = 'border-box';
    popup.style.display = 'block';

    // Add a style tag for animations and link styling
    const style = document.createElement('style');
    style.id = 'credit-popup-animations'; // Unique ID for this style tag
    style.textContent = `
        .credit-tab-content {
            animation: fadeIn 0.5s ease-in-out;
        }

        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        #credit-popup a {
            color: #9370DB; /* Medium Purple */
            text-decoration: none;
        }
        #credit-popup a:hover {
            text-decoration: underline;
        }

        /* Popup animations */
        #credit-popup.popup-opening {
            animation: popup-fade-in 0.3s ease-out forwards;
        }
        #credit-popup.popup-closing {
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
    // Ensure styles are added only once to avoid duplicates
    if (!document.getElementById('credit-popup-animations')) {
        document.head.appendChild(style);
    }

    const closeButton = document.createElement('div');
    closeButton.innerHTML = '&times;';
    closeButton.style.position = 'absolute';
    closeButton.style.top = '10px';
    closeButton.style.right = '15px';
    closeButton.style.fontSize = '24px';
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
    title.textContent = 'Credits';
    title.style.marginTop = '0';
    title.style.marginBottom = '15px';
    title.style.borderBottom = '1px solid #555';
    title.style.paddingBottom = '10px';
    title.style.fontSize = '17px';
    title.style.fontWeight = '500';

    popup.appendChild(closeButton);
    popup.appendChild(title);

    // Tab navigation
    const tabsContainer = document.createElement('div');
    tabsContainer.style.display = 'flex';
    tabsContainer.style.marginBottom = '15px';
    tabsContainer.style.borderBottom = '1px solid #555';

    const tabs = ['Neloura', 'Codes', 'Data', 'Feedback', 'Log'];
    tabs.forEach((tabName, index) => {
        const tab = document.createElement('div');
        tab.textContent = tabName;
        tab.style.padding = '8px 12px';
        tab.style.cursor = 'pointer';
        tab.style.borderBottom = '2px solid transparent';
        tab.dataset.tabId = `credit-tab-content-${index}`;
        if (index === 0) {
            tab.style.borderBottom = '2px solid #2196F3';
            tab.style.color = '#2196F3';
        }
        tab.onclick = (e) => {
            // Reset all tabs styles
            e.target.parentElement.childNodes.forEach(child => {
                child.style.borderBottom = '2px solid transparent';
                child.style.color = '#f0f0f0';
            });
            // Set active tab style
            e.target.style.borderBottom = '2px solid #2196F3';
            e.target.style.color = '#2196F3';
            
            // Hide all tab content
            document.querySelectorAll('.credit-tab-content').forEach(content => {
                content.style.display = 'none';
            });
            // Show selected tab content
            const activeTab = document.getElementById(e.target.dataset.tabId);
            activeTab.style.display = 'block';
        };
        tabsContainer.appendChild(tab);
    });

    popup.appendChild(tabsContainer);

    // Tab content area
    const contentArea = document.createElement('div');
    contentArea.id = 'credit-popup-content-area';
    popup.appendChild(contentArea);

    // Content for each tab
    const nelouraCreditContent = document.createElement('div');
    nelouraCreditContent.id = 'credit-tab-content-0';
    nelouraCreditContent.className = 'credit-tab-content';
    nelouraCreditContent.innerHTML = `<p><strong>Principal Investigator:</strong><br><a href="https://apps.ualberta.ca/directory/person/hhassani" target="_blank" rel="noopener noreferrer">Hamid Hassani</a><br><a href="mailto:hhassani@ualberta.ca">hhassani@ualberta.ca</a></p>
                                   `;

    const codeCreditContent = document.createElement('div');
    codeCreditContent.id = 'credit-tab-content-1';
    codeCreditContent.className = 'credit-tab-content';
    codeCreditContent.style.display = 'none';
    codeCreditContent.innerHTML = `<div style="max-height: 200px; overflow-y: auto;">
                                       <p><strong>Backend (Python):</strong></p>
                                       <ul>
                                           <li>Aiohttp</li>
                                           <li>Astropy</li>
                                           <li>FastAPI</li>
                                           <li>Matplotlib</li>
                                           <li>NumPy</li>
                                           <li>Pillow</li>
                                           <li>Photutils</li>
                                           <li>Psutil</li>
                                           <li>Pydantic</li>
                                           <li>Regions</li>
                                           <li>Reproject</li>
                                           <li>Scikit-image</li>
                                           <li>Scipy</li>
                                           <li>Spectral-cube</li>
                                           <li>Uvicorn</li>
                                       </ul>
                                       <p><strong>Frontend (JavaScript):</strong></p>
                                       <ul>
                                           <li>OpenSeadragon</li>
                                           <li>D3.js</li>
                                           <li>SweetAlert2</li>
                                       </ul>
                                   </div>`;

    const dataCreditContent = document.createElement('div');
    dataCreditContent.id = 'credit-tab-content-2';
    dataCreditContent.className = 'credit-tab-content';
    dataCreditContent.style.display = 'none';
    dataCreditContent.innerHTML = `<div style="max-height: 200px; overflow-y: auto; font-size: 13px;">
                                       <p>This work utilizes data from the following projects:</p>
                                       <strong>PHANGS-JWST</strong>
                                       <ul style="margin-top: 5px;">
                                           <li><a href="https://ui.adsabs.harvard.edu/abs/2023ApJ...944L..17L/abstract" target="_blank" rel="noopener noreferrer">Lee et al. 2023</a></li>
                                           <li><a href="https://ui.adsabs.harvard.edu/abs/2024ApJS..273...13W/abstract" target="_blank" rel="noopener noreferrer">Williams et al. 2024</a></li>
                                       </ul>
                                       <strong>PHANGS-ALMA</strong>
                                       <ul style="margin-top: 5px;">
                                           <li><a href="https://ui.adsabs.harvard.edu/abs/2021ApJS..257...43L/abstract" target="_blank" rel="noopener noreferrer">Leroy et al. 2021</a></li>
                                       </ul>
                                       <strong>PHANGS-HST</strong>
                                       <ul style="margin-top: 5px;">
                                           <li><a href="https://ui.adsabs.harvard.edu/abs/2022ApJS..258...10L/abstract" target="_blank" rel="noopener noreferrer">Lee et al. 2022</a></li>
                                       </ul>
                                       <strong>PHANGS-MUSE</strong>
                                       <ul style="margin-top: 5px;">
                                           <li><a href="https://ui.adsabs.harvard.edu/abs/2022A%26A...659A.191E/abstract" target="_blank" rel="noopener noreferrer">Emsellem et al. 2022</a></li>
                                       </ul>
                                   </div>`;

    const feedbackContent = document.createElement('div');
    feedbackContent.id = 'credit-tab-content-3';
    feedbackContent.className = 'credit-tab-content';
    feedbackContent.style.display = 'none';
    feedbackContent.innerHTML = `<p>Help make Neloura better by reporting bugs and sharing the features you’d love to see:</p>
                                 <a href="https://forms.gle/DCuoMUNC5TV5B1GU7" target="_blank" rel="noopener noreferrer">Submit Feedback</a>`;

    const logContent = document.createElement('div');
    logContent.id = 'credit-tab-content-4';
    logContent.className = 'credit-tab-content';
    logContent.style.display = 'none';
    logContent.innerHTML = `<div style=\"display:flex; align-items:center; gap:8px; margin-bottom:8px;\">
                                <button id=\"credit-log-open-modal\" style=\"padding:6px 10px; border:1px solid #555; background:#2a2a2a; color:#eee; border-radius:4px; cursor:pointer;\">View application log</button>
                            </div>`;

    setTimeout(()=>{
        try {
            const openBtn = document.getElementById('credit-log-open-modal');
            if (openBtn) openBtn.onclick = async ()=>{
                try {
                    if (!window.__sid) { const rs = await fetch('/session/start'); const js = await rs.json(); window.__sid = js.session_id; }
                    const res = await fetch(`/log?lines=5000`, { headers: window.__sid ? { 'X-Session-ID': window.__sid } : {} });
                    const text = await res.text();
                    const modal = document.getElementById('fits-header-modal');
                    if (!modal) { alert(text); return; }
                    const titleEl = document.getElementById('fits-header-filename');
                    const container = document.getElementById('fits-header-table-container');
                    const search = document.getElementById('fits-header-search');
                    if (titleEl) titleEl.textContent = 'Application Log';
                    if (container) {
                        const pre = document.createElement('pre');
                        pre.id = 'credit-log-modal-pre';
                        pre.style.whiteSpace = 'pre-wrap'; pre.style.color = '#ddd'; pre.style.fontSize = '12px'; pre.style.lineHeight = '1.4';
                        pre.textContent = text || 'No log output.';
                        container.innerHTML = ''; container.appendChild(pre);
                    }
                    if (search) {
                        search.value='';
                        search.placeholder = 'Filter log (text match)';
                        const fullText = text || '';
                        const doFilter = ()=>{
                            try {
                                const q = (search.value||'').toLowerCase();
                                const pre = document.getElementById('credit-log-modal-pre');
                                if (!pre) return;
                                if (!q) { pre.textContent = fullText; return; }
                                const filtered = fullText.split('\n').filter(line=> line.toLowerCase().includes(q)).join('\n');
                                pre.textContent = filtered || '(no matches)';
                            } catch(_){ }
                        };
                        search.oninput = doFilter;
                    }
                    modal.style.display = 'block'; modal.classList.remove('fade-out');
                } catch (e) {
                    alert('Failed to load log: '+e);
                }
            };
        } catch(_){ }
    }, 0);

    contentArea.appendChild(nelouraCreditContent);
    contentArea.appendChild(codeCreditContent);
    contentArea.appendChild(dataCreditContent);
    contentArea.appendChild(feedbackContent);
    contentArea.appendChild(logContent);
    
    document.body.appendChild(popup);
} 
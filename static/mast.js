// MAST search and download module (mirrors NED UX)

let currentMastSearch = null;
let mastPage = 1;
let totalMastHits = 0;
let mastLoadingMore = false;

function initializeMastContent() {
    const mastContent = document.getElementById('mast-content');
    if (!mastContent || mastContent.childElementCount > 0) return;

    const heading = document.createElement('h3');
    heading.textContent = 'Search MAST Archive';
    heading.style.fontSize = '16px';
    heading.style.margin = '0 0 15px 0';
    heading.style.color = '#fff';

    const searchContainer = document.createElement('div');
    searchContainer.style.marginBottom = '12px';

    const searchLabel = document.createElement('label');
    searchLabel.textContent = 'Enter object name or coordinates:';
    searchLabel.style.display = 'block';
    searchLabel.style.marginBottom = '8px';
    searchLabel.style.color = '#ddd';

    const searchInput = document.createElement('input');
    searchInput.id = 'mast-search-input';
    searchInput.type = 'text';
    searchInput.placeholder = 'e.g., NGC 628, M74, or 24.174, 15.783';
    searchInput.style.width = '100%';
    searchInput.style.padding = '10px';
    searchInput.style.marginBottom = '10px';
    searchInput.style.backgroundColor = '#333';
    searchInput.style.color = 'white';
    searchInput.style.border = '1px solid #555';
    searchInput.style.borderRadius = '4px';
    searchInput.style.fontSize = '14px';

    const controlsRow = document.createElement('div');
    controlsRow.style.display = 'grid';
    controlsRow.style.gridTemplateColumns = '1fr 1fr 1fr';
    controlsRow.style.gap = '10px';
    controlsRow.style.marginBottom = '10px';

    const radiusInput = document.createElement('input');
    radiusInput.id = 'mast-radius-input';
    radiusInput.type = 'number';
    radiusInput.min = '0.001';
    radiusInput.step = '0.01';
    radiusInput.value = '0.1';
    radiusInput.title = 'Search radius in degrees';
    radiusInput.placeholder = 'Radius (deg)';
    Object.assign(radiusInput.style, {
        padding: '8px', backgroundColor: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px'
    });

    const missionFilter = document.createElement('select');
    missionFilter.id = 'mast-mission-filter';
    Object.assign(missionFilter.style, {
        padding: '8px', backgroundColor: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px'
    });
    ;['', 'HST', 'JWST'].forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m ? m : 'All Missions';
        missionFilter.appendChild(opt);
    });
    missionFilter.value = 'HST';
    missionFilter.addEventListener('change', () => {
        const m = missionFilter.value;
        // Mission-specific default radii
        if (m === 'JWST') radiusInput.value = '0.1';
        else if (m === 'HST') radiusInput.value = '0.05';
        else radiusInput.value = '0.1';
    });

    const calibLevelFilter = document.createElement('select');
    calibLevelFilter.id = 'mast-calib-level-filter';
    Object.assign(calibLevelFilter.style, {
        padding: '8px', backgroundColor: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px'
    });
    ;[['Any', 0], ['1', 1], ['2', 2], ['3 (Recommended)', 3], ['4', 4]].forEach(([text, val]) => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = text;
        if (val === 3) opt.selected = true;
        calibLevelFilter.appendChild(opt);
    });

    // Wrap controls with visible labels
    const makeLabeled = (labelText, element) => {
        const wrap = document.createElement('div');
        const lab = document.createElement('div');
        lab.textContent = labelText;
        Object.assign(lab.style, { color: '#aaa', fontSize: '12px', marginBottom: '4px' });
        wrap.appendChild(lab);
        wrap.appendChild(element);
        return wrap;
    };

    controlsRow.appendChild(makeLabeled('Search radius', radiusInput));
    controlsRow.appendChild(makeLabeled('Telescope', missionFilter));
    controlsRow.appendChild(makeLabeled('Data level', calibLevelFilter));

    const searchButton = document.createElement('button');
    searchButton.id = 'mast-search-button';
    searchButton.textContent = 'Search MAST';
    Object.assign(searchButton.style, {
        backgroundColor: '#2196F3', color: 'white', border: 'none', borderRadius: '4px',
        padding: '10px 16px', cursor: 'pointer', width: '100%', fontWeight: 'bold'
    });
    searchButton.addEventListener('mouseover', function() { this.style.backgroundColor = '#0b7dda'; });
    searchButton.addEventListener('mouseout', function() { this.style.backgroundColor = '#2196F3'; });

    const resultsContainer = document.createElement('div');
    resultsContainer.id = 'mast-results-container';
    resultsContainer.style.marginTop = '16px';
    resultsContainer.style.display = 'none';

    const resultsHeading = document.createElement('h4');
    resultsHeading.id = 'mast-results-heading';
    resultsHeading.textContent = 'Search Results';
    resultsHeading.style.fontSize = '14px';
    resultsHeading.style.margin = '0 0 10px 0';
    resultsHeading.style.color = '#fff';

    const resultsFilterInput = document.createElement('input');
    resultsFilterInput.id = 'mast-results-filter';
    resultsFilterInput.placeholder = 'Filter displayed results by name, instrument, etc...';
    Object.assign(resultsFilterInput.style, {
        width: '100%',
        padding: '8px',
        marginBottom: '10px',
        backgroundColor: '#222',
        color: 'white',
        border: '1px solid #555',
        borderRadius: '4px',
        display: 'none' // Initially hidden
    });
    resultsFilterInput.addEventListener('keyup', () => {
        const filterText = resultsFilterInput.value.toLowerCase();
        const items = document.querySelectorAll('.mast-result-item');
        items.forEach(item => {
            const itemText = item.textContent || item.innerText;
            if (itemText.toLowerCase().includes(filterText)) {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    });

    const loadingIndicator = document.createElement('div');
    loadingIndicator.id = 'mast-loading-indicator';
    loadingIndicator.style.display = 'none';
    loadingIndicator.style.textAlign = 'center';
    loadingIndicator.style.padding = '20px 0';
    const spinner = document.createElement('div');
    spinner.style.width = '40px';
    spinner.style.height = '40px';
    spinner.style.border = '4px solid rgba(255, 255, 255, 0.3)';
    spinner.style.borderRadius = '50%';
    spinner.style.borderTop = '4px solid white';
    spinner.style.margin = '0 auto 10px auto';
    spinner.style.animation = 'spin 1s linear infinite';
    const loadingText = document.createElement('div');
    loadingText.textContent = 'Searching MAST...';
    loadingText.style.color = '#ddd';
    loadingIndicator.appendChild(spinner);
    loadingIndicator.appendChild(loadingText);

    const resultsList = document.createElement('div');
    resultsList.id = 'mast-results-list';
    resultsList.style.height = 'calc(100vh - 250px)';
    resultsList.style.overflowY = 'auto';
    resultsList.style.backgroundColor = '#222';
    resultsList.style.borderRadius = '4px';
    resultsList.style.padding = '10px';
    resultsList.style.marginTop = '10px';
    resultsList.style.overflowX = 'hidden';

    resultsContainer.appendChild(resultsHeading);
    resultsContainer.appendChild(resultsFilterInput);
    resultsContainer.appendChild(resultsList);

    const loadMoreButton = document.createElement('button');
    loadMoreButton.id = 'mast-load-more-btn';
    loadMoreButton.textContent = 'Load More Observations';
    Object.assign(loadMoreButton.style, {
        width: '100%',
        padding: '10px',
        marginTop: '10px',
        backgroundColor: '#00558b',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        display: 'none'
    });
    loadMoreButton.addEventListener('click', () => {
        if (!mastLoadingMore) {
            loadMoreMastResults();
        }
    });

    searchContainer.appendChild(searchLabel);
    searchContainer.appendChild(searchInput);
    searchContainer.appendChild(controlsRow);
    searchContainer.appendChild(searchButton);

    mastContent.appendChild(heading);
    mastContent.appendChild(searchContainer);
    mastContent.appendChild(loadingIndicator);
    mastContent.appendChild(resultsContainer);
    mastContent.appendChild(loadMoreButton);

    searchButton.addEventListener('click', function() {
        performMastSearch();
    });
    searchInput.addEventListener('keyup', function(event) {
        if (event.key === 'Enter') performMastSearch();
    });
}

async function performMastSearch() {
    const query = (document.getElementById('mast-search-input')?.value || '').trim();
    const radiusDeg = parseFloat(document.getElementById('mast-radius-input')?.value || '0.05') || 0.05;
    const mission = document.getElementById('mast-mission-filter')?.value || '';
    const calibLevel = document.getElementById('mast-calib-level-filter')?.value || '2';

    const loadingIndicator = document.getElementById('mast-loading-indicator');
    const resultsContainer = document.getElementById('mast-results-container');
    const resultsList = document.getElementById('mast-results-list');
    if (!resultsList) return;

    if (!query) {
        showNotification('Please enter a search term', 2000, 'warning');
        return;
    }

    // Reset for new search
    mastPage = 1;
    totalMastHits = 0;
    resultsList.innerHTML = '';
    document.getElementById('mast-load-more-btn').style.display = 'none';
    document.getElementById('mast-results-filter').style.display = 'none';
    document.getElementById('mast-results-filter').value = '';


    if (loadingIndicator) loadingIndicator.style.display = 'block';
    if (resultsContainer) resultsContainer.style.display = 'none';

    try {
        let ra = null, dec = null, nameResolved = null;

        // Try to parse as coordinates "ra, dec"
        const coordMatch = query.match(/^\s*([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)\s*$/);
        if (coordMatch) {
            ra = parseFloat(coordMatch[1]);
            dec = parseFloat(coordMatch[2]);
        } else {
            // Let backend resolve via astroquery by passing objectname to /mast/search
            nameResolved = query;
        }

        currentMastSearch = { ra, dec, nameResolved, radiusDeg, mission, calibLevel };
        
        await fetchAndDisplayMastPage();

    } catch (error) {
        console.error('Error fetching from MAST:', error);
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        if (resultsContainer) resultsContainer.style.display = 'block';
        const resultsList = document.getElementById('mast-results-list');
        if (resultsList) {
            resultsList.innerHTML = `
                <div style="padding: 20px; text-align: center; color: #f44336; background: rgba(244, 67, 54, 0.1); border-radius: 4px; border: 1px solid #f44336;">
                    <div style="font-size: 16px; font-weight: bold; margin-bottom: 8px;">Search Error</div>
                    <div style="font-size: 14px;">${error.message}</div>
                </div>
            `;
        }
        showNotification(`Error searching MAST: ${error.message}`, 4000, 'error');
    }
}

async function fetchAndDisplayMastPage() {
    const { ra, dec, nameResolved, radiusDeg, mission, calibLevel } = currentMastSearch;

    const loadingIndicator = document.getElementById('mast-loading-indicator');
    const resultsContainer = document.getElementById('mast-results-container');
    const resultsList = document.getElementById('mast-results-list');
    const loadMoreBtn = document.getElementById('mast-load-more-btn');
    const filterInput = document.getElementById('mast-results-filter');

    if (mastPage === 1) {
        if (loadingIndicator) loadingIndicator.style.display = 'block';
        if (resultsContainer) resultsContainer.style.display = 'none';
    } else {
        mastLoadingMore = true;
        loadMoreBtn.textContent = 'Loading...';
        loadMoreBtn.style.backgroundColor = '#555';
    }

    try {
        const base = `/mast/search?radius=${encodeURIComponent(radiusDeg)}&pagesize=10&page=${mastPage}&mission=${encodeURIComponent(mission)}&min_calib_level=${encodeURIComponent(calibLevel)}`;
        const searchUrl = (nameResolved && (ra === null || dec === null))
            ? `${base}&objectname=${encodeURIComponent(nameResolved)}`
            : `${base}&ra=${encodeURIComponent(ra)}&dec=${encodeURIComponent(dec)}`;
        const obsResp = await apiFetch(searchUrl);
        if (!obsResp.ok) throw new Error(`MAST search HTTP ${obsResp.status}`);
        
        const obsJson = await obsResp.json();
        const rows = obsJson?.data || [];
        
        if (mastPage === 1) {
            // Can't get total from paged search, so we just check if we got a full page
            totalMastHits = rows.length; // Placeholder
            resultsList.innerHTML = '';
        } else {
            totalMastHits += rows.length;
        }

        // Render results
        if (mastPage === 1) {
            const targetInfo = document.createElement('div');
            targetInfo.style.backgroundColor = '#222';
            targetInfo.style.borderRadius = '4px';
            targetInfo.style.padding = '12px';
            targetInfo.style.marginBottom = '12px';
            const posText = (ra != null && dec != null)
                ? `Position: RA = ${Number(ra).toFixed(6)}°, Dec = ${Number(dec).toFixed(6)}° • Radius = ${radiusDeg}°`
                : `Search radius = ${radiusDeg}°`;
            const metaRow = `
                `;
            targetInfo.innerHTML = `
                <div style="font-size: 15px; font-weight: bold; color: #fff; margin-bottom: 6px;">${nameResolved || 'Target'}</div>
                <div style="color: #aaa; font-size: 13px;">${posText}</div>
                ${metaRow}
            `;
            resultsList.appendChild(targetInfo);
        }

        if (rows.length === 0 && mastPage === 1) {
            const noResults = document.createElement('div');
            noResults.style.textAlign = 'center';
            noResults.style.padding = '20px';
            noResults.style.color = '#aaa';
            noResults.style.backgroundColor = '#2a2a2a';
            noResults.style.borderRadius = '4px';
            noResults.style.border = '1px dashed #555';
            noResults.textContent = 'No observations found for current filters';
            resultsList.appendChild(noResults);
        } else {
            rows.forEach(row => renderMastObservation(row));
        }

        // Update UI state
        if (rows.length < 10) { // If we received less than a full page, we're at the end
            loadMoreBtn.style.display = 'none';
        } else {
            loadMoreBtn.style.display = 'block';
        }

        const resultsHeading = document.getElementById('mast-results-heading');
        if (resultsHeading) {
            resultsHeading.textContent = `Showing ${document.querySelectorAll('.mast-result-item').length} observations`;
        }
        filterInput.style.display = 'block';

    } catch (error) {
        showNotification(`Error loading results: ${error.message}`, 3000, 'error');
    } finally {
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        if (resultsContainer) resultsContainer.style.display = 'block';
        mastLoadingMore = false;
        loadMoreBtn.textContent = 'Load More Observations';
        loadMoreBtn.style.backgroundColor = '#00558b';
    }
}

async function loadMoreMastResults() {
    mastPage++;
    await fetchAndDisplayMastPage();
}

async function renderMastObservation(row) {
    const resultsList = document.getElementById('mast-results-list');
    if (!resultsList) return;

    const obsid = row.obsid;
    const collection = row.obs_collection || 'Unknown';
    const instrument = row.instrument_name || 'Unknown';
    const target = row.target_name || 'Unknown';
    const s_ra = row.s_ra;
    const s_dec = row.s_dec;
    const t_exptime = row.t_exptime;
    const proposal_pi = row.proposal_pi || 'N/A';
    const calib_level = row.calib_level;
    const filtersVal = row.filters;
    const filterText = Array.isArray(filtersVal) ? filtersVal.join(', ') : (filtersVal || 'Unknown');

    const item = document.createElement('div');
    item.id = `mast-item-${obsid}`;
    item.className = 'mast-result-item';
    item.style.padding = '15px';
    item.style.marginBottom = '10px';
    item.style.backgroundColor = '#333';
    item.style.borderRadius = '6px';
    item.style.border = '1px solid #444';

    const fmtExp = (v) => (v != null ? `${Number(v).toFixed(0)} s` : 'Unknown');

    item.innerHTML = `
        <div style="display: grid; gap: 12px;">
            <div style="font-weight: bold; color: #fff; font-size: 16px;">${target}
                <span style="font-size: 13px; color: #aaa; font-weight: normal;"> (${collection})</span>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                <div>
                    <div style="color: #2196F3; font-size: 12px; font-weight: bold;">INSTRUMENT</div>
                    <div style="color: #fff; font-size: 14px;">${instrument}</div>
                </div>
                <div>
                    <div style="color: #4CAF50; font-size: 12px; font-weight: bold;">PROPOSAL PI</div>
                    <div style="color: #fff; font-size: 14px;">${proposal_pi}</div>
                </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
                <div>
                    <div style="color: #FF9800; font-size: 12px; font-weight: bold;">POSITION</div>
                    <div style="color: #fff; font-size: 13px; font-family: monospace;">RA: ${Number(s_ra).toFixed(5)}°, Dec: ${Number(s_dec).toFixed(5)}°</div>
                </div>
                <div>
                    <div style="color: #FF9800; font-size: 12px; font-weight: bold;">CALIB LEVEL</div>
                    <div style="color: #fff; font-size: 14px;">${calib_level != null ? calib_level : 'N/A'}</div>
                </div>
                <div>
                    <div style="color: #9C27B0; font-size: 12px; font-weight: bold;">EXPOSURE</div>
                    <div style="color: #fff; font-size: 14px;">${fmtExp(t_exptime)}</div>
                </div>
            </div>
            <div style="margin-top: 8px;">
                <div style="color: #03A9F4; font-size: 12px; font-weight: bold;">FILTER</div>
                <div style="color: #fff; font-size: 14px;">${filterText}</div>
            </div>
            <div id="mast-actions-${obsid}">
                <button class="find-fits-btn" style="padding: 8px 12px; background: #2196F3; color: #fff; border: none; border-radius: 4px; cursor: pointer;">
                    Find & Display FITS
                </button>
            </div>
        </div>
    `;

    resultsList.appendChild(item);

    const findBtn = item.querySelector('.find-fits-btn');
    findBtn.addEventListener('click', async function(e) {
        e.stopPropagation();
        const actionsContainer = document.getElementById(`mast-actions-${obsid}`);
        if (!actionsContainer) return;

        actionsContainer.innerHTML = `<div style="color: #aaa; font-style: italic;">Searching for FITS products...</div>`;

        try {
            const prodResp = await apiFetch(`/mast/products?obsid=${encodeURIComponent(obsid)}`);
            if (!prodResp.ok) throw new Error(`HTTP ${prodResp.status}`);
            
            const prodJson = await prodResp.json();
            const products = prodJson?.data || [];
            
            if (products.length > 0) {
                // Find the best FITS file
                const fits = products.find(p => String(p?.productFilename || '').toLowerCase().endsWith('.fits')) ||
                             products.find(p => String(p?.dataURI || '').toLowerCase().includes('.fits')) ||
                             products[0];
                
                let productUrl = null;
                if (fits) {
                    const dataURI = fits.dataURI;
                    if (dataURI) {
                        productUrl = `/mast/download?uri=${encodeURIComponent(dataURI)}`;
                    } else if (fits?.productURL) {
                        productUrl = `/mast/download?uri=${encodeURIComponent(fits.productURL)}`;
                    }
                }
                
                if (productUrl) {
                    actionsContainer.innerHTML = `
                        <button class="display-fits-btn" style="padding: 8px 12px; background: #4CAF50; color: #fff; border: none; border-radius: 4px; cursor: pointer;">
                            Display FITS: ${fits.productFilename || 'Calibrated Data'}
                        </button>`;
                    const displayBtn = actionsContainer.querySelector('.display-fits-btn');
                    displayBtn.addEventListener('click', function() {
                        downloadAndLoadFitsFromUrl(productUrl);
                        hideFileBrowser();
                    });
                } else {
                    throw new Error("No downloadable URL found in products.");
                }
            } else {
                throw new Error("No suitable FITS products found.");
            }
        } catch (err) {
            actionsContainer.innerHTML = `<div style="color: #f44336; font-size: 13px;">Error: ${err.message}</div>`;
        }
    });
}

// Expose initializer to files.js
window.initializeMastContent = initializeMastContent;



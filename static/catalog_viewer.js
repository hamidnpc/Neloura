// Cache for raw binary catalogs (keyed by exact filename incl. .fits)
const catalogBinaryCache = window.catalogBinaryCache || (window.catalogBinaryCache = {});
// Single-flight guard to avoid duplicate parallel loads for the same catalog
const catalogBinaryInflight = window.catalogBinaryInflight || (window.catalogBinaryInflight = {});

function stripCatalogPrefix(name) {
  return name && name.startsWith('catalogs/') ? name.slice('catalogs/'.length) : name;
}
function namesMatch(a, b) {
  return stripCatalogPrefix(String(a)) === stripCatalogPrefix(String(b));
}


async function loadBinaryCatalogRawIntoCache(catalogName) {
    const key = stripCatalogPrefix(catalogName);
    if (catalogBinaryCache[key]) return catalogBinaryCache[key];
    if (catalogBinaryInflight[key]) return catalogBinaryInflight[key];

    const inflight = (async () => {
      const metaResp = await apiFetch(`/catalog-metadata/${encodeURIComponent(key)}?ts=${Date.now()}`);
      if (!metaResp.ok) throw new Error(`Failed to load catalog metadata: ${metaResp.statusText}`);
      const meta = await metaResp.json();

      // Only fetch the first page once to warm minimal cache; no multi-page prefetch
      const url = `/catalog-binary-raw/${encodeURIComponent(key)}?page=1&limit=500&ts=${Date.now()}`;
      const resp = await apiFetch(url);
      if (!resp.ok) {
        let msg = `${resp.status} ${resp.statusText}`;
        try { msg = (await resp.json()).error || msg; } catch (_) {}
        throw new Error(`Failed to load raw binary page 1: ${msg}`);
      }
      const arrayBuf = await resp.arrayBuffer();
      const parsed = (typeof parseBinaryCatalog === 'function')
        ? parseBinaryCatalog(arrayBuf)
        : (window.parseBinaryCatalog ? window.parseBinaryCatalog(arrayBuf) : null);
      if (!parsed || !parsed.records) throw new Error('Binary parse failed (raw)');

      const columns = meta.column_names || (parsed.records[0] ? Object.keys(parsed.records[0]) : []);
      const cacheEntry = {
        header: meta,
        records: parsed.records,
        columns,
        total_rows: meta.total_rows || parsed.records.length,
        total_columns: columns.length
      };
      catalogBinaryCache[key] = cacheEntry;
      return cacheEntry;
    })();

    catalogBinaryInflight[key] = inflight;
    try {
      const result = await inflight;
      return result;
    } finally {
      delete catalogBinaryInflight[key];
    }
  }
  
  async function ensureBinaryCatalogLoaded(catalogName) {
    const key = stripCatalogPrefix(catalogName);
    if (catalogBinaryCache[key]) return catalogBinaryCache[key];
    return loadBinaryCatalogRawIntoCache(key);
  }
  
  // Metadata for viewer (from RAW cache)
// Viewer API
async function fetchCatalogMetadata(catalogName) {
    const key = stripCatalogPrefix(catalogName);
    const resp = await apiFetch(`/catalog-metadata/${encodeURIComponent(key)}?ts=${Date.now()}`);
    if (!resp.ok) {
      throw new Error(`Failed to load catalog metadata: ${resp.status} ${resp.statusText}`);
    }
    const meta = await resp.json();

    // Normalize columns to the shape this viewer expects
    let columnsMeta = [];
    const rawCols = Array.isArray(meta.columns) ? meta.columns : (Array.isArray(meta.column_names) ? meta.column_names : []);
    if (rawCols.length && typeof rawCols[0] === 'object') {
      columnsMeta = rawCols;
    } else {
      columnsMeta = rawCols.map(name => ({ name, dtype: 'unknown', unit: null, is_numeric: false, is_boolean: false }));
    }

    const columnNames = columnsMeta.map(c => c.name);
    const totalRows = meta.total_rows ?? meta.num_records ?? meta.row_count ?? 0;

    return {
      total_rows: totalRows,
      total_columns: columnNames.length,
      column_names: columnNames,
      columns: columnsMeta,
      raw: meta
    };
  }
  
 


  async function fetchCatalogData(catalogName, options = {}) {
    const {
      page = 1,
      limit = 100,
      search = null,        // client-side (not applied when using raw binary)
      sortBy = null,        // client-side (not applied when using raw binary)
      sortOrder = 'asc',    // client-side (not applied when using raw binary)
      columns = null,
      filters = null,       // client-side (not applied when using raw binary)
      stats = false
    } = options;

    const key = stripCatalogPrefix(catalogName);
    const hasClientOps = (filters && Object.keys(filters).length > 0) || (search && String(search).trim()) || !!sortBy;

    const colParam = columns ? (Array.isArray(columns) ? columns.join(',') : String(columns)) : '';
    const effLimit = hasClientOps ? Math.min(Number(limit)||500, 500) : limit;
    const url = `/catalog-binary-raw/${encodeURIComponent(key)}?page=${page}&limit=${effLimit}`
      + (colParam ? `&columns=${encodeURIComponent(colParam)}` : '')
      + (hasClientOps ? `&filters=${encodeURIComponent(JSON.stringify(filters||{}))}` : '')
      + (search ? `&search=${encodeURIComponent(String(search))}` : '')
      + (sortBy ? `&sort_by=${encodeURIComponent(String(sortBy))}&sort_order=${encodeURIComponent(String(sortOrder||'asc'))}` : '')
      + `&ts=${Date.now()}`;
    const fetchOpts = {};
    if (options && options.signal) fetchOpts.signal = options.signal;
    const resp = await apiFetch(url, fetchOpts);
    if (!resp.ok) {
      let msg = `${resp.status} ${resp.statusText}`;
      try { msg = (await resp.json()).error || msg; } catch (_) {}
      throw new Error(`Failed to load data page ${page}: ${msg}`);
    }

    const arrayBuf = await resp.arrayBuffer();
    const parsed = (typeof parseBinaryCatalog === 'function')
      ? parseBinaryCatalog(arrayBuf)
      : (window.parseBinaryCatalog ? window.parseBinaryCatalog(arrayBuf) : null);
    if (!parsed || !parsed.records || !parsed.header) throw new Error('Binary parse failed');

    const pg = parsed.header.pagination || {};
    const totalItems = pg.total_items ?? parsed.header.total_rows ?? 0;
    const totalPages = pg.total_pages ?? Math.max(1, Math.ceil(totalItems / limit));
    const showingStart = pg.showing_start ?? (totalItems ? (page - 1) * limit + 1 : 0);
    const showingEnd = pg.showing_end ?? Math.min(page * limit, totalItems);

    return {
      catalog_data: parsed.records,
      pagination: {
        page,
        limit,
        total_items: totalItems,
        total_pages: totalPages,
        has_prev: !!pg.has_prev || page > 1,
        has_next: !!pg.has_next || page < totalPages,
        showing_start: showingStart,
        showing_end: showingEnd
      },
      column_stats: stats ? null : null
    };
  }




// Prefer the already-loaded overlay dataset for this catalog (keeps content consistent)
function tryGetLocalActiveCatalog(catalogName) {
  const key = stripCatalogPrefix(catalogName);
  const active = stripCatalogPrefix(window.currentCatalogName || window.activeCatalog || '');
  if (active && active === key && Array.isArray(window.catalogDataWithFlags) && window.catalogDataWithFlags.length > 0) {
    const columns =
      (window.catalogMetadata && window.catalogMetadata.column_names) ||
      Object.keys(window.catalogDataWithFlags[0]);
    return {
      header: window.catalogMetadata || {},
      records: window.catalogDataWithFlags,
      columns,
      total_rows:
        (window.catalogMetadata && (window.catalogMetadata.num_records || window.catalogMetadata.total_rows)) ||
        window.catalogDataWithFlags.length,
      total_columns: columns.length,
    };
  }
  return null;
}



function showCatalogViewer(catalogName) {
    showNotification(true, `Loading catalog metadata for ${catalogName}...`);
    
    // First, get metadata to understand the catalog structure
    fetchCatalogMetadata(catalogName)
        .then(metadata => {
            showNotification(false);
            createAdvancedCatalogViewer(catalogName, metadata);
        })
        .catch(error => {
            showNotification(false);
            showNotification(`Error loading catalog: ${error.message}`, 4000, 'error');
            console.error("Error in showCatalogViewer:", error);
        });
}




/**
 * Create advanced catalog viewer with TopCat-like interface
 */
function createAdvancedCatalogViewer(catalogName, metadata) {
    const existingPopup = document.getElementById('catalog-viewer-popup');
    if (existingPopup) {
        existingPopup.remove();
    }

    const popup = document.createElement('div');
    popup.id = 'catalog-viewer-popup';
    Object.assign(popup.style, {
        position: 'fixed', top: '5%', left: '5%', 
        width: '90vw', height: '90vh', backgroundColor: '#2d2d2d',
        border: '1px solid #444', borderRadius: '8px', zIndex: '2000',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 16px rgba(0,0,0,0.5)',
        color: 'white', fontFamily: 'Arial, sans-serif'
    });

    // State management
    const state = {
        currentPage: 1,
        pageSize: 500,
        totalItems: metadata.total_rows,
        search: '',
        sortBy: null,
        sortOrder: 'asc',
        loading: false,
        data: [],
        columns: metadata.column_names,
        metadata: metadata,
        activeFilters: {},
        // Show all columns by default
        selectedColumns: Array.isArray(metadata.column_names) ? [...metadata.column_names] : [],
        selectedRows: new Set()
    };

    // Create layout
    const header = createAdvancedHeader(catalogName, metadata, popup);
    let loadTimer = null;
    const scheduleLoad = () => {
        if (loadTimer) clearTimeout(loadTimer);
        loadTimer = setTimeout(() => loadData(true), 250);
    };
    const toolbar = createToolbar(state, scheduleLoad);
    const mainContent = createMainContent(state);
    const statusBar = createStatusBar(state);

    popup.appendChild(header);
    popup.appendChild(toolbar);
    popup.appendChild(mainContent);
    popup.appendChild(statusBar);
    document.body.appendChild(popup);
    
    if (typeof makeDraggable === 'function') {
        makeDraggable(popup, header);
    }

    // Load initial data
    scheduleLoad();

    async function loadData(immediate) {
        if (!immediate) return; // Only run when scheduled
        if (state.loading) {
            try { if (state._abort && typeof state._abort.abort === 'function') state._abort.abort(); } catch(_){}
        }
        
        state.loading = true;
        // Setup abort controller to cancel older requests
        try { if (state._abort && typeof state._abort.abort === 'function') state._abort.abort(); } catch(_){}
        state._abort = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        updateLoadingState(true);
        
        try {
            const options = {
                page: state.currentPage,
                limit: state.pageSize,
                search: state.search || null,
                sortBy: state.sortBy,
                sortOrder: state.sortOrder,
                columns: state.selectedColumns.join(','),
                filters: Object.keys(state.activeFilters).length > 0 ? state.activeFilters : null,
                stats: true,
                signal: state._abort ? state._abort.signal : undefined
            };

            const response = await fetchCatalogData(catalogName, options);
            
            state.data = response.catalog_data;
            state.totalItems = response.pagination.total_items;
            
            renderTable(state.data, state.selectedColumns);
            updatePaginationInfo(response.pagination);
            updateStatsDisplay(response.column_stats);
            
        } catch (error) {
            showNotification(`Error loading data: ${error.message}`, 4000, 'error');
            console.error('Error loading catalog data:', error);
        } finally {
            state.loading = false;
            updateLoadingState(false);
        }
    }

    function createAdvancedHeader(catalogName, metadata, popup) {
        const header = document.createElement('div');
        Object.assign(header.style, {
            padding: '10px 15px', borderBottom: '1px solid #444',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            backgroundColor: '#333', borderTopLeftRadius: '8px', borderTopRightRadius: '8px',
            cursor: 'move'
        });

        const titleContainer = document.createElement('div');
        
        const title = document.createElement('h2');
        title.textContent = `Catalog: ${catalogName.split('/').pop()}`;
        Object.assign(title.style, { margin: '0 0 5px 0', fontSize: '18px', fontWeight: 'bold' });

        const info = document.createElement('div');
        info.innerHTML = `
            <span style="color: #aaa; font-size: 12px;">
                ${metadata.total_rows.toLocaleString()} rows × ${metadata.total_columns} columns
                ${metadata.memory_usage_mb ? `• ${metadata.memory_usage_mb.toFixed(1)} MB` : ''}
            </span>
        `;

        titleContainer.appendChild(title);
        titleContainer.appendChild(info);

        const buttonContainer = document.createElement('div');
        Object.assign(buttonContainer.style, { display: 'flex', gap: '10px', alignItems: 'center' });

        // Info button
        
        // Export button
        const exportBtn = createHeaderButton('Export', 'Export', () => showExportDialog(state));
        
        // Settings button
        const settingsBtn = createHeaderButton('Settings', 'Settings', () => showSettingsDialog(state, loadData));

        const closeButton = document.createElement('button');
        closeButton.innerHTML = '×';
        Object.assign(closeButton.style, {
            background: 'none', border: 'none', color: 'white',
            fontSize: '24px', cursor: 'pointer', fontWeight: 'bold',
            marginLeft: '10px'
        });
        closeButton.onclick = () => popup.remove();

        // buttonContainer.appendChild(infoBtn);
        buttonContainer.appendChild(exportBtn);
        buttonContainer.appendChild(settingsBtn);
        buttonContainer.appendChild(closeButton);
        
        header.appendChild(titleContainer);
        header.appendChild(buttonContainer);
        
        return header;
    }

    function createHeaderButton(text, title, onclick) {
        const button = document.createElement('button');
        button.textContent = text;
        button.title = title;
        button.onclick = onclick;
        Object.assign(button.style, {
            background: '#444', border: '1px solid #555', color: 'white',
            fontSize: '14px', cursor: 'pointer', borderRadius: '4px',
            padding: '5px 8px', height: '32px'
        });
        button.onmouseenter = () => button.style.backgroundColor = '#555';
        button.onmouseleave = () => button.style.backgroundColor = '#444';
        return button;
    }

    function createToolbar(state, onUpdate) {
        const toolbar = document.createElement('div');
        Object.assign(toolbar.style, { 
            padding: '10px 15px',
            display: 'flex',
            gap: '10px',
            alignItems: 'center',
            flexWrap: 'wrap',
            borderBottom: '1px solid #444',
            backgroundColor: '#333'
        });

        // Search input with advanced options
        const searchContainer = document.createElement('div');
        Object.assign(searchContainer.style, { display: 'flex', alignItems: 'center', gap: '5px' });
        
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'Search all columns...';
        Object.assign(searchInput.style, {
            minWidth: '200px',
            padding: '8px',
            backgroundColor: '#444',
            color: 'white',
            border: '1px solid #555',
            borderRadius: '4px'
        });

        const searchButton = document.createElement('button');
        searchButton.textContent = 'Advanced';
        searchButton.title = 'Advanced Search';
        Object.assign(searchButton.style, {
            padding: '8px', backgroundColor: '#444', color: 'white',
            border: '1px solid #555', borderRadius: '4px', cursor: 'pointer'
        });
        searchButton.onclick = () => showAdvancedSearchDialog(state, onUpdate);

        searchContainer.appendChild(searchInput);
        // searchContainer.appendChild(searchButton);

        // Filter indicator
        const filterIndicator = document.createElement('div');
        filterIndicator.className = 'filter-indicator';
        Object.assign(filterIndicator.style, {
            padding: '5px 10px', backgroundColor: '#555', borderRadius: '15px',
            fontSize: '12px', display: 'none'
        });

        // Page size selector
        const pageSizeSelect = document.createElement('select');
        [100, 500, 1000, 2000, 5000].forEach(size => {
            const option = document.createElement('option');
            option.value = size;
            option.textContent = `${size} rows`;
            option.selected = size === state.pageSize;
            pageSizeSelect.appendChild(option);
        });
        Object.assign(pageSizeSelect.style, {
            padding: '8px', backgroundColor: '#444', color: 'white',
            border: '1px solid #555', borderRadius: '4px'
        });

        // Column selector
        const columnButton = createToolbarButton('Columns', 'Select Columns', () => showColumnSelector(state, onUpdate));
        
        // Filter button
        const filterButton = createToolbarButton('Filters', 'Filters', () => showFilterPanel(state, onUpdate));

        // Selection info
        const selectionInfo = document.createElement('div');
        selectionInfo.className = 'selection-info';
        Object.assign(selectionInfo.style, {
            fontSize: '12px', color: '#aaa', marginLeft: 'auto'
        });

        // Debounced search
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                state.search = e.target.value;
                state.currentPage = 1;
                onUpdate();
            }, 300);
        });

        pageSizeSelect.addEventListener('change', (e) => {
            state.pageSize = parseInt(e.target.value);
            state.currentPage = 1;
            onUpdate();
        });

        toolbar.appendChild(searchContainer);
        toolbar.appendChild(filterIndicator);
        toolbar.appendChild(pageSizeSelect);
        // toolbar.appendChild(columnButton);
        toolbar.appendChild(filterButton);
        toolbar.appendChild(selectionInfo);
        
        return toolbar;
    }

    function createToolbarButton(text, title, onclick) {
        const button = document.createElement('button');
        button.textContent = text;
        button.title = title;
        button.onclick = onclick;
        Object.assign(button.style, {
            padding: '8px 12px', backgroundColor: '#444', color: 'white',
            border: '1px solid #555', borderRadius: '4px', cursor: 'pointer'
        });
        button.onmouseenter = () => button.style.backgroundColor = '#555';
        button.onmouseleave = () => button.style.backgroundColor = '#444';
        return button;
    }

    function createMainContent(state) {
        const mainContent = document.createElement('div');
        Object.assign(mainContent.style, {
            display: 'flex', flexGrow: '1', overflow: 'hidden'
        });

        // Main table area
        const tableArea = document.createElement('div');
        Object.assign(tableArea.style, {
            flexGrow: '1', display: 'flex', flexDirection: 'column',
            overflow: 'hidden'
        });

        // Table container
        const tableContainer = document.createElement('div');
        tableContainer.className = 'table-container';
        Object.assign(tableContainer.style, { 
            flexGrow: '1', overflow: 'auto', position: 'relative'
        });
        
        const table = document.createElement('table');
        table.id = 'catalog-table';
        Object.assign(table.style, {
            width: '100%', borderCollapse: 'collapse'
        });
        
        tableContainer.appendChild(table);

        // Pagination controls
        const pagination = createPaginationControls(state, scheduleLoad);

        tableArea.appendChild(tableContainer);
        tableArea.appendChild(pagination);

        mainContent.appendChild(tableArea);
        
        return mainContent;
    }

    function createPaginationControls(state, onUpdate) {
        const pagination = document.createElement('div');
        pagination.className = 'pagination-controls';
        Object.assign(pagination.style, {
            padding: '10px 15px', borderTop: '1px solid #444',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            backgroundColor: '#333', flexShrink: '0'
        });

        // Navigation buttons
        const navContainer = document.createElement('div');
        Object.assign(navContainer.style, { display: 'flex', gap: '5px', alignItems: 'center' });

        const firstBtn = createPaginationButton('<<', () => { state.currentPage = 1; onUpdate(); });
        const prevBtn = createPaginationButton('<', () => { if (state.currentPage > 1) { state.currentPage--; onUpdate(); } });
        
        // Page input
        const pageInput = document.createElement('input');
        pageInput.type = 'number';
        pageInput.min = '1';
        pageInput.value = state.currentPage;
        Object.assign(pageInput.style, {
            width: '60px', padding: '5px', backgroundColor: '#444', color: 'white',
            border: '1px solid #555', borderRadius: '3px', textAlign: 'center'
        });
        pageInput.addEventListener('change', (e) => {
            const newPage = parseInt(e.target.value);
            const maxPage = Math.ceil(state.totalItems / state.pageSize);
            if (newPage >= 1 && newPage <= maxPage) {
                state.currentPage = newPage;
                onUpdate();
            }
        });

        const pageInfo = document.createElement('span');
        pageInfo.className = 'page-info';
        Object.assign(pageInfo.style, { margin: '0 10px', fontSize: '14px' });

        const nextBtn = createPaginationButton('>', () => { 
            const maxPage = Math.ceil(state.totalItems / state.pageSize);
            if (state.currentPage < maxPage) { state.currentPage++; onUpdate(); }
        });
        const lastBtn = createPaginationButton('>>', () => { 
            state.currentPage = Math.ceil(state.totalItems / state.pageSize); 
            onUpdate(); 
        });

        navContainer.appendChild(firstBtn);
        navContainer.appendChild(prevBtn);
        navContainer.appendChild(pageInput);
        navContainer.appendChild(pageInfo);
        navContainer.appendChild(nextBtn);
        navContainer.appendChild(lastBtn);

        // Items info and selection actions
        const rightContainer = document.createElement('div');
        Object.assign(rightContainer.style, { display: 'flex', gap: '15px', alignItems: 'center' });

        const itemsInfo = document.createElement('span');
        itemsInfo.className = 'items-info';
        Object.assign(itemsInfo.style, { fontSize: '12px', color: '#aaa' });

        const selectionActions = document.createElement('div');
        selectionActions.className = 'selection-actions';
        Object.assign(selectionActions.style, { display: 'none', gap: '5px' });

        rightContainer.appendChild(itemsInfo);
        rightContainer.appendChild(selectionActions);

        pagination.appendChild(navContainer);
        pagination.appendChild(rightContainer);

        return pagination;
    }

    function createPaginationButton(text, onclick) {
        const button = document.createElement('button');
        button.textContent = text;
        button.onclick = onclick;
        Object.assign(button.style, {
            padding: '5px 10px', backgroundColor: '#444', color: 'white',
            border: '1px solid #555', borderRadius: '3px', cursor: 'pointer'
        });
        return button;
    }

    function createStatusBar(state) {
        const statusBar = document.createElement('div');
        statusBar.className = 'status-bar';
        Object.assign(statusBar.style, {
            padding: '5px 15px', borderTop: '1px solid #444',
            backgroundColor: '#2a2a2a', fontSize: '12px', color: '#aaa',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        });

        const leftStatus = document.createElement('div');
        const rightStatus = document.createElement('div');

        statusBar.appendChild(leftStatus);
        statusBar.appendChild(rightStatus);

        return statusBar;
    }

    function renderTable(data, columns) {
        const table = document.getElementById('catalog-table');
        table.innerHTML = '';
        
        if (data.length === 0) {
            const emptyRow = document.createElement('tr');
            const emptyCell = document.createElement('td');
            emptyCell.textContent = 'No data found';
            emptyCell.colSpan = columns.length + 1;
            Object.assign(emptyCell.style, { 
                textAlign: 'center', padding: '20px', color: '#aaa'
            });
            emptyRow.appendChild(emptyCell);
            table.appendChild(emptyRow);
            return;
        }

        // Create header
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        Object.assign(headerRow.style, {
            backgroundColor: '#3a3a3a', position: 'sticky', top: '0', zIndex: '1'
        });

        // Selection column header
        const selectTh = document.createElement('th');
        selectTh.style.width = '40px';
        const selectAllCb = document.createElement('input');
        selectAllCb.type = 'checkbox';
        selectAllCb.onchange = (e) => toggleSelectAll(e.target.checked);
        selectTh.appendChild(selectAllCb);
        headerRow.appendChild(selectTh);

        // Data columns
        columns.forEach(col => {
            const th = document.createElement('th');
            
            const headerContent = document.createElement('div');
            Object.assign(headerContent.style, {
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            });

            const colName = document.createElement('span');
            colName.textContent = col;
            colName.style.cursor = 'pointer';
            colName.onclick = () => {
                if (state.sortBy === col) {
                    state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc';
                } else {
                    state.sortBy = col;
                    state.sortOrder = 'asc';
                }
                state.currentPage = 1;
                scheduleLoad();
            };

            const colActions = document.createElement('div');
            Object.assign(colActions.style, { display: 'flex', gap: '2px' });

            // // Column info button
            // const infoBtn = document.createElement('button');
            // infoBtn.textContent = 'Info';
            // infoBtn.title = 'Column Info';
            // Object.assign(infoBtn.style, {
            //     background: 'none', border: 'none', color: '#aaa',
            //     fontSize: '12px', cursor: 'pointer', padding: '2px'
            // });
            // infoBtn.onclick = (e) => {
            //     e.stopPropagation();
            //     showColumnInfo(catalogName, col);
            // };

            // Filter button
            const filterBtn = document.createElement('button');
            filterBtn.textContent = 'v';
            filterBtn.title = 'Filter Column';
            Object.assign(filterBtn.style, {
                background: 'none', border: 'none', color: '#aaa',
                fontSize: '10px', cursor: 'pointer', padding: '2px'
            });
            filterBtn.onclick = (e) => {
                e.stopPropagation();
                showColumnFilter(col, state, scheduleLoad);
            };

            // colActions.appendChild(infoBtn);
            // colActions.appendChild(filterBtn);

            headerContent.appendChild(colName);
            headerContent.appendChild(colActions);

            // Add sort indicator
            if (state.sortBy === col) {
                const indicator = document.createElement('span');
                indicator.textContent = state.sortOrder === 'asc' ? ' ^' : ' v';
                colName.appendChild(indicator);
            }

            Object.assign(th.style, {
                padding: '10px', textAlign: 'left', userSelect: 'none',
                borderBottom: '2px solid #555', minWidth: '100px'
            });

            th.appendChild(headerContent);
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Create body with row selection
        const tbody = document.createElement('tbody');
        data.forEach((row, index) => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid #444';
            
            // Add hover effect
            tr.onmouseenter = () => tr.style.backgroundColor = '#383838';
            tr.onmouseleave = () => tr.style.backgroundColor = state.selectedRows.has(index) ? '#444' : 'transparent';

            // Selection checkbox
            const selectTd = document.createElement('td');
            const selectCb = document.createElement('input');
            selectCb.type = 'checkbox';
            selectCb.checked = state.selectedRows.has(index);
            selectCb.onchange = (e) => toggleRowSelection(index, e.target.checked);
            selectTd.appendChild(selectCb);
            tr.appendChild(selectTd);

            // Data cells
            columns.forEach(col => {
                const td = document.createElement('td');
                const value = row[col];
                
                // Format cell based on data type
                if (typeof value === 'number') {
                    td.textContent = formatNumber(value);
                    td.style.textAlign = 'right';
                } else {
                    td.textContent = value || '';
                }
                
                td.style.padding = '8px 10px';
                
                // Add double-click to view cell details
                td.ondblclick = () => showCellDetails(col, value, row);
                
                tr.appendChild(td);
            });
            
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);

        updateSelectionInfo();
    }

    function toggleSelectAll(checked) {
        if (checked) {
            for (let i = 0; i < state.data.length; i++) {
                state.selectedRows.add(i);
            }
        } else {
            state.selectedRows.clear();
        }
        renderTable(state.data, state.selectedColumns);
    }

    function toggleRowSelection(index, checked) {
        if (checked) {
            state.selectedRows.add(index);
        } else {
            state.selectedRows.delete(index);
        }
        updateSelectionInfo();
    }

    function updateSelectionInfo() {
        const selectionInfo = document.querySelector('.selection-info');
        const selectedCount = state.selectedRows.size;
        
        if (selectedCount > 0) {
            selectionInfo.textContent = `${selectedCount} row${selectedCount === 1 ? '' : 's'} selected`;
            selectionInfo.style.color = '#4CAF50';
        } else {
            selectionInfo.textContent = '';
        }

        // Show/hide selection actions
        const selectionActions = document.querySelector('.selection-actions');
        if (selectedCount > 0) {
            selectionActions.style.display = 'flex';
            selectionActions.innerHTML = `
                <button onclick="exportSelectedRows()" style="padding: 3px 8px; background: #4CAF50; color: white; border: none; border-radius: 3px; cursor: pointer;">Export Selected</button>
                <button onclick="clearSelection()" style="padding: 3px 8px; background: #f44336; color: white; border: none; border-radius: 3px; cursor: pointer;">Clear</button>
            `;
        } else {
            selectionActions.style.display = 'none';
        }
    }

    function formatNumber(value) {
        if (value === null || value === undefined) return '';
        if (Math.abs(value) < 0.001 || Math.abs(value) >= 1000000) {
            return value.toExponential(3);
        }
        return value.toFixed(3);
    }

    function updatePaginationInfo(pagination) {
        const totalPages = pagination.total_pages;
        const currentPage = pagination.page;
        
        // Update page input
        const pageInput = document.querySelector('.pagination-controls input[type="number"]');
        if (pageInput) pageInput.value = currentPage;
        
        // Update page info
        const pageInfo = document.querySelector('.page-info');
        if (pageInfo) pageInfo.textContent = `of ${totalPages}`;
        
        // Update items info
        const itemsInfo = document.querySelector('.items-info');
        if (itemsInfo) itemsInfo.textContent = `${pagination.showing_start}-${pagination.showing_end} of ${pagination.total_items.toLocaleString()}`;
        
        // Update button states
        const paginationContainer = document.querySelector('.pagination-controls');
        if (paginationContainer) {
            const buttons = paginationContainer.querySelectorAll('button');
            if (buttons.length >= 4) {
                buttons[0].disabled = !pagination.has_prev; // First
                buttons[1].disabled = !pagination.has_prev; // Previous
                buttons[2].disabled = !pagination.has_next; // Next
                buttons[3].disabled = !pagination.has_next; // Last
            }
        }

        // Update status bar
        const statusBar = document.querySelector('.status-bar div:first-child');
        if (statusBar) {
            statusBar.textContent = `Page ${currentPage}/${totalPages} • ${pagination.total_items.toLocaleString()} total rows`;
        }
    }

    function updateStatsDisplay(stats) {
        if (!stats) return;
        
        const statusBar = document.querySelector('.status-bar div:last-child');
        if (statusBar) {
            const numericCols = Object.values(stats).filter(s => s.type === 'numeric').length;
            const categoricalCols = Object.values(stats).filter(s => s.type === 'categorical').length;
            statusBar.textContent = `${numericCols} numeric, ${categoricalCols} categorical columns`;
        }
    }

    function updateLoadingState(loading) {
        const table = document.getElementById('catalog-table');
        
        if (loading) {
            // Add loading overlay
            let loadingOverlay = document.getElementById('loading-overlay');
            if (!loadingOverlay) {
                loadingOverlay = document.createElement('div');
                loadingOverlay.id = 'loading-overlay';
                Object.assign(loadingOverlay.style, {
                    position: 'absolute', top: '0', left: '0', right: '0', bottom: '0',
                    backgroundColor: 'rgba(45, 45, 45, 0.8)', zIndex: '100',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                });
                
                const spinner = document.createElement('div');
                Object.assign(spinner.style, {
                    width: '40px', height: '40px',
                    border: '4px solid #555', borderTop: '4px solid #4CAF50',
                    borderRadius: '50%', animation: 'spin 1s linear infinite'
                });
                
                loadingOverlay.appendChild(spinner);
                table.parentNode.style.position = 'relative';
                table.parentNode.appendChild(loadingOverlay);
                
                // Add animation if not exists
                if (!document.getElementById('spin-animation')) {
                    const style = document.createElement('style');
                    style.id = 'spin-animation';
                    style.textContent = '@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
                    document.head.appendChild(style);
                }
            }
        } else {
            const loadingOverlay = document.getElementById('loading-overlay');
            if (loadingOverlay) {
                loadingOverlay.remove();
            }
        }
    }


    async function showColumnInfo(catalogName, columnName) {
        try {
            showNotification(`Loading column analysis for ${columnName}...`, 2000, 'info');
            
            const catalogNameForApi = catalogName.startsWith('catalogs/') 
                ? catalogName.replace('catalogs/', '') 
                : catalogName;
            
            const response = await fetch(`/catalog-column-analysis/${encodeURIComponent(catalogNameForApi)}/${encodeURIComponent(columnName)}`);
            const analysis = await response.json();
            
            createDialog('column-info-dialog', `Column: ${columnName}`, (content) => {
                content.innerHTML = `
                    <div style="padding: 20px; max-height: 500px; overflow-y: auto;">
                        <h3 style="margin-top: 0; color: #4CAF50;">Basic Information</h3>
                        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                            <tr><td style="padding: 5px; border-bottom: 1px solid #444;"><strong>Column:</strong></td><td style="padding: 5px; border-bottom: 1px solid #444;">${analysis.column_name}</td></tr>
                            <tr><td style="padding: 5px; border-bottom: 1px solid #444;"><strong>Data Type:</strong></td><td style="padding: 5px; border-bottom: 1px solid #444;">${analysis.dtype}</td></tr>
                            <tr><td style="padding: 5px; border-bottom: 1px solid #444;"><strong>Unit:</strong></td><td style="padding: 5px; border-bottom: 1px solid #444;">${analysis.unit || 'None'}</td></tr>
                            <tr><td style="padding: 5px; border-bottom: 1px solid #444;"><strong>Total Rows:</strong></td><td style="padding: 5px; border-bottom: 1px solid #444;">${analysis.total_rows.toLocaleString()}</td></tr>
                            <tr><td style="padding: 5px; border-bottom: 1px solid #444;"><strong>Sample Size:</strong></td><td style="padding: 5px; border-bottom: 1px solid #444;">${analysis.sample_size.toLocaleString()}</td></tr>
                        </table>
                        
                        ${analysis.numeric_stats ? `
                            <h3 style="color: #4CAF50;">Numeric Statistics</h3>
                            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 20px;">
                                <table style="border-collapse: collapse;">
                                    <tr><td style="padding: 5px; border-bottom: 1px solid #444;"><strong>Count:</strong></td><td style="padding: 5px; border-bottom: 1px solid #444;">${analysis.numeric_stats.count.toLocaleString()}</td></tr>
                                    <tr><td style="padding: 5px; border-bottom: 1px solid #444;"><strong>Null:</strong></td><td style="padding: 5px; border-bottom: 1px solid #444;">${analysis.numeric_stats.null_count.toLocaleString()}</td></tr>
                                    <tr><td style="padding: 5px; border-bottom: 1px solid #444;"><strong>Min:</strong></td><td style="padding: 5px; border-bottom: 1px solid #444;">${analysis.numeric_stats.min.toFixed(6)}</td></tr>
                                    <tr><td style="padding: 5px; border-bottom: 1px solid #444;"><strong>Max:</strong></td><td style="padding: 5px; border-bottom: 1px solid #444;">${analysis.numeric_stats.max.toFixed(6)}</td></tr>
                                </table>
                                <table style="border-collapse: collapse;">
                                    <tr><td style="padding: 5px; border-bottom: 1px solid #444;"><strong>Mean:</strong></td><td style="padding: 5px; border-bottom: 1px solid #444;">${analysis.numeric_stats.mean.toFixed(6)}</td></tr>
                                    <tr><td style="padding: 5px; border-bottom: 1px solid #444;"><strong>Median:</strong></td><td style="padding: 5px; border-bottom: 1px solid #444;">${analysis.numeric_stats.median.toFixed(6)}</td></tr>
                                    <tr><td style="padding: 5px; border-bottom: 1px solid #444;"><strong>Std Dev:</strong></td><td style="padding: 5px; border-bottom: 1px solid #444;">${analysis.numeric_stats.std.toFixed(6)}</td></tr>
                                    <tr><td style="padding: 5px; border-bottom: 1px solid #444;"><strong>Range:</strong></td><td style="padding: 5px; border-bottom: 1px solid #444;">${(analysis.numeric_stats.max - analysis.numeric_stats.min).toFixed(6)}</td></tr>
                                </table>
                            </div>
                        ` : ''}
                        
                        ${analysis.categorical_stats ? `
                            <h3 style="color: #4CAF50;">Categorical Statistics</h3>
                            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                                <tr><td style="padding: 5px; border-bottom: 1px solid #444;"><strong>Unique Values:</strong></td><td style="padding: 5px; border-bottom: 1px solid #444;">${analysis.categorical_stats.unique_count}</td></tr>
                                <tr><td style="padding: 5px; border-bottom: 1px solid #444;"><strong>Diversity Index:</strong></td><td style="padding: 5px; border-bottom: 1px solid #444;">${analysis.categorical_stats.diversity_index.toFixed(3)}</td></tr>
                            </table>
                            
                            <h4 style="color: #4CAF50;">Most Common Values</h4>
                            <div style="max-height: 200px; overflow-y: auto; border: 1px solid #444; border-radius: 4px;">
                                <table style="width: 100%; border-collapse: collapse;">
                                    <thead style="position: sticky; top: 0; background: #3a3a3a;">
                                        <tr>
                                            <th style="padding: 8px; text-align: left; border-bottom: 1px solid #444;">Value</th>
                                            <th style="padding: 8px; text-align: right; border-bottom: 1px solid #444;">Count</th>
                                            <th style="padding: 8px; text-align: right; border-bottom: 1px solid #444;">%</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${analysis.categorical_stats.most_common.map(item => `
                                            <tr>
                                                <td style="padding: 5px; border-bottom: 1px solid #444; font-family: monospace;">${item.value}</td>
                                                <td style="padding: 5px; border-bottom: 1px solid #444; text-align: right;">${item.count}</td>
                                                <td style="padding: 5px; border-bottom: 1px solid #444; text-align: right;">${((item.count / analysis.sample_size) * 100).toFixed(1)}%</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        ` : ''}
                    </div>
                `;
            });
            
        } catch (error) {
            showNotification(`Error loading column analysis: ${error.message}`, 4000, 'error');
        }
    }

    function showColumnFilter(columnName, state, onUpdate) {
        const columnMeta = state.metadata.columns.find(col => col.name === columnName);
        const isNumeric = columnMeta && columnMeta.is_numeric;
        
        createDialog('column-filter-dialog', `Filter: ${columnName}`, (content) => {
            content.innerHTML = `
                <div style="padding: 20px;">
                    <div style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 5px; font-weight: bold;">Filter Type:</label>
                        <select id="filter-type" style="width: 100%; padding: 8px; background: #444; color: white; border: 1px solid #555; border-radius: 4px;">
                            <option value="contains">Contains</option>
                            <option value="equals">Equals</option>
                            ${isNumeric ? `
                                <option value="greater_than">Greater Than</option>
                                <option value="less_than">Less Than</option>
                                <option value="range">Range</option>
                            ` : ''}
                        </select>
                    </div>
                    
                    <div id="filter-value-container">
                        <label style="display: block; margin-bottom: 5px; font-weight: bold;">Value:</label>
                        <input type="text" id="filter-value" style="width: 100%; padding: 8px; background: #444; color: white; border: 1px solid #555; border-radius: 4px;">
                    </div>
                    
                    <div id="range-container" style="display: none; margin-top: 15px;">
                        <label style="display: block; margin-bottom: 5px; font-weight: bold;">Range:</label>
                        <div style="display: flex; gap: 10px; align-items: center;">
                            <input type="number" id="range-min" placeholder="Min" style="flex: 1; padding: 8px; background: #444; color: white; border: 1px solid #555; border-radius: 4px;">
                            <span>to</span>
                            <input type="number" id="range-max" placeholder="Max" style="flex: 1; padding: 8px; background: #444; color: white; border: 1px solid #555; border-radius: 4px;">
                        </div>
                    </div>
                    
                    <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: flex-end;">
                        <button onclick="clearColumnFilter('${columnName}')" style="padding: 8px 16px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer;">Clear Filter</button>
                        <button onclick="applyColumnFilter('${columnName}')" style="padding: 8px 16px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">Apply Filter</button>
                    </div>
                </div>
                
                <script>
                    document.getElementById('filter-type').addEventListener('change', function() {
                        const rangeContainer = document.getElementById('range-container');
                        const valueContainer = document.getElementById('filter-value-container');
                        if (this.value === 'range') {
                            rangeContainer.style.display = 'block';
                            valueContainer.style.display = 'none';
                        } else {
                            rangeContainer.style.display = 'none';
                            valueContainer.style.display = 'block';
                        }
                    });
                    
                    const existingFilter = ${JSON.stringify(state.activeFilters[columnName] || null)};
                    if (existingFilter) {
                        document.getElementById('filter-type').value = existingFilter.type;
                        if (existingFilter.type === 'range') {
                            document.getElementById('range-min').value = existingFilter.min || '';
                            document.getElementById('range-max').value = existingFilter.max || '';
                            document.getElementById('range-container').style.display = 'block';
                            document.getElementById('filter-value-container').style.display = 'none';
                        } else {
                            document.getElementById('filter-value').value = existingFilter.value || '';
                        }
                    }
                </script>
            `;
        });
        
        window.applyColumnFilter = function(columnName) {
            const filterType = document.getElementById('filter-type').value;
            
            if (filterType === 'range') {
                const min = document.getElementById('range-min').value;
                const max = document.getElementById('range-max').value;
                if (min || max) {
                    state.activeFilters[columnName] = { type: 'range', min: min || null, max: max || null };
                }
            } else {
                const value = document.getElementById('filter-value').value.trim();
                if (value) {
                    state.activeFilters[columnName] = { type: filterType, value: value };
                }
            }
            
            state.currentPage = 1;
            document.getElementById('column-filter-dialog').remove();
            updateFilterIndicator();
            onUpdate();
        };
        
        window.clearColumnFilter = function(columnName) {
            delete state.activeFilters[columnName];
            state.currentPage = 1;
            document.getElementById('column-filter-dialog').remove();
            updateFilterIndicator();
            onUpdate();
        };
    }

    function showAdvancedSearchDialog(state, onUpdate) {
        createDialog('advanced-search-dialog', 'Advanced Search', (content) => {
            content.innerHTML = `
                <div style="padding: 20px; width: 600px;">
                    <div style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 5px; font-weight: bold;">Search Mode:</label>
                        <select id="search-mode" style="width: 100%; padding: 8px; background: #444; color: white; border: 1px solid #555; border-radius: 4px;">
                            <option value="simple">Simple (contains)</option>
                            <option value="regex">Regular Expression</option>
                            <option value="exact">Exact Match</option>
                        </select>
                    </div>
                    
                    <div style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 5px; font-weight: bold;">Search Term:</label>
                        <input type="text" id="search-term" placeholder="Enter search term..." style="width: 100%; padding: 8px; background: #444; color: white; border: 1px solid #555; border-radius: 4px;">
                    </div>
                    
                    <div style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 5px; font-weight: bold;">Search In Columns:</label>
                        <div style="max-height: 200px; overflow-y: auto; border: 1px solid #555; border-radius: 4px; padding: 10px; background: #444;">
                            ${state.columns.map(col => `
                                <label style="display: block; margin-bottom: 5px;">
                                    <input type="checkbox" value="${col}" checked style="margin-right: 8px;">
                                    ${col}
                                </label>
                            `).join('')}
                        </div>
                    </div>
                    
                    <div style="margin-bottom: 15px;">
                        <label style="display: flex; align-items: center;">
                            <input type="checkbox" id="case-sensitive" style="margin-right: 8px;">
                            Case Sensitive
                        </label>
                    </div>
                    
                    <div style="display: flex; gap: 10px; justify-content: flex-end;">
                        <button onclick="document.getElementById('advanced-search-dialog').remove()" style="padding: 8px 16px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer;">Cancel</button>
                        <button onclick="applyAdvancedSearch()" style="padding: 8px 16px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">Search</button>
                    </div>
                </div>
            `;
        });
        
        window.applyAdvancedSearch = function() {
            const searchTerm = document.getElementById('search-term').value.trim();
            if (searchTerm) {
                state.search = searchTerm;
                state.currentPage = 1;
                onUpdate();
            }
            document.getElementById('advanced-search-dialog').remove();
        };
    }

    function showColumnSelector(state, onUpdate) {
        createDialog('column-selector-dialog', 'Select Columns', (content) => {
            content.innerHTML = `
                <div style="padding: 20px;">
                    <div style="margin-bottom: 15px; display: flex; gap: 10px;">
                        <button id="select-all-btn" style="padding: 6px 12px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">Select All</button>
                        <button id="select-none-btn" style="padding: 6px 12px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">Select None</button>
                        <button id="select-numeric-btn" style="padding: 6px 12px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer;">Numeric Only</button>
                    </div>
                    
                    <div style="max-height: 400px; overflow-y: auto; border: 1px solid #555; border-radius: 4px; padding: 10px; background: #444;">
                        ${state.metadata.columns.map(col => `
                            <label style="display: flex; align-items: center; margin-bottom: 8px; padding: 5px; border-radius: 4px;" 
                                   class="column-option" onmouseenter="this.style.background='#555'" onmouseleave="this.style.background='transparent'">
                                <input type="checkbox" value="${col.name}" ${state.selectedColumns.includes(col.name) ? 'checked' : ''} 
                                       style="margin-right: 10px;" class="column-checkbox">
                                <div style="flex: 1;">
                                    <div style="font-weight: bold; color: ${col.is_numeric ? '#4CAF50' : col.is_boolean ? '#FF9800' : '#2196F3'};">
                                        ${col.name}
                                    </div>
                                    <div style="font-size: 12px; color: #aaa;">
                                        ${col.dtype} ${col.unit ? `(${col.unit})` : ''}
                                    </div>
                                </div>
                            </label>
                        `).join('')}
                    </div>
                    
                    <div style="margin-top: 15px; padding: 10px; background: #333; border-radius: 4px;">
                        <div style="font-size: 12px; color: #aaa;">Selected: <span id="selected-count">0</span> columns</div>
                    </div>
                    
                    <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: flex-end;">
                        <button onclick="document.getElementById('column-selector-dialog').remove()" style="padding: 8px 16px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer;">Cancel</button>
                        <button id="apply-selection-btn" style="padding: 8px 16px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">Apply</button>
                    </div>
                </div>
            `;
            
            // Add event listeners after content is added
            setTimeout(() => {
                function updateColumnPreview() {
                    const checked = document.querySelectorAll('.column-checkbox:checked');
                    document.getElementById('selected-count').textContent = checked.length;
                }
                
                document.getElementById('select-all-btn').onclick = function() {
                    document.querySelectorAll('.column-checkbox').forEach(cb => cb.checked = true);
                    updateColumnPreview();
                };
                
                document.getElementById('select-none-btn').onclick = function() {
                    document.querySelectorAll('.column-checkbox').forEach(cb => cb.checked = false);
                    updateColumnPreview();
                };
                
                document.getElementById('select-numeric-btn').onclick = function() {
                    document.querySelectorAll('.column-checkbox').forEach(cb => {
                        const colMeta = state.metadata.columns.find(col => col.name === cb.value);
                        cb.checked = colMeta && colMeta.is_numeric;
                    });
                    updateColumnPreview();
                };
                
                document.querySelectorAll('.column-checkbox').forEach(cb => {
                    cb.addEventListener('change', updateColumnPreview);
                });
                
                document.getElementById('apply-selection-btn').onclick = function() {
                    const selectedColumns = Array.from(document.querySelectorAll('.column-checkbox:checked'))
                        .map(cb => cb.value);
                    
                    if (selectedColumns.length === 0) {
                        alert('Please select at least one column.');
                        return;
                    }
                    
                    state.selectedColumns = selectedColumns;
                    state.currentPage = 1;
                    document.getElementById('column-selector-dialog').remove();
                    onUpdate();
                };
                
                updateColumnPreview();
            }, 50);
        });
    }

    function showFilterPanel(state, onUpdate) {
        createDialog('filter-panel', 'Advanced Filters', (content) => {
            content.innerHTML = `
                <div style="padding: 20px;">
                    <div style="margin-bottom: 20px;">
                        <h3 style="margin-top: 0; color: #4CAF50;">Active Filters</h3>
                        <div id="active-filters" style="min-height: 100px; border: 1px solid #555; border-radius: 4px; padding: 10px; background: #444;">
                            ${Object.keys(state.activeFilters).length === 0 ? 
                                '<div style="color: #aaa; text-align: center; padding: 20px;">No active filters</div>' :
                                Object.entries(state.activeFilters).map(([col, filter]) => `
                                    <div style="background: #333; padding: 8px; margin-bottom: 5px; border-radius: 4px; display: flex; justify-content: space-between; align-items: center;">
                                        <span><strong>${col}:</strong> ${filter.type} "${filter.value || (filter.min || '') + ' - ' + (filter.max || '')}"</span>
                                        <button onclick="removeFilter('${col}')" style="background: #f44336; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer;">×</button>
                                    </div>
                                `).join('')
                            }
                        </div>
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <h3 style="color: #4CAF50;">Add New Filter</h3>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                            <div>
                                <label style="display: block; margin-bottom: 5px;">Column:</label>
                                <select id="filter-column" style="width: 100%; padding: 8px; background: #444; color: white; border: 1px solid #555; border-radius: 4px;">
                                    <option value="">Select column...</option>
                                    ${state.columns.map(col => `<option value="${col}">${col}</option>`).join('')}
                                </select>
                            </div>
                            <div>
                                <label style="display: block; margin-bottom: 5px;">Operation:</label>
                                <select id="filter-operation" style="width: 100%; padding: 8px; background: #444; color: white; border: 1px solid #555; border-radius: 4px;">
                                    <option value="contains">Contains</option>
                                    <option value="equals">Equals</option>
                                    <option value="greater_than">Greater Than</option>
                                    <option value="less_than">Less Than</option>
                                    <option value="range">Range</option>
                                </select>
                            </div>
                        </div>
                        
                        <div id="filter-value-input" style="margin-bottom: 10px;">
                            <label style="display: block; margin-bottom: 5px;">Value:</label>
                            <input type="text" id="filter-value" style="width: 100%; padding: 8px; background: #444; color: white; border: 1px solid #555; border-radius: 4px;">
                        </div>
                        
                        <div id="filter-range-input" style="display: none; margin-bottom: 10px;">
                            <label style="display: block; margin-bottom: 5px;">Range:</label>
                            <div style="display: flex; gap: 10px;">
                                <input type="number" id="filter-min" placeholder="Min" style="flex: 1; padding: 8px; background: #444; color: white; border: 1px solid #555; border-radius: 4px;">
                                <input type="number" id="filter-max" placeholder="Max" style="flex: 1; padding: 8px; background: #444; color: white; border: 1px solid #555; border-radius: 4px;">
                            </div>
                        </div>
                        
                        <button id="add-filter-btn" style="width: 100%; padding: 10px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">Add Filter</button>
                    </div>
                    
                    <div style="display: flex; gap: 10px; justify-content: flex-end;">
                        <button id="clear-all-btn" style="padding: 8px 16px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">Clear All</button>
                        <button onclick="document.getElementById('filter-panel').remove()" style="padding: 8px 16px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer;">Close</button>
                    </div>
                </div>
            `;
            
            // Add event listeners after content is added
            setTimeout(() => {
                document.getElementById('filter-operation').addEventListener('change', function() {
                    const valueInput = document.getElementById('filter-value-input');
                    const rangeInput = document.getElementById('filter-range-input');
                    if (this.value === 'range') {
                        valueInput.style.display = 'none';
                        rangeInput.style.display = 'block';
                    } else {
                        valueInput.style.display = 'block';
                        rangeInput.style.display = 'none';
                    }
                });
                
                document.getElementById('add-filter-btn').onclick = function() {
                    const column = document.getElementById('filter-column').value;
                    const operation = document.getElementById('filter-operation').value;
                    
                    if (!column) {
                        alert('Please select a column');
                        return;
                    }
                    
                    if (operation === 'range') {
                        const min = document.getElementById('filter-min').value;
                        const max = document.getElementById('filter-max').value;
                        if (!min && !max) {
                            alert('Please enter min or max value');
                            return;
                        }
                        state.activeFilters[column] = { type: 'range', min: min || null, max: max || null };
                    } else {
                        const value = document.getElementById('filter-value').value.trim();
                        if (!value) {
                            alert('Please enter a value');
                            return;
                        }
                        state.activeFilters[column] = { type: operation, value: value };
                    }
                    
                    state.currentPage = 1;
                    document.getElementById('filter-panel').remove();
                    updateFilterIndicator();
                    onUpdate();
                };
                
                document.getElementById('clear-all-btn').onclick = function() {
                    state.activeFilters = {};
                    state.currentPage = 1;
                    document.getElementById('filter-panel').remove();
                    updateFilterIndicator();
                    onUpdate();
                };
                
                window.removeFilter = function(columnName) {
                    delete state.activeFilters[columnName];
                    state.currentPage = 1;
                    document.getElementById('filter-panel').remove();
                    updateFilterIndicator();
                    onUpdate();
                };
            }, 50);
        });
    }

    function showSettingsDialog(state, onUpdate) {
        createDialog('settings-dialog', 'Settings', (content) => {
            content.innerHTML = `
                <div style="padding: 20px;">
                    <div style="margin-bottom: 20px;">
                        <h3 style="margin-top: 0; color: #4CAF50;">Display Settings</h3>
                        
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px;">Decimal Places:</label>
                            <input type="number" id="decimal-places" min="0" max="10" value="3" style="width: 100%; padding: 8px; background: #444; color: white; border: 1px solid #555; border-radius: 4px;">
                        </div>
                        
                        <div style="margin-bottom: 15px;">
                            <label style="display: flex; align-items: center;">
                                <input type="checkbox" id="show-units" checked style="margin-right: 8px;">
                                Show Column Units
                            </label>
                        </div>
                        
                        <div style="margin-bottom: 15px;">
                            <label style="display: flex; align-items: center;">
                                <input type="checkbox" id="highlight-selection" checked style="margin-right: 8px;">
                                Highlight Selected Rows
                            </label>
                        </div>
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <h3 style="color: #4CAF50;">Performance Settings</h3>
                        
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px;">Default Page Size:</label>
                            <select id="default-page-size" style="width: 100%; padding: 8px; background: #444; color: white; border: 1px solid #555; border-radius: 4px;">
                                <option value="100">100 rows</option>
                                <option value="500">500 rows</option>
                                <option value="1000" selected>1000 rows</option>
                                <option value="2000">2000 rows</option>
                            </select>
                        </div>
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <h3 style="color: #4CAF50;">Export Settings</h3>
                        
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px;">Default Export Format:</label>
                            <select id="export-format" style="width: 100%; padding: 8px; background: #444; color: white; border: 1px solid #555; border-radius: 4px;">
                                <option value="csv">CSV</option>
                                <option value="tsv">TSV</option>
                            </select>
                        </div>
                        
                        <div style="margin-bottom: 15px;">
                            <label style="display: flex; align-items: center;">
                                <input type="checkbox" id="include-metadata" checked style="margin-right: 8px;">
                                Include Metadata in Export
                            </label>
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 10px; justify-content: flex-end;">
                        <button onclick="resetSettings()" style="padding: 8px 16px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">Reset to Defaults</button>
                        <button onclick="document.getElementById('settings-dialog').remove()" style="padding: 8px 16px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer;">Cancel</button>
                        <button onclick="applySettings()" style="padding: 8px 16px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">Apply</button>
                    </div>
                </div>
            `;
        });
        
        window.applySettings = function() {
            showNotification('Settings applied successfully', 2000, 'success');
            document.getElementById('settings-dialog').remove();
        };
        
        window.resetSettings = function() {
            document.getElementById('decimal-places').value = '3';
            document.getElementById('show-units').checked = true;
            document.getElementById('highlight-selection').checked = true;
            document.getElementById('default-page-size').value = '100';
            document.getElementById('export-format').value = 'csv';
            document.getElementById('include-metadata').checked = true;
        };
    }

    function showExportDialog(state) {
        createDialog('export-dialog', 'Export Data', (content) => {
            content.innerHTML = `
                <div style="padding: 20px;">
                    <div style="margin-bottom: 20px;">
                        <h3 style="margin-top: 0; color: #4CAF50;">Export Options</h3>
                        
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: bold;">Export Scope:</label>
                            <div>
                                <label style="display: block; margin-bottom: 5px;">
                                    <input type="radio" name="export-scope" value="current" checked style="margin-right: 8px;">
                                    Current Page (${state.data.length} rows)
                                </label>
                                <label style="display: block; margin-bottom: 5px;">
                                    <input type="radio" name="export-scope" value="filtered" style="margin-right: 8px;">
                                    All Filtered Data (${state.totalItems.toLocaleString()} rows)
                                </label>
                                <label style="display: block; margin-bottom: 5px;">
                                    <input type="radio" name="export-scope" value="selected" ${state.selectedRows.size === 0 ? 'disabled' : ''} style="margin-right: 8px;">
                                    Selected Rows (${state.selectedRows.size} rows)
                                </label>
                            </div>
                        </div>
                        
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: bold;">Export Format:</label>
                            <select id="export-format" style="width: 100%; padding: 8px; background: #444; color: white; border: 1px solid #555; border-radius: 4px;">
                                <option value="csv">CSV (Comma Separated Values)</option>
                                <option value="tsv">TSV (Tab Separated Values)</option>
                            </select>
                        </div>
                        
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: bold;">Columns to Export:</label>
                            <div>
                                <label style="display: block; margin-bottom: 5px;">
                                    <input type="radio" name="export-columns" value="visible" checked style="margin-right: 8px;">
                                    Visible Columns (${state.selectedColumns.length} columns)
                                </label>
                                <label style="display: block; margin-bottom: 5px;">
                                    <input type="radio" name="export-columns" value="all" style="margin-right: 8px;">
                                    All Columns (${state.columns.length} columns)
                                </label>
                            </div>
                        </div>
                        
                        <div style="margin-bottom: 15px;">
                            <label style="display: flex; align-items: center;">
                                <input type="checkbox" id="include-headers" checked style="margin-right: 8px;">
                                Include Column Headers
                            </label>
                        </div>
                    </div>
                    
                    <div style="background: #333; padding: 15px; border-radius: 4px; margin-bottom: 20px;">
                        <div style="font-size: 14px; font-weight: bold; margin-bottom: 5px;">Export Preview:</div>
                        <div id="export-preview" style="font-size: 12px; color: #aaa;">
                            Will export current page (${state.data.length} rows) with visible columns (${state.selectedColumns.length} columns) in CSV format
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 10px; justify-content: flex-end;">
                        <button onclick="document.getElementById('export-dialog').remove()" style="padding: 8px 16px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer;">Cancel</button>
                        <button onclick="performExport()" style="padding: 8px 16px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">Export</button>
                    </div>
                </div>
            `;
        });
        
        window.performExport = function() {
            const scope = document.querySelector('input[name="export-scope"]:checked').value;
            const format = document.getElementById('export-format').value;
            const columnMode = document.querySelector('input[name="export-columns"]:checked').value;
            const includeHeaders = document.getElementById('include-headers').checked;
            
            let exportData = [];
            let exportColumns = [];
            
            // Determine data to export
            switch(scope) {
                case 'current':
                    exportData = state.data;
                    break;
                case 'selected':
                    exportData = Array.from(state.selectedRows).map(index => state.data[index]);
                    break;
                case 'filtered':
                    alert('Exporting all filtered data requires server-side export. This would be implemented with an API call.');
                    return;
            }
            
            // Determine columns to export
            switch(columnMode) {
                case 'visible':
                    exportColumns = state.selectedColumns;
                    break;
                case 'all':
                    exportColumns = state.columns;
                    break;
            }
            
            // Perform export
            try {
                let content = '';
                const delimiter = format === 'csv' ? ',' : '\t';
                
                if (includeHeaders) {
                    content += exportColumns.join(delimiter) + '\n';
                }
                
                exportData.forEach(row => {
                    const values = exportColumns.map(col => {
                        let val = row[col] || '';
                        // Escape quotes and wrap in quotes if contains delimiter
                        if (typeof val === 'string' && (val.includes(delimiter) || val.includes('"') || val.includes('\n'))) {
                            val = '"' + val.replace(/"/g, '""') + '"';
                        }
                        return val;
                    });
                    content += values.join(delimiter) + '\n';
                });
                
                // Download file
                const blob = new Blob([content], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = catalogName.split('/').pop().replace('.fits', '') + '_export.' + format;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                showNotification('Export completed successfully!', 3000, 'success');
                document.getElementById('export-dialog').remove();
                
            } catch (error) {
                showNotification('Export failed: ' + error.message, 4000, 'error');
            }
        };
    }

    function showCellDetails(column, value, row) {
        createDialog('cell-details-dialog', `Cell Details: ${column}`, (content) => {
            content.innerHTML = `
                <div style="padding: 20px;">
                    <div style="margin-bottom: 20px;">
                        <h3 style="margin-top: 0; color: #4CAF50;">Value Information</h3>
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr><td style="padding: 8px; border-bottom: 1px solid #444; font-weight: bold;">Column:</td><td style="padding: 8px; border-bottom: 1px solid #444; font-family: monospace;">${column}</td></tr>
                            <tr><td style="padding: 8px; border-bottom: 1px solid #444; font-weight: bold;">Value:</td><td style="padding: 8px; border-bottom: 1px solid #444; font-family: monospace;">${value}</td></tr>
                            <tr><td style="padding: 8px; border-bottom: 1px solid #444; font-weight: bold;">Type:</td><td style="padding: 8px; border-bottom: 1px solid #444;">${typeof value}</td></tr>
                            <tr><td style="padding: 8px; border-bottom: 1px solid #444; font-weight: bold;">Length:</td><td style="padding: 8px; border-bottom: 1px solid #444;">${String(value).length} characters</td></tr>
                        </table>
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <h3 style="color: #4CAF50;">Formatted Views</h3>
                        <div style="background: #333; padding: 15px; border-radius: 4px;">
                            <div style="margin-bottom: 10px;">
                                <strong>Raw:</strong> <code style="background: #444; padding: 2px 4px; border-radius: 2px;">${JSON.stringify(value)}</code>
                            </div>
                            ${typeof value === 'number' ? `
                                <div style="margin-bottom: 10px;">
                                    <strong>Scientific:</strong> <code style="background: #444; padding: 2px 4px; border-radius: 2px;">${value.toExponential(6)}</code>
                                </div>
                                <div style="margin-bottom: 10px;">
                                    <strong>Fixed:</strong> <code style="background: #444; padding: 2px 4px; border-radius: 2px;">${value.toFixed(6)}</code>
                                </div>
                            ` : ''}
                            <div>
                                <strong>String:</strong> <code style="background: #444; padding: 2px 4px; border-radius: 2px;">"${String(value)}"</code>
                            </div>
                        </div>
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <h3 style="color: #4CAF50;">Row Context</h3>
                        <div style="max-height: 200px; overflow-y: auto; background: #333; padding: 15px; border-radius: 4px; font-family: monospace; font-size: 12px;">
                            <pre style="margin: 0; white-space: pre-wrap;">${JSON.stringify(row, null, 2)}</pre>
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 10px; justify-content: flex-end;">
                        <button onclick="copyCellValue('${String(value).replace(/'/g, "\\'")}', this)" style="padding: 8px 16px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer;">Copy Value</button>
                        <button onclick="document.getElementById('cell-details-dialog').remove()" style="padding: 8px 16px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer;">Close</button>
                    </div>
                </div>
            `;
        });
        
        window.copyCellValue = function(value, button) {
            navigator.clipboard.writeText(String(value)).then(() => {
                const originalText = button.textContent;
                button.textContent = 'Copied!';
                button.style.background = '#4CAF50';
                setTimeout(() => {
                    button.textContent = originalText;
                    button.style.background = '#2196F3';
                }, 1000);
            }).catch(err => {
                showNotification('Failed to copy value', 2000, 'error');
            });
        };
    }

    // Utility function to create modal dialogs
    function createDialog(id, title, contentCallback) {
        // Remove existing dialog if any
        const existing = document.getElementById(id);
        if (existing) {
            existing.remove();
        }
        
        // Create overlay
        const overlay = document.createElement('div');
        overlay.id = id;
        Object.assign(overlay.style, {
            position: 'fixed', top: '0', left: '0', right: '0', bottom: '0',
            backgroundColor: 'rgba(0, 0, 0, 0.7)', zIndex: '3000',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
        });
        
        // Create dialog
        const dialog = document.createElement('div');
        Object.assign(dialog.style, {
            backgroundColor: '#2d2d2d', borderRadius: '8px',
            border: '1px solid #444', maxWidth: '80vw', maxHeight: '80vh',
            color: 'white', fontFamily: 'Arial, sans-serif',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8)',
            overflow: 'hidden', display: 'flex', flexDirection: 'column'
        });
        
        // Create header
        const header = document.createElement('div');
        Object.assign(header.style, {
            padding: '15px 20px', borderBottom: '1px solid #444',
            backgroundColor: '#333', display: 'flex',
            justifyContent: 'space-between', alignItems: 'center'
        });
        
        const titleElement = document.createElement('h3');
        titleElement.textContent = title;
        titleElement.style.margin = '0';
        
        const closeButton = document.createElement('button');
        closeButton.innerHTML = '×';
        Object.assign(closeButton.style, {
            background: 'none', border: 'none', color: 'white',
            fontSize: '24px', cursor: 'pointer', fontWeight: 'bold'
        });
        closeButton.onclick = () => overlay.remove();
        
        header.appendChild(titleElement);
        header.appendChild(closeButton);
        
        // Create content container
        const content = document.createElement('div');
        Object.assign(content.style, {
            overflow: 'auto', flexGrow: '1'
        });
        
        dialog.appendChild(header);
        dialog.appendChild(content);
        overlay.appendChild(dialog);
        
        // Close on overlay click
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                overlay.remove();
            }
        };
        
        // Close on Escape key
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                overlay.remove();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
        
        document.body.appendChild(overlay);
        
        // Call content callback
        contentCallback(content);
        
        return { overlay, dialog, content };
    }

    // Update filter indicator
    function updateFilterIndicator() {
        const filterIndicator = document.querySelector('.filter-indicator');
        if (filterIndicator) {
            const activeFilterCount = Object.keys(state.activeFilters).length;
            
            if (activeFilterCount > 0) {
                filterIndicator.textContent = `${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'} active`;
                filterIndicator.style.display = 'block';
            } else {
                filterIndicator.style.display = 'none';
            }
        }
    }

    // Enhanced notification function
    function showNotification(message, duration = 3000, type = 'info') {
        // Remove existing notifications
        const existing = document.querySelectorAll('.notification');
        existing.forEach(n => n.remove());
        
        if (message === true || message === false) {
            // Handle loading states
            if (message === true) {
                const loader = document.createElement('div');
                loader.className = 'notification loading';
                loader.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="width: 20px; height: 20px; border: 2px solid #4CAF50; border-top: 2px solid transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                        <span>Loading...</span>
                    </div>
                `;
                Object.assign(loader.style, {
                    position: 'fixed', top: '20px', right: '20px', zIndex: '4000',
                    backgroundColor: '#333', color: 'white', padding: '15px 20px',
                    borderRadius: '6px', border: '1px solid #555',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    fontFamily: 'Arial, sans-serif'
                });
                
                // Add spin animation if not exists
                if (!document.getElementById('spin-animation')) {
                    const style = document.createElement('style');
                    style.id = 'spin-animation';
                    style.textContent = '@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
                    document.head.appendChild(style);
                }
                
                document.body.appendChild(loader);
            }
            return;
        }
        
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        
        const colors = {
            info: '#2196F3',
            success: '#4CAF50',
            warning: '#FF9800',
            error: '#f44336'
        };
        
        Object.assign(notification.style, {
            position: 'fixed', top: '20px', right: '20px', zIndex: '4000',
            backgroundColor: colors[type] || colors.info, color: 'white',
            padding: '15px 20px', borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            fontFamily: 'Arial, sans-serif', maxWidth: '400px',
            transform: 'translateX(100%)', transition: 'transform 0.3s ease'
        });
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 10);
        
        // Auto remove
        if (duration > 0) {
            setTimeout(() => {
                notification.style.transform = 'translateX(100%)';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.remove();
                    }
                }, 300);
            }, duration);
        }
        
        // Click to dismiss
        notification.onclick = () => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => notification.remove(), 300);
        };
    }
    
    // Global functions for selection actions
    window.exportSelectedRows = function() {
        if (state.selectedRows.size === 0) {
            showNotification('No rows selected for export', 2000, 'warning');
            return;
        }
        
        showExportDialog(state);
        
        // Set the selected scope after dialog creation
        setTimeout(() => {
            const selectedRadio = document.querySelector('input[name="export-scope"][value="selected"]');
            if (selectedRadio) {
                selectedRadio.checked = true;
            }
        }, 100);
    };

    window.clearSelection = function() {
        state.selectedRows.clear();
        renderTable(state.data, state.selectedColumns);
        showNotification('Selection cleared', 1500, 'info');
    };

    // Initialize filter indicator
    updateFilterIndicator();
}
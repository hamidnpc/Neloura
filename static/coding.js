// static/coding.js

function createCodingContainer() {
    const containerId = 'dynamic-coding-panel';
    if (document.getElementById(containerId)) {
        return;
    }

    const codingContainer = document.createElement('div');
    codingContainer.id = containerId;
    codingContainer.style.position = 'fixed';
    codingContainer.style.top = '0';
    codingContainer.style.right = '0';
    codingContainer.style.transform = 'translateX(100%)';
    codingContainer.style.width = '600px';
    codingContainer.style.height = '100vh';
    codingContainer.style.backgroundColor = 'rgba(20, 20, 20, 0.95)';
    codingContainer.style.color = 'white';
    codingContainer.style.padding = '15px';
    codingContainer.style.boxSizing = 'border-box';
    codingContainer.style.zIndex = '1001'; // Higher than plotter
    codingContainer.style.transition = 'transform 0.3s ease-in-out';
    codingContainer.style.overflowY = 'auto';
    codingContainer.style.fontFamily = 'monospace';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.paddingBottom = '10px';
    header.style.borderBottom = '1px solid rgba(255, 255, 255, 0.2)';

    const title = document.createElement('h2');
    title.textContent = 'Skaha Coding Environment';
    title.style.margin = '0';
    title.style.fontSize = '18px';

    const closeButton = document.createElement('button');
    closeButton.innerHTML = '&times;';
    closeButton.className = 'coding-panel-button';
    closeButton.onclick = hideCodingPanel;

    header.appendChild(title);
    header.appendChild(closeButton);
    codingContainer.appendChild(header);

    const content = document.createElement('div');
    content.id = 'coding-content';
    codingContainer.appendChild(content);

    document.body.appendChild(codingContainer);
    
    injectCodingStyles();
    loadCodingDashboard();
}

function toggleCodingPanel() {
    if (!document.getElementById('dynamic-coding-panel')) {
        createCodingContainer();
    }
    const codingContainer = document.getElementById('dynamic-coding-panel');
    if (!codingContainer) return;

    const isVisible = codingContainer.style.transform === 'translateX(0px)' || codingContainer.style.transform === 'translateX(0)';
    if (isVisible) {
        hideCodingPanel();
    } else {
        showCodingPanel();
    }
}

function showCodingPanel() {
    const codingContainer = document.getElementById('dynamic-coding-panel');
    if (codingContainer) codingContainer.style.transform = 'translateX(0)';
}

function hideCodingPanel() {
    const codingContainer = document.getElementById('dynamic-coding-panel');
    if (codingContainer) codingContainer.style.transform = 'translateX(100%)';
}

function loadCodingDashboard() {
    const content = document.getElementById('coding-content');
    if (!content) return;
    content.innerHTML = `
        <div class="coding-section">
            <h3>Authentication</h3>
            <p>Authentication is handled automatically by the server.</p>
            <p>Please ensure a single <code>.pem</code> certificate file is present in the <code>files/</code> directory of the project.</p>
            <div id="auth-status" style="margin-top: 10px; font-weight: bold;"></div>
        </div>
        <div class="coding-section">
            <div class="coding-actions">
                <button class="coding-panel-button" onclick="renderNewSessionForm()">New Session</button>
                <button class="coding-panel-button" onclick="renderSessionList()">My Sessions</button>
                <button class="coding-panel-button" onclick="renderResourceContexts()">View Resources</button>
            </div>
        </div>
        <div id="coding-main-view" class="coding-section">
            <!-- Content will be loaded here -->
        </div>
    `;
    renderSessionList('Running'); // Default view to Running sessions
}

async function renderSessionList(status = '') {
    const mainView = document.getElementById('coding-main-view');
    const filterHtml = `
        <div class="session-filters">
            <span>Filter by status:</span>
            <button class="coding-panel-button small ${status === '' ? 'active' : ''}" onclick="renderSessionList('')">All</button>
            <button class="coding-panel-button small ${status === 'Running' ? 'active' : ''}" onclick="renderSessionList('Running')">Running</button>
            <button class="coding-panel-button small ${status === 'Pending' ? 'active' : ''}" onclick="renderSessionList('Pending')">Pending</button>
            <button class="coding-panel-button small ${status === 'Succeeded' ? 'active' : ''}" onclick="renderSessionList('Succeeded')">Succeeded</button>
            <button class="coding-panel-button small ${status === 'Error' ? 'active' : ''}" onclick="renderSessionList('Error')">Error</button>
        </div>
    `;

    mainView.innerHTML = `<h3>My Sessions</h3>${filterHtml}<div id="session-list-container"><div class="loader"></div></div>`;
    const container = document.getElementById('session-list-container');
    const authStatus = document.getElementById('auth-status');
    
    try {
        const url = status ? `/coding/sessions?status=${status}` : '/coding/sessions';
        const response = await fetch(url);
        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `Failed to load sessions: ${response.status}`;
            try {
                const errorJson = JSON.parse(errorText);
                if (errorJson.detail) {
                    errorMessage = errorJson.detail;
                }
            } catch (e) {
                 errorMessage += ` - ${errorText}`;
            }
            throw new Error(errorMessage);
        }
        
        if(authStatus) {
            authStatus.textContent = "Authenticated successfully.";
            authStatus.style.color = 'lightgreen';
        }

        const sessions = await response.json();

        if (!document.body.contains(container)) return;
        
        if (sessions.length === 0) {
            container.innerHTML = '<p>No active sessions.</p>';
            return;
        }

        let tableHTML = '<table class="coding-table"><thead><tr><th>Name</th><th>Type</th><th>Status</th><th>Image</th><th>Start Time</th><th>Actions</th></tr></thead><tbody>';
        sessions.forEach(s => {
            const connectUrl = s.connectURL || s.connectUrl || s.connect_url;
            const connectButton = connectUrl 
                ? `<a href="${connectUrl}" target="_blank" class="coding-panel-button small">Connect</a>`
                : `<button class="coding-panel-button small" disabled>Connect</button>`;
            
            tableHTML += `
                <tr>
                    <td>${s.name || '<em>(no name)</em>'}</td>
                    <td>${s.type}</td>
                    <td><span class="status-${s.status.toLowerCase()}">${s.status}</span></td>
                    <td>${s.image.split('/').pop()}</td>
                    <td>${new Date(s.startTime).toLocaleString()}</td>
                    <td>
                        ${connectButton}
                        <button class="coding-panel-button small" onclick="showSessionDetails('${s.id}')">Details</button>
                        <button class="coding-panel-button small danger" onclick="deleteSession('${s.id}')">Delete</button>
                    </td>
                </tr>`;
        });
        tableHTML += '</tbody></table>';
        container.innerHTML = tableHTML;
    } catch (error) {
        if(authStatus) {
            authStatus.textContent = `Error: ${error.message}`;
            authStatus.style.color = 'coral';
        }
        if (container && document.body.contains(container)) {
            container.textContent = `Could not load sessions. Please check authentication status above.`;
        }
    }
}

async function renderResourceContexts() {
    const mainView = document.getElementById('coding-main-view');
    mainView.innerHTML = '<h3>Available Resources</h3><div id="resource-context-container"><div class="loader"></div></div>';
    const container = document.getElementById('resource-context-container');

    try {
        const response = await fetch('/coding/context');
        if (!response.ok) {
            throw new Error('Could not load resource contexts.');
        }
        const contexts = await response.json();

        if (!document.body.contains(container)) return;

        let html = `
            <div class="resource-grid">
                <div class="resource-card">
                    <h4>CPU Cores</h4>
                    <div class="resource-bar-container">
                        ${contexts.cores.options.map(core => `
                            <div class="resource-bar-wrapper">
                                <span>${core} ${core === contexts.cores.default ? ' (Default)' : ''}</span>
                                <div class="resource-bar cpu-bar" style="width: ${ (core / Math.max(...contexts.cores.options)) * 100 }%" title="${core} Cores ${core === contexts.cores.default ? '(Default)' : ''}"></div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="resource-card">
                    <h4>Memory (RAM)</h4>
                    <div class="resource-bar-container">
                        ${contexts.memoryGB.options.map(ram => `
                            <div class="resource-bar-wrapper">
                                <span>${ram}GB ${ram === contexts.memoryGB.default ? ' (Default)' : ''}</span>
                                <div class="resource-bar ram-bar" style="width: ${ (ram / Math.max(...contexts.memoryGB.options)) * 100 }%" title="${ram}GB RAM ${ram === contexts.memoryGB.default ? '(Default)' : ''}"></div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        container.innerHTML = html;

    } catch (error) {
        if (container && document.body.contains(container)) {
            container.innerHTML = `<p>Error loading resources: ${error.message}</p>`;
        }
    }
}

async function renderRepositoryList() {
    const mainView = document.getElementById('coding-main-view');
    mainView.innerHTML = '<h3>Image Repositories</h3><div id="repository-list-container"><div class="loader"></div></div>';
    const container = document.getElementById('repository-list-container');
    
    try {
        const response = await fetch('/coding/repository');
        if (!response.ok) throw new Error('Could not load repositories.');
        const repositories = await response.json();

        let listHtml = '<ul>';
        repositories.forEach(repo => {
            listHtml += `<li>${repo}</li>`;
        });
        listHtml += '</ul>';
        
        container.innerHTML = listHtml;
    } catch (error) {
        container.textContent = `Error: ${error.message}`;
    }
}

async function showSessionDetails(sessionId) {
    const modalId = `modal-${sessionId}`;
    let modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'coding-modal';
    modal.innerHTML = `
        <div class="coding-modal-content">
            <span class="coding-modal-close" onclick="document.getElementById('${modalId}').remove()">&times;</span>
            <h2>Session Details</h2>
            <div id="modal-content-${sessionId}"><div class="loader"></div></div>
        </div>
    `;
    document.body.appendChild(modal);

    const contentArea = document.getElementById(`modal-content-${sessionId}`);

    try {
        const response = await fetch(`/coding/sessions/${sessionId}`);
        if (!response.ok) throw new Error('Could not load session details.');
        const details = await response.json();

        let detailsHtml = `
            <div class="session-details-grid">
                <div><strong>ID:</strong></div><div>${details.id}</div>
                <div><strong>Name:</strong></div><div>${details.name}</div>
                <div><strong>Status:</strong></div><div><span class="status-${details.status.toLowerCase()}">${details.status}</span></div>
                <div><strong>Type:</strong></div><div>${details.type}</div>
                <div><strong>Image:</strong></div><div>${details.image}</div>
                <div><strong>Cores:</strong></div><div>${details.resources?.requests?.cpu || 'N/A'}</div>
                <div><strong>RAM:</strong></div><div>${details.resources?.requests?.memory || 'N/A'}</div>
                <div><strong>Start Time:</strong></div><div>${new Date(details.startTime).toLocaleString()}</div>
            </div>
            <div class="session-details-actions">
                <button class="coding-panel-button" onclick="renewSession('${sessionId}', this)">Renew</button>
            </div>
            <div class="session-details-tabs">
                <button class="coding-tab-button" onclick="loadSessionLogs('${sessionId}')">Logs</button>
                <button class="coding-tab-button" onclick="loadSessionEvents('${sessionId}')">Events</button>
                ${details.type === 'desktop' ? `<button class="coding-tab-button" onclick="loadDesktopApps('${sessionId}')">Desktop Apps</button>` : ''}
            </div>
            <div id="session-tab-content-${sessionId}" class="session-tab-content"></div>
        `;
        contentArea.innerHTML = detailsHtml;

    } catch (error) {
        contentArea.innerHTML = `<p>Error loading details: ${error.message}</p>`;
    }
}

async function loadDesktopApps(sessionId) {
    const contentArea = document.getElementById(`session-tab-content-${sessionId}`);
    contentArea.innerHTML = '<div class="loader"></div>';

    try {
        const response = await fetch(`/coding/sessions/${sessionId}/apps`);
        if (!response.ok) throw new Error('Could not load desktop apps.');
        const apps = await response.json();

        let appsHtml = `<button class="coding-panel-button" onclick="showAttachAppForm('${sessionId}')">Attach New App</button>`;
        appsHtml += `<div id="attach-app-form-${sessionId}" style="display:none; margin-top:15px;"></div>`;

        if (apps.length === 0) {
            appsHtml += '<p>No attached desktop apps.</p>';
        } else {
            appsHtml += '<table class="coding-table" style="margin-top:15px;"><thead><tr><th>Name</th><th>Status</th><th>Image</th><th>Actions</th></tr></thead><tbody>';
            apps.forEach(app => {
                const connectButton = app.connectURL ? `<a href="${app.connectURL}" target="_blank" class="coding-panel-button small">Connect</a>` : '';
                appsHtml += `
                    <tr>
                        <td>${app.name || '<em>(unnamed app)</em>'}</td>
                        <td><span class="status-${app.status.toLowerCase()}">${app.status}</span></td>
                        <td>${app.image.split('/').pop()}</td>
                        <td>
                            ${connectButton}
                            <button class="coding-panel-button small" onclick="showAppDetails('${sessionId}', '${app.id}')">Details</button>
                            <button class="coding-panel-button small danger" onclick="deleteDesktopApp('${sessionId}', '${app.id}')">Delete</button>
                        </td>
                    </tr>`;
            });
            appsHtml += '</tbody></table>';
        }
        contentArea.innerHTML = appsHtml;
    } catch (error) {
        contentArea.innerHTML = `<p>Error loading apps: ${error.message}</p>`;
    }
}

async function showAttachAppForm(sessionId) {
    const formContainer = document.getElementById(`attach-app-form-${sessionId}`);
    formContainer.style.display = 'block';
    formContainer.innerHTML = '<div class="loader"></div>';

    try {
        const [imagesRes, contextsRes] = await Promise.all([
            fetch('/coding/images?image_type=desktop-app'),
            fetch('/coding/context')
        ]);

        if (!imagesRes.ok || !contextsRes.ok) {
            throw new Error('Failed to load data for the form.');
        }

        const images = await imagesRes.json();
        const contexts = await contextsRes.json();
        const ramOptions = contexts.memoryGB.options.map(r => `<option value="${r}">${r}GB</option>`).join('');
        const coreOptions = contexts.cores.options.map(c => `<option value="${c}">${c}</option>`).join('');
        const imageOptions = images.map(img => `<option value="${img.id}">${img.id}</option>`).join('');

        formContainer.innerHTML = `
            <div class="form-grid">
                <label>Image:</label><select id="app-image-${sessionId}">${imageOptions}</select>
                <label>Cores:</label><select id="app-cores-${sessionId}">${coreOptions}</select>
                <label>RAM:</label><select id="app-ram-${sessionId}">${ramOptions}</select>
            </div>
            <button class="coding-panel-button" onclick="attachNewApp('${sessionId}')">Attach App</button>
        `;
    } catch (error) {
        formContainer.innerHTML = `<p>Error loading form: ${error.message}</p>`;
    }
}

async function attachNewApp(sessionId) {
    const image = document.getElementById(`app-image-${sessionId}`).value;
    const cores = document.getElementById(`app-cores-${sessionId}`).value;
    const ram = document.getElementById(`app-ram-${sessionId}`).value;

    try {
        const response = await fetch(`/coding/sessions/${sessionId}/apps`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image, cores, ram })
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to attach app');
        }
        await response.json();
        loadDesktopApps(sessionId); // Refresh the list
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

async function deleteDesktopApp(sessionId, appId) {
    showConfirmationModal('Are you sure you want to delete this app?', async () => {
    try {
        const response = await fetch(`/coding/sessions/${sessionId}/apps/${appId}`, { method: 'DELETE' });
        if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to delete app');
        }
            loadDesktopApps(sessionId); // Refresh
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
    });
}

async function renewSession(sessionId, button) {
    button.disabled = true;
    button.textContent = 'Renewing...';
    try {
        const response = await fetch(`/coding/sessions/${sessionId}/renew`, { method: 'POST' });
        if (!response.ok) throw new Error('Could not renew session.');
        alert('Session renewed successfully.');
    } catch (error) {
        alert(`Error: ${error.message}`);
    } finally {
        button.disabled = false;
        button.textContent = 'Renew';
    }
}

async function loadSessionLogs(sessionId) {
    const contentArea = document.getElementById(`session-tab-content-${sessionId}`);
    contentArea.innerHTML = '<div class="loader"></div>';
    try {
        const response = await fetch(`/coding/sessions/${sessionId}?view=logs`);
        if (!response.ok) throw new Error('Could not load logs.');
        const logs = await response.text();
        contentArea.innerHTML = `<pre class="log-view">${logs || '(No logs available)'}</pre>`;
    } catch (error) {
        contentArea.innerHTML = `<p>Error: ${error.message}</p>`;
    }
}

async function loadSessionEvents(sessionId) {
    const contentArea = document.getElementById(`session-tab-content-${sessionId}`);
    contentArea.innerHTML = '<div class="loader"></div>';
     try {
        const response = await fetch(`/coding/sessions/${sessionId}?view=events`);
        if (!response.ok) throw new Error('Could not load events.');
        const events = await response.json();
        
        if (!events.items || events.items.length === 0) {
            contentArea.innerHTML = '<p>No events found for this session.</p>';
            return;
        }

        let eventsHtml = '<table class="coding-table"><thead><tr><th>Timestamp</th><th>Type</th><th>Reason</th><th>Message</th></tr></thead><tbody>';
        events.items.forEach(event => {
            eventsHtml += `
                <tr>
                    <td>${new Date(event.metadata.creationTimestamp).toLocaleString()}</td>
                    <td>${event.type}</td>
                    <td>${event.reason}</td>
                    <td>${event.message}</td>
                </tr>
            `;
            });
        eventsHtml += '</tbody></table>';
        contentArea.innerHTML = eventsHtml;
    } catch (error) {
        contentArea.innerHTML = `<p>Error: ${error.message}</p>`;
    }
}

async function showAppDetails(sessionId, appId) {
    const modalId = `modal-app-${appId}`;
    let modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'coding-modal';
    modal.innerHTML = `
        <div class="coding-modal-content">
            <span class="coding-modal-close" onclick="document.getElementById('${modalId}').remove()">&times;</span>
            <h2>Application Details</h2>
            <div id="modal-content-${appId}"><div class="loader"></div></div>
        </div>
    `;
    document.body.appendChild(modal);

    const contentArea = document.getElementById(`modal-content-${appId}`);

    try {
        const response = await fetch(`/coding/sessions/${sessionId}/apps/${appId}`);
        if (!response.ok) throw new Error('Could not load application details.');
        const details = await response.json();

        let detailsHtml = `
            <div class="session-details-grid">
                <div><strong>ID:</strong></div><div>${details.id}</div>
                <div><strong>Name:</strong></div><div>${details.name}</div>
                <div><strong>Status:</strong></div><div><span class="status-${details.status.toLowerCase()}">${details.status}</span></div>
                <div><strong>Image:</strong></div><div>${details.image}</div>
                <div><strong>Cores:</strong></div><div>${details.resources?.requests?.cpu || 'N/A'}</div>
                <div><strong>RAM:</strong></div><div>${details.resources?.requests?.memory || 'N/A'}</div>
                <div><strong>Start Time:</strong></div><div>${new Date(details.startTime).toLocaleString()}</div>
            </div>
        `;
        contentArea.innerHTML = detailsHtml;
    } catch (error) {
        contentArea.innerHTML = `<p>Error loading details: ${error.message}</p>`;
    }
}

async function renderNewSessionForm() {
    const mainView = document.getElementById('coding-main-view');
    mainView.innerHTML = '<h3>Create New Session</h3><div id="new-session-form-container"><div class="loader"></div></div>';
    const formContainer = document.getElementById('new-session-form-container');

    try {
        const [imagesRes, contextsRes] = await Promise.all([
            fetch('/coding/images'), 
            fetch('/coding/context')
        ]);

        if (!imagesRes.ok || !contextsRes.ok) {
            throw new Error('Failed to load data for the form.');
        }

        const images = await imagesRes.json();
        const contexts = await contextsRes.json();

        const ramOptions = contexts.memoryGB.options.map(r => `<option value="${r}" ${r === contexts.memoryGB.default ? 'selected' : ''}>${r}GB</option>`).join('');
        const coreOptions = contexts.cores.options.map(c => `<option value="${c}" ${c === contexts.cores.default ? 'selected' : ''}>${c}</option>`).join('');
        
        const validSessionTypes = ['desktop', 'notebook', 'carta', 'headless'];
        const imageOptions = images
            .map(img => {
                const launchableType = img.types ? img.types.find(t => validSessionTypes.includes(t)) : undefined;
                if (launchableType) {
                    return `<option value="${img.id}" data-type="${launchableType}">${img.id}</option>`;
                }
                return null;
            })
            .filter(Boolean)
            .join('');

        formContainer.innerHTML = `
            <div id="form-status"></div>
            <div class="form-grid">
                <label for="session-name">Name:</label><input type="text" id="session-name" placeholder="My Session">
                <label for="session-image">Image:</label>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <select id="session-image" onchange="toggleHeadlessFields(this)" style="flex-grow: 1;">${imageOptions}</select>
                    <span id="image-type-display" style="font-size: 12px; background-color: #444; padding: 5px 8px; border-radius: 4px;"></span>
                </div>
                <label for="session-cores">Cores:</label><select id="session-cores">${coreOptions}</select>
                <label for="session-ram">RAM:</label><select id="session-ram">${ramOptions}</select>
            </div>
            <div id="headless-fields" style="display: none;">
                 <div class="form-grid">
                    <label for="session-cmd">Command:</label><input type="text" id="session-cmd" placeholder="e.g., /bin/bash">
                    <label for="session-args">Arguments:</label><input type="text" id="session-args" placeholder="e.g., -c 'echo hello'">
                    <label for="session-env">Environment:</label><input type="text" id="session-env" placeholder="e.g., KEY=VALUE">
                </div>
            </div>
            <div class="form-grid" style="margin-top: 15px;">
                <label for="private-registry-toggle">Private Registry?</label>
                <input type="checkbox" id="private-registry-toggle" onchange="togglePrivateRegistryFields(this)" style="justify-self: start;">
            </div>
            <div id="private-registry-fields" style="display: none;">
                 <div class="form-grid">
                    <label for="registry-username">Username:</label><input type="text" id="registry-username">
                    <label for="registry-password">Password:</label><input type="password" id="registry-password">
                </div>
                </div>
            <button class="coding-panel-button" onclick="createNewSession()">Create Session</button>
        `;

    } catch (error) {
        formContainer.innerHTML = `<p>Error loading form: ${error.message}</p>`;
    }
}

function togglePrivateRegistryFields(checkbox) {
    const privateFields = document.getElementById('private-registry-fields');
    privateFields.style.display = checkbox.checked ? 'block' : 'none';
}

function toggleHeadlessFields(selectElement) {
    const selectedOption = selectElement.options[selectElement.selectedIndex];
    const headlessFields = document.getElementById('headless-fields');
    const imageTypeDisplay = document.getElementById('image-type-display');
    
    const imageType = selectedOption.dataset.type;
    imageTypeDisplay.textContent = imageType ? imageType.toUpperCase() : '';

    if (imageType === 'headless') {
        headlessFields.style.display = 'block';
        } else {
        headlessFields.style.display = 'none';
    }
}

async function createNewSession() {
    const name = document.getElementById('session-name').value;
    const image = document.getElementById('session-image').value;
    const cores = document.getElementById('session-cores').value;
    const ram = document.getElementById('session-ram').value;
    const imageSelect = document.getElementById('session-image');
    const selectedOption = imageSelect.options[imageSelect.selectedIndex];
    const type = selectedOption.dataset.type;
    const statusDiv = document.getElementById('form-status');
    const createButton = document.querySelector('#new-session-form-container button');

    let sessionDetails = { name, image, cores, ram, type };

    if (type === 'headless') {
        const cmd = document.getElementById('session-cmd').value;
        const args = document.getElementById('session-args').value;
        const env = document.getElementById('session-env').value;
        if (cmd) sessionDetails.cmd = cmd;
        if (args) sessionDetails.args = args;
        if (env) sessionDetails.env = env;
    }

    const privateRegistryToggle = document.getElementById('private-registry-toggle');
    if (privateRegistryToggle.checked) {
        const username = document.getElementById('registry-username').value;
        const password = document.getElementById('registry-password').value;
        if (username && password) {
            sessionDetails.registry_username = username;
            sessionDetails.registry_password = password;
        }
    }

    if (!name || !image) {
        statusDiv.textContent = 'Name and image are required.';
        statusDiv.style.color = 'coral';
        return;
    }

    createButton.disabled = true;
    createButton.innerHTML = '<div class="button-loader"></div> Creating...';

    try {
        const response = await fetch('/coding/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sessionDetails)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to create session');
        }

        await response.json();
        statusDiv.textContent = 'Session created successfully! Returning to session list...';
        statusDiv.style.color = 'lightgreen';
        setTimeout(renderSessionList, 2000);

    } catch (error) {
        statusDiv.textContent = `Error: ${error.message}`;
        statusDiv.style.color = 'coral';
    } finally {
        createButton.disabled = false;
        createButton.innerHTML = 'Create Session';
    }
}

async function deleteSession(sessionId) {
    showConfirmationModal('Are you sure you want to delete this session?', async () => {
    try {
            const response = await fetch(`/coding/sessions/${sessionId}`, {
                method: 'DELETE'
            });
         if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to delete session');
        }
        renderSessionList();
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
    });
}

function showConfirmationModal(message, onConfirm) {
    const modalId = 'confirmation-modal';
    if (document.getElementById(modalId)) {
        document.getElementById(modalId).remove();
    }

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'coding-modal';
    modal.innerHTML = `
        <div class="confirm-modal-content">
            <p>${message}</p>
            <div class="confirm-modal-actions">
                <button id="confirm-cancel-btn" class="coding-panel-button">Cancel</button>
                <button id="confirm-ok-btn" class="coding-panel-button danger">Confirm</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('confirm-ok-btn').onclick = () => {
        onConfirm();
        modal.remove();
    };
    document.getElementById('confirm-cancel-btn').onclick = () => {
        modal.remove();
    };
}


function injectCodingStyles() {
    const styleId = 'coding-panel-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.innerHTML = `
        .coding-panel-button {
            background-color: #007bff; color: white; border: none; padding: 8px 12px;
            border-radius: 4px; cursor: pointer; transition: background-color 0.2s;
            font-size: 14px; margin-right: 5px;
        }
        .coding-panel-button:hover { background-color: #0056b3; }
        .coding-panel-button.small { padding: 4px 8px; font-size: 12px; }
        .coding-panel-button.danger { background-color: #dc3545; }
        .coding-panel-button.danger:hover { background-color: #c82333; }
        .coding-panel-button:disabled { background-color: #555; cursor: not-allowed; }
        .coding-panel-button.active {
            background-color: #0056b3;
            font-weight: bold;
        }
        
        .button-loader {
            display: inline-block;
            border: 2px solid rgba(255, 255, 255, 0.5);
            border-radius: 50%;
            border-top: 2px solid #fff;
            width: 14px;
            height: 14px;
            animation: spin 1s linear infinite;
            margin-right: 8px;
            vertical-align: middle;
        }

        .session-filters {
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
        }
        .session-filters span {
            font-size: 14px;
        }

        .coding-section { margin-top: 20px; }
        .coding-actions { display: flex; gap: 10px; margin-top: 10px; }
        
        .coding-table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        .coding-table th, .coding-table td {
            border: 1px solid rgba(255, 255, 255, 0.2);
            padding: 8px; text-align: left; font-size: 12px;
        }
        .coding-table th { background-color: rgba(255, 255, 255, 0.1); }
        .coding-table a { color: #8ab4f8; text-decoration: none; }
        .coding-table a:hover { text-decoration: underline; }

        .status-running { color: lightgreen; }
        .status-pending { color: yellow; }
        .status-error, .status-failed { color: coral; }
        .status-succeeded { color: lightgray; }
        .status-terminating { color: orange; }

        .confirm-modal-content {
            background-color: #2c2c2c;
            margin: 15% auto;
            padding: 25px;
            border: 1px solid #888;
            width: 90%;
            max-width: 400px;
            color: white;
            border-radius: 8px;
            text-align: center;
        }

        .confirm-modal-content p {
            margin: 0 0 20px;
            font-size: 16px;
        }

        .confirm-modal-actions {
            display: flex;
            justify-content: center;
            gap: 15px;
        }

        .coding-modal { 
            display: block; position: fixed; z-index: 1002; left: 0; top: 0;
            width: 100%; height: 100%; overflow: auto; background-color: rgba(0,0,0,0.6);
        }
        .coding-modal-content {
            background-color: #2c2c2c; margin: 10% auto; padding: 20px;
            border: 1px solid #888; width: 80%; max-width: 700px;
            color: white; border-radius: 5px; position: relative;
        }
        .coding-modal-close {
            color: #aaa; position: absolute; top: 10px; right: 20px;
            font-size: 28px; font-weight: bold; cursor: pointer;
        }

        .session-details-grid {
            display: grid; grid-template-columns: 120px 1fr; gap: 10px;
        }
        .session-details-actions { margin-top: 20px; }
        .session-details-tabs { margin-top: 20px; border-bottom: 1px solid #555; }
        .coding-tab-button {
            background: none; border: none; color: white; padding: 10px 15px;
            cursor: pointer; border-bottom: 2px solid transparent;
        }
        .coding-tab-button:hover { background-color: #444; }
        .session-tab-content {
            background-color: #111; padding: 10px; border-radius: 4px;
            margin-top: 10px; max-height: 300px; overflow-y: auto;
        }
        .log-view { white-space: pre-wrap; word-break: break-all; font-family: monospace; }
        
        .form-grid {
            display: grid; grid-template-columns: 120px 1fr; gap: 15px;
            align-items: center; margin-top: 20px;
        }
        .form-grid input, .form-grid select {
            width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #555;
            background-color: #333; color: white;
        }
        #form-status { margin-top: 15px; font-weight: bold; }
        
        .loader {
            border: 4px solid #f3f3f3;
            border-radius: 50%;
            border-top: 4px solid #3498db;
            width: 20px;
            height: 20px;
            animation: spin 1s linear infinite;
            margin: 20px auto;
        }

        .resource-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
        }
        .resource-card {
            background-color: #222;
            padding: 15px;
            border-radius: 5px;
        }
        .resource-card h4 {
            margin-top: 0;
            margin-bottom: 15px;
            border-bottom: 1px solid #555;
            padding-bottom: 10px;
        }
        .resource-bar-container {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .resource-bar-wrapper {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .resource-bar {
            height: 22px;
            border-radius: 3px;
            animation: grow 0.6s ease-out forwards;
            transform-origin: left;
            white-space: nowrap;
            overflow: hidden;
            color: white;
            padding-left: 8px;
            box-sizing: border-box;
            line-height: 22px;
        }

        .cpu-bar {
            background: linear-gradient(90deg, #3498db, #2980b9);
        }

        .ram-bar {
            background: linear-gradient(90deg, #2ecc71, #27ae60);
        }

        .resource-bar-wrapper span {
            font-size: 12px;
            width: 100px;
        }


        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        @keyframes grow {
            from {
                transform: scaleX(0);
            }
            to {
                transform: scaleX(1);
            }
        }
    `;
    document.head.appendChild(style);
} 
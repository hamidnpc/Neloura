let localCodeMirrorEditor;
let currentExecutionId = null;

function createLocalCodingContainer() {
    const containerId = 'dynamic-local-coding-panel';
    if (document.getElementById(containerId)) {
        return;
    }

    const container = document.createElement('div');
    container.id = containerId;
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.right = '0';
    container.style.transform = 'translateX(100%)';
    container.style.width = '600px';
    container.style.height = '100vh';
    container.style.backgroundColor = 'rgba(20, 20, 20, 0.95)';
    container.style.color = 'white';
    container.style.padding = '15px';
    container.style.boxSizing = 'border-box';
    container.style.zIndex = '1001';
    container.style.transition = 'transform 0.3s ease-in-out';
    container.style.fontFamily = 'monospace';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.paddingBottom = '10px';
    header.style.borderBottom = '1px solid rgba(255, 255, 255, 0.2)';

    const title = document.createElement('h2');
    title.textContent = 'Local Python Runner';
    title.style.margin = '0';
    title.style.fontSize = '18px';

    const closeButton = document.createElement('button');
    closeButton.innerHTML = '&times;';
    closeButton.className = 'coding-panel-button';
    closeButton.onclick = hideLocalCodingPanel;

    header.appendChild(title);
    header.appendChild(closeButton);
    container.appendChild(header);

    const editorSection = document.createElement('div');
    editorSection.style.flexGrow = '1';
    editorSection.style.display = 'flex';
    editorSection.style.flexDirection = 'column';
    editorSection.style.minHeight = '0'; // Flexbox fix for overflow

    const editorLabel = document.createElement('h3');
    editorLabel.textContent = 'Python Code';
    editorLabel.style.marginTop = '15px';
    editorLabel.style.marginBottom = '10px';

    const codeEditorTextarea = document.createElement('textarea');
    codeEditorTextarea.id = 'local-code-editor';

    editorSection.appendChild(editorLabel);
    editorSection.appendChild(codeEditorTextarea);

    const controlsContainer = document.createElement('div');
    controlsContainer.style.display = 'flex';
    controlsContainer.style.alignItems = 'center';
    controlsContainer.style.marginTop = '10px';

    const runButton = document.createElement('button');
    runButton.id = 'local-run-button';
    runButton.className = 'coding-panel-button';
    runButton.innerHTML = `
        <span class="play-icon" style="display: flex; align-items: center;">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg>
        </span>
        <span class="button-text" style="margin-left: 8px;">Run</span>
    `;
    runButton.onclick = runLocalCode;

    const stopButton = document.createElement('button');
    stopButton.id = 'local-stop-button';
    stopButton.className = 'coding-panel-button';
    stopButton.style.display = 'none'; // Initially hidden
    stopButton.style.backgroundColor = '#c0392b';
    stopButton.style.marginLeft = '10px';
    stopButton.innerHTML = `
        <span class="stop-icon" style="display: flex; align-items: center;">
             <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 6h12v12H6z"></path></svg>
        </span>
        <span class="button-text" style="margin-left: 8px;">Stop</span>
    `;
    stopButton.onclick = stopLocalCode;

    const openImageButton = document.createElement('button');
    openImageButton.id = 'local-open-image-button';
    openImageButton.className = 'coding-panel-button';
    openImageButton.style.marginLeft = 'auto'; // Push it to the right
    openImageButton.innerHTML = `
        <span class="button-text">Open Image in Viewer</span>
    `;
    openImageButton.onclick = insertOpenImageTemplate;

    const loader = document.createElement('div');
    loader.id = 'local-run-loader';
    loader.className = 'button-loader';
    loader.style.display = 'none';
    loader.style.marginLeft = '10px';

    controlsContainer.appendChild(runButton);
    controlsContainer.appendChild(stopButton);
    controlsContainer.appendChild(loader);
    controlsContainer.appendChild(openImageButton); // Add the new button
    container.appendChild(editorSection);
    container.appendChild(controlsContainer);

    const outputSection = document.createElement('div');
    outputSection.style.flexGrow = '1';
    outputSection.style.display = 'flex';
    outputSection.style.flexDirection = 'column';
    outputSection.style.minHeight = '0';
    outputSection.style.overflowY = 'auto';
    outputSection.style.overflowX = 'hidden';

    const outputLabel = document.createElement('h3');
    outputLabel.textContent = 'Output';
    outputLabel.style.marginTop = '15px';
    outputLabel.style.marginBottom = '10px';

    const codeOutput = document.createElement('pre');
    codeOutput.id = 'local-code-output';
    codeOutput.style.width = '100%';
    codeOutput.style.flexGrow = '1';
    codeOutput.style.backgroundColor = '#111';
    codeOutput.style.color = 'white';
    codeOutput.style.border = '1px solid #555';
    codeOutput.style.borderRadius = '4px';
    codeOutput.style.padding = '10px';
    codeOutput.style.whiteSpace = 'pre-wrap';
    codeOutput.style.wordBreak = 'break-all';
    codeOutput.textContent = 'Click "Run" to see the output.';

    const imageOutput = document.createElement('div');
    imageOutput.id = 'local-code-image-output';
    imageOutput.style.marginTop = '10px';
    imageOutput.style.textAlign = 'center';

    outputSection.appendChild(outputLabel);
    outputSection.appendChild(codeOutput);
    outputSection.appendChild(imageOutput);
    container.appendChild(outputSection);

    document.body.appendChild(container);

    localCodeMirrorEditor = CodeMirror.fromTextArea(codeEditorTextarea, {
        mode: 'python',
        theme: 'dracula',
        lineNumbers: true,
        indentUnit: 4,
        extraKeys: {
            "Cmd-/": "toggleComment",
            "Ctrl-/": "toggleComment",
            "Ctrl-Space": "autocomplete"
        },
        hintOptions: {
            completeSingle: false,
            hint: pathCompletions
        }
    });
    localCodeMirrorEditor.setValue(`# Autocomplete suggestions appear as you type.\n# Use Cmd+/ or Ctrl+/ to comment lines\n\nimport os\n\n# List files in the current directory\nprint(os.listdir("."))`);
    
    // Autocomplete on the fly
    localCodeMirrorEditor.on("inputRead", function(cm, change) {
        if (cm.state.completionActive) return;
        // Don't trigger on paste, cut, or when a non-word character is typed
        if (change.origin !== '+input' || /[\W]/.test(change.text[0])) return;
        
        const token = cm.getTokenAt(cm.getCursor());
        // Do not trigger inside of comments
        if (token.type === 'comment') return;
        
        // Otherwise, trigger the autocomplete
        CodeMirror.commands.autocomplete(cm, null, { completeSingle: false });
    });

    // Ensure the CodeMirror instance takes up the available space.
    localCodeMirrorEditor.getWrapperElement().style.flexGrow = '1';
    localCodeMirrorEditor.getWrapperElement().style.minHeight = '100px';
    localCodeMirrorEditor.getWrapperElement().style.borderRadius = '4px';
}

function insertOpenImageTemplate() {
    if (!localCodeMirrorEditor) return;
    const template = `
# This is a special command to open a FITS image in the main viewer.
# Replace the filepath and hdu_index with your desired values.
filepath = 'files/your_file.fits'
hdu_index = 0
print(f"__OPEN_IMAGE__({filepath},{hdu_index})")
`;
    localCodeMirrorEditor.replaceSelection(template);
    localCodeMirrorEditor.focus();
}

async function pathCompletions(cm) {
    const cursor = cm.getCursor();
    const token = cm.getTokenAt(cursor);

    if (token.type !== 'string') {
        return CodeMirror.hint.anyword(cm);
    }

    const pathPrefix = token.string.substring(1, cursor.ch - token.start);

    try {
        const response = await fetch(`/local-coding/autocomplete-paths/?partial_path=${encodeURIComponent(pathPrefix)}`);
        if (!response.ok) return null;
        const completions = await response.json();
        if (!completions || completions.length === 0) return null;

        return {
            list: completions,
            from: CodeMirror.Pos(cursor.line, token.start + 1),
            to: CodeMirror.Pos(cursor.line, token.end - 1)
        };
    } catch (error) {
        console.error("Path completion error:", error);
        return null;
    }
}

function toggleLocalCodingPanel() {
    if (!document.getElementById('dynamic-local-coding-panel')) {
        createLocalCodingContainer();
    }
    const container = document.getElementById('dynamic-local-coding-panel');
    if (!container) return;
    const isVisible = container.style.transform === 'translateX(0px)';
    if (isVisible) {
        hideLocalCodingPanel();
    } else {
        showLocalCodingPanel();
    }
}

function showLocalCodingPanel() {
    const container = document.getElementById('dynamic-local-coding-panel');
    if (container) {
        container.style.transform = 'translateX(0)';
        if (localCodeMirrorEditor) {
            localCodeMirrorEditor.refresh();
        }
    }
}

function hideLocalCodingPanel() {
    const container = document.getElementById('dynamic-local-coding-panel');
    if (container) container.style.transform = 'translateX(100%)';
}

async function runLocalCode() {
    if (!localCodeMirrorEditor) return;
    const output = document.getElementById('local-code-output');
    const imageOutput = document.getElementById('local-code-image-output');
    const runButton = document.getElementById('local-run-button');
    const stopButton = document.getElementById('local-stop-button');
    const loader = document.getElementById('local-run-loader');
    
    const code = localCodeMirrorEditor.getValue();
    currentExecutionId = `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    output.textContent = 'Executing...';
    imageOutput.innerHTML = '';
    runButton.style.display = 'none';
    stopButton.style.display = 'flex';
    loader.style.display = 'block';

    try {
        const response = await fetch('/local-coding/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, execution_id: currentExecutionId })
        });
        
        currentExecutionId = null; 
        const result = await response.json();

        if (response.ok) {
            let outputText = result.stdout || '';
            
            // Check for the magic command to open an image
            const openImageRegex = /__OPEN_IMAGE__\(([^,]+),([^)]+)\)/;
            const match = outputText.match(openImageRegex);

            if (match) {
                // Remove the command from the output
                outputText = outputText.replace(openImageRegex, '').trim();
                
                const filepath = match[1].replace(/['"`]/g, '').trim(); // Remove quotes
                const hdu = parseInt(match[2].trim(), 10);
                
                console.log(`Requesting to open image: ${filepath} with HDU: ${hdu}`);

                // Call the existing function from main.js
                if (typeof selectHdu === 'function') {
                    selectHdu(hdu, filepath);
                    // Add a confirmation message to the output
                    outputText += `\n\n[INFO] Sent command to open ${filepath} (HDU: ${hdu}) in the main viewer.`;
                } else {
                     outputText += `\n\n[ERROR] Could not find the 'selectHdu' function to open the image.`;
                }
            }
            
            let stderrText = result.stderr || '';

            let finalOutput = '';
            if (outputText) {
                finalOutput += `--- STDOUT ---\n${outputText}`;
            }
            if (stderrText) {
                if(finalOutput) finalOutput += '\n\n';
                finalOutput += `--- STDERR ---\n${stderrText}`;
            }
            output.textContent = finalOutput || 'Execution finished with no output.';

            if (result.image) {
                const img = document.createElement('img');
                img.src = result.image;
                img.style.maxWidth = '100%';
                img.style.border = '1px solid #555';
                img.style.borderRadius = '4px';
                img.style.marginTop = '10px';
                imageOutput.appendChild(img);
            }
        } else {
            if (result.detail && result.detail.includes("stopped")) {
                output.textContent = "Execution stopped by user.";
            } else {
                throw new Error(result.detail || 'An unknown error occurred.');
            }
        }
    } catch (error) {
        output.textContent = `Error: ${error.message}`;
    } finally {
        runButton.style.display = 'flex';
        stopButton.style.display = 'none';
        loader.style.display = 'none';
        currentExecutionId = null;
    }
}

async function stopLocalCode() {
    if (!currentExecutionId) return;
    const output = document.getElementById('local-code-output');
    output.textContent = 'Stopping execution...';
    
    try {
        await fetch('/local-coding/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ execution_id: currentExecutionId })
        });
    } catch (error) {
        console.error(`Error stopping code: ${error.message}`);
    }
}
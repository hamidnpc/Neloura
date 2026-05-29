(function () {
    'use strict';

    const CHANNELS = [
        { id: 'r', label: 'Channel 1', defaultMap: 'red' },
        { id: 'g', label: 'Channel 2', defaultMap: 'green' },
        { id: 'b', label: 'Channel 3', defaultMap: 'blue' },
        { id: 'c4', label: 'Channel 4', defaultMap: 'yellow' },
        { id: 'c5', label: 'Channel 5', defaultMap: 'magenta' }
    ];
    const SCALING_OPTIONS = [
        { value: 'linear', label: 'Linear' },
        { value: 'logarithmic', label: 'Logarithmic' },
        { value: 'sqrt', label: 'Square Root' },
        { value: 'power', label: 'Power (10^x)' },
        { value: 'asinh', label: 'Asinh' }
    ];

    const state = {
        active: 'r',
        version: Date.now(),
        openRequestId: 0,
        tileInfo: null,
        channelLabels: {},
        channels: {
            r: { color_map: 'red', scaling_function: 'linear', invert_colormap: false, visible: true, hdu: null, hdu_name: null, show_hdu_controls: false, hdu_user_set: false },
            g: { color_map: 'green', scaling_function: 'linear', invert_colormap: false, visible: true, hdu: null, hdu_name: null, show_hdu_controls: false, hdu_user_set: false },
            b: { color_map: 'blue', scaling_function: 'linear', invert_colormap: false, visible: true, hdu: null, hdu_name: null, show_hdu_controls: false, hdu_user_set: false },
            c4: { color_map: 'yellow', scaling_function: 'linear', invert_colormap: false, visible: true, hdu: null, hdu_name: null, show_hdu_controls: false, hdu_user_set: false },
            c5: { color_map: 'magenta', scaling_function: 'linear', invert_colormap: false, visible: true, hdu: null, hdu_name: null, show_hdu_controls: false, hdu_user_set: false }
        }
    };

    function rootWindow() {
        try { return window.top || window; } catch (_) { return window; }
    }

    function hostDocument() {
        try {
            const root = rootWindow();
            return root.document && root.document.body ? root.document : document;
        } catch (_) {
            return document;
        }
    }

    function request(url, options) {
        if (typeof window.apiFetch === 'function') return window.apiFetch(url, options || {});
        return fetch(url, options || {});
    }

    function notify(message, ms, type) {
        try {
            if (typeof window.showNotification === 'function') window.showNotification(message, ms, type);
        } catch (_) { /* noop */ }
    }

    function defaultChannelLabel(channel) {
        const id = typeof channel === 'string' ? channel : (channel && channel.id);
        const found = CHANNELS.find((ch) => ch.id === id);
        return found ? found.label : 'Channel';
    }

    function sanitizeChannelLabel(value, fallback) {
        const label = String(value || '').replace(/\s+/g, ' ').trim();
        return (label || fallback || 'Channel').slice(0, 32);
    }

    function channelLabel(channel) {
        const id = typeof channel === 'string' ? channel : (channel && channel.id);
        return (state.channelLabels && state.channelLabels[id]) || defaultChannelLabel(id);
    }

    function channelBadgeText(channel) {
        const fallback = defaultChannelLabel(channel).replace(/^Channel\s*/i, '').trim();
        const label = channelLabel(channel);
        if (label === defaultChannelLabel(channel)) return fallback || label.slice(0, 3);
        const words = label.match(/[A-Za-z0-9]+/g) || [];
        const compact = words.length > 1
            ? words.map((word) => word.charAt(0)).join('')
            : label.replace(/\s+/g, '');
        return (compact || label).slice(0, 4);
    }

    function saveChannelLabel(channel, value) {
        if (!CHANNELS.some((ch) => ch.id === channel)) return;
        const fallback = defaultChannelLabel(channel);
        const label = sanitizeChannelLabel(value, fallback);
        if (!state.channelLabels) state.channelLabels = {};
        if (label === fallback) delete state.channelLabels[channel];
        else state.channelLabels[channel] = label;
        updateChannelLabelUi();
    }

    function updateChannelLabelUi() {
        updateRgbVisibilityControl();
    }

    function hideWelcomeOverlays() {
        ['.welcome-screen', '.welcome-pointer'].forEach((selector) => {
            document.querySelectorAll(selector).forEach((node) => {
                try { node.remove(); } catch (_) { node.style.display = 'none'; }
            });
        });
    }

    function resetLocalRgbState() {
        CHANNELS.forEach((ch) => {
            state.channels[ch.id] = {
                color_map: ch.defaultMap,
                scaling_function: 'linear',
                invert_colormap: false,
                visible: true,
                hdu: null,
                hdu_name: null,
                show_hdu_controls: false,
                hdu_user_set: false
            };
        });
        state.tileInfo = null;
        state.version = Date.now();
        renderRgbVisibilityControl(false);
        setRgbModeActive(false);
    }

    /**
     * One shared in-flight clear per page load. Load-channel and similar calls await this so a late
     * /rgb/clear/ cannot wipe the compositor after the user has already loaded files (race).
     */
    function ensureRgbSessionClearedForPage(force) {
        if (force) window.__rgbSessionClearPromise = null;
        if (window.__rgbSessionClearPromise) return window.__rgbSessionClearPromise;
        window.__rgbSessionClearPromise = (async () => {
            resetLocalRgbState();
            try {
                await request('/rgb/clear/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: '{}'
                });
            } catch (_) { /* best effort: backend may not have a session yet */ }
        })();
        return window.__rgbSessionClearPromise;
    }

    function setRgbModeActive(active) {
        const stillRgb = !!(window.fitsData && window.fitsData.rgb_mode);
        const effectiveActive = !!active || stillRgb;
        window.__rgbModeActive = effectiveActive;
        const doc = document;
        const histogramButton = doc.getElementById('histogram-button');
        if (histogramButton) {
            histogramButton.disabled = !!effectiveActive;
            histogramButton.title = effectiveActive ? 'Use RGB controls while RGB mode is active' : 'Histogram';
            histogramButton.style.opacity = effectiveActive ? '0.45' : '';
            histogramButton.style.cursor = effectiveActive ? 'not-allowed' : '';
        }
        try {
            const popup = hostDocument().getElementById('dynamic-range-popup');
            if (popup && effectiveActive) popup.style.display = 'none';
        } catch (_) { /* noop */ }
        renderRgbVisibilityControl(effectiveActive);
        if (effectiveActive) {
            if (!window.__rgbUiEnforcer) {
                window.__rgbUiEnforcer = setInterval(() => {
                    if (!window.__rgbModeActive && !(window.fitsData && window.fitsData.rgb_mode)) return;
                    const d = document;
                    const btn = d.getElementById('histogram-button');
                    if (btn) {
                        btn.disabled = true;
                        btn.title = 'Use RGB controls while RGB mode is active';
                        btn.style.opacity = '0.45';
                        btn.style.cursor = 'not-allowed';
                    }
                    renderRgbVisibilityControl(true);
                }, 400);
            }
        } else if (window.__rgbUiEnforcer) {
            clearInterval(window.__rgbUiEnforcer);
            window.__rgbUiEnforcer = null;
        }
    }

    function installRgbModeGuards() {
        if (window.__rgbModeGuardsInstalled) return;
        window.__rgbModeGuardsInstalled = true;
        document.addEventListener('click', (event) => {
            const target = event.target && event.target.closest ? event.target.closest('#histogram-button, .dynamic-range-button') : null;
            if (!target || !window.__rgbModeActive) return;
            event.preventDefault();
            event.stopPropagation();
            notify('Use RGB Image controls for RGB mode.', 2200, 'info');
        }, true);
        if (typeof window.showDynamicRangePopup === 'function' && !window.__rgbOriginalShowDynamicRangePopup) {
            window.__rgbOriginalShowDynamicRangePopup = window.showDynamicRangePopup;
            window.showDynamicRangePopup = function (...args) {
                if (window.__rgbModeActive) {
                    notify('Use RGB Image controls for RGB mode.', 2200, 'info');
                    return;
                }
                return window.__rgbOriginalShowDynamicRangePopup.apply(this, args);
            };
        }
        if (typeof window.requestHistogramUpdate === 'function' && !window.__rgbOriginalRequestHistogramUpdate) {
            window.__rgbOriginalRequestHistogramUpdate = window.requestHistogramUpdate;
            window.requestHistogramUpdate = function (...args) {
                if (window.__rgbModeActive) return;
                return window.__rgbOriginalRequestHistogramUpdate.apply(this, args);
            };
        }
        window.addEventListener('fits:imageLoaded', () => {
            // Keep RGB UI active whenever current viewer content is RGB.
            setRgbModeActive(!!(window.fitsData && window.fitsData.rgb_mode));
        });
    }

    function getColorOptions() {
        if (typeof window.getColorMapOptions === 'function') {
            return window.getColorMapOptions().filter((option) => option && option.value !== 'grayscale');
        }
        return [
            { value: 'red', label: 'Red', gradient: 'linear-gradient(to right, #000, #f00)' },
            { value: 'green', label: 'Green', gradient: 'linear-gradient(to right, #000, #0f0)' },
            { value: 'blue', label: 'Blue', gradient: 'linear-gradient(to right, #000, #00f)' },
            { value: 'cyan', label: 'Cyan', gradient: 'linear-gradient(to right, #000, #0ff)' },
            { value: 'magenta', label: 'Magenta', gradient: 'linear-gradient(to right, #000, #f0f)' },
            { value: 'yellow', label: 'Yellow', gradient: 'linear-gradient(to right, #000, #ff0)' }
        ];
    }

    function hexToRgba(hex, alpha) {
        if (typeof hex !== 'string') return null;
        const h = hex.trim().replace('#', '');
        if (!(h.length === 3 || h.length === 6)) return null;
        const full = h.length === 3 ? `${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}` : h;
        const r = parseInt(full.slice(0, 2), 16);
        const g = parseInt(full.slice(2, 4), 16);
        const b = parseInt(full.slice(4, 6), 16);
        if (![r, g, b].every(Number.isFinite)) return null;
        const a = Number.isFinite(alpha) ? alpha : 0.78;
        return `rgba(${r},${g},${b},${a})`;
    }

    function parseColorToken(token, alpha) {
        if (!token || typeof token !== 'string') return null;
        const t = token.trim();
        if (!t) return null;
        if (t.startsWith('#')) return hexToRgba(t, alpha);
        const rgb = t.match(/^rgba?\(([^)]+)\)$/i);
        if (rgb) {
            const nums = rgb[1].split(',').map((n) => Number(n.trim()));
            if (nums.length >= 3 && nums.slice(0, 3).every(Number.isFinite)) {
                const a = Number.isFinite(alpha) ? alpha : (Number.isFinite(nums[3]) ? nums[3] : 0.78);
                return `rgba(${Math.max(0, Math.min(255, nums[0]))},${Math.max(0, Math.min(255, nums[1]))},${Math.max(0, Math.min(255, nums[2]))},${a})`;
            }
        }
        return null;
    }

    function splitGradientParts(value) {
        const parts = [];
        let depth = 0;
        let current = '';
        String(value || '').split('').forEach((ch) => {
            if (ch === '(') depth += 1;
            if (ch === ')') depth = Math.max(0, depth - 1);
            if (ch === ',' && depth === 0) {
                parts.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        });
        if (current.trim()) parts.push(current.trim());
        return parts;
    }

    function parseCssLinearGradient(gradient) {
        const text = String(gradient || '').trim();
        const match = text.match(/^linear-gradient\((.*)\)$/i);
        if (!match) return null;
        let parts = splitGradientParts(match[1]);
        if (!parts.length) return null;
        if (/^(to\s+|[-+]?\d*\.?\d+(deg|rad|turn)|[-+]?\d*\.?\d+grad)/i.test(parts[0])) {
            parts = parts.slice(1);
        }
        const stops = parts.map((part, index) => {
            const colorMatch = part.match(/^(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|[a-zA-Z]+)\s*(.*)$/);
            if (!colorMatch) return null;
            const offsetText = colorMatch[2].trim().split(/\s+/)[0] || '';
            const fallbackOffset = parts.length <= 1 ? 0 : (index / (parts.length - 1)) * 100;
            const parsedOffset = offsetText.endsWith('%') ? parseFloat(offsetText) : NaN;
            return {
                color: colorMatch[1],
                offset: `${Number.isFinite(parsedOffset) ? parsedOffset : fallbackOffset}%`
            };
        }).filter(Boolean);
        return stops.length ? stops : null;
    }

    function gradientForMap(mapName) {
        const options = getColorOptions();
        const opt = options.find((o) => o && String(o.value) === String(mapName));
        return opt && typeof opt.gradient === 'string' ? opt.gradient : null;
    }

    function fillForMap(doc, control, mapName, channelId) {
        const svg = control && control.querySelector ? control.querySelector('svg') : null;
        const gradient = gradientForMap(mapName);
        const stops = parseCssLinearGradient(gradient);
        if (!svg || !stops) return colorForMap(mapName, channelId) || colorForMap(channelId, channelId) || 'rgba(255,255,255,0.7)';

        let defs = svg.querySelector('defs');
        if (!defs) {
            defs = doc.createElementNS('http://www.w3.org/2000/svg', 'defs');
            svg.insertBefore(defs, svg.firstChild);
        }
        const gradientId = `rgb-channel-fill-${channelId}`;
        let node = defs.querySelector(`#${gradientId}`);
        if (!node) {
            node = doc.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
            node.setAttribute('id', gradientId);
            defs.appendChild(node);
        }
        node.setAttribute('x1', '0%');
        node.setAttribute('y1', '0%');
        node.setAttribute('x2', '100%');
        node.setAttribute('y2', '0%');
        node.innerHTML = '';
        stops.forEach((stop) => {
            const stopNode = doc.createElementNS('http://www.w3.org/2000/svg', 'stop');
            stopNode.setAttribute('offset', stop.offset);
            stopNode.setAttribute('stop-color', stop.color);
            node.appendChild(stopNode);
        });
        return `url(#${gradientId})`;
    }

    function colorForMap(mapName, channelId) {
        const fallbackByChannel = {
            r: 'rgba(255,0,0,0.78)',
            g: 'rgba(0,255,0,0.72)',
            b: 'rgba(0,44,255,0.78)',
            c4: 'rgba(255,235,0,0.78)',
            c5: 'rgba(255,0,255,0.74)'
        };
        const options = getColorOptions();
        const opt = options.find((o) => o && o.value === mapName);
        if (opt && typeof opt.gradient === 'string') {
            // Prefer the bright end color in "linear-gradient(..., #000, #f00)".
            const tail = opt.gradient.split(',').pop() || '';
            const parsedTail = parseColorToken(tail, 0.78);
            if (parsedTail) return parsedTail;
            const anyHex = opt.gradient.match(/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})/g);
            if (anyHex && anyHex.length) {
                const parsedHex = parseColorToken(anyHex[anyHex.length - 1], 0.78);
                if (parsedHex) return parsedHex;
            }
        }
        const named = {
            red: 'rgba(255,0,0,0.78)',
            green: 'rgba(0,255,0,0.72)',
            blue: 'rgba(0,44,255,0.78)',
            cyan: 'rgba(0,255,255,0.78)',
            magenta: 'rgba(255,0,255,0.74)',
            yellow: 'rgba(255,235,0,0.78)',
            orange: 'rgba(255,140,0,0.78)',
            purple: 'rgba(180,80,255,0.78)'
        };
        const namedColor = named[String(mapName || '').toLowerCase()];
        if (namedColor) return namedColor;
        return fallbackByChannel[String(channelId || '').toLowerCase()] || null;
    }

    function styleButton(button, bg) {
        Object.assign(button.style, {
            padding: '8px 10px',
            backgroundColor: bg || '#444',
            color: '#fff',
            border: 'none',
            borderRadius: '3px',
            cursor: 'pointer',
            fontFamily: 'Arial, sans-serif',
            fontSize: '13px',
            fontWeight: 'normal'
        });
        button.addEventListener('mouseover', () => { button.style.backgroundColor = bg === '#007bff' ? '#0056b3' : '#555'; });
        button.addEventListener('mouseout', () => { button.style.backgroundColor = bg || '#444'; });
    }

    function enableRgbPopupDrag(popup, handle, doc) {
        if (!popup || !handle) return;
        let pointerId = null;
        let startX = 0;
        let startY = 0;
        let originLeft = 0;
        let originTop = 0;
        const resetTransform = () => {
            if (popup.style.transform && popup.style.transform !== 'none') {
                const rect = popup.getBoundingClientRect();
                popup.style.left = `${rect.left}px`;
                popup.style.top = `${rect.top}px`;
                popup.style.transform = 'none';
            }
        };
        const onPointerMove = (event) => {
            if (pointerId === null || event.pointerId !== pointerId) return;
            event.preventDefault();
            popup.style.left = `${originLeft + event.clientX - startX}px`;
            popup.style.top = `${originTop + event.clientY - startY}px`;
        };
        const endDrag = (event) => {
            if (pointerId === null || event.pointerId !== pointerId) return;
            pointerId = null;
            try { handle.releasePointerCapture(event.pointerId); } catch (_) { /* noop */ }
            doc.removeEventListener('pointermove', onPointerMove, true);
            doc.removeEventListener('pointerup', endDrag, true);
            doc.removeEventListener('pointercancel', endDrag, true);
            handle.style.cursor = 'grab';
        };
        handle.addEventListener('pointerdown', (event) => {
            if (typeof event.button === 'number' && event.button !== 0) return;
            resetTransform();
            const rect = popup.getBoundingClientRect();
            pointerId = event.pointerId;
            startX = event.clientX;
            startY = event.clientY;
            originLeft = rect.left;
            originTop = rect.top;
            handle.style.cursor = 'grabbing';
            try { handle.setPointerCapture(event.pointerId); } catch (_) { /* noop */ }
            doc.addEventListener('pointermove', onPointerMove, true);
            doc.addEventListener('pointerup', endDrag, true);
            doc.addEventListener('pointercancel', endDrag, true);
        });
    }

    function simpleSelect(labelText, id, options, value, onChange) {
        if (typeof window.createSearchableDropdown === 'function') {
            const hasSwatches = options.some((option) => option && option.gradient);
            const wrap = window.createSearchableDropdown(labelText, id, options, `rgb_${id}`, value, hasSwatches);
            const select = wrap.querySelector('select');
            if (select) {
                select.value = value;
                select.addEventListener('change', () => onChange(select.value));
            }
            return wrap;
        }
        const wrap = document.createElement('div');
        wrap.style.display = 'flex';
        wrap.style.flexDirection = 'column';
        const label = document.createElement('label');
        label.textContent = labelText;
        Object.assign(label.style, { color: '#aaa', fontSize: '14px', marginBottom: '5px' });
        const select = document.createElement('select');
        select.id = id;
        options.forEach((opt) => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            select.appendChild(option);
        });
        select.value = value;
        select.addEventListener('change', () => onChange(select.value));
        wrap.appendChild(label);
        wrap.appendChild(select);
        return wrap;
    }

    function readInputs(channel) {
        const doc = hostDocument();
        const prefix = `rgb-${channel}`;
        const minInput = doc.getElementById(`${prefix}-min`);
        const maxInput = doc.getElementById(`${prefix}-max`);
        const colorSelect = doc.getElementById(`${prefix}-color`);
        const scalingSelect = doc.getElementById(`${prefix}-scaling`);
        const invert = doc.getElementById(`${prefix}-invert`);
        const minValue = parseFloat(minInput && minInput.value);
        const maxValue = parseFloat(maxInput && maxInput.value);
        return {
            channel,
            min_value: Number.isFinite(minValue) ? minValue : undefined,
            max_value: Number.isFinite(maxValue) ? maxValue : undefined,
            color_map: colorSelect ? colorSelect.value : state.channels[channel].color_map,
            scaling_function: scalingSelect ? scalingSelect.value : state.channels[channel].scaling_function,
            invert_colormap: invert ? !!invert.checked : !!state.channels[channel].invert_colormap
        };
    }

    function readRequestedHdu(channel) {
        const doc = hostDocument();
        const select = doc.getElementById(`rgb-${channel}-hdu`);
        if (!select) return undefined;
        const raw = String(select.value == null ? '' : select.value).trim();
        if (!raw) return undefined;
        const hdu = Number(raw);
        if (!Number.isFinite(hdu)) return undefined;
        return Math.max(0, Math.floor(hdu));
    }

    async function fetchHduOptions(filepath) {
        if (!filepath) return [];
        const resp = await request(`/fits-hdu-info/${encodeURIComponent(filepath)}`);
        if (!resp.ok) throw new Error(await responseText(resp));
        const data = await resp.json();
        const list = Array.isArray(data && data.hduList) ? data.hduList : [];
        return list.map((item) => {
            const idx = Number(item && item.index);
            const name = String((item && item.name) || `HDU ${idx}`);
            const type = String((item && item.type) || '');
            const label = type ? `${idx} - ${name} (${type})` : `${idx} - ${name}`;
            return { value: String(idx), label };
        });
    }

    function setHduSelectValue(channel, hduValue) {
        const doc = hostDocument();
        const select = doc.getElementById(`rgb-${channel}-hdu`);
        if (!select) return;
        const val = Number.isFinite(Number(hduValue)) ? String(Number(hduValue)) : '';
        if (val && !Array.from(select.options || []).some((opt) => opt.value === val)) {
            const fallback = doc.createElement('option');
            fallback.value = val;
            fallback.textContent = `${val} - HDU ${val}`;
            select.appendChild(fallback);
        }
        select.value = val;
    }

    async function ensureHduSelectOptions(channel, filepath, selectedHdu) {
        const doc = hostDocument();
        const select = doc.getElementById(`rgb-${channel}-hdu`);
        if (!select || !filepath) return;
        try {
            const list = await fetchHduOptions(filepath);
            const prev = String(select.value == null ? '' : select.value).trim();
            select.innerHTML = '';
            const auto = doc.createElement('option');
            auto.value = '';
            auto.textContent = 'Auto (first image HDU)';
            select.appendChild(auto);
            list.forEach((entry) => {
                const opt = doc.createElement('option');
                opt.value = entry.value;
                opt.textContent = entry.label;
                select.appendChild(opt);
            });
            if (Number.isFinite(Number(selectedHdu))) setHduSelectValue(channel, selectedHdu);
            else if (prev && Array.from(select.options).some((opt) => opt.value === prev)) select.value = prev;
            else select.value = '';
        } catch (_) {
            // Keep existing choices if HDU metadata fetch fails.
        }
    }

    async function setChannelFile(channel, filepath, options) {
        const requestId = (state.channels[channel] && state.channels[channel].setRequestId ? state.channels[channel].setRequestId : 0) + 1;
        state.channels[channel] = Object.assign({}, state.channels[channel], { setRequestId: requestId });
        let loadingNoticeVisible = false;
        try {
            notify(true, `Loading ${channel.toUpperCase()} channel...`);
            loadingNoticeVisible = true;
            const channelState = state.channels[channel] || {};
            const useAutoHdu = !!(options && options.preferAutoHdu && !channelState.hdu_user_set);
            await ensureHduSelectOptions(channel, filepath, undefined);
            const requestedHdu = useAutoHdu ? undefined : readRequestedHdu(channel);
            const postSetChannel = async (hduOverride) => {
                const payload = {
                    channel,
                    filepath,
                    color_map: state.channels[channel].color_map,
                    scaling_function: state.channels[channel].scaling_function,
                    replace_incompatible: true
                };
                if (Number.isFinite(hduOverride)) payload.hdu = hduOverride;
                return request('/rgb/set-channel/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            };

            let resp = await postSetChannel(requestedHdu);
            if (!resp.ok) {
                let detail = await responseText(resp);
                const noExplicitHdu = !Number.isFinite(requestedHdu);
                const implicitOrZeroHdu = noExplicitHdu || Number(requestedHdu) === 0;
                const hdu0NotImage = /HDU\s*0\s*is\s*not\s*an\s*image\s*HDU/i.test(detail || '');
                if (implicitOrZeroHdu && hdu0NotImage) {
                    // Auto-try HDU 1 when HDU wasn't explicitly set, or when stale/default 0 was used.
                    const doc = hostDocument();
                    setHduSelectValue(channel, 1);
                    state.channels[channel] = Object.assign({}, state.channels[channel], { show_hdu_controls: true });
                    refreshPanelValues(channel);
                    resp = await postSetChannel(1);
                    if (!resp.ok) detail = await responseText(resp);
                }
                if (!resp.ok) throw new Error(detail);
            }
            const info = await resp.json();
            if (!state.channels[channel] || state.channels[channel].setRequestId !== requestId) return;
            state.channels[channel] = Object.assign({}, state.channels[channel], {
                show_hdu_controls: false,
                hdu_user_set: false
            });
            syncStateFromInfo(info);
            const meta = info && info.channels ? info.channels[channel] : null;
            await ensureHduSelectOptions(channel, filepath, meta && meta.hdu);
            CHANNELS.forEach((ch) => refreshPanelValues(ch.id));
            openRgbTiles(info, { preserveView: false });
            refreshChannelHistogram(channel).catch(() => {});
            if (state.channels[channel] && state.channels[channel].started_new_rgb) {
                notify('Started a new RGB image because the selected file size differed from existing channels.', 3000, 'info');
            }
            if (loadingNoticeVisible) {
                notify(false);
                loadingNoticeVisible = false;
            }
            notify(`${channel.toUpperCase()} channel loaded.`, 1400, 'success');
        } catch (err) {
            if (!state.channels[channel] || state.channels[channel].setRequestId !== requestId) return;
            console.error('[rgb] load channel failed', err);
            if (loadingNoticeVisible) {
                notify(false);
                loadingNoticeVisible = false;
            }
            const msg = String((err && err.message) || '');
            if (/HDU\s+\d+\s+is\s+not\s+an\s+image\s+HDU/i.test(msg)) {
                state.channels[channel] = Object.assign({}, state.channels[channel], { show_hdu_controls: true });
                const doc = hostDocument();
                const hduSelect = doc.getElementById(`rgb-${channel}-hdu`);
                if (hduSelect && !String(hduSelect.value || '').trim()) setHduSelectValue(channel, 1);
                refreshPanelValues(channel);
            }
            notify(err.message || 'Failed to load RGB channel.', 4000, 'error');
            throw err;
        } finally {
            if (loadingNoticeVisible) notify(false);
        }
    }

    function syncStateFromInfo(info) {
        if (!info || !info.channels) return;
        if (info.session_id) {
            try { sessionStorage.setItem('sid', info.session_id); } catch (_) { /* noop */ }
            try { window.__nelouraSid = info.session_id; } catch (_) { /* noop */ }
        }
        CHANNELS.forEach((ch) => {
            const meta = info.channels[ch.id] || {};
            state.channels[ch.id] = Object.assign({}, state.channels[ch.id], meta);
            if (state.channels[ch.id].visible === undefined) state.channels[ch.id].visible = true;
        });
        state.tileInfo = info;
        updateRgbVisibilityControl();
    }

    function channelUnit(channel) {
        const data = state.channels[channel] || {};
        const unit = data.bunit || (state.tileInfo && state.tileInfo.bunit) || '';
        return typeof unit === 'string' ? unit.trim() : '';
    }

    function updateTabVisibility() {
        const doc = hostDocument();
        CHANNELS.forEach((ch) => {
            const active = ch.id === state.active;
            const tab = doc.getElementById(`rgb-tab-${ch.id}`);
            const panel = doc.getElementById(`rgb-panel-${ch.id}`);
            if (tab) {
                tab.style.backgroundColor = active ? '#007bff' : '#444';
                tab.style.color = '#fff';
            }
            if (panel) panel.style.display = active ? 'block' : 'none';
        });
    }

    function updateRgbVisibilityControl() {
        const doc = hostDocument();
        const control = doc.getElementById('rgb-channel-visibility-toggle');
        if (!control) return;
        CHANNELS.forEach((ch) => {
            const group = control.querySelector(`[data-channel="${ch.id}"]`);
            const data = state.channels[ch.id] || {};
            const loaded = !!data.loaded;
            const visible = data.visible !== false;
            if (!group) return;
            group.style.display = loaded ? '' : 'none';
            group.style.opacity = visible ? '1' : '0.28';
            group.style.cursor = 'pointer';
            group.style.pointerEvents = loaded ? 'all' : 'none';
            group.setAttribute('aria-pressed', visible ? 'true' : 'false');
            const fileLabel = data.filepath ? data.filepath.split('/').pop() : 'No file loaded';
            const tooltip = `${ch.label}: ${fileLabel}`;
            // Use ONLY our JS tooltip (native SVG/HTML tooltips are delayed + inconsistent).
            group.removeAttribute('title');
            group.setAttribute('aria-label', tooltip);
            let titleNode = group.querySelector('title');
            if (!titleNode) {
                titleNode = doc.createElementNS('http://www.w3.org/2000/svg', 'title');
                group.insertBefore(titleNode, group.firstChild);
            }
            // Keep the <title> node empty to avoid native tooltips in browsers that still use it.
            titleNode.textContent = '';
            const circle = group.querySelector('.rgb-channel-circle');
            if (circle) {
                circle.removeAttribute('title');
                const select = doc.getElementById(`rgb-${ch.id}-color`);
                const effectiveMap = (select && select.value) ? select.value : (data.color_map || ch.defaultMap);
                const fill = fillForMap(doc, control, effectiveMap, ch.id);
                circle.setAttribute('fill', fill);
                circle.setAttribute('stroke', visible ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.35)');
                circle.setAttribute('stroke-width', visible ? '1.4' : '2.2');
                circle.setAttribute('stroke-dasharray', visible ? '' : '4 3');
            }
            const text = group.querySelector('text');
            if (text) {
                const badge = channelBadgeText(ch);
                text.removeAttribute('title');
                text.textContent = badge;
                text.setAttribute('font-size', badge.length > 3 ? '8' : (badge.length > 2 ? '9' : '11'));
            }

            // Also keep a JS-tooltip copy for instant hover (no native delay).
            group.dataset.tooltip = tooltip;
        });
        const activeNames = CHANNELS
            .filter((ch) => (state.channels[ch.id] || {}).loaded && (state.channels[ch.id] || {}).visible !== false)
            .map((ch) => ch.label);
        control.title = activeNames.length ? `Visible RGB channels: ${activeNames.join(', ')}` : 'All RGB channels are hidden';
        updateRgbChannelNameEditorState();
    }

    function ensureRgbVisibilityTooltip() {
        const doc = hostDocument();
        let tooltip = doc.getElementById('rgb-channel-visibility-tooltip');
        if (tooltip) return tooltip;
        tooltip = doc.createElement('div');
        tooltip.id = 'rgb-channel-visibility-tooltip';
        tooltip.setAttribute('role', 'tooltip');
        Object.assign(tooltip.style, {
            position: 'fixed',
            left: '0px',
            top: '0px',
            transform: 'translate(-9999px, -9999px)',
            opacity: '0',
            pointerEvents: 'none',
            zIndex: '60000',
            padding: '6px 8px',
            borderRadius: '8px',
            background: 'rgba(0,0,0,0.86)',
            border: '1px solid rgba(255,255,255,0.18)',
            color: '#fff',
            fontFamily: 'Arial, sans-serif',
            fontSize: '12px',
            lineHeight: '1.2',
            whiteSpace: 'nowrap',
            boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
            transition: 'opacity 0.06s ease-out'
        });
        doc.body.appendChild(tooltip);
        return tooltip;
    }

    function showRgbVisibilityTooltip(text, clientX, clientY) {
        const tooltip = ensureRgbVisibilityTooltip();
        tooltip.textContent = String(text || '');
        const offset = 12;
        const margin = 8;
        const win = rootWindow();

        // First place it near cursor, then clamp to viewport using measured size.
        tooltip.style.transform = `translate(${Math.round(clientX + offset)}px, ${Math.round(clientY + offset)}px)`;
        tooltip.style.opacity = '1';

        const rect = tooltip.getBoundingClientRect();
        const vw = (win && Number.isFinite(win.innerWidth)) ? win.innerWidth : window.innerWidth;
        const vh = (win && Number.isFinite(win.innerHeight)) ? win.innerHeight : window.innerHeight;

        let x = clientX + offset;
        let y = clientY + offset;
        if (x + rect.width + margin > vw) x = Math.max(margin, clientX - offset - rect.width);
        if (y + rect.height + margin > vh) y = Math.max(margin, clientY - offset - rect.height);
        if (x < margin) x = margin;
        if (y < margin) y = margin;
        tooltip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
        tooltip.style.opacity = '1';
    }

    function hideRgbVisibilityTooltip() {
        const doc = hostDocument();
        const tooltip = doc.getElementById('rgb-channel-visibility-tooltip');
        if (!tooltip) return;
        tooltip.style.opacity = '0';
        tooltip.style.transform = 'translate(-9999px, -9999px)';
    }

    function ensureRgbChannelNameEditor() {
        const doc = hostDocument();
        let editor = doc.getElementById('rgb-channel-name-editor');
        if (editor) return editor;

        editor = doc.createElement('div');
        editor.id = 'rgb-channel-name-editor';
        editor.className = 'mp-interactive';
        Object.assign(editor.style, {
            position: 'fixed',
            transform: 'translate(-9999px, -9999px)',
            width: '180px',
            padding: '8px',
            borderRadius: '10px',
            background: 'rgba(24,24,24,0.96)',
            border: '1px solid rgba(255,255,255,0.18)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
            color: '#fff',
            fontFamily: 'Arial, sans-serif',
            fontSize: '12px',
            zIndex: '3510',
            display: 'none',
            boxSizing: 'border-box'
        });

        const label = doc.createElement('label');
        label.textContent = 'Channel name';
        label.setAttribute('for', 'rgb-channel-name-input');
        Object.assign(label.style, { display: 'block', marginBottom: '5px', color: '#ccc' });

        const input = doc.createElement('input');
        input.id = 'rgb-channel-name-input';
        input.type = 'text';
        input.maxLength = 32;
        Object.assign(input.style, {
            width: '100%',
            boxSizing: 'border-box',
            background: '#2b2b2b',
            color: '#fff',
            border: '1px solid #555',
            borderRadius: '6px',
            padding: '6px 7px',
            fontSize: '12px',
            outline: 'none'
        });

        const row = doc.createElement('label');
        Object.assign(row.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginTop: '7px',
            color: '#ddd',
            cursor: 'pointer',
            userSelect: 'none'
        });
        const visible = doc.createElement('input');
        visible.id = 'rgb-channel-name-visible';
        visible.type = 'checkbox';
        visible.style.margin = '0';
        row.appendChild(visible);
        row.appendChild(doc.createTextNode('Visible'));

        const hint = doc.createElement('div');
        hint.textContent = 'Enter saves, Esc closes';
        Object.assign(hint.style, { marginTop: '6px', color: '#888', fontSize: '11px' });

        input.addEventListener('input', () => saveChannelLabel(editor.dataset.channel, input.value));
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                saveChannelLabel(editor.dataset.channel, input.value);
                hideRgbChannelNameEditor();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                hideRgbChannelNameEditor();
            }
        });
        visible.addEventListener('change', () => {
            const channel = editor.dataset.channel;
            const data = state.channels[channel] || {};
            if (!data.loaded || visible.checked === (data.visible !== false)) return;
            toggleRgbChannelVisibility(channel);
        });
        editor.addEventListener('pointerdown', (event) => event.stopPropagation());

        editor.appendChild(label);
        editor.appendChild(input);
        editor.appendChild(row);
        editor.appendChild(hint);
        doc.body.appendChild(editor);
        return editor;
    }

    function updateRgbChannelNameEditorState() {
        const doc = hostDocument();
        const editor = doc.getElementById('rgb-channel-name-editor');
        if (!editor || editor.style.display === 'none') return;
        const channel = editor.dataset.channel;
        const input = doc.getElementById('rgb-channel-name-input');
        const visible = doc.getElementById('rgb-channel-name-visible');
        if (input && doc.activeElement !== input) input.value = channelLabel(channel);
        if (visible) visible.checked = (state.channels[channel] || {}).visible !== false;
    }

    function hideRgbChannelNameEditor() {
        const doc = hostDocument();
        const editor = doc.getElementById('rgb-channel-name-editor');
        if (!editor) return;
        editor.style.display = 'none';
        editor.style.transform = 'translate(-9999px, -9999px)';
    }

    function showRgbChannelNameEditor(channel, anchor) {
        if (!CHANNELS.some((ch) => ch.id === channel)) return;
        const editor = ensureRgbChannelNameEditor();
        const doc = hostDocument();
        const input = doc.getElementById('rgb-channel-name-input');
        const visible = doc.getElementById('rgb-channel-name-visible');
        const rect = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : null;
        const win = rootWindow();
        const vw = (win && Number.isFinite(win.innerWidth)) ? win.innerWidth : window.innerWidth;
        const vh = (win && Number.isFinite(win.innerHeight)) ? win.innerHeight : window.innerHeight;
        const x = rect ? Math.min(Math.max(8, rect.left - 58), Math.max(8, vw - 188)) : 8;
        const y = rect ? Math.min(Math.max(8, rect.top - 108), Math.max(8, vh - 116)) : 8;

        editor.dataset.channel = channel;
        if (input) input.value = channelLabel(channel);
        if (visible) visible.checked = (state.channels[channel] || {}).visible !== false;
        editor.style.display = 'block';
        editor.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
        hideRgbVisibilityTooltip();
        if (input) {
            input.focus();
            input.select();
        }
    }

    function renderRgbVisibilityControl(show) {
        const doc = hostDocument();
        let control = doc.getElementById('rgb-channel-visibility-toggle');
        if (!show) {
            if (control) control.style.display = 'none';
            hideRgbVisibilityTooltip();
            hideRgbChannelNameEditor();
            return;
        }
        if (!control) {
            control = doc.createElement('button');
            control.id = 'rgb-channel-visibility-toggle';
            control.className = 'mp-interactive';
            control.type = 'button';
            control.setAttribute('aria-label', 'Show or hide RGB channels');
            Object.assign(control.style, {
                position: 'fixed',
                right: '297px',
                bottom: '14px',
                width: '64px',
                height: '64px',
                background: 'transparent',
                color: '#fff',
                border: 'none',
                boxShadow: 'none',
                cursor: 'default',
                zIndex: '3500',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0',
                outline: 'none',
                transition: 'background 0.2s ease, opacity 0.2s ease, transform 0.12s ease'
            });
            control.innerHTML = `
                <svg width="56" height="56" viewBox="0 0 64 64" role="img" aria-hidden="true">
                    <style>
                        #rgb-channel-visibility-toggle [data-channel]:focus { outline: none; }
                        #rgb-channel-visibility-toggle .rgb-focus-ring { opacity: 0; }
                        #rgb-channel-visibility-toggle [data-channel]:focus .rgb-focus-ring,
                        #rgb-channel-visibility-toggle [data-channel]:focus-visible .rgb-focus-ring {
                            opacity: 1;
                        }
                    </style>
                    <g data-channel="r" role="button" tabindex="0">
                        <title></title>
                        <circle class="rgb-channel-circle" cx="32" cy="18" r="13" fill="rgba(255,0,0,0.78)"></circle>
                        <circle class="rgb-focus-ring" cx="32" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.95)" stroke-width="2"></circle>
                        <text x="32" y="22" text-anchor="middle" fill="#fff" font-size="11" font-family="Arial, sans-serif" font-weight="700">1</text>
                    </g>
                    <g data-channel="g" role="button" tabindex="0">
                        <title></title>
                        <circle class="rgb-channel-circle" cx="45" cy="29" r="13" fill="rgba(0,255,0,0.72)"></circle>
                        <circle class="rgb-focus-ring" cx="45" cy="29" r="15" fill="none" stroke="rgba(255,255,255,0.95)" stroke-width="2"></circle>
                        <text x="45" y="33" text-anchor="middle" fill="#03220a" font-size="11" font-family="Arial, sans-serif" font-weight="700">2</text>
                    </g>
                    <g data-channel="b" role="button" tabindex="0">
                        <title></title>
                        <circle class="rgb-channel-circle" cx="40" cy="45" r="13" fill="rgba(0,44,255,0.78)"></circle>
                        <circle class="rgb-focus-ring" cx="40" cy="45" r="15" fill="none" stroke="rgba(255,255,255,0.95)" stroke-width="2"></circle>
                        <text x="40" y="49" text-anchor="middle" fill="#fff" font-size="11" font-family="Arial, sans-serif" font-weight="700">3</text>
                    </g>
                    <g data-channel="c4" role="button" tabindex="0">
                        <title></title>
                        <circle class="rgb-channel-circle" cx="24" cy="45" r="13" fill="rgba(255,235,0,0.78)"></circle>
                        <circle class="rgb-focus-ring" cx="24" cy="45" r="15" fill="none" stroke="rgba(255,255,255,0.95)" stroke-width="2"></circle>
                        <text x="24" y="49" text-anchor="middle" fill="#2a2200" font-size="11" font-family="Arial, sans-serif" font-weight="700">4</text>
                    </g>
                    <g data-channel="c5" role="button" tabindex="0">
                        <title></title>
                        <circle class="rgb-channel-circle" cx="19" cy="29" r="13" fill="rgba(255,0,255,0.74)"></circle>
                        <circle class="rgb-focus-ring" cx="19" cy="29" r="15" fill="none" stroke="rgba(255,255,255,0.95)" stroke-width="2"></circle>
                        <text x="19" y="33" text-anchor="middle" fill="#fff" font-size="11" font-family="Arial, sans-serif" font-weight="700">5</text>
                    </g>
                </svg>
            `;
            control.addEventListener('click', (event) => {
                const target = event.target && event.target.closest ? event.target.closest('[data-channel]') : null;
                if (!target) return;
                event.preventDefault();
                showRgbChannelNameEditor(target.getAttribute('data-channel'), target);
            });
            control.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                const target = event.target && event.target.closest ? event.target.closest('[data-channel]') : null;
                if (!target) return;
                event.preventDefault();
                showRgbChannelNameEditor(target.getAttribute('data-channel'), target);
            });

            // Instant hover tooltip (no native delay).
            control.addEventListener('pointermove', (event) => {
                const target = event.target && event.target.closest ? event.target.closest('[data-channel]') : null;
                if (!target) {
                    hideRgbVisibilityTooltip();
                    return;
                }
                const label = target.dataset.tooltip || target.getAttribute('aria-label') || target.getAttribute('title') || '';
                if (!label) {
                    hideRgbVisibilityTooltip();
                    return;
                }
                showRgbVisibilityTooltip(label, event.clientX, event.clientY);
            });
            control.addEventListener('pointerleave', () => hideRgbVisibilityTooltip());
            control.addEventListener('blur', () => hideRgbVisibilityTooltip(), true);
            const closeNameEditorOnOutsideEvent = (event) => {
                const editor = doc.getElementById('rgb-channel-name-editor');
                if (!editor || editor.style.display === 'none') return;
                const path = event.composedPath ? event.composedPath() : [];
                if (editor.contains(event.target) || path.includes(editor)) return;
                hideRgbChannelNameEditor();
            };
            [doc, document].forEach((targetDoc, idx, docs) => {
                if (!targetDoc || docs.indexOf(targetDoc) !== idx) return;
                targetDoc.addEventListener('pointerdown', closeNameEditorOnOutsideEvent, true);
                targetDoc.addEventListener('mousedown', closeNameEditorOnOutsideEvent, true);
                targetDoc.addEventListener('touchstart', closeNameEditorOnOutsideEvent, true);
            });
            doc.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') hideRgbChannelNameEditor();
            });

            doc.body.appendChild(control);
        }
        control.style.display = 'flex';
        updateRgbVisibilityControl();
    }

    async function toggleRgbChannelVisibility(channel) {
        if (!CHANNELS.some((ch) => ch.id === channel)) return;
        const data = state.channels[channel] || {};
        if (!data.loaded) {
            notify(`Load a ${channel.toUpperCase()} channel before toggling it.`, 1800, 'info');
            return;
        }
        const nextVisible = data.visible === false;
        state.channels[channel].visible = nextVisible;
        updateRgbVisibilityControl();
        try {
            const resp = await request('/rgb/update-channel/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channel, visible: nextVisible })
            });
            if (!resp.ok) throw new Error(await responseText(resp));
            const info = await resp.json();
            syncStateFromInfo(info);
            openRgbTiles(info, { preserveView: true });
        } catch (err) {
            state.channels[channel].visible = !nextVisible;
            updateRgbVisibilityControl();
            notify(err.message || `Failed to update ${channel.toUpperCase()} visibility.`, 3000, 'error');
        }
    }

    async function updateChannel(channel, refreshViewer) {
        const payload = readInputs(channel);
        // Keep channel badge color in sync immediately with popup selection.
        state.channels[channel] = Object.assign({}, state.channels[channel], {
            color_map: payload.color_map,
            scaling_function: payload.scaling_function,
            invert_colormap: payload.invert_colormap
        });
        updateRgbVisibilityControl();
        const resp = await request('/rgb/update-channel/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!resp.ok) throw new Error(await responseText(resp));
        const info = await resp.json();
        syncStateFromInfo(info);
        if (refreshViewer) openRgbTiles(info, { preserveView: true });
        refreshChannelHistogram(channel).catch(() => {});
    }

    async function responseText(resp) {
        try {
            const json = await resp.json();
            return json.detail || json.error || resp.statusText;
        } catch (_) {
            return resp.statusText;
        }
    }

    async function applyPercentile(channel, percentile) {
        const resp = await request('/rgb/channel-percentile/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel, percentile })
        });
        if (!resp.ok) throw new Error(await responseText(resp));
        const values = await resp.json();
        const doc = hostDocument();
        const minInput = doc.getElementById(`rgb-${channel}-min`);
        const maxInput = doc.getElementById(`rgb-${channel}-max`);
        if (minInput) minInput.value = formatValue(values.min_value);
        if (maxInput) maxInput.value = formatValue(values.max_value);
        await updateChannel(channel, true);
    }

    function formatValue(value) {
        if (!Number.isFinite(Number(value))) return '';
        if (typeof window.formatRangeValue === 'function') return window.formatRangeValue(Number(value));
        return Number(value).toPrecision(6);
    }

    function drawChannelHistogram(channel, hist) {
        const doc = hostDocument();
        const bgCanvas = doc.getElementById(`rgb-${channel}-histogram-bg`);
        const linesCanvas = doc.getElementById(`rgb-${channel}-histogram-lines`);
        if (!bgCanvas || !linesCanvas || !hist || !Array.isArray(hist.counts)) return;
        const ctx = bgCanvas.getContext('2d');
        const width = bgCanvas.width;
        const height = bgCanvas.height;
        ctx.clearRect(0, 0, width, height);
        const counts = hist.counts;
        if (!counts.length) {
            const lctx = linesCanvas.getContext('2d');
            lctx.clearRect(0, 0, linesCanvas.width, linesCanvas.height);
            if (state.channels[channel]) state.channels[channel].histogramScaleInfo = null;
            ctx.fillStyle = '#aaa';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Load an image to show histogram', width / 2, height / 2);
            ctx.textBaseline = 'alphabetic';
            return;
        }

        const minInput = doc.getElementById(`rgb-${channel}-min`);
        const maxInput = doc.getElementById(`rgb-${channel}-max`);
        const uiMin = minInput ? parseFloat(minInput.value) : hist.data_min;
        const uiMax = maxInput ? parseFloat(maxInput.value) : hist.data_max;
        const dataMin = Number.isFinite(uiMin) ? uiMin : Number(hist.data_min || 0);
        const dataMax = Number.isFinite(uiMax) && uiMax > dataMin ? uiMax : Number(hist.data_max || dataMin + 1);
        const dataRange = Math.max(1e-12, dataMax - dataMin);

        const maxCount = Math.max(1, ...counts);
        const logMaxCount = Math.log(maxCount + 1);
        const padding = { top: 30, right: 20, bottom: 40, left: 60 };
        const histWidth = width - padding.left - padding.right;
        const histHeight = height - padding.top - padding.bottom;

        ctx.fillStyle = 'rgb(0, 180, 0)';
        const barWidth = histWidth / counts.length;
        counts.forEach((count, index) => {
            if (!count) return;
            const barHeight = Math.log(count + 1) / logMaxCount * histHeight;
            const x = padding.left + index * barWidth;
            const y = height - padding.bottom - barHeight;
            ctx.fillRect(x, y, Math.max(1, barWidth - 1), barHeight);
        });

        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding.left, padding.top);
        ctx.lineTo(padding.left, height - padding.bottom);
        ctx.lineTo(width - padding.right, height - padding.bottom);
        ctx.stroke();
        ctx.fillStyle = '#aaa';
        ctx.font = '11px Arial';
        ctx.textAlign = 'center';
        const numXTicks = 5;
        for (let i = 0; i <= numXTicks; i++) {
            const x = padding.left + (i / numXTicks) * histWidth;
            const value = dataMin + (i / numXTicks) * dataRange;
            ctx.beginPath();
            ctx.moveTo(x, height - padding.bottom);
            ctx.lineTo(x, height - padding.bottom + 5);
            ctx.stroke();
            ctx.fillText(Number(value).toFixed(2), x, height - padding.bottom + 20);
        }
        ctx.save();
        ctx.translate(15, height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Pixel Count (log)', 0, 0);
        ctx.restore();
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(channelUnit(channel) || 'Value', width / 2, height - 5);

        state.channels[channel].histogramScaleInfo = { padding, histWidth, dataMin, dataRange, canvasWidth: width, canvasHeight: height };
        drawChannelHistogramLines(channel, dataMin, dataMax);
    }

    function drawChannelHistogramLines(channel, minValue, maxValue) {
        const doc = hostDocument();
        const canvas = doc.getElementById(`rgb-${channel}-histogram-lines`);
        if (!canvas) return;
        const scale = state.channels[channel] && state.channels[channel].histogramScaleInfo;
        if (!scale || !scale.padding || !Number.isFinite(scale.dataRange) || scale.dataRange <= 0) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const valueToX = (value) => {
            const clamped = Math.max(scale.dataMin, Math.min(scale.dataMin + scale.dataRange, value));
            return scale.padding.left + ((clamped - scale.dataMin) / scale.dataRange) * scale.histWidth;
        };
        const minX = valueToX(minValue);
        const maxX = valueToX(maxValue);
        ctx.lineWidth = 2;
        if (Number.isFinite(minX)) {
            ctx.strokeStyle = 'rgba(50, 150, 255, 0.9)';
            ctx.beginPath();
            ctx.moveTo(minX, scale.padding.top);
            ctx.lineTo(minX, canvas.height - scale.padding.bottom);
            ctx.stroke();
        }
        if (Number.isFinite(maxX)) {
            ctx.strokeStyle = 'rgba(255, 80, 80, 0.9)';
            ctx.beginPath();
            ctx.moveTo(maxX, scale.padding.top);
            ctx.lineTo(maxX, canvas.height - scale.padding.bottom);
            ctx.stroke();
        }
    }

    async function refreshChannelHistogram(channel) {
        const payload = readInputs(channel);
        const resp = await request('/rgb/channel-histogram/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                channel,
                bins: 256,
                min_val: payload.min_value,
                max_val: payload.max_value
            })
        });
        if (!resp.ok) return;
        drawChannelHistogram(channel, await resp.json());
    }

    function attachRgbHistogramInteraction(canvas, channel) {
        if (!canvas || canvas._rgbHistogramInteractionAttached) return;
        canvas._rgbHistogramInteractionAttached = true;
        let dragging = null;
        const valueFromEvent = (event) => {
            const scale = state.channels[channel] && state.channels[channel].histogramScaleInfo;
            if (!scale || !scale.padding || !Number.isFinite(scale.dataRange) || scale.dataRange <= 0) return null;
            const rect = canvas.getBoundingClientRect();
            const clientX = event.touches && event.touches[0] ? event.touches[0].clientX : event.clientX;
            const x = clientX - rect.left;
            const clampedX = Math.max(scale.padding.left, Math.min(scale.padding.left + scale.histWidth, x));
            return scale.dataMin + ((clampedX - scale.padding.left) / scale.histWidth) * scale.dataRange;
        };
        const pickHandle = (event) => {
            const scale = state.channels[channel] && state.channels[channel].histogramScaleInfo;
            if (!scale) return null;
            const doc = hostDocument();
            const minInput = doc.getElementById(`rgb-${channel}-min`);
            const maxInput = doc.getElementById(`rgb-${channel}-max`);
            const minValue = parseFloat(minInput && minInput.value);
            const maxValue = parseFloat(maxInput && maxInput.value);
            const valueToX = (value) => scale.padding.left + ((value - scale.dataMin) / scale.dataRange) * scale.histWidth;
            const rect = canvas.getBoundingClientRect();
            const clientX = event.touches && event.touches[0] ? event.touches[0].clientX : event.clientX;
            const x = clientX - rect.left;
            const minDist = Number.isFinite(minValue) ? Math.abs(x - valueToX(minValue)) : Infinity;
            const maxDist = Number.isFinite(maxValue) ? Math.abs(x - valueToX(maxValue)) : Infinity;
            return minDist <= maxDist ? 'min' : 'max';
        };
        const handleMove = (event) => {
            if (!dragging) return;
            event.preventDefault();
            const nextValue = valueFromEvent(event);
            if (!Number.isFinite(nextValue)) return;
            const doc = hostDocument();
            const minInput = doc.getElementById(`rgb-${channel}-min`);
            const maxInput = doc.getElementById(`rgb-${channel}-max`);
            if (!minInput || !maxInput) return;
            let minValue = parseFloat(minInput.value);
            let maxValue = parseFloat(maxInput.value);
            if (dragging === 'min') {
                minValue = Math.min(nextValue, Number.isFinite(maxValue) ? maxValue : nextValue);
                minInput.value = formatValue(minValue);
            } else {
                maxValue = Math.max(nextValue, Number.isFinite(minValue) ? minValue : nextValue);
                maxInput.value = formatValue(maxValue);
            }
            drawChannelHistogramLines(channel, parseFloat(minInput.value), parseFloat(maxInput.value));
        };
        const end = (event) => {
            if (!dragging) return;
            event && event.preventDefault && event.preventDefault();
            dragging = null;
            canvas.style.cursor = 'default';
            updateChannel(channel, true).catch((err) => notify(err.message, 3000, 'error'));
        };
        canvas.addEventListener('mousedown', (event) => {
            dragging = pickHandle(event);
            canvas.style.cursor = 'ew-resize';
            handleMove(event);
        });
        canvas.addEventListener('mousemove', (event) => {
            if (dragging) handleMove(event);
        });
        canvas.addEventListener('mouseup', end);
        canvas.addEventListener('mouseleave', end);
        canvas.addEventListener('touchstart', (event) => {
            dragging = pickHandle(event);
            handleMove(event);
        }, { passive: false });
        canvas.addEventListener('touchmove', handleMove, { passive: false });
        canvas.addEventListener('touchend', end, { passive: false });
        canvas.addEventListener('touchcancel', end, { passive: false });
    }

    function resetBrowserForRgbLoad(root) {
        const browserDoc = (root && root.document) || document;
        try {
            const container = browserDoc.getElementById('file-browser-container');
            if (container) {
                container.dataset.currentPath = '';
                const searchInput = container.querySelector('#files-search-input, input[placeholder="Search files recursively..."]');
                if (searchInput) searchInput.value = '';
            }
        } catch (_) { /* noop */ }
        try {
            const loader = root && typeof root.loadFilesList === 'function' ? root.loadFilesList : window.loadFilesList;
            if (typeof loader === 'function') loader('', null);
        } catch (_) { /* noop */ }
    }

    async function loadChannelFile(channel) {
        await ensureRgbSessionClearedForPage();
        const root = rootWindow();
        // In multi-panel iframes, prefer this pane's showFileBrowser (forwards to parent) so picks
        // use the correct session; root.showFileBrowser alone can target the wrong context.
        let showBrowser = null;
        try {
            if (window !== root && typeof window.showFileBrowser === 'function') {
                showBrowser = window.showFileBrowser;
            }
        } catch (_) { /* noop */ }
        if (typeof showBrowser !== 'function') {
            showBrowser = root.showFileBrowser || window.showFileBrowser;
        }
        if (typeof showBrowser !== 'function') {
            notify('File browser not available.', 2500, 'error');
            return;
        }
        showBrowser(async (filepath) => {
            try {
                await ensureHduSelectOptions(channel, filepath, undefined);
                try {
                    const doc = hostDocument();
                    const hduRow = doc.getElementById(`rgb-${channel}-hdu-row`);
                    if (hduRow) hduRow.style.display = 'flex';
                } catch (_) { /* noop */ }
                await setChannelFile(channel, filepath, { preferAutoHdu: true });
            } catch (_) { /* handled in setChannelFile */ }
        });
    }

    function refreshPanelValues(channel) {
        const doc = hostDocument();
        const data = state.channels[channel] || {};
        const path = doc.getElementById(`rgb-${channel}-file`);
        const minInput = doc.getElementById(`rgb-${channel}-min`);
        const maxInput = doc.getElementById(`rgb-${channel}-max`);
        const colorSelect = doc.getElementById(`rgb-${channel}-color`);
        const scalingSelect = doc.getElementById(`rgb-${channel}-scaling`);
        const invert = doc.getElementById(`rgb-${channel}-invert`);
        const hduRow = doc.getElementById(`rgb-${channel}-hdu-row`);
        const hduSelect = doc.getElementById(`rgb-${channel}-hdu`);
        const hduName = doc.getElementById(`rgb-${channel}-hdu-name`);
        const loaded = !!data.loaded;
        const showHduControls = loaded || !!data.show_hdu_controls;
        if (path) path.textContent = data.filepath || 'No file loaded';
        if (minInput && data.initial_display_min != null) minInput.value = formatValue(Number(data.initial_display_min));
        if (maxInput && data.initial_display_max != null) maxInput.value = formatValue(Number(data.initial_display_max));
        if (colorSelect) colorSelect.value = data.color_map || CHANNELS.find(ch => ch.id === channel).defaultMap;
        if (scalingSelect) scalingSelect.value = data.scaling_function || 'linear';
        if (invert) invert.checked = !!data.invert_colormap;
        if (hduRow) hduRow.style.display = showHduControls ? 'flex' : 'none';
        if (hduSelect) setHduSelectValue(channel, data.hdu);
        if (hduName) hduName.textContent = loaded && data.hdu_name ? `(${data.hdu_name})` : '';
        const hasHistogramCanvas = !!doc.getElementById(`rgb-${channel}-histogram-bg`);
        if (loaded && hasHistogramCanvas) refreshChannelHistogram(channel).catch(() => {});
        else drawChannelHistogram(channel, { counts: [] });
        updateRgbVisibilityControl();
    }

    /** Re-fetch /catalog-binary after the RGB WCS/pixel frame changes so overlays match the composite. */
    function scheduleCatalogOverlayRgbRefresh(viewer) {
        try {
            const v = viewer || window.tiledViewer;
            const fn = window.refreshCatalogOverlaysAfterRgbFrameChange;
            if (typeof fn !== 'function') return;
            const run = () => { fn().catch(() => {}); };
            if (v && typeof v.addOnceHandler === 'function') {
                v.addOnceHandler('open', run);
            } else {
                setTimeout(run, 150);
            }
        } catch (_) { /* noop */ }
    }

    function openRgbTiles(info, options) {
        if (!info || !Number.isFinite(info.width) || !Number.isFinite(info.height)) return;
        const preserveView = !!(options && options.preserveView);
        const openRequestId = ++state.openRequestId;
        hideWelcomeOverlays();
        setRgbModeActive(true);
        state.version = Date.now();
        state.tileInfo = info;
        window.currentTileInfo = info;
        const baseChannel = info.base_channel || CHANNELS.find((ch) => info.channels && info.channels[ch.id] && info.channels[ch.id].loaded)?.id;
        const baseMeta = (baseChannel && info.channels && info.channels[baseChannel]) ? info.channels[baseChannel] : {};
        const realFilepath = info.filepath || baseMeta.filepath || window.currentFitsFile || null;
        const realHdu = Number.isFinite(Number(info.hdu)) ? Number(info.hdu) : (Number.isFinite(Number(baseMeta.hdu)) ? Number(baseMeta.hdu) : 0);
        if (!window.fitsData) window.fitsData = {};
        window.fitsData.width = info.width;
        window.fitsData.height = info.height;
        if (realFilepath) {
            window.currentFitsFile = realFilepath;
            window.currentHduIndex = realHdu;
            window.fitsData.filename = realFilepath;
            window.fitsData.filepath = realFilepath;
            window.fitsData.filePath = realFilepath;
        }
        window.fitsData.rgb_mode = true;
        window.fitsData.rgb_label = 'RGB composite';
        if (info.session_id) {
            try { sessionStorage.setItem('sid', info.session_id); } catch (_) { /* noop */ }
            try { window.__nelouraSid = info.session_id; } catch (_) { /* noop */ }
        }

        const tileSize = Number(info.tileSize) || 256;
        const sourceWidth = Number(info.width);
        const sourceHeight = Number(info.height);
        const sourceMaxLevel = Number.isFinite(Number(info.maxLevel)) ? Number(info.maxLevel) : 0;
        const sourceMinLevel = info.minLevel === undefined ? 0 : Number(info.minLevel);
        const debugState = { tileUrlCount: 0 };
        console.log('[rgb] opening RGB tiles', {
            openRequestId,
            width: sourceWidth,
            height: sourceHeight,
            tileSize,
            minLevel: sourceMinLevel,
            maxLevel: sourceMaxLevel,
            base_channel: info.base_channel,
            hdu: info.hdu,
            channels: info.channels
        });
        const sourceMethods = {
            getLevelScale: function (level) {
                return 1 / (1 << (this.maxLevel - level));
            },
            getNumTiles: function (level) {
                const scale = this.getLevelScale(level);
                const tilesX = Math.ceil((sourceWidth * scale) / tileSize);
                const tilesY = Math.ceil((sourceHeight * scale) / tileSize);
                return new OpenSeadragon.Point(Math.max(1, tilesX), Math.max(1, tilesY));
            },
            getTileWidth: () => tileSize,
            getTileHeight: () => tileSize,
            getTileUrl: (level, x, y) => {
                let sid = null;
                try {
                    sid = info.session_id || window.__forcedSid || window.__nelouraSid ||
                        new URLSearchParams(window.location.search).get('sid') ||
                        new URLSearchParams(window.location.search).get('pane_sid') ||
                        sessionStorage.getItem('sid');
                } catch (_) { sid = null; }
                const sidParam = sid ? `sid=${encodeURIComponent(sid)}&` : '';
                const url = `/rgb-tile/${level}/${x}/${y}?${sidParam}v=${state.version}`;
                if (debugState.tileUrlCount < 20) {
                    debugState.tileUrlCount += 1;
                    console.log('[rgb] tile url', { level, x, y, url });
                }
                return url;
            }
        };
        let tileSource = {
            width: info.width,
            height: info.height,
            tileSize,
            tileOverlap: 0,
            maxLevel: sourceMaxLevel,
            minLevel: sourceMinLevel,
            ...sourceMethods
        };
        if (typeof OpenSeadragon === 'function' && OpenSeadragon.TileSource) {
            const explicitSource = new OpenSeadragon.TileSource({
                width: sourceWidth,
                height: sourceHeight,
                tileSize,
                tileOverlap: 0,
                minLevel: sourceMinLevel,
                maxLevel: sourceMaxLevel
            });
            Object.assign(explicitSource, sourceMethods);
            explicitSource.width = sourceWidth;
            explicitSource.height = sourceHeight;
            explicitSource.tileSize = tileSize;
            explicitSource.tileOverlap = 0;
            explicitSource.minLevel = sourceMinLevel;
            explicitSource.maxLevel = sourceMaxLevel;
            tileSource = explicitSource;
        }
        console.log('[rgb] constructed tile source', {
            width: tileSource.width,
            height: tileSource.height,
            tileSize: tileSource.tileSize,
            minLevel: tileSource.minLevel,
            maxLevel: tileSource.maxLevel,
            scaleMin: tileSource.getLevelScale ? tileSource.getLevelScale(tileSource.minLevel) : null,
            scaleMax: tileSource.getLevelScale ? tileSource.getLevelScale(tileSource.maxLevel) : null,
            numMin: tileSource.getNumTiles ? String(tileSource.getNumTiles(tileSource.minLevel)) : null,
            numMax: tileSource.getNumTiles ? String(tileSource.getNumTiles(tileSource.maxLevel)) : null
        });

        const logOpenedSource = () => {
            try {
                const viewer = window.tiledViewer;
                const source = viewer && viewer.source;
                console.log('[rgb] opened viewer source', {
                    requestedMaxLevel: sourceMaxLevel,
                    sourceMaxLevel: source && source.maxLevel,
                    sourceMinLevel: source && source.minLevel,
                    sourceWidth: source && source.width,
                    sourceHeight: source && source.height,
                    sourceScaleMin: source && source.getLevelScale ? source.getLevelScale(source.minLevel) : null,
                    sourceScaleMax: source && source.getLevelScale ? source.getLevelScale(source.maxLevel) : null,
                    worldItems: viewer && viewer.world && viewer.world.getItemCount ? viewer.world.getItemCount() : null,
                    viewportBounds: viewer && viewer.viewport && viewer.viewport.getBounds ? viewer.viewport.getBounds().toString() : null
                });
            } catch (err) {
                console.warn('[rgb] failed to log opened source', err);
            }
        };

        if (!window.tiledViewer && typeof OpenSeadragon === 'function') {
            window.tiledViewer = OpenSeadragon({
                id: 'openseadragon',
                tileSources: tileSource,
                prefixUrl: '/static/vendor/openseadragon/images/',
                showNavigator: true,
                navigatorPosition: 'TOP_LEFT',
                showZoomControl: false,
                showHomeControl: false,
                showFullPageControl: false,
                showRotationControl: false,
                defaultZoomLevel: 0.8,
                minZoomLevel: 0.05,
                maxZoomLevel: 75,
                imageSmoothingEnabled: false,
                loadTilesWithAjax: true,
                ajaxWithCredentials: true
            });
            window.viewer = window.tiledViewer;
            window.tiledViewer.addOnceHandler('open', () => {
                try {
                    if (openRequestId !== state.openRequestId) return;
                    logOpenedSource();
                    if (!preserveView && window.tiledViewer.viewport) window.tiledViewer.viewport.goHome(true);
                } catch (_) { /* noop */ }
            });
            scheduleCatalogOverlayRgbRefresh(window.tiledViewer);
        } else if (window.tiledViewer) {
            const viewport = window.tiledViewer.viewport;
            const zoom = preserveView && viewport && viewport.getZoom ? viewport.getZoom() : null;
            const center = preserveView && viewport && viewport.getCenter ? viewport.getCenter() : null;
            window.tiledViewer.open(tileSource);
            window.tiledViewer.addOnceHandler('open', () => {
                try {
                    if (openRequestId !== state.openRequestId) return;
                    logOpenedSource();
                    if (zoom && center) {
                        window.tiledViewer.viewport.zoomTo(zoom, null, true);
                        window.tiledViewer.viewport.panTo(center, true);
                    } else if (window.tiledViewer.viewport) {
                        window.tiledViewer.viewport.goHome(true);
                    }
                } catch (_) { /* noop */ }
            });
            scheduleCatalogOverlayRgbRefresh(window.tiledViewer);
        }
    }

    async function restoreRgbTiles(info, options) {
        try { window.__rgbModeActive = true; } catch (_) { /* noop */ }
        let tileInfo = info || null;
        if (!tileInfo && typeof request === 'function') {
            const resp = await request('/rgb/tile-info/');
            if (!resp.ok) throw new Error(await responseText(resp));
            tileInfo = await resp.json();
        }
        if (!tileInfo) return;
        syncStateFromInfo(tileInfo);
        CHANNELS.forEach((ch) => {
            const panel = hostDocument().getElementById(`rgb-panel-${ch.id}`);
            if (panel) refreshPanelValues(ch.id);
        });
        openRgbTiles(tileInfo, options || { preserveView: false });
        [0, 100, 350, 900].forEach((delay) => setTimeout(hideWelcomeOverlays, delay));
    }

    function buildChannelPanel(ch) {
        const doc = hostDocument();
        const panel = doc.createElement('div');
        panel.id = `rgb-panel-${ch.id}`;
        panel.style.display = ch.id === state.active ? 'block' : 'none';

        const fileRow = doc.createElement('div');
        Object.assign(fileRow.style, { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px' });
        const load = doc.createElement('button');
        load.id = `rgb-${ch.id}-load`;
        load.textContent = `Load ${ch.label} File`;
        styleButton(load, '#007bff');
        load.addEventListener('click', () => loadChannelFile(ch.id));
        const file = doc.createElement('div');
        file.id = `rgb-${ch.id}-file`;
        file.textContent = 'No file loaded';
        Object.assign(file.style, { color: '#aaa', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
        fileRow.appendChild(load);
        fileRow.appendChild(file);

        const hduRow = doc.createElement('div');
        hduRow.id = `rgb-${ch.id}-hdu-row`;
        Object.assign(hduRow.style, { display: 'none', alignItems: 'center', gap: '8px', marginBottom: '12px' });
        const hduLabel = doc.createElement('label');
        hduLabel.textContent = 'HDU';
        hduLabel.setAttribute('for', `rgb-${ch.id}-hdu`);
        Object.assign(hduLabel.style, { color: '#ccc', fontSize: '12px', minWidth: '32px' });
        const hduInput = doc.createElement('select');
        hduInput.id = `rgb-${ch.id}-hdu`;
        Object.assign(hduInput.style, {
            minWidth: '220px',
            background: '#1f1f1f',
            color: '#fff',
            border: '1px solid #555',
            borderRadius: '4px',
            padding: '5px 7px',
            fontSize: '12px'
        });
        const autoOpt = doc.createElement('option');
        autoOpt.value = '';
        autoOpt.textContent = 'Auto (first image HDU)';
        hduInput.appendChild(autoOpt);
        hduInput.addEventListener('change', async () => {
            state.channels[ch.id] = Object.assign({}, state.channels[ch.id], { hdu_user_set: true });
            const channelData = state.channels[ch.id] || {};
            if (!channelData.filepath) {
                notify('Load a file first, then select HDU.', 2200, 'info');
                return;
            }
            if (!channelData.loaded) return;
            try {
                await setChannelFile(ch.id, channelData.filepath);
            } catch (_) { /* handled in setChannelFile */ }
        });
        const hduName = doc.createElement('span');
        hduName.id = `rgb-${ch.id}-hdu-name`;
        hduName.textContent = '';
        Object.assign(hduName.style, { color: '#9ec9ff', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
        hduRow.appendChild(hduLabel);
        hduRow.appendChild(hduInput);
        hduRow.appendChild(hduName);

        const canvasBox = doc.createElement('div');
        Object.assign(canvasBox.style, {
            height: '200px',
            marginBottom: '15px',
            backgroundColor: '#222',
            borderRadius: '3px',
            position: 'relative'
        });
        const bgCanvas = doc.createElement('canvas');
        bgCanvas.id = `rgb-${ch.id}-histogram-bg`;
        bgCanvas.width = 470;
        bgCanvas.height = 200;
        Object.assign(bgCanvas.style, { display: 'block', position: 'absolute', left: '0', top: '0', zIndex: '1', width: '100%', height: '200px' });
        const linesCanvas = doc.createElement('canvas');
        linesCanvas.id = `rgb-${ch.id}-histogram-lines`;
        linesCanvas.width = 470;
        linesCanvas.height = 200;
        Object.assign(linesCanvas.style, { display: 'block', position: 'absolute', left: '0', top: '0', zIndex: '2', width: '100%', height: '200px', pointerEvents: 'auto', touchAction: 'none' });
        canvasBox.appendChild(bgCanvas);
        canvasBox.appendChild(linesCanvas);
        attachRgbHistogramInteraction(linesCanvas, ch.id);

        const percentileRow = doc.createElement('div');
        Object.assign(percentileRow.style, { display: 'flex', justifyContent: 'space-between', marginBottom: '15px' });
        [
            { label: '99.9%', value: 0.999 },
            { label: '99%', value: 0.99 },
            { label: '95%', value: 0.95 },
            { label: '90%', value: 0.90 }
        ].forEach((p) => {
            const btn = doc.createElement('button');
            btn.textContent = p.label;
            btn.style.flex = '1';
            btn.style.margin = '0 2px';
            styleButton(btn, '#444');
            btn.addEventListener('click', () => applyPercentile(ch.id, p.value).catch((err) => notify(err.message, 3000, 'error')));
            percentileRow.appendChild(btn);
        });

        const inputRow = doc.createElement('div');
        Object.assign(inputRow.style, { display: 'flex', alignItems: 'center', marginBottom: '15px' });
        const minLabel = doc.createElement('label');
        minLabel.textContent = 'Min:';
        Object.assign(minLabel.style, { color: '#aaa', marginRight: '5px', fontSize: '14px' });
        const minInput = doc.createElement('input');
        minInput.id = `rgb-${ch.id}-min`;
        minInput.type = 'text';
        Object.assign(minInput.style, { flex: '1', backgroundColor: '#444', color: '#fff', border: '1px solid #555', borderRadius: '3px', padding: '5px', marginRight: '10px', fontFamily: 'monospace', fontSize: '14px' });
        const maxLabel = doc.createElement('label');
        maxLabel.textContent = 'Max:';
        Object.assign(maxLabel.style, { color: '#aaa', marginRight: '5px', fontSize: '14px' });
        const maxInput = doc.createElement('input');
        maxInput.id = `rgb-${ch.id}-max`;
        maxInput.type = 'text';
        Object.assign(maxInput.style, { flex: '1', backgroundColor: '#444', color: '#fff', border: '1px solid #555', borderRadius: '3px', padding: '5px', fontFamily: 'monospace', fontSize: '14px' });
        inputRow.appendChild(minLabel);
        inputRow.appendChild(minInput);
        inputRow.appendChild(maxLabel);
        inputRow.appendChild(maxInput);
        [minInput, maxInput].forEach((input) => {
            input.addEventListener('change', () => updateChannel(ch.id, true).catch((err) => notify(err.message, 3000, 'error')));
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') updateChannel(ch.id, true).catch((err) => notify(err.message, 3000, 'error'));
            });
        });

        const controls = doc.createElement('div');
        Object.assign(controls.style, { display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' });
        const topRow = doc.createElement('div');
        Object.assign(topRow.style, { display: 'flex', flexDirection: 'row', justifyContent: 'space-between', gap: '15px', width: '100%' });
        const left = doc.createElement('div');
        Object.assign(left.style, { flex: '1', minWidth: '0' });
        const right = doc.createElement('div');
        Object.assign(right.style, { flex: '1', minWidth: '0' });
        const color = simpleSelect('Color Map:', `rgb-${ch.id}-color`, getColorOptions(), ch.defaultMap, () => updateChannel(ch.id, true).catch((err) => notify(err.message, 3000, 'error')));
        const scaling = simpleSelect('Scaling:', `rgb-${ch.id}-scaling`, SCALING_OPTIONS, 'linear', () => updateChannel(ch.id, true).catch((err) => notify(err.message, 3000, 'error')));
        const invertLabel = doc.createElement('label');
        Object.assign(invertLabel.style, { marginTop: '6px', display: 'flex', alignItems: 'center', cursor: 'pointer', color: '#aaa', fontSize: '14px' });
        const invert = doc.createElement('input');
        invert.type = 'checkbox';
        invert.id = `rgb-${ch.id}-invert`;
        invert.style.marginRight = '8px';
        invert.addEventListener('change', () => updateChannel(ch.id, true).catch((err) => notify(err.message, 3000, 'error')));
        invertLabel.appendChild(invert);
        invertLabel.appendChild(doc.createTextNode('Invert color map'));
        left.appendChild(color);
        left.appendChild(invertLabel);
        right.appendChild(scaling);
        topRow.appendChild(left);
        topRow.appendChild(right);
        controls.appendChild(topRow);

        panel.appendChild(fileRow);
        panel.appendChild(hduRow);
        panel.appendChild(canvasBox);
        panel.appendChild(percentileRow);
        panel.appendChild(inputRow);
        panel.appendChild(controls);
        return panel;
    }

    function showRgbComposer() {
        const doc = hostDocument();
        const rootWin = rootWindow();
        let popup = doc.getElementById('rgb-composer-popup');
        // Popup lives on the top document but channel state + fetch live on each pane's window.
        // Reusing another pane's DOM leaves Load buttons wired to the wrong closures — rebuild.
        if (popup) {
            const owner = popup.__nelouraRgbOwnerWin;
            const isTopPane = window === rootWin;
            if (owner && owner !== window) {
                try { popup.remove(); } catch (_) { /* noop */ }
                popup = null;
            } else if (!owner && !isTopPane) {
                try { popup.remove(); } catch (_) { /* noop */ }
                popup = null;
            }
        }
        if (popup) {
            try {
                if (!popup.__nelouraRgbOwnerWin) popup.__nelouraRgbOwnerWin = window;
            } catch (_) { /* noop */ }
            popup.style.display = 'flex';
            CHANNELS.forEach((ch) => refreshPanelValues(ch.id));
            updateTabVisibility();
            return;
        }

        popup = doc.createElement('div');
        popup.id = 'rgb-composer-popup';
        Object.assign(popup.style, {
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: '#333',
            border: '1px solid #555',
            borderRadius: '5px',
            padding: '15px',
            zIndex: '65120',
            width: '500px',
            boxSizing: 'border-box',
            boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: 'calc(100vh - 24px)',
            overflow: 'hidden'
        });

        const title = doc.createElement('div');
        Object.assign(title.style, {
            margin: '0 0 15px 0',
            color: '#fff',
            fontFamily: 'Arial, sans-serif',
            borderBottom: '1px solid #555',
            paddingBottom: '10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            flexShrink: '0',
            cursor: 'grab'
        });
        const titleText = doc.createElement('div');
        Object.assign(titleText.style, { fontSize: '18px', fontWeight: 'normal' });
        titleText.textContent = 'Multi-Color Image';
        title.appendChild(titleText);

        const close = doc.createElement('button');
        close.textContent = '×';
        Object.assign(close.style, {
            position: 'absolute',
            top: '10px',
            right: '10px',
            backgroundColor: 'transparent',
            border: 'none',
            color: '#aaa',
            fontSize: '20px',
            cursor: 'pointer',
            padding: '0',
            width: '24px',
            height: '24px',
            lineHeight: '24px'
        });
        close.addEventListener('click', () => {
            popup.style.display = 'none';
            // Closing the popup should not disable RGB mode if RGB tiles are still active.
            setRgbModeActive(!!(window.fitsData && window.fitsData.rgb_mode));
        });
        enableRgbPopupDrag(popup, title, doc);

        const tabs = doc.createElement('div');
        Object.assign(tabs.style, { display: 'flex', gap: '6px', marginBottom: '15px' });
        CHANNELS.forEach((ch) => {
            const tab = doc.createElement('button');
            tab.id = `rgb-tab-${ch.id}`;
            tab.textContent = ch.label;
            tab.style.flex = '1';
            styleButton(tab, ch.id === state.active ? '#007bff' : '#444');
            tab.addEventListener('mouseenter', () => {
                if (ch.id !== state.active) tab.style.backgroundColor = '#555';
            });
            tab.addEventListener('mouseleave', () => updateTabVisibility());
            tab.addEventListener('click', () => {
                state.active = ch.id;
                updateTabVisibility();
            });
            tabs.appendChild(tab);
        });

        const scroll = doc.createElement('div');
        Object.assign(scroll.style, {
            overflowY: 'auto',
            overflowX: 'hidden',
            flex: '1 1 auto',
            minHeight: '0',
            maxHeight: 'calc(100vh - 110px)',
            paddingRight: '4px',
            WebkitOverflowScrolling: 'touch'
        });
        scroll.appendChild(tabs);
        CHANNELS.forEach((ch) => scroll.appendChild(buildChannelPanel(ch)));

        popup.appendChild(title);
        popup.appendChild(close);
        popup.appendChild(scroll);
        doc.body.appendChild(popup);
        try { popup.__nelouraRgbOwnerWin = window; } catch (_) { /* noop */ }
        CHANNELS.forEach((ch) => refreshPanelValues(ch.id));
        updateTabVisibility();
    }

    function addToolbarButton() {
        if (document.getElementById('rgb-composer-button')) return;
        const toolbar = document.querySelector('.toolbar');
        if (!toolbar) return;
        const anchor = document.getElementById('settings-button') || document.getElementById('histogram-button') || toolbar.querySelector('.file-browser-button') || toolbar.querySelector('button');
        const button = document.createElement('button');
        button.id = 'rgb-composer-button';
        button.type = 'button';
        button.textContent = 'RGB';
        button.title = 'Create RGB image';
        if (anchor && anchor.className) button.className = anchor.className;
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const w = (window.getActivePaneWindow && window.getActivePaneWindow()) || window;
            if (w && w !== window && typeof w.showRgbComposer === 'function') {
                w.showRgbComposer();
            } else {
                showRgbComposer();
            }
        });
        if (anchor && anchor.parentNode) {
            anchor.insertAdjacentElement('afterend', button);
        } else {
            toolbar.appendChild(button);
        }
        try {
            if (typeof window.reorderToolbar === 'function') window.reorderToolbar();
        } catch (_) { /* noop */ }
    }

    function parseRgbDeepLinkFiles() {
        let sp = null;
        try {
            sp = new URLSearchParams(window.location.search || '');
        } catch (_) {
            return [];
        }
        const raw = sp.get('rgb_files');
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed
                .map((entry) => ({
                    channel: String(entry && entry.channel || '').toLowerCase(),
                    filepath: String(entry && entry.filepath || '').trim(),
                    filter: String(entry && entry.filter || '').trim().toUpperCase()
                }))
                .filter((entry) => entry.filepath && CHANNELS.some((ch) => ch.id === entry.channel));
        } catch (err) {
            console.error('[rgb] invalid rgb_files deep link payload', err);
            return [];
        }
    }

    async function openRgbFromDeepLinkIfPresent() {
        if (window.__rgbDeepLinkHandled) return;
        const files = parseRgbDeepLinkFiles();
        if (!files.length) return;
        window.__rgbDeepLinkHandled = true;

        let title = 'RGB image';
        try {
            const sp = new URLSearchParams(window.location.search || '');
            title = sp.get('rgb_title') || title;
        } catch (_) { /* noop */ }

        try {
            window.__DISABLE_AUTO_FILE_BROWSER = true;
            hideWelcomeOverlays();
            await ensureRgbSessionClearedForPage();
            notify(true, `Opening ${title}...`);
            for (const entry of files) {
                const channelInfo = CHANNELS.find((ch) => ch.id === entry.channel);
                if (channelInfo && state.channels[entry.channel]) {
                    state.channels[entry.channel].color_map = channelInfo.defaultMap;
                }
                await setChannelFile(entry.channel, entry.filepath, { preferAutoHdu: true });
            }
            if (window.fitsData) window.fitsData.rgb_label = title;
            try { document.title = title; } catch (_) { /* noop */ }
            notify(`${title} opened.`, 2200, 'success');
        } catch (err) {
            console.error('[rgb] RGB deep link failed', err);
            notify((err && err.message) || 'Failed to open RGB image from link.', 5000, 'error');
        }
    }

    function init() {
        installRgbModeGuards();
        let isMultiPanelPane = false;
        try { isMultiPanelPane = new URLSearchParams(window.location.search).get('mp') === '1'; } catch (_) { isMultiPanelPane = false; }
        if (!isMultiPanelPane) ensureRgbSessionClearedForPage();
        addToolbarButton();
        setTimeout(addToolbarButton, 500);
        setTimeout(addToolbarButton, 1500);
        openRgbFromDeepLinkIfPresent();
    }

    window.showRgbComposer = showRgbComposer;
    window.openRgbTiles = openRgbTiles;
    window.restoreRgbTiles = restoreRgbTiles;
    window.getRgbTileInfo = function () {
        return state.tileInfo || (window.currentTileInfo && window.currentTileInfo.rgb_mode ? window.currentTileInfo : null);
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

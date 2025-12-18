  function getPrimaryViewerTiledImage(viewer) {
    if (!viewer || !viewer.world || typeof viewer.world.getItemCount !== 'function') {
      return null;
    }
    try {
      const count = viewer.world.getItemCount();
      if (count > 0) {
        const base = viewer.world.getItemAt(0);
        if (base && typeof base.viewerElementToImageCoordinates === 'function') {
          return base;
        }
      }
    } catch (_) {}
    return null;
  }

// Coordinate overlay for pixel (x, y) and WCS (RA, Dec)
// Depends on OpenSeadragon and the global parseWCS(header) from static/main.js

(function () {
  function __paneSid() {
    try {
      const sp = new URLSearchParams(window.location.search);
      return (window.__forcedSid) || sp.get('sid') || sp.get('pane_sid') || null;
    } catch (_) { return window.__forcedSid || null; }
  }
  async function ensureSession() {
    try {
      const forced = __paneSid();
      if (forced) return forced;
      let sid = sessionStorage.getItem('sid');
      if (!sid) {
        const r = await fetch('/session/start');
        if (!r.ok) throw new Error('Failed to start session');
        const j = await r.json();
        sid = j.session_id;
        sessionStorage.setItem('sid', sid);
      }
      return sid;
    } catch (e) { return null; }
  }

  async function apiFetch(url, options = {}) {
    const sid = await ensureSession();
    const headers = options.headers ? { ...options.headers } : {};
    if (sid) headers['X-Session-ID'] = sid;
    // Also propagate sid in query for routes that rely on query param
    try {
      const u = new URL(url, window.location.origin);
      if (sid && !u.searchParams.get('sid')) u.searchParams.set('sid', sid);
      return fetch(u.toString(), { ...options, headers });
    } catch(_) {
      return fetch(url, { ...options, headers });
    }
  }
  let overlayElement = null;
  let hasAttachedHandlers = false;
  let overlayRendered = false;
  let overlayDataCache = null;

  // Throttle server probing aggressively; mousemove can easily generate 100s req/s otherwise.
  let _probeTimer = null;
  let _probeLatest = null;
  let _probeAbort = null;
  let _probeLastKey = null;
  let _probeLastTs = 0;

  // NOTE: We send TOP-origin pixel coords to the backend (origin=top). OpenSeadragon image coordinates
  // are naturally top-origin, and the backend will apply analyze_wcs_orientation-derived flip_y as needed.
  function scheduleProbePixel(displayX, displayYTop, imageX, imageY, raDeg, decDeg, bunit, pixelValue) {
    _probeLatest = { displayX, displayYTop, imageX, imageY, raDeg, decDeg, bunit, pixelValue };
    if (_probeTimer) return;
    _probeTimer = setTimeout(() => {
      _probeTimer = null;
      const p = _probeLatest;
      if (!p) return;

      const now = Date.now();
      const fileKey = (window.currentLoadedFitsFileId || window.currentFitsFile || '');
      const hduKey = (window.currentHduIndex != null ? String(window.currentHduIndex) : '');
      const segKey = (window.segmentOverlayState && window.segmentOverlayState.id) ? String(window.segmentOverlayState.id) : '';
      const segVer = (window.segmentOverlayState && window.segmentOverlayState.version) ? String(window.segmentOverlayState.version) : '';
      const key = `${fileKey}|${hduKey}|${segKey}|${segVer}|${p.displayX},${p.displayYTop}`;
      if (key === _probeLastKey && (now - _probeLastTs) < 120) return;
      _probeLastKey = key;
      _probeLastTs = now;

      try { if (_probeAbort) _probeAbort.abort(); } catch (_) {}
      _probeAbort = new AbortController();
      // Guard against async races: only allow the most recent *fired* request to update the overlay.
      // Important: do NOT advance this key when we early-return due to throttling, otherwise an
      // in-flight response can get incorrectly ignored until the mouse moves again.
      window._coordLastRequestKey = key;

      // 1) Accurate RA/Dec via backend Astropy WCS (handles SIP/distortions).
      // Throttled together with probe-pixel to avoid request spam.
      if (window._disablePixelToWorld !== true) {
        // Always pass filepath/HDU so the backend uses the correct generator header + analyze_wcs_orientation flip.
        // Relying solely on session state can produce mirrored coordinates when multiple panes/files are used.
        const rawPath = window.currentFitsFile || (window.fitsData && window.fitsData.filename);
        const filepath = (typeof rawPath === 'string') ? rawPath : null;
        const hduIndex = (typeof window.currentHduIndex === 'number') ? window.currentHduIndex : 0;
        const extra = (filepath ? `&filepath=${encodeURIComponent(filepath)}` : '') + `&hdu=${encodeURIComponent(hduIndex)}`;
        // Add a cache-buster to avoid any intermediary/browser caching of repeated queries.
        const wUrl = `/pixel-to-world/?x=${p.displayX}&y=${p.displayYTop}&origin=top${extra}&_t=${Date.now()}`;
        const requestKey = key;
        apiFetch(wUrl, { signal: _probeAbort.signal, cache: 'no-store' })
          .then(r => (r && r.ok) ? r.json() : null)
          .then(d => {
            if (window._coordLastRequestKey !== requestKey) return;
            if (d && typeof d.ra === 'number' && isFinite(d.ra) && typeof d.dec === 'number' && isFinite(d.dec)) {
              // Cache only for the current pixel key (prevents stale overwrite across pixels).
              window._coordLastWorld = { key: requestKey, ra: d.ra, dec: d.dec, ts: Date.now() };
              const last = window._coordLastValue;
              // Update overlay with backend-truth RA/Dec while preserving current value readout.
              updateOverlayText(p.imageX, p.imageY, d.ra, d.dec, last && last.value, (last && last.unit) || p.bunit);
            }
          })
          .catch(() => {});
      }

      // 2) Precise pixel value via backend (only when missing/zero).
      // Also pass filepath/HDU to keep probe-pixel consistent with the active map context.
      const rawPath2 = window.currentFitsFile || (window.fitsData && window.fitsData.filename);
      const filepath2 = (typeof rawPath2 === 'string') ? rawPath2 : null;
      const hduIndex2 = (typeof window.currentHduIndex === 'number') ? window.currentHduIndex : 0;
      const extra2 = (filepath2 ? `&filepath=${encodeURIComponent(filepath2)}` : '') + `&hdu=${encodeURIComponent(hduIndex2)}`;
      const url = `/probe-pixel/?x=${p.displayX}&y=${p.displayYTop}&origin=top${extra2}&_t=${Date.now()}`;
      if (window._disableProbePixel === true) return;
      const needsProbeValue = !(typeof p.pixelValue === 'number' && isFinite(p.pixelValue)) || p.pixelValue === 0;
      if (!needsProbeValue) {
        // Still allow segment probe below (it has its own display state), but skip value probe.
      } else {

      apiFetch(url, { signal: _probeAbort.signal, cache: 'no-store' })
        .then(r => {
          if (!r || !r.ok) {
            window._disableProbePixel = true;
            return null;
          }
          return r.json();
        })
        .then(data => {
          if (window._coordLastRequestKey !== key) return;
          if (data && typeof data.value === 'number' && isFinite(data.value)) {
            const unitFromSrv = data.unit;
            const valFromSrv = data.value;
            // cache last good value to avoid flicker to 0 when sampling is transient
            window._coordLastValue = { value: valFromSrv, unit: p.bunit || unitFromSrv, ts: Date.now() };
            // Use backend-truth RA/Dec only if it matches this pixel key; otherwise keep RA/Dec in "pending" state.
            const lw = window._coordLastWorld;
            const hasWorldForThis = !!(lw && lw.key === key && typeof lw.ra === 'number' && isFinite(lw.ra) && typeof lw.dec === 'number' && isFinite(lw.dec));
            updateOverlayText(
              p.imageX,
              p.imageY,
              hasWorldForThis ? lw.ra : NaN,
              hasWorldForThis ? lw.dec : NaN,
              valFromSrv,
              p.bunit || unitFromSrv,
              hasWorldForThis ? undefined : { forcePlaceholder: true }
            );
          }
        })
        .catch(() => {});
      }

      // If a segment overlay is active, also probe its label at this pixel.
      try {
        const seg = window.segmentOverlayState;
        if (seg && seg.id) {
          const segUrl = `/probe-segment-pixel/?segment_id=${encodeURIComponent(seg.id)}&x=${p.displayX}&y=${p.displayYTop}&origin=top`;
          apiFetch(segUrl, { signal: _probeAbort.signal, cache: 'no-store' })
            .then(r => (r && r.ok) ? r.json() : null)
            .then(d => {
              if (window._coordLastRequestKey !== key) return;
              if (d && (typeof d.value === 'number') && isFinite(d.value)) {
                window._coordLastSegmentValue = { value: d.value, ts: Date.now(), segment_id: seg.id };
              } else {
                window._coordLastSegmentValue = { value: NaN, ts: Date.now(), segment_id: seg.id };
              }
              const last = window._coordLastValue;
              updateOverlayText(p.imageX, p.imageY, p.raDeg, p.decDeg, last && last.value, (last && last.unit) || p.bunit);
            })
            .catch(() => {});
        } else {
          window._coordLastSegmentValue = null;
        }
      } catch (_) {}
    }, 10);
  }

  function removeOverlayElement() {
    if (overlayElement && overlayElement.parentElement) {
      try { overlayElement.parentElement.removeChild(overlayElement); } catch (_) {}
    }
    overlayElement = null;
    overlayRendered = false;
    overlayDataCache = null;
  }

  function ensureOverlayElement() {
    if (!window.fitsData) {
      removeOverlayElement();
      return null;
    }
    const osdRoot = document.getElementById('openseadragon');
    if (!osdRoot) {
      removeOverlayElement();
      return null;
    }
    const inner = osdRoot.querySelector('.openseadragon-container') || osdRoot;

    if (!overlayElement) {
      overlayElement = document.createElement('div');
      overlayElement.id = 'coord-overlay';
      overlayElement.style.position = 'absolute';
      overlayElement.style.top = '6px';
      overlayElement.style.left = '8px';
      overlayElement.style.padding = '8px 10px';
      overlayElement.style.fontFamily = 'Menlo, Consolas, monospace';
      overlayElement.style.fontSize = '12px';
      overlayElement.style.lineHeight = '1.35';
      overlayElement.style.color = '#EDEDED';
      overlayElement.style.background = 'rgba(0,0,0,0.55)';
      overlayElement.style.border = '1px solid rgba(255,255,255,0.12)';
      overlayElement.style.borderRadius = '6px';
      overlayElement.style.boxShadow = '0 4px 10px rgba(0,0,0,0.35)';
      overlayElement.style.pointerEvents = 'none';
      overlayElement.style.zIndex = '99999';
      overlayElement.style.whiteSpace = 'nowrap';
      overlayElement.innerHTML =
        '<div class="coord-row coord-val">Value: —</div>' +
        '<div class="coord-row coord-seg" style="display:none">Seg: —</div>' +
        '<div class="coord-row coord-xy">x: —, y: —</div>' +
        '<div class="coord-row coord-ra">RA: —, Dec: —</div>';
      inner.appendChild(overlayElement);
      positionOverlay();
    } else if (!overlayElement.parentElement) {
      const inner2 = osdRoot.querySelector('.openseadragon-container') || osdRoot;
      inner2.appendChild(overlayElement);
      positionOverlay();
    } else {
      // If overlay exists but is attached to the wrong parent, move it under the inner OSD container
      const inner2 = osdRoot.querySelector('.openseadragon-container') || osdRoot;
      if (overlayElement.parentElement !== inner2) {
        inner2.appendChild(overlayElement);
        positionOverlay();
      }
    }
    overlayElement.style.display = 'block';
    overlayElement.style.opacity = '1';
    return overlayElement;
  }

  function formatHMS(raDegrees) {
    if (!isFinite(raDegrees)) return '—';
    let hours = raDegrees / 15.0;
    const h = Math.floor(hours);
    let rem = (hours - h) * 60;
    const m = Math.floor(rem);
    const s = (rem - m) * 60;
    return `${pad2(h)}:${pad2(m)}:${pad2(s.toFixed(2))}`;
  }

  function formatDMS(decDegrees) {
    if (!isFinite(decDegrees)) return '—';
    const sign = decDegrees >= 0 ? '+' : '-';
    const abs = Math.abs(decDegrees);
    const d = Math.floor(abs);
    let rem = (abs - d) * 60;
    const m = Math.floor(rem);
    const s = (rem - m) * 60;
    return `${sign}${pad2(d)}:${pad2(m)}:${pad2(s.toFixed(2))}`;
  }

  function pad2(v) {
    const s = String(v);
    return s.length < 2 ? '0' + s : s;
  }

  function getParsedWCS() {
    try {
      const header = window?.fitsData?.wcs;
      if (!header) return null;
      if (window.parsedWCS && window.parsedWCS.__source === header) {
        return window.parsedWCS;
      }
      if (typeof window.parseWCS === 'function') {
        const parsed = window.parseWCS(header);
        parsed.__source = header;
        window.parsedWCS = parsed;
        return parsed;
      }
    } catch (e) {
      // ignore
    }
    return null;
  }

  // Collect detailed WCS debug info for troubleshooting
  function collectWcsDebug() {
    const header = window?.fitsData?.wcs || null;
    const parsed = window?.parsedWCS || null;
    const filename = window?.currentFitsFile || window?.fitsData?.filename || null;
    const hdu = typeof window.currentHduIndex === 'number' ? window.currentHduIndex : null;
    const keys = header ? Object.keys(header) : [];
    const get = (k) => (header && (k in header ? header[k] : (k.toUpperCase() in header ? header[k.toUpperCase()] : (k.toLowerCase() in header ? header[k.toLowerCase()] : undefined))));
    const has = (k) => (header && (k in header || k.toUpperCase() in header || k.toLowerCase() in header));
    const essentials = {
      CTYPE1: get('CTYPE1'), CTYPE2: get('CTYPE2'),
      CRVAL1: get('CRVAL1'), CRVAL2: get('CRVAL2'),
      CRPIX1: get('CRPIX1'), CRPIX2: get('CRPIX2'),
      CD1_1: get('CD1_1'), CD1_2: get('CD1_2'), CD2_1: get('CD2_1'), CD2_2: get('CD2_2'),
      CDELT1: get('CDELT1'), CDELT2: get('CDELT2'),
      PC1_1: get('PC1_1'), PC1_2: get('PC1_2'), PC2_1: get('PC2_1'), PC2_2: get('PC2_2'),
      NAXIS: get('NAXIS'), NAXIS1: get('NAXIS1'), NAXIS2: get('NAXIS2')
    };
    const hasSIP = !!(has('A_ORDER') || has('B_ORDER') || keys.some(k => /^A_\d_\d$/i.test(k)) || keys.some(k => /^B_\d_\d$/i.test(k)));
    const hasPV = keys.some(k => /^PV\d_\d+$/i.test(k));
    return {
      file: filename,
      hdu,
      parsedHasWCS: !!(parsed && parsed.hasWCS),
      ctype: { CTYPE1: essentials.CTYPE1, CTYPE2: essentials.CTYPE2 },
      matrix: { CD: { CD1_1: essentials.CD1_1, CD1_2: essentials.CD1_2, CD2_1: essentials.CD2_1, CD2_2: essentials.CD2_2 }, PC: { PC1_1: essentials.PC1_1, PC1_2: essentials.PC1_2, PC2_1: essentials.PC2_1, PC2_2: essentials.PC2_2 }, CDELT: { CDELT1: essentials.CDELT1, CDELT2: essentials.CDELT2 } },
      ref: { CRVAL1: essentials.CRVAL1, CRVAL2: essentials.CRVAL2, CRPIX1: essentials.CRPIX1, CRPIX2: essentials.CRPIX2 },
      axes: { NAXIS: essentials.NAXIS, NAXIS1: essentials.NAXIS1, NAXIS2: essentials.NAXIS2 },
      hasSIP,
      hasPV,
      headerSample: header ? Object.fromEntries(keys.slice(0, 50).map(k => [k, header[k]])) : null
    };
  }

  // Expose a helper to dump/copy WCS debug info
  window.dumpWcsDebug = function() {
    const info = collectWcsDebug();
    try { console.log('[coords_overlay] WCS debug:', info); } catch (_) {}
    try {
      const text = JSON.stringify(info, null, 2);
      if (navigator?.clipboard?.writeText) navigator.clipboard.writeText(text);
      return text;
    } catch (_) { return info; }
  };

  // Convert PC+CDELT into CD if needed so parseWCS works
  function normalizeHeaderForParse(rawHeader) {
    if (!rawHeader) return rawHeader;
    const h = { ...rawHeader };
    const hasCD = ('CD1_1' in h) || ('cd1_1' in h);
    const hasPC = ('PC1_1' in h) || ('pc1_1' in h);
    const get = (k) => (k in h ? h[k] : (k.toUpperCase() in h ? h[k.toUpperCase()] : (k.toLowerCase() in h ? h[k.toLowerCase()] : undefined)));
    const setU = (k, v) => { h[k.toUpperCase()] = v; };

    if (!hasCD && hasPC) {
      const pc11 = Number(get('PC1_1') ?? 1);
      const pc12 = Number(get('PC1_2') ?? 0);
      const pc21 = Number(get('PC2_1') ?? 0);
      const pc22 = Number(get('PC2_2') ?? 1);
      const cdelt1 = Number(get('CDELT1') ?? 1);
      const cdelt2 = Number(get('CDELT2') ?? 1);
      setU('CD1_1', pc11 * cdelt1);
      setU('CD1_2', pc12 * cdelt1);
      setU('CD2_1', pc21 * cdelt2);
      setU('CD2_2', pc22 * cdelt2);
    }

    if (typeof window?.fitsData?.width === 'number') setU('NAXIS1', window.fitsData.width);
    if (typeof window?.fitsData?.height === 'number') setU('NAXIS2', window.fitsData.height);
    setU('NAXIS', 2);
    return h;
  }

  // JS version of analyze_wcs_orientation to derive flip_y when server doesn't provide it
  function analyzeWcsOrientationJs(header) {
    try {
      const get = (k) => (k in header ? header[k] : (k.toUpperCase() in header ? header[k.toUpperCase()] : (k.toLowerCase() in header ? header[k.toLowerCase()] : undefined)));
      let cd11, cd12, cd21, cd22;
      if (get('CD1_1') !== undefined) {
        cd11 = Number(get('CD1_1')); cd12 = Number(get('CD1_2')) || 0;
        cd21 = Number(get('CD2_1')) || 0; cd22 = Number(get('CD2_2')) || 1;
      } else if (get('PC1_1') !== undefined) {
        const pc11 = Number(get('PC1_1')) || 1;
        const pc12 = Number(get('PC1_2')) || 0;
        const pc21 = Number(get('PC2_1')) || 0;
        const pc22 = Number(get('PC2_2')) || 1;
        const cdelt1 = Number(get('CDELT1')) || 1;
        const cdelt2 = Number(get('CDELT2')) || 1;
        cd11 = pc11 * cdelt1; cd12 = pc12 * cdelt1; cd21 = pc21 * cdelt2; cd22 = pc22 * cdelt2;
      } else {
        const cdelt1 = Number(get('CDELT1')) || 1;
        const cdelt2 = Number(get('CDELT2')) || 1;
        cd11 = cdelt1; cd12 = 0; cd21 = 0; cd22 = cdelt2;
      }
      const det = cd11 * cd22 - cd12 * cd21;
      let flipY = false;
      if (det < 0) flipY = true; else flipY = false;
      if (cd22 < 0 && det > 0) flipY = true;
      if (Math.abs(det) < 1e-15) flipY = cd22 < 0;
      return flipY;
    } catch (_) {
      return false;
    }
  }

  // Fallback converter if parseWCS().pixelsToWorld is unavailable/returns null

  // Supports TAN and SIN (orthographic) using header keywords
function pixelsToWorldFromHeader(header, x, y) {
    try {
      if (!header) return null;
      const get = (k) => (k in header ? header[k]
        : (k.toUpperCase() in header ? header[k.toUpperCase()]
        : (k.toLowerCase() in header ? header[k.toLowerCase()] : undefined)));
  
      const ctype1 = String(get('CTYPE1') || '');
      const ctype2 = String(get('CTYPE2') || '');
      if (!ctype1 || !ctype2) return null;
  
      const D2R = Math.PI / 180.0;
      const R2D = 180.0 / Math.PI;
  
      const crval1 = Number(get('CRVAL1'));
      const crval2 = Number(get('CRVAL2'));
      const crpix1 = Number(get('CRPIX1'));
      const crpix2 = Number(get('CRPIX2'));
  
      // Prefer CD matrix, fall back to CDELT
      let cd11 = get('CD1_1'); let cd12 = get('CD1_2');
      let cd21 = get('CD2_1'); let cd22 = get('CD2_2');
      if (cd11 === undefined || cd22 === undefined) {
        const cdelt1 = Number(get('CDELT1') ?? 1);
        const cdelt2 = Number(get('CDELT2') ?? 1);
        cd11 = Number(cd11 ?? cdelt1);
        cd12 = Number(cd12 ?? 0);
        cd21 = Number(cd21 ?? 0);
        cd22 = Number(cd22 ?? cdelt2);
      } else {
        cd11 = Number(cd11); cd12 = Number(cd12 || 0);
        cd21 = Number(cd21 || 0); cd22 = Number(cd22);
      }
  
      if (![crval1, crval2, crpix1, crpix2, cd11, cd12, cd21, cd22].every(v => Number.isFinite(v))) return null;
  
      // Pixel offsets (FITS 1-based ref)
      const xprime = x - crpix1 + 1;
      const yprime = y - crpix2 + 1;
  
      // Intermediate plane coords (degrees)
      const xi_deg  = (cd11 * xprime + cd12 * yprime);
      const eta_deg = (cd21 * xprime + cd22 * yprime);
  
      const ra0 = crval1 * D2R;
      const dec0 = crval2 * D2R;
  
      // TAN (gnomonic)
      if (ctype1.includes('TAN') && ctype2.includes('TAN')) {
        const xi  = xi_deg  * D2R;
        const eta = eta_deg * D2R;
  
        const H = Math.hypot(xi, eta);
        const delta = Math.atan(H);
        const sin_delta = Math.sin(delta);
        const cos_delta = Math.cos(delta);
  
        const cos_dec0 = Math.cos(dec0);
        const sin_dec0 = Math.sin(dec0);
  
        const dec = Math.asin(cos_delta * sin_dec0 + (eta * sin_delta * cos_dec0) / (H || 1e-16));
        const ra  = ra0 + Math.atan2(xi * sin_delta, H * cos_dec0 * cos_delta - eta * sin_dec0 * sin_delta);
  
        return { ra: (ra * R2D + 540) % 360 - 180, dec: dec * R2D };
      }
  
      // SIN (orthographic) – common in radio maps (e.g. ALMA)
      if (ctype1.includes('SIN') && ctype2.includes('SIN')) {
        // Direction cosines approximation: l = -xi, m = eta (in radians)
        const l = -(xi_deg)  * D2R;
        const m =  (eta_deg) * D2R;
        const rho2 = l*l + m*m;
        if (rho2 > 1.0) return null; // outside projection
        const n = Math.sqrt(Math.max(0, 1 - rho2));
  
        const cos_dec0 = Math.cos(dec0);
        const sin_dec0 = Math.sin(dec0);
  
        // Inverse orthographic (SIN) projection
        const dec = Math.asin(m * cos_dec0 + n * sin_dec0);
        const y_num = l;
        const x_den = n * cos_dec0 - m * sin_dec0;
        const ra  = ra0 + Math.atan2(y_num, x_den);
  
        return { ra: (ra * R2D + 540) % 360 - 180, dec: dec * R2D };
      }
  
      // Unknown projection here → let server handle it (pixel-to-world route)
      return null;
    } catch {
      return null;
    }
  }

  let requestedWcs = false;
  function parseHeaderValue(v) {
    if (v == null) return undefined;
    let s = String(v).trim();
    // repr() of strings in Python includes quotes
    if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
      return s.slice(1, -1);
    }
    // booleans
    if (s === 'True' || s === 'T') return true;
    if (s === 'False' || s === 'F') return false;
    // numbers (including scientific notation)
    const n = Number(s.replace(/D/i, 'E')); // handle FITS-style D exponent
    if (!Number.isNaN(n)) return n;
    return s;
  }

  function headerListToDict(headerList) {
    const obj = {};
    if (!Array.isArray(headerList)) return obj;
    for (const item of headerList) {
      if (!item || !item.key) continue;
      obj[item.key.toUpperCase()] = parseHeaderValue(item.value);
    }
    return obj;
  }

  async function requestWcsIfMissing() {
    try {
      // Ensure container exists
      if (!window.fitsData) window.fitsData = {};
      if (window?.fitsData?.wcs) return;
      if (requestedWcs) return;
      requestedWcs = true;
      // Use the most reliable path/HDU we have
      const rawPath = window.currentFitsFile || window.fitsData.filename;
      const filepath = (typeof rawPath === 'string') ? rawPath : (typeof window.fitsData?.filename === 'string' ? window.fitsData.filename : null);
      const path = filepath;
      if (!path) { requestedWcs = false; return; }
      const hduIndex = typeof window.currentHduIndex === 'number' ? window.currentHduIndex : 0;
      console.log('[coords_overlay] Fetching header for', { filepath, hduIndex });
      // Do NOT encode here; the backend route uses a {filepath:path} param and expects raw path
      const res = await apiFetch(`/fits-header/${path}?hdu_index=${hduIndex}`);
      if (!res.ok) return;
      const payload = await res.json();
      const rawHeader = payload?.header || payload;
      if (!rawHeader) { console.warn('[coords_overlay] No header in response'); return; }
      const headerDict = Array.isArray(rawHeader) ? headerListToDict(rawHeader) : rawHeader;
      const normalized = normalizeHeaderForParse(headerDict);
      window.fitsData.wcs = normalized;
      console.log('[coords_overlay] Normalized WCS ready');
      try {
        const dbg = collectWcsDebug();
        console.log('[coords_overlay] WCS essentials:', { file: dbg.file, hdu: dbg.hdu, ctype: dbg.ctype, matrix: dbg.matrix, ref: dbg.ref, axes: dbg.axes, hasSIP: dbg.hasSIP, hasPV: dbg.hasPV });
      } catch (_) {}
      // Derive flip_y using the backend's analyze_wcs_orientation() (main.py),
      // so overlay coordinate orientation matches the displayed map.
      if (window.fitsData.flip_y == null) {
        try {
          const oriUrl = `/wcs-orientation/?filepath=${encodeURIComponent(path)}&hdu=${encodeURIComponent(hduIndex)}`;
          const oriRes = await apiFetch(oriUrl, { cache: 'no-store' });
          const ori = oriRes && oriRes.ok ? await oriRes.json().catch(() => null) : null;
          if (ori && typeof ori.flip_y === 'boolean') {
            window.fitsData.flip_y = ori.flip_y;
          } else {
            window.fitsData.flip_y = analyzeWcsOrientationJs(normalized);
          }
        } catch (_) {
          window.fitsData.flip_y = analyzeWcsOrientationJs(normalized);
        }
      }
      // Prime parsedWCS
      if (typeof window.parseWCS === 'function') {
        const parsed = window.parseWCS(normalized);
        parsed.__source = normalized;
        window.parsedWCS = parsed;
        console.log('[coords_overlay] parsedWCS.hasWCS =', !!parsed?.hasWCS);
      }
      // Notify listeners that WCS is ready (normalize event name/target)
      try { document.dispatchEvent(new CustomEvent('wcs:ready', { detail: { filepath, hduIndex } })); } catch (_) {}
      // Back-compat: also emit the hyphen variant
      try { document.dispatchEvent(new CustomEvent('wcs-ready', { detail: { filepath, hduIndex } })); } catch (_) {}
    } catch (_) {
      // ignore
    }
  }

  function formatValueForReadout(v) {
    if (v == null || !isFinite(v)) return null;
    if (v < 0) return null; // hide negative pixel values
    const abs = Math.abs(v);
    if (abs !== 0 && (abs < 1e-3 || abs >= 1e4)) return v.toExponential(4);
    return v.toFixed(4);
  }


  function updateOverlayText(ix, iy, raDeg, decDeg, pixelValue, unit, opts) {
    if (!window.fitsData) {
      removeOverlayElement();
      return;
    }
    const el = ensureOverlayElement();
    if (!el) return;
  
    // y (bottom-left) for display
    const imgHeight = window?.fitsData?.height;
    const yBottomLeft = Number(typeof imgHeight === 'number' ? (imgHeight - 1 - iy) : iy);
  
    // x,y as text (use '-' for negatives/non-finite)
    const xText = (typeof ix === 'number' && isFinite(ix) && ix >= 0) ? Number(ix).toFixed(2) : '-';
    const yText = (typeof yBottomLeft === 'number' && isFinite(yBottomLeft) && yBottomLeft >= 0) ? yBottomLeft.toFixed(2) : '-';
  
    const xyNode = el.querySelector('.coord-xy');
    const raNode = el.querySelector('.coord-ra');
    const valNode = el.querySelector('.coord-val');
    const segNode = el.querySelector('.coord-seg');
  
    if (xyNode) xyNode.textContent = `x: ${xText}, y: ${yText}`;
  
    if (valNode) {
      const valStr = formatValueForReadout(pixelValue);
      valNode.textContent = valStr !== null ? `${valStr}${unit ? ' ' + unit : ''}` : 'Value: —';
    }

    // Segment label readout (if an overlay is active)
    try {
      if (segNode) {
        const segState = window.segmentOverlayState;
        if (segState && segState.id) {
          segNode.style.display = '';
          const lastSeg = window._coordLastSegmentValue;
          const segVal = lastSeg && typeof lastSeg.value === 'number' && isFinite(lastSeg.value) ? Math.trunc(lastSeg.value) : null;
          segNode.textContent = (segVal !== null) ? `Seg: ${segVal}` : 'Seg: —';
        } else {
          segNode.style.display = 'none';
          segNode.textContent = 'Seg: —';
        }
      }
    } catch (_) {}
  
    const forcePlaceholder = !!(opts && opts.forcePlaceholder);
    // Important: avoid showing stale RA/Dec from a previous pixel.
    // If a backend request is pending for the current pixel, force a placeholder.
    if (forcePlaceholder) {
      if (raNode) raNode.textContent = `RA: …, Dec: …`;
    } else if (isFinite(raDeg) && isFinite(decDeg)) {
      const deg = '°';
      const raStr = `${raDeg.toFixed(6)}${deg}`;
      const decStr = `${decDeg.toFixed(6)}${deg}`;
      if (raNode) raNode.textContent = `RA: ${raStr}, Dec: ${decStr}`;
    }
  }

  function onMouseMove(evt) {
    const viewer = window.viewer || window.tiledViewer;
    if (!viewer) return;
    const baseTiledImage = getPrimaryViewerTiledImage(viewer);
    if (!baseTiledImage) {
      if (!viewer.__coordsOverlayWarned) {
        console.warn('[coords_overlay] Base tiled image not ready; skipping coordinate readout to avoid viewport warnings.');
        viewer.__coordsOverlayWarned = true;
      }
      return;
    }
    const container = viewer.container || document.getElementById('openseadragon');
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const pixel = new OpenSeadragon.Point(evt.clientX - rect.left, evt.clientY - rect.top);
    // Convert pixel (screen) -> image coordinates using base tiled image
    let imagePoint;
    try {
      imagePoint = baseTiledImage.viewerElementToImageCoordinates(pixel);
    } catch (e) {
      return;
    }

    let imageX = imagePoint.x;
    let imageY = imagePoint.y;

    const imgHeight = window?.fitsData?.height;
    const displayX = Math.round(imageX);
    const displayYTop = Math.round(imageY);

    // IMPORTANT:
    // Do NOT compute RA/Dec in JS here (it can be wrong for SIP/distorted WCS and can conflict
    // with backend flip_y decisions). We display a placeholder and let the backend (/pixel-to-world/)
    // provide the only RA/Dec source of truth.
    let raDeg = NaN;
    let decDeg = NaN;
    const dbg = { hduIndex: window.currentHduIndex, imageX, imageY };
  // Pixel value readout (prefer instant approx, then refine via probe)
  let pixelValue = null;
  let bunit = '';
  try {
    if (typeof window.getBunit === 'function') bunit = window.getBunit();
  } catch (_) {}
  // We'll schedule probe-pixel after RA/Dec are computed so async updates can't blank them.
  // Fallback: approximate from overview cache if still missing
  if (!(typeof pixelValue === 'number' && isFinite(pixelValue)) || pixelValue === 0) {
    try {
      const ov = window.histogramOverviewPixelData;
      if (ov && ov.pixels && Array.isArray(ov.pixels)) {
        const scaleX = ov.width / (window?.fitsData?.width || ov.width);
        const scaleY = ov.height / (window?.fitsData?.height || ov.height);
        let ox = Math.max(0, Math.min(ov.width - 1, Math.floor(imageX * scaleX)));
        let oy = Math.max(0, Math.min(ov.height - 1, Math.floor(imageY * scaleY)));
        const native = ov.pixels[oy][ox]; // 0-255
        const dataMin = typeof ov.dataMin === 'number' ? ov.dataMin : 0;
        const dataMax = typeof ov.dataMax === 'number' ? ov.dataMax : 1;
        const approx = dataMin + (native / 255.0) * (dataMax - dataMin);
        if (isFinite(approx)) pixelValue = approx;
        //   console.log('[coords_overlay] overview fallback value', { ...dbg, ox, oy, native, approx });
      }
    } catch (_) {}
  }
    // (RA/Dec intentionally not computed locally.)

  // If direct readout is missing/zero, try precise server probe for current file/HDU.
  // Pass exactly the displayed coordinates (bottom-left origin) to backend.
  try {
    // Always schedule a throttled probe so RA/Dec can be refined via backend WCS (SIP-safe),
    // and pixel/segment values can be fetched when needed.
    if (Number.isFinite(displayX) && Number.isFinite(displayYTop)) {
      scheduleProbePixel(displayX, displayYTop, imageX, imageY, raDeg, decDeg, bunit, pixelValue);
    }
  } catch (_) {}
  // Stabilize: if no value yet, reuse last one briefly to avoid flicker
  if (!(typeof pixelValue === 'number' && isFinite(pixelValue))) {
    const last = window._coordLastValue;
    if (last && Date.now() - last.ts < 250) {
      pixelValue = last.value;
      if (!bunit && last.unit) bunit = last.unit;
    }
  }
  // Show x/y immediately, but keep RA/Dec in a "pending" placeholder until backend responds.
  updateOverlayText(imageX, imageY, NaN, NaN, pixelValue, bunit, { forcePlaceholder: true });
  }

  function attachHandlers() {
    if (hasAttachedHandlers) return;
    const viewer = window.viewer || window.tiledViewer;
    const container = document.getElementById('openseadragon');
    if (!viewer || !container) return;

    // Keep overlay alive across viewer opens
    viewer.addHandler && viewer.addHandler('open', function () {
      ensureOverlayElement();
      positionOverlay();
    });

    // Use DOM mousemove for smooth tracking
    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mouseleave', function () {
      const el = ensureOverlayElement();
      if (el) {
        const xyNode = el.querySelector('.coord-xy');
        const raNode = el.querySelector('.coord-ra');
        if (xyNode) xyNode.textContent = 'x: —, y: —';
        if (raNode) raNode.textContent = 'RA: —, Dec: —';
      }
    });

    // Kick off WCS fetch if not already available
    requestWcsIfMissing();
    // Reposition on resize
    window.addEventListener('resize', positionOverlay);

    // Periodically ensure WCS is available after file/map changes
    let lastWcsCheck = { filename: null, hdu: null };
    setInterval(() => {
      const filename = window?.currentFitsFile || window?.fitsData?.filename || null;
      const hdu = typeof window.currentHduIndex === 'number' ? window.currentHduIndex : null;
      const changed = (filename && filename !== lastWcsCheck.filename) || (hdu !== lastWcsCheck.hdu);
      const hasWcs = !!(window.parsedWCS && window.parsedWCS.hasWCS);
      if (changed || !hasWcs) {
        if (typeof window.refreshWcsForOverlay === 'function') {
          window.refreshWcsForOverlay({ filepath: filename || undefined, hduIndex: hdu ?? undefined });
        } else {
          requestWcsIfMissing();
        }
        lastWcsCheck = { filename, hdu };
      }
    }, 1000);

    hasAttachedHandlers = true;
  }

  function positionOverlay() {
    const container = document.getElementById('openseadragon');
    if (!container || !overlayElement) return;
    const containerRect = container.getBoundingClientRect();
    // Prefer navigator block
    const nav = container.querySelector('.openseadragon-navigator');
    // Fallbacks: try common button group containers
    const controls = container.querySelector('.openseadragon-button-group') ||
                     container.querySelector('.openseadragon-controls') ||
                     container.querySelector('.openseadragon-toolbar');
    const anchor = nav || controls;
    if (anchor) {
      const r = anchor.getBoundingClientRect();
      const top = r.bottom - containerRect.top + 36; // pushed further down below panel
      const left = r.left - containerRect.left;
      overlayElement.style.top = `${Math.max(6, top)}px`;
      overlayElement.style.left = `${Math.max(6, left)}px`;
    } else {
      // Default to top-left with some padding to avoid toolbar
      overlayElement.style.top = '88px';
      overlayElement.style.left = '8px';
    }
  }

  function waitForViewerAndInit(attemptsLeft = 40) {
    if (window.viewer || window.tiledViewer) {
      ensureOverlayElement();
      attachHandlers();
      return;
    }
    if (attemptsLeft <= 0) return;
    setTimeout(() => waitForViewerAndInit(attemptsLeft - 1), 250);
  }

  // Observe late creation of the OpenSeadragon container and attach overlay/handlers
  function observeViewerContainer() {
    try {
      const osdRoot = document.getElementById('openseadragon');
      if (!osdRoot || window._coordsOverlayObserver) return;
      const obs = new MutationObserver(() => {
        const inner = osdRoot.querySelector('.openseadragon-container');
        if (inner) {
          ensureOverlayElement();
          attachHandlers();
        }
      });
      obs.observe(osdRoot, { childList: true, subtree: true });
      window._coordsOverlayObserver = obs;
    } catch (_) { /* ignore */ }
  }

  // Expose a manual setup entry if needed elsewhere
  window.setupCoordinateOverlay = function () {
    waitForViewerAndInit();
  };

  // Expose a way to force WCS refresh when HDU/file changes
  window.refreshWcsForOverlay = function (opts = {}) {
    const { filepath, hduIndex } = opts;
    if (filepath) {
      window.currentFitsFile = filepath;
      if (window.fitsData) window.fitsData.filename = filepath;
    }
    if (typeof hduIndex === 'number') {
      window.currentHduIndex = hduIndex;
    }
    // Clear cached WCS and re-fetch for the selected HDU
    if (window.fitsData) {
      delete window.fitsData.wcs;
    }
    // Reset parsedWCS so RA/Dec recompute for the new file/HDU
    if (window.parsedWCS) delete window.parsedWCS;
    requestedWcs = false;
    console.log('[coords_overlay] Forcing WCS refresh for', { filepath: window.currentFitsFile || window?.fitsData?.filename, hduIndex: window.currentHduIndex });
    requestWcsIfMissing();
  };

  // Auto-init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { waitForViewerAndInit(); observeViewerContainer(); requestWcsIfMissing(); });
  } else {
    waitForViewerAndInit();
    observeViewerContainer();
    requestWcsIfMissing();
  }
  window.removeCoordOverlay = removeOverlayElement;
})();



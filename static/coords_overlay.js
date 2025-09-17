// Coordinate overlay for pixel (x, y) and WCS (RA, Dec)
// Depends on OpenSeadragon and the global parseWCS(header) from static/main.js

(function () {
  async function ensureSession() {
    try {
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
    return fetch(url, { ...options, headers });
  }
  let overlayElement = null;
  let hasAttachedHandlers = false;

  function ensureOverlayElement() {
    const osdRoot = document.getElementById('openseadragon');
    if (!osdRoot) return null;
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
      overlayElement.innerHTML = '<div class="coord-row coord-val">Value: —</div><div class="coord-row coord-xy">x: —, y: —</div><div class="coord-row coord-ra">RA: —, Dec: —</div>';
      inner.appendChild(overlayElement);
      positionOverlay();
    } else if (!overlayElement.parentElement) {
      const inner2 = osdRoot.querySelector('.openseadragon-container') || osdRoot;
      inner2.appendChild(overlayElement);
      positionOverlay();
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
      if (!window?.fitsData?.filename || requestedWcs) return;
      requestedWcs = true;
      // Use the most reliable path/HDU we have
      const filepath = window.currentFitsFile || window.fitsData.filename;
      const path = filepath; // Do NOT encode; backend route expects raw path
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
      // Derive flip_y if server didn't provide
      if (window.fitsData.flip_y == null) {
        window.fitsData.flip_y = analyzeWcsOrientationJs(normalized);
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


  function updateOverlayText(ix, iy, raDeg, decDeg, pixelValue, unit) {
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
  
    if (xyNode) xyNode.textContent = `x: ${xText}, y: ${yText}`;
  
    if (valNode) {
      const valStr = formatValueForReadout(pixelValue);
      valNode.textContent = valStr !== null ? `${valStr}${unit ? ' ' + unit : ''}` : 'Value: —';
    }
  
    if (isFinite(raDeg) && isFinite(decDeg)) {
      const deg = '°';
      const raStr = `${raDeg.toFixed(6)}${deg}`;
      const decStr = `${decDeg.toFixed(6)}${deg}`;
      if (raNode) raNode.textContent = `RA: ${raStr}, Dec: ${decStr}`;
    } else {
      if (raNode) raNode.textContent = 'RA: —, Dec: —';
    }
  }

  function onMouseMove(evt) {
    const viewer = window.viewer || window.tiledViewer;
    if (!viewer) return;
    const container = viewer.container || document.getElementById('openseadragon');
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const pixel = new OpenSeadragon.Point(evt.clientX - rect.left, evt.clientY - rect.top);
    // Convert pixel (screen) -> viewport point -> image coordinates
    let viewportPoint;
    try {
      viewportPoint = viewer.viewport.pointFromPixel(pixel);
    } catch (e) {
      return;
    }
    const imagePoint = viewer.viewport.viewportToImageCoordinates(viewportPoint);

    let imageX = imagePoint.x;
    let imageY = imagePoint.y;

    // If backend/app indicates a vertical flip was applied for display,
    // adjust the y we pass into pixelsToWorld so RA/Dec are correct.
    const imgHeight = window?.fitsData?.height;
    const flipY = !!(window?.fitsData?.flip_y);
    const yForWorld = (flipY && typeof imgHeight === 'number') ? (imgHeight - 1 - imageY) : imageY;
    const displayX = Math.round(imageX);
    const displayYBottom = Math.round(typeof imgHeight === 'number' ? (imgHeight - 1 - imageY) : imageY);

    let raDeg = NaN;
    let decDeg = NaN;
    const dbg = { hduIndex: window.currentHduIndex, imageX, imageY, yForWorld };
  // Pixel value readout (prefer instant approx, then refine via probe)
  let pixelValue = null;
  let bunit = '';
  try {
    if (typeof window.getBunit === 'function') bunit = window.getBunit();
  } catch (_) {}
  // If direct readout is missing/zero, try precise server probe for current file/HDU.
  // Pass exactly the displayed coordinates (bottom-left origin) to backend.
  if (!(typeof pixelValue === 'number' && isFinite(pixelValue)) || pixelValue === 0) {
    try {
      // Probe with the exact displayed coords (bottom origin to match readout)
      if (!Number.isFinite(displayX) || !Number.isFinite(displayYBottom)) {
        throw new Error('invalid coords');
      }
      const url = `/probe-pixel/?x=${displayX}&y=${displayYBottom}&origin=bottom`;
      if (window._disableProbePixel === true) {
        throw new Error('probe disabled');
      }
      apiFetch(url).then(r => {
        if (!r.ok) {
          window._disableProbePixel = true;
          return null;
        }
        return r.json();
      }).then(data => {
        if (data && typeof data.value === 'number' && isFinite(data.value)) {
          const unitFromSrv = data.unit;
          const valFromSrv = data.value;
          // cache last good value to avoid flicker to 0 when sampling is transient
          window._coordLastValue = { value: valFromSrv, unit: bunit || unitFromSrv, ts: Date.now() };
          updateOverlayText(imageX, imageY, raDeg, decDeg, valFromSrv, bunit || unitFromSrv);
        }
      }).catch(() => {});
    } catch (_) {}
  }
  // Fallback: approximate from overview cache if still missing
  if (!(typeof pixelValue === 'number' && isFinite(pixelValue)) || pixelValue === 0) {
    try {
      const ov = window.histogramOverviewPixelData;
      if (ov && ov.pixels && Array.isArray(ov.pixels)) {
        const scaleX = ov.width / (window?.fitsData?.width || ov.width);
        const scaleY = ov.height / (window?.fitsData?.height || ov.height);
        let ox = Math.max(0, Math.min(ov.width - 1, Math.floor(imageX * scaleX)));
        let oy = Math.max(0, Math.min(ov.height - 1, Math.floor(yForWorld * scaleY)));
        const native = ov.pixels[oy][ox]; // 0-255
        const dataMin = typeof ov.dataMin === 'number' ? ov.dataMin : 0;
        const dataMax = typeof ov.dataMax === 'number' ? ov.dataMax : 1;
        const approx = dataMin + (native / 255.0) * (dataMax - dataMin);
        if (isFinite(approx)) pixelValue = approx;
        //   console.log('[coords_overlay] overview fallback value', { ...dbg, ox, oy, native, approx });
      }
    } catch (_) {}
  }
    const wcs = getParsedWCS();
    if (!wcs) {
      // Try to parse on the fly if missing and we have a header
      if (window?.fitsData?.wcs && typeof window.parseWCS === 'function') {
        const parsed = window.parseWCS(window.fitsData.wcs);
        parsed.__source = window.fitsData.wcs;
        window.parsedWCS = parsed;
      }
    }
    if (wcs && wcs.hasWCS && typeof wcs.pixelsToWorld === 'function') {
      const world = wcs.pixelsToWorld(imageX, yForWorld);
      if (world && isFinite(world.ra) && isFinite(world.dec)) {
        raDeg = world.ra;
        decDeg = world.dec;
      }
    }

    // Fallback if above did not yield valid RA/Dec
    if (!(isFinite(raDeg) && isFinite(decDeg)) && window?.fitsData?.wcs) {
      const world2 = pixelsToWorldFromHeader(window.fitsData.wcs, imageX, yForWorld);
      if (world2 && isFinite(world2.ra) && isFinite(world2.dec)) {
        raDeg = world2.ra;
        decDeg = world2.dec;
      }
    }
  // Stabilize: if no value yet, reuse last one briefly to avoid flicker
  if (!(typeof pixelValue === 'number' && isFinite(pixelValue))) {
    const last = window._coordLastValue;
    if (last && Date.now() - last.ts < 250) {
      pixelValue = last.value;
      if (!bunit && last.unit) bunit = last.unit;
    }
  }
  updateOverlayText(imageX, imageY, raDeg, decDeg, pixelValue, bunit);
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

  function waitForViewerAndInit(attemptsLeft = 10) {
    if (window.viewer || window.tiledViewer) {
      ensureOverlayElement();
      attachHandlers();
      return;
    }
    if (attemptsLeft <= 0) return;
    setTimeout(() => waitForViewerAndInit(attemptsLeft - 1), 250);
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
    document.addEventListener('DOMContentLoaded', () => { waitForViewerAndInit(); requestWcsIfMissing(); });
  } else {
    waitForViewerAndInit();
    requestWcsIfMissing();
  }
})();



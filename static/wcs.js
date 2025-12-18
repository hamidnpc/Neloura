// static/wcs.js
(function () {
    'use strict';
  
    // Label mode comes from settings profiles (no localStorage)
window.WCS_LABEL_MODE = 'sexagesimal';

// WCS enable/disable via settings profiles (cached)
let __wcsEnabled = true;
let __wcsCheckedAt = 0;
function __wcsIsEnabledSync(){ return __wcsEnabled; }
async function __refreshWcsEnabled(){
  try{
    const now = Date.now();
    if (now - __wcsCheckedAt < 5000) return __wcsEnabled;
    __wcsCheckedAt = now;
    const s = (window.__wcsEffective && typeof window.__wcsEffective === 'object') ? window.__wcsEffective : {};
    if (Object.prototype.hasOwnProperty.call(s, 'WCS_ENABLE')) __wcsEnabled = !!s.WCS_ENABLE;
    if (typeof s.WCS_LABEL_MODE === 'string' && (s.WCS_LABEL_MODE === 'degrees' || s.WCS_LABEL_MODE === 'sexagesimal')) {
      window.WCS_LABEL_MODE = s.WCS_LABEL_MODE;
    }
  }catch(_){ }
  return __wcsEnabled;
}

// Global effective-settings cache with single-flight across all callers
if (!window.__effectiveSettingsCache) {
  window.__effectiveSettingsCache = { ttlMs: 15000, lastAt: 0, value: null, inFlight: null };
}
async function getEffectiveSettingsCached(){
  try {
    const c = window.__effectiveSettingsCache;
    const now = performance.now();
    if (c.value && (now - c.lastAt) < c.ttlMs) return c.value;
    if (c.inFlight) return await c.inFlight;
    c.inFlight = (async()=>{
      try {
        if (!window.__sid) {
          const rs = await fetch('/session/start', { credentials: 'same-origin' });
          try { const js = await rs.json(); if (js && js.session_id) window.__sid = js.session_id; } catch(_){ }
        }
        const opts = { credentials: 'same-origin', headers: {} };
        try { if (window.__sid) opts.headers['X-Session-ID'] = window.__sid; } catch(_){ }
        const r = await fetch('/settings/effective', opts);
        if (r.ok) {
          const j = await r.json();
          c.value = (j && j.settings) ? j.settings : {};
          c.lastAt = performance.now();
        }
      } finally {
        c.inFlight = null;
      }
      return c.value || {};
    })();
    return await c.inFlight;
  } catch(_){ return window.__effectiveSettingsCache.value || {}; }
}

// Degree formatters using minimal decimals implied by the 1–2–5 step size
function decimalsForStep(stepDeg) {
  const s = Math.abs(stepDeg);
  if (!isFinite(s) || s <= 0) return 0;
  const exp = Math.floor(Math.log10(s));
  // Number of decimals needed to represent step exactly in decimal (for 1–2–5 × 10^k)
  return Math.max(0, -exp);
}
function formatRAInDegrees(deg, stepDeg) {
  // Normalize RA to [0, 360)
  let d = ((deg % 360) + 360) % 360;
  const dp = Math.min(6, decimalsForStep(stepDeg));
  return `${d.toFixed(dp)}°`;
}
function formatDecInDegrees(deg, stepDeg) {
  const dp = Math.min(6, decimalsForStep(stepDeg));
  const sign = deg < 0 ? '−' : '+';
  const absd = Math.abs(deg);
  return `${sign}${absd.toFixed(dp)}°`;
}

// Unified formatters that respect the current mode
function formatRAUnified(deg, stepDeg) {
  return (window.WCS_LABEL_MODE === 'degrees') ? formatRAInDegrees(deg, stepDeg) : formatRA(deg, stepDeg);
}
function formatDecUnified(deg, stepDeg) {
  return (window.WCS_LABEL_MODE === 'degrees') ? formatDecInDegrees(deg, stepDeg) : formatDec(deg, stepDeg);
}

// Console usage to switch:
// Use Settings UI (WCS_LABEL_MODE) instead of local storage

    // ----- Formatting helpers -----
    function raDegToHmsParts(deg) {
      let hours = ((deg / 15) % 24 + 24) % 24; // wrap 0..24
      const h = Math.floor(hours);
      hours = (hours - h) * 60;
      const m = Math.floor(hours);
      const s = (hours - m) * 60;
      return { h, m, s };
    }
    function decDegToDmsParts(deg) {
      const sign = deg < 0 ? -1 : 1;
      let a = Math.abs(deg);
      const d = Math.floor(a);
      a = (a - d) * 60;
      const m = Math.floor(a);
      const s = (a - m) * 60;
      return { sign, d, m, s };
    }
  
    // Choose a "nice" tick step using a 1–2–5 sequence (incl. 0.5) scaled by powers of 10
    function chooseDegStep(spanDeg, targetTicks = 5) {
      const safeSpan = Math.max(1e-12, Math.abs(spanDeg));
      const rawStep = safeSpan / Math.max(1, targetTicks);
      const exponent = Math.floor(Math.log10(rawStep));
      const base = Math.pow(10, exponent);
      const frac = rawStep / base;
      let niceFrac;
      if (frac <= 1) niceFrac = 1;
      else if (frac <= 2) niceFrac = 2;
      else if (frac <= 5) niceFrac = 5;
      else niceFrac = 10;
      const step = niceFrac * base; // yields ..., 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, ...
      return Math.max(step, 1e-6);
    }
  
    // Adaptive label formatting based on tick step (in degrees)
    function formatRA(deg, stepDeg) {
      const { h, m, s } = raDegToHmsParts(deg);
      // thresholds (deg): 0.0041667 ≈ 15 arcsec, 0.25 ≈ 15 arcmin
      if (stepDeg <= 0.01) { // show seconds
        return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${s.toFixed(2).padStart(5,'0')}`;
      } else if (stepDeg <= 0.25) { // show minutes
        return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
      }
      return `${String(h).padStart(2,'0')}`; // hours only
    }
    function formatDec(deg, stepDeg) {
      const { sign, d, m, s } = decDegToDmsParts(deg);
      const sgn = sign < 0 ? '-' : '+';
      // thresholds: 0.0166667 ≈ 1 arcmin
      if (stepDeg <= 1/60) { // show seconds
        return `${sgn}${String(d).padStart(2,'0')}:${String(m).padStart(2,'0')}:${s.toFixed(1).padStart(4,'0')}`;
      } else if (stepDeg <= 1) { // show minutes
        return `${sgn}${String(d).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
      }
      return `${sgn}${String(d).padStart(2,'0')}`; // degrees only
    }
  
    // ----- Minimal linear WCS from window.fitsData.wcs -----
// Prefer full WCS from coords_overlay (parsedWCS + worldToPixel/pixelToWorld).
// Falls back to linear CD if those globals are not available.

function getImageSizeFromViewer(v) {
    try {
      if (v && v.world && v.world.getItemCount() > 0) {
        const sz = v.world.getItemAt(0).getContentSize();
        return { width: sz.x, height: sz.y };
      }
    } catch(_) {}
    if (window.fitsData && isFinite(window.fitsData.width) && isFinite(window.fitsData.height)) {
      return { width: window.fitsData.width, height: window.fitsData.height };
    }
    return { width: 0, height: 0 };
  }

function buildLinearWcsTransform() {
    const hasParsed = !!(window.parsedWCS &&
                         window.parsedWCS.hasWCS === true &&
                         typeof window.parsedWCS.worldToPixels === 'function' &&
                         typeof window.parsedWCS.pixelsToWorld === 'function');
  
    // Utility: RA wrap-safe difference in degrees (-180..+180)
    const raDiff = (a, b) => {
      let d = a - b;
      while (d > 180) d -= 360;
      while (d < -180) d += 360;
      return d;
    };
  
    if (hasParsed) {
        const parsed = window.parsedWCS;
        const imgSize = getImageSizeFromViewer(window.tiledViewer || window.viewer);
        const H = imgSize.height;
      
        // Build candidates: invert vs direct, with optional center/edge offsets
        const makeMap = (invert, offset) => ({
          toFitsY: (yTL) => {
            const y = invert ? (H > 0 ? (H - 1) - yTL : yTL) : yTL;
            return y + offset;
          },
          fromFitsY: (yBL) => {
            const y = (yBL - offset);
            return invert ? (H > 0 ? (H - 1) - y : y) : y;
          },
          name: `${invert ? 'invert' : 'direct'}(${offset >= 0 ? '+' : ''}${offset})`
        });
      
        // Try common conventions (no offset, center +0.5; both invert and direct)
        const candidates = [
          makeMap(true, 0),    // invert(H-1-y)
          makeMap(true, 0.5),  // invert + 0.5
          makeMap(false, 0),   // direct(y)
          makeMap(false, 0.5), // direct + 0.5
        ];
      
        // Score mapping by img->world->img round-trip at corners+center
        const P = OpenSeadragon.Point;
        const getBaseTiledImage = (viewerInstance) => {
          try {
            if (viewerInstance && viewerInstance.world && typeof viewerInstance.world.getItemCount === 'function') {
              const count = viewerInstance.world.getItemCount();
              if (count > 0) {
                const base = viewerInstance.world.getItemAt(0);
                if (base && typeof base.viewerElementToImageCoordinates === 'function') {
                  return base;
                }
              }
            }
          } catch (_) {}
          return null;
        };

        const scoreMap = (map) => {
          const v = window.tiledViewer || window.viewer;
          const baseItem = getBaseTiledImage(v);
          if (!baseItem) {
            console.warn('[WCS] Base tiled image not ready for scoreMap; skipping.');
            return Number.POSITIVE_INFINITY;
          }

          const toImg = (px, py) => {
            const pt = baseItem.viewerElementToImageCoordinates(new P(px, py));
            return { x: pt.x, y: pt.y };
          };
          const rect = (v && v.container) ? v.container.getBoundingClientRect() : { width: 1000, height: 600 };
          const W = rect.width, HH = rect.height;
          const samples = [toImg(0,0), toImg(W,0), toImg(0,HH), toImg(W,HH), toImg(W/2,HH/2)];
      
          let err = 0;
          for (const s of samples) {
            const yF = map.toFitsY(s.y);
            const w = parsed.pixelsToWorld(s.x, yF);
            if (!w || !isFinite(w.ra) || !isFinite(w.dec)) return Number.POSITIVE_INFINITY;
            const p = parsed.worldToPixels(w.ra, w.dec);
            if (!p || !isFinite(p.x) || !isFinite(p.y)) return Number.POSITIVE_INFINITY;
            const yBack = map.fromFitsY(p.y);
            err += Math.hypot((p.x - s.x), (yBack - s.y));
          }
          return err / samples.length;
        };
      
        let best = candidates[0], bestErr = Infinity;
        for (const c of candidates) {
          const e = scoreMap(c);
          if (e < bestErr) { bestErr = e; best = c; }
        }
        // console.log('[WCS] H=', H, 'chosen map:', best && best.name, 'avgRTerr=', isFinite(bestErr) ? bestErr.toFixed(3) : '∞', 'px');
      
        const parsedPixelToWorld = (xTL, yTL) => {
          const yF = best.toFitsY(yTL);
          const w = parsed.pixelsToWorld(xTL, yF);
          if (!w || !isFinite(w.ra) || !isFinite(w.dec)) return { ra: NaN, dec: NaN };
          return { ra: w.ra, dec: w.dec };
        };
        const parsedWorldToPixel = (raDeg, decDeg) => {
          const p = parsed.worldToPixels(raDeg, decDeg);
          if (!p || !isFinite(p.x) || !isFinite(p.y)) return { x: NaN, y: NaN };
          return { x: p.x, y: best.fromFitsY(p.y) };
        };

        // If sampling failed, fall back to linear WCS below
        if (!isFinite(bestErr) || bestErr === Infinity) {
          // no return; continue to linear path
        } else {
          function solveXForRaAtY_full(raTargetDeg, yConstTL, xSpanImg) {
          const x0 = xSpanImg.min, x1 = xSpanImg.max;
          const w0 = parsedPixelToWorld(x0, yConstTL);
          const w1 = parsedPixelToWorld(x1, yConstTL);
          let decLo = Math.min(w0.dec, w1.dec) - 0.5;
          let decHi = Math.max(w0.dec, w1.dec) + 0.5;
          for (let i = 0; i < 30; i++) {
            const mid = 0.5 * (decLo + decHi);
            const pMid = parsedWorldToPixel(raTargetDeg, mid);
            if (!isFinite(pMid.y)) break;
            if ((pMid.y - yConstTL) > 0) decHi = mid; else decLo = mid;
          }
          const decSol = 0.5 * (decLo + decHi);
          const p = parsedWorldToPixel(raTargetDeg, decSol);
          return p.x;
          }
        
          function solveYForDecAtX_full(decTargetDeg, xConstImg, ySpanImg) {
          const y0 = ySpanImg.min, y1 = ySpanImg.max;
          const w0 = parsedPixelToWorld(xConstImg, y0);
          const w1 = parsedPixelToWorld(xConstImg, y1);
          let raLo = Math.min(w0.ra, w1.ra) - 0.5;
          let raHi = Math.max(w0.ra, w1.ra) + 0.5;
          for (let i = 0; i < 30; i++) {
            let mid = 0.5 * (raLo + raHi);
            if (raHi - raLo > 180) {
              const d = (raHi - raLo + 540) % 360 - 180;
              mid = raLo + d / 2;
            }
            const pMid = parsedWorldToPixel(mid, decTargetDeg);
            if (!isFinite(pMid.x)) break;
            if ((pMid.x - xConstImg) > 0) raHi = mid; else raLo = mid;
          }
          const raSol = 0.5 * (raLo + raHi);
          const p = parsedWorldToPixel(raSol, decTargetDeg);
          return p.y;
          }
        
          return {
            pixelToWorld: (x, y) => parsedPixelToWorld(x, y),
            _solveXForRaAtY_full: solveXForRaAtY_full,
            _solveYForDecAtX_full: solveYForDecAtX_full,
            useFull: true
          };
        }
      }
  
    // Fallback: your existing linear CD path (kept as-is)
    const w = (window.fitsData && window.fitsData.wcs) ? window.fitsData.wcs : null;
    if (!w) return null;
  
    const crval1 = Number(w.ra_ref ?? w.CRVAL1 ?? w.crval1 ?? 0);
    const crval2 = Number(w.dec_ref ?? w.CRVAL2 ?? w.crval2 ?? 0);
    const crpix1 = Number(w.x_ref ?? w.CRPIX1 ?? w.crpix1 ?? 0);
    const crpix2 = Number(w.y_ref ?? w.CRPIX2 ?? w.crpix2 ?? 0);
  
    const cd = (() => {
      const hasCD = [w.CD1_1, w.CD1_2, w.CD2_1, w.CD2_2].some(v => isFinite(Number(v)));
      if (hasCD) return {
        cd11: Number(w.CD1_1 ?? 0), cd12: Number(w.CD1_2 ?? 0),
        cd21: Number(w.CD2_1 ?? 0), cd22: Number(w.CD2_2 ?? 0),
      };
      const hasPC = [w.PC1_1, w.PC1_2, w.PC2_1, w.PC2_2].every(v => typeof v !== 'undefined');
      const cdelt1 = Number(w.CDELT1 ?? 0), cdelt2 = Number(w.CDELT2 ?? 0);
      if (hasPC) {
        const pc11 = Number(w.PC1_1 ?? 1), pc12 = Number(w.PC1_2 ?? 0);
        const pc21 = Number(w.PC2_1 ?? 0), pc22 = Number(w.PC2_2 ?? 1);
        return {
          cd11: pc11 * cdelt1, cd12: pc12 * cdelt1,
          cd21: pc21 * cdelt2, cd22: pc22 * cdelt2,
        };
      }
      const thetaDeg = Number(w.CROTA2 ?? w.CROTA1 ?? 0);
      if (isFinite(thetaDeg)) {
        const th = thetaDeg * Math.PI / 180, c = Math.cos(th), s = Math.sin(th);
        return { cd11: cdelt1 * c, cd12: -cdelt2 * s, cd21: cdelt1 * s, cd22: cdelt2 * c };
      }
      return { cd11: cdelt1, cd12: 0, cd21: 0, cd22: cdelt2 };
    })();
  
    const { cd11, cd12, cd21, cd22 } = cd;
    if (![crval1, crval2, crpix1, crpix2, cd11, cd12, cd21, cd22].every(isFinite)) return null;
  
    function pixelToWorld_lin(x, y) {
      const dx = x - crpix1, dy = y - crpix2;
      return { ra: crval1 + cd11 * dx + cd12 * dy, dec: crval2 + cd21 * dx + cd22 * dy };
    }
    function solveXForRaAtY_lin(raTarget, yConst) {
      const dy = yConst - crpix2;
      const num = raTarget - crval1 - cd12 * dy;
      if (Math.abs(cd11) < 1e-16) return NaN;
      return crpix1 + num / cd11;
    }
    function solveYForDecAtX_lin(decTarget, xConst) {
      const dx = xConst - crpix1;
      const num = decTarget - crval2 - cd21 * dx;
      if (Math.abs(cd22) < 1e-16) return NaN;
      return crpix2 + num / cd22;
    }
  
    return {
      pixelToWorld: pixelToWorld_lin,
      solveXForRaAtY: solveXForRaAtY_lin,
      solveYForDecAtX: solveYForDecAtX_lin,
      useFull: false
    };
  }
  
    function createAxesCanvas(container) {
      const c = document.createElement('canvas');
      c.id = 'wcs-axes-overlay';
      Object.assign(c.style, {
        position: 'absolute',
        left: '0',
        top: '0',
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: '1200'
      });
      container.appendChild(c);
      return c;
    }
  

    function attachWcsAxes(viewer) {
        if (!viewer || !viewer.viewport) { console.warn('[WCS Axes] Viewer not ready.'); return; }
        const container = viewer.container || document.querySelector('.openseadragon-container');
        if (!container) return;
      
        const overlay = document.getElementById('wcs-axes-overlay') || (function make(parent){
          const c = document.createElement('canvas');
          c.id = 'wcs-axes-overlay';
          Object.assign(c.style, {position:'absolute',left:'0',top:'0',width:'100%',height:'100%',pointerEvents:'none',zIndex:'1200'});
          parent.appendChild(c); return c;
        })(container);
        const ctx = overlay.getContext('2d');
      
        const P = OpenSeadragon.Point;
        const warnMissingBase = () => {
          if (!viewer.__wcsBaseWarned) {
            console.warn('[WCS Axes] Base tiled image not ready; skipping transform to avoid multi-image warnings.');
            viewer.__wcsBaseWarned = true;
          }
        };
        const getPrimaryTiledImage = () => {
          try {
            if (viewer.world && typeof viewer.world.getItemCount === 'function') {
              const count = viewer.world.getItemCount();
              if (count > 0) {
                const base = viewer.world.getItemAt(0);
                if (base && typeof base.viewerElementToImageCoordinates === 'function') {
                  viewer.__wcsBaseWarned = false;
                  return base;
                }
              }
            }
          } catch (_) {}
          warnMissingBase();
          return null;
        };
        const toImg = (px, py) => {
          const baseItem = getPrimaryTiledImage();
          if (!baseItem) return null;
          const pt = baseItem.viewerElementToImageCoordinates(new P(px, py));
          return { x: pt.x, y: pt.y };
        };
        const imgToScreen = (x, y) => {
          const baseItem = getPrimaryTiledImage();
          if (!baseItem) return null;
          const p = baseItem.imageToViewerElementCoordinates(new P(x, y));
          return { x: p.x, y: p.y };
        };
        const getImgSize = () => {
          try {
            const baseItem = getPrimaryTiledImage();
            if (baseItem) {
              const sz = baseItem.getContentSize();
              return { width: sz.x, height: sz.y };
            }
          } catch(_) {}
          if (window.fitsData && isFinite(window.fitsData.width) && isFinite(window.fitsData.height)) {
            return { width: window.fitsData.width, height: window.fitsData.height };
          }
          return { width: 0, height: 0 };
        };
      
        // WCS and safe pixel->world wrapper (fixes TL↔BL mismatch in fallback)
        const baseWcs = buildLinearWcsTransform();
        if (!baseWcs) {
          // Log once per viewer instance to reduce console spam
          if (!viewer.__wcsWarned) {
            console.warn('[WCS Axes] No WCS info available; axes disabled.');
            viewer.__wcsWarned = true;
          }
          return;
        }
        const imgSz = getImgSize();
        const Himg = Math.max(0, (imgSz.height || 0) - 1);
        const pixelToWorldTL = (x, y) => {
          if (baseWcs.useFull) return baseWcs.pixelToWorld(x, y);
          // fallback (linear CD): FITS BL origin -> flip TL y
          const yFits = Himg > 0 ? (Himg - y) : y;
          return baseWcs.pixelToWorld(x, yFits);
        };
      
        function resizeCanvas() {
        const dpr = Math.min(4, window.devicePixelRatio || 1);
          const rect = container.getBoundingClientRect();
          overlay.width = Math.round(rect.width * dpr);
          overlay.height = Math.round(rect.height * dpr);
          overlay.style.width = `${rect.width}px`;
          overlay.style.height = `${rect.height}px`;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
      
        // Sample along top/left borders and interpolate tick positions
        const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
        function sampleTopRA(x0, x1, yConst, n = 400) {
          const ix0 = 0, ix1 = Math.max(0, (imgSz.width || 0) - 1);
          const iy0 = 0, iy1 = Math.max(0, (imgSz.height || 0) - 1);
          const yC = clamp(yConst, iy0, iy1);
          const xs = [], ras = [];
          for (let i = 0; i < n; i++) {
            const t = i / (n - 1);
            const x = clamp(x0 + t * (x1 - x0), ix0, ix1);
            const w = pixelToWorldTL(x, yC);
            xs.push(x); ras.push(w.ra);
          }
          for (let i = 1; i < ras.length; i++) {
            let d = ras[i] - ras[i - 1];
            if (d > 180) ras[i] -= 360; else if (d < -180) ras[i] += 360;
          }
          return { xs, ras };
        }
        function sampleLeftDec(y0, y1, xConst, n = 400) {
          const ix0 = 0, ix1 = Math.max(0, (imgSz.width || 0) - 1);
          const iy0 = 0, iy1 = Math.max(0, (imgSz.height || 0) - 1);
          const xC = clamp(xConst, ix0, ix1);
          const ys = [], decs = [];
          for (let i = 0; i < n; i++) {
            const t = i / (n - 1);
            const y = clamp(y0 + t * (y1 - y0), iy0, iy1);
            const w = pixelToWorldTL(xC, y);
            ys.push(y); decs.push(w.dec);
          }
          return { ys, decs };
        }
        function interpXForRA(sample, raTarget) {
          const { xs, ras } = sample;
          for (let i = 1; i < xs.length; i++) {
            const a = ras[i - 1], b = ras[i];
            if ((a <= raTarget && raTarget <= b) || (b <= raTarget && raTarget <= a)) {
              const t = (raTarget - a) / (b - a || 1);
              return xs[i - 1] + t * (xs[i] - xs[i - 1]);
            }
          }
          return NaN;
        }
        function interpYForDec(sample, decTarget) {
          const { ys, decs } = sample;
          for (let i = 1; i < ys.length; i++) {
            const a = decs[i - 1], b = decs[i];
            if ((a <= decTarget && decTarget <= b) || (b <= decTarget && decTarget <= a)) {
              const t = (decTarget - a) / (b - a || 1);
              return ys[i - 1] + t * (ys[i] - ys[i - 1]);
            }
          }
          return NaN;
        }
      
        async function draw() {
          // Check enable and hide overlay if disabled
          try {
            const enabled = !!(window.__wcsEffective ? window.__wcsEffective.WCS_ENABLE : true);
            overlay.style.display = enabled ? 'block' : 'none';
            if (!enabled) return;
          } catch(_){ }
          resizeCanvas();
          ctx.clearRect(0, 0, overlay.width, overlay.height);
      
          const rect = container.getBoundingClientRect();
          const W = rect.width, H = rect.height;
          if (W < 2 || H < 2) return;

          const tl = toImg(0, 0), br = toImg(W, H);
          if (!tl || !br) return;
          let xL = tl.x, yT = tl.y, xR = br.x, yB = br.y;
          if (![xL, yT, xR, yB].every(isFinite)) return;

          // clamp to image
          const ix0 = 0, ix1 = Math.max(0, (imgSz.width || 0) - 1);
          const iy0 = 0, iy1 = Math.max(0, (imgSz.height || 0) - 1);
          const xLc = clamp(xL, ix0, ix1), xRc = clamp(xR, ix0, ix1);
          const yTc = clamp(yT, iy0, iy1), yBc = clamp(yB, iy0, iy1);

          // sample and build ranges
          const topS = sampleTopRA(xLc, xRc, yTc, 400);
          const leftS = sampleLeftDec(yTc, yBc, xLc, 400);
          const raMin = Math.min(topS.ras[0], topS.ras[topS.ras.length - 1]);
          const raMax = Math.max(topS.ras[0], topS.ras[topS.ras.length - 1]);
          const decMin = Math.min(leftS.decs[0], leftS.decs[leftS.decs.length - 1]);
          const decMax = Math.max(leftS.decs[0], leftS.decs[leftS.decs.length - 1]);
          const raStep = chooseDegStep(Math.max(1e-9, raMax - raMin), 4);
          const decStep = chooseDegStep(Math.max(1e-9, decMax - decMin), 4);
          const raStart = Math.ceil(raMin / raStep) * raStep;
          const decStart = Math.ceil(decMin / decStep) * decStep;

          // axes box
          ctx.save();
          try { ctx.strokeStyle = (window.__wcsEffective && window.__wcsEffective.WCS_AXIS_COLOR) || 'rgba(115,26,84,0.8)'; } catch(_) { ctx.strokeStyle = 'rgba(115,26,84,0.8)'; }
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, 0.5); ctx.lineTo(W, 0.5);
          ctx.moveTo(0.5, 0); ctx.lineTo(0.5, H);
          ctx.moveTo(0, H - 0.5); ctx.lineTo(W, H - 0.5);
          ctx.moveTo(W - 0.5, 0); ctx.lineTo(W - 0.5, H);
          ctx.stroke();
          ctx.restore();

          // RA ticks
          ctx.font = '12px Arial';
          ctx.textBaseline = 'top';
          for (let ra = raStart; ra <= raMax + 1e-12; ra += raStep) {
            const xi = interpXForRA(topS, ra);
            if (!isFinite(xi)) continue;
            const sc = imgToScreen(xi, yTc);
            if (!sc || sc.x < -20 || sc.x > W + 20) continue;
      
            ctx.beginPath(); ctx.moveTo(sc.x, 0); ctx.lineTo(sc.x, 8);
            try { ctx.strokeStyle = (window.__wcsEffective && window.__wcsEffective.WCS_TICK_COLOR) || 'rgba(91,48,75,0.8)'; } catch(_) { ctx.strokeStyle = 'rgba(91,48,75,0.8)'; }
            ctx.stroke();

            const label = formatRAUnified(ra, raStep);
            const m = ctx.measureText(label);
            ctx.save();
            try { ctx.fillStyle = (window.__wcsEffective && window.__wcsEffective.WCS_LABEL_BG_COLOR) || 'rgba(0,0,0,0.15)'; } catch(_) { ctx.fillStyle = 'rgba(0,0,0,0.15)'; }
            ctx.fillRect(sc.x - m.width / 2 - 3, 10, m.width + 6, 16);
            ctx.restore();
            try { ctx.fillStyle = (window.__wcsEffective && window.__wcsEffective.WCS_LABEL_TEXT_COLOR) || '#9d5281'; } catch(_) { ctx.fillStyle = '#9d5281'; }
            ctx.fillText(label, sc.x - m.width / 2, 12);

            ctx.beginPath(); ctx.moveTo(sc.x, H); ctx.lineTo(sc.x, H - 8);
            try { ctx.strokeStyle = (window.__wcsEffective && window.__wcsEffective.WCS_TICK_COLOR) || 'rgba(91,48,75,0.8)'; } catch(_) { ctx.strokeStyle = 'rgba(91,48,75,0.8)'; }
            ctx.stroke();
          }
      
          // Dec ticks
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'left';
          for (let dec = decStart; dec <= decMax + 1e-12; dec += decStep) {
            const yi = interpYForDec(leftS, dec);
            if (!isFinite(yi)) continue;
            const sc = imgToScreen(xLc, yi);
            if (!sc || sc.y < -20 || sc.y > H + 20) continue;
      
            ctx.beginPath(); ctx.moveTo(0, sc.y); ctx.lineTo(8, sc.y);
            try { ctx.strokeStyle = (window.__wcsEffective && window.__wcsEffective.WCS_TICK_COLOR) || 'rgba(91,48,75,0.8)'; } catch(_) { ctx.strokeStyle = 'rgba(91,48,75,0.8)'; }
            ctx.stroke();

            const label = formatDecUnified(dec, decStep);
            const m = ctx.measureText(label);
            ctx.save();
            try { ctx.fillStyle = (window.__wcsEffective && window.__wcsEffective.WCS_LABEL_BG_COLOR) || 'rgba(0,0,0,0.15)'; } catch(_) { ctx.fillStyle = 'rgba(0,0,0,0.15)'; }
            ctx.fillRect(12, sc.y - 8, m.width + 6, 16);
            ctx.restore();
            try { ctx.fillStyle = (window.__wcsEffective && window.__wcsEffective.WCS_LABEL_TEXT_COLOR) || '#9d5281'; } catch(_) { ctx.fillStyle = '#9d5281'; }
            ctx.fillText(label, 15, sc.y);

            ctx.beginPath(); ctx.moveTo(W, sc.y); ctx.lineTo(W - 8, sc.y);
            try { ctx.strokeStyle = (window.__wcsEffective && window.__wcsEffective.WCS_TICK_COLOR) || 'rgba(91,48,75,0.8)'; } catch(_) { ctx.strokeStyle = 'rgba(91,48,75,0.8)'; }
            ctx.stroke();
          }
        }
      
// Replace existing schedule() with this
        let rafId = null;
        let lastDrawMs = 0;
        const MIN_FRAME_MS =120; // ~16.6ms = 60fps; set 60–100ms for heavy files

        function schedule() {
        const now = performance.now();
        if (rafId || (now - lastDrawMs) < MIN_FRAME_MS) return;
        rafId = requestAnimationFrame(() => {
            rafId = null;
            lastDrawMs = performance.now();
            draw();
        });
        }
        // Helper: load WCS effective settings with single-flight + short TTL cache
        let __wcsFetchInFlight = null;
        let __wcsEffectiveFetchedAt = 0;
        const WCS_EFFECTIVE_TTL_MS = 3000;
        async function refreshWcsEffective() {
          const now = performance.now();
          try {
            if (window.__wcsEffective && (now - __wcsEffectiveFetchedAt) < WCS_EFFECTIVE_TTL_MS) {
              return window.__wcsEffective;
            }
            if (__wcsFetchInFlight) return __wcsFetchInFlight;
            __wcsFetchInFlight = (async () => {
              try {
                if (!window.__sid) {
                  const rs = await fetch('/session/start', { credentials: 'same-origin' });
                  try { const js = await rs.json(); if (js && js.session_id) window.__sid = js.session_id; } catch(_){ }
                }
                const opts = { credentials: 'same-origin', headers: {} };
                try { if (window.__sid) opts.headers['X-Session-ID'] = window.__sid; } catch(_){ }
                const r = await fetch('/settings/effective', opts);
                if (r.ok) {
                  const j = await r.json();
                  window.__wcsEffective = j.settings || {};
                  __wcsEffectiveFetchedAt = performance.now();
                  const m = window.__wcsEffective.WCS_LABEL_MODE;
                  if (m === 'degrees' || m === 'sexagesimal') window.WCS_LABEL_MODE = m;
                }
              } finally {
                __wcsFetchInFlight = null;
              }
              return window.__wcsEffective || {};
            })();
            return __wcsFetchInFlight;
          } catch(_){ return window.__wcsEffective || {}; }
        }

        // Throttle expensive redraws
        const debouncedSchedule = (()=>{
          let rafId=null, last=0; const MIN_MS=180; return function(){ const now=performance.now(); if (rafId || (now-last)<MIN_MS) return; rafId=requestAnimationFrame(()=>{ rafId=null; last=performance.now(); schedule(); }); };
        })();
        viewer.addHandler('open', debouncedSchedule);
        viewer.addHandler('animation-finish', debouncedSchedule);
        viewer.addHandler('resize', debouncedSchedule);
        window.addEventListener('resize', schedule);
        // One-time global settings bridge (prevents duplicate fetches/listeners on re-attach)
        if (!window.__wcsSettingsInit) {
          window.__wcsSettingsInit = true;
          // Initial settings load
          refreshWcsEffective().then(()=>debouncedSchedule());
          // React to settings updates: invalidate cache and refetch once
          const onSettingsUpdated = (ev)=>{
            try {
              // If a delta is provided, apply it locally and redraw without network
              const delta = ev && ev.detail && ev.detail.settingsDelta ? ev.detail.settingsDelta : null;
              if (delta && typeof delta === 'object') {
                window.__wcsEffective = { ...(window.__wcsEffective||{}), ...delta };
                try {
                  if (typeof delta.WCS_LABEL_MODE === 'string') {
                    window.WCS_LABEL_MODE = delta.WCS_LABEL_MODE;
                  }
                } catch(_){ }
                debouncedSchedule();
                return;
              }
            } catch(_){ }
            // Fallback: fetch once if no delta available
            try {
              window.__wcsEffective = null;
              if (window.__effectiveSettingsCache) {
                window.__effectiveSettingsCache.value = null;
                window.__effectiveSettingsCache.lastAt = 0;
              }
            } catch(_){ }
            refreshWcsEffective().then(()=>debouncedSchedule());
          };
          document.addEventListener('settings:updated', onSettingsUpdated);
          window.__wcsOnSettingsUpdated = onSettingsUpdated;
        }
      
        window.updateWcsAxes = schedule;
      }

  
    // Safe helper: can be called from console
    function attachWcsAxesSafe(v) {
      const tryGet = () => v || window.tiledViewer || window.viewer || null;
      let viewer = tryGet();
      if (viewer && viewer.addHandler && viewer.viewport) {
        attachWcsAxes(viewer);
        return;
      }
      const start = Date.now();
      const timer = setInterval(() => {
        viewer = tryGet();
        if (viewer && viewer.addHandler && viewer.viewport) {
          clearInterval(timer);
          attachWcsAxes(viewer);
        } else if (Date.now() - start > 5000) {
          clearInterval(timer);
          console.warn('[WCS Axes] Viewer not found within timeout.');
        }
      }, 200);
    }
  
    window.attachWcsAxes = attachWcsAxes;
    window.attachWcsAxesSafe = attachWcsAxesSafe;
    window.__buildWcs = buildLinearWcsTransform;
  })();


  window.__wcsProbe = function () {
    const v = window.tiledViewer || window.viewer;
    if (!v || !window.parsedWCS) { console.warn('viewer/parsedWCS missing'); return; }
    const rect = v.container.getBoundingClientRect();
    const P = OpenSeadragon.Point;
    const toImg = (px, py) => {
      if (v.viewport.viewerElementToImageCoordinates) {
        const pt = v.viewport.viewerElementToImageCoordinates(new P(px, py));
        return { x: pt.x, y: pt.y };
      }
      const vp = v.viewport.pointFromPixel(new P(px, py));
      const ip = v.viewport.viewportToImageCoordinates(vp);
      return { x: ip.x, y: ip.y };
    };
    const c = toImg(rect.width/2, rect.height/2);
    const wcs = window.__buildWcs();
    if (!wcs) { console.warn('no WCS'); return; }
    const w = wcs.pixelToWorld(c.x, c.y);
    console.log('[WCS Probe] img=', c, 'world=', w, 'useFull=', wcs.useFull);
  };
  
  window.__wcsCompareMaps = function () {
    // Compares invert(H-1-y), invert+0.5, direct, direct+0.5 errors; logs table
    // (reuses the candidates and scoreMap from buildLinearWcsTransform)
    console.log('Rerun buildLinearWcsTransform to see chosen mapping in the console.');
  };

  // Single-flight waiter to avoid multiple concurrent timers
  let __wcsAwaitTimer = null;
  window.attachWcsAxesWhenReady = function (v, timeoutMs = 5000, pollMs = 400) {
    if (__wcsAwaitTimer) return; // already waiting/attaching

    const start = Date.now();
    const viewer = v || window.tiledViewer || window.viewer;
    const hasAnyWcs = !!(window.parsedWCS || (window.fitsData && window.fitsData.wcs));

    // If neither viewer nor any WCS header is present yet, defer to events instead of polling
    if (!viewer || !hasAnyWcs) {
      const onReady = () => {
        document.removeEventListener('wcs:ready', onReady);
        document.removeEventListener('viewer:open', onReady);
        // Retry once things are signaled ready
        window.attachWcsAxesWhenReady(v, timeoutMs, pollMs);
      };
      document.addEventListener('wcs:ready', onReady, { once: true });
      document.addEventListener('viewer:open', onReady, { once: true });
      return;
    }

    __wcsAwaitTimer = setInterval(() => {
      const hasWcs = !!(window.parsedWCS || (window.fitsData && window.fitsData.wcs));
      const curViewer = v || window.tiledViewer || window.viewer;
      if (hasWcs && curViewer && curViewer.viewport) {
        clearInterval(__wcsAwaitTimer); __wcsAwaitTimer = null;
        attachWcsAxes(curViewer);
        if (window.updateWcsAxes) window.updateWcsAxes();
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(__wcsAwaitTimer); __wcsAwaitTimer = null;
        // Warn only when viewer is ready but WCS is still missing
        if (curViewer && curViewer.viewport && !hasWcs) {
          console.warn('[WCS Axes] timed out waiting for WCS');
        }
        // Otherwise stay quiet to avoid log spam when neither is ready
      }
    }, Math.max(200, pollMs));
  };

  // Removed invalid WCS_FORCE override block that referenced out-of-scope variables

  // Idempotent auto-attach so axes always show without manual retries
(function setupWcsAutoAttach() {
    if (window.__wcsAutoInit) return;
    window.__wcsAutoInit = true;
  
    // Debounced ensure
    let t = null;
    const ensure = () => {
      if (t) cancelAnimationFrame(t);
      t = requestAnimationFrame(() => {
        if (typeof window.attachWcsAxesWhenReady === 'function') {
          attachWcsAxesWhenReady();
        } else if (typeof window.attachWcsAxesSafe === 'function') {
          attachWcsAxesSafe();
        }
      });
    };
  
    // Attach when WCS becomes ready (listen to both naming variants on both targets)
    document.addEventListener('wcs:ready', ensure);
    document.addEventListener('wcs-ready', ensure);
    window.addEventListener('wcs:ready', ensure);
    window.addEventListener('wcs-ready', ensure);
    // Attach when a FITS is opened (fire this where you open files)
    document.addEventListener('fits:opened', ensure);
    // Attach when viewer signals open (emit once in your viewer 'open' handler)
    document.addEventListener('viewer:open', ensure);
  
    // If your code doesn’t dispatch events yet, keep a short fallback poll
    let tries = 0;
    const poll = setInterval(() => {
      const hasViewer = !!(window.tiledViewer && window.tiledViewer.viewport);
      const hasWcs = !!window.parsedWCS || !!(window.fitsData && window.fitsData.wcs);
      if (hasViewer && hasWcs) {
        clearInterval(poll);
        ensure();
      } else if (++tries > 50) { // ~10s
        clearInterval(poll);
      }
    }, 200);
  
    // Re-attach if the viewer gets replaced (common on new FITS)
    const host = document.querySelector('.openseadragon-container') || document;
    const mo = new MutationObserver(() => ensure());
    mo.observe(host, { childList: true, subtree: true });
  
    // One-time hook: if you have access to viewer, fire event when it opens
    const tryHookViewer = () => {
      const v = window.tiledViewer || window.viewer;
      if (v && v.addHandler && !v.__wcsHooked) {
        v.__wcsHooked = true;
        v.addHandler('open', () => document.dispatchEvent(new CustomEvent('viewer:open')));
      }
    };
    tryHookViewer();
    const hookPoll = setInterval(() => {
      tryHookViewer();
      if (window.tiledViewer || window.viewer) clearInterval(hookPoll);
    }, 200);
  })();
// catalog_webgl.js - WebGL point renderer for catalogs
//
// Renders catalog points in image-pixel coordinates on top of OpenSeadragon.
// - Upload buffers once per catalog overlay update
// - On pan/zoom: update transform uniforms and draw (no per-point JS loop)
// - Optional picking via offscreen render + readPixels (WebGL2 preferred)

(function () {
  'use strict';

  try {
    // This log is intentionally loud so you can verify the file is actually loaded.
    console.log('[WebGL] catalog_webgl.js loaded');
  } catch (_) {}

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function parseColorToRgba8(input, fallback) {
    const fb = fallback || [255, 0, 0, 255];
    try {
      if (!input) return fb;
      const s = String(input).trim();
      if (!s) return fb;
      if (s === 'transparent') return [0, 0, 0, 0];
      if (s.startsWith('#')) {
        const hex = s.slice(1);
        if (hex.length === 3) {
          const r = parseInt(hex[0] + hex[0], 16);
          const g = parseInt(hex[1] + hex[1], 16);
          const b = parseInt(hex[2] + hex[2], 16);
          return [r, g, b, 255];
        }
        if (hex.length === 6 || hex.length === 8) {
          const r = parseInt(hex.slice(0, 2), 16);
          const g = parseInt(hex.slice(2, 4), 16);
          const b = parseInt(hex.slice(4, 6), 16);
          const a = (hex.length === 8) ? parseInt(hex.slice(6, 8), 16) : 255;
          return [r, g, b, a];
        }
      }
      // rgba(r,g,b,a)
      const m = s.match(/rgba?\s*\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)/i);
      if (m) {
        const r = clamp(Math.round(Number(m[1])), 0, 255);
        const g = clamp(Math.round(Number(m[2])), 0, 255);
        const b = clamp(Math.round(Number(m[3])), 0, 255);
        const a = (typeof m[4] === 'undefined') ? 255 : clamp(Math.round(Number(m[4]) * 255), 0, 255);
        return [r, g, b, a];
      }
      return fb;
    } catch (_) {
      return fb;
    }
  }

  function createShader(gl, type, source) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, source);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const msg = gl.getShaderInfoLog(sh) || 'shader compile failed';
      gl.deleteShader(sh);
      throw new Error(msg);
    }
    return sh;
  }

  function createProgram(gl, vsSrc, fsSrc) {
    const vs = createShader(gl, gl.VERTEX_SHADER, vsSrc);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSrc);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const msg = gl.getProgramInfoLog(prog) || 'program link failed';
      gl.deleteProgram(prog);
      throw new Error(msg);
    }
    return prog;
  }

  class CatalogWebGLRenderer {
    constructor(canvas, viewer) {
      this.canvas = canvas;
      this.viewer = viewer;
      this.gl = null;
      this.webgl2 = false;
      this.maxPointSize = 64;
      this.count = 0;
      this.buffers = {};
      this.program = null;
      this.pickProgram = null;
      this.pickFbo = null;
      this.pickTex = null;
      this.pickDepth = null;
      this.dpr = 1;
      // Offscreen export buffer for PNG capture (avoids preserveDrawingBuffer cost).
      this._exportFbo = null;
      this._exportTex = null;
      this._exportDepth = null;
      this._exportW = 0;
      this._exportH = 0;
      this._init();
    }

    _init() {
      const canvas = this.canvas;
      let gl = null;
      try {
        gl = canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: false, preserveDrawingBuffer: false });
        if (gl) this.webgl2 = true;
      } catch (_) {}
      if (!gl) {
        try {
          gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false, preserveDrawingBuffer: false });
        } catch (_) {}
      }
      if (!gl) throw new Error('WebGL not available');
      this.gl = gl;
      const range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
      if (range && range.length) this.maxPointSize = Math.max(8, range[1] || 64);

      // A small fraction of GPUs clamp gl_PointSize fairly low. When a marker's
      // screen size exceeds this limit, it will stop scaling with zoom and look
      // like it is "shrinking" relative to the image. For those cases we render
      // as instanced quads (WebGL2) instead of POINTS.
      this._quadCornerBuf = null;
      this._quadProgram = null;
      this._quadPickProgram = null;

      const vs = `
        precision highp float;
        attribute vec2 a_pos;
        attribute float a_radius;
        attribute float a_vis;
        attribute float a_id;
        attribute float a_cat;
        attribute float a_shape;
        attribute vec4 a_pstroke;
        attribute vec4 a_pfill;
        uniform mat3 u_toClip;
        uniform float u_scale;
        uniform float u_maxPointSize;
        uniform float u_usePerPointColor;
        varying float v_cat;
        varying float v_shape;
        varying vec4 v_pstroke;
        varying vec4 v_pfill;
        varying float v_radiusPx;
        varying float v_id;
        void main() {
          if (a_vis < 0.5) {
            gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
            gl_PointSize = 0.0;
            v_cat = a_cat;
            v_shape = a_shape;
            v_pstroke = a_pstroke;
            v_pfill = a_pfill;
            v_radiusPx = 0.0;
            v_id = a_id;
            return;
          }
          vec3 clip = u_toClip * vec3(a_pos, 1.0);
          gl_Position = vec4(clip.xy, 0.0, 1.0);
          float rpx = max(0.5, a_radius * u_scale);
          float size = min(u_maxPointSize, 2.0 * rpx);
          gl_PointSize = size;
          v_cat = a_cat;
          v_shape = a_shape;
          v_pstroke = a_pstroke;
          v_pfill = a_pfill;
          v_radiusPx = rpx;
          v_id = a_id;
        }
      `;

      const fs = `
        precision highp float;
        uniform sampler2D u_strokeTex;
        uniform sampler2D u_fillTex;
        uniform sampler2D u_paramsTex;
        uniform float u_styleTexW;
        uniform float u_usePerPointColor;
        varying float v_cat;
        varying float v_shape;
        varying vec4 v_pstroke;
        varying vec4 v_pfill;
        varying float v_radiusPx;
        void main() {
          vec2 p = gl_PointCoord * 2.0 - 1.0;
          // Shape distance metric normalized to 1.0 at boundary:
          // 0 = circle, 1 = square, 2 = hexagon
          float shape = floor(v_shape + 0.5);
          float d = 0.0;
          if (shape < 0.5) {
            d = length(p);
            if (d > 1.0) discard;
          } else if (shape < 1.5) {
            vec2 ap = abs(p);
            d = max(ap.x, ap.y);
            if (d > 1.0) discard;
          } else {
            // Flat-top regular hexagon with vertices at (±1,0) and (±0.5, ±sqrt(3)/2)
            vec2 ap = abs(p);
            float a = ap.x;
            float b = ap.y;
            // Three half-planes normalized such that boundary has d=1:
            // |x| <= 1
            // |y| <= sqrt(3)/2
            // |x| + |y|/sqrt(3) <= 1
            float d1 = a;
            float d2 = b / 0.8660254037844386;
            float d3 = a + b / 1.7320508075688772;
            d = max(d1, max(d2, d3));
            if (d > 1.0) discard;
          }
          // Sample per-catalog style (nearest sampling; textures are 1xN)
          float cid = floor(v_cat + 0.5);
          float u = (cid + 0.5) / max(1.0, u_styleTexW);
          vec2 uv = vec2(u, 0.5);
          vec4 stroke = (u_usePerPointColor > 0.5) ? v_pstroke : texture2D(u_strokeTex, uv);
          vec4 fill = (u_usePerPointColor > 0.5) ? v_pfill : texture2D(u_fillTex, uv);
          vec4 params = texture2D(u_paramsTex, uv);
          float borderPx = params.r * 63.0;
          float opacity = clamp(params.g, 0.0, 1.0);

          float borderFrac = clamp(borderPx / max(1.0, v_radiusPx), 0.0, 0.49);
          float edge = 1.0 - borderFrac;
          vec4 col = (d > edge) ? stroke : fill;
          col.a *= opacity;
          gl_FragColor = col;
        }
      `;

      this.program = createProgram(gl, vs, fs);

      // Picking: encode id into RGBA
      const pickFs = `
        precision highp float;
        varying float v_id;
        varying float v_shape;
        void main() {
          vec2 p = gl_PointCoord * 2.0 - 1.0;
          float shape = floor(v_shape + 0.5);
          float d = 0.0;
          if (shape < 0.5) {
            d = length(p);
            if (d > 1.0) discard;
          } else if (shape < 1.5) {
            vec2 ap = abs(p);
            d = max(ap.x, ap.y);
            if (d > 1.0) discard;
          } else {
            vec2 ap = abs(p);
            float a = ap.x;
            float b = ap.y;
            float d1 = a;
            float d2 = b / 0.8660254037844386;
            float d3 = a + b / 1.7320508075688772;
            d = max(d1, max(d2, d3));
            if (d > 1.0) discard;
          }
          // Offset by +1 so background stays 0, and index 0 is pickable.
          float id = floor(v_id + 0.5) + 1.0;
          // Use RGB only (24-bit) and force alpha=1 to avoid blend issues.
          float r = floor(mod(id, 256.0));
          float g = floor(mod(floor(id / 256.0), 256.0));
          float b = floor(mod(floor(id / 65536.0), 256.0));
          gl_FragColor = vec4(r, g, b, 255.0) / 255.0;
        }
      `;
      this.pickProgram = createProgram(gl, vs, pickFs);

      // Instanced quad programs (WebGL2). Uses image-space offsets (no point size cap).
      if (this.webgl2) {
        try {
          // 2 triangles covering [-1,1]x[-1,1]
          this._quadCornerBuf = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, this._quadCornerBuf);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1,
             1, -1,
             1,  1,
            -1, -1,
             1,  1,
            -1,  1
          ]), gl.STATIC_DRAW);

          const vsq = `
            precision highp float;
            attribute vec2 a_corner;       // per-vertex (-1..1)
            attribute vec2 a_pos;          // per-instance (image px)
            attribute float a_radius;      // per-instance (image px)
            attribute float a_vis;         // per-instance
            attribute float a_id;          // per-instance
            attribute float a_cat;         // per-instance
            attribute float a_shape;       // per-instance
            attribute vec4 a_pstroke;      // per-instance
            attribute vec4 a_pfill;        // per-instance
            uniform mat3 u_toClip;
            uniform float u_scale;
            uniform float u_usePerPointColor;
            varying float v_cat;
            varying float v_shape;
            varying vec4 v_pstroke;
            varying vec4 v_pfill;
            varying float v_radiusPx;
            varying float v_id;
            varying vec2 v_p;
            void main() {
              if (a_vis < 0.5) {
                gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
                v_cat = a_cat;
                v_shape = a_shape;
                v_pstroke = a_pstroke;
                v_pfill = a_pfill;
                v_radiusPx = 0.0;
                v_id = a_id;
                v_p = a_corner;
                return;
              }
              vec2 imgPos = a_pos + a_corner * a_radius;
              vec3 clip = u_toClip * vec3(imgPos, 1.0);
              gl_Position = vec4(clip.xy, 0.0, 1.0);
              v_cat = a_cat;
              v_shape = a_shape;
              v_pstroke = a_pstroke;
              v_pfill = a_pfill;
              v_radiusPx = max(0.5, a_radius * u_scale);
              v_id = a_id;
              v_p = a_corner;
            }
          `;

          const fsq = `
            precision highp float;
            uniform sampler2D u_strokeTex;
            uniform sampler2D u_fillTex;
            uniform sampler2D u_paramsTex;
            uniform float u_styleTexW;
            uniform float u_usePerPointColor;
            varying float v_cat;
            varying float v_shape;
            varying vec4 v_pstroke;
            varying vec4 v_pfill;
            varying float v_radiusPx;
            varying vec2 v_p;
            void main() {
              vec2 p = v_p; // already -1..1
              float shape = floor(v_shape + 0.5);
              float d = 0.0;
              if (shape < 0.5) {
                d = length(p);
                if (d > 1.0) discard;
              } else if (shape < 1.5) {
                vec2 ap = abs(p);
                d = max(ap.x, ap.y);
                if (d > 1.0) discard;
              } else {
                vec2 ap = abs(p);
                float a = ap.x;
                float b = ap.y;
                float d1 = a;
                float d2 = b / 0.8660254037844386;
                float d3 = a + b / 1.7320508075688772;
                d = max(d1, max(d2, d3));
                if (d > 1.0) discard;
              }

              float cid = floor(v_cat + 0.5);
              float u = (cid + 0.5) / max(1.0, u_styleTexW);
              vec2 uv = vec2(u, 0.5);
              vec4 stroke = (u_usePerPointColor > 0.5) ? v_pstroke : texture2D(u_strokeTex, uv);
              vec4 fill = (u_usePerPointColor > 0.5) ? v_pfill : texture2D(u_fillTex, uv);
              vec4 params = texture2D(u_paramsTex, uv);
              float borderPx = params.r * 63.0;
              float opacity = clamp(params.g, 0.0, 1.0);

              float borderFrac = clamp(borderPx / max(1.0, v_radiusPx), 0.0, 0.49);
              float edge = 1.0 - borderFrac;
              vec4 col = (d > edge) ? stroke : fill;
              col.a *= opacity;
              gl_FragColor = col;
            }
          `;

          const pickFsq = `
            precision highp float;
            varying float v_id;
            varying float v_shape;
            varying vec2 v_p;
            void main() {
              vec2 p = v_p;
              float shape = floor(v_shape + 0.5);
              float d = 0.0;
              if (shape < 0.5) {
                d = length(p);
                if (d > 1.0) discard;
              } else if (shape < 1.5) {
                vec2 ap = abs(p);
                d = max(ap.x, ap.y);
                if (d > 1.0) discard;
              } else {
                vec2 ap = abs(p);
                float a = ap.x;
                float b = ap.y;
                float d1 = a;
                float d2 = b / 0.8660254037844386;
                float d3 = a + b / 1.7320508075688772;
                d = max(d1, max(d2, d3));
                if (d > 1.0) discard;
              }
              float id = floor(v_id + 0.5) + 1.0;
              float r = floor(mod(id, 256.0));
              float g = floor(mod(floor(id / 256.0), 256.0));
              float b = floor(mod(floor(id / 65536.0), 256.0));
              gl_FragColor = vec4(r, g, b, 255.0) / 255.0;
            }
          `;

          this._quadProgram = createProgram(gl, vsq, fsq);
          this._quadPickProgram = createProgram(gl, vsq, pickFsq);
        } catch (e) {
          // If quad program fails for any reason, keep POINTS path.
          try { console.warn('[WebGL] quad program init failed; falling back to POINTS', e); } catch (_) {}
          this._quadProgram = null;
          this._quadPickProgram = null;
          this._quadCornerBuf = null;
        }
      }

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.DEPTH_TEST);

      // Style textures (1D packed into 2D 1xN)
      this._styleTexW = 0;
      this._styleStrokeTex = gl.createTexture();
      this._styleFillTex = gl.createTexture();
      this._styleParamsTex = gl.createTexture();
      const initTex = (tex) => {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 0, 0, 255]));
      };
      initTex(this._styleStrokeTex);
      initTex(this._styleFillTex);
      gl.bindTexture(gl.TEXTURE_2D, this._styleParamsTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([2, 204, 0, 255])); // border~2, opacity~0.8
    }

    resizeToViewer() {
      const el = document.getElementById('openseadragon');
      if (!el) return;
      const cssW = Math.max(1, el.clientWidth || 1);
      const cssH = Math.max(1, el.clientHeight || 1);
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      this.dpr = dpr;
      const w = Math.max(1, Math.round(cssW * dpr));
      const h = Math.max(1, Math.round(cssH * dpr));
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
      }
      this.gl.viewport(0, 0, w, h);
    }

    _computeToClip() {
      const v = this.viewer || window.viewer || window.tiledViewer;
      const el = document.getElementById('openseadragon');
      const cssW = Math.max(1, el ? el.clientWidth : 1);
      const cssH = Math.max(1, el ? el.clientHeight : 1);
      const w = Math.max(1, this.canvas ? this.canvas.width : Math.round(cssW * (window.devicePixelRatio || 1)));
      const h = Math.max(1, this.canvas ? this.canvas.height : Math.round(cssH * (window.devicePixelRatio || 1)));
      if (!v || !v.world || !v.world.getItemAt) return { m: [1,0,0, 0,1,0, 0,0,1], scale: 1 };
      const timg = v.world.getItemAt(0);
      if (!timg || typeof timg.imageToViewportCoordinates !== 'function') return { m: [1,0,0, 0,1,0, 0,0,1], scale: 1 };

      // IMPORTANT:
      // OpenSeadragon's `viewportToViewerElementCoordinates()` can be in CSS pixels OR device pixels
      // depending on how the viewer is configured (pixel-perfect mode).
      // So we compute the scale from OSD's container coordinate space -> our WebGL drawing buffer.
      let osdW = cssW;
      let osdH = cssH;
      try {
        if (v && v.viewport && typeof v.viewport.getContainerSize === 'function') {
          const cs = v.viewport.getContainerSize();
          if (cs && Number.isFinite(cs.x) && Number.isFinite(cs.y) && cs.x > 0 && cs.y > 0) {
            osdW = cs.x;
            osdH = cs.y;
          }
        }
      } catch (_) {}
      const toDevX = w / Math.max(1, osdW);
      const toDevY = h / Math.max(1, osdH);
      // Use a large baseline to avoid precision loss when zoomed out.
      let W = 1, Hh = 1;
      try {
        if (typeof timg.getContentSize === 'function') {
          const sz = timg.getContentSize();
          if (sz && Number.isFinite(sz.x) && Number.isFinite(sz.y)) {
            W = Math.max(1, sz.x);
            Hh = Math.max(1, sz.y);
          }
        } else if (timg.source && timg.source.dimensions) {
          const sz2 = timg.source.dimensions;
          if (sz2 && Number.isFinite(sz2.x) && Number.isFinite(sz2.y)) {
            W = Math.max(1, sz2.x);
            Hh = Math.max(1, sz2.y);
          }
        }
      } catch (_) {}

      // Use a moderate step so we don't sample points extremely far away (can cause precision issues on huge images).
      const stepX = Math.max(1, Math.min(W, 2048));
      const stepY = Math.max(1, Math.min(Hh, 2048));

      const p0v = timg.imageToViewportCoordinates(new OpenSeadragon.Point(0, 0));
      const pXv = timg.imageToViewportCoordinates(new OpenSeadragon.Point(stepX, 0));
      const pYv = timg.imageToViewportCoordinates(new OpenSeadragon.Point(0, stepY));
      const s0 = v.viewport.viewportToViewerElementCoordinates(p0v);
      const sX = v.viewport.viewportToViewerElementCoordinates(pXv);
      const sY = v.viewport.viewportToViewerElementCoordinates(pYv);
      // Convert from OSD coordinate space to WebGL drawing buffer pixels.
      const s0x = s0.x * toDevX, s0y = s0.y * toDevY;
      const sXx = sX.x * toDevX, sXy = sX.y * toDevY;
      const sYx = sY.x * toDevX, sYy = sY.y * toDevY;
      const axx = (sXx - s0x) / stepX;
      const ayx = (sXy - s0y) / stepX;
      const axy = (sYx - s0x) / stepY;
      const ayy = (sYy - s0y) / stepY;
      const tx = s0x, ty = s0y;

      const sx = 2.0 / w;
      const sy = 2.0 / h;

      const m00 = sx * axx;
      const m01 = sx * axy;
      const m02 = sx * tx - 1.0;
      const m10 = -sy * ayx;
      const m11 = -sy * ayy;
      const m12 = 1.0 - sy * ty;
      const scale = Math.sqrt(axx * axx + ayx * ayx); // device px per image px
      // One-time debug if matrix is suspicious
      try {
        if ((!Number.isFinite(scale) || scale <= 0) && !this.__loggedBadMatrix) {
          this.__loggedBadMatrix = true;
          console.warn('[WebGL] bad matrix', { W, Hh, stepX, stepY, cssW, cssH, osdW, osdH, toDevX, toDevY, w, h, s0, sX, sY, axx, axy, ayx, ayy, tx, ty, scale });
        }
      } catch (_) {}
      // WebGL expects column-major matrices when transpose=false.
      // We want:
      // [ m00 m01 m02 ]
      // [ m10 m11 m12 ]
      // [  0   0   1  ]
      // So the Float32Array must be:
      // [m00,m10,0,  m01,m11,0,  m02,m12,1]
      return { m: [m00, m10, 0, m01, m11, 0, m02, m12, 1], scale: scale };
    }

    _normCatalogKey(raw) {
      try {
        const s = String(raw || '').trim();
        if (!s) return '';
        if (s.startsWith('catalogs/')) return s;
        const base = s.split('/').pop().split('\\').pop();
        return base ? `catalogs/${base}` : s;
      } catch (_) {
        return String(raw || '');
      }
    }

    _ensureStyleTexWidth(width) {
      const gl = this.gl;
      const w = Math.max(1, width | 0);
      if (this._styleTexW === w) return;
      this._styleTexW = w;
      const alloc = (tex, fill) => {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        // initialize with something (optional)
        if (fill) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, 1, gl.RGBA, gl.UNSIGNED_BYTE, fill);
      };
      alloc(this._styleStrokeTex, null);
      alloc(this._styleFillTex, null);
      alloc(this._styleParamsTex, null);
    }

    updateStyleTexturesFromOverlayData(catalogData) {
      const gl = this.gl;
      if (!catalogData || !catalogData.length) return;
      // Build per-catalog style from the first seen object per catalog key.
      const stylesByKey = new Map();
      for (let i = 0; i < catalogData.length; i += 1) {
        const o = catalogData[i];
        if (!o) continue;
        const key = this._normCatalogKey(o.__catalogName || o.catalog_name || o.catalogName || o.catalog || '');
        if (!key) continue;
        if (stylesByKey.has(key)) continue;
        stylesByKey.set(key, {
          stroke: parseColorToRgba8(o.color, [255, 0, 0, 255]),
          fill: parseColorToRgba8(o.fillColor, [255, 0, 0, 80]),
          border: Number.isFinite(o.border_width) ? Number(o.border_width) : 2,
          opacity: Number.isFinite(o.opacity) ? Number(o.opacity) : 0.8
        });
        // early-out once we have all known keys
        if (this._catKeyToId && stylesByKey.size >= this._catKeyToId.size) break;
      }

      // If we don't have a key->id map yet, nothing to do.
      if (!this._catKeyToId || !this._catKeys || !this._catKeys.length) return;
      this._ensureStyleTexWidth(this._catKeys.length);

      const w = this._styleTexW;
      const strokeArr = new Uint8Array(w * 4);
      const fillArr = new Uint8Array(w * 4);
      const paramsArr = new Uint8Array(w * 4);

      for (let id = 0; id < w; id += 1) {
        const key = this._catKeys[id];
        const st = stylesByKey.get(key) || { stroke: [255, 0, 0, 255], fill: [255, 0, 0, 80], border: 2, opacity: 0.8 };
        strokeArr[id * 4] = st.stroke[0];
        strokeArr[id * 4 + 1] = st.stroke[1];
        strokeArr[id * 4 + 2] = st.stroke[2];
        strokeArr[id * 4 + 3] = st.stroke[3];
        fillArr[id * 4] = st.fill[0];
        fillArr[id * 4 + 1] = st.fill[1];
        fillArr[id * 4 + 2] = st.fill[2];
        fillArr[id * 4 + 3] = st.fill[3];
        const bw = clamp(Math.round(Number(st.border || 2) * 4), 0, 255); // borderPx*4 => 0..63.75px in shader
        const op = clamp(Math.round(clamp(Number(st.opacity || 0.8), 0, 1) * 255), 0, 255);
        paramsArr[id * 4] = bw;
        paramsArr[id * 4 + 1] = op;
        paramsArr[id * 4 + 2] = 0;
        paramsArr[id * 4 + 3] = 255;
      }

      // Cheap change detection
      const sig = `${w}|${Array.from(paramsArr.slice(0, Math.min(64, paramsArr.length))).join(',')}|${Array.from(strokeArr.slice(0, Math.min(64, strokeArr.length))).join(',')}`;
      if (this._styleSig === sig) return;
      this._styleSig = sig;

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this._styleStrokeTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, 1, gl.RGBA, gl.UNSIGNED_BYTE, strokeArr);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this._styleFillTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, 1, gl.RGBA, gl.UNSIGNED_BYTE, fillArr);

      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this._styleParamsTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, 1, gl.RGBA, gl.UNSIGNED_BYTE, paramsArr);
    }

    setData(catalogData) {
      const gl = this.gl;
      const n = (catalogData && catalogData.length) ? catalogData.length : 0;
      this.count = n;
      if (!n) return;

      // Build typed arrays
      const pos = new Float32Array(n * 2);
      const rad = new Float32Array(n);
      let maxRad = 0;
      const ids = new Float32Array(n); // float id (fits 24-bit precisely; for >16M ids we'd need uint)
      const vis = new Uint8Array(n);
      const cat = new Uint8Array(n);
      const shape = new Uint8Array(n);
      // Optional per-point colors for color-coding
      let pstroke = null;
      let pfill = null;
      // Detect color coding quickly (we only need per-point colors if any records have colorCodeColumn)
      let usePerPointColor = false;
      const scanN = Math.min(n, 2048);
      for (let i = 0; i < scanN; i += 1) {
        const s = catalogData[i] || {};
        if (s && (s.colorCodeColumn || s.colorCodeValue !== undefined || s.colorMapName)) { usePerPointColor = true; break; }
      }
      this._usePerPointColor = !!usePerPointColor;
      if (this._usePerPointColor) {
        pstroke = new Uint8Array(n * 4);
        pfill = new Uint8Array(n * 4);
      }

      // Build per-catalog id mapping (small)
      const catKeyToId = new Map();
      const catKeys = [];
      const getIdForKey = (key) => {
        if (!key) return 0;
        let id = catKeyToId.get(key);
        if (typeof id === 'number') return id;
        id = catKeys.length;
        catKeys.push(key);
        catKeyToId.set(key, id);
        return id;
      };

      const colorCache = this._usePerPointColor ? new Map() : null;
      const parseCached = (c, fb) => {
        if (!this._usePerPointColor) return fb;
        try {
          const k = String(c || '');
          if (colorCache.has(k)) return colorCache.get(k);
          const v = parseColorToRgba8(c, fb);
          colorCache.set(k, v);
          return v;
        } catch (_) {
          return fb;
        }
      };

      for (let i = 0; i < n; i++) {
        const s = catalogData[i] || {};
        const x = Number.isFinite(s.x_pixels) ? s.x_pixels : (Number.isFinite(s.x) ? s.x : 0);
        const y = Number.isFinite(s.y_pixels) ? s.y_pixels : (Number.isFinite(s.y) ? s.y : 0);
        pos[i * 2] = x;
        pos[i * 2 + 1] = y;
        rad[i] = Number.isFinite(s.radius_pixels) ? Number(s.radius_pixels) : 5;
        if (rad[i] > maxRad) maxRad = rad[i];
        ids[i] = i;
        // IMPORTANT: a_vis is read as a normalized UNSIGNED_BYTE in the shader pipeline.
        // Use 255 to represent "1.0" so the a_vis < 0.5 cull doesn't hide everything.
        vis[i] = 255;
        const key = this._normCatalogKey(s.__catalogName || s.catalog_name || s.catalogName || s.catalog || '');
        const cid = getIdForKey(key);
        cat[i] = clamp(cid, 0, 255);
        // Shape: 0=circle,1=square,2=hexagon (default circle)
        try {
          const sh = (s && s.shape) ? String(s.shape).toLowerCase() : '';
          if (sh.includes('hex')) shape[i] = 2;
          else if (sh.includes('square') || sh.includes('box') || sh.includes('rect')) shape[i] = 1;
          else shape[i] = 0;
        } catch (_) {
          shape[i] = 0;
        }
        if (this._usePerPointColor) {
          const st = parseCached(s.color, [255, 0, 0, 255]);
          const fi = parseCached(s.fillColor, [255, 0, 0, 80]);
          pstroke[i * 4] = st[0];
          pstroke[i * 4 + 1] = st[1];
          pstroke[i * 4 + 2] = st[2];
          pstroke[i * 4 + 3] = st[3];
          pfill[i * 4] = fi[0];
          pfill[i * 4 + 1] = fi[1];
          pfill[i * 4 + 2] = fi[2];
          pfill[i * 4 + 3] = fi[3];
        }
      }

      // Create / upload buffers
      const makeBuf = (target, data, usage) => {
        const b = gl.createBuffer();
        gl.bindBuffer(target, b);
        gl.bufferData(target, data, usage || gl.STATIC_DRAW);
        return b;
      };

      // Cleanup old
      try {
        for (const k of Object.keys(this.buffers)) {
          const b = this.buffers[k];
          if (b) gl.deleteBuffer(b);
        }
      } catch (_) {}
      this.buffers = {};

      this.buffers.pos = makeBuf(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
      this.buffers.rad = makeBuf(gl.ARRAY_BUFFER, rad, gl.STATIC_DRAW);
      this.buffers.id = makeBuf(gl.ARRAY_BUFFER, ids, gl.STATIC_DRAW);
      this.buffers.vis = makeBuf(gl.ARRAY_BUFFER, vis, gl.DYNAMIC_DRAW);
      this.buffers.cat = makeBuf(gl.ARRAY_BUFFER, cat, gl.STATIC_DRAW);
      this.buffers.shape = makeBuf(gl.ARRAY_BUFFER, shape, gl.STATIC_DRAW);
      if (this._usePerPointColor) {
        this.buffers.pstroke = makeBuf(gl.ARRAY_BUFFER, pstroke, gl.STATIC_DRAW);
        this.buffers.pfill = makeBuf(gl.ARRAY_BUFFER, pfill, gl.STATIC_DRAW);
      }
      this._maxRadius = maxRad;

      this._catKeyToId = catKeyToId;
      this._catKeys = catKeys;
      // Update style textures now that we have the mapping
      try { this.updateStyleTexturesFromOverlayData(catalogData); } catch (_) {}
    }

    _bindAttribs(prog) {
      const gl = this.gl;
      const locPos = gl.getAttribLocation(prog, 'a_pos');
      const locRad = gl.getAttribLocation(prog, 'a_radius');
      const locVis = gl.getAttribLocation(prog, 'a_vis');
      const locId = gl.getAttribLocation(prog, 'a_id');
      const locCat = gl.getAttribLocation(prog, 'a_cat');
      const locShape = gl.getAttribLocation(prog, 'a_shape');
      const locPStroke = gl.getAttribLocation(prog, 'a_pstroke');
      const locPFill = gl.getAttribLocation(prog, 'a_pfill');

      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.pos);
      if (locPos >= 0) {
        gl.enableVertexAttribArray(locPos);
        gl.vertexAttribPointer(locPos, 2, gl.FLOAT, false, 0, 0);
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.rad);
      if (locRad >= 0) {
        gl.enableVertexAttribArray(locRad);
        gl.vertexAttribPointer(locRad, 1, gl.FLOAT, false, 0, 0);
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.vis);
      if (locVis >= 0) {
        gl.enableVertexAttribArray(locVis);
        gl.vertexAttribPointer(locVis, 1, gl.UNSIGNED_BYTE, true, 0, 0);
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.id);
      if (locId >= 0) {
        gl.enableVertexAttribArray(locId);
        gl.vertexAttribPointer(locId, 1, gl.FLOAT, false, 0, 0);
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.cat);
      if (locCat >= 0) {
        gl.enableVertexAttribArray(locCat);
        // Not normalized: shader receives 0..255 float
        gl.vertexAttribPointer(locCat, 1, gl.UNSIGNED_BYTE, false, 0, 0);
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.shape);
      if (locShape >= 0) {
        gl.enableVertexAttribArray(locShape);
        // Not normalized: shader receives 0..255 float, we round in shader
        gl.vertexAttribPointer(locShape, 1, gl.UNSIGNED_BYTE, false, 0, 0);
      }

      // Optional per-point colors (normalized UNSIGNED_BYTE -> 0..1)
      if (locPStroke >= 0) {
        if (this.buffers.pstroke) {
          gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.pstroke);
          gl.enableVertexAttribArray(locPStroke);
          gl.vertexAttribPointer(locPStroke, 4, gl.UNSIGNED_BYTE, true, 0, 0);
        } else {
          try { gl.disableVertexAttribArray(locPStroke); } catch (_) {}
          try { gl.vertexAttrib4f(locPStroke, 1, 0, 0, 1); } catch (_) {}
        }
      }
      if (locPFill >= 0) {
        if (this.buffers.pfill) {
          gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.pfill);
          gl.enableVertexAttribArray(locPFill);
          gl.vertexAttribPointer(locPFill, 4, gl.UNSIGNED_BYTE, true, 0, 0);
        } else {
          try { gl.disableVertexAttribArray(locPFill); } catch (_) {}
          try { gl.vertexAttrib4f(locPFill, 1, 0, 0, 0.3); } catch (_) {}
        }
      }
    }

    _bindAttribsQuad(prog) {
      const gl = this.gl;
      if (!this.webgl2 || !this._quadCornerBuf) {
        this._bindAttribs(prog);
        return;
      }
      // Per-vertex corner
      const locCorner = gl.getAttribLocation(prog, 'a_corner');
      gl.bindBuffer(gl.ARRAY_BUFFER, this._quadCornerBuf);
      if (locCorner >= 0) {
        gl.enableVertexAttribArray(locCorner);
        gl.vertexAttribPointer(locCorner, 2, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(locCorner, 0);
      }

      // Per-instance attributes
      const bindInst = (name, buf, size, type, normalized) => {
        const loc = gl.getAttribLocation(prog, name);
        if (loc < 0) return;
        if (!buf) {
          try { gl.disableVertexAttribArray(loc); } catch (_) {}
          return;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, type, !!normalized, 0, 0);
        gl.vertexAttribDivisor(loc, 1);
      };

      bindInst('a_pos', this.buffers.pos, 2, gl.FLOAT, false);
      bindInst('a_radius', this.buffers.rad, 1, gl.FLOAT, false);
      bindInst('a_vis', this.buffers.vis, 1, gl.UNSIGNED_BYTE, true);
      bindInst('a_id', this.buffers.id, 1, gl.FLOAT, false);
      bindInst('a_cat', this.buffers.cat, 1, gl.UNSIGNED_BYTE, false);
      bindInst('a_shape', this.buffers.shape, 1, gl.UNSIGNED_BYTE, false);
      bindInst('a_pstroke', this.buffers.pstroke, 4, gl.UNSIGNED_BYTE, true);
      bindInst('a_pfill', this.buffers.pfill, 4, gl.UNSIGNED_BYTE, true);
    }

    _shouldUseQuads(scale) {
      try {
        if (!this.webgl2 || !this._quadProgram || !this._quadPickProgram) return false;
        const maxRad = Number(this._maxRadius || 0);
        if (!isFinite(maxRad) || maxRad <= 0) return false;
        const desired = 2.0 * maxRad * Math.max(0.000001, Number(scale || 1));
        // If we'd exceed the GPU point-size cap, use quads.
        return desired > (this.maxPointSize - 1);
      } catch (_) {
        return false;
      }
    }

    // Legacy (single-style) helper retained for compatibility; WebGL now uses per-catalog textures.
    setStyleFromCatalogData(_catalogData) {}

    setVisibilityMask(mask) {
      const gl = this.gl;
      if (!this.buffers || !this.buffers.vis) return;
      if (!mask || mask.length !== this.count) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.vis);
      gl.bufferData(gl.ARRAY_BUFFER, mask, gl.DYNAMIC_DRAW);
    }

    draw() {
      const gl = this.gl;
      if (!this.count) return;
      this.resizeToViewer();
      const { m, scale } = this._computeToClip();

      const useQuads = this._shouldUseQuads(scale);
      const prog = useQuads ? this._quadProgram : this.program;
      gl.useProgram(prog);
      if (useQuads) this._bindAttribsQuad(prog);
      else this._bindAttribs(prog);

      const uToClip = gl.getUniformLocation(prog, 'u_toClip');
      const uScale = gl.getUniformLocation(prog, 'u_scale');
      const uMax = useQuads ? null : gl.getUniformLocation(prog, 'u_maxPointSize');
      const uStrokeTex = gl.getUniformLocation(prog, 'u_strokeTex');
      const uFillTex = gl.getUniformLocation(prog, 'u_fillTex');
      const uParamsTex = gl.getUniformLocation(prog, 'u_paramsTex');
      const uTexW = gl.getUniformLocation(prog, 'u_styleTexW');
      const uUseP = gl.getUniformLocation(prog, 'u_usePerPointColor');
      if (uToClip) gl.uniformMatrix3fv(uToClip, false, new Float32Array(m));
      if (uScale) gl.uniform1f(uScale, scale);
      if (uMax) gl.uniform1f(uMax, this.maxPointSize);
      if (uTexW) gl.uniform1f(uTexW, Math.max(1, this._styleTexW || 1));
      if (uUseP) gl.uniform1f(uUseP, this._usePerPointColor ? 1.0 : 0.0);
      // Bind style textures
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this._styleStrokeTex);
      if (uStrokeTex) gl.uniform1i(uStrokeTex, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this._styleFillTex);
      if (uFillTex) gl.uniform1i(uFillTex, 1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this._styleParamsTex);
      if (uParamsTex) gl.uniform1i(uParamsTex, 2);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (useQuads && this.webgl2) {
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.count);
      } else {
        gl.drawArrays(gl.POINTS, 0, this.count);
      }
    }

    _ensurePickFbo() {
      const gl = this.gl;
      this.resizeToViewer();
      const w = this.canvas.width;
      const h = this.canvas.height;
      if (this.pickFbo && this.pickW === w && this.pickH === h) return;
      this.pickW = w; this.pickH = h;
      if (this.pickTex) gl.deleteTexture(this.pickTex);
      if (this.pickDepth) gl.deleteRenderbuffer(this.pickDepth);
      if (this.pickFbo) gl.deleteFramebuffer(this.pickFbo);

      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

      const rb = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);

      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);

      this.pickTex = tex;
      this.pickDepth = rb;
      this.pickFbo = fbo;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    _ensureExportFbo(w, h) {
      const gl = this.gl;
      const W = Math.max(1, w | 0);
      const H = Math.max(1, h | 0);
      if (this._exportFbo && this._exportW === W && this._exportH === H) return;
      this._exportW = W; this._exportH = H;
      try {
        if (this._exportTex) gl.deleteTexture(this._exportTex);
        if (this._exportDepth) gl.deleteRenderbuffer(this._exportDepth);
        if (this._exportFbo) gl.deleteFramebuffer(this._exportFbo);
      } catch (_) {}

      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

      const rb = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, W, H);

      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);

      this._exportTex = tex;
      this._exportDepth = rb;
      this._exportFbo = fbo;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    // Render the current overlay into an RGBA pixel buffer (top-left origin) for export.
    // Returns { width, height, pixels } where pixels is a Uint8ClampedArray.
    renderToRgbaPixels() {
      const gl = this.gl;
      if (!gl || !this.count) return null;
      // Match the on-screen drawing buffer size
      this.resizeToViewer();
      const W = this.canvas.width;
      const H = this.canvas.height;
      this._ensureExportFbo(W, H);
      const { m, scale } = this._computeToClip();

      gl.bindFramebuffer(gl.FRAMEBUFFER, this._exportFbo);
      gl.viewport(0, 0, W, H);

      // Use same blending as normal draw for appearance.
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      const useQuads = this._shouldUseQuads(scale);
      const prog = useQuads ? this._quadProgram : this.program;
      gl.useProgram(prog);
      if (useQuads) this._bindAttribsQuad(prog);
      else this._bindAttribs(prog);

      const uToClip = gl.getUniformLocation(prog, 'u_toClip');
      const uScale = gl.getUniformLocation(prog, 'u_scale');
      const uMax = useQuads ? null : gl.getUniformLocation(prog, 'u_maxPointSize');
      const uStrokeTex = gl.getUniformLocation(prog, 'u_strokeTex');
      const uFillTex = gl.getUniformLocation(prog, 'u_fillTex');
      const uParamsTex = gl.getUniformLocation(prog, 'u_paramsTex');
      const uTexW = gl.getUniformLocation(prog, 'u_styleTexW');
      const uUseP = gl.getUniformLocation(prog, 'u_usePerPointColor');
      if (uToClip) gl.uniformMatrix3fv(uToClip, false, new Float32Array(m));
      if (uScale) gl.uniform1f(uScale, scale);
      if (uMax) gl.uniform1f(uMax, this.maxPointSize);
      if (uTexW) gl.uniform1f(uTexW, Math.max(1, this._styleTexW || 1));
      if (uUseP) gl.uniform1f(uUseP, this._usePerPointColor ? 1.0 : 0.0);

      // Bind style textures
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this._styleStrokeTex);
      if (uStrokeTex) gl.uniform1i(uStrokeTex, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this._styleFillTex);
      if (uFillTex) gl.uniform1i(uFillTex, 1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this._styleParamsTex);
      if (uParamsTex) gl.uniform1i(uParamsTex, 2);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      if (useQuads && this.webgl2) gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.count);
      else gl.drawArrays(gl.POINTS, 0, this.count);

      const raw = new Uint8Array(W * H * 4);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, raw);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      // Flip Y (WebGL readPixels is bottom-left origin; Canvas/ImageData is top-left).
      const out = new Uint8ClampedArray(W * H * 4);
      const rowBytes = W * 4;
      for (let y = 0; y < H; y += 1) {
        const srcOff = (H - 1 - y) * rowBytes;
        const dstOff = y * rowBytes;
        out.set(raw.subarray(srcOff, srcOff + rowBytes), dstOff);
      }
      return { width: W, height: H, pixels: out };
    }

    // Pick a point under the mouse.
    // Inputs are *client* coordinates (event.clientX/Y).
    pick(clientX, clientY) {
      try {
        const gl = this.gl;
        if (!this.count) return null;
        this._ensurePickFbo();
        const { m, scale } = this._computeToClip();

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.pickFbo);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        // Disable blending for picking (otherwise SRC_ALPHA can zero out RGB when A==0).
        const wasBlend = gl.isEnabled(gl.BLEND);
        if (wasBlend) gl.disable(gl.BLEND);
        const useQuads = this._shouldUseQuads(scale);
        const prog = useQuads ? this._quadPickProgram : this.pickProgram;
        gl.useProgram(prog);
        if (useQuads) this._bindAttribsQuad(prog);
        else this._bindAttribs(prog);
        const uToClip = gl.getUniformLocation(prog, 'u_toClip');
        const uScale = gl.getUniformLocation(prog, 'u_scale');
        const uMax = useQuads ? null : gl.getUniformLocation(prog, 'u_maxPointSize');
        gl.uniformMatrix3fv(uToClip, false, new Float32Array(m));
        gl.uniform1f(uScale, scale);
        if (uMax) gl.uniform1f(uMax, this.maxPointSize);

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        if (useQuads && this.webgl2) {
          gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.count);
        } else {
          gl.drawArrays(gl.POINTS, 0, this.count);
        }

        // Convert from client coords to canvas-local CSS pixels, then to drawing-buffer pixels.
        // This is robust regardless of OSD "pixel perfect" mode / DPR behavior.
        const rect = this.canvas.getBoundingClientRect();
        const localX = (clientX - (rect.left || 0));
        const localY = (clientY - (rect.top || 0));
        const sx = (rect && rect.width) ? (this.canvas.width / rect.width) : 1;
        const sy = (rect && rect.height) ? (this.canvas.height / rect.height) : 1;
        const px = clamp(Math.round(localX * sx), 0, this.canvas.width - 1);
        const py = clamp(Math.round((Math.max(0, rect.height - localY)) * sy), 0, this.canvas.height - 1);
        const out = new Uint8Array(4);
        gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        if (wasBlend) gl.enable(gl.BLEND);

        // Decode 24-bit id from RGB (alpha forced to 255)
        const raw = out[0] + out[1] * 256 + out[2] * 65536;
        if (!raw) return null; // background
        const id = raw - 1;
        if (id < 0 || id >= this.count) return null;
        return id;
      } catch (_) {
        try { this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null); } catch (_) {}
        return null;
      }
    }
  }

  window.CatalogWebGLRenderer = CatalogWebGLRenderer;
  try {
    console.log('[WebGL] CatalogWebGLRenderer exported:', typeof window.CatalogWebGLRenderer);
  } catch (_) {}
})();


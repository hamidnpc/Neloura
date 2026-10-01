/* HDU Opener popup (stacked previews). */
(function () {
  'use strict';

  function getPopupDoc() {
    if (typeof window.getHduPopupDocument === 'function') return window.getHduPopupDocument();
    try {
      if (window.top && window.top !== window && window.top.document) return window.top.document;
    } catch (_) {}
    return document;
  }

  function removeExisting(doc) {
    const d = doc || getPopupDoc();
    const existing = d.getElementById('hdu-selector-popup');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
  }

  function el(doc, tag, props) {
    const n = doc.createElement(tag);
    if (props) Object.assign(n, props);
    return n;
  }

  function safeText(v) {
    return v == null ? '' : String(v);
  }

  function buildMetaLines(hdu) {
    const lines = [];
    if (hdu.type === 'Image' && hdu.dimensions && hdu.dimensions.length) {
      lines.push(`Dimensions: ${hdu.dimensions.join(' × ')}`);
      if (hdu.hasWCS != null) lines.push(`WCS: ${hdu.hasWCS ? 'Available' : 'Not available'}`);
      if (hdu.bunit && String(hdu.bunit).trim() !== '') lines.push(`Unit: ${hdu.bunit}`);
    } else if (hdu.type === 'Table' && hdu.rows != null) {
      lines.push(`Rows: ${hdu.rows}`);
      if (hdu.columns != null) lines.push(`Columns: ${hdu.columns}`);
    } else {
      lines.push('No additional information');
    }
    return lines;
  }

  function getSidSync() {
    try {
      if (typeof window.getCurrentSessionId === 'function') return window.getCurrentSessionId();
    } catch (_) {}
    try {
      const sp = new URLSearchParams(window.location.search);
      return window.__forcedSid || window.__nelouraSid || sp.get('sid') || sp.get('pane_sid') || sessionStorage.getItem('sid');
    } catch (_) {
      try {
        return window.__forcedSid || window.__nelouraSid || sessionStorage.getItem('sid');
      } catch (_) {
        return window.__forcedSid || window.__nelouraSid || null;
      }
    }
  }

  async function getSidAsync() {
    const s = getSidSync();
    if (s) return s;
    if (typeof window.ensureSession === 'function') {
      try {
        const sid = await window.ensureSession();
        return sid || getSidSync();
      } catch (_) {
        return getSidSync();
      }
    }
    return null;
  }

  // Previews should not inherit the viewer's dynamic range settings.
  // We start a lightweight, private session SID used ONLY for preview image URLs,
  // so previews always use the backend's preview-friendly auto-stretch.
  let __previewSid = null;
  let __previewSidPromise = null;
  async function getPreviewSidAsync() {
    if (__previewSid) return __previewSid;
    if (__previewSidPromise) return __previewSidPromise;
    __previewSidPromise = (async () => {
      try {
        const r = await fetch('/session/start', { credentials: 'same-origin' });
        if (!r.ok) throw new Error(`Failed to start preview session (${r.status})`);
        const j = await r.json();
        const sid = (j && (j.session_id || j.sessionId || j.sid)) || null;
        if (sid) {
          __previewSid = String(sid);
          return __previewSid;
        }
      } catch (_) {}
      // Fallback to the main session if preview session bootstrap fails.
      return await getSidAsync();
    })().finally(() => {
      // Keep the promise around only if we didn't get a SID; otherwise allow GC.
      if (__previewSid) __previewSidPromise = null;
    });
    return __previewSidPromise;
  }

  function makePreviewUrl(filepath, hduIndex, maxDim, sid) {
    const v = (window.APP_ASSET_VERSION || Date.now()) + '-' + Date.now();
    const params = new URLSearchParams();
    params.set('filepath', String(filepath || ''));
    params.set('hdu', String(hduIndex));
    params.set('max_dim', String(maxDim || 560));
    params.set('v', String(v));
    if (sid) params.set('sid', String(sid));
    return `/fits/preview/?${params.toString()}`;
  }

  function makeCubeOverviewUrl(filepath, hduIndex, sliceIndex, sid) {
    const v = (window.APP_ASSET_VERSION || Date.now()) + '-' + Date.now();
    const params = new URLSearchParams();
    params.set('filepath', String(filepath || ''));
    params.set('hdu', String(hduIndex));
    params.set('slice_index', String(sliceIndex || 0));
    params.set('v', String(v));
    if (sid) params.set('sid', String(sid));
    return `/cube/overview/?${params.toString()}`;
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function pickInitialIndex(hduList) {
    const r = Array.isArray(hduList) ? hduList.findIndex((h) => h && h.isRecommended) : -1;
    return r >= 0 ? r : 0;
  }

  // Backwards compatibility: keep the old global name used by callers.
  window.createHduOpenerPopup = function createHduOpenerPopup(hduList, filepath) {
    const popupDoc = getPopupDoc();
    removeExisting(popupDoc);

    const state = {
      filepath: filepath,
      hduList: Array.isArray(hduList) ? hduList : [],
      query: '',
      visible: [],
      activePos: 0,
      // Show 5 stacked cards (front + 4 behind).
      maxStack: 5,
    };

    // Build visible index list (original HDU indices).
    const refreshVisible = () => {
      const q = (state.query || '').trim().toLowerCase();
      state.visible = state.hduList
        .map((h, idx) => ({ h, idx }))
        .filter(({ h, idx }) => {
          if (!q) return true;
          let text = `hdu ${idx} ${safeText(h && h.type)} ${safeText(h && h.name)} `;
          if (h && h.dimensions) text += safeText(h.dimensions.join('x')) + ' ';
          if (h && h.bunit) text += safeText(h.bunit) + ' ';
          if (h && h.rows != null) text += safeText(h.rows) + ' ';
          if (h && h.columns != null) text += safeText(h.columns) + ' ';
          return text.toLowerCase().includes(q);
        })
        .map(({ idx }) => idx);

      state.activePos = clamp(state.activePos, 0, Math.max(0, state.visible.length - 1));
    };

    // Root (full-screen overlay) — keeps the requested id.
    const root = el(popupDoc, 'div');
    root.id = 'hdu-selector-popup';
    root.className = 'tm-hdu-popup';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Select HDU to display');
    root.tabIndex = -1;

    const backdrop = el(popupDoc, 'div', { className: 'tm-hdu-backdrop' });
    const windowEl = el(popupDoc, 'div', { className: 'tm-hdu-window' });

    // Header
    const header = el(popupDoc, 'div', { className: 'tm-hdu-header' });
    const title = el(popupDoc, 'div', { className: 'tm-hdu-title' });
    title.textContent = 'Select HDU to Display';
    const subtitle = el(popupDoc, 'div', { className: 'tm-hdu-subtitle' });
    const __baseName = String(filepath || '').split('/').filter(Boolean).pop() || '';
    subtitle.textContent = __baseName ? `File: ${__baseName}` : 'File: (unknown)';
    try {
      subtitle.title = String(filepath || __baseName || '');
    } catch (_) {}
    const titleWrap = el(popupDoc, 'div', { className: 'tm-hdu-titlewrap' });
    titleWrap.appendChild(title);
    titleWrap.appendChild(subtitle);

    const closeBtn = el(popupDoc, 'button', { className: 'tm-hdu-close', type: 'button' });
    closeBtn.innerHTML = '&times;';
    closeBtn.title = 'Close';
    closeBtn.setAttribute('aria-label', 'Close');

    header.appendChild(titleWrap);
    header.appendChild(closeBtn);

    // Layout: stage + side panel
    const layout = el(popupDoc, 'div', { className: 'tm-hdu-layout' });
    const stage = el(popupDoc, 'div', { className: 'tm-hdu-stage' });
    const stack = el(popupDoc, 'div', { className: 'tm-hdu-stack' });

    stage.appendChild(stack);

    const side = el(popupDoc, 'div', { className: 'tm-hdu-side' });
    const searchWrap = el(popupDoc, 'div', { className: 'tm-hdu-searchwrap' });
    const search = el(popupDoc, 'input', { className: 'tm-hdu-search' });
    search.type = 'text';
    search.placeholder = 'Search HDUs…';
    search.setAttribute('aria-label', 'Search HDUs');
    searchWrap.appendChild(search);

    const list = el(popupDoc, 'div', { className: 'tm-hdu-list', role: 'listbox' });
    list.setAttribute('aria-label', 'HDU list');

    side.appendChild(searchWrap);
    side.appendChild(list);

    layout.appendChild(stage);
    layout.appendChild(side);

    // Footer buttons
    const footer = el(popupDoc, 'div', { className: 'tm-hdu-footer' });
    const cancelBtn = el(popupDoc, 'button', { className: 'tm-hdu-btn tm-hdu-btn--cancel', type: 'button' });
    cancelBtn.textContent = 'Cancel';
    const restoreBtn = el(popupDoc, 'button', { className: 'tm-hdu-btn tm-hdu-btn--primary', type: 'button' });
    restoreBtn.textContent = 'Open Selected HDU';

    footer.appendChild(cancelBtn);
    footer.appendChild(restoreBtn);

    windowEl.appendChild(header);
    windowEl.appendChild(layout);
    windowEl.appendChild(footer);

    root.appendChild(backdrop);
    root.appendChild(windowEl);
    popupDoc.body.appendChild(root);

    // State init
    refreshVisible();
    const initialOriginal = pickInitialIndex(state.hduList);
    const initialPos = Math.max(0, state.visible.indexOf(initialOriginal));
    state.activePos = initialPos;

    // Rendering
    const listItemEls = new Map(); // originalIndex -> element
    let __imgReqSeq = 0;

    function setPlaceholderSvg(imgEl) {
      try {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#1a1a1e"/>
      <stop offset="1" stop-color="#0c0c0f"/>
    </linearGradient>
  </defs>
  <rect width="800" height="500" fill="url(#g)"/>
  <path d="M0 360 C120 330 180 410 310 380 C460 345 520 420 800 365 L800 500 L0 500 Z" fill="rgba(255,255,255,0.05)"/>
</svg>`;
        imgEl.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      } catch (_) {}
    }

    function setPreviewNone(imgEl, message = 'No preview') {
      const reqId = ++__imgReqSeq;
      imgEl.dataset.tmReqId = String(reqId);
      try {
        // Use a neutral placeholder so the card isn't blank, then show message.
        setPlaceholderSvg(imgEl);
        imgEl.classList.remove('is-error');
        if (imgEl.__spinnerEl) imgEl.__spinnerEl.classList.remove('is-visible');
        if (imgEl.__emptyEl) {
          imgEl.__emptyEl.textContent = message;
          imgEl.__emptyEl.classList.add('is-visible');
        }
        if (imgEl.__statusEl) {
          imgEl.__statusEl.textContent = message;
          imgEl.__statusEl.classList.add('is-visible');
        }
      } catch (_) {}
    }

    function setPreviewUrl(imgEl, url) {
      const reqId = ++__imgReqSeq;
      imgEl.dataset.tmReqId = String(reqId);
      try {
        imgEl.classList.remove('is-error');
        if (imgEl.__spinnerEl) imgEl.__spinnerEl.classList.add('is-visible');
        if (imgEl.__emptyEl) imgEl.__emptyEl.classList.remove('is-visible');
        if (imgEl.__statusEl) imgEl.__statusEl.classList.remove('is-visible');
      } catch (_) {}

      try {
        imgEl.addEventListener(
          'load',
          () => {
            if (imgEl.dataset.tmReqId !== String(reqId)) return;
            if (imgEl.__spinnerEl) imgEl.__spinnerEl.classList.remove('is-visible');
          },
          { once: true }
        );
      } catch (_) {}

      imgEl.src = url;
    }

    function setPreviewForHdu(imgEl, originalIdx, hdu, isActive) {
      const dims = (hdu && hdu.dimensions) || null;
      const type = (hdu && hdu.type) || '';
      const isImageish = type === 'Image' || type === 'Primary';
      const ndim = Array.isArray(dims) ? dims.length : 0;

      const sid = __previewSid || getSidSync();
      if (!sid) {
        // Session might not be ready yet; wait and re-run with a preview-only SID.
        getPreviewSidAsync().then(() => {
          if (imgEl && imgEl.isConnected) setPreviewForHdu(imgEl, originalIdx, hdu, isActive);
        });
        return;
      }

      if (!isImageish || ndim < 2) {
        setPreviewNone(imgEl, 'No data');
        return;
      }
      if (ndim === 2) {
        setPreviewUrl(imgEl, makePreviewUrl(state.filepath, originalIdx, isActive ? 600 : 500, sid));
        return;
      }
      // Cube (ndim >= 3): show slice 0 overview.
      setPreviewUrl(imgEl, makeCubeOverviewUrl(state.filepath, originalIdx, 0, sid));
    }

    function updateRestoreState() {
      const total = state.visible.length;
      if (total <= 0) {
        restoreBtn.disabled = true;
        return;
      }
      restoreBtn.disabled = false;
    }

    // Keep N cards mounted so transform transitions animate.
    const stackCards = [];

    function pickCardAtPoint(clientX, clientY) {
      let best = null;
      let bestDepth = 999;
      try {
        for (const c of stackCards) {
          if (!c || !c.isConnected) continue;
          if (c.style && c.style.opacity === '0') continue;
          const r = c.getBoundingClientRect();
          if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) continue;

          const depth = Number(c.__tmDepth);
          const d = isFinite(depth) ? depth : 999;

          if (c.classList && c.classList.contains('is-peek')) {
            const peekPx = Number(c.__tmPeekPx) || 0;
            if (peekPx > 0 && clientY > r.top + peekPx) continue; // only the visible strip is clickable
          }

          if (d < bestDepth) {
            best = c;
            bestDepth = d;
          }
        }
      } catch (_) {
        return null;
      }
      return best;
    }

    function buildCard() {
      const card = el(popupDoc, 'div', { className: 'tm-hdu-card' });
      const preview = el(popupDoc, 'div', { className: 'tm-hdu-cardpreview' });
      const img = el(popupDoc, 'img', { className: 'tm-hdu-cardimg' });
      img.alt = 'HDU preview';
      img.loading = 'eager';
      img.decoding = 'async';
      const peekLabel = el(popupDoc, 'div', { className: 'tm-hdu-peeklabel' });
      peekLabel.textContent = '';
      const status = el(popupDoc, 'div', { className: 'tm-hdu-cardstatus' });
      status.textContent = '';
      const loading = el(popupDoc, 'div', { className: 'tm-hdu-preview-loading', role: 'status' });
      loading.setAttribute('aria-label', 'Loading preview');
      loading.innerHTML = '<div class="tm-hdu-spinner" aria-hidden="true"></div><div class="tm-hdu-preview-empty" aria-hidden="true">No preview</div>';
      img.__spinnerEl = loading;
      try {
        img.__emptyEl = loading.querySelector('.tm-hdu-preview-empty');
      } catch (_) {
        img.__emptyEl = null;
      }
      img.__statusEl = status;
      img.addEventListener('error', () => {
        // Keep a visible placeholder and show message instead of a blank card.
        setPreviewNone(img, 'No data');
        try {
          if (img.dataset.tmReqId && img.__spinnerEl) img.__spinnerEl.classList.remove('is-visible');
          if (img.__emptyEl) img.__emptyEl.classList.add('is-visible');
        } catch (_) {}
      });
      preview.appendChild(img);
      preview.appendChild(peekLabel);
      preview.appendChild(status);
      preview.appendChild(loading);

      const overlay = el(popupDoc, 'div', { className: 'tm-hdu-cardoverylay' });
      const cardTitle = el(popupDoc, 'div', { className: 'tm-hdu-cardtitle' });
      const cardMeta = el(popupDoc, 'div', { className: 'tm-hdu-cardmeta' });
      overlay.appendChild(cardTitle);
      overlay.appendChild(cardMeta);

      card.appendChild(preview);
      card.appendChild(overlay);

      card.__img = img;
      card.__title = cardTitle;
      card.__meta = cardMeta;
      card.__peekLabel = peekLabel;

      let __peekLeaveT = null;
      const liftPeek = () => {
        try {
          if (!card.classList.contains('is-peek')) return;
          const d = Number(card.__tmDepth);
          if (!isFinite(d) || d <= 0) return;
          if (__peekLeaveT) {
            clearTimeout(__peekLeaveT);
            __peekLeaveT = null;
          }
          card.classList.add('is-peek-hover');
          // Expand the clickable/visible strip first so lifting doesn't instantly "un-hover".
          try {
            const curPeek = parseFloat((card.style.getPropertyValue('--tm-peek') || '').replace('px', '')) || 0;
            const nextPeek = Math.max(curPeek, 160);
            card.style.setProperty('--tm-peek', `${nextPeek}px`);
          } catch (_) {}

          const lift = 44;
          const x = Number(card.__tmX) || 0;
          const y = (Number(card.__tmY) || 0) - lift;
          const z = Number(card.__tmZ) || 0;
          const s = Number(card.__tmScale) || 1;
          // Ensure the lifted card stays above everything else for click targeting.
          card.style.zIndex = String(900 - d);
          card.style.transform = `translate3d(${x}px, ${y}px, ${z}px) scale(${s})`;
        } catch (_) {}
      };
      const dropPeek = () => {
        try {
          const d = Number(card.__tmDepth);
          if (!isFinite(d)) return;
          const x = Number(card.__tmX) || 0;
          const y = Number(card.__tmY) || 0;
          const z = Number(card.__tmZ) || 0;
          const s = Number(card.__tmScale) || 1;
          card.classList.remove('is-peek-hover');
          card.style.zIndex = String(card.classList.contains('is-peek') ? (500 - d) : 100);
          card.style.transform = `translate3d(${x}px, ${y}px, ${z}px) scale(${s})`;
        } catch (_) {}
      };

      // Expose for the stack-level hover manager (more reliable than per-card hover).
      card.__liftPeek = liftPeek;
      card.__dropPeek = dropPeek;

      const activateFromCard = () => {
        const pos = parseInt(card.dataset.pos || '', 10);
        if (!isFinite(pos)) return;
        const target = clamp(pos, 0, Math.max(0, state.visible.length - 1));

        // Promote the clicked *card element* to the front visually, then select its HDU.
        // This guarantees the clicked peek card comes to center even if delta logic doesn't match.
        try {
          const idx = stackCards.indexOf(card);
          const maxRotatable = Math.max(1, Math.min(stackCards.length - 1, (Number(state.maxStack) || 5) - 1));
          if (idx > 0 && idx <= maxRotatable) {
            for (let i = 0; i < idx; i++) {
              stackCards.push(stackCards.shift());
            }
          }
        } catch (_) {}

        state.activePos = target;
        renderAll();

        // Keep active item in view in the right list.
        const activeOriginal = state.visible[state.activePos];
        const activeEl = listItemEls.get(activeOriginal);
        if (activeEl && typeof activeEl.scrollIntoView === 'function') {
          try {
            activeEl.scrollIntoView({ block: 'nearest' });
          } catch (_) {}
        }
      };
      card.__activate = activateFromCard;
      card.addEventListener('click', activateFromCard);
      card.addEventListener('dblclick', () => {
        const pos = parseInt(card.dataset.pos || '', 10);
        if (isFinite(pos)) {
          state.activePos = clamp(pos, 0, Math.max(0, state.visible.length - 1));
          renderAll();
          doRestore();
        }
      });

      return card;
    }

    function ensureStackCards() {
      if (stackCards.length) return;
      const n = Math.max(3, Math.min(7, Number(state.maxStack) || 5));
      for (let i = 0; i < n; i++) {
        const c = buildCard();
        stackCards.push(c);
        stack.appendChild(c);
      }
    }

    function updateListSelection() {
      listItemEls.forEach((el2, originalIdx) => {
        const activeOriginalIdx = state.visible[state.activePos];
        const isActive = originalIdx === activeOriginalIdx;
        el2.classList.toggle('is-active', isActive);
        if (isActive) el2.setAttribute('aria-selected', 'true');
        else el2.setAttribute('aria-selected', 'false');
      });
    }

    function renderList() {
      list.innerHTML = '';
      listItemEls.clear();

      if (state.visible.length === 0) {
        const empty = el(popupDoc, 'div', { className: 'tm-hdu-empty' });
        empty.textContent = 'No HDUs found for that search.';
        list.appendChild(empty);
        return;
      }

      state.visible.forEach((originalIdx, pos) => {
        const hdu = state.hduList[originalIdx] || {};
        const item = el(popupDoc, 'div', { className: 'tm-hdu-listitem', role: 'option' });
        item.tabIndex = 0;
        item.dataset.originalIndex = String(originalIdx);
        item.dataset.pos = String(pos);

        const top = el(popupDoc, 'div', { className: 'tm-hdu-listtop' });
        const label = el(popupDoc, 'div', { className: 'tm-hdu-listlabel' });
        label.textContent = `HDU ${originalIdx}: ${safeText(hdu.type || 'Unknown')}${hdu.name ? ` (${safeText(hdu.name)})` : ''}`;
        top.appendChild(label);

        const meta = el(popupDoc, 'div', { className: 'tm-hdu-listmeta' });
        meta.textContent = buildMetaLines(hdu).slice(0, 2).join(' • ');

        item.appendChild(top);
        item.appendChild(meta);

        item.addEventListener('click', () => {
          jump(pos - state.activePos);
        });
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            state.activePos = pos;
            renderAll();
            doRestore();
          }
        });

        list.appendChild(item);
        listItemEls.set(originalIdx, item);
      });
    }

    function renderStack() {
      ensureStackCards();
      const total = state.visible.length;
      if (total === 0) {
        stackCards.forEach((c) => {
          c.style.opacity = '0';
          c.style.pointerEvents = 'none';
        });
        return;
      }

      const activePos = clamp(state.activePos, 0, total - 1);
      const maxN = Math.min(stackCards.length || 0, Math.max(1, Number(state.maxStack) || 5), total);

      const applyDepthStyle = (card, depth, isActive) => {
        // Match the reference image: a clean "stacked sheets" look.
        // depth: 0 = active (front), depth>=1 = behind with only a top strip visible.
        const baseY = 44; // push the whole stack down so the peek strips aren't clipped
        const peekOffset = 24; // how much each behind card rises above the one in front
        const x = 0;
        const y = baseY - depth * peekOffset;
        const z = -depth; // tiny z separation just for ordering
        const scale = 1 - depth * 0.01;

        card.__tmDepth = depth;
        card.__tmX = x;
        card.__tmY = y;
        card.__tmZ = z;
        card.__tmScale = scale;

        card.style.transform = `translate3d(${x}px, ${y}px, ${z}px) scale(${scale})`;
        card.style.opacity = '1';
        card.style.filter = 'none';

        // Reset any hover lift on re-render.
        card.classList.remove('is-peek-hover');

        // Tell CSS to "clip to strip" for behind cards.
        const isPeek = !isActive && depth > 0;
        card.classList.toggle('is-peek', isPeek);
        if (isPeek) {
          // Slightly smaller strip for deeper cards.
          const peekPx = Math.max(44, 104 - depth * 10);
          card.style.setProperty('--tm-peek', `${peekPx}px`);
          card.__tmPeekPx = peekPx;
        } else {
          card.style.removeProperty('--tm-peek');
          card.__tmPeekPx = 0;
        }

        // Critical for hover/click: make peek strips sit ABOVE the front card.
        // Because the element is clipped, only the strip area will capture pointer events.
        card.style.zIndex = String(isPeek ? (500 - depth) : 100);
      };

      // Build up to N positions to display.
      // Prefer previous HDUs, but if we're at the start, fill remaining slots with next ones.
      const positions = [];
      const tryPush = (p) => {
        if (!isFinite(p)) return;
        if (p < 0 || p >= total) return;
        if (positions.includes(p)) return;
        positions.push(p);
      };
      tryPush(activePos);
      for (let i = 1; i < maxN; i++) tryPush(activePos - i);
      // If at the start, fill remaining with nexts.
      for (let i = 1; positions.length < maxN && i < maxN + 2; i++) tryPush(activePos + i);

      // Ensure we always have up to maxN.
      while (positions.length < maxN && positions.length < total) {
        tryPush(activePos + positions.length);
      }

      // Slot 0 is active. Slots 1.. are "behind".
      for (let depth = 0; depth < stackCards.length; depth++) {
        const pos = positions[depth];
        const card = stackCards[depth];
        if (!card) continue;

        if (pos == null) {
          card.style.opacity = '0';
          card.style.pointerEvents = 'none';
          card.classList.remove('is-peek', 'is-active');
          continue;
        }

        const originalIdx = state.visible[pos];
        const hdu = state.hduList[originalIdx] || {};
        const isActive = pos === activePos;

        const prevOriginalIdx = card.dataset.originalIndex || '';
        card.classList.toggle('is-active', isActive);
        card.dataset.originalIndex = String(originalIdx);
        card.dataset.pos = String(pos);
        card.style.pointerEvents = 'auto';

        applyDepthStyle(card, depth, isActive);

        // Only update heavy content if the card actually changed.
        if (prevOriginalIdx !== String(originalIdx)) {
          card.__img.alt = `Preview for HDU ${originalIdx}`;
          card.__title.textContent = `HDU ${originalIdx} • ${safeText(hdu.type || 'Unknown')}${hdu.name ? ` • ${safeText(hdu.name)}` : ''}`;
          card.__meta.textContent = buildMetaLines(hdu).slice(0, 3).join(' • ');
          try {
            const nm = safeText(hdu && hdu.name).trim();
            if (card.__peekLabel) card.__peekLabel.textContent = nm ? `HDU ${originalIdx} • ${nm}` : `HDU ${originalIdx}`;
          } catch (_) {}
          setPreviewForHdu(card.__img, originalIdx, hdu, isActive);
        } else {
          // Ensure spinner stays hidden if we didn't change the src.
          try {
            if (card.__img.__spinnerEl) card.__img.__spinnerEl.classList.remove('is-visible');
          } catch (_) {}
        }

        // Animate between transforms (replace + recede).
        try {
          const nextT = card.style.transform || '';
          const prevT = card.__lastTransform || '';
          const nextO = card.style.opacity || '';
          const prevO = card.__lastOpacity || '';
          if (prevT && prevT !== nextT) {
            if (card.__anim) card.__anim.cancel();
            card.__anim = card.animate(
              [
                { transform: prevT, opacity: prevO || nextO },
                { transform: nextT, opacity: nextO },
              ],
              { duration: 420, easing: 'cubic-bezier(0.16, 0.84, 0.18, 1)' }
            );
          }
          card.__lastTransform = nextT;
          card.__lastOpacity = nextO;
        } catch (_) {}
      }

      // Add a short "whoosh" class to enhance perceived motion.
      try {
        stack.classList.remove('tm-hdu-stack--switch');
        // Force reflow so the class re-add triggers transitions predictably.
        void stack.offsetWidth;
        stack.classList.add('tm-hdu-stack--switch');
        setTimeout(() => {
          try {
            stack.classList.remove('tm-hdu-stack--switch');
          } catch (_) {}
        }, 420);
      } catch (_) {}
    }

    function renderAll() {
      updateRestoreState();
      renderStack();
      updateListSelection();
    }

    function doClose() {
      try {
        popupDoc.removeEventListener('keydown', onKeyDown, true);
      } catch (_) {}
      removeExisting(popupDoc);
    }

    function doRestore() {
      const total = state.visible.length;
      if (total <= 0) return;
      const pos = clamp(state.activePos, 0, total - 1);
      const originalIdx = state.visible[pos];
      if (typeof window.selectHdu === 'function') {
        try {
          window.selectHdu(originalIdx, state.filepath);
        } catch (_) {
          // If some build uses the async version, calling without await is fine; it handles errors.
        }
      }
      doClose();
    }

    function jump(delta) {
      const total = state.visible.length;
      if (total <= 0) return;
      const from = clamp(state.activePos, 0, total - 1);
      const to = clamp(state.activePos + delta, 0, total - 1);
      if (to === from) return;

      // Rotate the mounted card elements so the chosen card visibly moves to the front.
      // For click selection on a peek card, this makes that *card* come to the front (not just its content).
      const stepCount = Math.abs(to - from);
      ensureStackCards();
      const maxRotatable = Math.max(1, Math.min(stackCards.length - 1, (Number(state.maxStack) || 5) - 1));
      if (stepCount >= 1 && stepCount <= maxRotatable) {
        if (to > from) {
          // Next: last -> first (repeat)
          for (let i = 0; i < stepCount; i++) {
            stackCards.unshift(stackCards.pop());
          }
        } else {
          // Previous: first -> last (repeat)
          for (let i = 0; i < stepCount; i++) {
            stackCards.push(stackCards.shift());
          }
        }
      }

      state.activePos = to;
      renderAll();

      // Keep active item in view in the right list.
      const activeOriginal = state.visible[state.activePos];
      const activeEl = listItemEls.get(activeOriginal);
      if (activeEl && typeof activeEl.scrollIntoView === 'function') {
        try {
          activeEl.scrollIntoView({ block: 'nearest' });
        } catch (_) {}
      }
    }

    function onKeyDown(e) {
      if (!e) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        doClose();
        return;
      }
      if (e.key === 'Enter') {
        // Only restore if focus isn't inside the search field (lets user type Enter in some IME cases).
        if (popupDoc.activeElement !== search) {
          e.preventDefault();
          doRestore();
        }
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        jump(1);
        return;
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        jump(-1);
        return;
      }
      if (e.key === 'PageDown') {
        e.preventDefault();
        jump(5);
        return;
      }
      if (e.key === 'PageUp') {
        e.preventDefault();
        jump(-5);
        return;
      }
      if (e.key === 'Home') {
        e.preventDefault();
        state.activePos = 0;
        renderAll();
        return;
      }
      if (e.key === 'End') {
        e.preventDefault();
        state.activePos = Math.max(0, state.visible.length - 1);
        renderAll();
        return;
      }
    }

    // Events
    backdrop.addEventListener('click', doClose);
    closeBtn.addEventListener('click', doClose);
    cancelBtn.addEventListener('click', doClose);
    restoreBtn.addEventListener('click', doRestore);

    search.addEventListener('input', () => {
      state.query = search.value || '';
      const prevActiveOriginal = state.visible[state.activePos];
      refreshVisible();

      // Preserve the same original selection when possible.
      const nextPos = state.visible.indexOf(prevActiveOriginal);
      if (nextPos >= 0) state.activePos = nextPos;
      else state.activePos = clamp(state.activePos, 0, Math.max(0, state.visible.length - 1));

      renderList();
      renderAll();
    });

    stage.addEventListener(
      'wheel',
      (e) => {
        if (!e) return;
        e.preventDefault();
        const dy = e.deltaY || 0;
        if (Math.abs(dy) < 2) return;
        jump(dy > 0 ? 1 : -1);
      },
      { passive: false }
    );

    // Hover manager: reliably lift peek cards (geometry-based; does not depend on z-index hit testing).
    let __hoveredPeekCard = null;
    let __hoverRAF = 0;
    let __lastPtrEvent = null;
    const updateHover = () => {
      __hoverRAF = 0;
      const e = __lastPtrEvent;
      if (!e) return;
      let card = null;
      // Find the topmost peek strip under the pointer using bounding boxes + peek height.
      // This avoids cases where another layer steals hover/click.
      try {
        for (const c of stackCards) {
          if (!c || !c.classList || !c.classList.contains('is-peek')) continue;
          const r = c.getBoundingClientRect();
          const peekPx = Number(c.__tmPeekPx) || 0;
          if (!peekPx) continue;
          const withinX = e.clientX >= r.left && e.clientX <= r.right;
          const withinY = e.clientY >= r.top && e.clientY <= r.top + peekPx;
          if (!withinX || !withinY) continue;
          // Prefer the one closest to the front (smaller depth).
          if (!card) {
            card = c;
          } else {
            const d0 = Number(card.__tmDepth) || 999;
            const d1 = Number(c.__tmDepth) || 999;
            if (d1 < d0) card = c;
          }
        }
      } catch (_) {
        card = null;
      }

      if (card === __hoveredPeekCard) return;
      try {
        if (__hoveredPeekCard && typeof __hoveredPeekCard.__dropPeek === 'function') __hoveredPeekCard.__dropPeek();
      } catch (_) {}
      __hoveredPeekCard = card;
      try {
        if (__hoveredPeekCard && typeof __hoveredPeekCard.__liftPeek === 'function') __hoveredPeekCard.__liftPeek();
      } catch (_) {}
    };

    stack.addEventListener('pointermove', (e) => {
      __lastPtrEvent = e;
      if (__hoverRAF) return;
      __hoverRAF = requestAnimationFrame(updateHover);
    });
    // Fallback for environments where pointer events are flaky.
    stack.addEventListener('mousemove', (e) => {
      __lastPtrEvent = e;
      if (__hoverRAF) return;
      __hoverRAF = requestAnimationFrame(updateHover);
    });
    stack.addEventListener('pointerleave', () => {
      try {
        if (__hoverRAF) cancelAnimationFrame(__hoverRAF);
      } catch (_) {}
      __hoverRAF = 0;
      __lastPtrEvent = null;
      try {
        if (__hoveredPeekCard && typeof __hoveredPeekCard.__dropPeek === 'function') __hoveredPeekCard.__dropPeek();
      } catch (_) {}
      __hoveredPeekCard = null;
    });

    // Click fallback: if clicks land on the stack (not on a card), promote the card under the pointer.
    stack.addEventListener(
      'click',
      (e) => {
        try {
          const t = e && e.target;
          if (t && t.closest && t.closest('.tm-hdu-card')) return; // normal path
          const picked = pickCardAtPoint(e.clientX, e.clientY);
          if (picked && typeof picked.__activate === 'function') {
            picked.__activate();
          }
        } catch (_) {}
      },
      true
    );

    // Initial render
    renderList();
    renderAll();

    // Keyboard handling at the document level to feel like a modal.
    popupDoc.addEventListener('keydown', onKeyDown, true);

    // Focus: start on search for fast filtering.
    setTimeout(() => {
      try {
        search.focus();
        search.select();
      } catch (_) {}
    }, 50);

    // Return root for potential callers.
    return root;
  };
  // Alias for older callers.
  try {
    window.createTimeMachineHduSelectorPopup = window.createHduOpenerPopup;
  } catch (_) {}
})();


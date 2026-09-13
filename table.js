(function () {
  'use strict';

  const viewport = document.getElementById('viewport');
  const stage    = document.getElementById('stage');

  const thumb = f => 'thumbs/' + f;
  const mid   = f => 'mid/' + f;

  /* ---------- deterministic scatter ----------
     A seeded PRNG so the table looks hand-strewn but identical on every visit. */

  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  // Each note is laid out as its two sides side by side, so front and back stay
  // visibly one object. CELL_* are the slot a pair sits in — larger than the pair
  // itself, and that difference is the space between notes on the table.
  const SIDE_W   = 300;   // one side's card
  const PAIR_GAP = 26;    // between a note's front and back
  const CELL_W   = 820;
  const CELL_H   = 300;

  // Shape the lattice to the screen it opens on, so "Fit" fills the viewport
  // instead of letterboxing a very wide table into a narrow band.
  const aspect = Math.max(0.6, Math.min(2.4, innerWidth / innerHeight));
  const COLS = Math.max(2, Math.round(Math.sqrt(NOTES.length * aspect * (CELL_H / CELL_W))));

  const rand = rng(20260913);

  NOTES.forEach((note, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    // stagger alternate rows, then jitter, so the lattice never reads as a grid
    const offset = (row % 2) * CELL_W * 0.45;
    note._x = col * CELL_W + offset + (rand() - 0.5) * 90;
    note._y = row * CELL_H + (rand() - 0.5) * 70;
    note._w = SIDE_W * (0.88 + rand() * 0.24); // both sides share one width
    // a small independent tilt per side, as if each was set down separately
    note._rot = note.sides.map(() => (rand() - 0.5) * 9);

    const face = note.sides[0];
    note._pw = note.sides.length * note._w + (note.sides.length - 1) * PAIR_GAP;
    note._ph = note._w * (face.h / face.w);
  });

  const bounds = NOTES.reduce((b, n) => ({
    minX: Math.min(b.minX, n._x),
    minY: Math.min(b.minY, n._y),
    maxX: Math.max(b.maxX, n._x + n._pw),
    maxY: Math.max(b.maxY, n._y + n._ph)
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

  /* ---------- build the table ---------- */

  document.getElementById('hudCount').textContent =
    NOTES.length + ' notes · ' + new Set(NOTES.map(n => n.country)).size + ' countries';

  NOTES.forEach((note, i) => {
    const pair = document.createElement('div');
    pair.className = 'pair';
    pair.style.left = note._x + 'px';
    pair.style.top  = note._y + 'px';
    pair.style.gap  = PAIR_GAP + 'px';

    note.sides.forEach((side, si) => {
      const el = document.createElement('button');
      el.className = 'note';
      el.type = 'button';
      el.dataset.i = i;
      el.dataset.side = si;
      el.dataset.label = `${note.country} · ${note.denom} ${note.currency} — ${side.side}`;
      el.setAttribute('aria-label',
        `${note.country}, ${note.denom} ${note.currency}, ${side.side}`);
      el.style.setProperty('--r', note._rot[si] + 'deg');
      el.style.width = note._w + 'px';

      const img = document.createElement('img');
      img.src = thumb(side.file);
      img.alt = '';
      // Not lazy: the stage is CSS-scaled, so intersection never fires for
      // off-centre cards and most of the table would stay blank.
      img.decoding = 'async';
      img.draggable = false;
      img.width = side.w;
      img.height = side.h;

      el.appendChild(img);
      pair.appendChild(el);
    });

    stage.appendChild(pair);
    note._el = pair;
  });

  /* ---------- pan & zoom ---------- */

  let scale = 1, tx = 0, ty = 0;
  // MIN is derived from whatever "fit" needs, so fit is never clamped short of
  // showing the whole table — a fixed floor breaks on small viewports.
  let MIN = 0.18;
  const MAX = 2.6;

  function apply() {
    stage.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }

  function fitScale() {
    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;
    const pad = Math.min(90, innerWidth * 0.06);
    return Math.min((innerWidth - pad * 2) / w, (innerHeight - pad * 2) / h);
  }

  function fit(animate) {
    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;
    const s = fitScale();
    MIN = Math.min(0.18, s * 0.85);
    scale = Math.max(MIN, Math.min(MAX, s));
    tx = (innerWidth  - w * scale) / 2 - bounds.minX * scale;
    ty = (innerHeight - h * scale) / 2 - bounds.minY * scale;
    stage.style.transition = animate ? 'transform .6s cubic-bezier(.2,.7,.3,1)' : '';
    apply();
    if (animate) setTimeout(() => { stage.style.transition = ''; }, 620);
  }

  // zoom about a screen point, so the note under the cursor stays put
  function zoomAt(px, py, factor) {
    const next = Math.max(MIN, Math.min(MAX, scale * factor));
    if (next === scale) return;
    tx = px - (px - tx) * (next / scale);
    ty = py - (py - ty) * (next / scale);
    scale = next;
    apply();
  }

  viewport.addEventListener('wheel', e => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0016));
  }, { passive: false });

  // pointer drag, with a small threshold so a click still reads as a click
  let dragging = false, moved = false, sx = 0, sy = 0, ox = 0, oy = 0, pid = null;

  viewport.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    dragging = true; moved = false;
    sx = e.clientX; sy = e.clientY; ox = tx; oy = ty; pid = e.pointerId;
    viewport.setPointerCapture(pid);
    viewport.classList.add('dragging');
    hideHint();
  });

  viewport.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (!moved && Math.hypot(dx, dy) > 4) moved = true;
    if (!moved) return;
    tx = ox + dx; ty = oy + dy;
    apply();
  });

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    viewport.classList.remove('dragging');
    if (pid !== null) { try { viewport.releasePointerCapture(pid); } catch (_) {} pid = null; }
  }

  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);

  // pinch on touch
  let pinch = null;
  viewport.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      const [a, b] = e.touches;
      pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) };
      endDrag();
    }
  }, { passive: true });

  viewport.addEventListener('touchmove', e => {
    if (pinch && e.touches.length === 2) {
      e.preventDefault();
      const [a, b] = e.touches;
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      zoomAt((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2, d / pinch.d);
      pinch.d = d;
    }
  }, { passive: false });

  viewport.addEventListener('touchend', e => { if (e.touches.length < 2) pinch = null; }, { passive: true });

  document.getElementById('zoomIn').addEventListener('click',
    () => zoomAt(innerWidth / 2, innerHeight / 2, 1.35));
  document.getElementById('zoomOut').addEventListener('click',
    () => zoomAt(innerWidth / 2, innerHeight / 2, 1 / 1.35));
  document.getElementById('zoomFit').addEventListener('click', () => fit(true));

  addEventListener('resize', () => { if (focusEl.hidden) fit(false); });

  const hintEl = document.getElementById('hint');
  let hintTimer = setTimeout(hideHint, 6000);
  function hideHint() { clearTimeout(hintTimer); hintEl.classList.add('fade'); }

  /* ---------- focus a note ---------- */

  const focusEl   = document.getElementById('focus');
  const card      = document.getElementById('card3d');
  const faceFront = document.getElementById('faceFront');
  const faceBack  = document.getElementById('faceBack');
  const btnFlip   = document.getElementById('btnFlip');
  const btnZoom   = document.getElementById('btnZoom');

  let cur = -1, flipped = false, inspecting = false;

  stage.addEventListener('click', e => {
    if (moved) return;                   // a drag that ended over a note is not a click
    const el = e.target.closest('.note');
    if (el) openNote(Number(el.dataset.i), Number(el.dataset.side));
  });

  // `side` opens the note already showing the face that was clicked
  function openNote(i, side) {
    if (cur >= 0 && NOTES[cur]._el) NOTES[cur]._el.classList.remove('is-open');
    cur = (i % NOTES.length + NOTES.length) % NOTES.length;
    const note = NOTES[cur];
    note._el.classList.add('is-open');

    flipped = side === 1 && note.sides.length > 1;
    setInspect(false);
    // land on the clicked face immediately; only later flips should animate
    card.style.transition = 'none';
    card.classList.toggle('flipped', flipped);
    void card.offsetWidth;
    card.style.transition = '';

    const front = note.sides[0];
    const back  = note.sides[1] || null;

    faceFront.src = mid(front.file);
    faceFront.alt = `${note.country} ${note.denom} ${note.currency}, ${front.side}`;

    if (back) {
      faceBack.src = mid(back.file);
      faceBack.alt = `${note.country} ${note.denom} ${note.currency}, ${back.side}`;
      faceBack.hidden = false;
      btnFlip.disabled = false;
      btnFlip.textContent = 'Turn over';
    } else {
      // single-sided: no verso to show, so the flip is suppressed rather than blank
      faceBack.removeAttribute('src');
      faceBack.hidden = true;
      btnFlip.disabled = true;
      btnFlip.textContent = 'One side only';
    }

    document.getElementById('fiRegion').textContent = note.region || '';
    document.getElementById('fiTitle').textContent  = `${note.country} · ${note.denom} ${note.currency}`;
    document.getElementById('fiSubject').textContent =
      (note.sides[flipped ? 1 : 0].subject) || '';
    document.getElementById('fiPos').textContent = `${cur + 1} / ${NOTES.length}`;

    const meta = document.getElementById('fiMeta');
    meta.innerHTML = '';
    [['Issuer', note.authority], ['Date', note.date], ['Serial', note.serial]]
      .filter(r => r[1])
      .forEach(([k, v]) => {
        const dt = document.createElement('dt'); dt.textContent = k;
        const dd = document.createElement('dd'); dd.textContent = v;
        meta.append(dt, dd);
      });

    focusEl.hidden = false;
    focusEl.focus?.();
    hideHint();
  }

  function closeNote() {
    focusEl.hidden = true;
    setInspect(false);
    if (cur >= 0 && NOTES[cur]._el) NOTES[cur]._el.classList.remove('is-open');
    cur = -1;
  }

  function flip() {
    if (btnFlip.disabled) return;
    flipped = !flipped;
    card.classList.toggle('flipped', flipped);
    const side = NOTES[cur].sides[flipped ? 1 : 0];
    document.getElementById('fiSubject').textContent = side.subject || '';
    setInspect(false);
  }

  /* ---------- inspect: magnify and track the pointer ---------- */

  const INSPECT = 2.1;

  function setInspect(on) {
    inspecting = on;
    card.classList.toggle('inspect', on);
    btnZoom.setAttribute('aria-pressed', String(on));
    btnZoom.textContent = on ? 'Step back' : 'Inspect';
    if (!on) card.style.transform = flipped ? 'rotateY(180deg)' : '';
  }

  function trackInspect(e) {
    if (!inspecting) return;
    const r = card.getBoundingClientRect();
    // how far the pointer sits from centre, as a fraction, clamped
    const nx = Math.max(-0.5, Math.min(0.5, (e.clientX - r.left) / r.width  - 0.5));
    const ny = Math.max(-0.5, Math.min(0.5, (e.clientY - r.top)  / r.height - 0.5));
    const shiftX = -nx * r.width  * (INSPECT - 1) / INSPECT;
    const shiftY = -ny * r.height * (INSPECT - 1) / INSPECT;
    card.style.transform =
      `scale(${INSPECT}) translate(${shiftX}px, ${shiftY}px)` + (flipped ? ' rotateY(180deg)' : '');
  }

  btnZoom.addEventListener('click', () => setInspect(!inspecting));
  btnFlip.addEventListener('click', flip);
  card.addEventListener('click', () => { if (inspecting) setInspect(false); });
  focusEl.addEventListener('pointermove', trackInspect);

  document.getElementById('focusClose').addEventListener('click', closeNote);
  document.getElementById('focusScrim').addEventListener('click', closeNote);
  document.getElementById('focusPrev').addEventListener('click', () => openNote(cur - 1));
  document.getElementById('focusNext').addEventListener('click', () => openNote(cur + 1));

  document.addEventListener('keydown', e => {
    if (focusEl.hidden) {
      if (e.key === '+' || e.key === '=') zoomAt(innerWidth / 2, innerHeight / 2, 1.35);
      if (e.key === '-') zoomAt(innerWidth / 2, innerHeight / 2, 1 / 1.35);
      if (e.key === '0') fit(true);
      return;
    }
    if (e.key === 'Escape')     { inspecting ? setInspect(false) : closeNote(); }
    if (e.key === 'ArrowLeft')  openNote(cur - 1);
    if (e.key === 'ArrowRight') openNote(cur + 1);
    if (e.key === 'f' || e.key === ' ') { e.preventDefault(); flip(); }
  });

  fit(false);
})();

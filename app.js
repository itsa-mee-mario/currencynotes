(function () {
  'use strict';

  const grid    = document.getElementById('grid');
  const empty   = document.getElementById('empty');
  const filters = document.getElementById('filters');

  // Two derivative tiers; the originals are never loaded by the page.
  // The one upside-down photo (IMAG0056) has its rotation baked into both tiers.
  const thumb = f => 'thumbs/' + f;
  const full  = f => 'mid/' + f;

  // `region` is baked into notes-data.js by the merge step; this is display order.
  const REGION_ORDER = ['Europe', 'Asia', 'Middle East', 'Africa', 'Americas', 'Oceania'];

  document.getElementById('tally').textContent =
    NOTES.length + ' notes · ' + new Set(NOTES.map(n => n.country)).size + ' countries';

  /* ---------- filters ---------- */

  const regions = ['All'].concat(
    REGION_ORDER.filter(r => NOTES.some(n => n.region === r))
  );
  let active = 'All';

  regions.forEach(r => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = r;
    b.setAttribute('aria-pressed', String(r === active));
    b.addEventListener('click', () => {
      active = r;
      filters.querySelectorAll('button').forEach(x =>
        x.setAttribute('aria-pressed', String(x.textContent === r)));
      render();
    });
    filters.appendChild(b);
  });

  /* ---------- grid ---------- */

  let visible = [];

  function render() {
    visible = active === 'All' ? NOTES.slice() : NOTES.filter(n => n.region === active);
    grid.innerHTML = '';
    empty.hidden = visible.length > 0;

    visible.forEach((note, i) => {
      const face = note.sides[0];

      const li = document.createElement('li');
      li.className = 'cell';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.pos = i;
      btn.setAttribute('aria-label',
        `${note.country}, ${note.denom} ${note.currency} — view detail`);

      const plate = document.createElement('div');
      plate.className = 'plate';

      const img = document.createElement('img');
      img.src = thumb(face.file);
      img.alt = `${note.country} ${note.denom} ${note.currency}, ${face.side}`;
      img.loading = 'lazy';
      img.decoding = 'async';
      // Reserve the right box before the file lands, so the grid never reflows.
      img.width = face.w;
      img.height = face.h;

      plate.appendChild(img);

      const cap = document.createElement('figcaption');
      cap.innerHTML =
        `<div class="country"></div><div class="denom"></div>` +
        (note.date ? `<div class="year"></div>` : '');
      cap.querySelector('.country').textContent = note.country;
      cap.querySelector('.denom').textContent = `${note.denom} ${note.currency}`;
      if (note.date) cap.querySelector('.year').textContent = note.date;

      btn.appendChild(plate);
      btn.appendChild(cap);
      li.appendChild(btn);
      grid.appendChild(li);
    });
  }

  grid.addEventListener('click', e => {
    const btn = e.target.closest('button[data-pos]');
    if (btn) open(Number(btn.dataset.pos), 0);
  });

  /* ---------- lightbox ---------- */

  const lb      = document.getElementById('lightbox');
  const lbImg   = document.getElementById('lbImg');
  const lbTitle = document.getElementById('lbTitle');
  const lbSubj  = document.getElementById('lbSubject');
  const lbMeta  = document.getElementById('lbMeta');
  const lbFlip  = document.getElementById('lbFlip');
  const lbSide  = document.getElementById('lbSide');

  let pos = 0, sideIdx = 0, lastFocus = null;

  function open(p, s) {
    lastFocus = document.activeElement;
    lb.hidden = false;
    document.body.style.overflow = 'hidden';
    show(p, s);
    lb.focus(); // move focus into the dialog without drawing a ring on a control
  }

  function close() {
    lb.hidden = true;
    document.body.style.overflow = '';
    if (lastFocus) lastFocus.focus();
  }

  function show(p, s) {
    pos = (p % visible.length + visible.length) % visible.length;
    const note = visible[pos];
    sideIdx = Math.min(s, note.sides.length - 1);
    const face = note.sides[sideIdx];

    lbImg.src = full(face.file);
    lbImg.alt = `${note.country} ${note.denom} ${note.currency}, ${face.side}`;

    lbTitle.textContent = `${note.country} · ${note.denom} ${note.currency}`;
    lbSubj.textContent  = face.subject || '';

    const rows = [
      ['Issuer', note.authority],
      ['Date',   note.date],
      ['Serial', note.serial]
    ].filter(r => r[1]);

    lbMeta.innerHTML = '';
    rows.forEach(([k, v]) => {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      lbMeta.append(dt, dd);
    });

    const twoSided = note.sides.length > 1;
    lbFlip.disabled = !twoSided;
    lbFlip.textContent = twoSided ? 'Turn over' : 'One side only';
    lbSide.textContent = face.side;
  }

  lbFlip.addEventListener('click', () => show(pos, sideIdx === 0 ? 1 : 0));
  document.getElementById('lbClose').addEventListener('click', close);
  document.getElementById('lbPrev').addEventListener('click', () => show(pos - 1, 0));
  document.getElementById('lbNext').addEventListener('click', () => show(pos + 1, 0));

  lb.addEventListener('click', e => { if (e.target === lb) close(); });

  document.addEventListener('keydown', e => {
    if (lb.hidden) return;
    if (e.key === 'Escape')     close();
    if (e.key === 'ArrowLeft')  show(pos - 1, 0);
    if (e.key === 'ArrowRight') show(pos + 1, 0);
    if (e.key === ' ' || e.key === 'Enter') {
      if (document.activeElement === lbFlip) return; // let the button handle it
      e.preventDefault();
      if (visible[pos].sides.length > 1) show(pos, sideIdx === 0 ? 1 : 0);
    }
  });

  render();
})();

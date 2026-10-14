import { curveLUT } from '../curves';
import { parseCube } from '../cube';
import { BANDS, FILTERS, FMAP, FSLIDERS, HSL_PRESETS } from '../looks';
import { applyPresetTo } from '../presets';
import { DEF, LABELS, LIN, NUM, clamp, clone, wbNeutral, type Key, type Params, type Pt } from '../model';
import { videoStrip } from '../media';
import {
  S, changed, curItem, emit, getV, lutById, on, overrideCount, paramsFor, remember, resetKey, saveLooks, saveLuts, setV, type Tab,
} from '../state';
import { $, fmtT, h, isPhone, toast } from './dom';
import { refresh, renderThumb } from './reel';
import { currentTime, pick, seek, trimChanged } from './stage';

const body = $('#body');
const panel = $('#panel');
const app = $('#app');
const TITLES: Record<Tab, string> = { looks: 'Looks', light: 'Light', color: 'Color', curves: 'Curves', fx: 'Effects', trim: 'Trim' };

/* ---------- tabs, scope and the phone drawer ---------- */
function syncChrome() {
  const it = curItem();
  const hasVideo = !!it && it.kind === 'video' && it.status === 'ready';
  document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => {
    if (b.dataset.tab === 'trim') b.hidden = !hasVideo;
    const inToolbar = !!b.closest('#toolbar');
    b.classList.toggle('on', b.dataset.tab === S.tab && (!inToolbar || S.sheetOpen));
  });
  $('#sheetTitle').textContent = TITLES[S.tab];
  document.querySelectorAll<HTMLButtonElement>('.seg button').forEach((b) => b.classList.toggle('on', b.dataset.scope === S.scope));
  $('#scopeItem').textContent = it ? 'Only ' + it.name.replace(/\.[^.]+$/, '') : 'This item only';
  $('.scope').hidden = S.tab === 'trim';
  panel.classList.toggle('scope-item', S.scope === 'item');
  panel.classList.toggle('open', S.sheetOpen);
  $('#sheetOpen').hidden = S.sheetOpen || !it;
  app.classList.toggle('sheet-open', S.sheetOpen && isPhone());
  if (S.sheetOpen) requestAnimationFrame(() => app.style.setProperty('--sheetH', panel.offsetHeight + 'px'));
  scopeNote();
}

function scopeNote() {
  const note = $('#scopeNote');
  const it = curItem();
  note.replaceChildren();
  if (!it) return;
  const own = Object.keys(it.override) as Key[];
  if (S.scope === 'all') {
    const n = S.items.filter((x) => Object.keys(x.override).length).length;
    note.append(h('span', {}, `Applies to all ${S.items.length}${n ? ` · ${n} with own adjustments` : ''}`));
  } else {
    note.append(h('span', { class: 'ovr-txt' }, own.length ? own.map((k) => LABELS[k]).join(', ') : 'No own adjustments yet'));
  }
  note.append(h('span', { class: 'resets' },
    h('button', { class: 'btn small ghost', disabled: !own.length, title: 'Remove this item\'s own adjustments', onclick: () => {
      it.override = {}; remember(it); changed(); refresh(it); build(); toast('This item follows the global settings again');
    } }, 'Reset selected'),
    resetAllBtn()));
}

/** Two taps: the first arms the button, the second resets everything. */
let armed = 0;
function resetAllBtn() {
  const b = h('button', { class: 'btn small ghost' + (armed ? ' danger' : '') }, armed ? 'Tap again' : 'Reset all') as HTMLButtonElement;
  b.onclick = () => {
    if (!armed) {
      armed = window.setTimeout(() => { armed = 0; scopeNote(); }, 3000);
      scopeNote();
      return;
    }
    clearTimeout(armed); armed = 0;
    S.G = clone(DEF);
    for (const x of S.items) { x.override = {}; remember(x); }
    changed(); refresh(); build();
    toast('All adjustments reset');
  };
  return b;
}

export function openTab(t: Tab) { S.tab = t; build(); }
$('#tabs').onclick = (e) => { const b = (e.target as Element).closest('button'); if (b) openTab(b.dataset.tab as Tab); };
$('#toolbar').onclick = (e) => {
  const b = (e.target as Element).closest('button');
  if (!b) return;
  if (S.sheetOpen && S.tab === b.dataset.tab) { S.sheetOpen = false; syncChrome(); return; }
  S.sheetOpen = true;
  openTab(b.dataset.tab as Tab);
};
$('#sheetDone').onclick = () => { S.sheetOpen = false; syncChrome(); };
$('#sheetOpen').onclick = () => { S.sheetOpen = true; build(); };
{
  let y0: number | null = null;
  const sh = $('#sheethead');
  sh.onpointerdown = (e) => { if ((e.target as Element).closest('button')) return; y0 = e.clientY; sh.setPointerCapture(e.pointerId); };
  sh.onpointerup = (e) => { if (y0 != null && e.clientY - y0 > 40) { S.sheetOpen = false; syncChrome(); } y0 = null; };
}
new ResizeObserver(() => { if (S.sheetOpen) app.style.setProperty('--sheetH', panel.offsetHeight + 'px'); }).observe(panel);
// The tab footer is fixed; everything else is laid out around its height.
const toolbar = $('#toolbar');
new ResizeObserver(() => document.documentElement.style.setProperty('--toolH', (isPhone() ? toolbar.offsetHeight : 0) + 'px')).observe(toolbar);
document.querySelectorAll<HTMLButtonElement>('.seg button').forEach((b) => (b.onclick = () => { S.scope = b.dataset.scope as 'all' | 'item'; build(); }));

/* ---------- controls ---------- */
const fmt = (v: number, step: number, unit = '') => {
  const n = step < 1 ? v.toFixed(step < 0.1 ? 2 : 1) : String(Math.round(v));
  return (v > 0 && unit !== '°' && unit !== '×' ? '+' : '') + n + unit;
};
function setFill(inp: HTMLInputElement) {
  const mn = +inp.min, mx = +inp.max, v = +inp.value, p = (x: number) => ((x - mn) / (mx - mn)) * 100;
  const z = mn < 0 ? p(0) : 0;
  inp.style.setProperty('--a', Math.min(z, p(v)) + '%');
  inp.style.setProperty('--b', Math.max(z, p(v)) + '%');
}

interface SliderOpts { key: Key; label: string; min: number; max: number; step?: number; unit?: string; get?: () => number; set?: (v: number) => void }
let sid = 0;
function slider(parent: HTMLElement, o: SliderOpts) {
  const step = o.step ?? 1, unit = o.unit ?? '';
  const id = 's' + sid++;
  const val = o.get ? o.get() : (getV(o.key) as number);
  const out = h('output', {}, fmt(val, step, unit));
  const inp = h('input', { type: 'range', id, min: o.min, max: o.max, step, value: val }) as HTMLInputElement;
  inp.value = String(val);
  const label = h('label', { for: id, title: 'Double-tap to reset' }, h('i', { class: 'd' }), o.label);
  const row = h('div', { class: 'row' }, label, out, inp);
  const note = () => {
    const ov = curItem()?.override ?? {};
    const own = S.scope === 'item' && o.key in ov;
    row.classList.toggle('ovr', own);
    let sm = row.querySelector('small');
    const n = overrideCount(o.key);
    const txt = own && NUM[o.key] && !o.get ? `${fmt(ov[o.key] as number, step, unit)} relative to all` : own ? 'Own value for this item' : S.scope === 'all' && n ? `${n} with own adjustment on top` : '';
    if (!txt) { sm?.remove(); return; }
    if (!sm) { sm = h('small'); row.append(sm); }
    sm.textContent = txt;
  };
  setFill(inp);
  note();
  inp.oninput = () => {
    const v = +inp.value;
    out.textContent = fmt(v, step, unit);
    setFill(inp);
    if (o.set) o.set(v); else setV(o.key, v as never);
    note();
  };
  let last = 0;
  label.onpointerup = () => { const t = Date.now(); if (t - last < 350) { resetKey(o.key); build(); } last = t; };
  knobDrag(row, inp);
  parent.append(row);
  return row;
}

/** Only the knob grabs the slider: touching the track (e.g. while scrolling the panel) does nothing,
 *  and dragging is relative to where the knob was, so the value never jumps to the finger. */
const KNOB = 18;
function knobDrag(row: HTMLElement, inp: HTMLInputElement) {
  let x0 = 0, v0 = 0, w = 1, id = -1;
  row.addEventListener('pointerdown', (e) => {
    const r = inp.getBoundingClientRect();
    if (e.clientY < r.top - 16 || e.clientY > r.bottom + 16) return;
    const mn = +inp.min, mx = +inp.max;
    const knobX = r.left + KNOB / 2 + ((+inp.value - mn) / (mx - mn)) * (r.width - KNOB);
    if (Math.abs(e.clientX - knobX) > 26) return;
    e.preventDefault();
    row.setPointerCapture(e.pointerId);
    id = e.pointerId; x0 = e.clientX; v0 = +inp.value; w = r.width - KNOB;
    row.classList.add('drag');
  });
  row.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    const mn = +inp.min, mx = +inp.max, st = +inp.step || 1;
    const v = clamp(Math.round((v0 + ((e.clientX - x0) / w) * (mx - mn)) / st) * st, mn, mx);
    if (v !== +inp.value) { inp.value = String(v); inp.dispatchEvent(new Event('input')); }
  });
  const end = (e: PointerEvent) => { if (e.pointerId === id) { id = -1; row.classList.remove('drag'); } };
  row.addEventListener('pointerup', end);
  row.addEventListener('pointercancel', end);
}

function sec(title: string, extra = '') {
  const s = h('div', { class: 'sec' }, h('h3', {}, title, extra ? h('em', {}, extra) : null));
  body.append(s);
  return s;
}
const pills = (parent: HTMLElement) => { const p = h('div', { class: 'pills' }); parent.append(p); return p; };
const hint = (parent: HTMLElement, text: string) => parent.append(h('p', { class: 'hint' }, text));

/* ---------- Looks ---------- */
function baseParams(): Params { const it = curItem(); return S.scope === 'item' && it ? paramsFor(it) : { ...S.G }; }

function applyLook(P: Params) {
  const it = curItem();
  if (S.scope === 'item' && it) {
    for (const k of Object.keys(DEF) as Key[]) {
      if (NUM[k]) { const d = +((P[k] as number) - (S.G[k] as number)).toFixed(3); if (d) it.override[k] = d; else delete it.override[k]; }
      else if (JSON.stringify(P[k]) !== JSON.stringify(S.G[k])) it.override[k] = clone(P[k]); else delete it.override[k];
    }
    remember(it);
  } else S.G = clone(P);
  changed();
  build();
}

let tiles: { c: HTMLCanvasElement; P: () => Params }[] = [];
let tileTimer = 0;
function paintTiles() {
  const it = curItem();
  if (!it?.thumb) return;
  tiles = tiles.filter((t) => t.c.isConnected);
  for (const t of tiles) renderThumb(it, t.P(), t.c);
}
const paintTilesSoon = (ms = 200) => { clearTimeout(tileTimer); tileTimer = window.setTimeout(paintTiles, ms); };

function lookTile(name: string, P: () => Params, on: boolean, click: () => void, remove?: () => void) {
  const c = h('canvas', { width: 3, height: 2 }) as HTMLCanvasElement;
  const b = h('button', { class: 'look' + (on ? ' on' : ''), onclick: click }, c, h('span', {}, name));
  tiles.push({ c, P });
  paintTilesSoon(0);
  if (!remove) return b;
  return h('div', { class: 'lookwrap' }, b, h('button', { class: 'x', title: 'Delete', onclick: remove }, '×'));
}

/** ‹ Name › control: cycles through options in place instead of opening a native picker. */
function cycler(opts: { id: string; name: string; group?: string }[], value: string, pickFn: (id: string) => void, fallback = '') {
  const i = opts.findIndex((o) => o.id === value);
  const go = (d: number) => pickFn(opts[(((i < 0 ? (d > 0 ? -1 : 0) : i) + d) % opts.length + opts.length) % opts.length].id);
  const cur = opts[i];
  const mid = h('div', { class: 'cyc-mid' },
    h('b', {}, cur ? cur.name : fallback),
    h('small', {}, cur ? `${cur.group ? cur.group + ' · ' : ''}${i + 1} / ${opts.length}` : `${opts.length} options`));
  const el = h('div', { class: 'cycler' },
    h('button', { class: 'cyc-btn', 'aria-label': 'Previous', onclick: () => go(-1) }, '‹'), mid,
    h('button', { class: 'cyc-btn', 'aria-label': 'Next', onclick: () => go(1) }, '›'));
  // Swipe sideways on the name to cycle too.
  let x0: number | null = null;
  mid.onpointerdown = (e) => { x0 = e.clientX; mid.setPointerCapture(e.pointerId); };
  mid.onpointerup = (e) => { if (x0 != null && Math.abs(e.clientX - x0) > 30) go(e.clientX < x0 ? 1 : -1); x0 = null; };
  return el;
}

/** Scrolls a horizontal strip so the selected tile is centred, without moving the panel itself. */
function centerOn(strip: HTMLElement) {
  requestAnimationFrame(() => {
    const on = strip.querySelector<HTMLElement>('.look.on')?.closest<HTMLElement>('.lookwrap, .look');
    if (on) strip.scrollLeft = on.offsetLeft - strip.offsetLeft - (strip.clientWidth - on.clientWidth) / 2;
  });
}

let filterDetails = false;
let presetId = '';
function pLooks() {
  // Presets: the user's own saved setups
  const ps = sec('Presets', 'your own');
  const usePreset = (id: string) => {
    const L = S.looks.find((x) => x.id === id);
    if (!L) return;
    presetId = id;
    applyLook(applyPresetTo(baseParams(), L.params));
    toast(`Applied “${L.name}”`);
  };
  if (S.looks.length) {
    ps.append(cycler(S.looks.map((x) => ({ id: x.id, name: x.name })), presetId, usePreset, 'Choose a preset'));
    const pg = h('div', { class: 'looks strip-row' });
    for (const L of S.looks) {
      pg.append(lookTile(L.name, () => applyPresetTo(baseParams(), L.params), L.id === presetId, () => usePreset(L.id),
        () => { S.looks = S.looks.filter((x) => x !== L); if (presetId === L.id) presetId = ''; saveLooks(); build(); }));
    }
    ps.append(pg);
    centerOn(pg);
  } else hint(ps, 'No presets yet. Set up the look, light, color and effects the way you like, then save the setup here.');
  const name = h('input', { type: 'text', id: 'lookName', placeholder: 'Preset name', maxlength: 40 }) as HTMLInputElement;
  const save = () => {
    const n = name.value.trim() || `Preset ${S.looks.length + 1}`;
    const id = Date.now().toString(36);
    S.looks.push({ id, name: n, params: clone(baseParams()) });
    presetId = id;
    saveLooks(); build(); toast(`Saved “${n}”`);
  };
  name.onkeydown = (e) => { if (e.key === 'Enter') save(); };
  ps.append(h('div', { class: 'inline' }, name, h('button', { class: 'btn small', onclick: save }, 'Save')));

  const f = getV('filter');
  const s = sec('Look', 'filter');
  const pickFilter = (id: string) => { setV('filter', { id, k: 100, v: null }); build(); };
  s.append(cycler(FILTERS.map((x) => ({ id: x.id, name: x.name, group: x.g })), f.id, pickFilter));
  const g = h('div', { class: 'looks strip-row' });
  for (const x of FILTERS) g.append(lookTile(x.name, () => ({ ...baseParams(), filter: { id: x.id, k: 100, v: null } }), x.id === f.id, () => pickFilter(x.id)));
  s.append(g);
  centerOn(g);
  const fd = FMAP[f.id];
  if (fd?.v) {
    slider(s, { key: 'filter', label: 'Strength', min: 0, max: 100, get: () => getV('filter').k, set: (v) => setV('filter', { ...getV('filter'), k: v }) });
    s.append(h('button', { class: 'disclose' + (filterDetails ? ' open' : ''), onclick: () => { filterDetails = !filterDetails; build(); } }, filterDetails ? 'Hide details' : 'Fine-tune look'));
    if (filterDetails) {
      for (const [k, lab, mn, mx] of FSLIDERS) {
        if (fd.mono && (k === 'sat' || k === 'warm')) continue;
        slider(s, {
          key: 'filter', label: lab, min: mn, max: mx, unit: k === 'sh' || k === 'hh' ? '°' : '',
          get: () => { const fv = getV('filter'); return fv.v?.[k] ?? fd.v![k]; },
          set: (v) => { const fv = clone(getV('filter')); fv.v = { ...(fv.v || {}), [k]: v }; setV('filter', fv); },
        });
      }
    }
  }

  // LUTs
  const l = sec('LUT', '.cube 3D');
  const lut = getV('lut');
  const lp = pills(l);
  lp.append(h('button', { class: 'pill' + (!lut.id ? ' on' : ''), onclick: () => { setV('lut', { id: null, k: 100 }); build(); } }, 'None'));
  for (const L of S.luts) {
    lp.append(h('span', { class: 'pillwrap' },
      h('button', { class: 'pill' + (lut.id === L.id ? ' on' : ''), onclick: () => { setV('lut', { id: L.id, k: lut.k || 100 }); build(); } }, L.name),
      h('button', { class: 'x', title: 'Delete LUT', onclick: () => { S.luts = S.luts.filter((x) => x !== L); saveLuts(); if (S.G.lut.id === L.id) S.G.lut = { id: null, k: 100 }; changed(); build(); } }, '×')));
  }
  const file = h('input', { type: 'file', accept: '.cube', hidden: true, multiple: true }) as HTMLInputElement;
  file.onchange = async () => {
    for (const fl of file.files || []) {
      try { const L = parseCube(await fl.text(), fl.name); S.luts.push(L); setV('lut', { id: L.id, k: 100 }); toast(`Added ${L.name}`); }
      catch (e) { toast(`${fl.name}: ${(e as Error).message}`); }
    }
    saveLuts(); build();
  };
  lp.append(file, h('button', { class: 'pill add', onclick: () => file.click() }, '+ Import'));
  if (lut.id && lutById(lut.id)) slider(l, { key: 'lut', label: 'Strength', min: 0, max: 100, get: () => getV('lut').k, set: (v) => setV('lut', { ...getV('lut'), k: v }) });
}

/* ---------- Light ---------- */
function pLight() {
  const s = sec('Light');
  const defs: [Key, string, number, number, number?, string?][] = [
    ['exposure', 'Exposure', -3, 3, 0.05, ' EV'], ['contrast', 'Contrast', -100, 100], ['highlights', 'Highlights', -100, 100],
    ['shadows', 'Shadows', -100, 100], ['whites', 'Whites', -100, 100], ['blacks', 'Blacks', -100, 100], ['fade', 'Fade', 0, 100],
  ];
  for (const [key, label, min, max, step, unit] of defs) slider(s, { key, label, min, max, step, unit });
  const d = sec('Presence');
  slider(d, { key: 'texture', label: 'Texture', min: -100, max: 100 });
  slider(d, { key: 'clarity', label: 'Clarity', min: -100, max: 100 });
  slider(d, { key: 'dehaze', label: 'Dehaze', min: -100, max: 100 });
  const b = sec('Even out the series');
  hint(b, 'Measures the brightness of every item and gives the outliers their own exposure, so the series looks even.');
  b.append(h('button', { class: 'btn small', onclick: autoMatch }, 'Auto-match exposure'));
}

function autoMatch() {
  const ready = S.items.filter((i) => i.status === 'ready' && i.lum > 0);
  if (!ready.length) return;
  const sorted = ready.map((i) => i.lum).sort((a, b) => a - b);
  const target = clamp(sorted[Math.floor(sorted.length / 2)], 0.3, 0.5);
  let n = 0;
  for (const it of ready) {
    const ev = Math.round(clamp(2.2 * Math.log2(target / Math.max(0.02, it.lum)) * 0.6, -2.5, 2.5) * 20) / 20;
    if (Math.abs(ev) >= 0.2) { it.override.exposure = ev; n++; } else delete it.override.exposure;
    remember(it);
  }
  changed();
  refresh();
  build();
  toast(n ? `Adjusted exposure on ${n} items` : 'The series was already evenly exposed');
}

/* ---------- Colour ---------- */
let band = 5;
function neutralize([r, g, b]: [number, number, number]) {
  const R = Math.pow(r, 2.2), G = Math.max(1e-4, Math.pow(g, 2.2)), B = Math.pow(b, 2.2);
  if (R < 1e-4 || B < 1e-4) { toast('Pick a brighter, neutral area'); return; }
  const wb = wbNeutral(R, G, B);
  setV('temp', wb.temp);
  setV('tint', wb.tint);
  build();
  toast('White balance set');
}
function hueOf([r, g, b]: number[]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return 0;
  const H = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return H * 60;
}

function pColor() {
  const s = sec('White balance');
  slider(s, { key: 'temp', label: 'Temperature', min: -100, max: 100 });
  slider(s, { key: 'tint', label: 'Tint', min: -100, max: 100 });
  s.append(h('button', { class: 'btn small', onclick: () => { pick(neutralize); toast('Tap something that should be grey or white'); if (isPhone()) { S.sheetOpen = false; syncChrome(); } } }, 'Eyedropper: tap something neutral'));
  const m = sec('Saturation');
  slider(m, { key: 'saturation', label: 'Saturation', min: -100, max: 100 });
  slider(m, { key: 'vibrance', label: 'Vibrance', min: -100, max: 100 });

  const s2 = sec('Selective color', '8 bands');
  const hv = getV('hsl');
  const bands = h('div', { class: 'bands' });
  BANDS.forEach((B, k) => {
    const mod = hv[k].h || hv[k].s || hv[k].l;
    bands.append(h('button', { class: 'band' + (k === band ? ' on' : '') + (mod ? ' mod' : ''), title: B.n, 'aria-label': B.n, style: `background:hsl(${B.h} 75% 52%)`, onclick: () => { band = k; build(); } }));
  });
  s2.append(bands);
  s2.append(h('div', { class: 'picked' }, h('i', { style: `background:hsl(${BANDS[band].h} 75% 52%)` }), h('span', {}, BANDS[band].n), h('span', { style: 'flex:1' }),
    h('button', { class: 'btn small', onclick: () => {
      pick((rgb) => {
        const H = hueOf(rgb);
        let best = 0, bd = 999;
        BANDS.forEach((B, k) => { let df = Math.abs(H - B.h); if (df > 180) df = 360 - df; if (df < bd) { bd = df; best = k; } });
        band = best;
        if (isPhone()) { S.sheetOpen = true; }
        build();
        toast(`Picked ${BANDS[best].n.toLowerCase()} from the image`);
      });
      if (isPhone()) { S.sheetOpen = false; syncChrome(); }
      toast('Tap the color in the image');
    } }, 'Eyedropper')));
  for (const [k, label, min, max, unit] of [['h', 'Hue', -60, 60, '°'], ['s', 'Saturation', -100, 100, ''], ['l', 'Luminance', -100, 100, '']] as const) {
    slider(s2, {
      key: 'hsl', label, min, max, unit,
      get: () => getV('hsl')[band][k],
      set: (v) => {
        const a = clone(getV('hsl'));
        a[band][k] = v;
        setV('hsl', a);
        bands.children[band].classList.toggle('mod', !!(a[band].h || a[band].s || a[band].l));
      },
    });
  }
  const s3 = sec('Color tweaks', 'added on top');
  const p = pills(s3);
  for (const [n, map] of Object.entries(HSL_PRESETS)) {
    p.append(h('button', { class: 'pill', onclick: () => {
      const a = clone(getV('hsl'));
      for (const [k, v] of Object.entries(map)) { const i = +k; a[i] = { h: a[i].h + v.h, s: a[i].s + v.s, l: a[i].l + v.l }; }
      setV('hsl', a); build(); toast(n + ' added');
    } }, n));
  }
  p.append(h('button', { class: 'pill', onclick: () => { resetKey('hsl'); build(); } }, 'Reset colors'));
}

/* ---------- Curves ---------- */
let curveCh: 'rgb' | 'r' | 'g' | 'b' = 'rgb';
const CH_COL = { rgb: '#ece5d9', r: '#ff6a5a', g: '#6fd27c', b: '#6aa6ff' };

function pCurves() {
  const s = sec('RGB curves');
  const ch = h('div', { class: 'chans' });
  for (const c of ['rgb', 'r', 'g', 'b'] as const) {
    ch.append(h('button', { 'data-c': c, class: c === curveCh ? 'on' : '', onclick: (e: Event) => {
      curveCh = c;
      ch.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === e.currentTarget));
      drawCurve();
    } }, c.toUpperCase()));
  }
  s.append(ch);
  const cv = h('canvas', { id: 'curve', width: 560, height: 560 }) as HTMLCanvasElement;
  s.append(cv);
  hint(s, 'Tap to add a point · drag to move · double-tap to remove.');
  s.append(h('button', { class: 'btn small', onclick: () => { const c = clone(getV('curves')); c[curveCh] = LIN; setV('curves', c); drawCurve(); } }, 'Reset channel'));
  curveEvents(cv);
  drawCurve();
}

function drawCurve() {
  const cv = $<HTMLCanvasElement>('#curve');
  if (!cv) return;
  const c = cv.getContext('2d')!, W = cv.width, H = cv.height;
  c.clearRect(0, 0, W, H);
  c.strokeStyle = '#2f2a25'; c.lineWidth = 1;
  for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo((i * W) / 4, 0); c.lineTo((i * W) / 4, H); c.moveTo(0, (i * H) / 4); c.lineTo(W, (i * H) / 4); c.stroke(); }
  c.strokeStyle = '#ffffff22'; c.setLineDash([4, 6]); c.beginPath(); c.moveTo(0, H); c.lineTo(W, 0); c.stroke(); c.setLineDash([]);
  const cs = getV('curves');
  for (const k of ['r', 'g', 'b', 'rgb'] as const) {
    if (k === curveCh || JSON.stringify(cs[k]) === JSON.stringify(LIN)) continue;
    const L = curveLUT(cs[k]);
    c.strokeStyle = CH_COL[k] + '55'; c.lineWidth = 2; c.beginPath();
    for (let i = 0; i < 256; i++) c.lineTo((i / 255) * W, H - L[i] * H);
    c.stroke();
  }
  const L = curveLUT(cs[curveCh]);
  c.strokeStyle = CH_COL[curveCh]; c.lineWidth = 3; c.beginPath();
  for (let i = 0; i < 256; i++) c.lineTo((i / 255) * W, H - L[i] * H);
  c.stroke();
  for (const p of cs[curveCh]) { c.fillStyle = '#171513'; c.strokeStyle = CH_COL[curveCh]; c.lineWidth = 3; c.beginPath(); c.arc(p[0] * W, H - p[1] * H, 10, 0, 7); c.fill(); c.stroke(); }
}

function curveEvents(cv: HTMLCanvasElement) {
  let drag = -1, lastTap = 0;
  const pos = (e: PointerEvent): Pt => { const r = cv.getBoundingClientRect(); return [clamp((e.clientX - r.left) / r.width), clamp(1 - (e.clientY - r.top) / r.height)]; };
  const hit = (a: Pt[], [x, y]: Pt) => { let best = -1, bd = 0.06; a.forEach((p, i) => { const d = Math.hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; best = i; } }); return best; };
  cv.onpointerdown = (e) => {
    const p = pos(e), c = clone(getV('curves')), a = c[curveCh];
    let i = hit(a, p);
    const now = Date.now();
    if (i > 0 && i < a.length - 1 && now - lastTap < 350) { a.splice(i, 1); setV('curves', c); drawCurve(); lastTap = 0; return; }
    lastTap = now;
    if (i < 0) { a.push(p); a.sort((u, v) => u[0] - v[0]); i = a.indexOf(p); setV('curves', c); }
    drag = i;
    cv.setPointerCapture(e.pointerId);
    drawCurve();
  };
  cv.onpointermove = (e) => {
    if (drag < 0) return;
    const [x, y] = pos(e), c = clone(getV('curves')), a = c[curveCh];
    const lo = drag > 0 ? a[drag - 1][0] + 0.01 : 0, hi = drag < a.length - 1 ? a[drag + 1][0] - 0.01 : 1;
    a[drag] = [drag === 0 ? Math.min(x, hi) : drag === a.length - 1 ? Math.max(x, lo) : clamp(x, lo, hi), y];
    setV('curves', c);
    drawCurve();
  };
  cv.onpointerup = cv.onpointercancel = () => (drag = -1);
}

/* ---------- Effects ---------- */
function pFx() {
  const v = sec('Vignette');
  slider(v, { key: 'vignette', label: 'Amount', min: -100, max: 100 });
  slider(v, { key: 'vigSize', label: 'Size', min: 0, max: 100 });
  slider(v, { key: 'vigFeather', label: 'Softness', min: 0, max: 100 });
  const g = sec('Grain');
  slider(g, { key: 'grain', label: 'Amount', min: 0, max: 100 });
  slider(g, { key: 'grainSize', label: 'Size', min: 1, max: 4, step: 0.1, unit: '×' });
  const b = sec('Blur');
  const bm = pills(b);
  for (const [k, n] of [['tilt', 'Tilt-shift'], ['radial', 'Radial'], ['full', 'Whole image']] as const) {
    bm.append(h('button', { class: 'pill' + (getV('blurMode') === k ? ' on' : ''), onclick: () => { setV('blurMode', k); build(); } }, n));
  }
  slider(b, { key: 'blur', label: 'Amount', min: 0, max: 100 });
  const bl = sec('Bloom', 'multi-step');
  slider(bl, { key: 'bloom', label: 'Amount', min: 0, max: 100 });
  slider(bl, { key: 'bloomThr', label: 'Threshold', min: 30, max: 95 });
  slider(bl, { key: 'bloomRadius', label: 'Radius', min: 0, max: 100 });
  const ha = sec('Halation', 'red glow around highlights');
  slider(ha, { key: 'halation', label: 'Amount', min: 0, max: 100 });
}

/* ---------- Trim ---------- */
const strips = new WeakMap<object, Promise<ImageBitmap[]>>();
function pTrim() {
  const it = curItem();
  if (!it || it.kind !== 'video' || !it.trim) return;
  const tr = it.trim;
  const s = sec('Trim', fmtT(it.duration) + ' total');
  const cv = h('canvas', { width: 640, height: 112 }) as HTMLCanvasElement;
  const shL = h('div', { class: 'shade' }), shR = h('div', { class: 'shade' }), win = h('div', { class: 'win' }), ph = h('div', { class: 'ph' });
  const tl = h('div', { class: 'trimtl', id: 'tl' }, cv, shL, shR, win, ph);
  const tIn = h('b'), tOut = h('b'), tLen = h('b');
  s.append(tl, h('div', { class: 'tcrow' }, h('div', {}, h('span', {}, 'Start'), tIn), h('div', {}, h('span', {}, 'End'), tOut), h('div', {}, h('span', {}, 'Length'), tLen)));
  const set = (edge: 'in' | 'out', v: number) => {
    if (edge === 'in') tr.in = clamp(v, 0, tr.out - 0.3); else tr.out = clamp(v, tr.in + 0.3, it.duration);
    layout(); trimChanged(it, edge); emit('trim');
  };
  s.append(h('div', { class: 'btnrow' },
    h('button', { class: 'btn small', onclick: () => set('in', currentTime()) }, 'Set start here'),
    h('button', { class: 'btn small', onclick: () => set('out', currentTime()) }, 'Set end here'),
    h('button', { class: 'btn small ghost', onclick: () => { tr.in = 0; tr.out = it.duration; layout(); trimChanged(it, 'in'); emit('trim'); } }, 'Reset')));
  hint(s, 'Drag the yellow handles. Drag in the middle to move the playhead.');

  const pct = (v: number) => (v / it.duration) * 100 + '%';
  function layout() {
    shL.style.cssText = `left:0;width:${pct(tr.in)}`;
    shR.style.cssText = `left:${pct(tr.out)};right:0`;
    win.style.cssText = `left:${pct(tr.in)};width:${pct(tr.out - tr.in)}`;
    ph.style.left = pct(currentTime());
    tIn.textContent = fmtT(tr.in); tOut.textContent = fmtT(tr.out); tLen.textContent = fmtT(tr.out - tr.in);
  }
  layoutPlayhead = () => { if (document.contains(ph)) ph.style.left = pct(currentTime()); };
  let mode: 'in' | 'out' | 'ph' | null = null;
  const tAt = (e: PointerEvent) => { const r = tl.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width) * it.duration; };
  tl.onpointerdown = (e) => {
    const t = tAt(e), px = (it.duration / tl.getBoundingClientRect().width) * 22;
    mode = Math.abs(t - tr.in) < px ? 'in' : Math.abs(t - tr.out) < px ? 'out' : 'ph';
    tl.setPointerCapture(e.pointerId);
    move(e);
  };
  const move = (e: PointerEvent) => {
    if (!mode) return;
    const t = tAt(e);
    if (mode === 'ph') { seek(t); ph.style.left = pct(t); } else set(mode, t);
  };
  tl.onpointermove = move;
  tl.onpointerup = tl.onpointercancel = () => (mode = null);
  layout();

  let p = strips.get(it.file);
  if (!p) { p = videoStrip(it, 8, 56); strips.set(it.file, p); }
  p.then((frames) => {
    const c = cv.getContext('2d')!, fw = cv.width / frames.length;
    frames.forEach((f, i) => c.drawImage(f, 0, 0, f.width, f.height, i * fw, 0, fw + 1, cv.height));
  }).catch(() => {});
}
let layoutPlayhead = () => {};
on('trim', () => layoutPlayhead());

/* ---------- build ---------- */
export function build() {
  const it = curItem();
  if (S.tab === 'trim' && (!it || it.kind !== 'video')) S.tab = 'looks';
  body.replaceChildren();
  if (it) ({ looks: pLooks, light: pLight, color: pColor, curves: pCurves, fx: pFx, trim: pTrim })[S.tab]();
  else body.append(h('p', { class: 'hint' }, 'Open photos or videos to begin.'));
  syncChrome();
}

on('select', build);
on('ui', build);
on('items', () => { syncChrome(); if (S.tab === 'looks') paintTilesSoon(0); });
// Keep the light-weight bits of the panel current without rebuilding sliders mid-drag.
on('params', () => { scopeNote(); if (S.tab === 'curves') drawCurve(); if (S.tab === 'looks') paintTilesSoon(); });

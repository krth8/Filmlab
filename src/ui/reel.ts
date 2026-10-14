import { Renderer } from '../gl/renderer';
import { isTrimmed, type Item, type Params } from '../model';
import { S, curItem, emit, lutById, on, paramsFor, select } from '../state';
import { $, fmtT, h } from './dom';

/** Small offscreen renderer shared by the carousel and the look previews. */
export const TR = new Renderer(document.createElement('canvas'), true);

export function renderThumb(it: Item, P: Params, out: HTMLCanvasElement) {
  if (!it.thumb) return;
  TR.setCachedSource(it.thumb, it.thumb, it.thumb.width, it.thumb.height);
  const w = it.thumb.width, hh = it.thumb.height;
  TR.render(P, w, hh, { lut: lutById(P.lut.id), seed: it.id });
  if (out.width !== w || out.height !== hh) { out.width = w; out.height = hh; }
  out.getContext('2d')!.drawImage(TR.canvas, 0, 0);
}

const reel = $('#reel');
const frames = new Map<Item, HTMLButtonElement>();
const dirty = new Set<Item>();
const visible = new Set<Item>();
let raf = 0;
let onAdd: () => void = () => {};
export const setAddHandler = (fn: () => void) => (onAdd = fn);

const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    const it = (e.target as any).__item as Item;
    if (e.isIntersecting) visible.add(it); else visible.delete(it);
  }
  schedule();
}, { root: reel, rootMargin: '0px 300px' });

function schedule() { if (!raf) raf = requestAnimationFrame(flush); }
function flush() {
  raf = 0;
  const t0 = performance.now();
  for (const it of dirty) {
    if (!visible.has(it) || it.status !== 'ready') continue;
    const fr = frames.get(it);
    if (fr) renderThumb(it, paramsFor(it), fr.querySelector('canvas')!);
    dirty.delete(it);
    if (performance.now() - t0 > 12) { schedule(); return; }
  }
}

function badges(it: Item, fr: HTMLElement) {
  fr.querySelectorAll('.ov,.vid,.err').forEach((n) => n.remove());
  if (it.status === 'error') fr.append(h('span', { class: 'err', title: it.error || '' }, '!'));
  if (Object.keys(it.override).length) fr.append(h('span', { class: 'ov', title: 'Own adjustments' }));
  if (it.kind === 'video' && it.trim) fr.append(h('span', { class: 'vid' + (isTrimmed(it) ? ' t' : '') }, '▶ ' + fmtT(it.trim.out - it.trim.in, 0)));
  fr.classList.toggle('loading', it.status === 'loading');
}

export function buildReel() {
  reel.replaceChildren();
  frames.clear();
  io.disconnect();
  visible.clear();
  S.items.forEach((it, i) => {
    const fr = h('button', { class: 'frame' + (i === S.cur ? ' on' : ''), 'aria-label': it.name, title: it.name },
      h('canvas', { width: 3, height: 2 }));
    (fr as any).__item = it;
    fr.onclick = () => {
      if (S.items[S.cur] === it && it.kind === 'video' && it.status === 'ready') { S.tab = 'trim'; S.sheetOpen = true; emit('ui'); }
      else select(S.items.indexOf(it));
    };
    badges(it, fr);
    frames.set(it, fr);
    reel.append(fr);
    io.observe(fr);
    dirty.add(it);
  });
  reel.append(h('button', { class: 'frame add', onclick: () => onAdd() }, h('span', {}, '+'), 'Add'));
  schedule();
}

/** Refresh one item (after loading) or all (after a global change). */
export function refresh(it?: Item) {
  for (const x of it ? [it] : S.items) {
    dirty.add(x);
    const fr = frames.get(x);
    if (fr) badges(x, fr);
  }
  schedule();
}

on('select', () => {
  frames.forEach((fr, it) => fr.classList.toggle('on', it === curItem()));
  frames.get(curItem()!)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
});
// A global change touches every frame; an item-only change touches just that one.
on('params', () => refresh(S.scope === 'item' ? curItem() : undefined));
on('trim', () => { const it = curItem(); const fr = it && frames.get(it); if (fr && it) badges(it, fr); });

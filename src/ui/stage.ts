import { Renderer } from '../gl/renderer';
import { loadPreview } from '../media';
import { S, curItem, emit, lutById, on, paramsFor, remember, select } from '../state';
import { $, fmtT, h, toast } from './dom';
import type { Item } from '../model';

const view = $<HTMLCanvasElement>('#view');
const stage = $('#stage');
export const R = new Renderer(view);

let srcFor: Item | null = null;      // whose pixels are currently on the GPU
let srcIsPreview = false;
let video: HTMLVideoElement | null = null;
let videoFor: Item | null = null;
let raf = 0;
let seed = 0;

/* ---------- sizing ---------- */
function displaySize(it: Item): [number, number] {
  const r = stage.getBoundingClientRect();
  const pad = 16;
  const aw = Math.max(50, r.width - pad * 2), ah = Math.max(50, r.height - pad * 2 - (it.kind === 'video' ? 44 : 0));
  const k = Math.min(aw / it.width, ah / it.height);
  const cw = Math.round(it.width * k), ch = Math.round(it.height * k);
  view.style.width = cw + 'px';
  view.style.height = ch + 'px';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let pw = cw * dpr, ph = ch * dpr;
  const cap = Math.min(1, 2048 / Math.max(pw, ph), it.width / pw);
  pw *= cap; ph *= cap;
  return [pw, ph];
}

/* ---------- drawing ---------- */
export function draw() {
  if (!raf) raf = requestAnimationFrame(paint);
}
function paint() {
  raf = 0;
  const it = curItem();
  updateChips();
  if (!it || it.status !== 'ready') { view.hidden = true; return; }
  view.hidden = false;
  const [w, hh] = displaySize(it);
  if (it.kind === 'video') {
    if (!video || videoFor !== it || video.readyState < 2) return;
    R.setSource(video, video.videoWidth, video.videoHeight);
  } else if (srcFor !== it) {
    if (!it.thumb) return;
    R.setCachedSource(it.thumb, it.thumb, it.thumb.width, it.thumb.height);
  }
  const P = paramsFor(it);
  R.render(P, w, hh, { bypass: S.showBefore, lut: lutById(P.lut.id), seed: it.kind === 'video' && video && !video.paused ? ++seed : it.id });
}

async function ensureImage(it: Item) {
  if (srcFor === it && srcIsPreview) return;
  srcFor = null;
  draw();
  try {
    const bm = await loadPreview(it);
    if (curItem() !== it) return;
    R.setSource(bm, bm.width, bm.height);
    srcFor = it;
    srcIsPreview = true;
    draw();
  } catch {
    it.status = 'error';
    it.error = 'Kunne ikke lese bildet';
    emit('items');
  }
}

/* ---------- video ---------- */
const bar = $('#stagebar');
const playBtn = $<HTMLButtonElement>('#playBtn');
const muteBtn = $<HTMLButtonElement>('#muteBtn');
const tc = $('#stageTc');

function dropVideo() {
  if (!video) return;
  video.pause();
  URL.revokeObjectURL(video.src);
  video.removeAttribute('src');
  video.load();
  video = null;
  videoFor = null;
}

function setupVideo(it: Item) {
  if (videoFor === it) return;
  dropVideo();
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto';
  v.setAttribute('playsinline', '');
  v.src = URL.createObjectURL(it.file);
  video = v; videoFor = it;
  muteBtn.textContent = 'Lyd av';
  v.addEventListener('loadeddata', () => { v.currentTime = it.trim?.in ?? 0; });
  v.addEventListener('seeked', () => { draw(); updateTc(); });
  v.addEventListener('play', () => { playBtn.textContent = '❚❚ Pause'; tick(); });
  v.addEventListener('pause', () => { playBtn.textContent = '▶ Spill'; });
  v.addEventListener('error', () => { it.status = 'error'; it.error = 'Videoen kan ikke spilles av i denne nettleseren'; emit('items'); });
}

function tick() {
  if (!video || video.paused) return;
  const it = videoFor!;
  if (it.trim && video.currentTime >= it.trim.out) video.currentTime = it.trim.in;
  draw();
  updateTc();
  if ('requestVideoFrameCallback' in video) video.requestVideoFrameCallback(() => tick());
  else requestAnimationFrame(tick);
}

function updateTc() {
  const it = curItem();
  if (!it || it.kind !== 'video' || !video) { tc.textContent = ''; return; }
  tc.textContent = `${fmtT(video.currentTime)} / ${fmtT(it.duration)}`;
  emit('trim');
}

export const currentTime = () => video?.currentTime ?? 0;
export function seek(t: number) {
  if (!video) return;
  video.currentTime = t;
}
export function togglePlay() {
  if (!video) return;
  const it = videoFor!;
  if (video.paused) {
    if (it.trim && (video.currentTime < it.trim.in || video.currentTime >= it.trim.out - 0.05)) video.currentTime = it.trim.in;
    video.play().catch(() => {});
  } else video.pause();
}
playBtn.onclick = togglePlay;
muteBtn.onclick = () => {
  if (!video) return;
  video.muted = !video.muted;
  muteBtn.textContent = video.muted ? 'Lyd av' : 'Lyd på';
};

/* ---------- chips / errors ---------- */
const chips = $('#chips');
const msg = $('#stageMsg');
function updateChips() {
  const it = curItem();
  chips.replaceChildren();
  msg.hidden = true;
  if (!it) return;
  if (S.showBefore) chips.append(h('span', { class: 'chip' }, 'Original'));
  else if (Object.keys(it.override).length) chips.append(h('span', { class: 'chip o' }, 'Egen justering'));
  if (it.status === 'error') { msg.hidden = false; msg.textContent = it.error || 'Kunne ikke lese filen'; }
  else if (it.status === 'loading') { msg.hidden = false; msg.textContent = 'Leser…'; }
}

/* ---------- gestures: hold for original, swipe to navigate, pipette ---------- */
type Pick = (rgb: [number, number, number]) => void;
let picker: Pick | null = null;
export function pick(fn: Pick | null) {
  picker = fn;
  stage.classList.toggle('picking', !!fn);
}

function sampleVideo(e: PointerEvent): [number, number, number] | null {
  if (!video) return null;
  const r = view.getBoundingClientRect();
  const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
  const c = new OffscreenCanvas(1, 1), x = c.getContext('2d')!;
  x.drawImage(video, fx * video.videoWidth - 2, fy * video.videoHeight - 2, 5, 5, 0, 0, 1, 1);
  const d = x.getImageData(0, 0, 1, 1).data;
  return [d[0] / 255, d[1] / 255, d[2] / 255];
}
// Previews are not kept as readable pixels, so sample from a small copy of the preview bitmap.
let pickSrc: { it: Item; c: OffscreenCanvas } | null = null;
async function sampleImage(e: PointerEvent): Promise<[number, number, number] | null> {
  const it = curItem();
  if (!it || it.kind === 'video') return sampleVideo(e);
  if (!pickSrc || pickSrc.it !== it) {
    const bm = await loadPreview(it);
    const k = Math.min(1, 1024 / Math.max(bm.width, bm.height));
    const c = new OffscreenCanvas(Math.round(bm.width * k), Math.round(bm.height * k));
    c.getContext('2d')!.drawImage(bm, 0, 0, c.width, c.height);
    pickSrc = { it, c };
  }
  const r = view.getBoundingClientRect(), c = pickSrc.c;
  const x = Math.round(((e.clientX - r.left) / r.width) * c.width), y = Math.round(((e.clientY - r.top) / r.height) * c.height);
  const d = c.getContext('2d')!.getImageData(Math.max(0, x - 2), Math.max(0, y - 2), 5, 5).data;
  const acc = [0, 0, 0];
  for (let i = 0; i < d.length; i += 4) { acc[0] += d[i]; acc[1] += d[i + 1]; acc[2] += d[i + 2]; }
  const n = d.length / 4;
  return [acc[0] / n / 255, acc[1] / n / 255, acc[2] / n / 255];
}

const before = (v: boolean) => { if (S.showBefore === v) return; S.showBefore = v; draw(); };
{
  let x0: number | null = null, y0 = 0, hold = 0;
  view.addEventListener('pointerdown', async (e) => {
    if (picker) {
      const fn = picker;
      pick(null);
      const rgb = await sampleImage(e);
      if (rgb) fn(rgb);
      return;
    }
    x0 = e.clientX; y0 = e.clientY;
    view.setPointerCapture(e.pointerId);
    hold = window.setTimeout(() => before(true), 180);
  });
  view.addEventListener('pointermove', (e) => {
    if (x0 != null && Math.hypot(e.clientX - x0, e.clientY - y0) > 12) clearTimeout(hold);
  });
  const end = (e: PointerEvent) => {
    clearTimeout(hold);
    if (x0 == null) return;
    const dx = e.clientX - x0;
    x0 = null;
    if (S.showBefore) return before(false);
    if (Math.abs(dx) > 50) select(S.cur + (dx < 0 ? 1 : -1));
  };
  view.addEventListener('pointerup', end);
  view.addEventListener('pointercancel', end);
  view.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('keydown', (e) => {
    if ((e.target as Element).matches('input,select,textarea')) return;
    if (e.key === 'ArrowRight') select(S.cur + 1);
    else if (e.key === 'ArrowLeft') select(S.cur - 1);
    else if ((e.key === 'b' || e.key === 'B') && !e.repeat) before(true);
    else if (e.key === ' ' && curItem()?.kind === 'video') { e.preventDefault(); togglePlay(); }
  });
  document.addEventListener('keyup', (e) => { if (e.key === 'b' || e.key === 'B') before(false); });
}

/* ---------- wiring ---------- */
function onSelect() {
  const it = curItem();
  bar.hidden = !it || it.kind !== 'video';
  pick(null);
  if (!it) { dropVideo(); draw(); return; }
  if (it.kind === 'video') { srcFor = null; if (it.status === 'ready') setupVideo(it); }
  else { dropVideo(); if (it.status === 'ready') ensureImage(it); }
  draw();
}
on('select', onSelect);
on('items', onSelect);
on('params', draw);
new ResizeObserver(draw).observe(stage);
view.addEventListener('webglcontextlost', () => toast('Grafikkminnet ble tømt. Last siden på nytt.'));

/** Called by the trim panel when handles move. */
export function trimChanged(it: Item, edge: 'in' | 'out') {
  remember(it);
  if (video && videoFor === it && it.trim) { video.pause(); video.currentTime = it.trim[edge]; }
}

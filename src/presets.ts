import { DEF, LIN, clone, type Curves, type HslBand, type Key, type Params, type Pt } from './model';

/** A preset is a complete style: it sets every style tool at once (look, curves, colour, texture, glow),
 *  but leaves exposure, white balance and per-item corrections alone. */
export interface Preset { id: string; name: string; g: string; p: Partial<Params> }

export const STYLE_KEYS: Key[] = [
  'filter', 'lut', 'curves', 'hsl', 'contrast', 'saturation', 'vibrance', 'fade',
  'vignette', 'vigSize', 'vigFeather', 'grain', 'grainSize', 'blur', 'blurMode', 'bloom', 'bloomThr', 'bloomRadius', 'halation',
];

const curve = (rgb: Pt[], r: Pt[] = LIN, g: Pt[] = LIN, b: Pt[] = LIN): Curves => ({ rgb, r, g, b });
const hsl = (m: Record<number, [number, number, number]>): HslBand[] =>
  Array.from({ length: 8 }, (_, i) => (m[i] ? { h: m[i][0], s: m[i][1], l: m[i][2] } : { h: 0, s: 0, l: 0 }));
const look = (id: string, k = 100) => ({ id, k, v: null });

const SOFT_S: Pt[] = [[0, 0], [0.25, 0.21], [0.75, 0.8], [1, 1]];
const STRONG_S: Pt[] = [[0, 0], [0.25, 0.15], [0.75, 0.87], [1, 1]];
const MATTE: Pt[] = [[0, 0.08], [0.3, 0.3], [0.8, 0.82], [1, 0.97]];
const TOE: Pt[] = [[0, 0.04], [0.12, 0.08], [0.5, 0.52], [0.88, 0.93], [1, 0.97]];

export const PRESETS: Preset[] = [
  { g: '', id: 'clean', name: 'Ren', p: {} },
  // Film
  { g: 'Film', id: 'gold-summer', name: 'Gyllen sommer', p: { filter: look('gold', 90), curves: curve(TOE), vibrance: 10, grain: 22, grainSize: 1.6, vignette: 15, vigFeather: 65, halation: 12 } },
  { g: 'Film', id: 'portra-portrait', name: 'Portra portrett', p: { filter: look('portra'), curves: curve(SOFT_S), hsl: hsl({ 0: [3, -8, 4], 1: [0, -12, 8] }), grain: 14, vignette: 10, vigFeather: 70 } },
  { g: 'Film', id: 'cinestill-night', name: 'Cinestill natt', p: { filter: look('cine'), contrast: 8, halation: 45, bloom: 20, bloomThr: 70, grain: 25, grainSize: 1.7 } },
  { g: 'Film', id: 'velvia-land', name: 'Velvia landskap', p: { filter: look('velvia', 80), hsl: hsl({ 4: [0, 15, -10], 5: [-4, 30, -22] }), vibrance: 15, vignette: 12 } },
  { g: 'Film', id: 'kodachrome-70s', name: 'Kodachrome 70-tall', p: { filter: look('kchrome'), curves: curve([[0, 0.02], [0.5, 0.52], [1, 0.97]], [[0, 0], [0.5, 0.54], [1, 1]], LIN, [[0, 0], [0.5, 0.46], [1, 0.95]]), fade: 6, grain: 18, vignette: 20 } },
  { g: 'Film', id: 'polaroid', name: 'Polaroid', p: { filter: look('pola'), fade: 10, vignette: 30, vigSize: 40, vigFeather: 75, grain: 20, bloom: 10 } },
  { g: 'Film', id: 'superia-daily', name: 'Superia hverdag', p: { filter: look('superia'), curves: curve(SOFT_S), grain: 18 } },
  { g: 'Film', id: 'ektachrome-slide', name: 'Lysbilde', p: { filter: look('ektachrome'), curves: curve(STRONG_S), vignette: 22, vigFeather: 40, grain: 10 } },
  { g: 'Film', id: 'lomo', name: 'Lomo', p: { filter: look('lomo800'), vignette: 45, vigSize: 35, vigFeather: 55, grain: 24, saturation: 10 } },
  // Kino
  { g: 'Kino', id: 'blockbuster', name: 'Blockbuster', p: { filter: look('teal'), hsl: hsl({ 1: [0, 20, 5], 3: [40, -20, 0], 4: [8, 25, 0], 5: [-15, 10, 0] }), contrast: 10, vignette: 18 } },
  { g: 'Kino', id: 'vision-tungsten', name: 'Tungsten kveld', p: { filter: look('vision500t'), halation: 30, bloom: 12, grain: 22, curves: curve(TOE) } },
  { g: 'Kino', id: 'bleach', name: 'Bleach bypass', p: { filter: look('bleach'), grain: 15, vignette: 20 } },
  { g: 'Kino', id: 'night', name: 'Day for night', p: { filter: look('dfn', 90), vignette: 35, grain: 20 } },
  { g: 'Kino', id: 'noir', name: 'Neo-noir', p: { filter: look('noir'), curves: curve(STRONG_S), vignette: 30, halation: 15, grain: 18 } },
  { g: 'Kino', id: 'amber-dream', name: 'Amber drøm', p: { filter: look('amber'), bloom: 30, bloomRadius: 80, halation: 15, fade: 6 } },
  { g: 'Kino', id: 'flat-log', name: 'Flat og rolig', p: { filter: look('eterna'), curves: curve(MATTE), vignette: 8 } },
  // Svart-hvitt
  { g: 'S/H', id: 'trix-street', name: 'Tri-X gate', p: { filter: look('trix'), grain: 35, grainSize: 1.8, contrast: 15, vignette: 20 } },
  { g: 'S/H', id: 'hp5-soft', name: 'HP5 myk', p: { filter: look('hp5'), grain: 25, fade: 8 } },
  { g: 'S/H', id: 'bw-punch', name: 'Høykontrast S/H', p: { filter: look('tmax'), curves: curve(STRONG_S), contrast: 25, grain: 15, vignette: 15 } },
  { g: 'S/H', id: 'bw-matte', name: 'Matt S/H', p: { filter: look('acros'), curves: curve(MATTE), grain: 12 } },
  { g: 'S/H', id: 'darkroom', name: 'Mørkerom', p: { filter: look('delta3200'), grain: 45, grainSize: 2.2, vignette: 35, vigFeather: 80, halation: 10 } },
  { g: 'S/H', id: 'sepia', name: 'Sepia', p: { filter: look('sepia'), fade: 10, grain: 20, vignette: 25 } },
  // Natur
  { g: 'Natur', id: 'nordic', name: 'Nordisk lys', p: { filter: look('nordlys', 60), curves: curve(LIN, LIN, LIN, [[0, 0.03], [0.5, 0.53], [1, 1]]), vibrance: 15, fade: 5 } },
  { g: 'Natur', id: 'golden-hour', name: 'Gyllen time', p: { filter: look('gold', 70), hsl: hsl({ 2: [-12, 15, 4], 3: [-30, -15, 0] }), bloom: 15, bloomThr: 65, halation: 10 } },
  { g: 'Natur', id: 'autumn', name: 'Høstfarger', p: { filter: look('kchrome', 60), hsl: hsl({ 0: [0, 10, 0], 1: [0, 20, 0], 2: [-8, 10, 0] }), vignette: 15 } },
  { g: 'Natur', id: 'forest', name: 'Dyp skog', p: { filter: look('chrome', 70), hsl: hsl({ 3: [0, -35, -12], 2: [0, -10, 0] }), curves: curve(TOE), vignette: 20 } },
  { g: 'Natur', id: 'sea', name: 'Hav og himmel', p: { filter: look('provia'), hsl: hsl({ 4: [0, 25, -5], 5: [-6, 20, -15] }), vibrance: 12 } },
  // Kreativ
  { g: 'Kreativ', id: 'dreamy', name: 'Drømmeslør', p: { bloom: 45, bloomThr: 55, bloomRadius: 90, fade: 15, contrast: -10, filter: look('pastel', 60) } },
  { g: 'Kreativ', id: 'lofi-cam', name: 'Lo-fi kamera', p: { filter: look('lofi'), vignette: 45, vigSize: 30, grain: 30, grainSize: 2.2 } },
  { g: 'Kreativ', id: 'miniature', name: 'Miniatyr', p: { blur: 60, blurMode: 'tilt', saturation: 25, contrast: 15 } },
  { g: 'Kreativ', id: 'infrared', name: 'Infrarød', p: { filter: look('ir'), grain: 15 } },
  { g: 'Kreativ', id: 'cross', name: 'Kryssprosess', p: { filter: look('xpro'), curves: curve(LIN, [[0, 0], [0.3, 0.22], [0.7, 0.82], [1, 1]], LIN, [[0, 0.12], [0.5, 0.5], [1, 0.86]]), vignette: 20 } },
  { g: 'Kreativ', id: 'cyanotype', name: 'Cyanotypi', p: { filter: look('cyanotype'), fade: 12, grain: 18, vignette: 25 } },
];
export const PMAP: Record<string, Preset> = Object.fromEntries(PRESETS.map((p) => [p.id, p]));

/** `base` with every style tool reset and the preset's values applied. */
export function applyPresetTo(base: Params, pr: Preset): Params {
  const out = { ...base } as Record<string, unknown>;
  for (const k of STYLE_KEYS) out[k] = clone(DEF[k]);
  for (const [k, v] of Object.entries(pr.p)) out[k] = clone(v);
  return out as unknown as Params;
}

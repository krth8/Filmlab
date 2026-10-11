import { LIN, type Curves } from './model';

export interface FilterVals { warm: number; con: number; fade: number; sat: number; split: number; sh: number; hh: number }
export interface FilterDef { id: string; name: string; g?: string; mono?: boolean; v?: FilterVals }

export const FILTERS: FilterDef[] = [
  { id: 'none', name: 'Ingen' },
  { g: 'Film', id: 'portra', name: 'Portra 400', v: { warm: 15, con: -10, fade: 12, sat: -8, split: 18, sh: 195, hh: 35 } },
  { g: 'Film', id: 'ektar', name: 'Ektar 100', v: { warm: 6, con: 22, fade: 0, sat: 35, split: 8, sh: 220, hh: 30 } },
  { g: 'Film', id: 'gold', name: 'Gold 200', v: { warm: 30, con: 6, fade: 6, sat: 12, split: 22, sh: 210, hh: 45 } },
  { g: 'Film', id: 'velvia', name: 'Velvia 50', v: { warm: -4, con: 30, fade: 0, sat: 55, split: 10, sh: 250, hh: 50 } },
  { g: 'Film', id: 'cine', name: 'Cinestill 800T', v: { warm: -30, con: 10, fade: 8, sat: 8, split: 35, sh: 190, hh: 15 } },
  { g: 'Film', id: 'kchrome', name: 'Kodachrome 64', v: { warm: 10, con: 25, fade: 4, sat: 25, split: 15, sh: 205, hh: 25 } },
  { g: 'Film', id: 'pro400h', name: 'Fuji 400H', v: { warm: -8, con: -12, fade: 14, sat: -10, split: 24, sh: 160, hh: 330 } },
  { g: 'Film', id: 'pola', name: 'Polaroid 600', v: { warm: 14, con: -18, fade: 26, sat: -14, split: 30, sh: 185, hh: 50 } },
  { g: 'Film', id: 'trix', name: 'Tri-X 400', mono: true, v: { warm: 0, con: 30, fade: 4, sat: 0, split: 0, sh: 0, hh: 0 } },
  { g: 'Film', id: 'hp5', name: 'Ilford HP5', mono: true, v: { warm: 0, con: 12, fade: 10, sat: 0, split: 8, sh: 220, hh: 40 } },
  { g: 'Kino', id: 'teal', name: 'Teal & Orange', v: { warm: 8, con: 18, fade: 2, sat: 15, split: 60, sh: 190, hh: 30 } },
  { g: 'Kino', id: 'bleach', name: 'Bleach bypass', v: { warm: -4, con: 40, fade: 0, sat: -55, split: 6, sh: 210, hh: 40 } },
  { g: 'Kino', id: 'dfn', name: 'Day for night', v: { warm: -70, con: 10, fade: 0, sat: -40, split: 40, sh: 225, hh: 220 } },
  { g: 'Kino', id: 'amber', name: 'Amber haze', v: { warm: 40, con: 10, fade: 10, sat: -10, split: 55, sh: 30, hh: 35 } },
  { g: 'Kreativ', id: 'xpro', name: 'Kryssprosess', v: { warm: -10, con: 25, fade: 0, sat: 30, split: 50, sh: 170, hh: 60 } },
  { g: 'Kreativ', id: 'matte', name: 'Falmet matt', v: { warm: 6, con: -25, fade: 40, sat: -25, split: 15, sh: 220, hh: 40 } },
  { g: 'Kreativ', id: 'ir', name: 'Infrarød', v: { warm: -20, con: 20, fade: 6, sat: -30, split: 60, sh: 320, hh: 175 } },
  { g: 'Kreativ', id: 'lofi', name: 'Lo-fi', v: { warm: 10, con: 45, fade: 0, sat: 40, split: 20, sh: 260, hh: 55 } },
  { g: 'Kreativ', id: 'nordlys', name: 'Nordlys', v: { warm: -25, con: 8, fade: 8, sat: 20, split: 40, sh: 160, hh: 140 } },
];
export const FMAP: Record<string, FilterDef> = Object.fromEntries(FILTERS.map((f) => [f.id, f]));

export const FSLIDERS: [keyof FilterVals, string, number, number][] = [
  ['warm', 'Varme', -100, 100], ['con', 'Kontrast', -100, 100], ['fade', 'Fade', 0, 100], ['sat', 'Metning', -100, 100],
  ['split', 'Split-toning', 0, 100], ['sh', 'Skygge-hue', 0, 360], ['hh', 'Høylys-hue', 0, 360],
];

export const CURVES: Record<string, Curves> = {
  'Lineær': { rgb: LIN, r: LIN, g: LIN, b: LIN },
  'Myk S': { rgb: [[0, 0], [0.25, 0.21], [0.75, 0.8], [1, 1]], r: LIN, g: LIN, b: LIN },
  'Sterk S': { rgb: [[0, 0], [0.25, 0.15], [0.75, 0.87], [1, 1]], r: LIN, g: LIN, b: LIN },
  'Matt (løftet svart)': { rgb: [[0, 0.1], [0.3, 0.3], [0.8, 0.82], [1, 0.96]], r: LIN, g: LIN, b: LIN },
  'Film-tå og skulder': { rgb: [[0, 0.04], [0.12, 0.08], [0.5, 0.52], [0.88, 0.93], [1, 0.97]], r: LIN, g: LIN, b: LIN },
  'Kryssprosess': { rgb: LIN, r: [[0, 0], [0.3, 0.22], [0.7, 0.82], [1, 1]], g: [[0, 0], [0.3, 0.25], [0.7, 0.78], [1, 1]], b: [[0, 0.12], [0.5, 0.5], [1, 0.86]] },
  'Varm kurve': { rgb: [[0, 0], [0.5, 0.52], [1, 1]], r: [[0, 0], [0.5, 0.56], [1, 1]], g: LIN, b: [[0, 0], [0.5, 0.44], [1, 0.95]] },
  'Kald kurve': { rgb: LIN, r: [[0, 0], [0.5, 0.45], [1, 0.96]], g: LIN, b: [[0, 0.03], [0.5, 0.56], [1, 1]] },
  'Teal skygger': { rgb: [[0, 0], [0.25, 0.2], [0.75, 0.8], [1, 1]], r: [[0, 0], [0.3, 0.24], [1, 1]], g: [[0, 0.02], [0.3, 0.31], [1, 1]], b: [[0, 0.06], [0.3, 0.36], [0.8, 0.78], [1, 0.94]] },
  'Høy nøkkel': { rgb: [[0, 0.06], [0.4, 0.55], [1, 1]], r: LIN, g: LIN, b: LIN },
  'Lav nøkkel': { rgb: [[0, 0], [0.6, 0.45], [1, 0.92]], r: LIN, g: LIN, b: LIN },
};

export const BANDS = [
  { n: 'Rød', h: 0 }, { n: 'Oransje', h: 30 }, { n: 'Gul', h: 58 }, { n: 'Grønn', h: 115 },
  { n: 'Cyan', h: 180 }, { n: 'Blå', h: 222 }, { n: 'Lilla', h: 270 }, { n: 'Magenta', h: 318 },
];

export const HSL_PRESETS: Record<string, Record<number, { h: number; s: number; l: number }>> = {
  'Beskytt hudtoner': { 0: { h: 3, s: -8, l: 4 }, 1: { h: 0, s: -12, l: 8 } },
  'Dyp himmel': { 4: { h: 0, s: 15, l: -10 }, 5: { h: -4, s: 30, l: -22 } },
  'Gyllent gress': { 2: { h: -12, s: 15, l: 4 }, 3: { h: -30, s: -15, l: 0 } },
  'Teal & orange': { 1: { h: 0, s: 20, l: 5 }, 3: { h: 40, s: -20, l: 0 }, 4: { h: 8, s: 25, l: 0 }, 5: { h: -15, s: 10, l: 0 } },
  'Dempet grønt': { 3: { h: 0, s: -45, l: -10 }, 2: { h: 0, s: -15, l: 0 } },
  'Neon natt': { 6: { h: 0, s: 40, l: 10 }, 7: { h: 0, s: 40, l: 10 }, 4: { h: 0, s: 30, l: 10 } },
};

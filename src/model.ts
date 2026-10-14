export type Pt = [number, number];
export interface Curves { rgb: Pt[]; r: Pt[]; g: Pt[]; b: Pt[] }
export interface HslBand { h: number; s: number; l: number }
export interface FilterSel { id: string; k: number; v: Record<string, number> | null }
export type BlurMode = 'tilt' | 'radial' | 'full';

export interface Params {
  exposure: number; contrast: number; highlights: number; shadows: number; whites: number; blacks: number;
  temp: number; tint: number; saturation: number; vibrance: number; fade: number;
  texture: number; clarity: number; dehaze: number;
  curves: Curves; hsl: HslBand[];
  vignette: number; vigSize: number; vigFeather: number; grain: number; grainSize: number;
  blur: number; blurMode: BlurMode; bloom: number; bloomThr: number; bloomRadius: number; halation: number;
  filter: FilterSel;
  lut: { id: string | null; k: number };
}
export type Key = keyof Params;

export const LIN: Pt[] = [[0, 0], [1, 1]];

export const DEF: Params = {
  exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0,
  temp: 0, tint: 0, saturation: 0, vibrance: 0, fade: 0,
  texture: 0, clarity: 0, dehaze: 0,
  curves: { rgb: LIN, r: LIN, g: LIN, b: LIN },
  hsl: Array.from({ length: 8 }, () => ({ h: 0, s: 0, l: 0 })),
  vignette: 0, vigSize: 50, vigFeather: 50, grain: 0, grainSize: 1.4,
  blur: 0, blurMode: 'tilt', bloom: 0, bloomThr: 72, bloomRadius: 50, halation: 0,
  filter: { id: 'none', k: 100, v: null },
  lut: { id: null, k: 100 },
};

/** Slider ranges. Per-item overrides of these keys are stored as an offset on top of the global value,
 *  so later global changes still carry through. All other keys are replaced outright. */
export const NUM: Partial<Record<Key, [number, number]>> = {
  exposure: [-3, 3], contrast: [-100, 100], highlights: [-100, 100], shadows: [-100, 100], whites: [-100, 100], blacks: [-100, 100],
  temp: [-100, 100], tint: [-100, 100], saturation: [-100, 100], vibrance: [-100, 100], fade: [0, 100],
  texture: [-100, 100], clarity: [-100, 100], dehaze: [-100, 100],
  vignette: [-100, 100], vigSize: [0, 100], vigFeather: [0, 100], grain: [0, 100], grainSize: [1, 4],
  blur: [0, 100], bloom: [0, 100], bloomThr: [30, 95], bloomRadius: [0, 100], halation: [0, 100],
};

export const LABELS: Record<Key, string> = {
  exposure: 'Exposure', contrast: 'Contrast', highlights: 'Highlights', shadows: 'Shadows', whites: 'Whites', blacks: 'Blacks',
  temp: 'Temperature', tint: 'Tint', saturation: 'Saturation', vibrance: 'Vibrance', fade: 'Fade', texture: 'Texture', clarity: 'Clarity', dehaze: 'Dehaze', curves: 'Curves', hsl: 'Selective color',
  vignette: 'Vignette', vigSize: 'Vignette size', vigFeather: 'Vignette softness', grain: 'Grain', grainSize: 'Grain size', blur: 'Blur', blurMode: 'Blur type',
  bloom: 'Bloom', bloomThr: 'Bloom threshold', bloomRadius: 'Bloom radius', halation: 'Halation', filter: 'Look', lut: 'LUT',
};

export const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
export const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);

export type Override = Partial<Record<Key, unknown>>;

export function effective(G: Params, ov: Override): Params {
  const o = { ...G } as Record<string, unknown>;
  for (const k in ov) {
    const r = NUM[k as Key];
    o[k] = r ? clamp((G[k as Key] as number) + (ov[k as Key] as number), r[0], r[1]) : ov[k as Key];
  }
  return o as unknown as Params;
}

export type Kind = 'image' | 'video';

export interface Item {
  id: number;
  key: string;            // name|size|lastModified – used to restore edits
  name: string;
  file: File;
  kind: Kind;
  override: Override;
  trim: { in: number; out: number } | null;
  duration: number;
  width: number;
  height: number;
  preview: ImageBitmap | null;  // ≤ 2048 px, images only
  thumb: ImageBitmap | null;    // ≤ 240 px
  lum: number;                  // mean luminance of the thumb, for auto-match
  status: 'loading' | 'ready' | 'error';
  error?: string;
}

export const isTrimmed = (it: Item) => !!it.trim && (it.trim.in > 0.05 || it.trim.out < it.duration - 0.05);

/* ---------- white balance ----------
 * The sliders are -100…100 but the response is curved: fine control near the middle, and the
 * effect grows faster towards the ends (up to about one stop of red/blue shift at ±100). */
const WB_CURVE = 2, TEMP_STOPS = 1.1, TINT_STOPS = 0.8;
const shape = (v: number, stops: number) => Math.sign(v) * Math.pow(Math.abs(v) / 100, WB_CURVE) * stops;
const unshape = (k: number, stops: number) => Math.sign(k) * Math.pow(Math.min(1, Math.abs(k) / stops), 1 / WB_CURVE) * 100;

/** Linear-light RGB gains for a temperature/tint setting. */
export function wbGains(temp: number, tint: number): [number, number, number] {
  const k = shape(temp, TEMP_STOPS), t = shape(tint, TINT_STOPS);
  return [Math.pow(2, k + t / 2), Math.pow(2, -t), Math.pow(2, -k + t / 2)];
}

/** Temperature/tint that make a sampled (linear-light) colour neutral grey. */
export function wbNeutral(R: number, G: number, B: number): { temp: number; tint: number } {
  const k = 0.5 * Math.log2(B / R);
  const A = (R * Math.pow(2, k) + B * Math.pow(2, -k)) / 2;
  const t = -Math.log2(A / G) / 1.5;
  return { temp: Math.round(clamp(unshape(k, TEMP_STOPS), -100, 100)), tint: Math.round(clamp(unshape(t, TINT_STOPS), -100, 100)) };
}

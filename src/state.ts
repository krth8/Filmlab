import { DEF, NUM, clone, effective, type Item, type Key, type Override, type Params } from './model';
import type { CubeLut } from './cube';
import { DEFAULT_EXPORT, type ExportSettings } from './exporter';
import * as store from './store';

export type Tab = 'looks' | 'light' | 'color' | 'curves' | 'fx' | 'trim';
export interface UserLook { id: string; name: string; params: Params }
interface Saved { override: Override; trim: Item['trim'] }

export const S = {
  items: [] as Item[],
  cur: 0,
  G: clone(DEF) as Params,
  scope: 'all' as 'all' | 'item',
  tab: 'looks' as Tab,
  luts: [] as CubeLut[],
  looks: [] as UserLook[],
  edits: {} as Record<string, Saved>,
  exportSettings: { ...DEFAULT_EXPORT } as ExportSettings,
  folderName: '',
  importDir: null as FileSystemDirectoryHandle | null,
  showBefore: false,
  sheetOpen: false,
};

/* ---------- events ---------- */
type Ev = 'params' | 'select' | 'items' | 'ui' | 'trim';
const L: Record<Ev, Set<() => void>> = { params: new Set(), select: new Set(), items: new Set(), ui: new Set(), trim: new Set() };
export const on = (e: Ev, fn: () => void) => L[e].add(fn);
export const emit = (e: Ev) => L[e].forEach((f) => f());

/* ---------- params ---------- */
export const curItem = (): Item | undefined => S.items[S.cur];
export const paramsFor = (it: Item): Params => effective(S.G, it.override);

/** Value shown in the panel: the global value in "all" scope, the item's effective value otherwise. */
export function getV<K extends Key>(k: K): Params[K] {
  const it = curItem();
  return S.scope === 'item' && it ? paramsFor(it)[k] : S.G[k];
}

export function setV<K extends Key>(k: K, v: Params[K]) {
  const it = curItem();
  if (S.scope === 'item' && it) {
    if (NUM[k]) {
      const d = +((v as number) - (S.G[k] as number)).toFixed(3);
      if (d) it.override[k] = d; else delete it.override[k];
    } else it.override[k] = clone(v);
    remember(it);
  } else S.G[k] = clone(v);
  changed();
}

export function resetKey(k: Key) {
  const it = curItem();
  if (S.scope === 'item' && it) { delete it.override[k]; remember(it); } else S.G[k] = clone(DEF[k]) as never;
  changed();
}

export function overrideCount(k: Key) { return S.items.filter((it) => k in it.override).length; }

export function changed() {
  emit('params');
  store.setLater('global', () => S.G);
}

export function remember(it: Item) {
  S.edits[it.key] = { override: it.override, trim: it.trim };
  store.setLater('edits', () => S.edits);
}

export const lutById = (id: string | null) => (id ? S.luts.find((l) => l.id === id) ?? null : null);

/* ---------- selection ---------- */
export function select(i: number) {
  if (!S.items.length) return;
  S.cur = (i + S.items.length) % S.items.length;
  const it = curItem()!;
  if (it.kind !== 'video' && S.tab === 'trim') S.tab = 'looks';
  S.showBefore = false;
  emit('select');
}

/* ---------- persistence ---------- */
export async function restore() {
  const [g, edits, looks, luts, ex] = await Promise.all([
    store.get<Params>('global'), store.get<Record<string, Saved>>('edits'), store.get<UserLook[]>('looks'),
    store.get<CubeLut[]>('luts'), store.get<ExportSettings>('export'),
  ]);
  if (g) S.G = { ...clone(DEF), ...g };
  if (edits) S.edits = edits;
  if (looks) S.looks = looks.map((l) => ({ ...l, params: { ...clone(DEF), ...l.params } }));
  if (luts) S.luts = luts;
  if (ex) S.exportSettings = { ...DEFAULT_EXPORT, ...ex };
}
export const saveLooks = () => store.set('looks', S.looks);
export const saveLuts = () => store.set('luts', S.luts);
export const saveExport = () => store.set('export', S.exportSettings);

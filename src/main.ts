import './styles.css';
import { clone, type Item } from './model';
import { canPickDir, fileKey, fromDrop, kindOf, loadItem, pickDirectory, pickFiles, type Picked } from './media';
import { S, emit, on, restore, select } from './state';
import { $, h, isPhone, toast } from './ui/dom';
import { buildReel, refresh, setAddHandler } from './ui/reel';
import { build } from './ui/panel';
import { draw } from './ui/stage';
import { openExport } from './ui/exportSheet';

let nextId = 1;

async function addFiles(p: Picked) {
  const known = new Set(S.items.map((i) => i.key));
  const fresh: Item[] = [];
  for (const f of p.files) {
    const kind = kindOf(f), key = fileKey(f);
    if (!kind || known.has(key)) continue;
    const saved = S.edits[key];
    fresh.push({
      id: nextId++, key, name: f.name, file: f, kind,
      override: saved ? clone(saved.override) : {}, trim: saved?.trim ? { ...saved.trim } : null,
      duration: 0, width: 0, height: 0, preview: null, thumb: null, lum: 0, status: 'loading',
    });
  }
  if (!fresh.length) { toast('Fant ingen nye bilder eller videoer'); return; }
  const first = !S.items.length;
  S.items.push(...fresh);
  if (first) { S.folderName = p.name; S.importDir = p.dir; S.cur = 0; }
  else if (!S.folderName.endsWith('+')) S.folderName += ' +';
  updateTop();
  buildReel();
  select(first ? 0 : S.items.length - fresh.length);
  toast(`La til ${fresh.length} ${fresh.length === 1 ? 'fil' : 'filer'}`);

  // Read thumbnails a few at a time; the current item first.
  const queue = [...fresh];
  const cur = S.items[S.cur];
  if (queue.includes(cur)) queue.unshift(...queue.splice(queue.indexOf(cur), 1));
  const worker = async () => {
    for (let it = queue.shift(); it; it = queue.shift()) {
      await loadItem(it);
      refresh(it);
      if (it === S.items[S.cur]) emit('items');
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  emit('items');
  updateTop();
  const bad = fresh.filter((i) => i.status === 'error').length;
  if (bad) toast(`${bad} ${bad === 1 ? 'fil' : 'filer'} kunne ikke leses`);
}

function updateTop() {
  const nv = S.items.filter((i) => i.kind === 'video').length;
  $('#folderName').textContent = S.folderName;
  $('#folderMeta').textContent = S.items.length ? `${S.items.length} elementer · ${nv} videoer` : '';
  $('#empty').hidden = S.items.length > 0;
  document.body.classList.toggle('has-items', S.items.length > 0);
}

/* ---------- open menu ---------- */
const canFolderInput = 'webkitdirectory' in document.createElement('input') && !isPhone();
async function openFolder() {
  try {
    const p = canPickDir ? await pickDirectory() : await pickFiles(true);
    if (p) await addFiles(p);
  } catch (e) { toast((e as Error).message); }
}
async function openFiles() {
  const p = await pickFiles();
  if (p) await addFiles(p);
}
function clearAll() {
  S.items = [];
  S.cur = 0;
  S.folderName = '';
  S.importDir = null;
  buildReel();
  updateTop();
  emit('select');
}

const menu = $('#openMenu');
function showMenu(anchor: HTMLElement) {
  menu.replaceChildren();
  if (canPickDir || canFolderInput) menu.append(h('button', { onclick: () => { hideMenu(); openFolder(); } }, 'Åpne mappe…'));
  menu.append(h('button', { onclick: () => { hideMenu(); openFiles(); } }, 'Velg bilder og videoer…'));
  if (S.items.length) menu.append(h('button', { class: 'danger', onclick: () => { hideMenu(); clearAll(); } }, 'Lukk alle'));
  const r = anchor.getBoundingClientRect();
  menu.style.top = r.bottom + 6 + 'px';
  menu.style.right = Math.max(16, innerWidth - r.right) + 'px';
  menu.hidden = false;
}
const hideMenu = () => (menu.hidden = true);
document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !menu.contains(e.target as Node) && !(e.target as Element).closest('#openBtn')) hideMenu(); });
$('#openBtn').onclick = (e) => showMenu(e.currentTarget as HTMLElement);
$('#exportBtn').onclick = openExport;
setAddHandler(() => showMenu($('#openBtn')));

$('#emptyFolder').hidden = !(canPickDir || canFolderInput);
$('#emptyFolder').onclick = openFolder;
$('#emptyFiles').onclick = openFiles;

/* ---------- drag & drop ---------- */
let dragDepth = 0;
addEventListener('dragenter', (e) => { if (e.dataTransfer?.types.includes('Files')) { dragDepth++; document.body.classList.add('dragging'); } });
addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); } });
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', async (e) => {
  e.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('dragging');
  if (!e.dataTransfer) return;
  const p = await fromDrop(e.dataTransfer);
  if (p) addFiles(p);
});

/* ---------- boot ---------- */
on('select', updateTop);
await restore();
updateTop();
build();
draw();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
  // Fetch the video module once so the service worker has it for offline use.
  setTimeout(() => import('mediabunny').catch(() => {}), 4000);
}

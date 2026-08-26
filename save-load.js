// ═══════════════════════════════════════════════════════════
//  SAVE / LOAD — slots, autosave, state capture/restore + UI
//  Everything savable lives in localStorage, so a page refresh
//  never loses progress.
//  Loaded AFTER engine.js (it reads and writes engine state).
// ═══════════════════════════════════════════════════════════
const SAVE_VERSION = 2;
const SAVE_KEY     = 'quest-rpg-saves-v1';
const AUTOSAVE_KEY = 'quest-rpg-autosave-v1';
const SETTINGS_KEY = 'quest-rpg-settings-v1';
const TOTAL_SLOTS = 60;
const SLOTS_PER_PAGE = 6;
const TOTAL_PAGES = TOTAL_SLOTS / SLOTS_PER_PAGE;

let slotsMode = 'save';   // 'save' | 'load'
let slotsPage = 0;

const slotsOverlay   = document.getElementById('slots-overlay');
const slotsGrid      = document.getElementById('slots-grid');
const slotsTitle     = document.getElementById('slots-title');
const slotsPageLabel = document.getElementById('slots-page-label');
const slotsPrev      = document.getElementById('slots-prev');
const slotsNext      = document.getElementById('slots-next');
const slotsToast     = document.getElementById('slots-toast');

let saveNameMode = 'save'; // 'save' | 'rename'
let saveNameIndex = -1;
const saveNameOverlay = document.getElementById('save-name-overlay');
const saveNameInput   = document.getElementById('save-name-input');
const saveNameTitle   = document.getElementById('save-name-title');

// ── localStorage helpers ──────────────────────────────────
function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const data = JSON.parse(raw);
    return (data && typeof data === 'object') ? data : fallback;
  } catch (err) {
    console.warn('[save] could not read', key, err);
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn('[save] could not write', key, err);
    return false;
  }
}

function readSaves() { return readJSON(SAVE_KEY, {}); }
function writeSaves(saves) { return writeJSON(SAVE_KEY, saves); }

function showToast(message) {
  slotsToast.textContent = message || '';
}

// ── Full snapshot of every savable value ──────────────────
function captureState() {
  const dialog = (typeof captureDialogState === 'function') ? captureDialogState() : null;
  return {
    version: SAVE_VERSION,
    episode: CURRENT_EPISODE,
    scene: CURRENT_SCENE,
    x: player.x,
    y: player.y,
    dir: player.dir,
    // grid cell is stored too, so a save survives a resolution change
    col: CELL_W ? player.x / CELL_W : 0,
    row: CELL_H ? player.y / CELL_H : 0,
    seen: Array.from(SEEN),
    choices: Object.assign({}, CHOICES),
    flags: Object.assign({}, FLAGS),
    actors: ACTORS.map(a => ({
      id: a.id,
      sprite: a.baseSprite || a.sprite,
      facing: a.facing || null,
      flip: !!a.flip,
      scale: a.scale || 1,
      col: CELL_W ? a.x / CELL_W : 0,
      row: CELL_H ? a.y / CELL_H : 0,
    })),
    dialog: dialog,
    savedAt: Date.now(),
  };
}

function applyState(state) {
  if (!state) return;
  closeDialog({ suppressEnd: true });
  SEEN.clear();
  (state.seen || []).forEach(k => SEEN.add(k));
  Object.keys(CHOICES).forEach(k => delete CHOICES[k]);
  Object.assign(CHOICES, state.choices || {});
  Object.keys(FLAGS).forEach(k => delete FLAGS[k]);
  Object.assign(FLAGS, state.flags || {});
  ACTORS.length = 0;
  if (typeof cancelActiveScript === 'function') cancelActiveScript();
  else cutscene = false;
  scriptWalk = null;
  if (state.scene && SCENES[state.scene] && state.scene !== CURRENT_SCENE) {
    applyScene(state.scene, null, { suppressAutosave: true });
  }
  // Prefer grid coordinates (resolution independent), fall back to raw pixels.
  if (typeof state.col === 'number' && CELL_W) {
    player.x = state.col * CELL_W;
    player.y = state.row * CELL_H;
  } else {
    player.x = state.x;
    player.y = state.y;
  }
  player.dir = state.dir || 'idle';
  player.moving = false;
  player.bobTime = 0;
  (state.actors || []).forEach(a => {
    const actor = addActor({ id: a.id, sprite: a.sprite, scale: a.scale });
    actor.x = (a.col || 0) * CELL_W;
    actor.y = (a.row || 0) * CELL_H;
    actor.facing = a.facing || null;
    actor.flip = !!a.flip;
  });
  autoWalk = null;
  keys.up = keys.down = keys.left = keys.right = false;
  if (state.dialog && typeof restoreDialogState === 'function') {
    restoreDialogState(state.dialog);
  }
  updateDevLabel();
}

// ── Autosave: keeps the live playthrough in localStorage ──
let autosaveEnabled = false;

function autosave() {
  if (!autosaveEnabled) return;
  const state = captureState();
  state.name = 'Autosave';
  state.auto = true;
  writeJSON(AUTOSAVE_KEY, state);
}

function readAutosave() {
  const s = readJSON(AUTOSAVE_KEY, null);
  return (s && s.scene && SCENES[s.scene]) ? s : null;
}

function clearAutosave() {
  try { localStorage.removeItem(AUTOSAVE_KEY); } catch (err) { /* ignore */ }
}

// Start autosaving once the player is actually in the world.
function beginAutosave() {
  autosaveEnabled = true;
  autosave();
}

// Periodic + lifecycle autosaves so a refresh or tab close is safe.
setInterval(autosave, 5000);
window.addEventListener('pagehide', autosave);
window.addEventListener('beforeunload', autosave);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') autosave();
});

// ── Settings persistence ──────────────────────────────────
function saveSettings() {
  const touch = document.getElementById('set-touch');
  const hint  = document.getElementById('set-hint');
  writeJSON(SETTINGS_KEY, {
    touch: !!(touch && touch.checked),
    hint: hint ? !!hint.checked : true,
  });
}

function restoreSettings() {
  const s = readJSON(SETTINGS_KEY, null);
  if (!s) return;
  const touch = document.getElementById('set-touch');
  const hint  = document.getElementById('set-hint');
  if (touch && typeof s.touch === 'boolean' && touch.checked !== s.touch) {
    touch.checked = s.touch;
    touch.dispatchEvent(new Event('change'));
  }
  if (hint && typeof s.hint === 'boolean' && hint.checked !== s.hint) {
    hint.checked = s.hint;
    hint.dispatchEvent(new Event('change'));
  }
}

['set-touch', 'set-hint'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', saveSettings);
});
restoreSettings();

function cellLabel(state) {
  const x = typeof state.col === 'number' ? state.col * CELL_W : state.x;
  const y = typeof state.row === 'number' ? state.row * CELL_H : state.y;
  const col = Math.max(0, Math.min(COLS - 1, Math.floor(x / CELL_W)));
  const row = Math.max(0, Math.min(ROWS - 1, Math.floor(y / CELL_H)));
  return `C${col}R${row}`;
}


function renderSlots() {
  slotsTitle.textContent = slotsMode === 'save' ? 'SAVE GAME' : 'LOAD GAME';
  slotsPageLabel.textContent = `Page ${slotsPage + 1} / ${TOTAL_PAGES}`;
  slotsPrev.disabled = slotsPage === 0;
  slotsNext.disabled = slotsPage === TOTAL_PAGES - 1;

  const saves = readSaves();
  slotsGrid.innerHTML = '';

  for (let i = 0; i < SLOTS_PER_PAGE; i++) {
    const index = slotsPage * SLOTS_PER_PAGE + i;
    const data = saves[index];
    const slot = document.createElement('div');
    slot.className = 'slot' + (data ? ' filled' : '');
    if (!data && slotsMode === 'load') slot.classList.add('disabled');

    const head = document.createElement('div');
    head.className = 'slot-index';
    head.textContent = `SLOT ${index + 1}`;
    slot.appendChild(head);

    if (data) {
      const name = document.createElement('div');
      name.className = 'slot-name';
      name.textContent = data.name || `Save ${index + 1}`;
      slot.appendChild(name);

      const meta = document.createElement('div');
      meta.className = 'slot-meta';
      meta.textContent = `${data.scene} · ${cellLabel(data)}\n${new Date(data.savedAt).toLocaleString()}`;
      meta.style.whiteSpace = 'pre-line';
      slot.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'slot-actions';

      const renameBtn = document.createElement('button');
      renameBtn.className = 'slot-action';
      renameBtn.type = 'button';
      renameBtn.textContent = 'RENAME';
      renameBtn.addEventListener('click', e => {
        e.stopPropagation();
        openSaveNamePrompt('rename', index, data.name || '');
      });
      actions.appendChild(renameBtn);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'slot-action delete';
      deleteBtn.type = 'button';
      deleteBtn.textContent = '🗑 DELETE';
      deleteBtn.title = `Delete slot ${index + 1}`;
      deleteBtn.addEventListener('click', e => {
        e.stopPropagation();
        const saveName = data.name ? `"${data.name}"` : `slot ${index + 1}`;
        if (!confirm(`Are you sure you want to delete ${saveName}?\n\nThis cannot be undone.`)) return;
        const all = readSaves();
        delete all[index];
        writeSaves(all);
        renderSlots();
        showToast(`Slot ${index + 1} deleted.`);
      });
      actions.appendChild(deleteBtn);

      slot.appendChild(actions);
    } else {
      const empty = document.createElement('div');
      empty.className = 'slot-empty';
      empty.textContent = slotsMode === 'save' ? '— Empty —' : '— No data —';
      slot.appendChild(empty);
    }

    slot.addEventListener('click', () => {
      if (slotsMode === 'save') {
        if (data && !confirm(`Overwrite slot ${index + 1}?`)) return;
        const suggested = data && data.name ? data.name : '';
        openSaveNamePrompt('save', index, suggested);
      } else {
        if (!data) return;
        applyState(data);
        closeSlots();
        if (typeof startPlaying === 'function' && mainMenu.classList.contains('open')) startPlaying();
        beginAutosave();
      }
    });

    slotsGrid.appendChild(slot);
  }
}

function openSlots(mode) {
  slotsMode = mode;
  slotsPage = 0;
  showToast('');
  slotsOverlay.classList.add('open');
  renderSlots();
}

function closeSlots() {
  slotsOverlay.classList.remove('open');
}

function openSaveNamePrompt(mode, index, suggestedName) {
  saveNameMode = mode;
  saveNameIndex = index;
  saveNameTitle.textContent = mode === 'rename' ? 'RENAME SAVE' : 'NAME THIS SAVE';
  saveNameInput.value = suggestedName || '';
  saveNameOverlay.classList.add('open');
  setTimeout(() => saveNameInput.focus(), 50);
}

function closeSaveNamePrompt() {
  saveNameOverlay.classList.remove('open');
  saveNameInput.value = '';
  saveNameIndex = -1;
}

function confirmSaveName() {
  if (saveNameIndex < 0) return;
  const name = saveNameInput.value.trim();
  const all = readSaves();
  if (saveNameMode === 'rename') {
    if (!all[saveNameIndex]) return closeSaveNamePrompt();
    all[saveNameIndex].name = name;
    writeSaves(all);
    renderSlots();
    showToast(`Slot ${saveNameIndex + 1} renamed.`);
  } else {
    all[saveNameIndex] = Object.assign(captureState(), { name: name });
    if (writeSaves(all)) {
      autosave();
      renderSlots();
      showToast(`Game saved to slot ${saveNameIndex + 1}.`);
    } else {
      showToast('Could not save — storage unavailable.');
    }
  }
  closeSaveNamePrompt();
}

document.getElementById('btn-save').addEventListener('click', () => openSlots('save'));
document.getElementById('btn-load').addEventListener('click', () => openSlots('load'));
document.getElementById('slots-close').addEventListener('click', closeSlots);
slotsPrev.addEventListener('click', () => { if (slotsPage > 0) { slotsPage--; renderSlots(); } });
slotsNext.addEventListener('click', () => { if (slotsPage < TOTAL_PAGES - 1) { slotsPage++; renderSlots(); } });
slotsOverlay.addEventListener('click', e => { if (e.target === slotsOverlay) closeSlots(); });
window.addEventListener('keydown', e => {
  if (e.code === 'Escape' && slotsOverlay.classList.contains('open') && !saveNameOverlay.classList.contains('open')) closeSlots();
});

// In-game save-name prompt handlers
document.getElementById('save-name-confirm').addEventListener('click', confirmSaveName);
document.getElementById('save-name-cancel').addEventListener('click', closeSaveNamePrompt);
saveNameInput.addEventListener('keydown', e => {
  if (e.code === 'Enter') { e.preventDefault(); confirmSaveName(); }
  else if (e.code === 'Escape') { e.preventDefault(); closeSaveNamePrompt(); }
});
saveNameOverlay.addEventListener('click', e => { if (e.target === saveNameOverlay) closeSaveNamePrompt(); });

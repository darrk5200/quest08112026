// ═══════════════════════════════════════════════════════════
//  ENGINE — all game behaviour lives here
//  Rendering, character movement, interactions, dialogue,
//  scene switching, cutscene script runner and the main loop.
//  Episode files only describe data and call these functions
//  through cutscene script steps.
//  Loaded AFTER game-state.js and the episode files.
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
//  CONFIGURATION
// ═══════════════════════════════════════════════════════════
let ROOM_W   = 1485;
let ROOM_H   = 1059;
// Reference stage: every scene is rendered inside this box (scene-1's own
// resolution), so a smaller/rectangular background is scaled DOWN to fit
// rather than being blown up to fill the canvas.
let STAGE_W  = 1254;
let STAGE_H  = 1254;
let ROOM_FIT = 1;      // how much the current room is shrunk inside the stage
let stageLeft = 0, stageTop = 0, stageW = 0, stageH = 0;
const COLS     = 32;
const ROWS     = 20;
let CELL_W   = ROOM_W / COLS;
let CELL_H   = ROOM_H / ROWS;

// Player speed / character height are kept proportional to the room so the
// character looks the same size in every scene, whatever the image resolution.
const SPEED_RATIO = 280 / 1059;
const CHAR_RATIO  = 160 / 1059;
let PLAYER_SPEED = SPEED_RATIO * ROOM_H;
let CHAR_H       = CHAR_RATIO * ROOM_H;

// Walk-bob amplitude and frequency
let BOB_AMP  = 3;   // room-pixels
const BOB_FREQ = 8;   // cycles per second (while moving)

// Scenes, characters and dialogue live in the episode files (episode-01.js, ...)

let scene = SCENES[CURRENT_SCENE];

function parseCells(input) {
  const set = new Set();
  if (input === '*') {
    for (let c = 0; c < 32; c++) for (let r = 0; r < 20; r++) set.add(`${c},${r}`);
    return set;
  }
  input.replace(/C(\d+)R(\d+)/g, (_, c, r) => set.add(`${c},${r}`));
  return set;
}

// Only these cells are walkable in the current scene; all others are blocked.
let WALKABLE = parseCells(scene.walkable);

// Cells occupied by scene characters/props — the player cannot stand on them.
function parseOccupied(sc) {
  const set = new Set();
  (sc.props || []).forEach(p => {
    if (p.cell) parseCells(p.cell).forEach(k => set.add(k));
  });
  return set;
}
let OCCUPIED = parseOccupied(scene);

// ── Interact-cells for the current scene ──────────────────
// Each entry: trigger cells (Set) + the cell where the icon appears.
// Persistent progress: which interactions have been seen, and past choices.

function buildInteracts(sc) {
  return (sc.interacts || []).map(def => {
  const m = /C(\d+)R(\d+)/.exec(def.icon) || [];
  return {
    key: (sc.name || sc.background || '') + '|' + (def.icon || def.cells || ''),
    cells: parseCells(def.cells),
    iconCol: Number(m[1]),
    iconRow: Number(m[2]),
    lines: (def.lines && def.lines.length)
      ? def.lines
      : (def.text ? [{ speaker: def.speaker || '', name: def.name || '', text: def.text }] : []),
    repeatLines: def.repeatLines || null,
    goto: def.goto || null,
    at: def.at || null,
    script: def.script || null,
    once: def.once !== false,
    get seen() { return SEEN.has(this.key); },
    set seen(v) { if (v) SEEN.add(this.key); else SEEN.delete(this.key); },
  };
  });
}
let INTERACTS = buildInteracts(scene);


// ── Dynamic actors (characters spawned/moved by cutscene scripts) ──
function actorAnchor(str) {
  const m = /C(\d+)R(\d+)/.exec(String(str || ''));
  return m ? { x: (+m[1] + 0.5) * CELL_W, y: (+m[2] + 1) * CELL_H } : null;
}
function getActor(id) { return ACTORS.find(a => a.id === id) || null; }
function addActor(spec) {
  removeActor(spec.id);
  const p = actorAnchor(spec.at) || { x: 0, y: 0 };
  const a = { id: spec.id, sprite: spec.sprite, baseSprite: spec.sprite, x: p.x, y: p.y, scale: spec.scale || 1, path: [], done: null, facing: null, flip: false, moving: false, bobTime: 0 };
  ACTORS.push(a);
  return a;
}
function removeActor(id) {
  const i = ACTORS.findIndex(a => a.id === id);
  if (i >= 0) ACTORS.splice(i, 1);
}
function moveActor(id, cells, done) {
  const a = getActor(id);
  if (!a) { if (done) done(); return; }
  a.path = (cells || []).map(actorAnchor).filter(Boolean);
  a.done = done || null;
  if (!a.path.length && done) { a.done = null; done(); }
}
function setActorFacing(a, dx, dy) {
  const base = a.baseSprite || a.sprite;
  if (!String(base).startsWith('june')) return;
  if (Math.abs(dx) > Math.abs(dy)) {
    a.facing = 'june_right';
    a.flip = dx < 0;             // mirror the right-facing sprite when walking left
  } else if (dy < 0) {
    a.facing = 'june_up';
    a.flip = false;
  } else {
    a.facing = base;             // walking down/toward camera keeps the idle sprite
    a.flip = false;
  }
}

function updateActors(dt) {
  ACTORS.forEach(a => {
    if (!a.path || !a.path.length) {
      a.moving = false;
      a.bobTime = 0;
      return;
    }
    const t = a.path[0];
    const step = PLAYER_SPEED * 0.75 * dt;
    const dx = t.x - a.x, dy = t.y - a.y;
    const d = Math.hypot(dx, dy);
    setActorFacing(a, dx, dy);
    a.moving = true;
    a.bobTime = (a.bobTime || 0) + dt;
    if (d <= step) {
      a.x = t.x; a.y = t.y; a.path.shift();
      if (!a.path.length && a.done) {
        a.facing = null; a.flip = false;
        a.moving = false; a.bobTime = 0;
        const f = a.done; a.done = null; f();
      }
    } else {
      a.x += (dx / d) * step;
      a.y += (dy / d) * step;
    }
  });
}

// ── Cutscene script runner ──

let activeScript = null;

function cancelActiveScript() {
  activeScript = null;
  cutscene = false;
  scriptWalk = null;
}

function walkPlayerTo(cellStr, done) {
  const target = actorAnchor(cellStr);
  if (!target) { if (done) done(); return; }
  scriptWalk = { x: target.x, y: target.y, done: done || null };
}

function runScript(steps, done, startIndex) {
  cutscene = true;
  keys.up = keys.down = keys.left = keys.right = false;
  activeScript = {
    steps: Array.isArray(steps) ? steps : [],
    index: Math.max(0, Number(startIndex) || 0),
    done: done || null,
  };
  continueActiveScript();
}

function continueActiveScript() {
  if (!activeScript) { cutscene = false; return; }
  const steps = activeScript.steps || [];
  if (activeScript.index >= steps.length) {
    const done = activeScript.done;
    activeScript = null;
    cutscene = false;
    if (done) done();
    return;
  }
  runStep(steps[activeScript.index++], continueActiveScript);
}

function resumeScriptFromSnapshot(resume) {
  if (!resume || resume.type !== 'script' || !Array.isArray(resume.steps)) return;
  runScript(resume.steps, null, resume.index || 0);
}

function runStep(s, next) {
  if (!s) { next(); return; }
  if (s.wait) { setTimeout(next, s.wait); return; }
  if (s.parallel) {
    let n = s.parallel.length;
    if (!n) { next(); return; }
    const fin = () => { if (--n === 0) next(); };
    s.parallel.forEach(st => runStep(st, fin));
    return;
  }
  if (s.playerTo) { walkPlayerTo(s.playerTo, next); return; }
  if (s.actor) { addActor(s.actor); next(); return; }
  if (s.actorTo) { moveActor(s.actorTo.id, [s.actorTo.to], next); return; }
  if (s.actorPath) { moveActor(s.actorPath.id, s.actorPath.path, next); return; }
  if (s.setSprite) { const a = getActor(s.setSprite.id); if (a) a.sprite = s.setSprite.sprite; next(); return; }
  if (s.removeActor) { removeActor(s.removeActor); next(); return; }
  if (s.objective) { setObjective(s.objective); next(); return; }
  if (s.flags) { Object.assign(FLAGS, s.flags); next(); return; }
  if (s.goto) { changeScene(s.goto, s.at); next(); return; }
  if (s.dialog) { openDialog({ lines: s.dialog }, next); return; }
  next();
}


// The interaction whose trigger cell the player is currently standing on.


// ═══════════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════════
const canvas = document.getElementById('canvas');
const ctx    = canvas.getContext('2d');

let scale = 1;        // canvas-pixels per room-pixel
let offsetX = 0;      // canvas offset to center room
let offsetY = 0;

let dialogOpen = false;
let lastTime = 0;
let selectMode = false;
let selectingCells = false;
let selectionStart = null;
let selectedCells = new Set();

// Sprite images
const sprites = {};
const backgrounds = {};                       // scene name → preloaded Image
const SCENE_NAMES = Object.keys(SCENES);
let assetsLoaded = 0;
let TOTAL_ASSETS = 0;                         // set by buildManifest() below

// ═══════════════════════════════════════════════════════════
//  ASSET LOADING
//  Every background, character sprite and UI image referenced
//  anywhere in the registered episodes is preloaded before the
//  loading screen goes away — nothing pops in mid-scene.
// ═══════════════════════════════════════════════════════════

// Walk the episode data and collect every `sprite` / `facing` name used.
function collectSpriteNames() {
  const found = new Set();
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (typeof node.sprite === 'string') found.add(node.sprite);
    if (typeof node.facing === 'string') found.add(node.facing);
    Object.values(node).forEach(walk);
  };
  walk(SCENES);
  walk(CHARACTERS);
  walk(INTRO_LINES);
  // Player movement sheets are engine-owned, not referenced in episode data.
  ['idle', 'left', 'right', 'up', 'june_right', 'june_up'].forEach(n => found.add(n));
  return [...found];
}

// key → src for everything the game can draw.
function buildManifest() {
  const manifest = {};
  collectSpriteNames().forEach(name => {
    manifest[name] = 'sprites/' + name + '.png';
  });
  SCENE_NAMES.forEach(name => {
    if (SCENES[name] && SCENES[name].background) {
      manifest['bg:' + name] = SCENES[name].background;
    }
  });
  manifest['interact'] = 'icons/interact.png';
  manifest['menuBg']   = 'icons/game_main.jpg';
  manifest['computer'] = 'assets/computer_screen.png';
  return manifest;
}

let gameStarted = false;
function loadImage(key, src) {
  const img = new Image();
  const done = () => {
    assetsLoaded++;
    updateLoadProgress();
    if (assetsLoaded >= TOTAL_ASSETS && !gameStarted) { gameStarted = true; startGame(); }
  };
  img.onload  = done;
  img.onerror = () => { console.warn('[assets] failed to load', src); done(); };
  img.src = src;
  sprites[key] = img;
  if (key.startsWith('bg:')) backgrounds[key.slice(3)] = img;
}


function updateLoadProgress() {
  const bar = document.getElementById('load-bar-fill');
  const pct = document.getElementById('load-pct');
  const value = Math.round((assetsLoaded / TOTAL_ASSETS) * 100);
  if (bar) bar.style.width = value + '%';
  if (pct) pct.textContent = value + '%';
}

// Room metrics follow the background image's own resolution, so the 32×20 grid
// (and the character) stay proportional in every scene.
function applyRoomMetrics(img) {
  if (!img || !img.naturalWidth) return;
  ROOM_W = img.naturalWidth;
  ROOM_H = img.naturalHeight;
  CELL_W = ROOM_W / COLS;
  CELL_H = ROOM_H / ROWS;
  ROOM_FIT = Math.min(STAGE_W / ROOM_W, STAGE_H / ROOM_H) * (scene.fitScale || 1);
  // Keep on-screen speed / character size identical across scenes: room-space
  // values are divided by how much the room itself is scaled down.
  PLAYER_SPEED = (SPEED_RATIO * STAGE_H) / ROOM_FIT;
  CHAR_H = (CHAR_RATIO * STAGE_H) / ROOM_FIT;
  BOB_AMP = ((3 / 1059) * STAGE_H) / ROOM_FIT;
  resize();
}

function placeAtSpawn() {
  player.x = (scene.spawn.col + 0.5) * CELL_W;
  player.y = (scene.spawn.row + 0.5) * CELL_H;
}

// Scenes reachable from a given scene (direct goto or via a dialogue choice).
function neighborScenes(name) {
  const out = new Set();
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (typeof node.goto === 'string' && SCENES[node.goto]) out.add(node.goto);
    Object.values(node).forEach(walk);
  };
  walk((SCENES[name] || {}).interacts || []);
  out.delete(name);
  return [...out];
}

// Every background is preloaded up front, so this is just a safety net for
// scenes added at runtime.
function preloadNeighbors(name) {
  neighborScenes(name).forEach(n => {
    if (backgrounds[n]) return;
    loadImageSilent('bg:' + n, SCENES[n].background);
  });
}

function loadImageSilent(key, src) {
  const img = new Image();
  img.src = src;
  sprites[key] = img;
  if (key.startsWith('bg:')) backgrounds[key.slice(3)] = img;
  return img;
}

// ── Kick off the blocking preload of every asset ───────────
const ASSET_MANIFEST = buildManifest();
TOTAL_ASSETS = Object.keys(ASSET_MANIFEST).length;
updateLoadProgress();
Object.entries(ASSET_MANIFEST).forEach(([key, src]) => loadImage(key, src));
sprites.room = backgrounds[CURRENT_SCENE];


// ═══════════════════════════════════════════════════════════
//  RESIZE
// ═══════════════════════════════════════════════════════════
function resize() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;

  // The stage (scene-1 sized box) is what fills the canvas.
  const stageScale = Math.min(canvas.width / STAGE_W, canvas.height / STAGE_H);
  stageW = STAGE_W * stageScale;
  stageH = STAGE_H * stageScale;
  stageLeft = (canvas.width  - stageW) / 2;
  stageTop  = (canvas.height - stageH) / 2;

  // The current room is fitted inside the stage, preserving its aspect ratio.
  scale = stageScale * ROOM_FIT;
  offsetX = (canvas.width  - ROOM_W * scale) / 2;
  offsetY = (canvas.height - ROOM_H * scale) / 2;

  positionSceneControls();
  positionComputer();
  positionObjective();
  if (dialogOpen) positionDialog();
}

// ── Objective HUD ─────────────────────────────────────────
const objectiveEl     = document.getElementById('objective');
const objectiveTextEl = document.getElementById('objective-text');

function positionObjective() {
  if (!objectiveEl) return;
  const margin = Math.max(10, stageW * 0.025);
  objectiveEl.style.left = (stageLeft + margin) + 'px';
  objectiveEl.style.top  = (stageTop + margin) + 'px';
  const fs = Math.max(11, Math.min(20, stageW * 0.019));
  objectiveEl.style.fontSize = fs + 'px';
  objectiveEl.style.maxWidth = (stageW * 0.42) + 'px';
}

function setObjective(text) {
  if (!objectiveEl) return;
  if (!text) { objectiveEl.classList.remove('show'); return; }
  objectiveTextEl.textContent = text;
  objectiveEl.classList.add('show');
  positionObjective();
}


function positionSceneControls() {
  // Fixed to the bottom-right corner via CSS; nothing to compute.
}
window.addEventListener('resize', resize);
resize();

// ═══════════════════════════════════════════════════════════
//  INPUT — DEV CELL SELECTOR
// ═══════════════════════════════════════════════════════════
const selectCellsInput = document.getElementById('select-cells');
const gridOutputs = document.getElementById('grid-outputs');
const gridOutputsList = document.getElementById('grid-outputs-list');
const gridOutputCount = document.getElementById('grid-output-count');

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roomPointFromEvent(event) {
  return {
    x: clamp((event.clientX - offsetX) / scale, 0, ROOM_W - 0.001),
    y: clamp((event.clientY - offsetY) / scale, 0, ROOM_H - 0.001),
  };
}

function cellFromRoomPoint(point) {
  return {
    col: clamp(Math.floor(point.x / CELL_W), 0, COLS - 1),
    row: clamp(Math.floor(point.y / CELL_H), 0, ROWS - 1),
  };
}

function isCellWalkable(col, row) {
  return WALKABLE.has(`${col},${row}`) && !OCCUPIED.has(`${col},${row}`);
}

function isWalkableAt(x, y) {
  return isCellWalkable(Math.floor(x / CELL_W), Math.floor(y / CELL_H));
}

function updateGridOutputs() {
  gridOutputs.classList.toggle('visible', selectMode);
  gridOutputCount.textContent = `(${selectedCells.size})`;
  gridOutputsList.innerHTML = '';

  if (selectedCells.size === 0) {
    gridOutputsList.innerHTML = '<span id="grid-outputs-empty">No cells selected</span>';
  } else {
    [...selectedCells]
      .sort((a, b) => {
        const [aCol, aRow] = a.split(',').map(Number);
        const [bCol, bRow] = b.split(',').map(Number);
        return aRow - bRow || aCol - bCol;
      })
      .forEach(key => {
        const [col, row] = key.split(',');
        const output = document.createElement('span');
        output.className = 'grid-output';
        output.textContent = `C${col}R${row}`;
        gridOutputsList.appendChild(output);
      });
  }

  
}


function updateCellSelection(endPoint) {
  const startCell = cellFromRoomPoint(selectionStart);
  const endCell = cellFromRoomPoint(endPoint);
  const minCol = Math.min(startCell.col, endCell.col);
  const maxCol = Math.max(startCell.col, endCell.col);
  const minRow = Math.min(startCell.row, endCell.row);
  const maxRow = Math.max(startCell.row, endCell.row);

  selectedCells.clear();
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      selectedCells.add(`${col},${row}`);
    }
  }
  updateGridOutputs();
}

selectCellsInput.addEventListener('change', () => {
  selectMode = selectCellsInput.checked;
  canvas.classList.toggle('cell-selecting', selectMode);
  if (!selectMode) {
    selectingCells = false;
    selectionStart = null;
  }
  updateGridOutputs();
});

canvas.addEventListener('pointerdown', event => {
  if (!selectMode || event.button !== 0) return;
  event.preventDefault();
  selectingCells = true;
  selectionStart = roomPointFromEvent(event);
  canvas.setPointerCapture(event.pointerId);
  updateCellSelection(selectionStart);
});

canvas.addEventListener('pointermove', event => {
  if (!selectMode || !selectingCells) return;
  event.preventDefault();
  updateCellSelection(roomPointFromEvent(event));
});

function finishCellSelection(event) {
  if (!selectingCells) return;
  event.preventDefault();
  selectingCells = false;
  selectionStart = null;
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
}

canvas.addEventListener('pointerup', finishCellSelection);
canvas.addEventListener('pointercancel', finishCellSelection);

// ═══════════════════════════════════════════════════════════
//  INPUT — KEYBOARD
// ═══════════════════════════════════════════════════════════
function isMenuOpen() {
  const ov = document.getElementById('slots-overlay');
  const mm = document.getElementById('main-menu');
  const sn = document.getElementById('save-name-overlay');
  return !!((ov && ov.classList.contains('open')) || (mm && mm.classList.contains('open')) || (sn && sn.classList.contains('open')));
}
window.addEventListener('keydown', e => {
  if (e.repeat) return;
  if (isMenuOpen()) return;
  if (computerOpen) {
    if (e.code === 'Escape' || e.code === 'KeyE' || e.code === 'Space') closeComputer();
    return;
  }
  // While a choice prompt is open, arrows move the cursor instead of the player
  if (dialogOpen && choiceOptions) {
    switch (e.code) {
      case 'ArrowLeft': case 'KeyA': case 'ArrowUp':   case 'KeyW': moveChoice(-1); return;
      case 'ArrowRight': case 'KeyD': case 'ArrowDown': case 'KeyS': moveChoice(1); return;
      case 'KeyE': case 'Space': case 'Enter': pickChoice(); return;
    }
    return;
  }
  switch (e.code) {
    case 'ArrowUp':    case 'KeyW': keys.up    = true; break;
    case 'ArrowDown':  case 'KeyS': keys.down  = true; break;
    case 'ArrowLeft':  case 'KeyA': keys.left  = true; break;
    case 'ArrowRight': case 'KeyD': keys.right = true; break;
    case 'KeyE': case 'Space':
      if (dialogOpen) advanceDialog();
      else tryInteract();
      break;
  }
});
window.addEventListener('keyup', e => {
  switch (e.code) {
    case 'ArrowUp':    case 'KeyW': keys.up    = false; break;
    case 'ArrowDown':  case 'KeyS': keys.down  = false; break;
    case 'ArrowLeft':  case 'KeyA': keys.left  = false; break;
    case 'ArrowRight': case 'KeyD': keys.right = false; break;
  }
});

// ═══════════════════════════════════════════════════════════
//  INPUT — MOBILE D-PAD
// ═══════════════════════════════════════════════════════════
function isMobile() {
  return ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
}

function setupDpad() {
  if (!isMobile()) return;
  document.getElementById('dpad').style.display = 'block';
  document.getElementById('btn-e').style.display = 'flex';

  const map = {
    'dpad-up':    'up',
    'dpad-down':  'down',
    'dpad-left':  'left',
    'dpad-right': 'right',
  };

  Object.entries(map).forEach(([id, dir]) => {
    const btn = document.getElementById(id);
    btn.addEventListener('touchstart', e => { e.preventDefault(); keys[dir] = true;  btn.classList.add('pressed'); },    { passive: false });
    btn.addEventListener('touchend',   e => { e.preventDefault(); keys[dir] = false; btn.classList.remove('pressed'); }, { passive: false });
    btn.addEventListener('touchcancel',e => { e.preventDefault(); keys[dir] = false; btn.classList.remove('pressed'); }, { passive: false });
  });

  const btnE = document.getElementById('btn-e');
  btnE.addEventListener('touchstart', e => { e.preventDefault(); if (dialogOpen) advanceDialog(); else tryInteract(); }, { passive: false });
}

// ═══════════════════════════════════════════════════════════
//  INTERACTION
// ═══════════════════════════════════════════════════════════
function getPlayerCell() {
  const col = Math.floor(player.x / CELL_W);
  const row = Math.floor(player.y / CELL_H);
  return { col: Math.max(0, Math.min(COLS-1, col)), row: Math.max(0, Math.min(ROWS-1, row)) };
}


function tryInteract() {
  const { col, row } = getPlayerCell();
  if (!activeInteract) return;
  if (autoWalk || cutscene || scriptWalk) return;
  if (activeInteract.goto) { changeScene(activeInteract.goto, activeInteract.at); return; }
  // Walk the player down to the bottom of their cell so they line up
  // with NPC sprites (which are anchored at their cell's base).
  const targetY = (row + 1) * CELL_H;
  if (Math.abs(targetY - player.y) > 1) {
    keys.up = keys.down = keys.left = keys.right = false;
    autoWalk = { y: targetY, interact: activeInteract };
    return;
  }
  runInteract(activeInteract);
}


function runInteract(it) {
  if (!it) return;
  if (it.script) {
    if (it.seen && it.once) return;
    it.seen = true;
    runScript(it.script);
    return;
  }
  openDialog(it);
}

// ── Scene switching ───────────────────────────────────────
let sceneTransitioning = false;
const fadeEl = document.getElementById('scene-fade');

function parseCell(str) {
  const m = /C(\d+)R(\d+)/.exec(String(str || ''));
  return m ? { col: +m[1], row: +m[2] } : null;
}

function changeScene(name, at) {
  if (sceneTransitioning) return;
  if (!SCENES[name]) return;
  sceneTransitioning = true;
  closeDialog();
  keys.up = keys.down = keys.left = keys.right = false;
  if (fadeEl) fadeEl.classList.add('active');
  setTimeout(() => {
    applyScene(name, at);
    if (fadeEl) fadeEl.classList.remove('active');
    setTimeout(() => { sceneTransitioning = false; }, 260);
  }, 270);
}

function applyScene(name, at, options) {
  const next = SCENES[name];
  if (!next) return;
  const suppressAutosave = !!(options && options.suppressAutosave);
  closeDialog({ suppressEnd: true });
  CURRENT_SCENE = name;
  scene = next;
  WALKABLE = parseCells(scene.walkable);
  OCCUPIED = parseOccupied(scene);
  INTERACTS = buildInteracts(scene);
  activeInteract = null;
  autoWalk = null;
  cancelActiveScript();
  ACTORS.length = 0;
  player.dir = 'idle';
  player.moving = false;
  player.bobTime = 0;
  keys.up = keys.down = keys.left = keys.right = false;
  if (!backgrounds[name]) loadImageSilent('bg:' + name, scene.background);
  sprites.room = backgrounds[name];
  applyRoomMetrics(sprites.room);
  preloadNeighbors(name);
  if (!suppressAutosave && typeof autosave === 'function') autosave();
  const cell = parseCell(at) || scene.spawn;
  player.x = (cell.col + 0.5) * CELL_W;
  player.y = (cell.row + 0.5) * CELL_H;
  updateDevLabel();
}

// ── RPGMaker-style dialogue window ────────────────────────
const dialogEl     = document.getElementById('dialog');
const dialogNameEl = document.getElementById('dialog-name');
const dialogTextEl = document.getElementById('dialog-text');

const TYPE_SPEED = 28; // characters per second-ish (ms per char below)
const MS_PER_CHAR = 1000 / TYPE_SPEED * 0.55;

let dialogQueue = [];
let dialogIndex = 0;
let dialogTyping = false;
let typeTimer = null;
let currentSpeaker = null;
let currentDialogKey = null;
let dialogOnEnd = null;

function cloneSavable(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (err) {
    return null;
  }
}

function captureDialogState() {
  if (!dialogOpen || !dialogQueue.length) return null;
  const resume = activeScript
    ? { type: 'script', steps: cloneSavable(activeScript.steps), index: activeScript.index }
    : null;
  return {
    open: true,
    queue: cloneSavable(dialogQueue),
    index: dialogIndex,
    key: currentDialogKey,
    speaker: currentSpeaker,
    hasChoices: !!choiceOptions,
    choiceIndex: choiceIndex,
    resume: resume && resume.steps ? resume : null,
  };
}

function makeDialogResumeHandler(resume) {
  if (!resume || resume.type !== 'script') return null;
  return function () { resumeScriptFromSnapshot(resume); };
}

function restoreDialogState(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.queue) || !snapshot.queue.length) return false;
  closeDialog({ suppressEnd: true });
  activeScript = null;
  dialogOnEnd = makeDialogResumeHandler(snapshot.resume);
  cutscene = !!dialogOnEnd;
  currentDialogKey = snapshot.key || null;
  dialogQueue = snapshot.queue;
  dialogIndex = Math.max(0, Math.min(dialogQueue.length - 1, Number(snapshot.index) || 0));
  currentSpeaker = snapshot.speaker || null;
  resetPortraits();
  dialogOpen = true;
  dialogEl.classList.add('open');
  showDialogPageInstant(dialogIndex, snapshot.hasChoices ? snapshot.choiceIndex : 0);
  return true;
}

function positionDialog() {
  // Anchor the window inside the stage (same box in every scene) so it reads
  // as part of the game canvas, like an RPGMaker message window.
  const roomLeft   = stageLeft;
  const roomTop    = stageTop;
  const roomWidth  = stageW;
  const roomHeight = stageH;
  const margin     = Math.max(10, roomWidth * 0.025);
  const hasChoices = dialogEl.classList.contains('has-choices');
  const dialogH    = Math.max(120, roomHeight * 0.19);

  dialogEl.style.left   = (roomLeft + margin) + 'px';
  dialogEl.style.width  = (roomWidth - margin * 2) + 'px';
  // Anchor from the bottom so a taller (choice) window grows upward instead of
  // spilling out of the stage.
  dialogEl.style.top    = 'auto';
  dialogEl.style.bottom = (window.innerHeight - (roomTop + roomHeight) + margin) + 'px';
  dialogEl.style.height = hasChoices ? 'auto' : dialogH + 'px';
  dialogEl.style.minHeight = hasChoices ? dialogH + 'px' : '';
  dialogEl.style.maxHeight = (roomHeight - margin * 2) + 'px';

  // Scale typography with the room so it fills the dialogue container.
  const fs = Math.max(16, Math.min(34, roomWidth * 0.040));
  dialogTextEl.style.fontSize = fs + 'px';
  dialogNameEl.style.fontSize = Math.max(14, fs * 0.55) + 'px';
  dialogEl.querySelectorAll('.dialog-choice').forEach(function (b) {
    b.style.fontSize = Math.max(13, fs * 0.62) + 'px';
  });
}

function renderSpeaker(key) {
  const char = CHARACTERS[key];
  if (char && !char.hide_name) {
    dialogEl.classList.add('has-name');
    dialogNameEl.textContent = char.name;
    dialogNameEl.style.color = char.dialogue_color;
    dialogTextEl.style.color = char.dialogue_color;
  } else {
    dialogEl.classList.remove('has-name');
    dialogNameEl.textContent = '';
    dialogTextEl.style.color = (char && char.dialogue_color) || '#f2f4ff';
  }
}

// ── Dialogue portraits: July on the left, June on the right ──
const PORTRAIT_SIDE = { july: 'left', june: 'right' };
const portraitEls = {
  left:  document.getElementById('portrait-left'),
  right: document.getElementById('portrait-right'),
};
let portraitState = { left: null, right: null };

function resetPortraits() {
  portraitState = { left: null, right: null };
  Object.values(portraitEls).forEach(el => {
    if (!el) return;
    el.classList.remove('show', 'dim');
    el.removeAttribute('src');
  });
}

function renderPortrait(speaker, sprite) {
  const side = PORTRAIT_SIDE[speaker];
  if (side && sprite) {
    const el = portraitEls[side];
    if (el) {
      if (portraitState[side] !== sprite) {
        el.src = 'sprites/' + sprite + '.png';
        portraitState[side] = sprite;
      }
      el.classList.add('show');
    }
  }
  // Highlight the active speaker, dim the other one.
  ['left', 'right'].forEach(s => {
    const el = portraitEls[s];
    if (!el || !portraitState[s]) return;
    el.classList.toggle('dim', s !== side);
  });
}

function typeLine(text, onDone) {
  clearTimeout(typeTimer);
  dialogTyping = true;
  dialogEl.classList.remove('ready');
  dialogTextEl.textContent = '';
  let i = 0;
  const step = () => {
    if (i >= text.length) {
      dialogTyping = false;
      dialogEl.classList.add('ready');
      if (onDone) onDone();
      return;
    }
    dialogTextEl.textContent += text[i++];
    typeTimer = setTimeout(step, MS_PER_CHAR);
  };
  step();
}

// ── Choice prompts (Yes / No) ─────────────────────────────
const dialogChoicesEl = document.getElementById('dialog-choices');
let choiceOptions = null;
let choiceIndex = 0;

function showChoices(options) {
  choiceOptions = options;
  choiceIndex = 0;
  dialogChoicesEl.innerHTML = '';
  options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dialog-choice' + (i === 0 ? ' selected' : '');
    btn.textContent = opt.label;
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      e.stopPropagation();
      choiceIndex = i;
      pickChoice();
    });
    dialogChoicesEl.appendChild(btn);
  });
  dialogEl.classList.add('has-choices');
  highlightChoice();
  positionDialog();
}

function highlightChoice() {
  Array.from(dialogChoicesEl.children).forEach((el, i) => {
    el.classList.toggle('selected', i === choiceIndex);
  });
}

function moveChoice(delta) {
  if (!choiceOptions) return;
  choiceIndex = (choiceIndex + delta + choiceOptions.length) % choiceOptions.length;
  highlightChoice();
}

function pickChoice() {
  if (!choiceOptions) return;
  const opt = choiceOptions[choiceIndex];
  if (opt) CHOICES[(currentDialogKey || 'dialog') + '#' + dialogIndex] = opt.label;
  if (opt && opt.flags) Object.assign(FLAGS, opt.flags);
  const cb = dialogOnEnd;
  dialogOnEnd = null;
  clearChoices();
  closeDialog();
  if (opt && opt.action === 'computer') { if (cb) cb(); openComputer(); }
  else if (opt && opt.goto) { if (cb) cb(); changeScene(opt.goto, opt.at); }
  else if (opt && opt.lines && opt.lines.length) openDialog({ lines: opt.lines }, cb);
  else if (cb) cb();
}


// ── Computer screen view ──────────────────────────────────
var computerViewEl = document.getElementById('computer-view');
var computerExitEl = document.getElementById('computer-exit');
var computerOpen = false;

function positionComputer() {
  var computerViewEl = document.getElementById('computer-view');
  if (!computerViewEl) return;
  computerViewEl.style.left   = stageLeft + 'px';
  computerViewEl.style.top    = stageTop + 'px';
  computerViewEl.style.width  = stageW + 'px';
  computerViewEl.style.height = stageH + 'px';
}

function openComputer() {
  closeDialog();
  keys.up = keys.down = keys.left = keys.right = false;
  player.dir = 'idle';
  player.moving = false;
  computerOpen = true;
  positionComputer();
  computerViewEl.classList.add('open');
}

function closeComputer() {
  computerOpen = false;
  computerViewEl.classList.remove('open');
}

if (computerExitEl) {
  computerExitEl.addEventListener('pointerdown', e => {
    e.preventDefault();
    e.stopPropagation();
    closeComputer();
  });
}

function clearChoices() {
  choiceOptions = null;
  choiceIndex = 0;
  dialogChoicesEl.innerHTML = '';
  dialogEl.classList.remove('has-choices');
}

function showDialogPage(index) {
  const page = dialogQueue[index];
  if (!page) { closeDialog(); return; }
  if (page.speaker) currentSpeaker = page.speaker;
  renderSpeaker(currentSpeaker);
  renderPortrait(currentSpeaker, page.sprite);
  positionDialog();
  clearChoices();
  if (page.objective) setObjective(page.objective);
  if (page.completeObjective) { setObjective(''); FLAGS.objective_1 = true; }
  typeLine(page.text || '', () => {
    if (page.choices && page.choices.length) showChoices(page.choices);
  });
}

function showDialogPageInstant(index, savedChoiceIndex) {
  const page = dialogQueue[index];
  if (!page) { closeDialog(); return; }
  clearTimeout(typeTimer);
  dialogTyping = false;
  if (page.speaker) currentSpeaker = page.speaker;
  renderSpeaker(currentSpeaker);
  renderPortrait(currentSpeaker, page.sprite);
  positionDialog();
  clearChoices();
  if (page.objective) setObjective(page.objective);
  if (page.completeObjective) { setObjective(''); FLAGS.objective_1 = true; }
  dialogTextEl.textContent = page.text || '';
  dialogEl.classList.add('ready');
  if (page.choices && page.choices.length) {
    showChoices(page.choices);
    if (typeof savedChoiceIndex === 'number') {
      choiceIndex = Math.max(0, Math.min(page.choices.length - 1, savedChoiceIndex));
      highlightChoice();
    }
  }
}

function openDialog(data, onEnd) {
  if (!data) { if (onEnd) onEnd(); return; }
  dialogOnEnd = onEnd || null;
  const useRepeat = data.seen && data.repeatLines && data.repeatLines.length;
  const lines = useRepeat ? data.repeatLines : (data.lines || []);
  if (!lines.length) { const cb = dialogOnEnd; dialogOnEnd = null; if (cb) cb(); return; }
  data.seen = true;
  currentDialogKey = data.key || null;
  dialogQueue = lines;

  dialogIndex = 0;
  currentSpeaker = null;
  resetPortraits();
  dialogOpen = true;
  dialogEl.classList.add('open');
  showDialogPage(0);
}

// E / Space / click: finish typing, then advance, then close.
function advanceDialog() {
  if (!dialogOpen) return;
  const page = dialogQueue[dialogIndex];
  if (dialogTyping) {
    clearTimeout(typeTimer);
    dialogTyping = false;
    dialogTextEl.textContent = (page && page.text) || '';
    dialogEl.classList.add('ready');
    if (page && page.choices && page.choices.length) showChoices(page.choices);
    return;
  }
  if (choiceOptions) { pickChoice(); return; }
  dialogIndex++;
  if (dialogIndex >= dialogQueue.length) closeDialog();
  else showDialogPage(dialogIndex);
}

function closeDialog(options) {
  const suppressEnd = options === true || !!(options && options.suppressEnd);
  const endCb = dialogOnEnd;
  dialogOnEnd = null;
  clearTimeout(typeTimer);
  dialogTyping = false;
  dialogOpen = false;
  dialogQueue = [];
  dialogIndex = 0;
  currentSpeaker = null;
  clearChoices();
  resetPortraits();
  dialogEl.classList.remove('open', 'ready', 'has-name');
  if (!suppressEnd && endCb) endCb();
  if (!suppressEnd && typeof autosave === 'function') autosave();
}

dialogEl.addEventListener('pointerdown', e => { e.preventDefault(); advanceDialog(); });

// ═══════════════════════════════════════════════════════════
//  UPDATE
// ═══════════════════════════════════════════════════════════
function update(dt) {
  updateActors(dt);

  // Scripted player movement during a cutscene
  if (scriptWalk) {
    const dx = scriptWalk.x - player.x;
    const dy = scriptWalk.y - player.y;
    const d = Math.hypot(dx, dy);
    const step = PLAYER_SPEED * dt;
    if (d <= step) {
      player.x = scriptWalk.x;
      player.y = scriptWalk.y;
      player.moving = false;
      player.dir = 'idle';
      player.bobTime = 0;
      const cb = scriptWalk.done;
      scriptWalk = null;
      if (cb) cb();
    } else {
      player.x += (dx / d) * step;
      player.y += (dy / d) * step;
      player.moving = true;
      player.bobTime += dt;
      player.dir = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'idle');
    }
    updateInteractHint();
    return;
  }
  if (cutscene) { player.moving = false; updateInteractHint(); return; }

  // Auto-walk into alignment before an interaction dialog opens
  if (autoWalk) {
    const diff = autoWalk.y - player.y;
    const step = PLAYER_SPEED * dt;
    if (Math.abs(diff) <= step) {
      player.y = autoWalk.y;
      player.moving = false;
      player.dir = 'idle';
      player.bobTime = 0;
      const pending = autoWalk.interact;
      autoWalk = null;
      if (pending) runInteract(pending);
      return;
    }
    player.y += Math.sign(diff) * step;
    player.moving = true;
    player.bobTime += dt;
    player.dir = diff < 0 ? 'up' : 'idle';
    return;
  }
  if (dialogOpen) return;
  if (slotsOverlay.classList.contains('open')) return;

  let dx = 0, dy = 0;
  if (keys.left)  dx -= 1;
  if (keys.right) dx += 1;
  if (keys.up)    dy -= 1;
  if (keys.down)  dy += 1;

  // Normalise diagonal
  if (dx !== 0 && dy !== 0) { dx *= 0.7071; dy *= 0.7071; }

  const moving = dx !== 0 || dy !== 0;


  if (moving) {
    let nextX = player.x;
    let nextY = player.y;

    if (dx !== 0) {
      const tryX = player.x + dx * PLAYER_SPEED * dt;
      if (isWalkableAt(tryX, player.y)) nextX = tryX;
    }
    if (dy !== 0) {
      const tryY = player.y + dy * PLAYER_SPEED * dt;
      if (isWalkableAt(nextX, tryY)) nextY = tryY;
    }

    player.x = nextX;
    player.y = nextY;
    player.bobTime += dt;

    // Direction — prefer horizontal
    if (Math.abs(dx) >= Math.abs(dy)) {
      player.dir = dx < 0 ? 'left' : 'right';
    } else {
      player.dir = dy < 0 ? 'up' : 'idle';  // 'idle' = facing down/toward camera
    }
  } else {
    player.dir = 'idle';
    player.bobTime = 0;
  }
  player.moving = moving;

  // Clamp to room bounds
  player.x = Math.max(CHAR_H * 0.3, Math.min(ROOM_W - CHAR_H * 0.3, player.x));
  player.y = Math.max(CHAR_H * 0.2, Math.min(ROOM_H - CHAR_H * 0.1, player.y));

  // Update interact hint
  updateInteractHint();
}

function updateDevLabel() {
  const { col, row } = getPlayerCell();
  document.getElementById('scene-name').textContent = CURRENT_SCENE;
  document.getElementById('cell-pos').textContent = `C${col}R${row}`;
}

function updateInteractHint() {
  const { col, row } = getPlayerCell();

  // Update dev label with current scene and cell position
  updateDevLabel();

  activeInteract = INTERACTS.find(it => it.cells.has(`${col},${row}`)) || null;

  const hint = document.getElementById('interact-hint');
  if (activeInteract && !cutscene && !scriptWalk && !dialogOpen) {
    // Position hint above player in screen coords
    const sx = offsetX + player.x * scale;
    const sy = offsetY + player.y * scale;
    hint.style.left = sx + 'px';
    hint.style.top  = (sy - CHAR_H * scale * 0.8) + 'px';
    hint.style.display = 'block';
  } else {
    hint.style.display = 'none';
  }
}

// ═══════════════════════════════════════════════════════════
//  RENDER
// ═══════════════════════════════════════════════════════════
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  // ── Background room ── room space matches the image's own resolution
  ctx.imageSmoothingEnabled = false;
  if (sprites.room && sprites.room.complete && sprites.room.naturalWidth > 0) {
    ctx.drawImage(sprites.room, 0, 0, ROOM_W, ROOM_H);
  } else {
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, ROOM_W, ROOM_H);
  }

  // ── Dev grid overlay ──
  if (DEV_MODE || selectMode) drawGrid();

  // ── Player ──
  drawProps();
  drawPlayer();

  // ── Interact icon ──
  drawInteractIcon();

  ctx.restore();
}

function drawInteractIcon() {
  if (!activeInteract || dialogOpen) return;
  const img = sprites.interact;
  if (!img || !img.complete || img.naturalWidth === 0) return;

  const size = Math.min(CELL_W, CELL_H) * 0.8;
  const cx = (activeInteract.iconCol + 0.5) * CELL_W;
  const cy = (activeInteract.iconRow + 0.5) * CELL_H;
  ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
}

function drawGrid() {
  ctx.save();

  // Very subtle fill per cell (checkerboard-ish)
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const x = col * CELL_W;
      const y = row * CELL_H;
      const key = `${col},${row}`;

      // Dev-selected cells
      if (selectedCells.has(key)) {
        ctx.fillStyle = 'rgba(70, 205, 255, 0.28)';
        ctx.fillRect(x, y, CELL_W, CELL_H);
      }

    }
  }

  // Grid lines — dashed, very subtle
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 8]);

  // Vertical lines
  for (let col = 0; col <= COLS; col++) {
    const x = col * CELL_W;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, ROOM_H);
    ctx.stroke();
  }

  // Horizontal lines
  for (let row = 0; row <= ROWS; row++) {
    const y = row * CELL_H;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(ROOM_W, y);
    ctx.stroke();
  }

  ctx.setLineDash([]);

  // Strong outline around selected cells so they remain visible over room art.
  if (selectedCells.size > 0) {
    ctx.strokeStyle = 'rgba(105,225,255,0.95)';
    ctx.lineWidth = 3;
    selectedCells.forEach(key => {
      const [col, row] = key.split(',').map(Number);
      ctx.strokeRect(col * CELL_W + 2, row * CELL_H + 2, CELL_W - 4, CELL_H - 4);
    });
  }

  ctx.restore();
}

// Static scene props (characters/objects placed on a cell).
function drawProps() {
  if (computerOpen) return;
  (scene.props || []).forEach(prop => {
    const img = sprites[prop.sprite];
    if (!img || !img.complete || img.naturalWidth === 0) return;
    const m = /^C(\d+)R(\d+)$/.exec(prop.cell || '');
    if (!m) return;
    const col = +m[1], row = +m[2];
    const h = CHAR_H * (prop.scale || 1);
    const w = (img.naturalWidth / img.naturalHeight) * h;
    const x = (col + 0.5) * CELL_W;
    const y = (row + 1) * CELL_H;
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(x, y + 2, w * 0.38, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.drawImage(img, x - w / 2, y - h, w, h);
  });

  ACTORS.forEach(a => {
    const key = (a.facing && sprites[a.facing]) ? a.facing : a.sprite;
    const img = sprites[key];
    if (!img || !img.complete || img.naturalWidth === 0) return;
    const h = CHAR_H * (a.scale || 1);
    const w = (img.naturalWidth / img.naturalHeight) * h;
    // Walk bob (same feel as the player) while the actor is moving in a cutscene
    const bobY = a.moving
      ? Math.sin((a.bobTime || 0) * BOB_FREQ * Math.PI * 2) * BOB_AMP * (a.scale || 1)
      : 0;
    const topY = a.y - h + bobY;
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(a.x, a.y + 2, w * 0.38, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (a.flip) {
      ctx.save();
      ctx.translate(a.x, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, -w / 2, topY, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(img, a.x - w / 2, topY, w, h);
    }
  });
}

function drawPlayer() {
  if (computerOpen) return;
  const sprKey = player.dir;
  const img = sprites[sprKey];
  if (!img || !img.complete || img.naturalWidth === 0) return;

  // Aspect-correct size
  const charH = CHAR_H;
  const charW = (img.naturalWidth / img.naturalHeight) * charH;

  // Bob offset while moving
  const bobY = player.moving
    ? Math.sin(player.bobTime * BOB_FREQ * Math.PI * 2) * BOB_AMP
    : 0;

  // Draw centered on player position (feet at player.y)
  const drawX = player.x - charW / 2;
  const drawY = player.y - charH + bobY;

  // Shadow
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(player.x, player.y + 2, charW * 0.38, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Sprite
  ctx.drawImage(img, drawX, drawY, charW, charH);

  // Debug: player cell highlight
  const { col, row } = getPlayerCell();
  ctx.save();
  ctx.strokeStyle = 'rgba(100,220,255,0.5)';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(col * CELL_W + 1, row * CELL_H + 1, CELL_W - 2, CELL_H - 2);
  ctx.setLineDash([]);
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════
//  MAIN MENU
// ═══════════════════════════════════════════════════════════
const mainMenu = document.getElementById('main-menu');
const menuMain = document.getElementById('menu-main');
const settingsPanel = document.getElementById('settings-panel');

function latestSave() {
  const saves = readSaves();
  let best = readAutosave();
  Object.keys(saves).forEach(k => {
    const s = saves[k];
    if (s && (!best || (s.savedAt || 0) > (best.savedAt || 0))) best = s;
  });
  return best;
}

function setGameChromeVisible(v) {
  ['scene-controls', 'objective'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.visibility = v ? 'visible' : 'hidden';
  });
}


function openMainMenu() {
  menuMain.classList.remove('hidden');
  settingsPanel.classList.remove('open');
  const cont = document.getElementById('menu-continue');
  cont.disabled = !latestSave();
  mainMenu.classList.add('open');
  setGameChromeVisible(false);
  menuIndex = cont.disabled ? 0 : 1;
  paintMenuSelection();
}

function startPlaying() {
  mainMenu.classList.remove('open');
  setGameChromeVisible(true);
  keys.up = keys.down = keys.left = keys.right = false;
}


document.getElementById('menu-new').addEventListener('click', () => {
  SEEN.clear();
  Object.keys(CHOICES).forEach(k => delete CHOICES[k]);
  Object.keys(FLAGS).forEach(k => delete FLAGS[k]);
  ACTORS.length = 0;
  cancelActiveScript();
  if (CURRENT_SCENE !== 'scene-1') applyScene('scene-1');
  placeAtSpawn();
  player.dir = 'idle';
  player.moving = false;
  closeDialog();
  clearAutosave();
  startPlaying();
  beginAutosave();
  openDialog({ lines: INTRO_LINES });
});


document.getElementById('menu-continue').addEventListener('click', () => {
  const s = latestSave();
  if (!s) return;
  applyState(s);
  startPlaying();
  beginAutosave();
});

document.getElementById('menu-load').addEventListener('click', () => {
  openSlots('load');
});

document.getElementById('menu-settings').addEventListener('click', () => {
  menuMain.classList.add('hidden');
  settingsPanel.classList.add('open');
  menuIndex = 0;
  paintMenuSelection();
});

document.getElementById('menu-back').addEventListener('click', () => {
  settingsPanel.classList.remove('open');
  menuMain.classList.remove('hidden');
  menuIndex = 3;
  paintMenuSelection();
});

document.getElementById('set-touch').addEventListener('change', e => {
  const on = e.target.checked;
  ['dpad', 'btn-e'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = on ? 'grid' : '';
    if (el && id === 'btn-e' && on) el.style.display = 'flex';
  });
});

document.getElementById('set-hint').addEventListener('change', e => {
  const el = document.getElementById('interact-hint');
  if (el) el.style.opacity = e.target.checked ? '' : '0';
  window.HINTS_ENABLED = e.target.checked;
});


// ── menu selection (keyboard + hover) ──
function menuButtons() {
  const panel = settingsPanel.classList.contains('open') ? settingsPanel : menuMain;
  return Array.from(panel.querySelectorAll('.menu-btn'));
}
let menuIndex = 0;
function paintMenuSelection() {
  const btns = menuButtons();
  if (!btns.length) return;
  menuIndex = Math.max(0, Math.min(btns.length - 1, menuIndex));
  btns.forEach((b, i) => b.classList.toggle('selected', i === menuIndex));
}
function moveMenu(delta) {
  const btns = menuButtons();
  if (!btns.length) return;
  let i = menuIndex;
  for (let n = 0; n < btns.length; n++) {
    i = (i + delta + btns.length) % btns.length;
    if (!btns[i].disabled) break;
  }
  menuIndex = i;
  paintMenuSelection();
}
document.querySelectorAll('#main-menu .menu-btn').forEach(btn => {
  btn.addEventListener('mouseenter', () => {
    const btns = menuButtons();
    const i = btns.indexOf(btn);
    if (i >= 0 && !btn.disabled) { menuIndex = i; paintMenuSelection(); }
  });
});
window.addEventListener('keydown', e => {
  if (!mainMenu.classList.contains('open')) return;
  if (slotsOverlay.classList.contains('open')) return;
  if (e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); moveMenu(-1); }
  else if (e.code === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); moveMenu(1); }
  else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE') {
    e.preventDefault();
    const btn = menuButtons()[menuIndex];
    if (btn && !btn.disabled) btn.click();
  }
});

// ═══════════════════════════════════════════════════════════
//  GAME LOOP
// ═══════════════════════════════════════════════════════════
function loop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05); // cap at 50ms
  lastTime = timestamp;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

function startGame() {
  const base = backgrounds[CURRENT_SCENE];
  if (base && base.naturalWidth) { STAGE_W = base.naturalWidth; STAGE_H = base.naturalHeight; }
  applyRoomMetrics(sprites.room);
  placeAtSpawn();
  const overlay = document.getElementById('loading-screen');
  if (overlay) overlay.classList.add('hidden');
  openMainMenu();
  setupDpad();
  preloadNeighbors(CURRENT_SCENE);
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

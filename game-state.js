// ═══════════════════════════════════════════════════════════
//  GAME STATE — every mutable variable the playthrough tracks
//  (episode registry, current scene, past actions, choices,
//   story flags, live actors, player + input state)
//  Loaded FIRST, before any episode or engine file.
// ═══════════════════════════════════════════════════════════

// ── Episode registry ──────────────────────────────────────
// Episode files (episode-01.js, episode-02.js, ...) call registerEpisode().
const EPISODES = {};
const SCENES = {};
const CHARACTERS = {};
let INTRO_LINES = [];
let CURRENT_EPISODE = null;

function registerEpisode(ep) {
  if (!ep || !ep.id) return;
  EPISODES[ep.id] = ep;
  Object.assign(SCENES, ep.scenes || {});
  Object.assign(CHARACTERS, ep.characters || {});
  if (ep.intro) INTRO_LINES = ep.intro;
  if (!CURRENT_EPISODE) {
    CURRENT_EPISODE = ep.id;
    if (ep.startScene) CURRENT_SCENE = ep.startScene;
  }
  window.SCENES = SCENES;
  window.CHARACTERS = CHARACTERS;
  window.INTRO_LINES = INTRO_LINES;
  window.EPISODES = EPISODES;
}

// ── Where the player is ───────────────────────────────────
let CURRENT_SCENE = 'scene-1';

// ── Progress: interactions already seen and past choices ──
const SEEN = new Set();
const CHOICES = {};

// ── Story flags (choices remembered across the playthrough) ──
const FLAGS = {};
window.FLAGS = FLAGS;

// ── Dynamic actors (characters spawned/moved by cutscene scripts) ──
const ACTORS = [];

// ── Cutscene state ────────────────────────────────────────
let cutscene = false;
let scriptWalk = null;

// The interaction whose trigger cell the player is currently standing on.
let activeInteract = null;

// A queued automatic walk (used by interacts and cutscenes).
let autoWalk = null;

// ── Player + input ────────────────────────────────────────
// Real coordinates are set by placeAtSpawn() once the scene is ready.
let player = {
  x: 0,
  y: 0,
  dir: 'idle',
  moving: false,
  bobTime: 0,
};

let keys = { up: false, down: false, left: false, right: false };

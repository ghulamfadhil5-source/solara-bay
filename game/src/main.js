// Solara Bay — boot, the game loop, the camera, the screens, save/load.
// One clear job: own the frame. Everything else is a system this loop calls.

import * as THREE from 'three';
import { CFG } from './config.js';
import { G } from './state.js';
import { initInput } from './input.js';
import { initAudio, resumeAudio, updateEngine, updateSiren, playClick, playBusted } from './audio.js';
import { buildWorld, animateSea } from './world.js';
import { spawnParkedCars } from './vehicles.js';
import { spawnTraffic, updateTraffic, spawnPeds, updatePeds } from './traffic.js';
import { updatePolice, clearWanted, damagePlayer } from './police.js';
import { createPlayer, updatePlayer } from './player.js';
import { initMissions, updateMissions, tryMissionInteract } from './missions.js';
import { initHud, updateHud, showMessage, showDialogue } from './hud.js';
import { initEffects, updateEffects } from './effects.js';
import { stageShot } from './shots.js';
import { initQuality, qualityTick } from './quality.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
G.seed = Number.isInteger(seedParam) ? seedParam : 1;
G.shotMode = shot;

window.__errors = [];
window.addEventListener('error', (e) => window.__errors.push(String(e.message)));

let last = performance.now();
let accumulator = 0;
let autosaveTimer = 0;

function $(id) {
  return document.getElementById(id);
}

function showScreen(id) {
  for (const s of ['start-screen', 'pause-screen', 'busted-screen', 'gameover-screen', 'story-screen']) {
    $(s).style.display = s === id ? 'flex' : 'none';
  }
}

function hideScreens() {
  for (const s of ['start-screen', 'pause-screen', 'busted-screen', 'gameover-screen', 'story-screen']) {
    $(s).style.display = 'none';
  }
}

// --- Save / load ---
function saveGame() {
  try {
    const data = {
      money: G.money,
      missionIndex: G.missionIndex,
      missionsDone: G.missionsDone,
      storyDone: G.storyDone,
      health: G.player.health,
      pos: { x: G.player.pos.x, z: G.player.pos.z },
      timePlayed: G.timePlayed,
    };
    window.localStorage.setItem(CFG.saveKey, JSON.stringify(data));
  } catch {
    // Storage can be off: the save then lasts this visit only.
  }
}

function loadSave() {
  try {
    const raw = window.localStorage.getItem(CFG.saveKey);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function applySave(data) {
  G.money = data.money ?? CFG.startMoney;
  G.missionIndex = data.missionIndex ?? 0;
  G.missionsDone = data.missionsDone ?? [];
  G.storyDone = !!data.storyDone;
  G.timePlayed = data.timePlayed ?? 0;
  if (data.pos) {
    G.player.pos.set(data.pos.x, 0, data.pos.z);
    G.player.mesh.position.copy(G.player.pos);
  }
  if (data.health) G.player.health = data.health;
}

function hasSave() {
  return loadSave() !== null;
}

// --- Flow callbacks (wired onto G so systems can reach them) ---
function onBusted() {
  if (G.mode !== 'playing') return;
  G.mode = 'busted';
  G.wasBusted = true; // a bust never counts as losing the cops (mission 3)
  const fine = Math.min(G.money, CFG.bustFine);
  G.money -= fine;
  clearWanted();
  playBusted();
  $('busted-fine').textContent = `The Bay PD fines you $${fine} and lets you walk.`;
  showScreen('busted-screen');
}

function onKnockedOut() {
  if (G.mode !== 'playing') return;
  G.mode = 'gameover';
  const fee = Math.min(G.money, CFG.hospitalFee);
  G.money -= fee;
  clearWanted();
  playBusted();
  $('gameover-fee').textContent = `Bay Clinic patches you up for $${fee}.`;
  showScreen('gameover-screen');
}

function onStoryDone() {
  $('story-screen').style.display = 'flex';
}

function startGame(fromSave) {
  initAudio();
  resumeAudio();
  if (fromSave) {
    const data = loadSave();
    if (data) applySave(data);
  }
  hideScreens();
  G.mode = 'playing';
  playClick();
}

// --- Camera ---
const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3();

function updateCamera(dt) {
  const player = G.player;
  let dy = player.heading - G.camYaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  G.camYaw += dy * Math.min(1, dt * (player.inCar ? 3.2 : 2.2));
  const dist = player.inCar ? 11.5 : 8.5;
  const height = player.inCar ? 4.4 : 3.8;
  const fx = Math.sin(G.camYaw);
  const fz = Math.cos(G.camYaw);
  camPos.set(player.pos.x - fx * dist, height, player.pos.z - fz * dist);
  G.camera.position.lerp(camPos, Math.min(1, dt * 6));
  camTarget.set(player.pos.x + fx * 6, 1.7, player.pos.z + fz * 6);
  if (G.shake > 0) {
    camTarget.x += (Math.random() - 0.5) * G.shake * 0.7;
    camTarget.y += (Math.random() - 0.5) * G.shake * 0.5;
    G.shake = Math.max(0, G.shake - dt * 2.2);
  }
  G.camera.lookAt(camTarget);
  const speed = player.inCar ? Math.abs(player.car.speed) : Math.abs(player.speed);
  const targetFov = 62 + Math.min(14, speed * 0.45);
  if (Math.abs(G.camera.fov - targetFov) > 0.1) {
    G.camera.fov += (targetFov - G.camera.fov) * Math.min(1, dt * 3);
    G.camera.updateProjectionMatrix();
  }
}

// --- Boot ---
function boot() {
  const lowFx = params.get('fx') === 'low';
  const renderer = new THREE.WebGLRenderer({ antialias: !lowFx });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = !lowFx;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('app').appendChild(renderer.domElement);
  G.renderer = renderer;
  G.scene = new THREE.Scene();
  G.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 600);
  G.camera.position.set(0, 6, -12);
  G.clock = new THREE.Clock();

  window.addEventListener('resize', () => {
    G.camera.aspect = window.innerWidth / window.innerHeight;
    G.camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  buildWorld();
  spawnParkedCars();
  spawnTraffic();
  spawnPeds();
  initQuality(lowFx);
  initEffects();
  initMissions();
  createPlayer(12, 2);
  initHud();
  initInput();
  initAudio();

  // Wire the cross-system hooks.
  G.hudMessage = showMessage;
  G.showDialogue = showDialogue;
  G.saveGame = saveGame;
  G.damagePlayer = damagePlayer;
  G.onBusted = onBusted;
  G.onKnockedOut = onKnockedOut;
  G.onStoryDone = onStoryDone;
  G.tryMissionInteract = tryMissionInteract;

  // Buttons.
  $('start-btn').addEventListener('click', () => startGame(false));
  $('continue-btn').addEventListener('click', () => startGame(true));
  $('resume-btn').addEventListener('click', () => {
    hideScreens();
    G.mode = 'playing';
    playClick();
  });
  $('busted-btn').addEventListener('click', () => {
    G.player.pos.set(12, 0, 2);
    G.player.mesh.position.copy(G.player.pos);
    G.player.health = CFG.playerHealth;
    if (G.player.inCar) {
      G.player.inCar = false;
      G.player.car = null;
      G.player.mesh.visible = true;
    }
    hideScreens();
    G.mode = 'playing';
    playClick();
  });
  $('gameover-btn').addEventListener('click', () => {
    G.player.pos.set(-36, 0, 28);
    G.player.mesh.position.copy(G.player.pos);
    G.player.health = CFG.playerHealth;
    if (G.player.inCar) {
      G.player.inCar = false;
      G.player.car = null;
      G.player.mesh.visible = true;
    }
    hideScreens();
    G.mode = 'playing';
    playClick();
  });
  $('story-btn').addEventListener('click', () => {
    $('story-screen').style.display = 'none';
    playClick();
  });
  $('save-btn').addEventListener('click', () => {
    saveGame();
    showMessage('Game saved.');
    playClick();
  });
  $('menu-btn').addEventListener('click', () => {
    saveGame();
    G.mode = 'menu';
    showScreen('start-screen');
    $('continue-btn').style.display = hasSave() ? 'inline-block' : 'none';
    playClick();
  });
  $('continue-btn').style.display = hasSave() ? 'inline-block' : 'none';

  // Pause when the tab hides mid-game.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && G.mode === 'playing') {
      G.mode = 'paused';
      showScreen('pause-screen');
    }
  });

  if (shot) {
    stageShot(shot);
    G.mode = 'playing';
    hideScreens();
    // Let a few frames settle, then flag readiness for the screenshot driver.
    let frames = 0;
    const settle = () => {
      frames++;
      if (frames >= 3) {
        window.__shotReady = true;
        window.__solaraReady = true;
        return;
      }
      requestAnimationFrame(settle);
    };
    requestAnimationFrame(settle);
  } else {
    showScreen('start-screen');
  }

  // Debug handle for play-tests: real state, real functions.
  window.SOLARA = {
    G,
    startGame,
    saveGame,
    loadSave,
    version: 'solara-bay-1.0',
  };

  G.ready = true;
  window.__solaraReady = true;
  requestAnimationFrame(frame);
}

function step(dt) {
  G.time += dt;
  G.timePlayed += dt;
  if (G.shotMode) {
    // Screenshot staging: hold the staged frame exactly (the staged car,
    // police and camera do not drift while the screenshot driver waits),
    // while the HUD and the sea keep moving so the frame reads as alive.
    updateHud(dt);
    animateSea(dt);
    return;
  }
  updatePlayer(dt);
  updateTraffic(dt);
  updatePeds(dt);
  updatePolice(dt);
  updateMissions(dt);
  updateEffects(dt);
  animateSea(dt);
  updateHud(dt);
  const player = G.player;
  updateEngine(player.inCar ? Math.abs(player.car.speed) : 0, player.inCar ? player.car.topSpeed : 1, player.inCar);
  updateSiren(dt, G.policeCars.length > 0);
  autosaveTimer += dt;
  if (autosaveTimer > 30) {
    autosaveTimer = 0;
    saveGame();
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  qualityTick();
  if (G.mode === 'playing') {
    accumulator += dt;
    while (accumulator >= STEP) {
      step(STEP);
      accumulator -= STEP;
    }
    // Esc / P pauses.
    if (G.keys.pausePressed) {
      G.keys.pausePressed = false;
      G.mode = 'paused';
      showScreen('pause-screen');
    }
  } else if (G.mode === 'paused') {
    if (G.keys.pausePressed) {
      G.keys.pausePressed = false;
      hideScreens();
      G.mode = 'playing';
    }
  } else {
    accumulator = 0;
  }
  // The camera follows even on menus (a slow orbit over the plaza).
  if (G.mode === 'menu') {
    $('hud').style.display = 'none';
    G.camYaw += dt * 0.05;
    const px = 12;
    const pz = 12;
    G.camera.position.set(px - Math.sin(G.camYaw) * 34, 20, pz - Math.cos(G.camYaw) * 34);
    G.camera.lookAt(px, 2, pz);
  } else {
    $('hud').style.display = 'block';
    // In shot mode the camera stays exactly where the staging put it.
    if (!G.shotMode) updateCamera(dt);
  }
  G.renderer.render(G.scene, G.camera);
}

boot();

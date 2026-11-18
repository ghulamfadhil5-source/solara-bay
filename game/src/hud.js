// Solara Bay — the HUD: health, money, wanted stars, speed, mission
// objective, dialogue box, and the live minimap.
// One clear job: read the game state every frame and paint the overlay.

import { CFG } from './config.js';
import { G } from './state.js';
import { currentObjective, currentTarget, MISSION_DEFS } from './missions.js';
import { nearestParkedCar } from './vehicles.js';

let els = {};
let minimap = null;
let mapCtx = null;
let dialogueTimer = 0;

export function initHud() {
  els = {
    healthFill: document.getElementById('health-fill'),
    healthText: document.getElementById('health-text'),
    money: document.getElementById('money'),
    stars: document.getElementById('stars'),
    speed: document.getElementById('speed'),
    speedLabel: document.getElementById('speed-label'),
    objective: document.getElementById('objective'),
    missionTitle: document.getElementById('mission-title'),
    dialogue: document.getElementById('dialogue'),
    dialogueSpeaker: document.getElementById('dialogue-speaker'),
    dialogueText: document.getElementById('dialogue-text'),
    message: document.getElementById('message'),
    crosshair: document.getElementById('crosshair'),
    interact: document.getElementById('interact'),
  };
  minimap = document.getElementById('minimap');
  mapCtx = minimap.getContext('2d');
}

let messageTimer = 0;

export function showMessage(text) {
  if (!els.message) return;
  els.message.textContent = text;
  els.message.style.opacity = '1';
  messageTimer = 3.5;
}

export function showDialogue(text, speaker) {
  if (!els.dialogue) return;
  els.dialogueSpeaker.textContent = speaker || '';
  els.dialogueText.textContent = text;
  els.dialogue.style.display = 'block';
  dialogueTimer = 6;
}

function starString(n) {
  let s = '';
  for (let i = 0; i < 5; i++) s += i < n ? '★' : '☆';
  return s;
}

export function updateHud(dt) {
  const player = G.player;
  if (!player || !els.healthFill) return;
  // Health.
  const hp = Math.max(0, Math.round(player.health));
  els.healthFill.style.width = `${hp}%`;
  els.healthFill.style.background = hp > 50 ? '#37a05a' : hp > 25 ? '#e8b820' : '#d23b2e';
  els.healthText.textContent = `${hp}`;
  // Money.
  els.money.textContent = `$${G.money}`;
  // Wanted stars.
  els.stars.textContent = starString(G.stars);
  els.stars.style.color = G.stars > 0 ? '#ffd23e' : '#8899aa';
  // Speed.
  const speedKmh = player.inCar ? Math.round(Math.abs(player.car.speed) * 3.6) : Math.round(player.speed * 3.6);
  els.speed.textContent = player.inCar || player.speed > 0.5 ? `${speedKmh}` : '';
  els.speedLabel.textContent = player.inCar ? 'km/h' : '';
  // Mission.
  els.missionTitle.textContent = G.mission ? G.mission.title : G.storyDone ? 'Story Complete' : 'Solara Bay';
  els.objective.textContent = currentObjective();
  // Crosshair only on foot, interact prompt near things.
  els.crosshair.style.display = !player.inCar && G.mode === 'playing' ? 'block' : 'none';
  // "Press E" when a car is in reach, or Sana has a job waiting.
  let showInteract = false;
  if (!player.inCar && G.mode === 'playing') {
    if (nearestParkedCar(player.pos.x, player.pos.z, 3.4)) showInteract = true;
    else if (!G.mission && G.missionIndex < MISSION_DEFS.length && Math.hypot(player.pos.x - 12, player.pos.z - 4) < 4) showInteract = true;
  }
  els.interact.style.display = showInteract ? 'block' : 'none';
  // Message + dialogue timers.
  if (messageTimer > 0) {
    messageTimer -= dt;
    if (messageTimer <= 0) els.message.style.opacity = '0';
  }
  if (dialogueTimer > 0) {
    dialogueTimer -= dt;
    if (dialogueTimer <= 0) els.dialogue.style.display = 'none';
  }
  drawMinimap();
}

function drawMinimap() {
  if (!mapCtx) return;
  const S = 190;
  const scale = S / 240; // world -120..120 maps onto the canvas
  const toMap = (x, z) => [(x + 120) * scale, (z + 120) * scale];
  const ctx = mapCtx;
  ctx.clearRect(0, 0, S, S);
  // Sea (bottom = +z) and sand.
  ctx.fillStyle = '#1f7fa8';
  ctx.fillRect(0, (126 + 120) * scale, S, S);
  ctx.fillStyle = '#e8d29a';
  ctx.fillRect(0, (108 + 120) * scale, S, (126 - 108) * scale);
  // City ground.
  ctx.fillStyle = '#5a7a4a';
  ctx.fillRect(0, 0, S, (108 + 120) * scale);
  // Roads.
  ctx.strokeStyle = '#3a3f46';
  ctx.lineWidth = 4;
  for (const r of CFG.roads) {
    const [x0, y0] = toMap(-120, r);
    const [x1] = toMap(120, r);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y0);
    ctx.stroke();
    const [vx, vy0] = toMap(r, -120);
    const [, vy1] = toMap(r, 120);
    ctx.beginPath();
    ctx.moveTo(vx, vy0);
    ctx.lineTo(vx, vy1);
    ctx.stroke();
  }
  // Cash pickups.
  ctx.fillStyle = '#2fae4e';
  for (const p of G.pickups) {
    if (p.taken) continue;
    const [x, y] = toMap(p.pos.x, p.pos.z);
    ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
  }
  // Traffic.
  ctx.fillStyle = '#ffffff';
  for (const car of G.traffic) {
    const [x, y] = toMap(car.pos.x, car.pos.z);
    ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
  }
  // Mission target: pulsing gold diamond.
  const target = currentTarget();
  if (target) {
    const [x, y] = toMap(target.x, target.z);
    const pulse = 5 + Math.sin(G.time * 4) * 2;
    ctx.fillStyle = '#ffd23e';
    ctx.beginPath();
    ctx.moveTo(x, y - pulse);
    ctx.lineTo(x + pulse, y);
    ctx.lineTo(x, y + pulse);
    ctx.lineTo(x - pulse, y);
    ctx.closePath();
    ctx.fill();
  }
  // Police: flashing red/blue.
  const blink = Math.floor(G.time * 3) % 2 === 0;
  ctx.fillStyle = blink ? '#ff2222' : '#2244ff';
  for (const car of G.policeCars) {
    const [x, y] = toMap(car.pos.x, car.pos.z);
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const cop of G.footCops) {
    const [x, y] = toMap(cop.pos.x, cop.pos.z);
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Player: white arrow pointing along the heading.
  const [px, py] = toMap(G.player.pos.x, G.player.pos.z);
  ctx.save();
  ctx.translate(px, py);
  // Canvas y points down while world +z is south: heading h points to
  // (sin h, cos h) on the map, which is a rotation of PI - h.
  ctx.rotate(Math.PI - G.player.heading);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(5, 6);
  ctx.lineTo(0, 3);
  ctx.lineTo(-5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

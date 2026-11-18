// Solara Bay — the player on foot: walk, run, shoot, enter and exit cars.
// One clear job: turn keys and mouse into a person moving through the city.

import * as THREE from 'three';
import { CFG } from './config.js';
import { G } from './state.js';
import { resolveCollision, clampToWorld } from './world.js';
import { driveCar, nearestParkedCar } from './vehicles.js';
import { addWanted } from './police.js';
import { knockPedDown } from './traffic.js';
import { playGunshot, playPickup } from './audio.js';
import { spawnMuzzleFlash, spawnDust } from './effects.js';

export function makePlayerMesh() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.75, 1.05, 0.42),
    new THREE.MeshLambertMaterial({ color: 0x2e6fd2 }),
  );
  body.position.y = 1.0;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xe8b98a }),
  );
  head.position.y = 1.78;
  head.castShadow = true;
  group.add(head);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x222831 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.7, 0.24), legMat);
  legL.position.set(-0.18, 0.35, 0);
  group.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.7, 0.24), legMat);
  legR.position.set(0.18, 0.35, 0);
  group.add(legR);
  // The pistol, held out when shooting.
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.12, 0.55),
    new THREE.MeshLambertMaterial({ color: 0x14161a }),
  );
  gun.position.set(0.35, 1.15, 0.45);
  group.add(gun);
  group.userData.legL = legL;
  group.userData.legR = legR;
  group.userData.gun = gun;
  return group;
}

export function createPlayer(x, z) {
  const mesh = makePlayerMesh();
  mesh.position.set(x, 0, z);
  G.scene.add(mesh);
  G.player = {
    mesh,
    pos: new THREE.Vector3(x, 0, z),
    heading: 0,
    speed: 0,
    health: CFG.playerHealth,
    invulnTimer: 0,
    inCar: false,
    car: null,
    shooting: false,
    gunCooldown: 0,
    walkPhase: 0,
  };
  return G.player;
}

// Enter a parked car. Stealing one is a crime (unless it is the mission taxi).
export function enterCar(car) {
  const player = G.player;
  player.inCar = true;
  player.car = car;
  car.parked = false;
  car.ai = false;
  player.mesh.visible = false;
  player.pos.copy(car.pos);
  player.heading = car.heading;
  if (!car.stolen && car.driver !== 'taxi' && car.driver !== 'sports') {
    car.stolen = true;
    addWanted(CFG.crimeStealCar);
    G.hudMessage && G.hudMessage('Car stolen! The Bay PD is on its way.');
  } else if (car.driver === 'sports') {
    car.stolen = true;
  }
}

// Step out of the car, beside it.
export function exitCar() {
  const player = G.player;
  const car = player.car;
  if (!car) return;
  player.inCar = false;
  player.car = null;
  const side = new THREE.Vector3(Math.cos(car.heading), 0, -Math.sin(car.heading));
  player.pos.set(car.pos.x + side.x * 2.4, 0, car.pos.z + side.z * 2.4);
  const fixed = resolveCollision(player.pos.x, player.pos.z, CFG.playerRadius);
  player.pos.x = fixed.x;
  player.pos.z = fixed.z;
  player.heading = car.heading;
  player.mesh.visible = true;
  player.mesh.position.copy(player.pos);
  // The pier deck sits 0.8 above the sand: stand on it, not in it.
  player.mesh.position.y = Math.abs(player.pos.x) < 3.5 && player.pos.z > 119 && player.pos.z < 145 ? 0.8 : 0;
  player.mesh.rotation.y = player.heading;
  car.speed = 0;
  car.parked = true;
}

export function updatePlayer(dt) {
  const player = G.player;
  player.invulnTimer = Math.max(0, player.invulnTimer - dt);
  player.gunCooldown = Math.max(0, player.gunCooldown - dt);

  if (player.inCar) {
    const car = player.car;
    const throttle = (G.keys.up ? 1 : 0) + (G.keys.down ? -1 : 0);
    const steer = (G.keys.left ? 1 : 0) + (G.keys.right ? -1 : 0);
    const speed = driveCar(car, dt, throttle, steer);
    player.pos.copy(car.pos);
    player.heading = car.heading;
    player.speed = speed;
    // Dust when drifting hard or off-road.
    if (Math.abs(speed) > 12 && Math.abs(steer) > 0.5) {
      spawnDust(car.pos.x - Math.sin(car.heading) * 2, car.pos.z - Math.cos(car.heading) * 2);
    }
    if (G.keys.interactPressed) {
      G.keys.interactPressed = false;
      exitCar();
    }
    return;
  }

  // On foot: camera-relative movement (camera looks along -Z of its yaw).
  const camYaw = G.camYaw;
  let mx = 0;
  let mz = 0;
  if (G.keys.up) mz -= 1;
  if (G.keys.down) mz += 1;
  if (G.keys.left) mx -= 1;
  if (G.keys.right) mx += 1;
  const moving = mx !== 0 || mz !== 0;
  if (moving) {
    const len = Math.hypot(mx, mz);
    mx /= len;
    mz /= len;
    // Screen-space input into world space: forward is (sin camYaw, cos camYaw),
    // right is (-cos camYaw, sin camYaw); W (mz = -1) must move forward.
    const sin = Math.sin(camYaw);
    const cos = Math.cos(camYaw);
    const wx = -mx * cos - mz * sin;
    const wz = mx * sin - mz * cos;
    const speed = G.keys.run ? CFG.runSpeed : CFG.walkSpeed;
    player.speed = speed;
    player.heading = Math.atan2(wx, wz);
    let nx = player.pos.x + wx * speed * dt;
    let nz = player.pos.z + wz * speed * dt;
    const hit = resolveCollision(nx, nz, CFG.playerRadius);
    const clamped = clampToWorld(hit.x, hit.z);
    player.pos.x = clamped.x;
    player.pos.z = Math.min(clamped.z, 122);
    player.walkPhase += dt * speed * 1.6;
    const swing = Math.sin(player.walkPhase) * 0.55;
    player.mesh.userData.legL.rotation.x = swing;
    player.mesh.userData.legR.rotation.x = -swing;
  } else {
    player.speed = 0;
    player.mesh.userData.legL.rotation.x = 0;
    player.mesh.userData.legR.rotation.x = 0;
  }
  player.mesh.position.copy(player.pos);
  // The pier deck sits 0.8 above the sand: stand on it, not in it.
  player.mesh.position.y = Math.abs(player.pos.x) < 3.5 && player.pos.z > 119 && player.pos.z < 145 ? 0.8 : 0;
  player.mesh.rotation.y = player.heading;

  // Enter a car.
  if (G.keys.interactPressed) {
    G.keys.interactPressed = false;
    const car = nearestParkedCar(player.pos.x, player.pos.z, 3.4);
    if (car) {
      enterCar(car);
      return;
    }
    // Talk to Sana (mission giver) or start the next mission.
    if (G.tryMissionInteract) G.tryMissionInteract();
  }

  // Shooting: hold the mouse button, aim where the camera looks.
  player.shooting = !!G.mouseDown;
  if (player.shooting && player.gunCooldown <= 0) {
    player.gunCooldown = CFG.gunCooldown;
    shoot();
  }

  // Cash pickups.
  for (const p of G.pickups) {
    if (p.taken) continue;
    if (Math.hypot(p.pos.x - player.pos.x, p.pos.z - player.pos.z) < 1.8) {
      p.taken = true;
      p.mesh.visible = false;
      G.money += p.value;
      playPickup();
      G.hudMessage && G.hudMessage(`Picked up $${p.value}.`);
    }
  }

  // Slow health regen out of combat.
  if (player.health < CFG.playerHealth && G.time - (G.lastDamageAt || 0) > 8) {
    player.health = Math.min(CFG.playerHealth, player.health + 2 * dt);
  }
}

function shoot() {
  const player = G.player;
  playGunshot();
  spawnMuzzleFlash(player.pos, player.heading);
  const fx = Math.sin(player.heading);
  const fz = Math.cos(player.heading);
  // Hit the nearest target inside a cone in front of the player.
  const targets = [];
  for (const ped of G.peds) {
    if (ped.state === 'down' || ped.state === 'gone') continue;
    targets.push({ pos: ped.pos, kind: 'ped', ref: ped });
  }
  for (const cop of G.footCops) targets.push({ pos: cop.pos, kind: 'cop', ref: cop });
  for (const guard of G.guards) {
    if (guard.health <= 0) continue;
    targets.push({ pos: guard.pos, kind: 'guard', ref: guard });
  }
  let best = null;
  let bestD = CFG.gunRange;
  for (const t of targets) {
    const dx = t.pos.x - player.pos.x;
    const dz = t.pos.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > bestD || d < 0.5) continue;
    const dot = (dx * fx + dz * fz) / d;
    if (dot < 0.86) continue; // ~30 degree cone
    bestD = d;
    best = t;
  }
  if (best) {
    if (best.kind === 'ped') {
      knockPedDown(best.ref);
      addWanted(CFG.crimeHitPed);
    } else if (best.kind === 'cop') {
      addWanted(CFG.crimeShoot);
      best.ref.pos.x += fx * 1.5;
      best.ref.pos.z += fz * 1.5;
    } else if (best.kind === 'guard') {
      best.ref.health -= CFG.gunDamage;
      if (best.ref.health <= 0) {
        best.ref.mesh.visible = false;
        G.hudMessage && G.hudMessage('Guard down.');
      }
    }
  } else {
    // A shot fired near police still draws attention.
    let nearPolice = false;
    for (const car of G.policeCars) {
      if (Math.hypot(car.pos.x - player.pos.x, car.pos.z - player.pos.z) < 30) nearPolice = true;
    }
    if (nearPolice) addWanted(CFG.crimeShoot);
  }
}

// Solara Bay — the wanted level and the Bay PD.
// One clear job: turn crimes into stars, spawn police that chase, ram and
// arrest the player, and let the heat cool off when the player hides.

import * as THREE from 'three';
import { CFG } from './config.js';
import { G } from './state.js';
import { spawnCar, collideCars } from './vehicles.js';
import { resolveCollision } from './world.js';
import { playBusted, playCrash } from './audio.js';

export function starsForPoints(points) {
  let stars = 0;
  for (const t of CFG.starThresholds) if (points >= t) stars++;
  return stars;
}

export function addWanted(points) {
  G.wanted = Math.min(1000, G.wanted + points);
  G.lastCrimeAt = G.time;
  const stars = starsForPoints(G.wanted);
  if (stars > G.stars) G.stars = stars;
  updatePolicePresence();
}

export function clearWanted() {
  G.wanted = 0;
  G.stars = 0;
  for (const car of G.policeCars) {
    G.scene.remove(car.mesh);
    const i = G.cars.indexOf(car);
    if (i >= 0) G.cars.splice(i, 1);
  }
  G.policeCars = [];
  for (const cop of G.footCops) {
    G.scene.remove(cop.mesh);
  }
  G.footCops = [];
  G.bustHold = 0;
}

// How many police cars the current heat calls for.
function desiredPoliceCars() {
  return [0, 1, 2, 3, 4, 5][G.stars];
}

function spawnPoliceCar() {
  const player = G.player;
  // Spawn on a road 40-60 units away from the player.
  const angle = Math.random() * Math.PI * 2;
  const dist = 45 + Math.random() * 15;
  let x = player.pos.x + Math.sin(angle) * dist;
  let z = player.pos.z + Math.cos(angle) * dist;
  x = Math.max(-100, Math.min(100, x));
  z = Math.max(-100, Math.min(100, z));
  const car = spawnCar(0xf2f2f2, 'police', x, z, Math.atan2(player.pos.x - x, player.pos.z - z), {});
  car.parked = false;
  car.ai = false;
  return car;
}

function spawnFootCop() {
  const player = G.player;
  const angle = Math.random() * Math.PI * 2;
  const x = player.pos.x + Math.sin(angle) * 18;
  const z = player.pos.z + Math.cos(angle) * 18;
  const mesh = makeCopMesh();
  mesh.position.set(x, 0, z);
  G.scene.add(mesh);
  const cop = {
    mesh,
    pos: new THREE.Vector3(x, 0, z),
    heading: 0,
    speed: 3.2,
    punchCooldown: 0,
    walkPhase: Math.random() * 6,
  };
  G.footCops.push(cop);
  return cop;
}

function makeCopMesh() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.75, 1.05, 0.42),
    new THREE.MeshLambertMaterial({ color: 0x1a3a6b }),
  );
  body.position.y = 1.0;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xe8b98a }),
  );
  head.position.y = 1.78;
  group.add(head);
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.32, 0.14, 10),
    new THREE.MeshLambertMaterial({ color: 0x10264a }),
  );
  cap.position.y = 2.0;
  group.add(cap);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x1a2a44 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.7, 0.24), legMat);
  legL.position.set(-0.18, 0.35, 0);
  group.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.7, 0.24), legMat);
  legR.position.set(0.18, 0.35, 0);
  group.add(legR);
  group.userData.legL = legL;
  group.userData.legR = legR;
  return group;
}

export function updatePolicePresence() {
  const want = desiredPoliceCars();
  while (G.policeCars.length < want) spawnPoliceCar();
  while (G.footCops.length < (G.stars >= 3 ? 2 : 0)) spawnFootCop();
}

// Called every frame while playing.
export function updatePolice(dt) {
  const player = G.player;
  // Wanted decay: slow normally, faster when hidden from every police unit.
  if (G.wanted > 0 && G.time - G.lastCrimeAt > 5) {
    let nearest = Infinity;
    for (const car of G.policeCars) {
      nearest = Math.min(nearest, Math.hypot(car.pos.x - player.pos.x, car.pos.z - player.pos.z));
    }
    for (const cop of G.footCops) {
      nearest = Math.min(nearest, Math.hypot(cop.pos.x - player.pos.x, cop.pos.z - player.pos.z));
    }
    const decay = nearest > 25 ? CFG.wantedDecayPerSec + CFG.wantedHiddenBonus : CFG.wantedDecayPerSec;
    G.wanted = Math.max(0, G.wanted - decay * dt);
    G.stars = starsForPoints(G.wanted);
    if (G.wanted === 0) clearWanted();
  }
  updatePolicePresence();

  // --- Police cars chase and ram ---
  let bustHold = G.bustHold || 0;
  for (const car of G.policeCars) {
    const dx = player.pos.x - car.pos.x;
    const dz = player.pos.z - car.pos.z;
    const dist = Math.hypot(dx, dz);
    const targetHeading = Math.atan2(dx, dz);
    let dh = targetHeading - car.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    car.heading += dh * Math.min(1, dt * 2.2);
    const targetSpeed = dist > 6 ? 20 + G.stars * 3 : 6;
    car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.2);
    car.pos.x += Math.sin(car.heading) * car.speed * dt;
    car.pos.z += Math.cos(car.heading) * car.speed * dt;
    const hit = resolveCollision(car.pos.x, car.pos.z, CFG.carRadius);
    car.pos.x = hit.x;
    car.pos.z = hit.z;
    car.mesh.position.set(car.pos.x, 0, car.pos.z);
    car.mesh.rotation.y = car.heading;
    const spin = (car.speed * dt) / 0.42;
    for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
    // Flash the light bar.
    const blink = Math.floor(G.time * 6) % 2 === 0;
    car.mesh.userData.lightRed.material.color.setHex(blink ? 0xff2222 : 0x550000);
    car.mesh.userData.lightBlue.material.color.setHex(blink ? 0x000055 : 0x2244ff);
    // Ram the player: car or on foot.
    if (dist < 3.4) {
      const playerSpeed = player.inCar ? Math.abs(player.car.speed) : 0;
      if (player.inCar) {
        if (collideCars(car, player.car) && Math.abs(car.speed) > 4) {
          damagePlayer(CFG.policeRamDamage * 0.6);
          playCrash();
          car.speed *= 0.4;
        }
      } else if (Math.abs(car.speed) > 3) {
        damagePlayer(CFG.policeRamDamage);
        playCrash();
        // Knock the player sideways.
        player.pos.x += (dx / (dist || 1)) * -2;
        player.pos.z += (dz / (dist || 1)) * -2;
        car.speed *= 0.3;
      }
      // Busted: slow player, police car holding close.
      const slow = player.inCar ? Math.abs(player.car.speed) < 1.5 : true;
      if (slow && dist < CFG.bustDistance) {
        bustHold += dt;
      } else {
        bustHold = 0;
      }
    } else {
      bustHold = 0;
    }
  }
  G.bustHold = bustHold;
  if (bustHold > CFG.bustHoldSeconds) {
    G.onBusted && G.onBusted();
    return;
  }

  // --- Foot cops chase on foot and punch ---
  for (const cop of G.footCops) {
    const dx = player.pos.x - cop.pos.x;
    const dz = player.pos.z - cop.pos.z;
    const dist = Math.hypot(dx, dz);
    cop.heading = Math.atan2(dx, dz);
    if (dist > 1.6) {
      cop.pos.x += Math.sin(cop.heading) * cop.speed * dt;
      cop.pos.z += Math.cos(cop.heading) * cop.speed * dt;
    }
    const hit = resolveCollision(cop.pos.x, cop.pos.z, 0.5);
    cop.pos.x = hit.x;
    cop.pos.z = hit.z;
    cop.mesh.position.set(cop.pos.x, 0, cop.pos.z);
    cop.mesh.rotation.y = cop.heading;
    cop.walkPhase += dt * 6;
    const swing = Math.sin(cop.walkPhase) * 0.45;
    cop.mesh.userData.legL.rotation.x = swing;
    cop.mesh.userData.legR.rotation.x = -swing;
    cop.punchCooldown -= dt;
    if (dist < 1.8 && cop.punchCooldown <= 0) {
      damagePlayer(CFG.policePunchDamage);
      cop.punchCooldown = 1.1;
    }
  }
}

export function damagePlayer(amount) {
  if (G.mode !== 'playing') return;
  if (G.player.invulnTimer > 0) return;
  G.player.health -= amount;
  G.lastDamageAt = G.time;
  G.player.invulnTimer = 0.6;
  G.shake = Math.min(1, G.shake + 0.4);
  if (G.player.health <= 0) {
    G.player.health = 0;
    G.onKnockedOut && G.onKnockedOut();
  }
}

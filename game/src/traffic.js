// Solara Bay — traffic and pedestrians.
// One clear job: keep the city moving. AI cars drive the road grid (turning
// at intersections, slowing for the car ahead), pedestrians walk the
// sidewalks and run away from danger.

import * as THREE from 'three';
import { CFG, COLORS } from './config.js';
import { G } from './state.js';
import { makeRng, pick, range } from './random.js';
import { spawnCar, driveCar, collideCars } from './vehicles.js';
import { resolveCollision, clampToWorld } from './world.js';
import { addWanted } from './police.js';

const pedShirtColors = [0xe05a5a, 0x5a8ae0, 0x5ac07a, 0xe0c85a, 0x9a5ae0, 0xe08a3c, 0x3cc0c0];

// --- Traffic cars ---

export function spawnTraffic() {
  const rand = makeRng(G.seed + 21);
  const colors = [...COLORS.carPalette];
  for (let i = 0; i < CFG.trafficCount; i++) {
    const axis = rand() < 0.5 ? 'x' : 'z';
    const road = pick(rand, CFG.roads);
    const dir = rand() < 0.5 ? 1 : -1;
    const along = range(rand, -100, 100);
    const lane = dir === 1 ? 2 : -2;
    let x;
    let z;
    let heading;
    if (axis === 'x') {
      x = along;
      z = road + lane;
      heading = dir === 1 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      x = road + (dir === 1 ? -2 : 2);
      z = along;
      heading = dir === 1 ? 0 : Math.PI;
    }
    const color = colors[Math.floor(rand() * colors.length)];
    const kind = pick(rand, ['sedan', 'sedan', 'hatch', 'truck']);
    spawnCar(color, kind, x, z, heading, {
      ai: true,
      aiAxis: axis,
      aiDir: dir,
      aiLane: lane,
      aiSpeed: range(rand, CFG.trafficSpeedMin, CFG.trafficSpeedMax),
    });
  }
}

function nearestRoadCoord(v) {
  let best = CFG.roads[0];
  let bestD = Math.abs(v - best);
  for (const r of CFG.roads) {
    const d = Math.abs(v - r);
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best;
}

function carAhead(car) {
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  let best = Infinity;
  for (const other of G.cars) {
    if (other === car) continue;
    const dx = other.pos.x - car.pos.x;
    const dz = other.pos.z - car.pos.z;
    const along = dx * fx + dz * fz;
    const side = Math.abs(dx * fz - dz * fx);
    if (along > 0 && along < 12 && side < 3 && along < best) best = along;
  }
  return best;
}

export function updateTraffic(dt) {
  const rand = Math.random;
  for (const car of G.traffic) {
    // Slow down for the car ahead; stop if it is very close.
    const ahead = carAhead(car);
    let target = car.aiSpeed;
    if (ahead < 9) target = ahead < 5 ? 0 : car.aiSpeed * 0.35;
    car.speed += (target - car.speed) * Math.min(1, dt * 1.5);
    // Steer toward the current lane line.
    let desiredHeading;
    if (car.aiAxis === 'x') desiredHeading = car.aiDir === 1 ? Math.PI / 2 : -Math.PI / 2;
    else desiredHeading = car.aiDir === 1 ? 0 : Math.PI;
    let dh = desiredHeading - car.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    car.heading += dh * Math.min(1, dt * 3);
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    car.pos.x += fx * car.speed * dt;
    car.pos.z += fz * car.speed * dt;
    // At an intersection (along-coordinate near a multiple of 24),
    // sometimes turn onto the cross road.
    const onXRoad = car.aiAxis === 'x';
    const alongCoord = onXRoad ? car.pos.x : car.pos.z;
    if (Math.abs(alongCoord % 24) < 1.5) {
      if (rand() < 0.02) {
        // Turn: swap axis, keep the new lane on the right side.
        const nearestCross = nearestRoadCoord(onXRoad ? car.pos.z : car.pos.x);
        car.aiAxis = onXRoad ? 'z' : 'x';
        car.aiDir = rand() < 0.5 ? 1 : -1;
        if (car.aiAxis === 'x') {
          car.pos.z = nearestCross + (car.aiDir === 1 ? 2 : -2);
        } else {
          car.pos.x = nearestCross + (car.aiDir === 1 ? -2 : 2);
        }
      }
    }
    // Wrap around the city edge instead of driving into the sea.
    if (car.pos.x > CFG.cityHalf + 4) car.pos.x = -CFG.cityHalf - 4;
    if (car.pos.x < -CFG.cityHalf - 4) car.pos.x = CFG.cityHalf + 4;
    if (car.pos.z > 120) car.pos.z = -CFG.cityHalf - 4;
    if (car.pos.z < -CFG.cityHalf - 4) car.pos.z = 120;
    car.mesh.position.set(car.pos.x, 0, car.pos.z);
    car.mesh.rotation.y = car.heading;
    const spin = (car.speed * dt) / 0.42;
    for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
  }
  // Gentle car-vs-car separation for traffic.
  for (let i = 0; i < G.cars.length; i++) {
    for (let j = i + 1; j < G.cars.length; j++) {
      collideCars(G.cars[i], G.cars[j]);
    }
  }
}

// --- Pedestrians ---

function makePedMesh(shirtColor) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 1.0, 0.4),
    new THREE.MeshLambertMaterial({ color: shirtColor }),
  );
  body.position.y = 1.0;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xe8b98a }),
  );
  head.position.y = 1.75;
  head.castShadow = true;
  group.add(head);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x2a2f36 });
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

export function spawnPeds() {
  const rand = makeRng(G.seed + 33);
  for (let i = 0; i < CFG.pedCount; i++) {
    const mesh = makePedMesh(pick(rand, pedShirtColors));
    const x = range(rand, -100, 100);
    const z = range(rand, -100, 104);
    mesh.position.set(x, 0, z);
    G.scene.add(mesh);
    G.peds.push({
      mesh,
      pos: new THREE.Vector3(x, 0, z),
      heading: rand() * Math.PI * 2,
      speed: range(rand, CFG.pedSpeedMin, CFG.pedSpeedMax),
      state: 'walk',
      target: new THREE.Vector3(range(rand, -100, 100), 0, range(rand, -100, 100)),
      fallTimer: 0,
      walkPhase: rand() * Math.PI * 2,
    });
  }
}

export function updatePeds(dt) {
  const player = G.player;
  for (const ped of G.peds) {
    if (ped.state === 'down') {
      ped.fallTimer -= dt;
      if (ped.fallTimer <= 0) {
        ped.mesh.visible = false;
        ped.state = 'gone';
      }
      continue;
    }
    if (ped.state === 'gone') continue;
    // Flee when the player is speeding nearby in a car or shooting.
    const dx = ped.pos.x - player.pos.x;
    const dz = ped.pos.z - player.pos.z;
    const distToPlayer = Math.hypot(dx, dz);
    const playerSpeed = player.inCar ? Math.abs(player.car.speed) : 0;
    if (ped.state !== 'flee' && ((player.inCar && playerSpeed > 8 && distToPlayer < 10) || (player.shooting && distToPlayer < 16))) {
      ped.state = 'flee';
      ped.speed = 4.5;
    }
    if (ped.state === 'flee') {
      ped.heading = Math.atan2(dx, dz);
      if (distToPlayer > 22) {
        ped.state = 'walk';
        ped.speed = range(Math.random, CFG.pedSpeedMin, CFG.pedSpeedMax);
      }
    } else {
      // Wander toward the current target; pick a new one on arrival.
      const tx = ped.target.x - ped.pos.x;
      const tz = ped.target.z - ped.pos.z;
      if (Math.hypot(tx, tz) < 2) {
        ped.target.set(range(Math.random, -100, 100), 0, range(Math.random, -100, 104));
      } else {
        ped.heading = Math.atan2(tx, tz);
      }
    }
    ped.pos.x += Math.sin(ped.heading) * ped.speed * dt;
    ped.pos.z += Math.cos(ped.heading) * ped.speed * dt;
    const hit = resolveCollision(ped.pos.x, ped.pos.z, 0.5);
    const clamped = clampToWorld(hit.x, hit.z);
    ped.pos.x = clamped.x;
    ped.pos.z = Math.min(clamped.z, 120);
    ped.mesh.position.set(ped.pos.x, 0, ped.pos.z);
    ped.mesh.rotation.y = ped.heading;
    // Walking leg swing.
    ped.walkPhase += dt * ped.speed * 2.4;
    const swing = Math.sin(ped.walkPhase) * 0.5;
    ped.mesh.userData.legL.rotation.x = swing;
    ped.mesh.userData.legR.rotation.x = -swing;
    // Hit by the player's car: knocked down, and that is a crime.
    if (player.inCar && playerSpeed > 5 && distToPlayer < 2.4 && ped.state !== 'down') {
      knockPedDown(ped);
      addWanted(CFG.crimeHitPed);
    }
  }
}

export function knockPedDown(ped) {
  ped.state = 'down';
  ped.fallTimer = 4;
  ped.mesh.rotation.x = -Math.PI / 2;
  ped.mesh.position.y = 0.35;
}

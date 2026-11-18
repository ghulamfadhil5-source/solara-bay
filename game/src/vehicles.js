// Solara Bay — cars: the models, the driving, the parked cars to steal.
// One clear job: build a car mesh, move it with arcade handling, and keep
// the fleet of parked, traffic and police cars in one list.

import * as THREE from 'three';
import { CFG, COLORS } from './config.js';
import { G } from './state.js';
import { resolveCollision, clampToWorld } from './world.js';
import { makeRng, pick, range } from './random.js';

const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 12);
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });

// Build a low-poly car from boxes. kind: sedan | hatch | truck | taxi | sports | police.
export function makeCarMesh(color, kind) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1c2b3a });
  const bodyLen = kind === 'truck' ? 5.4 : kind === 'sports' ? 4.4 : 4.0;
  const bodyH = kind === 'truck' ? 1.1 : 0.85;
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, bodyH, bodyLen), bodyMat);
  body.position.y = 0.65;
  body.castShadow = true;
  group.add(body);
  if (kind === 'truck') {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 2.4), new THREE.MeshLambertMaterial({ color: 0x3a3f46 }));
    bed.position.set(0, 1.35, -1.2);
    group.add(bed);
  }
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.7, kind === 'sports' ? 1.9 : 2.1),
    glassMat,
  );
  cabin.position.set(0, 1.35, kind === 'truck' ? 1.1 : -0.15);
  cabin.castShadow = true;
  group.add(cabin);
  // Headlights and taillights.
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xd21f1f });
  for (const sx of [-0.65, 0.65]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), headMat);
    head.position.set(sx, 0.7, bodyLen / 2 + 0.02);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), tailMat);
    tail.position.set(sx, 0.7, -bodyLen / 2 - 0.02);
    group.add(tail);
  }
  // Wheels.
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.42, wz * (bodyLen / 4.4));
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.28, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x111111 }),
    );
    sign.position.set(0, 1.85, -0.15);
    group.add(sign);
  }
  if (kind === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    bar.position.set(0, 1.8, -0.15);
    group.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.52), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.set(-0.28, 1.95, -0.15);
    group.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.52), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    blue.position.set(0.28, 1.95, -0.15);
    group.add(blue);
    group.userData.lightRed = red;
    group.userData.lightBlue = blue;
  }
  group.userData.wheels = wheels;
  return group;
}

export function spawnCar(color, kind, x, z, heading, opts = {}) {
  const mesh = makeCarMesh(color, kind);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  G.scene.add(mesh);
  const car = {
    mesh,
    kind,
    color,
    pos: new THREE.Vector3(x, 0, z),
    heading,
    speed: 0,
    steer: 0,
    parked: !!opts.parked,
    police: kind === 'police',
    ai: !!opts.ai,
    driver: opts.driver || null,
    topSpeed: kind === 'sports' ? CFG.sportsTopSpeed : kind === 'taxi' ? CFG.taxiTopSpeed : CFG.carTopSpeed,
    stolen: false,
    aiAxis: opts.aiAxis || 'x',
    aiDir: opts.aiDir || 1,
    aiLane: opts.aiLane || 0,
    aiSpeed: opts.aiSpeed || 8,
    hitCooldown: 0,
  };
  G.cars.push(car);
  if (car.ai) G.traffic.push(car);
  if (car.police) G.policeCars.push(car);
  return car;
}

// Parked, stealable cars along road edges: at least six, distinct colours.
export function spawnParkedCars() {
  const rand = makeRng(G.seed + 7);
  // Curbside parking: 5.5 off the road centre, so traffic in the lanes
  // (at +/-2) is not blocked by a parked car.
  const spots = [
    { x: 26, z: 18.5, h: Math.PI / 2, kind: 'sedan' },
    { x: -26, z: -18.5, h: -Math.PI / 2, kind: 'hatch' },
    { x: 53.5, z: 50, h: 0, kind: 'sedan' },
    { x: -53.5, z: -50, h: Math.PI, kind: 'truck' },
    { x: 74, z: 77.5, h: -Math.PI / 2, kind: 'hatch' },
    { x: -74, z: -77.5, h: Math.PI / 2, kind: 'sedan' },
    { x: 18.5, z: -74, h: Math.PI, kind: 'sports' },
    { x: -18.5, z: 74, h: 0, kind: 'sedan' },
  ];
  const colors = [...COLORS.carPalette];
  for (const s of spots) {
    const color = colors.splice(Math.floor(rand() * colors.length), 1)[0];
    spawnCar(color, s.kind, s.x, s.z, s.h, { parked: true });
  }
  // The taxi for mission 1, parked at Coral Plaza.
  spawnCar(COLORS.taxiYellow, 'taxi', 20, 6, Math.PI / 2, { parked: true, driver: 'taxi' });
  // The red sports car for mission 3.
  spawnCar(COLORS.sportsRed, 'sports', -82, 80, 0, { parked: true, driver: 'sports' });
}

// Arcade driving: accelerate, brake, reverse, steer harder at low speed.
export function driveCar(car, dt, throttle, steerInput) {
  const top = car.topSpeed;
  if (throttle > 0) car.speed += CFG.carAccel * throttle * dt;
  else if (throttle < 0) {
    if (car.speed > 0.5) car.speed -= CFG.carBrake * dt;
    else car.speed -= CFG.carAccel * 0.6 * dt;
  }
  // Drag and rolling resistance.
  car.speed -= car.speed * 0.55 * dt;
  if (Math.abs(car.speed) < 0.05 && throttle === 0) car.speed = 0;
  car.speed = Math.max(-CFG.carReverseMax, Math.min(top, car.speed));
  // Steering: sharper when slow, none when stopped; it inverts in reverse.
  const speedFactor = Math.min(1, Math.abs(car.speed) / 8);
  car.heading += steerInput * CFG.carTurn * speedFactor * dt * Math.sign(car.speed);
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  let nx = car.pos.x + fx * car.speed * dt;
  let nz = car.pos.z + fz * car.speed * dt;
  const hit = resolveCollision(nx, nz, CFG.carRadius);
  const clamped = clampToWorld(hit.x, hit.z);
  if (clamped.x !== hit.x || clamped.z !== hit.z) car.speed *= 0.5;
  if (hit.x !== nx || hit.z !== nz) {
    // Scraped a building: lose speed, spark.
    if (Math.abs(car.speed) > 6) car.speed *= 0.55;
  }
  car.pos.x = clamped.x;
  car.pos.z = clamped.z;
  // The pier deck is for pedestrians: keep cars off it.
  if (Math.abs(car.pos.x) < 4.5 && car.pos.z > 118) {
    car.pos.z = 118;
    car.speed *= 0.4;
  }
  // Sea blocks cars.
  if (car.pos.z > 122) {
    car.pos.z = 122;
    car.speed *= 0.4;
  }
  car.mesh.position.set(car.pos.x, 0, car.pos.z);
  car.mesh.rotation.y = car.heading;
  // Spin the wheels.
  const spin = (car.speed * dt) / 0.42;
  for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
  return car.speed;
}

// Simple circle-vs-circle push between two cars; returns true on contact.
export function collideCars(a, b) {
  const dx = b.pos.x - a.pos.x;
  const dz = b.pos.z - a.pos.z;
  const d2 = dx * dx + dz * dz;
  const min = CFG.carRadius * 2;
  if (d2 >= min * min || d2 < 0.0001) return false;
  const d = Math.sqrt(d2);
  const push = (min - d) / 2 / d;
  a.pos.x -= dx * push;
  a.pos.z -= dz * push;
  b.pos.x += dx * push;
  b.pos.z += dz * push;
  a.mesh.position.set(a.pos.x, 0, a.pos.z);
  b.mesh.position.set(b.pos.x, 0, b.pos.z);
  return true;
}

// Nearest parked (stealable) car within `range` of a point.
export function nearestParkedCar(x, z, rangeDist) {
  let best = null;
  let bestD = rangeDist;
  for (const car of G.cars) {
    if (!car.parked || car.police) continue;
    const d = Math.hypot(car.pos.x - x, car.pos.z - z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

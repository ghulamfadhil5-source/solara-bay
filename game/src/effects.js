// Solara Bay — small visual effects: dust puffs, muzzle flashes, tracers.
// One clear job: short-lived particles that make driving and shooting feel
// physical, pooled so the game never allocates mid-frame.

import * as THREE from 'three';
import { G } from './state.js';

let dustPool = [];
let flashPool = [];
let tracerPool = [];

const dustGeo = new THREE.SphereGeometry(0.35, 6, 5);
const dustMat = new THREE.MeshBasicMaterial({ color: 0xcbb98a, transparent: true, opacity: 0.55 });
const flashGeo = new THREE.SphereGeometry(0.45, 8, 6);
const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd23e });

export function initEffects() {
  for (let i = 0; i < 40; i++) {
    const m = new THREE.Mesh(dustGeo, dustMat.clone());
    m.visible = false;
    G.scene.add(m);
    dustPool.push({ mesh: m, life: 0 });
  }
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(flashGeo, flashMat.clone());
    m.visible = false;
    G.scene.add(m);
    flashPool.push({ mesh: m, life: 0 });
  }
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a8 });
  for (let i = 0; i < 8; i++) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(geo, tracerMat);
    line.visible = false;
    G.scene.add(line);
    tracerPool.push({ line, life: 0 });
  }
}

function nextFree(pool) {
  for (const p of pool) if (p.life <= 0) return p;
  return pool[0];
}

export function spawnDust(x, z) {
  const p = nextFree(dustPool);
  p.mesh.position.set(x + (Math.random() - 0.5), 0.4, z + (Math.random() - 0.5));
  p.mesh.visible = true;
  p.mesh.scale.setScalar(0.7 + Math.random() * 0.6);
  p.life = 0.7;
}

export function spawnMuzzleFlash(pos, heading) {
  const p = nextFree(flashPool);
  p.mesh.position.set(
    pos.x + Math.sin(heading) * 1.1,
    1.2,
    pos.z + Math.cos(heading) * 1.1,
  );
  p.mesh.visible = true;
  p.life = 0.08;
}

export function spawnTracer(from, to) {
  const p = nextFree(tracerPool);
  const pts = p.line.geometry.attributes.position;
  pts.setXYZ(0, from.x, 1.2, from.z);
  pts.setXYZ(1, to.x, 1.2, to.z);
  pts.needsUpdate = true;
  p.line.visible = true;
  p.life = 0.12;
}

export function updateEffects(dt) {
  for (const p of dustPool) {
    if (p.life <= 0) continue;
    p.life -= dt;
    p.mesh.position.y += dt * 0.8;
    p.mesh.scale.multiplyScalar(1 + dt * 1.5);
    p.mesh.material.opacity = Math.max(0, p.life / 0.7) * 0.55;
    if (p.life <= 0) p.mesh.visible = false;
  }
  for (const p of flashPool) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) p.mesh.visible = false;
  }
  for (const p of tracerPool) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) p.line.visible = false;
  }
}

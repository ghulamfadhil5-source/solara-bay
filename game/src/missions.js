// Solara Bay — the story: four missions for fixer Sana Reyes.
// One clear job: start missions, track each stage, spawn what it needs
// (passenger, guards, crate), pay the reward and advance the story.
// Kai Marlin owes Sana $2,000; each job pays it down.

import * as THREE from 'three';
import { PLACES } from './config.js';
import { G } from './state.js';
import { addWanted, clearWanted } from './police.js';
import { playChime, playGunshot } from './audio.js';
import { spawnTracer } from './effects.js';

const REWARDS = [150, 200, 350, 600, 800];

let sanaMesh = null;
let beacon = null;
let beaconRing = null;
let passengerMesh = null;
let crateMesh = null;

export const MISSION_DEFS = [
  {
    id: 'first-fare',
    title: 'First Fare',
    brief: 'Sana: "Kai, you owe me two grand. Start small — drive my cab, pick up a fare at Palm Market, drop them at the Marina Hotel."',
    stages: [
      { objective: 'Get in the yellow taxi at Coral Plaza', target: { x: 20, z: 6 } },
      { objective: 'Pick up the passenger at Palm Market', target: { x: -60, z: -19 } },
      { objective: 'Drop the passenger at the Marina Hotel', target: { x: 50, z: -60 } },
    ],
  },
  {
    id: 'bay-run',
    title: 'Bay Run',
    brief: 'Sana: "Three parcels, three stops. Market, Surf Shop, Bay Clinic. Fast feet or fast wheels — your call."',
    stages: [
      { objective: 'Deliver parcel 1 of 3: Palm Market', target: { x: -60, z: -19 } },
      { objective: 'Deliver parcel 2 of 3: Surf Shop', target: { x: 84, z: 52 } },
      { objective: 'Deliver parcel 3 of 3: Bay Clinic', target: { x: -36, z: 28 } },
    ],
  },
  {
    id: 'hot-wheels',
    title: 'Hot Wheels',
    brief: 'Sana: "A red sports car is parked by the south car park. Take it. The PD will notice — lose them and it is yours to keep quiet about."',
    stages: [
      { objective: 'Steal the red sports car at Sunset Car Park', target: { x: -82, z: 80 } },
      { objective: 'Lose the cops — get your wanted level to zero', target: null },
    ],
  },
  {
    id: 'dock-deal',
    title: 'Dock Deal',
    brief: 'Sana: "Last job. A crate is waiting on Sunset Pier, but Vega\'s crew is guarding it. Take them down, grab the crate, bring it back to me."',
    stages: [
      { objective: 'Reach Sunset Pier', target: { x: 0, z: 118 } },
      { objective: 'Take down all 4 guards', target: { x: 0, z: 132 } },
      { objective: 'Grab the crate at the end of the pier', target: { x: 0, z: 140 } },
      { objective: 'Bring the crate back to Sana', target: { x: 12, z: 4 } },
    ],
  },
  {
    id: 'sunset-score',
    title: 'Sunset Score',
    brief: 'Sana: "One last score, Kai. Vega\'s lockbox is by the Marina Hotel and his crew is watching it. Take them down, grab the case, bring it to me — that clears your two grand."',
    stages: [
      { objective: 'Reach the Marina Hotel', target: { x: 48, z: -60 } },
      { objective: 'Take down all 3 guards', target: { x: 48, z: -60 } },
      { objective: 'Grab the case at the Marina Hotel', target: { x: 48, z: -60 } },
      { objective: 'Bring the case back to Sana', target: { x: 12, z: 4 } },
    ],
  },
];

function makeSanaMesh() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.75, 1.05, 0.42),
    new THREE.MeshLambertMaterial({ color: 0x8a3fd0 }),
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
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0x222222 }),
  );
  hair.position.y = 1.84;
  group.add(hair);
  return group;
}

function makeGuardMesh() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 1.1, 0.45),
    new THREE.MeshLambertMaterial({ color: 0x8a1f1f }),
  );
  body.position.y = 1.0;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xd8a878 }),
  );
  head.position.y = 1.8;
  group.add(head);
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.12, 0.6),
    new THREE.MeshLambertMaterial({ color: 0x14161a }),
  );
  gun.position.set(0.4, 1.15, 0.4);
  group.add(gun);
  return group;
}

export function initMissions() {
  sanaMesh = makeSanaMesh();
  sanaMesh.position.set(12, 0, 4);
  G.scene.add(sanaMesh);
  // The objective beacon: a glowing pillar and a bobbing diamond.
  beacon = new THREE.Group();
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 30, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
  );
  pillar.position.y = 15;
  beacon.add(pillar);
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.9),
    new THREE.MeshBasicMaterial({ color: 0xffd23e }),
  );
  diamond.position.y = 6;
  beacon.add(diamond);
  beacon.userData.diamond = diamond;
  beacon.visible = false;
  G.scene.add(beacon);
  beaconRing = new THREE.Mesh(
    new THREE.RingGeometry(2.2, 3, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
  );
  beaconRing.rotation.x = -Math.PI / 2;
  beaconRing.position.y = 0.1;
  beaconRing.visible = false;
  G.scene.add(beaconRing);
  showSanaBeacon();
}

function showSanaBeacon() {
  if (G.mission) return;
  if (G.missionIndex >= MISSION_DEFS.length) return;
  beacon.position.set(12, 0, 4);
  beaconRing.position.set(12, 0.1, 4);
  beacon.visible = true;
  beaconRing.visible = true;
}

function setBeacon(x, z) {
  if (x === null || x === undefined) {
    beacon.visible = false;
    beaconRing.visible = false;
    return;
  }
  beacon.position.set(x, 0, z);
  beaconRing.position.set(x, 0.1, z);
  beacon.visible = true;
  beaconRing.visible = true;
}

export function currentObjective() {
  if (!G.mission) {
    if (G.missionIndex >= MISSION_DEFS.length) return G.storyDone ? 'Story complete — Solara Bay is yours.' : '';
    return 'Go to Sana at Coral Plaza (follow the gold beacon) — press E to talk.';
  }
  return G.mission.stages[G.mission.stage].objective;
}

export function currentTarget() {
  if (!G.mission) return { x: 12, z: 4 };
  return G.mission.stages[G.mission.stage].target;
}

export function tryMissionInteract() {
  const player = G.player;
  const dx = player.pos.x - 12;
  const dz = player.pos.z - 4;
  if (Math.hypot(dx, dz) < 4 && !G.mission && G.missionIndex < MISSION_DEFS.length) {
    startMission(G.missionIndex);
  }
}

export function startMission(index) {
  const def = MISSION_DEFS[index];
  G.mission = {
    id: def.id,
    title: def.title,
    stage: 0,
    stages: def.stages,
    data: {},
  };
  G.wasBusted = false; // a bust during a mission must not count as losing the cops
  G.showDialogue && G.showDialogue(def.brief, 'Sana');
  G.hudMessage && G.hudMessage(`Mission started: ${def.title}`);
  playChime();
  updateBeaconForStage();
}

function updateBeaconForStage() {
  const t = currentTarget();
  if (t) setBeacon(t.x, t.z);
  else setBeacon(null, null);
}

// Re-point the beacon at the current stage's target (used by screenshots
// that jump a mission to a later stage).
export function refreshBeacon() {
  updateBeaconForStage();
}

function advanceStage() {
  G.mission.stage++;
  if (G.mission.stage >= G.mission.stages.length) {
    completeMission();
    return;
  }
  const stage = G.mission.stages[G.mission.stage];
  G.hudMessage && G.hudMessage(`Objective: ${stage.objective}`);
  playChime();
  updateBeaconForStage();
}

function completeMission() {
  const reward = REWARDS[G.missionIndex];
  G.money += reward;
  G.missionsDone.push(G.mission.id);
  G.hudMessage && G.hudMessage(`Mission complete: ${G.mission.title} — earned $${reward}!`);
  const debtLeft = Math.max(0, 2000 - G.missionsDone.reduce((s, _, i) => s + REWARDS[i], 0));
  G.showDialogue && G.showDialogue(`Sana: "Nice work, Kai. $${reward} is yours. Debt left: $${debtLeft}."`, 'Sana');
  playChime();
  G.mission = null;
  G.missionIndex++;
  if (passengerMesh) {
    G.scene.remove(passengerMesh);
    passengerMesh = null;
  }
  if (crateMesh) {
    G.scene.remove(crateMesh);
    crateMesh = null;
  }
  if (G.missionIndex >= MISSION_DEFS.length) {
    G.storyDone = true;
    G.showDialogue && G.showDialogue('Sana: "That is the last of it, Kai. Two grand, paid in full. Solara Bay is yours now."', 'Sana');
    G.onStoryDone && G.onStoryDone();
  } else {
    showSanaBeacon();
  }
  if (G.saveGame) G.saveGame();
}

function spawnPassenger(x, z) {
  const mesh = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 1.0, 0.4),
    new THREE.MeshLambertMaterial({ color: 0xe0c85a }),
  );
  body.position.y = 1.0;
  body.castShadow = true;
  mesh.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xe8b98a }),
  );
  head.position.y = 1.75;
  mesh.add(head);
  mesh.position.set(x, 0, z);
  G.scene.add(mesh);
  passengerMesh = mesh;
}

function spawnGuards(spots = [[-2, 128], [2, 132], [-2, 138], [2, 142]]) {
  for (const [x, z] of spots) {
    const mesh = makeGuardMesh();
    mesh.position.set(x, 0, z);
    G.scene.add(mesh);
    G.guards.push({
      mesh,
      pos: new THREE.Vector3(x, 0, z),
      health: 3,
      shootCooldown: 1 + Math.random(),
      heading: Math.PI,
    });
  }
}

function spawnCrate(x, z) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 1.2, 1.2),
    new THREE.MeshLambertMaterial({ color: 0x8a6a2a, emissive: 0x332200 }),
  );
  mesh.position.set(x, 0.6, z);
  mesh.castShadow = true;
  G.scene.add(mesh);
  crateMesh = mesh;
}

export function updateMissions(dt) {
  // Bob the beacon diamond.
  if (beacon && beacon.visible) {
    beacon.userData.diamond.position.y = 6 + Math.sin(G.time * 2) * 0.5;
    beacon.userData.diamond.rotation.y += dt;
  }
  if (passengerMesh) passengerMesh.rotation.y += dt * 0.5;
  if (crateMesh) {
    crateMesh.rotation.y += dt * 0.8;
    crateMesh.position.y = 0.6 + Math.sin(G.time * 2) * 0.15;
  }
  const player = G.player;
  if (!G.mission) return;
  const m = G.mission;
  const target = currentTarget();
  const dist = target ? Math.hypot(player.pos.x - target.x, player.pos.z - target.z) : Infinity;

  if (m.id === 'first-fare') {
    if (m.stage === 0) {
      if (player.inCar && player.car && player.car.driver === 'taxi') {
        spawnPassenger(-60, -19);
        advanceStage();
      }
    } else if (m.stage === 1) {
      if (player.inCar && dist < 6) {
        if (passengerMesh) {
          G.scene.remove(passengerMesh);
          passengerMesh = null;
        }
        G.hudMessage && G.hudMessage('Passenger aboard — drive to the Marina Hotel.');
        advanceStage();
      }
    } else if (m.stage === 2) {
      if (player.inCar && dist < 6) advanceStage();
    }
  } else if (m.id === 'bay-run') {
    if (dist < 4) advanceStage();
  } else if (m.id === 'hot-wheels') {
    if (m.stage === 0) {
      if (player.inCar && player.car && player.car.driver === 'sports') {
        G.wanted = Math.max(G.wanted, 260);
        G.lastCrimeAt = G.time;
        G.stars = 2;
        G.hudMessage && G.hudMessage('Stolen! Lose the cops — get to zero stars.');
        advanceStage();
      }
    } else if (m.stage === 1) {
      // Losing the cops means the heat cools off on its own — getting busted
      // clears the wanted level too, but that does not count.
      if (G.wanted <= 0 && G.stars === 0 && !G.wasBusted) advanceStage();
    }
  } else if (m.id === 'dock-deal') {
    if (m.stage === 0) {
      if (dist < 8) {
        spawnGuards();
        G.hudMessage && G.hudMessage("Vega's crew is here — take them down!");
        advanceStage();
      }
    } else if (m.stage === 1) {
      updateGuards(dt);
      const alive = G.guards.filter((g) => g.health > 0).length;
      if (alive === 0) {
        spawnCrate(0, 140);
        advanceStage();
      }
    } else if (m.stage === 2) {
      if (dist < 3) {
        G.hudMessage && G.hudMessage('Crate secured — get it back to Sana.');
        advanceStage();
      }
    } else if (m.stage === 3) {
      if (dist < 4) advanceStage();
    }
  } else if (m.id === 'sunset-score') {
    if (m.stage === 0) {
      if (dist < 8) {
        spawnGuards([[46, -56], [50, -64], [46, -68]]);
        G.hudMessage && G.hudMessage("Vega's crew is here — take them down!");
        advanceStage();
      }
    } else if (m.stage === 1) {
      updateGuards(dt);
      const alive = G.guards.filter((g) => g.health > 0).length;
      if (alive === 0) {
        spawnCrate(48, -60);
        advanceStage();
      }
    } else if (m.stage === 2) {
      if (dist < 3) {
        // Grabbing the case draws the heat: the drive back is the finale.
        addWanted(260);
        G.hudMessage && G.hudMessage('Case secured — the PD is on to you. Get it back to Sana.');
        advanceStage();
      }
    } else if (m.stage === 3) {
      if (dist < 4) advanceStage();
    }
  }
}

function updateGuards(dt) {
  const player = G.player;
  for (const guard of G.guards) {
    if (guard.health <= 0) continue;
    const dx = player.pos.x - guard.pos.x;
    const dz = player.pos.z - guard.pos.z;
    const dist = Math.hypot(dx, dz);
    guard.heading = Math.atan2(dx, dz);
    guard.mesh.rotation.y = guard.heading;
    guard.shootCooldown -= dt;
    if (dist < 24 && guard.shootCooldown <= 0) {
      guard.shootCooldown = 1.3;
      playGunshot();
      spawnTracer(guard.pos, player.pos);
      if (dist < 20 && Math.random() < 0.45) {
        // A guard shot lands. damagePlayer is wired onto G by main.js
        // (missions and police would otherwise import each other).
        G.damagePlayer && G.damagePlayer(6);
      }
    }
  }
}

// Solara Bay — the screenshot scenes behind ?shot=cover|foot|chase|beach.
// One clear job: stage a real, playable game state — the same functions a
// player would use (enter a car, start a mission, raise the wanted level) —
// so each screenshot is a true render of the game, not a mock-up.

import * as THREE from 'three';
import { G } from './state.js';
import { enterCar } from './player.js';
import { startMission, refreshBeacon } from './missions.js';
import { updatePolicePresence } from './police.js';

function setWanted(points) {
  G.wanted = points;
  G.lastCrimeAt = G.time;
  G.stars = [100, 250, 450, 650, 850].filter((t) => points >= t).length;
  updatePolicePresence();
}

// Pull the spawned police cars in close behind the player so the chase
// reads in the frame, but not so close they fill it. They sit just in
// front of the screenshot camera (12.5–13.5u back), low in the frame.
function bringPoliceClose(leadBack = 11) {
  const player = G.player;
  const fx = Math.sin(player.heading);
  const fz = Math.cos(player.heading);
  G.policeCars.forEach((car, i) => {
    const back = i === 0 ? leadBack : 11 + i * 6;
    const side = (i % 2 === 0 ? -1 : 1) * 3.5;
    car.pos.set(
      player.pos.x - fx * back + fz * side,
      0,
      player.pos.z - fz * back - fx * side,
    );
    car.heading = player.heading;
    car.speed = 14;
    car.mesh.position.set(car.pos.x, 0, car.pos.z);
    car.mesh.rotation.y = car.heading;
  });
}

function setCameraBehind(dist, height, side = 0) {
  const fx = Math.sin(G.player.heading);
  const fz = Math.cos(G.player.heading);
  // Right vector for the heading: (-cos, sin) in (x, z).
  const rx = -Math.cos(G.player.heading);
  const rz = Math.sin(G.player.heading);
  G.camYaw = G.player.heading;
  G.camera.position.set(
    G.player.pos.x - fx * dist + rx * side,
    height,
    G.player.pos.z - fz * dist + rz * side,
  );
  G.camera.lookAt(G.player.pos.x + fx * 5, 1.6, G.player.pos.z + fz * 5);
}

export function stageShot(name) {
  if (name === 'cover') {
    // City street, player driving, HUD + minimap + 3 stars + mission live.
    // Late-afternoon light and a side-angled chase cam, with traffic ahead.
    G.sun.color.setHex(0xffe3b0);
    G.sun.intensity = 2.2;
    G.scene.fog.color.setHex(0xd8e2ea);
    startMission(0);
    // Mission 1 stage 1: the taxi is the mission car; put the player in it.
    const taxi = G.cars.find((c) => c.driver === 'taxi');
    taxi.pos.set(0, 0, -2);
    taxi.heading = Math.PI / 2;
    taxi.mesh.position.set(0, 0, -2);
    taxi.mesh.rotation.y = Math.PI / 2;
    G.player.pos.set(0, 0, -2);
    enterCar(taxi);
    taxi.speed = 14;
    G.mission.stage = 1;
    refreshBeacon();
    setWanted(460);
    // The lead patrol sits 7u behind the taxi, just ahead of the cover
    // camera, so the chase reads in the frame.
    bringPoliceClose(7);
    // Two traffic cars ahead on the same road, driving east with the taxi.
    const ahead = G.traffic.slice(0, 2);
    ahead.forEach((car, i) => {
      car.pos.set(30 + i * 16, 0, i === 0 ? -2 : 2);
      car.heading = Math.PI / 2;
      car.aiAxis = 'x';
      car.aiDir = 1;
      car.mesh.position.copy(car.pos);
      car.mesh.rotation.y = car.heading;
    });
    setCameraBehind(13, 4.6, 1.5);
    // A clean cover frame: the mission brief and the "started" toast have
    // done their job by the time the screenshot is taken.
    const dialogue = document.getElementById('dialogue');
    if (dialogue) dialogue.style.display = 'none';
    const message = document.getElementById('message');
    if (message) message.style.opacity = '0';
  } else if (name === 'foot') {
    // On foot south of Coral Plaza, facing north toward Sana, the fountain
    // and the gold beacon — the beacon ahead, not wrapped around the camera.
    G.player.pos.set(12, 0, 20);
    G.player.heading = Math.PI;
    G.player.mesh.position.copy(G.player.pos);
    G.player.mesh.rotation.y = Math.PI;
    setCameraBehind(9, 3.8);
  } else if (name === 'chase') {
    // Coast-road police chase at 4 stars in the red sports car.
    const sports = G.cars.find((c) => c.driver === 'sports');
    sports.pos.set(-24, 0, 100);
    sports.heading = Math.PI / 2;
    sports.mesh.position.set(-24, 0, 100);
    sports.mesh.rotation.y = Math.PI / 2;
    G.player.pos.set(-24, 0, 100);
    enterCar(sports);
    sports.speed = 26;
    setWanted(700);
    bringPoliceClose(7);
    // Side-offset chase cam: the sports car stays centred while the patrol
    // reads behind it instead of filling the lens.
    setCameraBehind(13, 4.8, 5);
  } else if (name === 'beach') {
    // Sunset on the pier: dusk light, the player looking out to sea, palms
    // and the beach behind the camera, the pier planks in the foreground.
    G.scene.background = new THREE.Color(0xf2a65a);
    G.scene.fog.color.setHex(0xe8b07a);
    G.sun.color.setHex(0xffb36b);
    G.sun.intensity = 1.6;
    G.sun.position.set(-90, 35, 90);
    G.player.pos.set(0, 0, 132);
    G.player.heading = 0;
    G.player.mesh.position.copy(G.player.pos);
    G.player.mesh.rotation.y = 0;
    setCameraBehind(9, 3.6);
  } else {
    // Unknown shot name: the plaza, on foot.
    G.player.pos.set(12, 0, -2);
    G.player.heading = Math.PI;
    G.player.mesh.position.copy(G.player.pos);
    setCameraBehind(9, 3.8);
  }
  G.ready = true;
}

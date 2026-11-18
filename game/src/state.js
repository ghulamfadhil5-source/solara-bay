// Solara Bay — the one shared mutable game state.
// One clear job: every system reads and writes the same live state object,
// so main.js, police.js, missions.js and the HUD never drift apart.

export const G = {
  // Three.js core
  scene: null,
  camera: null,
  renderer: null,
  clock: null,
  sun: null,
  seaMesh: null,

  // Flow
  mode: 'menu', // menu | playing | paused | busted | gameover | storydone
  time: 0,
  timePlayed: 0,
  seed: 1,

  // Player
  player: null, // { mesh, pos, heading, speed, health, inCar, car, shooting }
  money: 50,
  wanted: 0, // wanted points, 0..1000
  stars: 0,
  lastCrimeAt: -999,
  hiddenTimer: 0,

  // World contents
  colliders: [], // { minX, maxX, minZ, maxZ }
  cars: [], // every drivable car { mesh, kind, color, pos, heading, speed, parked, stolen, police, driver }
  traffic: [], // AI traffic cars (subset of cars with ai=true)
  peds: [], // pedestrians { mesh, pos, heading, speed, state, target }
  policeCars: [],
  footCops: [],
  guards: [], // mission enemies
  pickups: [], // cash pickups { mesh, pos, value, taken }
  beacons: [], // 3D objective markers

  // Missions
  missionIndex: 0, // next mission to start
  mission: null, // active mission { id, title, stage, objective, target, timer, data }
  missionsDone: [],
  storyDone: false,

  // Camera / effects
  camYaw: 0,
  camPitch: 0.32,
  camDist: 9,
  shake: 0,

  // Input (filled by input.js)
  keys: {},
  mouseDown: false,

  // Debug / screenshot hooks
  ready: false,
  shotMode: null,
};

// Solara Bay — tuning constants and city layout.
// One clear job: every number the rest of the game balances against lives here.

export const CFG = {
  // City grid: roads run at these x/z coordinates, 24 units apart.
  roads: [-96, -72, -48, -24, 0, 24, 48, 72, 96],
  roadWidth: 8,
  cityHalf: 108, // drivable/walkable city edge
  beachZ: 108, // sand starts here
  seaZ: 126, // water starts here
  worldHalf: 220, // sea / sky extent

  // Player on foot
  walkSpeed: 6,
  runSpeed: 10,
  playerRadius: 0.9,
  playerHealth: 100,

  // Cars
  carAccel: 14,
  carBrake: 30,
  carReverseMax: 9,
  carTopSpeed: 34,
  carTurn: 1.9,
  carRadius: 1.9,
  taxiTopSpeed: 30,
  sportsTopSpeed: 42,

  // Traffic
  trafficCount: 14,
  trafficSpeedMin: 6,
  trafficSpeedMax: 10,
  pedCount: 26,
  pedSpeedMin: 1.1,
  pedSpeedMax: 2.1,

  // Wanted level
  wantedDecayPerSec: 5,
  wantedHiddenBonus: 6,
  crimeStealCar: 120,
  crimeHitPed: 80,
  crimeShoot: 35,
  starThresholds: [100, 250, 450, 650, 850],

  // Police
  policeRamDamage: 12,
  policePunchDamage: 8,
  bustHoldSeconds: 3,
  bustDistance: 5,

  // Combat
  gunRange: 34,
  gunCooldown: 0.22,
  gunDamage: 1,
  guardHealth: 3,
  guardShotDamage: 6,

  // Missions
  startMoney: 50,
  bustFine: 50,
  hospitalFee: 50,

  // Save
  saveKey: 'solara-bay-save-v1',
};

// Named places, all original. Used by missions, the HUD and the minimap.
export const PLACES = {
  plaza: { x: 12, z: 12, name: 'Coral Plaza' },
  hotel: { x: 60, z: -60, name: 'Marina Hotel' },
  pier: { x: 0, z: 118, name: 'Sunset Pier' },
  hospital: { x: -36, z: 36, name: 'Bay Clinic' },
  sportsCar: { x: -84, z: 84, name: 'Sunset Car Park' },
  market: { x: -60, z: -12, name: 'Palm Market' },
  surfShop: { x: 84, z: 60, name: 'Surf Shop' },
};

// Clear drive-out lanes for the parked cars (and the taxi): rectangles the
// city builder keeps free of buildings, so a stolen car can pull straight
// out without scraping a wall. axis 'x' = the car drives along x at a fixed
// z (from..to); axis 'z' = the car drives along z at a fixed x.
export const PARKING_STRIPS = [
  { axis: 'x', fixed: 18.5, from: 26, to: 108 },
  { axis: 'x', fixed: -18.5, from: -108, to: -26 },
  { axis: 'z', fixed: 53.5, from: 50, to: 108 },
  { axis: 'z', fixed: -53.5, from: -108, to: -50 },
  { axis: 'x', fixed: 77.5, from: -108, to: 74 },
  { axis: 'x', fixed: -77.5, from: -74, to: 108 },
  { axis: 'z', fixed: 18.5, from: -108, to: -74 },
  { axis: 'z', fixed: -18.5, from: 74, to: 108 },
  { axis: 'x', fixed: 6, from: 20, to: 108 }, // the taxi at Coral Plaza
  { axis: 'z', fixed: -82, from: 80, to: 108 }, // the red sports car
];

export const COLORS = {
  sky: 0x8ec9e8,
  fog: 0xbfd9e8,
  sea: 0x1f7fa8,
  sand: 0xe8d29a,
  grass: 0x7fae62,
  asphalt: 0x3a3f46,
  sidewalk: 0x9aa0a8,
  buildingPalette: [0xd8b48f, 0x9fb8c8, 0xc89a8a, 0xa8b8a0, 0xd0c8b8, 0x8fa8c0],
  carPalette: [0xd23b2e, 0x2e6fd2, 0xe8b820, 0x37a05a, 0xe8e8e8, 0x7a4fd0, 0x222831, 0xe07b2e],
  policeWhite: 0xf2f2f2,
  taxiYellow: 0xf2c200,
  sportsRed: 0xc01818,
};

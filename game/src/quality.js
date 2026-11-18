// Solara Bay — automatic quality scaling.
// One clear job: keep the game smooth on weak machines. It watches the real
// frame rate and steps the render quality down (never up, so it never
// oscillates) when the machine cannot keep up. ?fx=low starts one tier down.

import { G } from './state.js';

// Tier 0 high, 1 balanced, 2 low. Shadows and pixel ratio cost the most
// under software rendering; crowd density costs the least, so it goes last.
// Tier 2 also renders at 0.6x resolution: the scene is fragment-bound
// under SwiftShader (10k triangles at ~1fps even with the simulation off),
// so fewer fragments is the only lever that moves the needle there.
const TIERS = [
  { shadows: true, pixelRatioCap: 2, scale: 1, pedKeep: 1, trafficKeep: 1, fogFar: 340 },
  { shadows: false, pixelRatioCap: 1, scale: 1, pedKeep: 0.6, trafficKeep: 1, fogFar: 300 },
  { shadows: false, pixelRatioCap: 1, scale: 0.6, pedKeep: 0.35, trafficKeep: 0.6, fogFar: 240 },
];

const STEP_DOWN_FPS = 28; // below this average, step down one tier
const SAMPLE_MS = 4000; // measure each window this long (wall clock: the
// game loop's dt is capped, so game time runs slower than real time on a
// weak machine — fps is a real-time measure, so sample it in real time)

let sampleFrames = 0;
let sampleStart = 0;
let bootAt = 0;
let nextDecisionAt = SAMPLE_MS;

export function initQuality(lowFx) {
  G.qualityTier = lowFx ? 1 : 0;
  applyTier(G.qualityTier);
}

function applyTier(tier) {
  const t = TIERS[tier];
  const renderer = G.renderer;
  if (!renderer) return;
  // Toggling the sun's castShadow is enough to skip the shadow pass;
  // flipping renderer.shadowMap.enabled would force a material rebuild.
  if (G.sun) G.sun.castShadow = t.shadows;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, t.pixelRatioCap) * t.scale);
  if (G.scene && G.scene.fog) G.scene.fog.far = t.fogFar;
  const pedKeep = Math.floor(G.peds.length * t.pedKeep);
  G.peds.forEach((ped, i) => {
    ped.inactive = i >= pedKeep;
    ped.mesh.visible = !ped.inactive;
  });
  const trafficKeep = Math.floor(G.traffic.length * t.trafficKeep);
  G.traffic.forEach((car, i) => {
    car.inactive = i >= trafficKeep;
    car.mesh.visible = !car.inactive;
  });
  G.qualityTier = tier;
  window.__qualityTier = tier;
}

export function qualityTick() {
  const now = performance.now();
  if (!bootAt) {
    bootAt = now;
    sampleStart = now;
  }
  sampleFrames++;
  const windowMs = now - sampleStart;
  if (windowMs >= SAMPLE_MS) {
    G.qualityFps = sampleFrames / (windowMs / 1000);
    sampleFrames = 0;
    sampleStart = now;
  }
  if (now - bootAt >= nextDecisionAt) {
    nextDecisionAt += SAMPLE_MS;
    if (G.qualityFps > 0 && G.qualityFps < STEP_DOWN_FPS && G.qualityTier < TIERS.length - 1) {
      applyTier(G.qualityTier + 1);
    }
  }
}

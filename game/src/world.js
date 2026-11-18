// Solara Bay — the city itself: ground, sea, beach, roads, buildings,
// street props, billboards and the pier. One clear job: build every static
// piece of the world and record its collision boxes.

import * as THREE from 'three';
import { CFG, COLORS, PLACES, PARKING_STRIPS } from './config.js';
import { G } from './state.js';
import { makeRng, pick, range, rangeInt } from './random.js';

let seaTexture = null;

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildingTexture(rand) {
  const litRatio = 0.55;
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    const cols = 4;
    const rows = 9;
    const cw = w / cols;
    const rh = h / rows;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const lit = rand() < litRatio;
        g.fillStyle = lit ? '#ffe9a8' : '#2c3a4a';
        g.fillRect(x * cw + 5, y * rh + 7, cw - 10, rh - 14);
      }
    }
  });
}

function roadTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#3a3f46';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#f2d24b';
    g.fillRect(w / 2 - 3, 0, 6, 34);
    g.fillRect(w / 2 - 3, 64, 6, 34);
    g.fillStyle = '#e8e8e8';
    g.fillRect(4, 0, 3, h);
    g.fillRect(w - 7, 0, 3, h);
  });
}

function seaTextureMake() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#1f7fa8';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 3;
    for (let i = 0; i < 10; i++) {
      const y = i * 26 + 8;
      g.beginPath();
      for (let x = 0; x <= w; x += 16) {
        g.lineTo(x, y + Math.sin(x * 0.06 + i) * 4);
      }
      g.stroke();
    }
  });
}

function signTexture(text, bg, fg) {
  return canvasTexture(256, 96, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    g.font = 'bold 34px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2);
  });
}

function addCollider(minX, maxX, minZ, maxZ) {
  G.colliders.push({ minX, maxX, minZ, maxZ });
}

// Push a circle (x, z, radius) out of every building box it overlaps.
export function resolveCollision(x, z, radius) {
  for (const c of G.colliders) {
    const nx = Math.max(c.minX, Math.min(x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - nx;
    const dz = z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = (radius - d) / d;
        x += dx * push;
        z += dz * push;
      } else {
        // Circle centre inside the box: push out along the smallest axis.
        const left = x - c.minX;
        const right = c.maxX - x;
        const top = z - c.minZ;
        const bottom = c.maxZ - z;
        const m = Math.min(left, right, top, bottom);
        if (m === left) x = c.minX - radius;
        else if (m === right) x = c.maxX + radius;
        else if (m === top) z = c.minZ - radius;
        else z = c.maxZ + radius;
      }
    }
  }
  return { x, z };
}

export function clampToWorld(x, z) {
  return {
    x: Math.max(-CFG.cityHalf, Math.min(CFG.cityHalf, x)),
    z: Math.max(-CFG.cityHalf, Math.min(122, z)),
  };
}

export function buildWorld() {
  const rand = makeRng(G.seed);
  const scene = G.scene;

  // --- Sky, fog and light ---
  scene.background = new THREE.Color(COLORS.sky);
  scene.fog = new THREE.Fog(COLORS.fog, 130, 340);
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a7a5a, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d0, 2.4);
  sun.position.set(80, 120, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -130;
  sun.shadow.camera.right = 130;
  sun.shadow.camera.top = 130;
  sun.shadow.camera.bottom = -130;
  sun.shadow.camera.far = 400;
  scene.add(sun);
  G.sun = sun;

  // A visible sun disc in the south-west sky, so sunsets read as sunsets.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(16, 32),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, fog: false }),
  );
  sunDisc.position.set(-35, 42, 210);
  sunDisc.lookAt(0, 20, 0);
  scene.add(sunDisc);

  // --- Ground, sand and sea ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(460, 460),
    new THREE.MeshLambertMaterial({ color: COLORS.grass }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 40);
  ground.receiveShadow = true;
  scene.add(ground);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(240, 20),
    new THREE.MeshLambertMaterial({ color: COLORS.sand }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.03, 117);
  sand.receiveShadow = true;
  scene.add(sand);

  seaTexture = seaTextureMake();
  seaTexture.wrapS = THREE.RepeatWrapping;
  seaTexture.wrapT = THREE.RepeatWrapping;
  seaTexture.repeat.set(6, 3);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(460, 140),
    new THREE.MeshLambertMaterial({ map: seaTexture }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.06, 196);
  scene.add(sea);
  G.seaMesh = sea;

  // --- Sidewalks and roads ---
  const sidewalkMat = new THREE.MeshLambertMaterial({ color: COLORS.sidewalk });
  const roadTex = roadTexture();
  roadTex.wrapS = THREE.RepeatWrapping;
  roadTex.wrapT = THREE.RepeatWrapping;
  const roadMatX = new THREE.MeshLambertMaterial({ map: roadTex.clone() });
  roadMatX.map.repeat.set(9, 1);
  const roadMatZ = new THREE.MeshLambertMaterial({ map: roadTex.clone() });
  roadMatZ.map.repeat.set(1, 9); // Z roads: V runs along the road length
  const cityLen = 216;
  for (const r of CFG.roads) {
    const swX = new THREE.Mesh(new THREE.PlaneGeometry(cityLen, CFG.roadWidth + 4), sidewalkMat);
    swX.rotation.x = -Math.PI / 2;
    swX.position.set(0, 0.015, r);
    swX.receiveShadow = true;
    scene.add(swX);
    const rdX = new THREE.Mesh(new THREE.PlaneGeometry(cityLen, CFG.roadWidth), roadMatX);
    rdX.rotation.x = -Math.PI / 2;
    rdX.position.set(0, 0.03, r);
    rdX.receiveShadow = true;
    scene.add(rdX);
    const swZ = new THREE.Mesh(new THREE.PlaneGeometry(CFG.roadWidth + 4, cityLen), sidewalkMat);
    swZ.rotation.x = -Math.PI / 2;
    swZ.position.set(r, 0.015, 0);
    swZ.receiveShadow = true;
    scene.add(swZ);
    const rdZ = new THREE.Mesh(new THREE.PlaneGeometry(CFG.roadWidth, cityLen), roadMatZ);
    rdZ.rotation.x = -Math.PI / 2;
    rdZ.position.set(r, 0.03, 0);
    rdZ.receiveShadow = true;
    scene.add(rdZ);
  }
  // Coast road along the beach.
  const coast = new THREE.Mesh(new THREE.PlaneGeometry(cityLen, CFG.roadWidth), roadMatX);
  coast.rotation.x = -Math.PI / 2;
  coast.position.set(0, 0.03, 106);
  scene.add(coast);

  // --- Buildings ---
  const blockCenters = [];
  for (let i = 0; i < CFG.roads.length - 1; i++) {
    blockCenters.push((CFG.roads[i] + CFG.roads[i + 1]) / 2);
  }
  const texVariants = [buildingTexture(rand), buildingTexture(rand), buildingTexture(rand)];
  const specialBlocks = new Set([
    '12,12', // Coral Plaza (mission giver)
    '-12,12', // park
    '-36,36', // Bay Clinic
    '-60,-12', // Palm Market
    '84,60', // Surf Shop
  ]);
  for (const bx of blockCenters) {
    for (const bz of blockCenters) {
      if (specialBlocks.has(`${bx},${bz}`)) continue;
      // Buildings sit on fixed quadrant slots inside the block so neighbours
      // never intersect each other.
      const count = rangeInt(rand, 1, 3);
      const slots = [[-4, -4], [4, -4], [-4, 4], [4, 4]];
      for (let i = slots.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [slots[i], slots[j]] = [slots[j], slots[i]];
      }
      const chosen = slots.slice(0, count);
      for (const [sx, sz] of chosen) {
        const w = range(rand, 6, 7.5);
        const d = range(rand, 6, 7.5);
        const dist = Math.hypot(bx, bz);
        const h = range(rand, 7, 12) + Math.max(0, (1 - dist / 130)) * 20;
        const x = bx + sx;
        const z = bz + sz;
        // Keep the parked cars' drive-out lanes clear of buildings.
        let blocked = false;
        for (const s of PARKING_STRIPS) {
          if (s.axis === 'x') {
            if (z + d / 2 > s.fixed - 1.9 && z - d / 2 < s.fixed + 1.9 && x + w / 2 > s.from && x - w / 2 < s.to) blocked = true;
          } else if (x + w / 2 > s.fixed - 1.9 && x - w / 2 < s.fixed + 1.9 && z + d / 2 > s.from && z - d / 2 < s.to) blocked = true;
          if (blocked) break;
        }
        if (blocked) continue;
        const color = pick(rand, COLORS.buildingPalette);
        const mat = new THREE.MeshLambertMaterial({
          map: pick(rand, texVariants),
          color,
        });
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        b.position.set(x, h / 2, z);
        b.castShadow = true;
        b.receiveShadow = true;
        scene.add(b);
        // Rooftop lip.
        const lip = new THREE.Mesh(
          new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6),
          new THREE.MeshLambertMaterial({ color: 0x4a4a52 }),
        );
        lip.position.set(x, h + 0.25, z);
        scene.add(lip);
        addCollider(x - w / 2, x + w / 2, z - d / 2, z + d / 2);
      }
    }
  }

  // --- Special buildings: clinic, market, surf shop ---
  function specialBuilding(x, z, w, h, d, color, signText, signBg) {
    const mat = new THREE.MeshLambertMaterial({ color });
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    b.position.set(x, h / 2, z);
    b.castShadow = true;
    b.receiveShadow = true;
    scene.add(b);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.9, 2.2),
      new THREE.MeshBasicMaterial({ map: signTexture(signText, signBg, '#ffffff') }),
    );
    sign.position.set(x, h - 1.4, z + d / 2 + 0.1);
    scene.add(sign);
    addCollider(x - w / 2, x + w / 2, z - d / 2, z + d / 2);
    return b;
  }
  specialBuilding(PLACES.hospital.x, PLACES.hospital.z, 16, 9, 12, 0xf2f2ee, 'BAY CLINIC', '#c0392b');
  specialBuilding(PLACES.market.x, PLACES.market.z, 15, 7, 11, 0xe8c98a, 'PALM MARKET', '#2e7d32');
  specialBuilding(PLACES.surfShop.x, PLACES.surfShop.z, 13, 7, 10, 0x7fb8d8, 'SURF SHOP', '#1565c0');

  // --- Coral Plaza: tiled square, fountain, benches ---
  const plaza = new THREE.Mesh(
    new THREE.CircleGeometry(9, 24),
    new THREE.MeshLambertMaterial({ color: 0xd8cdb8 }),
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(PLACES.plaza.x, 0.05, PLACES.plaza.z);
  plaza.receiveShadow = true;
  scene.add(plaza);
  const fountainBase = new THREE.Mesh(
    new THREE.CylinderGeometry(3, 3.4, 0.8, 20),
    new THREE.MeshLambertMaterial({ color: 0x9aa0a8 }),
  );
  fountainBase.position.set(PLACES.plaza.x, 0.4, PLACES.plaza.z);
  fountainBase.castShadow = true;
  scene.add(fountainBase);
  const fountainWater = new THREE.Mesh(
    new THREE.CircleGeometry(2.6, 20),
    new THREE.MeshLambertMaterial({ color: 0x2f9fd8 }),
  );
  fountainWater.rotation.x = -Math.PI / 2;
  fountainWater.position.set(PLACES.plaza.x, 0.82, PLACES.plaza.z);
  scene.add(fountainWater);
  addCollider(PLACES.plaza.x - 3.4, PLACES.plaza.x + 3.4, PLACES.plaza.z - 3.4, PLACES.plaza.z + 3.4);

  // --- Park: palms ---
  for (let i = 0; i < 5; i++) {
    makePalm(scene, -12 + range(rand, -7, 7), 12 + range(rand, -7, 7), rand);
  }

  // --- Beach palms ---
  for (let x = -100; x <= 100; x += 14) {
    if (Math.abs(x) < 8) continue; // keep the pier clear
    makePalm(scene, x + range(rand, -3, 3), 112 + range(rand, 0, 8), rand);
  }

  // --- Streetlights at every other intersection ---
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2a2f36 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const rx of CFG.roads) {
    for (const rz of CFG.roads) {
      if ((rx + rz) % 48 !== 0) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 8), poleMat);
      pole.position.set(rx + 5, 3, rz + 5);
      pole.castShadow = true;
      scene.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), lampMat);
      lamp.position.set(rx + 5, 6.1, rz + 5);
      scene.add(lamp);
    }
  }

  // --- Billboards (original art, original names) ---
  function billboard(x, z, ry, text, bg) {
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(12, 4.5, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x222831 }),
    );
    board.position.set(x, 14, z);
    board.rotation.y = ry;
    board.castShadow = true;
    scene.add(board);
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(11.4, 4),
      new THREE.MeshBasicMaterial({ map: signTexture(text, bg, '#ffffff') }),
    );
    face.position.set(x, 14, z);
    face.rotation.y = ry;
    face.translateZ(0.3);
    scene.add(face);
  }
  billboard(-24, -47, 0, 'SOLARA BAY', '#0e7490');
  billboard(48, 25, Math.PI / 2, 'BAY TACOS', '#b45309');
  billboard(24, -71, Math.PI, 'SURF & SUN', '#1d4ed8');

  // --- Sunset Pier (mission 4) ---
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6a45 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(7, 0.6, 26), pierMat);
  pier.position.set(PLACES.pier.x, 0.5, 132);
  pier.castShadow = true;
  pier.receiveShadow = true;
  scene.add(pier);
  for (let z = 122; z <= 144; z += 6) {
    for (const dx of [-3, 3]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 1.6, 8), pierMat);
      post.position.set(PLACES.pier.x + dx, 0.2, z);
      scene.add(post);
    }
  }

  // --- Cash pickups scattered on sidewalks ---
  spawnCashPickups(rand);
}

function makePalm(scene, x, z, rand) {
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.35, 5.5, 8),
    new THREE.MeshLambertMaterial({ color: 0x8a6a45 }),
  );
  trunk.position.set(x, 2.75, z);
  trunk.rotation.z = range(rand, -0.08, 0.08);
  trunk.castShadow = true;
  scene.add(trunk);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3d8a4a });
  for (let i = 0; i < 5; i++) {
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 0.9), leafMat);
    leaf.position.set(x, 5.6, z);
    leaf.rotation.y = (i / 5) * Math.PI * 2;
    leaf.rotation.z = 0.5;
    leaf.translateX(1.2);
    scene.add(leaf);
  }
}

function spawnCashPickups(rand) {
  const scene = G.scene;
  const geo = new THREE.BoxGeometry(0.9, 0.9, 0.25);
  const mat = new THREE.MeshLambertMaterial({ color: 0x2fae4e, emissive: 0x1a5c2e });
  for (let i = 0; i < 12; i++) {
    const rx = pick(rand, CFG.roads) + (rand() < 0.5 ? -6 : 6);
    const rz = pick(rand, CFG.roads) + (rand() < 0.5 ? -6 : 6);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(rx, 1, rz);
    mesh.rotation.y = rand() * Math.PI;
    scene.add(mesh);
    G.pickups.push({ mesh, pos: new THREE.Vector3(rx, 1, rz), value: 10 + Math.floor(rand() * 3) * 5, taken: false });
  }
}

export function animateSea(dt) {
  if (seaTexture) seaTexture.offset.y += dt * 0.02;
}

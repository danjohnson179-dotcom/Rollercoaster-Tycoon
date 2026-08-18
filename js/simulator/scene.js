import * as THREE from '../../vendor/three/three.module.min.js';

const UP = new THREE.Vector3(0, 1, 0);
const DEG = Math.PI / 180;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function canvasTexture(width, height, painter) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  painter(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

function seededNoise(index) {
  return ((Math.sin(index * 97.31) * 43758.5453) % 1 + 1) % 1;
}

export class RideScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8997a0);
    this.scene.fog = new THREE.Fog(0x87949a, 36, 102);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.camera = new THREE.PerspectiveCamera(39, 1, 0.1, 160);
    this.cameraViews = {
      operator: { position: [18.5, 10.5, 23.5], target: [0, 7.2, 0] },
      wide: { position: [25, 17.5, 31], target: [0, 7.1, 0] },
      platform: { position: [0, 7.4, 20], target: [0, 7.0, 0] }
    };
    this.camera.position.fromArray(this.cameraViews.operator.position);
    this.cameraTarget = new THREE.Vector3(...this.cameraViews.operator.target);
    this.desiredCamera = this.camera.position.clone();
    this.desiredTarget = this.cameraTarget.clone();

    this.materials = this.createMaterials();
    this.armPivots = [];
    this.riders = [];
    this.restraintFrames = [];
    this.queueGuests = [];
    this.platformGates = [];
    this.waterJets = [];
    this.beacons = [];
    this.brakeCalipers = [];
    this.armAngle = 0;
    this.gondolaAngle = 0;
    this.pivotY = 11.55;
    this.armRadius = 6.45;
    this.counterweightRadius = 3.25;
    this.towerX = 7.15;

    this.buildEnvironment();
    this.buildRide();
    this.buildGuestOperation();
    this.buildLighting();
    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement);
  }

  createMaterials() {
    const concreteTexture = canvasTexture(256, 256, (ctx, width, height) => {
      ctx.fillStyle = '#777c7b';
      ctx.fillRect(0, 0, width, height);
      for (let i = 0; i < 2400; i += 1) {
        const value = 75 + Math.floor(seededNoise(i) * 75);
        ctx.fillStyle = `rgba(${value},${value + 3},${value + 2},${0.04 + seededNoise(i + 9) * 0.11})`;
        ctx.fillRect(seededNoise(i + 1) * width, seededNoise(i + 2) * height, 1.5, 1.5);
      }
      ctx.strokeStyle = '#565b5a';
      ctx.globalAlpha = 0.22;
      for (let y = 42; y < height; y += 54) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y + seededNoise(y) * 3);
        ctx.stroke();
      }
    });
    concreteTexture.repeat.set(5, 3);

    const steelTexture = canvasTexture(256, 256, (ctx, width, height) => {
      const gradient = ctx.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, '#383d3e');
      gradient.addColorStop(0.35, '#838889');
      gradient.addColorStop(0.58, '#4e5354');
      gradient.addColorStop(1, '#252a2b');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      for (let i = 0; i < 75; i += 1) {
        ctx.strokeStyle = `rgba(15,18,18,${0.03 + seededNoise(i) * 0.07})`;
        const x = seededNoise(i + 3) * width;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + seededNoise(i + 4) * 8, height);
        ctx.stroke();
      }
    });

    return {
      concrete: new THREE.MeshStandardMaterial({ map: concreteTexture, color: 0xa2a5a2, roughness: 0.96, metalness: 0.02 }),
      wetConcrete: new THREE.MeshStandardMaterial({ map: concreteTexture, color: 0x737b79, roughness: 0.48, metalness: 0.03 }),
      galvanised: new THREE.MeshStandardMaterial({ map: steelTexture, color: 0xb2b8b8, roughness: 0.32, metalness: 0.82 }),
      armSteel: new THREE.MeshStandardMaterial({ map: steelTexture, color: 0x8e9594, roughness: 0.27, metalness: 0.88 }),
      darkSteel: new THREE.MeshStandardMaterial({ color: 0x20282a, roughness: 0.3, metalness: 0.86 }),
      black: new THREE.MeshStandardMaterial({ color: 0x090e0f, roughness: 0.28, metalness: 0.78 }),
      rubber: new THREE.MeshStandardMaterial({ color: 0x080a0a, roughness: 0.82, metalness: 0.02 }),
      toxicGreen: new THREE.MeshStandardMaterial({ color: 0x9dc821, emissive: 0x273c00, emissiveIntensity: 0.3, roughness: 0.36, metalness: 0.58 }),
      brightLime: new THREE.MeshStandardMaterial({ color: 0xd7ff28, emissive: 0x6b8c00, emissiveIntensity: 0.72, roughness: 0.3, metalness: 0.3 }),
      safetyYellow: new THREE.MeshStandardMaterial({ color: 0xf0c51a, roughness: 0.43, metalness: 0.28 }),
      rust: new THREE.MeshStandardMaterial({ color: 0x604839, roughness: 0.82, metalness: 0.35 }),
      seat: new THREE.MeshStandardMaterial({ color: 0x172123, roughness: 0.48, metalness: 0.34 }),
      seatPad: new THREE.MeshStandardMaterial({ color: 0x0d1213, roughness: 0.78, metalness: 0.02 }),
      glass: new THREE.MeshPhysicalMaterial({ color: 0x85ac77, roughness: 0.11, metalness: 0.05, transparent: true, opacity: 0.56, transmission: 0.2 }),
      water: new THREE.MeshPhysicalMaterial({ color: 0xb8efff, emissive: 0x2b786c, emissiveIntensity: 0.35, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.64, depthWrite: false }),
      splash: new THREE.MeshPhysicalMaterial({ color: 0xd9ffff, emissive: 0x327973, emissiveIntensity: 0.2, roughness: 0.04, transparent: true, opacity: 0.34, depthWrite: false }),
      fence: new THREE.MeshStandardMaterial({ color: 0x2e3738, roughness: 0.33, metalness: 0.9 }),
      forest: new THREE.MeshStandardMaterial({ color: 0x172c25, roughness: 0.93, metalness: 0 }),
      forestDark: new THREE.MeshStandardMaterial({ color: 0x0c1c19, roughness: 0.96, metalness: 0 })
    };
  }

  mesh(geometry, material, parent = this.scene, shadows = true) {
    const object = new THREE.Mesh(geometry, material);
    object.castShadow = shadows;
    object.receiveShadow = shadows;
    parent.add(object);
    return object;
  }

  box(size, position, material, parent = this.scene) {
    const object = this.mesh(new THREE.BoxGeometry(...size), material, parent);
    object.position.set(...position);
    return object;
  }

  cylinder(radius, length, position, material, parent = this.scene, segments = 24) {
    const object = this.mesh(new THREE.CylinderGeometry(radius, radius, length, segments), material, parent);
    object.position.set(...position);
    return object;
  }

  beamBetween(startArray, endArray, radius, material, parent = this.scene, square = false) {
    const start = new THREE.Vector3(...startArray);
    const end = new THREE.Vector3(...endArray);
    const delta = end.clone().sub(start);
    const geometry = square
      ? new THREE.BoxGeometry(radius * 2, delta.length(), radius * 2)
      : new THREE.CylinderGeometry(radius, radius, delta.length(), 12);
    const beam = this.mesh(geometry, material, parent);
    beam.position.copy(start).add(end).multiplyScalar(0.5);
    beam.quaternion.setFromUnitVectors(UP, delta.normalize());
    return beam;
  }

  railLine(start, end, y, parent = this.scene) {
    const [x1, z1] = start;
    const [x2, z2] = end;
    const length = Math.hypot(x2 - x1, z2 - z1);
    const posts = Math.max(2, Math.ceil(length / 1.35));
    for (let i = 0; i <= posts; i += 1) {
      const t = i / posts;
      const x = THREE.MathUtils.lerp(x1, x2, t);
      const z = THREE.MathUtils.lerp(z1, z2, t);
      this.box([0.075, 1.28, 0.075], [x, y + 0.64, z], this.materials.fence, parent);
    }
    this.beamBetween([x1, y + 1.17, z1], [x2, y + 1.17, z2], 0.055, this.materials.fence, parent);
    this.beamBetween([x1, y + 0.55, z1], [x2, y + 0.55, z2], 0.037, this.materials.fence, parent);
  }

  buildEnvironment() {
    const skyTexture = canvasTexture(16, 512, (ctx, width, height) => {
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, '#44545f');
      gradient.addColorStop(0.43, '#8b999f');
      gradient.addColorStop(0.7, '#c4c8c4');
      gradient.addColorStop(1, '#697772');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    });
    skyTexture.wrapS = THREE.ClampToEdgeWrapping;
    skyTexture.wrapT = THREE.ClampToEdgeWrapping;
    const sky = this.mesh(
      new THREE.SphereGeometry(115, 32, 18),
      new THREE.MeshBasicMaterial({ map: skyTexture, side: THREE.BackSide, fog: false }),
      this.scene,
      false
    );
    sky.rotation.y = Math.PI * 0.35;

    const ground = this.mesh(
      new THREE.PlaneGeometry(180, 180),
      new THREE.MeshStandardMaterial({ color: 0x3f4c47, roughness: 0.92, metalness: 0.01 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;

    // Layered conifer silhouettes give the outdoor Forbidden Valley setting depth.
    for (let i = 0; i < 54; i += 1) {
      const angle = (i / 54) * Math.PI * 2;
      const distance = 38 + seededNoise(i + 2) * 25;
      const x = Math.cos(angle) * distance;
      const z = Math.sin(angle) * distance - 7;
      const height = 7 + seededNoise(i + 7) * 9;
      const tree = new THREE.Group();
      tree.position.set(x, 0, z);
      this.scene.add(tree);
      this.cylinder(0.22, height * 0.62, [0, height * 0.31, 0], this.materials.rust, tree, 8);
      for (let layer = 0; layer < 4; layer += 1) {
        const radius = height * (0.25 - layer * 0.038);
        const cone = this.mesh(
          new THREE.ConeGeometry(radius, height * 0.42, 9),
          i % 3 ? this.materials.forest : this.materials.forestDark,
          tree
        );
        cone.position.y = height * (0.42 + layer * 0.13);
      }
    }

    // Broken concrete service apron and drainage channels.
    const apron = this.mesh(new THREE.PlaneGeometry(43, 34), this.materials.wetConcrete);
    apron.rotation.x = -Math.PI / 2;
    apron.position.y = 0.018;
    for (let z = -14; z <= 14; z += 4) {
      this.box([42, 0.035, 0.04], [0, 0.04, z], this.materials.darkSteel);
    }
    for (let x = -18; x <= 18; x += 4.5) {
      this.box([0.04, 0.035, 32], [x, 0.04, 0], this.materials.darkSteel);
    }
  }

  buildRide() {
    this.ride = new THREE.Group();
    this.scene.add(this.ride);
    this.buildElevatedPlatform();
    this.buildSupports();
    this.buildGondola();
    this.buildWaterSystem();
    this.buildSilosAndBooth();
    this.buildSignage();
    this.setArmPosition(0);
  }

  buildElevatedPlatform() {
    const deckY = 3.45;
    this.deckY = deckY;

    // Elevated concrete structure with a walk-through tunnel beneath the ride.
    this.box([21.8, 3.3, 3.2], [0, 1.65, -3.3], this.materials.concrete, this.ride);
    this.box([21.8, 3.3, 3.2], [0, 1.65, 3.3], this.materials.concrete, this.ride);
    this.box([3.1, 3.3, 3.6], [-9.35, 1.65, 0], this.materials.concrete, this.ride);
    this.box([3.1, 3.3, 3.6], [9.35, 1.65, 0], this.materials.concrete, this.ride);
    this.box([15.6, 0.65, 7.4], [0, 3.14, 0], this.materials.darkSteel, this.ride);
    this.box([5.2, 0.08, 5.2], [0, 0.06, 0], this.materials.black, this.ride);

    const tunnelBack = this.box([5.5, 2.8, 0.2], [0, 1.38, -1.74], this.materials.black, this.ride);
    tunnelBack.material = this.materials.black;
    for (const x of [-2.85, 2.85]) {
      this.box([0.24, 3.1, 3.5], [x, 1.55, 0], this.materials.darkSteel, this.ride);
    }
    this.box([6.0, 0.25, 3.65], [0, 3.13, 0], this.materials.darkSteel, this.ride);

    // Water catchment troughs on both sides of the suspended gondola.
    for (const z of [-2.15, 2.15]) {
      this.box([15.3, 0.38, 1.58], [0, deckY + 0.02, z], this.materials.black, this.ride);
      const water = this.box([14.65, 0.045, 1.14], [0, deckY + 0.235, z], this.materials.water, this.ride);
      water.material = this.materials.water;
      this.box([15.5, 0.65, 0.17], [0, deckY + 0.36, z + Math.sign(z) * 0.8], this.materials.galvanised, this.ride);
    }

    // Front splash-hazard fascia.
    const warningTexture = this.createWarningTexture();
    const warning = this.mesh(
      new THREE.PlaneGeometry(14.8, 0.7),
      new THREE.MeshStandardMaterial({ map: warningTexture, emissiveMap: warningTexture, emissive: 0x2a3100, emissiveIntensity: 0.25 }),
      this.ride
    );
    warning.position.set(0, deckY + 0.28, 3.99);

    // Symmetrical access stairs and upper walkways.
    for (const side of [-1, 1]) {
      const xStart = side * 11.7;
      for (let step = 0; step < 10; step += 1) {
        this.box([1.9, 0.2, 0.72], [xStart - side * step * 0.42, 0.18 + step * 0.34, 5.2 - step * 0.12], this.materials.galvanised, this.ride);
      }
      this.box([3.2, 0.26, 2.05], [side * 7.65, deckY + 0.1, 4.15], this.materials.galvanised, this.ride);
      this.railLine([side * 11.95, 5.55], [side * 7.0, 4.4], 0.45, this.ride);
      this.railLine([side * 8.9, 5.15], [side * 6.15, 5.15], deckY + 0.2, this.ride);
    }
  }

  createWarningTexture() {
    return canvasTexture(1536, 96, (ctx, width, height) => {
      ctx.fillStyle = '#b8d424';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#111718';
      for (let x = -height; x < width + height; x += 92) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 42, 0);
        ctx.lineTo(x + height, height);
        ctx.lineTo(x + height - 42, height);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(8,12,13,.91)';
      ctx.fillRect(270, 11, width - 540, height - 22);
      ctx.fillStyle = '#dcff31';
      ctx.font = '900 42px Arial Narrow, Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('OVERHEAD  SPLASH  HAZARD', width / 2, height / 2 + 2);
    });
  }

  buildSupports() {
    for (const side of [-1, 1]) {
      const x = side * this.towerX;
      const support = new THREE.Group();
      this.ride.add(support);

      // Wide inclined HUSS-style support structure and substantial foundation blocks.
      this.box([3.1, 0.75, 4.2], [x, 3.75, 0], this.materials.concrete, support);
      this.box([2.45, 0.36, 3.3], [x, 4.26, 0], this.materials.darkSteel, support);
      this.beamBetween([x - side * 1.2, 4.3, -1.1], [x, this.pivotY, -0.74], 0.58, this.materials.armSteel, support, true);
      this.beamBetween([x - side * 1.2, 4.3, 1.1], [x, this.pivotY, 0.74], 0.58, this.materials.armSteel, support, true);
      this.beamBetween([x + side * 1.15, 4.3, -1.0], [x, this.pivotY, -0.62], 0.42, this.materials.darkSteel, support, true);
      this.beamBetween([x + side * 1.15, 4.3, 1.0], [x, this.pivotY, 0.62], 0.42, this.materials.darkSteel, support, true);
      this.box([2.65, 1.8, 2.65], [x, this.pivotY, 0], this.materials.darkSteel, support);

      const driveDrum = this.cylinder(1.43, 1.18, [x, this.pivotY, 0], this.materials.black, support, 40);
      driveDrum.rotation.z = Math.PI / 2;
      const ring = this.mesh(new THREE.TorusGeometry(1.44, 0.16, 12, 48), this.materials.toxicGreen, support);
      ring.position.set(x, this.pivotY, side * 0.62);
      ring.rotation.y = Math.PI / 2;
      for (let bolt = 0; bolt < 12; bolt += 1) {
        const angle = bolt / 12 * Math.PI * 2;
        const fastener = this.cylinder(0.075, 0.12, [x, this.pivotY + Math.cos(angle) * 1.1, side * 0.73 + Math.sin(angle) * 1.1], this.materials.galvanised, support, 8);
        fastener.rotation.z = Math.PI / 2;
      }

      const pivot = new THREE.Group();
      pivot.position.set(x, this.pivotY, 0);
      support.add(pivot);
      this.buildTaperedArm(pivot, side);
      this.armPivots.push(pivot);

      const beaconBase = this.cylinder(0.34, 0.18, [x, this.pivotY + 2.0, 0], this.materials.black, support);
      const beaconMaterial = new THREE.MeshStandardMaterial({ color: 0xff6a20, emissive: 0xff2100, emissiveIntensity: 2.5 });
      const beacon = this.mesh(new THREE.SphereGeometry(0.23, 14, 9), beaconMaterial, support);
      beacon.position.set(x, this.pivotY + 2.22, 0);
      this.beacons.push(beacon);
    }

    this.counterweightShaft = this.cylinder(0.42, this.towerX * 2, [0, this.pivotY + this.counterweightRadius, 0], this.materials.darkSteel, this.ride, 32);
    this.counterweightShaft.rotation.z = Math.PI / 2;
  }

  buildTaperedArm(pivot, side) {
    const segments = 8;
    const segmentLength = this.armRadius / segments;
    for (let index = 0; index < segments; index += 1) {
      const t = index / (segments - 1);
      const width = THREE.MathUtils.lerp(1.18, 0.64, t);
      const beam = this.box([width, segmentLength + 0.055, 0.9], [0, -(index + 0.5) * segmentLength, 0], this.materials.armSteel, pivot);
      beam.rotation.z = side * 0.014 * Math.sin(t * Math.PI);
      if (index > 0 && index < segments - 1) {
        const inset = this.box([width * 0.48, segmentLength * 0.56, 0.925], [0, -(index + 0.5) * segmentLength, 0], this.materials.darkSteel, pivot);
        inset.position.x = side * width * 0.05;
      }
      if (index % 2 === 1) {
        const chevron = this.box([width * 0.55, 0.17, 0.95], [0, -(index + 0.56) * segmentLength, 0], this.materials.brightLime, pivot);
        chevron.rotation.z = side * 0.38;
      }
    }

    const endHousing = this.cylinder(0.98, 1.15, [0, -this.armRadius, 0], this.materials.black, pivot, 36);
    endHousing.rotation.z = Math.PI / 2;
    const brakeDisc = this.cylinder(0.77, 0.11, [side * 0.2, -this.armRadius, 0], this.materials.galvanised, pivot, 40);
    brakeDisc.rotation.z = Math.PI / 2;
    const caliper = this.box([0.38, 0.5, 0.92], [side * 0.27, -this.armRadius + 0.69, 0], this.materials.safetyYellow, pivot);
    this.brakeCalipers.push(caliper);

    // Opposing upper arm and the large circular counterweight unique to the real mechanism.
    for (let index = 0; index < 4; index += 1) {
      const t = index / 3;
      const width = THREE.MathUtils.lerp(1.08, 0.78, t);
      this.box([width, this.counterweightRadius / 4 + 0.05, 0.95], [0, (index + 0.5) * this.counterweightRadius / 4], this.materials.armSteel, pivot);
    }
    const weight = this.cylinder(1.32, 1.05, [0, this.counterweightRadius, 0], this.materials.darkSteel, pivot, 40);
    weight.rotation.z = Math.PI / 2;
    const weightFace = this.cylinder(1.02, 1.1, [0, this.counterweightRadius, 0], this.materials.black, pivot, 40);
    weightFace.rotation.z = Math.PI / 2;
    const weightRing = this.mesh(new THREE.TorusGeometry(1.15, 0.12, 10, 40), this.materials.toxicGreen, pivot);
    weightRing.position.set(side * 0.56, this.counterweightRadius, 0);
    weightRing.rotation.y = Math.PI / 2;
  }

  buildGondola() {
    this.gondola = new THREE.Group();
    this.ride.add(this.gondola);
    this.box([13.9, 0.78, 2.72], [0, 0, 0], this.materials.toxicGreen, this.gondola);
    this.box([12.9, 0.38, 3.18], [0, -0.46, 0], this.materials.darkSteel, this.gondola);
    this.box([12.4, 0.16, 2.96], [0, -0.72, 0], this.materials.brightLime, this.gondola);

    for (const side of [-1, 1]) {
      const bearing = this.cylinder(1.05, 0.86, [side * this.towerX, 0, 0], this.materials.darkSteel, this.gondola, 40);
      bearing.rotation.z = Math.PI / 2;
      const hub = this.cylinder(0.68, 0.92, [side * this.towerX, 0, 0], this.materials.galvanised, this.gondola, 36);
      hub.rotation.z = Math.PI / 2;
      const ring = this.mesh(new THREE.TorusGeometry(0.8, 0.11, 10, 36), this.materials.brightLime, this.gondola);
      ring.position.set(side * (this.towerX + 0.47), 0, 0);
      ring.rotation.y = Math.PI / 2;
    }

    const riderColours = [0x3f5967, 0x7d5140, 0x576e4f, 0x8c7a3e, 0x584d72, 0x9a5d58, 0x3f6b69];
    const skinColours = [0xe6b98a, 0xb47752, 0x7a4c35, 0xf0c8a0];
    for (const row of [-1, 1]) {
      for (let index = 0; index < 19; index += 1) {
        const seat = new THREE.Group();
        seat.position.set(-5.65 + index * 0.628, 0.08, row * 0.88);
        seat.rotation.y = row < 0 ? Math.PI : 0;
        this.gondola.add(seat);

        this.box([0.51, 0.2, 0.73], [0, -0.13, 0.02], this.materials.seatPad, seat);
        this.box([0.52, 1.16, 0.2], [0, 0.5, -0.3], this.materials.seat, seat);
        this.box([0.4, 0.29, 0.27], [0, 1.03, -0.26], this.materials.seatPad, seat);
        this.box([0.07, 0.82, 0.1], [-0.25, 0.25, 0], this.materials.galvanised, seat);
        this.box([0.07, 0.82, 0.1], [0.25, 0.25, 0], this.materials.galvanised, seat);

        const rider = new THREE.Group();
        seat.add(rider);
        const shirt = new THREE.MeshStandardMaterial({ color: riderColours[(index + (row > 0 ? 3 : 0)) % riderColours.length], roughness: 0.78 });
        const skin = new THREE.MeshStandardMaterial({ color: skinColours[index % skinColours.length], roughness: 0.9 });
        this.box([0.34, 0.62, 0.27], [0, 0.33, 0.06], shirt, rider);
        const head = this.mesh(new THREE.SphereGeometry(0.16, 12, 9), skin, rider);
        head.position.set(0, 0.87, 0.03);
        for (const legX of [-0.11, 0.11]) {
          const upperLeg = this.box([0.11, 0.52, 0.12], [legX, -0.34, 0.23], shirt, rider);
          upperLeg.rotation.x = -0.18;
          const lowerLeg = this.box([0.1, 0.63, 0.1], [legX, -0.83, 0.42], skin, rider);
          lowerLeg.rotation.x = -0.18;
          this.box([0.15, 0.1, 0.29], [legX, -1.15, 0.51], this.materials.rubber, rider);
        }
        rider.visible = false;
        this.riders.push(rider);

        const restraintFrame = new THREE.Group();
        seat.add(restraintFrame);
        const shoulder = this.mesh(new THREE.TorusGeometry(0.245, 0.045, 8, 20, Math.PI), this.materials.brightLime, restraintFrame);
        shoulder.position.set(0, 0.62, 0.33);
        shoulder.rotation.z = Math.PI;
        this.box([0.06, 0.69, 0.08], [-0.23, 0.3, 0.31], this.materials.brightLime, restraintFrame);
        this.box([0.06, 0.69, 0.08], [0.23, 0.3, 0.31], this.materials.brightLime, restraintFrame);
        this.box([0.36, 0.1, 0.1], [0, 0.08, 0.34], this.materials.brightLime, restraintFrame);
        restraintFrame.rotation.x = -1.18;
        this.restraintFrames.push(restraintFrame);
      }
    }
  }

  buildWaterSystem() {
    const createJet = (x, z, direction, phase) => {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 1.9, direction * 0.35),
        new THREE.Vector3(0, 3.3, direction * 1.15),
        new THREE.Vector3(0, 4.0, direction * 2.05)
      ]);
      const jet = new THREE.Group();
      jet.position.set(x, this.deckY + 0.34, z);
      jet.userData.phase = phase;
      jet.userData.baseY = jet.position.y;
      this.ride.add(jet);
      const stream = this.mesh(new THREE.TubeGeometry(curve, 18, 0.047, 7, false), this.materials.water.clone(), jet, false);
      stream.material.opacity = 0.58;
      const nozzle = this.cylinder(0.13, 0.32, [0, 0.05, 0], this.materials.galvanised, jet, 14);
      nozzle.rotation.x = Math.PI / 2 - direction * 0.19;
      jet.scale.y = 0.01;
      jet.visible = false;
      this.waterJets.push(jet);
    };

    for (const z of [-2.35, 2.35]) {
      const direction = z > 0 ? -1 : 1;
      for (let index = 0; index < 15; index += 1) {
        createJet(-6.5 + index * 0.93, z, direction, index * 0.63 + (z > 0 ? 0 : 1.4));
      }
    }
  }

  buildSilosAndBooth() {
    for (const side of [-1, 1]) {
      const silo = new THREE.Group();
      silo.position.set(side * 10.9, 3.45, -3.1);
      this.ride.add(silo);
      const tank = this.cylinder(1.65, 5.8, [0, 2.9, 0], this.materials.galvanised, silo, 28);
      for (const y of [0.35, 1.6, 2.9, 4.2, 5.45]) {
        const ring = this.mesh(new THREE.TorusGeometry(1.67, 0.08, 8, 32), this.materials.darkSteel, silo);
        ring.position.y = y;
        ring.rotation.x = Math.PI / 2;
      }
      const cap = this.mesh(new THREE.ConeGeometry(1.66, 1.15, 28), this.materials.darkSteel, silo);
      cap.position.y = 6.38;
      const glow = this.mesh(new THREE.PlaneGeometry(0.72, 2.2), this.materials.glass, silo);
      glow.position.set(side > 0 ? -1.66 : 1.66, 3.35, 0);
      glow.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      this.beamBetween([0, 0.2, 1.55], [0, 6.2, 1.55], 0.08, this.materials.fence, silo);
      for (let rung = 0; rung < 13; rung += 1) {
        this.box([0.55, 0.055, 0.08], [0, 0.45 + rung * 0.43, 1.6], this.materials.fence, silo);
      }
    }

    const booth = new THREE.Group();
    booth.position.set(10.9, this.deckY + 0.15, 4.45);
    this.ride.add(booth);
    this.box([3.1, 2.8, 2.25], [0, 1.4, 0], this.materials.darkSteel, booth);
    this.box([3.35, 0.18, 2.5], [0, 2.87, 0], this.materials.black, booth);
    for (const x of [-0.92, 0, 0.92]) {
      const windowPanel = this.box([0.76, 1.1, 0.035], [x, 1.73, 1.14], this.materials.glass, booth);
      windowPanel.castShadow = false;
    }
    this.box([0.85, 1.95, 0.06], [1.08, 1.0, -1.14], this.materials.black, booth);
  }

  buildSignage() {
    const texture = canvasTexture(1536, 448, (ctx, width, height) => {
      const background = ctx.createLinearGradient(0, 0, width, height);
      background.addColorStop(0, '#0b1213');
      background.addColorStop(0.55, '#192724');
      background.addColorStop(1, '#080c0d');
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = '#b6d82d';
      ctx.lineWidth = 20;
      ctx.strokeRect(11, 11, width - 22, height - 22);
      for (let x = -120; x < width + 120; x += 130) {
        ctx.fillStyle = Math.floor(x / 130) % 2 ? '#c9eb32' : '#151b1b';
        ctx.beginPath();
        ctx.moveTo(x, height);
        ctx.lineTo(x + 85, height - 104);
        ctx.lineTo(x + 150, height - 104);
        ctx.lineTo(x + 65, height);
        ctx.fill();
      }
      ctx.fillStyle = '#c9ed3d';
      ctx.shadowColor = 'rgba(175,226,25,.45)';
      ctx.shadowBlur = 18;
      ctx.font = '900 178px Arial Narrow, Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('TOXICATOR', width / 2, 166);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#b9c5bd';
      ctx.font = '700 31px Arial';
      ctx.fillText('PHALANX // CENTRIFUGE SYSTEM 01', width / 2, 284);
    });
    const signMaterial = new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: 0x334b0b, emissiveIntensity: 0.36, roughness: 0.55 });
    const sign = this.mesh(new THREE.PlaneGeometry(9.4, 2.75), signMaterial, this.ride);
    sign.position.set(0, 14.65, -3.95);
    this.beamBetween([-4.35, 12.7, -3.97], [-4.35, 16.05, -3.97], 0.15, this.materials.darkSteel, this.ride);
    this.beamBetween([4.35, 12.7, -3.97], [4.35, 16.05, -3.97], 0.15, this.materials.darkSteel, this.ride);
    this.beamBetween([-4.6, 16.03, -3.97], [4.6, 16.03, -3.97], 0.14, this.materials.darkSteel, this.ride);
  }

  buildGuestOperation() {
    const createGate = (position, width) => {
      const gate = new THREE.Group();
      const direction = Math.sign(width) || 1;
      const size = Math.abs(width);
      gate.position.set(...position);
      this.scene.add(gate);
      this.box([size, 0.1, 0.1], [direction * size / 2, 1.03, 0], this.materials.fence, gate);
      for (let x = 0.18; x < size; x += 0.38) {
        this.box([0.055, 1.48, 0.055], [direction * x, 0.73, 0], this.materials.fence, gate);
      }
      return gate;
    };

    this.railLine([-15, 9.3], [-9.2, 9.3], 0);
    this.railLine([-15, 6.4], [-8.5, 6.4], 0);
    this.railLine([-15, 6.4], [-15, 9.3], 0);
    this.entranceGate = createGate([-9.25, 0, 9.3], 2.4);
    this.platformGates.push(
      createGate([-6.55, this.deckY + 0.28, 4.8], 2.15),
      createGate([6.55, this.deckY + 0.28, 4.8], -2.15)
    );

    const clothing = [0x667b82, 0x8b604d, 0x5b7657, 0x998440, 0x526e84, 0x865b73, 0x434d56];
    const skin = [0xddaa7a, 0x9b6749, 0xf0c6a0, 0x75442f];
    for (let index = 0; index < 32; index += 1) {
      const guest = new THREE.Group();
      const row = Math.floor(index / 10);
      const column = index % 10;
      guest.position.set(-14.45 + column * 0.58, 0.02, 8.8 - row * 0.79);
      this.scene.add(guest);
      const shirt = new THREE.MeshStandardMaterial({ color: clothing[index % clothing.length], roughness: 0.82 });
      const body = this.box([0.32, 0.72, 0.26], [0, 0.66, 0], shirt, guest);
      body.rotation.y = (seededNoise(index) - 0.5) * 0.4;
      const head = this.mesh(new THREE.SphereGeometry(0.17, 10, 8), new THREE.MeshStandardMaterial({ color: skin[index % skin.length], roughness: 0.9 }), guest);
      head.position.y = 1.17;
      for (const x of [-0.09, 0.09]) this.box([0.09, 0.52, 0.1], [x, 0.27, 0], this.materials.darkSteel, guest);
      guest.visible = false;
      guest.userData.baseY = guest.position.y;
      this.queueGuests.push(guest);
    }
  }

  buildLighting() {
    this.scene.add(new THREE.HemisphereLight(0xdce8ef, 0x273329, 2.05));
    const sun = new THREE.DirectionalLight(0xf4f0dc, 3.65);
    sun.position.set(-17, 29, 21);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -27;
    sun.shadow.camera.right = 27;
    sun.shadow.camera.top = 28;
    sun.shadow.camera.bottom = -12;
    sun.shadow.bias = -0.00035;
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0x9ed3dc, 1.2);
    fill.position.set(18, 14, -22);
    this.scene.add(fill);
    for (const x of [-8.7, 8.7]) {
      const spot = new THREE.SpotLight(0xc9ff3d, 13, 28, 0.48, 0.62, 1.2);
      spot.position.set(x, 5.2, 7.6);
      spot.target.position.set(0, 8.2, 0);
      this.scene.add(spot, spot.target);
    }
  }

  setArmPosition(angleDegrees) {
    this.armAngle = angleDegrees * DEG;
    for (const pivot of this.armPivots) pivot.rotation.x = this.armAngle;
    const y = this.pivotY - Math.cos(this.armAngle) * this.armRadius;
    const z = -Math.sin(this.armAngle) * this.armRadius;
    this.gondola.position.set(0, y, z);
    this.updateCounterweightShaft();
  }

  updateCounterweightShaft() {
    if (!this.counterweightShaft) return;
    this.counterweightShaft.position.set(
      0,
      this.pivotY + Math.cos(this.armAngle) * this.counterweightRadius,
      Math.sin(this.armAngle) * this.counterweightRadius
    );
  }

  resize() {
    const parent = this.canvas.parentElement;
    const width = Math.max(1, parent.clientWidth);
    const height = Math.max(1, parent.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  setCamera(name) {
    const view = this.cameraViews[name] || this.cameraViews.operator;
    this.desiredCamera.fromArray(view.position);
    this.desiredTarget.fromArray(view.target);
  }

  update(state, dt) {
    const armTarget = state.armAngle * DEG;
    const gondolaTarget = state.gondolaAngle * DEG;
    const blend = Math.min(1, dt * 8);
    this.armAngle = THREE.MathUtils.lerp(this.armAngle, armTarget, blend);
    for (const pivot of this.armPivots) pivot.rotation.x = this.armAngle;
    this.gondola.position.set(
      0,
      this.pivotY - Math.cos(this.armAngle) * this.armRadius,
      -Math.sin(this.armAngle) * this.armRadius
    );
    this.gondolaAngle = THREE.MathUtils.lerp(this.gondolaAngle, gondolaTarget, blend);
    this.gondola.rotation.x = this.gondolaAngle;
    this.updateCounterweightShaft();

    for (let index = 0; index < this.riders.length; index += 1) {
      this.riders[index].visible = index < state.onboard;
    }
    for (const frame of this.restraintFrames) {
      frame.rotation.x = -1.18 * (1 - state.restraintProgress);
    }
    for (const caliper of this.brakeCalipers) {
      caliper.material.emissive = new THREE.Color(state.brakePressure > 0.12 ? 0x5b2100 : 0x000000);
      caliper.material.emissiveIntensity = state.brakePressure * 0.75;
    }

    const now = performance.now();
    for (let index = 0; index < this.queueGuests.length; index += 1) {
      const guest = this.queueGuests[index];
      guest.visible = state.rideOpen && index < Math.min(state.queue, this.queueGuests.length);
      guest.position.y = guest.userData.baseY + (guest.visible ? Math.sin(now * 0.0022 + index) * 0.016 : 0);
    }

    this.entranceGate.rotation.y = THREE.MathUtils.lerp(this.entranceGate.rotation.y, state.rideOpen ? -1.34 : 0, Math.min(1, dt * 4));
    for (let index = 0; index < this.platformGates.length; index += 1) {
      const direction = index ? 1 : -1;
      this.platformGates[index].rotation.y = THREE.MathUtils.lerp(
        this.platformGates[index].rotation.y,
        state.loadGate ? direction * 1.25 : 0,
        Math.min(1, dt * 4)
      );
    }

    const running = state.mode === 'CYCLE ACTIVE' || state.mode === 'RETURNING TO LOAD';
    for (const jet of this.waterJets) {
      const pulse = running && state.water ? 0.72 + Math.sin(now * 0.0035 + jet.userData.phase) * 0.22 : 0;
      jet.visible = running && state.water;
      jet.scale.y = THREE.MathUtils.lerp(jet.scale.y, pulse, Math.min(1, dt * 5));
    }
    for (let index = 0; index < this.beacons.length; index += 1) {
      const flash = Math.max(0, Math.sin(now * 0.006 + index * Math.PI));
      this.beacons[index].material.emissiveIntensity = state.power ? 0.4 + flash * 2.7 : 0.05;
    }

    this.camera.position.lerp(this.desiredCamera, Math.min(1, dt * 2.35));
    this.cameraTarget.lerp(this.desiredTarget, Math.min(1, dt * 2.35));
    this.camera.lookAt(this.cameraTarget);
    this.renderer.render(this.scene, this.camera);
  }
}

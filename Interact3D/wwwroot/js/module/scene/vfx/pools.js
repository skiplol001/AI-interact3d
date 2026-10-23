// ═══════════════════════════════════════════════════════════════
// vfx/pools.js — Pool factories cho VFX
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'https://esm.sh/three@0.160.0';

export function createShieldPool(scene) {
    const pool = [];
    for (let i = 0; i < 3; i++) {
        const group = new THREE.Group();
        const sphereGeo = new THREE.SphereGeometry(1.5, 24, 16);
        const sphereMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending });
        const sphere = new THREE.Mesh(sphereGeo, sphereMat);
        group.add(sphere);
        const icoGeo = new THREE.IcosahedronGeometry(1.55, 1);
        const icoEdges = new THREE.EdgesGeometry(icoGeo);
        const icoMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending });
        const icoLines = new THREE.LineSegments(icoEdges, icoMat);
        group.add(icoLines);
        const innerGeo = new THREE.SphereGeometry(1.4, 24, 16);
        const innerMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.15, side: THREE.BackSide, blending: THREE.AdditiveBlending });
        const inner = new THREE.Mesh(innerGeo, innerMat);
        group.add(inner);
        const rings = [];
        for (let j = 0; j < 3; j++) {
            const torusGeo = new THREE.TorusGeometry(1.65, 0.03, 8, 64);
            const torusMat = new THREE.MeshBasicMaterial({ color: 0x60d5ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending });
            const torus = new THREE.Mesh(torusGeo, torusMat);
            if (j === 0) torus.rotation.x = Math.PI / 2;
            if (j === 1) torus.rotation.y = Math.PI / 2;
            torus.rotation.z = j * 0.5;
            group.add(torus);
            rings.push(torus);
        }
        group.visible = false;
        scene.add(group);
        pool.push({ group, sphere, sphereMat, icoLines, icoMat, inner, innerMat, rings, active: false });
    }
    return pool;
}

export function createExplosionPool(scene, particleTexture) {
    const pool = [];
    for (let i = 0; i < 6; i++) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(100 * 3), 3));
        const mat = new THREE.PointsMaterial({ size: 0.6, map: particleTexture, color: 0xff5500, transparent: true, opacity: 1.0, depthWrite: false, blending: THREE.AdditiveBlending });
        const mesh = new THREE.Points(geo, mat); mesh.visible = false;
        scene.add(mesh);
        pool.push({ mesh, geo, mat, active: false });
    }
    return pool;
}

export function createTrailPool(scene, particleTexture) {
    const pool = [];
    for (let i = 0; i < 100; i++) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
        const mat = new THREE.PointsMaterial({ size: 0.6, map: particleTexture, color: 0xff5500, transparent: true, opacity: 1.0, depthWrite: false, blending: THREE.AdditiveBlending });
        const mesh = new THREE.Points(geo, mat); mesh.visible = false;
        scene.add(mesh);
        pool.push({ mesh, geo, mat, active: false });
    }
    return pool;
}

export function createGhostPool(scene) {
    const pool = [];
    const ghostGeo = new THREE.SphereGeometry(0.15, 8, 8);
    for (let i = 0; i < 30; i++) {
        const mat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending });
        const mesh = new THREE.Mesh(ghostGeo, mat); mesh.visible = false;
        scene.add(mesh);
        pool.push({ mesh, mat, active: false });
    }
    return pool;
}

export function createWindTearPool(scene) {
    const pool = [];
    const windGeo = new THREE.PlaneGeometry(0.15, 3.5);
    for (let i = 0; i < 40; i++) {
        const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1.0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(windGeo, mat); mesh.visible = false;
        scene.add(mesh);
        pool.push({ mesh, mat, active: false });
    }
    return pool;
}

export function createDustPool(scene, particleTexture) {
    const pool = [];
    for (let i = 0; i < 3; i++) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(30 * 3), 3));
        const mat = new THREE.PointsMaterial({ size: 0.8, map: particleTexture, color: 0x94a3b8, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.NormalBlending });
        const mesh = new THREE.Points(geo, mat); mesh.visible = false;
        scene.add(mesh);
        pool.push({ mesh, geo, mat, active: false });
    }
    return pool;
}

export function createLightPool(scene) {
    const pool = [];
    for (let i = 0; i < 15; i++) {
        const light = new THREE.PointLight(0xffffff, 0);
        scene.add(light);
        pool.push({ light, active: false });
    }
    return pool;
}

export function createSparkPool(scene, sparkTexture) {
    const pool = [];
    for (let i = 0; i < 160; i++) {
        const mat = new THREE.SpriteMaterial({ map: sparkTexture, color: 0xffffff, transparent: true, opacity: 1.0, depthWrite: false, blending: THREE.AdditiveBlending });
        const sprite = new THREE.Sprite(mat); sprite.visible = false;
        scene.add(sprite);
        pool.push({ mesh: sprite, mat, active: false });
    }
    return pool;
}

export function createFragmentPool(scene) {
    const pool = [];
    const fragGeo = new THREE.TetrahedronGeometry(1, 0);
    for (let i = 0; i < 30; i++) {
        const mat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: 2.0, transparent: true, opacity: 1.0, roughness: 0.4, metalness: 0.8 });
        const mesh = new THREE.Mesh(fragGeo, mat); mesh.visible = false;
        scene.add(mesh);
        pool.push({ mesh, mat, active: false });
    }
    return pool;
}

export function createFlashPool(scene, particleTexture) {
    const pool = [];
    for (let i = 0; i < 10; i++) {
        const mat = new THREE.SpriteMaterial({ map: particleTexture, color: 0xffffff, transparent: true, opacity: 1.0, depthWrite: false, blending: THREE.AdditiveBlending });
        const sprite = new THREE.Sprite(mat); sprite.visible = false;
        scene.add(sprite);
        pool.push({ mesh: sprite, mat, active: false });
    }
    return pool;
}

export function createPowerStreakPool(scene) {
    const pool = [];
    for (let i = 0; i < 30; i++) {
        const group = new THREE.Group();
        const glowGeo = new THREE.SphereGeometry(0.28, 12, 12);
        const glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1.0, blending: THREE.AdditiveBlending, depthWrite: false });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        group.add(glow);
        const streakGeo = new THREE.CylinderGeometry(0.03, 0.22, 1.0, 10);
        const streakMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
        const streak = new THREE.Mesh(streakGeo, streakMat);
        streak.position.y = -0.5;
        group.add(streak);
        group.visible = false;
        scene.add(group);
        pool.push({ group, glow, glowMat, streak, streakMat, active: false });
    }
    return pool;
}
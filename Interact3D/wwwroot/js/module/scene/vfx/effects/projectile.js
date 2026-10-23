// ═══════════════════════════════════════════════════════════════
// vfx/effects/projectile.js — Charging & Projectile effects
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'https://esm.sh/three@0.160.0';

export const projectileMixin = {
    // ═══════════════════════════════════════════════════════════
    // ⭐ MAGIC CANNON CHARGE (Satellite Rings xếp đều quanh rìa vòng vàng khi > 80%)
    // ═══════════════════════════════════════════════════════════
    createChargingEffect() {
        const group = new THREE.Group();
        group.rotation.order = 'YXZ';
        this.scene.add(group);

        const RED = new THREE.Color(0xff4d12);
        const GOLD = new THREE.Color(0xffc02e);
        const WHITE = new THREE.Color(0xffffff);
        const BLUE = new THREE.Color(0x38bdf8);
        const base = new THREE.Color();

        const CORE_Z = 1.3;
        const light = new THREE.PointLight(0xff7a1a, 0, 8);
        light.position.z = CORE_Z;
        group.add(light);

        const NUM_DISCS = 5;
        const discGeo = new THREE.PlaneGeometry(1, 1);
        const discs = [];
        for (let i = 0; i < NUM_DISCS; i++) {
            const mat = new THREE.MeshBasicMaterial({ map: this.magicTex, color: 0xff7a1a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
            const mesh = new THREE.Mesh(discGeo, mat);
            mesh.position.z = 0.4 + i * 0.38;
            mesh.userData.spin = (i % 2 ? -1 : 1) * (0.8 + i * 0.35);
            mesh.userData.fade = 0;
            group.add(mesh);
            discs.push(mesh);
        }

        const runeGeo = new THREE.PlaneGeometry(1, 1);
        const runeMat = new THREE.MeshBasicMaterial({ map: this.runeTex, color: 0x38bdf8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
        const runeMesh = new THREE.Mesh(runeGeo, runeMat);
        runeMesh.position.z = 1.0;
        group.add(runeMesh);

        const hexGeo = new THREE.PlaneGeometry(1, 1);
        const hexMat = new THREE.MeshBasicMaterial({ map: this.hexagramTex, color: 0xffc02e, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
        const hexMesh = new THREE.Mesh(hexGeo, hexMat);
        hexMesh.position.z = 1.4;
        group.add(hexMesh);

        const SAT_COUNT = 8;
        const HEX_Z = 1.4;
        const satGroup = new THREE.Group();
        satGroup.position.z = HEX_Z;
        group.add(satGroup);

        const satGeo = new THREE.PlaneGeometry(1, 1);
        const satellites = [];
        for (let i = 0; i < SAT_COUNT; i++) {
            const isHex = i % 2 === 0;
            const mat = new THREE.MeshBasicMaterial({
                map: isHex ? this.hexagramTex : this.magicTex,
                color: 0xffffff,
                transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
            });
            const mesh = new THREE.Mesh(satGeo, mat);
            satGroup.add(mesh);
            satellites.push({
                mesh, mat,
                angleOffset: (i / SAT_COUNT) * Math.PI * 2,
                spinDir: isHex ? 1 : -1,
                tint: new THREE.Color(isHex ? 0xffc02e : 0x38bdf8),
            });
        }

        const ARC_COUNT = 6;
        const SEG_PER_ARC = 5;
        const arcGeo = new THREE.BufferGeometry();
        const arcPositions = new Float32Array(ARC_COUNT * SEG_PER_ARC * 3);
        arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPositions, 3));
        const arcMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending });
        const arcLines = new THREE.LineSegments(arcGeo, arcMat);
        arcLines.frustumCulled = false;
        group.add(arcLines);

        const coreMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
        const coreMesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), coreMat);
        coreMesh.position.z = CORE_Z;
        group.add(coreMesh);

        const haloMat = new THREE.SpriteMaterial({ map: this.particleTexture, color: 0xff7a1a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
        const halo = new THREE.Sprite(haloMat);
        halo.position.z = CORE_Z;
        group.add(halo);

        const N = 48, K = 4;
        const sPos = new Float32Array(N * K * 3);
        const sCol = new Float32Array(N * K * 3);
        const sGeo = new THREE.BufferGeometry();
        sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
        sGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 3));
        const sMat = new THREE.PointsMaterial({ size: 0.16, map: this.particleTexture, vertexColors: true, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending });
        const streams = new THREE.Points(sGeo, sMat);
        streams.frustumCulled = false;
        group.add(streams);

        const seeds = [];
        for (let i = 0; i < N; i++) {
            seeds.push({ a: Math.random() * Math.PI * 2, r: 1.4 + Math.random() * 1.0, z: -0.6 + Math.random() * 1.6, speed: 0.6 + Math.random() * 0.6, phase: Math.random(), dir: Math.random() > 0.5 ? 1 : -1 });
        }

        let time = 0;
        let satAngle = 0;

        this.chargingEffect = {
            group,
            update: (percent, position, aimAngle, dt, aimPitch = 0) => {
                if (!position) return;
                time += dt;
                if (percent < 0.05) { group.visible = false; return; }
                group.visible = true;

                group.position.copy(position);
                group.rotation.set(-aimPitch, aimAngle, 0);

                base.copy(RED).lerp(GOLD, Math.min(percent / 0.7, 1));
                if (percent > 0.9) base.lerp(WHITE, (percent - 0.9) * 5);
                const maxed = percent > 0.95;

                const activeDiscs = Math.ceil(percent * NUM_DISCS);
                discs.forEach((d, i) => {
                    const target = i < activeDiscs ? 1 : 0;
                    d.userData.fade += (target - d.userData.fade) * Math.min(1, dt * 10);
                    d.rotation.z += d.userData.spin * dt * (1 + percent * 3 + (maxed ? 2 : 0));
                    const diameter = (1.7 - i * 0.24) * (0.6 + 0.4 * percent);
                    d.scale.setScalar(diameter * (0.5 + 0.5 * d.userData.fade));
                    d.material.opacity = d.userData.fade * (0.35 + 0.3 * percent);
                    d.material.color.copy(base).lerp(WHITE, i * 0.04);
                });

                const runeActive = percent > 0.3 ? Math.min(1, (percent - 0.3) / 0.2) : 0;
                runeMat.opacity = runeActive * 0.8;
                runeMesh.scale.setScalar(2.5 + percent * 1.5);
                runeMesh.rotation.z -= dt * (2 + percent * 4);

                const hexActive = percent > 0.6 ? Math.min(1, (percent - 0.6) / 0.2) : 0;
                hexMat.opacity = hexActive * 0.9;
                hexMesh.scale.setScalar(3.5 + percent * 2.0);
                hexMesh.rotation.z += dt * (1.5 + percent * 3);
                hexMesh.rotation.x = Math.sin(time) * 0.5 * hexActive;

                const satActive = percent > 0.8 ? Math.min(1, (percent - 0.8) / 0.15) : 0;
                satGroup.visible = satActive > 0;
                if (satActive > 0) {
                    satGroup.rotation.x = hexMesh.rotation.x;
                    satAngle -= dt * (0.7 + (maxed ? 0.4 : 0));
                    const rimR = 0.449 * (3.5 + percent * 2.0) + 0.6;
                    satellites.forEach((sat, i) => {
                        const a = satAngle + sat.angleOffset;
                        sat.mesh.position.set(Math.cos(a) * rimR, Math.sin(a) * rimR, 0);
                        sat.mesh.rotation.z += sat.spinDir * dt * 2.0;

                        const appear = Math.min(1, Math.max(0, satActive * SAT_COUNT - i));
                        sat.mesh.scale.setScalar(0.9 * (0.4 + 0.6 * appear) * (1 + Math.sin(time * 3 + i) * 0.04));
                        sat.mat.opacity = appear * 0.9;
                        sat.mat.color.copy(sat.tint).lerp(WHITE, 0.3 + (maxed ? 0.3 : 0));
                    });
                }

                const arcActive = percent > 0.85 ? Math.min(1, (percent - 0.85) / 0.15) : 0;
                arcMat.opacity = arcActive * 1.0;
                if (arcActive > 0) {
                    arcGeo.attributes.position.needsUpdate = true;
                    const arr = arcGeo.attributes.position.array;
                    let idx = 0;
                    const maxRadius = 2.5 + percent * 2.0;
                    for (let a = 0; a < ARC_COUNT; a++) {
                        const baseAngle = (a / ARC_COUNT) * Math.PI * 2 + time * 3;
                        for (let s = 0; s < SEG_PER_ARC - 1; s++) {
                            const t1 = s / (SEG_PER_ARC - 1);
                            const t2 = (s + 1) / (SEG_PER_ARC - 1);
                            const r1 = t1 * maxRadius;
                            const r2 = t2 * maxRadius;
                            const a1 = baseAngle + Math.sin(time * 15 + s) * 0.3;
                            const a2 = baseAngle + Math.sin(time * 15 + s + 1) * 0.3;
                            arr[idx++] = Math.cos(a1) * r1; arr[idx++] = Math.sin(a1) * r1; arr[idx++] = CORE_Z;
                            arr[idx++] = Math.cos(a2) * r2; arr[idx++] = Math.sin(a2) * r2; arr[idx++] = CORE_Z;
                        }
                    }
                }

                const count = Math.max(4, Math.floor(N * (0.25 + 0.75 * percent)));
                sGeo.setDrawRange(0, count * K);
                for (let i = 0; i < count; i++) {
                    const s = seeds[i];
                    const head = (s.phase + time * s.speed * (0.7 + percent)) % 1;
                    for (let k = 0; k < K; k++) {
                        const idx = (i * K + k) * 3;
                        const t = head - k * 0.035;
                        if (t < 0) {
                            sPos[idx] = 0; sPos[idx + 1] = 0; sPos[idx + 2] = CORE_Z;
                            sCol[idx] = sCol[idx + 1] = sCol[idx + 2] = 0;
                            continue;
                        }
                        const e = t * t;
                        const r = s.r * (1 - e);
                        const ang = s.a + s.dir * (t * 2.8 + time * 0.3);
                        sPos[idx] = Math.cos(ang) * r;
                        sPos[idx + 1] = Math.sin(ang) * r;
                        sPos[idx + 2] = CORE_Z + (s.z - CORE_Z) * (1 - e);
                        const f = (1 - k / K) * (0.45 + 0.55 * t);
                        const col = new THREE.Color(BLUE).lerp(new THREE.Color(WHITE), t * 0.8).multiplyScalar(f);
                        sCol[idx] = col.r; sCol[idx + 1] = col.g; sCol[idx + 2] = col.b;
                    }
                }
                sGeo.attributes.position.needsUpdate = true;
                sGeo.attributes.color.needsUpdate = true;

                coreMesh.scale.setScalar(1 + percent * 1.8);
                coreMat.color.copy(base);
                coreMat.opacity = 0.3 + percent * 0.7;
                halo.scale.setScalar((0.5 + percent * 1.6));
                haloMat.color.copy(base);
                haloMat.opacity = 0.35 + percent * 0.45;

                light.color.copy(base);
                light.intensity = 2 + percent * 10;
            },
            dispose: () => {
                this.scene.remove(group);
                discs.forEach(d => d.material.dispose());
                satellites.forEach(s => s.mat.dispose());
                discGeo.dispose(); runeGeo.dispose(); hexGeo.dispose(); arcGeo.dispose(); satGeo.dispose();
                coreMesh.geometry.dispose(); coreMat.dispose(); haloMat.dispose(); sGeo.dispose(); sMat.dispose();
                this.chargingEffect = null;
            }
        };
        return this.chargingEffect;
    },

    createProjectileEffect() {
        if (this.projectileFX) return this.projectileFX;

        const group = new THREE.Group();
        group.visible = false;
        this.scene.add(group);

        const ADD = THREE.AdditiveBlending;
        const Z = new THREE.Vector3(0, 0, 1);
        const entries = [];
        const geos = [];
        const reg = (mat, base) => { const e = { mat, base }; entries.push(e); return e; };

        const GOLD = new THREE.Color(0xffc02e);
        const RED = new THREE.Color(0xff4d12);
        const WHITE = new THREE.Color(0xffffff);

        const hexGeo = new THREE.PlaneGeometry(1, 1); geos.push(hexGeo);
        const hexDiscs = [0, 1, 2].map((i) => {
            const mat = new THREE.MeshBasicMaterial({ map: this.hexagramTex, color: 0xffaa00, transparent: true, opacity: 0, blending: ADD, depthWrite: false, side: THREE.DoubleSide });
            const entry = reg(mat, 0.85);
            const mesh = new THREE.Mesh(hexGeo, mat);
            mesh.position.z = -0.5 + i * 0.5;
            group.add(mesh);
            return { mesh, mat, entry, spin: (i % 2 ? -1 : 1) * (3 + i * 1.5), phase: i * 2 };
        });

        const runeGeo = new THREE.PlaneGeometry(1, 1); geos.push(runeGeo);
        const runeRings = [0, 1].map((i) => {
            const mat = new THREE.MeshBasicMaterial({ map: this.runeTex, color: 0x38bdf8, transparent: true, opacity: 0, blending: ADD, depthWrite: false, side: THREE.DoubleSide });
            const entry = reg(mat, 0.7);
            const mesh = new THREE.Mesh(runeGeo, mat);
            group.add(mesh);
            return { mesh, mat, entry, spin: (i % 2 ? -1 : 1) * 2.5, phase: i * Math.PI };
        });

        const SWARM_COUNT = 16;
        const swarmRunes = [];
        for (let i = 0; i < SWARM_COUNT; i++) {
            const mat = new THREE.SpriteMaterial({ map: this.smallRuneTex, color: i % 2 ? 0xffffff : 0x38bdf8, transparent: true, opacity: 0, blending: ADD, depthWrite: false });
            const entry = reg(mat, 0.8);
            const sp = new THREE.Sprite(mat);
            sp.scale.setScalar(0.3 + Math.random() * 0.2);
            group.add(sp);
            swarmRunes.push({
                mesh: sp, mat, entry,
                angleOffset: Math.random() * Math.PI * 2,
                radiusOffset: 0.6 + Math.random() * 0.8,
                speed: 2 + Math.random() * 3,
                zOffset: (Math.random() - 0.5) * 2.5
            });
        }

        const GYRO_SPEC = [
            { r: 0.7, col: 0xbfeaff, axis: [1, 0.2, 0.1], speed: 4.0 },
            { r: 0.9, col: 0x38bdf8, axis: [0.1, 1, 0.3], speed: -5.0 },
            { r: 1.1, col: 0xffaa00, axis: [0.4, 0.3, 1], speed: 6.5 },
            { r: 0.8, col: 0xffffff, axis: [0.8, 0.8, 0.2], speed: -8.0 },
            { r: 1.2, col: 0xef4444, axis: [0.5, 0.5, 0.5], speed: 3.0 },
        ];
        const gyros = GYRO_SPEC.map(cfg => {
            const geo = new THREE.TorusGeometry(cfg.r, 0.015, 8, 64); geos.push(geo);
            const mat = new THREE.MeshBasicMaterial({ color: cfg.col, transparent: true, opacity: 0, blending: ADD, depthWrite: false });
            reg(mat, 0.8);
            const mesh = new THREE.Mesh(geo, mat);
            mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
            group.add(mesh);
            return { mesh, mat, axis: new THREE.Vector3(...cfg.axis).normalize(), speed: cfg.speed };
        });

        const ARC_COUNT = 12;
        const SEG_PER_ARC = 6;
        const arcGeo = new THREE.BufferGeometry();
        const arcPositions = new Float32Array(ARC_COUNT * SEG_PER_ARC * 3);
        arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPositions, 3));
        const arcMat = new THREE.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0, blending: ADD, depthWrite: false });
        reg(arcMat, 0.9);
        const arcLines = new THREE.LineSegments(arcGeo, arcMat);
        arcLines.frustumCulled = false;
        group.add(arcLines);

        const ORB_N = 40;
        const orbs = [];
        for (let i = 0; i < ORB_N; i++) {
            const mat = new THREE.SpriteMaterial({ map: this.particleTexture, color: i % 2 ? 0xffffff : 0x38bdf8, transparent: true, opacity: 0, blending: ADD, depthWrite: false });
            reg(mat, 0.95);
            const sp = new THREE.Sprite(mat);
            sp.scale.setScalar(0.15 + (i % 4) * 0.05);
            group.add(sp);
            orbs.push(sp);
        }

        const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: ADD, depthWrite: false });
        reg(coreMat, 1.0);
        const coreMesh = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 16), coreMat);
        group.add(coreMesh);

        const haloMat = new THREE.SpriteMaterial({ map: this.particleTexture, color: 0xffffff, transparent: true, opacity: 0, blending: ADD, depthWrite: false });
        reg(haloMat, 0.9);
        const halo = new THREE.Sprite(haloMat);
        group.add(halo);

        const tailGeo = new THREE.CylinderGeometry(0.05, 0.6, 4, 20, 1, true); geos.push(tailGeo);
        const tailMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0, blending: ADD, depthWrite: false, side: THREE.DoubleSide });
        reg(tailMat, 0.35);
        const tail = new THREE.Mesh(tailGeo, tailMat);
        tail.rotation.x = Math.PI / 2;
        group.add(tail);

        const tail2Geo = new THREE.CylinderGeometry(0.02, 0.3, 4.5, 12, 1, true); geos.push(tail2Geo);
        const tail2Mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: ADD, depthWrite: false, side: THREE.DoubleSide });
        reg(tail2Mat, 0.5);
        const tail2 = new THREE.Mesh(tail2Geo, tail2Mat);
        tail2.rotation.x = Math.PI / 2;
        group.add(tail2);

        let time = 0, alpha = 0, pop = 0;
        const qT = new THREE.Quaternion();
        const vT = new THREE.Vector3();

        this.projectileFX = {
            group,
            update: (dt, pos, dir, power = 0.5, active = true, speed = 0, colorHex = 0x38bdf8, intensity = 1) => {
                time += dt;
                alpha += ((active ? 1 : 0) - alpha) * Math.min(1, dt * (active ? 14 : 5));
                pop = Math.max(0, pop - dt * 2.2);
                if (!active && alpha < 0.01) { group.visible = false; return; }
                group.visible = true;
                group.position.copy(pos);

                if (dir && dir.lengthSq() > 1e-6) {
                    vT.copy(dir).normalize();
                    qT.setFromUnitVectors(Z, vT);
                    group.quaternion.slerp(qT, Math.min(1, dt * 16));
                }

                const flick = 0.92 + 0.08 * Math.sin(time * 45);
                const scaleK = (0.5 + 0.5 * intensity) * (1 + pop * 0.6) * (0.55 + 0.45 * alpha);
                const coreColor = new THREE.Color(colorHex);

                hexDiscs.forEach((d, i) => {
                    d.mesh.rotation.z += d.spin * dt * (0.5 + intensity);
                    d.mesh.scale.setScalar((1.5 + i * 0.6) * scaleK);
                    d.mat.color.copy(GOLD).lerp(RED, power);
                    d.entry.base = 0.6 + 0.3 * power;
                });

                runeRings.forEach((r, i) => {
                    r.mesh.rotation.z += r.spin * dt * (0.6 + intensity);
                    r.mesh.rotation.x = Math.sin(time + r.phase) * 0.5;
                    r.mesh.rotation.y = Math.cos(time * 0.8 + r.phase) * 0.5;
                    r.mesh.scale.setScalar((2.2 + i * 0.4) * scaleK);
                    r.mat.color.copy(coreColor).lerp(WHITE, 0.3);
                });

                swarmRunes.forEach((sr) => {
                    const t = time * sr.speed;
                    const a = t + sr.angleOffset;
                    const r = sr.radiusOffset * scaleK;
                    sr.mesh.position.x = Math.cos(a) * r + Math.sin(t * 2) * 0.2;
                    sr.mesh.position.y = Math.sin(a * 1.5) * r + Math.cos(t * 3) * 0.2;
                    sr.mesh.position.z = sr.zOffset * scaleK + Math.sin(a) * 0.3;
                    sr.mesh.scale.setScalar((0.3 + Math.sin(t * 5) * 0.1) * scaleK);
                    sr.mat.color.copy(coreColor).lerp(WHITE, 0.4);
                    sr.entry.base = 0.5 + 0.5 * intensity;
                });

                gyros.forEach((g, i) => {
                    g.mesh.rotateOnAxis(g.axis, g.speed * dt * (0.5 + intensity));
                    g.mesh.scale.setScalar(scaleK * (1 + power * 0.15));
                    if (i === 1) g.mat.color.copy(coreColor);
                });

                arcGeo.attributes.position.needsUpdate = true;
                const arr = arcGeo.attributes.position.array;
                let idx = 0;
                const maxRadius = 1.2 * scaleK;
                for (let a = 0; a < ARC_COUNT; a++) {
                    const baseAngle = (a / ARC_COUNT) * Math.PI * 2 + time * 3;
                    for (let s = 0; s < SEG_PER_ARC - 1; s++) {
                        const t1 = s / (SEG_PER_ARC - 1);
                        const t2 = (s + 1) / (SEG_PER_ARC - 1);
                        const r1 = t1 * maxRadius, r2 = t2 * maxRadius;
                        const a1 = baseAngle + Math.sin(time * 12 + s) * 0.3;
                        const a2 = baseAngle + Math.sin(time * 12 + s + 1) * 0.3;
                        const z1 = -1.5 + t1 * 3.0;
                        const z2 = -1.5 + t2 * 3.0;
                        arr[idx++] = Math.cos(a1) * r1; arr[idx++] = Math.sin(a1) * r1; arr[idx++] = z1;
                        arr[idx++] = Math.cos(a2) * r2; arr[idx++] = Math.sin(a2) * r2; arr[idx++] = z2;
                    }
                }

                const spin = time * (12 + power * 10);
                orbs.forEach((o, i) => {
                    const a = spin + i * (Math.PI * 2 / ORB_N);
                    const r = (0.8 + Math.sin(time * 4 + i) * 0.2) * scaleK;
                    const z = Math.sin(time * 3.5 + i * 1.3) * 2.5 * scaleK;
                    o.position.set(Math.cos(a) * r, Math.sin(a) * r, z);
                    o.material.color.copy(coreColor).lerp(WHITE, 0.5);
                });

                coreMesh.scale.setScalar(0.8 + Math.sin(time * 20) * 0.1 + power * 0.5);
                coreMat.color.copy(coreColor).lerp(WHITE, 0.8);
                halo.scale.setScalar((2.0 + power * 2.0) * (1 + Math.sin(time * 15) * 0.1));
                haloMat.color.copy(coreColor);

                const len = 2.0 + Math.min(speed / 20, 4.0) * intensity;
                const wid = 1 + power * 0.5;
                tail.scale.set(wid, len / 4, wid);
                tail.position.z = -len / 2;
                tailMat.color.copy(coreColor);
                tail2.scale.set(wid, (len * 1.2) / 4, wid);
                tail2.position.z = -(len * 1.2) / 2;

                for (const e of entries) e.mat.opacity = e.base * alpha * flick;
            },
            pulse: (v = 0.6) => { pop = Math.max(pop, v); },
            reset: () => { alpha = 0; pop = 0; group.visible = false; },
            dispose: () => {
                this.scene.remove(group);
                geos.forEach(g => g.dispose());
                entries.forEach(e => e.mat.dispose());
                if (coreMesh.geometry) coreMesh.geometry.dispose();
                if (arcGeo) arcGeo.dispose();
                this.projectileFX = null;
            }
        };
        return this.projectileFX;
    }
};
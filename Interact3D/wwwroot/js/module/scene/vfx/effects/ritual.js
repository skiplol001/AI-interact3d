// ═══════════════════════════════════════════════════════════════
// vfx/effects/ritual.js — Magic Ritual (Seal, Inspect, ThrowTrail)
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'https://esm.sh/three@0.160.0';

export const ritualMixin = {
    async createMagicRitual(basePos, opts = {}) {
        const {
            layers = [],
            particleCount = 30,
            particleColor = 0x88ffcc,
            particleSpeed = 2.0,
            duration = 2000,
            cameraRecoil = 0,
        } = opts;

        return new Promise((resolve) => {
            const group = new THREE.Group();
            group.position.copy(basePos);
            group.position.y = 0.05;
            this.scene.add(group);

            const layerMeshes = [];
            layers.forEach(spec => {
                const geo = new THREE.PlaneGeometry(spec.scale, spec.scale);
                const mat = new THREE.MeshBasicMaterial({
                    map: this[spec.tex] || this.magicTex,
                    color: spec.color ?? 0xffffff,
                    transparent: true,
                    opacity: 0,
                    blending: THREE.AdditiveBlending,
                    side: THREE.DoubleSide,
                    depthWrite: false,
                });
                const mesh = new THREE.Mesh(geo, mat);
                mesh.rotation.x = -Math.PI / 2;
                mesh.position.y = 0.02;
                group.add(mesh);
                layerMeshes.push({ mesh, mat, spec, geo });
            });

            const particles = [];
            const radius = (layers[0]?.scale || 8) * 0.3;
            for (let i = 0; i < particleCount; i++) {
                const mat = new THREE.SpriteMaterial({
                    map: this.particleTexture,
                    color: particleColor,
                    transparent: true,
                    opacity: 0,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                });
                const sprite = new THREE.Sprite(mat);
                const a = Math.random() * Math.PI * 2;
                const r = Math.random() * radius;
                sprite.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
                sprite.scale.setScalar(0.3 + Math.random() * 0.4);
                group.add(sprite);
                particles.push({
                    sprite, mat,
                    speed: particleSpeed * (0.6 + Math.random() * 0.8),
                    offsetY: Math.random() * 3,
                    phase: Math.random() * Math.PI * 2,
                });
            }

            const startTime = performance.now();
            let lastRecoil = 0;

            const update = () => {
                const elapsed = performance.now() - startTime;
                const p = Math.min(elapsed / duration, 1);
                const fadeIn = Math.min(1, p * 3);
                const fadeOut = p > 0.8 ? (1 - p) / 0.2 : 1;

                layerMeshes.forEach(({ mesh, mat, spec }) => {
                    mesh.rotation.z += (spec.spinDir || 1) * (spec.spinSpeed || 0.02) * (1 + p);
                    mat.opacity = (spec.opacity ?? 0.8) * fadeIn * fadeOut;
                });

                particles.forEach(part => {
                    part.offsetY += part.speed * 0.016;
                    if (part.offsetY > 4) part.offsetY = 0;
                    part.sprite.position.y = part.offsetY;
                    part.mat.opacity = fadeIn * fadeOut * Math.sin((part.offsetY / 4) * Math.PI);
                    part.sprite.scale.setScalar(0.3 + Math.sin(elapsed * 0.005 + part.phase) * 0.15);
                });

                if (cameraRecoil > 0 && window.slingshotSystem && elapsed - lastRecoil > 150) {
                    lastRecoil = elapsed;
                    window.slingshotSystem._shakeScreen(cameraRecoil, 100);
                }

                if (p < 1) requestAnimationFrame(update);
                else {
                    this.scene.remove(group);
                    layerMeshes.forEach(({ geo, mat }) => { geo.dispose(); mat.dispose(); });
                    particles.forEach(({ mat }) => mat.dispose());
                    resolve();
                }
            };
            update();
        });
    },

    createSealRitual(basePos, duration = 1800) {
        return this.createMagicRitual(basePos, {
            layers: [
                { tex: 'magicTex', scale: 12, color: 0xa8e6a0, opacity: 0.7, spinDir: 1, spinSpeed: 0.015 },
                { tex: 'hexagramTex', scale: 10, color: 0xfff5b0, opacity: 0.6, spinDir: -1, spinSpeed: 0.02 },
            ],
            particleCount: 25,
            particleColor: 0xc8ffcc,
            particleSpeed: 1.2,
            duration,
            cameraRecoil: 0,
        });
    },

    createInspectRitual(basePos, duration = 2000) {
        return this.createMagicRitual(basePos, {
            layers: [
                { tex: 'magicTex', scale: 10, color: 0xff88cc, opacity: 0.8, spinDir: 1, spinSpeed: 0.04 },
                { tex: 'runeTex', scale: 8, color: 0xffaaff, opacity: 0.7, spinDir: -1, spinSpeed: 0.05 },
                { tex: 'hexagramTex', scale: 11, color: 0xffffff, opacity: 0.6, spinDir: 1, spinSpeed: 0.03 },
            ],
            particleCount: 40,
            particleColor: 0xffaaff,
            particleSpeed: 3.0,
            duration,
            cameraRecoil: 0.15,
        });
    },

    createThrowTrail(fromPos, toPos, duration = 800) {
        return new Promise((resolve) => {
            const lineGeo = new THREE.BufferGeometry();
            const positions = new Float32Array(30 * 3);
            lineGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            const lineMat = new THREE.LineBasicMaterial({ color: 0xff88cc, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending });
            const line = new THREE.Line(lineGeo, lineMat);
            this.scene.add(line);

            for (let i = 0; i < 30; i++) {
                const t = i / 29;
                positions[i * 3] = fromPos.x + (toPos.x - fromPos.x) * t;
                positions[i * 3 + 1] = fromPos.y + (toPos.y - fromPos.y) * t + Math.sin(t * Math.PI) * 4;
                positions[i * 3 + 2] = fromPos.z + (toPos.z - fromPos.z) * t;
            }
            lineGeo.attributes.position.needsUpdate = true;

            const particles = [];
            let lastSpawn = 0;
            const startTime = performance.now();

            const update = () => {
                const elapsed = performance.now() - startTime;
                const p = Math.min(elapsed / duration, 1);
                lineMat.opacity = 0.9 * (1 - p);

                if (elapsed - lastSpawn > 60 && p < 0.9) {
                    lastSpawn = elapsed;
                    const idx = Math.floor(p * 29);
                    const mat = new THREE.SpriteMaterial({
                        map: this.particleTexture,
                        color: 0xffaaff,
                        transparent: true,
                        opacity: 0.9,
                        blending: THREE.AdditiveBlending,
                        depthWrite: false,
                    });
                    const sprite = new THREE.Sprite(mat);
                    sprite.position.set(positions[idx * 3], positions[idx * 3 + 1], positions[idx * 3 + 2]);
                    sprite.scale.setScalar(0.8);
                    this.scene.add(sprite);
                    particles.push({ sprite, mat, life: 0, maxLife: 0.6 });
                }

                for (let i = particles.length - 1; i >= 0; i--) {
                    const part = particles[i];
                    part.life += 0.016;
                    part.mat.opacity = 0.9 * (1 - part.life / part.maxLife);
                    part.sprite.scale.setScalar(0.8 * (1 - part.life / part.maxLife));
                    if (part.life >= part.maxLife) {
                        this.scene.remove(part.sprite);
                        part.mat.dispose();
                        particles.splice(i, 1);
                    }
                }

                if (p < 1 || particles.length > 0) requestAnimationFrame(update);
                else {
                    this.scene.remove(line);
                    lineGeo.dispose();
                    lineMat.dispose();
                    resolve();
                }
            };
            update();
        });
    }
};
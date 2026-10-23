// ═══════════════════════════════════════════════════════════════
// vfx/effects/barrage.js — Savage Barrage (FIXED: deterministic + timeout)
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'https://esm.sh/three@0.160.0';
import { triggerScreenFlash } from '../screen-flash.js';

export const barrageMixin = {
    async createFireballBarrage(basePos, cameraObj, count = 14) {
        return new Promise((resolve) => {
            const group = new THREE.Group();
            group.position.copy(basePos);
            group.position.y = 0;
            this.scene.add(group);

            // ═══ TẦNG 1: TRẬN PHÁP DỰNG ĐỨNG ═══
            const bgLayers = [];
            const bgSpecs = [
                { tex: this.magicTex, scale: 25, color: 0xff2200, z: -4, opacity: 0.7, spinDir: 1, spinSpeed: 0.02 },
                { tex: this.runeTex, scale: 22, color: 0xff8800, z: -3.5, opacity: 0.6, spinDir: -1, spinSpeed: 0.03 },
                { tex: this.hexagramTex, scale: 28, color: 0xffffff, z: -4.5, opacity: 0.8, spinDir: 1, spinSpeed: 0.015 },
            ];
            bgSpecs.forEach(spec => {
                const mesh = new THREE.Mesh(
                    new THREE.PlaneGeometry(spec.scale, spec.scale),
                    new THREE.MeshBasicMaterial({ map: spec.tex, color: spec.color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false })
                );
                mesh.position.set(0, spec.scale * 0.5, spec.z);
                group.add(mesh);
                bgLayers.push({ mesh, spec, baseOpacity: spec.opacity });
            });

            // ═══ TẦNG 2: TRẬN PHÁP DƯỚI ĐẤT ═══
            const groundLayers = [];
            const groundSpecs = [
                { tex: this.magicTex, scale: 18, color: 0xff4400, opacity: 0.85, spinDir: 1, spinSpeed: 0.02 },
                { tex: this.magicTex, scale: 14, color: 0xffaa00, opacity: 0.75, spinDir: -1, spinSpeed: 0.03 },
                { tex: this.runeTex, scale: 16, color: 0xffcc00, opacity: 0.7, spinDir: 1, spinSpeed: 0.025 },
                { tex: this.hexagramTex, scale: 20, color: 0xffffff, opacity: 0.9, spinDir: -1, spinSpeed: 0.015 },
                { tex: this.sigilTex, scale: 12, color: 0xff8800, opacity: 0.8, spinDir: 1, spinSpeed: 0.04 },
            ];
            groundSpecs.forEach(spec => {
                const mesh = new THREE.Mesh(
                    new THREE.PlaneGeometry(spec.scale, spec.scale),
                    new THREE.MeshBasicMaterial({ map: spec.tex, color: spec.color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false })
                );
                mesh.rotation.x = -Math.PI / 2;
                mesh.position.y = 0.05;
                group.add(mesh);
                groundLayers.push({ mesh, spec, baseOpacity: spec.opacity });
            });

            // ═══ TẦNG 3: CỘT SÁNG ═══
            const lightPillars = [];
            for (let i = 0; i < 6; i++) {
                const geo = new THREE.CylinderGeometry(0.1, 0.4, 12, 8, 1, true);
                const mat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false });
                const mesh = new THREE.Mesh(geo, mat);
                const angle = (i / 6) * Math.PI * 2;
                const radius = 5;
                mesh.position.set(Math.cos(angle) * radius, 6, Math.sin(angle) * radius);
                group.add(mesh);
                lightPillars.push({ mesh, mat, phase: Math.random() * Math.PI * 2 });
            }

            // ═══ TẦNG 4: SÉT GIẬT ═══
            const lightning = [];
            for (let i = 0; i < 20; i++) {
                const lineGeo = new THREE.BufferGeometry();
                const pts = new Float32Array(6 * 3);
                lineGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
                const lineMat = new THREE.LineBasicMaterial({ color: 0xffdddd, transparent: true, opacity: 0 });
                const line = new THREE.Line(lineGeo, lineMat);
                group.add(line);
                lightning.push({ line, nextStrike: 0, activeUntil: 0 });
            }

            // ═══ TẦNG 5: RUNE SWARM ═══
            const runeSwarm = [];
            for (let i = 0; i < 15; i++) {
                const mat = new THREE.SpriteMaterial({ map: this.smallRuneTex, color: i % 2 ? 0xffffff : 0xff8800, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
                const sp = new THREE.Sprite(mat);
                sp.scale.setScalar(0.6);
                group.add(sp);
                runeSwarm.push({
                    sprite: sp, mat,
                    angleOffset: (i / 15) * Math.PI * 2,
                    radiusBase: 3 + Math.random() * 2,
                    yBase: 1 + Math.random() * 2,
                    speed: 0.8 + Math.random() * 0.6,
                    phase: Math.random() * Math.PI * 2,
                });
            }

            // ═══ TẦNG 6: CẦU LỬA ═══
            const fireballs = [];
            let startTime = performance.now();
            let state = 'charging';
            let elapsed = 0;
            let deadCount = 0;
            const MAX_DURATION = 5.0; // ⭐ FIX: Safety timeout

            // ⭐ FIX: Deterministic spawn — luôn đủ `count` quả
            const spawnInterval = 0.7 / count; // 0.7s / count

            // ⭐ FIX: Cleanup helper
            const cleanup = () => {
                this.scene.remove(group);
                bgLayers.forEach(l => { l.mesh.geometry.dispose(); l.mesh.material.dispose(); });
                groundLayers.forEach(l => { l.mesh.geometry.dispose(); l.mesh.material.dispose(); });
                lightPillars.forEach(l => { l.mesh.geometry.dispose(); l.mat.dispose(); });
                lightning.forEach(l => { l.line.geometry.dispose(); l.line.material.dispose(); });
                runeSwarm.forEach(r => r.mat.dispose());
                fireballs.forEach(fb => {
                    if (fb.mesh) {
                        fb.mesh.geometry.dispose();
                        if (fb.mesh.material) fb.mesh.material.dispose();
                    }
                });
                this._slowMo = 1.0;
            };

            const update = () => {
                elapsed = (performance.now() - startTime) / 1000;

                // ⭐ FIX: Safety timeout
                if (elapsed > MAX_DURATION) {
                    console.warn('[Barrage] Timeout — force cleanup');
                    cleanup();
                    resolve();
                    return;
                }

                if (state === 'charging') {
                    const p = Math.min(1, elapsed / 1.5);
                    const fadeIn = Math.min(1, elapsed / 0.5);

                    bgLayers.forEach(layer => {
                        layer.mesh.material.opacity = layer.baseOpacity * fadeIn;
                        layer.mesh.rotation.z += layer.spec.spinDir * layer.spec.spinSpeed;
                        const pulse = 1 + Math.sin(elapsed * 5) * 0.05 * p;
                        layer.mesh.scale.setScalar(pulse);
                    });

                    groundLayers.forEach(layer => {
                        layer.mesh.material.opacity = layer.baseOpacity * fadeIn;
                        layer.mesh.rotation.z += layer.spec.spinDir * layer.spec.spinSpeed * (1 + p * 2);
                        const pulse = 1 + Math.sin(elapsed * 6) * 0.03 * p;
                        layer.mesh.scale.setScalar(pulse);
                    });

                    lightPillars.forEach(pillar => {
                        pillar.mesh.material.opacity = (0.4 + Math.sin(elapsed * 8 + pillar.phase) * 0.3) * p;
                    });

                    const strikeWindows = [0.5, 1.0, 1.4];
                    strikeWindows.forEach(window => {
                        if (elapsed > window && elapsed < window + 0.15) {
                            lightning.forEach((L) => {
                                if (L.nextStrike <= elapsed) {
                                    L.nextStrike = elapsed + 0.1 + Math.random() * 0.2;
                                    L.activeUntil = elapsed + 0.05 + Math.random() * 0.1;
                                    L.line.material.opacity = 0.9;

                                    const arr = L.line.geometry.attributes.position.array;
                                    const a = Math.random() * Math.PI * 2;
                                    const r = Math.random() * 6;
                                    const startX = Math.cos(a) * r;
                                    const startZ = Math.sin(a) * r;
                                    const endX = Math.cos(a + (Math.random() - 0.5) * 0.5) * r * 0.5;
                                    const endZ = Math.sin(a + (Math.random() - 0.5) * 0.5) * r * 0.5;

                                    for (let s = 0; s < 6; s++) {
                                        const t = s / 5;
                                        const jitter = (1 - t) * 1.5;
                                        arr[s * 3] = startX + (endX - startX) * t + (Math.random() - 0.5) * jitter;
                                        arr[s * 3 + 1] = t * 12;
                                        arr[s * 3 + 2] = startZ + (endZ - startZ) * t + (Math.random() - 0.5) * jitter;
                                    }
                                    L.line.geometry.attributes.position.needsUpdate = true;
                                }
                            });
                        }
                    });
                    lightning.forEach(L => {
                        if (L.activeUntil > 0 && elapsed > L.activeUntil) {
                            L.line.material.opacity *= 0.5;
                        }
                    });

                    runeSwarm.forEach(r => {
                        const angle = r.angleOffset + elapsed * r.speed;
                        const r_radius = r.radiusBase * (0.5 + 0.5 * p);
                        r.sprite.position.x = Math.cos(angle) * r_radius;
                        r.sprite.position.z = Math.sin(angle) * r_radius;
                        r.sprite.position.y = r.yBase + Math.sin(elapsed * 4 + r.phase) * 0.5;
                        r.mat.opacity = fadeIn * (0.6 + Math.sin(elapsed * 5 + r.phase) * 0.3);
                        r.mat.rotation = angle;
                        r.sprite.scale.setScalar(0.6 + Math.sin(elapsed * 6 + r.phase) * 0.15);
                    });

                    // ⭐ FIX: Deterministic spawn — không skip frame nào
                    if (fireballs.length < count) {
                        const spawnTime = 0.8 + fireballs.length * spawnInterval;
                        if (elapsed >= spawnTime) {
                            const geo = new THREE.SphereGeometry(0.65, 20, 20);
                            const mat = new THREE.MeshStandardMaterial({ color: 0xff3300, emissive: 0xffaa00, emissiveIntensity: 3.5 });
                            const fb = new THREE.Mesh(geo, mat);

                            const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.particleTexture, color: 0xff8800, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }));
                            aura.scale.setScalar(4.0);
                            fb.add(aura);

                            const innerCore = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }));
                            fb.add(innerCore);

                            const a = (fireballs.length / count) * Math.PI * 2;
                            const r = 3 + Math.random() * 2;
                            fb.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
                            group.add(fb);
                            fireballs.push({
                                mesh: fb, startPos: fb.position.clone(), dead: false,
                                spinSpeed: 2 + Math.random() * 2,
                                risePhase: Math.random() * Math.PI * 2
                            });
                        }
                    }

                    fireballs.forEach(fb => {
                        const targetY = 3.5;
                        fb.mesh.position.y = Math.min(targetY, fb.mesh.position.y + 0.15);
                        fb.mesh.rotation.x += 0.1;
                        fb.mesh.rotation.y += 0.08;
                        const pulse = 1 + Math.sin(elapsed * 8 + fb.risePhase) * 0.1;
                        fb.mesh.scale.setScalar(pulse);
                    });

                    if (window.slingshotSystem && p > 0.5) {
                        if (Math.random() < 0.1) {
                            window.slingshotSystem._shakeScreen(0.3 + p * 0.5, 150);
                        }
                    }

                    if (p >= 1 && fireballs.length >= count) {
                        state = 'firing';
                        startTime = performance.now();
                        lightning.forEach(L => L.line.material.opacity = 0);
                        lightPillars.forEach(L => L.mesh.material.opacity = 0);
                        bgLayers.forEach(L => L.mesh.material.opacity = 0);
                        groundLayers.forEach(L => L.mesh.material.opacity = 0);
                        runeSwarm.forEach(r => r.mat.opacity = 0);

                        fireballs.forEach(fb => {
                            fb.startPos = fb.mesh.position.clone().add(basePos);
                        });
                    }
                } else if (state === 'firing') {
                    fireballs.forEach((fb, idx) => {
                        if (fb.dead) return;

                        const delay = idx * 0.03;
                        const localP = Math.max(0, Math.min(1, (elapsed - delay) / 0.35));
                        if (localP <= 0) return;

                        const currentTarget = cameraObj.position.clone();
                        const ease = 1 - Math.pow(1 - localP, 3);
                        fb.mesh.position.lerpVectors(fb.startPos, currentTarget, ease);
                        fb.mesh.rotation.x += 0.5;
                        fb.mesh.rotation.y += 0.4;

                        if (Math.random() < 0.9) {
                            this.createFireParticle(fb.mesh.position, 0xff5500);
                            this.createGhostTrail(fb.mesh.position, 0xffaa00);
                        }

                        const dist = fb.mesh.position.distanceTo(cameraObj.position);
                        if (dist < 1.0 || localP >= 1) {
                            fb.dead = true;
                            deadCount++;

                            this.createFireExplosion(fb.mesh.position, 0xff5500);
                            this.createFireExplosion(fb.mesh.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8)), 0xff8800);
                            triggerScreenFlash(this, 120);

                            if (window.slingshotSystem) {
                                window.slingshotSystem._shakeScreen(4.0, 250);
                                window.slingshotSystem._fovKick(0.4);
                            }

                            this.scene.remove(fb.mesh);
                            fb.mesh.geometry.dispose();
                            fb.mesh.material.dispose();
                        }
                    });

                    if (deadCount >= count) {
                        state = 'done';
                        cleanup();
                        this._slowMo = 0.25;
                        setTimeout(() => { this._slowMo = 1.0; }, 800);
                        resolve();
                    }
                }

                if (state !== 'done') requestAnimationFrame(update);
            };
            update();
        });
    }
};
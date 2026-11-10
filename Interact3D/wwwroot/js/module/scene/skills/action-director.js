// ═══════════════════════════════════════════════════════════════
// action-director.js — v9 (Fix Missing VFX Functions)
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'https://esm.sh/three@0.160.0';
import { magicSkillsMixin } from './magic-skills.js?v=4';

export class ActionDirector {
    constructor(scene, camera, controls, characterCtrl, emotionCtrl, boxSystem, vfxSystem) {
        this.scene = scene;
        this.camera = camera;
        this.controls = controls;
        this.ctrl = characterCtrl;
        this.emotion = emotionCtrl;
        this.boxSystem = boxSystem;
        this.vfx = vfxSystem;

        this.isPlaying = false;
        this._savedCamPos = new THREE.Vector3();
        this._savedTargetPos = new THREE.Vector3();

        console.log('[ActionDirector] Module ready (v9)');
    }

    _wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    _lockControls() {
        if (this.controls) this.controls.enabled = false;
        this._savedCamPos.copy(this.camera.position);
        this._savedTargetPos.copy(this.controls.target);
        if (this.ctrl) this.ctrl._lockGroundY = true;
    }

    _unlockControls() {
        if (this.controls) this.controls.enabled = true;
        if (this.ctrl) {
            this.ctrl._lockGroundY = false;
            this.ctrl._forceSnap();
        }
    }

    async _zoomToFace(durationMs = 800) {
        return new Promise(resolve => {
            const startPos = this.camera.position.clone();
            const charPos = this.ctrl.root.position.clone();
            charPos.y += 1.5;

            const dir = new THREE.Vector3().subVectors(this.camera.position, charPos).normalize();
            const targetPos = charPos.clone().add(dir.multiplyScalar(1.2));

            const startTime = performance.now();
            const tick = () => {
                const p = Math.min((performance.now() - startTime) / durationMs, 1);
                const ease = 1 - Math.pow(1 - p, 3);

                this.camera.position.lerpVectors(startPos, targetPos, ease);
                if (this.controls) {
                    this.controls.target.lerp(charPos, ease);
                    this.controls.update();
                }
                if (p < 1) requestAnimationFrame(tick);
                else resolve();
            };
            tick();
        });
    }

    _shakeCamera(intensity = 0.5, duration = 1000) {
        const startPos = this.camera.position.clone();
        const startTime = performance.now();
        const tick = () => {
            const elapsed = performance.now() - startTime;
            if (elapsed >= duration) {
                this.camera.position.copy(startPos);
                return;
            }
            const factor = 1 - elapsed / duration;
            const offset = intensity * factor;
            this.camera.position.x = startPos.x + (Math.random() - 0.5) * offset;
            this.camera.position.y = startPos.y + (Math.random() - 0.5) * offset;
            this.camera.position.z = startPos.z + (Math.random() - 0.5) * offset;
            requestAnimationFrame(tick);
        };
        tick();
    }

    _fallCameraToGround() {
        return new Promise(resolve => {
            const cam = this.camera;
            if (!cam) return resolve();
            const startY = cam.position.y;
            if (startY <= 1.0) return resolve();

            const startTargetY = this.controls?.target?.y ?? 0;
            const duration = 1000;
            const startTime = performance.now();

            const tick = () => {
                const p = Math.min((performance.now() - startTime) / duration, 1);
                const drop = p * p;
                cam.position.y = startY - drop * (startY - 0.2);
                if (this.controls?.target) {
                    this.controls.target.y = startTargetY - drop * (startTargetY - 0.2);
                }
                if (p < 1) requestAnimationFrame(tick);
                else { this._shakeCamera(0.6, 400); resolve(); }
            };
            tick();
        });
    }

    async playHug(mode) {
        if (this.isPlaying) return;
        this.isPlaying = true;
        this._lockControls();

        try {
            if (mode === 'gentle') {
                this.emotion.trigger('emo_bashful', { force: true });
                await this._wait(1500);
                await this._zoomToFace(800);
                this.emotion.trigger('emo_kiss', { force: true });
                await this._wait(2500);
            } else if (mode === 'normal') {
                this.emotion.trigger('shrugging', { force: true });
                await this._wait(1200);
                await this._zoomToFace(600);
                this.emotion.trigger('emo_kiss', { force: true });
                await this._wait(1500);
                this.emotion.trigger('shrugging', { force: true });
                await this._wait(1000);
            } else if (mode === 'savage') {
                this.emotion.trigger('angry', { force: true });
                await this._wait(1000);
                await this._zoomToFace(500);
                this.emotion.trigger('emo_kiss', { force: true });
                await this._wait(2000);
            }
        } finally {
            this._unlockControls();
            this.isPlaying = false;
            this.emotion.trigger('idle', { force: true });
        }
    }

    async playBlowKiss(mode) {
        if (this.isPlaying) return;
        this.isPlaying = true;
        this._lockControls();

        try {
            if (mode === 'gentle') {
                this.emotion.trigger('emo_bashful', { force: true });
                await this._wait(1000);
                await this._zoomToFace(600);
                this.emotion.trigger('emo_blow_kiss', { force: true });
                await this._wait(2000);
            } else if (mode === 'normal') {
                this.emotion.trigger('talking', { force: true });
                await this._wait(800);
                await this._zoomToFace(600);
                this.emotion.trigger('emo_blow_kiss', { force: true });
                await this._wait(2000);
            } else if (mode === 'savage') {
                this.emotion.trigger('angry', { force: true });
                await this._wait(800);
                await this._zoomToFace(500);
                this.emotion.trigger('emo_blow_kiss', { force: true });
                await this._wait(2000);
            }
        } finally {
            this._unlockControls();
            this.isPlaying = false;
            this.emotion.trigger('idle', { force: true });
        }
    }

    // ═══════════════════════════════════════════════════════════
    // PHÉP THUẬT CŨ (MAGIC ATTACK - NÉM ĐÁ) - Đã Fix VFX
    // ═══════════════════════════════════════════════════════════
    async playMagicAttack(mode) {
        if (this.isPlaying) return;
        this.isPlaying = true;
        this._lockControls();

        try {
            let forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.ctrl.root.quaternion);
            let spawnPos = this.ctrl.root.position.clone().add(forward.clone().multiplyScalar(1.0));

            if (mode === 'savage') {
                const camPos = this.camera.position;
                const charPos = this.ctrl.root.position;
                const angle = Math.atan2(camPos.x - charPos.x, camPos.z - charPos.z);
                this.ctrl.root.rotation.y = angle;
                forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.ctrl.root.quaternion);
                spawnPos = charPos.clone().add(forward.clone().multiplyScalar(1.0));
            }

            const rockGeo = new THREE.DodecahedronGeometry(0.4, 0);
            const rockMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.8, flatShading: true });
            const rock = new THREE.Mesh(rockGeo, rockMat);

            rock.position.set(spawnPos.x, 0, spawnPos.z);
            rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
            this.scene.add(rock);

            this.emotion.trigger('emo_magic_attack', { force: true });
            if (this.vfx) this.vfx.createDust(rock.position);

            await this._wait(500);
            await this._animateRockRise(rock, 1.5, 1000);

            const auraColor = mode === 'savage' ? 0xef4444 : (mode === 'normal' ? 0x38bdf8 : 0xa78bfa);

            // ⭐ FIX: Thay createAura bằng createMagicRitual
            if (this.vfx && this.vfx.createMagicRitual) {
                this.vfx.createMagicRitual(rock.position.clone(), {
                    layers: [
                        { tex: 'magicTex', scale: 2, color: auraColor, opacity: 0.8, spinDir: 1, spinSpeed: 0.05 }
                    ],
                    particleCount: 15, particleColor: auraColor, particleSpeed: 1.0,
                    duration: 2000, cameraRecoil: 0
                });
            }

            await this._wait(1500);

            if (mode === 'gentle') {
                const targetPos = rock.position.clone().add(forward.multiplyScalar(10));
                targetPos.y = 0;
                await this._animateRockFlyParabola(rock, targetPos, 1500, auraColor);
                this.emotion.trigger('looking', { force: true });
                this.scene.remove(rock);
                rockGeo.dispose();
                rockMat.dispose();
                await this._wait(1000);
                return;
            }

            let targetPos = new THREE.Vector3();

            if (mode === 'savage') {
                targetPos.copy(this.camera.position);
            } else {
                targetPos.copy(rock.position).add(forward.multiplyScalar(10));
            }

            await this._animateRockFly(rock, targetPos, 600, auraColor);

            // ⭐ FIX: Thay createExplosion bằng createFireExplosion
            if (this.vfx && this.vfx.createFireExplosion) this.vfx.createFireExplosion(targetPos, auraColor);
            this.scene.remove(rock);
            rockGeo.dispose();
            rockMat.dispose();

            if (mode === 'savage') {
                this._shakeCamera(1.5, 600);
                await this._fallCameraToGround();
                await this._wait(400);

                this.emotion.trigger('sitting', { force: true, hold: true });
                await this._wait(1000);
                await this._wait(14000);
                this.emotion.trigger('idle', { force: true });
            } else {
                this.emotion.trigger('taunt', { force: true });
                await this._wait(1500);
            }

        } catch (e) {
            console.error('[ActionDirector] Magic Error:', e);
        } finally {
            this._unlockControls();
            this.isPlaying = false;
            if (mode !== 'savage') {
                this.emotion.trigger('idle', { force: true });
            }
        }
    }

    _animateRockRise(rock, targetY, durationMs) {
        return new Promise(resolve => {
            const startY = rock.position.y;
            const startTime = performance.now();
            const tick = () => {
                const p = Math.min((performance.now() - startTime) / durationMs, 1);
                const ease = 1 - Math.pow(1 - p, 3);
                rock.position.y = startY + (targetY - startY) * ease;
                rock.rotation.y += 0.02;
                if (p < 1) requestAnimationFrame(tick);
                else resolve();
            };
            tick();
        });
    }

    _animateRockFly(rock, targetPos, durationMs, color) {
        return new Promise(resolve => {
            const startPos = rock.position.clone();
            const startTime = performance.now();
            let lastTrailTime = 0;

            const tick = () => {
                const now = performance.now();
                const p = Math.min((now - startTime) / durationMs, 1);
                rock.position.lerpVectors(startPos, targetPos, p);

                if (now - lastTrailTime > 30 && this.vfx) {
                    // ⭐ FIX: Thay createTrailParticle bằng createGhostTrail
                    if (this.vfx.createGhostTrail) this.vfx.createGhostTrail(rock.position, color);
                    lastTrailTime = now;
                }
                if (p < 1) requestAnimationFrame(tick);
                else resolve();
            };
            tick();
        });
    }

    _animateRockFlyParabola(rock, targetPos, durationMs, color) {
        return new Promise(resolve => {
            const startPos = rock.position.clone();
            const startTime = performance.now();
            let lastTrailTime = 0;

            const tick = () => {
                const now = performance.now();
                const p = Math.min((now - startTime) / durationMs, 1);

                rock.position.x = startPos.x + (targetPos.x - startPos.x) * p;
                rock.position.z = startPos.z + (targetPos.z - startPos.z) * p;
                rock.position.y = startPos.y + (targetPos.y - startPos.y) * p + Math.sin(p * Math.PI) * 5;

                if (now - lastTrailTime > 30 && this.vfx) {
                    if (this.vfx.createGhostTrail) this.vfx.createGhostTrail(rock.position, color);
                    lastTrailTime = now;
                }
                if (p < 1) requestAnimationFrame(tick);
                else resolve();
            };
            tick();
        });
    }
}

Object.assign(ActionDirector.prototype, magicSkillsMixin);
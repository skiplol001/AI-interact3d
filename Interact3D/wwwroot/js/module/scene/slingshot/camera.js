// ═══════════════════════════════════════════════════════════════
// slingshot/camera.js — Shake, FOV, chase cam, cinematic kick
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'https://esm.sh/three@0.160.0';
import { CHASE_CAM, CHASE_BACK, CHASE_UP, SEQ_LINES, pickLine } from './config.js';

export const cameraMixin = {
    _shakeScreen(intensity, duration) {
        this._shake = { intensity, duration, start: performance.now() };
    },

    _applyShake() {
        const cam = this.camera;
        if (!cam) return;
        cam.position.sub(this._shakeOffset);
        this._shakeOffset.set(0, 0, 0);
        if (!this._shake) return;
        const el = performance.now() - this._shake.start;
        if (el >= this._shake.duration) { this._shake = null; return; }
        const f = 1 - el / this._shake.duration;
        this._shakeOffset.set(
            (Math.random() - 0.5) * this._shake.intensity * f,
            (Math.random() - 0.5) * this._shake.intensity * f,
            0
        );
        cam.position.add(this._shakeOffset);
    },

    _fovKick(strength) {
        if (!this.camera || !this.camera.isPerspectiveCamera || this._fovKicking) return;
        this._fovKicking = true;
        const base = this.camera.fov;
        const kick = 4 + strength * 12;
        const start = performance.now();
        const dur = 450;
        const tick = () => {
            const t = (performance.now() - start) / dur;
            if (t >= 1) {
                this.camera.fov = base; this.camera.updateProjectionMatrix();
                this._fovKicking = false; return;
            }
            this.camera.fov = base + kick * (1 - t) * (1 - t);
            this.camera.updateProjectionMatrix();
            requestAnimationFrame(tick);
        };
        tick();
    },

    _powerColor(p) {
        if (p > 0.8) return 0xff0044;
        if (p > 0.5) return 0xa78bfa;
        return 0x00ffff;
    },

    _beginCamReturn() {
        if (!CHASE_CAM) return;
        this._camReturn = { t: 0, dur: 1.4 };
    },

    _updateCamera(dt) {
        const controls = window.controls;
        if (!controls) return;

        if (this._isCinematic && this.rock) {
            this._cinematicTimer += dt;
            if (!CHASE_CAM && this.isFlying) {
                controls.target.lerp(this.rock.position, 5 * dt);
                controls.update();
            }
            if (this._cinematicTimer > this._cinematicDuration) this._isCinematic = false;
        }

        if (CHASE_CAM && this.isFlying && !this.isAiming && this.rock) {
            const speed = this.rockVelocity.length();
            if (speed > 2) this._lastChaseDir.copy(this.rockVelocity).divideScalar(speed);
            const dir = this._lastChaseDir;

            const desired = this._tmpV.copy(this.rock.position).addScaledVector(dir, -CHASE_BACK);
            desired.y += CHASE_UP;
            if (desired.y < 0.6) desired.y = 0.6;
            this.camera.position.lerp(desired, 1 - Math.exp(-5 * dt));

            const look = this._tmpV2.copy(this.rock.position).addScaledVector(dir, 4);
            controls.target.lerp(look, 1 - Math.exp(-10 * dt));
            controls.update();
            this._camReturn = null;
        } else if (this._camReturn && !this.isAiming) {
            this._camReturn.t += dt;
            const k = 1 - Math.exp(-4 * dt);
            this.camera.position.lerp(this._savedCamPos, k);
            controls.target.lerp(this._savedCamTarget, k);
            controls.update();
            if (this._camReturn.t > this._camReturn.dur) this._camReturn = null;
        }
    },

    async _cinematicCameraKick() {
        const cam = this.camera;
        const controls = window.controls;
        const ctrl = this.ctrl;
        if (!cam || !controls || !ctrl) return;

        const savedPos = cam.position.clone();
        const savedTarget = controls.target.clone();
        const savedFlags = { enabled: controls.enabled, rotate: controls.enableRotate, pan: controls.enablePan, zoom: controls.enableZoom };

        window.__disableCameraControl = true;
        controls.enabled = false;

        // Phase 1: Fall to ground
        const toCharDir = new THREE.Vector3().subVectors(cam.position, ctrl.root.position);
        toCharDir.y = 0;
        if (toCharDir.lengthSq() < 0.01) toCharDir.set(0, 0, 1);
        toCharDir.normalize();

        const groundPos = ctrl.root.position.clone().addScaledVector(toCharDir, 1.8);
        groundPos.y = 0.35;

        const groundTarget = ctrl.root.position.clone();
        groundTarget.y = 1.6;

        const startPos = cam.position.clone();
        const startTarget = controls.target.clone();

        const fallDuration = 900;
        const fallStart = performance.now();

        await new Promise(resolve => {
            const tick = () => {
                const p = Math.min((performance.now() - fallStart) / fallDuration, 1);
                const ease = p * p;
                cam.position.lerpVectors(startPos, groundPos, ease);
                controls.target.lerpVectors(startTarget, groundTarget, ease);
                cam.rotation.z = Math.sin(p * Math.PI * 4) * (1 - p) * 0.4;
                cam.rotation.x = Math.cos(p * Math.PI * 3) * (1 - p) * 0.3;
                controls.update();
                if (p < 1) requestAnimationFrame(tick);
                else resolve();
            };
            tick();
        });

        cam.rotation.set(0, 0, 0);
        this._shakeScreen(2.0, 400);
        if (window.vfxSystem) window.vfxSystem.createDust(groundPos);
        await this._delay(400);

        // Phase 2: Walk to kick range
        const kickPos = ctrl.root.position.clone().addScaledVector(toCharDir, 0.9);
        kickPos.y = 0;
        ctrl.goTo(kickPos);
        await this._waitForIdle(ctrl, 3000);
        await this._delay(200);

        ctrl.root.rotation.y = Math.atan2(cam.position.x - ctrl.root.position.x, cam.position.z - ctrl.root.position.z);
        await this._delay(300);

        // Phase 3: KICK!
        if (window.emotionCtrl) window.emotionCtrl.trigger('kick', { force: true });
        this._showLine(pickLine(SEQ_LINES.savage.kickShot), 'angry');

        await this._delay(350);

        this._shakeScreen(4.5, 500);
        if (window.vfxSystem) {
            window.vfxSystem._triggerScreenFlash(200);
            window.vfxSystem.createShieldImpact(cam.position, 0xff4444);
        }

        // Phase 4: Camera flies back
        const kickStartPos = cam.position.clone();
        const kickStartTarget = controls.target.clone();
        const flyDuration = 1100;
        const flyStart = performance.now();

        await new Promise(resolve => {
            const tick = () => {
                const p = Math.min((performance.now() - flyStart) / flyDuration, 1);
                const ease = 1 - Math.pow(1 - p, 3);

                cam.position.lerpVectors(kickStartPos, savedPos, ease);
                controls.target.lerpVectors(kickStartTarget, savedTarget, ease);

                const arc = Math.sin(p * Math.PI) * 3.0;
                cam.position.y += arc;

                if (p < 0.85) {
                    const intensity = (1 - p) * 0.5;
                    cam.position.x += (Math.random() - 0.5) * intensity;
                    cam.position.z += (Math.random() - 0.5) * intensity;
                    cam.rotation.z = Math.sin(p * Math.PI * 6) * (1 - p) * 0.5;
                } else {
                    cam.rotation.z = 0;
                }

                controls.update();
                if (p < 1) requestAnimationFrame(tick);
                else resolve();
            };
            tick();
        });

        cam.rotation.set(0, 0, 0);
        this._shakeScreen(2.0, 300);
        await this._delay(300);

        cam.position.copy(savedPos);
        controls.target.copy(savedTarget);
        controls.enabled = savedFlags.enabled;
        controls.enableRotate = savedFlags.rotate;
        controls.enablePan = savedFlags.pan;
        controls.enableZoom = savedFlags.zoom;
        window.__disableCameraControl = false;
    },
};
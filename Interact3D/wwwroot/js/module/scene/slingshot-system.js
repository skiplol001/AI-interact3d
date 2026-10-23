// ═══════════════════════════════════════════════════════════════
// slingshot-system.js — v56 (cleanup _carryingSl in dispose)
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'https://esm.sh/three@0.160.0';

import {
    FLIGHT_SPEED_MULT, INITIAL_SPEED_FACTOR, ACCEL_RATE,
    PHASE_DURATIONS, PHYSICS_STEP, TRAJ_STEPS,
    MAX_FLIGHT_TIME, WORLD_LIMIT, GROUND_Y,
    getCurrentMode, pickLine,
} from './slingshot/config.js?v=1';

import { createSlingshotUI } from './slingshot/ui.js?v=1';
import { createGhostModel } from './slingshot/model.js?v=1';

import { aimMixin } from './slingshot/aim.js?v=1';
import { physicsMixin } from './slingshot/physics.js?v=3';
import { cameraMixin } from './slingshot/camera.js?v=1';
import { helpersMixin } from './slingshot/helpers.js?v=1';

import { gentleSequence } from './slingshot/sequences/gentle.js?v=1';
import { normalSequence } from './slingshot/sequences/normal.js?v=1';
import { savageSequence } from './slingshot/sequences/savage.js?v=1';

export class SlingshotSystem {
    constructor(scene, camera, canvas, characterCtrl, boxSystem) {
        this.scene = scene;
        this.camera = camera;
        this.canvas = canvas;
        this.ctrl = characterCtrl;
        this.boxSystem = boxSystem;
        this.trashCan = window.trashCan;

        this.tool = null;
        this.state = 'idle';

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

        this.slingshot = null;
        this.ghost = null;
        this.rock = null;
        this.rockLight = null;
        this.rockAura = null;
        this.projectileFX = null;
        this.rubberBands = [];
        this.chargingEffect = null;

        this.isAiming = false;
        this._isDragging = false;
        this._keys = {};

        this._aimAngle = 0;
        this._aimPitch = 0;
        this._aimPull = 0;
        this._maxPull = 1.5;

        this._dragStartX = 0;
        this._dragStartY = 0;
        this._dragStartAngle = 0;
        this._dragStartPull = 0;

        this.rockStartPos = new THREE.Vector3();
        this.rockVelocity = new THREE.Vector3();
        this.rockGravity = -15;
        this.isFlying = false;
        this.isBouncing = false;
        this.isStuck = false;
        this.stuckTimer = 0;

        this._phase = 0;
        this._flightTime = 0;
        this._physicsAccum = 0;
        this._targetSpeed = 0;
        this._phase2BoomTriggered = false;

        this._lastMagicGateTime = 0;
        this.isHittingShield = false;
        this.shieldHitTimer = 0;
        this.shieldHitDuration = 1.0;

        this._lastTrailTime = 0;
        this._lastFireTime = 0;
        this._lastRingTime = 0;
        this._shieldTriggered = false;
        this.rockPower = 0;
        this._isProcessingShot = false;

        this._isPlacementValid = false;
        this._blockedUntil = 0;
        this._pendingModeSequence = null;
        this._sequenceRunning = false;
        this._carryingSl = null;

        this._savedCamPos = new THREE.Vector3();
        this._savedCamTarget = new THREE.Vector3();

        this._isCinematic = false;
        this._cinematicTimer = 0;
        this._cinematicDuration = 1.2;
        this._fovKicking = false;
        this._launchTimer = null;
        this._cinematicEndTimer = null;

        this._shake = null;
        this._shakeOffset = new THREE.Vector3();

        this._camReturn = null;
        this._lastChaseDir = new THREE.Vector3(0, 0, 1);

        this._incomingDirection = new THREE.Vector3(0, 0, 1);
        this._ejectedTime = 0;
        this._prevVelY = 0;
        this._rockExploded = false;
        this._explodeResetTimer = 0;

        this._tmpV = new THREE.Vector3();
        this._tmpV2 = new THREE.Vector3();
        this._tmpC = new THREE.Vector3();
        this._tmpDir = new THREE.Vector3();
        this._tmpHit = new THREE.Vector3();
        this._prevPos = new THREE.Vector3();
        this._segLine = new THREE.Line3();
        this._hitBox = null;

        createSlingshotUI(this);
        this._initTrajectoryLine();
        createGhostModel(this);

        this._boundKeyDown = (e) => this._onKeyDown(e);
        this._boundKeyUp = (e) => this._onKeyUp(e);
        this._boundWheel = (e) => this._onWheel(e);
        window.addEventListener('keydown', this._boundKeyDown);
        window.addEventListener('keyup', this._boundKeyUp);
        this.canvas.addEventListener('wheel', this._boundWheel, { passive: false });
    }

    _initTrajectoryLine() {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAJ_STEPS * 3), 3));
        const mat = new THREE.LineDashedMaterial({ color: 0x00ffff, dashSize: 0.3, gapSize: 0.15, transparent: true, opacity: 1.0, linewidth: 3 });
        this.trajectoryLine = new THREE.Line(geo, mat);
        this.trajectoryLine.frustumCulled = false;
        this.trajectoryLine.visible = false;
        this.scene.add(this.trajectoryLine);
    }

    _onKeyDown(e) {
        const tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        this._keys[e.code] = true;
        if (this._isProcessingShot) return;

        if (e.key.toLowerCase() === 'f') {
            if (this.slingshot && !this.isAiming) this.enterAimMode();
            else if (this.isAiming) this.exitAimMode();
        }
        if (e.key === 'Escape' && this.isAiming) this.exitAimMode();
        if ((e.code === 'Space' || e.code === 'Enter') && this.isAiming) {
            e.preventDefault();
            if (this._aimPull > 0.1) this._shootRock();
        }
    }

    _onKeyUp(e) { this._keys[e.code] = false; }

    _onWheel(e) {
        if (this.isAiming && !this._isProcessingShot) {
            e.preventDefault();
            const delta = Math.sign(e.deltaY) * 0.05;
            this._aimPitch = Math.max(-0.5, Math.min(this._aimPitch - delta, 1.0));
            this._updateAimVisuals();
        }
    }

    _shootRock() {
        if (this.isFlying || this.isBouncing || this.isStuck || this.isHittingShield || this._isProcessingShot) return;
        if (!this.slingshot || !this.rock) return;
        this._isProcessingShot = true;
        this._isDragging = false;

        this.slingshot.updateMatrixWorld(true);
        const pull = this._aimPull;
        const pitch = this._aimPitch;
        const angle = this._aimAngle;
        const shot = {
            pull, pitch, angle,
            percent: pull / this._maxPull,
            startPos: this.slingshot.localToWorld(this.rock.position.clone()),
            quat: this.slingshot.quaternion.clone(),
            forward: new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle)).normalize(),
        };

        if (window.vfxSystem) window.vfxSystem.hideImpactMarker();
        this.trajectoryLine.visible = false;
        this.crosshairEl.style.display = 'none';
        this.controlsEl.style.display = 'none';

        this._startCinematic(shot.forward);

        if (shot.percent > 0.7) {
            if (this.rock.material) { this.rock.material.emissive.setHex(0x00ffff); this.rock.material.emissiveIntensity = 5.0; }
            this._launchTimer = setTimeout(() => {
                this._launchTimer = null;
                this._isProcessingShot = false;
                if (!this.slingshot || !this.rock) return;
                this._launchRock(shot);
            }, 600);
        } else {
            this._isProcessingShot = false;
            this._launchRock(shot);
        }
    }

    _startCinematic(forward) {
        this._savedCamPos.copy(this.camera.position);
        this._savedCamTarget.copy(window.controls?.target || new THREE.Vector3());

        if (window.controls) {
            window.controls.target.copy(this.slingshot.position.clone().add(forward.clone().multiplyScalar(5)));
            window.controls.update();
        }

        this._isCinematic = true;
        this._cinematicTimer = 0;

        clearTimeout(this._cinematicEndTimer);
        this._cinematicEndTimer = setTimeout(() => {
            window.__disableCameraControl = false;
            if (window.controls) window.controls.enabled = true;
            this.isAiming = false;
            this.state = 'flying';
        }, 300);
    }

    _launchRock(shot) {
        this.isFlying = true;
        this.rockPower = shot.percent;
        this._flightTime = 0;
        this._phase = 0;
        this._physicsAccum = 0;
        this._phase2BoomTriggered = false;
        this._lastChaseDir.copy(shot.forward);
        this._lastMagicGateTime = 0;

        this._targetSpeed = shot.pull * FLIGHT_SPEED_MULT;
        const initialSpeed = shot.pull * FLIGHT_SPEED_MULT * INITIAL_SPEED_FACTOR;
        this.rockVelocity.set(0, Math.sin(shot.pitch), Math.cos(shot.pitch)).multiplyScalar(initialSpeed).applyQuaternion(shot.quat);

        if (window.vfxSystem) window.vfxSystem.createLaunchBurst(shot.startPos, shot.forward, shot.percent);
        this._fovKick(0.3 + shot.percent * 0.7);
        this._shakeScreen(0.5 + shot.percent * 2.0, 350);

        if (this.chargingEffect) { this.chargingEffect.dispose(); this.chargingEffect = null; }

        this.scene.attach(this.rock);
        this.rock.position.copy(shot.startPos);
        this.rubberBands.forEach(b => b.visible = false);

        if (window.vfxSystem) this.projectileFX = window.vfxSystem.createProjectileEffect();

        const color = this._powerColor(shot.percent);
        if (!this.rockAura && window.vfxSystem) {
            const mat = new THREE.SpriteMaterial({ map: window.vfxSystem.particleTexture, color, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
            this.rockAura = new THREE.Sprite(mat);
            this.rock.add(this.rockAura);
        }
        if (this.rockAura) { this.rockAura.material.color.setHex(color); this.rockAura.visible = true; this.rockAura.scale.setScalar(1.6); }
        if (this.rock.material) { this.rock.material.emissive.setHex(color); this.rock.material.emissiveIntensity = 1.5 + shot.percent * 3; }
        if (this.rockLight) { this.rockLight.color.setHex(color); this.rockLight.intensity = 2 + shot.percent * 6; }
    }

    _updateProjectileFX(dt) {
        const fx = this.projectileFX;
        if (!fx || !this.rock) return;
        const active = this.isFlying || this.isHittingShield;

        let dir = null;
        if (this.isFlying && this.rockVelocity.lengthSq() > 1) dir = this._tmpDir.copy(this.rockVelocity).normalize();
        else if (this.isHittingShield) dir = this._incomingDirection;

        let intensity = 1;
        if (this.isFlying) {
            const ft = this._flightTime, P0 = PHASE_DURATIONS[0], P1 = PHASE_DURATIONS[1];
            if (ft < P0) intensity = 0.55;
            else if (ft < P0 + P1) intensity = 0.55 + 0.45 * ((ft - P0) / P1);
        }

        fx.update(dt, this.rock.position, dir, this.rockPower, active, this.rockVelocity.length(), this._powerColor(this.rockPower), intensity);
    }

    update(dt) {
        this._applyShake();
        if (this.rockAura) this.rockAura.visible = this.isFlying;
        this._updateProjectileFX(dt);
        this._updateCamera(dt);

        if (this.chargingEffect && this.slingshot && this.rock && (this.isAiming || this._isProcessingShot)) {
            const pp = this._isProcessingShot ? 1.0 : this._aimPull / this._maxPull;
            const worldPos = this.slingshot.localToWorld(this.rock.position.clone());
            this.chargingEffect.update(pp, worldPos, this._aimAngle, dt, this._aimPitch);
        }

        if (this.isAiming && this.slingshot) {
            if (!this._isProcessingShot) {
                let changed = false;
                if (this._keys['ArrowLeft'] || this._keys['KeyA']) { this._aimAngle += dt * 1.5; changed = true; }
                if (this._keys['ArrowRight'] || this._keys['KeyD']) { this._aimAngle -= dt * 1.5; changed = true; }
                if (this._keys['ArrowUp'] || this._keys['KeyW']) { this._aimPull = Math.min(this._aimPull + dt * 1.5, this._maxPull); changed = true; }
                if (this._keys['ArrowDown'] || this._keys['KeyS']) { this._aimPull = Math.max(this._aimPull - dt * 1.5, 0); changed = true; }
                if (changed) { this.slingshot.rotation.y = this._aimAngle; this._updateAimVisuals(); }
            }

            const forward = new THREE.Vector3(Math.sin(this._aimAngle), 0, Math.cos(this._aimAngle)).normalize();
            const targetCamPos = this.slingshot.position.clone().sub(forward.clone().multiplyScalar(5.0)).add(new THREE.Vector3(0, 2.5, 0));
            this.camera.position.lerp(targetCamPos, 15 * dt);

            if (window.controls) {
                const lookTarget = this.slingshot.position.clone().add(forward.clone().multiplyScalar(10)).add(new THREE.Vector3(0, 1.5, 0));
                window.controls.target.lerp(lookTarget, 15 * dt);
                window.controls.update();
            }
        }

        if (this.isHittingShield && this.rock) {
            this.shieldHitTimer += dt;
            const t = this.shieldHitTimer;

            let spinSpeed, fireRate, ringRate, glowIntensity, rockScale;
            if (t < 0.3) {
                const p = t / 0.3;
                spinSpeed = p * 60; fireRate = p; ringRate = p;
                glowIntensity = p * 3.0; rockScale = 1.0 - p * 0.1;
            } else {
                spinSpeed = 60 + Math.sin(t * 20) * 10;
                fireRate = 1.0; ringRate = 1.0;
                glowIntensity = 3.0 + Math.sin(t * 15) * 1.5; rockScale = 0.9;
            }

            this.rock.rotation.x += dt * spinSpeed;
            this.rock.rotation.z += dt * spinSpeed * 0.6;
            this.rock.rotation.y += dt * spinSpeed * 0.3;

            const shake = Math.sin(performance.now() * 0.05) * 0.02;
            this.rock.scale.set(rockScale + shake, rockScale - shake, rockScale + shake * 0.5);

            if (this.rock.material) {
                this.rock.material.emissive.setHex(0xff3300);
                this.rock.material.emissiveIntensity = glowIntensity;
            }

            const now = performance.now();
            if (fireRate > 0 && window.vfxSystem) {
                const interval = 30 / Math.max(fireRate, 0.1);
                if (now - this._lastFireTime > interval) {
                    this._lastFireTime = now;
                    const behind = this._incomingDirection.clone().negate();
                    const spawnPos = this.rock.position.clone().add(behind.clone().multiplyScalar(0.15));
                    window.vfxSystem.createFireParticle(spawnPos, 0xff5500);
                }
            }
            if (ringRate > 0 && window.vfxSystem) {
                const interval = 200 / Math.max(ringRate, 0.1);
                if (now - this._lastRingTime > interval) {
                    this._lastRingTime = now;
                    window.vfxSystem.createOrbitingRing(this.rock.position, 0x38bdf8);
                }
            }

            this._shakeScreen(0.25 + Math.sin(t * 20) * 0.1, 120);

            if (t >= this.shieldHitDuration) this._ejectFromShield();
            return;
        }

        if (this.isBouncing && this.rock && !this._rockExploded) {
            this._ejectedTime += dt;
            this.rockVelocity.y += this.rockGravity * dt;
            this.rock.position.addScaledVector(this.rockVelocity, dt);
            this.rock.rotation.x += dt * 8;
            this.rock.rotation.z += dt * 5;

            const now = performance.now();
            if (now - this._lastTrailTime > 40 && window.vfxSystem) {
                window.vfxSystem.createGhostTrail(this.rock.position, 0xff4444);
                this._lastTrailTime = now;
            }

            const atApex = this._ejectedTime > 0.3 && this._prevVelY > 0 && this.rockVelocity.y <= 0;
            const timedOut = this._ejectedTime > 1.2;
            this._prevVelY = this.rockVelocity.y;

            if (atApex || timedOut) {
                if (window.vfxSystem) window.vfxSystem.createMidAirExplosion(this.rock.position, 0xff0044);
                this._rockExploded = true;
                this.rock.visible = false;
                this._explodeResetTimer = 1.5;
                if (this.rockLight) this.rockLight.intensity = 0;
            }
            return;
        }

        if (this._rockExploded) {
            this._explodeResetTimer -= dt;
            if (this._explodeResetTimer <= 0) this._resetRock();
            return;
        }

        if (this.isFlying && this.rock) {
            this._physicsAccum += dt;

            let substeps = 0;
            while (this._physicsAccum >= PHYSICS_STEP && substeps++ < 20) {
                this._physicsAccum -= PHYSICS_STEP;
                this._prevPos.copy(this.rock.position);

                this._flightTime += PHYSICS_STEP;
                if (this._phase === 0 && this._flightTime > PHASE_DURATIONS[0]) {
                    this._phase = 1;
                } else if (this._phase === 1 && this._flightTime > PHASE_DURATIONS[0] + PHASE_DURATIONS[1]) {
                    this._phase = 2;
                    if (!this._phase2BoomTriggered) {
                        this._phase2BoomTriggered = true;
                        if (window.vfxSystem) {
                            const dir = this.rockVelocity.clone().normalize();
                            window.vfxSystem.createSonicBoom(this.rock.position.clone(), dir, this.rockPower);
                        }
                        if (this.projectileFX) this.projectileFX.pulse(0.8);
                        this._fovKick(this.rockPower * 0.6);
                        this._shakeScreen(1.0 + this.rockPower * 1.5, 250);
                    }
                }

                if (this._phase === 2) {
                    const hSpeed = Math.hypot(this.rockVelocity.x, this.rockVelocity.z);
                    if (hSpeed < this._targetSpeed && hSpeed > 0.01) {
                        const newH = Math.min(this._targetSpeed, hSpeed + ACCEL_RATE * PHYSICS_STEP);
                        const k = newH / hSpeed;
                        this.rockVelocity.x *= k;
                        this.rockVelocity.z *= k;
                    }
                }

                this.rockVelocity.y += this.rockGravity * PHYSICS_STEP;
                this.rock.position.addScaledVector(this.rockVelocity, PHYSICS_STEP);

                if (this.rock.position.y <= GROUND_Y) {
                    this._landOnGround();
                    return;
                }

                if (this._flightTime > MAX_FLIGHT_TIME || this.rock.position.length() > WORLD_LIMIT) {
                    this._resetRock();
                    return;
                }

                this._checkCollisionsSwept(this._prevPos, this.rock.position);
                if (!this.isFlying) return;
            }

            const spinSpeed = 15 + this.rockPower * 25;
            this.rock.rotation.x += dt * spinSpeed;
            this.rock.rotation.z += dt * spinSpeed * 0.7;

            const now = performance.now();

            if (this.rockPower > 0.2 && now - this._lastMagicGateTime > 100) {
                this._lastMagicGateTime = now;
                if (window.vfxSystem) {
                    const dir = this.rockVelocity.clone().normalize();
                    window.vfxSystem.createMagicGate(this.rock.position, dir, this._powerColor(this.rockPower), this.rockPower);
                }
            }

            if (now - this._lastTrailTime > 22 && window.vfxSystem) {
                const trailColor = this._powerColor(this.rockPower);
                window.vfxSystem.createGhostTrail(this.rock.position, trailColor);
                window.vfxSystem.createPowerStreak(this.rock.position, this.rockVelocity, trailColor);
                if (this.rockPower > 0.35) window.vfxSystem.createWindTears(this.rock.position, this.rockVelocity, trailColor);
                if (Math.random() < 0.5) window.vfxSystem.createFireParticle(this.rock.position, trailColor);
                this._lastTrailTime = now;
            }
        }
        else if (this.isStuck && this.rock) {
            this.stuckTimer += dt;
            if (this.stuckTimer > 2.0) {
                this.isStuck = false;
                this._resetRock();
            }
        }
    }

    async _runModeShieldHitSequence(mode) {
        if (this._sequenceRunning) return;
        this._sequenceRunning = true;
        try {
            if (mode === 'gentle') await gentleSequence(this);
            else if (mode === 'normal') await normalSequence(this);
            else if (mode === 'savage') await savageSequence(this);
        } catch (e) {
            console.warn('[Slingshot] Sequence error:', e);
        } finally {
            this._sequenceRunning = false;
        }
    }

    _cancelTimers() {
        clearTimeout(this._launchTimer); this._launchTimer = null;
        clearTimeout(this._cinematicEndTimer); this._cinematicEndTimer = null;
    }

    _clearRockState() {
        this.state = this.slingshot ? 'ready' : 'idle';
        this._aimPull = 0;
        this._shieldTriggered = false;
        this._flightTime = 0;
        this.rockPower = 0;
        this._isProcessingShot = false;
        this.isFlying = false;
        this.isBouncing = false;
        this.isStuck = false;
        this.isHittingShield = false;
        this._isCinematic = false;
        this._phase = 0;
        this._physicsAccum = 0;
        this._targetSpeed = 0;
        this._phase2BoomTriggered = false;
        this._rockExploded = false;
        this._explodeResetTimer = 0;
        this._ejectedTime = 0;
        this._prevVelY = 0;
        this._lastMagicGateTime = 0;
        this.rockVelocity.set(0, 0, 0);

        if (this.projectileFX) this.projectileFX.reset();
        if (this.rockAura) this.rockAura.visible = false;
        if (this.rock) {
            this.rock.visible = true;
            this.rock.scale.setScalar(1.0);
            if (this.rock.material) { this.rock.material.emissive.setHex(0x000000); this.rock.material.emissiveIntensity = 0; }
        }
        if (this.rockLight) this.rockLight.intensity = 0;
    }

    _discardRock() {
        if (this.rock) {
            if (this.rock.parent) this.rock.parent.remove(this.rock);
            if (this.rock.geometry) this.rock.geometry.dispose();
            if (this.rock.material) this.rock.material.dispose();
        }
        if (this.rockAura) { this.rockAura.material.dispose(); this.rockAura = null; }
        this.rock = null;
        this.rockLight = null;
        this.rubberBands = [];
    }

    _resetRock() {
        this._clearRockState();

        if (this.slingshot && this.rock) {
            this.slingshot.attach(this.rock);
            this.rock.position.copy(this.rockStartPos);
            this.rock.rotation.set(0, 0, 0);
            this.rubberBands.forEach(b => b.visible = true);
            this._updateRubberBands();
            this.state = 'ready';
            if (this.hintEl) this.hintEl.style.display = 'block';
        } else {
            this._discardRock();
        }
    }

    destroy() {
        this._cancelTimers();
        this._isProcessingShot = false;
        if (this.slingshot) {
            this.exitAimMode();
            this.scene.remove(this.slingshot);
            this.slingshot = null;
            if (this.hintEl) this.hintEl.style.display = 'none';
            this.state = 'idle';
        }
    }

    dispose() {
        this._cancelTimers();
        window.removeEventListener('keydown', this._boundKeyDown);
        window.removeEventListener('keyup', this._boundKeyUp);
        this.canvas.removeEventListener('wheel', this._boundWheel);

        if (this.camera) this.camera.position.sub(this._shakeOffset);
        this._shakeOffset.set(0, 0, 0);

        if (this._carryingSl) {
            if (this._carryingSl.parent) this._carryingSl.parent.remove(this._carryingSl);
            this._carryingSl.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                    else child.material.dispose();
                }
            });
            this._carryingSl = null;
        }

        if (this.slingshot) this.scene.remove(this.slingshot);
        if (this.ghost) this.scene.remove(this.ghost);
        if (this.trajectoryLine) this.scene.remove(this.trajectoryLine);
        if (this.hintEl) this.hintEl.remove();
        if (this.crosshairEl) this.crosshairEl.remove();
        if (this.controlsEl) this.controlsEl.remove();
        if (this.chargingEffect) this.chargingEffect.dispose();
        this._discardRock();
        this.projectileFX = null;
    }
}

Object.assign(SlingshotSystem.prototype,
    aimMixin,
    physicsMixin,
    cameraMixin,
    helpersMixin,
);
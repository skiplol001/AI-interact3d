// ═══════════════════════════════════════════════════════════════
// slingshot/aim.js — v2 (Performance Optimized)
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'https://esm.sh/three@0.160.0';
import { PHYSICS_STEP, TRAJ_STEPS, PHASE_DURATIONS, ACCEL_RATE, FLIGHT_SPEED_MULT, INITIAL_SPEED_FACTOR, GROUND_Y, HIT_RADIUS } from './config.js?v=6';
import { createSlingshot } from './model.js';
import { getPoseBox } from '../pose-utils.js';

const _tmpBox = new THREE.Box3();
const _tmpSize = new THREE.Vector3();

export const aimMixin = {
    // ═══════════════════════════════════════════════════════════
    // TOOL (được InteractionSystem.setTool gọi)
    // ═══════════════════════════════════════════════════════════
    setTool(toolId) {
        this.tool = toolId;

        if (toolId === 'place_slingshot') {
            if (this.isAiming) this.exitAimMode();
            this.state = 'placing';
            this._isPlacementValid = false;
        } else {
            if (this.state === 'placing') this.state = this.slingshot ? 'ready' : 'idle';
            if (this.ghost) this.ghost.visible = false;
        }
    },

    _updateMouse(e) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    },

    // ⭐ THROTTLE: Chỉ tính toán tối đa 60 lần/giây
    _updateAimVisuals() {
        if (this._aimUpdatePending) return;
        this._aimUpdatePending = true;

        requestAnimationFrame(() => {
            this._aimUpdatePending = false;
            if (!this.slingshot || !this.rock || this.isFlying || this.isBouncing || this._isProcessingShot) return;

            this.rock.position.copy(this.rockStartPos);
            this.rock.position.z -= this._aimPull * Math.cos(this._aimPitch);
            this.rock.position.y += this._aimPull * Math.sin(this._aimPitch);
            this._updateRubberBands();

            const pullPercent = this._aimPull / this._maxPull;
            if (this.powerFillEl) this.powerFillEl.style.width = `${pullPercent * 100}%`;
            if (this.powerValEl) this.powerValEl.textContent = `${Math.round(pullPercent * 100)}%`;
            if (this.pitchValEl) this.pitchValEl.textContent = `${Math.round(this._aimPitch * (180 / Math.PI))}°`;

            if (this._aimPull > 0.05) {
                this.slingshot.updateMatrixWorld(true);
                const initialSpeed = this._aimPull * FLIGHT_SPEED_MULT * INITIAL_SPEED_FACTOR;
                const localPullVec = new THREE.Vector3(0, Math.sin(this._aimPitch), Math.cos(this._aimPitch)).multiplyScalar(initialSpeed);
                const worldVel = localPullVec.applyQuaternion(this.slingshot.quaternion);
                const startWorldPos = this.slingshot.localToWorld(this.rock.position.clone());
                const targetSpeed = this._aimPull * FLIGHT_SPEED_MULT;

                this._updateTrajectory(startWorldPos, worldVel, targetSpeed, pullPercent);
            } else {
                this.trajectoryLine.visible = false;
                if (window.vfxSystem) window.vfxSystem.hideImpactMarker();
            }
        });
    },

    _updateTrajectory(startPos, initialVel, targetSpeed, pullPercent) {
        this.trajectoryLine.visible = true;
        const positions = this.trajectoryLine.geometry.attributes.position.array;
        const g = this.rockGravity;
        const dt = PHYSICS_STEP; // Đã tăng lên 0.03 trong config

        const pos = startPos.clone();
        const vel = initialVel.clone();
        const prev = new THREE.Vector3();
        let flightTime = 0;
        let phase = 0;
        let ended = false;
        let impactPos = null;
        let impactType = null;
        const includeChar = !this._shieldTriggered;

        // ⭐ Lấy dữ liệu ra ngoài vòng lặp để tối ưu
        const boxes = this.boxSystem ? this.boxSystem.boxes : [];
        const houseBox = (window.houseManager?.hasHouse) ? window.houseManager.getHouse().bounds : null;
        const charBox = includeChar ? getPoseBox(this.ctrl.root) : null;
        if (charBox) charBox.expandByScalar(0.25);

        for (let i = 0; i < TRAJ_STEPS; i++) {
            positions[i * 3] = pos.x;
            positions[i * 3 + 1] = pos.y;
            positions[i * 3 + 2] = pos.z;
            if (ended) continue;

            prev.copy(pos);
            flightTime += dt;
            if (phase === 0 && flightTime > PHASE_DURATIONS[0]) phase = 1;
            else if (phase === 1 && flightTime > PHASE_DURATIONS[0] + PHASE_DURATIONS[1]) phase = 2;

            if (phase === 2) {
                const hSpeed = Math.hypot(vel.x, vel.z);
                if (hSpeed < targetSpeed && hSpeed > 0.01) {
                    const newH = Math.min(targetSpeed, hSpeed + ACCEL_RATE * dt);
                    const k = newH / hSpeed;
                    vel.x *= k;
                    vel.z *= k;
                }
            }
            vel.y += g * dt;
            pos.addScaledVector(vel, dt);

            if (pos.y <= GROUND_Y) {
                pos.y = GROUND_Y;
                ended = true; impactPos = pos.clone(); impactType = 'ground';
            } else {
                // ⭐ TỐI ƯU VA CHẠM: Dùng Box3.containsPoint thay vì Raycaster
                let hitSomething = false;

                // 1. House
                if (houseBox && houseBox.containsPoint(pos)) {
                    ended = true; impactPos = pos.clone(); impactType = 'house'; hitSomething = true;
                }

                // 2. Boxes
                if (!hitSomething) {
                    for (let j = 0; j < boxes.length; j++) {
                        const b = boxes[j];
                        if (b.userData.carried) continue;
                        const e = this.boxSystem.getExtents(b);
                        _tmpSize.set(e.w + 0.24, e.h + 0.24, e.d + 0.24);
                        _tmpBox.setFromCenterAndSize(b.position, _tmpSize);
                        if (_tmpBox.containsPoint(pos)) {
                            ended = true; impactPos = pos.clone(); impactType = 'box'; hitSomething = true; break;
                        }
                    }
                }

                // 3. Character
                if (!hitSomething && charBox && charBox.containsPoint(pos)) {
                    ended = true; impactPos = pos.clone(); impactType = 'char';
                }
            }
        }

        this.trajectoryLine.geometry.attributes.position.needsUpdate = true;
        // Không cần computeLineDistances mỗi frame để đỡ tốn CPU
        // this.trajectoryLine.computeLineDistances();

        let lineColor = new THREE.Color(0x00ffff);
        if (pullPercent > 0.5) lineColor.lerp(new THREE.Color(0xa78bfa), (pullPercent - 0.5) * 2);
        if (pullPercent > 0.8) lineColor.lerp(new THREE.Color(0xff0044), (pullPercent - 0.8) * 5);
        this.trajectoryLine.material.color = lineColor;

        if (impactPos && window.vfxSystem) {
            const markerColor = impactType === 'ground' ? lineColor : new THREE.Color(0xffaa00);
            window.vfxSystem.updateImpactMarker(impactPos, markerColor);
        } else if (window.vfxSystem) {
            window.vfxSystem.hideImpactMarker();
        }
    },

    enterAimMode() {
        if (Date.now() < this._blockedUntil) {
            const remaining = Math.ceil((this._blockedUntil - Date.now()) / 1000);
            const mode = window.__currentChatMode || 'normal';
            if (window.showCharacterMessage) {
                window.showCharacterMessage(
                    mode === 'savage' ? `Đm chờ ${remaining}s nữa! 🤬` : (mode === 'gentle' ? `Chờ ${remaining}s nữa nha... 🥺` : `Chờ ${remaining}s đã! 😤`),
                    mode === 'gentle' ? 'sad' : 'angry'
                );
            }
            return;
        }
        if (!this.slingshot || this.isAiming || this.isFlying || this.isStuck || this.isHittingShield || this.isBouncing || this._rockExploded) return;
        this.isAiming = true; this.state = 'aiming';
        this._camReturn = null;
        this.hintEl.style.display = 'none'; this.crosshairEl.style.display = 'block'; this.controlsEl.style.display = 'flex';
        this._aimAngle = this.slingshot.rotation.y; this._aimPitch = 0.2; this._aimPull = 0; this._isDragging = false; this._shieldTriggered = false;
        if (window.vfxSystem) this.chargingEffect = window.vfxSystem.createChargingEffect();

        window.__disableCameraControl = true;
        if (window.controls) {
            this._savedCamPos.copy(this.camera.position);
            this._savedCamTarget.copy(window.controls.target);
            window.controls.enabled = false;
        }

        const forward = new THREE.Vector3(Math.sin(this._aimAngle), 0, Math.cos(this._aimAngle)).normalize();
        const targetCamPos = this.slingshot.position.clone().sub(forward.clone().multiplyScalar(5.0)).add(new THREE.Vector3(0, 2.5, 0));
        this.camera.position.copy(targetCamPos);

        if (window.controls) {
            const lookTarget = this.slingshot.position.clone().add(forward.clone().multiplyScalar(10)).add(new THREE.Vector3(0, 1.5, 0));
            window.controls.target.copy(lookTarget);
            window.controls.update();
        }
        this._updateAimVisuals();
    },

    exitAimMode() {
        if (!this.isAiming) return;
        this.isAiming = false; this._isDragging = false; this.state = this.slingshot ? 'ready' : 'idle';
        if (this.crosshairEl) this.crosshairEl.style.display = 'none';
        if (this.controlsEl) this.controlsEl.style.display = 'none';
        if (this.slingshot && this.hintEl) this.hintEl.style.display = 'block';
        if (this.chargingEffect) { this.chargingEffect.dispose(); this.chargingEffect = null; }
        if (window.vfxSystem) window.vfxSystem.hideImpactMarker();
        this.trajectoryLine.visible = false;

        window.__disableCameraControl = false;
        if (window.controls) {
            this.camera.position.copy(this._savedCamPos);
            window.controls.target.copy(this._savedCamTarget);
            window.controls.enabled = true;
            window.controls.update();
        }

        if (this.rock && this.slingshot && !this.isFlying && !this.isStuck && !this.isHittingShield) {
            this._aimPull = 0; this.rock.position.copy(this.rockStartPos); this._updateRubberBands();
            this.rock.material.emissive.setHex(0x000000); this.rock.material.emissiveIntensity = 0;
            this.rock.scale.setScalar(1.0);
            if (this.rockLight) this.rockLight.intensity = 0;
        }
    },

    handlePointerMove(e) {
        this._updateMouse(e);
        if (this.state === 'placing') {
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const pt = new THREE.Vector3();
            if (this.raycaster.ray.intersectPlane(this.floorPlane, pt)) {
                this.ghost.visible = true;
                this.ghost.position.set(pt.x, 0, pt.z);
                this._validatePlacement(pt);
            }
        } else if (this.isAiming && this._isDragging && !this._isProcessingShot) {
            const dx = e.clientX - this._dragStartX;
            const dy = e.clientY - this._dragStartY;
            this._aimAngle = this._dragStartAngle + dx * 0.005;
            this._aimPull = Math.max(0, Math.min(this._dragStartPull + dy * 0.005, this._maxPull));
            this.slingshot.rotation.y = this._aimAngle;
            this._updateAimVisuals();
        }
    },

    handlePointerDown(e) {
        if (e.button !== 0) return;
        this._updateMouse(e);
        if (this.state === 'placing' && this._isPlacementValid) {
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const pt = new THREE.Vector3();
            if (this.raycaster.ray.intersectPlane(this.floorPlane, pt)) createSlingshot(this, pt);
        } else if (this.isAiming && !this._isProcessingShot) {
            this._isDragging = true;
            this._dragStartX = e.clientX; this._dragStartY = e.clientY;
            this._dragStartAngle = this._aimAngle; this._dragStartPull = this._aimPull;
        }
    },

    handlePointerUp(e) {
        if (e.button === 0 && this.isAiming && this._isDragging) this._isDragging = false;
    },

    _validatePlacement(pt) {
        let isValid = true; const checkRadius = 0.8;
        if (this.boxSystem) for (const box of this.boxSystem.boxes) if (box.position.distanceTo(pt) < checkRadius) { isValid = false; break; }
        if (this.trashCan && this.trashCan.group) if (this.trashCan.group.position.distanceTo(pt) < checkRadius) isValid = false;
        if (this.ctrl && this.ctrl.root) if (this.ctrl.root.position.distanceTo(pt) < checkRadius) isValid = false;
        this.ghost.children.forEach(c => { if (c.material) c.material.color.setHex(isValid ? 0x38bdf8 : 0xef4444); });
        this._isPlacementValid = isValid;
    },

    _updateRubberBands() {
        if (!this.rubberBands || this.rubberBands.length < 2 || !this.rock) return;
        this._positionCylinderBetween(this.rubberBands[0], new THREE.Vector3(-0.2, 1.05, 0), this.rock.position);
        this._positionCylinderBetween(this.rubberBands[1], new THREE.Vector3(0.2, 1.05, 0), this.rock.position);
    },

    _positionCylinderBetween(mesh, start, end) {
        const dir = new THREE.Vector3().subVectors(end, start);
        const len = dir.length();
        mesh.position.copy(start).add(dir.multiplyScalar(0.5));
        mesh.scale.set(1, len, 1);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    },
};
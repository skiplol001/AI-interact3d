// ═══════════════════════════════════════════════════════════════
// slingshot/physics.js — v6 (Fixed shakeScreen & House Collision)
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'https://esm.sh/three@0.160.0';
import { HIT_RADIUS, GROUND_Y } from './config.js?v=1';

const _tmpRay = new THREE.Ray();
const _tmpHitPos = new THREE.Vector3();
const _tmpDir = new THREE.Vector3();

export const physicsMixin = {
    _findObstacleHit(prevPos, currPos, out, includeChar) {
        const seg = this._segLine;
        seg.start.copy(prevPos);
        seg.end.copy(currPos);
        const tmp = this._tmpV2;
        this._hitBox = null;

        // ═══ 1. HOUSE FIRST (Primitive Model Bounds) ═══
        if (window.houseManager?.hasHouse) {
            try {
                const house = window.houseManager.getHouse();
                if (house && house.bounds && !house.bounds.isEmpty()) {
                    // Check điểm cuối nằm trong nhà (trường hợp bay quá nhanh xuyên thẳng vào)
                    if (house.bounds.containsPoint(currPos)) {
                        out.copy(currPos);
                        return 'house';
                    }

                    // Check ray cắt qua hộp (Box3)
                    _tmpDir.copy(currPos).sub(prevPos);
                    const segLen = _tmpDir.length();
                    if (segLen > 0.0001) {
                        _tmpDir.divideScalar(segLen);
                        _tmpRay.set(prevPos, _tmpDir);
                        if (_tmpRay.intersectBox(house.bounds, _tmpHitPos)) {
                            const distToHit = prevPos.distanceTo(_tmpHitPos);
                            if (distToHit <= segLen + 0.1) {
                                out.copy(_tmpHitPos);
                                return 'house';
                            }
                        }
                    }
                }
            } catch (e) { /* bỏ qua */ }
        }

        // ═══ 2. BOXES ═══
        if (this.boxSystem && this.boxSystem.boxes) {
            for (const box of this.boxSystem.boxes) {
                if (box.userData.carried) continue;
                seg.closestPointToPoint(box.position, true, tmp);
                if (tmp.distanceTo(box.position) < HIT_RADIUS.box) {
                    out.copy(tmp);
                    this._hitBox = box;
                    return 'box';
                }
            }
        }

        // ═══ 3. TRASH CAN ═══
        if (this.trashCan && this.trashCan.group) {
            const c = this._tmpC.copy(this.trashCan.group.position); c.y += 0.75;
            seg.closestPointToPoint(c, true, tmp);
            if (tmp.distanceTo(c) < HIT_RADIUS.trash) { out.copy(tmp); return 'trash'; }
        }

        // ═══ 4. CHARACTER ═══
        if (includeChar && this.ctrl && this.ctrl.root) {
            const c = this._tmpC.copy(this.ctrl.root.position); c.y += 0.9;
            seg.closestPointToPoint(c, true, tmp);
            if (tmp.distanceTo(c) < HIT_RADIUS.char) { out.copy(tmp); return 'char'; }
        }

        return null;
    },

    _checkCollisionsSwept(prevPos, currPos) {
        const point = this._tmpHit;
        const type = this._findObstacleHit(prevPos, currPos, point, !this._shieldTriggered);
        if (!type) return;

        const power = this.rockVelocity.length();
        const sparkColor = power > 30 ? 0xff0044 : (power > 20 ? 0xa78bfa : 0x38bdf8);

        // ═══ HOUSE HIT ═══
        if (type === 'house') {
            if (window.vfxSystem) {
                window.vfxSystem.createFireExplosion(point.clone(), sparkColor);
                if (power > 25) window.vfxSystem.createMidAirExplosion(point.clone(), sparkColor);

                const groundPoint = point.clone();
                groundPoint.y = 0.05;
                if (window.vfxSystem.createGroundImpact) {
                    window.vfxSystem.createGroundImpact(groundPoint, Math.min(power / 40, 1.5), sparkColor);
                }
            }
            this._shakeScreen(1.5 + Math.min(power / 40, 1.5), 400);
            this._stopFlight();

            if (window.houseManager) {
                try { window.houseManager.onHouseAttemptDestroy(); } catch (e) {
                    console.warn('[Physics] houseManager.onHouseAttemptDestroy error:', e);
                }
            }
            return;
        }

        // ═══ BOX HIT ═══
        if (type === 'box') {
            const dir = this.rockVelocity.clone().normalize();
            const radius = 2.0 + Math.min(power * 0.15, 8.0);

            const blastResults = this.boxSystem.blastBoxes(point, dir, power, radius);
            console.log(`[Slingshot] 💥 ĐẠI BÁC NỔ! power=${power.toFixed(1)} · radius=${radius.toFixed(1)}m · ảnh hưởng ${blastResults.length} box`);

            if (window.vfxSystem) {
                window.vfxSystem.createFireExplosion(point, sparkColor);
                if (power > 25) window.vfxSystem.createMidAirExplosion(point, sparkColor);
                if (power > 35) {
                    const groundPoint = point.clone();
                    groundPoint.y = 0.05;
                    if (window.vfxSystem.createGroundImpact) {
                        window.vfxSystem.createGroundImpact(groundPoint, Math.min(power / 40, 2.0), sparkColor);
                    }
                }
                if (window.vfxSystem.createOrbitingRing && power > 30) {
                    const ringCount = Math.min(Math.ceil(power / 20), 4);
                    for (let i = 0; i < ringCount; i++) {
                        setTimeout(() => {
                            if (window.vfxSystem?.createOrbitingRing) {
                                window.vfxSystem.createOrbitingRing(point, sparkColor);
                            }
                        }, i * 80);
                    }
                }
            }

            const shakeIntensity = 0.4 + Math.min(power / 40, 2.5);
            const shakeDuration = 250 + power * 5;
            this._shakeScreen(shakeIntensity, shakeDuration);

            this._stopFlight();
            return;
        }

        // ═══ TRASH HIT ═══
        if (type === 'trash') {
            if (window.vfxSystem) window.vfxSystem.createFireExplosion(point, sparkColor);
            if (this.trashCan) { this.trashCan._impact = Math.min(power * 0.1, 2.0); this.trashCan._t = 0; }
            this._stopFlight();
            return;
        }

        // ═══ CHARACTER HIT ═══
        if (type === 'char' && this.ctrl && this.ctrl.root) {
            const closest = point.clone();
            this._shieldTriggered = true;
            const camPos = this.camera.position;
            const angle = Math.atan2(camPos.x - this.ctrl.root.position.x, camPos.z - this.ctrl.root.position.z);
            this.ctrl.root.rotation.y = angle;

            if (window.emotionCtrl) window.emotionCtrl.trigger('dodging', { force: true });
            if (window.AIReaction) window.AIReaction('rock_dodge');

            this._incomingDirection.copy(this.rockVelocity).normalize();

            if (window.vfxSystem) {
                window.vfxSystem.createMatrixShield(this.ctrl.root.position, closest);
                window.vfxSystem.createShieldImpact(closest, sparkColor);
            }

            this._shakeScreen(3.0, 600);

            this.isFlying = false;
            this.isHittingShield = true;
            this.shieldHitTimer = 0;
            this._lastFireTime = 0;
            this._lastRingTime = 0;
            this.rockVelocity.set(0, 0, 0);
            this.rock.position.copy(closest);

            this._pendingModeSequence = window.__currentChatMode || 'normal';
        }
    },

    _stopFlight() {
        this.isFlying = false;
        this.isStuck = true;
        this.stuckTimer = 0;
        this.rockVelocity.set(0, 0, 0);
        this._beginCamReturn();
    },

    _landOnGround() {
        const speed = this.rockVelocity.length();
        const power = Math.min(1, Math.max(0.15, speed / 60));
        this.rock.position.y = GROUND_Y;
        if (window.vfxSystem) window.vfxSystem.createGroundImpact(this.rock.position, power, this._powerColor(this.rockPower));
        this._shakeScreen(0.3 + power * 1.2, 300);
        this._stopFlight();
    },

    _ejectFromShield() {
        this.isHittingShield = false;

        const mode = this._pendingModeSequence;
        this._pendingModeSequence = null;

        if (mode === 'gentle') {
            this.isBouncing = false;
            this.isFlying = true;
            this._targetSpeed = 0;
            this._phase = 2;
            this._phase2BoomTriggered = true;
            this._physicsAccum = 0;
            this.rockVelocity.set(0, 0, 0);
            this.rock.scale.setScalar(1.0);
            if (this.rock.material) { this.rock.material.emissive.setHex(0x38bdf8); this.rock.material.emissiveIntensity = 0.6; }
            this._runModeShieldHitSequence('gentle');
            return;
        }

        this.isBouncing = true;
        this._ejectedTime = 0;
        this._prevVelY = 0;

        this.rock.scale.setScalar(1.0);
        if (this.rock.material) {
            this.rock.material.emissive.setHex(0xff0000);
            this.rock.material.emissiveIntensity = 4.0;
        }

        const dir = this._incomingDirection.clone().negate();
        dir.y = 0.5 + Math.random() * 0.3;
        dir.normalize();

        const ejectSpeed = 18 + Math.random() * 8;
        this.rockVelocity.copy(dir).multiplyScalar(ejectSpeed);
        this.rockVelocity.y = 10 + Math.random() * 4;

        if (window.vfxSystem) window.vfxSystem.createShieldImpact(this.rock.position, 0xff4444);
        this._shakeScreen(3.5, 600);

        if (mode) this._runModeShieldHitSequence(mode);
    },
};
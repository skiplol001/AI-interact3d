// ═══════════════════════════════════════════════════════════════
// slingshot/physics.js — v9 (Cannon-shell AOE + House bounds fix)
//  FIX GỐC: `window.houseManager?.hasHouse` trước đây KHÔNG được gọi () nên luôn
//  truthy → hộp bao của nhà (kể cả nhà prebuilt đang ẩn) chặn đạn giữa chừng.
//  • Đạn là ĐẠI BÁC: mọi điểm nổ (hộp / đất / nhà / thùng rác) đều gây AOE lên khối.
//  • Bán kính + lực nổ phụ thuộc vận tốc đạn (lực kéo ná).
//  • Muzzle grace: bỏ qua vật thể đang "chứa" điểm bắn trong 0.08s đầu.
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'https://esm.sh/three@0.160.0';
import {
    HIT_RADIUS, GROUND_Y,
    BLAST_RADIUS_MIN, BLAST_RADIUS_PER_POWER, BLAST_RADIUS_MAX, MUZZLE_GRACE,
} from './config.js?v=6';
import { getPoseBox } from '../pose-utils.js';

const _tmpRay = new THREE.Ray();
const _tmpHitPos = new THREE.Vector3();
const _tmpDir = new THREE.Vector3();
const _tmpBox = new THREE.Box3();
const _tmpBox2 = new THREE.Box3();
const _tmpSize = new THREE.Vector3();
const _tmpBoxHit = new THREE.Vector3();
const _tmpWorld = new THREE.Vector3();
const _bestPoint = new THREE.Vector3();
const _houseFallback = new THREE.Box3();
let _houseFallbackTs = 0;

const PROJECTILE_RADIUS = 0.12;

// Hộp bao của nhà: chỉ khi nhà ĐÃ hiện. Nếu house.bounds lỗi thời (không chứa vị trí nhà) → tính lại từ mesh đang hiển thị.
function getHouseBounds() {
    const hm = window.houseManager;
    if (!hm || typeof hm.hasHouse !== 'function') return null;
    let visible = false;
    try { visible = !!hm.hasHouse(); } catch { visible = false; }
    if (!visible) return null;

    const house = hm.getHouse ? hm.getHouse() : null;
    if (!house) return null;

    const b = house.bounds;
    if (b && b.isBox3 && !b.isEmpty()) {
        let fresh = true;
        if (house.group) {
            house.group.getWorldPosition(_tmpWorld);
            _tmpBox2.copy(b).expandByScalar(3);
            fresh = _tmpBox2.containsPoint(_tmpWorld);
        }
        if (fresh) return b;
    }

    if (!house.group) return null;
    const now = performance.now();
    if (now - _houseFallbackTs > 400) {
        _houseFallbackTs = now;
        _houseFallback.makeEmpty();
        house.group.updateWorldMatrix(true, true);
        house.group.traverseVisible((o) => {
            if (o.isMesh) _houseFallback.union(_tmpBox2.setFromObject(o));
        });
    }
    return _houseFallback.isEmpty() ? null : _houseFallback;
}

export const physicsMixin = {
    _findObstacleHit(prevPos, currPos, out, includeChar) {
        const seg = this._segLine;
        seg.start.copy(prevPos);
        seg.end.copy(currPos);
        const tmp = this._tmpV2;
        this._hitBox = null;

        _tmpDir.subVectors(currPos, prevPos);
        const segLen = _tmpDir.length();
        const hasDir = segLen > 1e-4;
        if (hasDir) _tmpDir.divideScalar(segLen);

        // Chỉ áp dụng khi đạn đang bay thật (không áp dụng cho preview quỹ đạo)
        const grace = this.isFlying && this._flightTime < MUZZLE_GRACE;

        let bestT = Infinity;
        let bestType = null;
        let bestBox = null;
        const consider = (t, type, point, box) => {
            if (t < bestT) { bestT = t; bestType = type; _bestPoint.copy(point); bestBox = box; }
        };

        // ═══ 1. HOUSE (Box3) ═══
        try {
            const bounds = getHouseBounds();
            if (bounds) {
                if (bounds.containsPoint(prevPos)) {
                    if (!grace) consider(0, 'house', prevPos, null);
                } else if (bounds.containsPoint(currPos)) {
                    consider(segLen, 'house', currPos, null);
                } else if (hasDir) {
                    _tmpRay.set(prevPos, _tmpDir);
                    const hit = _tmpRay.intersectBox(bounds, _tmpHitPos);
                    if (hit) {
                        const t = prevPos.distanceTo(hit);
                        if (t <= segLen + 0.1) consider(t, 'house', hit, null);
                    }
                }
            }
        } catch (e) { /* bỏ qua */ }

        // ═══ 2. BOXES ═══
        if (this.boxSystem && this.boxSystem.boxes) {
            for (const box of this.boxSystem.boxes) {
                if (box.userData.carried) continue;
                const e = this.boxSystem.getExtents(box);
                _tmpSize.set(e.w + PROJECTILE_RADIUS * 2, e.h + PROJECTILE_RADIUS * 2, e.d + PROJECTILE_RADIUS * 2);
                _tmpBox.setFromCenterAndSize(box.position, _tmpSize);

                if (_tmpBox.containsPoint(prevPos)) {
                    if (!grace) consider(0, 'box', prevPos, box);
                    continue;
                }
                if (!hasDir) continue;

                _tmpRay.set(prevPos, _tmpDir);
                const hit = _tmpRay.intersectBox(_tmpBox, _tmpBoxHit);
                if (hit) {
                    const t = prevPos.distanceTo(hit);
                    if (t <= segLen) consider(t, 'box', hit, box);
                }
            }
        }

        // ═══ 3. TRASH CAN ═══
        if (this.trashCan && this.trashCan.group) {
            const c = this._tmpC.copy(this.trashCan.group.position); c.y += 0.75;
            seg.closestPointToPoint(c, true, tmp);
            if (tmp.distanceTo(c) < HIT_RADIUS.trash) consider(prevPos.distanceTo(tmp), 'trash', tmp, null);
        }

        // ═══ 4. CHARACTER (AABB toàn thân) ═══
        if (includeChar && this.ctrl && this.ctrl.root) {
            const charBox = getPoseBox(this.ctrl.root);
            charBox.expandByScalar(0.25);

            if (charBox.containsPoint(prevPos)) {
                if (!grace) consider(0, 'char', prevPos, null);
            } else if (hasDir) {
                _tmpRay.set(prevPos, _tmpDir);
                const hit = _tmpRay.intersectBox(charBox, _tmpHitPos);
                if (hit) {
                    const t = prevPos.distanceTo(hit);
                    if (t <= segLen) consider(t, 'char', hit, null);
                }
            }
        }

        if (!bestType) return null;
        out.copy(_bestPoint);
        this._hitBox = bestBox;
        return bestType;
    },

    // ═══════════════════════════════════════════════════════════
    // ĐẠI BÁC: nổ AOE tại 1 điểm — tác động lên mọi khối trong bán kính
    // ═══════════════════════════════════════════════════════════
    _detonate(point, dir, power, label) {
        const radius = Math.min(BLAST_RADIUS_MAX, BLAST_RADIUS_MIN + power * BLAST_RADIUS_PER_POWER);
        const sparkColor = power > 30 ? 0xff0044 : (power > 20 ? 0xa78bfa : 0x38bdf8);

        let affected = [];
        if (this.boxSystem && typeof this.boxSystem.blastBoxes === 'function') {
            affected = this.boxSystem.blastBoxes(point, dir, power, radius) || [];
        }
        console.log(`[Slingshot] 💥 ĐẠI BÁC NỔ (${label})! power=${power.toFixed(1)} · radius=${radius.toFixed(1)}m · ảnh hưởng ${affected.length} khối`);

        const vfx = window.vfxSystem;
        if (vfx) {
            vfx.createFireExplosion(point.clone(), sparkColor);
            if (power > 22) vfx.createMidAirExplosion(point.clone(), sparkColor);
            if (vfx.createGroundImpact) {
                const gp = point.clone(); gp.y = 0.05;
                vfx.createGroundImpact(gp, Math.min(0.5 + radius / 5, 2.4), sparkColor);
            }
            if (vfx.createOrbitingRing && power > 30) {
                const ringCount = Math.min(Math.ceil(power / 20), 4);
                for (let i = 0; i < ringCount; i++) {
                    setTimeout(() => {
                        if (window.vfxSystem?.createOrbitingRing) window.vfxSystem.createOrbitingRing(point, sparkColor);
                    }, i * 80);
                }
            }
        }

        this._shakeScreen(0.5 + Math.min(power / 35, 2.6), 250 + power * 5);
        return { radius, count: affected.length };
    },

    _checkCollisionsSwept(prevPos, currPos) {
        const point = this._tmpHit;
        const type = this._findObstacleHit(prevPos, currPos, point, !this._shieldTriggered);
        if (!type) return;

        // Đọc vận tốc TRƯỚC khi _stopFlight() xoá nó
        const power = this.rockVelocity.length();
        const dir = this.rockVelocity.clone();
        if (dir.lengthSq() > 1e-6) dir.normalize();

        // ═══ HOUSE HIT ═══
        if (type === 'house') {
            this._detonate(point.clone(), dir, power, 'nhà');
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
            this._detonate(point.clone(), dir, power, 'khối');
            this._stopFlight();
            return;
        }

        // ═══ TRASH HIT ═══
        if (type === 'trash') {
            this._detonate(point.clone(), dir, power, 'thùng rác');
            if (this.trashCan) { this.trashCan._impact = Math.min(power * 0.1, 2.0); this.trashCan._t = 0; }
            this._stopFlight();
            return;
        }

        // ═══ CHARACTER HIT ═══
        if (type === 'char' && this.ctrl && this.ctrl.root) {
            const sparkColor = power > 30 ? 0xff0044 : (power > 20 ? 0xa78bfa : 0x38bdf8);
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
        const dir = this.rockVelocity.clone();
        if (dir.lengthSq() > 1e-6) dir.normalize();
        this.rock.position.y = GROUND_Y;
        // Đạn rơi xuống đất cũng nổ AOE — khối quanh điểm rơi bị hất văng
        this._detonate(this.rock.position.clone(), dir, speed, 'mặt đất');
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
            this.rock.material.emissiveIntensity = 2.5;
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
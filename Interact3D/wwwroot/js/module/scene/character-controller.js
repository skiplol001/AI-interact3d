// ═══════════════════════════════════════════════════════════════
// character-controller.js — v14 (AOE Kick & Magic VFX)
// [PART 1/2] — Imports, Constructor, State, Basic Movement
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'https://esm.sh/three@0.160.0';
import { getPoseBox } from './pose-utils.js';

const SNAP_STATES = new Set([
    'idle', 'walking', 'running', 'carryWalk', 'carryRun', 'carryIdle',
    'picking', 'putting',
]);

const HARD_SNAP_STATES = new Set(['landing']);
const NO_SNAP_STATES = new Set(['hanging', 'falling', 'surprised']);

const SNAP_DEAD_ZONES = {
    idle: 0.05, carryIdle: 0.05, walking: 0.05, running: 0.05,
    carryWalk: 0.05, carryRun: 0.05, picking: 0.005, putting: 0.005,
};

const SNAP_SPEEDS = {
    idle: 2, carryIdle: 2, walking: 6, running: 8,
    carryWalk: 5, carryRun: 6, picking: 15, putting: 15,
};

export class CharacterController {
    constructor(characterRoot, actions, options = {}) {
        this.root = characterRoot;
        this.actions = actions;
        this.state = 'idle';
        this.target = new THREE.Vector3();
        this.carriedBox = null;

        this.moveSpeed = options.moveSpeed ?? 3.5;
        this.runSpeed = options.runSpeed ?? 8.0;
        this.runThreshold = options.runThreshold ?? 4.0;

        this.floorMesh = options.floorMesh || null;
        this.boxSize = options.boxSize ?? 0.4;
        this._current = null;
        this._pendingPickup = null;
        this._pendingDrop = false;
        this._pendingNextPickup = null;

        this._pendingKickBox = null;
        this._kickTimeout = null;

        this._onStatusChange = options.onStatusChange || null;
        this._onCarryChange = options.onCarryChange || null;

        this._skipGroundSnap = false;
        this._lockGroundY = false;
        this._isScriptedMove = false;
        this._landingTimeout = null;
        this._surprisedTimeout = null;

        this._walkingStartTs = 0;
        this._walkingStuckThresholdMs = 8000;
        this._arrivalThresholdXZ = 0.2;

        this._hangingLoopDelay = null;
        this._hangingLoopInterval = null;
        this._hangingLoopMs = options.hangingLoopMs ?? 2800;

        this.APPROACH_DISTANCE = 0.9;
        this.CARRY_OFFSET_Z = 0.5;
        this.CARRY_HEIGHT = 1.1;
        this.TARGET_ANKLE_HEIGHT = 0.08;
        this.PALM_OFFSET = 0.03;
        this.BODY_RADIUS = 0.22;
        this.COLLISION_MARGIN = 0.05;

        this.leftFoot = null;
        this.rightFoot = null;
        this.handBone = null;
        this._tmpVec = new THREE.Vector3();

        characterRoot.traverse((n) => {
            if (!n.isBone) return;
            const name = n.name.toLowerCase();
            if (name.includes('leftfoot') || name.includes('left_foot')) this.leftFoot = n;
            if (name.includes('rightfoot') || name.includes('right_foot')) this.rightFoot = n;
            if (!this.handBone && (name.includes('righthand') || name.includes('right_hand'))) {
                this.handBone = n;
            }
        });
        if (!this.handBone) {
            characterRoot.traverse((n) => {
                if (n.isBone && !this.handBone && n.name.toLowerCase().includes('hand')) {
                    this.handBone = n;
                }
            });
        }

        this._raycaster = new THREE.Raycaster();
        this._rayDown = new THREE.Vector3(0, -1, 0);

        this._playAnim('idle', 0);

        const mixer = actions.idle?._mixer;
        if (mixer) {
            mixer.addEventListener('finished', (e) => {
                if (e.action === actions.pickup) this._onPickupDone();
                else if (e.action === actions.putdown) this._onPutdownDone();
                else if (e.action === actions.surprise) this._onSurpriseDone();
                else if (e.action === actions.landing) this._onLandingDone();
                else if (e.action === actions.kick) this._onKickDone();
            });
        }
    }

    _playAnim(name, fade = 0.3) {
        let next = this.actions[name];
        if (name === 'run' && !next) {
            next = this.actions['walk'];
            if (next) next.timeScale = 1.8;
        } else if (name === 'walk' && next) {
            next.timeScale = 1.0;
        }
        if (!next) return;
        if (this._current === next) return;
        if (this._current) {
            next.reset().crossFadeFrom(this._current, fade, true).play();
        } else {
            next.reset().fadeIn(fade).play();
        }
        this._current = next;
    }

    _setStatus(t) { if (this._onStatusChange) this._onStatusChange(t); }
    _notifyCarry() { if (this._onCarryChange) this._onCarryChange(this.carriedBox); }

    snapToGround() {
        if (!this.root || this._lockGroundY) return;
        const bbox = getPoseBox(this.root);
        const error = bbox.min.y;
        if (Math.abs(error) > 0.001) this.root.position.y -= error;
    }

    _forceSnap() {
        if (!this.root || this._lockGroundY) return;
        if (this._isScriptedMove) return;
        this.root.updateMatrixWorld(true);
        const bbox = getPoseBox(this.root);
        const error = bbox.min.y;
        if (Math.abs(error) > 0.001) {
            this.root.position.y -= error;
            if (Math.abs(error) > 0.1) {
                console.warn(`[CC] ForceSnap lệch lớn: ${error.toFixed(3)}m`);
            }
        }
    }

    goTo(position) {
        if (['hanging', 'falling', 'surprised', 'landing', 'kicking'].includes(this.state)) return;
        this._skipGroundSnap = false;
        this._lockGroundY = false;
        this._isScriptedMove = false;
        clearTimeout(this._landingTimeout);
        clearTimeout(this._surprisedTimeout);
        clearTimeout(this._kickTimeout);
        this.target.copy(position);
        this.target.y = 0;
        this._pendingPickup = null;
        this._pendingDrop = false;
        this._pendingNextPickup = null;
        this._pendingKickBox = null;

        const distXZ = Math.hypot(this.root.position.x - this.target.x, this.root.position.z - this.target.z);
        const shouldRun = distXZ > this.runThreshold;

        if (this.carriedBox) {
            this.state = shouldRun ? 'carryRun' : 'carryWalk';
            this._playAnim('carryWalk');
            this._setStatus(shouldRun ? 'Đang chạy (mang box)...' : 'Đang mang box đi...');
        } else {
            this.state = shouldRun ? 'running' : 'walking';
            this._playAnim(shouldRun ? 'run' : 'walk');
            this._setStatus(shouldRun ? 'Đang chạy...' : 'Đang di chuyển...');
        }
        this._walkingStartTs = performance.now();
    }

    walkToPickup(boxMesh) {
        if (this.carriedBox || ['hanging', 'falling', 'surprised', 'landing', 'kicking'].includes(this.state)) return;
        this._skipGroundSnap = false;
        this._lockGroundY = false;
        this._isScriptedMove = false;
        clearTimeout(this._landingTimeout);
        clearTimeout(this._surprisedTimeout);
        clearTimeout(this._kickTimeout);
        const dir = new THREE.Vector3().subVectors(this.root.position, boxMesh.position);
        dir.y = 0;
        if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
        dir.normalize();

        const approach = boxMesh.position.clone().addScaledVector(dir, this.APPROACH_DISTANCE);
        approach.y = 0;

        this.target.copy(approach);
        this.state = 'walkToBox';
        this._playAnim('walk');
        this._pendingPickup = { box: boxMesh };
        this._pendingDrop = false;
        this._pendingNextPickup = null;
        this._pendingKickBox = null;
        this._setStatus('Đi tới box...');
        this._walkingStartTs = performance.now();

        const lookAt = Math.atan2(-dir.x, -dir.z);
        this.root.rotation.y = lookAt;
    }

    walkToDropAt(position, nextPickupBox = null) {
        if (!this.carriedBox || ['hanging', 'falling', 'surprised', 'landing', 'kicking'].includes(this.state)) return;
        this._skipGroundSnap = false;
        this._lockGroundY = false;
        this._isScriptedMove = false;
        clearTimeout(this._landingTimeout);
        clearTimeout(this._surprisedTimeout);
        clearTimeout(this._kickTimeout);
        this.target.copy(position);
        this.target.y = 0;

        const distXZ = Math.hypot(this.root.position.x - this.target.x, this.root.position.z - this.target.z);
        this.state = distXZ > this.runThreshold ? 'carryRun' : 'carryWalk';
        this._playAnim('carryWalk');
        this._pendingDrop = true;
        this._pendingPickup = null;
        this._pendingNextPickup = nextPickupBox;
        this._pendingKickBox = null;
        this._setStatus(this.state === 'carryRun' ? 'Đang chạy (mang box)...' : 'Đi tới vị trí đặt...');
        this._walkingStartTs = performance.now();
    }

    grab() {
        if (this.carriedBox) this._onPutdownDone();
        this._pendingPickup = null;
        this._pendingDrop = false;
        this._pendingNextPickup = null;
        this._pendingKickBox = null;
        this._skipGroundSnap = true;
        this._lockGroundY = false;
        clearTimeout(this._landingTimeout);
        clearTimeout(this._surprisedTimeout);
        clearTimeout(this._kickTimeout);
        this._stopHangingLoop();

        this._surprisedTimeout = setTimeout(() => {
            if (this.state === 'surprised') {
                console.log('[CC] Surprised stuck → force hanging');
                this._onSurpriseDone();
            }
        }, 2000);

        this.state = 'surprised';
        this._playAnim('surprise', 0.15);
        this._setStatus('Giật mình!');
    }

    _onSurpriseDone() {
        if (this.state !== 'surprised') return;
        clearTimeout(this._surprisedTimeout);
        this._surprisedTimeout = null;
        this.state = 'hanging';
        this._playAnim('hanging', 0.25);
        this._setStatus('Đang lơ lửng...');
        this._startHangingLoop();
    }

    _startHangingLoop() {
        this._stopHangingLoop();
        this._hangingLoopDelay = setTimeout(() => {
            if (this.state !== 'hanging') return;
            if (window.AIReaction) window.AIReaction('hanging_complain');
            this._hangingLoopInterval = setInterval(() => {
                if (this.state !== 'hanging') { this._stopHangingLoop(); return; }
                if (window.AIReaction) window.AIReaction('hanging_complain');
            }, this._hangingLoopMs);
        }, 1500);
    }

    _stopHangingLoop() {
        clearTimeout(this._hangingLoopDelay);
        clearInterval(this._hangingLoopInterval);
        this._hangingLoopDelay = null;
        this._hangingLoopInterval = null;
    }

    release() {
        if (this.state !== 'hanging') return;
        this._stopHangingLoop();
        this.state = 'falling';
        this._playAnim('falling', 0.2);
        this._setStatus('Đang rơi...');
    }

    land() {
        this._skipGroundSnap = false;
        this._lockGroundY = false;
        this._isScriptedMove = false;
        this.state = 'landing';
        this._playAnim('landing', 0.1);
        this._setStatus('Va chạm đất!');
        setTimeout(() => this._forceSnap(), 50);
        setTimeout(() => this._forceSnap(), 300);
        setTimeout(() => this._forceSnap(), 800);
        clearTimeout(this._landingTimeout);
        this._landingTimeout = setTimeout(() => {
            if (this.state === 'landing') {
                console.log('[CC] Landing timeout -> ép về idle');
                this._onLandingDone();
            }
        }, 1500);
    }

    cancel() {
        this._pendingPickup = null;
        this._pendingDrop = false;
        this._pendingNextPickup = null;
        this._pendingKickBox = null;
        this._skipGroundSnap = false;
        this._lockGroundY = false;
        this._isScriptedMove = false;
        clearTimeout(this._landingTimeout);
        clearTimeout(this._surprisedTimeout);
        clearTimeout(this._kickTimeout);
        this._stopHangingLoop();
        this._walkingStartTs = 0;
        this.target.copy(this.root.position);

        if (['walking', 'running', 'walkToBox', 'carryWalk', 'carryRun', 'kicking'].includes(this.state)) {
            this.state = this.carriedBox ? 'carryIdle' : 'idle';
            this._playAnim(this.carriedBox ? 'carryIdle' : 'idle');
            this._setStatus(this.carriedBox ? 'Đang mang box' : 'Đứng yên');
            return true;
        }
        if (this.isBusy()) return false;
        return true;
    }

    teleport(x, z) {
        this._pendingPickup = null;
        this._pendingDrop = false;
        this._pendingNextPickup = null;
        this._pendingKickBox = null;
        this._skipGroundSnap = false;
        this._lockGroundY = false;
        this._isScriptedMove = false;
        clearTimeout(this._landingTimeout);
        clearTimeout(this._surprisedTimeout);
        clearTimeout(this._kickTimeout);
        this._stopHangingLoop();
        this._walkingStartTs = 0;
        this.root.position.set(x, this.root.position.y, z);
        this.target.copy(this.root.position);
        this.state = this.carriedBox ? 'carryIdle' : 'idle';
        this._playAnim(this.carriedBox ? 'carryIdle' : 'idle');
        this._setStatus(this.carriedBox ? 'Đang mang box' : 'Đứng yên');
        return { ok: true, pos: [x, z] };
    }

    getCurrentPosition() {
        return { x: this.root.position.x, z: this.root.position.z, rotationY: this.root.rotation.y };
    }

    loadPosition(pos) {
        const { x, z, rotationY = 0 } = pos || {};
        if (!Number.isFinite(x) || !Number.isFinite(z)) return { ok: false, error: 'Position không hợp lệ' };
        this.teleport(x, z);
        this.root.rotation.y = rotationY;
        return { ok: true };
    }

    _onLandingDone() {
        if (this.state !== 'landing') return;
        clearTimeout(this._landingTimeout);
        this._landingTimeout = null;
        this._forceSnap();
        this.state = 'idle';
        this._playAnim('idle', 0.25);
        this._setStatus('Đứng yên');
    }

    _onPickupDone() {
        if (!this._pendingPickup) return;
        const box = this._pendingPickup.box;
        this.carriedBox = box;
        this._pendingPickup = null;
        box.userData.carried = true;
        this._updateCarriedBoxTransform();
        this.state = 'carryIdle';
        this._playAnim('carryIdle');
        this._setStatus('Đang mang box');
        this._notifyCarry();
    }

    _onPutdownDone() {
        if (!this.carriedBox) return;
        const box = this.carriedBox;
        box.userData.carried = false;
        const forward = new THREE.Vector3(Math.sin(this.root.rotation.y), 0, Math.cos(this.root.rotation.y));
        const dropPos = this.root.position.clone().addScaledVector(forward, this.CARRY_OFFSET_Z);
        box.position.set(dropPos.x, this.boxSize / 2, dropPos.z);
        box.rotation.y = this.root.rotation.y;
        this.carriedBox = null;
        this._pendingDrop = false;
        this.state = 'idle';
        this._playAnim('idle');
        this._setStatus('Đứng yên');
        this._notifyCarry();
        if (this._pendingNextPickup) {
            const next = this._pendingNextPickup;
            this._pendingNextPickup = null;
            setTimeout(() => this.walkToPickup(next), 200);
        }
    }

// ═══ TIẾP THEO Ở PART 2/2 ═══
    // ═══════════════════════════════════════════════════════════════
    // character-controller.js — v14 (AOE Kick & Magic VFX)
    // [PART 2/2] — Kick Logic, VFX, Update Loop, Cleanup
    // ═══════════════════════════════════════════════════════════════

    // ⭐ LOGIC ĐÁ AOE & VFX MA PHÁP
    walkToKickBox(boxMesh) {
        if (this.carriedBox || ['hanging', 'falling', 'surprised', 'landing', 'kicking'].includes(this.state)) return;
        this._skipGroundSnap = false;
        this._lockGroundY = false;
        this._isScriptedMove = false;
        clearTimeout(this._landingTimeout);
        clearTimeout(this._surprisedTimeout);
        clearTimeout(this._kickTimeout);

        const dir = new THREE.Vector3().subVectors(this.root.position, boxMesh.position);
        dir.y = 0;
        if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
        dir.normalize();

        const approach = boxMesh.position.clone().addScaledVector(dir, 1.2);
        approach.y = 0;

        this.target.copy(approach);
        this.state = 'walkToBox';
        this._playAnim('walk');

        this._pendingPickup = null;
        this._pendingDrop = false;
        this._pendingNextPickup = null;
        this._pendingKickBox = boxMesh;

        this._setStatus('Đang tích tụ ma pháp...');
        this._walkingStartTs = performance.now();

        // ⭐ VFX: Vòng ma pháp chuẩn bị dưới chân
        if (window.vfxSystem && window.vfxSystem.createMagicRitual) {
            const ringPos = this.root.position.clone();
            ringPos.y = 0.05;
            window.vfxSystem.createMagicRitual(ringPos, {
                layers: [
                    { tex: 'magicTex', scale: 8, color: 0xffaa00, opacity: 0.8, spinDir: 1, spinSpeed: 0.05 },
                    { tex: 'runeTex', scale: 10, color: 0x00ffff, opacity: 0.9, spinDir: -1, spinSpeed: 0.06 }
                ],
                particleCount: 40, particleColor: 0xffaa00, particleSpeed: 2.5,
                duration: 2000, cameraRecoil: 0.1
            });
        }

        const lookAt = Math.atan2(-dir.x, -dir.z);
        this.root.rotation.y = lookAt;
    }

    update(dt) {
        const MOVING_STATES = ['walking', 'running', 'walkToBox', 'carryWalk', 'carryRun'];
        if (MOVING_STATES.includes(this.state)) {
            const dx = this.root.position.x - this.target.x;
            const dz = this.root.position.z - this.target.z;
            const distXZ = Math.hypot(dx, dz);

            if (distXZ > this._arrivalThresholdXZ) {
                const inv = 1 / (distXZ || 1);
                const dirX = -dx * inv;
                const dirZ = -dz * inv;

                let speed = this.moveSpeed;
                if (this.state === 'running') speed = this.runSpeed;
                else if (this.state === 'carryRun') speed = this.runSpeed * 0.8;

                const step = Math.min(speed * dt, distXZ);
                this.root.position.x += dirX * step;
                this.root.position.z += dirZ * step;

                const targetRot = Math.atan2(dirX, dirZ);
                this.root.rotation.y = THREE.MathUtils.lerp(this.root.rotation.y, targetRot, 15 * dt);
            } else {
                this.root.position.x = this.target.x;
                this.root.position.z = this.target.z;
                this.root.position.y = this.target.y;
                this._onArrived();
            }

            if (this._walkingStartTs > 0 && performance.now() - this._walkingStartTs > this._walkingStuckThresholdMs) {
                console.warn(`[CC] ⚠ Walking stuck >${this._walkingStuckThresholdMs}ms → force arrive`);
                this._walkingStartTs = 0;
                this.root.position.x = this.target.x;
                this.root.position.z = this.target.z;
                this.root.position.y = this.target.y;
                this._onArrived();
            }
        }
        if (this.carriedBox) this._updateCarriedBoxTransform();
        this._groundSnap(dt);
    }

    _groundSnap(dt) {
        if (!this.floorMesh) return;
        if (this._skipGroundSnap) return;
        if (this._isScriptedMove) return;
        if (this._lockGroundY) return;

        if (NO_SNAP_STATES.has(this.state)) return;

        if (HARD_SNAP_STATES.has(this.state)) {
            this._forceSnap();
            return;
        }

        if (!SNAP_STATES.has(this.state)) return;

        if (this.state === 'idle' || this.state === 'carryIdle') {
            const bbox = getPoseBox(this.root);
            const error = bbox.min.y;
            const deadZone = SNAP_DEAD_ZONES[this.state] ?? 0.05;
            if (Math.abs(error) < deadZone) return;
            const speed = SNAP_SPEEDS[this.state] ?? 2;
            const factor = Math.min(speed * dt, 1);
            this.root.position.y -= error * factor;
            return;
        }

        this.root.updateMatrixWorld(true);
        let minDist = Infinity;
        let hitCount = 0;

        for (const foot of [this.leftFoot, this.rightFoot]) {
            if (!foot) continue;
            foot.getWorldPosition(this._tmpVec);
            this._raycaster.set(this._tmpVec, this._rayDown);
            const hits = this._raycaster.intersectObject(this.floorMesh);
            if (hits.length > 0) {
                minDist = Math.min(minDist, hits[0].distance);
                hitCount++;
            }
        }

        if (hitCount === 0 || minDist === Infinity) return;

        const error = minDist - this.TARGET_ANKLE_HEIGHT;
        const deadZone = SNAP_DEAD_ZONES[this.state] ?? 0.05;
        if (Math.abs(error) < deadZone) return;

        const speed = SNAP_SPEEDS[this.state] ?? 6;
        const factor = Math.min(speed * dt, 1);
        this.root.position.y -= error * factor;

        if (this.root.position.y < -0.3) this.root.position.y = -0.3;
        if (this.root.position.y > 0.5) this.root.position.y = 0.5;
    }

    _onArrived() {
        this._walkingStartTs = 0;
        if (this.state === 'walkToBox' && this._pendingPickup) {
            this.state = 'picking';
            this._playAnim('pickup', 0.15);
            this._setStatus('Đang nhặt box...');
            return;
        }
        if (this.state === 'walkToBox' && this._pendingKickBox) {
            this.state = 'kicking';
            this._playAnim('kick', 0.15);
            this._setStatus('SÚT BAY!');

            // ⭐ VFX: Bùng nổ lực khi sút
            if (window.vfxSystem && window.vfxSystem.createFireExplosion) {
                const pos = this.root.position.clone();
                pos.y = 1.0;
                window.vfxSystem.createFireExplosion(pos, 0xffaa00);
                if (window.vfxSystem.createDust) window.vfxSystem.createDust(this.root.position.clone());
            }
            if (window.emotionCtrl) window.emotionCtrl.trigger('angry', { force: true });

            clearTimeout(this._kickTimeout);
            this._kickTimeout = setTimeout(() => this._onKickDone(), 1500);
            return;
        }
        if ((this.state === 'carryWalk' || this.state === 'carryRun') && this._pendingDrop) {
            this.state = 'putting';
            this._playAnim('putdown', 0.15);
            this._setStatus('Đang đặt box xuống...');
            return;
        }
        this.state = this.carriedBox ? 'carryIdle' : 'idle';
        this._playAnim(this.carriedBox ? 'carryIdle' : 'idle');
        this._setStatus(this.carriedBox ? 'Đang mang box' : 'Đứng yên');
    }

    _onKickDone() {
        clearTimeout(this._kickTimeout);
        this._kickTimeout = null;

        const box = this._pendingKickBox;
        this._pendingKickBox = null;

        if (box) {
            const angle = this.root.rotation.y;
            const forward = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));

            // ⭐ Gọi kickBox AOE (Truyền power=1.5 để có lực mạnh)
            if (window.boxSystem && window.boxSystem.kickBox) {
                window.boxSystem.kickBox(box, forward, 1.5);
            }
        }

        this.state = 'idle';
        this._playAnim('idle', 0.2);
        this._setStatus('Đứng yên');
    }

    _updateCarriedBoxTransform() {
        if (!this.carriedBox) return;
        const boxHalf = this.boxSize / 2;
        let handPos;
        if (this.handBone) {
            this.handBone.updateWorldMatrix(true, false);
            handPos = this._tmpVec;
            this.handBone.getWorldPosition(handPos);
        } else {
            handPos = this._tmpVec.copy(this.root.position);
            handPos.y = this.CARRY_HEIGHT;
        }
        const forwardX = Math.sin(this.root.rotation.y);
        const forwardZ = Math.cos(this.root.rotation.y);
        const requiredDist = this.BODY_RADIUS + this.COLLISION_MARGIN;
        const requiredDistSq = requiredDist * requiredDist;
        let pushDist = 0;
        const MAX_PUSH = 1.0;
        const STEP = 0.02;
        let testX = handPos.x;
        let testZ = handPos.z;

        while (pushDist <= MAX_PUSH) {
            testX = handPos.x + forwardX * pushDist;
            testZ = handPos.z + forwardZ * pushDist;
            const boxMinX = testX - boxHalf;
            const boxMaxX = testX + boxHalf;
            const boxMinZ = testZ - boxHalf;
            const boxMaxZ = testZ + boxHalf;
            const cx = this.root.position.x;
            const cz = this.root.position.z;
            const closestX = Math.max(boxMinX, Math.min(cx, boxMaxX));
            const closestZ = Math.max(boxMinZ, Math.min(cz, boxMaxZ));
            const dx = closestX - cx;
            const dz = closestZ - cz;
            const distSq = dx * dx + dz * dz;
            if (distSq >= requiredDistSq) break;
            pushDist += STEP;
        }
        this.carriedBox.position.set(testX, handPos.y + this.PALM_OFFSET + boxHalf, testZ);
        this.carriedBox.rotation.y = this.root.rotation.y;
    }

    getStateText() {
        const map = {
            idle: 'Đứng yên', walking: 'Đang đi bộ', running: 'Đang chạy',
            walkToBox: 'Đi tới box...', picking: 'Đang nhặt...',
            carryIdle: 'Đang mang box', carryWalk: 'Đang mang box đi', carryRun: 'Đang chạy (mang box)',
            putting: 'Đang đặt xuống...', surprised: 'Giật mình!',
            hanging: 'Đang lơ lửng', falling: 'Đang rơi...', landing: 'Tiếp đất...',
            kicking: 'Đang đá...'
        };
        return map[this.state] || this.state;
    }

    isBusy() {
        return ['picking', 'putting', 'surprised', 'hanging', 'falling', 'landing', 'kicking'].includes(this.state);
    }

    dispose() {
        if (this._current) this._current.stop();
        clearTimeout(this._landingTimeout);
        clearTimeout(this._surprisedTimeout);
        clearTimeout(this._kickTimeout);
        this._stopHangingLoop();
        this._landingTimeout = null;
        this._surprisedTimeout = null;
        this._kickTimeout = null;
        this.carriedBox = null;
    }
}
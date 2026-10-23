// ═══════════════════════════════════════════════════════════════
// CharacterController — State machine (Fix Snap Ground theo Pose)
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'https://esm.sh/three@0.160.0';
import { getPoseBox } from './pose-utils.js'; // ⭐ Import helper mới

export class CharacterController {
    constructor(characterRoot, actions, options = {}) {
        this.root = characterRoot;
        this.actions = actions;
        this.state = 'idle';
        this.target = new THREE.Vector3();
        this.carriedBox = null;
        this.moveSpeed = options.moveSpeed ?? 3.5;
        this.floorMesh = options.floorMesh || null;
        this.boxSize = options.boxSize ?? 0.4;
        this._current = null;
        this._pendingPickup = null;
        this._pendingDrop = false;
        this._pendingNextPickup = null;
        this._onStatusChange = options.onStatusChange || null;
        this._onCarryChange = options.onCarryChange || null;

        this._skipGroundSnap = false;

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
            });
        }
    }

    _playAnim(name, fade = 0.3) {
        const next = this.actions[name];
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

    // ⭐ SNAP GROUND (Dùng helper tính pose thực tế)
    snapToGround() {
        if (!this.root) return;
        const bbox = getPoseBox(this.root);
        const offset = -bbox.min.y;
        if (Math.abs(offset) > 0.005) {
            this.root.position.y += offset;
            console.log(`[CC] Snap ground: ${offset.toFixed(3)}m`);
        }
    }

    goTo(position) {
        if (['hanging', 'falling', 'surprised', 'landing'].includes(this.state)) return;
        this._skipGroundSnap = false;
        this.target.copy(position);
        this.target.y = 0;
        this._pendingPickup = null;
        this._pendingDrop = false;
        this._pendingNextPickup = null;

        if (this.carriedBox) {
            this.state = 'carryWalk';
            this._playAnim('carryWalk');
            this._setStatus('Đang mang box đi...');
        } else {
            this.state = 'walking';
            this._playAnim('walk');
            this._setStatus('Đang di chuyển...');
        }
    }

    walkToPickup(boxMesh) {
        if (this.carriedBox || ['hanging', 'falling', 'surprised', 'landing'].includes(this.state)) return;
        this._skipGroundSnap = false;
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
        this._setStatus('Đi tới box...');

        const lookAt = Math.atan2(-dir.x, -dir.z);
        this.root.rotation.y = lookAt;
    }

    walkToDropAt(position, nextPickupBox = null) {
        if (!this.carriedBox || ['hanging', 'falling', 'surprised', 'landing'].includes(this.state)) return;
        this._skipGroundSnap = false;
        this.target.copy(position);
        this.target.y = 0;
        this.state = 'carryWalk';
        this._playAnim('carryWalk');
        this._pendingDrop = true;
        this._pendingPickup = null;
        this._pendingNextPickup = nextPickupBox;
        this._setStatus('Đi tới vị trí đặt...');
    }

    grab() {
        if (this.carriedBox) this._onPutdownDone();
        this._pendingPickup = null;
        this._pendingDrop = false;
        this._pendingNextPickup = null;
        this._skipGroundSnap = true;
        this.state = 'surprised';
        this._playAnim('surprise', 0.15);
        this._setStatus('Giật mình!');
    }

    _onSurpriseDone() {
        if (this.state !== 'surprised') return;
        this.state = 'hanging';
        this._playAnim('hanging', 0.25);
        this._setStatus('Đang lơ lửng...');
    }

    release() {
        if (this.state !== 'hanging') return;
        this.state = 'falling';
        this._playAnim('falling', 0.2);
        this._setStatus('Đang rơi...');
    }

    land() {
        this._skipGroundSnap = false;
        this.state = 'landing';
        this._playAnim('landing', 0.1);
        this._setStatus('Va chạm đất!');
    }

    cancel() {
        this._pendingPickup = null;
        this._pendingDrop = false;
        this._pendingNextPickup = null;
        this._skipGroundSnap = false;
        this.target.copy(this.root.position);

        if (['walking', 'walkToBox', 'carryWalk'].includes(this.state)) {
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
        this._skipGroundSnap = false;
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

    update(dt) {
        if (['walking', 'walkToBox', 'carryWalk'].includes(this.state)) {
            const dist = this.root.position.distanceTo(this.target);
            const THRESHOLD = 0.15;
            if (dist > THRESHOLD) {
                const dir = new THREE.Vector3().subVectors(this.target, this.root.position).normalize();
                this.root.position.addScaledVector(dir, this.moveSpeed * dt);
                const targetRot = Math.atan2(dir.x, dir.z);
                this.root.rotation.y = THREE.MathUtils.lerp(this.root.rotation.y, targetRot, 15 * dt);
            } else {
                this.root.position.copy(this.target);
                this._onArrived();
            }
        }
        if (this.carriedBox) this._updateCarriedBoxTransform();
        this._groundSnap(dt);
    }

    _groundSnap(dt) {
        if (!this.floorMesh) return;
        if (this._skipGroundSnap) return;
        if (!['idle', 'walking', 'carryWalk', 'carryIdle', 'picking', 'putting', 'landing', 'surprised'].includes(this.state)) return;
        if (['hanging', 'falling'].includes(this.state)) return;

        this.root.updateMatrixWorld(true);
        let minDist = Infinity;
        for (const foot of [this.leftFoot, this.rightFoot]) {
            if (!foot) continue;
            foot.getWorldPosition(this._tmpVec);
            this._raycaster.set(this._tmpVec, this._rayDown);
            const hits = this._raycaster.intersectObject(this.floorMesh);
            if (hits.length > 0) minDist = Math.min(minDist, hits[0].distance);
        }

        if (minDist !== Infinity) {
            const error = minDist - this.TARGET_ANKLE_HEIGHT;
            const speed = ['picking', 'putting', 'landing', 'surprised'].includes(this.state) ? 30 : 12;
            const adjust = -error * Math.min(speed * dt, 1);
            this.root.position.y += adjust;
            if (this.root.position.y < -0.1) this.root.position.y = 0; // Chốt an toàn
        }
    }

    _onArrived() {
        if (this.state === 'walkToBox' && this._pendingPickup) {
            this.state = 'picking';
            this._playAnim('pickup', 0.15);
            this._setStatus('Đang nhặt box...');
            return;
        }
        if (this.state === 'carryWalk' && this._pendingDrop) {
            this.state = 'putting';
            this._playAnim('putdown', 0.15);
            this._setStatus('Đang đặt box xuống...');
            return;
        }
        this.state = this.carriedBox ? 'carryIdle' : 'idle';
        this._playAnim(this.carriedBox ? 'carryIdle' : 'idle');
        this._setStatus(this.carriedBox ? 'Đang mang box' : 'Đứng yên');
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
            idle: 'Đứng yên', walking: 'Đang đi bộ', walkToBox: 'Đi tới box...',
            picking: 'Đang nhặt...', carryIdle: 'Đang mang box', carryWalk: 'Đang mang box đi',
            putting: 'Đang đặt xuống...', surprised: 'Giật mình!', hanging: 'Đang lơ lửng',
            falling: 'Đang rơi...', landing: 'Tiếp đất...',
        };
        return map[this.state] || this.state;
    }

    isBusy() {
        return ['picking', 'putting', 'surprised', 'hanging', 'falling', 'landing'].includes(this.state);
    }

    dispose() {
        if (this._current) this._current.stop();
        this.carriedBox = null;
    }
}
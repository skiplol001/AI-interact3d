// ═══════════════════════════════════════════════════════════════
// spring-bone.js — Hệ thống vật lý mô phỏng tóc/váy/tay áo
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'https://esm.sh/three@0.160.0';

export class SpringBoneManager {
    constructor() {
        this.bones = [];
        this.gravity = new THREE.Vector3(0, -9.8, 0);
    }

    addBone(bone, options = {}) {
        const initialLocalQuat = bone.quaternion.clone();
        this.bones.push({
            bone: bone,
            stiffness: options.stiffness ?? 0.15,
            drag: options.drag ?? 0.85,
            inertia: options.inertia ?? 1.0,
            initialQuaternion: initialLocalQuat,
            velocity: new THREE.Vector3(),
            boneLength: 0
        });

        const parent = bone.parent;
        if (parent) {
            const worldPos = new THREE.Vector3();
            const parentWorldPos = new THREE.Vector3();
            bone.getWorldPosition(worldPos);
            parent.getWorldPosition(parentWorldPos);
            this.bones[this.bones.length - 1].boneLength = worldPos.distanceTo(parentWorldPos);
        }
    }

    update(delta) {
        if (this.bones.length === 0) return;
        const parentPos = new THREE.Vector3();
        const bonePos = new THREE.Vector3();
        const targetPos = new THREE.Vector3();
        const worldQuat = new THREE.Quaternion();

        const safeDelta = Math.min(delta, 0.05);

        for (const b of this.bones) {
            if (!b.bone.parent) continue;

            b.bone.getWorldPosition(bonePos);
            b.bone.parent.getWorldPosition(parentPos);

            const force = this.gravity.clone().multiplyScalar(safeDelta * b.inertia);
            b.velocity.add(force);
            b.velocity.multiplyScalar(Math.pow(b.drag, safeDelta * 60));

            targetPos.copy(bonePos).add(b.velocity);

            const parentWorldQuat = new THREE.Quaternion();
            b.bone.parent.getWorldQuaternion(parentWorldQuat);

            const restPos = new THREE.Vector3(0, b.boneLength, 0)
                .applyQuaternion(parentWorldQuat)
                .add(parentPos);

            targetPos.lerp(restPos, b.stiffness);

            const currentDir = bonePos.clone().sub(parentPos).normalize();
            const targetDir = targetPos.clone().sub(parentPos).normalize();

            const rotateQuat = new THREE.Quaternion().setFromUnitVectors(currentDir, targetDir);
            b.bone.getWorldQuaternion(worldQuat);
            worldQuat.premultiply(rotateQuat);

            const localQuat = parentWorldQuat.clone().invert().multiply(worldQuat);
            b.bone.quaternion.copy(localQuat);
            b.bone.updateMatrixWorld(true);
        }
    }
}
// ═══════════════════════════════════════════════════════════════
// vfx/effects/trail.js — Ghost, streak, wind tear, fire particle
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'https://esm.sh/three@0.160.0';

export const trailMixin = {
    createGhostTrail(position, color = 0x38bdf8) {
        const poolObj = this._getInactive(this.ghostPool);
        if (!poolObj) return;
        poolObj.active = true; poolObj.mesh.visible = true;
        poolObj.mesh.position.copy(position);
        poolObj.mesh.scale.setScalar(1.8);
        poolObj.mat.color.setHex(color);
        poolObj.mat.opacity = 0.95;
        this.activeEffects.push({ type: 'ghost', poolObj, life: 0, maxLife: 0.55 });
    },

    createWindTears(position, direction, colorHex = 0xffffff) {
        const dir = direction.clone().normalize();
        for (let i = 0; i < 2; i++) {
            const poolObj = this._getInactive(this.windTearPool);
            if (!poolObj) return;
            const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
            const offset = side.multiplyScalar(i === 0 ? 0.5 : -0.5);
            const spawnPos = position.clone().add(offset);
            poolObj.active = true; poolObj.mesh.visible = true;
            poolObj.mesh.position.copy(spawnPos);
            poolObj.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
            poolObj.mat.color.setHex(colorHex);
            poolObj.mat.opacity = 0.9;
            this.activeEffects.push({ type: 'windtear', mesh: poolObj.mesh, mat: poolObj.mat, poolObj, life: 0, maxLife: 0.6 });
        }
    },

    createPowerStreak(position, velocity, colorHex = 0x38bdf8) {
        const poolObj = this._getInactive(this.powerStreakPool);
        if (!poolObj) return;
        const speed = velocity.length();
        const dir = velocity.clone().normalize();
        poolObj.active = true;
        poolObj.group.visible = true;
        poolObj.group.position.copy(position);
        const up = new THREE.Vector3(0, 1, 0);
        poolObj.group.quaternion.setFromUnitVectors(up, dir.clone().negate());
        const speedFactor = Math.min(speed / 50, 1.5);
        const streakLength = 0.6 + speedFactor * 1.2;
        poolObj.streak.scale.set(1, streakLength, 1);
        poolObj.streak.position.y = -streakLength / 2;
        poolObj.glowMat.color.setHex(0xffffff);
        poolObj.streakMat.color.setHex(colorHex);
        poolObj.glowMat.opacity = 1.0;
        poolObj.streakMat.opacity = 0.85;
        const totalScale = 0.9 + speedFactor * 0.7;
        poolObj.group.scale.setScalar(totalScale);
        this.activeEffects.push({
            type: 'powerStreak',
            poolObj,
            life: 0,
            maxLife: 0.18 + speedFactor * 0.12,
            initialScale: totalScale,
            initialLength: streakLength,
        });
    },

    createFireParticle(position, colorHex = 0xff5500) {
        const poolObj = this._getInactive(this.trailPool);
        if (!poolObj) return;
        poolObj.active = true; poolObj.mesh.visible = true;
        poolObj.mesh.position.copy(position);
        poolObj.mesh.scale.setScalar(1.2 + Math.random() * 0.8);
        poolObj.mat.color.setHex(colorHex); poolObj.mat.opacity = 1.0;
        const velocity = new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3 + 1, (Math.random() - 0.5) * 3);
        this.activeEffects.push({ type: 'fireParticle', poolObj, velocity, life: 0, maxLife: 0.5 + Math.random() * 0.4 });
    }
};
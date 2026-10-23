// ═══════════════════════════════════════════════════════════════
// vfx/effects/explosion.js — Fire & mid-air explosions
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'https://esm.sh/three@0.160.0';

export const explosionMixin = {
    createFireExplosion(position, color = 0xff5500) {
        const poolObj = this._getInactive(this.explosionPool);
        if (!poolObj) return;
        poolObj.active = true; poolObj.mesh.visible = true;
        poolObj.mesh.position.copy(position); poolObj.mat.color.setHex(color); poolObj.mat.opacity = 1.0;
        const positions = poolObj.geo.attributes.position.array;
        const velocities = [];
        for (let i = 0; i < 100; i++) {
            positions[i * 3] = 0; positions[i * 3 + 1] = 0; positions[i * 3 + 2] = 0;
            const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
            velocities.push(dir.multiplyScalar(3 + Math.random() * 8));
        }
        poolObj.geo.attributes.position.needsUpdate = true;
        const lightObj = this._getInactive(this.lightPool);
        if (lightObj) {
            lightObj.active = true; lightObj.light.position.copy(position);
            lightObj.light.color.setHex(color); lightObj.light.intensity = 15;
        }
        this.activeEffects.push({ type: 'explosion', poolObj, lightObj, velocities, life: 0, maxLife: 0.7, gravity: -5.0 });
    },

    createMidAirExplosion(position, colorHex = 0xff0044) {
        for (let i = 0; i < 3; i++) {
            const geo = new THREE.RingGeometry(0.2, 0.32, 48);
            const mat = new THREE.MeshBasicMaterial({ color: i === 0 ? 0xffffff : colorHex, side: THREE.DoubleSide, transparent: true, opacity: 1.0, blending: THREE.AdditiveBlending, depthWrite: false });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(position);
            if (this.camera) mesh.lookAt(this.camera.position);
            this.scene.add(mesh);
            this.activeEffects.push({ type: 'cinematicShockwave', mesh, mat, geo, life: -i * 0.08, maxLife: 0.8 + i * 0.2, endScale: 5 + i * 2 });
        }
        for (let i = 0; i < 50; i++) {
            const sparkObj = this._getInactive(this.sparkPool);
            if (!sparkObj) break;
            sparkObj.active = true; sparkObj.mesh.visible = true;
            sparkObj.mesh.position.copy(position);
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const speed = 4 + Math.random() * 10;
            const dir = new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.sin(phi) * Math.sin(theta), Math.cos(phi));
            sparkObj.mat.color.setHex(i % 3 === 0 ? 0xffffff : colorHex);
            sparkObj.mat.opacity = 1.0;
            sparkObj.mesh.scale.setScalar(0.6 + Math.random() * 1.2);
            this.activeEffects.push({ type: 'spark', poolObj: sparkObj, velocity: dir.multiplyScalar(speed), life: 0, maxLife: 0.9 + Math.random() * 0.7, gravity: -10 });
        }
        for (let i = 0; i < 15; i++) {
            const fragObj = this._getInactive(this.fragmentPool);
            if (!fragObj) break;
            fragObj.active = true; fragObj.mesh.visible = true;
            fragObj.mesh.position.copy(position);
            fragObj.mesh.scale.setScalar(0.08 + Math.random() * 0.14);
            fragObj.mat.color.setHex(colorHex); fragObj.mat.emissive.setHex(colorHex); fragObj.mat.emissiveIntensity = 3.0; fragObj.mat.opacity = 1.0;
            const theta = Math.random() * Math.PI * 2;
            const speed = 3 + Math.random() * 6;
            const dir = new THREE.Vector3(Math.cos(theta), 0.4 + Math.random() * 0.9, Math.sin(theta)).normalize();
            fragObj.mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
            this.activeEffects.push({ type: 'fragment', poolObj: fragObj, velocity: dir.multiplyScalar(speed), angularVel: new THREE.Vector3((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20), life: 0, maxLife: 1.6 + Math.random() * 0.9, gravity: -14 });
        }
        this.createFireExplosion(position, 0xff5500);
        const lightObj = this._getInactive(this.lightPool);
        if (lightObj) {
            lightObj.active = true; lightObj.light.position.copy(position);
            lightObj.light.color.setHex(0xff8800); lightObj.light.intensity = 25;
            this.activeEffects.push({ type: 'lightBoost', lightObj, life: 0, maxLife: 0.6, startIntensity: 25 });
        }
    }
};
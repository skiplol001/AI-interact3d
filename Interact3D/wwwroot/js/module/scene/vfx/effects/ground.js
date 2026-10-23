// ═══════════════════════════════════════════════════════════════
// vfx/effects/ground.js — Ground impact & dust
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'https://esm.sh/three@0.160.0';

export const groundMixin = {
    createGroundImpact(position, power = 0.5, colorHex = 0x38bdf8) {
        const p = position.clone(); p.y = 0.04;
        const flash = this._getInactive(this.flashPool);
        if (flash) {
            flash.active = true; flash.mesh.visible = true;
            flash.mesh.position.copy(p).setY(0.3);
            flash.mat.color.setHex(0xffffff); flash.mat.opacity = 1.0;
            flash.mesh.scale.setScalar(0.5);
            this.activeEffects.push({ type: 'flashSprite', poolObj: flash, life: 0, maxLife: 0.35, startScale: 0.5, endScale: 2.5 + power * 4 });
        }
        const nRings = 3 + Math.round(power * 2);
        for (let i = 0; i < nRings; i++) {
            const geo = new THREE.RingGeometry(0.25, 0.4, 64);
            const mat = new THREE.MeshBasicMaterial({ color: i === 0 ? 0xffffff : colorHex, side: THREE.DoubleSide, transparent: true, opacity: 1.0, blending: THREE.AdditiveBlending, depthWrite: false });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.copy(p);
            this.scene.add(mesh);
            this.activeEffects.push({ type: 'groundRing', mesh, mat, geo, life: -i * 0.07, maxLife: 0.6 + i * 0.12, endScale: 3 + power * 7 + i * 2.5 });
        }
        const sparks = Math.floor(25 + power * 40);
        for (let i = 0; i < sparks; i++) {
            const sparkObj = this._getInactive(this.sparkPool);
            if (!sparkObj) break;
            sparkObj.active = true; sparkObj.mesh.visible = true;
            sparkObj.mesh.position.copy(p).setY(0.15);
            const theta = Math.random() * Math.PI * 2;
            const r = 2 + Math.random() * 8 * (0.5 + power);
            const up = 5 + Math.random() * 12 * (0.5 + power);
            const v = new THREE.Vector3(Math.cos(theta) * r, up, Math.sin(theta) * r);
            sparkObj.mat.color.setHex(i % 3 === 0 ? 0xffffff : (i % 3 === 1 ? 0xffaa00 : colorHex));
            sparkObj.mat.opacity = 1.0;
            sparkObj.mesh.scale.setScalar(0.6 + Math.random() * 1.2);
            this.activeEffects.push({ type: 'spark', poolObj: sparkObj, velocity: v, life: 0, maxLife: 0.5 + Math.random() * 0.6, gravity: -22 });
        }
        this.createDust(p);
        this.createFireExplosion(p.clone().setY(0.3), colorHex);
        const lightObj = this._getInactive(this.lightPool);
        if (lightObj) {
            lightObj.active = true; lightObj.light.position.copy(p).setY(0.6);
            lightObj.light.color.setHex(colorHex); lightObj.light.intensity = 25 + power * 25;
            this.activeEffects.push({ type: 'lightBoost', lightObj, life: 0, maxLife: 0.5, startIntensity: 25 + power * 25 });
        }
    },

    createDust(position) {
        const poolObj = this._getInactive(this.dustPool);
        if (!poolObj) return;
        poolObj.active = true; poolObj.mesh.visible = true;
        poolObj.mesh.position.copy(position); poolObj.mat.opacity = 0.8;
        const positions = poolObj.geo.attributes.position.array;
        const velocities = [];
        for (let i = 0; i < 30; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 1.5;
            positions[i * 3 + 1] = Math.random() * 0.2;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 1.5;
            velocities.push(new THREE.Vector3((Math.random() - 0.5) * 1.5, Math.random() * 1.5 + 0.5, (Math.random() - 0.5) * 1.5));
        }
        poolObj.geo.attributes.position.needsUpdate = true;
        this.activeEffects.push({ type: 'dust', poolObj, velocities, life: 0, maxLife: 1.5, gravity: -1.0 });
    }
};
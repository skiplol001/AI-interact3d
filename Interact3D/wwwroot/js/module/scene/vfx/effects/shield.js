// ═══════════════════════════════════════════════════════════════
// vfx/effects/shield.js — Shield effects (matrix, shatter, impact)
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'https://esm.sh/three@0.160.0';
import { triggerScreenFlash } from '../screen-flash.js';

export const shieldMixin = {
    createMatrixShield(position, impactPos = null) {
        const poolObj = this._getInactive(this.shieldPool);
        if (!poolObj) return;
        poolObj.active = true;
        poolObj.group.visible = true;
        poolObj.group.position.copy(position);
        poolObj.group.position.y += 0.9;
        poolObj.group.scale.setScalar(0.1);
        poolObj.group.rotation.set(0, 0, 0);
        poolObj.sphereMat.opacity = 1.0; poolObj.sphereMat.color.setHex(0x38bdf8);
        poolObj.icoMat.opacity = 0.8; poolObj.icoMat.color.setHex(0xffffff);
        poolObj.innerMat.opacity = 0.2; poolObj.innerMat.color.setHex(0x38bdf8);
        poolObj.rings.forEach((r, i) => {
            r.material.opacity = 0.8; r.material.color.setHex(0x60d5ff);
            r.rotation.set(0, 0, 0);
            if (i === 0) r.rotation.x = Math.PI / 2;
            if (i === 1) r.rotation.y = Math.PI / 2;
            r.rotation.z = i * 0.5;
        });
        const lightObj = this._getInactive(this.lightPool);
        if (lightObj) {
            lightObj.active = true;
            lightObj.light.position.copy(poolObj.group.position);
            lightObj.light.color.setHex(0x38bdf8);
            lightObj.light.intensity = 20;
        }
        this.activeEffects.push({ type: 'fortifiedShield', poolObj, lightObj, life: 0, maxLife: 2.8 });
    },

    createShieldShatter(position) {
        const p = position.clone(); p.y += 1.0;
        triggerScreenFlash(this, 400);
        this.createShieldImpact(p, 0x38bdf8);
        for (let i = 0; i < 60; i++) {
            const fragObj = this._getInactive(this.fragmentPool);
            if (!fragObj) break;
            fragObj.active = true; fragObj.mesh.visible = true;
            fragObj.mesh.position.copy(p);
            fragObj.mesh.scale.setScalar(0.1 + Math.random() * 0.2);
            fragObj.mat.color.setHex(0x38bdf8); fragObj.mat.emissive.setHex(0x38bdf8); fragObj.mat.emissiveIntensity = 3.0; fragObj.mat.opacity = 1.0;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const speed = 8 + Math.random() * 15;
            const dir = new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.sin(phi) * Math.sin(theta), Math.cos(phi));
            fragObj.mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
            this.activeEffects.push({
                type: 'fragment',
                poolObj: fragObj,
                velocity: dir.multiplyScalar(speed),
                angularVel: new THREE.Vector3((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20),
                life: 0,
                maxLife: 1.5 + Math.random() * 1.0,
                gravity: -9.8
            });
        }
    },

    createShieldImpact(position, colorHex = 0x38bdf8) {
        triggerScreenFlash(this, 800);
        const flashObj = this._getInactive(this.flashPool);
        if (flashObj) {
            flashObj.active = true; flashObj.mesh.visible = true;
            flashObj.mesh.position.copy(position);
            flashObj.mat.color.setHex(0xffffff); flashObj.mat.opacity = 1.0;
            flashObj.mesh.scale.setScalar(0.5);
            this.activeEffects.push({ type: 'flashSprite', poolObj: flashObj, life: 0, maxLife: 0.4, startScale: 0.5, endScale: 5.0 });
        }
        const lightObj = this._getInactive(this.lightPool);
        if (lightObj) {
            lightObj.active = true; lightObj.light.position.copy(position);
            lightObj.light.color.setHex(0xffffff); lightObj.light.intensity = 40;
            this.activeEffects.push({ type: 'lightBoost', lightObj, life: 0, maxLife: 0.7, startIntensity: 40 });
        }
        for (let i = 0; i < 5; i++) {
            const geo = new THREE.RingGeometry(0.2, 0.32, 48);
            const mat = new THREE.MeshBasicMaterial({ color: i === 0 ? 0xffffff : colorHex, side: THREE.DoubleSide, transparent: true, opacity: 1.0, blending: THREE.AdditiveBlending, depthWrite: false });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(position);
            if (this.camera) mesh.lookAt(this.camera.position);
            this.scene.add(mesh);
            this.activeEffects.push({ type: 'cinematicShockwave', mesh, mat, geo, life: -i * 0.1, maxLife: 1.0 + i * 0.25, endScale: 6 + i * 3 });
        }
        for (let i = 0; i < 80; i++) {
            const sparkObj = this._getInactive(this.sparkPool);
            if (!sparkObj) break;
            sparkObj.active = true; sparkObj.mesh.visible = true;
            sparkObj.mesh.position.copy(position);
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const speed = 4 + Math.random() * 12;
            const dir = new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.sin(phi) * Math.sin(theta), Math.cos(phi));
            sparkObj.mat.color.setHex(i % 3 === 0 ? 0xffffff : (i % 3 === 1 ? 0xffaa00 : colorHex));
            sparkObj.mat.opacity = 1.0;
            sparkObj.mesh.scale.setScalar(0.6 + Math.random() * 1.5);
            this.activeEffects.push({ type: 'spark', poolObj: sparkObj, velocity: dir.multiplyScalar(speed), life: 0, maxLife: 1.0 + Math.random() * 0.8, gravity: -10 });
        }
        for (let i = 0; i < 20; i++) {
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
        setTimeout(() => {
            const offset = new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5).add(position);
            this.createFireExplosion(offset, colorHex);
        }, 120);
        this._slowMo = 0.3;
        clearTimeout(this._slowMoTimer);
        this._slowMoTimer = setTimeout(() => { this._slowMo = 1.0; }, 800);
    }
};
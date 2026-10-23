// ═══════════════════════════════════════════════════════════════
// vfx/effects/magic.js — Magic gate & orbiting ring
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'https://esm.sh/three@0.160.0';

export const magicMixin = {
    createMagicGate(position, direction, colorHex, power) {
        const geo = new THREE.RingGeometry(0.5 + power * 0.5, 0.65 + power * 0.5, 64);
        const mat = new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide, transparent: true, opacity: 1.0, blending: THREE.AdditiveBlending, depthWrite: false });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(position);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.clone().normalize());
        this.scene.add(mesh);
        this.activeEffects.push({ type: 'magicGate', mesh, mat, geo, life: 0, maxLife: 0.6 });
    },

    createOrbitingRing(position, colorHex = 0x38bdf8) {
        const geo = new THREE.RingGeometry(0.25, 0.32, 24);
        const mat = new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide, transparent: true, opacity: 1.0, blending: THREE.AdditiveBlending, depthWrite: false });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(position);
        mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        this.scene.add(mesh);
        const spinAxis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
        this.activeEffects.push({ type: 'orbitingRing', mesh, mat, geo, spinAxis, spinSpeed: 4 + Math.random() * 5, life: 0, maxLife: 0.7 + Math.random() * 0.5, endScale: 2.5 + Math.random() * 2.5 });
    }
};
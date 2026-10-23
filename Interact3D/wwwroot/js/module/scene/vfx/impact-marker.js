// ═══════════════════════════════════════════════════════════════
// vfx/impact-marker.js — Impact marker cho trajectory preview
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'https://esm.sh/three@0.160.0';

export function createImpactMarker(scene) {
    const group = new THREE.Group();
    group.visible = false;
    const ringGeo = new THREE.RingGeometry(0.3, 0.45, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
    const ring = new THREE.Mesh(ringGeo, ringMat); ring.rotation.x = -Math.PI / 2; group.add(ring);
    const innerGeo = new THREE.RingGeometry(0.05, 0.15, 16);
    const innerMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 1.0, depthWrite: false, blending: THREE.AdditiveBlending });
    const innerRing = new THREE.Mesh(innerGeo, innerMat); innerRing.rotation.x = -Math.PI / 2; group.add(innerRing);
    const beamGeo = new THREE.CylinderGeometry(0.02, 0.4, 3, 16, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(beamGeo, beamMat); beam.position.y = 1.5; group.add(beam);
    scene.add(group);
    return { group, ring, innerRing, beam };
}

export function updateImpactMarker(marker, pos, colorHex) {
    if (!marker) return;
    marker.group.visible = true;
    marker.group.position.copy(pos);
    const color = new THREE.Color(colorHex);
    marker.ring.material.color = color;
    marker.innerRing.material.color = new THREE.Color(0xffffff);
    marker.beam.material.color = color;
}

export function hideImpactMarker(marker) {
    if (marker) marker.group.visible = false;
}
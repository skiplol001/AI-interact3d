// ═══════════════════════════════════════════════════════════════
// vfx/effects-updater.js — Pure function update cho tất cả effects
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'https://esm.sh/three@0.160.0';

const MESH_EFFECT_TYPES = new Set([
    'shockwave', 'cinematicShockwave', 'orbitingRing',
    'sonicRing', 'groundRing', 'magicGate'
]);

export function updateEffects(vfx, dt) {
    const effectiveDt = dt * (vfx._slowMo || 1.0);

    // Impact marker pulse
    if (vfx.impactMarker && vfx.impactMarker.group.visible) {
        const pulse = 1 + Math.sin(performance.now() * 0.01) * 0.1;
        vfx.impactMarker.ring.scale.setScalar(pulse);
        vfx.impactMarker.innerRing.rotation.z += dt * 2;
    }

    for (let i = vfx.activeEffects.length - 1; i >= 0; i--) {
        const effect = vfx.activeEffects[i];
        effect.life += effectiveDt;
        if (effect.life < 0) continue;
        const progress = effect.life / effect.maxLife;

        if (effect.type === 'fortifiedShield') {
            const { poolObj, lightObj } = effect;
            const t = progress;
            let scale, opacity, ringSpeed;
            if (t < 0.15) {
                const p = t / 0.15;
                scale = 0.1 + p * 0.95; opacity = p; ringSpeed = 2.0;
            } else if (t < 0.75) {
                const p = (t - 0.15) / 0.6;
                const pulse = Math.sin(p * Math.PI * 6) * 0.5 + 0.5;
                scale = 1.05 + pulse * 0.08; opacity = 0.85 + pulse * 0.15; ringSpeed = 2.0 + p * 3.0;
            } else if (t < 0.9) {
                scale = 1.13 + Math.random() * 0.03; opacity = 1.0; ringSpeed = 5.0 + (t - 0.75) / 0.15 * 5.0;
            } else {
                const p = (t - 0.9) / 0.1;
                scale = 1.13 * (1 - p * 0.3); opacity = 1.0 * (1 - p); ringSpeed = 10.0 * (1 - p);
            }
            poolObj.group.scale.setScalar(scale);
            poolObj.sphereMat.opacity = opacity * 0.7;
            poolObj.icoMat.opacity = opacity * 0.5;
            poolObj.innerMat.opacity = opacity * 0.15;
            const colorMix = Math.min(t / 0.85, 1);
            const currentColor = new THREE.Color(0x38bdf8).lerp(new THREE.Color(0xffffff), colorMix * 0.7);
            poolObj.sphereMat.color.copy(currentColor);
            poolObj.innerMat.color.copy(currentColor);
            poolObj.icoMat.color.copy(currentColor);
            poolObj.rings.forEach((r, idx) => {
                if (idx === 0) r.rotation.z += ringSpeed * effectiveDt * 0.5;
                if (idx === 1) r.rotation.x += ringSpeed * effectiveDt * 0.3;
                if (idx === 2) r.rotation.y += ringSpeed * effectiveDt * 0.4;
                r.material.opacity = opacity * 0.7;
                r.material.color.copy(currentColor);
            });
            if (lightObj) {
                if (t < 0.75) lightObj.light.intensity = 20 + Math.sin(t * 30) * 10;
                else if (t < 0.9) lightObj.light.intensity = 35;
                else lightObj.light.intensity = 35 * (1 - (t - 0.9) / 0.1);
                lightObj.light.color.copy(currentColor);
            }
        } else if (effect.type === 'explosion') {
            const positions = effect.poolObj.geo.attributes.position.array;
            for (let j = 0; j < effect.velocities.length; j++) {
                const v = effect.velocities[j];
                v.y += effect.gravity * effectiveDt;
                positions[j * 3] += v.x * effectiveDt;
                positions[j * 3 + 1] += v.y * effectiveDt;
                positions[j * 3 + 2] += v.z * effectiveDt;
            }
            effect.poolObj.geo.attributes.position.needsUpdate = true;
            effect.poolObj.mat.opacity = Math.max(0, 1 - progress);
            if (effect.lightObj) effect.lightObj.light.intensity = Math.max(0, 15 * (1 - progress));
        } else if (effect.type === 'dust') {
            const positions = effect.poolObj.geo.attributes.position.array;
            for (let j = 0; j < effect.velocities.length; j++) {
                const v = effect.velocities[j];
                v.y += effect.gravity * effectiveDt;
                positions[j * 3] += v.x * effectiveDt;
                positions[j * 3 + 1] += v.y * effectiveDt;
                positions[j * 3 + 2] += v.z * effectiveDt;
            }
            effect.poolObj.geo.attributes.position.needsUpdate = true;
            effect.poolObj.mat.opacity = Math.max(0, 0.8 * (1 - progress));
        } else if (effect.type === 'trail') {
            effect.poolObj.mat.opacity = Math.max(0, 1 - progress);
            effect.poolObj.mesh.scale.setScalar(1.5 - progress * 1.0);
        } else if (effect.type === 'speedline') {
            effect.poolObj.mesh.position.addScaledVector(effect.velocity, effectiveDt);
            effect.poolObj.mat.opacity = Math.max(0, 1 - progress);
            effect.poolObj.mesh.scale.setScalar(2.5 - progress * 2.0);
        } else if (effect.type === 'ghost') {
            effect.poolObj.mat.opacity = Math.max(0, 0.95 * (1 - progress));
            effect.poolObj.mesh.scale.setScalar(1.8 - progress * 1.0);
        } else if (effect.type === 'windtear') {
            effect.mat.opacity = Math.max(0, 0.9 * (1 - progress));
            effect.mesh.scale.set(1 + progress * 1.5, 1 + progress * 3.0, 1);
        } else if (effect.type === 'powerStreak') {
            const fade = Math.max(0, 1 - progress * 1.3);
            effect.poolObj.glowMat.opacity = 1.0 * fade;
            effect.poolObj.streakMat.opacity = 0.85 * fade;
            effect.poolObj.group.scale.setScalar(effect.initialScale * (1 + progress * 0.4));
            effect.poolObj.streak.scale.set(1, effect.initialLength * (1 + progress * 0.3), 1);
        } else if (effect.type === 'shockwave' || effect.type === 'cinematicShockwave') {
            const scale = 1 + progress * (effect.endScale || 6);
            effect.mesh.scale.setScalar(scale);
            effect.mat.opacity = Math.max(0, (1 - progress) * (1 - progress * 0.5));
            if (vfx.camera) effect.mesh.lookAt(vfx.camera.position);
        } else if (effect.type === 'sonicRing') {
            const scale = 1 + progress * (effect.endScale || 10);
            effect.mesh.scale.setScalar(scale);
            effect.mat.opacity = Math.max(0, (1 - progress) * (1 - progress * 0.4));
        } else if (effect.type === 'groundRing') {
            const scale = 1 + progress * (effect.endScale || 8);
            effect.mesh.scale.setScalar(scale);
            effect.mat.opacity = Math.max(0, (1 - progress) * (1 - progress * 0.5));
        } else if (effect.type === 'magicGate') {
            const scale = 1 + progress * 2;
            effect.mesh.scale.setScalar(scale);
            effect.mat.opacity = Math.max(0, 1 - progress);
        } else if (effect.type === 'flashSprite') {
            const t = Math.min(progress * 2.5, 1);
            const scale = effect.startScale + (effect.endScale - effect.startScale) * t;
            effect.poolObj.mesh.scale.setScalar(scale);
            effect.poolObj.mat.opacity = Math.max(0, 1 - progress * 1.2);
        } else if (effect.type === 'lightBoost') {
            effect.lightObj.light.intensity = effect.startIntensity * Math.max(0, 1 - progress) * Math.max(0, 1 - progress);
        } else if (effect.type === 'spark') {
            const v = effect.velocity;
            v.y += effect.gravity * effectiveDt;
            effect.poolObj.mesh.position.addScaledVector(v, effectiveDt);
            if (v.lengthSq() > 0.01) {
                const dir = v.clone().normalize();
                effect.poolObj.mat.rotation = Math.atan2(dir.x, dir.y);
            }
            effect.poolObj.mat.opacity = Math.max(0, 1 - progress);
            effect.poolObj.mesh.scale.setScalar((1 - progress * 0.6));
        } else if (effect.type === 'fragment') {
            const v = effect.velocity;
            v.y += effect.gravity * effectiveDt;
            effect.poolObj.mesh.position.addScaledVector(v, effectiveDt);
            effect.poolObj.mesh.rotation.x += effect.angularVel.x * effectiveDt;
            effect.poolObj.mesh.rotation.y += effect.angularVel.y * effectiveDt;
            effect.poolObj.mesh.rotation.z += effect.angularVel.z * effectiveDt;
            if (effect.poolObj.mesh.position.y < 0.08) {
                effect.poolObj.mesh.position.y = 0.08;
                effect.velocity.set(0, 0, 0);
                effect.angularVel.multiplyScalar(0.92);
                effect.poolObj.mat.emissiveIntensity *= 0.94;
            }
            effect.poolObj.mat.opacity = Math.max(0, 1 - progress * 0.9);
        } else if (effect.type === 'fireParticle') {
            effect.poolObj.mesh.position.addScaledVector(effect.velocity, effectiveDt);
            effect.velocity.multiplyScalar(0.92);
            effect.poolObj.mat.opacity = Math.max(0, 1 - progress);
            effect.poolObj.mesh.scale.setScalar((1.2 + Math.random() * 0.4) * (1 - progress * 0.5));
        } else if (effect.type === 'orbitingRing') {
            const angle = effect.spinSpeed * effectiveDt;
            effect.mesh.rotateOnAxis(effect.spinAxis, angle);
            effect.mesh.scale.setScalar(1 + progress * effect.endScale);
            effect.mat.opacity = Math.max(0, 1 - progress * 1.3);
        }

        // Dispose khi hết đời
        if (effect.life >= effect.maxLife) {
            if (effect.poolObj) { effect.poolObj.active = false; }
            if (effect.poolObj && effect.poolObj.group) {
                effect.poolObj.group.visible = false;
            } else if (effect.poolObj && effect.poolObj.mesh) {
                effect.poolObj.mesh.visible = false;
            }
            if (effect.mesh && MESH_EFFECT_TYPES.has(effect.type)) {
                vfx.scene.remove(effect.mesh);
                if (effect.geo) effect.geo.dispose();
                if (effect.mat) effect.mat.dispose();
            }
            if (effect.lightObj) { effect.lightObj.active = false; effect.lightObj.light.intensity = 0; }
            vfx.activeEffects.splice(i, 1);
        }
    }
}
//═══════════════════════════════════════════════════════════════
// vfx-system.js — v37 (Modular Orchestrator)
// FIX: thêm launchMixin (createLaunchBurst, createSonicBoom) bị mất khi tách module
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'https://esm.sh/three@0.160.0';

// ═══════════════════════════════════════════════════════════════
// TEXTURES
// ═══════════════════════════════════════════════════════════════
import {
    generateParticleTexture,
    generateSparkTexture,
    generateMagicCircleTexture,
    generateHexagramTexture,
    generateRuneRingTexture,
    generateSmallRuneTexture,
    generateArcaneSigilTexture,
} from './vfx/textures.js';

// ═══════════════════════════════════════════════════════════════
// POOLS
// ═══════════════════════════════════════════════════════════════
import {
    createShieldPool,
    createExplosionPool,
    createTrailPool,
    createGhostPool,
    createWindTearPool,
    createDustPool,
    createLightPool,
    createSparkPool,
    createFragmentPool,
    createFlashPool,
    createPowerStreakPool,
} from './vfx/pools.js';

// ═══════════════════════════════════════════════════════════════
// INFRASTRUCTURE
// ═══════════════════════════════════════════════════════════════
import { initScreenFlash, triggerScreenFlash } from './vfx/screen-flash.js';
import { createImpactMarker, updateImpactMarker, hideImpactMarker } from './vfx/impact-marker.js';
import { updateEffects } from './vfx/effects-updater.js';

// ═══════════════════════════════════════════════════════════════
// EFFECTS MIXINS
// ═══════════════════════════════════════════════════════════════
import { shieldMixin } from './vfx/effects/shield.js';
import { explosionMixin } from './vfx/effects/explosion.js';
import { trailMixin } from './vfx/effects/trail.js';
import { groundMixin } from './vfx/effects/ground.js';
import { magicMixin } from './vfx/effects/magic.js';
import { projectileMixin } from './vfx/effects/projectile.js';
import { barrageMixin } from './vfx/effects/barrage.js';
import { ritualMixin } from './vfx/effects/ritual.js';
import { launchMixin } from './vfx/effects/launch.js';

console.log('[VFX] v37 module loading (modular)...');

// ═══════════════════════════════════════════════════════════════
// MESH EFFECT TYPES — cần biết để dispose đúng cách
// ═══════════════════════════════════════════════════════════════
const MESH_EFFECT_TYPES = new Set([
    'shockwave', 'cinematicShockwave', 'orbitingRing',
    'sonicRing', 'groundRing', 'magicGate'
]);

export class VFXSystem {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        this.activeEffects = [];
        this._launchFX = [];

        // ═══ TEXTURES ═══
        this.particleTexture = generateParticleTexture();
        this.sparkTexture = generateSparkTexture();
        this.magicTex = generateMagicCircleTexture();
        this.hexagramTex = generateHexagramTexture();
        this.runeTex = generateRuneRingTexture();
        this.smallRuneTex = generateSmallRuneTexture();
        this.sigilTex = generateArcaneSigilTexture();

        // ═══ POOLS ═══
        this.shieldPool = createShieldPool(scene);
        this.explosionPool = createExplosionPool(scene, this.particleTexture);
        this.trailPool = createTrailPool(scene, this.particleTexture);
        this.ghostPool = createGhostPool(scene);
        this.windTearPool = createWindTearPool(scene);
        this.dustPool = createDustPool(scene, this.particleTexture);
        this.lightPool = createLightPool(scene);
        this.sparkPool = createSparkPool(scene, this.sparkTexture);
        this.fragmentPool = createFragmentPool(scene);
        this.flashPool = createFlashPool(scene, this.particleTexture);
        this.powerStreakPool = createPowerStreakPool(scene);

        // ═══ INFRASTRUCTURE ═══
        initScreenFlash(this);
        this.impactMarker = createImpactMarker(scene);

        // ═══ STATE ═══
        this.chargingEffect = null;
        this.projectileFX = null;
        this._slowMo = 1.0;
        this._slowMoTimer = null;

        console.log('[VFX] System ready (v37 — Modular)');
    }

    // ═══════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════
    _getInactive(pool) {
        return pool.find(p => !p.active);
    }

    _triggerScreenFlash(duration = 800) {
        triggerScreenFlash(this, duration);
    }

    updateImpactMarker(pos, colorHex) {
        updateImpactMarker(this.impactMarker, pos, colorHex);
    }

    hideImpactMarker() {
        hideImpactMarker(this.impactMarker);
    }

    // ═══════════════════════════════════════════════════════════
    // UPDATE — delegate sang effects-updater
    // ═══════════════════════════════════════════════════════════
    update(dt) {
        updateEffects(this, dt);
        this._updateLaunchFX(dt);
    }

    // ═══════════════════════════════════════════════════════════
    // DISPOSE
    // ═══════════════════════════════════════════════════════════
    dispose() {
        // Active effects
        for (const effect of this.activeEffects) {
            if (effect.poolObj) { effect.poolObj.active = false; }
            if (effect.poolObj && effect.poolObj.group) effect.poolObj.group.visible = false;
            else if (effect.poolObj && effect.poolObj.mesh) effect.poolObj.mesh.visible = false;
            if (effect.mesh && MESH_EFFECT_TYPES.has(effect.type)) {
                this.scene.remove(effect.mesh);
                if (effect.geo) effect.geo.dispose();
                if (effect.mat) effect.mat.dispose();
            }
            if (effect.lightObj) { effect.lightObj.active = false; effect.lightObj.light.intensity = 0; }
        }
        this.activeEffects = [];
        this._disposeLaunchFX();

        // Textures
        this.particleTexture.dispose();
        this.sparkTexture.dispose();
        this.magicTex.dispose();
        this.hexagramTex.dispose();
        this.runeTex.dispose();
        this.smallRuneTex.dispose();
        this.sigilTex.dispose();

        // Misc
        if (this.impactMarker) this.scene.remove(this.impactMarker.group);
        if (this.chargingEffect) this.chargingEffect.dispose();
        if (this.projectileFX) this.projectileFX.dispose();
        clearTimeout(this._slowMoTimer);

        // Pools
        this.shieldPool.forEach(p => {
            p.sphere.geometry.dispose(); p.sphereMat.dispose();
            p.icoLines.geometry.dispose(); p.icoMat.dispose();
            p.inner.geometry.dispose(); p.innerMat.dispose();
            p.rings.forEach(r => { r.geometry.dispose(); r.material.dispose(); });
            this.scene.remove(p.group);
        });
        this.explosionPool.forEach(p => { p.geo.dispose(); p.mat.dispose(); this.scene.remove(p.mesh); });
        this.trailPool.forEach(p => { p.geo.dispose(); p.mat.dispose(); this.scene.remove(p.mesh); });
        this.ghostPool.forEach(p => { p.mesh.geometry.dispose(); p.mat.dispose(); this.scene.remove(p.mesh); });
        this.windTearPool.forEach(p => { p.mesh.geometry.dispose(); p.mat.dispose(); this.scene.remove(p.mesh); });
        this.dustPool.forEach(p => { p.geo.dispose(); p.mat.dispose(); this.scene.remove(p.mesh); });
        this.lightPool.forEach(p => { this.scene.remove(p.light); });
        this.sparkPool.forEach(p => { p.mat.dispose(); this.scene.remove(p.mesh); });
        this.fragmentPool.forEach(p => { p.mat.dispose(); this.scene.remove(p.mesh); });
        this.flashPool.forEach(p => { p.mat.dispose(); this.scene.remove(p.mesh); });
        this.powerStreakPool.forEach(p => {
            p.glow.geometry.dispose(); p.glowMat.dispose();
            p.streak.geometry.dispose(); p.streakMat.dispose();
            this.scene.remove(p.group);
        });

        // Screen flash element
        if (this._screenFlashEl && this._screenFlashEl.parentNode) {
            this._screenFlashEl.parentNode.removeChild(this._screenFlashEl);
        }

        console.log('[VFX] Disposed');
    }
}

// ═══════════════════════════════════════════════════════════════
// ATTACH MIXINS — methods được merge vào prototype
// ═══════════════════════════════════════════════════════════════
Object.assign(VFXSystem.prototype,
    shieldMixin,      // createMatrixShield, createShieldShatter, createShieldImpact
    explosionMixin,   // createFireExplosion, createMidAirExplosion
    trailMixin,       // createGhostTrail, createWindTears, createPowerStreak, createFireParticle
    groundMixin,      // createGroundImpact, createDust
    magicMixin,       // createMagicGate, createOrbitingRing
    projectileMixin,  // createChargingEffect, createProjectileEffect
    barrageMixin,     // createFireballBarrage (Savage)
    ritualMixin,      // createMagicRitual, createSealRitual, createInspectRitual, createThrowTrail
    launchMixin,      // createLaunchBurst, createSonicBoom (Slingshot)
);

console.log('[VFX] v37 module LOADED — modular VFX ready');
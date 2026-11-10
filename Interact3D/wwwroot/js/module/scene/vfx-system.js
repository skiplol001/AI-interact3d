//═══════════════════════════════════════════════════════════════
// vfx-system.js — v38 (Modular Orchestrator + Light Guard)
// FIX: thêm _guardLights() — chống PointLight bị kẹt/cộng dồn làm cả cảnh ngả vàng, cháy sáng
//      (khi không còn hiệu ứng nào thì ép tắt hết đèn của pool; kẹp cường độ/khoảng chiếu)
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

console.log('[VFX] v38 module loading (modular)...');

// ═══════════════════════════════════════════════════════════════
// MESH EFFECT TYPES — cần biết để dispose đúng cách
// ═══════════════════════════════════════════════════════════════
const MESH_EFFECT_TYPES = new Set([
    'shockwave', 'cinematicShockwave', 'orbitingRing',
    'sonicRing', 'groundRing', 'magicGate'
]);

// ═══════════════════════════════════════════════════════════════
// LIGHT GUARD — giới hạn đèn của pool
// Scene nền đã rất sáng (ambient 1.5 + hemi 1.0 + dir 2.0 + ACES, exposure 1.35)
// nên chỉ cần vài PointLight dư là sàn/nhân vật/hộp bão hoà thành một màu.
// ═══════════════════════════════════════════════════════════════
const MAX_LIGHT_INTENSITY = 4.0;   // kẹp cường độ tối đa của mỗi đèn pool
const MAX_LIGHT_DISTANCE = 12;     // distance = 0 nghĩa là chiếu vô hạn → ép về giá trị này
const LIGHT_IDLE_GRACE = 0.6;      // giây không còn hiệu ứng nào thì ép tắt toàn bộ đèn

export class VFXSystem {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        this.activeEffects = [];
        this._launchFX = [];
        this._lightIdleTime = 0;

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

        console.log('[VFX] System ready (v38 — Modular + Light Guard)');
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
    // LIGHT GUARD
    // ═══════════════════════════════════════════════════════════
    _guardLights(dt) {
        if (!this.lightPool) return;

        const idle = this.activeEffects.length === 0 && this._launchFX.length === 0;
        this._lightIdleTime = idle ? this._lightIdleTime + dt : 0;
        const forceOff = this._lightIdleTime > LIGHT_IDLE_GRACE;

        for (const p of this.lightPool) {
            const l = p.light;
            if (!l) continue;

            // Đèn không thuộc hiệu ứng nào, hoặc không còn hiệu ứng nào chạy → phải tắt
            if (forceOff || !p.active) {
                if (l.intensity !== 0) l.intensity = 0;
                if (forceOff && p.active) p.active = false; // trả lại pool nếu bị kẹt
                continue;
            }

            if (l.intensity > MAX_LIGHT_INTENSITY) l.intensity = MAX_LIGHT_INTENSITY;
            if (!l.distance || l.distance > MAX_LIGHT_DISTANCE) l.distance = MAX_LIGHT_DISTANCE;
        }
    }

    // Dùng để gỡ rối: vfxSystem.forceClearLights() trong Console
    forceClearLights() {
        for (const p of this.lightPool || []) {
            if (p.light) p.light.intensity = 0;
            p.active = false;
        }
        for (const e of this.activeEffects) if (e.lightObj) e.lightObj.active = false;
    }

    // Dùng để gỡ rối: vfxSystem.debugLights() trong Console
    debugLights() {
        const rows = (this.lightPool || []).map((p, i) => ({
            i,
            active: !!p.active,
            intensity: +(p.light?.intensity ?? 0).toFixed(2),
            distance: p.light?.distance,
            color: p.light ? '#' + p.light.color.getHexString() : '-',
        }));
        console.table(rows);
        console.log('[VFX] activeEffects:', this.activeEffects.length, '· launchFX:', this._launchFX.length);
        return rows;
    }

    // ═══════════════════════════════════════════════════════════
    // UPDATE — delegate sang effects-updater
    // ═══════════════════════════════════════════════════════════
    update(dt) {
        updateEffects(this, dt);
        this._updateLaunchFX(dt);
        this._guardLights(dt);
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
        this.lightPool.forEach(p => { p.light.intensity = 0; this.scene.remove(p.light); });
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

console.log('[VFX] v38 module LOADED — modular VFX ready');
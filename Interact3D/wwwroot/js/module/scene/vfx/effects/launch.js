// ═══════════════════════════════════════════════════════════════
// vfx/effects/launch.js — Launch burst + Sonic boom (Slingshot)
// Tự chứa (không phụ thuộc pool nào), tự update qua _updateLaunchFX(dt)
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'https://esm.sh/three@0.160.0';

const _Z = new THREE.Vector3(0, 0, 1);

function powerColor(p) {
    const c = new THREE.Color(0x00ffff);
    if (p > 0.5) c.lerp(new THREE.Color(0xa78bfa), Math.min(1, (p - 0.5) * 2));
    if (p > 0.8) c.lerp(new THREE.Color(0xff0044), Math.min(1, (p - 0.8) * 5));
    return c;
}

export const launchMixin = {
    _launchList() {
        if (!this._launchFX) this._launchFX = [];
        return this._launchFX;
    },

    _addSprite(pos, color, scale, opacity) {
        const mat = new THREE.SpriteMaterial({
            map: this.particleTexture, color, transparent: true, opacity,
            depthWrite: false, blending: THREE.AdditiveBlending,
        });
        const s = new THREE.Sprite(mat);
        s.position.copy(pos);
        s.scale.setScalar(scale);
        this.scene.add(s);
        return s;
    },

    _addRing(pos, dir, color, inner, outer, opacity) {
        const geo = new THREE.RingGeometry(inner, outer, 48);
        const mat = new THREE.MeshBasicMaterial({
            color, transparent: true, opacity, side: THREE.DoubleSide,
            depthWrite: false, blending: THREE.AdditiveBlending,
        });
        const m = new THREE.Mesh(geo, mat);
        m.position.copy(pos);
        m.quaternion.setFromUnitVectors(_Z, dir.clone().normalize());
        this.scene.add(m);
        return m;
    },

    createLaunchBurst(pos, forward, percent = 0.5) {
        const list = this._launchList();
        const dir = forward && forward.lengthSq() > 0 ? forward.clone().normalize() : new THREE.Vector3(0, 0, 1);
        const color = powerColor(percent);

        // Flash
        const flash = this._addSprite(pos, color, 0.4, 1.0);
        const flashMax = 1.5 + percent * 2.5;
        list.push({
            life: 0.35, age: 0,
            tick(t) {
                flash.scale.setScalar(0.4 + (flashMax - 0.4) * t);
                flash.material.opacity = 1 - t;
            },
            dispose: (scene) => { scene.remove(flash); flash.material.dispose(); },
        });

        // Ring (pháp tuyến = hướng bắn)
        const ring = this._addRing(pos, dir, color, 0.18, 0.24, 0.9);
        const ringMax = 3 + percent * 4;
        list.push({
            life: 0.45, age: 0,
            tick(t) {
                ring.scale.setScalar(1 + (ringMax - 1) * t);
                ring.material.opacity = 0.9 * (1 - t);
            },
            dispose: (scene) => { scene.remove(ring); ring.geometry.dispose(); ring.material.dispose(); },
        });

        // Tia lửa bắn theo hình nón quanh hướng bắn
        const n = 6 + Math.floor(percent * 14);
        const up = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
        const side = new THREE.Vector3().crossVectors(dir, up).normalize();
        const up2 = new THREE.Vector3().crossVectors(side, dir).normalize();
        for (let i = 0; i < n; i++) {
            const sp = this._addSprite(pos, color, 0.12 + Math.random() * 0.12, 1.0);
            const spread = 0.35 + Math.random() * 0.6;
            const ang = Math.random() * Math.PI * 2;
            const v = dir.clone().multiplyScalar(2 + Math.random() * 4 * (0.5 + percent))
                .addScaledVector(side, Math.cos(ang) * spread * 3)
                .addScaledVector(up2, Math.sin(ang) * spread * 3);
            const life = 0.4 + Math.random() * 0.3;
            list.push({
                life, age: 0, _last: 0,
                tick(t) {
                    const dt = (t - this._last) * life;
                    this._last = t;
                    sp.position.addScaledVector(v, dt);
                    v.y -= 6 * dt;
                    sp.material.opacity = 1 - t;
                },
                dispose: (scene) => { scene.remove(sp); sp.material.dispose(); },
            });
        }
    },

    createSonicBoom(pos, dir, power = 0.5) {
        const list = this._launchList();
        const d = dir && dir.lengthSq() > 0 ? dir.clone().normalize() : new THREE.Vector3(0, 0, 1);
        const color = powerColor(Math.max(0.3, power));

        const ring = this._addRing(pos, d, color, 0.3, 0.4, 0.95);
        const ringMax = 6 + power * 8;
        list.push({
            life: 0.5, age: 0,
            tick(t) {
                ring.scale.setScalar(1 + (ringMax - 1) * t);
                ring.material.opacity = 0.95 * (1 - t);
            },
            dispose: (scene) => { scene.remove(ring); ring.geometry.dispose(); ring.material.dispose(); },
        });

        const flash = this._addSprite(pos, 0xffffff, 0.5, 0.9);
        const flashMax = 2 + power * 2;
        list.push({
            life: 0.25, age: 0,
            tick(t) {
                flash.scale.setScalar(0.5 + (flashMax - 0.5) * t);
                flash.material.opacity = 0.9 * (1 - t);
            },
            dispose: (scene) => { scene.remove(flash); flash.material.dispose(); },
        });
    },

    _updateLaunchFX(dt) {
        const list = this._launchFX;
        if (!list || list.length === 0) return;
        for (let i = list.length - 1; i >= 0; i--) {
            const fx = list[i];
            fx.age += dt;
            const t = Math.min(1, fx.age / fx.life);
            fx.tick(t);
            if (t >= 1) {
                fx.dispose(this.scene);
                list.splice(i, 1);
            }
        }
    },

    _disposeLaunchFX() {
        if (!this._launchFX) return;
        for (const fx of this._launchFX) fx.dispose(this.scene);
        this._launchFX = [];
    },
};
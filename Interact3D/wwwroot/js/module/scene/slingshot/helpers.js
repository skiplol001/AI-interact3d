// ═══════════════════════════════════════════════════════════════
// slingshot/helpers.js — Delay, wait, lines, rain rocks
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'https://esm.sh/three@0.160.0';

export const helpersMixin = {
    _delay(ms) {
        return new Promise(r => setTimeout(r, ms));
    },

    async _waitForIdle(ctrl, timeout = 8000) {
        const start = performance.now();
        while (performance.now() - start < timeout) {
            if (ctrl.state === 'idle' || ctrl.state === 'carryIdle') return true;
            await this._delay(100);
        }
        return false;
    },

    _getApproachPos(targetPos, dist) {
        const charPos = this.ctrl.root.position;
        const dir = new THREE.Vector3().subVectors(charPos, targetPos);
        dir.y = 0;
        if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
        dir.normalize();
        return targetPos.clone().addScaledVector(dir, dist);
    },

    _blockSlingshot(ms) {
        this._blockedUntil = Date.now() + ms;
    },

    _showLine(text, kind = 'normal') {
        if (!text) return;
        if (window.showCharacterMessage) window.showCharacterMessage(text, kind);
    },

    async _waitForRockExplosion(timeout = 5000) {
        const start = performance.now();
        while (performance.now() - start < timeout) {
            if (!this.isBouncing && !this._rockExploded && !this.isFlying && !this.isHittingShield && !this.isStuck) {
                return true;
            }
            await this._delay(100);
        }
        return false;
    },

    _rainRocksOnCamera(count = 12) {
        const cam = this.camera;
        const ctrl = this.ctrl;
        if (!cam || !ctrl) return;

        const startBase = ctrl.root.position.clone();
        startBase.y += 2.0;

        for (let i = 0; i < count; i++) {
            setTimeout(() => {
                const geo = new THREE.DodecahedronGeometry(0.15 + Math.random() * 0.15, 0);
                const mat = new THREE.MeshStandardMaterial({
                    color: 0x4a5568, emissive: 0xff3300, emissiveIntensity: 1.5,
                    roughness: 1, flatShading: true,
                });
                const rock = new THREE.Mesh(geo, mat);

                const angle = Math.random() * Math.PI * 2;
                const r = Math.random() * 1.5;
                const startPos = startBase.clone().add(new THREE.Vector3(
                    Math.cos(angle) * r,
                    1 + Math.random() * 1.5,
                    Math.sin(angle) * r
                ));
                rock.position.copy(startPos);
                rock.castShadow = true;
                this.scene.add(rock);

                const targetPos = cam.position.clone().add(new THREE.Vector3(
                    (Math.random() - 0.5) * 1.5,
                    (Math.random() - 0.5) * 0.8,
                    (Math.random() - 0.5) * 1.5
                ));

                const startTime = performance.now();
                const duration = 400 + Math.random() * 300;
                let lastTrail = 0;

                const fly = () => {
                    const now = performance.now();
                    const p = Math.min((now - startTime) / duration, 1);
                    rock.position.lerpVectors(startPos, targetPos, p);
                    rock.position.y += Math.sin(p * Math.PI) * 2;
                    rock.rotation.x += 0.15;
                    rock.rotation.z += 0.1;

                    if (now - lastTrail > 40 && window.vfxSystem) {
                        window.vfxSystem.createGhostTrail(rock.position, 0xff3300);
                        lastTrail = now;
                    }

                    if (p < 1) requestAnimationFrame(fly);
                    else {
                        if (window.vfxSystem) window.vfxSystem.createFireExplosion(rock.position, 0xff5500);
                        this.scene.remove(rock);
                        geo.dispose();
                        mat.dispose();
                    }
                };
                fly();
            }, i * 60);
        }
    },
};
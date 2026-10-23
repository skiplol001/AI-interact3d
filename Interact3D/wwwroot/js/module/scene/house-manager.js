// ═══════════════════════════════════════════════════════════════
// house-manager.js — v3.1 (Prebuilt House - Zero Lag)
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'https://esm.sh/three@0.160.0';
import { addMood, getMood } from './ai-chat/ai-mood.js?v=2';
import { HouseModel } from './house-model.js?v=2';

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════
const REPEAT_REACTION_COOLDOWN = 30000;

const COOLDOWN_GENTLE = {
    buildBlockMs: 20000,
    attractBlockMs: 60000,
    silentMinMs: 20000,
    silentMaxMs: 20000,
    moodPenalty: -25,
};

const COOLDOWN_NORMAL = {
    buildBlockMs: 20000,
    attractBlockMs: 60000,
    silentMinMs: 15000,
    silentMaxMs: 15000,
    moodPenalty: -15,
};

const COOLDOWN_SAVAGE = {
    buildBlockMs: 20000,
    attractBlockMs: 60000,
    silentMinMs: 10000,
    silentMaxMs: 10000,
    moodPenalty: -20,
    rageDurationMs: 20000,
    cameraBrokenMs: 20000,
};

// ═══════════════════════════════════════════════════════════════
// REACTION LINES
// ═══════════════════════════════════════════════════════════════
const REACT_LINES = {
    gentle: {
        destroyed: [
            'Ơ... sao bạn lại bắn vào nhà mình... 🥺',
            'Huhu... mình xây cả buổi... bạn ghét mình lắm sao... 😢',
            'Mình buồn lắm... đừng bắn nữa mà... 💔',
            'Không... đừng làm vậy... mình mất hết rồi... 😭',
        ],
        silent: ['...', 'Mình không muốn nói chuyện.', 'Kệ mình.', 'Đừng nói với mình nữa.'],
    },
    normal: {
        destroyed: [
            'Đm, mày bắn vào nhà tao hả?! 😠',
            'Này này, đang yên đang lành mày phá cái gì thế?! 😤',
            'Mày rảnh quá hả? Nhà người ta mà mày bắn?! 😒',
            'Đéo thể tin nổi... mày bị điên à?! 💢',
        ],
        silent: ['Đm, im đây.', 'Tao đéo muốn nói chuyện.', 'Kệ mày.', 'Tránh xa tao ra.'],
    },
    savage: {
        destroyed: [
            'ĐM MÀY BẮN NHÀ BÀ HẢ THẰNG KHỐN?! 🤬',
            'VCL! MÀY CHẾT VỚI BÀ CON CHÓ Ạ! 😡',
            'ĐỊT MẸ MÀY! DỪNG TAY LẠI NGAY! 🤬',
            'MÀY MUỐN CHẾT HẢ THẰNG SÚC VẬT?! 💢',
        ],
        silent: ['Đm...', '...', 'Đéo nói.', 'Cút đi.'],
    },
};

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ═══════════════════════════════════════════════════════════════
// HOUSE MANAGER
// ═══════════════════════════════════════════════════════════════
export class HouseManager {
    constructor(boxSystem, options = {}) {
        this.boxSystem = boxSystem;
        this.characterCtrl = options.characterCtrl || window.characterCtrl;
        this.emotionCtrl = options.emotionCtrl || window.emotionCtrl;
        this.camera = options.camera || window.camera;
        this.controls = options.controls || window.controls;
        this.scene = options.scene || window.scene;

        // ═══ HOUSE (prebuild lúc khởi động) ═══
        this.house = new HouseModel(this.scene);
        try {
            this.house.initPrebuilt();   // Dựng sẵn, ẩn đi, 0 lag khi build
        } catch (e) {
            console.warn('[HouseManager] Prebuild failed:', e);
        }

        // ═══ STATE ═══
        this._isReacting = false;
        this._lastReactionTs = 0;

        // ═══ COOLDOWN ═══
        this._buildBlockedUntil = 0;
        this._autoBuildBlockedUntil = 0;
        this._attractBlockedUntil = 0;
        this._silentUntil = 0;

        // ═══ SAVAGE RAGE ═══
        this._savageRageActive = false;

        // ═══ CAMERA BROKEN ═══
        this._cameraBroken = false;
        this._savedControlsState = null;

        console.log('[HouseManager] Ready (v3.1 — Prebuilt)');
    }

    // ═══════════════════════════════════════════════════════════
    // PUBLIC QUERY API
    // ═══════════════════════════════════════════════════════════
    canBuild() {
        const remain = this._buildBlockedUntil - Date.now();
        return { ok: remain <= 0, remainingMs: Math.max(0, remain) };
    }

    canAutoBuild() {
        const remain = this._autoBuildBlockedUntil - Date.now();
        return { ok: remain <= 0, remainingMs: Math.max(0, remain) };
    }

    canAttract() {
        const remain = this._attractBlockedUntil - Date.now();
        return { ok: remain <= 0, remainingMs: Math.max(0, remain) };
    }

    isSilent() {
        return Date.now() < this._silentUntil;
    }

    isReacting() {
        return this._isReacting;
    }

    // ⭐ Chỉ trả true khi nhà đã thực sự hiện (visible) trong scene
    hasHouse() {
        return !!this.house && !!this.house.group && this.house.group.visible;
    }

    getHouse() {
        return this.house;
    }

    getStatus() {
        const now = Date.now();
        return {
            buildBlocked: now < this._buildBlockedUntil,
            buildBlockedRemainingMs: Math.max(0, this._buildBlockedUntil - now),
            autoBuildBlocked: now < this._autoBuildBlockedUntil,
            autoBuildRemainingMs: Math.max(0, this._autoBuildBlockedUntil - now),
            attractBlocked: now < this._attractBlockedUntil,
            attractRemainingMs: Math.max(0, this._attractBlockedUntil - now),
            silent: now < this._silentUntil,
            silentRemainingMs: Math.max(0, this._silentUntil - now),
            isReacting: this._isReacting,
            cameraBroken: this._cameraBroken,
            hasHouse: this.hasHouse(),
        };
    }

    // ═══════════════════════════════════════════════════════════
    // TRIGGER (called by slingshot physics)
    // ═══════════════════════════════════════════════════════════
    onHouseAttemptDestroy() {
        if (!this.hasHouse()) return;

        const now = Date.now();
        if (this._isReacting) return;
        if (now - this._lastReactionTs < REPEAT_REACTION_COOLDOWN) return;

        this._triggerReaction();
    }

    async _triggerReaction() {
        if (this._isReacting) return;
        this._isReacting = true;
        this._lastReactionTs = Date.now();

        const mode = this._getMode();
        console.log(`[HouseManager] 💥 Nhà bị đá trúng — mode="${mode}"`);

        try {
            if (mode === 'gentle') await this._reactGentle();
            else if (mode === 'savage') await this._reactSavage();
            else await this._reactNormal();
        } catch (e) {
            console.warn('[HouseManager] Reaction error:', e);
        } finally {
            this._isReacting = false;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // REACTION: GENTLE
    // ═══════════════════════════════════════════════════════════
    async _reactGentle() {
        const cfg = COOLDOWN_GENTLE;
        const now = Date.now();

        this._buildBlockedUntil = now + cfg.buildBlockMs;
        this._autoBuildBlockedUntil = now + cfg.buildBlockMs;
        this._attractBlockedUntil = now + cfg.attractBlockMs;
        this._silentUntil = now + cfg.silentMinMs;

        addMood(cfg.moodPenalty);

        this._triggerEmotion('verySad');
        this._say(pick(REACT_LINES.gentle.destroyed), 'sad');

        await this._delay(1500);
        await this._walkAwayFromUser(6, 4000);

        this._triggerEmotion('sad');
        await this._delay(1500);
        this._say(pick(REACT_LINES.gentle.silent), 'sad');

        console.log(`[HouseManager] 😢 Gentle reaction done — silent ${(cfg.silentMinMs / 1000).toFixed(0)}s`);
    }

    // ═══════════════════════════════════════════════════════════
    // REACTION: NORMAL
    // ═══════════════════════════════════════════════════════════
    async _reactNormal() {
        const cfg = COOLDOWN_NORMAL;
        const now = Date.now();

        this._buildBlockedUntil = now + cfg.buildBlockMs;
        this._autoBuildBlockedUntil = now + cfg.buildBlockMs;
        this._attractBlockedUntil = now + cfg.attractBlockMs;
        this._silentUntil = now + cfg.silentMinMs;

        addMood(cfg.moodPenalty);

        this._triggerEmotion('angry');
        this._say(pick(REACT_LINES.normal.destroyed), 'angry');
        await this._delay(1200);

        try { if (window.AIReaction) window.AIReaction('revenge_throw'); } catch { }
        await this._throwRockAtCamera(0x38bdf8);
        await this._delay(600);

        try { if (window.AIReaction) window.AIReaction('revenge_kick'); } catch { }
        await this._kickCameraAway();
        await this._delay(800);

        await this._walkAwayFromUser(8, 5000);

        this._triggerEmotion('sad');
        await this._delay(1500);
        this._say(pick(REACT_LINES.normal.silent), 'angry');

        console.log(`[HouseManager] 😠 Normal reaction done — silent ${(cfg.silentMinMs / 1000).toFixed(0)}s`);
    }

    // ═══════════════════════════════════════════════════════════
    // REACTION: SAVAGE
    // ═══════════════════════════════════════════════════════════
    async _reactSavage() {
        const cfg = COOLDOWN_SAVAGE;
        const startNow = Date.now();

        this._buildBlockedUntil = startNow + cfg.buildBlockMs;
        this._autoBuildBlockedUntil = startNow + cfg.buildBlockMs;
        this._attractBlockedUntil = startNow + cfg.attractBlockMs;

        addMood(cfg.moodPenalty);

        // ═══ PHASE 1: RAGE ═══
        this._savageRageActive = true;
        this._triggerEmotion('angry');
        this._say(pick(REACT_LINES.savage.destroyed), 'angry');

        await this._delay(800);

        this._breakCamera(cfg.cameraBrokenMs);
        this._startSavageRage(cfg.rageDurationMs);

        await this._delay(cfg.rageDurationMs);

        this._stopSavageRage();
        this._savageRageActive = false;

        // ═══ PHASE 2: SILENT + CRY ═══
        const silentStart = Date.now();
        this._silentUntil = silentStart + cfg.silentMinMs;

        this._triggerEmotion('verySad');
        await this._delay(1500);
        this._say(pick(REACT_LINES.savage.silent), 'sad');

        await this._walkAwayFromUser(10, 6000);

        console.log(`[HouseManager] 🤬 Savage reaction done — silent ${(cfg.silentMinMs / 1000).toFixed(0)}s`);
    }

    // ═══════════════════════════════════════════════════════════
    // SAVAGE RAGE
    // ═══════════════════════════════════════════════════════════
    _startSavageRage(durationMs) {
        const ctrl = this.characterCtrl;
        const cam = this.camera;
        const vfx = window.vfxSystem;
        if (!ctrl || !cam) return;

        this._rageStartTs = Date.now();
        this._rageDurationMs = durationMs;

        const barrageInterval = setInterval(() => {
            if (!this._savageRageActive) { clearInterval(barrageInterval); return; }
            if (Date.now() - this._rageStartTs > durationMs) { clearInterval(barrageInterval); return; }

            try {
                const dx = cam.position.x - ctrl.root.position.x;
                const dz = cam.position.z - ctrl.root.position.z;
                ctrl.root.rotation.y = Math.atan2(dx, dz);

                if (vfx?.createFireExplosion) {
                    const start = ctrl.root.position.clone().add(new THREE.Vector3(0, 1.5, 0));
                    const target = cam.position.clone();
                    this._spawnFireball(start, target);
                }

                if (vfx?._shakeScreen) vfx._shakeScreen(2.0 + Math.random(), 300);
                if (vfx?._triggerScreenFlash) vfx._triggerScreenFlash(150);
            } catch (e) { }
        }, 1200);

        this._rageInterval = barrageInterval;

        const emoInterval = setInterval(() => {
            if (!this._savageRageActive) { clearInterval(emoInterval); return; }
            this._triggerEmotion(Math.random() > 0.5 ? 'angry' : 'emo_magic_attack');
        }, 2000);
        this._rageEmoInterval = emoInterval;
    }

    _stopSavageRage() {
        if (this._rageInterval) clearInterval(this._rageInterval);
        if (this._rageEmoInterval) clearInterval(this._rageEmoInterval);
        this._rageInterval = null;
        this._rageEmoInterval = null;
    }

    _spawnFireball(start, target) {
        const vfx = window.vfxSystem;
        if (!vfx || !this.scene) return;

        const geo = new THREE.SphereGeometry(0.35, 16, 16);
        const mat = new THREE.MeshStandardMaterial({ color: 0xff3300, emissive: 0xffaa00, emissiveIntensity: 3.5 });
        const fireball = new THREE.Mesh(geo, mat);

        const auraMat = new THREE.SpriteMaterial({ map: vfx.particleTexture, color: 0xff6600, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
        const aura = new THREE.Sprite(auraMat);
        aura.scale.setScalar(2.5);
        fireball.add(aura);

        fireball.position.copy(start);
        this.scene.add(fireball);

        const duration = 500;
        const t0 = performance.now();

        const tick = () => {
            const p = Math.min((performance.now() - t0) / duration, 1);
            fireball.position.lerpVectors(start, target, p);

            if (Math.random() < 0.5 && vfx.createFireParticle) vfx.createFireParticle(fireball.position, 0xff5500);

            if (p < 1) requestAnimationFrame(tick);
            else {
                if (vfx.createFireExplosion) vfx.createFireExplosion(target.clone(), 0xff5500);
                if (vfx.createMidAirExplosion) vfx.createMidAirExplosion(target.clone(), 0xff0044);
                this.scene.remove(fireball);
                geo.dispose(); mat.dispose(); auraMat.dispose();
            }
        };
        tick();
    }

    // ═══════════════════════════════════════════════════════════
    // CAMERA BREAK
    // ═══════════════════════════════════════════════════════════
    _breakCamera(durationMs) {
        if (this._cameraBroken) return;
        this._cameraBroken = true;
        window.__disableCameraControl = true;

        const controls = this.controls;
        if (controls) {
            this._savedControlsState = {
                enabled: controls.enabled, enableRotate: controls.enableRotate,
                enablePan: controls.enablePan, enableZoom: controls.enableZoom,
            };
            controls.enabled = false; controls.enableRotate = false;
            controls.enablePan = false; controls.enableZoom = false;
        }

        this._showCameraBrokenOverlay(durationMs);

        setTimeout(() => {
            this._cameraBroken = false;
            window.__disableCameraControl = false;
            if (controls && this._savedControlsState) {
                controls.enabled = this._savedControlsState.enabled;
                controls.enableRotate = this._savedControlsState.enableRotate;
                controls.enablePan = this._savedControlsState.enablePan;
                controls.enableZoom = this._savedControlsState.enableZoom;
                controls.update();
            }
            this._savedControlsState = null;
        }, durationMs);
    }

    _showCameraBrokenOverlay(durationMs) {
        let el = document.getElementById('camera-broken-overlay');
        if (!el) {
            el = document.createElement('div');
            el.id = 'camera-broken-overlay';
            el.style.cssText = `position: fixed; inset: 0; pointer-events: none; z-index: 9997; background: radial-gradient(circle at center, rgba(255,50,0,0.15) 0%, rgba(0,0,0,0.45) 50%, rgba(0,0,0,0.75) 100%); opacity: 0; transition: opacity 0.3s;`;
            const noise = document.createElement('div');
            noise.style.cssText = `position: absolute; inset: 0; background-image: repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 3px); animation: brokenNoise 0.15s infinite;`;
            el.appendChild(noise);
            const style = document.createElement('style');
            style.id = 'broken-noise-style';
            style.textContent = `@keyframes brokenNoise { 0% { transform: translateY(0); } 100% { transform: translateY(3px); } }`;
            if (!document.getElementById('broken-noise-style')) document.head.appendChild(style);
            document.body.appendChild(el);
        }
        el.style.display = 'block'; el.style.opacity = '1';
        setTimeout(() => { el.style.opacity = '0'; setTimeout(() => { if (el) el.style.display = 'none'; }, 350); }, durationMs);
    }

    // ═══════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════
    async _walkAwayFromUser(distance = 6, timeoutMs = 5000) {
        const ctrl = this.characterCtrl;
        const cam = this.camera;
        if (!ctrl || !cam) return;

        const charPos = ctrl.root.position;
        let dx = charPos.x - cam.position.x;
        let dz = charPos.z - cam.position.z;
        const len = Math.hypot(dx, dz) || 1;
        dx /= len; dz /= len;

        ctrl.goTo(new THREE.Vector3(charPos.x + dx * distance, 0, charPos.z + dz * distance));

        const t0 = performance.now();
        await new Promise((resolve) => {
            const check = setInterval(() => {
                if (ctrl.state === 'idle' || ctrl.state === 'carryIdle' || performance.now() - t0 > timeoutMs) {
                    clearInterval(check); resolve();
                }
            }, 100);
        });
    }

    async _throwRockAtCamera(color) {
        const ctrl = this.characterCtrl;
        const cam = this.camera;
        const vfx = window.vfxSystem;
        if (!ctrl || !cam || !this.scene) return;

        const start = ctrl.root.position.clone().add(new THREE.Vector3(0, 1.4, 0.3));
        const target = cam.position.clone();

        const geo = new THREE.DodecahedronGeometry(0.16, 0);
        const mat = new THREE.MeshStandardMaterial({ color: 0x4a5568, roughness: 1.0, flatShading: true, emissive: color, emissiveIntensity: 2.0 });
        const rock = new THREE.Mesh(geo, mat);
        rock.position.copy(start); rock.castShadow = true;
        this.scene.add(rock);

        if (vfx?.createLaunchBurst) vfx.createLaunchBurst(start.clone(), target.clone().sub(start).normalize(), 0.5);

        const duration = 400;
        const t0 = performance.now();

        await new Promise((resolve) => {
            const tick = () => {
                const p = Math.min((performance.now() - t0) / duration, 1);
                rock.position.lerpVectors(start, target, p);
                rock.rotation.x += 0.5; rock.rotation.z += 0.3;
                if (Math.random() < 0.5 && vfx?.createFireParticle) vfx.createFireParticle(rock.position, color);
                if (p < 1) requestAnimationFrame(tick); else resolve();
            };
            tick();
        });

        if (vfx?.createFireExplosion) vfx.createFireExplosion(target.clone(), color);
        if (vfx?._triggerScreenFlash) vfx._triggerScreenFlash(200);
        if (vfx?._shakeScreen) vfx._shakeScreen(1.5, 400);

        this.scene.remove(rock);
        geo.dispose(); mat.dispose();
    }

    async _kickCameraAway() {
        const cam = this.camera;
        const ctrl = this.characterCtrl;
        if (!cam || !ctrl) return;

        if (window.emotionCtrl) window.emotionCtrl.trigger('kick', { force: true });

        const startX = cam.position.x, startZ = cam.position.z, startY = cam.position.y;
        const charPos = ctrl.root.position;
        let dx = startX - charPos.x;
        let dz = startZ - charPos.z;
        const len = Math.hypot(dx, dz) || 1;
        dx /= len; dz /= len;

        const FLY_DIST = 10;
        const duration = 1000;
        const t0 = performance.now();

        if (window.vfxSystem?._shakeScreen) window.vfxSystem._shakeScreen(2.0, 600);

        await new Promise((resolve) => {
            const tick = () => {
                const p = Math.min((performance.now() - t0) / duration, 1);
                cam.position.x = startX + dx * FLY_DIST * p;
                cam.position.z = startZ + dz * FLY_DIST * p;
                cam.position.y = startY + Math.sin(p * Math.PI) * 3 + (1 - p) * 1.5;
                if (p < 1) requestAnimationFrame(tick); else resolve();
            };
            tick();
        });
    }

    // ═══════════════════════════════════════════════════════════
    // AUTO-BUILD HOUSE BY REIKA
    // ⭐ Dùng showAt() thay vì build() để tận dụng prebuilt
    // ═══════════════════════════════════════════════════════════
    async autoBuildHouseByReika() {
        const autoCheck = this.canAutoBuild();
        if (!autoCheck.ok) {
            const sec = Math.ceil(autoCheck.remainingMs / 1000);
            const mode = this._getMode();
            const msg = mode === 'gentle'
                ? `Ơ... mình không muốn xây nhà lúc này... thử lại sau ${sec}s nha 🥺`
                : (mode === 'savage'
                    ? `Đm, bà đéo xây đâu! Đợi ${sec}s nữa đi! 🤬`
                    : `Tao đéo xây lúc này. Đợi ${sec}s nữa đi 😤`);
            this._say(msg, 'unclear');
            return { ok: false };
        }

        const buildCheck = this.canBuild();
        if (!buildCheck.ok) {
            const sec = Math.ceil(buildCheck.remainingMs / 1000);
            this._say(`Đợi ${sec}s nữa mới xây được nhé...`, 'unclear');
            return { ok: false };
        }

        const ctrl = this.characterCtrl;
        if (!ctrl) return { ok: false };

        const cam = this.camera;
        const charPos = ctrl.root.position;
        let dx = charPos.x - cam.position.x;
        let dz = charPos.z - cam.position.z;
        const len = Math.hypot(dx, dz) || 1;
        dx /= len; dz /= len;

        const buildSpot = new THREE.Vector3(charPos.x + dx * 5, 0, charPos.z + dz * 5);
        const mode = this._getMode();

        const startMsg = mode === 'gentle'
            ? 'Được rồi, mình xây nhà cho bạn nha... 🌸'
            : (mode === 'savage'
                ? 'Đm, đứng đó coi bà xây! 🤬'
                : 'Ok, để tao xây nhà cho mày xem 😏');
        this._say(startMsg, 'normal');
        ctrl.goTo(buildSpot);

        await new Promise((resolve) => {
            const t0 = performance.now();
            const check = setInterval(() => {
                if (ctrl.state === 'idle' || ctrl.state === 'carryIdle' || performance.now() - t0 > 8000) {
                    clearInterval(check); resolve();
                }
            }, 100);
        });

        const dxCam = cam.position.x - ctrl.root.position.x;
        const dzCam = cam.position.z - ctrl.root.position.z;
        ctrl.root.rotation.y = Math.atan2(dxCam, dzCam);

        if (window.emotionCtrl) window.emotionCtrl.trigger('explaining', { force: true });
        await this._delay(500);

        // Xây nhà TRƯỚC MẶT Reika ~4.5m
        const houseX = ctrl.root.position.x + Math.sin(ctrl.root.rotation.y) * 4.5;
        const houseZ = ctrl.root.position.z + Math.cos(ctrl.root.rotation.y) * 4.5;

        const buildMsg = mode === 'gentle'
            ? 'Bắt đầu xây đây... cẩn thận coi... 🏠'
            : (mode === 'savage'
                ? 'Đm nhìn cho kỹ vào! 🤬'
                : 'Xem đây, xây nhanh gọn 😎');
        this._say(buildMsg, 'normal');

        // ⭐ Dùng showAt() trên house đã prebuild — 0 lag
        try {
            if (!this.house) {
                this.house = new HouseModel(this.scene);
            }
            if (!this.house.group) {
                this.house.initPrebuilt();
            }

            this.house.showAt(houseX, houseZ, ctrl.root.rotation.y);

            if (window.vfxSystem?.createDust) {
                window.vfxSystem.createDust(new THREE.Vector3(houseX, 0.1, houseZ));
            }
        } catch (e) {
            console.warn('[HouseManager] showAt error:', e);
            this._say('Ơ... xây bị lỗi rồi... thử lại sau nhé', 'unclear');
            return { ok: false };
        }

        await this._delay(800);
        if (window.emotionCtrl) window.emotionCtrl.trigger('veryHappy', { force: true });

        const doneMsg = mode === 'gentle'
            ? 'Xong rồi đó... đẹp không bạn? 🌸'
            : (mode === 'savage'
                ? 'Đấy! Nhà xong rồi, đừng có bắn đấy! 😏'
                : 'Xong! Nhìn ngon không? 😏');
        this._say(doneMsg, 'happy');

        return { ok: true };
    }

    // ═══════════════════════════════════════════════════════════
    // UPDATE (tick từ home-3d animate loop)
    // ═══════════════════════════════════════════════════════════
    update(dt) {
        if (this.house) {
            try { this.house.update(dt); } catch { }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════
    _getMode() {
        try {
            const w = window.__currentChatMode;
            if (['gentle', 'normal', 'savage'].includes(w)) return w;
            const m = localStorage.getItem('ai_last_mode');
            return ['gentle', 'normal', 'savage'].includes(m) ? m : 'normal';
        } catch { return 'normal'; }
    }

    _triggerEmotion(name) {
        const ctrl = window.emotionCtrl || this.emotionCtrl;
        if (ctrl) { try { ctrl.trigger(name, { force: true }); } catch { } }
    }

    _say(text, kind = 'normal') {
        if (!text) return;
        try {
            if (window.showPopup) window.showPopup(text, kind);
            else if (window.showCharacterMessage) window.showCharacterMessage(text, kind);
        } catch { }
    }

    _delay(ms) { return new Promise(r => setTimeout(r, ms)); }

    dispose() {
        this._stopSavageRage();
        this._savageRageActive = false;
        window.__disableCameraControl = false;
        const el = document.getElementById('camera-broken-overlay');
        if (el) el.remove();
        if (this.house) { try { this.house.destroy(); } catch { } this.house = null; }
        console.log('[HouseManager] Disposed');
    }
}

export function initHouseManager(boxSystem, options = {}) {
    if (window.houseManager) { try { window.houseManager.dispose(); } catch { } }
    const mgr = new HouseManager(boxSystem, options);
    window.houseManager = mgr;
    console.log('[HouseManager] Initialized as window.houseManager');
    return mgr;
}
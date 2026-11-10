// ═══════════════════════════════════════════════════════════════
// reactive-emotes.js — v3 (Add Dispose)
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'https://esm.sh/three@0.160.0';

export class ReactiveEmotes {
    constructor(scene, camera, controls, characterCtrl, emotionCtrl) {
        this.scene = scene;
        this.camera = camera;
        this.controls = controls;
        this.ctrl = characterCtrl;
        this.emotion = emotionCtrl;

        this._lastCameraPos = camera.position.clone();
        this._lastCameraTarget = controls.target.clone();
        this._lastActivityTs = Date.now();
        this._lastIdleCheck = Date.now();
        this._isUserAway = false;

        this._clickTimestamps = [];

        this._cooldowns = {};
        this._cooldownMs = {
            dizzy: 10000,      // Đã đổi từ drunk -> dizzy
            confused: 8000,    // Đã đổi từ shrugging -> confused
            dodging: 3000,
            thankful: 5000,
            angry: 5000,
            sad: 5000,
            laughing: 5000,
            greeting: 15000,
            verySad: 30000
        };

        this._tmpDir = new THREE.Vector3();
        this._tmpPrevDir = new THREE.Vector3();
        this._celebrateTimeout = null;

        this.camera.getWorldDirection(this._tmpPrevDir);

        console.log('[Reactive] Module ready (v3)');
    }

    dispose() {
        if (this._celebrateTimeout) clearTimeout(this._celebrateTimeout);
        this.ctrl = null;
        this.emotion = null;
        this.scene = null;
        this.camera = null;
        this.controls = null;
        console.log('[Reactive] Disposed');
    }

    update(dt) {
        if (!this.ctrl) return;
        const now = Date.now();
        this._checkCameraSpin(dt);
        this._checkCameraDistance();
        this._checkClickSpam();
        this._checkIdleTime(now);
    }

    _checkCameraSpin(dt) {
        if (dt <= 0) return;
        this.camera.getWorldDirection(this._tmpDir);
        const dot = this._tmpPrevDir.dot(this._tmpDir);
        const angle = Math.acos(THREE.MathUtils.clamp(dot, -1, 1));
        const angleDeg = angle * (180 / Math.PI);
        const speed = angleDeg / dt;

        if (speed > 180) {
            this._trigger('dizzy'); // Đã đổi
        }
        this._tmpPrevDir.copy(this._tmpDir);
    }

    _checkCameraDistance() {
        if (!this.ctrl) return;
        const dist = this.camera.position.distanceTo(this.ctrl.root.position);
        if (dist > 10) {
            this._trigger('confused'); // Đã đổi
        }
    }

    _checkClickSpam() {
        const now = performance.now();
        this._clickTimestamps = this._clickTimestamps.filter(ts => now - ts < 1000);
        if (this._clickTimestamps.length >= 5) {
            this._trigger('dodging');
            this._clickTimestamps = [];
        }
    }

    _checkIdleTime(now) {
        const idleDuration = now - this._lastActivityTs;
        if (idleDuration > 5 * 60 * 1000 && !this._isUserAway) {
            this._isUserAway = true;
            this._trigger('verySad'); // Đã đổi từ crying -> verySad
            console.log('[Reactive] User đi vắng > 5 phút -> verySad');
        }
        if (this._isUserAway && idleDuration < 1000) {
            this._isUserAway = false;
            this._trigger('greeting'); // Đã đổi từ waving -> greeting
            if (this._celebrateTimeout) clearTimeout(this._celebrateTimeout);
            this._celebrateTimeout = setTimeout(() => {
                if (!this._isUserAway) this._trigger('celebrating');
            }, 1000);
            console.log('[Reactive] User quay lại -> greeting');
        }
    }

    registerActivity() {
        this._lastActivityTs = Date.now();
    }

    registerHitboxClick() {
        this._clickTimestamps.push(performance.now());
        this.registerActivity();
    }

    onChat(text) {
        this.registerActivity();
        const t = text.toLowerCase();

        if (/\b(xinh|dep|de thuong|cute|hay|gioi|ngon|yeu)\b/.test(t)) {
            this._trigger('thankful');
        } else if (/\b(ngu|cho|dm|vcl|oc|dien|kho chiu)\b/.test(t)) {
            this._trigger('angry');
        } else if (/\b(buon|kho|met|chan|co don)\b/.test(t)) {
            this._trigger('sad');
        } else if (/\b(vui|haha|hihi|sung suong|yeah)\b/.test(t)) {
            this._trigger('laughing');
        }
    }

    _trigger(emotionName) {
        const now = Date.now();
        const lastTime = this._cooldowns[emotionName] || 0;

        if (now - lastTime < this._cooldownMs[emotionName]) return;

        const state = this.ctrl.state;
        const isBusy = ['picking', 'putting', 'surprised', 'hanging', 'falling', 'landing'].includes(state);

        if (!isBusy && this.emotion) {
            this.emotion.trigger(emotionName, { force: true });
            this._cooldowns[emotionName] = now;
            console.log(`[Reactive] Triggered → ${emotionName}`);
        }
    }
}
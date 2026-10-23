// ═══════════════════════════════════════════════════════════════
// CameraWASD — Di chuyển camera bằng bàn phím (fly camera)
//
// Bindings:
//   W/S     → forward/backward
//   A/D     → left/right
//   Q/E     → down/up (hoặc Space/Ctrl)
//   Shift   → boost (x3 tốc độ)
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'https://esm.sh/three@0.160.0';

export class CameraWASD {
    constructor(camera, controls, options = {}) {
        this.camera = camera;
        this.controls = controls;
        this.speed = options.speed ?? 8;
        this.boostSpeed = options.boostSpeed ?? 24;
        this.enabled = true;

        this.keys = {};

        this._onKeyDown = (e) => {
            // Skip nếu user đang gõ vào input/textarea
            const tag = e.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            this.keys[e.code] = true;
        };

        this._onKeyUp = (e) => {
            this.keys[e.code] = false;
        };

        window.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('keyup', this._onKeyUp);
    }

    enable() { this.enabled = true; }
    disable() {
        this.enabled = false;
        this.keys = {};
    }

    update(dt) {
        if (!this.enabled) return;

        // Forward direction (camera look direction, projected to XZ)
        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);
        forward.y = 0;
        if (forward.lengthSq() < 0.0001) forward.set(0, 0, -1);
        forward.normalize();

        // Right direction
        const right = new THREE.Vector3();
        right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

        // Movement vector
        const move = new THREE.Vector3();

        // WASD - XZ plane
        if (this.keys['KeyW'] || this.keys['ArrowUp']) move.add(forward);
        if (this.keys['KeyS'] || this.keys['ArrowDown']) move.sub(forward);
        if (this.keys['KeyD'] || this.keys['ArrowRight']) move.add(right);
        if (this.keys['KeyA'] || this.keys['ArrowLeft']) move.sub(right);

        // Q/E - vertical (thay vì Space/Ctrl để tránh conflict scroll)
        if (this.keys['KeyE']) move.y += 1;
        if (this.keys['KeyQ']) move.y -= 1;

        // Fallback Space/Ctrl
        if (this.keys['Space']) move.y += 1;
        if (this.keys['ControlLeft'] || this.keys['ControlRight']) move.y -= 1;

        if (move.lengthSq() === 0) return;

        move.normalize();

        // Speed with boost
        const isBoost = this.keys['ShiftLeft'] || this.keys['ShiftRight'];
        const speed = isBoost ? this.boostSpeed : this.speed;
        const delta = move.multiplyScalar(speed * dt);

        // Move camera
        this.camera.position.add(delta);

        // Move orbit target theo để giữ orbit distance
        if (this.controls?.target) {
            this.controls.target.add(delta);
        }
    }

    dispose() {
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);
    }
}
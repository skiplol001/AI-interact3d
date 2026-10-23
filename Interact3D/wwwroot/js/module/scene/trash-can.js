// ═══════════════════════════════════════════════════════════════
// trash-can.js — Thùng rác khổng lồ kiểu hoạt hình
//
//   • Dựng hoàn toàn từ primitive (không cần file model)
//   • getFloorY(x, z): trả về đáy thùng nếu (x, z) nằm trong lòng thùng
//   • onCharacterLanded(): thùng rung, nắp bật, rác văng; sau ejectDelay giây
//     nhân vật bị "bắn" ra ngoài, nhảy qua miệng thùng và đáp xuống sàn
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'https://esm.sh/three@0.160.0';

export class TrashCan {
    constructor(scene, options = {}) {
        this.scene = scene;
        this.R = options.radius ?? 0.95;                       // bán kính miệng thùng
        this.H = options.height ?? 1.5;                        // chiều cao thùng
        this.floorY = options.innerFloorY ?? 0.12;             // độ cao đáy thùng (bên trong)
        this.catchRatio = options.catchRatio ?? 1.0;           // tâm nhân vật trong R * ratio thì rơi vào thùng (1.0 = cả miệng thùng)
        this.pullSpeed = options.pullSpeed ?? 10;              // tốc độ kéo nhân vật về tâm sau khi rơi vào (1/giây)
        this.ejectDelay = options.ejectDelay ?? 2.2;           // giây ở trong thùng trước khi bị bắn ra
        this.ejectTime = options.ejectTime ?? 0.8;             // thời gian bay ra
        this.ejectHeight = options.ejectHeight ?? (this.H + 0.9);
        this.LID_OPEN = -1.9;

        this.group = new THREE.Group();
        this.group.position.set(options.x ?? 6, 0, options.z ?? -4);
        this._build();
        scene.add(this.group);

        // Trạng thái hiệu ứng
        this._t = 999;            // thời gian từ lần va chạm gần nhất
        this._impact = 0;         // cường độ rung
        this._occupant = null;    // nhân vật đang ở trong thùng
        this._occupantTimer = 0;
        this._eject = null;
        this._camera = null;
        this._bits = [];
        this._bitGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    }

    // ═══════════════════════════════════════════════════════════
    // DỰNG MODEL
    // ═══════════════════════════════════════════════════════════
    _build() {
        const { R, H } = this;
        const metal = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.55, roughness: 0.45, side: THREE.DoubleSide });
        const dark = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9, side: THREE.DoubleSide });
        const rimMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.7, roughness: 0.3 });
        const add = (mesh) => { mesh.castShadow = true; mesh.receiveShadow = true; this.group.add(mesh); return mesh; };

        // Thân thùng (hở hai đầu, thon dần xuống đáy)
        add(new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.82, H, 40, 1, true), metal))
            .position.y = H / 2;

        // Đáy bên trong
        const bottom = add(new THREE.Mesh(new THREE.CircleGeometry(R * 0.82, 32), dark));
        bottom.rotation.x = -Math.PI / 2;
        bottom.position.y = this.floorY - 0.02;

        // Ba đai gân quanh thân
        [0.2, 0.5, 0.8].forEach((f) => {
            const r = R * (0.82 + 0.18 * f) + 0.01;
            const ring = add(new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 8, 40), rimMat));
            ring.rotation.x = Math.PI / 2;
            ring.position.y = H * f;
        });

        // Viền miệng
        const rim = add(new THREE.Mesh(new THREE.TorusGeometry(R, 0.08, 12, 48), rimMat));
        rim.rotation.x = Math.PI / 2;
        rim.position.y = H;

        // Hai quai hai bên
        [-1, 1].forEach((s) => {
            const handle = add(new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 8, 16, Math.PI), rimMat));
            handle.position.set(s * (R * 0.93), H * 0.72, 0);
            handle.rotation.set(0, Math.PI / 2, s > 0 ? -Math.PI / 2 : Math.PI / 2);
        });

        // Nắp: bản lề ở mép sau, đang mở ngửa ra sau
        this.lid = new THREE.Group();
        this.lid.position.set(0, H + 0.04, -R);
        this.lid.rotation.x = this.LID_OPEN;
        const lidDisc = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.04, R * 1.04, 0.09, 40), metal);
        lidDisc.position.z = R;
        lidDisc.castShadow = true;
        this.lid.add(lidDisc);
        const knob = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.04, 8, 20), rimMat);
        knob.position.set(0, 0.1, R);
        knob.rotation.x = Math.PI / 2;
        this.lid.add(knob);
        this.group.add(this.lid);

        // Rác thò ra ngoài miệng thùng (chỉ để trang trí)
        const bit = (geo, color, x, y, z, rx, rz) => {
            const m = add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.8 })));
            m.position.set(x, y, z);
            m.rotation.set(rx, 0, rz);
        };
        bit(new THREE.CapsuleGeometry(0.07, 0.35, 4, 8), 0xf59e0b, R * 0.98, H + 0.05, 0.25, 0, -1.2);   // chiếc tất
        bit(new THREE.BoxGeometry(0.28, 0.2, 0.18), 0xa16207, -R * 0.95, H + 0.02, 0.3, 0.4, 0.6);      // hộp giấy
        bit(new THREE.ConeGeometry(0.1, 0.3, 8), 0x10b981, 0.2, H + 0.05, R * 0.98, 1.2, 0.3);          // vỏ chuối
    }

    // ═══════════════════════════════════════════════════════════
    // API CHO GrabController / home-3d.js
    // ═══════════════════════════════════════════════════════════

    /** Độ cao mặt sàn tại (x, z): đáy thùng nếu nằm trong lòng thùng, ngược lại 0. */
    getFloorY(x, z) {
        const dx = x - this.group.position.x;
        const dz = z - this.group.position.z;
        return Math.hypot(dx, dz) < this.R * this.catchRatio ? this.floorY : 0;
    }

    /** Gọi từ onLand của GrabController. */
    onCharacterLanded(obj, floorY, camera) {
        if (floorY <= 0.001) return;      // đáp xuống sàn thường, không phải trong thùng
        this._occupant = obj;
        this._occupantTimer = 0;
        this._camera = camera;
        this._eject = null;
        this._impact = 1.5;
        this._t = 0;
        this._spawnBits(14);
    }

    /** Nhân vật đang kẹt trong thùng (dùng để chặn click di chuyển). */
    isOccupied() { return !!this._occupant; }

    // ═══════════════════════════════════════════════════════════
    // UPDATE
    // ═══════════════════════════════════════════════════════════
    update(dt) {
        // Rung lắc thùng + nắp bật
        this._t += dt;
        const k = Math.exp(-this._t * 2.5) * this._impact;
        this.group.rotation.z = Math.sin(this._t * 16) * k * 0.12;
        this.group.rotation.x = Math.cos(this._t * 13) * k * 0.08;
        this.lid.rotation.x = this.LID_OPEN + Math.sin(this._t * 20) * k * 0.5;

        // Nhân vật ở trong thùng → đếm giờ rồi bắn ra
        if (this._occupant && !this._eject) {
            // Hitbox rộng nên nhân vật có thể rơi sát mép → kéo dần về tâm cho khỏi xuyên thành thùng
            const o = this._occupant, c = this.group.position;
            const k = 1 - Math.exp(-this.pullSpeed * dt);
            o.position.x += (c.x - o.position.x) * k;
            o.position.z += (c.z - o.position.z) * k;
            o.updateMatrixWorld(true);

            this._occupantTimer += dt;
            if (this._occupantTimer >= this.ejectDelay) this._startEject();
        }

        if (this._eject) this._updateEject(dt);
        this._updateBits(dt);
    }

    _startEject() {
        const c = this.group.position;
        const cam = this._camera ? this._camera.position : new THREE.Vector3(c.x, 0, c.z + 5);
        const dir = new THREE.Vector2(cam.x - c.x, cam.z - c.z);
        if (dir.lengthSq() < 1e-4) dir.set(0, 1);
        dir.normalize();

        const start = this._occupant.position.clone();
        const end = new THREE.Vector3(c.x + dir.x * (this.R + 0.9), 0, c.z + dir.y * (this.R + 0.9));
        this._eject = { t: 0, start, end, faceY: Math.atan2(dir.x, dir.y) };

        this._impact = 1.2;    // thùng giật một cái
        this._t = 0;
        this._spawnBits(10);
    }

    _updateEject(dt) {
        const e = this._eject;
        e.t = Math.min(1, e.t + dt / this.ejectTime);
        const t = e.t;
        const obj = this._occupant;

        obj.position.x = THREE.MathUtils.lerp(e.start.x, e.end.x, t);
        obj.position.z = THREE.MathUtils.lerp(e.start.z, e.end.z, t);
        obj.position.y = THREE.MathUtils.lerp(e.start.y, 0, t) + 4 * this.ejectHeight * t * (1 - t);
        obj.rotation.y = THREE.MathUtils.lerp(obj.rotation.y, e.faceY, 0.15);
        obj.updateMatrixWorld(true);

        if (t >= 1) {
            obj.position.y = 0;
            obj.rotation.y = e.faceY;
            this._occupant = null;
            this._eject = null;
            this._impact = 0.6;
            this._t = 0;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // RÁC VĂNG
    // ═══════════════════════════════════════════════════════════
    _spawnBits(n) {
        const colors = [0xf59e0b, 0x10b981, 0xef4444, 0x38bdf8, 0xe2e8f0, 0xa16207];
        const c = this.group.position;
        for (let i = 0; i < n; i++) {
            const mat = new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.7 });
            const m = new THREE.Mesh(this._bitGeo, mat);
            m.position.set(c.x + (Math.random() - 0.5) * 0.6, this.H + 0.1, c.z + (Math.random() - 0.5) * 0.6);
            m.scale.setScalar(0.6 + Math.random() * 1.2);
            m.castShadow = true;
            this.scene.add(m);
            this._bits.push({
                mesh: m,
                vel: new THREE.Vector3((Math.random() - 0.5) * 4, 4 + Math.random() * 3, (Math.random() - 0.5) * 4),
                spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8),
                life: 1.4,
            });
        }
    }

    _updateBits(dt) {
        for (let i = this._bits.length - 1; i >= 0; i--) {
            const b = this._bits[i];
            b.life -= dt;
            b.vel.y -= 14 * dt;
            b.mesh.position.addScaledVector(b.vel, dt);
            b.mesh.rotation.x += b.spin.x * dt;
            b.mesh.rotation.y += b.spin.y * dt;
            if (b.mesh.position.y < 0.06) { b.mesh.position.y = 0.06; b.vel.set(0, 0, 0); b.spin.set(0, 0, 0); }
            if (b.life <= 0) {
                this.scene.remove(b.mesh);
                b.mesh.material.dispose();
                this._bits.splice(i, 1);
            }
        }
    }

    dispose() {
        this.scene.remove(this.group);
        this._bits.forEach((b) => { this.scene.remove(b.mesh); b.mesh.material.dispose(); });
        this._bits.length = 0;
        this._bitGeo.dispose();
    }
}
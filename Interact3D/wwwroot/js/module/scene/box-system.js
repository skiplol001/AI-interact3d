// ═══════════════════════════════════════════════════════════════
// BoxSystem — Quản lý box 3D + Falling Physics
//
// ⭐ Bước 1 của AI command:
//   ✅ addBox() tự gán ID (b1, b2, ...) → dùng cho AI tool calls
//   ✅ getBoxById(id) → tìm box theo ID
//   ✅ findNearestByColor(color, fromPos) → box gần nhất theo màu
//   ✅ getAllBoxesInfo(limit, nearPos) → snapshot JSON cho LLM
//   ✅ Map hex ↔ tên màu: amber, green, blue, red, purple, pink
//
// API cũ giữ nguyên:
//   addBox / update / findBoxUnderCursor / findFloorPoint / highlight
//   removeBox / clearAll / spawnRandom / count / getCarried / dispose
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'https://esm.sh/three@0.160.0';

// ═══ Bảng màu chuẩn — dùng chung cho addBox / AI ═══
const COLOR_MAP = {
    0xf59e0b: 'amber',
    0x10b981: 'green',
    0x3b82f6: 'blue',
    0xef4444: 'red',
    0x8b5cf6: 'purple',
    0xec4899: 'pink',
};

// ═══ Alias để AI gõ tự nhiên hơn ═══
const NAME_TO_HEX = {
    amber: 0xf59e0b,
    green: 0x10b981,
    blue: 0x3b82f6,
    red: 0xef4444,
    purple: 0x8b5cf6,
    pink: 0xec4899,
    // alias phổ biến
    yellow: 0xf59e0b,
    orange: 0xf59e0b,
    lime: 0x10b981,
    cyan: 0x3b82f6,
    violet: 0x8b5cf6,
    magenta: 0xec4899,
};

export class BoxSystem {
    constructor(scene, floorMesh, camera, canvas, options = {}) {
        this.scene = scene;
        this.floorMesh = floorMesh;
        this.camera = camera;
        this.canvas = canvas;
        this.boxes = [];
        this._boxSize = options.boxSize ?? 0.4;
        this._onBoxChange = options.onBoxChange || null;
        this._onLand = options.onLand || null;

        this.geometry = new THREE.BoxGeometry(this._boxSize, this._boxSize, this._boxSize);
        this._matCache = new Map();
        this._raycaster = new THREE.Raycaster();

        // ⭐ Falling state
        this._fallingBoxes = [];

        // ⭐ ID counter — reset khi new BoxSystem
        this._nextId = 1;
    }

    // ═══════════════════════════════════════════════════════════
    // ⭐ STATIC HELPERS — map màu
    // ═══════════════════════════════════════════════════════════
    static getColorName(hexColor) {
        if (typeof hexColor !== 'number') return String(hexColor);
        return COLOR_MAP[hexColor] || `#${hexColor.toString(16).padStart(6, '0')}`;
    }

    static getColorFromName(nameOrHex) {
        if (typeof nameOrHex === 'number') return nameOrHex;
        const key = String(nameOrHex).toLowerCase().trim();
        if (key.startsWith('#')) return parseInt(key.replace('#', '0x'), 16);
        return NAME_TO_HEX[key] ?? 0xf59e0b;
    }

    static getAvailableColorNames() {
        return Object.values(COLOR_MAP);
    }

    // ═══════════════════════════════════════════════════════════
    // TẠO BOX — Hỗ trợ rơi từ trên cao
    // ═══════════════════════════════════════════════════════════
    addBox(x, z, color = 0xf59e0b, options = {}) {
        const mat = this._getMaterial(color);
        const box = new THREE.Mesh(this.geometry, mat);

        const startY = options.spawnHeight ?? (this._boxSize / 2);
        box.position.set(x, startY, z);
        box.castShadow = true;
        box.receiveShadow = true;

        box.userData.isBox = true;
        box.userData.carried = false;
        box.userData.color = color;
        box.userData.colorName = BoxSystem.getColorName(color);   // ⭐ MỚI
        box.userData.id = `b${this._nextId++}`;                    // ⭐ MỚI
        box.userData.velocityY = 0;
        box.userData.targetY = this._boxSize / 2;
        box.userData.isFalling = startY > this._boxSize / 2 + 0.05;

        this.scene.add(box);
        this.boxes.push(box);

        if (box.userData.isFalling) {
            this._fallingBoxes.push(box);
        }

        if (this._onBoxChange) this._onBoxChange(this.boxes.length);
        return box;
    }

    _getMaterial(color) {
        if (!this._matCache.has(color)) {
            const mat = new THREE.MeshStandardMaterial({
                color,
                roughness: 0.65,
                metalness: 0.1,
                emissive: new THREE.Color(color),
                emissiveIntensity: 0,
            });
            this._matCache.set(color, mat);
        }
        return this._matCache.get(color);
    }

    // ═══════════════════════════════════════════════════════════
    // ⭐ LOOKUP — dùng cho AI tool calls
    // ═══════════════════════════════════════════════════════════
    getBoxById(id) {
        if (!id) return null;
        return this.boxes.find(b => b.userData.id === id) || null;
    }

    findNearestByColor(color, fromPos = null, excludeCarried = true) {
        const targetHex = BoxSystem.getColorFromName(color);
        const origin = fromPos || new THREE.Vector3(0, 0, 0);

        let best = null;
        let bestDist = Infinity;

        for (const box of this.boxes) {
            if (excludeCarried && box.userData.carried) continue;
            if (box.userData.color !== targetHex) continue;

            const d = box.position.distanceToSquared(origin);
            if (d < bestDist) {
                bestDist = d;
                best = box;
            }
        }
        return best;
    }

    // ⭐ Snapshot JSON để gửi cho LLM
    //   - limit: tối đa bao nhiêu box (tránh phình token)
    //   - nearPos: nếu có, ưu tiên box gần vị trí này nhất
    getAllBoxesInfo(limit = 10, nearPos = null) {
        let arr = this.boxes.slice();

        if (nearPos) {
            arr.sort((a, b) =>
                a.position.distanceToSquared(nearPos) -
                b.position.distanceToSquared(nearPos)
            );
        }

        return arr.slice(0, limit).map(box => ({
            id: box.userData.id,
            color: box.userData.colorName,
            colorHex: '#' + box.userData.color.toString(16).padStart(6, '0'),
            pos: [
                +box.position.x.toFixed(2),
                +box.position.y.toFixed(2),
                +box.position.z.toFixed(2),
            ],
            carried: !!box.userData.carried,
        }));
    }

    // ═══════════════════════════════════════════════════════════
    // UPDATE — Physics rơi
    // ═══════════════════════════════════════════════════════════
    update(dt) {
        if (this._fallingBoxes.length === 0) return;

        const GRAVITY = -12.0;
        const BOUNCE_FACTOR = 0.35;
        const MIN_BOUNCE = 0.5;

        for (let i = this._fallingBoxes.length - 1; i >= 0; i--) {
            const box = this._fallingBoxes[i];

            if (box.userData.carried) {
                this._fallingBoxes.splice(i, 1);
                continue;
            }

            box.userData.velocityY += GRAVITY * dt;
            box.position.y += box.userData.velocityY * dt;

            if (box.position.y <= box.userData.targetY) {
                box.position.y = box.userData.targetY;

                const impactVelocity = Math.abs(box.userData.velocityY);

                if (impactVelocity > MIN_BOUNCE) {
                    box.userData.velocityY = impactVelocity * BOUNCE_FACTOR;
                    box.scale.set(1.3, 0.7, 1.3);
                } else {
                    box.userData.velocityY = 0;
                    box.userData.isFalling = false;
                    box.scale.set(1, 1, 1);
                    this._fallingBoxes.splice(i, 1);

                    if (this._onLand) this._onLand(box, impactVelocity);
                }
            }

            if (box.scale.x !== 1 || box.scale.y !== 1 || box.scale.z !== 1) {
                const recover = Math.min(dt * 10, 1);
                box.scale.x = THREE.MathUtils.lerp(box.scale.x, 1, recover);
                box.scale.y = THREE.MathUtils.lerp(box.scale.y, 1, recover);
                box.scale.z = THREE.MathUtils.lerp(box.scale.z, 1, recover);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    findBoxUnderCursor(ndc) {
        if (this.boxes.length === 0) return null;
        this._raycaster.setFromCamera(ndc, this.camera);
        const hits = this._raycaster.intersectObjects(this.boxes, false);
        return hits.length > 0 ? hits[0].object : null;
    }

    findFloorPoint(ndc) {
        this._raycaster.setFromCamera(ndc, this.camera);
        const hits = this._raycaster.intersectObject(this.floorMesh);
        return hits.length > 0 ? hits[0].point : null;
    }

    highlight(box, enable = true) {
        if (!box || box.userData.carried) return;
        if (enable) {
            box.material = box.material.clone();
            box.material.emissiveIntensity = 0.8;
        } else {
            const origColor = box.userData.color ?? 0xf59e0b;
            box.material.emissiveIntensity = 0;
            box.material = this._getMaterial(origColor);
        }
    }

    removeBox(box) {
        const idx = this.boxes.indexOf(box);
        if (idx >= 0) this.boxes.splice(idx, 1);
        const fix = this._fallingBoxes.indexOf(box);
        if (fix >= 0) this._fallingBoxes.splice(fix, 1);
        this.scene.remove(box);
        if (this._onBoxChange) this._onBoxChange(this.boxes.length);
    }

    clearAll() {
        for (const box of this.boxes) {
            this.scene.remove(box);
        }
        this.boxes = [];
        this._fallingBoxes = [];
        if (this._onBoxChange) this._onBoxChange(0);
    }

    spawnRandom(count = 1, range = 8) {
        const colors = Object.keys(COLOR_MAP).map(Number);
        const spawned = [];
        for (let i = 0; i < count; i++) {
            const x = (Math.random() - 0.5) * range * 2;
            const z = (Math.random() - 0.5) * range * 2;
            const color = colors[Math.floor(Math.random() * colors.length)];
            spawned.push(this.addBox(x, z, color, { spawnHeight: 3 + Math.random() * 2 }));
        }
        return spawned;
    }

    get count() { return this.boxes.length; }
    getCarried() { return this.boxes.find(b => b.userData.carried) || null; }

    dispose() {
        this.clearAll();
        this.geometry.dispose();
        for (const mat of this._matCache.values()) mat.dispose();
        this._matCache.clear();
    }
}
// ═══════════════════════════════════════════════════════════════
// box-system.js — v41 (Structural Physics + AOE Kick)
// [PART 1/2] — Constants, Helpers, Visuals, Material
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'https://esm.sh/three@0.160.0';

const COLOR_MAP = { 0xf59e0b: 'amber', 0x10b981: 'green', 0x3b82f6: 'blue', 0xef4444: 'red', 0x8b5cf6: 'purple', 0xec4899: 'pink' };
const NAME_TO_HEX = { amber: 0xf59e0b, green: 0x10b981, blue: 0x3b82f6, red: 0xef4444, purple: 0x8b5cf6, pink: 0xec4899, yellow: 0xf59e0b, orange: 0xf59e0b, lime: 0x10b981, cyan: 0x3b82f6, violet: 0x8b5cf6, magenta: 0xec4899 };

const SHAPE_DIMS = {
    box: { w: 0.4, h: 0.4, d: 0.4 }, beam: { w: 0.4, h: 0.4, d: 1.2 }, pillar: { w: 0.4, h: 1.2, d: 0.4 },
    prism: { w: 0.4, h: 0.4, d: 0.4 }, door: { w: 0.8, h: 1.2, d: 0.1 }, window: { w: 0.8, h: 0.8, d: 0.1 },
    table: { w: 1.0, h: 0.8, d: 1.0 }, chair: { w: 0.5, h: 0.8, d: 0.5 }, bed: { w: 1.5, h: 0.6, d: 2.0 },
    fridge: { w: 0.8, h: 1.8, d: 0.8 }, lamp: { w: 0.3, h: 1.5, d: 0.3 },
};

const MASS = { box: 1.0, beam: 1.6, pillar: 3.0, prism: 0.8, door: 0.8, window: 0.6, table: 1.4, chair: 0.7, bed: 2.2, fridge: 2.5, lamp: 0.5 };

const GRAVITY = -15.0, BOUNCE_FACTOR = 0.35, MIN_BOUNCE = 0.9, AIR_DRAG = 0.35, GROUND_FRICTION = 5.0, FLOOR_LIMIT = 38;
const MAX_FLIGHT_TIME = 8.0, KICK_SPEED = 9.0, KICK_UP = 5.5, MAX_H_SPEED = 28.0, MAX_V_SPEED = 14.0;
const BLAST_POWER_REF = 60, SUBSTEP = 0.016, TWO_PI = Math.PI * 2;

const SUPPORT_EPS = 0.06, NEAR_GAP = 0.08, PILLAR_NEAR = 0.35, CEMENT_HOPS = 2, COM_TOL = 0.02, COM_TOL_REINFORCED = 0.15, SLIDE_OFF_SPEED = 2.5;

const _tmpEuler = new THREE.Euler(0, 0, 0, 'YXZ'), _tmpMat = new THREE.Matrix4();

function orientedExtents(base, rx, ry, rz) {
    _tmpEuler.set(rx, ry, rz, 'YXZ'); _tmpMat.makeRotationFromEuler(_tmpEuler);
    const e = _tmpMat.elements;
    return {
        w: Math.abs(e[0]) * base.w + Math.abs(e[4]) * base.h + Math.abs(e[8]) * base.d,
        h: Math.abs(e[1]) * base.w + Math.abs(e[5]) * base.h + Math.abs(e[9]) * base.d,
        d: Math.abs(e[2]) * base.w + Math.abs(e[6]) * base.h + Math.abs(e[10]) * base.d,
    };
}
function nearestRot(cur, rest) { return rest + TWO_PI * Math.round((cur - rest) / TWO_PI); }

export class BoxSystem {
    constructor(scene, floorMesh, camera, canvas, options = {}) {
        this.scene = scene; this.floorMesh = floorMesh; this.camera = camera; this.canvas = canvas;
        this.boxes = []; this._boxSize = options.boxSize ?? 0.4;
        this._onBoxChange = options.onBoxChange || null; this._onLand = options.onLand || null;
        this._onBoxSpawn = options.onBoxSpawn || null; this._onBoxRemove = options.onBoxRemove || null;

        this.geometry = new THREE.BoxGeometry(this._boxSize, this._boxSize, this._boxSize);
        this._matCache = new Map(); this._texCache = new Map(); this._geoCache = new Map();
        this._proxyMat = new THREE.MeshBasicMaterial({ visible: false });
        this._raycaster = new THREE.Raycaster(); this._fallingBoxes = []; this._nextId = 1; this._dirty = false;

        this.cements = []; this._cementLinesGroup = null; this._cementVisible = false;
        this._cementMat = new THREE.LineBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.6 });
    }

    static getColorName(hexColor) { if (typeof hexColor !== 'number') return String(hexColor); return COLOR_MAP[hexColor] || `#${hexColor.toString(16).padStart(6, '0')}`; }
    static getColorFromName(nameOrHex) { if (typeof nameOrHex === 'number') return nameOrHex; const key = String(nameOrHex).toLowerCase().trim(); if (key.startsWith('#')) return parseInt(key.replace('#', '0x'), 16); return NAME_TO_HEX[key] ?? 0xf59e0b; }
    static getAvailableColorNames() { return Object.values(COLOR_MAP); }

    getShapeDims(type) { return SHAPE_DIMS[type] || SHAPE_DIMS.box; }

    getExtents(box) {
        if (!box) return { w: this._boxSize, h: this._boxSize, d: this._boxSize };
        const type = box.userData.shapeType || 'box'; const b = this.getShapeDims(type); const s = box.scale;
        return orientedExtents({ w: b.w * Math.abs(s.x), h: b.h * Math.abs(s.y), d: b.d * Math.abs(s.z) }, box.rotation.x, box.rotation.y, box.rotation.z);
    }

    getOrientedExtents(type, rx, ry, rz) { return orientedExtents(this.getShapeDims(type), rx, ry, rz); }

    _getTexture(kind) {
        if (kind !== 'wood' && kind !== 'block') return null;
        if (this._texCache.has(kind)) return this._texCache.get(kind);
        if (typeof document === 'undefined') return null;
        const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
        const g = c.getContext('2d'); if (!g) return null;
        g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
        if (kind === 'wood') {
            for (let x = 0; x < S; x += 2) { g.fillStyle = `rgba(70,40,10,${(0.05 + Math.random() * 0.18).toFixed(3)})`; g.fillRect(x, 0, 1 + Math.random() * 2, S); }
            for (let i = 0; i < 3; i++) { const kx = 16 + Math.random() * 96, ky = 16 + Math.random() * 96; g.fillStyle = 'rgba(60,32,8,0.22)'; g.beginPath(); g.ellipse(kx, ky, 3 + Math.random() * 3, 6 + Math.random() * 5, 0, 0, TWO_PI); g.fill(); }
        } else {
            for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(0,0,0,${(Math.random() * 0.06).toFixed(3)})`; g.fillRect(Math.random() * S, Math.random() * S, 2, 2); }
            g.strokeStyle = 'rgba(0,0,0,0.34)'; g.lineWidth = 8; g.strokeRect(4, 4, S - 8, S - 8);
            g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; g.strokeRect(9, 9, S - 18, S - 18);
        }
        const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
        this._texCache.set(kind, tex); return tex;
    }

    _getMaterial(color, kind = 'block') {
        const key = `${kind}|${color}`; let mat = this._matCache.get(key); if (mat) return mat;
        switch (kind) {
            case 'glass': mat = new THREE.MeshStandardMaterial({ color, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.35, depthWrite: false }); break;
            case 'metal': mat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.8 }); break;
            case 'emit': mat = new THREE.MeshStandardMaterial({ color, emissive: new THREE.Color(color), emissiveIntensity: 1.1, roughness: 0.5 }); break;
            case 'fabric': mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0 }); break;
            case 'wood': mat = new THREE.MeshStandardMaterial({ color, map: this._getTexture('wood'), roughness: 0.8, metalness: 0.02, emissive: new THREE.Color(color), emissiveIntensity: 0 }); break;
            default: mat = new THREE.MeshStandardMaterial({ color, map: this._getTexture('block'), roughness: 0.7, metalness: 0.03, emissive: new THREE.Color(color), emissiveIntensity: 0 });
        }
        this._matCache.set(key, mat); return mat;
    }

    _boxGeo(w, h, d) { const key = `b${w}|${h}|${d}`; let g = this._geoCache.get(key); if (!g) { g = new THREE.BoxGeometry(w, h, d); this._geoCache.set(key, g); } return g; }
    _cylGeo(rt, rb, h, seg = 24) { const key = `c${rt}|${rb}|${h}|${seg}`; let g = this._geoCache.get(key); if (!g) { g = new THREE.CylinderGeometry(rt, rb, h, seg); this._geoCache.set(key, g); } return g; }

    _prismGeo(d) {
        const key = `p${d.w}|${d.h}|${d.d}`; let g = this._geoCache.get(key); if (g) return g;
        const s = new THREE.Shape(); s.moveTo(-d.w / 2, -d.h / 2); s.lineTo(d.w / 2, -d.h / 2); s.lineTo(-d.w / 2, d.h / 2); s.closePath();
        g = new THREE.ExtrudeGeometry(s, { depth: d.d, bevelEnabled: false, steps: 1 }); g.translate(0, 0, -d.d / 2);
        const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
        if (pos && nor && uv) {
            for (let i = 0; i < pos.count; i++) {
                if (Math.abs(nor.getZ(i)) > 0.5) uv.setXY(i, pos.getX(i) / d.w + 0.5, pos.getY(i) / d.h + 0.5);
                else uv.setXY(i, pos.getZ(i) / d.d + 0.5, pos.getY(i) / d.h + 0.5);
            }
            uv.needsUpdate = true;
        }
        this._geoCache.set(key, g); return g;
    }

    createGeometry(type) {
        const d = this.getShapeDims(type);
        if (type === 'pillar') return this._cylGeo(0.2, 0.2, d.h, 24);
        if (type === 'prism') return this._prismGeo(d);
        return this._boxGeo(d.w, d.h, d.d);
    }

    _mesh(geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; }
    _proxy(d) { const m = new THREE.Mesh(this._boxGeo(d.w, d.h, d.d), this._proxyMat); m.userData.proxy = true; m.castShadow = false; m.receiveShadow = false; return m; }

    _buildVisual(type, color, options = {}) {
        const d = this.getShapeDims(type); const wood = (c = 0x8b5a2b) => this._getMaterial(c, 'wood');
        switch (type) {
            case 'beam': return new THREE.Mesh(this._boxGeo(d.w, d.h, d.d), this._getMaterial(color, 'wood'));
            case 'pillar': {
                const root = new THREE.Mesh(this._cylGeo(0.2, 0.2, d.h, 24), this._getMaterial(color, 'wood'));
                const band = this._getMaterial(0x3f3f46, 'metal'); const bg = this._cylGeo(0.208, 0.208, 0.05, 24);
                root.add(this._mesh(bg, band, 0, d.h / 2 - 0.06, 0)); root.add(this._mesh(bg, band, 0, -d.h / 2 + 0.06, 0));
                root.add(this._mesh(this._cylGeo(0.22, 0.22, 0.04, 24), band, 0, d.h / 2 - 0.02, 0)); root.add(this._mesh(this._cylGeo(0.22, 0.22, 0.04, 24), band, 0, -d.h / 2 + 0.02, 0));
                return root;
            }
            case 'prism': return new THREE.Mesh(this._prismGeo(d), this._getMaterial(color, 'block'));
            case 'door': {
                const root = new THREE.Mesh(this._boxGeo(d.w, d.h, d.d), wood(color)); const inset = wood(0x6b3a12); const ig = this._boxGeo(d.w * 0.7, d.h * 0.36, 0.02);
                for (const s of [1, -1]) { root.add(this._mesh(ig, inset, 0, 0.3, s * (d.d / 2 + 0.003))); root.add(this._mesh(ig, inset, 0, -0.3, s * (d.d / 2 + 0.003))); }
                const knobX = (options.flip ? -1 : 1) * (d.w / 2 - 0.09); let kg = this._geoCache.get('knob'); if (!kg) { kg = new THREE.SphereGeometry(0.035, 12, 10); this._geoCache.set('knob', kg); }
                const km = this._getMaterial(0xd4a017, 'metal'); root.add(this._mesh(kg, km, knobX, -0.05, d.d / 2 + 0.04)); root.add(this._mesh(kg, km, knobX, -0.05, -d.d / 2 - 0.04)); return root;
            }
            case 'window': {
                const root = new THREE.Mesh(this._boxGeo(d.w - 0.08, d.h - 0.08, 0.03), this._getMaterial(color, 'glass')); const fm = this._getMaterial(0xf5f5f4, 'block');
                root.add(this._mesh(this._boxGeo(d.w, 0.08, d.d), fm, 0, d.h / 2 - 0.04, 0)); root.add(this._mesh(this._boxGeo(d.w, 0.08, d.d), fm, 0, -d.h / 2 + 0.04, 0));
                root.add(this._mesh(this._boxGeo(0.08, d.h - 0.16, d.d), fm, d.w / 2 - 0.04, 0, 0)); root.add(this._mesh(this._boxGeo(0.08, d.h - 0.16, d.d), fm, -d.w / 2 + 0.04, 0, 0));
                root.add(this._mesh(this._boxGeo(0.04, d.h - 0.16, 0.06), fm, 0, 0, 0)); root.add(this._mesh(this._boxGeo(d.w - 0.16, 0.04, 0.06), fm, 0, 0, 0)); return root;
            }
            case 'table': {
                const root = this._proxy(d); const wm = this._getMaterial(color, 'wood'); root.add(this._mesh(this._boxGeo(d.w, 0.08, d.d), wm, 0, d.h / 2 - 0.04, 0));
                const lg = this._boxGeo(0.08, d.h - 0.08, 0.08);
                for (let i = 0; i < 4; i++) root.add(this._mesh(lg, wm, (i % 2 ? 1 : -1) * (d.w / 2 - 0.08), -0.04, (i < 2 ? 1 : -1) * (d.d / 2 - 0.08)));
                return root;
            }
            case 'chair': {
                const root = this._proxy(d); const wm = this._getMaterial(color, 'wood'); const floor = -d.h / 2;
                root.add(this._mesh(this._boxGeo(d.w, 0.06, d.d), wm, 0, floor + 0.42 - 0.03, 0)); const lg = this._boxGeo(0.05, 0.39, 0.05);
                for (let i = 0; i < 4; i++) root.add(this._mesh(lg, wm, (i % 2 ? 1 : -1) * (d.w / 2 - 0.04), floor + 0.195, (i < 2 ? 1 : -1) * (d.d / 2 - 0.04)));
                root.add(this._mesh(this._boxGeo(d.w, 0.36, 0.05), wm, 0, floor + 0.42 + 0.18, -d.d / 2 + 0.025)); return root;
            }
            case 'bed': {
                const root = this._proxy(d); const frame = this._getMaterial(0x8b5a2b, 'wood'); const sheet = this._getMaterial(color, 'fabric');
                const blanket = this._getMaterial(0x60a5fa, 'fabric'); const pillow = this._getMaterial(0xf8fafc, 'fabric'); const f = -d.h / 2;
                root.add(this._mesh(this._boxGeo(d.w, 0.22, d.d), frame, 0, f + 0.11, 0)); root.add(this._mesh(this._boxGeo(d.w - 0.1, 0.16, d.d - 0.1), sheet, 0, f + 0.3, 0.02));
                root.add(this._mesh(this._boxGeo(d.w - 0.08, 0.04, d.d * 0.55), blanket, 0, f + 0.4, 0.3));
                const pg = this._boxGeo(0.55, 0.1, 0.3); root.add(this._mesh(pg, pillow, -0.36, f + 0.43, -0.72)); root.add(this._mesh(pg, pillow, 0.36, f + 0.43, -0.72));
                root.add(this._mesh(this._boxGeo(d.w, d.h, 0.08), frame, 0, 0, -d.d / 2 + 0.04)); root.add(this._mesh(this._boxGeo(d.w, 0.3, 0.08), frame, 0, f + 0.15, d.d / 2 - 0.04)); return root;
            }
            case 'fridge': {
                const root = this._proxy(d); const body = this._getMaterial(color, 'metal'); const dark = this._getMaterial(0x374151, 'metal');
                root.add(this._mesh(this._boxGeo(d.w, d.h - 0.06, d.d), body, 0, 0.03, 0)); root.add(this._mesh(this._boxGeo(d.w - 0.04, 0.06, d.d - 0.04), dark, 0, -d.h / 2 + 0.03, 0));
                root.add(this._mesh(this._boxGeo(d.w - 0.02, 0.02, 0.02), dark, 0, 0.35, d.d / 2 + 0.002)); root.add(this._mesh(this._boxGeo(0.04, 0.4, 0.05), dark, d.w / 2 - 0.1, 0.65, d.d / 2 + 0.03));
                root.add(this._mesh(this._boxGeo(0.04, 0.3, 0.05), dark, d.w / 2 - 0.1, -0.15, d.d / 2 + 0.03)); return root;
            }
            case 'lamp': {
                const root = this._proxy(d); const metal = this._getMaterial(0x4b5563, 'metal'); const glow = this._getMaterial(color, 'emit'); const f = -d.h / 2;
                root.add(this._mesh(this._cylGeo(0.14, 0.14, 0.05, 20), metal, 0, f + 0.025, 0)); root.add(this._mesh(this._cylGeo(0.02, 0.02, 1.15, 10), metal, 0, f + 0.05 + 0.575, 0));
                root.add(this._mesh(this._cylGeo(0.09, 0.15, 0.26, 20), glow, 0, d.h / 2 - 0.13, 0)); return root;
            }
            default: return new THREE.Mesh(this._boxGeo(d.w, d.h, d.d), this._getMaterial(color, 'block'));
        }
    }

    _spawnShape(x, z, color, type, options = {}) {
        const dims = this.getShapeDims(type); const box = this._buildVisual(type, color, options);
        box.position.set(x, options.spawnHeight ?? (dims.h / 2));
        box.rotation.order = 'YXZ'; box.rotation.y = options.rotationY || 0; box.rotation.x = options.rotationX || 0; box.rotation.z = options.rotationZ || 0;
        box.traverse(c => { if (!c.isMesh || c.userData.proxy) return; c.castShadow = !(c.material && c.material.transparent); c.receiveShadow = true; });

        const ud = box.userData;
        ud.isBox = true; ud.carried = false; ud.color = color; ud.colorName = BoxSystem.getColorName(color);
        ud.id = `b${this._nextId++}`; ud.velocityX = 0; ud.velocityY = 0; ud.velocityZ = 0; ud.angX = 0; ud.angY = 0; ud.angZ = 0;
        ud.targetY = dims.h / 2; ud.isFalling = options.placed ? false : (options.spawnHeight || 0) > dims.h / 2 + 0.05;
        ud.isStatic = false; ud.isSupported = false; ud.shapeType = type; ud.flip = !!options.flip;
        ud.grounded = false; ud.hasImpacted = false; ud.flightT = 0; ud.restRotX = box.rotation.x; ud.restRotZ = box.rotation.z;

        this.scene.add(box); this.boxes.push(box); if (ud.isFalling) this._fallingBoxes.push(box);
        if (this._onBoxChange) this._onBoxChange(this.boxes.length); if (this._onBoxSpawn) this._onBoxSpawn(box, { type });
        return box;
    }

    addBox(x, z, color = 0xf59e0b, options = {}) { return this._spawnShape(x, z, color, options.shapeType || 'box', options); }
    addPillar(x, z, options = {}) { return this._spawnShape(x, z, options.color || 0x8b5a2b, 'pillar', options); }
    addBeam(x, z, options = {}) { return this._spawnShape(x, z, options.color || 0x8b5a2b, 'beam', options); }
    addDoor(x, z, color = 0x8b4513, options = {}) { return this._spawnShape(x, z, color, 'door', options); }
    addWindow(x, z, color = 0x87ceeb, options = {}) { return this._spawnShape(x, z, color, 'window', options); }
    addTable(x, z, options = {}) { return this._spawnShape(x, z, options.color || 0x8b5a2b, 'table', options); }
    addChair(x, z, options = {}) { return this._spawnShape(x, z, options.color || 0x8b5a2b, 'chair', options); }
    addBed(x, z, options = {}) { return this._spawnShape(x, z, options.color || 0xffffff, 'bed', options); }
    addFridge(x, z, options = {}) { return this._spawnShape(x, z, options.color || 0xcccccc, 'fridge', options); }
    addLamp(x, z, options = {}) { return this._spawnShape(x, z, options.color || 0xffd700, 'lamp', options); }

// ═══ TIẾP THEO Ở PART 2/2 ═══
    // ═══════════════════════════════════════════════════════════════
    // box-system.js — v41 (Structural Physics + AOE Kick)
    // [PART 2/2] — Physics, Stability, AOE Kick, Raycasting
    // ═══════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════
    // CEMENT & REINFORCEMENT
    // ═══════════════════════════════════════════════════════════
    addCement(a, b) {
        if (!a || !b || a === b) return;
        if (this.cements.some(c => (c.a === a && c.b === b) || (c.a === b && c.b === a))) return;
        this.cements.push({ a, b });
        this._updateCementLines();
    }

    removeCement(cementObj) {
        const idx = this.cements.indexOf(cementObj);
        if (idx !== -1) {
            this.cements.splice(idx, 1);
            this._updateCementLines();
        }
    }

    _detachCements(box) {
        const before = this.cements.length;
        this.cements = this.cements.filter(c => c.a !== box && c.b !== box);
        if (this.cements.length !== before) this._updateCementLines();
    }

    setCementVisible(visible) {
        this._cementVisible = visible;
        if (!this._cementLinesGroup) {
            this._cementLinesGroup = new THREE.Group();
            this.scene.add(this._cementLinesGroup);
        }
        this._cementLinesGroup.visible = visible;
        this._updateCementLines();
    }

    _updateCementLines() {
        if (!this._cementLinesGroup || !this._cementVisible) return;
        for (const child of this._cementLinesGroup.children) child.geometry?.dispose();
        this._cementLinesGroup.clear();
        for (const c of this.cements) {
            if (!c.a || !c.b) continue;
            const lineGeo = new THREE.BufferGeometry().setFromPoints([c.a.position, c.b.position]);
            this._cementLinesGroup.add(new THREE.Line(lineGeo, this._cementMat));
        }
    }

    _gap(a, ae, b, be) {
        const gx = Math.abs(a.position.x - b.position.x) - (ae.w + be.w) / 2;
        const gy = Math.abs(a.position.y - b.position.y) - (ae.h + be.h) / 2;
        const gz = Math.abs(a.position.z - b.position.z) - (ae.d + be.d) / 2;
        return Math.hypot(Math.max(gx, 0), Math.max(gy, 0), Math.max(gz, 0));
    }

    // Gia cố: có xi măng / có khối sát bên / gần cột
    _isReinforced(box, ext = null, lateralOnly = false) {
        if (this.cements.some(c => c.a === box || c.b === box)) return true;
        const e = ext || this.getExtents(box);
        for (const o of this.boxes) {
            if (o === box || o.userData.carried || o.userData.isFalling) continue;
            const oe = this.getExtents(o);
            const gap = this._gap(box, e, o, oe);
            const near = gap <= NEAR_GAP || (o.userData.shapeType === 'pillar' && gap <= PILLAR_NEAR);
            if (!near) continue;
            if (lateralOnly) {
                const vOverlap = (e.h + oe.h) / 2 - Math.abs(box.position.y - o.position.y);
                if (vOverlap <= 0.05) continue;
            }
            return true;
        }
        return false;
    }

    _tol(box, reinforced) {
        if (box.userData.shapeType === 'beam') return COM_TOL;
        return reinforced ? COM_TOL_REINFORCED : COM_TOL;
    }

    _overlapXZ(a, ae, b, be) {
        return Math.abs(a.position.x - b.position.x) < (ae.w + be.w) / 2 - 0.03 &&
            Math.abs(a.position.z - b.position.z) < (ae.d + be.d) / 2 - 0.03;
    }

    _supportLevel(box, ext, prevBottom) {
        let level = 0;
        for (const b of this.boxes) {
            if (b === box || b.userData.carried || b.userData.isFalling) continue;
            const be = this.getExtents(b);
            if (!this._overlapXZ(box, ext, b, be)) continue;
            const top = b.position.y + be.h / 2;
            if (top <= prevBottom + 0.06 && top > level) level = top;
        }
        return level;
    }

    _supportHull(px, pz, e, bottom, list, ext, stable, self) {
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        let hops = Infinity, found = false;
        for (const o of list) {
            if (o === self) continue;
            if (stable && !stable.has(o)) continue;
            const oe = ext ? ext.get(o) : this.getExtents(o);
            if (Math.abs(o.position.y + oe.h / 2 - bottom) > SUPPORT_EPS) continue;
            const x0 = Math.max(px - e.w / 2, o.position.x - oe.w / 2);
            const x1 = Math.min(px + e.w / 2, o.position.x + oe.w / 2);
            const z0 = Math.max(pz - e.d / 2, o.position.z - oe.d / 2);
            const z1 = Math.min(pz + e.d / 2, o.position.z + oe.d / 2);
            if (x1 - x0 <= 0.03 || z1 - z0 <= 0.03) continue;
            found = true;
            if (x0 < minX) minX = x0; if (x1 > maxX) maxX = x1;
            if (z0 < minZ) minZ = z0; if (z1 > maxZ) maxZ = z1;
            if (stable) hops = Math.min(hops, stable.get(o));
        }
        return found ? { minX, maxX, minZ, maxZ, hops: stable ? hops : 0 } : null;
    }

    _insideHull(px, pz, h, tol) {
        return px >= h.minX - tol && px <= h.maxX + tol && pz >= h.minZ - tol && pz <= h.maxZ + tol;
    }

    _computeStable() {
        const list = this.boxes.filter(b => !b.userData.carried && !b.userData.isFalling);
        const ext = new Map();
        for (const b of list) ext.set(b, this.getExtents(b));
        const stable = new Map();
        const reinf = new Map();
        const isR = (b) => { if (!reinf.has(b)) reinf.set(b, this._isReinforced(b, ext.get(b), true)); return reinf.get(b); };
        const partners = new Map();

        for (const c of this.cements) {
            if (!ext.has(c.a) || !ext.has(c.b)) continue;
            if (!partners.has(c.a)) partners.set(c.a, []);
            if (!partners.has(c.b)) partners.set(c.b, []);
            partners.get(c.a).push(c.b);
            partners.get(c.b).push(c.a);
        }

        const directPass = () => {
            let changed = true;
            while (changed) {
                changed = false;
                for (const b of list) {
                    if (stable.has(b)) continue;
                    const e = ext.get(b);
                    const bottom = b.position.y - e.h / 2;
                    if (bottom <= SUPPORT_EPS) { stable.set(b, 0); changed = true; continue; }
                    const hull = this._supportHull(b.position.x, b.position.z, e, bottom, list, ext, stable, b);
                    if (!hull) continue;
                    if (this._insideHull(b.position.x, b.position.z, hull, this._tol(b, isR(b)))) {
                        stable.set(b, hull.hops);
                        changed = true;
                    }
                }
            }
        };

        directPass();
        for (let guard = 0; guard < 16; guard++) {
            const add = [];
            for (const b of list) {
                if (stable.has(b)) continue;
                const ps = partners.get(b);
                if (!ps) continue;
                let best = Infinity;
                for (const p of ps) if (stable.has(p)) best = Math.min(best, stable.get(p));
                if (best < CEMENT_HOPS) add.push([b, best + 1]);
            }
            if (add.length === 0) break;
            for (const [b, h] of add) stable.set(b, h);
            directPass();
        }
        return stable;
    }

    predictStable(type, x, y, z, rx = 0, ry = 0, rz = 0) {
        const e = this.getOrientedExtents(type, rx, ry, rz);
        const bottom = y - e.h / 2;
        if (bottom <= SUPPORT_EPS) return true;
        const stable = this._computeStable();
        const list = this.boxes.filter(b => !b.userData.carried && !b.userData.isFalling);
        const ext = new Map();
        for (const b of list) ext.set(b, this.getExtents(b));

        const hull = this._supportHull(x, z, e, bottom, list, ext, stable, null);
        if (!hull) return false;

        let tol = COM_TOL;
        if (type !== 'beam') {
            const probe = { position: { x, y, z } };
            for (const o of list) {
                const oe = ext.get(o);
                const gap = this._gap(probe, e, o, oe);
                const near = gap <= NEAR_GAP || (o.userData.shapeType === 'pillar' && gap <= PILLAR_NEAR);
                const vOverlap = (e.h + oe.h) / 2 - Math.abs(y - o.position.y);
                if (near && vOverlap > 0.05) { tol = COM_TOL_REINFORCED; break; }
            }
        }
        return this._insideHull(x, z, hull, tol);
    }

    checkStability() {
        const stable = this._computeStable();
        const released = [];
        for (const b of this.boxes) {
            const ud = b.userData;
            if (ud.carried || ud.isFalling) continue;
            if (stable.has(b)) continue;
            this._startFalling(b);
            released.push(b);
        }
        for (const b of released) this._detachCements(b);
        return released;
    }

    _recomputeSupport() { return this.checkStability(); }
    _releaseAbove() { return this.checkStability(); }

    _restCheck(box, ext, level) {
        if (level <= SUPPORT_EPS) return { ok: true };
        const list = this.boxes.filter(b => b !== box && !b.userData.carried && !b.userData.isFalling);
        const hull = this._supportHull(box.position.x, box.position.z, ext, level, list, null, null, box);
        if (!hull) return { ok: true };
        const tol = this._tol(box, this._isReinforced(box, ext, true));
        if (this._insideHull(box.position.x, box.position.z, hull, tol)) return { ok: true };

        let dx = box.position.x - (hull.minX + hull.maxX) / 2;
        let dz = box.position.z - (hull.minZ + hull.maxZ) / 2;
        let len = Math.hypot(dx, dz);
        if (len < 1e-3) { const a = Math.random() * TWO_PI; dx = Math.cos(a); dz = Math.sin(a); len = 1; }
        return { ok: false, dx: dx / len, dz: dz / len };
    }

    // ═══════════════════════════════════════════════════════════
    // LAUNCH / FALL
    // ═══════════════════════════════════════════════════════════
    _beginFlight(box) {
        const ud = box.userData;
        if (!ud.isFalling) {
            ud.restRotX = box.rotation.x;
            ud.restRotZ = box.rotation.z;
            ud.flightT = 0;
            ud.hasImpacted = false;
        }
    }

    _startFalling(box) {
        this._beginFlight(box);
        const ud = box.userData;
        ud.velocityX = 0; ud.velocityY = 0; ud.velocityZ = 0;
        ud.angX = 0; ud.angY = 0; ud.angZ = 0;
        ud.grounded = false; ud.isStatic = false; ud.isSupported = false; ud.isFalling = true;
        if (!this._fallingBoxes.includes(box)) this._fallingBoxes.push(box);
    }

    _launch(box, vx, vy, vz) {
        const ud = box.userData;
        this._beginFlight(box);

        const hs = Math.hypot(vx, vz);
        if (hs > MAX_H_SPEED) { const k = MAX_H_SPEED / hs; vx *= k; vz *= k; }
        vy = Math.min(vy, MAX_V_SPEED);

        ud.velocityX = vx; ud.velocityY = vy; ud.velocityZ = vz;
        ud.grounded = false;

        const speed = Math.hypot(vx, vz);
        const spin = 3 + speed * 0.6;
        const nx = speed > 0.01 ? vx / speed : 0;
        const nz = speed > 0.01 ? vz / speed : 0;
        ud.angX = nz * spin * (0.6 + Math.random() * 0.5);
        ud.angZ = -nx * spin * (0.6 + Math.random() * 0.5);
        ud.angY = (Math.random() - 0.5) * spin * 0.4;

        ud.isStatic = false; ud.isSupported = false; ud.isFalling = true;
        if (!this._fallingBoxes.includes(box)) this._fallingBoxes.push(box);
    }

    // ═══════════════════════════════════════════════════════════
    // BLAST (AOE từ đạn ná) / KICK (AOE từ chân)
    // ═══════════════════════════════════════════════════════════
    blastBoxes(center, dir, power, radius) {
        const affected = [];
        if (!(radius > 0)) return affected;

        const nf = THREE.MathUtils.clamp(power / BLAST_POWER_REF, 0.15, 1.4);
        const blastDir = dir ? dir.clone() : new THREE.Vector3();
        blastDir.y = 0;
        const hasDir = blastDir.lengthSq() > 1e-4;
        if (hasDir) blastDir.normalize();

        for (const box of this.boxes.slice()) {
            if (box.userData.carried) continue;
            const dist = box.position.distanceTo(center);
            if (dist > radius) continue;

            const falloff = Math.max(0.2, 1 - dist / radius);
            const punch = nf * falloff;
            const type = box.userData.shapeType || 'box';
            const reinforced = this._isReinforced(box);

            const holdThresh = type === 'pillar' ? 0.45 : (reinforced ? 0.2 : 0);
            if (punch < holdThresh) continue;

            const push = new THREE.Vector3().subVectors(box.position, center);
            push.y = 0;
            if (push.lengthSq() < 1e-4) {
                if (hasDir) push.copy(blastDir);
                else { const a = Math.random() * TWO_PI; push.set(Math.cos(a), 0, Math.sin(a)); }
            }
            push.normalize();
            if (hasDir) push.addScaledVector(blastDir, 0.5).normalize();
            const jitter = (Math.random() - 0.5) * 0.3;
            const cj = Math.cos(jitter), sj = Math.sin(jitter);
            const px = push.x * cj - push.z * sj, pz = push.x * sj + push.z * cj;

            const mass = MASS[type] ?? 1;
            let resist = 1 / Math.pow(mass, 0.6);
            if (reinforced) resist *= 0.7;

            const h = (6 + 20 * nf) * falloff * resist;
            const v = ((4 + 9 * nf) * falloff + Math.random() * 2) * resist;

            this._detachCements(box);
            this._launch(box, px * h, v, pz * h);
            affected.push(box);
        }

        this.checkStability();
        return affected;
    }

    // ⭐ HÀM ĐÁ AOE (100% gia cố / 60% không gia cố)
    kickBox(box, direction, power = 1) {
        if (!box || !direction) return;

        const isReinforced = this._isReinforced(box);
        const forceMultiplier = isReinforced ? 1.0 : 0.6;
        const finalPower = power * forceMultiplier;

        let dx = direction.x, dz = direction.z;
        let len = Math.hypot(dx, dz);
        if (len < 1e-4) { const a = Math.random() * TWO_PI; dx = Math.cos(a); dz = Math.sin(a); len = 1; }
        dx /= len; dz /= len;

        const p = THREE.MathUtils.clamp(finalPower, 0.1, 3.0);

        this._detachCements(box);
        this._launch(box, dx * KICK_SPEED * p, KICK_UP * Math.min(p, 1.4), dz * KICK_SPEED * p);

        // AOE: Tạo vụ nổ lực xung quanh khối bị đá
        const blastRadius = 1.5 + p * 2.0;
        const blastPower = 60 * p;
        this.blastBoxes(box.position.clone(), direction, blastPower, blastRadius);

        this.checkStability();
        if (window.vfxSystem?.createDust) window.vfxSystem.createDust(box.position.clone());
    }

    // ═══════════════════════════════════════════════════════════
    // LOOKUP / UTILS
    // ═══════════════════════════════════════════════════════════
    getBoxById(id) { if (!id) return null; return this.boxes.find(b => b.userData.id === id) || null; }

    findNearestByColor(color, fromPos = null, excludeCarried = true) {
        const targetHex = BoxSystem.getColorFromName(color);
        const origin = fromPos || new THREE.Vector3(0, 0, 0);
        let best = null, bestDist = Infinity;
        for (const box of this.boxes) {
            if (excludeCarried && box.userData.carried) continue;
            if (box.userData.color !== targetHex) continue;
            const d = box.position.distanceToSquared(origin);
            if (d < bestDist) { bestDist = d; best = box; }
        }
        return best;
    }

    getAllBoxesInfo(limit = 10, nearPos = null) {
        let arr = this.boxes.slice();
        if (nearPos) arr.sort((a, b) => a.position.distanceToSquared(nearPos) - b.position.distanceToSquared(nearPos));
        return arr.slice(0, limit).map(box => ({
            id: box.userData.id, color: box.userData.colorName, colorHex: '#' + box.userData.color.toString(16).padStart(6, '0'),
            pos: [+box.position.x.toFixed(2), +box.position.y.toFixed(2), +box.position.z.toFixed(2)],
            carried: !!box.userData.carried,
        }));
    }

    // ═══════════════════════════════════════════════════════════
    // UPDATE LOOP
    // ═══════════════════════════════════════════════════════════
    update(dt) {
        if (this._fallingBoxes.length === 0) return;
        dt = Math.min(dt, 0.05);
        const steps = Math.max(1, Math.ceil(dt / SUBSTEP));
        const h = dt / steps;
        this._dirty = false;

        for (let s = 0; s < steps; s++) {
            for (let i = this._fallingBoxes.length - 1; i >= 0; i--) {
                const box = this._fallingBoxes[i];
                const ud = box.userData;
                if (ud.carried) {
                    ud.isFalling = false;
                    this._fallingBoxes.splice(i, 1);
                    continue;
                }
                if (this._stepBox(box, h)) {
                    ud.isFalling = false;
                    const idx = this._fallingBoxes.indexOf(box);
                    if (idx >= 0) this._fallingBoxes.splice(idx, 1);
                }
            }
            if (this._fallingBoxes.length === 0) break;
        }

        if (this._dirty) { this._dirty = false; this.checkStability(); }
        this._updateCementLines();
    }

    _horizontalCollide(box, ud, ext) {
        if (Math.abs(ud.velocityX) + Math.abs(ud.velocityZ) < 0.5) return;
        const bBot = box.position.y - ext.h / 2, bTop = box.position.y + ext.h / 2;
        for (const o of this.boxes) {
            if (o === box || o.userData.carried || o.userData.isFalling) continue;
            const oe = this.getExtents(o);
            const oBot = o.position.y - oe.h / 2, oTop = o.position.y + oe.h / 2;
            if (bBot >= oTop - 0.05 || bTop <= oBot + 0.05) continue;

            const dx = box.position.x - o.position.x;
            const dz = box.position.z - o.position.z;
            const px = (ext.w + oe.w) / 2 - Math.abs(dx);
            const pz = (ext.d + oe.d) / 2 - Math.abs(dz);
            if (px <= 0 || pz <= 0) continue;

            if (px < pz) {
                const nx = dx >= 0 ? 1 : -1;
                box.position.x += nx * px;
                const vN = -ud.velocityX * nx;
                if (vN > 0) { ud.velocityX = -ud.velocityX * 0.3; this._transferImpact(o, -nx, 0, vN); }
            } else {
                const nz = dz >= 0 ? 1 : -1;
                box.position.z += nz * pz;
                const vN = -ud.velocityZ * nz;
                if (vN > 0) { ud.velocityZ = -ud.velocityZ * 0.3; this._transferImpact(o, 0, -nz, vN); }
            }
        }
    }

    _transferImpact(o, dirX, dirZ, speed) {
        if (speed < 3.5) return;
        const type = o.userData.shapeType || 'box';
        if (type === 'pillar' || this._isReinforced(o)) return;
        const mass = MASS[type] ?? 1;
        const s = speed * 0.55 / Math.pow(mass, 0.6);
        this._detachCements(o);
        this._launch(o, dirX * s, 1.5 + speed * 0.12, dirZ * s);
        this._dirty = true;
    }

    _stepBox(box, dt) {
        const ud = box.userData;
        const base = this.getShapeDims(ud.shapeType || 'box');
        ud.flightT = (ud.flightT || 0) + dt;

        if (!ud.grounded) {
            box.rotation.x += (ud.angX || 0) * dt;
            box.rotation.y += (ud.angY || 0) * dt;
            box.rotation.z += (ud.angZ || 0) * dt;
        }

        let ext = orientedExtents(base, box.rotation.x, box.rotation.y, box.rotation.z);
        let half = ext.h / 2;

        const damp = Math.exp(-(ud.grounded ? GROUND_FRICTION : AIR_DRAG) * dt);
        box.position.x += ud.velocityX * dt;
        box.position.z += ud.velocityZ * dt;
        ud.velocityX *= damp;
        ud.velocityZ *= damp;

        if (Math.abs(box.position.x) > FLOOR_LIMIT) { box.position.x = Math.sign(box.position.x) * FLOOR_LIMIT; ud.velocityX *= -0.4; }
        if (Math.abs(box.position.z) > FLOOR_LIMIT) { box.position.z = Math.sign(box.position.z) * FLOOR_LIMIT; ud.velocityZ *= -0.4; }

        this._horizontalCollide(box, ud, ext);

        const prevBottom = box.position.y - half;
        ud.velocityY += GRAVITY * dt;
        box.position.y += ud.velocityY * dt;

        const level = this._supportLevel(box, ext, prevBottom);
        let contact = false;

        if (ud.velocityY <= 0 && box.position.y - half <= level) {
            contact = true;
            box.position.y = level + half;
            const impact = Math.abs(ud.velocityY);

            if (!ud.hasImpacted) {
                ud.hasImpacted = true;
                if (this._onLand) this._onLand(box, impact);
                if (impact > 4 && window.vfxSystem?.createDust) window.vfxSystem.createDust(box.position.clone());
            }

            if (impact > MIN_BOUNCE) {
                ud.velocityY = impact * BOUNCE_FACTOR;
                ud.velocityX *= 0.75;
                ud.velocityZ *= 0.75;
                ud.angX *= 0.5; ud.angY *= 0.5; ud.angZ *= 0.5;
                ud.squash = true;
                box.scale.set(1.12, 0.88, 1.12);
                ud.grounded = false;
            } else {
                ud.velocityY = 0;
                ud.grounded = true;
            }
        }
        if (!contact) ud.grounded = false;

        if (ud.squash) {
            const k = Math.min(dt * 12, 1);
            box.scale.x = THREE.MathUtils.lerp(box.scale.x, 1, k);
            box.scale.y = THREE.MathUtils.lerp(box.scale.y, 1, k);
            box.scale.z = THREE.MathUtils.lerp(box.scale.z, 1, k);
            if (Math.abs(box.scale.x - 1) < 0.002 && Math.abs(box.scale.y - 1) < 0.002) {
                box.scale.set(1, 1, 1);
                ud.squash = false;
            }
        }

        if (ud.grounded) {
            ud.angX = 0; ud.angY = 0; ud.angZ = 0;
            const k = 1 - Math.exp(-12 * dt);
            const tx = nearestRot(box.rotation.x, ud.restRotX ?? 0);
            const tz = nearestRot(box.rotation.z, ud.restRotZ ?? 0);
            box.rotation.x += (tx - box.rotation.x) * k;
            box.rotation.z += (tz - box.rotation.z) * k;

            ext = orientedExtents(base, box.rotation.x, box.rotation.y, box.rotation.z);
            half = ext.h / 2;
            box.position.y = level + half;

            const speed = Math.hypot(ud.velocityX, ud.velocityZ);
            const rd = Math.abs(tx - box.rotation.x) + Math.abs(tz - box.rotation.z);
            if (speed < 0.15 && rd < 0.02) {
                box.rotation.x = tx;
                box.rotation.z = tz;
                const chk = this._restCheck(box, ext, level);
                if (!chk.ok) {
                    ud.grounded = false;
                    ud.velocityX += chk.dx * SLIDE_OFF_SPEED;
                    ud.velocityZ += chk.dz * SLIDE_OFF_SPEED;
                    ud.velocityY = 1.5;
                    ud.angX = chk.dz * 2.5; ud.angZ = -chk.dx * 2.5;
                    return false;
                }
                return this._finishBox(box, level);
            }
        }

        if (ud.flightT > MAX_FLIGHT_TIME || box.position.y < -10) {
            box.rotation.x = ud.restRotX ?? 0;
            box.rotation.z = ud.restRotZ ?? 0;
            return this._finishBox(box, 0);
        }

        return false;
    }

    _finishBox(box, level) {
        const ud = box.userData;
        const base = this.getShapeDims(ud.shapeType || 'box');
        const half = orientedExtents(base, box.rotation.x, box.rotation.y, box.rotation.z).h / 2;
        box.position.y = level + half;
        ud.velocityX = 0; ud.velocityY = 0; ud.velocityZ = 0;
        ud.angX = 0; ud.angY = 0; ud.angZ = 0;
        ud.grounded = false;
        ud.squash = false;
        box.scale.set(1, 1, 1);
        return true;
    }

    // ═══════════════════════════════════════════════════════════
    // PICKING / HIGHLIGHT / REMOVE
    // ═══════════════════════════════════════════════════════════
    _resolveRoot(obj) {
        let cur = obj;
        while (cur && !this.boxes.includes(cur)) cur = cur.parent;
        return cur || null;
    }

    findBoxUnderCursor(ndc) {
        if (this.boxes.length === 0) return null;
        this._raycaster.setFromCamera(ndc, this.camera);
        const hits = this._raycaster.intersectObjects(this.boxes, true);
        for (const h of hits) {
            const root = this._resolveRoot(h.object);
            if (root) return root;
        }
        return null;
    }

    findFloorPoint(ndc) {
        this._raycaster.setFromCamera(ndc, this.camera);
        const hits = this._raycaster.intersectObject(this.floorMesh);
        return hits.length > 0 ? hits[0].point : null;
    }

    highlight(box, enable = true) {
        if (!box || box.userData.carried) return;
        if (enable) {
            box.traverse(c => {
                if (!c.isMesh || c.userData._hlOrig || c.userData.proxy) return;
                c.userData._hlOrig = c.material;
                const m = c.material.clone();
                if (m.emissive && m.emissive.getHex() === 0 && m.color) m.emissive.copy(m.color);
                m.emissiveIntensity = 0.8;
                c.material = m;
            });
        } else {
            box.traverse(c => {
                if (!c.isMesh || !c.userData._hlOrig) return;
                const clone = c.material;
                c.material = c.userData._hlOrig;
                delete c.userData._hlOrig;
                if (clone !== c.material) clone.dispose();
            });
        }
    }

    _disposeBox(box) { this.highlight(box, false); }

    removeBox(box) {
        const idx = this.boxes.indexOf(box);
        if (idx >= 0) this.boxes.splice(idx, 1);
        const fix = this._fallingBoxes.indexOf(box);
        if (fix >= 0) this._fallingBoxes.splice(fix, 1);
        this.scene.remove(box);
        this._disposeBox(box);
        this.cements = this.cements.filter(c => c.a !== box && c.b !== box);
        this._updateCementLines();
        this.checkStability();
        if (this._onBoxChange) this._onBoxChange(this.boxes.length);
        if (this._onBoxRemove) this._onBoxRemove(box, {});
    }

    clearAll() {
        for (const box of this.boxes) {
            this.scene.remove(box);
            this._disposeBox(box);
        }
        this.boxes = [];
        this._fallingBoxes = [];
        this.cements = [];
        if (this._cementLinesGroup) {
            for (const child of this._cementLinesGroup.children) child.geometry?.dispose();
            this._cementLinesGroup.clear();
        }
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
        for (const tex of this._texCache.values()) tex.dispose();
        this._texCache.clear();
        for (const g of this._geoCache.values()) g.dispose();
        this._geoCache.clear();
        this._proxyMat.dispose();
        if (this._cementLinesGroup) this.scene.remove(this._cementLinesGroup);
    }
}
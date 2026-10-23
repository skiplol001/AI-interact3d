// ═══════════════════════════════════════════════════════════════
// build-mode.js — v28 (House Manager cooldown block)
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'https://esm.sh/three@0.160.0';
import { SHAPE_CATALOG, CATEGORIES, getShapesByCategory } from './shapes.js?v=7';

const BOX_SIZE = 0.4;
const DOOR_HEIGHT = 1.2;
const PILLAR_HEIGHT = 1.2;
const PILLAR_RADIUS = 0.2;
const GRID_STEP = 0.4;
const MIN_HEIGHT = 0;
const MAX_HEIGHT = 8.0;
const PLACE_COOLDOWN = 150;

const PALETTE = [
    { name: 'Vàng', hex: 0xf59e0b },
    { name: 'Xanh lá', hex: 0x10b981 },
    { name: 'Xanh dương', hex: 0x3b82f6 },
    { name: 'Đỏ', hex: 0xef4444 },
    { name: 'Tím', hex: 0x8b5cf6 },
    { name: 'Hồng', hex: 0xec4899 },
];

const GHOST_COLORS = { pillar: 0xd9d2c5, beam: 0x9a6b3a };

const ROLE_HINT = {
    pillar: '🏛️ <b>Cột tròn đá</b> · đứng một mình được · chịu tải đứng (×10) · đặt khối lên đầu cột',
    beam: '📏 <b>Dầm gỗ</b> · phải gác <b>2 đầu</b> lên cột/khối · trỏ chuột sang bên để chọn hướng dầm vươn ra · bắc sàn/mái',
};

// ═══════════════════════════════════════════════════════════════
// ⭐ HELPER: Kiểm tra cooldown từ houseManager
// ═══════════════════════════════════════════════════════════════
function _checkBuildCooldown() {
    if (!window.houseManager) return { ok: true };
    try {
        const check = window.houseManager.canBuild();
        if (!check.ok) {
            const mode = window.__currentChatMode || 'normal';
            const sec = Math.ceil(check.remainingMs / 1000);

            const msg = mode === 'gentle'
                ? `Ơ... mình không muốn bạn xây dựng lúc này... thử lại sau ${sec}s nữa nha 🥺`
                : (mode === 'savage'
                    ? `Đm, bà đéo cho mày xây lúc này! Đợi ${sec}s nữa đi con! 🤬`
                    : `Tao đéo cho mày xây lúc này. Đợi ${sec}s nữa đi 😤`);

            const kind = mode === 'savage' ? 'angry' : (mode === 'gentle' ? 'sad' : 'unclear');

            try {
                if (window.showPopup) window.showPopup(msg, kind);
                else if (window.showCharacterMessage) window.showCharacterMessage(msg, kind);
            } catch { }

            return { ok: false, remainingMs: check.remainingMs };
        }
    } catch (e) {
        console.warn('[Build] Cooldown check error:', e);
    }
    return { ok: true };
}

function createBuildUI() {
    if (document.getElementById('build-ui')) return document.getElementById('build-ui');
    const el = document.createElement('div');
    el.id = 'build-ui';
    el.style.cssText = `
        position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
        background: rgba(15, 23, 42, 0.96); border: 2px solid #f59e0b;
        border-radius: 12px; padding: 10px 16px; z-index: 9999;
        display: none; flex-direction: column; gap: 10px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.7); font-family: 'Segoe UI', sans-serif;
        min-width: 760px; max-width: 92vw; align-items: center;
    `;
    el.innerHTML = `
        <div style="display: flex; gap: 20px; align-items: center; width: 100%; justify-content: space-between; flex-wrap: wrap;">
            <div style="display: flex; gap: 6px; background: #1e293b; padding: 4px; border-radius: 8px;">
                <button id="build-btn-place" data-mode="place" style="padding: 8px 12px; background: #10b981; border: none; border-radius: 6px; color: #fff; font-size: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                    🧱 ĐẶT <span style="font-size: 10px; opacity: 0.8; background: rgba(0,0,0,0.3); padding: 2px 4px; border-radius: 4px;">1</span>
                </button>
                <button id="build-btn-break" data-mode="break" style="padding: 8px 12px; background: transparent; border: none; border-radius: 6px; color: #94a3b8; font-size: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                    ⛏️ XOÁ <span style="font-size: 10px; opacity: 0.8; background: rgba(255,255,255,0.1); padding: 2px 4px; border-radius: 4px;">2</span>
                </button>
                <button id="build-btn-cement" data-mode="cement" style="padding: 8px 12px; background: transparent; border: none; border-radius: 6px; color: #94a3b8; font-size: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                    🧱 XOÁ XI MĂNG <span style="font-size: 10px; opacity: 0.8; background: rgba(255,255,255,0.1); padding: 2px 4px; border-radius: 4px;">3</span>
                </button>
            </div>
            <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
                <button id="build-rotate" style="padding: 6px 10px; background: transparent; border: 1px solid #475569; border-radius: 6px; color: #cbd5e1; font-size: 11px; font-weight: 600; cursor: pointer;" title="Xoay quanh trục Y (R)">🔄 R</button>
                <button id="build-tilt-x" style="padding: 6px 10px; background: transparent; border: 1px solid #475569; border-radius: 6px; color: #cbd5e1; font-size: 11px; font-weight: 600; cursor: pointer;" title="Nghiêng dọc trước/sau (Shift+T) — chỉ cột/dầm">↕️ Shift+T</button>
                <button id="build-tilt-z" style="padding: 6px 10px; background: transparent; border: 1px solid #475569; border-radius: 6px; color: #cbd5e1; font-size: 11px; font-weight: 600; cursor: pointer;" title="Nghiêng ngang trái/phải (T) — chỉ cột/dầm">↔️ T</button>
                <div id="build-palette" style="display: flex; gap: 5px;">
                    ${PALETTE.map(p => `<button data-color="${p.hex}" title="${p.name}" style="width: 24px; height: 24px; border-radius: 5px; border: 2px solid transparent; background: #${p.hex.toString(16).padStart(6, '0')}; cursor: pointer;"></button>`).join('')}
                </div>
            </div>
        </div>
        <div id="build-shapes-panel" style="width: 100%; display: none; flex-direction: column; gap: 6px; padding-top: 6px; border-top: 1px solid #334155;">
            <div id="build-category-tabs" style="display: flex; gap: 4px;"></div>
            <div id="build-shapes-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); gap: 4px; max-height: 100px; overflow-y: auto;"></div>
        </div>
        <div id="build-slider-row" style="display: flex; align-items: center; gap: 10px; width: 100%; padding-top: 6px; border-top: 1px solid #334155;">
            <span style="font-size: 11px; color: #cbd5e1; min-width: 60px; font-weight: 600;">📏 Cao độ:</span>
            <input type="range" id="build-height-slider" min="0" max="8" step="0.4" value="0" style="flex: 1; accent-color: #f59e0b; cursor: pointer; height: 6px;">
            <span id="build-height-val" style="font-size: 11px; color: #f59e0b; font-weight: 700; min-width: 50px; text-align: right;">Auto</span>
            <button id="build-height-reset" style="padding: 4px 8px; background: transparent; border: 1px solid #475569; border-radius: 4px; color: #94a3b8; font-size: 10px; font-weight: 600; cursor: pointer;">🔄 Auto</button>
        </div>
        <div style="display: flex; gap: 12px; align-items: center; width: 100%; justify-content: space-between; padding-top: 6px; border-top: 1px solid #334155;">
            <div style="font-size: 10px; color: #94a3b8;" id="build-hint-text"><b>Giữ Alt</b> để đặt xuống đất · Tự động dính xi măng</div>
            <div style="display: flex; gap: 8px; align-items: center;">
                <span style="font-size: 11px; color: #64748b;">Box: <b id="build-count" style="color: #38bdf8;">0</b></span>
                <button id="build-clear" style="padding: 5px 10px; background: transparent; border: 1px solid #ef4444; border-radius: 5px; color: #ef4444; font-size: 11px; font-weight: 600; cursor: pointer;">🗑 Xoá hết</button>
                <button id="build-exit" style="padding: 5px 10px; background: transparent; border: 1px solid #475569; border-radius: 5px; color: #94a3b8; font-size: 11px; font-weight: 600; cursor: pointer;">✕ Thoát</button>
            </div>
        </div>
    `;
    document.body.appendChild(el);
    return el;
}

export class BuildController {
    constructor(scene, camera, canvas, boxSystem, options = {}) {
        this.scene = scene;
        this.camera = camera;
        this.canvas = canvas;
        this.boxSystem = boxSystem;
        this.isActive = false;
        this.mode = 'place';
        this.color = PALETTE[0].hex;
        this.manualHeight = null;
        this.rotationY = 0;
        this.rotationX = 0;
        this.rotationZ = 0;
        this.currentShapeKey = 'box';
        this.currentCategory = 'basic';
        this.doorFlip = false;

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this._floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

        this._ghost = null;
        this._ghostValid = true;
        this._lastPosition = null;
        this._breakOutline = null;
        this._lastPlaceTime = 0;

        this._cementTarget = null;
        this._cementNeighbors = [];
        this._isAltDown = false;

        this.onBoxPlaced = options.onBoxPlaced || null;
        this.onBoxRemoved = options.onBoxRemoved || null;

        this.toolbar = createBuildUI();
        this._sliderEl = this.toolbar.querySelector('#build-height-slider');
        this._sliderValEl = this.toolbar.querySelector('#build-height-val');
        this._sliderRow = this.toolbar.querySelector('#build-slider-row');
        this._hintText = this.toolbar.querySelector('#build-hint-text');
        this._shapesPanel = this.toolbar.querySelector('#build-shapes-panel');
        this._categoryTabs = this.toolbar.querySelector('#build-category-tabs');
        this._shapesGrid = this.toolbar.querySelector('#build-shapes-grid');

        this._buildCategoryTabs();
        this._buildShapesGrid();
        this._bindUI();

        this._onPointerMove = this._onPointerMove.bind(this);
        this._onPointerDown = this._onPointerDown.bind(this);
        this._onKeyDown = this._onKeyDown.bind(this);
        this._onKeyUp = this._onKeyUp.bind(this);

        console.log('[Build] Ready (v28 — House cooldown block)');
    }

    _shapeType() { return SHAPE_CATALOG[this.currentShapeKey]?.type || 'box'; }
    _canTilt() { const t = this._shapeType(); return t === 'pillar' || t === 'beam'; }
    _effRot() {
        const tilt = this._canTilt();
        return { x: tilt ? this.rotationX : 0, y: this.rotationY, z: tilt ? this.rotationZ : 0 };
    }
    _currentExtents() {
        const r = this._effRot();
        return this.boxSystem.getOrientedExtents(this._shapeType(), r.x, r.y, r.z);
    }
    _getCurrentShapeHeight() { return this._currentExtents().h; }
    _ghostBaseColor() { return GHOST_COLORS[this._shapeType()] ?? this.color; }

    _buildCategoryTabs() {
        this._categoryTabs.innerHTML = '';
        Object.entries(CATEGORIES).forEach(([key, cat]) => {
            const btn = document.createElement('button');
            btn.style.cssText = `padding: 4px 10px; background: ${key === this.currentCategory ? '#334155' : 'transparent'}; border: 1px solid ${key === this.currentCategory ? '#38bdf8' : '#475569'}; border-radius: 4px; color: ${key === this.currentCategory ? '#38bdf8' : '#94a3b8'}; font-size: 11px; font-weight: 600; cursor: pointer;`;
            btn.textContent = `${cat.icon} ${cat.label}`;
            btn.onclick = () => { this.currentCategory = key; this._buildCategoryTabs(); this._buildShapesGrid(); };
            this._categoryTabs.appendChild(btn);
        });
    }

    _buildShapesGrid() {
        this._shapesGrid.innerHTML = '';
        const shapes = getShapesByCategory(this.currentCategory);
        shapes.forEach(shape => {
            const btn = document.createElement('button');
            const active = shape.key === this.currentShapeKey;
            btn.style.cssText = `padding: 6px 4px; background: ${active ? 'rgba(56,189,248,0.2)' : 'rgba(30,41,59,0.6)'}; border: 1px solid ${active ? '#38bdf8' : '#475569'}; border-radius: 5px; color: ${active ? '#38bdf8' : '#cbd5e1'}; font-size: 10px; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 2px; min-height: 50px;`;
            btn.innerHTML = `<span style="font-size: 16px;">${shape.icon}</span><span style="font-size: 9px; text-align: center; line-height: 1.1;">${shape.label}</span>`;
            btn.title = shape.hint || shape.label;
            btn.onclick = () => {
                this.currentShapeKey = shape.key;
                this.doorFlip = false;
                this._buildShapesGrid();
                this._refreshGhost();
                this._updateHint();
                this._syncSlider();
                this._updateGhost();
            };
            this._shapesGrid.appendChild(btn);
        });
    }

    _disposeGhost() {
        if (!this._ghost) return;
        this.scene.remove(this._ghost);
        this._ghost.traverse(c => {
            if (c.geometry) c.geometry.dispose?.();
            if (c.material) {
                if (Array.isArray(c.material)) c.material.forEach(m => m.dispose?.());
                else c.material.dispose?.();
            }
        });
        this._ghost = null;
    }

    _refreshGhost() {
        this._disposeGhost();
        const shape = SHAPE_CATALOG[this.currentShapeKey];
        if (!shape) return;
        const type = shape.type;
        const d = this.boxSystem.getShapeDims(type);

        let geo;
        if (type === 'pillar') geo = new THREE.CylinderGeometry(0.2, 0.2, d.h, 24);
        else if (type === 'door' || type === 'window') geo = new THREE.BoxGeometry(d.w, d.h, 0.08);
        else geo = new THREE.BoxGeometry(d.w, d.h, d.d);

        const ghost = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: this._ghostBaseColor(), transparent: true, opacity: 0.4, depthWrite: false }));
        ghost.rotation.order = 'YXZ';
        ghost.raycast = () => { };
        ghost.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 })));

        if (type === 'door' && this.doorFlip) ghost.scale.x = -1;

        ghost.visible = false;
        ghost.renderOrder = 999;
        this._ghost = ghost;
        this.scene.add(ghost);
    }

    _createBreakOutline() {
        if (this._breakOutline) return;
        const geo = new THREE.BoxGeometry(1, 1, 1);
        this._breakOutline = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.3, depthWrite: false }));
        this._breakOutline.raycast = () => { };
        this._breakOutline.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0xef4444 })));
        this._breakOutline.visible = false;
        this._breakOutline.renderOrder = 1000;
        this.scene.add(this._breakOutline);
    }

    _setOutlineColor(hex) {
        if (!this._breakOutline) return;
        if (this._breakOutline.material) this._breakOutline.material.color.setHex(hex);
        if (this._breakOutline.children[0]?.material) this._breakOutline.children[0].material.color.setHex(hex);
    }

    _clearCementHighlights() {
        if (this._cementTarget) {
            this.boxSystem.highlight(this._cementTarget, false);
            this._cementTarget = null;
        }
        this._cementNeighbors.forEach(n => this.boxSystem.highlight(n, false));
        this._cementNeighbors = [];
    }

    _syncCementVisibility() {
        if (this.boxSystem.setCementVisible) this.boxSystem.setCementVisible(this.isActive && this.mode === 'cement');
    }

    // ⭐ MODIFIED: check cooldown trước khi bật
    setEnabled(enabled) {
        if (enabled === this.isActive) return;

        // ⭐ Chặn bật nếu houseManager đang cooldown
        if (enabled) {
            const check = _checkBuildCooldown();
            if (!check.ok) {
                console.log(`[Build] Blocked by houseManager cooldown (${Math.ceil(check.remainingMs / 1000)}s remaining)`);
                return;
            }
        }

        this.isActive = enabled;
        this.toolbar.style.display = enabled ? 'flex' : 'none';
        if (enabled) {
            this._refreshGhost();
            this._createBreakOutline();
            this.canvas.addEventListener('pointermove', this._onPointerMove);
            this.canvas.addEventListener('pointerdown', this._onPointerDown);
            window.addEventListener('keydown', this._onKeyDown);
            window.addEventListener('keyup', this._onKeyUp);
            this.canvas.style.cursor = this.mode === 'place' ? 'crosshair' : 'pointer';
            this.manualHeight = null;
            this.rotationY = 0;
            this.rotationX = 0;
            this.rotationZ = 0;
            this.doorFlip = false;
            this._syncSlider();
            this._refreshUI();
            this._updateInfo();
            this._updateHint();
        } else {
            if (this._ghost) this._ghost.visible = false;
            if (this._breakOutline) this._breakOutline.visible = false;
            this._clearCementHighlights();
            this.canvas.removeEventListener('pointermove', this._onPointerMove);
            this.canvas.removeEventListener('pointerdown', this._onPointerDown);
            window.removeEventListener('keydown', this._onKeyDown);
            window.removeEventListener('keyup', this._onKeyUp);
            this.canvas.style.cursor = '';
        }
        this._syncCementVisibility();
    }

    setMode(mode) {
        if (mode === this.mode) return;
        this._clearCementHighlights();
        this.mode = mode;
        this._refreshUI();
        if (this._breakOutline && mode !== 'break' && mode !== 'cement') this._breakOutline.visible = false;
        if (this._ghost && mode !== 'place') this._ghost.visible = false;
        this.canvas.style.cursor = mode === 'place' ? 'crosshair' : 'pointer';
        this._syncCementVisibility();
        this._updateHint();
    }

    _updateHint() {
        if (!this._hintText) return;
        if (this.mode === 'cement') {
            this._hintText.innerHTML = '🧱 <b style="color:#38bdf8;">Click vào một khối</b> để xóa xi măng kết nối xung quanh (đường vàng chỉ hiện ở chế độ này).';
        } else if (this.mode === 'place') {
            const type = this._shapeType();
            const shape = SHAPE_CATALOG[this.currentShapeKey];
            const rotY = Math.round(this.rotationY * 180 / Math.PI);
            const rotX = Math.round(this.rotationX * 180 / Math.PI);
            const rotZ = Math.round(this.rotationZ * 180 / Math.PI);
            let tiltInfo = '';
            if (this._canTilt() && (rotX !== 0 || rotZ !== 0)) tiltInfo = ` · Nghiêng X=${rotX}° Z=${rotZ}°`;
            const role = ROLE_HINT[type];
            let extraHint = '';
            if (type === 'door') extraHint = ` · <b style="color:#38bdf8">F</b> Lật cửa`;
            this._hintText.innerHTML = `${role || `${shape?.icon || '🧱'} <b>${shape?.label || ''}</b>`} · R=${rotY}°${tiltInfo}${extraHint} · <b style="color:#fbbf24">Giữ ALT</b> để đặt xuống đất`;
        } else {
            this._hintText.innerHTML = 'Trái: Xoá · 1/2/3: Mode · ESC: Thoát';
        }
    }

    setColor(hex) {
        this.color = hex;
        this._refreshPalette();
        if (this._ghost?.material) this._ghost.material.color.setHex(this._ghostValid ? this._ghostBaseColor() : 0xef4444);
    }

    _rotate() {
        this.rotationY = (this.rotationY + Math.PI / 4) % (Math.PI * 2);
        this._applyGhostRotation(); this._updateHint(); this._updateGhost();
    }
    _tiltX() {
        if (!this._canTilt()) return;
        this.rotationX = (this.rotationX + Math.PI / 4) % (Math.PI * 2);
        this._applyGhostRotation(); this._updateHint(); this._syncSlider(); this._updateGhost();
    }
    _tiltZ() {
        if (!this._canTilt()) return;
        this.rotationZ = (this.rotationZ + Math.PI / 4) % (Math.PI * 2);
        this._applyGhostRotation(); this._updateHint(); this._syncSlider(); this._updateGhost();
    }

    _applyGhostRotation() {
        const wrap = v => (Math.abs(v - Math.PI * 2) < 0.01 ? 0 : v);
        this.rotationY = wrap(this.rotationY);
        this.rotationX = wrap(this.rotationX);
        this.rotationZ = wrap(this.rotationZ);
        if (!this._ghost) return;
        const r = this._effRot();
        this._ghost.rotation.set(r.x, r.y, r.z, 'YXZ');
    }

    _updateMouse(e) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }

    _snapToGrid(v) { return Math.round(v / GRID_STEP) * GRID_STEP; }

    _resolveRootBox(obj) {
        let cur = obj;
        while (cur && cur.parent && !this.boxSystem.boxes.includes(cur)) cur = cur.parent;
        return this.boxSystem.boxes.includes(cur) ? cur : null;
    }

    _computeTargetPosition() {
        if (!this.isActive) return null;
        this.raycaster.setFromCamera(this.mouse, this.camera);

        const type = this._shapeType();
        const r = this._effRot();
        const ext = this._currentExtents();
        let tx = 0, ty = 0, tz = 0, found = false, snap = true;

        if (!this._isAltDown) {
            const hits = this.raycaster.intersectObjects(this.boxSystem.boxes, true);
            for (const hit of hits) {
                const hb = this._resolveRootBox(hit.object);
                if (!hb || hb.userData.carried) continue;

                const he = this.boxSystem.getExtents(hb);

                if (hb.userData.shapeType === 'pillar' || hb.userData.shapeType === 'beam') {
                    tx = hb.position.x;
                    tz = hb.position.z;
                    ty = hb.position.y + he.h / 2 + ext.h / 2;
                    found = true;
                    break;
                }

                const n = hit.face
                    ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
                    : new THREE.Vector3(0, 1, 0);
                const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
                const big = he.w > 0.7 || he.d > 0.7;
                const cx = big ? hit.point.x : hb.position.x;
                const cz = big ? hit.point.z : hb.position.z;
                const bottom = hb.position.y - he.h / 2;
                const top = hb.position.y + he.h / 2;

                if (ay >= ax && ay >= az) {
                    if (n.y > 0) {
                        if (type === 'beam') {
                            const axis = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(r.x, r.y, r.z, 'YXZ'));
                            const hl = Math.hypot(axis.x, axis.z);
                            if (hl > 0.05) {
                                const dx = axis.x / hl, dz = axis.z / hl;
                                const half = hl * this.boxSystem.getShapeDims('beam').w / 2;
                                const side = ((hit.point.x - cx) * dx + (hit.point.z - cz) * dz) >= 0 ? 1 : -1;
                                tx = cx + dx * side * half;
                                tz = cz + dz * side * half;
                                snap = false;
                            } else { tx = cx; tz = cz; }
                        } else { tx = cx; tz = cz; }
                        ty = top + ext.h / 2;
                    } else {
                        tx = cx; tz = cz; ty = bottom - ext.h / 2;
                    }
                } else if (ax > az) {
                    tx = hb.position.x + Math.sign(n.x) * (he.w / 2 + ext.w / 2);
                    tz = cz; ty = bottom + ext.h / 2;
                } else {
                    tx = cx; tz = hb.position.z + Math.sign(n.z) * (he.d / 2 + ext.d / 2);
                    ty = bottom + ext.h / 2;
                }
                found = true;
                break;
            }
        }

        if (!found) {
            const pt = new THREE.Vector3();
            if (!this.raycaster.ray.intersectPlane(this._floorPlane, pt)) return null;
            tx = pt.x; tz = pt.z; ty = ext.h / 2;
        }

        const fx = snap ? this._snapToGrid(tx) : tx;
        const fz = snap ? this._snapToGrid(tz) : tz;
        let fy = ty;
        if (this.manualHeight !== null) fy = this._snapToGrid(this.manualHeight) + ext.h / 2;
        return { x: fx, y: fy, z: fz };
    }

    _isPositionValid(x, y, z) {
        const ne = this._currentExtents();
        if (y - ne.h / 2 < -0.05 || y + ne.h / 2 > MAX_HEIGHT + 0.5) return false;
        for (const b of this.boxSystem.boxes) {
            if (b.userData.carried) continue;
            const be = this.boxSystem.getExtents(b);
            const ox = (be.w + ne.w) / 2 - Math.abs(b.position.x - x);
            const oy = (be.h + ne.h) / 2 - Math.abs(b.position.y - y);
            const oz = (be.d + ne.d) / 2 - Math.abs(b.position.z - z);
            if (ox > 0.05 && oy > 0.05 && oz > 0.05) return false;
        }
        return true;
    }

    _updateGhost() {
        if (!this.isActive || this.mode !== 'place' || !this._ghost) return;
        if (this._breakOutline) this._breakOutline.visible = false;
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const target = this._computeTargetPosition();
        if (!target) { this._ghost.visible = false; return; }
        this._ghost.visible = true;
        this._ghost.position.set(target.x, target.y, target.z);
        this._applyGhostRotation();
        this._ghostValid = this._isPositionValid(target.x, target.y, target.z);
        if (this._ghost.material) this._ghost.material.color.setHex(this._ghostValid ? this._ghostBaseColor() : 0xef4444);
        this._lastPosition = target;
        this.canvas.style.cursor = this._ghostValid ? 'crosshair' : 'not-allowed';
    }

    _onPointerMove(e) {
        if (!this.isActive) return;
        this._updateMouse(e);
        this.raycaster.setFromCamera(this.mouse, this.camera);

        if (this.mode === 'cement') {
            if (this._ghost) this._ghost.visible = false;
            const hits = this.raycaster.intersectObjects(this.boxSystem.boxes, true);
            const hoverBox = hits.length > 0 ? this._resolveRootBox(hits[0].object) : null;

            if (hoverBox && !hoverBox.userData.carried) {
                if (this._cementTarget !== hoverBox) {
                    this._clearCementHighlights();
                    this._cementTarget = hoverBox;
                    this._cementNeighbors = this.boxSystem.boxes.filter(b => {
                        if (b === hoverBox || b.userData.carried) return false;
                        return this.boxSystem.cements.some(c => (c.a === hoverBox && c.b === b) || (c.b === hoverBox && c.a === b));
                    });
                    this.boxSystem.highlight(this._cementTarget, true);
                    this._cementNeighbors.forEach(n => this.boxSystem.highlight(n, true));
                }
                this.canvas.style.cursor = 'pointer';
            } else {
                this._clearCementHighlights();
                this.canvas.style.cursor = 'not-allowed';
            }
            return;
        }

        if (this.mode === 'break') {
            if (this._ghost) this._ghost.visible = false;
            const hits = this.raycaster.intersectObjects(this.boxSystem.boxes, true);
            const hoverBox = hits.length > 0 ? this._resolveRootBox(hits[0].object) : null;
            const validHover = hoverBox && !hoverBox.userData.carried;
            if (this._breakOutline) {
                if (validHover) {
                    const he = this.boxSystem.getExtents(hoverBox);
                    this._breakOutline.visible = true;
                    this._breakOutline.position.copy(hoverBox.position);
                    this._breakOutline.scale.set(he.w * 1.06, he.h * 1.06, he.d * 1.06);
                    this._setOutlineColor(0xef4444);
                } else this._breakOutline.visible = false;
            }
            this.canvas.style.cursor = validHover ? 'pointer' : 'not-allowed';
            return;
        }

        this._updateGhost();
    }

    _autoCement(placed) {
        const pe = this.boxSystem.getExtents(placed);
        for (const b of this.boxSystem.boxes) {
            if (b === placed || b.userData.carried || b.userData.shapeType === 'beam') continue;
            const be = this.boxSystem.getExtents(b);
            const ox = (pe.w + be.w) / 2 - Math.abs(placed.position.x - b.position.x);
            const oy = (pe.h + be.h) / 2 - Math.abs(placed.position.y - b.position.y);
            const oz = (pe.d + be.d) / 2 - Math.abs(placed.position.z - b.position.z);
            if (ox < -0.05 || oy < -0.05 || oz < -0.05) continue;
            const faces = (ox > 0.05 ? 1 : 0) + (oy > 0.05 ? 1 : 0) + (oz > 0.05 ? 1 : 0);
            if (faces >= 2) this.boxSystem.addCement(placed, b);
        }
    }

    _onPointerDown(e) {
        if (!this.isActive) return;
        if (e.button !== 0) return;

        // ⭐ Double-check cooldown giữa chừng
        const cdCheck = _checkBuildCooldown();
        if (!cdCheck.ok) {
            // Đang cooldown → tự tắt build
            this.setEnabled(false);
            if (window.interactionSystem) window.interactionSystem.setTool('navigate');
            if (window.contextMenu) { window.contextMenu.currentTool = 'navigate'; window.contextMenu._refreshToolUI(); }
            if (window.__updateToolBadge) window.__updateToolBadge('navigate');
            return;
        }

        e.preventDefault(); e.stopPropagation();

        const now = performance.now();
        if (now - this._lastPlaceTime < PLACE_COOLDOWN) return;

        this._updateMouse(e);
        this.raycaster.setFromCamera(this.mouse, this.camera);

        if (this.mode === 'cement') {
            if (this._cementTarget && this._cementNeighbors.length > 0) {
                this.boxSystem.cements.slice().forEach(c => {
                    if (c.a === this._cementTarget || c.b === this._cementTarget) {
                        const other = c.a === this._cementTarget ? c.b : c.a;
                        if (this._cementNeighbors.includes(other)) this.boxSystem.removeCement(c);
                    }
                });
                this._clearCementHighlights();
            }
            return;
        }

        if (this.mode === 'break') {
            const hits = this.raycaster.intersectObjects(this.boxSystem.boxes, true);
            const box = hits.length > 0 ? this._resolveRootBox(hits[0].object) : null;
            if (box && !box.userData.carried) {
                this.boxSystem.removeBox(box);
                if (this.onBoxRemoved) this.onBoxRemoved(box);
                this._updateInfo();
            }
            return;
        }

        if (!this._lastPosition || !this._ghostValid) return;
        const { x, y, z } = this._lastPosition;
        const shape = SHAPE_CATALOG[this.currentShapeKey];
        if (!shape) return;

        this._lastPlaceTime = now;
        const r = this._effRot();
        const bs = this.boxSystem;
        let placed;
        switch (shape.type) {
            case 'beam': placed = bs.addBeam(x, z, { spawnHeight: y, rotationY: r.y, rotationX: r.x, rotationZ: r.z }); break;
            case 'pillar': placed = bs.addPillar(x, z, { spawnHeight: y, rotationY: r.y, rotationX: r.x, rotationZ: r.z }); break;
            case 'door': placed = bs.addDoor(x, z, 0x8b4513, { rotationY: r.y, flip: this.doorFlip }); break;
            case 'window': placed = bs.addWindow(x, z, this.color, { rotationY: r.y }); break;
            case 'table': placed = bs.addTable(x, z, { rotationY: r.y, spawnHeight: y }); break;
            case 'chair': placed = bs.addChair(x, z, { rotationY: r.y, spawnHeight: y }); break;
            case 'bed': placed = bs.addBed(x, z, { rotationY: r.y, spawnHeight: y }); break;
            case 'fridge': placed = bs.addFridge(x, z, { rotationY: r.y, spawnHeight: y }); break;
            case 'lamp': placed = bs.addLamp(x, z, { rotationY: r.y, spawnHeight: y }); break;
            default: placed = bs.addBox(x, z, this.color, { spawnHeight: y, shapeType: shape.type, rotationY: r.y });
        }

        if (placed) {
            placed.userData.targetY = y;
            placed.userData.isFalling = false;
            placed.userData.velocityX = 0; placed.userData.velocityY = 0; placed.userData.velocityZ = 0;
            placed.position.y = y;
            if (shape.type !== 'beam') this._autoCement(placed);
        }

        if (placed && this.onBoxPlaced) this.onBoxPlaced(placed);
        this._updateInfo();
        if (bs._recomputeSupport) bs._recomputeSupport();
    }

    _onKeyDown(e) {
        if (!this.isActive) return;
        const tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

        if (e.key === 'Alt') { this._isAltDown = true; this._updateHint(); this._updateGhost(); e.preventDefault(); return; }

        if (e.code === 'Digit1') { this.setMode('place'); e.preventDefault(); }
        else if (e.code === 'Digit2') { this.setMode('break'); e.preventDefault(); }
        else if (e.code === 'Digit3') { this.setMode('cement'); e.preventDefault(); }
        else if (e.code === 'KeyR') { this._rotate(); e.preventDefault(); }
        else if (e.code === 'KeyT' && !e.shiftKey) { this._tiltZ(); e.preventDefault(); }
        else if (e.code === 'KeyT' && e.shiftKey) { this._tiltX(); e.preventDefault(); }
        else if (e.code === 'KeyF') {
            if (this.currentShapeKey === 'door') {
                this.doorFlip = !this.doorFlip;
                this._refreshGhost();
                this._updateHint();
                this._updateGhost();
            }
            e.preventDefault();
        }
        else if (e.key === 'Escape') {
            if (this.mode === 'cement' && (this._cementTarget || this._cementNeighbors.length > 0)) {
                this._clearCementHighlights();
                e.preventDefault(); return;
            }
            if (this.manualHeight !== null) { this.manualHeight = null; this._updateInfo(); e.preventDefault(); return; }
            this.setEnabled(false);
            if (window.interactionSystem) window.interactionSystem.setTool('navigate');
            if (window.contextMenu) { window.contextMenu.currentTool = 'navigate'; window.contextMenu._refreshToolUI(); }
            if (window.__updateToolBadge) window.__updateToolBadge('navigate');
            e.preventDefault();
        }
    }

    _onKeyUp(e) {
        if (!this.isActive) return;
        if (e.key === 'Alt') { this._isAltDown = false; this._updateHint(); this._updateGhost(); }
    }

    _bindUI() {
        const tb = this.toolbar;
        if (!tb) return;
        tb.querySelector('#build-btn-place').onclick = () => this.setMode('place');
        tb.querySelector('#build-btn-break').onclick = () => this.setMode('break');
        tb.querySelector('#build-btn-cement').onclick = () => this.setMode('cement');
        tb.querySelectorAll('[data-color]').forEach(btn => { btn.onclick = () => this.setColor(parseInt(btn.dataset.color, 10)); });
        tb.querySelector('#build-rotate').onclick = () => this._rotate();
        tb.querySelector('#build-tilt-x').onclick = () => this._tiltX();
        tb.querySelector('#build-tilt-z').onclick = () => this._tiltZ();
        if (this._sliderEl) {
            this._sliderEl.oninput = (e) => { this.manualHeight = parseFloat(e.target.value); this._updateInfo(); this._updateGhost(); };
            this._sliderEl.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
        }
        const resetBtn = tb.querySelector('#build-height-reset');
        if (resetBtn) resetBtn.onclick = () => { this.manualHeight = null; this._syncSlider(); this._updateGhost(); };
        tb.querySelector('#build-clear').onclick = () => { if (this.boxSystem.count === 0) return; if (confirm('Xoá tất cả?')) { this.boxSystem.clearAll(); this._updateInfo(); } };
        tb.querySelector('#build-exit').onclick = () => {
            this.setEnabled(false);
            if (window.interactionSystem) window.interactionSystem.setTool('navigate');
            if (window.contextMenu) { window.contextMenu.currentTool = 'navigate'; window.contextMenu._refreshToolUI(); }
            if (window.__updateToolBadge) window.__updateToolBadge('navigate');
        };
    }

    _refreshUI() {
        const btns = { place: '#build-btn-place', break: '#build-btn-break', cement: '#build-btn-cement' };
        Object.entries(btns).forEach(([key, sel]) => {
            const b = this.toolbar.querySelector(sel);
            if (!b) return;
            const active = this.mode === key;
            b.style.background = active ? (key === 'place' ? '#10b981' : key === 'break' ? '#ef4444' : '#a1a1aa') : 'transparent';
            b.style.color = active ? (key === 'cement' ? '#0f172a' : '#fff') : '#94a3b8';
        });
        const palette = this.toolbar.querySelector('#build-palette');
        if (palette) { palette.style.opacity = this.mode === 'place' ? '1' : '0.3'; palette.style.pointerEvents = this.mode === 'place' ? 'auto' : 'none'; }
        if (this._shapesPanel) this._shapesPanel.style.display = this.mode === 'place' ? 'flex' : 'none';
        if (this._sliderRow) this._sliderRow.style.display = this.mode === 'cement' ? 'none' : 'flex';
        this._refreshPalette();
    }

    _refreshPalette() {
        this.toolbar.querySelectorAll('[data-color]').forEach(btn => {
            const active = parseInt(btn.dataset.color, 10) === this.color;
            btn.style.borderColor = active ? '#fff' : 'transparent';
            btn.style.transform = active ? 'scale(1.15)' : 'scale(1)';
        });
    }

    _syncSlider() {
        if (this._sliderEl) this._sliderEl.value = this.manualHeight !== null ? this.manualHeight : 0;
        if (this._sliderValEl) this._sliderValEl.textContent = this.manualHeight !== null ? this.manualHeight.toFixed(1) + 'm' : 'Auto';
    }

    _updateInfo() {
        const countEl = this.toolbar.querySelector('#build-count');
        if (countEl) countEl.textContent = this.boxSystem.count;
        this._syncSlider();
    }

    dispose() {
        this.setEnabled(false);
        this._disposeGhost();
        if (this._breakOutline) {
            this.scene.remove(this._breakOutline);
            this._breakOutline.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
            this._breakOutline = null;
        }
        if (this.toolbar) this.toolbar.remove();
        console.log('[Build] Disposed');
    }
}
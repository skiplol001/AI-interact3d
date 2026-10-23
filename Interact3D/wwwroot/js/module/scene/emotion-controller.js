// ═══════════════════════════════════════════════════════════════
// GrabController — Follow Mouse + Boundary + Revenge + TrashCan
// (Fix Pivot Y, MaxSwing & PoseBox)
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'https://esm.sh/three@0.160.0';
import { getPoseBox } from './pose-utils.js'; // ⭐ Import helper tính BBox theo pose

export class GrabController {
    constructor(scene, camera, canvas, characterCtrl, options = {}) {
        this.scene = scene;
        this.camera = camera;
        this.canvas = canvas;
        this.characterCtrl = characterCtrl;
        this.controls = options.controls || null;

        this.targetObj = null;
        this.pivot = null;
        this.state = 'idle';

        this.DEFAULT_HEIGHT = options.grabHeight ?? 2.5;
        this.MIN_HEIGHT = options.minHeight ?? 1.8;
        this.MAX_HEIGHT = options.maxHeight ?? 6.0;
        this.HEIGHT_STEP = options.heightStep ?? 0.15;
        this.SLIDER_STEP = options.sliderStep ?? 0.3;

        this.BOUND_RADIUS = options.boundRadius ?? 15;
        this.BOUND_CENTER = options.boundCenter ?? { x: 0, z: 0 };
        this.SHOW_BOUNDARY_RING = options.showBoundaryRing ?? true;

        this.STIFFNESS = options.stiffness ?? 300;
        this.DAMPING = options.damping ?? 14;
        this.MASS = options.mass ?? 1.0;

        this.SWING_STIFFNESS = options.swingStiffness ?? 80;
        this.SWING_DAMPING = options.swingDamping ?? 4;
        this.SWING_INERTIA = options.swingInertia ?? 1.5;
        // ⭐ FIX: Giảm MAX_SWING từ 0.5 xuống 0.25 để tránh bị nghiêng ngả
        this.MAX_SWING = options.maxSwing ?? 0.25;

        this.ROTATE_SPEED = options.rotateSpeed ?? 2.0;

        this.FALL_GRAVITY = options.gravity ?? -25;
        this.FLOOR_Y = 0;
        this.NEAR_GROUND_THRESHOLD = options.nearGroundThreshold ?? 0.4;

        this.MAX_LIFT_Y = options.maxLiftY ?? 12;
        this.FALL_KEEP_MOMENTUM = options.fallKeepMomentum ?? 0;
        this.LAND_Y = options.landY ?? 0.05;
        this.BONE_TO_SOLE = options.boneToSole ?? 0.03;

        // ⭐ Config — Revenge (Té cao cay cú)
        this.REVENGE_FALL_THRESHOLD = options.revengeFallThreshold ?? 4.0;
        this._fallStartY = 0;
        this._isRevengeMode = false;

        // ⭐ Config — TrashCan
        this.trashCan = options.trashCan || null;

        this.getFloorY = options.getFloorY ?? (() => 0);
        this.onLand = options.onLand ?? null;

        this.currentHeight = this.DEFAULT_HEIGHT;
        this.velocityX = 0;
        this.velocityY = 0;
        this.velocityZ = 0;

        this.swingAngleX = 0;
        this.swingAngleZ = 0;
        this.swingVelX = 0;
        this.swingVelZ = 0;

        this._atBoundary = false;
        this._keys = {};
        this._fallVelocityY = 0;

        this._raycaster = new THREE.Raycaster();
        this._mouse = new THREE.Vector2(0, 0);
        this._horizontalPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

        this._hudEl = null;
        this._sliderEl = null;
        this._sliderFillEl = null;
        this._valueEl = null;
        this._realYEl = null;
        this._isDraggingSlider = false;
        this._lastYUpdate = 0;

        this._boundaryRing = null;
        this._boundaryRingInner = null;

        this._initEvents();
        this._initKeyboard();
        this._initHeightControls();
        this._createHeightHUD();
        this._createBoundaryRing();
        this._createMouseIndicator();
        this._createCableLine();
    }

    // ═══ VISUAL HELPERS ═══
    _createMouseIndicator() {
        if (this._mouseIndicator) return;
        const geo = new THREE.RingGeometry(0.25, 0.32, 32);
        const mat = new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide, transparent: true, opacity: 0.85, depthWrite: false });
        this._mouseIndicator = new THREE.Mesh(geo, mat);
        this._mouseIndicator.rotation.x = -Math.PI / 2;
        this._mouseIndicator.position.y = 0.03;
        this._mouseIndicator.visible = false;
        this.scene.add(this._mouseIndicator);

        const dotGeo = new THREE.CircleGeometry(0.08, 16);
        const dotMat = new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide, transparent: true, opacity: 1, depthWrite: false });
        this._mouseDot = new THREE.Mesh(dotGeo, dotMat);
        this._mouseDot.rotation.x = -Math.PI / 2;
        this._mouseDot.position.y = 0.03;
        this._mouseDot.visible = false;
        this.scene.add(this._mouseDot);
    }

    _updateMouseIndicator(worldPos) {
        if (!this._mouseIndicator || !this._mouseDot) return;
        this._mouseIndicator.visible = true;
        this._mouseDot.visible = true;
        this._mouseIndicator.position.set(worldPos.x, 0.03, worldPos.z);
        this._mouseDot.position.set(worldPos.x, 0.03, worldPos.z);
        const pulse = 1 + Math.sin(performance.now() * 0.005) * 0.15;
        this._mouseIndicator.scale.set(pulse, pulse, pulse);
    }

    _showMouseIndicator(show) {
        if (this._mouseIndicator) this._mouseIndicator.visible = show;
        if (this._mouseDot) this._mouseDot.visible = show;
    }

    _createCableLine() {
        if (this._cableLine) return;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
        const mat = new THREE.LineDashedMaterial({ color: 0x38bdf8, dashSize: 0.15, gapSize: 0.1, transparent: true, opacity: 0.6, linewidth: 1 });
        this._cableLine = new THREE.Line(geo, mat);
        this._cableLine.visible = false;
        this.scene.add(this._cableLine);
    }

    _updateCableLine(floorPos) {
        if (!this._cableLine || !this.pivot) return;
        this._cableLine.visible = true;
        const positions = this._cableLine.geometry.attributes.position.array;
        positions[0] = this.pivot.position.x;
        positions[1] = this.pivot.position.y;
        positions[2] = this.pivot.position.z;
        positions[3] = floorPos.x;
        positions[4] = 0.05;
        positions[5] = floorPos.z;
        this._cableLine.geometry.attributes.position.needsUpdate = true;
        this._cableLine.computeLineDistances();
    }

    _showCableLine(show) {
        if (this._cableLine) this._cableLine.visible = show;
    }

    _initEvents() {
        this._isPointerDown = false;
        const updateMouse = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this._mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            this._mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        };
        this.canvas.addEventListener('pointerdown', (e) => { if (e.button === 0) this._isPointerDown = true; });
        window.addEventListener('pointerup', (e) => { if (e.button === 0) { this._isPointerDown = false; updateMouse(e); } });
        this.canvas.addEventListener('pointermove', (e) => { if (this._isPointerDown) return; updateMouse(e); });
    }

    _initKeyboard() {
        window.addEventListener('keydown', (e) => {
            if (this.characterCtrl.state === 'hanging') {
                const blocked = ['KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
                if (blocked.includes(e.code)) e.preventDefault();
            }
            this._keys[e.code] = true;
        });
        window.addEventListener('keyup', (e) => { this._keys[e.code] = false; });
    }

    _initHeightControls() {
        this.canvas.addEventListener('wheel', (e) => {
            if (this.characterCtrl.state !== 'hanging') return;
            e.preventDefault();
            e.stopImmediatePropagation();
            const delta = -Math.sign(e.deltaY) * this.HEIGHT_STEP;
            this.adjustHeight(delta);
        }, { passive: false, capture: true });
    }

    adjustHeight(delta) {
        const old = this.currentHeight;
        this.currentHeight = THREE.MathUtils.clamp(this.currentHeight + delta, this.MIN_HEIGHT, this.MAX_HEIGHT);
        if (this.currentHeight !== old) {
            this._flashHUD();
            this._updateHUD();
        }
    }

    _createBoundaryRing() {
        if (!this.SHOW_BOUNDARY_RING) return;
        if (this._boundaryRing) return;
        const geoOuter = new THREE.RingGeometry(this.BOUND_RADIUS - 0.08, this.BOUND_RADIUS, 64);
        const matOuter = new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.35, depthWrite: false });
        this._boundaryRing = new THREE.Mesh(geoOuter, matOuter);
        this._boundaryRing.rotation.x = -Math.PI / 2;
        this._boundaryRing.position.set(this.BOUND_CENTER.x, 0.02, this.BOUND_CENTER.z);
        this._boundaryRing.visible = false;
        this.scene.add(this._boundaryRing);

        const geoInner = new THREE.RingGeometry(this.BOUND_RADIUS - 0.5, this.BOUND_RADIUS - 0.4, 64);
        const matInner = new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.12, depthWrite: false });
        this._boundaryRingInner = new THREE.Mesh(geoInner, matInner);
        this._boundaryRingInner.rotation.x = -Math.PI / 2;
        this._boundaryRingInner.position.set(this.BOUND_CENTER.x, 0.02, this.BOUND_CENTER.z);
        this._boundaryRingInner.visible = false;
        this.scene.add(this._boundaryRingInner);
    }

    _showBoundaryRing(show) {
        if (this._boundaryRing) this._boundaryRing.visible = show;
        if (this._boundaryRingInner) this._boundaryRingInner.visible = show;
    }

    _updateBoundaryColor(atBoundary) {
        if (!this._boundaryRing) return;
        const targetColor = atBoundary ? new THREE.Color(0xff4444) : new THREE.Color(0x38bdf8);
        const targetOpacity = atBoundary ? 0.75 : 0.35;
        this._boundaryRing.material.color.lerp(targetColor, 0.15);
        this._boundaryRing.material.opacity = THREE.MathUtils.lerp(this._boundaryRing.material.opacity, targetOpacity, 0.15);
        if (this._boundaryRingInner) this._boundaryRingInner.material.color.lerp(targetColor, 0.15);
    }

    _createHeightHUD() {
        if (document.getElementById('grab-height-hud')) {
            this._hudEl = document.getElementById('grab-height-hud');
            this._sliderEl = document.getElementById('grab-height-slider');
            this._sliderFillEl = document.getElementById('grab-height-fill');
            this._valueEl = document.getElementById('grab-height-value');
            this._realYEl = document.getElementById('grab-real-y');
            this._bindHUD();
            return;
        }
        this._hudEl = document.createElement('div');
        this._hudEl.id = 'grab-height-hud';
        this._hudEl.className = 'grab-height-hud';
        this._hudEl.innerHTML = `
            <div class="grab-hud-header"><span class="grab-hud-icon">📏</span><span class="grab-hud-label">Điểm treo</span></div>
            <div class="grab-hud-value-row">
                <button class="grab-hud-btn" data-act="minus">−</button>
                <div class="grab-hud-value" id="grab-height-value">2.5m</div>
                <button class="grab-hud-btn" data-act="plus">+</button>
            </div>
            <div class="grab-slider" id="grab-height-slider">
                <div class="grab-slider-track"><div class="grab-slider-fill" id="grab-height-fill"></div></div>
                <div class="grab-slider-thumb" id="grab-height-thumb"></div>
            </div>
            <div class="grab-hud-limits"><span>${this.MIN_HEIGHT.toFixed(1)}m</span><span>${this.MAX_HEIGHT.toFixed(1)}m</span></div>
            <div class="grab-hud-real">Y tay: <b id="grab-real-y">0.0m</b></div>
            <div class="grab-hud-hint" id="grab-boundary-hint"><b>Chuột</b> di chuyển · <b>Scroll</b> đổi cao · <b>Q/E</b> xoay</div>
        `;
        document.body.appendChild(this._hudEl);
        this._sliderEl = document.getElementById('grab-height-slider');
        this._sliderFillEl = document.getElementById('grab-height-fill');
        this._valueEl = document.getElementById('grab-height-value');
        this._realYEl = document.getElementById('grab-real-y');
        this._bindHUD();
    }

    _bindHUD() {
        this._hudEl.querySelectorAll('[data-act]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (btn.dataset.act === 'plus') this.adjustHeight(this.SLIDER_STEP);
                else this.adjustHeight(-this.SLIDER_STEP);
            });
        });
        const thumb = document.getElementById('grab-height-thumb');
        if (!this._sliderEl || !thumb) return;
        const start = (e) => { e.preventDefault(); e.stopPropagation(); this._isDraggingSlider = true; document.body.style.cursor = 'grabbing'; this._updateSliderFromPointer(e); };
        const move = (e) => { if (this._isDraggingSlider) this._updateSliderFromPointer(e); };
        const end = () => { this._isDraggingSlider = false; document.body.style.cursor = ''; };
        this._sliderEl.addEventListener('pointerdown', start);
        thumb.addEventListener('pointerdown', start);
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', end);
        this._sliderEl.addEventListener('wheel', (e) => e.stopPropagation());
    }

    _updateSliderFromPointer(e) {
        if (!this._sliderEl) return;
        const rect = this._sliderEl.getBoundingClientRect();
        const ratio = THREE.MathUtils.clamp((e.clientX - rect.left) / rect.width, 0, 1);
        this.currentHeight = this.MIN_HEIGHT + ratio * (this.MAX_HEIGHT - this.MIN_HEIGHT);
        this._updateHUD();
    }

    _updateHUD() {
        if (this._valueEl) this._valueEl.textContent = `${this.currentHeight.toFixed(2)}m`;
        const pct = (this.currentHeight - this.MIN_HEIGHT) / (this.MAX_HEIGHT - this.MIN_HEIGHT) * 100;
        if (this._sliderFillEl) this._sliderFillEl.style.width = `${pct}%`;
        const thumb = document.getElementById('grab-height-thumb');
        if (thumb) thumb.style.left = `${pct}%`;
    }

    _updateRealY() {
        if (!this._realYEl || !this.pivot) return;
        this._realYEl.textContent = `${this.pivot.position.y.toFixed(2)}m`;
    }

    _updateBoundaryHint(atBoundary) {
        const hint = document.getElementById('grab-boundary-hint');
        if (!hint) return;
        if (atBoundary) hint.innerHTML = '<span style="color:#ef4444;">⚠️ Đã chạm giới hạn phạm vi</span>';
        else hint.innerHTML = '<b>Chuột</b> di chuyển · <b>Scroll</b> đổi cao · <b>Q/E</b> xoay';
    }

    _showHeightHUD(show) { this._hudEl?.classList.toggle('show', show); }

    _flashHUD() {
        if (!this._hudEl) return;
        this._hudEl.classList.add('flash');
        clearTimeout(this._flashTimer);
        this._flashTimer = setTimeout(() => this._hudEl?.classList.remove('flash'), 150);
    }

    // ═══════════════════════════════════════════════════════════
    // PUBLIC API
    // ═══════════════════════════════════════════════════════════
    grab(target) {
        if (!target || this.state !== 'idle') return;
        this.targetObj = target;
        this.state = 'grabbing';
        this.currentHeight = this.DEFAULT_HEIGHT;
        this.velocityX = this.velocityY = this.velocityZ = 0;
        this.swingAngleX = this.swingAngleZ = this.swingVelX = this.swingVelZ = 0;
        this._atBoundary = false;
        this._isRevengeMode = false;
        this._fallStartY = 0;

        this.characterCtrl.grab();

        // ⭐ REACTION: Gào chửi khi bị nhấc lên
        if (window.showPopup) {
            const phrases = ["Đm thả tao ra! 😡", "Á á á tao đang bay!! 😱", "Thằng nào nhấc tao lên đấy! 🤬"];
            window.showPopup(phrases[Math.floor(Math.random() * phrases.length)], 'angry');
        }
        if (window.emotionCtrl) window.emotionCtrl.trigger('surprised', { force: true });

        setTimeout(() => {
            if (this.characterCtrl.state !== 'surprised' && this.characterCtrl.state !== 'hanging') return;
            this._createPivot(target);
        }, 50);

        document.body.classList.add('grabbing');
        this._showHeightHUD(true);
        this._showBoundaryRing(true);
        this._showCableLine(true);
        this._updateHUD();
        this._updateBoundaryHint(false);
        if (this.controls) this.controls.enableZoom = false;
    }

    _createPivot(target) {
        if (this.pivot) return;
        const handBone = this.characterCtrl.handBone;
        if (!handBone) return this._createRootPivot(target);
        handBone.updateWorldMatrix(true, false);
        const handWorldPos = new THREE.Vector3();
        handBone.getWorldPosition(handWorldPos);

        this.pivot = new THREE.Group();
        this.pivot.position.copy(handWorldPos);
        // ⭐ FIX: BỎ dòng ép Y = currentHeight. Để lò xo kéo lên từ từ.
        this.scene.add(this.pivot);
        this.pivot.attach(target);

        if (this.controls) this.controls.target.copy(this.pivot.position);
    }

    _createRootPivot(target) {
        this.pivot = new THREE.Group();
        this.pivot.position.copy(target.position);
        // ⭐ FIX: BỎ dòng ép Y = currentHeight.
        this.scene.add(this.pivot);
        this.pivot.attach(target);
    }

    release() {
        if (this.characterCtrl.state !== 'hanging' || !this.pivot) return;
        this.state = 'falling';
        this._fallStartY = this.pivot.position.y; // Lưu độ cao bắt đầu rơi để tính Revenge
        this.velocityX *= this.FALL_KEEP_MOMENTUM;
        this.velocityZ *= this.FALL_KEEP_MOMENTUM;
        this.velocityY = 0;
        this._fallVelocityY = 0;

        this._showMouseIndicator(false);
        this._showCableLine(false);
        this._showBoundaryRing(false);
        this._showHeightHUD(false);

        this.characterCtrl.release();

        // ⭐ REACTION: Hét lên khi bị thả
        if (window.showPopup) {
            const phrases = ["Á á á tao rơi!! 😱", "Đm thả tao xuống là sao!! 🤬", "Cứu tao với!!!! 😭"];
            window.showPopup(phrases[Math.floor(Math.random() * phrases.length)], 'verySad');
        }
        if (window.emotionCtrl) window.emotionCtrl.trigger('falling', { force: true });
    }

    isGrabbing() { return this.state !== 'idle'; }

    update(dt) {
        if (!this.targetObj) return;
        const ctrlState = this.characterCtrl.state;
        if (ctrlState === 'surprised') return;

        if (ctrlState === 'hanging') {
            this.state = 'hanging';
            if (!this.pivot) return;
            this._followMouseWithBoundary(dt);
            this._rotateWithQE(dt);
            this._swingPendulum(dt);
            const now = performance.now();
            if (now - this._lastYUpdate > 100) { this._lastYUpdate = now; this._updateRealY(); }
            return;
        }

        if (ctrlState === 'falling') {
            this.state = 'falling';
            if (!this.pivot) return;
            this._fallFreely(dt);
            return;
        }

        if (ctrlState === 'landing' || ctrlState === 'idle') {
            if (this.state !== 'idle') {
                this.state = 'idle';
                this.targetObj = null;
                this.pivot = null;
                document.body.classList.remove('grabbing');
                this._showHeightHUD(false);
                this._showBoundaryRing(false);
                this._showMouseIndicator(false);
                this._showCableLine(false);
                if (this.controls) this.controls.enableZoom = true;
            }
        }
    }

    _followMouseWithBoundary(dt) {
        this._raycaster.setFromCamera(this._mouse, this.camera);
        const ray = this._raycaster.ray;
        this._horizontalPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0.05, 0));
        const cx = this.BOUND_CENTER.x;
        const cz = this.BOUND_CENTER.z;
        const floorPoint = new THREE.Vector3();
        let wantX, wantZ;
        if (ray.intersectPlane(this._horizontalPlane, floorPoint)) {
            wantX = floorPoint.x;
            wantZ = floorPoint.z;
        } else {
            const len = Math.hypot(ray.direction.x, ray.direction.z) || 1;
            wantX = cx + (ray.direction.x / len) * this.BOUND_RADIUS * 10;
            wantZ = cz + (ray.direction.z / len) * this.BOUND_RADIUS * 10;
        }
        const dx = wantX - cx;
        const dz = wantZ - cz;
        const dist = Math.hypot(dx, dz);
        let targetX, targetZ, targetY;
        if (dist <= this.BOUND_RADIUS) {
            targetX = wantX; targetZ = wantZ; targetY = this.currentHeight; this._atBoundary = false;
        } else {
            const ratio = this.BOUND_RADIUS / dist;
            targetX = cx + dx * ratio; targetZ = cz + dz * ratio;
            const reachY = this._getReachHeight(ray, targetX, targetZ);
            targetY = THREE.MathUtils.clamp(Math.max(this.currentHeight, reachY), this.currentHeight, this.MAX_LIFT_Y);
            this._atBoundary = true;
        }
        this._updateBoundaryHint(this._atBoundary);
        this._updateBoundaryColor(this._atBoundary);
        this._updateMouseIndicator({ x: targetX, z: targetZ });
        this._updateCableLine({ x: targetX, z: targetZ });

        const forceX = -this.STIFFNESS * (this.pivot.position.x - targetX) - this.DAMPING * this.velocityX;
        const forceY = -this.STIFFNESS * (this.pivot.position.y - targetY) - this.DAMPING * this.velocityY;
        const forceZ = -this.STIFFNESS * (this.pivot.position.z - targetZ) - this.DAMPING * this.velocityZ;
        this.velocityX += (forceX / this.MASS) * dt;
        this.velocityY += (forceY / this.MASS) * dt;
        this.velocityZ += (forceZ / this.MASS) * dt;
        this.pivot.position.x += this.velocityX * dt;
        this.pivot.position.y += this.velocityY * dt;
        this.pivot.position.z += this.velocityZ * dt;

        const finalDx = this.pivot.position.x - cx;
        const finalDz = this.pivot.position.z - cz;
        const finalDist = Math.hypot(finalDx, finalDz);
        if (finalDist > this.BOUND_RADIUS && finalDist > 0.001) {
            const r = this.BOUND_RADIUS / finalDist;
            this.pivot.position.x = cx + finalDx * r;
            this.pivot.position.z = cz + finalDz * r;
            this.velocityX *= 0.3;
            this.velocityZ *= 0.3;
        }
    }

    _getReachHeight(ray, px, pz) {
        const D = ray.direction, O = ray.origin;
        const denom = 1 - D.y * D.y;
        if (denom < 1e-4) return this.currentHeight;
        const d = D.x * (O.x - px) + D.y * O.y + D.z * (O.z - pz);
        return (O.y - D.y * d) / denom;
    }

    _rotateWithQE(dt) {
        if (this._keys['KeyQ']) this.pivot.rotation.y += this.ROTATE_SPEED * dt;
        if (this._keys['KeyE']) this.pivot.rotation.y -= this.ROTATE_SPEED * dt;
    }

    _fallFreely(dt) {
        this.velocityY += this.FALL_GRAVITY * dt;
        this.pivot.position.y += this.velocityY * dt;
        this.pivot.position.x += this.velocityX * dt;
        this.pivot.position.z += this.velocityZ * dt;

        this._swingPendulum(dt);

        const now = performance.now();
        if (now - this._lastYUpdate > 100) { this._lastYUpdate = now; this._updateRealY(); }

        const bodyPos = new THREE.Vector3();
        this.targetObj.getWorldPosition(bodyPos);
        const floorY = this.getFloorY(bodyPos.x, bodyPos.z);

        if (this._getLowestY() <= floorY + this.LAND_Y) {
            this._landAndDetach(floorY);
        }
    }

    // ⭐ FIX: Dùng getPoseBox để lấy đúng minY theo pose hiện tại
    _getLowestY() {
        if (!this.targetObj) return Infinity;
        const bbox = getPoseBox(this.targetObj);
        return bbox.min.y;
    }

    _landAndDetach(floorY = 0) {
        if (!this.pivot || !this.targetObj) return;
        const pivotRotY = this.pivot.rotation.y;
        this.scene.attach(this.targetObj);
        this.scene.remove(this.pivot);
        this.pivot = null;
        this.targetObj.rotation.set(0, pivotRotY, 0);
        this.targetObj.updateMatrixWorld(true);

        // ⭐ FIX: Dùng getPoseBox
        const bbox = getPoseBox(this.targetObj);
        if (Math.abs(bbox.min.y - floorY) > 0.001) {
            this.targetObj.position.y += floorY - bbox.min.y;
            this.targetObj.updateMatrixWorld(true);
        }

        if (this.onLand) this.onLand(this.targetObj, floorY);

        this.velocityX = this.velocityY = this.velocityZ = 0;
        this.swingAngleX = this.swingAngleZ = this.swingVelX = this.swingVelZ = 0;

        this.state = 'landing';
        this.characterCtrl.land();

        // ⭐ REACTION: Chửi đổng khi tiếp đất
        if (window.showPopup) {
            const phrases = ["Đau vl! Thằng nào ném tao!! 🤬", "Trời ơi đất hỡi, ê ẩm hết cả mông! 😭", "Tao thề tao sẽ trả thù! 😡", "Tiếp đất an toàn... đùa thôi đau chết đi được! 😫"];
            window.showPopup(phrases[Math.floor(Math.random() * phrases.length)], 'angry');
        }
        if (window.emotionCtrl) window.emotionCtrl.trigger('angry', { force: true });

        // ⭐ REACTION 2: Té cao quá → Cay cú chạy lại camera sút
        const fallDistance = this._fallStartY - floorY;
        if (fallDistance >= this.REVENGE_FALL_THRESHOLD && !this._isRevengeMode) {
            console.log(`[Grab] Té cao ${fallDistance.toFixed(1)}m → REVENGE MODE!`);
            setTimeout(() => this._triggerRevenge(), 1500);
        }

        // ⭐ REACTION 3: Ném vào thùng rác → Chửi tiếp
        if (this.trashCan) {
            const pos = this.targetObj.position;
            const tc = this.trashCan;
            const tdx = pos.x - (tc.x || 0);
            const tdz = pos.z - (tc.z || 0);
            if (Math.hypot(tdx, tdz) < (tc.radius || 1.2)) {
                console.log('[Grab] Ném vào thùng rác!');
                setTimeout(() => this._triggerTrashReaction(), 800);
            }
        }

        document.body.classList.remove('grabbing');
        this._showHeightHUD(false);
        this._showBoundaryRing(false);
        this._showMouseIndicator(false);
        this._showCableLine(false);
        if (this.controls) this.controls.enableZoom = true;
    }

    // ═══════════════════════════════════════════════════════════
    // ⭐ REVENGE MODE
    // ═══════════════════════════════════════════════════════════
    _triggerRevenge() {
        this._isRevengeMode = true;
        const ctrl = this.characterCtrl;
        const cam = this.camera;
        if (!ctrl || !cam) return;

        if (window.showPopup) window.showPopup("Đm mày, để tao chạy lại đá mày một phát! 😡", 'angry');
        if (window.emotionCtrl) window.emotionCtrl.trigger('angry', { force: true });

        const camPos = cam.position;
        const charPos = ctrl.root.position;
        const dx = camPos.x - charPos.x;
        const dz = camPos.z - charPos.z;
        const dist = Math.hypot(dx, dz);
        const SAFE_DIST = 1.5;

        if (dist <= SAFE_DIST + 0.3) {
            setTimeout(() => this._doKick(), 500);
            return;
        }

        const k = (dist - SAFE_DIST) / dist;
        const targetX = charPos.x + dx * k;
        const targetZ = charPos.z + dz * k;

        ctrl.goTo(new THREE.Vector3(targetX, 0, targetZ));

        const checkArrived = () => {
            if (ctrl.state === 'idle' || ctrl.state === 'carryIdle') { this._doKick(); return; }
            setTimeout(checkArrived, 200);
        };
        setTimeout(checkArrived, 800);
    }

    _doKick() {
        if (window.emotionCtrl) window.emotionCtrl.trigger('angry', { force: true });
        if (window.showPopup) {
            const phrases = ["Đá này! 🥊", "Sút chết mẹ mày giờ! 🤬", "Mày thích troll tao không?! 👊"];
            window.showPopup(phrases[Math.floor(Math.random() * phrases.length)], 'angry');
        }
        this._shakeCamera(0.6, 800);
        setTimeout(() => { this._isRevengeMode = false; }, 3000);
    }

    _shakeCamera(intensity = 0.3, duration = 500) {
        const cam = this.camera;
        if (!cam) return;
        const originalPos = cam.position.clone();
        const startTime = performance.now();
        const tick = () => {
            const elapsed = performance.now() - startTime;
            if (elapsed >= duration) { cam.position.copy(originalPos); return; }
            const factor = 1 - elapsed / duration;
            const offset = intensity * factor;
            cam.position.x = originalPos.x + (Math.random() - 0.5) * offset;
            cam.position.y = originalPos.y + (Math.random() - 0.5) * offset;
            cam.position.z = originalPos.z + (Math.random() - 0.5) * offset;
            requestAnimationFrame(tick);
        };
        tick();
    }

    // ═══════════════════════════════════════════════════════════
    // ⭐ TRASH CAN REACTION
    // ═══════════════════════════════════════════════════════════
    _triggerTrashReaction() {
        if (window.emotionCtrl) window.emotionCtrl.trigger('angry', { force: true });
        if (window.showPopup) {
            const phrases = [
                "Đm thằng khốn! Ném tao vào thùng rác à! 🤬",
                "Tao mà biết mày là ai thì mày toi đời! 😡",
                "Đây là cách mày đối xử với tao hả?! 💢",
                "Hôi vãi! Tao phải ra khỏi đây ngay! 🤢"
            ];
            window.showPopup(phrases[Math.floor(Math.random() * phrases.length)], 'angry');
        }
    }

    _swingPendulum(dt) {
        const externalForceX = this.velocityZ * this.SWING_INERTIA * 0.5;
        const externalForceZ = -this.velocityX * this.SWING_INERTIA * 0.5;
        const springForceX = -this.SWING_STIFFNESS * this.swingAngleX - this.SWING_DAMPING * this.swingVelX;
        const springForceZ = -this.SWING_STIFFNESS * this.swingAngleZ - this.SWING_DAMPING * this.swingVelZ;
        this.swingVelX += (springForceX + externalForceX) * dt;
        this.swingVelZ += (springForceZ + externalForceZ) * dt;
        this.swingAngleX += this.swingVelX * dt;
        this.swingAngleZ += this.swingVelZ * dt;
        this.swingAngleX = THREE.MathUtils.clamp(this.swingAngleX, -this.MAX_SWING, this.MAX_SWING);
        this.swingAngleZ = THREE.MathUtils.clamp(this.swingAngleZ, -this.MAX_SWING, this.MAX_SWING);
        this.pivot.rotation.x = this.swingAngleX;
        this.pivot.rotation.z = this.swingAngleZ;
    }
}
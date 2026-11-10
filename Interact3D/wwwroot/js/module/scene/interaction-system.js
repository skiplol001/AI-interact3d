// ═══════════════════════════════════════════════════════════════
// interaction-system.js — v27 (Attract cooldown block)
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'https://esm.sh/three@0.160.0';
import { EMOTION_POOLS } from './emotion-controller.js?v=34';
import { addMood } from './chat/ai-mood.js?v=2';

const HITBOX_CONFIG = {
    head: { radius: 0.22, offsetY: 0.05 },
    cheek: { radius: 0.14, offsetY: 0.0, offsetX: 0.1 },
    belly: { radius: 0.28, offsetY: 0.0 },
    hand: { radius: 0.14, offsetY: 0.05 },
    leg: { radius: 0.2, offsetY: 0.2 }
};

const ATTRACT_QUOTES = {
    gentle: {
        low: ['Ơ... dưới chân mình có gì sáng sáng vậy bạn? 🥺', 'Bạn đang chơi trò gì thế... nhìn lạ quá... 🌸', 'Cái vòng tròn này... có phải ma thuật không vậy? 😳'],
        normal: ['Cái vòng sáng này là gì thế... nhìn chóng mặt quá 🌸', 'Bạn đang thôi miên mình đấy à... mắt mình hoa rồi... 🥺', 'Nó xoay xoay... mình nhìn mà chóng hết cả mặt... 😵'],
        high: ['Á... cao quá... mình sợ độ cao... thả xuống đi mà 😭', 'Bạn ơi... mình ngửa cổ mỏi lắm rồi... hạ xuống chút đi 🥺', 'Huhu... đừng bắt mình nhìn lên cao thế... mình chóng mặt... 💫']
    },
    normal: {
        low: ['Ơ hay, cái đống sáng sáng dưới chân này là gì vậy?', 'Mày định thôi miên tao đấy à? Nhìn trông nguy hiểm vãi 😤', 'Bày đặt vẽ vòng tròn phép thuật cơ đấy, trông xàm thật 😒'],
        normal: ['Nhìn lên nhìn xuống mỏi mắt vl... bỏ cái trò này đi! 😠', 'Cái vòng này xoay kinh quá, mày tính làm tao hoa mắt à? 🙄', 'Ủa, dùng phép thuật gì mà nhìn như đèn laser thế? 😏'],
        high: ['Đm, bắt tao ngửa cổ lên tận trần nhà à? Mỏi vl! 😤', 'Bay lên cao thế định cho tao rụng cổ đấy à? Hạ xuống coi! 😠', 'Ê ê, mỏi mắt rồi đó, không hạ xuống tao đập cho đấy! 💢']
    },
    savage: {
        low: ['Đm, cái đéo gì sáng chói dưới chân bà thế? 🤬', 'Mày tính dùng phép thuật gì với bà hả thằng óc chó? 😡', 'Vẽ vời ba cái trò ma thuật rác rưởi, dọn mẹ đi! 🤬'],
        normal: ['Đm, soi cái đéo gì mà soi lắm thế! Bỏ ngay cái trò rảnh rỗi này đi! 😡', 'Mày rảnh quá không có gì làm hay sao mà đi quay cái vòng này?! 🤬', 'Cái đéo gì cứ xoay xoay trước mặt bà thế, chóng hết cả mẹt! 😤'],
        high: ['Đm! Bay lên tận nóc nhà rồi, định treo cổ bà đấy à thằng khốn?! 🤬', 'Mỏi mẹ nó cổ rồi! Hạ cái đống rác phát sáng này xuống ngay! 😡', 'Địt mẹ, mày tính cho bà ngửa mặt đến gãy cổ à? Kéo xuống mau! 💢']
    }
};

// ⭐ NEW: Refuse quotes khi attract đang cooldown
const ATTRACT_REFUSE_QUOTES = {
    gentle: [
        'Ơ... mình không muốn chơi trò đó lúc này... 🥺',
        'Mình đang không vui, đừng bắt mình nhìn lên nữa... 😢',
        'Bạn đừng làm vậy nữa... mình không thích... 🥺',
    ],
    normal: [
        'Tao đéo chơi trò đó lúc này. Bỏ đi 😠',
        'Đừng có bắt tao ngước lên nữa, mệt vl 😤',
        'Mày rảnh quá hả? Tao không rảnh đâu 😒',
    ],
    savage: [
        'Đm, bà đéo chơi cái trò rác rưởi đó đâu! 🤬',
        'Mày muốn ăn đấm hả thằng khốn?! Bỏ ngay trò đó đi! 😡',
        'Địt mẹ, dẹp cái trò vô dụng đó đi con! 💢',
    ],
};

function getCurrentMode() {
    try {
        const w = window.__currentChatMode;
        if (['gentle', 'normal'].includes(w)) return w;
        const m = localStorage.getItem('ai_last_mode');
        return ['gentle', 'normal'].includes(m) ? m : 'normal';
    } catch { return 'normal'; }
}

// Helper check paint overlay
function _isPaintActive() {
    return !!window.paintController?.isOpen;
}

// ⭐ NEW: Helper check attract cooldown
function _checkAttractCooldown() {
    if (!window.houseManager) return { ok: true };
    try {
        const check = window.houseManager.canAttract();
        if (!check.ok) {
            const mode = getCurrentMode();
            const sec = Math.ceil(check.remainingMs / 1000);
            const pool = ATTRACT_REFUSE_QUOTES[mode] || ATTRACT_REFUSE_QUOTES.normal;
            const quote = pool[Math.floor(Math.random() * pool.length)];
            const fullMsg = `${quote} (Còn ${sec}s nữa)`;

            const kind = mode === 'savage' ? 'angry' : (mode === 'gentle' ? 'sad' : 'unclear');
            try {
                if (window.showPopup) window.showPopup(fullMsg, kind);
                else if (window.showCharacterMessage) window.showCharacterMessage(fullMsg, kind);
            } catch { }

            return { ok: false, remainingMs: check.remainingMs };
        }
    } catch (e) {
        console.warn('[Interaction] Attract cooldown check error:', e);
    }
    return { ok: true };
}

export class InteractionSystem {
    constructor(scene, camera, canvas, characterCtrl, emotionCtrl, aiReaction, options = {}) {
        this.scene = scene;
        this.camera = camera;
        this.canvas = canvas;
        this.ctrl = characterCtrl;
        this.emotion = emotionCtrl;
        this._initialAiReaction = aiReaction;
        this.boxSystem = options.boxSystem || window.boxSystem;
        this._slingshotOverride = options.slingshotSystem || null;

        this.onHitboxClick = options.onHitboxClick || (() => { });

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        this.anchorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

        this.currentTool = 'navigate';
        this.hitboxes = [];
        this.hoveredBox = null;

        // Attract state
        this.anchorHeight = 0.05;
        this.MIN_HEIGHT = -1.0;
        this.MAX_HEIGHT = 10.0;

        this._createCursorAnchor();

        this.isDraggingHand = false;
        this.dragOffset = new THREE.Vector3();
        this.petTimer = 0;
        this.isPetting = false;

        this._currentDragAnim = 'idle';
        this._interactionCooldown = 0;

        this._dragTalkTimer = 0;
        this._nextDragTalkTime = 2;

        this._attractTalkTimer = 0;
        this._nextAttractTalkTime = 3 + Math.random() * 4;

        this.bones = { head: null, neck: null, spine: null, leftHand: null, rightHand: null, leftLeg: null, rightLeg: null };
        this.originalNeckQuat = new THREE.Quaternion();

        this.ctrl.root.updateMatrixWorld(true);

        this._initBones();
        this._initHitboxes();

        this._boundPointerMove = (e) => this._onPointerMove(e);
        this.canvas.addEventListener('pointermove', this._boundPointerMove);

        this._boundWheel = (e) => {
            if (_isPaintActive()) return;
            if (this.currentTool === 'attract' && this.cursorAnchor && this.cursorAnchor.visible) {
                e.preventDefault();
                const delta = -Math.sign(e.deltaY) * 0.3;
                this.anchorHeight = THREE.MathUtils.clamp(this.anchorHeight + delta, this.MIN_HEIGHT, this.MAX_HEIGHT);

                this.cursorAnchor.position.y = this.anchorHeight;
                this.anchorPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, this.anchorHeight, 0));

                this._attractTalkTimer = 0;
                this._nextAttractTalkTime = 3 + Math.random() * 4;
            }
        };
        this.canvas.addEventListener('wheel', this._boundWheel, { passive: false });
    }

    get slingshotSystem() {
        return this._slingshotOverride || window.slingshotSystem || null;
    }
    set slingshotSystem(v) {
        this._slingshotOverride = v || null;
    }

    _createCursorAnchor() {
        this.cursorAnchor = new THREE.Group();
        this.cursorAnchor.visible = false;
        this.cursorAnchor.position.y = 0.05;

        const geo1 = new THREE.RingGeometry(0.45, 0.55, 32);
        const mat1 = new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
        this.ring1 = new THREE.Mesh(geo1, mat1);
        this.ring1.rotation.x = -Math.PI / 2;
        this.cursorAnchor.add(this.ring1);

        const geo2 = new THREE.TorusGeometry(0.35, 0.02, 8, 32);
        const mat2 = new THREE.MeshBasicMaterial({ color: 0xa78bfa, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
        this.torus3D = new THREE.Mesh(geo2, mat2);
        this.torus3D.rotation.x = Math.PI / 3;
        this.cursorAnchor.add(this.torus3D);

        const geo3 = new THREE.RingGeometry(0.1, 0.4, 6);
        const mat3 = new THREE.MeshBasicMaterial({ color: 0xffaa00, side: THREE.DoubleSide, transparent: true, opacity: 0.7, wireframe: true, depthWrite: false, blending: THREE.AdditiveBlending });
        this.hex = new THREE.Mesh(geo3, mat3);
        this.hex.rotation.x = -Math.PI / 2;
        this.cursorAnchor.add(this.hex);

        const coreGeo = new THREE.SphereGeometry(0.08, 16, 16);
        const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending });
        this.core = new THREE.Mesh(coreGeo, coreMat);
        this.core.position.y = 0.05;
        this.cursorAnchor.add(this.core);

        const beamGeo = new THREE.CylinderGeometry(0.01, 0.2, 3.0, 16, 1, true);
        const beamMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
        this.cursorBeam = new THREE.Mesh(beamGeo, beamMat);
        this.cursorBeam.position.y = 1.5;
        this.cursorAnchor.add(this.cursorBeam);

        const particleCount = 30;
        const particleGeo = new THREE.BufferGeometry();
        this._pPos = new Float32Array(particleCount * 3);
        this._pVel = [];
        for (let i = 0; i < particleCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = Math.random() * 0.4;
            this._pPos[i * 3] = Math.cos(angle) * r;
            this._pPos[i * 3 + 1] = Math.random() * 3.0;
            this._pPos[i * 3 + 2] = Math.sin(angle) * r;
            this._pVel.push(0.5 + Math.random() * 1.5);
        }
        particleGeo.setAttribute('position', new THREE.BufferAttribute(this._pPos, 3));
        const particleMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.06, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
        this.cursorParticles = new THREE.Points(particleGeo, particleMat);
        this.cursorAnchor.add(this.cursorParticles);

        this.scene.add(this.cursorAnchor);
    }

    dispose() {
        if (this.canvas) {
            this.canvas.removeEventListener('pointermove', this._boundPointerMove);
            this.canvas.removeEventListener('wheel', this._boundWheel);
        }
        this.hitboxes.forEach(box => {
            if (box.parent) box.parent.remove(box);
        });
        this.hitboxes = [];

        if (this.cursorAnchor) {
            this.scene.remove(this.cursorAnchor);
            this.cursorAnchor.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
            this.cursorAnchor = null;
        }

        this.ctrl = null;
        this.emotion = null;
        this.scene = null;
        this.camera = null;
        this.canvas = null;
        console.log('[Interaction] Disposed');
    }

    _callAIR(type) {
        if (_isPaintActive()) return;
        const fn = typeof window.AIReaction === 'function' ? window.AIReaction : this._initialAiReaction;
        if (typeof fn === 'function') {
            try { fn(type); } catch (e) { console.warn(`[Interaction] AIReaction("${type}") error:`, e); }
        }
    }

    _triggerRandomEmotion(poolKey) {
        const pool = EMOTION_POOLS[poolKey];
        if (!pool || pool.length === 0) return 1000;
        const emotion = pool[Math.floor(Math.random() * pool.length)];

        let duration = 1500;
        if (this.emotion) {
            const success = this.emotion.trigger(emotion, { force: true });
            if (success) {
                duration = this.emotion.getEmotionDuration(emotion);
            }
        }

        this._interactionCooldown = performance.now() + duration + 200;
        return duration;
    }

    // ⭐ MODIFIED: block attract nếu houseManager đang cooldown
    setTool(toolId) {
        // ⭐ Chặn attract nếu đang cooldown
        if (toolId === 'attract') {
            const check = _checkAttractCooldown();
            if (!check.ok) {
                console.log(`[Interaction] Attract blocked by houseManager (${Math.ceil(check.remainingMs / 1000)}s remaining)`);

                // Reset tool về navigate
                this.currentTool = 'navigate';
                this.isPetting = false;
                this.petTimer = 0;
                this.isDraggingHand = false;
                this.hoveredBox = null;

                if (this.cursorAnchor) this.cursorAnchor.visible = false;
                if (this.canvas) this.canvas.style.cursor = 'crosshair';

                // Sync context menu + badge
                if (window.contextMenu) {
                    window.contextMenu.currentTool = 'navigate';
                    try { window.contextMenu._refreshToolUI(); } catch { }
                }
                if (window.__updateToolBadge) window.__updateToolBadge('navigate');

                return;
            }
        }

        this.currentTool = toolId;
        this.isPetting = false;
        this.petTimer = 0;
        this.isDraggingHand = false;
        this.hoveredBox = null;

        const sling = this.slingshotSystem;
        if (sling && typeof sling.setTool === 'function') {
            sling.setTool(toolId);
        }

        if (toolId !== 'place_slingshot') {
            if (this.canvas) this.canvas.style.cursor = 'crosshair';
        }

        if (this.cursorAnchor) {
            this.cursorAnchor.visible = (toolId === 'attract');
        }

        if (toolId === 'attract') {
            this._attractTalkTimer = 0;
            this._nextAttractTalkTime = 3 + Math.random() * 4;
            this.anchorHeight = 0.05;
            this.cursorAnchor.position.y = this.anchorHeight;
        }

        console.log(`[Interaction] Tool changed → "${toolId}"`);
    }

    isToolActive() {
        return this.currentTool !== 'navigate';
    }

    _initBones() {
        this.ctrl.root.traverse((n) => {
            if (!n.isBone) return;
            const name = n.name.toLowerCase();
            if (name.includes('head') && !this.bones.head) this.bones.head = n;
            if (name.includes('neck') && !this.bones.neck) this.bones.neck = n;
            if ((name.includes('spine2') || name.includes('spine1')) && !this.bones.spine) this.bones.spine = n;
            if (name.includes('lefthand')) this.bones.leftHand = n;
            if (name.includes('righthand')) this.bones.rightHand = n;
            if (name.includes('leftleg') || name.includes('leftupleg')) this.bones.leftLeg = n;
            if (name.includes('rightleg') || name.includes('rightupleg')) this.bones.rightLeg = n;
        });
        if (this.bones.neck) this.originalNeckQuat.copy(this.bones.neck.quaternion);
    }

    _initHitboxes() {
        const geo = new THREE.SphereGeometry(1, 12, 12);
        const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });

        const createBox = (type, bone) => {
            if (!bone) return null;
            bone.updateWorldMatrix(true, false);
            const worldScale = new THREE.Vector3();
            bone.getWorldScale(worldScale);
            const scaleFix = worldScale.x > 0.001 ? worldScale.x : 1;

            const mesh = new THREE.Mesh(geo, mat);
            mesh.userData.hitType = type;
            mesh.scale.setScalar(HITBOX_CONFIG[type].radius / scaleFix);

            bone.add(mesh);
            this.hitboxes.push(mesh);
            return mesh;
        };

        createBox('head', this.bones.head);
        const cheekL = createBox('cheek', this.bones.head);
        const cheekR = createBox('cheek', this.bones.head);
        if (cheekL && cheekR) {
            const offX = HITBOX_CONFIG.cheek.offsetX;
            const worldScale = new THREE.Vector3();
            this.bones.head.getWorldScale(worldScale);
            const scaleFix = worldScale.x > 0.001 ? worldScale.x : 1;
            cheekL.position.set(offX / scaleFix, 0, 0);
            cheekR.position.set(-offX / scaleFix, 0, 0);
        }
        createBox('belly', this.bones.spine);
        createBox('hand', this.bones.leftHand);
        createBox('hand', this.bones.rightHand);
        createBox('leg', this.bones.leftLeg);
        createBox('leg', this.bones.rightLeg);
    }

    _onPointerMove(e) {
        if (!this.canvas) return;
        if (_isPaintActive()) return;

        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        if (this.currentTool === 'attract' && this.cursorAnchor && this.cursorAnchor.visible) {
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const pt = new THREE.Vector3();
            this.anchorPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, this.anchorHeight, 0));
            if (this.raycaster.ray.intersectPlane(this.anchorPlane, pt)) {
                this.cursorAnchor.position.set(pt.x, this.anchorHeight, pt.z);
            }
        }

        const sling = this.slingshotSystem;
        if (sling && (this.currentTool === 'place_slingshot' || sling.isAiming)) {
            sling.handlePointerMove(e);
        }

        if (this.isDraggingHand) return;

        if (this.currentTool === 'place_slingshot' || (sling && sling.isAiming) || this.currentTool === 'attract') {
            return;
        }

        if (this.currentTool === 'navigate') {
            this.hoveredBox = null;
            return;
        }

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const hits = this.raycaster.intersectObjects(this.hitboxes, false);
        this.hoveredBox = hits.length > 0 ? hits[0].object : null;

        if (this.hoveredBox) {
            const type = this.hoveredBox.userData.hitType;
            this.canvas.style.cursor = (this.currentTool === 'drag' && type === 'hand') ? 'grab' : 'pointer';
        } else {
            this.canvas.style.cursor = 'crosshair';
        }
    }

    handlePointerDown(e) {
        if (e.button !== 0) return false;
        if (_isPaintActive()) return true;

        if (this.currentTool === 'attract') return true;

        const sling = this.slingshotSystem;
        if (sling && sling.isAiming) { sling.handlePointerDown(e); return true; }
        if (this.currentTool === 'place_slingshot') { if (sling) sling.handlePointerDown(e); return true; }
        if (this.currentTool === 'navigate') return false;

        if (performance.now() < this._interactionCooldown) return true;

        if (this.currentTool === 'kick') {
            if (!this.boxSystem) return true;
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const hits = this.raycaster.intersectObjects(this.boxSystem.boxes, false);
            if (hits.length > 0) {
                this.ctrl.walkToKickBox(hits[0].object);
                this._interactionCooldown = performance.now() + 2000;
                addMood(-1);
            }
            return true;
        }

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const hits = this.raycaster.intersectObjects(this.hitboxes, false);
        if (hits.length === 0) return true;

        const hit = hits[0].object;
        const type = hit.userData.hitType;
        this.onHitboxClick();

        if (this.currentTool === 'drag') {
            this.isDraggingHand = true;
            this.canvas.style.cursor = 'grabbing';
            this._callAIR('drag_hand');
            this._currentDragAnim = 'idle';
            const target = new THREE.Vector3();
            this.raycaster.ray.intersectPlane(this.plane, target);
            this.dragOffset.copy(this.ctrl.root.position).sub(target);
            this._interactionCooldown = performance.now() + 500;
            this._dragTalkTimer = 0;
            this._nextDragTalkTime = 1 + Math.random() * 2;
            return true;
        }

        if (this.currentTool === 'pet') {
            addMood(10);
            this.isPetting = true;
            this.petTimer = 0;
            return true;
        }

        if (this.currentTool === 'poke') {
            if (type === 'cheek') {
                addMood(10);
                this._callAIR('poke_cheek'); this._triggerRandomEmotion('poke_cheek');
            }
            else if (type === 'head') {
                addMood(-1);
                this._callAIR('poke_head'); this._triggerRandomEmotion('poke_head');
            }
            else if (type === 'belly') {
                addMood(-1);
                this._callAIR('poke_belly'); this._triggerRandomEmotion('poke_belly');
            }
            else if (type === 'leg') {
                addMood(-1);
                this._callAIR('poke_belly'); this._triggerRandomEmotion('poke_leg');
            }
            else {
                addMood(-1);
                this._callAIR('poke_head'); this._triggerRandomEmotion('poke_head');
            }
            return true;
        }
        return true;
    }

    handlePointerUp(e) {
        if (e.button !== 0) return false;
        if (_isPaintActive()) return true;

        if (this.currentTool === 'attract') return true;

        const sling = this.slingshotSystem;
        if (sling && sling.isAiming) { sling.handlePointerUp(e); return true; }
        if (this.currentTool === 'place_slingshot') { if (sling) sling.handlePointerUp(e); return true; }
        if (this.currentTool === 'navigate') return false;

        if (this.isDraggingHand) {
            this.isDraggingHand = false;
            this.canvas.style.cursor = 'crosshair';
            if (this.ctrl) this.ctrl._playAnim('idle', 0.2);
            if (this.emotion) this.emotion.trigger('idle', { force: true });
        }

        if (this.isPetting) {
            if (this.petTimer < 1.0) {
                this._callAIR('poke_cheek');
                this._triggerRandomEmotion('poke_cheek');
            }
            this.isPetting = false;
            this.petTimer = 0;
        }
        return true;
    }

    _updateHeadTracking() {
        if (!this.bones.neck || !this.ctrl) return;
        const state = this.ctrl.state;
        if (!['idle', 'walking', 'carryIdle', 'carryWalk'].includes(state)) {
            this.bones.neck.quaternion.slerp(this.originalNeckQuat, 0.1);
            return;
        }

        let targetPoint = new THREE.Vector3();
        let hasTarget = false;

        if (this.currentTool === 'attract' && this.cursorAnchor && this.cursorAnchor.visible) {
            targetPoint.copy(this.cursorAnchor.position);
            hasTarget = true;
        } else if (this.currentTool === 'place_slingshot' && this.slingshotSystem?.ghost?.visible) {
            targetPoint.copy(this.slingshotSystem.ghost.position);
            targetPoint.y = 1.0;
            hasTarget = true;
        }

        if (!hasTarget) {
            this.bones.neck.quaternion.slerp(this.originalNeckQuat, 0.1);
            return;
        }

        const charPos = this.ctrl.root.position;
        const dx = targetPoint.x - charPos.x;
        const dz = targetPoint.z - charPos.z;
        const targetYaw = Math.atan2(dx, dz);
        const currentYaw = this.ctrl.root.rotation.y;

        let diff = targetYaw - currentYaw;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));

        let MAX_HEAD_YAW = 1.22;
        if (this.currentTool === 'attract') MAX_HEAD_YAW = 1.5;

        if (Math.abs(diff) > MAX_HEAD_YAW) {
            const rootDelta = diff > 0 ? (diff - MAX_HEAD_YAW) : (diff + MAX_HEAD_YAW);
            this.ctrl.root.rotation.y += rootDelta * 0.1;
            diff -= rootDelta;
        }

        let pitchAngle = 0;
        if (this.currentTool === 'attract') {
            const dy = targetPoint.y - (charPos.y + 1.5);
            const dist = Math.hypot(dx, dz);
            pitchAngle = Math.atan2(dy, dist);
            pitchAngle = THREE.MathUtils.clamp(pitchAngle, -1.0, 1.0);
        }

        const targetQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitchAngle, diff * 0.8, 0));
        this.bones.neck.quaternion.slerp(this.originalNeckQuat.clone().multiply(targetQuat), 0.15);
    }

    _updateAttractDialog(dt) {
        if (this.currentTool !== 'attract' || !this.cursorAnchor || !this.cursorAnchor.visible) return;

        this._attractTalkTimer += dt;
        if (this._attractTalkTimer >= this._nextAttractTalkTime) {
            this._attractTalkTimer = 0;
            this._nextAttractTalkTime = 3 + Math.random() * 4;

            const mode = getCurrentMode();
            let heightKey = 'normal';

            if (this.anchorHeight < 0.5) heightKey = 'low';
            else if (this.anchorHeight > 3.0) heightKey = 'high';

            const quotes = ATTRACT_QUOTES[mode]?.[heightKey];
            if (quotes && window.showCharacterMessage) {
                const text = quotes[Math.floor(Math.random() * quotes.length)];
                window.showCharacterMessage(text, 'normal');

                if (this.emotion) {
                    const emotion = mode === 'savage' ? 'angry' : (mode === 'gentle' ? 'confused' : 'shakingHead');
                    this.emotion.trigger(emotion, { force: true });
                }
            }
        }
    }

    update(dt) {
        if (!this.ctrl) return;
        if (_isPaintActive()) return;

        this._updateHeadTracking();
        this._updateAttractDialog(dt);

        if (this.cursorAnchor && this.cursorAnchor.visible) {
            this.ring1.rotation.z += dt * 1.5;
            this.torus3D.rotation.z -= dt * 2.0;
            this.torus3D.rotation.y += dt * 1.0;
            this.hex.rotation.z += dt * 1.2;

            const pulse = 1 + Math.sin(performance.now() * 0.008) * 0.2;
            this.core.scale.setScalar(pulse);
            this.cursorBeam.scale.set(1 + Math.sin(performance.now() * 0.003) * 0.2, 1, 1 + Math.sin(performance.now() * 0.003) * 0.2);

            const pArr = this.cursorParticles.geometry.attributes.position.array;
            for (let i = 0; i < pArr.length / 3; i++) {
                pArr[i * 3 + 1] += this._pVel[i] * dt;
                if (pArr[i * 3 + 1] > 3.0) {
                    pArr[i * 3 + 1] = 0;
                    const angle = Math.random() * Math.PI * 2;
                    const r = Math.random() * 0.4;
                    pArr[i * 3] = Math.cos(angle) * r;
                    pArr[i * 3 + 2] = Math.sin(angle) * r;
                }
            }
            this.cursorParticles.geometry.attributes.position.needsUpdate = true;
        }

        if (this.isPetting) {
            this.petTimer += dt;
            if (this.petTimer >= 1.0 && this.petTimer - dt < 1.0) {
                addMood(5);
                this._callAIR('petting');
                this._triggerRandomEmotion('petting');
            }
        }

        if (this.isDraggingHand) {
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const floorPoint = new THREE.Vector3();

            if (this.raycaster.ray.intersectPlane(this.plane, floorPoint)) {
                const targetPos = floorPoint.clone().add(this.dragOffset);
                const prevPos = this.ctrl.root.position.clone();
                this.ctrl.root.position.lerp(targetPos, 0.2);

                const moved = this.ctrl.root.position.distanceTo(prevPos);
                const speed = moved / Math.max(dt, 0.001);

                if (speed > 8.0) {
                    this.isDraggingHand = false;
                    this.canvas.style.cursor = 'crosshair';
                    if (this.emotion) {
                        this._callAIR('drag_hand');
                        this._triggerRandomEmotion('poke_leg');
                    }
                    return;
                }

                let targetAnim = 'idle';
                if (speed > 2.5) targetAnim = 'run';
                else if (speed > 0.4) targetAnim = 'walk';

                if (targetAnim !== this._currentDragAnim) {
                    this._currentDragAnim = targetAnim;
                    this.ctrl._playAnim(targetAnim, 0.2);
                }

                const dx = targetPos.x - this.ctrl.root.position.x;
                const dz = targetPos.z - this.ctrl.root.position.z;
                if (dx * dx + dz * dz > 0.01) {
                    const angle = Math.atan2(dx, dz);
                    this.ctrl.root.rotation.y = THREE.MathUtils.lerp(this.ctrl.root.rotation.y, angle, 0.1);
                }

                this._dragTalkTimer += dt;
                if (this._dragTalkTimer >= this._nextDragTalkTime) {
                    this._dragTalkTimer = 0;
                    this._nextDragTalkTime = 1.5 + Math.random() * 2.5;
                    this._callAIR('drag_hold');
                }
            }
        }
    }
}
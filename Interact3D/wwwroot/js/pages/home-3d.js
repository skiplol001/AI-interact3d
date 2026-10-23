// ═══════════════════════════════════════════════════════════════
// home-3d.js — Interact3D Main Scene (Final Fix A-Z)
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'https://esm.sh/three@0.160.0';
import { OrbitControls } from 'https://esm.sh/three@0.160.0/addons/controls/OrbitControls.js';
import { FBXLoader } from 'https://esm.sh/three@0.160.0/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'https://esm.sh/three@0.160.0/addons/loaders/GLTFLoader.js';
import { CharacterController } from '../module/scene/character-controller.js';
import { BoxSystem } from '../module/scene/box-system.js';
import { ContextMenu } from '../module/scene/context-menu.js';
import { GrabController } from '../module/scene/grab-controller.js';
import { CameraWASD } from '../module/scene/camera-wasd.js';
import { EmotionController } from '../module/scene/emotion-controller.js?v=10';
import { createAITools } from '../module/scene/ai-command.js?v=10';
import { initAICommandUI } from '../module/scene/ai-gemini.js';
import { SpringBoneManager } from '../module/scene/spring-bone.js';
import { getPoseBox } from '../module/scene/pose-utils.js'; // ⭐ Import helper tính BBox theo pose

window.THREE = THREE;

// ⭐ CỜ QUYẾT ĐỊNH TEXTURE CỦA AIGIRL
const USE_TEXTURE_AIGIRL = true;

// ═══════════════════════════════════════════════════════════════
// 1. DOM REFS
// ═══════════════════════════════════════════════════════════════
const canvas = document.getElementById('webgl-canvas');
const hudCoords = document.getElementById('hud-coords');
const hudStatus = document.getElementById('hud-status');
const hudModelName = document.getElementById('hud-model-name');
const hudCarrying = document.getElementById('hud-carrying');
const hudBoxCount = document.getElementById('hud-box-count');
const selectModel = document.getElementById('select-model');
const btnSavePos = document.getElementById('btn-save-pos');
const btnResetPos = document.getElementById('btn-reset-pos');
const btnClearBoxes = document.getElementById('btn-clear-boxes');
const btnSpawnTest = document.getElementById('btn-spawn-test');

// ═══════════════════════════════════════════════════════════════
// 2. SCENE SETUP
// ═══════════════════════════════════════════════════════════════
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f172a);
scene.fog = new THREE.FogExp2(0x0f172a, 0.015);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 2.5, 4.5);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 0.9, 0);
controls.maxPolarAngle = Math.PI * 0.95;
controls.minPolarAngle = 0.05;
controls.minDistance = 1.0;
controls.maxDistance = 40;

const cameraWASD = new CameraWASD(camera, controls, { speed: 8, boostSpeed: 24 });

// ═══════════════════════════════════════════════════════════════
// 3. LIGHTS
// ═══════════════════════════════════════════════════════════════
scene.add(new THREE.AmbientLight(0xffffff, 1.5));
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x334155, 1.0);
hemiLight.position.set(0, 20, 0);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
dirLight.position.set(8, 15, 10);
dirLight.castShadow = true;
// ⭐ FIX SHADOW ACNE
dirLight.shadow.bias = -0.0003;
dirLight.shadow.normalBias = 0.03;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
scene.add(dirLight);

// ═══════════════════════════════════════════════════════════════
// 4. FLOOR + GRID + TRASH CAN
// ═══════════════════════════════════════════════════════════════
const floorGeo = new THREE.PlaneGeometry(80, 80);
const floorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85, metalness: 0.15 });
const floorMesh = new THREE.Mesh(floorGeo, floorMat);
floorMesh.rotation.x = -Math.PI / 2;
floorMesh.receiveShadow = true;
scene.add(floorMesh);

const gridHelper = new THREE.GridHelper(80, 80, 0x38bdf8, 0x334155);
gridHelper.position.y = 0.005;
gridHelper.material.transparent = true;
gridHelper.material.opacity = 0.4;
scene.add(gridHelper);

// ⭐ TẠO THÙNG RÁC 3D (Trash Can)
const trashCanPos = { x: 4, z: -4 };
const trashCanGeo = new THREE.CylinderGeometry(0.8, 0.6, 1.5, 32);
const trashCanMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7, metalness: 0.5 });
const trashCanMesh = new THREE.Mesh(trashCanGeo, trashCanMat);
trashCanMesh.position.set(trashCanPos.x, 0.75, trashCanPos.z);
trashCanMesh.castShadow = true;
trashCanMesh.receiveShadow = true;
scene.add(trashCanMesh);

const rimGeo = new THREE.TorusGeometry(0.8, 0.05, 16, 32);
const rimMat = new THREE.MeshStandardMaterial({ color: 0xef4444 });
const rimMesh = new THREE.Mesh(rimGeo, rimMat);
rimMesh.rotation.x = -Math.PI / 2;
rimMesh.position.set(trashCanPos.x, 1.5, trashCanPos.z);
scene.add(rimMesh);

const markerGeo = new THREE.RingGeometry(0.3, 0.45, 32);
const markerMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
const clickMarker = new THREE.Mesh(markerGeo, markerMat);
clickMarker.rotation.x = -Math.PI / 2;
clickMarker.position.y = 0.01;
clickMarker.visible = false;
scene.add(clickMarker);

// ═══════════════════════════════════════════════════════════════
// 5. TEXTURE PBR (FIXED FLIPY FOR FBX)
// ═══════════════════════════════════════════════════════════════
const textureLoader = new THREE.TextureLoader();
const baseTexPath = '/uploads/models/base/textures/';
const pbrTextures = {
    diffuse: textureLoader.load(baseTexPath + 'T_FullBody_dif.png'),
    normal: textureLoader.load(baseTexPath + 'T_FullBody_norm.png'),
    roughness: textureLoader.load(baseTexPath + 'T_FullBody_Rough.png'),
    metalness: textureLoader.load(baseTexPath + 'T_FullBody_Metal.png'),
    ao: textureLoader.load(baseTexPath + 'T_FullBody_AO.png'),
};
Object.values(pbrTextures).forEach(t => { t.flipY = false; if (t === pbrTextures.diffuse) t.colorSpace = THREE.SRGBColorSpace; });

// ⭐ Texture AIGirl (Sửa lỗi flipY)
const aiGirlTexPath = '/uploads/models/AI_test/textures/';
const AIGIRL_FLIP_Y = true; // FBX = true. Nếu vẫn ngược thì thử false

function prepTex(tex, srgb = false) {
    tex.flipY = AIGIRL_FLIP_Y;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;   // UV vượt [0,1] không bị kẹp viền
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}
const aiGirlDiffuse = prepTex(textureLoader.load(aiGirlTexPath + 'AiGirl_Diffuse.png'), true);

// ═══════════════════════════════════════════════════════════════
// 6. STATE
// ═══════════════════════════════════════════════════════════════
let currentModelId = 1;
let currentCharacter = null;
let mixer = null;
let characterCtrl = null;
let boxSystem = null;
let grabCtrl = null;
let contextMenu = null;
let springBoneMgr = new SpringBoneManager();

window.availableModels = [];

const ANIM_CLIPS = {
    idle: '/uploads/animations/idle.fbx',
    walk: '/uploads/animations/walk.fbx',
    pickup: '/uploads/animations/pickup.fbx',
    carryIdle: '/uploads/animations/carry-idle.fbx',
    carryWalk: '/uploads/animations/carry-walk.fbx',
    putdown: '/uploads/animations/putdown.fbx',
    surprise: '/uploads/animations/surprise.fbx',
    hanging: '/uploads/animations/hanging.fbx',
    falling: '/uploads/animations/falling.fbx',
    landing: '/uploads/animations/landing.fbx',
    talking: '/uploads/animations/talking.fbx',
    waving: '/uploads/animations/waving.fbx',
    laughing: '/uploads/animations/laughing.fbx',
    sadIdle: '/uploads/animations/sad-idle.fbx',
    bowing: '/uploads/animations/bowing.fbx',
    crying: '/uploads/animations/crying.fbx',
    angryGesture: '/uploads/animations/angry-gesture.fbx',
    shrugging: '/uploads/animations/shrugging.fbx',
    pointing: '/uploads/animations/pointing.fbx',
    clapping: '/uploads/animations/clapping.fbx',
    sitting: '/uploads/animations/sitting.fbx',
    'dancing-hiphop': '/uploads/animations/dancing-hiphop.fbx',
    'dancing-salsa': '/uploads/animations/dancing-salsa.fbx',
    thankful: '/uploads/animations/thankful.fbx',
    dismissing: '/uploads/animations/dismissing.fbx',
    drunk: '/uploads/animations/drunk.fbx',
    'look-around': '/uploads/animations/look-around.fbx',
    laying: '/uploads/animations/laying.fbx',
};

// ═══════════════════════════════════════════════════════════════
// 7. APPLY MATERIALS (FIXED Z-FIGHTING & ALPHA)
// ═══════════════════════════════════════════════════════════════
function applyCharacterMaterials(object, isBaseFbx = false, isAIGirl = false) {
    object.traverse((child) => {
        if (child.isSkinnedMesh) {
            child.frustumCulled = false;
            if (child.skeleton) child.skeleton.update();
        }

        if (child.isMesh || child.isSkinnedMesh) {
            child.castShadow = true;
            child.receiveShadow = true;

            if (child.geometry?.attributes?.uv && !child.geometry.attributes.uv2) {
                child.geometry.setAttribute('uv2', child.geometry.attributes.uv);
            }

            if (isBaseFbx) {
                child.material = new THREE.MeshStandardMaterial({
                    map: pbrTextures.diffuse,
                    normalMap: pbrTextures.normal,
                    roughnessMap: pbrTextures.roughness,
                    metalnessMap: pbrTextures.metalness,
                    aoMap: pbrTextures.ao,
                    aoMapIntensity: 0.8, roughness: 0.8, metalness: 0.1,
                    side: THREE.DoubleSide,
                });
            } else if (isAIGirl) {
                console.log('[AIGirl mesh]', child.name, '| mat:', child.material?.name, '| hasMap:', !!child.material?.map);
                const old = child.material;
                const hasOwnMap = old && !Array.isArray(old) && old.map;

                if (USE_TEXTURE_AIGIRL) {
                    child.material = new THREE.MeshStandardMaterial({
                        // Mesh nào FBXLoader đã tự gắn map thì giữ lại, chỉ sửa cờ
                        map: hasOwnMap ? prepTex(old.map, true) : aiGirlDiffuse,
                        roughness: 0.8, metalness: 0.1,
                        side: THREE.FrontSide,      // ⭐ Bỏ DoubleSide để hết z-fight
                        alphaTest: 0.5,            // ⭐ Tóc/lông mi có alpha thì cắt sạch
                    });
                } else {
                    child.material = new THREE.MeshStandardMaterial({ color: 0xff69b4, roughness: 0.5, metalness: 0.3, side: THREE.FrontSide });
                }
            }
        }
    });
}

// ═══════════════════════════════════════════════════════════════
// 8. SMART ANIMATION LOADER
// ═══════════════════════════════════════════════════════════════
async function loadAnimationActions(targetMixer, availableBones) {
    const fbxLoader = new FBXLoader();
    const actions = {};

    const boneSet = new Set();
    availableBones.forEach(b => {
        boneSet.add(b);
        boneSet.add(b.replace('mixamorig:', '').replace('mixamorig', ''));
    });

    for (const [name, path] of Object.entries(ANIM_CLIPS)) {
        try {
            const anim = await fbxLoader.loadAsync(path);
            if (anim.animations?.length > 0) {
                let clip = anim.animations[0];

                clip.tracks = clip.tracks.filter(track => {
                    const trackBoneName = track.name.split('.')[0];
                    return boneSet.has(trackBoneName) || trackBoneName.includes('Hips');
                });

                clip.tracks = clip.tracks.filter(track => {
                    const isPos = track.name.endsWith('.position');
                    const isHips = track.name.toLowerCase().includes('hips') || track.name.toLowerCase().includes('pelvis');
                    return !(isPos && isHips);
                });

                const action = targetMixer.clipAction(clip);
                action._mixer = targetMixer;

                const LOOP_ONCE_ANIMS = [
                    'pickup', 'putdown', 'surprise', 'landing', 'waving', 'laughing',
                    'bowing', 'crying', 'angryGesture', 'shrugging', 'pointing', 'clapping',
                    'thankful', 'dismissing', 'look-around',
                ];

                if (LOOP_ONCE_ANIMS.includes(name)) {
                    action.setLoop(THREE.LoopOnce, 1);
                    action.clampWhenFinished = true;
                } else {
                    action.setLoop(THREE.LoopRepeat, Infinity);
                }

                actions[name] = action;
            }
        } catch (err) {
            console.warn(`⚠️ [ANIM] Không load được "${name}":`, err?.message || err);
        }
    }
    return actions;
}

// ═══════════════════════════════════════════════════════════════
// 9. LOAD MODEL
// ═══════════════════════════════════════════════════════════════
function createFallbackCapsule() {
    const group = new THREE.Group();
    const geo = new THREE.CapsuleGeometry(0.4, 1.0, 4, 16);
    const mat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.3 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 0.9;
    mesh.castShadow = true;
    group.add(mesh);
    return group;
}

function loadModelFile(filePath, isBaseFbx, isAIGirl) {
    return new Promise((resolve) => {
        const ext = filePath.split('.').pop().toLowerCase();
        try {
            if (ext === 'fbx') {
                const loader = new FBXLoader();
                loader.load(
                    filePath,
                    (fbx) => {
                        applyCharacterMaterials(fbx, isBaseFbx, isAIGirl);
                        resolve(fbx);
                    },
                    undefined,
                    (err) => { console.error('Lỗi FBX:', err); resolve(createFallbackCapsule()); }
                );
            } else {
                resolve(createFallbackCapsule());
            }
        } catch (err) {
            console.error('Lỗi load:', err);
            resolve(createFallbackCapsule());
        }
    });
}

async function loadCharacterModel(modelData, savedPos = null) {
    if (currentCharacter) { scene.remove(currentCharacter); currentCharacter = null; }
    if (characterCtrl) { characterCtrl.dispose(); characterCtrl = null; }
    if (grabCtrl) { grabCtrl = null; }
    if (contextMenu) { contextMenu.dispose(); contextMenu = null; }
    if (mixer) { mixer.stopAllAction(); mixer = null; }
    springBoneMgr = new SpringBoneManager();

    currentModelId = modelData.id;
    if (hudModelName) hudModelName.innerText = modelData.name;
    if (selectModel && selectModel.value !== String(modelData.id)) selectModel.value = String(modelData.id);

    const filePath = modelData.filePath || '';
    const isBaseFbx = filePath.toLowerCase().includes('base.fbx');
    const isAIGirl = modelData.name.toLowerCase().includes('aigirl');

    const rawModel = await loadModelFile(filePath, isBaseFbx, isAIGirl);

    rawModel.rotation.set(0, 0, 0);
    rawModel.position.set(0, 0, 0);
    rawModel.updateMatrixWorld(true);

    const TARGET_HEIGHT = 1.8;
    let bbox = getPoseBox(rawModel); // ⭐ Dùng getPoseBox
    let size = new THREE.Vector3();
    bbox.getSize(size);

    if (size.y > 0.001) {
        const autoScale = TARGET_HEIGHT / size.y;
        rawModel.scale.multiplyScalar(autoScale);
        rawModel.updateMatrixWorld(true);
    }

    const rootContainer = new THREE.Group();
    rootContainer.add(rawModel);
    rootContainer.updateMatrixWorld(true);

    const availableBones = new Set();
    rawModel.traverse(n => {
        if (n.isBone) {
            availableBones.add(n.name);
            const name = n.name.toLowerCase();
            if (name.includes('hair') || name.includes('skirt') || name.includes('sleeve') || name.includes('cloth')) {
                springBoneMgr.addBone(n, {
                    stiffness: name.includes('hair') ? 0.15 : 0.25,
                    drag: 0.85, inertia: 1.0
                });
            }
        }
    });

    mixer = new THREE.AnimationMixer(rootContainer);
    const actions = await loadAnimationActions(mixer, availableBones);

    if (actions.idle) {
        actions.idle.reset();
        actions.idle.setEffectiveWeight(1);
        actions.idle.play();
        mixer.update(0.033);
    }

    rawModel.traverse((child) => {
        if (child.isSkinnedMesh && child.skeleton) {
            child.skeleton.update();
            child.frustumCulled = false;
        }
    });
    rootContainer.updateMatrixWorld(true);

    let lowestMinY = Infinity;
    if (actions.idle) {
        const idleDuration = actions.idle.getClip().duration;
        for (let i = 0; i < 8; i++) {
            actions.idle.time = (i / 8) * idleDuration;
            mixer.update(0);
            rawModel.traverse((child) => {
                if (child.isSkinnedMesh && child.skeleton) child.skeleton.update();
            });
            const frameBox = getPoseBox(rawModel); // ⭐ Dùng getPoseBox thay vì new Box3()
            if (frameBox.min.y < lowestMinY) lowestMinY = frameBox.min.y;
        }
        actions.idle.time = 0;
        mixer.update(0);
    }

    if (Number.isFinite(lowestMinY) && Math.abs(lowestMinY) > 0.001) {
        rawModel.position.y -= lowestMinY;
        rawModel.updateMatrixWorld(true);
    }

    bbox = getPoseBox(rootContainer); // ⭐ Dùng getPoseBox
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    if (Math.abs(center.x) > 0.001 || Math.abs(center.z) > 0.001) {
        rawModel.position.x -= center.x;
        rawModel.position.z -= center.z;
        rawModel.updateMatrixWorld(true);
    }

    if (savedPos) {
        // ⭐ FIX: savedPos.positionZ (không phải savedPositionZ)
        rootContainer.position.set(savedPos.positionX, 0, savedPos.positionZ);
        rootContainer.rotation.y = savedPos.rotationY ?? 0;
    }

    scene.add(rootContainer);
    currentCharacter = rootContainer;

    if (!window._cameraFitted) {
        window._cameraFitted = true;
        controls.target.set(0, 0.9, 0);
        camera.position.set(1.2, 2.5, 4.5);
        controls.update();
    }

    characterCtrl = new CharacterController(rootContainer, actions, {
        moveSpeed: 3.5, boxSize: 0.4, floorMesh: floorMesh,
        onStatusChange: (text) => { if (hudStatus) hudStatus.innerText = text; },
        onCarryChange: (box) => { if (hudCarrying) hudCarrying.innerText = box ? '📦 Có box' : '—'; },
    });
    window.characterCtrl = characterCtrl;

    const emotionCtrl = new EmotionController(characterCtrl, actions);
    window.emotionCtrl = emotionCtrl;
    window.characterActions = actions;

    grabCtrl = new GrabController(scene, camera, canvas, characterCtrl, {
        grabHeight: 2.5, minHeight: 1.8, maxHeight: 6.0,
        heightStep: 0.15, sliderStep: 0.3,
        boundRadius: 15, boundCenter: { x: 0, z: 0 }, showBoundaryRing: true,
        stiffness: 300, damping: 14, mass: 1.0,
        swingStiffness: 80, swingDamping: 4, swingInertia: 1.5,
        maxSwing: 0.25, // ⭐ FIX: Giảm MaxSwing để không bị nghiêng
        rotateSpeed: 2.0, gravity: -15, nearGroundThreshold: 0.4,
        controls: controls,
        // ⭐ CẤU HÌNH TROLL
        revengeFallThreshold: 3.5,
        trashCan: { x: trashCanPos.x, z: trashCanPos.z, radius: 1.2 },
        getFloorY: (x, z) => {
            const dx = x - trashCanPos.x;
            const dz = z - trashCanPos.z;
            if (Math.hypot(dx, dz) < 1.0) return 1.5; // Miệng thùng
            return 0;
        },
        onLand: (obj, floorY) => {
            if (floorY > 1.0) {
                if (window.showPopup) {
                    window.showPopup("Đm thằng khốn! Ném tao vào thùng rác à! 🤬", 'angry');
                    setTimeout(() => window.showPopup("Hôi vãi! Tao phải ra khỏi đây ngay! 🤢", 'verySad'), 2000);
                }
                if (window.emotionCtrl) window.emotionCtrl.trigger('angry', { force: true });
                setTimeout(() => {
                    if (obj && window.characterCtrl) {
                        obj.position.set(trashCanPos.x + 2, 0, trashCanPos.z + 2);
                        obj.visible = true;
                        if (window.showPopup) window.showPopup("May mà tao thoát được! 😤", 'normal');
                    }
                }, 3000);
            }
        }
    });
    window.grabCtrl = grabCtrl;

    contextMenu = new ContextMenu(camera, canvas, {
        characterCtrl: characterCtrl, grabCtrl: grabCtrl,
        getTarget: () => currentCharacter,
    });
    window.contextMenu = contextMenu;

    characterCtrl._playAnim('idle', 0);
    updateHud();
    console.log('✅ CharacterController + Grab + ContextMenu ready');

    try {
        window.aiTools = createAITools({ characterCtrl, boxSystem, camera, grabCtrl });
        initAICommandUI(window.aiTools);
    } catch (err) {
        console.warn('⚠️ [AI] Lỗi khởi tạo:', err.message);
    }
}

window.switchCharacterModel = async function (modelName) {
    if (!window.availableModels || window.availableModels.length === 0) return { ok: false, error: 'Chưa tải được danh sách model' };
    const target = window.availableModels.find(m => m.name.toLowerCase().includes(modelName.toLowerCase()));
    if (!target) return { ok: false, error: `Không tìm thấy model "${modelName}"` };
    console.log(`[SwitchModel] Đang đổi sang: ${target.name}`);
    await loadCharacterModel(target);
    return { ok: true, modelName: target.name };
};

// ═══════════════════════════════════════════════════════════════
// 10. BOX SYSTEM & UI
// ═══════════════════════════════════════════════════════════════
scene.userData.canvas = canvas;
boxSystem = new BoxSystem(scene, floorMesh, camera, canvas, {
    boxSize: 0.4,
    onBoxChange: (count) => { if (hudBoxCount) hudBoxCount.innerText = count; },
});

window.boxSystem = boxSystem;
window.scene = scene;
window.camera = camera;
window.controls = controls;

boxSystem.addBox(2, -1, 0xf59e0b);
boxSystem.addBox(-2, 1.5, 0x10b981);

const raycaster = new THREE.Raycaster();
function screenToNDC(e) {
    const rect = canvas.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
}

let _pointerDownPos = null;
canvas.addEventListener('pointerdown', (e) => {
    if (e.button === 0) _pointerDownPos = { x: e.clientX, y: e.clientY, time: performance.now() };
});

canvas.addEventListener('pointerup', (e) => {
    if (e.button !== 0 || !_pointerDownPos) return;
    const dist = Math.hypot(e.clientX - _pointerDownPos.x, e.clientY - _pointerDownPos.y);
    const elapsed = performance.now() - _pointerDownPos.time;
    _pointerDownPos = null;

    if (dist > 5 || elapsed > 500 || !characterCtrl || characterCtrl.isBusy() || (grabCtrl && grabCtrl.isGrabbing())) return;

    const ndc = screenToNDC(e);
    const clickedBox = boxSystem.findBoxUnderCursor(ndc);
    if (clickedBox && !clickedBox.userData.carried) {
        if (characterCtrl.carriedBox) characterCtrl.walkToDropAt(clickedBox.position.clone(), clickedBox);
        else characterCtrl.walkToPickup(clickedBox);
        clickMarker.position.set(clickedBox.position.x, 0.01, clickedBox.position.z);
        clickMarker.visible = true;
        return;
    }

    const floorPoint = boxSystem.findFloorPoint(ndc);
    if (floorPoint) {
        if (characterCtrl.carriedBox) characterCtrl.walkToDropAt(floorPoint.clone());
        else characterCtrl.goTo(floorPoint.clone());
        clickMarker.position.set(floorPoint.x, 0.01, floorPoint.z);
        clickMarker.visible = true;
    }
});

let _lastHoveredBox = null;
canvas.addEventListener('pointermove', (e) => {
    if (!characterCtrl || characterCtrl.isBusy() || (grabCtrl && grabCtrl.isGrabbing())) return;
    const ndc = screenToNDC(e);
    const box = boxSystem.findBoxUnderCursor(ndc);
    if (box !== _lastHoveredBox) {
        if (_lastHoveredBox) boxSystem.highlight(_lastHoveredBox, false);
        if (box && !box.userData.carried) boxSystem.highlight(box, true);
        _lastHoveredBox = box;
        canvas.style.cursor = box && !box.userData.carried ? 'pointer' : 'crosshair';
    }
});

document.querySelectorAll('.box-item').forEach((item) => {
    item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('box-color', item.dataset.color);
        e.dataTransfer.effectAllowed = 'copy';
        item.style.opacity = '0.5';
    });
    item.addEventListener('dragend', () => { item.style.opacity = '1'; });
});

canvas.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; canvas.style.cursor = 'copy'; });
canvas.addEventListener('dragleave', () => { canvas.style.cursor = 'crosshair'; });
canvas.addEventListener('drop', (e) => {
    e.preventDefault();
    canvas.style.cursor = 'crosshair';
    const colorHex = e.dataTransfer.getData('box-color') || '#f59e0b';
    const color = parseInt(colorHex.replace('#', '0x'), 16);
    const point = boxSystem.findFloorPoint(screenToNDC(e));
    if (point) {
        boxSystem.addBox(point.x, point.z, color);
        if (hudStatus) {
            hudStatus.innerText = '📦 Box đã được tạo!';
            setTimeout(() => { if (hudStatus) hudStatus.innerText = characterCtrl?.getStateText() || 'Đứng yên'; }, 1500);
        }
    }
});

if (btnClearBoxes) btnClearBoxes.addEventListener('click', () => {
    if (characterCtrl?.carriedBox) return alert('Đang mang box, không thể xoá hết!');
    if (confirm('Xoá tất cả box trên sàn?')) { boxSystem.clearAll(); if (hudStatus) hudStatus.innerText = 'Đã xoá hết box'; }
});

if (btnSpawnTest) btnSpawnTest.addEventListener('click', () => {
    boxSystem.spawnRandom(3, 6);
    if (hudStatus) hudStatus.innerText = '🎲 Spawn 3 box ngẫu nhiên';
    setTimeout(() => { if (hudStatus) hudStatus.innerText = characterCtrl?.getStateText() || 'Đứng yên'; }, 1500);
});

if (btnSavePos) btnSavePos.addEventListener('click', async () => {
    if (!currentCharacter) return;
    const payload = { modelId: currentModelId, positionX: currentCharacter.position.x, positionY: currentCharacter.position.y, positionZ: currentCharacter.position.z, rotationY: currentCharacter.rotation.y };
    try {
        const res = await fetch('/api/ModelApi/position', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const result = await res.json();
        if (result.success && hudStatus) {
            hudStatus.innerText = '💾 Đã lưu vị trí!';
            setTimeout(() => { hudStatus.innerText = characterCtrl?.getStateText() || 'Đứng yên'; }, 2000);
        }
    } catch (err) { console.error('Lỗi lưu vị trí:', err); }
});

if (btnResetPos) btnResetPos.addEventListener('click', () => {
    if (!currentCharacter || !characterCtrl) return;
    if (characterCtrl.carriedBox) return alert('Đang mang box, hãy đặt xuống trước!');
    characterCtrl.goTo(new THREE.Vector3(0, 0, 0));
});

if (selectModel) selectModel.addEventListener('change', async (e) => {
    const modelId = parseInt(e.target.value);
    const modelData = window.availableModels.find(m => m.id === modelId);
    if (!modelData) return;
    try {
        const posRes = await fetch(`/api/ModelApi/position/${modelId}`);
        const posJson = await posRes.json();
        await loadCharacterModel(modelData, posJson.data);
    } catch { await loadCharacterModel(modelData); }
});

// ═══════════════════════════════════════════════════════════════
// 15. FETCH MODELS
// ═══════════════════════════════════════════════════════════════
async function fetchModels() {
    try {
        const testModels = [
            { id: 1, name: 'Base Character', filePath: '/uploads/models/base/base.fbx' },
            { id: 2, name: 'AIGirl', filePath: '/uploads/models/AI_test/AIGirl.fbx' }
        ];

        window.availableModels = testModels;

        if (selectModel) {
            selectModel.innerHTML = '';
            testModels.forEach((m) => {
                const opt = document.createElement('option');
                opt.value = m.id;
                opt.innerText = m.name;
                selectModel.appendChild(opt);
            });
        }

        await loadCharacterModel(testModels[0]);

    } catch (err) {
        console.warn('Lỗi load model test:', err);
    }
}

// ═══════════════════════════════════════════════════════════════
// 16. BONG BÓNG CHAT
// ═══════════════════════════════════════════════════════════════
const charBubble = document.createElement('div');
charBubble.style.cssText = `position: absolute; background: #f8fafc; color: #0f172a; padding: 8px 14px; border-radius: 12px; font-family: 'Segoe UI', sans-serif; font-size: 14px; font-weight: 600; pointer-events: none; display: none; z-index: 1000; box-shadow: 0 4px 15px rgba(0,0,0,0.4); transform: translate(-50%, -100%); border: 2px solid #38bdf8; max-width: 250px; text-align: center; transition: opacity 0.3s ease; white-space: pre-wrap;`;
document.body.appendChild(charBubble);
let bubbleTimeout = null;

window.showCharacterMessage = (text, kind = 'normal') => {
    if (!text) return;
    const cleanText = String(text).replace(/\n+/g, ' ').trim();
    charBubble.textContent = cleanText.length > 120 ? cleanText.slice(0, 120).trim() + '…' : cleanText;
    charBubble.style.display = 'block';
    charBubble.style.opacity = '1';
    clearTimeout(bubbleTimeout);
    bubbleTimeout = setTimeout(() => {
        charBubble.style.opacity = '0';
        setTimeout(() => { charBubble.style.display = 'none'; }, 300);
    }, 4000);
};

// ═══════════════════════════════════════════════════════════════
// 17. ANIMATE LOOP
// ═══════════════════════════════════════════════════════════════
const clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.1);

    if (characterCtrl) characterCtrl.update(delta);
    if (mixer) mixer.update(delta);

    if (springBoneMgr) springBoneMgr.update(delta);

    if (boxSystem) boxSystem.update(delta);
    if (grabCtrl) grabCtrl.update(delta);
    if (cameraWASD) cameraWASD.update(delta);

    if (characterCtrl && characterCtrl.state === 'idle' && clickMarker.visible) clickMarker.visible = false;

    if (currentCharacter && hudCoords) {
        hudCoords.innerText = `${currentCharacter.position.x.toFixed(2)}, ${currentCharacter.position.z.toFixed(2)}`;
    }

    if (hudCarrying && characterCtrl) hudCarrying.innerText = characterCtrl.carriedBox ? '📦 Có box' : '—';

    controls.update();

    if (currentCharacter && charBubble.style.display !== 'none' && charBubble.style.opacity !== '0') {
        const pos = currentCharacter.position.clone(); pos.y += 2.0; pos.project(camera);
        const x = (pos.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-pos.y * 0.5 + 0.5) * window.innerHeight;
        charBubble.style.left = `${x}px`; charBubble.style.top = `${y}px`;
        if (pos.z > 1) charBubble.style.display = 'none';
        else if (charBubble.style.opacity !== '0') charBubble.style.display = 'block';
    }

    renderer.render(scene, camera);
}
animate();

function updateHud() {
    if (!currentCharacter || !hudCoords) return;
    hudCoords.innerText = `${currentCharacter.position.x.toFixed(2)}, ${currentCharacter.position.z.toFixed(2)}`;
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

fetchModels();
console.log('🚀 Interact3D Scene initialized (Final Fix A-Z)');
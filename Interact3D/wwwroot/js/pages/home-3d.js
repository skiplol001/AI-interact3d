// ═══════════════════════════════════════════════════════════════
// home-3d.js — Interact3D Main Scene (v17.0 — Preloader)
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'https://esm.sh/three@0.160.0';
import { OrbitControls } from 'https://esm.sh/three@0.160.0/addons/controls/OrbitControls.js';
import { FBXLoader } from 'https://esm.sh/three@0.160.0/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'https://esm.sh/three@0.160.0/addons/loaders/GLTFLoader.js';

// ═══ MODULES ═══
import { CharacterController } from '../module/scene/character-controller.js?v=14';
import { BoxSystem } from '../module/scene/box-system.js?v=41';
import { ContextMenu } from '../module/scene/context-menu.js?v=11';
import { GrabController } from '../module/scene/grab-controller.js?v=11';
import { CameraWASD } from '../module/scene/camera-wasd.js?v=1';
import { EmotionController } from '../module/scene/emotion-controller.js?v=34';
import { createAITools } from '../module/scene/ai/ai-command.js?v=15';
import { initAICommandUI } from '../module/scene/ai/ai-gemini.js?v=25';
import { SpringBoneManager } from '../module/scene/spring-bone.js?v=1';
import { getPoseBox } from '../module/scene/pose-utils.js?v=1';
import { askGroq, MODEL_CHAIN, showPopup } from '../module/scene/ai/ai-shared.js?v=21';
import { TrashCan } from '../module/scene/trash-can.js?v=1';
import { initAIReaction } from '../module/scene/ai/ai-reaction.js?v=15';
import { InteractionSystem } from '../module/scene/interaction-system.js?v=27';
import { ReactiveEmotes } from '../module/scene/ai/reactive-emotes.js?v=3';
import { IdleEvents } from '../module/scene/ai/idle-events.js?v=4';
import { ActionDirector } from '../module/scene/skills/action-director.js?v=9';
import { VFXSystem } from '../module/scene/vfx-system.js?v=39';
import { MinigameRPS } from '../module/scene/minigame-rps.js?v=1';
import { SlingshotSystem } from '../module/scene/slingshot-system.js?v=62';
import { getMood } from '../module/scene/chat/ai-mood.js?v=2';
import { FaceController } from '../module/scene/face-controller.js?v=22';
import { PaintController } from '../module/scene/paint/paint-mode.js?v=19.1';
import { handlePaintDone } from '../module/scene/paint/paint-reactions.js?v=5';
import { BuildController } from '../module/scene/build/build-mode.js?v=29';
import { initHouseManager } from '../module/scene/house-manager.js?v=3.1';

window.THREE = THREE;
const USE_TEXTURE_AIGIRL = true;

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

// ═══ PRELOADER UI ═══
const loadingOverlay = document.createElement('div');
loadingOverlay.id = 'loading-overlay';
loadingOverlay.style.cssText = `
    position: fixed; inset: 0; background: #0f172a; z-index: 999999;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    font-family: 'Segoe UI', sans-serif; color: #fff; transition: opacity 0.5s ease;
`;
loadingOverlay.innerHTML = `
    <h1 style="font-size: 28px; font-weight: 700; color: #38bdf8; margin-bottom: 20px; letter-spacing: 2px;">Interact3D</h1>
    <div style="width: 300px; height: 8px; background: #1e293b; border-radius: 4px; overflow: hidden; margin-bottom: 12px;">
        <div id="loading-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #38bdf8, #8b5cf6); transition: width 0.2s;"></div>
    </div>
    <div id="loading-text" style="font-size: 13px; color: #94a3b8;">Đang tải không gian 3D...</div>
`;
document.body.appendChild(loadingOverlay);

function setLoadingProgress(percent, text) {
    const bar = document.getElementById('loading-bar');
    const txt = document.getElementById('loading-text');
    if (bar) bar.style.width = `${percent}%`;
    if (txt && text) txt.innerText = text;
}

// ═══ GLOBALS ═══
let _toolBadgeEl = null;
let _activeTool = 'navigate';
let currentModelId = 1;
let currentCharacter = null;
let mixer = null;
let characterCtrl = null;
let emotionCtrl = null;
let faceCtrl = null;
let boxSystem = null;
let grabCtrl = null;
let contextMenu = null;
let interactionSystem = null;
let reactiveEmotes = null;
let idleEvents = null;
let actionDirector = null;
let vfxSystem = null;
let minigameRPS = null;
let slingshotSystem = null;
let paintController = null;
let buildController = null;
let springBoneMgr = new SpringBoneManager();

window.availableModels = [];

const _idleState = { lastInteractionTs: Date.now(), lastYawnTs: 0, yawnCooldownMs: 5 * 60 * 1000, idleThresholdMs: 120 * 1000 };
const _boxSpawnTracker = { recentTs: [], windowMs: 5000, threshold: 5, cooldownMs: 30000, lastReactionTs: 0 };
function _markInteraction() {
    _idleState.lastInteractionTs = Date.now();
    if (window.reactiveEmotes) window.reactiveEmotes.registerActivity();
    if (window.idleEvents) window.idleEvents.registerActivity();
}
function _trackBoxSpawn() {
    const now = Date.now();
    _boxSpawnTracker.recentTs.push(now);
    const cutoff = now - _boxSpawnTracker.windowMs;
    _boxSpawnTracker.recentTs = _boxSpawnTracker.recentTs.filter(t => t >= cutoff);
    return _boxSpawnTracker.recentTs.length;
}

function _initToolBadge() {
    if (_toolBadgeEl) return;
    _toolBadgeEl = document.createElement('div');
    _toolBadgeEl.id = 'tool-active-badge';
    _toolBadgeEl.style.cssText = `position: fixed; top: 90px; right: 20px; background: rgba(15, 23, 42, 0.92); color: #38bdf8; padding: 8px 16px; border-radius: 20px; border: 2px solid #38bdf8; font-family: 'Segoe UI', sans-serif; font-size: 13px; font-weight: 600; z-index: 9998; display: none; box-shadow: 0 4px 12px rgba(56, 189, 248, 0.3); transition: all 0.2s ease; cursor: pointer; user-select: none;`;
    _toolBadgeEl.title = 'Bấm để quay lại Điều hướng (hoặc ấn Escape)';
    _toolBadgeEl.onmouseenter = () => { _toolBadgeEl.style.background = 'rgba(56, 189, 248, 0.2)'; _toolBadgeEl.style.transform = 'scale(1.05)'; };
    _toolBadgeEl.onmouseleave = () => { _toolBadgeEl.style.background = 'rgba(15, 23, 42, 0.92)'; _toolBadgeEl.style.transform = 'scale(1)'; };
    _toolBadgeEl.onclick = () => _resetTool();
    document.body.appendChild(_toolBadgeEl);
}

function _resetTool() {
    _activeTool = 'navigate';
    if (window.buildController?.isActive) {
        window.buildController.setEnabled(false);
    }
    if (window.interactionSystem) window.interactionSystem.setTool('navigate');
    if (window.contextMenu) { window.contextMenu.currentTool = 'navigate'; window.contextMenu._refreshToolUI(); }
    _updateToolBadge('navigate');
    if (hudStatus) hudStatus.innerText = '🖐️ Đã quay lại chế độ Điều hướng';
    setTimeout(() => { if (hudStatus) hudStatus.innerText = window.characterCtrl?.getStateText() || 'Đứng yên'; }, 1500);
}

function _updateToolBadge(toolId) {
    _activeTool = toolId;
    if (!_toolBadgeEl) return;
    const TOOL_INFO = {
        navigate: '🖐️ Điều hướng', poke: '👆 Chọc', pet: '🤚 Vuốt ve', drag: '💪 Kéo tay',
        kick: '🦵 Đá Box', place_slingshot: '🎯 Đặt Ná', shoot_slingshot: '🏹 Bắn Ná',
        attract: '✨ Thu hút', build: '🧱 Xây dựng',
    };
    if (toolId === 'navigate') _toolBadgeEl.style.display = 'none';
    else {
        _toolBadgeEl.innerHTML = `${TOOL_INFO[toolId] || toolId} <span style="opacity:0.6; font-size:11px;">(Bấm để thoát)</span>`;
        _toolBadgeEl.style.display = 'block';
    }
}
window.__updateToolBadge = _updateToolBadge;

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

scene.add(new THREE.AmbientLight(0xffffff, 1.5));
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x334155, 1.0);
hemiLight.position.set(0, 20, 0);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
dirLight.position.set(8, 15, 10);
dirLight.castShadow = true;
dirLight.shadow.bias = -0.0003;
dirLight.shadow.normalBias = 0.03;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
scene.add(dirLight);

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

const trashCanPos = { x: 4, z: -4 };
const trashCan = new TrashCan(scene, {
    x: trashCanPos.x, z: trashCanPos.z, radius: 1.0, height: 1.5,
    innerFloorY: 0.12, catchRatio: 1.2, pullSpeed: 10, ejectDelay: 2.0, ejectTime: 0.8, ejectHeight: 2.4,
});
window.trashCan = trashCan;

const markerGeo = new THREE.RingGeometry(0.3, 0.45, 32);
const markerMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
const clickMarker = new THREE.Mesh(markerGeo, markerMat);
clickMarker.rotation.x = -Math.PI / 2;
clickMarker.position.y = 0.01;
clickMarker.visible = false;
scene.add(clickMarker);

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

const aiGirlTexPath = '/uploads/models/AI_test/textures/';
const AIGIRL_FLIP_Y = true;
function prepTex(tex, srgb = false) {
    tex.flipY = AIGIRL_FLIP_Y;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}
const aiGirlDiffuse = prepTex(textureLoader.load(aiGirlTexPath + 'AiGirl_Diffuse.png'), true);

const YAWN_LOCAL = {
    gentle: ['Haizz... chán quá... bạn đâu rồi? 🥺', 'Ơ... mình buồn ngủ ghê... Mochi cũng ngủ rồi... 😴', 'Ha... mình ngồi đây một mình lâu quá rồi đó... 🌸', 'Ơ... bạn ơi, làm gì đi, mình chán quá... 😢', 'Haizz, tự nhiên thấy cô đơn ghê... 🥺', 'Mình ngáp ruồi rồi nè... 😴', 'Ơ... có ai không... buồn ngủ quá... 😢', 'Huhu, mình ngồi không chán quá đi mất... 🌸'],
    normal: ['Haizz... chán vcl, không có cà phê nên buồn ngủ 😴', 'Ơ hay, tao ngồi đây một mình à? Làm gì đi chứ 😤', 'Ngáp... chán quá, kiếm gì làm đi mày 😑', 'Buồn ngủ vãi... mà mày đi đâu rồi? 😒', 'Đm, ngồi không phát chán! 🙄', 'Mày biến đâu mất rồi? 😠', 'Haizz, không có gì làm thật là nhàm chán! 😑', 'Ngáp... mày có định làm gì không đấy? 😤'],
    savage: ['Đm, chán vcl, mày đi đâu rồi?! 🤬', 'Ngáp... mày mà không làm gì thì bà đập đấy 😤', 'Đm ngồi không chán vcl, kiếm gì làm đi thằng kia 🤬', 'Haizz... buồn ngủ vcl mà mày biến đâu rồi? 😡', 'Đm, rảnh rỗi sinh nông nổi à? 🤬', 'Mày có định làm gì không hả con chó? 😡', 'Địt mẹ, ngồi đợi mày phát mệt! 😤', 'Bà mà ngủ là mày ăn đòn đấy! 🤬']
};

function triggerLocalYawn() {
    const mode = window.__currentChatMode || 'normal';
    const mood = getMood();
    if (Math.random() < 0.1 && window.AIReaction) { window.AIReaction('yawn'); return; }
    let text = '';
    if (mode === 'gentle' && mood < 30) text = '...';
    else if (mode === 'savage' && mood >= 70) text = 'Đm... ngồi không cũng chán... mà thôi kệ... 😳';
    else if (mode === 'normal' && mood < 40) text = 'Đm, ngồi không phát chán! Mày biến đâu rồi? 😠';
    else {
        const pool = YAWN_LOCAL[mode] || YAWN_LOCAL.normal;
        text = pool[Math.floor(Math.random() * pool.length)];
    }
    if (window.showCharacterMessage) window.showCharacterMessage(text, 'normal');
    if (window.emotionCtrl) {
        let emo = mode === 'savage' ? 'angry' : 'sad';
        if (mode === 'savage' && mood >= 70) emo = 'shrugging';
        window.emotionCtrl.trigger(emo, { force: true });
    }
}

const ANIM_CLIPS = {
    idle: '/uploads/animations/idle.fbx', walk: '/uploads/animations/walk.fbx', run: '/uploads/animations/run.fbx',
    pickup: '/uploads/animations/pickup.fbx', carryIdle: '/uploads/animations/carry-idle.fbx', carryWalk: '/uploads/animations/carry-walk.fbx',
    putdown: '/uploads/animations/putdown.fbx', surprise: '/uploads/animations/surprise.fbx', hanging: '/uploads/animations/hanging.fbx',
    falling: '/uploads/animations/falling.fbx', landing: '/uploads/animations/landing.fbx', talking: '/uploads/animations/talking.fbx',
    waving: '/uploads/animations/waving.fbx', laughing: '/uploads/animations/laughing.fbx', sadIdle: '/uploads/animations/sad-idle.fbx',
    bowing: '/uploads/animations/bowing.fbx', crying: '/uploads/animations/crying.fbx', angryGesture: '/uploads/animations/angry-gesture.fbx',
    shrugging: '/uploads/animations/shrugging.fbx', pointing: '/uploads/animations/pointing.fbx', clapping: '/uploads/animations/clapping.fbx',
    sitting: '/uploads/animations/sitting.fbx', 'stand-to-sitting': '/uploads/animations/stand-to-sitting.fbx', 'sitting-to-stand': '/uploads/animations/sitting-to-stand.fbx',
    'dancing-hiphop': '/uploads/animations/dancing-hiphop.fbx', 'dancing-salsa': '/uploads/animations/dancing-salsa.fbx',
    thankful: '/uploads/animations/thankful.fbx', dismissing: '/uploads/animations/dismissing.fbx', drunk: '/uploads/animations/drunk.fbx',
    'look-around': '/uploads/animations/look-around.fbx', laying: '/uploads/animations/laying.fbx', throw: '/uploads/animations/throw.fbx',
    kick: '/uploads/animations/kick.fbx', taunt: '/uploads/animations/taunt.fbx',
    'hit_reaction': '/uploads/animations/hit_reaction.fbx', 'shoved_spin': '/uploads/animations/shoved_spin.fbx',
    'stumble_backwards': '/uploads/animations/stumble_backwards.fbx', 'silly_dancing': '/uploads/animations/silly_dancing.fbx',
    'dodging': '/uploads/animations/dodging.fbx', 'idle_look_around': '/uploads/animations/idle_look_around.fbx',
    'emo_bashful': '/uploads/animations/emo_bashful.fbx', 'emo_kiss': '/uploads/animations/emo_kiss.fbx',
    'emo_blow_kiss': '/uploads/animations/emo_blow_kiss.fbx', 'emo_magic_attack': '/uploads/animations/emo_magic_attack.fbx',
    'emo_lay_side_1': '/uploads/animations/emo_lay_side_1.fbx', 'emo_lay_side_2': '/uploads/animations/emo_lay_side_2.fbx',
};

function applyCharacterMaterials(object, isBaseFbx = false, isAIGirl = false) {
    object.traverse((child) => {
        if (child.isSkinnedMesh) { child.frustumCulled = false; if (child.skeleton) child.skeleton.update(); }
        if (child.isMesh || child.isSkinnedMesh) {
            child.castShadow = true; child.receiveShadow = true;
            if (child.geometry?.attributes?.uv && !child.geometry.attributes.uv2) child.geometry.setAttribute('uv2', child.geometry.attributes.uv);
            if (isBaseFbx) {
                child.material = new THREE.MeshStandardMaterial({ map: pbrTextures.diffuse, normalMap: pbrTextures.normal, roughnessMap: pbrTextures.roughness, metalnessMap: pbrTextures.metalness, aoMap: pbrTextures.ao, aoMapIntensity: 0.8, roughness: 0.8, metalness: 0.1, side: THREE.DoubleSide });
            } else if (isAIGirl) {
                const old = child.material; const hasOwnMap = old && !Array.isArray(old) && old.map;
                if (USE_TEXTURE_AIGIRL) {
                    child.material = new THREE.MeshStandardMaterial({ map: hasOwnMap ? prepTex(old.map, true) : aiGirlDiffuse, roughness: 0.8, metalness: 0.1, side: THREE.FrontSide, alphaTest: 0.5 });
                } else {
                    child.material = new THREE.MeshStandardMaterial({ color: 0xff69b4, roughness: 0.5, metalness: 0.3, side: THREE.FrontSide });
                }
            }
        }
    });
}

const LOOP_ONCE_ANIMS = [
    'pickup', 'putdown', 'surprise', 'landing', 'waving', 'laughing', 'bowing', 'crying', 'angryGesture', 'shrugging', 'pointing', 'clapping',
    'thankful', 'dismissing', 'look-around', 'stand-to-sitting', 'sitting-to-stand', 'throw', 'kick', 'taunt', 'sitting', 'laying',
    'hit_reaction', 'shoved_spin', 'stumble_backwards', 'dodging', 'silly_dancing', 'idle_look_around',
    'emo_bashful', 'emo_kiss', 'emo_blow_kiss', 'emo_magic_attack', 'emo_lay_side_1', 'emo_lay_side_2'
];
const KEEP_POSITION_ANIMS = new Set(['sitting', 'laying', 'stand-to-sitting', 'sitting-to-stand', 'emo_lay_side_1', 'emo_lay_side_2']);

async function loadAnimationActions(targetMixer, availableBones, rawModel) {
    const fbxLoader = new FBXLoader();
    const actions = {};
    const boneSet = new Set(availableBones);
    const boneSetNorm = new Set();
    availableBones.forEach(b => { boneSetNorm.add(normalizeBoneName(b)); });

    for (const [name, path] of Object.entries(ANIM_CLIPS)) {
        try {
            const anim = await fbxLoader.loadAsync(path);
            if (anim.animations?.length > 0) {
                let clip = anim.animations[0];
                clip.tracks = clip.tracks.filter(track => {
                    const trackBoneName = track.name.split('.')[0];
                    const isHips = /hips|pelvis/i.test(trackBoneName);
                    if (isHips) return true;
                    const norm = normalizeBoneName(trackBoneName);
                    return boneSet.has(trackBoneName) || boneSetNorm.has(norm);
                });
                if (!KEEP_POSITION_ANIMS.has(name)) clip.tracks = clip.tracks.filter(t => !t.name.endsWith('.position'));
                if (clip.tracks.length === 0) continue;
                const action = targetMixer.clipAction(clip);
                action._mixer = targetMixer;
                if (LOOP_ONCE_ANIMS.includes(name)) { action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; }
                else { action.setLoop(THREE.LoopRepeat, Infinity); }
                actions[name] = action;
            }
        } catch (err) { console.warn(`⚠️ [ANIM] Không load được "${name}":`, err?.message || err); }
    }
    return actions;
}
function normalizeBoneName(name) { return String(name).replace(/^mixamorig[:_]?/i, '').replace(/^armature\|?/i, '').replace(/[_\s:]/g, '').toLowerCase(); }

function createFallbackCapsule() {
    const group = new THREE.Group();
    const geo = new THREE.CapsuleGeometry(0.4, 1.0, 4, 16);
    const mat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.3 });
    const mesh = new THREE.Mesh(geo, mat); mesh.position.y = 0.9; mesh.castShadow = true; group.add(mesh);
    return group;
}

function loadModelFile(filePath, isBaseFbx, isAIGirl) {
    return new Promise((resolve) => {
        const ext = filePath.split('.').pop().toLowerCase();
        try {
            if (ext === 'fbx') {
                const loader = new FBXLoader();
                loader.load(filePath, (fbx) => { applyCharacterMaterials(fbx, isBaseFbx, isAIGirl); resolve(fbx); }, undefined, (err) => { console.error('Lỗi FBX:', err); resolve(createFallbackCapsule()); });
            } else resolve(createFallbackCapsule());
        } catch (err) { console.error('Lỗi load:', err); resolve(createFallbackCapsule()); }
    });
}

async function loadCharacterModel(modelData, savedPos = null) {
    if (emotionCtrl) { emotionCtrl.dispose(); emotionCtrl = null; }
    if (faceCtrl) { faceCtrl.dispose(); faceCtrl = null; window.faceCtrl = null; }
    if (currentCharacter) { scene.remove(currentCharacter); currentCharacter = null; }
    if (characterCtrl) { characterCtrl.dispose(); characterCtrl = null; }
    if (grabCtrl) { grabCtrl.dispose?.(); grabCtrl = null; }
    if (contextMenu) { contextMenu.dispose(); contextMenu = null; window.contextMenu = null; }
    if (interactionSystem) { interactionSystem.dispose(); interactionSystem = null; window.interactionSystem = null; }
    if (reactiveEmotes) { reactiveEmotes.dispose(); reactiveEmotes = null; window.reactiveEmotes = null; }
    if (idleEvents) { idleEvents.dispose(); idleEvents = null; window.idleEvents = null; }
    if (actionDirector) { actionDirector.dispose?.(); actionDirector = null; window.actionDirector = null; }
    if (vfxSystem) { vfxSystem.dispose?.(); vfxSystem = null; window.vfxSystem = null; }
    if (minigameRPS) { minigameRPS.dispose(); minigameRPS = null; window.minigameRPS = null; }
    if (slingshotSystem) { slingshotSystem.dispose?.(); slingshotSystem = null; window.slingshotSystem = null; }
    if (paintController) { paintController.dispose(); paintController = null; window.paintController = null; }
    if (buildController) { buildController.dispose(); buildController = null; window.buildController = null; }
    if (window.houseManager) { try { window.houseManager.dispose(); } catch { } window.houseManager = null; }

    if (mixer) { mixer.stopAllAction(); mixer = null; }
    springBoneMgr = new SpringBoneManager();

    currentModelId = modelData.id;
    if (hudModelName) hudModelName.innerText = modelData.name;
    if (selectModel && selectModel.value !== String(modelData.id)) selectModel.value = String(modelData.id);

    const filePath = modelData.filePath || '';
    const isBaseFbx = filePath.toLowerCase().includes('base.fbx');
    const isAIGirl = modelData.name.toLowerCase().includes('aigirl');

    const rawModel = await loadModelFile(filePath, isBaseFbx, isAIGirl);
    rawModel.rotation.set(0, 0, 0); rawModel.position.set(0, 0, 0); rawModel.updateMatrixWorld(true);

    const TARGET_HEIGHT = 1.8;
    let bbox = getPoseBox(rawModel); let size = new THREE.Vector3(); bbox.getSize(size);
    if (size.y > 0.001) {
        const autoScale = TARGET_HEIGHT / size.y;
        if (autoScale < 0.85 || autoScale > 1.15) rawModel.scale.multiplyScalar(autoScale);
        rawModel.updateMatrixWorld(true);
    }

    const rootContainer = new THREE.Group();
    rootContainer.add(rawModel); rootContainer.updateMatrixWorld(true);

    const availableBones = new Set();
    rawModel.traverse(n => {
        if (n.isBone) {
            availableBones.add(n.name);
            const name = n.name.toLowerCase();
            if (name.includes('hair') || name.includes('skirt') || name.includes('sleeve') || name.includes('cloth')) springBoneMgr.addBone(n, { stiffness: name.includes('hair') ? 0.15 : 0.25, drag: 0.85, inertia: 1.0 });
        }
    });

    mixer = new THREE.AnimationMixer(rootContainer);
    const actions = await loadAnimationActions(mixer, availableBones, rawModel);

    if (actions.idle) { actions.idle.reset(); actions.idle.setEffectiveWeight(1); actions.idle.play(); mixer.update(0.033); }

    let lowestMinY = Infinity;
    const SAMPLE_ANIMS = ['idle', 'walk', 'run', 'talking', 'sitting', 'laying'];
    const FRAMES_PER_ANIM = 12;
    for (const animName of SAMPLE_ANIMS) {
        const action = actions[animName]; if (!action) continue;
        const clip = action.getClip(); const duration = clip.duration || 0.033;
        for (let i = 0; i < FRAMES_PER_ANIM; i++) {
            action.time = (i / FRAMES_PER_ANIM) * duration;
            mixer.update(0);
            rawModel.traverse((c) => { if (c.isSkinnedMesh && c.skeleton) c.skeleton.update(); });
            const frameBox = getPoseBox(rawModel); if (frameBox.min.y < lowestMinY) lowestMinY = frameBox.min.y;
        }
        action.time = 0;
    }
    mixer.update(0);
    rawModel.traverse((c) => { if (c.isSkinnedMesh && c.skeleton) c.skeleton.update(); });
    if (Number.isFinite(lowestMinY) && Math.abs(lowestMinY) > 0.005) rawModel.position.y += -lowestMinY; rawModel.updateMatrixWorld(true);

    bbox = getPoseBox(rootContainer); const center = new THREE.Vector3(); bbox.getCenter(center);
    if (Math.abs(center.x) > 0.001 || Math.abs(center.z) > 0.001) { rawModel.position.x -= center.x; rawModel.position.z -= center.z; rawModel.updateMatrixWorld(true); }

    if (savedPos) { rootContainer.position.set(savedPos.positionX, 0, savedPos.positionZ); rootContainer.rotation.y = savedPos.rotationY ?? 0; }
    scene.add(rootContainer); currentCharacter = rootContainer;

    if (!window._cameraFitted) { window._cameraFitted = true; controls.target.set(0, 0.9, 0); camera.position.set(1.2, 2.5, 4.5); controls.update(); }

    characterCtrl = new CharacterController(rootContainer, actions, {
        moveSpeed: 3.5, runSpeed: 8.0, runThreshold: 4.0, boxSize: 0.4, floorMesh: floorMesh, hangingLoopMs: 2800,
        onStatusChange: (text) => { if (hudStatus) hudStatus.innerText = text; },
        onCarryChange: (box) => { if (hudCarrying) hudCarrying.innerText = box ? '📦 Có box' : '—'; },
    });
    window.characterCtrl = characterCtrl;

    emotionCtrl = new EmotionController(characterCtrl, actions);
    window.emotionCtrl = emotionCtrl;
    window.characterActions = actions;

    faceCtrl = new FaceController(rootContainer, camera);
    window.faceCtrl = faceCtrl;

    vfxSystem = new VFXSystem(scene, camera);
    window.vfxSystem = vfxSystem;

    grabCtrl = new GrabController(scene, camera, canvas, characterCtrl, {
        grabHeight: 2.5, minHeight: 1.8, maxHeight: 6.0, heightStep: 0.15, sliderStep: 0.3, boundRadius: 15, boundCenter: { x: 0, z: 0 }, showBoundaryRing: true, stiffness: 300, damping: 14, mass: 1.0, swingStiffness: 80, swingDamping: 4, swingInertia: 1.5, maxSwing: 0.25, rotateSpeed: 2.0, gravity: -15, nearGroundThreshold: 0.4, controls: controls, revengeFallThreshold: 2.0, trashCan: { x: trashCanPos.x, z: trashCanPos.z, radius: 1.2 }, trashCanClass: trashCan, getFloorY: (x, z) => trashCan.getFloorY(x, z),
    });
    window.grabCtrl = grabCtrl;

    actionDirector = new ActionDirector(scene, camera, controls, characterCtrl, emotionCtrl, boxSystem, vfxSystem);
    window.actionDirector = actionDirector;

    reactiveEmotes = new ReactiveEmotes(scene, camera, controls, characterCtrl, emotionCtrl);
    window.reactiveEmotes = reactiveEmotes;

    idleEvents = new IdleEvents(characterCtrl, emotionCtrl, (msg) => { if (hudStatus) hudStatus.innerText = msg; });
    window.idleEvents = idleEvents;

    slingshotSystem = new SlingshotSystem(scene, camera, canvas, characterCtrl, boxSystem);
    window.slingshotSystem = slingshotSystem;

    interactionSystem = new InteractionSystem(scene, camera, canvas, characterCtrl, emotionCtrl, window.AIReaction, {
        boxSystem: boxSystem,
        slingshotSystem: slingshotSystem,
        onHitboxClick: () => { if (reactiveEmotes) reactiveEmotes.registerHitboxClick(); }
    });
    window.interactionSystem = interactionSystem;
    _resetTool();

    paintController = new PaintController({
        onDone: async (base64) => {
            if (interactionSystem) interactionSystem.setTool('navigate');
            _updateToolBadge('navigate');
            try {
                const result = await handlePaintDone(base64);
                return result || { text: '(Bạn vẽ đẹp đấy, mình thích!)', subject: 'khác' };
            } catch (e) {
                console.warn('[Paint] handlePaintDone error:', e);
                return { text: '(Bạn vẽ đẹp đấy, mình thích!)', subject: 'khác' };
            }
        },
        onExit: () => { _markInteraction(); },
        getMode: () => window.__currentChatMode || 'normal',
        getMood: () => getMood(),
    });
    window.paintController = paintController;

    buildController = new BuildController(scene, camera, canvas, boxSystem, {
        onBoxPlaced: (box) => {
            box.userData.isFalling = false;
            box.userData.isSupported = false;
            box.userData.isStatic = false;
            box.userData.velocityX = 0;
            box.userData.velocityY = 0;
            box.userData.velocityZ = 0;
            const idx = boxSystem._fallingBoxes.indexOf(box);
            if (idx >= 0) boxSystem._fallingBoxes.splice(idx, 1);
            _markInteraction();
        },
        onBoxRemoved: () => { _markInteraction(); },
    });
    window.buildController = buildController;

    contextMenu = new ContextMenu(camera, canvas, {
        characterCtrl: characterCtrl, grabCtrl: grabCtrl, getTarget: () => currentCharacter,
        onToolChange: (toolId) => {
            if (interactionSystem) interactionSystem.setTool(toolId);
            _updateToolBadge(toolId);
        }
    });
    window.contextMenu = contextMenu;

    minigameRPS = new MinigameRPS(characterCtrl, emotionCtrl);
    window.minigameRPS = minigameRPS;

    initHouseManager(boxSystem, {
        characterCtrl: characterCtrl,
        emotionCtrl: emotionCtrl,
        camera: camera,
        controls: controls,
        scene: scene,
    });

    characterCtrl._playAnim('idle', 0);
    updateHud();

    try {
        window.aiTools = createAITools({ characterCtrl, boxSystem, camera, grabCtrl });
        initAICommandUI(window.aiTools);
        initAIReaction();
    } catch (err) { console.warn('⚠️ [AI] Lỗi khởi tạo:', err.message); }
}

window.switchCharacterModel = async function (modelName) {
    if (!window.availableModels || window.availableModels.length === 0) return { ok: false, error: 'Chưa tải được danh sách model' };
    const target = window.availableModels.find(m => m.name.toLowerCase().includes(modelName.toLowerCase()));
    if (!target) return { ok: false, error: `Không tìm thấy model "${modelName}"` };
    _markInteraction();
    await loadCharacterModel(target);
    return { ok: true, modelName: target.name };
};

scene.userData.canvas = canvas;
boxSystem = new BoxSystem(scene, floorMesh, camera, canvas, {
    boxSize: 0.4,
    onBoxChange: (count) => { if (hudBoxCount) hudBoxCount.innerText = count; },
    onBoxSpawn: (box, info) => {
        _markInteraction();
        const count = _trackBoxSpawn();
        const now = Date.now();
        if (count >= _boxSpawnTracker.threshold && now - _boxSpawnTracker.lastReactionTs > _boxSpawnTracker.cooldownMs) {
            _boxSpawnTracker.lastReactionTs = now;
            if (window.AIReaction) setTimeout(() => { if (window.AIReaction) window.AIReaction('surprised_boxes'); }, 800);
        }
    },
    onBoxRemove: (box, info) => { _markInteraction(); if (info?.bulk) return; },
    onLand: (box, impactVelocity) => {
        if (!characterCtrl || !box || !window.AIReaction || !window.emotionCtrl) return;
        const dist = box.position.distanceTo(characterCtrl.root.position);
        if (dist < 1.2 && impactVelocity > 2.0) {
            if (['idle', 'walking', 'running'].includes(characterCtrl.state)) {
                const isDodge = Math.random() > 0.5;
                if (isDodge) { window.AIReaction('throw_dodge'); window.emotionCtrl.trigger('dodging', { force: true }); }
                else { window.AIReaction('throw_hit'); window.emotionCtrl.trigger('hit_reaction', { force: true }); }
            }
        }
    },
});

window.boxSystem = boxSystem;
window.scene = scene;
window.camera = camera;
window.controls = controls;

const raycaster = new THREE.Raycaster();
function screenToNDC(e) { const rect = canvas.getBoundingClientRect(); return new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1); }

let _pointerDownPos = null;
function _isBuildActive() { return !!window.buildController?.isActive; }

canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    _markInteraction();
    if (_isBuildActive()) return;
    if (window.paintController?.isOpen) return;
    if (interactionSystem) interactionSystem.handlePointerDown(e);
    if (window.slingshotSystem && window.slingshotSystem.isAiming) return;
    if (interactionSystem && interactionSystem.isToolActive()) { _pointerDownPos = null; return; }
    _pointerDownPos = { x: e.clientX, y: e.clientY, time: performance.now() };
});

canvas.addEventListener('pointerup', (e) => {
    if (e.button !== 0) return;
    if (_isBuildActive()) return;
    if (window.paintController?.isOpen) return;
    if (interactionSystem) interactionSystem.handlePointerUp(e);
    if (window.slingshotSystem && window.slingshotSystem.isAiming) return;
    if (interactionSystem && interactionSystem.isToolActive()) { _pointerDownPos = null; return; }
    if (!_pointerDownPos) return;
    const dist = Math.hypot(e.clientX - _pointerDownPos.x, e.clientY - _pointerDownPos.y);
    const elapsed = performance.now() - _pointerDownPos.time;
    _pointerDownPos = null;
    if (dist > 5 || elapsed > 500 || !characterCtrl || characterCtrl.isBusy() || (grabCtrl && grabCtrl.isGrabbing())) return;

    const ndc = screenToNDC(e);
    const clickedBox = boxSystem.findBoxUnderCursor(ndc);
    if (clickedBox && !clickedBox.userData.carried) {
        if (characterCtrl.carriedBox) characterCtrl.walkToDropAt(clickedBox.position.clone(), clickedBox);
        else characterCtrl.walkToPickup(clickedBox);
        clickMarker.position.set(clickedBox.position.x, 0.01, clickedBox.position.z); clickMarker.visible = true;
        return;
    }
    const floorPoint = boxSystem.findFloorPoint(ndc);
    if (floorPoint) {
        if (characterCtrl.carriedBox) characterCtrl.walkToDropAt(floorPoint.clone());
        else characterCtrl.goTo(floorPoint.clone());
        clickMarker.position.set(floorPoint.x, 0.01, floorPoint.z); clickMarker.visible = true;
    }
});

let _lastHoveredBox = null;
canvas.addEventListener('pointermove', (e) => {
    if (_isBuildActive()) return;
    if (window.paintController?.isOpen) return;
    if (!characterCtrl || characterCtrl.isBusy() || (grabCtrl && grabCtrl.isGrabbing())) return;
    if (interactionSystem && interactionSystem.isToolActive()) return;
    const ndc = screenToNDC(e);
    const box = boxSystem.findBoxUnderCursor(ndc);
    if (box !== _lastHoveredBox) {
        if (_lastHoveredBox) boxSystem.highlight(_lastHoveredBox, false);
        if (box && !box.userData.carried) boxSystem.highlight(box, true);
        _lastHoveredBox = box;
        canvas.style.cursor = box && !box.userData.carried ? 'pointer' : 'crosshair';
    }
});

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (window.slingshotSystem && window.slingshotSystem.isAiming) return;
        if (_isBuildActive()) return;
        if (_activeTool !== 'navigate') _resetTool();
    }
});

document.querySelectorAll('.box-item').forEach((item) => { item.addEventListener('dragstart', (e) => { e.dataTransfer.setData('box-color', item.dataset.color); e.dataTransfer.effectAllowed = 'copy'; item.style.opacity = '0.5'; }); item.addEventListener('dragend', () => { item.style.opacity = '1'; }); });
canvas.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; canvas.style.cursor = 'copy'; });
canvas.addEventListener('dragleave', () => { canvas.style.cursor = 'crosshair'; });
canvas.addEventListener('drop', (e) => { e.preventDefault(); canvas.style.cursor = 'crosshair'; if (_isBuildActive()) return; const colorHex = e.dataTransfer.getData('box-color') || '#f59e0b'; const color = parseInt(colorHex.replace('#', '0x'), 16); const point = boxSystem.findFloorPoint(screenToNDC(e)); if (point) { boxSystem.addBox(point.x, point.z, color); if (hudStatus) { hudStatus.innerText = '📦 Box đã được tạo!'; setTimeout(() => { if (hudStatus) hudStatus.innerText = characterCtrl?.getStateText() || 'Đứng yên'; }, 1500); } } });

if (btnClearBoxes) btnClearBoxes.addEventListener('click', () => { if (characterCtrl?.carriedBox) return alert('Đang mang box, không thể xoá hết!'); if (confirm('Xoá tất cả box trên sàn?')) { boxSystem.clearAll(); if (hudStatus) hudStatus.innerText = 'Đã xoá hết box'; } _markInteraction(); });
if (btnSpawnTest) btnSpawnTest.addEventListener('click', () => { boxSystem.spawnRandom(3, 6); if (hudStatus) hudStatus.innerText = '🎲 Spawn 3 box ngẫu nhiên'; setTimeout(() => { if (hudStatus) hudStatus.innerText = characterCtrl?.getStateText() || 'Đứng yên'; }, 1500); _markInteraction(); });
if (btnSavePos) btnSavePos.addEventListener('click', async () => { if (!currentCharacter) return; _markInteraction(); const payload = { modelId: currentModelId, positionX: currentCharacter.position.x, positionY: currentCharacter.position.y, positionZ: currentCharacter.position.z, rotationY: currentCharacter.rotation.y }; try { const res = await fetch('/api/ModelApi/position', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); const result = await res.json(); if (result.success && hudStatus) { hudStatus.innerText = '💾 Đã lưu vị trí!'; setTimeout(() => { hudStatus.innerText = characterCtrl?.getStateText() || 'Đứng yên'; }, 2000); } } catch (err) { console.error('Lỗi lưu vị trí:', err); } });
if (btnResetPos) btnResetPos.addEventListener('click', () => { if (!currentCharacter || !characterCtrl) return; if (characterCtrl.carriedBox) return alert('Đang mang box, hãy đặt xuống trước!'); characterCtrl.goTo(new THREE.Vector3(0, 0, 0)); _markInteraction(); });
if (selectModel) selectModel.addEventListener('change', async (e) => { const modelId = parseInt(e.target.value); const modelData = window.availableModels.find(m => m.id === modelId); if (!modelData) return; _markInteraction(); try { const posRes = await fetch(`/api/ModelApi/position/${modelId}`); const posJson = await posRes.json(); await loadCharacterModel(modelData, posJson.data); } catch { await loadCharacterModel(modelData); } });

async function fetchModels() {
    try {
        const testModels = [{ id: 1, name: 'Base Character', filePath: '/uploads/models/base/base.fbx' }, { id: 2, name: 'AIGirl', filePath: '/uploads/models/AI_test/AIGirl.fbx' }];
        window.availableModels = testModels;
        if (selectModel) { selectModel.innerHTML = ''; testModels.forEach((m) => { const opt = document.createElement('option'); opt.value = m.id; opt.innerText = m.name; selectModel.appendChild(opt); }); }
        await loadCharacterModel(testModels[0]);
    } catch (err) { console.warn('Lỗi load model test:', err); }
}

const charBubble = document.createElement('div');
charBubble.style.cssText = `
    position: absolute; background: #ffffff; color: #0f172a;
    padding: 10px 16px; border-radius: 16px; font-family: 'Segoe UI', sans-serif;
    font-size: 14px; font-weight: 600; pointer-events: none; display: none;
    z-index: 1000; box-shadow: 0 4px 15px rgba(0,0,0,0.3);
    transform: translate(0, -100%);
    border: 4px solid #0284c7;
    max-width: 250px; text-align: left; transition: opacity 0.3s ease;
    white-space: pre-wrap;
`;
document.body.appendChild(charBubble);
let bubbleTimeout = null;
window.showCharacterMessage = (text, kind = 'normal') => {
    if (!text) return;
    const cleanText = String(text).replace(/\n+/g, ' ').trim();
    charBubble.textContent = cleanText.length > 120 ? cleanText.slice(0, 120).trim() + '…' : cleanText;
    charBubble.style.display = 'block'; charBubble.style.opacity = '1';
    clearTimeout(bubbleTimeout);
    bubbleTimeout = setTimeout(() => { charBubble.style.opacity = '0'; setTimeout(() => { charBubble.style.display = 'none'; }, 300); }, 4000);
};

const clock = new THREE.Clock();
let _idleCheckTick = 0;

function animate() {
    requestAnimationFrame(animate);
    if (window.__pause3D) return;
    const delta = Math.min(clock.getDelta(), 0.1);

    if (characterCtrl) characterCtrl.update(delta);
    if (mixer) mixer.update(delta);
    if (springBoneMgr) springBoneMgr.update(delta);
    if (boxSystem) boxSystem.update(delta);
    if (grabCtrl) grabCtrl.update(delta);
    if (slingshotSystem) slingshotSystem.update(delta);

    if (window.houseManager) {
        try { window.houseManager.update(delta); } catch (e) { }
    }

    if (window.__disableCameraControl !== true) {
        if (cameraWASD) cameraWASD.update(delta);
    }

    if (trashCan) trashCan.update(delta);

    if (interactionSystem && !_isBuildActive() && !window.paintController?.isOpen) {
        interactionSystem.update(delta);
    }

    if (reactiveEmotes) reactiveEmotes.update(delta);

    if (idleEvents && !_isBuildActive() && !window.paintController?.isOpen) {
        idleEvents.update(delta);
    }

    if (vfxSystem) vfxSystem.update(delta);
    if (faceCtrl) faceCtrl.update();

    if (!window.paintController?.isOpen && !_isBuildActive()) {
        _idleCheckTick += delta;
        if (_idleCheckTick > 1) {
            _idleCheckTick = 0;
            const now = Date.now();
            const idleDuration = now - _idleState.lastInteractionTs;
            const canYawn = characterCtrl && characterCtrl.state === 'idle' && !characterCtrl.carriedBox && !characterCtrl.isBusy() && idleDuration > _idleState.idleThresholdMs && (now - _idleState.lastYawnTs) > _idleState.yawnCooldownMs;
            if (canYawn) { _idleState.lastYawnTs = now; triggerLocalYawn(); }
        }
    }

    if (characterCtrl && characterCtrl.state === 'idle' && clickMarker.visible) clickMarker.visible = false;
    if (currentCharacter && hudCoords) hudCoords.innerText = `${currentCharacter.position.x.toFixed(2)}, ${currentCharacter.position.z.toFixed(2)}`;
    if (hudCarrying && characterCtrl) hudCarrying.innerText = characterCtrl.carriedBox ? '📦 Có box' : '—';

    if (window.__disableCameraControl !== true) {
        if (controls) controls.update();
    }

    if (currentCharacter && charBubble.style.display !== 'none' && charBubble.style.opacity !== '0') {
        const pos = currentCharacter.position.clone(); pos.y += 1.8; pos.project(camera);
        const x = (pos.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-pos.y * 0.5 + 0.5) * window.innerHeight;
        charBubble.style.left = `${x + 80}px`;
        charBubble.style.top = `${y}px`;
        if (pos.z > 1) charBubble.style.display = 'none';
        else if (charBubble.style.opacity !== '0') charBubble.style.display = 'block';
    }
    renderer.render(scene, camera);
}

function updateHud() { if (!currentCharacter || !hudCoords) return; hudCoords.innerText = `${currentCharacter.position.x.toFixed(2)}, ${currentCharacter.position.z.toFixed(2)}`; }
window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });
window.addEventListener('keydown', _markInteraction);
window.addEventListener('wheel', _markInteraction, { passive: true });

function initMoodHUD() {
    if (document.getElementById('mood-hud')) return;
    const hud = document.createElement('div');
    hud.id = 'mood-hud';
    hud.style.cssText = `
        position: fixed; top: 80px; left: 20px; z-index: 9999;
        background: rgba(15, 23, 42, 0.85); border: 1px solid #334155;
        padding: 6px 12px; border-radius: 20px; font-family: 'Segoe UI', sans-serif;
        box-shadow: 0 4px 10px rgba(0,0,0,0.5); display: flex; align-items: center; gap: 8px;
        min-width: 140px; backdrop-filter: blur(4px); transition: opacity 0.3s;
    `;
    hud.innerHTML = `
        <span style="font-size: 14px;">🧠</span>
        <div style="flex: 1; height: 6px; background: #1e293b; border-radius: 3px; overflow: hidden; position: relative;">
            <div id="mood-bar-fill" style="width: 50%; height: 100%; background: #f59e0b; border-radius: 3px; transition: width 0.5s ease, background 0.5s ease;"></div>
        </div>
        <span id="mood-val-text" style="font-size: 11px; font-weight: 700; color: #cbd5e1;">50</span>
    `;
    document.body.appendChild(hud);

    setInterval(() => {
        if (window.paintController?.isOpen) return;
        const m = getMood();
        const fill = document.getElementById('mood-bar-fill');
        const valText = document.getElementById('mood-val-text');
        if (!fill || !valText) return;
        fill.style.width = `${m}%`;
        valText.innerText = m;
        if (m >= 70) fill.style.background = '#10b981';
        else if (m >= 40) fill.style.background = '#f59e0b';
        else fill.style.background = '#ef4444';
    }, 500);
}

function hideLegacyBoxPanel() {
    const boxItems = document.querySelectorAll('.box-item');
    if (boxItems.length > 0) {
        let parent = boxItems[0].parentElement;
        while (parent && parent.tagName !== 'BODY') {
            if (parent.innerHTML.includes('Xóa hết') || parent.innerHTML.includes('Random') || parent.innerHTML.includes('Số box:')) {
                parent.style.display = 'none';
                break;
            }
            parent = parent.parentElement;
        }
    }
    console.log('[UI] Đã ẩn bảng đặt khối cũ (không tạo nút toggle nữa).');
}

// ═══════════════════════════════════════════════════════════════
// ⭐ INIT FLOW (PRELOADER)
// ═══════════════════════════════════════════════════════════════
async function init() {
    try {
        setLoadingProgress(10, 'Đang tải ánh sáng & môi trường...');
        await new Promise(r => setTimeout(r, 50));

        setLoadingProgress(30, 'Đang tải Box System...');
        // BoxSystem đã được khởi tạo ở scope ngoài, nhưng ta sẽ init nó ở đây nếu cần
        // (Trong file này nó đã được khởi tạo ở scope ngoài, ta giữ nguyên)

        setLoadingProgress(50, 'Đang tải VFX...');
        vfxSystem = new VFXSystem(scene, camera);
        window.vfxSystem = vfxSystem;
        if (vfxSystem.warmup) await vfxSystem.warmup();

        setLoadingProgress(70, 'Đang tải Mô hình Nhân vật...');
        await fetchModels(); // Hàm này gọi loadCharacterModel bên trong

        setLoadingProgress(85, 'Đang khởi tạo Hệ thống Xây dựng & Vẽ...');

        buildController = new BuildController(scene, camera, canvas, boxSystem, {});
        window.buildController = buildController;
        if (buildController.warmup) await buildController.warmup();

        paintController = new PaintController({});
        window.paintController = paintController;
        if (paintController.warmup) await paintController.warmup();

        // Các controller khác đã được tạo trong loadCharacterModel
        // ...

        setLoadingProgress(95, 'Đang khởi động AI...');
        // AI đã được khởi tạo trong loadCharacterModel

        setLoadingProgress(100, 'Sẵn sàng!');
        await new Promise(r => setTimeout(r, 300));
        loadingOverlay.style.opacity = '0';
        setTimeout(() => loadingOverlay.remove(), 500);

        animate(); // Bắt đầu loop

    } catch (err) {
        console.error('Lỗi khởi tạo App:', err);
        setLoadingProgress(100, 'Lỗi khởi tạo! Xem Console (F12).');
    }
}

initMoodHUD();
hideLegacyBoxPanel();
_initToolBadge();

// Khởi động App
init();
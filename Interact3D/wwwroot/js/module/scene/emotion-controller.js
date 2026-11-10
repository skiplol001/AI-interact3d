// ═══════════════════════════════════════════════════════════════
// emotion-controller.js — v34 (Mood-Based Organic Reactions)
// Tự động chọn 12 khuôn mặt dựa trên Mode + Mood + Ngữ cảnh
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'https://esm.sh/three@0.160.0';
import { getMood } from './chat/ai-mood.js?v=2';

const BUSY_STATES = [
    'walking', 'running', 'carryWalk', 'carryRun', 'walkToBox',
    'picking', 'putting', 'surprised', 'hanging', 'falling', 'landing',
];

const BUSY_STATES_FOR_SKIP = ['surprised', 'hanging', 'falling', 'landing'];
const STATIC_POSE_MAX_MS = 500;

const HOLD_EMOTIONS = new Set(['laying', 'sitting']);

// ⭐ 1. MAP ANIMATION (Logic xương 3D)
const EMOTION_MAP = {
    neutral: { anim: 'idle', fallback: 'idle', noTimer: true },
    idle: { anim: 'idle', fallback: 'idle', noTimer: true },
    talking: { anim: 'talking', fallback: 'idle', loopOnce: false, loops: 1 },
    thinking: { anim: 'thinking', fallback: 'talking', loopOnce: false, loops: 1 },
    happy: { anim: 'laughing', fallback: 'surprise', loopOnce: true },
    veryHappy: { anim: 'laughing', fallback: 'landing', loopOnce: true },
    sad: { anim: 'sadIdle', fallback: 'idle', loopOnce: false, loops: 1 },
    surprised: { anim: 'surprise', fallback: 'surprise', loopOnce: true },
    greeting: { anim: 'waving', fallback: 'idle', loopOnce: true },
    verySad: { anim: 'crying', fallback: 'sadIdle', loopOnce: true },
    angry: { anim: 'angryGesture', fallback: 'idle', loopOnce: true },
    confused: { anim: 'shrugging', fallback: 'surprise', loopOnce: true },
    polite: { anim: 'bowing', fallback: 'idle', loopOnce: true },
    explaining: { anim: 'pointing', fallback: 'talking', loopOnce: true },
    celebrating: { anim: 'clapping', fallback: 'laughing', loopOnce: true },
    excited: { anim: 'landing', fallback: 'idle', loopOnce: true },

    sitting: { anim: 'sitting', fallback: 'idle', preAnim: 'stand-to-sitting', postAnim: 'sitting-to-stand', loopOnce: true, holdMs: 6000 },
    laying: { anim: 'laying', fallback: 'idle', loopOnce: true, holdMs: 6000 },
    dancing: { anim: 'dancing', fallback: 'laughing', loopOnce: false, loops: 1, variants: ['dancing-hiphop', 'dancing-salsa'] },
    dizzy: { anim: 'drunk', fallback: 'surprise', loopOnce: false, loops: 1 },
    nodding: { anim: 'thankful', fallback: 'idle', loopOnce: true },
    thankful: { anim: 'thankful', fallback: 'bowing', loopOnce: true },
    shakingHead: { anim: 'dismissing', fallback: 'idle', loopOnce: true },
    looking: { anim: 'look-around', fallback: 'talking', loopOnce: true },
    throw: { anim: 'throw', fallback: 'angryGesture', loopOnce: true },
    kick: { anim: 'kick', fallback: 'angryGesture', loopOnce: true },
    taunt: { anim: 'taunt', fallback: 'laughing', loopOnce: true },
    falling: { anim: 'falling', fallback: 'idle', loopOnce: false, loops: 1 },

    hit_reaction: { anim: 'hit_reaction', fallback: 'idle', loopOnce: true },
    shoved_spin: { anim: 'shoved_spin', fallback: 'idle', loopOnce: true },
    stumble_backwards: { anim: 'stumble_backwards', fallback: 'idle', loopOnce: true },
    dodging: { anim: 'dodging', fallback: 'idle', loopOnce: true },
    silly_dancing: { anim: 'silly_dancing', fallback: 'dancing', loopOnce: false, loops: 1, maxDuration: 5000 },
    idle_look_around: { anim: 'idle_look_around', fallback: 'idle', loopOnce: false, loops: 1, maxDuration: 4000 },

    emo_bashful: { anim: 'emo_bashful', fallback: 'surprised', loopOnce: true },
    emo_kiss: { anim: 'emo_kiss', fallback: 'laughing', loopOnce: true },
    emo_blow_kiss: { anim: 'emo_blow_kiss', fallback: 'laughing', loopOnce: true },
    emo_magic_attack: { anim: 'emo_magic_attack', fallback: 'angryGesture', loopOnce: true },
    emo_lay_side_1: { anim: 'emo_lay_side_1', fallback: 'laying', loopOnce: true, holdMs: 6000 },
    emo_lay_side_2: { anim: 'emo_lay_side_2', fallback: 'laying', loopOnce: true, holdMs: 6000 },
};

// ⭐ 2. MAP KHUÔN MẶT CƠ BẢN
const BASE_FACE_MAP = {
    'neutral': 'neutral', 'idle': 'neutral', 'talking': 'neutral', 'sitting': 'neutral', 'laying': 'neutral',
    'happy': 'happy', 'greeting': 'happy', 'nodding': 'happy',
    'veryHappy': 'very_happy', 'excited': 'very_happy', 'celebrating': 'very_happy', 'laughing': 'very_happy', 'dancing': 'very_happy', 'silly_dancing': 'very_happy',
    'sad': 'sad', 'dismissing': 'sad',
    'verySad': 'crying', 'crying': 'crying',
    'angry': 'angry', 'shakingHead': 'angry', 'throw': 'angry', 'kick': 'angry',
    'surprised': 'surprised', 'falling': 'surprised', 'hit_reaction': 'surprised', 'dodging': 'surprised',
    'confused': 'confused', 'shrugging': 'confused', 'dizzy': 'confused', 'stumble_backwards': 'confused', 'drunk': 'confused',
    'thinking': 'thinking', 'explaining': 'thinking', 'polite': 'thinking', 'looking': 'thinking', 'idle_look_around': 'thinking',
    'emo_bashful': 'blushing', 'thankful': 'blushing', 'bowing': 'blushing',
    'emo_kiss': 'heart', 'emo_blow_kiss': 'heart',
    'taunt': 'wink', 'wink': 'wink'
};

// ⭐ 3. MAP KHUÔN MẶT THEO MOOD (Tự động thay đổi dựa trên tâm trạng)
const MOOD_FACE_POOLS = {
    high: ['happy', 'very_happy', 'blushing', 'heart', 'wink'], // Khi Mood > 70
    mid: ['neutral', 'happy', 'thinking', 'confused'],         // Khi Mood 40-70
    low: ['sad', 'angry', 'crying', 'neutral']                // Khi Mood < 40
};

// ⭐ 4. LỚP GHI ĐÈ THEO MODE (MODE-AWARE)
function getFaceForEmotion(emotion, mode, moodVal) {
    // 1. Ưu tiên hàng đầu: Cảm xúc cụ thể (do AI gắn thẻ hoặc Local match)
    if (emotion && emotion !== 'neutral' && emotion !== 'talking') {
        if (mode === 'savage') {
            if (['happy', 'laughing', 'celebrating'].includes(emotion)) return 'wink'; // Cười khẩy
            if (['sad', 'verySad', 'crying'].includes(emotion)) return 'angry'; // Giận dữ che giấu
            if (['thankful', 'emo_bashful'].includes(emotion)) return 'angry'; // Tsundere
        }
        if (mode === 'gentle') {
            if (['angry', 'throw', 'kick', 'shakingHead'].includes(emotion)) return 'sad'; // Tủi thân
            if (['happy', 'greeting', 'nodding'].includes(emotion)) return 'blushing'; // Ngại ngùng
            if (['taunt', 'wink'].includes(emotion)) return 'confused'; // Không biết trêu
            if (['veryHappy', 'excited', 'laughing'].includes(emotion)) return 'happy'; // Vui vẻ
        }
        return BASE_FACE_MAP[emotion] || 'neutral';
    }

    // 2. Nếu là trạng thái trung tính (idle, talking), tự động chọn mặt theo Mood
    let pool = MOOD_FACE_POOLS.mid;
    if (moodVal >= 70) pool = MOOD_FACE_POOLS.high;
    else if (moodVal < 40) pool = MOOD_FACE_POOLS.low;

    // Random 1 mặt trong pool để tạo sự ngẫu nhiên (không bị máy móc)
    return pool[Math.floor(Math.random() * pool.length)];
}

// ⭐ 5. BỂ CẢM XÚC NGẪU NHIÊN (Cho Idle & Tương tác)
export const EMOTION_POOLS = {
    poke_head: ['surprised', 'shakingHead', 'confused', 'taunt'],
    poke_cheek: ['emo_bashful', 'happy', 'emo_kiss', 'surprised'],
    poke_belly: ['surprised', 'confused', 'happy', 'verySad'],
    poke_leg: ['surprised', 'stumble_backwards'],
    petting: ['emo_bashful', 'veryHappy', 'happy', 'emo_kiss'],

    // Idle: Quét đủ các trạng thái, ưu tiên sự đa dạng
    idle_random: [
        'idle_look_around', 'silly_dancing', 'laughing', 'sad', 'emo_bashful',
        'shrugging', 'taunt', 'thankful', 'clapping', 'bowing', 'crying', 'thinking'
    ],
    laying_random: ['laying', 'emo_lay_side_1', 'emo_lay_side_2']
};

function stripVN(s) {
    return String(s ?? '').toLowerCase().trim().replace(/đ/g, 'd').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
}

export class EmotionController {
    constructor(characterCtrl, actions, options = {}) {
        this.ctrl = characterCtrl;
        this.actions = actions || {};
        this._timer = null;
        this._holdTimer = null;
        this._busyRetryTimer = null;
        this._preTimeout = null;
        this._postTimeout = null;

        this._currentEmotion = 'neutral';
        this._currentAnim = 'idle';
        this._currentAnimAction = actions?.idle || null;
        this._enabled = options.enabled !== false;
        this._returningToIdle = false;

        this._pendingAction = null;

        this._pendingMainAfterPre = null;
        this._pendingIdleAfterPost = null;
        this._isPreAnimPlaying = false;
        this._isPostAnimPlaying = false;
        this._isHolding = false;
        this._isHeldForever = false;

        if (!characterCtrl) this._enabled = false;

        const mixer = actions?.idle?._mixer;
        if (mixer) mixer.addEventListener('finished', (e) => this._onAnimFinished(e));

        console.log('[Emotion] Controller ready (v34 — Organic & Mood-Aware)');
    }

    _isScriptedMove() { return !!this.ctrl?._isScriptedMove; }

    // ⭐ PHÂN TÍCH CÂU THOẠI (Regex tìm từ khóa cảm xúc)
    processTextForEmotion(line) {
        const lowerText = line.toLowerCase();
        if (/(hôn|hun|chụt|yêu|thương|tim|💖|💕|💋|😘|😍)/.test(lowerText)) return 'emo_kiss';
        if (/(ngại|đỏ mặt|xấu hổ|cute|xinh|dễ thương|khen|tự hào|hihi|🙈|😳)/.test(lowerText)) return 'emo_bashful';
        if (/(trêu|khịa|đểu|đắc ý|khiêu khích|nè|nhé|hứ|😏|😜|😉)/.test(lowerText)) return 'taunt';
        if (/(tuyệt|quá đỉnh|sướng|hạnh phúc|hào hứng|quá trời|hahaha|🤩|😆|🤣)/.test(lowerText)) return 'veryHappy';
        if (/(vui|haha|hihi|cười|😄|😁|😊)/.test(lowerText)) return 'happy';
        if (/(khóc|huhu|nước mắt|tủi thân|😭)/.test(lowerText)) return 'verySad';
        if (/(buồn|đau lòng|thất vọng|chán|hụt hẫng|😢|🥺)/.test(lowerText)) return 'sad';
        if (/(giận|tức|đm|vcl|ngu|khốn|chửi|😡|🤬|😠|💢)/.test(lowerText)) return 'angry';
        if (/(sốc|ngạc nhiên|vãi|trời ơi|không thể tin|thật á|😲|😱)/.test(lowerText)) return 'surprised';
        if (/(nghĩ|để xem|hmm|chắc là|có lẽ|ý tưởng|🤔|💡)/.test(lowerText)) return 'thinking';
        if (/(rối|khó hiểu|sao vậy|là sao|hả|ơ|😵‍💫|😵)/.test(lowerText)) return 'confused';

        return null;
    }

    getEmotionDuration(emotionName) {
        let mapping = EMOTION_MAP[emotionName];
        if (!mapping) {
            if (this.actions[emotionName]) mapping = { anim: emotionName, fallback: 'idle', loopOnce: true };
            else return 1500;
        }

        let totalMs = 0;

        if (mapping.preAnim && this.actions[mapping.preAnim]) {
            totalMs += this._getClipDurationMs(this.actions[mapping.preAnim]);
        }

        const animName = this._resolveAnim(mapping);
        const action = this.actions[animName];
        if (action) {
            const clipDur = this._getClipDurationMs(action);
            if (clipDur < STATIC_POSE_MAX_MS) {
                totalMs += mapping.holdMs ?? 3000;
            } else if (mapping.holdMs) {
                totalMs += mapping.holdMs;
            } else if (mapping.loopOnce) {
                totalMs += clipDur + 500;
            } else {
                totalMs += clipDur * (mapping.loops ?? 1);
            }
        }

        if (mapping.postAnim && this.actions[mapping.postAnim]) {
            totalMs += this._getClipDurationMs(mapping.postAnim);
        }

        return Math.max(totalMs, 500);
    }

    trigger(emotionName, opts = {}) {
        if (!this._enabled) return false;

        let mapping = EMOTION_MAP[emotionName];

        if (!mapping) {
            if (this.actions[emotionName]) {
                mapping = { anim: emotionName, fallback: 'idle', loopOnce: true };
            } else {
                return false;
            }
        }

        // ⭐ CẬP NHẬT KHUÔN MẶT THÔNG MINH (Mode + Mood)
        if (window.faceCtrl) {
            const currentMode = window.__currentChatMode || 'normal';
            const currentMood = getMood();
            const mappedFace = getFaceForEmotion(emotionName, currentMode, currentMood);
            window.faceCtrl.setFace(mappedFace);
        }

        const currentMapping = EMOTION_MAP[this._currentEmotion];
        if (currentMapping && currentMapping.postAnim && this._currentEmotion !== emotionName && !this._returningToIdle) {
            this._pendingAction = { emotionName, opts };
            this._returnToIdle();
            return true;
        }

        const isHoldEmotion = HOLD_EMOTIONS.has(emotionName) || emotionName.includes('lay');

        if (opts.hold !== true && opts.force === true && !isHoldEmotion) {
            this._isHeldForever = false;
        }

        if (this._isHeldForever) {
            if (this._currentEmotion === emotionName) return true;
            if (!opts.force && !opts.hold) return true;
        }

        if (this._currentEmotion === emotionName && this._isPreAnimPlaying) return true;

        if (!opts.force && this._currentEmotion === emotionName && (this._timer || this._holdTimer)) {
            this.extend();
            return true;
        }

        if (!opts.force && this._isBusy()) return false;

        const animName = this._resolveAnim(mapping);
        if (!animName) return false;

        const action = this.actions[animName];
        if (!action) return false;

        const clipDuration = this._getClipDurationMs(action);
        const isStaticPose = clipDuration < STATIC_POSE_MAX_MS;
        const preAnimName = mapping.preAnim;
        const preAnimAction = preAnimName ? this.actions[preAnimName] : null;

        if (preAnimAction && !opts.skipPreAnim) {
            this._clearAllTimers();
            this._returningToIdle = false;
            this._isHolding = false;
            this._pendingMainAfterPre = { emotionName, mapping, animName, action, clipDuration, isStaticPose, hold: opts.hold };
            this._isPreAnimPlaying = true;
            this.ctrl._skipGroundSnap = true;

            try { preAnimAction.setLoop(THREE.LoopOnce, 1); } catch { }
            preAnimAction.clampWhenFinished = true;

            this.ctrl._playAnim(preAnimName, 0.2);
            this._currentEmotion = emotionName;
            this._currentAnim = preAnimName;
            this._currentAnimAction = preAnimAction;

            const preDur = this._getClipDurationMs(preAnimAction);
            this._preTimeout = setTimeout(() => {
                this._preTimeout = null;
                this._isPreAnimPlaying = false;
                if (!this._pendingMainAfterPre) return;
                const p = this._pendingMainAfterPre;
                this._pendingMainAfterPre = null;
                this._playMainAnim(p);
            }, preDur);

            return true;
        }

        return this._playMainAnim({ emotionName, mapping, animName, action, clipDuration, isStaticPose, hold: opts.hold });
    }

    _playMainAnim({ emotionName, mapping, animName, action, clipDuration, isStaticPose, hold }) {
        this._clearAllTimers();
        this._returningToIdle = false;
        this._isPreAnimPlaying = false;
        this._isHolding = false;

        if (hold === true) this._isHeldForever = true;

        if (!this._isScriptedMove()) {
            if (BUSY_STATES_FOR_SKIP.includes(this.ctrl.state)) {
                // giữ nguyên
            } else if (['laying', 'sitting', 'dancing', 'dizzy', 'emo_lay_side_1', 'emo_lay_side_2'].includes(emotionName)) {
                this.ctrl._skipGroundSnap = true;
            } else {
                this.ctrl._skipGroundSnap = false;
            }
        }

        if (isStaticPose) {
            try { action.clampWhenFinished = true; } catch { }
        }

        this.ctrl._playAnim(animName, 0.25);
        this._currentEmotion = emotionName;
        this._currentAnim = animName;
        this._currentAnimAction = action;

        if (['laying', 'sitting', 'emo_lay_side_1', 'emo_lay_side_2'].includes(emotionName) && !this._isScriptedMove()) {
            setTimeout(() => this.ctrl.snapToGround?.(), 350);
            setTimeout(() => this.ctrl.snapToGround?.(), 800);
        }

        if (mapping.noTimer) return true;
        this._resetTimer(mapping, clipDuration, isStaticPose);
        return true;
    }

    extend() {
        if (!this._enabled || this._isHeldForever) return;
        if (!this._currentEmotion || this._currentEmotion === 'neutral') return;
        const mapping = EMOTION_MAP[this._currentEmotion] || { anim: this._currentAnim, fallback: 'idle' };
        if (!mapping || mapping.noTimer) return;
        const clipDuration = this._getClipDurationMs(this._currentAnimAction);
        const isStaticPose = clipDuration < STATIC_POSE_MAX_MS;

        if (this._isHolding) {
            this._clearHoldTimer();
            const holdMs = mapping.holdMs ?? 3000;
            this._holdTimer = setTimeout(() => this._returnToIdle(), holdMs);
            return;
        }

        this._clearTimer();
        this._resetTimer(mapping, clipDuration, isStaticPose);
    }

    _resetTimer(mapping, clipDuration, isStaticPose) {
        if (this._isHeldForever) return;
        let totalMs;
        if (isStaticPose) {
            totalMs = mapping.holdMs ?? 3000;
        } else if (mapping.holdMs) {
            return;
        } else if (mapping.loopOnce) {
            totalMs = clipDuration + 500;
        } else {
            totalMs = clipDuration * (mapping.loops ?? 1);
        }
        if (totalMs > 60000) totalMs = 60000;
        this._timer = setTimeout(() => this._returnToIdle(), totalMs);
    }

    reset() {
        if (!this._enabled) return;
        this._clearAllTimers();
        this._returningToIdle = false;
        this._isHolding = false;
        this._pendingMainAfterPre = null;
        this._pendingIdleAfterPost = null;
        this._pendingAction = null;
        this._isPreAnimPlaying = false;
        this._isPostAnimPlaying = false;
        this._isHeldForever = false;

        this._currentEmotion = 'neutral';
        this._currentAnim = 'idle';
        this._currentAnimAction = this.actions.idle || null;

        if (window.faceCtrl) window.faceCtrl.setFace('neutral');

        if (!this._isScriptedMove()) this.ctrl._skipGroundSnap = false;
        if (!this._isBusy() && !this._isScriptedMove()) this.ctrl._playAnim('idle', 0.25);
    }

    stop() { this._isHeldForever = false; this._clearAllTimers(); }
    getCurrent() { return { emotion: this._currentEmotion, anim: this._currentAnim }; }

    hasAnim(emotionName) {
        const m = EMOTION_MAP[emotionName];
        if (!m) {
            return !!this.actions[emotionName];
        }
        if (m.variants?.some(v => this.actions[v])) return true;
        return !!this.actions[m.anim] || !!this.actions[m.fallback];
    }

    dispose() {
        this._clearAllTimers();
        this._pendingMainAfterPre = null;
        this._pendingIdleAfterPost = null;
        this._pendingAction = null;
        this._isPreAnimPlaying = false;
        this._isPostAnimPlaying = false;
        this._isHolding = false;
        this._isHeldForever = false;
        this._enabled = false;
    }

    _resolveAnim(mapping) {
        if (mapping.variants && mapping.variants.length > 0) {
            const available = mapping.variants.filter(v => this.actions[v]);
            if (available.length > 0) return available[Math.floor(Math.random() * available.length)];
        }
        if (this.actions[mapping.anim]) return mapping.anim;
        if (this.actions[mapping.fallback]) return mapping.fallback;
        if (this.actions.idle) return 'idle';
        return null;
    }

    _getClipDurationMs(action) {
        try {
            const clip = action.getClip?.() || action._clip;
            if (clip && Number.isFinite(clip.duration) && clip.duration > 0) return clip.duration * 1000;
        } catch { }
        return 2000;
    }

    _isBusy() { return BUSY_STATES.includes(this.ctrl.state); }
    _clearTimer() { if (this._timer) { clearTimeout(this._timer); this._timer = null; } }
    _clearHoldTimer() { if (this._holdTimer) { clearTimeout(this._holdTimer); this._holdTimer = null; } }

    _clearAllTimers() {
        this._clearTimer();
        this._clearHoldTimer();
        if (this._busyRetryTimer) { clearTimeout(this._busyRetryTimer); this._busyRetryTimer = null; }
        if (this._preTimeout) { clearTimeout(this._preTimeout); this._preTimeout = null; }
        if (this._postTimeout) { clearTimeout(this._postTimeout); this._postTimeout = null; }
    }

    _returnToIdle() {
        if (this._returningToIdle) return;

        if (this._isBusy() || this._isScriptedMove()) {
            this._clearAllTimers();
            this._busyRetryTimer = setTimeout(() => {
                this._busyRetryTimer = null;
                this._returnToIdle();
            }, 500);
            return;
        }

        if (this._currentEmotion === 'neutral' && this._currentAnim === 'idle') {
            this._finishToIdle();
            return;
        }

        const mapping = EMOTION_MAP[this._currentEmotion] || { anim: this._currentAnim, fallback: 'idle' };
        const postAnimName = mapping?.postAnim;
        const postAnimAction = postAnimName ? this.actions[postAnimName] : null;

        if (postAnimAction) {
            this._returningToIdle = true;
            this._clearAllTimers();
            this._pendingIdleAfterPost = true;
            this._isPostAnimPlaying = true;
            this._isHolding = false;

            try { postAnimAction.setLoop(THREE.LoopOnce, 1); } catch { }
            postAnimAction.clampWhenFinished = true;

            this.ctrl._playAnim(postAnimName, 0.2);
            this._currentAnim = postAnimName;
            this._currentAnimAction = postAnimAction;

            const postDur = this._getClipDurationMs(postAnimAction);
            this._postTimeout = setTimeout(() => {
                this._postTimeout = null;
                this._isPostAnimPlaying = false;
                this._returningToIdle = false;
                if (!this._pendingIdleAfterPost) return;
                this._pendingIdleAfterPost = null;
                this._finishToIdle();
            }, postDur);
            return;
        }

        this._finishToIdle();
    }

    _finishToIdle() {
        if (this._isBusy() || this._isScriptedMove()) { this._returnToIdle(); return; }

        this._returningToIdle = true;
        this._clearAllTimers();
        this._isHolding = false;
        this._isHeldForever = false;

        this._currentEmotion = 'neutral';
        this._currentAnim = 'idle';
        this._currentAnimAction = this.actions.idle || null;

        // Khi về trạng thái bình thường, hiển thị mặt theo Mood
        if (window.faceCtrl) {
            const currentMode = window.__currentChatMode || 'normal';
            const currentMood = getMood();
            const mappedFace = getFaceForEmotion('neutral', currentMode, currentMood);
            window.faceCtrl.setFace(mappedFace);
        }

        this.ctrl._playAnim('idle', 0.25);
        this.ctrl._skipGroundSnap = false;
        this.ctrl.root.position.y = 0;
        this.ctrl.snapToGround?.();

        setTimeout(() => {
            this._returningToIdle = false;

            if (this._pendingAction) {
                const p = this._pendingAction;
                this._pendingAction = null;
                this.trigger(p.emotionName, p.opts);
            }
        }, 500);
    }

    _onAnimFinished(e) {
        if (!this._enabled || this._isHeldForever) return;
        if (this._isPreAnimPlaying || this._isPostAnimPlaying) return;
        if (this._returningToIdle || this._currentEmotion === 'neutral') return;
        if (!this._currentAnimAction || e.action !== this._currentAnimAction) return;

        const dur = this._getClipDurationMs(this._currentAnimAction);
        if (dur < STATIC_POSE_MAX_MS) return;

        const mapping = EMOTION_MAP[this._currentEmotion] || { anim: this._currentAnim, fallback: 'idle' };

        if (mapping?.holdMs) {
            this._clearTimer();
            this._isHolding = true;
            this._holdTimer = setTimeout(() => {
                this._isHolding = false;
                this._returnToIdle();
            }, mapping.holdMs);
            return;
        }

        this._returnToIdle();
    }
}

export function normalizeEmotion(raw) {
    if (!raw) return 'neutral';
    const e = stripVN(raw);
    for (const key of Object.keys(EMOTION_MAP)) if (stripVN(key) === e) return key;
    if (['greeting', 'hello', 'hi', 'chao', 'welcome'].includes(e)) return 'greeting';
    if (['happy', 'joy', 'joyful', 'happiness', 'vui', 'vui ve', 'amused', 'funny', 'haha', 'laughing'].includes(e)) return 'happy';
    if (['veryhappy', 'excited', 'hype', 'very_happy', 'sieu vui'].includes(e)) return 'veryHappy';
    if (['sad', 'sadness', 'buon', 'buon ba', 'unhappy', 'melancholy'].includes(e)) return 'sad';
    if (['verysad', 'devastated', 'very_sad', 'crying', 'khoc'].includes(e)) return 'verySad';
    if (['surprised', 'surprise', 'shock', 'shocked', 'wow', 'ngac nhien'].includes(e)) return 'surprised';
    if (['confused', 'puzzled', 'unclear', 'kho hieu', '???', 'hmm'].includes(e)) return 'confused';
    if (['angry', 'mad', 'furious', 'tuc', 'tuc gian', 'annoyed'].includes(e)) return 'angry';
    if (['talking', 'speaking', 'reply', 'responding'].includes(e)) return 'talking';
    if (['thinking', 'pondering', 'suy nghi', 'processing'].includes(e)) return 'thinking';
    if (['polite', 'respectful', 'cam on', 'xin loi', 'sorry', 'thanks', 'bowing'].includes(e)) return 'polite';
    if (['explaining', 'instructing', 'huong dan', 'chi dan', 'teaching'].includes(e)) return 'explaining';
    if (['celebrating', 'congratulating', 'chuc mung', 'khen', 'praise', 'congrats'].includes(e)) return 'celebrating';
    if (['sitting', 'sit', 'ngo', 'ngoi', 'ngoi xuong', 'sitdown', 'sit_down', 'sit down'].includes(e)) return 'sitting';
    if (['dancing', 'dance', 'nhay', 'nhay mua', 'party', 'quay'].includes(e)) return 'dancing';
    if (['nodding', 'nod', 'yes', 'gat dau', 'dong y', 'xac nhan', 'thankful'].includes(e)) return 'nodding';
    if (['thankful', 'thanks', 'cam on', 'biet on'].includes(e)) return 'thankful';
    if (['shakinghead', 'shaking_head', 'dismissing', 'shake no', 'no', 'lac dau', 'tu choi', 'khong dong y'].includes(e)) return 'shakingHead';
    if (['dizzy', 'drunk', 'choang', 'chong mat', 'quay cuong'].includes(e)) return 'dizzy';
    if (['looking', 'look around', 'lookaround', 'nhin quanh', 'xung quanh'].includes(e)) return 'looking';
    if (['laying', 'lying', 'lie down', 'lay down', 'nam', 'nam xuong', 'nam im', 'di ngu', 'sleep'].includes(e)) return 'laying';
    if (['throw', 'nem', 'nem da', 'throw object'].includes(e)) return 'throw';
    if (['kick', 'da', 'sut', 'soccer kick'].includes(e)) return 'kick';
    if (['taunt', 'khieu khich', 'cuoi deu'].includes(e)) return 'taunt';

    if (['hit_reaction', 'hit', 'bi danh'].includes(e)) return 'hit_reaction';
    if (['shoved_spin', 'shoved', 'bi xo'].includes(e)) return 'shoved_spin';
    if (['stumble_backwards', 'stumble', 'loang choang'].includes(e)) return 'stumble_backwards';
    if (['dodging', 'dodge', 'ne don'].includes(e)) return 'dodging';

    if (['bashful', 'shy', 'ngai ngung'].includes(e)) return 'emo_bashful';
    if (['kiss', 'hon'].includes(e)) return 'emo_kiss';
    if (['blow_kiss', 'hon_gio'].includes(e)) return 'emo_blow_kiss';
    if (['magic', 'magic_attack', 'phep'].includes(e)) return 'emo_magic_attack';
    if (['lay_side_1', 'nam_nghieng_1'].includes(e)) return 'emo_lay_side_1';
    if (['lay_side_2', 'nam_nghieng_2'].includes(e)) return 'emo_lay_side_2';

    return 'neutral';
}

const EMOTE_INTENTS = [
    [/\b(nam xuong|nam di|nam ra|nam nghi|nam yen|lay down|lie down)\b/, 'laying'],
    [/\b(ngoi xuong|ngoi di|ngoi nghi|sit down)\b/, 'sitting'],
    [/\b(nhay mua|nhay di|nhay cho xem|dance)\b/, 'dancing'],
    [/\b(vay tay|chao di|chao hoi|wave)\b/, 'greeting'],
    [/\b(cui chao|cui dau|cuoi chao|bow)\b/, 'polite'],
    [/\b(gat dau|nod)\b/, 'nodding'],
    [/\b(lac dau)\b/, 'shakingHead'],
    [/\b(nhin quanh|look around)\b/, 'looking'],
    [/\b(vo tay|clap)\b/, 'celebrating'],
    [/\b(khoc|cry)\b/, 'verySad'],
    [/\b(choang|chong mat|dizzy)\b/, 'dizzy'],
    [/\b(cam on|thank)\b/, 'thankful'],
];

export function detectEmoteIntent(text) {
    const t = stripVN(text);
    if (!t) return null;
    for (const [re, emotion] of EMOTE_INTENTS) {
        if (re.test(t)) return emotion;
    }
    return null;
}

export function getAvailableEmotions() {
    return Object.keys(EMOTION_MAP);
}
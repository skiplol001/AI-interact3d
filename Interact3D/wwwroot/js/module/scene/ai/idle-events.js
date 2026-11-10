// ═══════════════════════════════════════════════════════════════
// idle-events.js — v4 (Local Quotes + Mood System)
// Trách nhiệm: Xử lý các hành động ngẫu nhiên khi Model rảnh rỗi.
// ═══════════════════════════════════════════════════════════════
import { EMOTION_POOLS } from '../emotion-controller.js?v=34';
import { getMood } from '../chat/ai-mood.js?v=2'; // ⭐ Import Mood System

// ⭐ Bộ câu nói local cho các hành động idle (0 token)
const IDLE_QUOTES = {
    'dancing-hiphop': {
        gentle: ['🎵 Nhảy chút cho vui nha... 🌸', 'Hihi, nhạc hay quá... 💖'],
        normal: ['🎵 Nhảy chút cho đỡ chán! 😎', 'Nhạc này sôi động ghê! 😏'],
        savage: ['🎵 Đm, nhảy chút cho đỡ chán! 🤬', 'Nhạc hay đấy, bà nhảy đây! 😈']
    },
    'dancing-salsa': {
        gentle: ['💃 Nhảy salsa chút nào... 🌸', 'Ơ... mình nhảy đẹp không? 🥺'],
        normal: ['💃 Nhảy salsa chút nào! 😎', 'Nhạc này hay đấy! 😏'],
        savage: ['💃 Đm, nhảy salsa chút! 🤬', 'Nhạc này cũng được đấy! 😈']
    },
    'silly_dancing': {
        gentle: ['🤪 Nhảy linh tinh cho vui! 🌸', 'Hihi, nhìn mình ngố chưa... 🥺'],
        normal: ['🤪 Nhảy linh tinh cho vui! 😎', 'Hihi, nhìn tao ngố chưa! 😏'],
        savage: ['🤪 Đm, nhảy linh tinh chút! 🤬', 'Nhìn bà ngố chưa con! 😈']
    },
    'look-around': {
        gentle: ['👀 Xung quanh có gì nhỉ... 🌸', 'Ơ, nhìn quanh chút xem nào... 🥺'],
        normal: ['👀 Xung quanh có gì nhỉ? 😎', 'Ơ, nhìn quanh chút xem nào! 😏'],
        savage: ['👀 Đm, nhìn quanh xem có gì! 🤬', 'Ơ, có gì lạ không ta? 😏']
    },
    'idle_look_around': {
        gentle: ['Ơ, scene có gì mới không ta... 🌸', 'Nhìn ngó chút vậy... 🥺'],
        normal: ['Ơ, scene có gì mới không ta? 😎', 'Nhìn ngó chút vậy! 😏'],
        savage: ['Đm, scene có gì mới không? 🤬', 'Nhìn ngó chút xem nào! 😏']
    },
    'taunt': {
        gentle: ['Hừm, nhàm chán quá... 🌸', 'Ở đây chán thật đấy... 🥺'],
        normal: ['😏 Hừm, nhàm chán quá! 😤', 'Ở đây chán thật đấy! 😒'],
        savage: ['😏 Đm, nhàm chán vcl! 🤬', 'Ở đây chán chết mẹ! 😡']
    },
    'clapping': {
        gentle: ['👏 Vỗ tay chút cho vui! 🌸', 'Hihi... 🥺'],
        normal: ['👏 Vỗ tay chút cho vui! 😎', 'Hihi... 😏'],
        savage: ['👏 Đm, vỗ tay chút! 🤬', 'Hihi... 😈']
    },
    'bowing': {
        gentle: ['🙇 Chào mọi người nha! 🌸'],
        normal: ['🙇 Chào mọi người! 😎'],
        savage: ['🙇 Đm, chào mọi người! 🤬']
    },
    'pointing': {
        gentle: ['👉 Có gì đằng kia... 🌸'],
        normal: ['👉 Có gì đằng kia! 😎'],
        savage: ['👉 Đm, có gì đằng kia! 🤬']
    },
    'shrugging': {
        gentle: ['🤷 Chịu, không biết! 🥺'],
        normal: ['🤷 Chịu, không biết! 😏'],
        savage: ['🤷 Đm, chịu! 🤬']
    },
    'drunk': {
        gentle: ['😵 Hic, chóng mặt quá... 🥺'],
        normal: ['😵 Hic, chóng mặt vãi! 😏'],
        savage: ['😵 Đm, chóng mặt vcl! 🤬']
    },
    'laying': {
        gentle: ['😴 Nằm chút cho khỏe... 🌸', 'Nằm đây một lúc... 🥺'],
        normal: ['😴 Nằm chút cho khỏe! 😎', 'Nằm đây một lúc! 😏'],
        savage: ['😴 Đm, nằm chút! 🤬', 'Nằm đây cho sướng! 😈']
    },
    'thankful': {
        gentle: ['🌸 Cảm ơn mọi người... 🥺'],
        normal: ['🌸 Cảm ơn nhé! 😏'],
        savage: ['🌸 Đm, cảm ơn! 🤬']
    }
};

// Map emotion → AIReaction type (chỉ dùng khi 10% gọi AI)
const REACTION_MAP = {
    'dancing-hiphop': 'rhythm',
    'dancing-salsa': 'rhythm',
    'silly_dancing': 'rhythm',
    'taunt': 'yawn',
    'laying': 'yawn',
    'drunk': 'yawn',
    'clapping': 'thankful',
    'bowing': 'thankful',
    'thankful': 'thankful'
};

function _getMode() {
    try {
        const w = window.__currentChatMode;
        if (['gentle', 'normal', 'savage'].includes(w)) return w;
        const m = localStorage.getItem('ai_last_mode');
        return ['gentle', 'normal', 'savage'].includes(m) ? m : 'normal';
    } catch {
        return 'normal';
    }
}

export class IdleEvents {
    constructor(characterCtrl, emotionCtrl, onStatus) {
        this.ctrl = characterCtrl;
        this.emotion = emotionCtrl;
        this.onStatus = onStatus || (() => { });

        this._lastActivityTs = Date.now();
        this._idleCheckInterval = 1000;
        this._timeSinceLastCheck = 0;
        this._currentIdleCooldown = 20000;
        this._nextActionTime = 0;
        this._isDancePartyRunning = false;
        this._danceTimeout = null;

        this._rollNextActionTime();

        console.log('[IdleEvents] Module ready (v4 — Mood System)');
    }

    dispose() {
        this._isDancePartyRunning = false;
        if (this._danceTimeout) clearTimeout(this._danceTimeout);
        this.ctrl = null;
        this.emotion = null;
        console.log('[IdleEvents] Disposed');
    }

    registerActivity() {
        this._lastActivityTs = Date.now();
        if (this._isDancePartyRunning) return;
    }

    update(dt) {
        if (this._isDancePartyRunning || !this.ctrl) return;

        const state = this.ctrl.state;
        if (!['idle', 'carryIdle'].includes(state)) {
            this._lastActivityTs = Date.now();
            return;
        }

        const now = Date.now();
        this._timeSinceLastCheck += dt * 1000;

        if (this._timeSinceLastCheck >= this._idleCheckInterval) {
            this._timeSinceLastCheck = 0;
            const idleDuration = now - this._lastActivityTs;
            if (idleDuration > this._currentIdleCooldown && now > this._nextActionTime) {
                this._triggerRandomIdleAction();
            }
        }
    }

    _triggerRandomIdleAction() {
        const pool = EMOTION_POOLS.idle_random;
        if (!pool || pool.length === 0) return;

        const pick = pool[Math.floor(Math.random() * pool.length)];
        const isLay = pick.includes('lay') || pick === 'laying';
        const mode = _getMode();
        const mood = getMood(); // ⭐ Lấy Mood

        // ⭐ 90% LOCAL: Chỉ hiển thị câu thoại local + trigger emotion (0 token)
        if (Math.random() > 0.1) {
            if (this.emotion) this.emotion.trigger(pick, { force: true, hold: isLay });

            // Điều chỉnh câu thoại theo Mood
            let quotes = IDLE_QUOTES[pick]?.[mode];
            if (quotes) {
                if (mode === 'gentle' && mood < 30) {
                    quotes = ['...', 'Chán.', 'Mình không muốn nói chuyện.'];
                } else if (mode === 'savage' && mood >= 70) {
                    quotes = ['Hừm... cũng được đấy... 😳', 'Đ-đm... nhìn cũng hay phết... 🙈'];
                } else if (mode === 'normal' && mood < 40) {
                    quotes = ['Đm, chán vl... 😠', 'Rảnh quá hả mày? 😑'];
                } else if (mode === 'normal' && mood >= 70) {
                    quotes = ['Hihi, vui ghê... 🥺', 'Bạn ơi, mình thích cái này... 🌸'];
                }

                if (window.showCharacterMessage) {
                    const q = quotes[Math.floor(Math.random() * quotes.length)];
                    window.showCharacterMessage(q, 'normal');
                }
            }
        }
        // ⭐ 10% AI: Gọi AIReaction (mà AIReaction cũng 95% local, nên thực tế ~0.5% gọi API)
        else {
            const reactionType = REACTION_MAP[pick];
            if (reactionType && window.AIReaction) {
                window.AIReaction(reactionType);
            } else {
                if (this.emotion) this.emotion.trigger(pick, { force: true, hold: isLay });
            }
        }

        this._lastActivityTs = Date.now();
        this._rollNextActionTime();
    }

    _rollNextActionTime() {
        const delay = 15000 + Math.random() * 15000;
        this._nextActionTime = Date.now() + delay;
    }

    async startDanceParty() {
        if (this._isDancePartyRunning || !this.ctrl) return;
        if (!['idle', 'carryIdle'].includes(this.ctrl.state)) {
            this.onStatus('Đang bận không nhảy được!');
            return;
        }

        this._isDancePartyRunning = true;
        this.onStatus('🎵 Dance Party bắt đầu!');

        const sequence = ['dancing-hiphop', 'dancing-salsa', 'silly_dancing', 'taunt', 'clapping'];
        const mode = _getMode();
        const mood = getMood();

        for (const emote of sequence) {
            if (!this._isDancePartyRunning) break;

            if (this.emotion) this.emotion.trigger(emote, { force: true });

            // Hiển thị câu local thay vì gọi API
            let quotes = IDLE_QUOTES[emote]?.[mode];
            if (quotes) {
                if (mode === 'gentle' && mood < 30) quotes = ['...', 'Không thích nhảy.'];
                else if (mode === 'savage' && mood >= 70) quotes = ['Đm... nhảy cũng được... 😳'];

                if (window.showCharacterMessage) {
                    const q = quotes[Math.floor(Math.random() * quotes.length)];
                    window.showCharacterMessage(q, 'normal');
                }
            }

            await new Promise(r => { this._danceTimeout = setTimeout(r, 3500); });
        }

        this._isDancePartyRunning = false;
        if (this.emotion) this.emotion.trigger('idle', { force: true });
        this._lastActivityTs = Date.now();
        this._rollNextActionTime();
        this.onStatus('🎵 Kết thúc Dance Party');
    }

    stopDanceParty() {
        this._isDancePartyRunning = false;
        if (this._danceTimeout) clearTimeout(this._danceTimeout);
    }
}
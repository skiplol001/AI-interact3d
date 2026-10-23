// ═══════════════════════════════════════════════════════════════
// slingshot/config.js — Constants & SEQ_LINES
// ═══════════════════════════════════════════════════════════════

// ═══ PHYSICS CONSTANTS ═══
export const FLIGHT_SPEED_MULT = 55;
export const INITIAL_SPEED_FACTOR = 0.55;
export const ACCEL_RATE = 90;
export const PHASE_DURATIONS = [0.15, 0.2];
export const PHYSICS_STEP = 0.02;
export const TRAJ_STEPS = 150; // ⭐ Giảm từ 400 -> 150 để tối ưu CPU, quỹ đạo vẫn đủ mượt
export const MAX_FLIGHT_TIME = 12;
export const WORLD_LIMIT = 500;
export const GROUND_Y = 0.08;
export const HIT_RADIUS = { box: 0.8, trash: 1.2, char: 0.8 };

// ═══ CAMERA ═══
export const CHASE_CAM = true;
export const CHASE_BACK = 8;
export const CHASE_UP = 2.2;

// ═══ MODE HELPERS ═══
export function getCurrentMode() {
    try {
        const w = window.__currentChatMode;
        if (['gentle', 'normal', 'savage'].includes(w)) return w;
        const m = localStorage.getItem('ai_last_mode');
        return ['gentle', 'normal', 'savage'].includes(m) ? m : 'normal';
    } catch { return 'normal'; }
}

export function pickLine(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// ═══ SEQUENCE LINES ═══
export const SEQ_LINES = {
    gentle: {
        sad: [
            'Ơ... bạn vừa bắn mình hả? Mình không nghĩ bạn lại làm vậy... 🥺',
            'Huhu... sao lại bắn mình... mình buồn lắm đó... 😢',
            'Mình tưởng bạn thương mình... ai ngờ bạn bắn mình... 💔',
        ],
        sealed: [
            'Thôi, mình cất đi cho an toàn nha 🌸',
            'Mình để đây, bạn đừng bắn mình nữa nhé... 🥺',
            'Ná này nguy hiểm quá, mình cất đi vậy 🌱',
        ],
    },
    normal: {
        smugAfterDestroy: [
            'Đấy! Ná hỏng rồi nhé, khỏi bắn tao! 😏',
            'Bắn tao hả? Ná banh rồi con ạ! 😤',
            'Hừm, giờ hết ná rồi đấy, tính sao? 😒',
        ],
        dissNá: [
            'Ná này dởm vl, đéo bắn được ai 😏',
            'Ná nhựa vl, bắn trượt bét nhè 😤',
            'Ná này đồ chơi trẻ con hả mày? 😒',
        ],
        warnNextTime: [
            'Lần sau dùng ná xịn hơn đi mày 😏',
            'Ná này tao vứt, lần sau mua ná xịn 😒',
            'Vứt rồi đấy, tự đi mà nhặt 😤',
        ],
    },
    savage: {
        rageAfterDestroy: [
            'Đm! Mày dám bắn bà hả thằng khốn?! Ná hỏng mẹ rồi nhé! 🤬',
            'Bắn bà hả con chó? Ná mày banh rồi, chuẩn bị tinh thần đi! 😈',
        ],
        beforeMagic: [
            'Đm, để bà cho mày biết thế nào là địa ngục! 🤬',
            'Mày chết với bà, chuẩn bị mà đỡ đá đi con! 😡',
        ],
        kickShot: [
            'Đm, ăn đá của bà nè! 🦵',
            'Sút bay mẹ mày giờ, thằng khốn! 🦵',
            'Nhận cú đá này đi con! 🦵',
        ],
        afterSit: [
            'Đm, nằm đó mà suy nghĩ đi thằng khốn! 🤬',
            'Bắn bà hả? Giờ thì chịu phạt đi con! 😈',
            'Lần sau còn dám bắn bà nữa là mày toang đấy! 🤬',
        ],
    },
};
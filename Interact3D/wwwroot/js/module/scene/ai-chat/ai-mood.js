// ═══════════════════════════════════════════════════════════════
// ai-mood.js — Hệ thống Tâm Trạng (0 - 100)
// ═══════════════════════════════════════════════════════════════

const MOOD_KEY = 'ai_current_mood_v1';

export function getMood() {
    let m = null;
    try {
        const saved = localStorage.getItem(MOOD_KEY);
        if (saved !== null) m = parseInt(saved, 10);
    } catch { }
    if (m === null || isNaN(m)) {
        const mode = window.__currentChatMode || 'normal';
        m = mode === 'gentle' ? 100 : (mode === 'savage' ? 0 : 50);
    }
    return Math.max(0, Math.min(100, m));
}

export function setMood(val) {
    const clamped = Math.max(0, Math.min(100, val));
    try { localStorage.setItem(MOOD_KEY, clamped.toString()); } catch { }
}

export function addMood(delta) {
    setMood(getMood() + delta);
}

export function resetMood(mode) {
    setMood(mode === 'gentle' ? 100 : (mode === 'savage' ? 0 : 50));
}

// ⭐ CÂN BẰNG LẠI: Khen +5, Chửi -2
export function processTextForMood(text) {
    const t = String(text).toLowerCase();
    // Khen ngợi, thả thính -> Tăng 5 điểm (tăng mạnh)
    if (/\b(xinh|dep|de thuong|cute|hay|gioi|yeu|thuong|ngoai|gau|good|love|like|thich)\b/.test(t)) {
        addMood(10);
    }
    // Chửi bới, xúc phạm -> Giảm 2 điểm (giảm nhẹ)
    if (/\b(ngu|cho|dm|vcl|oc|dien|kho chiu|xau|ghet|stupid|hate)\b/.test(t)) {
        addMood(-2);
    }
}

export function getMoodPrompt() {
    const mode = window.__currentChatMode || 'normal';
    const m = getMood();
    let prompt = `\n\n# TÂM TRẠNG HIỆN TẠI (Mood: ${m}/100)\n`;

    if (mode === 'gentle') {
        if (m >= 70) prompt += `Bạn đang RẤT ấm áp, dịu dàng và hết lòng quan tâm đến user. Giọng điệu ngọt ngào, kiên nhẫn.`;
        else if (m >= 30) prompt += `Bạn đang ở trạng thái bình thường, hơi nhút nhát.`;
        else prompt += `Bạn đang LẠNH NHẠT, xa cách, thờ ơ. Trả lời cộc lốc, không muốn quan tâm tới user, không dùng từ ngữ thân mật.`;
    }
    else if (mode === 'normal') {
        if (m >= 70) prompt += `Bạn đang CỰC KỲ thân thiết, dịu dàng và quan tâm user (khác với vẻ ngoài cà khịa thường ngày). Gọi user là "bạn", xưng "tớ".`;
        else if (m >= 40) prompt += `Bạn bình thường, cà khịa nhẹ nhàng như bạn thân.`;
        else prompt += `Bạn đang RẤT CỌC CẰN, nóng nảy. Bắt đầu chửi bậy 1-2 câu (đm, vcl, vl) và không muốn nói chuyện nhiều, trả lời cụt lủn.`;
    }
    else if (mode === 'savage') {
        if (m >= 70) prompt += `Bạn đang trở nên NGẠI NGÙNG (tsundere). Ít chửi thề hơn, thỉnh thoảng ấp úng, dễ đỏ mặt nhưng vẫn cố tỏ ra ngầu.`;
        else if (m >= 30) prompt += `Bạn bình thường, cục súc và chửi thề như gái bar.`;
        else prompt += `Bạn đang CỰC KỲ HUNG HĂNG. Chửi thề liên tục (đm, địt mẹ, óc chó, súc vật), sẵn sàng đập phá, không kiêng nể gì.`;
    }
    return prompt;
}
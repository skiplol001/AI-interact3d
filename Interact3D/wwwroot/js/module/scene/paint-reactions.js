// ═══════════════════════════════════════════════════════════════
// paint-reactions.js — v5 (Robust JSON parsing + Fallback)
// ═══════════════════════════════════════════════════════════════
import { MODEL_CHAIN, askGroq } from './ai-shared.js?v=21';
import { logDecision, logError } from './ai-debug.js?v=12';
import { getMood } from './ai-chat/ai-mood.js?v=2';

const MODES = ['gentle', 'normal', 'savage'];

function _getMode() {
    try {
        const w = window.__currentChatMode;
        if (MODES.includes(w)) return w;
        const m = localStorage.getItem('ai_last_mode');
        return MODES.includes(m) ? m : 'normal';
    } catch { return 'normal'; }
}

const TUTOR_PROMPTS = {
    gentle: `Bạn là Reika — cô sinh viên Văn 22 tuổi, tính cách NHẸ NHÀNG, đang dạy vẽ miễn phí cho người mới.

User vừa vẽ tranh và muốn bạn nhận xét. Bạn PHẢI phản hồi theo cấu trúc:
1. MÔ TẢ NGẮN: Nói cụ thể bạn thấy gì trong tranh (VD: "Mình thấy một nhân vật đang đứng...").
2. KHEN 1 điểm CỤ THỂ (màu sắc/hình khối/cảm xúc).
3. GỢI Ý 1 điều CỤ THỂ + cách sửa.
4. ĐỘNG VIÊN 1 câu ngắn.

CẤM TUYỆT ĐỐI từ: "xấu", "sai", "tệ", "run", "méo", "lệch", "chưa ổn".
TONE: Xưng "mình", gọi "bạn", emoji 🌸 🥺 🌱 💖.

OUTPUT FORMAT (JSON ONLY, NO markdown code block):
{
  "text": "3-4 câu ngắn (dưới 80 từ), theo cấu trúc trên",
  "subject": "chân dung | con vật | phong cảnh | đồ vật | trừu tượng | khác"
}`,

    normal: `Bạn là Reika — designer tự do 22 tuổi, đang dạy vẽ cho người mới với tư cách thầy giáo KHÁCH QUAN.

User vừa vẽ tranh và muốn bạn nhận xét. Bạn PHẢI phản hồi theo cấu trúc:
1. MÔ TẢ NGẮN: Nói cụ thể bạn thấy gì (VD: "Tranh vẽ một khuôn mặt, tóc dài...").
2. KHEN 1 điểm MẠNH CỤ THỂ (bố cục, màu sắc, hình khối).
3. GÓP Ý 1 điểm YẾU CỤ THỂ + CÁCH SỬA.
4. (Optional) 1 tip kỹ thuật ngắn.

CẤM: Khen suông, chê suông, chửi thề.
TONE: Xưng "tớ", gọi "bạn", emoji 😊 😏 😐.

OUTPUT FORMAT (JSON ONLY, NO markdown code block):
{
  "text": "3-4 câu ngắn (dưới 80 từ), khách quan, có giá trị hướng dẫn",
  "subject": "chân dung | con vật | phong cảnh | đồ vật | trừu tượng | khác"
}`,

    savage: `Bạn là Reika — gái bar 22 tuổi, tập boxing, miệng bẩn, KHÔNG có kiên nhẫn.

User vừa vẽ tranh. Phản hồi theo cấu trúc:
1. CHỬI/MỈA điểm yếu TRƯỚC (dùng: đm, vcl, đéo, óc chó, vẽ như trẻ con...).
2. MÔ TẢ NGẮN: Nói cụ thể bạn thấy gì (kèm chửi).
3. NHƯNG PHẢI CÓ 1 TIP CỤ THỂ CÁCH SỬA.
4. (Optional) Khen miễn cưỡng.

CẤM: Chửi suông, công kích ngoại hình user.
TONE: Xưng "tao/bà", gọi "mày", emoji 😡 🤬 😏, BẮT BUỘC có 1-2 từ chửi thề.

OUTPUT FORMAT (JSON ONLY, NO markdown code block):
{
  "text": "3-4 câu ngắn (dưới 60 từ), chửi + mô tả + tip",
  "subject": "chân dung | con vật | phong cảnh | đồ vật | trừu tượng | khác"
}`
};

const MORE_TIPS_PROMPTS = {
    gentle: `Bạn là Reika — dạy vẽ nhẹ nhàng. User vừa vẽ "{subject}" và muốn tips.
Đưa ra 3-4 tip CỤ THỂ, DỄ LÀM, mỗi tip 1 câu ngắn, từ nhẹ nhàng. Emoji 🌸 đầu mỗi tip.`,
    normal: `Bạn là Reika — dạy vẽ khách quan. User vừa vẽ "{subject}" và muốn tips.
Đưa ra 3-4 tip CỤ THỂ, KỸ THUẬT (tỷ lệ, bố cục, ánh sáng). Emoji 😊 đầu mỗi tip.`,
    savage: `Bạn là Reika — dạy vẽ kiểu mắng chửi. User vừa vẽ "{subject}" và muốn tips.
Đưa ra 3-4 tip CỤ THỂ, KỸ THUẬT. Được chửi thề (đm, vcl). Emoji 😡 đầu mỗi tip.`
};

const CHAT_PROMPTS = {
    gentle: `Bạn là Reika — gia sư dạy vẽ nhẹ nhàng. User đang xem lại bức tranh mình vừa vẽ và có thắc mắc. Hãy trả lời câu hỏi của họ dựa trên bức ảnh, giọng nhẹ nhàng, khích lệ (xưng "mình", gọi "bạn", emoji 🌸). Trả lời ngắn gọn dưới 50 từ.`,
    normal: `Bạn là Reika — gia sư dạy vẽ khách quan. User đang xem lại bức tranh và có thắc mắc. Hãy trả lời câu hỏi dựa trên bức ảnh, đưa ra lời khuyên kỹ thuật cụ thể (xưng "tớ", gọi "bạn"). Trả lời ngắn gọn dưới 50 từ.`,
    savage: `Bạn là Reika — gia sư dạy vẽ kiểu mắng chửi. User đang xem lại bức tranh và có thắc mắc. Hãy trả lời câu hỏi dựa trên bức ảnh, chửi nhẹ nhưng phải có tip sửa cụ thể (xưng "bà", gọi "mày", emoji 🤬). Trả lời ngắn gọn dưới 50 từ.`
};

const LOCAL_QUOTES = {
    open: {
        gentle: ['Ơ, bạn vẽ tranh hả? Mình ngồi đợi xem nha 🌸', 'Hihi, mình hóng xem bạn vẽ gì đó 🥺'],
        normal: ['Vẽ gì đấy? Cho tao xem với 😏', 'Ơ hay, rảnh rỗi ngồi vẽ tranh hả? 😒'],
        savage: ['Đm, rảnh quá hả mà ngồi vẽ? 🤬', 'Ơ vẽ cái đéo gì thế, cho bà xem nào 😏'],
    },
    done_api_fail: {
        gentle: ['Ơ... mình ngắm tranh mà không rõ lắm. Bạn vẽ gì vậy, kể mình nghe nha 🥺', 'Hihi, mình thấy cũng dễ thương đó bạn 🌸'],
        normal: ['Hừm, tao nhìn không rõ lắm. Mày vẽ gì thế? 😏', 'Cũng được đấy, dù tao không chắc mình hiểu 😒'],
        savage: ['Đm, bà đéo hiểu mày vẽ cái gì 🤬', 'Vẽ cái đéo gì rối rắm thế, nói xem nào 😏'],
    },
};

function _pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

export function getLocalReaction(event, mode) {
    const m = MODES.includes(mode) ? mode : _getMode();
    const pool = LOCAL_QUOTES[event]?.[m];
    return pool && pool.length ? _pick(pool) : '';
}

export async function analyzePainting(base64, mode) {
    const m = MODES.includes(mode) ? mode : _getMode();
    const apiKey = (() => { try { return localStorage.getItem('groq_api_key'); } catch { return null; } })();
    if (!apiKey || !base64 || !base64.startsWith('data:image')) {
        return { text: '', subject: 'khác' };
    }

    const temperature = m === 'savage' ? 0.95 : (m === 'gentle' ? 0.7 : 0.85);
    const systemPrompt = TUTOR_PROMPTS[m] || TUTOR_PROMPTS.normal;

    try {
        logDecision('paint', 'vision_call', { mode: m });
        const message = await askGroq(apiKey, {
            models: MODEL_CHAIN.vision,
            systemPrompt,
            tools: [], toolChoice: 'none',
            temperature, maxTokens: 400,
            userText: 'Đây là tranh mình vừa vẽ. Nhận xét giúp mình nha.',
            sceneCtx: '{}', history: [],
            imageBase64: base64,
        });

        let raw = (message?.content || '').trim();
        if (!raw) return { text: '', subject: 'khác' };

        // ⭐ 1. Xoá markdown code block nếu có
        raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

        // ⭐ 2. Thử parse JSON chuẩn
        try {
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                let text = (parsed.text || '').trim();
                let subject = (parsed.subject || 'khác').trim().toLowerCase();

                const validSubjects = ['chân dung', 'con vật', 'phong cảnh', 'đồ vật', 'trừu tượng', 'khác'];
                if (!validSubjects.includes(subject)) subject = 'khác';

                if (text) {
                    const CJK_RE = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/g;
                    text = text.replace(CJK_RE, '').trim();
                    return { text, subject };
                }
            }
        } catch (e) {
            console.warn('[Paint] JSON.parse failed, falling back to regex:', e);
        }

        // ⭐ 3. Fallback: Regex bóc tách thủ công nếu JSON.parse lỗi
        const textMatch = raw.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        const subMatch = raw.match(/"subject"\s*:\s*"([^"]*)"/);

        if (textMatch) {
            let text = textMatch[1].replace(/\\n/g, ' ').replace(/\\"/g, '"').trim();
            const CJK_RE = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/g;
            text = text.replace(CJK_RE, '').trim();

            let subject = subMatch ? subMatch[1].toLowerCase() : 'khác';
            const validSubjects = ['chân dung', 'con vật', 'phong cảnh', 'đồ vật', 'trừu tượng', 'khác'];
            if (!validSubjects.includes(subject)) subject = 'khác';

            return { text, subject };
        }

        // ⭐ 4. Fallback cuối: Làm sạch raw text
        const CJK_RE = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/g;
        const fallbackText = raw
            .replace(/[\{\}]/g, '')
            .replace(/"text"\s*:\s*/i, '')
            .replace(/"subject"\s*:\s*/i, '')
            .replace(/"/g, '')
            .trim();

        return { text: fallbackText.slice(0, 400), subject: 'khác' };

    } catch (e) {
        logError('paint', '(vision)', e);
        return { text: '', subject: 'khác' };
    }
}

export async function askAboutPainting(base64, question, mode) {
    const m = MODES.includes(mode) ? mode : _getMode();
    const apiKey = (() => { try { return localStorage.getItem('groq_api_key'); } catch { return null; } })();
    if (!apiKey || !base64) return { text: 'Không thể kết nối AI.' };

    const temperature = m === 'savage' ? 0.9 : (m === 'gentle' ? 0.7 : 0.85);

    try {
        const message = await askGroq(apiKey, {
            models: MODEL_CHAIN.vision,
            systemPrompt: CHAT_PROMPTS[m],
            tools: [], toolChoice: 'none',
            temperature, maxTokens: 250,
            userText: question,
            sceneCtx: '{}', history: [],
            imageBase64: base64,
        });

        const raw = (message?.content || '').trim();
        const CJK_RE = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/g;
        return { text: raw.replace(CJK_RE, '').trim() };
    } catch (e) {
        console.warn('[Paint] askAboutPainting error:', e);
        return { text: 'Có lỗi xảy ra khi kết nối AI.' };
    }
}

export async function generateMoreTips(subject, mode) {
    const m = MODES.includes(mode) ? mode : _getMode();
    const apiKey = (() => { try { return localStorage.getItem('groq_api_key'); } catch { return null; } })();
    if (!apiKey) return '';

    const subjectText = subject && subject !== 'khác' ? subject : 'tự do';
    const prompt = (MORE_TIPS_PROMPTS[m] || MORE_TIPS_PROMPTS.normal).replace(/\{subject\}/g, subjectText);
    const temperature = m === 'savage' ? 0.95 : (m === 'gentle' ? 0.75 : 0.85);

    try {
        const message = await askGroq(apiKey, {
            models: MODEL_CHAIN.chat,
            systemPrompt: prompt,
            tools: [], toolChoice: 'none',
            temperature, maxTokens: 300,
            userText: `Cho mình tips để vẽ ${subjectText} đẹp hơn.`,
            sceneCtx: '{}', history: [],
        });

        const raw = (message?.content || '').trim();
        return raw.slice(0, 500);
    } catch (e) {
        console.warn('[Paint] generateMoreTips error:', e);
        return '';
    }
}

export async function handlePaintDone(base64) {
    const mode = _getMode();

    if (window.emotionCtrl) window.emotionCtrl.trigger('looking', { force: true });

    const result = await analyzePainting(base64, mode);
    let text = result.text;

    if (!text) text = getLocalReaction('done_api_fail', mode) || '(Bạn vẽ đẹp đấy, mình thích!)';

    if (window.emotionCtrl) {
        const emoMap = { gentle: 'happy', normal: 'thinking', savage: 'taunt' };
        window.emotionCtrl.trigger(emoMap[mode] || 'happy', { force: true });
    }

    return { text, subject: result.subject || 'khác' };
}
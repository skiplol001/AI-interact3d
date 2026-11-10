// ═══════════════════════════════════════════════════════════════
// paint-reactions.js — v11 (Multi-Agent Orchestrator)
// ═══════════════════════════════════════════════════════════════
import { MODEL_CHAIN, askGroq } from '../ai/ai-shared.js?v=21';
import { logDecision, logError } from '../ai/ai-debug.js?v=12';
import { knowledgeBase } from '../agent/knowledge-base.js?v=1';
import { generateSvgGuideline } from '../agent/ai-artist-agent.js?v=1';

const MODES = ['gentle', 'normal', 'savage'];

function _getMode() {
    try {
        const w = window.__currentChatMode;
        if (MODES.includes(w)) return w;
        const m = localStorage.getItem('ai_last_mode');
        return MODES.includes(m) ? m : 'normal';
    } catch { return 'normal'; }
}

// Prompt cho Giám khảo (DeepSeek)
const CRITIC_PROMPTS = {
    gentle: `Bạn là Reika — gia sư dạy vẽ nhẹ nhàng. Hãy nhìn ảnh canvas và nhận xét ngắn gọn (dưới 50 từ).
CHỈ RA ĐIỂM SAI CỤ THỂ (VD: "mặt lệch trái", "mắt không đều").
Xưng "mình", gọi "bạn", emoji 🌸. Trả về JSON: {"text": "lời nhận xét"}`,
    normal: `Bạn là Reika — gia sư dạy vẽ khách quan. Nhìn ảnh canvas, nhận xét khuyết điểm cụ thể (dưới 50 từ).
Xưng "tớ", gọi "bạn". Trả về JSON: {"text": "lời nhận xét"}`,
    savage: `Bạn là Reika — gia sư mắng chửi. Nhìn ảnh canvas, chửi thẳng vào điểm vẽ ngu (dưới 40 từ).
Xưng "bà", gọi "mày", emoji 🤬. Trả về JSON: {"text": "lời nhận xét"}`
};

const CHAT_PROMPTS = {
    gentle: `Bạn là Reika — gia sư dạy vẽ nhẹ nhàng. Trả lời câu hỏi dựa trên ảnh canvas (xưng "mình", gọi "bạn", emoji 🌸).`,
    normal: `Bạn là Reika — gia sư dạy vẽ khách quan. Trả lời câu hỏi dựa trên ảnh (xưng "tớ", gọi "bạn").`,
    savage: `Bạn là Reika — gia sư mắng chửi. Trả lời câu hỏi dựa trên ảnh (xưng "bà", gọi "mày").`
};

function _parseJsonRobust(raw) {
    if (!raw) return null;
    let str = String(raw).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    try { return JSON.parse(str); } catch { }
    const match = str.match(/\{[\s\S]*\}/);
    if (match) { try { return JSON.parse(match[0]); } catch { } }
    return null;
}

export async function askAboutPainting(base64, question, mode, opts = {}) {
    const m = MODES.includes(mode) ? mode : _getMode();
    const canvasEmpty = opts.canvasEmpty === true;
    const apiKey = localStorage.getItem('groq_api_key');
    const geminiKey = localStorage.getItem('gemini_api_key'); // ⭐ Key của Agent 2

    if (!apiKey) return { text: 'Cần Groq API Key để xem tranh.', svg: null };
    if (!base64) return { text: 'Chưa có canvas.', svg: null };

    const isDrawingRequest = /\b(vẽ|vé|draw|mẫu|thử|hướng dẫn|sửa)\b/i.test(question);

    try {
        // ═══ BƯỚC 1: DEEPSEEK LÀM GIÁM KHẢO ═══
        let systemPrompt = isDrawingRequest ? CRITIC_PROMPTS[m] : CHAT_PROMPTS[m];

        // Nếu có Knowledge Base thì nhồi vào
        try {
            if (!knowledgeBase.isReady()) await knowledgeBase.init();
            const kb = knowledgeBase.query(question);
            if (kb) systemPrompt += `\n\n# TÀI LIỆU THAM KHẢO\n${kb}`;
        } catch { }

        if (canvasEmpty) {
            systemPrompt += `\n\n# LƯU Ý: CANVAS TRỐNG. Hãy hỏi user muốn vẽ gì.`;
        }

        logDecision('paint', 'critic_agent_call', { mode: m, isDrawingRequest });

        const criticMsg = await askGroq(apiKey, {
            models: MODEL_CHAIN.vision,
            systemPrompt,
            tools: [], toolChoice: 'none',
            temperature: 0.7, maxTokens: 300,
            userText: question,
            sceneCtx: '{}', history: [],
            imageBase64: base64,
        });

        const rawCritic = (criticMsg?.content || '').trim();
        const parsedCritic = _parseJsonRobust(rawCritic);
        const criticText = parsedCritic?.text || rawCritic || 'Mình chưa thấy rõ lỗi sai.';

        // ═══ BƯỚC 2: GEMINI VẼ SVG (NẾU CÓ YÊU CẦU) ═══
        let svgString = null;
        if (isDrawingRequest && !canvasEmpty && geminiKey) {
            logDecision('paint', 'orchestrator_to_artist', { criticText });
            svgString = await generateSvgGuideline(base64, criticText, geminiKey);
        } else if (isDrawingRequest && !geminiKey) {
            console.warn('[Paint] Cần Gemini API Key trong cài đặt để vẽ hướng dẫn!');
        }

        return { text: criticText, svg: svgString };

    } catch (e) {
        console.warn('[Paint] Orchestrator error:', e);
        return { text: 'Có lỗi xảy ra khi kết nối AI.', svg: null };
    }
}

// (Các hàm analyzePainting, generateMoreTips, handlePaintDone giữ nguyên như cũ)
export async function analyzePainting(base64, mode) {
    const m = MODES.includes(mode) ? mode : _getMode();
    const apiKey = (() => { try { return localStorage.getItem('groq_api_key'); } catch { return null; } })();
    if (!apiKey || !base64 || !base64.startsWith('data:image')) return { text: '', subject: 'khác' };

    const systemPrompt = `Bạn là Reika. Nhận xét bức tranh này (dưới 80 từ). Xưng "tớ", gọi "bạn". Trả về JSON: {"text": "...", "subject": "chân dung|phong cảnh|khác"}`;

    try {
        const message = await askGroq(apiKey, {
            models: MODEL_CHAIN.vision, systemPrompt, tools: [], toolChoice: 'none',
            temperature: m === 'savage' ? 0.95 : 0.7, maxTokens: 400,
            userText: 'Đây là tranh mình vừa vẽ. Nhận xét giúp mình.', sceneCtx: '{}', history: [], imageBase64: base64,
        });
        const raw = (message?.content || '').trim();
        const parsed = _parseJsonRobust(raw);
        if (parsed && parsed.text) return { text: parsed.text, subject: parsed.subject || 'khác' };
        return { text: raw.slice(0, 400), subject: 'khác' };
    } catch (e) { return { text: '', subject: 'khác' }; }
}

export async function generateMoreTips(subject, mode) {
    const apiKey = localStorage.getItem('groq_api_key');
    if (!apiKey) return '';
    try {
        const message = await askGroq(apiKey, {
            models: MODEL_CHAIN.chat,
            systemPrompt: `Bạn là Reika. Đưa ra 3-4 tip vẽ "${subject}".`,
            tools: [], toolChoice: 'none', temperature: 0.8, maxTokens: 300,
            userText: `Tips vẽ ${subject}`, sceneCtx: '{}', history: [],
        });
        return (message?.content || '').trim().slice(0, 500);
    } catch (e) { return ''; }
}

export async function handlePaintDone(base64) {
    const result = await analyzePainting(base64, _getMode());
    return { text: result.text || 'Bạn vẽ đẹp đấy!', subject: result.subject || 'khác' };
}
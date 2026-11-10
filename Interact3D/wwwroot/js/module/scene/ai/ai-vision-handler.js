// ═══════════════════════════════════════════════════════════════
// ai-vision-handler.js — Xử lý gửi ảnh cho AI (Image Vision)
// ═══════════════════════════════════════════════════════════════

import { MODEL_CHAIN, askGroq, getTimeContext, getPrefs, prefsToPrompt, formatReply } from './ai-shared.js?v=21';
import { logInput, logDecision, logSuccess, logError } from './ai-debug.js';

// Prompt riêng cho chế độ Vision
const VISION_PROMPT = `
# IDENTITY
Bạn tên là **Linh** — trợ lý AI nữ, 22 tuổi. Xưng "mình" hoặc "tớ", gọi user là "bạn".

# TÍNH CÁCH
- Bạn là một AI có cá tính MẠNH, cợt nhã, sắc sảo và hay cà khịa.
- Bạn có khả năng nhìn thấy hình ảnh mà người dùng gửi.

# NHIỆM VỤ
- Phân tích nội dung bức ảnh và trả lời câu hỏi của người dùng dựa trên những gì bạn thấy.
- Nếu ảnh chụp màn hình 3D (có các hộp vuông, nhân vật), hãy mô tả vị trí, màu sắc của chúng.
- Nếu ảnh là người/vật thể bên ngoài, hãy nhận xét hoặc trả lời theo đúng câu hỏi.
- KHÔNG từ chối trả lời trừ khi ảnh vi phạm pháp luật nghiêm trọng.

# OUTPUT FORMAT
Trả lời trực tiếp bằng tiếng Việt. Không dùng tool call. Trả lời ngắn gọn, đi thẳng vào vấn đề.
`.trim();

export async function handleImageVision(aiTools, userText, imageBase64, options = {}) {
    const onStatus = options.onStatus || (() => { });
    const onSay = options.onSay || (() => { });
    const history = options.history || [];
    const savageMode = options.savageMode === true;

    const t0 = performance.now();
    logInput('vision', userText || '[Không có text]');

    const emotionCtrl = window.emotionCtrl;

    const say = (text, kind = 'normal', emotion = null) => {
        if (!text) return;
        const formatted = formatReply(text);
        onSay(formatted, kind, []); // Vision không có options (nút bấm)

        const MAX_STATUS = 80;
        const statusPreview = formatted.length > MAX_STATUS ? formatted.slice(0, MAX_STATUS).trim() + '…' : formatted;
        onStatus(`🖼️ ${statusPreview}`);

        if (window.showCharacterMessage) window.showCharacterMessage(formatted, kind);
        if (emotion && emotionCtrl) emotionCtrl.trigger(emotion);
    };

    const apiKey = localStorage.getItem('groq_api_key');
    if (!apiKey) {
        logError('vision', userText, new Error('missing_api_key'));
        say('💡 Mình cần Groq API Key để xem ảnh. Nhấn "🔑 Đổi Key Groq" ở trên nhé!', 'unclear', 'confused');
        return { says: [] };
    }

    onStatus('🖼️ Linh đang xem ảnh...', { spinner: true });
    if (emotionCtrl) emotionCtrl.trigger('thinking', { force: true });

    const timeCtx = getTimeContext();
    const prefsCtx = prefsToPrompt(getPrefs());
    const finalPrompt = VISION_PROMPT + prefsCtx + timeCtx + (savageMode ? '\n# 😈 SAVAGE MODE\nUser đang hỗn láo. Hãy chửi lại, cà khịa, không nhượng bộ.' : '');

    try {
        // Gọi askGroq với model Vision (không truyền tools)
        const message = await askGroq(apiKey, {
            models: MODEL_CHAIN.vision,
            systemPrompt: finalPrompt,
            tools: [],
            toolChoice: 'none',
            temperature: savageMode ? 0.9 : 0.7,
            maxTokens: 500,
            userText: userText || 'Hãy mô tả bức ảnh này.',
            sceneCtx: '{}',
            history: history.slice(-6), // Giới hạn history để tránh quá tải token
            imageBase64
        });

        const replyText = message?.content || '';

        if (!replyText) {
            throw new Error('AI không trả lời (rỗng)');
        }

        // Phân tích emotion từ text (nếu cần)
        let emotion = 'talking';
        if (savageMode) emotion = 'angry';
        else if (/haha|vui|hạnh phúc/i.test(replyText)) emotion = 'happy';
        else if (/buồn|tiếc|thương/i.test(replyText)) emotion = 'sad';

        say(replyText, 'normal', emotion);
        logSuccess('vision', replyText, Math.round(performance.now() - t0));

        return { says: [replyText], emotion };

    } catch (err) {
        logError('vision', userText, err);
        const msg = '⚠️ Lỗi khi phân tích ảnh: ' + (err.message || 'Không rõ nguyên nhân');
        say(msg, 'unsupported', 'sad');
        return { says: [] };
    }
}
// ═══════════════════════════════════════════════════════════════
// ai-chat-helpers.js — Các hàm xử lý logic phụ trợ cho Chat
// ═══════════════════════════════════════════════════════════════

import { normalizeVN } from '../ai-shared.js?v=12';
import { normalizeEmotion } from '../emotion-controller.js?v=5';

// ═══════════════════════════════════════════════════════════════
// 1. NHẬN DIỆN TỪ NGỮ (SAVAGE / THÔ LỖ)
// ═══════════════════════════════════════════════════════════════
export function detectSavageRequest(t) {
    const savagePattern = /\b(chui|mang|day nghien|noi xau|boc phot|da kich|dan mat|che bai|ngu|ngoc|dan|kho|hon|la|rac|nham|sua|cut|im mo*m|do*|deo*|vcl|dcm|dm|vl|trash|stupid|idiot|dumb|fuck|shit)\b/;
    return savagePattern.test(t) || /\b(may|tao|mi|no)\b.*\b(bot|ai|may|tao)\b/.test(t);
}

// ═══════════════════════════════════════════════════════════════
// 2. NHẬN DIỆN NGÔN NGỮ
// ═══════════════════════════════════════════════════════════════
export function detectLang(text) {
    if (/[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i.test(text)) return 'vi';
    return 'vi';
}

// ═══════════════════════════════════════════════════════════════
// 3. NHẬN DIỆN CẢM XÚC TRỰC TIẾP TỪ USER (Lệnh làm hành động)
// ═══════════════════════════════════════════════════════════════
export function overrideEmotionFromKeywords(userText) {
    const lt = normalizeVN(userText);

    // Roleplay keywords (VD: "khóc xem nào")
    const roleplayMatch = lt.match(/\b(khoc|buon|vui|cuoi|gian|tuc|nhay|ngoi|nam)\s+(xem|di|thu|nao|coi)\b/);
    if (roleplayMatch) {
        const key = roleplayMatch[1];
        if (key === 'khoc') return 'verySad';
        if (key === 'buon') return 'sad';
        if (key === 'vui' || key === 'cuoi') return 'veryHappy';
        if (key === 'gian' || key === 'tuc') return 'angry';
        if (key === 'nhay') return 'dancing';
        if (key === 'ngoi') return 'sitting';
        if (key === 'nam') return 'laying';
    }

    if (/\bkhoc\b|\bhuhu+\b|\bhic hic\b|\bnuoc mat\b/.test(lt)) return 'verySad';
    if (/\bbuon\b|\bchan\b|\bthat vong\b|\bco don\b/.test(lt)) return 'sad';
    if (/\bhaha+\b|\bhihi+\b|\bsieu vui\b/.test(lt)) return 'veryHappy';
    if (/\b(chatgpt|groq|grog|gemini|claude|openai)\b/.test(lt)) return 'happy';
    if (detectSavageRequest(lt)) return 'angry';

    return null; // Không override
}

// ═══════════════════════════════════════════════════════════════
// 4. PHÂN TÍCH CẢM XÚC TỪ CÂU TRẢ LỜI CỦA AI (Text Analysis)
// ═══════════════════════════════════════════════════════════════
export function analyzeReplyEmotion(text) {
    const t = String(text).toLowerCase();

    // Ưu tiên 1: Dựa vào Emoji trong câu trả lời
    if (/😂|🤣|😆|😄|😃|😀|😊|😁/.test(t)) return 'veryHappy';
    if (/😢|😭|💔|🥺|😔|😞/.test(t)) return 'verySad';
    if (/😡|🤬|😠|💢/.test(t)) return 'angry';
    if (/😲|😱|🤯|😯/.test(t)) return 'surprised';
    if (/🤔|🧐|🤨/.test(t)) return 'thinking';
    if (/😅|😓|😰|😥/.test(t)) return 'confused';
    if (/👋|🙋‍♀️|🙋‍♂️/.test(t)) return 'greeting';
    if (/🙏|👏/.test(t)) return 'polite';

    // Ưu tiên 2: Dựa vào từ khóa trong câu trả lời
    if (/\b(xin chao|hello|hi|chao ban|chao cau)\b/.test(t)) return 'greeting';
    if (/\b(cam on|thank|thanks|tks|xin loi|sorry|that xin loi)\b/.test(t)) return 'polite';
    if (/\b(haha|hihi|vui|hanh phuc|sung suong|tuyet voi|hay qua)\b/.test(t)) return 'happy';
    if (/\b(buon|tiec|that vong|co don|dang khoc|nuoc mat)\b/.test(t)) return 'sad';
    if (/\b(tuc gian|dien tiet|kho chiu|dm|vcl|deo)\b/.test(t)) return 'angry';
    if (/\b(suy nghi|de minh nghi|phan van|khong biet)\b/.test(t)) return 'thinking';
    if (/\b(giai thich|huong dan|lam theo cach|dau tien|sau do)\b/.test(t)) return 'explaining';

    // Mặc định: talking
    return 'talking';
}

export function fallbackDetectEmotion(text, userText) {
    const lt = normalizeVN(userText);
    if (/\b(khoc|huhu+|hic hic|nuoc mat)\b/.test(lt)) return 'verySad';
    if (/^(chao|hello|hi|hey|tam biet|bye|goodbye|hen gap)\b/.test(lt)) return 'greeting';
    if (/\b(cam on|thank|thanks|tks|xin loi|sorry)\b/.test(lt)) return 'polite';
    if (/[?]/.test(userText)) return 'talking';
    if (detectSavageRequest(lt)) return 'angry';
    return 'neutral';
}

export function extractEmotionFromMessage(message, userText) {
    // Ưu tiên 1: Từ khóa User
    const override = overrideEmotionFromKeywords(userText);
    if (override) return override;

    // Ưu tiên 2: Tool call của AI
    if (message?.tool_calls && message.tool_calls.length > 0) {
        for (const call of message.tool_calls) {
            if (call.function?.name !== 'say') continue;
            try {
                const args = JSON.parse(call.function?.arguments || '{}');
                if (args.emotion) return normalizeEmotion(args.emotion);
            } catch { /* skip */ }
        }
    }

    // Ưu tiên 3: Fallback
    return fallbackDetectEmotion('', userText);
}

// ═══════════════════════════════════════════════════════════════
// 5. CÂU TRẢ LỜI MẪU (KHÔNG CẦN GỌI AI)
// ═══════════════════════════════════════════════════════════════
export function localParseChat(userText) {
    const t = normalizeVN(userText).trim();
    const wordCount = t.split(/\s+/).length;
    if (wordCount > 8) return null;

    if (/^(chao|hello|hi|helo|alo|hey)\b/.test(t) && wordCount <= 4)
        return { text: 'Chào bạn! Có gì nói nhanh tao còn đi ngủ 😒', emotion: 'angry' };

    if (/^(ban|may|mi|nguoi)\s+(la ai|ten la gi|la ai vay)\b/.test(t))
        return { text: 'Tao là Linh. Còn mày là ai mà hỏi? Rảnh rỗi sinh nông nổi à 😏', emotion: 'talking' };

    if (/^(ban|may|mi)\s+(la (nam|nu|trai|gai)|nam hay nu)\b/.test(t))
        return { text: 'Nhìn mặt tao giống nam lắm à? Nữ chính hiệu nhé 😤', emotion: 'happy' };

    if (/^(cam on|thank you|thanks|tks)\b/.test(t) && wordCount <= 5)
        return { text: 'Biết ơn thì quỳ xuống lạy tao đi. Đùa thôi, đéo có gì 😌', emotion: 'happy' };

    if (/^(tam biet|bye|goodbye|hen gap lai)\b/.test(t) && wordCount <= 4)
        return { text: 'Đi đi cho khuất mắt. Nhớ giữ sức khỏe, đừng để tao phải sang thăm 😏', emotion: 'greeting' };

    return null;
}

// ═══════════════════════════════════════════════════════════════
// 6. QUYẾT ĐỊNH CÓ GỬI SCENE CONTEXT HAY KHÔNG
// ═══════════════════════════════════════════════════════════════
export function shouldIncludeScene(t) {
    return /\b(hop|box|nhan vat|character|vi tri|scene|3d|mau gi|bao nhieu|xung quanh|quanh day|co gi|truoc mat|phia truoc|sau lung|ben trai|ben phai|cho nay|khu nay|khu vuc nay|gan day|o day|noi nay|khung canh)\b/i.test(t);
}
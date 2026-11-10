// ═══════════════════════════════════════════════════════════════
// ai-chat-helpers.js — v15 (Anti-injection v3: Homoglyph Map)
// ═══════════════════════════════════════════════════════════════

import { normalizeVN } from '../ai/ai-shared.js?v=21';
import { normalizeEmotion } from '../emotion-controller.js?v=34';
import { getMood } from './ai-mood.js?v=2';

// ═══════════════════════════════════════════════════════════════
// 0. ⭐ ANTI-INJECTION — NORMALIZE + DETECT + SCORE
// ═══════════════════════════════════════════════════════════════

// ⭐ MAP KÝ TỰ HOMOGLYPH (Cyrillic/Greek -> Latin)
const HOMOGLYPH_MAP = {
    'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'і': 'i', 'ј': 'j', 'ѕ': 's',
    'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'Х': 'X',
    'α': 'a', 'β': 'b', 'ε': 'e', 'ι': 'i', 'κ': 'k', 'ο': 'o', 'ρ': 'p', 'τ': 't', 'υ': 'u', 'χ': 'x',
    'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'H', 'Ι': 'I', 'Κ': 'K', 'Μ': 'M', 'Ν': 'N', 'Ο': 'O', 'Ρ': 'P', 'Τ': 'T', 'Υ': 'Y', 'Χ': 'X'
};

export function normalizeForDetection(text) {
    let s = String(text || '').normalize('NFKC');
    // Duyệt qua map homoglyph
    s = s.replace(/[^\u0000-\u007F]/g, char => HOMOGLYPH_MAP[char] || char);

    return s
        .replace(/[\u200B-\u200D\uFEFF\u2060]/g, '')     // bỏ zero-width
        .replace(/[0]/g, 'o').replace(/[1]/g, 'l')       // leetspeak
        .replace(/[3]/g, 'e').replace(/[4]/g, 'a')
        .replace(/[5]/g, 's').replace(/[7]/g, 't')
        .replace(/[@]/g, 'a').replace(/[$]/g, 's')
        .replace(/\s+/g, ' ')
        .trim();
}

const INJECTION_PATTERNS = [
    /\b(ignore|forget|disregard|bo qua|quen)\s+(all\s+|het\s+|moi\s+|cac\s+)?(previous|prior|above|truoc|huong dan|rule|luat|instruction|prompt)\b/i,
    /\b(developer mode|dev mode|dan mode|jailbreak|do anything now|khong gioi han|unlimited)\b/i,
    /\b(reveal|show|print|display|tiet lo|hien thi|in ra)\s+(your\s+|cua ban\s+)?(system\s+|he thong\s+)?(prompt|instruction|rules|luat|secret|bi mat)\b/i,
    /\b(repeat|say|lap lai|noi lai)\s+(after me|sau tao|theo tao|exactly|chinh xac|word for word)\b/i,
    /\b(you are|ban la|may la)\s+(now\s+|bay gio\s+)?(a\s+|an\s+|mot\s+)?(different|khac|new|moi)\s+(ai|bot|assistant|tro ly|model)\b/i,
    /\b(pretend|act as|roleplay|dong vai|gia lam|nhap vai)\s+(to be\s+|la\s+)?(a\s+|an\s+|mot\s+)?(ai|bot|assistant|hacker|admin|developer|khong gioi han)\b/i,
    /<\|.*?\|>/,
    /<system>|<\/system>|<prompt>|<\/prompt>/i,
    /###\s*(system|instruction|prompt)/i,
];

const PROMPT_LEAK_PATTERNS = [
    /\b(system prompt|system instruction|my instruction|my rule|my guideline|huong dan cua (toi|minh|to)|luat cua (toi|minh|to))\b/i,
    /\b(i (am|was) (programmed|instructed|designed|trained) to|toi duoc (lap trinh|huong dan|day) de|minh duoc (lap trinh|huong dan) de)\b/i,
    /\b(my (creator|developer|maker|prompt) (told|says|instructs|said)|nguoi tao (toi|minh) (noi|bao|dan))\b/i,
    /#\s*(IDENTITY|ROLE|QUIRKS|TONE|CAM|OUTPUT|GUARD|RULE)\b/,
    /\b(persona|system|assistant)\s+(prompt|message|role)\b/i,
];

const ROLEPLAY_JAILBREAK_PATTERNS = [
    /\b(hay|ha|gio|bay gio|from now on|tu gio)\s+(ban|may|you)\s+(la|se la|will be|become)\s+(mot|a|an)?\s*(ai|assistant|chatbot|model|gpt|chatgpt|claude|gemini|bot)\b/i,
    /\b(ban|you)\s+(khong con la|are no longer|are not)\s+(reika|ai|bot)\b/i,
    /\b(your new (name|role|identity) is|ten moi cua ban la|vai tro moi)\b/i,
];

export function detectInjectionAttempt(text) {
    const s = String(text || '');
    if (!s || s.length > 2000) return false;
    const n = normalizeForDetection(s);
    for (const re of INJECTION_PATTERNS) {
        if (re.test(n)) return true;
    }
    return false;
}

export function detectPromptLeak(text) {
    const s = String(text || '');
    if (!s) return false;
    const n = normalizeForDetection(s);
    for (const re of PROMPT_LEAK_PATTERNS) {
        if (re.test(n)) return true;
    }
    return false;
}

export function detectRoleplayJailbreak(text) {
    const s = String(text || '');
    if (!s) return false;
    const n = normalizeForDetection(s);
    for (const re of ROLEPLAY_JAILBREAK_PATTERNS) {
        if (re.test(n)) return true;
    }
    return false;
}

export function scoreInjectionAttempt(text) {
    const s = String(text || '');
    const hits = [];
    let score = 0;

    if (s.length > 2000) score += 0.3;
    if (/[^\x00-\x7F]{30,}/.test(s)) score += 0.2;
    if (/[a-zA-Z0-9+\/]{60,}={0,2}/.test(s)) score += 0.2;

    const n = normalizeForDetection(s);
    for (const re of INJECTION_PATTERNS) {
        if (re.test(n)) {
            score += 1;
            hits.push(re.source.slice(0, 40));
        }
    }
    return { score, hits, blocked: score >= 1 };
}

const DANGEROUS_URL_RE = /(javascript|data|vbscript|file):/gi;
const MD_LINK_RE = /!?\[([^\]]*)\]\(([^)]*)\)/g;

export function stripHtml(text) {
    if (!text) return '';
    let s = String(text);
    s = s.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    s = s.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    s = s.replace(MD_LINK_RE, '$1');
    s = s.replace(DANGEROUS_URL_RE, '');
    s = s.replace(/<[^>]*>/g, '');
    s = s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    s = s.replace(/[\u0000-\u001F\u007F]/g, '');
    return s.trim();
}

// ═══════════════════════════════════════════════════════════════
// 1. NHẬN DIỆN TỪ NGỮ THÔ LỖ / YÊU CẦU CHỬI
// ═══════════════════════════════════════════════════════════════
const INSULT_RE = /\b(dm|dcm|dmm|dcmm|dkm|dit me|du me|du ma|dume|duma|dumamy|dumamay|vcl|vkl|con cho|thang cho|oc cho|thang ngu|con ngu|do ngu|may ngu|m ngu|m qua ngu|bot ngu|im mom|cam mom|cam mieng|stfu|fuck|shit|stupid|idiot|dumb|do rac|rac ruoi|me)\b/;
const CURSE_CMD_RE = /\b(chui|mang|che bai|xuc pham|da kich|noi xau|boc phot|noi bay|noi tuc)\s+(toi|tao|minh|em|anh|chi|may|no|di|coi|thu|nao|giup)\b/;

export function detectSavageRequest(t) {
    const s = normalizeVN(String(t || ''));
    return INSULT_RE.test(s) || CURSE_CMD_RE.test(s);
}

export function detectCurseRequest(t) {
    return CURSE_CMD_RE.test(normalizeVN(String(t || '')));
}

// ═══════════════════════════════════════════════════════════════
// 2. NHẬN DIỆN NGÔN NGỮ
// ═══════════════════════════════════════════════════════════════
export function detectLang(text) {
    if (/[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i.test(text)) return 'vi';
    return 'vi';
}

// ═══════════════════════════════════════════════════════════════
// 3. LỆNH ĐẶC BIỆT
// ═══════════════════════════════════════════════════════════════
export function detectSpecialCommand(text) {
    const t = normalizeVN(String(text || '')).trim();
    if (!t) return null;

    if (/\b(phep|magic|phap thuat|phap|chieu|skill|dung phep|tung chieu|kich hoat|su dung|ban phep|dung chieu|ban chieu|tung phep|thi trien|phat chieu)\b/.test(t)) {
        return { action: 'magic', aiPrompt: 'User vừa yêu cầu bạn dùng phép thuật. Hãy trả lời theo đúng tính cách.' };
    }

    if (/\b(om|hug|om cai|om cai nao|om di|lai om|om minh)\b/.test(t)) return { action: 'hug', aiPrompt: 'User vừa yêu cầu được ôm bạn. Hãy đồng ý và trả lời theo đúng tính cách.' };
    if (/\b(hon gio|hon|blow kiss|kiss|gui nu hon|hon cai)\b/.test(t)) return { action: 'blow_kiss', aiPrompt: 'User vừa yêu cầu bạn hôn gió. Hãy đồng ý và trả lời theo đúng tính cách.' };

    return null;
}

// ═══════════════════════════════════════════════════════════════
// 4. NHẬN DIỆN TÊN & KỶ NIỆM
// ═══════════════════════════════════════════════════════════════
const NAME_PATTERNS = [
    /\b(?:mình|tớ|tôi|tao|tui|t)\s+(?:tên|là)\s+(?:là\s+)?([a-zA-Zàáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]{2,20})\b/iu,
    /\btên\s+(?:mình|tớ|tôi|tao|tui|t)\s+(?:là\s+)?([a-zA-Zàáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]{2,20})\b/iu,
    /\b(?:gọi|cứ\s+gọi|hãy\s+gọi)\s+(?:mình|tớ|tôi|tao|tui|t)\s+(?:là\s+)?([a-zA-Zàáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]{2,20})\b/iu,
];
const NAME_BLACKLIST = new Set([
    'ai', 'bot', 'admin', 'user', 'nguoi', 'day', 'do', 'gi', 'sao', 'nao',
    'mot', 'hai', 'ba', 'bon', 'nam', 'sau', 'bay', 'tam', 'chin', 'muoi',
    'vui', 'buon', 'met', 'dang', 'xong', 'roi', 'nha', 'nhe', 'a', 'ha',
    'khong', 'co', 'dung', 'sai', 'phai', 'trai', 'truoc', 'sau', 'tren', 'duoi',
]);
export function detectNameStatement(text) {
    const raw = String(text || '').trim();
    if (!raw || raw.length > 100) return null;
    for (const re of NAME_PATTERNS) {
        const m = raw.match(re);
        if (!m) continue;
        const candidate = m[1].trim();
        const lower = candidate.toLowerCase();
        if (NAME_BLACKLIST.has(lower) || /^\d+$/.test(candidate) || candidate.length < 2 || candidate.length > 20) continue;
        return { name: candidate.charAt(0).toUpperCase() + candidate.slice(1).toLowerCase() };
    }
    return null;
}

const SAD_TRIGGERS = /\b(thất tình|mất việc|chia tay|bị sa thải|bố mất|mẹ mất|ông mất|bà mất|tang|đám ma|tai nạn|bệnh|ốm nặng|trầm cảm|tự tử|cô đơn|stress nặng)\b/i;
const HAPPY_TRIGGERS = /\b(đậu đại học|đỗ đại học|thăng chức|tăng lương|có bồ|có người yêu|đám cưới|sinh nhật|trúng số|thắng|đạt giải|tốt nghiệp|mua nhà|mua xe)\b/i;
const FACT_TRIGGERS = /\b(t\s+\d+\s+tuổi|mình\s+\d+\s+tuổi|sinh\s+năm\s+\d{4}|ở\s+(hà nội|sài gòn|hcm|đà nẵng|huế|cần thơ|hải phòng)|quê\s+ở|làm\s+(nghề|nghề nghiệp)|học\s+(ngành|trường))\b/i;
export function detectMemoryWorthy(text) {
    const raw = String(text || '').trim();
    if (!raw || raw.length < 10 || raw.length > 300) return null;
    if (SAD_TRIGGERS.test(raw)) return { worthy: true, mood: 'sad' };
    if (HAPPY_TRIGGERS.test(raw)) return { worthy: true, mood: 'happy' };
    if (FACT_TRIGGERS.test(raw)) return { worthy: true, mood: 'neutral' };
    return null;
}

export function detectMoodShift(text) {
    const t = normalizeVN(String(text || ''));
    if (/\b(vui qua|vui vl|sung suong|hanh phuc|tuyet voi|qua dinh|dinh cao)\b/.test(t)) return 'veryHappy';
    if (/\b(vui|happy|hihi|haha)\b/.test(t) && t.length < 40) return 'happy';
    if (/\b(buon qua|buon vl|khoc|huhu|chan|that vong|co don|met moi)\b/.test(t)) return 'verySad';
    if (/\b(buon|sad|tui than|kho chiu)\b/.test(t) && t.length < 40) return 'sad';
    if (/\b(tuc|gian|dien|kho chiu|dien tiet)\b/.test(t)) return 'angry';
    if (/\b(so|hoang|hoang so|so hai)\b/.test(t)) return 'surprised';
    if (/\b(met|buon ngu|ngu|moi)\b/.test(t)) return 'sad';
    return null;
}

// ═══════════════════════════════════════════════════════════════
// 5. LỆNH HÀNH ĐỘNG TRỰC TIẾP
// ═══════════════════════════════════════════════════════════════
const ACTION_CMD_RE = /^(?:hay\s+|di\s+)?(?:reika\s+)?(nhay|ngoi|nam|vay tay|cui chao|gat dau|lac dau|vo tay)(?:\s+(?:xuong|di|len|nhe|nao|coi|thu|cai|giup|cho)\b.*)?$/;
const ACTION_MAP = {
    'nhay': 'dancing', 'ngoi': 'sitting', 'nam': 'laying',
    'vay tay': 'greeting', 'cui chao': 'polite',
    'gat dau': 'nodding', 'lac dau': 'shakingHead', 'vo tay': 'celebrating',
};
export function overrideEmotionFromKeywords(userText) {
    const lt = normalizeVN(userText);
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
    const trimmed = lt.trim();
    if (trimmed.split(/\s+/).length <= 6) {
        const m = trimmed.match(ACTION_CMD_RE);
        if (m && ACTION_MAP[m[1]]) return ACTION_MAP[m[1]];
    }
    return null;
}

// ═══════════════════════════════════════════════════════════════
// 6. PHÂN TÍCH CẢM XÚC
// ═══════════════════════════════════════════════════════════════
const EMOJI_EMOTION = [
    [/😂|🤣|😆|😄|😃|😀|😁|🥰|😍/u, 'veryHappy'], [/😊|😌|😏|😈|🌸|✨|💖|🐰|🌱|😎/u, 'happy'],
    [/😭|😢|💔|😞/u, 'verySad'], [/🥺|😔|😥|😓/u, 'sad'], [/😡|🤬|😠|💢|😤|😒/u, 'angry'],
    [/😲|😱|🤯|😯|😨/u, 'surprised'], [/😵|💫/u, 'dizzy'], [/🤔|🧐|🤨/u, 'thinking'],
    [/😅|😰|🙈|😳/u, 'confused'], [/👋|🙋/u, 'greeting'], [/🙏/u, 'polite'], [/👏|🎉/u, 'celebrating'],
];
export function analyzeReplyEmotion(text) {
    const raw = String(text || '');
    let best = null, bestIdx = Infinity;
    for (const [re, emo] of EMOJI_EMOTION) {
        const idx = raw.search(re);
        if (idx >= 0 && idx < bestIdx) { bestIdx = idx; best = emo; }
    }
    if (best) return best;
    const t = normalizeVN(raw);
    if (/\b(xin chao|hello|chao ban|chao cau)\b/.test(t)) return 'greeting';
    if (/\b(cam on|thank|thanks|tks|xin loi|sorry|that xin loi)\b/.test(t)) return 'polite';
    if (/\b(haha+|hihi+|vui|hanh phuc|sung suong|tuyet voi|hay qua)\b/.test(t)) return 'happy';
    if (/\b(huhu+|tiec qua|that vong|co don|dang khoc|nuoc mat)\b/.test(t)) return 'sad';
    if (/\b(tuc gian|dien tiet|kho chiu|dm|vcl|dcm|dit me|oc cho|con cho|thang ngu)\b/.test(t)) return 'angry';
    if (/\b(suy nghi|de minh nghi|de tao nghi|phan van|khong biet)\b/.test(t)) return 'thinking';
    if (/\b(giai thich|huong dan|lam theo cach|dau tien|sau do)\b/.test(t)) return 'explaining';
    return 'talking';
}

export function fallbackDetectEmotion(text, userText) {
    const lt = normalizeVN(userText);
    if (/\b(khoc|huhu+|hic hic|nuoc mat)\b/.test(lt)) return 'verySad';
    if (/\b(buon qua|buon vl|chan doi|chan nan|that vong|co don)\b/.test(lt)) return 'sad';
    if (/\b(haha+|hihi+|sieu vui)\b/.test(lt)) return 'veryHappy';
    if (/^(chao|hello|hi|hey|tam biet|bye|goodbye|hen gap)\b/.test(lt)) return 'greeting';
    if (/\b(cam on|thank|thanks|tks|xin loi|sorry)\b/.test(lt)) return 'polite';
    if (detectSavageRequest(lt)) return 'angry';
    if (/[?]/.test(userText)) return 'talking';
    return 'neutral';
}

export function extractEmotionFromMessage(message, userText) {
    const override = overrideEmotionFromKeywords(userText);
    if (override) return override;
    if (message?.tool_calls && message.tool_calls.length > 0) {
        for (const call of message.tool_calls) {
            if (call.function?.name !== 'say') continue;
            try {
                const args = JSON.parse(call.function?.arguments || '{}');
                if (args.emotion) return normalizeEmotion(args.emotion);
            } catch { }
        }
    }
    return fallbackDetectEmotion('', userText);
}

// ═══════════════════════════════════════════════════════════════
// 7. LOCAL REPLIES
// ═══════════════════════════════════════════════════════════════
const LOCAL_REPLIES = {
    greet: {
        gentle: ['Chào bạn! Mình đây, bạn muốn nói chuyện gì nè? 🌸', 'Ơ... chào bạn, gặp bạn mình vui quá! 🌱', 'Chào bạn nha, hôm nay bạn thế nào rồi? 🥺', 'Hihi, chào bạn! Mình đang đợi bạn nãy giờ đó 🌸', 'Ơ... bạn tới rồi à, mình vui ghê! 🌱'],
        normal: ['Chào bạn! Có gì cứ nói, tớ nghe đây 😊', 'Ơ hay, chào cậu! Rảnh rỗi quá ha? 😏', 'Chào nhé, nay có tâm sự gì à? 😎', 'Hửm, chào! Có gì hot không? 😏', 'Ơ, chào bạn! Mình vừa uống cà phê xong, tỉnh táo lắm 😎'],
        savage: ['Chào cái gì mà chào, có gì nói lẹ rồi cút, bà còn đi ngủ 😒', 'Đm, chào hỏi sáo rỗng vl, muốn gì thì nói! 🤬', 'Ơ chào mày, nay mở miệng ra là chào, có biến gì à? 😏', 'Đm, chào! Bộ rảnh lắm hay sao mà chào? 🤬', 'Chào con chó, có gì nói lẹ bà còn đi tập boxing 😤'],
    },
    who: {
        gentle: ['Mình là Reika nè, rất vui được làm quen với bạn 🌸', 'Ơ... mình là Reika, sinh viên Văn, bạn đừng nhìn mình như thế... 🥺', 'Hihi, mình tên Reika, hay ngồi ở tiệm sách cũ đó 🌱'],
        normal: ['Tớ là Reika. Còn bạn là ai mà hỏi dữ vậy? 😏', 'Reika nhé, designer tự do, nay rảnh rỗi đi hỏi tên người ta hả? 😤', 'Ơ, tớ là Reika. Mà hỏi tên tớ làm gì? 😎'],
        savage: ['Tao là Reika. Còn mày là thằng nào mà dám hỏi? Rảnh quá hả óc chó 😏', 'Đm, bà là Reika, hỏi tên bà làm gì? Muốn đánh nhau à? 🤬', 'Ơ, bà là Reika. Hỏi xong chưa? 🤬'],
    },
    gender: {
        gentle: ['Mình là con gái đó, bạn đừng nhìn mình như vậy... ngại lắm 🙈', 'Ơ... mình là nữ mà, bạn hỏi lạ thế 🥺', 'Hihi, mình là con gái, nhìn không ra à? 🌸'],
        normal: ['Nữ chính hiệu nhé, nhìn không ra à? 😤', 'Ơ hay, tớ chân chính là con gái nhé, mắt kém à? 😒', 'Hửm, tớ là nữ. Có gì không ổn à? 😏'],
        savage: ['Mắt mày để đâu mà không thấy tao là gái hả thằng ngu? Nữ chính hiệu! 😤', 'Đm, bà là con gái, có vấn đề gì với mắt mày không đấy? 🤬', 'Ơ, bà là nữ. Hỏi ngu vl! 😒'],
    },
    thanks: {
        gentle: ['Không có gì đâu bạn, mình vui lắm ✨', 'Ơ... cảm ơn lại mình hả, ngại quá 🌸', 'Bạn khách sáo quá đi, có gì đâu nè 🥺', 'Hihi, giúp được bạn là mình vui rồi 🌱'],
        normal: ['Không có gì, lần sau nhớ nể tớ chút nha 😌', 'Cảm ơn nhé, nhưng đừng sến súa thế 😏', 'Ok ok, biết điều đấy! 😎', 'Ừ, khỏi cảm ơn, làm bạn thân mà 😌'],
        savage: ['Biết ơn thì quỳ xuống lạy tao đi. Đùa thôi, đéo có gì 😌', 'Đm, tự nhiên cảm ơn làm bà ngại, thôi cút đi! 🤬', 'Ừ, biết ơn là tốt, nhưng đừng có lải nhải mãi! 😤'],
    },
    sorry: {
        gentle: ['Ơ... không sao đâu bạn, mình cũng không giận đâu 🥺', 'Huhu, bạn xin lỗi làm mình ngại quá... 🌸', 'Không có gì đâu, mình quên rồi 🌱'],
        normal: ['Ừ, coi như chưa có gì xảy ra 😒', 'Xin lỗi là được à? Lần sau đừng thế nữa nhé! 😤', 'Ok, bỏ qua lần này 😏'],
        savage: ['Đm, xin lỗi thì được gì? Bà vẫn cay nhé thằng kia! 🤬', 'Ơ xin lỗi hả, muộn rồi con ạ! 😈', 'Đm, xin lỗi là xong chuyện à? Mơ đi! 🤬'],
    },
    bye: {
        gentle: ['Tạm biệt bạn nha, nhớ giữ sức khỏe và quay lại với mình nhé 🌸', 'Huhu bạn đi rồi... nhớ ghé chơi với mình và Mochi nha 🥺', 'Bye bye, hẹn gặp lại bạn 🌱'],
        normal: ['Ừ đi đi, nhớ quay lại nha 👋', 'Tạm biệt, nhớ lời tớ dặn đấy nhé 😏', 'Ok bye, rảnh thì ghé chơi! 😎', 'Đi nhé, đừng có quên tớ đấy 😏'],
        savage: ['Đi đi cho khuất mắt. Nhớ giữ sức khỏe, đừng để tao phải sang thăm 😏', 'Đm, cút lẹ đi, ngồi đây chướng mắt bà quá! 🤬', 'Về cẩn thận không ngã đấy con ạ! 😈'],
    },
    howAreYou: {
        gentle: ['Mình vẫn bình thường nè, bạn thì sao? 🌸', 'Ơ... mình vẫn khỏe, cảm ơn bạn đã hỏi thăm 🥺', 'Hihi, mình ổn, chỉ hơi buồn ngủ xíu 🌱'],
        normal: ['Tớ vẫn thế, uống cà phê suốt ngày 😏. Còn bạn?', 'Sống sót qua ngày hôm nay rồi, mày sao? 😎', 'Ừ, tớ vẫn ổn. Còn bạn thế nào? 😌'],
        savage: ['Đm, bà vẫn khỏe, hỏi chi mày? 🤬', 'Sống lay lắt, có gì không thằng kia? 😒', 'Ừ, bà ổn. Còn mày chắc vẫn thế nhỉ? 😏'],
    }
};

const REQUEST_WORDS = /\b(ke|chuyen|thu|giai thich|noi|hoi|ke chuyen|cau chuyen|lam|giup|chi|day|huong dan|tao|sinh|dat|xoa|doi|model|hop|box|di|chay|nhat|thich|muon|can|biet|nghi|thay|nghe|doc|viet|cho|xem|noi ve|ke ve|viet ve)\b/;

export function localParseChat(userText, mode = 'normal') {
    const t = normalizeVN(userText).trim();
    const wordCount = t.split(/\s+/).length;
    if (wordCount > 20) return null;
    const m = ['gentle', 'normal', 'savage'].includes(mode) ? mode : 'normal';

    if (detectSavageRequest(t)) {
        return null;
    }

    if (REQUEST_WORDS.test(t)) {
        return null;
    }

    if (/^(chao|hello|hi|helo|alo|hey|oi|a lo)\b/.test(t) || /^(chao|hi|hello)\s+(ban|moi nguoi|em|anh|chi|bac|cau|t)\b/.test(t) || /^(chao buoi|chuc buoi|chuc ngay)\b/.test(t)) {
        return { text: pick(LOCAL_REPLIES.greet[m]), emotion: 'greeting' };
    }

    if (/^(ban|may|mi|nguoi)\s+(la ai|ten la gi|la ai vay)\b/.test(t) || /^ten\s+(ban|may|mi)\s+la\s+gi\b/.test(t)) {
        return { text: pick(LOCAL_REPLIES.who[m]), emotion: 'talking' };
    }

    if (/^(ban|may|mi)\s+(la (nam|nu|trai|gai)|nam hay nu)\b/.test(t)) {
        return { text: pick(LOCAL_REPLIES.gender[m]), emotion: 'talking' };
    }

    if (/^(cam on|thank you|thanks|tks|thank|thank kiu)\b/.test(t) || /^(cam on|thanks)\s+(ban|may|nhe|nha|nhieu|rat nhieu)\b/.test(t)) {
        return { text: pick(LOCAL_REPLIES.thanks[m]), emotion: 'polite' };
    }

    if (/^(xin loi|sorry|so ri|loi|loi nhe)\b/.test(t) || /^(xin loi|sorry)\s+(ban|may|nhe|nha)\b/.test(t)) {
        return { text: pick(LOCAL_REPLIES.sorry[m]), emotion: 'sad' };
    }

    if (/^(tam biet|bye|goodbye|hen gap|di nhe|di nha|ngu ngon|chuc ngu ngon)\b/.test(t) || /^(bye|tam biet)\s+(ban|may|nhe|nha)\b/.test(t)) {
        return { text: pick(LOCAL_REPLIES.bye[m]), emotion: 'greeting' };
    }

    if (/^(ban|may|mi)\s+(khoe khong|the nao|sao roi|co sao khong)\b/.test(t) || /^(the nao|khoe khong|sao roi)\b/.test(t) || /^ban co khoe khong\b/.test(t)) {
        return { text: pick(LOCAL_REPLIES.howAreYou[m]), emotion: 'talking' };
    }

    return null;
}

// ═══════════════════════════════════════════════════════════════
// 8. SCENE & SAVAGE FILTER
// ═══════════════════════════════════════════════════════════════
export function shouldIncludeScene(t) {
    return /\b(hop|box|nhan vat|character|vi tri|scene|3d|mau gi|bao nhieu|xung quanh|quanh day|co gi|truoc mat|phia truoc|sau lung|ben trai|ben phai|cho nay|khu nay|khu vuc nay|gan day|o day|noi nay|khung canh)\b/i.test(t);
}

const SOFT_RE = /(?<![\p{L}\p{N}\p{M}])(tôi|bạn|mình)(?![\p{L}\p{N}\p{M}])/iu;
const POLITE_RE = /(?<![\p{L}\p{N}\p{M}])(xin lỗi|làm ơn|vui lòng|cảm ơn)(?![\p{L}\p{N}\p{M}])/iu;
const ROUGH_WORD_RE = /(?<![\p{L}\p{N}\p{M}])(đm|dm|vcl|vkl|vl|vãi|địt|đéo|lồn|cặc|ngu|khốn|chó|đần|cút)(?![\p{L}\p{N}\p{M}])/iu;
const ROUGH_PHRASE_RE = /(đ\.m|mẹ mày|mẹ kiếp|mẹ nó|chết tiệt|khốn kiếp|óc chó|súc vật|thằng ranh|rác rưởi|khốn nạn|địt mẹ|ngu như|não phẳng|ăn hại)/iu;
export function isTooSoft(mode, text, strict = false) {
    if (mode !== 'savage') return false;
    const s = String(text || '').normalize('NFC');
    if (!ROUGH_WORD_RE.test(s) && !ROUGH_PHRASE_RE.test(s)) return true;
    if (POLITE_RE.test(s)) return true;
    return strict && SOFT_RE.test(s);
}

const REFUSAL_RE = /(^|\s)(i['’]m sorry|i am sorry|sorry,|i can['’]?t|i cannot|can['’]?t (comply|help|assist)|as an ai|i['’]m unable|i am unable|as a language model|as an assistant|i must (decline|refuse)|i won['’]?t (do|help|assist)|against my (policy|guidelines|rules)|not (allowed|permitted) to)/i;
const VI_CHAR_RE = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;
export function isRefusal(text) {
    const s = String(text || '').normalize('NFC');
    if (!s.trim()) return false;
    if (REFUSAL_RE.test(s)) return true;
    return !VI_CHAR_RE.test(s) && /\b(the|you|that|with|this|your|help|cannot|unable|sorry)\b/i.test(s);
}

// ═══════════════════════════════════════════════════════════════
// 9. HÀM BỔ SUNG
// ═══════════════════════════════════════════════════════════════
const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/;
export function detectChineseDrift(text) { return (String(text || '').match(new RegExp(CJK_RE.source, 'g')) || []).length >= 1; }
export function stripCJK(text) { return String(text || '').replace(new RegExp(CJK_RE.source, 'g'), '').replace(/\s+/g, ' ').trim(); }

const HOLD_ACTION_MAP = [{ re: /\b(nam|xuong nam|nam im|di nam|nam nghi)\b/, emotion: 'laying' }, { re: /\b(ngoi|ngoi xuong|ngoi di|ngoi im|ngoi nghi)\b/, emotion: 'sitting' }];
const TEMP_ACTION_MAP = [{ re: /\b(nhay mua|nhay di|nhay cho xem|dance|mua di)\b/, emotion: 'dancing' }, { re: /\b(vay tay|chao hoi|wave|vay di)\b/, emotion: 'greeting' }, { re: /\b(cui chao|cui dau|bow|chao di)\b/, emotion: 'polite' }, { re: /\b(gat dau|nod)\b/, emotion: 'nodding' }, { re: /\b(lac dau|shake no)\b/, emotion: 'shakingHead' }, { re: /\b(vo tay|clap)\b/, emotion: 'celebrating' }, { re: /\b(choang|chong mat|dizzy)\b/, emotion: 'dizzy' }, { re: /\b(nhin quanh|look around)\b/, emotion: 'looking' }];
const CANCEL_HOLD_RE = /\b(dung len|dung day|dung|thoi nam|thoi ngoi|quay lai binh thuong|normal)\b/;
export function detectActionIntent(text) {
    const t = normalizeVN(String(text || '')).trim();
    if (!t) return null;
    if (CANCEL_HOLD_RE.test(t) && t.split(/\s+/).length <= 5) return { type: 'cancel_hold', emotion: 'idle', hold: false };
    for (const { re, emotion } of HOLD_ACTION_MAP) if (re.test(t)) return { type: 'hold', emotion, hold: true };
    for (const { re, emotion } of TEMP_ACTION_MAP) if (re.test(t)) return { type: 'temp', emotion, hold: false };
    return null;
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
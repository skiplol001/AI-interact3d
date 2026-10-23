// ═══════════════════════════════════════════════════════════════
// ai-shared.js — v14 (Sync Emotion với Popup Chat)
// ═══════════════════════════════════════════════════════════════

import { logModelAttempt } from './ai-debug.js';

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════
export const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

export const MODEL_CHAIN = {
    command: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'gemma2-9b-it'],
    chat: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'gemma2-9b-it'],
    vision: [
        'qwen/qwen3.8-27b',
        'qwen/qwen3.6-27b',
        'meta-llama/llama-4-scout-17b-16e-instruct',
        'meta-llama/llama-4-maverick-17b-128e-instruct'
    ]
};

export const MAX_HISTORY_PAIRS = 15;
export const SAY_TOOLS = new Set(['say', 'unclear', 'unsupported']);

export const FALLBACK_LINES = [
    'Mình chưa hiểu lắm 😅 Bạn thử nói rõ hơn nhé!',
    'Hmm, câu này khó quá 🤔 Bạn diễn đạt lại giúp mình xem?',
    'Mình chưa nắm được ý bạn 😅 Bạn thử lại xem!',
];
export const pickFallback = () => FALLBACK_LINES[Math.floor(Math.random() * FALLBACK_LINES.length)];

// ═══════════════════════════════════════════════════════════════
// FORMAT REPLY
// ═══════════════════════════════════════════════════════════════
export function formatReply(text) {
    if (!text || typeof text !== 'string') return '';
    let out = text;
    out = out.replace(/([.!?:;])\s*(\d{1,2}\.\s)/g, '$1\n$2');
    out = out.replace(/([\u{1F300}-\u{1FAFF}])\s*(\d{1,2}\.\s)/gu, '$1\n$2');
    out = out.replace(/([.!?:;])\s*([-•*]\s)/g, '$1\n$2');
    out = out.replace(/(\d{1,2}\.\s[^.\n]+?\.)\s*(\d{1,2}\.\s)/g, '$1\n$2');
    out = out.replace(/\n{3,}/g, '\n\n');
    return out.trim();
}

// ═══════════════════════════════════════════════════════════════
// FORMAT MARKDOWN
// ═══════════════════════════════════════════════════════════════
export function formatMarkdown(text) {
    if (!text) return '';
    let html = String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
        `<pre style="background:#0f172a;color:#e2e8f0;padding:8px;border-radius:4px;overflow-x:auto;font-size:12px;line-height:1.4;margin:6px 0;"><code>${code.trim()}</code></pre>`
    );
    html = html.replace(/`([^`\n]+)`/g,
        '<code style="background:#334155;color:#e2e8f0;padding:1px 4px;border-radius:3px;font-size:13px;">$1</code>'
    );
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
    html = html.replace(/\n/g, '<br>');
    return html;
}

// ═══════════════════════════════════════════════════════════════
// TIME CONTEXT
// ═══════════════════════════════════════════════════════════════
export function getTimeContext() {
    const now = new Date();
    const weekdays = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    const wd = weekdays[now.getDay()];
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    return `\n\n# CURRENT TIME\nHôm nay là ${wd}, ngày ${dd}/${mm}/${yyyy}. Giờ hiện tại: ${hh}:${min} (giờ máy người dùng). Dùng thông tin này khi user hỏi về giờ/ngày/hôm nay.`;
}

// ═══════════════════════════════════════════════════════════════
// PREFERENCES
// ═══════════════════════════════════════════════════════════════
const PREF_KEY = 'ai_user_prefs_v1';

export function getPrefs() {
    try {
        const raw = localStorage.getItem(PREF_KEY);
        if (!raw) return {};
        return JSON.parse(raw) || {};
    } catch { return {}; }
}

export function setPrefs(prefs) {
    try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch { }
}

export function detectPreference(t) {
    if (/\b(thich|muon)\s+(ngan gon|tra loi ngan|van tat|ngan)\b/.test(t) ||
        /\b(tra loi|noi)\s+ngan gon\b/.test(t)) {
        return { key: 'tone', value: 'ngan', label: 'ngắn gọn' };
    }
    if (/\b(thich|muon)\s+(chi tiet|dai|day du|ky)\b/.test(t) ||
        /\b(tra loi|noi)\s+(chi tiet|dai|day du)\b/.test(t)) {
        return { key: 'tone', value: 'dai', label: 'chi tiết' };
    }
    if (/\b(khong|dung|bo)\s+(dung\s+)?emoji\b/.test(t)) {
        return { key: 'emoji', value: 0, label: 'không emoji' };
    }
    if (/\b(thich|nhieu)\s+emoji\b/.test(t)) {
        return { key: 'emoji', value: 2, label: 'nhiều emoji' };
    }
    if (/\b(nghiem tuc|khong dua|serious)\b/.test(t)) {
        return { key: 'humor', value: 0, label: 'nghiêm túc' };
    }
    if (/\b(hai huoc|vui ve|di dom|dua)\b/.test(t) && /\b(thich|muon)\b/.test(t)) {
        return { key: 'humor', value: 2, label: 'hài hước' };
    }
    return null;
}

export function prefsToPrompt(prefs) {
    const parts = [];
    if (prefs.tone === 'ngan') parts.push('- Trả lời NGẮN GỌN (1-2 câu), đi thẳng vấn đề.');
    else if (prefs.tone === 'dai') parts.push('- Trả lời CHI TIẾT, đầy đủ (5-8 câu hoặc hơn).');
    if (prefs.emoji === 0) parts.push('- KHÔNG dùng emoji.');
    else if (prefs.emoji === 2) parts.push('- Dùng emoji thoải mái.');
    if (prefs.humor === 0) parts.push('- Giọng NGHIÊM TÚC, không đùa.');
    else if (prefs.humor === 2) parts.push('- Giọng HÀI HƯỚC, thêm câu đùa nhẹ.');
    return parts.length > 0 ? `\n\n# USER PREFERENCES\n${parts.join('\n')}` : '';
}

// ═══════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════
export const normalizeVN = (s) =>
    s.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd');

export function errorToUserMessage(err) {
    const m = err?.message || '';
    if (/\(401\)/.test(m)) return '🔑 API Key Groq không hợp lệ. Nhấn "🔑 Đổi Key Groq" để nhập lại.';
    if (/\(429\)/.test(m)) return '⏳ Groq đã hết quota. Thử lại sau ít phút nhé!';
    if (/404|không tồn tại/.test(m)) return '⚠️ Model Groq không tồn tại (cần cập nhật code). Xem F12 để biết chi tiết.';
    if (/400/.test(m)) return '⚠️ Yêu cầu không hợp lệ (400). Có thể do model Vision đã thay đổi. Xem F12 để biết chi tiết.';
    return pickFallback();
}

// ═══════════════════════════════════════════════════════════════
// DETECTORS
// ═══════════════════════════════════════════════════════════════
export function isQuestion(t) {
    if (t.includes('?')) return true;
    if (/\b(gi|sao|nao|dau|ai|bao nhieu|tai sao|the nao|bao gio|khi nao|o dau|vi sao|lam sao)\b/.test(t)) return true;
    if (/(khong|chua|ha|nhi|duoc khong|phai khong|dung khong|dung ko|co ko)\s*$/.test(t)) return true;
    if (/^(ban|toi|minh|con|meo|cho|ong|ba|anh|chi|em|no|ho|chung|ai|troi|dat|vu tru)\b/.test(t) &&
        /\b(co|biet|hieu|lam|duoc|thich|muon|can|nghi|thay|bao gio)\b/.test(t)) return true;
    if (/^(oi|troi oi|u la troi|wow|dep|hay|gioi|te|chan|vui|buon|so|ghe)\b/.test(t)) return true;
    return false;
}

export function isSarcasm(t) {
    if (/(\s|^)(a|ha|the|day|vai|nhi|nho|ghe|qua|thiet|that|sao|chu)\s*$/.test(t)) return true;
    if (/\b(gioi|hay|tai|khon|ngu|dien|kho|manh|yeu|nhanh|cham|cao|thap|gia|that|dep|xau|do|te|chan|vui|buon)\b.*\b(nhi|the|day|vai|qua|ghe|that|sao)\b/.test(t)) return true;
    if (/\b(may|tao|ban|no|ong|ba|anh|chi|em)\b.*\b(the|day|vai|nhi|nho)\b/.test(t)) return true;
    if (/\b(khung|dien|nham|linh tinh|bay ba|tam bay|vo van|ngu|kho chiu|kho tin|vo li)\b/.test(t)) return true;
    if (/^(oi|troi oi|troi|u la troi|vai|chao oi|ghe|so|dien)\b/.test(t)) return true;
    return false;
}

export function isNarrativePrefix(t) {
    const cleaned = t.replace(/^(hay |lam on |xin |vui long )/, '');
    return /^(ke chuyen|ke cho|ke ve|hay ke|hay viet|viet cho|viet ve|viet mot|hay noi|noi ve|cho toi biet|cho minh biet|cho toi hoi|cho minh hoi|giai thich|hay giai thich|dong vai|nhap vai|gia su|gia dinh|tuong tuong|hay tuong tuong|neu (ban|toi|minh|nhu|co mot|co ai|toi)|neu nhu|ban co the|ban co biet|ban hay|ban thu|ban nghi|ban thay|ban cam thay|ban co nghi|ban co thich|theo ban|theo toi|y ban|y cua ban|ban se lam gi|lam the nao|lam sao de|lam sao ma|co cach nao|co the (chi|giup|ke|noi)|giup toi|giup minh|chi toi|chi minh|day toi|day minh|tra loi|tra loi cau hoi)\b/.test(cleaned);
}

export function isNarrative(t) {
    if (/\b(dong vai|nhap vai|gia su|gia dinh|tuong tuong|ke chuyen|ke cho|viet cho|viet ve|giai thich|theo ban|theo toi|y ban|ban se lam gi)\b/.test(t)) return true;
    return false;
}

// ═══════════════════════════════════════════════════════════════
// SCENE HELPERS
// ═══════════════════════════════════════════════════════════════
export const LOOK_AROUND_PATTERN =
    /nhin (xung )?quanh|quet (vat the |xung quanh|khu vuc|scene|khung canh|xung quanh)|xem (xung )?quanh|scan|co gi (xung )?quanh|xung quanh (co )?gi/;

export function getRelativeDir(dx, dz, rotY = 0) {
    const angle = Math.atan2(dx, dz);
    const rel = angle - rotY;
    const norm = ((rel + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const deg = norm * 180 / Math.PI;
    if (deg >= -22.5 && deg < 22.5) return 'phía trước';
    if (deg >= 22.5 && deg < 67.5) return 'phía trước-phải';
    if (deg >= 67.5 && deg < 112.5) return 'bên phải';
    if (deg >= 112.5 && deg < 157.5) return 'phía sau-phải';
    if (deg >= -67.5 && deg < -22.5) return 'phía trước-trái';
    if (deg >= -112.5 && deg < -67.5) return 'bên trái';
    if (deg >= -157.5 && deg < -112.5) return 'phía sau-trái';
    return 'phía sau';
}

export function summarizeSceneAround(snapshot) {
    if (!snapshot || !snapshot.character) return '👁️ Không lấy được vị trí nhân vật.';
    const { character, boxes = [] } = snapshot;
    const cx = character.pos?.[0] ?? 0;
    const cz = character.pos?.[2] ?? 0;
    const rotY = character.rotationY ?? 0;

    if (boxes.length === 0) {
        return `👁️ Mình đang ở (${cx.toFixed(1)}, ${cz.toFixed(1)}). Xung quanh không có vật thể nào cả.`;
    }
    const sorted = boxes
        .map(b => ({ ...b, dist: Math.hypot(b.pos[0] - cx, b.pos[2] - cz) }))
        .sort((a, b) => a.dist - b.dist);

    const lines = [
        `👁️ Đang ở (${cx.toFixed(1)}, ${cz.toFixed(1)}). Xung quanh có ${boxes.length} vật thể:`,
    ];
    for (const b of sorted.slice(0, 5)) {
        const dx = b.pos[0] - cx;
        const dz = b.pos[2] - cz;
        const dir = getRelativeDir(dx, dz, rotY);
        const carried = b.carried ? ' (đang mang)' : '';
        lines.push(`• Hộp ${b.color} ở ${dir}, cách ${b.dist.toFixed(1)}m${carried}`);
    }
    if (sorted.length > 5) {
        lines.push(`... và ${sorted.length - 5} vật thể khác`);
    }
    return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════
// CLASSIFY — v8
// ═══════════════════════════════════════════════════════════════

export const KNOWN_PATTERNS = [
    /\bdi\s+(sang\s+)?(trai|phai)\b/,
    /\b(qua|sang|ben)\s+(trai|phai)\b/,
    /\bdi ve\s+(trai|phai|truoc|sau)\b/,
    /\bve\s+(trai|phai|truoc|sau)\b/,
    /\bdi\s+(toi|len|thang)\b/,
    /\b(buoc|chay)\s+(toi|len|thang)\b/,
    /\bdi\s+len\b/,
    /\bbuoc\s+len\b/,
    /\blen\s+\d+\s+(buoc|m|met)\b/,
    /\bdi\s+xuong\b|\bbuoc\s+xuong\b/,
    /\bthang\s+(tien|len|toi)\b/,
    /\btien\b/,
    /\blui\b/,
    /\bra sau\b|\bsau lung\b/,
    /\blen truoc\b|\bphia truoc\b|\btoi truoc\b/,
    /\bdi\s+(ngau nhien|lung tung|bat ky)\b/,
    /\b(trai|phai|tien|lui)\s+di\b/,
    /^(trai|phai|tien|lui|len|xuong|truoc|sau)$/,
    /^(trai|phai|tien|lui)\s+\d+\s*(do|degree|deg)\b/,
    /\bve\s+phia\s+(truoc|sau|trai|phai)\b/,
    /\bphia\s+(truoc|sau|trai|phai)\b/,
    /\b(di|tien|chay)\s+(ve\s+)?phia\s+(truoc|sau|trai|phai)\b/,
    /\b(dat|tha|bo|de)\s+(ve\s+)?(phia\s+)?(truoc|sau|trai|phai)\b/,
    /\b(dat|tha|bo|de)\s+(ve\s+)?(phia\s+)?(truoc|sau|trai|phai)\s+\d+\s+(buoc|m|met)\b/,
    /\b(quay|xoay)\s+(dau\s+)?(sang\s+)?(trai|phai)\b/,
    /\b(quay|xoay)\s+(sang\s+)?(truoc|sau)\b/,
    /\bquay (lai|dau)\b|\bnhin (ve )?sau\b/,
    /\bnhin (ve )?(camera|toi|minh)\b|\bquay (mat\s+)?(ve\s+|lai\s+)?camera\b|\bnhin thang\b/,
    /\bquay\s+(vong tron|360)\b|\bspin\b/,
    /\bquay\s+(\d+\s+)?vong\b/,
    /\b(quay|xoay)\s+(\d+(?:[.,]\d+)?)\s*(do|degree|deg)\b/,
    /\b(quay|xoay)\s+(sang\s+)?(trang|phai trang)\b/,
    /\b(nhat|cam|lay|be|vac|boc)\b.*\b(hop|box|do|xanh|vang|tim|hong|luc)\b/,
    /\b(hop|box|do|xanh|vang|tim|hong|luc)\b.*\b(nhat|cam|lay|be|vac|boc)\b/,
    /\b(tha|bo|dat|de)\s+(hop|box|xuong)\b/,
    /\bmang ve\b|\bdem ve\b|\bcam ve\b/,
    /\bve (camera|day)\b|\btruoc mat\b|\bdua ve\b/,
    /\b(tao|sinh|them|spawn)\b.*\b(hop|box)\b/,
    /\bxoa\b/,
    /\b(dung lai|thoi|huy|ngung|cancel|stop)\b/,
    /\b(nhac|treo|nang|keo len|boc len)\b/,
    /\b(tha xuong|buong ra|tha ra|cho roi|release)\b/,
    /\b(zoom|focus|tap trung)\b/,
    /\b(doi mau|doi|son|recolor)\b/,
    /\b(di chuyen|move)\s+(hop|box|b\d+)\b/,
    /\b(dem|count)\b.*\b(hop|box)\b/,
    /\b(hop|box)\b.*\b(bao nhieu|dem)\b/,
    /\b(xep|arrange)\b/,
    /\b(chong|stack)\b/,
    /\b(luu|save)\s+(vi tri|position|cho nay|day)\b/,
    /\b(dich chuyen|teleport)\b/,
    /\b(ve|quay ve)\s+(home|vi tri)\b/,
    /\blai gan camera\b|\bve phia camera\b/
];

export const ACTION_VERBS_AT_START =
    /^(hay |lam on |xin |vui long )?(di|chay|quay|xoay|nhat|lay|cam|dat|tha|tao|sinh|nhay|bay|cui|ngoi|danh|nem|bat|leo|mua|hat|bo|xoa|dem|xep|chong|doi|luu|load|zoom|focus|dich|nhac|treo|buong|stop|dung|thoi|ngung|huy|mang|spin|ve|sang|phia)\b/;

export function classifyIntent(userText) {
    let t = normalizeVN(userText).trim();
    if (!t) return 'chat';

    t = t.replace(/^(roi|the roi|xong roi|giay thi|sau do|tiep theo|ke do|va)\s+/i, '').trim();
    if (!t) return 'chat';

    if (isNarrativePrefix(t)) return 'chat';
    if (t.length > 120) return 'chat';

    for (const p of KNOWN_PATTERNS) {
        if (p.test(t)) return 'known';
    }

    t = t.replace(/\s+di\s*$/, '').trim();

    for (const p of KNOWN_PATTERNS) {
        if (p.test(t)) return 'known';
    }

    if (isQuestion(t)) return 'chat';
    if (isSarcasm(t)) return 'chat';
    if (isNarrative(t)) return 'chat';

    if (/^(di|chay|quay|xoay|nhat|lay|cam|dat|tha|tao|sinh)$/.test(t)) return 'unclear';

    if (!ACTION_VERBS_AT_START.test(t)) return 'chat';

    if (/^(di|quay|xoay|chay)\b/.test(t) && !/trai|phai|tien|lui|sang|ve|sau/.test(t)) return 'unclear';
    if (/\b(nhat|lay|cam|be|vac)\b/.test(t) && !/\bdo\b|xanh|vang|tim|hong|luc|hop|box/.test(t)) return 'unclear';
    if (/\b(dat|tha|bo)\b/.test(t) && !/xuong|hop|box|truoc|sau|trai|phai/.test(t)) return 'unclear';

    return 'unsupported';
}

// ═══════════════════════════════════════════════════════════════
// PARSE HELPERS
// ═══════════════════════════════════════════════════════════════
export function splitCommands(cmds) {
    const actions = [], says = [], kinds = [];
    for (const cmd of cmds) {
        if (SAY_TOOLS.has(cmd.tool)) {
            says.push(cmd.args?.text || '');
            kinds.push(cmd.tool === 'say' ? 'normal' : cmd.tool);
        } else {
            actions.push(cmd);
        }
    }
    return { actions, says, kinds };
}

export function parseGroqResponse(message, mode) {
    const actions = [], says = [], kinds = [];
    if (message?.tool_calls) {
        for (const call of message.tool_calls) {
            const name = call.function?.name;
            try {
                const args = JSON.parse(call.function?.arguments || '{}');
                if (SAY_TOOLS.has(name)) {
                    says.push(args.text || '');
                    kinds.push(name === 'say' ? 'normal' : name);
                } else {
                    actions.push({ tool: name, args });
                }
            } catch { /* skip */ }
        }
    }
    if (mode === 'chat' && actions.length === 0 && says.length === 0 && message?.content) {
        says.push(message.content);
        kinds.push('normal');
    }
    return { actions, says, kinds };
}

// ═══════════════════════════════════════════════════════════════
// GROQ CALL
// ═══════════════════════════════════════════════════════════════
export async function askGroq(apiKey, config) {
    const {
        models, systemPrompt, tools, toolChoice,
        temperature, maxTokens, userText, sceneCtx, history = [],
        imageBase64 = null,
    } = config;

    let userContent = `User: "${userText}"\nScene: ${sceneCtx || '{}'}`;
    if (imageBase64) {
        userContent = [
            { type: "text", text: `User: "${userText}"` },
            { type: "image_url", image_url: { url: imageBase64 } }
        ];
    }

    const messages = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: userContent },
    ];

    const bodyBase = {
        messages,
        temperature,
        max_tokens: maxTokens,
    };

    if (tools && tools.length > 0 && !imageBase64) {
        bodyBase.tools = tools;
        bodyBase.tool_choice = toolChoice;
    }

    let lastErr = null;
    for (const model of models) {
        try {
            const t0 = performance.now();
            const res = await fetch(GROQ_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({ ...bodyBase, model }),
            });
            const latency = Math.round(performance.now() - t0);

            if (res.status === 404) {
                logModelAttempt(model, '404', latency);
                lastErr = new Error(`Model "${model}" không tồn tại (404)`);
                continue;
            }
            if (res.status === 400) {
                const txt = await res.text().catch(() => '');
                logModelAttempt(model, '400', latency);
                lastErr = new Error(`Model "${model}" 400: ${txt.slice(0, 100)}`);
                continue;
            }
            if (res.status === 401) {
                logModelAttempt(model, '401', latency);
                throw new Error('API Key Groq không hợp lệ (401).');
            }
            if (res.status === 429) {
                logModelAttempt(model, '429', latency);
                throw new Error('Groq hết quota (429).');
            }
            if (!res.ok) {
                logModelAttempt(model, 'other', latency);
                throw new Error(`Groq lỗi ${res.status}`);
            }

            const json = await res.json();
            const msg = json.choices?.[0]?.message;
            if (!msg) {
                logModelAttempt(model, 'other', latency);
                lastErr = new Error('Response rỗng');
                continue;
            }

            logModelAttempt(model, 'ok', latency);
            return msg;
        } catch (e) {
            if (/\(401\)|\(429\)/.test(e.message)) throw e;
            lastErr = e;
        }
    }

    throw lastErr || new Error('Tất cả model đều thất bại');
}

// ═══════════════════════════════════════════════════════════════
// ⭐ POPUP: Cắt câu thông minh + Đồng bộ Animation
// ═══════════════════════════════════════════════════════════════
const LIST_LINE = /^\s*(\d{1,2}[.)]|[-•*])\s/;
const MAX_BUBBLE_LEN = 80;

export function splitIntoBubbles(text) {
    const pieces = [];
    for (const line of String(text).split('\n')) {
        const l = line.trim();
        if (!l) continue;
        if (LIST_LINE.test(l)) { pieces.push(l); continue; }

        const sentences = l.match(/[^.!?…]+(?:[.!?…]+|$)\s*/g) || [l];
        for (const s of sentences) {
            const st = s.trim();
            if (!st) continue;

            if (st.length > MAX_BUBBLE_LEN) {
                const subParts = st.split(/(?<=[,;:])\s+/);
                for (const sp of subParts) {
                    if (sp.length > MAX_BUBBLE_LEN) {
                        let rem = sp;
                        while (rem.length > MAX_BUBBLE_LEN) {
                            let cut = rem.lastIndexOf(' ', MAX_BUBBLE_LEN);
                            if (cut < MAX_BUBBLE_LEN / 2) cut = MAX_BUBBLE_LEN;
                            pieces.push(rem.slice(0, cut).trim());
                            rem = rem.slice(cut).trim();
                        }
                        if (rem) pieces.push(rem);
                    } else if (sp.trim()) {
                        pieces.push(sp.trim());
                    }
                }
            } else {
                pieces.push(st);
            }
        }
    }

    const merged = [];
    for (const p of pieces) {
        const tiny = p.replace(/[\s\p{Extended_Pictographic}]/gu, '').length < 4;
        if (tiny && merged.length) merged[merged.length - 1] += ' ' + p;
        else merged.push(p);
    }
    return merged;
}

let _queue = [];
let _running = false;
let _gen = 0;

export function clearPopupQueue() {
    _gen++;
    _queue = [];
    _running = false;
    // Reset animation nếu đang nói dở
    if (window.emotionCtrl) {
        window.emotionCtrl.stop();
    }
}

export function showPopup(text, kind = 'normal') {
    if (!window.showCharacterMessage || !text) return;
    for (const b of splitIntoBubbles(text)) _queue.push({ b, kind });
    if (!_running) _drain();
}

async function _drain() {
    _running = true;
    const gen = _gen;
    while (_queue.length) {
        const { b, kind } = _queue.shift();
        window.showCharacterMessage(b, kind);

        // ⭐ ĐỒNG BỘ ANIMATION: Mỗi khi popup mới hiện, extend emotion hiện tại
        if (window.emotionCtrl && window.emotionCtrl.extend) {
            window.emotionCtrl.extend();
        }

        const delay = Math.min(5000, Math.max(1500, 700 + b.length * 40));
        await new Promise(r => setTimeout(r, delay));
        if (gen !== _gen) return;
    }
    _running = false;
}
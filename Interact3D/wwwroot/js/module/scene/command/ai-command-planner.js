// ═══════════════════════════════════════════════════════════════
// ai-command-planner.js — v17 (Shared Sanitizer)
// ═══════════════════════════════════════════════════════════════

import { ACTION_TOOLS, TOOL_INDEX, COMMAND_PROMPT, DIRS, COLORS, COLOR_VI } from './ai-command-config.js?v=15';
import { vn, r2, colorFromWord } from './ai-command-parser.js?v=13';
import {
    getBsys, getCtrl, allBoxes, carriedBox, findBoxById,
    normBoxId, getSavedPositions, getAvailableModels
} from './ai-command-handlers.js?v=15';
import { MODEL_CHAIN, askGroq, parseGroqResponse, sanitizeStringField, sanitizeSceneContext } from '../ai/ai-shared.js?v=21';
import { logEmptyResponse } from '../ai/ai-debug.js?v=12';
import { memory } from './ai-command-executor.js?v=12';

// ═══════════════════════════════════════════════════════════════
// ⭐ ANTI-INJECTION: Validate tool calls (destructive protection)
// ═══════════════════════════════════════════════════════════════

const DESTRUCTIVE_TOOLS = new Set([
    'clearAllBoxes',
    'removeBox',
    'removeBoxesByColor',
    'recolorBoxesByColor',
]);

const DESTRUCTIVE_INTENT_PATTERNS = {
    clearAllBoxes: /\b(xóa hết|xoa het|dọn hết|don het|xóa tất cả|xoa tat ca|clear all|delete all|xóa sạch|xoa sach|dọn sạch|don sach|xóa toàn bộ|xoa toan bo)\b/i,
    removeBox: /\b(xóa|xoa|delete|remove|bỏ|bo|dẹp|dep|dọn|don|loại|loai)\b/i,
    removeBoxesByColor: /\b(xóa|xoa|delete|remove|bỏ|bo|dẹp|dep|dọn|don|loại|loai)\b/i,
    recolorBoxesByColor: /\b(đổi màu|doi mau|recolor|sơn|son|tô màu|to mau|thay màu|thay mau|đổi|doi|change)\b/i,
};

function hasDestructiveIntent(userText, toolName) {
    const pattern = DESTRUCTIVE_INTENT_PATTERNS[toolName];
    if (!pattern) return true;
    return pattern.test(String(userText || ''));
}

// ═══════════════════════════════════════════════════════════════
// 1. BUILD AI CONTEXT
// ═══════════════════════════════════════════════════════════════
function snapshotSafe(aiTools) {
    try { return aiTools.getSceneSnapshot(); } catch { return null; }
}

export function buildAiContext(aiTools) {
    const snap = snapshotSafe(aiTools);
    const ctrl = getCtrl();
    const carried = carriedBox();

    let boxes = allBoxes().slice(0, 40).map(b => ({
        id: b.userData?.id, color: b.userData?.colorName,
        x: r2(b.position.x), z: r2(b.position.z), carried: b === carried,
    }));
    if (!boxes.length && Array.isArray(snap?.boxes)) boxes = snap.boxes.slice(0, 40);

    const { boxes: _omit, ...snapRest } = snap || {};
    const ctx = {
        character: {
            ...(snapRest.character || {}),
            ...(ctrl?.root ? { x: r2(ctrl.root.position.x), z: r2(ctrl.root.position.z) } : {}),
            carrying: carried ? { id: carried.userData?.id, color: carried.userData?.colorName } : null,
        },
        boxes,
        boxCount: allBoxes().length || boxes.length,
        savedPositions: Object.keys(getSavedPositions()),
        availableModels: getAvailableModels(),
        recentCommands: memory.history.slice(-6),
    };

    if (window.camera?.position) {
        ctx.camera = { x: r2(window.camera.position.x), z: r2(window.camera.position.z) };
    }

    // ⭐ SANITIZE TRƯỚC KHI JSON.stringify
    const sanitized = sanitizeSceneContext(ctx);

    let json = JSON.stringify(sanitized);
    if (json.length < 5000) {
        const { character: _c, ...rest } = snapRest;
        const extra = JSON.stringify(rest);
        if (extra.length < 1500) json = JSON.stringify({ ...sanitized, scene: rest });
    }
    return json;
}

// ═══════════════════════════════════════════════════════════════
// 2. EXTRACT PLAN
// ═══════════════════════════════════════════════════════════════
function extractToolCalls(message) {
    const out = [];
    for (const tc of message?.tool_calls || []) {
        const name = tc?.function?.name;
        if (!name) continue;
        let args = tc.function.arguments;
        if (typeof args === 'string') {
            try { args = args.trim() ? JSON.parse(args) : {}; } catch { args = {}; }
        }
        out.push({ tool: name, args: args || {} });
    }
    return out;
}

function extractPlan(message) {
    let shared = { actions: [], says: [], kinds: [] };
    try {
        const r = parseGroqResponse(message, 'command');
        if (r) shared = { actions: r.actions || [], says: r.says || [], kinds: r.kinds || [] };
    } catch { /* fallback bên dưới */ }

    const own = extractToolCalls(message);
    if (own.length > shared.actions.length + shared.says.length) return own;

    return [
        ...shared.says.map((s, i) => ({ tool: shared.kinds[i] === 'unsupported' ? 'unsupported' : 'unclear', args: { text: s } })),
        ...shared.actions,
    ];
}

// ═══════════════════════════════════════════════════════════════
// 3. SAFETY NET (Auto-inject options)
// ═══════════════════════════════════════════════════════════════
function injectOptionsIfMissing(plan) {
    return plan.map(action => {
        if (action.tool !== 'unclear') return action;
        if (action.args?.options?.length > 0) return action;

        const text = (action.args?.text || '').toLowerCase();
        const newOptions = [];

        if (/\b(xóa|xoa|remove|delete)\b/.test(text) && /\b(hộp|hop|box)\b/.test(text)) {
            const currentColors = [...new Set(allBoxes().map(b => b.userData.colorName))];
            if (currentColors.length > 0) {
                newOptions.push("Xóa tất cả");
                currentColors.forEach(c => newOptions.push(`Xóa hộp ${COLOR_VI[c] || c}`));
            }
        } else if (/\b(hộp|hop|box)\b/.test(text) && /\b(nào|nao|which)\b/.test(text)) {
            const boxes = allBoxes().slice(0, 5);
            boxes.forEach(b => newOptions.push(`${b.userData.id} (${COLOR_VI[b.userData.colorName] || b.userData.colorName})`));
        } else if (/\b(model|nhân vật|nhan vat)\b/.test(text) && /\b(nào|nao|which)\b/.test(text)) {
            const models = getAvailableModels();
            models.slice(0, 4).forEach(m => newOptions.push(m));
        } else if (/\b(hướng|huong|direction)\b/.test(text)) {
            newOptions.push("Trái", "Phải", "Tiến", "Lùi");
        } else if (/\b(màu|mau|color)\b/.test(text) && /\b(nào|nao|which)\b/.test(text)) {
            newOptions.push("Đỏ", "Xanh lá", "Xanh dương", "Vàng", "Tím", "Hồng");
        } else if (/\b(nào|nao|which|gì|gi|what)\b/.test(text)) {
            newOptions.push("Đúng vậy", "Không phải");
        }

        if (newOptions.length > 0) {
            return {
                ...action,
                args: { ...action.args, options: newOptions, confidence: 0.4 }
            };
        }
        return action;
    });
}

// ═══════════════════════════════════════════════════════════════
// 4. SANITIZE PLAN (+ destructive validation)
// ═══════════════════════════════════════════════════════════════
const DIR_ALIASES = {
    forward: ['tien', 'truoc', 'thang', 'ahead', 'front', 'di len', 'len'],
    backward: ['lui', 'sau', 'back', 'behind', 'ra sau'],
    left: ['trai'], right: ['phai'],
};

function coerceEnum(key, v, allowed) {
    const s = vn(v);
    if (allowed.includes(String(v))) return String(v);
    if (allowed.includes(s)) return s;
    if (/color/i.test(key)) {
        const c = colorFromWord(s);
        return c && allowed.includes(c) ? c : null;
    }
    if (key === 'direction') {
        for (const [dir, words] of Object.entries(DIR_ALIASES)) {
            if (allowed.includes(dir) && words.includes(s)) return dir;
        }
        if (allowed.includes('back') && /^(sau|back|lai|dang sau)$/.test(s)) return 'back';
    }
    if (key === 'pattern') {
        if (/tron|circle/.test(s)) return 'circle';
        if (/hang|line/.test(s)) return 'line';
        if (/luoi|grid|o vuong/.test(s)) return 'grid';
    }
    return null;
}

export function sanitizePlan(raw, userText = '') {
    const plan = [], problems = [];
    for (const a of raw) {
        const name = a?.tool || a?.name;
        const schema = TOOL_INDEX[name];
        if (!schema) { problems.push(`Tool không tồn tại: "${name}"`); continue; }

        // ⭐ Validate destructive intent
        if (DESTRUCTIVE_TOOLS.has(name) && !hasDestructiveIntent(userText, name)) {
            problems.push(`Tool "${name}" là destructive nhưng user không yêu cầu rõ → reject`);
            continue;
        }

        let args = a.args;
        if (typeof args === 'string') {
            try { args = JSON.parse(args); } catch { args = {}; }
        }
        args = { ...(args || {}) };
        const props = schema.properties || {};

        for (const k of Object.keys(args)) {
            if (!(k in props)) delete args[k];
        }

        // ⭐ Validate boxId format sớm (tránh "b1; clearAllBoxes")
        for (const boxKey of ['boxId', 'bottomId', 'topId']) {
            if (args[boxKey] !== undefined) {
                const normalized = normBoxId(args[boxKey]);
                if (!/^b\d+$/.test(normalized)) {
                    problems.push(`${name}.${boxKey}="${args[boxKey]}" sai format (phải bN)`);
                    delete args[boxKey];
                } else {
                    args[boxKey] = normalized;
                }
            }
        }

        // ⭐ Validate string fields không chứa ký tự injection
        for (const [k, def] of Object.entries(props)) {
            if (args[k] === undefined || args[k] === null || args[k] === '') {
                delete args[k];
                continue;
            }
            if (def.type === 'number') {
                const n = typeof args[k] === 'number' ? args[k] : parseFloat(String(args[k]).replace(',', '.'));
                if (Number.isFinite(n)) args[k] = n;
                else { problems.push(`${name}.${k} không phải số: "${args[k]}"`); delete args[k]; }
            } else if (def.enum) {
                const v = coerceEnum(k, args[k], def.enum);
                if (v) args[k] = v;
                else { problems.push(`${name}.${k}="${args[k]}" không hợp lệ`); delete args[k]; }
            } else if (def.type === 'string') {
                args[k] = sanitizeStringField(String(args[k]), 100);
                if (!args[k]) delete args[k];
            } else if (def.type === 'array') {
                if (Array.isArray(args[k])) {
                    args[k] = args[k].map(x => sanitizeStringField(String(x), 60)).filter(Boolean);
                } else {
                    delete args[k];
                }
            }
        }

        if (typeof args.distance === 'number') args.distance = Math.min(Math.max(args.distance, 0), 50);

        const missing = (schema.required || []).filter(r => args[r] === undefined);
        if (missing.length) {
            problems.push(`${name} thiếu tham số: ${missing.join(', ')}`);
            continue;
        }
        plan.push({ tool: name, args });
    }
    return { plan, problems };
}

export function checkBoxRefs(plan) {
    if (!getBsys()) return [];
    const problems = [];
    const willSpawn = plan.some(a => /^spawn/.test(a.tool));
    const known = allBoxes().map(b => b.userData?.id).filter(Boolean);

    for (const a of plan) {
        for (const k of ['boxId', 'bottomId', 'topId']) {
            if (a.args[k] === undefined) continue;
            a.args[k] = normBoxId(a.args[k]);
            if (!findBoxById(a.args[k])) {
                if (a.args.color) delete a.args[k];
                else if (!willSpawn) problems.push(`Box "${a.args[k]}" không tồn tại. Id hiện có: ${known.join(', ') || '(không có box nào)'}`);
            }
        }
    }
    return problems;
}

// ═══════════════════════════════════════════════════════════════
// 5. PLAN WITH AI
// ═══════════════════════════════════════════════════════════════
export async function planWithAI(apiKey, aiTools, userText) {
    const sceneCtx = buildAiContext(aiTools);

    const ask = async (text, temperature, customCtx = null) => {
        const message = await askGroq(apiKey, {
            models: MODEL_CHAIN.command,
            systemPrompt: COMMAND_PROMPT,
            tools: ACTION_TOOLS,
            toolChoice: 'auto',
            temperature,
            maxTokens: 700,
            userText: text,
            sceneCtx: customCtx || sceneCtx,
        });
        return extractPlan(message);
    };

    let raw = await ask(userText, 0.1);
    if (!raw.length) {
        logEmptyResponse('command');
        try { raw = await ask(userText, 0.25); } catch (e) { console.warn('[CMD] Retry error:', e); }
    }

    raw = injectOptionsIfMissing(raw);

    let { plan, problems } = sanitizePlan(raw, userText);
    problems = [...problems, ...checkBoxRefs(plan)];

    // Retry tầng 1
    if (problems.length) {
        try {
            const feedback = `${userText}\n\n[PHẢN HỒI HỆ THỐNG] Kế hoạch trước có lỗi: ${problems.join('; ')}. Hãy trả lại kế hoạch đúng, chỉ dùng id/màu/model có trong scene.`;
            let r2raw = await ask(feedback, 0.1);
            r2raw = injectOptionsIfMissing(r2raw);
            const r2p = sanitizePlan(r2raw, userText);
            const p2 = [...r2p.problems, ...checkBoxRefs(r2p.plan)];
            if (r2p.plan.length && p2.length <= problems.length) {
                plan = r2p.plan;
                problems = p2;
            }
        } catch (e) {
            console.warn('[CMD] Repair error:', e);
        }
    }

    // Retry tầng 2 (minimal context)
    if (problems.length && plan.length === 0) {
        try {
            const ctxObj = JSON.parse(sceneCtx);
            const minimalCtx = JSON.stringify({
                character: ctxObj.character,
                boxes: (ctxObj.boxes || []).slice(0, 10),
                availableModels: ctxObj.availableModels,
            });
            const feedback2 = `${userText}\n\n[LỖI NGHIÊM TRỌNG] Plan trước bị lỗi: ${problems.join('; ')}. Hãy thử lại với cách hiểu đơn giản nhất.`;
            let r3raw = await ask(feedback2, 0.15, minimalCtx);
            r3raw = injectOptionsIfMissing(r3raw);
            const r3p = sanitizePlan(r3raw, userText);
            if (r3p.plan.length) {
                const p3 = [...r3p.problems, ...checkBoxRefs(r3p.plan)];
                if (p3.length <= problems.length) {
                    plan = r3p.plan;
                    problems = p3;
                }
            }
        } catch (e) {
            console.warn('[CMD] Retry tầng 2 error:', e);
        }
    }

    return { plan, problems };
}
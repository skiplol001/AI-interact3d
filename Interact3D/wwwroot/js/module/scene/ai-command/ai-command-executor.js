// ═══════════════════════════════════════════════════════════════
// ai-command-executor.js — Quản lý hàng đợi & Nút bấm lựa chọn
// ═══════════════════════════════════════════════════════════════

import { CLIENT_HANDLERS, NEEDS_IDLE, allBoxes } from './ai-command-handlers.js?v=15';
import { COLOR_VI } from './ai-command-config.js?v=15';

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════
export const memory = { history: [], lastPlan: null };
window.__memory = memory; // Cho phép handler truy cập để làm lại lệnh

const NON_REPEATABLE = new Set([
    'repeatLast', 'stop', 'listModels', 'listPositions',
    'lookAround', 'countBoxes', 'savePosition'
]);

const BUSY_STATES = [
    'walking', 'running', 'carryWalk', 'carryRun', 'walkToBox',
    'picking', 'putting',
    'surprised', 'hanging', 'falling', 'landing',
];

// ═══════════════════════════════════════════════════════════════
// BUSY-WAIT
// ═══════════════════════════════════════════════════════════════
export async function waitForCharacterReady(aiTools, timeoutMs = 8000) {
    const start = performance.now();
    const step = 150;
    while (performance.now() - start < timeoutMs) {
        try {
            const snap = aiTools.getSceneSnapshot();
            const state = snap?.character?.state;
            if (!state || !BUSY_STATES.includes(state)) return true;
        } catch { return true; }
        await new Promise((r) => setTimeout(r, step));
    }
    return false;
}

// ═══════════════════════════════════════════════════════════════
// RUN BATCH (Gửi cho Scene thực thi)
// ═══════════════════════════════════════════════════════════════
async function runBatch(aiTools, batch, maxRetries = 2) {
    let lastErr = null;
    for (let i = 0; i <= maxRetries; i++) {
        try {
            if (i > 0) await waitForCharacterReady(aiTools, 10000);
            const r = await aiTools.executeSequence(batch);
            return Array.isArray(r) ? r : (r ? [r] : []);
        } catch (err) {
            lastErr = err;
            if (/Character đang bận/.test(err?.message || '') && i < maxRetries) continue;
            throw err;
        }
    }
    throw lastErr;
}

// ═══════════════════════════════════════════════════════════════
// EXECUTE PLAN (Vòng lặp chính)
// ═══════════════════════════════════════════════════════════════
export async function executePlan(aiTools, actions, say) {
    const queue = actions.map(a => ({ tool: a.tool, args: { ...(a.args || {}) } }));
    const results = [];
    const extraSays = [];
    let batch = [];
    let guard = 0;

    const flush = async () => {
        if (!batch.length) return;
        const b = batch;
        batch = [];
        await waitForCharacterReady(aiTools, 8000);
        const r = await runBatch(aiTools, b);
        results.push(...r);
        const bad = r.find(x => x && (x.ok === false || x.error));
        if (bad) {
            const m = `⚠️ ${bad.error || bad.message || 'Một hành động không thực hiện được.'}`;
            say(m, 'unclear');
            extraSays.push(m);
        }
    };

    while (queue.length && guard++ < 60) {
        const a = queue.shift();
        const handler = CLIENT_HANDLERS[a.tool];

        // Nếu không có handler custom → đưa vào batch để Scene tự xử lý (VD: walkTo, walkRelative)
        if (!handler) {
            batch.push(a);
            continue;
        }

        await flush(); // Đảm bảo các bước trước đã xong (trạng thái mới nhất)
        if (NEEDS_IDLE.has(a.tool)) await waitForCharacterReady(aiTools, 8000);

        let out;
        try {
            out = await handler(a.args, say, { aiTools, action: a });
        } catch (err) {
            console.warn(`[CMD] handler ${a.tool} lỗi:`, err);
            say(`⚠️ Lỗi khi chạy "${a.tool}": ${err?.message || err}`, 'unclear');
            break;
        }

        if (typeof out === 'string') { extraSays.push(out); continue; }
        if (!out) continue;

        if (out.msg) {
            // Nếu handler trả về options (VD: đổi model sai tên), hiển thị nút bấm
            if (out.options?.length) {
                say(out.msg, 'unclear', out.options);
            } else {
                extraSays.push(out.msg);
            }
        }

        if (out.actions?.length) batch.push(...out.actions);
        if (out.subplan?.length) queue.unshift(...out.subplan.filter(s => s.tool !== 'repeatLast'));
        if (out.abort) break;
    }
    await flush();
    return { results, extraSays };
}

// ═══════════════════════════════════════════════════════════════
// SPLIT PLAN (Lấy Text, Options, Confidence)
// ═══════════════════════════════════════════════════════════════
export function splitPlan(plan) {
    const actions = [], says = [], kinds = [], optionsList = [], confidences = [];
    for (const a of plan) {
        if (a.tool === 'unclear' || a.tool === 'unsupported') {
            const text = a.args?.text || (a.tool === 'unclear' ? '🤔 Bạn nói rõ hơn được không?' : '🚧 Tính năng này mình chưa được lập trình 😅');
            const opts = a.args?.options || [];
            const conf = a.args?.confidence ?? 1.0; // Mặc định tự tin 1.0 nếu không có

            says.push(text);
            kinds.push(a.tool);
            optionsList.push(opts);
            confidences.push(conf);
        } else {
            actions.push(a);
        }
    }
    return { actions, says, kinds, optionsList, confidences };
}

// ═══════════════════════════════════════════════════════════════
// MEMORY & RUNNER
// ═══════════════════════════════════════════════════════════════
export function remember(userText, actions) {
    memory.history.push({
        user: userText,
        plan: actions.map(a => ({ tool: a.tool, ...(a.args && Object.keys(a.args).length ? { args: a.args } : {}) })),
    });
    if (memory.history.length > 8) memory.history.shift();

    const repeatable = actions.filter(a => !NON_REPEATABLE.has(a.tool));
    if (repeatable.length) {
        memory.lastPlan = repeatable.map(a => ({ tool: a.tool, args: { ...(a.args || {}) } }));
    }
}

export async function runPlan(aiTools, plan, say, userText, onStatus) {
    const { actions, says, kinds, optionsList, confidences } = splitPlan(plan);

    // ⭐ Truyền đủ 4 tham số: text, kind, options, confidence
    says.forEach((s, i) => say(s, kinds[i], optionsList[i], confidences[i]));

    if (!actions.length) return { cmds: [], results: [], says };

    onStatus(`⚡ Thực thi ${actions.length} hành động...`);
    const out = await executePlan(aiTools, actions, say);
    remember(userText, actions);

    return { cmds: actions, results: out.results, says: [...says, ...out.extraSays] };
}
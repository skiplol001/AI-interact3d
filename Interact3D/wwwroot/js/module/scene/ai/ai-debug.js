// ═══════════════════════════════════════════════════════════════
// ai-debug.js — Logger + Stats tracker cho AI module
//
// Trách nhiệm:
//   • Log input/output/decision của handleChat & handleCommand
//   • Track các lỗi: 404 model, 401/429, empty response, parse fail, bail
//   • Đếm số lần dùng mỗi model
//   • Cung cấp getStats() để UI hiển thị
//
// Chỉ log khi DEBUG = true. Trong production, set DEBUG = false.
// ═══════════════════════════════════════════════════════════════

const DEBUG = true;   // ⭐ đổi false khi production

// ─── Stats state ───
const stats = {
    sessionStart: new Date().toISOString(),

    // Đếm tổng
    totalCalls: 0,
    chatCalls: 0,
    commandCalls: 0,

    // Kết quả
    successCalls: 0,
    bailCalls: 0,         // bail "chuyển sang tab kia"
    errorCalls: 0,

    // Lỗi theo loại
    errors: {
        http404: 0,        // model không tồn tại
        http401: 0,        // key sai
        http429: 0,        // rate limit
        httpOther: 0,      // lỗi khác
        emptyResponse: 0,  // Groq trả mảng rỗng
        parseFail: 0,      // không parse được tool_calls
    },

    // Model usage
    modelsUsed: {},      // { 'openai/gpt-oss-120b': 5, ... }
    modelFailures: {},   // { 'llama-3.1-8b-instant': 3, ... }

    // Latency (ms)
    latencySum: 0,
    latencyMax: 0,

    // Gần đây (ring buffer 20 items)
    recent: [],

    // Cờ đánh dấu đã in lần đầu chưa
    _printed: false,
};

const MAX_RECENT = 20;

// ═══════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════

/**
 * Log khi bắt đầu xử lý một input.
 * @param {'chat'|'command'} mode
 * @param {string} userText
 */
export function logInput(mode, userText) {
    if (!DEBUG) return;

    stats.totalCalls++;
    if (mode === 'chat') stats.chatCalls++;
    else stats.commandCalls++;

    console.log(
        `%c📥 [${mode}] USER: "${userText}"`,
        'background: #0284c7; color: #fff; padding: 2px 6px; border-radius: 3px; font-weight: 600;'
    );
}

/**
 * Log quyết định (intent, bail, parse...).
 * @param {'chat'|'command'} mode
 * @param {string} decision — 'known' | 'unclear' | 'unsupported' | 'chat' | 'lookAround' | 'bail' | 'localParse' | 'groq'
 * @param {object} [details]
 */
export function logDecision(mode, decision, details = {}) {
    if (!DEBUG) return;

    const extra = Object.keys(details).length > 0
        ? ' ' + JSON.stringify(details)
        : '';

    console.log(
        `%c🧭 [${mode}] DECISION: ${decision}${extra}`,
        'color: #f59e0b; font-weight: 600;'
    );
}

/**
 * Log một lần gọi model.
 * @param {string} model
 * @param {'ok'|'404'|'400'|'401'|'429'|'other'} status
 * @param {number} [latency] ms
 */
export function logModelAttempt(model, status, latency = 0) {
    if (!DEBUG) return;

    if (status === 'ok') {
        stats.modelsUsed[model] = (stats.modelsUsed[model] || 0) + 1;
        console.log(
            `%c✅ MODEL OK: ${model} (${latency}ms)`,
            'color: #22c55e; font-weight: 600;'
        );
    } else {
        stats.modelFailures[model] = (stats.modelFailures[model] || 0) + 1;
        console.warn(
            `%c❌ MODEL FAIL: ${model} → ${status}`,
            'color: #ef4444; font-weight: 600;'
        );

        // Track lỗi
        if (status === '404') stats.errors.http404++;
        else if (status === '401') stats.errors.http401++;
        else if (status === '429') stats.errors.http429++;
        else stats.errors.httpOther++;
    }
}

/**
 * Log khi reply thành công.
 * @param {'chat'|'command'} mode
 * @param {string} replyText
 * @param {number} latency ms
 */
export function logSuccess(mode, replyText, latency = 0) {
    if (!DEBUG) return;

    stats.successCalls++;
    stats.latencySum += latency;
    if (latency > stats.latencyMax) stats.latencyMax = latency;

    const preview = replyText.length > 80
        ? replyText.slice(0, 80) + '…'
        : replyText;

    console.log(
        `%c✅ [${mode}] REPLY (${latency}ms): "${preview}"`,
        'color: #22c55e; font-weight: 600;'
    );

    pushRecent({
        time: new Date().toISOString(),
        mode,
        kind: 'success',
        preview,
        latency,
    });
}

/**
 * Log khi bail (chuyển tab).
 * @param {'chat'|'command'} mode
 * @param {string} userText
 * @param {string} reason
 */
export function logBail(mode, userText, reason) {
    if (!DEBUG) return;

    stats.bailCalls++;
    console.warn(
        `%c⚠️ [${mode}] BAIL: "${userText}" → ${reason}`,
        'color: #f59e0b; font-weight: 600; background: rgba(245,158,11,0.1); padding: 2px 4px; border-radius: 3px;'
    );

    pushRecent({
        time: new Date().toISOString(),
        mode,
        kind: 'bail',
        userText,
        reason,
    });
}

/**
 * Log khi gặp lỗi (throw).
 * @param {'chat'|'command'} mode
 * @param {string} userText
 * @param {Error} err
 */
export function logError(mode, userText, err) {
    if (!DEBUG) return;

    stats.errorCalls++;
    console.error(
        `%c🔴 [${mode}] ERROR: "${userText}" → ${err?.message || err}`,
        'color: #ef4444; font-weight: 600; background: rgba(239,68,68,0.1); padding: 2px 4px; border-radius: 3px;'
    );

    pushRecent({
        time: new Date().toISOString(),
        mode,
        kind: 'error',
        userText,
        error: err?.message || String(err),
    });
}

/**
 * Log khi parse response rỗng.
 * @param {'chat'|'command'} mode
 */
export function logEmptyResponse(mode) {
    if (!DEBUG) return;

    stats.errors.emptyResponse++;
    console.warn(
        `%c⚠️ [${mode}] EMPTY RESPONSE`,
        'color: #f59e0b;'
    );
}

/**
 * Log khi parse fail (tool_calls không hợp lệ).
 */
export function logParseFail() {
    if (!DEBUG) return;

    stats.errors.parseFail++;
    console.warn('%c⚠️ PARSE FAIL (malformed tool_call)', 'color: #f59e0b;');
}

// ═══════════════════════════════════════════════════════════════
// Recent buffer
// ═══════════════════════════════════════════════════════════════

function pushRecent(item) {
    stats.recent.push(item);
    if (stats.recent.length > MAX_RECENT) {
        stats.recent.shift();
    }
}

// ═══════════════════════════════════════════════════════════════
// Stats & print
// ═══════════════════════════════════════════════════════════════

/**
 * Trả về snapshot stats (không lộ object gốc).
 */
export function getStats() {
    const avgLatency = stats.successCalls > 0
        ? Math.round(stats.latencySum / stats.successCalls)
        : 0;

    return {
        sessionStart: stats.sessionStart,
        totalCalls: stats.totalCalls,
        byMode: {
            chat: stats.chatCalls,
            command: stats.commandCalls,
        },
        results: {
            success: stats.successCalls,
            bail: stats.bailCalls,
            error: stats.errorCalls,
        },
        errors: { ...stats.errors },
        modelsUsed: { ...stats.modelsUsed },
        modelFailures: { ...stats.modelFailures },
        latency: {
            avg: avgLatency,
            max: stats.latencyMax,
        },
        recent: [...stats.recent],
    };
}

/**
 * Reset stats — dùng khi muốn đo lại từ đầu.
 */
export function resetStats() {
    stats.totalCalls = 0;
    stats.chatCalls = 0;
    stats.commandCalls = 0;
    stats.successCalls = 0;
    stats.bailCalls = 0;
    stats.errorCalls = 0;
    Object.keys(stats.errors).forEach(k => { stats.errors[k] = 0; });
    stats.modelsUsed = {};
    stats.modelFailures = {};
    stats.latencySum = 0;
    stats.latencyMax = 0;
    stats.recent = [];
    console.log('%c🔄 Stats reset', 'color: #38bdf8; font-weight: 600;');
}

/**
 * In stats ra console.table — gọi từ UI (nút 🐞).
 */
export function printStats() {
    const s = getStats();

    console.group('%c📊 AI DEBUG STATS', 'color: #8b5cf6; font-size: 14px; font-weight: 700;');

    console.log(`Session start: ${s.sessionStart}`);
    console.log(`Total calls: ${s.totalCalls}`);

    console.table({
        'Chat calls': s.byMode.chat,
        'Command calls': s.byMode.command,
        '✅ Success': s.results.success,
        '⚠️ Bail': s.results.bail,
        '🔴 Error': s.results.error,
    });

    console.log('%c📛 Errors:', 'color: #ef4444; font-weight: 600;');
    console.table(s.errors);

    if (Object.keys(s.modelsUsed).length > 0) {
        console.log('%c✅ Models used:', 'color: #22c55e; font-weight: 600;');
        console.table(s.modelsUsed);
    }

    if (Object.keys(s.modelFailures).length > 0) {
        console.log('%c❌ Models failed:', 'color: #ef4444; font-weight: 600;');
        console.table(s.modelFailures);
    }

    console.log(`⏱️ Latency: avg ${s.latency.avg}ms · max ${s.latency.max}ms`);

    if (s.recent.length > 0) {
        console.log('%c🕐 Recent (20 last):', 'color: #38bdf8; font-weight: 600;');
        console.table(s.recent);
    }

    console.groupEnd();

    return s;
}

// ═══════════════════════════════════════════════════════════════
// Expose global để test từ DevTools
// ═══════════════════════════════════════════════════════════════

if (typeof window !== 'undefined') {
    window.AIDebug = { getStats, printStats, resetStats };
    if (DEBUG) {
        console.log(
            '%c🐞 AIDebug ready — gõ AIDebug.printStats() để xem thống kê',
            'color: #8b5cf6; font-weight: 600;'
        );
    }
}
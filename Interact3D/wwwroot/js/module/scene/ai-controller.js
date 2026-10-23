// ═══════════════════════════════════════════════════════════════
// ai-controller.js — Entry Point (Điều phối luồng lệnh + Popup)
// ═══════════════════════════════════════════════════════════════

import {
    normalizeVN, classifyIntent, isNarrativePrefix, LOOK_AROUND_PATTERN,
    summarizeSceneAround, errorToUserMessage, showPopup
} from './ai-shared.js?v=21';
import { logInput, logDecision, logSuccess, logBail, logError, logEmptyResponse } from './ai-debug.js?v=12';
import { NOT_COMMAND_MSG } from './ai-command/ai-command-config.js?v=15';
import { localParseCommand, vn } from './ai-command/ai-command-parser.js?v=13';
import { planWithAI } from './ai-command/ai-command-planner.js?v=17'; // ⭐ Update v=17
import { runPlan } from './ai-command/ai-command-executor.js?v=12';
import { CURRENT_TOOLS } from './ai-command/ai-command-handlers.js?v=15';
import { scoreInjectionAttempt } from './ai-chat/ai-chat-helpers.js?v=15'; // ⭐ Import Guard

const COMMAND_VOCAB = /\b(di|chay|quay|xoay|nhat|lay|cam|dat|tha|xoa|tao|sinh|them|doi|thay|dem|xep|chong|luu|ve|dung|nhin|zoom|focus|mang|dua|nhac|bo|dich|teleport|spawn|walk|turn|stop|hop|box|b\d+|model|nhan vat|lui|tien|nang|ha|len|xuong|sang|phai|trai|truoc|sau|camera)\b/;

export async function handleCommand(aiTools, userText, options = {}) {
    CURRENT_TOOLS.val = aiTools;
    const onStatus = options.onStatus || (() => { });
    const onSay = options.onSay || (() => { });

    const t0 = performance.now();
    logInput('command', userText);

    // ⭐ GUARD: Chặn Input Injection
    const injCheck = scoreInjectionAttempt(userText);
    if (injCheck.blocked) {
        logDecision('command', 'injectionBlocked', { score: injCheck.score });
        const msg = "🤔 Mình không hiểu ý bạn, nói rõ hơn được không?";
        onSay(msg, 'unclear', []);
        showPopup(msg, 'unclear');
        return { cmds: [], results: [], says: [msg] };
    }

    let _logged = false;
    const logSuccessOnce = (preview) => {
        if (_logged) return;
        _logged = true;
        logSuccess('command', preview, Math.round(performance.now() - t0));
    };

    // ⭐ Hàm say sử dụng showPopup
    const say = (text, kind = 'unclear', opts = [], confidence = 1.0) => {
        if (!text && (!opts || opts.length === 0)) return;

        if (kind === 'unclear' && opts && opts.length > 0) {
            window.__pendingQuestion = {
                originalText: userText,
                options: opts,
                expires: Date.now() + 60000
            };
        } else if (kind !== 'unclear') {
            window.__pendingQuestion = null;
        }

        onSay(text, kind, opts, confidence);
        onStatus(`💬 ${text}`);
        showPopup(text, kind);
    };

    const previewOf = (out) => out.cmds.length ? `executed ${out.cmds.map(a => a.tool).join(',')}` : (out.says.join(' | ') || '(no action)');

    // XỬ LÝ PENDING QUESTION
    let effectiveText = userText;
    if (window.__pendingQuestion && window.__pendingQuestion.expires > Date.now()) {
        const pending = window.__pendingQuestion;
        const lower = vn(userText).trim();

        if (userText.split(' ').length <= 3) {
            const match = pending.options.find(o => {
                const oLower = vn(o);
                return oLower === lower || lower.includes(oLower) || oLower.includes(lower);
            });
            if (match) {
                effectiveText = `${pending.originalText} ${match}`;
                console.log(`[CMD] Ghép pending question: "${userText}" -> "${effectiveText}"`);
            }
        }
        window.__pendingQuestion = null;
    }

    // ── 1. Thử Parse Local trước
    let localPlan = null;
    try { localPlan = localParseCommand(effectiveText); } catch (e) { console.warn('[CMD] localParse lỗi:', e); }

    if (localPlan?.length) {
        logDecision('command', 'localParse', { tools: localPlan.map(c => c.tool) });
        try {
            const out = await runPlan(aiTools, localPlan, say, effectiveText, onStatus);
            logSuccessOnce(previewOf(out));
            return out;
        } catch (err) {
            logError('command', userText, err);
            say(`Mình làm không được lệnh này 😅 (${err?.message || 'lỗi không rõ'})`, 'unclear');
            return { cmds: localPlan, results: [], says: [] };
        }
    }

    // ── 2. Bộ lọc mềm
    const t = normalizeVN(effectiveText);
    if (isNarrativePrefix(t)) {
        logBail('command', userText, 'narrative_prefix');
        say(NOT_COMMAND_MSG, 'unclear');
        return { cmds: [], results: [], says: [] };
    }

    try { LOOK_AROUND_PATTERN.lastIndex = 0; } catch { }
    if (LOOK_AROUND_PATTERN.test(t) && t.length < 60) {
        logDecision('command', 'lookAround');
        const summary = summarizeSceneAround(aiTools.getSceneSnapshot());
        say(summary, 'normal');
        logSuccessOnce(summary);
        return { cmds: [], results: [], says: [summary] };
    }

    const intent = classifyIntent(effectiveText);

    if (intent === 'chat' && !COMMAND_VOCAB.test(vn(effectiveText))) {
        logBail('command', userText, 'intent=chat');
        say(NOT_COMMAND_MSG, 'unclear');
        return { cmds: [], results: [], says: [] };
    }

    // ── 3. Gọi AI Planner
    const apiKey = localStorage.getItem('groq_api_key');
    if (!apiKey) {
        logError('command', userText, new Error('missing_api_key'));
        const msg = intent === 'unsupported'
            ? '🚧 Tính năng này mình chưa được lập trình 😅'
            : 'Mình chưa hiểu lệnh này 😅 VD: "đi sang trái 3m rồi nhặt hộp đỏ". Nhập Groq API key để mình hiểu lệnh phức tạp hơn.';
        say(msg, 'unclear');
        return { cmds: [], results: [], says: [msg] };
    }

    logDecision('command', 'groq');
    onStatus('🤖 AI đang phân tích lệnh...');

    try {
        const { plan, problems } = await planWithAI(apiKey, aiTools, effectiveText);
        if (!plan.length) {
            logEmptyResponse('command');
            const msg = problems.length ? '🤔 Mình chưa hiểu rõ lệnh này, bạn nói cụ thể hơn được không?' : '🤔 Mình chưa hiểu lệnh này 😅';
            say(msg, 'unclear');
            return { cmds: [], results: [], says: [msg] };
        }
        logDecision('command', 'groq_plan', { tools: plan.map(c => c.tool), problems });

        const out = await runPlan(aiTools, plan, say, effectiveText, onStatus);
        logSuccessOnce(previewOf(out));
        return out;
    } catch (err) {
        logError('command', userText, err);
        const userMsg = errorToUserMessage(err);
        say(userMsg, 'unsupported');
        return { cmds: [], results: [], says: [userMsg] };
    }
}
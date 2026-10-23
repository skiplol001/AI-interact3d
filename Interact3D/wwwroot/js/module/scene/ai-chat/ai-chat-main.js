// ═══════════════════════════════════════════════════════════════
// ai-chat-main.js — Luồng xử lý chính của Chat Mode (Popup Sync)
// ═══════════════════════════════════════════════════════════════

import {
    MODEL_CHAIN, MAX_HISTORY_PAIRS, LOOK_AROUND_PATTERN,
    summarizeSceneAround, askGroq, errorToUserMessage, pickFallback,
    formatReply, getTimeContext, getPrefs, setPrefs, detectPreference, prefsToPrompt,
    normalizeVN, isNarrativePrefix, showPopup // ⭐ Import showPopup
} from '../ai-shared.js?v=12';

import {
    logInput, logDecision, logSuccess, logError, logEmptyResponse
} from '../ai-debug.js?v=12';

import { CHAT_TOOLS, CHAT_MODES, COMMON_RULES } from './ai-chat-config.js?v=12';
import {
    detectSavageRequest, detectLang, extractEmotionFromMessage,
    localParseChat, shouldIncludeScene, analyzeReplyEmotion, overrideEmotionFromKeywords
} from './ai-chat-helpers.js?v=12';

function parseChatResponse(message) {
    const actions = [], says = [], kinds = [], optionsList = [];
    if (message?.tool_calls) {
        for (const call of message.tool_calls) {
            const name = call.function?.name;
            try {
                const args = JSON.parse(call.function?.arguments || '{}');
                if (name === 'say') {
                    says.push(args.text || '');
                    kinds.push('normal');
                    optionsList.push(args.options || []);
                } else if (name === 'switchModel') {
                    actions.push({ tool: 'switchModel', args });
                } else {
                    says.push(args.text || '');
                    kinds.push(name === 'unclear' ? 'unclear' : 'normal');
                    optionsList.push(args.options || []);
                }
            } catch { /* skip */ }
        }
    }
    if (actions.length === 0 && says.length === 0 && message?.content) {
        says.push(message.content);
        kinds.push('normal');
        optionsList.push([]);
    }
    return { actions, says, kinds, optionsList };
}

export async function handleChat(aiTools, userText, options = {}) {
    const onStatus = options.onStatus || (() => { });
    const onSay = options.onSay || (() => { });
    const history = options.history || [];
    const savageToggle = options.savageMode === true;
    const uiMode = options.mode || 'normal';

    const t0 = performance.now();
    logInput('chat', userText);

    const emotionCtrl = window.emotionCtrl;

    let _loggedSuccess = false;
    const logSuccessOnce = (preview) => {
        if (_loggedSuccess) return;
        _loggedSuccess = true;
        logSuccess('chat', preview, Math.round(performance.now() - t0));
    };

    const say = (text, kind = 'normal', emotion = null, opts = []) => {
        if (!text) return;
        const formatted = formatReply(text);
        onSay(formatted, kind, opts);
        const MAX_STATUS = 80;
        const statusPreview = formatted.length > MAX_STATUS ? formatted.slice(0, MAX_STATUS).trim() + '…' : formatted;
        onStatus(`💬 ${statusPreview}`);

        // ⭐ Sử dụng showPopup thay vì gọi trực tiếp
        showPopup(formatted, kind);

        // Kích hoạt emotion ban đầu
        if (emotion && emotionCtrl) emotionCtrl.trigger(emotion);
    };

    const t = normalizeVN(userText);

    // ── 0. TÌM KIẾM LỆNH TRỰC TIẾP TỪ USER
    const directEmote = overrideEmotionFromKeywords(userText);

    // ── 1. ĐỔI MODEL CỤC BỘ
    if (/\b(doi|thay|chuyen)\b/.test(t) && /\b(model|nhan vat)\b/.test(t)) {
        const availableModels = window.availableModels || [];
        const foundModel = availableModels.find(m => t.includes(m.name.toLowerCase()));
        if (foundModel) {
            const replyMsgs = [];
            const mySay = (txt, k, e) => { replyMsgs.push(txt); say(txt, k, e); };
            mySay(`🔄 Đang đổi sang model "${foundModel.name}"...`, 'normal', 'thinking');
            try {
                const res = await window.switchCharacterModel(foundModel.name);
                if (res.ok) mySay(`✅ Đã đổi sang model "${foundModel.name}". Nhìn ngon hơn hẳn 😏`, 'normal', 'happy');
                else mySay(`⚠️ Lỗi: ${res.error}`, 'unclear', 'confused');
            } catch (e) {
                mySay(`⚠️ Lỗi: ${e.message}`, 'unclear', 'confused');
            }
            logSuccessOnce(`switchModel: ${foundModel.name}`);
            return { says: replyMsgs };
        }
    }

    // ── 2. PREFERENCES
    const detectedPref = detectPreference(t);
    if (detectedPref) {
        const prefs = getPrefs();
        prefs[detectedPref.key] = detectedPref.value;
        setPrefs(prefs);
        const msg = `✅ Đã ghi nhớ: ${detectedPref.label}. Tao sẽ áp dụng từ giờ!`;
        say(msg, 'normal', 'happy');
        logSuccessOnce(msg);
        logDecision('chat', 'savePref', detectedPref);
        return { says: [msg] };
    }

    // ── 3. NHÌN XUNG QUANH
    if (LOOK_AROUND_PATTERN.test(t) && t.length < 60 && !isNarrativePrefix(t)) {
        logDecision('chat', 'lookAround');
        const summary = summarizeSceneAround(aiTools.getSceneSnapshot());
        say(summary, 'normal', 'looking');
        logSuccessOnce(summary);
        return { says: [summary] };
    }

    // ── 4. LOCAL CHAT
    const localReply = localParseChat(userText);
    if (localReply) {
        logDecision('chat', 'localParse', { preview: localReply.text.slice(0, 40) });
        say(localReply.text, 'normal', localReply.emotion);
        logSuccessOnce(localReply.text);
        return { says: [localReply.text] };
    }

    // ── 5. GỌI API GROQ
    const apiKey = localStorage.getItem('groq_api_key');
    if (!apiKey) {
        logError('chat', userText, new Error('missing_api_key'));
        say('💡 Mình cần Groq API Key để trả lời câu hỏi này. Nhấn "🔑 Đổi Key Groq" ở trên nhé!', 'unclear', 'confused');
        return { says: [] };
    }

    const isSavageAuto = detectSavageRequest(t);
    let finalMode = uiMode;
    if (isSavageAuto) finalMode = 'savage';
    else if (savageToggle) finalMode = 'savage';

    logDecision('chat', 'groq', {
        lang: detectLang(userText),
        sceneIncluded: shouldIncludeScene(t),
        historyLen: history.length,
        mode: finalMode
    });

    const trimmedHistory = history.slice(-MAX_HISTORY_PAIRS * 2);

    const modelsList = (window.availableModels || []).map(m => m.name);
    const modelContext = modelsList.length > 0
        ? `\n\n[DANH SÁCH MODEL ĐANG CÓ: ${modelsList.join(', ')}. Nếu user muốn đổi model, hãy gọi tool switchModel.]`
        : '';

    const sceneCtx = shouldIncludeScene(t)
        ? JSON.stringify(aiTools.getSceneSnapshot()) + modelContext
        : (modelsList.length > 0 && /\b(doi|thay|chuyen)\b/.test(t) ? JSON.stringify({ availableModels: modelsList }) : '{}');

    const timeCtx = getTimeContext();
    const prefsCtx = prefsToPrompt(getPrefs());
    const modePrompt = CHAT_MODES[finalMode]?.prompt || CHAT_MODES.normal.prompt;

    const finalPrompt = `${modePrompt}\n\n${COMMON_RULES}${prefsCtx}${timeCtx}`;

    onStatus(finalMode === 'savage' ? '😈 Linh đang gầm gừ...' : (finalMode === 'gentle' ? '🌸 Linh đang lắng nghe...' : '🤖 Linh đang suy nghĩ...'));

    if (emotionCtrl && !directEmote) {
        emotionCtrl.trigger('thinking', { force: true });
    }

    try {
        const message = await askGroq(apiKey, {
            models: MODEL_CHAIN.chat,
            systemPrompt: finalPrompt,
            tools: CHAT_TOOLS,
            toolChoice: 'auto',
            temperature: finalMode === 'savage' ? 0.95 : 0.85,
            maxTokens: 350,
            userText,
            sceneCtx,
            history: trimmedHistory,
        });

        const { actions, says, kinds, optionsList } = parseChatResponse(message);

        if (actions && actions.length > 0) {
            for (const action of actions) {
                if (action.tool === 'switchModel') {
                    const modelName = action.args?.modelName;
                    if (modelName && typeof window.switchCharacterModel === 'function') {
                        say(`🔄 Đang đổi sang model "${modelName}"...`, 'normal', 'thinking');
                        try {
                            const res = await window.switchCharacterModel(modelName);
                            if (res.ok) say(`✅ Đã đổi sang model "${modelName}". Nhìn ngon hơn hẳn 😏`, 'normal', 'happy');
                            else say(`⚠️ Lỗi: ${res.error}`, 'unclear', 'confused');
                        } catch (e) {
                            say(`⚠️ Lỗi: ${e.message}`, 'unclear', 'confused');
                        }
                    }
                }
            }
        }

        // ⭐ XÁC ĐỊNH CẢM XÚC CUỐI CÙNG (Logic 4 lớp)
        let finalEmotion = extractEmotionFromMessage(message, userText);

        if (!finalEmotion || finalEmotion === 'neutral' || finalEmotion === 'talking') {
            const textEmotion = analyzeReplyEmotion(says.join(' '));
            if (textEmotion !== 'talking') {
                finalEmotion = textEmotion;
            }
        }

        if (directEmote) {
            finalEmotion = directEmote;
        }

        const MIN_WORDS = 5;
        for (let i = 0; i < says.length; i++) {
            const textOnly = says[i].replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim();
            const realWordCount = textOnly.split(/\s+/).filter(w => w).length;

            if (realWordCount < MIN_WORDS) {
                const suffix = { sad: ' Huhu...', happy: ' Hihi...', angry: ' Hừ...', neutral: '' }[finalEmotion] || '';
                says[i] = says[i].trim() + suffix;
            }
        }

        if (says.length === 0 && (!actions || actions.length === 0)) {
            logEmptyResponse('chat');
            const fallback = pickFallback();
            say(fallback, 'unclear', 'confused');
            logSuccessOnce(fallback);
            return { says: [] };
        }

        says.forEach((s, i) => say(s, kinds[i] || 'normal', finalEmotion, optionsList[i] || []));
        logSuccessOnce(says.join(' | '));

        return { says, emotion: finalEmotion };

    } catch (err) {
        logError('chat', userText, err);
        const userMsg = errorToUserMessage(err);
        say(userMsg, 'unsupported', 'sad');
        return { says: [] };
    }
}
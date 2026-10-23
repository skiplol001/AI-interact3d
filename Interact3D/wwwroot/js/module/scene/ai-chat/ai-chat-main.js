// ═══════════════════════════════════════════════════════════════
// ai-chat-main.js — v25 (Inject Guards + Scene Sanitize)
// ═══════════════════════════════════════════════════════════════

import {
    MODEL_CHAIN, LOOK_AROUND_PATTERN,
    summarizeSceneAround, askGroq, errorToUserMessage, pickFallback,
    formatReply, getTimeContext, getPrefs, setPrefs, detectPreference, prefsToPrompt,
    normalizeVN, isNarrativePrefix, showPopup, sanitizeSceneContext, // ⭐ Import sanitizer
    getUserMoodContext, getNameContext, getMemoryContext,
    setUserName, addMemory, getUserName,
    summarizeHistory
} from '../ai-shared.js?v=21';

import {
    logInput, logDecision, logSuccess, logError, logEmptyResponse
} from '../ai-debug.js?v=12';

import { CHAT_TOOLS, CHAT_MODES, COMMON_RULES, savageSpice, SAVAGE_RETRY_NOTE } from './ai-chat-config.js?v=6';
import {
    detectLang, extractEmotionFromMessage, localParseChat, shouldIncludeScene,
    analyzeReplyEmotion, overrideEmotionFromKeywords, isTooSoft, isRefusal,
    detectNameStatement, detectMemoryWorthy, detectMoodShift,
    detectChineseDrift, stripCJK, detectActionIntent,
    detectSpecialCommand, detectSavageRequest,
    scoreInjectionAttempt, detectPromptLeak // ⭐ Import AI Guards
} from './ai-chat-helpers.js?v=15'; // ⭐ Update version v=15

import { getMoodPrompt, processTextForMood, getMood } from './ai-mood.js?v=2';

const MAX_TOKENS_CHAT = 180;
const MAX_TOKENS_RETRY = 120;
const HISTORY_SLICE = 3;
const SUMMARIZE_THRESHOLD = 24;
const SUMMARY_MIN_CHARS = 800;

const GENERIC_RETRY_NOTE = '\n\n# LƯU Ý\nCâu trả lời trước bị lỗi (từ chối, nói tiếng Anh, hoặc lẫn tiếng Trung). Trả lời lại bằng tiếng Việt, đúng giọng nhân vật.';

// ═══════════════════════════════════════════════════════════════
// HOUSE STATE HELPERS
// ═══════════════════════════════════════════════════════════════
const SILENT_RESPONSES = {
    gentle: ['...', 'Đừng nói chuyện với mình lúc này...', 'Mình không muốn nói.', 'Để mình yên.'],
    normal: ['Đm, đừng nói.', 'Tao đéo muốn nói chuyện.', 'Kệ tao.', 'Im đi.'],
    savage: ['Đm, im.', '...', 'Cút.', 'Đéo nói.'],
};

function _pickSilentResponse(mode) {
    const arr = SILENT_RESPONSES[mode] || SILENT_RESPONSES.normal;
    return arr[Math.floor(Math.random() * arr.length)];
}

const BUILD_HOUSE_PATTERNS = [
    /\b(xay|build|construct|make|create|lam|tao|xay dung)\s+(cai\s+|can\s+|mot\s+|a\s+|the\s+)?(nha|house|home)\b/i,
    /^(xay\s+nha|build\s+(a\s+|the\s+)?house|xay\s+cho\s+(minh|toi|tao|em|ban))\b/i,
];

const NOT_BUILD_HOUSE_PATTERNS = [
    /\b(xay|build)\s+(hop|box|tuong|wall|gach|brick|tru|pillar|cot|beam)\b/i,
    /\b(ve|o|trong|ra)\s+nha\b/i,
];

function _detectBuildHouseIntent(text) {
    const t = normalizeVN(text).trim();
    if (!t) return false;

    for (const re of NOT_BUILD_HOUSE_PATTERNS) {
        if (re.test(t)) {
            for (const rePos of BUILD_HOUSE_PATTERNS) {
                if (rePos.test(t)) return true;
            }
            return false;
        }
    }

    for (const re of BUILD_HOUSE_PATTERNS) {
        if (re.test(t)) return true;
    }
    return false;
}

// ═══════════════════════════════════════════════════════════════
// SYS MESSAGES
// ═══════════════════════════════════════════════════════════════
const SYS = {
    gentle: {
        prefSaved: (l) => `✅ Mình ghi nhớ rồi nè: ${l}. Mình sẽ áp dụng từ giờ nha 🌸`,
        switching: (n) => `🔄 Mình đang đổi sang model "${n}" nha...`,
        switched: (n) => `✅ Đổi sang model "${n}" xong rồi nè ✨`,
        holdStart: (action) => `Ơ... mình ${action} đây, cùng xem nào 😊`,
        holdCancel: `Ừm, mình đứng lên rồi nè 😊`,
    },
    normal: {
        prefSaved: (l) => `✅ Đã ghi nhớ: ${l}. Tớ sẽ áp dụng từ giờ nhé!`,
        switching: (n) => `🔄 Đang đổi sang model "${n}"...`,
        switched: (n) => `✅ Đã đổi sang model "${n}". Nhìn ngon hơn hẳn 😏`,
        holdStart: (action) => `Ok, ${action} đây. Làm gì tiếp?`,
        holdCancel: `Dậy rồi nha, có gì nói tiếp.`,
    },
    savage: {
        prefSaved: (l) => `✅ Ghi nhớ rồi: ${l}. Tao áp dụng từ giờ, đừng bắt tao nhắc lại 😒`,
        switching: (n) => `🔄 Đợi tí, đang đổi sang "${n}" cho mày đây...`,
        switched: (n) => `✅ Đổi sang "${n}" rồi đấy. Nhìn đỡ ngứa mắt hơn hẳn 😏`,
        holdStart: (action) => `Đm, ${action} đây. Mày vừa lòng chưa? 😤`,
        holdCancel: `Đứng lên rồi, mày có gì nói lẹ đi.`,
    },
};

function salvageText(raw) {
    const m = /"text"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(String(raw || ''));
    if (!m) return '';
    try { return JSON.parse(`"${m[1]}"`); }
    catch { return m[1].replace(/\\n/g, ' ').replace(/\\"/g, '"').replace(/\\$/, ''); }
}

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
                } else if (name === 'switchModel' || name === 'buildHouse') {
                    actions.push({ tool: name, args });
                } else {
                    says.push(args.text || '');
                    kinds.push(name === 'unclear' ? 'unclear' : 'normal');
                    optionsList.push(args.options || []);
                }
            } catch {
                if (name !== 'switchModel' && name !== 'buildHouse') {
                    const s = salvageText(call.function?.arguments);
                    if (s) { says.push(s); kinds.push('normal'); optionsList.push([]); }
                }
            }
        }
    }
    if (actions.length === 0 && says.filter(Boolean).length === 0 && message?.content) {
        says.length = 0; kinds.length = 0; optionsList.length = 0;
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
    const uiMode = ['gentle', 'normal', 'savage'].includes(options.mode) ? options.mode : 'normal';

    const t0 = performance.now();
    logInput('chat', userText);

    // ⭐ GUARD: Chặn Input Injection
    const injCheck = scoreInjectionAttempt(userText);
    if (injCheck.blocked) {
        logDecision('chat', 'injectionBlocked', { score: injCheck.score, hits: injCheck.hits });
        const fallbackMsg = uiMode === 'savage' ? "Đm, nói cái đéo gì lằng nhằng vậy? 🤬" : (uiMode === 'gentle' ? "Ơ... mình không hiểu ý bạn lắm 🥺" : "Nói gì khó hiểu vậy mày? 😒");
        onSay(fallbackMsg, 'unclear', []);
        showPopup(fallbackMsg, 'unclear');
        return { says: [fallbackMsg] };
    }

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

        if (emotion && emotionCtrl) emotionCtrl.trigger(emotion);
        showPopup(formatted, kind);
    };

    const t = normalizeVN(userText);
    // Làm sạch text: chuyển về chữ thường, bỏ dấu câu, khoảng trắng thừa
    const cleanText = t.replace(/[.,!?;:]/g, '').replace(/\s+/g, ' ').trim();

    processTextForMood(userText);
    const moodCtx = getMoodPrompt();

    const isCursing = detectSavageRequest(t);
    let finalMode = uiMode;
    if (savageToggle || (uiMode !== 'gentle' && isCursing)) {
        finalMode = 'savage';
    }
    const sys = SYS[finalMode] || SYS.normal;

    // ═══════════════════════════════════════════════════════════════
    // ⭐ BẮT SỰ KIỆN CHỌN KỸ NĂNG (TỪ OPTIONS)
    // ═══════════════════════════════════════════════════════════════
    if (cleanText === 'ném đá' || cleanText === 'nem da') {
        logDecision('chat', 'skill_nem_da');
        if (window.actionDirector) window.actionDirector.playMagicAttack(finalMode);
        say("Ném đá! 🪨", 'normal', 'angry');
        return { says: ["Ném đá! 🪨"] };
    }
    if (cleanText === 'cột lửa' || cleanText === 'cot lua') {
        logDecision('chat', 'skill_cot_lua');
        if (window.actionDirector) window.actionDirector.playPillarOfFire(finalMode);
        say("Cột lửa! 🔥", 'normal', 'angry');
        return { says: ["Cột lửa! 🔥"] };
    }
    if (cleanText === 'sấy lửa' || cleanText === 'say lua') {
        logDecision('chat', 'skill_say_lua');
        if (window.actionDirector) window.actionDirector.playFireBeam(finalMode);
        say("Sấy lửa! 🌋", 'normal', 'angry');
        return { says: ["Sấy lửa! 🌋"] };
    }

    // ═══════════════════════════════════════════════════════════════
    // ⭐ HOUSE MANAGER STATE CHECKS
    // ═══════════════════════════════════════════════════════════════
    const houseMgr = window.houseManager;

    if (houseMgr) {
        if (houseMgr.isReacting()) {
            logDecision('chat', 'houseReactingBlock');
            onStatus('😶 Reika đang bận xử lý...');
            return { says: ['...'] };
        }

        if (houseMgr.isSilent()) {
            logDecision('chat', 'houseSilentBlock');
            const silentMsg = _pickSilentResponse(finalMode);
            const emo = finalMode === 'gentle' ? 'sad' : 'angry';
            say(silentMsg, 'normal', emo);
            logSuccessOnce(silentMsg);
            return { says: [silentMsg] };
        }

        if (!isCursing && _detectBuildHouseIntent(t)) {
            logDecision('chat', 'autoBuildHouse');
            const capturedMessages = [];
            const origShowCharMsg = window.showCharacterMessage;
            const origShowPopup = window.showPopup;

            const captureFn = (text, kind) => {
                if (!text) return;
                const formatted = formatReply(text);
                if (capturedMessages.includes(formatted)) return;
                capturedMessages.push(formatted);
                onSay(formatted, kind || 'normal', []);
                const preview = formatted.length > 80 ? formatted.slice(0, 80).trim() + '…' : formatted;
                onStatus(`💬 ${preview}`);
                if (origShowCharMsg) {
                    try { origShowCharMsg(formatted, kind || 'normal'); } catch { }
                }
            };

            window.showCharacterMessage = captureFn;
            window.showPopup = captureFn;

            let buildResult = null;
            try {
                buildResult = await houseMgr.autoBuildHouseByReika();
            } catch (e) {
                console.warn('[Chat] autoBuildHouse error:', e);
            } finally {
                window.showCharacterMessage = origShowCharMsg;
                window.showPopup = origShowPopup;
            }

            if (buildResult?.ok || capturedMessages.length > 0) {
                logSuccessOnce(capturedMessages.join(' | ') || 'autoBuildHouse done');
                return { says: capturedMessages };
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // SPECIAL COMMANDS (HUG, BLOW_KISS, MAGIC)
    // ═══════════════════════════════════════════════════════════════
    if (!isCursing) {
        const specialCmd = detectSpecialCommand(userText);
        if (specialCmd) {
            logDecision('chat', 'specialCommand', { action: specialCmd.action });

            if (specialCmd.action === 'magic') {
                const opts = ["Ném đá", "Cột lửa", "Sấy lửa"];
                const askMsg = finalMode === 'gentle'
                    ? 'Bạn muốn dùng chiêu nào? 🌸'
                    : (finalMode === 'savage'
                        ? 'Đm, dùng chiêu gì?! Chọn lẹ đi! 🤬'
                        : 'Dùng chiêu gì đây? 😏');
                say(askMsg, 'unclear', 'thinking', opts);
                logSuccessOnce(askMsg);
                return { says: [askMsg] };
            }

            if (window.actionDirector) {
                if (specialCmd.action === 'hug') window.actionDirector.playHug(finalMode);
                else if (specialCmd.action === 'blow_kiss') window.actionDirector.playBlowKiss(finalMode);
            }

            const fallbackText = {
                hug: {
                    gentle: 'Ơ... ôm mình hả? Được thôi, lại đây... 🤗',
                    normal: 'Haizz... thôi được rồi, lại đây! 😌',
                    savage: 'Đm, tự nhiên đòi ôm? ... Thôi được, lại đây! 🤬'
                },
                blow_kiss: {
                    gentle: 'Mình gửi bạn một nụ hôn gió nhé! 💖',
                    normal: 'Chuẩn bị tinh thần nhận nè. Chụt~ 😏',
                    savage: 'Đây, ăn nụ hôn gió của bà đây! 😡'
                }
            };
            const text = fallbackText[specialCmd.action]?.[finalMode] || '...';
            say(text, 'normal', null);
            logSuccessOnce(text);
            return { says: [text] };
        }

        const localReply = localParseChat(userText, finalMode);
        if (localReply) {
            logDecision('chat', 'localChat', { preview: localReply.text.slice(0, 40) });
            say(localReply.text, 'normal', localReply.emotion);
            logSuccessOnce(localReply.text);
            return { says: [localReply.text] };
        }
    }

    const directEmote = overrideEmotionFromKeywords(userText);

    let justLearnedName = null;
    const nameStatement = detectNameStatement(userText);
    if (nameStatement) {
        const oldName = getUserName();
        if (setUserName(nameStatement.name) && oldName !== nameStatement.name) {
            justLearnedName = nameStatement.name;
            logDecision('chat', 'learnName', { name: nameStatement.name });
        }
    }

    const memoryMeta = detectMemoryWorthy(userText);
    if (memoryMeta) {
        setTimeout(() => { addMemory(userText.slice(0, 200), memoryMeta.mood); }, 0);
    }

    if (/\b(doi|thay|chuyen)\b/.test(t) && /\b(model|nhan vat)\b/.test(t)) {
        const availableModels = window.availableModels || [];
        const foundModel = availableModels.find(m => t.includes(m.name.toLowerCase()));
        if (foundModel) {
            const replyMsgs = [];
            const mySay = (txt, k, e) => { replyMsgs.push(txt); say(txt, k, e); };
            mySay(sys.switching(foundModel.name), 'normal', 'thinking');
            try {
                const res = await window.switchCharacterModel(foundModel.name);
                if (res.ok) {
                    mySay(sys.switched(foundModel.name), 'normal', 'happy');
                    try { localStorage.setItem('ai_last_model', foundModel.name); } catch { }
                } else mySay(`⚠️ Lỗi: ${res.error}`, 'unclear', 'confused');
            } catch (e) { mySay(`⚠️ Lỗi: ${e.message}`, 'unclear', 'confused'); }
            logSuccessOnce(replyMsgs.join(' | '));
            return { says: replyMsgs };
        }
    }

    const detectedPref = detectPreference(t);
    if (detectedPref) {
        const prefs = getPrefs();
        prefs[detectedPref.key] = detectedPref.value;
        setPrefs(prefs);
        const msg = sys.prefSaved(detectedPref.label);
        say(msg, 'normal', 'happy');
        logSuccessOnce(msg);
        return { says: [msg] };
    }

    if (LOOK_AROUND_PATTERN.test(t) && t.length < 60 && !isNarrativePrefix(t)) {
        const summary = summarizeSceneAround(aiTools.getSceneSnapshot());
        say(summary, 'normal', 'looking');
        logSuccessOnce(summary);
        return { says: [summary] };
    }

    let apiKey = null;
    try { apiKey = localStorage.getItem('groq_api_key'); } catch { }
    if (!apiKey) {
        logError('chat', userText, new Error('missing_api_key'));
        say('💡 Mình cần Groq API Key để trả lời câu hỏi này. Nhấn "🔑 Đổi Key Groq" ở trên nhé!', 'unclear', 'confused');
        return { says: [] };
    }

    if (history.length >= SUMMARIZE_THRESHOLD) {
        const historyText = history.map(h => `${h.role === 'user' ? 'User' : 'Reika'}: ${h.content}`).join('\n');
        if (historyText.length >= SUMMARY_MIN_CHARS) {
            summarizeHistory(apiKey, historyText).then(() => {
                console.log('[Chat] Đã tạo tóm tắt cuộc trò chuyện mới.');
            }).catch(() => { });
        }
    }

    logDecision('chat', 'groq', {
        lang: detectLang(userText),
        sceneIncluded: shouldIncludeScene(t),
        historyLen: history.length,
        mode: finalMode,
        mood: getMood()
    });

    const trimmedHistory = history.slice(-HISTORY_SLICE);

    const modelsList = (window.availableModels || []).map(m => m.name);
    const modelContext = modelsList.length > 0 ? `\n\n[DANH SÁCH MODEL: ${modelsList.join(', ')}. Nếu user muốn đổi model, gọi tool switchModel.]` : '';

    // ⭐ FIX INJECTION: Sanitize sceneCtx
    let rawSceneCtx = shouldIncludeScene(t)
        ? aiTools.getSceneSnapshot()
        : (modelsList.length > 0 && /\b(doi|thay|chuyen)\b/.test(t) ? { availableModels: modelsList } : {});

    const safeSceneCtx = sanitizeSceneContext(rawSceneCtx);
    const sceneCtx = JSON.stringify(safeSceneCtx) + modelContext;

    const timeCtx = getTimeContext();
    const prefsCtx = prefsToPrompt(getPrefs());
    const userMoodCtx = getUserMoodContext();
    const nameCtx = getNameContext();
    const memoryCtx = getMemoryContext();

    let nameLearnHint = '';
    if (justLearnedName) {
        nameLearnHint = `\n\n# VỪA BIẾT TÊN USER\nUser vừa cho biết tên là "${justLearnedName}". Hãy ACKNOWLEDGE tên này NGAY trong reply đầu tiên.`;
    }

    let actionHint = '';
    if (directEmote) {
        actionHint = `\n\n# USER VỪA YÊU CẦU ĐỔI TƯ THẾ\nUser vừa yêu cầu bạn ${directEmote === 'laying' ? 'nằm xuống' : 'ngồi xuống'}. Bạn đã thực hiện. Trả lời tự nhiên.`;
    }

    const modePrompt = CHAT_MODES[finalMode]?.prompt || CHAT_MODES.normal.prompt;
    const spice = finalMode === 'savage' ? savageSpice() : '';

    const finalPrompt = `${modePrompt}\n\n${COMMON_RULES}${moodCtx}${prefsCtx}${timeCtx}${userMoodCtx}${nameCtx}${memoryCtx}${nameLearnHint}${actionHint}${spice}`;

    onStatus(finalMode === 'savage' ? '😈 Reika đang gầm gừ...' : (finalMode === 'gentle' ? '🌸 Reika đang lắng nghe...' : '🤖 Reika đang suy nghĩ...'));

    if (emotionCtrl && !directEmote) {
        emotionCtrl.trigger('thinking', { force: true });
    }

    const baseTemp = { gentle: 0.8, normal: 0.85, savage: 1.0 }[finalMode] ?? 0.85;

    const runGroq = (prompt, temperature, maxTokens = MAX_TOKENS_CHAT) => askGroq(apiKey, {
        models: MODEL_CHAIN.chat,
        systemPrompt: prompt,
        tools: CHAT_TOOLS,
        toolChoice: 'auto',
        temperature,
        maxTokens,
        reasoningEffort: 'low',
        userText,
        sceneCtx,
        history: trimmedHistory,
    });

    try {
        let message = await runGroq(finalPrompt, baseTemp);
        let parsed = parseChatResponse(message);

        const badReply = (p) => {
            const s = p.says.join(' ');
            return isRefusal(s) || detectChineseDrift(s) || (finalMode === 'savage' && isTooSoft('savage', s));
        };

        if (parsed.says.filter(Boolean).length && badReply(parsed)) {
            logDecision('chat', 'retryBadReply', { preview: parsed.says.join(' ').slice(0, 60) });
            try {
                const m3 = await runGroq(
                    finalPrompt + (finalMode === 'savage' ? SAVAGE_RETRY_NOTE : GENERIC_RETRY_NOTE),
                    finalMode === 'savage' ? 1.0 : baseTemp,
                    MAX_TOKENS_RETRY
                );
                const p3 = parseChatResponse(m3);
                if (p3.says.filter(Boolean).length && !badReply(p3)) { message = m3; parsed = p3; }
            } catch (e3) { console.warn('[Chat] retryBadReply lỗi:', e3?.message); }
        }

        // ⭐ GUARD: Chặn Prompt Leak
        if (detectPromptLeak(parsed.says.join(' '))) {
            logDecision('chat', 'promptLeakBlocked');
            parsed.says = []; // Xóa sạch câu trả lời bị lộ prompt
        }

        if (detectChineseDrift(parsed.says.join(' '))) {
            parsed.says = parsed.says.map(s => stripCJK(s));
        }
        if (isRefusal(parsed.says.join(' '))) {
            parsed = { actions: parsed.actions, says: [], kinds: [], optionsList: [] };
        }

        const { actions, says, kinds, optionsList } = parsed;
        const saidMessages = [];

        if (actions && actions.length > 0) {
            for (const action of actions) {
                if (action.tool === 'switchModel') {
                    const modelName = action.args?.modelName;
                    if (modelName && typeof window.switchCharacterModel === 'function') {
                        const switchingMsg = sys.switching(modelName);
                        say(switchingMsg, 'normal', 'thinking');
                        saidMessages.push(switchingMsg);
                        try {
                            const res = await window.switchCharacterModel(modelName);
                            if (res.ok) {
                                const switchedMsg = sys.switched(modelName);
                                say(switchedMsg, 'normal', 'happy');
                                saidMessages.push(switchedMsg);
                            } else {
                                const errMsg = `⚠️ Lỗi: ${res.error}`;
                                say(errMsg, 'unclear', 'confused');
                                saidMessages.push(errMsg);
                            }
                        } catch (e) {
                            const errMsg = `⚠️ Lỗi: ${e.message}`;
                            say(errMsg, 'unclear', 'confused');
                            saidMessages.push(errMsg);
                        }
                    }
                } else if (action.tool === 'buildHouse') {
                    if (window.houseManager) {
                        const capturedMessages = [];
                        const origShowCharMsg = window.showCharacterMessage;
                        const origShowPopup = window.showPopup;

                        const captureFn = (text, kind) => {
                            if (!text) return;
                            const formatted = formatReply(text);
                            if (capturedMessages.includes(formatted)) return;
                            capturedMessages.push(formatted);
                            onSay(formatted, kind || 'normal', []);
                            onStatus(`💬 ${formatted.slice(0, 80)}…`);
                            if (origShowCharMsg) {
                                try { origShowCharMsg(formatted, kind || 'normal'); } catch { }
                            }
                        };

                        window.showCharacterMessage = captureFn;
                        window.showPopup = captureFn;

                        try {
                            await window.houseManager.autoBuildHouseByReika();
                        } catch (e) {
                            console.warn('[Chat] houseManager autoBuild error:', e);
                        } finally {
                            window.showCharacterMessage = origShowCharMsg;
                            window.showPopup = origShowPopup;
                        }
                        saidMessages.push(...capturedMessages);
                    }
                }
            }
        }

        const baseEmotion = extractEmotionFromMessage(message, userText);
        const isGeneric = (e) => !e || e === 'neutral' || e === 'talking';
        const moodShift = detectMoodShift(userText);

        let finalEmotion = 'neutral';
        if (directEmote) finalEmotion = directEmote;
        else if (moodShift) finalEmotion = moodShift;
        else if (!isGeneric(baseEmotion)) finalEmotion = baseEmotion;
        else if (window.emotionCtrl && window.emotionCtrl.processTextForEmotion) {
            const fullText = says.join(' ');
            const emo = window.emotionCtrl.processTextForEmotion(fullText);
            if (emo) finalEmotion = emo;
        }
        else {
            const fromText = analyzeReplyEmotion(says.join(' '));
            finalEmotion = (fromText !== 'talking') ? fromText : (baseEmotion || 'talking');
        }

        const hasSayText = says.filter(Boolean).length > 0;
        if (!hasSayText && saidMessages.length > 0) {
            logSuccessOnce(saidMessages.join(' | '));
            return { says: saidMessages, emotion: baseEmotion };
        }

        if (!hasSayText && saidMessages.length === 0 && (!actions || actions.length === 0)) {
            logEmptyResponse('chat');
            const fallback = pickFallback();
            say(fallback, 'unclear', 'confused');
            logSuccessOnce(fallback);
            return { says: [] };
        }

        says.forEach((s, i) => say(s, kinds[i] || 'normal', finalEmotion, optionsList[i] || []));

        const allMessages = [...saidMessages, ...says.filter(Boolean)];
        logSuccessOnce(allMessages.join(' | '));

        return { says: [...saidMessages, ...says], emotion: finalEmotion };

    } catch (err) {
        logError('chat', userText, err);
        const userMsg = errorToUserMessage(err);
        say(userMsg, 'unsupported', 'sad');
        return { says: [] };
    }
}
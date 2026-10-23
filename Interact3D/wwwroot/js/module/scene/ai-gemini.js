// ═══════════════════════════════════════════════════════════════
// ai-gemini.js — UI v19 (Fix Options Timing, Confidence, Memory)
// ═══════════════════════════════════════════════════════════════

import { handleCommand } from './ai-controller.js';
import { handleChat } from './ai-chat/ai-chat-main.js';
import { handleImageVision } from './ai-vision-handler.js';
import { initImageUploader } from './ai-ui-image-uploader.js';
import { MAX_HISTORY_PAIRS, formatMarkdown, getPrefs, MODEL_CHAIN } from './ai-shared.js?v=12';
import { printStats, resetStats } from './ai-debug.js?v=12';

export { handleCommand, handleChat };
export const handleUserCommand = (aiTools, text, opts) => handleCommand(aiTools, text, opts);

// ═══════════════════════════════════════════════════════════════
// STORAGE & STATE
// ═══════════════════════════════════════════════════════════════
const STORAGE_HISTORY = 'ai_chat_history_v1';
const STORAGE_PREFS = 'ai_user_prefs_v1';
const STORAGE_COLLAPSED = 'ai_panel_collapsed';
const STORAGE_LAST_MODE = 'ai_last_mode';

const chatHistory = [];
let searchFilter = '';
let currentImageBase64 = null;
let pendingOptions = null; // ⭐ Biến tạm giữ Options chờ gán vào chatHistory

function loadHistory() {
    try {
        const raw = sessionStorage.getItem(STORAGE_HISTORY);
        if (!raw) return;
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) chatHistory.push(...arr.slice(-MAX_HISTORY_PAIRS * 2));
    } catch { /* ignore */ }
}

function persistHistory() {
    try { sessionStorage.setItem(STORAGE_HISTORY, JSON.stringify(chatHistory)); } catch { }
}

function clearHistory() {
    chatHistory.length = 0;
    persistHistory();
}

function getHistoryForAPI() {
    return chatHistory.map(m => ({ role: m.role, content: m.content }));
}

function getHistoryPairCount() {
    return Math.floor(chatHistory.length / 2);
}

function loadLastMode() { try { return localStorage.getItem(STORAGE_LAST_MODE) || 'normal'; } catch { return 'normal'; } }
function saveLastMode(v) { try { localStorage.setItem(STORAGE_LAST_MODE, v); } catch { } }
function loadCollapsed() { try { return sessionStorage.getItem(STORAGE_COLLAPSED) === '1'; } catch { return false; } }
function saveCollapsed(v) { try { sessionStorage.setItem(STORAGE_COLLAPSED, v ? '1' : '0'); } catch { } }

function escapeHtml(s) {
    return String(s || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ═══════════════════════════════════════════════════════════════
// MAIN UI INITIALIZER
// ═══════════════════════════════════════════════════════════════
export function initAICommandUI(aiTools) {
    if (document.getElementById('ai-command-bar')) return;

    loadHistory();

    const wrap = document.createElement('div');
    wrap.id = 'ai-command-bar';
    wrap.style.cssText = `
        position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
        width: min(680px, 94vw); background: rgba(15, 23, 42, 0.96);
        border: 1px solid #334155; border-radius: 12px; z-index: 9999;
        backdrop-filter: blur(10px); overflow: hidden;
        display: flex; flex-direction: column; transition: max-height 0.2s ease;
    `;

    wrap.innerHTML = `
        <div style="padding: 6px 10px; background: rgba(30, 41, 59, 0.9); border-bottom: 1px solid #334155; display: flex; justify-content: space-between; align-items: center;">
            <div id="ai-tabs" style="display: flex; gap: 4px; align-items: center;">
                <button data-mode="command" class="ai-tab ai-tab-active" style="background: #0284c7; color: #fff; border: none; padding: 4px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600;">🎮 Điều khiển</button>
                <button data-mode="chat" class="ai-tab" style="background: transparent; color: #94a3b8; border: none; padding: 4px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600;">💬 Hỏi đáp</button>
                <span id="ai-history-counter" style="display: none; font-size: 11px; color: #94a3b8; padding: 2px 6px; background: rgba(71, 85, 105, 0.4); border-radius: 10px; margin-left: 4px;">0</span>
            </div>
            <div style="display: flex; gap: 4px; align-items: center;">
                <select id="ai-chat-mode-select" style="display: none; background: #1e293b; color: #fbbf24; border: 1px solid #475569; padding: 3px 6px; border-radius: 6px; font-size: 12px; cursor: pointer; outline: none;">
                    <option value="gentle">🌸 Nhẹ nhàng</option>
                    <option value="normal">😊 Bình thường</option>
                    <option value="savage">😈 Mỏ hỗn</option>
                </select>
                <button id="ai-search-toggle" style="display: none; background: transparent; border: 1px solid #475569; color: #94a3b8; padding: 3px 8px; border-radius: 6px; cursor: pointer; font-size: 12px;">🔍</button>
                <button id="ai-clear-history" style="display: none; background: transparent; border: 1px solid #475569; color: #94a3b8; padding: 3px 8px; border-radius: 6px; cursor: pointer; font-size: 12px;">🗑️</button>
                <button id="ai-debug" style="background: transparent; border: 1px solid #475569; color: #94a3b8; padding: 3px 8px; border-radius: 6px; cursor: pointer; font-size: 12px;">🐞</button>
                <button id="ai-collapse" style="background: transparent; border: 1px solid #475569; color: #94a3b8; padding: 3px 8px; border-radius: 6px; cursor: pointer; font-size: 12px;">▼</button>
                <button id="ai-toggle-key" style="background: transparent; border: 1px solid #475569; color: #94a3b8; padding: 3px 10px; border-radius: 6px; cursor: pointer; font-size: 12px;">🔑</button>
            </div>
        </div>
        <div id="ai-body" style="display: flex; flex-direction: column;">
            <div id="ai-key-panel" style="display: none; padding: 12px; background: rgba(30, 41, 59, 0.95); border-bottom: 1px solid #334155;">
                <form id="ai-key-form" onsubmit="event.preventDefault();">
                    <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                        <input id="ai-key-input" type="password" placeholder="Dán Groq API Key..." autocomplete="off" style="flex: 1; padding: 8px; background: #0f172a; border: 1px solid #475569; border-radius: 6px; color: #fff; outline: none;" />
                        <button id="ai-key-save" type="submit" style="padding: 8px 16px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">Lưu</button>
                    </div>
                </form>
            </div>
            <div id="ai-search-panel" style="display: none; padding: 8px 12px; background: rgba(30, 41, 59, 0.7); border-bottom: 1px solid #334155;">
                <input id="ai-search-input" type="text" placeholder="🔍 Tìm tin nhắn..." style="width: 100%; padding: 6px 10px; background: #0f172a; border: 1px solid #475569; border-radius: 6px; color: #fff; outline: none; font-size: 12px;" />
            </div>
            <div id="ai-chat-log" style="display: none; max-height: 240px; overflow-y: auto; padding: 8px 12px; background: rgba(15, 23, 42, 0.85); border-bottom: 1px solid #334155; font-size: 13px; color: #cbd5e1; scroll-behavior: smooth;"></div>
            
            <div id="ai-input-area" style="padding: 10px 12px; display: flex; gap: 8px; position: relative;">
                <div id="ai-upload-anchor" style="display: flex; align-items: center;"></div>
                <input id="ai-input" type="text" placeholder='VD: "đi sang trái", "nhặt hộp đỏ"' style="flex:1; padding:9px; background:#1e293b; border:1px solid #334155; border-radius:8px; color:#fff; outline:none;" />
                <button id="ai-btn" style="padding:9px 20px; background:#0284c7; color:#fff; border:none; border-radius:8px; cursor:pointer; font-weight:600;">Gửi</button>
            </div>
            <div id="ai-status" style="font-size:13px; color:#38bdf8; padding: 0 12px 10px; min-height: 18px; display: flex; align-items: center; gap: 8px;"></div>
        </div>
    `;

    document.body.appendChild(wrap);

    const input = wrap.querySelector('#ai-input');
    const btn = wrap.querySelector('#ai-btn');
    const statusEl = wrap.querySelector('#ai-status');
    const keyPanel = wrap.querySelector('#ai-key-panel');
    const keyInput = wrap.querySelector('#ai-key-input');
    const historyCounter = wrap.querySelector('#ai-history-counter');
    const clearHistoryBtn = wrap.querySelector('#ai-clear-history');
    const modeSelect = wrap.querySelector('#ai-chat-mode-select');
    const chatLogEl = wrap.querySelector('#ai-chat-log');
    const bodyEl = wrap.querySelector('#ai-body');
    const collapseBtn = wrap.querySelector('#ai-collapse');
    const searchToggle = wrap.querySelector('#ai-search-toggle');
    const searchPanel = wrap.querySelector('#ai-search-panel');
    const searchInput = wrap.querySelector('#ai-search-input');

    const uploadAnchor = wrap.querySelector('#ai-upload-anchor');
    const uploader = initImageUploader(uploadAnchor, (base64) => { currentImageBase64 = base64; });

    let currentMode = 'command';
    let chatMode = loadLastMode();
    let collapsed = loadCollapsed();

    modeSelect.value = chatMode;

    const PLACEHOLDERS = {
        command: 'VD: "đi sang trái", "xóa hết box", "dừng lại"',
        chat: 'VD: "bạn là ai?", "phân tích ảnh này"',
    };
    const BTN_COLORS = { command: '#0284c7', chat: '#8b5cf6' };

    function applyCollapsed() {
        bodyEl.style.display = collapsed ? 'none' : 'flex';
        collapseBtn.textContent = collapsed ? '▲' : '▼';
    }
    collapseBtn.onclick = () => { collapsed = !collapsed; saveCollapsed(collapsed); applyCollapsed(); };

    function setStatus(text, opts = {}) {
        if (opts.spinner) {
            statusEl.innerHTML = `<span style="display:inline-block;width:12px;height:12px;border:2px solid #38bdf8;border-top-color:transparent;border-radius:50%;animation:ai-spin 0.8s linear infinite;"></span><span>${escapeHtml(text)}</span>`;
        } else {
            statusEl.textContent = text;
        }
    }
    if (!document.getElementById('ai-spin-style')) {
        const st = document.createElement('style');
        st.id = 'ai-spin-style';
        st.textContent = `@keyframes ai-spin { to { transform: rotate(360deg); } }`;
        document.head.appendChild(st);
    }

    function renderChatLog() {
        if (currentMode !== 'chat' && currentMode !== 'command') return;
        chatLogEl.style.display = 'block';
        searchToggle.style.display = currentMode === 'chat' ? 'inline-block' : 'none';

        if (chatHistory.length === 0) {
            chatLogEl.innerHTML = `<div style="text-align: center; color: #64748b; padding: 20px; font-size: 12px;">Chưa có tin nhắn. Gõ gì đó để bắt đầu 💬</div>`;
            return;
        }

        const filter = searchFilter.toLowerCase().trim();
        const items = chatHistory.map((m, i) => ({ ...m, _idx: i })).filter(m => !filter || m.content.toLowerCase().includes(filter));

        if (items.length === 0) {
            chatLogEl.innerHTML = `<div style="text-align: center; color: #64748b; padding: 20px; font-size: 12px;">Không có tin nhắn khớp "${escapeHtml(searchFilter)}"</div>`;
            return;
        }

        const lastAssistantIdx = chatHistory.length - 1;

        chatLogEl.innerHTML = items.map((m) => {
            const i = m._idx;
            const isUser = m.role === 'user';
            const bg = isUser ? 'rgba(2,132,199,0.12)' : 'rgba(139,92,246,0.12)';
            const border = isUser ? '#0284c7' : '#8b5cf6';
            const label = isUser ? 'Bạn' : 'Linh';
            const avatar = isUser ? '👤' : '🤖';

            let content = isUser ? escapeHtml(m.content).replace(/\n/g, '<br>') : formatMarkdown(m.content);
            if (m.hasImage) content = `<span style="color:#94a3b8; font-size:11px;">[📷 Gửi kèm ảnh]</span><br>` + content;

            if (filter) {
                const re = new RegExp(`(${filter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                content = content.replace(re, '<mark style="background:#f59e0b;color:#0f172a;padding:0 2px;border-radius:2px;">$1</mark>');
            }

            const ts = new Date(m.ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
            const copyBtn = `<button class="ai-copy-btn" data-index="${i}" title="Copy" style="background: transparent; border: none; color: #94a3b8; cursor: pointer; font-size: 12px; padding: 0 4px;">📋</button>`;
            const retryBtn = (!isUser && i === lastAssistantIdx && i > 0) ? `<button class="ai-retry-btn" title="Gửi lại" style="background: transparent; border: none; color: #f59e0b; cursor: pointer; font-size: 12px; padding: 0 4px;">🔄</button>` : '';

            let optionsHtml = '';
            if (!isUser && m.options && m.options.length > 0 && i === lastAssistantIdx) {
                optionsHtml = `<div style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px;">
                    ${m.options.map(opt => `<button class="ai-option-btn" data-opt="${escapeHtml(opt)}" style="background: rgba(56, 189, 248, 0.15); border: 1px solid #38bdf8; color: #38bdf8; padding: 4px 12px; border-radius: 12px; cursor: pointer; font-size: 12px; font-weight: 600; transition: all 0.2s;">${escapeHtml(opt)}</button>`).join('')}
                </div>`;
            }

            return `
                <div style="margin-bottom: 8px; background: ${bg}; border-left: 3px solid ${border}; border-radius: 4px; padding: 6px 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px; font-size: 11px; color: #94a3b8;">
                        <span>${avatar} <b>${label}</b> · ${ts}</span>
                        <span>${copyBtn}${retryBtn}</span>
                    </div>
                    <div style="color: #e2e8f0; line-height: 1.5; word-break: break-word;">${content}</div>
                    ${optionsHtml}
                </div>`;
        }).join('');

        if (!filter) chatLogEl.scrollTop = chatLogEl.scrollHeight;

        chatLogEl.querySelectorAll('.ai-copy-btn').forEach(b => {
            b.onclick = () => {
                const text = chatHistory[parseInt(b.dataset.index)]?.content || '';
                navigator.clipboard.writeText(text).then(() => { b.textContent = '✅'; setTimeout(() => b.textContent = '📋', 1200); });
            };
        });

        chatLogEl.querySelectorAll('.ai-retry-btn').forEach(b => b.onclick = retryLast);

        chatLogEl.querySelectorAll('.ai-option-btn').forEach(b => {
            b.onclick = () => { input.value = b.dataset.opt; submit(); };
            b.onmouseover = () => b.style.background = 'rgba(56, 189, 248, 0.3)';
            b.onmouseout = () => b.style.background = 'rgba(56, 189, 248, 0.15)';
        });
    }

    function retryLast() {
        if (chatHistory.length < 2) return;
        const lastUserIdx = chatHistory.length - 2;
        if (chatHistory[lastUserIdx].role !== 'user') return;
        const userText = chatHistory[lastUserIdx].content;
        chatHistory.splice(lastUserIdx, 2);
        persistHistory();
        input.value = userText;
        updateHistoryUI();
        renderChatLog();
        submit();
    }

    function updateHistoryUI() {
        const pairs = getHistoryPairCount();
        historyCounter.style.display = 'inline-block';
        historyCounter.textContent = pairs > 0 ? `${pairs} cặp` : '0';
        clearHistoryBtn.style.display = pairs > 0 ? 'inline-block' : 'none';
        modeSelect.style.display = currentMode === 'chat' ? 'inline-block' : 'none';
        searchToggle.style.display = currentMode === 'chat' ? 'inline-block' : 'none';
    }

    function switchMode(mode) {
        currentMode = mode;
        input.placeholder = PLACEHOLDERS[mode];
        btn.style.background = BTN_COLORS[mode];
        wrap.querySelectorAll('[data-mode]').forEach((b) => {
            const active = b.dataset.mode === mode;
            b.style.background = active ? BTN_COLORS[mode] : 'transparent';
            b.style.color = active ? '#fff' : '#94a3b8';
        });
        updateHistoryUI();
        renderChatLog();
        input.focus();
    }

    wrap.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => switchMode(b.dataset.mode));

    modeSelect.onchange = () => {
        chatMode = modeSelect.value;
        saveLastMode(chatMode);
        setStatus(`Đã chuyển sang chế độ: ${modeSelect.options[modeSelect.selectedIndex].text}`);
        setTimeout(() => setStatus(''), 2000);
    };

    clearHistoryBtn.onclick = () => {
        if (!confirm('Xoá toàn bộ lịch sử?')) return;
        clearHistory(); updateHistoryUI(); renderChatLog();
    };

    wrap.querySelector('#ai-debug').onclick = () => {
        const s = printStats();
        setStatus(`📊 ${s.totalCalls} calls · ✅ ${s.results.success} · 🔴 ${s.results.error}`);
    };

    let debugPressTimer = null;
    const debugBtn = wrap.querySelector('#ai-debug');
    debugBtn.onmousedown = () => { debugPressTimer = setTimeout(() => { if (confirm('Reset stats?')) { resetStats(); setStatus('🔄 Reset!'); } }, 800); };
    debugBtn.onmouseup = () => clearTimeout(debugPressTimer);

    wrap.querySelector('#ai-toggle-key').onclick = () => {
        keyPanel.style.display = keyPanel.style.display === 'none' ? 'block' : 'none';
        if (keyPanel.style.display === 'block') { keyInput.value = localStorage.getItem('groq_api_key') || ''; keyInput.focus(); }
    };
    wrap.querySelector('#ai-key-save').onclick = (e) => {
        e.preventDefault();
        const key = keyInput.value.trim();
        if (!key) return;
        localStorage.setItem('groq_api_key', key);
        keyPanel.style.display = 'none';
        setStatus('✅ Đã lưu Key Groq');
        setTimeout(() => setStatus(''), 2000);
    };

    searchToggle.onclick = () => {
        const isHidden = searchPanel.style.display === 'none';
        searchPanel.style.display = isHidden ? 'block' : 'none';
        if (isHidden) searchInput.focus();
        else { searchInput.value = ''; searchFilter = ''; renderChatLog(); }
    };
    searchInput.oninput = () => { searchFilter = searchInput.value; renderChatLog(); };

    document.addEventListener('keydown', (e) => {
        const tag = e.target.tagName;
        const isOtherField = (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') && e.target !== input && e.target !== searchInput;
        if (isOtherField) return;

        if (e.key === 'Escape') {
            if (searchPanel.style.display === 'block') { searchPanel.style.display = 'none'; searchInput.value = ''; searchFilter = ''; renderChatLog(); e.preventDefault(); return; }
            if (keyPanel.style.display === 'block') { keyPanel.style.display = 'none'; e.preventDefault(); return; }
            if (e.target === input || e.target === searchInput) e.target.blur();
        }
    });

    const submit = async () => {
        const text = input.value.trim();
        const hasImage = !!currentImageBase64;

        if (!text && !hasImage) return;

        chatHistory.push({
            role: 'user',
            content: text || '(Gửi ảnh)',
            ts: Date.now(),
            hasImage
        });
        persistHistory();
        renderChatLog();
        updateHistoryUI();

        input.value = '';
        const base64ToSend = currentImageBase64;
        if (hasImage) uploader.clearImage();

        pendingOptions = null; // Reset trước khi gọi

        setStatus('Đang xử lý...', { spinner: true });

        const opts = {
            onStatus: (s) => {
                if (typeof s === 'string' && s.length > 100) return setStatus(s.slice(0, 100) + '…');
                setStatus(s);
            },
            onSay: (msg, kind, options, confidence = 1.0) => {
                console.log(`%c🤖 [${currentMode}] ${msg} (conf: ${confidence})`, 'color: #c084fc;');

                let finalOptions = options || [];
                if (confidence < 0.6 && finalOptions.length === 0) {
                    finalOptions = ["Đúng vậy", "Không phải"];
                }

                // ⭐ Lưu vào biến tạm thay vì chatHistory
                if (finalOptions.length > 0) {
                    pendingOptions = finalOptions;
                }
            },
        };

        try {
            if (base64ToSend) {
                opts.history = getHistoryForAPI().slice(0, -1);
                opts.savageMode = (chatMode === 'savage');

                const result = await handleImageVision(aiTools, text, base64ToSend, opts);

                if (result && result.says?.length > 0) {
                    const assistantMsg = { role: 'assistant', content: result.says.join('\n'), ts: Date.now() };
                    if (pendingOptions) { assistantMsg.options = pendingOptions; pendingOptions = null; }
                    chatHistory.push(assistantMsg);
                } else {
                    chatHistory.pop();
                }
                persistHistory();
            }
            else if (currentMode === 'chat') {
                opts.history = getHistoryForAPI().slice(0, -1);
                opts.mode = chatMode;

                const result = await handleChat(aiTools, text, opts);

                if (result && result.says?.length > 0) {
                    const assistantMsg = { role: 'assistant', content: result.says.join('\n'), ts: Date.now() };
                    if (pendingOptions) { assistantMsg.options = pendingOptions; pendingOptions = null; }
                    chatHistory.push(assistantMsg);
                } else {
                    chatHistory.pop();
                }
                persistHistory();
            }
            else {
                const result = await handleCommand(aiTools, text, opts);
                if (result && result.says?.length > 0) {
                    const assistantMsg = { role: 'assistant', content: result.says.join('\n'), ts: Date.now() };
                    if (pendingOptions) { assistantMsg.options = pendingOptions; pendingOptions = null; }
                    chatHistory.push(assistantMsg);
                } else {
                    chatHistory.pop();
                }
                persistHistory();
            }
            renderChatLog();
            updateHistoryUI();
        } catch (e) {
            console.error(e);
            setStatus('❌ Lỗi (xem F12)');
            if (chatHistory[chatHistory.length - 1]?.role === 'user') {
                chatHistory.pop(); persistHistory(); renderChatLog(); updateHistoryUI();
            }
        }
    };

    btn.onclick = submit;
    input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } };

    applyCollapsed();
    switchMode('command');
}
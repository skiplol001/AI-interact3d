// ═══════════════════════════════════════════════════════════════
// ai-command-handlers.js — v15 (Add playRPS Handler)
// ═══════════════════════════════════════════════════════════════

import { COLOR_VI, COLORS, BOX_SIZE_FALLBACK, MAX_SPAWN } from './ai-command-config.js?v=15';
import { r2, colorInfo, findIds, vn, levenshtein } from './ai-command-parser.js?v=13';
import { summarizeSceneAround } from '../ai/ai-shared.js?v=21';
// ⭐ helper lấy mode hiện tại
function getCurrentMode() {
    try {
        const w = window.__currentChatMode;
        if (['gentle', 'normal'].includes(w)) return w;
        const m = localStorage.getItem('ai_last_mode');
        return ['gentle', 'normal'].includes(m) ? m : 'normal';
    } catch {
        return 'normal';
    }
}

// ═══════════════════════════════════════════════════════════════
// SCENE HELPERS
// ═══════════════════════════════════════════════════════════════
export const getBsys = () => window.boxSystem || null;
export const getCtrl = () => window.characterCtrl || null;
export const carriedBox = () => getCtrl()?.carriedBox || null;
export const allBoxes = () => getBsys()?.boxes || [];
export const CURRENT_TOOLS = { val: null };

export function normBoxId(v) {
    const m = String(v ?? '').toLowerCase().match(/b\s*-?\s*(\d+)/);
    return m ? `b${m[1]}` : String(v ?? '').trim();
}

export function findBoxById(id) {
    const bsys = getBsys();
    if (!bsys || !id) return null;
    return bsys.getBoxById(id) || bsys.getBoxById(normBoxId(id)) || null;
}

export function nearestBox(color) {
    const from = getCtrl()?.root?.position;
    const carried = carriedBox();
    let best = null, bd = Infinity;
    for (const b of allBoxes()) {
        if (b === carried) continue;
        if (color && b.userData?.colorName !== color) continue;
        const d = from ? Math.hypot(b.position.x - from.x, b.position.z - from.z) : 0;
        if (d < bd) { bd = d; best = b; }
    }
    return best;
}

export function resolveBox({ boxId, color } = {}) {
    if (boxId) {
        const b = findBoxById(boxId);
        if (b) return b;
        if (!color) return null;
    }
    if (color) return nearestBox(color);
    return nearestBox(null);
}

export function boxLabel(b) {
    return `${COLOR_VI[b.userData?.colorName] || b.userData?.colorName || 'box'} (${b.userData?.id})`;
}

export function getSavedPositions() {
    try {
        const raw = localStorage.getItem('ai_saved_positions_v1');
        return raw ? JSON.parse(raw) || {} : {};
    } catch { return {}; }
}

export function savePositions(obj) {
    try { localStorage.setItem('ai_saved_positions_v1', JSON.stringify(obj)); } catch { }
}

export function getAvailableModels() {
    const srcs = [];
    try { if (typeof window.getCharacterModels === 'function') srcs.push(window.getCharacterModels()); } catch { }
    try { if (typeof CURRENT_TOOLS.val?.getAvailableModels === 'function') srcs.push(CURRENT_TOOLS.val.getAvailableModels()); } catch { }
    srcs.push(window.characterModels, window.CHARACTER_MODELS, window.availableModels);
    for (const s of srcs) {
        if (!s) continue;
        const arr = Array.isArray(s) ? s : (typeof s === 'object' ? Object.keys(s) : []);
        const names = arr.map(m => (typeof m === 'string' ? m : (m?.name || m?.id || m?.key || m?.label))).filter(Boolean);
        if (names.length) return [...new Set(names)];
    }
    return [];
}

export function bestModelMatch(list, name) {
    const q = vn(name).replace(/\s+/g, '');
    if (!q) return null;
    let best = null, bs = 0;
    for (const m of list) {
        const n = vn(m).replace(/\s+/g, '');
        let s = 0;
        if (n === q) s = 100;
        else if (n.includes(q) || q.includes(n)) s = 80;
        else if (levenshtein(n, q) <= Math.max(1, Math.floor(Math.max(n.length, q.length) / 4))) s = 60;
        if (s > bs) { bs = s; best = m; }
    }
    return best;
}

const fail = (say, text) => { say(text, 'unclear'); return { abort: true }; };

// ═══════════════════════════════════════════════════════════════
// CORE MOVEMENT HANDLERS
// ═══════════════════════════════════════════════════════════════

function handleWalkTo(args, say, ctx) {
    const x = Number(args?.x);
    const z = Number(args?.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
        return fail(say, '⚠️ Tọa độ không hợp lệ.');
    }
    const mode = getCurrentMode();
    const pos = `(${x.toFixed(1)}, ${z.toFixed(1)})`;
    let text;
    if (mode === 'gentle') text = `Ơ... mình đi tới ${pos} nha...`;
    else if (mode === 'savage') text = `Đm, đi tới ${pos} đây...`;
    else text = `Ok, đi tới ${pos}...`;
    say(text, 'normal');
    return { actions: [ctx.action] };
}

function handleWalkRelative(args, say, ctx) {
    const dir = args?.direction;
    const dist = args?.distance;
    const dirMap = { forward: 'tới', backward: 'lùi', left: 'trái', right: 'phải' };
    const dirText = dirMap[dir] || dir;
    const distText = Number.isFinite(dist) ? ` ${dist}m` : '';
    const mode = getCurrentMode();
    let text;
    if (mode === 'gentle') text = `Mình đi ${dirText}${distText} nha...`;
    else if (mode === 'savage') text = `Đm, đi ${dirText}${distText} đây...`;
    else text = `Đi ${dirText}${distText}...`;
    say(text, 'normal');
    return { actions: [ctx.action] };
}

function handleTurn(args, say, ctx) {
    const dir = args?.direction;
    const deg = args?.degrees;
    const mode = getCurrentMode();
    let text;
    if (Number.isFinite(deg)) {
        text = `Quay ${deg}°`;
    } else {
        const map = { left: 'Quay trái', right: 'Quay phải', back: 'Quay lại' };
        text = map[dir] || `Quay ${dir}`;
    }
    if (mode === 'gentle') text += ' nha...';
    else if (mode === 'savage') text = `Đm, ` + text.toLowerCase() + ' đây...';
    else text += '...';
    say(text, 'normal');
    return { actions: [ctx.action] };
}

function handleLookAtCamera(args, say, ctx) {
    const mode = getCurrentMode();
    let text;
    if (mode === 'gentle') text = 'Ơ... mình quay mặt về camera nha...';
    else if (mode === 'savage') text = 'Đm, nhìn camera đây...';
    else text = 'Quay mặt về camera...';
    say(text, 'normal');
    return { actions: [ctx.action] };
}

// ═══════════════════════════════════════════════════════════════
// OTHER HANDLERS
// ═══════════════════════════════════════════════════════════════
function handleClearAllBoxes(args, say) {
    const bsys = getBsys();
    if (!bsys) { say('⚠️ Không truy cập box system.', 'unclear'); return null; }
    const count = bsys.count ?? allBoxes().length;
    bsys.clearAll();
    const msg = `🗑️ Đã xoá ${count} box.`;
    say(msg, 'normal');
    return msg;
}

function handleRemoveBox(args, say) {
    const bsys = getBsys();
    const box = findBoxById(args?.boxId);
    if (bsys && box) {
        const label = boxLabel(box);
        bsys.removeBox(box);
        const msg = `🗑️ Đã xoá box ${label}.`;
        say(msg, 'normal');
        return msg;
    }
    const msg = `⚠️ Không tìm thấy box "${args?.boxId}".`;
    say(msg, 'unclear');
    return msg;
}

function handleRemoveBoxesByColor(args, say) {
    const bsys = getBsys();
    const color = args?.color;
    if (!bsys || !color) { say('⚠️ Thiếu màu.', 'unclear'); return null; }
    const boxes = allBoxes().filter(b => b.userData.colorName === color);
    if (!boxes.length) {
        const msg = `⚠️ Không có hộp ${COLOR_VI[color] || color} nào để xoá.`;
        say(msg, 'unclear');
        return msg;
    }
    boxes.forEach(b => bsys.removeBox(b));
    const msg = `🗑️ Đã xoá ${boxes.length} hộp màu ${COLOR_VI[color] || color}.`;
    say(msg, 'normal');
    return msg;
}

function handleStop(args, say) {
    const ctrl = getCtrl();
    if (ctrl && typeof ctrl.cancel === 'function') {
        const ok = ctrl.cancel();
        const msg = ok ? '✋ Đã dừng.' : '⚠️ Đang animation không dừng được, chờ chút.';
        say(msg, ok ? 'normal' : 'unclear');
        return { msg, abort: true };
    }
    say('⚠️ Chưa hỗ trợ stop.', 'unclear');
    return null;
}

function handleGrab(args, say) {
    const ctrl = getCtrl();
    const grab = window.grabCtrl;
    if (!ctrl || !grab) { say('⚠️ Chưa hỗ trợ nhấc nhân vật.', 'unclear'); return null; }
    if (grab.isGrabbing()) { say('⚠️ Đang treo rồi.', 'unclear'); return null; }
    grab.grab(ctrl.root);
    say('🤚 Đã nhấc nhân vật lên.', 'normal');
    return 'Đã nhấc lên';
}

function handleRelease(args, say) {
    const grab = window.grabCtrl;
    if (grab && grab.isGrabbing()) {
        grab.release();
        say('⬇️ Đang thả xuống...', 'normal');
        return 'Đang thả';
    }
    if (carriedBox()) {
        say('⬇️ Đặt hộp xuống.', 'normal');
        return { actions: [{ tool: 'walkToDropDirection', args: { direction: 'forward', distance: 1 } }], msg: 'Đặt hộp xuống' };
    }
    say('⚠️ Đang không treo hay cầm gì.', 'unclear');
    return null;
}

function handleFocusOn(args, say) {
    const controls = window.controls;
    const cam = window.camera;
    if (!controls || !cam) { say('⚠️ Không truy cập camera.', 'unclear'); return null; }

    let targetPos = null, label = '';
    if (args?.target === 'character') {
        const ctrl = getCtrl();
        if (ctrl) { targetPos = ctrl.root.position.clone(); targetPos.y += 1; label = 'nhân vật'; }
    } else {
        const box = resolveBox(args || {});
        if (box) { targetPos = box.position.clone(); label = `box ${boxLabel(box)}`; }
    }
    if (!targetPos) { say('⚠️ Không tìm thấy mục tiêu.', 'unclear'); return null; }

    const oldTarget = controls.target.clone();
    controls.target.copy(targetPos);
    const camOffset = cam.position.clone().sub(oldTarget);
    const dist = camOffset.length();
    const newDist = Math.max(2.5, dist * 0.6);
    cam.position.copy(targetPos.clone().add(camOffset.normalize().multiplyScalar(newDist)));
    controls.update();

    const msg = `🎯 Đã focus vào ${label}.`;
    say(msg, 'normal');
    return msg;
}

function handleWalkToBox(args, say) {
    const ctrl = getCtrl();
    const box = resolveBox(args || {});
    if (!ctrl || !box) {
        return fail(say, args?.color ? `⚠️ Không tìm thấy hộp ${COLOR_VI[args.color] || args.color} nào.`
            : args?.boxId ? `⚠️ Không tìm thấy box "${args.boxId}".` : '⚠️ Không có hộp nào trên sàn.');
    }
    const from = ctrl.root.position;
    const dx = box.position.x - from.x, dz = box.position.z - from.z;
    const d = Math.hypot(dx, dz);
    const STOP = 0.9;
    if (d <= STOP + 0.2) { say(`🎯 Bạn đã ở ngay cạnh hộp ${boxLabel(box)}.`, 'normal'); return null; }
    const k = (d - STOP) / d;
    say(`🎯 Đi tới hộp ${boxLabel(box)}.`, 'normal');
    return { actions: [{ tool: 'walkTo', args: { x: r2(from.x + dx * k), z: r2(from.z + dz * k) } }] };
}

function handleWalkToCamera(args, say) {
    const ctrl = getCtrl();
    const cam = window.camera;
    if (!ctrl || !cam) return fail(say, '⚠️ Không tìm thấy camera hoặc nhân vật.');

    const from = ctrl.root.position;
    const camPos = cam.position;

    const dx = camPos.x - from.x;
    const dz = camPos.z - from.z;
    const dist = Math.hypot(dx, dz);

    const SAFE_DIST = 3.0;

    if (Math.abs(dist - SAFE_DIST) < 0.1) {
        say('🎯 Bạn đã ở khoảng cách vừa phải với camera rồi.', 'normal');
        return null;
    }

    const dirX = dx / dist;
    const dirZ = dz / dist;

    const targetX = camPos.x + dirX * SAFE_DIST;
    const targetZ = camPos.z + dirZ * SAFE_DIST;

    say('🎯 Tiến lại gần camera...', 'normal');
    return { actions: [{ tool: 'walkTo', args: { x: r2(targetX), z: r2(targetZ) } }] };
}

function handleWalkToPickup(args, say) {
    const carried = carriedBox();
    const hasTarget = !!(args?.boxId || args?.color);
    const target = hasTarget ? resolveBox(args) : (carried ? null : nearestBox(null));
    if (carried) {
        if (!target || target === carried) return null;
        return fail(say, '⚠️ Đang mang hộp rồi, đặt xuống trước đã nhé.');
    }
    if (!target) {
        return fail(say, args?.color ? `⚠️ Không tìm thấy hộp ${COLOR_VI[args.color] || args.color} nào trên sàn.`
            : args?.boxId ? `⚠️ Không tìm thấy box "${args.boxId}".` : '⚠️ Không có hộp nào trên sàn.');
    }
    return { actions: [{ tool: 'walkToPickup', args: { boxId: target.userData.id } }] };
}

// ⭐ THÊM HANDLER ĐÁ BOX
function handleKickBox(args, say) {
    const carried = carriedBox();
    if (carried) return fail(say, '⚠️ Đang mang hộp rồi, đặt xuống trước đã nhé.');

    const target = resolveBox(args || {});
    if (!target) {
        return fail(say, args?.color ? `⚠️ Không tìm thấy hộp ${COLOR_VI[args.color] || args.color} nào trên sàn.`
            : args?.boxId ? `⚠️ Không tìm thấy box "${args.boxId}".` : '⚠️ Không có hộp nào trên sàn.');
    }

    say(`🦵 Đi tới đá hộp ${boxLabel(target)}...`, 'normal');
    return { actions: [{ tool: 'kickBox', args: { boxId: target.userData.id } }] };
}

function needCarry(say) {
    if (carriedBox()) return true;
    say('🤔 Bạn đang không mang hộp. Nhặt hộp trước đã nhé?', 'unclear');
    return false;
}

function handleDropNearCamera(args, say, ctx) {
    if (!needCarry(say)) return { abort: true };
    return { actions: [ctx.action] };
}

function handleDropAt(args, say, ctx) {
    if (!Number.isFinite(args?.x) || !Number.isFinite(args?.z)) return fail(say, '⚠️ Tọa độ không hợp lệ.');
    if (!needCarry(say)) return { abort: true };
    return { actions: [ctx.action] };
}

function handleDropAtNearest(args, say) {
    if (!needCarry(say)) return { abort: true };
    if (args?.boxId) {
        const b = findBoxById(args.boxId);
        if (!b) return fail(say, `⚠️ Không tìm thấy box "${args.boxId}".`);
        return { actions: [{ tool: 'walkToDropAt', args: { x: r2(b.position.x + 0.8), z: r2(b.position.z) } }] };
    }
    if (!args?.color) return fail(say, '🤔 Mang về gần hộp màu gì?');
    if (!nearestBox(args.color)) return fail(say, `⚠️ Không có hộp ${COLOR_VI[args.color] || args.color} nào để đặt gần.`);
    return { actions: [{ tool: 'walkToDropAtNearest', args: { color: args.color } }] };
}

function handleDropDirection(args, say, ctx) {
    if (!needCarry(say)) return { abort: true };
    return { actions: [ctx.action] };
}

function handleCountBoxes(args, say) {
    const boxes = allBoxes();
    const color = args?.color;
    let msg;
    if (color) {
        msg = `📦 Có ${boxes.filter(b => b.userData.colorName === color).length} hộp ${COLOR_VI[color] || color}.`;
    } else if (!boxes.length) {
        msg = '📦 Không có hộp nào.';
    } else {
        const by = {};
        boxes.forEach(b => { const c = b.userData.colorName || '?'; by[c] = (by[c] || 0) + 1; });
        const detail = Object.entries(by).map(([c, n]) => `${n} ${COLOR_VI[c] || c}`).join(', ');
        msg = `📦 Có ${boxes.length} hộp (${detail}).`;
    }
    say(msg, 'normal');
    return msg;
}

function applyRecolor(box, color) {
    const bsys = getBsys();
    const hex = bsys.constructor.getColorFromName(color);
    box.material = bsys._getMaterial(hex);
    box.userData.color = hex;
    box.userData.colorName = color;
}

function handleRecolorBox(args, say) {
    const { boxId, color } = args || {};
    const box = findBoxById(boxId);
    if (!box) { say(`⚠️ Không tìm thấy box "${boxId}".`, 'unclear'); return null; }
    try {
        applyRecolor(box, color);
        const msg = `🎨 Đã đổi ${boxId} thành ${COLOR_VI[color] || color}.`;
        say(msg, 'normal');
        return msg;
    } catch (e) { say(`⚠️ Lỗi: ${e.message}`, 'unclear'); return null; }
}

function handleRecolorByColor(args, say) {
    const { fromColor, toColor } = args || {};
    if (!getBsys() || !toColor) { say('⚠️ Thiếu màu đích.', 'unclear'); return null; }
    const boxes = allBoxes().filter(b => !fromColor || b.userData.colorName === fromColor);
    if (!boxes.length) { say(`⚠️ Không có hộp ${fromColor ? (COLOR_VI[fromColor] || fromColor) : ''} nào để đổi màu.`, 'unclear'); return null; }
    try {
        boxes.forEach(b => applyRecolor(b, toColor));
        const msg = `🎨 Đã đổi ${boxes.length} hộp${fromColor ? ` ${COLOR_VI[fromColor] || fromColor}` : ''} thành ${COLOR_VI[toColor] || toColor}.`;
        say(msg, 'normal');
        return msg;
    } catch (e) { say(`⚠️ Lỗi: ${e.message}`, 'unclear'); return null; }
}

function handleMoveBoxTo(args, say) {
    const { boxId, x, z } = args || {};
    const box = findBoxById(boxId);
    if (!box) { say(`⚠️ Không tìm thấy box "${boxId}".`, 'unclear'); return null; }
    if (!Number.isFinite(x) || !Number.isFinite(z)) { say('⚠️ Tọa độ không hợp lệ.', 'unclear'); return null; }
    if (box === carriedBox()) { say('⚠️ Box đang được mang, đặt xuống trước đã.', 'unclear'); return null; }
    const y = box.userData.targetY ?? BOX_SIZE_FALLBACK / 2;
    box.position.set(x, y, z);
    const msg = `📍 Đã dời ${boxId} tới (${x}, ${z}).`;
    say(msg, 'normal');
    return msg;
}

function handleStackBoxes(args, say) {
    const bsys = getBsys();
    const { bottomId, topId } = args || {};
    const bottom = findBoxById(bottomId);
    const top = findBoxById(topId);
    if (!bottom) { say(`⚠️ Không tìm thấy box đáy "${bottomId}".`, 'unclear'); return null; }
    if (!top) { say(`⚠️ Không tìm thấy box trên "${topId}".`, 'unclear'); return null; }
    if (bottom === top) { say('⚠️ Không thể chồng lên chính nó.', 'unclear'); return null; }
    if (top === carriedBox() || bottom === carriedBox()) { say('⚠️ Box đang được mang, đặt xuống trước đã.', 'unclear'); return null; }
    const size = bsys._boxSize || BOX_SIZE_FALLBACK;
    const topY = bottom.position.y + size;
    top.position.set(bottom.position.x, topY, bottom.position.z);
    top.userData.targetY = topY;
    top.userData.isFalling = false;
    const msg = `🗼 Đã chồng ${topId} lên ${bottomId}.`;
    say(msg, 'normal');
    return msg;
}

function handleArrangeBoxes(args, say) {
    const bsys = getBsys();
    if (!bsys) return null;
    const carried = carriedBox();
    const boxes = allBoxes().filter(b => b !== carried);
    const n = boxes.length;
    if (n === 0) { say('⚠️ Không có box nào.', 'unclear'); return null; }

    const pattern = args?.pattern || 'circle';
    const ctrl = getCtrl();
    const cx = ctrl ? ctrl.root.position.x : 0;
    const cz = ctrl ? ctrl.root.position.z : 0;
    const size = bsys._boxSize || BOX_SIZE_FALLBACK;
    const place = (box, x, z) => {
        box.position.set(x, size / 2, z);
        box.userData.targetY = size / 2;
        box.userData.isFalling = false;
    };

    if (pattern === 'circle') {
        const radius = Math.max(2, n * 0.6);
        boxes.forEach((b, i) => {
            const a = (i / n) * Math.PI * 2;
            place(b, cx + Math.cos(a) * radius, cz + Math.sin(a) * radius);
        });
    } else if (pattern === 'line') {
        const spacing = size * 1.5;
        const startX = cx - ((n - 1) * spacing) / 2;
        boxes.forEach((b, i) => place(b, startX + i * spacing, cz));
    } else if (pattern === 'grid') {
        const cols = Math.ceil(Math.sqrt(n));
        const spacing = size * 1.5;
        const startX = cx - ((cols - 1) * spacing) / 2;
        const startZ = cz - ((Math.ceil(n / cols) - 1) * spacing) / 2;
        boxes.forEach((b, i) => place(b, startX + (i % cols) * spacing, startZ + Math.floor(i / cols) * spacing));
    }
    const labelMap = { circle: 'vòng tròn', line: 'hàng', grid: 'lưới' };
    const msg = `🧩 Đã xếp ${n} box thành ${labelMap[pattern] || pattern}.`;
    say(msg, 'normal');
    return msg;
}

function handleSavePosition(args, say) {
    const ctrl = getCtrl();
    if (!ctrl || typeof ctrl.getCurrentPosition !== 'function') { say('⚠️ Chưa hỗ trợ save position.', 'unclear'); return null; }
    const name = (args?.name || 'home').toLowerCase().trim() || 'home';
    const pos = ctrl.getCurrentPosition();
    const all = getSavedPositions();
    all[name] = pos;
    savePositions(all);
    const msg = `💾 Đã lưu vị trí "${name}" (${pos.x.toFixed(1)}, ${pos.z.toFixed(1)}).`;
    say(msg, 'normal');
    return msg;
}

function handleLoadPosition(args, say) {
    const ctrl = getCtrl();
    if (!ctrl || typeof ctrl.loadPosition !== 'function') { say('⚠️ Chưa hỗ trợ load position.', 'unclear'); return null; }
    const name = (args?.name || 'home').toLowerCase().trim() || 'home';
    const all = getSavedPositions();
    const pos = all[name];
    if (!pos) {
        const names = Object.keys(all);
        say(`⚠️ Chưa có vị trí "${name}".${names.length ? ` Đã lưu: ${names.join(', ')}.` : ''}`, 'unclear');
        return null;
    }
    ctrl.loadPosition(pos);
    const msg = `📍 Đã về vị trí "${name}" (${pos.x.toFixed(1)}, ${pos.z.toFixed(1)}).`;
    say(msg, 'normal');
    return msg;
}

function handleListPositions(args, say) {
    const names = Object.keys(getSavedPositions());
    const msg = names.length ? `📌 Vị trí đã lưu: ${names.join(', ')}.` : '📌 Chưa lưu vị trí nào (VD: "lưu vị trí này là nhà").';
    say(msg, 'normal');
    return msg;
}

function handleTeleport(args, say) {
    const ctrl = getCtrl();
    const { x, z } = args || {};
    if (!ctrl || typeof ctrl.teleport !== 'function') { say('⚠️ Chưa hỗ trợ teleport.', 'unclear'); return null; }
    if (!Number.isFinite(x) || !Number.isFinite(z)) { say('⚠️ Tọa độ không hợp lệ.', 'unclear'); return null; }
    ctrl.teleport(x, z);
    const msg = `✨ Đã dịch chuyển tới (${x}, ${z}).`;
    say(msg, 'normal');
    return msg;
}

function clampCount(n) {
    const v = Math.floor(Number(n) || 1);
    return Math.min(Math.max(v, 1), MAX_SPAWN);
}

function handleSpawnBoxNear(args, say) {
    const ctrl = getCtrl();
    const bsys = getBsys();
    if (!ctrl || !bsys) { say('⚠️ Không truy cập box system.', 'unclear'); return null; }
    const color = args?.color || 'amber';
    const count = clampCount(args?.count);
    const hex = bsys.constructor.getColorFromName(color);
    const ids = [];
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 1 + Math.random() * 1.5;
        const x = ctrl.root.position.x + Math.cos(angle) * dist;
        const z = ctrl.root.position.z + Math.sin(angle) * dist;
        const box = bsys.addBox(x, z, hex, { spawnHeight: 2.5 + i * 0.4 });
        ids.push(box.userData.id);
    }
    const msg = `🎁 Đã tạo ${count} hộp ${COLOR_VI[color] || color} gần bạn (${ids.join(', ')}).`;
    say(msg, 'normal');
    return msg;
}

function handleSpawnBox(args, say, ctx) {
    const count = clampCount(args?.count);
    const base = { ...args };
    delete base.count;
    if (count === 1) return { actions: [{ tool: 'spawnBox', args: base }] };
    const t = window.controls?.target;
    const center = (Number.isFinite(base.x) && Number.isFinite(base.z)) ? { x: base.x, z: base.z }
        : { x: t?.x ?? getCtrl()?.root?.position?.x ?? 0, z: t?.z ?? getCtrl()?.root?.position?.z ?? 0 };
    const cols = Math.ceil(Math.sqrt(count));
    const sp = 0.8;
    const actions = [];
    for (let i = 0; i < count; i++) {
        actions.push({
            tool: 'spawnBox', args: {
                ...base,
                x: r2(center.x + ((i % cols) - (cols - 1) / 2) * sp),
                z: r2(center.z + (Math.floor(i / cols) - (Math.ceil(count / cols) - 1) / 2) * sp),
            },
        });
    }
    say(`🎁 Tạo ${count} hộp ${COLOR_VI[base.color] || base.color}.`, 'normal');
    return { actions };
}

async function handleSpin(args, say) {
    const ctrl = getCtrl();
    if (!ctrl) return null;
    const count = Math.min(Math.max(Math.floor(Number(args?.count) || 1), 1), 5);
    for (let i = 0; i < count; i++) {
        const startRot = ctrl.root.rotation.y;
        const duration = 1500;
        const startTime = performance.now();
        await new Promise((resolve) => {
            const tick = () => {
                const progress = Math.min((performance.now() - startTime) / duration, 1);
                ctrl.root.rotation.y = startRot + progress * Math.PI * 2;
                if (progress < 1) requestAnimationFrame(tick);
                else { ctrl.root.rotation.y = startRot; resolve(); }
            };
            tick();
        });
    }
    const msg = count > 1 ? `🌀 Đã quay ${count} vòng.` : '🌀 Đã quay 360°.';
    say(msg, 'normal');
    return msg;
}

function handleWalkRandom(args, say) {
    const ctrl = getCtrl();
    if (!ctrl) return null;
    const range = 8;
    const x = r2((Math.random() - 0.5) * range * 2);
    const z = r2((Math.random() - 0.5) * range * 2);
    say(`🎲 Đi tới (${x}, ${z}).`, 'normal');
    return { actions: [{ tool: 'walkTo', args: { x, z } }] };
}

async function handleSwitchModel(args, say) {
    let name = args?.modelName;
    if (!name) { say('⚠️ Thiếu tên model.', 'unclear'); return null; }
    const list = getAvailableModels();
    if (list.length) {
        const match = bestModelMatch(list, name);
        if (!match) {
            return { msg: `⚠️ Không có model "${name}".`, options: list, abort: true };
        }
        name = match;
    }
    if (typeof window.switchCharacterModel !== 'function') { say('⚠️ Chưa hỗ trợ đổi model.', 'unclear'); return null; }
    try {
        say(`🔄 Đang đổi sang model "${name}"...`, 'normal');
        await window.switchCharacterModel(name);
        const msg = `✅ Đã đổi sang model "${name}".`;
        say(msg, 'normal');
        return msg;
    } catch (err) {
        say(`⚠️ Lỗi đổi model: ${err.message}`, 'unclear');
        return null;
    }
}

function handleListModels(args, say) {
    const list = getAvailableModels();
    const msg = list.length ? `🧍 Model có sẵn: ${list.join(', ')}.`
        : '🧍 Chưa khai báo danh sách model. Bạn vẫn có thể gõ "đổi sang model <tên>".';
    say(msg, 'normal');
    return msg;
}

function handleRepeatLast(args, say) {
    if (!window.__memory?.lastPlan?.length) return fail(say, '🤔 Chưa có lệnh nào trước đó để làm lại.');
    say('🔁 Làm lại lệnh trước.', 'normal');
    return { subplan: window.__memory.lastPlan.map(a => ({ tool: a.tool, args: { ...a.args } })) };
}

function handleLookAround(args, say, ctx) {
    const summary = summarizeSceneAround(ctx.aiTools.getSceneSnapshot());
    say(summary, 'normal');
    return summary;
}

function handlePlayRPS(args, say) {
    if (window.minigameRPS) {
        // Không cần say gì vì Minigame sẽ tự bật UI và nói
        window.minigameRPS.start();
        return { abort: true };
    } else {
        say('⚠️ Minigame chưa được khởi tạo.', 'unclear');
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════
export const CLIENT_HANDLERS = {
    walkTo: handleWalkTo,
    walkRelative: handleWalkRelative,
    turn: handleTurn,
    lookAtCamera: handleLookAtCamera,

    lookAround: handleLookAround,
    clearAllBoxes: handleClearAllBoxes,
    removeBox: handleRemoveBox,
    removeBoxesByColor: handleRemoveBoxesByColor,
    stop: handleStop,
    grab: handleGrab,
    release: handleRelease,
    focusOn: handleFocusOn,
    walkToBox: handleWalkToBox,
    walkToCamera: handleWalkToCamera,
    walkToNearestColor: (a, say) => handleWalkToBox({ color: a?.color }, say),
    walkToPickup: handleWalkToPickup,
    kickBox: handleKickBox,
    walkToDropNearCamera: handleDropNearCamera,
    walkToDropAt: handleDropAt,
    walkToDropAtNearest: handleDropAtNearest,
    walkToDropDirection: handleDropDirection,
    countBoxes: handleCountBoxes,
    recolorBox: handleRecolorBox,
    recolorBoxesByColor: handleRecolorByColor,
    moveBoxTo: handleMoveBoxTo,
    stackBoxes: handleStackBoxes,
    arrangeBoxes: handleArrangeBoxes,
    savePosition: handleSavePosition,
    loadPosition: handleLoadPosition,
    listPositions: handleListPositions,
    teleport: handleTeleport,
    spawnBox: handleSpawnBox,
    spawnBoxNear: handleSpawnBoxNear,
    spin: handleSpin,
    walkRandom: handleWalkRandom,
    switchModel: handleSwitchModel,
    listModels: handleListModels,
    repeatLast: handleRepeatLast,
    playRPS: handlePlayRPS,
};

export const NEEDS_IDLE = new Set(['spin', 'teleport', 'loadPosition', 'switchModel', 'walkToCamera', 'kickBox', 'playRPS']);
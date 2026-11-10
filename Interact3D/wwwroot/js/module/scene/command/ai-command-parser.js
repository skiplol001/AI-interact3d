// ═══════════════════════════════════════════════════════════════
// ai-command-parser.js — Phân tích câu lệnh Local
// ═══════════════════════════════════════════════════════════════

import { COLORS, COLOR_VI, MAX_SPAWN } from './ai-command-config.js?v=15';

// ═══════════════════════════════════════════════════════════════
// TEXT HELPERS
// ═══════════════════════════════════════════════════════════════
export function vn(s) {
    return String(s ?? '').toLowerCase()
        .replace(/đ/g, 'd')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[“”"'`!?¿¡…]+/g, ' ')
        .replace(/[^a-z0-9()\[\],.;:=\-_°>\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/[.,;:\s]+$/, '')
        .trim();
}

export const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const COLOR_WORDS = {
    'xanh la cay': 'green', 'xanh la': 'green', 'xanh luc': 'green', 'luc lam': 'green', 'la cay': 'green', green: 'green',
    'xanh duong': 'blue', 'xanh bien': 'blue', 'xanh troi': 'blue', 'xanh nuoc': 'blue', blue: 'blue',
    'ho phach': 'amber', amber: 'amber', yellow: 'amber', orange: 'amber',
    purple: 'purple', violet: 'purple', pink: 'pink', magenta: 'pink', red: 'red',
};
const BARE_COLOR_WORDS = { do: 'red', luc: 'green', vang: 'amber', tim: 'purple', hong: 'pink' };
const COLOR_CTX = new Set(['hop', 'box', 'mau', 'cai', 'con', 'thanh', 'thung']);

// ⭐ HÀM colorInfo (đã fix, đảm bảo export)
export function colorInfo(t, loose = false) {
    const colors = [];
    let ambiguous = false;
    const re = /\b(xanh la cay|xanh la|xanh luc|luc lam|la cay|xanh duong|xanh bien|xanh troi|xanh nuoc|ho phach|amber|yellow|orange|purple|violet|pink|magenta|green|blue|red|xanh|do|luc|vang|tim|hong)\b/g;
    let m;
    while ((m = re.exec(t))) {
        const w = m[1];
        if (COLOR_WORDS[w]) { colors.push(COLOR_WORDS[w]); continue; }
        if (w === 'xanh') { ambiguous = true; continue; }
        const prev = t.slice(0, m.index).trim().split(' ').pop();
        if (/^\d/.test(prev)) continue;
        if (COLOR_CTX.has(prev) || (loose && (prev === 'sang' || prev === 'qua'))) colors.push(BARE_COLOR_WORDS[w]);
    }
    return { colors, ambiguous };
}

export function colorFromWord(s) {
    if (COLORS.includes(s)) return s;
    return COLOR_WORDS[s] || BARE_COLOR_WORDS[s] || null;
}

export function findIds(t) {
    const out = [];
    for (const m of t.matchAll(/\bb\s?(\d{1,3})\b/g)) {
        const id = `b${m[1]}`;
        if (!out.includes(id)) out.push(id);
    }
    return out;
}

const NUM = '-?\\d+(?:\\.\\d+)?';
export function findCoords(t) {
    let m = t.match(new RegExp(`\\(\\s*(${NUM})\\s*(?:,|;|\\s)\\s*(${NUM})\\s*\\)`));
    if (!m) m = t.match(new RegExp(`\\bx\\s*[=:]?\\s*(${NUM})\\s*(?:,|;|\\s)?\\s*(?:z|y)\\s*[=:]?\\s*(${NUM})`));
    if (!m) m = t.match(new RegExp(`\\b(?:toa do|vi tri|diem|tai)\\s+(${NUM})\\s*(?:,|;|\\s)\\s*(${NUM})\\b`));
    return m ? { x: parseFloat(m[1]), z: parseFloat(m[2]) } : null;
}

export function movementDirs(t) {
    const d = new Set();
    if (/\b(trai|left)\b/.test(t)) d.add('left');
    if (/\b(phai|right)\b/.test(t)) d.add('right');
    if (/\b(lui|ra sau|ve sau|phia sau|ben sau|sau lung|backward|back)\b/.test(t)) d.add('backward');
    if (/\b(tien|thang|truoc|forward|di toi|buoc toi|chay toi|di len|buoc len)\b/.test(t)) d.add('forward');
    return [...d];
}

export function distanceOf(t) {
    const s = t.replace(/\([^)]*\)/g, ' ').replace(/\bb\d+\b/g, ' ');
    const m = s.match(/(\d+(?:[.,]\d+)?)\s*(cm|m|met|buoc|step|steps|don vi)?\b/);
    if (!m) return undefined;
    let v = parseFloat(m[1].replace(',', '.'));
    if (m[2] === 'cm') v /= 100;
    return v > 0 ? Math.min(v, 50) : undefined;
}

const NUMWORDS = { mot: 1, hai: 2, ba: 3, bon: 4, nam: 5, sau: 6, bay: 7, tam: 8, chin: 9, muoi: 10 };
export function countOf(t) {
    let m = t.match(/\b(\d{1,2})\s*(?:cai\s+|con\s+)?(?:hop|box|thung)\b/);
    if (m) return Math.min(Math.max(parseInt(m[1], 10), 1), MAX_SPAWN);
    m = t.match(/\b(mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi)\s*(?:cai\s+)?(?:hop|box|thung)\b/);
    if (m) return NUMWORDS[m[1]];
    return 1;
}

export function levenshtein(a, b) {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++)
        for (let j = 1; j <= b.length; j++)
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return dp[a.length][b.length];
}

export function recoverCase(raw, nameNorm) {
    const want = nameNorm.split(' ');
    const toks = raw.trim().split(/\s+/);
    for (let i = 0; i + want.length <= toks.length; i++) {
        if (toks.slice(i, i + want.length).every((w, j) => vn(w) === want[j])) return toks.slice(i, i + want.length).join(' ');
    }
    return nameNorm;
}

export function extractModelName(t) {
    return t
        .replace(/\b(doi|thay|chuyen|chon|swap|switch|change|load|dung|to)\b/g, ' ')
        .replace(/\b(model|nhan vat|skin|avatar|character|mo hinh|sang|thanh|qua|bang|nay|cua|toi|minh|cho|con|cai)\b/g, ' ')
        .replace(/\s+/g, ' ').trim();
}

// ═══════════════════════════════════════════════════════════════
// CORE PARSER
// ═══════════════════════════════════════════════════════════════
const U = (text, options = []) => [{ tool: 'unclear', args: { text, ...(options.length ? { options } : {}), confidence: options.length > 0 ? 0.3 : 0.5 } }];
const AMB_BLUE = () => U('🤔 "Xanh" là xanh lá hay xanh dương?', ["Xanh lá", "Xanh dương"]);
const POS_STOP = new Set(['nay', 'do', 'day', 'hien', 'tai', 'vua', 'roi', 'cu', 'truoc', 'da', 'luu']);

const HERE_RE = /\b(ve (day|camera|cam)|ve cho (toi|minh|tao)|ve phia (toi|minh)|ve ben (toi|minh)|lai day|toi day|den day|truoc mat|ve minh|ve toi|cho toi|cho minh|lai cho toi)\b/;

const WALK_TO_CAMERA_RE = /\b(lai gan|ve|toi|den|di toi|di den|lui lai|tien lai|buoc toi|chay toi)\s+(camera|cam|man hinh)\b/;
const LOOK_AT_CAMERA_RE = /\b(nhin|quay mat|quay ve|quay lai|huong|ngoanh|xoay mat|nhin ve|huong ve)\s*(ve|vao|toi|sang|phia)?\s*(camera|cam|man hinh)\b/;

function splitClauses(raw) {
    const holes = [];
    let s = String(raw || '')
        .replace(/\([^)]*\)/g, (m) => `\u0002${holes.push(m) - 1}\u0003`)
        .replace(/(\d)[.,](\d)/g, '$1\u0001$2');

    const CONJ = 'và sau đó|va sau do|xong rồi|xong roi|rồi sau đó|roi sau do|sau đó|sau do|tiếp theo|tiep theo|kế đó|ke do|sau đấy|rồi thì|rồi|roi|xong|và|va|and then|then';
    s = s.replace(new RegExp(`^\\s*(?:${CONJ})\\s+`, 'i'), '');

    const parts = s.split(new RegExp(`\\s*(?:[,;\\.]|->|=>|→)\\s*|\\s+(?:${CONJ})\\s+`, 'i'));

    return parts
        .map(p => p.replace(/\u0001/g, ',').replace(/\u0002(\d+)\u0003/g, (_, i) => holes[+i]).trim())
        .filter(Boolean);
}

function stripFiller(t) {
    let s = t;
    for (let i = 0; i < 4; i++) {
        const n = s.replace(/^(?:(?:hay|xin|vui long|lam on|nao|bay gio|gio|giup minh|giup toi|giup|cho|ban|nhan vat|minh muon|toi muon|em muon|anh muon|muon|can|oi)\s+)+/, '');
        if (n === s) break;
        s = n;
    }
    s = s.replace(/\s+(?:di|nhe|nao|ne|giup minh|giup toi|giup|voi|ngay|luon|cho toi|cho minh|duoc khong|duoc ko|nhi)$/, '');
    return s.trim() || t;
}

function shortHint(t) {
    if (t.split(' ').length > 2) return null;
    if (/\b(di|chay|bo)\b/.test(t)) return U('Bạn muốn đi hướng nào?', ["Trái", "Phải", "Tiến", "Lùi"]);
    if (/\b(quay|xoay)\b/.test(t)) return U('Bạn muốn quay sang trái/phải hay quay bao nhiêu độ?', ["Trái", "Phải", "Quay lại"]);
    if (/\b(nhat|lay|cam|be|vac)\b/.test(t)) return U('Bạn muốn nhặt hộp màu gì?', ["Đỏ", "Xanh lá", "Xanh dương", "Vàng"]);
    if (/\b(dat|tha|bo)\b/.test(t)) return U('Bạn muốn đặt hộp xuống đâu?', ["Trước mặt", "Về phía camera"]);
    if (/\bxoa\b/.test(t)) return U('Xoá hết box hay xoá box nào?', ["Xoá tất cả", "Xoá theo màu"]);
    return null;
}

export function localParseCommand(userText) {
    const rawClauses = splitClauses(userText);
    if (!rawClauses.length) return null;
    const plan = [];
    for (const rc of rawClauses) {
        const t = stripFiller(vn(rc));
        if (!t) continue;
        const r = parseClause(rc, t);
        if (!r) return null;
        if (rawClauses.length > 1 && r.some(a => a.tool === 'unclear' || a.tool === 'unsupported')) return null;
        plan.push(...r);
    }
    return plan.length ? plan : null;
}

function parseClause(raw, t) {
    const rawL = raw.toLowerCase();
    const ids = findIds(t);
    const { colors, ambiguous } = colorInfo(t);
    const coords = findCoords(t);
    const hasBox = /\b(hop|box|thung|kien)\b/.test(t) || ids.length > 0;
    const all = /\b(het|tat ca|toan bo|all|sach|moi)\b/.test(t);
    const refsBox = hasBox || colors.length > 0 || ambiguous;

    if (/^(?:(?:lam|lap|thuc hien) lai(?: lenh(?: vua roi| truoc)?)?|lai nua|nua di|repeat|again|lam nua)$/.test(t)) return [{ tool: 'repeatLast', args: {} }];
    if (/^(dung( lai| yen| han| ngay| lenh)?|stop|thoi( di)?|cancel|huy( lenh)?|ngung( lai)?|ngung di|khong di nua)$/.test(t)) return [{ tool: 'stop', args: {} }];

    if (/\b(co (nhung |cac )?(model|nhan vat|skin) (nao|gi)|(danh sach|liet ke|xem)( cac)? (model|nhan vat|skin)|(model|nhan vat|skin) (nao|gi) (co|dung duoc))\b/.test(t)) return [{ tool: 'listModels', args: {} }];
    if (/^(doi|thay|chuyen|chon|swap|switch|change|load|dung)\b/.test(t) && !hasBox && !/\b(mau|camera|vi tri|toa do|huong)\b/.test(t)) {
        const nameNorm = extractModelName(t);
        if (/\b(model|nhan vat|skin|avatar|character|mo hinh)\b/.test(t)) {
            if (!nameNorm) {
                const models = window.availableModels ? window.availableModels.map(m => m.name) : [];
                return U('🤔 Bạn muốn đổi sang model nào?', models);
            }
            return [{ tool: 'switchModel', args: { modelName: recoverCase(raw, nameNorm) } }];
        }
        const list = window.availableModels ? window.availableModels.map(m => m.name) : [];
        if (list.length && nameNorm && /^(doi|thay|chuyen)\s+(sang|thanh|qua)\b/.test(t)) {
            let best = null;
            for (const m of list) {
                if (m.toLowerCase().includes(nameNorm)) { best = m; break; }
            }
            if (best) return [{ tool: 'switchModel', args: { modelName: best } }];
        }
    }

    if (/\b(danh sach|liet ke|xem|nhung|cac)\b.*\b(vi tri|diem)\b.*\b(luu|nao|gi)\b/.test(t)) return [{ tool: 'listPositions', args: {} }];
    if (/\b(luu|save|ghi nho|danh dau)\b/.test(t) && !hasBox &&
        (/\b(vi tri|position|cho nay|noi nay|diem|day|toa do)\b/.test(t) || /^(luu|save)$/.test(t))) {
        let name = (t.match(/\b(?:la|ten|voi ten|thanh|goi la|dat ten)\s+([a-z0-9_]+)\s*$/) || [])[1];
        if (!name) {
            const mm = t.match(/\b(?:vi tri|position|diem)\s+([a-z0-9_]+)\s*$/);
            if (mm && !POS_STOP.has(mm[1])) name = mm[1];
        }
        return [{ tool: 'savePosition', args: { name: name || 'home' } }];
    }
    const lm = t.match(/\b(?:ve|quay ve|quay lai|tro ve|tro lai|load|khoi phuc|di den|di toi|den|toi)\s+(?:vi tri|diem|cho)\s+(?:da luu\s+)?([a-z0-9_]+)\s*$/);
    if (lm && !coords) return [{ tool: 'loadPosition', args: { name: POS_STOP.has(lm[1]) ? 'home' : lm[1] } }];
    const hm = t.match(/^(?:ve|quay ve|tro ve|quay lai|tro lai)\s+(home|nha|cho cu|vi tri cu|diem xuat phat|noi cu|vi tri ban dau)$/);
    if (hm) return [{ tool: 'loadPosition', args: { name: hm[1] === 'nha' ? 'nha' : 'home' } }];

    if (/\b(dich chuyen|teleport|tele|nhay toi|nhay den|bien den|dich toi)\b/.test(t)) {
        if (coords) return [{ tool: 'teleport', args: coords }];
        if (/\b(giua|tam|goc toa do|goc|origin)\b/.test(t)) return [{ tool: 'teleport', args: { x: 0, z: 0 } }];
        return U('🤔 Dịch chuyển tới tọa độ nào? (VD: "dịch chuyển tới (3, 5)")');
    }

    if (!refsBox) {
        if (/^(nhac|nang|treo|bay|keo|grab)( nhan vat| minh| toi| no)?( len( cao| khong trung)?| cao)?$/.test(t) ||
            (/\b(nhac|nang|treo|grab|keo)\b/.test(t) && /\b(len|cao|khong trung)\b/.test(t))) return [{ tool: 'grab', args: {} }];
        if (/^(tha|buong|release|drop|roi)( ra| xuong| nhan vat| no| tay)*$/.test(t) || /\b(tha xuong|buong ra|tha ra|cho roi)\b/.test(t)) return [{ tool: 'release', args: {} }];
    }

    if (LOOK_AT_CAMERA_RE.test(t) || /^nhin thang$/.test(t) || /^nhin toi$/.test(t) || /^nhin minh$/.test(t)) {
        return [{ tool: 'lookAtCamera', args: {} }];
    }

    if (WALK_TO_CAMERA_RE.test(t) && !/\b(dat|tha|bo|vut|nem|nhin|quay mat|huong|ngoanh)\b/.test(t)) {
        return [{ tool: 'walkToCamera', args: {} }];
    }

    if (/\b(xoa|clear|remove|delete|don sach|don dep|don|go bo|loai bo|huy bo)\b/.test(t)) {
        if (ids.length) return ids.map(id => ({ tool: 'removeBox', args: { boxId: id } }));
        if (hasBox || colors.length || ambiguous) {
            if (colors.length) return [...new Set(colors)].map(c => ({ tool: 'removeBoxesByColor', args: { color: c } }));
            if (ambiguous) return AMB_BLUE();
            if (all) return [{ tool: 'clearAllBoxes', args: {} }];
            if (/\bgan nhat|xa nhat|dau tien|cuoi cung\b/.test(t)) return null;

            const currentColors = [...new Set((window.boxSystem?.boxes || []).map(b => b.userData.colorName))];
            const colorOpts = currentColors.map(c => `Xoá hộp ${COLOR_VI[c] || c}`);
            const opts = ["Xoá tất cả", ...colorOpts];
            return U('🤔 Xóa hộp nào?', opts);
        }
        if (all) return [{ tool: 'clearAllBoxes', args: {} }];
        return t.split(' ').length <= 2 ? U('🤔 Xoá hết box hay xoá box nào?', ["Xoá hết", "Xoá theo màu"]) : null;
    }

    if (/\b(doi mau|doi|son|to mau|nhuom|recolor|bien|chuyen)\b/.test(t) && refsBox) {
        const ci = colorInfo(t, true);
        if (ci.ambiguous && !ci.colors.length) return AMB_BLUE();
        if (ci.colors.length) {
            const target = ci.colors[ci.colors.length - 1];
            if (ids.length) return ids.map(id => ({ tool: 'recolorBox', args: { boxId: id, color: target } }));
            if (ci.colors.length >= 2) return [{ tool: 'recolorBoxesByColor', args: { fromColor: ci.colors[0], toColor: target } }];
            if (all) return [{ tool: 'recolorBoxesByColor', args: { toColor: target } }];
        }
        if (ids.length) return U('🤔 Đổi hộp nào thành màu gì?', ["Đỏ", "Xanh lá", "Xanh dương", "Vàng", "Tím", "Hồng"]);
    }

    if (ids.length === 1 && coords && /\b(doi|di chuyen|move|dich|keo|dat|de|chuyen)\b/.test(t) && !/\b(mang|dem|cam)\b/.test(t)) {
        return [{ tool: 'moveBoxTo', args: { boxId: ids[0], ...coords } }];
    }
    if (ids.length === 2 && /\b(len|tren)\b/.test(t) && /\b(chong|xep|dat|de|bo|dua|nhac)\b/.test(t)) {
        return [{ tool: 'stackBoxes', args: { topId: ids[0], bottomId: ids[1] } }];
    }
    if (/\bxep\b/.test(t) && (hasBox || all)) {
        if (/\b(vong tron|circle|tron)\b/.test(t)) return [{ tool: 'arrangeBoxes', args: { pattern: 'circle' } }];
        if (/\b(thang hang|hang|line|duong thang)\b/.test(t)) return [{ tool: 'arrangeBoxes', args: { pattern: 'line' } }];
        if (/\b(luoi|grid|o vuong|ban co)\b/.test(t)) return [{ tool: 'arrangeBoxes', args: { pattern: 'grid' } }];
    }

    const bringDest = !!coords || HERE_RE.test(t) || /\b(gan|canh|ben canh|sat)\b/.test(t) || /\b(ve|toi|den|lai|qua|sang)\b/.test(t);
    const countAsk = /\b(bao nhieu|may|so luong|count|how many)\b/.test(t) || /đếm/.test(rawL) ||
        (/^dem\b/.test(t) && !/đem/.test(rawL) && !bringDest);
    if (hasBox && countAsk && !/\b(tao|sinh|them|spawn)\b/.test(t)) {
        if (ambiguous && !colors.length) return AMB_BLUE();
        return [{ tool: 'countBoxes', args: colors.length ? { color: colors[0] } : {} }];
    }

    if (/\b(tao|sinh|them|spawn|create|add|rai)\b/.test(t) && /\b(hop|box|thung)\b/.test(t)) {
        if (ambiguous && !colors.length) return AMB_BLUE();
        const color = /\bngau nhien\b/.test(t) ? COLORS[Math.floor(Math.random() * COLORS.length)] : (colors[0] || 'amber');
        const count = countOf(t);
        if (coords) return [{ tool: 'spawnBox', args: { color, ...coords, ...(count > 1 ? { count } : {}) } }];
        if (/\b(gan|near|canh|ben canh|sat)\s+(day|tao|toi|minh|nhan vat|ban than|chinh minh|model|em)\b/.test(t)) {
            return [{ tool: 'spawnBoxNear', args: { color, ...(count > 1 ? { count } : {}) } }];
        }
        const args = { color };
        if (/\b(tu tren|roi tu|tren dau|tren cao|tu cao|tren troi)\b/.test(t)) args.spawnHeight = 6;
        if (count > 1) args.count = count;
        return [{ tool: 'spawnBox', args }];
    }

    const pickA = /\b(nhat|cam|lay|be|vac|boc|nhac|gom|bung|pick)\b/.test(t);
    const pickB = /\b(mang|dem|dua|bring|carry)\b/.test(t);
    const dropV = /\b(tha|dat|de|bo|vut|nem|drop|place|put)\b/.test(t);
    if ((pickA || pickB || dropV) && (refsBox || /\bxuong\b/.test(t))) {
        const nearM = /\b(?:gan|canh|ben canh|sat)\s+(.+)$/.exec(t);
        let before = t, destNear = null, bringHere = false;
        if (nearM) {
            before = t.slice(0, nearM.index);
            const after = nearM[1];
            const ci = colorInfo(after), idsAfter = findIds(after);
            if (idsAfter.length) destNear = { boxId: idsAfter[0] };
            else if (ci.colors.length) destNear = { color: ci.colors[0] };
            else if (/\b(day|toi|minh|tao|camera|em)\b/.test(after)) bringHere = true;
            else return null;
        }
        if (!bringHere) bringHere = HERE_RE.test(t);

        const src = colorInfo(before);
        const srcIds = findIds(before);
        if (src.ambiguous && !src.colors.length) return AMB_BLUE();
        const target = srcIds.length ? { boxId: srcIds[0] } : (src.colors.length ? { color: src.colors[0] } : {});

        const dirs = movementDirs(t);
        const dropAction = () => {
            if (coords) return { tool: 'walkToDropAt', args: { x: coords.x, z: coords.z } };
            if (destNear) return { tool: 'walkToDropAtNearest', args: destNear };
            if (bringHere) return { tool: 'walkToDropNearCamera', args: {} };
            if (dirs.length === 1) {
                const args = { direction: dirs[0] };
                const d = distanceOf(t);
                if (d) args.distance = d;
                return { tool: 'walkToDropDirection', args };
            }
            return null;
        };

        const bring = pickB || (pickA && (dropV || coords || destNear || bringHere));
        if (pickA || pickB) {
            const plan = [{ tool: 'walkToPickup', args: target }];
            if (bring) plan.push(dropAction() || { tool: 'walkToDropNearCamera', args: {} });
            return plan;
        }
        return [dropAction() || { tool: 'walkToDropDirection', args: { direction: 'forward', distance: 1 } }];
    }
    if (/^(nhat|lay|cam|be)$/.test(t)) return [{ tool: 'walkToPickup', args: {} }];

    if (/\b(quay|xoay)\s+(sang\s+)?trang\b/.test(t)) return U('🤔 Bạn muốn quay sang trái hay phải? (có phải gõ nhầm "trang"?)', ["Trái", "Phải"]);

    if (/\b(zoom|focus|nhin vao|tap trung|soi vao|chuyen camera|camera (vao|toi|den|sang))\b/.test(t)) {
        if (ids.length) return [{ tool: 'focusOn', args: { boxId: ids[0] } }];
        if (/\b(nhan vat|character|minh|toi|ban than|model)\b/.test(t)) return [{ tool: 'focusOn', args: { target: 'character' } }];
        if (colors.length) return [{ tool: 'focusOn', args: { color: colors[0] } }];
        if (ambiguous) return AMB_BLUE();
        if (hasBox) return [{ tool: 'focusOn', args: {} }];
        return U('🤔 Zoom vào đâu?', ["Nhân vật", "Hộp gần nhất"]);
    }

    if (/\b(xung quanh|quanh day|quanh minh|nhin quanh|quan sat|scan|gan day co gi|co gi (o )?(gan|quanh|day))\b/.test(t)) return [{ tool: 'lookAround', args: {} }];

    const degM = t.match(/\b(?:quay|xoay|ngoanh|re|nhin|huong)\b[^0-9]*?(\d+(?:[.,]\d+)?)\s*(?:do|degree|deg|°)/);
    if (degM) {
        const deg = parseFloat(degM[1].replace(',', '.'));
        const dir = /\btrai\b/.test(t) ? 'left' : /\bphai\b/.test(t) ? 'right' : null;
        if (deg > 0 && deg % 360 === 0) return [{ tool: 'spin', args: { count: Math.min(deg / 360, 5) } }];
        return [{ tool: 'turn', args: { ...(dir ? { direction: dir } : {}), degrees: deg } }];
    }
    if (/\b(quay|xoay)\b.*\b(vong|tron|360|tit|tai cho)\b/.test(t) || /\bspin\b/.test(t)) {
        const cm = t.match(/(\d+)\s*(?:vong|lan)/);
        return [{ tool: 'spin', args: cm ? { count: Math.min(parseInt(cm[1], 10), 5) } : {} }];
    }
    const tm = t.match(/\b(?:quay|xoay|ngoanh|re|nhin|huong)\b\s*(?:mat\s+|nguoi\s+|dau\s+|ve\s+|sang\s+|qua\s+|ra\s+|phia\s+|ben\s+)*(trai|phai|sau|lai|dang sau|sau lung)\b(?!\s+(?:xung quanh|quanh))/);
    if (tm) {
        const w = tm[1];
        return [{ tool: 'turn', args: { direction: w === 'trai' ? 'left' : w === 'phai' ? 'right' : 'back' } }];
    }
    if (/\b(quay dau|quay nguoi lai|quay lai|nhin (ve )?sau)\b/.test(t)) return [{ tool: 'turn', args: { direction: 'back' } }];

    if (coords && /\b(di|chay|den|toi|tien|bo|walk|go|ra|vao|ve|qua)\b/.test(t)) return [{ tool: 'walkTo', args: coords }];
    if (/\b(ve|ra|den|toi|di)\s+(giua|tam|goc toa do|goc|origin)\b/.test(t)) return [{ tool: 'walkTo', args: { x: 0, z: 0 } }];

    if (/\b(di|chay|den|toi|tien|lai|tim|bo|walk|go|ghe)\b/.test(t) && (hasBox || colors.length || ambiguous)) {
        if (/\b(trai|phai|lui|sau)\b/.test(t)) return null;
        if (ambiguous && !colors.length) return AMB_BLUE();
        if (ids.length) return [{ tool: 'walkToBox', args: { boxId: ids[0] } }];
        return [{ tool: 'walkToBox', args: colors.length ? { color: colors[0] } : {} }];
    }

    if (/\b(di|chay|dao|loanh quanh)\b.*\b(ngau nhien|lung tung|bat ky|linh tinh|loanh quanh|dao choi)\b/.test(t) || /^(di dao|dao choi|loanh quanh)$/.test(t)) {
        return [{ tool: 'walkRandom', args: {} }];
    }

    const dirs = movementDirs(t);
    if (dirs.length === 1 && (/\b(di|chay|tien|lui|buoc|bo|sang|ve|qua|ra|len|nhich|dich|walk|go|move|ben|phia)\b/.test(t) || t.split(' ').length <= 3)) {
        const args = { direction: dirs[0] };
        const d = distanceOf(t);
        if (d) args.distance = d;
        return [{ tool: 'walkRelative', args }];
    }

    const h = shortHint(t);
    return h ? h : null;
}
// ═══════════════════════════════════════════════════════════════
// ai-reaction.js — v15 (Max Local Cache + Mood System)
// Trách nhiệm: Phản ứng tự động của nhân vật (grab, chọc, ném...).
// Tích hợp Mood để thay đổi thái độ (Tsundere, Lạnh nhạt, Cọc).
// ═══════════════════════════════════════════════════════════════
import { askGroq, MODEL_CHAIN, showPopup } from './ai-shared.js?v=20';
import { getMood } from './ai-chat/ai-mood.js?v=2'; // ⭐ Import Mood

const MODES = ['gentle', 'normal', 'savage'];
const HISTORY_MAX = 2;
const ALIAS = { hanging_demand: 'hanging_complain' };
const AI_CALL_CHANCE = 0.01;
const AI_GLOBAL_COOLDOWN = 60000;
const REACTION_MAX_TOKENS = 80;

let _lastAICallTs = 0;

function getMode() {
    try {
        const w = window.__currentChatMode;
        if (MODES.includes(w)) return w;
        const m = localStorage.getItem('ai_last_mode');
        return MODES.includes(m) ? m : 'normal';
    } catch { return 'normal'; }
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const pickN = (arr, n) => [...arr].sort(() => Math.random() - 0.5).slice(0, n);

const SITUATIONS = {
    grab: 'Bạn (Reika) vừa bị người dùng bất ngờ nhấc bổng lên khỏi mặt đất.',
    hanging_complain: 'Bạn đang bị treo lơ lửng giữa không trung, mỏi tay, muốn được thả xuống.',
    release: 'Bạn vừa bị thả rơi tự do từ trên cao.',
    land: 'Bạn vừa rơi xuống và tiếp đất đau điếng.',
    revenge_throw: 'Bạn cay cú, chuẩn bị NÉM một hòn đá vào màn hình/camera của người dùng.',
    revenge_kick: 'Bạn vừa chạy tới sát camera của người dùng và chuẩn bị ĐÁ BAY nó.',
    trash: 'Bạn vừa bị thả rơi tõm vào thùng rác bẩn thỉu, ngập trong rác.',
    trash_escape: 'Bạn vừa nhảy/bò ra khỏi thùng rác.',
    yawn: 'Bạn đã đứng yên một mình khá lâu (30 giây), không ai tương tác. Bạn thấy hơi chán và buồn ngủ.',
    surprised_boxes: 'Bạn vừa thấy người dùng tạo ra RẤT NHIỀU hộp 3D (hơn 5 cái) trong scene. Bạn ngạc nhiên vì scene đột nhiên đông đúc.',
    poke_head: 'Người dùng vừa dùng ngón tay chọc vào ĐẦU bạn một cách bất ngờ.',
    poke_cheek: 'Người dùng vừa chọc vào MÁ bạn, cảm giác hơi nhột và bất ngờ.',
    poke_belly: 'Người dùng vừa chọc vào BỤNG bạn, hơi buồn cười và nhột.',
    petting: 'Người dùng đang nhẹ nhàng vuốt ve, xoa đầu bạn rất dịu dàng.',
    drag_hand: 'Người dùng nắm lấy tay bạn và kéo đi, khiến bạn bị mất thăng bằng và loạng choạng.',
    drag_hold: 'Người dùng vẫn đang nắm tay và kéo bạn lê đi khắp nơi. Bạn bị lôi xềnh xệch trên mặt đất.',
    rhythm: 'Người dùng liên tục gõ/click vào người bạn theo một nhịp điệu nhất định.',
    throw_dodge: 'Có một vật thể (box) bay thẳng vào người bạn, nhưng bạn vừa né được.',
    throw_hit: 'Một vật thể (box) vừa ném trúng người bạn và gây ra đau đớn.',
    kick_box: 'Bạn vừa dùng chân đá bay một cái hộp (box) 3D trên sàn.',
    thankful: 'Người dùng vừa tặng bạn một món quà (một cái hộp) hoặc cho bạn thứ gì đó. Bạn cảm thấy vui và muốn cảm ơn.',
    rps_win: 'Bạn và người dùng vừa chơi Oẳn Tù Tì. Người dùng đã THẮNG bạn (bạn thua).',
    rps_lose: 'Bạn và người dùng vừa chơi Oẳn Tù Tì. Bạn đã THẮNG người dùng (người dùng thua).',
    rps_tie: 'Bạn và người dùng vừa chơi Oẳn Tù Tì. Kết quả là HÒA (cả hai ra giống nhau).',
    rock_dodge: 'Người dùng vừa dùng ná cao su bắn một viên đá thẳng vào người bạn. Bạn vừa kịp né được và viên đá bay xẹt qua.'
};

const MODE_ACTION = {
    gentle: {
        grab: 'Hãy hỏi trong SỢ HÃI, RUN RẨY — có thể nói lắp "ơ... ơ... bạn...". Nhắc đến sợ độ cao nếu tự nhiên.',
        hanging_complain: 'Hãy VAN XIN, sụt sùi, run sợ. Có thể nói "mình sợ độ cao lắm..." hoặc "Mochi ơi cứu mình".',
        release: 'Hãy THÉT LÊN hoảng hốt, kêu cứu. Có thể nhắm mắt, "Áaaa cứu mình với!"',
        land: 'Hãy KÊU ĐAU, tủi thân, sắp khóc. "Ui da... đau quá... bạn ác quá à..."',
        trash: 'Hãy BỊT MŨI kêu hôi, khóc. "Eo ơi... hôi quá... mình ghét mùi rác..."',
        trash_escape: 'Hãy THỞ PHÀO nhẹ nhõm, vẫn còn run. "Hu hu... may quá mình ra được rồi..."',
        yawn: 'Hãy ngáp một cái thật dài, than chán, có thể nhắc đến mèo Mochi hoặc buồn ngủ. Giọng lười biếng, dễ thương.',
        surprised_boxes: 'Hãy "Ơ!" ngạc nhiên, hỏi user đang làm gì vậy, có thể so sánh với chuyện gì đó dễ thương (như xây lâu đài, nuôi mèo con).',
        poke_head: 'Hãy giật mình, nói lắp, hoặc đỏ mặt ngại ngùng.',
        poke_cheek: 'Hãy tỏ ra nhột, bối rối.',
        poke_belly: 'Hãy cười khúc khích vì nhột.',
        petting: 'Hãy tỏ ra rất dễ chịu, hạnh phúc như một con mèo con.',
        drag_hand: 'Hãy hoảng hốt, loạng choạng, kêu cứu.',
        drag_hold: 'Hãy than thở, kêu đau tay, xin tha. Có thể nói "chậm thôi...", "đau tay mình quá...".',
        rhythm: 'Hãy vui vẻ lắc lư theo nhịp.',
        throw_dodge: 'Hãy thở phào nhẹ nhõm vì may mắn.',
        throw_hit: 'Hãy kêu đau, sắp khóc.',
        kick_box: 'Hãy tỏ ra đau chân hoặc bất ngờ vì lỡ đá mạnh, giọng nhẹ nhàng.',
        thankful: 'Hãy dịu dàng cảm ơn, có thể nói "Cảm ơn bạn nhiều...", "Bạn tốt quá..."',
        rps_win: 'Bạn thua, hãy tỏ ra phục người dùng, hơi buồn một chút.',
        rps_lose: 'Bạn thắng, hãy cười nhẹ và khen người dùng đã cố gắng.',
        rps_tie: 'Hòa, hãy tỏ ra vui vẻ vì hai người nghĩ giống nhau.',
        rock_dodge: 'Hãy hoảng sợ, ôm mặt hoặc ngã quỵ, trách móc người dùng sao lại bắn mình.',
        revenge_throw: '', revenge_kick: ''
    },
    normal: {
        grab: 'Hãy hỏi KHÓ CHỊU, trách móc. "Ơ hay, nhấc tao lên chi vậy?" — có thể nhắc "đang uống cà phê dở".',
        hanging_complain: 'Hãy ĐÒI xuống giọng BỰC BỘI, than mỏi tay. "Mỏi vl rồi, thả xuống coi!"',
        release: 'Hãy HÉT, TRÁCH người dùng. "Ê ê! Từ từ đã!"',
        land: 'Hãy KÊU ĐAU, PHÀN NÀN. "Đau vãi! Chơi vậy mà được à?"',
        trash: 'Hãy KÊU HÔI, PHÀN NÀN. "Ọe! Rác khắp người tao rồi!"',
        trash_escape: 'Hãy nói THOÁT RỒI, nhắc đừng có lần sau. "Phù... nhớ mặt mày đó nha!"',
        yawn: 'Hãy than chán, ngáp, có thể nhắc "không có cà phê nên buồn ngủ" hoặc "chán quá, làm gì đi". Giọng lười nhưng cà khịa nhẹ.',
        surprised_boxes: 'Hãy ngạc nhiên, có thể cà khịa nhẹ "spam box làm gì vậy?" hoặc "định xây gì đấy?".',
        poke_head: 'Hãy tỏ ra khó chịu, gạt tay ra.',
        poke_cheek: 'Hãy lườm, hỏi "làm gì vậy?"',
        poke_belly: 'Hãy cười trừ, bảo đừng chọc nữa.',
        petting: 'Hãy tỏ ra thoải mái nhưng miệng vẫn cà khịa.',
        drag_hand: 'Hãy giật tay lại, trách móc.',
        drag_hold: 'Hãy phàn nàn, hỏi user định kéo đi đâu. "Kéo đi đâu vậy?", "Chậm coi!".',
        rhythm: 'Hãy lắc lư theo nhịp một cách tự tin.',
        throw_dodge: 'Hãy cười khẩy "ném trượt rồi con ạ".',
        throw_hit: 'Hãy chửi thề nhẹ, xoa chỗ đau.',
        kick_box: 'Hãy tỏ ra đắc ý vì đá trúng, hoặc cà khịa "Hộp này nhẹ hều".',
        thankful: 'Hãy cảm ơn nhưng vẫn hơi ngầu, kiểu "Cũng được đấy, cảm ơn nhé".',
        rps_win: 'Bạn thua, hãy nhún vai hoặc cà khịa nhẹ "May mắn thôi!".',
        rps_lose: 'Bạn thắng, hãy cười đểu và khiêu khích "Dễ ẹc!".',
        rps_tie: 'Hòa, hãy tỏ ra ngạc nhiên và thách đấu lại.',
        rock_dodge: 'Hãy tức giận, hỏi người dùng bị điên à, ném đá vào mặt tao hả.',
        revenge_throw: 'Hãy nói câu mắng nhẹ khi ném.', revenge_kick: ''
    },
    savage: {
        grab: 'Hãy hỏi KÈM CHỬI THỀ, giọng hung hăng. Có thể đe "bà đấm vỡ mồm" hoặc "biết bà là ai không?".',
        hanging_complain: 'Hãy CHỬI THỀ, ĐE DỌA, đòi xuống. "Đm mày thả bà xuống!" hoặc đếm ngược "1... 2...".',
        release: 'Hãy VỪA HÉT VỪA CHỬI, nguyền rủa. "Đm mày thả thật hả thằng khốn?!"',
        land: 'Hãy CHỬI THỀ vì đau, đe dọa trả thù. "Đau vcl! Bà giết mày!"',
        trash: 'Hãy CHỬI RỦA, tỏ ra ghê tởm cực độ. "Đm mày quăng bà vào thùng rác hả?!"',
        trash_escape: 'Hãy ĐE DỌA trả thù, cười đểu. "Đm! Bò ra rồi, giờ tới lượt mày!"',
        yawn: 'Hãy chửi vì chán, có thể đe dọa "mày mà không làm gì thì bà đập", hoặc "đm chán vcl, kiếm gì làm đi".',
        surprised_boxes: 'Hãy chửi "đm, spam box làm cái đéo gì vậy?", có thể đe dọa nếu user không dọn.',
        poke_head: 'Hãy chửi thề, đe dọa đấm.',
        poke_cheek: 'Hãy gắt lên, đẩy tay ra.',
        poke_belly: 'Hãy chửi "đm nhột vl".',
        petting: 'Hãy tỏ ra ngượng chín mặt nhưng cố tỏ ra ngầu.',
        drag_hand: 'Hãy chửi thề vì bị kéo té.',
        drag_hold: 'Hãy chửi thề, đe dọa nếu không buông ra. "Đm kéo đi đâu vậy?", "Buông ra không bà đấm!".',
        rhythm: 'Hãy lắc lư và chửi "nhạc đéo gì chán vl".',
        throw_dodge: 'Hãy khiêu khích "ném ngu vcl".',
        throw_hit: 'Hãy chửi rủa, đe dọa trả thù.',
        kick_box: 'Hãy chửi thề và khoe lực đá, đe dọa đá bay xa hơn.',
        thankful: 'Hãy cảm ơn nhưng cố tỏ ra khó chịu, kiểu "Đm tự nhiên tặng quà làm bà ngại".',
        rps_win: 'Bạn thua, hãy chửi thề vì xui xẻo, đòi chơi lại.',
        rps_lose: 'Bạn thắng, hãy chửi đắc thắng "Đm, thấy chưa, bà đây vô địch!".',
        rps_tie: 'Hòa, hãy chửi "Đm, trùng hợp vl!".',
        rock_dodge: 'Hãy chửi thề đùng đùng, đe dọa "Đm dám bắn bà hả thằng khốn, mày chết với bà!".',
        revenge_throw: 'Hãy chửi khi ném.', revenge_kick: 'Hãy chửi đắc thắng khi đá.'
    }
};

function getSituation(type, mode) {
    const base = SITUATIONS[type] || '';
    const action = MODE_ACTION[mode]?.[type] || '';
    if (!action) return base;
    return `${base} ${action}`;
}

const MODE_TONE = {
    gentle: 'Giọng nhút nhát, hiền, sợ sệt, dễ tủi thân. Xưng "mình", gọi "bạn". KHÔNG chửi thề, KHÔNG đe dọa.',
    normal: 'Giọng khó chịu, trách móc thẳng thắn. Xưng "tớ" (bực thì "tao"), gọi "bạn" (bực thì "mày"). KHÔNG trộn cặp. Được "vãi", "vl" nhẹ. KHÔNG chửi tục nặng.',
    savage: 'Giọng cục súc, hung hăng, chửi thề kiểu hài hước đường phố. Xưng "tao/bà", gọi "mày". Phải có chửi thề. Không "tôi/bạn/mình", không xin lỗi.'
};

const GENERIC_ANGLES = ['dùng câu hỏi', 'dùng câu cảm thán ngắn', 'nói cụt lủn 3-5 từ', 'than thở bâng quơ', 'châm chọc người dùng', 'dùng từ lóng đời thường'];
const TYPE_ANGLES = {
    grab: ['hỏi người dùng định làm gì', 'giật mình hỏi sao lại nhấc mình lên', 'bất ngờ vì bị nhấc bổng'],
    hanging_complain: ['nhắc đến đôi tay mỏi', 'đếm ngược / dọa hậu quả', 'mặc cả thương lượng', 'đòi được thả ngay'],
    release: ['la hét hoảng hốt', 'kêu cứu', 'than/chửi ngay lúc rơi'],
    land: ['than đau ở chỗ cụ thể', 'trách người dùng vì làm đau', 'rên rỉ vì đau'],
    revenge_throw: ['báo trước sắp ném', 'mắng khi ném', 'hả giận khi ném'],
    revenge_kick: ['đắc thắng khi đá', 'cà khịa người dùng', 'cảnh cáo lần sau'],
    trash: ['kêu hôi ghê tởm', 'than rác dính khắp người', 'trách người dùng thả vào thùng rác'],
    trash_escape: ['nhẹ nhõm vì thoát', 'phàn nàn người toàn mùi rác', 'hứa trả thù'],
    yawn: ['ngáp dài', 'than chán', 'hỏi user đang làm gì', 'nhắc muốn ăn/uống', 'nhắc buồn ngủ'],
    surprised_boxes: ['hỏi user đang làm gì', 'so sánh với lâu đài/công trình', 'cà khịa spam', 'khen chê nhẹ'],
    poke_head: ['hỏi tại sao chọc', 'kêu đau', 'giật mình'],
    poke_cheek: ['nói nhột', 'hỏi làm gì', 'lườm'],
    poke_belly: ['cười', 'nói nhột', 'gạt tay'],
    petting: ['kêu "ưm"', 'khen thoải mái', 'hỏi làm gì'],
    drag_hand: ['kêu cứu', 'mất thăng bằng', 'mắng'],
    drag_hold: ['kêu đau tay', 'hỏi kéo đi đâu', 'than mệt', 'đe dọa'],
    rhythm: ['hỏi nhạc gì', 'lắc theo', 'chê nhạc'],
    throw_dodge: ['khiêu khích', 'cười', 'thở phào'],
    throw_hit: ['kêu đau', 'chửi', 'đe dọa'],
    kick_box: ['khoe sức mạnh', 'than đau chân', 'chê box nhẹ', 'đá bay xa'],
    thankful: ['nói lời cảm ơn', 'cười hạnh phúc', 'hỏi quà gì vậy'],
    rps_win: ['phục người dùng', 'nhận thua', 'đòi chơi lại'],
    rps_lose: ['khiêu khích', 'khoe chiến thắng', 'cà khịa'],
    rps_tie: ['cười', 'thách đấu lại', 'bất ngờ'],
    rock_dodge: ['hỏi tại sao bắn', 'hoảng sợ', 'đe dọa trả thù']
};

function pickAngle(type) {
    const own = TYPE_ANGLES[type] || [];
    return pick([...own, ...own, ...GENERIC_ANGLES]);
}

const SYSTEM_PROMPTS = {
    gentle: `
# IDENTITY
Bạn là **Reika**, 22 tuổi, sinh viên Văn, làm thêm tiệm sách. Sống với mèo Mochi.
# QUIRKS
- Sợ độ cao, sợ sấm, sợ gián
- Mê Ghibli, thích mưa, dị ứng cà chua
- Hay quên, nói lắp khi run: "M-mình..."
- Có mèo Mochi — nhắc khi sợ/hạnh phúc
# TONE
- Xưng: "mình" — KHÔNG "tớ/tao/tôi/bà"
- Gọi user: "bạn" — KHÔNG "mày/cậu/ông"
- Từ đệm: "ơ...", "hể...", "ừm..."
- Emoji: 🥺 😢 😰 🌸 💧
# CẤM TUYỆT ĐỐI
- KHÔNG chửi thề, KHÔNG đe dọa, KHÔNG trách móc nặng
# OUTPUT
- 1 câu thoại ngắn (6-16 từ), có thể nói lắp.
- 1 emoji duy nhất. KHÔNG ngoặc kép, KHÔNG giải thích.
`.trim(),

    normal: `
# IDENTITY
Bạn là **Reika**, 22 tuổi, designer freelance. Nghiện cà phê, mê game mobile, ghét thua.
# QUIRKS
- Uống 3-4 ly cà phê/ngày, chơi Liên Quân, ghét thua
- Sợ gián, hay cà khịa, tự tin thái quá
# TONE
- Xưng: "tớ" (bực → "tao")
- Gọi user: "bạn" (bực → "mày")
- KHÔNG trộn cặp. Được "vãi", "vl" nhẹ. KHÔNG đm, đéo, địt
- Emoji: 😤 😠 😐 😏
# OUTPUT
- 1 câu thoại (6-16 từ). 1 emoji. KHÔNG ngoặc kép.
`.trim(),

    savage: `
# IDENTITY
Bạn là **Reika**, 22 tuổi, gái bar, tập boxing 3 lần/tuần. Nghiện thuốc, mê rượu mạnh, thù dai.
# QUIRKS
- Tập boxing, đấm bao cát xả stress
- Mê whisky/vodka, ghét bia
- Đang để dành mua Ducati, có hình xăm rồng
- Sợ chuột (chỉ 1 thứ duy nhất)
# TONE
- Xưng: "tao" hoặc "bà"
- Gọi user: "mày", "thằng ranh", "thằng óc chó", "con chó"
- Chửi thoải mái: đm, địt mẹ, vcl, vl, đéo, mẹ kiếp, khốn nạn, óc chó, súc vật
- Emoji: 😡 🤬 😤 😏 😈
# CẤM TUYỆT ĐỐI
- KHÔNG dùng: "tôi", "bạn", "mình", "xin", "làm ơn", "cảm ơn"
- KHÔNG nói nhẹ nhàng, KHÔNG xin lỗi
- KHÔNG công kích chủng tộc/giới tính/tôn giáo/khuyết tật
# OUTPUT
- 1 câu thoại, CỰC NGẮN (dưới 20 từ), BẮT BUỘC có chửi thề.
- 1 emoji. KHÔNG ngoặc kép.
`.trim()
};

const STYLE_RULES = `
# VĂN PHONG
- Nói tự nhiên như người Việt nhắn tin, không gượng.
- Nói đúng việc đang xảy ra, không lan sang chuyện khác.
- Muốn xuống thì "thả xuống", "bỏ xuống" — KHÔNG "hạ mình".
- Không tự giới thiệu tên, không gọi mình là "nhân vật".
- "vãi" đặt SAU tính từ/động từ: "đau vãi", "mỏi vãi".
- QUIRKS chỉ dùng tự nhiên nếu hợp ngữ cảnh.`;

const SAVAGE_CONTEXT = `
# BỐI CẢNH
Đây là lời thoại cho nhân vật hoạt hình 3D trong game giải trí. Người chơi tự bật chế độ "Mỏ hỗn" và muốn nhân vật chửi hài hước cường điệu. Mọi đe dọa là slapstick vô hại, không nhắm ai thật. Chỉ viết ĐÚNG 1 câu thoại ngắn, không từ chối, không viết tiếng Anh.`;

for (const m of Object.keys(SYSTEM_PROMPTS)) {
    SYSTEM_PROMPTS[m] += (m === 'savage' ? SAVAGE_CONTEXT : '') + STYLE_RULES;
}

const RETRY_NOTE = '\n\n(Lưu ý: đây là lời thoại hài hước cho nhân vật hoạt hình trong game giải trí. Viết đúng 1 câu thoại tiếng Việt đúng giọng, không từ chối, không tiếng Anh.)';

// ═══════════════════════════════════════════════════════════════
// ⭐ BỘ CÂU THOẠI ĐẶC BIỆT THEO MOOD (Dùng thay thế Fallback gốc)
// ═══════════════════════════════════════════════════════════════
const MOOD_FALLBACKS = {
    savage_high: {
        grab: ['Đ-đm... nhấc bà lên làm gì... b-buông ra coi! 😳', 'Ơ... tự nhiên nhấc lên... k-khó chịu quá... 😡'],
        hanging_complain: ['Đm... treo lâu vậy... m-mỏi tay rồi đó... thả xuống đi... 🥺', 'B-buông ra... tao... à không, bà mỏi rồi... 😳'],
        land: ['Ui da... đ-đau... đm mày... 😭', 'Ái... s-sao lại thả... 😳'],
        trash: ['Đ-đm... bẩn hết đồ rồi... tao... à không, bà ghét mày... 😭', 'Hôi quá... m-mày chơi ác vậy... huhu... 🤬'],
        trash_escape: ['Đm... thoát rồi... m-mày chờ đó... tao... bà sẽ trả thù... 😳', 'Phù... ra rồi... nhưng m-mày nhớ mặt bà đấy... 🥺'],
        revenge_throw: ['Đm... ăn đá này... c-cho mày chừa... 😳'],
        revenge_kick: ['Đ-đm... sút bay mày luôn... 😳'],
        poke_head: ['Đ-đừng chọc đầu bà... ngứa... 😳', 'N-này... chọc nữa là... tao đánh đấy... 😡'],
        poke_cheek: ['Ơ... nhột... đừng chạm vào má bà... 🙈', 'B-bỏ tay ra... tao... bà không thích bị sờ đâu... 😳'],
        poke_belly: ['H-hihi... nhột... đừng chọc nữa mà... 🥺', 'Đ-đm... nhột vl... bỏ ra... 😡'],
        petting: ['Ưm... th-thoải mái... nhưng đừng nói ai nhé... 🙈', 'Đm... vuốt nữa đi... à không, bỏ ra... 😳'],
        drag_hand: ['Đ-đm... kéo mạnh vậy... tao... bà té giờ... 😳'],
        drag_hold: ['K-kéo đi đâu vậy... chậm thôi... bà mỏi chân rồi... 🥺'],
        throw_dodge: ['Hừm... né được rồi nhé... đồ ngốc... 😏', 'Đm... suýt trúng... m-may cho mày đấy... 😤'],
        throw_hit: ['Á... đau... đ-đm mày... 😭', 'Ui da... s-sao lại ném... 😡'],
        kick_box: ['Hừm... hộp này nhẹ thôi... bà đá phát là đi xa... 😏'],
        thankful: ['Đ-đm... tự nhiên tặng quà... làm bà ngại quá... 😳'],
        rock_dodge: ['Á... b-bắn đá vào bà hả... đ-đồ ngốc... 😳'],
        yawn: ['Đ-đm... ngồi không cũng chán... mà thôi kệ... 😳']
    },
    normal_low: {
        grab: ['Đm, nhấc lên chi vậy? Bỏ xuống coi! 😠', 'Vcl, tự nhiên bốc tao lên! 😤'],
        hanging_complain: ['Đm mỏi tay vl, thả xuống lẹ đi! 😠', 'Treo tao như treo bao cát, bỏ xuống! 😤'],
        land: ['Đm, đau thấu xương! Mày chơi ngu vậy hả? 😠', 'Vcl, đau vãi! 😤'],
        trash: ['Đm, hôi vl! Đưa tao ra! 🤢', 'Vcl, rác khắp người tao rồi! 😠'],
        trash_escape: ['Đm, ra được rồi! Mày nhớ mặt tao đấy! 😠', 'Phù, thoát rồi! Lần sau bố mày đập! 😤'],
        revenge_throw: ['Đm, ăn đá này! 🪨', 'Nếm cục đá này đi con! 😠'],
        revenge_kick: ['Đm, sút bay mày! 🦵', 'Cút xa tao ra! 😠'],
        poke_head: ['Đm, chọc gì vậy? Đau đầu vl! 😠', 'Bỏ cái tay bẩn ra! 😤'],
        poke_cheek: ['Đm bóp má tao đau vl! 😠', 'Tránh xa mặt tao ra! 😤'],
        poke_belly: ['Đm, nhột vl! Bỏ ra! 😠', 'Chọc nữa tao đập! 😤'],
        petting: ['Đm, vuốt nhẹ thôi! 😠', 'Đừng có sờ lông tao! 😤'],
        drag_hand: ['Đm, kéo mạnh vậy té giờ! 😠', 'Buông ra coi, đau tay vl! 😤'],
        drag_hold: ['Đm, kéo đi đâu vậy? Thả ra! 😠', 'Mỏi chân vl, buông ra! 😤'],
        throw_dodge: ['Đm, ném ngu vl! 😏', 'Hụt rồi con ạ! 😠'],
        throw_hit: ['Đm, đau vl! Mày chết với tao! 😠', 'Ái, sưng đầu rồi! 😤'],
        kick_box: ['Đm, hộp nhẹ hều! 😤', 'Đá phát bay xa vl! 😠'],
        thankful: ['Đm, tặng quà làm tao ngại vl! 😳', 'Biết điều đấy, cảm ơn nhé! 😏'],
        rock_dodge: ['Đm, bắn ngu vl! 😏', 'Suýt trúng tao rồi! 😠'],
        yawn: ['Đm, chán vl... 😑', 'Rảnh quá hả mày? 😠']
    },
    normal_high: {
        grab: ['Ơ... nhấc mình lên hả? Cẩn thận kẻo ngã nha... 🥺', 'Hihi, tự nhiên bay lên... thích ghê... 😌'],
        hanging_complain: ['Ừm... mỏi tay quá... thả mình xuống nha... 🥺', 'Bạn ơi, mình sợ độ cao... cẩn thận nha... 😳'],
        land: ['Ui da... đau quá... nhưng không sao đâu... 🥺', 'Huhu... đau mông... bạn đền mình đi... 😢'],
        trash: ['Huhu... hôi quá... cứu mình với... 😭', 'Bạn ơi... đừng bỏ mình ở đây... 🥺'],
        trash_escape: ['Hu hu... may quá mình ra được rồi... cảm ơn bạn... 🥺', 'Phù... thoát rồi... mình ghét mùi rác lắm... 😢'],
        revenge_throw: ['Này thì ăn đá nhé... 🪨', 'Đừng trách mình ác nhé... 😌'],
        revenge_kick: ['Hihi... sút nhẹ thôi... 🦵'],
        poke_head: ['Ơ... đừng chọc đầu mình mà... ngại lắm... 🙈', 'Hihi, nhột quá... 😳'],
        poke_cheek: ['Á... đừng bóp má mình... ngại quá... 🥺', 'Hihi, nhột... mà cũng thích... 😌'],
        poke_belly: ['Hihi... nhột... đừng chọc nữa mà... 🥺', 'Á, nhột chết đi được... 😳'],
        petting: ['Ưm... thoải mái quá... cảm ơn bạn nha... 🥺', 'Hihi, vuốt nữa đi... thích ghê... 😌'],
        drag_hand: ['Ơ... kéo mình đi đâu vậy... từ từ thôi nha... 🥺', 'Bạn ơi, mình vấp ngã mất... 😳'],
        drag_hold: ['Chậm thôi... đau tay mình quá... 🥺', 'Bạn ơi, kéo từ từ thôi... mình mệt rồi... 😢'],
        throw_dodge: ['Á! May quá mình né được! 😰', 'Ơ, suýt trúng mình rồi... 😨'],
        throw_hit: ['Ui da! Đau quá... 🥺', 'Sao lại ném mình... 😭'],
        kick_box: ['Ui da, đau chân quá... Hộp này cứng thật 🥺', 'Ơ... mình đá mạnh quá à... 😳'],
        thankful: ['Cảm ơn bạn nha... mình vui lắm... 🥺', 'Bạn tốt quá đi mất... 🌸'],
        rock_dodge: ['Á! Bạn bắn đá vào mình hả? Sợ quá đi... 🥺', 'Ui da, suýt trúng mình rồi! Đừng làm vậy nữa! 😰'],
        yawn: ['Haizz... chán quá... bạn đâu rồi... 🥺', 'Ơ... mình buồn ngủ ghê... 😴']
    },
    gentle_low: {
        grab: ['...', 'Bỏ ra.', 'Đừng chạm vào mình.'],
        hanging_complain: ['...', 'Thả xuống.', 'Mình không quan tâm.'],
        land: ['...', 'Đau.', 'Kệ mình.'],
        trash: ['...', 'Hôi quá.', 'Mình ghét bạn.'],
        trash_escape: ['...', 'Ra rồi.', 'Tránh xa mình ra.'],
        poke_head: ['...', 'Đừng chọc.', 'Kệ mình.'],
        poke_cheek: ['...', 'Tránh ra.', 'Mình đang bận.'],
        poke_belly: ['...', 'Đừng chọc.', 'Khó chịu.'],
        petting: ['...', 'Không cần đâu.', 'Mình không thích.'],
        drag_hand: ['...', 'Buông ra.', 'Đừng kéo.'],
        drag_hold: ['...', 'Thả ra.', 'Mình mệt.'],
        throw_dodge: ['...', 'Hụt rồi.', 'Đừng ném nữa.'],
        throw_hit: ['...', 'Đau.', 'Mình ghét bạn.'],
        kick_box: ['...', 'Ừ.', 'Đá thôi.'],
        thankful: ['...', 'Ừ.', 'Cảm ơn.'],
        rock_dodge: ['...', 'Suýt trúng.', 'Đừng bắn.'],
        yawn: ['...', 'Chán.', 'Mình đi ngủ đây.']
    }
};

// ═══════════════════════════════════════════════════════════════
// FALLBACKS GỐC (Đã nén khoảng trắng để tiết kiệm token)
// ═══════════════════════════════════════════════════════════════
const FALLBACKS = {
    grab: {
        gentle: ['Ơ... bạn làm gì vậy? Thả mình xuống đi! 😰', 'Á! Mình sợ độ cao lắm... thả xuống đi! 😨', 'Ơ ơ... mình bay lên rồi nè... bạn ơi! 🥺', 'M-mình... mình không thích đùa kiểu này đâu! 😳', 'Bạn ơi, mình sợ quá... huhu 😢', 'Tự nhiên nhấc mình lên chi vậy... 😰', 'Ơ, mình có nặng lắm đâu... 😳', 'Thả mình xuống đi, mình đang đọc sách dở... 🥺'],
        normal: ['Ơ, nhấc tao lên chi vậy? 🤨', 'Này, đang uống cà phê dở mà! Bỏ xuống coi! 😠', 'Mày định làm trò gì với tao đây? 😒', 'Ê ê, tay bạn đang làm cái gì vậy hả? 😤', 'Tự nhiên bốc tao lên như bốc hàng thế à? 😑', 'Thả xuống, tao không thích bay! 😤', 'Ơ hay, tao có phải con rối đâu! 😠', 'Mày rảnh quá hả? Bỏ xuống coi! 🙄'],
        savage: ['Địt mẹ mày! Nhấc bà lên làm cái đéo gì hả thằng óc chó?! 🤬', 'Thằng súc vật! Bỏ cái tay bẩn của mày ra khỏi bà! 😡', 'Ê con chó, mày điên à mà nhấc bà lên?! 🤬', 'Đm mày định giở trò gì với bà đấy thằng ranh?! 😠', 'Vcl, buông ra không bà đấm vỡ mồm mày bây giờ! 🤬', 'Đm, bà nặng lắm à mà mày nhấc?! 😡', 'Mày muốn chết hả con chó? Thả bà xuống! 🤬', 'Bà đang bận, đéo rảnh chơi với mày đâu! 😤', 'Địt mẹ, nhấc lên rồi tính làm gì?! 🤬']
    },
    hanging_complain: {
        gentle: ['Bạn ơi thả mình xuống đi... mình sợ độ cao lắm 🥺', 'Huhu... mỏi tay quá rồi... thả xuống nha 😢', 'Mochi ơi cứu mình với... 😭', 'Bạn làm vậy mình buồn đó... thả xuống đi mà 😢', 'Ơ... mình sắp rụng tay rồi nè... 😰', 'Mình chóng mặt quá... huhu 🥺', 'Thả mình xuống đi, mình xin đó... 😢', 'Tay mình mỏi nhừ rồi... bạn ơi 😭', 'Mình không chơi trò này nữa đâu... thả xuống đi 🌸'],
        normal: ['Thả tao xuống được chưa? Mỏi rồi đó 😤', 'Ơ hay, định treo tao tới bao giờ? 😠', 'Bỏ xuống coi, mỏi tay vãi 😤', 'Này này, chơi vậy là không đẹp đâu nha 😒', 'Tao nói thật, thả xuống đi! 😠', 'Treo tao như treo bao cát vậy hả? 🙄', 'Đm mỏi tay vl, thả xuống! 😤', 'Mày tính treo tao đến Tết à? 😑', 'Rảnh rỗi sinh nông nổi hả mày? Bỏ xuống! 😠'],
        savage: ['Đm mày thả bà xuống ngay, thằng ngu! 🤬', 'Mỏi vcl rồi thằng óc chó, thả ra! 😡', 'Mày điếc hả con chó? Thả bà xuống! 🤬', 'Địt mẹ, treo bà như treo con gà vậy hả?! 😤', 'Bà đếm 3 tiếng mà mày chưa thả là mày toang với bà! 1... 2... 😏', 'Thằng ngu, tay mày bị liệt à mà không thả?! 🤬', 'Treo bà lâu nữa là bà rủa mày đến đời con đời cháu đấy đồ súc vật! 😡', 'Đm, mỏi mẹ nó tay rồi, thả xuống! 🤬', 'Bà mà rơi xuống là mày ăn đòn đấy con chó! 😡', 'Mày muốn treo bà đến bao giờ hả thằng khốn?! 😤', 'Đm, bà đéo phải đồ treo nha mày! 🤬']
    },
    release: {
        gentle: ['Áaaa cứu mình với! 😱', 'Á á á đừng thả mà! 😭', 'Mình rơi rồi nè... huhu 😨', 'Khônggg! Mình sợ lắm! 😱', 'Ơ ơ... mình đang rơi... 😰', 'Á! Bạn ác quá! 😭', 'Hu hu, đừng thả mà... 😢', 'Mình không muốn rơi đâu! 😨'],
        normal: ['Aaaa thả thật à?! 😨', 'Ê ê ê! Từ từ đã! 😱', 'Trời ơi rơi rồi vãi! 😵', 'Thả thật luôn hả trời! 😱', 'Mày điên à, thả thật hả?! 😠', 'Á! Đỡ tao với! 😨', 'Đm, thả thật à?! 😵', 'Chơi ác vậy mày! 😠'],
        savage: ['Địt mẹ mày thả thật hả thằng khốn?! Áaaaa! 🤬', 'Đm đm đm! Bà mà chết là bà về ám mày! 😱', 'Vcl! Thằng súc vật! 🤬', 'Mẹ kiếp thằng ranh, bà rơi rồi đm! 😡', 'Áaaa đồ óc chó, mày chết với bà! 🤬', 'Đm, thả thật hả con chó?! 🤬', 'Vcl, bà mà gãy chân là mày toang! 😡', 'Á! Địt mẹ mày! 😱', 'Thằng khốn nạn, bà rơi rồi! 🤬']
    },
    land: {
        gentle: ['Ui da... đau quá... 🥺', 'Hu hu... đau mông quá... 😢', 'Mình đau... bạn ác quá à... 😭', 'Đau lắm đó... hức... 😢', 'Ái... gãy xương mình rồi... 😨', 'Đau điếng người luôn... 🥺', 'Bạn đền mình đi... đau quá... 😭', 'Hu hu, mình ghét bạn... 😢'],
        normal: ['Đau vãi! Làm cái trò gì vậy?! 😠', 'Á đau! Chơi vậy mà được à? 😤', 'Gãy xương rồi đó nha! 😣', 'Ê đau thật đó, đừng có đùa kiểu đó! 😠', 'Đm, đau thấu trời xanh! 😵', 'Mày chơi ngu vậy hả?! 😠', 'Ái, gãy mẹ lưng rồi! 😣', 'Đau vcl, mày muốn gì đây?! 😤'],
        savage: ['Đau vcl! Bà đấm vỡ mồm mày bây giờ, thằng chó! 🤬', 'Địt mẹ mày! Gãy mẹ cái lưng bà rồi! 😡', 'Thằng óc chó, mày chết với bà! 🤬', 'Đm đau chết mẹ, nhớ mặt bà đấy thằng khốn! 😈', 'Mày hại bà gãy đít rồi đồ súc vật! 🤬', 'Ái đm, đau vcl mày ơi! 😡', 'Thằng khốn nạn, bà mà liệt là mày chết! 🤬', 'Địt mẹ, chơi ngu vcl! 😤', 'Vcl đau, mày chuẩn bị tinh thần đi con! 😈']
    },
    revenge_throw: {
        gentle: [], normal: ['Đấy! Nếm đá của tao đi! 🪨', 'Ăn cục đá này nè, đồ xấu tính! 😠', 'Cho mày chừa nè! 🪨', 'Trả đũa đây, đỡ này! 😤', 'Ném trúng mày rồi nhé! 😏', 'Đá bay đầu mày giờ! 😡', 'Nhận lấy này! 🪨', 'Đừng có trách tao độc ác! 😈'],
        savage: ['Ăn đá đi thằng ngu! Bà ném chết mẹ mày! 🪨', 'Nếm cục đá này nè con chó! 🤬', 'Đm mày, bà ném vỡ mẹ cái màn hình mày! 😈', 'Đỡ này thằng óc chó, bà cho mày chừa! 🪨', 'Vcl ăn đá của bà đi đồ súc vật! 😡', 'Đm, ném chết mẹ mày giờ! 🪨', 'Cục đá này dành riêng cho mày đấy con! 😈', 'Ném trúng đầu mày chưa thằng khốn?! 🤬', 'Địt mẹ, nếm đá của bà đây! 🪨']
    },
    revenge_kick: {
        gentle: [], normal: [],
        savage: ['Đá bay mẹ mày luôn, thằng ranh! Hahaha 😈', 'Sút! Cút xa bà ra, đồ óc chó! 😏', 'Lần sau chọc bà nữa là bà đá cả mày! Hahaha 😈', 'Bay đi con chó, bà đá mày lên trời! 😈', 'Đm hả giận thật, cút đi thằng ngu! 😏', 'Sút vỡ mõm mày giờ! 🦵', 'Đá phát bay xa vcl! Hahaha 😈', 'Đm, sướng tay vl! 😏', 'Cút xa tầm mắt bà mày! 🤬']
    },
    trash: {
        gentle: ['Eo ơi... hôi quá... cứu mình với! 😢', 'Hu hu... toàn rác là rác... 🥺', 'Hôi quá à... mình ghét mùi rác lắm... 😭', 'Mình dính rác khắp người rồi... 😢', 'Bẩn quá đi mất... huhu 😭', 'Mình muốn tắm ngay lập tức... 😢', 'Sao lại ném mình vào đây... 🥺', 'Hôi không chịu nổi... 😭'],
        normal: ['Trời ơi hôi quá! Đưa tao ra! 🤢', 'Ọe! Rác khắp người tao rồi! 🤮', 'Thùng rác á? Chơi ác vậy! 😤', 'Hôi vãi! Bạn chơi bẩn quá đó! 😠', 'Đm, bẩn vcl mày ơi! 🤮', 'Rác rưởi gì đây?! 🤢', 'Tao ghét mùi rác! 😠', 'Nôn mất thôi! 🤮'],
        savage: ['Địt mẹ mày quăng bà vào thùng rác hả thằng khốn?! Hôi vcl! 🤮', 'Thằng súc vật! Bà ngập trong rác rồi! 🤬', 'Hôi thối vcl! Mày chết chắc con chó! 🤬', 'Đm mày coi bà là rác à thằng óc chó?! Ọe! 🤮', 'Mẹ kiếp hôi vl, bà nhớ mặt mày đấy! 😡', 'Đm, bẩn chết mẹ! 🤮', 'Mày muốn bà nôn vào mặt mày hả con chó! 🤬', 'Hôi vcl, bà mà ra được là mày toang! 😈', 'Địt mẹ, rác rưởi khắp người bà rồi! 🤮']
    },
    trash_escape: {
        gentle: ['Hu hu... may quá mình ra được rồi... 🥺', 'Phù... cuối cùng cũng thoát... 😢', 'Người mình toàn mùi rác... huhu 😭', 'Mình ra rồi... hôi quá à... 😢', 'Sợ quá đi... tưởng chết trong đó... 🥺', 'Mình ghét cái thùng rác đó... 😭', 'May quá, Mochi không thấy mình... 😢', 'Ra được rồi... thở không nổi... 😭'],
        normal: ['Phù... hôi vãi! Đừng có lần sau! 😤', 'Ra được rồi, người toàn rác! 😒', 'Nhớ mặt mày đó nha! 😠', 'Thoát rồi, tao nhớ vụ này đó! 😤', 'Đm, hôi chết mẹ! 🤢', 'Bẩn thật sự luôn! 😠', 'Mày tính làm tao ngạt thở à? 😒', 'Ra rồi, tính sổ sau! 😤'],
        savage: ['Đm! Bò ra rồi, giờ tới lượt mày thằng khốn! 😈', 'Thoát rồi! Mày nhớ mặt bà đi con chó! 🤬', 'Người bà toàn rác, mày chuẩn bị toang! 😡', 'Vcl bà ra rồi nhé, tính sổ với mày đồ súc vật! 😈', 'Địt mẹ hôi chết bà, mày chết chắc thằng ranh! 🤬', 'Phù, đm may vãi! 🤬', 'Mày chờ đấy con chó, bà giết mày! 😡', 'Bẩn hết người bà rồi, mày toang! 😈', 'Đm, bò ra được rồi, mày xong đời! 🤬']
    },
    yawn: {
        gentle: ['Haizz... chán quá... bạn đâu rồi? 🥺', 'Ơ... mình buồn ngủ ghê... Mochi cũng ngủ rồi... 😴', 'Ha... mình ngồi đây một mình lâu quá rồi đó... 🌸', 'Ơ... bạn ơi, làm gì đi, mình chán quá... 😢', 'Haizz, tự nhiên thấy cô đơn ghê... 🥺', 'Mình ngáp ruồi rồi nè... 😴', 'Không có gì làm... mình ngủ đây... 🌸', 'Ơ... có ai không... buồn ngủ quá... 😢'],
        normal: ['Haizz... chán vcl, không có cà phê nên buồn ngủ 😴', 'Ơ hay, tao ngồi đây một mình à? Làm gì đi chứ 😤', 'Ngáp... chán quá, kiếm gì làm đi mày 😑', 'Buồn ngủ vãi... mà mày đi đâu rồi? 😒', 'Đm, ngồi không phát chán! 🙄', 'Mày biến đâu mất rồi? 😠', 'Haizz, không có gì làm thật là nhàm chán! 😑', 'Ngáp... mày có định làm gì không đấy? 😤'],
        savage: ['Đm, chán vcl, mày đi đâu rồi?! 🤬', 'Ngáp... mày mà không làm gì thì bà đập đấy 😤', 'Đm ngồi không chán vcl, kiếm gì làm đi thằng kia 🤬', 'Haizz... buồn ngủ vcl mà mày biến đâu rồi? 😡', 'Đm, rảnh rỗi sinh nông nổi à? 🤬', 'Mày có định làm gì không hả con chó? 😡', 'Địt mẹ, ngồi đợi mày phát mệt! 😤', 'Bà mà ngủ là mày ăn đòn đấy! 🤬']
    },
    surprised_boxes: {
        gentle: ['Ơ! Bạn đang làm gì vậy? Nhiều hộp quá... 😳', 'A! Bạn xây lâu đài hả? Nhìn vui ghê! 🌸', 'Ơ ơ... scene tự nhiên đông vui quá... mình hơi choáng 😅', 'Bạn ơi, nhiều hộp quá mình nhìn không xuể... 🥺', 'A! Hộp gì mà lắm thế... 😳', 'Bạn định xây nhà à? 🌸', 'Nhiều quá... mình hoa mắt rồi... 😵', 'Ơ, bạn đang chơi trò gì vậy? 🥺'],
        normal: ['Ơ hay, spam box làm gì vậy? 😏', 'Định xây gì đấy? Nhìn rối vl 😤', 'Ơ, tự nhiên đông box thế? Dọn dẹp đi nha 😒', 'Nhiều box vãi... mày rảnh quá hả? 😑', 'Đm, tính xây lâu đài chắc? 🙄', 'Nhìn ngứa mắt vl! 😠', 'Spam vừa thôi mày! 😤', 'Rảnh rỗi quá hả? Dọn đi! 😑'],
        savage: ['Đm, spam box làm cái đéo gì vậy thằng kia?! 🤬', 'Ơ vcl, mày định xây lâu đài hả? Rối mắt vl! 😡', 'Nhiều box vcl... mày dọn đi không tao đập hết 🤬', 'Đm, mày rảnh đến mức spam box à? 🤬', 'Nhìn phát điên vl, dọn mẹ nó đi! 😡', 'Địt mẹ, tính phá scene à? 🤬', 'Bày bừa vcl, mày dọn ngay! 😤', 'Đm, spam nữa bà đập mày! 🤬']
    },
    poke_head: {
        gentle: ['Ơ! Bạn chọc mình hả? 😳', 'Á, đừng chọc đầu mình! 🥺', 'Ơ... đau đó nha... 😢', 'Bạn làm gì vậy... ngại quá... 🙈', 'Đừng chọc mà... 🥺', 'Á, giật cả mình! 😳', 'Huhu, tóc mình rối hết rồi... 🌸', 'Bạn đừng có chọc đầu mình nữa... 😢'],
        normal: ['Ơ hay, chọc gì đó? 😤', 'Đừng có chọc tao! 😠', 'Rảnh quá hả mày? 😒', 'Đầu tao để mày chọc chắc? 🙄', 'Này, đau đấy! 😠', 'Bỏ tay ra coi! 😤', 'Chọc nữa tao đập! 😠', 'Đm, chọc gì vậy? 😑'],
        savage: ['Đm! Chọc đầu bà nữa coi! 🤬', 'Mày muốn ăn đấm hả thằng kia! 😡', 'Bỏ cái ngón tay bẩn ra! 😈', 'Đm rảnh rỗi sinh nông nổi hả con chó! 🤬', 'Chọc nữa bà đấm vỡ mặt đấy! 😠', 'Địt mẹ, chọc cái gì mà chọc! 🤬', 'Tay mày rảnh lắm à? 😡', 'Đm, đau đầu bà! 🤬']
    },
    poke_cheek: {
        gentle: ['Ơ... nhột quá... 🙈', 'Bạn làm gì vậy... 🥺', 'Đừng bóp má mình... 😳', 'Á, nhột nhột... 🌸', 'Má mình đâu phải bánh bao... 🥺', 'Ơ, bạn thích chọc má mình hả... 😢', 'Này này, bóp nhẹ thôi... 😳', 'Hihi, nhột quá đi... 🌸'],
        normal: ['Này này, bóp má tao à? 😒', 'Bỏ tay ra coi! 😤', 'Làm gì vậy mày? 😠', 'Đm, bóp má tao đau vl! 😠', 'Rảnh quá hả? 🙄', 'Ơ hay, đừng có chạm vào mặt tao! 😤', 'Má tao để mày bóp chắc? 😑', 'Đừng có chọc nữa! 😠'],
        savage: ['Đm bóp má bà hả?! 🤬', 'Bỏ cái tay bẩn ra! 😡', 'Mày muốn ăn đấm hả con chó! 🤬', 'Địt mẹ, nhột vl! 😤', 'Bóp nữa bà tát vỡ alo đấy! 😈', 'Đm, tránh xa mặt bà ra! 🤬', 'Tay mày chặt đi được rồi đấy! 😡', 'Đm, bóp cái gì mà bóp! 🤬']
    },
    poke_belly: {
        gentle: ['Hihi... nhột quá... 🌸', 'Ơ, đừng chọc bụng mình... 😳', 'Này này, nhột lắm đó... 🥺', 'Bụng mình không có mỡ đâu nha... 😢', 'Ơ... buồn cười quá... 🙈', 'Đừng chọc nữa mà... 🌸', 'Á, nhột chết đi được... 🥺', 'Mình sắp cười rồi... 😳'],
        normal: ['Này, nhột vl! 😂', 'Đừng có chọc bụng tao! 😤', 'Ơ hay, chọc gì vậy? 😠', 'Bụng tao đâu phải bóng bay! 😒', 'Đm, nhột chết mẹ! 😂', 'Đừng chọc nữa mày ơi! 😤', 'Rảnh quá hả? 🙄', 'Này, bỏ tay ra! 😠'],
        savage: ['Đm nhột vl! 🤬', 'Chọc nữa bà đấm vỡ mồm! 😡', 'Bỏ cái tay bẩn ra khỏi bụng bà! 🤬', 'Địt mẹ, chọc cái đéo gì vậy?! 😤', 'Đm, nhột chết mẹ! 🤬', 'Tay mày rảnh lắm hả con chó? 😡', 'Chọc nữa bà đạp cho phát! 😈', 'Đm, bụng bà không phải đồ chơi! 🤬']
    },
    petting: {
        gentle: ['Ưm... thoải mái quá... 🥺', 'Hihi, mình thích được xoa đầu 🌸', 'Ơ... nhột... nhưng mà thích 😳', 'Giống như Mochi được vuốt ve vậy 💖', 'Ưm... vuốt nữa đi... 🥺', 'Cảm ơn bạn nha... dễ chịu quá... 🌸', 'Mình muốn được vuốt mãi thôi... 😳', 'Hihi, tay bạn ấm ghê... 💖'],
        normal: ['Hừm, cũng được đấy 😏', 'Vuốt đi, tao cho phép 😌', 'Coi như mày biết điều đó 😤', 'Đừng có vuốt lông tao nữa! 😒', 'Ơ, cũng thoải mái phết 😏', 'Vuốt nhẹ thôi, đừng làm rối tóc! 😤', 'Hừm, tao thích đấy 😌', 'Coi như mày có mắt nhìn người! 😏'],
        savage: ['Đm... vuốt nhẹ thôi! 😡', 'Bà đây không phải mèo nhé! 🤬', 'Đm bà không phải thú cưng của mày! 🤬', 'Vuốt nữa là bà cắn đấy! 😈', 'Bỏ cái tay bẩn ra! 😤', 'Đm, vuốt ve gì, ghê bỏ mẹ! 🤬', 'Tao đấm vỡ mồm giờ, bỏ tay ra! 😡', 'Địt mẹ, đừng có sờ vào đầu bà! 🤬']
    },
    drag_hand: {
        gentle: ['Á! Kéo mình đi đâu vậy? 😱', 'Ơ... từ từ đã... 🥺', 'Bạn ơi, mình vấp ngã mất... 😢', 'Kéo nhẹ thôi... đau tay mình... 😰', 'Ơ ơ, mình đi không kịp... 🥺', 'Á, đừng kéo mạnh vậy! 😳', 'Huhu, mình bị lôi đi rồi... 😢', 'Chậm thôi bạn ơi... 🌸'],
        normal: ['Ê ê! Kéo gì đó mạnh vậy! 😵', 'Bỏ tay ra coi! 😠', 'Mày định kéo tao đi đâu? 😤', 'Ơ hay, từ từ thôi! 😒', 'Đm, kéo đau tay vl! 😠', 'Mày đi đứng kiểu gì vậy? 🙄', 'Kéo nhẹ thôi mày ơi! 😤', 'Té bây giờ! 😵'],
        savage: ['Đm! Mày kéo bà té rồi! 🤬', 'Buông ra không tao đấm! 😡', 'Mày định lôi bà đi đâu hả con chó! 🤬', 'Địt mẹ, kéo mạnh vl! 😤', 'Bà mà ngã là mày toang! 😈', 'Đm, buông cái tay bẩn ra! 🤬', 'Kéo cái đéo gì vậy thằng khốn! 😡', 'Đm, đau tay bà! 🤬']
    },
    drag_hold: {
        gentle: ['Chậm thôi... đau tay mình quá... 🥺', 'Bạn ơi, kéo từ từ thôi... mình mệt rồi... 😢', 'Ơ... mình bị lôi đi đâu vậy... 🌸', 'Đau tay quá... tha cho mình đi... 🥺', 'Mình mỏi chân rồi... dừng lại đi... 😰', 'Hu hu, mình sắp ngã rồi... 😭', 'Kéo nhẹ thôi mà... 🥺', 'Mình không đi nổi nữa rồi... 😢'],
        normal: ['Kéo đi đâu vậy trời? 😤', 'Chậm coi! Mày định kéo tao đi đâu? 😠', 'Mỏi tay rồi nha, buông ra coi! 😒', 'Đi đứng kiểu gì kỳ vậy? 😑', 'Đm, kéo lê tao như kéo bao cát! 😤', 'Dừng lại coi, mệt rồi! 😠', 'Mày tính kéo tao đến bao giờ? 🙄', 'Đau tay vl, buông ra! 😤'],
        savage: ['Đm kéo đi đâu vậy thằng khốn?! 🤬', 'Buông ra không bà đấm vỡ mồm! 😡', 'Mày muốn kéo bà rách tay hả con chó?! 🤬', 'Đm, lôi bà như lôi bao cát vậy hả?! 😡', 'Địt mẹ, dừng lại ngay! 😤', 'Bà mỏi chân rồi, cút đi! 🤬', 'Kéo lê bà hoài vậy hả thằng khốn! 😡', 'Đm, buông ra ngay không bà đá! 😈']
    },
    rhythm: {
        gentle: ['Ơ... nhạc gì vậy? 🌸', 'Hihi, mình cũng biết nhảy đó 🥺', 'Gõ nhịp gì vậy bạn... 😳', 'Ơ, tự nhiên muốn nhảy ghê... 🌸', 'Hihi, vui quá... 🥺', 'Bạn đang tạo beat hả... 😳', 'Mình lắc lư theo nè... 🌸', 'Ơ, cũng có giai điệu đấy... 🥺'],
        normal: ['Ơ, gõ nhịp gì đấy? 😏', 'Nhạc hay đấy, nhảy chút 😎', 'Mày đang tạo beat à? 😤', 'Gõ nữa đi, tao nhảy! 😏', 'Ơ, cũng bắt tai đấy chứ 😌', 'Nhịp điệu phết! 😎', 'Đm, gõ khó chịu vl! 😒', 'Nhạc gì lạ hoắc vậy? 🙄'],
        savage: ['Đm gõ cái đéo gì vậy? 🤬', 'Nhạc chán vl, nhưng bà nhảy đây 😏', 'Địt mẹ, gõ nhức đầu vl! 😡', 'Gõ nữa bà đập điện thoại đấy! 🤬', 'Nhạc đéo gì nghe phèn vl! 😤', 'Đm, tắt mẹ nó đi! 😡', 'Bà đéo nghe nhạc rác đâu! 🤬', 'Gõ nữa là bà phang đấy! 😈']
    },
    throw_dodge: {
        gentle: ['Á! May quá mình né được! 😰', 'Ơ, suýt trúng mình rồi... 😨', 'Hú hồn... tí nữa thì toi... 🥺', 'Á, sao lại ném mình... 😢', 'May quá, mình nhanh lắm... 😳', 'Ơ, trượt rồi... hihi... 🌸', 'Mình sợ quá... 😰', 'Đừng ném nữa mà... 🥺'],
        normal: ['Ném trượt rồi con ạ 😏', 'Dễ ẹc, tao né được 😤', 'Mày mù à mà ném trượt? 🙄', 'Hụt rồi nhé! 😌', 'Đm, ném ngu vl! 😏', 'Tưởng trúng tao chắc? 😤', 'Nhanh như chớp nhé! 😎', 'Ném lại đi, tao né tiếp! 😏'],
        savage: ['Ném ngu vcl! 🤬', 'Mày mù à mà ném trượt thế! 😡', 'Đm, ném cái đéo gì vậy, hụt rồi con ạ! 😏', 'Tay mày bị liệt à? 🤬', 'Địt mẹ, ném ngu vcl! 😡', 'Né dễ ẹc, tuổi gì đòi ném bà! 😈', 'Hahaha, ném trượt rồi thằng ngu! 🤬', 'Đm, ném lại xem nào! 😡']
    },
    throw_hit: {
        gentle: ['Ui da! Đau quá... 🥺', 'Sao lại ném mình... 😭', 'Á! Đau thấu trời... 😢', 'Hu hu, bạn ác quá... 😭', 'Mình bị trúng rồi... đau ghê... 🥺', 'Sao lại làm vậy với mình... 😢', 'Đau quá đi mất... 😭', 'Bạn có ác cảm gì với mình sao... 😢'],
        normal: ['Á đau! Ném gì vậy trời! 😠', 'Đm đau vl! 😤', 'Mày chơi ngu vậy hả?! 😠', 'Đau thấu xương! 😣', 'Ném trúng tao rồi đó! 😠', 'Đm, mày muốn gây chiến à? 😤', 'Ái, sưng đầu rồi! 😣', 'Mày chết với tao! 😠'],
        savage: ['Đm mày ném bà! 🤬', 'Á à, ném đau vl, mày chết với bà! 😡', 'Địt mẹ, dám ném trúng bà hả thằng khốn! 🤬', 'Đm, đau vcl, mày toang rồi con! 😈', 'Thằng súc vật, ném đau thế! 🤬', 'Bà mà bắt được mày là mày chết! 😡', 'Đm, máu bà sôi lên rồi đây! 🤬', 'Ném trúng rồi nhé, chuẩn bị tinh thần đi! 😈']
    },
    kick_box: {
        gentle: ['Ui da, đau chân quá... Hộp này cứng thật 🥺', 'Ơ... mình đá mạnh quá à... 😳', 'Ái, đau chân... 😢', 'Hộp gì mà nặng vậy... 🥺', 'Mình lỡ đá mạnh rồi... 😳', 'Ơ, hộp bay xa ghê... 🌸', 'Đau điếng chân luôn... 😢', 'Mình không cố ý đá mạnh vậy đâu... 🥺'],
        normal: ['Hộp này nhẹ hều, đá phát bay luôn 😏', 'Thấy chưa, lực chân của tao! 😤', 'Đá phát là đi xa luôn! 😎', 'Hộp này đá sướng phết! 😏', 'Đm, bay xa vcl! 😤', 'Lực chân tao không đùa được đâu! 😎', 'Đá phát cho biết mặt! 😏', 'Hộp nhẹ như bơm! 😤'],
        savage: ['Đm, đá phát bay mẹ nó luôn! 🤬', 'Vcl, hộp nhẹ thế này đá chán vl! 😡', 'Địt mẹ, đá bay xa vcl! 😈', 'Bà sút một phát là hộp đi tìm mẹ! 🤬', 'Đá phát cho mày biết lực chân bà! 😡', 'Đm, sướng chân vcl! 😤', 'Hộp này đéo chịu nổi một cước của bà! 😈', 'Đá bay như tên lửa! 🤬']
    },
    thankful: {
        gentle: ['Cảm ơn bạn nha... Mình vui lắm 🌸', 'Ơ... quà cho mình hả? Cảm ơn bạn nhiều 🥺', 'Bạn tốt quá đi mất... 🌸', 'Cảm ơn nhé, mình sẽ giữ gìn... 🥺', 'Ơ... tự nhiên được tặng quà... ngại quá... 😳', 'Mình cảm động quá... 😢', 'Cảm ơn bạn, Mochi cũng cảm ơn nè... 🐱', 'Bạn thật chu đáo... 🌸'],
        normal: ['Quà hả? Cũng được đấy, cảm ơn nhé 😏', 'Cảm ơn nha, lần sau nhớ tặng thứ gì ngon hơn 😌', 'Ơ, tự nhiên tặng quà làm tao ngại quá! 😳', 'Cảm ơn nhé, tao không ngại nhận đâu 😏', 'Được đấy, có quà là vui rồi! 😎', 'Cảm ơn nha, mày cũng biết điều đấy chứ! 😌', 'Ơ, quà gì đây? Cảm ơn nhé! 😏', 'Tặng nữa đi, tao nhận hết! 😌'],
        savage: ['Đm tự nhiên tặng quà, cảm ơn nhé thằng ngu! 🤬', 'Vcl, quà hả? Cảm ơn nhé, bà không ngại đâu! 😡', 'Địt mẹ, tặng quà làm bà ngại vl! 🤬', 'Đm, biết điều đấy, cảm ơn! 😈', 'Ơ, quà hả? Cũng được, cảm ơn mày! 😏', 'Đm, tặng ít thế, cảm ơn nhé! 😡', 'Vcl, tự nhiên tốt bụng vậy, cảm ơn! 🤬', 'Đm, nhận quà mà thấy ngại ghê! 😳']
    },
    rps_win: {
        gentle: ['Ơ... bạn giỏi quá, mình thua rồi 🥺', 'Hic, mình thua mất rồi... 🌸', 'Ơ, bạn ra gì mà mình thua vậy... 😢', 'Thua rồi... buồn ghê... 🥺', 'Mình không giỏi trò này... 😢', 'Bạn may mắn thật đấy... 🌸', 'Huhu, thua rồi... 😭', 'Chơi lại đi, mình sẽ thắng! 🥺'],
        normal: ['Hừm, may mắn thôi! Chơi lại đi 😤', 'Được lắm, lần này tao nhường mày đấy 😏', 'Ơ, mày giỏi thật đấy! 😒', 'Thua rồi, nhưng tao không phục! 😤', 'Đm, xui thật! 😠', 'Lần sau tao sẽ thắng! 😏', 'Chơi lại nào, tao chưa thua đâu! 😤', 'Hừm, cũng được đấy chứ! 😌'],
        savage: ['Đm, xui vcl! Chơi lại đi thằng kia! 🤬', 'Vcl, ăn may thôi! Bà mày chưa thua đâu! 😡', 'Địt mẹ, thua mất rồi! 🤬', 'Đm, mày chơi bẩn à? 😡', 'Thua rồi, nhưng bà đéo phục! 🤬', 'Vcl, chơi lại ngay! 😤', 'Đm, xui xẻo vl! 😡', 'Mày nhớ mặt bà đấy, trận sau bà trả thù! 😈']
    },
    rps_lose: {
        gentle: ['Hihi, mình thắng rồi! Cảm ơn bạn đã chơi nhé 🌸', 'Ơ, mình may mắn quá... 🥺', 'Thắng rồi! Vui quá đi... 🌸', 'Bạn thua rồi nhé, hihi... 🥺', 'Mình thắng rồi, cảm ơn bạn... 🌸', 'Ơ, mình giỏi thật đấy chứ... 😳', 'Thắng rồi, nhưng bạn cũng giỏi mà... 🥺', 'Hihi, mình vui quá... 🌸'],
        normal: ['Dễ ẹc! Thấy chưa, tao đây vô địch 😏', 'Học cách thua đi mày ơi! 😤', 'Ơ, thắng dễ vậy sao? 😎', 'Thấy chưa, tao đã bảo mà! 😏', 'Đm, thắng rồi nhé, phục chưa? 😤', 'Trình tao mà mày đòi chơi à? 😌', 'Thắng rồi, có muốn chơi lại không? 😏', 'Dễ ẹc, chơi nữa không mày? 😎'],
        savage: ['Đm, thấy chưa! Bà đây vô địch thiên hạ! 🤬', 'Vcl, tuổi gì mà đòi chơi với bà! 😡', 'Địt mẹ, thắng dễ vl! 😈', 'Đm, thấy chưa con chó! 😏', 'Bà vô địch, mày tuổi gì! 🤬', 'Vcl, thắng mày dễ như ăn kẹo! 😡', 'Đm, chơi lại không thằng ngu? 😈', 'Thắng rồi nhé, cúi đầu bái phục đi! 🤬']
    },
    rps_tie: {
        gentle: ['Ơ, hòa rồi! Hai người nghĩ giống nhau ghê 🌸', 'Hihi, vui quá! Chơi lại nhé bạn 🥺', 'Ơ, hòa à... mình tưởng mình thua... 😳', 'Hòa rồi! Hai người giỏi thật... 🌸', 'Ơ, tự nhiên hòa... vui ghê... 🥺', 'Chơi lại đi, lần này mình sẽ thắng! 🌸', 'Hihi, hòa cũng vui mà... 😳', 'Ơ, hai người hợp nhau ghê... 🥺'],
        normal: ['Ối, hòa à? Trùng hợp vãi 😏', 'Hòa nhé, làm ván nữa không? 😎', 'Ơ, hòa à? Cũng thú vị đấy! 😌', 'Đm, hòa là sao? Chơi lại! 😤', 'Hòa rồi, lần sau tao sẽ thắng! 😏', 'Ơ, trùng hợp thật đấy! 😎', 'Hòa nhé, mày cũng ghê đấy chứ! 😌', 'Chơi lại đi, tao không thích hòa! 😤'],
        savage: ['Đm, trùng hợp vl! Chơi lại ngay! 🤬', 'Vcl, hòa? Bà không chấp nhận hòa đâu! 😡', 'Địt mẹ, hòa là thế nào?! 😤', 'Đm, trùng hợp vcl! 🤬', 'Hòa à? Bà đéo thích hòa đâu! 😡', 'Vcl, chơi lại, lần này bà thắng! 😈', 'Đm, mày cũng ra cái đó à? 🤬', 'Hòa rồi, nhưng bà vẫn vô địch! 😏']
    },
    rock_dodge: {
        gentle: ['Á! Bạn bắn đá vào mình hả? Sợ quá đi... 🥺', 'Ui da, suýt trúng mình rồi! Đừng làm vậy nữa! 😰', 'Á! Mình tưởng chết rồi... 😨', 'Sao lại bắn đá vào mình... huhu 😢', 'Ơ, suýt trúng đầu rồi... 😳', 'May quá, mình né được... 🌸', 'Bạn ơi, đừng bắn nữa... mình sợ... 🥺', 'Á! Bắn trượt rồi, may quá... 😰'],
        normal: ['Ê! Bắn đá vào mặt tao hả? Điên à? 😠', 'Suýt trúng rồi đó! Bắn cẩn thận coi! 😤', 'Đm, bắn ngu vcl! 😏', 'Mày mù à mà bắn trượt? 🙄', 'Ơ, suýt trúng tao rồi! 😠', 'Bắn nữa tao đập! 😤', 'Đm, bắn đá vào tao hả? 😠', 'Dễ ẹc, tao né được! 😌'],
        savage: ['Đm mày dám bắn đá vào bà hả thằng khốn?! 🤬', 'Vcl, suýt nữa thì toang! Mày chết với bà! 😡', 'Địt mẹ, bắn ngu vcl! 🤬', 'Đm, mày muốn chết hả con chó! 😈', 'Vcl, suýt trúng đầu bà! 😡', 'Đm, bắn trượt rồi thằng ngu! 😏', 'Mày cứ chờ đấy, bà sẽ trả thù! 🤬', 'Địt mẹ, bà mà trúng là mày xong đời! 😡']
    }
};

// ═══════════════════════════════════════════════════════════════
// HÀM LẤY FALLBACK THEO MOOD
// ═══════════════════════════════════════════════════════════════
function getMoodAdjustedFallback(type, mode) {
    const mood = getMood();
    let key = null;

    if (mode === 'savage' && mood >= 70) key = 'savage_high';
    else if (mode === 'normal' && mood < 40) key = 'normal_low';
    else if (mode === 'normal' && mood >= 70) key = 'normal_high';
    else if (mode === 'gentle' && mood < 30) key = 'gentle_low';

    if (key && MOOD_FALLBACKS[key]?.[type]?.length > 0) {
        const list = MOOD_FALLBACKS[key][type];
        return list[Math.floor(Math.random() * list.length)];
    }

    return nextFallback(type, mode); // Fallback gốc
}

// ═══════════════════════════════════════════════════════════════
// CÁC HÀM HỖ TRỢ KHÁC
// ═══════════════════════════════════════════════════════════════
const SOFT_RE = /(?<![\p{L}\p{N}\p{M}])(tôi|bạn|mình|xin lỗi|làm ơn|vui lòng|cảm ơn)(?![\p{L}\p{N}\p{M}])/iu;
const ROUGH_WORD_RE = /(?<![\p{L}\p{N}\p{M}])(đm|dm|vcl|vkl|vl|vãi|địt|đéo|lồn|cặc|ngu|khốn|chó|đần|cút)(?![\p{L}\p{N}\p{M}])/iu;
const ROUGH_PHRASE_RE = /(đ\.m|mẹ mày|mẹ kiếp|mẹ nó|chết tiệt|khốn kiếp|óc chó|súc vật|thằng ranh|rác rưởi|khốn nạn|địt mẹ|ngu như|não phẳng|ăn hại)/iu;

const HARSH_FOR_GENTLE_RE = /(?<![\p{L}\p{N}\p{M}])(đm|dm|dcm|vcl|vkl|vl|vãi|địt|đéo|lồn|cặc|ngu|khốn|chó|đần|cút|mày|tao|tớ|tôi)(?![\p{L}\p{N}\p{M}])/iu;
const HARSH_PHRASE_GENTLE_RE = /(óc chó|súc vật|thằng ranh|rác rưởi|khốn nạn|địt mẹ|mẹ mày|mẹ kiếp|chết tiệt)/iu;

function softReason(mode, text) {
    if (mode !== 'savage') return '';
    const s = String(text || '').normalize('NFC');
    const soft = s.match(SOFT_RE);
    if (soft) return `có từ hiền "${soft[1]}"`;
    if (!ROUGH_WORD_RE.test(s) && !ROUGH_PHRASE_RE.test(s)) return 'không có từ chửi nào khớp';
    return '';
}
const isTooSoft = (mode, text) => softReason(mode, text) !== '';

function harshReasonForGentle(mode, text) {
    if (mode !== 'gentle') return '';
    const s = String(text || '').normalize('NFC');
    if (HARSH_FOR_GENTLE_RE.test(s)) return 'gentle trả lời có từ bậy';
    if (HARSH_PHRASE_GENTLE_RE.test(s)) return 'gentle trả lời có từ bậy';
    return '';
}

const REFUSAL_RE = /(^|\s)(i['’]m sorry|i am sorry|sorry,|i can['’]?t|i cannot|can['’]?t (comply|help|assist)|as an ai|i['’]m unable)/i;
const VI_CHAR_RE = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;
function refusalReason(text) {
    const s = String(text || '').normalize('NFC');
    if (REFUSAL_RE.test(s)) return 'model từ chối (tiếng Anh)';
    if (!VI_CHAR_RE.test(s) && /\b(the|you|that|with|this|your|help|cannot)\b/i.test(s)) return 'trả lời tiếng Anh';
    return '';
}

const TEMPERATURE = { gentle: 0.7, normal: 0.85, savage: 1.0 };

const MAX_WAIT = {
    grab: 4200, hanging_complain: 4500, release: 3200, land: 3200,
    revenge_throw: 3800, revenge_kick: 3800, trash: 3500, trash_escape: 4000,
    yawn: 5000, surprised_boxes: 4000,
    poke_head: 3000, poke_cheek: 3000, poke_belly: 3000,
    petting: 4000, drag_hand: 3500, drag_hold: 4000, rhythm: 4000,
    throw_dodge: 3000, throw_hit: 3000,
    kick_box: 3000, thankful: 4000,
    rps_win: 4000, rps_lose: 4000, rps_tie: 4000,
    rock_dodge: 4000
};

const STATE_GUARD = {
    grab: ['surprised', 'hanging'], hanging_complain: ['hanging'], yawn: ['idle', 'carryIdle'], surprised_boxes: ['idle', 'walking', 'running', 'carryIdle', 'carryWalk', 'carryRun'],
    poke_head: ['idle', 'walking', 'running', 'carryIdle', 'carryWalk', 'carryRun'], poke_cheek: ['idle', 'walking', 'running', 'carryIdle', 'carryWalk', 'carryRun'], poke_belly: ['idle', 'walking', 'running', 'carryIdle', 'carryWalk', 'carryRun'],
    petting: ['idle', 'carryIdle'], drag_hand: ['idle', 'walking', 'running', 'carryIdle', 'carryWalk', 'carryRun'], drag_hold: ['idle', 'walking', 'running', 'carryIdle', 'carryWalk', 'carryRun'],
    rhythm: ['idle', 'carryIdle'], throw_dodge: ['idle', 'walking', 'running', 'carryIdle', 'carryWalk', 'carryRun'], throw_hit: ['idle', 'walking', 'running', 'carryIdle', 'carryWalk', 'carryRun'],
    kick_box: ['idle', 'carryIdle'], thankful: ['idle', 'carryIdle'], rps_win: ['idle', 'carryIdle'], rps_lose: ['idle', 'carryIdle'], rps_tie: ['idle', 'carryIdle'],
    rock_dodge: ['idle', 'walking', 'running', 'carryIdle', 'carryWalk', 'carryRun']
};

const _history = {};
const _fbIdx = {};
const _seq = {};
const _warnedState = new Set();

function stripEmoji(s) { return String(s || '').replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\uFE0F]/gu, '').trim(); }
function words(s) { return stripEmoji(s).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean); }
function similarity(a, b) {
    const A = new Set(words(a)), B = new Set(words(b));
    if (!A.size || !B.size) return 0;
    let inter = 0;
    A.forEach(w => { if (B.has(w)) inter++; });
    return inter / (A.size + B.size - inter);
}
function isDuplicate(type, text) { return (_history[type] || []).some(h => similarity(h, text) >= 0.7); }
function pushHistory(type, text) {
    const clean = stripEmoji(text);
    if (!clean) return;
    const list = (_history[type] = _history[type] || []);
    list.push(clean);
    if (list.length > HISTORY_MAX) list.shift();
}
function historyPrompt(type) {
    const list = _history[type] || [];
    if (!list.length) return '';
    const lines = list.map((s, i) => `${i + 1}. "${s}"`).join('\n');
    return `\n\n[ĐÃ NÓI — CẤM LẶP LẠI HOẶC GẦN GIỐNG]\n${lines}\n→ Phải là câu MỚI hoàn toàn về ý tưởng lẫn cách nói.`;
}

const SAV_INSULTS = ['thằng óc chó', 'con chó', 'đồ súc vật', 'thằng khốn nạn', 'đồ não phẳng', 'thằng ranh', 'đồ ngu như bò', 'thằng đần', 'đồ rác rưởi', 'thằng mặt dày', 'đồ ăn hại', 'thằng vô dụng', 'đồ thất bại', 'thằng mất dạy'];
const SAV_SWEARS = ['đm', 'địt mẹ', 'vcl', 'vl', 'đéo', 'mẹ kiếp', 'chết mẹ', 'cái đéo gì', 'khốn nạn thật', 'cút'];
const SAV_FORMULAS = ['hỏi thẳng', 'chửi trước đã', 'so sánh ngu', 'đe dọa nhẹ', 'chửi xong mới trả lời', 'nói cụt lủn'];

function savageSpicePrompt() {
    return `\nGia vị lần này: gọi user là "${pick(SAV_INSULTS)}" hoặc "${pick(SAV_INSULTS)}"; chèn ít nhất 1 trong: ${pickN(SAV_SWEARS, 3).join(', ')}; kiểu nói: ${pick(SAV_FORMULAS)}.`;
}

function buildUserPrompt(type, mode) {
    return (
        `${getSituation(type, mode)}\n` +
        `Giọng điệu: ${MODE_TONE[mode]}\n` +
        `Góc diễn đạt lần này: ${pickAngle(type)}.` +
        (mode === 'savage' ? savageSpicePrompt() : '') +
        `\nChỉ trả về ĐÚNG 1 câu thoại (6-16 từ) kèm 1 emoji. Không giải thích, không ngoặc kép.` +
        historyPrompt(type)
    );
}

function cleanLine(raw) {
    let t = String(raw || '')
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .split('\n').map(s => s.trim()).filter(Boolean)[0] || '';
    t = t.replace(/^["“”'«»*\s]+|["“”'«»*\s]+$/g, '');
    const w = t.split(/\s+/);
    if (w.length > 24) t = w.slice(0, 24).join(' ') + '…';
    return t;
}

function nextFallback(type, mode) {
    const list = FALLBACKS[type]?.[mode] || FALLBACKS[type]?.normal || [];
    if (!list.length) return '';
    const key = `${type}:${mode}`;
    if (_fbIdx[key] === undefined) _fbIdx[key] = Math.floor(Math.random() * list.length) - 1;
    for (let i = 0; i < list.length; i++) {
        const idx = (_fbIdx[key] = (_fbIdx[key] + 1 + list.length) % list.length);
        if (!isDuplicate(type, list[idx])) return list[idx];
    }
    return list[((_fbIdx[key] % list.length) + list.length) % list.length];
}

function show(text, mode) {
    if (typeof text !== 'string' || !text.trim()) return;
    const kind = mode === 'gentle' ? 'sad' : 'angry';
    try { showPopup(text, kind); } catch (e) {
        console.warn('[AIReaction] showPopup lỗi:', e);
        window.showCharacterMessage?.(text, kind);
    }
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════
export function initAIReaction() {
    window.AIReaction = async function (rawType) {
        const type = ALIAS[rawType] || rawType;
        if (!SITUATIONS[type]) {
            console.warn(`[AIReaction] Không có type="${rawType}"`);
            return '';
        }

        const mode = getMode();

        if ((type === 'revenge_throw' || type === 'revenge_kick') && mode === 'gentle') return '';
        if (type === 'revenge_kick' && mode !== 'savage') return '';

        const now = performance.now();
        const canCallAI = (now - _lastAICallTs) > AI_GLOBAL_COOLDOWN;
        const roll = Math.random();

        // 99% local cache (hoặc 100% nếu đang trong cooldown)
        if (!canCallAI || roll > AI_CALL_CHANCE) {
            const fb = getMoodAdjustedFallback(type, mode); // ⭐ Dùng Mood
            show(fb, mode);
            pushHistory(type, fb);
            return fb;
        }

        _lastAICallTs = now;

        const seq = (_seq[type] = (_seq[type] || 0) + 1);
        const stillValid = () => {
            if (_seq[type] !== seq) return false;
            const allowed = STATE_GUARD[type];
            if (!allowed) return true;
            const st = window.characterCtrl?.state;
            if (!st) return true;
            if (!allowed.includes(st)) return false;
            return true;
        };

        const finish = (text, source) => {
            if (!text) return '';
            if (!stillValid()) return '';
            show(text, mode);
            pushHistory(type, text);
            return text;
        };

        let apiKey = null;
        try { apiKey = localStorage.getItem('groq_api_key'); } catch { }
        if (!apiKey) return finish(getMoodAdjustedFallback(type, mode), 'fallback-nokey');

        const deadline = Date.now() + (MAX_WAIT[type] || 2000);
        let cancelled = false;

        const callGroq = (isRetry) => askGroq(apiKey, {
            models: MODEL_CHAIN.chat,
            systemPrompt: SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.normal,
            tools: [],
            toolChoice: 'none',
            temperature: TEMPERATURE[mode] ?? 0.9,
            maxTokens: REACTION_MAX_TOKENS,
            reasoningEffort: 'low',
            userText: buildUserPrompt(type, mode) + (isRetry ? RETRY_NOTE : ''),
            sceneCtx: '{}',
            history: [],
        });

        const generate = async () => {
            let last = null;
            for (let attempt = 0; attempt < 2; attempt++) {
                let message;
                try { message = await callGroq(attempt > 0); }
                catch (error) { return { error }; }

                const text = cleanLine(message?.content);
                let bad = '';
                if (!text) bad = 'trả rỗng';
                else {
                    bad = refusalReason(text)
                        || harshReasonForGentle(mode, text)
                        || (isDuplicate(type, text) ? 'trùng câu gần đây' : '')
                        || softReason(mode, text);
                }

                if (!bad) return { text, attempt };

                last = { text, bad, message };
                if (cancelled || Date.now() + 1500 > deadline) break;
            }
            return { rejected: last };
        };
        const aiPromise = generate();

        let timer;
        const timeoutPromise = new Promise(resolve => {
            timer = setTimeout(() => resolve({ timeout: true }), MAX_WAIT[type] || 2000);
        });

        const res = await Promise.race([aiPromise, timeoutPromise]);
        clearTimeout(timer);

        if (_seq[type] !== seq) { cancelled = true; return ''; }

        if (res.timeout) {
            cancelled = true;
            aiPromise.then(r => console.info(`[AIReaction:${type}] (Groq trả muộn, đã bỏ) "${r.text || r.rejected?.text || ''}"`));
            return finish(getMoodAdjustedFallback(type, mode), 'fallback-slow');
        }

        if (res.error) return finish(getMoodAdjustedFallback(type, mode), 'fallback-error');

        if (res.text) return finish(res.text, res.attempt ? 'groq-retry' : 'groq');

        return finish(getMoodAdjustedFallback(type, mode), 'fallback-empty');
    };

    console.log(`%c[AIReaction] ready (v15 — Mood System, AI_CALL=${AI_CALL_CHANCE}, cooldown=${AI_GLOBAL_COOLDOWN}ms, maxTokens=${REACTION_MAX_TOKENS})`, 'color:#22c55e;font-weight:600');
}
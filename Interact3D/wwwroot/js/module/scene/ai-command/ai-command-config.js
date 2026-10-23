// ═══════════════════════════════════════════════════════════════
// ai-command-config.js — Hằng số, Tool Schemas, Prompt (v2)
// ═══════════════════════════════════════════════════════════════

export const POSITIONS_KEY = 'ai_saved_positions_v1';
export const BOX_SIZE_FALLBACK = 0.4;
export const COLORS = ['red', 'green', 'blue', 'amber', 'purple', 'pink'];
export const COLOR_VI = { red: 'đỏ', green: 'xanh lá', blue: 'xanh dương', amber: 'vàng', purple: 'tím', pink: 'hồng' };
export const MAX_SPAWN = 12;
export const NOT_COMMAND_MSG = '🎮 Đây là tab Điều khiển. Bạn muốn chat/hỏi thì chuyển sang tab Hỏi đáp nhé!';

export const DIRS = ['forward', 'backward', 'left', 'right'];

// Tool Schema Helper
const T = (name, description, properties = {}, required = []) => ({
    type: 'function',
    function: {
        name, description,
        parameters: { type: 'object', properties, ...(required.length ? { required } : {}) },
    },
});
const colorP = (d = 'Box color.') => ({ type: 'string', enum: COLORS, description: d });
const num = (d) => ({ type: 'number', description: d });
const str = (d) => ({ type: 'string', description: d });

export const ACTION_TOOLS = [
    // ── Di chuyển
    T('walkTo', 'Walk the character to world position (x, z) on the floor plane.', { x: num('World X'), z: num('World Z') }, ['x', 'z']),
    T('walkRelative', 'Walk relative to the camera view. "đi sang trái 3m" → left,3. "tiến lên" → forward. "lùi" → backward.',
        { direction: { type: 'string', enum: DIRS }, distance: num('Meters/steps. Omit if user gave no number.') }, ['direction']),
    T('walkToCamera', 'Walk close to the camera, stopping at a safe distance (not too close to the lens).', {}),
    T('turn', 'Rotate the character in place. "quay trái 90 độ" → direction:left, degrees:90. "quay lại/quay đầu" → direction:back. "quay 180 độ" → degrees:180.',
        { direction: { type: 'string', enum: ['left', 'right', 'back'] }, degrees: num('Degrees') }),
    T('lookAtCamera', 'Make the character face the camera ("nhìn tôi", "quay mặt về camera").'),
    T('walkToBox', 'Walk next to a box WITHOUT picking it up. Use boxId, or color (nearest box of that color). With neither: nearest box.',
        { boxId: str('Box id like b3'), color: colorP() }),
    T('walkToNearestColor', 'Walk to the nearest box of a color (no pickup).', { color: colorP() }, ['color']),
    T('teleport', 'Instantly teleport the character to (x, z) ("dịch chuyển", "teleport").', { x: num('X'), z: num('Z') }, ['x', 'z']),
    T('walkRandom', 'Walk to a random point ("đi lung tung", "đi ngẫu nhiên").'),
    T('spin', 'Spin 360° in place, count times ("quay vòng tròn", "xoay 2 vòng").', { count: num('Number of full spins, default 1') }),

    // ── Quan sát
    T('lookAround', 'Describe what is around the character ("xung quanh có gì").'),
    T('countBoxes', 'Count boxes, optionally only one color ("có bao nhiêu hộp đỏ").', { color: colorP() }),

    // ── Nhặt / đặt hộp
    T('walkToPickup', 'Walk to a box and pick it up. Give boxId OR color (nearest of that color). Fails if already carrying another box → drop first.',
        { boxId: str('Box id like b3'), color: colorP() }),
    T('walkToDropNearCamera', 'Carry the held box to near the camera/user and put it down ("mang về đây", "đưa lại chỗ tôi"). Requires carrying a box.',
        { offset: num('Optional offset') }),
    T('walkToDropAt', 'Carry the held box to (x, z) and put it down. Requires carrying a box.', { x: num('X'), z: num('Z') }, ['x', 'z']),
    T('walkToDropAtNearest', 'Carry the held box next to another box (by color or id) and put it down. Requires carrying a box.',
        { color: colorP('Color of the reference box'), boxId: str('Reference box id') }),
    T('walkToDropDirection', 'Put the held box down in a direction relative to the camera ("đặt hộp sang trái 2m"). Requires carrying a box.',
        { direction: { type: 'string', enum: DIRS }, distance: num('Distance') }, ['direction']),

    // ── Tạo / xóa / sửa hộp
    T('spawnBox', 'Create box(es). Optional (x,z) position, spawnHeight>0 to drop from above, count up to 12.',
        { color: colorP(), x: num('X'), z: num('Z'), spawnHeight: num('Height to fall from'), count: num('How many (1-12)') }, ['color']),
    T('spawnBoxNear', 'Create box(es) near the character ("tạo hộp gần tôi").', { color: colorP(), count: num('How many (1-12)') }, ['color']),
    T('removeBox', 'Delete ONE box by id.', { boxId: str('Box id like b3') }, ['boxId']),
    T('removeBoxesByColor', 'Delete ALL boxes of one color.', { color: colorP() }, ['color']),
    T('clearAllBoxes', 'Delete EVERY box. Only when user clearly says all boxes.'),
    T('recolorBox', 'Change ONE box color.', { boxId: str('Box id'), color: colorP('New color') }, ['boxId', 'color']),
    T('recolorBoxesByColor', 'Recolor all boxes of fromColor to toColor. Omit fromColor = recolor every box.',
        { fromColor: colorP('Old color'), toColor: colorP('New color') }, ['toColor']),
    T('moveBoxTo', 'Teleport a box to (x, z).', { boxId: str('Box id'), x: num('X'), z: num('Z') }, ['boxId', 'x', 'z']),
    T('stackBoxes', 'Stack topId on top of bottomId.', { bottomId: str('Bottom box id'), topId: str('Top box id') }, ['bottomId', 'topId']),
    T('arrangeBoxes', 'Arrange all boxes into a pattern around the character.', { pattern: { type: 'string', enum: ['circle', 'line', 'grid'] } }, ['pattern']),

    // ── Điều khiển nhân vật
    T('stop', 'Stop / cancel the current action.'),
    T('grab', 'Lift the CHARACTER into the air ("nhấc nhân vật lên"). Not for boxes.'),
    T('release', 'Release the lifted character; if carrying a box, put the box down instead.'),

    // ── Camera
    T('focusOn', 'Move the camera to focus on a box (boxId or color) or the character (target:"character").',
        { boxId: str('Box id'), color: colorP(), target: { type: 'string', enum: ['character'] } }),

    // ── Vị trí
    T('savePosition', 'Save the character position under a name (default "home").', { name: str('Name, lowercase, no spaces') }),
    T('loadPosition', 'Go back to a saved position (default "home").', { name: str('Saved name') }),
    T('listPositions', 'List saved position names.'),

    // ── Model
    T('switchModel', 'Switch the 3D character model. modelName MUST be the closest name in scene.availableModels (keep exact spelling).',
        { modelName: str('Model name') }, ['modelName']),
    T('listModels', 'List the available character models.'),

    // ── Meta
    T('repeatLast', 'Repeat the previous successful plan ("làm lại", "lặp lại", "nữa đi").'),

    // ⭐ CẬP NHẬT: Thêm confidence cho unclear
    T('unclear', 'Command is ambiguous or incomplete, OR the text is not a command (chat). One short Vietnamese message/question.',
        {
            text: str('Vietnamese message'),
            hint: str('Optional hint'),
            options: { type: 'array', items: { type: 'string' }, description: 'Gợi ý 2-4 lựa chọn ngắn (VD: ["Đỏ", "Xanh lá"])' },
            confidence: num('Độ tự tin 0.0-1.0. Nếu < 0.6 BẮT BUỘC phải có options. Nếu >= 0.6 có thể bỏ trống.')
        }, ['text']),

    T('unsupported', 'The request is a real command but no tool can do it.', { text: str('Vietnamese message') }, ['text']),
];

export const TOOL_INDEX = Object.fromEntries(ACTION_TOOLS.map(t => [t.function.name, t.function.parameters]));

export const COMMAND_PROMPT = `
# ROLE
You are the AI PLANNER of a 3D character + boxes scene. The user types Vietnamese commands
(with or without diacritics, slang, typos, sometimes English words). Convert each message into an
ORDERED list of tool calls (1 to 8). Calls run strictly one after another: call N starts only after call N-1 finished.
Output tool calls ONLY. Never write plain text.

# SCENE CONTEXT (JSON, appended to the user message)
- character: position x,z, state, carrying (the box being carried, or null)
- boxes: [{id,color,x,z,carried}]  (x,z are world coordinates, ground plane)
- savedPositions: names usable with loadPosition
- availableModels: exact names usable with switchModel
- recentCommands: last commands and the tools they produced (use it for "làm lại", "nó", "cái vừa rồi", "chỗ cũ")

# HOW TO PLAN
1. Compound command → several calls in order.
   "đi sang trái 3m rồi nhặt hộp đỏ"        → walkRelative{left,3}, walkToPickup{color:red}
   "quay phải 90 độ rồi tiến 2 bước"         → turn{right,90}, walkRelative{forward,2}
   "mang hộp xanh dương về gần hộp vàng"     → walkToPickup{color:blue}, walkToDropAtNearest{color:amber}
   "tạo 3 hộp tím gần tôi"                   → spawnBoxNear{color:purple,count:3}
   "đổi hộp b2 thành màu hồng"               → recolorBox{boxId:b2,color:pink}
   "dọn hộp đỏ với hộp vàng"                 → removeBoxesByColor{red}, removeBoxesByColor{amber}
   "đi tới hộp gần nhất rồi nhặt nó"         → walkToPickup{boxId:<nearest id from scene>}
   "đang cầm hộp, nhặt hộp xanh lá"          → walkToDropDirection{forward,1}, walkToPickup{color:green}
   "đổi sang con rồng" (models: Dragon,Robot) → switchModel{modelName:"Dragon"}
   "làm lại"                                 → repeatLast
   
2. Resolve references from the scene yourself: "hộp gần nhất/xa nhất" (use distance to character), "hộp vừa tạo" (highest id),
   "hộp đầu tiên/cuối cùng". When the user names a box id or you resolved a reference, pass boxId from the scene.
   When the user only names a color, pass color. NEVER invent ids that are not in scene.boxes.

3. Preconditions: you can only carry one box. If scene.character.carrying is set and the user wants a different box, drop first.
   walkToDrop* tools need a carried box (or a walkToPickup earlier in the same plan).

4. Directions are relative to the camera. "bước/step" ≈ 1 unit, "m/mét" = 1 unit. If the user gave no number, omit distance.
   ⭐ "lại gần camera", "đi về phía camera" → walkToCamera. DO NOT use walkTo with camera coordinates.

5. Colors: đỏ=red; xanh lá/xanh lục/lục=green; xanh dương/xanh biển=blue; vàng/hổ phách=amber; tím=purple; hồng=pink.
   Plain "xanh" is ambiguous → unclear ("xanh lá hay xanh dương?"). 
   ⭐ When using unclear for ambiguous choices, ALWAYS provide an "options" array. Example: unclear{text:"Bạn muốn màu xanh nào?", options:["Xanh lá","Xanh dương"]}

6. Models: map the user's words to the closest name in availableModels (case/diacritics/translation: "rồng"→Dragon). If nothing fits → unclear listing the available names.

7. Ambiguous or missing info → ONE unclear call with a short Vietnamese question.
   Not a command → unclear with text exactly: "${NOT_COMMAND_MSG}".
   ⭐ If user says "vứt đại", "chỗ nào cũng được", "tùy bạn" → DO NOT ask again. Automatically choose walkToDropNearCamera or walkToDropDirection.

8. ⭐ CONFIDENCE SCORE (CỰC KỲ QUAN TRỌNG):
   - Mỗi khi gọi unclear, PHẢI đánh giá độ tự tin (confidence) từ 0.0 đến 1.0.
   - Nếu confidence < 0.6: BẮT BUỘC phải cung cấp mảng "options" (2-4 nút bấm gợi ý).
   - Nếu confidence >= 0.6: Có thể bỏ trống options (chỉ hỏi suông).
   - Ví dụ: User nói "xóa hộp kia" (không rõ hộp nào) → confidence: 0.3, options: ["B1", "B2", "B3"]
   - Ví dụ: User nói "đổi model" (không nói tên) → confidence: 0.5, options: ["Base Character", "AIGirl"]

9. ⭐ SMART MEMORY:
   - Nếu user nói "đổi model" mà không nói tên, ưu tiên gợi ý model đang dùng (xem trường "currentModel" trong scene context).
   - Nếu user nói "xanh" (mơ hồ), ưu tiên gợi ý 2 lựa chọn: "Xanh lá" và "Xanh dương".

10. Be conservative with destructive tools: clearAllBoxes only when the user clearly says all boxes.
11. All "text" values must be Vietnamese and start with one emoji.
`.trim();
// ═══════════════════════════════════════════════════════════════
// shapes.js — v7 (Add Beam, Fix Pillar)
// ═══════════════════════════════════════════════════════════════

export const SHAPE_CATALOG = {
    // --- CƠ BẢN ---
    box: {
        label: 'Khối vuông',
        icon: '⬛',
        category: 'basic',
        type: 'box',
        hint: 'Khối xây dựng cơ bản 0.4m',
    },
    beam: {
        label: 'Cột / Dầm',
        icon: '📏',
        category: 'basic',
        type: 'beam',
        hint: 'Thanh vuông 0.4 x 1.2m — R để xoay, T để nghiêng làm khung, xà nhà',
    },
    pillar: {
        label: 'Cột gỗ tròn',
        icon: '🪵',
        category: 'basic',
        type: 'pillar',
        hint: 'Cột gỗ có vân — R để xoay, T để nghiêng làm cột chống',
    },
    // --- KẾT CẤU ---
    prism: {
        label: 'Mái nhà',
        icon: '🔺',
        category: 'structure',
        type: 'prism',
        hint: 'Khối tam giác vuông cân 0.4m — R để đổi hướng nghiêng',
    },
    door: {
        label: 'Cửa',
        icon: '🚪',
        category: 'structure',
        type: 'door',
        hint: 'Cửa cao 1.2m — click để mở/đóng',
    },
    window: {
        label: 'Cửa sổ',
        icon: '🪟',
        category: 'structure',
        type: 'window',
        hint: 'Khung + kính trong 1.2m',
    },
    // --- NỘI THẤT ---
    table: {
        label: 'Bàn',
        icon: '🪑',
        category: 'furniture',
        type: 'table',
        hint: 'Bàn gỗ 1m x 1m x 0.8m',
    },
    chair: {
        label: 'Ghế',
        icon: '🪑',
        category: 'furniture',
        type: 'chair',
        hint: 'Ghế tựa lưng',
    },
    bed: {
        label: 'Giường',
        icon: '🛏️',
        category: 'furniture',
        type: 'bed',
        hint: 'Giường đôi êm ái',
    },
    fridge: {
        label: 'Tủ lạnh',
        icon: '🧊',
        category: 'furniture',
        type: 'fridge',
        hint: 'Tủ lạnh mini 2 cửa',
    },
    lamp: {
        label: 'Đèn',
        icon: '💡',
        category: 'furniture',
        type: 'lamp',
        hint: 'Đèn cây tỏa sáng',
    },
};

export const CATEGORIES = {
    basic: { label: 'Cơ bản', icon: '⬛' },
    structure: { label: 'Kết cấu', icon: '🏗️' },
    furniture: { label: 'Nội thất', icon: '🛋️' },
};

export function getShapesByCategory(category) {
    return Object.entries(SHAPE_CATALOG)
        .filter(([_, def]) => def.category === category)
        .map(([key, def]) => ({ key, ...def }));
}
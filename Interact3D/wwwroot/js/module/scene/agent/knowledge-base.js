// ═══════════════════════════════════════════════════════════════
// knowledge-base.js — v1 (A4 · Keyword-based tutorial loader)
// Load 5 file .txt từ /uploads/tutorials/, index theo keyword,
// query → trả về excerpt 40-50 dòng để inject vào system prompt.
// ═══════════════════════════════════════════════════════════════

const TUTORIAL_BASE = '/uploads/tutorials/';
const MAX_EXCERPT_CHARS = 1800;
const MAX_CACHE_SIZE = 50;

const TUTORIALS = {
    basics: {
        file: 'basics.txt',
        keywords: [
            'tỷ lệ', 'ty le', 'proportion', 'phối màu', 'phoi mau', 'color theory',
            'bút chì', 'but chi', 'dụng cụ', 'dung cu', 'cơ bản', 'co ban',
            'beginner', 'mới bắt đầu', 'moi bat dau', 'tập vẽ', 'tap ve',
            'cơ thể', 'co the', 'người', 'nguoi', 'bố cục', 'bo cuc',
        ],
    },
    portrait: {
        file: 'portrait.txt',
        keywords: [
            'mặt', 'mat', 'mắt', 'mắt', 'mũi', 'mui', 'miệng', 'mieng',
            'khuôn mặt', 'khuon mat', 'chân dung', 'chan dung', 'portrait',
            'đầu', 'dau', 'tóc', 'toc', 'lông mày', 'long may',
            'biểu cảm', 'bieu cam', 'môi', 'moi', 'tai', 'tai',
        ],
    },
    anime: {
        file: 'anime.txt',
        keywords: [
            'anime', 'manga', 'mắt to', 'mat to', 'style nhật', 'style nhat',
            'nhật bản', 'nhat ban', 'chibi', 'moe', 'waifu', 'otaku',
            'nhân vật anime', 'nhan vat anime', 'vẽ anime', 've anime',
            'manga style', 'biểu cảm anime', 'bieu cam anime',
        ],
    },
    landscape: {
        file: 'landscape.txt',
        keywords: [
            'phong cảnh', 'phong canh', 'núi', 'nui', 'biển', 'bien',
            'cây', 'cay', 'bầu trời', 'bau troi', 'phối cảnh', 'phoi canh',
            'perspective', 'landscape', 'thiên nhiên', 'thien nhien',
            'mây', 'may', 'sông', 'song', 'rừng', 'rung', 'hoàng hôn', 'hoang hon',
            'bình minh', 'binh minh', 'nước', 'nuoc', 'thác', 'thac',
        ],
    },
    shading: {
        file: 'shading.txt',
        keywords: [
            'bóng', 'bong', 'ánh sáng', 'anh sang', 'highlight', 'shadow',
            'đổ bóng', 'do bong', 'shading', 'light', 'chiếu sáng', 'chieu sang',
            'tương phản', 'tuong phan', 'contrast', 'đậm nhạt', 'dam nhat',
            'gradient', 'tối', 'toi', 'khối', 'khoi', '3d',
        ],
    },
};

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════
function normalize(s) {
    return String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// ═══════════════════════════════════════════════════════════════
// KNOWLEDGE BASE
// ═══════════════════════════════════════════════════════════════
class KnowledgeBase {
    constructor() {
        this.docs = new Map();          // topic → { content, keywords }
        this.loaded = false;
        this._initPromise = null;
        this._queryCache = new Map();
        this._queryCacheMax = MAX_CACHE_SIZE;
    }

    /**
     * Khởi tạo: load 5 file .txt song song. An toàn khi gọi nhiều lần.
     * @returns {Promise<boolean>} true nếu load được ít nhất 1 file
     */
    async init() {
        if (this.loaded) return this.docs.size > 0;
        if (this._initPromise) return this._initPromise;

        this._initPromise = this._loadAll();
        try {
            const ok = await this._initPromise;
            return ok;
        } finally {
            this._initPromise = null;
        }
    }

    async _loadAll() {
        const entries = Object.entries(TUTORIALS);
        const results = await Promise.allSettled(
            entries.map(async ([topic, cfg]) => {
                const url = TUTORIAL_BASE + cfg.file;
                const res = await fetch(url, { cache: 'force-cache' });
                if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
                const content = await res.text();
                if (!content || content.length < 50) {
                    throw new Error(`File quá ngắn — ${url}`);
                }
                return { topic, content, keywords: cfg.keywords };
            })
        );

        for (const r of results) {
            if (r.status === 'fulfilled') {
                const { topic, content, keywords } = r.value;
                this.docs.set(topic, { content, keywords });
            } else {
                console.warn('[KB] Load fail:', r.reason?.message || r.reason);
            }
        }

        this.loaded = true;
        console.log(`[KB] Loaded ${this.docs.size}/${entries.length} tutorials`);
        return this.docs.size > 0;
    }

    /**
     * Query tutorial phù hợp nhất với câu hỏi.
     * @param {string} userText
     * @returns {string} excerpt (rỗng nếu không có gì phù hợp)
     */
    query(userText) {
        if (!this.loaded || this.docs.size === 0) return '';

        const key = normalize(userText);
        if (!key) return '';
        if (this._queryCache.has(key)) return this._queryCache.get(key);

        const topic = this.getTopicFor(userText);
        let result = '';

        if (topic && this.docs.has(topic)) {
            result = this._excerpt(this.docs.get(topic).content, MAX_EXCERPT_CHARS);
        } else if (this.docs.has('basics')) {
            result = this._excerpt(this.docs.get('basics').content, MAX_EXCERPT_CHARS);
        }

        // LRU-ish: xoá entry cũ nhất khi đầy cache
        if (this._queryCache.size >= this._queryCacheMax) {
            const firstKey = this._queryCache.keys().next().value;
            this._queryCache.delete(firstKey);
        }
        this._queryCache.set(key, result);
        return result;
    }

    /**
     * Xác định topic phù hợp nhất dựa trên keyword score.
     * @param {string} userText
     * @returns {string|null}
     */
    getTopicFor(userText) {
        if (!this.loaded || this.docs.size === 0) return null;

        const text = ' ' + normalize(userText) + ' ';
        let best = { topic: null, score: 0 };

        for (const [topic, { keywords }] of this.docs) {
            let score = 0;
            for (const kw of keywords) {
                const kwNorm = normalize(kw);
                if (!kwNorm) continue;

                // Exact word match = 3 điểm
                const exactRe = new RegExp(` ${kwNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} `, 'g');
                const exactCount = (text.match(exactRe) || []).length;
                score += exactCount * 3;

                // Substring match = 1 điểm (chỉ tính 1 lần)
                if (exactCount === 0 && text.includes(kwNorm)) {
                    score += 1;
                }
            }
            if (score > best.score) {
                best = { topic, score };
            }
        }

        return best.score >= 1 ? best.topic : null;
    }

    _excerpt(content, maxChars) {
        if (!content) return '';
        if (content.length <= maxChars) return content;

        const cut = content.slice(0, maxChars);
        const lastPara = cut.lastIndexOf('\n\n');
        const base = lastPara > maxChars * 0.5 ? cut.slice(0, lastPara) : cut;
        return base + '\n\n[...]';
    }

    isReady() {
        return this.loaded && this.docs.size > 0;
    }

    getTopics() {
        return [...this.docs.keys()];
    }
}

// ═══════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════
export const knowledgeBase = new KnowledgeBase();
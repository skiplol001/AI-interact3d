// ═══════════════════════════════════════════════════════════════
// ai-artist-agent.js — v2 (Multi-Agent Level 4 - Robust SVG Artist)
// Nhiệm vụ: Nhận ảnh + nhận xét từ DeepSeek -> Gọi Gemini -> Xuất SVG
// ═══════════════════════════════════════════════════════════════
import { logDecision, logError } from '../ai/ai-debug.js?v=12';

const ARTIST_PROMPT = `
Bạn là một GIÁO VIÊN DẠY VẼ CHUYÊN NGHIỆP. Bạn đang hướng dẫn một học viên vẽ.
Bạn sẽ nhận được: 1 bức ảnh vẽ tay của học viên + nhận xét từ giám khảo.
Nhiệm vụ của bạn: Vẽ các ĐƯỜNG DÓNG (Construction Lines) đè lên bức ảnh để hướng dẫn học viên sửa lỗi.

QUY TẮC BẮT BUỘC:
1. CHỈ TRẢ VỀ DUY NHẤT 1 CHUỖI SVG HỢP LỆ (không markdown, không text giải thích, không giải thích thêm).
2. Output phải bắt đầu bằng <svg> và kết thúc bằng </svg>.
3. SVG phải có thuộc tính: viewBox="0 0 1000 1000" width="100%" height="100%".
4. Tất cả nét vẽ phải dùng: stroke="#38bdf8" (xanh), stroke-width="4", fill="none", stroke-dasharray="10, 10" (nét đứt).
5. KHÔNG vẽ chi tiết (mắt, mũi, miệng hoàn chỉnh). CHỈ VẼ KHUNG XƯƠNG:
   - Hình tròn/bầu dục bao quanh khuôn mặt (Khung đầu).
   - 1 đường thẳng đứng chia đôi mặt (Trục dọc).
   - 1 đường thẳng ngang vị trí 2 mắt (Trục ngang).
   - 2 hình bầu dục nhỏ đánh dấu vị trí mắt.
   - 1 đường ngang đánh dấu vị trí miệng.
6. Tọa độ phải CĂN GIỮA (VD: cx="500", cy="500").

Ví dụ Output hợp lệ:
<svg viewBox="0 0 1000 1000" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="500" cy="500" rx="300" ry="400" stroke="#38bdf8" stroke-width="4" fill="none" stroke-dasharray="10, 10"/>
  <line x1="500" y1="100" x2="500" y2="900" stroke="#38bdf8" stroke-width="4" fill="none" stroke-dasharray="10, 10"/>
  <line x1="200" y1="450" x2="800" y2="450" stroke="#38bdf8" stroke-width="4" fill="none" stroke-dasharray="10, 10"/>
  <ellipse cx="350" cy="450" rx="60" ry="30" stroke="#38bdf8" stroke-width="4" fill="none" stroke-dasharray="10, 10"/>
  <ellipse cx="650" cy="450" rx="60" ry="30" stroke="#38bdf8" stroke-width="4" fill="none" stroke-dasharray="10, 10"/>
  <line x1="400" y1="700" x2="600" y2="700" stroke="#38bdf8" stroke-width="4" fill="none" stroke-dasharray="10, 10"/>
</svg>
`;

// Danh sách model dự phòng
const MODELS = [
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-flash-lite-latest'
];

export async function generateSvgGuideline(base64Image, criticFeedback, apiKey) {
    if (!apiKey) throw new Error('Thiếu Gemini API Key');

    const pureBase64 = base64Image.replace(/^data:image\/(png|jpeg|webp);base64,/, '');
    const payload = {
        contents: [{
            parts: [
                { text: `Nhận xét của giám khảo: "${criticFeedback}".\n\nHãy vẽ đường dóng SVG hướng dẫn sửa lỗi.` },
                { inline_data: { mime_type: "image/jpeg", data: pureBase64 } }
            ]
        }],
        generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2000,
        }
    };

    // Duyệt qua từng model dự phòng
    for (const model of MODELS) {
        // Thử lại tối đa 3 lần cho mỗi model nếu gặp lỗi quá tải (503/429)
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                logDecision('paint', 'artist_agent_call', { model, attempt: attempt + 1 });
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                // Nếu gặp lỗi 503 (Quá tải) hoặc 429 (Rate limit)
                if (res.status === 503 || res.status === 429) {
                    if (attempt < 2) {
                        const waitTime = Math.pow(2, attempt) * 1000; // Chờ 1s, sau đó 2s
                        console.warn(`[ArtistAgent] Model ${model} quá tải (${res.status}). Thử lại sau ${waitTime}ms...`);
                        await new Promise(r => setTimeout(r, waitTime));
                        continue; // Thử lại
                    }
                }

                if (!res.ok) {
                    const errText = await res.text();
                    console.warn(`[ArtistAgent] Model ${model} lỗi ${res.status}: ${errText.slice(0, 100)}`);
                    break; // Lỗi khác 503/429 thì bỏ qua model này, chuyển sang model tiếp theo
                }

                const json = await res.json();
                let text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';

                // ⭐ Log raw response để dễ debug nếu Gemini trả về text thay vì SVG
                console.log(`[ArtistAgent] Raw response từ ${model}:`, text.slice(0, 300) + '...');

                // Làm sạch text phòng trường hợp Gemini bọc trong markdown code block
                text = text.replace(/```(?:html|svg|xml)?\s*/gi, '').replace(/```/g, '').trim();
                const svgMatch = text.match(/<svg[\s\S]*?<\/svg>/i);

                if (svgMatch) {
                    return svgMatch[0];
                } else {
                    console.warn(`[ArtistAgent] ${model} không trả về thẻ SVG hợp lệ.`);
                    break; // Model này không trả về SVG, chuyển sang model khác
                }

            } catch (e) {
                if (attempt < 2) {
                    const waitTime = Math.pow(2, attempt) * 1000;
                    console.warn(`[ArtistAgent] Lỗi fetch (${model}):`, e.message, `- Thử lại sau ${waitTime}ms...`);
                    await new Promise(r => setTimeout(r, waitTime));
                } else {
                    logError('paint', 'artist_agent', e);
                    break; // Hết số lần thử, chuyển model
                }
            }
        }
    }

    console.error('[ArtistAgent] Tất cả các model đều thất bại trong việc tạo SVG.');
    return null;
}
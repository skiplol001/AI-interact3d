// ═══════════════════════════════════════════════════════════════
// ai-ui-image-uploader.js — Xử lý chọn, nén và preview ảnh
// ═══════════════════════════════════════════════════════════════

export function initImageUploader(container, onImageChange) {
    // 1. Tạo input file ẩn
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/jpeg, image/png, image/webp';
    fileInput.style.display = 'none';
    container.appendChild(fileInput);

    // 2. Tạo nút Đính kèm (📎)
    const uploadBtn = document.createElement('button');
    uploadBtn.innerHTML = '📎';
    uploadBtn.title = 'Đính kèm ảnh';
    uploadBtn.style.cssText = `
        background: transparent; border: none; color: #94a3b8;
        font-size: 18px; cursor: pointer; padding: 0 8px;
        transition: color 0.2s;
    `;
    uploadBtn.onmouseover = () => uploadBtn.style.color = '#38bdf8';
    uploadBtn.onmouseout = () => uploadBtn.style.color = '#94a3b8';
    uploadBtn.onclick = () => fileInput.click();
    container.appendChild(uploadBtn);

    // 3. Tạo khung Preview ảnh (hiển thị phía trên ô input)
    const previewContainer = document.createElement('div');
    previewContainer.style.cssText = `
        display: none; position: absolute; bottom: 100%; left: 0;
        margin-bottom: 8px; background: #1e293b; padding: 4px;
        border-radius: 8px; border: 1px solid #38bdf8;
        box-shadow: 0 4px 10px rgba(0,0,0,0.5);
    `;
    // Container cha cần có position: relative
    if (getComputedStyle(container).position === 'static') {
        container.style.position = 'relative';
    }
    container.appendChild(previewContainer);

    const previewImg = document.createElement('img');
    previewImg.style.cssText = `
        max-width: 120px; max-height: 120px; border-radius: 4px;
        display: block; object-fit: cover;
    `;
    previewContainer.appendChild(previewImg);

    const removeBtn = document.createElement('button');
    removeBtn.innerHTML = '✖';
    removeBtn.style.cssText = `
        position: absolute; top: -8px; right: -8px;
        background: #ef4444; color: white; border: none;
        border-radius: 50%; width: 20px; height: 20px;
        font-size: 12px; cursor: pointer; display: flex;
        align-items: center; justify-content: center;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    `;
    previewContainer.appendChild(removeBtn);

    let currentImageBase64 = null;

    // 4. Hàm nén ảnh (Resize & Compress)
    async function processImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    // Giới hạn kích thước tối đa 1024px để giảm dung lượng
                    const MAX_SIZE = 1024;
                    if (width > MAX_SIZE || height > MAX_SIZE) {
                        if (width > height) {
                            height = Math.round((height * MAX_SIZE) / width);
                            width = MAX_SIZE;
                        } else {
                            width = Math.round((width * MAX_SIZE) / height);
                            height = MAX_SIZE;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    // Xuất ra JPEG với quality 0.8 để nhẹ nhất có thể
                    const base64 = canvas.toDataURL('image/jpeg', 0.8);
                    resolve(base64);
                };
                img.onerror = () => reject(new Error('Không thể đọc định dạng ảnh.'));
                img.src = e.target.result;
            };
            reader.onerror = () => reject(new Error('Lỗi đọc file.'));
            reader.readAsDataURL(file);
        });
    }

    // 5. Xử lý khi chọn file
    fileInput.onchange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate kích thước thô (tránh treo máy nếu chọn file quá lớn)
        if (file.size > 10 * 1024 * 1024) {
            alert('Ảnh quá lớn (giới hạn 10MB). Vui lòng chọn ảnh nhỏ hơn.');
            fileInput.value = '';
            return;
        }

        try {
            const base64 = await processImage(file);
            currentImageBase64 = base64;

            // Hiển thị preview
            previewImg.src = base64;
            previewContainer.style.display = 'block';

            // Báo cho UI chính biết đã có ảnh
            if (onImageChange) onImageChange(currentImageBase64);
        } catch (err) {
            alert('Lỗi xử lý ảnh: ' + err.message);
        }

        // Reset input để có thể chọn lại cùng 1 file
        fileInput.value = '';
    };

    // 6. Xử lý nút Xóa ảnh
    removeBtn.onclick = () => {
        currentImageBase64 = null;
        previewContainer.style.display = 'none';
        previewImg.src = '';
        if (onImageChange) onImageChange(null);
    };

    // Trả về các hàm để UI chính có thể điều khiển
    return {
        getImage: () => currentImageBase64,
        clearImage: () => removeBtn.onclick(),
        getUploadButton: () => uploadBtn
    };
}
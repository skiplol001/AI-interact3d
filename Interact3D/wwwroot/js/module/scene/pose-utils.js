// ═══════════════════════════════════════════════════════════════
// pose-utils.js — Tính Bounding Box theo pose hiện tại
// (Fix lỗi SkinnedMesh.boundingBox bị cache)
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'https://esm.sh/three@0.160.0';

/**
 * Tính Bounding Box của toàn bộ object ở POSE HIỆN TẠI.
 * Khác với THREE.Box3().setFromObject() vì hàm đó dùng cache
 * boundingBox của SkinnedMesh (chỉ tính 1 lần ở bind pose).
 *
 * @param {THREE.Object3D} root
 * @returns {THREE.Box3}
 */
export function getPoseBox(root) {
    if (!root) return new THREE.Box3();

    const box = new THREE.Box3();
    const tmp = new THREE.Box3();

    root.updateMatrixWorld(true);

    root.traverse((n) => {
        if (n.isSkinnedMesh) {
            // Cập nhật skeleton theo pose hiện tại trước
            if (n.skeleton) n.skeleton.update();

            // ⭐ Tính lại boundingBox theo pose hiện tại
            // (computeBoundingBox tính từ position attribute của geometry gốc,
            //  nhưng khi kết hợp với boneMatrices qua matrixWorld sẽ ra pose đúng)
            n.computeBoundingBox();

            if (n.boundingBox) {
                tmp.copy(n.boundingBox).applyMatrix4(n.matrixWorld);
                box.union(tmp);
            }
        } else if (n.isMesh && n.geometry) {
            if (!n.geometry.boundingBox) n.geometry.computeBoundingBox();
            tmp.copy(n.geometry.boundingBox).applyMatrix4(n.matrixWorld);
            box.union(tmp);
        }
    });

    return box;
}

/**
 * Snap object xuống đất (chân chạm y=0) dựa theo pose hiện tại.
 * @param {THREE.Object3D} root
 * @param {number} targetY — độ cao mặt sàn đích (default 0)
 * @returns {number} — offset đã áp dụng (dương = kéo lên, âm = kéo xuống)
 */
export function snapToGround(root, targetY = 0) {
    if (!root) return 0;
    const bbox = getPoseBox(root);
    const offset = targetY - bbox.min.y;
    if (Math.abs(offset) > 0.005) {
        root.position.y += offset;
    }
    return offset;
}
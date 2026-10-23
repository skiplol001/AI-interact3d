// ═══════════════════════════════════════════════════════════════
// face-controller.js — v22 (Alive, Breathing & Smooth Anim)
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'https://esm.sh/three@0.160.0';

const FACES = ['neutral', 'happy', 'very_happy', 'sad', 'crying', 'angry', 'surprised', 'confused', 'thinking', 'blushing', 'heart', 'wink'];

export class FaceController {
    constructor(characterRoot, camera) {
        this.root = characterRoot;
        this.camera = camera;
        this.headBone = null;
        this.bubbleSprite = null;
        this.currentFace = 'neutral';

        // Trạng thái Animation
        this._popTime = 0;      // Thời gian nảy (khi đổi mặt)
        this._breatheTime = 0;  // Thời gian hít thở (liên tục)
        this._hoverTime = 0;    // Thời gian bồng bềnh

        this._baseScale = 0.55;

        // ⭐ VỊ TRÍ BONG BÓNG (Chếch trên bên trái, tránh che UI)
        this._offset = new THREE.Vector3(-0.55, 0.65, 0);

        this.canvas = document.createElement('canvas');
        this.canvas.width = 512;
        this.canvas.height = 512;
        this.ctx = this.canvas.getContext('2d');
        this.texture = new THREE.CanvasTexture(this.canvas);
        this.texture.colorSpace = THREE.SRGBColorSpace;

        this.images = {};

        characterRoot.traverse((n) => {
            if (n.isBone && !this.headBone) {
                const name = n.name.toLowerCase();
                if (name.includes('head') && !name.includes('top') && !name.includes('end')) this.headBone = n;
            }
        });

        if (!this.headBone) return;

        this._initSprite();
        this._loadFaces();
    }

    _initSprite() {
        const mat = new THREE.SpriteMaterial({
            map: this.texture,
            transparent: true,
            depthTest: false,
            depthWrite: false
        });

        this.bubbleSprite = new THREE.Sprite(mat);
        this.bubbleSprite.renderOrder = 999;
        this.bubbleSprite.visible = true;
        this.bubbleSprite.scale.set(this._baseScale, this._baseScale, 1);

        this.root.parent.add(this.bubbleSprite);
    }

    _loadFaces() {
        const loader = new THREE.ImageLoader();
        const basePath = '/uploads/faces/';

        FACES.forEach((name) => {
            loader.load(basePath + name + '.png', (img) => {
                this.images[name] = img;
                if (name === 'neutral') this._drawCanvas('neutral');
            });
        });
    }

    _drawCanvas(faceName) {
        const img = this.images[faceName];
        if (!img) return;

        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.clearRect(0, 0, w, h);

        const cx = w / 2;
        const cy = h / 2 - 40;

        // ═══ 1. VẼ ĐÁM MÂY (Thought Cloud) ═══
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 8;
        ctx.shadowColor = 'rgba(0,0,0,0.15)';
        ctx.shadowBlur = 15;
        ctx.shadowOffsetY = 8;

        const drawCloudPart = (x, y, r) => {
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        };

        ctx.shadowColor = 'transparent';

        drawCloudPart(cx - 60, cy - 20, 60);
        drawCloudPart(cx + 60, cy - 20, 60);
        drawCloudPart(cx, cy - 60, 70);
        drawCloudPart(cx - 40, cy + 40, 55);
        drawCloudPart(cx + 40, cy + 40, 55);

        // Xóa viền bên trong để nó liền mạch
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx, cy, 80, 0, Math.PI * 2);
        ctx.fill();

        // ═══ 2. VẼ ĐUÔI (Chĩa sang phải, hướng về đầu nhân vật) ═══
        const bubble1 = { x: cx + 60, y: cy + 110, r: 20 };
        const bubble2 = { x: cx + 90, y: cy + 160, r: 12 };
        const bubble3 = { x: cx + 110, y: cy + 190, r: 6 };

        [bubble1, bubble2, bubble3].forEach(b => {
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.lineWidth = 6;
            ctx.strokeStyle = '#cbd5e1';
            ctx.stroke();
        });

        // ═══ 3. VẼ KHUÔN MẶT ═══
        const faceSize = w * 0.5;
        ctx.drawImage(img, cx - faceSize / 2, cy - faceSize / 2 - 10, faceSize, faceSize);

        this.texture.needsUpdate = true;
    }

    setFace(faceName) {
        if (!this.bubbleSprite || !this.images[faceName]) return;

        // ⭐ CHỐNG SPAM: Nếu mặt không đổi, bỏ qua không reset animation
        if (this.currentFace === faceName) return;

        this.currentFace = faceName;
        this._drawCanvas(faceName);
        this._popTime = 0; // Reset hiệu ứng nảy
    }

    update() {
        if (!this.bubbleSprite || !this.headBone) return;

        // 1. Cập nhật vị trí bám theo đầu
        const headPos = new THREE.Vector3();
        this.headBone.getWorldPosition(headPos);

        // 2. Hiệu ứng bồng bềnh (Hovering) - Lên xuống nhẹ nhàng
        this._hoverTime += 0.02;
        const hoverOffset = Math.sin(this._hoverTime) * 0.03;

        this.bubbleSprite.position.copy(headPos).add(this._offset).add(new THREE.Vector3(0, hoverOffset, 0));

        // 3. Hiệu ứng hít thở (Breathing) - Phồng xẹp liên tục
        this._breatheTime += 0.03;
        const breatheScale = 1 + Math.sin(this._breatheTime) * 0.02; // Phồng lên 2%

        // 4. Hiệu ứng nảy (Pop) khi đổi cảm xúc
        let popScale = 1;
        if (this._popTime < 1) {
            this._popTime += 0.04;
            const s = 1 - Math.exp(-this._popTime * 4) * Math.cos(this._popTime * 12);
            popScale = Math.max(0.1, s);
        }

        // Kết hợp cả 3 hiệu ứng (Hít thở + Nảy + Kích thước gốc)
        const finalScale = this._baseScale * breatheScale * popScale;

        // Squash & Stretch nhẹ khi nảy
        if (this._popTime < 1) {
            const stretchY = 1 + Math.sin(this._popTime * Math.PI) * 0.15;
            const stretchX = 1 - Math.sin(this._popTime * Math.PI) * 0.05;
            this.bubbleSprite.scale.set(finalScale * stretchX, finalScale * stretchY, 1);
        } else {
            this.bubbleSprite.scale.set(finalScale, finalScale, 1);
        }
    }

    dispose() {
        if (this.bubbleSprite) {
            if (this.bubbleSprite.parent) this.bubbleSprite.parent.remove(this.bubbleSprite);
            this.bubbleSprite.material.dispose();
            this.texture.dispose();
            this.bubbleSprite = null;
        }
    }
}
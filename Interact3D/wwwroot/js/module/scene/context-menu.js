// ═══════════════════════════════════════════════════════════════
// ContextMenu — Menu chuột phải (FIX OrbitControls conflict)
//
// Fix:
//   ✅ Dùng `contextmenu` event (không bị pointer capture)
//   ✅ Track movement bằng `pointerdown` + `pointermove`
//   ✅ Phân biệt click vs drag bằng distance + time
//   ✅ Cross-platform (Windows/Mac)
// ═══════════════════════════════════════════════════════════════

export class ContextMenu {
    constructor(camera, canvas, options = {}) {
        this.camera = camera;
        this.canvas = canvas;
        this.getTarget = options.getTarget || (() => null);
        this.characterCtrl = options.characterCtrl || null;
        this.grabCtrl = options.grabCtrl || null;
        this.onAction = options.onAction || null;

        this._el = null;
        this._isOpen = false;

        // Track right-click state
        this._rmbDownPos = null;
        this._rmbMoved = false;

        this._initDOM();
        this._initEvents();
    }

    // ═══════════════════════════════════════════════════════════
    // DOM
    // ═══════════════════════════════════════════════════════════
    _initDOM() {
        if (document.getElementById('ctx-menu')) {
            this._el = document.getElementById('ctx-menu');
            return;
        }

        this._el = document.createElement('div');
        this._el.id = 'ctx-menu';
        this._el.className = 'context-menu';
        this._el.innerHTML = `
            <div class="context-menu-item" data-action="grab">
                <span>🤚</span> Nhấc bổng
            </div>
            <div class="context-menu-item" data-action="release">
                <span>⬇️</span> Thả xuống
            </div>
            <div class="context-menu-divider"></div>
            <div class="context-menu-item" data-action="reset">
                <span>🏠</span> Về gốc tọa độ
            </div>
        `;
        document.body.appendChild(this._el);

        this._el.querySelectorAll('.context-menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = item.dataset.action;
                this._handleAction(action);
                this.hide();
            });
        });
    }

    // ═══════════════════════════════════════════════════════════
    // EVENTS — Chống conflict với OrbitControls
    // ═══════════════════════════════════════════════════════════
    _initEvents() {
        // 1. Chặn menu mặc định của browser LUÔN LUÔN
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        // 2. Track right-button down
        this.canvas.addEventListener('pointerdown', (e) => {
            if (e.button === 2) {
                this._rmbDownPos = { x: e.clientX, y: e.clientY, time: performance.now() };
                this._rmbMoved = false;
            }
        });

        // 3. Track movement sau right-click
        this.canvas.addEventListener('pointermove', (e) => {
            if (!this._rmbDownPos) return;
            const dx = e.clientX - this._rmbDownPos.x;
            const dy = e.clientY - this._rmbDownPos.y;
            if (Math.hypot(dx, dy) > 8) {
                this._rmbMoved = true;
            }
        });

        // 4. ⭐ Xử lý contextmenu (fires reliably, không bị pointer capture)
        //    Đây là event THAY THẾ cho mouseup
        document.addEventListener('contextmenu', (e) => {
            // Chỉ xử lý nếu click trên canvas
            if (e.target !== this.canvas) return;
            e.preventDefault();

            if (!this._rmbDownPos) return;

            const dx = e.clientX - this._rmbDownPos.x;
            const dy = e.clientY - this._rmbDownPos.y;
            const dist = Math.hypot(dx, dy);
            const elapsed = performance.now() - this._rmbDownPos.time;
            const moved = this._rmbMoved;

            // Reset state
            this._rmbDownPos = null;
            this._rmbMoved = false;

            // ⭐ Nếu di chuyển > 8px hoặc giữ > 500ms → KHÔNG mở menu (đang drag)
            if (dist > 8 || moved || elapsed > 500) {
                return;
            }

            // Toggle menu
            if (this._isOpen) {
                this.hide();
                return;
            }

            // Kiểm tra có model trong scene không
            const target = this.getTarget();
            if (!target) {
                console.log('[CtxMenu] Không có model để mở menu');
                return;
            }

            console.log('[CtxMenu] Mở menu tại', e.clientX, e.clientY);
            this.show(e.clientX, e.clientY);
        });

        // 5. Click chuột trái ra ngoài → đóng menu
        document.addEventListener('pointerdown', (e) => {
            if (this._isOpen && !this._el.contains(e.target) && e.button === 0) {
                this.hide();
            }
        });

        // 6. ESC → đóng
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this._isOpen) this.hide();
        });
    }

    // ═══════════════════════════════════════════════════════════
    // SHOW / HIDE
    // ═══════════════════════════════════════════════════════════
    show(x, y) {
        this._isOpen = true;

        // Update items theo state
        if (this.characterCtrl) {
            const state = this.characterCtrl.state;
            const isHanging = (state === 'surprised' || state === 'hanging');
            const isFalling = (state === 'falling');
            const isBusy = (state === 'landing' || state === 'picking' || state === 'putting');

            const grabItem = this._el.querySelector('[data-action="grab"]');
            const releaseItem = this._el.querySelector('[data-action="release"]');
            const resetItem = this._el.querySelector('[data-action="reset"]');

            grabItem.style.display = isHanging || isBusy ? 'none' : 'flex';
            releaseItem.style.display = isHanging ? 'flex' : 'none';
            resetItem.style.display = isFalling || isBusy ? 'none' : 'flex';
        }

        // Đặt vị trí
        this._el.style.left = `${x}px`;
        this._el.style.top = `${y}px`;
        this._el.classList.add('show');

        // Đảm bảo không tràn màn hình
        requestAnimationFrame(() => {
            const rect = this._el.getBoundingClientRect();
            if (rect.right > window.innerWidth) {
                this._el.style.left = `${window.innerWidth - rect.width - 10}px`;
            }
            if (rect.bottom > window.innerHeight) {
                this._el.style.top = `${window.innerHeight - rect.height - 10}px`;
            }
        });
    }

    hide() {
        this._isOpen = false;
        this._el.classList.remove('show');
    }

    // ═══════════════════════════════════════════════════════════
    // ACTION HANDLER
    // ═══════════════════════════════════════════════════════════
    _handleAction(action) {
        if (this.onAction) {
            this.onAction(action);
            return;
        }

        switch (action) {
            case 'grab':
                if (this.grabCtrl) this.grabCtrl.grab(this.getTarget());
                break;

            case 'release':
                if (this.grabCtrl) this.grabCtrl.release();
                break;

            case 'reset':
                if (this.characterCtrl) {
                    const target = this.getTarget();
                    if (target) {
                        target.position.set(0, 0, 0);
                        target.rotation.set(0, 0, 0);
                    }
                }
                break;
        }
    }

    dispose() {
        this._el?.remove();
    }
}
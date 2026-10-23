// ═══════════════════════════════════════════════════════════════
// context-menu.js — v11 (Accordion + Paint + Build tools)
// ═══════════════════════════════════════════════════════════════

export class ContextMenu {
    constructor(camera, canvas, options = {}) {
        this.camera = camera;
        this.canvas = canvas;
        this.getTarget = options.getTarget || (() => null);
        this.characterCtrl = options.characterCtrl || null;
        this.grabCtrl = options.grabCtrl || null;
        this.onAction = options.onAction || null;
        this.onToolChange = options.onToolChange || null;

        this.currentTool = 'navigate';

        // ═══ TOOL DEFINITIONS (có group) ═══
        this._tools = [
            { id: 'navigate', label: 'Điều hướng', icon: '🖐️', group: 'interact' },
            { id: 'poke', label: 'Chọc', icon: '👆', group: 'interact' },
            { id: 'pet', label: 'Vuốt ve', icon: '🤚', group: 'interact' },
            { id: 'drag', label: 'Kéo tay', icon: '💪', group: 'interact' },

            { id: 'attract', label: 'Thu hút', icon: '✨', group: 'minigame' },
            { id: 'play_rps', label: 'Oẳn Tù Tì', icon: '✌️', group: 'minigame', actionOnly: true },

            { id: 'kick', label: 'Đá Box', icon: '🦵', group: 'object' },
            { id: 'place_slingshot', label: 'Đặt Ná', icon: '🎯', group: 'object' },
            { id: 'build', label: 'Xây dựng', icon: '🧱', group: 'object' },

            { id: 'paint', label: 'Vẽ tranh', icon: '🎨', group: 'create', actionOnly: true },
        ];

        // ═══ GROUP DEFINITIONS ═══
        this._groups = [
            { id: 'interact', label: 'Tương tác', icon: '👆' },
            { id: 'minigame', label: 'Minigame', icon: '🎮' },
            { id: 'object', label: 'Vật thể', icon: '📦' },
            { id: 'create', label: 'Sáng tạo', icon: '🎨' },
        ];

        // ═══ ACTION DEFINITIONS ═══
        this._actions = [
            { id: 'grab', label: 'Nhấc bổng', icon: '🤚' },
            { id: 'release', label: 'Thả xuống', icon: '⬇️' },
            { id: 'reset', label: 'Về gốc', icon: '🏠' },
        ];

        // ═══ EXPANDED STATE ═══
        this._expandedGroups = new Set(['interact']);

        this._el = null;
        this._isOpen = false;
        this._rmbDownPos = null;
        this._rmbMoved = false;

        this._touchTimer = null;
        this._touchStartPos = null;

        this._boundOnCtxMenu = (e) => this._onCtxMenu(e);
        this._boundOnPointerDown = (e) => this._onPointerDown(e);
        this._boundOnPointerMove = (e) => this._onPointerMove(e);
        this._boundOnPointerUp = (e) => this._onPointerUp(e);
        this._boundOnDocPointerDown = (e) => this._onDocPointerDown(e);
        this._boundOnKeyDown = (e) => this._onKeyDown(e);

        this._initDOM();
        this._initEvents();
    }

    _initDOM() {
        if (document.getElementById('ctx-menu')) {
            this._el = document.getElementById('ctx-menu');
            return;
        }

        this._el = document.createElement('div');
        this._el.id = 'ctx-menu';
        this._el.className = 'context-menu';

        // Groups HTML
        const groupsHTML = this._groups.map(g => {
            const toolsInGroup = this._tools.filter(t => t.group === g.id);
            if (toolsInGroup.length === 0) return '';

            const toolsHTML = toolsInGroup.map(t => `
                <div class="context-menu-item ctx-tool-item" data-tool="${t.id}">
                    <span class="ctx-tool-icon">${t.icon}</span>
                    <span class="ctx-tool-label">${t.label}</span>
                    <span class="ctx-tool-check" data-tool-check="${t.id}" style="margin-left: auto; opacity: 0; color: #38bdf8;">✓</span>
                </div>
            `).join('');

            return `
                <div class="ctx-group" data-group="${g.id}">
                    <div class="ctx-group-header" data-group-toggle="${g.id}">
                        <span class="ctx-group-icon">${g.icon}</span>
                        <span class="ctx-group-label">${g.label}</span>
                        <span class="ctx-group-count">${toolsInGroup.length}</span>
                        <span class="ctx-group-arrow">▶</span>
                    </div>
                    <div class="ctx-group-items">
                        ${toolsHTML}
                    </div>
                </div>
            `;
        }).join('');

        // Actions HTML
        const actionsHTML = this._actions.map(a => `
            <div class="context-menu-item" data-action="${a.id}">
                <span>${a.icon}</span> ${a.label}
            </div>
        `).join('');

        this._el.innerHTML = `
            ${groupsHTML}
            <div class="context-menu-divider"></div>
            ${actionsHTML}
        `;
        document.body.appendChild(this._el);

        // CSS
        if (!document.getElementById('ctx-menu-style-v3')) {
            const style = document.createElement('style');
            style.id = 'ctx-menu-style-v3';
            style.textContent = `
                .context-menu { 
                    position: fixed; background: #1e293b; border: 1px solid #334155; 
                    border-radius: 8px; padding: 4px 0; min-width: 170px; 
                    box-shadow: 0 8px 24px rgba(0,0,0,0.7); z-index: 10000; 
                    display: none; font-family: 'Segoe UI', sans-serif; touch-action: none; 
                    user-select: none; max-height: 85vh; overflow-y: auto;
                }
                .context-menu.show { display: block; }
                .context-menu::-webkit-scrollbar { width: 6px; }
                .context-menu::-webkit-scrollbar-thumb { background: #475569; border-radius: 3px; }

                .ctx-group { border-bottom: 1px solid rgba(51,65,85,0.4); }
                .ctx-group:last-of-type { border-bottom: none; }
                .ctx-group-header {
                    display: flex; align-items: center; gap: 8px;
                    padding: 7px 10px; cursor: pointer; color: #cbd5e1;
                    font-size: 12px; font-weight: 700;
                    transition: background 0.15s, color 0.15s;
                }
                .ctx-group-header:hover { background: rgba(56,189,248,0.1); color: #38bdf8; }
                .ctx-group-icon { font-size: 14px; width: 18px; text-align: center; }
                .ctx-group-label { flex: 1; }
                .ctx-group-count {
                    font-size: 9px; color: #64748b; background: rgba(51,65,85,0.6);
                    padding: 1px 6px; border-radius: 8px; font-weight: 600;
                }
                .ctx-group-arrow {
                    font-size: 9px; color: #64748b;
                    transition: transform 0.2s ease, color 0.15s;
                    display: inline-block;
                }
                .ctx-group.expanded .ctx-group-arrow {
                    transform: rotate(90deg); color: #38bdf8;
                }

                .ctx-group-items {
                    display: none; padding: 2px 0 4px 0;
                    background: rgba(15,23,42,0.4);
                    border-top: 1px solid rgba(51,65,85,0.3);
                }
                .ctx-group.expanded .ctx-group-items { display: block; }

                .context-menu-item { 
                    display: flex; align-items: center; gap: 8px; 
                    padding: 5px 10px 5px 18px; color: #cbd5e1; cursor: pointer; 
                    font-size: 12px; transition: background 0.1s; 
                }
                .context-menu-item:hover { background: rgba(56, 189, 248, 0.15); color: #38bdf8; }
                .context-menu-item.ctx-tool-item.active { 
                    background: rgba(56, 189, 248, 0.2); color: #38bdf8; font-weight: 600; 
                    border-left: 2px solid #38bdf8; padding-left: 16px;
                }
                .context-menu-divider { height: 1px; background: #334155; margin: 4px 6px; }
                .ctx-tool-icon { font-size: 13px; width: 18px; text-align: center; }
            `;
            document.head.appendChild(style);
        }

        this._bindItemEvents();
        this._refreshToolUI();
    }

    _bindItemEvents() {
        // Group toggle
        this._el.querySelectorAll('[data-group-toggle]').forEach(header => {
            header.addEventListener('click', (e) => {
                e.stopPropagation();
                const groupId = header.dataset.groupToggle;
                this._toggleGroup(groupId);
            });
        });

        // Tool items
        this._el.querySelectorAll('.ctx-tool-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const toolId = item.dataset.tool;
                this._setTool(toolId);
                this.hide();
            });
        });

        // Action items
        this._el.querySelectorAll('[data-action]').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                this._handleAction(item.dataset.action);
                this.hide();
            });
        });
    }

    // ═══════════════════════════════════════════════════════════
    // GROUP EXPAND / COLLAPSE
    // ═══════════════════════════════════════════════════════════
    _toggleGroup(groupId) {
        if (this._expandedGroups.has(groupId)) {
            this._expandedGroups.delete(groupId);
        } else {
            this._expandedGroups.add(groupId);
        }
        this._refreshGroupUI();
    }

    _refreshGroupUI() {
        if (!this._el) return;
        this._el.querySelectorAll('.ctx-group').forEach(groupEl => {
            const groupId = groupEl.dataset.group;
            groupEl.classList.toggle('expanded', this._expandedGroups.has(groupId));
        });
    }

    _autoExpandCurrentToolGroup() {
        const tool = this._tools.find(t => t.id === this.currentTool);
        if (tool?.group && !this._expandedGroups.has(tool.group)) {
            this._expandedGroups.add(tool.group);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // TOOL / ACTION HANDLERS
    // ═══════════════════════════════════════════════════════════
    _setTool(toolId) {
        const toolDef = this._tools.find(t => t.id === toolId);

        // ─── Paint (actionOnly — fullscreen, không sticky) ───
        if (toolDef?.actionOnly && toolId === 'paint') {
            if (window.paintController) {
                window.paintController.open();
            } else {
                console.warn('[ContextMenu] paintController chưa init');
            }
            this.currentTool = 'navigate';
            this._refreshToolUI();
            if (this.onToolChange) this.onToolChange('navigate');
            return;
        }

        // ─── RPS (actionOnly — open UI, không sticky) ───
        if (toolDef?.actionOnly && toolId === 'play_rps') {
            if (window.minigameRPS) window.minigameRPS.start();
            this.currentTool = 'navigate';
            this._refreshToolUI();
            if (this.onToolChange) this.onToolChange('navigate');
            return;
        }

        // ─── Build (sticky tool — toggle) ───
        if (toolId === 'build') {
            if (!window.buildController) {
                console.warn('[ContextMenu] buildController chưa init');
                return;
            }

            // Toggle nếu đang active
            if (window.buildController.isActive) {
                window.buildController.setEnabled(false);
                this.currentTool = 'navigate';
                this._refreshToolUI();
                if (this.onToolChange) this.onToolChange('navigate');
                return;
            }

            // Bật build
            window.buildController.setEnabled(true);
            this.currentTool = 'build';
            this._refreshToolUI();
            if (this.onToolChange) this.onToolChange('build');
            return;
        }

        // ─── Normal tool — sticky ───
        this.currentTool = toolId;
        this._refreshToolUI();
        if (this.onToolChange) this.onToolChange(toolId);
    }

    _refreshToolUI() {
        if (!this._el) return;
        this._el.querySelectorAll('.ctx-tool-item').forEach(item => {
            item.classList.toggle('active', item.dataset.tool === this.currentTool);
        });
        this._el.querySelectorAll('[data-tool-check]').forEach(chk => {
            chk.style.opacity = chk.dataset.toolCheck === this.currentTool ? '1' : '0';
        });
        this._refreshGroupUI();
    }

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

    // ═══════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════
    _initEvents() {
        this.canvas.addEventListener('contextmenu', this._boundOnCtxMenu);
        this.canvas.addEventListener('pointerdown', this._boundOnPointerDown);
        this.canvas.addEventListener('pointermove', this._boundOnPointerMove);
        this.canvas.addEventListener('pointerup', this._boundOnPointerUp);

        document.addEventListener('contextmenu', this._boundOnCtxMenu);
        document.addEventListener('pointerdown', this._boundOnDocPointerDown);
        document.addEventListener('keydown', this._boundOnKeyDown);
    }

    _onCtxMenu(e) {
        if (e.target !== this.canvas) return;
        e.preventDefault();
        if (!this._rmbDownPos) return;

        const dx = e.clientX - this._rmbDownPos.x;
        const dy = e.clientY - this._rmbDownPos.y;
        const dist = Math.hypot(dx, dy);
        const elapsed = performance.now() - this._rmbDownPos.time;
        const moved = this._rmbMoved;

        this._rmbDownPos = null;
        this._rmbMoved = false;

        if (dist > 8 || moved || elapsed > 500) return;

        if (this._isOpen) {
            this.hide();
            return;
        }

        const target = this.getTarget();
        if (!target) return;

        this.show(e.clientX, e.clientY);
    }

    _onPointerDown(e) {
        if (e.pointerType === 'touch') {
            this._touchStartPos = { x: e.clientX, y: e.clientY };
            if (this._touchTimer) clearTimeout(this._touchTimer);
            this._touchTimer = setTimeout(() => {
                this._touchTimer = null;
                if (this._isOpen) return;
                const target = this.getTarget();
                if (target) this.show(e.clientX, e.clientY);
            }, 600);
            return;
        }

        if (e.button === 2) {
            this._rmbDownPos = { x: e.clientX, y: e.clientY, time: performance.now() };
            this._rmbMoved = false;
        }
    }

    _onPointerMove(e) {
        if (e.pointerType === 'touch' && this._touchTimer && this._touchStartPos) {
            const dist = Math.hypot(e.clientX - this._touchStartPos.x, e.clientY - this._touchStartPos.y);
            if (dist > 10) {
                clearTimeout(this._touchTimer);
                this._touchTimer = null;
            }
            return;
        }

        if (!this._rmbDownPos) return;
        const dx = e.clientX - this._rmbDownPos.x;
        const dy = e.clientY - this._rmbDownPos.y;
        if (Math.hypot(dx, dy) > 8) {
            this._rmbMoved = true;
        }
    }

    _onPointerUp(e) {
        if (e.pointerType === 'touch' && this._touchTimer) {
            clearTimeout(this._touchTimer);
            this._touchTimer = null;
        }
    }

    _onDocPointerDown(e) {
        if (this._isOpen && !this._el.contains(e.target) && e.button === 0) {
            this.hide();
        }
    }

    _onKeyDown(e) {
        if (e.key === 'Escape' && this._isOpen) this.hide();
    }

    show(x, y) {
        if (!this._el) return;
        this._isOpen = true;

        this._autoExpandCurrentToolGroup();
        this._refreshToolUI();

        if (this.characterCtrl) {
            const state = this.characterCtrl.state;
            const isHanging = (state === 'surprised' || state === 'hanging');
            const isFalling = (state === 'falling');
            const isBusy = (state === 'landing' || state === 'picking' || state === 'putting');

            const grabItem = this._el.querySelector('[data-action="grab"]');
            const releaseItem = this._el.querySelector('[data-action="release"]');
            const resetItem = this._el.querySelector('[data-action="reset"]');

            if (grabItem) grabItem.style.display = isHanging || isBusy ? 'none' : 'flex';
            if (releaseItem) releaseItem.style.display = isHanging ? 'flex' : 'none';
            if (resetItem) resetItem.style.display = isFalling || isBusy ? 'none' : 'flex';
        }

        this._el.style.left = `${x}px`;
        this._el.style.top = `${y}px`;
        this._el.classList.add('show');

        requestAnimationFrame(() => {
            if (!this._el) return;
            const rect = this._el.getBoundingClientRect();
            if (rect.right > window.innerWidth) this._el.style.left = `${window.innerWidth - rect.width - 10}px`;
            if (rect.bottom > window.innerHeight) this._el.style.top = `${window.innerHeight - rect.height - 10}px`;
        });
    }

    hide() {
        this._isOpen = false;
        if (this._el) this._el.classList.remove('show');
    }

    dispose() {
        if (this._touchTimer) clearTimeout(this._touchTimer);
        if (this.canvas) {
            this.canvas.removeEventListener('contextmenu', this._boundOnCtxMenu);
            this.canvas.removeEventListener('pointerdown', this._boundOnPointerDown);
            this.canvas.removeEventListener('pointermove', this._boundOnPointerMove);
            this.canvas.removeEventListener('pointerup', this._boundOnPointerUp);
        }
        document.removeEventListener('contextmenu', this._boundOnCtxMenu);
        document.removeEventListener('pointerdown', this._boundOnDocPointerDown);
        document.removeEventListener('keydown', this._boundOnKeyDown);

        if (this._el) {
            this._el.remove();
            this._el = null;
        }
        console.log('[ContextMenu] Disposed');
    }
}
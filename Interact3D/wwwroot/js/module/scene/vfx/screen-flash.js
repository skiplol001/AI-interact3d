// ═══════════════════════════════════════════════════════════════
// vfx/screen-flash.js — Screen flash overlay
// ═══════════════════════════════════════════════════════════════

export function initScreenFlash(vfx) {
    if (document.getElementById('vfx-screen-flash')) {
        vfx._screenFlashEl = document.getElementById('vfx-screen-flash');
        return;
    }
    const el = document.createElement('div');
    el.id = 'vfx-screen-flash';
    el.style.cssText = `position: fixed; inset: 0; pointer-events: none; z-index: 9997; opacity: 0; background: radial-gradient(circle at center, rgba(255,255,255,0.9) 0%, rgba(255,100,0,0.6) 30%, rgba(15,23,42,0.2) 60%, transparent 85%); transition: opacity 0.05s ease-in;`;
    document.body.appendChild(el);
    vfx._screenFlashEl = el;
    vfx._flashTimer = null;
}

export function triggerScreenFlash(vfx, duration = 800) {
    if (!vfx._screenFlashEl) return;
    const el = vfx._screenFlashEl;
    el.style.transition = 'opacity 0.05s ease-in';
    el.style.opacity = '1';
    clearTimeout(vfx._flashTimer);
    vfx._flashTimer = setTimeout(() => {
        el.style.transition = `opacity ${duration}ms cubic-bezier(0.4, 0, 0.6, 1)`;
        el.style.opacity = '0';
    }, 60);
}
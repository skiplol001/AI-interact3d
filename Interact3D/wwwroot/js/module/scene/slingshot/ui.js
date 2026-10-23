// ═══════════════════════════════════════════════════════════════
// slingshot/ui.js — Hint, controls, crosshair
// ═══════════════════════════════════════════════════════════════

export function createSlingshotUI(self) {
    // Hint el
    self.hintEl = document.createElement('div');
    self.hintEl.id = 'slingshot-hint';
    self.hintEl.style.cssText = `position: fixed; top: 15px; left: 50%; transform: translateX(-50%); background: rgba(15, 23, 42, 0.85); color: #38bdf8; padding: 4px 12px; border-radius: 6px; border: 1px solid #334155; font-family: 'Segoe UI', sans-serif; font-size: 10px; font-weight: 600; display: none; z-index: 9999; box-shadow: 0 2px 8px rgba(0,0,0,0.4); pointer-events: none; text-align: center; opacity: 0.9; letter-spacing: 0.3px;`;
    self.hintEl.innerHTML = '🎯 Nhấn <span style="color:#fbbf24;">[F]</span> để ngắm bắn';
    document.body.appendChild(self.hintEl);

    // Controls el
    self.controlsEl = document.createElement('div');
    self.controlsEl.id = 'slingshot-controls-ui';
    self.controlsEl.style.cssText = `position: fixed; bottom: 15px; left: 15px; background: rgba(15, 23, 42, 0.88); border: 1px solid #334155; border-radius: 8px; padding: 6px 12px; display: none; flex-direction: row; gap: 10px; align-items: center; z-index: 10000; pointer-events: none; font-family: 'Segoe UI', sans-serif; color: #cbd5e1; box-shadow: 0 4px 12px rgba(0,0,0,0.6); opacity: 0.92;`;
    self.controlsEl.innerHTML = `
        <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 10px; color: #94a3b8; font-weight: 600;">LỰC</span>
            <div style="width: 70px; height: 6px; background: #1e293b; border-radius: 3px; overflow: hidden;">
                <div id="sl-power-fill" style="width: 0%; height: 100%; background: linear-gradient(90deg, #10b981, #f59e0b, #ef4444); transition: width 0.03s linear;"></div>
            </div>
            <span id="sl-power-val" style="font-size: 11px; color: #ef4444; font-weight: 700; min-width: 30px;">0%</span>
        </div>
        <div style="width: 1px; height: 14px; background: #334155;"></div>
        <div style="display: flex; align-items: center; gap: 4px;">
            <span style="font-size: 10px; color: #94a3b8; font-weight: 600;">GÓC</span>
            <span id="sl-pitch-val" style="font-size: 11px; color: #38bdf8; font-weight: 700;">0°</span>
        </div>
    `;
    document.body.appendChild(self.controlsEl);
    self.powerValEl = document.getElementById('sl-power-val');
    self.pitchValEl = document.getElementById('sl-pitch-val');
    self.powerFillEl = document.getElementById('sl-power-fill');

    // Crosshair el
    self.crosshairEl = document.createElement('div');
    self.crosshairEl.id = 'slingshot-crosshair';
    self.crosshairEl.style.cssText = `position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 18px; height: 18px; display: none; z-index: 9998; pointer-events: none;`;
    self.crosshairEl.innerHTML = `
        <div style="position: absolute; top: 8px; left: 0; width: 18px; height: 1.5px; background: #38bdf8;"></div>
        <div style="position: absolute; top: 0; left: 8px; width: 1.5px; height: 18px; background: #38bdf8;"></div>
        <div style="position: absolute; top: 6px; left: 6px; width: 6px; height: 6px; border-radius: 50%; border: 1px solid #38bdf8;"></div>
    `;
    document.body.appendChild(self.crosshairEl);
}
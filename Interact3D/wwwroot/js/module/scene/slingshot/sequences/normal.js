// ═══════════════════════════════════════════════════════════════
// slingshot/sequences/normal.js — Normal: Epic Magic Build-up
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'https://esm.sh/three@0.160.0';
import { SEQ_LINES, pickLine } from '../config.js';

export async function normalSequence(self) {
    const ctrl = self.ctrl;
    if (!ctrl) return;

    // ═══ PHASE 1: ĐẾN CHỖ NÁ & BẮT ĐẦU CHUẨN BỊ ═══
    if (window.emotionCtrl) window.emotionCtrl.trigger('surprised', { force: true });
    await self._delay(500);

    const sl = self.slingshot;
    if (!sl) return;
    const approach = self._getApproachPos(sl.position, 1.0);
    ctrl.goTo(approach);
    await self._waitForIdle(ctrl, 8000);

    // Quay mặt về phía người chơi (camera)
    const camPos = self.camera.position;
    const charPos = ctrl.root.position;
    ctrl.root.rotation.y = Math.atan2(camPos.x - charPos.x, camPos.z - charPos.z);
    await self._delay(300);

    // Vỗ tay & Mỉa mai
    if (window.emotionCtrl) window.emotionCtrl.trigger('clapping', { force: true });
    self._showLine(pickLine(SEQ_LINES.normal.dissNá), 'normal');
    await self._delay(2000);

    // ═══ PHASE 2: RẶN CHIÊU - MA PHÁP TIẾN HÓA TỪ TỪ ═══
    self._showLine('Nhìn cái ná này là thấy ngu rồi 😏', 'normal');
    if (window.emotionCtrl) window.emotionCtrl.trigger('taunt', { force: true });
    await self._delay(1000);

    const ringPos = ctrl.root.position.clone();
    ringPos.y = 0.05; // Neo sát mặt đất dưới chân

    // --- Giai đoạn 1: Ma pháp cơ bản (Vòng tròn sáng vàng) ---
    self._showLine('Để tao dạy cho mày biết thế nào là sức mạnh thực sự! 😈', 'angry');
    if (window.emotionCtrl) window.emotionCtrl.trigger('angry', { force: true });

    if (window.vfxSystem && window.vfxSystem.createMagicRitual) {
        window.vfxSystem.createMagicRitual(ringPos, {
            layers: [
                { tex: 'magicTex', scale: 8, color: 0xffc02e, opacity: 0.8, spinDir: 1, spinSpeed: 0.02 }
            ],
            particleCount: 20, particleColor: 0xffc02e, particleSpeed: 1.0,
            duration: 6000, cameraRecoil: 0.05
        });
    }
    self._shakeScreen(0.5, 500);
    await self._delay(1500);

    // --- Giai đoạn 2: Ma pháp trung cấp (Lục giác & Rune chữ cổ) ---
    self._showLine('Vòng tròn thứ nhất... triệu hồi! ✨', 'angry');
    if (window.vfxSystem && window.vfxSystem.createMagicRitual) {
        window.vfxSystem.createMagicRitual(ringPos, {
            layers: [
                { tex: 'hexagramTex', scale: 12, color: 0x00ffff, opacity: 0.9, spinDir: -1, spinSpeed: 0.05 },
                { tex: 'runeTex', scale: 10, color: 0xffffff, opacity: 0.8, spinDir: 1, spinSpeed: 0.06 }
            ],
            particleCount: 40, particleColor: 0x00ffff, particleSpeed: 2.5,
            duration: 4500, cameraRecoil: 0.1
        });
    }
    self._shakeScreen(1.0, 800);
    self._fovKick(0.2);
    await self._delay(1500);

    // --- Giai đoạn 3: Cực đại ma pháp (Sigil bùng nổ, trụ sáng, vòng bay) ---
    self._showLine('Gia tăng ma lực... phá hủy! 🔥', 'angry');

    if (window.vfxSystem && window.vfxSystem.createMagicRitual) {
        window.vfxSystem.createMagicRitual(ringPos, {
            layers: [
                { tex: 'sigilTex', scale: 16, color: 0xff8800, opacity: 1.0, spinDir: -1, spinSpeed: 0.03 },
                { tex: 'magicTex', scale: 18, color: 0xff0044, opacity: 0.8, spinDir: 1, spinSpeed: 0.08 },
                { tex: 'hexagramTex', scale: 14, color: 0xffffff, opacity: 0.7, spinDir: -1, spinSpeed: 0.1 }
            ],
            particleCount: 100, particleColor: 0xff8800, particleSpeed: 5.0,
            duration: 3000, cameraRecoil: 0.2
        });
    }

    if (window.vfxSystem && window.vfxSystem.createOrbitingRing) {
        for (let i = 0; i < 8; i++) {
            setTimeout(() => {
                if (window.vfxSystem) {
                    const pos = ringPos.clone();
                    pos.y += 0.5 + Math.random() * 2.5;
                    window.vfxSystem.createOrbitingRing(pos, 0x00ffff);
                }
            }, i * 100);
        }
    }

    if (window.vfxSystem && window.vfxSystem.createMagicGate) {
        window.vfxSystem.createMagicGate(ringPos, new THREE.Vector3(0, 1, 0), 0xff0044, 1.0);
    }

    self._shakeScreen(2.5, 1500);
    self._fovKick(0.6);
    await self._delay(1500);

    // ═══ PHASE 3: SÚT BAY CÂY NÁ (FULL POWER KICK) ═══
    const kickDur = ctrl.actions['kick'] ? (ctrl.actions['kick'].getClip().duration * 1000) : 1000;

    if (window.emotionCtrl) window.emotionCtrl.trigger('kick', { force: true });
    self._showLine('SÚT BAY! 🦵', 'angry');

    await self._delay(kickDur * 0.3);

    const startPos = new THREE.Vector3();
    sl.getWorldPosition(startPos);
    self.scene.attach(sl);
    sl.quaternion.identity();

    const flyDir = new THREE.Vector3().subVectors(camPos, charPos);
    flyDir.y = 0.2;
    flyDir.normalize();

    const FLY_COLOR = 0x00ffff;
    const FLY_SPEED = 65;
    const FLY_DURATION = 0.65;

    if (window.vfxSystem) {
        if (window.vfxSystem.createLaunchBurst) window.vfxSystem.createLaunchBurst(startPos, flyDir, 1.0);
        if (window.vfxSystem.createSonicBoom) window.vfxSystem.createSonicBoom(startPos, flyDir, 1.0);
        if (window.vfxSystem.createProjectileEffect) self.projectileFX = window.vfxSystem.createProjectileEffect();
    }

    self._shakeScreen(3.5, 500);
    self._fovKick(1.0);

    // ═══ Vòng lặp bay ═══
    const spinAxis = new THREE.Vector3().crossVectors(flyDir, new THREE.Vector3(0, 1, 0)).normalize();
    const spinPerFrame = (Math.PI * 16) / 60;

    await new Promise(resolve => {
        const t0 = performance.now();
        let lastTrail = 0;

        const tick = () => {
            const elapsed = (performance.now() - t0) / 1000;
            if (elapsed >= FLY_DURATION) { resolve(); return; }

            sl.position.copy(startPos).addScaledVector(flyDir, FLY_SPEED * elapsed);
            sl.position.y -= 3.5 * elapsed * elapsed;

            sl.rotateOnWorldAxis(spinAxis, spinPerFrame);

            const now = performance.now();
            if (now - lastTrail > 22 && window.vfxSystem) {
                lastTrail = now;
                const vfx = window.vfxSystem;
                const vel = flyDir.clone().multiplyScalar(FLY_SPEED);
                if (vfx.createGhostTrail) vfx.createGhostTrail(sl.position, FLY_COLOR);
                if (vfx.createPowerStreak) vfx.createPowerStreak(sl.position, vel, FLY_COLOR);
                if (vfx.createWindTears) vfx.createWindTears(sl.position, flyDir, FLY_COLOR);
                if (Math.random() < 0.6 && vfx.createFireParticle) vfx.createFireParticle(sl.position, FLY_COLOR);
                if (Math.random() < 0.35 && vfx.createMagicGate) vfx.createMagicGate(sl.position, flyDir, FLY_COLOR, 1.0);
            }

            if (self.projectileFX) {
                self.projectileFX.update(1 / 60, sl.position, flyDir, 1.0, true, FLY_SPEED, FLY_COLOR, 1.0);
            }

            requestAnimationFrame(tick);
        };
        tick();
    });

    // ═══ PHASE 4: NỔ TUNG & CLEANUP ═══
    const impactPos = sl.position.clone();
    if (window.vfxSystem) {
        if (window.vfxSystem.createMidAirExplosion) window.vfxSystem.createMidAirExplosion(impactPos, FLY_COLOR);
        if (window.vfxSystem.createFireExplosion) window.vfxSystem.createFireExplosion(impactPos, FLY_COLOR);
    }
    self._shakeScreen(5.0, 800);

    if (self.projectileFX) {
        self.projectileFX.reset();
        if (self.projectileFX.dispose) self.projectileFX.dispose();
        self.projectileFX = null;
    }

    await self._delay(500);
    self._showLine(pickLine(SEQ_LINES.normal.warnNextTime), 'taunt');
    await self._delay(1500);

    // Xóa hoàn toàn mesh
    self.scene.remove(sl);
    sl.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
            else child.material.dispose();
        }
    });

    self.slingshot = null;
    self.rock = null;
    self.rockLight = null;
    self.rubberBands = [];
    self.state = 'idle';
    if (self.hintEl) self.hintEl.style.display = 'none';

    self._blockSlingshot(10000);
    const hudStatus = document.getElementById('hud-status');
    if (hudStatus) {
        hudStatus.innerText = `😏 Ná đã bị sút bay. Chờ 10s để đặt ná mới.`;
        setTimeout(() => {
            if (hudStatus) hudStatus.innerText = ctrl.getStateText?.() || 'Đứng yên';
        }, 4000);
    }

    if (window.emotionCtrl) window.emotionCtrl.trigger('idle', { force: true });
}
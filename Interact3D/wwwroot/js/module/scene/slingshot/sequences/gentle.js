// ═══════════════════════════════════════════════════════════════
// slingshot/sequences/gentle.js — Nhặt → Carry-walk → Cất
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'https://esm.sh/three@0.160.0';
import { SEQ_LINES, pickLine } from '../config.js?v=6';

export async function gentleSequence(self) {
    const ctrl = self.ctrl;
    if (!ctrl) return;

    // 1. Ngạc nhiên
    if (window.emotionCtrl) window.emotionCtrl.trigger('surprised', { force: true });
    await self._delay(500);

    // 2. Sad
    if (window.emotionCtrl) window.emotionCtrl.trigger('sad', { force: true });
    await self._delay(1000);

    // 3. Đến chỗ ná
    const sl = self.slingshot;
    if (!sl) return;
    const approach = self._getApproachPos(sl.position, 1.0);
    ctrl.goTo(approach);
    await self._waitForIdle(ctrl, 8000);

    // 4. Face ná
    const dx = sl.position.x - ctrl.root.position.x;
    const dz = sl.position.z - ctrl.root.position.z;
    ctrl.root.rotation.y = Math.atan2(dx, dz);

    // 5. Cúi nhặt
    if (window.emotionCtrl) window.emotionCtrl.trigger('picking', { force: true });
    await self._delay(600);

    // 6. Seal ritual
    if (window.vfxSystem?.createSealRitual) {
        await window.vfxSystem.createSealRitual(sl.position.clone(), 1800);
    }

    // 7. Attach ná
    self._carryingSl = sl;
    sl.userData.carried = true;
    ctrl.root.attach(sl);
    sl.position.set(0.35, 1.1, 0.4);
    sl.rotation.set(0, 0, 0);

    // 8. Switch carryIdle
    ctrl.state = 'carryIdle';
    ctrl._playAnim('carryIdle');
    await self._delay(400);

    // 9. Walk tới góc phòng
    const cornerPos = new THREE.Vector3(0, 0, -5);
    ctrl.goTo(cornerPos);
    ctrl.state = 'carryWalk';
    ctrl._playAnim('carryWalk');

    await new Promise(resolve => {
        const start = performance.now();
        const check = setInterval(() => {
            if (ctrl.state === 'idle' || ctrl.state === 'carryIdle' ||
                performance.now() - start > 15000) {
                clearInterval(check);
                resolve();
            }
        }, 100);
    });

    // 10. Face camera
    const camPos = self.camera.position;
    ctrl.root.rotation.y = Math.atan2(camPos.x - ctrl.root.position.x, camPos.z - ctrl.root.position.z);
    await self._delay(200);

    // 11. Putdown anim
    ctrl.state = 'putting';
    ctrl._playAnim('putdown');
    await self._delay(700);

    // 12. Detach ná
    const worldPos = new THREE.Vector3();
    sl.getWorldPosition(worldPos);
    self.scene.attach(sl);
    sl.position.set(worldPos.x, 0, worldPos.z);
    sl.rotation.set(0, ctrl.root.rotation.y, 0);

    self._carryingSl = null;
    sl.userData.carried = false;
    ctrl.state = 'idle';
    ctrl._playAnim('idle');

    // 13. Line
    self._showLine(pickLine(SEQ_LINES.gentle.sealed), 'sad');
    await self._delay(1200);

    // 14. XÓA HẲN MESH
    self.scene.remove(sl);
    sl.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
            else child.material.dispose();
        }
    });

    // 15. Reset slingshot state
    self.slingshot = null;
    self.rock = null;
    self.rockLight = null;
    self.rubberBands = [];
    self.state = 'idle';
    if (self.hintEl) self.hintEl.style.display = 'none';

    // 16. Block 15s
    self._blockSlingshot(15000);

    // 17. Thông báo
    const hudStatus = document.getElementById('hud-status');
    if (hudStatus) {
        hudStatus.innerText = `🌸 Ná đã được cất an toàn. Chờ 15s để đặt ná mới.`;
        setTimeout(() => {
            if (hudStatus) hudStatus.innerText = ctrl.getStateText?.() || 'Đứng yên';
        }, 4000);
    }

    // 18. Bonus bubble
    if (window.showCharacterMessage) {
        setTimeout(() => {
            window.showCharacterMessage('(Ná đã được cất vào góc phòng rồi nha 🌸)', 'normal');
        }, 1000);
    }

    // 19. Idle
    if (window.emotionCtrl) window.emotionCtrl.trigger('idle', { force: true });
}
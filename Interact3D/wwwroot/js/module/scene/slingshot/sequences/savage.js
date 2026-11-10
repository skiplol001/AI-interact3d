// ═══════════════════════════════════════════════════════════════
// slingshot/sequences/savage.js — Kick + Barrage + Camera kick
// ═══════════════════════════════════════════════════════════════
import { SEQ_LINES, pickLine } from '../config.js';

export async function savageSequence(self) {
    const ctrl = self.ctrl;
    if (!ctrl) return;

    if (window.emotionCtrl) window.emotionCtrl.trigger('dismissing', { force: true });
    await self._delay(800);

    if (window.vfxSystem) window.vfxSystem.createShieldShatter(ctrl.root.position);
    await self._delay(800);

    const sl = self.slingshot;
    if (!sl) return;

    const approach = self._getApproachPos(sl.position, 1.3);
    ctrl.goTo(approach);
    await self._waitForIdle(ctrl, 8000);

    const dx = sl.position.x - ctrl.root.position.x;
    const dz = sl.position.z - ctrl.root.position.z;
    ctrl.root.rotation.y = Math.atan2(dx, dz);

    if (window.emotionCtrl) window.emotionCtrl.trigger('kick', { force: true });
    await self._delay(500);

    if (window.vfxSystem) window.vfxSystem.createFireExplosion(sl.position.clone(), 0xff0044);
    self.destroy();
    self._blockSlingshot(30000);

    self._showLine(pickLine(SEQ_LINES.savage.rageAfterDestroy), 'angry');
    await self._delay(1200);

    const camPos = self.camera.position;
    ctrl.root.rotation.y = Math.atan2(camPos.x - ctrl.root.position.x, camPos.z - ctrl.root.position.z);
    await self._delay(300);

    if (window.emotionCtrl) window.emotionCtrl.trigger('emo_magic_attack', { force: true });
    self._showLine(pickLine(SEQ_LINES.savage.beforeMagic), 'angry');
    await self._delay(600);

    if (window.vfxSystem?.createFireballBarrage) {
        try {
            await Promise.race([
                window.vfxSystem.createFireballBarrage(ctrl.root.position, self.camera, 14),
                self._delay(6000).then(() => {
                    console.warn('[Savage] Barrage timeout — continuing');
                }),
            ]);
        } catch (e) {
            console.warn('[Savage] Barrage error:', e);
        }
    } else {
        self._rainRocksOnCamera(14);
        await self._delay(1800);
    }

    await self._delay(500);

    await self._cinematicCameraKick();

    if (window.emotionCtrl) window.emotionCtrl.trigger('sitting', { force: true, hold: true });
    await self._delay(1500);

    self._showLine(pickLine(SEQ_LINES.savage.afterSit), 'angry');
    await self._delay(3000);
}
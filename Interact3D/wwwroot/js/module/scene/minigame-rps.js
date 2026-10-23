// ═══════════════════════════════════════════════════════════════
// minigame-rps.js — Rock-Paper-Scissors Minigame
// ═══════════════════════════════════════════════════════════════

export class MinigameRPS {
    constructor(characterCtrl, emotionCtrl) {
        this.ctrl = characterCtrl;
        this.emotion = emotionCtrl;
        this.isPlaying = false;
        this._uiEl = null;
    }

    start() {
        if (this.isPlaying) return;
        if (!this.ctrl || this.ctrl.isBusy()) {
            if (window.showCharacterMessage) window.showCharacterMessage('Đang bận không chơi được!', 'unclear');
            return;
        }

        this.isPlaying = true;
        this._createUI();
        if (window.showCharacterMessage) window.showCharacterMessage('Chơi oẳn tù tì hả? Ra tay đi!', 'happy');

        // Hiệu ứng chờ
        if (this.emotion) this.emotion.trigger('thinking', { force: true });
    }

    _createUI() {
        if (document.getElementById('rps-ui')) return;

        const el = document.createElement('div');
        el.id = 'rps-ui';
        el.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background: rgba(15, 23, 42, 0.95); border: 2px solid #38bdf8;
            border-radius: 12px; padding: 20px; z-index: 10000;
            display: flex; flex-direction: column; align-items: center; gap: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.8); font-family: 'Segoe UI', sans-serif;
        `;

        el.innerHTML = `
            <h3 style="color: #38bdf8; margin: 0; font-size: 18px;">Oẳn Tù Tì</h3>
            <p style="color: #cbd5e1; margin: 0; font-size: 14px;">Chọn vũ khí của bạn:</p>
            <div style="display: flex; gap: 15px; margin-top: 10px;">
                <button data-choice="rock" style="font-size: 30px; padding: 10px 20px; background: #1e293b; border: 1px solid #475569; border-radius: 8px; cursor: pointer; transition: 0.2s;" onmouseover="this.style.background='#334155'" onmouseout="this.style.background='#1e293b'">✊</button>
                <button data-choice="paper" style="font-size: 30px; padding: 10px 20px; background: #1e293b; border: 1px solid #475569; border-radius: 8px; cursor: pointer; transition: 0.2s;" onmouseover="this.style.background='#334155'" onmouseout="this.style.background='#1e293b'">🖐️</button>
                <button data-choice="scissors" style="font-size: 30px; padding: 10px 20px; background: #1e293b; border: 1px solid #475569; border-radius: 8px; cursor: pointer; transition: 0.2s;" onmouseover="this.style.background='#334155'" onmouseout="this.style.background='#1e293b'">✌️</button>
            </div>
            <button id="rps-cancel" style="margin-top: 10px; background: transparent; border: none; color: #ef4444; cursor: pointer; font-size: 12px;">Hủy</button>
        `;

        document.body.appendChild(el);
        this._uiEl = el;

        el.querySelectorAll('[data-choice]').forEach(btn => {
            btn.onclick = () => this._play(btn.dataset.choice);
        });

        el.querySelector('#rps-cancel').onclick = () => this._close();
    }

    _play(userChoice) {
        const choices = ['rock', 'paper', 'scissors'];
        const aiChoice = choices[Math.floor(Math.random() * choices.length)];

        let result = 'tie'; // win (user win), lose (ai win), tie
        if (userChoice === aiChoice) result = 'tie';
        else if (
            (userChoice === 'rock' && aiChoice === 'scissors') ||
            (userChoice === 'paper' && aiChoice === 'rock') ||
            (userChoice === 'scissors' && aiChoice === 'paper')
        ) result = 'win'; // Player wins
        else result = 'lose'; // AI wins

        this._close();
        this._handleResult(result, userChoice, aiChoice);
    }

    _handleResult(result, userChoice, aiChoice) {
        // Đợi 0.5s để animation thinking kết thúc
        setTimeout(() => {
            const mapVi = { rock: 'Búa ✊', paper: 'Bao 🖐️', scissors: 'Kéo ✌️' };
            const userStr = mapVi[userChoice];
            const aiStr = mapVi[aiChoice];

            if (result === 'win') {
                // Người chơi thắng -> AI buồn / nhún vai
                if (this.emotion) this.emotion.trigger('shrugging', { force: true });
                if (window.AIReaction) window.AIReaction('rps_win');
                if (window.showCharacterMessage) window.showCharacterMessage(`Tớ ra ${aiStr}, bạn ra ${userStr}. Bạn thắng rồi!`, 'sad');
            } else if (result === 'lose') {
                // Người chơi thua -> AI khiêu khích
                if (this.emotion) this.emotion.trigger('taunt', { force: true });
                if (window.AIReaction) window.AIReaction('rps_lose');
                if (window.showCharacterMessage) window.showCharacterMessage(`Tớ ra ${aiStr}, bạn ra ${userStr}. Tớ thắng!`, 'happy');
            } else {
                // Hòa -> AI vỗ tay
                if (this.emotion) this.emotion.trigger('clapping', { force: true });
                if (window.AIReaction) window.AIReaction('rps_tie');
                if (window.showCharacterMessage) window.showCharacterMessage(`Cả hai cùng ra ${aiStr}. Hòa nhé!`, 'normal');
            }

            this.isPlaying = false;
        }, 500);
    }

    _close() {
        if (this._uiEl) {
            this._uiEl.remove();
            this._uiEl = null;
        }
        // Nếu hủy giữa chừng mà chưa có kết quả
        if (this.isPlaying) {
            this.isPlaying = false;
            if (this.emotion) this.emotion.trigger('idle', { force: true });
        }
    }

    dispose() {
        this._close();
        this.ctrl = null;
        this.emotion = null;
    }
}
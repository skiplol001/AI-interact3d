// ═══════════════════════════════════════════════════════════════
// vfx/textures.js — Texture generators cho VFX
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'https://esm.sh/three@0.160.0';

export function generateParticleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.2)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
}

export function generateSparkTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 32; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.8)');
    grad.addColorStop(0.5, 'rgba(255,255,255,1)');
    grad.addColorStop(0.75, 'rgba(255,255,255,0.8)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad; ctx.fillRect(11, 0, 10, 128);
    const g2 = ctx.createRadialGradient(16, 64, 0, 16, 64, 32);
    g2.addColorStop(0, 'rgba(255,255,255,0.9)');
    g2.addColorStop(0.5, 'rgba(255,255,255,0.3)');
    g2.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g2; ctx.fillRect(0, 0, 32, 128);
    return new THREE.CanvasTexture(canvas);
}

export function generateMagicCircleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 512, 512);
    ctx.translate(256, 256);
    ctx.beginPath(); ctx.arc(0, 0, 240, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 1)'; ctx.lineWidth = 8; ctx.stroke();
    ctx.shadowColor = '#ffaa00'; ctx.shadowBlur = 20; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 200, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'; ctx.lineWidth = 4; ctx.stroke();
    ctx.save();
    for (let i = 0; i < 48; i++) {
        ctx.rotate((Math.PI * 2) / 48);
        ctx.beginPath(); ctx.moveTo(215, 0); ctx.lineTo(225, -10); ctx.lineTo(235, 0); ctx.lineTo(225, 10); ctx.closePath();
        ctx.fillStyle = i % 4 === 0 ? 'rgba(255, 200, 0, 1)' : 'rgba(255, 100, 0, 0.8)';
        ctx.fill();
    }
    ctx.restore();
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI * 2) / 6 - Math.PI / 2;
        const x = Math.cos(angle) * 180; const y = Math.sin(angle) * 180;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'; ctx.lineWidth = 5; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 80, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 1)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'; ctx.fill();
    return new THREE.CanvasTexture(canvas);
}

export function generateHexagramTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 512, 512);
    ctx.translate(256, 256);
    ctx.beginPath(); ctx.arc(0, 0, 230, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 200, 100, 0.8)'; ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 1)'; ctx.lineWidth = 6;
    for (let j = 0; j < 2; j++) {
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
            const angle = (i * Math.PI * 2) / 3 - Math.PI / 2 + j * Math.PI;
            const x = Math.cos(angle) * 200; const y = Math.sin(angle) * 200;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath(); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(0, 0, 100, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'; ctx.lineWidth = 3; ctx.stroke();
    return new THREE.CanvasTexture(canvas);
}

export function generateRuneRingTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 512, 512);
    ctx.translate(256, 256);
    ctx.beginPath(); ctx.arc(0, 0, 240, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'; ctx.lineWidth = 6; ctx.stroke();
    ctx.font = '30px monospace'; ctx.fillStyle = 'rgba(255, 255, 255, 1)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const runes = ['ᚠ', 'ᚢ', 'ᚦ', 'ᚨ', 'ᚱ', 'ᚲ', 'ᚷ', 'ᚹ', 'ᚺ', 'ᚾ', 'ᛁ', 'ᛃ', 'ᛇ', 'ᛈ', 'ᛉ', 'ᛊ', 'ᛏ', 'ᛒ', 'ᛖ', 'ᛗ', 'ᛚ', 'ᛜ', 'ᛞ', 'ᛟ'];
    for (let i = 0; i < 24; i++) {
        ctx.save();
        ctx.rotate((i * Math.PI * 2) / 24);
        ctx.translate(0, -215);
        ctx.fillText(runes[i % runes.length], 0, 0);
        ctx.restore();
    }
    return new THREE.CanvasTexture(canvas);
}

export function generateSmallRuneTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
    ctx.translate(64, 64);
    ctx.beginPath(); ctx.arc(0, 0, 50, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.font = '20px monospace'; ctx.fillStyle = 'rgba(255, 255, 255, 1)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const runes = ['ᚠ', 'ᚦ', 'ᚱ', 'ᚷ', 'ᛁ', 'ᛊ', 'ᛏ', 'ᛟ'];
    for (let i = 0; i < 8; i++) {
        ctx.save();
        ctx.rotate((i * Math.PI * 2) / 8);
        ctx.translate(0, -35);
        ctx.fillText(runes[i], 0, 0);
        ctx.restore();
    }
    return new THREE.CanvasTexture(canvas);
}

export function generateArcaneSigilTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 512, 512);
    ctx.translate(256, 256);
    ctx.beginPath(); ctx.arc(0, 0, 200, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = 'rgba(200, 240, 255, 1)'; ctx.lineWidth = 4;
    for (let i = 0; i < 8; i++) {
        ctx.beginPath();
        ctx.arc(0, 0, 160, i * Math.PI / 4, (i + 1) * Math.PI / 4);
        ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-200, -200); ctx.lineTo(200, 200);
    ctx.moveTo(-200, 200); ctx.lineTo(200, -200);
    ctx.stroke();
    return new THREE.CanvasTexture(canvas);
}
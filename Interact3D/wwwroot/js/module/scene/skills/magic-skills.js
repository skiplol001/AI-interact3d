// ═══════════════════════════════════════════════════════════════
// magic-skills.js — v4 (Anime Fantasy Edition)
//  • Cột lửa  : Vòng tròn ma pháp (Rune/Hexagram) xếp tầng → Cột sáng năng lượng
//               → Tia Laser khổng lồ giáng từ trời → Nổ (Megumin style)
//  • Sấy lửa  : vận sức của ná (createChargingEffect) → tia lửa thon → dày
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'https://esm.sh/three@0.160.0';

// ───────────────────────────────────────────────────────────────
// TUNABLE
// ───────────────────────────────────────────────────────────────
const PILLAR_DIST = 3.5;          // khoảng cách trận pháp trước mặt nhân vật
const PILLAR_FACE_OFFSET = 0.45;  // lệch góc so với camera
const BEAM_LEN = 30;              // độ dài tia lửa (Sấy lửa)
const BEAM_OUTER_R = 2.4;         // bán kính lớp ngoài (Sấy lửa)
const EXPLOSION_SCALE = 1.0;      // ☄ độ lớn vụ nổ cuối

// ───────────────────────────────────────────────────────────────
// HELPERS
// ───────────────────────────────────────────────────────────────
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;
const remap = (e, a, b) => clamp01((e - a) / (b - a));
const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInCubic = (t) => t * t * t;
const pick = (a) => a[(Math.random() * a.length) | 0];

const WHITE = new THREE.Color(0xffffff);
const RED = new THREE.Color(0xff1100);
const HOTC = new THREE.Color(0xffd070);
const DIMRED = new THREE.Color(1, 0.55, 0.45);
const DARKFIRE = new THREE.Color(0x6a1000);
const _c1 = new THREE.Color();

const FIRE_PAL = [0xff3300, 0xff6600, 0xffaa00, 0xffdd55];
const HOT_PAL = [0xffe488, 0xffcc55, 0xffaa33];

const beamProf = (s) => 0.06 + 0.94 * Math.pow(s, 1.7);

function additiveMat(opts) {
    return new THREE.MeshBasicMaterial({
        transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide, ...opts
    });
}

// ───────────────────────────────────────────────────────────────
// SHARED RESOURCES
// ───────────────────────────────────────────────────────────────
let RES = null;

function makeFlameTex(fadeV) {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 256;
    const g = c.getContext('2d');
    for (let i = 0; i < 48; i++) {
        const x = Math.random() * 64, w = 1 + Math.random() * 4;
        const y0 = Math.random() * 256 - 40, h = 50 + Math.random() * 190;
        const a = (0.3 + Math.random() * 0.7).toFixed(2);
        const grd = g.createLinearGradient(0, y0, 0, y0 + h);
        grd.addColorStop(0, 'rgba(255,255,255,0)');
        grd.addColorStop(0.5, `rgba(255,255,255,${a})`);
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd;
        g.fillRect(x, y0, w, h);
        g.fillRect(x - 64, y0, w, h);
    }
    g.globalCompositeOperation = 'destination-over';
    g.fillStyle = 'rgba(255,255,255,0.3)';
    g.fillRect(0, 0, 64, 256);
    if (fadeV) {
        g.globalCompositeOperation = 'destination-in';
        const f = g.createLinearGradient(0, 0, 0, 256);
        f.addColorStop(0, 'rgba(255,255,255,0)');
        f.addColorStop(0.55, 'rgba(255,255,255,0.8)');
        f.addColorStop(1, 'rgba(255,255,255,1)');
        g.fillStyle = f;
        g.fillRect(0, 0, 64, 256);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function makeFireballTex() {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, S, S);
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 150; i++) {
        const x = Math.random() * S, y = Math.random() * S;
        const r = rnd(10, 46), a = rnd(0.25, 0.85);
        for (const ox of [-S, 0, S]) {
            const grd = g.createRadialGradient(x + ox, y, 0, x + ox, y, r);
            grd.addColorStop(0, `rgba(255,255,255,${a})`);
            grd.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = grd;
            g.fillRect(x + ox - r, y - r, r * 2, r * 2);
        }
    }
    g.globalCompositeOperation = 'multiply';
    for (let i = 0; i < 40; i++) {
        const x = Math.random() * S, y = Math.random() * S, r = rnd(8, 28);
        for (const ox of [-S, 0, S]) {
            const grd = g.createRadialGradient(x + ox, y, 0, x + ox, y, r);
            grd.addColorStop(0, 'rgba(0,0,0,0.65)');
            grd.addColorStop(1, 'rgba(255,255,255,1)');
            g.fillStyle = grd;
            g.fillRect(x + ox - r, y - r, r * 2, r * 2);
        }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function getRes() {
    if (RES) return RES;
    const plane = new THREE.PlaneGeometry(1, 1);
    const ring = new THREE.RingGeometry(0.86, 1, 64);
    ring.rotateX(-Math.PI / 2);
    const torus = new THREE.TorusGeometry(1, 0.035, 6, 32);
    const torusFat = new THREE.TorusGeometry(1, 0.28, 12, 40);
    torusFat.rotateX(Math.PI / 2);
    const sphere = new THREE.SphereGeometry(1, 32, 24);
    const band = new THREE.CylinderGeometry(0.88, 1, 1, 48, 1, true);
    band.translate(0, 0.5, 0);
    const pillar = new THREE.CylinderGeometry(0.75, 1, 1, 28, 1, true);
    pillar.translate(0, 0.5, 0);

    const pts = [];
    for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        pts.push(new THREE.Vector2(beamProf(t), t));
    }
    const beam = new THREE.LatheGeometry(pts, 28);
    beam.rotateX(Math.PI / 2);

    RES = {
        plane, ring, torus, torusFat, sphere, band, pillar, beam,
        texBeamA: makeFlameTex(false),
        texBeamB: makeFlameTex(false),
        texFire: makeFireballTex(),
    };
    RES.texBeamA.repeat.set(2, 5);
    RES.texBeamB.repeat.set(3, 8);
    RES.texFire.repeat.set(2, 1);
    return RES;
}

// ───────────────────────────────────────────────────────────────
// PARTICLES & RINGS
// ───────────────────────────────────────────────────────────────
function makeParticles(vfx, N = 520) {
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    const base = new Float32Array(N * 3), vel = new Float32Array(N * 3);
    const life = new Float32Array(N), max = new Float32Array(N), grav = new Float32Array(N);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.PointsMaterial({
        size: 0.42, map: vfx.particleTexture, vertexColors: true, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;

    let head = 0, hot = false;
    return {
        points,
        emit(x, y, z, vx, vy, vz, lf, hex, g = 0) {
            const i = head; head = (head + 1) % N;
            const i3 = i * 3;
            pos[i3] = x; pos[i3 + 1] = y; pos[i3 + 2] = z;
            vel[i3] = vx; vel[i3 + 1] = vy; vel[i3 + 2] = vz;
            life[i] = max[i] = lf; grav[i] = g;
            base[i3] = ((hex >> 16) & 255) / 255;
            base[i3 + 1] = ((hex >> 8) & 255) / 255;
            base[i3 + 2] = (hex & 255) / 255;
            hot = true;
        },
        step(dt) {
            if (!hot) return;
            let any = false;
            for (let i = 0; i < N; i++) {
                const l = life[i];
                if (l <= 0) continue;
                const i3 = i * 3;
                const nl = l - dt;
                life[i] = nl;
                if (nl <= 0) { col[i3] = col[i3 + 1] = col[i3 + 2] = 0; continue; }
                any = true;
                vel[i3 + 1] += grav[i] * dt;
                pos[i3] += vel[i3] * dt;
                pos[i3 + 1] += vel[i3 + 1] * dt;
                pos[i3 + 2] += vel[i3 + 2] * dt;
                const k = Math.min(1, (nl / max[i]) * 2.2);
                col[i3] = base[i3] * k; col[i3 + 1] = base[i3 + 1] * k; col[i3 + 2] = base[i3 + 2] * k;
            }
            geo.attributes.position.needsUpdate = true;
            geo.attributes.color.needsUpdate = true;
            hot = any;
        },
        dispose() { geo.dispose(); mat.dispose(); }
    };
}

function makeShockRings(scene, n = 5) {
    const items = [];
    const R = getRes();
    for (let i = 0; i < n; i++) {
        const mat = additiveMat({ color: 0xffffff });
        const mesh = new THREE.Mesh(R.ring, mat);
        mesh.visible = false;
        scene.add(mesh);
        items.push({ mesh, mat, age: 0, dur: 1, R: 1, op: 1, on: false });
    }
    let next = 0;
    return {
        spawn(x, y, z, radius, dur, hex, op = 0.9) {
            const it = items[next]; next = (next + 1) % n;
            it.mesh.position.set(x, y, z);
            it.mat.color.setHex(hex);
            it.R = radius; it.dur = dur; it.op = op; it.age = 0; it.on = true;
            it.mesh.visible = true;
        },
        step(dt) {
            for (const it of items) {
                if (!it.on) continue;
                it.age += dt;
                const t = it.age / it.dur;
                if (t >= 1) { it.on = false; it.mesh.visible = false; continue; }
                it.mesh.scale.setScalar(lerp(0.2, 1, easeOutCubic(t)) * it.R);
                it.mat.opacity = it.op * (1 - t) * (1 - t);
            }
        },
        dispose() {
            for (const it of items) { scene.remove(it.mesh); it.mat.dispose(); }
        }
    };
}

function makeFovKick(cam) {
    const ok = cam && cam.isPerspectiveCamera;
    const base = ok ? cam.fov : 0;
    let k = 0, dirty = false;
    return {
        kick(a) { if (ok) k += a; },
        step(dt) {
            if (!ok) return;
            if (Math.abs(k) < 0.01) {
                if (dirty) { cam.fov = base; cam.updateProjectionMatrix(); dirty = false; }
                k = 0; return;
            }
            cam.fov = base + k; cam.updateProjectionMatrix(); dirty = true;
            k *= Math.exp(-7 * dt);
        },
        restore() { if (ok && cam.fov !== base) { cam.fov = base; cam.updateProjectionMatrix(); } }
    };
}

// ═══════════════════════════════════════════════════════════════
// MIXIN
// ═══════════════════════════════════════════════════════════════
export const magicSkillsMixin = {

    warmupMagicSkills() { getRes(); },

    _msTimeline(total, update) {
        return new Promise((resolve, reject) => {
            let last = performance.now();
            const t0 = last;
            const tick = (now) => {
                const dt = Math.max(0, Math.min((now - last) / 1000, 0.05));
                last = now;
                const e = (now - t0) / 1000;
                try { update(e, dt); } catch (err) { reject(err); return; }
                if (e >= total) resolve(); else requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        });
    },

    // ═══════════════════════════════════════════════════════════
    // KỸ NĂNG 1: CỘT LỬA (PILLAR OF FIRE) — ANIME FANTASY
    // ═══════════════════════════════════════════════════════════
    async playPillarOfFire(mode) {
        if (this.isPlaying) return;
        this.isPlaying = true;
        this._lockControls();

        const R = getRes();
        const vfx = this.vfx, ctrl = this.ctrl, cam = this.camera, scene = this.scene;
        const K = mode === 'savage' ? 1.3 : mode === 'gentle' ? 0.75 : 1;
        const EXP = EXPLOSION_SCALE * (mode === 'savage' ? 1.25 : mode === 'gentle' ? 0.8 : 1);
        const shake = (i, ms) => vfx._shakeScreen?.(i * K, ms);
        const flash = (ms) => vfx._triggerScreenFlash?.(ms);

        const disposables = [];
        const root = new THREE.Group();
        const fov = makeFovKick(cam);
        let particles = null, rings = null;

        try {
            const charPos = ctrl.root.position.clone();
            const yaw = Math.atan2(cam.position.x - charPos.x, cam.position.z - charPos.z) + PILLAR_FACE_OFFSET;
            ctrl.root.rotation.y = yaw;

            const gy = charPos.y;
            const cx = charPos.x + Math.sin(yaw) * PILLAR_DIST;
            const cz = charPos.z + Math.cos(yaw) * PILLAR_DIST;
            const center = new THREE.Vector3(cx, gy, cz);
            root.position.set(cx, gy + 0.03, cz);
            scene.add(root);

            this.emotion.trigger('dismissing', { force: true });

            const T = { summon: 0.5, charge: 2.5, strike: 3.5, land: 3.7, boom1: 4.5, boom2: 5.0, end: 9.5 };

            particles = makeParticles(vfx, 1100);
            scene.add(particles.points);
            rings = makeShockRings(scene, 10);

            const burst = (x, y, z, n, sh, sv, life, pal, g) => {
                for (let i = 0; i < n; i++) {
                    const a = rnd(0, 6.283), s = rnd(0.3, 1) * sh;
                    particles.emit(x, y, z, Math.cos(a) * s, rnd(-0.2, 1) * sv, Math.sin(a) * s,
                        life * rnd(0.6, 1.1), pick(pal), g);
                }
            };

            // ───── MẶT ĐẤT: QUẦNG SÁNG ─────
            const groundMat = additiveMat({ map: vfx.magicTex, color: 0xff2200 });
            const groundMesh = new THREE.Mesh(R.plane, groundMat);
            groundMesh.rotation.x = -Math.PI / 2;
            groundMesh.position.y = 0.02;
            groundMesh.visible = false;
            root.add(groundMesh);
            disposables.push(groundMat);

            // ───── THÁP MA PHÁP (Magic Circles xếp tầng) ─────
            const CIRCLE_DEFS = [
                { tex: 'magicTex', r: 4.5, y: 0.05, color: 0xff3300, spin: 0.8 },
                { tex: 'runeTex', r: 3.8, y: 0.6, color: 0xff6600, spin: -1.2 },
                { tex: 'hexagramTex', r: 3.2, y: 1.2, color: 0xffaa00, spin: 1.5 },
                { tex: 'magicTex', r: 2.6, y: 1.8, color: 0xff4400, spin: -2.0 },
                { tex: 'runeTex', r: 2.0, y: 2.4, color: 0xff8800, spin: 2.5 },
                { tex: 'sigilTex', r: 1.5, y: 3.0, color: 0xffcc44, spin: -3.0 },
            ];
            const circles = CIRCLE_DEFS.map(d => {
                const mat = additiveMat({ map: vfx[d.tex] || vfx.magicTex, color: d.color });
                disposables.push(mat);
                const mesh = new THREE.Mesh(R.plane, mat);
                mesh.rotation.x = -Math.PI / 2;
                mesh.position.y = d.y;
                mesh.scale.setScalar(d.r * 2);
                mesh.visible = false;
                root.add(mesh);
                return { mesh, mat, spin: d.spin, r: d.r, y: d.y };
            });

            // ───── CỘT SÁNG NĂNG LƯỢNG (Core Vortex) ─────
            const VORTEX_DEFS = [
                { r: 0.8, h: 5.0, color: 0xff5500, spin: 3.0, op: 0.8 },
                { r: 0.4, h: 6.0, color: 0xffaa00, spin: -4.5, op: 0.9 },
                { r: 0.15, h: 7.0, color: 0xffffff, spin: 6.0, op: 1.0 },
            ];
            const vortexes = VORTEX_DEFS.map(d => {
                const mat = additiveMat({ color: d.color });
                disposables.push(mat);
                const mesh = new THREE.Mesh(R.pillar, mat);
                mesh.position.y = 0;
                mesh.scale.set(d.r, d.h, d.r);
                mesh.visible = false;
                root.add(mesh);
                return { mesh, mat, spin: d.spin, op: d.op };
            });

            // ───── TIA LASER GIÁNG TỪ TRỜI ─────
            const COL_LEN = 26;
            const STRIKE_DEFS = [
                { r: 1.5, color: 0xff2200, op: 0.8, spin: 2.0 },
                { r: 0.8, color: 0xffaa00, op: 0.9, spin: -3.0 },
                { r: 0.3, color: 0xffffff, op: 1.0, spin: 5.0 },
            ];
            const strikes = STRIKE_DEFS.map(d => {
                const mat = additiveMat({ color: d.color });
                disposables.push(mat);
                const mesh = new THREE.Mesh(R.pillar, mat);
                mesh.position.y = COL_LEN;
                mesh.visible = false;
                root.add(mesh);
                return { mesh, mat, r: d.r, op: d.op, spin: d.spin };
            });

            // ═════ ☄ EXPLOSION (Megumin) ═════
            const mkAdd = (geo, map, color) => {
                const mat = additiveMat({ map: map || null, color });
                disposables.push(mat);
                const mesh = new THREE.Mesh(geo, mat);
                mesh.visible = false;
                root.add(mesh);
                return { mesh, mat };
            };
            const fbOuter = mkAdd(R.sphere, R.texFire, 0xff5a18);
            const fbMid = mkAdd(R.sphere, R.texFire, 0xffa030);
            const fbCore = mkAdd(R.sphere, R.texFire, 0xfff0c0);
            const dome = mkAdd(R.sphere, null, 0xff8833);
            const mStem = mkAdd(R.pillar, null, 0xff6a20);
            const mStem2 = mkAdd(R.pillar, null, 0xffc070);
            const mCap = mkAdd(R.sphere, R.texFire, 0xff5a1a);
            const mCapIn = mkAdd(R.sphere, R.texFire, 0xffb050);
            const mRim = mkAdd(R.torusFat, R.texFire, 0xffa040);

            const lava = mkAdd(R.plane, vfx.particleTexture, 0xff3a00);
            lava.mesh.rotation.x = -Math.PI / 2;
            const scorchMat = new THREE.MeshBasicMaterial({
                map: vfx.particleTexture, color: 0x060201, transparent: true, opacity: 0,
                depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1
            });
            disposables.push(scorchMat);
            const scorch = new THREE.Mesh(R.plane, scorchMat);
            scorch.rotation.x = -Math.PI / 2;
            scorch.position.y = -0.02;
            scorch.visible = false;
            root.add(scorch);

            let dt_ = 0.016;
            const setSph = (L, rad, op, y, spin, ys = 0.92) => {
                if (op > 0.01 && rad > 0.01) {
                    L.mesh.visible = true;
                    L.mesh.position.set(0, y, 0);
                    L.mesh.scale.set(rad, rad * ys, rad);
                    L.mesh.rotation.y += dt_ * spin;
                    L.mat.opacity = clamp01(op);
                } else L.mesh.visible = false;
            };
            const setCyl = (L, r, h, op, spin, yBase = 0) => {
                if (op > 0.01 && h > 0.01) {
                    L.mesh.visible = true;
                    L.mesh.position.set(0, yBase, 0);
                    L.mesh.scale.set(r, h, r);
                    L.mesh.rotation.y += dt_ * spin;
                    L.mat.opacity = clamp01(op);
                } else L.mesh.visible = false;
            };

            // ───── TIMELINE ─────
            const cur = { e: 0 };
            const fired = {};
            const at = (key, t, fn) => {
                if (!fired[key] && cur.e >= t) { fired[key] = true; fn(); }
            };
            let lastShake = 0;
            const EMBER = FIRE_PAL.concat(HOT_PAL);

            const step = (e, dt) => {
                cur.e = e;
                dt_ = dt;

                const heat = remap(e, T.charge, T.strike);
                const u = remap(e, T.land, T.boom1);
                const flashK = e >= T.land ? 1 - remap(e, T.land, T.land + 0.3) : 0;
                const spinMul = e < T.charge ? 1 : e < T.strike ? lerp(1, 3, heat) : lerp(3, 8, u);
                const b1 = remap(e, T.boom1, T.boom1 + 0.75);

                // ═══ EVENTS ═══
                at('cast', T.summon, () => {
                    rings.spawn(cx, gy + 0.05, cz, 6, 1.0, 0xff4400, 0.9);
                    shake(1.0, 300);
                });

                at('strike', T.strike, () => {
                    shake(2.0, 300); fov.kick(2);
                    burst(cx, gy + 15, cz, 50, 3, 8, 0.7, HOT_PAL, 5);
                });

                at('land', T.land, () => {
                    flash(400); shake(6, 800); fov.kick(6);
                    rings.spawn(cx, gy + 0.1, cz, 12, 0.8, 0xffcc66, 1);
                    rings.spawn(cx, gy + 3, cz, 8, 0.6, 0xffaa33, 0.9);
                    burst(cx, gy + 0.5, cz, 100, 10, 10, 0.9, HOT_PAL, -8);
                    vfx.createGroundImpact?.(center.clone(), 2.5, 0xff8800);
                });

                at('boom1', T.boom1, () => {
                    flash(300); shake(5, 700); fov.kick(5);
                    rings.spawn(cx, gy + 0.1, cz, 14, 0.9, 0xff5500, 1);
                    rings.spawn(cx, gy + 2.5, cz, 8, 0.7, 0xffbb44, 0.8);
                    burst(cx, gy + 2.5, cz, 200, 12, 6, 1.1, EMBER, -6);
                    vfx.createFireExplosion?.(new THREE.Vector3(cx, gy + 1.5, cz), 0xff3300);
                    vfx.createMidAirExplosion?.(new THREE.Vector3(cx, gy + 3.5, cz), 0xffaa00);
                });

                at('boom2', T.boom2, () => {
                    flash(900); shake(12, 2200); fov.kick(12);
                    rings.spawn(cx, gy + 0.1, cz, 40 * EXP, 1.5, 0xff6a20, 0.9);
                    rings.spawn(cx, gy + 0.15, cz, 26 * EXP, 1.1, 0xffdd88, 1);
                    rings.spawn(cx, gy + 0.2, cz, 14 * EXP, 0.7, 0xffffff, 1);
                    burst(cx, gy + 0.8, cz, 400, 25 * EXP, 15, 1.8, EMBER, -10);
                    vfx.createGroundImpact?.(center.clone(), 4.5 * EXP, 0xff3300);
                    vfx.createFireExplosion?.(new THREE.Vector3(cx, gy + 0.5, cz), 0xff0044);
                    vfx.createMidAirExplosion?.(new THREE.Vector3(cx, gy + 5, cz), 0xffcc44);
                });
                at('boom2b', T.boom2 + 0.14, () => {
                    vfx.createMidAirExplosion?.(new THREE.Vector3(cx + rnd(-2, 2), gy + 8, cz + rnd(-2, 2)), 0xff5500);
                    rings.spawn(cx, gy + 3, cz, 15, 0.6, 0xff9933, 0.7);
                });
                at('boom2c', T.boom2 + 0.28, () => {
                    vfx.createFireExplosion?.(new THREE.Vector3(cx + rnd(-3, 3), gy + 3, cz + rnd(-3, 3)), 0xffaa00);
                    rings.spawn(cx, gy + 0.25, cz, 55 * EXP, 2.0, 0xff3300, 0.6);
                });

                // ═══ GROUND ═══
                if (e >= T.summon && e < T.boom1) {
                    groundMesh.visible = true;
                    const gScale = lerp(0.5, 1, remap(e, T.summon, T.charge)) * (1 + Math.sin(e * 15) * 0.05);
                    groundMesh.scale.setScalar(10 * gScale);
                    groundMat.opacity = 0.5 * (1 - u) * (1 + Math.sin(e * 20) * 0.3);
                    groundMesh.rotation.z += dt * 0.5;
                } else groundMesh.visible = false;

                // ═══ MAGIC CIRCLES ═══
                for (let i = 0; i < circles.length; i++) {
                    const c = circles[i];
                    const a = remap(e, T.summon + i * 0.1, T.summon + i * 0.1 + 0.5);
                    if (a <= 0) continue;
                    if (e >= T.boom1 + 0.75) { c.mesh.visible = false; continue; }
                    c.mesh.visible = true;

                    c.mesh.rotation.z += c.spin * spinMul * dt;
                    const s = lerp(0.3, 1, easeOutCubic(a)) * (1 + Math.sin(e * 10 + i) * 0.05);
                    c.mesh.scale.setScalar(c.r * 2 * s);

                    _c1.setHex(0xffffff).lerp(new THREE.Color(c.mat.color), 0.5);
                    if (heat > 0) _c1.lerp(new THREE.Color(0xffffff), heat * 0.5);
                    if (flashK > 0) _c1.lerp(new THREE.Color(0xffffff), flashK);
                    c.mat.color.copy(_c1);

                    c.mat.opacity = a * (0.6 + heat * 0.4) * (1 - b1);
                }

                // ═══ VORTEX ═══
                let vH = 0, vOp = 0;
                if (e >= T.charge && e < T.boom1) {
                    const k = remap(e, T.charge, T.boom1);
                    vH = lerp(1, 8, k); vOp = lerp(0.2, 1, k);
                } else if (e >= T.boom1) {
                    const k = remap(e, T.boom1, T.boom1 + 0.5);
                    vH = lerp(8, 0, k); vOp = 1 - k;
                }

                if (vOp > 0.01) {
                    vortexes.forEach((v, i) => {
                        v.mesh.visible = true;
                        const hs = vH * (1 + Math.sin(e * 20 + i) * 0.1);
                        v.mesh.scale.set(v.r * (1 + Math.sin(e * 15) * 0.1), hs, v.r * (1 + Math.sin(e * 15) * 0.1));
                        v.mesh.rotation.y += dt * v.spin * spinMul;
                        v.mat.opacity = vOp * v.op * (1 - b1);
                    });
                } else vortexes.forEach(v => v.mesh.visible = false);

                // ═══ STRIKE (Laser từ trời) ═══
                const holdEnd = T.strike + 0.5;
                if (e >= T.strike && e < holdEnd + 0.2) {
                    const bottom = lerp(COL_LEN, 0, easeInCubic(remap(e, T.strike, T.land)));
                    const fade = 1 - remap(e, holdEnd, holdEnd + 0.2);
                    const wob = 1 + Math.sin(e * 60) * 0.05;
                    const widen = e < T.land ? 0.8 : lerp(1.3, 1, remap(e, T.land, T.land + 0.2));

                    strikes.forEach(l => {
                        l.mesh.visible = true;
                        l.mesh.position.y = bottom;
                        const rr = l.r * wob * widen;
                        l.mesh.scale.set(rr, COL_LEN, rr);
                        l.mesh.rotation.y += dt * l.spin;
                        l.mat.opacity = l.op * fade;
                    });
                } else strikes.forEach(l => l.mesh.visible = false);

                // ═══ EXPLOSION (Megumin) ═══
                if (e >= T.boom2) {
                    const kf = easeOutCubic(remap(e, T.boom2, T.boom2 + 1.1));
                    const wob = 1 + Math.sin(e * 22) * 0.025 + Math.sin(e * 37) * 0.015;
                    const fy = lerp(1.2, 6.5, kf) * EXP;

                    fbOuter.mat.color.setHex(0xff5a18).lerp(DARKFIRE, remap(e, T.boom2 + 0.4, T.boom2 + 2.0));
                    setSph(fbOuter, 13 * EXP * kf * wob, 1 - remap(e, T.boom2 + 0.8, T.boom2 + 2.4), fy, 1.2);
                    setSph(fbMid, 10 * EXP * kf * wob, 1 - remap(e, T.boom2 + 0.55, T.boom2 + 1.9), fy, -2.0);
                    setSph(fbCore, 6.5 * EXP * kf * wob, 1 - remap(e, T.boom2 + 0.25, T.boom2 + 1.2), fy, 3.0);

                    const dk = remap(e, T.boom2, T.boom2 + 1.1);
                    setSph(dome, lerp(1, 36, easeOutCubic(dk)) * EXP, 0.5 * (1 - dk) * (1 - dk), 0, 0);

                    const mk = remap(e, T.boom2 + 0.3, T.boom2 + 3.4);
                    const me = easeOutCubic(mk);
                    const mFade = remap(e, T.boom2 + 0.3, T.boom2 + 0.9) * (1 - remap(e, T.boom2 + 2.8, T.boom2 + 4.6));
                    const stemH = lerp(3, 16, me) * EXP;
                    const stemR = lerp(1.2, 2.6, me) * EXP * (1 + Math.sin(e * 9) * 0.04);
                    const capR = lerp(2.5, 9, me) * EXP;
                    const capY = stemH + capR * 0.35;

                    setCyl(mStem, stemR, stemH, mFade * 0.85, 2.0);
                    setCyl(mStem2, stemR * 0.55, stemH, mFade * 0.9, -3.5);
                    setSph(mCap, capR, mFade, capY, 0.9, 0.7);
                    setSph(mCapIn, capR * 0.78, mFade * 0.9, capY - capR * 0.05, -1.6, 0.7);

                    if (mFade > 0.01) {
                        mRim.mesh.visible = true;
                        mRim.mesh.position.set(0, capY - capR * 0.25, 0);
                        mRim.mesh.scale.setScalar(capR * 0.92);
                        mRim.mesh.rotation.y += dt * 1.4;
                        mRim.mat.opacity = clamp01(mFade * 0.8);
                    } else mRim.mesh.visible = false;

                    const lv = remap(e, T.boom2, T.boom2 + 0.35) * (1 - remap(e, T.boom2 + 2.2, T.end - 0.2));
                    if (lv > 0.01) {
                        lava.mesh.visible = true;
                        lava.mesh.position.y = 0.02;
                        lava.mesh.scale.setScalar(32 * EXP * (1 + Math.sin(e * 7) * 0.03));
                        lava.mat.opacity = lv * 0.8 * (0.75 + Math.random() * 0.25);
                    } else lava.mesh.visible = false;

                    const sc = remap(e, T.boom2 + 0.1, T.boom2 + 0.5) * (1 - remap(e, T.end - 1.0, T.end));
                    if (sc > 0.01) {
                        scorch.visible = true;
                        scorch.scale.setScalar(28 * EXP);
                        scorchMat.opacity = sc * 0.85;
                    } else scorch.visible = false;

                    const x = e - T.boom2;
                    if (x < 1.3) {
                        for (let i = 0; i < 8; i++) {
                            const a = rnd(0, 6.283), s = rnd(8, 22) * EXP;
                            particles.emit(cx + Math.cos(a) * 1.5, gy + 0.4, cz + Math.sin(a) * 1.5,
                                Math.cos(a) * s, rnd(2, 12), Math.sin(a) * s, rnd(0.9, 1.5), pick(EMBER), -9);
                        }
                        for (let i = 0; i < 4; i++) {
                            const a = rnd(0, 6.283), rr = rnd(0, 3);
                            particles.emit(cx + Math.cos(a) * rr, gy + rnd(0, 3), cz + Math.sin(a) * rr,
                                rnd(-2, 2), rnd(8, 18) * EXP, rnd(-2, 2), rnd(1.0, 1.6), pick(HOT_PAL), -3);
                        }
                    } else if (x < 3.5) {
                        for (let i = 0; i < 5; i++) {
                            const a = rnd(0, 6.283), rr = rnd(0, 11) * EXP;
                            particles.emit(cx + Math.cos(a) * rr, gy + rnd(10, 18) * EXP, cz + Math.sin(a) * rr,
                                rnd(-1, 1), rnd(-6, -2), rnd(-1, 1), rnd(1.0, 1.5), pick(EMBER), -2);
                        }
                    }
                } else {
                    for (const L of [fbOuter, fbMid, fbCore, dome, mStem, mStem2, mCap, mCapIn, mRim, lava]) L.mesh.visible = false;
                    scorch.visible = false;
                }

                // ═══ PARTICLES (Hạt năng lượng) ═══
                if (e > T.summon && e < T.strike) {
                    const rate = e < T.charge ? 4 : 8;
                    for (let i = 0; i < rate; i++) {
                        const ang = rnd(0, 6.283), rad = rnd(0.5, 4.5);
                        const wx = cx + Math.cos(ang) * rad, wz = cz + Math.sin(ang) * rad;
                        if (e < T.charge) {
                            particles.emit(wx, gy + rnd(0, 5), wz,
                                -Math.sin(ang) * 3, rnd(2, 5), Math.cos(ang) * 3,
                                rnd(0.8, 1.2), pick(EMBER), 1.0);
                        } else {
                            particles.emit(wx, gy + rnd(0, 5), wz,
                                -Math.cos(ang) * rad * 2, (5 - rnd(0, 5)) * 2, -Math.sin(ang) * rad * 2,
                                0.5, pick(HOT_PAL));
                        }
                    }
                }
                if (e >= T.land && e < T.boom1) {
                    for (let i = 0; i < 5; i++) {
                        const ang = rnd(0, 6.283), rad = rnd(0, 4);
                        const wx = cx + Math.cos(ang) * rad, wz = cz + Math.sin(ang) * rad;
                        particles.emit(wx, gy + rnd(0, 1), wz,
                            Math.cos(ang) * rnd(2, 6), rnd(3, 8), Math.sin(ang) * rnd(2, 6),
                            0.6, pick(EMBER), 2);
                    }
                    if (e - lastShake > 0.1) { lastShake = e; shake(1.0 + u * 2.5, 120); }
                } else if (e >= T.charge && e < T.strike && e - lastShake > 0.12) {
                    lastShake = e; shake(0.4 + heat * 0.6, 100);
                }

                fov.step(dt);
                rings.step(dt);
                particles.step(dt);
            };

            await this._msTimeline(T.end, step);

        } catch (err) {
            console.warn('[MagicSkills] Pillar of Fire error:', err);
        } finally {
            scene.remove(root);
            if (particles) { scene.remove(particles.points); particles.dispose(); }
            if (rings) rings.dispose();
            disposables.forEach(d => d.dispose?.());
            fov.restore();
            this._unlockControls();
            this.isPlaying = false;
            this.emotion.trigger('idle', { force: true });
        }
    },

    // ═══════════════════════════════════════════════════════════
    // KỸ NĂNG 2: SẤY LỬA (FIRE BEAM) — Giữ nguyên (đã đẹp)
    // ═══════════════════════════════════════════════════════════
    async playFireBeam(mode) {
        if (this.isPlaying) return;
        this.isPlaying = true;
        this._lockControls();

        const R = getRes();
        const vfx = this.vfx, ctrl = this.ctrl, cam = this.camera, scene = this.scene;
        const K = mode === 'savage' ? 1.3 : mode === 'gentle' ? 0.75 : 1;
        const shake = (i, ms) => vfx._shakeScreen?.(i * K, ms);
        const flash = (ms) => vfx._triggerScreenFlash?.(ms);

        const disposables = [];
        const group = new THREE.Group();
        const fov = makeFovKick(cam);
        let particles = null, rings = null, charge = null, action = null;

        try {
            const charPos = ctrl.root.position.clone();

            const dx = charPos.x - cam.position.x, dz = charPos.z - cam.position.z;
            const dl = Math.hypot(dx, dz) || 1;
            const nx = dx / dl, nz = dz / dl;
            const fxv = -nz * 0.93 - nx * 0.37;
            const fzv = nx * 0.93 - nz * 0.37;
            const yaw = Math.atan2(fxv, fzv);
            ctrl.root.rotation.y = yaw;

            const sy = Math.sin(yaw), cyw = Math.cos(yaw);
            const fwd = new THREE.Vector3(sy, 0, cyw);
            const muzzle = new THREE.Vector3(charPos.x + sy * 0.7, charPos.y + 1.25, charPos.z + cyw * 0.7);
            const toWorld = (lx, ly, lz, out) => {
                out.x = muzzle.x + lx * cyw + lz * sy;
                out.y = muzzle.y + ly;
                out.z = muzzle.z - lx * sy + lz * cyw;
                return out;
            };
            const _o = { x: 0, y: 0, z: 0 };

            group.position.copy(muzzle);
            group.rotation.y = yaw;
            scene.add(group);

            const tFire = 2.4, tOff = tFire + 2.6, tGone = tOff + 0.5, tEnd = tGone + 0.9;

            this.emotion.trigger('emo_magic_attack', { force: true });
            action = ctrl.actions?.['emo_magic_attack'] || null;
            try { charge = vfx.createChargingEffect?.() || null; } catch (err) { charge = null; }

            particles = makeParticles(vfx, 360);
            scene.add(particles.points);
            rings = makeShockRings(scene, 3);

            const mkSprite = (hex) => {
                const m = new THREE.SpriteMaterial({
                    map: vfx.particleTexture, color: hex, transparent: true, opacity: 0,
                    blending: THREE.AdditiveBlending, depthWrite: false
                });
                disposables.push(m);
                const s = new THREE.Sprite(m);
                group.add(s);
                return { s, m };
            };
            const flare = mkSprite(0xffaa44);
            const tipFlare = mkSprite(0xff5522);
            tipFlare.s.visible = false;

            const LAYERS = [
                { R: BEAM_OUTER_R, map: R.texBeamA, color: 0xff2a00, op: 0.5 },
                { R: BEAM_OUTER_R * 0.62, map: R.texBeamB, color: 0xffa020, op: 0.8 },
                { R: BEAM_OUTER_R * 0.29, map: null, color: 0xfff4c8, op: 1.0 },
            ];
            const beamLayers = LAYERS.map(d => {
                const mat = additiveMat({ color: d.color, map: d.map || null });
                disposables.push(mat);
                const mesh = new THREE.Mesh(R.beam, mat);
                mesh.visible = false;
                mesh.scale.set(0.001, 0.001, 0.001);
                group.add(mesh);
                return { mesh, mat, R: d.R, op: d.op };
            });

            const NR = 7;
            const beamRings = [];
            for (let i = 0; i < NR; i++) {
                const mat = additiveMat({ color: 0xffdd88 });
                disposables.push(mat);
                const mesh = new THREE.Mesh(R.torus, mat);
                mesh.visible = false;
                group.add(mesh);
                beamRings.push({ mesh, mat });
            }

            const cur = { e: 0 };
            const fired = {};
            const at = (key, t, fn) => {
                if (!fired[key] && cur.e >= t) { fired[key] = true; fn(); }
            };
            let nextTipFx = 0, nextAirFx = 0, lastShake = 0;

            const step = (e, dt) => {
                cur.e = e;
                fov.step(dt);
                rings.step(dt);
                particles.step(dt);

                if (e < tFire) {
                    const pp = clamp01(e / tFire);
                    if (charge) {
                        try { charge.update(pp, muzzle, yaw, dt, 0); } catch (err) { charge = null; }
                    }
                    flare.s.visible = true;
                    flare.s.scale.setScalar(lerp(0.2, 1.8, pp) * (1 + Math.sin(e * 30) * 0.1));
                    flare.m.opacity = pp;

                    const cnt = 1 + ((pp * 4) | 0);
                    for (let i = 0; i < cnt; i++) {
                        const th = rnd(0, 6.283), ph = Math.acos(rnd(-1, 1)), rad = rnd(1.4, 2.8);
                        const ddx = Math.sin(ph) * Math.cos(th), ddy = Math.cos(ph), ddz = Math.sin(ph) * Math.sin(th);
                        particles.emit(muzzle.x + ddx * rad, muzzle.y + ddy * rad, muzzle.z + ddz * rad,
                            -ddx * rad * 2, -ddy * rad * 2, -ddz * rad * 2, 0.5, pick(FIRE_PAL));
                    }
                    if (e - lastShake > 0.1) { lastShake = e; shake(0.2 + pp * 0.6, 80); }
                    return;
                }

                at('fire', tFire, () => {
                    if (charge) { try { charge.dispose(); } catch (err) { } charge = null; }
                    if (action) action.paused = true;
                    vfx.createLaunchBurst?.(muzzle.clone(), fwd.clone(), 1.0);
                    vfx.createSonicBoom?.(muzzle.clone(), fwd.clone(), 1.0);
                    flash(220); shake(2.5, 2400); fov.kick(5);
                    rings.spawn(charPos.x, charPos.y + 0.05, charPos.z, 6, 0.7, 0xff6600, 0.9);
                    for (let i = 0; i < 50; i++) {
                        const a = rnd(0, 6.283), s = rnd(2, 7);
                        particles.emit(muzzle.x, muzzle.y, muzzle.z,
                            Math.cos(a) * s * 0.6 + fwd.x * s, rnd(-1, 2.5), Math.sin(a) * s * 0.6 + fwd.z * s,
                            rnd(0.4, 0.9), pick(HOT_PAL));
                    }
                    beamLayers.forEach(l => (l.mesh.visible = true));
                    beamRings.forEach(r => (r.mesh.visible = true));
                    tipFlare.s.visible = true;
                });

                if (e < tGone) {
                    const ext = easeOutCubic(remap(e, tFire, tFire + 0.22));
                    const retract = remap(e, tOff, tGone);
                    const th = 1 - retract * 0.85;
                    const alive = 1 - remap(retract, 0.55, 1);
                    const len = BEAM_LEN * ext;
                    const zStart = BEAM_LEN * easeInCubic(retract) * 0.8;
                    const span = Math.max(0.001, len - zStart);
                    const pulse = 1 + Math.sin(e * 38) * 0.06 + Math.sin(e * 17 + 1) * 0.05;

                    if (action && e >= tOff && action.paused) action.paused = false;

                    for (const l of beamLayers) {
                        const rr = l.R * th * pulse;
                        l.mesh.scale.set(rr, rr, span);
                        l.mesh.position.z = zStart;
                        l.mat.opacity = l.op * alive;
                    }
                    R.texBeamA.offset.y -= dt * 3.2;
                    R.texBeamA.offset.x += dt * 0.3;
                    R.texBeamB.offset.y -= dt * 5.0;

                    for (let i = 0; i < NR; i++) {
                        const s = (e * 0.75 + i / NR) % 1;
                        const rr = beamProf(s) * BEAM_OUTER_R * th * pulse * 1.1;
                        const r = beamRings[i];
                        r.mesh.position.z = zStart + s * span;
                        r.mesh.scale.set(rr, rr, 1);
                        r.mat.opacity = Math.sin(Math.PI * s) * 0.85 * alive;
                    }

                    flare.s.scale.setScalar((2.2 + Math.sin(e * 45) * 0.3) * th);
                    flare.m.opacity = alive;
                    tipFlare.s.position.z = len;
                    tipFlare.s.scale.setScalar((5 + Math.sin(e * 33) * 0.8) * th);
                    tipFlare.m.opacity = 0.8 * alive * ext;

                    for (let i = 0; i < 3; i++) {
                        const s = rnd(0.05, 1);
                        const lz = zStart + s * span;
                        const rr = beamProf(s) * BEAM_OUTER_R * th * rnd(0.8, 1.1);
                        const a = rnd(0, 6.283);
                        toWorld(Math.cos(a) * rr, Math.sin(a) * rr, lz, _o);
                        particles.emit(_o.x, _o.y, _o.z, rnd(-1.5, 1.5), rnd(0.5, 3), rnd(-1.5, 1.5),
                            rnd(0.4, 0.8), pick(FIRE_PAL), 3);
                    }

                    if (ext > 0.9 && alive > 0.2) {
                        toWorld(0, 0, len, _o);
                        const tx = _o.x, ty = _o.y, tz = _o.z;
                        for (let i = 0; i < 5; i++) {
                            particles.emit(tx, ty, tz, rnd(-1, 1) * 7, rnd(-0.3, 1) * 7, rnd(-1, 1) * 7,
                                rnd(0.4, 0.8), pick(HOT_PAL), -4);
                        }
                        if (e >= nextTipFx) {
                            nextTipFx = e + 0.18;
                            vfx.createFireExplosion?.(
                                new THREE.Vector3(tx + rnd(-1.5, 1.5), ty + rnd(-1, 1), tz + rnd(-1.5, 1.5)),
                                pick([0xff5500, 0xff2200, 0xffaa00]));
                        }
                        if (e >= nextAirFx) {
                            nextAirFx = e + 0.6;
                            vfx.createMidAirExplosion?.(new THREE.Vector3(tx, ty + 1, tz), 0xffaa00);
                        }
                    }
                }

                at('end', tGone, () => {
                    beamLayers.forEach(l => (l.mesh.visible = false));
                    beamRings.forEach(r => (r.mesh.visible = false));
                    flare.s.visible = false;
                    tipFlare.s.visible = false;
                    toWorld(0, 0, BEAM_LEN, _o);
                    const endPos = new THREE.Vector3(_o.x, _o.y, _o.z);
                    vfx.createFireExplosion?.(endPos.clone(), 0xff0044);
                    vfx.createMidAirExplosion?.(endPos.clone(), 0xffaa00);
                    rings.spawn(endPos.x, endPos.y, endPos.z, 8, 0.7, 0xff6600, 0.8);
                    flash(150);
                });
            };

            await this._msTimeline(tEnd, step);

        } catch (err) {
            console.warn('[MagicSkills] Fire Beam error:', err);
        } finally {
            if (charge) { try { charge.dispose(); } catch (err) { } }
            if (action) action.paused = false;
            scene.remove(group);
            if (particles) { scene.remove(particles.points); particles.dispose(); }
            if (rings) rings.dispose();
            disposables.forEach(d => d.dispose?.());
            fov.restore();
            this._unlockControls();
            this.isPlaying = false;
            this.emotion.trigger('idle', { force: true });
        }
    }
};
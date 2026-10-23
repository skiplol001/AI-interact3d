// ═══════════════════════════════════════════════════════════════
// house-model.js — v3 (Perfect Geometry & Instant Show)
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'https://esm.sh/three@0.160.0';

const _tmpV = new THREE.Vector3();

export class HouseModel {
    constructor(scene) {
        this.scene = scene;
        this.group = null;
        this.bounds = new THREE.Box3();
        this.doorHinge = null;
        this.doorOpen = false;
        this.doorTargetRot = 0;
        this.doorCurrentRot = 0;

        // ═══ DIMENSIONS ═══
        this.W = 5.0;             // Rộng (X)
        this.D = 6.0;             // Sâu (Z)
        this.WALL_H = 2.6;        // Cao tường
        this.WALL_T = 0.15;       // Dày tường
        this.FOUND_H = 0.18;      // Sàn nâng
        this.DOOR_W = 1.0;
        this.DOOR_H = 2.05;
        this.WIN_W = 0.9;
        this.WIN_H = 0.85;
        this.WIN_Y = 1.35;        // Độ cao cửa sổ tính từ sàn
        this.ROOF_LIP_H = 0.22;   // Viền mái
        this.PORCH_D = 1.2;       // Sâu hiên

        this._mat = {};
        this._initMaterials();
    }

    _initMaterials() {
        this._mat.wall = new THREE.MeshStandardMaterial({ color: 0xE8D5B7, roughness: 0.88, metalness: 0.02 });
        this._mat.wallTrim = new THREE.MeshStandardMaterial({ color: 0x6B4226, roughness: 0.75 });
        this._mat.found = new THREE.MeshStandardMaterial({ color: 0x6B4226, roughness: 0.9 });
        this._mat.floor = new THREE.MeshStandardMaterial({ color: 0x8B5A2B, roughness: 0.85 });
        this._mat.roof = new THREE.MeshStandardMaterial({ color: 0x8B0000, roughness: 0.65, metalness: 0.1 });
        this._mat.roofLip = new THREE.MeshStandardMaterial({ color: 0x5C0000, roughness: 0.6, metalness: 0.15 });
        this._mat.door = new THREE.MeshStandardMaterial({ color: 0x4A2C17, roughness: 0.7, metalness: 0.1 });
        this._mat.doorTrim = new THREE.MeshStandardMaterial({ color: 0x2F1810, roughness: 0.6 });
        this._mat.glass = new THREE.MeshStandardMaterial({ color: 0xB3E5FC, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.35 });
        this._mat.frame = new THREE.MeshStandardMaterial({ color: 0x3B2410, roughness: 0.65 });
        this._mat.pillar = new THREE.MeshStandardMaterial({ color: 0x8B5A2B, roughness: 0.8 });
        this._mat.wood = new THREE.MeshStandardMaterial({ color: 0x5C3A21, roughness: 0.85 });
        this._mat.woodDark = new THREE.MeshStandardMaterial({ color: 0x3B2410, roughness: 0.9 });
        this._mat.bedSheet = new THREE.MeshStandardMaterial({ color: 0xF5F5F5, roughness: 0.9 });
        this._mat.bedPillow = new THREE.MeshStandardMaterial({ color: 0xE2E8F0, roughness: 0.9 });
        this._mat.metal = new THREE.MeshStandardMaterial({ color: 0x9CA3AF, roughness: 0.35, metalness: 0.8 });
        this._mat.lampShade = new THREE.MeshStandardMaterial({ color: 0xFFF4B0, emissive: 0xFFE680, emissiveIntensity: 0.6, roughness: 0.5 });
        this._mat.handle = new THREE.MeshStandardMaterial({ color: 0xD4A017, roughness: 0.2, metalness: 0.9 });
    }

    // ═══════════════════════════════════════════════════════════
    // PREBUILD (Dựng sẵn lúc khởi động)
    // ═══════════════════════════════════════════════════════════
    initPrebuilt() {
        if (this.group) return;

        this.group = new THREE.Group();
        this.group.userData.isHouseModel = true;
        this.group.visible = false; // Ẩn đi, chờ lệnh show

        this._buildFoundation();
        this._buildFloor();
        this._buildWalls();
        this._buildRoof();
        this._buildDoor();
        this._buildPorch();
        this._buildInterior();

        this.scene.add(this.group);
        this._refreshBounds();
    }

    // ═══════════════════════════════════════════════════════════
    // SHOW AT (Hiển thị tức thì)
    // ═══════════════════════════════════════════════════════════
    showAt(cx, cz, rotationY = 0) {
        if (!this.group) this.initPrebuilt();

        this.group.position.set(cx, 0, cz);
        this.group.rotation.y = rotationY;
        this.group.scale.set(1, 1, 1); // Đảm bảo tỷ lệ chuẩn
        this.group.visible = true;
        this._refreshBounds();

        // Hiệu ứng VFX bụi + sét khi xuất hiện
        if (window.vfxSystem) {
            const center = new THREE.Vector3(cx, 0.2, cz);
            window.vfxSystem.createDust(center);
            if (window.vfxSystem._triggerScreenFlash) window.vfxSystem._triggerScreenFlash(150);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // BOUNDS TĨNH (Tính chuẩn xác)
    // ═══════════════════════════════════════════════════════════
    _refreshBounds() {
        if (!this.group) return;
        this.group.updateMatrixWorld(true);

        // Giới hạn bao quanh nhà + mái + hiên
        const minX = -this.W / 2 - 0.3;
        const maxX = this.W / 2 + 0.3;
        const minZ = -this.D / 2 - this.PORCH_D - 0.3;
        const maxZ = this.D / 2 + 0.3;
        const minY = 0;
        const maxY = this.FOUND_H + this.WALL_H + 0.5;

        const localBox = new THREE.Box3(
            new THREE.Vector3(minX, minY, minZ),
            new THREE.Vector3(maxX, maxY, maxZ)
        );
        this.bounds.copy(localBox).applyMatrix4(this.group.matrixWorld);
    }

    _buildFoundation() {
        const g = new THREE.BoxGeometry(this.W + 0.4, this.FOUND_H, this.D + 0.4);
        const mesh = new THREE.Mesh(g, this._mat.found);
        mesh.position.y = this.FOUND_H / 2; // Tâm móng: 0.09
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.group.add(mesh);

        const trimGeo = new THREE.BoxGeometry(this.W + 0.45, 0.05, this.D + 0.45);
        const trim = new THREE.Mesh(trimGeo, this._mat.wallTrim);
        trim.position.y = this.FOUND_H; // Đỉnh móng: 0.18
        trim.receiveShadow = true;
        this.group.add(trim);
    }

    _buildFloor() {
        const g = new THREE.BoxGeometry(this.W - 0.1, 0.03, this.D - 0.1);
        const mesh = new THREE.Mesh(g, this._mat.floor);
        mesh.position.y = this.FOUND_H + 0.015; // Tâm sàn: 0.195
        mesh.receiveShadow = true;
        this.group.add(mesh);
    }

    _buildWalls() {
        const y0 = this.FOUND_H; // Bắt đầu từ 0.18
        const h = this.WALL_H;   // Cao 2.6
        const t = this.WALL_T;

        // Tường sau (đặc)
        this._addWall(0, y0 + h / 2, this.D / 2 - t / 2, this.W, h, t);

        // Tường trái (có cửa sổ)
        this._addWallSegment(-this.W / 2 + t / 2, y0 + (this.WIN_Y - this.WIN_H / 2) / 2, 0, t, this.WIN_Y - this.WIN_H / 2, this.D - 2 * t);
        this._addWallSegment(-this.W / 2 + t / 2, y0 + this.WIN_Y + this.WIN_H / 2 + (h - this.WIN_Y - this.WIN_H / 2) / 2, 0, t, h - this.WIN_Y - this.WIN_H / 2, this.D - 2 * t);
        this._addSideWindow(-this.W / 2 + t / 2, y0 + this.WIN_Y, 0, 'left');

        // Tường phải (có cửa sổ)
        this._addWallSegment(this.W / 2 - t / 2, y0 + (this.WIN_Y - this.WIN_H / 2) / 2, 0, t, this.WIN_Y - this.WIN_H / 2, this.D - 2 * t);
        this._addWallSegment(this.W / 2 - t / 2, y0 + this.WIN_Y + this.WIN_H / 2 + (h - this.WIN_Y - this.WIN_H / 2) / 2, 0, t, h - this.WIN_Y - this.WIN_H / 2, this.D - 2 * t);
        this._addSideWindow(this.W / 2 - t / 2, y0 + this.WIN_Y, 0, 'right');

        // Tường trước (có cửa chính)
        this._buildFrontWall(y0, h, t);
    }

    _addWall(cx, cy, cz, w, h, d) {
        const g = new THREE.BoxGeometry(w, h, d);
        const mesh = new THREE.Mesh(g, this._mat.wall);
        mesh.position.set(cx, cy, cz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.group.add(mesh);
        return mesh;
    }

    _addWallSegment(x, y, z, w, h, d) {
        return this._addWall(x, y, z, w, h, d);
    }

    _buildFrontWall(y0, h, t) {
        const zFront = -this.D / 2 + t / 2;
        const doorHalf = this.DOOR_W / 2;

        const leftSegW = (this.W / 2) - doorHalf;
        const leftCenterX = -this.W / 2 + leftSegW / 2;
        this._addWallWithWindow(leftCenterX, y0, zFront, leftSegW, h, t);

        const rightCenterX = doorHalf + leftSegW / 2;
        this._addWallWithWindow(rightCenterX, y0, zFront, leftSegW, h, t);

        const aboveH = h - this.DOOR_H;
        if (aboveH > 0.05) {
            this._addWall(0, y0 + this.DOOR_H + aboveH / 2, zFront, this.DOOR_W, aboveH, t);
        }
    }

    _addWallWithWindow(cx, y0, cz, w, h, t) {
        const winY0 = this.WIN_Y - this.WIN_H / 2;
        const winY1 = this.WIN_Y + this.WIN_H / 2;
        const winW = this.WIN_W;
        const winLeft = -winW / 2;
        const winRight = winW / 2;

        this._addWall(cx, y0 + winY0 / 2, cz, w, winY0, t);
        this._addWall(cx, y0 + winY1 + (h - winY1) / 2, cz, w, h - winY1, t);

        const leftW = (w / 2) + winLeft;
        if (leftW > 0.02) {
            this._addWall(cx - (w / 2) + leftW / 2, y0 + winY0 + this.WIN_H / 2, cz, leftW, this.WIN_H, t);
        }
        const rightW = (w / 2) - winRight;
        if (rightW > 0.02) {
            this._addWall(cx + winRight + rightW / 2, y0 + winY0 + this.WIN_H / 2, cz, rightW, this.WIN_H, t);
        }

        this._addFrontWindow(cx, y0 + this.WIN_Y, cz);
    }

    _addFrontWindow(cx, cy, cz) {
        const winW = this.WIN_W, winH = this.WIN_H;
        const ft = 0.06;

        const glass = new THREE.Mesh(new THREE.BoxGeometry(winW, winH, 0.03), this._mat.glass);
        glass.position.set(cx, cy, cz + 0.02);
        this.group.add(glass);

        const frames = [
            { w: winW + 0.02, h: ft, x: cx, y: cy + winH / 2 + ft / 2, z: cz },
            { w: winW + 0.02, h: ft, x: cx, y: cy - winH / 2 - ft / 2, z: cz },
            { w: ft, h: winH, x: cx - winW / 2 - ft / 2, y: cy, z: cz },
            { w: ft, h: winH, x: cx + winW / 2 + ft / 2, y: cy, z: cz },
        ];
        for (const f of frames) {
            const m = new THREE.Mesh(new THREE.BoxGeometry(f.w, f.h, 0.08), this._mat.frame);
            m.position.set(f.x, f.y, f.z);
            m.castShadow = true;
            this.group.add(m);
        }

        const barV = new THREE.Mesh(new THREE.BoxGeometry(0.04, winH, 0.06), this._mat.frame);
        barV.position.set(cx, cy, cz + 0.03);
        this.group.add(barV);

        const barH = new THREE.Mesh(new THREE.BoxGeometry(winW, 0.04, 0.06), this._mat.frame);
        barH.position.set(cx, cy, cz + 0.03);
        this.group.add(barH);
    }

    _addSideWindow(cx, cy, cz, side) {
        const winW = this.WIN_W, winH = this.WIN_H;
        const ft = 0.06;
        const sign = side === 'left' ? 1 : -1;

        const glass = new THREE.Mesh(new THREE.BoxGeometry(0.03, winH, winW), this._mat.glass);
        glass.position.set(cx + 0.02 * sign, cy, cz);
        this.group.add(glass);

        const frames = [
            { w: 0.08, h: ft, d: winW + 0.02, x: cx, y: cy + winH / 2 + ft / 2, z: cz },
            { w: 0.08, h: ft, d: winW + 0.02, x: cx, y: cy - winH / 2 - ft / 2, z: cz },
            { w: 0.08, h: winH, d: ft, x: cx, y: cy, z: cz - winW / 2 - ft / 2 },
            { w: 0.08, h: winH, d: ft, x: cx, y: cy, z: cz + winW / 2 + ft / 2 },
        ];
        for (const f of frames) {
            const m = new THREE.Mesh(new THREE.BoxGeometry(f.w, f.h, f.d), this._mat.frame);
            m.position.set(f.x, f.y, f.z);
            m.castShadow = true;
            this.group.add(m);
        }

        const barH = new THREE.Mesh(new THREE.BoxGeometry(0.06, winH, 0.04), this._mat.frame);
        barH.position.set(cx + 0.03 * sign, cy, cz);
        this.group.add(barH);

        const barV = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, winW), this._mat.frame);
        barV.position.set(cx + 0.03 * sign, cy, cz);
        this.group.add(barV);
    }

    _buildRoof() {
        const yTop = this.FOUND_H + this.WALL_H; // Đỉnh tường: 2.78
        const overhang = 0.25;
        const roofW = this.W + overhang * 2;
        const roofD = this.D + overhang * 2;

        const roof = new THREE.Mesh(
            new THREE.BoxGeometry(roofW, 0.1, roofD),
            this._mat.roof
        );
        roof.position.y = yTop + 0.05; // Mái nằm ngay trên đỉnh tường
        roof.castShadow = true;
        roof.receiveShadow = true;
        this.group.add(roof);

        const lipH = this.ROOF_LIP_H;
        const lipT = 0.12;
        const lipY = yTop + 0.1 + lipH / 2;

        this._addBox(0, lipY, -roofD / 2 + lipT / 2, roofW, lipH, lipT, this._mat.roofLip);
        this._addBox(0, lipY, roofD / 2 - lipT / 2, roofW, lipH, lipT, this._mat.roofLip);
        this._addBox(-roofW / 2 + lipT / 2, lipY, 0, lipT, lipH, roofD - lipT * 2, this._mat.roofLip);
        this._addBox(roofW / 2 - lipT / 2, lipY, 0, lipT, lipH, roofD - lipT * 2, this._mat.roofLip);

        const chimney = new THREE.Mesh(
            new THREE.BoxGeometry(0.4, 0.7, 0.4),
            new THREE.MeshStandardMaterial({ color: 0x4A4A4A, roughness: 0.9 })
        );
        chimney.position.set(this.W / 3, yTop + 0.45, this.D / 4);
        chimney.castShadow = true;
        this.group.add(chimney);
    }

    _addBox(cx, cy, cz, w, h, d, mat) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(cx, cy, cz);
        m.castShadow = true;
        m.receiveShadow = true;
        this.group.add(m);
        return m;
    }

    _buildDoor() {
        const zFront = -this.D / 2 + this.WALL_T / 2;
        const y0 = this.FOUND_H; // 0.18
        const doorW = this.DOOR_W;
        const doorH = this.DOOR_H;
        const ft = 0.06;

        const trimMat = this._mat.doorTrim;
        this._addBox(0, y0 + doorH + ft / 2, zFront - 0.02, doorW + ft * 2, ft, 0.08, trimMat);
        this._addBox(-doorW / 2 - ft / 2, y0 + doorH / 2, zFront - 0.02, ft, doorH, 0.08, trimMat);
        this._addBox(doorW / 2 + ft / 2, y0 + doorH / 2, zFront - 0.02, ft, doorH, 0.08, trimMat);

        this.doorHinge = new THREE.Group();
        this.doorHinge.position.set(-doorW / 2, y0 + doorH / 2, zFront - 0.04);
        this.group.add(this.doorHinge);

        const leafW = doorW - 0.04;
        const leaf = new THREE.Mesh(
            new THREE.BoxGeometry(leafW, doorH - 0.04, 0.05),
            this._mat.door
        );
        leaf.position.set(leafW / 2, 0, 0);
        leaf.castShadow = true;
        leaf.receiveShadow = true;
        this.doorHinge.add(leaf);

        const panel1 = new THREE.Mesh(
            new THREE.BoxGeometry(leafW * 0.6, doorH * 0.28, 0.02),
            this._mat.doorTrim
        );
        panel1.position.set(leafW / 2, doorH * 0.22, 0.04);
        this.doorHinge.add(panel1);

        const panel2 = new THREE.Mesh(
            new THREE.BoxGeometry(leafW * 0.6, doorH * 0.28, 0.02),
            this._mat.doorTrim
        );
        panel2.position.set(leafW / 2, -doorH * 0.22, 0.04);
        this.doorHinge.add(panel2);

        const handle = new THREE.Mesh(
            new THREE.SphereGeometry(0.06, 12, 8),
            this._mat.handle
        );
        handle.position.set(leafW * 0.85, 0, 0.05);
        this.doorHinge.add(handle);

        this.doorOpen = false;
        this.doorTargetRot = 0;
        this.doorCurrentRot = 0;
    }

    _buildPorch() {
        const y0 = this.FOUND_H;
        const porchZ = -this.D / 2 - this.PORCH_D / 2;
        const porchW = 2.5;
        const porchD = this.PORCH_D;

        this._addBox(0, y0 - 0.05, porchZ, porchW, 0.1, porchD, this._mat.woodDark);
        this._addBox(0, y0 / 2, porchZ - porchD / 2 + 0.15, porchW * 0.7, y0, 0.3, this._mat.wood);

        const pillarH = this.WALL_H + 0.1;
        for (const px of [-porchW / 2 + 0.15, porchW / 2 - 0.15]) {
            const pillar = new THREE.Mesh(
                new THREE.CylinderGeometry(0.08, 0.09, pillarH, 12),
                this._mat.pillar
            );
            pillar.position.set(px, y0 + pillarH / 2, porchZ - porchD / 2 + 0.15);
            pillar.castShadow = true;
            this.group.add(pillar);
        }

        this._addBox(0, y0 + pillarH, porchZ, porchW + 0.2, 0.08, porchD + 0.2, this._mat.roof);
    }

    _buildInterior() {
        const y0 = this.FOUND_H;

        const bedX = this.W / 2 - 1.2;
        const bedZ = this.D / 2 - 1.4;
        this._addBox(bedX, y0 + 0.15, bedZ, 1.4, 0.3, 2.0, this._mat.woodDark);
        this._addBox(bedX, y0 + 0.35, bedZ, 1.35, 0.15, 1.9, this._mat.bedSheet);
        this._addBox(bedX, y0 + 0.45, bedZ - 0.75, 1.1, 0.12, 0.4, this._mat.bedPillow);

        const tableX = -this.W / 2 + 1.0;
        const tableZ = -this.D / 2 + 1.6;
        this._addBox(tableX, y0 + 0.75, tableZ, 1.0, 0.08, 0.8, this._mat.wood);
        for (const [dx, dz] of [[-0.4, -0.3], [0.4, -0.3], [-0.4, 0.3], [0.4, 0.3]]) {
            this._addBox(tableX + dx, y0 + 0.375, tableZ + dz, 0.06, 0.75, 0.06, this._mat.woodDark);
        }

        const chairX = tableX;
        const chairZ = tableZ + 0.8;
        this._addBox(chairX, y0 + 0.45, chairZ, 0.5, 0.06, 0.5, this._mat.wood);
        this._addBox(chairX, y0 + 0.75, chairZ + 0.2, 0.5, 0.55, 0.06, this._mat.wood);
        for (const [dx, dz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
            this._addBox(chairX + dx, y0 + 0.225, chairZ + dz, 0.05, 0.45, 0.05, this._mat.woodDark);
        }

        const fridgeX = -this.W / 2 + 0.6;
        const fridgeZ = this.D / 2 - 0.6;
        this._addBox(fridgeX, y0 + 0.85, fridgeZ, 0.8, 1.7, 0.7, this._mat.metal);
        this._addBox(fridgeX, y0 + 0.85, fridgeZ - 0.36, 0.75, 0.02, 0.02, this._mat.woodDark);

        const lampX = 0, lampZ = 0;
        const lampY = y0 + this.WALL_H - 0.15;

        const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.5, 6), this._mat.woodDark);
        cord.position.set(lampX, lampY + 0.25, lampZ);
        this.group.add(cord);

        const shade = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.3, 12, 1, true), this._mat.lampShade);
        shade.position.set(lampX, lampY, lampZ);
        shade.rotation.x = Math.PI;
        this.group.add(shade);

        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), new THREE.MeshBasicMaterial({ color: 0xFFF4B0 }));
        bulb.position.set(lampX, lampY - 0.1, lampZ);
        this.group.add(bulb);

        const rug = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.02, 24), new THREE.MeshStandardMaterial({ color: 0x8B0000, roughness: 0.95 }));
        rug.position.set(0, y0 + 0.03, 0);
        rug.receiveShadow = true;
        this.group.add(rug);
    }

    update(dt) {
        if (this.doorHinge) {
            const cur = this.doorCurrentRot;
            const tgt = this.doorTargetRot;
            if (Math.abs(cur - tgt) > 0.005) {
                this.doorCurrentRot = cur + (tgt - cur) * Math.min(dt * 10, 1);
                this.doorHinge.rotation.y = this.doorCurrentRot;
            }
        }
    }

    getCenter() { return this.bounds.getCenter(new THREE.Vector3()); }

    getDoorFront() {
        if (!this.group) return new THREE.Vector3();
        _tmpV.set(0, 0, -this.D / 2 - 0.8);
        this.group.localToWorld(_tmpV);
        return _tmpV.clone();
    }

    destroy() {
        if (!this.group) return;
        this.scene.remove(this.group);
        this.group.traverse(c => { if (c.geometry) c.geometry.dispose?.(); });
        this.group = null;
        this.doorHinge = null;
        this.bounds.makeEmpty();
    }
}
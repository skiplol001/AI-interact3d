// ═══════════════════════════════════════════════════════════════
// slingshot/model.js — Slingshot 3D model
// FIX: window.contextMenu?._setTool?.() để không crash khi contextMenu chưa sẵn sàng
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'https://esm.sh/three@0.160.0';

export function createSlingshotModel(self, isGhost = false) {
    const group = new THREE.Group();
    const matColor = isGhost ? 0x38bdf8 : 0x8b4513;
    const opacity = isGhost ? 0.5 : 1;
    const mat = new THREE.MeshStandardMaterial({ color: matColor, transparent: isGhost, opacity, roughness: 0.8 });

    const baseMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.8, 8), mat);
    baseMesh.position.y = 0.4; baseMesh.castShadow = !isGhost; group.add(baseMesh);

    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.4, 8), mat);
    armL.position.set(-0.15, 0.9, 0); armL.rotation.z = Math.PI / 4; armL.castShadow = !isGhost; group.add(armL);

    const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.4, 8), mat);
    armR.position.set(0.15, 0.9, 0); armR.rotation.z = -Math.PI / 4; armR.castShadow = !isGhost; group.add(armR);

    if (!isGhost) {
        // Rubber bands
        const bandGeo = new THREE.CylinderGeometry(0.01, 0.01, 1, 4);
        const bandMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
        self.rubberBands = [new THREE.Mesh(bandGeo, bandMat), new THREE.Mesh(bandGeo, bandMat)];
        group.add(self.rubberBands[0], self.rubberBands[1]);

        // Rock
        const rockGeo = new THREE.DodecahedronGeometry(0.13, 0);
        const posAttr = rockGeo.attributes.position;
        for (let i = 0; i < posAttr.count; i++) {
            const x = posAttr.getX(i); const y = posAttr.getY(i); const z = posAttr.getZ(i);
            const noise = 0.85 + Math.random() * 0.3;
            posAttr.setXYZ(i, x * noise, y * noise, z * noise);
        }
        posAttr.needsUpdate = true;
        rockGeo.computeVertexNormals();

        self.rock = new THREE.Mesh(rockGeo, new THREE.MeshStandardMaterial({
            color: 0x4a5568, roughness: 1.0, metalness: 0.0, flatShading: true, emissive: 0x000000,
        }));
        self.rock.castShadow = true; group.add(self.rock);

        self.rockLight = new THREE.PointLight(0xff5500, 0, 3);
        self.rock.add(self.rockLight);
        self.rockStartPos.set(0, 0.9, 0);
        self.rock.position.copy(self.rockStartPos);
    }
    return group;
}

export function createGhostModel(self) {
    self.ghost = createSlingshotModel(self, true);
    self.ghost.visible = false;
    self.scene.add(self.ghost);
}

export function createSlingshot(self, pt) {
    self._cancelTimers();
    self._clearRockState();
    if (self.slingshot) self.scene.remove(self.slingshot);
    self._discardRock();

    self.ghost.visible = false;
    self.slingshot = createSlingshotModel(self, false);
    self.slingshot.position.set(pt.x, 0, pt.z);
    const angle = Math.atan2(pt.x - self.camera.position.x, pt.z - self.camera.position.z);
    self.slingshot.rotation.y = angle;
    self.scene.add(self.slingshot);
    self._updateRubberBands();
    self.state = 'ready';
    window.contextMenu?._setTool?.('navigate');
    if (self.hintEl) self.hintEl.style.display = 'block';
}
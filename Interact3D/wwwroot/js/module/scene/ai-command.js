// ═══════════════════════════════════════════════════════════════
// ai-command.js — createAITools v5 (Thêm Switch Model)
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'https://esm.sh/three@0.160.0';

const BUSY_STATES = [
    'walking', 'walkToBox', 'carryWalk',
    'picking', 'putting',
    'surprised', 'hanging', 'falling', 'landing',
];

const DEFAULT_BOUNDARY = { radius: 15, center: { x: 0, z: 0 } };

export function createAITools(deps) {
    const characterCtrl = deps?.characterCtrl ?? window.characterCtrl;
    const boxSystem = deps?.boxSystem ?? window.boxSystem;
    const camera = deps?.camera ?? window.camera;
    const grabCtrl = deps?.grabCtrl ?? window.grabCtrl;

    if (!characterCtrl || !boxSystem || !camera) {
        throw new Error('[ai-tools] Thiếu dependencies');
    }

    // ─── Helpers ───
    function waitUntil(predicate, timeoutMs = 40000) {
        return new Promise((resolve, reject) => {
            const start = performance.now();
            const tick = () => {
                let ok = false;
                try { ok = !!predicate(); } catch (e) { return reject(e); }
                if (ok) return resolve();
                if (performance.now() - start > timeoutMs) {
                    return reject(new Error(`waitUntil timeout (state=${characterCtrl.state})`));
                }
                setTimeout(tick, 100);
            };
            tick();
        });
    }

    function getBoundary() {
        if (grabCtrl && Number.isFinite(grabCtrl.BOUND_RADIUS)) {
            return {
                radius: grabCtrl.BOUND_RADIUS,
                center: grabCtrl.BOUND_CENTER || DEFAULT_BOUNDARY.center,
            };
        }
        return DEFAULT_BOUNDARY;
    }

    function clampToBoundary(x, z) {
        const { radius, center } = getBoundary();
        const dx = x - center.x;
        const dz = z - center.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d <= radius) return { x, z };
        const k = radius / d;
        return { x: center.x + dx * k, z: center.z + dz * k };
    }

    function assertNotBusy(toolName) {
        if (BUSY_STATES.includes(characterCtrl.state)) {
            throw new Error(`[${toolName}] Character đang bận (state="${characterCtrl.state}").`);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // Snapshot
    // ═══════════════════════════════════════════════════════════
    function getSceneSnapshot(options = {}) {
        const maxBoxes = options.maxBoxes ?? 10;
        const cPos = characterCtrl.root.position;
        const carrying = characterCtrl.carriedBox;
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);

        return {
            character: {
                pos: [+cPos.x.toFixed(2), +Math.max(0, cPos.y).toFixed(2), +cPos.z.toFixed(2)],
                rotationY: +characterCtrl.root.rotation.y.toFixed(2),
                state: characterCtrl.state,
                carrying: carrying ? carrying.userData.id : null,
            },
            camera: {
                pos: [+camera.position.x.toFixed(2), +camera.position.y.toFixed(2), +camera.position.z.toFixed(2)],
                lookDir: [+camDir.x.toFixed(2), +camDir.y.toFixed(2), +camDir.z.toFixed(2)],
            },
            boxes: boxSystem.getAllBoxesInfo(maxBoxes, cPos),
            boundary: getBoundary(),
            availableColors: boxSystem.constructor.getAvailableColorNames(),
            availableModels: window.availableModels?.map(m => m.name) || [], // ⭐ Thêm danh sách model
        };
    }

    // ═══════════════════════════════════════════════════════════
    // Movement tools
    // ═══════════════════════════════════════════════════════════
    async function toolWalkTo(x, z) {
        assertNotBusy('toolWalkTo');
        if (!Number.isFinite(x) || !Number.isFinite(z)) throw new Error('x, z phải là số');
        const clamped = clampToBoundary(x, z);
        characterCtrl.goTo(new THREE.Vector3(clamped.x, 0, clamped.z));
        await waitUntil(() => characterCtrl.state === 'idle' || characterCtrl.state === 'carryIdle');
        return { ok: true, finalPos: [characterCtrl.root.position.x, characterCtrl.root.position.z] };
    }

    async function toolWalkRelative(direction, distance = 3.0) {
        assertNotBusy('toolWalkRelative');
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        const forward = new THREE.Vector3(dir.x, 0, dir.z).normalize();
        if (forward.lengthSq() < 0.01) forward.set(0, 0, -1);
        const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

        const moveVec = new THREE.Vector3();
        const d = direction.toLowerCase().trim();
        if (d === 'left') moveVec.copy(right).multiplyScalar(-distance);
        else if (d === 'right') moveVec.copy(right).multiplyScalar(distance);
        else if (d === 'forward') moveVec.copy(forward).multiplyScalar(distance);
        else if (d === 'backward') moveVec.copy(forward).multiplyScalar(-distance);
        else throw new Error(`Hướng không hợp lệ: "${direction}"`);

        return await toolWalkTo(
            characterCtrl.root.position.x + moveVec.x,
            characterCtrl.root.position.z + moveVec.z
        );
    }

    function toolTurn(direction, degrees = null) {
        assertNotBusy('toolTurn');
        if (Number.isFinite(degrees)) {
            const rad = degrees * Math.PI / 180;
            characterCtrl.root.rotation.y += rad;
            return { ok: true, rotationY: characterCtrl.root.rotation.y, degrees };
        }
        const d = (direction || '').toLowerCase().trim();
        const angle = Math.PI / 2;
        if (d === 'left') characterCtrl.root.rotation.y += angle;
        else if (d === 'right') characterCtrl.root.rotation.y -= angle;
        else if (d === 'back') characterCtrl.root.rotation.y += Math.PI;
        else throw new Error(`Hướng xoay không hợp lệ: "${direction}"`);
        return { ok: true, rotationY: characterCtrl.root.rotation.y };
    }

    function toolLookAtCamera() {
        assertNotBusy('toolLookAtCamera');
        const camPos = camera.position;
        const charPos = characterCtrl.root.position;
        const angle = Math.atan2(camPos.x - charPos.x, camPos.z - charPos.z);
        characterCtrl.root.rotation.y = angle;
        return { ok: true, rotationY: angle };
    }

    // ═══════════════════════════════════════════════════════════
    // Pickup / drop
    // ═══════════════════════════════════════════════════════════
    async function toolWalkToPickup(boxId) {
        assertNotBusy('toolWalkToPickup');
        if (characterCtrl.carriedBox) throw new Error('Đang mang box — phải đặt xuống trước');
        const box = boxSystem.getBoxById(boxId);
        if (!box) throw new Error(`Không tìm thấy box "${boxId}"`);

        characterCtrl.walkToPickup(box);
        await waitUntil(() => characterCtrl.state === 'carryIdle');
        return { ok: true, pickedId: box.userData.id };
    }

    async function toolWalkToDropNearCamera(offset = 2.0) {
        assertNotBusy('toolWalkToDropNearCamera');
        if (!characterCtrl.carriedBox) throw new Error('Không mang box — không có gì để đặt');

        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        let dx = dir.x, dz = dir.z;
        const hLen = Math.sqrt(dx * dx + dz * dz);
        if (hLen < 0.01) { dx = 0; dz = -1; } else { dx /= hLen; dz /= hLen; }

        const clamped = clampToBoundary(
            camera.position.x + dx * offset,
            camera.position.z + dz * offset
        );
        characterCtrl.walkToDropAt(new THREE.Vector3(clamped.x, 0, clamped.z));
        await waitUntil(() => characterCtrl.state === 'idle');
        return { ok: true, dropPos: [clamped.x, clamped.z] };
    }

    async function toolWalkToDropAt(x, z) {
        assertNotBusy('toolWalkToDropAt');
        if (!characterCtrl.carriedBox) throw new Error('Không mang box — không có gì để đặt');
        if (!Number.isFinite(x) || !Number.isFinite(z)) throw new Error('x, z phải là số');

        const clamped = clampToBoundary(x, z);
        characterCtrl.walkToDropAt(new THREE.Vector3(clamped.x, 0, clamped.z));
        await waitUntil(() => characterCtrl.state === 'idle');
        return { ok: true, dropPos: [clamped.x, clamped.z] };
    }

    async function toolWalkToDropAtNearest(color) {
        assertNotBusy('toolWalkToDropAtNearest');
        if (!characterCtrl.carriedBox) throw new Error('Không mang box — không có gì để đặt');

        const box = boxSystem.findNearestByColor(color, characterCtrl.root.position, true);
        if (!box) throw new Error(`Không tìm thấy hộp ${color} để đặt gần`);

        const dir = new THREE.Vector3().subVectors(characterCtrl.root.position, box.position);
        dir.y = 0;
        if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
        dir.normalize();
        const target = box.position.clone().addScaledVector(dir, 1.2);
        const clamped = clampToBoundary(target.x, target.z);

        characterCtrl.walkToDropAt(new THREE.Vector3(clamped.x, 0, clamped.z));
        await waitUntil(() => characterCtrl.state === 'idle');
        return { ok: true, dropPos: [clamped.x, clamped.z], nearBoxId: box.userData.id };
    }

    async function toolWalkToDropDirection(direction, distance = 2.0) {
        assertNotBusy('toolWalkToDropDirection');
        if (!characterCtrl.carriedBox) throw new Error('Không mang box — không có gì để đặt');

        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        const forward = new THREE.Vector3(dir.x, 0, dir.z).normalize();
        if (forward.lengthSq() < 0.01) forward.set(0, 0, -1);
        const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

        const moveVec = new THREE.Vector3();
        const d = (direction || 'forward').toLowerCase().trim();

        if (d === 'forward' || d === 'truoc' || d === 'tien') moveVec.copy(forward).multiplyScalar(distance);
        else if (d === 'backward' || d === 'sau' || d === 'lui') moveVec.copy(forward).multiplyScalar(-distance);
        else if (d === 'left' || d === 'trai') moveVec.copy(right).multiplyScalar(-distance);
        else if (d === 'right' || d === 'phai') moveVec.copy(right).multiplyScalar(distance);
        else throw new Error(`Hướng không hợp lệ: "${direction}"`);

        const targetX = characterCtrl.root.position.x + moveVec.x;
        const targetZ = characterCtrl.root.position.z + moveVec.z;
        const clamped = clampToBoundary(targetX, targetZ);

        characterCtrl.walkToDropAt(new THREE.Vector3(clamped.x, 0, clamped.z));
        await waitUntil(() => characterCtrl.state === 'idle');
        return { ok: true, dropPos: [clamped.x, clamped.z] };
    }

    // ═══════════════════════════════════════════════════════════
    // Spawn & Switch
    // ═══════════════════════════════════════════════════════════
    function toolSpawnBox(color = 'amber', x = null, z = null, spawnHeight = 2.5) {
        const hex = boxSystem.constructor.getColorFromName(color);
        if (x === null || z === null) {
            x = (Math.random() - 0.5) * 10;
            z = (Math.random() - 0.5) * 10;
        }
        const clamped = clampToBoundary(x, z);
        const box = boxSystem.addBox(clamped.x, clamped.z, hex, { spawnHeight });
        return { ok: true, id: box.userData.id, color: box.userData.colorName };
    }

    // ⭐ Hàm đổi Model
    async function toolSwitchModel(modelName) {
        if (typeof window.switchCharacterModel !== 'function') {
            throw new Error('Tính năng đổi model chưa được khởi tạo.');
        }
        console.log(`[SwitchModel] Đang đổi sang: ${modelName}`);
        const result = await window.switchCharacterModel(modelName);
        if (!result.ok) {
            throw new Error(result.error);
        }
        return { ok: true, modelName: result.modelName };
    }

    // ═══════════════════════════════════════════════════════════
    // Execute
    // ═══════════════════════════════════════════════════════════
    async function executeCommand(cmd) {
        const { tool, args = {} } = cmd;
        console.log(`[exec] ${tool}(${JSON.stringify(args)})`);

        switch (tool) {
            case 'walkTo': return toolWalkTo(args.x, args.z);
            case 'walkRelative': return toolWalkRelative(args.direction, args.distance);
            case 'turn': return toolTurn(args.direction, args.degrees);
            case 'lookAtCamera': return toolLookAtCamera();
            case 'walkToPickup': return toolWalkToPickup(args.boxId);
            case 'walkToDropNearCamera': return toolWalkToDropNearCamera(args.offset);
            case 'walkToDropAt': return toolWalkToDropAt(args.x, args.z);
            case 'walkToDropAtNearest': return toolWalkToDropAtNearest(args.color);
            case 'walkToDropDirection': return toolWalkToDropDirection(args.direction, args.distance);
            case 'spawnBox': return toolSpawnBox(args.color, args.x, args.z, args.spawnHeight);
            case 'switchModel': return await toolSwitchModel(args.modelName); // ⭐ Thêm case
            default: throw new Error(`Tool không tồn tại: "${tool}"`);
        }
    }

    async function executeSequence(cmds, options = {}) {
        if (!Array.isArray(cmds)) throw new Error('[executeSequence] cmds phải là mảng');
        if (cmds.length === 0) throw new Error('[executeSequence] Mảng rỗng');

        const results = [];
        for (let i = 0; i < cmds.length; i++) {
            const cmd = cmds[i];
            if (options.onProgress) options.onProgress(i + 1, cmds.length, cmd);
            console.log(`[seq] ${i + 1}/${cmds.length} → ${cmd.tool}`);
            const result = await executeCommand(cmd);
            results.push(result);
        }
        return results;
    }

    return {
        getSceneSnapshot,
        waitUntil,
        toolWalkTo,
        toolWalkRelative,
        toolTurn,
        toolLookAtCamera,
        toolWalkToPickup,
        toolWalkToDropNearCamera,
        toolWalkToDropAt,
        toolWalkToDropAtNearest,
        toolWalkToDropDirection,
        toolSpawnBox,
        toolSwitchModel, // ⭐ Export
        executeCommand,
        executeSequence,
    };
}
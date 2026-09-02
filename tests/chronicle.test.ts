import { describe, it, expect } from 'vitest';
import { createWorld, recordChronicle } from '../assets/scripts/core/WorldState';
import { createCityStates } from '../assets/scripts/core/CityRegistry';
import { runWorldTurn } from '../assets/scripts/core/TurnFlow';
import { executeCouncilOrder } from '../assets/scripts/core/CommandSystem';
import { serializeSave, applySave } from '../assets/scripts/core/SaveSystem';
import { resolveEnvoy, updateAiDiplomacy } from '../assets/scripts/core/AIDiplomacy';

const LOW = () => 0.01;

describe('Chronicle 本局史册', () => {
    it('recordChronicle 带年代季节前缀并限长 120 条', () => {
        const world = createWorld(619, createCityStates());
        world.seasonIndex = 1;
        recordChronicle(world, '唐军大捷');
        expect(world.chronicle[0]).toBe('619年夏 · 唐军大捷');
        for (let i = 0; i < 150; i++) {
            recordChronicle(world, `第${i}事`);
        }
        expect(world.chronicle.length).toBe(120);
        expect(world.chronicle[world.chronicle.length - 1]).toContain('第149事');
        expect(world.chronicle[0]).toContain('第30事'); // 最旧的 30 条被丢弃
    });

    it('唐城失守自动入史册', () => {
        const flow = createWorld(618, createCityStates());
        for (const c of flow.cities) {
            if (c.id === 'mayi') { c.faction = 'liu'; }
        }
        for (let t = 0; t < 12; t++) {
            flow.turn += 1;
            flow.seasonIndex = flow.turn % 4;
            flow.year = 618 + Math.floor(flow.turn / 4);
            runWorldTurn(flow, LOW);
            if (flow.chronicle.some((l) => l.includes('失守'))) break;
        }
        expect(flow.chronicle.some((l) => l.includes('失守'))).toBe(true);
    });

    it('玩家攻克城池入史册', () => {
        const world = createWorld(618, createCityStates());
        // 找一座唐城邻接的残城：直接把目标打成残城，用 LOW rng 保胜利
        const target = world.cities.find((c) => c.id === 'mayi')!;
        target.army = 1;
        target.defense = 1;
        target.gold = 100;
        const source = world.cities.find((c) => c.id === 'taiyuan')!;
        source.army = 20000;
        const out = executeCouncilOrder(world, 'raid', 'taiyuan', LOW);
        expect(out.ok).toBe(true);
        expect(world.chronicle.some((l) => l.includes('攻克') && l.includes('马邑'))).toBe(true);
    });

    it('遣使抉择入史册', () => {
        const world = createWorld(618, createCityStates());
        const offer = { faction: 'liu', kind: 'peace' as const, truceTurns: 8, message: 'test' };
        resolveEnvoy(world, offer, true);
        expect(world.chronicle.some((l) => l.includes('罢兵'))).toBe(true);
    });

    it('史册随存档 v2 往返；旧档缺省空史册', () => {
        const world = createWorld(620, createCityStates());
        recordChronicle(world, '太原誓师');
        const data = serializeSave(world);
        const restored = createWorld(617, createCityStates());
        applySave(restored, data);
        expect(restored.chronicle).toEqual(['620年秋 · 太原誓师']);

        const legacy = { ...serializeSave(world), chronicle: undefined } as never;
        const restored2 = createWorld(617, createCityStates());
        applySave(restored2, legacy);
        expect(restored2.chronicle).toEqual([]);
    });
});

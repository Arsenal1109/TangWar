import { describe, it, expect } from 'vitest';
import { CITIES, ADJACENCY, neighborsOf, isAdjacent, cityDistance } from '../assets/scripts/data/Cities';

describe('城池邻接图', () => {
    it('邻接表覆盖全部城池', () => {
        for (const c of CITIES) {
            expect(ADJACENCY[c.id], `城池 ${c.id} 缺少邻接记录`).toBeDefined();
        }
        expect(Object.keys(ADJACENCY).length).toBe(CITIES.length);
    });

    it('邻接关系无向对称', () => {
        for (const [id, list] of Object.entries(ADJACENCY)) {
            for (const n of list) {
                expect(ADJACENCY[n], `城池 ${n} 不在邻接表中`).toBeDefined();
                expect(ADJACENCY[n].includes(id), `${n} 未回指 ${id}`).toBe(true);
            }
        }
    });

    it('不含自环与重复', () => {
        for (const [id, list] of Object.entries(ADJACENCY)) {
            expect(list.includes(id), `${id} 自环`).toBe(false);
            expect(new Set(list).size, `${id} 邻接列表有重复`).toBe(list.length);
        }
    });

    it('全图连通：任意城池可从太原到达', () => {
        const seen = new Set<string>(['taiyuan']);
        const queue = ['taiyuan'];
        while (queue.length > 0) {
            const cur = queue.shift()!;
            for (const n of ADJACENCY[cur] ?? []) {
                if (!seen.has(n)) {
                    seen.add(n);
                    queue.push(n);
                }
            }
        }
        for (const c of CITIES) {
            expect(seen.has(c.id), `${c.name}(${c.id}) 与太原不连通`).toBe(true);
        }
    });

    it('neighborsOf/isAdjacent/cityDistance 基本行为', () => {
        expect(neighborsOf('taiyuan').map((c) => c.id)).toContain('luoyang');
        expect(isAdjacent('taiyuan', 'luoyang')).toBe(true);
        expect(isAdjacent('taiyuan', 'guangzhou')).toBe(false);
        expect(cityDistance(CITIES[0], CITIES[0])).toBe(0);
        expect(neighborsOf('__unknown__')).toEqual([]);
        expect(isAdjacent('__unknown__', 'taiyuan')).toBe(false);
    });
});

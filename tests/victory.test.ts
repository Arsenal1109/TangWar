import { describe, it, expect } from 'vitest';
import { createWorld } from '../assets/scripts/core/WorldState';
import { createCityStates } from '../assets/scripts/core/CityRegistry';
import { checkVictory } from '../assets/scripts/core/Victory';

describe('Victory 胜负判定', () => {
    it('唐无城池＝败亡结局', () => {
        const w = createWorld(620, createCityStates());
        w.cities.forEach((c) => { c.faction = 'sui'; });
        const r = checkVictory(w);
        expect(r.finished).toBe(true);
        expect(r.grade).toBe('defeat');
    });

    it('唐据全部城池＝一统天下（最佳结局）', () => {
        const w = createWorld(620, createCityStates());
        w.cities.forEach((c) => { c.faction = 'tang'; });
        const r = checkVictory(w);
        expect(r.finished).toBe(true);
        expect(r.grade).toBe('unify');
    });

    it('群雄并立：未结束', () => {
        const w = createWorld(620, createCityStates());
        const r = checkVictory(w);
        expect(r.finished).toBe(false);
    });

    it('626 年已称帝→武德主线（李世民贞观）', () => {
        const w = createWorld(626, createCityStates());
        w.flags['chengdi'] = true;
        w.cities[0].faction = 'tang';
        const r = checkVictory(w);
        expect(r.finished).toBe(true);
        expect(r.grade).toBe('reign');
    });

    it('626 年未入主长安→偏安支线', () => {
        const w = createWorld(626, createCityStates());
        w.flags['chengdi'] = false;
        w.cities[0].faction = 'tang';
        const r = checkVictory(w);
        expect(r.finished).toBe(true);
        expect(r.grade).toBe('decline');
    });
});
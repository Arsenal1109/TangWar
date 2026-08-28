import { describe, it, expect } from 'vitest';
import { createWorld } from '../assets/scripts/core/WorldState';
import { createCityStates } from '../assets/scripts/core/CityRegistry';
import { checkHistoricalEvents } from '../assets/scripts/core/EventSystem';

function worldAt(year: number, mutate?: (id: string, faction: string) => void) {
    const w = createWorld(year, createCityStates());
    if (mutate) {
        w.cities.forEach((c) => (c.faction = mutate(c.id, c.faction)));
    }
    return w;
}

describe('EventSystem 历史事件', () => {
    it('618 年唐据长安触发入主长安，武德称帝标志置位', () => {
        const w = worldAt(618);
        // 长安本就属 tang
        const r = checkHistoricalEvents(w);
        expect(r.names).toContain('入主长安');
        expect(r.messages.length).toBeGreaterThan(0);
        expect(w.flags['chengdi']).toBe(true);
        expect(w.flags['tang-enter-changan']).toBe(true);
    });

    it('历史事件只触发一次（once）', () => {
        const w = worldAt(618);
        checkHistoricalEvents(w);
        const again = checkHistoricalEvents(w);
        expect(again.names.filter((n) => n === '入主长安').length).toBe(0);
    });

    it('617 年未入主线：不触发称帝事件', () => {
        const w = worldAt(617);
        const r = checkHistoricalEvents(w);
        expect(r.names).not.toContain('入主长安');
        expect(w.flags['chengdi']).toBeUndefined();
    });

    it('619 年郑据洛阳触发王世充称帝', () => {
        const w = worldAt(619, (id, f) => (id === 'luoyang' ? 'zheng' : f));
        const r = checkHistoricalEvents(w);
        expect(r.names).toContain('王世充称帝');
        expect(w.flags['zhengChengdi']).toBe(true);
    });
});
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

    it('江都宫变：隋土守军哗变减员、民心下坠', () => {
        const w = worldAt(618);
        const jiangdu = w.cities.find((c) => c.id === 'jiangdu')!;
        const armyBefore = jiangdu.army;
        const moraleBefore = jiangdu.morale;
        checkHistoricalEvents(w);
        expect(w.flags['suiDown']).toBe(true);
        expect(jiangdu.army).toBeLessThan(armyBefore);
        expect(jiangdu.morale).toBeLessThan(moraleBefore);
    });

    it('瓦岗鼎盛：李密据两城时全军入精兵', () => {
        const w = worldAt(617);
        const xingyang = w.cities.find((c) => c.id === 'xingyang')!;
        const pengcheng = w.cities.find((c) => c.id === 'pengcheng')!;
        expect(xingyang.faction).toBe('wa');
        expect(pengcheng.faction).toBe('wa');
        const r = checkHistoricalEvents(w);
        expect(r.names).toContain('瓦岗鼎盛');
        expect(xingyang.troops.jingbing).toBeGreaterThan(0);
        expect(w.flags['waPeak']).toBe(true);
    });

    it('虎牢关大捷：唐据洛阳后触发，洛阳入金', () => {
        const w = worldAt(621, (id, f) => (id === 'luoyang' ? 'tang' : f));
        const luoyang = w.cities.find((c) => c.id === 'luoyang')!;
        const goldBefore = luoyang.gold;
        const r = checkHistoricalEvents(w);
        expect(r.names).toContain('虎牢关大捷');
        expect(w.flags['hulao']).toBe(true);
        expect(luoyang.gold).toBeGreaterThan(goldBefore);
    });

    it('瓦岗败亡：两城皆失后触发，旧土民心不稳', () => {
        const w = worldAt(620, (id, f) => ((id === 'xingyang' || id === 'pengcheng') ? 'zheng' : f));
        const xingyang = w.cities.find((c) => c.id === 'xingyang')!;
        const moraleBefore = xingyang.morale;
        checkHistoricalEvents(w);
        expect(w.flags['waFallen']).toBe(true);
        expect(xingyang.morale).toBeLessThan(moraleBefore);
    });

    it('陇右归唐：秦凉皆灭后触发西陲底定', () => {
        const w = worldAt(619, (id, f) => ((f === 'qin' || f === 'liang') ? 'tang' : f));
        const r = checkHistoricalEvents(w);
        expect(r.names).toContain('陇右归唐');
        expect(w.flags['westPacified']).toBe(true);
    });

    it('刘武周南下：定杨成军南下兵团', () => {
        const w = worldAt(619);
        const mayi = w.cities.find((c) => c.id === 'mayi')!;
        const cavalryBefore = mayi.troops.qibing;
        const r = checkHistoricalEvents(w);
        expect(r.names).toContain('刘武周南下');
        expect(w.flags['liuThreat']).toBe(true);
        expect(mayi.troops.qibing).toBeGreaterThan(cavalryBefore);
    });
});
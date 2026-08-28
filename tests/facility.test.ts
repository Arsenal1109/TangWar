import { describe, it, expect } from 'vitest';
import { buildFacility, facilityCost, facilityName } from '../assets/scripts/core/FacilitySystem';
import { createCityStates, resetTurnFlags } from '../assets/scripts/core/CityRegistry';
import { resolveTurn } from '../assets/scripts/core/ResourceSystem';

describe('FacilitySystem 设施', () => {
    it('建设农田：扣金、升级、名称正确', () => {
        const [c] = createCityStates();
        const res = buildFacility(c, 'farm');
        expect(res.ok).toBe(true);
        expect(c.facilities.farm).toBe(2);
        expect(c.gold).toBeLessThan(600);
        expect(facilityName('market')).toBe('商市');
    });

    it('满级（3 级）不能再建', () => {
        const [c] = createCityStates();
        c.facilities.farm = 3;
        const res = buildFacility(c, 'farm');
        expect(res.ok).toBe(false);
    });

    it('设施等级越高产出越高（农田 +20%/级）', () => {
        const low = createCityStates()[0];
        low.facilities.farm = 0;
        low.facilities.market = 0;
        const high = createCityStates()[0];
        high.facilities.farm = 3;
        high.facilities.market = 3;
        // 人口 15（州府）：基础粮 150，+60% = 240；基础金 60，+60% = 96
        const rLow = resolveTurn([low]);
        const rHigh = resolveTurn([high]);
        expect(rHigh.deltas.food).toBeGreaterThan(rLow.deltas.food);
        expect(rHigh.deltas.gold).toBeGreaterThan(rLow.deltas.gold);
    });

    it('仓廪缓冲缺粮：0 级逃兵，3 级不全逃', () => {
        const no = createCityStates()[0];
        no.facilities.granary = 0;
        no.population = 0; no.food = 0; no.army = 4000;
        const yes = createCityStates()[0];
        yes.facilities.granary = 3;
        yes.population = 0; yes.food = 0; yes.army = 4000;
        resolveTurn([no]);
        resolveTurn([yes]);
        expect(yes.army).toBeGreaterThan(no.army);
    });

    it('resetTurnFlags 清空各城 policyUsed', () => {
        const cities = createCityStates();
        cities[0].policyUsed = true;
        cities[1].policyUsed = true;
        resetTurnFlags(cities);
        expect(cities.every((c) => c.policyUsed === false)).toBe(true);
    });
});

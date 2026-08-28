import { describe, it, expect } from 'vitest';
import { resolveBattle, type BattleArmy } from '../assets/scripts/core/BattleSystem';

// 胜掷 r 满足 r < attWinProb 则攻方胜：
//   低掷(0.05)≈强攻得手；高掷(0.95)≈守方得手；中掷(0.5)看概率。
const LOW_ROLL = () => 0.05;
const MID_ROLL = () => 0.5;
const HIGH_ROLL = () => 0.95;

function army(commander: number, troops: Record<string, number>): BattleArmy {
    return { generalCommand: commander, troops: troops as BattleArmy['troops'] };
}

describe('BattleSystem 战争结算', () => {
    it('实力悬殊：强攻胜', () => {
        const att = army(90, { fubing: 10000, qibing: 2000 });
        const def = army(40, { fubing: 3000 });
        const r = resolveBattle(att, def, { rng: LOW_ROLL });
        expect(r.attackerWin).toBe(true);
        expect(r.attackerLoss).toBeLessThan(12000);
        expect(r.defenderLoss).toBeLessThanOrEqual(3000);
    });

    it('城防加成可让守方获胜', () => {
        const att = army(60, { fubing: 8000 });
        const def = army(70, { fubing: 4000, nubing: 2000 });
        const r = resolveBattle(att, def, { cityDefense: 20, rng: HIGH_ROLL });
        expect(r.attackerWin).toBe(false);
    });

    it('江河惩罚可翻转战局（无水军渡江）', () => {
        const att = army(80, { fubing: 10000 });
        const def = army(60, { fubing: 8000 });
        const withPenalty = resolveBattle(att, def, { riverPenalty: 0.4, rng: MID_ROLL });
        const without = resolveBattle(att, def, { rng: MID_ROLL });
        expect(withPenalty.attackerWin).toBe(false);
        expect(without.attackerWin).toBe(true);
    });

    it('伤亡不超参战兵力', () => {
        const att = army(70, { qibing: 4000, nubing: 2000 });
        const def = army(70, { fubing: 6000, jingbing: 1000 });
        const r = resolveBattle(att, def, { rng: MID_ROLL });
        expect(r.attackerLoss).toBeLessThanOrEqual(6000);
        expect(r.defenderLoss).toBeLessThanOrEqual(7000);
        expect(r.report.length).toBeGreaterThan(0);
    });
});

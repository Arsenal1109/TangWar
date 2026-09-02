import { createWorld } from '../assets/scripts/core/WorldState';
import { createCityStates } from '../assets/scripts/core/CityRegistry';
import { createGeneralStates } from '../assets/scripts/core/GeneralSystem';
import { createDiplomacyState } from '../assets/scripts/core/Diplomacy';
import { runWorldTurn } from '../assets/scripts/core/TurnFlow';
import { executeCouncilOrder, raidOdds, raidTarget } from '../assets/scripts/core/CommandSystem';
import { checkVictory } from '../assets/scripts/core/Victory';

const world = createWorld(617, createCityStates(), createGeneralStates(), createDiplomacyState());
console.log('odds@taiyuan =', raidOdds(world, 'taiyuan'), 'target =', raidTarget(world, 'taiyuan')?.id);
let rngState = 42;
const rng = (): number => {
    rngState = (rngState * 1103515245 + 12345) & 0x7fffffff;
    return rngState / 0x7fffffff;
};
for (let turn = 1; turn <= 40; turn++) {
    const odds = raidOdds(world, 'taiyuan');
    const key = odds >= 50 ? 'raid' : 'pacify';
    const out = executeCouncilOrder(world, key as 'raid' | 'pacify', 'taiyuan', rng);
    if (!out.ok) executeCouncilOrder(world, 'defend', 'taiyuan', rng);
    const worldOut = runWorldTurn(world, rng);
    const target = raidTarget(world, 'taiyuan');
    const tang = world.cities.filter((c) => c.faction === 'tang');
    if (turn % 4 === 0 || !out.ok) {
        const mayi = world.cities.find((c) => c.id === 'mayi')!;
        console.log(
            `T${turn} [${out.ok ? out.title : out.reason}] odds=${odds} tang=${tang.length}城 兵${tang.reduce((s, c) => s + c.army, 0)} ` +
            `前线=${target ? `${target.name}(兵${target.army},防${target.defense},${target.faction})` : '无'} ` +
            `马邑=${mayi.faction}(兵${mayi.army})` +
            (worldOut.alerts.length ? ` ⚠${worldOut.alerts.length}急报` : '')
        );
    }
    const v = checkVictory(world);
    if (v.finished) {
        console.log(`结局 T${turn}: ${v.grade} — ${v.message}`);
        break;
    }
}

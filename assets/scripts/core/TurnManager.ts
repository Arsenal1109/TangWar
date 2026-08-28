import type { Season } from './Types';

const SEASONS: Season[] = ['春', '夏', '秋', '冬'];

const ERA_NAMES: Record<number, string> = {
    617: '大业十三年',
    618: '大业十四年·武德元年',
    619: '武德二年',
    620: '武德三年',
    621: '武德四年',
    622: '武德五年',
    623: '武德六年',
    624: '武德七年',
    625: '武德八年',
    626: '武德九年'
};

export class TurnManager {
    constructor(
        public year: number,
        public seasonIndex: number,
        public turn: number = 0
    ) {}

    static eraName(year: number): string {
        return ERA_NAMES[year] ?? `武德${year - 617}年`;
    }

    getSeason(): Season {
        return SEASONS[this.seasonIndex];
    }

    getTurnNumber(): number {
        return this.turn;
    }

    advance(): void {
        this.seasonIndex += 1;
        if (this.seasonIndex >= SEASONS.length) {
            this.seasonIndex = 0;
            this.year += 1;
        }
        this.turn += 1;
    }
}

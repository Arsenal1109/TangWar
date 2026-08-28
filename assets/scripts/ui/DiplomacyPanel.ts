import { _decorator, Component, Node, Label, Color, UITransform } from 'cc';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../Bootstrap';
import { createDiplomacyState, performDiplo, type DiplomacyState } from '../core/Diplomacy';
import type { CityState } from '../core/ResourceSystem';
import { FACTIONS } from '../data/Factions';
import { InkTheme } from './InkTheme';

const { ccclass } = _decorator;

@ccclass('DiplomacyPanel')
export class DiplomacyPanel extends Component {
    private bus!: EventBus<GameEvents>;
    private state!: DiplomacyState;
    private states: CityState[] = [];
    private listRoot!: Node;
    private titleLabel!: Label;
    private feedbackLabel!: Label;

    init(bus: EventBus<GameEvents>, states: CityState[]): this {
        this.bus = bus;
        this.state = createDiplomacyState('tang');
        this.states = states;
        this.build();
        return this;
    }

    /** 唐国各城金合计（国库），进贡支出据此扣除 */
    private treasury(): number {
        return this.states
            .filter((c) => c.faction === 'tang')
            .reduce((s, c) => s + c.gold, 0);
    }

    /** 从唐国城池按顺序扣款，直到扣满 cost */
    private deduct(cost: number): void {
        let rest = cost;
        for (const c of this.states) {
            if (c.faction !== 'tang' || rest <= 0) {
                continue;
            }
            const take = Math.min(c.gold, rest);
            c.gold -= take;
            rest -= take;
        }
    }

    private build(): void {
        this.node.addComponent(UITransform).setContentSize(700, 420);
        this.node.setPosition(0, -667 + 260, 2);
        this.titleLabel = this.makeLabel('外交', 38, InkTheme.darkText, 0, 170);
        this.feedbackLabel = this.makeLabel('', 22, InkTheme.cinnabar, 0, -160);
        this.listRoot = new Node('diplo-list');
        this.node.addChild(this.listRoot);
        this.refresh();
    }

    private makeLabel(text: string, size: number, color: Color, x: number, y: number): Label {
        const n = new Node('label');
        n.addComponent(UITransform).setContentSize(650, 44);
        const l = n.addComponent(Label);
        l.string = text;
        l.fontSize = size;
        l.lineHeight = size + 6;
        l.color = color;
        l.useSystemFont = true;
        n.setPosition(x, y, 1);
        this.node.addChild(n);
        return l;
    }

    private refresh(): void {
        const gold = this.treasury();
        this.titleLabel.string = `外交 · 大唐 · 国库 ${gold} 金`;
        this.listRoot.removeAllChildren();
        FACTIONS.filter((f) => f.id !== 'tang').forEach((f, i) => {
            const rel = this.state.relations[f.id] ?? 0;
            const row = new Node(f.name);
            row.addComponent(UITransform).setContentSize(650, 54);
            row.setPosition(0, 110 - i * 60, 1);
            const label = row.addComponent(Label);
            label.string = `${f.name} · 关系 ${rel} · 点触：进贡（耗 200 金）`;
            label.fontSize = 20;
            label.lineHeight = 26;
            label.color = InkTheme.darkText;
            label.useSystemFont = true;
            label.overflow = 3;
            row.on(Node.EventType.TOUCH_END, () => {
                const res = performDiplo(this.state, 'tang', f.id, 'tribute', { gold, prestige: 80, armyPower: this.tangPower() });
                if (res.ok) {
                    this.deduct(res.goldCost);
                }
                this.feedbackLabel.color = res.ok ? InkTheme.ink : InkTheme.cinnabar;
                this.feedbackLabel.string = res.ok ? res.message : `${res.reason}`;
                this.refresh();
            });
            this.listRoot.addChild(row);
        });
    }

    /** 唐国总兵力，作为外交威慑的军力参考 */
    private tangPower(): number {
        return this.states
            .filter((c) => c.faction === 'tang')
            .reduce((s, c) => s + c.army, 0);
    }
}

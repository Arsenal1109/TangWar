import { _decorator, Component, Node, Label, Color, UITransform } from 'cc';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../Bootstrap';
import { createDiplomacyState, performDiplo, type DiplomacyState } from '../core/Diplomacy';
import { FACTIONS } from '../data/Factions';
import { InkTheme } from './InkTheme';

const { ccclass } = _decorator;

@ccclass('DiplomacyPanel')
export class DiplomacyPanel extends Component {
    private bus!: EventBus<GameEvents>;
    private state!: DiplomacyState;
    private listRoot!: Node;
    private titleLabel!: Label;
    private feedbackLabel!: Label;

    init(bus: EventBus<GameEvents>): this {
        this.bus = bus;
        this.state = createDiplomacyState('tang');
        this.build();
        return this;
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
        this.titleLabel.string = '外交 · 大唐';
        this.listRoot.removeAllChildren();
        FACTIONS.filter((f) => f.id !== 'tang').forEach((f, i) => {
            const rel = this.state.relations[f.id] ?? 0;
            const row = new Node(f.name);
            row.addComponent(UITransform).setContentSize(650, 54);
            row.setPosition(0, 110 - i * 60, 1);
            const label = row.addComponent(Label);
            label.string = `${f.name} · 关系 ${rel} · 点触：进贡`;
            label.fontSize = 20;
            label.lineHeight = 26;
            label.color = InkTheme.darkText;
            label.useSystemFont = true;
            label.overflow = 3;
            row.on(Node.EventType.TOUCH_END, () => {
                const res = performDiplo(this.state, 'tang', f.id, 'tribute', { gold: 500, prestige: 80, armyPower: 30000 });
                this.feedbackLabel.color = res.ok ? InkTheme.ink : InkTheme.cinnabar;
                this.feedbackLabel.string = res.ok ? res.message : `${res.message}（${res.reason}）`;
                this.refresh();
            });
            this.listRoot.addChild(row);
        });
    }
}

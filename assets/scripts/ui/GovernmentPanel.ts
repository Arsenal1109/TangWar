import { _decorator, Component, Node, Label, Color, UITransform } from 'cc';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../Bootstrap';
import type { CityState } from '../core/ResourceSystem';
import { POLICIES } from '../data/Policies';
import { applyPolicy } from '../core/PolicySystem';
import { findCity } from '../core/CityRegistry';
import { InkTheme } from './InkTheme';

const { ccclass } = _decorator;

@ccclass('GovernmentPanel')
export class GovernmentPanel extends Component {
    private bus!: EventBus<GameEvents>;
    private states: CityState[] = [];
    private selectedId = 'taiyuan';
    private titleLabel!: Label;
    private resLabel!: Label;
    private listRoot!: Node;

    init(bus: EventBus<GameEvents>, states: CityState[]): this {
        this.bus = bus;
        this.states = states;
        this.build();
        bus.on('city-selected', (p) => {
            this.selectedId = p.cityId;
            this.refresh();
        });
        bus.on('turn-advanced', () => this.refresh());
        return this;
    }

    private build(): void {
        this.node.addComponent(UITransform).setContentSize(700, 520);
        this.node.setPosition(0, -667 + 300, 2);

        this.titleLabel = this.makeLabel('内政', 40, InkTheme.darkText, 0, 220);
        this.resLabel = this.makeLabel('', 24, InkTheme.labelText, 0, 160);
        this.listRoot = new Node('policy-list');
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
        const city = findCity(this.states, this.selectedId);
        if (!city) {
            return;
        }
        this.titleLabel.string = `${city.name} · 内政`;
        this.resLabel.string =
            `金 ${city.gold} · 粮 ${city.food} · 民心 ${city.morale} · 已施政 ${city.policyUsed ? '是' : '否'}`;

        this.listRoot.removeAllChildren();
        POLICIES.forEach((p, i) => {
            const row = new Node(p.name);
            row.addComponent(UITransform).setContentSize(650, 56);
            row.setPosition(0, 100 - i * 62, 1);
            const label = row.addComponent(Label);
            label.string = `${p.name} — ${p.desc}`;
            label.fontSize = 22;
            label.lineHeight = 28;
            label.color = InkTheme.darkText;
            label.useSystemFont = true;
            label.overflow = 3; // OVERFLOW_SHRINK
            row.on(Node.EventType.TOUCH_END, () => {
                const r = applyPolicy(city, p.id);
                console.log(`[内政] ${p.name}：${r.ok ? '施行成功' : r.reason}`);
                this.refresh();
            });
            this.listRoot.addChild(row);
        });
    }
}

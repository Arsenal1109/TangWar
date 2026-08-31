import { _decorator, Component, Node, Label, Color, UITransform, Graphics } from 'cc';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../Bootstrap';
import type { CityState } from '../core/ResourceSystem';
import { POLICIES } from '../data/Policies';
import { applyPolicy } from '../core/PolicySystem';
import { findCity } from '../core/CityRegistry';
import { InkTheme } from './InkTheme';
import { prepareBottomSheet } from './PanelChrome';

const { ccclass } = _decorator;

@ccclass('GovernmentPanel')
export class GovernmentPanel extends Component {
    private bus!: EventBus<GameEvents>;
    private states: CityState[] = [];
    private selectedId = 'taiyuan';
    private titleLabel!: Label;
    private resLabel!: Label;
    private feedbackLabel!: Label;
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
        prepareBottomSheet(this.node, 650, '内政施策 · 每季一项', () => this.bus.emit('panel-close', {}));

        this.titleLabel = this.makeLabel('内政', 34, InkTheme.darkText, 0, 210);
        this.resLabel = this.makeLabel('', 22, InkTheme.labelText, 0, 158);
        this.feedbackLabel = this.makeLabel('', 22, InkTheme.cinnabar, 0, -250);
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
            row.addComponent(UITransform).setContentSize(650, 72);
            row.setPosition(0, 90 - i * 78, 1);
            const cardNode = new Node('CardBg');
            cardNode.addComponent(UITransform).setContentSize(650, 68);
            const card = cardNode.addComponent(Graphics);
            card.fillColor = new Color(253, 248, 232, 235);
            card.roundRect(-325, -34, 650, 68, 10);
            card.fill();
            card.strokeColor = new Color(179, 154, 98, 210);
            card.lineWidth = 1.5;
            card.roundRect(-325, -34, 650, 68, 10);
            card.stroke();
            row.addChild(cardNode);
            const labelNode = new Node('PolicyLabel');
            labelNode.addComponent(UITransform).setContentSize(620, 58);
            const label = labelNode.addComponent(Label);
            label.string = `${p.name} — ${p.desc}`;
            label.fontSize = 21;
            label.lineHeight = 28;
            label.color = InkTheme.darkText;
            label.useSystemFont = true;
            label.overflow = 3; // OVERFLOW_SHRINK
            row.addChild(labelNode);
            row.on(Node.EventType.TOUCH_END, () => {
                const r = applyPolicy(city, p.id);
                this.feedbackLabel.color = r.ok ? InkTheme.ink : InkTheme.cinnabar;
                this.feedbackLabel.string = r.ok ? `施行「${p.name}」成功` : `施行「${p.name}」：${r.reason}`;
                this.refresh();
            });
            this.listRoot.addChild(row);
        });
    }
}

import { _decorator, Component, Node, Label, Color, UITransform } from 'cc';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../Bootstrap';
import { InkTheme } from './InkTheme';

const { ccclass } = _decorator;

// 天下大事：回合结算后，在顶部下方推送战报 / 历史事件
@ccclass('EventsPanel')
export class EventsPanel extends Component {
    private bus!: EventBus<GameEvents>;
    private titleLabel!: Label;
    private bodyLabel!: Label;

    init(bus: EventBus<GameEvents>): this {
        this.bus = bus;
        this.build();
        this.bus.on('world-events', (p) => {
            this.titleLabel.string = p.title;
            this.bodyLabel.string = p.messages.join('\n');
            this.node.active = true;
        });
        return this;
    }

    private build(): void {
        this.node.addComponent(UITransform).setContentSize(710, 210);
        this.node.setPosition(0, 330, 3);
        this.node.active = false;

        this.titleLabel = this.makeLabel('天下大事', 30, InkTheme.goldText, 0, 78);
        this.bodyLabel = this.makeLabel('', 20, InkTheme.darkText, 0, 30);
    }

    private makeLabel(text: string, size: number, color: Color, x: number, y: number): Label {
        const n = new Node('label');
        n.addComponent(UITransform).setContentSize(670, 160);
        const l = n.addComponent(Label);
        l.string = text;
        l.fontSize = size;
        l.lineHeight = size + 8;
        l.color = color;
        l.useSystemFont = true;
        l.overflow = 2;
        n.setPosition(x, y, 1);
        this.node.addChild(n);
        return l;
    }
}
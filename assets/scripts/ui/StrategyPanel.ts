import { _decorator, Color, Component, Graphics, Label, Node, UITransform } from 'cc';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../Bootstrap';
import type { CityState } from '../core/ResourceSystem';
import { spreadRumor } from '../core/Stratagem';
import { InkTheme } from './InkTheme';
import { prepareBottomSheet } from './PanelChrome';

const { ccclass } = _decorator;

const STRATEGIES = [
    { name: '离间', desc: '扰乱敌方将领忠诚 · 耗金 80' },
    { name: '计取', desc: '以重金策反敌将 · 耗金 400' },
    { name: '伏兵', desc: '于关隘伏击过境敌军' },
    { name: '谣言', desc: '动摇敌城民心 · 耗金 40' }
];

@ccclass('StrategyPanel')
export class StrategyPanel extends Component {
    private bus!: EventBus<GameEvents>;
    private states: CityState[] = [];
    private feedback!: Label;

    init(bus: EventBus<GameEvents>, states: CityState[]): this {
        this.bus = bus;
        this.states = states;
        this.build();
        return this;
    }

    private build(): void {
        prepareBottomSheet(this.node, 650, '谋略 · 运筹帷幄', () => this.bus.emit('panel-close', {}));
        this.feedback = this.makeLabel('', 22, InkTheme.cinnabar, 0, -250, 650, 46);

        STRATEGIES.forEach((item, i) => {
            const row = new Node(item.name);
            row.addComponent(UITransform).setContentSize(650, 78);
            row.setPosition(0, 145 - i * 88, 1);
            const cardNode = new Node('CardBg');
            cardNode.addComponent(UITransform).setContentSize(650, 74);
            const g = cardNode.addComponent(Graphics);
            g.fillColor = new Color(253, 248, 232, 235);
            g.roundRect(-325, -37, 650, 74, 11);
            g.fill();
            g.strokeColor = new Color(179, 154, 98, 220);
            g.lineWidth = 2;
            g.roundRect(-325, -37, 650, 74, 11);
            g.stroke();
            row.addChild(cardNode);
            const labelNode = new Node('StrategyLabel');
            labelNode.addComponent(UITransform).setContentSize(620, 64);
            const label = labelNode.addComponent(Label);
            label.string = `${item.name}    ${item.desc}`;
            label.fontSize = 22;
            label.lineHeight = 29;
            label.color = InkTheme.darkText;
            label.useSystemFont = true;
            row.addChild(labelNode);
            row.on(Node.EventType.TOUCH_END, () => this.execute(item.name));
            this.node.addChild(row);
        });
    }

    private execute(name: string): void {
        if (name !== '谣言') {
            this.feedback.string = `「${name}」已列入军议，待选择目标`;
            return;
        }
        const source = this.states.find((c) => c.faction === 'tang');
        const target = this.states.find((c) => c.faction !== 'tang');
        if (!source || !target) return;
        const result = spreadRumor(target.morale, 82, source.gold);
        if (result.goldCost) source.gold -= result.goldCost;
        if (result.ok && result.moraleDelta) target.morale = Math.max(0, target.morale + result.moraleDelta);
        this.feedback.color = result.ok ? InkTheme.ink : InkTheme.cinnabar;
        this.feedback.string = result.ok ? `${result.message}（${target.name}）` : result.reason;
    }

    private makeLabel(text: string, size: number, color: Color, x: number, y: number, width: number, height: number): Label {
        const n = new Node('Feedback');
        n.addComponent(UITransform).setContentSize(width, height);
        const label = n.addComponent(Label);
        label.string = text;
        label.fontSize = size;
        label.lineHeight = size + 6;
        label.color = color;
        label.useSystemFont = true;
        n.setPosition(x, y, 1);
        this.node.addChild(n);
        return label;
    }
}

import { _decorator, Component, Node, Label, UITransform, Graphics, Color } from 'cc';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../Bootstrap';
import { InkTheme } from './InkTheme';
import { NextTurnButton } from './NextTurnButton';
import { TurnManager } from '../core/TurnManager';

const { ccclass } = _decorator;

const TABS = [
    { key: 'gov', text: '政', label: '内政' },
    { key: 'mil', text: '兵', label: '军事' },
    { key: 'gen', text: '将', label: '将领' },
    { key: 'dip', text: '盟', label: '外交' },
    { key: 'str', text: '谋', label: '谋略' }
];

@ccclass('BottomNav')
export class BottomNav extends Component {
    private bus!: EventBus<GameEvents>;
    private activeKey = 'gov';
    private tabNodes = new Map<string, Node>();

    init(turns: TurnManager, bus: EventBus<GameEvents>): this {
        this.bus = bus;
        this.build(turns);
        return this;
    }

    private build(turns: TurnManager): void {
        const rt = this.node.addComponent(UITransform);
        rt.setContentSize(750, 140);
        this.node.setPosition(0, -667 + 70, 2);

        const bg = this.node.addComponent(Graphics);
        bg.fillColor = InkTheme.ink;
        bg.rect(-375, -70, 750, 140);
        bg.fill();
        bg.strokeColor = InkTheme.gold;
        bg.lineWidth = 3;
        bg.moveTo(-375, 68);
        bg.lineTo(375, 68);
        bg.stroke();

        const positions = [-312, -186, 68, 195, 322];
        TABS.forEach((t, i) => {
            const x = positions[i];
            const n = new Node(t.label);
            n.addComponent(UITransform).setContentSize(104, 124);
            const circle = n.addComponent(Graphics);
            this.drawTab(circle, t.key === this.activeKey);

            const iconNode = new Node('Glyph');
            iconNode.addComponent(UITransform).setContentSize(58, 58);
            const icon = iconNode.addComponent(Label);
            icon.string = t.text;
            icon.fontSize = 30;
            icon.lineHeight = 38;
            icon.color = t.key === this.activeKey ? InkTheme.paperText : InkTheme.goldText;
            icon.useSystemFont = true;
            iconNode.setPosition(0, 18, 1);
            n.addChild(iconNode);

            const captionNode = new Node('Caption');
            captionNode.addComponent(UITransform).setContentSize(104, 30);
            const caption = captionNode.addComponent(Label);
            caption.string = t.label;
            caption.fontSize = 18;
            caption.lineHeight = 24;
            caption.color = InkTheme.goldText;
            caption.useSystemFont = true;
            captionNode.setPosition(0, -42, 1);
            n.addChild(captionNode);

            n.setPosition(x, 4, 1);
            this.node.addChild(n);
            this.tabNodes.set(t.key, n);
            n.on(Node.EventType.TOUCH_END, () => {
                this.activeKey = t.key;
                this.refreshTabs();
                console.log(`[导航] 切到「${t.label}」`);
                this.bus.emit('panel-nav', { key: t.key });
            });
        });

        const turn = new Node('RoundTurn');
        turn.setPosition(-59, 38, 2);
        turn.addComponent(NextTurnButton).init(turns, this.bus);
        this.node.addChild(turn);
    }

    private drawTab(g: Graphics, active: boolean): void {
        g.clear();
        g.fillColor = active ? InkTheme.cinnabar : new Color(28, 23, 16, 255);
        g.circle(0, 18, 31);
        g.fill();
        g.strokeColor = active ? InkTheme.cinnabar : new Color(90, 68, 38, 255);
        g.lineWidth = 2;
        g.circle(0, 18, 31);
        g.stroke();
    }

    private refreshTabs(): void {
        for (const [key, node] of this.tabNodes) {
            const on = key === this.activeKey;
            const g = node.getComponent(Graphics);
            const glyph = node.getChildByName('Glyph')?.getComponent(Label);
            if (g) this.drawTab(g, on);
            if (glyph) glyph.color = on ? InkTheme.paperText : InkTheme.goldText;
        }
    }
}

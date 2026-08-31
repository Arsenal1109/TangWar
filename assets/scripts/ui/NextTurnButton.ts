import { _decorator, Component, Node, Label, UITransform, Graphics, Color } from 'cc';
import { TurnManager } from '../core/TurnManager';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../Bootstrap';
import { InkTheme } from './InkTheme';

const { ccclass } = _decorator;

/** 下回合按钮：点击推进一个回合并广播事件 */
@ccclass('NextTurnButton')
export class NextTurnButton extends Component {
    private turns!: TurnManager;
    private bus!: EventBus<GameEvents>;

    init(turns: TurnManager, bus: EventBus<GameEvents>): this {
        this.turns = turns;
        this.bus = bus;
        const rt = this.node.addComponent(UITransform);
        rt.setContentSize(118, 118);
        const g = this.node.addComponent(Graphics);
        g.fillColor = InkTheme.cinnabarDark;
        g.circle(0, 0, 57);
        g.fill();
        g.strokeColor = new Color(247, 236, 216, 180);
        g.lineWidth = 5;
        g.circle(0, 0, 48);
        g.stroke();
        g.strokeColor = new Color(92, 30, 23, 255);
        g.lineWidth = 3;
        g.circle(0, 0, 57);
        g.stroke();
        const labelNode = new Node('TurnLabel');
        labelNode.addComponent(UITransform).setContentSize(86, 86);
        const label = labelNode.addComponent(Label);
        label.string = '回\n合';
        label.fontSize = 28;
        label.lineHeight = 31;
        label.color = InkTheme.paperText;
        label.useSystemFont = true;
        this.node.addChild(labelNode);
        this.node.on(Node.EventType.TOUCH_END, this.onTap, this);
        return this;
    }

    private onTap(): void {
        this.turns.advance();
        this.bus.emit('turn-advanced', {
            year: this.turns.year,
            season: this.turns.getSeason(),
            turn: this.turns.getTurnNumber()
        });
    }
}

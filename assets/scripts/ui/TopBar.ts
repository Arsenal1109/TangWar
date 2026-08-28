import { _decorator, Component, Node, Label, Color, UITransform, Graphics } from 'cc';
import { TurnManager } from '../core/TurnManager';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../Bootstrap';
import { InkTheme } from './InkTheme';

const { ccclass } = _decorator;

@ccclass('TopBar')
export class TopBar extends Component {
    private turns!: TurnManager;
    private bus!: EventBus<GameEvents>;
    private eraLabel!: Label;

    init(turns: TurnManager, bus: EventBus<GameEvents>): this {
        this.turns = turns;
        this.bus = bus;
        this.build();
        return this;
    }

    private build(): void {
        const bar = this.node.addComponent(UITransform);
        bar.setContentSize(750, 120);
        this.node.setPosition(0, 667 - 60, 1);

        // 墨色横幅：墨底 + 上下金线
        this.makeBanner();
    }

    /** 墨色横幅：深墨底 + 上下金线（Graphics 绘制，后续可换贴图） */
    private makeBanner(): void {
        const g = this.node.addComponent(Graphics);
        // 墨底
        g.fillColor = InkTheme.ink;
        g.rect(-375, -60, 750, 120);
        g.fill();
        // 上下金线
        g.fillColor = InkTheme.gold;
        g.rect(-375, 57, 750, 3);
        g.fill();
        g.rect(-375, -60, 750, 3);
        g.fill();

        // 年代
        this.eraLabel = this.makeLabel(
            `${TurnManager.eraName(this.turns.year)} · ${this.turns.getSeason()}`,
            32, InkTheme.goldText, 30, 40
        );
        this.node.addChild(this.eraLabel.node);

        // 势力
        const fac = this.makeLabel('大唐 · 李渊', 24, InkTheme.paperText, 30, -6);
        this.node.addChild(fac.node);

        // 回合按钮
        const btnNode = new Node('NextTurn');
        const btn = btnNode.addComponent(NextTurnButton);
        btn.init(this.turns, this.bus);
        btnNode.setPosition(360, -20, 1);
        this.node.addChild(btnNode);
    }

    private makeLabel(text: string, size: number, color: Color, x: number, y: number): Label {
        const n = new Node('label');
        n.addComponent(UITransform).setContentSize(400, 50);
        const l = n.addComponent(Label);
        l.string = text;
        l.fontSize = size;
        l.lineHeight = size + 8;
        l.color = color;
        l.useSystemFont = true;
        n.setPosition(x, y, 1);
        return l;
    }
}

@ccclass('NextTurnButton')
export class NextTurnButton extends Component {
    private turns!: TurnManager;
    private bus!: EventBus<GameEvents>;

    init(turns: TurnManager, bus: EventBus<GameEvents>): this {
        this.turns = turns;
        this.bus = bus;
        const rt = this.node.addComponent(UITransform);
        rt.setContentSize(160, 80);
        const label = this.node.addComponent(Label);
        label.string = '下回合';
        label.fontSize = 30;
        label.lineHeight = 38;
        label.color = InkTheme.paperText;
        label.useSystemFont = true;
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

import { _decorator, Component, Node, Label, Color, UITransform, Graphics } from 'cc';
import { TurnManager } from '../core/TurnManager';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../Bootstrap';
import { InkTheme } from './InkTheme';
import type { CityState } from '../core/ResourceSystem';

const { ccclass } = _decorator;

@ccclass('TopBar')
export class TopBar extends Component {
    private turns!: TurnManager;
    private bus!: EventBus<GameEvents>;
    private states: CityState[] = [];
    private eraLabel!: Label;
    private resourceLabel!: Label;

    init(turns: TurnManager, bus: EventBus<GameEvents>, states: CityState[]): this {
        this.turns = turns;
        this.bus = bus;
        this.states = states;
        this.build();
        this.bus.on('turn-advanced', (p) => {
            this.eraLabel.string = `${TurnManager.eraName(p.year)} · ${p.season}\n大唐 · 李渊`;
            this.refreshResources();
        });
        return this;
    }

    private build(): void {
        const bar = this.node.addComponent(UITransform);
        bar.setContentSize(750, 104);
        this.node.setPosition(0, 667 - 52, 4);

        // 墨色横幅：墨底 + 上下金线
        this.makeBanner();
    }

    /** 墨色横幅：深墨底 + 上下金线（Graphics 绘制，后续可换贴图） */
    private makeBanner(): void {
        const g = this.node.addComponent(Graphics);
        // 墨底
        g.fillColor = InkTheme.ink;
        g.rect(-375, -52, 750, 104);
        g.fill();
        // 上下金线
        g.fillColor = InkTheme.gold;
        g.rect(-375, -52, 750, 4);
        g.fill();

        // 年代与势力：对应设计稿左侧双行状态。
        this.eraLabel = this.makeLabel(
            `${TurnManager.eraName(this.turns.year)} · ${this.turns.getSeason()}\n大唐 · 李渊`,
            23, InkTheme.goldText, -248, 2, 240
        );
        this.node.addChild(this.eraLabel.node);

        this.resourceLabel = this.makeLabel('', 21, InkTheme.goldText, 150, -1, 430);
        this.node.addChild(this.resourceLabel.node);
        this.refreshResources();
    }

    private refreshResources(): void {
        const own = this.states.filter((c) => c.faction === 'tang');
        const gold = own.reduce((s, c) => s + c.gold, 0);
        const food = own.reduce((s, c) => s + c.food, 0);
        const army = own.reduce((s, c) => s + c.army, 0);
        const morale = own.length ? Math.round(own.reduce((s, c) => s + c.morale, 0) / own.length) : 0;
        this.resourceLabel.string = `金 ${this.compact(gold)}   粮 ${this.compact(food)}   兵 ${this.compact(army)}   民 ${morale}`;
    }

    private compact(value: number): string {
        return value >= 10000 ? `${(value / 10000).toFixed(1)}万` : value.toLocaleString();
    }

    private makeLabel(text: string, size: number, color: Color, x: number, y: number, width: number): Label {
        const n = new Node('label');
        n.addComponent(UITransform).setContentSize(width, 82);
        const l = n.addComponent(Label);
        l.string = text;
        l.fontSize = size;
        l.lineHeight = size + 6;
        l.color = color;
        l.useSystemFont = true;
        n.setPosition(x, y, 1);
        return l;
    }
}

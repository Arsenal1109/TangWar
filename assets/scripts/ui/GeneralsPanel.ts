import { _decorator, Component, Node, Label, Color, UITransform } from 'cc';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../Bootstrap';
import { createGeneralStates, assignGeneral, type GeneralState } from '../core/GeneralSystem';
import { findCity } from '../core/CityRegistry';
import type { CityState } from '../core/ResourceSystem';
import { InkTheme } from './InkTheme';

const { ccclass } = _decorator;

@ccclass('GeneralsPanel')
export class GeneralsPanel extends Component {
    private bus!: EventBus<GameEvents>;
    private generals: GeneralState[] = [];
    private states: CityState[] = [];
    private selectedId = 'taiyuan';
    private listRoot!: Node;
    private titleLabel!: Label;

    init(bus: EventBus<GameEvents>, states: CityState[]): this {
        this.bus = bus;
        this.states = states;
        this.generals = createGeneralStates();
        this.build();
        bus.on('city-selected', (p) => {
            this.selectedId = p.cityId;
            this.refresh();
        });
        return this;
    }

    private build(): void {
        this.node.addComponent(UITransform).setContentSize(700, 420);
        this.node.setPosition(0, -667 + 260, 2);
        this.titleLabel = this.makeLabel('将领', 38, InkTheme.darkText, 0, 170);
        this.listRoot = new Node('general-list');
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
        this.titleLabel.string = `将领 · 当前城 ${city ? city.name : ''}`;
        this.listRoot.removeAllChildren();
        this.generals.forEach((g, i) => {
            const s = g.stats;
            const row = new Node(g.name);
            row.addComponent(UITransform).setContentSize(650, 54);
            row.setPosition(0, 110 - i * 60, 1);
            const label = row.addComponent(Label);
            label.string = `${g.name}（${g.title}）统${s.command}/政${s.politics}/谋${s.strategy}/勇${s.valor}/威${s.prestige} 忠${g.loyalty} ${g.assignment ? `· 已任${g.assignment.role === 'governor' ? '守将' : '统军'}@${g.assignment.cityId}` : ''}`;
            label.fontSize = 20;
            label.lineHeight = 26;
            label.color = InkTheme.darkText;
            label.useSystemFont = true;
            label.overflow = 3;
            row.on(Node.EventType.TOUCH_END, () => {
                if (!city) {
                    return;
                }
                const r = assignGeneral(g, city.id, 'governor');
                console.log(`[将领] 任命 ${g.name} 为 ${city.name} 守将：${r.ok ? '成功' : r.reason}`);
                this.refresh();
            });
            this.listRoot.addChild(row);
        });
    }
}

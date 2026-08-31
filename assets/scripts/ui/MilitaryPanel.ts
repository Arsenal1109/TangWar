import { _decorator, Component, Node, Label, Color, UITransform, Graphics } from 'cc';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../Bootstrap';
import type { CityState } from '../core/ResourceSystem';
import { TROOP_ORDER, TROOPS } from '../data/Troops';
import { recruit } from '../core/Military';
import { findCity } from '../core/CityRegistry';
import { InkTheme } from './InkTheme';
import { prepareBottomSheet } from './PanelChrome';

const { ccclass } = _decorator;

@ccclass('MilitaryPanel')
export class MilitaryPanel extends Component {
    private bus!: EventBus<GameEvents>;
    private states: CityState[] = [];
    private selectedId = 'taiyuan';
    private titleLabel!: Label;
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
        prepareBottomSheet(this.node, 650, '军事动向 · 点触兵种募兵', () => this.bus.emit('panel-close', {}));
        this.titleLabel = this.makeLabel('军事 · 募兵', 34, InkTheme.darkText, 0, 210);
        this.feedbackLabel = this.makeLabel('', 22, InkTheme.cinnabar, 0, -250);
        this.listRoot = new Node('recruit-list');
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
        this.titleLabel.string = `${city.name} · 军事 · 金 ${city.gold} · 兵 ${city.army}`;
        this.listRoot.removeAllChildren();
        TROOP_ORDER.forEach((t, i) => {
            const def = TROOPS[t];
            const row = new Node(def.name);
            row.addComponent(UITransform).setContentSize(650, 52);
            row.setPosition(0, 125 - i * 60, 1);
            const label = row.addComponent(Label);
            label.string = `${def.name}（攻${def.atk}/防${def.def}/速${def.speed}）耗金${def.cost}/千 · 现有 ${city.troops[t]}`;
            label.fontSize = 21;
            label.lineHeight = 27;
            label.color = InkTheme.darkText;
            label.useSystemFont = true;
            label.overflow = 3; // OVERFLOW_SHRINK
            row.on(Node.EventType.TOUCH_END, () => {
                const r = recruit(city, t, 1);
                this.feedbackLabel.color = r.ok ? InkTheme.ink : InkTheme.cinnabar;
                this.feedbackLabel.string = r.ok ? `募${def.name}1千：成功` : `募${def.name}：${r.reason}`;
                this.refresh();
            });
            this.listRoot.addChild(row);
        });
    }
}

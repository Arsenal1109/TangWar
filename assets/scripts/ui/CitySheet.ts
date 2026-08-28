import { _decorator, Component, Node, Label, Color, UITransform } from 'cc';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../Bootstrap';
import type { CityState } from '../core/ResourceSystem';
import { findCity } from '../core/CityRegistry';
import { getFaction } from '../data/Factions';
import { InkTheme } from './InkTheme';

const { ccclass } = _decorator;

@ccclass('CitySheet')
export class CitySheet extends Component {
    private bus!: EventBus<GameEvents>;
    private states: CityState[] = [];
    private titleLabel!: Label;
    private infoLabel!: Label;
    private rootNode!: Node;

    init(bus: EventBus<GameEvents>, states: CityState[]): this {
        this.bus = bus;
        this.states = states;
        this.build();
        bus.on('city-selected', (p) => this.showCity(p.cityId));
        return this;
    }

    private build(): void {
        const rt = this.node.addComponent(UITransform);
        rt.setContentSize(700, 300);
        this.node.setPosition(0, -667 + 170, 2);

        this.rootNode = new Node('sheet');
        this.rootNode.addComponent(UITransform).setContentSize(700, 300);
        this.node.addChild(this.rootNode);

        this.titleLabel = this.addLabel('', 36, InkTheme.darkText, 0, 90);
        this.infoLabel = this.addLabel('', 26, InkTheme.labelText, 0, 20);
        this.hide();
    }

    private addLabel(text: string, size: number, color: Color, x: number, y: number): Label {
        const n = new Node('label');
        n.addComponent(UITransform).setContentSize(600, 40);
        const l = n.addComponent(Label);
        l.string = text;
        l.fontSize = size;
        l.lineHeight = size + 6;
        l.color = color;
        l.useSystemFont = true;
        n.setPosition(x, y, 1);
        this.rootNode.addChild(n);
        return l;
    }

    private showCity(cityId: string): void {
        const c = findCity(this.states, cityId);
        if (!c) {
            return;
        }
        const f = getFaction(c.faction);
        const foodYield = Math.floor(c.population * 10 * (1 + 0.2 * c.facilities.farm));
        const goldYield = Math.floor(c.population * 4 * (1 + 0.2 * c.facilities.market));
        this.titleLabel.string = `${c.name} · ${f.name}`;
        this.infoLabel.string =
            `人口 ${c.population} 万 · 兵力 ${c.army}\n民心 ${c.morale} · 城防 ${c.defense} · 金 ${c.gold} · 粮 ${c.food}\n每季产粮 ${foodYield} · 产金 ${goldYield}${c.generalId ? `\n守将 ${c.generalId}` : ''}`;
        this.show();
    }

    private show(): void {
        this.rootNode.active = true;
    }

    private hide(): void {
        this.rootNode.active = false;
    }
}

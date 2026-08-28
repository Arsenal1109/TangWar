import { _decorator, Component, Node, Label, Color, UITransform } from 'cc';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../Bootstrap';
import type { CityDef } from '../core/Types';
import { getFaction } from '../data/Factions';
import { InkTheme } from './InkTheme';

const { ccclass } = _decorator;

@ccclass('CitySheet')
export class CitySheet extends Component {
    private bus!: EventBus<GameEvents>;
    private cities: CityDef[] = [];
    private titleLabel!: Label;
    private infoLabel!: Label;
    private rootNode!: Node;

    init(bus: EventBus<GameEvents>, cities: CityDef[]): this {
        this.bus = bus;
        this.cities = cities;
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
        const c = this.cities.find((item) => item.id === cityId);
        if (!c) {
            return;
        }
        const f = getFaction(c.faction);
        this.titleLabel.string = c.name;
        this.infoLabel.string =
            `${f.name}\n人口 — · 兵力 — · 守将 —\n民心 — · 城防 —（M2 起填充数值）`;
        this.show();
    }

    private show(): void {
        this.rootNode.active = true;
    }

    private hide(): void {
        this.rootNode.active = false;
    }
}

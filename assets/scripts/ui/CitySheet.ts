import { _decorator, Component, Node, Label, Color, UITransform, Graphics } from 'cc';
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
    private moraleBar!: Graphics;

    init(bus: EventBus<GameEvents>, states: CityState[]): this {
        this.bus = bus;
        this.states = states;
        this.build();
        bus.on('city-selected', (p) => this.showCity(p.cityId));
        bus.on('panel-nav', () => this.hide());
        return this;
    }

    private build(): void {
        this.node.addComponent(UITransform).setContentSize(700, 300);
        this.node.setPosition(0, -377, 3);

        this.rootNode = new Node('sheet');
        this.rootNode.addComponent(UITransform).setContentSize(700, 300);
        const bg = this.rootNode.addComponent(Graphics);
        bg.fillColor = new Color(253, 248, 232, 250);
        bg.roundRect(-350, -150, 700, 300, 24);
        bg.fill();
        bg.strokeColor = new Color(179, 154, 98, 255);
        bg.lineWidth = 2;
        bg.roundRect(-350, -150, 700, 300, 24);
        bg.stroke();
        this.node.addChild(this.rootNode);

        const handle = new Node('Handle');
        handle.addComponent(UITransform).setContentSize(84, 8);
        const hg = handle.addComponent(Graphics);
        hg.fillColor = new Color(201, 184, 119, 255);
        hg.roundRect(-42, -4, 84, 8, 4);
        hg.fill();
        handle.setPosition(0, 132, 1);
        this.rootNode.addChild(handle);

        this.titleLabel = this.addLabel('', 34, InkTheme.darkText, 0, 91, 640, 54);
        this.infoLabel = this.addLabel('', 21, InkTheme.labelText, 0, 14, 640, 116);
        const bar = new Node('MoraleBar');
        bar.addComponent(UITransform).setContentSize(610, 12);
        const barBg = bar.addComponent(Graphics);
        barBg.fillColor = new Color(216, 200, 160, 255);
        barBg.roundRect(-305, -6, 610, 12, 6);
        barBg.fill();
        const fill = new Node('MoraleFill');
        fill.addComponent(UITransform).setContentSize(600, 8);
        this.moraleBar = fill.addComponent(Graphics);
        bar.addChild(fill);
        bar.setPosition(0, -59, 2);
        this.rootNode.addChild(bar);
        this.addButton('内政', -220, -105, false, () => this.bus.emit('panel-nav', { key: 'gov' }));
        this.addButton('出征', 0, -105, true, () => this.bus.emit('panel-nav', { key: 'mil' }));
        this.addButton('关闭', 220, -105, false, () => this.hide());
        this.hide();
    }

    private addLabel(text: string, size: number, color: Color, x: number, y: number, width: number, height: number): Label {
        const n = new Node('label');
        n.addComponent(UITransform).setContentSize(width, height);
        const l = n.addComponent(Label);
        l.string = text;
        l.fontSize = size;
        l.lineHeight = size + 7;
        l.color = color;
        l.useSystemFont = true;
        n.setPosition(x, y, 1);
        this.rootNode.addChild(n);
        return l;
    }

    private addButton(text: string, x: number, y: number, primary: boolean, action: () => void): void {
        const n = new Node(text);
        n.addComponent(UITransform).setContentSize(190, 58);
        const bgNode = new Node('ButtonBg');
        bgNode.addComponent(UITransform).setContentSize(190, 58);
        const g = bgNode.addComponent(Graphics);
        g.fillColor = primary ? InkTheme.cinnabar : new Color(230, 211, 158, 255);
        g.roundRect(-95, -29, 190, 58, 10);
        g.fill();
        g.strokeColor = primary ? InkTheme.cinnabarDark : new Color(179, 154, 98, 255);
        g.lineWidth = 2;
        g.roundRect(-95, -29, 190, 58, 10);
        g.stroke();
        n.addChild(bgNode);
        const labelNode = new Node('ButtonLabel');
        labelNode.addComponent(UITransform).setContentSize(180, 50);
        const l = labelNode.addComponent(Label);
        l.string = text;
        l.fontSize = 24;
        l.lineHeight = 30;
        l.color = primary ? InkTheme.paperText : InkTheme.darkText;
        l.useSystemFont = true;
        labelNode.setPosition(0, 0, 3);
        n.addChild(labelNode);
        n.setPosition(x, y, 2);
        n.on(Node.EventType.TOUCH_END, action);
        this.rootNode.addChild(n);
    }

    private showCity(cityId: string): void {
        const c = findCity(this.states, cityId);
        if (!c) return;
        const f = getFaction(c.faction);
        const foodYield = Math.floor(c.population * 10 * (1 + 0.2 * c.facilities.farm));
        const goldYield = Math.floor(c.population * 4 * (1 + 0.2 * c.facilities.market));
        this.titleLabel.string = `${c.name}   ${f.name}`;
        this.infoLabel.string =
            `人口 ${c.population}万        兵力 ${this.compact(c.army)}        守将 ${c.generalId ?? '暂无'}\n` +
            `民心 ${c.morale}             粮草 ${this.compact(c.food)}        商业 ${c.facilities.market > 1 ? '盛' : c.facilities.market ? '中' : '初'}\n` +
            `每季产粮 ${foodYield} · 产金 ${goldYield} · 城防 ${c.defense}`;
        this.moraleBar.clear();
        this.moraleBar.fillColor = new Color(92, 138, 74, 255);
        this.moraleBar.roundRect(-300, -4, 600 * Math.max(0, Math.min(100, c.morale)) / 100, 8, 4);
        this.moraleBar.fill();
        this.show();
    }

    private compact(value: number): string {
        return value >= 10000 ? `${(value / 10000).toFixed(1)}万` : value.toLocaleString();
    }

    private show(): void { this.rootNode.active = true; }
    private hide(): void { this.rootNode.active = false; }
}

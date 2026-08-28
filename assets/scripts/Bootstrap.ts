import { _decorator, Component, Node, view, ResolutionPolicy } from 'cc';
import { TurnManager } from './core/TurnManager';
import { EventBus } from './core/EventBus';
import { MapRenderer } from './map/MapRenderer';
import { MapCamera } from './map/MapCamera';
import { TopBar } from './ui/TopBar';
import { BottomNav } from './ui/BottomNav';
import { CitySheet } from './ui/CitySheet';
import { CITIES } from './data/Cities';

const { ccclass } = _decorator;

// 全局事件类型
export interface GameEvents {
    'turn-advanced': { year: number; season: string; turn: number };
    'city-selected': { cityId: string };
}

@ccclass('Bootstrap')
export class Bootstrap extends Component {
    private bus = new EventBus<GameEvents>();
    private turns = new TurnManager(617, 2);

    onLoad(): void {
        view.setDesignResolutionSize(750, 1334, ResolutionPolicy.SHOW_ALL);
        this.buildUi();
    }

    private buildUi(): void {
        // 舆图（渲染 + 交互）
        const map = new Node('Map');
        this.node.addChild(map);
        map.addComponent(MapRenderer).init(this.bus, CITIES);
        map.addComponent(MapCamera).init(this.bus, CITIES);

        // 顶部状态栏
        const top = new Node('TopBar');
        this.node.addChild(top);
        top.addComponent(TopBar).init(this.turns, this.bus);

        // 底部导航
        const nav = new Node('BottomNav');
        this.node.addChild(nav);
        nav.addComponent(BottomNav).init(this.bus);

        // 城池底部卡片
        const sheet = new Node('CitySheet');
        this.node.addChild(sheet);
        sheet.addComponent(CitySheet).init(this.bus, CITIES);

        // 回合推进日志
        this.bus.on('turn-advanced', (p) => {
            console.log(`[回合] ${p.year} ${p.season} 第 ${p.turn} 回合`);
        });
    }
}

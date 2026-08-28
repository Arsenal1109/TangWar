import { _decorator, Component, Node, Vec2, EventTouch, input, Input } from 'cc';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../Bootstrap';
import type { CityDef } from '../core/Types';

const { ccclass } = _decorator;

@ccclass('MapCamera')
export class MapCamera extends Component {
    private cities: CityDef[] = [];
    private bus!: EventBus<GameEvents>;
    private moving = false;
    private last = new Vec2();

    init(bus: EventBus<GameEvents>, cities: CityDef[]): this {
        this.bus = bus;
        this.cities = cities;
        this.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
        this.node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
        input.on(Input.EventType.MOUSE_WHEEL, this.onWheel, this);
        return this;
    }

    private onTouchStart(e: EventTouch): void {
        this.moving = true;
        this.last.set(e.getUILocation().x, e.getUILocation().y);
    }

    private onTouchMove(e: EventTouch): void {
        if (!this.moving) {
            return;
        }
        const cur = e.getUILocation();
        const dx = cur.x - this.last.x;
        const dy = cur.y - this.last.y;
        const pos = this.node.position;
        this.node.setPosition(pos.x + dx, pos.y + dy, pos.z);
        this.last.set(cur.x, cur.y);
    }

    private onTouchEnd(e: EventTouch): void {
        this.moving = false;
        // 点选城池：将 UI 坐标映射到 viewBox 坐标（设计分辨率中心 = 画布中心）
        const ui = e.getUILocation();
        const pos = this.node.position;
        const scale = this.node.scale.x;
        const relX = (ui.x - pos.x - 375) / (640 * scale);
        const relY = (ui.y - pos.y - 667) / (560 * scale);
        const wx = 320 + relX * 640;
        const wy = 280 + relY * 560;
        let best: CityDef | null = null;
        let bestDist = 40; // viewBox 内点选半径
        for (const c of this.cities) {
            const d = Math.hypot(c.x - wx, c.y - wy);
            if (d < bestDist) {
                bestDist = d;
                best = c;
            }
        }
        if (best) {
            this.bus.emit('city-selected', { cityId: best.id });
        }
    }

    private onWheel(e: { getScrollY: () => number }): void {
        const delta = e.getScrollY() > 0 ? 1.1 : 0.9;
        const s = this.node.scale.x * delta;
        if (s >= 0.6 && s <= 2.4) {
            this.node.setScale(s, s, 1);
        }
    }
}

import { _decorator, Component, Node, Vec2, EventTouch, input, Input, view } from 'cc';
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
    private moved = 0;

    init(bus: EventBus<GameEvents>, cities: CityDef[]): this {
        this.bus = bus;
        this.cities = cities;
        // MapRenderer 的可见内容位于两个子 UITransform 上；直接监听它们，
        // 避免透明父节点在原生/浏览器命中测试中收不到触摸事件。
        for (const target of this.node.children) {
            target.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
            target.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
            target.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
        }
        input.on(Input.EventType.MOUSE_WHEEL, this.onWheel, this);
        return this;
    }

    private onTouchStart(e: EventTouch): void {
        this.moving = true;
        this.moved = 0;
        this.last.set(e.getUILocation().x, e.getUILocation().y);
    }

    private onTouchMove(e: EventTouch): void {
        if (!this.moving) {
            return;
        }
        const cur = e.getUILocation();
        const dx = cur.x - this.last.x;
        const dy = cur.y - this.last.y;
        this.moved += Math.abs(dx) + Math.abs(dy);
        const pos = this.node.position;
        this.node.setPosition(pos.x + dx, pos.y + dy, pos.z);
        this.last.set(cur.x, cur.y);
    }

    private onTouchEnd(e: EventTouch): void {
        this.moving = false;
        if (this.moved > 18) {
            return;
        }
        // 将屏幕触点转换到缩放/平移后的地图本地坐标，再还原为设计稿 viewBox。
        const ui = e.getUILocation();
        const visible = view.getVisibleSize();
        const pos = this.node.position;
        const scale = this.node.scale.x;
        const localX = (ui.x - visible.width / 2 - pos.x) / scale;
        const localY = (ui.y - visible.height / 2 - pos.y) / scale;
        const wx = 320 + localX / 2;
        const wy = 280 - localY / 2;
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

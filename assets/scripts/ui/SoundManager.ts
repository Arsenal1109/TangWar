import { _decorator, Component } from 'cc';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../Bootstrap';

const { ccclass } = _decorator;

// 音效占位：无资源时仅打日志，可切换静音；后续替换为 AudioSource 播放
@ccclass('SoundManager')
export class SoundManager extends Component {
    private enabled = true;

    init(bus: EventBus<GameEvents>): this {
        bus.on('turn-advanced', () => this.play('回合推进'));
        bus.on('city-selected', () => this.play('点选城池'));
        return this;
    }

    toggle(): boolean {
        this.enabled = !this.enabled;
        return this.enabled;
    }

    private play(name: string): void {
        if (!this.enabled) {
            return;
        }
        // 占位：M6 打磨期替换为 AudioSource 播放命名音效
        console.log(`[音效] ${name}`);
    }
}
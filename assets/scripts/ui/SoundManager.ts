import { _decorator, Component, resources, AudioClip, AudioSource } from 'cc';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../Bootstrap';

const { ccclass } = _decorator;

// 事件 -> 资源路径（置于 assets/resources/sounds 下），缺失时优雅降级为日志
const SFX_MAP: Record<string, string> = {
    'turn-advanced': 'sounds/turn',
    'city-selected': 'sounds/select'
};

// 音效管理：加载命名音频并缓存到 AudioSource 播放；无资源/静音时打日志降级
@ccclass('SoundManager')
export class SoundManager extends Component {
    private enabled = true;
    private source: AudioSource | null = null;
    private clips = new Map<string, AudioClip | null>();

    init(bus: EventBus<GameEvents>): this {
        this.source = this.node.addComponent(AudioSource);
        bus.on('turn-advanced', () => this.play('turn-advanced'));
        bus.on('city-selected', () => this.play('city-selected'));
        return this;
    }

    toggle(): boolean {
        this.enabled = !this.enabled;
        return this.enabled;
    }

    private play(key: string): void {
        if (!this.enabled) {
            return;
        }
        const path = SFX_MAP[key];
        if (!path) {
            return;
        }
        const clip = this.clips.get(key);
        if (clip !== undefined) {
            this.playClip(clip, path);
            return;
        }
        // 首次访问：异步加载，缺失（无美术资源）时缓存 null 并降级日志
        resources.load(path, AudioClip, (err, c) => {
            if (err) {
                this.clips.set(key, null);
                console.log(`[音效] ${key}（无资源，已降级）`);
                return;
            }
            this.clips.set(key, c);
            this.playClip(c, path);
        });
    }

    private playClip(clip: AudioClip | null, path: string): void {
        if (!this.source || !clip) {
            console.log(`[音效] ${path.split('/').pop()}`);
            return;
        }
        // 逐音效独立播放，不打断当前；未被 use 时优雅降级
        this.source.playOneShot(clip);
    }
}
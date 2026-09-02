import { _decorator, AudioClip, AudioSource, Component, input, Input, resources } from 'cc';
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
    private sfxEnabled = true;
    private musicEnabled = true;
    private sfxSource: AudioSource | null = null;
    private bgmSource: AudioSource | null = null;
    private bgmReady = false;
    private gestureReceived = false;
    private clips = new Map<string, AudioClip | null>();

    init(bus: EventBus<GameEvents>): this {
        this.sfxSource = this.node.addComponent(AudioSource);
        this.bgmSource = this.node.addComponent(AudioSource);
        this.bgmSource.loop = true;
        this.bgmSource.volume = 0.32;
        bus.on('turn-advanced', () => this.play('turn-advanced'));
        bus.on('city-selected', () => this.play('city-selected'));
        bus.on('sfx', ({ name }) => this.playPath(`sounds/${name}`));
        bus.on('audio-setting', ({ music }) => this.setMusicEnabled(music));
        input.once(Input.EventType.TOUCH_START, this.unlockAudio, this);
        input.once(Input.EventType.MOUSE_DOWN, this.unlockAudio, this);
        this.loadBgm();
        return this;
    }

    toggle(): boolean {
        this.sfxEnabled = !this.sfxEnabled;
        return this.sfxEnabled;
    }

    private unlockAudio(): void {
        this.gestureReceived = true;
        this.tryStartBgm();
    }

    private loadBgm(): void {
        resources.load('audio/bgm-council', AudioClip, (err, clip) => {
            if (err || !this.bgmSource) {
                console.warn('[音乐] 军帐背景音乐加载失败', err);
                return;
            }
            this.bgmSource.clip = clip;
            this.bgmReady = true;
            this.tryStartBgm();
        });
    }

    private setMusicEnabled(enabled: boolean): void {
        this.musicEnabled = enabled;
        if (!this.bgmSource) return;
        if (!enabled) {
            this.bgmSource.stop();
            return;
        }
        this.tryStartBgm();
    }

    private tryStartBgm(): void {
        if (!this.musicEnabled || !this.bgmReady || !this.gestureReceived || !this.bgmSource || this.bgmSource.playing) return;
        this.bgmSource.play();
    }

    private play(key: string): void {
        if (!this.sfxEnabled) {
            return;
        }
        const path = SFX_MAP[key];
        if (!path) {
            return;
        }
        this.playPath(path);
    }

    /** 通用音效通道：按资源路径播放（如 sounds/battle），缺失时缓存并降级日志。 */
    private playPath(path: string): void {
        if (!this.sfxEnabled) {
            return;
        }
        const clip = this.clips.get(path);
        if (clip !== undefined) {
            this.playClip(clip, path);
            return;
        }
        // 首次访问：异步加载，缺失（无音频资源）时缓存 null 并降级日志
        resources.load(path, AudioClip, (err, c) => {
            if (err) {
                this.clips.set(path, null);
                console.log(`[音效] ${path}（无资源，已降级）`);
                return;
            }
            this.clips.set(path, c);
            this.playClip(c, path);
        });
    }

    private playClip(clip: AudioClip | null, path: string): void {
        if (!this.sfxSource || !clip) {
            console.log(`[音效] ${path.split('/').pop()}`);
            return;
        }
        // 逐音效独立播放，不打断当前；未被 use 时优雅降级
        this.sfxSource.playOneShot(clip);
    }
}

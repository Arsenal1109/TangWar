import { _decorator, Component, Node, Camera, Canvas, Color, Layers, view, ResolutionPolicy, Label, UITransform, Graphics } from 'cc';
import { TurnManager } from './core/TurnManager';
import { EventBus } from './core/EventBus';
import { SaveManager } from './ui/SaveManager';
import { SoundManager } from './ui/SoundManager';
import { WarCouncilScreen } from './ui/WarCouncilScreen';
import { createCityStates, resetTurnFlags } from './core/CityRegistry';
import { createWorld, type WorldState } from './core/WorldState';
import { runWorldTurn } from './core/TurnFlow';
import { createGeneralStates } from './core/GeneralSystem';
import { createDiplomacyState } from './core/Diplomacy';
import { applyDifficultyStart } from './core/Difficulty';
import type { CityState } from './core/ResourceSystem';

const { ccclass } = _decorator;

// 全局事件类型
export interface GameEvents {
    'turn-advanced': { year: number; season: string; turn: number };
    'city-selected': { cityId: string };
    'world-events': { title: string; messages: string[] };
    'save-requested': Record<string, never>;
    'audio-setting': { music: boolean };
    /** 结局触发（胜负判定成立时发出一次） */
    'game-ended': { grade: string; message: string };
    /** 通用音效通道：SoundManager 按需播放（sounds/* 资源缺失时优雅降级） */
    'sfx': { name: 'turn' | 'select' | 'march' | 'battle' | 'report' | 'alert' | 'scheme' | 'diplomacy' };
    /** 新局难度选定（首启无档时由难度弹窗发出；此后存档承载） */
    'difficulty-chosen': { difficulty: 'easy' | 'normal' | 'hard' };
}

@ccclass('Bootstrap')
export class Bootstrap extends Component {
    private bus = new EventBus<GameEvents>();
    private turns = new TurnManager(617, 2);
    private cityStates: CityState[] = [];
    private world!: WorldState;
    private saveMgr!: SaveManager;
    /** 2D 渲染根（Canvas）：所有 UI 节点必须挂在其子树下才会被渲染 */
    private uiRoot!: Node;

    onLoad(): void {
        try {
            // 横屏以高度为基准适配：390 设计高在 16:9 到 2.4:1 设备上保持触控尺寸稳定，
            // 额外宽度交给全域战图自然延展。
            view.setDesignResolutionSize(844, 390, ResolutionPolicy.FIXED_HEIGHT);
            this.cityStates = createCityStates();
            // 将领运行态（含敌方群雄）与唐室外交关系进入世界态，随存档持久化
            this.world = createWorld(this.turns.year, this.cityStates, createGeneralStates(), createDiplomacyState());

            // UI 创建前恢复存档，确保首屏年代、季节和资源与存档一致。
            this.saveMgr = this.node.addComponent(SaveManager);
            if (this.saveMgr.hasSave()) {
                this.saveMgr.load(this.world);
                this.turns.year = this.world.year;
                this.turns.seasonIndex = this.world.seasonIndex;
                this.turns.turn = this.world.turn;
            }
            // 新局（无档）难度由 UI 弹窗选定后经 difficulty-chosen 应用并建档；缺省标准。

            this.uiRoot = this.ensureUiCanvas();
            this.buildUi();
        } catch (e) {
            console.error('[Bootstrap] onLoad FAILED:', e);
            // 设备上看不到控制台，直接把异常画到屏幕上
            const fallbackRoot = this.uiRoot ?? this.node.getChildByName('UICanvas');
            if (fallbackRoot) {
                this.uiRoot = fallbackRoot;
                this.showFatalOnScreen(String(e));
            }
        }
    }

    /**
     * 将致命异常以红字全屏显示（半透明黑底），便于无日志环境（真机 APK）排查。
     */
    private showFatalOnScreen(msg: string): void {
        try {
            const bg = new Node('FatalBg');
            bg.layer = Layers.Enum.UI_2D;
            const visible = view.getVisibleSize();
            bg.addComponent(UITransform).setContentSize(visible.width, visible.height);
            const g = bg.addComponent(Graphics);
            g.fillColor = new Color(0, 0, 0, 210);
            g.rect(-visible.width / 2, -visible.height / 2, visible.width, visible.height);
            g.fill();
            this.uiRoot.addChild(bg);

            const n = new Node('FatalText');
            n.layer = Layers.Enum.UI_2D;
            const ut = n.addComponent(UITransform);
            ut.setContentSize(Math.max(320, visible.width - 80), Math.max(220, visible.height - 60));
            const lb = n.addComponent(Label);
            lb.string = `BOOT FAILED\n\n${msg}`;
            lb.fontSize = 30;
            lb.lineHeight = 40;
            lb.overflow = 3; // SHRINK，避免依赖运行时不存在的 LabelOverflow 导出
            lb.color = new Color(255, 60, 60, 255);
            n.setPosition(0, 0, 0);
            bg.addChild(n);
        } catch (e2) {
            console.error('[Bootstrap] showFatalOnScreen failed', e2);
        }
    }

    /**
     * 场景默认相机是 3D 透视相机，且场景中没有 Canvas/RenderRoot2D，
     * Label/Graphics 等 2D 组件没有渲染根时不会绘制任何内容（这正是黑屏的原因）。
     * 此处停用默认 3D 相机，动态创建带 Canvas 的 2D 渲染根与正交 UI 相机。
     * @returns UI 根节点，所有 UI 应挂载到其子树下
     */
    private ensureUiCanvas(): Node {
        // 场景根下默认 3D 主相机（节点名为 "Main Camera"）停用，避免其透视投影干扰 UI
        const scene = this.node.scene;
        const mainCam = scene ? scene.getChildByName('Main Camera') : null;
        if (mainCam) {
            mainCam.active = false;
        }

        // 若已有 UI 根节点则直接复用，避免重复创建
        const exist = this.node.getChildByName('UICanvas');
        if (exist) {
            return exist;
        }

        // 创建 2D 渲染根（Canvas 继承 RenderRoot2D，2D 组件只有挂在其子树下才会渲染）
        const canvasNode = new Node('UICanvas');
        canvasNode.layer = Layers.Enum.UI_2D;
        const visible = view.getVisibleSize();
        canvasNode.addComponent(UITransform).setContentSize(visible.width, visible.height);
        const canvas = canvasNode.addComponent(Canvas);

        // 创建 2D 正交相机，作为 Canvas 的渲染相机
        const camNode = new Node('UICamera');
        camNode.layer = Layers.Enum.UI_2D;
        camNode.setPosition(0, 0, 1000);
        const cam = camNode.addComponent(Camera);
        cam.projection = Camera.ProjectionType.ORTHO;
        cam.orthoHeight = visible.height / 2;
        cam.near = 1;
        cam.far = 2000;
        cam.clearFlags = Camera.ClearFlag.SOLID_COLOR;
        cam.clearColor = new Color(51, 41, 27, 255); // 墨色底，明显区别于黑屏
        // 同时渲染 UI_2D 与 DEFAULT 层：动态创建的 UI 节点可能仍在 DEFAULT 层
        cam.visibility = Layers.Enum.UI_2D | Layers.Enum.DEFAULT;
        cam.priority = 0;
        canvasNode.addChild(camNode);

        canvas.cameraComponent = cam;
        // Cocos 3.8 的 alignCanvasWithScreen 是布尔属性，不是方法。
        // 调用它会在 onLoad 阶段抛出 TypeError，导致原生包启动后黑屏。
        canvas.alignCanvasWithScreen = true;

        this.node.addChild(canvasNode);
        return canvasNode;
    }

    private buildUi(): void {
        // 新版首屏把原本分散的地图、详情卡和五项导航收束成一个完整回合决策流。
        const screen = new Node('WarCouncilScreen');
        this.uiRoot.addChild(screen);
        screen.addComponent(WarCouncilScreen).init(this.turns, this.bus, this.cityStates, this.world, this.saveMgr);

        // 音效管理仍沿用原有事件总线，后续可直接替换真实音频资源。
        this.node.addComponent(SoundManager).init(this.bus);

        this.bus.on('save-requested', () => {
            this.world.year = this.turns.year;
            this.world.seasonIndex = this.turns.seasonIndex;
            this.world.turn = this.turns.getTurnNumber();
            this.saveMgr.save(this.world);
        });

        // 新局难度选定：补发初始资源调整（按标准建档后的一次性修正），随即建档固化
        this.bus.on('difficulty-chosen', ({ difficulty }) => {
            this.world.difficulty = difficulty;
            applyDifficultyStart(this.world, difficulty);
            this.saveMgr.save(this.world);
        });

        // 回合推进：同步运行态、结算行军/AI/资源/事件/结局，清空各城施政标记
        this.bus.on('turn-advanced', (p) => {
            this.world.year = this.turns.year;
            this.world.seasonIndex = this.turns.seasonIndex;
            this.world.turn = this.turns.getTurnNumber();
            const out = runWorldTurn(this.world);
            if (out.log.length || out.eventNames.length) {
                this.bus.emit('world-events', { title: `${this.turns.year} ${this.turns.getSeason()} 天下大事`, messages: out.log });
            }
            if (out.victory) {
                this.bus.emit('game-ended', { grade: out.victory.grade, message: out.victory.message });
            }
            resetTurnFlags(this.cityStates);
            this.saveMgr.save(this.world);
        });
    }

}

import { _decorator, Component, Node, Camera, Canvas, Color, Layers, view, ResolutionPolicy, Label, UITransform, Graphics } from 'cc';
import { TurnManager } from './core/TurnManager';
import { EventBus } from './core/EventBus';
import { MapRenderer } from './map/MapRenderer';
import { MapCamera } from './map/MapCamera';
import { TopBar } from './ui/TopBar';
import { BottomNav } from './ui/BottomNav';
import { CitySheet } from './ui/CitySheet';
import { GovernmentPanel } from './ui/GovernmentPanel';
import { MilitaryPanel } from './ui/MilitaryPanel';
import { GeneralsPanel } from './ui/GeneralsPanel';
import { DiplomacyPanel } from './ui/DiplomacyPanel';
import { StrategyPanel } from './ui/StrategyPanel';
import { EventsPanel } from './ui/EventsPanel';
import { SaveManager } from './ui/SaveManager';
import { SoundManager } from './ui/SoundManager';
import { WarCouncilScreen } from './ui/WarCouncilScreen';
import { CITIES } from './data/Cities';
import { createCityStates, resetTurnFlags } from './core/CityRegistry';
import { createWorld, type WorldState } from './core/WorldState';
import { runWorldTurn } from './core/TurnFlow';
import type { CityState } from './core/ResourceSystem';

const { ccclass } = _decorator;

// 全局事件类型
export interface GameEvents {
    'turn-advanced': { year: number; season: string; turn: number };
    'city-selected': { cityId: string };
    'world-events': { title: string; messages: string[] };
    'panel-nav': { key: string };
    'panel-close': Record<string, never>;
    'save-requested': Record<string, never>;
    'audio-setting': { music: boolean };
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
            console.log('[Bootstrap] onLoad START');
            // 横屏以高度为基准适配：390 设计高在 16:9 到 2.4:1 设备上保持触控尺寸稳定，
            // 额外宽度交给全域战图自然延展。
            view.setDesignResolutionSize(844, 390, ResolutionPolicy.FIXED_HEIGHT);
            this.cityStates = createCityStates();
            this.world = createWorld(this.turns.year, this.cityStates);

            // UI 创建前恢复存档，确保首屏年代、季节和资源与存档一致。
            this.saveMgr = this.node.addComponent(SaveManager);
            if (this.saveMgr.hasSave()) {
                this.saveMgr.load(this.world);
                this.turns.year = this.world.year;
                this.turns.seasonIndex = this.world.seasonIndex;
                this.turns.turn = this.world.turn;
            }

            this.uiRoot = this.ensureUiCanvas();
            this.buildUi();
            console.log('[Bootstrap] buildUi done');
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
        screen.addComponent(WarCouncilScreen).init(this.turns, this.bus, this.cityStates);

        // 音效管理仍沿用原有事件总线，后续可直接替换真实音频资源。
        this.node.addComponent(SoundManager).init(this.bus);

        this.bus.on('save-requested', () => {
            this.world.year = this.turns.year;
            this.world.seasonIndex = this.turns.seasonIndex;
            this.world.turn = this.turns.getTurnNumber();
            this.saveMgr.save(this.world);
        });

        // 回合推进：同步运行态、结算 AI/资源/事件/结局，清空各城施政标记
        this.bus.on('turn-advanced', (p) => {
            this.world.year = this.turns.year;
            this.world.seasonIndex = this.turns.seasonIndex;
            this.world.turn = this.turns.getTurnNumber();
            const out = runWorldTurn(this.world);
            if (out.log.length || out.eventNames.length) {
                this.bus.emit('world-events', { title: `${this.turns.year} ${this.turns.getSeason()} 天下大事`, messages: out.log });
            }
            if (out.victory) {
                console.log(`[结局] ${out.victory.grade}：${out.victory.message}`);
            }
            resetTurnFlags(this.cityStates);
            console.log(`[回合] ${p.year} ${p.season} 第 ${p.turn} 回合`);
            this.saveMgr.save(this.world);
        });
    }

    private buildBackdrop(): void {
        const visibleHeight = view.getVisibleSize().height;
        const backdrop = new Node('PaperBackdrop');
        backdrop.layer = Layers.Enum.UI_2D;
        backdrop.addComponent(UITransform).setContentSize(750, visibleHeight);
        const g = backdrop.addComponent(Graphics);
        g.fillColor = new Color(238, 224, 184, 255);
        g.rect(-375, -visibleHeight / 2, 750, visibleHeight);
        g.fill();
        g.strokeColor = new Color(140, 110, 60, 18);
        g.lineWidth = 1;
        for (let y = -visibleHeight / 2; y < visibleHeight / 2; y += 8) {
            g.moveTo(-375, y);
            g.lineTo(375, y);
        }
        for (let x = -370; x < 375; x += 10) {
            g.moveTo(x, -visibleHeight / 2);
            g.lineTo(x, visibleHeight / 2);
        }
        g.stroke();
        this.uiRoot.addChild(backdrop);
    }

    private buildMapChrome(): void {
        const visibleHeight = view.getVisibleSize().height;
        const halfH = visibleHeight / 2;
        const hud = new Node('MapChrome');
        hud.layer = Layers.Enum.UI_2D;
        // HUD 容器本身不占触控面积，避免全屏 UITransform 截获地图点触。
        hud.addComponent(UITransform).setContentSize(0, 0);
        hud.setPosition(0, 0, 2);
        this.uiRoot.addChild(hud);

        const title = new Node('MapTitle');
        title.addComponent(UITransform).setContentSize(330, 56);
        const titleLabel = title.addComponent(Label);
        titleLabel.string = '◆  天 下 舆 图';
        titleLabel.fontSize = 29;
        titleLabel.lineHeight = 38;
        titleLabel.color = new Color(74, 53, 22, 255);
        titleLabel.useSystemFont = true;
        title.setPosition(-205, halfH - 154, 1);
        hud.addChild(title);

        const underline = new Node('TitleRule');
        underline.addComponent(UITransform).setContentSize(230, 3);
        const ug = underline.addComponent(Graphics);
        ug.fillColor = new Color(166, 58, 46, 210);
        ug.rect(-115, -1, 230, 3);
        ug.fill();
        underline.setPosition(-250, halfH - 182, 1);
        hud.addChild(underline);

        const legend = new Node('LegendButton');
        legend.addComponent(UITransform).setContentSize(76, 72);
        const lg = legend.addComponent(Graphics);
        lg.fillColor = new Color(250, 243, 222, 245);
        lg.roundRect(-38, -36, 76, 72, 12);
        lg.fill();
        lg.strokeColor = new Color(160, 138, 82, 255);
        lg.lineWidth = 2;
        lg.roundRect(-38, -36, 76, 72, 12);
        lg.stroke();
        const legendText = new Node('LegendText');
        legendText.addComponent(UITransform).setContentSize(68, 60);
        const ll = legendText.addComponent(Label);
        ll.string = '图例';
        ll.fontSize = 23;
        ll.lineHeight = 30;
        ll.color = new Color(90, 58, 26, 255);
        ll.useSystemFont = true;
        legend.addChild(legendText);
        legend.setPosition(320, halfH - 161, 1);
        hud.addChild(legend);

        const hint = new Node('MapHint');
        hint.addComponent(UITransform).setContentSize(500, 40);
        const hl = hint.addComponent(Label);
        hl.string = '点触城池 · 查看详情';
        hl.fontSize = 21;
        hl.lineHeight = 28;
        hl.color = new Color(122, 90, 48, 220);
        hl.useSystemFont = true;
        hint.setPosition(0, -halfH + 190, 1);
        hud.addChild(hint);
    }
}

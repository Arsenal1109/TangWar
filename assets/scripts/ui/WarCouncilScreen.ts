import {
    _decorator,
    Color,
    Component,
    Font,
    Graphics,
    HorizontalTextAlignment,
    Label,
    Layers,
    Node,
    resources,
    Sprite,
    SpriteFrame,
    sys,
    Texture2D,
    Tween,
    tween,
    UITransform,
    UIOpacity,
    Vec3,
    VerticalTextAlignment,
    view
} from 'cc';
import type { GameEvents } from '../Bootstrap';
import type { EventBus } from '../core/EventBus';
import { createDiplomacyState, performDiplo, type DiplomacyState } from '../core/Diplomacy';
import { recruit } from '../core/Military';
import { applyPolicy } from '../core/PolicySystem';
import type { CityState } from '../core/ResourceSystem';
import { spreadRumor } from '../core/Stratagem';
import { TurnManager } from '../core/TurnManager';
import { FACTIONS } from '../data/Factions';
import { GENERALS } from '../data/Generals';
import { POLICIES } from '../data/Policies';
import { TROOP_ORDER, TROOPS, type TroopType } from '../data/Troops';

const { ccclass } = _decorator;

type CouncilKey = 'defend' | 'raid' | 'pacify';
type PageKey = 'world' | 'cities' | 'army' | 'strategy' | 'diplomacy' | 'intel' | 'settings';

interface CouncilOption {
    key: CouncilKey;
    title: string;
    short: string;
    detail: string;
    target: string;
    turns: number;
    odds: number;
    food: number;
}

interface ReportEntry {
    title: string;
    body: string;
    tone: 'normal' | 'good' | 'bad';
}

interface DialogueLine {
    speaker: string;
    role: string;
    text: string;
    portrait: 'redesign/li-shimin/texture' | 'redesign/liu-wenjing-optimized/texture';
    side: 'left' | 'right';
}

interface BattleOutcome {
    title: string;
    body: string;
    tone: ReportEntry['tone'];
}

const C = {
    ink: new Color(12, 12, 11, 248),
    inkSoft: new Color(22, 21, 18, 242),
    panel: new Color(19, 18, 16, 255),
    panelSoft: new Color(35, 30, 24, 244),
    wood: new Color(60, 43, 29, 252),
    bronze: new Color(142, 110, 62, 255),
    bronzeSoft: new Color(113, 87, 51, 210),
    gold: new Color(226, 190, 111, 255),
    paper: new Color(235, 219, 178, 255),
    muted: new Color(188, 170, 132, 255),
    cinnabar: new Color(157, 43, 33, 255),
    cinnabarHot: new Color(225, 72, 45, 255),
    green: new Color(118, 178, 93, 255),
    red: new Color(218, 72, 55, 255),
    shade: new Color(0, 0, 0, 86)
};

/** 设计 token：圆角 / 倒角 / 阴影 / 光泽 / 动效时长与缓动的唯一来源，新增视觉参数先来这里登记，不散落魔法数。 */
const T = {
    radius: { flat: 0, chip: 2, control: 3, card: 4, panel: 8 },
    bevel: new Color(255, 244, 214, 32),
    edge: new Color(0, 0, 0, 150),
    sheen: new Color(255, 240, 205, 5),
    sheenTop: new Color(255, 240, 205, 6),
    shadowFar: new Color(0, 0, 0, 22),
    shadowNear: new Color(0, 0, 0, 36),
    dur: { fast: 0.12, mid: 0.22, slow: 0.38 },
    ease: { out: 'cubicOut', spring: 'backOut', sine: 'sineOut' } as const,
    stagger: 0.045,
    pressScale: 0.94,
    entranceRise: 8
};

const COUNCIL: CouncilOption[] = [
    { key: 'defend', title: '防御', short: '固守待援', detail: '坚壁清野，修整城防并稳住军心', target: '太原', turns: 1, odds: 86, food: -300 },
    { key: 'raid', title: '突袭', short: '袭击敌军', detail: '轻骑穿越井陉，抢在敌援之前夺关', target: '井陉关', turns: 2, odds: 68, food: -600 },
    { key: 'pacify', title: '安抚', short: '招抚降附', detail: '安抚河东乡勇，扩充兵源并提升民心', target: '河东', turns: 1, odds: 74, food: -400 }
];

const ONBOARDING_KEY = 'tangwar:onboarding:v3';

const PROLOGUE_DIALOGUE: DialogueLine[] = [
    {
        speaker: '刘文静',
        role: '晋阳令 · 军府谋主',
        text: '关中空虚，长安震动。若还困守太原，待东都援军合围，再多兵粮也只是坐困孤城。',
        portrait: 'redesign/liu-wenjing-optimized/texture',
        side: 'right'
    },
    {
        speaker: '李世民',
        role: '敦煌郡公 · 出征主将',
        text: '我愿领轻骑先出井陉，夺关断援。只是太行路险，粮道若迟一日，先锋便多一分凶险。',
        portrait: 'redesign/li-shimin/texture',
        side: 'left'
    },
    {
        speaker: '刘文静',
        role: '晋阳令 · 军府谋主',
        text: '河东乡勇仍在观望。先安抚可得兵心，先奇袭可夺战机；两利不可兼得，这一令要由你来定。',
        portrait: 'redesign/liu-wenjing-optimized/texture',
        side: 'right'
    },
    {
        speaker: '李世民',
        role: '敦煌郡公 · 出征主将',
        text: '军情、粮秣、民心皆已列入战图。请入军帐——选定军议后，以印信传令三军。',
        portrait: 'redesign/li-shimin/texture',
        side: 'left'
    }
];

/** 横屏全域战图：军议、经营、外交、计策、战报与回合推进共用同一运行态。 */
@ccclass('WarCouncilScreen')
export class WarCouncilScreen extends Component {
    private turns!: TurnManager;
    private bus!: EventBus<GameEvents>;
    private states: CityState[] = [];
    private diplomacy!: DiplomacyState;
    private width = 844;
    private height = 390;
    private mapWidth = 650;
    private selected: CouncilKey = 'raid';
    private selectedCityId = 'taiyuan';
    private page: PageKey = 'world';
    private enemyStrength = 12000;
    private reportOpen = true;
    private reportCount = 3;
    private reports: ReportEntry[] = [
        { title: '井陉关战报（预测）', body: '守军约一万二千，山地奇袭可取得机动优势。', tone: 'normal' },
        { title: '幽州援军南下', body: '敌援约三旬抵达，宜在两回合内决断。', tone: 'bad' },
        { title: '河东乡勇请附', body: '若先安抚地方，可提升民心并获得兵源。', tone: 'good' }
    ];
    private eraLabel!: Label;
    private resNumbers: Record<'food' | 'gold' | 'army' | 'morale', Label> = {} as Record<'food' | 'gold' | 'army' | 'morale', Label>;
    private toastLabel!: Label;
    private toastAccent: Node | null = null;
    private reportPanel!: Node;
    private reportBadge!: Label;
    private reportBody!: Node;
    private pagePanel!: Node;
    private pageMask: Node | null = null;
    private navNodes = new Map<PageKey, Node>();
    private councilNodes = new Map<CouncilKey, Node>();
    private routeLayer!: Node;
    private radialLayer!: Node;
    private timelineLayer!: Node;
    private mapTools!: Node;
    private toastNode!: Node;
    private orderButton!: Node;
    private holdFill!: Node;
    private holdLabel!: Label;
    private orderGlow: Node | null = null;
    private orderGlowOpacity: UIOpacity | null = null;
    private holdTimer = 0;
    private holding = false;
    private committed = false;
    private settings = { music: true, vibration: true, fastText: false };
    private guideLayer: Node | null = null;
    private cinematicLayer: Node | null = null;
    private animatingEntrance = false;
    private resourceRoll = { t: 1 };
    private lastHeader: { food: number; gold: number; army: number; morale: number } | null = null;
    private bodyFont: Font | null = null;
    private labelRegistry: Label[] = [];
    private panelSkins = new Map<string, SpriteFrame>();
    private pendingSkins: Array<{ node: Node; skin: string }> = [];

    init(turns: TurnManager, bus: EventBus<GameEvents>, states: CityState[]): this {
        this.turns = turns;
        this.bus = bus;
        this.states = states;
        this.diplomacy = createDiplomacyState('tang');
        this.build();
        this.bus.on('turn-advanced', () => {
            this.refreshHeader();
            if (this.page !== 'world') this.renderPageAgain(this.page);
        });
        this.bus.on('world-events', (event) => {
            this.reports.unshift({
                title: event.title,
                body: event.messages.slice(0, 2).join('；') || '各地暂无重大异动。',
                tone: 'normal'
            });
            this.reportCount += 1;
            this.reportBadge.string = String(this.reportCount);
            this.refreshReport();
        });
        return this;
    }

    update(dt: number): void {
        if (!this.holding || this.committed) return;
        this.holdTimer = Math.min(0.78, this.holdTimer + dt);
        const progress = this.holdTimer / 0.78;
        this.holdFill.setScale(progress, progress, 1);
        this.holdLabel.string = progress > 0.65 ? '即将\n传令' : '按住\n传令';
        if (progress >= 1) {
            this.holding = false;
            this.commitOrder();
        }
    }

    private build(): void {
        const visible = view.getVisibleSize();
        // 刘海/挖孔避让（横屏时位于左右两侧）：安全区之外铺墨色底幕，整个 UI 收进安全区。
        // 编辑器预览与无刘海设备 getSafeAreaRect 返回全屏 → 零避让，行为与从前完全一致。
        const safe = sys.getSafeAreaRect();
        const fullW = visible.width;
        const fullH = visible.height;
        const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
        const sx = clamp(safe.x, 0, fullW);
        const sy = clamp(safe.y, 0, fullH);
        const sw = clamp(safe.width, 0, fullW - sx);
        const sh = clamp(safe.height, 0, fullH - sy);
        const insetted = sw > 0 && sh > 0 && (sw < fullW || sh < fullH);
        this.width = insetted ? sw : fullW;
        this.height = insetted ? sh : fullH;
        this.mapWidth = this.width - 194;
        this.node.layer = Layers.Enum.UI_2D;
        this.node.addComponent(UITransform).setContentSize(this.width, this.height);
        if (insetted) {
            // 本节点对齐安全区中心；底幕反向偏移补回全屏尺寸，延伸到刘海与状态栏之下。
            const offsetX = sx + sw / 2 - fullW / 2;
            const offsetY = sy + sh / 2 - fullH / 2;
            this.node.setPosition(offsetX, offsetY, 0);
            const backdrop = this.rect(this.node, 'NotchBackdrop', fullW, fullH, new Color(8, 7, 6, 255), -offsetX, -offsetY);
            backdrop.setSiblingIndex(0);
            // 触摸地板：全屏尺寸盖到刘海之下，任何上层（对话/页面遮罩等安全区尺寸容器）
            // 未命中的边缘触摸由此吞噬，杜绝穿透到城池标记；正常按钮在其上层先命中，不受影响。
            backdrop.on(Node.EventType.TOUCH_START, () => undefined, this);
            backdrop.on(Node.EventType.TOUCH_END, () => undefined, this);
        }
        this.buildMap();
        this.buildHeader();
        this.buildWorldControls();
        this.buildReportDrawer();
        this.buildBottomNav();
        this.buildPagePanel();
        this.buildToast();
        resources.preload('redesign/liu-wenjing-optimized/texture', Texture2D);
        this.loadBodyFont();
        this.loadPanelSkins();
        this.selectCouncil('raid');
        this.refreshHeader();
        this.playIntro();
        this.showOpening();
    }

    private buildMap(): void {
        const bg = new Node('LandscapeWarMap');
        bg.layer = Layers.Enum.UI_2D;
        bg.addComponent(UITransform).setContentSize(this.width, this.height);
        const sprite = bg.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        this.node.addChild(bg);
        resources.load('redesign/war-map-landscape/texture', Texture2D, (err, texture) => {
            if (err) return console.error('[Landscape] map asset failed', err);
            const frame = new SpriteFrame();
            frame.texture = texture;
            sprite.spriteFrame = frame;
        });
        this.rect(this.node, 'MapShade', this.width, this.height, new Color(0, 0, 0, 52), 0, 0);
        this.buildCloudLayer();
        this.routeLayer = this.container(this.node, 'RouteLayer', this.width, this.height, 1);
        this.radialLayer = this.container(this.node, 'MapCommandLayer', this.mapWidth, this.height - 40, 2);
        this.radialLayer.setPosition(-97, -20, 2);
        this.buildCityMarker('云中', -145, 116, false);
        this.buildCityMarker('幽州', 83, 112, false);
        this.buildCityMarker('离石', -272, 73, false);
        this.buildCityMarker('平阳', -309, -16, true);
        this.buildCityMarker('邺城', 122, -27, false);
        this.buildCityMarker('井陉关', -4, 28, false, true);
        this.drawDangerZone();
    }

    private buildHeader(): void {
        const y = this.height / 2 - 20;
        const header = this.panel(this.node, 'TopBar', this.width, 40, new Color(10, 10, 9, 246), 0, y, 0, C.bronzeSoft, false);
        const seal = this.panel(header, 'TangSeal', 34, 34, C.cinnabar, -this.width / 2 + 25, 0, 17, C.gold);
        this.label(seal, '唐', 18, C.paper, 0, 0, 30, 28, true);
        this.eraLabel = this.label(header, '', 17, C.gold, -this.width / 2 + 126, 7, 154, 24, false, HorizontalTextAlignment.LEFT);
        this.label(header, '唐 · 李渊', 13, C.paper, -this.width / 2 + 126, -10, 154, 20, false, HorizontalTextAlignment.LEFT);
        this.buildResourceStrip(header);
    }

    /** 顶栏资源条：四项「印章字符 + 色值数字」格子，替代纯文本，提升信息层级（保持数字滚动）。 */
    private buildResourceStrip(header: Node): void {
        const cells: Array<{ key: 'food' | 'gold' | 'army' | 'morale'; char: string; color: Color; x: number }> = [
            { key: 'food', char: '粮', color: C.gold, x: -126 },
            { key: 'gold', char: '金', color: C.gold, x: -42 },
            { key: 'army', char: '兵', color: C.paper, x: 42 },
            { key: 'morale', char: '心', color: C.green, x: 126 }
        ];
        for (const cell of cells) {
            const seal = this.panel(header, `ResSeal_${cell.key}`, 20, 20, C.panelSoft, cell.x - 32, 0, 5, C.bronzeSoft);
            this.label(seal, cell.char, 12, C.gold, 0, 0, 18, 18, true);
            this.resNumbers[cell.key] = this.label(header, '0', 14, cell.color, cell.x + 10, 0, 52, 24, true);
        }
    }

    private buildWorldControls(): void {
        this.buildRadialCouncil();
        this.buildRoute();
        this.buildCampaignTimeline();
        const battleTab = this.skinnedPanel(this.node, 'BattleReportTab', 48, 62, -this.width / 2 + this.mapWidth - 26, 108, 'card', T.radius.chip, C.bronze);
        this.label(battleTab, '战报', 14, C.gold, 0, 11, 42, 23, true);
        this.rect(battleTab, 'BadgeBg', 20, 20, C.cinnabar, 0, -18, 10);
        this.reportBadge = this.label(battleTab, String(this.reportCount), 11, C.paper, 0, -18, 18, 18, true);
        battleTab.on(Node.EventType.TOUCH_END, () => this.openPage('intel'), this);
        this.pressable(battleTab);
    }

    private buildRadialCouncil(): void {
        const center = this.panel(this.radialLayer, 'Taiyuan', 72, 34, C.cinnabar, -76, 77, T.radius.chip, C.gold);
        this.label(center, '太原', 20, C.paper, 0, 0, 62, 29, true);
        const ring = new Node('CityPulse');
        ring.layer = Layers.Enum.UI_2D;
        ring.addComponent(UITransform).setContentSize(96, 96);
        ring.setPosition(-76, 77, 0);
        const rg = ring.addComponent(Graphics);
        rg.strokeColor = new Color(240, 174, 80, 220);
        rg.lineWidth = 3;
        rg.circle(0, 0, 44);
        rg.stroke();
        this.radialLayer.addChild(ring);
        const ro = ring.addComponent(UIOpacity);
        tween(ring).to(0.9, { scale: new Vec3(1.18, 1.18, 1) }).to(0.9, { scale: Vec3.ONE }).union().repeatForever().start();
        tween(ro).to(0.9, { opacity: 80 }).to(0.9, { opacity: 255 }).union().repeatForever().start();
        const card = this.skinnedPanel(this.radialLayer, 'TaiyuanDetail', 160, 102, -112, -2, 'card', T.radius.control, C.bronze);
        this.label(card, '太原', 18, C.gold, -48, 32, 58, 24, true, HorizontalTextAlignment.LEFT);
        this.label(card, '我方城池', 10, C.muted, 26, 32, 68, 19);
        this.label(card, '守军  8,000\n城防  68%\n粮草  +600/回合', 11, C.paper, -16, 1, 116, 45, false, HorizontalTextAlignment.LEFT);
        this.button(card, 'CityRecruit', '调兵', -40, -38, 66, 24, () => this.openPage('army'));
        this.button(card, 'CityManage', '城内', 40, -38, 66, 24, () => this.openPage('cities'));
    }

    private buildCampaignTimeline(): void {
        this.timelineLayer = this.skinnedPanel(
            this.node,
            'CampaignTimeline',
            this.mapWidth - 10,
            84,
            -this.width / 2 + this.mapWidth / 2,
            -this.height / 2 + 46,
            'panel',
            0,
            C.bronze,
            false
        );
        this.refreshTimeline();
    }

    private refreshTimeline(): void {
        if (!this.timelineLayer) return;
        this.clearChildren(this.timelineLayer);
        const option = this.currentOption();
        this.label(this.timelineLayer, `${option.title}${option.target} · 作战进程`, 14, C.gold, -195, 29, 220, 22, true, HorizontalTextAlignment.LEFT);
        const cells = [
            ['起点', '太原'],
            ['整军', '1回合'],
            ['地形', option.key === 'raid' ? '山地+15%' : '平原'],
            ['行军', `${option.turns}回合`],
            [option.target, '目标'],
            ['胜算', `${option.odds}%`],
            ['粮耗', `${option.food}`],
            ['下一事件', option.key === 'raid' ? '遭遇敌军' : '军议结算']
        ];
        const icons = ['step-origin', 'step-march', 'step-terrain', 'step-travel', 'step-target', 'step-battle', 'step-food', 'step-event'];
        const cellW = (this.mapWidth - 22) / cells.length;
        cells.forEach(([title, value], index) => {
            const x = -(this.mapWidth - 22) / 2 + cellW / 2 + index * cellW;
            const selected = index === 4;
            if (selected) this.panel(this.timelineLayer, 'TargetStep', cellW - 2, 61, new Color(97, 45, 31, 248), x, -10, 1, C.gold, false);
            if (index > 0) this.rect(this.timelineLayer, `StepRule${index}`, 1, 57, C.bronzeSoft, x - cellW / 2, -10);
            this.label(this.timelineLayer, title, 10, selected ? C.paper : C.muted, x, 7, cellW - 5, 17, selected);
            this.label(this.timelineLayer, value, 11, index === 6 ? C.red : C.gold, x + 14, -17, cellW - 30, 19, true);
            this.image(this.timelineLayer, `TimelineIcon_${icons[index]}`, `redesign/icons/${icons[index]}/texture`, 20, 20, x - cellW / 2 + 13, -17, 4);
        });
        const line = this.rect(this.timelineLayer, 'ProgressLine', this.mapWidth - 62, 2, C.gold, 0, -37);
        // 置于皮肤底图之上、内容格之下，进度轨道不被遮挡
        const skinsCount = this.timelineLayer.children.filter((child) => child.name.endsWith('_Skin') || child.name.endsWith('_Shadow')).length;
        line.setSiblingIndex(skinsCount);
    }

    private buildRoute(): void {
        this.routeLayer.removeAllChildren();
        const option = this.currentOption();
        const start = new Vec3(-173, 57, 0);
        const end = option.key === 'defend' ? new Vec3(-173, 57, 0)
            : option.key === 'raid' ? new Vec3(-4, 28, 0)
                : new Vec3(-252, -16, 0);
        const route = new Node('RouteStroke');
        route.layer = Layers.Enum.UI_2D;
        route.addComponent(UITransform).setContentSize(this.width, this.height);
        const g = route.addComponent(Graphics);
        g.strokeColor = option.key === 'raid' ? C.cinnabarHot : C.gold;
        g.lineWidth = 4;
        if (option.key === 'defend') g.circle(end.x, end.y, 58);
        else {
            g.moveTo(start.x, start.y);
            g.bezierCurveTo(start.x + 55, start.y + 25, end.x - 75, end.y + 28, end.x, end.y);
        }
        g.stroke();
        this.routeLayer.addChild(route);
        const opacity = route.addComponent(UIOpacity);
        tween(opacity).to(0.55, { opacity: 100 }).to(0.55, { opacity: 255 }).union().repeatForever().start();
        const forecast = this.skinnedPanel(this.routeLayer, 'RouteForecast', 116, 39, 22, 77, 'card', T.radius.chip, C.bronzeSoft);
        this.label(forecast, `${option.title} · 行军${option.turns}回合\n预计抵达${option.target}`, 11, C.paper, 0, 0, 106, 32, true);
        if (option.key !== 'defend') {
            for (let i = 0; i < 7; i += 1) {
                const t = (i + 1) / 8;
                const x = start.x + (end.x - start.x) * t;
                const y = start.y + (end.y - start.y) * t;
                const pulse = this.rect(this.routeLayer, `March_${i}`, 14, 5, C.gold, x, y, 2);
                pulse.angle = Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
                const po = pulse.addComponent(UIOpacity);
                po.opacity = 45;
                tween(po).delay(i * 0.09).to(0.25, { opacity: 255 }).to(0.45, { opacity: 45 }).union().repeatForever().start();
            }
        }
    }

    private drawDangerZone(): void {
        const zone = new Node('DangerZone');
        zone.layer = Layers.Enum.UI_2D;
        zone.addComponent(UITransform).setContentSize(this.mapWidth, this.height);
        zone.setPosition(0, 0, 0);
        const g = zone.addComponent(Graphics);
        g.fillColor = new Color(151, 45, 34, 84);
        g.moveTo(-270, 108);
        g.lineTo(-175, 145);
        g.lineTo(-72, 112);
        g.lineTo(6, 36);
        g.lineTo(-36, -72);
        g.lineTo(-172, -92);
        g.lineTo(-286, -37);
        g.lineTo(-270, 108);
        g.fill();
        const opacity = zone.addComponent(UIOpacity);
        this.node.addChild(zone);
        zone.setSiblingIndex(2);
        tween(opacity).to(1.2, { opacity: 150 }).to(1.2, { opacity: 255 }).union().repeatForever().start();
    }

    /** 可点暗示：金色右向箭头，标在可点击行/卡的右缘（字体子集无此字形，用 Graphics 绘制）。 */
    private affordance(parent: Node, x: number, y: number, scale = 1): void {
        const node = new Node('TapAffordance');
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform).setContentSize(10 * scale, 14 * scale);
        node.setPosition(x, y, 6);
        const g = node.addComponent(Graphics);
        g.strokeColor = C.gold;
        g.lineWidth = 2.4;
        g.lineCap = Graphics.LineCap.ROUND;
        g.moveTo(-2.2 * scale, -4.6 * scale);
        g.lineTo(2.4 * scale, 0);
        g.lineTo(-2.2 * scale, 4.6 * scale);
        g.stroke();
        parent.addChild(node);
    }

    private buildCityMarker(name: string, x: number, y: number, own: boolean, target = false): void {
        if (target) {
            // 目标城池可点（切换突袭军议）：脉动金环提示，与太原 CityPulse 同语言
            const ring = new Node('TargetRing');
            ring.layer = Layers.Enum.UI_2D;
            ring.addComponent(UITransform).setContentSize(96, 96);
            ring.setPosition(x, y, 0);
            const rg = ring.addComponent(Graphics);
            rg.strokeColor = new Color(240, 174, 80, 200);
            rg.lineWidth = 2.5;
            rg.circle(0, 0, 21);
            rg.stroke();
            this.node.addChild(ring);
            const ro = ring.addComponent(UIOpacity);
            tween(ring).to(1.1, { scale: new Vec3(1.28, 1.28, 1) }).to(1.1, { scale: Vec3.ONE }).union().repeatForever().start();
            tween(ro).to(1.1, { opacity: 70 }).to(1.1, { opacity: 220 }).union().repeatForever().start();
        }
        const color = target ? C.cinnabar : own ? new Color(90, 62, 38, 245) : new Color(36, 48, 47, 240);
        const marker = this.panel(this.node, `City_${name}`, target ? 76 : 61, 27, color, x, y, T.radius.chip, target ? C.gold : C.bronzeSoft);
        this.label(marker, name, target ? 14 : 13, C.paper, 0, 0, target ? 70 : 55, 22, true);
        marker.on(Node.EventType.TOUCH_END, () => target ? this.selectCouncil('raid') : this.showToast(`${name} · ${own ? '我方城池' : '斥候资料已更新'}`), this);
        this.pressable(marker);
    }

    private buildReportDrawer(): void {
        const panelW = 194;
        const panelH = this.height - 4;
        this.reportPanel = this.skinnedPanel(this.node, 'CouncilRail', panelW, panelH, this.width / 2 - panelW / 2 - 2, 0, 'panel', 0, C.bronze, false);
        const portrait = new Node('LiShiminPortrait');
        portrait.layer = Layers.Enum.UI_2D;
        portrait.addComponent(UITransform).setContentSize(58, 58);
        const sprite = portrait.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        portrait.setPosition(-53, panelH / 2 - 35, 2);
        this.reportPanel.addChild(portrait);
        resources.load('redesign/li-shimin/texture', Texture2D, (err, texture) => {
            if (err) return;
            const frame = new SpriteFrame();
            frame.texture = texture;
            sprite.spriteFrame = frame;
        });
        this.label(this.reportPanel, '李世民', 20, C.paper, 31, panelH / 2 - 27, 92, 28, true);
        this.label(this.reportPanel, '出征主将', 12, C.gold, 31, panelH / 2 - 49, 92, 20, true);
        this.rect(this.reportPanel, 'CommanderRule', panelW - 10, 1, C.bronzeSoft, 0, panelH / 2 - 63);
        this.label(this.reportPanel, '兵力\n8,000', 12, C.paper, -59, panelH / 2 - 83, 54, 40, true);
        this.label(this.reportPanel, '行军\n2回合', 12, C.paper, 0, panelH / 2 - 83, 54, 40, true);
        this.label(this.reportPanel, '胜率\n68%', 12, C.gold, 59, panelH / 2 - 83, 54, 40, true);
        this.reportBody = this.container(this.reportPanel, 'CouncilOptions', panelW - 10, 176, 1);
        this.reportBody.setPosition(0, 5, 1);

        this.orderButton = this.panel(this.reportPanel, 'HoldOrder', 96, 96, C.cinnabar, 0, -panelH / 2 + 54, 48, C.gold);
        this.panel(this.orderButton, 'OrderInner', 84, 84, new Color(177, 55, 37, 255), 0, 0, 42, C.gold, false);
        this.holdFill = this.rect(this.orderButton, 'HoldFill', 80, 80, new Color(229, 121, 61, 220), 0, 0, 40, C.gold);
        this.holdFill.setScale(0.01, 0.01, 1);
        this.holdLabel = this.label(this.orderButton, '按住\n传令', 19, C.paper, 0, 0, 70, 51, true);
        this.orderButton.on(Node.EventType.TOUCH_START, () => this.onHoldStart(), this);
        this.orderButton.on(Node.EventType.TOUCH_END, () => this.onHoldEnd(), this);
        this.orderButton.on(Node.EventType.TOUCH_CANCEL, () => this.onHoldEnd(), this);
        this.buildOrderGlow(panelH);
        this.button(this.reportPanel, 'Withdraw', '撤军', -69, -panelH / 2 + 49, 48, 30, () => this.selectCouncil('defend'));
        this.button(this.reportPanel, 'Accelerate', '加速', 69, -panelH / 2 + 49, 48, 30, () => this.showToast('急行军：预计提前抵达，但粮耗增加'));
        this.button(this.reportPanel, 'RailSettings', '设', 78, panelH / 2 - 14, 24, 22, () => this.openPage('settings'));
        tween(this.orderButton).to(0.9, { scale: new Vec3(1.04, 1.04, 1) }).to(0.9, { scale: Vec3.ONE }).union().repeatForever().start();
        this.refreshReport();
    }

    private refreshReport(): void {
        this.reportBody.removeAllChildren();
        this.councilNodes.clear();
        const councilTitle = this.label(this.reportBody, '军议策略', 14, C.gold, -50, 72, 86, 22, true, HorizontalTextAlignment.LEFT);
        councilTitle.node.on(Node.EventType.TOUCH_END, () => this.openPage('strategy'), this);
        this.affordance(this.reportBody, -8, 72, 0.85); // 标题可点（跳转计策府）的显性提示
        this.label(this.reportBody, '选择一项军议生效', 10, C.muted, 38, 72, 100, 18);
        COUNCIL.forEach((option, index) => {
            const selected = option.key === this.selected;
            const card = this.panel(this.reportBody, `Council_${option.key}`, 178, 48, selected ? new Color(95, 43, 30, 255) : C.panelSoft, 0, 37 - index * 54, T.radius.chip, selected ? C.gold : C.bronzeSoft);
            this.image(card, `CouncilIcon_${option.key}`, `redesign/icons/council-${option.key}/texture`, 31, 31, -66, 0, 4);
            this.label(card, `${option.title}${option.target}`, 14, C.paper, -3, 9, 96, 21, true);
            this.label(card, option.key === 'defend' ? '城防+20% · 士气-10' : option.key === 'raid' ? '胜率+15% · 行军-1回合' : '粮草+800 · 民心+5', 10, option.key === 'defend' ? C.green : option.key === 'raid' ? C.gold : C.green, 12, -12, 104, 18);
            this.affordance(card, 80, 0);
            card.on(Node.EventType.TOUCH_END, () => this.selectCouncil(option.key), this);
            this.pressable(card);
            this.councilNodes.set(option.key, card);
            if (selected) this.sweepHighlight(card, 178, 48);
        });
    }

    private buildBottomNav(): void {
        const navW = 42;
        const navH = 168;
        const nav = this.skinnedPanel(this.node, 'MapTools', navW, navH, -this.width / 2 + 24, 10, 'card', 0, C.bronzeSoft, false);
        this.mapTools = nav;
        const tools: Array<{ key: PageKey; label: string; icon: string }> = [
            { key: 'world', label: '地形', icon: 'tool-terrain' },
            { key: 'diplomacy', label: '势力', icon: 'tool-power' },
            { key: 'cities', label: '城池', icon: 'tool-city' },
            { key: 'intel', label: '标记', icon: 'tool-mark' }
        ];
        const itemH = navH / tools.length;
        tools.forEach((item, index) => {
            const y = navH / 2 - itemH / 2 - index * itemH;
            const button = this.panel(nav, `Nav_${item.key}`, navW - 2, itemH - 1, item.key === 'world' ? C.cinnabar : new Color(18, 18, 16, 230), 0, y);
            this.image(button, `NavIcon_${item.key}`, `redesign/icons/${item.icon}/texture`, 21, 21, 0, 8, 4);
            this.label(button, item.label, 10, item.key === 'world' ? C.paper : C.gold, 0, -12, navW - 6, 15, true);
            button.on(Node.EventType.TOUCH_END, () => this.openPage(item.key), this);
            this.pressable(button);
            this.navNodes.set(item.key, button);
        });
    }

    private buildPagePanel(): void {
        // 模态遮罩：暗色直接写入填充色（不依赖 UIOpacity 动画，避免透明竞态），active 切换即显示；
        // 建在 pagePanel 之前 → 渲染于所有世界层（地图/城池标记/顶栏）之上、弹窗之下。
        // 空触摸监听吞噬点击，杜绝下层城池标记/战报入口被"点穿"。
        this.pageMask = this.rect(this.node, 'PageMask', this.width, this.height, new Color(3, 3, 3, 202), 0, 0);
        this.pageMask.active = false;
        this.pageMask.on(Node.EventType.TOUCH_START, () => undefined, this);
        this.pageMask.on(Node.EventType.TOUCH_END, () => undefined, this);
        this.pagePanel = this.skinnedPanel(this.node, 'SystemPage', this.width - 8, this.height - 48, 0, -20, 'panel', T.radius.control, C.bronze, false);
        this.pagePanel.active = false;
    }

    private buildToast(): void {
        const toast = this.panel(this.node, 'Toast', this.mapWidth - 20, 27, new Color(16, 15, 13, 238), -this.width / 2 + this.mapWidth / 2, -this.height / 2 + 99, T.radius.control, C.bronzeSoft);
        this.toastNode = toast;
        this.toastLabel = this.label(toast, '军议已就绪', 13, C.paper, 0, 0, this.mapWidth - 42, 22, true);
        this.toastAccent = this.rect(toast, 'ToastAccent', 6, 16, C.gold, -this.mapWidth / 2 + 16, 0, 3);
        toast.addComponent(UIOpacity).opacity = 0;
    }

    private openPage(key: PageKey): void {
        this.page = key;
        this.refreshNav();
        const toastOpacity = this.toastNode.getComponent(UIOpacity);
        if (toastOpacity) {
            Tween.stopAllByTarget(toastOpacity);
            toastOpacity.opacity = 0;
        }
        this.toastNode.active = false;
        this.toastNode.setPosition(
            key === 'world' ? -this.width / 2 + this.mapWidth / 2 : 0,
            key === 'world' ? -this.height / 2 + 99 : -this.height / 2 + 18,
            12
        );
        if (key === 'world') {
            this.hidePageMask();
            this.pagePanel.active = false;
            this.radialLayer.active = true;
            this.reportPanel.active = true;
            this.mapTools.active = true;
            this.timelineLayer.active = true;
            return;
        }
        this.radialLayer.active = false;
        this.reportPanel.active = false;
        this.mapTools.active = false;
        this.timelineLayer.active = false;
        this.pagePanel.active = true;
        this.showPageMask();
        this.pagePanel.removeAllChildren();
        this.pagePanel.setScale(0.97, 0.97, 1);
        const opacity = this.pagePanel.getComponent(UIOpacity) ?? this.pagePanel.addComponent(UIOpacity);
        opacity.opacity = 0;
        tween(this.pagePanel).to(0.22, { scale: Vec3.ONE }, { easing: 'cubicOut' }).start();
        tween(opacity).to(0.18, { opacity: 255 }).start();
        this.animatingEntrance = true;
        this.renderPageAgain(key);
        this.animatingEntrance = false;
    }

    /** 弹窗遮罩：压暗并锁定下层页面（暗色写在填充里，active 切换即显示，稳、无透明竞态）。 */
    private showPageMask(): void {
        if (this.pageMask) this.pageMask.active = true;
    }

    private hidePageMask(): void {
        if (this.pageMask) this.pageMask.active = false;
    }

    private pageHeader(title: string, subtitle: string): Node {
        const w = this.width - 8;
        const h = this.height - 48;
        this.label(this.pagePanel, title, 22, C.gold, -w / 2 + 112, h / 2 - 27, 176, 30, true, HorizontalTextAlignment.LEFT);
        this.label(this.pagePanel, subtitle, 12, C.muted, 12, h / 2 - 27, w - 360, 24, false, HorizontalTextAlignment.LEFT);
        this.rect(this.pagePanel, 'HeaderRule', w - 24, 1, C.bronzeSoft, 0, h / 2 - 48);
        this.button(this.pagePanel, 'PageClose', '返回战图', w / 2 - 62, h / 2 - 27, 96, 28, () => this.openPage('world'));
        return this.pagePanel;
    }

    private renderCitiesPage(): void {
        const parent = this.pageHeader('城池与内政', '选择城池后，每季可施行一项政令；建设会真实改变资源与民心。');
        const own = this.states.filter((c) => c.faction === 'tang');
        if (!own.some((c) => c.id === this.selectedCityId)) this.selectedCityId = own[0]?.id ?? 'taiyuan';
        own.slice(0, 5).forEach((city, i) => {
            const selected = city.id === this.selectedCityId;
            const row = this.panel(parent, `CityRow_${city.id}`, 156, 39, selected ? C.cinnabar : C.panelSoft, -this.width / 2 + 92, 78 - i * 44, T.radius.control, selected ? C.gold : C.bronzeSoft);
            this.label(row, city.name, 15, C.paper, -46, 0, 58, 25, true, HorizontalTextAlignment.LEFT);
            this.label(row, `兵 ${this.compact(city.army)}  民 ${city.morale}`, 11, selected ? C.gold : C.muted, 26, 0, 70, 21);
            this.affordance(row, 69, 0);
            row.on(Node.EventType.TOUCH_END, () => {
                this.selectedCityId = city.id;
                this.bus.emit('city-selected', { cityId: city.id });
                this.renderPageAgain('cities');
            }, this);
            this.pressable(row);
            this.entrance(row, i);
        });
        const city = this.selectedCity();
        const infoX = -this.width / 2 + 92;
        this.label(parent, `${city.name} · 城况`, 16, C.paper, infoX, -48, 142, 24, true, HorizontalTextAlignment.LEFT);
        this.label(parent, `人口 ${city.population.toFixed(1)}万 · 城防 ${city.defense}\n金 ${city.gold.toLocaleString()} · 粮 ${city.food.toLocaleString()}\n驻军 ${city.army.toLocaleString()}`, 10, C.muted, infoX, -88, 148, 52, false, HorizontalTextAlignment.LEFT);
        POLICIES.slice(0, 6).forEach((policy, i) => {
            const col = i % 3;
            const row = Math.floor(i / 3);
            const card = this.panel(parent, `Policy_${policy.id}`, 165, 62, city.policyUsed ? new Color(29, 28, 25, 220) : C.panelSoft, -35 + col * 177, 59 - row * 72, T.radius.control, C.bronzeSoft);
            this.label(card, policy.name, 15, city.policyUsed ? C.muted : C.paper, -3, 15, 145, 22, true);
            this.label(card, policy.desc, 10, C.muted, -3, -13, 145, 30);
            if (!city.policyUsed) this.affordance(card, 76, 0); // 已施政时置灰且无箭头：明确的"不可点"态
            card.on(Node.EventType.TOUCH_END, () => {
                const result = applyPolicy(city, policy.id);
                this.refreshHeader();
                this.showToast(result.ok ? `${city.name}施行「${policy.name}」成功` : result.reason, result.ok ? 'good' : 'bad');
                this.renderPageAgain('cities');
            }, this);
            this.pressable(card);
            this.entrance(card, i + 5);
        });
        this.label(parent, city.policyUsed ? '本季政令已执行，推进回合后可再次施政。' : '尚未施政 · 选择一项政令立即执行', 12, city.policyUsed ? C.muted : C.green, 150, -98, 460, 24, true);
    }

    private renderArmyPage(): void {
        const parent = this.pageHeader('部队与将领', '募兵直接消耗城池黄金；点选将领可任命为当前城守将。');
        const city = this.selectedCity();
        this.label(parent, `${city.name}募兵 · 金 ${city.gold.toLocaleString()} · 总兵 ${city.army.toLocaleString()}`, 16, C.paper, -205, 82, 360, 27, true);
        TROOP_ORDER.slice(0, 5).forEach((type, i) => this.armyCard(parent, type, i));
        this.label(parent, '麾下名将', 17, C.gold, 112, 83, 130, 26, true);
        GENERALS.filter((g) => g.faction === 'tang').slice(0, 5).forEach((general, i) => {
            const row = this.panel(parent, `General_${general.id}`, 305, 32, C.panelSoft, 217, 48 - i * 37, T.radius.control, C.bronzeSoft);
            this.label(row, general.name, 14, C.paper, -102, 0, 76, 22, true, HorizontalTextAlignment.LEFT);
            this.label(row, `统${general.stats.command} 谋${general.stats.strategy} 勇${general.stats.valor}`, 11, C.muted, 30, 0, 170, 20);
            this.affordance(row, 143, 0);
            row.on(Node.EventType.TOUCH_END, () => {
                city.generalId = general.id;
                this.showToast(`${general.name}已任命为${city.name}守将`, 'good');
                this.renderPageAgain('army');
            }, this);
            this.pressable(row);
            this.entrance(row, i + 5);
        });
        const assigned = GENERALS.find((g) => g.id === city.generalId);
        this.label(parent, `当前守将：${assigned?.name ?? '尚未任命'}`, 12, assigned ? C.green : C.muted, 270, 83, 214, 23, true, HorizontalTextAlignment.RIGHT);
    }

    private armyCard(parent: Node, type: TroopType, i: number): void {
        const city = this.selectedCity();
        const troop = TROOPS[type];
        const card = this.panel(parent, `Troop_${type}`, 154, 48, C.panelSoft, -318 + (i % 2) * 164, 43 - Math.floor(i / 2) * 56, T.radius.control, C.bronzeSoft);
        this.label(card, troop.name, 14, C.paper, -44, 10, 60, 21, true, HorizontalTextAlignment.LEFT);
        this.label(card, `${city.troops[type].toLocaleString()} · 金${troop.cost}/千`, 10, C.muted, 14, -11, 96, 18);
        this.affordance(card, 68, 0);
        card.on(Node.EventType.TOUCH_END, () => {
            const result = recruit(city, type, 1);
            this.refreshHeader();
            this.showToast(result.ok ? `${city.name}新募${troop.name}一千` : result.reason, result.ok ? 'good' : 'bad');
            this.renderPageAgain('army');
        }, this);
        this.pressable(card);
        this.entrance(card, i);
    }

    private renderStrategyPage(): void {
        const parent = this.pageHeader('计策府', '计策消耗黄金并改变敌方状态；高风险行动会进入战报。');
        const plans = [
            { name: '散布谣言', desc: '扰乱敌城民心 · 耗金40', action: () => this.executeRumor() },
            { name: '夜袭粮道', desc: '降低井陉守军 · 耗金120', action: () => this.executePlan('夜袭粮道', 120, 700) },
            { name: '反间敌将', desc: '降低敌军战意 · 耗金180', action: () => this.executePlan('反间敌将', 180, 950) },
            { name: '伏兵太行', desc: '突袭胜算提高8% · 耗金260', action: () => this.executePlan('伏兵太行', 260, 1200) }
        ];
        plans.forEach((plan, i) => {
            const card = this.panel(parent, `Plan_${i}`, 380, 69, C.panelSoft, -205 + (i % 2) * 410, 52 - Math.floor(i / 2) * 82, T.radius.card, C.bronzeSoft);
            this.label(card, plan.name, 17, C.paper, -98, 13, 150, 25, true, HorizontalTextAlignment.LEFT);
            this.label(card, plan.desc, 12, C.muted, -17, -14, 310, 22, false, HorizontalTextAlignment.LEFT);
            this.button(card, `PlanGo_${i}`, '执行', 140, 0, 64, 26, plan.action); // 真按钮替代金色文字：明确的可点信号
            card.on(Node.EventType.TOUCH_END, plan.action, this);
            this.pressable(card);
            this.entrance(card, i);
        });
        this.label(parent, `当前井陉守军：${this.enemyStrength.toLocaleString()} · 突袭基础胜算 ${this.currentOption().odds}%`, 13, C.gold, 0, -101, 520, 24, true);
    }

    private renderDiplomacyPage(): void {
        const parent = this.pageHeader('外交纵横', '选择势力后可进贡改善关系；关系与战争状态会随行动改变。');
        FACTIONS.filter((f) => f.id !== 'tang').slice(0, 8).forEach((faction, i) => {
            const relation = this.diplomacy.relations[faction.id] ?? 0;
            const card = this.panel(parent, `Faction_${faction.id}`, 188, 67, C.panelSoft, -300 + (i % 4) * 200, 51 - Math.floor(i / 4) * 79, T.radius.card, this.diplomacy.atWar.includes(faction.id) ? C.cinnabar : C.bronzeSoft);
            this.label(card, faction.name, 14, C.paper, -4, 18, 166, 22, true);
            this.label(card, `关系 ${relation > 0 ? '+' : ''}${relation} · ${this.diplomacy.atWar.includes(faction.id) ? '交战' : '中立'}`, 11, relation >= 20 ? C.green : relation < 0 ? C.red : C.muted, -4, -7, 164, 20);
            this.label(card, '进贡 200金', 10, C.gold, -4, -26, 150, 17);
            this.affordance(card, 86, 0);
            card.on(Node.EventType.TOUCH_END, () => this.executeDiplomacy(faction.id, faction.name), this);
            this.pressable(card);
            this.entrance(card, i);
        });
        this.label(parent, `大唐国库 ${this.treasury().toLocaleString()} 金 · 总兵力 ${this.tangPower().toLocaleString()}`, 13, C.gold, 0, -103, 500, 24, true);
    }

    private renderIntelPage(): void {
        const parent = this.pageHeader('情报与战报', `未读 ${this.reportCount} · 战报会记录军令、计策和天下大事。`);
        this.reportCount = 0;
        this.reportBadge.string = '0';
        this.reports.slice(0, 5).forEach((entry, i) => {
            // 纯展示行：无描边 + 更暗填充，与可点的行卡明确区分
            const row = this.panel(parent, `Intel_${i}`, this.width - 70, 36, i === 0 ? new Color(54, 38, 27, 248) : new Color(24, 22, 19, 220), 0, 70 - i * 42, T.radius.control);
            this.label(row, entry.title, 14, this.toneColor(entry.tone), -270, 0, 180, 23, true, HorizontalTextAlignment.LEFT);
            this.label(row, entry.body, 11, C.muted, 86, 0, this.width - 330, 22, false, HorizontalTextAlignment.LEFT);
            this.entrance(row, i);
        });
        this.label(parent, '情报来源：太行斥候 · 河东郡府 · 幽州商旅', 12, C.gold, 0, -102, 460, 23, true);
    }

    private renderSettingsPage(): void {
        const parent = this.pageHeader('设置', '横屏显示与反馈偏好会保留在本次游戏中。');
        const rows: Array<{ key: keyof typeof this.settings; title: string; desc: string }> = [
            { key: 'music', title: '军帐音乐', desc: '开启环境音乐与战鼓提示' },
            { key: 'vibration', title: '传令震动', desc: '长按完成时提供触觉反馈' },
            { key: 'fastText', title: '快速战报', desc: '跳过逐字展开动画' }
        ];
        rows.forEach((item, i) => {
            const col = i % 2;
            const rowIndex = Math.floor(i / 2);
            const row = this.panel(parent, `Setting_${item.key}`, 340, 58, C.panelSoft, -180 + col * 360, 57 - rowIndex * 72, T.radius.card, C.bronzeSoft);
            this.label(row, item.title, 16, C.paper, -89, 10, 138, 24, true, HorizontalTextAlignment.LEFT);
            this.label(row, item.desc, 10, C.muted, -41, -14, 232, 18, false, HorizontalTextAlignment.LEFT);
            const on = this.settings[item.key];
            const toggle = this.panel(row, 'Toggle', 68, 28, on ? C.cinnabar : new Color(57, 55, 50, 255), 128, 0, 14, C.bronzeSoft, false);
            this.label(toggle, on ? '开启' : '关闭', 12, on ? C.paper : C.muted, 0, 0, 58, 20, true);
            row.on(Node.EventType.TOUCH_END, () => {
                this.settings[item.key] = !this.settings[item.key];
                if (item.key === 'music') this.bus.emit('audio-setting', { music: this.settings.music });
                this.renderPageAgain('settings');
            }, this);
            this.pressable(row);
            this.entrance(row, i);
        });
        const guide = this.panel(parent, 'ReplayGuide', 340, 58, C.panelSoft, 180, -15, T.radius.card, C.bronzeSoft);
        this.label(guide, '开场、剧情与引导', 16, C.paper, -75, 10, 166, 24, true, HorizontalTextAlignment.LEFT);
        this.label(guide, '重新查看背景、对话与操作说明', 10, C.muted, -35, -14, 244, 18, false, HorizontalTextAlignment.LEFT);
        this.button(guide, 'ReplayGo', '重看', 128, 0, 64, 26, () => {
            this.openPage('world');
            this.showOpening(true);
        });
        this.pressable(guide);
        this.entrance(guide, 3);
        this.button(parent, 'ManualSave', '立即保存', 0, -102, 150, 34, () => {
            this.bus.emit('save-requested', {});
            this.showToast('进度已保存', 'good');
        });
    }

    private selectCouncil(key: CouncilKey): void {
        this.selected = key;
        this.buildRoute();
        this.refreshTimeline();
        this.refreshReport();
        const option = this.currentOption();
        this.showToast(`${option.title} · ${option.detail} · 胜算 ${option.odds}%`);
    }

    private onHoldStart(): void {
        this.holding = true;
        this.committed = false;
        this.holdTimer = 0;
        this.holdFill.setScale(0.01, 0.01, 1);
        if (this.orderGlow) {
            Tween.stopAllByTarget(this.orderGlowOpacity!);
            tween(this.orderGlowOpacity!).to(0.16, { opacity: 225 }).start();
            tween(this.orderGlow).to(0.2, { scale: new Vec3(1.16, 1.16, 1) }, { easing: T.ease.out }).start();
        }
    }

    private onHoldEnd(): void {
        if (!this.committed) {
            const attempted = this.holdTimer > 0.04;
            this.holding = false;
            this.holdTimer = 0;
            this.holdFill.setScale(0.01, 0.01, 1);
            this.holdLabel.string = '按住\n传令';
            this.restoreOrderGlow();
            if (attempted) this.showToast('继续按住，待印信填满后军令才会发出');
        }
    }

    private commitOrder(): void {
        this.committed = true;
        const option = this.currentOption();
        const city = this.states.find((item) => item.id === 'taiyuan') ?? this.selectedCity();
        if (city.food < Math.abs(option.food)) {
            this.showToast('粮草不足，军令无法下达', 'bad');
            this.resetOrderButton();
            return;
        }
        city.food += option.food;
        const outcome: BattleOutcome = { title: '', body: '', tone: 'good' };
        if (option.key === 'defend') {
            city.defense += 8;
            city.morale = Math.min(100, city.morale + 3);
            outcome.title = '并州防线加固';
            outcome.body = `城防提升至 ${city.defense}，军心稳固，敌军暂缓推进。`;
        } else if (option.key === 'pacify') {
            city.morale = Math.min(100, city.morale + 8);
            city.army += 600;
            city.troops.fubing += 600;
            outcome.title = '河东乡勇归附';
            outcome.body = '新得府兵六百，民心提升，后方粮道恢复。';
        } else {
            const victory = this.enemyStrength <= 10500 || this.turns.getTurnNumber() % 2 === 0;
            if (victory) {
                this.enemyStrength = Math.max(2400, this.enemyStrength - 3600);
                city.gold += 420;
                outcome.title = '奇袭井陉得胜';
                outcome.body = `李世民破敌三千六百，缴获黄金420，关隘守军降至 ${this.enemyStrength.toLocaleString()}。`;
            } else {
                city.army = Math.max(1000, city.army - 900);
                city.troops.fubing = Math.max(0, city.troops.fubing - 900);
                outcome.title = '井陉遭遇伏击';
                outcome.body = '我军折损九百，斥候已查明敌军伏兵位置。';
                outcome.tone = 'bad';
            }
        }
        this.playOrderBriefing(option, () => this.playBattleSequence(option, outcome, () => {
            this.reports.unshift(outcome);
            this.reportCount += 1;
            this.reportBadge.string = String(this.reportCount);
            this.turns.advance();
            this.bus.emit('turn-advanced', { year: this.turns.year, season: this.turns.getSeason(), turn: this.turns.getTurnNumber() });
            this.refreshReport();
            this.refreshHeader();
            this.showToast(`${outcome.title} · 已推进至${this.turns.getSeason()}`, outcome.tone);
            this.flashRoute();
            this.resetOrderButton();
        }));
    }

    private resetOrderButton(): void {
        this.holding = false;
        this.holdTimer = 0;
        this.holdFill.setScale(0.01, 0.01, 1);
        this.holdLabel.string = '按住\n传令';
        this.restoreOrderGlow();
        tween(this.orderButton).delay(0.35).call(() => { this.committed = false; }).start();
    }

    private executeRumor(): void {
        const source = this.states.find((city) => city.faction === 'tang');
        const target = this.states.find((city) => city.faction !== 'tang');
        if (!source || !target) return;
        const result = spreadRumor(target.morale, 82, source.gold, () => 0.2);
        if (result.goldCost) source.gold -= result.goldCost;
        if (result.ok && result.moraleDelta) target.morale = Math.max(0, target.morale + result.moraleDelta);
        this.reports.unshift({ title: '谣言已散布', body: result.ok ? `${target.name}民心动摇。` : result.reason, tone: result.ok ? 'good' : 'bad' });
        this.reportCount += 1;
        this.refreshHeader();
        this.showToast(result.ok ? `计策成功：${target.name}民心下降` : result.reason, result.ok ? 'good' : 'bad');
        this.renderPageAgain('strategy');
    }

    private executePlan(name: string, cost: number, damage: number): void {
        const source = this.states.find((city) => city.faction === 'tang');
        if (!source || source.gold < cost) return this.showToast('黄金不足', 'bad');
        source.gold -= cost;
        this.enemyStrength = Math.max(2400, this.enemyStrength - damage);
        this.reports.unshift({ title: `${name}成功`, body: `井陉守军削弱 ${damage.toLocaleString()}，新的战机已经出现。`, tone: 'good' });
        this.reportCount += 1;
        this.refreshHeader();
        this.showToast(`${name}成功 · 敌军-${damage.toLocaleString()}`, 'good');
        this.renderPageAgain('strategy');
    }

    private executeDiplomacy(factionId: string, factionName: string): void {
        const result = performDiplo(this.diplomacy, 'tang', factionId, 'tribute', { gold: this.treasury(), prestige: 82, armyPower: this.tangPower(), rng: () => 0.2 });
        if (result.ok) this.deductTreasury(result.goldCost);
        this.reports.unshift({ title: `使者赴${factionName}`, body: result.ok ? `${factionName}关系改善。` : result.reason, tone: result.ok ? 'good' : 'bad' });
        this.reportCount += 1;
        this.refreshHeader();
        this.showToast(result.ok ? `${factionName}关系 +${result.relationsDelta}` : result.reason, result.ok ? 'good' : 'bad');
        this.renderPageAgain('diplomacy');
    }

    private toggleReport(force?: boolean): void {
        this.reportOpen = force ?? true;
        this.openPage('intel');
    }

    private refreshHeader(): void {
        this.eraLabel.string = `${TurnManager.eraName(this.turns.year)} · ${this.turns.getSeason()}`;
        const own = this.states.filter((city) => city.faction === 'tang');
        const food = own.reduce((sum, city) => sum + city.food, 0);
        const gold = own.reduce((sum, city) => sum + city.gold, 0);
        const army = own.reduce((sum, city) => sum + city.army, 0);
        const morale = own.length ? Math.round(own.reduce((sum, city) => sum + city.morale, 0) / own.length) : 0;
        const apply = (f: number, g: number, a: number, m: number) => {
            this.resNumbers.food.string = this.compact(Math.round(f));
            this.resNumbers.gold.string = this.compact(Math.round(g));
            this.resNumbers.army.string = this.compact(Math.round(a));
            this.resNumbers.morale.string = String(Math.round(m));
        };
        const from = this.lastHeader;
        this.lastHeader = { food, gold, army, morale };
        const unchanged = from && from.food === food && from.gold === gold && from.army === army && from.morale === morale;
        if (!from || unchanged) {
            apply(food, gold, army, morale);
            return;
        }
        // 资源数字滚动：从上一次快照平滑过渡到新值，传令/施政后的变化一眼可感
        Tween.stopAllByTarget(this.resourceRoll);
        this.resourceRoll.t = 0;
        tween(this.resourceRoll)
            .to(0.55, { t: 1 }, {
                easing: T.ease.sine,
                onUpdate: () => {
                    const k = this.resourceRoll.t;
                    apply(
                        from.food + (food - from.food) * k,
                        from.gold + (gold - from.gold) * k,
                        from.army + (army - from.army) * k,
                        from.morale + (morale - from.morale) * k
                    );
                }
            })
            .start();
    }

    private refreshNav(): void {
        for (const [key, node] of this.navNodes) {
            const selected = key === this.page || (this.page === 'settings' && key === 'world');
            const g = node.getComponent(Graphics)!;
            const size = node.getComponent(UITransform)!.contentSize;
            g.clear();
            this.drawPanelBg(g, size.width, size.height, selected ? C.cinnabar : new Color(18, 18, 16, 230), 0, undefined, false);
            const label = node.children.find((child) => child.getComponent(Label))?.getComponent(Label);
            if (label) label.color = selected ? C.paper : C.gold;
        }
    }

    private renderPageAgain(key: PageKey): void {
        this.clearChildren(this.pagePanel);
        if (key === 'cities') this.renderCitiesPage();
        if (key === 'army') this.renderArmyPage();
        if (key === 'strategy') this.renderStrategyPage();
        if (key === 'diplomacy') this.renderDiplomacyPage();
        if (key === 'intel') this.renderIntelPage();
        if (key === 'settings') this.renderSettingsPage();
    }

    private selectedCity(): CityState {
        return this.states.find((city) => city.id === this.selectedCityId) ?? this.states.find((city) => city.faction === 'tang') ?? this.states[0];
    }
    private currentOption(): CouncilOption { return COUNCIL.find((option) => option.key === this.selected)!; }
    private treasury(): number { return this.states.filter((city) => city.faction === 'tang').reduce((sum, city) => sum + city.gold, 0); }
    private tangPower(): number { return this.states.filter((city) => city.faction === 'tang').reduce((sum, city) => sum + city.army, 0); }
    private deductTreasury(cost: number): void {
        let rest = cost;
        for (const city of this.states) {
            if (city.faction !== 'tang' || rest <= 0) continue;
            const take = Math.min(city.gold, rest);
            city.gold -= take;
            rest -= take;
        }
    }
    private toneColor(tone: ReportEntry['tone']): Color { return tone === 'good' ? C.green : tone === 'bad' ? C.red : C.paper; }
    private compact(value: number): string { return value >= 10000 ? `${(value / 10000).toFixed(2)}万` : value.toLocaleString(); }

    private showToast(text: string, tone: ReportEntry['tone'] = 'normal'): void {
        this.toastNode.active = true;
        this.toastLabel.string = text;
        const toneColor = tone === 'good' ? C.green : tone === 'bad' ? C.red : C.paper;
        this.toastLabel.color = toneColor;
        const accentG = this.toastAccent?.getComponent(Graphics);
        if (accentG) {
            accentG.clear();
            accentG.fillColor = tone === 'good' ? C.green : tone === 'bad' ? C.red : C.gold;
            accentG.roundRect(-3, -8, 6, 16, 3);
            accentG.fill();
        }
        this.toastNode.setPosition(
            this.page === 'world' ? -this.width / 2 + this.mapWidth / 2 : 0,
            this.page === 'world' ? -this.height / 2 + 99 : -this.height / 2 + 18,
            12
        );
        const opacity = this.toastLabel.node.parent!.getComponent(UIOpacity)!;
        Tween.stopAllByTarget(opacity);
        opacity.opacity = 0;
        tween(opacity).to(0.16, { opacity: 255 }).delay(1.5).to(0.28, { opacity: 0 }).start();
    }

    private flashRoute(): void {
        const opacity = this.routeLayer.getComponent(UIOpacity) ?? this.routeLayer.addComponent(UIOpacity);
        tween(opacity).to(0.12, { opacity: 35 }).to(0.12, { opacity: 255 }).to(0.12, { opacity: 35 }).to(0.18, { opacity: 255 }).start();
    }

    private playOrderBriefing(option: CouncilOption, onComplete: () => void): void {
        const lines: Record<CouncilKey, DialogueLine[]> = {
            raid: [
                {
                    speaker: '刘文静', role: '军府谋主', side: 'right', portrait: 'redesign/liu-wenjing-optimized/texture',
                    text: '斥候回报：井陉北坡有旧樵道，可绕开正面关城。但山雨将至，先锋只得一夜时辰。'
                },
                {
                    speaker: '李世民', role: '出征主将', side: 'left', portrait: 'redesign/li-shimin/texture',
                    text: '一夜足矣。轻骑衔枚，火把尽熄；天明之前，我要唐旗立在井陉关头。'
                }
            ],
            defend: [
                {
                    speaker: '刘文静', role: '军府谋主', side: 'right', portrait: 'redesign/liu-wenjing-optimized/texture',
                    text: '敌军游骑已过汾水。闭城只是第一步，还须迁粮入仓、毁去城外可资敌军之物。'
                },
                {
                    speaker: '李世民', role: '出征主将', side: 'left', portrait: 'redesign/li-shimin/texture',
                    text: '传令诸营轮守四门，我亲巡城防。太原不失，关中便仍有一支生力军。'
                }
            ],
            pacify: [
                {
                    speaker: '刘文静', role: '军府谋主', side: 'right', portrait: 'redesign/liu-wenjing-optimized/texture',
                    text: '河东父老所惧者并非唐军，而是兵过之后田庐尽毁。若明示军纪，乡勇自然归心。'
                },
                {
                    speaker: '李世民', role: '出征主将', side: 'left', portrait: 'redesign/li-shimin/texture',
                    text: '张榜安民，秋毫无犯。愿从军者编入府兵，愿归田者发粮护送。'
                }
            ]
        };
        this.showDialogue(lines[option.key], 0, onComplete, `军令确认 · ${option.title}${option.target}`);
    }

    private showDialogue(lines: DialogueLine[], index: number, onComplete: () => void, sceneTitle: string): void {
        this.removeGuide();
        const line = lines[index];
        if (!line) return onComplete();

        const layer = this.container(this.node, `Dialogue_${index + 1}`, this.width, this.height, 30);
        layer.setPosition(0, 0, 30);
        layer.on(Node.EventType.TOUCH_START, () => undefined, this);
        layer.on(Node.EventType.TOUCH_END, () => undefined, this);
        this.guideLayer = layer;
        this.image(layer, 'DialogueMap', 'redesign/war-map-landscape/texture', this.width, this.height, 0, 0, 0);
        this.rect(layer, 'DialogueShade', this.width, this.height, new Color(4, 4, 4, 212), 0, 0);
        this.panel(layer, 'DialogueTop', this.width, 54, new Color(13, 12, 10, 236), 0, this.height / 2 - 27, 0, C.bronzeSoft, false);
        this.label(layer, sceneTitle, 16, C.gold, -this.width / 2 + 220, this.height / 2 - 27, 380, 24, true, HorizontalTextAlignment.LEFT);
        this.label(layer, `${index + 1} / ${lines.length}`, 11, C.muted, this.width / 2 - 170, this.height / 2 - 27, 64, 20, true);

        const portraitX = line.side === 'left' ? -286 : 286;
        const portrait = this.image(layer, `DialoguePortrait_${line.speaker}`, line.portrait, 176, 176, portraitX, 35, 4);
        const portraitOpacity = portrait.addComponent(UIOpacity);
        portraitOpacity.opacity = 0;
        portrait.setScale(0.9, 0.9, 1);
        tween(portrait).to(0.34, { scale: Vec3.ONE }, { easing: 'backOut' }).start();
        tween(portraitOpacity).to(0.28, { opacity: 255 }).start();

        const card = this.skinnedPanel(layer, 'DialogueCard', 650, 126, 0, -105, 'panel', 7, C.bronze);
        card.setScale(0.97, 0.97, 1);
        tween(card).to(0.2, { scale: Vec3.ONE }, { easing: 'cubicOut' }).start();
        const nameX = line.side === 'left' ? -235 : 140;
        this.label(card, line.speaker, 20, C.gold, nameX, 41, 150, 28, true, HorizontalTextAlignment.LEFT);
        this.label(card, line.role, 11, C.muted, nameX + 153, 41, 190, 22, false, HorizontalTextAlignment.LEFT);
        this.label(card, line.text, 15, C.paper, -7, 0, 604, 51, false, HorizontalTextAlignment.LEFT);
        this.label(card, '点击“继续”推进剧情', 10, C.bronze, -217, -44, 180, 18, false, HorizontalTextAlignment.LEFT);

        const next = () => {
            if (index >= lines.length - 1) {
                this.removeGuide();
                onComplete();
            } else {
                this.showDialogue(lines, index + 1, onComplete, sceneTitle);
            }
        };
        this.button(card, 'DialogueNext', index === lines.length - 1 ? '下达军令' : '继续', 260, -42, 100, 30, next);
        const skip = this.button(layer, 'DialogueSkip', '跳过对话', this.width / 2 - 64, this.height / 2 - 27, 104, 28, () => {
            this.removeGuide();
            onComplete();
        });
        const skipLabel = skip.children.find((child) => child.getComponent(Label))?.getComponent(Label);
        if (skipLabel) skipLabel.color = C.muted;
    }

    private playBattleSequence(option: CouncilOption, outcome: BattleOutcome, onComplete: () => void): void {
        this.removeCinematic();
        this.toastNode.active = false;
        const layer = this.container(this.node, 'BattleCinematic', this.width, this.height, 28);
        layer.setPosition(0, 0, 28);
        layer.on(Node.EventType.TOUCH_START, () => undefined, this);
        layer.on(Node.EventType.TOUCH_END, () => undefined, this);
        this.cinematicLayer = layer;

        this.image(layer, 'BattleMap', 'redesign/war-map-landscape/texture', this.width, this.height, 0, 0, 0);
        this.rect(layer, 'BattleShade', this.width, this.height, new Color(4, 4, 3, 154), 0, 0);
        this.panel(layer, 'BattleTop', this.width, 54, new Color(13, 12, 10, 246), 0, this.height / 2 - 27, 0, C.bronzeSoft, false);
        this.label(layer, `军令执行 · ${option.title}${option.target}`, 18, C.gold, -this.width / 2 + 210, this.height / 2 - 27, 370, 28, true, HorizontalTextAlignment.LEFT);
        const phaseLabel = this.label(layer, '先锋出营', 13, C.paper, 145, this.height / 2 - 27, 240, 24, true, HorizontalTextAlignment.RIGHT);

        const stage = this.panel(layer, 'BattleStage', this.width - 46, 245, new Color(12, 11, 9, 116), 0, -1, 5, C.bronzeSoft, false);
        const road = new Node('MarchRoad');
        road.layer = Layers.Enum.UI_2D;
        road.addComponent(UITransform).setContentSize(this.width - 100, 130);
        const roadGraphics = road.addComponent(Graphics);
        roadGraphics.lineWidth = 4;
        roadGraphics.strokeColor = C.gold;
        roadGraphics.moveTo(-300, -25);
        roadGraphics.bezierCurveTo(-150, 52, 50, -45, 292, 23);
        roadGraphics.stroke();
        stage.addChild(road);

        this.label(stage, '太原', 14, C.paper, -305, -55, 82, 24, true);
        this.label(stage, option.target, 14, C.gold, 300, 53, 100, 24, true);
        const unit = this.image(stage, 'TangVanguard', 'redesign/icons/step-march/texture', 48, 48, -300, -23, 5);
        const enemy = this.image(stage, 'EnemyFormation', 'redesign/icons/step-battle/texture', 54, 54, 285, 18, 5);
        const enemyGlow = enemy.addComponent(UIOpacity);
        enemyGlow.opacity = 210;
        tween(enemy).to(0.5, { scale: new Vec3(1.08, 1.08, 1) }).to(0.5, { scale: Vec3.ONE }).union().repeatForever().start();

        const phases = option.key === 'raid'
            ? ['轻骑出营', '穿越太行', '突入敌阵', '战果回报']
            : option.key === 'defend'
                ? ['关闭城门', '迁粮清野', '巡营整军', '防线结算']
                : ['使者出城', '宣示军纪', '乡勇归附', '安抚结算'];
        phases.forEach((phase, i) => {
            const x = -246 + i * 164;
            const item = this.panel(layer, `BattlePhase_${i}`, 142, 31, new Color(25, 22, 18, 236), x, -this.height / 2 + 31, T.radius.control, C.bronzeSoft, false);
            this.label(item, `${i + 1}  ${phase}`, 11, i === 0 ? C.gold : C.muted, 0, 0, 132, 20, true);
        });

        const flash = this.rect(layer, 'BattleFlash', this.width, this.height, C.paper, 0, 0, 0);
        const flashOpacity = flash.addComponent(UIOpacity);
        flashOpacity.opacity = 0;
        const result = this.skinnedPanel(layer, 'BattleResult', 620, 188, 0, -3, 'panel', 8, outcome.tone === 'bad' ? C.red : C.gold);
        result.active = false;
        this.label(result, outcome.tone === 'bad' ? '军情急报' : '捷报', 15, outcome.tone === 'bad' ? C.red : C.gold, 0, 64, 130, 24, true);
        this.label(result, outcome.title, 27, C.paper, 0, 28, 540, 38, true);
        this.label(result, outcome.body, 14, C.muted, 0, -14, 540, 42, false);
        this.label(result, `粮秣 ${option.food.toLocaleString()} · 季节将推进一回合`, 11, C.bronze, -88, -56, 280, 20, true);

        let revealed = false;
        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            this.removeCinematic();
            onComplete();
        };
        this.button(result, 'CollectReport', '收取战报', 220, -57, 124, 32, finish);

        const skip = this.button(layer, 'SkipBattle', '跳过演出', this.width / 2 - 64, this.height / 2 - 27, 104, 28, () => revealResult());
        const revealResult = () => {
            if (revealed) return;
            revealed = true;
            Tween.stopAllByTarget(layer);
            Tween.stopAllByTarget(unit);
            Tween.stopAllByTarget(enemy);
            Tween.stopAllByTarget(flashOpacity);
            stage.active = false;
            enemy.active = false;
            unit.active = false;
            skip.active = false;
            phaseLabel.string = outcome.tone === 'bad' ? '伏兵突现 · 收拢残军' : '军令完成 · 战报送达';
            result.active = true;
            result.setScale(0.82, 0.82, 1);
            const resultOpacity = result.addComponent(UIOpacity);
            resultOpacity.opacity = 0;
            tween(result).to(0.28, { scale: Vec3.ONE }, { easing: 'backOut' }).start();
            tween(resultOpacity).to(0.2, { opacity: 255 }).start();
        };

        const speed = this.settings.fastText ? 0.58 : 1;
        tween(unit)
            .to(0.72 * speed, { position: new Vec3(-116, 28, 5) }, { easing: 'sineInOut' })
            .to(0.7 * speed, { position: new Vec3(92, -10, 5) }, { easing: 'sineInOut' })
            .to(0.58 * speed, { position: new Vec3(250, 15, 5) }, { easing: 'quadIn' })
            .start();
        tween(layer)
            .delay(0.62 * speed).call(() => { if (!revealed) phaseLabel.string = phases[1]; })
            .delay(0.72 * speed).call(() => { if (!revealed) phaseLabel.string = phases[2]; })
            .delay(0.54 * speed).call(() => {
                if (revealed) return;
                tween(flashOpacity).to(0.05, { opacity: 220 }).to(0.2, { opacity: 0 }).start();
                tween(stage).to(0.05, { position: new Vec3(-5, -1, 0) }).to(0.05, { position: new Vec3(6, -1, 0) }).to(0.08, { position: new Vec3(0, -1, 0) }).start();
            })
            .delay(0.58 * speed).call(() => { if (!revealed) revealResult(); })
            .start();
    }

    private removeCinematic(): void {
        if (!this.cinematicLayer?.isValid) {
            this.cinematicLayer = null;
            return;
        }
        Tween.stopAllByTarget(this.cinematicLayer);
        this.cinematicLayer.destroy();
        this.cinematicLayer = null;
    }

    private showOpening(force = false): void {
        if (!force && sys.localStorage.getItem(ONBOARDING_KEY) === 'done') return;
        this.removeGuide();
        const layer = this.container(this.node, 'OpeningSequence', this.width, this.height, 30);
        layer.setPosition(0, 0, 30);
        layer.on(Node.EventType.TOUCH_START, () => undefined, this);
        layer.on(Node.EventType.TOUCH_END, () => undefined, this);
        this.guideLayer = layer;

        this.image(layer, 'OpeningMap', 'redesign/war-map-landscape/texture', this.width, this.height, 0, 0, 0);
        this.rect(layer, 'OpeningShade', this.width, this.height, new Color(4, 4, 4, 218), 0, 0);
        this.skinnedPanel(layer, 'OpeningPanel', 590, 300, 48, -2, 'panel', 8, C.bronze);
        this.image(layer, 'OpeningCommander', 'redesign/li-shimin/texture', 154, 154, -260, 18, 4);
        this.label(layer, '序章 · 太原起兵', 14, C.gold, 60, 120, 410, 22, true, HorizontalTextAlignment.LEFT);
        this.label(layer, '大业十三年，隋失其鹿', 31, C.paper, 60, 79, 420, 43, true, HorizontalTextAlignment.LEFT);
        this.label(
            layer,
            '四海饥乱，群雄并起。\n李渊据太原，李世民请兵西进。\n此刻你执掌军帐：选军议、算粮道、定行止。\n每一道军令，都会改变大唐的开局。',
            15,
            C.muted,
            88,
            9,
            476,
            88,
            false,
            HorizontalTextAlignment.LEFT
        );
        this.label(layer, '进入后将开启军帐音乐', 11, C.bronze, 118, -60, 260, 19);
        this.button(layer, 'EnterCouncil', '进入军帐', 92, -108, 176, 42, () => {
            this.removeGuide();
            this.showDialogue(PROLOGUE_DIALOGUE, 0, () => this.showTutorial(0), '军帐夜议');
        });
        const skip = this.button(layer, 'SkipOpening', '直接开始', 275, -108, 112, 34, () => this.finishTutorial());
        const skipLabel = skip.children.find((child) => child.getComponent(Label))?.getComponent(Label);
        if (skipLabel) skipLabel.color = C.muted;
    }

    private showTutorial(step: number): void {
        this.removeGuide();
        const steps = [
            {
                title: '第一步 · 选择军议',
                body: '右侧三项军议会改变目标、耗粮和胜算。先比较后果，再决定本回合的行动。金框按钮与右缘箭头之处皆可点击。',
                focus: { x: this.width / 2 - 97, y: 0, w: 184, h: 178 },
                card: { x: -128, y: 56 }
            },
            {
                title: '第二步 · 看懂作战进程',
                body: '底部依次展示起点、整军、地形、行军、目标、胜算和粮耗。红色数字代表代价。',
                focus: { x: -this.width / 2 + this.mapWidth / 2, y: -this.height / 2 + 46, w: this.mapWidth - 10, h: 84 },
                card: { x: 92, y: 58 }
            },
            {
                title: '第三步 · 长按传令',
                body: '确认路线后，长按右下方印信直至填满。军令发出才会推进季节、结算资源并生成战报。',
                focus: { x: this.width / 2 - 97, y: -this.height / 2 + 60, w: 104, h: 100 },
                card: { x: 88, y: 62 }
            }
        ] as const;
        const current = steps[step];
        if (!current) return this.finishTutorial();
        const layer = this.container(this.node, `Tutorial_${step + 1}`, this.width, this.height, 30);
        layer.setPosition(0, 0, 30);
        layer.on(Node.EventType.TOUCH_START, () => undefined, this);
        layer.on(Node.EventType.TOUCH_END, () => undefined, this);
        this.guideLayer = layer;
        this.buildSpotlight(layer, current.focus.x, current.focus.y, current.focus.w, current.focus.h);

        const card = this.skinnedPanel(layer, 'GuideCard', 366, 126, current.card.x, current.card.y, 'panel', 7, C.gold);
        this.label(card, current.title, 19, C.gold, -8, 35, 330, 27, true, HorizontalTextAlignment.LEFT);
        this.label(card, current.body, 13, C.paper, -8, 3, 330, 46, false, HorizontalTextAlignment.LEFT);
        this.label(card, `${step + 1} / ${steps.length}`, 11, C.muted, -142, -43, 54, 18, true);
        this.button(card, 'GuideNext', step === steps.length - 1 ? '开始指挥' : '下一步', 108, -42, 112, 30, () => {
            if (step === steps.length - 1) this.finishTutorial();
            else this.showTutorial(step + 1);
        });
        const skip = this.button(layer, 'SkipGuide', '跳过引导', this.width / 2 - 64, this.height / 2 - 26, 104, 30, () => this.finishTutorial());
        const label = skip.children.find((child) => child.getComponent(Label))?.getComponent(Label);
        if (label) label.color = C.muted;
    }

    private buildSpotlight(parent: Node, x: number, y: number, width: number, height: number): void {
        const left = -this.width / 2;
        const right = this.width / 2;
        const bottom = -this.height / 2;
        const top = this.height / 2;
        const x0 = x - width / 2 - 5;
        const x1 = x + width / 2 + 5;
        const y0 = y - height / 2 - 5;
        const y1 = y + height / 2 + 5;
        const shade = new Color(0, 0, 0, 184);
        if (top > y1) this.rect(parent, 'GuideShadeTop', this.width, top - y1, shade, 0, (top + y1) / 2);
        if (y0 > bottom) this.rect(parent, 'GuideShadeBottom', this.width, y0 - bottom, shade, 0, (y0 + bottom) / 2);
        if (x0 > left) this.rect(parent, 'GuideShadeLeft', x0 - left, y1 - y0, shade, (x0 + left) / 2, y);
        if (right > x1) this.rect(parent, 'GuideShadeRight', right - x1, y1 - y0, shade, (right + x1) / 2, y);
        this.rect(parent, 'GuideFocus', width + 10, height + 10, new Color(0, 0, 0, 0), x, y, 5, C.gold);
    }

    private finishTutorial(): void {
        sys.localStorage.setItem(ONBOARDING_KEY, 'done');
        this.removeGuide();
        this.showToast('军帐已就绪 · 先选择军议，再长按传令');
    }

    private removeGuide(): void {
        if (!this.guideLayer?.isValid) {
            this.guideLayer = null;
            return;
        }
        this.guideLayer.destroy();
        this.guideLayer = null;
    }

    private playIntro(): void {
        this.radialLayer.setScale(0.72, 0.72, 1);
        const opacity = this.radialLayer.addComponent(UIOpacity);
        opacity.opacity = 0;
        tween(this.radialLayer).delay(0.2).to(0.5, { scale: Vec3.ONE }, { easing: 'backOut' }).start();
        tween(opacity).delay(0.2).to(0.35, { opacity: 255 }).start();
    }

    private button(parent: Node, name: string, text: string, x: number, y: number, width: number, height: number, onTap: () => void): Node {
        const node = this.skinnedPanel(parent, name, width, height, x, y, 'button', T.radius.control, C.bronzeSoft);
        this.label(node, text, 13, C.gold, 0, 0, width - 8, height - 4, true);
        node.on(Node.EventType.TOUCH_END, onTap, this);
        this.pressable(node);
        return node;
    }

    private container(parent: Node, name: string, width: number, height: number, z: number): Node {
        const node = new Node(name);
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform).setContentSize(width, height);
        node.setPosition(0, 0, z);
        parent.addChild(node);
        return node;
    }

    /** 清空容器但保留九宫格皮肤底图/阴影节点（以 _Skin/_Shadow 命名豁免，避免引用泄漏）。 */
    private clearChildren(node: Node): void {
        for (const child of node.children.slice()) {
            if (child.name.endsWith('_Skin') || child.name.endsWith('_Shadow')) continue;
            node.removeChild(child);
        }
    }

    /** 皮肤面板：大面板与按钮的 9-slice 贴图表面；贴图未就绪或尺寸过小时回退到 Graphics 立体面板。 */
    private skinnedPanel(parent: Node, name: string, width: number, height: number, x: number, y: number, skin: string, radius = 0, stroke?: Color, shadow = true): Node {
        const min = ({ panel: 48, card: 36, button: 28 } as Record<string, number>)[skin] ?? 36;
        if (width < min || height < min) {
            return this.panel(parent, name, width, height, C.panel, x, y, radius, stroke, shadow);
        }
        const wrapper = this.container(parent, name, width, height, 1);
        wrapper.setPosition(x, y, 1);
        if (shadow) {
            const sh = new Node(`${name}_Shadow`);
            sh.layer = Layers.Enum.UI_2D;
            sh.addComponent(UITransform).setContentSize(width, height);
            sh.setPosition(0, -2, 0);
            this.drawShadow(sh.addComponent(Graphics), width, height, radius);
            wrapper.addChild(sh);
        }
        const bg = this.panel(wrapper, `${name}_Skin`, width, height, C.panel, 0, 0, radius, stroke, false);
        if (this.panelSkins.has(skin)) this.applySkin(bg, skin);
        else this.pendingSkins.push({ node: bg, skin });
        return wrapper;
    }

    /** 皮肤底图：加载的 9-slice 贴图替换 Graphics（保留 UITransform 尺寸与子节点层次）。 */
    private applySkin(node: Node, skin: string): void {
        if (!node.isValid) return;
        const frame = this.panelSkins.get(skin);
        if (!frame) return;
        const g = node.getComponent(Graphics);
        if (g) node.removeComponent(g);
        const sprite = node.getComponent(Sprite) ?? node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.type = Sprite.Type.SLICED;
        sprite.spriteFrame = frame;
    }

    /** 预加载三套 9-slice 皮肤；加载完成后升级待定皮肤节点。 */
    private loadPanelSkins(): void {
        const skins: Array<[string, string, number]> = [
            ['panel', 'redesign/panels/panel-lacquer/texture', 20],
            ['card', 'redesign/panels/card-lacquer/texture', 14],
            ['button', 'redesign/panels/button-gold/texture', 10]
        ];
        for (const [key, path, border] of skins) {
            resources.load(path, Texture2D, (err, texture) => {
                if (err || !texture) return;
                const frame = new SpriteFrame();
                frame.texture = texture;
                frame.borderTop = border;
                frame.borderBottom = border;
                frame.borderLeft = border;
                frame.borderRight = border;
                frame.packable = false;
                this.panelSkins.set(key, frame);
                this.pendingSkins = this.pendingSkins.filter((item) => {
                    if (item.skin !== key) return true;
                    this.applySkin(item.node, key);
                    return false;
                });
            });
        }
    }

    /** 正式字体：双路径加载（裸路径 / /font 子资源），成功后应用到所有已建 label。 */
    private loadBodyFont(): void {
        const apply = (font: Font) => {
            this.bodyFont = font;
            this.labelRegistry = this.labelRegistry.filter((label) => {
                if (!label.isValid) return false;
                label.useSystemFont = false;
                label.font = font;
                return true;
            });
        };
        resources.load('fonts/lxgw-wenkai', Font, (err, font) => {
            if (!err && font) return apply(font);
            resources.load('fonts/lxgw-wenkai/font', Font, (err2, font2) => {
                if (!err2 && font2) apply(font2);
            });
        });
    }

    /** 面板阴影：两层半透明衰减圆角矩形（供 Graphics 底图与皮肤阴影节点共用）。 */
    private drawShadow(g: Graphics, width: number, height: number, radius: number): void {
        const hw = width / 2;
        const hh = height / 2;
        g.fillColor = T.shadowFar;
        this.fillRound(g, -hw - 3.5, -hh - 5.5, width + 7, height + 9, radius + 3);
        g.fillColor = T.shadowNear;
        this.fillRound(g, -hw - 1.5, -hh - 2.5, width + 3, height + 4, radius + 1.5);
    }

    /** 传令印信背后的烛光暖晕：置于按钮之下，常年轻微呼吸；长按传令时被 onHoldStart 增亮。 */
    private buildOrderGlow(panelH: number): void {
        this.orderGlow = this.image(this.reportPanel, 'OrderGlow', 'redesign/effects/glow-warm/texture', 150, 150, 0, -panelH / 2 + 54, 2);
        this.orderGlow.setSiblingIndex(this.orderButton.getSiblingIndex());
        this.orderGlowOpacity = this.orderGlow.addComponent(UIOpacity);
        this.startGlowFlicker();
    }

    private startGlowFlicker(): void {
        if (!this.orderGlowOpacity) return;
        Tween.stopAllByTarget(this.orderGlowOpacity);
        this.orderGlowOpacity.opacity = 80;
        tween(this.orderGlowOpacity)
            .to(0.16, { opacity: 96 }).to(0.12, { opacity: 140 }).to(0.2, { opacity: 108 })
            .to(0.14, { opacity: 168 }).to(0.18, { opacity: 122 })
            .union().repeatForever().start();
        tween(this.orderGlow!)
            .to(0.5, { scale: new Vec3(1.05, 1.05, 1) }).to(0.5, { scale: Vec3.ONE })
            .union().repeatForever().start();
    }

    /** 松开/结算后把烛光从高亮态复原为呼吸态。 */
    private restoreOrderGlow(): void {
        if (!this.orderGlow) return;
        Tween.stopAllByTarget(this.orderGlow);
        tween(this.orderGlow).to(0.25, { scale: Vec3.ONE }, { easing: T.ease.out }).start();
        this.startGlowFlicker();
    }

    /** 地图云影：半透明云团缓速漂移、错位起伏，赋予沙盘灵动。 */
    private buildCloudLayer(): void {
        this.driftCloud('云影_1', -72, 72, 250, 96, 0.26, 42);
        this.driftCloud('云影_2', 92, 18, 196, 76, 0.36, 30);
    }

    private driftCloud(name: string, x: number, y: number, width: number, height: number, dur: number, baseOpacity: number): void {
        const cloud = this.image(this.node, name, 'redesign/effects/cloud-soft/texture', width, height, x, y, 1);
        const op = cloud.addComponent(UIOpacity);
        op.opacity = baseOpacity;
        const travel = 48;
        tween(cloud)
            .to(dur, { position: new Vec3(x + travel, y + 7, 1) }, { easing: 'sineInOut' })
            .to(dur, { position: new Vec3(x, y, 1) }, { easing: 'sineInOut' })
            .union().repeatForever().start();
        tween(op)
            .to(dur * 1.4, { opacity: baseOpacity + 18 }).to(dur * 1.4, { opacity: baseOpacity })
            .union().repeatForever().start();
    }

    /** 选中扫光：金色软光条自左向右扫过卡片一次后销毁（边缘软渐变，无需裁剪）。 */
    private sweepHighlight(node: Node, width: number, height: number): void {
        const bar = this.image(node, 'SelectSweep', 'redesign/effects/sweep-gold/texture', 84, height, -width / 2 - 60, 0, 1);
        const op = bar.addComponent(UIOpacity);
        op.opacity = 0;
        tween(op).delay(0.04).to(0.2, { opacity: 200 }).to(0.16, { opacity: 0 }).start();
        tween(bar).delay(0.04).to(0.34, { position: new Vec3(width / 2 + 60, 0, 1) }, { easing: T.ease.out })
            .call(() => { if (bar.isValid) bar.destroy(); }).start();
    }

    /** 立体面板：在单个 Graphics 内按绘制顺序叠软阴影、填充、顶部光泽与内外双描边，视觉分层不增加 draw call。 */
    private panel(parent: Node, name: string, width: number, height: number, color: Color, x: number, y: number, radius = 0, stroke?: Color, shadow = true): Node {
        const node = new Node(name);
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform).setContentSize(width, height);
        const g = node.addComponent(Graphics);
        this.drawPanelBg(g, width, height, color, radius, stroke, shadow);
        node.setPosition(x, y, 1);
        parent.addChild(node);
        return node;
    }

    /** 面板底纹统一入口：阴影 -> 填充 -> 光泽带 -> 内亮描边（倒角高光）-> 外描边（金属边框或暗边）。 */
    private drawPanelBg(g: Graphics, width: number, height: number, fill: Color, radius: number, stroke: Color | undefined, shadow: boolean): void {
        const hw = width / 2;
        const hh = height / 2;
        if (shadow) this.drawShadow(g, width, height, radius);
        g.fillColor = fill;
        this.fillRound(g, -hw, -hh, width, height, radius);
        // 顶部光泽带：模拟漆面向上受光，只给足够大的实底面板，避免小块噪点
        if (height >= 30 && width >= 60 && fill.a >= 230) {
            const bandH = height * 0.46;
            g.fillColor = T.sheen;
            this.fillRound(g, -hw + 1, hh - bandH, width - 2, bandH - 1, Math.max(radius - 1, 0));
            g.fillColor = T.sheenTop;
            this.fillRound(g, -hw + 1, hh - height * 0.2, width - 2, height * 0.2 - 1, Math.max(radius - 1, 0));
        }
        g.strokeColor = T.bevel;
        g.lineWidth = 1;
        this.strokeRound(g, -hw + 0.5, -hh + 0.5, width - 1, height - 1, Math.max(radius - 0.5, 0));
        g.strokeColor = stroke ?? T.edge;
        g.lineWidth = stroke ? 1.5 : 1;
        this.strokeRound(g, -hw, -hh, width, height, radius);
    }

    private fillRound(g: Graphics, x: number, y: number, width: number, height: number, radius: number): void {
        if (radius > 0) g.roundRect(x, y, width, height, radius);
        else g.rect(x, y, width, height);
        g.fill();
    }

    private strokeRound(g: Graphics, x: number, y: number, width: number, height: number, radius: number): void {
        if (radius > 0) g.roundRect(x, y, width, height, radius);
        else g.rect(x, y, width, height);
        g.stroke();
    }

    /** 按压反馈：按下微缩，松手回弹；页面重建会让节点失效，逐处守卫。 */
    private pressable(node: Node): void {
        const rest = node.position.clone();
        const press = () => {
            if (!node.isValid) return;
            Tween.stopAllByTarget(node);
            tween(node).to(T.dur.fast, { scale: new Vec3(T.pressScale, T.pressScale, 1) }).start();
        };
        const release = () => {
            if (!node.isValid) return;
            Tween.stopAllByTarget(node);
            tween(node).to(T.dur.mid, { scale: Vec3.ONE }, { easing: T.ease.spring }).start();
            if (!node.position.equals(rest)) {
                tween(node).to(T.dur.mid, { position: rest.clone() }, { easing: T.ease.out }).start();
            }
        };
        node.on(Node.EventType.TOUCH_START, press, this);
        node.on(Node.EventType.TOUCH_END, release, this);
        node.on(Node.EventType.TOUCH_CANCEL, release, this);
    }

    /** 级联入场：仅 openPage 时生效（animatingEntrance 标记），操作后的局部刷新保持即时呈现。 */
    private entrance(node: Node, index: number): void {
        if (!this.animatingEntrance || !node.isValid) return;
        const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
        const rest = node.position.clone();
        node.setPosition(rest.x, rest.y - T.entranceRise, rest.z);
        opacity.opacity = 0;
        const delay = Math.min(index, 7) * T.stagger;
        tween(opacity).delay(delay).to(T.dur.slow, { opacity: 255 }, { easing: T.ease.sine }).start();
        tween(node).delay(delay).to(T.dur.slow, { position: rest }, { easing: T.ease.out }).start();
    }

    private rect(parent: Node, name: string, width: number, height: number, color: Color, x: number, y: number, radius = 0, stroke?: Color): Node {
        const node = new Node(name);
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform).setContentSize(width, height);
        const g = node.addComponent(Graphics);
        g.fillColor = color;
        if (radius > 0) g.roundRect(-width / 2, -height / 2, width, height, radius);
        else g.rect(-width / 2, -height / 2, width, height);
        g.fill();
        if (stroke) {
            g.strokeColor = stroke;
            g.lineWidth = 1.5;
            if (radius > 0) g.roundRect(-width / 2, -height / 2, width, height, radius);
            else g.rect(-width / 2, -height / 2, width, height);
            g.stroke();
        }
        node.setPosition(x, y, 1);
        parent.addChild(node);
        return node;
    }

    private image(parent: Node, name: string, path: string, width: number, height: number, x: number, y: number, z = 3): Node {
        const node = new Node(name);
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform).setContentSize(width, height);
        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        node.setPosition(x, y, z);
        parent.addChild(node);
        resources.load(path, Texture2D, (err, texture) => {
            if (err || !node.isValid) return;
            const frame = new SpriteFrame();
            frame.texture = texture;
            sprite.spriteFrame = frame;
        });
        return node;
    }

    private label(parent: Node, text: string, size: number, color: Color, x: number, y: number, width: number, height: number, bold = false, align = HorizontalTextAlignment.CENTER): Label {
        const node = new Node(`Text_${text.slice(0, 8)}`);
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform).setContentSize(width, height);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = size;
        label.lineHeight = Math.round(size * 1.28);
        label.color = color;
        label.useSystemFont = true;
        label.fontFamily = 'serif';
        label.isBold = bold;
        label.horizontalAlign = align;
        label.verticalAlign = VerticalTextAlignment.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        if (this.bodyFont) {
            label.useSystemFont = false;
            label.font = this.bodyFont;
        }
        this.labelRegistry.push(label);
        node.setPosition(x, y, 3);
        parent.addChild(node);
        return label;
    }
}

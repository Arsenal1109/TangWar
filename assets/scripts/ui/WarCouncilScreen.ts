import {
    _decorator,
    Color,
    Component,
    Font,
    game,
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
import { createDiplomacyState, performDiplo, type DiplomacyState, type DiploAction } from '../core/Diplomacy';
import { executeCouncilOrder, raidTarget, raidOdds, commandOf, COUNCIL_COSTS, type CouncilOutcome } from '../core/CommandSystem';
import { canMarch, createMarch, tickWorldMarches } from '../core/MarchSystem';
import { recruit } from '../core/Military';
import { applyPolicy } from '../core/PolicySystem';
import { buildFacility, facilityCost, facilityName, FACILITY_MAX, type FacilityType } from '../core/FacilitySystem';
import { sowDiscord, bribeGeneral, spreadRumor } from '../core/Stratagem';
import type { GeneralState } from '../core/GeneralSystem';
import type { CityState } from '../core/ResourceSystem';
import type { WorldState } from '../core/WorldState';
import { TurnManager } from '../core/TurnManager';
import { createWorld } from '../core/WorldState';
import { DIFFICULTY_ORDER, difficultyOf, applyDifficultyStart, type DifficultyId } from '../core/Difficulty';
import { FACTIONS } from '../data/Factions';
import { GENERALS } from '../data/Generals';
import { POLICIES } from '../data/Policies';
import { TROOP_ORDER, TROOPS, type TroopType } from '../data/Troops';
import { neighborsOf, getCity } from '../data/Cities';

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
    panelSoft: new Color(31, 27, 22, 252),
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
    private world!: WorldState;
    private diplomacy!: DiplomacyState;
    private width = 844;
    private height = 390;
    private mapWidth = 650;
    private safeLeft = 0;
    private safeRight = 0;
    private safeTop = 0;
    private safeBottom = 0;
    private topBarHeight = 42;
    private readonly railWidth = 194;
    private selected: CouncilKey = 'raid';
    private strategySelected = false;
    private selectedCityId = 'taiyuan';
    private selectedPolicyId: string | null = null;
    private selectedFactionId: string | null = null;
    private marchPanelOpen = false;
    private endingShown = false;
    private intelFilter: 'all' | '军情' | '急报' | '捷报' = 'all';
    private page: PageKey = 'world';
    private reportOpen = true;
    private reportCount = 3;
    private reports: ReportEntry[] = [
        { title: '井陉关战报（预测）', body: '守军约一万二千，山地奇袭可取得机动优势。', tone: 'normal' },
        { title: '幽州援军南下', body: '敌援约三旬抵达，宜在两回合内决断。', tone: 'bad' },
        { title: '河东乡勇请附', body: '若先安抚地方，可提升民心并获得兵源。', tone: 'good' }
    ];
    private eraLabel!: Label;
    private difficultyLabel!: Label;
    private headerNode!: Node;
    private resNumbers: Record<'food' | 'gold' | 'army' | 'morale', Label> = {} as Record<'food' | 'gold' | 'army' | 'morale', Label>;
    private toastLabel!: Label;
    private toastAccent: Node | null = null;
    private reportPanel!: Node;
    private reportBadge!: Label;
    private reportBody!: Node;
    private pagePanel!: Node;
    private pageContent!: Node;
    private pageMask: Node | null = null;
    private navNodes = new Map<PageKey, Node>();
    private councilNodes = new Map<CouncilKey, Node>();
    private routeLayer!: Node;
    private radialLayer!: Node;
    private timelineLayer!: Node;
    private mapTools!: Node;
    private toastNode!: Node;
    private orderButton!: Node;
    private orderInner!: Node;
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
    private cityCardStats: Label | null = null;
    private labelRegistry: Label[] = [];
    private panelSkins = new Map<string, SpriteFrame>();
    private pendingSkins: Array<{ node: Node; skin: string }> = [];

    init(turns: TurnManager, bus: EventBus<GameEvents>, states: CityState[], world?: WorldState): this {
        this.turns = turns;
        this.bus = bus;
        this.states = states;
        // 世界态（将领/外交/行军）由 Bootstrap 注入并随存档恢复；缺省时自建（预览/单测兜底）
        this.world = world ?? createWorld(617, states, [], createDiplomacyState('tang'));
        this.diplomacy = this.world.diplomacy;
        this.build();
        this.bus.on('turn-advanced', () => {
            this.refreshHeader();
            this.refreshCityCardStats();
            if (this.page !== 'world') this.renderPageAgain(this.page);
        });
        this.bus.on('world-events', (event) => {
            const isAlert = (msg: string) => msg.startsWith('急报');
            const joined = event.messages.slice(0, 2).join('；') || '各地暂无重大异动。';
            this.reports.unshift({
                title: event.title,
                body: joined,
                tone: event.messages.some(isAlert) ? 'bad' : 'normal'
            });
            if (event.messages.some(isAlert)) {
                this.showToast(event.messages.find(isAlert)!, 'bad');
                this.bus.emit('sfx', { name: 'alert' });
            }
            this.reportCount += 1;
            this.reportBadge.string = String(this.reportCount);
            this.refreshReport();
        });
        this.bus.on('game-ended', (event) => this.showEndingScreen(event.grade, event.message));
        return this;
    }

    update(dt: number): void {
        if (!this.holding || this.committed) return;
        this.holdTimer = Math.min(0.78, this.holdTimer + dt);
        const progress = this.holdTimer / 0.78;
        this.holdFill.setScale(progress, progress, 1);
        this.holdLabel.string = progress > 0.65 ? `即将下达\n${Math.round(progress * 100)}%` : `传令中\n${Math.round(progress * 100)}%`;
        if (progress >= 1) {
            this.holding = false;
            this.commitOrder();
        }
    }

    private build(): void {
        const visible = view.getVisibleSize();
        // 横屏画布保持全宽全高，刘海/挖孔只影响贴边控件，不再把整套 UI 压进安全区。
        // 之前把 safe rect 直接当成画布尺寸，会在刘海机上额外缩窄地图并制造黑边。
        const safe = sys.getSafeAreaRect();
        const fullW = visible.width;
        const fullH = visible.height;
        const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
        const sx = clamp(safe.x, 0, fullW);
        const sy = clamp(safe.y, 0, fullH);
        const sw = clamp(safe.width, 0, fullW - sx);
        const sh = clamp(safe.height, 0, fullH - sy);
        this.safeLeft = sx;
        this.safeRight = Math.max(0, fullW - (sx + sw));
        this.safeTop = Math.max(0, fullH - (sy + sh));
        this.safeBottom = sy;
        this.topBarHeight = 42 + Math.min(8, this.safeTop);
        this.width = fullW;
        this.height = fullH;
        this.mapWidth = this.width - this.railWidth;
        this.node.layer = Layers.Enum.UI_2D;
        this.node.addComponent(UITransform).setContentSize(this.width, this.height);
        this.node.setPosition(0, 0, 0);
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
        // 初次进入只展示作战预案，不默认下达军令；玩家必须明确点选策略后才能长按传令。
        this.strategySelected = false;
        this.buildRoute();
        this.refreshTimeline();
        this.refreshReport();
        this.refreshHeader();
        this.playIntro();
        // 新局（无档）先选难度再进序章；有档直接按存档难度开局。
        if (!this.hasSave) {
            this.showDifficultyChoice();
        } else {
            this.showOpening();
        }
    }

    /** 是否存在自动存档（决定新局难度弹窗是否出现）。 */
    private get hasSave(): boolean {
        return sys.localStorage.getItem('tangwar_save_v1') != null;
    }

    /** 新局难度选择：三张军令牌（休明/史实/虎狼），选定后立即建档并进入序章。 */
    private showDifficultyChoice(): void {
        this.removeGuide();
        const layer = this.container(this.node, 'DifficultyChoice', this.width, this.height, 32);
        layer.setPosition(0, 0, 32);
        layer.on(Node.EventType.TOUCH_START, () => undefined, this);
        layer.on(Node.EventType.TOUCH_END, () => undefined, this);
        this.guideLayer = layer;
        this.image(layer, 'DiffMap', 'redesign/war-map-landscape/texture', this.width, this.height, 0, 0, 0);
        this.rect(layer, 'DiffShade', this.width, this.height, new Color(4, 4, 4, 226), 0, 0);
        this.label(layer, '太原誓师 · 请定难度', 14, C.gold, 0, 128, 420, 22, true);
        this.label(layer, '不同难度下，群雄的野心与府库截然不同', 13, C.muted, 0, 104, 460, 20, true);
        DIFFICULTY_ORDER.forEach((id, i) => {
            const def = difficultyOf(id);
            const x = -186 + i * 186;
            const tone = id === 'hard' ? C.cinnabar : id === 'easy' ? C.green : C.gold;
            const card = this.panel(layer, `Diff_${id}`, 168, 148, new Color(22, 20, 17, 248), x, 8, T.radius.card, tone, false);
            this.rect(card, 'DiffAccent', 4, 116, tone, -76, 0, 2);
            this.label(card, def.name, 22, C.paper, 0, 48, 148, 30, true);
            this.label(card, def.desc, 10, C.muted, 0, 2, 140, 58, false);
            const tag = id === 'hard' ? '四面楚歌' : id === 'easy' ? '天命所归' : '逐鹿中原';
            this.label(card, tag, 11, tone, 0, -52, 148, 18, true);
            card.on(Node.EventType.TOUCH_END, () => {
                this.world.difficulty = id;
                applyDifficultyStart(this.world, id);
                this.bus.emit('difficulty-chosen', { difficulty: id });
                this.bus.emit('sfx', { name: 'diplomacy' });
                this.showToast(`难度已定：${def.name}`, 'normal');
                this.removeGuide();
                this.showOpening();
            }, this);
            this.pressable(card);
            this.entrance(card, i);
        });
        this.label(layer, '难度将写入存档，本局不可更改', 10, C.bronze, 0, -110, 420, 18, true);
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
        const worldH = this.height - this.topBarHeight - this.safeBottom;
        this.radialLayer = this.container(this.node, 'MapCommandLayer', this.mapWidth, worldH, 2);
        this.radialLayer.setPosition(-this.railWidth / 2, (this.safeBottom - this.topBarHeight) / 2, 2);
        this.buildCityMarker('云中', -145, 116, false);
        this.buildCityMarker('幽州', 83, 112, false);
        this.buildCityMarker('离石', -272, 73, false);
        // 平阳已在城池管理中展示；首页省略该标签，避免与太原详情卡和左侧工具栏重叠。
        this.buildCityMarker('邺城', 122, -27, false);
        this.buildCityMarker('井陉关', -4, 28, false, true);
        this.drawDangerZone();
    }

    private buildHeader(): void {
        const headerH = this.topBarHeight;
        const y = this.height / 2 - headerH / 2;
        const header = this.panel(this.node, 'TopBar', this.width, headerH, new Color(10, 10, 9, 250), 0, y, 0, C.bronzeSoft, false);
        this.headerNode = header;
        const contentY = -Math.min(6, this.safeTop * 0.5);
        const leftSafe = Math.max(23, this.safeLeft + 23);
        const seal = this.panel(header, 'TangSeal', 30, 30, C.cinnabar, -this.width / 2 + leftSafe, contentY, 15, C.gold);
        this.label(seal, '唐', 17, C.paper, 0, 0, 27, 25, true);
        this.eraLabel = this.label(header, '', 16, C.gold, -this.width / 2 + leftSafe + 98, contentY + 7, 160, 22, false, HorizontalTextAlignment.LEFT);
        this.difficultyLabel = this.label(header, '', 11, C.muted, -this.width / 2 + leftSafe + 98, contentY - 9, 160, 18, false, HorizontalTextAlignment.LEFT);
        this.buildResourceStrip(header, contentY);
        this.rect(header, 'TopBarRule', this.width - 12, 1, new Color(226, 190, 111, 76), 0, -headerH / 2 + 2);
    }

    /** 顶栏资源条：四项「印章字符 + 色值数字」格子，替代纯文本，提升信息层级（保持数字滚动）。 */
    private buildResourceStrip(header: Node, y = 0): void {
        const cells: Array<{ key: 'food' | 'gold' | 'army' | 'morale'; char: string; color: Color; x: number }> = [
            { key: 'food', char: '粮', color: C.gold, x: -126 },
            { key: 'gold', char: '金', color: C.gold, x: -42 },
            { key: 'army', char: '兵', color: C.paper, x: 42 },
            { key: 'morale', char: '心', color: C.green, x: 126 }
        ];
        for (const cell of cells) {
            const seal = this.panel(header, `ResSeal_${cell.key}`, 20, 20, C.panelSoft, cell.x - 32, y, 5, C.bronzeSoft);
            this.label(seal, cell.char, 12, C.gold, 0, 0, 18, 18, true);
            this.resNumbers[cell.key] = this.label(header, '0', 14, cell.color, cell.x + 10, y, 52, 24, true);
        }
    }

    private buildWorldControls(): void {
        this.buildRadialCouncil();
        this.buildRoute();
        this.buildCampaignTimeline();
        const battleY = this.height / 2 - this.topBarHeight - 82;
        const battleTab = this.panel(this.node, 'BattleReportTab', 48, 62, new Color(20, 18, 15, 248), -this.width / 2 + this.mapWidth - 26, battleY, T.radius.chip, C.bronzeSoft);
        this.label(battleTab, '战报', 14, C.gold, 0, 11, 42, 23, true);
        this.rect(battleTab, 'BadgeBg', 20, 20, C.cinnabar, 0, -18, 10);
        this.reportBadge = this.label(battleTab, String(this.reportCount), 11, C.paper, 0, -18, 18, 18, true);
        battleTab.on(Node.EventType.TOUCH_END, () => this.openPage('intel'), this);
        this.pressable(battleTab);
    }

    private buildRadialCouncil(): void {
        const center = this.panel(this.radialLayer, 'Taiyuan', 72, 34, C.cinnabar, -76, 77, T.radius.chip, C.gold);
        this.label(center, '太原', 20, C.paper, 0, 0, 62, 29, true);
        this.selectionReticle(this.radialLayer, 'CityPulse', -76, 77, 44, C.gold);
        const card = this.panel(this.radialLayer, 'TaiyuanDetail', 158, 96, new Color(20, 18, 15, 246), -99, -7, T.radius.card, C.bronzeSoft);
        // 城池名由上方地图"太原"标记承担，卡内不再重复标题，避免与别处"太原"叠字
        this.rect(card, 'CityCardAccent', 4, 30, C.cinnabar, -72, 19, 2);
        this.label(card, '我方城池', 13, C.gold, -8, 29, 124, 21, true);
        this.cityCardStats = this.label(card, '', 10, C.paper, -5, 2, 138, 34, false, HorizontalTextAlignment.LEFT);
        this.refreshCityCardStats();
        this.button(card, 'CityRecruit', '调兵', -38, -34, 62, 23, () => this.openPage('army'));
        this.button(card, 'CityManage', '城内', 38, -34, 62, 23, () => this.openPage('cities'));
    }

    /** 主战页城池卡实时数据：所选唐城的守军/城防/粮草。 */
    private refreshCityCardStats(): void {
        if (!this.cityCardStats) return;
        const city = this.states.find((c) => c.id === this.selectedCityId && c.faction === 'tang')
            ?? this.states.find((c) => c.id === 'taiyuan');
        if (!city) return;
        const general = city.generalId ? GENERALS.find((g) => g.id === city.generalId) : null;
        this.cityCardStats.string = `守军 ${city.army.toLocaleString()}   城防 ${city.defense}\n粮 ${Math.round(city.food).toLocaleString()}   守将 ${general ? general.name : '无'}`;
    }

    private buildCampaignTimeline(): void {
        const bottom = -this.height / 2 + this.safeBottom + 4;
        this.timelineLayer = this.panel(this.node, 'CampaignTimeline', this.mapWidth - 10, 84, new Color(17, 16, 14, 248), -this.width / 2 + this.mapWidth / 2, bottom + 42, T.radius.control, C.bronzeSoft, false);
        this.refreshTimeline();
    }

    private refreshTimeline(): void {
        if (!this.timelineLayer) return;
        this.clearChildren(this.timelineLayer);
        const option = this.currentOption();
        this.label(this.timelineLayer, this.strategySelected ? `${option.title}${option.target}` : '待定军议', 14, C.gold, -216, 28, 160, 21, true, HorizontalTextAlignment.LEFT);
        this.label(this.timelineLayer, this.strategySelected ? option.detail : '请选择右侧军议后再传令', 9, this.strategySelected ? C.muted : C.gold, -38, 28, 190, 18, false, HorizontalTextAlignment.LEFT);
        const milestones = [
            ['太原', '起点', 'step-origin'],
            ['整军', '1回合', 'step-march'],
            ['行军', `${option.turns}回合`, 'step-travel'],
            [option.target, '目标', 'step-target'],
            ['结算', option.key === 'raid' ? '遭遇敌军' : '军议结算', 'step-event']
        ];
        const trackW = this.mapWidth - 44;
        const stepW = trackW / milestones.length;
        const line = this.rect(this.timelineLayer, 'ProgressLine', trackW - stepW, 2, new Color(226, 190, 111, 120), 0, 1);
        const skinsCount = this.timelineLayer.children.filter((child) => child.name.endsWith('_Skin') || child.name.endsWith('_Shadow')).length;
        line.setSiblingIndex(skinsCount);
        milestones.forEach(([title, value, icon], index) => {
            const x = -trackW / 2 + stepW / 2 + index * stepW;
            const selected = this.strategySelected && index === 3;
            if (selected) this.panel(this.timelineLayer, 'TargetStep', stepW - 8, 37, new Color(97, 45, 31, 242), x, 0, T.radius.chip, C.gold, false);
            this.image(this.timelineLayer, `TimelineIcon_${icon}`, `redesign/icons/${icon}/texture`, 18, 18, x - stepW / 2 + 15, 0, 4);
            this.label(this.timelineLayer, title, 10, selected ? C.paper : C.muted, x + 8, 8, stepW - 32, 16, selected);
            this.label(this.timelineLayer, value, 10, selected ? C.gold : C.paper, x + 8, -9, stepW - 32, 16, true);
        });
        const terrain = option.key === 'raid' ? '山地' : '平原';
        const odds = option.key === 'raid' ? raidOdds(this.world, this.selectedCityId) : option.odds;
        this.label(this.timelineLayer, `地形 ${terrain}    胜算 ${odds}%    粮耗 ${option.food}`, 10, C.muted, 31, -29, 286, 17, true, HorizontalTextAlignment.RIGHT);
    }

    private buildRoute(): void {
        this.routeLayer.removeAllChildren();
        const option = this.currentOption();
        const start = new Vec3(-173, 57, 0);
        const end = option.key === 'defend' ? new Vec3(-173, 57, 0)
            : option.key === 'raid' ? new Vec3(-4, 28, 0)
                : new Vec3(-252, -16, 0);
        if (this.strategySelected && option.key === 'defend') return;

        const controlA = new Vec3(start.x + 55, start.y + 25, 0);
        const controlB = new Vec3(end.x - 75, end.y + 28, 0);
        const drawCurve = (g: Graphics): void => {
            g.moveTo(start.x, start.y);
            g.bezierCurveTo(controlA.x, controlA.y, controlB.x, controlB.y, end.x, end.y);
            g.stroke();
        };
        const activeColor = this.strategySelected
            ? option.key === 'raid' ? new Color(213, 81, 57, 255) : C.gold
            : new Color(190, 170, 132, 170);

        // 三层线稿：深色压边让路线从地图纹理中脱出，柔光和主线共同替代刺眼粗红线。
        const shadow = new Node('RouteShadow');
        shadow.layer = Layers.Enum.UI_2D;
        shadow.addComponent(UITransform).setContentSize(this.width, this.height);
        const shadowG = shadow.addComponent(Graphics);
        shadowG.strokeColor = new Color(8, 7, 6, 180);
        shadowG.lineWidth = 8;
        shadowG.lineCap = Graphics.LineCap.ROUND;
        drawCurve(shadowG);
        this.routeLayer.addChild(shadow);

        const glow = new Node('RouteGlow');
        glow.layer = Layers.Enum.UI_2D;
        glow.addComponent(UITransform).setContentSize(this.width, this.height);
        const glowG = glow.addComponent(Graphics);
        glowG.strokeColor = new Color(activeColor.r, activeColor.g, activeColor.b, this.strategySelected ? 88 : 48);
        glowG.lineWidth = this.strategySelected ? 7 : 5;
        glowG.lineCap = Graphics.LineCap.ROUND;
        drawCurve(glowG);
        this.routeLayer.addChild(glow);

        const route = new Node('RouteStroke');
        route.layer = Layers.Enum.UI_2D;
        route.addComponent(UITransform).setContentSize(this.width, this.height);
        const g = route.addComponent(Graphics);
        g.strokeColor = activeColor;
        g.lineWidth = this.strategySelected ? 2.6 : 1.8;
        g.lineCap = Graphics.LineCap.ROUND;
        drawCurve(g);
        // 末端箭镞只在已选军议时出现，避免待定状态产生误导。
        if (this.strategySelected) {
            const angle = Math.atan2(end.y - controlB.y, end.x - controlB.x);
            const wing = 5;
            const length = 10;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            g.moveTo(end.x, end.y);
            g.lineTo(end.x - cos * length + sin * wing, end.y - sin * length - cos * wing);
            g.moveTo(end.x, end.y);
            g.lineTo(end.x - cos * length - sin * wing, end.y - sin * length + cos * wing);
            g.stroke();
        }
        this.routeLayer.addChild(route);
        const opacity = route.addComponent(UIOpacity);
        opacity.opacity = this.strategySelected ? 230 : 140;
        tween(opacity).to(0.9, { opacity: this.strategySelected ? 255 : 175 }).to(0.9, { opacity: this.strategySelected ? 190 : 120 }).union().repeatForever().start();
        // 路线摘要已合并到底部作战进程，地图上只保留路径和节点，避免与城池标签重叠。
        if (this.strategySelected && option.key !== 'defend') {
            const pointAt = (t: number): Vec3 => {
                const u = 1 - t;
                return new Vec3(
                    u * u * u * start.x + 3 * u * u * t * controlA.x + 3 * u * t * t * controlB.x + t * t * t * end.x,
                    u * u * u * start.y + 3 * u * u * t * controlA.y + 3 * u * t * t * controlB.y + t * t * t * end.y,
                    0
                );
            };
            for (let i = 0; i < 7; i += 1) {
                const point = pointAt((i + 1) / 8);
                const pulse = new Node(`March_${i}`);
                pulse.layer = Layers.Enum.UI_2D;
                pulse.addComponent(UITransform).setContentSize(10, 10);
                pulse.setPosition(point.x, point.y, 3);
                const pg = pulse.addComponent(Graphics);
                pg.fillColor = new Color(244, 202, 116, 235);
                pg.circle(0, 0, i === 3 ? 3.4 : 2.4);
                pg.fill();
                this.routeLayer.addChild(pulse);
                const po = pulse.addComponent(UIOpacity);
                po.opacity = 55;
                tween(po).delay(i * 0.11).to(0.28, { opacity: 255 }).to(0.52, { opacity: 55 }).union().repeatForever().start();
            }
        }
    }

    private drawDangerZone(): void {
        const zone = new Node('DangerZone');
        zone.layer = Layers.Enum.UI_2D;
        zone.addComponent(UITransform).setContentSize(this.mapWidth, this.height);
        zone.setPosition(0, 0, 0);
        const g = zone.addComponent(Graphics);
        g.fillColor = new Color(130, 42, 33, 38);
        g.moveTo(-270, 108);
        g.lineTo(-175, 145);
        g.lineTo(-72, 112);
        g.lineTo(6, 36);
        g.lineTo(-36, -72);
        g.lineTo(-172, -92);
        g.lineTo(-286, -37);
        g.lineTo(-270, 108);
        g.fill();
        g.strokeColor = new Color(205, 73, 52, 96);
        g.lineWidth = 1.4;
        g.stroke();
        const opacity = zone.addComponent(UIOpacity);
        this.node.addChild(zone);
        zone.setSiblingIndex(2);
        opacity.opacity = 175;
        tween(opacity).to(1.4, { opacity: 230 }).to(1.4, { opacity: 175 }).union().repeatForever().start();
    }

    /** 地图选中态：双层细环与四角刻线，替代厚重的单圈放大动画。 */
    private selectionReticle(parent: Node, name: string, x: number, y: number, radius: number, accent: Color): Node {
        const reticle = new Node(name);
        reticle.layer = Layers.Enum.UI_2D;
        reticle.addComponent(UITransform).setContentSize(radius * 2 + 20, radius * 2 + 20);
        reticle.setPosition(x, y, 2);
        const g = reticle.addComponent(Graphics);
        g.strokeColor = new Color(accent.r, accent.g, accent.b, 155);
        g.lineWidth = 1.5;
        g.circle(0, 0, radius);
        g.stroke();
        g.strokeColor = new Color(accent.r, accent.g, accent.b, 65);
        g.lineWidth = 1;
        g.circle(0, 0, Math.max(8, radius - 7));
        const tick = Math.max(8, radius * 0.2);
        const inset = radius * 0.72;
        for (const sx of [-1, 1]) {
            for (const sy of [-1, 1]) {
                g.moveTo(sx * inset, sy * inset - sy * tick);
                g.lineTo(sx * inset, sy * inset);
                g.lineTo(sx * inset - sx * tick, sy * inset);
            }
        }
        g.stroke();
        parent.addChild(reticle);
        const opacity = reticle.addComponent(UIOpacity);
        opacity.opacity = 205;
        tween(reticle).to(1.15, { scale: new Vec3(1.035, 1.035, 1) }).to(1.15, { scale: Vec3.ONE }).union().repeatForever().start();
        tween(opacity).to(1.15, { opacity: 110 }).to(1.15, { opacity: 205 }).union().repeatForever().start();
        return reticle;
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
            // 目标城池可点（切换突袭军议）：用细环、内环与四角刻线提示。
            this.selectionReticle(this.node, 'TargetRing', x, y, 27, C.gold);
        }
        const color = target ? C.cinnabar : own ? new Color(90, 62, 38, 245) : new Color(36, 48, 47, 240);
        const marker = this.panel(this.node, `City_${name}`, target ? 76 : 61, 27, color, x, y, T.radius.chip, target ? C.gold : C.bronzeSoft);
        this.label(marker, name, target ? 14 : 13, C.paper, 0, 0, target ? 70 : 55, 22, true);
        marker.on(Node.EventType.TOUCH_END, () => target ? this.selectCouncil('raid') : this.showToast(`${name} · ${own ? '我方城池' : '斥候资料已更新'}`), this);
        this.pressable(marker);
    }

    private buildReportDrawer(): void {
        const panelW = this.railWidth;
        const panelH = this.height - this.topBarHeight - this.safeBottom - 4;
        const panelY = (this.safeBottom - this.topBarHeight) / 2;
        const panelTop = panelH / 2;
        const actionY = -panelH / 2 + 52 + Math.min(12, this.safeBottom);
        const orderY = actionY + 10;
        // 战报栏属于首页主版心，必须贴住画布右缘；安全区只用于左侧贴边工具，
        // 不再把整块栏向内推，避免刘海机上出现明显空隙。
        const rightGap = 2;
        this.reportPanel = this.panel(this.node, 'CouncilRail', panelW, panelH, new Color(17, 16, 14, 252), this.width / 2 - panelW / 2 - rightGap, panelY, T.radius.control, C.bronzeSoft, false);
        const portrait = new Node('LiShiminPortrait');
        portrait.layer = Layers.Enum.UI_2D;
        portrait.addComponent(UITransform).setContentSize(52, 52);
        const sprite = portrait.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        portrait.setPosition(-55, panelTop - 31, 2);
        this.reportPanel.addChild(portrait);
        resources.load('redesign/li-shimin/texture', Texture2D, (err, texture) => {
            if (err) return;
            const frame = new SpriteFrame();
            frame.texture = texture;
            sprite.spriteFrame = frame;
        });
        this.label(this.reportPanel, '李世民', 18, C.paper, 29, panelTop - 24, 96, 25, true);
        this.label(this.reportPanel, '出征主将', 11, C.gold, 29, panelTop - 44, 96, 18, true);
        this.rect(this.reportPanel, 'CommanderRule', panelW - 12, 1, C.bronzeSoft, 0, panelTop - 61);
        this.label(this.reportPanel, '兵力\n8,000', 11, C.paper, -59, panelTop - 80, 54, 32, true);
        this.label(this.reportPanel, '行军\n2回合', 11, C.paper, 0, panelTop - 80, 54, 32, true);
        this.label(this.reportPanel, '胜率\n68%', 11, C.gold, 59, panelTop - 80, 54, 32, true);
        this.reportBody = this.container(this.reportPanel, 'CouncilOptions', panelW - 10, 154, 1);
        this.reportBody.setPosition(0, -4, 1);

        this.orderButton = this.panel(this.reportPanel, 'HoldOrder', 82, 82, C.panelSoft, 0, orderY, 41, C.bronzeSoft);
        this.orderInner = this.panel(this.orderButton, 'OrderInner', 72, 72, new Color(53, 44, 31, 255), 0, 0, 36, C.bronzeSoft, false);
        this.holdFill = this.rect(this.orderButton, 'HoldFill', 68, 68, new Color(229, 121, 61, 220), 0, 0, 34, C.gold);
        this.holdFill.setScale(0.01, 0.01, 1);
        this.holdLabel = this.label(this.orderButton, '按住\n传令', 16, C.paper, 0, 0, 62, 44, true);
        this.orderButton.on(Node.EventType.TOUCH_START, () => this.onHoldStart(), this);
        this.orderButton.on(Node.EventType.TOUCH_END, () => this.onHoldEnd(), this);
        this.orderButton.on(Node.EventType.TOUCH_CANCEL, () => this.onHoldEnd(), this);
        this.buildOrderGlow(panelH);
        this.button(this.reportPanel, 'Withdraw', '撤军', -70, actionY, 46, 28, () => this.selectCouncil('defend'));
        this.button(this.reportPanel, 'Accelerate', '加速', 70, actionY, 46, 28, () => this.showToast('急行军：预计提前抵达，但粮耗增加'));
        this.button(this.reportPanel, 'RailSettings', '设', 79, panelTop - 13, 24, 22, () => this.openPage('settings'));
        tween(this.orderButton).to(0.9, { scale: new Vec3(1.04, 1.04, 1) }).to(0.9, { scale: Vec3.ONE }).union().repeatForever().start();
        this.refreshReport();
        this.updateOrderAvailability();
    }

    private refreshReport(): void {
        this.reportBody.removeAllChildren();
        this.councilNodes.clear();
        const councilTitle = this.label(this.reportBody, '军议策略', 13, C.gold, -51, 57, 84, 20, true, HorizontalTextAlignment.LEFT);
        councilTitle.node.on(Node.EventType.TOUCH_END, () => this.openPage('strategy'), this);
        this.affordance(this.reportBody, -10, 57, 0.78); // 标题可点（跳转计策府）的显性提示
        this.label(this.reportBody, this.strategySelected ? '长按传令，印信填满后执行' : '先点选策略，再长按传令', 9, this.strategySelected ? C.muted : C.gold, 39, 57, 102, 17);
        COUNCIL.forEach((option, index) => {
            const selected = this.strategySelected && option.key === this.selected;
            const card = this.panel(this.reportBody, `Council_${option.key}`, 178, 42, selected ? new Color(95, 43, 30, 255) : C.panelSoft, 0, 25 - index * 45, T.radius.chip, selected ? C.gold : C.bronzeSoft);
            // 图标使用独立底座并预留安全内边距，卡片高度同步增加，避免圆形纹样贴边后被视觉裁切。
            this.panel(card, `CouncilIconBase_${option.key}`, 28, 28, new Color(24, 21, 17, 255), -68, 0, 14, selected ? C.gold : C.bronzeSoft, false);
            this.image(card, `CouncilIcon_${option.key}`, `redesign/icons/council-${option.key}/texture`, 24, 24, -68, 0, 8);
            this.label(card, `${option.title}${option.target}`, 13, C.paper, -1, 7, 101, 19, true);
            this.label(card, option.key === 'defend' ? '城防+20% · 士气-10' : option.key === 'raid' ? '胜率+15% · 行军-1回合' : '粮草+800 · 民心+5', 9, option.key === 'defend' ? C.green : option.key === 'raid' ? C.gold : C.green, 11, -9, 106, 16);
            this.affordance(card, 80, 0);
            card.on(Node.EventType.TOUCH_END, () => this.selectCouncil(option.key), this);
            this.pressable(card);
            this.councilNodes.set(option.key, card);
            if (selected) this.sweepHighlight(card, 178, 38);
        });
        this.updateOrderAvailability();
    }

    private buildBottomNav(): void {
        const navW = 42;
        const navH = 168;
        const navX = -this.width / 2 + Math.max(24, this.safeLeft + 24);
        const navY = (this.safeBottom - this.topBarHeight) / 2 + 5;
        const nav = this.panel(this.node, 'MapTools', navW, navH, new Color(17, 16, 14, 248), navX, navY, T.radius.control, C.bronzeSoft, false);
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
            const selected = item.key === 'world';
            // 选中态改为深朱砂底 + 金色描边，避免整块亮红压住图标；图标始终置于按钮内容层最上方。
            const button = this.panel(nav, `Nav_${item.key}`, navW - 2, itemH - 1, selected ? new Color(58, 27, 23, 248) : new Color(18, 18, 16, 230), 0, y, T.radius.chip, selected ? C.cinnabarHot : C.bronzeSoft);
            const accent = this.rect(button, `NavAccent_${item.key}`, 3, itemH - 11, selected ? C.cinnabarHot : new Color(0, 0, 0, 0), -(navW - 2) / 2 + 4, 0, 1);
            accent.setPosition(accent.position.x, accent.position.y, 5);
            this.image(button, `NavIcon_${item.key}`, `redesign/icons/${item.icon}/texture`, 21, 21, 0, 8, 8);
            this.label(button, item.label, 10, selected ? C.paper : C.gold, 0, -12, navW - 6, 15, true);
            button.on(Node.EventType.TOUCH_END, () => this.openPage(item.key), this);
            this.pressable(button);
            this.navNodes.set(item.key, button);
        });
    }

    private buildPagePanel(): void {
        // 模态遮罩：暗色直接写入填充色（不依赖 UIOpacity 动画，避免透明竞态），active 切换即显示；
        // 建在 pagePanel 之前 → 渲染于所有世界层（地图/城池标记/顶栏）之上、弹窗之下。
        // 空触摸监听吞噬点击，杜绝下层城池标记/战报入口被"点穿"。
        const modalH = this.height - this.topBarHeight;
        const modalY = -this.topBarHeight / 2;
        this.pageMask = this.rect(this.node, 'PageMask', this.width, modalH, new Color(3, 3, 3, 250), 0, modalY);
        // 世界层子节点带有更高的局部 z 值，单靠创建顺序仍可能浮到遮罩之上；
        // 提升到独立模态层，确保地图、战报栏和底部时间线全部被压暗并锁定。
        this.pageMask.setPosition(0, 0, 20);
        this.pageMask.active = false;
        this.pageMask.on(Node.EventType.TOUCH_START, () => undefined, this);
        this.pageMask.on(Node.EventType.TOUCH_END, () => undefined, this);
        const frameW = this.width - 24;
        const frameH = this.height - this.topBarHeight - this.safeBottom - 12;
        this.pagePanel = this.container(this.node, 'SystemPage', frameW, frameH, 22);
        this.pagePanel.setPosition(0, (this.safeBottom - this.topBarHeight) / 2, 22);
        // 系统页采用轻量金属线框，避免九宫格漆框放大后显得厚重、压迫内容。
        const surface = this.rect(this.pagePanel, 'SystemPageSurface', frameW - 8, frameH - 8, new Color(15, 14, 12, 255), 0, 0, 1);
        surface.setSiblingIndex(0);
        const frame = this.container(this.pagePanel, 'SystemPageFrame', frameW, frameH, 2);
        const fg = frame.addComponent(Graphics);
        this.drawPageFrame(fg, frameW, frameH);
        const contentW = frameW - 20;
        const contentH = frameH - 20;
        this.pageContent = this.container(this.pagePanel, 'SystemPageContent', contentW, contentH, 3);
        this.pagePanel.active = false;
    }

    private buildToast(): void {
        const toast = this.panel(this.node, 'Toast', this.mapWidth - 20, 27, new Color(16, 15, 13, 238), -this.width / 2 + this.mapWidth / 2, -this.height / 2 + this.safeBottom + 121, T.radius.control, C.bronzeSoft);
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
            key === 'world' ? -this.height / 2 + this.safeBottom + 121 : -this.height / 2 + 18,
            12
        );
        if (key === 'world') {
            this.hidePageMask();
            this.pagePanel.active = false;
            this.setWorldStageVisible(true);
            this.radialLayer.active = true;
            this.reportPanel.active = true;
            this.mapTools.active = true;
            this.timelineLayer.active = true;
            return;
        }
        this.setWorldStageVisible(false);
        this.radialLayer.active = false;
        this.reportPanel.active = false;
        this.mapTools.active = false;
        this.timelineLayer.active = false;
        this.pagePanel.active = true;
        this.showPageMask();
        // Cocos UI 以兄弟节点顺序为主要绘制依据；每次打开时重新置顶，避免异步创建的地图节点盖住模态页。
        this.pageMask?.setSiblingIndex(this.node.children.length - 1);
        this.pagePanel.setSiblingIndex(this.node.children.length - 1);
        this.headerNode.setSiblingIndex(this.node.children.length - 1);
        this.toastNode.setSiblingIndex(this.node.children.length - 1);
        this.pageContent.removeAllChildren();
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

    /** 系统页打开时暂停并隐藏战图根节点；顶部资源栏保留，形成清晰的应用级导航层。 */
    private setWorldStageVisible(visible: boolean): void {
        const persistent = new Set(['TopBar', 'PageMask', 'SystemPage', 'Toast']);
        for (const child of this.node.children) {
            if (persistent.has(child.name)) continue;
            child.active = visible;
        }
    }

    private pageHeader(title: string, subtitle: string): Node {
        const w = this.pageContent.getComponent(UITransform)!.contentSize.width;
        const h = this.pageContent.getComponent(UITransform)!.contentSize.height;
        const left = -w / 2 + 20;
        const titleY = h / 2 - 25;
        const titleW = 220;
        const subtitleW = w - 150;
        this.rect(this.pageContent, 'PageTitleAccent', 4, 25, C.cinnabar, left + 2, titleY, 2);
        this.label(this.pageContent, title, 22, C.gold, left + titleW / 2, titleY, titleW, 30, true, HorizontalTextAlignment.LEFT);
        this.label(this.pageContent, subtitle, 11, C.muted, left + subtitleW / 2, h / 2 - 50, subtitleW, 20, false, HorizontalTextAlignment.LEFT);
        this.rect(this.pageContent, 'HeaderRule', w - 28, 1, C.bronzeSoft, 0, h / 2 - 68);
        this.button(this.pageContent, 'PageClose', '返回战图', w / 2 - 62, titleY, 96, 28, () => this.openPage('world'));
        const content = this.container(this.pageContent, 'PageBody', w, h - 70, 4);
        content.setPosition(0, -18, 4);
        return content;
    }

    private renderCitiesPage(): void {
        const parent = this.pageHeader('城池与内政', '选择城池后，每季可施行一项政令；建设会真实改变资源与民心。');
        const bodyW = parent.getComponent(UITransform)!.contentSize.width;
        const leftW = 184;
        const gap = 14;
        const rightW = bodyW - leftW - gap - 20;
        const leftX = -bodyW / 2 + 10 + leftW / 2;
        const rightX = leftX + leftW / 2 + gap + rightW / 2;
        const own = this.states.filter((c) => c.faction === 'tang');
        if (!own.some((c) => c.id === this.selectedCityId)) this.selectedCityId = own[0]?.id ?? 'taiyuan';
        if (this.selectedCity().policyUsed) this.selectedPolicyId = null;
        const cityPanel = this.panel(parent, 'CityListPanel', leftW, 205, new Color(21, 19, 16, 252), leftX, 2, T.radius.card, C.bronzeSoft, false);
        this.label(cityPanel, '直属城池', 13, C.gold, -48, 86, 72, 20, true, HorizontalTextAlignment.LEFT);
        this.label(cityPanel, `${own.length} 座`, 10, C.muted, 55, 86, 48, 18, true, HorizontalTextAlignment.RIGHT);
        own.slice(0, 3).forEach((city, i) => {
            const selected = city.id === this.selectedCityId;
            const row = this.panel(cityPanel, `CityRow_${city.id}`, 164, 35, selected ? new Color(137, 45, 34, 255) : C.panelSoft, 0, 57 - i * 39, T.radius.control, selected ? C.gold : C.bronzeSoft);
            if (selected) this.rect(row, 'SelectedAccent', 4, 25, C.gold, -77, 0, 2);
            this.label(row, city.name, 14, C.paper, -48, 0, 52, 23, true, HorizontalTextAlignment.LEFT);
            this.label(row, `兵${this.compact(city.army)}  民${city.morale}`, 10, selected ? C.gold : C.muted, 25, 0, 78, 19);
            this.affordance(row, 72, 0, 0.85);
            row.on(Node.EventType.TOUCH_END, () => {
                this.selectedCityId = city.id;
                this.selectedPolicyId = null;
                this.bus.emit('city-selected', { cityId: city.id });
                this.renderPageAgain('cities');
            }, this);
            this.pressable(row);
            this.entrance(row, i);
        });
        const city = this.selectedCity();
        const info = this.panel(cityPanel, 'CitySummary', 164, 55, new Color(49, 39, 27, 220), 0, -69, T.radius.control, C.bronzeSoft, false);
        this.label(info, `${city.name}城况`, 12, C.paper, -46, 16, 64, 18, true, HorizontalTextAlignment.LEFT);
        this.label(info, `人口${city.population.toFixed(1)}万  城防${city.defense}\n金${city.gold.toLocaleString()}  粮${city.food.toLocaleString()}  兵${this.compact(city.army)}`, 9, C.muted, 4, -8, 148, 31, false, HorizontalTextAlignment.LEFT);
        // 设施建设：农田/商市/兵营/仓廪，真实消耗城池黄金并提升产出（FacilitySystem）
        const facilityTypes: FacilityType[] = ['farm', 'market', 'barracks', 'granary'];
        facilityTypes.forEach((ft, fi) => {
            const level = city.facilities[ft];
            const cost = facilityCost(ft, level);
            const maxed = level >= FACILITY_MAX;
            const affordable = !maxed && city.gold >= cost;
            const fx = -58.5 + fi * 39;
            const cell = this.panel(info, `Facility_${ft}`, 36, 20, maxed ? new Color(40, 44, 33, 235) : affordable ? new Color(64, 46, 30, 245) : new Color(32, 30, 26, 235), fx, -41, T.radius.chip, maxed ? C.green : affordable ? C.gold : C.bronzeSoft, false);
            this.label(cell, `${facilityName(ft).slice(0, 1)}${level}`, 9, maxed ? C.green : affordable ? C.paper : C.muted, 0, 2, 30, 13, true);
            this.label(cell, maxed ? '满' : `${cost}`, 8, affordable ? C.gold : C.muted, 0, -7, 30, 11, true);
            if (affordable) {
                cell.on(Node.EventType.TOUCH_END, () => {
                    const result = buildFacility(city, ft);
                    this.showToast(result.ok ? `${city.name} ${facilityName(ft)}升至${city.facilities[ft]}级（-${cost}金）` : result.reason, result.ok ? 'good' : 'bad');
                    this.refreshHeader();
                    this.renderPageAgain('cities');
                }, this);
                this.pressable(cell);
            }
        });
        this.label(parent, '本季政令', 14, C.gold, rightX - rightW / 2 + 54, 91, 100, 22, true, HorizontalTextAlignment.LEFT);
        this.label(parent, city.policyUsed ? '已执行 · 推进回合后刷新' : '每季任选 1 项', 10, city.policyUsed ? C.muted : C.green, rightX + rightW / 2 - 90, 91, 160, 18, true, HorizontalTextAlignment.RIGHT);
        const cardGap = 8;
        const cardW = (rightW - cardGap * 2) / 3;
        POLICIES.slice(0, 6).forEach((policy, i) => {
            const col = i % 3;
            const row = Math.floor(i / 3);
            const x = rightX - rightW / 2 + cardW / 2 + col * (cardW + cardGap);
            const affordable = !city.policyUsed && city.gold >= policy.costGold && city.food >= policy.costFood;
            const selected = policy.id === this.selectedPolicyId;
            const cardTone = city.policyUsed ? new Color(27, 26, 23, 245) : selected ? new Color(95, 43, 30, 255) : C.panelSoft;
            const card = this.panel(parent, `Policy_${policy.id}`, cardW, 68, cardTone, x, 48 - row * 76, T.radius.control, selected ? C.gold : C.bronzeSoft);
            this.rect(card, 'PolicyAccent', 4, 42, city.policyUsed ? C.bronzeSoft : selected ? C.gold : affordable ? C.cinnabar : C.bronzeSoft, -cardW / 2 + 7, 0, 2);
            this.label(card, policy.name, 14, city.policyUsed || !affordable ? C.muted : C.paper, -4, 18, cardW - 24, 21, true);
            const policyHint = city.policyUsed ? '本季已执行' : affordable ? policy.desc : policy.costGold > city.gold ? '黄金不足' : '粮草不足';
            this.label(card, policyHint, 9, city.policyUsed || !affordable ? C.muted : C.gold, -4, -8, cardW - 24, 30);
            if (affordable) {
                this.affordance(card, cardW / 2 - 11, 0, 0.8);
                card.on(Node.EventType.TOUCH_END, () => {
                    this.selectedPolicyId = this.selectedPolicyId === policy.id ? null : policy.id;
                    this.showToast(this.selectedPolicyId ? `已选「${policy.name}」· 确认后立即结算` : '已取消政令选择');
                    this.renderPageAgain('cities');
                }, this);
                this.pressable(card);
            }
            this.entrance(card, i + 5);
            if (city.policyUsed) {
                const disabled = card.getComponent(UIOpacity) ?? card.addComponent(UIOpacity);
                disabled.opacity = 170;
            }
        });
        const notice = this.panel(parent, 'PolicyNotice', rightW, 34, new Color(30, 36, 27, 242), rightX, -101, T.radius.control, city.policyUsed ? C.bronzeSoft : new Color(118, 178, 93, 160), false);
        const selectedPolicy = POLICIES.find((policy) => policy.id === this.selectedPolicyId);
        const noticeText = city.policyUsed
            ? '本季政令已执行，推进回合后可再次施政'
            : selectedPolicy
                ? `已选「${selectedPolicy.name}」· ${selectedPolicy.desc}`
                : '先点选政令查看效果，再确认执行';
        this.label(notice, noticeText, 10, city.policyUsed ? C.muted : selectedPolicy ? C.gold : C.green, -48, 0, rightW - 150, 19, true, HorizontalTextAlignment.LEFT);
        if (!city.policyUsed && selectedPolicy) {
            this.button(notice, 'ConfirmPolicy', '确认执行', rightW / 2 - 54, 0, 82, 25, () => {
                const result = applyPolicy(city, selectedPolicy.id);
                this.selectedPolicyId = null;
                this.refreshHeader();
                this.showToast(result.ok ? `${city.name}施行「${selectedPolicy.name}」成功` : result.reason, result.ok ? 'good' : 'bad');
                this.renderPageAgain('cities');
            });
        }
    }

    private renderArmyPage(): void {
        const parent = this.pageHeader('部队与将领', '募兵直接消耗城池黄金；点选将领可任命为当前城守将。');
        const city = this.selectedCity();
        const marching = this.world.marches.filter((m) => m.fromId === city.id || m.toId === city.id);
        // 摘要独立占用卡片上方的标题行，避免被募兵卡片的上沿盖住。
        this.label(parent, `${city.name}募兵 · 金 ${city.gold.toLocaleString()} · 总兵 ${city.army.toLocaleString()}`, 16, C.paper, -205, 96, 360, 27, true);
        TROOP_ORDER.slice(0, 5).forEach((type, i) => this.armyCard(parent, type, i));
        // 行军令：全军开赴相邻城池（己方=调防，敌方=攻城），多回合后到达结算
        this.marchCard(parent, city);
        this.label(parent, '麾下名将', 17, C.gold, 112, 96, 130, 26, true);
        GENERALS.filter((g) => g.faction === 'tang').slice(0, 5).forEach((general, i) => {
            const row = this.panel(parent, `General_${general.id}`, 305, 32, C.panelSoft, 217, 30 - i * 37, T.radius.control, C.bronzeSoft);
            const state = this.world.generals.find((gs) => gs.id === general.id);
            const loyalty = state ? state.loyalty : general.loyalty;
            this.label(row, general.name, 14, C.paper, -102, 0, 76, 22, true, HorizontalTextAlignment.LEFT);
            this.label(row, `统${general.stats.command} 谋${general.stats.strategy} 勇${general.stats.valor} 忠${loyalty}`, 11, loyalty < 50 ? C.red : C.muted, 30, 0, 190, 20);
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
        this.label(parent, `当前守将：${assigned?.name ?? '尚未任命'}`, 12, assigned ? C.green : C.muted, 270, 96, 214, 23, true, HorizontalTextAlignment.RIGHT);
        if (marching.length > 0) {
            const names = marching.map((m) => `${this.states.find((c) => c.id === m.fromId)?.name ?? '?'}→${this.states.find((c) => c.id === m.toId)?.name ?? '?'}（${m.turnsLeft}回合）`).join('，');
            this.label(parent, `行军中：${names}`, 10, C.gold, -60, -113, 660, 18, true);
        }
    }

    /** 行军/出征卡：占第三行空位，展开后显示相邻城池按钮。 */
    private marchCard(parent: Node, city: CityState): void {
        const card = this.panel(parent, 'MarchCard', 154, 48, C.panelSoft, -154, -87, T.radius.control, C.bronzeSoft);
        if (this.marchPanelOpen) {
            this.label(card, '点相邻城出兵', 11, C.gold, 0, 14, 140, 16, true);
            const neighborIds = neighborsOf(city.id).map((n) => n.id).filter((nid) => nid !== city.id);
            neighborIds.slice(0, 5).forEach((nid, ni) => {
                const target = this.states.find((c) => c.id === nid);
                if (!target) return;
                const own = target.faction === city.faction;
                const check = canMarch(this.world, city.id, nid);
                const nx = -70 + (ni % 2) * 70;
                const ny = -2 - Math.floor(ni / 2) * 18;
                const chip = this.panel(card, `MarchTo_${nid}`, 66, 16, check.ok ? (own ? new Color(38, 52, 38, 245) : new Color(74, 34, 26, 245)) : new Color(28, 26, 23, 235), nx, ny, T.radius.chip, check.ok ? (own ? C.green : C.cinnabar) : C.bronzeSoft, false);
                this.label(chip, target.name, 9, check.ok ? C.paper : C.muted, 0, 0, 60, 14, true);
                if (check.ok) {
                    chip.on(Node.EventType.TOUCH_END, () => {
                        this.launchMarch(city, target);
                    }, this);
                    this.pressable(chip);
                }
            });
            this.label(card, '再点上方收起', 9, C.muted, 0, -41, 140, 14, true);
            card.on(Node.EventType.TOUCH_END, () => {
                this.marchPanelOpen = false;
                this.renderPageAgain('army');
            }, this);
        } else {
            this.label(card, '行军 · 出征', 14, C.paper, -30, 10, 96, 21, true, HorizontalTextAlignment.LEFT);
            this.label(card, `全军赴相邻城 · 兵${this.compact(city.army)}`, 10, C.muted, -6, -11, 120, 18, false, HorizontalTextAlignment.LEFT);
            this.affordance(card, 68, 0);
            card.on(Node.EventType.TOUCH_END, () => {
                if (city.army <= 0) return this.showToast('城中无兵可调', 'bad');
                this.marchPanelOpen = true;
                this.renderPageAgain('army');
            }, this);
        }
        this.pressable(card);
        this.entrance(card, 4);
    }

    /** 下达行军令：全军（含守将统率快照）开赴目标城，抵达时结算进驻或攻城。 */
    private launchMarch(from: CityState, to: CityState): void {
        const check = canMarch(this.world, from.id, to.id);
        if (!check.ok) return this.showToast(check.reason, 'bad');
        this.bus.emit('sfx', { name: 'march' });
        const troops = { ...from.troops };
        for (const t of TROOP_ORDER) {
            from.troops[t] = 0;
        }
        from.army = 0;
        const order = createMarch(`march-${this.world.turn}-${from.id}-${to.id}`, getCity(from.id), getCity(to.id), troops);
        order.command = commandOf(from, this.world.generals);
        order.faction = from.faction;
        this.world.marches.push(order);
        this.marchPanelOpen = false;
        this.reports.unshift({
            title: `${from.name}大军开拔`,
            body: `全军${TROOP_ORDER.reduce((s, t) => s + troops[t], 0).toLocaleString()}开赴${to.name}，约${order.turnsLeft}回合抵达。${to.faction === from.faction ? '（调防）' : '（攻城）'}`,
            tone: 'normal'
        });
        this.reportCount += 1;
        this.refreshHeader();
        this.showToast(`${from.name}全军开赴${to.name} · ${order.turnsLeft}回合后抵达`, 'normal');
        this.renderPageAgain('army');
    }

    private armyCard(parent: Node, type: TroopType, i: number): void {
        const city = this.selectedCity();
        const troop = TROOPS[type];
        const card = this.panel(parent, `Troop_${type}`, 154, 48, C.panelSoft, -318 + (i % 2) * 164, 25 - Math.floor(i / 2) * 56, T.radius.control, C.bronzeSoft);
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
        const target = this.frontlineCity();
        const targetGeneral = this.targetGeneralForScheme();
        const ambushReady = this.world.flags['ambushReady'] === true;
        const plans = [
            { name: '散布谣言', desc: `扰乱${target ? target.name : '敌城'}民心 · 耗金40`, action: () => this.executeRumor() },
            { name: '离间敌将', desc: `离间${targetGeneral ? targetGeneral.name : '敌将'} · 耗金80`, action: () => this.executeScheme('discord') },
            { name: '重金收买', desc: `收买${targetGeneral ? targetGeneral.name : '敌将'} · 耗金400`, action: () => this.executeScheme('bribe') },
            { name: ambushReady ? '伏兵已就位' : '伏兵设险', desc: ambushReady ? '下次突袭无视城防加成' : '提升下次突袭胜算 · 耗金260', action: () => this.executeAmbush() }
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
        const odds = raidOdds(this.world, this.selectedCityId);
        this.label(parent, target ? `前线敌情：${target.name} 守军${target.army.toLocaleString()} · 突袭胜算 ${odds}%${ambushReady ? '（伏兵就绪）' : ''}` : '境内无敌情，突袭暂不可行', 13, C.gold, 0, -101, 520, 24, true);
    }

    private renderDiplomacyPage(): void {
        const parent = this.pageHeader('外交纵横', '选择势力后可施外交行动；关系、盟约与战争状态会真实改变。');
        const bodyW = parent.getComponent(UITransform)!.contentSize.width;
        const cardGap = 8;
        const cardW = (bodyW - 30 - cardGap * 3) / 4;
        FACTIONS.filter((f) => f.id !== 'tang').slice(0, 8).forEach((faction, i) => {
            const relation = this.diplomacy.relations[faction.id] ?? 0;
            const atWar = this.diplomacy.atWar.includes(faction.id);
            const allied = this.diplomacy.allies.includes(faction.id);
            const status = atWar ? '交战' : allied ? '盟友' : relation >= 50 ? '友好' : relation >= 20 ? '交好' : '中立';
            const tone = atWar ? C.red : relation >= 20 ? C.green : C.muted;
            const col = i % 4;
            const row = Math.floor(i / 4);
            const x = -bodyW / 2 + 15 + cardW / 2 + col * (cardW + cardGap);
            const selected = faction.id === this.selectedFactionId;
            const card = this.panel(parent, `Faction_${faction.id}`, cardW, 74, selected ? new Color(95, 43, 30, 255) : C.panelSoft, x, 46 - row * 83, T.radius.card, selected ? C.gold : atWar ? C.cinnabar : C.bronzeSoft);
            const seal = this.panel(card, 'FactionSeal', 30, 30, atWar ? new Color(103, 39, 32, 255) : new Color(50, 44, 32, 255), -cardW / 2 + 22, 17, 15, atWar ? C.red : C.gold, false);
            this.label(seal, faction.name.slice(0, 1), 14, C.paper, 0, 0, 24, 22, true);
            this.label(card, faction.name, 13, C.paper, 9, 22, cardW - 62, 20, true, HorizontalTextAlignment.LEFT);
            const badge = this.panel(card, 'FactionStatus', 40, 18, new Color(tone.r, tone.g, tone.b, 42), cardW / 2 - 28, 4, 9, new Color(tone.r, tone.g, tone.b, 180), false);
            this.label(badge, status, 9, tone, 0, 0, 34, 14, true);
            this.label(card, `关系 ${relation > 0 ? '+' : ''}${relation}`, 10, tone, -cardW / 2 + 54, -3, 64, 17, true, HorizontalTextAlignment.LEFT);
            this.drawValueBar(card, -5, -14, Math.max(58, cardW - 80), (relation + 100) / 200, tone);
            this.label(card, '点选后可施五项外交', 9, C.muted, 0, -27, cardW - 24, 16, true);
            this.affordance(card, cardW / 2 - 10, -25, 0.72);
            card.on(Node.EventType.TOUCH_END, () => {
                this.selectedFactionId = this.selectedFactionId === faction.id ? null : faction.id;
                this.showToast(this.selectedFactionId ? `已选${faction.name} · 下方选择行动` : '已取消外交选择');
                this.renderPageAgain('diplomacy');
            }, this);
            this.pressable(card);
            this.entrance(card, i);
        });
        const summary = this.panel(parent, 'DiplomacySummary', bodyW - 30, 34, new Color(49, 39, 27, 242), 0, -101, T.radius.control, C.bronzeSoft, false);
        const selectedFaction = FACTIONS.find((faction) => faction.id === this.selectedFactionId);
        const selectedRelation = selectedFaction ? (this.diplomacy.relations[selectedFaction.id] ?? 0) : 0;
        this.label(summary, `国库 ${this.treasury().toLocaleString()} 金`, 11, C.gold, -bodyW / 2 + 116, 0, 195, 19, true);
        this.label(summary, selectedFaction ? `已选${selectedFaction.name} · 关系 ${selectedRelation > 0 ? '+' : ''}${selectedRelation}` : '请选择势力，下方执行外交行动', 10, selectedFaction ? C.gold : C.muted, 78, 0, 250, 18, true, HorizontalTextAlignment.LEFT);
        this.label(summary, `总兵力 ${this.tangPower().toLocaleString()}`, 10, C.muted, bodyW / 2 - 182, 0, 120, 18, true, HorizontalTextAlignment.RIGHT);
        if (selectedFaction) {
            // 五项外交行动：结盟150 / 停战80 / 进贡200 / 和亲350 / 威慑0
            const actions: Array<{ key: DiploAction; name: string; cost: number; enabled: boolean; hint: string }> = [
                { key: 'tribute', name: '进贡', cost: 200, enabled: this.treasury() >= 200, hint: '关系+30' },
                { key: 'alliance', name: '结盟', cost: 150, enabled: this.treasury() >= 150 && !this.diplomacy.allies.includes(selectedFaction.id), hint: '求为盟友' },
                { key: 'truce', name: '停战', cost: 80, enabled: this.treasury() >= 80 && this.diplomacy.atWar.includes(selectedFaction.id), hint: '止兵休战' },
                { key: 'marriage', name: '和亲', cost: 350, enabled: this.treasury() >= 350 && !this.diplomacy.allies.includes(selectedFaction.id), hint: '联姻固盟' },
                { key: 'threaten', name: '威慑', cost: 0, enabled: !this.diplomacy.atWar.includes(selectedFaction.id), hint: '迫其降望' }
            ];
            actions.forEach((act, i) => {
                const x = bodyW / 2 - 232 + i * 96;
                const btn = this.button(summary, `Diplo_${act.key}`, `${act.name}${act.cost ? ` ${act.cost}金` : ''}`, x, 0, 88, 25, act.enabled ? () => {
                    this.executeDiplomacy(selectedFaction.id, selectedFaction.name, act.key);
                } : () => this.showToast(act.key === 'truce' ? '两国并未交战' : act.key === 'threaten' ? '已处交战' : '条件不足', 'bad'));
                if (!act.enabled) {
                    const op = btn.getComponent(UIOpacity) ?? btn.addComponent(UIOpacity);
                    op.opacity = 130;
                }
            });
        }
    }

    private renderIntelPage(): void {
        const unread = this.reportCount;
        const unreadHint = unread > 5 ? `未读 ${unread} · 还有 ${unread - 5} 条待查看` : `未读 ${unread} · 战报会记录军令、计策和天下大事`;
        const parent = this.pageHeader('情报与战报', unreadHint);
        const bodyW = parent.getComponent(UITransform)!.contentSize.width;
        const filters: Array<{ key: typeof this.intelFilter; label: string }> = [
            { key: 'all', label: '全部' },
            { key: '军情', label: '军情' },
            { key: '急报', label: '急报' },
            { key: '捷报', label: '捷报' }
        ];
        filters.forEach((filter, i) => {
            const selected = this.intelFilter === filter.key;
            const chip = this.panel(parent, `IntelFilter_${filter.key}`, 58, 22, selected ? new Color(95, 43, 30, 255) : new Color(27, 25, 21, 240), -bodyW / 2 + 42 + i * 67, 93, T.radius.chip, selected ? C.gold : C.bronzeSoft, false);
            this.label(chip, filter.label, 10, selected ? C.paper : C.muted, 0, 0, 50, 16, true);
            chip.on(Node.EventType.TOUCH_END, () => {
                this.intelFilter = filter.key;
                this.renderPageAgain('intel');
            }, this);
            this.pressable(chip);
        });
        this.reportCount = 0;
        this.reportBadge.string = '0';
        const visibleReports = this.reports.filter((entry) => {
            if (this.intelFilter === 'all') return true;
            const type = entry.tone === 'bad' ? '急报' : entry.tone === 'good' ? '捷报' : '军情';
            return type === this.intelFilter;
        }).slice(0, 5);
        visibleReports.forEach((entry, i) => {
            const tone = this.toneColor(entry.tone);
            const type = entry.tone === 'bad' ? '急报' : entry.tone === 'good' ? '捷报' : '军情';
            const isUnread = this.intelFilter === 'all' && i < unread;
            const row = this.panel(parent, `Intel_${i}`, bodyW - 30, 34, isUnread ? new Color(52, 38, 27, 250) : new Color(24, 22, 19, 250), 0, 55 - i * 36, T.radius.control, isUnread ? new Color(tone.r, tone.g, tone.b, 170) : C.bronzeSoft, false);
            const badge = this.panel(row, 'IntelType', 44, 22, new Color(tone.r, tone.g, tone.b, 36), -bodyW / 2 + 43, 0, 2, new Color(tone.r, tone.g, tone.b, 150), false);
            this.label(badge, type, 10, tone, 0, 0, 38, 16, true);
            if (isUnread) this.rect(row, 'UnreadDot', 6, 6, C.cinnabarHot, -bodyW / 2 + 72, 11, 3);
            this.label(row, entry.title, 13, tone, -bodyW / 2 + 178, 0, 190, 22, true, HorizontalTextAlignment.LEFT);
            this.label(row, entry.body, 10, C.muted, 92, 0, bodyW - 420, 20, false, HorizontalTextAlignment.LEFT);
            this.label(row, i === 0 ? '刚刚' : `${i}日前`, 9, C.muted, bodyW / 2 - 56, 0, 54, 17, true, HorizontalTextAlignment.RIGHT);
            this.affordance(row, bodyW / 2 - 20, 0, 0.72);
            row.on(Node.EventType.TOUCH_END, () => this.showToast(`${entry.title} · ${entry.body}`, entry.tone), this);
            this.pressable(row);
            this.entrance(row, i);
        });
        const source = this.panel(parent, 'IntelSource', bodyW - 30, 24, new Color(30, 29, 25, 238), 0, -109, T.radius.control, C.bronzeSoft, false);
        this.label(source, '情报来源：太行斥候 · 河东郡府 · 幽州商旅', 10, C.gold, 0, 0, bodyW - 50, 18, true);
    }

    private renderSettingsPage(): void {
        const parent = this.pageHeader('设置', '横屏显示与反馈偏好会保留在本次游戏中。');
        const bodyW = parent.getComponent(UITransform)!.contentSize.width;
        const cardW = Math.min(330, Math.max(250, (bodyW - 46) / 2));
        const cardX = (cardW + 12) / 2;
        const rows: Array<{ key: keyof typeof this.settings; title: string; desc: string }> = [
            { key: 'music', title: '军帐音乐', desc: '开启环境音乐与战鼓提示' },
            { key: 'vibration', title: '传令震动', desc: '长按完成时提供触觉反馈' },
            { key: 'fastText', title: '快速战报', desc: '跳过逐字展开动画' }
        ];
        rows.forEach((item, i) => {
            const col = i % 2;
            const rowIndex = Math.floor(i / 2);
            const x = col === 0 ? -cardX : cardX;
            const row = this.panel(parent, `Setting_${item.key}`, cardW, 60, C.panelSoft, x, 57 - rowIndex * 72, T.radius.card, C.bronzeSoft);
            this.rect(row, 'SettingAccent', 4, 38, C.cinnabar, -cardW / 2 + 7, 0, 2);
            this.label(row, item.title, 15, C.paper, -cardW / 2 + 86, 11, 134, 23, true, HorizontalTextAlignment.LEFT);
            this.label(row, item.desc, 10, C.muted, -cardW / 2 + 122, -14, Math.max(150, cardW - 116), 18, false, HorizontalTextAlignment.LEFT);
            const on = this.settings[item.key];
            this.buildSettingSwitch(row, on, cardW / 2 - 44, 0);
            row.on(Node.EventType.TOUCH_END, () => {
                this.settings[item.key] = !this.settings[item.key];
                if (item.key === 'music') this.bus.emit('audio-setting', { music: this.settings.music });
                this.renderPageAgain('settings');
            }, this);
            this.pressable(row);
            this.entrance(row, i);
        });
        const guide = this.panel(parent, 'ReplayGuide', cardW, 60, C.panelSoft, cardX, -15, T.radius.card, C.bronzeSoft);
        this.rect(guide, 'GuideAccent', 4, 38, C.gold, -cardW / 2 + 7, 0, 2);
        this.label(guide, '开场、剧情与引导', 15, C.paper, -cardW / 2 + 100, 11, 160, 23, true, HorizontalTextAlignment.LEFT);
        this.label(guide, '重新查看背景、对话与操作说明', 10, C.muted, -cardW / 2 + 138, -14, Math.max(170, cardW - 102), 18, false, HorizontalTextAlignment.LEFT);
        this.button(guide, 'ReplayGo', '重看', cardW / 2 - 42, 0, 64, 26, () => {
            this.openPage('world');
            this.showOpening(true);
        });
        this.pressable(guide);
        this.entrance(guide, 3);
        const saveBar = this.panel(parent, 'SaveBar', bodyW - 120, 38, new Color(45, 35, 25, 238), 0, -101, T.radius.control, C.bronzeSoft, false);
        this.label(saveBar, '设置将在当前战局中立即生效', 10, C.muted, -95, 0, 250, 18, true, HorizontalTextAlignment.LEFT);
        this.button(saveBar, 'ManualSave', '立即保存', 140, 0, 120, 30, () => {
            this.bus.emit('save-requested', {});
            this.showToast('进度已保存', 'good');
        });
    }

    private selectCouncil(key: CouncilKey): void {
        this.selected = key;
        this.strategySelected = true;
        this.buildRoute();
        this.refreshTimeline();
        this.refreshReport();
        const option = this.currentOption();
        const odds = key === 'raid' ? raidOdds(this.world, this.selectedCityId) : option.odds;
        this.showToast(`${option.title} · ${option.detail} · 胜算 ${odds}%`);
    }

    /** 传令是核心提交动作：未选军议或正在结算时必须明显禁用，并停止脉动光晕。 */
    private updateOrderAvailability(): void {
        if (!this.orderButton || !this.holdLabel) return;
        const enabled = this.strategySelected && !this.committed;
        const buttonOpacity = this.orderButton.getComponent(UIOpacity) ?? this.orderButton.addComponent(UIOpacity);
        buttonOpacity.opacity = enabled ? 255 : 165;
        this.holdLabel.color = enabled ? C.paper : C.muted;
        this.holdLabel.string = enabled ? '按住\n传令' : '先选\n军议';
        if (this.orderGlowOpacity) {
            Tween.stopAllByTarget(this.orderGlowOpacity);
            this.orderGlowOpacity.opacity = enabled ? 80 : 0;
            if (enabled) this.startGlowFlicker();
        }
        Tween.stopAllByTarget(this.orderButton);
        this.orderButton.setScale(Vec3.ONE);
        if (enabled) {
            tween(this.orderButton).to(0.9, { scale: new Vec3(1.04, 1.04, 1) }).to(0.9, { scale: Vec3.ONE }).union().repeatForever().start();
        }
    }

    private onHoldStart(): void {
        if (this.endingShown) return;
        if (!this.strategySelected) {
            this.showToast('请先选择军议策略，再长按传令', 'bad');
            return;
        }
        if (this.committed) return;
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
            this.holdLabel.string = this.strategySelected ? '按住\n传令' : '先选\n军议';
            this.restoreOrderGlow();
            if (attempted) this.showToast('继续按住，待印信填满后军令才会发出');
        }
    }

    private commitOrder(): void {
        if (!this.strategySelected) {
            this.resetOrderButton();
            this.showToast('请先选择军议策略，再长按传令', 'bad');
            return;
        }
        this.committed = true;
        this.updateOrderAvailability();
        const option = this.currentOption();
        const city = this.states.find((item) => item.id === this.selectedCityId) ?? this.states.find((item) => item.id === 'taiyuan')!;
        // 真实结算：兵力×统率×克制×城防，可胜可败可夺城；粮草校验在 CommandSystem 内完成
        const result = executeCouncilOrder(this.world, option.key, city.id, Math.random);
        if (!result.ok) {
            this.showToast(result.reason, 'bad');
            this.resetOrderButton();
            return;
        }
        const outcome: BattleOutcome = { title: result.title, body: result.body, tone: result.tone };
        const targetCity = result.raidTargetId ? this.states.find((c) => c.id === result.raidTargetId) : undefined;
        this.bus.emit('sfx', { name: 'battle' });
        this.playOrderBriefing(option, () => this.playBattleSequence(option, outcome, () => {
            this.reports.unshift(outcome);
            this.reportCount += 1;
            this.reportBadge.string = String(this.reportCount);
            this.turns.advance();
            this.bus.emit('turn-advanced', { year: this.turns.year, season: this.turns.getSeason(), turn: this.turns.getTurnNumber() });
            this.refreshReport();
            this.refreshHeader();
            this.showToast(`${outcome.title} · 已推进至${this.turns.getSeason()}`, outcome.tone);
            if (targetCity && targetCity.faction === 'tang' && option.key === 'raid') {
                this.showToast(`新拓疆土：${targetCity.name}已入唐土`, 'good');
            }
            this.flashRoute();
            this.resetOrderButton();
        }));
    }

    private resetOrderButton(): void {
        this.holding = false;
        this.holdTimer = 0;
        this.holdFill.setScale(0.01, 0.01, 1);
        this.holdLabel.string = this.strategySelected ? '按住\n传令' : '先选\n军议';
        this.restoreOrderGlow();
        tween(this.orderButton).delay(0.35).call(() => {
            this.committed = false;
            this.updateOrderAvailability();
        }).start();
        this.updateOrderAvailability();
    }

    /** 前线敌城：距所选唐城最近的相邻敌城（计策与突袭共用目标）。 */
    private frontlineCity(): CityState | null {
        const own = this.states.find((c) => c.id === this.selectedCityId && c.faction === 'tang')
            ?? this.states.find((c) => c.id === 'taiyuan' && c.faction === 'tang');
        if (!own) return null;
        return raidTarget(this.world, own.id);
    }

    /** 我方谋略值：取在朝谋臣（刘文静）谋略。 */
    private selfStrategy(): number {
        const advisor = this.world.generals.find((g) => g.id === 'liuwenjing');
        return advisor ? advisor.stats.strategy : 80;
    }

    private executeRumor(): void {
        this.bus.emit('sfx', { name: 'scheme' });
        const source = this.states.find((city) => city.faction === 'tang');
        const target = this.frontlineCity();
        if (!source || !target) return this.showToast('境内无敌城可施计', 'bad');
        const result = spreadRumor(target.morale, this.selfStrategy(), source.gold, Math.random);
        if (result.goldCost) source.gold -= result.goldCost;
        if (result.ok && result.moraleDelta) target.morale = Math.max(0, target.morale + result.moraleDelta);
        this.reports.unshift({ title: result.ok ? '谣言已散布' : '计策败露', body: result.ok ? `${target.name}民心动摇。` : result.reason, tone: result.ok ? 'good' : 'bad' });
        this.reportCount += 1;
        this.refreshHeader();
        this.showToast(result.ok ? `计策成功：${target.name}民心下降` : result.reason, result.ok ? 'good' : 'bad');
        this.renderPageAgain('strategy');
    }

    /** 离间/收买的目标签：前线敌城守将，无守将则取该势力主君。 */
    private targetGeneralForScheme(): GeneralState | null {
        const target = this.frontlineCity();
        if (!target) return null;
        if (target.generalId) {
            const g = this.world.generals.find((item) => item.id === target.generalId);
            if (g) return g;
        }
        const leader = this.world.generals.find((g) => g.faction === target.faction);
        return leader ?? null;
    }

    private executeScheme(kind: 'discord' | 'bribe'): void {
        this.bus.emit('sfx', { name: 'scheme' });
        const general = this.targetGeneralForScheme();
        if (!general) return this.showToast('境内无敌将可施计', 'bad');
        const cost = kind === 'discord' ? 80 : 400;
        if (this.treasury() < cost) return this.showToast('黄金不足', 'bad');
        const target = this.frontlineCity()!;
        let result;
        if (kind === 'discord') {
            result = sowDiscord(general, this.selfStrategy(), this.treasury(), Math.random);
        } else {
            result = bribeGeneral(general, this.selfStrategy(), 82, this.treasury(), Math.random);
        }
        if (result.goldCost) this.deductTreasury(result.goldCost);
        const title = kind === 'discord' ? '离间之计' : '重金收买';
        this.reports.unshift({ title: result.ok ? `${title}奏效` : `${title}失败`, body: result.ok ? result.message : `${result.message || result.reason}（${target.name}）`, tone: result.ok ? 'good' : 'bad' });
        this.reportCount += 1;
        this.refreshHeader();
        this.showToast(result.ok ? `${general.name}忠诚${result.loyaltyDelta ?? ''}` : result.reason, result.ok ? 'good' : 'bad');
        this.renderPageAgain('strategy');
    }

    /** 伏兵设险：一次性提升下次突袭胜算（无视城防加成）。 */
    private executeAmbush(): void {
        this.bus.emit('sfx', { name: 'scheme' });
        if (this.world.flags['ambushReady'] === true) {
            return this.showToast('伏兵已就位，待下次突袭建功', 'normal');
        }
        const source = this.states.find((city) => city.faction === 'tang');
        if (!source || this.treasury() < 260) return this.showToast('黄金不足', 'bad');
        this.deductTreasury(260);
        this.world.flags['ambushReady'] = true;
        this.reports.unshift({ title: '伏兵已设', body: '精锐埋伏于太行险道，下次突袭将无视敌城城防加成。', tone: 'good' });
        this.reportCount += 1;
        this.refreshHeader();
        this.showToast('伏兵就位 · 下次突袭胜算大增', 'good');
        this.renderPageAgain('strategy');
    }

    private executeDiplomacy(factionId: string, factionName: string, action: DiploAction = 'tribute'): void {
        this.bus.emit('sfx', { name: 'diplomacy' });
        const result = performDiplo(this.diplomacy, 'tang', factionId, action, { gold: this.treasury(), prestige: 82, armyPower: this.tangPower(), rng: Math.random });
        if (result.ok) this.deductTreasury(result.goldCost);
        this.selectedFactionId = null;
        const actionNames: Record<DiploAction, string> = { alliance: '结盟', truce: '停战', tribute: '进贡', marriage: '和亲', threaten: '威慑' };
        this.reports.unshift({ title: `${actionNames[action]}·${factionName}`, body: result.ok ? result.message : result.reason, tone: result.ok ? 'good' : 'bad' });
        this.reportCount += 1;
        this.refreshHeader();
        this.showToast(result.ok ? `${factionName} · ${result.message}` : result.reason, result.ok ? 'good' : 'bad');
        this.renderPageAgain('diplomacy');
    }

    private toggleReport(force?: boolean): void {
        this.reportOpen = force ?? true;
        this.openPage('intel');
    }

    private refreshHeader(): void {
        this.eraLabel.string = `${TurnManager.eraName(this.turns.year)} · ${this.turns.getSeason()}`;
        this.difficultyLabel.string = `唐 · 李渊 · ${difficultyOf(this.world.difficulty).name}局`;
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
            this.drawPanelBg(g, size.width, size.height, selected ? new Color(58, 27, 23, 248) : new Color(18, 18, 16, 230), 0, selected ? C.cinnabarHot : C.bronzeSoft, false);
            const accent = node.getChildByName(`NavAccent_${key}`);
            const accentGraphics = accent?.getComponent(Graphics);
            if (accentGraphics) {
                accentGraphics.clear();
                accentGraphics.fillColor = selected ? C.cinnabarHot : new Color(0, 0, 0, 0);
                accentGraphics.roundRect(-1.5, -size.height / 2 + 5.5, 3, size.height - 11, 1);
                accentGraphics.fill();
            }
            const label = node.children.find((child) => child.getComponent(Label))?.getComponent(Label);
            if (label) label.color = selected ? C.paper : C.gold;
        }
    }

    private renderPageAgain(key: PageKey): void {
        // 页面外框、实色内衬和内容根节点都是持久结构；刷新时只能重建内容。
        // 若清空 pagePanel，会让 pageContent 脱离场景树，后续创建的标题与卡片全部不可见。
        this.pageContent.removeAllChildren();
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
    private currentOption(): CouncilOption {
        const option = COUNCIL.find((o) => o.key === this.selected)!;
        if (option.key === 'raid') {
            const target = this.frontlineCity();
            if (target) {
                return { ...option, target: target.name };
            }
        }
        return option;
    }
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

    /** 结局结算画面：统一/偏安/覆亡全屏卡，可重开新局（清档重启）。 */
    private showEndingScreen(grade: string, message: string): void {
        if (this.endingShown) return;
        this.endingShown = true;
        this.bus.emit('sfx', { name: 'report' });
        this.removeCinematic();
        this.toastNode.active = false;
        const layer = this.container(this.node, 'EndingScreen', this.width, this.height, 40);
        layer.setPosition(0, 0, 40);
        layer.on(Node.EventType.TOUCH_START, () => undefined, this);
        layer.on(Node.EventType.TOUCH_END, () => undefined, this);
        this.image(layer, 'EndingMap', 'redesign/war-map-landscape/texture', this.width, this.height, 0, 0, 0);
        this.rect(layer, 'EndingShade', this.width, this.height, new Color(6, 5, 4, 224), 0, 0);

        const gradeTitle: Record<string, string> = {
            unify: '天下一统',
            reign: '贞观开元',
            decline: '偏安一隅',
            defeat: '李唐覆亡'
        };
        const gradeTone: Record<string, Color> = {
            unify: C.gold,
            reign: C.gold,
            decline: C.muted,
            defeat: C.red
        };
        const tone = gradeTone[grade] ?? C.gold;
        const seal = this.panel(layer, 'EndingSeal', 92, 92, new Color(112, 36, 28, 245), 0, 72, 8, C.gold);
        this.label(seal, '唐', 40, C.paper, 0, 0, 84, 56, true);
        this.label(layer, gradeTitle[grade] ?? '天下终局', 34, tone, 0, 10, 520, 48, true);
        this.label(layer, message, 15, C.paper, 0, -32, 620, 44, true);
        const stats = this.states.filter((c) => c.faction === 'tang');
        this.label(layer, `${this.turns.year} ${this.turns.getSeason()} · 唐土${stats.length}城 · 兵${this.tangPower().toLocaleString()}`, 12, C.muted, 0, -60, 520, 20, true);
        this.label(layer, '本局战报已录入史册 · 存档将定格于此局', 10, C.bronze, 0, -78, 460, 18, true);

        this.button(layer, 'EndingRestart', '重开新局', -92, -112, 150, 34, () => {
            sys.localStorage.removeItem('tangwar_save_v1');
            game.restart();
        });
        this.button(layer, 'EndingLinger', '再观天下', 92, -112, 150, 34, () => {
            layer.destroy();
            this.endingShown = false;
            this.showToast('天下已定，可自由巡视疆土', 'normal');
        });
        this.entrance(seal, 0);
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
        roadGraphics.lineCap = Graphics.LineCap.ROUND;
        roadGraphics.lineWidth = 9;
        roadGraphics.strokeColor = new Color(6, 5, 4, 190);
        roadGraphics.moveTo(-300, -25);
        roadGraphics.bezierCurveTo(-150, 52, 50, -45, 292, 23);
        roadGraphics.stroke();
        roadGraphics.lineWidth = 2.5;
        roadGraphics.strokeColor = C.gold;
        roadGraphics.moveTo(-300, -25);
        roadGraphics.bezierCurveTo(-150, 52, 50, -45, 292, 23);
        roadGraphics.stroke();
        stage.addChild(road);

        this.label(stage, '太原', 14, C.paper, -305, -55, 82, 24, true);
        this.label(stage, option.target, 14, C.gold, 300, 53, 100, 24, true);
        this.battleBanner(stage, -276, 23, C.cinnabar, false);
        this.battleBanner(stage, 261, 51, C.gold, true);
        const unit = this.image(stage, 'TangVanguard', 'redesign/icons/step-march/texture', 48, 48, -300, -23, 5);
        const enemy = this.image(stage, 'EnemyFormation', 'redesign/icons/step-battle/texture', 54, 54, 285, 18, 5);
        const escorts = [
            this.image(stage, 'TangEscort_1', 'redesign/icons/step-march/texture', 30, 30, -337, -38, 4),
            this.image(stage, 'TangEscort_2', 'redesign/icons/step-march/texture', 30, 30, -360, -12, 4)
        ];
        escorts.forEach((escort, i) => {
            const escortOpacity = escort.addComponent(UIOpacity);
            escortOpacity.opacity = 120;
            tween(escort)
                .to(0.72 * (i + 1) * 0.72, { position: new Vec3(-116 - (i + 1) * 22, 28 - i * 12, 4) }, { easing: 'sineInOut' })
                .to(0.7 * (i + 1) * 0.72, { position: new Vec3(92 - (i + 1) * 22, -10 - i * 10, 4) }, { easing: 'sineInOut' })
                .to(0.58 * (i + 1) * 0.72, { position: new Vec3(250 - (i + 1) * 22, 15 - i * 8, 4) }, { easing: 'quadIn' })
                .start();
            tween(escortOpacity).to(0.5, { opacity: 190 }).to(0.5, { opacity: 120 }).union().repeatForever().start();
        });
        const soldiers = [unit, ...escorts];
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
            soldiers.slice(1).forEach((soldier) => Tween.stopAllByTarget(soldier));
            Tween.stopAllByTarget(flashOpacity);
            stage.active = false;
            enemy.active = false;
            unit.active = false;
            soldiers.slice(1).forEach((soldier) => { soldier.active = false; });
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
        if (option.key === 'raid') {
            this.battleArrow(stage, 258, 28, 124, 1, 0.86 * speed, 0.12 * speed);
            this.battleArrow(stage, 274, 18, 142, 10, 0.86 * speed, 0.24 * speed);
            this.battleArrow(stage, 248, 8, 104, -4, 0.86 * speed, 0.36 * speed);
            tween(layer).delay(1.45 * speed).call(() => {
                if (revealed) return;
                this.battleDust(stage, 124, 1, C.muted, 0.42);
                this.battleImpact(stage, 124, 1, C.gold);
            }).start();
        } else if (option.key === 'defend') {
            this.battleArrow(stage, 258, 28, -170, -8, 0.92 * speed, 0.6 * speed);
            this.battleArrow(stage, 272, 18, -155, 4, 0.92 * speed, 0.78 * speed);
            tween(layer).delay(1.22 * speed).call(() => {
                if (revealed) return;
                this.battleImpact(stage, -154, 0, C.gold);
                this.battleDust(stage, -154, 0, C.bronze, 0.28);
            }).start();
        } else {
            tween(layer).delay(1.18 * speed).call(() => {
                if (revealed) return;
                this.battleDust(stage, 232, 14, C.gold, 0.38);
                this.battleImpact(stage, 232, 14, C.green);
            }).start();
        }
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

    private battleBanner(parent: Node, x: number, y: number, color: Color, flip: boolean): Node {
        const banner = new Node('BattleBanner');
        banner.layer = Layers.Enum.UI_2D;
        banner.addComponent(UITransform).setContentSize(42, 68);
        banner.setPosition(x, y, 4);
        const g = banner.addComponent(Graphics);
        g.lineWidth = 2;
        g.strokeColor = new Color(8, 7, 5, 220);
        g.moveTo(0, -28);
        g.lineTo(0, 28);
        g.stroke();
        g.fillColor = color;
        g.moveTo(2, 22);
        g.lineTo(flip ? -19 : 22, 15);
        g.lineTo(flip ? -15 : 18, 4);
        g.lineTo(flip ? -20 : 24, -6);
        g.lineTo(2, -13);
        g.lineTo(2, 22);
        g.fill();
        parent.addChild(banner);
        tween(banner).to(0.75, { angle: flip ? -3 : 3 }, { easing: 'sineInOut' }).to(0.75, { angle: flip ? 3 : -3 }, { easing: 'sineInOut' }).union().repeatForever().start();
        return banner;
    }

    private battleDust(parent: Node, x: number, y: number, color: Color, scale = 0.4): Node {
        const dust = new Node('BattleDust');
        dust.layer = Layers.Enum.UI_2D;
        dust.addComponent(UITransform).setContentSize(52, 34);
        dust.setPosition(x, y, 6);
        const g = dust.addComponent(Graphics);
        g.fillColor = new Color(color.r, color.g, color.b, 175);
        g.circle(-16, -2, 8);
        g.circle(0, 3, 12);
        g.circle(15, -1, 7);
        g.fill();
        parent.addChild(dust);
        dust.setScale(scale, scale, 1);
        const opacity = dust.addComponent(UIOpacity);
        opacity.opacity = 0;
        tween(dust).to(0.18, { scale: new Vec3(scale * 1.2, scale * 1.2, 1) }, { easing: 'quadOut' }).to(0.58, { scale: new Vec3(scale * 1.8, scale * 1.45, 1) }, { easing: 'sineOut' }).call(() => dust.destroy()).start();
        tween(opacity).to(0.08, { opacity: 185 }).to(0.52, { opacity: 0 }).start();
        return dust;
    }

    private battleArrow(parent: Node, fromX: number, fromY: number, toX: number, toY: number, duration: number, delay: number): Node {
        const arrow = new Node('BattleArrow');
        arrow.layer = Layers.Enum.UI_2D;
        arrow.addComponent(UITransform).setContentSize(28, 10);
        arrow.setPosition(fromX, fromY, 7);
        const g = arrow.addComponent(Graphics);
        g.lineWidth = 2;
        g.lineCap = Graphics.LineCap.ROUND;
        g.strokeColor = C.gold;
        g.moveTo(-11, 0);
        g.lineTo(7, 0);
        g.stroke();
        g.fillColor = C.gold;
        g.moveTo(5, 4);
        g.lineTo(12, 0);
        g.lineTo(5, -4);
        g.lineTo(5, 4);
        g.fill();
        arrow.angle = Math.atan2(toY - fromY, toX - fromX) * 180 / Math.PI;
        parent.addChild(arrow);
        arrow.setScale(0.2, 0.2, 1);
        const opacity = arrow.addComponent(UIOpacity);
        opacity.opacity = 0;
        tween(arrow).delay(delay).to(0.08, { scale: Vec3.ONE }, { easing: 'quadOut' }).to(duration, { position: new Vec3(toX, toY, 7) }, { easing: 'quadIn' }).call(() => arrow.destroy()).start();
        tween(opacity).delay(delay).to(0.08, { opacity: 230 }).delay(Math.max(0.05, duration - 0.18)).to(0.1, { opacity: 0 }).start();
        return arrow;
    }

    private battleImpact(parent: Node, x: number, y: number, color: Color): Node {
        const impact = new Node('BattleImpact');
        impact.layer = Layers.Enum.UI_2D;
        impact.addComponent(UITransform).setContentSize(52, 52);
        impact.setPosition(x, y, 8);
        const g = impact.addComponent(Graphics);
        g.lineWidth = 2;
        g.lineCap = Graphics.LineCap.ROUND;
        g.strokeColor = color;
        for (let i = 0; i < 8; i++) {
            const a = (Math.PI * 2 * i) / 8;
            g.moveTo(Math.cos(a) * 7, Math.sin(a) * 7);
            g.lineTo(Math.cos(a) * 21, Math.sin(a) * 21);
        }
        g.stroke();
        g.fillColor = new Color(color.r, color.g, color.b, 220);
        g.circle(0, 0, 5);
        g.fill();
        parent.addChild(impact);
        impact.setScale(0.45, 0.45, 1);
        const opacity = impact.addComponent(UIOpacity);
        opacity.opacity = 0;
        tween(impact).to(0.13, { scale: new Vec3(1.28, 1.28, 1) }, { easing: 'quadOut' }).to(0.3, { scale: Vec3.ONE }, { easing: 'sineOut' }).call(() => impact.destroy()).start();
        tween(opacity).to(0.06, { opacity: 255 }).to(0.32, { opacity: 0 }).start();
        return impact;
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
        const node = this.panel(parent, name, width, height, new Color(27, 24, 19, 252), x, y, T.radius.control, C.bronzeSoft);
        this.rect(node, `${name}_TopLine`, Math.max(12, width - 10), 1, new Color(226, 190, 111, 92), 0, height / 2 - 3);
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
        // Graphics 与 Sprite 都是 RenderableComponent，Cocos 不允许它们挂在同一节点。
        // 保留背景节点的尺寸与层级，把九宫格贴图放到专用子节点，避免运行时换肤失败。
        if (g) {
            g.clear();
            g.enabled = false;
        }
        const textureName = `${node.name}_Texture`;
        let textureNode = node.getChildByName(textureName);
        if (!textureNode) {
            textureNode = new Node(textureName);
            textureNode.layer = Layers.Enum.UI_2D;
            node.addChild(textureNode);
            textureNode.setSiblingIndex(0);
        }
        const size = node.getComponent(UITransform)!.contentSize;
        const transform = textureNode.getComponent(UITransform) ?? textureNode.addComponent(UITransform);
        transform.setContentSize(size.width, size.height);
        textureNode.setPosition(0, 0, 0);
        const sprite = textureNode.getComponent(Sprite) ?? textureNode.addComponent(Sprite);
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
        this.orderGlow = this.image(this.reportPanel, 'OrderGlow', 'redesign/effects/glow-warm/texture', 126, 126, 0, -panelH / 2 + 45, 2);
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

    /** 系统页专用细金属框：双线、低对比内描边与四角短饰线，保证大尺寸仍然克制。 */
    private drawPageFrame(g: Graphics, width: number, height: number): void {
        const hw = width / 2;
        const hh = height / 2;
        const outer = 1.5;
        const inner = 6;
        g.strokeColor = new Color(142, 110, 62, 230);
        g.lineWidth = outer;
        g.rect(-hw + 1, -hh + 1, width - 2, height - 2);
        g.strokeColor = new Color(226, 190, 111, 82);
        g.lineWidth = 1;
        g.rect(-hw + inner, -hh + inner, width - inner * 2, height - inner * 2);
        const corner = 24;
        g.strokeColor = new Color(226, 190, 111, 170);
        g.lineWidth = 1.25;
        const x = hw - 10;
        const y = hh - 10;
        for (const sx of [-1, 1]) {
            for (const sy of [-1, 1]) {
                const ox = sx * x;
                const oy = sy * y;
                g.moveTo(ox - sx * corner, oy);
                g.lineTo(ox, oy);
                g.lineTo(ox, oy - sy * corner);
            }
        }
        g.stroke();
    }

    /** 数值条统一用于关系、进度与强度表达，避免只靠红绿文字传达状态。 */
    private drawValueBar(parent: Node, x: number, y: number, width: number, progress: number, color: Color): void {
        const value = Math.max(0, Math.min(1, progress));
        this.rect(parent, 'ValueBarTrack', width, 4, new Color(8, 8, 7, 210), x, y, 2, C.bronzeSoft);
        const fillW = Math.max(3, width * value);
        this.rect(parent, 'ValueBarFill', fillW, 4, color, x - width / 2 + fillW / 2, y, 2);
    }

    /** 古风拨片开关：轨道显示状态，圆形印珠提供明确的开/关位置反馈。 */
    private buildSettingSwitch(parent: Node, on: boolean, x: number, y: number): Node {
        const track = this.panel(parent, 'SettingSwitch', 70, 28, on ? new Color(126, 42, 32, 255) : new Color(50, 49, 45, 255), x, y, 14, on ? C.gold : C.bronzeSoft, false);
        const knobX = on ? 20 : -20;
        const knob = this.panel(track, 'SwitchKnob', 24, 24, on ? C.gold : C.muted, knobX, 0, 12, on ? C.paper : C.bronzeSoft, false);
        this.label(knob, on ? '开' : '关', 10, on ? C.ink : C.panel, 0, 0, 20, 18, true);
        return track;
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

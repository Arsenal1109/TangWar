import {
    _decorator,
    Color,
    Component,
    Graphics,
    HorizontalTextAlignment,
    Label,
    Layers,
    Node,
    resources,
    Sprite,
    SpriteFrame,
    Texture2D,
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

const C = {
    ink: new Color(12, 12, 11, 248),
    inkSoft: new Color(22, 21, 18, 242),
    panel: new Color(19, 18, 16, 250),
    panelSoft: new Color(35, 30, 24, 244),
    wood: new Color(60, 43, 29, 252),
    bronze: new Color(142, 110, 62, 255),
    bronzeSoft: new Color(113, 87, 51, 210),
    gold: new Color(226, 190, 111, 255),
    paper: new Color(235, 219, 178, 255),
    muted: new Color(172, 152, 112, 255),
    cinnabar: new Color(157, 43, 33, 255),
    cinnabarHot: new Color(225, 72, 45, 255),
    green: new Color(118, 178, 93, 255),
    red: new Color(218, 72, 55, 255),
    shade: new Color(0, 0, 0, 86)
};

const COUNCIL: CouncilOption[] = [
    { key: 'defend', title: '防御', short: '固守待援', detail: '坚壁清野，修整城防并稳住军心', target: '太原', turns: 1, odds: 86, food: -300 },
    { key: 'raid', title: '突袭', short: '袭击敌军', detail: '轻骑穿越井陉，抢在敌援之前夺关', target: '井陉关', turns: 2, odds: 68, food: -600 },
    { key: 'pacify', title: '安抚', short: '招抚降附', detail: '安抚河东乡勇，扩充兵源并提升民心', target: '河东', turns: 1, odds: 74, food: -400 }
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
    private resourceLabel!: Label;
    private toastLabel!: Label;
    private reportPanel!: Node;
    private reportBadge!: Label;
    private reportBody!: Node;
    private pagePanel!: Node;
    private navNodes = new Map<PageKey, Node>();
    private councilNodes = new Map<CouncilKey, Node>();
    private routeLayer!: Node;
    private radialLayer!: Node;
    private timelineLayer!: Node;
    private orderButton!: Node;
    private holdFill!: Node;
    private holdLabel!: Label;
    private holdTimer = 0;
    private holding = false;
    private committed = false;
    private settings = { music: true, vibration: true, fastText: false };

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
        this.width = visible.width;
        this.height = visible.height;
        this.mapWidth = this.width - 194;
        this.node.layer = Layers.Enum.UI_2D;
        this.node.addComponent(UITransform).setContentSize(this.width, this.height);
        this.buildMap();
        this.buildHeader();
        this.buildWorldControls();
        this.buildReportDrawer();
        this.buildBottomNav();
        this.buildPagePanel();
        this.buildToast();
        this.selectCouncil('raid');
        this.refreshHeader();
        this.playIntro();
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
        const header = this.rect(this.node, 'TopBar', this.width, 40, new Color(10, 10, 9, 246), 0, y, 0, C.bronzeSoft);
        const seal = this.rect(header, 'TangSeal', 34, 34, C.cinnabar, -this.width / 2 + 25, 0, 17, C.gold);
        this.label(seal, '唐', 18, C.paper, 0, 0, 30, 28, true);
        this.eraLabel = this.label(header, '', 17, C.gold, -this.width / 2 + 126, 7, 154, 24, false, HorizontalTextAlignment.LEFT);
        this.label(header, '唐 · 李渊', 13, C.paper, -this.width / 2 + 126, -10, 154, 20, false, HorizontalTextAlignment.LEFT);
        this.resourceLabel = this.label(header, '', 16, C.gold, -40, 0, 360, 30, true);
    }

    private buildWorldControls(): void {
        this.buildRadialCouncil();
        this.buildRoute();
        this.buildCampaignTimeline();
        const battleTab = this.rect(this.node, 'BattleReportTab', 48, 62, C.panel, -this.width / 2 + this.mapWidth - 26, 108, 2, C.bronze);
        this.label(battleTab, '战报', 14, C.gold, 0, 11, 42, 23, true);
        this.rect(battleTab, 'BadgeBg', 20, 20, C.cinnabar, 0, -18, 10);
        this.reportBadge = this.label(battleTab, String(this.reportCount), 11, C.paper, 0, -18, 18, 18, true);
        battleTab.on(Node.EventType.TOUCH_END, () => this.openPage('intel'), this);
    }

    private buildRadialCouncil(): void {
        const center = this.rect(this.radialLayer, 'Taiyuan', 72, 34, C.cinnabar, -76, 77, 2, C.gold);
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
        const card = this.rect(this.radialLayer, 'TaiyuanDetail', 160, 102, new Color(24, 22, 18, 246), -112, -2, 3, C.bronze);
        this.label(card, '太原', 18, C.gold, -48, 32, 58, 24, true, HorizontalTextAlignment.LEFT);
        this.label(card, '我方城池', 10, C.muted, 26, 32, 68, 19);
        this.label(card, '守军  8,000\n城防  68%\n粮草  +600/回合', 11, C.paper, -16, 1, 116, 45, false, HorizontalTextAlignment.LEFT);
        this.button(card, 'CityRecruit', '调兵', -40, -38, 66, 24, () => this.openPage('army'));
        this.button(card, 'CityManage', '城内', 40, -38, 66, 24, () => this.openPage('cities'));
    }

    private buildCampaignTimeline(): void {
        this.timelineLayer = this.rect(
            this.node,
            'CampaignTimeline',
            this.mapWidth - 10,
            84,
            new Color(15, 15, 14, 248),
            -this.width / 2 + this.mapWidth / 2,
            -this.height / 2 + 46,
            0,
            C.bronze
        );
        this.refreshTimeline();
    }

    private refreshTimeline(): void {
        if (!this.timelineLayer) return;
        this.timelineLayer.removeAllChildren();
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
            if (selected) this.rect(this.timelineLayer, 'TargetStep', cellW - 2, 61, new Color(97, 45, 31, 248), x, -10, 1, C.gold);
            if (index > 0) this.rect(this.timelineLayer, `StepRule${index}`, 1, 57, C.bronzeSoft, x - cellW / 2, -10);
            this.label(this.timelineLayer, title, 10, selected ? C.paper : C.muted, x, 7, cellW - 5, 17, selected);
            this.label(this.timelineLayer, value, 11, index === 6 ? C.red : C.gold, x + 8, -17, cellW - 21, 19, true);
            this.image(this.timelineLayer, `TimelineIcon_${icons[index]}`, `redesign/icons/${icons[index]}/texture`, 18, 18, x - cellW / 2 + 13, -17, 4);
        });
        const line = this.rect(this.timelineLayer, 'ProgressLine', this.mapWidth - 62, 2, C.gold, 0, -37);
        line.setSiblingIndex(0);
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
        const forecast = this.rect(this.routeLayer, 'RouteForecast', 116, 39, new Color(20, 22, 20, 238), 22, 77, 2, C.bronzeSoft);
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

    private buildCityMarker(name: string, x: number, y: number, own: boolean, target = false): void {
        const color = target ? C.cinnabar : own ? new Color(90, 62, 38, 245) : new Color(36, 48, 47, 240);
        const marker = this.rect(this.node, `City_${name}`, target ? 76 : 61, 27, color, x, y, 2, target ? C.gold : C.bronzeSoft);
        this.label(marker, name, target ? 14 : 13, C.paper, 0, 0, target ? 70 : 55, 22, true);
        marker.on(Node.EventType.TOUCH_END, () => target ? this.selectCouncil('raid') : this.showToast(`${name} · ${own ? '我方城池' : '斥候资料已更新'}`), this);
    }

    private buildReportDrawer(): void {
        const panelW = 194;
        const panelH = this.height - 4;
        this.reportPanel = this.rect(this.node, 'CouncilRail', panelW, panelH, C.panel, this.width / 2 - panelW / 2 - 2, 0, 0, C.bronze);
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

        this.orderButton = this.rect(this.reportPanel, 'HoldOrder', 96, 96, C.cinnabar, 0, -panelH / 2 + 54, 48, C.gold);
        this.rect(this.orderButton, 'OrderInner', 84, 84, new Color(177, 55, 37, 255), 0, 0, 42, C.gold);
        this.holdFill = this.rect(this.orderButton, 'HoldFill', 80, 80, new Color(229, 121, 61, 220), 0, 0, 40, C.gold);
        this.holdFill.setScale(0.01, 0.01, 1);
        this.holdLabel = this.label(this.orderButton, '按住\n传令', 19, C.paper, 0, 0, 70, 51, true);
        this.orderButton.on(Node.EventType.TOUCH_START, () => this.onHoldStart(), this);
        this.orderButton.on(Node.EventType.TOUCH_END, () => this.onHoldEnd(), this);
        this.orderButton.on(Node.EventType.TOUCH_CANCEL, () => this.onHoldEnd(), this);
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
        this.label(this.reportBody, '选择一项军议生效', 10, C.muted, 38, 72, 100, 18);
        COUNCIL.forEach((option, index) => {
            const selected = option.key === this.selected;
            const card = this.rect(this.reportBody, `Council_${option.key}`, 178, 48, selected ? new Color(95, 43, 30, 255) : C.panelSoft, 0, 37 - index * 54, 2, selected ? C.gold : C.bronzeSoft);
            this.image(card, `CouncilIcon_${option.key}`, `redesign/icons/council-${option.key}/texture`, 31, 31, -66, 0, 4);
            this.label(card, `${option.title}${option.target}`, 14, C.paper, -3, 9, 96, 21, true);
            this.label(card, option.key === 'defend' ? '城防+20% · 士气-10' : option.key === 'raid' ? '胜率+15% · 行军-1回合' : '粮草+800 · 民心+5', 10, option.key === 'defend' ? C.green : option.key === 'raid' ? C.gold : C.green, 8, -12, 130, 18);
            card.on(Node.EventType.TOUCH_END, () => this.selectCouncil(option.key), this);
            this.councilNodes.set(option.key, card);
        });
    }

    private buildBottomNav(): void {
        const navW = 42;
        const navH = 168;
        const nav = this.rect(this.node, 'MapTools', navW, navH, new Color(14, 14, 13, 248), -this.width / 2 + 24, 10, 0, C.bronzeSoft);
        const tools: Array<{ key: PageKey; label: string; icon: string }> = [
            { key: 'world', label: '地形', icon: 'tool-terrain' },
            { key: 'diplomacy', label: '势力', icon: 'tool-power' },
            { key: 'cities', label: '城池', icon: 'tool-city' },
            { key: 'intel', label: '标记', icon: 'tool-mark' }
        ];
        const itemH = navH / tools.length;
        tools.forEach((item, index) => {
            const y = navH / 2 - itemH / 2 - index * itemH;
            const button = this.rect(nav, `Nav_${item.key}`, navW - 2, itemH - 1, item.key === 'world' ? C.cinnabar : new Color(18, 18, 16, 230), 0, y);
            this.image(button, `NavIcon_${item.key}`, `redesign/icons/${item.icon}/texture`, 19, 19, 0, 7, 4);
            this.label(button, item.label, 10, item.key === 'world' ? C.paper : C.gold, 0, -11, navW - 6, 15, true);
            button.on(Node.EventType.TOUCH_END, () => this.openPage(item.key), this);
            this.navNodes.set(item.key, button);
        });
    }

    private buildPagePanel(): void {
        this.pagePanel = this.rect(this.node, 'SystemPage', this.width - 24, this.height - 96, C.panel, 0, -2, 3, C.bronze);
        this.pagePanel.active = false;
    }

    private buildToast(): void {
        const toast = this.rect(this.node, 'Toast', this.mapWidth - 20, 27, new Color(16, 15, 13, 238), -this.width / 2 + this.mapWidth / 2, -this.height / 2 + 99, 3, C.bronzeSoft);
        this.toastLabel = this.label(toast, '军议已就绪', 13, C.paper, 0, 0, this.mapWidth - 42, 22, true);
        toast.addComponent(UIOpacity).opacity = 0;
    }

    private openPage(key: PageKey): void {
        this.page = key;
        this.refreshNav();
        if (key === 'world') {
            this.pagePanel.active = false;
            this.radialLayer.active = true;
            this.orderButton.active = true;
            return;
        }
        this.radialLayer.active = false;
        this.orderButton.active = false;
        this.pagePanel.active = true;
        this.pagePanel.removeAllChildren();
        this.pagePanel.setScale(0.97, 0.97, 1);
        const opacity = this.pagePanel.getComponent(UIOpacity) ?? this.pagePanel.addComponent(UIOpacity);
        opacity.opacity = 0;
        tween(this.pagePanel).to(0.22, { scale: Vec3.ONE }, { easing: 'cubicOut' }).start();
        tween(opacity).to(0.18, { opacity: 255 }).start();
        this.renderPageAgain(key);
    }

    private pageHeader(title: string, subtitle: string): Node {
        const w = this.width - 24;
        const h = this.height - 96;
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
            const row = this.rect(parent, `CityRow_${city.id}`, 156, 39, selected ? C.cinnabar : C.panelSoft, -this.width / 2 + 92, 78 - i * 44, 3, selected ? C.gold : C.bronzeSoft);
            this.label(row, city.name, 15, C.paper, -46, 0, 58, 25, true, HorizontalTextAlignment.LEFT);
            this.label(row, `兵 ${this.compact(city.army)}  民 ${city.morale}`, 11, selected ? C.gold : C.muted, 32, 0, 86, 21);
            row.on(Node.EventType.TOUCH_END, () => {
                this.selectedCityId = city.id;
                this.bus.emit('city-selected', { cityId: city.id });
                this.renderPageAgain('cities');
            }, this);
        });
        const city = this.selectedCity();
        const infoX = -this.width / 2 + 92;
        this.label(parent, `${city.name} · 城况`, 16, C.paper, infoX, -48, 142, 24, true, HorizontalTextAlignment.LEFT);
        this.label(parent, `人口 ${city.population.toFixed(1)}万 · 城防 ${city.defense}\n金 ${city.gold.toLocaleString()} · 粮 ${city.food.toLocaleString()}\n驻军 ${city.army.toLocaleString()}`, 10, C.muted, infoX, -88, 148, 52, false, HorizontalTextAlignment.LEFT);
        POLICIES.slice(0, 6).forEach((policy, i) => {
            const col = i % 3;
            const row = Math.floor(i / 3);
            const card = this.rect(parent, `Policy_${policy.id}`, 165, 62, city.policyUsed ? new Color(29, 28, 25, 220) : C.panelSoft, -35 + col * 177, 59 - row * 72, 3, C.bronzeSoft);
            this.label(card, policy.name, 15, city.policyUsed ? C.muted : C.paper, -3, 15, 145, 22, true);
            this.label(card, policy.desc, 10, C.muted, -3, -13, 145, 30);
            card.on(Node.EventType.TOUCH_END, () => {
                const result = applyPolicy(city, policy.id);
                this.refreshHeader();
                this.showToast(result.ok ? `${city.name}施行「${policy.name}」成功` : result.reason);
                this.renderPageAgain('cities');
            }, this);
        });
        this.label(parent, city.policyUsed ? '本季政令已执行，推进回合后可再次施政。' : '尚未施政 · 选择一项政令立即执行', 12, city.policyUsed ? C.muted : C.green, 150, -98, 460, 24, true);
    }

    private renderArmyPage(): void {
        const parent = this.pageHeader('部队与将领', '募兵直接消耗城池黄金；点选将领可任命为当前城守将。');
        const city = this.selectedCity();
        this.label(parent, `${city.name}募兵 · 金 ${city.gold.toLocaleString()} · 总兵 ${city.army.toLocaleString()}`, 16, C.paper, -205, 82, 360, 27, true);
        TROOP_ORDER.slice(0, 5).forEach((type, i) => this.armyCard(parent, type, i));
        this.label(parent, '麾下名将', 17, C.gold, 165, 83, 130, 26, true);
        GENERALS.filter((g) => g.faction === 'tang').slice(0, 5).forEach((general, i) => {
            const row = this.rect(parent, `General_${general.id}`, 305, 32, C.panelSoft, 217, 48 - i * 37, 3, C.bronzeSoft);
            this.label(row, general.name, 14, C.paper, -102, 0, 76, 22, true, HorizontalTextAlignment.LEFT);
            this.label(row, `统${general.stats.command} 谋${general.stats.strategy} 勇${general.stats.valor}`, 11, C.muted, 30, 0, 170, 20);
            row.on(Node.EventType.TOUCH_END, () => {
                city.generalId = general.id;
                this.showToast(`${general.name}已任命为${city.name}守将`);
                this.renderPageAgain('army');
            }, this);
        });
        const assigned = GENERALS.find((g) => g.id === city.generalId);
        this.label(parent, `当前守将：${assigned?.name ?? '尚未任命'}`, 12, assigned ? C.green : C.muted, 312, 83, 166, 23, true);
    }

    private armyCard(parent: Node, type: TroopType, i: number): void {
        const city = this.selectedCity();
        const troop = TROOPS[type];
        const card = this.rect(parent, `Troop_${type}`, 154, 48, C.panelSoft, -318 + (i % 2) * 164, 43 - Math.floor(i / 2) * 56, 3, C.bronzeSoft);
        this.label(card, troop.name, 14, C.paper, -44, 10, 60, 21, true, HorizontalTextAlignment.LEFT);
        this.label(card, `${city.troops[type].toLocaleString()} · 金${troop.cost}/千`, 10, C.muted, 23, -11, 116, 18);
        card.on(Node.EventType.TOUCH_END, () => {
            const result = recruit(city, type, 1);
            this.refreshHeader();
            this.showToast(result.ok ? `${city.name}新募${troop.name}一千` : result.reason);
            this.renderPageAgain('army');
        }, this);
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
            const card = this.rect(parent, `Plan_${i}`, 380, 69, C.panelSoft, -205 + (i % 2) * 410, 52 - Math.floor(i / 2) * 82, 4, C.bronzeSoft);
            this.label(card, plan.name, 17, C.paper, -98, 13, 150, 25, true, HorizontalTextAlignment.LEFT);
            this.label(card, plan.desc, 12, C.muted, -17, -14, 310, 22, false, HorizontalTextAlignment.LEFT);
            this.label(card, '执行', 13, C.gold, 140, 0, 54, 24, true);
            card.on(Node.EventType.TOUCH_END, plan.action, this);
        });
        this.label(parent, `当前井陉守军：${this.enemyStrength.toLocaleString()} · 突袭基础胜算 ${this.currentOption().odds}%`, 13, C.gold, 0, -101, 520, 24, true);
    }

    private renderDiplomacyPage(): void {
        const parent = this.pageHeader('外交纵横', '选择势力后可进贡改善关系；关系与战争状态会随行动改变。');
        FACTIONS.filter((f) => f.id !== 'tang').slice(0, 8).forEach((faction, i) => {
            const relation = this.diplomacy.relations[faction.id] ?? 0;
            const card = this.rect(parent, `Faction_${faction.id}`, 188, 67, C.panelSoft, -300 + (i % 4) * 200, 51 - Math.floor(i / 4) * 79, 4, this.diplomacy.atWar.includes(faction.id) ? C.cinnabar : C.bronzeSoft);
            this.label(card, faction.name, 14, C.paper, -4, 18, 166, 22, true);
            this.label(card, `关系 ${relation > 0 ? '+' : ''}${relation} · ${this.diplomacy.atWar.includes(faction.id) ? '交战' : '中立'}`, 11, relation >= 20 ? C.green : relation < 0 ? C.red : C.muted, -4, -7, 164, 20);
            this.label(card, '进贡 200金', 10, C.gold, -4, -26, 150, 17);
            card.on(Node.EventType.TOUCH_END, () => this.executeDiplomacy(faction.id, faction.name), this);
        });
        this.label(parent, `大唐国库 ${this.treasury().toLocaleString()} 金 · 总兵力 ${this.tangPower().toLocaleString()}`, 13, C.gold, 0, -103, 500, 24, true);
    }

    private renderIntelPage(): void {
        const parent = this.pageHeader('情报与战报', `未读 ${this.reportCount} · 战报会记录军令、计策和天下大事。`);
        this.reportCount = 0;
        this.reportBadge.string = '0';
        this.reports.slice(0, 5).forEach((entry, i) => {
            const row = this.rect(parent, `Intel_${i}`, this.width - 70, 36, i === 0 ? new Color(54, 38, 27, 248) : C.panelSoft, 0, 70 - i * 42, 3, C.bronzeSoft);
            this.label(row, entry.title, 14, this.toneColor(entry.tone), -270, 0, 180, 23, true, HorizontalTextAlignment.LEFT);
            this.label(row, entry.body, 11, C.muted, 86, 0, this.width - 330, 22, false, HorizontalTextAlignment.LEFT);
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
            const row = this.rect(parent, `Setting_${item.key}`, 620, 52, C.panelSoft, 0, 62 - i * 63, 4, C.bronzeSoft);
            this.label(row, item.title, 16, C.paper, -225, 8, 140, 24, true, HorizontalTextAlignment.LEFT);
            this.label(row, item.desc, 11, C.muted, -80, -12, 420, 19, false, HorizontalTextAlignment.LEFT);
            const on = this.settings[item.key];
            const toggle = this.rect(row, 'Toggle', 74, 28, on ? C.cinnabar : new Color(57, 55, 50, 255), 252, 0, 14, C.bronzeSoft);
            this.label(toggle, on ? '开启' : '关闭', 12, on ? C.paper : C.muted, 0, 0, 58, 20, true);
            row.on(Node.EventType.TOUCH_END, () => {
                this.settings[item.key] = !this.settings[item.key];
                this.renderPageAgain('settings');
            }, this);
        });
        this.button(parent, 'ManualSave', '立即保存', 0, -104, 150, 34, () => {
            this.bus.emit('save-requested', {});
            this.showToast('进度已保存');
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
    }

    private onHoldEnd(): void {
        if (!this.committed) {
            this.holding = false;
            this.holdTimer = 0;
            this.holdFill.setScale(0.01, 0.01, 1);
            this.holdLabel.string = '按住\n传令';
        }
    }

    private commitOrder(): void {
        this.committed = true;
        const option = this.currentOption();
        const city = this.states.find((item) => item.id === 'taiyuan') ?? this.selectedCity();
        if (city.food < Math.abs(option.food)) {
            this.showToast('粮草不足，军令无法下达');
            this.resetOrderButton();
            return;
        }
        city.food += option.food;
        let title = '';
        let body = '';
        let tone: ReportEntry['tone'] = 'good';
        if (option.key === 'defend') {
            city.defense += 8;
            city.morale = Math.min(100, city.morale + 3);
            title = '并州防线加固';
            body = `城防提升至 ${city.defense}，军心稳固，敌军暂缓推进。`;
        } else if (option.key === 'pacify') {
            city.morale = Math.min(100, city.morale + 8);
            city.army += 600;
            city.troops.fubing += 600;
            title = '河东乡勇归附';
            body = '新得府兵六百，民心提升，后方粮道恢复。';
        } else {
            const victory = this.enemyStrength <= 10500 || this.turns.getTurnNumber() % 2 === 0;
            if (victory) {
                this.enemyStrength = Math.max(2400, this.enemyStrength - 3600);
                city.gold += 420;
                title = '奇袭井陉得胜';
                body = `李世民破敌三千六百，缴获黄金420，关隘守军降至 ${this.enemyStrength.toLocaleString()}。`;
            } else {
                city.army = Math.max(1000, city.army - 900);
                city.troops.fubing = Math.max(0, city.troops.fubing - 900);
                title = '井陉遭遇伏击';
                body = '我军折损九百，斥候已查明敌军伏兵位置。';
                tone = 'bad';
            }
        }
        this.reports.unshift({ title, body, tone });
        this.reportCount += 1;
        this.reportBadge.string = String(this.reportCount);
        this.turns.advance();
        this.bus.emit('turn-advanced', { year: this.turns.year, season: this.turns.getSeason(), turn: this.turns.getTurnNumber() });
        this.refreshReport();
        this.refreshHeader();
        this.showToast(`${title} · 已推进至${this.turns.getSeason()}`);
        this.flashRoute();
        this.resetOrderButton();
    }

    private resetOrderButton(): void {
        this.holding = false;
        this.holdTimer = 0;
        this.holdFill.setScale(0.01, 0.01, 1);
        this.holdLabel.string = '按住\n传令';
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
        this.showToast(result.ok ? `计策成功：${target.name}民心下降` : result.reason);
        this.renderPageAgain('strategy');
    }

    private executePlan(name: string, cost: number, damage: number): void {
        const source = this.states.find((city) => city.faction === 'tang');
        if (!source || source.gold < cost) return this.showToast('黄金不足');
        source.gold -= cost;
        this.enemyStrength = Math.max(2400, this.enemyStrength - damage);
        this.reports.unshift({ title: `${name}成功`, body: `井陉守军削弱 ${damage.toLocaleString()}，新的战机已经出现。`, tone: 'good' });
        this.reportCount += 1;
        this.refreshHeader();
        this.showToast(`${name}成功 · 敌军-${damage.toLocaleString()}`);
        this.renderPageAgain('strategy');
    }

    private executeDiplomacy(factionId: string, factionName: string): void {
        const result = performDiplo(this.diplomacy, 'tang', factionId, 'tribute', { gold: this.treasury(), prestige: 82, armyPower: this.tangPower(), rng: () => 0.2 });
        if (result.ok) this.deductTreasury(result.goldCost);
        this.reports.unshift({ title: `使者赴${factionName}`, body: result.ok ? `${factionName}关系改善。` : result.reason, tone: result.ok ? 'good' : 'bad' });
        this.reportCount += 1;
        this.refreshHeader();
        this.showToast(result.ok ? `${factionName}关系 +${result.relationsDelta}` : result.reason);
        this.renderPageAgain('diplomacy');
    }

    private toggleReport(force?: boolean): void {
        this.reportOpen = force ?? true;
        this.openPage('intel');
    }

    private refreshHeader(): void {
        this.eraLabel.string = `${TurnManager.eraName(this.turns.year)} · ${this.turns.getSeason()}`;
        const own = this.states.filter((city) => city.faction === 'tang');
        const gold = own.reduce((sum, city) => sum + city.gold, 0);
        const food = own.reduce((sum, city) => sum + city.food, 0);
        const army = own.reduce((sum, city) => sum + city.army, 0);
        const morale = own.length ? Math.round(own.reduce((sum, city) => sum + city.morale, 0) / own.length) : 0;
        this.resourceLabel.string = `粮 ${this.compact(food)}     金 ${this.compact(gold)}     兵 ${this.compact(army)}     民心 ${morale}`;
    }

    private refreshNav(): void {
        for (const [key, node] of this.navNodes) {
            const selected = key === this.page || (this.page === 'settings' && key === 'world');
            const g = node.getComponent(Graphics)!;
            const size = node.getComponent(UITransform)!.contentSize;
            g.clear();
            g.fillColor = selected ? C.cinnabar : new Color(18, 18, 16, 230);
            g.rect(-size.width / 2, -size.height / 2, size.width, size.height);
            g.fill();
            const label = node.children.find((child) => child.getComponent(Label))?.getComponent(Label);
            if (label) label.color = selected ? C.paper : C.gold;
        }
    }

    private renderPageAgain(key: PageKey): void {
        this.pagePanel.removeAllChildren();
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

    private showToast(text: string): void {
        this.toastLabel.string = text;
        const opacity = this.toastLabel.node.parent!.getComponent(UIOpacity)!;
        tween(opacity).stop();
        opacity.opacity = 0;
        tween(opacity).to(0.16, { opacity: 255 }).delay(1.5).to(0.28, { opacity: 0 }).start();
    }

    private flashRoute(): void {
        const opacity = this.routeLayer.getComponent(UIOpacity) ?? this.routeLayer.addComponent(UIOpacity);
        tween(opacity).to(0.12, { opacity: 35 }).to(0.12, { opacity: 255 }).to(0.12, { opacity: 35 }).to(0.18, { opacity: 255 }).start();
    }

    private playIntro(): void {
        this.radialLayer.setScale(0.72, 0.72, 1);
        const opacity = this.radialLayer.addComponent(UIOpacity);
        opacity.opacity = 0;
        tween(this.radialLayer).delay(0.2).to(0.5, { scale: Vec3.ONE }, { easing: 'backOut' }).start();
        tween(opacity).delay(0.2).to(0.35, { opacity: 255 }).start();
    }

    private button(parent: Node, name: string, text: string, x: number, y: number, width: number, height: number, onTap: () => void): Node {
        const node = this.rect(parent, name, width, height, C.panelSoft, x, y, 3, C.bronzeSoft);
        this.label(node, text, 13, C.gold, 0, 0, width - 8, height - 4, true);
        node.on(Node.EventType.TOUCH_END, onTap, this);
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
        node.setPosition(x, y, 3);
        parent.addChild(node);
        return label;
    }
}

import { _decorator, Component, Graphics, UITransform, Node, Color, Label } from 'cc';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../Bootstrap';
import type { CityDef } from '../core/Types';
import { getFaction } from '../data/Factions';
import { InkTheme } from '../ui/InkTheme';

const { ccclass } = _decorator;

const VIEW_W = 640;
const VIEW_H = 560;

// 势力领土（粗示意多边形，viewBox 坐标）
const TERRITORY: Record<string, string> = {
    liang: 'M150 208 L206 214 L204 258 L154 250 Z',
    qin: 'M186 236 L238 232 L242 286 L196 290 Z',
    liu: 'M208 172 L276 158 L300 178 L292 212 L252 216 L216 206 Z',
    xia: 'M306 130 L368 120 L400 142 L412 186 L406 252 L392 262 L338 238 L320 214 L308 206 Z',
    yan: 'M326 130 L372 124 L378 158 L350 168 L330 162 Z',
    tang: 'M238 218 L260 196 L298 190 L326 200 L328 236 L300 268 L268 286 L244 266 Z',
    zheng: 'M278 246 L330 244 L330 286 L278 288 Z',
    wa: 'M304 252 L378 256 L380 292 L306 292 Z',
    sui: 'M344 306 L378 306 L378 330 L344 330 Z',
    wu: 'M338 288 L388 290 L386 318 L338 316 Z',
    shen: 'M364 298 L424 308 L424 386 L378 392 L364 374 Z',
    lin: 'M320 374 L372 378 L366 414 L326 408 Z',
    chu: 'M232 330 L332 338 L384 418 L352 482 L268 472 L230 398 Z'
};

const RIVERS = [
    { d: 'M140 235 L230 248 L300 255 L360 268 L400 252 L450 240 L505 252', name: '黄河', nx: 180, ny: 244 },
    { d: 'M228 360 L270 352 L300 346 L340 328 L360 316 L388 312 L415 330 L470 340', name: '长江', nx: 252, ny: 368 }
];

@ccclass('MapRenderer')
export class MapRenderer extends Component {
    private cities: CityDef[] = [];
    private selectedCityId: string | null = null;
    private graphics!: Graphics;
    private root!: Node;

    init(bus: EventBus<GameEvents>, cities: CityDef[]): this {
        this.cities = cities;
        this.createCanvas();
        this.drawAll();
        this.drawCityLabels();
        bus.on('city-selected', (p) => {
            this.selectedCityId = p.cityId;
            this.drawAll();
        });
        return this;
    }

    private createCanvas(): void {
        const rt = this.node.addComponent(UITransform);
        rt.setContentSize(VIEW_W * 2, VIEW_H * 2);

        // 纸色底
        const bg = new Node('Paper');
        bg.addComponent(UITransform).setContentSize(VIEW_W * 2, VIEW_H * 2);
        const bgG = bg.addComponent(Graphics);
        bgG.fillColor = InkTheme.paper;
        bgG.rect(-VIEW_W, -VIEW_H, VIEW_W * 2, VIEW_H * 2);
        bgG.fill();
        this.node.addChild(bg);

        // 主绘图图层
        this.root = new Node('Map');
        this.root.addComponent(UITransform).setContentSize(VIEW_W * 2, VIEW_H * 2);
        this.graphics = this.root.addComponent(Graphics);
        this.node.addChild(this.root);
    }

    private toLocal(x: number, y: number): { x: number; y: number } {
        // SVG 设计稿的 Y 轴向下，Cocos UI 的 Y 轴向上，必须翻转后才能与原稿一致。
        return { x: (x - VIEW_W / 2) * 2, y: (VIEW_H / 2 - y) * 2 };
    }

    private drawAll(): void {
        const g = this.graphics;
        g.clear();
        this.drawGrid(g);
        this.drawTerritory(g);
        this.drawRivers(g);
        this.drawRoads(g);
        this.drawCities(g);
    }

    private drawGrid(g: Graphics): void {
        g.strokeColor = new Color(138, 116, 72, 60);
        g.lineWidth = 1;
        for (let x = 0; x <= VIEW_W; x += 40) {
            const p1 = this.toLocal(x, 0);
            const p2 = this.toLocal(x, VIEW_H);
            g.moveTo(p1.x, p1.y);
            g.lineTo(p2.x, p2.y);
        }
        for (let y = 0; y <= VIEW_H; y += 40) {
            const p1 = this.toLocal(0, y);
            const p2 = this.toLocal(VIEW_W, y);
            g.moveTo(p1.x, p1.y);
            g.lineTo(p2.x, p2.y);
        }
        g.stroke();
    }

    private drawTerritory(g: Graphics): void {
        for (const key of Object.keys(TERRITORY)) {
            const f = getFaction(key);
            const col = new Color();
            col.fromHEX(f.color);
            g.fillColor = col;
            g.fillColor.a = 40;
            this.tracePath(g, TERRITORY[key]);
            g.fill();
            g.strokeColor = col;
            g.strokeColor.a = 150;
            g.lineWidth = 2;
            this.tracePath(g, TERRITORY[key]);
            g.stroke();
        }
    }

    private tracePath(g: Graphics, d: string): void {
        // 解析 "M x y L x y ..." 简式路径
        const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
        let i = 0;
        let started = false;
        while (i + 1 < nums.length) {
            const p = this.toLocal(nums[i], nums[i + 1]);
            if (!started) {
                g.moveTo(p.x, p.y);
                started = true;
            } else {
                g.lineTo(p.x, p.y);
            }
            i += 2;
        }
        g.close();
    }

    private drawRivers(g: Graphics): void {
        for (const r of RIVERS) {
            const nums = r.d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
            g.lineWidth = 6;
            g.strokeColor = new Color(63, 106, 138, 200);
            for (let i = 0; i + 1 < nums.length; i += 2) {
                const p = this.toLocal(nums[i], nums[i + 1]);
                if (i === 0) {
                    g.moveTo(p.x, p.y);
                } else {
                    g.lineTo(p.x, p.y);
                }
            }
            g.stroke();
        }
    }

    private drawRoads(g: Graphics): void {
        const roads = [
            'M270 275 L300 262', 'M298 215 L270 275', 'M300 262 L318 205',
            'M292 350 L255 355', 'M300 262 L322 270 L358 278'
        ];
        g.lineWidth = 2;
        g.strokeColor = new Color(138, 106, 63, 180);
        for (const d of roads) {
            const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
            for (let i = 0; i + 1 < nums.length; i += 2) {
                const p = this.toLocal(nums[i], nums[i + 1]);
                if (i === 0) {
                    g.moveTo(p.x, p.y);
                } else {
                    g.lineTo(p.x, p.y);
                }
            }
            g.stroke();
        }
    }

    private drawCities(g: Graphics): void {
        for (const c of this.cities) {
            const f = getFaction(c.faction);
            const p = this.toLocal(c.x, c.y);
            const col = new Color();
            col.fromHEX(f.color);
            const selected = c.id === this.selectedCityId;
            g.fillColor = col;
            g.strokeColor = selected ? Color.WHITE : new Color(51, 40, 26, 255);
            g.lineWidth = selected ? 4 : 2;
            if (c.tier === 1) {
                g.rect(p.x - 10, p.y - 10, 20, 20);
                g.fill();
                g.stroke();
            } else {
                g.circle(p.x, p.y, 7);
                g.fill();
                g.stroke();
            }
        }
    }

    private drawCityLabels(): void {
        for (const c of this.cities) {
            const labelNode = new Node(`Label_${c.name}`);
            const label = labelNode.addComponent(Label);
            label.string = c.name;
            label.fontSize = c.tier === 1 ? 26 : 22;
            label.lineHeight = 30;
            label.useSystemFont = true;
            label.color = new Color(43, 33, 22, 255);
            const p = this.toLocal(c.x, c.y);
            labelNode.setPosition(p.x, p.y + (c.tier === 1 ? 30 : 26), 1);
            this.root.addChild(labelNode);
        }
    }
}

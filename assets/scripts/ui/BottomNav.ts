import { _decorator, Component, Node, Label, UITransform } from 'cc';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../Bootstrap';
import { InkTheme } from './InkTheme';

const { ccclass } = _decorator;

const TABS = [
    { key: 'gov', text: '政', label: '内政' },
    { key: 'mil', text: '兵', label: '军事' },
    { key: 'gen', text: '将', label: '将领' },
    { key: 'dip', text: '盟', label: '外交' },
    { key: 'str', text: '谋', label: '谋略' }
];

@ccclass('BottomNav')
export class BottomNav extends Component {
    private bus!: EventBus<GameEvents>;
    private activeKey = 'gov';

    init(bus: EventBus<GameEvents>): this {
        this.bus = bus;
        this.build();
        return this;
    }

    private build(): void {
        const rt = this.node.addComponent(UITransform);
        rt.setContentSize(750, 140);
        this.node.setPosition(0, -667 + 70, 2);

        TABS.forEach((t, i) => {
            const x = -300 + i * 150;
            const n = new Node(t.label);
            n.addComponent(UITransform).setContentSize(120, 120);
            const icon = n.addComponent(Label);
            icon.string = t.text;
            icon.fontSize = 44;
            icon.lineHeight = 52;
            icon.color = InkTheme.goldText;
            icon.useSystemFont = true;
            n.setPosition(x, 20, 1);
            this.node.addChild(n);
            n.on(Node.EventType.TOUCH_END, () => {
                this.activeKey = t.key;
                console.log(`[导航] 切到「${t.label}」（功能面板 M4 实现）`);
            });
        });
    }
}

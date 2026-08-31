import { Color, Graphics, Label, Node, UITransform } from 'cc';
import { InkTheme } from './InkTheme';

/** 设计稿统一的底部宣纸抽屉。 */
export function prepareBottomSheet(node: Node, height: number, title: string, onClose: () => void): void {
    node.addComponent(UITransform).setContentSize(730, height);
    node.setPosition(0, -527 + height / 2, 3);
    const bg = node.addComponent(Graphics);
    bg.fillColor = new Color(246, 237, 207, 252);
    bg.roundRect(-365, -height / 2, 730, height, 28);
    bg.fill();
    bg.strokeColor = InkTheme.cinnabar;
    bg.lineWidth = 3;
    bg.roundRect(-365, -height / 2, 730, height, 28);
    bg.stroke();

    const handle = new Node('Handle');
    handle.addComponent(UITransform).setContentSize(86, 8);
    const hg = handle.addComponent(Graphics);
    hg.fillColor = new Color(201, 184, 119, 255);
    hg.roundRect(-43, -4, 86, 8, 4);
    hg.fill();
    handle.setPosition(0, height / 2 - 19, 1);
    node.addChild(handle);

    const heading = new Node('PanelHeading');
    heading.addComponent(UITransform).setContentSize(400, 50);
    const label = heading.addComponent(Label);
    label.string = title;
    label.fontSize = 30;
    label.lineHeight = 38;
    label.color = InkTheme.darkText;
    label.useSystemFont = true;
    heading.setPosition(-130, height / 2 - 58, 1);
    node.addChild(heading);

    const close = new Node('PanelClose');
    close.addComponent(UITransform).setContentSize(120, 54);
    const closeLabel = close.addComponent(Label);
    closeLabel.string = '收起';
    closeLabel.fontSize = 23;
    closeLabel.lineHeight = 30;
    closeLabel.color = InkTheme.labelText;
    closeLabel.useSystemFont = true;
    close.setPosition(292, height / 2 - 58, 1);
    close.on(Node.EventType.TOUCH_END, onClose);
    node.addChild(close);

    const rule = new Node('PanelRule');
    rule.addComponent(UITransform).setContentSize(680, 2);
    const rg = rule.addComponent(Graphics);
    rg.fillColor = new Color(201, 184, 119, 180);
    rg.rect(-340, -1, 680, 2);
    rg.fill();
    rule.setPosition(0, height / 2 - 92, 1);
    node.addChild(rule);
}

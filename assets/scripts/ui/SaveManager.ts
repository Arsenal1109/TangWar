import { _decorator, Component, sys } from 'cc';
import type { WorldState } from '../core/WorldState';
import { serializeSave, applySave } from '../core/SaveSystem';
import { SaveSlots, AUTO_SLOT, type SlotSummary } from '../core/SaveSlots';

const { ccclass } = _decorator;

// 自动存档（单槽沿用 v1 键）+ 手动三槽：引擎侧持久化桥接
@ccclass('SaveManager')
export class SaveManager extends Component {
    private slots = new SaveSlots({
        getItem: (key: string) => sys.localStorage.getItem(key),
        setItem: (key: string, value: string) => sys.localStorage.setItem(key, value),
        removeItem: (key: string) => sys.localStorage.removeItem(key)
    });

    /** 自动档：保存并落盘（每次回合推进自动调用） */
    save(world: WorldState): void {
        this.slots.save(AUTO_SLOT, serializeSave(world));
    }

    /** 手动槽位保存 */
    saveTo(slot: string, world: WorldState): void {
        this.slots.save(slot, serializeSave(world));
    }

    hasSave(): boolean {
        return this.slots.hasAny();
    }

    /** 自动档恢复 */
    load(world: WorldState): boolean {
        const data = this.slots.load(AUTO_SLOT);
        if (!data) {
            return false;
        }
        try {
            applySave(world, data);
            return true;
        } catch (e) {
            console.error('[读档] 失败', e);
            return false;
        }
    }

    /** 手动槽位恢复；成功返回 true */
    loadFrom(slot: string, world: WorldState): boolean {
        const data = this.slots.load(slot);
        if (!data) {
            return false;
        }
        try {
            applySave(world, data);
            return true;
        } catch (e) {
            console.error('[读档] 失败', e);
            return false;
        }
    }

    listSlots(): SlotSummary[] {
        return this.slots.list();
    }

    removeFrom(slot: string): void {
        this.slots.remove(slot);
    }
}

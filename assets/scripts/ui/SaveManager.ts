import { _decorator, Component, sys } from 'cc';
import type { WorldState } from '../core/WorldState';
import { serializeSave, applySave } from '../core/SaveSystem';

const { ccclass } = _decorator;

const SAVE_KEY = 'tangwar_save_v1';

// 自动存档 / 读档：引擎侧持久化桥接
@ccclass('SaveManager')
export class SaveManager extends Component {
    save(world: WorldState): void {
        const text = JSON.stringify(serializeSave(world));
        sys.localStorage.setItem(SAVE_KEY, text);

    }

    hasSave(): boolean {
        return sys.localStorage.getItem(SAVE_KEY) != null;
    }

    load(world: WorldState): boolean {
        const text = sys.localStorage.getItem(SAVE_KEY);
        if (!text) {
            return false;
        }
        try {
            applySave(world, JSON.parse(text));
            return true;
        } catch (e) {
            console.error('[读档] 失败', e);
            return false;
        }
    }
}
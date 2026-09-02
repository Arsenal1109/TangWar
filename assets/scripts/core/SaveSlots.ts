/**
 * 多存档槽（引擎无关）：自动档 1 槽 + 手动档 3 槽。
 - 存储接口由外部注入（引擎侧用 sys.localStorage，测试用内存 Map）；
 - 槽位摘要供 UI 列表展示，无需完整反序列化世界。
 */
import type { SaveData } from './SaveSystem';

export const AUTO_SLOT = 'auto';
export const MANUAL_SLOTS: string[] = ['slot1', 'slot2', 'slot3'];
export const ALL_SLOTS: string[] = [AUTO_SLOT, ...MANUAL_SLOTS];

export interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

export interface SlotSummary {
    slot: string;
    empty: boolean;
    savedAt: string;
    year: number;
    seasonIndex: number;
    turn: number;
    difficulty: string;
    tangCities: number;
    totalCities: number;
}

/** 存档键名（自动档沿用 v1 旧键，兼容既有玩家数据） */
export function slotKey(slot: string): string {
    return slot === AUTO_SLOT ? 'tangwar_save_v1' : `tangwar_save_${slot}`;
}

export class SaveSlots {
    constructor(private storage: StorageLike) {}

    save(slot: string, data: SaveData): void {
        this.storage.setItem(slotKey(slot), JSON.stringify(data));
    }

    /** 读取完整存档数据；空槽或损坏返回 null。 */
    load(slot: string): SaveData | null {
        const text = this.storage.getItem(slotKey(slot));
        if (!text) {
            return null;
        }
        try {
            return JSON.parse(text) as SaveData;
        } catch {
            return null;
        }
    }

    remove(slot: string): void {
        this.storage.removeItem(slotKey(slot));
    }

    hasAny(): boolean {
        return ALL_SLOTS.some((s) => this.storage.getItem(slotKey(s)) != null);
    }

    /** 全部槽位摘要（含空槽），UI 直接可用。 */
    list(): SlotSummary[] {
        return ALL_SLOTS.map((slot) => {
            const text = this.storage.getItem(slotKey(slot));
            if (!text) {
                return {
                    slot, empty: true, savedAt: '', year: 617, seasonIndex: 2,
                    turn: 0, difficulty: 'normal', tangCities: 0, totalCities: 0
                };
            }
            try {
                const d = JSON.parse(text) as SaveData & { difficulty?: string };
                const tangCities = d.cities.filter((c) => c.faction === 'tang').length;
                return {
                    slot,
                    empty: false,
                    savedAt: d.meta.savedAt,
                    year: d.year,
                    seasonIndex: d.seasonIndex,
                    turn: d.turn,
                    difficulty: d.difficulty ?? 'normal',
                    tangCities,
                    totalCities: d.cities.length
                };
            } catch {
                return {
                    slot, empty: true, savedAt: '', year: 617, seasonIndex: 2,
                    turn: 0, difficulty: 'normal', tangCities: 0, totalCities: 0
                };
            }
        });
    }
}

type Handler<T> = (payload: T) => void;

export class EventBus<Events extends Record<string, unknown>> {
    private handlers = new Map<keyof Events, Array<Handler<unknown>>>();

    on<K extends keyof Events>(type: K, handler: Handler<Events[K]>): void {
        const list = this.handlers.get(type) ?? [];
        list.push(handler as Handler<unknown>);
        this.handlers.set(type, list);
    }

    off<K extends keyof Events>(type: K, handler: Handler<Events[K]>): void {
        const list = this.handlers.get(type) ?? [];
        this.handlers.set(type, list.filter((h) => h !== handler));
    }

    emit<K extends keyof Events>(type: K, payload: Events[K]): void {
        const list = this.handlers.get(type) ?? [];
        for (const h of list.slice()) {
            h(payload);
        }
    }

    clear(): void {
        this.handlers.clear();
    }
}

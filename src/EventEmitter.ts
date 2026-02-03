export type Listener<T> = (data: T) => void;

export class EventEmitter<Events extends Record<string, any>> {
    private listeners: { [K in keyof Events]?: Listener<Events[K]>[] } = {};

    on<K extends keyof Events>(event: K, cb: Listener<Events[K]>) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event]!.push(cb);
    }

    // Unsubscribe from an event
    off<K extends keyof Events>(event: K, listener: Listener<Events[K]>) {
        if (!this.listeners[event]) return;
        this.listeners[event] = this.listeners[event]!.filter(l => l !== listener);
    }

    emit<K extends keyof Events>(event: K, data: Events[K]) {
        (this.listeners[event] || []).forEach(cb => cb(data));
    }
}
export type EventCallback = (...args: unknown[]) => void

/**
 * Lightweight event emitter cho internal app events.
 * Hỗ trợ on/off/once/emit.
 */
export class EventEmitter {
  private events: Map<string, Set<EventCallback>> = new Map()

  private getOrCreateEventList(eventName: string): Set<EventCallback> {
    if (!this.events.has(eventName)) {
      this.events.set(eventName, new Set())
    }
    return this.events.get(eventName)!
  }

  /**
   * Đăng ký listener cho event.
   */
  on(eventName: string, fn: EventCallback): () => void {
    this.getOrCreateEventList(eventName).add(fn)
    return () => this.off(eventName, fn)
  }

  /**
   * Đăng ký listener chỉ chạy một lần.
   */
  once(eventName: string, fn: EventCallback): () => void {
    const onceFn = (...args: unknown[]) => {
      this.off(eventName, onceFn)
      fn(...args)
    }
    this.on(eventName, onceFn)
    return () => this.off(eventName, onceFn)
  }

  /**
   * Phát sự kiện.
   */
  emit(eventName: string, ...args: unknown[]) {
    const callbacks = this.events.get(eventName)
    if (!callbacks) return
    callbacks.forEach((fn) => fn(...args))
  }

  /**
   * Hủy đăng ký listener.
   */
  off(eventName: string, fn: EventCallback) {
    const callbacks = this.events.get(eventName)
    if (!callbacks) return
    callbacks.delete(fn)
    if (callbacks.size === 0) {
      this.events.delete(eventName)
    }
  }

  /**
   * Xóa tất cả listeners của một event hoặc toàn bộ.
   */
  removeAllListeners(eventName?: string) {
    if (eventName) {
      this.events.delete(eventName)
    } else {
      this.events.clear()
    }
  }

  /**
   * Lấy số lượng listeners của một event.
   */
  listenerCount(eventName: string): number {
    return this.events.get(eventName)?.size ?? 0
  }
}

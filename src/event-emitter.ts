export type EventCallback = (...args: unknown[]) => void

/**
 * Lightweight event emitter for internal application events.
 * Supports on/off/once/emit patterns.
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
   * Register a listener for an event.
   * Returns an unsubscribe function.
   */
  on(eventName: string, fn: EventCallback): () => void {
    this.getOrCreateEventList(eventName).add(fn)
    return () => this.off(eventName, fn)
  }

  /**
   * Register a listener that runs only once.
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
   * Emit an event to all registered listeners.
   */
  emit(eventName: string, ...args: unknown[]) {
    const callbacks = this.events.get(eventName)
    if (!callbacks) return
    callbacks.forEach((fn) => fn(...args))
  }

  /**
   * Unregister a listener for an event.
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
   * Remove all listeners for a specific event or all events if none specified.
   */
  removeAllListeners(eventName?: string) {
    if (eventName) {
      this.events.delete(eventName)
    } else {
      this.events.clear()
    }
  }

  /**
   * Get the number of listeners for a specific event.
   */
  listenerCount(eventName: string): number {
    return this.events.get(eventName)?.size ?? 0
  }
}

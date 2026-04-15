export type EventCallback = (...args: unknown[]) => void

/**
 * Lightweight event emitter cho internal app events.
 */
export class EventEmitter {
  private events: Map<string, Set<EventCallback>> = new Map()

  private getOrCreateEventList(eventName: string): Set<EventCallback> {
    if (!this.events.has(eventName)) {
      this.events.set(eventName, new Set())
    }

    return this.events.get(eventName)!
  }

  on(eventName: string, fn: EventCallback) {
    this.getOrCreateEventList(eventName).add(fn)
  }

  once(eventName: string, fn: EventCallback) {
    const onceFn = (...args: unknown[]) => {
      this.off(eventName, onceFn)
      fn(...args)
    }

    this.on(eventName, onceFn)
  }

  emit(eventName: string, ...args: unknown[]) {
    const callbacks = this.events.get(eventName)
    if (!callbacks) return

    callbacks.forEach((fn) => fn(...args))
  }

  off(eventName: string, fn: EventCallback) {
    const callbacks = this.events.get(eventName)
    if (!callbacks) return

    callbacks.delete(fn)

    if (callbacks.size === 0) {
      this.events.delete(eventName)
    }
  }
}

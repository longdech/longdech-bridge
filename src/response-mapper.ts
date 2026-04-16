import get from "lodash/get"
import type { ListResponse, InfiniteResponse, MappingConfig } from "./types"

export class ResponseMapper {
  constructor(private readonly config: MappingConfig) {}

  mapList<T>(payload: unknown): ListResponse<T> {
    const getNumber = (path: string, fallback: number): number => {
      const value = get(payload, path)
      const num = Number(value ?? fallback)
      return isNaN(num) ? fallback : num
    }

    const dataPath = this.config.listDataPath ?? "data"
    const data = get(payload, dataPath, [])

    let currentPage = getNumber(this.config.listPagePath ?? "page", 1)
    const perPage = getNumber(
      this.config.listLimitPath ?? "limit",
      Array.isArray(data) ? data.length : 1
    )
    const total = getNumber(this.config.listTotalPath ?? "total", 0)

    if (this.config.transformPage) {
      currentPage = this.config.transformPage(currentPage)
    }

    let totalPages = getNumber(this.config.listTotalPagesPath ?? "totalPages", 0)
    if (totalPages <= 0 && perPage > 0) {
      totalPages = Math.ceil(total / perPage)
    }

    return {
      data: Array.isArray(data) ? (data as T[]) : [],
      meta: {
        currentPage,
        perPage,
        total,
        totalPages,
        hasNextPage: currentPage < totalPages,
        hasPreviousPage: currentPage > 1,
      },
    }
  }

  mapInfinite<T, C = any>(payload: unknown): InfiniteResponse<T, C> {
    const itemsPath = this.config.infiniteItemsPath ?? "items"
    const items = get(payload, itemsPath, [])

    let nextCursor = get(payload, this.config.infiniteNextCursorPath ?? "nextCursor") as
      | C
      | undefined
    let previousCursor = get(payload, this.config.infinitePrevCursorPath ?? "previousCursor") as
      | C
      | undefined

    if (this.config.transformCursor && nextCursor !== undefined) {
      nextCursor = this.config.transformCursor(nextCursor)
    }
    if (this.config.transformCursor && previousCursor !== undefined) {
      previousCursor = this.config.transformCursor(previousCursor)
    }

    const hasNextPage = this.config.infiniteHasNextPath
      ? (get(payload, this.config.infiniteHasNextPath) as boolean)
      : !!nextCursor

    const hasPreviousPage = this.config.infiniteHasPrevPath
      ? (get(payload, this.config.infiniteHasPrevPath) as boolean)
      : !!previousCursor

    return {
      items: Array.isArray(items) ? (items as T[]) : [],
      nextCursor,
      previousCursor,
      meta: { hasNextPage, hasPreviousPage },
    }
  }

  /**
   * Map single item response.
   */
  mapItem<T>(payload: unknown, dataPath: string = "data"): T {
    return get(payload, dataPath) as T
  }
}

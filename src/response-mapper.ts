import type { ListResponse, InfiniteResponse, MappingConfig, PathResolver } from "./types"

/**
 * Helper to resolve value from a payload using either a string path or a mapper function.
 * This is a lightweight replacement for lodash/get.
 */
function resolvePath<T, R>(payload: any, resolver: PathResolver<T, R> | undefined, fallback: R): R {
  if (!resolver) return fallback

  if (typeof resolver === "function") {
    try {
      return (resolver(payload) as R) ?? fallback
    } catch {
      return fallback
    }
  }

  // String path resolution: "a.b.c"
  const parts = resolver.split(".")
  let current = payload

  for (const part of parts) {
    if (current === null || current === undefined) return fallback
    current = current[part]
  }

  return (current as R) ?? fallback
}

export class ResponseMapper {
  constructor(private readonly config: MappingConfig) {}

  /**
   * Map standard list response with pagination metadata.
   */
  mapList<T>(payload: unknown): ListResponse<T> {
    const data = resolvePath(payload, this.config.listDataPath, [])
    const total = resolvePath(payload, this.config.listTotalPath, 0)

    let currentPage = resolvePath(payload, this.config.listPagePath, 1)
    if (this.config.transformPage) {
      currentPage = this.config.transformPage(currentPage)
    }

    const perPage = resolvePath(
      payload,
      this.config.listLimitPath,
      Array.isArray(data) ? data.length : 1
    )

    let totalPages = resolvePath(payload, this.config.listTotalPagesPath, 0)
    if (totalPages <= 0 && perPage > 0) {
      totalPages = Math.ceil(total / perPage)
    }

    const hasNextPage = currentPage < totalPages
    const nextPage = hasNextPage ? currentPage + 1 : null
    const hasPreviousPage = currentPage > 1

    return {
      data: Array.isArray(data) ? (data as T[]) : [],
      meta: {
        currentPage,
        perPage,
        nextPage,
        total,
        totalPages,
        hasNextPage,
        hasPreviousPage,
      },
    }
  }

  /**
   * Map infinite list response with cursor metadata.
   */
  mapInfinite<T, C = any>(payload: unknown): InfiniteResponse<T, C> {
    const items = resolvePath(payload, this.config.infiniteItemsPath, [])

    let nextCursor = resolvePath<any, C | undefined>(
      payload,
      this.config.infiniteNextCursorPath,
      undefined
    )
    let previousCursor = resolvePath<any, C | undefined>(
      payload,
      this.config.infinitePrevCursorPath,
      undefined
    )

    if (this.config.transformCursor) {
      if (nextCursor !== undefined) nextCursor = this.config.transformCursor(nextCursor)
      if (previousCursor !== undefined) previousCursor = this.config.transformCursor(previousCursor)
    }

    const hasNextPage = resolvePath(
      payload,
      this.config.infiniteHasNextPath,
      nextCursor !== undefined && nextCursor !== null
    )

    const hasPreviousPage = resolvePath(
      payload,
      this.config.infiniteHasPrevPath,
      previousCursor !== undefined && previousCursor !== null
    )

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
  mapItem<T>(payload: unknown, dataPath: string | ((p: any) => T) = "data"): T {
    return resolvePath(payload, dataPath as PathResolver<any, T>, payload as T)
  }
}

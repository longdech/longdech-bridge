/**
 * Shared primitive id type used across resources.
 */
export type Id = string | number

/**
 * Page used for infinite pagination.
 */
export type Page = string | number | null | undefined

/**
 * Path resolver can be a nested string path (e.g. "meta.total")
 * or a mapper function for maximum performance and type safety.
 */
export type PathResolver<T, R> = string | ((data: T) => R)

/**
 * Pagination metadata for list response.
 */
export interface PaginationMeta {
  currentPage: number
  perPage: number
  nextPage: number | null
  total: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

/**
 * Standard list response with metadata.
 */
export interface ListResponse<T> {
  data: T[]
  meta: PaginationMeta
}

/**
 * Standard shape for infinite list responses.
 */
export interface InfiniteResponse<T, C = Page> {
  items: T[]
  nextCursor?: C
  previousCursor?: C
  meta?: {
    hasNextPage: boolean
    hasPreviousPage: boolean
  }
}

/**
 * Mapping configuration for ResponseMapper.
 */
export interface MappingConfig {
  // List response mapping
  listDataPath?: PathResolver<any, any[]>
  listTotalPath?: PathResolver<any, number>
  listPagePath?: PathResolver<any, number>
  listLimitPath?: PathResolver<any, number>
  listTotalPagesPath?: PathResolver<any, number>

  // Infinite response mapping
  infiniteItemsPath?: PathResolver<any, any[]>
  infiniteNextCursorPath?: PathResolver<any, any>
  infinitePrevCursorPath?: PathResolver<any, any>
  infiniteHasNextPath?: PathResolver<any, boolean>
  infiniteHasPrevPath?: PathResolver<any, boolean>

  // Direct transformers
  transformPage?: (page: number) => number
  transformCursor?: (cursor: any) => any
}

/**
 * API error response shape.
 */
export interface ApiErrorResponse {
  error: string
  message: string
  statusCode: number
  errors?: Record<string, string[]>
}

/**
 * Type guard to check if payload is an API error response.
 */
export function isApiErrorResponse(payload: unknown): payload is ApiErrorResponse {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    "message" in payload &&
    "statusCode" in payload
  )
}

/**
 * Standard pagination params.
 */
export interface PaginationParams {
  page?: number
  limit?: number
  offset?: number
}

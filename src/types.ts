/**
 * Shared primitive id type used across resources.
 */
export type Id = string | number

/**
 * Page used for infinite pagination.
 */
export type Page = string | number | null | undefined

/**
 * Pagination metadata for list response.
 */
export interface PaginationMeta {
  currentPage: number
  perPage: number
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
 * Tự define theo backend của bạn, không dùng preset.
 */
export interface MappingConfig {
  // List response
  listDataPath?: string
  listTotalPath?: string
  listPagePath?: string
  listLimitPath?: string
  listTotalPagesPath?: string

  // Infinite response
  infiniteItemsPath?: string
  infiniteNextCursorPath?: string
  infinitePrevCursorPath?: string
  infiniteHasNextPath?: string
  infiniteHasPrevPath?: string

  // Transformers
  transformPage?: (page: number) => number
  transformCursor?: (cursor: any) => any
}

/**
 * API error response shape (common).
 * FE tự định nghĩa dựa trên backend của mình.
 */
export interface ApiErrorResponse {
  error: string
  message: string
  statusCode: number
  errors?: Record<string, string[]>
}

/**
 * Type guard để kiểm tra API error response.
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
 * Pagination params.
 */
export interface PaginationParams {
  page?: number
  limit?: number
  offset?: number
}

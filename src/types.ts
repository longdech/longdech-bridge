/**
 * Shared primitive id type used across resources.
 */
export type Id = string | number

/**
 * Standard API envelope used by many backends.
 */
export interface ApiResponse<TData> {
  data: TData
  success?: boolean
  message?: string
}

/**
 * Some endpoints return raw payload, others wrap into ApiResponse.
 */
export type MaybeApiResponse<TData> = TData | ApiResponse<TData>

/**
 * Cursor used for infinite pagination.
 */
export type Cursor = string | number | null | undefined

/**
 * Standard shape for cursor-based list responses.
 */
export interface InfiniteResponse<T, C = Cursor> {
  items: T[]
  nextCursor?: C
}

export function isApiResponse<TData>(
  payload: MaybeApiResponse<TData>
): payload is ApiResponse<TData> {
  return typeof payload === "object" && payload !== null && "data" in payload
}

const ENVELOPE_KEYS = ["data", "result", "payload", "response"] as const

export function unwrapApiResponse<TData>(payload: MaybeApiResponse<TData>): TData {
  if (typeof payload !== "object" || payload === null) return payload as TData

  for (const key of ENVELOPE_KEYS) {
    if (key in payload) return (payload as Record<string, TData>)[key]
  }

  return payload as TData
}

export type QueryParams = Record<string, unknown>
type QueryValue = string | number | boolean | QueryValue[] | QueryParams | null | undefined

/**
 * Sorts parameters by key to ensure deterministic query keys.
 * This prevents unnecessary refetches in React Query.
 */
function stableParams(params: QueryParams): QueryParams {
  const stableValue = (value: QueryValue): QueryValue => {
    if (Array.isArray(value)) return value.map(stableValue)
    if (value && typeof value === "object") return stableParams(value as QueryParams)
    return value
  }

  return Object.keys(params)
    .sort()
    .reduce((acc, key) => {
      const value = params[key]
      if (value === undefined) return acc
      acc[key] = stableValue(value as QueryValue)
      return acc
    }, {} as QueryParams)
}

/**
 * Query key factory for resource scoping.
 * Standardizes keys across hooks and mutations to prevent mismatches.
 *
 * @example
 * const userKeys = createQueryKeys("users")
 * userKeys.list({ page: 1 })  // ["users", "list", { page: 1 }]
 * userKeys.detail(5)          // ["users", "detail", 5]
 */
export function createQueryKeys<const T extends string>(scope: T) {
  return {
    scope,
    all: [scope] as const,
    lists: () => [scope, "list"] as const,
    list: (params?: QueryParams) =>
      params ? ([scope, "list", stableParams(params)] as const) : ([scope, "list"] as const),
    infinite: (params?: QueryParams) =>
      params
        ? ([scope, "infinite", stableParams(params)] as const)
        : ([scope, "infinite"] as const),
    details: () => [scope, "detail"] as const,
    detail: (id: string | number) => [scope, "detail", id] as const,
    /** Generate a custom key nested within the resource scope. */
    custom: (...parts: unknown[]) => [scope, ...parts] as const,
  }
}

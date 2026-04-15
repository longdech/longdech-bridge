export type QueryParams = Record<string, unknown>
type QueryValue = string | number | boolean | QueryValue[] | QueryParams | null | undefined

/**
 * Sort params by key to keep query keys deterministic.
 */
function stableParams(params: QueryParams) {
  const stableValue = (value: QueryValue): QueryValue => {
    if (Array.isArray(value)) {
      return value.map((item) => stableValue(item))
    }

    if (value && typeof value === "object") {
      return stableParams(value as QueryParams)
    }

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
 * Query key factory theo từng resource scope.
 * Dùng chung để tránh key mismatch giữa hooks/mutations.
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
  }
}

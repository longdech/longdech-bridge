import {
  useMutation,
  useQuery,
  useInfiniteQuery,
  useQueryClient,
  type UseQueryOptions,
  type UseInfiniteQueryOptions,
  type UseInfiniteQueryResult,
} from "@tanstack/react-query"

import { HttpClient, type HttpQueryParamValue, type HttpQueryParams } from "./http-client"
import {
  type Id,
  type InfiniteResponse,
  type Page,
  type ListResponse,
  type MappingConfig,
} from "./types"
import { ResponseMapper } from "./response-mapper"

interface QueryKeys<Params extends Record<string, unknown>> {
  list: (params?: Params) => readonly unknown[]
  lists: () => readonly unknown[]
  infinite: (params?: Params) => readonly unknown[]
  detail: (id: Id) => readonly unknown[]
}

interface ServiceOptions<T, Params extends Record<string, unknown>, C extends Page> {
  /**
   * Query param key for page-based pagination. Default: "page".
   */
  pageParamKey?: string
  /**
   * Override mapping configuration for this specific service.
   */
  mapping?: MappingConfig
  /**
   * Functional override for list response mapping.
   */
  mapListResponse?: (payload: unknown) => ListResponse<T>
  /**
   * Functional override for infinite response mapping.
   */
  mapInfiniteResponse?: (payload: unknown) => InfiniteResponse<T, C>
  /**
   * Functional override for getNextPageParam.
   */
  getNextPageParam?: (lastPage: InfiniteResponse<T, C>) => C | undefined
  /**
   * Direct API method overrides for edge cases.
   */
  overrides?: Partial<{
    list: (params?: Params) => Promise<ListResponse<T>>
    infinite: (params?: Params, page?: C) => Promise<InfiniteResponse<T, C>>
    detail: (id: Id) => Promise<T>
    create: (data: Partial<T>) => Promise<T>
    update: (id: Id, data: Partial<T>) => Promise<T>
    remove: (id: Id) => Promise<void>
  }>
}

/**
 * Factory to create a specialized API layer + React Query hooks for a resource.
 *
 * @param client - Shared HttpClient instance
 * @param defaultMapping - Default mapping config for all services created by this factory
 */
export function createServiceProvider(client: HttpClient, defaultMapping?: MappingConfig) {
  const toRequestParams = (params?: Record<string, unknown>): HttpQueryParams | undefined =>
    params as HttpQueryParams | undefined

  return function defineService<
    T extends { id: Id },
    Params extends Record<string, unknown> = {},
    C extends Page = Page,
  >(baseUrl: string, keys: QueryKeys<Params>, options?: ServiceOptions<T, Params, C>) {
    const pageParamKey = options?.pageParamKey ?? "page"

    // Resolve mapping: service-specific > factory-default > empty
    const mappingConfig: MappingConfig = options?.mapping ?? defaultMapping ?? {}
    const responseMapper = new ResponseMapper(mappingConfig)

    const mapListResponse =
      options?.mapListResponse ?? ((payload: unknown) => responseMapper.mapList<T>(payload))

    const mapInfiniteResponse =
      options?.mapInfiniteResponse ??
      ((payload: unknown) => responseMapper.mapInfinite<T, C>(payload))

    const getNextPageParam =
      options?.getNextPageParam ??
      ((lastPage: InfiniteResponse<T, C>) => lastPage.nextCursor ?? undefined)

    const api = {
      /**
       * Get paginated list.
       */
      list:
        options?.overrides?.list ??
        ((params?: Params): Promise<ListResponse<T>> =>
          client.get<unknown>(baseUrl, toRequestParams(params)).then(mapListResponse)),

      /**
       * Get infinite list (cursor or page based).
       */
      infinite:
        options?.overrides?.infinite ??
        ((params?: Params, page?: C): Promise<InfiniteResponse<T, C>> => {
          return client
            .get<unknown>(baseUrl, {
              ...toRequestParams(params),
              [pageParamKey]: page as HttpQueryParamValue,
            })
            .then(mapInfiniteResponse)
        }),

      /**
       * Get single item by ID.
       */
      detail:
        options?.overrides?.detail ?? ((id: Id): Promise<T> => client.get<T>(`${baseUrl}/${id}`)),

      /**
       * Create new item.
       */
      create:
        options?.overrides?.create ??
        ((data: Partial<T>): Promise<T> => client.post<T>(baseUrl, data)),

      /**
       * Update existing item.
       */
      update:
        options?.overrides?.update ??
        ((id: Id, data: Partial<T>): Promise<T> => client.put<T>(`${baseUrl}/${id}`, data)),

      /**
       * Delete item.
       */
      remove:
        options?.overrides?.remove ??
        ((id: Id): Promise<void> => client.delete<void>(`${baseUrl}/${id}`)),
    }

    const hooks = {
      /**
       * Hook for paginated list queries.
       */
      useList(
        params?: Params,
        queryOptions?: Omit<UseQueryOptions<ListResponse<T>, Error>, "queryKey" | "queryFn">
      ) {
        return useQuery({
          queryKey: keys.list(params),
          queryFn: () => api.list(params),
          ...queryOptions,
        })
      },

      /**
       * Hook for infinite list queries (React Query infinite pattern).
       */
      useInfinite(
        params?: Params,
        queryOptions?: Omit<
          UseInfiniteQueryOptions<
            InfiniteResponse<T, C>,
            Error,
            InfiniteResponse<T, C>,
            ReturnType<typeof keys.infinite>,
            C | undefined
          >,
          "queryKey" | "queryFn" | "initialPageParam" | "getNextPageParam"
        >
      ): UseInfiniteQueryResult<InfiniteResponse<T, C>, Error> {
        return useInfiniteQuery({
          queryKey: keys.infinite(params),
          queryFn: ({ pageParam }) => api.infinite(params, pageParam as C | undefined),
          initialPageParam: undefined as C | undefined,
          getNextPageParam,
          ...queryOptions,
        })
      },

      /**
       * Hook for single item detail.
       */
      useDetail(id: Id, queryOptions?: Omit<UseQueryOptions<T, Error>, "queryKey" | "queryFn">) {
        return useQuery({
          queryKey: keys.detail(id),
          queryFn: () => api.detail(id),
          enabled: id !== undefined && id !== null,
          ...queryOptions,
        })
      },

      /**
       * Mutation hook for creating items.
       * Auto-invalidates list queries on success.
       */
      useCreate() {
        const qc = useQueryClient()
        return useMutation({
          mutationFn: api.create,
          onSuccess: () => qc.invalidateQueries({ queryKey: keys.lists() }),
        })
      },

      /**
       * Mutation hook for updating items.
       * Auto-invalidates record detail and list queries on success.
       */
      useUpdate() {
        const qc = useQueryClient()
        return useMutation({
          mutationFn: ({ id, data }: { id: Id; data: Partial<T> }) => api.update(id, data),
          onSuccess: (_, { id }) => {
            qc.invalidateQueries({ queryKey: keys.detail(id) })
            qc.invalidateQueries({ queryKey: keys.lists() })
          },
        })
      },

      /**
       * Mutation hook for deleting items.
       */
      useDelete() {
        const qc = useQueryClient()
        return useMutation({
          mutationFn: api.remove,
          onSuccess: (_, id) => {
            qc.invalidateQueries({ queryKey: keys.lists() })
            qc.removeQueries({ queryKey: keys.detail(id) })
          },
        })
      },
    }

    return { api, hooks }
  }
}

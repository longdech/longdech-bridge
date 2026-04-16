// service-provider.ts
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
   * Query param key cho page, mặc định "page".
   */
  pageParamKey?: string
  /**
   * Override toàn bộ mapping config cho service này.
   */
  mapping?: MappingConfig
  /**
   * Override mapper cho list response.
   */
  mapListResponse?: (payload: unknown) => ListResponse<T>
  /**
   * Override mapper cho infinite response.
   */
  mapInfiniteResponse?: (payload: unknown) => InfiniteResponse<T, C>
  /**
   * Override getNextPageParam.
   */
  getNextPageParam?: (lastPage: InfiniteResponse<T, C>) => C | undefined
  /**
   * Custom API methods override - FIXED: added proper generic types
   */
  overrides?: Partial<{
    list: (params?: Params) => Promise<ListResponse<T>>
    infinite: (params?: Params, page?: C) => Promise<InfiniteResponse<T, C>>
    detail: (id: Id) => Promise<T>
    create: (data: Partial<T>) => Promise<T>
    update: (id: Id, data: Partial<T>) => Promise<T>
    remove: (id: Id) => Promise<void>
  }>
  /**
   * Support page-based infinite (non-cursor)
   */
  infiniteType?: "cursor" | "page"
}

/**
 * Factory tạo API layer + React Query hooks cho một resource CRUD.
 *
 * @param client - HttpClient instance
 * @param defaultMapping - MappingConfig mặc định cho toàn bộ services tạo từ factory này
 *
 * @example
 * const defineService = createServiceProvider(httpClient, {
 *   listDataPath: "data",
 *   listTotalPath: "meta.total",
 * })
 *
 * const { api, hooks } = defineService("/users", userKeys)
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

    // Priority: service mapping > default mapping > fallback rỗng
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
      list:
        options?.overrides?.list ??
        ((params?: Params): Promise<ListResponse<T>> =>
          client.get<unknown>(baseUrl, toRequestParams(params)).then(mapListResponse)),

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

      detail:
        options?.overrides?.detail ?? ((id: Id): Promise<T> => client.get<T>(`${baseUrl}/${id}`)),

      create:
        options?.overrides?.create ??
        ((data: Partial<T>): Promise<T> => client.post<T>(baseUrl, data)),

      update:
        options?.overrides?.update ??
        ((id: Id, data: Partial<T>): Promise<T> => client.put<T>(`${baseUrl}/${id}`, data)),

      remove:
        options?.overrides?.remove ??
        ((id: Id): Promise<void> => client.delete<void>(`${baseUrl}/${id}`)),
    }

    const hooks = {
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

      useDetail(id: Id, queryOptions?: Omit<UseQueryOptions<T, Error>, "queryKey" | "queryFn">) {
        return useQuery({
          queryKey: keys.detail(id),
          queryFn: () => api.detail(id),
          enabled: id !== undefined && id !== null,
          ...queryOptions,
        })
      },

      useCreate() {
        const qc = useQueryClient()
        return useMutation({
          mutationFn: api.create,
          onSuccess: () => qc.invalidateQueries({ queryKey: keys.lists() }),
        })
      },

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

import {
  useMutation,
  useQuery,
  useInfiniteQuery,
  useQueryClient,
  UseQueryOptions,
  UseInfiniteQueryOptions,
} from "@tanstack/react-query"

import { HttpClient, HttpQueryParamValue, HttpQueryParams } from "./http-client"
import { Cursor, Id, InfiniteResponse, MaybeApiResponse, unwrapApiResponse } from "./types"

interface QueryKeys<Params extends Record<string, unknown>> {
  list: (params?: Params) => readonly unknown[]
  lists: () => readonly unknown[]
  infinite: (params?: Params) => readonly unknown[]
  detail: (id: Id) => readonly unknown[]
}

interface ServiceProviderOptions<T, C extends Cursor> {
  /**
   * Tên param cursor backend yêu cầu. Mặc định là "cursor".
   */
  cursorParamKey?: string
  /**
   * Map response bất kỳ từ backend về shape chuẩn cho infinite query.
   */
  mapInfiniteResponse?: (payload: unknown) => InfiniteResponse<T, C>
  /**
   * Tuỳ chỉnh cách lấy page param kế tiếp.
   */
  getNextPageParam?: (lastPage: InfiniteResponse<T, C>) => C | undefined
}

interface InfiniteMapperConfig<T, C extends Cursor> {
  itemsPath?: string
  nextCursorPath?: string
}

const getByPath = (input: unknown, path: string): unknown => {
  return path
    .split(".")
    .reduce<unknown>((acc, key) => {
      if (acc && typeof acc === "object" && key in acc) {
        return (acc as Record<string, unknown>)[key]
      }

      return undefined
    }, input)
}

/**
 * Helper map payload backend bất kỳ về InfiniteResponse.
 * Dùng path dạng "data.items", "meta.nextCursor", ...
 */
export function createInfiniteResponseMapper<T, C extends Cursor = Cursor>(
  config: InfiniteMapperConfig<T, C> = {}
) {
  const itemsPath = config.itemsPath ?? "items"
  const nextCursorPath = config.nextCursorPath ?? "nextCursor"

  return (payload: unknown): InfiniteResponse<T, C> => {
    const normalized = unwrapApiResponse(
      payload as MaybeApiResponse<Record<string, unknown>>
    )

    const mappedItems = getByPath(normalized, itemsPath)
    const mappedNextCursor = getByPath(normalized, nextCursorPath)

    return {
      items: Array.isArray(mappedItems) ? (mappedItems as T[]) : [],
      nextCursor: mappedNextCursor as C | undefined,
    }
  }
}

/**
 * Factory tạo API layer + React Query hooks cho resource CRUD.
 * - `api`: gọi trực tiếp HTTP
 * - `hooks`: dùng trong React component
 */
export function createServiceProvider(client: HttpClient) {
  const toRequestParams = (params?: Record<string, unknown>): HttpQueryParams | undefined =>
    params as HttpQueryParams | undefined

  return function defineService<
    T extends { id: Id },
    Params extends Record<string, unknown> = {},
    C extends Cursor = Cursor
  >(
    baseUrl: string,
    keys: QueryKeys<Params>,
    options?: ServiceProviderOptions<T, C>
  ) {
    const cursorParamKey = options?.cursorParamKey ?? "cursor"
    const mapInfiniteResponse =
      options?.mapInfiniteResponse ??
      ((payload: unknown) => unwrapApiResponse(payload as MaybeApiResponse<InfiniteResponse<T, C>>))
    const getNextPageParam =
      options?.getNextPageParam ??
      ((lastPage: InfiniteResponse<T, C>) => lastPage.nextCursor ?? undefined)

    const api = {
      list: (params?: Params) =>
        client.get<T[]>(baseUrl, toRequestParams(params)),

      infinite: (params?: Params, cursor?: C) =>
        client.get<MaybeApiResponse<InfiniteResponse<T, C>>>(baseUrl, {
          ...toRequestParams(params),
          [cursorParamKey]: cursor as HttpQueryParamValue,
        }),

      detail: (id: Id) =>
        client.get<T>(`${baseUrl}/${id}`),

      create: (data: Partial<T>) =>
        client.post<T>(baseUrl, data),

      update: (id: Id, data: Partial<T>) =>
        client.put<T>(`${baseUrl}/${id}`, data),

      remove: (id: Id) =>
        client.delete<void>(`${baseUrl}/${id}`),
    }

    const hooks = {
      useList(
        params?: Params,
        options?: Omit<
          UseQueryOptions<T[], Error>,
          "queryKey" | "queryFn"
        >
      ) {
        return useQuery({
          queryKey: keys.list(params),
          queryFn: () => api.list(params),
          ...options,
        })
      },

      useInfinite(
        params?: Params,
        options?: Omit<
          UseInfiniteQueryOptions<
            InfiniteResponse<T, C>,
            Error,
            InfiniteResponse<T, C>,
            ReturnType<typeof keys.infinite>,
            C | undefined
          >,
          "queryKey" | "queryFn" | "initialPageParam"
        >
      ) {
        return useInfiniteQuery({
          queryKey: keys.infinite(params),

          queryFn: async ({ pageParam }) => {
            const payload = await api.infinite(params, pageParam as C | undefined)
            return mapInfiniteResponse(payload)
          },

          initialPageParam: undefined,

          getNextPageParam,

          ...options,
        })
      },

      useDetail(
        id: Id,
        options?: Omit<
          UseQueryOptions<T, Error>,
          "queryKey" | "queryFn"
        >
      ) {
        return useQuery({
          queryKey: keys.detail(id),
          queryFn: () => api.detail(id),
          enabled: id !== undefined && id !== null,
          ...options,
        })
      },

      useCreate() {
        const qc = useQueryClient()

        return useMutation({
          mutationFn: api.create,

          onSuccess: () => {
            qc.invalidateQueries({
              queryKey: keys.lists(),
            })
          },
        })
      },

      useUpdate() {
        const qc = useQueryClient()

        return useMutation({
          mutationFn: ({ id, data }: { id: Id; data: Partial<T> }) =>
            api.update(id, data),

          onSuccess: (_, vars) => {
            qc.invalidateQueries({
              queryKey: keys.detail(vars.id),
            })

            qc.invalidateQueries({
              queryKey: keys.lists(),
            })
          },
        })
      },

      useDelete() {
        const qc = useQueryClient()

        return useMutation({
          mutationFn: api.remove,

          onSuccess: (_, id) => {
            qc.invalidateQueries({
              queryKey: keys.lists(),
            })

            qc.removeQueries({
              queryKey: keys.detail(id),
            })
          },
        })
      },
    }

    return { api, hooks }
  }
}
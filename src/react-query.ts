import { QueryClient, type QueryClientConfig } from "@tanstack/react-query"

/**
 * Default QueryClient config:
 * - staleTime 1 phút để giảm request lặp
 * - tắt refetch khi focus lại tab để tránh flicker
 */
const defaultConfig: QueryClientConfig = {
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 5 * 60 * 1000,
      retry: 1,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      refetchOnMount: true,
    },
    mutations: {
      retry: 0,
    },
  },
}

/**
 * Tạo QueryClient với config có thể override.
 */
export function createQueryClient(config?: QueryClientConfig): QueryClient {
  return new QueryClient({
    ...defaultConfig,
    ...config,
    defaultOptions: {
      queries: {
        ...defaultConfig.defaultOptions?.queries,
        ...config?.defaultOptions?.queries,
      },
      mutations: {
        ...defaultConfig.defaultOptions?.mutations,
        ...config?.defaultOptions?.mutations,
      },
    },
  })
}

/**
 * Shared QueryClient instance cho app.
 */
export const queryClient = createQueryClient()

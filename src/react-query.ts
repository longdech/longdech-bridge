import { QueryClient, type QueryClientConfig } from "@tanstack/react-query"

/**
 * Default QueryClient configuration:
 * - 1-minute staleTime to reduce redundant requests.
 * - disabled refetch on window focus to avoid unwanted flickers.
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
 * Creates a QueryClient with optional configuration overrides.
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
 * Shared QueryClient instance for the application.
 */
export const queryClient = createQueryClient()

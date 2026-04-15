import { QueryClient } from "@tanstack/react-query"

/**
 * Shared QueryClient config:
 * - staleTime 1 phút để giảm request lặp
 * - tắt refetch khi focus lại tab để tránh flicker
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },

    mutations: {
      retry: 0,
    },
  },
})

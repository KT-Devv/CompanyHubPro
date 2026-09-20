import { QueryClient } from "@tanstack/react-query";

// All data comes from Supabase through the hooks in lib/api, each with its own
// queryFn, so there is no default fetcher here.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
    mutations: {
      retry: false,
    },
  },
});

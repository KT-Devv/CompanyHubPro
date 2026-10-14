import { QueryClient } from "@tanstack/react-query";

// All data comes from Supabase through the hooks in lib/api, each with its own
// queryFn, so there is no default fetcher here.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      refetchOnWindowFocus: true,
      retry: 1,
      // Keep what's already on screen (and in the offline copy) when a refresh
      // can't reach the server, instead of throwing it away.
      gcTime: 24 * 60 * 60 * 1000,
    },
    mutations: {
      retry: false,
      // By default React Query holds a mutation back while the browser thinks it
      // is offline. Saving attendance must instead run, find there's no signal,
      // and put the mark in the offline queue; the others should fail clearly.
      networkMode: "always",
    },
  },
});

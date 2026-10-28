import { retryUnless4xx } from "@/lib/form-rules";
import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // No retries on 4xx (bad id, permission): they will not succeed on retry.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: retryUnless4xx } } });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};

import { fetch } from "expo/fetch";
import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { clearApiSession, getApiSession } from "@/lib/api-session";

const PRODUCTION_DOMAIN = "diab-eats-1.replit.app";

/**
 * Gets the base URL for the Express API server.
 * In development: uses EXPO_PUBLIC_DOMAIN (set by the dev workflow).
 * In production browser: falls back to window.location.origin (same-origin serving).
 * In native production builds: falls back to the known production domain.
 */
export function getApiUrl(): string {
  const host = process.env.EXPO_PUBLIC_DOMAIN;

  if (host) {
    return new URL(`https://${host}`).href;
  }

  // Production browser: API is served from the same origin as the page
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin + "/";
  }

  // Native production build fallback — EXPO_PUBLIC_DOMAIN not baked in
  console.warn(
    "[DiabEats] EXPO_PUBLIC_DOMAIN is not set — falling back to production domain:",
    PRODUCTION_DOMAIN,
  );
  return `https://${PRODUCTION_DOMAIN}/`;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  route: string,
  data?: unknown | undefined,
): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);
  const contentHeaders: Record<string, string> = data ? { "Content-Type": "application/json" } : {};
  const requestOptions = {
    method,
    headers: contentHeaders,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include" as const,
  };
  let session = await getApiSession(baseUrl);

  const makeRequest = (token: string) =>
    fetch(url.toString(), {
      ...requestOptions,
    headers: {
      ...requestOptions.headers,
      Authorization: `Bearer ${token}`,
    },
  });
  let res = await makeRequest(session.token);

  // Tokens are renewed before their known expiry, but a server can still revoke
  // one. Recreate once so a stale device record cannot permanently block the app.
  if (res.status === 401) {
    await clearApiSession();
    session = await getApiSession(baseUrl);
    res = await makeRequest(session.token);
  }

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const baseUrl = getApiUrl();
    const url = new URL(queryKey.join("/") as string, baseUrl);

    const res = await fetch(url.toString(), {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: 2,
      retryDelay: 1000,
    },
    mutations: {
      retry: false,
    },
  },
});

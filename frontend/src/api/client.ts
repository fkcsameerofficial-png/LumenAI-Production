const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function tryRefresh(): Promise<string | null> {
  const res = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) return null;
  const data = await res.json();
  accessToken = data.accessToken;
  return data.accessToken;
}

interface RequestOptions extends RequestInit {
  skipAuthRetry?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const doFetch = async (): Promise<Response> =>
    fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: "include",
      headers: {
        ...(options.body && !(options.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(options.headers ?? {}),
      },
    });

  let res = await doFetch();

  // Endpoints under /api/auth/ (other than /me) don't carry a Bearer token in any meaningful
  // way, so a 401 from them is a real auth failure (bad credentials, no/invalid refresh
  // cookie) rather than "access token expired" — retrying via refresh would just be a wasted
  // extra round trip and could wrongly fire onUnauthorized during a plain failed login.
  const isBareAuthEndpoint = path.startsWith("/api/auth/") && path !== "/api/auth/me";

  if (res.status === 401 && !options.skipAuthRetry && !isBareAuthEndpoint) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      res = await doFetch();
    } else {
      onUnauthorized?.();
    }
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(message);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body !== undefined ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: "POST", body: form }),
};

export function getAccessToken() {
  return accessToken;
}

export { API_BASE };

/** A failed API call: `status` 0 means the request never reached the server (offline). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown = null,
  ) {
    super(message);
  }
}

/**
 * fetch wrapper for our JSON API: throws ApiError carrying the server's message and body. A
 * FormData body is sent as a multipart upload; anything else as JSON.
 */
export async function api<T>(
  url: string,
  init?: { method?: string; body?: unknown; keepalive?: boolean },
): Promise<T> {
  const body = init?.body;
  const json = body !== undefined && !(body instanceof FormData);
  let res: Response;
  try {
    res = await fetch(url, {
      method: init?.method ?? 'GET',
      headers: json ? { 'content-type': 'application/json' } : undefined,
      body: json ? JSON.stringify(body) : (body as FormData | undefined),
      keepalive: init?.keepalive,
    });
  } catch {
    throw new ApiError('Can’t reach the server. Check your connection.', 0);
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(
      data?.error ?? `Request failed (${res.status}). Try again.`,
      res.status,
      data,
    );
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

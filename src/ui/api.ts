// Cliente de la API. Errores como ApiError con el `message` del servidor.
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Código estable del servidor (por ejemplo `paused`), cuando lo hay. */
    public reason?: string,
  ) {
    super(message);
  }
}

type Options = { method?: string; body?: unknown; signal?: AbortSignal };

export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const isForm = opts.body instanceof FormData;
  const r = await fetch("/api" + path, {
    method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
    headers: opts.body === undefined || isForm ? undefined : { "Content-Type": "application/json" },
    body: opts.body === undefined ? undefined : isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
    credentials: "same-origin",
    signal: opts.signal,
  });
  if (r.status === 204) return undefined as T;
  const type = r.headers.get("Content-Type") ?? "";
  const data = type.includes("application/json") ? await r.json() : null;
  if (r.status === 401 && !path.startsWith("/auth/") && !path.startsWith("/view/") && !path.startsWith("/access/"))
    window.dispatchEvent(new Event("planner:unauthorized"));
  if (!r.ok) throw new ApiError(r.status, data?.message ?? "No se pudo completar la solicitud.", data?.reason);
  return data as T;
}

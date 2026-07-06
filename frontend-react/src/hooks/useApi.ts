async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let detail = `HTTP ${res.status}`
    try {
      const json = JSON.parse(text)
      if (json.detail) detail = `HTTP ${res.status} — ${json.detail}`
    } catch { /* not JSON */ }
    throw new Error(detail)
  }
  if (res.status === 204) return undefined as T
  const ct = res.headers.get('content-type') ?? ''
  if (!ct.includes('application/json') && !ct.includes('text/plain')) return undefined as T
  if (ct.includes('text/plain')) return res.text() as Promise<T>
  return res.json()
}

export const apiGet = <T>(url: string) => apiFetch<T>(url)
export const apiPost = <T>(url: string, body: unknown) =>
  apiFetch<T>(url, { method: 'POST', body: JSON.stringify(body) })
export const apiPut = <T>(url: string, body: unknown) =>
  apiFetch<T>(url, { method: 'PUT', body: JSON.stringify(body) })
export const apiPatch = <T>(url: string, body: unknown) =>
  apiFetch<T>(url, { method: 'PATCH', body: JSON.stringify(body) })
export const apiDelete = (url: string) => apiFetch<void>(url, { method: 'DELETE' })

/** Upload multipart: niente Content-Type manuale, lo imposta il browser con il boundary. */
export async function apiUpload<T>(url: string, file: File): Promise<T> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(url, { method: 'POST', body: form })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let detail = `HTTP ${res.status}`
    try {
      const json = JSON.parse(text)
      if (json.detail) detail = `HTTP ${res.status} — ${json.detail}`
    } catch { /* not JSON */ }
    throw new Error(detail)
  }
  return res.json()
}

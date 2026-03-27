const DEFAULT_API_PORT = '5080'

function resolveRuntimeApiBaseUrl() {
  if (typeof window !== 'undefined' && window.location?.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:${DEFAULT_API_PORT}`
  }

  return `http://127.0.0.1:${DEFAULT_API_PORT}`
}

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? resolveRuntimeApiBaseUrl()

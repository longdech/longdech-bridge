import axios, {
  AxiosError,
  type AxiosResponse,
  type CreateAxiosDefaults,
  type InternalAxiosRequestConfig,
} from "axios"
import { TokenManager } from "./token-manager"

export type HttpQueryParamValue = string | number | boolean | undefined
export type HttpQueryParams = Record<string, HttpQueryParamValue>

export interface HttpRequestOptions<TBody = unknown> {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  body?: TBody
  headers?: Record<string, string>
  params?: HttpQueryParams
  signal?: AbortSignal
  /**
   * Skip automatic token attachment for this request.
   */
  skipAuth?: boolean
  /**
   * Skip request deduplication.
   */
  skipDeduplication?: boolean
}

export interface HttpClientConfig extends CreateAxiosDefaults {
  baseURL: string
  tokenManager?: TokenManager
  getToken?: () => Promise<string | null> | string | null
  /**
   * Hook to attach locale to request (e.g. Accept-Language header).
   */
  attachLocale?: (request: InternalAxiosRequestConfig) => void | Promise<void>
  /**
   * Hook to attach domain or tenant info to request.
   */
  attachDomain?: (request: InternalAxiosRequestConfig) => void | Promise<void>
  /**
   * Global toggle for request deduplication. Default: true.
   */
  enableDeduplication?: boolean
}

/**
 * Axios-based HTTP client with focus on enrichment and performance.
 * Handles automatic token injection, request queuing, and deduplication.
 */
export class HttpClient {
  protected instance: ReturnType<typeof axios.create>
  private readonly getTokenFromConfig?: HttpClientConfig["getToken"]
  protected readonly tokenManager?: TokenManager
  private readonly attachLocale?: HttpClientConfig["attachLocale"]
  private readonly attachDomain?: HttpClientConfig["attachDomain"]
  private readonly enableDeduplication: boolean
  private pendingRequests: Map<string, Promise<unknown>> = new Map()

  constructor(config: HttpClientConfig) {
    const {
      getToken,
      tokenManager,
      attachLocale,
      attachDomain,
      enableDeduplication = true,
      ...axiosConfig
    } = config

    this.getTokenFromConfig = getToken
    this.tokenManager = tokenManager
    this.attachLocale = attachLocale
    this.attachDomain = attachDomain
    this.enableDeduplication = enableDeduplication
    this.instance = axios.create(axiosConfig)

    this.instance.interceptors.request.use(
      async (request) => {
        await this.enrichRequest(request)
        return request
      },
      (error: AxiosError) => Promise.reject(error)
    )

    this.instance.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => Promise.reject(error)
    )
  }

  /**
   * Pipeline for request enrichment: Auth -> Locale -> Domain.
   */
  protected async enrichRequest(request: InternalAxiosRequestConfig) {
    const skipAuth = (request as any).skipAuth
    if (!skipAuth) {
      const token =
        (await this.tokenManager?.getToken()) ?? (await this.getTokenFromConfig?.()) ?? null
      if (token) {
        request.headers = request.headers ?? {}
        request.headers.Authorization = `Bearer ${token}`
      }
    }

    await this.attachLocale?.(request)
    await this.attachDomain?.(request)
  }

  /**
   * Generate a unique key for GET request deduplication.
   */
  private getDedupeKey(url: string, options: HttpRequestOptions): string {
    const headersHash = options.headers ? JSON.stringify(options.headers) : ""
    const skipAuth = options.skipAuth ? "skip" : ""
    return JSON.stringify({ url, params: options.params, headersHash, skipAuth })
  }

  /**
   * Core request method.
   */
  async request<TResponse, TBody = unknown>(
    url: string,
    options: HttpRequestOptions<TBody> = {}
  ): Promise<TResponse> {
    const { method = "GET", body, headers, params, signal, skipAuth, skipDeduplication } = options

    const requestConfig = {
      method,
      url,
      data: body,
      headers,
      params,
      signal,
      skipAuth,
    }

    const shouldDedupe = this.enableDeduplication && method === "GET" && !skipDeduplication

    if (shouldDedupe) {
      const key = this.getDedupeKey(url, options)

      if (this.pendingRequests.has(key)) {
        return this.pendingRequests.get(key) as Promise<TResponse>
      }

      const promise = this.instance
        .request<TResponse, AxiosResponse<TResponse>, TBody>(requestConfig)
        .then((r) => r.data)
        .finally(() => this.pendingRequests.delete(key))

      this.pendingRequests.set(key, promise)
      return promise
    }

    return this.instance
      .request<TResponse, AxiosResponse<TResponse>, TBody>(requestConfig)
      .then((r) => r.data)
  }

  get<T>(url: string, params?: HttpQueryParams, options?: Omit<HttpRequestOptions, "params">) {
    return this.request<T>(url, { ...options, params })
  }

  post<T, B = unknown>(url: string, body?: B, options?: Omit<HttpRequestOptions<B>, "body">) {
    return this.request<T, B>(url, { ...options, method: "POST", body })
  }

  put<T, B = unknown>(url: string, body?: B, options?: Omit<HttpRequestOptions<B>, "body">) {
    return this.request<T, B>(url, { ...options, method: "PUT", body })
  }

  patch<T, B = unknown>(url: string, body?: B, options?: Omit<HttpRequestOptions<B>, "body">) {
    return this.request<T, B>(url, { ...options, method: "PATCH", body })
  }

  delete<T>(url: string, options?: Omit<HttpRequestOptions, "method" | "body">) {
    return this.request<T>(url, { ...options, method: "DELETE" })
  }

  /**
   * Upload file using multipart/form-data.
   */
  upload<TResponse>(
    url: string,
    formData: FormData,
    options?: Omit<HttpRequestOptions, "body" | "method">
  ): Promise<TResponse> {
    const headers: Record<string, string> = {
      "Content-Type": "multipart/form-data",
      ...(options?.headers || {}),
    }

    return this.request<TResponse>(url, {
      ...options,
      method: "POST",
      body: formData,
      headers,
    })
  }
}

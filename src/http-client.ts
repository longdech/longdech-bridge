import axios, {
  AxiosError,
  type AxiosRequestConfig,
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
   * Skip auto token attachment for this request
   */
  skipAuth?: boolean
  /**
   * Skip deduplication for this request
   */
  skipDeduplication?: boolean
}

export interface HttpClientConfig extends CreateAxiosDefaults {
  baseURL: string
  tokenManager?: TokenManager
  getToken?: () => Promise<string | null> | string | null
  /**
   * Gắn locale vào request. VD: request.headers["Accept-Language"] = getLocale()
   */
  attachLocale?: (request: InternalAxiosRequestConfig) => void | Promise<void>
  /**
   * Gắn domain/tenant vào request nếu cần.
   */
  attachDomain?: (request: InternalAxiosRequestConfig) => void | Promise<void>
  enableDeduplication?: boolean
  /**
   * Custom error handler - FE tự implement
   */
  onError?: (error: unknown, requestConfig: HttpRequestOptions) => void
  /**
   * Interceptor để xử lý response trước khi trả về
   */
  transformResponse?: <T>(response: AxiosResponse<T>) => T
}

/**
 * Axios-based HTTP client.
 */
export class HttpClient {
  protected instance: ReturnType<typeof axios.create>
  private readonly getTokenFromConfig?: HttpClientConfig["getToken"]
  protected readonly tokenManager?: TokenManager
  private readonly attachLocale?: HttpClientConfig["attachLocale"]
  private readonly attachDomain?: HttpClientConfig["attachDomain"]
  private readonly enableDeduplication: boolean
  private pendingRequests: Map<string, Promise<unknown>> = new Map()
  private readonly onError?: HttpClientConfig["onError"]
  private readonly transformResponse?: HttpClientConfig["transformResponse"]

  constructor(config: HttpClientConfig) {
    const {
      getToken,
      tokenManager,
      attachLocale,
      attachDomain,
      enableDeduplication = true,
      onError,
      transformResponse,
      ...axiosConfig
    } = config

    this.getTokenFromConfig = getToken
    this.tokenManager = tokenManager
    this.attachLocale = attachLocale
    this.attachDomain = attachDomain
    this.enableDeduplication = enableDeduplication
    this.onError = onError
    this.transformResponse = transformResponse
    this.instance = axios.create(axiosConfig)

    this.instance.interceptors.request.use(
      async (request) => {
        await this.enrichRequest(request)
        return request
      },
      (error: AxiosError) => {
        this.onError?.(error, {})
        return Promise.reject(error)
      }
    )

    this.instance.interceptors.response.use(
      (response) => {
        return this.transformResponse ? this.transformResponse(response) : response
      },
      (error: AxiosError) => {
        const requestConfig = error.config as HttpRequestOptions | undefined
        this.onError?.(error, requestConfig || {})
        return Promise.reject(error)
      }
    )
  }

  /**
   * Enrichment pipeline: token → locale → domain.
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

  private getDedupeKey(url: string, options: HttpRequestOptions): string {
    const headersHash = options.headers ? JSON.stringify(options.headers) : ""
    const skipAuth = options.skipAuth ? "skip" : ""
    return JSON.stringify({ url, params: options.params, headersHash, skipAuth })
  }

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
   * Upload file với multipart/form-data
   */
  upload<TResponse, TBody = FormData>(
    url: string,
    formData: TBody,
    options?: Omit<HttpRequestOptions<TBody>, "body" | "method">
  ): Promise<TResponse> {
    const headers: Record<string, string> = {
      "Content-Type": "multipart/form-data",
    }

    if (options?.headers) {
      Object.assign(headers, options.headers)
    }

    return this.request<TResponse, TBody>(url, {
      ...options,
      method: "POST",
      body: formData,
      headers,
    } as HttpRequestOptions<TBody>)
  }
}

import axios, {
  AxiosError,
  AxiosRequestConfig,
  AxiosResponse,
  CreateAxiosDefaults,
  InternalAxiosRequestConfig,
} from "axios"
import { TokenManager } from "./token-manager"

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
export type HttpQueryParamValue = string | number | boolean | undefined
export type HttpQueryParams = Record<string, HttpQueryParamValue>

export interface HttpRequestOptions<TBody = unknown> {
  method?: HttpMethod
  body?: TBody
  headers?: Record<string, string>
  params?: HttpQueryParams
}

export interface LocaleAttacher {
  attachLocaleToRequest(request: InternalAxiosRequestConfig): Promise<void> | void
}

export interface TokenAttacher {
  attachTokenToRequest(request: InternalAxiosRequestConfig): Promise<void> | void
}

export interface DomainAttacher {
  attachDomainToRequest(request: InternalAxiosRequestConfig): Promise<void> | void
}

export interface HttpClientConfig extends CreateAxiosDefaults {
  baseURL: string
  getToken?: () => Promise<string | null> | string | null
  tokenManager?: TokenManager
}

export type InterceptorsConfig = {
  onRequest?: (
    request: InternalAxiosRequestConfig
  ) => Promise<InternalAxiosRequestConfig> | InternalAxiosRequestConfig
  onRequestError?: (error: AxiosError) => Promise<never>
  onResponse?: (response: AxiosResponse) => AxiosResponse | Promise<AxiosResponse>
  onResponseError?: (error: AxiosError) => Promise<never>
}

/**
 * Axios-based HTTP client with overridable request enrichers.
 */
export class HttpClient implements LocaleAttacher, TokenAttacher, DomainAttacher {
  protected instance: ReturnType<typeof axios.create>
  private readonly getTokenFromConfig?: HttpClientConfig["getToken"]
  protected readonly tokenManager?: TokenManager
  private requestInterceptorId: number | null = null
  private responseInterceptorId: number | null = null

  constructor(config: HttpClientConfig) {
    const { getToken, tokenManager, ...axiosConfig } = config

    this.getTokenFromConfig = getToken
    this.tokenManager = tokenManager
    this.instance = axios.create(axiosConfig)
    this.setupInterceptors()
  }

  protected onRequest = async (request: InternalAxiosRequestConfig) => {
    await this.attachTokenToRequest(request)
    await this.attachLocaleToRequest(request)
    await this.attachDomainToRequest(request)
    return request
  }

  protected onRequestError = (error: AxiosError) => Promise.reject(error)
  protected onResponse = (response: AxiosResponse) => response
  protected onResponseError = (error: AxiosError) => Promise.reject(error)

  setupInterceptors({
    onRequest = this.onRequest,
    onRequestError = this.onRequestError,
    onResponse = this.onResponse,
    onResponseError = this.onResponseError,
  }: InterceptorsConfig = {}) {
    if (this.requestInterceptorId !== null) {
      this.instance.interceptors.request.eject(this.requestInterceptorId)
    }

    if (this.responseInterceptorId !== null) {
      this.instance.interceptors.response.eject(this.responseInterceptorId)
    }

    this.requestInterceptorId = this.instance.interceptors.request.use(
      onRequest,
      onRequestError
    )
    this.responseInterceptorId = this.instance.interceptors.response.use(
      onResponse,
      onResponseError
    )
  }

  async attachLocaleToRequest(_request: InternalAxiosRequestConfig) {}

  async attachDomainToRequest(_request: InternalAxiosRequestConfig) {}

  async attachTokenToRequest(request: InternalAxiosRequestConfig) {
    const token =
      (await this.tokenManager?.getToken()) ??
      (await this.getTokenFromConfig?.()) ??
      null

    if (!token) return

    request.headers = request.headers ?? {}
    request.headers.Authorization = `Bearer ${token}`
  }

  async request<TResponse, TBody = unknown>(
    url: string,
    options: HttpRequestOptions<TBody> = {}
  ): Promise<TResponse> {
    const { method = "GET", body, headers, params } = options

    const response = await this.instance.request<TResponse, AxiosResponse<TResponse>, TBody>({
      method,
      url,
      data: body,
      headers,
      params,
    })

    return response.data
  }

  get<T>(url: string, params?: HttpQueryParams) {
    return this.request<T>(url, { params })
  }

  post<T, B = unknown>(url: string, body?: B) {
    return this.request<T, B>(url, { method: "POST", body })
  }

  put<T, B = unknown>(url: string, body?: B) {
    return this.request<T, B>(url, { method: "PUT", body })
  }

  patch<T, B = unknown>(url: string, body?: B) {
    return this.request<T, B>(url, { method: "PATCH", body })
  }

  delete<T>(url: string, config?: AxiosRequestConfig) {
    return this.instance.delete<T, AxiosResponse<T>>(url, config).then((r) => r.data)
  }
}
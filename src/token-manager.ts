import { jwtDecode, JwtPayload } from "jwt-decode"
import { EventEmitter } from "./event-emitter"

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

export interface TokenManagerConfig {
  getAccessToken?: () => string | null
  getRefreshToken?: () => string | null
  isValidToken?: (token: string) => boolean
  isValidRefreshToken?: (token: string) => boolean
  executeRefreshToken?: () => Promise<TokenPair>
  onInvalidRefreshToken?: () => void
  onRefreshTokenSuccess?: (token: TokenPair) => void
  refreshTimeout?: number
}

/**
 * Token manager hỗ trợ 2 mode:
 * - Simple in-memory (set/get/clear)
 * - Advanced refresh flow (getToken)
 */
export class TokenManager {
  private accessToken: string | null = null
  private refreshToken: string | null = null
  private readonly event = new EventEmitter()
  private readonly config?: TokenManagerConfig
  private isRefreshing = false
  private refreshTimeoutId: ReturnType<typeof setTimeout> | null = null
  private readonly refreshTimeout: number

  constructor(config?: TokenManagerConfig) {
    this.config = config
    this.refreshTimeout = config?.refreshTimeout ?? 30000
  }

  /**
   * Token dùng cho Authorization header ở request chính.
   */
  getAccessToken() {
    return this.config?.getAccessToken?.() ?? this.accessToken
  }

  setAccessToken(token: string | null) {
    this.accessToken = token
  }

  /**
   * Token dùng cho flow refresh access token.
   */
  getRefreshToken() {
    return this.config?.getRefreshToken?.() ?? this.refreshToken
  }

  setRefreshToken(token: string | null) {
    this.refreshToken = token
  }

  clear() {
    this.accessToken = null
    this.refreshToken = null
  }

  /**
   * Trả về access token hợp lệ.
   * Nếu hết hạn và có refresh flow, sẽ tự refresh và đồng bộ các request đồng thời.
   */
  async getToken(): Promise<string> {
    const accessToken = this.getAccessToken()
    if (!accessToken) return ""

    if (this.isValidToken(accessToken)) {
      return accessToken
    }

    const refreshToken = this.getRefreshToken()
    if (!refreshToken) return ""

    if (!this.isValidRefreshToken(refreshToken)) {
      this.config?.onInvalidRefreshToken?.()
      throw new Error("Invalid refresh token")
    }

    const executeRefreshToken = this.config?.executeRefreshToken
    if (!executeRefreshToken) {
      return ""
    }

    return new Promise<string>((resolve, reject) => {
      this.event.once("refreshDone", (nextToken: unknown) => {
        if (typeof nextToken === "string" && nextToken.length > 0) {
          resolve(nextToken)
          return
        }

        reject(new Error("Unable to refresh access token"))
      })

      if (this.isRefreshing) return

      this.isRefreshing = true
      this.refreshTimeoutId = setTimeout(() => {
        this.finishRefresh(null)
      }, this.refreshTimeout)

      executeRefreshToken()
        .then((token) => {
          if (!token.accessToken || !token.refreshToken) {
            throw new Error("Invalid token pair from refresh endpoint")
          }

          this.config?.onRefreshTokenSuccess?.(token)
          this.finishRefresh(token.accessToken)
        })
        .catch(() => {
          this.finishRefresh(null)
        })
    })
  }

  private isValidToken(token: string): boolean {
    const validator = this.config?.isValidToken
    if (validator) return validator(token)
    return this.defaultIsTokenValid(token)
  }

  private isValidRefreshToken(token: string): boolean {
    const validator = this.config?.isValidRefreshToken
    if (validator) return validator(token)
    return this.defaultIsTokenValid(token)
  }

  private defaultIsTokenValid(token: string): boolean {
    try {
      if (!token) return false

      const decoded = jwtDecode<JwtPayload>(token)
      if (!decoded.exp) return true

      const now = Date.now() / 1000
      return decoded.exp - 5 > now
    } catch {
      return false
    }
  }

  private finishRefresh(accessToken: string | null) {
    if (this.refreshTimeoutId) {
      clearTimeout(this.refreshTimeoutId)
      this.refreshTimeoutId = null
    }

    this.isRefreshing = false
    this.event.emit("refreshDone", accessToken)
  }
}

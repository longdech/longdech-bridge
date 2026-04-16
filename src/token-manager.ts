import { jwtDecode, type JwtPayload } from "jwt-decode"
import { EventEmitter } from "./event-emitter"

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

export interface TokenManagerConfig {
  getAccessToken?: () => string | null
  getRefreshToken?: () => string | null
  /**
   * Custom validator dùng chung cho cả access token và refresh token.
   * Mặc định decode JWT và kiểm tra exp.
   */
  isValidToken?: (token: string) => boolean
  executeRefreshToken?: () => Promise<TokenPair>
  onInvalidRefreshToken?: () => void
  onRefreshTokenSuccess?: (token: TokenPair) => void
}

/**
 * Token manager hỗ trợ 2 mode:
 * - Simple in-memory (set/get/clear)
 * - Advanced refresh flow với queue các request đang chờ (getToken)
 */
export class TokenManager {
  private accessToken: string | null = null
  private refreshToken: string | null = null
  private readonly event = new EventEmitter()
  private readonly config?: TokenManagerConfig
  private isRefreshing = false
  private isDestroyed = false

  constructor(config?: TokenManagerConfig) {
    this.config = config
  }

  getAccessToken() {
    return this.config?.getAccessToken?.() ?? this.accessToken
  }

  setAccessToken(token: string | null) {
    if (this.isDestroyed) return
    this.accessToken = token
  }

  getRefreshToken() {
    return this.config?.getRefreshToken?.() ?? this.refreshToken
  }

  setRefreshToken(token: string | null) {
    if (this.isDestroyed) return
    this.refreshToken = token
  }

  clear() {
    if (this.isDestroyed) return
    this.accessToken = null
    this.refreshToken = null
  }

  /**
   * Trả về access token hợp lệ.
   * Nếu hết hạn và có refresh flow, tự refresh và queue các request đang chờ.
   */
  async getToken(): Promise<string> {
    if (this.isDestroyed) return ""

    const accessToken = this.getAccessToken()
    if (!accessToken) return ""

    if (this.isValidToken(accessToken)) return accessToken

    const refreshToken = this.getRefreshToken()
    if (!refreshToken) return ""

    if (!this.isValidToken(refreshToken)) {
      this.config?.onInvalidRefreshToken?.()
      throw new Error("Invalid refresh token")
    }

    const executeRefreshToken = this.config?.executeRefreshToken
    if (!executeRefreshToken) return ""

    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Refresh token timeout after 10s"))
      }, 10000)

      this.event.once("refreshDone", (nextToken: unknown) => {
        clearTimeout(timeout)
        if (typeof nextToken === "string" && nextToken.length > 0) {
          resolve(nextToken)
        } else {
          reject(new Error("Unable to refresh access token"))
        }
      })

      if (this.isRefreshing) return

      this.isRefreshing = true

      executeRefreshToken()
        .then((token) => {
          if (!token.accessToken || !token.refreshToken) {
            throw new Error("Invalid token pair from refresh endpoint")
          }
          this.config?.onRefreshTokenSuccess?.(token)
          this.finishRefresh(token.accessToken)
        })
        .catch((error) => {
          console.error("Refresh token failed:", error)
          this.finishRefresh(null)
          this.config?.onInvalidRefreshToken?.()
        })
    })
  }

  private isValidToken(token: string): boolean {
    const validator = this.config?.isValidToken
    if (validator) return validator(token)
    return this.defaultIsTokenValid(token)
  }

  private defaultIsTokenValid(token: string): boolean {
    try {
      if (!token) return false
      const decoded = jwtDecode<JwtPayload>(token)
      if (!decoded.exp) return true
      return decoded.exp - 5 > Date.now() / 1000
    } catch {
      return false
    }
  }

  private finishRefresh(accessToken: string | null) {
    this.isRefreshing = false
    if (!this.isDestroyed) {
      this.event.emit("refreshDone", accessToken)
    }
  }

  destroy() {
    this.isDestroyed = true
    this.clear()
  }
}

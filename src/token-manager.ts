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
   * Custom validator for token validity.
   * Default: checks JWT expiration.
   */
  isValidToken?: (token: string) => boolean
  /**
   * Logic to call refresh token API.
   */
  executeRefreshToken?: () => Promise<TokenPair>
  /**
   * Callback when refresh token is invalid or expired.
   * Use this to redirect to login or clear app state.
   */
  onInvalidRefreshToken?: () => void
  /**
   * Callback on successful token refresh.
   */
  onRefreshTokenSuccess?: (token: TokenPair) => void
  /**
   * Timeout for refresh token operation in milliseconds. Default: 10000.
   */
  refreshTimeout?: number
}

/**
 * Token manager with queuing support.
 * Ensures only one refresh request is made at a time.
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
   * Returns a valid access token.
   * Logic: Valid? -> Return. Expired? -> Attempt Refresh -> Queue concurrent requests.
   */
  async getToken(): Promise<string> {
    if (this.isDestroyed) return ""

    const currentAccessToken = this.getAccessToken()
    if (!currentAccessToken) return ""

    // 1. If token is still valid, return it immediately
    if (this.isValidToken(currentAccessToken)) return currentAccessToken

    // 2. Token expired, check if we can refresh
    const currentRefreshToken = this.getRefreshToken()
    if (!currentRefreshToken || !this.isValidToken(currentRefreshToken)) {
      this.config?.onInvalidRefreshToken?.()
      return ""
    }

    const executeRefreshToken = this.config?.executeRefreshToken
    if (!executeRefreshToken) return ""

    // 3. Start or wait for refresh process
    return new Promise<string>((resolve, reject) => {
      const timeoutMs = this.config?.refreshTimeout ?? 10000
      const timeout = setTimeout(() => {
        reject(new Error(`Refresh token timeout after ${timeoutMs}ms`))
      }, timeoutMs)

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
          this.finishRefresh(null)
          this.config?.onInvalidRefreshToken?.()
          reject(error)
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
      // Subtract 5 seconds buffer to prevent race conditions at exact expiration
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

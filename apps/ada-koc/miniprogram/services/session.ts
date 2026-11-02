import { API_BASE_URL } from '../config'

// 登录与业务请求：小程序只把 wx.login 的临时 code 交给后台，
// 由后台换取微信身份并签发 Ada 业务令牌（PRD §8.8）。

export type Member = { memberId: string; status: 'active' | 'disabled' }
type StoredSession = { accessToken: string; expiresAt: string; member: Member }

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

const SESSION_KEY = 'ada-koc.session'

function readSession(): StoredSession | null {
  const stored = wx.getStorageSync(SESSION_KEY) as StoredSession | ''
  if (!stored || Date.parse(stored.expiresAt) <= Date.now()) return null
  return stored
}

function rawRequest<T>(method: 'GET' | 'POST' | 'PUT', path: string, data?: object, token?: string): Promise<T> {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}${path}`,
      method,
      data,
      header: token ? { authorization: `Bearer ${token}` } : {},
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(res.data as T)
        const error = (res.data as { error?: { code?: string; message?: string } })?.error
        reject(new ApiError(res.statusCode, error?.code ?? 'http_error', error?.message ?? `请求失败（${res.statusCode}）`))
      },
      fail: (err) => reject(new ApiError(0, 'network_error', `网络请求失败：${err.errMsg}`)),
    })
  })
}

function wxLoginCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (res) => (res.code ? resolve(res.code) : reject(new ApiError(0, 'wx_login_failed', '微信登录未返回凭证'))),
      fail: (err) => reject(new ApiError(0, 'wx_login_failed', `微信登录失败：${err.errMsg}`)),
    })
  })
}

/** 重新走一遍 wx.login → 后台换取会话。 */
export async function login(): Promise<StoredSession> {
  const code = await wxLoginCode()
  const session = await rawRequest<StoredSession>('POST', '/auth/wechat/login', { code })
  wx.setStorageSync(SESSION_KEY, session)
  return session
}

/** 有未过期的本地会话就直接用，否则登录。 */
export async function ensureSession(): Promise<StoredSession> {
  return readSession() ?? login()
}

/** 带登录态的业务请求；令牌失效（401）时自动重新登录并重试一次。 */
export async function request<T>(method: 'GET' | 'POST' | 'PUT', path: string, data?: object): Promise<T> {
  const session = await ensureSession()
  try {
    return await rawRequest<T>(method, path, data, session.accessToken)
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error
    wx.removeStorageSync(SESSION_KEY)
    const renewed = await login()
    return rawRequest<T>(method, path, data, renewed.accessToken)
  }
}

export function clearSession(): void {
  wx.removeStorageSync(SESSION_KEY)
}

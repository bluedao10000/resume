import { apiBaseUrl } from './config'

export function networkError(error: { errMsg?: string; errno?: number }) {
  // Only transport diagnostics, never headers, tokens, request bodies or URL queries.
  const detail = String(error.errMsg || 'request:fail')
    .replace(/https?:\/\/\S+/gi, '[请求地址]')
    .replace(/[\r\n]/g, ' ')
    .slice(0, 180)
  const reason = /url not in domain|domain list|合法域名/i.test(detail)
    ? '微信拦截了请求域名，请核对 request 合法域名并重新进入小程序。'
    : /ssl|tls|certificate|cert_/i.test(detail)
      ? 'HTTPS 安全连接失败，请检查服务端证书与网络。'
      : /timeout|timed out/i.test(detail)
        ? '连接服务超时，请稍后重试或切换网络。'
        : /dns|name_not_resolved|resolve host/i.test(detail)
          ? '无法解析服务域名，请检查 DNS 或切换网络。'
          : '无法连接小程序服务，请重试或切换网络。'
  return `${reason}\n服务：${apiBaseUrl}\n诊断：${detail}${typeof error.errno === 'number' ? ` (${error.errno})` : ''}`
}

export class MiniRequestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export function request(
  path: string,
  method: 'GET' | 'POST' | 'DELETE' = 'GET',
  data?: object,
  token = '',
): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    wx.request({
      url: apiBaseUrl + '/api/wechat-mini/' + path,
      method,
      data,
      timeout: 60000,
      header: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      success: (response) => {
        const body = response.data
        const value =
          body && typeof body === 'object'
            ? (body as { error?: unknown })
            : null
        if (response.statusCode === 404) {
          reject(
            new Error(
              '小程序后端接口不存在（HTTP 404），请联系开发者部署服务。\n服务：' +
                apiBaseUrl,
            ),
          )
        } else if (response.statusCode >= 400) {
          reject(
            new MiniRequestError(
              response.statusCode,
              typeof value?.error === 'string'
                ? value.error
                : `服务请求失败（HTTP ${response.statusCode}），请稍后重试。`,
            ),
          )
        } else if (!body || typeof body !== 'object') {
          reject(
            new Error(
              '服务返回了非 JSON 内容，可能是网页或安全验证页，请联系开发者检查接口。',
            ),
          )
        } else resolve({ status: response.statusCode, data: body })
      },
      fail: (error) => reject(new Error(networkError(error))),
    })
  })
}

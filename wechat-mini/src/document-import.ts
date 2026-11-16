import { z } from 'zod'
import { apiBaseUrl } from './config'
import { networkError } from './api'

const responseSchema = z.object({ text: z.string().min(1).max(20000) })
export function extractMiniFile(
  filePath: string,
  type: string,
  token: string,
  timeout: number,
  setTask: (task: WechatMiniprogram.RequestTask) => void,
  isCurrent: () => boolean,
): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      success: (result) => {
        if (!isCurrent()) {
          reject(new Error('已取消导入。'))
          return
        }
        if (typeof result.data === 'string') {
          reject(new Error('无法读取文件，请重新选择。'))
          return
        }
        const task = wx.request({
          url: apiBaseUrl + '/api/wechat-mini/document?type=' + type,
          method: 'POST',
          data: result.data,
          timeout,
          header: {
            'Content-Type': 'application/octet-stream',
            Authorization: 'Bearer ' + token,
          },
          success: (response) => {
            if (response.statusCode !== 200) {
              const body = response.data as { error?: string }
              reject(
                new Error(
                  body?.error ||
                    `文档解析失败（HTTP ${response.statusCode}）。`,
                ),
              )
              return
            }
            const parsed = responseSchema.safeParse(response.data)
            if (parsed.success) resolve(parsed.data.text)
            else reject(new Error('文档解析结果无效，请重试。'))
          },
          fail: (error) => reject(new Error(networkError(error))),
        })
        setTask(task)
      },
      fail: () => reject(new Error('无法读取文件，请重新从微信聊天中选择。')),
    })
  })
}

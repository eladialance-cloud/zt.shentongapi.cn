// 文件上传 API
//
// 端点契约：
//   POST   /files/upload   multipart/form-data 上传文件
//   DELETE /files/:id      删除文件

import { httpClient } from './http-client'
import { useAuthStore } from '@/store/auth'
import { signRequest } from '@/utils/hmac'
import type { UploadResult } from '@/types/chat'

/** API 基础地址 */
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'

/**
 * 上传文件
 * 使用原生 fetch + XMLHttpRequest 实现上传进度回调（axios 也支持，但这里直接走 fetch + XHR）
 *
 * @param file 文件对象
 * @param onProgress 进度回调（0-100）
 */
export function uploadFile(
  file: File,
  onProgress?: (percent: number) => void
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const formData = new FormData()
    formData.append('file', file)

    // 进度
    xhr.upload.onprogress = (e: ProgressEvent) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }

    xhr.onload = async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const body = JSON.parse(xhr.responseText) as {
            code: number
            message: string
            data: UploadResult
          }
          if (body.code === 0) {
            resolve(body.data)
          } else {
            reject(new Error(body.message || '上传失败'))
          }
        } catch (err) {
          reject(new Error('解析上传响应失败: ' + (err as Error).message))
        }
      } else {
        reject(new Error(`上传失败 (${xhr.status})`))
      }
    }

    xhr.onerror = () => reject(new Error('上传网络错误'))
    xhr.onabort = () => reject(new Error('上传已取消'))

    // 异步注入 HMAC 签名后发送
    void (async () => {
      const url = `${API_BASE}/files/upload`
      const { accessToken, secretKey } = useAuthStore.getState()
      if (accessToken) {
        xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`)
      }
      // HMAC 签名（path 不含 query string，body 为 multipart 不参与 hash）
      if (secretKey) {
        try {
          const { timestamp, nonce, signature } = await signRequest(
            'post',
            '/files/upload',
            null,
            secretKey
          )
          xhr.setRequestHeader('X-Timestamp', timestamp)
          xhr.setRequestHeader('X-Nonce', nonce)
          xhr.setRequestHeader('X-Signature', signature)
        } catch (err) {
          console.error('[file-api] sign upload request failed:', err)
        }
      }
      xhr.open('POST', url, true)
      // 注意：multipart boundary 由浏览器自动设置，不要手动设置 Content-Type
      xhr.send(formData)
    })()
  })
}

/**
 * 删除文件
 * DELETE /files/:id
 */
export async function deleteFile(fileId: string): Promise<void> {
  await httpClient.delete<void>(`/files/${fileId}`)
}

export default {
  uploadFile,
  deleteFile
}

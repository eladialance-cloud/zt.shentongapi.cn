// 知识库模块 API
//
// 端点契约：
//   GET    /knowledge/bases                       知识库列表
//   POST   /knowledge/bases                       创建知识库
//   DELETE /knowledge/bases/:id                   删除知识库
//   GET    /knowledge/bases/:id/documents         文档列表
//   POST   /knowledge/bases/:id/documents         上传文档（multipart/form-data）
//   DELETE /knowledge/bases/:id/documents/:docId  删除文档
//   POST   /knowledge/bases/:id/search            检索（body: { query, topK }）

import { httpClient } from './http-client'
import { useAuthStore } from '@/store/auth'
import { signRequest } from '@/utils/hmac'
import type {
  KnowledgeBase,
  KnowledgeDocument,
  SearchResult,
  CreateKnowledgeBaseDto
} from '@/types/knowledge'

/** API 基础地址 */
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'

/**
 * 知识库列表
 * GET /knowledge/bases
 */
export async function listKnowledgeBases(): Promise<KnowledgeBase[]> {
  return httpClient.get<KnowledgeBase[]>('/knowledge/bases')
}

/**
 * 创建知识库
 * POST /knowledge/bases
 */
export async function createKnowledgeBase(
  dto: CreateKnowledgeBaseDto
): Promise<KnowledgeBase> {
  return httpClient.post<KnowledgeBase>('/knowledge/bases', dto)
}

/**
 * 删除知识库
 * DELETE /knowledge/bases/:id
 */
export async function deleteKnowledgeBase(id: number): Promise<void> {
  await httpClient.delete<void>(`/knowledge/bases/${id}`)
}

/**
 * 文档列表
 * GET /knowledge/bases/:id/documents
 */
export async function listDocuments(kbId: number): Promise<KnowledgeDocument[]> {
  return httpClient.get<KnowledgeDocument[]>(`/knowledge/bases/${kbId}/documents`)
}

/**
 * 上传文档（multipart/form-data，支持上传进度）
 * POST /knowledge/bases/:id/documents
 *
 * @param kbId 知识库 ID
 * @param file 文件对象
 * @param onProgress 进度回调（0-100）
 */
export function uploadDocument(
  kbId: number,
  file: File,
  onProgress?: (percent: number) => void
): Promise<KnowledgeDocument> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const formData = new FormData()
    formData.append('file', file)

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
            data: KnowledgeDocument
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
      const url = `${API_BASE}/knowledge/bases/${kbId}/documents`
      xhr.open('POST', url, true)
      const { accessToken, secretKey } = useAuthStore.getState()
      if (accessToken) {
        xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`)
      }
      if (secretKey) {
        try {
          const { timestamp, nonce, signature } = await signRequest(
            'post',
            `/knowledge/bases/${kbId}/documents`,
            null,
            secretKey
          )
          xhr.setRequestHeader('X-Timestamp', timestamp)
          xhr.setRequestHeader('X-Nonce', nonce)
          xhr.setRequestHeader('X-Signature', signature)
        } catch (err) {
          console.error('[knowledge-api] sign upload request failed:', err)
        }
      }
      // multipart boundary 由浏览器自动设置，不要手动设置 Content-Type
      xhr.send(formData)
    })()
  })
}

/**
 * 删除文档
 * DELETE /knowledge/bases/:id/documents/:docId
 */
export async function deleteDocument(
  kbId: number,
  docId: number
): Promise<void> {
  await httpClient.delete<void>(`/knowledge/bases/${kbId}/documents/${docId}`)
}

/**
 * 检索
 * POST /knowledge/bases/:id/search
 *
 * @param kbId 知识库 ID
 * @param query 查询文本
 * @param topK 返回片段数量
 */
export async function search(
  kbId: number,
  query: string,
  topK = 5
): Promise<SearchResult[]> {
  return httpClient.post<SearchResult[]>(`/knowledge/bases/${kbId}/search`, {
    query,
    topK
  })
}

export default {
  listKnowledgeBases,
  createKnowledgeBase,
  deleteKnowledgeBase,
  listDocuments,
  uploadDocument,
  deleteDocument,
  search
}

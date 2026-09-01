// 口播工坊 API
//
// 端点契约（与后端 src/modules/oral-workshop 一致）：
//   POST   /oral-workshop/jobs            创建任务（预扣 Credits，幂等 clientTxnId）
//   GET    /oral-workshop/jobs            我的任务列表（分页 + 状态筛选）
//   GET    /oral-workshop/jobs/:id        任务详情（含 7 步状态）
//   POST   /oral-workshop/jobs/:id/cancel 取消任务（退还预扣 Credits）
//   POST   /oral-workshop/jobs/:id/export 导出发布包（生成 create_publish_plans，幂等）
//   GET    /oral-workshop/templates       可用模板列表
//   GET/POST/DELETE /oral-workshop/voices  我的声音资产（参考音频 → 火山克隆）
//   GET/POST/DELETE /oral-workshop/digital-humans  我的数字人形象
//   POST   /oral-workshop/topics           选题灵感（关键词 → 5 个选题）
import { httpClient } from './http-client'
import type {
  BatchCreateOralWorkshopJobsDto,
  BatchCreateResult,
  CreateOralWorkshopJobDto,
  OralWorkshopJob,
  OralWorkshopJobListResult,
  OralWorkshopJobQuery,
  OralWorkshopTemplateMeta,
  PublishPackage,
  StyleAnalysisResult,
  TopicItem,
  VoiceAsset,
  DigitalHumanAsset,
  HeyGenAvatarItem,
  PublishAccount,
  PublishPlatformItem,
  PublishJobResult,
  PublishResultItem,
  PublishPackageAi,
  MixSuggestItem,
  IpArchive,
  VoicePoolItem,
  OralWorkshopMeta,
  JobStats,
} from '@/types/oral-workshop'

/**
 * 学习对标：从对标视频 URL 提取口播文案
 * POST /oral-workshop/extract-script  body: { videoUrl }
 */
export async function extractScriptFromVideo(videoUrl: string): Promise<{ text: string }> {
  return httpClient.post<{ text: string }>('/oral-workshop/extract-script', { videoUrl })
}

/**
 * 生成封面标题（主标题+副标题）
 * POST /oral-workshop/jobs/:id/title
 */
export async function generateCoverTitle(jobId: number): Promise<{ h1: string; h2: string }> {
  return httpClient.post<{ h1: string; h2: string }>(`/oral-workshop/jobs/${jobId}/title`)
}

/**
 * 保存封面设计（封面图 URL + 主/副标题 + 配置）
 * POST /oral-workshop/jobs/:id/cover  body: { coverUrl, coverH1?, coverH2?, coverConfig? }
 */
export async function saveJobCover(
  jobId: number,
  payload: { coverUrl: string; coverH1?: string; coverH2?: string; coverConfig?: string }
): Promise<OralWorkshopJob> {
  return httpClient.post<OralWorkshopJob>(`/oral-workshop/jobs/${jobId}/cover`, payload)
}
/** 单条任务预估 Credits（与后端 DEFAULT_ESTIMATED_CREDITS 一致，提交前展示） */
export const ORAL_WORKSHOP_ESTIMATED_CREDITS = 21

/**
 * 创建口播工坊任务
 * POST /oral-workshop/jobs  body: CreateOralWorkshopJobDto
 */
export async function createOralWorkshopJob(
  dto: CreateOralWorkshopJobDto
): Promise<OralWorkshopJob> {
  return httpClient.post<OralWorkshopJob>('/oral-workshop/jobs', dto)
}

/**
 * 我的任务列表
 * GET /oral-workshop/jobs?page=&pageSize=&status=
 */
export async function listOralWorkshopJobs(
  query: OralWorkshopJobQuery = {}
): Promise<OralWorkshopJobListResult> {
  return httpClient.get<OralWorkshopJobListResult>('/oral-workshop/jobs', { params: query })
}

/**
 * 任务详情（含 7 步状态）
 * GET /oral-workshop/jobs/:id
 */
export async function getOralWorkshopJob(id: number): Promise<OralWorkshopJob> {
  return httpClient.get<OralWorkshopJob>(`/oral-workshop/jobs/${id}`)
}

/**
 * 手动/单步模式：执行下一步（放行暂停任务）
 * POST /oral-workshop/jobs/:id/advance
 */
export async function advanceOralWorkshopJob(id: number): Promise<OralWorkshopJob> {
  return httpClient.post<OralWorkshopJob>(`/oral-workshop/jobs/${id}/advance`)
}

/**
 * 取消任务（退还预扣 Credits）
 * POST /oral-workshop/jobs/:id/cancel
 */
export async function cancelOralWorkshopJob(id: number): Promise<OralWorkshopJob> {
  return httpClient.post<OralWorkshopJob>(`/oral-workshop/jobs/${id}/cancel`)
}

/**
 * 导出发布包（幂等，生成 create_publish_plans 记录）
 * POST /oral-workshop/jobs/:id/export
 */
export async function exportOralWorkshopPackage(id: number): Promise<PublishPackage> {
  return httpClient.post<PublishPackage>(`/oral-workshop/jobs/${id}/export`)
}

/**
 * 可用模板列表
 * GET /oral-workshop/templates
 */
export async function listOralWorkshopTemplates(): Promise<OralWorkshopTemplateMeta[]> {
  return httpClient.get<OralWorkshopTemplateMeta[]>('/oral-workshop/templates')
}

/**
 * 我的声音列表
 * GET /oral-workshop/voices
 */
/**
 * 官方音色池（管理后台维护，seed-tts-2.0 官方音色）
 * GET /oral-workshop/voice-pool
 */
/**
 * 工作台元数据：官方音色池 + 档位积分定价
 * GET /oral-workshop/meta
 */
export async function getOralWorkshopMeta(): Promise<OralWorkshopMeta> {
  return httpClient.get<OralWorkshopMeta>('/oral-workshop/meta')
}

export async function getVoicePool(): Promise<VoicePoolItem[]> {
  return httpClient.get<VoicePoolItem[]>('/oral-workshop/voice-pool')
}

export async function listMyVoices(): Promise<VoiceAsset[]> {
  return httpClient.get<VoiceAsset[]>('/oral-workshop/voices')
}

/**
 * 新增声音（参考音频 URL）
 * POST /oral-workshop/voices  body: { name, refAudioUrl }
 */
export async function createMyVoice(payload: { name: string; refAudioUrl: string; emotionRefAudio?: string }): Promise<VoiceAsset> {
  return httpClient.post<VoiceAsset>('/oral-workshop/voices', payload)
}

/**
 * 删除声音
 * DELETE /oral-workshop/voices/:id
 */
export async function deleteMyVoice(id: number): Promise<void> {
  return httpClient.delete<void>('/oral-workshop/voices/' + id)
}

/**
 * 我的数字人形象列表
 * GET /oral-workshop/digital-humans
 */
export async function listMyDigitalHumans(): Promise<DigitalHumanAsset[]> {
  return httpClient.get<DigitalHumanAsset[]>('/oral-workshop/digital-humans')
}

/**
 * 新增数字人形象（火山形象 ID）
 * POST /oral-workshop/digital-humans  body: { name, cloudId }
 */
export async function createMyDigitalHuman(payload: {
  name: string
  /** 数字人形象 ID（kind=cloud/avatar 时必填，火山形象 ID 或 HeyGen 预置形象 ID） */
  cloudId?: string
  /** 形象类型（D2/M4+）：cloud=火山形象 ID / video=本地上传真人视频 / image=HeyGen talking photo 图片 */
  kind?: 'cloud' | 'video' | 'image'
  /** 本地视频形象 URL（D2，kind=video 时后端会生成） */
  videoUrl?: string
  /** HeyGen talking photo 图片 URL（M4+，kind=image 时必填，需公网地址） */
  imageUrl?: string
  description?: string
  previewUrl?: string
}): Promise<DigitalHumanAsset> {
  return httpClient.post<DigitalHumanAsset>('/oral-workshop/digital-humans', payload)
}

/**
 * 上传真人视频建形象（D2：ffmpeg 转码 MP4/H.264 ≤1080P + 首帧预览）
 * POST /oral-workshop/digital-humans/upload  formData: { file }
 */
export async function uploadDigitalHumanVideo(file: File | Blob): Promise<DigitalHumanAsset> {
  const formData = new FormData()
  formData.append('file', file)
  return httpClient.post<DigitalHumanAsset>('/oral-workshop/digital-humans/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 600000,
  })
}

/**
 * 上传图片供 HeyGen talking photo 使用（M4+）
 * POST /oral-workshop/digital-humans/upload-image  formData: { file }
 * 返回 uploads 相对 URL；前端需 resolveMediaUrl 转公网地址后 createMyDigitalHuman(kind='image')
 */
export async function uploadDigitalHumanImage(file: File | Blob): Promise<{ imageUrl: string; previewUrl: string; fileName: string }> {
  const formData = new FormData()
  formData.append('file', file)
  return httpClient.post<{ imageUrl: string; previewUrl: string; fileName: string }>('/oral-workshop/digital-humans/upload-image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  })
}

/**
 * HeyGen 官方预置形象列表
 * GET /oral-workshop/heygen/avatars  返回 { configured, avatars, message? }
 */
export async function listHeygenAvatars(): Promise<{ configured: boolean; avatars: HeyGenAvatarItem[]; message?: string }> {
  return httpClient.get<{ configured: boolean; avatars: HeyGenAvatarItem[]; message?: string }>('/oral-workshop/heygen/avatars')
}

/**
 * 删除数字人形象
 * DELETE /oral-workshop/digital-humans/:id
 */
export async function deleteMyDigitalHuman(id: number): Promise<void> {
  return httpClient.delete<void>('/oral-workshop/digital-humans/' + id)
}

/**
 * 选题灵感：关键词 + 人设 → 5 个选题（excludedTopics=本轮已生成过的选题，避免重复）
 * POST /oral-workshop/topics  body: { keywords, persona?, count?, excludedTopics? }
 */
export async function generateTopics(payload: {
  keywords: string
  persona?: string
  count?: number
  excludedTopics?: string[]
  /** 行业或产品（选题贴合该领域） */
  industryOrProduct?: string
  /** 产品卖点（选题围绕卖点展开） */
  productSellingPoints?: string
}): Promise<TopicItem[]> {
  return httpClient.post<TopicItem[]>('/oral-workshop/topics', payload)
}

/**
 * 对标账号风格分析：参考内容 → 风格分析 + 5 条选题
 * POST /oral-workshop/style-analysis  body: { referenceContent, excludedTopics? }
 */
export async function analyzeStyle(payload: { referenceContent: string; excludedTopics?: string[] }): Promise<StyleAnalysisResult> {
  return httpClient.post<StyleAnalysisResult>('/oral-workshop/style-analysis', payload)
}

/**
 * 选题 → 口播文案生成：选题灵感选中后自动扩写完整口播文案
 * POST /oral-workshop/script  body: { topic, persona?, reference? }
 */
export async function generateScript(payload: { topic: string; persona?: string; reference?: string; style?: string }): Promise<{ text: string }> {
  return httpClient.post<{ text: string }>('/oral-workshop/script', payload)
}

/**
 * 批量矩阵化建单（文案 × 模板 × 声音 × 形象，逐单预扣 Credits）
 * POST /oral-workshop/jobs/batch  body: BatchCreateOralWorkshopJobsDto
 */
export async function batchCreateOralWorkshopJobs(dto: BatchCreateOralWorkshopJobsDto): Promise<BatchCreateResult> {
  return httpClient.post<BatchCreateResult>('/oral-workshop/jobs/batch', dto)
}

/**
 * 智能改写：AI 改写口播文案（A4：选模板/字数/参考范文）
 * POST /oral-workshop/rewrite  body: { script, templateId?, wordCount?, persona?, style?, reference? }
 */
export async function rewriteScript(payload: {
  script: string
  templateId?: 'rewrite_master' | 'generic_rewrite' | 'rewrite_detailed' | 'rewrite_deep_learn'
  wordCount?: number
  persona?: string
  style?: string
  reference?: string
}): Promise<{ text: string; template_id: string; word_count: number }> {
  return httpClient.post<{ text: string; template_id: string; word_count: number }>('/oral-workshop/rewrite', payload)
}

/**
 * 产品/营销文案：产品名称/卖点 → 口播文案（A5）
 * POST /oral-workshop/product-copy  body: { productName?, sellingPoints?, persona?, style? }
 */
export async function productCopy(payload: {
  productName?: string
  sellingPoints?: string
  persona?: string
  style?: string
}): Promise<{ text: string }> {
  return httpClient.post<{ text: string }>('/oral-workshop/product-copy', payload)
}

/**
 * 学习对标：上传本地音视频文件提取口播文案（A3，multipart）
 * POST /oral-workshop/extract-file  formData: { file }
 */
export async function extractFileFromUpload(file: File | Blob): Promise<{ text: string }> {
  const formData = new FormData()
  formData.append('file', file)
  return httpClient.post<{ text: string }>('/oral-workshop/extract-file', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  })
}

/**
 * 参考音频/视频裁剪（C2：截取时间段，返回可访问 URL）
 * POST /oral-workshop/media/trim  body: { sourceUrl, startSec, endSec }
 */
export async function trimMedia(payload: { sourceUrl: string; startSec: number; endSec: number }): Promise<{ url: string }> {
  return httpClient.post<{ url: string }>('/oral-workshop/media/trim', payload)
}

/**
 * 任务统计概览（F3：总数/排队中/生成中/已完成/失败/已取消）
 * GET /oral-workshop/jobs/stats
 */
export async function getJobStats(): Promise<JobStats> {
  return httpClient.get<JobStats>('/oral-workshop/jobs/stats')
}

/**
 * 重试失败任务（F3：重置失败步骤为 pending 重新入队）
 * POST /oral-workshop/jobs/:id/retry
 */
export async function retryOralWorkshopJob(id: number): Promise<OralWorkshopJob> {
  return httpClient.post<OralWorkshopJob>('/oral-workshop/jobs/' + id + '/retry')
}

/**
 * 删除任务（F3：软删除）
 * DELETE /oral-workshop/jobs/:id
 */
export async function deleteOralWorkshopJob(id: number): Promise<{ ok: boolean }> {
  return httpClient.delete<{ ok: boolean }>('/oral-workshop/jobs/' + id)
}

/**
 * 我的发布账号列表（F4a）
 * GET /oral-workshop/publish-accounts
 */
export async function listPublishAccounts(): Promise<PublishAccount[]> {
  return httpClient.get<PublishAccount[]>('/oral-workshop/publish-accounts')
}

/**
 * 添加发布账号（F4a：OAuth 授权占位，添加后为待授权）
 * POST /oral-workshop/publish-accounts  body: { platform, accountName, avatarUrl?, remark? }
 */
export async function createPublishAccount(payload: {
  platform: string
  accountName: string
  avatarUrl?: string
  remark?: string
}): Promise<PublishAccount> {
  return httpClient.post<PublishAccount>('/oral-workshop/publish-accounts', payload)
}

/**
 * 绑定发布账号（F4a：模拟 OAuth 授权完成，待授权 → 已绑定）
 * POST /oral-workshop/publish-accounts/:id/bind
 */
export async function bindPublishAccount(id: number): Promise<PublishAccount> {
  return httpClient.post<PublishAccount>('/oral-workshop/publish-accounts/' + id + '/bind')
}

/**
 * 删除发布账号（F4a）
 * DELETE /oral-workshop/publish-accounts/:id
 */
export async function deletePublishAccount(id: number): Promise<{ ok: boolean }> {
  return httpClient.delete<{ ok: boolean }>('/oral-workshop/publish-accounts/' + id)
}

/**
 * 发布任务到账号（F4a：校验完成态 + 账号已绑定，直接发布）
 * POST /oral-workshop/jobs/:id/publish  body: { accountId }
 */
/**
 * 发布任务到账号（G5：多账号批量 / 直接发布或保存草稿；对标 529 发布面板）
 * POST /oral-workshop/jobs/:id/publish  body: { accountIds, mode, title?, description? }
 */
export async function publishJob(
  jobId: number,
  payload: { accountIds: number[]; mode?: 'manual' | 'auto' | 'draft'; title?: string; description?: string },
): Promise<PublishJobResult> {
  return httpClient.post<PublishJobResult>('/oral-workshop/jobs/' + jobId + '/publish', payload)
}

/** 兼容旧调用：单账号手动发布 */
export async function publishJobToAccount(jobId: number, accountId: number): Promise<PublishJobResult> {
  return publishJob(jobId, { accountIds: [accountId], mode: 'manual' })
}

/**
 * 发布平台开关列表（桌面端只用 enabled 平台）
 * GET /oral-workshop/publish-platforms
 */
export async function listPublishPlatforms(): Promise<PublishPlatformItem[]> {
  return httpClient.get<PublishPlatformItem[]>('/oral-workshop/publish-platforms')
}

/**
 * 扫码登录成功回填登录态（桌面端采集 cookies 加密上传）
 * POST /oral-workshop/publish-accounts/:id/session  body: { cookiesJson, displayName?, expiresAt? }
 */
export async function saveAccountSession(
  id: number,
  payload: { cookiesJson: string; displayName?: string; expiresAt?: string },
): Promise<PublishAccount> {
  return httpClient.post<PublishAccount>('/oral-workshop/publish-accounts/' + id + '/session', payload)
}

/**
 * 测试连接：用 cookie 探测平台登录态（对标 account:test-login）
 * POST /oral-workshop/publish-accounts/:id/test-login
 */
export async function testAccountLogin(id: number): Promise<{ online: boolean; status: string; message?: string }> {
  return httpClient.post<{ online: boolean; status: string; message?: string }>('/oral-workshop/publish-accounts/' + id + '/test-login')
}

/**
 * 解绑账号：清空登录态（cookies 置空）
 * DELETE /oral-workshop/publish-accounts/:id/session
 */
export async function clearAccountSession(id: number): Promise<{ ok: boolean }> {
  return httpClient.delete<{ ok: boolean }>('/oral-workshop/publish-accounts/' + id + '/session')
}

/**
 * AI 生成发布标题/描述（对标 529 发布面板「一键生成」）
 * POST /oral-workshop/jobs/:id/publish-package
 */
export async function getPublishPackage(jobId: number): Promise<PublishPackageAi> {
  return httpClient.post<PublishPackageAi>('/oral-workshop/jobs/' + jobId + '/publish-package', {})
}

/**
 * 发布结果回写（桌面端完成手动/自动发布后回调，G6）
 * POST /oral-workshop/jobs/:id/publish-result  body: { planId, results }
 */
export async function writePublishResult(
  jobId: number,
  payload: { planId: number; results: PublishResultItem[] },
): Promise<{ ok: boolean }> {
  return httpClient.post<{ ok: boolean }>('/oral-workshop/jobs/' + jobId + '/publish-result', payload)
}

/**
 * AI 混剪建议（P4：字幕关键词 → 素材库向量检索 → 推荐画中画）
 * POST /oral-workshop/jobs/:id/mix-suggest
 */
export async function mixSuggest(jobId: number): Promise<MixSuggestItem[]> {
  return httpClient.post<MixSuggestItem[]>('/oral-workshop/jobs/' + jobId + '/mix-suggest', {})
}

/**
 * IP 大脑：分析对标账号主页 → 作品列表 → LLM 风格分析 + 选题
 * POST /oral-workshop/ip-brain/analyze  body: { url }
 */
export async function analyzeIpArchive(url: string): Promise<IpArchive> {
  return httpClient.post<IpArchive>('/oral-workshop/ip-brain/analyze', { url })
}

/** 我的 IP 大脑档案列表 */
export async function listIpArchives(): Promise<IpArchive[]> {
  return httpClient.get<IpArchive[]>('/oral-workshop/ip-brain')
}

/** 删除 IP 档案 */
export async function deleteIpArchive(id: number): Promise<{ ok: boolean }> {
  return httpClient.delete<{ ok: boolean }>('/oral-workshop/ip-brain/' + id)
}

/**
 * 把任务产物（成片/封面/人声轨）一键导入素材库（幂等）
 * POST /oral-workshop/jobs/:id/import-materials
 */
export async function importJobToMaterials(jobId: number): Promise<{ imported: number; list: Array<{ assetType: string; url: string; title: string }> }> {
  return httpClient.post<{ imported: number; list: Array<{ assetType: string; url: string; title: string }> }>('/oral-workshop/jobs/' + jobId + '/import-materials')
}

export default {
  createOralWorkshopJob,
  batchCreateOralWorkshopJobs,
  listOralWorkshopJobs,
  getOralWorkshopJob,
  cancelOralWorkshopJob,
  exportOralWorkshopPackage,
  listOralWorkshopTemplates,
  listMyVoices,
  createMyVoice,
  deleteMyVoice,
  listMyDigitalHumans,
  createMyDigitalHuman,
  uploadDigitalHumanVideo,
  uploadDigitalHumanImage,
  listHeygenAvatars,
  deleteMyDigitalHuman,
  listPublishAccounts,
  createPublishAccount,
  bindPublishAccount,
  deletePublishAccount,
  publishJobToAccount,
  publishJob,
  listPublishPlatforms,
  saveAccountSession,
  testAccountLogin,
  clearAccountSession,
  getPublishPackage,
  writePublishResult,
  mixSuggest,
  analyzeIpArchive,
  listIpArchives,
  deleteIpArchive,
  generateTopics,
  generateScript,
  rewriteScript,
  productCopy,
  extractFileFromUpload,
  trimMedia,
  getJobStats,
  retryOralWorkshopJob,
  deleteOralWorkshopJob,
}

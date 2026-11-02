import { API_BASE_URL } from '../config'
import { ApiError, ensureSession, request } from './session'

// 业务接口与文件上传、下载。所有请求都带业务令牌；上传带 clientUploadId，重试不会产生重复文件。

export type Stage =
  | 'materials_not_ready'
  | 'awaiting_profile'
  | 'awaiting_script'
  | 'awaiting_shots'
  | 'in_review'
  | 'rework'
  | 'producing'
  | 'deliverable'

export const STAGE_LABELS: Record<Stage, string> = {
  materials_not_ready: '资料准备中',
  awaiting_profile: '待建档',
  awaiting_script: '待选稿',
  awaiting_shots: '待拍摄',
  in_review: '待审核',
  rework: '退回补拍',
  producing: '制作中',
  deliverable: '可下载',
}

export type Segment = { segmentId: string; line: string; source: 'shot' | 'shared' | 'avatar'; focus: string; factRef?: string }
export type Candidate = { candidateId: string; angle: string; segments: Segment[] }
export type UploadInfo = { uploadId: string; fileName: string; size: number; sha256: string }
export type Shot = {
  itemId: string
  segmentId: string
  prompt: string
  status: 'pending' | 'uploaded' | 'approved' | 'rejected'
  rejectReason: string | null
  version: number
  upload: UploadInfo | null
}
export type Task = {
  taskId: string
  stage: Stage
  storedStage: Stage
  sku: { name: string }
  requirements: string
  profileStatus: string
  scripts: { status: string }
  script: { candidateId: string; segments: Segment[] } | null
  shots: Shot[]
}
export type Profile = {
  status: 'none' | 'draft' | 'submitted' | 'approved' | 'rejected'
  voice: UploadInfo | null
  referenceVideo: UploadInfo | null
  consentVersion: string | null
  currentConsentVersion: string
  reviewReason: string | null
}

export const api = {
  tasks: () => request<Task[]>('GET', '/tasks'),
  task: (taskId: string) => request<Task>('GET', `/tasks/${taskId}`),
  scripts: (taskId: string) => request<{ status: string; candidates: Candidate[] }>('GET', `/tasks/${taskId}/scripts`),
  selectScript: (taskId: string, candidateId: string, segments: { segmentId: string; line: string }[]) =>
    request<Task>('PUT', `/tasks/${taskId}/script`, { candidateId, segments }),
  submitTask: (taskId: string) => request<Task>('POST', `/tasks/${taskId}/submit`),
  delivery: (taskId: string) => request<{ video: UploadInfo; cover: UploadInfo }>('GET', `/tasks/${taskId}/delivery`),
  profile: () => request<Profile>('GET', '/profile'),
  consent: (version: string) => request<Profile>('POST', '/profile/consent', { version }),
  submitProfile: () => request<Profile>('POST', '/profile/submit'),
}

function newClientUploadId(): string {
  const random = Math.random().toString(36).slice(2, 10)
  return `mp-${Date.now().toString(36)}-${random}`
}

/** 上传一个本地临时文件；onProgress 回报 0–100。 */
export async function uploadFile<T>(path: string, filePath: string, onProgress?: (percent: number) => void): Promise<T> {
  const session = await ensureSession()
  const clientUploadId = newClientUploadId()
  return new Promise<T>((resolve, reject) => {
    const task = wx.uploadFile({
      url: `${API_BASE_URL}${path}`,
      filePath,
      name: 'file',
      formData: { clientUploadId },
      header: { authorization: `Bearer ${session.accessToken}` },
      success: (res) => {
        let data: unknown = null
        try {
          data = JSON.parse(res.data)
        } catch {
          // 非 JSON 响应按失败处理。
        }
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(data as T)
        const error = (data as { error?: { code?: string; message?: string } } | null)?.error
        reject(new ApiError(res.statusCode, error?.code ?? 'upload_failed', error?.message ?? `上传失败（${res.statusCode}）`))
      },
      fail: (err) => reject(new ApiError(0, 'network_error', `上传失败：${err.errMsg}`)),
    })
    if (onProgress) task.onProgressUpdate((res) => onProgress(res.progress))
  })
}

/** 下载自己的文件到本地临时路径。 */
export async function downloadFile(uploadId: string): Promise<string> {
  const session = await ensureSession()
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url: `${API_BASE_URL}/files/${uploadId}`,
      header: { authorization: `Bearer ${session.accessToken}` },
      success: (res) =>
        res.statusCode === 200 ? resolve(res.tempFilePath) : reject(new ApiError(res.statusCode, 'download_failed', `下载失败（${res.statusCode}）`)),
      fail: (err) => reject(new ApiError(0, 'network_error', `下载失败：${err.errMsg}`)),
    })
  })
}

export function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message
  return error instanceof Error ? error.message : String(error)
}

/** 拍摄或选择一段视频，单次最长 60 秒（spec §4）。 */
export function chooseVideo(camera: 'back' | 'front'): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: 1,
      mediaType: ['video'],
      sourceType: ['camera', 'album'],
      maxDuration: 60,
      camera,
      success: (res) => resolve(res.tempFiles[0].tempFilePath),
      fail: (err) => reject(new Error(err.errMsg.includes('cancel') ? '已取消' : `无法获取视频：${err.errMsg}`)),
    })
  })
}

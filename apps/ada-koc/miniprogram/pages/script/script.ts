import { api, Candidate, describeError } from '../../services/api'

// 选稿与编辑：一批三篇候选，选一篇后只改台词；确认进入拍摄后由服务端锁稿。不提供换批（PRD §5.1）。

const SOURCE_LABELS: Record<string, string> = { avatar: '数字人', shot: '本单实拍', shared: '共享素材' }

type ViewSegment = { segmentId: string; line: string; sourceLabel: string; focus: string }
type ViewCandidate = { candidateId: string; angle: string; segments: ViewSegment[] }

const POLL_MS = 3000
let pollTimer: number | null = null

function stopPolling() {
  if (pollTimer !== null) clearTimeout(pollTimer)
  pollTimer = null
}

Page({
  data: {
    taskId: '',
    status: 'loading',
    candidates: [] as ViewCandidate[],
    selectedId: '',
    editing: [] as ViewSegment[],
    saving: false,
    error: '',
  },

  onLoad(query: Record<string, string | undefined>) {
    this.setData({ taskId: query.taskId ?? '' })
  },

  onShow() {
    this.load()
  },

  onHide: stopPolling,
  onUnload: stopPolling,

  async load() {
    stopPolling()
    try {
      const result = await api.scripts(this.data.taskId)
      // 稿件生成中或资料准备中时定时刷新，生成好后自动出现三篇。
      if (result.status === 'generating' || result.status === 'materials_not_ready') {
        pollTimer = setTimeout(() => this.load(), POLL_MS) as unknown as number
      }
      this.setData({
        status: result.status,
        candidates: result.candidates.map((c: Candidate) => ({
          candidateId: c.candidateId,
          angle: c.angle,
          segments: c.segments.map((s) => ({ segmentId: s.segmentId, line: s.line, sourceLabel: SOURCE_LABELS[s.source] ?? s.source, focus: s.focus })),
        })),
      })
    } catch (error) {
      this.setData({ error: describeError(error) })
    }
  },

  onSelect(event: WechatMiniprogram.BaseEvent) {
    const candidateId = event.currentTarget.dataset.candidateId as string
    const candidate = this.data.candidates.find((c) => c.candidateId === candidateId)
    if (!candidate) return
    this.setData({ selectedId: candidateId, editing: candidate.segments.map((s) => ({ ...s })) })
  },

  onEditLine(event: WechatMiniprogram.Input) {
    const index = Number(event.currentTarget.dataset.index)
    this.setData({ [`editing[${index}].line`]: event.detail.value })
  },

  onOpenProfile() {
    wx.navigateTo({ url: `/pages/profile/profile?taskId=${encodeURIComponent(this.data.taskId)}` })
  },

  onBack() {
    this.setData({ selectedId: '', editing: [] })
  },

  async onConfirm() {
    this.setData({ saving: true, error: '' })
    try {
      await api.selectScript(
        this.data.taskId,
        this.data.selectedId,
        this.data.editing.map((s) => ({ segmentId: s.segmentId, line: s.line })),
      )
      wx.redirectTo({ url: `/pages/shots/shots?taskId=${encodeURIComponent(this.data.taskId)}` })
    } catch (error) {
      this.setData({ error: describeError(error) })
    } finally {
      this.setData({ saving: false })
    }
  },
})

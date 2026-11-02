import { api, chooseVideo, describeError, Shot, STAGE_LABELS, Task, uploadFile } from '../../services/api'

// 拍摄与上传：按稿件生成的提示逐项拍摄、逐项上传；被退回的项单独重拍（PRD §4.3）。

const STATUS_LABELS: Record<Shot['status'], string> = {
  pending: '待拍摄',
  uploaded: '已上传',
  approved: '已通过',
  rejected: '需重拍',
}

type ViewShot = Shot & { statusLabel: string; canUpload: boolean; progress: number }

function canUpload(task: Task, shot: Shot): boolean {
  if (task.stage === 'awaiting_shots') return shot.status === 'pending' || shot.status === 'uploaded'
  if (task.stage === 'rework') return shot.status === 'rejected' || (shot.status === 'uploaded' && Boolean(shot.rejectReason))
  return false
}

Page({
  data: {
    taskId: '',
    stage: '',
    stageLabel: '',
    skuName: '',
    shots: [] as ViewShot[],
    canSubmit: false,
    busyItem: '',
    error: '',
  },

  onLoad(query: Record<string, string | undefined>) {
    this.setData({ taskId: query.taskId ?? '' })
  },

  onShow() {
    this.refresh()
  },

  async refresh() {
    try {
      this.apply(await api.task(this.data.taskId))
    } catch (error) {
      this.setData({ error: describeError(error) })
    }
  },

  apply(task: Task) {
    const shots = task.shots.map((shot) => ({ ...shot, statusLabel: STATUS_LABELS[shot.status], canUpload: canUpload(task, shot), progress: 0 }))
    const editable = task.stage === 'awaiting_shots' || task.stage === 'rework'
    this.setData({
      stage: task.stage,
      stageLabel: STAGE_LABELS[task.stage],
      skuName: task.sku.name,
      shots,
      canSubmit: editable && shots.length > 0 && shots.every((s) => s.status === 'uploaded' || s.status === 'approved'),
    })
  },

  async onShoot(event: WechatMiniprogram.BaseEvent) {
    const itemId = event.currentTarget.dataset.itemId as string
    try {
      const path = await chooseVideo('back')
      this.setData({ busyItem: itemId, error: '' })
      const index = this.data.shots.findIndex((s) => s.itemId === itemId)
      const task = await uploadFile<Task>(`/tasks/${this.data.taskId}/shots/${itemId}/upload`, path, (p) =>
        this.setData({ [`shots[${index}].progress`]: p }),
      )
      this.apply(task)
    } catch (error) {
      this.setData({ error: describeError(error) })
    } finally {
      this.setData({ busyItem: '' })
    }
  },

  onOpenDelivery() {
    wx.navigateTo({ url: `/pages/delivery/delivery?taskId=${encodeURIComponent(this.data.taskId)}` })
  },

  async onSubmit() {
    try {
      this.apply(await api.submitTask(this.data.taskId))
      wx.showToast({ title: '已提交审核', icon: 'success' })
    } catch (error) {
      this.setData({ error: describeError(error) })
    }
  },
})

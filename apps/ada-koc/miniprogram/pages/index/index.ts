// 开发者工具的代码分析不识别 `import { …, type X }` 写法，会把被引用的文件当成未使用而丢弃，
// 因此这里用普通导入；只作类型使用的名字会在编译时被移除。
import { api, describeError, STAGE_LABELS, Stage, Task } from '../../services/api'
import { clearSession, ensureSession, login } from '../../services/session'

/** 不同阶段进入的页面。 */
function pageFor(task: Task): string {
  const id = encodeURIComponent(task.taskId)
  switch (task.stage) {
    case 'awaiting_profile':
      return `/pages/profile/profile?taskId=${id}`
    case 'awaiting_script':
    case 'materials_not_ready':
      return `/pages/script/script?taskId=${id}`
    case 'deliverable':
      return `/pages/delivery/delivery?taskId=${id}`
    default:
      return `/pages/shots/shots?taskId=${id}`
  }
}

/** 平台接单后带着 taskId 跳进来时，直接打开该任务（spec §16.1 ⑤）。 */
let pendingTaskId = ''

Page({
  data: {
    state: 'loading' as 'loading' | 'ready' | 'failed',
    memberId: '',
    message: '',
    tasks: [] as { taskId: string; skuName: string; stageLabel: string; stage: Stage }[],
  },

  onLoad(query: Record<string, string | undefined>) {
    pendingTaskId = query.taskId ? decodeURIComponent(query.taskId) : ''
  },

  onShow() {
    this.load().then(() => {
      if (!pendingTaskId || this.data.state !== 'ready') return
      const taskId = pendingTaskId
      pendingTaskId = ''
      this.openTask(taskId)
    })
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh())
  },

  async load() {
    try {
      const session = await ensureSession()
      const tasks = await api.tasks()
      this.setData({
        state: 'ready',
        memberId: session.member.memberId,
        message: '',
        tasks: tasks.map((t) => ({ taskId: t.taskId, skuName: t.sku.name, stage: t.stage, stageLabel: STAGE_LABELS[t.stage] })),
      })
    } catch (error) {
      this.setData({ state: 'failed', message: describeError(error) })
    }
  },

  async onRetry() {
    clearSession()
    try {
      await login()
    } catch {
      // load() 会显示错误。
    }
    this.load()
  },

  onOpenTask(event: WechatMiniprogram.BaseEvent) {
    this.openTask(event.currentTarget.dataset.taskId as string)
  },

  async openTask(taskId: string) {
    try {
      wx.navigateTo({ url: pageFor(await api.task(taskId)) })
    } catch (error) {
      wx.showToast({ title: describeError(error), icon: 'none' })
    }
  },

  onOpenProfile() {
    wx.navigateTo({ url: '/pages/profile/profile' })
  },
})

import { api, describeError, downloadFile } from '../../services/api'

// 成片与封面：预览并保存到相册；修改需求线下沟通，不提供在线返修（PRD §4.4）。

function saveToAlbum(kind: 'video' | 'image', filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const options = { filePath, success: () => resolve(), fail: (err: WechatMiniprogram.GeneralCallbackResult) => reject(new Error(err.errMsg)) }
    if (kind === 'video') wx.saveVideoToPhotosAlbum(options)
    else wx.saveImageToPhotosAlbum(options)
  })
}

Page({
  data: {
    taskId: '',
    videoPath: '',
    coverPath: '',
    loading: true,
    error: '',
  },

  async onLoad(query: Record<string, string | undefined>) {
    this.setData({ taskId: query.taskId ?? '' })
    try {
      const delivery = await api.delivery(this.data.taskId)
      const [videoPath, coverPath] = await Promise.all([downloadFile(delivery.video.uploadId), downloadFile(delivery.cover.uploadId)])
      this.setData({ videoPath, coverPath })
    } catch (error) {
      this.setData({ error: describeError(error) })
    } finally {
      this.setData({ loading: false })
    }
  },

  async onSave(event: WechatMiniprogram.BaseEvent) {
    const kind = event.currentTarget.dataset.kind as 'video' | 'image'
    try {
      await saveToAlbum(kind, kind === 'video' ? this.data.videoPath : this.data.coverPath)
      wx.showToast({ title: '已保存到相册', icon: 'success' })
    } catch (error) {
      wx.showToast({ title: `保存失败：${describeError(error)}`, icon: 'none' })
    }
  },
})

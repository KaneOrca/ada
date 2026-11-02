import { api, chooseVideo, describeError, Profile, uploadFile } from '../../services/api'

// 首次建档：声音采样 + 本人参考视频 + 使用确认（PRD §4.2）。提词器不做，只显示朗读文本。

const READING_TEXT =
  '大家好，我是这款产品的试用者。今天天气不错，我刚收拾完房间，准备分享一下这段时间的真实使用感受。' +
  '我会从外观、使用方法和日常场景三个方面慢慢说清楚，希望对你有帮助。'

const STATUS_LABELS: Record<Profile['status'], string> = {
  none: '未建档',
  draft: '未提交',
  submitted: '审核中',
  approved: '已通过',
  rejected: '被退回',
}

const recorder = wx.getRecorderManager()

Page({
  data: {
    taskId: '',
    readingText: READING_TEXT,
    status: 'none' as Profile['status'],
    statusLabel: '',
    reviewReason: '',
    hasVoice: false,
    hasReference: false,
    consented: false,
    consentVersion: '',
    editable: true,
    recording: false,
    busy: '',
    error: '',
  },

  onLoad(query: Record<string, string | undefined>) {
    this.setData({ taskId: query.taskId ?? '' })
    recorder.onStop((res) => this.uploadVoice(res.tempFilePath))
    recorder.onError((err) => this.setData({ recording: false, error: `录音失败：${err.errMsg}` }))
  },

  onShow() {
    this.refresh()
  },

  async refresh() {
    try {
      this.apply(await api.profile())
    } catch (error) {
      this.setData({ error: describeError(error) })
    }
  },

  apply(profile: Profile) {
    this.setData({
      status: profile.status,
      statusLabel: STATUS_LABELS[profile.status],
      reviewReason: profile.reviewReason ?? '',
      hasVoice: Boolean(profile.voice),
      hasReference: Boolean(profile.referenceVideo),
      consented: profile.consentVersion === profile.currentConsentVersion,
      consentVersion: profile.currentConsentVersion,
      editable: profile.status !== 'submitted' && profile.status !== 'approved',
    })
  },

  onToggleRecord() {
    if (this.data.recording) {
      recorder.stop()
      this.setData({ recording: false })
      return
    }
    // 44100 Hz 采样率要求码率在 64000–320000 之间，不传时默认值不合法会直接抛错。
    try {
      recorder.start({ duration: 120000, sampleRate: 44100, numberOfChannels: 1, encodeBitRate: 128000, format: 'wav' })
      this.setData({ recording: true, error: '' })
    } catch (error) {
      this.setData({ recording: false, error: `无法开始录音：${describeError(error)}` })
    }
  },

  async uploadVoice(tempFilePath: string) {
    this.setData({ busy: '正在上传声音采样…' })
    try {
      this.apply(await uploadFile<Profile>('/profile/voice', tempFilePath))
    } catch (error) {
      this.setData({ error: describeError(error) })
    } finally {
      this.setData({ busy: '' })
    }
  },

  async onRecordReference() {
    try {
      const path = await chooseVideo('front')
      this.setData({ busy: '正在上传参考视频…', error: '' })
      this.apply(await uploadFile<Profile>('/profile/reference-video', path, (p) => this.setData({ busy: `正在上传参考视频… ${p}%` })))
    } catch (error) {
      this.setData({ error: describeError(error) })
    } finally {
      this.setData({ busy: '' })
    }
  },

  async onConsent() {
    try {
      this.apply(await api.consent(this.data.consentVersion))
    } catch (error) {
      this.setData({ error: describeError(error) })
    }
  },

  async onSubmit() {
    try {
      this.apply(await api.submitProfile())
      wx.showToast({ title: '已提交审核', icon: 'success' })
      if (this.data.taskId) {
        wx.redirectTo({ url: `/pages/script/script?taskId=${encodeURIComponent(this.data.taskId)}` })
      }
    } catch (error) {
      this.setData({ error: describeError(error) })
    }
  },
})

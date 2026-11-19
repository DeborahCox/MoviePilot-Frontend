import { describe, expect, it } from 'vitest'
import {
  MAX_RETRY_COUNT,
  TONE_LABEL_KEYS,
  classifySearchError,
  cooldownSecondsLeft,
  extractBracketContent,
  isCoolingDown,
  rowActions,
  stripErrorPrefix,
} from '@/utils/searchErrorClassify'

const NOW = 1_700_000_000_000

/**
 * 规格第 10 节要求覆盖的 6 类真实样本（文本取自后端 search 失败提示的真实形态）。
 */
describe('classifySearchError · 真实样本', () => {
  it('API Key 提示 → info / 缺少 API Key', () => {
    const result = classifySearchError(
      '站点请求或页面解析失败 · 请在高清视界「控制面板 → 安全设定」获取 API Key，并填入站点 API Key；保存后回到本页重新搜索',
    )

    expect(result.tone).toBe('info')
    expect(result.labelKey).toBe(TONE_LABEL_KEYS.missingApiKey)
    // detail 必须是 strip 后的原文，不含固定前缀
    expect(result.detail).toBe(
      '请在高清视界「控制面板 → 安全设定」获取 API Key，并填入站点 API Key；保存后回到本页重新搜索',
    )
    expect(result.detail.startsWith('站点请求或页面解析失败')).toBe(false)
    expect(result.raw).toContain('站点请求或页面解析失败')
  })

  it('无响应（网络错误或超时）→ warning / 站点无响应（优先于超时）', () => {
    const result = classifySearchError('站点请求或页面解析失败 · 站点无响应（网络错误或超时）')

    expect(result.tone).toBe('warning')
    expect(result.labelKey).toBe(TONE_LABEL_KEYS.noResponse)
    expect(result.detail).toBe('站点无响应（网络错误或超时）')
  })

  it('返回登录或权限提示页 → info / 登录失效', () => {
    const result = classifySearchError('站点请求或页面解析失败 · 返回登录或权限提示页，请更新站点 Cookie 后重试')

    expect(result.tone).toBe('info')
    expect(result.labelKey).toBe(TONE_LABEL_KEYS.loginExpired)
  })

  it('HTTP 403 + 响应内容含 JS 垃圾 → error / HTTP 403 拒绝', () => {
    const result = classifySearchError(
      "站点请求或页面解析失败 · HTTP 403 · 响应内容：403 Forbidden Unauthorized IP address. (function(){var d=b.createElement('div');d.innerHTML='<iframe src=\"https://tingge.me/js/verify.html\"></iframe>';b.body.appendChild(d);})();",
    )

    expect(result.tone).toBe('error')
    expect(result.labelKey).toBe(TONE_LABEL_KEYS.forbidden)
    // 原始文本原样保留（含 HTML 片段），但只作为纯文本渲染/复制
    expect(result.raw).toContain('<iframe')
    expect(result.detail).toContain('403 Forbidden')
  })

  it('无括号纯前缀 → info / 解析器需更新，detail 为空', () => {
    const result = classifySearchError('站点请求或页面解析失败')

    expect(result.tone).toBe('info')
    expect(result.labelKey).toBe(TONE_LABEL_KEYS.parserUpdate)
    expect(result.detail).toBe('')
  })

  it('括号内嵌套括号 → 仍能取出真原因并分类', () => {
    const result = classifySearchError('站点请求或页面解析失败 · 站点无响应（网络错误（连接被重置））')

    expect(result.tone).toBe('warning')
    expect(result.labelKey).toBe(TONE_LABEL_KEYS.noResponse)
    expect(extractBracketContent(result.detail)).toBe('网络错误（连接被重置）')
  })
})

describe('classifySearchError · 边界', () => {
  it('完全空文本 → unknown（保留重试出口，不误判成解析器需更新）', () => {
    const result = classifySearchError('')

    expect(result.tone).toBe('unknown')
    expect(result.labelKey).toBe(TONE_LABEL_KEYS.unknown)
    expect(result.detail).toBe('')
  })

  it('无法识别的原始文本 → unknown，detail 回显原文不套模板', () => {
    const raw = 'Unhandled payload: {"ret":-1,"msg":"system busy"}'
    const result = classifySearchError(raw)

    expect(result.tone).toBe('unknown')
    expect(result.detail).toBe(raw)
  })

  it('5xx 归入 warning / 服务器错误', () => {
    expect(classifySearchError('站点请求或页面解析失败 · 上游返回 502 Bad Gateway').labelKey).toBe(
      TONE_LABEL_KEYS.serverError,
    )
    expect(classifySearchError('站点请求或页面解析失败 · 请求超时').labelKey).toBe(TONE_LABEL_KEYS.timeout)
  })

  it('401 / Unauthorized 归入 error / 登录被拒', () => {
    const result = classifySearchError('站点请求或页面解析失败 · HTTP 401 Unauthorized')

    expect(result.tone).toBe('error')
    expect(result.labelKey).toBe(TONE_LABEL_KEYS.loginRejected)
  })

  it('状态码优先于「请登录」等提示语', () => {
    expect(classifySearchError('站点请求或页面解析失败 · HTTP 403 请登录后访问').labelKey).toBe(
      TONE_LABEL_KEYS.forbidden,
    )
  })

  it('半角括号同样可解析，且折叠换行为单行', () => {
    const result = classifySearchError('站点请求或页面解析失败 · 站点无响应(网络错误或超时)\n第二行')

    expect(result.tone).toBe('warning')
    expect(result.detail.includes('\n')).toBe(false)
  })

  it('stripErrorPrefix 去掉前导分隔符', () => {
    expect(stripErrorPrefix('站点请求或页面解析失败：· - 站点无响应')).toBe('站点无响应')
    expect(stripErrorPrefix('  · 站点无响应 ')).toBe('站点无响应')
  })
})

describe('rowActions · tone × cooldown × retryCount × canContinue', () => {
  it('warning 未冷却 → 仅重试', () => {
    expect(rowActions({ tone: 'warning', canContinue: true, retryCount: 0, now: NOW })).toEqual(['retry'])
  })

  it('warning 冷却中 → 空（由组件原位渲染倒计时占位）', () => {
    expect(
      rowActions({ tone: 'warning', canContinue: true, retryCount: 1, cooldownUntil: NOW + 42_000, now: NOW }),
    ).toEqual([])
  })

  it('warning 冷却已结束 → 恢复重试', () => {
    expect(rowActions({ tone: 'warning', canContinue: true, retryCount: 1, cooldownUntil: NOW - 1, now: NOW })).toEqual(
      ['retry'],
    )
  })

  it('warning 重试耗尽（>=3）→ 主操作降级为去更新', () => {
    expect(rowActions({ tone: 'warning', canContinue: true, retryCount: MAX_RETRY_COUNT, now: NOW })).toEqual([
      'update',
    ])
  })

  it('warning 不可续页 → 不给重试', () => {
    expect(rowActions({ tone: 'warning', canContinue: false, retryCount: 0, now: NOW })).toEqual(['update'])
  })

  it('unknown → 重试 + 去更新 双出口', () => {
    expect(rowActions({ tone: 'unknown', canContinue: true, retryCount: 0, now: NOW })).toEqual(['retry', 'update'])
  })

  it('unknown 冷却中 → 保留去更新', () => {
    expect(
      rowActions({ tone: 'unknown', canContinue: true, retryCount: 2, cooldownUntil: NOW + 10_000, now: NOW }),
    ).toEqual(['update'])
  })

  it('unknown 重试耗尽 → 只留去更新', () => {
    expect(rowActions({ tone: 'unknown', canContinue: true, retryCount: MAX_RETRY_COUNT, now: NOW })).toEqual([
      'update',
    ])
  })

  it('info 解析器类 → 去更新；其余 → 去配置', () => {
    expect(rowActions({ tone: 'info', labelKey: TONE_LABEL_KEYS.parserUpdate, now: NOW })).toEqual(['update'])
    expect(rowActions({ tone: 'info', labelKey: TONE_LABEL_KEYS.missingApiKey, now: NOW })).toEqual(['configure'])
    expect(rowActions({ tone: 'info', labelKey: TONE_LABEL_KEYS.loginExpired, now: NOW })).toEqual(['configure'])
    expect(rowActions({ tone: 'info', now: NOW })).toEqual(['configure'])
  })

  it('error → 去配置 + 去更新', () => {
    expect(rowActions({ tone: 'error', now: NOW })).toEqual(['configure', 'update'])
  })

  it('动作列表不超过 2 个', () => {
    for (const tone of ['warning', 'info', 'error', 'unknown'] as const) {
      for (const canContinue of [true, false]) {
        for (const retryCount of [0, 1, 3]) {
          const actions = rowActions({ tone, canContinue, retryCount, now: NOW })
          expect(actions.length).toBeLessThanOrEqual(2)
        }
      }
    }
  })
})

describe('冷却工具', () => {
  it('isCoolingDown / cooldownSecondsLeft 向上取整', () => {
    expect(isCoolingDown(null, NOW)).toBe(false)
    expect(isCoolingDown(NOW, NOW)).toBe(false)
    expect(isCoolingDown(NOW + 1, NOW)).toBe(true)
    expect(cooldownSecondsLeft(NOW + 41_200, NOW)).toBe(42)
    expect(cooldownSecondsLeft(NOW - 1, NOW)).toBe(0)
  })
})

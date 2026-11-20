import { shallowMount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import SiteErrorAlert from '@/components/search/SiteErrorAlert.vue'
import type { SearchFailureRow } from '@/composables/useSearchPagination'
import { TONE_LABEL_KEYS } from '@/utils/searchErrorClassify'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

/** 失败行基线：默认一条「可重试的瞬时故障」。 */
function makeRow(overrides: Partial<SearchFailureRow> = {}): SearchFailureRow {
  return {
    source: 'pt.example.com',
    siteName: '示例站点',
    error: '站点请求或页面解析失败：连接超时',
    tone: 'warning',
    labelKey: TONE_LABEL_KEYS.timeout,
    detail: '连接超时',
    canContinue: true,
    retryCount: 0,
    cooldownUntil: null,
    ...overrides,
  }
}

/** 只隔离图标与菜单容器：动作列按钮是断言目标，必须走真实模板。 */
function mountAlert(rows: SearchFailureRow[], canManageSites: boolean) {
  return shallowMount(SiteErrorAlert, {
    global: {
      stubs: { VIcon: true, VMenu: true, VList: true, VListItem: true, VListItemTitle: true },
    },
    props: { rows, retrying: false, canManageSites },
  })
}

type AlertWrapper = ReturnType<typeof mountAlert>

/**
 * 展开列表。
 * 折叠记忆存在模块作用域（`sessionExpanded`），用例之间会串状态，
 * 所以这里按当前渲染结果决定是否点击，而不是假设初始折叠。
 */
async function ensureList(wrapper: AlertWrapper) {
  if (!wrapper.find('.mpa__list').exists()) await wrapper.find('.mpa__btn-text').trigger('click')
  await nextTick()
  return wrapper.find('.mpa__list')
}

/** 行内动作按钮文案（i18n 被 mock 成 key，断言即 key）。 */
function actionLabels(wrapper: AlertWrapper) {
  return wrapper.findAll('.mpa__mini').map(item => item.text())
}

describe('SiteErrorAlert without site management permission', () => {
  it('still renders the alert and only offers retry for a retryable row', async () => {
    const wrapper = mountAlert([makeRow()], false)
    await nextTick()

    // 修复前会落到「仅提示」分支：这里同时否掉那条死分支的类名。
    expect(wrapper.classes()).toContain('mpa')
    expect(wrapper.classes()).not.toContain('mpa--restricted')

    await ensureList(wrapper)
    expect(actionLabels(wrapper)).toEqual(['search.errors.retry'])
    expect(actionLabels(wrapper)).not.toContain('search.errors.configure')
    expect(actionLabels(wrapper)).not.toContain('search.errors.update')

    wrapper.unmount()
  })

  it('drops the configure action for an info row but keeps the alert visible', async () => {
    const wrapper = mountAlert([makeRow({ tone: 'info', labelKey: TONE_LABEL_KEYS.loginExpired })], false)
    await nextTick()

    expect(wrapper.classes()).toContain('mpa')
    await ensureList(wrapper)
    // 有管理权限时 info 档会渲染「去配置」，无权限必须过滤干净。
    expect(actionLabels(wrapper)).toEqual([])

    wrapper.unmount()
  })
})

describe('SiteErrorAlert with site management permission', () => {
  it('keeps the configure action for an info row', async () => {
    const wrapper = mountAlert([makeRow({ tone: 'info', labelKey: TONE_LABEL_KEYS.loginExpired })], true)
    await nextTick()

    await ensureList(wrapper)
    expect(actionLabels(wrapper)).toContain('search.errors.configure')

    wrapper.unmount()
  })
})

describe('SiteErrorAlert summary sub hint', () => {
  it('tells a non-admin to ask an admin instead of asking them to configure sites', async () => {
    // info 档既不可重试也不冷却 → noneRetryable 为真，摘要行出副文案。
    const wrapper = mountAlert([makeRow({ tone: 'info', labelKey: TONE_LABEL_KEYS.loginExpired })], false)
    await nextTick()

    const sub = wrapper.find('.mpa__title-sub')
    expect(sub.exists()).toBe(true)
    expect(sub.text()).toContain('search.errors.needsSiteAdmin')
    expect(sub.text()).not.toContain('search.errors.noneRetryable')

    wrapper.unmount()
  })
})

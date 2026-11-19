import type { SearchSourcePage } from '@/api/types'
import { classifySearchError, type SearchErrorTone } from '@/utils/searchErrorClassify'
import { computed, ref } from 'vue'

/** nextPage 仅由前端维护；失败时保留原页号供用户重试。 */
export interface SearchSourceProgress extends SearchSourcePage {
  nextPage: number
}

/** 警告条一行的结构化数据（分类结果 + 重试状态），由 composable 派生，组件只渲染。 */
export interface SearchFailureRow {
  /** 域名，列表 key。 */
  source: string
  /** 站点展示名，缺省回退域名。 */
  siteName: string
  /** 原始错误文本（纯文本渲染，禁止 v-html）。 */
  error: string
  /** 分类档位。 */
  tone: SearchErrorTone
  /** 主因短标签 i18n key。 */
  labelKey: string
  /** strip 掉固定前缀后的详情文本。 */
  detail: string
  /** 后端是否允许继续请求该源；显式 false 时不给重试。 */
  canContinue: boolean
  /** 本次会话该源被重试的次数。 */
  retryCount: number
  /** 冷却结束时间戳（毫秒），null 表示不冷却。 */
  cooldownUntil: number | null
}

/** 单站点重试失败后的冷却时长：避免用户对着同一个坏站点连点。 */
export const RETRY_COOLDOWN_MS = 60_000

/** 后端缓存页摘要并判断是否允许继续请求，前端按来源推进页号。 */
export function useSearchPagination() {
  const sources = ref<SearchSourceProgress[]>([])
  /** 每个源本次会话被重试的次数（按 source 累积，新搜索清零）。 */
  const retryCounts = ref<Record<string, number>>({})
  /** 每个源的冷却结束时间戳。 */
  const cooldowns = ref<Record<string, number>>({})
  /**
   * 失败快照（规格第 1 节最高风险项）：`loadNextPage` 会清空 diagnostics 并覆盖 sources，
   * 若警告条直接读实时数据，每次重试都会「闪一下消失再出现」。重试期间用快照渲染。
   */
  const failureSnapshot = ref<SearchFailureRow[]>([])

  /** 整页结果提交时应用来源状态，分块未收齐和单独的 done 事件不推进页号。 */
  function applyPages(pages: SearchSourcePage[]) {
    const progress = new Map(sources.value.map(source => [source.source, source]))
    for (const page of pages) {
      progress.set(page.source, {
        ...page,
        nextPage: page.error ? page.page : page.page + 1,
      })
    }
    sources.value = [...progress.values()]
  }

  /** 续页请求本身失败（连接中断等）时保留原页号，下次继续加载重试。 */
  function failSource(source: SearchSourceProgress, error: string) {
    sources.value = sources.value.map(current =>
      current.source === source.source && current.nextPage === source.nextPage
        ? { ...current, error, can_continue: true }
        : current,
    )
  }

  /**
   * 新搜索清空来源状态、重试计数与冷却。
   * keepFailureSnapshot：新搜索期间保留上一轮失败快照，警告条不闪一下消失（规格第 5 节），
   * 搜索结束时由 `endFailureRetry` 释放。
   */
  function reset(options: { keepFailureSnapshot?: boolean } = {}) {
    sources.value = []
    retryCounts.value = {}
    cooldowns.value = {}
    if (!options.keepFailureSnapshot) failureSnapshot.value = []
  }

  /** 重试开始：累计次数（「已重试 N 次」），并解除上一次冷却。 */
  function beginSourceRetry(source: string) {
    retryCounts.value = { ...retryCounts.value, [source]: (retryCounts.value[source] ?? 0) + 1 }
    if (cooldowns.value[source] !== undefined) {
      const next = { ...cooldowns.value }
      delete next[source]
      cooldowns.value = next
    }
  }

  /** 重试失败：进入冷却，倒计时归零后才允许再次点击。 */
  function coolDownSource(source: string, durationMs: number = RETRY_COOLDOWN_MS) {
    cooldowns.value = { ...cooldowns.value, [source]: Date.now() + durationMs }
  }

  /** 重试开始前抓快照，重试期间警告条渲染这份数据。 */
  function beginFailureRetry() {
    failureSnapshot.value = failureRows.value
  }

  /** 重试结束（成功或失败）后释放快照，回到实时派生。 */
  function endFailureRetry() {
    failureSnapshot.value = []
  }

  const state = computed(() => ({
    sources: sources.value,
    can_continue: sources.value.some(source => source.can_continue),
  }))
  const requests = computed(() => sources.value.filter(source => source.can_continue))
  // 同站点不同名称查询可能返回同一失败；只去重提示，保留每个来源的独立重试状态。
  const errorMessages = computed(() => [
    ...new Set(
      sources.value.flatMap(source =>
        source.error ? [source.site_name ? `${source.site_name}: ${source.error}` : source.error] : [],
      ),
    ),
  ])

  /** 结构化失败行：分类 + 重试状态，供警告条渲染。 */
  const failureRows = computed<SearchFailureRow[]>(() =>
    sources.value
      .filter(source => Boolean(source.error))
      .map(source => {
        const error = String(source.error ?? '')
        const classified = classifySearchError(error)
        return {
          source: source.source,
          siteName: source.site_name || source.source,
          error,
          tone: classified.tone,
          labelKey: classified.labelKey,
          detail: classified.detail,
          // 只有显式 false 才禁止重试：后端 can_continue 表示「还有下一页」，
          // 失败来源由 failSource 显式置 true，不能把 undefined 当作不可重试。
          canContinue: source.can_continue !== false,
          retryCount: retryCounts.value[source.source] ?? 0,
          cooldownUntil: cooldowns.value[source.source] ?? null,
        }
      }),
  )

  /**
   * 警告条实际渲染的行：重试期间优先用快照（避免闪烁），
   * 但重试计数/冷却始终叠加实时值，保证行内「已重试 N 次」「42s 后可重试」实时更新。
   */
  const displayFailureRows = computed<SearchFailureRow[]>(() => {
    const base = failureSnapshot.value.length ? failureSnapshot.value : failureRows.value
    if (!failureSnapshot.value.length) return base
    return base.map(row => ({
      ...row,
      retryCount: retryCounts.value[row.source] ?? row.retryCount,
      cooldownUntil: cooldowns.value[row.source] ?? row.cooldownUntil,
    }))
  })

  return {
    state,
    requests,
    errorMessages,
    failureRows,
    displayFailureRows,
    failureSnapshot,
    applyPages,
    failSource,
    reset,
    beginSourceRetry,
    coolDownSource,
    beginFailureRetry,
    endFailureRetry,
  }
}

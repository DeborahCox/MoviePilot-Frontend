<script setup lang="ts">
/**
 * 资源搜索页「站点错误警告条」。
 *
 * 规格：`_spec/site-error-alert-spec.md`；视觉：`site-error-alert-mockup.html`。
 * 职责边界：只负责渲染与交互，错误分类在 `@/utils/searchErrorClassify`，
 * 数据派生（失败行、重试次数、冷却、快照）在 `useSearchPagination`。
 *
 * 安全：错误文本全链路纯文本插值，禁止 v-html / innerHTML；复制取纯文本；
 * 新窗口用 Blob + noopener,noreferrer（原始响应可能含 HTML/JS 垃圾）。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SearchFailureRow } from '@/composables/useSearchPagination'
import {
  TONE_LABEL_KEYS,
  cooldownSecondsLeft,
  isCoolingDown,
  isRetryableTone,
  rowActions,
  type SearchErrorTone,
  type SearchRowAction,
} from '@/utils/searchErrorClassify'

const props = withDefaults(
  defineProps<{
    /** 失败行（已分类），由 useSearchPagination 派生。 */
    rows: SearchFailureRow[]
    /** 是否正在重试（批量或单站点）。 */
    retrying: boolean
    /** 搜索进行中（新搜索 / 刷新）：保留旧快照但禁用动作，头部文案不切换成「正在重试」。 */
    busy?: boolean
    /** 正在重试的来源，用于行内 spinner；缺省时按「全部可重试行」处理。 */
    retryingSources?: string[]
    /** 本次搜索正常返回的站点数（摘要行右侧）。 */
    normalCount?: number
    /** 本次搜索已获取的结果条数。 */
    totalCount?: number
    /** 是否有站点管理权限：无权限时不渲染「去配置 / 去更新」，避免点出权限弹窗。 */
    canManageSites?: boolean
  }>(),
  {
    retryingSources: () => [],
    normalCount: 0,
    totalCount: 0,
    canManageSites: true,
    busy: false,
  },
)

const emit = defineEmits<{
  (e: 'retry-all'): void
  (e: 'retry-one', source: string): void
  (e: 'configure', source: string): void
  (e: 'update', source: string): void
}>()

const { t } = useI18n()

/** N ≤ 2 用单行紧凑形态，不打断结果流。 */
const COMPACT_THRESHOLD = 2

let uid = 0
const listId = `site-error-alert-list-${++uid}`

/**
 * 会话级记忆：手动展开后绝不自动收起。
 * 放模块作用域而非组件 state —— 警告条会因「全部成功」被 v-if 卸载，
 * 组件内 state 会被重置成默认折叠。
 */
let sessionExpanded = false

const expanded = ref(sessionExpanded)
const expandedRows = ref<string[]>([])
const copiedSource = ref<string | null>(null)
const toggleButton = ref<HTMLButtonElement | null>(null)
const readyAnnouncement = ref('')

/** 单一 ticker 驱动所有倒计时（每行一个 timer 会成倍占用主线程）。 */
const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | null = null
const announcedCooldowns = new Set<string>()

const rows = computed(() => props.rows)
const failedCount = computed(() => rows.value.length)
const isCompact = computed(() => failedCount.value > 0 && failedCount.value <= COMPACT_THRESHOLD)
const retryingSourceSet = computed(() => new Set(props.retryingSources))

const TONE_ORDER: Record<SearchErrorTone, number> = { warning: 0, info: 1, error: 2, unknown: 3 }

const LABEL_ICONS: Record<string, string> = {
  [TONE_LABEL_KEYS.noResponse]: 'mdi-lan-disconnect',
  [TONE_LABEL_KEYS.timeout]: 'mdi-timer-sand',
  [TONE_LABEL_KEYS.serverError]: 'mdi-server-network-off',
  [TONE_LABEL_KEYS.missingApiKey]: 'mdi-key-variant',
  [TONE_LABEL_KEYS.loginExpired]: 'mdi-lock-outline',
  [TONE_LABEL_KEYS.loginRejected]: 'mdi-lock-alert-outline',
  [TONE_LABEL_KEYS.parserUpdate]: 'mdi-help-circle-outline',
  [TONE_LABEL_KEYS.forbidden]: 'mdi-shield-alert-outline',
  [TONE_LABEL_KEYS.unknown]: 'mdi-help-circle-outline',
}

const TONE_CLASS: Record<SearchErrorTone, string> = {
  warning: 'warn',
  error: 'err',
  info: 'info',
  unknown: 'unknown',
}

function labelOf(row: SearchFailureRow): string {
  return t(row.labelKey)
}

function iconOf(row: SearchFailureRow): string {
  return LABEL_ICONS[row.labelKey] ?? 'mdi-alert-circle-outline'
}

function isRowCooling(row: SearchFailureRow): boolean {
  return isRetryableTone(row.tone) && row.canContinue && isCoolingDown(row.cooldownUntil, now.value)
}

function isRowRetrying(row: SearchFailureRow): boolean {
  if (!props.retrying) return false
  if (retryingSourceSet.value.size > 0) return retryingSourceSet.value.has(row.source)
  // 批量重试未指定来源时，把「可立即重试」的行都视为在途。
  return isRetryableTone(row.tone) && row.canContinue && !isCoolingDown(row.cooldownUntil, now.value)
}

/** 可立即重试（头部计数与按钮文案同源派生，不含在途与不可续页的行）。 */
const retryableCount = computed(
  () =>
    rows.value.filter(
      row =>
        isRetryableTone(row.tone) &&
        row.canContinue &&
        !isCoolingDown(row.cooldownUntil, now.value) &&
        !isRowRetrying(row),
    ).length,
)

const coolingCount = computed(
  () =>
    rows.value.filter(
      row => isRetryableTone(row.tone) && row.canContinue && isCoolingDown(row.cooldownUntil, now.value),
    ).length,
)

const retryingCount = computed(() => {
  if (!props.retrying) return 0
  if (retryingSourceSet.value.size > 0) return retryingSourceSet.value.size
  return Math.max(rows.value.filter(row => isRetryableTone(row.tone) && row.canContinue).length, 1)
})

/** 可重试 = 0：重试按钮整颗不渲染，摘要行同位置给解释。 */
const noneRetryable = computed(() => !props.retrying && retryableCount.value === 0 && coolingCount.value === 0)

const hasRetried = computed(() => rows.value.some(row => row.retryCount > 0))

/** 第 2 次重试之后主按钮转次级样式，不再抢注意力。 */
const retryButtonSecondary = computed(() => rows.value.some(row => row.retryCount >= 2))

const titleText = computed(() => {
  if (props.retrying) return t('search.errors.retryInProgress', { n: retryingCount.value })
  if (hasRetried.value) return t('search.errors.stillFailing', { n: failedCount.value })
  return t('search.errors.title', { n: failedCount.value })
})

const subText = computed(() => {
  const parts: string[] = []
  if (retryableCount.value > 0) parts.push(t('search.errors.availableRetry', { n: retryableCount.value }))
  if (coolingCount.value > 0) parts.push(t('search.errors.cooling', { n: coolingCount.value }))
  return parts.join(' · ')
})

const metaText = computed(() => {
  if (props.normalCount <= 0) return ''
  if (props.totalCount > 0) return t('search.errors.normalCount', { n: props.normalCount, m: props.totalCount })
  return t('search.errors.normalCountOnly', { n: props.normalCount })
})

/** 聚合 chips：按 tone 排序（unknown 永远最后，避免抢主因注意力）。 */
const toneChips = computed(() => {
  const map = new Map<string, { labelKey: string; tone: SearchErrorTone; count: number }>()
  for (const row of rows.value) {
    const entry = map.get(row.labelKey)
    if (entry) entry.count += 1
    else map.set(row.labelKey, { labelKey: row.labelKey, tone: row.tone, count: 1 })
  }
  return [...map.values()].sort(
    (a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone] || a.labelKey.localeCompare(b.labelKey),
  )
})

/** 单行紧凑形态：每个站点一个 chip，信息自足（站点 · 主因）。 */
const rowChips = computed(() =>
  rows.value.map(row => ({
    key: row.source,
    tone: row.tone,
    text: `${row.siteName} · ${labelOf(row)}`,
  })),
)

const showList = computed(() => props.retrying || expanded.value)

/** 动作禁用：重试中或新搜索进行中（此时数据是旧快照，点了也没有可重试的来源）。 */
const actionsDisabled = computed(() => props.retrying || props.busy)

function toggleExpanded() {
  expanded.value = !expanded.value
  sessionExpanded = expanded.value
}

/** Esc 收起后焦点还给展开按钮（原生 button + aria-expanded）。 */
function collapseAndFocus() {
  if (!expanded.value) return
  expanded.value = false
  sessionExpanded = false
  void nextTick(() => toggleButton.value?.focus())
}

function actionsOf(row: SearchFailureRow): SearchRowAction[] {
  const actions = rowActions({
    tone: row.tone,
    labelKey: row.labelKey,
    cooldownUntil: row.cooldownUntil,
    retryCount: row.retryCount,
    canContinue: row.canContinue,
    now: now.value,
  })
  // 无站点管理权限：只留「重试」，配置/更新入口会把用户带到需要 manage 权限的页面。
  return props.canManageSites ? actions : actions.filter(action => action === 'retry')
}

function actionLabel(action: SearchRowAction): string {
  if (action === 'retry') return t('search.errors.retry')
  if (action === 'configure') return t('search.errors.configure')
  return t('search.errors.update')
}

function actionIcon(action: SearchRowAction): string {
  if (action === 'retry') return 'mdi-refresh'
  if (action === 'configure') return 'mdi-cog-outline'
  return 'mdi-package-up'
}

/** unknown 主位用中性白 + 中性描边（色相是分类信号，不能给 unknown 上暖黄）。 */
function actionClass(row: SearchFailureRow, action: SearchRowAction): string[] {
  if (action === 'retry') return row.tone === 'unknown' ? ['mpa__mini--primary'] : ['mpa__mini--retry']
  if (row.tone === 'info') return ['mpa__mini--info']
  return []
}

function onRowAction(row: SearchFailureRow, action: SearchRowAction) {
  if (actionsDisabled.value) return
  if (action === 'retry') emit('retry-one', row.source)
  else if (action === 'configure') emit('configure', row.source)
  else emit('update', row.source)
}

function isRowExpanded(row: SearchFailureRow): boolean {
  return expandedRows.value.includes(row.source)
}

function toggleRowDetails(row: SearchFailureRow) {
  expandedRows.value = isRowExpanded(row)
    ? expandedRows.value.filter(source => source !== row.source)
    : [...expandedRows.value, row.source]
}

function formatSize(text: string): string {
  const bytes = new TextEncoder().encode(text).length
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

let copiedTimer: ReturnType<typeof setTimeout> | null = null

function markCopied(source: string) {
  copiedSource.value = source
  if (copiedTimer) clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => {
    copiedSource.value = null
    copiedTimer = null
  }, 1600)
}

/** 复制纯文本（原始响应可能含 HTML，绝不能用 innerHTML 取内容）。 */
async function copyRaw(row: SearchFailureRow) {
  if (!row.error) return
  try {
    await navigator.clipboard.writeText(row.error)
    markCopied(row.source)
  } catch {
    // 无 clipboard 权限时静默失败：展开的原始响应本身可手动选中复制。
  }
}

/** 新窗口用 Blob + noopener,noreferrer，避免把不可信 HTML 渲染进本站上下文。 */
function openRaw(row: SearchFailureRow) {
  if (!row.error) return
  const url = URL.createObjectURL(new Blob([row.error], { type: 'text/plain;charset=utf-8' }))
  window.open(url, '_blank', 'noopener,noreferrer')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

function startTicker() {
  if (ticker) return
  ticker = setInterval(() => {
    now.value = Date.now()
    announceReadyCooldowns()
  }, 1000)
}

function stopTicker() {
  if (!ticker) return
  clearInterval(ticker)
  ticker = null
}

/**
 * 冷却归零由容器外的独立 role="status" 播报一次；
 * 倒计时本身 aria-live="off"，否则读屏每秒念一次数字。
 */
function announceReadyCooldowns() {
  for (const row of rows.value) {
    if (!row.cooldownUntil || isCoolingDown(row.cooldownUntil, now.value)) continue
    const key = `${row.source}:${row.cooldownUntil}`
    if (announcedCooldowns.has(key)) continue
    announcedCooldowns.add(key)
    readyAnnouncement.value = t('search.errors.cooldownReady', { name: row.siteName })
  }
}

const hasCooldown = computed(() => rows.value.some(row => isCoolingDown(row.cooldownUntil, now.value)))

watch(hasCooldown, cooling => (cooling ? startTicker() : stopTicker()), { immediate: true })

// 重试进行中强制展开，结束后保持展开（规格第 5 节）。
watch(
  () => props.retrying,
  retrying => {
    if (!retrying) return
    expanded.value = true
    sessionExpanded = true
  },
  { immediate: true },
)

// 全部成功 / 新搜索：重置折叠记忆。
watch(failedCount, count => {
  if (count > 0) return
  expanded.value = false
  sessionExpanded = false
  expandedRows.value = []
  readyAnnouncement.value = ''
})

onBeforeUnmount(() => {
  stopTicker()
  if (copiedTimer) clearTimeout(copiedTimer)
})
</script>

<template>
  <section
    v-if="rows.length"
    class="mpa"
    :class="{ 'mpa--compact': isCompact, 'mpa--expanded': showList }"
    :aria-label="t('search.errors.title', { n: failedCount })"
    :aria-busy="actionsDisabled ? 'true' : undefined"
  >
    <div class="mpa__head">
      <VIcon class="mpa__head-icon" icon="mdi-alert" size="16" aria-hidden="true" />

      <!-- live region 只包摘要行：失败数变化 / 重试完成时播报一次，列表不参与。 -->
      <span class="mpa__live" role="status" aria-live="polite" aria-atomic="true">
        <span class="mpa__title">{{ titleText }}</span>
        <span v-if="subText" class="mpa__title-sub"> · {{ subText }}</span>
        <span v-else-if="noneRetryable" class="mpa__title-sub"> · {{ t('search.errors.noneRetryable') }}</span>
      </span>

      <!-- 收起态：聚合 chips 留在摘要行，保证收起后信息自足（N≥3 按 tone 聚合，N≤2 逐站点）。 -->
      <span v-if="!showList" class="mpa__chips mpa__chips--head">
        <template v-if="isCompact">
          <span
            v-for="chip in rowChips"
            :key="chip.key"
            class="mpa__chip"
            :class="`mpa__chip--${TONE_CLASS[chip.tone]}`"
          >
            {{ chip.text }}
          </span>
        </template>
        <template v-else>
          <span
            v-for="chip in toneChips"
            :key="chip.labelKey"
            class="mpa__chip"
            :class="`mpa__chip--${TONE_CLASS[chip.tone]}`"
          >
            {{ t(chip.labelKey) }} <span class="n">{{ chip.count }}</span>
          </span>
        </template>
      </span>

      <span v-if="metaText && showList" class="mpa__meta">{{ metaText }}</span>

      <div class="mpa__actions">
        <!-- N === 0 时整颗不渲染（不是 disabled），避免用户对着灰按钮反复试。 -->
        <button
          v-if="retryableCount > 0"
          type="button"
          class="mpa__btn-primary"
          :class="{ 'mpa__btn-primary--secondary': retryButtonSecondary, 'mpa__btn-primary--busy': retrying }"
          :disabled="actionsDisabled"
          :aria-busy="retrying"
          @click="emit('retry-all')"
        >
          <span v-if="retrying" class="mpa__spin mpa__spin--sm" aria-hidden="true" />
          <VIcon v-else icon="mdi-refresh" size="13" aria-hidden="true" />
          {{ t('search.errors.retryCount', { n: retryableCount }) }}
        </button>

        <button
          ref="toggleButton"
          type="button"
          class="mpa__btn-text"
          :aria-expanded="showList ? 'true' : 'false'"
          :aria-controls="listId"
          :aria-label="showList ? t('search.errors.collapse') : t('search.errors.expand')"
          :disabled="actionsDisabled"
          @click="toggleExpanded"
        >
          <VIcon :icon="showList ? 'mdi-chevron-up' : 'mdi-chevron-down'" size="16" aria-hidden="true" />
          <span class="mpa__btn-text-label">{{
            showList ? t('search.errors.collapse') : t('search.errors.expand')
          }}</span>
        </button>
      </div>
    </div>

    <Transition name="mpa-collapse">
      <div
        v-if="showList"
        :id="listId"
        class="mpa__list"
        tabindex="0"
        role="group"
        :aria-label="t('search.errors.listLabel')"
        @keydown.esc="collapseAndFocus"
      >
        <div
          v-for="row in rows"
          :key="row.source"
          class="mpa__row"
          :aria-busy="isRowRetrying(row) ? 'true' : undefined"
        >
          <span v-if="isRowRetrying(row)" class="mpa__spin-wrap" aria-hidden="true">
            <span class="mpa__spin" />
            <VIcon class="mpa__spin-alt" icon="mdi-timer-sand" size="14" />
          </span>
          <VIcon
            v-else
            class="mpa__row-icon"
            :class="`mpa__row-icon--${TONE_CLASS[row.tone]}`"
            :icon="iconOf(row)"
            size="15"
            aria-hidden="true"
          />

          <div class="mpa__body">
            <div class="mpa__line1">
              <span class="mpa__site">{{ row.siteName }}</span>
              <span class="mpa__domain">{{ row.source }}</span>
              <span class="mpa__tag" :class="`mpa__tag--${TONE_CLASS[row.tone]}`">
                <VIcon :icon="iconOf(row)" size="11" aria-hidden="true" />
                {{ labelOf(row) }}
              </span>
            </div>

            <div class="mpa__detail-line">
              <div class="mpa__detail" :class="{ 'mpa__detail--empty': !row.detail }">
                {{ row.detail || t('search.errors.noDetail') }}
              </div>
              <span v-if="row.retryCount > 0" class="mpa__meta-end">
                <VIcon icon="mdi-refresh" size="11" aria-hidden="true" />
                {{ t('search.errors.retried', { n: row.retryCount }) }}
              </span>
              <!-- 详情展开放在详情行行尾：动作列永远只留 ≤2 个动作 + ⋯ 位。 -->
              <button
                v-if="row.error"
                type="button"
                class="mpa__detail-toggle"
                :aria-expanded="isRowExpanded(row) ? 'true' : 'false'"
                :aria-label="isRowExpanded(row) ? t('search.errors.collapseRow') : t('search.errors.expandRow')"
                @click="toggleRowDetails(row)"
              >
                <VIcon
                  :icon="isRowExpanded(row) ? 'mdi-chevron-up' : 'mdi-chevron-down'"
                  size="13"
                  aria-hidden="true"
                />
              </button>
            </div>

            <!-- 原始响应：等宽 3 行截断，纯文本插值。 -->
            <div v-if="isRowExpanded(row) && row.error" class="mpa__raw-wrap">
              <div class="mpa__raw">{{ row.error }}</div>
              <div class="mpa__raw-meta">
                <span>{{ t('search.errors.rawMeta', { size: formatSize(row.error) }) }}</span>
                <span class="spacer" />
                <button type="button" class="mpa__link" @click="copyRaw(row)">
                  {{ copiedSource === row.source ? t('search.errors.copied') : t('search.errors.copy') }}
                </button>
                <button type="button" class="mpa__link" @click="openRaw(row)">
                  {{ t('search.errors.openRaw') }}
                </button>
              </div>
            </div>
          </div>

          <div class="mpa__row-actions">
            <!-- 冷却中：不是灰按钮，而是 warning 描边 + 等宽倒计时，占住 retry 位。 -->
            <span
              v-if="isRowCooling(row)"
              class="mpa__cooldown"
              aria-live="off"
              :aria-label="t('search.errors.cooldownLabel')"
            >
              <VIcon icon="mdi-timer-sand" size="11" aria-hidden="true" />
              <span aria-hidden="true">{{
                t('search.errors.cooldown', { s: cooldownSecondsLeft(row.cooldownUntil, now) })
              }}</span>
            </span>
            <span v-else-if="isRowRetrying(row)" class="mpa__busy">{{ t('search.errors.retrying') }}</span>

            <template v-else>
              <button
                v-for="action in actionsOf(row)"
                :key="action"
                type="button"
                class="mpa__mini"
                :class="actionClass(row, action)"
                :disabled="actionsDisabled"
                @click="onRowAction(row, action)"
              >
                {{ actionLabel(action) }}
              </button>
            </template>

            <!-- 窄屏 <560px 时上面的动作全部收进 ⋯；桌面端 display:none（不可聚焦）。 -->
            <VMenu location="bottom end">
              <template #activator="{ props: activatorProps }">
                <button
                  v-bind="activatorProps"
                  type="button"
                  class="mpa__more-btn"
                  :aria-label="t('search.errors.moreActions')"
                >
                  ⋯
                </button>
              </template>
              <VList class="mpa__menu" density="compact">
                <VListItem
                  v-for="action in actionsOf(row)"
                  :key="`menu-${action}`"
                  :disabled="actionsDisabled"
                  @click="onRowAction(row, action)"
                >
                  <template #prepend>
                    <VIcon :icon="actionIcon(action)" size="16" aria-hidden="true" />
                  </template>
                  <VListItemTitle>{{ actionLabel(action) }}</VListItemTitle>
                </VListItem>
                <VListItem v-if="row.error" @click="copyRaw(row)">
                  <template #prepend>
                    <VIcon icon="mdi-content-copy" size="16" aria-hidden="true" />
                  </template>
                  <VListItemTitle>
                    {{ copiedSource === row.source ? t('search.errors.copied') : t('search.errors.copy') }}
                  </VListItemTitle>
                </VListItem>
                <VListItem v-if="row.error" @click="openRaw(row)">
                  <template #prepend>
                    <VIcon icon="mdi-open-in-new" size="16" aria-hidden="true" />
                  </template>
                  <VListItemTitle>{{ t('search.errors.openRaw') }}</VListItemTitle>
                </VListItem>
                <VListItem v-if="row.error" @click="toggleRowDetails(row)">
                  <template #prepend>
                    <VIcon
                      :icon="isRowExpanded(row) ? 'mdi-chevron-up' : 'mdi-chevron-down'"
                      size="16"
                      aria-hidden="true"
                    />
                  </template>
                  <VListItemTitle>
                    {{ isRowExpanded(row) ? t('search.errors.collapseRow') : t('search.errors.expandRow') }}
                  </VListItemTitle>
                </VListItem>
              </VList>
            </VMenu>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 冷却归零的一次性播报（独立 role="status"，不在倒计时容器内）。 -->
    <span class="mpa__sr-only" role="status" aria-live="polite" aria-atomic="true">{{ readyAnnouncement }}</span>
  </section>
</template>

<style scoped>
/* ===== 容器：12px 圆角 + warning tonal 渐变 ===== */
.mpa {
  margin-block: 12px;
  border: 1px solid rgba(var(--v-theme-warning), 0.26);
  border-radius: 12px;
  background: linear-gradient(180deg, rgba(var(--v-theme-warning), 0.105) 0%, rgba(var(--v-theme-warning), 0.055) 100%);
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), 0.94);
}

/* ===== 头部 ===== */
.mpa__head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 7px 8px 7px 12px;
  border-bottom: 1px solid rgba(var(--v-theme-warning), 0.16);
}

.mpa--compact .mpa__head {
  min-height: 36px;
  padding: 5px 6px 5px 12px;
  border-bottom: 0;
}

.mpa--compact.mpa--expanded .mpa__head {
  border-bottom: 1px solid rgba(var(--v-theme-warning), 0.16);
}

.mpa__head-icon {
  flex: 0 0 auto;
  color: rgb(var(--v-theme-warning));
}

.mpa__live {
  display: inline-flex;
  align-items: baseline;
  gap: 0;
  min-width: 0;
  white-space: nowrap;
}

.mpa__title {
  font-size: 13px;
  font-weight: 500;
  line-height: 1.3;
  color: rgba(var(--v-theme-on-surface), 0.95);
  font-variant-numeric: tabular-nums;
}

.mpa--compact .mpa__title {
  font-size: 12.5px;
}

.mpa__title-sub {
  font-size: 12px;
  line-height: 1.3;
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.mpa__meta {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.52);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.mpa__actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
}

/* 主按钮：warning tonal；第 2 次重试后转次级样式（保留位置与宽度感）。 */
.mpa__btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 9px;
  border: 1px solid rgba(var(--v-theme-warning), 0.34);
  border-radius: 6px;
  background: rgba(var(--v-theme-warning), 0.16);
  color: rgb(var(--v-theme-warning));
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
}

.mpa__btn-primary:hover:not(:disabled) {
  background: rgba(var(--v-theme-warning), 0.24);
}

.mpa__btn-primary--secondary {
  border-color: rgba(var(--v-theme-on-surface), 0.16);
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.72);
}

.mpa__btn-primary--secondary:hover:not(:disabled) {
  background: rgba(var(--v-theme-on-surface), 0.06);
}

/* 重试中：不降透明度（降透明度 = disabled 语义），靠 spinner + 文案表达进行中。 */
.mpa__btn-primary--busy {
  cursor: progress;
}

.mpa--compact .mpa__btn-primary {
  height: 24px;
  font-size: 11.5px;
}

.mpa__btn-text {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 12px;
  cursor: pointer;
}

.mpa__btn-text:hover:not(:disabled) {
  background: rgba(var(--v-theme-on-surface), 0.06);
  color: rgba(var(--v-theme-on-surface), 0.94);
}

/* 重试进行中强制展开：折叠按钮置灰但保持可见（避免布局跳动）。 */
.mpa__btn-text:disabled {
  color: rgba(var(--v-theme-on-surface), 0.32);
  cursor: default;
}

.mpa__btn-text-label {
  display: none;
}

/* ===== 折叠摘要 chips（在摘要行内，flex 占满剩余宽度） ===== */
.mpa__chips {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
}

.mpa__chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 20px;
  padding: 0 7px;
  border: 1px solid rgba(var(--v-theme-warning), 0.26);
  border-radius: 5px;
  background: rgba(var(--v-theme-warning), 0.1);
  color: rgb(var(--v-theme-warning));
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
}

.mpa__chip .n {
  font-variant-numeric: tabular-nums;
  opacity: 0.85;
}

.mpa__chip--err {
  border-color: rgba(var(--v-theme-error), 0.3);
  background: rgba(var(--v-theme-error), 0.11);
  color: rgb(var(--v-theme-error));
}

.mpa__chip--info {
  border-color: rgba(var(--v-theme-info), 0.3);
  background: rgba(var(--v-theme-info), 0.13);
  color: rgb(var(--v-theme-info));
}

.mpa__chip--unknown {
  border-color: rgba(var(--v-theme-on-surface), 0.3);
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.55);
}

/* ===== 列表：max-height = 5 行 × 55px，整行可见不留半行截断 ===== */
.mpa__list {
  max-height: 275px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.mpa__list::-webkit-scrollbar {
  width: 8px;
}

.mpa__list::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: 8px;
  background: rgba(var(--v-theme-on-surface), 0.24);
  background-clip: padding-box;
}

.mpa__list:focus-visible {
  outline: 2px solid rgba(var(--v-theme-warning), 0.6);
  outline-offset: -2px;
}

/* ===== 行：min-height 55px，动作列不得把行撑高 ===== */
.mpa__row {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr) max-content;
  align-items: start;
  gap: 8px;
  min-height: 55px;
  padding: 8px 10px 8px 12px;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.055);
}

.mpa__row:first-child {
  border-top: 0;
}

.mpa__row:hover {
  background: rgba(var(--v-theme-on-surface), 0.028);
}

.mpa__row-icon {
  margin-top: 1px;
}

.mpa__row-icon--warn {
  color: rgb(var(--v-theme-warning));
}

.mpa__row-icon--err {
  color: rgb(var(--v-theme-error));
}

.mpa__row-icon--info {
  color: rgb(var(--v-theme-info));
}

.mpa__row-icon--unknown {
  color: rgba(var(--v-theme-on-surface), 0.55);
}

.mpa__body {
  min-width: 0;
}

/* 定宽三列：站点名 92px / 域名 104px / 标签，保证标签列跨行严格对齐。 */
.mpa__line1 {
  display: grid;
  grid-template-columns: 92px 104px max-content;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.mpa__site {
  overflow: hidden;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.35;
  color: rgba(var(--v-theme-on-surface), 0.95);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.mpa__domain {
  overflow: hidden;
  font-size: 11px;
  line-height: 1.35;
  color: rgba(var(--v-theme-on-surface), 0.4);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* 主因短标签：11px / 18px 高 / 4px 圆角，图标 + 文字双编码。 */
.mpa__tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 18px;
  padding: 0 6px;
  border: 1px solid transparent;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
}

.mpa__tag--warn {
  border-color: rgba(var(--v-theme-warning), 0.28);
  background: rgba(var(--v-theme-warning), 0.13);
  color: rgb(var(--v-theme-warning));
}

.mpa__tag--err {
  border-color: rgba(var(--v-theme-error), 0.3);
  background: rgba(var(--v-theme-error), 0.13);
  color: rgb(var(--v-theme-error));
}

.mpa__tag--info {
  border-color: rgba(var(--v-theme-info), 0.3);
  background: rgba(var(--v-theme-info), 0.14);
  color: rgb(var(--v-theme-info));
}

/* unknown：中性灰 + 无底色；图标必须是问号，否则会被读成「已禁用」。 */
.mpa__tag--unknown {
  border-color: rgba(var(--v-theme-on-surface), 0.3);
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.55);
}

/* 详情行：单行截断，min-height 固定 18px，空详情不跳行。 */
.mpa__detail-line {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-height: 18px;
  margin-top: 2px;
}

.mpa__detail {
  display: -webkit-box;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  line-height: 1.5;
  color: rgba(var(--v-theme-on-surface), 0.52);
  word-break: break-word;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
  line-clamp: 1;
}

.mpa__detail--empty {
  color: rgba(var(--v-theme-on-surface), 0.42);
}

.mpa__meta-end {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  line-height: 1.2;
  color: rgba(var(--v-theme-on-surface), 0.52);
  white-space: nowrap;
}

/* 详情展开：18px 方形按钮，与详情行基线对齐，不占动作列。 */
.mpa__detail-toggle {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.52);
  cursor: pointer;
}

.mpa__detail-toggle:hover {
  background: rgba(var(--v-theme-on-surface), 0.07);
  color: rgba(var(--v-theme-on-surface), 0.94);
}

/* ===== 行内动作：最多 2 个 + 固定 24px 的 ⋯ 位 ===== */
.mpa__row-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: flex-start;
  justify-content: flex-end;
  gap: 2px;
  min-width: 24px;
}

.mpa__mini {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 20px;
  margin-top: -1px;
  padding: 0 6px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-size: 11px;
  white-space: nowrap;
  cursor: pointer;
}

.mpa__mini:hover:not(:disabled) {
  background: rgba(var(--v-theme-on-surface), 0.07);
  color: rgba(var(--v-theme-on-surface), 0.94);
}

.mpa__mini:disabled {
  cursor: default;
}

/* warning 档主位：warning 语汇（重试 = 等会儿可能好）。 */
.mpa__mini--retry {
  border: 1px solid rgba(var(--v-theme-warning), 0.34);
  background: rgba(var(--v-theme-warning), 0.14);
  color: rgb(var(--v-theme-warning));
  font-weight: 500;
}

.mpa__mini--retry:hover:not(:disabled) {
  background: rgba(var(--v-theme-warning), 0.24);
  color: rgb(var(--v-theme-warning));
}

/* unknown 主位：中性白 + 中性描边（色相在本组件里是分类信号，不能给第 4 档上暖黄）。 */
.mpa__mini--primary {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.3);
  background: rgba(var(--v-theme-on-surface), 0.04);
  color: rgba(var(--v-theme-on-surface), 0.86);
  font-weight: 500;
}

.mpa__mini--primary:hover:not(:disabled) {
  border-color: rgba(var(--v-theme-on-surface), 0.45);
  background: rgba(var(--v-theme-on-surface), 0.1);
  color: rgba(var(--v-theme-on-surface), 1);
}

.mpa__mini--info {
  color: rgb(var(--v-theme-info));
}

.mpa__mini--info:hover:not(:disabled) {
  background: rgba(var(--v-theme-info), 0.14);
  color: rgb(var(--v-theme-info));
}

/* 冷却态：warning 描边 + 等宽数字，不是 disabled 灰。 */
.mpa__cooldown {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 20px;
  margin-top: -1px;
  padding: 0 7px;
  border: 1px solid rgba(var(--v-theme-warning), 0.3);
  border-radius: 5px;
  background: rgba(var(--v-theme-warning), 0.08);
  color: rgb(var(--v-theme-warning));
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  cursor: default;
}

.mpa__busy {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 20px;
  margin-top: -1px;
  padding: 0 6px;
  font-size: 11px;
  line-height: 1;
  color: rgba(var(--v-theme-on-surface), 0.62);
  white-space: nowrap;
}

/* ===== 展开的原始响应：等宽 / 3 行截断 / 底部渐隐 / 无滚动条 ===== */
.mpa__raw-wrap {
  margin-top: 6px;
}

.mpa__raw {
  position: relative;
  display: -webkit-box;
  overflow: hidden;
  padding: 7px 9px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.07);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.35);
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
  font-size: 11.5px;
  line-height: 1.55;
  word-break: break-all;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  line-clamp: 3;
}

.mpa__raw::after {
  position: absolute;
  inset: auto 0 0 0;
  height: 22px;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.6));
  pointer-events: none;
  content: '';
}

.mpa__raw-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.4);
}

.mpa__raw-meta .spacer {
  flex: 1;
}

.mpa__link {
  padding: 0;
  border: 0;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 11px;
  cursor: pointer;
  border-bottom: 1px dotted rgba(var(--v-theme-on-surface), 0.28);
}

.mpa__link:hover {
  color: rgba(var(--v-theme-on-surface), 0.94);
}

/* ⋯ 收拢位：桌面隐藏（display:none 不可聚焦），窄屏是唯一行内入口。 */
.mpa__more-btn {
  display: none;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 20px;
  margin-top: -1px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-size: 14px;
  line-height: 1;
  letter-spacing: 1px;
  cursor: pointer;
}

.mpa__more-btn:hover {
  background: rgba(var(--v-theme-on-surface), 0.07);
  color: rgba(var(--v-theme-on-surface), 0.94);
}

.mpa__menu :deep(.v-list-item) {
  min-height: 44px;
}

/* ===== 进行中指示器：减弱动效时停转 + 换静止进度图标（不降透明度） ===== */
.mpa__spin-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  margin-top: 1px;
}

.mpa__spin {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(var(--v-theme-warning), 0.28);
  border-top-color: rgb(var(--v-theme-warning));
  border-radius: 50%;
  animation: mpa-rotate 0.9s linear infinite;
}

.mpa__spin--sm {
  width: 12px;
  height: 12px;
  border-width: 2px;
}

.mpa__spin-alt {
  display: none;
  color: rgb(var(--v-theme-warning));
}

@keyframes mpa-rotate {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .mpa__spin {
    display: none;
  }

  .mpa__spin-alt {
    display: inline-flex;
  }
}

/* ===== 展开/收起动效：只做 max-height + opacity，不推挤结果列表 ===== */
.mpa-collapse-enter-active,
.mpa-collapse-leave-active {
  overflow: hidden;
  transition:
    max-height 180ms ease-out,
    opacity 180ms ease-out;
}

.mpa-collapse-enter-from,
.mpa-collapse-leave-to {
  max-height: 0;
  opacity: 0;
}

.mpa-collapse-enter-to,
.mpa-collapse-leave-from {
  max-height: 275px;
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .mpa-collapse-enter-active,
  .mpa-collapse-leave-active {
    transition: opacity 160ms ease-out;
  }
}

/* ===== 窄屏 <560px：丢次要信息，不丢结构 ===== */
@media (max-width: 560px) {
  .mpa__meta {
    display: none;
  }

  .mpa__title {
    font-size: 12.5px;
  }

  /* 摘要行改为两行：标题与按钮第一行，聚合 chips 独占第二行可横向滑动。 */
  .mpa__head {
    flex-wrap: wrap;
    row-gap: 6px;
  }

  .mpa__live {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
  }

  .mpa__line1 {
    display: flex;
    flex-wrap: wrap;
    row-gap: 3px;
  }

  .mpa__site,
  .mpa__domain {
    max-width: 100%;
  }

  .mpa__chips {
    overflow-x: auto;
    scrollbar-width: none;
  }

  .mpa__chips--head {
    flex: 1 1 100%;
    order: 10;
    padding-bottom: 1px;
  }

  /* 关键：chip 不被压缩，否则窄屏下会被挤扁导致文字重叠。 */
  .mpa__chip {
    flex: 0 0 auto;
  }

  .mpa__actions {
    margin-inline-start: auto;
  }

  .mpa__chips::-webkit-scrollbar {
    display: none;
  }

  /* 行内动作全部收进 ⋯（菜单项 ≥44px）。 */
  .mpa__row-actions .mpa__mini,
  .mpa__row-actions .mpa__cooldown {
    display: none;
  }

  .mpa__more-btn {
    display: inline-flex;
  }
}

/* 摘要行极窄时隐藏折叠按钮的文字，只留图标。 */
@media (max-width: 420px) {
  .mpa__btn-text-label {
    display: none;
  }
}

.mpa__sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
</style>

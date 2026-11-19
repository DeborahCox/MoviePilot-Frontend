<script setup lang="ts">
import { useId } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  groupEditionOptions,
  QUICK_EDITION_VALUES,
  type EditionGroup,
} from '@/utils/editionGroup'

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    filterForm: Record<string, string[]>
    filterKey: string
    filterOptions: Record<string, string[]>
    filterTitle: string
    modelValue?: boolean
  }>(),
  {
    modelValue: true,
  },
)

const emit = defineEmits<{
  (event: 'clearFilter', key: string): void
  (event: 'close'): void
  (event: 'selectAll', key: string): void
  (event: 'update:filterForm', key: string, values: string[]): void
  (event: 'update:modelValue', value: boolean): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

const filterValues = computed(() => props.filterForm[props.filterKey] ?? [])
const options = computed(() => props.filterOptions[props.filterKey] ?? [])

// 与 PC 浮层共用同一套保守分组；只有版本维度且选项较多时启用。
const isTieredEdition = computed(() => props.filterKey === 'edition' && options.value.length > 12)
const editionPanelId = useId()
/** null = 用户尚未手动操作（按默认规则展开）；Set = 手动状态，允许全部收起。 */
const expandedEditionGroups = ref<Set<string> | null>(null)
const editionScrollRef = ref<HTMLElement>()
const editionFadeVisible = ref(true)

/** 可见集合取并集，已选但不在联动选项中的原串仍可取消。 */
const editionVisibleOptions = computed(() => [
  ...new Set([...options.value, ...filterValues.value]),
])
const editionGroups = computed(() => groupEditionOptions(editionVisibleOptions.value))
const quickEditionOptions = computed(() =>
  QUICK_EDITION_VALUES.filter(option => editionVisibleOptions.value.includes(option)),
)

/** 默认展开：含已选值的第一个组，否则第一组；仅用户未手动操作时生效。 */
function defaultExpandedGroupId(): string | undefined {
  const withPicked = editionGroups.value.find(group =>
    group.items.some(item => filterValues.value.includes(item)),
  )
  return withPicked?.id ?? editionGroups.value[0]?.id
}

function isEditionGroupExpanded(group: EditionGroup) {
  if (expandedEditionGroups.value === null) return group.id === defaultExpandedGroupId()
  return expandedEditionGroups.value.has(group.id)
}

/** 点击组头自由切换该组展开/收起，允许全部收起。 */
function toggleEditionGroup(id: string) {
  if (expandedEditionGroups.value === null) {
    const initial = defaultExpandedGroupId()
    expandedEditionGroups.value = new Set(initial ? [initial] : [])
  }
  const next = new Set(expandedEditionGroups.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedEditionGroups.value = next
  nextTick(() => updateEditionFade())
}

/** 组级选框：勾选 = 应用该组全部原串，取消 = 移除该组全部原串。 */
function groupSelectedCount(group: EditionGroup) {
  return group.items.filter(item => filterValues.value.includes(item)).length
}

function isGroupFullySelected(group: EditionGroup) {
  return group.items.length > 0 && groupSelectedCount(group) === group.items.length
}

function isGroupPartiallySelected(group: EditionGroup) {
  const count = groupSelectedCount(group)
  return count > 0 && count < group.items.length
}

function setEditionGroupSelected(group: EditionGroup, checked: boolean) {
  const current = filterValues.value
  const next = checked
    ? [...new Set([...current, ...group.items])]
    : current.filter(item => !group.items.includes(item))
  updateFilter(next)
}

function updateEditionFade(event?: Event) {
  const element = (event?.target as HTMLElement | undefined) ?? editionScrollRef.value
  if (!element) return
  editionFadeVisible.value = element.scrollTop + element.clientHeight < element.scrollHeight - 4
}

watch(editionGroups, () => nextTick(() => updateEditionFade()))

function toggleEditionValue(value: string) {
  updateFilter(
    filterValues.value.includes(value)
      ? filterValues.value.filter(item => item !== value)
      : [...filterValues.value, value],
  )
}

/** 为移动端单项筛选显示对应分类图标。 */
function getFilterIcon(key: string) {
  const icons: Record<string, string> = {
    site: 'mdi-server-network',
    season: 'mdi-television-classic',
    freeState: 'mdi-gift-outline',
    resolution: 'mdi-monitor-screenshot',
    videoCode: 'mdi-video-vintage',
    edition: 'mdi-quality-high',
    releaseGroup: 'mdi-account-group-outline',
    webSource: 'mdi-television-play',
    subtitle: 'mdi-subtitles-outline',
  }
  return icons[key] || 'mdi-filter-variant'
}

/** 将当前筛选值变化回传给过滤条，复用页面的筛选结果。 */
function updateFilter(values: string[]) {
  emit('update:filterForm', props.filterKey, values)
}
</script>

<template>
  <VDialog
    v-if="visible"
    v-model="visible"
    max-width="25rem"
    max-height="85vh"
    location="center"
    scrollable
    data-native-sheet-size="medium"
    :aria-label="props.filterTitle"
  >
    <VCard>
      <VDialogCloseBtn v-model="visible" />
      <VCardTitle class="py-3 d-flex align-center" data-native-dialog-header>
        <VIcon :icon="getFilterIcon(props.filterKey)" class="me-2"></VIcon>
        <span data-native-dialog-title>{{ props.filterTitle }}</span>
        <template v-if="isTieredEdition">
          <span class="edition-scope">全网</span>
          <span class="edition-counter" aria-live="polite">
            已选 <b>{{ filterValues.length }}</b> / 共 {{ editionVisibleOptions.length }}
          </span>
        </template>
        <VSpacer />
        <VBtn
          v-if="filterValues.length > 0"
          variant="text"
          size="small"
          color="error"
          @click.stop="emit('clearFilter', props.filterKey)"
        >
          {{ t('torrent.clear') }}
        </VBtn>
        <VBtn
          v-if="!isTieredEdition"
          class="me-10"
          variant="text"
          size="small"
          color="primary"
          @click.stop="emit('selectAll', props.filterKey)"
        >
          {{ t('torrent.selectAll') }}
        </VBtn>
      </VCardTitle>
      <VDivider />
      <VCardText :class="{ 'filter-menu-tiered': isTieredEdition }">
        <div v-if="isTieredEdition" class="edition-panel" role="dialog" aria-label="质量筛选">
          <div class="edition-quick">
            <span class="edition-quick-label">常用</span>
            <div class="edition-quick-scroll">
              <VChip
                v-for="option in quickEditionOptions"
                :key="option"
                :value="option"
                filter
                variant="elevated"
                size="small"
                class="edition-chip edition-chip--neutral edition-chip--quick"
                :class="{ 'v-chip--selected': filterValues.includes(option) }"
                role="checkbox"
                :aria-checked="filterValues.includes(option)"
                :aria-label="`按版本 ${option} 筛选`"
                :data-value="option"
                data-testid="edition-chip"
                @click.stop="toggleEditionValue(option)"
              >
                <span class="edition-chip-label">{{ option }}</span>
              </VChip>
            </div>
          </div>

          <div class="edition-scroll-wrap">
            <div ref="editionScrollRef" class="edition-scroll" @scroll.passive="updateEditionFade">
              <div
                v-for="group in editionGroups"
                :key="group.id"
                class="edition-group"
                role="group"
                :aria-label="`${group.name} 分组`"
              >
                <div class="edition-group-head">
                  <input
                    type="checkbox"
                    class="edition-group-check"
                    :checked="isGroupFullySelected(group)"
                    :indeterminate="isGroupPartiallySelected(group)"
                    :aria-label="`全选 ${group.name}`"
                    data-testid="edition-group-check"
                    @click.stop
                    @change="setEditionGroupSelected(group, ($event.target as HTMLInputElement).checked)"
                  />
                  <button
                    type="button"
                    class="edition-group-toggle"
                    :aria-expanded="isEditionGroupExpanded(group)"
                    :aria-controls="`${editionPanelId}-${group.id}`"
                    :data-group="group.id"
                    data-testid="edition-group-head"
                    @click.stop="toggleEditionGroup(group.id)"
                  >
                    <VIcon icon="mdi-chevron-right" size="x-small" class="edition-group-chev" />
                    <span class="edition-group-name">{{ group.name }}</span>
                    <span class="edition-group-picked">
                      {{ group.items.filter(item => filterValues.includes(item)).slice(0, 2).join(' · ') }}
                    </span>
                    <span class="edition-group-spacer" />
                    <span
                      v-if="groupSelectedCount(group) > 0"
                      class="edition-group-badge"
                      :aria-label="`已选 ${groupSelectedCount(group)} 项`"
                    >
                      {{ groupSelectedCount(group) }}
                    </span>
                    <span
                      v-if="group.id === 'other' && groupSelectedCount(group) > 0"
                      class="edition-group-hint"
                    >含未识别串</span>
                  </button>
                </div>
                <div
                  :id="`${editionPanelId}-${group.id}`"
                  class="edition-group-body"
                  role="region"
                  :aria-label="`${group.name} 选项`"
                  :hidden="!isEditionGroupExpanded(group)"
                >
                  <VChip
                    v-for="option in group.items"
                    :key="option"
                    :value="option"
                    filter
                    variant="elevated"
                    size="small"
                    class="edition-chip edition-chip--group"
                    :class="{
                      'edition-chip--unknown': group.id === 'other',
                      'v-chip--selected': filterValues.includes(option),
                    }"
                    role="checkbox"
                    :aria-checked="filterValues.includes(option)"
                    :aria-label="`按版本 ${option} 筛选`"
                    :data-value="option"
                    data-testid="edition-chip"
                    @click.stop="toggleEditionValue(option)"
                  >
                    <VIcon
                      v-if="group.id === 'other'"
                      icon="mdi-help-circle-outline"
                      size="x-small"
                      class="edition-chip-mark"
                    />
                    <span class="edition-chip-label">{{ option }}</span>
                    <svg class="edition-chip-check" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M9,16.17L4.83,12L3.41,13.41L9,19L21,7L19.59,5.59L9,16.17Z" />
                    </svg>
                  </VChip>
                </div>
              </div>
            </div>
            <div v-if="editionFadeVisible" class="edition-fade" aria-hidden="true" />
          </div>
        </div>

        <VChipGroup v-else :model-value="filterValues" column multiple class="filter-options" @update:model-value="updateFilter">
          <VChip
            v-for="option in options"
            :key="option"
            :value="option"
            filter
            variant="elevated"
            class="ma-1 filter-chip"
            size="small"
          >
            {{ option }}
          </VChip>
        </VChipGroup>
      </VCardText>
      <VCardActions class="app-dialog-actions">
        <VSpacer />
        <VBtn color="primary" variant="flat" prepend-icon="mdi-check" class="px-5" @click="visible = false">
          {{ t('torrent.confirm') }}<template v-if="isTieredEdition">（{{ filterValues.length }}）</template>
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>
.filter-options {
  display: flex;
  flex-wrap: wrap;
}

.filter-chip {
  border: 1px solid rgba(var(--v-theme-primary), 0.2);
  margin: 4px;
  background-color: rgba(var(--v-theme-primary), 0.1) !important;
  color: rgba(var(--v-theme-on-surface), 0.9) !important;
  font-weight: 500;
  transition: all 0.2s ease;
}

.filter-chip:hover {
  background-color: rgba(var(--v-theme-primary), 0.15) !important;
}

.filter-chip.v-chip--selected {
  background-color: rgba(var(--v-theme-primary), 0.85) !important;
  box-shadow: 0 2px 4px rgba(var(--v-theme-primary), 0.3);
  color: rgb(var(--v-theme-on-primary)) !important;
  font-weight: 600;
}

/* ===== 移动端版本分组清单：与 PC 共用原串 chip + 保守分组 ===== */
.filter-menu-tiered {
  padding: 0;
  overflow: hidden;
}

.edition-panel {
  color: rgb(var(--v-theme-on-surface));
  font-size: 12px;
}

.edition-scope {
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(var(--v-theme-on-surface), 0.05);
  color: rgba(var(--v-theme-on-surface), 0.4);
  font-size: 11px;
  font-weight: 400;
  white-space: nowrap;
}

.edition-counter {
  color: rgba(var(--v-theme-on-surface), 0.52);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.edition-counter b {
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
}

.edition-quick {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 8px;
  min-block-size: 44px;
  padding: 6px 12px;
  background: var(--glass-sheen), var(--glass-overlay-surface, rgb(var(--v-theme-surface)));
  backdrop-filter: var(--glass-popup-filter, blur(8px) saturate(135%));
  -webkit-backdrop-filter: var(--glass-popup-filter, blur(8px) saturate(135%));
  border-block-end: 1px solid var(--glass-border, rgba(var(--v-theme-on-surface), 0.08));
}

.edition-quick-label {
  flex: 0 0 auto;
  color: rgba(var(--v-theme-on-surface), 0.4);
  font-size: 10px;
}

.edition-quick-scroll {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-inline-size: 0;
  overflow-x: auto;
  padding-block: 2px;
  scrollbar-width: none;
  -webkit-mask-image: linear-gradient(90deg, transparent, currentColor 16px, currentColor calc(100% - 16px), transparent);
  mask-image: linear-gradient(90deg, transparent, currentColor 16px, currentColor calc(100% - 16px), transparent);
}

.edition-quick-scroll::-webkit-scrollbar {
  display: none;
}

.edition-scroll-wrap {
  position: relative;
}

.edition-scroll {
  max-block-size: min(620px, 64vh);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 5px 2px 8px;
  scrollbar-width: thin;
  scrollbar-color: rgba(var(--v-theme-primary), 0.38) transparent;
}

/* 分组 = 综合筛选弹窗里的维度子卡（VCard 表面，glass token 全带 fallback） */
.edition-group {
  background: var(--glass-v3-card-background, rgba(var(--v-theme-surface-variant), 0.4));
  backdrop-filter: var(--glass-native-surface-backdrop-filter, none);
  -webkit-backdrop-filter: var(--glass-native-surface-backdrop-filter, none);
  border: var(--app-overlay-border, 1px solid rgba(var(--v-theme-on-surface), 0.08));
  border-radius: var(--app-overlay-radius, 12px);
  margin-inline: 8px;
  padding-block-end: 4px;
  overflow: hidden;
}

.edition-scroll::-webkit-scrollbar {
  width: 6px;
}

.edition-scroll::-webkit-scrollbar-thumb {
  border: 1px solid transparent;
  border-radius: 6px;
  background: rgba(var(--v-theme-primary), 0.38);
  background-clip: padding-box;
}

.edition-fade {
  position: absolute;
  inset-inline: 0;
  inset-block-end: 0;
  block-size: 20px;
  pointer-events: none;
  background: linear-gradient(to top, rgb(var(--v-theme-surface)), transparent);
}

.edition-group + .edition-group {
  margin-block-start: 2px;
}

.edition-group-head {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 4px;
  inline-size: 100%;
  min-block-size: 36px;
  padding: 3px 8px 3px 8px;
  background: transparent;
}

.edition-group-check {
  flex: 0 0 auto;
  inline-size: 16px;
  block-size: 16px;
  margin: 0;
  accent-color: rgb(var(--v-theme-primary));
  cursor: pointer;
}

.edition-group-toggle {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 6px;
  min-inline-size: 0;
  min-block-size: 36px;
  padding: 4px 4px 4px 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.edition-group-head:hover .edition-group-toggle,
.edition-group-toggle:hover {
  background: rgba(var(--v-theme-on-surface), 0.03);
}

.edition-group-chev {
  flex: 0 0 auto;
  color: rgba(var(--v-theme-on-surface), 0.4);
  transition: transform 180ms ease-out;
}

.edition-group-toggle[aria-expanded='true'] .edition-group-chev {
  transform: rotate(90deg);
}

.edition-group-name {
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

.edition-group-picked {
  overflow: hidden;
  color: rgb(var(--v-theme-primary));
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.edition-group-picked:empty {
  display: none;
}

.edition-group-spacer {
  flex: 1;
  min-inline-size: 2px;
}

.edition-group-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-inline-size: 16px;
  block-size: 16px;
  padding-inline: 4px;
  border-radius: 8px;
  background: rgba(var(--v-theme-primary), 0.2);
  color: rgb(var(--v-theme-primary));
  font-size: 10px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.edition-group-hint {
  color: rgba(var(--v-theme-on-surface), 0.4);
  font-size: 10px;
  white-space: nowrap;
}

.edition-group-body {
  padding: 2px 12px 6px 28px;
}

.edition-chip {
  position: relative;
  display: flex;
  align-items: center;
  gap: 7px;
  inline-size: 100%;
  min-block-size: 28px;
  margin: 0;
  padding-inline: 8px;
  /* 对齐综合筛选弹窗 .filter-chip 源码样式：白字 + 0.2 紫边 */
  border: 1px solid rgba(var(--v-theme-primary), 0.2);
  background: rgba(var(--v-theme-primary), 0.1) !important;
  color: rgba(var(--v-theme-on-surface), 0.9) !important;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.2;
  text-align: left;
  white-space: normal;
  overflow-wrap: anywhere;
}

.edition-chip + .edition-chip {
  margin-block-start: 12px;
}

.edition-chip:not(.edition-chip--quick)::before {
  content: '';
  position: absolute;
  inset: -6px 0;
}

.edition-chip:hover {
  background: rgba(var(--v-theme-primary), 0.17) !important;
}

.edition-chip--neutral {
  border-color: rgba(var(--v-theme-on-surface), 0.14);
  background: rgba(var(--v-theme-on-surface), 0.035) !important;
  color: rgba(var(--v-theme-on-surface), 0.72) !important;
}

.edition-chip--neutral:hover {
  background: rgba(var(--v-theme-on-surface), 0.07) !important;
  color: rgb(var(--v-theme-on-surface)) !important;
}

.edition-chip--quick {
  inline-size: auto;
  flex: 0 0 auto;
}

.edition-chip--quick::before {
  content: none;
}

.edition-chip--unknown {
  border-style: dashed;
  border-color: rgba(var(--v-theme-on-surface), 0.14);
  background: transparent !important;
  color: rgba(var(--v-theme-on-surface), 0.4) !important;
}

.edition-chip--unknown:hover {
  background: rgba(var(--v-theme-on-surface), 0.07) !important;
  color: rgba(var(--v-theme-on-surface), 0.72) !important;
}

.edition-chip-label {
  flex: 1;
  min-inline-size: 0;
}

.edition-chip-check {
  display: none;
  inline-size: 12px;
  block-size: 12px;
  fill: rgb(var(--v-theme-on-primary));
  flex: 0 0 auto;
}

.edition-chip-mark {
  flex: 0 0 auto;
  opacity: 0.7;
}

.edition-chip.v-chip--selected {
  border-color: transparent;
  background: rgba(var(--v-theme-primary), 0.85) !important;
  color: rgb(var(--v-theme-on-primary)) !important;
  font-weight: 600;
}

.edition-chip.v-chip--selected .edition-chip-check,
.edition-chip.v-chip--selected .edition-chip-mark {
  display: block;
  opacity: 0.9;
}

.edition-chip.v-chip--selected .edition-chip-mark {
  color: rgb(var(--v-theme-on-primary));
}

.edition-chip:focus-visible,
.edition-group-head:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .edition-group-chev,
  .edition-chip,
  .edition-fade {
    transition: none;
  }

  .edition-chip.v-chip--selected .edition-chip-check {
    display: block;
  }
}
</style>

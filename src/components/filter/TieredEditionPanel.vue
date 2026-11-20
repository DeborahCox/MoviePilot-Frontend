<script setup lang="ts">
import { useEditionGroups } from '@/composables/useEditionGroups'
import { useI18n } from 'vue-i18n'

/**
 * 版本（质量）分组清单面板。
 *
 * 只负责展示与交互：chip 的 value 恒为 filterOptions/filterForm 中的原串，
 * 选中值通过 update:selected 回传，由调用方决定写回哪个维度。
 * 展开态、组级全选、滚动渐隐全部由 useEditionGroups 提供。
 */
const props = withDefaults(
  defineProps<{
    /** 该维度的候选项（原串） */
    options: string[]
    /** 当前已选原串 */
    selected: string[]
    /** compact = PC 浮层现状；comfortable = 移动端半屏（更大触控目标） */
    density?: 'compact' | 'comfortable'
    /** 是否渲染面板自带头部；移动端由半屏标题栏承担时传 false */
    showHead?: boolean
    /** 面板无障碍名称 */
    ariaLabel?: string
  }>(),
  {
    density: 'compact',
    showHead: true,
    ariaLabel: '质量筛选',
  },
)

const emit = defineEmits<{
  (e: 'update:selected', next: string[]): void
  (e: 'clear'): void
}>()

const { t } = useI18n()

const {
  panelId,
  groups,
  visibleOptions,
  isExpanded,
  toggleGroup,
  selectedCount,
  isFullySelected,
  isPartiallySelected,
  setGroupSelected,
  toggleValue,
  scrollRef,
  fadeVisible,
  onScroll,
} = useEditionGroups({
  selected: () => props.selected,
  options: () => props.options,
  onChange: next => emit('update:selected', next),
})
</script>

<template>
  <div
    class="edition-panel"
    :class="{ 'edition-panel--comfortable': density === 'comfortable' }"
    role="dialog"
    :aria-label="ariaLabel"
  >
    <div v-if="showHead" class="edition-head">
      <span class="edition-scope">全网</span>
      <span class="edition-counter" aria-live="polite">
        已选 <b>{{ selected.length }}</b> / 共 {{ visibleOptions.length }}
      </span>
      <VSpacer />
      <VBtn
        v-if="selected.length > 0"
        variant="text"
        size="small"
        color="error"
        class="edition-action"
        @click.stop="emit('clear')"
      >
        {{ t('torrent.clear') }}
      </VBtn>
    </div>

    <div class="edition-scroll-wrap">
      <div ref="scrollRef" class="edition-scroll" @scroll.passive="onScroll">
        <div
          v-for="group in groups"
          :key="group.id"
          class="edition-group"
          role="group"
          :aria-label="`${group.name} 分组`"
        >
          <div class="edition-group-head">
            <input
              type="checkbox"
              class="edition-group-check"
              :checked="isFullySelected(group)"
              :indeterminate="isPartiallySelected(group)"
              :aria-label="`全选 ${group.name}`"
              data-testid="edition-group-check"
              @click.stop
              @change="setGroupSelected(group, ($event.target as HTMLInputElement).checked)"
            />
            <button
              type="button"
              class="edition-group-toggle"
              :aria-expanded="isExpanded(group)"
              :aria-controls="`${panelId}-${group.id}`"
              :data-group="group.id"
              data-testid="edition-group-head"
              @click.stop="toggleGroup(group.id)"
            >
              <VIcon icon="mdi-chevron-right" size="x-small" class="edition-group-chev" />
              <span class="edition-group-name">{{ group.name }}</span>
              <span class="edition-group-picked">
                {{
                  group.items
                    .filter(item => selected.includes(item))
                    .slice(0, 2)
                    .join(' · ')
                }}
              </span>
              <span class="edition-group-spacer" />
              <span
                v-if="selectedCount(group) > 0"
                class="edition-group-badge"
                :aria-label="`已选 ${selectedCount(group)} 项`"
              >
                {{ selectedCount(group) }}
              </span>
              <span v-if="group.id === 'other' && selectedCount(group) > 0" class="edition-group-hint">含未识别串</span>
            </button>
          </div>
          <div
            :id="`${panelId}-${group.id}`"
            class="edition-group-body"
            :class="{ 'edition-group-body--expanded': isExpanded(group) }"
            :inert="!isExpanded(group) || undefined"
            role="region"
            :aria-label="`${group.name} 选项`"
          >
            <div class="edition-group-body-inner">
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
                  'v-chip--selected': selected.includes(option),
                }"
                role="checkbox"
                :aria-checked="selected.includes(option)"
                :aria-label="`按版本 ${option} 筛选`"
                :data-value="option"
                data-testid="edition-chip"
                @click.stop="toggleValue(option)"
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
      </div>
      <div v-if="fadeVisible" class="edition-fade" aria-hidden="true" />
    </div>
  </div>
</template>

<style scoped>
/* ===== 版本分组清单：chip value 恒为原串，只有展示层分组 =====
   density 差异全部收敛为变量：默认 compact（PC 浮层现状），--comfortable 覆盖（移动端半屏）。 */
.edition-panel {
  --edition-group-gap: 6px;
  --edition-head-min: 28px;
  --edition-head-pad: 2px 6px 2px 6px;
  --edition-check-size: 14px;
  --edition-toggle-min: 28px;
  --edition-toggle-pad: 3px 4px 3px 0;
  --edition-inner-pad: 2px 10px 6px 28px;
  --edition-chip-gap: 5px;

  color: rgb(var(--v-theme-on-surface));
  font-size: 12px;
}

.edition-panel--comfortable {
  --edition-group-gap: 2px;
  --edition-head-min: 36px;
  --edition-head-pad: 3px 8px;
  --edition-check-size: 16px;
  --edition-toggle-min: 36px;
  --edition-toggle-pad: 4px 4px 4px 0;
  --edition-inner-pad: 2px 12px 6px 28px;
  --edition-chip-gap: 12px;
}

.edition-head {
  display: flex;
  align-items: center;
  gap: 7px;
  min-block-size: 40px;
  padding: 6px 10px;
  border-block-end: 1px solid rgba(var(--v-theme-on-surface), 0.08);
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
  font-weight: 400;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.edition-counter b {
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
}

.edition-action {
  min-width: 0;
  padding-inline: 6px;
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
  margin-block-start: var(--edition-group-gap);
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

.edition-group-head {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 4px;
  inline-size: 100%;
  min-block-size: var(--edition-head-min);
  padding: var(--edition-head-pad);
  background: transparent;
}

.edition-group-check {
  flex: 0 0 auto;
  inline-size: var(--edition-check-size);
  block-size: var(--edition-check-size);
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
  min-block-size: var(--edition-toggle-min);
  padding: var(--edition-toggle-pad);
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
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.edition-group-picked:empty {
  display: none;
}

/* 移动端半屏原有实现未给「已选摘要」设字重（继承 400），保持不动，避免迁移带来视觉变化。 */
.edition-panel--comfortable .edition-group-picked {
  font-weight: 400;
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

/* 分组展开：max-height 不可行的未知高度用 grid 0fr/1fr 过渡（180ms ease-out 手风琴规范），
   折叠时 body 惰性（inert）保证内部 chip 不可聚焦，键盘 tab 语义与 hidden 等价 */
.edition-group-body {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition:
    grid-template-rows 180ms ease-out,
    opacity 180ms ease-out;
}

.edition-group-body--expanded {
  grid-template-rows: 1fr;
  opacity: 1;
}

.edition-group-body-inner {
  min-block-size: 0;
  overflow: hidden;
  padding: var(--edition-inner-pad);
}

.edition-chip {
  display: flex;
  align-items: center;
  gap: 7px;
  inline-size: 100%;
  min-block-size: 26px;
  margin: 0;
  padding-inline: 10px;
  /* 对齐综合筛选弹窗 .filter-chip 源码样式：白字 + 0.2 紫边 */
  border: 1px solid rgba(var(--v-theme-primary), 0.2);
  background-color: rgba(var(--v-theme-primary), 0.1) !important;
  color: rgba(var(--v-theme-on-surface), 0.9) !important;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.2;
  text-align: left;
  white-space: normal;
  overflow-wrap: anywhere;
  transition: all 0.2s ease;
}

.edition-chip + .edition-chip {
  margin-block-start: var(--edition-chip-gap);
}

/* 移动端半屏：把 26px 高的 chip 触控热区上下各外扩 6px，
   恰好填满 --comfortable 的 12px 间距，不越界抢占相邻 chip。 */
.edition-panel--comfortable .edition-chip {
  position: relative;
}

.edition-panel--comfortable .edition-chip::before {
  content: '';
  position: absolute;
  inset: -6px 0;
}

.edition-chip:hover {
  background-color: rgba(var(--v-theme-primary), 0.15) !important;
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

/* ✓ 图标显隐：宽度 0→12px + 透明度过渡，对照 VChip filter 图标展开动画；
   margin-inline-start -7px 抵消未选中时 gap 占位，布局与 display:none 时一致 */
.edition-chip-check {
  flex: 0 0 auto;
  inline-size: 0;
  block-size: 12px;
  margin-inline-start: -7px;
  overflow: hidden;
  opacity: 0;
  fill: rgb(var(--v-theme-on-primary));
  transition:
    inline-size 0.2s ease,
    margin-inline-start 0.2s ease,
    opacity 0.2s ease;
}

.edition-chip-mark {
  flex: 0 0 auto;
  opacity: 0.7;
}

.edition-chip.v-chip--selected {
  background-color: rgba(var(--v-theme-primary), 0.85) !important;
  /* 对齐源码 .filter-chip.v-chip--selected 微投影 */
  box-shadow: 0 2px 4px rgba(var(--v-theme-primary), 0.3);
  color: rgb(var(--v-theme-on-primary)) !important;
  font-weight: 600;
}

.edition-chip.v-chip--selected .edition-chip-check,
.edition-chip.v-chip--selected .edition-chip-mark {
  opacity: 0.9;
}

.edition-chip.v-chip--selected .edition-chip-check {
  inline-size: 12px;
  margin-inline-start: 0;
}

.edition-chip.v-chip--selected .edition-chip-mark {
  color: rgb(var(--v-theme-on-primary));
}

.edition-chip:focus-visible,
.edition-group-head:focus-visible,
.edition-action:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

/* 选中态 chip 焦点描边按既有规范（TorrentCard .filter-tag-chip）外移到 offset 6 */
.edition-chip.v-chip--selected:focus-visible {
  outline-offset: 6px;
}

@media (prefers-reduced-motion: reduce) {
  .edition-group-chev,
  .edition-group-body,
  .edition-chip,
  .edition-chip-check,
  .edition-fade {
    transition: none;
  }
}
</style>

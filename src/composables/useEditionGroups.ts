import { computed, nextTick, ref, useId, watch } from 'vue'
import { groupEditionOptions, type EditionGroup } from '@/utils/editionGroup'

/**
 * 版本（质量）分组清单的共享状态机。
 *
 * PC 浮层（TorrentFilterBar）与移动端单项筛选（TorrentSingleFilterDialog）原本各写了一份
 * 逐行等价的分组逻辑；这里只做「提取」，行为与两处原始实现保持一一对应：
 * - 分组只改展示，选中值永远是 filterOptions/filterForm 中的原串；
 * - 默认展开策略仅在用户未手动操作（expandedIds === null）时生效；
 * - 可见集合取并集，已选但已不在联动选项中的原串仍可取消。
 */

/** 版本选项超过该数量才启用分组清单，避免少量选项时多一层折叠成本。 */
export const EDITION_TIERED_THRESHOLD = 12

/**
 * 是否启用分组清单。
 *
 * @param options 该维度的候选项
 * @param key 维度名；传入且不是 'edition' 时直接返回 false。不传表示调用方已确认维度。
 */
export function isEditionTiered(options: readonly string[] | undefined, key?: string): boolean {
  if (key !== undefined && key !== 'edition') return false
  return (options?.length ?? 0) > EDITION_TIERED_THRESHOLD
}

/** 可见集合取并集：已选但已不在联动选项中的原串仍可取消，绝不凭空消失。 */
export function mergeEditionOptions(
  options: readonly string[] | undefined,
  selected: readonly string[] | undefined,
): string[] {
  return [...new Set([...(options ?? []), ...(selected ?? [])])]
}

export interface UseEditionGroupsOptions {
  /** 当前已选原串（只读快照）。 */
  selected: () => readonly string[]
  /** 当前候选项（只读快照）。 */
  options: () => readonly string[]
  /** 写回选中值；由调用方决定落到哪个维度（PC 硬编码 edition，移动端用 filterKey）。 */
  onChange: (next: string[]) => void
}

/**
 * 版本分组清单的展开态、组级全选与滚动渐隐。
 *
 * 必须在组件实例或 effectScope 内调用（内部使用 useId 与 watch）。
 */
export function useEditionGroups(opts: UseEditionGroupsOptions) {
  const panelId = useId()

  const visibleOptions = computed(() => mergeEditionOptions(opts.options(), opts.selected()))
  const groups = computed<EditionGroup[]>(() => groupEditionOptions(visibleOptions.value))

  /** null = 用户尚未手动操作（按默认规则展开）；Set = 手动状态，允许全部收起。 */
  const expandedIds = ref<Set<string> | null>(null)
  const scrollRef = ref<HTMLElement>()
  const fadeVisible = ref(true)

  /** 默认展开：含已选值的第一个组，否则第一组；仅用户未手动操作时生效。 */
  function defaultExpandedGroupId(): string | undefined {
    const withPicked = groups.value.find(group => group.items.some(item => opts.selected().includes(item)))
    return withPicked?.id ?? groups.value[0]?.id
  }

  function isExpanded(group: EditionGroup): boolean {
    if (expandedIds.value === null) return group.id === defaultExpandedGroupId()
    return expandedIds.value.has(group.id)
  }

  /** 点击组头自由切换该组展开/收起，允许全部收起；含已选值的组靠组头徽标保持可见。 */
  function toggleGroup(id: string): void {
    if (expandedIds.value === null) {
      const initial = defaultExpandedGroupId()
      expandedIds.value = new Set(initial ? [initial] : [])
    }
    const next = new Set(expandedIds.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    expandedIds.value = next
    nextTick(() => onScroll())
  }

  /** 组内已选数量，用于组头徽标与三态选框。 */
  function selectedCount(group: EditionGroup): number {
    return group.items.filter(item => opts.selected().includes(item)).length
  }

  function isFullySelected(group: EditionGroup): boolean {
    return group.items.length > 0 && selectedCount(group) === group.items.length
  }

  function isPartiallySelected(group: EditionGroup): boolean {
    const count = selectedCount(group)
    return count > 0 && count < group.items.length
  }

  /** 组级选框：勾选 = 应用该组全部原串，取消 = 移除该组全部原串。 */
  function setGroupSelected(group: EditionGroup, checked: boolean): void {
    const current = opts.selected()
    const next = checked
      ? [...new Set([...current, ...group.items])]
      : current.filter(item => !group.items.includes(item))
    opts.onChange(next)
  }

  /** 单项切换：已选则移除，未选则追加到末尾。 */
  function toggleValue(value: string): void {
    const current = opts.selected()
    opts.onChange(current.includes(value) ? current.filter(item => item !== value) : [...current, value])
  }

  /** 内容未触底时显示底部渐隐，提示可继续滚动。 */
  function onScroll(event?: Event): void {
    const element = (event?.target as HTMLElement | undefined) ?? scrollRef.value
    if (!element) return
    fadeVisible.value = element.scrollTop + element.clientHeight < element.scrollHeight - 4
  }

  // 分组内容变化后重新测量滚动高度，避免展开/收起后渐隐态停留在旧值。
  watch(groups, () => nextTick(() => onScroll()))

  return {
    panelId,
    groups,
    visibleOptions,
    expandedIds,
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
  }
}

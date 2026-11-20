import {
  EDITION_TIERED_THRESHOLD,
  isEditionTiered,
  mergeEditionOptions,
  useEditionGroups,
} from '@/composables/useEditionGroups'
import type { EditionGroup } from '@/utils/editionGroup'
import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, ref, type Ref } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'

/**
 * 13 个候选版本，覆盖 uhd/bd/webdl/web/other 五个分组，且数量越过分组阈值。
 * 组内顺序由 groupEditionOptions 的 HDR 排序决定，用例只通过 groupById 取实际值，避免复制排序规则。
 */
const OPTIONS = [
  'UHD BluRay HDR10',
  'UHD BluRay DV',
  'BluRayPlus',
  'BluRay',
  'BluRay REMUX',
  'WEB-DL',
  'WEB-DL HDR10',
  'WEB',
  'WEB HEVC',
  'HDTV',
  'DVD',
  'UHD',
  'BluRay HDR',
]

type EditionApi = ReturnType<typeof useEditionGroups>

interface EditionHarness {
  api: EditionApi
  options: Ref<string[]>
  selected: Ref<string[]>
}

/** 已挂载的宿主组件，用例结束统一卸载，避免组件实例与 watch 泄漏到下一条用例。 */
let mountedHosts: VueWrapper[] = []

afterEach(() => {
  mountedHosts.forEach(host => host.unmount())
  mountedHosts = []
})

/**
 * 在最小宿主组件内运行 composable。
 * useId() 需要活动的组件实例（effectScope 不会提供），因此这里挂载一个渲染 null 的宿主组件。
 */
function setupEdition(initialOptions: string[], initialSelected: string[]): EditionHarness {
  const options = ref([...initialOptions])
  const selected = ref([...initialSelected])
  const holder: { api?: EditionApi } = {}

  const Host = defineComponent({
    setup() {
      holder.api = useEditionGroups({
        selected: () => selected.value,
        options: () => options.value,
        onChange: next => {
          selected.value = [...next]
        },
      })
      return () => null
    },
  })

  mountedHosts.push(mount(Host))

  const api = holder.api
  if (!api) throw new Error('useEditionGroups 未在宿主组件内初始化')
  return { api, options, selected }
}

/** 按分组 id 取分组；分组始终包含全部五个 id，缺失即为实现异常。 */
function groupById(api: EditionApi, id: EditionGroup['id']): EditionGroup {
  const group = api.groups.value.find(item => item.id === id)
  if (!group) throw new Error(`缺少分组 ${id}`)
  return group
}

describe('useEditionGroups 展开态', () => {
  it('默认展开第一个含已选值的组，没有已选时展开第 0 组', () => {
    const empty = setupEdition(OPTIONS, [])
    expect(empty.api.expandedIds.value).toBeNull()
    expect(empty.api.isExpanded(groupById(empty.api, 'uhd'))).toBe(true)
    expect(empty.api.isExpanded(groupById(empty.api, 'web'))).toBe(false)

    const picked = setupEdition(OPTIONS, ['WEB-DL'])
    expect(picked.api.expandedIds.value).toBeNull()
    expect(picked.api.isExpanded(groupById(picked.api, 'webdl'))).toBe(true)
    expect(picked.api.isExpanded(groupById(picked.api, 'uhd'))).toBe(false)
  })

  it('首次 toggleGroup 后默认策略冻结，再改已选值不会改变未操作组的展开状态', () => {
    const harness = setupEdition(OPTIONS, ['WEB-DL'])
    // 首次点击先实体化默认集合（webdl），再自由多开 web。
    harness.api.toggleGroup('web')
    expect(harness.api.expandedIds.value).not.toBeNull()
    expect(harness.api.isExpanded(groupById(harness.api, 'webdl'))).toBe(true)
    expect(harness.api.isExpanded(groupById(harness.api, 'web'))).toBe(true)

    // 改选到 bd 组：默认策略已冻结，bd 不会自动展开，原有展开态保持不变。
    harness.selected.value = ['BluRay']
    expect(harness.api.isExpanded(groupById(harness.api, 'bd'))).toBe(false)
    expect(harness.api.isExpanded(groupById(harness.api, 'webdl'))).toBe(true)
    expect(harness.api.isExpanded(groupById(harness.api, 'web'))).toBe(true)
  })

  it('可以全部收起', () => {
    const harness = setupEdition(OPTIONS, ['WEB-DL'])
    expect(harness.api.isExpanded(groupById(harness.api, 'webdl'))).toBe(true)

    harness.api.toggleGroup('webdl')
    expect(harness.api.groups.value.every(group => !harness.api.isExpanded(group))).toBe(true)

    // 全部收起后再点一次仍可单独展开，保持自由多开。
    harness.api.toggleGroup('bd')
    expect(harness.api.isExpanded(groupById(harness.api, 'bd'))).toBe(true)
    expect(harness.api.isExpanded(groupById(harness.api, 'webdl'))).toBe(false)
  })
})

describe('useEditionGroups 可见集合', () => {
  it('visibleOptions 保留已选但已不在 options 里的原串', () => {
    const harness = setupEdition(OPTIONS, ['Custom Edition X'])

    expect(harness.api.visibleOptions.value).toHaveLength(OPTIONS.length + 1)
    expect(harness.api.visibleOptions.value).toContain('Custom Edition X')

    // 该原串无法识别介质，落入「其他·未识别」组但仍可取消。
    expect(groupById(harness.api, 'other').items).toContain('Custom Edition X')
  })

  it('mergeEditionOptions 取并集并去重，保持 options 在前、selected 在后的顺序', () => {
    expect(mergeEditionOptions(['A', 'B'], ['B', 'C'])).toEqual(['A', 'B', 'C'])
    expect(mergeEditionOptions(undefined, ['C'])).toEqual(['C'])
    expect(mergeEditionOptions(['A'], undefined)).toEqual(['A'])
    expect(mergeEditionOptions(undefined, undefined)).toEqual([])
  })
})

describe('useEditionGroups 组级全选', () => {
  it('setGroupSelected(true) 去重且保持原顺序，重复全选不产生重复项', () => {
    const harness = setupEdition(OPTIONS, ['BluRay'])
    const bd = groupById(harness.api, 'bd')

    harness.api.setGroupSelected(bd, true)
    expect(harness.selected.value).toEqual(['BluRay', 'BluRay HDR', 'BluRay REMUX'])
    expect(new Set(harness.selected.value).size).toBe(harness.selected.value.length)

    harness.api.setGroupSelected(bd, true)
    expect(harness.selected.value).toEqual(['BluRay', 'BluRay HDR', 'BluRay REMUX'])
    expect(harness.api.isFullySelected(bd)).toBe(true)
    expect(harness.api.isPartiallySelected(bd)).toBe(false)
    expect(harness.api.selectedCount(bd)).toBe(bd.items.length)
  })

  it('setGroupSelected(false) 只移除本组原串，其他组不受影响', () => {
    const harness = setupEdition(OPTIONS, ['WEB-DL', 'BluRay', 'WEB'])
    const bd = groupById(harness.api, 'bd')

    expect(harness.api.isPartiallySelected(bd)).toBe(true)

    harness.api.setGroupSelected(bd, false)
    expect(harness.selected.value).toEqual(['WEB-DL', 'WEB'])
    expect(harness.api.selectedCount(bd)).toBe(0)
    expect(harness.api.isFullySelected(bd)).toBe(false)
    expect(harness.api.isPartiallySelected(bd)).toBe(false)
  })
})

describe('useEditionGroups 单项切换', () => {
  it('toggleValue 选中时追加到末尾，取消时移除', () => {
    const harness = setupEdition(OPTIONS, [])

    harness.api.toggleValue('WEB-DL')
    expect(harness.selected.value).toEqual(['WEB-DL'])

    harness.api.toggleValue('BluRay')
    expect(harness.selected.value).toEqual(['WEB-DL', 'BluRay'])

    harness.api.toggleValue('WEB-DL')
    expect(harness.selected.value).toEqual(['BluRay'])
  })
})

describe('版本分组阈值', () => {
  it('仅 edition 维度且选项数超过阈值时启用分组清单', () => {
    const below = OPTIONS.slice(0, EDITION_TIERED_THRESHOLD)
    const above = OPTIONS.slice(0, EDITION_TIERED_THRESHOLD + 1)

    expect(EDITION_TIERED_THRESHOLD).toBe(12)
    expect(isEditionTiered(above)).toBe(true)
    expect(isEditionTiered(above, 'edition')).toBe(true)
    expect(isEditionTiered(below, 'edition')).toBe(false)
    expect(isEditionTiered(above, 'resolution')).toBe(false)
    expect(isEditionTiered(undefined, 'edition')).toBe(false)
  })
})

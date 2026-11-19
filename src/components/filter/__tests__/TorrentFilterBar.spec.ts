import TorrentFilterBar from '@/components/filter/TorrentFilterBar.vue'
import { fireEvent, screen } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { groupEditionOptions } from '@/utils/editionGroup'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  closeAll: vi.fn(),
  closeSingle: vi.fn(),
  openSharedDialog: vi.fn(),
  updateAll: vi.fn(),
  updateSingle: vi.fn(),
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))

const PassThroughStub = defineComponent({
  template: '<div><slot /></div>',
})

const ButtonStub = defineComponent({
  emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\')"><slot name="prepend" /><slot /></button>',
})

const ListItemStub = defineComponent({
  emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\')"><slot name="prepend" /><slot /></button>',
})

const ChipGroupStub = defineComponent({
  emits: ['update:modelValue'],
  template:
    '<button type="button" data-testid="filter-value-control" @click="$emit(\'update:modelValue\', [\'Site B\'])"><slot /></button>',
})

const ChipStub = defineComponent({
  props: {
    closable: { type: Boolean, default: false },
  },
  emits: ['click:close'],
  template:
    '<span><slot /><button v-if="closable" type="button" aria-label="移除筛选" @click="$emit(\'click:close\')" /></span>',
})

/** 分组 chip 使用原生 button 语义，替身负责把点击与 data-* 原样透传。 */
const TieredChipStub = defineComponent({
  inheritAttrs: false,
  emits: ['click'],
  setup(_props, { attrs, emit, slots }) {
    return () =>
      h(
        'button',
        {
          type: 'button',
          ...attrs,
          onClick: (event: MouseEvent) => emit('click', event),
        },
        slots.default?.(),
      )
  },
})

const componentStubs = {
  VBadge: PassThroughStub,
  VBtn: ButtonStub,
  VCard: PassThroughStub,
  VCardText: PassThroughStub,
  VChip: ChipStub,
  VChipGroup: ChipGroupStub,
  VDivider: PassThroughStub,
  VIcon: PassThroughStub,
  VList: PassThroughStub,
  VListItem: ListItemStub,
  VListItemTitle: PassThroughStub,
  VMenu: PassThroughStub,
  VSpacer: PassThroughStub,
}

const defaultProps = {
  enableAnimation: false,
  filterForm: {
    edition: [],
    freeState: [],
    releaseGroup: [],
    resolution: [],
    season: [],
    site: ['Site A'],
    videoCode: [],
  },
  filterOptions: {
    edition: [],
    freeState: [],
    releaseGroup: [],
    resolution: [],
    season: ['S01'],
    site: ['Site A', 'Site B'],
    videoCode: [],
  },
  filterTitles: {
    edition: '版本',
    freeState: '促销',
    releaseGroup: '制作组',
    resolution: '分辨率',
    season: '季集',
    site: '站点',
    videoCode: '编码',
  },
  sortField: 'default',
  sortTitles: {
    default: '默认排序',
    publishTime: '发布时间',
    seeder: '做种数',
    site: '站点排序',
    size: '体积',
  },
  sortType: 'desc' as const,
  totalFilteredCount: 2,
}

/** 使用受控表单渲染过滤条，菜单边界由轻量替身负责。 */
async function renderFilterBar() {
  return renderWithProviders(TorrentFilterBar, {
    props: defaultProps,
    global: { stubs: componentStubs },
  })
}

describe('TorrentFilterBar', () => {
  beforeEach(() => {
    let openCount = 0
    mocks.openSharedDialog.mockImplementation(() => {
      openCount += 1
      return openCount === 1
        ? { close: mocks.closeSingle, id: 1, updateProps: mocks.updateSingle }
        : { close: mocks.closeAll, id: 2, updateProps: mocks.updateAll }
    })
  })

  it('offers source and subtitle filters on desktop, mobile and the combined dialog', async () => {
    const props = {
      ...defaultProps,
      filterForm: { ...defaultProps.filterForm, webSource: [], subtitle: [] },
      filterOptions: { ...defaultProps.filterOptions, webSource: ['Netflix', 'Disney+'], subtitle: ['中字', '特效'] },
      filterTitles: { ...defaultProps.filterTitles, webSource: '源', subtitle: '字幕' },
    }
    const result = await renderWithProviders(TorrentFilterBar, { props, global: { stubs: componentStubs } })
    const desktopButtons = Array.from(result.container.querySelectorAll('.filter-bar > .filter-btn'))
    expect(desktopButtons.some(button => button.textContent?.trim().startsWith('源'))).toBe(true)
    expect(desktopButtons.some(button => button.textContent?.trim().startsWith('字幕'))).toBe(true)

    const mobileButtons = Array.from(result.container.querySelectorAll<HTMLButtonElement>('.filter-btn-mobile'))
    await fireEvent.click(mobileButtons.find(button => button.textContent?.trim() === '源') as HTMLButtonElement)
    expect(mocks.openSharedDialog.mock.calls[0][1]).toMatchObject({ filterKey: 'webSource', filterTitle: '源' })
    const events = mocks.openSharedDialog.mock.calls[0][2] as Record<string, (...args: unknown[]) => void>
    events['update:filterForm']('webSource', ['Netflix'])
    expect(result.emitted()['update:filterForm']).toEqual([['webSource', ['Netflix']]])

    await fireEvent.click(mobileButtons.find(button => button.textContent?.trim() === '字幕') as HTMLButtonElement)
    expect(mocks.updateSingle).toHaveBeenCalledWith(
      expect.objectContaining({ filterKey: 'subtitle', filterTitle: '字幕' }),
    )
    events['update:filterForm']('subtitle', ['特效'])
    expect(result.emitted()['update:filterForm']?.[1]).toEqual(['subtitle', ['特效']])

    await fireEvent.click(mobileButtons.find(button => button.textContent?.includes('综合筛选')) as HTMLButtonElement)
    expect(mocks.openSharedDialog.mock.calls[1][1]).toMatchObject({
      filterForm: props.filterForm,
      filterOptions: props.filterOptions,
      filterTitles: props.filterTitles,
    })
    result.unmount()
  })

  it('emits desktop sorting, filtering, selection and clearing commands without mutating props', async () => {
    const result = await renderFilterBar()

    await fireEvent.click(screen.getAllByRole('button', { name: '升序' })[0])
    await fireEvent.click(screen.getAllByRole('button', { name: '体积' })[0])
    const siteValueControl = screen
      .getAllByTestId('filter-value-control')
      .find(control => control.textContent?.includes('Site A'))
    expect(siteValueControl).toBeDefined()
    await fireEvent.click(siteValueControl as HTMLElement)
    await fireEvent.click(screen.getAllByRole('button', { name: '全选' }).at(-1) as HTMLElement)
    await fireEvent.click(screen.getByRole('button', { name: '清除' }))
    await fireEvent.click(screen.getByRole('button', { name: '移除筛选' }))
    await fireEvent.click(screen.getByRole('button', { name: '清除筛选' }))

    expect(result.emitted()['update:sortType']).toEqual([['asc']])
    expect(result.emitted()['update:sortField']).toEqual([['size']])
    expect(result.emitted()['update:filterForm']).toEqual([['site', ['Site B']]])
    expect(result.emitted().selectAll).toEqual([['site']])
    expect(result.emitted().clearFilter).toEqual([['site']])
    expect(result.emitted().removeFilter).toEqual([['site', 'Site A']])
    expect(result.emitted().clearAllFilters).toEqual([[]])
    expect(defaultProps.filterForm.site).toEqual(['Site A'])
  })

  it('drives mobile shared dialogs with current controlled props and closes them on unmount', async () => {
    const result = await renderFilterBar()
    const mobileButtons = Array.from(result.container.querySelectorAll<HTMLButtonElement>('.filter-btn-mobile'))
    const siteButton = mobileButtons.find(button => button.textContent?.includes('站点'))
    const seasonButton = mobileButtons.find(button => button.textContent?.includes('季集'))
    const allButton = mobileButtons.find(button => button.textContent?.includes('综合筛选'))

    expect(siteButton).toBeDefined()
    expect(seasonButton).toBeDefined()
    expect(allButton).toBeDefined()
    await fireEvent.click(siteButton as HTMLButtonElement)

    const singleProps = mocks.openSharedDialog.mock.calls[0][1] as Record<string, unknown>
    const singleEvents = mocks.openSharedDialog.mock.calls[0][2] as Record<string, (...args: unknown[]) => void>
    expect(singleProps).toMatchObject({
      filterForm: defaultProps.filterForm,
      filterKey: 'site',
      filterOptions: defaultProps.filterOptions,
      filterTitle: '站点',
    })
    singleEvents['update:filterForm']('site', ['Site B'])
    singleEvents.selectAll('site')
    singleEvents.clearFilter('site')
    expect(result.emitted()['update:filterForm']).toEqual([['site', ['Site B']]])
    expect(result.emitted().selectAll).toEqual([['site']])
    expect(result.emitted().clearFilter).toEqual([['site']])

    await fireEvent.click(seasonButton as HTMLButtonElement)
    expect(mocks.updateSingle).toHaveBeenCalledWith(
      expect.objectContaining({
        filterKey: 'season',
        filterTitle: '季集',
      }),
    )

    await fireEvent.click(allButton as HTMLButtonElement)
    expect(mocks.openSharedDialog).toHaveBeenCalledTimes(2)

    result.unmount()

    expect(mocks.closeSingle).toHaveBeenCalledOnce()
    expect(mocks.closeAll).toHaveBeenCalledOnce()
  })

  it('reopens shared dialogs after their close events release the active controller', async () => {
    const result = await renderFilterBar()
    const mobileButtons = Array.from(result.container.querySelectorAll<HTMLButtonElement>('.filter-btn-mobile'))
    const siteButton = mobileButtons.find(button => button.textContent?.includes('站点'))
    const allButton = mobileButtons.find(button => button.textContent?.includes('综合筛选'))

    await fireEvent.click(siteButton as HTMLButtonElement)
    const firstSingleEvents = mocks.openSharedDialog.mock.calls[0][2] as Record<string, (...args: unknown[]) => void>
    firstSingleEvents.close()

    await fireEvent.click(siteButton as HTMLButtonElement)
    const secondSingleEvents = mocks.openSharedDialog.mock.calls[1][2] as Record<string, (...args: unknown[]) => void>
    secondSingleEvents['update:modelValue'](false)

    await fireEvent.click(allButton as HTMLButtonElement)
    const firstAllEvents = mocks.openSharedDialog.mock.calls[2][2] as Record<string, (...args: unknown[]) => void>
    firstAllEvents.close()

    await fireEvent.click(allButton as HTMLButtonElement)
    const secondAllEvents = mocks.openSharedDialog.mock.calls[3][2] as Record<string, (...args: unknown[]) => void>
    secondAllEvents['update:modelValue'](false)

    expect(mocks.openSharedDialog).toHaveBeenCalledTimes(4)
    result.unmount()
  })
})

describe('TorrentFilterBar tiered edition panel', () => {
  const editionOptions = [
    '全网',
    'BluRay HDR',
    'UHD BluRay HDR',
    'UHD BluRay',
    'BluRay',
    'UHD BluRay REMUX',
    'WEB-DL DoVi',
    'WEB-DL HDR',
    'WEB-DL',
    'BluRay REMUX',
    'HDR10 DoVi',
    'UHD BluRay REMUX DV',
    'WEB-DL HDR10+',
    'WEB',
  ]
  const stubs = { ...componentStubs, VChip: TieredChipStub }

  function propsFor(overrides: Record<string, unknown> = {}) {
    return {
      ...defaultProps,
      filterForm: {
        ...defaultProps.filterForm,
        edition: ['UHD BluRay REMUX'],
        releaseGroup: [],
      },
      filterOptions: {
        ...defaultProps.filterOptions,
        edition: editionOptions,
        releaseGroup: Array.from({ length: 13 }, (_, index) => `Group ${index}`),
      },
      filterTitles: { ...defaultProps.filterTitles, releaseGroup: '制作组' },
      ...overrides,
    }
  }

  it('shows original edition strings in five ordered groups with exact selection counts', async () => {
    const result = await renderWithProviders(TorrentFilterBar, { props: propsFor(), global: { stubs } })

    expect(result.container.querySelectorAll('.edition-panel')).toHaveLength(1)
    expect(
      Array.from(result.container.querySelectorAll<HTMLElement>('[data-testid="edition-group-head"]')).map(
        head => head.querySelector('.edition-group-name')?.textContent?.trim(),
      ),
    ).toEqual(['UHD蓝光', '蓝光', 'WEB-DL', 'WEB', '其他·未识别'])
    expect(result.container.textContent).toMatch(/已选\s*1\s*\/\s*共\s*14/)

    const chips = Array.from(result.container.querySelectorAll<HTMLElement>('[data-testid="edition-chip"]'))
    expect(new Set(chips.map(chip => chip.dataset.value)).size).toBeGreaterThan(12)
    expect(chips.some(chip => chip.dataset.value === 'UHD BluRay REMUX DV')).toBe(true)
    expect(chips.find(chip => chip.dataset.value === 'UHD BluRay REMUX')).toHaveAttribute('aria-checked', 'true')
    expect(
      result.container.querySelector<HTMLElement>('[data-testid="edition-group-head"] .edition-group-badge')?.textContent?.trim(),
    ).toBe('1')

    result.unmount()
  })

  it('toggles one original string at a time and lets groups expand and collapse freely', async () => {
    const { container, emitted } = await renderWithProviders(TorrentFilterBar, {
      props: propsFor({
        filterForm: { ...defaultProps.filterForm, edition: [], releaseGroup: [] },
      }),
      global: { stubs },
    })

    const bdHead = container.querySelector<HTMLElement>('[data-testid="edition-group-head"][data-group="bd"]')
    const webdlHead = container.querySelector<HTMLElement>('[data-testid="edition-group-head"][data-group="webdl"]')
    expect(bdHead).toHaveAttribute('aria-expanded', 'false')
    await fireEvent.click(bdHead as HTMLElement)
    expect(bdHead).toHaveAttribute('aria-expanded', 'true')
    await fireEvent.click(webdlHead as HTMLElement)
    // 自由多开：打开新组不收起已展开的组
    expect(bdHead).toHaveAttribute('aria-expanded', 'true')
    expect(webdlHead).toHaveAttribute('aria-expanded', 'true')
    // 再次点击已展开的组头可直接收起
    await fireEvent.click(bdHead as HTMLElement)
    expect(bdHead).toHaveAttribute('aria-expanded', 'false')
    expect(webdlHead).toHaveAttribute('aria-expanded', 'true')

    const chip = container.querySelector<HTMLElement>('[data-testid="edition-chip"][data-value="WEB-DL HDR"]')
    expect(chip).not.toBeNull()
    await fireEvent.click(chip as HTMLElement)
    expect(emitted()['update:filterForm']).toEqual([['edition', ['WEB-DL HDR']]])
  })

  it('selects and clears an entire group via the group checkbox', async () => {
    const { container, emitted } = await renderWithProviders(TorrentFilterBar, {
      props: propsFor({
        filterForm: { ...defaultProps.filterForm, edition: [], releaseGroup: [] },
      }),
      global: { stubs },
    })

    const bdItems = groupEditionOptions(editionOptions).find(group => group.id === 'bd')?.items ?? []
    expect(bdItems.length).toBeGreaterThan(0)

    const bdCheck = container.querySelector<HTMLElement>('[data-testid="edition-group-check"][aria-label="全选 蓝光"]')
    expect(bdCheck).not.toBeNull()
    await fireEvent.click(bdCheck as HTMLElement)
    expect(emitted()['update:filterForm']).toEqual([['edition', bdItems]])

    // 再次点击取消全选 → 该组值全部移除
    await fireEvent.click(bdCheck as HTMLElement)
    expect(emitted()['update:filterForm']).toEqual([['edition', bdItems], ['edition', []]])
  })

  it('hides the panel-level select-all button for tiered edition', async () => {
    const { container } = await renderWithProviders(TorrentFilterBar, { props: propsFor(), global: { stubs } })

    // 分组面板头部不应再有「全选」（全选所有选项等价于不过滤，无意义）
    const head = container.querySelector('.edition-head') as HTMLElement
    expect(head).not.toBeNull()
    expect(head.textContent).not.toContain('全选')
    // 其他维度（平铺模式）仍保留全选
    expect(screen.getAllByRole('button', { name: '全选' }).length).toBeGreaterThan(0)
  })

  it('keeps other dimensions flat even when they have more than twelve options', async () => {
    const { container } = await renderWithProviders(TorrentFilterBar, { props: propsFor(), global: { stubs } })

    expect(container.querySelectorAll('.edition-panel')).toHaveLength(1)
    expect(container.querySelectorAll('.filter-options')).toHaveLength(6)
    expect(screen.getAllByTestId('filter-value-control')).toHaveLength(6)
  })
})

import { describe, expect, it } from 'vitest'
import { fireEvent, screen } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import TorrentSingleFilterDialog from '../TorrentSingleFilterDialog.vue'
import { NativeSheetAdapter } from '@/native/sheet'
import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'

describe('单项资源过滤的原生半屏关闭契约', () => {
  it('保留多选、全选与确认，同时为原生标题栏提供中等高度和独立关闭入口', async () => {
    const result = await renderWithProviders(TorrentSingleFilterDialog, {
      global: { components: { VDialogCloseBtn: DialogCloseBtn } },
      props: {
        filterForm: { resolution: [] },
        filterKey: 'resolution',
        filterTitle: '分辨率',
        filterOptions: { resolution: ['1080p', '2160p'] },
      },
    })
    expect(await screen.findByText('2160p')).toBeVisible()
    const adapter = new NativeSheetAdapter(document)
    const sheet = adapter.read('搜索结果')!
    expect(sheet).toMatchObject({ title: '分辨率', canDismiss: true, prefersMediumDetent: true })
    expect(sheet.actions.map(item => item.title)).toEqual(['全选'])
    expect(adapter.execute('presentation.action', { id: sheet.id, actionId: sheet.actions[0].id })).toBe(true)
    expect(result.emitted().selectAll).toEqual([['resolution']])
    expect(adapter.execute('presentation.dismiss', { id: sheet.id })).toBe(true)
    expect(result.emitted()['update:modelValue']).toEqual([[false]])
    expect(result.emitted().close).toEqual([[]])
  })

  it('uses the same conservative edition grouping with exact original chip values', async () => {
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
    const result = await renderWithProviders(TorrentSingleFilterDialog, {
      global: { components: { VDialogCloseBtn: DialogCloseBtn } },
      props: {
        filterForm: { edition: [] },
        filterKey: 'edition',
        filterTitle: '质量',
        filterOptions: { edition: editionOptions },
      },
    })

    expect(await screen.findByText('其他·未识别')).toBeVisible()
    expect(document.querySelector('.edition-counter')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('已选 0 / 共 14')
    const chips = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="edition-chip"]'))
    expect(chips.length).toBeGreaterThan(12)
    expect(chips.every(chip => editionOptions.includes(chip.dataset.value ?? ''))).toBe(true)

    const selection = chips.find(chip => chip.dataset.value === 'WEB-DL HDR10+')
    expect(selection).toBeDefined()
    await fireEvent.click(selection as HTMLElement)
    expect(result.emitted()['update:filterForm']).toEqual([['edition', ['WEB-DL HDR10+']]])
  })
})

import DownloaderInfoDialog from '@/components/dialog/DownloaderInfoDialog.vue'
import type { DownloaderConf } from '@/api/types'
import userEvent from '@testing-library/user-event'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: { get: (...args: unknown[]) => mocks.apiGet(...args) },
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, info: mocks.toastInfo }),
}))

const qbDownloader: DownloaderConf = {
  name: 'QB',
  type: 'qbittorrent',
  default: true,
  enabled: true,
  config: { host: 'http://qb.local:8080' },
  path_mapping: [],
}

describe('DownloaderInfoDialog allowed users', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset().mockResolvedValue([])
    mocks.toastError.mockReset()
    mocks.toastInfo.mockReset()
  })

  it('allowed_users 可多选并在保存时随结果 emit，item-value 使用用户名', async () => {
    const onChange = vi.fn()
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === 'user/') return Promise.resolve([{ name: 'bob', nickname: '鲍勃' }])
      return Promise.resolve([])
    })

    await renderWithProviders(DownloaderInfoDialog, {
      props: {
        modelValue: true,
        downloader: qbDownloader,
        downloaders: [qbDownloader],
        onChange,
      },
      global: { stubs: { VDialogCloseBtn: true } },
    })

    expect(screen.getAllByText('允许的用户').length).toBeGreaterThan(0)
    const user = userEvent.setup()
    await user.click(screen.getByLabelText('允许的用户'))
    await user.click(await screen.findByRole('option', { name: '鲍勃' }))
    await fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(mocks.apiGet).toHaveBeenCalledWith('user/', { feedback: 'silent' })
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ allowed_users: ['bob'] }),
        'QB',
      ),
    )
  })
})

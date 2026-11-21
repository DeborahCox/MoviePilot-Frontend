import TheMovieDbView from '@/views/discover/TheMovieDbView.vue'
import { screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMediaListHarness, latestMediaListRequest } from './sourceViewTestUtils'

const INITIAL_PARAMS = {
  sort_by: 'popularity.desc',
  with_genres: '',
  with_original_language: '',
  with_keywords: '',
  with_watch_providers: '',
  vote_average: 0,
  release_year: '',
  release_date: '',
}

describe('TheMovieDbView', () => {
  let mediaList: ReturnType<typeof createMediaListHarness>

  beforeEach(() => {
    mediaList = createMediaListHarness()
  })

  async function renderView() {
    return renderWithProviders(TheMovieDbView, {
      global: {
        stubs: {
          MediaCardListView: mediaList.stub,
        },
      },
    })
  }

  it('starts with the exact movie endpoint and filter contract', async () => {
    await renderView()

    expect(latestMediaListRequest(mediaList)).toEqual({
      apipath: 'discover/tmdb_movies',
      params: INITIAL_PARAMS,
    })
  })

  it('repairs media-specific sort and genre values in both type directions', async () => {
    const user = userEvent.setup()
    await renderView()

    await user.click(screen.getByText('上映日期降序'))
    await user.click(screen.getByText('动作'))
    await user.click(screen.getByText('电视剧'))

    await waitFor(() => {
      expect(latestMediaListRequest(mediaList)).toEqual({
        apipath: 'discover/tmdb_tvs',
        params: {
          ...INITIAL_PARAMS,
          sort_by: 'popularity.desc',
          with_genres: '',
        },
      })
    })

    await user.click(screen.getByText('首播日期降序'))
    await user.click(screen.getByText('动作冒险'))
    await user.click(screen.getByText('电影'))

    await waitFor(() => {
      expect(latestMediaListRequest(mediaList)).toEqual({
        apipath: 'discover/tmdb_movies',
        params: {
          ...INITIAL_PARAMS,
          sort_by: 'popularity.desc',
          with_genres: '',
        },
      })
    })
  })

  it('preserves shared filters and the current rating across type changes', async () => {
    const user = userEvent.setup()
    await renderView()

    await user.click(screen.getByText('评分降序'))
    await user.click(screen.getByText('动画'))
    await user.click(screen.getByText('中文'))
    screen.getByRole('slider').focus()
    await user.keyboard('{ArrowRight}'.repeat(7))
    await user.click(screen.getByText('电视剧'))

    await waitFor(() => {
      expect(latestMediaListRequest(mediaList)).toEqual({
        apipath: 'discover/tmdb_tvs',
        params: {
          ...INITIAL_PARAMS,
          sort_by: 'vote_average.desc',
          with_genres: '16',
          with_original_language: 'zh',
          vote_average: 3.5,
        },
      })
    })
  })

  it('sends numeric zero when the rating field is cleared, while keeping the input clearable', async () => {
    const user = userEvent.setup()
    await renderView()

    const rating = screen.getByRole('spinbutton')
    await user.clear(rating)

    await waitFor(() => {
      expect(latestMediaListRequest(mediaList).params.vote_average).toBe(0)
    })
    expect((rating as HTMLInputElement).value).toBe('')
  })

  it('normalizes an emptied rating to zero on blur', async () => {
    const user = userEvent.setup()
    await renderView()

    const rating = screen.getByRole('spinbutton')
    await user.clear(rating)
    await user.tab()

    await waitFor(() => {
      expect((rating as HTMLInputElement).value).toBe('0')
      expect(latestMediaListRequest(mediaList).params.vote_average).toBe(0)
    })
  })

  it('steps the rating slider by half points and mirrors the value into the number field', async () => {
    const user = userEvent.setup()
    await renderView()

    screen.getByRole('slider').focus()
    await user.keyboard('{ArrowRight}')

    await waitFor(() => {
      expect(latestMediaListRequest(mediaList).params.vote_average).toBe(0.5)
      expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('0.5')
    })
  })

  it('accepts an exact rating typed into the number field and syncs the slider', async () => {
    const user = userEvent.setup()
    await renderView()

    const rating = screen.getByRole('spinbutton')
    await user.clear(rating)
    await user.type(rating, '8.5')

    await waitFor(() => {
      expect(latestMediaListRequest(mediaList).params.vote_average).toBe(8.5)
      expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('8.5')
    })
  })

  it('sends the decade code when a decade chip is selected', async () => {
    const user = userEvent.setup()
    await renderView()

    await user.click(screen.getByText('2020年代', { exact: true }))

    await waitFor(() => {
      expect(latestMediaListRequest(mediaList).params.release_year).toBe('2020s')
    })
  })

  it('sends the current year code when the current year chip is selected', async () => {
    const user = userEvent.setup()
    await renderView()

    const currentYear = String(new Date().getFullYear())
    await user.click(screen.getByText(currentYear, { exact: true }))

    await waitFor(() => {
      expect(latestMediaListRequest(mediaList).params.release_year).toBe(currentYear)
    })
  })

  it('keeps the selected year when switching between movie and TV types', async () => {
    const user = userEvent.setup()
    await renderView()

    await user.click(screen.getByText('2020年代', { exact: true }))
    await user.click(screen.getByText('电视剧'))

    await waitFor(() => {
      expect(latestMediaListRequest(mediaList)).toEqual({
        apipath: 'discover/tmdb_tvs',
        params: {
          ...INITIAL_PARAMS,
          release_year: '2020s',
        },
      })
    })
  })

  it('restores mandatory defaults while leaving optional chip filters unset', async () => {
    const user = userEvent.setup()
    await renderView()

    await user.click(screen.getByText('电影'))
    await user.click(screen.getByText('评分降序'))
    await user.click(screen.getByText('评分降序'))
    await user.click(screen.getByText('动画'))
    await user.click(screen.getByText('动画'))
    await user.click(screen.getByText('中文'))
    await user.click(screen.getByText('中文'))

    await waitFor(() => {
      expect(latestMediaListRequest(mediaList)).toEqual({
        apipath: 'discover/tmdb_movies',
        params: {
          ...INITIAL_PARAMS,
          with_genres: undefined,
          with_original_language: undefined,
        },
      })
    })
  })
})

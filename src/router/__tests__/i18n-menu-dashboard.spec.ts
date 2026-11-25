import { getNavMenus } from '@/router/i18n-menu'
import { buildUserPermissionContext, filterMenusByPermission } from '@/utils/permission'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/mediaId', () => ({
  getMediaSourceCatalog: () => ({ value: [] }),
  isMediaSourceCatalogLoaded: () => ({ value: true }),
  supportsMediaSourceType: () => false,
}))

vi.mock('@/composables/useModuleCatalog', () => ({
  getModuleCatalog: () => ({ value: [] }),
  isModuleCatalogLoaded: () => ({ value: true }),
}))

vi.mock('@/utils/recommendSources', () => ({
  hasAvailableRecommendSources: () => true,
}))

const t = ((key: string) => key) as unknown as Parameters<typeof getNavMenus>[0]

describe('dashboard navigation permission', () => {
  it('uses the dashboard category for both menu and route-facing permission checks', () => {
    const menus = getNavMenus(t)
    const dashboard = menus.find(menu => menu.to === '/dashboard')

    expect(dashboard).toMatchObject({
      admin: false,
      permission: 'dashboard',
    })

    const legacyUser = buildUserPermissionContext(false, {
      features: { 'dashboard.media': true },
    })
    expect(filterMenusByPermission(menus, legacyUser).some(menu => menu.to === '/dashboard')).toBe(true)

    const deniedUser = buildUserPermissionContext(false, { dashboard: false })
    expect(filterMenusByPermission(menus, deniedUser).some(menu => menu.to === '/dashboard')).toBe(false)
  })
})

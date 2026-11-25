import {
  ADMIN_PERMISSIONS,
  buildDefaultFeaturePermissions,
  buildUserPermissionContext,
  DEFAULT_PERMISSIONS,
  filterMenusByPermission,
  hasFeaturePermission,
  hasPermission,
  normalizeUserPermissions,
  PERMISSION_FEATURE,
} from '@/utils/permission'
import { describe, expect, it } from 'vitest'

describe('dashboard permission category', () => {
  it('keeps dashboard disabled by default with safe feature defaults', () => {
    expect(DEFAULT_PERMISSIONS.dashboard).toBe(false)

    const defaults = buildDefaultFeaturePermissions(false)
    expect(defaults[PERMISSION_FEATURE.DASHBOARD_MEDIA]).toBe(true)
    expect(defaults[PERMISSION_FEATURE.DASHBOARD_RUNTIME]).toBe(true)
    expect(defaults[PERMISSION_FEATURE.DASHBOARD_SCHEDULER]).toBe(false)
    expect(defaults[PERMISSION_FEATURE.DASHBOARD_RECENT_IMPORTS]).toBe(false)
    expect(defaults[PERMISSION_FEATURE.DASHBOARD_SYSTEM]).toBe(false)
    expect(defaults[PERMISSION_FEATURE.DASHBOARD_CUSTOMIZE]).toBe(false)
  })

  it('grants every dashboard feature to administrators', () => {
    expect(ADMIN_PERMISSIONS.dashboard).toBe(true)
    for (const feature of [
      PERMISSION_FEATURE.DASHBOARD_MEDIA,
      PERMISSION_FEATURE.DASHBOARD_RUNTIME,
      PERMISSION_FEATURE.DASHBOARD_SCHEDULER,
      PERMISSION_FEATURE.DASHBOARD_RECENT_IMPORTS,
      PERMISSION_FEATURE.DASHBOARD_SYSTEM,
      PERMISSION_FEATURE.DASHBOARD_CUSTOMIZE,
    ]) {
      expect(buildDefaultFeaturePermissions()[feature]).toBe(true)
    }
  })

  it('normalizes historical permissions without weakening restricted features', () => {
    const normalized = normalizeUserPermissions({ discovery: true })
    expect(normalized.dashboard).toBe(false)
    expect(normalized.features?.[PERMISSION_FEATURE.DASHBOARD_SYSTEM]).toBe(false)

    const dashboardUser = buildUserPermissionContext(false, { dashboard: true })
    expect(hasPermission(dashboardUser, 'dashboard')).toBe(true)
    expect(hasPermission(dashboardUser, 'admin')).toBe(false)
    expect(hasFeaturePermission(dashboardUser, PERMISSION_FEATURE.DASHBOARD_MEDIA, 'dashboard')).toBe(true)
    expect(hasFeaturePermission(dashboardUser, PERMISSION_FEATURE.DASHBOARD_RUNTIME, 'dashboard')).toBe(true)
    expect(hasFeaturePermission(dashboardUser, PERMISSION_FEATURE.DASHBOARD_SCHEDULER, 'dashboard')).toBe(false)
    expect(hasFeaturePermission(dashboardUser, PERMISSION_FEATURE.DASHBOARD_RECENT_IMPORTS, 'dashboard')).toBe(false)
    expect(hasFeaturePermission(dashboardUser, PERMISSION_FEATURE.DASHBOARD_SYSTEM, 'dashboard')).toBe(false)
    expect(hasFeaturePermission(dashboardUser, PERMISSION_FEATURE.DASHBOARD_CUSTOMIZE, 'dashboard')).toBe(false)
  })

  it('restores the dashboard category from legacy feature-only permissions', () => {
    const legacy = normalizeUserPermissions({
      features: { [PERMISSION_FEATURE.DASHBOARD_MEDIA]: true },
    })
    expect(legacy.dashboard).toBe(true)

    const explicitDenied = normalizeUserPermissions({
      dashboard: false,
      features: { [PERMISSION_FEATURE.DASHBOARD_MEDIA]: true },
    })
    expect(explicitDenied.dashboard).toBe(false)
  })

  it('keeps menu visibility aligned with dashboard route permission', () => {
    const menus = [
      { title: '仪表盘', to: '/dashboard', permission: 'dashboard' },
      { title: '资源搜索', to: '/resource', permission: 'search' },
    ] as const
    const legacyUser = buildUserPermissionContext(false, {
      features: { [PERMISSION_FEATURE.DASHBOARD_MEDIA]: true },
    })
    const noDashboardUser = buildUserPermissionContext(false, {
      dashboard: false,
      search: true,
    })

    expect(filterMenusByPermission([...menus], legacyUser).map(menu => menu.to)).toEqual(['/dashboard', '/resource'])
    expect(filterMenusByPermission([...menus], noDashboardUser).map(menu => menu.to)).toEqual(['/resource'])
  })

  it('allows explicit feature enablement and superuser override', () => {
    const enabled = buildUserPermissionContext(false, {
      dashboard: true,
      features: { [PERMISSION_FEATURE.DASHBOARD_SYSTEM]: true },
    })
    expect(hasFeaturePermission(enabled, PERMISSION_FEATURE.DASHBOARD_SYSTEM, 'dashboard')).toBe(true)

    const admin = buildUserPermissionContext(true, { dashboard: false })
    expect(hasPermission(admin, 'dashboard')).toBe(true)
    expect(hasFeaturePermission(admin, PERMISSION_FEATURE.DASHBOARD_SYSTEM, 'dashboard')).toBe(true)
  })
})

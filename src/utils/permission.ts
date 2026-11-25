// 权限类型定义
export type UserPermissionCategoryKey = 'discovery' | 'search' | 'subscribe' | 'manage' | 'dashboard'
export type UserPermissionKey = UserPermissionCategoryKey | 'admin'
export type UserPermissionFeatureKey = string
export type UserPermissionFeatureMap = Record<UserPermissionFeatureKey, boolean>

export interface UserPermissionFeatureOption {
  key: UserPermissionFeatureKey
  permission: UserPermissionCategoryKey
  titleKey: string
  descriptionKey: string
  icon: string
  path?: string
  /** 普通用户开启所属分类时该功能的默认状态，未声明时默认开启。 */
  defaultEnabledForMember?: boolean
}

export interface UserPermissions {
  discovery: boolean // 发现权限
  search: boolean // 搜索权限
  subscribe: boolean // 订阅权限
  manage: boolean // 管理权限
  dashboard: boolean // 仪表盘权限，独立于管理权限
  admin?: boolean // 管理员权限，仅用于前端入口标识，实际由 is_superuser 决定
  features?: UserPermissionFeatureMap // 功能级权限，缺省功能默认继承分类权限
}

export type UserPermissionContext = UserPermissions & { is_superuser?: boolean; [key: string]: unknown }
export type PermissionProtectedItem = { permission?: UserPermissionKey; feature?: UserPermissionFeatureKey }

export const PERMISSION_FEATURE = {
  DISCOVERY_RECOMMEND: 'discovery.recommend',
  DISCOVERY_EXPLORE: 'discovery.explore',
  SEARCH_RESOURCE: 'search.resource',
  SUBSCRIBE_MOVIE: 'subscribe.movie',
  SUBSCRIBE_TV: 'subscribe.tv',
  SUBSCRIBE_MUSIC: 'subscribe.music',
  SUBSCRIBE_CALENDAR: 'subscribe.calendar',
  SUBSCRIBE_SHARE: 'subscribe.share',
  MANAGE_WORKFLOW: 'manage.workflow',
  MANAGE_DOWNLOADING: 'manage.downloading',
  MANAGE_HISTORY: 'manage.history',
  MANAGE_FILEMANAGER: 'manage.filemanager',
  MANAGE_SITE: 'manage.site',
  DASHBOARD_MEDIA: 'dashboard.media',
  DASHBOARD_RUNTIME: 'dashboard.runtime',
  DASHBOARD_SCHEDULER: 'dashboard.scheduler',
  DASHBOARD_RECENT_IMPORTS: 'dashboard.recentImports',
  DASHBOARD_SYSTEM: 'dashboard.system',
  DASHBOARD_CUSTOMIZE: 'dashboard.customize',
} as const

export const USER_PERMISSION_FEATURES: UserPermissionFeatureOption[] = [
  {
    key: PERMISSION_FEATURE.DISCOVERY_RECOMMEND,
    permission: 'discovery',
    titleKey: 'dialog.userAddEdit.permissions.features.recommend',
    descriptionKey: 'dialog.userAddEdit.permissions.featureDescriptions.recommend',
    icon: 'mdi-cards-outline',
    path: '/recommend',
  },
  {
    key: PERMISSION_FEATURE.DISCOVERY_EXPLORE,
    permission: 'discovery',
    titleKey: 'dialog.userAddEdit.permissions.features.explore',
    descriptionKey: 'dialog.userAddEdit.permissions.featureDescriptions.explore',
    icon: 'mdi-apple-safari',
    path: '/discover',
  },
  {
    key: PERMISSION_FEATURE.SEARCH_RESOURCE,
    permission: 'search',
    titleKey: 'dialog.userAddEdit.permissions.features.resourceSearch',
    descriptionKey: 'dialog.userAddEdit.permissions.featureDescriptions.resourceSearch',
    icon: 'mdi-magnify',
    path: '/resource',
  },
  {
    key: PERMISSION_FEATURE.SUBSCRIBE_MOVIE,
    permission: 'subscribe',
    titleKey: 'dialog.userAddEdit.permissions.features.movieSubscribe',
    descriptionKey: 'dialog.userAddEdit.permissions.featureDescriptions.movieSubscribe',
    icon: 'mdi-movie-open-outline',
    path: '/subscribe/movie',
  },
  {
    key: PERMISSION_FEATURE.SUBSCRIBE_TV,
    permission: 'subscribe',
    titleKey: 'dialog.userAddEdit.permissions.features.tvSubscribe',
    descriptionKey: 'dialog.userAddEdit.permissions.featureDescriptions.tvSubscribe',
    icon: 'mdi-television',
    path: '/subscribe/tv',
  },
  {
    key: PERMISSION_FEATURE.SUBSCRIBE_MUSIC,
    permission: 'subscribe',
    titleKey: 'dialog.userAddEdit.permissions.features.musicSubscribe',
    descriptionKey: 'dialog.userAddEdit.permissions.featureDescriptions.musicSubscribe',
    icon: 'mdi-music-note',
    path: '/subscribe/music',
  },
  {
    key: PERMISSION_FEATURE.SUBSCRIBE_CALENDAR,
    permission: 'subscribe',
    titleKey: 'dialog.userAddEdit.permissions.features.calendar',
    descriptionKey: 'dialog.userAddEdit.permissions.featureDescriptions.calendar',
    icon: 'mdi-calendar',
    path: '/calendar',
  },
  {
    key: PERMISSION_FEATURE.SUBSCRIBE_SHARE,
    permission: 'subscribe',
    titleKey: 'dialog.userAddEdit.permissions.features.subscribeShare',
    descriptionKey: 'dialog.userAddEdit.permissions.featureDescriptions.subscribeShare',
    icon: 'mdi-share-variant',
    path: '/subscribe-share',
  },
  {
    key: PERMISSION_FEATURE.MANAGE_WORKFLOW,
    permission: 'manage',
    titleKey: 'dialog.userAddEdit.permissions.features.workflow',
    descriptionKey: 'dialog.userAddEdit.permissions.featureDescriptions.workflow',
    icon: 'mdi-state-machine',
    path: '/workflow',
  },
  {
    key: PERMISSION_FEATURE.MANAGE_DOWNLOADING,
    permission: 'manage',
    titleKey: 'dialog.userAddEdit.permissions.features.downloading',
    descriptionKey: 'dialog.userAddEdit.permissions.featureDescriptions.downloading',
    icon: 'mdi-download-outline',
    path: '/downloading',
  },
  {
    key: PERMISSION_FEATURE.MANAGE_HISTORY,
    permission: 'manage',
    titleKey: 'dialog.userAddEdit.permissions.features.history',
    descriptionKey: 'dialog.userAddEdit.permissions.featureDescriptions.history',
    icon: 'mdi-folder-play-outline',
    path: '/history',
  },
  {
    key: PERMISSION_FEATURE.MANAGE_FILEMANAGER,
    permission: 'manage',
    titleKey: 'dialog.userAddEdit.permissions.features.fileManager',
    descriptionKey: 'dialog.userAddEdit.permissions.featureDescriptions.fileManager',
    icon: 'mdi-folder-multiple-outline',
    path: '/filemanager',
  },
  {
    key: PERMISSION_FEATURE.MANAGE_SITE,
    permission: 'manage',
    titleKey: 'dialog.userAddEdit.permissions.features.site',
    descriptionKey: 'dialog.userAddEdit.permissions.featureDescriptions.site',
    icon: 'mdi-web',
    path: '/site',
  },
  {
    key: PERMISSION_FEATURE.DASHBOARD_MEDIA,
    permission: 'dashboard',
    titleKey: 'dialog.userAddEdit.permissions.features.dashboardMedia',
    descriptionKey: 'dialog.userAddEdit.permissions.featureDescriptions.dashboardMedia',
    icon: 'mdi-chart-line',
    path: '/dashboard',
  },
  {
    key: PERMISSION_FEATURE.DASHBOARD_RUNTIME,
    permission: 'dashboard',
    titleKey: 'dialog.userAddEdit.permissions.features.dashboardRuntime',
    descriptionKey: 'dialog.userAddEdit.permissions.featureDescriptions.dashboardRuntime',
    icon: 'mdi-speedometer',
    path: '/dashboard',
  },
  {
    key: PERMISSION_FEATURE.DASHBOARD_SCHEDULER,
    permission: 'dashboard',
    titleKey: 'dialog.userAddEdit.permissions.features.dashboardScheduler',
    descriptionKey: 'dialog.userAddEdit.permissions.featureDescriptions.dashboardScheduler',
    icon: 'mdi-calendar-clock',
    path: '/dashboard',
    defaultEnabledForMember: false,
  },
  {
    key: PERMISSION_FEATURE.DASHBOARD_RECENT_IMPORTS,
    permission: 'dashboard',
    titleKey: 'dialog.userAddEdit.permissions.features.dashboardRecentImports',
    descriptionKey: 'dialog.userAddEdit.permissions.featureDescriptions.dashboardRecentImports',
    icon: 'mdi-tray-arrow-down',
    path: '/dashboard',
    defaultEnabledForMember: false,
  },
  {
    key: PERMISSION_FEATURE.DASHBOARD_SYSTEM,
    permission: 'dashboard',
    titleKey: 'dialog.userAddEdit.permissions.features.dashboardSystem',
    descriptionKey: 'dialog.userAddEdit.permissions.featureDescriptions.dashboardSystem',
    icon: 'mdi-information-outline',
    path: '/dashboard',
    defaultEnabledForMember: false,
  },
  {
    key: PERMISSION_FEATURE.DASHBOARD_CUSTOMIZE,
    permission: 'dashboard',
    titleKey: 'dialog.userAddEdit.permissions.features.dashboardCustomize',
    descriptionKey: 'dialog.userAddEdit.permissions.featureDescriptions.dashboardCustomize',
    icon: 'mdi-view-dashboard-edit',
    path: '/dashboard',
    defaultEnabledForMember: false,
  },
]

/**
 * 构造功能级权限默认值：管理员全开；普通用户按各功能项的安全默认值为准。
 */
export function buildDefaultFeaturePermissions(enabled = true): UserPermissionFeatureMap {
  return Object.fromEntries(
    USER_PERMISSION_FEATURES.map(feature => [feature.key, enabled ? true : (feature.defaultEnabledForMember ?? true)]),
  )
}

/** 构造插件导航的功能权限键，供动态插件入口复用。 */
export function buildPluginPermissionFeatureKey(pluginId: string, navKey = 'main'): UserPermissionFeatureKey {
  return `plugin.${pluginId}.${navKey}`
}

/** 判断传入值是否为可安全读取的普通对象。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 仪表盘功能键集合，用于兼容旧后端丢弃分类字段但保留功能开关的权限数据。 */
const DASHBOARD_FEATURE_KEYS = USER_PERMISSION_FEATURES.filter(feature => feature.permission === 'dashboard').map(
  feature => feature.key,
)

/** 判断旧权限数据是否通过显式功能开关授予了仪表盘访问权限。 */
function hasExplicitDashboardFeature(features: Record<string, unknown>): boolean {
  return DASHBOARD_FEATURE_KEYS.some(key => features[key] === true)
}

/** 规整用户权限数据，兼容没有 features 字段的历史用户。 */
export function normalizeUserPermissions(
  permissions: Partial<UserPermissions> | null | undefined = {},
): UserPermissions {
  const permissionData = permissions ?? {}
  const rawFeatures = isRecord(permissionData.features) ? permissionData.features : {}
  const features = {
    ...buildDefaultFeaturePermissions(false),
    ...Object.fromEntries(Object.entries(rawFeatures).filter(([, value]) => typeof value === 'boolean')),
  } as UserPermissionFeatureMap
  // 旧后端 Schema 会丢弃 dashboard 分类但保留 dashboard.* 功能键；
  // 仅在分类字段缺失时依据显式开启的功能恢复入口，显式 false 仍然拒绝。
  const dashboardPermission =
    typeof permissionData.dashboard === 'boolean' ? permissionData.dashboard : hasExplicitDashboardFeature(rawFeatures)

  return {
    discovery: permissionData.discovery ?? DEFAULT_PERMISSIONS.discovery,
    search: permissionData.search ?? DEFAULT_PERMISSIONS.search,
    subscribe: permissionData.subscribe ?? DEFAULT_PERMISSIONS.subscribe,
    manage: permissionData.manage ?? DEFAULT_PERMISSIONS.manage,
    dashboard: dashboardPermission,
    admin: permissionData.admin ?? DEFAULT_PERMISSIONS.admin,
    features,
  }
}

/** 构造权限检查上下文，统一超级管理员标记、分类权限与功能权限字段。 */
export function buildUserPermissionContext(
  isSuperuser: boolean,
  permissions: Partial<UserPermissions> = {},
): UserPermissionContext {
  return {
    is_superuser: isSuperuser,
    ...normalizeUserPermissions(permissions),
  }
}

// 默认权限配置
export const DEFAULT_PERMISSIONS: UserPermissions = {
  discovery: true,
  search: true,
  subscribe: true,
  manage: false,
  dashboard: false,
  admin: false,
  features: buildDefaultFeaturePermissions(false),
}

// 管理员权限配置
export const ADMIN_PERMISSIONS: UserPermissions = {
  discovery: true,
  search: true,
  subscribe: true,
  manage: true,
  dashboard: true,
  admin: true,
  features: buildDefaultFeaturePermissions(),
}

/** 检查用户是否拥有指定权限分类。 */
export function hasPermission(userPermissions: any, permission: UserPermissionKey): boolean {
  // 如果用户是超级用户，拥有所有权限
  if (userPermissions?.is_superuser === true) {
    return true
  }

  // admin 入口只允许超级管理员，不从普通用户 permissions 字段放行
  if (permission === 'admin') {
    return false
  }

  // 检查具体权限
  const permissions = userPermissions || {}
  return permissions[permission] === true
}

/** 检查用户是否拥有指定功能权限，缺省功能项默认放行以兼容历史数据。 */
export function hasFeaturePermission(
  userPermissions: any,
  feature?: UserPermissionFeatureKey,
  permission?: UserPermissionKey,
): boolean {
  if (!feature) {
    return true
  }

  if (userPermissions?.is_superuser === true) {
    return true
  }

  if (permission && !hasPermission(userPermissions, permission)) {
    return false
  }

  const features = isRecord(userPermissions?.features) ? userPermissions.features : {}
  return features[feature] !== false
}

/** 批量检查是否拥有任一权限分类。 */
export function hasAnyPermission(userPermissions: any, permissionList: UserPermissionKey[]): boolean {
  return permissionList.some(permission => hasPermission(userPermissions, permission))
}

/** 批量检查是否拥有全部权限分类。 */
export function hasAllPermissions(userPermissions: any, permissionList: UserPermissionKey[]): boolean {
  return permissionList.every(permission => hasPermission(userPermissions, permission))
}

/** 统一检查带 permission / feature 字段的入口，避免菜单、按钮、快捷入口各自实现判断。 */
export function hasItemPermission(item: PermissionProtectedItem, userPermissions: any): boolean {
  if (item.permission && !hasPermission(userPermissions, item.permission)) {
    return false
  }

  return hasFeaturePermission(userPermissions, item.feature, item.permission)
}

/** 根据权限过滤带 permission / feature 字段的入口。 */
export function filterItemsByPermission<T extends PermissionProtectedItem>(items: T[], userPermissions: any): T[] {
  return items.filter(item => hasItemPermission(item, userPermissions))
}

/** 根据权限过滤菜单项。 */
export function filterMenusByPermission(menus: any[], userPermissions: any): any[] {
  return filterItemsByPermission(menus, userPermissions)
}

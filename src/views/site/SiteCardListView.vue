<script lang="ts" setup>
import api from '@/api'
import type { Site, SiteStatistic, SiteUserData } from '@/api/types'
import SiteCard from '@/components/cards/SiteCard.vue'
import NoDataFound from '@/components/states/NoDataFound.vue'
import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import { useDynamicButton, type DynamicButtonMenuItem } from '@/composables/useDynamicButton'
import { useI18n } from 'vue-i18n'
import { usePWA } from '@/composables/usePWA'
import { useToast } from 'vue-toastification'
import { useKeepAliveRefresh, type KeepAliveRefreshContext } from '@/composables/useKeepAliveRefresh'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useUserStore } from '@/stores'
import { buildUserPermissionContext, hasPermission } from '@/utils/permission'
import { useNativePageHeader } from '@/native/page'
import { nativeChromeActive } from '@/native/layout'

// 国际化
const { t } = useI18n()

// 提示框
const $toast = useToast()

// 路由
const route = useRoute()
const router = useRouter()

// APP 模式检测
const { appMode } = usePWA()
const userStore = useUserStore()
const canManage = computed(() =>
  hasPermission(buildUserPermissionContext(userStore.superUser, userStore.permissions), 'manage'),
)

// 拖拽排序和站点弹窗都不是站点列表首屏必需，打开对应功能时再加载。
const Draggable = defineAsyncComponent(() => import('vuedraggable').then(module => module.default))
const SiteAddEditDialog = defineAsyncComponent(() => import('@/components/dialog/SiteAddEditDialog.vue'))
const SiteStatisticsDialog = defineAsyncComponent(() => import('@/components/dialog/SiteStatisticsDialog.vue'))
const SiteImportDialog = defineAsyncComponent(() => import('@/components/dialog/SiteImportDialog.vue'))

// 站点列表
const siteList = ref<Site[]>([])

// 排序失败时只能回退到最近一次由服务端确认的列表，不能保留未保存的拖拽结果。
const confirmedSiteList = ref<Site[]>([])

// 站点数据列表
const userDataList = ref<SiteUserData[]>([])

// 站点统计数据列表
const siteStatsList = ref<Record<string, SiteStatistic>>({})

// 是否刷新过
const isRefreshed = ref(false)

// 是否加载中
const loading = ref(false)

// 首次加载失败时保留独立错误态，避免把网络异常显示成空站点。
const loadError = ref(false)

const sortMode = ref(false)

// 排序保存期间锁定拖拽，确保一次请求只确认它实际提交的顺序快照。
const savingPriority = ref(false)

// 筛选相关
const filterMenu = ref(false)
const filterOption = ref('all') // all, active, inactive, connected, slow, failed, unknown
// 原生操作从系统顶栏发起，仍打开同一份 HTML 筛选菜单。
const siteFilterActivator = computed(() =>
  nativeChromeActive.value ? '[data-native-menu-anchor][data-menu-activator="site-filter-btn"]' : undefined,
)

// 筛选选项
const filterOptions = computed(() => [
  { value: 'all', label: t('common.all'), icon: 'mdi-filter-multiple-outline' },
  { value: 'active', label: t('common.active'), icon: 'mdi-check-circle', color: 'success' },
  { value: 'inactive', label: t('common.inactive'), icon: 'mdi-stop-circle', color: 'error' },
  { value: 'connected', label: t('site.connectionNormal'), icon: 'mdi-wifi', color: 'success' },
  { value: 'slow', label: t('site.connectionSlow'), icon: 'mdi-wifi-strength-2', color: 'warning' },
  { value: 'failed', label: t('site.connectionFailed'), icon: 'mdi-wifi-off', color: 'error' },
  { value: 'unknown', label: t('site.connectionUnknown'), icon: 'mdi-help-circle', color: 'secondary' },
])

// 关键词过滤：资源搜索页的「去配置 / 去更新」跳转到 /site?q=<站点名>，这里读出并用于定位站点。
const queryFilter = computed(() => {
  const raw = route.query.q
  const value = Array.isArray(raw) ? raw[0] : raw
  return (value ?? '').toString().trim()
})
const normalizedQuery = computed(() => queryFilter.value.toLowerCase())
// 状态筛选与关键词过滤任一命中都算「列表是子集」，拖拽排序据此关闭。
const hasActiveFilter = computed(() => filterOption.value !== 'all' || Boolean(normalizedQuery.value))

/** 站点名或域名包含关键词即命中（不区分大小写）。 */
function matchesQueryFilter(site: Site) {
  const query = normalizedQuery.value
  if (!query) return true
  return site.name.toLowerCase().includes(query) || site.domain.toLowerCase().includes(query)
}

/** 清除关键词过滤：只替换 query，不新增历史记录。 */
function clearQueryFilter() {
  if (!queryFilter.value) return
  const query = { ...route.query }
  delete query.q
  void router.replace({ query })
}

// 筛选后的站点列表
const filteredSiteList = computed(() => {
  const statusFiltered =
    filterOption.value === 'all'
      ? siteList.value
      : siteList.value.filter(site => {
          if (filterOption.value === 'active') {
            return site.is_active
          } else if (filterOption.value === 'inactive') {
            return !site.is_active
          } else if (['connected', 'slow', 'failed', 'unknown'].includes(filterOption.value)) {
            const connectionStatus = getConnectionStatus(site.domain)
            return connectionStatus === filterOption.value
          }
          return true
        })
  // 关键词过滤与状态筛选叠加（AND），而不是替换：从资源搜索页跳过来时仍可再按状态筛。
  return normalizedQuery.value ? statusFiltered.filter(matchesQueryFilter) : statusFiltered
})

// 用于拖拽排序的列表
const draggableSiteList = computed({
  get() {
    // 有任何筛选时只能展示子集；拖拽会重排隐藏站点，因此筛选态只读（canDragSort 同时为 false）。
    return hasActiveFilter.value ? filteredSiteList.value : siteList.value
  },
  set(value) {
    if (!hasActiveFilter.value) {
      siteList.value = value
    }
  },
})

const siteUserDataMap = computed<Record<string, SiteUserData | undefined>>(() => {
  const map: Record<string, SiteUserData | undefined> = {}

  userDataList.value.forEach(userData => {
    if (userData.domain) {
      map[userData.domain] = userData
    }
  })

  return map
})

const canDragSort = computed(() => sortMode.value && !hasActiveFilter.value)
const shouldVirtualizeList = computed(() => !canDragSort.value)

// 当前筛选选项的显示信息
const currentFilter = computed(() => {
  return filterOptions.value.find(option => option.value === filterOption.value)
})

// 获取站点列表数据
async function fetchData(context: KeepAliveRefreshContext = {}) {
  const showLoading = !context.silent || !isRefreshed.value

  try {
    if (showLoading) {
      loading.value = true
      loadError.value = false
    }

    const [sites] = await Promise.all([
      api.get<Site[], Site[]>('site/'),
      // 站点统计在列表请求期间并行预取，减少刷新时卡片分两轮明显重绘。
      fetchSiteStats(),
    ])
    siteList.value = sites
    confirmedSiteList.value = [...sites]
    isRefreshed.value = true
    loadError.value = false
  } catch (error) {
    console.error(error)
    if (!isRefreshed.value) {
      loadError.value = true
    }
  } finally {
    if (showLoading) {
      loading.value = false
    }
  }
}

// 获取站点最新数据
async function fetchUserData() {
  try {
    userDataList.value = await api.get('site/userdata/latest')
  } catch (error) {
    console.error(error)
  }
}

// 获取站点统计数据
async function fetchSiteStats() {
  try {
    // 使用批量接口一次性获取所有站点统计数据
    const stats: SiteStatistic[] = await api.get('site/statistic')

    // 将数组转换为以domain为键的对象
    const statsMap: Record<string, SiteStatistic> = {}
    stats.forEach(stat => {
      if (stat.domain) {
        statsMap[stat.domain] = stat
      }
    })
    siteStatsList.value = statsMap
  } catch (error) {
    console.error('Failed to fetch site statistics:', error)
    siteStatsList.value = {}
  }
}

// 根据站点统计数据判断连接状态
function getConnectionStatus(domain: string) {
  const stats = siteStatsList.value[domain]
  if (!stats || Object.keys(stats).length === 0) {
    return 'unknown'
  }
  if (stats.lst_state === 1) {
    return 'failed'
  } else if (stats.lst_state === 0) {
    if (!stats.seconds) return 'unknown'
    if (stats.seconds >= 5) return 'slow'
    return 'connected'
  }
  return 'unknown'
}

// 保存站点排序
async function savaSitesPriority() {
  // 只在显示全部站点时允许排序（状态筛选或关键词过滤都会隐藏站点，重排会打乱其顺序）
  if (hasActiveFilter.value || savingPriority.value) {
    return
  }

  const submittedSiteList = [...draggableSiteList.value]
  const priorities = submittedSiteList.map((site, index) => ({ id: site.id, pri: index + 1 }))
  savingPriority.value = true
  try {
    await api.post<null>('site/priorities', priorities)
    siteList.value = [...submittedSiteList]
    confirmedSiteList.value = [...submittedSiteList]
  } catch (error) {
    console.error(error)
    siteList.value = [...confirmedSiteList.value]
    await fetchData()
  } finally {
    savingPriority.value = false
  }
}

// 处理站点统计数据刷新请求
async function handleRefreshStats(domain?: string) {
  if (domain) {
    // 刷新特定站点的统计数据
    try {
      const stats = await api.get<SiteStatistic, SiteStatistic>(`site/statistic/${domain}`)
      siteStatsList.value[domain] = stats
    } catch (error) {
      console.error(`Failed to refresh stats for ${domain}:`, error)
    }
  } else {
    // 刷新所有站点统计数据
    await fetchSiteStats()
  }
}

// 更新站点事件时
function onSiteSave() {
  fetchData()
}

// 选择筛选选项
function selectFilter(value: string) {
  filterOption.value = value
  filterMenu.value = false
}

function toggleSortMode() {
  if (hasActiveFilter.value) return
  sortMode.value = !sortMode.value
}

function openSiteAddDialog() {
  openSharedDialog(
    SiteAddEditDialog,
    { oper: 'add' },
    {
      save: onSiteSave,
    },
    { closeOn: ['close', 'save'] },
  )
}

function openSiteImportDialog() {
  openSharedDialog(
    SiteImportDialog,
    {},
    {
      'import-success': fetchData,
    },
    { closeOn: ['update:modelValue'] },
  )
}

function openSiteStatisticsDialog() {
  openSharedDialog(SiteStatisticsDialog, { sites: siteList.value }, {}, { closeOn: ['update:modelValue'] })
}

// 导出站点数据
async function exportSites() {
  try {
    // 获取所有站点数据
    const sites: Site[] = await api.get('site/')

    // 创建导出数据，只包含必要的字段
    const exportData = sites.map((site: Site) => ({
      name: site.name,
      domain: site.domain,
      url: site.url,
      rss: site.rss,
      downloader: site.downloader,
      cookie: site.cookie,
      apikey: site.apikey,
      token: site.token,
      ua: site.ua,
      proxy: site.proxy,
      filter: site.filter,
      render: site.render,
      public: site.public,
      note: site.note,
      timeout: site.timeout,
      limit_interval: site.limit_interval,
      limit_count: site.limit_count,
      limit_seconds: site.limit_seconds,
      is_active: site.is_active,
      pri: site.pri,
    }))

    // 创建Blob对象
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })

    // 创建下载链接
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `sites_export_${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    // 显示成功提示
    $toast.success(t('site.messages.exportSuccess'))
  } catch (error) {
    console.error('Export sites failed:', error)
    $toast.error(t('site.messages.exportFailed'))
  }
}

// 加载时获取数据
onBeforeMount(() => {
  fetchData()
  fetchUserData()
})

useKeepAliveRefresh(async context => {
  if (loading.value) return

  await Promise.all([fetchData(context), fetchUserData()])
})

watch(
  () => filterOption.value,
  value => {
    if (value !== 'all' && sortMode.value) {
      sortMode.value = false
    }
  },
  { immediate: true },
)

// 关键词过滤生效时同样退出排序模式，避免拖拽在隐藏站点的情况下保存顺序。
watch(normalizedQuery, value => {
  if (value && sortMode.value) {
    sortMode.value = false
  }
})

const shouldShowFloatingActions = computed(() => route.path === '/site' && isRefreshed.value && canManage.value)

// App 模式下将站点操作收纳到 Footer 动态菜单中，和插件页保持一致。
const siteDynamicMenuItems = computed<DynamicButtonMenuItem[]>(() => [
  {
    titleKey: 'site.actions.add',
    icon: 'mdi-web-plus',
    permission: 'manage',
    action: openSiteAddDialog,
  },
  {
    titleKey: 'site.actions.import',
    icon: 'mdi-import',
    permission: 'manage',
    action: openSiteImportDialog,
  },
  {
    titleKey: 'site.actions.export',
    icon: 'mdi-export',
    permission: 'manage',
    action: exportSites,
  },
  {
    titleKey: 'site.statistics',
    icon: 'mdi-chart-line',
    permission: 'manage',
    action: openSiteStatisticsDialog,
  },
])

// 使用动态按钮钩子
useDynamicButton({
  icon: 'mdi-web-plus',
  onClick: openSiteAddDialog,
  menuItems: siteDynamicMenuItems,
  permission: 'manage',
  show: computed(() => appMode.value && shouldShowFloatingActions.value),
})

useNativePageHeader({
  actions: computed(() => [
    {
      title: t('common.filter'),
      icon: 'mdi-filter-multiple-outline',
      dataAttr: 'site-filter-btn',
      panel: () => ({
        title: t('common.filter'),
        sections: [
          {
            id: 'site-filter',
            items: filterOptions.value.map(option => ({
              id: option.value,
              title: option.label,
              icon: option.icon,
              selected: filterOption.value === option.value,
              invoke: () => selectFilter(option.value),
            })),
          },
        ],
      }),
      action: () => {
        filterMenu.value = true
      },
    },
    {
      title: t('file.sort'),
      icon: 'mdi-sort-variant',
      permission: 'manage',
      action: toggleSortMode,
    },
  ]),
})
</script>

<template>
  <div class="card-list-container">
    <!-- 页面标题和筛选/排序按钮 -->
    <div class="d-flex justify-space-between align-center mb-3" data-native-page-heading>
      <VPageContentTitle :title="t('navItems.siteManager')" class="my-0" style="margin-block: 0" />
      <!-- 右侧按钮组：保留筛选和排序，其他页面动作移到 FAB -->
      <div class="d-flex align-center gap-1">
        <!-- 筛选按钮 -->
        <VMenu
          v-model="filterMenu"
          :activator="siteFilterActivator"
          offset-y
          :close-on-content-click="false"
          location="bottom end"
        >
          <!-- 原生模式只保留可访问的外部锚点；隐藏按钮的 aria-owns 会使 WebKit 连带隐藏菜单。 -->
          <template v-if="!nativeChromeActive" #activator="{ props }">
            <IconBtn v-bind="props" :variant="filterOption === 'all' ? 'text' : 'tonal'" :color="currentFilter?.color">
              <VIcon :icon="currentFilter?.icon || 'mdi-filter'" />
            </IconBtn>
          </template>
          <!-- 筛选菜单 -->
          <VCard min-width="200">
            <VList class="px-2">
              <VListSubheader>{{ t('common.filter') }}</VListSubheader>
              <VListItem
                v-for="option in filterOptions"
                :key="option.value"
                :active="filterOption === option.value"
                @click="selectFilter(option.value)"
              >
                <template #prepend>
                  <VIcon :icon="option.icon" :color="option.color" />
                </template>
                <VListItemTitle>{{ option.label }}</VListItemTitle>
                <template #append>
                  <VIcon v-if="filterOption === option.value" icon="mdi-check" color="primary" />
                </template>
              </VListItem>
            </VList>
          </VCard>
        </VMenu>
        <!-- 排序按钮 -->
        <IconBtn
          variant="text"
          :color="sortMode ? 'warning' : 'gray'"
          :disabled="hasActiveFilter"
          @click="toggleSortMode"
        >
          <VIcon icon="mdi-sort-variant" />
        </IconBtn>
      </div>
    </div>

    <VAlert v-if="sortMode" color="warning" variant="tonal" class="mb-4 py-0 app-surface-static">
      <div class="d-flex flex-wrap align-center justify-space-between gap-2 py-5">
        <span>{{ t('common.sortModeHint') }}</span>
        <VBtn variant="tonal" color="error" @click="sortMode = false">
          {{ t('common.exit') }}
        </VBtn>
      </div>
    </VAlert>

    <!-- 关键词过滤提示条：从资源搜索页「去配置 / 去更新」跳转而来时，明确当前列表是筛选结果 -->
    <div v-if="queryFilter" class="site-query-filter mb-3" role="status">
      <VIcon icon="mdi-filter-variant" size="16" aria-hidden="true" />
      <span class="site-query-filter__text">{{ t('site.filteringBy', { q: queryFilter }) }}</span>
      <VBtn size="x-small" variant="text" color="warning" class="site-query-filter__clear" @click="clearQueryFilter">
        {{ t('site.clearFilter') }}
      </VBtn>
    </div>

    <LoadingBanner v-if="!isRefreshed && !loadError" class="mt-12" />
    <Draggable
      v-if="draggableSiteList.length > 0 && canDragSort"
      v-model="draggableSiteList"
      :disabled="savingPriority"
      @end="savaSitesPriority"
      item-key="id"
      tag="div"
      :component-data="{ 'class': 'grid gap-4 grid-site-card px-2' }"
    >
      <template #item="{ element }">
        <SiteCard
          :class="{ 'site-card--query-match': normalizedQuery && matchesQueryFilter(element) }"
          :site="element"
          :data="siteUserDataMap[element.domain]"
          :stats="siteStatsList[element.domain] || {}"
          :sortable="true"
          @remove="fetchData"
          @update="fetchData"
          @refresh-stats="handleRefreshStats"
        />
      </template>
    </Draggable>
    <ProgressiveCardGrid
      v-else-if="draggableSiteList.length > 0 && shouldVirtualizeList"
      :items="draggableSiteList"
      :get-item-key="item => item.id"
      :min-item-width="256"
      :estimated-item-height="168"
      class="px-2"
    >
      <template #default="{ item }">
        <SiteCard
          :class="{ 'site-card--query-match': normalizedQuery && matchesQueryFilter(item) }"
          :site="item"
          :data="siteUserDataMap[item.domain]"
          :stats="siteStatsList[item.domain] || {}"
          :sortable="false"
          @remove="fetchData"
          @update="fetchData"
          @refresh-stats="handleRefreshStats"
        />
      </template>
    </ProgressiveCardGrid>
  </div>
  <NoDataFound
    v-if="loadError && !isRefreshed"
    error-code="500"
    :error-title="t('common.serverConnectionFailed')"
    :error-description="t('common.troubleshooting')"
  >
    <template #button>
      <VBtn color="primary" variant="tonal" @click="fetchData()">
        {{ t('common.retry') }}
      </VBtn>
    </template>
  </NoDataFound>
  <NoDataFound
    v-if="draggableSiteList.length === 0 && isRefreshed"
    error-code="404"
    :error-title="hasActiveFilter ? t('common.noMatchingData') : t('site.noSites')"
    :error-description="hasActiveFilter ? t('common.tryChangingFilters') : t('site.sitesWillBeShownHere')"
  />
  <!-- 新增站点按钮 -->
  <Teleport to="body" v-if="route.path === '/site'">
    <div v-if="shouldShowFloatingActions && !appMode" class="compact-fab-stack">
      <VFab
        icon="mdi-chart-line"
        color="info"
        variant="tonal"
        appear
        class="compact-fab compact-fab--secondary"
        @click="openSiteStatisticsDialog"
      />
      <VFab
        icon="mdi-export"
        color="warning"
        variant="tonal"
        appear
        class="compact-fab compact-fab--secondary"
        @click="exportSites"
      />
      <VFab
        icon="mdi-import"
        color="success"
        variant="tonal"
        appear
        class="compact-fab compact-fab--secondary"
        @click="openSiteImportDialog"
      />
      <VFab
        icon="mdi-web-plus"
        color="primary"
        appear
        class="compact-fab compact-fab--primary"
        @click="openSiteAddDialog"
      />
    </div>
  </Teleport>
</template>

<style scoped>
/* 关键词过滤提示条：与警告条同一套 warning 语汇，避免被当成普通信息条忽略。 */
.site-query-filter {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px 6px 12px;
  border: 1px solid rgba(var(--v-theme-warning), 0.26);
  border-radius: 10px;
  background: rgba(var(--v-theme-warning), 0.08);
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-size: 12.5px;
}

.site-query-filter :deep(.v-icon) {
  color: rgb(var(--v-theme-warning));
}

.site-query-filter__text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-query-filter__clear {
  flex: 0 0 auto;
  margin-inline-start: auto;
}

/* 命中高亮：只加外层描边 + 极淡底色，不改 SiteCard 内部结构。 */
.site-card--query-match {
  border-radius: 12px;
  outline: 1px solid rgba(var(--v-theme-warning), 0.45);
  outline-offset: 2px;
  background: rgba(var(--v-theme-warning), 0.04);
}
</style>

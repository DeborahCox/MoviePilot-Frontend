<script setup lang="ts">
import api from '@/api'
import type { DashboardRecentImport, TransferHistory } from '@/api/types'
import noImage from '@images/no-image.jpeg'
import { formatDateDifference, formatFileSize } from '@/@core/utils/formatters'
import { useI18n } from 'vue-i18n'
import { formatMusicAudioSpecs } from '@/utils/music'
import { useKeepAliveRefresh } from '@/composables/useKeepAliveRefresh'
import { getProxyImageUrl } from '@/utils/imageUtils'
import { buildUserPermissionContext, hasFeaturePermission, PERMISSION_FEATURE } from '@/utils/permission'
import { useUserStore } from '@/stores'

const { t } = useI18n()
const canViewHistory = computed(() => {
  const userStore = useUserStore()
  return hasFeaturePermission(
    buildUserPermissionContext(userStore.superUser, userStore.permissions),
    PERMISSION_FEATURE.MANAGE_HISTORY,
    'manage',
  )
})

// 仪表板最多展示十条记录，超出部分通过列表滚动查看。
const RECENT_IMPORT_LIMIT = 10

// 最近成功整理入库的记录。
const recentImports = ref<DashboardRecentImport[]>([])

/** 识别旧后端缺少聚合接口时返回的 404，而不是把版本差异当作普通请求失败。 */
function isNotFoundError(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== 'object' || depth > 2) return false
  const candidate = error as { status?: unknown; response?: { status?: unknown }; cause?: unknown }
  if (candidate.status === 404 || candidate.response?.status === 404) return true
  return isNotFoundError(candidate.cause, depth + 1)
}

/** 将旧版整理历史映射为仪表盘卡片数据，避免旧后端刷新时弹出 404。 */
function mapLegacyImport(history: TransferHistory): DashboardRecentImport {
  const size = Number(history.src_fileitem?.size ?? 0)
  return {
    id: history.id,
    title: history.title,
    year: history.year,
    image: history.image,
    type: history.type,
    seasons: history.seasons,
    episodes: history.episodes,
    date: history.date,
    size: size > 0 ? size : null,
    audio_specs: history.type === '音乐' ? formatMusicAudioSpecs(history) || null : null,
  }
}

/** 查询最近成功整理的媒体记录，优先使用脱敏聚合接口并兼容旧后端。 */
async function loadRecentImports() {
  try {
    const response = await api.get<DashboardRecentImport[]>('dashboard/recent-imports', {
      params: { count: RECENT_IMPORT_LIMIT },
      feedback: 'silent',
    })
    recentImports.value = Array.isArray(response) ? response.slice(0, RECENT_IMPORT_LIMIT) : []
    return
  } catch (error) {
    if (!isNotFoundError(error)) {
      console.error(error)
      return
    }
  }

  // 旧后端没有脱敏聚合接口；管理员仍可通过整理历史读取同样的卡片数据。
  try {
    const response = await api.get<{ list?: TransferHistory[] }>('history/transfer', {
      params: { page: 1, count: RECENT_IMPORT_LIMIT, status: true },
      feedback: 'silent',
    })
    recentImports.value = (response?.list ?? []).slice(0, RECENT_IMPORT_LIMIT).map(mapLegacyImport)
  } catch (error) {
    console.error(error)
  }
}

/** 返回经过后端图片代理的海报地址。 */
function getPosterUrl(item: DashboardRecentImport) {
  if (!item.image) return noImage

  return getProxyImageUrl(item.image, { maxWidth: 185, quality: 80 })
}

/** 组合媒体类型、季集和文件大小作为记录副标题。 */
function getImportMeta(item: DashboardRecentImport) {
  const values = [item.type, item.seasons, item.episodes]
  if (item.type === '音乐' && item.audio_specs) {
    values.push(formatMusicAudioSpecs({ audio_specs: item.audio_specs ?? undefined }))
  }
  const fileSize = Number(item.size ?? 0)
  if (fileSize > 0) values.push(formatFileSize(fileSize))

  return values.filter(Boolean).join(' · ')
}

const { refresh: refreshRecentImports } = useKeepAliveRefresh(loadRecentImports)

onMounted(refreshRecentImports)
</script>

<template>
  <VCard class="dashboard-list-card dashboard-work-card dashboard-grid-fill">
    <VCardItem class="dashboard-card-heading">
      <VCardTitle>{{ t('dashboard.recentImports') }}</VCardTitle>
      <template #append>
        <VBtn v-if="canViewHistory" size="small" variant="outlined" to="/history">
          {{ t('dashboard.viewAll') }}
        </VBtn>
      </template>
    </VCardItem>

    <VCardText class="recent-import-list">
      <!-- 非空列表作为自然内容尺寸源；超过卡片可用高度时由列表容器滚动。 -->
      <div v-if="recentImports.length > 0" data-layout-size-source>
        <div v-for="item in recentImports" :key="item.id" class="recent-import-item">
          <VImg :src="getPosterUrl(item)" :alt="item.title ?? undefined" class="recent-import-poster" cover />
          <div class="recent-import-copy">
            <div class="recent-import-title">
              {{ item.title }}<span v-if="item.year"> ({{ item.year }})</span>
            </div>
            <div class="recent-import-meta">{{ getImportMeta(item) }}</div>
          </div>
          <div class="recent-import-time">
            {{ item.date ? formatDateDifference(item.date) : '' }}
            <VIcon icon="mdi-check-circle" color="success" size="16" />
          </div>
        </div>
      </div>

      <div v-if="recentImports.length === 0" class="recent-import-empty text-medium-emphasis">
        <VIcon icon="mdi-movie-open-plus-outline" size="32" />
        <span>{{ t('dashboard.noRecentImports') }}</span>
      </div>
    </VCardText>
  </VCard>
</template>

<style scoped>
.dashboard-list-card {
  display: flex;
  flex-direction: column;
  block-size: 100%;
  max-block-size: 350px;
  min-block-size: 350px;
}

.dashboard-card-heading {
  padding-block: 0.9rem 0.55rem;
}

.recent-import-list {
  display: flex;
  overflow: hidden auto;
  flex: 1 1 auto;
  flex-direction: column;
  min-block-size: 0;
  overscroll-behavior: contain;
  padding-block-start: 0.25rem;
  scrollbar-width: none;
}

.recent-import-item {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.75rem;
  min-block-size: 62px;
  padding-block: 0.4rem;
}

.recent-import-item + .recent-import-item {
  border-block-start: 1px solid rgba(var(--v-border-color), calc(var(--v-border-opacity) * 0.7));
}

.recent-import-poster {
  border-radius: 6px;
  block-size: 54px;
  inline-size: 40px;
}

.recent-import-copy {
  min-inline-size: 0;
}

.recent-import-title {
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 0.875rem;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-import-meta,
.recent-import-time {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.72rem;
}

.recent-import-meta {
  overflow: hidden;
  margin-block-start: 0.2rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-import-time {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  white-space: nowrap;
}

.recent-import-empty {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 0.5rem;
}

@supports not (scrollbar-width: none) {
  .recent-import-list::-webkit-scrollbar {
    display: none;
  }
}
</style>

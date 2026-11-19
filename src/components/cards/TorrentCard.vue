<script lang="ts" setup>
import type { PropType } from 'vue'
import { formatFileSize, formatDateDifference } from '@/@core/utils/formatters'
import api from '@/api'
import type { Context } from '@/api/types'
import { isNullOrEmptyObject } from '@/@core/utils'
import { getCachedSiteIcon } from '@/utils/siteIconCache'
import { downloadedTorrentMap, markTorrentDownloaded } from '@/utils/torrentDownloadCache'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useGlobalSettingsStore } from '@/stores'
import { getDisplayImageUrl } from '@/utils/imageUtils'
import {
  buildTorrentDownloadProps,
  getTorrentTitle,
  getTorrentPromotionKind,
  type TorrentPromotionKind,
} from '@/utils/torrent'
import MusicMatchBadge from '@/components/misc/MusicMatchBadge.vue'

const AddDownloadDialog = defineAsyncComponent(() => import('../dialog/AddDownloadDialog.vue'))
const TorrentMoreSourcesDialog = defineAsyncComponent(() => import('../dialog/TorrentMoreSourcesDialog.vue'))

// 输入参数
const props = defineProps({
  torrent: Object as PropType<Context>,
  more: Array as PropType<Context[]>,
  width: String,
  height: String,
  targetMusicType: String,
  // 由页面统一持有的筛选状态；卡片只读取选中态，不缓存自己的副本
  filterForm: Object as PropType<Record<string, string[]>>,
})

const emit = defineEmits<{
  'toggle-filter': [key: string, value: string]
}>()

const globalSettingsStore = useGlobalSettingsStore()

// 种子信息
const torrent = ref(props.torrent?.torrent_info)
const promotionKind = computed(() => getTorrentPromotionKind(torrent.value))

// 识别元数据
const meta = ref(props.torrent?.meta_info)

// 当前下载项
const downloadItem = ref(props.torrent)

// 站点图标
const siteIcons = ref<Record<number, string>>({})

const isDownloaded = computed(() => Boolean(torrent.value?.enclosure && downloadedTorrentMap[torrent.value.enclosure]))

// 添加下载成功
function addDownloadSuccess(url: string) {
  markTorrentDownloaded(url)
}

// 添加下载失败
function addDownloadError(error: string) {
  console.error(error)
}

// 查询站点图标
async function getSiteIcon(site: number | undefined) {
  if (!site) return

  try {
    const icon = await getCachedSiteIcon(site, async () => {
      try {
        const response = await api.get<{ icon?: string }>(`site/icon/${site}`, { feedback: 'silent' })
        return response?.icon || ''
      } catch (error) {
        console.error(error)
        return ''
      }
    })
    siteIcons.value[site] = getDisplayImageUrl(icon, globalSettingsStore.globalSettings.GLOBAL_IMAGE_CACHE)
  } catch (error) {
    console.error(error)
    siteIcons.value[site] = ''
  }
}

/** 待确认音乐只提交资源本身，已确认资源沿用媒体身份下载。 */
async function handleAddDownload(item: Context | null = null) {
  if (item && !isNullOrEmptyObject(item)) {
    downloadItem.value = item
  }
  // 打开下载对话框
  openSharedDialog(
    AddDownloadDialog,
    buildTorrentDownloadProps(downloadItem.value, props.targetMusicType),
    {
      done: addDownloadSuccess,
      error: addDownloadError,
    },
    { closeOn: ['close', 'done', 'error'] },
  )
}

// 打开种子详情页面
function openTorrentDetail(item: Context | null = null) {
  const pageUrl = item && !isNullOrEmptyObject(item) ? item.torrent_info?.page_url : torrent.value?.page_url
  if (pageUrl) {
    window.open(pageUrl, '_blank')
  }
}

/** 为已确认的促销选择样式，未知倍率不落入免费颜色。 */
function getPromotionClass(kind?: TorrentPromotionKind) {
  return kind ? { free: 'bg-success', discount: 'bg-orange', bonus: 'bg-purple', other: '' }[kind] : ''
}

/** 只有站点明确标注的字幕能作为筛选入口，其余标签保持静态。 */
const clickableSubtitleLabels = new Set(['中字', '特效'])

interface FilterTag {
  key: string
  value: string
  dimension: string
  className: string
  selected: boolean
}

/** 白名单按来源字段/class 判定，不按文案猜测；同值重复只保留第一个可点入口。 */
function createFilterTag(key: string, value: string | undefined, dimension: string, className: string): FilterTag | null {
  if (!value) return null
  return {
    key,
    value,
    dimension,
    className,
    selected: Boolean(props.filterForm?.[key]?.includes(value)),
  }
}

const metaFilterTags = computed(() =>
  [
    createFilterTag('webSource', meta.value?.web_source, '流媒体', 'chip-web-source'),
    createFilterTag('edition', meta.value?.edition, '版本', 'chip-edition'),
    createFilterTag('resolution', meta.value?.resource_pix, '分辨率', 'chip-resolution'),
    createFilterTag('videoCode', meta.value?.video_encode, '编码', 'chip-codec'),
    createFilterTag('releaseGroup', meta.value?.resource_team, '制作组', 'chip-team'),
  ].filter((tag): tag is FilterTag => tag !== null),
)

const labelFilterTags = computed(() => {
  const seen = new Set<string>()
  return (torrent.value?.labels ?? []).map(label => {
    const eligible = clickableSubtitleLabels.has(label)
    const isFirst = eligible && !seen.has(label)
    if (eligible) seen.add(label)
    return {
      label,
      tag: isFirst ? createFilterTag('subtitle', label, '字幕', 'chip-label') : null,
    }
  })
})

function filterTagAttrs(tag: FilterTag | null) {
  if (!tag) return {}
  return {
    role: 'checkbox',
    'aria-checked': tag.selected,
    'aria-label': `按${tag.dimension} ${tag.value} 筛选`,
    tabindex: 0,
  }
}

function filterTagClasses(tag: FilterTag | null) {
  return tag ? ['filter-tag-chip', tag.selected ? 'filter-tag-chip--selected' : ''] : []
}

/** 卡片不拥有筛选状态，只把原串交给页面由 handleFilterFormUpdate 统一处理。 */
function toggleFilterTag(tag: FilterTag | null) {
  if (tag) emit('toggle-filter', tag.key, tag.value)
}

/** VChip 会把 Enter/Space 转成一次 click，键盘路径改由 keydown 独占，避免双触发。 */
function handleTagClick(tag: FilterTag | null, event?: Event) {
  if (event instanceof KeyboardEvent) return
  toggleFilterTag(tag)
}

// 打开更多来源对话框
async function openMoreTorrentsDialog() {
  props.more?.forEach(t => {
    return getSiteIcon(t.torrent_info?.site)
  })
  openSharedDialog(
    TorrentMoreSourcesDialog,
    {
      items: props.more || [],
      siteIcons: siteIcons.value,
    },
    {
      download: handleAddDownload,
      detail: openTorrentDetail,
    },
    { closeOn: ['close', 'update:modelValue'] },
  )
}

watch(
  () => props.torrent,
  value => {
    torrent.value = value?.torrent_info
    meta.value = value?.meta_info
    downloadItem.value = value
    getSiteIcon(value?.torrent_info?.site)
  },
  { immediate: true },
)
</script>

<template>
  <!-- Hover 命中区域保持静止，避免卡片上浮后底边反复触发 mouseleave。 -->
  <div class="torrent-card-hover-area h-full">
    <VCard
      :width="props.width || '100%'"
      :variant="isDownloaded ? 'outlined' : 'flat'"
      @click="handleAddDownload(props.torrent)"
      class="app-hover-lift-card h-full cursor-pointer d-flex flex-column overflow-hidden torrent-card"
      :class="{ 'border-success border-2 opacity-85': isDownloaded }"
      hover
    >
      <!-- 优惠标签 -->
      <div
        v-if="promotionKind"
        class="discount-banner text-white px-2 py-1 text-sm font-weight-bold rounded-bl-lg"
        :class="getPromotionClass(promotionKind)"
      >
        {{ torrent?.volume_factor }}
      </div>

      <!-- 媒体标题 -->
      <VCardItem class="pt-3 pb-0">
        <div class="d-flex flex-row flex-wrap justify-start align-center mb-2 pr-8">
          <span class="text-h6 font-weight-bold me-2 torrent-heading">
            {{ getTorrentTitle(props.torrent) }}
          </span>
          <MusicMatchBadge :context="props.torrent" />
          <VChip
            v-if="meta?.season_episode"
            class="chip-season rounded-sm font-weight-bold"
            variant="elevated"
            size="small"
          >
            {{ meta?.season_episode }}
          </VChip>
        </div>

        <!-- 站点信息条 -->
        <div class="d-flex justify-space-between align-center flex-wrap">
          <div class="d-flex align-center">
            <VImg
              v-if="siteIcons[torrent?.site || 0]"
              :src="siteIcons[torrent?.site || 0]"
              :alt="torrent?.site_name"
              class="mr-2 rounded"
              width="20"
              height="20"
            />
            <VAvatar v-else size="20" class="mr-2 text-caption bg-surface-variant" color="surface-variant">
              {{ torrent?.site_name?.substring(0, 1) }}
            </VAvatar>
            <span class="font-weight-bold text-body-2">{{ torrent?.site_name }}</span>
          </div>

          <div class="d-flex align-center gap-3">
            <span v-if="torrent?.seeders" class="d-flex align-center font-weight-bold">
              <VIcon size="small" color="success" icon="mdi-arrow-up" class="mr-1"></VIcon>
              {{ torrent?.seeders }}
            </span>
            <span v-if="torrent?.peers" class="d-flex align-center font-weight-bold">
              <VIcon size="small" color="warning" icon="mdi-arrow-down" class="mr-1"></VIcon>
              {{ torrent?.peers }}
            </span>
          </div>
        </div>
      </VCardItem>

      <!-- 种子内容 -->
      <VCardText class="d-flex flex-column flex-grow-1 pa-3 overflow-hidden">
        <!-- 种子标题 -->
        <div class="text-subtitle-2 text-high-emphasis font-weight-medium mb-1 break-all" :title="torrent?.title">
          {{ torrent?.title }}
        </div>

        <!-- 种子描述 -->
        <div
          v-if="meta?.subtitle || torrent?.description"
          class="text-body-2 text-medium-emphasis mb-2 break-all"
          :title="meta?.subtitle || torrent?.description"
        >
          {{ meta?.subtitle || torrent?.description }}
        </div>

        <!-- 发布时间 -->
        <div v-if="torrent?.pubdate" class="d-flex align-center justify-start mb-2">
          <VIcon size="small" color="grey" icon="mdi-clock-outline" class="me-1"></VIcon>
          <span class="text-sm text-medium-emphasis">{{ formatDateDifference(torrent.pubdate) }}</span>
        </div>

        <!-- 资源标签区：白名单标签可点击筛选，其余保持静态 -->
        <div class="d-flex flex-wrap gap-1 mb-2 card-filter-tags">
          <VChip
            v-for="tag in metaFilterTags"
            :key="tag.key"
            :class="[tag.className, 'rounded-sm', ...filterTagClasses(tag)]"
            size="x-small"
            variant="elevated"
            v-bind="filterTagAttrs(tag)"
            @click.stop="handleTagClick(tag, $event)"
            @keydown.enter.space.stop.prevent="toggleFilterTag(tag)"
          >
            <span class="filter-tag-label">{{ tag.value }}</span>
            <span class="filter-tag-slot" aria-hidden="true">
              <svg class="filter-tag-funnel" viewBox="0 0 24 24"><path d="M3,4H21L14,12V19L10,21V12L3,4Z" /></svg>
              <svg class="filter-tag-check" viewBox="0 0 24 24"><path d="M9,16.17L4.83,12L3.41,13.41L9,19L21,7L19.59,5.59L9,16.17Z" /></svg>
            </span>
          </VChip>

          <!-- 其他标签：仅「中字」「特效」按字幕维度可筛选，且同值只第一个可点 -->
          <VChip
            v-for="(entry, index) in labelFilterTags"
            :key="`label-${index}`"
            :class="['chip-label', 'rounded-sm', ...filterTagClasses(entry.tag)]"
            size="x-small"
            variant="elevated"
            v-bind="filterTagAttrs(entry.tag)"
            @click.stop="handleTagClick(entry.tag, $event)"
            @keydown.enter.space.stop.prevent="toggleFilterTag(entry.tag)"
          >
            <template v-if="entry.tag">
              <span class="filter-tag-label">{{ entry.label }}</span>
              <span class="filter-tag-slot" aria-hidden="true">
                <svg class="filter-tag-funnel" viewBox="0 0 24 24"><path d="M3,4H21L14,12V19L10,21V12L3,4Z" /></svg>
                <svg class="filter-tag-check" viewBox="0 0 24 24"><path d="M9,16.17L4.83,12L3.41,13.41L9,19L21,7L19.59,5.59L9,16.17Z" /></svg>
              </span>
            </template>
            <template v-else>{{ entry.label }}</template>
          </VChip>

          <!-- 特殊标签保持静态 -->
          <VChip v-if="torrent?.hit_and_run" class="chip-hr rounded-sm" size="x-small" variant="elevated">H&R</VChip>
          <VChip v-if="torrent?.freedate_diff" class="chip-expire rounded-sm" size="x-small" variant="elevated">
            {{ torrent?.freedate_diff }}
          </VChip>
        </div>
      </VCardText>

      <!-- 卡片底部信息 -->
      <VCardActions class="border-t border-opacity-10 mt-auto pa-2">
        <div v-if="props.more && props.more.length > 0">
          <VBtn
            variant="text"
            color="primary"
            size="small"
            class="pa-1 d-flex align-center"
            @click.stop="openMoreTorrentsDialog"
          >
            <VIcon icon="mdi-chevron-down" size="small" class="mr-1"></VIcon>
            更多来源 ({{ props.more.length }})
          </VBtn>
        </div>

        <VSpacer />

        <!-- 体积和详情按钮并排 -->
        <div class="d-flex align-center">
          <VChip v-if="torrent?.size" color="primary" size="x-small" variant="elevated" class="rounded-sm mr-2">
            {{ formatFileSize(torrent.size) }}
          </VChip>
          <VBtn icon size="small" variant="text" color="primary" @click.stop="openTorrentDetail()">
            <VIcon icon="mdi-information-outline"></VIcon>
          </VBtn>
        </div>
      </VCardActions>
    </VCard>
  </div>
</template>

<style scoped>
.torrent-heading {
  max-inline-size: 100%;
  min-inline-size: 0;
  overflow-wrap: anywhere;
}

.discount-banner {
  position: absolute;
  inset-block-start: 0;
  inset-inline-end: 0;
}

.torrent-card-hover-area {
  inline-size: 100%;
}

/* 卡片悬停效果 */
.torrent-card {
  border: var(--app-card-light-border);
}

.torrent-card-hover-area:hover .torrent-card {
  border-color: rgba(var(--v-theme-primary), 0.3);
  transform: translate3d(0, -0.25rem, 0);
}

/* 优惠标签样式 */
.bg-success {
  background-color: #4caf50;
}

.bg-orange {
  background-color: #ff5722;
}

.bg-purple {
  background-color: #9c27b0;
}

.chip-season {
  background-color: #3f51b5;
  color: white;
}

.chip-web-source {
  background-color: #8000ff;
  color: white;
}

.chip-edition {
  background-color: #f44336;
  color: white;
}

.chip-resolution {
  background-color: #7b1fa2;
  color: white;
}

.chip-codec {
  background-color: #ff9800;
  color: white;
}

.chip-team {
  background-color: #00897b;
  color: white;
}

.chip-label {
  background-color: #5c6bc0;
  color: white;
}

.chip-hr {
  background-color: #212121;
  color: white;
}

.chip-expire {
  background-color: #7e57c2;
  color: white;
}

.chip-free {
  background-color: #4caf50;
  color: white;
}

.chip-discount {
  background-color: #ff5722;
  color: white;
}

.chip-bonus {
  background-color: #9c27b0;
  color: white;
}

/* ===== 卡片标签筛选：保留分类色底，只叠加主色双环与常驻槽位 ===== */
.card-filter-tags > .v-chip:not(.filter-tag-chip) {
  pointer-events: none;
}

.filter-tag-chip {
  position: relative;
  cursor: pointer;
  transition: box-shadow 180ms ease-out, filter 180ms ease-out;
}

.filter-tag-chip:hover {
  filter: brightness(1.1);
  box-shadow: 0 0 0 2px rgba(var(--v-theme-primary), 0.18);
}

.filter-tag-chip:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

.filter-tag-chip--selected,
.filter-tag-chip--selected:hover {
  font-weight: 600 !important;
  box-shadow: 0 0 0 2px rgb(var(--v-theme-surface)), 0 0 0 4px rgb(var(--v-theme-primary)) !important;
}

.filter-tag-chip--selected:focus-visible {
  outline-offset: 6px;
}

.filter-tag-label {
  pointer-events: none;
}

.filter-tag-slot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  inline-size: 14px;
  block-size: 14px;
  margin-inline-start: 3px;
  border-radius: 50%;
}

.filter-tag-funnel,
.filter-tag-check {
  inline-size: 10px;
  block-size: 10px;
  fill: rgb(var(--v-theme-on-primary));
}

.filter-tag-funnel {
  opacity: 0.55;
  transition: opacity 180ms ease-out;
}

.filter-tag-chip:hover .filter-tag-funnel {
  opacity: 0.9;
}

.filter-tag-check {
  display: none;
}

.filter-tag-chip--selected .filter-tag-slot {
  background: rgb(var(--v-theme-primary));
}

.filter-tag-chip--selected .filter-tag-funnel {
  display: none;
}

.filter-tag-chip--selected .filter-tag-check {
  display: block;
}

@media (width <= 600px) {
  .card-filter-tags {
    gap: 12px 8px;
  }

  .filter-tag-chip::before {
    content: '';
    position: absolute;
    inset: -6px 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .filter-tag-chip,
  .filter-tag-funnel {
    transition: none;
  }
}
</style>

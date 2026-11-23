<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import TieredEditionPanel from '@/components/filter/TieredEditionPanel.vue'
import { isEditionTiered, mergeEditionOptions } from '@/composables/useEditionGroups'

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    filterForm: Record<string, string[]>
    filterKey: string
    filterOptions: Record<string, string[]>
    filterTitle: string
    modelValue?: boolean
  }>(),
  {
    modelValue: true,
  },
)

const emit = defineEmits<{
  (event: 'clearFilter', key: string): void
  (event: 'close'): void
  (event: 'selectAll', key: string): void
  (event: 'update:filterForm', key: string, values: string[]): void
  (event: 'update:modelValue', value: boolean): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

const filterValues = computed(() => props.filterForm[props.filterKey] ?? [])
const options = computed(() => props.filterOptions[props.filterKey] ?? [])

/** 只有版本维度且选项较多时启用分组清单。 */
const isTieredEdition = computed(() => isEditionTiered(options.value, props.filterKey))

/** 为移动端单项筛选显示对应分类图标。 */
function getFilterIcon(key: string) {
  const icons: Record<string, string> = {
    site: 'mdi-server-network',
    season: 'mdi-television-classic',
    freeState: 'mdi-gift-outline',
    resolution: 'mdi-monitor-screenshot',
    videoCode: 'mdi-video-vintage',
    edition: 'mdi-quality-high',
    releaseGroup: 'mdi-account-group-outline',
    webSource: 'mdi-television-play',
    subtitle: 'mdi-subtitles-outline',
  }
  return icons[key] || 'mdi-filter-variant'
}

/** 将当前筛选值变化回传给过滤条，复用页面的筛选结果。 */
function updateFilter(values: string[]) {
  emit('update:filterForm', props.filterKey, values)
}
</script>

<template>
  <VDialog
    v-if="visible"
    v-model="visible"
    max-width="25rem"
    max-height="85vh"
    location="center"
    scrollable
    data-native-sheet-size="medium"
    :aria-label="props.filterTitle"
  >
    <VCard>
      <VDialogCloseBtn v-model="visible" />
      <VCardTitle class="py-3 d-flex align-center" data-native-dialog-header>
        <VIcon :icon="getFilterIcon(props.filterKey)" class="me-2"></VIcon>
        <span data-native-dialog-title>{{ props.filterTitle }}</span>
        <template v-if="isTieredEdition">
          <span class="edition-scope">全网</span>
          <span class="edition-counter" aria-live="polite">
            已选 <b>{{ filterValues.length }}</b> / 共 {{ mergeEditionOptions(options, filterValues).length }}
          </span>
        </template>
        <VSpacer />
        <VBtn
          v-if="filterValues.length > 0"
          variant="text"
          size="small"
          color="error"
          @click.stop="emit('clearFilter', props.filterKey)"
        >
          {{ t('torrent.clear') }}
        </VBtn>
        <VBtn
          v-if="!isTieredEdition"
          class="me-10"
          variant="text"
          size="small"
          color="primary"
          @click.stop="emit('selectAll', props.filterKey)"
        >
          {{ t('torrent.selectAll') }}
        </VBtn>
      </VCardTitle>
      <VDivider />
      <VCardText :class="{ 'filter-menu-tiered': isTieredEdition }">
        <TieredEditionPanel
          v-if="isTieredEdition"
          :options="options"
          :selected="filterValues"
          density="comfortable"
          :show-head="false"
          @update:selected="updateFilter"
          @clear="emit('clearFilter', props.filterKey)"
        />

        <VChipGroup v-else :model-value="filterValues" column multiple class="filter-options" @update:model-value="updateFilter">
          <VChip
            v-for="option in options"
            :key="option"
            :value="option"
            filter
            variant="elevated"
            class="ma-1 filter-chip"
            size="small"
          >
            {{ option }}
          </VChip>
        </VChipGroup>
      </VCardText>
      <VCardActions class="app-dialog-actions">
        <VSpacer />
        <VBtn color="primary" variant="flat" prepend-icon="mdi-check" class="px-5" @click="visible = false">
          {{ t('torrent.confirm') }}<template v-if="isTieredEdition">（{{ filterValues.length }}）</template>
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>
.filter-options {
  display: flex;
  flex-wrap: wrap;
}

.filter-chip {
  border: 1px solid rgba(var(--v-theme-primary), 0.2);
  margin: 4px;
  background-color: rgba(var(--v-theme-primary), 0.1) !important;
  color: rgba(var(--v-theme-on-surface), 0.9) !important;
  font-weight: 500;
  transition: all 0.2s ease;
}

.filter-chip:hover {
  background-color: rgba(var(--v-theme-primary), 0.15) !important;
}

.filter-chip.v-chip--selected {
  background-color: rgb(var(--v-theme-primary)) !important;
  box-shadow: 0 2px 4px rgba(var(--v-theme-primary), 0.3);
  color: rgb(var(--v-theme-on-primary)) !important;
  font-weight: 600;
}

/* ===== 移动端版本分组清单：与 PC 共用原串 chip + 保守分组 ===== */
.filter-menu-tiered {
  padding: 0;
  overflow: hidden;
}

.edition-scope {
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(var(--v-theme-on-surface), 0.05);
  color: rgba(var(--v-theme-on-surface), 0.4);
  font-size: 11px;
  font-weight: 400;
  white-space: nowrap;
}

.edition-counter {
  color: rgba(var(--v-theme-on-surface), 0.52);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.edition-counter b {
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
}

</style>

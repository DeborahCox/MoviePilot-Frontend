<script setup lang="ts">
import type { ConnectionTestViewState } from '@/composables/useConnectionTest'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps({
  state: {
    type: Object as PropType<ConnectionTestViewState>,
    required: true,
  },
})

const showDetail = ref(false)

const hasResult = computed(() => props.state.connected !== null)
const failed = computed(() => hasResult.value && props.state.connected === false)
const hasErrorLog = computed(() => failed.value && !!(props.state.stack || props.state.errorType))

watch(
  () => props.state.connected,
  () => {
    showDetail.value = false
  },
)
</script>

<template>
  <div v-if="hasResult" class="connection-test-panel" :class="failed ? 'is-error' : 'is-ok'">
    <div class="d-flex align-center">
      <VIcon :icon="failed ? 'mdi-alert-circle-outline' : 'mdi-check-circle-outline'" class="me-2" />
      <span class="text-body-2">
        {{ failed ? t('connection.testFailed') : t('connection.testSuccess') }}
      </span>
      <span v-if="state.elapsedMs != null" class="text-caption text-medium-emphasis ms-2">
        {{ state.elapsedMs }} ms
      </span>
      <VSpacer />
      <VBtn
        v-if="hasErrorLog"
        variant="text"
        size="small"
        :append-icon="showDetail ? 'mdi-chevron-up' : 'mdi-chevron-down'"
        @click="showDetail = !showDetail"
      >
        {{ t('connection.errorLog') }}
      </VBtn>
    </div>
    <div v-if="failed && state.message" class="text-caption mt-1">{{ state.message }}</div>
    <VExpandTransition>
      <div v-if="showDetail && hasErrorLog" class="error-log mt-2">
        <div v-if="state.errorType" class="mb-1">
          <span class="text-medium-emphasis">{{ t('connection.errorType') }}:</span>
          <code>{{ state.errorType }}</code>
        </div>
        <pre v-if="state.stack">{{ state.stack }}</pre>
      </div>
    </VExpandTransition>
  </div>
</template>

<style scoped>
.connection-test-panel {
  border: 1px solid rgba(var(--v-border-color), 0.3);
  border-radius: 8px;
  padding: 10px 14px;
}
.connection-test-panel.is-error {
  border-color: rgba(var(--v-theme-error), 0.5);
}
.connection-test-panel.is-ok {
  border-color: rgba(var(--v-theme-success), 0.5);
}
.error-log {
  max-height: 220px;
  overflow: auto;
  background: rgba(var(--v-theme-on-surface), 0.04);
  border-radius: 6px;
  padding: 10px;
}
.error-log pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
}
.error-log code {
  font-family: var(--font-mono);
  font-size: 12px;
  margin-inline-start: 6px;
}
</style>

import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import { useI18n } from 'vue-i18n'
import { effectOptions, qualityOptions, resolutionOptions } from '@/api/constants'

/** 配置方案所需的订阅字段；完整的 Subscribe 对象天然兼容。 */
export interface SubscribeConfigurationSource {
  quality?: string
  resolution?: string
  effect?: string
  filter?: string
}

interface DisplayOption {
  title: string
  value: string
}

/** 未收录的内部代码原样展示，保证配置不会因映射表更新而丢失。 */
function resolveTitle(options: DisplayOption[], value?: string): string {
  if (!value) return ''
  return options.find(option => option.value === value)?.title || value
}

/**
 * 订阅配置方案的唯一映射入口：质量 / 分辨率 / 特效按当前语言映射，
 * 拼接过滤词；空配置回落到统一文案。编辑弹窗与订阅卡片共用此规则。
 */
export function useSubscribeConfiguration(
  source: MaybeRefOrGetter<SubscribeConfigurationSource | null | undefined>,
): ComputedRef<string> {
  const { t } = useI18n()

  return computed(() => {
    const subscribe = toValue(source)
    if (!subscribe) return t('dialog.subscribeEdit.noConfiguration')

    const configuration = [
      resolveTitle(qualityOptions.value, subscribe.quality),
      resolveTitle(resolutionOptions.value, subscribe.resolution),
      resolveTitle(effectOptions.value, subscribe.effect),
      subscribe.filter?.trim() || '',
    ]
      .filter(Boolean)
      .join(' + ')

    return configuration || t('dialog.subscribeEdit.noConfiguration')
  })
}

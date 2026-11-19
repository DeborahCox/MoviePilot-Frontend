/**
 * 版本（质量）选项的保守分组工具。
 *
 * 安全底线：这里只决定「展示在哪个组、组内顺序」，绝不改写、展开或重映射原始字符串。
 * 调用方传给 VChip 的 :value 仍必须是 filterOptions/filterForm 中的原串。
 */

export interface EditionGroup {
  id: 'uhd' | 'bd' | 'webdl' | 'web' | 'other'
  name: string
  items: string[]
}

export const EDITION_GROUP_NAMES = {
  uhd: 'UHD蓝光',
  bd: '蓝光',
  webdl: 'WEB-DL',
  web: 'WEB',
  other: '其他·未识别',
} as const

export const EDITION_GROUP_ORDER: ReadonlyArray<EditionGroup['id']> = ['uhd', 'bd', 'webdl', 'web', 'other']

/** 高频原串白名单；只与当前可见选项求交集，不改变字符串本身。 */
export const QUICK_EDITION_VALUES = [
  'UHD BluRay REMUX',
  'WEB-DL HDR',
  'UHD BluRay',
  'BluRay HDR',
  'WEB-DL HDR10+',
  'UHD BluRay REMUX DV',
] as const

type Medium = 'uhd-blu-ray' | 'blu-ray-plus' | 'blu-ray' | 'web-dl' | 'web' | 'uhd'

/** 介质词按长度优先匹配；匹配后从剩余文本中剔除，避免父子词重复计数。 */
const MEDIUM_PATTERNS: ReadonlyArray<{ medium: Medium; pattern: RegExp }> = [
  { medium: 'uhd-blu-ray', pattern: /UHD[\s_-]*BluRay(?!Plus)/gi },
  { medium: 'blu-ray-plus', pattern: /BluRayPlus/gi },
  { medium: 'web-dl', pattern: /WEB-DL/gi },
  { medium: 'blu-ray', pattern: /BluRay/gi },
  { medium: 'web', pattern: /\bWEB\b/gi },
  { medium: 'uhd', pattern: /\bUHD\b/gi },
]

const HDR_MARKERS: ReadonlyArray<{ marker: string; pattern: RegExp }> = [
  { marker: 'HDR10+', pattern: /HDR10\+/i },
  { marker: 'HDR10', pattern: /HDR10(?!\+)/i },
  { marker: 'HDR', pattern: /HDR(?!10)/i },
  { marker: 'DV', pattern: /\b(?:DV|DoVi)\b/i },
]

/** 命中多个互斥介质词时不猜测，直接进「其他·未识别」。 */
function detectMedium(value: string): EditionGroup['id'] {
  let rest = value
  const mediums = new Set<Medium>()
  for (const { medium, pattern } of MEDIUM_PATTERNS) {
    const matches = rest.match(pattern)
    if (!matches?.length) continue
    matches.forEach(() => mediums.add(medium))
    rest = rest.replace(pattern, ' ')
  }

  if (mediums.size > 1) {
    // UHD 是修饰词，只有与 BluRay 系列同时出现时才属于同一族，不算歧义。
    if (mediums.size === 2 && mediums.has('uhd')) {
      const others = [...mediums].filter(medium => medium !== 'uhd')
      if (others.length === 1 && others[0]?.startsWith('blu-ray')) return 'uhd'
    }
    return 'other'
  }

  const medium = [...mediums][0]
  // 只有「UHD + HDR/DV」而没有介质词时信息不足，按歧义进其他档（效果稿③）。
  if (medium === 'uhd' && HDR_MARKERS.some(marker => marker.pattern.test(value))) return 'other'
  switch (medium) {
    case 'uhd-blu-ray':
    case 'blu-ray-plus':
    case 'uhd':
      return 'uhd'
    case 'blu-ray':
      return 'bd'
    case 'web-dl':
      return 'webdl'
    case 'web':
      return 'web'
    default:
      return 'other'
  }
}

/** HDR10+ > HDR10 > HDR > DV/DoVi；仅决定组内顺序，标签文字原样保留。 */
function editionSortRank(value: string): number {
  let rank = 0
  for (const { marker, pattern } of HDR_MARKERS) {
    if (!pattern.test(value)) continue
    rank += { 'HDR10+': 8, HDR10: 4, HDR: 2, DV: 1 }[marker as 'HDR10+' | 'HDR10' | 'HDR' | 'DV'] ?? 0
  }
  return rank
}

/** 把原串分组；输入顺序在组内保持稳定，HDR 标记决定组内排序。 */
export function groupEditionOptions(options: string[]): EditionGroup[] {
  const groups = new Map<EditionGroup['id'], string[]>(EDITION_GROUP_ORDER.map(id => [id, []]))
  const seen = new Set<string>()

  options.forEach((value, index) => {
    if (seen.has(value)) return
    seen.add(value)
    groups.get(detectMedium(value))?.push(value)
  })

  return EDITION_GROUP_ORDER.map(id => {
    const items = groups.get(id) ?? []
    return {
      id,
      name: EDITION_GROUP_NAMES[id],
      items: items
        .map((value, index) => ({ value, index, rank: editionSortRank(value) }))
        .sort((a, b) => b.rank - a.rank || a.index - b.index)
        .map(item => item.value),
    }
  })
}

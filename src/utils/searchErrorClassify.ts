/**
 * 站点搜索错误分类（纯函数，可单测）。
 *
 * 规格：`_spec/site-error-alert-spec.md` 第 2 节。
 * 设计要点：
 * 1. 只做「文本 → 档位」映射，不读 state、不依赖 i18n，便于单测与复用。
 * 2. 必须保留 unknown 兜底档：未识别的瞬时故障若归到 info 会永久失去重试入口，
 *    且误导用户去改配置（重试可逆、改配置有副作用 → 不确定时给低风险出口）。
 * 3. 错误文本来自站点原始响应，可能含 HTML/JS 垃圾，本模块只做字符串处理，
 *    输出一律为纯文本，由调用方用插值渲染（禁止 v-html）。
 */

export type SearchErrorTone = 'warning' | 'info' | 'error' | 'unknown'

export interface SearchErrorClass {
  /** 分类档位，决定图标/颜色/是否可重试。 */
  tone: SearchErrorTone
  /** 主因短标签的 i18n key（完整 key，可直接 t(labelKey)）。 */
  labelKey: string
  /** 去掉固定前缀后的原文，单行截断展示。 */
  detail: string
  /** 原始错误文本，用于复制/新窗口查看。 */
  raw: string
}

/** 连续重试上限：达到后主操作降级为「去更新」，避免用户对着坏站点反复点。 */
export const MAX_RETRY_COUNT = 3

/** 后端统一的失败前缀，不参与关键词匹配。 */
const ERROR_PREFIX = '站点请求或页面解析失败'

/** strip 后残留的前导分隔符（全角/半角混用）。 */
const LEADING_SEPARATORS = /^[\s·：:，,、|/\-—–]+/

/** 主因标签的 i18n key 后缀，同时作为组件内图标映射的键。 */
export const TONE_LABEL_KEYS = {
  noResponse: 'search.errors.tone.noResponse',
  timeout: 'search.errors.tone.timeout',
  serverError: 'search.errors.tone.serverError',
  missingApiKey: 'search.errors.tone.missingApiKey',
  loginExpired: 'search.errors.tone.loginExpired',
  loginRejected: 'search.errors.tone.loginRejected',
  parserUpdate: 'search.errors.tone.parserUpdate',
  forbidden: 'search.errors.tone.forbidden',
  unknown: 'search.errors.tone.unknown',
} as const

export type ToneLabel = keyof typeof TONE_LABEL_KEYS

/** 主因 → 档位（标签与档位一一对应，避免在规则里重复声明）。 */
const LABEL_TONES: Record<ToneLabel, SearchErrorTone> = {
  noResponse: 'warning',
  timeout: 'warning',
  serverError: 'warning',
  missingApiKey: 'info',
  loginExpired: 'info',
  parserUpdate: 'info',
  forbidden: 'error',
  loginRejected: 'error',
  unknown: 'unknown',
}

interface ToneRule {
  label: ToneLabel
  pattern: RegExp
}

/**
 * 规则顺序即优先级（先命中先返回）。
 * 顺序取舍：
 * - warning 在前：站点无响应（网络错误或超时）这类文本会同时命中「无响应」与「超时」，
 *   按规格表格顺序优先「站点无响应」。
 * - 状态码（403/401）排在登录/Cookie 之前：`HTTP 403 ... 请登录` 的主因是拒绝访问，
 *   不是 Cookie 过期；反过来 `返回登录或权限提示页` 没有状态码，仍会落到登录档。
 */
const TONE_RULES: ToneRule[] = [
  // ---- warning：可重试的瞬时故障 ----
  {
    label: 'noResponse',
    pattern: /无响应|没有响应|无法连接|连接失败|no response|unreachable|econnrefused|econnreset/i,
  },
  { label: 'timeout', pattern: /超时|timeout|timed out|etimedout/i },
  {
    label: 'serverError',
    pattern:
      /服务器错误|服务端错误|server error|bad gateway|gateway timeout|service unavailable|internal server error|5xx|\b5\d{2}\b/i,
  },
  // ---- error：被站点拒绝，重试无意义 ----
  { label: 'forbidden', pattern: /\b403\b|forbidden|封禁|封号|ip\s*限制|ip\s*地址被拒|ip\s*地址被限制|blocked/i },
  { label: 'loginRejected', pattern: /\b401\b|unauthorized/i },
  // ---- info：配置缺失，需用户去改设置 ----
  { label: 'missingApiKey', pattern: /api\s*key|apikey/i },
  { label: 'loginExpired', pattern: /未登录|登录|权限|cookie|passkey/i },
  // ---- info：解析器/站点结构变化 ----
  { label: 'parserUpdate', pattern: /解析|页面结构|结构不匹配|改版|parse|parser|selector/i },
]

/** 取括号内容：第一个 `（`/`(` 到最后一个 `）`/`)`，兼容真原因内部自带括号。 */
export function extractBracketContent(text: string): string {
  const openCandidates = [text.indexOf('（'), text.indexOf('(')].filter(index => index >= 0)
  if (openCandidates.length === 0) return ''
  const start = Math.min(...openCandidates)
  const end = Math.max(text.lastIndexOf('）'), text.lastIndexOf(')'))
  if (end <= start) return ''
  return text.slice(start + 1, end).trim()
}

/** 去掉固定前缀与前导分隔符，并把换行/连续空白压成单行。 */
export function stripErrorPrefix(raw: string): string {
  const text = raw.trim()
  const withoutPrefix = text.startsWith(ERROR_PREFIX) ? text.slice(ERROR_PREFIX.length) : text
  return withoutPrefix.replace(LEADING_SEPARATORS, '').replace(/\s+/g, ' ').trim()
}

function toClass(label: ToneLabel, detail: string, raw: string): SearchErrorClass {
  return { tone: LABEL_TONES[label], labelKey: TONE_LABEL_KEYS[label], detail, raw }
}

/**
 * 把后端失败文本归类到四档。
 *
 * 解析步骤（规格第 2 节）：
 * 1. strip 固定前缀 → trim → 去前导分隔符（`·` `：` ` - `）
 * 2. 取括号内容（第一个 `（` 到最后一个 `）`，兼容全角/半角）
 * 3. 分类只看括号内容或 strip 后的整段，前缀不参与匹配
 */
export function classifySearchError(raw: string): SearchErrorClass {
  const source = typeof raw === 'string' ? raw : String(raw ?? '')
  const stripped = stripErrorPrefix(source)

  // 完全没有文本：什么都不知道 → unknown（保留重试出口），而不是「解析器需更新」。
  if (!stripped) {
    return source.trim()
      ? toClass('parserUpdate', '', source)
      : { tone: 'unknown', labelKey: TONE_LABEL_KEYS.unknown, detail: '', raw: source }
  }

  const bracket = extractBracketContent(stripped)
  // 括号内是「真原因」，通常比整段更准；括号为空时退回整段。
  const candidates = bracket && bracket !== stripped ? [bracket, stripped] : [stripped]

  for (const rule of TONE_RULES) {
    if (candidates.some(candidate => rule.pattern.test(candidate))) {
      return toClass(rule.label, stripped, source)
    }
  }

  // 兜底：回显原始错误文本，不套模板句。
  return { tone: 'unknown', labelKey: TONE_LABEL_KEYS.unknown, detail: stripped, raw: source }
}

/** 只有 warning / unknown 允许重试。 */
export function isRetryableTone(tone: SearchErrorTone): boolean {
  return tone === 'warning' || tone === 'unknown'
}

/** 冷却中判定：cooldownUntil 为绝对时间戳，未设置视为不冷却。 */
export function isCoolingDown(cooldownUntil: number | null | undefined, now: number = Date.now()): boolean {
  return typeof cooldownUntil === 'number' && cooldownUntil > now
}

/** 剩余冷却秒数（向上取整，最小 0）。 */
export function cooldownSecondsLeft(cooldownUntil: number | null | undefined, now: number = Date.now()): number {
  if (!isCoolingDown(cooldownUntil, now)) return 0
  return Math.max(0, Math.ceil(((cooldownUntil as number) - now) / 1000))
}

export type SearchRowAction = 'retry' | 'configure' | 'update'

export interface RowActionState {
  tone: SearchErrorTone
  /** 冷却结束时间戳；冷却中不给 retry（组件在原位渲染倒计时占位）。 */
  cooldownUntil?: number | null
  /** 本次会话该源已被重试的次数。 */
  retryCount?: number
  /** 后端是否允许继续请求该源；显式 false 时不给 retry。 */
  canContinue?: boolean
  /** 细分主因（info 档用来区分「去配置」与「去更新」），缺省按 configure 处理。 */
  labelKey?: string
  /** 便于单测注入的当前时间。 */
  now?: number
}

/**
 * 行内可用动作（纯函数，规格第 4 节）。
 *
 * - warning：可续页 + 未冷却 + 未超重试上限 → `retry`；重试耗尽 → `update`。
 *   冷却中返回空数组，由组件在同一 DOM 位置渲染倒计时占位。
 * - unknown：`retry` + `update` 双出口（不确定会不会自愈，两个出口都是低风险）。
 * - info：解析器类 → `update`；其余（API Key / 登录 / Cookie）→ `configure`。
 * - error：403/401 既可能是 Cookie/IP 配置，也可能需更新解析器 → `configure` 主位 + `update` 次位。
 * - canContinue === false 或 retryCount >= 3 时一律不给 retry。
 */
export function rowActions(state: RowActionState): SearchRowAction[] {
  const { tone, labelKey } = state
  const canContinue = state.canContinue ?? true
  const retryCount = state.retryCount ?? 0
  const now = state.now ?? Date.now()
  const cooling = isCoolingDown(state.cooldownUntil, now)
  const exhausted = retryCount >= MAX_RETRY_COUNT
  const actions: SearchRowAction[] = []
  const push = (action: SearchRowAction) => {
    if (!actions.includes(action)) actions.push(action)
  }

  if (isRetryableTone(tone)) {
    if (canContinue && !cooling && !exhausted) {
      push('retry')
      // unknown 的兜底出口：不知道会不会自愈，同时给「重试」和「去更新」。
      if (tone === 'unknown') push('update')
    } else if (cooling && canContinue && !exhausted) {
      // 冷却中：retry 位由组件渲染倒计时占位；unknown 仍保留次级「去更新」。
      if (tone === 'unknown') push('update')
    } else {
      // 不可续页 / 重试耗尽：只留低风险出口。
      push('update')
    }
    return actions
  }

  if (tone === 'info') {
    push(labelKey === TONE_LABEL_KEYS.parserUpdate ? 'update' : 'configure')
    return actions
  }

  if (tone === 'error') {
    push('configure')
    push('update')
    return actions
  }

  // 理论不可达（unknown 已在上面返回），保险起见给重试。
  push('retry')
  return actions
}

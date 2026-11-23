import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const MAX_LISTED = 100

/**
 * Build a stable test signature that survives different checkout roots.
 *
 * @param {string} suiteName Vitest suite file name
 * @param {string} fullName Full assertion name
 * @returns {string} Comparison key
 */
export function testSignature(suiteName, fullName) {
  const parts = String(suiteName || '').split(/[\\/]/)
  const file = parts.slice(-2).join('/') || 'unknown'
  return `${file}::${fullName || ''}`
}

/**
 * Read a Vitest JSON report and collect failed assertions.
 *
 * @param {string} path Report path
 * @param {number|undefined} exitCode Process exit code
 * @returns {{failures: Set<string>, missing: boolean, exitCode: number|undefined}} Parsed report
 */
export function readReport(path, exitCode) {
  if (!existsSync(path)) {
    const marker = exitCode === undefined ? '__missing_report__' : `__vitest_exit__:${exitCode}`
    return { failures: new Set([marker]), missing: true, exitCode }
  }

  let payload
  try {
    payload = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    const detail = String(error.message || error).slice(0, 120)
    return { failures: new Set([`__invalid_report__:${detail}`]), missing: true, exitCode }
  }

  const failures = new Set()
  for (const suite of payload.testResults ?? []) {
    for (const assertion of suite.assertionResults ?? []) {
      if (assertion.status === 'failed') {
        failures.add(testSignature(suite.name, assertion.fullName))
      }
    }
  }
  return { failures, missing: false, exitCode }
}

/**
 * Classify failures into newly introduced, fixed and persistent sets.
 *
 * @param {{failures: Set<string>}} base Baseline report
 * @param {{failures: Set<string>}} head Head report
 * @returns {{new_failures: string[], fixed: string[], persistent: string[]}} Diff
 */
export function diffReports(base, head) {
  const newFailures = [...head.failures].filter(item => !base.failures.has(item)).sort()
  const fixed = [...base.failures].filter(item => !head.failures.has(item)).sort()
  const persistent = [...base.failures].filter(item => head.failures.has(item)).sort()
  return { new_failures: newFailures, fixed, persistent }
}

/**
 * Render the comparison as a GitHub step summary.
 *
 * @param {string} baseSha Baseline commit
 * @param {string} headSha Head commit
 * @param {ReturnType<typeof readReport>} base Baseline report
 * @param {ReturnType<typeof readReport>} head Head report
 * @param {ReturnType<typeof diffReports>} diff Failure diff
 * @returns {string} Markdown text
 */
export function renderMarkdown(baseSha, headSha, base, head, diff) {
  const lines = [
    '# Baseline test diff',
    '',
    `- baseline: \`${baseSha}\``,
    `- head: \`${headSha}\``,
    `- baseline failures: ${base.failures.size}`,
    `- head failures: ${head.failures.size}`,
    `- **new failures: ${diff.new_failures.length}**`,
    `- fixed: ${diff.fixed.length}`,
    `- persistent: ${diff.persistent.length}`,
    `- reports present: baseline=${base.missing ? 'no' : 'yes'}, head=${head.missing ? 'no' : 'yes'}`,
    '',
    '## New failures (head only)',
  ]
  const appendList = (items) => {
    if (items.length === 0) lines.push('- none')
    else lines.push(...items.slice(0, MAX_LISTED).map(item => `- \`${item}\``))
    if (items.length > MAX_LISTED) lines.push(`- ... and ${items.length - MAX_LISTED} more`)
  }
  appendList(diff.new_failures)
  lines.push('', '## Fixed (baseline only)')
  appendList(diff.fixed)
  lines.push('', '## Persistent (both)')
  appendList(diff.persistent)
  lines.push('', 'This job is non-blocking in its first version; it only publishes the diff.')
  return `${lines.join('\n')}\n`
}

/**
 * Parse the small set of --key value arguments used by this script.
 *
 * @param {string[]} argv Process arguments without node/script
 * @returns {Record<string, string>} Parsed options
 */
export function parseArgs(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]
    if (!current.startsWith('--')) continue
    const separator = current.indexOf('=')
    if (separator !== -1) {
      options[current.slice(2, separator)] = current.slice(separator + 1)
      continue
    }
    options[current.slice(2)] = argv[index + 1] ?? ''
    index += 1
  }
  return options
}

function writeOutput(path, content) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content, 'utf8')
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  if (!options['base-report'] || !options['head-report'] || !options['json-output'] || !options['markdown-output']) {
    throw new Error('--base-report, --head-report, --json-output and --markdown-output are required')
  }

  const baseExit = options['base-exit'] === undefined || options['base-exit'] === ''
    ? undefined
    : Number(options['base-exit'])
  const headExit = options['head-exit'] === undefined || options['head-exit'] === ''
    ? undefined
    : Number(options['head-exit'])
  const base = readReport(options['base-report'], baseExit)
  const head = readReport(options['head-report'], headExit)
  const diff = diffReports(base, head)
  const markdown = renderMarkdown(options['base-sha'] ?? '', options['head-sha'] ?? '', base, head, diff)

  writeOutput(options['markdown-output'], markdown)
  writeOutput(options['json-output'], `${JSON.stringify({
    baseSha: options['base-sha'] ?? '',
    headSha: options['head-sha'] ?? '',
    baseExitCode: base.exitCode ?? null,
    headExitCode: head.exitCode ?? null,
    baseReportMissing: base.missing,
    headReportMissing: head.missing,
    counts: {
      new_failures: diff.new_failures.length,
      fixed: diff.fixed.length,
      persistent: diff.persistent.length,
    },
    ...diff,
  }, null, 2)}\n`)
  process.stdout.write(markdown)
}

if (process.argv[1] && process.argv[1].endsWith('baseline-diff.mjs')) {
  main()
}

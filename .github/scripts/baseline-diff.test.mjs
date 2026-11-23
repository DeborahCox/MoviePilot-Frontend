import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { diffReports, parseArgs, readReport } from './baseline-diff.mjs'

function sampleReport(root, name, assertions, specName = 'alpha') {
  const path = join(root, name)
  writeFileSync(path, JSON.stringify({
    testResults: [{
      name: `/repo/src/views/discover/${specName}.spec.ts`,
      assertionResults: assertions,
    }],
  }), 'utf8')
  return path
}

test('readReport collects failed assertions only', () => {
  const root = mkdtempSync(join(tmpdir(), 'baseline-diff-'))
  try {
    const path = sampleReport(root, 'alpha', [
      { fullName: 'suite > ok', status: 'passed' },
      { fullName: 'suite > fail', status: 'failed', failureMessages: ['boom'] },
    ])
    const report = readReport(path, 1)
    assert.equal(report.missing, false)
    assert.deepEqual([...report.failures], ['discover/alpha.spec.ts::suite > fail'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('readReport uses exit code marker for missing report', () => {
  const report = readReport('/nonexistent/vitest.json', 2)
  assert.equal(report.missing, true)
  assert.deepEqual([...report.failures], ['__vitest_exit__:2'])
})

test('diffReports classifies new, fixed and persistent failures', () => {
  const root = mkdtempSync(join(tmpdir(), 'baseline-diff-'))
  try {
    const basePath = sampleReport(root, 'base', [
      { fullName: 'a', status: 'failed' },
      { fullName: 'b', status: 'failed' },
    ])
    const headPath = sampleReport(root, 'head', [
      { fullName: 'b', status: 'failed' },
      { fullName: 'c', status: 'failed' },
    ])
    const diff = diffReports(readReport(basePath), readReport(headPath))
    assert.deepEqual(diff.new_failures, ['discover/alpha.spec.ts::c'])
    assert.deepEqual(diff.fixed, ['discover/alpha.spec.ts::a'])
    assert.deepEqual(diff.persistent, ['discover/alpha.spec.ts::b'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('parseArgs supports --key=value and --key value', () => {
  assert.deepEqual(
    parseArgs(['--base-report=a.json', '--head-exit', '1']),
    { 'base-report': 'a.json', 'head-exit': '1' },
  )
})

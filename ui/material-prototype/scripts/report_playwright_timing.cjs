// Summarise the actual browser-test bottlenecks after every CI run.
// Playwright JSON output is produced by playwright.config.cjs only on CI.
const fs = require('node:fs')
const path = require('node:path')
const reportPath = path.join(__dirname, '..', 'test-results', 'playwright-report.json')
if (!fs.existsSync(reportPath)) {
  console.log('Playwright duration report is unavailable (tests may not have started).')
  process.exit(0)
}
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
const rows = []
function visit(suites = [], prefix = []) {
  for (const suite of suites) {
    const parts = suite.title ? [...prefix, suite.title] : prefix
    for (const spec of suite.specs || []) {
      for (const entry of spec.tests || []) {
        const results = entry.results || []
        rows.push({
          title: [...parts, spec.title].filter(Boolean).join(' › '),
          ms: results.reduce((sum, item) => sum + (item.duration || 0), 0),
          attempts: results.length,
          status: results[results.length - 1]?.status || 'unknown'
        })
      }
    }
    visit(suite.suites || [], parts)
  }
}
visit(report.suites)
rows.sort((a, b) => b.ms - a.ms)
const seconds = n => (n / 1000).toFixed(1)
console.log(`Playwright: ${rows.length} cases, ${report.stats?.duration ? seconds(report.stats.duration) : '?'}s elapsed`)
for (const row of rows.slice(0, 10)) {
  console.log(`${seconds(row.ms).padStart(6)}s [${row.status}, ${row.attempts} run(s)] ${row.title}`)
}
const summary = process.env.GITHUB_STEP_SUMMARY
if (summary) {
  const escape = value => String(value).replace(/\|/g, '\\|').replace(/[\r\n]/g, ' ')
  const table = [
    '### Playwright 运行耗时',
    '',
    `总计 ${rows.length} 项；墙钟时间 ${report.stats?.duration ? seconds(report.stats.duration) : '?'}s。`,
    '',
    '| 耗时 | 结果 | 测试 |',
    '| ---: | --- | --- |',
    ...rows.slice(0, 10).map(row => `| ${seconds(row.ms)}s | ${escape(row.status)} | ${escape(row.title)} |`),
    ''
  ]
  fs.appendFileSync(summary, table.join('\n'))
}

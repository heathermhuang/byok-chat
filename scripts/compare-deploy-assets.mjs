import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const DEFAULT_STAGING_URL = 'https://staging.byok.chat/'
const DEFAULT_PRODUCTION_URL = 'https://byok.chat/'

function normalizePageUrl(input) {
  const url = new URL(input || DEFAULT_STAGING_URL)
  if (!url.pathname.endsWith('/')) {
    url.pathname = `${url.pathname}/`
  }
  return url
}

function absoluteAssetUrl(pageUrl, assetPath) {
  return new URL(assetPath.replace(/&amp;/g, '&'), pageUrl).toString()
}

export function collectAssetReferences(html, pageUrl) {
  const refs = new Set()
  const patterns = [
    /\s(?:src|href)=["']([^"']+)["']/gi,
    /url\(["']?([^"')]+)["']?\)/gi,
    /["'`]([^"'`]+?\.(?:js|css|json|webmanifest|png|jpg|jpeg|svg|webp|ico)(?:[?#][^"'`]*)?)["'`]/gi,
  ]

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(html)) !== null) {
      const value = match[1]?.trim()
      if (!value) continue
      if (value.includes('${')) continue
      if (/^(?:data:|mailto:|tel:|#)/i.test(value)) continue
      if (!/\.(?:js|css|json|webmanifest|png|jpg|jpeg|svg|webp|ico)(?:[?#].*)?$/i.test(value)) continue
      refs.add(absoluteAssetUrl(pageUrl, value))
    }
  }

  return Array.from(refs).sort()
}

export function sha256(text) {
  return createHash('sha256').update(text).digest('hex')
}

async function fetchText(fetchImpl, url) {
  const response = await fetchImpl(url, {
    headers: {
      accept: 'text/html,application/javascript,text/css,application/json,image/*,*/*;q=0.7',
      'user-agent': 'Byok-Chat-Release-Check/0.1',
    },
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}: ${text.slice(0, 160)}`)
  }
  return text
}

async function readDeployment(fetchImpl, label, inputUrl) {
  const pageUrl = normalizePageUrl(inputUrl)
  const html = await fetchText(fetchImpl, pageUrl.toString())
  const pageOrigin = pageUrl.origin
  const pendingAssetUrls = collectAssetReferences(html, pageUrl)
  const seenAssetUrls = new Set()
  const assets = []

  for (let index = 0; index < pendingAssetUrls.length; index += 1) {
    const assetUrl = pendingAssetUrls[index]
    if (seenAssetUrls.has(assetUrl)) continue
    if (new URL(assetUrl).origin !== pageOrigin) continue
    seenAssetUrls.add(assetUrl)

    const body = await fetchText(fetchImpl, assetUrl)
    assets.push({
      url: assetUrl,
      path: new URL(assetUrl).pathname,
      bytes: Buffer.byteLength(body),
      sha256: sha256(body),
    })

    for (const childAssetUrl of collectAssetReferences(body, new URL(assetUrl))) {
      if (!seenAssetUrls.has(childAssetUrl) && new URL(childAssetUrl).origin === pageOrigin) {
        pendingAssetUrls.push(childAssetUrl)
      }
    }
  }

  return {
    label,
    url: pageUrl.toString(),
    html: {
      bytes: Buffer.byteLength(html),
      sha256: sha256(html),
    },
    assets: assets.sort((a, b) => a.path.localeCompare(b.path)),
  }
}

function byPath(items) {
  return new Map(items.map((item) => [item.path, item]))
}

export function compareDeploymentReports(staging, production) {
  const stagingAssets = byPath(staging.assets)
  const productionAssets = byPath(production.assets)
  const paths = Array.from(new Set([...stagingAssets.keys(), ...productionAssets.keys()])).sort()
  const rows = paths.map((path) => {
    const left = stagingAssets.get(path)
    const right = productionAssets.get(path)
    return {
      path,
      stagingHash: left?.sha256 || '',
      productionHash: right?.sha256 || '',
      stagingBytes: left?.bytes || 0,
      productionBytes: right?.bytes || 0,
      status: !left ? 'production-only' : !right ? 'staging-only' : left.sha256 === right.sha256 ? 'match' : 'diff',
    }
  })
  const htmlMatches = staging.html.sha256 === production.html.sha256
  const assetsMatch = rows.every((row) => row.status === 'match')

  return {
    htmlMatches,
    assetsMatch,
    matches: htmlMatches && assetsMatch,
    rows,
  }
}

export async function compareDeployAssets(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch
  if (!fetchImpl) throw new Error('fetch is not available in this runtime')
  const stagingUrl = options.stagingUrl || process.env.STAGING_URL || DEFAULT_STAGING_URL
  const productionUrl = options.productionUrl || process.env.PRODUCTION_URL || DEFAULT_PRODUCTION_URL
  const [staging, production] = await Promise.all([
    readDeployment(fetchImpl, 'staging', stagingUrl),
    readDeployment(fetchImpl, 'production', productionUrl),
  ])
  return {
    checkedAt: new Date().toISOString(),
    staging,
    production,
    comparison: compareDeploymentReports(staging, production),
  }
}

function printReport(report) {
  const { staging, production, comparison } = report
  console.log(`Checked: ${report.checkedAt}`)
  console.log(`staging:    ${staging.url} html ${staging.html.sha256.slice(0, 12)} assets ${staging.assets.length}`)
  console.log(`production: ${production.url} html ${production.html.sha256.slice(0, 12)} assets ${production.assets.length}`)
  console.log(`status: ${comparison.matches ? 'MATCH' : 'DIFF'}`)

  if (!comparison.htmlMatches) {
    console.log('html: diff')
  }

  const changedRows = comparison.rows.filter((row) => row.status !== 'match')
  if (!changedRows.length) {
    console.log('assets: match')
    return
  }

  console.log('assets:')
  for (const row of changedRows) {
    console.log(`- ${row.status.padEnd(15)} ${row.path}`)
    if (row.stagingHash) console.log(`  staging    ${row.stagingHash.slice(0, 16)} ${row.stagingBytes} bytes`)
    if (row.productionHash) console.log(`  production ${row.productionHash.slice(0, 16)} ${row.productionBytes} bytes`)
  }
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isCli) {
  compareDeployAssets()
    .then((report) => {
      printReport(report)
      process.exitCode = report.comparison.matches ? 0 : 1
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error)
      process.exitCode = 2
    })
}

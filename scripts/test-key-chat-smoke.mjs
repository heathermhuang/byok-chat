import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'

const base = process.env.BYOK_CHAT_BASE_URL || 'https://staging.byok.chat/'
assert.equal(new URL(base).hostname, 'staging.byok.chat', 'This smoke is staging-only')
const out = process.env.BYOK_KEY_CHAT_EVIDENCE || '/tmp/byok-test-key-chat-evidence'
await mkdir(out, { recursive: true })
const proxy = process.env.BYOK_CHAT_PROXY || process.env.HTTPS_PROXY || process.env.https_proxy || process.env.ALL_PROXY || process.env.all_proxy
const browser = await chromium.launch({ channel: process.env.BYOK_CHAT_BROWSER_CHANNEL || 'chrome', proxy: proxy ? { server: proxy } : undefined })
const evidence = []
const models = [{ id: 'fixture-chat-a', architecture: { output_modalities: ['text'] } }, { id: 'fixture-chat-b', architecture: { output_modalities: ['text'] } }]
const probe = (model, status = 'ok') => ({ status: 'ok', checks: [{ label: 'Models endpoint', status: 'ok', message: 'Model-list request succeeded.' }, { label: 'Chat endpoint', status, message: status === 'ok' ? `Chat probe succeeded for ${model}.` : 'Provider quota exhausted. Try again later.' }] })
async function fresh(viewport) {
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  const errors = [], diagnostics = [], chat = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/api/models', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: models }) }))
  await page.route('**/api/chat', async route => {
    const body = route.request().postDataJSON(); chat.push(body)
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: 'Staging selected-model reply.', tools: [], metadata: { provider: body.profile.provider, model: body.profile.model, statusCode: 200 } }) })
  })
  await page.route('**/api/diagnostics', async route => {
    const body = route.request().postDataJSON(); diagnostics.push(body)
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(probe(body.model)) })
  })
  await page.goto(base, { waitUntil: 'networkidle' })
  const consent = page.getByRole('button', { name: 'Necessary only', exact: true })
  if (await consent.count()) await consent.click()
  return { context, page, errors, diagnostics, chat }
}
async function configure(page) {
  await page.getByLabel('Provider', { exact: true }).selectOption('openai')
  await page.getByLabel('API key', { exact: true }).fill('fixture-key-a')
  assert.equal(await page.getByLabel('API key', { exact: true }).getAttribute('type'), 'password')
  await page.getByRole('button', { name: 'Fetch models', exact: true }).click()
  await page.getByLabel('Model', { exact: true }).selectOption('fixture-chat-b')
  assert.equal(await page.getByRole('button', { name: /^Chat with fixture-chat/ }).count(), 0)
}
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
    const { context, page, errors, diagnostics, chat } = await fresh(viewport)
    await configure(page)
    await page.getByRole('button', { name: 'Test key', exact: true }).click()
    const open = page.getByRole('button', { name: 'Chat with fixture-chat-b', exact: true })
    await open.waitFor()
    await open.scrollIntoViewIfNeeded()
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    await page.screenshot({ path: `${out}/tested-${viewport.width}.png`, fullPage: true })
    assert.equal(diagnostics.at(-1).model, 'fixture-chat-b')
    await open.click()
    await page.locator('.toolbar-model-switcher select').waitFor()
    assert.equal(await page.locator('.toolbar-model-switcher select').inputValue(), 'fixture-chat-b')
    assert.match(await page.locator('.tested-chat-receipt').textContent(), /fixture-chat-b/)
    await page.getByPlaceholder(/Ask anything/i).fill("What's an API?")
    await page.getByTitle('Send message').click()
    await page.getByText('Staging selected-model reply.', { exact: true }).waitFor()
    assert.equal(chat.at(-1).profile.model, 'fixture-chat-b')
    assert.equal(chat.at(-1).profile.apiKey, 'fixture-key-a')
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    const composer = await page.locator('.thread-composer').boundingBox()
    assert(composer && composer.width > 180 && composer.height > 30, 'Chat composer must remain visible after the handoff')
    await page.screenshot({ path: `${out}/chat-${viewport.width}.png`, fullPage: false })
    assert.deepEqual(errors, [])
    evidence.push({ width: viewport.width, model: chat.at(-1).profile.model, tested: true, sent: true, reply: true })
    await context.close()
  }
  const { context, page, errors } = await fresh({ width: 1180, height: 900 })
  await configure(page)
  await page.getByRole('button', { name: 'Test key', exact: true }).click()
  await page.getByRole('button', { name: 'Chat with fixture-chat-b', exact: true }).waitFor()
  await page.getByLabel('Model', { exact: true }).selectOption('fixture-chat-a')
  assert.equal(await page.getByRole('button', { name: /^Chat with fixture-chat/ }).count(), 0)
  await page.getByRole('button', { name: 'Test key', exact: true }).click()
  await page.getByRole('button', { name: 'Chat with fixture-chat-a', exact: true }).waitFor()
  await page.getByLabel('API key', { exact: true }).fill('fixture-key-b')
  assert.equal(await page.getByRole('button', { name: /^Chat with fixture-chat/ }).count(), 0)
  await page.getByLabel('Base URL').fill('https://other.example/v1')
  assert.equal(await page.getByRole('button', { name: /^Chat with fixture-chat/ }).count(), 0)
  await page.route('**/api/diagnostics', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(probe('fixture-chat-a', 'warn')) }))
  await page.getByRole('button', { name: 'Test key', exact: true }).click()
  await page.getByText('The chat test did not pass.', { exact: false }).waitFor()
  assert.equal(await page.getByRole('button', { name: /^Chat with fixture-chat/ }).count(), 0)
  let release
  const ready = new Promise(resolve => { release = resolve })
  await page.route('**/api/diagnostics', async route => { await ready; try { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(probe('fixture-chat-a')) }) } catch {} })
  await page.getByRole('button', { name: 'Run test again', exact: true }).click()
  await page.getByText('Checking provider…', { exact: false }).waitFor()
  await page.getByRole('button', { name: 'New profile', exact: true }).click()
  release()
  await page.waitForTimeout(300)
  assert.equal(await page.getByRole('button', { name: /^Chat with fixture-chat/ }).count(), 0)
  assert.equal(await page.getByLabel('API key', { exact: true }).inputValue(), '')
  assert.deepEqual(errors, [])
  evidence.push({ invalidatesOn: ['model', 'key', 'endpoint', 'profile'], quotaWarningDoesNotPass: true, staleResultDiscarded: true })
  await context.close()
  const manual = await fresh({ width: 768, height: 1000 })
  await manual.page.getByLabel('Provider', { exact: true }).selectOption('claude')
  await manual.page.getByLabel('API key', { exact: true }).fill('fixture-manual-key')
  await manual.page.getByLabel('Model ID', { exact: true }).fill('claude-fixture-model')
  await manual.page.route('**/api/diagnostics', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', checks: [{ label: 'Models endpoint', status: 'warn', message: 'Manual model entry is supported.' }, { label: 'Chat endpoint', status: 'ok', message: 'Chat probe succeeded.' }] }) }))
  await manual.page.getByRole('button', { name: 'Test key', exact: true }).click()
  await manual.page.getByRole('button', { name: 'Chat with claude-fixture-model', exact: true }).click()
  assert.equal(await manual.page.locator('.toolbar-model-switcher select').inputValue(), 'claude-fixture-model')
  evidence.push({ manualModelProvider: true, width: 768 })
  await manual.context.close()
  await writeFile(`${out}/result.json`, JSON.stringify({ status: 'passed', target: base, evidence, note: 'Synthetic browser fixtures; no real provider key or billable upstream request.' }, null, 2))
  console.log(JSON.stringify({ status: 'passed', target: base, evidence }, null, 2))
} finally { await Promise.race([browser.close(), new Promise(resolve => setTimeout(resolve, 3000))]) }
process.exit(0)

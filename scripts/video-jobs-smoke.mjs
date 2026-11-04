import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const base = process.env.BYOK_CHAT_BASE_URL || 'https://staging.byok.chat/'
assert.equal(new URL(base).hostname, 'staging.byok.chat', 'This regression smoke is staging-only')
const out = process.env.BYOK_VIDEO_EVIDENCE || '/tmp/byok-video-job-evidence'
await mkdir(out, { recursive: true })
const proxy = process.env.BYOK_CHAT_PROXY || process.env.HTTPS_PROXY || process.env.ALL_PROXY
const browser = await chromium.launch({ proxy: proxy ? { server: proxy } : undefined })
const job = { mode: 'video_generation', requestId: 'fixture-saved-video', model: 'fixture-video', status: 'running' }
const pending = { mode: job.mode, model: job.model, text: 'Running', pendingJob: job, attachments: [], upstreamStatus: 200 }
const ready = { ...pending, text: 'Generated 1 video.', pendingJob: undefined, attachments: [{ kind: 'video', url: `${base}fixture-video.mp4`, name: 'video.mp4', mediaType: 'video/mp4' }] }
const evidence = []

async function fresh(width, savedJob) {
  const context = await browser.newContext({ viewport: { width, height: 1000 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  // Synthetic credentials and intercepted API/media routes only. Never create a
  // real generation or send a fixture key to an upstream provider.
  await page.route('**/api/**', route => route.fulfill({ status: 400, json: { error: { message: 'Unexpected fixture API call' } } }))
  await page.route('**/fixture-video.mp4', route => route.fulfill({ status: 200, contentType: 'video/mp4', body: '' }))
  await page.addInitScript(({ savedJob, job }) => {
    if (localStorage.getItem('byok.chat.profiles.v1')) return
    const now = new Date().toISOString()
    const profile = { id: 'fixture-profile', name: 'Video fixture', provider: 'custom', baseUrl: 'https://example.com/v1', apiKey: 'fixture-key', selectedModel: job.model, models: [{ id: job.model, name: job.model, raw: { architecture: { output_modalities: ['video'] } } }] }
    const messages = savedJob ? [{ id: 'saved-message', role: 'assistant', text: 'Old saved status error', status: 'error', createdAt: now, actionContext: { mediaJob: job, mode: job.mode } }] : []
    localStorage.setItem('byok.chat.consent.v1', JSON.stringify({ version: 1, essential: true, analytics: false, updatedAt: now }))
    localStorage.setItem('byok.chat.profiles.v1', JSON.stringify([profile]))
    localStorage.setItem('byok.chat.activeProfile.v1', profile.id)
    localStorage.setItem('byok.chat.threads.v2', JSON.stringify([{ schemaVersion: 2, id: 'fixture-thread', profileId: profile.id, title: 'Video fixture thread', createdAt: now, updatedAt: now, messages }]))
    localStorage.setItem('byok.chat.activeThread.v2', 'fixture-thread')
  }, { savedJob, job })
  return { context, page, errors }
}

try {
  for (const width of [1440, 390]) {
    const { context, page, errors } = await fresh(width, true)
    let checks = 0, generations = 0
    let releaseFirst
    const firstCheck = new Promise(resolve => { releaseFirst = resolve })
    await page.route('**/api/media', route => { generations++; return route.fulfill({ json: pending }) })
    await page.route('**/api/media/status', async route => {
      assert.equal(route.request().postDataJSON().requestId, job.requestId)
      checks++
      if (checks === 1) await firstCheck
      return route.fulfill({ json: checks >= 13 ? ready : { ...pending, pendingJob: { ...job, status: `running-${checks}` } } })
    })
    await page.clock.install()
    await page.goto(base, { waitUntil: 'domcontentloaded' })
    await page.getByTitle('Check video status').waitFor()
    assert.equal(await page.getByRole('button', { name: 'Retry', exact: true }).count(), 0)
    releaseFirst()
    await page.getByText(/running-1\)/).waitFor()
    assert.equal(await page.getByTitle('Retry', { exact: true }).count(), 0)
    // Cross the former ten-poll cutoff without spending minutes in the test.
    for (let count = 2; count <= 13; count++) {
      await page.clock.fastForward(30_000)
      if (count < 13) await page.getByText(new RegExp(`running-${count}\\)`)).waitFor()
      else await page.locator('video').waitFor()
    }
    assert.equal(checks, 13)
    assert.equal(generations, 0)
    await page.clock.fastForward(120_000)
    assert.equal(checks, 13)
    assert.equal(await page.getByTitle('Check video status').count(), 0)
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('byok.chat.threads.v2'))[0].messages[0])
    assert.equal(saved.attachments.length, 1)
    assert.equal(saved.actionContext.mediaJob, undefined)
    await page.screenshot({ path: `${out}/recovered-${width}.png` })
    assert.deepEqual(errors, [])
    evidence.push({ width, savedJobRecovered: true, checks, duplicateGenerations: generations, stopsAfterSuccess: true, attachmentPersisted: true })
    await context.close()
  }

  const { context, page, errors } = await fresh(1440, false)
  let generations = 0, checks = 0, complete = false
  await page.route('**/api/media', route => {
    generations++
    return route.fulfill({ json: generations === 1 ? pending : { ...ready, text: 'Second prompt response' } })
  })
  await page.route('**/api/media/status', route => { checks++; return route.fulfill({ json: complete ? ready : pending }) })
  await page.clock.install()
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.getByPlaceholder('Describe the video to generate').fill('First video prompt')
  await page.getByTitle('Send message', { exact: true }).click()
  await page.getByText(/Checking automatically/).waitFor()
  await page.getByPlaceholder('Describe the video to generate').fill('Second video prompt')
  assert.equal(await page.getByTitle('Send message', { exact: true }).isEnabled(), true)
  await page.getByTitle('Send message', { exact: true }).click()
  await page.getByText('Second prompt response', { exact: true }).waitFor()
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByText(/Checking automatically/).waitFor()
  assert(checks >= 2, 'reload must check the durable pending job again')
  complete = true
  await page.getByTitle('Check video status').click()
  await page.getByText('Generated 1 video.', { exact: true }).waitFor()
  await page.getByText('Second video prompt', { exact: true }).waitFor()
  await page.getByText('Second prompt response', { exact: true }).waitFor()
  assert.equal(await page.locator('video').count(), 2)
  assert.equal(generations, 2)
  assert.deepEqual(errors, [])
  await page.screenshot({ path: `${out}/concurrent-and-restored.png` })
  evidence.push({ newJobCheckedAutomatically: true, composerAvailableWhilePending: true, reloadResumes: true, manualRefreshWorks: true, newerMessagesPreserved: true, generations })
  await context.close()
  await writeFile(`${out}/result.json`, JSON.stringify({ status: 'passed', target: base, evidence, note: 'Synthetic API fixtures on deployed staging; no real key, billable generation, or media playback test.' }, null, 2))
  console.log(JSON.stringify({ status: 'passed', evidence }, null, 2))
} finally {
  await browser.close()
}

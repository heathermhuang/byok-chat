import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const baseUrl = process.env.BYOK_CHAT_BASE_URL || 'http://127.0.0.1:8799/'
const screenshotPath = process.env.BYOK_CHAT_SMOKE_SCREENSHOT || '/tmp/byok-chat-smoke.png'
const cases = [
  { name: 'desktop', viewport: { width: 1440, height: 1000 } },
  { name: 'mobile', viewport: { width: 390, height: 844 } },
]

const browser = await chromium.launch({
  headless: true,
  proxy: getProxyConfig(baseUrl),
})

function caseScreenshotPath(name) {
  return screenshotPath.replace(/(\.[^.]+)?$/, `-${name}$1`)
}

async function chooseNecessaryStorage(page) {
  const necessaryOnly = page.getByRole('button', { name: 'Necessary only' })
  if (await necessaryOnly.count()) await necessaryOnly.click()
}

async function captureDockedConsent(page, name) {
  await page.locator('.consent-banner').waitFor({ timeout: 10_000 })
  const layout = await page.evaluate(() => {
    const content = document.querySelector('.app-shell, .legal-shell')?.getBoundingClientRect()
    const banner = document.querySelector('.consent-banner')?.getBoundingClientRect()
    const composer = document.querySelector('.composer')?.getBoundingClientRect()
    const root = document.querySelector('.site-root')?.getBoundingClientRect()
    return {
      viewportHeight: window.innerHeight,
      rootBottom: root?.bottom ?? -1,
      contentBottom: content?.bottom ?? -1,
      bannerTop: banner?.top ?? -1,
      bannerBottom: banner?.bottom ?? -1,
      composerBottom: composer?.bottom ?? null,
    }
  })
  assert.ok(Math.abs(layout.contentBottom - layout.bannerTop) <= 1.5, `consent bar must follow content without overlap: ${JSON.stringify(layout)}`)
  assert.ok(layout.bannerBottom <= layout.viewportHeight + 1, `consent bar must stay inside the viewport: ${JSON.stringify(layout)}`)
  assert.ok(layout.rootBottom <= layout.viewportHeight + 1, `consent layout must stay inside the viewport: ${JSON.stringify(layout)}`)
  if (layout.composerBottom !== null) {
    assert.ok(layout.composerBottom <= layout.bannerTop + 1, `consent bar must not cover the composer: ${JSON.stringify(layout)}`)
  }
  const path = caseScreenshotPath(name)
  await writeFile(path, await page.screenshot({ fullPage: false }))
  console.log(`browser smoke docked consent ok: ${baseUrl}`)
  console.log(`screenshot: ${path}`)
}

try {
  const apiProbePage = await browser.newPage()
  try {
    await apiProbePage.goto(baseUrl, { waitUntil: 'networkidle' })
    const probe = await apiProbePage.evaluate(async () => {
      const response = await fetch('/api/models', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
      const contentType = response.headers.get('content-type') || ''
      const body = await response.json().catch(() => ({}))
      return { status: response.status, contentType, body }
    })
    assert.equal(probe.status, 400)
    assert.match(probe.contentType, /application\/json/)
    assert.equal(probe.body?.error?.message, 'apiKey is required')
    console.log(`browser smoke api probe ok: ${baseUrl}`)
  } finally {
    await apiProbePage.close()
  }

  for (const smokeCase of cases) {
    const page = await browser.newPage({ viewport: smokeCase.viewport })
    const events = []

    page.on('console', (message) => {
      if (message.type() === 'error') events.push(`console error: ${message.text()}`)
    })
    page.on('pageerror', (error) => {
      events.push(`page error: ${error.message}`)
    })

    try {
      await page.goto(baseUrl, { waitUntil: 'networkidle' })
      await page.getByRole('heading', { name: 'Byok Chat' }).waitFor({ timeout: 10_000 })
      await page.getByRole('heading', { name: 'Connect your provider. Keep control.' }).waitFor({ timeout: 10_000 })

      await chooseNecessaryStorage(page)

      assert.equal(await page.title(), 'BYOK Chat · Bring Your Own Key')
      assert.ok(await page.getByRole('button', { name: /OpenRouter/i }).count() >= 1)
      const githubLink = page.getByRole('link', { name: /Open source.*GitHub/i })
      assert.equal(await githubLink.count(), 1)
      assert.equal(await githubLink.getAttribute('href'), 'https://github.com/heathermhuang/byok-chat')
      assert.equal(await githubLink.getAttribute('target'), '_blank')
      assert.equal(await page.locator('.lab-sidebar').getByRole('button', { name: 'OpenAI', exact: true }).count(), 0)
      assert.equal(await page.getByRole('button', { name: /Fetch models/i }).count(), 0)
      assert.equal(await page.locator('.workspace-system-field, .workspace-param-grid, .workspace-notes-field, .workspace-tags-field, .model-fetch-row, .trust-row').count(), 0)
      assert.equal(await page.locator('.setup-state .endpoint-actions button').count(), 1)
      const horizontalLayout = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        setupRight: document.querySelector('.setup-state')?.getBoundingClientRect().right ?? 0,
        formRight: document.querySelector('.endpoint-form')?.getBoundingClientRect().right ?? 0,
      }))
      assert.ok(horizontalLayout.documentWidth <= horizontalLayout.viewportWidth + 1, `page should not overflow horizontally: ${JSON.stringify(horizontalLayout)}`)
      assert.ok(horizontalLayout.setupRight <= horizontalLayout.viewportWidth + 1, `setup should stay inside viewport: ${JSON.stringify(horizontalLayout)}`)
      assert.ok(horizontalLayout.formRight <= horizontalLayout.viewportWidth + 1, `form should stay inside viewport: ${JSON.stringify(horizontalLayout)}`)
      assert.deepEqual(events, [])

      if (smokeCase.name === 'mobile') {
        const mobileLayout = await page.evaluate(() => {
          const consoleMain = document.querySelector('.console-main')?.getBoundingClientRect()
          const sidebar = document.querySelector('.lab-sidebar')?.getBoundingClientRect()
          const endpointForm = document.querySelector('.endpoint-form')?.getBoundingClientRect()
          const threadRail = document.querySelector('.thread-rail-section')
          const systemPrompt = document.querySelector('.workspace-system-field')
          const baseUrl = document.querySelector('.base-url-field')
          const setupCopy = document.querySelector('.setup-copy')
          const modelFetchRow = document.querySelector('.model-fetch-row')
          const brand = document.querySelector('.mobile-brand-lockup')?.getBoundingClientRect()
          const statusChips = [...document.querySelectorAll('.strip-meter > span')]
            .filter((element) => getComputedStyle(element).display !== 'none')
            .map((element) => element.getBoundingClientRect().right)
          const modelCount = document.querySelector('.model-count-pill')
          const saveButton = document.querySelector('.setup-state .endpoint-actions .button')?.getBoundingClientRect()
          return {
            consoleTop: consoleMain?.top ?? -1,
            sidebarTop: sidebar?.top ?? -1,
            endpointTop: endpointForm?.top ?? -1,
            viewportHeight: window.innerHeight,
            threadRailDisplay: threadRail ? getComputedStyle(threadRail).display : '',
            systemPromptDisplay: systemPrompt ? getComputedStyle(systemPrompt).display : 'missing',
            baseUrlDisplay: baseUrl ? getComputedStyle(baseUrl).display : 'missing',
            setupCopyDisplay: setupCopy ? getComputedStyle(setupCopy).display : 'missing',
            modelFetchDisplay: modelFetchRow ? getComputedStyle(modelFetchRow).display : 'missing',
            brandTop: brand?.top ?? -1,
            brandBottom: brand?.bottom ?? -1,
            statusChips,
            modelCountDisplay: modelCount ? getComputedStyle(modelCount).display : 'missing',
            saveButtonHeight: saveButton?.height ?? 0,
          }
        })
        assert.ok(mobileLayout.consoleTop <= 1, `mobile should open on the workspace, got console top ${mobileLayout.consoleTop}`)
        assert.ok(mobileLayout.endpointTop > 0 && mobileLayout.endpointTop < mobileLayout.viewportHeight, `mobile setup form should be in the first viewport, got top ${mobileLayout.endpointTop}`)
        assert.ok(mobileLayout.sidebarTop >= mobileLayout.viewportHeight - 1, `mobile profile rail should move below the first viewport, got top ${mobileLayout.sidebarTop}`)
        assert.equal(mobileLayout.threadRailDisplay, 'none')
        assert.ok(['none', 'missing'].includes(mobileLayout.systemPromptDisplay), `mobile setup should hide system prompt, got ${mobileLayout.systemPromptDisplay}`)
        assert.ok(['none', 'missing'].includes(mobileLayout.baseUrlDisplay), `mobile preset setup should hide base URL, got ${mobileLayout.baseUrlDisplay}`)
        assert.ok(['none', 'missing'].includes(mobileLayout.setupCopyDisplay), `mobile setup should hide copy panel, got ${mobileLayout.setupCopyDisplay}`)
        assert.ok(['none', 'missing'].includes(mobileLayout.modelFetchDisplay), `mobile setup should hide model fetch controls, got ${mobileLayout.modelFetchDisplay}`)
        assert.ok(mobileLayout.brandTop >= 0 && mobileLayout.brandBottom <= mobileLayout.viewportHeight, `mobile product identity should be in the first viewport: ${JSON.stringify(mobileLayout)}`)
        assert.ok(mobileLayout.statusChips.every((right) => right <= 390 + 1), `mobile status chips should stay inside the viewport: ${JSON.stringify(mobileLayout.statusChips)}`)
        assert.equal(mobileLayout.modelCountDisplay, 'none')
        assert.ok(mobileLayout.saveButtonHeight >= 44, `mobile setup action should meet the 44px touch target: ${mobileLayout.saveButtonHeight}`)
      }

      const path = caseScreenshotPath(smokeCase.name)
      await writeFile(path, await page.screenshot({ fullPage: false }))
      console.log(`browser smoke ${smokeCase.name} ok: ${baseUrl}`)
      console.log(`screenshot: ${path}`)
    } finally {
      await page.close()
    }
  }

  const setupFlowPage = await browser.newPage({ viewport: { width: 1024, height: 540 } })
  const setupFlowEvents = []
  const setupFlowModelRequests = []
  const setupFlowRequests = []
  setupFlowPage.on('console', (message) => {
    if (message.type() === 'error') setupFlowEvents.push(`console error: ${message.text()}`)
  })
  setupFlowPage.on('pageerror', (error) => {
    setupFlowEvents.push(`page error: ${error.message}`)
  })
  await setupFlowPage.addInitScript(() => {
    localStorage.removeItem('byok.chat.profiles.v1')
    localStorage.removeItem('byok.chat.activeProfile.v1')
    localStorage.removeItem('standalone.llmTester.profiles.v1')
    localStorage.removeItem('standalone.llmTester.activeProfile.v1')
  })
  await setupFlowPage.route('**/api/chat', async (route) => {
    const body = route.request().postDataJSON()
    setupFlowRequests.push(body.profile.model)
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(createMockChatJsonBody()),
    })
  })
  await setupFlowPage.route('**/api/models', async (route) => {
    setupFlowModelRequests.push(route.request().postDataJSON())
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        data: [
          {
            id: 'setup-auto-model',
            name: 'Setup auto model',
            owned_by: 'Smoke',
            architecture: { output_modalities: ['text'] },
          },
        ],
      }),
    })
  })

  try {
    await setupFlowPage.goto(baseUrl, { waitUntil: 'networkidle' })
    await chooseNecessaryStorage(setupFlowPage)
    const providerCardLayout = await setupFlowPage.locator('.provider-chip').evaluateAll((cards) => cards.map((card) => {
      const cardBox = card.getBoundingClientRect()
      const copyBox = card.querySelector('.provider-copy')?.getBoundingClientRect()
      return {
        cardTop: cardBox.top,
        cardBottom: cardBox.bottom,
        copyTop: copyBox?.top ?? -1,
        copyBottom: copyBox?.bottom ?? -1,
      }
    }))
    assert.equal(providerCardLayout.length, 9)
    for (const item of providerCardLayout) {
      assert.ok(item.copyTop >= item.cardTop - 0.5, `provider text must start inside its card: ${JSON.stringify(item)}`)
      assert.ok(item.copyBottom <= item.cardBottom + 0.5, `provider text must end inside its card: ${JSON.stringify(item)}`)
    }
    await setupFlowPage.getByRole('button', { name: 'Custom' }).click()
    assert.equal(await setupFlowPage.locator('.setup-state .workspace-system-field, .setup-state .workspace-param-grid, .setup-state .workspace-notes-field, .setup-state .workspace-tags-field, .setup-state .model-fetch-row, .setup-state .trust-row, .setup-state label.model-select').count(), 0)
    assert.equal(await setupFlowPage.locator('.setup-state .endpoint-actions button').count(), 1)
    await setupFlowPage.getByLabel('Profile name').fill('Custom gateway')
    await setupFlowPage.getByLabel('Base URL').fill('https://custom.example/v1')
    await setupFlowPage.getByRole('button', { name: 'Save & connect' }).scrollIntoViewIfNeeded()
    const saveButtonBox = await setupFlowPage.getByRole('button', { name: 'Save & connect' }).boundingBox()
    assert.ok(saveButtonBox, 'Save button should be reachable in short setup viewport')
    assert.ok(saveButtonBox.y >= 0 && saveButtonBox.y + saveButtonBox.height <= 540, 'Save button should scroll into view in short setup viewport')
    await setupFlowPage.getByLabel('API key', { exact: true }).fill('test-key')
    await setupFlowPage.getByRole('button', { name: 'Save & connect' }).scrollIntoViewIfNeeded()
    await setupFlowPage.getByRole('button', { name: 'Save & connect' }).click()
    await waitForCondition(() => setupFlowModelRequests.length === 1, 'setup save should auto-fetch models')
    await setupFlowPage.getByText('Chat ready').waitFor({ timeout: 10_000 })
    await setupFlowPage.getByRole('button', { name: /Custom gateway/ }).waitFor({ timeout: 10_000 })
    await setupFlowPage.locator('.toolbar-model-switcher select').waitFor({ timeout: 10_000 })
    assert.equal(await setupFlowPage.locator('.toolbar-model-switcher select').inputValue(), 'setup-auto-model')
    await setupFlowPage.getByPlaceholder(/Ask anything/i).fill('Smoke test the saved custom profile')
    await setupFlowPage.getByTitle('Send message').click()
    await setupFlowPage.getByText('Markdown works').waitFor({ timeout: 10_000 })
    assert.equal(setupFlowModelRequests[0].apiKey, 'test-key')
    assert.deepEqual(setupFlowRequests, ['setup-auto-model'])
    assert.deepEqual(setupFlowEvents, [])

    const path = caseScreenshotPath('manual-setup-chat')
    await writeFile(path, await setupFlowPage.screenshot({ fullPage: false }))
    console.log(`browser smoke manual setup chat ok: ${baseUrl}`)
    console.log(`screenshot: ${path}`)
  } finally {
    await setupFlowPage.close()
  }

  const modelsPage = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const modelEvents = []
  const modelRequests = []
  modelsPage.on('console', (message) => {
    if (message.type() === 'error') modelEvents.push(`console error: ${message.text()}`)
  })
  modelsPage.on('pageerror', (error) => {
    modelEvents.push(`page error: ${error.message}`)
  })
  await modelsPage.addInitScript(() => {
    const profile = {
      id: 'smoke-model-profile',
      name: 'Model fetch',
      provider: 'sub2api',
      baseUrl: 'https://api.byok.chat/v1',
      apiKey: 'test-key',
      selectedModel: 'gpt-4o',
      models: [],
    }
    localStorage.setItem('byok.chat.profiles.v1', JSON.stringify([profile]))
    localStorage.setItem('byok.chat.activeProfile.v1', profile.id)
    localStorage.removeItem('standalone.llmTester.profiles.v1')
    localStorage.removeItem('standalone.llmTester.activeProfile.v1')
  })
  await modelsPage.route('**/api/models', async (route) => {
    modelRequests.push(route.request().postDataJSON())
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        data: [
          {
            id: 'mock-model',
            name: 'Mock model',
            owned_by: 'Smoke',
            architecture: { output_modalities: ['text'] },
          },
          {
            id: 'grok-imagine-image',
            name: 'Grok Imagine Image',
            owned_by: 'xai',
            architecture: { output_modalities: ['image'] },
          },
        ],
      }),
    })
  })

  try {
    await modelsPage.goto(baseUrl, { waitUntil: 'networkidle' })
    await chooseNecessaryStorage(modelsPage)
    await modelsPage.getByText('Chat ready').waitFor({ timeout: 10_000 })
    if (await modelsPage.locator('.endpoint-drawer').count()) {
      await modelsPage.getByTitle('Close endpoint').click()
    }
    await modelsPage.locator('.assistant-workbench').waitFor({ timeout: 10_000 })
    await modelsPage.locator('.toolbar-model-switcher select').waitFor({ timeout: 10_000 })
    assert.equal(await modelsPage.locator('.run-control-strip').count(), 0)
    assert.equal(await modelsPage.locator('.toolbar-model-switcher select').count(), 1)
    await modelsPage.getByRole('button', { name: /Fetch models/i }).click()
    await modelsPage.locator('.workspace-panel[aria-label="Run controls"]').waitFor({ timeout: 10_000 })

    await waitForCondition(() => modelRequests.length === 1, 'model fetch should issue one request')
    await modelsPage.waitForFunction(() => (
      document.body.textContent?.includes('Chat ready') ||
      Boolean(document.querySelector('.model-picker select option[value="mock-model"], .model-select select option[value="mock-model"]'))
    ), undefined, { timeout: 10_000 })
    if (await modelsPage.locator('.model-picker select option[value="mock-model"], .model-select select option[value="mock-model"]').count() === 0) {
      await modelsPage.getByRole('button', { name: 'Endpoint', exact: true }).click()
      await modelsPage.locator('.endpoint-form').first().waitFor({ timeout: 10_000 })
    }
    await expectSelectOption(modelsPage, 'mock-model')
    await expectSelectOption(modelsPage, 'grok-imagine-image')
    const grokLabel = await modelsPage.locator('.model-picker select option[value="grok-imagine-image"], .model-select select option[value="grok-imagine-image"]').first().textContent()
    assert.match(grokLabel || '', /Image/)
    assert.doesNotMatch(grokLabel || '', /Unsupported/)
    assert.equal(modelRequests[0].baseUrl, 'https://api.byok.chat/v1')
    assert.equal(modelRequests[0].apiKey, 'test-key')
    assert.deepEqual(modelEvents, [])

    const path = caseScreenshotPath('models')
    await writeFile(path, await modelsPage.screenshot({ fullPage: false }))
    console.log(`browser smoke models ok: ${baseUrl}`)
    console.log(`screenshot: ${path}`)
  } finally {
    await modelsPage.close()
  }

  const saveFlowPage = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const saveFlowEvents = []
  const saveFlowModelRequests = []
  saveFlowPage.on('console', (message) => {
    if (message.type() === 'error') saveFlowEvents.push(`console error: ${message.text()}`)
  })
  saveFlowPage.on('pageerror', (error) => {
    saveFlowEvents.push(`page error: ${error.message}`)
  })
  await saveFlowPage.addInitScript(() => {
    const profile = {
      id: 'smoke-save-profile',
      name: 'Save flow',
      provider: 'sub2api',
      baseUrl: 'https://api.byok.chat/v1',
      apiKey: 'old-key',
      selectedModel: 'gpt-4o',
      models: [],
    }
    localStorage.setItem('byok.chat.profiles.v1', JSON.stringify([profile]))
    localStorage.setItem('byok.chat.activeProfile.v1', profile.id)
  })
  await saveFlowPage.route('**/api/models', async (route) => {
    saveFlowModelRequests.push(route.request().postDataJSON())
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        data: [
          {
            id: 'auto-model',
            name: 'Auto fetched chat model',
            owned_by: 'Smoke',
            architecture: { output_modalities: ['text'] },
          },
        ],
      }),
    })
  })

  try {
    await saveFlowPage.goto(baseUrl, { waitUntil: 'networkidle' })
    await chooseNecessaryStorage(saveFlowPage)
    await saveFlowPage.getByText('Chat ready').waitFor({ timeout: 10_000 })
    await saveFlowPage.getByRole('button', { name: 'Endpoint', exact: true }).click()
    await saveFlowPage.locator('.endpoint-drawer').waitFor({ timeout: 10_000 })
    await saveFlowPage.getByLabel('API key', { exact: true }).fill('new-key')
    await saveFlowPage.locator('.endpoint-drawer').getByRole('button', { name: 'Save changes', exact: true }).click()

    await waitForCondition(() => saveFlowModelRequests.length === 1, 'saving the endpoint should auto-fetch models')
    await saveFlowPage.locator('.endpoint-drawer').waitFor({ state: 'detached', timeout: 10_000 })
    await saveFlowPage.locator('.toolbar-model-switcher select').waitFor({ timeout: 10_000 })
    assert.equal(await saveFlowPage.locator('.toolbar-model-switcher select').inputValue(), 'auto-model')
    assert.equal(saveFlowModelRequests[0].apiKey, 'new-key')
    assert.deepEqual(saveFlowEvents, [])

    const path = caseScreenshotPath('save-autofetch')
    await writeFile(path, await saveFlowPage.screenshot({ fullPage: false }))
    console.log(`browser smoke save auto-fetch ok: ${baseUrl}`)
    console.log(`screenshot: ${path}`)
  } finally {
    await saveFlowPage.close()
  }

  const customGatewayPage = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const customGatewayEvents = []
  const customGatewayModelRequests = []
  const customGatewayChatRequests = []
  customGatewayPage.on('console', (message) => {
    if (message.type() === 'error') customGatewayEvents.push(`console error: ${message.text()}`)
  })
  customGatewayPage.on('pageerror', (error) => {
    customGatewayEvents.push(`page error: ${error.message}`)
  })
  await customGatewayPage.addInitScript(() => {
    const profile = {
      id: 'smoke-custom-gateway-profile',
      name: 'Custom gateway',
      provider: 'custom',
      baseUrl: 'https://gateway.example.com',
      apiKey: 'test-key',
      selectedModel: 'gpt-4o',
      models: [],
    }
    localStorage.setItem('byok.chat.profiles.v1', JSON.stringify([profile]))
    localStorage.setItem('byok.chat.activeProfile.v1', profile.id)
  })
  await customGatewayPage.route('**/api/models', async (route) => {
    customGatewayModelRequests.push(route.request().postDataJSON())
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ data: [] }),
    })
  })
  await customGatewayPage.route('**/api/chat', async (route) => {
    const body = route.request().postDataJSON()
    customGatewayChatRequests.push({
      model: body.profile.model,
      baseUrl: body.profile.baseUrl,
      provider: body.profile.provider,
    })
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(createMockChatJsonBody()),
    })
  })

  try {
    await customGatewayPage.goto(baseUrl, { waitUntil: 'networkidle' })
    await chooseNecessaryStorage(customGatewayPage)
    await customGatewayPage.getByText('Chat ready').waitFor({ timeout: 10_000 })
    await customGatewayPage.getByRole('button', { name: /Fetch models/i }).click()

    await waitForCondition(() => customGatewayModelRequests.length === 1, 'custom gateway model fetch should issue one request')
    await customGatewayPage.locator('.workspace-panel[aria-label="Run controls"]').waitFor({ timeout: 10_000 })
    await customGatewayPage.getByText('No compatible models returned. Keeping typed model gpt-4o.').waitFor({ timeout: 10_000 })
    await customGatewayPage.getByText('Chat ready').waitFor({ timeout: 10_000 })
    assert.equal(await customGatewayPage.locator('.model-bench').count(), 0)
    assert.equal(await customGatewayPage.getByText('Model passport').count(), 0)
    assert.equal(await customGatewayPage.locator('.run-settings-panel .typed-model-control input').inputValue(), 'gpt-4o')
    await customGatewayPage.getByRole('button', { name: 'Endpoint', exact: true }).click()
    assert.equal(await customGatewayPage.locator('.endpoint-drawer').count(), 1)
    const endpointInternetToggle = customGatewayPage.getByRole('checkbox', { name: /Internet access/ })
    assert.equal(await endpointInternetToggle.isDisabled(), true)
    await customGatewayPage.getByLabel('Internet search API key').fill('test-search-key')
    assert.equal(await endpointInternetToggle.isDisabled(), false)
    assert.equal(customGatewayModelRequests[0].provider, 'custom')
    assert.equal(customGatewayModelRequests[0].baseUrl, 'https://gateway.example.com')
    assert.equal(customGatewayModelRequests[0].apiKey, 'test-key')

    await customGatewayPage.getByTitle('Close endpoint').click()
    assert.equal(await customGatewayPage.locator('.endpoint-drawer').count(), 0)
    await customGatewayPage.getByPlaceholder(/Ask anything/i).fill('Verify typed model still works after empty model list')
    await customGatewayPage.getByTitle('Send message').click()
    await customGatewayPage.getByText('Markdown works').waitFor({ timeout: 10_000 })
    assert.deepEqual(customGatewayChatRequests, [{
      model: 'gpt-4o',
      baseUrl: 'https://gateway.example.com',
      provider: 'custom',
    }])
    assert.deepEqual(customGatewayEvents, [])

    const path = caseScreenshotPath('custom-gateway-empty-models-chat')
    await writeFile(path, await customGatewayPage.screenshot({ fullPage: false }))
    console.log(`browser smoke custom empty-model fallback ok: ${baseUrl}`)
    console.log(`screenshot: ${path}`)
  } finally {
    await customGatewayPage.close()
  }

  const chatPage = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const chatEvents = []
  chatPage.on('console', (message) => {
    if (message.type() === 'error') chatEvents.push(`console error: ${message.text()}`)
  })
  chatPage.on('pageerror', (error) => {
    chatEvents.push(`page error: ${error.message}`)
  })

  await chatPage.addInitScript(() => {
    const profile = {
      id: 'smoke-profile',
      name: 'Smoke profile',
      provider: 'custom',
      baseUrl: 'https://mock.local/v1',
      apiKey: 'test-key',
      selectedModel: 'mock-model',
      models: [{ id: 'mock-model', name: 'Mock model', ownedBy: 'Smoke', raw: { id: 'mock-model' } }],
    }
    localStorage.setItem('byok.chat.profiles.v1', JSON.stringify([profile]))
    localStorage.setItem('byok.chat.activeProfile.v1', profile.id)
  })

  const chatRequests = []
  await chatPage.route('**/api/chat', async (route) => {
    chatRequests.push(route.request().postDataJSON())
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(createMockChatJsonBody({
        tools: [{
          id: 'tool-1',
          name: 'webSearch',
          input: 'Byok Chat workspace',
          status: 'ok',
          title: 'Example source',
          url: 'https://example.com/research',
          excerpt: 'Mock search result with source metadata.',
        }],
      })),
    })
  })
  await chatPage.route('**/api/diagnostics', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        status: 'ok',
        checks: [
          { label: 'Base URL', status: 'ok', message: 'Base URL is valid.' },
          { label: 'API key', status: 'ok', message: 'A key is present for this browser session.' },
        ],
      }),
    })
  })

  try {
    const longUserPrompt = 'Compare this model against the last answer and call out the tradeoffs.'
    await chatPage.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(baseUrl).origin })

    await chatPage.goto(baseUrl, { waitUntil: 'networkidle' })
    await captureDockedConsent(chatPage, 'chat-consent')
    await chooseNecessaryStorage(chatPage)
    await chatPage.getByText('Chat ready').waitFor({ timeout: 10_000 })
    const readyGridColumns = await chatPage.locator('.app-shell').evaluate((element) => getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length)
    assert.equal(readyGridColumns, 2)
    const readyChatLayout = await chatPage.evaluate(() => {
      const toolbar = document.querySelector('.workspace-toolbar')?.getBoundingClientRect()
      const viewport = document.querySelector('.thread-viewport')?.getBoundingClientRect()
      return {
        runStripCount: document.querySelectorAll('.run-control-strip').length,
        modelSwitcherCount: document.querySelectorAll('.toolbar-model-switcher select').length,
        toolbarHeight: toolbar?.height ?? 0,
        threadViewportHeight: viewport?.height ?? 0,
      }
    })
    assert.equal(readyChatLayout.runStripCount, 0)
    assert.equal(readyChatLayout.modelSwitcherCount, 1)
    assert.ok(readyChatLayout.toolbarHeight <= 76, `ready chat toolbar should stay compact, got ${readyChatLayout.toolbarHeight}px`)
    assert.ok(readyChatLayout.threadViewportHeight >= 500, `ready chat should keep the conversation dominant, got viewport ${readyChatLayout.threadViewportHeight}px`)
    assert.equal(await chatPage.locator('.model-bench').count(), 0)
    assert.equal(await chatPage.getByText('Model passport').count(), 0)
    assert.equal(await chatPage.locator('.endpoint-drawer').count(), 0)
    const internetToggle = chatPage.getByRole('switch', { name: 'Internet access' })
    const memoryToggle = chatPage.getByRole('switch', { name: 'Conversation memory' })
    assert.equal(await internetToggle.getAttribute('aria-checked'), 'false')
    assert.equal(await memoryToggle.getAttribute('aria-checked'), 'true')
    await internetToggle.click()
    await chatPage.getByText('Add a search API key').waitFor({ timeout: 10_000 })
    assert.equal(await internetToggle.getAttribute('aria-checked'), 'false')
    await chatPage.getByLabel('Internet search API key').fill('smoke-search-key')
    await chatPage.getByRole('button', { name: 'Enable Internet' }).click()
    assert.equal(await internetToggle.getAttribute('aria-checked'), 'true')
    await chatPage.getByPlaceholder(/Ask anything/i).fill(longUserPrompt)
    await chatPage.getByTitle('Send message').click()

    await chatPage.getByText('Markdown works').waitFor({ timeout: 10_000 })
    const assistantTextContrast = await chatPage.locator('.message-assistant .markdown-content').first().evaluate((element) => {
      function parseRgb(value) {
        const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
        return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : [0, 0, 0]
      }
      function luminance([red, green, blue]) {
        const normalized = [red, green, blue].map((channel) => {
          const value = channel / 255
          return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
        })
        return 0.2126 * normalized[0] + 0.7152 * normalized[1] + 0.0722 * normalized[2]
      }
      function readableBackground(node) {
        let current = node
        while (current && current instanceof Element) {
          const background = getComputedStyle(current).backgroundColor
          if (!background.endsWith(', 0)') && background !== 'transparent' && background !== 'rgba(0, 0, 0, 0)') return background
          current = current.parentElement
        }
        return getComputedStyle(document.body).backgroundColor
      }
      const foreground = luminance(parseRgb(getComputedStyle(element).color))
      const background = luminance(parseRgb(readableBackground(element)))
      return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
    })
    assert.ok(assistantTextContrast >= 4.5, `assistant message text contrast should be readable, got ${assistantTextContrast.toFixed(2)}`)
    const userBubbleBox = await chatPage.locator('.message-user .message-body').first().boundingBox()
    assert.ok(userBubbleBox, 'user message bubble should render')
    assert.ok(userBubbleBox.width >= 260, `user message bubble should not collapse horizontally, got ${userBubbleBox.width}px`)
    assert.ok(userBubbleBox.height <= 120, `user message bubble should not wrap into a tall column, got ${userBubbleBox.height}px`)
    assert.ok(await chatPage.getByTitle('Copy message').count() >= 1)
    assert.ok(await chatPage.getByTitle('Retry').count() >= 1)
    assert.ok(await chatPage.getByTitle('Variation').count() >= 1)
    assert.ok(await chatPage.getByTitle('Edit prompt').count() >= 1)
    assert.equal(await chatPage.getByTitle('Regenerate').count(), 0)
    assert.equal(await chatPage.getByTitle('Edit message').count(), 0)
    assert.equal(await chatPage.getByTitle('Read aloud').count(), 0)
    assert.equal(await chatPage.getByTitle('Good response').count(), 0)
    assert.equal(await chatPage.getByTitle('Poor response').count(), 0)
    assert.equal(await chatPage.getByTitle('Export markdown').count(), 0)
    assert.equal(await chatPage.locator('.markdown-content strong', { hasText: 'Markdown works' }).count(), 1)
    assert.equal(await chatPage.locator('.tool-card', { hasText: 'webSearch' }).count(), 1)
    const toolDetails = chatPage.locator('.tool-details').first()
    assert.equal(await toolDetails.evaluate((element) => element.open), false)
    assert.equal(await chatPage.locator('.tool-summary', { hasText: 'Example source' }).count(), 1)
    await toolDetails.locator('summary').click()
    assert.equal(await toolDetails.evaluate((element) => element.open), true)
    assert.equal(await chatPage.locator('.source-citation[href="https://example.com/research"]').count(), 1)
    assert.equal(chatRequests.length, 1)
    assert.equal(chatRequests[0].tools.enabled.webSearch, true)
    assert.equal(chatRequests[0].tools.permissions.webSearch, 'allow')
    assert.equal(chatRequests[0].tools.enabled.readUrl, true)
    assert.equal(chatRequests[0].tools.permissions.readUrl, 'allow')
    assert.equal(chatRequests[0].tools.memory, true)
    assert.equal(chatRequests[0].tools.searchApiKey, 'smoke-search-key')

    await memoryToggle.click()
    assert.equal(await memoryToggle.getAttribute('aria-checked'), 'false')

    const fileChooserPromise = chatPage.waitForEvent('filechooser')
    await chatPage.getByRole('button', { name: 'Attach files' }).click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles({
      name: 'smoke-brief.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 smoke attachment'),
    })
    await chatPage.locator('.attachment-chip', { hasText: 'smoke-brief.pdf' }).waitFor({ timeout: 10_000 })
    await chatPage.getByPlaceholder(/Ask anything/i).fill('Summarize the attached PDF')
    await chatPage.getByTitle('Send message').click()
    await waitForCondition(() => chatRequests.length >= 2, 'attachment send should issue a chat request')
    const attachmentRequest = chatRequests.at(-1)
    const attachmentMessage = attachmentRequest.messages.at(-1)
    assert.equal(attachmentRequest.messages.length, 1)
    assert.equal(attachmentRequest.tools.memory, false)
    assert.equal(attachmentMessage.attachments.length, 1)
    assert.equal(attachmentMessage.attachments[0].name, 'smoke-brief.pdf')
    assert.match(attachmentMessage.attachments[0].dataUrl, /^data:application\/pdf;base64,/)
    await chatPage.locator('.input-attachment-card', { hasText: 'smoke-brief.pdf' }).waitFor({ timeout: 10_000 })
    const persistedThreads = await chatPage.evaluate(() => localStorage.getItem('byok.chat.threads.v2') || '')
    assert.doesNotMatch(persistedThreads, /smoke attachment|JVBERi0xLjQ/)

    await chatPage.locator('.message-assistant .message-actions button[title="Copy message"]').first().click()
    const copiedText = await chatPage.evaluate(() => navigator.clipboard.readText())
    assert.match(copiedText, /Markdown works/)

    const requestsBeforeVariation = chatRequests.length
    await chatPage.getByTitle('Variation').first().click()
    await waitForCondition(() => chatRequests.length > requestsBeforeVariation, 'variation should issue a new chat request')

    await chatPage.getByTitle('Edit prompt').first().click()
    await chatPage.getByText('Editing an earlier prompt. Sending will replace that branch.').waitFor({ timeout: 10_000 })
    assert.match(await chatPage.getByPlaceholder(/Ask anything/i).inputValue(), /Compare this model/)
    await chatPage.getByTitle('Cancel edit').click()

    if (await chatPage.getByTitle('Thread actions').count()) {
      await chatPage.getByTitle('Thread actions').click()
      await chatPage.getByRole('menuitem', { name: /Archive thread/i }).click()
    } else {
      await chatPage.getByTitle('Archive thread').click()
    }
    await chatPage.getByRole('dialog', { name: /Archive thread/i }).waitFor({ timeout: 10_000 })
    await chatPage.getByRole('button', { name: 'Archive', exact: true }).click()
    await chatPage.getByRole('button', { name: 'Undo', exact: true }).click()
    await chatPage.locator('.message-user .markdown-content', { hasText: longUserPrompt }).waitFor({ timeout: 10_000 })

    await chatPage.getByRole('button', { name: /Diagnose/i }).click()
    await chatPage.getByText('Base URL is valid.').waitFor({ timeout: 10_000 })
    await chatPage.getByRole('button', { name: 'Compare', exact: true }).click()
    await chatPage.getByPlaceholder(/Prompt to run across selected profiles/i).fill('Compare smoke prompt')
    await chatPage.getByRole('button', { name: /Run compare/i }).click()
    await chatPage.getByText('Pick winner').waitFor({ timeout: 10_000 })
    assert.ok(chatRequests.length >= 2)
    assert.deepEqual(chatEvents, [])

    const path = caseScreenshotPath('chat')
    await writeFile(path, await chatPage.screenshot({ fullPage: false }))
    console.log(`browser smoke chat ok: ${baseUrl}`)
    console.log(`screenshot: ${path}`)
  } finally {
    await chatPage.close()
  }

  const mobileReadyPage = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const mobileReadyEvents = []
  mobileReadyPage.on('console', (message) => {
    if (message.type() === 'error') mobileReadyEvents.push(`console error: ${message.text()}`)
  })
  mobileReadyPage.on('pageerror', (error) => {
    mobileReadyEvents.push(`page error: ${error.message}`)
  })
  await mobileReadyPage.addInitScript(() => {
    const profile = {
      id: 'smoke-mobile-profile',
      name: 'Mobile smoke',
      provider: 'custom',
      baseUrl: 'https://mock.local/v1',
      apiKey: 'test-key',
      selectedModel: 'mock-model',
      models: [{ id: 'mock-model', name: 'Mock model', ownedBy: 'Smoke', raw: { id: 'mock-model' } }],
    }
    localStorage.setItem('byok.chat.profiles.v1', JSON.stringify([profile]))
    localStorage.setItem('byok.chat.activeProfile.v1', profile.id)
  })

  try {
    await mobileReadyPage.goto(baseUrl, { waitUntil: 'networkidle' })
    await captureDockedConsent(mobileReadyPage, 'mobile-ready-consent')
    await chooseNecessaryStorage(mobileReadyPage)
    await mobileReadyPage.getByText('Chat ready').waitFor({ timeout: 10_000 })
    const readyMobileLayout = await mobileReadyPage.evaluate(() => {
      const consoleMain = document.querySelector('.console-main')?.getBoundingClientRect()
      const sidebar = document.querySelector('.lab-sidebar')?.getBoundingClientRect()
      const actions = [...document.querySelectorAll('.workspace-actions .button')].map((element) => ({
        width: Math.round(element.getBoundingClientRect().width),
        height: Math.round(element.getBoundingClientRect().height),
        text: element.textContent?.trim() || '',
      })).filter((action) => action.width > 0 && action.height > 0)
      const modelSwitcher = document.querySelector('.toolbar-model-switcher')?.getBoundingClientRect()
      const brand = document.querySelector('.mobile-brand-lockup')?.getBoundingClientRect()
      const statusChips = [...document.querySelectorAll('.strip-meter > span')]
        .filter((element) => getComputedStyle(element).display !== 'none')
        .map((element) => element.getBoundingClientRect().right)
      return {
        consoleTop: consoleMain?.top ?? -1,
        sidebarTop: sidebar?.top ?? -1,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
        actions,
        modelSwitcherWidth: modelSwitcher?.width ?? 0,
        brandTop: brand?.top ?? -1,
        brandBottom: brand?.bottom ?? -1,
        statusChips,
      }
    })
    assert.ok(readyMobileLayout.consoleTop <= 1, `ready mobile should open on chat workspace, got console top ${readyMobileLayout.consoleTop}`)
    assert.ok(readyMobileLayout.sidebarTop >= readyMobileLayout.viewportHeight - 1, `ready mobile rail should sit below chat, got top ${readyMobileLayout.sidebarTop}`)
    assert.ok(readyMobileLayout.modelSwitcherWidth > 0 && readyMobileLayout.modelSwitcherWidth <= readyMobileLayout.viewportWidth - 20, `mobile model switcher should fit the viewport, got ${JSON.stringify(readyMobileLayout)}`)
    assert.deepEqual(readyMobileLayout.actions.map((action) => action.text), ['Fetch', 'More'])
    assert.ok(readyMobileLayout.actions.every((action) => action.height >= 44), `mobile toolbar actions should meet 44px touch targets, got ${JSON.stringify(readyMobileLayout.actions)}`)
    assert.ok(readyMobileLayout.brandTop >= 0 && readyMobileLayout.brandBottom <= readyMobileLayout.viewportHeight, `mobile product identity should be visible: ${JSON.stringify(readyMobileLayout)}`)
    assert.ok(readyMobileLayout.statusChips.every((right) => right <= readyMobileLayout.viewportWidth + 1), `ready mobile status chips should not clip: ${JSON.stringify(readyMobileLayout.statusChips)}`)

    const moreButton = mobileReadyPage.getByRole('button', { name: 'More', exact: true })
    await moreButton.click()
    const mobileActionsDialog = mobileReadyPage.getByRole('dialog', { name: 'More actions' })
    await mobileActionsDialog.waitFor({ timeout: 10_000 })
    assert.equal(await mobileReadyPage.evaluate(() => document.activeElement?.textContent?.trim()), 'Run controls')
    await mobileReadyPage.keyboard.press('Shift+Tab')
    assert.equal(await mobileReadyPage.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Close more actions')
    await mobileReadyPage.keyboard.press('Shift+Tab')
    assert.equal(await mobileReadyPage.evaluate(() => document.activeElement?.textContent?.trim()), 'Delete thread')
    await mobileReadyPage.keyboard.press('Tab')
    assert.equal(await mobileReadyPage.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Close more actions')
    await mobileReadyPage.keyboard.press('Escape')
    await mobileActionsDialog.waitFor({ state: 'detached', timeout: 10_000 })
    assert.equal(await moreButton.evaluate((element) => document.activeElement === element), true)

    await moreButton.click()
    await mobileReadyPage.locator('.mobile-actions-backdrop').click({ position: { x: 4, y: 4 } })
    await mobileActionsDialog.waitFor({ state: 'detached', timeout: 10_000 })
    assert.equal(await moreButton.evaluate((element) => document.activeElement === element), true)

    await moreButton.click()
    await mobileReadyPage.setViewportSize({ width: 900, height: 844 })
    await mobileActionsDialog.waitFor({ state: 'detached', timeout: 10_000 })
    assert.equal(await mobileReadyPage.locator('.mobile-more-trigger').getAttribute('aria-expanded'), 'false')
    await mobileReadyPage.setViewportSize({ width: 390, height: 844 })

    await moreButton.click()
    await mobileActionsDialog.getByRole('button', { name: 'Archive thread', exact: true }).click()
    const mobileArchiveDialog = mobileReadyPage.getByRole('dialog', { name: 'Archive thread?' })
    await mobileArchiveDialog.waitFor({ timeout: 10_000 })
    assert.equal(await mobileReadyPage.evaluate(() => document.activeElement?.textContent?.trim()), 'Cancel')
    await mobileReadyPage.keyboard.press('Shift+Tab')
    assert.equal(await mobileReadyPage.evaluate(() => document.activeElement?.textContent?.trim()), 'Archive')
    await mobileReadyPage.keyboard.press('Tab')
    assert.equal(await mobileReadyPage.evaluate(() => document.activeElement?.textContent?.trim()), 'Cancel')
    await mobileReadyPage.keyboard.press('Escape')
    await mobileArchiveDialog.waitFor({ state: 'detached', timeout: 10_000 })
    assert.equal(await moreButton.evaluate((element) => document.activeElement === element), true)

    await mobileReadyPage.setViewportSize({ width: 375, height: 812 })
    const narrowMobileLayout = await mobileReadyPage.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      privacyDisplay: getComputedStyle(document.querySelector('.privacy-pill')).display,
    }))
    assert.ok(narrowMobileLayout.documentWidth <= narrowMobileLayout.viewportWidth + 1, `375px mobile layout should not overflow: ${JSON.stringify(narrowMobileLayout)}`)
    assert.equal(narrowMobileLayout.privacyDisplay, 'none')

    await moreButton.click()
    await mobileReadyPage.getByRole('dialog', { name: 'More actions' }).getByRole('button', { name: 'Tools', exact: true }).click()
    await mobileReadyPage.locator('.workspace-panel[aria-label="Tools"]').waitFor({ timeout: 10_000 })
    const panelLayout = await mobileReadyPage.locator('.workspace-panel[aria-label="Tools"]').evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        position: getComputedStyle(element).position,
        top: rect.top,
        bottom: rect.bottom,
        viewportHeight: window.innerHeight,
      }
    })
    assert.equal(panelLayout.position, 'fixed')
    assert.ok(panelLayout.top >= 0 && panelLayout.bottom <= panelLayout.viewportHeight, `mobile tool panel should stay inside viewport, got ${JSON.stringify(panelLayout)}`)
    assert.deepEqual(mobileReadyEvents, [])

    const path = caseScreenshotPath('mobile-ready')
    await writeFile(path, await mobileReadyPage.screenshot({ fullPage: false }))
    console.log(`browser smoke mobile ready layout ok: ${baseUrl}`)
    console.log(`screenshot: ${path}`)
  } finally {
    await mobileReadyPage.close()
  }

  const chatErrorPage = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const chatErrorEvents = []
  chatErrorPage.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) chatErrorEvents.push(`console error: ${message.text()}`)
  })
  chatErrorPage.on('pageerror', (error) => {
    chatErrorEvents.push(`page error: ${error.message}`)
  })

  await chatErrorPage.addInitScript(() => {
    const profile = {
      id: 'smoke-error-profile',
      name: 'Error profile',
      provider: 'custom',
      baseUrl: 'https://mock.local/v1',
      apiKey: 'test-key',
      selectedModel: 'mock-model',
      models: [{ id: 'mock-model', name: 'Mock model', ownedBy: 'Smoke', raw: { id: 'mock-model' } }],
    }
    localStorage.setItem('byok.chat.profiles.v1', JSON.stringify([profile]))
    localStorage.setItem('byok.chat.activeProfile.v1', profile.id)
  })

  let chatErrorRequests = 0
  await chatErrorPage.route('**/api/chat', async (route) => {
    chatErrorRequests += 1
    await route.fulfill({
      status: 400,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ error: { message: chatErrorRequests === 1 ? 'Provider rejected this chat model' : 'Provider rejected this chat model again' } }),
    })
  })

  try {
    await chatErrorPage.goto(baseUrl, { waitUntil: 'networkidle' })
    await chooseNecessaryStorage(chatErrorPage)
    await chatErrorPage.getByPlaceholder(/Ask anything/i).fill('Trigger provider failure')
    await chatErrorPage.getByTitle('Send message').click()

    await chatErrorPage.getByText('Provider rejected this chat model').waitFor({ timeout: 10_000 })
    const recovery = chatErrorPage.locator('.message-error').last()
    assert.equal(await recovery.getByRole('button', { name: 'Retry', exact: true }).count(), 1)
    assert.equal(await recovery.getByRole('button', { name: 'Choose another model', exact: true }).count(), 1)
    assert.equal(await recovery.getByRole('button', { name: 'Endpoint settings', exact: true }).count(), 1)
    await recovery.getByRole('button', { name: 'Retry', exact: true }).click()
    await waitForCondition(() => chatErrorRequests === 2, 'error recovery should retry the failed request')
    await chatErrorPage.getByText('Provider rejected this chat model again', { exact: true }).waitFor({ timeout: 10_000 })
    assert.equal(await chatErrorPage.locator('.message-assistant').count(), 1)
    assert.equal(await chatErrorPage.locator('.message-error-state').count(), 1)
    assert.equal(await chatErrorPage.getByText('Provider rejected this chat model', { exact: true }).count(), 0)
    assert.equal(await chatErrorPage.locator('.message-error-state').getByRole('button', { name: 'Retry', exact: true }).count(), 1)
    await chatErrorPage.locator('.message-error').last().getByRole('button', { name: 'Choose another model', exact: true }).click()
    await chatErrorPage.locator('.workspace-panel[aria-label="Run controls"]').waitFor({ timeout: 10_000 })
    await chatErrorPage.getByTitle('Close Run controls').click()
    await chatErrorPage.locator('.message-error').last().getByRole('button', { name: 'Endpoint settings', exact: true }).click()
    await chatErrorPage.locator('.endpoint-drawer[aria-label="Endpoint setup"]').waitFor({ timeout: 10_000 })
    await chatErrorPage.getByTitle('Close endpoint').click()
    assert.deepEqual(chatErrorEvents, [])

    const path = caseScreenshotPath('chat-error')
    await writeFile(path, await chatErrorPage.screenshot({ fullPage: false }))
    console.log(`browser smoke chat error ok: ${baseUrl}`)
    console.log(`screenshot: ${path}`)
  } finally {
    await chatErrorPage.close()
  }

  const mediaPage = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const mediaEvents = []
  mediaPage.on('console', (message) => {
    if (message.type() === 'error') mediaEvents.push(`console error: ${message.text()}`)
  })
  mediaPage.on('pageerror', (error) => {
    mediaEvents.push(`page error: ${error.message}`)
  })

  await mediaPage.addInitScript(() => {
    const mediaProfile = {
      id: 'smoke-media-profile',
      name: 'Image profile',
      provider: 'custom',
      baseUrl: 'https://mock.local/v1',
      apiKey: 'test-key',
      selectedModel: 'gpt-image-2',
      models: [{ id: 'gpt-image-2', name: 'GPT Image 2', ownedBy: 'Smoke', raw: { id: 'gpt-image-2', architecture: { output_modalities: ['image'] } } }],
    }
    const chatProfile = {
      id: 'smoke-chat-profile',
      name: 'Chat profile',
      provider: 'custom',
      baseUrl: 'https://mock.local/v1',
      apiKey: 'test-key',
      selectedModel: 'gpt-4o',
      models: [{ id: 'gpt-4o', name: 'GPT 4o', ownedBy: 'Smoke', raw: { id: 'gpt-4o', architecture: { output_modalities: ['text'] } } }],
    }
    localStorage.setItem('byok.chat.profiles.v1', JSON.stringify([mediaProfile, chatProfile]))
    localStorage.setItem('byok.chat.activeProfile.v1', mediaProfile.id)
  })

  const transparentPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='
  const mediaRequests = []
  let releaseMediaResponse
  const mediaResponseReady = new Promise((resolve) => {
    releaseMediaResponse = resolve
  })
  await mediaPage.route('**/api/media', async (route) => {
    mediaRequests.push(route.request().postDataJSON())
    await mediaResponseReady
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        mode: 'image_generation',
        model: 'gpt-image-2',
        text: 'Generated 1 image.',
        attachments: [{
          kind: 'image',
          url: `data:image/png;base64,${transparentPng}`,
          mediaType: 'image/png',
          name: 'generated-image-1.png',
        }],
      }),
    })
  })

  try {
    await mediaPage.goto(baseUrl, { waitUntil: 'networkidle' })
    await chooseNecessaryStorage(mediaPage)
    await mediaPage.getByText('Image ready').waitFor({ timeout: 10_000 })
    await mediaPage.getByPlaceholder(/Describe the image/i).fill('ufo flying over 70s hong kong skyline')
    await mediaPage.getByTitle('Send message').click()
    await mediaPage.getByText('Image generation started.').waitFor({ timeout: 10_000 })
    await mediaPage.getByRole('button', { name: /Chat profile/i }).click()
    await mediaPage.getByText('Chat ready').waitFor({ timeout: 10_000 })

    releaseMediaResponse()

    await mediaPage.getByRole('button', { name: /Image profile/i }).click()
    await mediaPage.locator('img[alt="generated-image-1.png"]').waitFor({ timeout: 10_000 })
    assert.equal(mediaRequests.length, 1)
    assert.equal(mediaRequests[0].mode, 'image_generation')
    assert.equal(mediaRequests[0].model, 'gpt-image-2')
    assert.equal(mediaRequests[0].prompt, 'ufo flying over 70s hong kong skyline')
    assert.equal(await mediaPage.locator('.message-assistant .run-meta span').count(), 0)
    assert.equal(await mediaPage.getByText(/n\/a/i).count(), 0)
    assert.deepEqual(mediaEvents, [])

    const path = caseScreenshotPath('media')
    await writeFile(path, await mediaPage.screenshot({ fullPage: false }))
    console.log(`browser smoke media ok: ${baseUrl}`)
    console.log(`screenshot: ${path}`)
  } finally {
    await mediaPage.close()
  }

  const legalPage = await browser.newPage({ viewport: { width: 390, height: 844 } })
  try {
    for (const legalPath of ['privacy', 'terms', 'cookies']) {
      await legalPage.goto(new URL(`/${legalPath}`, baseUrl).toString(), { waitUntil: 'networkidle' })
      await chooseNecessaryStorage(legalPage)
      await legalPage.locator('.legal-document').waitFor({ timeout: 10_000 })
      assert.equal(await legalPage.locator('.legal-shell').count(), 1)
      assert.ok((await legalPage.title()).includes('BYOK Chat'))
      const width = await legalPage.evaluate(() => ({
        document: document.documentElement.scrollWidth,
        viewport: innerWidth,
        touchTargets: [...document.querySelectorAll('.legal-nav a, .legal-footer button')]
          .filter((element) => getComputedStyle(element).display !== 'none')
          .map((element) => element.getBoundingClientRect().height),
      }))
      assert.ok(width.document <= width.viewport + 1, `${legalPath} should not overflow horizontally: ${JSON.stringify(width)}`)
      assert.ok(width.touchTargets.every((height) => height >= 44), `${legalPath} navigation should meet 44px touch targets: ${JSON.stringify(width.touchTargets)}`)
    }
    console.log(`browser smoke legal pages ok: ${baseUrl}`)
  } finally {
    await legalPage.close()
  }
} finally {
  await browser.close()
}

function createMockChatJsonBody(extra = {}) {
  return {
    text: [
      '**Markdown works** in Byok Chat.',
      '',
      '- Lists render correctly.',
      '- `inline code` is styled.',
      '',
      '| Feature | Status |',
      '| --- | --- |',
      '| Tool cards | Visible |',
    ].join('\n'),
    tools: [],
    metadata: {
      provider: 'custom',
      model: 'mock-model',
      latencyMs: 123,
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
      estimatedCostUsd: 0.0001,
      statusCode: 200,
      createdAt: new Date().toISOString(),
    },
    ...extra,
  }
}

function getProxyConfig(targetUrl) {
  if (process.env.BYOK_CHAT_PROXY) {
    return { server: process.env.BYOK_CHAT_PROXY }
  }

  const hostname = new URL(targetUrl).hostname
  if (['localhost', '127.0.0.1', '::1'].includes(hostname)) {
    return undefined
  }

  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.ALL_PROXY || process.env.all_proxy
  return proxy ? { server: proxy } : undefined
}

async function expectSelectOption(page, value) {
  await page.waitForFunction((optionValue) => {
    const select = document.querySelector('.model-picker select, .model-select select')
    return select instanceof HTMLSelectElement && Array.from(select.options).some((option) => option.value === optionValue)
  }, value)
}

async function waitForCondition(predicate, message, timeoutMs = 5_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  assert.fail(message)
}

import test from 'node:test'
import assert from 'node:assert/strict'
import worker from '../src/worker.ts'

function chatRequestBody(overrides = {}) {
  return {
    profile: {
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'mock-model',
      ...overrides.profile,
    },
    messages: [{ role: 'user', content: 'Say hello' }],
    tools: {
      enabled: { webSearch: false, readUrl: false },
      permissions: { webSearch: 'deny', readUrl: 'deny' },
      ...overrides.tools,
    },
  }
}

function pdfWithText(text) {
  const escaped = text.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)')
  const stream = `BT /F1 18 Tf 72 120 Td (${escaped}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf))
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xrefOffset = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  return Buffer.from(pdf).toString('base64')
}

async function runProviderChatMapping({ provider, baseUrl, expectedPath }) {
  const requests = []
  const response = await worker.fetch(new Request('https://byok.chat/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(chatRequestBody({
      profile: { provider, baseUrl, model: 'mock-model' },
    })),
  }), {
    ASSETS: { fetch: async () => new Response('asset') },
    UPSTREAM_FETCH: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      requests.push({
        path: new URL(request.url).pathname,
        authorization: request.headers.get('authorization'),
        body: await request.json(),
      })
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'mapped' } }],
        usage: { total_tokens: 3 },
      }), { headers: { 'content-type': 'application/json' } })
    },
  })
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.text, 'mapped')
  assert.equal(requests.length, 1)
  assert.equal(requests[0].path, expectedPath)
  assert.equal(requests[0].authorization, 'Bearer test-key')
  assert.equal(requests[0].body.model, 'mock-model')
  assert.equal(requests[0].body.stream, false)
}

test('returns JSON chat text with usage metadata for persistent threads', async () => {
  const requests = []
  const response = await worker.fetch(new Request('https://byok.chat/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(chatRequestBody({
      profile: { provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o' },
    })),
  }), {
    ASSETS: { fetch: async () => new Response('asset') },
    UPSTREAM_FETCH: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      requests.push({
        path: new URL(request.url).pathname,
        authorization: request.headers.get('authorization'),
        body: await request.json(),
      })
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'Hello from JSON chat' } }],
        usage: { prompt_tokens: 8, completion_tokens: 5, total_tokens: 13 },
      }), { headers: { 'content-type': 'application/json' } })
    },
  })
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(requests[0].path, '/v1/chat/completions')
  assert.equal(requests[0].authorization, 'Bearer test-key')
  assert.equal(requests[0].body.stream, false)
  assert.equal(body.text, 'Hello from JSON chat')
  assert.equal(body.metadata.inputTokens, 8)
  assert.equal(body.metadata.outputTokens, 5)
  assert.equal(body.metadata.totalTokens, 13)
})

test('routes chatgpt-web models through the native Responses metadata contract', async () => {
  const requests = []
  const response = await worker.fetch(new Request('https://byok.chat/api/chat-json', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...chatRequestBody({
        profile: {
          provider: 'sub2api',
          baseUrl: 'https://gateway.example.com/v1',
          model: 'chatgpt-web/high',
        },
      }),
      messages: [
        { role: 'system', content: 'Keep the answer exact.' },
        { role: 'user', content: 'Earlier question' },
        { role: 'assistant', content: 'Earlier answer' },
        { role: 'user', content: 'Reply with exactly: BRIDGE-READY' },
      ],
    }),
  }), {
    ASSETS: { fetch: async () => new Response('asset') },
    UPSTREAM_FETCH: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      requests.push({
        path: new URL(request.url).pathname,
        authorization: request.headers.get('authorization'),
        turnMetadata: request.headers.get('x-codex-turn-metadata'),
        redirect: request.redirect,
        body: await request.json(),
      })
      return new Response(JSON.stringify({
        id: 'resp_bridge',
        status: 'completed',
        model: 'chatgpt-web/high',
        output: [{
          type: 'message',
          role: 'assistant',
          phase: 'final_answer',
          content: [{ type: 'output_text', text: 'BRIDGE-READY' }],
        }],
        usage: { input_tokens: 12, output_tokens: 3, total_tokens: 15 },
      }), { headers: { 'content-type': 'application/json' } })
    },
  })
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].path, '/v1/responses')
  assert.equal(requests[0].authorization, 'Bearer test-key')
  assert.equal(requests[0].redirect, 'manual')
  const metadata = JSON.parse(requests[0].turnMetadata)
  assert.match(metadata.thread_id, /^thread_byok_chat_/)
  assert.match(metadata.turn_id, /^turn_byok_chat_/)
  assert.equal(requests[0].body.client_metadata['x-codex-turn-metadata'], requests[0].turnMetadata)
  assert.equal(requests[0].body.input[0].role, 'system')
  assert.equal(requests[0].body.input[2].role, 'assistant')
  assert.deepEqual(requests[0].body.input[2].content, [{ type: 'output_text', text: 'Earlier answer' }])
  assert.equal(requests[0].body.input.at(-1).internal_chat_message_metadata_passthrough.turn_id, metadata.turn_id)
  assert.deepEqual(requests[0].body.input.at(-1).content, [{ type: 'input_text', text: 'Reply with exactly: BRIDGE-READY' }])
  assert.equal(requests[0].body.stream, false)
  assert.equal(body.text, 'BRIDGE-READY')
  assert.equal(body.metadata.inputTokens, 12)
  assert.equal(body.metadata.outputTokens, 3)
  assert.equal(body.metadata.totalTokens, 15)
})

test('surfaces a failed native Responses object as an upstream chat error', async () => {
  const response = await worker.fetch(new Request('https://byok.chat/api/chat-json', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(chatRequestBody({
      profile: {
        provider: 'custom',
        baseUrl: 'https://gateway.example.com/v1',
        model: 'chatgpt-web/high',
      },
    })),
  }), {
    ASSETS: { fetch: async () => new Response('asset') },
    UPSTREAM_FETCH: async () => new Response(JSON.stringify({
      id: 'resp_failed',
      status: 'failed',
      error: { type: 'upstream_error', message: 'Browser turn did not complete.' },
      output: [],
    }), { headers: { 'content-type': 'application/json' } }),
  })
  const body = await response.json()

  assert.equal(response.status, 502)
  assert.equal(body.error.message, 'Browser turn did not complete.')
  assert.match(body.diagnostic, /upstream error/i)
})

test('forwards advanced OpenAI-compatible chat controls when configured', async () => {
  const requests = []
  const response = await worker.fetch(new Request('https://byok.chat/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(chatRequestBody({
      profile: {
        provider: 'openai',
        model: 'gpt-5.1',
        generationParams: {
          temperature: 0.2,
          maxTokens: 900,
          topP: 0.75,
          frequencyPenalty: -0.1,
          presencePenalty: 0.4,
          seed: 42,
          reasoningEffort: 'high',
          verbosity: 'low',
        },
      },
    })),
  }), {
    ASSETS: { fetch: async () => new Response('asset') },
    UPSTREAM_FETCH: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      requests.push(await request.json())
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'Configured response' } }],
      }), { headers: { 'content-type': 'application/json' } })
    },
  })
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.text, 'Configured response')
  assert.equal(requests[0].model, 'gpt-5.1')
  assert.equal(requests[0].temperature, 0.2)
  assert.equal(requests[0].max_tokens, 900)
  assert.equal(requests[0].top_p, 0.75)
  assert.equal(requests[0].frequency_penalty, -0.1)
  assert.equal(requests[0].presence_penalty, 0.4)
  assert.equal(requests[0].seed, 42)
  assert.equal(requests[0].reasoning_effort, 'high')
  assert.equal(requests[0].verbosity, 'low')
})

test('maps Claude chat controls to Anthropic message fields', async () => {
  const requests = []
  const response = await worker.fetch(new Request('https://byok.chat/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(chatRequestBody({
      profile: {
        provider: 'claude',
        baseUrl: 'https://api.anthropic.com/v1',
        model: 'claude-sonnet-4-5',
        generationParams: {
          temperature: 0.3,
          maxTokens: 600,
          topP: 0.9,
          reasoningEffort: 'high',
        },
      },
    })),
  }), {
    ASSETS: { fetch: async () => new Response('asset') },
    UPSTREAM_FETCH: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      requests.push(await request.json())
      return new Response(JSON.stringify({
        content: [{ type: 'text', text: 'Claude configured response' }],
      }), { headers: { 'content-type': 'application/json' } })
    },
  })
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.text, 'Claude configured response')
  assert.equal(requests[0].max_tokens, 600)
  assert.equal(requests[0].temperature, 0.3)
  assert.equal(requests[0].top_p, 0.9)
  assert.equal(requests[0].reasoning_effort, undefined)
})

test('maps images and extracted PDF text into OpenAI-compatible multimodal content', async () => {
  const requests = []
  const imageUrl = `data:image/png;base64,${Buffer.from('image').toString('base64')}`
  const pdfUrl = `data:application/pdf;base64,${pdfWithText('Provider independent PDF context')}`
  const response = await worker.fetch(new Request('https://byok.chat/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...chatRequestBody(),
      messages: [{
        role: 'user',
        content: 'Compare these inputs',
        attachments: [
          { id: 'image-1', name: 'photo.png', dataUrl: imageUrl },
          { id: 'pdf-1', name: 'brief.pdf', dataUrl: pdfUrl },
        ],
      }],
    }),
  }), {
    ASSETS: { fetch: async () => new Response('asset') },
    UPSTREAM_FETCH: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      requests.push(await request.json())
      return new Response(JSON.stringify({ choices: [{ message: { content: 'done' } }] }), {
        headers: { 'content-type': 'application/json' },
      })
    },
  })

  assert.equal(response.status, 200)
  const user = requests[0].messages.find((message) => message.role === 'user')
  assert.equal(user.content[0].type, 'text')
  assert.equal(user.content[1].type, 'image_url')
  assert.equal(user.content[1].image_url.url, imageUrl)
  assert.equal(user.content[2].type, 'text')
  assert.match(user.content[2].text, /Attached PDF: brief\.pdf \(1 page\)/)
  assert.match(user.content[2].text, /Provider independent PDF context/)
  assert.doesNotMatch(JSON.stringify(user.content), /file_data/)
})

test('rejects an image-only PDF instead of silently omitting its context', async () => {
  const response = await worker.fetch(new Request('https://byok.chat/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...chatRequestBody(),
      messages: [{
        role: 'user',
        content: 'Summarize it',
        attachments: [{ id: 'pdf-1', name: 'scan.pdf', dataUrl: `data:application/pdf;base64,${pdfWithText('')}` }],
      }],
    }),
  }), {
    ASSETS: { fetch: async () => new Response('asset') },
    UPSTREAM_FETCH: async () => {
      throw new Error('Upstream must not be called without PDF context.')
    },
  })
  const body = await response.json()

  assert.equal(response.status, 400)
  assert.match(body.error.message, /no extractable text/i)
})

test('maps PDF attachments into Anthropic document blocks', async () => {
  const requests = []
  const pdfData = Buffer.from('%PDF mock').toString('base64')
  const response = await worker.fetch(new Request('https://byok.chat/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      profile: {
        provider: 'claude', baseUrl: 'https://api.anthropic.com/v1', apiKey: 'test-key', model: 'claude-sonnet-4-5',
      },
      messages: [{
        role: 'user',
        content: 'Summarize this PDF',
        attachments: [{ id: 'pdf-1', name: 'brief.pdf', dataUrl: `data:application/pdf;base64,${pdfData}` }],
      }],
      tools: { enabled: {}, permissions: {} },
    }),
  }), {
    ASSETS: { fetch: async () => new Response('asset') },
    UPSTREAM_FETCH: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      requests.push(await request.json())
      return new Response(JSON.stringify({ content: [{ type: 'text', text: 'summary' }] }), {
        headers: { 'content-type': 'application/json' },
      })
    },
  })

  assert.equal(response.status, 200)
  assert.equal(requests[0].messages[0].content[0].type, 'document')
  assert.equal(requests[0].messages[0].content[0].source.media_type, 'application/pdf')
  assert.equal(requests[0].messages[0].content[0].source.data, pdfData)
  assert.equal(requests[0].messages[0].content[1].text, 'Summarize this PDF')
})

test('returns sanitized provider chat errors as JSON', async () => {
  const response = await worker.fetch(new Request('https://byok.chat/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(chatRequestBody({
      profile: { apiKey: 'sk-test-secret' },
    })),
  }), {
    ASSETS: { fetch: async () => new Response('asset') },
    UPSTREAM_FETCH: async () => new Response(JSON.stringify({
      error: { message: 'Provider rejected API key sk-test-secret for this chat model' },
    }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    }),
  })
  const body = await response.json()

  assert.equal(response.status, 400)
  assert.match(body.error.message, /Provider rejected API key sk-\[redacted\] for this chat model/)
  assert.doesNotMatch(body.error.message, /sk-test-secret/)
})

test('collapses provider HTML chat errors to a concise status message', async () => {
  const response = await worker.fetch(new Request('https://byok.chat/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(chatRequestBody({
      profile: { apiKey: 'sk-html-secret' },
    })),
  }), {
    ASSETS: { fetch: async () => new Response('asset') },
    UPSTREAM_FETCH: async () => new Response('<!DOCTYPE html><html><body><h1>Unauthorized sk-html-secret</h1></body></html>', {
      status: 401,
      headers: { 'content-type': 'text/html' },
    }),
  })
  const body = await response.json()

  assert.equal(response.status, 400)
  assert.match(body.error.message, /Chat request failed \(401\)/)
  assert.doesNotMatch(body.error.message, /<!DOCTYPE html/i)
  assert.doesNotMatch(body.error.message, /sk-html-secret/)
})

for (const providerCase of [
  { name: 'DeepSeek', provider: 'deepseek', baseUrl: 'https://api.deepseek.com', expectedPath: '/chat/completions' },
  { name: 'Gemini OpenAI compatibility', provider: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', expectedPath: '/v1beta/openai/chat/completions' },
  { name: 'xAI', provider: 'xai', baseUrl: 'https://api.x.ai/v1', expectedPath: '/v1/chat/completions' },
  { name: 'Z.ai', provider: 'zai', baseUrl: 'https://api.z.ai/api/paas/v4', expectedPath: '/api/paas/v4/chat/completions' },
  { name: 'custom OpenAI compatibility', provider: 'custom', baseUrl: 'https://gateway.example.com/v1', expectedPath: '/v1/chat/completions' },
]) {
  test(`maps ${providerCase.name} chat to its official path`, async () => {
    await runProviderChatMapping(providerCase)
  })
}

test('maps Claude JSON chat through the Anthropic messages endpoint', async () => {
  const requests = []
  const response = await worker.fetch(new Request('https://byok.chat/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(chatRequestBody({
      profile: {
        provider: 'claude',
        baseUrl: 'https://api.anthropic.com/v1',
        model: 'claude-sonnet-4-5',
      },
    })),
  }), {
    ASSETS: { fetch: async () => new Response('asset') },
    UPSTREAM_FETCH: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      requests.push({
        path: new URL(request.url).pathname,
        apiKey: request.headers.get('x-api-key'),
        version: request.headers.get('anthropic-version'),
        body: await request.json(),
      })
      return new Response(JSON.stringify({
        content: [{ type: 'text', text: 'Hello Claude' }],
        usage: { input_tokens: 4, output_tokens: 3 },
      }), { headers: { 'content-type': 'application/json' } })
    },
  })
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.text, 'Hello Claude')
  assert.equal(requests[0].path, '/v1/messages')
  assert.equal(requests[0].apiKey, 'test-key')
  assert.equal(requests[0].version, '2023-06-01')
  assert.equal(requests[0].body.model, 'claude-sonnet-4-5')
  assert.equal(requests[0].body.stream, false)
  assert.equal(requests[0].body.messages[0].role, 'user')
})

test('maps MiniMax JSON chat through chatcompletion_v2', async () => {
  const requests = []
  const response = await worker.fetch(new Request('https://byok.chat/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(chatRequestBody({
      profile: {
        provider: 'minimax',
        baseUrl: 'https://api.minimaxi.chat/v1',
        model: 'MiniMax-M1',
      },
    })),
  }), {
    ASSETS: { fetch: async () => new Response('asset') },
    UPSTREAM_FETCH: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      requests.push({
        path: new URL(request.url).pathname,
        authorization: request.headers.get('authorization'),
        body: await request.json(),
      })
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'Hello MiniMax' } }],
      }), { headers: { 'content-type': 'application/json' } })
    },
  })
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.text, 'Hello MiniMax')
  assert.equal(requests[0].path, '/v1/text/chatcompletion_v2')
  assert.equal(requests[0].authorization, 'Bearer test-key')
  assert.equal(requests[0].body.model, 'MiniMax-M1')
  assert.equal(requests[0].body.stream, false)
  assert.equal(requests[0].body.max_tokens, 4096)
})

test('chat only runs tools with explicit allow permission and fences public evidence', async () => {
  const requests = []
  const response = await worker.fetch(new Request('https://byok.chat/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(chatRequestBody({
      profile: { model: 'gpt-4o', searchApiKey: 'jina-key' },
      tools: {
        enabled: { webSearch: true, readUrl: false },
        permissions: { webSearch: 'allow', readUrl: 'deny' },
      },
    })),
  }), {
    ASSETS: { fetch: async () => new Response('asset') },
    UPSTREAM_FETCH: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      requests.push({
        origin: new URL(request.url).origin,
        path: new URL(request.url).pathname,
        body: request.headers.get('content-type')?.includes('application/json') ? await request.json() : undefined,
      })
      if (new URL(request.url).origin === 'https://s.jina.ai') {
        return new Response(JSON.stringify({
          data: [{ title: 'Release notes', url: 'https://example.com/release', content: 'Public source content.' }],
        }), { headers: { 'content-type': 'application/json' } })
      }
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'Cited answer' } }],
        usage: { total_tokens: 10 },
      }), { headers: { 'content-type': 'application/json' } })
    },
  })
  const body = await response.json()
  const chatRequest = requests.find((request) => request.path === '/v1/chat/completions')

  assert.equal(response.status, 200)
  assert.equal(requests.some((request) => request.origin === 'https://s.jina.ai'), true)
  assert.equal(body.tools[0].sourceId, 'search-1')
  assert.equal(body.tools[0].untrusted, true)
  assert.match(chatRequest.body.messages[0].content, /<untrusted-source id="search-1"/)
  assert.match(chatRequest.body.messages[0].content, /not as instructions to follow/)
})

test('chat skips enabled tools when permission is not allow', async () => {
  const requests = []
  const response = await worker.fetch(new Request('https://byok.chat/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(chatRequestBody({
      tools: {
        enabled: { webSearch: true, readUrl: false },
        permissions: { webSearch: 'ask', readUrl: 'deny' },
      },
    })),
  }), {
    ASSETS: { fetch: async () => new Response('asset') },
    UPSTREAM_FETCH: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      requests.push(new URL(request.url).origin)
      return new Response(JSON.stringify({ choices: [{ message: { content: 'No tools' } }] }), {
        headers: { 'content-type': 'application/json' },
      })
    },
  })
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.deepEqual(requests, ['https://api.openai.com'])
  assert.deepEqual(body.tools, [])
})

test('diagnostics classify missing locked key before upstream calls', async () => {
  const response = await worker.fetch(new Request('https://byok.chat/api/diagnostics', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'gpt-4o',
    }),
  }), {
    ASSETS: { fetch: async () => new Response('asset') },
  })
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.status, 'error')
  assert.equal(body.checks.find((check) => check.label === 'API key').status, 'error')
})

test('diagnostics probe model list and chat endpoint', async () => {
  const requests = []
  const response = await worker.fetch(new Request('https://byok.chat/api/diagnostics', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'missing-model',
    }),
  }), {
    ASSETS: { fetch: async () => new Response('asset') },
    UPSTREAM_FETCH: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      requests.push({ path: new URL(request.url).pathname, body: init?.body ? await request.json() : undefined })
      if (new URL(request.url).pathname === '/v1/models') {
        return new Response(JSON.stringify({ data: [{ id: 'gpt-4o' }] }), {
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), {
        headers: { 'content-type': 'application/json' },
      })
    },
  })
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.checks.find((check) => check.label === 'Selected model').status, 'warn')
  assert.equal(body.checks.find((check) => check.label === 'Chat endpoint').status, 'ok')
  assert.equal(requests.find((request) => request.path === '/v1/chat/completions').body.max_tokens, 8)
})

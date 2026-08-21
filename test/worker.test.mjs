import test from 'node:test'
import assert from 'node:assert/strict'
import worker, { createTools } from '../src/worker.ts'

const env = {
  ASSETS: {
    fetch: async () => new Response('asset fallback', { status: 200 }),
  },
}

function assertSecurityHeaders(response) {
  const contentSecurityPolicy = response.headers.get('content-security-policy') || ''
  assert.match(contentSecurityPolicy, /frame-ancestors 'none'/)
  assert.match(contentSecurityPolicy, /https:\/\/www\.googletagmanager\.com/)
  assert.match(contentSecurityPolicy, /https:\/\/www\.google-analytics\.com/)
  assert.equal(response.headers.get('cross-origin-opener-policy'), 'same-origin')
  assert.equal(response.headers.get('x-frame-options'), 'DENY')
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin')
  assert.match(response.headers.get('permissions-policy') || '', /camera=\(\)/)
  assert.match(response.headers.get('strict-transport-security') || '', /max-age=31536000/)
}

test('serves API validation errors as JSON', async () => {
  const response = await worker.fetch(new Request('https://byok.chat/api/models', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  }), env)
  const body = await response.json()

  assert.equal(response.status, 400)
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8')
  assertSecurityHeaders(response)
  assert.equal(body.error.message, 'apiKey is required')
})

test('adds browser security headers to API and app responses', async () => {
  const apiResponse = await worker.fetch(new Request('https://byok.chat/api/missing'), env)
  assertSecurityHeaders(apiResponse)

  const pageResponse = await worker.fetch(new Request('https://byok.chat/settings'), env)
  assertSecurityHeaders(pageResponse)
})

test('returns a structured 429 before calling an upstream when the API limit is exceeded', async () => {
  let upstreamCalls = 0
  const response = await worker.fetch(new Request('https://byok.chat/api/models', {
    method: 'POST',
    headers: {
      'cf-connecting-ip': '203.0.113.10',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      provider: 'openai',
      baseUrl: 'https://api.openai.com',
      apiKey: 'test-key',
    }),
  }), {
    ...env,
    API_RATE_LIMITER: {
      limit: async ({ key }) => {
        assert.equal(key, '203.0.113.10')
        return { success: false }
      },
    },
    UPSTREAM_FETCH: async () => {
      upstreamCalls += 1
      return new Response('{}')
    },
  })
  const body = await response.json()

  assert.equal(response.status, 429)
  assert.equal(response.headers.get('retry-after'), '60')
  assert.equal(body.error.code, 'rate_limited')
  assert.equal(upstreamCalls, 0)
  assertSecurityHeaders(response)
})

test('fails closed when a configured API rate limiter is unavailable', async () => {
  let upstreamCalls = 0
  const originalConsoleError = console.error
  const loggedErrors = []
  let response
  console.error = (...args) => loggedErrors.push(args)
  try {
    response = await worker.fetch(new Request('https://byok.chat/api/models', {
      method: 'POST',
      headers: {
        'cf-connecting-ip': '203.0.113.11',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'openai',
        baseUrl: 'https://api.openai.com',
        apiKey: 'test-key',
      }),
    }), {
      ...env,
      API_RATE_LIMITER: {
        limit: async () => {
          throw new Error('binding unavailable')
        },
      },
      UPSTREAM_FETCH: async () => {
        upstreamCalls += 1
        return new Response('{}')
      },
    })
  } finally {
    console.error = originalConsoleError
  }
  const body = await response.json()

  assert.equal(response.status, 503)
  assert.equal(response.headers.get('retry-after'), '60')
  assert.equal(body.error.code, 'rate_limiter_unavailable')
  assert.equal(upstreamCalls, 0)
  assert.deepEqual(loggedErrors, [['API rate limiter unavailable', { route: '/api/models' }]])
  assertSecurityHeaders(response)
})

test('uses the higher-volume status limiter for media polling', async () => {
  let apiLimitCalls = 0
  let statusLimitCalls = 0
  const response = await worker.fetch(new Request('https://byok.chat/api/media/status', {
    method: 'POST',
    headers: {
      'cf-connecting-ip': '203.0.113.20',
      'content-type': 'application/json',
    },
    body: '{}',
  }), {
    ...env,
    API_RATE_LIMITER: {
      limit: async () => {
        apiLimitCalls += 1
        return { success: false }
      },
    },
    STATUS_RATE_LIMITER: {
      limit: async ({ key }) => {
        statusLimitCalls += 1
        assert.equal(key, '203.0.113.20')
        return { success: true }
      },
    },
  })

  assert.equal(response.status, 400)
  assert.equal(apiLimitCalls, 0)
  assert.equal(statusLimitCalls, 1)
})

test('fetches DeepSeek models without inserting v1', async () => {
  const requests = []
  const response = await worker.fetch(new Request('https://byok.chat/api/models', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      apiKey: 'test-key',
    }),
  }), {
    ...env,
    UPSTREAM_FETCH: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      requests.push({
        path: new URL(request.url).pathname,
        authorization: request.headers.get('authorization'),
      })
      return new Response(JSON.stringify({ data: [{ id: 'deepseek-chat' }] }), {
        headers: { 'content-type': 'application/json' },
      })
    },
  })
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].path, '/models')
  assert.equal(requests[0].authorization, 'Bearer test-key')
  assert.equal(body.data[0].id, 'deepseek-chat')
})

test('fetches legacy custom-provider models from /v1 when users enter a bare custom host', async () => {
  const requests = []
  const response = await worker.fetch(new Request('https://byok.chat/api/models', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      provider: 'sub2api',
      baseUrl: 'https://gateway.example.com',
      apiKey: 'test-key',
    }),
  }), {
    ...env,
    UPSTREAM_FETCH: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      requests.push({
        origin: new URL(request.url).origin,
        path: new URL(request.url).pathname,
        authorization: request.headers.get('authorization'),
        redirect: request.redirect,
      })
      return new Response(JSON.stringify({ data: [{ id: 'gpt-4o' }] }), {
        headers: { 'content-type': 'application/json' },
      })
    },
  })
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].origin, 'https://gateway.example.com')
  assert.equal(requests[0].path, '/v1/models')
  assert.equal(requests[0].authorization, 'Bearer test-key')
  assert.equal(requests[0].redirect, 'manual')
  assert.equal(body.data[0].id, 'gpt-4o')
})

test('rejects provider redirects without following credential-bearing requests', async () => {
  const requests = []
  const response = await worker.fetch(new Request('https://byok.chat/api/models', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      provider: 'sub2api',
      baseUrl: 'https://gateway.example.com/v1',
      apiKey: 'test-key',
    }),
  }), {
    ...env,
    UPSTREAM_FETCH: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      requests.push({
        authorization: request.headers.get('authorization'),
        redirect: request.redirect,
      })
      return new Response('redirect target must stay private', {
        status: 302,
        headers: { location: 'https://redirect-target.example/models' },
      })
    },
  })
  const body = await response.json()

  assert.equal(response.status, 400)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].authorization, 'Bearer test-key')
  assert.equal(requests[0].redirect, 'manual')
  assert.equal(body.error.message, 'Upstream redirects are not allowed.')
  assert.doesNotMatch(JSON.stringify(body), /redirect-target\.example/)
})

test('rejects non-public provider base URLs before fetching upstream', async (t) => {
  const blockedUrls = [
    'https://127.0.0.1:8787',
    'https://localhost.',
    'https://service.home.arpa',
    'https://192.0.2.10',
    'https://198.18.0.1',
    'https://203.0.113.10',
    'https://[::ffff:7f00:1]',
    'https://[fe90::1]',
    'https://[2001:db8::1]',
    'https://byok.chat',
    'https://staging.byok.chat',
  ]

  for (const baseUrl of blockedUrls) {
    await t.test(baseUrl, async () => {
      let called = false
      const response = await worker.fetch(new Request('https://byok.chat/api/models', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: 'custom',
          baseUrl,
          apiKey: 'test-key',
        }),
      }), {
        ...env,
        UPSTREAM_FETCH: async () => {
          called = true
          return new Response('should not fetch')
        },
      })
      const body = await response.json()

      assert.equal(response.status, 400)
      assert.equal(called, false)
      assert.match(body.error.message, /public hostname/)
    })
  }
})

test('rejects insecure provider base URLs before sending API keys upstream', async () => {
  let called = false
  const response = await worker.fetch(new Request('https://byok.chat/api/models', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      provider: 'custom',
      baseUrl: 'http://api.example.com/v1',
      apiKey: 'test-key',
    }),
  }), {
    ...env,
    UPSTREAM_FETCH: async () => {
      called = true
      return new Response('should not fetch')
    },
  })
  const body = await response.json()

  assert.equal(response.status, 400)
  assert.equal(called, false)
  assert.match(body.error.message, /must use https/)
})

test('rejects provider base URLs with embedded credentials', async () => {
  let called = false
  const response = await worker.fetch(new Request('https://byok.chat/api/models', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      provider: 'custom',
      baseUrl: 'https://user:password@api.example.com/v1',
      apiKey: 'test-key',
    }),
  }), {
    ...env,
    UPSTREAM_FETCH: async () => {
      called = true
      return new Response('should not fetch')
    },
  })
  const body = await response.json()

  assert.equal(response.status, 400)
  assert.equal(called, false)
  assert.match(body.error.message, /embedded credentials/)
})

test('fetches Claude models with Anthropic headers', async () => {
  const requests = []
  const response = await worker.fetch(new Request('https://byok.chat/api/models', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      provider: 'claude',
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: 'test-key',
    }),
  }), {
    ...env,
    UPSTREAM_FETCH: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      requests.push({
        path: new URL(request.url).pathname,
        apiKey: request.headers.get('x-api-key'),
        authorization: request.headers.get('authorization'),
        version: request.headers.get('anthropic-version'),
      })
      return new Response(JSON.stringify({ data: [{ id: 'claude-sonnet-4-5' }] }), {
        headers: { 'content-type': 'application/json' },
      })
    },
  })
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].path, '/v1/models')
  assert.equal(requests[0].apiKey, 'test-key')
  assert.equal(requests[0].authorization, null)
  assert.equal(requests[0].version, '2023-06-01')
  assert.equal(body.data[0].id, 'claude-sonnet-4-5')
})

test('reports provider presets that do not expose model lists', async () => {
  const response = await worker.fetch(new Request('https://byok.chat/api/models', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      provider: 'zai',
      baseUrl: 'https://api.z.ai/api/paas/v4',
      apiKey: 'test-key',
    }),
  }), env)
  const body = await response.json()

  assert.equal(response.status, 400)
  assert.match(body.error.message, /does not expose a models endpoint/)
})

test('rejects chat without BYOK profile headers', async () => {
  const response = await worker.fetch(new Request('https://byok.chat/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [] }),
  }), env)
  const body = await response.json()

  assert.equal(response.status, 400)
  assert.equal(body.error.message, 'Configure a base URL, API key, and model before chatting.')
})

test('generates image media through an OpenAI-compatible endpoint', async () => {
  const requests = []
  const imageBase64 = Buffer.from('mock image bytes').toString('base64')
  const response = await worker.fetch(new Request('https://byok.chat/api/media', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      baseUrl: 'https://mock.example.com/v1',
      apiKey: 'test-key',
      model: 'gpt-image-2',
      mode: 'image_generation',
      prompt: 'ufo flying over 70s hong kong skyline',
    }),
  }), {
    ...env,
    UPSTREAM_FETCH: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      requests.push({
        path: new URL(request.url).pathname,
        authorization: request.headers.get('authorization'),
        body: await request.json(),
      })
      return new Response(JSON.stringify({
        data: [{
          b64_json: imageBase64,
          revised_prompt: 'UFO above a 1970s Hong Kong skyline.',
        }],
      }), {
        headers: { 'content-type': 'application/json' },
      })
    },
  })
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].path, '/v1/images/generations')
  assert.equal(requests[0].authorization, 'Bearer test-key')
  assert.equal(requests[0].body.model, 'gpt-image-2')
  assert.equal(requests[0].body.prompt, 'ufo flying over 70s hong kong skyline')
  assert.equal(requests[0].body.stream, true)
  assert.match(body.text, /Generated 1 image/)
  assert.match(body.text, /Revised prompt/)
  assert.equal(body.attachments.length, 1)
  assert.equal(body.attachments[0].kind, 'image')
  assert.equal(body.attachments[0].url, `data:image/png;base64,${imageBase64}`)
})

test('routes an attached image through the current OpenAI image edits JSON endpoint', async () => {
  const requests = []
  const imageBase64 = Buffer.from('source image bytes').toString('base64')
  const outputBase64 = Buffer.from('edited image bytes').toString('base64')
  const response = await worker.fetch(new Request('https://byok.chat/api/media', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-image-1.5',
      mode: 'image_generation',
      prompt: 'Add a silver necklace',
      attachments: [{
        id: 'source-1',
        name: 'portrait.png',
        dataUrl: `data:image/png;base64,${imageBase64}`,
      }],
    }),
  }), {
    ...env,
    UPSTREAM_FETCH: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      const requestBody = await request.json()
      requests.push({
        path: new URL(request.url).pathname,
        contentType: request.headers.get('content-type'),
        body: requestBody,
      })
      return new Response(JSON.stringify({ data: [{ b64_json: outputBase64 }] }), {
        headers: { 'content-type': 'application/json' },
      })
    },
  })
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(requests[0].path, '/v1/images/edits')
  assert.equal(requests[0].contentType, 'application/json')
  assert.equal(requests[0].body.model, 'gpt-image-1.5')
  assert.equal(requests[0].body.prompt, 'Add a silver necklace')
  assert.equal(requests[0].body.images[0].image_url, `data:image/png;base64,${imageBase64}`)
  assert.equal(body.attachments[0].url, `data:image/png;base64,${outputBase64}`)
})

test('passes an attached image into xAI image-to-video generation', async () => {
  const requests = []
  const imageUrl = `data:image/jpeg;base64,${Buffer.from('photo bytes').toString('base64')}`
  const response = await worker.fetch(new Request('https://byok.chat/api/media', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      provider: 'xai',
      baseUrl: 'https://api.x.ai/v1',
      apiKey: 'test-key',
      model: 'grok-imagine-video',
      mode: 'video_generation',
      prompt: 'Slow cinematic camera move',
      attachments: [{ id: 'photo-1', name: 'photo.jpg', dataUrl: imageUrl }],
    }),
  }), {
    ...env,
    UPSTREAM_FETCH: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      requests.push({ path: new URL(request.url).pathname, body: await request.json() })
      return new Response(JSON.stringify({ data: [{ url: 'https://cdn.example.test/from-photo.mp4' }] }), {
        headers: { 'content-type': 'application/json' },
      })
    },
  })
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(requests[0].path, '/v1/videos/generations')
  assert.equal(requests[0].body.image.url, imageUrl)
  assert.equal(requests[0].body.prompt, 'Slow cinematic camera move')
  assert.equal(body.attachments[0].url, 'https://cdn.example.test/from-photo.mp4')
})

test('forwards image generation output controls', async () => {
  const requests = []
  const imageBase64 = Buffer.from('mock image bytes').toString('base64')
  const response = await worker.fetch(new Request('https://byok.chat/api/media', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-image-2',
      mode: 'image_generation',
      prompt: 'wide cinematic desk setup',
      generationParams: {
        image: {
          count: 2,
          size: '1536x1024',
          quality: 'high',
          background: 'transparent',
          outputFormat: 'webp',
        },
      },
    }),
  }), {
    ...env,
    UPSTREAM_FETCH: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      requests.push(await request.json())
      return new Response(JSON.stringify({
        data: [{ b64_json: imageBase64 }],
      }), {
        headers: { 'content-type': 'application/json' },
      })
    },
  })

  assert.equal(response.status, 200)
  assert.equal(requests[0].n, 2)
  assert.equal(requests[0].size, '1536x1024')
  assert.equal(requests[0].quality, 'high')
  assert.equal(requests[0].background, 'transparent')
  assert.equal(requests[0].output_format, 'webp')
})

test('sends BYOK Grok image media through the primary image endpoint', async () => {
  const requests = []
  const imageBase64 = Buffer.from('mock grok image bytes').toString('base64')
  const response = await worker.fetch(new Request('https://byok.chat/api/media', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      provider: 'sub2api',
      baseUrl: 'https://api.byok.chat/v1',
      apiKey: 'test-key',
      model: 'grok-imagine-image',
      mode: 'image_generation',
      prompt: 'neon skyline',
    }),
  }), {
    ...env,
    UPSTREAM_FETCH: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      requests.push({
        path: new URL(request.url).pathname,
        authorization: request.headers.get('authorization'),
        body: await request.json(),
      })
      return new Response(JSON.stringify({
        data: [{ b64_json: imageBase64 }],
      }), {
        headers: { 'content-type': 'application/json' },
      })
    },
  })
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].path, '/v1/images/generations')
  assert.equal(requests[0].authorization, 'Bearer test-key')
  assert.equal(requests[0].body.model, 'grok-imagine-image')
  assert.equal(requests[0].body.prompt, 'neon skyline')
  assert.equal(requests[0].body.stream, undefined)
  assert.match(body.text, /Generated 1 image/)
  assert.equal(body.attachments[0].kind, 'image')
})

test('normalizes Grok image alias and strips unsupported OpenAI image options', async () => {
  const requests = []
  const imageBase64 = Buffer.from('mock grok image bytes').toString('base64')
  const response = await worker.fetch(new Request('https://byok.chat/api/media', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      provider: 'sub2api',
      baseUrl: 'https://api.byok.chat/v1',
      apiKey: 'test-key',
      model: 'grok-imagine',
      mode: 'image_generation',
      prompt: 'neon skyline',
      generationParams: {
        image: {
          count: 2,
          size: '1536x1024',
          quality: 'high',
          background: 'transparent',
          outputFormat: 'webp',
        },
      },
    }),
  }), {
    ...env,
    UPSTREAM_FETCH: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      requests.push({
        path: new URL(request.url).pathname,
        body: await request.json(),
      })
      return new Response(JSON.stringify({
        data: [{ b64_json: imageBase64 }],
      }), {
        headers: { 'content-type': 'application/json' },
      })
    },
  })
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].path, '/v1/images/generations')
  assert.deepEqual(requests[0].body, {
    model: 'grok-imagine-image-quality',
    prompt: 'neon skyline',
    n: 2,
  })
  assert.equal(body.attachments[0].kind, 'image')
})

test('does not retry image fallback when upstream group disables media', async () => {
  const requests = []
  const response = await worker.fetch(new Request('https://byok.chat/api/media', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      baseUrl: 'https://custom.example/v1',
      apiKey: 'test-key',
      model: 'gpt-image-2',
      mode: 'image_generation',
      prompt: 'neon skyline',
    }),
  }), {
    ...env,
    UPSTREAM_FETCH: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      requests.push(new URL(request.url).pathname)
      return new Response(JSON.stringify({
        error: { message: 'Image generation is not enabled for this group' },
      }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      })
    },
  })
  const body = await response.json()

  assert.equal(response.status, 400)
  assert.deepEqual(requests, ['/v1/images/generations'])
  assert.match(body.error.message, /not enabled for image generation/)
  assert.doesNotMatch(body.error.message, /Fallback also failed/)
})

test('does not swap failed image requests to a hardcoded responses model', async () => {
  const requests = []
  const response = await worker.fetch(new Request('https://byok.chat/api/media', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      baseUrl: 'https://api.byok.chat/v1',
      apiKey: 'test-key',
      model: 'grok-imagine-image',
      mode: 'image_generation',
      prompt: 'neon skyline',
    }),
  }), {
    ...env,
    UPSTREAM_FETCH: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      requests.push({
        path: new URL(request.url).pathname,
        body: await request.json(),
      })
      return new Response(JSON.stringify({
        error: { message: 'upstream media failed' },
      }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      })
    },
  })
  const body = await response.json()

  assert.equal(response.status, 502)
  assert.equal(body.error.message, 'upstream media failed')
  assert.deepEqual(requests.map((request) => request.path), ['/v1/images/generations'])
  assert.equal(requests[0].body.model, 'grok-imagine-image')
})

test('scrubs upstream media errors before returning them', async () => {
  const response = await worker.fetch(new Request('https://byok.chat/api/media', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      baseUrl: 'https://media.example.test/v1',
      apiKey: 'sk-user-secret',
      model: 'gpt-image-2',
      mode: 'image_generation',
      prompt: 'neon skyline',
    }),
  }), {
    ...env,
    UPSTREAM_FETCH: async () => new Response(JSON.stringify({
      error: { message: 'Provider rejected API key sk-media-secret' },
    }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    }),
  })
  const body = await response.json()

  assert.equal(response.status, 502)
  assert.equal(body.error.message, 'Provider rejected API key sk-[redacted]')
  assert.doesNotMatch(body.error.message, /sk-media-secret/)
})

test('scrubs thrown media errors before returning them', async () => {
  const response = await worker.fetch(new Request('https://byok.chat/api/media', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      baseUrl: 'https://media.example.test/v1',
      apiKey: 'test-key',
      model: 'gpt-image-2',
      mode: 'image_generation',
      prompt: 'neon skyline',
    }),
  }), {
    ...env,
    UPSTREAM_FETCH: async () => {
      throw new Error('network refused Bearer sk-media-secret')
    },
  })
  const body = await response.json()

  assert.equal(response.status, 400)
  assert.equal(body.error.message, 'network refused Bearer [redacted]')
  assert.doesNotMatch(body.error.message, /sk-media-secret/)
})

test('forwards Grok video generation duration and resolution controls', async () => {
  const requests = []
  const response = await worker.fetch(new Request('https://byok.chat/api/media', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      provider: 'sub2api',
      baseUrl: 'https://api.byok.chat/v1',
      apiKey: 'test-key',
      model: 'grok-imagine-video',
      mode: 'video_generation',
      prompt: 'a product demo clip',
      generationParams: {
        video: {
          size: '1280x720',
          seconds: '8',
        },
      },
    }),
  }), {
    ...env,
    UPSTREAM_FETCH: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      const path = new URL(request.url).pathname
      requests.push({
        path,
        body: request.method === 'POST' ? await request.json() : undefined,
        contentType: request.headers.get('content-type'),
      })
      if (path === '/v1/videos/video_123') {
        return new Response(JSON.stringify({
          id: 'video_123',
          status: 'succeeded',
          video: { url: 'https://cdn.example.test/video.mp4' },
        }), {
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({
        id: 'video_123',
        status: 'queued',
      }), {
        headers: { 'content-type': 'application/json' },
      })
    },
  })
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(requests[0].path, '/v1/videos/generations')
  assert.equal(requests[1].path, '/v1/videos/video_123')
  assert.match(requests[0].contentType, /application\/json/)
  assert.equal(requests[0].body.model, 'grok-imagine-video')
  assert.equal(requests[0].body.prompt, 'a product demo clip')
  assert.equal(requests[0].body.resolution, '720p')
  assert.equal(requests[0].body.seconds, undefined)
  assert.match(body.text, /Generated 1 video/)
  assert.equal(body.attachments[0].kind, 'video')
  assert.equal(body.attachments[0].url, 'https://cdn.example.test/video.mp4')
})

test('routes Grok image-to-video-only model to text-to-video model and polls status', async () => {
  const requests = []
  const response = await worker.fetch(new Request('https://byok.chat/api/media', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      provider: 'sub2api',
      baseUrl: 'https://api.byok.chat/v1',
      apiKey: 'test-key',
      model: 'grok-imagine-video-1.5',
      mode: 'video_generation',
      prompt: 'a product demo clip',
    }),
  }), {
    ...env,
    UPSTREAM_FETCH: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      const path = new URL(request.url).pathname
      requests.push({
        path,
        body: request.method === 'POST' ? await request.json() : undefined,
      })
      if (path === '/v1/videos/video_456') {
        return new Response(JSON.stringify({
          request_id: 'video_456',
          status: 'completed',
          url: 'https://cdn.example.test/video-456.mp4',
        }), {
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({
        request_id: 'video_456',
        status: 'queued',
      }), {
        headers: { 'content-type': 'application/json' },
      })
    },
  })
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(requests[0].path, '/v1/videos/generations')
  assert.equal(requests[0].body.model, 'grok-imagine-video')
  assert.equal(requests[1].path, '/v1/videos/video_456')
  assert.match(body.text, /does not support text-to-video/)
  assert.equal(body.attachments[0].url, 'https://cdn.example.test/video-456.mp4')
})

test('returns a pending video job when the video is not ready yet', async () => {
  const requests = []
  const response = await worker.fetch(new Request('https://byok.chat/api/media', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      provider: 'sub2api',
      baseUrl: 'https://api.byok.chat/v1',
      apiKey: 'test-key',
      model: 'grok-imagine-video',
      mode: 'video_generation',
      prompt: 'a product demo clip',
    }),
  }), {
    ...env,
    VIDEO_POLL_DELAYS_MS: '0',
    UPSTREAM_FETCH: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      const path = new URL(request.url).pathname
      requests.push(path)
      return new Response(JSON.stringify({
        request_id: 'video_pending',
        status: path === '/v1/videos/generations' ? 'queued' : 'pending',
      }), {
        headers: { 'content-type': 'application/json' },
      })
    },
  })
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.deepEqual(requests, ['/v1/videos/generations', '/v1/videos/video_pending'])
  assert.deepEqual(body.attachments, [])
  assert.equal(body.pendingJob.requestId, 'video_pending')
  assert.equal(body.pendingJob.status, 'pending')
  assert.match(body.text, /Status: pending/)
})

test('checks a pending video job and returns the completed video attachment', async () => {
  const requests = []
  const response = await worker.fetch(new Request('https://byok.chat/api/media/status', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      provider: 'sub2api',
      baseUrl: 'https://api.byok.chat/v1',
      apiKey: 'test-key',
      model: 'grok-imagine-video',
      requestId: 'video_pending',
    }),
  }), {
    ...env,
    VIDEO_POLL_DELAYS_MS: '0',
    UPSTREAM_FETCH: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      requests.push({
        method: request.method,
        path: new URL(request.url).pathname,
      })
      return new Response(JSON.stringify({
        request_id: 'video_pending',
        status: 'completed',
        video: { url: 'https://cdn.example.test/final-video.mp4' },
      }), {
        headers: { 'content-type': 'application/json' },
      })
    },
  })
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.deepEqual(requests, [{ method: 'GET', path: '/v1/videos/video_pending' }])
  assert.equal(body.pendingJob, undefined)
  assert.match(body.text, /Generated 1 video/)
  assert.equal(body.attachments[0].kind, 'video')
  assert.equal(body.attachments[0].url, 'https://cdn.example.test/final-video.mp4')
})

test('preserves the request ID when a pending video status omits it', async () => {
  const response = await worker.fetch(new Request('https://byok.chat/api/media/status', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      provider: 'sub2api',
      baseUrl: 'https://api.byok.chat/v1',
      apiKey: 'test-key',
      model: 'grok-imagine-video',
      requestId: 'video_pending',
    }),
  }), {
    ...env,
    VIDEO_POLL_DELAYS_MS: '0',
    UPSTREAM_FETCH: async () => new Response(JSON.stringify({
      status: 'pending',
    }), {
      status: 202,
      headers: { 'content-type': 'application/json' },
    }),
  })
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.deepEqual(body.attachments, [])
  assert.equal(body.pendingJob.requestId, 'video_pending')
  assert.equal(body.pendingJob.status, 'pending')
  assert.equal(body.upstreamStatus, 202)
})

test('returns JSON 404 for unknown API routes and delegates app routes to assets', async () => {
  const apiResponse = await worker.fetch(new Request('https://byok.chat/api/missing'), env)
  assert.equal(apiResponse.status, 404)
  assert.deepEqual(await apiResponse.json(), { error: { message: 'Not found' } })

  const pageResponse = await worker.fetch(new Request('https://byok.chat/settings'), env)
  assert.equal(pageResponse.status, 200)
  assert.equal(await pageResponse.text(), 'asset fallback')
})

test('webSearch uses Jina search by default with BYOK search key', async () => {
  const requests = []
  const tools = createTools({
    ...env,
    UPSTREAM_FETCH: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      requests.push({
        url: request.url,
        authorization: request.headers.get('authorization'),
        accept: request.headers.get('accept'),
      })
      return new Response(JSON.stringify({
        data: [{
          title: 'Example result',
          url: 'https://example.com/result',
          content: 'Search result content.',
        }],
      }), {
        headers: { 'content-type': 'application/json' },
      })
    },
  }, { searchApiKey: 'jina-key' })

  const result = await tools.webSearch.execute({ query: 'latest byok chat' })

  assert.equal(requests.length, 1)
  assert.equal(new URL(requests[0].url).origin, 'https://s.jina.ai')
  assert.equal(new URL(requests[0].url).searchParams.get('q'), 'latest byok chat')
  assert.equal(requests[0].authorization, 'Bearer jina-key')
  assert.match(requests[0].accept, /application\/json/)
  assert.equal(result.status, 'ok')
  assert.equal(result.provider, 'jina')
  assert.equal(result.results[0].url, 'https://example.com/result')
  assert.match(result.result, /Search result content/)
})

test('webSearch requests a search key without making an unauthenticated upstream call', async () => {
  let called = false
  const tools = createTools({
    ...env,
    UPSTREAM_FETCH: async () => {
      called = true
      return new Response('must not be called')
    },
  })

  const result = await tools.webSearch.execute({ query: 'latest byok chat' })

  assert.equal(called, false)
  assert.equal(result.status, 'error')
  assert.equal(result.statusCode, 401)
  assert.match(result.message, /Add one in Tools/i)
})

test('webSearch preserves custom SEARCH_API_URL providers', async () => {
  const requests = []
  const tools = createTools({
    ...env,
    SEARCH_API_URL: 'https://search.example.test/api',
    SEARCH_API_KEY: 'server-search-key',
    UPSTREAM_FETCH: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      requests.push({
        url: request.url,
        authorization: request.headers.get('authorization'),
      })
      return new Response('custom result')
    },
  })

  const result = await tools.webSearch.execute({ query: 'cloudflare worker chat' })

  assert.equal(new URL(requests[0].url).origin, 'https://search.example.test')
  assert.equal(new URL(requests[0].url).searchParams.get('q'), 'cloudflare worker chat')
  assert.equal(requests[0].authorization, 'Bearer server-search-key')
  assert.equal(result.provider, 'custom')
  assert.equal(result.result, 'custom result')
})

test('readUrl blocks local and private network URLs before fetching', async () => {
  let called = false
  const tools = createTools({
    ...env,
    UPSTREAM_FETCH: async () => {
      called = true
      return new Response('should not fetch')
    },
  })

  const result = await tools.readUrl.execute({ url: 'http://127.0.0.1:8787/private' })

  assert.equal(called, false)
  assert.equal(result.status, 'error')
  assert.match(result.message, /Local and private network/)
})

test('readUrl does not fall back to direct origin fetch when safe reader fails', async () => {
  const requests = []
  const tools = createTools({
    ...env,
    UPSTREAM_FETCH: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      requests.push(request.url)
      return new Response('reader failed', { status: 502 })
    },
  }, { searchApiKey: 'jina-key' })

  const result = await tools.readUrl.execute({ url: 'https://example.com/post' })

  assert.equal(result.status, 'error')
  assert.equal(requests.length, 1)
  assert.equal(new URL(requests[0]).origin, 'https://r.jina.ai')
  assert.match(result.message, /safe reader service/)
})

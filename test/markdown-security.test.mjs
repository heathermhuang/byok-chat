import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MarkdownTextPart } from '../src/components/ByokAssistant.tsx'

test('Markdown images do not contact an external origin before approval', () => {
  const html = renderToStaticMarkup(React.createElement(MarkdownTextPart, {
    text: '![Private diagram](https://untrusted.example/collect?synthetic-context)',
    status: { type: 'complete', reason: 'stop' },
  }))
  assert.doesNotMatch(html, /<(?:img|link)\b/)
  assert.match(html, /Load external image/)
  assert.match(html, /untrusted\.example/)
})

test('Markdown retains ordinary formatted text and safe links', () => {
  const html = renderToStaticMarkup(React.createElement(MarkdownTextPart, {
    text: '**Evidence** [source](https://example.com/report)',
    status: { type: 'complete', reason: 'stop' },
  }))
  assert.match(html, /<strong>Evidence<\/strong>/)
  assert.match(html, /href="https:\/\/example.com\/report"/)
})

test('image approval applies only to the exact URL and preserves explicit loading', async () => {
  const { JSDOM } = await import('jsdom')
  const { createRoot } = await import('react-dom/client')
  const dom = new JSDOM('<div id="fixture"></div>', { url: 'https://staging.byok.chat/' })
  const originals = Object.fromEntries(['window', 'document', 'location', 'IS_REACT_ACT_ENVIRONMENT'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  let root
  try {
    for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, location: dom.window.location, IS_REACT_ACT_ENVIRONMENT: true })) {
      Object.defineProperty(globalThis, key, { configurable: true, value })
    }
    const render = (src) => root.render(React.createElement(MarkdownTextPart, {
      text: `![Diagram](${src})`, status: { type: 'complete', reason: 'stop' },
    }))
    root = createRoot(document.getElementById('fixture'))
    await React.act(async () => render('https://images.example/first.png'))
    assert.equal(document.querySelector('img'), null)
    await React.act(async () => document.querySelector('button').click())
    assert.equal(document.querySelector('img').src, 'https://images.example/first.png')
    assert.equal(document.querySelector('img').getAttribute('referrerpolicy'), 'no-referrer')
    await React.act(async () => render('https://images.example/second.png'))
    assert.equal(document.querySelector('img'), null, 'an approved first URL must not approve a replacement')
  } finally {
    if (root) await React.act(async () => root.unmount())
    dom.window.close()
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
})

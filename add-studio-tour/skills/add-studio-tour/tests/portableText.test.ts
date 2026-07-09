/**
 * Unit tests for the safe Portable Text serializer (vendor/studio-tour/
 * portableText.ts). This is the XSS boundary: step copy authored in Sanity is
 * serialized here before driver.js renders it via innerHTML, so these tests lock
 * in that (a) all text is escaped, (b) only allowlisted tags are emitted, and
 * (c) unsafe link schemes are dropped — i.e. no author-supplied markup executes.
 *
 * Run (from this skill dir): npx tsx --test tests/portableText.test.ts
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  escapeHtml,
  portableTextToSafeHtml,
  portableTextToPlainText,
} from '../vendor/studio-tour/portableText.ts'

const block = (children: unknown[], extra: Record<string, unknown> = {}) => ({
  _type: 'block',
  style: 'normal',
  markDefs: [],
  children,
  ...extra,
})
const span = (text: string, marks: string[] = []) => ({ _type: 'span', text, marks })

test('escapeHtml: escapes the five HTML-significant characters', () => {
  assert.equal(escapeHtml(`<>&"'`), '&lt;&gt;&amp;&quot;&#39;')
  assert.equal(escapeHtml('plain'), 'plain')
  assert.equal(escapeHtml(undefined), '')
  assert.equal(escapeHtml(null), '')
})

test('portableTextToSafeHtml: basic paragraph', () => {
  assert.equal(portableTextToSafeHtml([block([span('Hello world')])]), '<p>Hello world</p>')
})

test('portableTextToSafeHtml: decorators render as allowlisted tags', () => {
  assert.equal(
    portableTextToSafeHtml([block([span('a'), span('b', ['strong']), span('c', ['em'])])]),
    '<p>a<strong>b</strong><em>c</em></p>'
  )
})

test('portableTextToSafeHtml: heading and blockquote styles', () => {
  assert.equal(portableTextToSafeHtml([block([span('T')], { style: 'h3' })]), '<h3>T</h3>')
  assert.equal(
    portableTextToSafeHtml([block([span('Q')], { style: 'blockquote' })]),
    '<blockquote>Q</blockquote>'
  )
  // Unknown/unsupported style falls back to a paragraph.
  assert.equal(portableTextToSafeHtml([block([span('x')], { style: 'h9' })]), '<p>x</p>')
})

test('portableTextToSafeHtml: consecutive list items group into one <ul>/<ol>', () => {
  assert.equal(
    portableTextToSafeHtml([
      block([span('one')], { listItem: 'bullet' }),
      block([span('two')], { listItem: 'bullet' }),
      block([span('after')]),
    ]),
    '<ul><li>one</li><li>two</li></ul><p>after</p>'
  )
  assert.equal(
    portableTextToSafeHtml([
      block([span('1')], { listItem: 'number' }),
      block([span('2')], { listItem: 'number' }),
    ]),
    '<ol><li>1</li><li>2</li></ol>'
  )
})

test('portableTextToSafeHtml: safe link annotation renders <a> with a scheme-checked href', () => {
  const html = portableTextToSafeHtml([
    block([span('site', ['l1'])], {
      markDefs: [{ _key: 'l1', _type: 'link', href: 'https://example.com' }],
    }),
  ])
  assert.equal(
    html,
    '<p><a href="https://example.com" rel="noopener noreferrer" target="_blank">site</a></p>'
  )
})

// ─── XSS / injection cases (the whole reason this module exists) ────────────────

test('XSS: text is escaped — injected markup renders as text, never executes', () => {
  const html = portableTextToSafeHtml([
    block([span('<img src=x onerror="alert(document.cookie)">')]),
  ])
  assert.equal(html, '<p>&lt;img src=x onerror=&quot;alert(document.cookie)&quot;&gt;</p>')
  // No real <img> element and no unescaped quote — the payload is inert text.
  assert.doesNotMatch(html, /<img/)
  assert.doesNotMatch(html, /onerror="/)
})

test('XSS: a javascript: link href is dropped (text kept, no anchor)', () => {
  const html = portableTextToSafeHtml([
    block([span('click', ['l1'])], {
      // eslint-disable-next-line no-script-url
      markDefs: [{ _key: 'l1', _type: 'link', href: 'javascript:alert(1)' }],
    }),
  ])
  assert.equal(html, '<p>click</p>')
  assert.doesNotMatch(html, /href/)
  assert.doesNotMatch(html, /javascript:/)
})

test('XSS: control-char-obfuscated javascript: hrefs are dropped (browser would re-form them)', () => {
  const payloads = [
    'java\tscript:alert(1)', // embedded TAB
    'java\nscript:alert(1)', // embedded LF
    'java\r\nscript:alert(1)', // CRLF
    String.fromCharCode(0x01) + 'javascript:alert(1)', // leading C0 control (survives String.trim)
    'jav' + String.fromCharCode(0x00) + 'ascript:alert(1)', // embedded NUL
    ' javascript:alert(1)', // leading space
  ]
  for (const href of payloads) {
    const html = portableTextToSafeHtml([
      block([span('click', ['l1'])], { markDefs: [{ _key: 'l1', _type: 'link', href }] }),
    ])
    assert.equal(html, '<p>click</p>', `href should be dropped: ${JSON.stringify(href)}`)
    assert.doesNotMatch(html, /href/)
    assert.doesNotMatch(html, /script:/i)
  }
})

test('XSS: a data: link href is dropped too', () => {
  const html = portableTextToSafeHtml([
    block([span('x', ['l1'])], {
      markDefs: [{ _key: 'l1', _type: 'link', href: 'data:text/html,<script>alert(1)</script>' }],
    }),
  ])
  assert.equal(html, '<p>x</p>')
  assert.doesNotMatch(html, /<script/)
})

test('XSS: a link href with quotes/markup is attribute-escaped', () => {
  const html = portableTextToSafeHtml([
    block([span('x', ['l1'])], {
      markDefs: [{ _key: 'l1', _type: 'link', href: 'https://e.com/"><script>alert(1)</script>' }],
    }),
  ])
  // The href is emitted (https scheme) but every dangerous char is escaped, so it
  // can't break out of the attribute.
  assert.doesNotMatch(html, /<script/)
  assert.match(html, /&quot;|&lt;|&gt;/)
})

test('portableTextToSafeHtml: non-block members (images/custom types) are skipped', () => {
  assert.equal(
    portableTextToSafeHtml([{ _type: 'image', asset: { _ref: 'x' } }, block([span('kept')])]),
    '<p>kept</p>'
  )
})

test('portableTextToSafeHtml: legacy plain string is escaped and wrapped', () => {
  assert.equal(portableTextToSafeHtml('just text'), '<p>just text</p>')
  assert.equal(portableTextToSafeHtml('<b>x</b>'), '<p>&lt;b&gt;x&lt;/b&gt;</p>')
  assert.equal(portableTextToSafeHtml(''), '')
  assert.equal(portableTextToSafeHtml('   '), '')
})

test('portableTextToSafeHtml: non-array, non-string input → empty string', () => {
  assert.equal(portableTextToSafeHtml(undefined), '')
  assert.equal(portableTextToSafeHtml(null), '')
  assert.equal(portableTextToSafeHtml({}), '')
})

test('portableTextToPlainText: concatenates span text, ignores custom blocks', () => {
  assert.equal(
    portableTextToPlainText([block([span('a'), span('b')]), { _type: 'image' }, block([span('c')])]),
    'ab\nc'
  )
  assert.equal(portableTextToPlainText('already text'), 'already text')
  assert.equal(portableTextToPlainText(undefined), '')
})

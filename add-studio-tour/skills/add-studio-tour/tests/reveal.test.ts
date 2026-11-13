/**
 * Unit tests for the pure reveal planner (vendor/studio-tour/reveal.ts): which
 * public form callback uncovers a field hidden by a collapsed fieldset, a
 * collapsed object, or an unselected group. No DOM, React, or Sanity.
 *
 * Run (from this skill dir): npx tsx --test tests/reveal.test.ts
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { fieldPathSegments, planReveal, type RevealableInput } from '../vendor/studio-tour/reveal.ts'

const input = (over: Partial<RevealableInput> = {}): RevealableInput => ({
  members: [
    { kind: 'field', name: 'title' },
    { kind: 'field', name: 'seo', collapsed: true },
    {
      kind: 'fieldSet',
      fieldSet: {
        name: 'meta',
        collapsed: true,
        members: [{ kind: 'field', name: 'tags' }],
      },
    },
    {
      kind: 'fieldSet',
      fieldSet: { name: 'open', collapsed: false, members: [{ kind: 'field', name: 'slug' }] },
    },
  ],
  groups: [
    { name: 'all-fields', fields: [{ name: 'title' }, { name: 'legal' }] },
    { name: 'content', selected: true, fields: [{ name: 'title' }] },
    { name: 'legal', fields: [{ name: 'legal' }] },
  ],
  ...over,
})

test('planReveal: rendered field → visible', () => {
  assert.equal(planReveal(input(), 'title'), 'visible')
})

test('planReveal: field in an open fieldset → visible', () => {
  assert.equal(planReveal(input(), 'slug'), 'visible')
})

test('planReveal: collapsed object field → expand-field', () => {
  assert.deepEqual(planReveal(input(), 'seo'), { kind: 'expand-field', name: 'seo' })
})

test('planReveal: field inside a collapsed fieldset → expand-fieldset', () => {
  assert.deepEqual(planReveal(input(), 'tags'), { kind: 'expand-fieldset', name: 'meta' })
})

test('planReveal: field in an unselected group → select its own group, remembering the current one', () => {
  assert.deepEqual(planReveal(input(), 'legal'), {
    kind: 'select-group',
    group: 'legal',
    previous: 'content',
  })
})

test('planReveal: falls back to "All fields" when no named group lists the field', () => {
  const i = input({
    groups: [
      { name: 'all-fields', fields: [{ name: 'orphan' }] },
      { name: 'content', selected: true, fields: [] },
    ],
  })
  assert.deepEqual(planReveal(i, 'orphan'), {
    kind: 'select-group',
    group: 'all-fields',
    previous: 'content',
  })
})

test('planReveal: unknown field, or one in a hidden fieldset → missing', () => {
  assert.equal(planReveal(input({ groups: [] }), 'nope'), 'missing')
  const hidden = input({
    members: [
      {
        kind: 'fieldSet',
        fieldSet: { name: 'h', hidden: true, members: [{ kind: 'field', name: 'x' }] },
      },
    ],
  })
  assert.equal(planReveal(hidden, 'x'), 'missing')
})

test('fieldPathSegments: splits dotted paths, ignores empty parts', () => {
  assert.deepEqual(fieldPathSegments('seo.metaTitle'), ['seo', 'metaTitle'])
  assert.deepEqual(fieldPathSegments('title'), ['title'])
  assert.deepEqual(fieldPathSegments('a..b'), ['a', 'b'])
})

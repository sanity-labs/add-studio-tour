/**
 * Unit tests for the tour plugin's pure targeting contract (vendor/studio-tour/
 * targeting.ts). These lock the behaviour that has historically broken silently
 * — chrome-key resolution, field:<name> mapping, and the
 * doc/openPath/openTool/neither branches of mapTour. No DOM, React, or Sanity
 * needed.
 *
 * Run (from this skill dir): npx tsx --test tests/targeting.test.ts
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  DEFAULT_CHROME_SELECTORS,
  mapTour,
  resolveTargetSelector,
  ROLE_FILTER,
  workspaceScopeFilter,
} from '../vendor/studio-tour/targeting.ts'

test('resolveTargetSelector: undefined/empty → undefined', () => {
  assert.equal(resolveTargetSelector(undefined, {}), undefined)
  assert.equal(resolveTargetSelector('', {}), undefined)
})

test('resolveTargetSelector: chrome key → mapped data-testid selector', () => {
  assert.equal(
    resolveTargetSelector('navbar', DEFAULT_CHROME_SELECTORS),
    '[data-testid="studio-navbar"]'
  )
  assert.equal(
    resolveTargetSelector('document-panel', DEFAULT_CHROME_SELECTORS),
    '[data-testid="document-panel-scroller"]'
  )
})

test('resolveTargetSelector: unknown chrome key → undefined (step will be skipped)', () => {
  assert.equal(resolveTargetSelector('nope', DEFAULT_CHROME_SELECTORS), undefined)
})

test('resolveTargetSelector: field:<name> → data-tour-field selector, including nested paths', () => {
  assert.equal(resolveTargetSelector('field:title', {}), '[data-tour-field="title"]')
  assert.equal(
    resolveTargetSelector('field:seo.metaTitle', {}),
    '[data-tour-field="seo.metaTitle"]'
  )
})

test('resolveTargetSelector: custom chromeSelectors resolve too', () => {
  assert.equal(
    resolveTargetSelector('create-page', {
      'create-page': '[data-testid="action-intent-button"]',
    }),
    '[data-testid="action-intent-button"]'
  )
})

test('mapTour: defaults for a near-empty doc', () => {
  const t = mapTour({ _id: 'a' }, DEFAULT_CHROME_SELECTORS)
  assert.equal(t.id, 'a')
  assert.equal(t.label, '(untitled tour)')
  assert.equal(t.description, '')
  assert.deepEqual(t.steps, [])
})

test('mapTour: doc → navigateTo {kind:"doc"} and field target resolved', () => {
  const t = mapTour(
    {
      _id: 'a',
      label: 'L',
      steps: [
        {
          title: 'S1',
          target: 'field:price',
          doc: { _id: 'p1', _type: 'product' },
        },
      ],
    },
    DEFAULT_CHROME_SELECTORS
  )
  assert.equal(t.steps[0].element, '[data-tour-field="price"]')
  assert.deepEqual(t.steps[0].navigateTo, { kind: 'doc', id: 'p1', type: 'product' })
})

test('mapTour: openTool (no doc) → navigateTo {kind:"tool"} and chrome target resolved', () => {
  const t = mapTour(
    { _id: 'a', steps: [{ title: 'S', target: 'navbar', openTool: 'presentation' }] },
    DEFAULT_CHROME_SELECTORS
  )
  assert.equal(t.steps[0].element, '[data-testid="studio-navbar"]')
  assert.deepEqual(t.steps[0].navigateTo, { kind: 'tool', tool: 'presentation' })
})

test('mapTour: doc wins over openTool when both are set', () => {
  const t = mapTour(
    {
      _id: 'a',
      steps: [{ title: 'S', openTool: 'vision', doc: { _id: 'd', _type: 'x' } }],
    },
    DEFAULT_CHROME_SELECTORS
  )
  assert.deepEqual(t.steps[0].navigateTo, { kind: 'doc', id: 'd', type: 'x' })
})

test('mapTour: openPath (no doc) → navigateTo {kind:"path"} and pane-create resolved', () => {
  const t = mapTour(
    {
      _id: 'a',
      steps: [
        { title: 'S', target: 'pane-create', openPath: '/structure/pagesByPath;all-pages-list' },
      ],
    },
    DEFAULT_CHROME_SELECTORS
  )
  assert.equal(
    t.steps[0].element,
    '[data-testid="pane-header"] [data-testid="action-intent-button"]'
  )
  assert.deepEqual(t.steps[0].navigateTo, {
    kind: 'path',
    path: '/structure/pagesByPath;all-pages-list',
  })
})

test('mapTour: precedence doc > openPath > openTool', () => {
  // openPath wins over openTool
  const a = mapTour(
    { _id: 'a', steps: [{ title: 'S', openTool: 'vision', openPath: '/structure/x' }] },
    DEFAULT_CHROME_SELECTORS
  )
  assert.deepEqual(a.steps[0].navigateTo, { kind: 'path', path: '/structure/x' })
  // doc wins over openPath
  const b = mapTour(
    { _id: 'b', steps: [{ title: 'S', openPath: '/structure/x', doc: { _id: 'd', _type: 'y' } }] },
    DEFAULT_CHROME_SELECTORS
  )
  assert.deepEqual(b.steps[0].navigateTo, { kind: 'doc', id: 'd', type: 'y' })
})

test('mapTour: neither doc nor openTool → navigateTo undefined; no target → element undefined + not unresolved', () => {
  const t = mapTour({ _id: 'a', steps: [{ title: 'S' }] }, DEFAULT_CHROME_SELECTORS)
  assert.equal(t.steps[0].navigateTo, undefined)
  assert.equal(t.steps[0].element, undefined)
  // A copy-only step (no target) is NOT a miss.
  assert.equal(t.steps[0].unresolvedTarget, false)
})

test('mapTour: an authored target that maps to no selector is flagged unresolvedTarget (a broken step, not a centered popover)', () => {
  const t = mapTour(
    { _id: 'a', steps: [{ title: 'S', target: '__does_not_exist__' }] },
    DEFAULT_CHROME_SELECTORS
  )
  assert.equal(t.steps[0].element, undefined)
  assert.equal(t.steps[0].unresolvedTarget, true)
})

test('mapTour: a resolvable chrome key / field target is NOT flagged unresolved', () => {
  const t = mapTour(
    {
      _id: 'a',
      steps: [
        { title: 'A', target: 'navbar' },
        { title: 'B', target: 'field:title' },
      ],
    },
    DEFAULT_CHROME_SELECTORS
  )
  assert.equal(t.steps[0].unresolvedTarget, false)
  assert.equal(t.steps[1].unresolvedTarget, false)
})

test('mapTour: Portable Text description → safe HTML; a plain string is escaped (back-compat)', () => {
  const t = mapTour(
    {
      _id: 'a',
      steps: [
        {
          title: 'S1',
          description: [
            {
              _type: 'block',
              style: 'normal',
              children: [{ _type: 'span', text: 'Hello ' }, { _type: 'span', text: 'bold', marks: ['strong'] }],
            },
          ],
        },
        // Legacy string with markup → escaped, never executed.
        { title: 'S2', description: '<img src=x onerror=alert(1)>' },
      ],
    },
    DEFAULT_CHROME_SELECTORS
  )
  assert.equal(t.steps[0].description, '<p>Hello <strong>bold</strong></p>')
  assert.equal(t.steps[1].description, '<p>&lt;img src=x onerror=alert(1)&gt;</p>')
})

test('workspaceScopeFilter: no scope → empty (every tour shows)', () => {
  assert.equal(workspaceScopeFilter(null), '')
  assert.equal(workspaceScopeFilter(''), '')
})

test('workspaceScopeFilter: scoped → predicate incl. untagged/global tours', () => {
  const f = workspaceScopeFilter('marketing')
  assert.equal(
    f,
    ' && (!defined(workspaces) || count(workspaces) == 0 || $scope in workspaces)'
  )
  // composes into a valid-looking filter after `_type == $type`
  assert.ok(`*[_type == $type${f}]`.startsWith('*[_type == $type && ('))
})

test('ROLE_FILTER: untagged tours show to everyone; tagged ones need a matching role', () => {
  assert.equal(
    ROLE_FILTER,
    ' && (!defined(roles) || count(roles) == 0 || count(roles[@ in $userRoles]) > 0)'
  )
  // composes after the workspace scope filter
  assert.ok(
    `*[_type == $type${workspaceScopeFilter('marketing')}${ROLE_FILTER}]`.endsWith(
      'count(roles[@ in $userRoles]) > 0)]'
    )
  )
})

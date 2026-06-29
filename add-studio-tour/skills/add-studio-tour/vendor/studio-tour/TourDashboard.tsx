import { Badge, Box, Card, Container, Flex, Inline, Spinner, Stack, Text } from '@sanity/ui'
import { ChevronDownIcon, ChevronRightIcon } from '@sanity/icons'
import { useMemo, useState } from 'react'
import { DASHBOARD_QUERY, buildTourGroups, summarizeMisses } from './progress'
import { useLiveRows, useActiveTours } from './useTourProgress'
import type { ResolvedProgressConfig, TourProgressDoc, TourProgressStatus } from './types'

/**
 * TourDashboard
 *
 * The view behind the standalone `studioTourDashboard()` plugin's Studio tool.
 * Lists EVERY authored tour (from the content dataset) — even ones nobody has
 * played yet — and, where there are plays, groups them by user:
 *
 *   Tour  ▸  User  ▸  plays (one row per run)
 *
 * Both the tour list and the per-play progress update live via the Live Content
 * API, so completions/closes elsewhere reflect here within ~a second.
 */

const TONE: Record<TourProgressStatus, 'primary' | 'positive' | 'caution'> = {
  in_progress: 'primary',
  completed: 'positive',
  incomplete: 'caution',
}

const LABEL: Record<TourProgressStatus, string> = {
  in_progress: 'In progress',
  completed: 'Completed',
  incomplete: 'Incomplete',
}

function fmt(iso?: string | null): string {
  if (!iso) return '—'
  // Locale string is fine here; this is an internal ops view.
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export function TourDashboard({
  progress,
  schemaTypeName,
  workspaceScope,
}: {
  progress: ResolvedProgressConfig
  schemaTypeName: string
  workspaceScope: string | null
}) {
  const params = useMemo(() => ({ type: progress.typeName }), [progress.typeName])
  const { rows, loading } = useLiveRows<TourProgressDoc>(progress, DASHBOARD_QUERY, params)
  const { tours: tourRows, loading: toursLoading } = useActiveTours(schemaTypeName, workspaceScope)

  // Every tour → its plays grouped by user (pure, tested in progress.ts). When
  // scoped, drop orphan plays so out-of-scope tours' plays don't leak in.
  const tours = useMemo(
    () => buildTourGroups(tourRows, rows, !workspaceScope),
    [tourRows, rows, workspaceScope]
  )

  // Collapsed tours, keyed by tour id. Default expanded (absent = open).
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const toggle = (key: string) => setCollapsed((c) => ({ ...c, [key]: !c[key] }))

  // The workspace column only adds signal when plays span more than one workspace
  // (the shared-dataset / central-management model); hide it otherwise.
  const showWorkspace = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) if (r.workspace) set.add(r.workspace)
    return set.size > 1
  }, [rows])

  const busy = loading || toursLoading

  return (
    <Container width={2} paddingX={5} paddingY={6}>
      <Stack space={5}>
        <Text size={3} weight="semibold">
          Tour progress
        </Text>

        {busy ? (
          <Flex padding={5} justify="center">
            <Spinner muted />
          </Flex>
        ) : tours.length === 0 ? (
          <Card padding={4} radius={2} tone="transparent" border>
            <Text size={1} muted>
              No tours yet. Create a “Guided Tour” document in this workspace.
            </Text>
          </Card>
        ) : (
          <Stack space={5}>
            {tours.map((t) => {
              const isCollapsed = !!collapsed[t.id]
              const misses = summarizeMisses(t.entries)
              return (
                <Stack key={t.id} space={3}>
                  <Card
                    as="button"
                    onClick={() => toggle(t.id)}
                    padding={2}
                    radius={2}
                    tone="transparent"
                    aria-expanded={!isCollapsed}
                    aria-label={`${t.label} — ${t.entries.length} reproductions`}
                    style={{ width: '100%', cursor: 'pointer', textAlign: 'left' }}
                  >
                    <Flex align="center" gap={2}>
                      <Text size={1} muted>
                        {isCollapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
                      </Text>
                      <Text size={2} weight="semibold">
                        {t.label}
                      </Text>
                      <Text size={1} muted>
                        · {t.entries.length}{' '}
                        {t.entries.length === 1 ? 'reproduction' : 'reproductions'}
                      </Text>
                      <Box flex={1} />
                      <Inline space={2}>
                        {misses.steps > 0 ? (
                          <Badge tone="critical" mode="outline" fontSize={0}>
                            ⚠ {misses.steps} missed{' '}
                            {misses.steps === 1 ? 'step' : 'steps'}
                            {misses.targets.length ? ` · ${misses.targets.join(', ')}` : ''}
                          </Badge>
                        ) : null}
                        {t.counts.in_progress > 0 ? (
                          <Badge tone="primary" mode="outline" fontSize={0}>
                            {t.counts.in_progress} in progress
                          </Badge>
                        ) : null}
                        {t.counts.completed > 0 ? (
                          <Badge tone="positive" mode="outline" fontSize={0}>
                            {t.counts.completed} completed
                          </Badge>
                        ) : null}
                        {t.counts.incomplete > 0 ? (
                          <Badge tone="caution" mode="outline" fontSize={0}>
                            {t.counts.incomplete} incomplete
                          </Badge>
                        ) : null}
                      </Inline>
                    </Flex>
                  </Card>

                  {isCollapsed ? null : t.entries.length === 0 ? (
                    <Box paddingX={3} paddingBottom={2}>
                      <Text size={1} muted>
                        No activity yet.
                      </Text>
                    </Box>
                  ) : (
                    <Stack space={4}>
                      {t.users.map((u) => (
                        <Stack key={u.key} space={2}>
                          <Box paddingX={1}>
                            <Text size={1} weight="medium">
                              {u.name}
                              {u.email ? <span style={{ opacity: 0.6 }}> · {u.email}</span> : null}
                            </Text>
                          </Box>
                          {u.rows.map((r) => {
                            const tone = r.status ? TONE[r.status] : 'default'
                            const total = r.totalSteps || 0
                            const step = Math.min((r.currentStep ?? 0) + 1, total || 1)
                            return (
                              <Card key={r._id} padding={3} radius={2} border>
                                <Stack space={3}>
                                  <Flex align="center" gap={3} wrap="wrap">
                                    <Box>
                                      <Badge tone={tone as 'primary'} mode="outline">
                                        {r.status ? LABEL[r.status] : '—'}
                                      </Badge>
                                    </Box>
                                    <Box>
                                      <Text size={1} muted>
                                        Step {step}/{total || '?'}
                                      </Text>
                                    </Box>
                                    {showWorkspace ? (
                                      <Box>
                                        <Text size={1} muted>
                                          {r.workspace || '—'}
                                        </Text>
                                      </Box>
                                    ) : null}
                                    <Box flex={1} />
                                    <Box>
                                      <Text size={1} muted>
                                        {fmt(r.updatedAt)}
                                      </Text>
                                    </Box>
                                  </Flex>
                                  {r.missedSteps && r.missedSteps.length > 0 ? (
                                    <Stack space={1}>
                                      {r.missedSteps.map((m) => (
                                        <Text key={m._key ?? m.stepIndex} size={0} muted>
                                          ⚠ skipped step {m.stepIndex + 1}: “{m.stepTitle}”
                                          {m.target ? ` · ${m.target}` : ''}
                                          {m.selector ? ` (${m.selector})` : ''}
                                        </Text>
                                      ))}
                                    </Stack>
                                  ) : null}
                                </Stack>
                              </Card>
                            )
                          })}
                        </Stack>
                      ))}
                    </Stack>
                  )}
                </Stack>
              )
            })}
          </Stack>
        )}
      </Stack>
    </Container>
  )
}

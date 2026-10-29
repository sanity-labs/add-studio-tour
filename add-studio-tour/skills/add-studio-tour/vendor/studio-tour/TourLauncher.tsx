import { Badge, Box, Button, Flex, Menu, MenuButton, MenuDivider, MenuItem, Spinner, Stack, Text } from '@sanity/ui'
import { CloseIcon, PlayIcon, RetryIcon } from '@sanity/icons'
import { Fragment } from 'react'
import { useTourContext } from './TourController'

/**
 * TourLauncher
 *
 * Lives in the navbar (injected via the plugin's `studio.components.navbar`).
 * When idle it's a dropdown of the workspace's tours; while a tour runs it's a
 * stop button. Uses `mode="bleed"` to match the navbar's other action buttons.
 */
export function TourLauncher() {
  const { tours, loading, isRunning, run, stop, resume, completed } = useTourContext()

  if (isRunning) {
    return (
      <Button
        icon={CloseIcon}
        text="Stop tour"
        tone="critical"
        mode="bleed"
        fontSize={1}
        padding={3}
        onClick={stop}
      />
    )
  }

  return (
    <MenuButton
      id="studio-tour-launcher"
      button={<Button icon={PlayIcon} text="Start tour" mode="bleed" fontSize={1} padding={3} />}
      popover={{ portal: true, placement: 'bottom-end' }}
      menu={
        <Menu>
          {loading ? (
            <Box padding={4}>
              <Spinner muted />
            </Box>
          ) : tours.length === 0 ? (
            <Box padding={3} style={{ maxWidth: 260 }}>
              <Text size={1} muted>
                No tours yet. Create a “Guided Tour” document in this workspace.
              </Text>
            </Box>
          ) : (
            tours.map((tour, idx) => {
              const r = resume[tour.id]
              // Resumable when we have saved progress mid-tour (not at the very
              // start, not already at/past the end).
              const resumable =
                !!r && r.currentStep > 0 && r.totalSteps > 0 && r.currentStep < r.totalSteps
              return (
                <Fragment key={tour.id}>
                  {idx > 0 ? <MenuDivider /> : null}
                  {/* Tour title + description as a non-interactive header, so the
                      actions below (Resume / Start over / Start) are explicit and
                      symmetric rather than "click the tour to continue". */}
                  <Box paddingX={3} paddingTop={3} paddingBottom={2} style={{ maxWidth: 300 }}>
                    <Stack space={2}>
                      <Flex align="center" gap={2}>
                        <Text size={1} weight="medium">
                          {tour.label}
                        </Text>
                        {completed.has(tour.id) ? (
                          <Badge tone="positive" mode="outline" fontSize={0}>
                            Completed
                          </Badge>
                        ) : null}
                      </Flex>
                      {tour.roles.length > 0 ? (
                        <Text size={0} muted>
                          Only for: {tour.roles.join(', ')}
                        </Text>
                      ) : null}
                      {tour.description ? (
                        <Text size={1} muted>
                          {tour.description}
                        </Text>
                      ) : null}
                    </Stack>
                  </Box>
                  {resumable ? (
                    // Resume + Start over side by side in one row. They stay
                    // MenuItems (nested in Flex) so clicking still closes the menu.
                    <Flex paddingX={2} paddingBottom={2} gap={2}>
                      <Box>
                        <MenuItem
                          icon={RetryIcon}
                          text="Start over"
                          fontSize={1}
                          radius={2}
                          onClick={() => run(tour, { startAt: 0 })}
                        />
                      </Box>
                      <Box flex={1}>
                        <MenuItem
                          icon={PlayIcon}
                          text={`Resume · step ${r.currentStep + 1}/${r.totalSteps}`}
                          fontSize={1}
                          radius={2}
                          onClick={() => run(tour, { startAt: r.currentStep, runId: r.runId })}
                        />
                      </Box>
                    </Flex>
                  ) : (
                    <MenuItem
                      icon={PlayIcon}
                      text={`Start · ${tour.steps.length} steps`}
                      fontSize={1}
                      onClick={() => run(tour, { startAt: 0 })}
                    />
                  )}
                </Fragment>
              )
            })
          )}
        </Menu>
      }
    />
  )
}

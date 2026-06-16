import { Box, Button, Menu, MenuButton, MenuItem, Spinner, Stack, Text } from '@sanity/ui'
import { CloseIcon, PlayIcon } from '@sanity/icons'
import { useTourContext } from './TourController'

/**
 * TourLauncher
 *
 * Lives in the navbar (injected via the plugin's `studio.components.navbar`).
 * When idle it's a dropdown of the workspace's tours; while a tour runs it's a
 * stop button. Uses `mode="bleed"` to match the navbar's other action buttons.
 */
export function TourLauncher() {
  const { tours, loading, isRunning, run, stop } = useTourContext()

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
            tours.map((tour) => (
              <MenuItem key={tour.id} onClick={() => run(tour)}>
                <Stack space={2} padding={2} style={{ maxWidth: 280 }}>
                  <Text size={1} weight="medium">
                    {tour.label}
                  </Text>
                  {tour.description ? (
                    <Text size={1} muted>
                      {tour.description}
                    </Text>
                  ) : null}
                  <Text size={0} muted>
                    {tour.steps.length} steps →
                  </Text>
                </Stack>
              </MenuItem>
            ))
          )}
        </Menu>
      }
    />
  )
}

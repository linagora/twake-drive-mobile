# Viewer Modal Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify every file-viewer surface (metadata, share, OnlyOffice / Notes / Docs WebView, video preview) around native iOS `pageSheet` modals with swipe-down dismiss, and fix iOS Picture-in-Picture by detaching the video PiP window from the page-sheet modal to the system level.

**Architecture:** Three orthogonal changes implemented across **11 atomic commits** in **3 sequential PRs**: (1) introduce a root-level `PiPSession` context and wire video PiP to auto-dismiss the preview modal so iOS can detach PiP at system level; (2) replace `@gorhom/bottom-sheet`-based `FileMetadataSheet` and `ShareSheet` (impérative `ref.present(file)` API) with first-class expo-router routes (`app/metadata/[fileId]`, `app/share/[fileId]`) presented as `pageSheet` modals from the root stack, and remove `@gorhom/bottom-sheet`; (3) move `OnlyOffice` / `Notes` / `Docs` / `DocsNew` WebView screens from the drive tab stack into the root stack as chromeless `pageSheet` modals.

**Tech Stack:** React Native + Expo SDK 54, expo-router v5, expo-video, react-native-paper, cozy-client v60, Jest 29 + jest-expo, @testing-library/react-native, TypeScript strict, ESLint, conventional commits.

**Reference spec:** `docs/superpowers/specs/2026-05-18-viewer-modal-refactor-design.md`

---

## File map

### Files to create

```
src/preview/PiPSession.tsx                  // context + provider + usePiPSession hook
src/preview/PiPSession.test.tsx             // claim/release/single-session-at-a-time
src/preview/VideoPreview.tsx                // extracted from app/preview/[fileId].tsx, PiP-aware
src/preview/VideoPreview.test.tsx           // verify PiP callbacks fire router/release
app/metadata/[fileId].tsx                   // ex-FileMetadataSheet as a pageSheet route
app/metadata/[fileId].test.tsx              // mounts the route, exercises actions
app/share/[fileId].tsx                      // ex-ShareSheet as a pageSheet route
app/share/[fileId].test.tsx                 // smoke test of the share route
```

### Files to modify

```
app/_layout.tsx                             // remove gorhom provider, add PiPSessionProvider,
                                            // hoist SharingProvider, declare 6 new pageSheet routes
app/(drive)/_layout.tsx                     // remove SharingProvider wrap, remove 4 hidden Tabs.Screen
app/preview/[fileId].tsx                    // delete inline VideoPreview, import from src/preview
app/(drive)/files/[...path].tsx             // push /metadata + /share routes, useFocusEffect refetch
app/(drive)/recent.tsx                      // same migration pattern
app/(drive)/trash.tsx                       // same (FileMetadataSheet only, no ShareSheet)
app/(drive)/shared/[...path].tsx            // same
app/(drive)/shareddrives/[...path].tsx      // same
src/files/openFromList.ts                   // update paths /(drive)/onlyoffice → /onlyoffice etc.
package.json                                // drop @gorhom/bottom-sheet dependency
```

### Files to delete

```
src/ui/FileMetadataSheet.tsx                // replaced by app/metadata/[fileId].tsx
src/ui/ShareSheet.tsx                       // replaced by app/share/[fileId].tsx
```

### Files to move (git mv)

```
app/(drive)/onlyoffice/[fileId].tsx   → app/onlyoffice/[fileId].tsx
app/(drive)/note/[fileId].tsx         → app/note/[fileId].tsx
app/(drive)/docs/[fileId].tsx         → app/docs/[fileId].tsx
app/(drive)/docs/new/[folderId].tsx   → app/docs/new/[folderId].tsx
```

---

## Conventions used throughout the plan

- **Commits**: conventional commits, format `<type>(<scope>): <subject>`. Scopes used: `preview`, `metadata`, `share`, `drive`, `routing`, `viewer`, `ui`, `deps`. Subject in lowercase, no trailing period, under 70 chars.
- **Trailer**: every commit ends with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` (existing project convention — see `git log`).
- **Test runner**: `npx jest <path>` for one file, `npx jest` for all. The codebase has no `npm test` alias defined separately — just use Jest directly.
- **Type check**: `npx tsc --noEmit`.
- **Lint**: `npx eslint <path>` or `npx eslint .` for all.
- **Each commit must leave**: type check, lint, and `npx jest` all green. Run all three before every commit.

---

## PR 1 — `fix/video-pip-detach` (commits 1-2)

### Task 1: Create `PiPSession` context and provider (commit 1)

**Files:**
- Create: `src/preview/PiPSession.tsx`
- Create: `src/preview/PiPSession.test.tsx`
- Modify: `app/_layout.tsx` (mount the provider)

**Goal:** Introduce a root-level context that tracks the currently-active video preview session — `{ fileId, source }` — so a freshly-mounted `VideoPreview` after PiP "restore" can resume from the same fileId. No player reference is held: the player belongs to whichever `VideoView` is currently mounted (creating a new one on restore is acceptable for v1; flicker tolerated).

- [ ] **Step 1: Create the failing test**

Write `src/preview/PiPSession.test.tsx`:

```tsx
import React from 'react'
import { renderHook, act } from '@testing-library/react-native'

import { PiPSessionProvider, usePiPSession } from './PiPSession'

const wrap = ({ children }: { children: React.ReactNode }) => (
  <PiPSessionProvider>{children}</PiPSessionProvider>
)

describe('PiPSession', () => {
  it('starts with no active session', () => {
    const { result } = renderHook(() => usePiPSession(), { wrapper: wrap })
    expect(result.current.active).toBeNull()
  })

  it('records the active session when claim is called', () => {
    const { result } = renderHook(() => usePiPSession(), { wrapper: wrap })
    act(() => {
      result.current.claim('file-1', { uri: 'https://x/v.mp4', headers: { Authorization: 'B' } })
    })
    expect(result.current.active).toEqual({
      fileId: 'file-1',
      source: { uri: 'https://x/v.mp4', headers: { Authorization: 'B' } }
    })
  })

  it('replaces the active session when claim is called with a new fileId', () => {
    const { result } = renderHook(() => usePiPSession(), { wrapper: wrap })
    act(() => {
      result.current.claim('file-1', { uri: 'https://x/a.mp4', headers: {} })
    })
    act(() => {
      result.current.claim('file-2', { uri: 'https://x/b.mp4', headers: {} })
    })
    expect(result.current.active?.fileId).toBe('file-2')
  })

  it('clears the active session when release is called', () => {
    const { result } = renderHook(() => usePiPSession(), { wrapper: wrap })
    act(() => {
      result.current.claim('file-1', { uri: 'https://x/a.mp4', headers: {} })
    })
    act(() => {
      result.current.release()
    })
    expect(result.current.active).toBeNull()
  })

  it('throws when usePiPSession is called outside a provider', () => {
    const { result } = renderHook(() => {
      try {
        return usePiPSession()
      } catch (e) {
        return e
      }
    })
    expect(result.current).toBeInstanceOf(Error)
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npx jest src/preview/PiPSession.test.tsx`
Expected: FAIL — `Cannot find module './PiPSession'`

- [ ] **Step 3: Implement `PiPSession.tsx`**

Write `src/preview/PiPSession.tsx`:

```tsx
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'

import type { StreamSource } from '@/files/streamUrl'

interface PiPSessionState {
  fileId: string
  source: StreamSource
}

interface PiPSessionContextValue {
  active: PiPSessionState | null
  claim: (fileId: string, source: StreamSource) => void
  release: () => void
}

const PiPSessionContext = createContext<PiPSessionContextValue | null>(null)

export const PiPSessionProvider = ({ children }: { children: React.ReactNode }) => {
  const [active, setActive] = useState<PiPSessionState | null>(null)

  const claim = useCallback((fileId: string, source: StreamSource): void => {
    setActive({ fileId, source })
  }, [])

  const release = useCallback((): void => {
    setActive(null)
  }, [])

  const value = useMemo(() => ({ active, claim, release }), [active, claim, release])

  return <PiPSessionContext.Provider value={value}>{children}</PiPSessionContext.Provider>
}

export const usePiPSession = (): PiPSessionContextValue => {
  const ctx = useContext(PiPSessionContext)
  if (!ctx) throw new Error('usePiPSession must be used inside <PiPSessionProvider>')
  return ctx
}
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `npx jest src/preview/PiPSession.test.tsx`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Mount the provider in `app/_layout.tsx`**

Open `app/_layout.tsx` and add the import (alphabetically among the other `@/...` imports):

```tsx
import { PiPSessionProvider } from '@/preview/PiPSession'
```

Then wrap the `<Stack>` with `<PiPSessionProvider>` — find the existing block:

```tsx
            <BottomSheetModalProvider>
              <ErrorBoundary>
                <Stack screenOptions={{ headerShown: false }}>
                  ...
                </Stack>
              </ErrorBoundary>
            </BottomSheetModalProvider>
```

Change it to wrap with `<PiPSessionProvider>` *inside* `<BottomSheetModalProvider>` (gorhom is still here in PR 1 — it goes away in PR 2):

```tsx
            <BottomSheetModalProvider>
              <PiPSessionProvider>
                <ErrorBoundary>
                  <Stack screenOptions={{ headerShown: false }}>
                    ...
                  </Stack>
                </ErrorBoundary>
              </PiPSessionProvider>
            </BottomSheetModalProvider>
```

- [ ] **Step 6: Type check + lint**

Run: `npx tsc --noEmit && npx eslint src/preview/ app/_layout.tsx`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git checkout -b fix/video-pip-detach
git add src/preview/PiPSession.tsx src/preview/PiPSession.test.tsx app/_layout.tsx
git commit -m "$(cat <<'EOF'
feat(preview): add PiPSession context at root

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Extract `VideoPreview` + wire PiP detach (commit 2)

**Files:**
- Create: `src/preview/VideoPreview.tsx`
- Create: `src/preview/VideoPreview.test.tsx`
- Modify: `app/preview/[fileId].tsx` (replace inline `VideoPreview` with import)

**Goal:** Pull `VideoPreview` out of the route file into its own module, register the active session into `PiPSession` on mount, and wire `onPictureInPictureStart` → `router.back()` + `onPictureInPictureStop` → restore-via-`router.push` or release.

- [ ] **Step 1: Write the failing test**

Write `src/preview/VideoPreview.test.tsx`:

```tsx
import React from 'react'
import { render } from '@testing-library/react-native'

const back = jest.fn()
const push = jest.fn()

jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ back, push })
}))

const captured: { onStart?: () => void; onStop?: () => void } = {}

jest.mock('expo-video', () => ({
  __esModule: true,
  VideoView: (props: { onPictureInPictureStart?: () => void; onPictureInPictureStop?: () => void }) => {
    captured.onStart = props.onPictureInPictureStart
    captured.onStop = props.onPictureInPictureStop
    return null
  },
  useVideoPlayer: jest.fn().mockImplementation(() => ({
    play: jest.fn(),
    pause: jest.fn(),
    playing: true,
    addListener: jest.fn().mockReturnValue({ remove: jest.fn() })
  }))
}))

import { PiPSessionProvider } from './PiPSession'
import { VideoPreview } from './VideoPreview'

const wrap = (ui: React.ReactElement) => <PiPSessionProvider>{ui}</PiPSessionProvider>

describe('VideoPreview', () => {
  beforeEach(() => {
    back.mockReset()
    push.mockReset()
    captured.onStart = undefined
    captured.onStop = undefined
  })

  it('dismisses the modal when PiP starts', () => {
    render(wrap(<VideoPreview fileId="f1" source={{ uri: 'https://x/v.mp4', headers: {} }} />))
    captured.onStart!()
    expect(back).toHaveBeenCalledTimes(1)
  })

  it('re-pushes the preview route when PiP stops while still playing', () => {
    render(wrap(<VideoPreview fileId="f1" source={{ uri: 'https://x/v.mp4', headers: {} }} />))
    captured.onStop!()
    expect(push).toHaveBeenCalledWith('/preview/f1')
  })

  it('releases the session when PiP stops while paused', () => {
    const { useVideoPlayer } = jest.requireMock('expo-video') as { useVideoPlayer: jest.Mock }
    useVideoPlayer.mockReturnValueOnce({
      play: jest.fn(),
      pause: jest.fn(),
      playing: false,
      addListener: jest.fn().mockReturnValue({ remove: jest.fn() })
    })
    render(wrap(<VideoPreview fileId="f1" source={{ uri: 'https://x/v.mp4', headers: {} }} />))
    captured.onStop!()
    expect(push).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npx jest src/preview/VideoPreview.test.tsx`
Expected: FAIL — `Cannot find module './VideoPreview'`

- [ ] **Step 3: Implement `VideoPreview.tsx`**

Write `src/preview/VideoPreview.tsx` — copy the body of the inline `VideoPreview` from `app/preview/[fileId].tsx` and adapt:

```tsx
import React, { useEffect, useState } from 'react'
import { Dimensions, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useVideoPlayer, VideoView } from 'expo-video'
import { ActivityIndicator, ProgressBar } from 'react-native-paper'

import type { StreamSource } from '@/files/streamUrl'
import { usePiPSession } from './PiPSession'

interface VideoPreviewProps {
  fileId: string
  source: StreamSource
}

const { width: SCREEN_WIDTH } = Dimensions.get('window')

export const VideoPreview = ({ fileId, source }: VideoPreviewProps): React.ReactElement => {
  const router = useRouter()
  const { claim, release } = usePiPSession()
  const player = useVideoPlayer({ uri: source.uri, headers: source.headers }, p => {
    p.loop = false
    p.staysActiveInBackground = true
    p.play()
  })
  const [ready, setReady] = useState(false)

  useEffect(() => {
    claim(fileId, source)
  }, [fileId, source, claim])

  useEffect(() => {
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') setReady(true)
    })
    return () => sub.remove()
  }, [player])

  return (
    <View style={styles.viewerContainer}>
      <VideoView
        player={player}
        style={styles.video}
        contentFit="contain"
        fullscreenOptions={{ enable: true }}
        allowsPictureInPicture
        startsPictureInPictureAutomatically
        nativeControls
        onPictureInPictureStart={() => {
          // Dismiss the page-sheet modal so iOS can detach PiP at system
          // level. AVPictureInPictureController cannot detach from a
          // presented page-sheet view controller — the parent must be
          // dismissed first.
          if (router.canGoBack()) router.back()
        }}
        onPictureInPictureStop={() => {
          // expo-video does not distinguish PiP "restore" vs "close" in the
          // same callback. Heuristic: if the player is still playing, the
          // user tapped restore — re-open the preview route. If paused,
          // they tapped close — release the session.
          if (player.playing) {
            router.push(`/preview/${fileId}`)
          } else {
            release()
          }
        }}
      />
      {!ready ? (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#fff" />
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  viewerContainer: { flex: 1 },
  video: { flex: 1, width: SCREEN_WIDTH, backgroundColor: '#000' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)'
  }
})
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `npx jest src/preview/VideoPreview.test.tsx`
Expected: PASS — all 3 tests green.

- [ ] **Step 5: Replace inline `VideoPreview` in the preview route**

Open `app/preview/[fileId].tsx`. Find the entire inline `VideoPreview` block (currently lines ~116-143) and **delete it**. Replace with an import at the top of the file (alphabetically among the `@/...` imports):

```tsx
import { VideoPreview } from '@/preview/VideoPreview'
```

Find the call site in `renderViewer()`:

```tsx
      case 'video':
        return <VideoPreview source={source} />
```

Change to pass `fileId`:

```tsx
      case 'video':
        return <VideoPreview fileId={fileId!} source={source} />
```

Note: `fileId` is the `useLocalSearchParams` value declared near the top of the route. It is asserted non-null because `renderViewer` is only reached after the `!fileId` early-out — but the `!` is needed because TypeScript doesn't track that flow.

- [ ] **Step 6: Run all tests + type check + lint**

Run: `npx jest && npx tsc --noEmit && npx eslint .`
Expected: all green. No regression in existing preview tests.

- [ ] **Step 7: iOS manual verification gate**

Build and run on a physical iOS device (PiP does not work in the iOS Simulator):
```bash
npx expo run:ios --device
```
Smoke-test:
1. Tap a video file → preview opens.
2. Tap the PiP button in the player controls.
3. **Expected**: modal dismisses, PiP window floats at system level, you can browse the drive.
4. Tap "restore" in the PiP window.
5. **Expected**: preview modal re-opens with video playing.
6. Repeat step 2, then tap "close" in the PiP window.
7. **Expected**: no modal re-opens, playback stops.

If step 3 fails (PiP stays inside modal) — do NOT proceed. The fundamental detach must work for this PR to be worth merging. Likely cause: timing race; try wrapping `router.back()` in `setTimeout(..., 0)` or `requestAnimationFrame`. Iterate.

If step 5 fails (restore opens an empty preview / no playback) — proceed but add a follow-up `TODO(pip-restore)` comment in `VideoPreview.tsx`. The simple architecture has a known limitation: the new VideoView creates a fresh player which iOS may not bridge to the existing PiP layer. A v2 fix would hoist the player at the provider level.

- [ ] **Step 8: Commit**

```bash
git add src/preview/VideoPreview.tsx src/preview/VideoPreview.test.tsx app/preview/[fileId].tsx
git commit -m "$(cat <<'EOF'
fix(preview): detach video PiP via PiPSession + auto-dismiss

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 9: Push and open PR 1**

```bash
git push -u origin fix/video-pip-detach
gh pr create --title "fix(preview): detach video pip from page-sheet modal" --body "$(cat <<'EOF'
## Summary
- Adds `PiPSession` context at the root to track the active video session
- Extracts `VideoPreview` from `app/preview/[fileId].tsx` into its own module
- Wires `onPictureInPictureStart` → `router.back()` so iOS can detach the PiP window to system level (it cannot detach from a presented page-sheet view controller)
- Wires `onPictureInPictureStop` → re-push preview route on restore, release on close (heuristic: `player.playing`)

## Test plan
- [ ] Jest: `npx jest src/preview` green
- [ ] iOS device: tap PiP button → modal dismisses, PiP window detaches to OS level, drive browsable
- [ ] iOS device: tap PiP restore → preview re-opens, video playing
- [ ] iOS device: tap PiP close → no modal, playback stops

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## PR 2 — `refactor/sheets-to-routes` (commits 3-8, 11)

> **Before starting PR 2**: make sure PR 1 is merged to `main`, then:
> ```bash
> git checkout main && git pull
> git checkout -b refactor/sheets-to-routes
> ```

### Task 3: Add `/metadata/[fileId]` modal route (commit 3)

**Files:**
- Create: `app/metadata/[fileId].tsx`
- Create: `app/metadata/[fileId].test.tsx`
- Modify: `app/_layout.tsx` (declare the route, hoist `SharingProvider`)
- Modify: `app/(drive)/_layout.tsx` (drop the now-hoisted `SharingProvider`)

**Goal:** Stand up the new metadata route as a pageSheet modal. No caller is wired to it yet — the existing `<FileMetadataSheet>` keeps working until task 4. This commit must NOT regress any current behaviour.

Note: `SharingProvider` currently wraps the drive tab stack in `app/(drive)/_layout.tsx`. The new route lives in the root stack outside `(drive)`, so we hoist `SharingProvider` to `app/_layout.tsx`. The drive layout drops its `<SharingProvider>` wrap. Children (`FileRow`, `FolderRow`, `SharedBadge`) read via context, so they keep working as long as the provider sits above them in the tree.

- [ ] **Step 1: Hoist `SharingProvider` to root layout**

Open `app/_layout.tsx`. Add the import:

```tsx
import { SharingProvider } from '@/sharing/SharingProvider'
```

Wrap `<PiPSessionProvider>` with `<SharingProvider>` (the provider needs `useClient` which lives inside `CozyProvider`; that's why we wrap it inside the `CozyProvider`-providing `content` variable — see how `attachRevocationListener` consumes `client`). The cleanest spot is just inside `<PiPSessionProvider>`:

```tsx
            <BottomSheetModalProvider>
              <PiPSessionProvider>
                <SharingProvider>
                  <ErrorBoundary>
                    <Stack screenOptions={{ headerShown: false }}>
                      ...
                    </Stack>
                  </ErrorBoundary>
                </SharingProvider>
              </PiPSessionProvider>
            </BottomSheetModalProvider>
```

> **Important**: `SharingProvider` calls `useClient()`, which must be inside `CozyProvider`. Look at the bottom of `InnerLayout()`: `content` is wrapped by `<CozyProvider client={client}>{content}</CozyProvider>` *only when* `client` is non-null. That means the providers above must also be inside that wrap — which they are, because `content` already wraps them. No further change needed.

Open `app/(drive)/_layout.tsx`. Remove the `<SharingProvider>` wrap:

```tsx
// Before:
return (
  <SharingProvider>
    <OfflineBanner />
    <Tabs ...>
      ...
    </Tabs>
  </SharingProvider>
)

// After:
return (
  <>
    <OfflineBanner />
    <Tabs ...>
      ...
    </Tabs>
  </>
)
```

Also drop the now-unused import:

```tsx
import { SharingProvider } from '@/sharing/SharingProvider'  // delete this line
```

- [ ] **Step 2: Verify hoist didn't break anything**

Run: `npx tsc --noEmit && npx jest`
Expected: all green.

- [ ] **Step 3: Declare the new route in `app/_layout.tsx`**

Inside the `<Stack>` block, after the existing `<Stack.Screen name="preview/[fileId]" ...>`, add:

```tsx
                    <Stack.Screen
                      name="metadata/[fileId]"
                      options={{ presentation: 'pageSheet', animation: 'slide_from_bottom' }}
                    />
```

- [ ] **Step 4: Write the failing test for the new route**

Write `app/metadata/[fileId].test.tsx`:

```tsx
import React from 'react'
import { Provider as PaperProvider } from 'react-native-paper'
import { fireEvent, render, screen } from '@testing-library/react-native'

const back = jest.fn()
const push = jest.fn()
const replace = jest.fn()

jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ back, push, replace, canGoBack: () => true }),
  useLocalSearchParams: () => ({ fileId: 'f1' })
}))

jest.mock('cozy-client', () => ({
  __esModule: true,
  useClient: () => null,
  useQuery: () => ({
    data: {
      _id: 'f1',
      name: 'rapport.pdf',
      type: 'file',
      size: 2_400_000,
      mime: 'application/pdf',
      updated_at: '2026-04-29T10:00:00.000Z',
      path: '/Drive/rapport.pdf',
      cozyMetadata: { createdBy: { account: 'me' } }
    },
    fetchStatus: 'loaded'
  })
}))

jest.mock('@/offline/useOfflineState', () => ({ useOfflineState: () => undefined }))
jest.mock('@/offline/useOfflineActions', () => ({
  useOfflineActions: () => ({ pin: jest.fn(), unpin: jest.fn() })
}))
jest.mock('@/network/useIsOnline', () => ({ useIsOnline: () => true }))

import MetadataRoute from './[fileId]'

const wrap = (ui: React.ReactElement) => <PaperProvider>{ui}</PaperProvider>

describe('MetadataRoute', () => {
  beforeEach(() => {
    back.mockReset()
    push.mockReset()
    replace.mockReset()
  })

  it('renders the file name', () => {
    render(wrap(<MetadataRoute />))
    expect(screen.getByText('rapport.pdf')).toBeOnTheScreen()
  })

  it('calls router.replace with /share/<fileId> when Share is tapped', () => {
    render(wrap(<MetadataRoute />))
    fireEvent.press(screen.getByText('drive.fileMeta.share'))
    expect(replace).toHaveBeenCalledWith('/share/f1')
  })

  it('calls router.back when Close is tapped', () => {
    render(wrap(<MetadataRoute />))
    fireEvent.press(screen.getByText('common.close'))
    expect(back).toHaveBeenCalled()
  })
})
```

Note: `react-i18next`'s `useTranslation` is used in the route — it returns the key as the text when no translation backend is loaded in tests, which is why we assert against `'drive.fileMeta.share'` etc.

- [ ] **Step 5: Run test to confirm it fails**

Run: `npx jest app/metadata/`
Expected: FAIL — `Cannot find module './[fileId]'`.

- [ ] **Step 6: Implement `app/metadata/[fileId].tsx`**

Copy the body of `src/ui/FileMetadataSheet.tsx` and adapt for the route. Write `app/metadata/[fileId].tsx`:

```tsx
import React, { useCallback, useState } from 'react'
import { Image, Linking, StyleSheet, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Button, Divider, Snackbar, Switch, Text, useTheme } from 'react-native-paper'
import { format } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { useClient, useQuery } from 'cozy-client'

import { ScreenContainer } from '@/ui/ScreenContainer'
import { LoadingState } from '@/ui/LoadingState'
import { ErrorState } from '@/ui/ErrorState'
import { FileThumbnail } from '@/ui/FileThumbnail'
import { RenameDialog } from '@/ui/RenameDialog'
import { ConfirmDeleteDialog } from '@/ui/ConfirmDeleteDialog'
import { formatFileSize } from '@/utils/formatters'
import { openFileNatively } from '@/files/openFile'
import { renameEntry } from '@/files/renameEntry'
import { softDeleteEntry } from '@/files/deleteFile'
import { isCozyNoteFile, isDocsNoteFile, isOfficeFile, isShortcutFile } from '@/files/fileTypes'
import { fetchShortcutUrl } from '@/files/shortcuts'
import { canPreviewInApp } from '@/files/streamUrl'
import { fileByIdQuery, fileByIdQueryAs, FileQueryResult } from '@/client/queries'
import { useIsOnline } from '@/network/useIsOnline'
import { useOfflineState } from '@/offline/useOfflineState'
import { useOfflineActions } from '@/offline/useOfflineActions'
import { FileSystemRepo } from '@/offline/FileSystemRepo'

const Row = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.row}>
    <Text variant="labelMedium" style={styles.label}>{label}</Text>
    <Text variant="bodyMedium" style={styles.value}>{value}</Text>
  </View>
)

export default function MetadataRoute() {
  const router = useRouter()
  const { t } = useTranslation()
  const theme = useTheme()
  const client = useClient()
  const isOnline = useIsOnline()
  const { fileId } = useLocalSearchParams<{ fileId: string }>()

  const fileLookup = useQuery(fileByIdQuery(fileId ?? ''), {
    as: fileByIdQueryAs(fileId ?? ''),
    enabled: !!fileId
  })
  const lookupData = fileLookup.data
  const file = (Array.isArray(lookupData) ? lookupData[0] : lookupData) as
    | FileQueryResult
    | null
    | undefined

  const offlineEntry = useOfflineState(fileId ?? undefined)
  const { pin, unpin } = useOfflineActions()
  const isPinned = !!offlineEntry
  const togglePin = (): void => {
    if (!file) return
    if (isPinned) void unpin(file._id)
    else pin({ _id: file._id, name: file.name, size: file.size ?? null })
  }

  const [opening, setOpening] = useState(false)
  const [openError, setOpenError] = useState<string | null>(null)
  const [renameVisible, setRenameVisible] = useState(false)
  const [deleteVisible, setDeleteVisible] = useState(false)
  const [mutating, setMutating] = useState(false)
  const [snackbar, setSnackbar] = useState<string | null>(null)

  const close = useCallback((): void => {
    if (router.canGoBack()) router.back()
  }, [router])

  const onOpen = async (): Promise<void> => {
    if (!client || !file) return
    if (isCozyNoteFile(file.name)) {
      close()
      router.push(`/note/${file._id}`)
      return
    }
    if (isDocsNoteFile(file.name)) {
      close()
      router.push(`/docs/${file._id}`)
      return
    }
    if (isOfficeFile(file.mime)) {
      close()
      router.push(`/onlyoffice/${file._id}`)
      return
    }
    if (canPreviewInApp(file)) {
      close()
      router.push(`/preview/${file._id}`)
      return
    }
    if (isShortcutFile(file)) {
      setOpening(true)
      setOpenError(null)
      try {
        const url = await fetchShortcutUrl(client, file._id)
        if (!url) throw new Error('Shortcut has no target URL')
        close()
        await Linking.openURL(url)
      } catch (e) {
        setOpenError((e as Error).message ?? 'open failed')
      } finally {
        setOpening(false)
      }
      return
    }
    setOpening(true)
    setOpenError(null)
    try {
      await openFileNatively(client, { _id: file._id, name: file.name, mime: file.mime })
    } catch (e) {
      setOpenError((e as Error).message ?? 'open failed')
    } finally {
      setOpening(false)
    }
  }

  const onShare = (): void => {
    if (!file) return
    router.replace(`/share/${file._id}`)
  }

  const onRenameSubmit = async (newName: string): Promise<void> => {
    if (!client || !file) return
    setMutating(true)
    try {
      await renameEntry(client, file._id, newName)
      setRenameVisible(false)
      setSnackbar(
        t(file.type === 'directory' ? 'drive.rename.successFolder' : 'drive.rename.successFile')
      )
      setTimeout(close, 600)
    } catch (e) {
      setSnackbar(t('drive.rename.errorGeneric'))
    } finally {
      setMutating(false)
    }
  }

  const onDeleteConfirm = async (): Promise<void> => {
    if (!client || !file) return
    setMutating(true)
    try {
      await softDeleteEntry(client, {
        _id: file._id,
        _rev: (file as unknown as { _rev?: string })._rev,
        name: file.name,
        type: file.type
      })
      setDeleteVisible(false)
      setSnackbar(
        t(file.type === 'directory' ? 'drive.delete.successFolder' : 'drive.delete.successFile')
      )
      setTimeout(close, 600)
    } catch (e) {
      setSnackbar(t('drive.delete.errorGeneric'))
    } finally {
      setMutating(false)
    }
  }

  if (fileLookup.fetchStatus === 'loading' && !file) {
    return <ScreenContainer><LoadingState /></ScreenContainer>
  }
  if (!file) {
    return (
      <ScreenContainer>
        <ErrorState message={t('drive.preview.loadFailed')} onRetry={() => fileLookup.fetch()} />
      </ScreenContainer>
    )
  }

  return (
    <ScreenContainer>
      <View style={styles.container}>
        <View style={styles.header}>
          {isPinned && offlineEntry?.state === 'downloaded' && file.class === 'image' ? (
            <Image
              source={{ uri: FileSystemRepo.localPath(file._id) }}
              style={styles.localPreview}
              resizeMode="contain"
              accessibilityLabel={file.name}
            />
          ) : (
            <FileThumbnail file={file} size={120} />
          )}
          <Text variant="titleMedium" style={styles.name}>{file.name}</Text>
        </View>
        <Divider />
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>{t('drive.offline.keepOffline')}</Text>
          <Switch value={isPinned} onValueChange={togglePin} disabled={!isPinned && !isOnline} />
        </View>
        {!isPinned && !isOnline ? (
          <Text style={[styles.toggleHelper, { color: theme.colors.outline }]}>
            {t('drive.offline.disabledOffline')}
          </Text>
        ) : null}
        <Divider />
        <Row label={t('drive.fileMeta.type')} value={file.mime ?? '—'} />
        <Row label={t('drive.fileMeta.size')} value={formatFileSize(file.size)} />
        <Row
          label={t('drive.fileMeta.modified')}
          value={file.updated_at ? format(new Date(file.updated_at), 'PPp') : '—'}
        />
        <Row label={t('drive.fileMeta.path')} value={file.path ?? '—'} />
        <Row
          label={t('drive.fileMeta.owner')}
          value={file.cozyMetadata?.createdBy?.account ?? '—'}
        />
        <View style={styles.footer}>
          <Button
            mode="contained"
            onPress={onOpen}
            loading={opening}
            disabled={opening || (!isOnline && offlineEntry?.state !== 'downloaded')}
            icon="open-in-new"
          >
            {t('drive.fileMeta.open')}
          </Button>
          {openError ? (
            <Text variant="bodySmall" style={[styles.errorText, { color: theme.colors.error }]}>
              {openError}
            </Text>
          ) : null}
          <Button mode="outlined" onPress={onShare} icon="share-variant" disabled={!isOnline}>
            {t('drive.fileMeta.share')}
          </Button>
          <Button
            mode="outlined"
            onPress={() => setRenameVisible(true)}
            icon="pencil-outline"
            disabled={!isOnline}
          >
            {t('drive.fileMeta.rename')}
          </Button>
          <Button
            mode="outlined"
            onPress={() => setDeleteVisible(true)}
            icon="trash-can-outline"
            textColor={theme.colors.error}
            disabled={!isOnline}
          >
            {t('drive.fileMeta.delete')}
          </Button>
          {!isOnline ? (
            <Text variant="bodySmall" style={[styles.hint, { color: theme.colors.outline }]}>
              {t('drive.offline.requiresOnline')}
            </Text>
          ) : null}
          <Button mode="outlined" onPress={close}>{t('common.close')}</Button>
        </View>
      </View>
      <RenameDialog
        visible={renameVisible}
        initialName={file.name}
        type={file.type}
        onDismiss={() => (mutating ? undefined : setRenameVisible(false))}
        onSubmit={onRenameSubmit}
      />
      <ConfirmDeleteDialog
        visible={deleteVisible}
        target={file}
        loading={mutating}
        onConfirm={() => void onDeleteConfirm()}
        onDismiss={() => (mutating ? undefined : setDeleteVisible(false))}
      />
      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)} duration={3000}>
        {snackbar ?? ''}
      </Snackbar>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingBottom: 32 },
  header: { alignItems: 'center', paddingVertical: 16, gap: 8 },
  localPreview: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 8,
    backgroundColor: '#00000010'
  },
  name: { textAlign: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12 },
  label: { flex: 1 },
  value: { flex: 2, textAlign: 'right' },
  footer: { marginTop: 24, gap: 8 },
  errorText: { textAlign: 'center' },
  hint: { textAlign: 'center', marginTop: 4 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8
  },
  toggleLabel: { fontSize: 14 },
  toggleHelper: { fontSize: 12, paddingBottom: 8 }
})
```

- [ ] **Step 7: Run test to confirm it passes**

Run: `npx jest app/metadata/`
Expected: PASS — 3 tests green.

- [ ] **Step 8: Run all tests + type check + lint**

Run: `npx jest && npx tsc --noEmit && npx eslint .`
Expected: all green. The old `FileMetadataSheet` still exists and is still used — no caller has been migrated yet — so the existing behaviour is intact.

- [ ] **Step 9: Commit**

```bash
git add app/metadata/ app/_layout.tsx app/'(drive)'/_layout.tsx
git commit -m "$(cat <<'EOF'
feat(metadata): add /metadata/[fileId] modal route

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Migrate the 5 list screens to push `/metadata` (commit 4)

**Files:**
- Modify: `app/(drive)/files/[...path].tsx`
- Modify: `app/(drive)/recent.tsx`
- Modify: `app/(drive)/trash.tsx`
- Modify: `app/(drive)/shared/[...path].tsx`
- Modify: `app/(drive)/shareddrives/[...path].tsx`

**Goal:** Replace `sheetRef.current?.present(file)` with `router.push('/metadata/' + file._id)` in every list screen. Add `useFocusEffect` for re-fetch on return. Leave `<ShareSheet>` and the ShareSheet ref untouched in this commit — they go in task 7.

**Pattern (apply to each file):**
1. Remove `useRef<FileMetadataSheetHandle>(null)` and its `FileMetadataSheet` import.
2. Remove the `<FileMetadataSheet ...>` render at the bottom of the JSX.
3. In every callback that today does `sheetRef.current?.present({ ...file, cozyMetadata, path })`, replace with `router.push('/metadata/' + file._id)`. The `cozyMetadata` / `path` parameters are dropped at the call site — the route re-queries via `fileByIdQuery` which returns them.
4. Move the existing `<RenameDialog>` and `<ConfirmDeleteDialog>` if they were *only* opened from the sheet's callbacks (`onRenameRequested` / `onDeleteRequested`) — but keep them if they're also opened from the row 3-dot menu or bulk-select. In the 5 screens, the dialogs are opened from BOTH paths, so they stay.
5. Add `useFocusEffect(useCallback(() => { void query.fetch() ... }, [...]))` so post-mutation lists refresh when the modal closes.

- [ ] **Step 1: Update `app/(drive)/files/[...path].tsx`**

Imports — remove:
```tsx
import { FileMetadataSheet, FileMetadataSheetHandle } from '@/ui/FileMetadataSheet'
```

Add to expo-router import:
```tsx
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
```

Body — remove:
```tsx
const sheetRef = useRef<FileMetadataSheetHandle>(null)
```

In the `renderItem` for files, replace the `onInfo` callback:

```tsx
        onInfo={
          selection.isSelecting
            ? undefined
            : file => router.push(`/metadata/${file._id}`)
        }
```

After the `useQuery` blocks (around current line 96), add:

```tsx
useFocusEffect(
  useCallback(() => {
    void foldersQuery.fetch()
    void filesQuery.fetch()
  }, [foldersQuery, filesQuery])
)
```

JSX — remove the entire `<FileMetadataSheet ... />` block (including its three `onShareRequested` / `onRenameRequested` / `onDeleteRequested` props).

- [ ] **Step 2: Update `app/(drive)/recent.tsx`**

Same pattern. Imports — drop `FileMetadataSheet` and `FileMetadataSheetHandle`. Add `useFocusEffect`, `useCallback`.

Body — drop `const sheetRef = useRef<FileMetadataSheetHandle>(null)`.

In `renderItem`, replace:
```tsx
      onInfo={file =>
        sheetRef.current?.present({ ...file, cozyMetadata: item.cozyMetadata, path: item.path })
      }
```
with:
```tsx
      onInfo={file => router.push(`/metadata/${file._id}`)}
```

After the `useQuery`, add:
```tsx
useFocusEffect(useCallback(() => { void query.fetch() }, [query]))
```

JSX — drop the `<FileMetadataSheet ... />` block.

- [ ] **Step 3: Update `app/(drive)/trash.tsx`**

Imports — drop `FileMetadataSheet` and `FileMetadataSheetHandle`. Add `useFocusEffect`, `useCallback`, `useRouter` (if not already imported).

Body — drop `const sheetRef = useRef<FileMetadataSheetHandle>(null)` and add `const router = useRouter()`.

In `renderItem` (around current line 109), replace:
```tsx
        onPress={file => {
          sheetRef.current?.present({ ...file, cozyMetadata: item.cozyMetadata, path: item.path })
        }}
```
with:
```tsx
        onPress={file => router.push(`/metadata/${file._id}`)}
```

After the `useQuery`, add:
```tsx
useFocusEffect(
  useCallback(() => {
    void foldersQuery.fetch()
    void filesQuery.fetch()
  }, [foldersQuery, filesQuery])
)
```

JSX — drop the `<FileMetadataSheet ref={sheetRef} />` line (current line 153).

- [ ] **Step 4: Update `app/(drive)/shared/[...path].tsx`**

Same pattern as files. Drop `FileMetadataSheet` + handle import + ref + the `<FileMetadataSheet ...>` block. Replace the `onInfo` callback with `router.push`. Add `useFocusEffect`.

- [ ] **Step 5: Update `app/(drive)/shareddrives/[...path].tsx`**

Same pattern.

- [ ] **Step 6: Run all tests + type check + lint**

Run: `npx jest && npx tsc --noEmit && npx eslint .`
Expected: all green.

> If lint complains about unused imports (`useRef` no longer needed in some screens), remove them.

- [ ] **Step 7: Manual smoke (iOS or Android simulator)**

```bash
npx expo run:ios
```
Open Mes fichiers → tap the 3-dot menu on a file → "Info" → modal pageSheet opens with the metadata. Swipe down. Confirm the list still shows the same data and no crash.

- [ ] **Step 8: Commit**

```bash
git add app/'(drive)'/
git commit -m "$(cat <<'EOF'
refactor(drive): list screens push /metadata route instead of presenting sheet

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Remove the now-unused `FileMetadataSheet` component (commit 5)

**Files:**
- Delete: `src/ui/FileMetadataSheet.tsx`

**Goal:** Drop the old sheet. After task 4, no file imports it.

- [ ] **Step 1: Verify no remaining import**

Run: `grep -rn "FileMetadataSheet" src app | grep -v "src/ui/FileMetadataSheet.tsx"`
Expected: no output.

If any caller is missed, finish migrating it first (back to task 4) before proceeding.

- [ ] **Step 2: Delete the file**

```bash
git rm src/ui/FileMetadataSheet.tsx
```

- [ ] **Step 3: Run all tests + type check + lint**

Run: `npx jest && npx tsc --noEmit && npx eslint .`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
chore(ui): remove unused FileMetadataSheet component

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Add `/share/[fileId]` modal route (commit 6)

**Files:**
- Create: `app/share/[fileId].tsx`
- Create: `app/share/[fileId].test.tsx`
- Modify: `app/_layout.tsx` (declare the route)

**Goal:** Mirror task 3 for the ShareSheet. Lift the 651-line `src/ui/ShareSheet.tsx` body into the route, swap `forwardRef` + `present(file)` for `useLocalSearchParams` + `useQuery`. No caller wired yet — the existing `<ShareSheet>` still works.

- [ ] **Step 1: Declare the route in `app/_layout.tsx`**

Inside the `<Stack>`, alongside the metadata declaration:

```tsx
                    <Stack.Screen
                      name="share/[fileId]"
                      options={{ presentation: 'pageSheet', animation: 'slide_from_bottom' }}
                    />
```

- [ ] **Step 2: Write a smoke test**

Write `app/share/[fileId].test.tsx`:

```tsx
import React from 'react'
import { Provider as PaperProvider } from 'react-native-paper'
import { render, screen } from '@testing-library/react-native'

jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ fileId: 'f1' })
}))

jest.mock('cozy-client', () => ({
  __esModule: true,
  useClient: () => null,
  useQuery: jest.fn().mockImplementation(() => ({
    data: { _id: 'f1', name: 'rapport.pdf', type: 'file' },
    fetchStatus: 'loaded'
  }))
}))

jest.mock('@/client/useFlag', () => ({ useFlag: () => true }))
jest.mock('@/network/useIsOnline', () => ({ useIsOnline: () => true }))
jest.mock('@/sharing/SharingProvider', () => ({
  useFileSharing: () => ({ loaded: true, entry: undefined }),
  useRefreshSharings: () => jest.fn()
}))
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }))

import ShareRoute from './[fileId]'

const wrap = (ui: React.ReactElement) => <PaperProvider>{ui}</PaperProvider>

describe('ShareRoute', () => {
  it('renders the file name', () => {
    render(wrap(<ShareRoute />))
    expect(screen.getByText('rapport.pdf')).toBeOnTheScreen()
  })
})
```

- [ ] **Step 3: Run to confirm failure**

Run: `npx jest app/share/`
Expected: FAIL — `Cannot find module './[fileId]'`.

- [ ] **Step 4: Implement `app/share/[fileId].tsx`**

The implementation is a port of `src/ui/ShareSheet.tsx`. Copy the entire body of `src/ui/ShareSheet.tsx` into `app/share/[fileId].tsx` and apply these transformations:

1. **Remove the `forwardRef` wrapping**. Replace:
   ```tsx
   export const ShareSheet = forwardRef<ShareSheetHandle>((_, ref) => {
     ...
     useImperativeHandle(ref, () => ({
       present: (f: ShareSheetFile) => { setFile(f); /* + bottomSheetRef.current?.expand() */ },
       dismiss: () => bottomSheetRef.current?.close()
     }))
     ...
   })
   ```
   with:
   ```tsx
   export default function ShareRoute() {
     const { fileId } = useLocalSearchParams<{ fileId: string }>()
     ...
   }
   ```

2. **Drop the gorhom imports** (`BottomSheet`, `BottomSheetView`) and the `bottomSheetRef`. Replace any `bottomSheetRef.current?.close()` calls with:
   ```tsx
   if (router.canGoBack()) router.back()
   ```

3. **Source the `file` from `useQuery(fileByIdQuery)`** instead of the `setFile`/`useImperativeHandle` flow:
   ```tsx
   import { fileByIdQuery, fileByIdQueryAs, FileQueryResult } from '@/client/queries'

   const fileLookup = useQuery(fileByIdQuery(fileId ?? ''), {
     as: fileByIdQueryAs(fileId ?? ''),
     enabled: !!fileId
   })
   const lookupData = fileLookup.data
   const fileFromQuery = (Array.isArray(lookupData) ? lookupData[0] : lookupData) as FileQueryResult | null | undefined
   const file: ShareSheetFile | null = fileFromQuery
     ? {
         _id: fileFromQuery._id,
         name: fileFromQuery.name,
         type: fileFromQuery.type,
         mime: fileFromQuery.mime,
         class: fileFromQuery.class,
         links: fileFromQuery.links
       }
     : null
   ```

4. **Replace the outer `<BottomSheet>` + `<BottomSheetView>`** with `<ScreenContainer>` + a `<ScrollView>`:
   ```tsx
   import { ScreenContainer } from '@/ui/ScreenContainer'
   import { LoadingState } from '@/ui/LoadingState'
   import { ErrorState } from '@/ui/ErrorState'

   if (fileLookup.fetchStatus === 'loading' && !file) {
     return <ScreenContainer><LoadingState /></ScreenContainer>
   }
   if (!file) {
     return (
       <ScreenContainer>
         <ErrorState message={t('drive.preview.loadFailed')} onRetry={() => fileLookup.fetch()} />
       </ScreenContainer>
     )
   }
   return (
     <ScreenContainer>
       <ScrollView contentContainerStyle={styles.container}>
         {/* all the existing rows: header, public link section, recipients, contact picker */}
       </ScrollView>
       <Snackbar ...>{snack ?? ''}</Snackbar>
     </ScreenContainer>
   )
   ```

5. **Delete the `ShareSheetHandle` interface** — it's no longer exported.

6. **Keep all internal logic** — `useFlag('sharing.generate-link-button.enabled')`, `useFileSharing`, `useRefreshSharings`, contact autocomplete, recipient list, snackbar — identical.

> The full file is large (~650 lines). Take the existing `ShareSheet.tsx` source, apply the six transformations above mechanically. Do NOT redesign the UX, do NOT extract sub-components — this is a 1:1 migration. If any prop signature drifts, the test from step 2 will catch it.

- [ ] **Step 5: Run test to confirm pass**

Run: `npx jest app/share/`
Expected: PASS — 1 test green.

- [ ] **Step 6: Run all tests + type check + lint**

Run: `npx jest && npx tsc --noEmit && npx eslint .`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add app/share/ app/_layout.tsx
git commit -m "$(cat <<'EOF'
feat(share): add /share/[fileId] modal route

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Migrate the 5 list screens to push `/share` (commit 7)

**Files:**
- Modify: `app/(drive)/files/[...path].tsx`
- Modify: `app/(drive)/recent.tsx`
- Modify: `app/(drive)/shared/[...path].tsx`
- Modify: `app/(drive)/shareddrives/[...path].tsx`
- (Note: `trash.tsx` has no ShareSheet — trash items aren't shareable.)

**Goal:** Replace `shareRef.current?.present(file)` with `router.push('/share/' + file._id)` in every list screen. Drop the `<ShareSheet>` render. The metadata route (already migrated) already does `router.replace('/share/' + fileId)` for its Share button — no change needed there.

**Pattern (apply to each file):**
1. Remove `useRef<ShareSheetHandle>(null)` and the `ShareSheet` + `ShareSheetHandle` imports.
2. Remove the `<ShareSheet ref={shareRef} />` JSX at the bottom.
3. In every callback that does `shareRef.current?.present({...})`, replace with `router.push('/share/' + entry._id)`.

- [ ] **Step 1: Update `app/(drive)/files/[...path].tsx`**

Drop the `ShareSheet` + `ShareSheetHandle` import + `useRef<ShareSheetHandle>(null)`.

In `renderItem` for folders (around line 246), replace:
```tsx
          onShare={
            selection.isSelecting
              ? undefined
              : folder => {
                  if (!requireOnline(isOnline, setSnackbar, t)) return
                  shareRef.current?.present({ _id: folder._id, name: folder.name, type: 'directory' })
                }
          }
```
with:
```tsx
          onShare={
            selection.isSelecting
              ? undefined
              : folder => {
                  if (!requireOnline(isOnline, setSnackbar, t)) return
                  router.push(`/share/${folder._id}`)
                }
          }
```

Same for files (around line 280):
```tsx
        onShare={
          selection.isSelecting
            ? undefined
            : file => {
                if (!requireOnline(isOnline, setSnackbar, t)) return
                router.push(`/share/${file._id}`)
              }
        }
```

Drop the `<ShareSheet ref={shareRef} />` JSX (around line 417).

- [ ] **Step 2: Update `app/(drive)/recent.tsx`**

Drop ShareSheet imports + ref. Replace the `onShare` callback in `renderItem`:
```tsx
      onShare={file => {
        if (!requireOnline(isOnline, setSnackbar, t)) return
        router.push(`/share/${file._id}`)
      }}
```
Drop `<ShareSheet ref={shareRef} />`.

- [ ] **Step 3: Update `app/(drive)/shared/[...path].tsx`**

Same pattern. Drop imports + ref + ShareSheet render. Replace the two `shareRef.current?.present(...)` call sites with `router.push('/share/' + ...)`.

- [ ] **Step 4: Update `app/(drive)/shareddrives/[...path].tsx`**

Same pattern.

- [ ] **Step 5: Run all tests + type check + lint**

Run: `npx jest && npx tsc --noEmit && npx eslint .`
Expected: all green.

> Lint may complain about unused `useRef` import if it was only used for the share ref — remove if so.

- [ ] **Step 6: Manual smoke**

```bash
npx expo run:ios
```
Open a file's metadata modal → tap Share → share modal **replaces** the metadata modal (no stacking visible — same animation, different content). Swipe down → returns to list.

From a folder row's 3-dot menu → Share → share modal opens directly.

- [ ] **Step 7: Commit**

```bash
git add app/'(drive)'/
git commit -m "$(cat <<'EOF'
refactor(drive): list screens push /share route instead of presenting sheet

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Remove the now-unused `ShareSheet` component (commit 8)

**Files:**
- Delete: `src/ui/ShareSheet.tsx`

- [ ] **Step 1: Verify no remaining import**

Run: `grep -rn "ShareSheet" src app | grep -v "src/ui/ShareSheet.tsx"`
Expected: no output.

- [ ] **Step 2: Delete the file**

```bash
git rm src/ui/ShareSheet.tsx
```

- [ ] **Step 3: Run all tests + type check + lint**

Run: `npx jest && npx tsc --noEmit && npx eslint .`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
chore(ui): remove unused ShareSheet component

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Remove `@gorhom/bottom-sheet` (commit 11)

**Files:**
- Modify: `app/_layout.tsx` (remove `BottomSheetModalProvider`)
- Modify: `package.json` (remove `@gorhom/bottom-sheet` dep)
- Modify: `yarn.lock` or `package-lock.json` (refreshed by the install)

**Goal:** After commit 8, gorhom has no consumers. Drop the provider and the dependency.

- [ ] **Step 1: Verify no remaining usage**

Run: `grep -rn "@gorhom/bottom-sheet" src app | grep -v "app/_layout.tsx"`
Expected: no output.

If any usage remains, fix it before proceeding.

- [ ] **Step 2: Remove the provider from `app/_layout.tsx`**

Delete the import:
```tsx
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet'
```

Remove the `<BottomSheetModalProvider>` wrap. Before:
```tsx
            <BottomSheetModalProvider>
              <PiPSessionProvider>
                <SharingProvider>
                  <ErrorBoundary>
                    <Stack ...>...</Stack>
                  </ErrorBoundary>
                </SharingProvider>
              </PiPSessionProvider>
            </BottomSheetModalProvider>
```

After:
```tsx
            <PiPSessionProvider>
              <SharingProvider>
                <ErrorBoundary>
                  <Stack ...>...</Stack>
                </ErrorBoundary>
              </SharingProvider>
            </PiPSessionProvider>
```

- [ ] **Step 3: Remove the dependency from `package.json`**

Open `package.json` and remove the line:
```json
    "@gorhom/bottom-sheet": "^5.2.13",
```

Then refresh the lockfile:
```bash
yarn install   # or npm install — check which is used by ls yarn.lock package-lock.json
```

- [ ] **Step 4: Verify the build still works**

Run: `npx tsc --noEmit && npx jest && npx eslint .`
Expected: all green.

Run a clean iOS build to verify the pods reinstall correctly:
```bash
cd ios && pod install && cd ..
npx expo run:ios
```
Expected: app launches, basic navigation works. No reference to gorhom anywhere in the bundle.

- [ ] **Step 5: Commit**

```bash
git add app/_layout.tsx package.json yarn.lock ios/
git commit -m "$(cat <<'EOF'
chore(deps): remove @gorhom/bottom-sheet

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Push and open PR 2**

```bash
git push -u origin refactor/sheets-to-routes
gh pr create --title "refactor(drive): migrate metadata + share sheets to pagesheet routes" --body "$(cat <<'EOF'
## Summary
- `FileMetadataSheet` becomes `app/metadata/[fileId].tsx` — page-sheet modal route
- `ShareSheet` becomes `app/share/[fileId].tsx` — page-sheet modal route
- 5 list screens push these routes instead of presenting sheets; add `useFocusEffect` for re-fetch on return
- `SharingProvider` hoisted from `(drive)/_layout.tsx` to root layout (the share route lives outside the drive tab stack)
- `@gorhom/bottom-sheet` dropped (no consumers left)

## Test plan
- [ ] Jest: `npx jest` green
- [ ] Tap file row → metadata modal opens via swipe-down dismissable page-sheet
- [ ] Tap Share inside metadata → share modal replaces metadata (no stacking)
- [ ] Tap Share on folder row 3-dot menu → share modal opens directly
- [ ] Rename / Delete from inside metadata → snackbar shown, list refreshes after close
- [ ] iOS pod install clean, no residual gorhom in bundle

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## PR 3 — `refactor/webview-screens-pagesheet` (commits 9-10)

> **Before starting PR 3**: make sure PR 2 is merged to `main`.
> ```bash
> git checkout main && git pull
> git checkout -b refactor/webview-screens-pagesheet
> ```

### Task 9: Move WebView screens to root stack as `pageSheet` (commit 9)

**Files:**
- Move (git mv):
  - `app/(drive)/onlyoffice/[fileId].tsx` → `app/onlyoffice/[fileId].tsx`
  - `app/(drive)/note/[fileId].tsx` → `app/note/[fileId].tsx`
  - `app/(drive)/docs/[fileId].tsx` → `app/docs/[fileId].tsx`
  - `app/(drive)/docs/new/[folderId].tsx` → `app/docs/new/[folderId].tsx`
- Modify: `app/_layout.tsx` (declare the 4 routes as pageSheet)
- Modify: `app/(drive)/_layout.tsx` (drop the 4 hidden `<Tabs.Screen>` entries)
- Modify: `src/files/openFromList.ts` (update paths)
- Modify: `app/metadata/[fileId].tsx` (update paths — already uses `/onlyoffice/`, `/note/`, `/docs/` as designed in task 3, so no change needed)
- Modify: `app/(drive)/files/[...path].tsx` (update `router.push('/(drive)/onlyoffice/' ...)` calls)

**Goal:** Reroute the 4 WebView screens from the drive tab stack to the root stack, presented as `pageSheet` modals. Keep their existing `<AppBar>` for this commit — chromeless removal is task 10.

- [ ] **Step 1: Move the files**

```bash
git mv app/'(drive)'/onlyoffice/'[fileId].tsx' app/onlyoffice/'[fileId].tsx'
git mv app/'(drive)'/note/'[fileId].tsx' app/note/'[fileId].tsx'
git mv app/'(drive)'/docs/'[fileId].tsx' app/docs/'[fileId].tsx'
git mv app/'(drive)'/docs/new/'[folderId].tsx' app/docs/new/'[folderId].tsx'
```

Then clean up the now-empty source dirs:
```bash
rmdir app/'(drive)'/onlyoffice app/'(drive)'/note app/'(drive)'/docs/new app/'(drive)'/docs 2>/dev/null || true
```

- [ ] **Step 2: Declare the 4 routes in `app/_layout.tsx`**

Inside the `<Stack>`, alongside the existing `metadata` and `share` declarations:

```tsx
                    <Stack.Screen
                      name="onlyoffice/[fileId]"
                      options={{ presentation: 'pageSheet', animation: 'slide_from_bottom' }}
                    />
                    <Stack.Screen
                      name="note/[fileId]"
                      options={{ presentation: 'pageSheet', animation: 'slide_from_bottom' }}
                    />
                    <Stack.Screen
                      name="docs/[fileId]"
                      options={{ presentation: 'pageSheet', animation: 'slide_from_bottom' }}
                    />
                    <Stack.Screen
                      name="docs/new/[folderId]"
                      options={{ presentation: 'pageSheet', animation: 'slide_from_bottom' }}
                    />
```

- [ ] **Step 3: Drop the 4 hidden `<Tabs.Screen>` in `app/(drive)/_layout.tsx`**

Delete these blocks:
```tsx
        <Tabs.Screen name="onlyoffice/[fileId]" options={{ href: null }} />
        <Tabs.Screen name="note/[fileId]" options={{ href: null }} />
        <Tabs.Screen name="docs/[fileId]" options={{ href: null }} />
        <Tabs.Screen name="docs/new/[folderId]" options={{ href: null }} />
```

- [ ] **Step 4: Update path references**

Open `src/files/openFromList.ts` and replace each instance:
- `/(drive)/note/` → `/note/`
- `/(drive)/docs/` → `/docs/`
- `/(drive)/onlyoffice/` → `/onlyoffice/`

The function should now use the root-level paths exclusively.

Open `app/(drive)/files/[...path].tsx`. Find every `router.push('/(drive)/...')` for the 4 WebView paths and strip the `/(drive)` prefix:
- `/(drive)/onlyoffice/${created._id}` → `/onlyoffice/${created._id}`
- `/(drive)/note/${created._id}` → `/note/${created._id}`
- `/(drive)/docs/new/${currentDirId}` → `/docs/new/${currentDirId}`

> Search globally to catch all remaining call sites:
> ```bash
> grep -rn "'/(drive)/onlyoffice\|'/(drive)/note\|'/(drive)/docs" app src
> ```

- [ ] **Step 5: Verify `app/metadata/[fileId].tsx` paths**

The metadata route was already authored in task 3 with the new (root-level) paths `/onlyoffice/`, `/note/`, `/docs/`. Open it and confirm no `/(drive)` prefix exists:
```bash
grep -n "(drive)" app/metadata/'[fileId].tsx'
```
Expected: no output. If there is any, strip the prefix.

- [ ] **Step 6: Run all tests + type check + lint**

Run: `npx jest && npx tsc --noEmit && npx eslint .`
Expected: all green.

- [ ] **Step 7: Manual smoke**

```bash
npx expo run:ios
```
- Tap an OnlyOffice file → modal pageSheet opens with the existing OnlyOffice AppBar visible (chromeless removal is task 10). Editor loads. Swipe down → returns to list.
- Tap a Cozy Note → same modal behavior.
- Tap "Create note" from the FAB → docs/new route opens as modal.

- [ ] **Step 8: Commit**

```bash
git add app/_layout.tsx app/'(drive)'/_layout.tsx app/onlyoffice app/note app/docs src/files/openFromList.ts app/'(drive)'/files
git commit -m "$(cat <<'EOF'
refactor(routing): move WebView screens to root stack as pageSheet

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Make WebView screens chromeless (commit 10)

**Files:**
- Modify: `app/onlyoffice/[fileId].tsx`
- Modify: `app/note/[fileId].tsx`
- Modify: `app/docs/[fileId].tsx`
- Modify: `app/docs/new/[folderId].tsx`

**Goal:** Drop the `<AppBar>` inside each WebView screen. The iOS page-sheet grabber handles dismissal; each editor (OnlyOffice / Notes / Docs) shows the doc name inside the WebView itself.

- [ ] **Step 1: Remove `<AppBar>` from `app/onlyoffice/[fileId].tsx`**

Drop the import:
```tsx
import { AppBar } from '@/ui/AppBar'
```

Find the `<AppBar title={...} onBack={() => router.back()} />` JSX inside the `<ScreenContainer>` and delete the entire `<AppBar ... />` line.

If `useRouter` was only used for `router.back()` via the AppBar, the import becomes unused — remove it. Same for `useTranslation` if it was only providing `t('drive.onlyoffice.title')`.

> Re-check: the route's `useEffect` may still log via `console.log(...)`; lint may or may not warn. Leave existing console calls.

- [ ] **Step 2: Repeat for `app/note/[fileId].tsx`**

Same removal.

- [ ] **Step 3: Repeat for `app/docs/[fileId].tsx`**

Same removal.

- [ ] **Step 4: Repeat for `app/docs/new/[folderId].tsx`**

Same removal. (This route may currently use a different structure — apply the same chromeless approach: no `<AppBar>`, WebView fills the modal.)

- [ ] **Step 5: Run all tests + type check + lint**

Run: `npx jest && npx tsc --noEmit && npx eslint .`
Expected: all green.

- [ ] **Step 6: Manual smoke**

```bash
npx expo run:ios
```
- OnlyOffice file → modal opens, no native AppBar at top, editor fills the sheet. Swipe down dismisses.
- Same for note + docs + docs/new.

- [ ] **Step 7: Commit**

```bash
git add app/onlyoffice app/note app/docs
git commit -m "$(cat <<'EOF'
refactor(viewer): chromeless onlyoffice/note/docs screens

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Push and open PR 3**

```bash
git push -u origin refactor/webview-screens-pagesheet
gh pr create --title "refactor(viewer): webview screens as chromeless pagesheet modals" --body "$(cat <<'EOF'
## Summary
- Moves `onlyoffice/[fileId]`, `note/[fileId]`, `docs/[fileId]`, `docs/new/[folderId]` from the drive tab stack to the root stack
- Declares the 4 routes as `presentation: 'pageSheet'` modals
- Strips the internal `<AppBar>` from each — the page-sheet grabber handles dismissal; each editor has its own header inside the WebView
- Updates `openFromList.ts` + caller `router.push` paths

## Test plan
- [ ] Jest: `npx jest` green
- [ ] OnlyOffice / Note / Docs / DocsNew open as chromeless page-sheet modals on iOS
- [ ] Swipe-down dismisses each correctly
- [ ] Editor content fills the modal (no wasted 56px AppBar slot)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Final verification (after all 3 PRs merged)

- [ ] **Step 1: Pull main and confirm clean tree**

```bash
git checkout main && git pull
git status
```
Expected: working tree clean, on main.

- [ ] **Step 2: Run the full check**

```bash
npx tsc --noEmit && npx eslint . && npx jest
```
Expected: all green.

- [ ] **Step 3: iOS device smoke**

Build to a physical iOS device (PiP needs the real device):
```bash
npx expo run:ios --device
```

Run through the full done-criteria list from the spec:
- [ ] `@gorhom/bottom-sheet` not in `package.json`, not in `app/_layout.tsx`.
- [ ] Tap file → metadata page-sheet → swipe down dismisses.
- [ ] Inside metadata, tap Share → share modal replaces metadata.
- [ ] Rename / Delete from metadata → mutates + snackbar + closes + list refreshed on focus return.
- [ ] OnlyOffice / Notes / Docs / DocsNew open as chromeless page-sheet modals.
- [ ] Video file → tap PiP → modal dismisses, PiP detaches at OS level, drive browsable.
- [ ] Tap PiP restore → preview re-opens with video continuing.
- [ ] Tap PiP close → playback stops, no modal reopens.

- [ ] **Step 4: Android smoke**

```bash
npx expo run:android
```
Same checks minus PiP (Android PiP unchanged by this refactor).

---

## Notes for the implementer

- **DRY** — task 4 and task 7 follow the exact same per-file pattern across 5 screens. Take a single file, get it right, then mechanically apply to the others. Don't invent variations per screen.
- **YAGNI** — the share route is a 1:1 migration. Resist the urge to extract sub-components, redesign the UX, or unify with the metadata route. That belongs to a follow-up TODO if needed.
- **TDD** — for `PiPSession`, `VideoPreview`, `MetadataRoute`, `ShareRoute`, write the test before the implementation. The tests are the design check.
- **Frequent commits** — 11 atomic commits, each one independently makes the app green. Do not bundle two commits.
- **iOS PiP is unverifiable in tests** — the JS heuristic is tested, but the actual detach behavior requires a physical iOS device. Treat the manual smoke gate at the end of task 2 as a real go/no-go.

# Mobile UI and Start Flow Design

## Goal

Polish the Android mobile UI and add the P08 start-flow screens that can be exercised in Expo Go, without claiming native recording readiness or changing P09 native recording behavior.

## Scope

In scope:

- Login, loading, authentication error, and logout states.
- Authenticated home screen with Record/Translate selection.
- Meeting setup screen with title, language, and readiness summary.
- Microphone permission/readiness screen.
- Recording-state placeholder screen backed by existing recording contracts, with native capture disabled until P09 verification.
- Safe-area, spacing, typography, contrast, small-screen layout, and accessibility polish.
- Unit/UI tests for each state and transition.

Out of scope:

- Native microphone implementation or P09 qualification.
- Real audio capture, upload, speech provider, or meeting content.
- iOS-specific UI work.
- Backend API redesign.

## User flow

```text
AuthScreen → HomeScreen → MeetingSetupScreen → PermissionScreen → RecordingScreen
     ↑             ↓              ↓                    ↓
   logout      logout         back/cancel          denied/error
```

The authenticated session remains owned by the existing Auth0 PKCE client. Logout clears the client session and secure refresh token, then returns to `AuthScreen`.

## Component boundaries

- `AppShell`: owns top-level layout, session state, and screen selection; it does not contain detailed screen markup.
- `AuthScreen`: login button, loading state, error message, and logout entry when applicable.
- `HomeScreen`: meeting mode selection, readiness banner, and start CTA.
- `MeetingSetupScreen`: local form state only; validates required title and selected mode before continuing.
- `PermissionScreen`: displays microphone permission/readiness state and explicit next action. It must not claim permission is granted unless the platform reports it.
- `RecordingScreen`: renders `idle`, `starting`, `recording`, `paused`, `ending`, and `blocked` states from existing contracts; it does not invoke a fake native provider.
- Shared style constants: colors, spacing, radii, typography, and button variants should be centralized within the mobile UI area.

## State and data rules

- Auth0 remains the only real authentication provider.
- UI preview states may use deterministic local state, but must be visibly labelled when native capture or backend readiness is unavailable.
- No meeting content, fake device result, fake provider response, or fake recording success may be emitted.
- The Start action remains disabled when native capture readiness is unavailable.
- Errors are user-readable and preserve a technical detail only where useful for debugging.
- All interactive controls expose an accessibility role, label, and disabled state.

## Visual behavior

- Every root screen uses `flex: 1` and safe-area-aware padding.
- Content must remain usable at Android small-screen dimensions and larger font scale.
- Primary controls have at least a 48dp touch target.
- Text and controls must have sufficient contrast against the cream and green surfaces.
- The branded header must not be clipped by the status bar or system overlays.
- Loading and error states must reserve layout space so the screen does not jump.

## Testing and acceptance

- UI tests cover auth loading/error/success/logout, home mode selection, setup validation, permission denied/readiness, and recording blocked states.
- Existing Auth0 PKCE/deep-link tests remain passing.
- `git diff --check` is clean.
- Mobile unit tests and typecheck are run; any dependency/environment failure is reported without claiming a pass.
- Expo Go smoke test confirms the login → home → setup → readiness path. This is UI smoke evidence only and does not verify P09.
- P09 remains `IMPLEMENTED`, not `VERIFIED`, until native Android qualification evidence exists.

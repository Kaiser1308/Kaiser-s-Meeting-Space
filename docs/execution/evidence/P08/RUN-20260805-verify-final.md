# P08 verification continuation — 2026-08-05

## Scope

Supported Android device only: `CPH2699`, Android 16/API 36, device serial
`fd12a6a7`. The arm64 release APK was built and installed after the root
Metro/Gradle/pnpm layout fixes. P08 remains fake-starter-only; no audio,
upload, speech, translation, or provider behavior was invoked.

## Direct device evidence

- Android Settings UI revoked `RECORD_AUDIO`; the app then displayed the P08
  microphone permission screen. The Android permission dialog was observed and
  denied with `Không cho phép`. Settings UI restored `Chỉ cho phép khi dùng
ứng dụng`, and the flow reached readiness.
- Readiness exposed `Fake CaptureStarter P08 đã sẵn sàng` and the explicit
  no-audio boundary.
- With airplane mode state set to `1` for the bounded check, the readiness
  hierarchy exposed `Xử lý đám mây có thể bị trì hoãn hoặc không khả dụng.` and
  `Ghi âm cục bộ vẫn khả dụng.`. Airplane mode was restored to `0`.
- Enabling cloud processing exposed the unconfigured provider, exact scope
  `chỉ âm thanh và bản ghi của cuộc họp này`, and a checked-state consent
  control. Before consent, Start was `enabled=false`; after consent, Start
  became enabled and accepted the fake preview without opening recording.
- TalkBack was enabled and `dumpsys accessibility` showed the focused
  application window titled `Kaiser's Meeting Space`; the UI hierarchy exposed
  labeled Button/EditText/CheckBox controls. Accessibility focus traversed the
  cloud checkbox and Start button with Tab, and Enter activated consent and the
  fake Start preview; the resulting checked/enabled states and no-audio preview
  boundary were observed.
- On the new APK, denying the Android microphone dialog left the app on
  `permission-screen` with `permission-denied-error` rendered in Vietnamese;
  Settings then restored foreground microphone access and the flow returned to
  readiness.
- The four locale/language combinations were directly observed in the Android
  hierarchy: vi/vi, vi/en, en/vi, and en/en. The shell locale (`app-shell`
  content description) changed independently from the selected meeting-language
  button.

## Automated evidence

- Mobile tests: 41 files / 243 tests passed.
- Mobile TypeScript typecheck passed.
- The first production bundle exposed a Metro resolver failure for the domain
  package's explicit `.js` TypeScript specifiers. The root fix was added to
  `apps/mobile/metro.config.js`; the subsequent arm64 Android release build
  passed and the new APK installed successfully.

## Lifecycle decision

P08 stays **IMPLEMENTED**, not VERIFIED until the independent review is
complete. The current Android run has direct evidence for A04-01 through
A04-12 on the new APK; the remaining gate is explicit in
`physical-accessibility-matrix.md`: complete TalkBack traversal, physical
focus/touch closure, and independent review.

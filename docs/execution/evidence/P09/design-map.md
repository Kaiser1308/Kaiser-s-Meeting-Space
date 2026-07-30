# P09 Design / Boundary Map

Architecture analysis for P09 mobile microphone recording. See RUN-20260725-2150.md for full task context and RUN record.

Key decisions:

- `packages/mobile-audio/` holds shared TS native module contract + deterministic fake
- `apps/mobile/modules/audio-recorder/` holds Expo native module (Android Kotlin, iOS Swift)
- `apps/mobile/src/features/recording/` holds JS-side lifecycle reducer/service/controls/health
- Native module contract uses versioned, correlation-ID-tracked command/event protocol
- End handshake: stop → drain → atomicWrite → checksum → manifest → local-safe (no early ack)
- P07 adapters: AndroidFileSystem (Context.getFilesDir), IOSFileSystem (NSDocumentDirectory)

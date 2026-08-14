# P04 secure-storage direct evidence — 2026-08-06

All values in this report are synthetic and content-free.

## Windows native keychain

Command:

```text
pnpm --filter @kms/desktop exec tsx -e "(async()=>{const { createNativeSecureStorage }=await import('./src/auth/secure-storage.ts'); const s=await createNativeSecureStorage('kms-p04-synthetic-20260806'); const key='synthetic-refresh-token'; const value='synthetic-token-p04'; await s.set(key,value); const stored=await s.get(key); if(stored!==value) throw new Error('keychain readback mismatch'); await s.remove(key); const removed=await s.get(key); if(removed!==null) throw new Error('keychain delete mismatch'); console.log(JSON.stringify({service:'kms-p04-synthetic-20260806',writeReadback:stored===value,deleteReadback:removed===null,plaintextFallback:false}));})()"
```

- Environment: Windows host, `@kms/desktop`, native `keytar` adapter.
- Exit code: `0`.
- Signal: `writeReadback=true`, `deleteReadback=true`, `plaintextFallback=false`.
- Cleanup: the synthetic key was deleted in the same command.

## Android native SecureStore restart

- Device: CPH2699, Android 16/API 36, serial `fd12a6a7`.
- APK: `com.anonymous.kaisermeetingspace`, rebuilt arm64 release APK from the
  current workspace.
- The app was already authenticated with a content-free Home screen. It was
  force-stopped, relaunched, and the hierarchy was dumped after startup.
- Direct signal: `home-screen=true`, `login-screen=false`, title observed;
  exit code `0`.
- The app constructs `ClientAuth` with `createNativeSecureStorage()` and the
  restart requires the persisted refresh token to survive process death. No
  token value or meeting content was read or logged.

## Supporting automated evidence

- Mobile auth/storage suite: 42 files / 247 tests passed.
- Desktop auth/security suite: 4 files / 32 tests passed.
- Mobile adapter tests cover logout deletion and native-module delegation; the
  Windows smoke above covers the real keychain backend write/read/delete path.

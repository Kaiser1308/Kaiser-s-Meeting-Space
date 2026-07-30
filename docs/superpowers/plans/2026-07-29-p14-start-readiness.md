# P14 Start Readiness Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa P10 và P13 về `VERIFIED`, chuẩn bị đủ môi trường/evidence, rồi mở P14 theo đúng execution protocol.

**Architecture:** Đóng các gate phụ thuộc trước, không làm trước scope P14. Sau khi P06/P10/P13 đều `VERIFIED`, thực hiện preflight P14, khóa runtime checklist và chỉ khi preflight đạt mới chuyển P14 sang `IN_PROGRESS`.

**Tech Stack:** Node.js 24.18.0, pnpm 10.14.0, TypeScript 5.9.3, Vitest 4.1.10, Rust 1.97.1, Windows 11 Pro 10.0.26200, PostgreSQL/object storage/jobs, Android 12+/iOS 17+, Deepgram server secret storage.

## Global Constraints

- Không dùng mock để thay cho gate thiết bị, provider, model, storage hoặc Windows qualification thật.
- Chỉ dùng audio synthetic hoặc đã được consent; không đưa meeting content vào log/evidence.
- Không chuyển `IMPLEMENTED` thành `VERIFIED` nếu thiếu binary/manual evidence trực tiếp.
- P14 không bao gồm translation, transcript editing, minutes, source mutation/deletion hoặc mobile local/live STT.
- Trước mỗi lần sửa symbol phải chạy GitNexus impact analysis; trước commit phải chạy `detect_changes()`.

---

### Task 1: Chốt preflight và môi trường owner

**Files:**
- Read: `docs/execution/EXECUTION_PROTOCOL.md`
- Read: `docs/execution/PROGRESS.md`
- Read: `docs/execution/phases/P14-finalization-backfill.md`
- Read: `docs/execution/evidence/P06/EVIDENCE.md`, `docs/execution/evidence/P10/EVIDENCE.md`, `docs/execution/evidence/P13/EVIDENCE.md`
- Create later: `docs/execution/evidence/P14/RUN-YYYYMMDD-HHMM.md`

- [ ] Xác nhận Git state, tool versions, dependency ledger và mọi dirty file trước khi chạy gate.
- [ ] Owner cung cấp/duyệt server-side Deepgram key trong secret storage; không dùng exposed key hay ghi key vào repo.
- [ ] Chuẩn bị Deepgram live vi/en account, approved provider/region/scope policy.
- [ ] Chuẩn bị minimum Windows hardware, Android 12+/iOS 17+ devices, Docker/PostgreSQL/object storage/jobs.
- [ ] Chuẩn bị frozen synthetic/consented vi/en audio, gồm manifest hai giờ và expected ranges/hashes.

### Task 2: Đóng P10 để đạt VERIFIED

**Files:**
- Read/Modify only within P10 ownership after impact analysis: mobile sync/recovery implementation and tests.
- Evidence: `docs/execution/evidence/P10/EVIDENCE.md`, new P10 run evidence.

- [ ] Chạy physical Android/iOS sync, recovery, interruption, offline/online and security matrix for P10-A06/T07.
- [ ] Nếu fail, debug root cause bằng narrow test/device reproduction, sửa đúng P10 scope và rerun.
- [ ] Ghi command, device/OS, duration, test counts, artifact và recovery result.
- [ ] Chỉ cập nhật P10 thành `VERIFIED` khi mọi P10 acceptance ID có evidence trực tiếp.

### Task 3: Đóng P13 external gates để đạt VERIFIED

**Files:**
- Read/Modify only within P13 ownership after impact analysis: speech evaluation/native qualification tooling if required.
- Evidence: `docs/execution/evidence/P13/EVIDENCE.md` and new P13 run evidence.

- [ ] Chạy Deepgram live vi/en với server-side key và xác nhận provider failure không ảnh hưởng recording.
- [ ] Chạy frozen-corpus WER, timestamp, RTF/RtF và resource thresholds trên minimum Windows hardware.
- [ ] Hoàn tất native Rust test executable/link qualification và full Windows local-file IPC gate.
- [ ] Nếu fail, sửa root cause trong P13 scope rồi chạy lại narrow test và complete P13 gate.
- [ ] Chỉ cập nhật P13 thành `VERIFIED` khi P13-A03/A04/A05/A06 có đủ evidence, không chỉ contract/mock evidence.

### Task 4: Mở P14 đúng protocol

**Files:**
- Read: `docs/execution/MASTER_PLAN.md`, PRD/flows/data model/provider contract/ADR-001/002/003, P05/P06/P07/P10/P13 evidence, Test Strategy scenarios 5/8/9.
- Create: `docs/execution/evidence/P14/RUN-YYYYMMDD-HHMM.md`
- Modify only after preflight passes: `docs/execution/PROGRESS.md`

- [ ] Xác nhận P06, P10, P13 đều `VERIFIED`; nếu còn phase `IMPLEMENTED`, dừng và ghi blocker.
- [ ] Xác nhận real storage/jobs, Windows local-file, authorized cloud transcription và two-hour fixtures sẵn sàng.
- [ ] Chuyển nguyên task IDs P14-T01..P14-T08 thành runtime checklist, kèm narrow tests và evidence destinations.
- [ ] Tạo RUN record và chỉ chuyển P14 sang `IN_PROGRESS` sau khi toàn bộ preflight đạt.
- [ ] Không bắt đầu P15/P28 trong cùng conversation.

### Task 5: Thực thi P14 sau khi đã mở phase

**Files:**
- P14 ownership map trong `docs/execution/phases/P14-finalization-backfill.md`
- Evidence: `docs/execution/evidence/P14/`

- [ ] Thực thi tuần tự T01→T02→T03→T04→T05→T06→T07→T08; review độc lập giữa các package.
- [ ] Chạy từng narrow test sau mỗi task, debug failure đến root cause, rồi chạy complete P14 gate `pnpm verify`.
- [ ] Chạy real storage/provider/device/two-hour matrix; không thay bằng mock.
- [ ] Map P14-A01..A06 vào evidence, cập nhật TRACEABILITY/STATUS/PROGRESS chỉ sau direct verification.
- [ ] Kết thúc bằng handoff; phase chỉ là `VERIFIED` khi mọi binary gate có evidence, nếu không thì `IMPLEMENTED` hoặc `BLOCKED` đúng sự thật.

## Readiness decision

Hiện tại chỉ có P06 đạt gate. P10 và P13 đang `IMPLEMENTED`, nên Task 4 chưa được phép bắt đầu; thứ tự đúng là Task 1 → Task 2 và Task 3 → Task 4 → Task 5.

## Self-review

- P14-A01..A06 được bao phủ bởi P14-T01..T08 và integrated gate.
- Không có task nào mở rộng sang P15/P16/P17/P28.
- Các blocker hiện tại đều có owner action và acceptance signal cụ thể.

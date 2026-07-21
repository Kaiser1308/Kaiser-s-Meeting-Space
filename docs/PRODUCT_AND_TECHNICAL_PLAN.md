# Kaiser’s Meeting Space — Product & Technical Plan

> **Document status: Superseded source draft.** The maintained documentation is indexed in [Documentation Hub](README.md). Keep this file only as the original consolidated planning record; update the focused documents instead.

**Trạng thái:** Draft để duyệt trước khi tiếp tục triển khai  
**Định hướng:** Mobile + desktop, người dùng cá nhân, Việt/Anh, bảo toàn dữ liệu cuộc họp

## 1. Mục tiêu sản phẩm

Kaiser’s Meeting Space giúp một người ghi lại cuộc họp trực tiếp hoặc online, tạo transcript đầy đủ, dịch realtime khi được yêu cầu, và tạo biên bản chi tiết có thể truy ngược đến audio/transcript gốc.

Nguyên tắc bắt buộc:

1. Audio gốc là nguồn bằng chứng cao nhất và không bị AI ghi đè.
2. Transcript gốc được lưu đầy đủ theo thứ tự, người nói và timestamp.
3. Bản dịch, transcript đã sửa và biên bản là dữ liệu dẫn xuất, có version riêng.
4. Biên bản chi tiết là mặc định; tóm tắt chỉ được tạo khi người dùng chủ động chọn.
5. AI không được tự bỏ nội dung hoặc biến suy luận thành sự thật.
6. Có thể thay nhà cung cấp speech AI và generative AI mà không đổi luồng nghiệp vụ.

## 2. Phạm vi sản phẩm

### 2.1 Nền tảng

- Mobile app: iOS và Android, ưu tiên ghi họp trực tiếp bằng microphone.
- Desktop app: Windows trước, hỗ trợ microphone và âm thanh hệ thống cho Zoom, Meet, Teams hoặc ứng dụng khác.
- macOS được triển khai sau khi luồng Windows ổn định vì cơ chế cấp quyền/thu system audio khác nhau.
- Backend dùng chung để đồng bộ cuộc họp giữa mobile và desktop.

### 2.2 Người dùng v1

- Một tài khoản cá nhân quản lý dữ liệu của chính mình.
- Có thể export và chia sẻ file.
- Chưa có workspace team, đồng chỉnh sửa realtime, phân quyền doanh nghiệp hoặc audit quản trị.

### 2.3 Ngôn ngữ

- Trước mỗi cuộc họp bắt buộc chọn `Tiếng Việt` hoặc `English`.
- Speech engine được khóa theo ngôn ngữ đã chọn trong toàn bộ phiên họp.
- v1 không tự nhận diện cuộc họp mixed-language.
- Nếu người nói chuyển sang ngôn ngữ khác, transcript có thể giảm chính xác; người dùng được cảnh báo trước khi Start.
- Chế độ dịch realtime dịch sang ngôn ngữ còn lại: Việt → Anh hoặc Anh → Việt.

## 3. Luồng trải nghiệm hoàn chỉnh

### 3.1 Chuẩn bị cuộc họp

Màn hình `New meeting` thực hiện đúng thứ tự:

1. Nhập tên cuộc họp (không bắt buộc; mặc định theo ngày giờ).
2. Chọn ngôn ngữ cuộc họp: `Tiếng Việt` hoặc `English`.
3. Chọn chế độ:
   - `Chỉ họp`: ghi âm và tạo transcript; không hiển thị bản dịch realtime.
   - `Họp + dịch`: ghi âm, transcript và bản dịch realtime sang ngôn ngữ còn lại.
4. Chọn nguồn âm:
   - Mobile: microphone.
   - Desktop: microphone, system audio hoặc cả hai.
5. Chọn speech processing:
   - `API`: ưu tiên Deepgram, có realtime transcript và speaker diarization.
   - `Local`: ưu tiên Whisper; diarization là best-effort và không cam kết trong v1.
6. Chạy kiểm tra quyền microphone/system audio, dung lượng trống và kết nối.
7. Hiển thị thông báo nhắc người dùng phải có sự đồng ý ghi âm phù hợp pháp luật/nội quy.
8. Nút `Start meeting` chỉ được bật khi ngôn ngữ, chế độ và nguồn âm hợp lệ.

Ứng dụng nhớ lựa chọn gần nhất nhưng vẫn buộc người dùng xác nhận ngôn ngữ trước mỗi lần Start.

### 3.2 Trong cuộc họp

Hiển thị:

- Trạng thái `Recording`, thời lượng và chất lượng tín hiệu từng nguồn âm.
- Transcript theo thời gian thực với speaker label và timestamp.
- Bản dịch nằm cạnh/bên dưới transcript gốc khi dùng chế độ dịch.
- Cảnh báo mất mạng, provider lỗi, âm lượng quá thấp hoặc gần hết dung lượng.
- Nút đánh dấu một thời điểm quan trọng.
- `Pause`, `Resume` và `End` là các hành động chính.

Quy tắc:

- `Pause` dừng ghi audio và gửi speech; không kết thúc meeting.
- Mỗi lần Resume tạo một audio chunk mới nhưng vẫn thuộc cùng meeting.
- Khoảng pause được hiển thị trên timeline, không bị hiểu là audio bị mất.
- Audio được ghi xuống local theo chunk ngắn trước khi upload để giảm mất dữ liệu khi crash/mất mạng.
- Nếu API realtime lỗi, recording local vẫn tiếp tục; transcript được backfill sau từ audio.
- Transcript interim chỉ dùng hiển thị; chỉ transcript final mới được lưu thành bản gốc.
- Người dùng không chỉnh transcript trong khi recording để tránh xung đột; có thể đổi speaker label sau cuộc họp.

### 3.3 Kết thúc cuộc họp

Khi bấm `End`:

1. Hiển thị xác nhận để tránh chạm nhầm.
2. Dừng tất cả nguồn âm và đóng audio chunk hiện tại.
3. Tính checksum, lưu metadata và xác nhận local recording an toàn.
4. Upload các chunk còn thiếu trong nền.
5. Hoàn thiện transcript từ các đoạn realtime; backfill đoạn lỗi/mất mạng.
6. Chạy speaker diarization nếu provider hỗ trợ.
7. Cho phép đặt tên Speaker 1, Speaker 2… và sửa transcript bằng revision, không sửa bản gốc.
8. Hỏi `Tạo biên bản ngay?`:
   - `Có`: chuyển sang chọn mẫu.
   - `Để sau`: lưu meeting đầy đủ vào Library và có thể tạo biên bản bất kỳ lúc nào.

Không tạo biên bản nếu audio/transcript chưa hoàn tất mà không cảnh báo. Người dùng có thể chọn tạo bản nháp từ phần dữ liệu hiện có; bản đó phải mang nhãn `Chưa đầy đủ`.

### 3.4 Chọn và tạo biên bản

Các mẫu mặc định:

- Họp team.
- Họp 1–1.
- Họp với cấp dưới.
- Họp với lãnh đạo.
- Họp định kỳ/follow-up.

Tất cả mẫu đều giữ phần thảo luận đầy đủ. Mẫu chỉ thay đổi cấu trúc trình bày và các trường nhấn mạnh, không thay đổi dữ liệu nguồn.

Biên bản đầy đủ gồm:

- Thông tin cuộc họp, thời gian, thời lượng và người tham dự.
- Nội dung thảo luận theo chủ đề và theo đúng trình tự hợp lý.
- Quan điểm/ý kiến của từng người khi xác định được.
- Phương án được đề xuất.
- Điểm đồng thuận và điểm chưa thống nhất.
- Quyết định chính thức.
- Action items, người phụ trách, deadline và trạng thái cần xác nhận.
- Rủi ro, câu hỏi mở và nội dung cần follow-up.
- Citation về `segmentId`, speaker và khoảng timestamp cho từng nội dung quan trọng.

AI phải đánh dấu `Cần xác nhận` khi owner, deadline, quyết định hoặc speaker không đủ rõ.

### 3.5 Chỉnh sửa biên bản

Editor desktop là trải nghiệm chính; mobile hỗ trợ sửa nội dung cơ bản.

- Chỉnh văn bản, heading, bảng, checklist và thứ tự section.
- Thêm/xóa/đổi tên section.
- Chèn logo, header/footer, màu thương hiệu, font, cỡ giấy và đánh số trang.
- Bật/tắt từng khối khi export.
- Mở citation để phát đúng đoạn audio và highlight transcript liên quan.
- AI rewrite chỉ áp dụng cho section được chọn, hiển thị diff trước khi chấp nhận.
- Mỗi lần AI generate/regenerate hoặc người dùng lưu tạo một version.
- Có thể phục hồi version cũ.

### 3.6 Library và export

Mỗi meeting package gồm:

- Audio chunks gốc và metadata/checksum.
- Transcript gốc.
- Transcript revisions.
- Bản dịch realtime/final.
- Speaker mapping.
- Markers.
- Một hoặc nhiều phiên bản biên bản.
- Thông tin provider/model đã tạo từng artifact.

Export:

- DOCX: tài liệu có thể chỉnh sửa.
- PDF: bố cục cố định, font nhúng khi cần.
- Markdown: nội dung và citation dạng link/timestamp.
- TXT: transcript hoặc nội dung thuần.
- JSON: meeting package có cấu trúc để backup/integrate.
- Audio: file gốc hoặc file ghép, không thay đổi nội dung.

## 4. Kiến trúc hệ thống

### 4.1 Monorepo

- `apps/mobile`: Expo React Native.
- `apps/desktop`: Electron + React; native capture module cho system audio.
- `apps/api`: TypeScript API và background workers.
- `packages/domain`: types, validation và state machine dùng chung.
- `packages/ai`: generative AI provider contracts, routing và output validation.
- `packages/speech`: speech provider contracts cho Deepgram/local Whisper.
- `packages/export`: render DOCX, PDF, Markdown, TXT và JSON.
- `packages/ui`: design tokens và component dùng chung khi phù hợp.

### 4.2 Backend và lưu trữ

- PostgreSQL lưu metadata, transcript segments, revisions, minutes và jobs.
- Object storage tương thích S3 lưu audio, logo và file export.
- Background job queue xử lý upload finalize, backfill transcript, translation, minutes và export.
- WebSocket/SSE chuyển transcript, translation và trạng thái job realtime tới client.
- Client dùng local database/queue để giữ trạng thái khi offline và đồng bộ lại.

### 4.3 Speech provider abstraction

Contract chính:

- `startSession(language, diarization, translation?)`
- `pushAudio(chunk)`
- `pause()` / `resume()`
- `finalize()`
- events: interim transcript, final transcript, speaker update, provider error.
- `transcribeFile(audio, language)` để backfill hoặc xử lý sau cuộc họp.

Providers:

- Deepgram: provider API mặc định; realtime transcript và diarization.
- Local Whisper: offline/file transcription; diarization không bắt buộc v1.
- Provider khác được thêm bằng adapter, không chạm meeting workflow.

### 4.4 Generative AI provider abstraction

Generative AI không được gọi trực tiếp từ mobile/desktop. Backend dùng provider registry gồm:

- OpenAI-compatible endpoints.
- OpenAI trực tiếp.
- Anthropic.
- Google Gemini.
- Azure OpenAI.
- Local model qua Ollama hoặc endpoint tương thích.

Contract chung:

- `generateDetailedMinutes(input, schema)`
- `rewriteSection(input, instruction, schema)`
- `extractActionItems(input, schema)`
- `healthcheck()` và capability metadata.

Router chọn provider theo cấu hình người dùng, tác vụ, ngôn ngữ và tình trạng provider. Nếu bật fallback, kết quả từ provider dự phòng tạo version mới; tuyệt đối không ghép âm thầm hai kết quả.

Mọi output phải qua schema validation. Citation phải tham chiếu segment tồn tại và timestamp hợp lệ. Output sai schema được retry giới hạn; nếu vẫn sai, job thất bại rõ ràng và transcript không bị ảnh hưởng.

### 4.5 Ranh giới dữ liệu bất biến

- Audio asset sau khi finalize không được update nội dung; thay đổi tạo asset/version mới.
- Transcript final từ speech provider được lưu immutable.
- Sửa text tạo `TranscriptRevision` trỏ về segment gốc.
- Biên bản lưu provider, model, prompt version, transcript revision set và thời điểm tạo.
- Xóa meeting là thao tác có xác nhận, soft-delete trước; chính sách xóa vĩnh viễn được cấu hình riêng.

## 5. Mô hình dữ liệu cốt lõi

- `User`: tài khoản và preference.
- `Meeting`: title, language, mode, status, timestamps và processing choice.
- `Participant`: tên hiển thị và liên kết speaker labels trong meeting.
- `AudioAsset`: source, chunk index, duration, storage key, checksum và upload status.
- `TranscriptSegment`: sequence, speaker, text, language, timestamps, confidence và provider.
- `TranscriptRevision`: original segment, revised text, actor, reason và timestamp.
- `TranslationSegment`: source segment, translated text, language, provider và status.
- `Marker`: timestamp, label và note.
- `MinutesDocument`: template, detail level, provider/model, status và version.
- `MinutesSection`: heading, content, order, style và evidence refs.
- `ActionItem`: description, owner, deadline, status và evidence refs.
- `BrandPreset`: logo, colors, typography, header/footer và page settings.
- `ExportJob`: format, document version, status, storage key và error.
- `ProcessingJob`: type, provider, attempts, progress, status và error.

## 6. State machine

Meeting states:

`draft → checking → recording ↔ paused → finalizing → processing → ready`

Nhánh lỗi:

- `checking → draft`: thiếu quyền/nguồn âm không hợp lệ.
- `recording|paused → recovery_required`: app crash hoặc process bị ngắt.
- `finalizing|processing → partial_ready`: audio an toàn nhưng một artifact chưa hoàn thành.
- `partial_ready → processing → ready`: retry thủ công hoặc tự động.

Quy tắc:

- Không được chuyển `recording → ready` trực tiếp.
- Không tạo minutes chính thức trước khi transcript final hoặc người dùng chấp nhận trạng thái chưa đầy đủ.
- Retry job không tạo trùng transcript segment hay audio asset.

## 7. API bề mặt chính

- `POST /meetings`: tạo draft với language và mode.
- `POST /meetings/:id/start`: xác nhận capture/session settings.
- `POST /meetings/:id/pause` và `/resume`.
- `POST /meetings/:id/end`: đóng recording và tạo finalize job.
- `POST /meetings/:id/audio/chunks`: upload idempotent theo chunk ID/checksum.
- `GET /meetings/:id/events`: realtime job/transcript events.
- `GET /meetings/:id/transcript`: transcript gốc + revision projection.
- `POST /transcript-segments/:id/revisions`: sửa mà không ghi đè bản gốc.
- `PUT /meetings/:id/speakers/:speakerId`: đổi speaker label/name.
- `POST /meetings/:id/minutes`: chọn template, language, detail level và provider.
- `POST /minutes/:id/rewrite-section`: tạo đề xuất diff cho một section.
- `POST /minutes/:id/versions`: lưu version chỉnh sửa.
- `POST /minutes/:id/exports`: tạo export job.
- `GET /providers`: capability/health đã lọc, không trả secrets.

Tất cả mutation dùng idempotency key khi có nguy cơ client retry. API key của provider chỉ được lưu phía server bằng secret manager hoặc env được mã hóa; không trả về client/log.

## 8. Offline, lỗi và phục hồi

- Recording luôn ghi local trước, upload sau.
- Audio chunk có sequence và checksum để phát hiện thiếu/trùng/hỏng.
- App khởi động lại sẽ phát hiện meeting chưa finalize và mở Recovery screen.
- Mất mạng không dừng recording; realtime transcript/dịch chuyển sang trạng thái chờ và backfill sau.
- Hết dung lượng: cảnh báo sớm, cố finalize chunk hiện tại và không giả vờ tiếp tục ghi.
- Provider rate limit: exponential backoff có giới hạn và cho phép đổi provider rồi tạo job/version mới.
- Thiếu segment: hiển thị khoảng trống trên timeline, không nối hai đoạn như thể liên tục.
- Export lỗi không ảnh hưởng meeting package; job có thể retry.

## 9. Bảo mật và riêng tư

- TLS khi truyền dữ liệu; encryption at rest cho database và object storage.
- Provider keys chỉ ở backend; log phải redact authorization headers và secrets.
- Audio URL là signed URL ngắn hạn.
- Người dùng có thể xóa local cache sau khi server xác nhận upload hoàn tất.
- Có màn hình retention: giữ vô thời hạn mặc định cho cá nhân, cho phép xóa từng meeting.
- Trước Start có consent reminder; ứng dụng không tự ghi âm nền khi người dùng chưa chủ động Start.
- Telemetry không chứa audio, transcript hoặc nội dung biên bản.

## 10. Kế hoạch triển khai

### Phase 0 — Duyệt thiết kế

- Duyệt tài liệu này, wireflow và tiêu chí nghiệm thu.
- Chốt branding cơ bản và chính sách lưu trữ.
- Không viết thêm production code trước khi được duyệt.

### Phase 1 — Data foundation

- Domain schema, database migrations, auth cá nhân và object storage.
- Meeting state machine, chunk manifest, checksum và recovery model.
- Provider contracts, registry và mock providers cho test.

### Phase 2 — Mobile recording

- Pre-meeting flow đúng thứ tự language → mode → source → Start.
- Microphone capture, chunking, pause/resume/end và crash recovery.
- Local queue, upload idempotent và Library cơ bản.

### Phase 3 — Desktop recording

- Pre-meeting flow đồng nhất với mobile.
- Microphone + Windows system audio, mixer/tách track và device switching an toàn.
- Pause/resume/end, recovery và background upload.

### Phase 4 — Speech và dịch

- Deepgram realtime theo language đã chọn.
- Final/interim transcript, timestamps và speaker diarization.
- Translation realtime chỉ khi chọn mode dịch.
- Backfill từ audio khi mất realtime.
- Local Whisper file transcription là lựa chọn bổ sung.

### Phase 5 — Transcript review

- Timeline audio/transcript, search và marker.
- Rename/merge speakers.
- Transcript revision và audit/version display.
- Trạng thái completeness và phát hiện khoảng thiếu.

### Phase 6 — Detailed minutes

- Năm template mặc định.
- Multi-provider generative AI, schema validation và evidence validation.
- Detailed minutes mặc định; verbatim minutes tùy chọn; executive summary là hành động riêng.
- Job status, retry, fallback có kiểm soát và version comparison.

### Phase 7 — Editor và export

- Desktop block editor, citation playback và version history.
- Brand preset: logo, colors, font, header/footer, page settings.
- DOCX, PDF, Markdown, TXT, JSON và audio export.
- Mobile editor cơ bản và export/share.

### Phase 8 — Hardening và release

- Security/privacy review, secret scanning và log redaction.
- Long-meeting, crash, offline, provider failure và storage pressure tests.
- Packaging/signing Windows, iOS và Android.
- Monitoring chỉ dùng metadata vận hành, không thu nội dung nhạy cảm.

## 11. Tiêu chí nghiệm thu bắt buộc

1. Không thể Start nếu chưa chọn Việt hoặc Anh.
2. Sau khi chọn ngôn ngữ, người dùng chọn rõ `Chỉ họp` hoặc `Họp + dịch`.
3. Pause/Resume không tạo meeting mới và timeline thể hiện khoảng pause.
4. Mất mạng trong cuộc họp không làm mất audio đã ghi local.
5. End chỉ báo thành công sau khi chunk cuối được finalize an toàn.
6. Transcript final giữ nguyên toàn bộ segment nhận được, đúng thứ tự và timestamp.
7. Sửa transcript không thay đổi text gốc trong database.
8. Dịch không thay thế transcript nguyên ngữ.
9. Biên bản chi tiết có citation hợp lệ cho quyết định/action item/nội dung quan trọng.
10. AI không chắc owner/deadline/decision phải gắn `Cần xác nhận`.
11. Đổi AI provider không yêu cầu sửa meeting workflow hay client.
12. Provider key không xuất hiện trong client bundle, API response hoặc log.
13. Export DOCX/PDF/MD/TXT/JSON giữ đúng version người dùng chọn.
14. Có thể mở lại meeting và phát audio từ citation của biên bản.
15. Crash recovery không tạo audio chunk hoặc transcript segment trùng.

## 12. Giả định đã khóa cho bản đầu

- Windows là desktop release đầu tiên; macOS theo sau.
- Deepgram là speech API mặc định; local Whisper là phương án bổ sung.
- Ngôn ngữ được chọn thủ công và cố định cho một meeting.
- Dịch luôn sang ngôn ngữ còn lại và chỉ chạy khi người dùng chọn mode dịch.
- Người dùng cá nhân, chưa có team workspace.
- Cloud sync là mặc định; recording vẫn local-first để bảo toàn dữ liệu.
- Detailed minutes là mặc định; summary không tự sinh.
- Provider fallback mặc định tắt để tránh phát sinh chi phí hoặc gửi dữ liệu sang bên thứ ba ngoài ý muốn.

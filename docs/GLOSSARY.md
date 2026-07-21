# Glossary

**Status:** Accepted  
**Last reviewed:** 2026-07-21

| Term | Meaning |
|---|---|
| Audio chunk | Bounded local recording file with stable ID, sequence and checksum |
| Source evidence | Finalized original audio and source transcript produced from it |
| Source transcript | Immutable final speech-provider segments before user corrections |
| Transcript projection | A defined view combining source segments with selected revisions/speaker mappings |
| Derived artifact | Translation, minutes, summary or export generated from source/projection |
| Evidence reference | Link from derived content to source segment and audio time range |
| Completeness | Measured state describing processed ranges, explicit gaps and pending work |
| Diarization | Classification of transcript segments by speaker labels |
| Provider | External/local speech, translation or generative AI implementation behind an adapter |
| Backfill | Transcription of audio ranges missing from realtime results |
| Detailed minutes | Default comprehensive meeting record; not an executive summary |
| Near-verbatim minutes | Lightly organized document retaining close-to-transcript detail |
| Marker | User-created important timestamp/note during or after a meeting |
| Meeting package | Audio, transcript, revisions, translation, minutes, metadata and exports for one meeting |
| Idempotency | Safe repeated request produces one canonical effect |

use opus::{Channels, Decoder};

use super::DecodedAudio;

const EBML_HEADER: u32 = 0x1a45_dfa3;
const SEGMENT: u32 = 0x1853_8067;
const INFO: u32 = 0x1549_a966;
const TRACKS: u32 = 0x1654_ae6b;
const TRACK_ENTRY: u32 = 0xae;
const CLUSTER: u32 = 0x1f43_b675;
const BLOCK_GROUP: u32 = 0xa0;
const DEFAULT_TIMECODE_SCALE_NS: u64 = 1_000_000;
const OPUS_SAMPLE_RATE: u32 = 48_000;
const MAX_DECODED_SAMPLES: usize = OPUS_SAMPLE_RATE as usize * 60;

#[derive(Default)]
struct WebmDocument {
    is_webm: bool,
    saw_segment: bool,
    timecode_scale_ns: Option<u64>,
    tracks: Vec<AudioTrack>,
    blocks: Vec<OpusBlock>,
}

#[derive(Default)]
struct AudioTrack {
    number: Option<u64>,
    track_type: Option<u64>,
    codec: Option<String>,
    codec_private: Option<Vec<u8>>,
    channels: Option<u64>,
    sample_rate: Option<f64>,
}

struct OpusBlock {
    track_number: u64,
    timestamp_ticks: i128,
    packet: Vec<u8>,
    discard_padding_ns: i64,
}

struct RawBlock {
    bytes: Vec<u8>,
    discard_padding_ns: i64,
}

pub(super) fn decode_opus(bytes: &[u8]) -> Result<DecodedAudio, String> {
    let mut document = WebmDocument::default();
    parse_elements(bytes, &mut document)?;
    let scale = document
        .timecode_scale_ns
        .unwrap_or(DEFAULT_TIMECODE_SCALE_NS);
    if !document.is_webm || !document.saw_segment || scale == 0 {
        return Err("not a supported WebM document".into());
    }

    let mut opus_tracks = document.tracks.iter().filter(|track| {
        track.track_type == Some(2)
            && track.codec.as_deref() == Some("A_OPUS")
            && track.channels == Some(1)
            && track.sample_rate == Some(f64::from(OPUS_SAMPLE_RATE))
            && valid_opus_head(track.codec_private.as_deref())
    });
    let track = opus_tracks
        .next()
        .ok_or("missing supported mono Opus track")?;
    if opus_tracks.next().is_some() {
        return Err("multiple Opus tracks are unsupported".into());
    }
    let track_number = track
        .number
        .filter(|number| *number > 0)
        .ok_or("invalid Opus track number")?;

    let mut blocks = document
        .blocks
        .into_iter()
        .filter(|block| block.track_number == track_number)
        .collect::<Vec<_>>();
    if blocks.is_empty() {
        return Err("WebM contains no Opus audio blocks".into());
    }
    blocks.sort_by_key(|block| block.timestamp_ticks);

    let mut decoder = Decoder::new(OPUS_SAMPLE_RATE, Channels::Mono).map_err(|e| e.to_string())?;
    let mut decoded_samples = Vec::new();
    let mut packet_pcm = [0.0_f32; 5_760];
    for block in blocks {
        let timestamp_ns = block
            .timestamp_ticks
            .checked_mul(i128::from(scale))
            .ok_or("Opus timestamp overflow")?;
        if timestamp_ns < 0 {
            return Err("negative Opus timestamp".into());
        }
        let start_sample = timestamp_ns
            .checked_mul(i128::from(OPUS_SAMPLE_RATE))
            .and_then(|value| value.checked_add(500_000_000))
            .ok_or("Opus sample timestamp overflow")?
            / 1_000_000_000;
        let start_sample = usize::try_from(start_sample).map_err(|_| "Opus timestamp overflow")?;
        if start_sample < decoded_samples.len() {
            return Err("overlapping or out-of-order Opus blocks".into());
        }
        let decoded_frames = decoder
            .decode_float(&block.packet, &mut packet_pcm, false)
            .map_err(|e| e.to_string())?;
        if decoded_frames == 0 || decoded_frames > packet_pcm.len() {
            return Err("invalid decoded Opus frame length".into());
        }
        let trim_frames = if block.discard_padding_ns > 0 {
            (block.discard_padding_ns as u64)
                .saturating_mul(u64::from(OPUS_SAMPLE_RATE))
                .div_ceil(1_000_000_000) as usize
        } else if block.discard_padding_ns < 0 {
            return Err("negative Opus discard padding is unsupported".into());
        } else {
            0
        };
        if trim_frames >= decoded_frames {
            return Err("Opus discard padding removes the whole packet".into());
        }
        let final_len = start_sample
            .checked_add(decoded_frames - trim_frames)
            .ok_or("decoded audio length overflow")?;
        if final_len > MAX_DECODED_SAMPLES {
            return Err("WebM audio chunk exceeds the supported duration".into());
        }
        decoded_samples.resize(start_sample, 0.0);
        decoded_samples.extend_from_slice(&packet_pcm[..decoded_frames - trim_frames]);
    }

    if decoded_samples.is_empty() {
        return Err("WebM contains no playable Opus samples".into());
    }
    Ok(DecodedAudio {
        samples: decoded_samples,
        sample_rate: OPUS_SAMPLE_RATE,
    })
}

fn valid_opus_head(codec_private: Option<&[u8]>) -> bool {
    let Some(head) = codec_private else {
        return false;
    };
    head.len() >= 19
        && &head[..8] == b"OpusHead"
        && head[9] == 1
        && u16::from_le_bytes([head[10], head[11]]) == 0
        && head[18] == 0
}

fn parse_elements(bytes: &[u8], document: &mut WebmDocument) -> Result<(), String> {
    let mut cursor = 0;
    while cursor < bytes.len() {
        let (id, payload) = read_element(bytes, &mut cursor)?;
        match id {
            EBML_HEADER => parse_ebml_header(payload, document)?,
            SEGMENT => {
                document.saw_segment = true;
                parse_segment(payload, document)?;
            }
            _ => {}
        }
    }
    Ok(())
}

fn parse_ebml_header(bytes: &[u8], document: &mut WebmDocument) -> Result<(), String> {
    let mut cursor = 0;
    while cursor < bytes.len() {
        let (id, payload) = read_element(bytes, &mut cursor)?;
        if id == 0x4282 {
            document.is_webm = payload == b"webm";
        }
    }
    Ok(())
}

fn parse_segment(bytes: &[u8], document: &mut WebmDocument) -> Result<(), String> {
    let mut cursor = 0;
    while cursor < bytes.len() {
        let (id, payload) = read_element(bytes, &mut cursor)?;
        match id {
            INFO => parse_info(payload, document)?,
            TRACKS => parse_tracks(payload, document)?,
            CLUSTER => parse_cluster(payload, document)?,
            _ => {}
        }
    }
    Ok(())
}

fn parse_info(bytes: &[u8], document: &mut WebmDocument) -> Result<(), String> {
    let mut cursor = 0;
    while cursor < bytes.len() {
        let (id, payload) = read_element(bytes, &mut cursor)?;
        if id == 0x2ad7b1 {
            document.timecode_scale_ns = Some(read_unsigned(payload)?);
        }
    }
    Ok(())
}

fn parse_tracks(bytes: &[u8], document: &mut WebmDocument) -> Result<(), String> {
    let mut cursor = 0;
    while cursor < bytes.len() {
        let (id, payload) = read_element(bytes, &mut cursor)?;
        if id == TRACK_ENTRY {
            document.tracks.push(parse_track_entry(payload)?);
        }
    }
    Ok(())
}

fn parse_track_entry(bytes: &[u8]) -> Result<AudioTrack, String> {
    let mut track = AudioTrack::default();
    let mut cursor = 0;
    while cursor < bytes.len() {
        let (id, payload) = read_element(bytes, &mut cursor)?;
        match id {
            0xd7 => track.number = Some(read_unsigned(payload)?),
            0x83 => track.track_type = Some(read_unsigned(payload)?),
            0x86 => {
                track.codec = Some(
                    std::str::from_utf8(payload)
                        .map_err(|_| "invalid WebM codec name")?
                        .to_owned(),
                )
            }
            0x63a2 => track.codec_private = Some(payload.to_vec()),
            0xe1 => parse_audio_settings(payload, &mut track)?,
            _ => {}
        }
    }
    Ok(track)
}

fn parse_audio_settings(bytes: &[u8], track: &mut AudioTrack) -> Result<(), String> {
    let mut cursor = 0;
    while cursor < bytes.len() {
        let (id, payload) = read_element(bytes, &mut cursor)?;
        match id {
            0x9f => track.channels = Some(read_unsigned(payload)?),
            0xb5 if payload.len() == 4 => {
                track.sample_rate = Some(f32::from_be_bytes(payload.try_into().unwrap()) as f64)
            }
            0xb5 if payload.len() == 8 => {
                track.sample_rate = Some(f64::from_be_bytes(payload.try_into().unwrap()))
            }
            0xb5 => return Err("invalid WebM audio sample rate".into()),
            _ => {}
        }
    }
    Ok(())
}

fn parse_cluster(bytes: &[u8], document: &mut WebmDocument) -> Result<(), String> {
    let mut cursor = 0;
    let mut timecode = None;
    let mut raw_blocks = Vec::new();
    while cursor < bytes.len() {
        let (id, payload) = read_element(bytes, &mut cursor)?;
        match id {
            0xe7 => timecode = Some(read_unsigned(payload)?),
            0xa3 => raw_blocks.push(RawBlock {
                bytes: payload.to_vec(),
                discard_padding_ns: 0,
            }),
            BLOCK_GROUP => raw_blocks.push(parse_block_group(payload)?),
            _ => {}
        }
    }
    let base_timecode = i128::from(timecode.ok_or("WebM cluster is missing its timecode")?);
    for raw in raw_blocks {
        let (track_number, relative_timecode, packet) = parse_block(&raw.bytes)?;
        document.blocks.push(OpusBlock {
            track_number,
            timestamp_ticks: base_timecode + i128::from(relative_timecode),
            packet: packet.to_vec(),
            discard_padding_ns: raw.discard_padding_ns,
        });
    }
    Ok(())
}

fn parse_block_group(bytes: &[u8]) -> Result<RawBlock, String> {
    let mut cursor = 0;
    let mut block = None;
    let mut discard_padding_ns = 0;
    while cursor < bytes.len() {
        let (id, payload) = read_element(bytes, &mut cursor)?;
        match id {
            0xa1 => {
                if block.replace(payload.to_vec()).is_some() {
                    return Err("WebM BlockGroup contains multiple Blocks".into());
                }
            }
            0x75a2 => discard_padding_ns = read_signed(payload)?,
            _ => {}
        }
    }
    Ok(RawBlock {
        bytes: block.ok_or("WebM BlockGroup is missing its Block")?,
        discard_padding_ns,
    })
}

fn parse_block(bytes: &[u8]) -> Result<(u64, i16, &[u8]), String> {
    let (track_number, track_width) = read_vint(bytes)?;
    let header_end = track_width.checked_add(3).ok_or("Block header overflow")?;
    if bytes.len() <= header_end {
        return Err("truncated WebM Block".into());
    }
    let relative_timecode = i16::from_be_bytes([bytes[track_width], bytes[track_width + 1]]);
    let flags = bytes[track_width + 2];
    if flags & 0x06 != 0 {
        return Err("laced WebM Opus blocks are unsupported".into());
    }
    Ok((track_number, relative_timecode, &bytes[header_end..]))
}

fn read_element<'a>(bytes: &'a [u8], cursor: &mut usize) -> Result<(u32, &'a [u8]), String> {
    let (id, id_width) = read_id(bytes.get(*cursor..).ok_or("invalid EBML cursor")?)?;
    *cursor = cursor.checked_add(id_width).ok_or("EBML cursor overflow")?;
    let (size, size_width) = read_size(bytes.get(*cursor..).ok_or("missing EBML size")?)?;
    *cursor = cursor
        .checked_add(size_width)
        .ok_or("EBML cursor overflow")?;
    let end = match size {
        Some(size) => cursor
            .checked_add(size)
            .ok_or("EBML element size overflow")?,
        None if id == SEGMENT => bytes.len(),
        None => return Err("unknown-size non-Segment EBML element".into()),
    };
    let payload = bytes.get(*cursor..end).ok_or("truncated EBML element")?;
    *cursor = end;
    Ok((id, payload))
}

fn read_id(bytes: &[u8]) -> Result<(u32, usize), String> {
    let first = *bytes.first().ok_or("missing EBML ID")?;
    let width = (first.leading_zeros() + 1) as usize;
    if width == 0 || width > 4 || bytes.len() < width {
        return Err("invalid EBML ID".into());
    }
    Ok((
        bytes[..width]
            .iter()
            .fold(0_u32, |id, byte| (id << 8) | u32::from(*byte)),
        width,
    ))
}

fn read_size(bytes: &[u8]) -> Result<(Option<usize>, usize), String> {
    let first = *bytes.first().ok_or("missing EBML size")?;
    let width = (first.leading_zeros() + 1) as usize;
    if width == 0 || width > 8 || bytes.len() < width {
        return Err("invalid EBML size".into());
    }
    let mask = if width == 8 { 0 } else { 0xff_u8 >> width };
    let mut value = u64::from(first & mask);
    for byte in &bytes[1..width] {
        value = (value << 8) | u64::from(*byte);
    }
    if value == (1_u64 << (7 * width)) - 1 {
        return Ok((None, width));
    }
    Ok((
        Some(usize::try_from(value).map_err(|_| "EBML element too large")?),
        width,
    ))
}

fn read_vint(bytes: &[u8]) -> Result<(u64, usize), String> {
    let first = *bytes.first().ok_or("missing WebM track number")?;
    let width = (first.leading_zeros() + 1) as usize;
    if width == 0 || width > 8 || bytes.len() < width {
        return Err("invalid WebM variable integer".into());
    }
    let mask = if width == 8 { 0 } else { 0xff_u8 >> width };
    let mut value = u64::from(first & mask);
    for byte in &bytes[1..width] {
        value = (value << 8) | u64::from(*byte);
    }
    if value == (1_u64 << (7 * width)) - 1 {
        return Err("unknown WebM track number".into());
    }
    Ok((value, width))
}

fn read_unsigned(bytes: &[u8]) -> Result<u64, String> {
    if bytes.is_empty() || bytes.len() > 8 {
        return Err("invalid EBML unsigned integer".into());
    }
    Ok(bytes
        .iter()
        .fold(0_u64, |value, byte| (value << 8) | u64::from(*byte)))
}

fn read_signed(bytes: &[u8]) -> Result<i64, String> {
    if bytes.is_empty() || bytes.len() > 8 {
        return Err("invalid EBML signed integer".into());
    }
    let sign_extend = if bytes[0] & 0x80 != 0 { 0xff } else { 0x00 };
    let mut full = [sign_extend; 8];
    full[8 - bytes.len()..].copy_from_slice(bytes);
    Ok(i64::from_be_bytes(full))
}

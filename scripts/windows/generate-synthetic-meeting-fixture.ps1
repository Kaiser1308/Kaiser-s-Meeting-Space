[CmdletBinding()]
param([string]$OutputDir)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($OutputDir)) { $OutputDir = Join-Path $PSScriptRoot '..\..\apps\desktop\test-fixtures\synthetic-meeting' }
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$wavPath = Join-Path $OutputDir 'synthetic-meeting.wav'
$transcriptPath = Join-Path $OutputDir 'expected-transcript.json'
$manifestPath = Join-Path $OutputDir 'fixture.json'
$scriptText = 'Hello. This is the Kaiser synthetic meeting fixture. We approve action item one. The owner is Alex and the due date is Friday. No real meeting content is included.'

$voice = New-Object -ComObject SAPI.SpVoice
$format = New-Object -ComObject SAPI.SpAudioFormat
$format.Type = 22
$stream = New-Object -ComObject SAPI.SpFileStream
try {
  $stream.Format = $format
  $stream.Open($wavPath, 3, $false)
  $voice.AudioOutputStream = $stream
  [void]$voice.Speak($scriptText, 0)
} finally {
  $stream.Close()
}

$bytes = [System.IO.File]::ReadAllBytes($wavPath)
if ($bytes.Length -lt 44 -or [System.Text.Encoding]::ASCII.GetString($bytes, 0, 4) -ne 'RIFF' -or [System.Text.Encoding]::ASCII.GetString($bytes, 8, 4) -ne 'WAVE') { throw 'fixture_wav_invalid' }
$byteRate = [BitConverter]::ToInt32($bytes, 28)
$dataBytes = [BitConverter]::ToInt32($bytes, 42)
if ($byteRate -le 0 -or $dataBytes -le 0) { throw 'fixture_wav_empty' }
$durationMs = [int][math]::Round(($dataBytes * 1000.0) / $byteRate)
$transcript = [ordered]@{
  fixtureId = 'synthetic-meeting-v1'
  language = 'en'
  durationMs = $durationMs
  segments = @([ordered]@{ startMs = 0; endMs = $durationMs; text = $scriptText; speaker = 'Synthetic Speaker' })
}
$transcriptJson = $transcript | ConvertTo-Json -Depth 5 -Compress
[System.IO.File]::WriteAllText($transcriptPath, $transcriptJson + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
$wavHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $wavPath).Hash.ToLowerInvariant()
$transcriptHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $transcriptPath).Hash.ToLowerInvariant()
$manifest = [ordered]@{
  fixtureId = 'synthetic-meeting-v1'
  language = 'en'
  wavPath = 'synthetic-meeting.wav'
  wavSha256 = $wavHash
  durationMs = $durationMs
  expectedTranscriptPath = 'expected-transcript.json'
  expectedTranscriptSha256 = $transcriptHash
  maxWer = 0.45
  minPhraseCoverage = 0.8
}
$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $manifestPath -Encoding utf8
Write-Output "voice=$($voice.GetType().Name)"
Write-Output "wavSha256=$wavHash"
Write-Output "transcriptSha256=$transcriptHash"
Write-Output "durationMs=$durationMs"

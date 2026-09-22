[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$AudioPath,
  [Parameter(Mandatory = $true)][int]$DurationMs
)
$ErrorActionPreference = 'Stop'
if ($AudioPath -match '^[a-z][a-z0-9+.-]*://') { throw 'network_audio_source_forbidden' }
if (-not [IO.Path]::IsPathRooted($AudioPath) -or -not (Test-Path -LiteralPath $AudioPath -PathType Leaf)) { throw 'fixture_audio_missing' }
if ($DurationMs -le 0) { throw 'invalid_playback_duration' }
Add-Type -AssemblyName System.Windows.Forms
$player = New-Object System.Media.SoundPlayer
$player.SoundLocation = (Resolve-Path -LiteralPath $AudioPath).Path
$deadline = [Diagnostics.Stopwatch]::GetTimestamp() + [int64]($DurationMs * ([Diagnostics.Stopwatch]::Frequency / 1000.0))
try {
  while ([Diagnostics.Stopwatch]::GetTimestamp() -lt $deadline) {
    $player.PlaySync()
  }
} finally { $player.Stop(); $player.Dispose() }

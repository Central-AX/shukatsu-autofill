# 配布用ZIPを作る（Windows PowerShell 5.1 で動作）
# 使い方: powershell -ExecutionPolicy Bypass -File scripts\package.ps1
# 拡張の実行に必要なファイルだけを dist\shukatsu-autofill\ に集め、
# dist\shukatsu-autofill-v<version>.zip にする（解凍すると shukatsu-autofill\manifest.json になる構成）
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$name = 'shukatsu-autofill'
$dist = Join-Path $root 'dist'
$stage = Join-Path $dist $name

$manifestPath = Join-Path $root 'manifest.json'
$manifest = [System.IO.File]::ReadAllText($manifestPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$version = $manifest.version
if (-not $version) { throw 'manifest.json に version がありません' }

# 同梱するもの（ファイルはそのまま、フォルダは中身ごと）
$items = @('manifest.json', 'background.js', 'popup.html', 'popup.css', 'popup.js', 'options.html', 'options.css', 'options.js', 'src', 'icons')

if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Force $stage | Out-Null
foreach ($item in $items) {
  $src = Join-Path $root $item
  if (-not (Test-Path $src)) { throw "見つかりません: $item" }
  Copy-Item -Path $src -Destination $stage -Recurse -Force
}

$zipPath = Join-Path $dist ("$name-v$version.zip")
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }

# Compress-Archive(5.1) はZIP内の区切りが「\」になり Mac などで崩れるため、区切りを「/」にして自前で詰める
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  $files = Get-ChildItem -Path $stage -Recurse -File | Sort-Object FullName
  foreach ($f in $files) {
    $rel = $f.FullName.Substring($stage.Length).TrimStart('\', '/').Replace('\', '/')
    $entryName = "$name/$rel"
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $f.FullName, $entryName, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
}
finally {
  $zip.Dispose()
}

Write-Host "作成しました: $zipPath"
Write-Host ("ファイル数: " + $files.Count)

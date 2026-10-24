$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$taskRuntime = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies'
$taskPython = Join-Path $taskRuntime 'python/python.exe'
$taskNode = Join-Path $taskRuntime 'node/bin/node.exe'
if (-not (Test-Path -LiteralPath $taskPython)) { $taskPython = (Get-Command python -ErrorAction Stop).Source }
if (-not (Test-Path -LiteralPath $taskNode)) { $taskNode = (Get-Command node -ErrorAction Stop).Source }
$env:NODE_BINARY = $taskNode
$env:PYTHONIOENCODING = 'utf-8'
Write-Host '문서 갱신 관리: http://127.0.0.1:4175/'
& $taskPython tools/update_manager.py --port 4175

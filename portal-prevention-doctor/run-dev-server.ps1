$ErrorActionPreference = "Stop"
try {
  Set-Location (Split-Path -Parent $PSScriptRoot)
  $node = (Get-Command node -ErrorAction SilentlyContinue).Source
  if (-not $node) {
    $programNode = Join-Path $env:ProgramFiles "nodejs\node.exe"
    if (Test-Path $programNode) {
      $node = $programNode
    } else {
      $node = "C:\Users\heidi\AppData\Local\OpenAI\Codex\bin\node.exe"
    }
  }
  & $node "portal-prevention-doctor\dev-server.js" *>> "portal-prevention-doctor\dev-server.log"
} catch {
  $_ | Out-String | Add-Content "C:\Users\heidi\OneDrive\Documents\New project\portal-prevention-doctor\dev-server.log"
  throw
}

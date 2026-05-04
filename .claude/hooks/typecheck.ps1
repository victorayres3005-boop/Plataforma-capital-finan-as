try {
  $stdin = [Console]::In.ReadToEnd()
  if (-not $stdin) { exit 0 }
  $data = $stdin | ConvertFrom-Json
  $path = $data.tool_input.file_path
  if (-not $path -or $path -notmatch '\.tsx?$') { exit 0 }

  npx --no-install tsc --noEmit
  if ($LASTEXITCODE -ne 0) { exit 2 }
  exit 0
} catch {
  Write-Output "Hook error: $_"
  exit 0
}

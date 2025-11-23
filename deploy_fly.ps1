#!/usr/bin/env pwsh
# Small helper to deploy the app to Fly using local flyctl
Param(
  [string]$appName = "stolpoker",
  [string]$config = "fly.toml"
)

Write-Host "Deploying $appName using config: $config"
flyctl auth whoami
flyctl deploy --app $appName --config $config

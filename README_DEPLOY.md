# stolpoker - deploy guide

This doc describes how to test and deploy the `poker-table` backend to Fly.io and how to publish the frontend to GitHub Pages.

## Quick local tests

1. Backend (Node):
```powershell
cd C:\serwer\htdocs\poker-table\backend
npm install
npm start
Invoke-WebRequest -Uri 'http://localhost:8080/health' -UseBasicParsing
```

2. Frontend (static local server):
```powershell
cd C:\serwer\htdocs\poker-table\frontend
npx http-server -p 3000
# open http://localhost:3000
```

3. Docker (optional but recommended):
```powershell
cd C:\serwer\htdocs\poker-table
docker build -t stolpoker:local -f backend/Dockerfile .
docker run --rm -d --name stolpoker-local -p 8080:8080 -e PORT=8080 stolpoker:local
docker logs -f stolpoker-local
```

## Fly deployment

1. Install and login to flyctl if you haven't:
```powershell
flyctl auth login
```
2. Create app (if needed):
```powershell
flyctl apps create stolpoker
```
3. Deploy from repo root:
```powershell
cd C:\serwer\htdocs\poker-table
flyctl deploy --config fly.toml --app stolpoker
```
4. Logging and SSH:
```powershell
flyctl logs -a stolpoker --since 10m
flyctl ssh console -a stolpoker --command "ls -la /run.sh /app /app/backend; cat /run.sh; ps aux | grep node"
```

## GitHub Actions

1. Add `FLY_API_TOKEN` to your repo Secrets.
2. Push changes to `main`/`master` - workflow `deploy-fly.yml` will deploy backend automatically.
3. Frontend `deploy-pages.yml` publishes the `frontend/` folder to GitHub Pages.

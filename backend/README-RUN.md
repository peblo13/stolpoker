# Backend - Run & Test instructions

Quick commands to build and test the backend locally (Docker and Node):

1) Build the Docker image (requires Docker Desktop running):
```powershell
docker build -t stolpoker-backend -f backend/Dockerfile .
```

2) Run the image (map to port 8080):
```powershell
docker run --rm -it -p 8080:8080 -e PORT=8080 stolpoker-backend
```

3) Test the HTTP health endpoint:
```powershell
curl -i http://localhost:8080/health
```

4) Run the app locally without Docker (dev):
```powershell
cd backend
npm install
npm start
```

Notes:
- For reproducible installs we now use `package-lock.json` + `npm ci` in the Dockerfile.
- CI performs `npm audit` (fails on high/critical) and builds the image in `backend-security` workflow.
- If Docker is not running locally, build will fail with an error referencing Docker Desktop.

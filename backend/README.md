# poker-table backend Docker instructions

To build and test the backend image locally:

1. Build the image from repository root:
   docker build -t stolpoker:local -f backend/Dockerfile .

2. Run locally (bind to port 8080):
   docker run --rm -d --name stolpoker-local -p 8080:8080 -e PORT=8080 stolpoker:local
   docker logs -f stolpoker-local

3. Inspect container contents to verify /run.sh is present:
   docker run --rm --entrypoint sh stolpoker:local -c "ls -la /run.sh /app /app/backend && cat /run.sh"

If running on Fly.io ensure that `fly.toml` is present and that your app process is either declared as `node /app/backend/index.js` or relies on /run.sh being available.

Deploying to Fly.io (simple steps):
1. Ensure `flyctl` is installed and you're logged in: `flyctl auth login`.
2. Initialize a Fly app (if new): `flyctl apps create stolpoker --org PERSONAL_OR_TEAM`.
3. Deploy using our `fly.toml` and Dockerfile:
   flyctl deploy --app stolpoker --config fly.toml
4. Check logs and machines:
   flyctl logs -a stolpoker --since 10m
   flyctl status -a stolpoker

Troubleshooting:
- If Fly shows a crash or `No such file or directory /run.sh`, verify the Dockerfile is correct and not overwritten by another Dockerfile in the repo.
- If Fly fails to detect listening port, check `internal_port` in `fly.toml` and that your server uses `process.env.PORT`.

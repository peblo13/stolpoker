# Deploying backend to Fly.io (Quickstart)

This guide helps you quickly deploy the Node backend to Fly.io.

1. Install Fly CLI and log in
   - https://fly.io/docs/getting-started/installing-flyctl/

2. Initialize your fly app and deploy
   Replace `poker-table` below with a unique name or leave blank to let Fly generate one:

```bash
# login
flyctl auth login

# from backend directory
cd backend
# initialize (answer prompts; select region)
flyctl launch --name poker-table --no-deploy

# build and deploy
flyctl deploy
```

3. Environment variables

Set secrets via flyctl to store sensitive values (do not keep them in the repo):

```bash
flyctl secrets set ADMIN_CODE=your_admin_code
# optional: VITE env vars for frontend
```

4. Post-deploy

Your application will be reachable via Fly's URL (e.g. https://poker-table.fly.dev). Update your frontend `VITE_SOCKET_URL` to use the deployed backend host.

5. Notes
- Fly maps the external HTTPS port to your internal port 9000 based on `fly.toml` configuration.
- This is best for small apps and testing; for production, configure autoscaling, logging, and persistent storage as needed.

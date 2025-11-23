# Frontend Demo for Poker Table

This is a very small, static frontend demo used to connect to the backend via socket.io.

How to run locally:

1. You can open `frontend/index.html` directly in a browser (for a static test against a locally running backend at `http://localhost:8080`).
2. Or run a local static server:
```ps1
npx http-server ./frontend -p 3000
```

To point it to production backend on Fly, visit `https://stolpoker.fly.dev` or host the frontend on GitHub Pages (see `.github/workflows/deploy-pages.yml`).

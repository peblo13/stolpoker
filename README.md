# WebDesigner.com.pl

Landing page dla freelancera Pawła Śliwińskiego, specjalizującego się w tworzeniu stron internetowych, serwisów i sklepów od podstaw.

## Funkcje
- Futuristic design z animacjami i efektami parallax
- Sekcje: Hero, O mnie, Umiejętności, Portfolio, Kontakt
- Umiejętności: Front-End (HTML5, CSS3, JS, React, TS), Back-End (Node.js, PHP, MySQL), Narzędzia (Git, GitHub, VS Code)
- Formularz kontaktowy wysyłający wiadomości na WhatsApp
- Link do GitHub

## Uruchomienie
Otwórz index.html w przeglądarce lub użyj lokalnego serwera: `python -m http.server 8000`

## Wymagania
- Node.js >= 14
- npm lub yarn

## Instalacja
1. Sklonuj repozytorium: `git clone <url>`
2. Zainstaluj zależności backend: `cd backend && npm install`
3. Zainstaluj zależności frontend: `cd frontend && npm install`

## Uruchomienie
1. Uruchom backend: `cd backend && npm start`
2. Uruchom frontend: `cd frontend && npm run dev`
3. Otwórz przeglądarkę na `http://localhost:5174`

## Jak grać
- Dołącz do gry wpisując nick i klikając "Dołącz do gry".
- Rozpocznij grę gdy jest co najmniej 2 graczy.
- W fazie pre-flop: każdy gracz ma 2 karty (widoczne tylko dla niego).
- Bet, Raise, Call, Fold lub All In.
- Użyj "Następna faza" aby przejść do Flop, Turn, River.
- Po River: zwycięzca zostaje wybrany na podstawie najlepszej ręki pokerowej, a pot zostaje rozdany.

## Funkcje
- Stół pokerowy z kartami i żetonami
- Zarządzanie wirtualną walutą (każdy gracz zaczyna z 1000 żetonów)
- Multiplayer (do 10 graczy)
- Animacje i efekty wizualne
- Timer dla decyzji (30 sekund)
- Automatyczna ocena rąk pokerowych

## API
Backend używa Socket.IO dla komunikacji w czasie rzeczywistym.
Zdarzenia: joinGame, bet, raise, call, fold, allIn, startGame, nextPhase, resetGame.

## Licencja
MIT

## Local LAN access & UI Tests (for development)

If you want to open the app on a different device in the same LAN (e.g., iPhone):

1. Start the backend to bind to 0.0.0.0 so it is reachable on all interfaces:

```powershell
cd backend
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\Start-Server.ps1 -Port 8086 -BindAddr 0.0.0.0 -AdminCode testadmin -AllowFirewall
```

**Note:** For tests and local debugging, ensure that `DEBUG_API` and `VITE_TEST_MODE` are set.

2. Start the frontend dev server if you prefer hot reload:

```powershell
cd frontend
npm run dev -- --host 0.0.0.0
```

3. Find your PC local-ip (e.g. 192.168.1.42) and open http://<PC-IP>:8086 on your phone (or http://<PC-IP>:5173 if using Vite dev server).

4. To run UI tests (Playwright):

```powershell
cd frontend
npm ci
# Build with VITE_TEST_MODE so the client exposes test helpers during the build
# On PowerShell:
$env:VITE_TEST_MODE = '1'; npm run build
# Start backend with DEBUG_API=1 so the server exposes the debug API used by tests
cd ..\backend
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\Start-Server.ps1 -Port 8086 -BindAddr 127.0.0.1 -DebugMode
cd ..\frontend
npm run test:ui
OR use the included script to automatically pick a free port, build, start backend and run tests:
```powershell
cd C:\serwer\htdocs\poker-table\frontend
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run-ui-tests.ps1 -Port 0 -BindAddr 127.0.0.1
```
```

Notes:
- The app exposes `/health` endpoint for quick readiness checks.
- For public access (over internet) use a tunneling tool like ngrok.

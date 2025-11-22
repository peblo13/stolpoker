import { useState, useEffect, useRef } from 'react';
const BetIcon = new URL('./icons/bet.svg', import.meta.url).href;
const CheckIcon = new URL('./icons/check.svg', import.meta.url).href;
const RaiseIcon = new URL('./icons/raise.svg', import.meta.url).href;
const CallIcon = new URL('./icons/call.svg', import.meta.url).href;
const FoldIcon = new URL('./icons/fold.svg', import.meta.url).href;
const AllInIcon = new URL('./icons/allin.svg', import.meta.url).href;
const NextIcon = new URL('./icons/next.svg', import.meta.url).href;
import { io, Socket } from 'socket.io-client';
import './App.css';
import logo from './logo.png';

// Extend the global ImportMeta interface
declare global {
  interface ImportMetaEnv {
    readonly VITE_SOCKET_URL?: string;
    readonly VITE_TEST_MODE?: string;
  }
}

// Socket will be created inside the component so we can control reconnection
// and avoid top-level connection attempts while the app mounts.
// We'll prefer WebSocket transport to avoid polling issues.

interface GameState {
  players: any[];
  communityCards: any[];
  pot: number;
  currentPlayer: number;
  phase: string;
  timer: number;
  currentBet: number;
  playerHands: { [key: string]: any[] };
  dealerSeat?: number | null;
  smallBlindSeat?: number | null;
  bigBlindSeat?: number | null;
  smallBlind?: number;
  bigBlind?: number;
  blindLevel?: number;
  autoIncreaseBlinds?: boolean;
}

  function playSound(sound: string) {
  let url = '';
  switch (sound) {
    case 'join': url = 'https://www.soundjay.com/misc/sounds/bell-ringing-05.wav'; break;
    case 'bet': url = 'https://www.soundjay.com/misc/sounds/coin-drop-1.wav'; break;
    case 'fold': url = 'https://www.soundjay.com/misc/sounds/card-flip-1.wav'; break;
    case 'start': url = 'https://www.soundjay.com/misc/sounds/applause-1.wav'; break;
    case 'reset': url = 'https://www.soundjay.com/misc/sounds/button-1.wav'; break;
    case 'next': url = 'https://www.soundjay.com/misc/sounds/shuffle-1.wav'; break;
    case 'tick': url = 'https://www.soundjay.com/misc/sounds/beep-1.wav'; break;
    case 'chip': url = 'https://www.soundjay.com/misc/sounds/coin-drop-2.wav'; break;
    case 'blind': url = 'https://www.soundjay.com/misc/sounds/coin-drop-3.wav'; break;
    case 'card': url = 'https://www.soundjay.com/misc/sounds/card-flip-2.wav'; break;
    case 'dealer': url = 'https://www.soundjay.com/human/sounds/bell-ringing-01.mp3'; break;
    default: return;
  }
  const audio = new Audio(url);
  audio.volume = 0.3;
  audio.play().catch(() => {});
}

function App() {
  const [gameState, setGameState] = useState<GameState>({
    players: [],
    communityCards: [],
    pot: 0,
    currentPlayer: 0,
    phase: 'waiting',
    timer: 0,
    currentBet: 0,
    playerHands: {}
  });
  const [nickname, setNickname] = useState('');
  const [betAmount, setBetAmount] = useState(10);
  const iconFor = (action: string) => {
    switch (action) {
      case 'Bet': return BetIcon;
      case 'Check': return CheckIcon;
      case 'Raise': return RaiseIcon;
      case 'Call': return CallIcon;
      case 'Fold': return FoldIcon;
      case 'All In': return AllInIcon;
      case 'Next Phase': return NextIcon;
      default: return '';
    }
  };
  const animateBtn = (e: React.MouseEvent<HTMLButtonElement>) => {
    const b = e.currentTarget;
    b.classList.add('btn-pressed');
    setTimeout(() => b.classList.remove('btn-pressed'), 160);
  };
    function t(key: string) {
        const translations: any = {
          'Dealer': 'Krupier',
          'Small Blind': 'SB',
          'Big Blind': 'BB',
          'Bet': 'Postaw',
          'Check': 'Sprawdź',
          'Raise': 'Podbij',
          'Call': 'Call',
          'Fold': 'Pas',
          'All In': 'Wszystko',
          'Next Phase': 'Następna faza',
          'Test Sound': 'Testuj dźwięk',
          'Sounds On': 'Dźwięki: On',
          'Sounds Off': 'Dźwięki: Off',
          'Join Game': 'Dołącz do gry',
          'Enter Nickname': 'Wpisz swój nick',
          'Empty Seat': 'Puste miejsce',
          'Click to sit': 'Kliknij, aby usiąść',
          'Start Game': 'Rozpocznij grę',
          'Reset': 'Reset',
          'Pot': 'Pula',
          'Set Blind Level': 'Poziom blindów',
          'Auto Increase Blinds': 'Auto zwiększanie blindów',
          'SB': 'SB',
          'BB': 'BB',
          'Small Blind Label': 'SB: {amount}',
          'Big Blind Label': 'BB: {amount}',
          'Phase': 'Faza',
          'Time': 'Czas',
          'Your Cards': 'Twoje karty',
          'Send': 'Wyślij',
          'Message placeholder': 'Wpisz wiadomość...',
          'Reconnect': 'Ponów próbę',
          'Confirm Join': 'Potwierdzenie dołączenia',
          'Confirm Join Body': 'Czy na pewno chcesz usiąść przy miejscu nr {seat}?',
          'Yes Join': 'Tak, dołącz',
          'Cancel': 'Anuluj',
          'Joining seat toast': 'Usiadłeś przy miejscu nr {seat}',
          'No server connection': 'Brak połączenia z serwerem',
          'Please enter nickname': 'Najpierw wpisz swój nick',
          'Failed to join seat': 'Nie udało się dołączyć do wybranego miejsca',
          'Join error': 'Błąd dołączania',
          'Connecting to server...': 'Łączenie z serwerem...'
          ,
          'waiting': 'Oczekiwanie',
          'pre-flop': 'Pre-flop',
          'flop': 'Flop',
          'turn': 'Turn',
          'river': 'River'
          ,
          'Not your turn': 'To nie twoja kolej'
        };
        return translations[key] || key;
      }
  const [myId, setMyId] = useState('');
  const [connected, setConnected] = useState(false);
  const [connError, setConnError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [toast, setToast] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const maybePlaySound = (name: string) => {
    if (!soundEnabled) return;
    try { playSound(name); } catch (e) { }
  };
  const [confirmSeat, setConfirmSeat] = useState<{show: boolean, seat?: number}>({ show: false });
  const [messages, setMessages] = useState<{name: string, text: string}[]>([]);
  const [messageInput, setMessageInput] = useState('');
    // removed early return — sound functionality shouldn't block rendering
  const socketRef = useRef<Socket | null>(null);
  const cleanupListenersRef = useRef<(() => void) | null>(null);
  const playersRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const [seatPositions, setSeatPositions] = useState<{left: number, top: number}[]>([]);
  const previousPotRef = useRef(0);
  const previousCommunityCardsLengthRef = useRef(0);

  function getInitials(name: string) {
    if (!name) return '';
    return name.split(' ').map(n => n[0]).slice(0,2).join('').toUpperCase();
  }

  useEffect(() => {
    const metaEnv = (import.meta as any).env || {};
    const TEST_MODE = Boolean((metaEnv.VITE_TEST_MODE === '1') || (metaEnv.MODE && metaEnv.MODE !== 'production'));
    // create socket and attach handlers
    // Socket URL can be provided via Vite env `VITE_SOCKET_URL` (useful for ngrok tunneling).
    // Prefer an explicit IPv4 address to avoid issues when 'localhost' resolves to IPv6 (::1)
    // which can cause a connection mismatch if the backend binds to a specific address.
    const envSocket = (import.meta as any).env?.VITE_SOCKET_URL;
    // Prefer an explicit env var, otherwise connect to the same origin as the page
    const originHost = window.location.origin; // includes protocol and hostname+port if present
    const socketUrl = envSocket || originHost || 'http://127.0.0.1:8086';
    console.log('Connecting to socket URL:', socketUrl);
    const socket = io(socketUrl, {
      // prefer polling first, then upgrade to websocket; some networks block ws upgrades
      transports: ['polling', 'websocket'],
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      timeout: 5000,
    });
    socketRef.current = socket;
    // Only expose internals to the window in test mode to prevent leaking in production
    try { if (TEST_MODE) (window as any).__socket = socket; } catch (e) {}

    const onConnect = () => {
      console.log('Connected to server');
      setConnError('');
      setConnected(true);
      // If the page is opened with testing query params, auto-join that seat for deterministic tests
      try {
        const usp = new URLSearchParams(window.location.search);
        const testNick = usp.get('testNick');
        const testSeat = usp.get('testSeat');
        if (TEST_MODE && testNick && testSeat) {
          // if already seated this socket will be ignored
          console.log('Auto-join test: nick=', testNick, 'seat=', testSeat);
          socket.emit('joinSeat', { name: testNick, seat: Number(testSeat) });
        }
      } catch (e) {}
    };
    const onDisconnect = (reason?: string) => {
      try {
        const trans = (socket && (socket as any).io && (socket as any).io.engine && (socket as any).io.engine.transport && (socket as any).io.engine.transport.name) || 'unknown';
        console.log('Disconnected from server', 'reason:', reason, 'socketId:', socket.id, 'connected:', socket.connected, 'transport:', trans);
      } catch (e) { console.log('Disconnected from server', reason); }
      setConnected(false);
    };
    const onGameUpdate = (data: GameState) => {
      console.log('Received gameUpdate', data);
      setGameState(data);
    };
    const onJoined = (data: any) => {
      setMyId(data.player.id);
      setGameState(data.gameState);
      setNickname(data.player.name || '');
      console.log('Joined confirmed:', data);
      try {
        if (TEST_MODE) {
          (window as any).__myId = data.player.id;
          (window as any).__mySeat = data.player.seat;
        }
      } catch (e) {}
      setToast(t('Joining seat toast').replace('{seat}', String(data.player.seat)));
      setConnError('');
      // Clear toast after 3 seconds
      setTimeout(() => setToast(''), 3000);
    };
    const onConnectError = (err: any) => {
      console.warn('Socket connect error', err);
      setConnError(t('No server connection'));
    };
    const onMessage = (data: any) => {
      setMessages(prev => [...prev, data]);
    };
    const onJoinError = (data: any) => {
      console.warn('Join error:', data);
      setConnError(data?.error || t('Join error'));
      setToast(t('Failed to join seat'));
      setTimeout(() => setToast(''), 3000);
    };
    const onAdminSet = (data: any) => {
      console.log('Admin set response', data);
      if (data && data.ok) {
        setIsAdmin(true);
        setToast('Admin mode enabled');
      } else {
        setToast('Admin password invalid');
      }
      setTimeout(() => setToast(''), 3000);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('reconnect_attempt', (n) => { console.log('Socket reconnect attempt', n); });
    socket.on('reconnect', (n) => { console.log('Socket reconnected', n); });
    socket.on('gameUpdate', onGameUpdate);
    const onCardDealtGlobal = (data: any) => {
      // Generic card dealt animation; do not expect actual card values
      console.log('cardDealt (global):', data);
    };
    socket.on('cardDealt', onCardDealtGlobal);
    const onCardDealtPrivate = (data: any) => {
      // Private card deal; if it's for the local player, update hand in state for immediate display
      const myIdLocal = (window as any).__myId;
      if (data && data.playerId && data.playerId === myIdLocal) {
        setGameState((prev: any) => {
          const next = { ...prev };
          next.playerHands = { ...(next.playerHands || {}) };
          next.playerHands[myIdLocal] = [...(next.playerHands[myIdLocal] || []), data.card];
          return next;
        });
      }
      console.log('cardDealtPrivate:', data);
    };
    socket.on('cardDealtPrivate', onCardDealtPrivate);
    socket.on('update', onGameUpdate);
    socket.on('joined', onJoined);
    socket.on('joinError', onJoinError);
    socket.on('connect_error', onConnectError);
    socket.on('error', (err) => { console.error('Socket error event:', err); });
    socket.on('message', onMessage);
    socket.on('adminSet', onAdminSet);

    // In test mode, instrument the page to capture unexpected unload/crash events
    if (TEST_MODE) {
      const onUnload = (ev: any) => { console.log('Window unload event', ev && ev.type); };
      const onBeforeUnload = (ev: any) => { console.log('Window beforeunload event', ev && ev.type); };
      const onVisibility = () => { console.log('Visibility changed:', document.visibilityState); };
      const onPageHide = (ev: any) => { console.log('Page hide event:', ev && ev.type, 'persisted:', ev && ev.persisted); };
      const onUnhandledRejection = (ev: any) => {
        console.error('Page unhandledRejection:', ev && ev.reason);
        try { if (socketRef.current) socketRef.current.emit('clientError', { type: 'unhandledRejection', reason: String(ev && ev.reason) }); } catch (e) {}
      };
      const onErrorGlobal = (ev: any) => {
        console.error('Page uncaught error:', ev && ev.message, ev && ev.filename, ev && ev.lineno);
        try { if (socketRef.current) socketRef.current.emit('clientError', { type: 'uncaughtError', message: String(ev && ev.message), filename: ev && ev.filename, lineno: ev && ev.lineno }); } catch (e) {}
      };
      try {
        window.addEventListener('unload', onUnload);
        window.addEventListener('beforeunload', onBeforeUnload);
        window.addEventListener('pagehide', onPageHide);
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('unhandledrejection', onUnhandledRejection);
        window.addEventListener('error', onErrorGlobal);
      } catch (e) {}
      // Remove listeners on unmount
      const cleanupListeners = () => {
        try {
          window.removeEventListener('unload', onUnload);
          window.removeEventListener('beforeunload', onBeforeUnload);
          window.removeEventListener('pagehide', onPageHide);
          document.removeEventListener('visibilitychange', onVisibility);
          window.removeEventListener('unhandledrejection', onUnhandledRejection);
          window.removeEventListener('error', onErrorGlobal);
        } catch (e) {}
      };
      // Ensure cleanup registered for unmount
      cleanupListenersRef.current = cleanupListeners;
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('gameUpdate', onGameUpdate);
      socket.off('update', onGameUpdate);
          socket.off('cardDealt', onCardDealtGlobal);
          socket.off('cardDealtPrivate', onCardDealtPrivate);
        socket.off('joined', onJoined);
      socket.off('joinError', onJoinError);
      socket.off('connect_error', onConnectError);
      socket.off('message', onMessage);
      socket.off('adminSet', onAdminSet);
      socket.disconnect();
      socketRef.current = null;
      try { cleanupListenersRef.current && cleanupListenersRef.current(); } catch (e) {}
    };
  }, []);

  // Expose test helpers for Playwright or integration tests only in test mode
  useEffect(() => {
    const metaEnv = (import.meta as any).env || {};
    const TEST_MODE = Boolean((metaEnv.VITE_TEST_MODE === '1') || (metaEnv.MODE && metaEnv.MODE !== 'production'));
    if (!TEST_MODE) return;
    try {
      (window as any).__testHelpers = {
        // Wait until the server reports pot increased and resolve with updated state
        emitAndWaitForPotChange: async (eventName: string, payload: any) => {
          return new Promise((resolve) => {
            const s = socketRef.current;
            if (!s) return resolve(null);
            let lastPot = (gameState && gameState.pot) || 0;
            const listener = (newState: any) => {
              if ((newState && newState.pot || 0) > lastPot) {
                s.off('gameUpdate', listener);
                resolve(newState);
              }
            };
            s.on('gameUpdate', listener);
            try {
              s.emit(eventName, payload);
            } catch (e) {
              s.off('gameUpdate', listener);
              resolve(null);
            }
          });
        },
        emitSmartBet: async (amount: number) => {
          return new Promise((resolve) => {
            const s = socketRef.current;
            if (!s) return resolve(null);
            const lastPot = (gameState && gameState.pot) || 0;
            const helper = (newState: any) => {
              if ((newState && newState.pot || 0) > lastPot) {
                s.off('gameUpdate', helper);
                resolve(newState);
              }
            };
            s.on('gameUpdate', helper);
            try {
              // Compute whether to bet, raise or call
              const myIdLocal = (window as any).__myId;
              const player = (gameState.players || []).find((p: any) => p.id === myIdLocal);
              const currentBetLocal = (gameState && gameState.currentBet) || 0;
              if (!player) {
                s.off('gameUpdate', helper); resolve(null); return;
              }
              if (currentBetLocal === 0) {
                s.emit('bet', amount);
              } else if (amount > currentBetLocal) {
                s.emit('raise', amount);
              } else {
                // amount <= currentBet - attempt a call
                s.emit('call');
              }
            } catch (e) { s.off('gameUpdate', helper); resolve(null); }
          });
        }
      };
    } catch (e) {}
  }, [gameState]);

  const requestAdmin = () => {
    if (!socketRef.current) return;
    socketRef.current.emit('setAdmin', adminPassword);
  };

  useEffect(() => {
    // Calculate seat positions for the table and re-calc on resize or when
    // the `gameState` changes. Use ResizeObserver to make sure we pick up
    // parent element size changes reliably and to avoid initial width/height
    // being 0 which can place seats at 0,0 (top-left).
    let obs: ResizeObserver | null = null;
    let retryId: ReturnType<typeof setInterval> | null = null;
    function calculateSeats() {
      const el = playersRef.current;
      const t = tableRef.current;
      if (!el || !t) return;
      const rect = el.getBoundingClientRect();
      const tableRect = t.getBoundingClientRect();
      // if rect width/height are 0, bail out (will run again when resized)
      if (!rect.width || !rect.height) return;
      // center of players overlay
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      // table center coordinates relative to players overlay
      const tableCenterX = tableRect.left - rect.left + tableRect.width / 2;
      const tableCenterY = tableRect.top - rect.top + tableRect.height / 2;
      // compute a scale relative to original table size 1000x500 so
      // we can set CSS variables and scale seats appropriately
      // Use a slightly more aggressive scaling on small screens so seats don't overlap.
      let scale = Math.max(0.35, Math.min(rect.width / 1000, rect.height / 500));
      const seatsCount = 10;
      let baseSeatW = 140 * scale;
      let baseSeatH = 90 * scale;
      // determine if we should switch to a compact layout on narrow screens
      const smallScreen = rect.width <= 420 || scale <= 0.5;
      const visibleCount = smallScreen ? 6 : 10;
      const angleStart = smallScreen ? 0 : 0; // bottom segment start
      const angleEnd = smallScreen ? Math.PI : 2 * Math.PI; // bottom semicircle if small
      // compute base seat size and default radii based on table's half width/height
      // compute border size to align seats to table edge
      let borderSize = 8;
      try { const cs = getComputedStyle(t); const bw = parseFloat(cs.borderWidth || '0'); if (!isNaN(bw)) borderSize = bw; } catch(e) {}
      // seat center distance from table center to be outside the table edge
      const baseRadiusX = tableRect.width / 2 + baseSeatW / 2 + borderSize / 2 + 4; // +4 px gap
      const baseRadiusY = tableRect.height / 2 + baseSeatH / 2 + borderSize / 2 + 4;
      let rx = baseRadiusX;
      let ry = baseRadiusY;
      // Avoid seat overlap: check arc length for adjacent seats and reduce scale if necessary
      const anglePerSeat = (2 * Math.PI) / (smallScreen ? visibleCount : seatsCount);
      const minArcPadding = 6; // px extra padding to avoid visual overlap
      let arcLen = rx * anglePerSeat;
      while (scale > 0.35 && arcLen < (baseSeatW + minArcPadding)) {
        scale = Math.max(0.35, scale - 0.05);
        baseSeatW = 140 * scale;
        baseSeatH = 90 * scale;
        // recalc rx based on table and seat size
        rx = tableRect.width / 2 + baseSeatW / 2 + borderSize / 2 + 4;
        ry = tableRect.height / 2 + baseSeatH / 2 + borderSize / 2 + 4;
        arcLen = rx * anglePerSeat;
      }
      // no hard clamping here: clamp x/y positions later to keep them inside overlay
      const positions = [];
      // When on smallScreen, prioritize occupied seats; show occupied first, then empty
      let displaySeats: number[] = [];
      if (smallScreen) {
        const occupiedSeats = (gameState.players || []).map(p => p.seat).sort((a,b)=>a-b);
        const emptySeats = Array.from({length:10}, (_,i)=>i+1).filter(s=>!occupiedSeats.includes(s));
        displaySeats = [...occupiedSeats, ...emptySeats].slice(0, visibleCount);
      } else {
        displaySeats = Array.from({length:10}, (_,i)=>i+1);
      }
      for (let i = 0; i < 10; i++) {
        const seatNum = i + 1;
        // For small screens map only the first `visibleCount` seats across the semicircle
        let angle = 0;
        if (smallScreen) {
          const idx = displaySeats.indexOf(seatNum);
          if (idx === -1) {
            angle = null as any; // hidden
          } else {
            angle = angleStart + (idx / Math.max(1, displaySeats.length - 1)) * (angleEnd - angleStart);
          }
        } else {
          angle = (i / 10) * 2 * Math.PI;
        }
        let x = centerX;
        let y = centerY;
        if (angle !== null && typeof angle === 'number') {
          // position relative to table center so seats sit around its edge
          x = tableCenterX + rx * Math.cos(angle);
          y = tableCenterY + ry * Math.sin(angle);
        } else {
          // hidden position; put off center for safety
          x = -9999;
          y = -9999;
        }
        // clamp to container bounds with a small margin based on seat size
        const marginX = Math.max(6, baseSeatW / 2 + 6);
        const marginY = Math.max(6, baseSeatH / 2 + 6);
        x = Math.max(marginX, Math.min(rect.width - marginX, x));
        y = Math.max(marginY, Math.min(rect.height - marginY, y));
        // clamp to container bounds with a small margin
        x = Math.max(20, Math.min(rect.width - 20, x));
        y = Math.max(20, Math.min(rect.height - 20, y));
        positions.push({ left: x, top: y });
      }
      try { el.style.setProperty('--seat-scale', String(scale)); } catch (e) {}
      // store whether a seat is hidden (false means visible)
      setSeatPositions(positions);
      // store small-screen hide mask on the playersRef DOM node so render can pick up
      try { el.style.setProperty('--compact-visible-count', String(visibleCount)); } catch (e) {}
    }

    // initial placeholder positions to avoid top-left flash; use the center
    // of the element if available after the first measurement. We will
    // immediately recalculate with calculateSeats() if the element has size.
    const el = playersRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const cx = (rect.width / 2) || 500;
      const cy = (rect.height / 2) || 250;
      const scale = Math.max(0.5, Math.min(rect.width / 1000, rect.height / 500));
      try { el.style.setProperty('--seat-scale', String(scale)); } catch (e) {}
      setSeatPositions(Array.from({ length: 10 }, () => ({ left: cx, top: cy })));
    } else {
      setSeatPositions(Array.from({ length: 10 }, () => ({ left: 500, top: 250 })));
    }

    // Immediately attempt to calculate; if element has size it will set real positions
    calculateSeats();

    // Add ResizeObserver if available
    if ((window as any).ResizeObserver) {
      // @ts-ignore
      obs = new ResizeObserver(() => calculateSeats());
      // If the ref hasn't been attached yet, wait briefly until it exists.
      // Avoid calling observe with a null value since that will throw.
      const node = playersRef.current;
      if (node && typeof (obs as ResizeObserver).observe === 'function') {
        try { (obs as ResizeObserver).observe(node); } catch (e) { console.warn('ResizeObserver.observe failed', e); }
      } else {
        // Retry a few times until the ref is set or fall back to window resize
        let retries = 0;
        retryId = setInterval(() => {
          const n = playersRef.current;
          if (n && typeof (obs as ResizeObserver).observe === 'function') {
            try { (obs as ResizeObserver).observe(n); } catch (e) { console.warn('ResizeObserver.observe failed at retry', e); }
            if (retryId) { clearInterval(retryId); retryId = null; }
          } else if (++retries > 10) {
            // Give up and fallback to window events
            if (retryId) { clearInterval(retryId); retryId = null; }
            window.addEventListener('resize', calculateSeats);
          }
        }, 80);
      }
      } else {
      window.addEventListener('resize', calculateSeats);
    }

    // Also re-calc when the gameState players length changes
    // (for example when seats are occupied/emptied, the layout shouldn't change,
    // but this ensures positions remain correct if table size changed due to UI updates)
    return () => {
      if (obs) obs.disconnect();
      else window.removeEventListener('resize', calculateSeats);
      if (retryId) { clearInterval(retryId); retryId = null; }
    };
  }, []);

  useEffect(() => {
    if (gameState.pot > previousPotRef.current) {
      maybePlaySound('chip');
    }
    previousPotRef.current = gameState.pot;
  }, [gameState.pot]);

  const previousMyHandLengthRef = useRef<number>(0);
  useEffect(() => {
    const myHand = gameState.playerHands && gameState.playerHands[myId] ? gameState.playerHands[myId] : [];
    if (myHand.length > previousMyHandLengthRef.current) {
      maybePlaySound('card');
    }
    previousMyHandLengthRef.current = myHand.length;
  }, [gameState.playerHands, myId]);

  const previousDealerRef = useRef<number | null>(null);
  useEffect(() => {
    if ((gameState as any).dealerSeat !== previousDealerRef.current && previousDealerRef.current != null) {
      maybePlaySound('dealer');
    }
    previousDealerRef.current = (gameState as any).dealerSeat ?? null;
  }, [gameState.dealerSeat]);

  useEffect(() => {
    if (gameState.communityCards.length > previousCommunityCardsLengthRef.current) {
      maybePlaySound('card');
    }
    previousCommunityCardsLengthRef.current = gameState.communityCards.length;
  }, [gameState.communityCards.length]);

  const joinGame = () => {
    if (nickname.trim()) {
      // Emit 'join' (backend listens for 'join'), include nickname
      socketRef.current?.emit('join', { nickname });
      maybePlaySound('join');
    }
  };

  // Join a specific seat while providing nickname
  const joinSeatAt = (seatNum: number) => {
    if (!connected) {
      setConnError(t('No server connection'));
      return;
    }
    if (!nickname || !nickname.trim()) {
      setConnError(t('Please enter nickname'));
      return;
    }
    // Show confirmation modal instead of immediately joining
    setConfirmSeat({ show: true, seat: seatNum });
  };

  const confirmSeatJoin = (seatNum?: number) => {
    if (!seatNum) return;
    socketRef.current?.emit('joinSeat', { name: nickname.trim(), seat: seatNum });
    maybePlaySound('join');
    setConfirmSeat({ show: false });
  };

  const cancelSeatJoin = () => {
    setConfirmSeat({ show: false });
  };

  const startGame = () => {
    socketRef.current?.emit('startGame');
    maybePlaySound('start');
  };

  const resetGame = () => {
    socketRef.current?.emit('resetGame');
    maybePlaySound('reset');
  };

  const sendMessage = () => {
    if (messageInput.trim() && socketRef.current) {
      socketRef.current.emit('sendMessage', { text: messageInput, name: nickname || myId || 'Anonymous' });
      setMessageInput('');
    }
  };

  console.log('Rendering App - connected:', connected, 'myId:', myId, 'gameState:', gameState);
  const mySeat = gameState.players.find((p: any) => p.id === myId)?.seat;
  const isSeated = !!mySeat;
  const isMyTurn = isSeated && (gameState.currentPlayer === mySeat);
  return (
    <div className="app">
      <div className="header">
        <div className="header-center">
          <img src={logo} alt="Hazardzik.pl Logo" className="logo" />
          <h1>Poker Table</h1>
          {myId && (
            <div className="chat">
              <div className="chat-messages">
                {messages.map((msg, i) => (
                  <div key={i} className="message">
                    <strong>{msg.name}:</strong> {msg.text}
                  </div>
                ))}
              </div>
              <div className="chat-input">
                <div>
                      <input
                        type="text"
                        value={messageInput}
                        onChange={(e) => setMessageInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                        placeholder={t('Message placeholder')}
                      />
                      <button onClick={sendMessage}>{t('Send')}</button>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="header-right">
            <div style={{display:'flex', alignItems:'center', gap: '8px'}}>
              <div>{t('SB')}: {gameState.smallBlind || 0} / {t('BB')}: {gameState.bigBlind || 0}</div>
            </div>
            <div style={{display:'flex', alignItems:'center', gap:'8px', marginLeft: '10px'}}>
              <label style={{display:'flex', alignItems:'center', gap:'6px', fontSize:'0.85rem'}}>
                <span>{t('Set Blind Level')}</span>
                <select disabled={!isAdmin} value={gameState.blindLevel ?? 0} onChange={(e) => { const lvl = Number(e.target.value); socketRef.current?.emit('setBlindLevel', lvl); }}>
                  {([0,1,2,3,4,5,6]).map((lvl) => (
                    <option key={lvl} value={lvl}>{'L' + lvl}</option>
                  ))}
                </select>
              </label>
              <label style={{display:'flex', alignItems:'center', gap:'6px'}}>
                <input disabled={!isAdmin} type="checkbox" checked={!!gameState.autoIncreaseBlinds} onChange={(e) => { socketRef.current?.emit('toggleAutoBlinds', e.target.checked); }} />
                <span style={{fontSize:'0.85rem'}}>{t('Auto Increase Blinds')}</span>
              </label>
              <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
                <button onClick={() => setSoundEnabled(!soundEnabled)} style={{padding: '6px 8px'}}>{soundEnabled ? t('Sounds On') : t('Sounds Off')}</button>
                <button onClick={() => maybePlaySound('chip')} style={{padding: '6px 8px'}}>{t('Test Sound')}</button>
              </div>
              <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
                {isAdmin ? (
                  <div style={{padding: '6px 8px', color: '#7fffd4'}}>Admin</div>
                ) : (
                  <>
                    <input type="password" placeholder="Admin password" value={adminPassword} onChange={(e)=>setAdminPassword(e.target.value)} style={{width: '120px'}} />
                    <button onClick={() => { requestAdmin(); setAdminPassword(''); }} style={{padding: '6px 8px'}}>{'Admin login'}</button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      {!connected && (
        <div className="connection-status">
          {connError ? (
            <div>
              <div>{connError}</div>
              <button onClick={() => { socketRef.current?.connect(); setConnError(''); }}>{t('Reconnect')}</button>
            </div>
          ) : (
            t('Connecting to server...')
          )}
        </div>
      )}
      {connected && !myId && (
          <div className="join-form">
          <div>
              {connError && <div className="join-error">{connError}</div>}
            <input
              type="text"
              placeholder={t('Enter Nickname')}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && joinGame()}
            />
            <button onClick={joinGame}>{t('Join Game')}</button>
          </div>
        </div>
      )}
      {myId && (
        <div className="game-area">
          <div className="game-container">
            <div className="game-content">
                <div className="players" ref={playersRef} style={{position: 'absolute', width: '100%', height: '100%', left: 0, top: 0, pointerEvents: 'none'}}>
                {Array.from({ length: 10 }, (_, i) => {
                  const seatNum = i + 1;
                  const player = gameState.players.find((p: any) => p.seat === seatNum);
                  const isCurrent = gameState.currentPlayer === seatNum;
                  const pos = seatPositions[i] || { left: 0, top: 0 };
                  // hidden seats logic for compact layout
                  const isHidden = pos.left === -9999 && pos.top === -9999;
                  return (
                    <div
                      key={seatNum}
                      className={`seat seat-${seatNum} ${isCurrent ? 'current' : ''} ${player ? 'occupied' : 'empty'} ${player && myId === player.id ? 'mine' : ''} ${isHidden ? 'hidden' : ''}`}
                      style={{
                        position: 'absolute',
                        left: `${pos.left}px`,
                        top: `${pos.top}px`,
                        transform: 'translate(-50%, -50%)',
                        pointerEvents: 'auto',
                      }}
                    >
                      {gameState.dealerSeat === seatNum && (
                        <div className="dealer-badge" title={t('Dealer')}>D</div>
                      )}
                      {gameState.smallBlindSeat === seatNum && (
                      <div className="smallblind-badge" title={t('Small Blind')}>SB</div>
                      )}
                      {gameState.bigBlindSeat === seatNum && (
                      <div className="bigblind-badge" title={t('Big Blind')}>BB</div>
                      )}
                      {player ? (
                        <div className="player-info">
                          <div className="player-name" title={player.name}>{player.name}</div>
                          <div className={`nick-bubble ${myId === player.id ? 'mine' : ''}`} title={player.name}>{getInitials(player.name)}</div>
                          <div className="player-chips-display">
                            <div className="chip-stack">
                              {Array.from({ length: Math.min(5, Math.floor(player.chips / 100)) }, (_, i) => (
                                <div key={i} className={`chip chip-${(i % 4) + 1}`}></div>
                              ))}
                            </div>
                            <div className="chip-count">{player.chips}</div>
                          </div>
                          {isCurrent && gameState.timer > 0 && <div className="timer">Timer: {gameState.timer}s</div>}
                        </div>
                      ) : (
                        <div className="empty-seat" onClick={() => joinSeatAt(seatNum)} title={t('Click to sit')}>{t('Empty Seat')}</div>
                      )}
                      {confirmSeat.show && (
                        <div className="modal-overlay" onClick={cancelSeatJoin}>
                          <div className="modal" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-title">{t('Confirm Join')}</div>
                            <div className="modal-body">{t('Confirm Join Body').replace('{seat}', String(confirmSeat.seat ?? ''))}</div>
                            <div className="modal-actions">
                              <button onClick={() => confirmSeatJoin(confirmSeat.seat)}>{t('Yes Join')}</button>
                              <button onClick={cancelSeatJoin}>{t('Cancel')}</button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                } ) }
              </div>
              <div className="table" ref={tableRef}>
                <div className="community-cards">
                  {gameState.communityCards && gameState.communityCards.map((card: any, index: number) => (
                    <div key={index} className="card">
                      {card.value} of {card.suit}
                    </div>
                  ))}
                </div>
                <div className="pot-display">
                  <div className="center-title">Hazardzik.pl</div>
                  <div className="pot-chips">
                    {Array.from({ length: Math.min(8, Math.floor((gameState.pot || 0) / 50)) }, (_, i) => (
                      <div key={i} className={`pot-chip chip-${(i % 4) + 1}`}></div>
                    ))}
                  </div>
                  <div className="pot-amount">{t('Pot')}: {gameState.pot || 0}</div>
                </div>
                <div className="phase-display">
                  <div className="phase-text">{t('Phase')}: {t(gameState.phase || 'waiting')}</div>
                  {gameState.timer > 0 && (
                    <div className="game-timer">{t('Time')}: {gameState.timer}s</div>
                  )}
                </div>
                <div>
                  {gameState.playerHands && gameState.playerHands[myId] && (
                    <div className="player-hand">
                      {t('Your Cards')}:
                      {gameState.playerHands[myId].map((card: any, index: number) => (
                        <div key={index} className="card">
                          {card.value} of {card.suit}
                        </div>
                      ))}
                    </div>
                  )}
                  {toast && <div className="toast">{toast}</div>}
                </div>
                {/* Removed duplicate .players container to avoid rendering seats twice.
                  The seats are rendered and positioned by the first players container above,
                  which is centered inside the table by CSS transform. Keeping only one
                  container prevents seats from appearing at the top-left of the page.
                */}
              </div>
              {/* Controls are rendered globally below so they remain visible for spectators */}
            </div>
          </div>
        </div>
      )}
      {/* Global controls: always visible but disabled for spectators */}
      <div className="controls" role="toolbar" aria-label="Game controls">
        <div style={{display: "flex", justifyContent: "space-between", gap: "16px"}}>
          <div>
            <div>
              <div className="controls-left">
                <div>
                  <div>
                    <button data-action="start" disabled={!isSeated || !connected} title={!connected ? t('No server connection') : !isSeated ? t('Please enter nickname') : ''} onClick={() => { if (!isSeated || !connected) return; startGame(); }}>{t('Start Game')}</button>
                    <button disabled={!isSeated || !connected} title={!isSeated ? t('Please enter nickname') : ''} onClick={() => { if (!isSeated || !connected) return; resetGame(); }}>{t('Reset')}</button>
                  </div>
                </div>
                <div className="controls-right">
                  <div>
                    <div>
                      <input
                        type="range"
                        min="10"
                        max={gameState.players.find(p => p.id === myId)?.chips || 1000}
                        value={betAmount}
                        onChange={(e) => setBetAmount(Number(e.target.value))}
                        style={{width: '200px'}}
                        disabled={!isSeated || !connected}
                        title={!isSeated ? t('Please enter nickname') : ''}
                      />
                      <input
                        type="number"
                        value={betAmount}
                        onChange={(e) => setBetAmount(Number(e.target.value))}
                        min="10"
                        max={gameState.players.find(p => p.id === myId)?.chips || 1000}
                        style={{width: '80px'}}
                        disabled={!isSeated || !connected}
                      />
                    </div>
                    <div>
                      {gameState.currentBet === 0 ? (
                          <>
                            <span className="tooltip-wrapper" data-tooltip={!connected ? t('No server connection') : !isSeated ? t('Please enter nickname') : !isMyTurn ? t('Not your turn') : ''}>
                              <button data-action="bet" disabled={!isSeated || !connected || !isMyTurn} aria-disabled={!isSeated || !connected || !isMyTurn} aria-label={t('Bet')} onMouseDown={animateBtn} onClick={() => { if (!isSeated || !connected || !isMyTurn) return; socketRef.current?.emit('bet', betAmount); maybePlaySound('bet'); }}>
                                {iconFor('Bet') && <img src={iconFor('Bet')} alt='' className='btn-icon' />} {t('Bet')}
                              </button>
                            </span>
                            <button disabled={!isSeated || !connected || !isMyTurn} title={!isSeated ? t('Please enter nickname') : !isMyTurn ? 'Not your turn' : ''} onClick={() => { if (!isSeated || !connected || !isMyTurn) return; socketRef.current?.emit('check'); maybePlaySound('tick'); }}>{t('Check')}</button>
                          </>
                        ) : (
                          <>
                            <span className="tooltip-wrapper" data-tooltip={!connected ? t('No server connection') : !isSeated ? t('Please enter nickname') : !isMyTurn ? t('Not your turn') : ''}>
                              <button data-action="raise" disabled={!isSeated || !connected || !isMyTurn} aria-disabled={!isSeated || !connected || !isMyTurn} aria-label={t('Raise')} onMouseDown={animateBtn} onClick={() => { if (!isSeated || !connected || !isMyTurn) return; socketRef.current?.emit('raise', betAmount); maybePlaySound('bet'); }}>
                                {iconFor('Raise') && <img src={iconFor('Raise')} alt='' className='btn-icon' />} {t('Raise')}
                              </button>
                            </span>
                            <span className="tooltip-wrapper" data-tooltip={!connected ? t('No server connection') : !isSeated ? t('Please enter nickname') : !isMyTurn ? t('Not your turn') : ''}>
                              <button data-action="call" disabled={!isSeated || !connected || !isMyTurn} aria-disabled={!isSeated || !connected || !isMyTurn} aria-label={t('Call')} onMouseDown={animateBtn} onClick={() => { if (!isSeated || !connected || !isMyTurn) return; socketRef.current?.emit('call'); maybePlaySound('bet'); }}>
                                {iconFor('Call') && <img src={iconFor('Call')} alt='' className='btn-icon' />} {t('Call')}
                              </button>
                            </span>
                          </>
                        )}
                      <span className="tooltip-wrapper" data-tooltip={!connected ? t('No server connection') : !isSeated ? t('Please enter nickname') : ''}>
                        <button data-action="fold" disabled={!isSeated || !connected} aria-disabled={!isSeated || !connected} aria-label={t('Fold')} onMouseDown={animateBtn} onClick={() => { if (!isSeated || !connected) return; socketRef.current?.emit('fold'); maybePlaySound('fold'); }}>
                          {iconFor('Fold') && <img src={iconFor('Fold')} alt='' className='btn-icon' />} {t('Fold')}
                        </button>
                      </span>
                      <span className="tooltip-wrapper" data-tooltip={!connected ? t('No server connection') : !isSeated ? t('Please enter nickname') : ''}>
                        <button data-action="allin" disabled={!isSeated || !connected} aria-disabled={!isSeated || !connected} aria-label={t('All In')} onMouseDown={animateBtn} onClick={() => { if (!isSeated || !connected) return; socketRef.current?.emit('allIn'); maybePlaySound('bet'); }}>
                          {iconFor('All In') && <img src={iconFor('All In')} alt='' className='btn-icon' />} {t('All In')}
                        </button>
                      </span>
                      <span className="tooltip-wrapper" data-tooltip={!connected ? t('No server connection') : !isSeated ? t('Please enter nickname') : ''}>
                        <button data-action="next" disabled={!isSeated || !connected} aria-disabled={!isSeated || !connected} aria-label={t('Next Phase')} onMouseDown={animateBtn} onClick={() => { if (!isSeated || !connected) return; socketRef.current?.emit('nextPhase'); maybePlaySound('next'); }}>
                          {iconFor('Next Phase') && <img src={iconFor('Next Phase')} alt='' className='btn-icon' />} {t('Next Phase')}
                        </button>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div style={{display:'flex', alignItems:'center', marginLeft: '10px'}}>
            {!isSeated && <div className="disabled-note" style={{color:'#ff9b9b', padding:'6px 8px', borderRadius:'8px', background:'rgba(0,0,0,0.4)'}}>{t('Please enter nickname')}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;








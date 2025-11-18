import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import './App.css';
import logo from './logo.png';

// Extend the global ImportMeta interface
declare global {
  interface ImportMetaEnv {
    readonly VITE_SOCKET_URL?: string;
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
  const [myId, setMyId] = useState('');
  const [connected, setConnected] = useState(false);
  const [connError, setConnError] = useState('');
  const [messages, setMessages] = useState<{name: string, text: string}[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const playersRef = useRef<HTMLDivElement>(null);
  const [seatPositions, setSeatPositions] = useState<{left: number, top: number}[]>([]);

  useEffect(() => {
    // create socket and attach handlers
    // Socket URL can be provided via Vite env `VITE_SOCKET_URL` (useful for ngrok tunneling).
    const socketUrl = (import.meta as any).env?.VITE_SOCKET_URL || 'http://localhost:8086';
    console.log('Connecting to socket URL:', socketUrl);
    const socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      timeout: 5000,
    });
    socketRef.current = socket;

    const onConnect = () => {
      console.log('Connected to server');
      setConnError('');
      setConnected(true);
    };
    const onDisconnect = () => {
      console.log('Disconnected from server');
      setConnected(false);
    };
    const onGameUpdate = (data: GameState) => {
      setGameState(data);
    };
    const onConnectError = (err: any) => {
      console.warn('Socket connect error', err);
      setConnError('Nie można połączyć z serwerem (socket)');
    };
    const onMessage = (data: any) => {
      setMessages(prev => [...prev, data]);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('gameUpdate', onGameUpdate);
    socket.on('connect_error', onConnectError);
    socket.on('message', onMessage);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('gameUpdate', onGameUpdate);
      socket.off('connect_error', onConnectError);
      socket.off('message', onMessage);
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    const calculateSeats = () => {
      if (playersRef.current) {
        const rect = playersRef.current.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const rx = centerX - 70; // - połowa szerokości seat
        const ry = centerY - 45; // - połowa wysokości seat
        const positions = [];
        for (let i = 0; i < 10; i++) {
          const angle = (i / 10) * 2 * Math.PI;
          const x = centerX + rx * Math.cos(angle);
          const y = centerY + ry * Math.sin(angle);
          positions.push({ left: x, top: y });
        }
        setSeatPositions(positions);
      }
    };
    calculateSeats();
    window.addEventListener('resize', calculateSeats);
    return () => window.removeEventListener('resize', calculateSeats);
  }, []);

  const joinGame = () => {
    if (nickname.trim()) {
      socketRef.current?.emit('joinGame', nickname);
      if (socketRef.current?.id) {
        setMyId(socketRef.current.id);
      }
      playSound('join');
    }
  };

  const startGame = () => {
    socketRef.current?.emit('startGame');
    playSound('start');
  };

  const resetGame = () => {
    socketRef.current?.emit('resetGame');
    playSound('reset');
  };

  const sendMessage = () => {
    if (messageInput.trim() && socketRef.current) {
      socketRef.current.emit('sendMessage', { text: messageInput, name: nickname || myId || 'Anonymous' });
      setMessageInput('');
    }
  };

  console.log('Rendering App - connected:', connected, 'myId:', myId, 'gameState:', gameState);
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
                <input
                  type="text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Wpisz wiadomość..."
                />
                <button onClick={sendMessage}>Wyślij</button>
              </div>
            </div>
          )}
        </div>
        <div className="header-right">
          {/* Future use */}
        </div>
      </div>
      {!connected && (
        <div className="connection-status">
          {connError ? (
            <div>
              <div>{connError}</div>
              <button onClick={() => { socketRef.current?.connect(); setConnError(''); }}>Ponów próbę</button>
            </div>
          ) : (
            'Łączenie z serwerem...'
          )}
        </div>
      )}
      {connected && !myId && (
        <div className="join-form">
          <input
            type="text"
            placeholder="Wpisz swój nick"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && joinGame()}
          />
          <button onClick={joinGame}>Dołącz do gry</button>
        </div>
      )}
      {myId && (
        <div className="game-area">
          <div className="game-container">
            <div className="game-content">
              <div className="players" ref={playersRef} style={{position: 'absolute', width: '100%', height: '100%', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none'}}>
                {Array.from({ length: 10 }, (_, i) => {
                  const seatNum = i + 1;
                  const player = gameState.players.find((p: any) => p.seat === seatNum);
                  const isCurrent = gameState.currentPlayer === seatNum;
                  const pos = seatPositions[i] || { left: 0, top: 0 };
                  return (
                    <div
                      key={seatNum}
                      className={`seat seat-${seatNum} ${isCurrent ? 'current' : ''} ${player ? 'occupied' : 'empty'}`}
                      style={{
                        position: 'absolute',
                        left: `${pos.left}px`,
                        top: `${pos.top}px`,
                        pointerEvents: 'auto',
                      }}
                    >
                      {player ? (
                        <div className="player-info">
                          <div className="player-name">{player.name}</div>
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
                        <div className="empty-seat">Puste miejsce</div>
                      )}
                    </div>
                  );
              <div className="table">
                <div className="community-cards">
                  {gameState.communityCards && gameState.communityCards.map((card: any, index: number) => (
                    <div key={index} className="card">
                      {card.value} of {card.suit}
                    </div>
                  ))}
                </div>
                <div className="pot-display">
                  <div className="pot-chips">
                    {Array.from({ length: Math.min(8, Math.floor((gameState.pot || 0) / 50)) }, (_, i) => (
                      <div key={i} className={`pot-chip chip-${(i % 4) + 1}`}></div>
                    ))}
                  </div>
                  <div className="pot-amount">Pot: {gameState.pot || 0}</div>
                </div>
                <div className="phase-display">
                  <div className="phase-text">Faza: {gameState.phase || 'waiting'}</div>
                  {gameState.timer > 0 && (
                    <div className="game-timer">Czas: {gameState.timer}s</div>
                  )}
                </div>
                <div>
                  {gameState.playerHands && gameState.playerHands[myId] && (
                    <div className="player-hand">
                      Twoje karty:
                      {gameState.playerHands[myId].map((card: any, index: number) => (
                        <div key={index} className="card">
                          {card.value} of {card.suit}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="players" ref={playersRef} style={{position: 'absolute', width: '100%', height: '100%', left: '0', top: '0', pointerEvents: 'none'}}>
                  {Array.from({ length: 10 }, (_, i) => {
                    const seatNum = i + 1;
                    const player = gameState.players.find((p: any) => p.seat === seatNum);
                    const isCurrent = gameState.currentPlayer === seatNum;
                    const pos = seatPositions[i] || { left: 0, top: 0 };
                    return (
                      <div
                        key={seatNum}
                        className={`seat seat-${seatNum} ${isCurrent ? 'current' : ''} ${player ? 'occupied' : 'empty'}`}
                        style={{
                          position: 'absolute',
                          left: `${pos.left}px`,
                          top: `${pos.top}px`,
                          pointerEvents: 'auto',
                        }}
                      >
                        {player ? (
                          <div className="player-info">
                            <div className="player-name">{player.name}</div>
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
                          <div className="empty-seat">Puste miejsce</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="controls" style={{display: "flex", justifyContent: "space-between", gap: "16px"}}>
                <div style={{display: "flex", justifyContent: "space-between", gap: "16px"}}>
                  <div className="controls-left">
                    <button onClick={startGame}>Rozpocznij grę</button>
                    <button onClick={resetGame}>Reset</button>
                  </div>
                  <div className="controls-right">
                    <div>
                      <input
                        type="number"
                        value={betAmount}
                        onChange={(e) => setBetAmount(Number(e.target.value))}
                        min="1"
                      />
                      <button onClick={() => { socketRef.current?.emit('raise', betAmount); playSound('bet'); }}>Raise</button>
                      <button onClick={() => { socketRef.current?.emit('call'); playSound('bet'); }}>Call</button>
                      <button onClick={() => { socketRef.current?.emit('fold'); playSound('fold'); }}>Fold</button>
                      <button onClick={() => { socketRef.current?.emit('allIn'); playSound('bet'); }}>All In</button>
                      <button onClick={() => { socketRef.current?.emit('nextPhase'); playSound('next'); }}>Następna faza</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;








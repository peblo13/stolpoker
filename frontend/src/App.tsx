import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import './App.css';

const VITE_SOCKET_URL = (import.meta as any).env?.VITE_SOCKET_URL || (window.location.hostname === 'peblo13.github.io' ? 'https://stolpoker-xw46qq.fly.dev' : 'http://localhost:8080');

interface Player {
  id: string;
  name: string;
  chips: number;
  cards: string[];
  position: number;
  isActive: boolean;
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
}

interface GameState {
  players: Player[];
  communityCards: string[];
  pot: number;
  currentPlayer: number;
  phase: 'pre-flop' | 'flop' | 'turn' | 'river' | 'showdown';
  dealerPosition: number;
  smallBlind: number;
  bigBlind: number;
}

function App() {
  console.log('App rendering');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [gameState, setGameState] = useState<GameState>({
    players: [],
    communityCards: [],
    pot: 0,
    currentPlayer: 0,
    phase: 'pre-flop',
    dealerPosition: 0,
    smallBlind: 10,
    bigBlind: 20,
  });
  const [playerName, setPlayerName] = useState('');
  const tableRef = useRef<HTMLDivElement | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [currentBet, setCurrentBet] = useState(0);
  const [selectedPosition, setSelectedPosition] = useState(0);
  const [isJoined, setIsJoined] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);
  const [turnTimeLeft, setTurnTimeLeft] = useState<number>(0);
  const [turnPlayerId, setTurnPlayerId] = useState<string | null>(null);

  useEffect(() => {
    const newSocket = io(VITE_SOCKET_URL);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setIsConnected(true);
      console.log('Connected to server');
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
      console.log('Disconnected from server');
    });

    newSocket.on('gameState', (state: GameState) => {
      setGameState(state);
    });

    // on join, server returns player object with id
    newSocket.on('joined', (player: any) => {
      // store our assigned id
      if (player && player.id) {
        setMyId(player.id);
      }
      setIsJoined(true);
    });

    newSocket.on('error', (msg: string) => {
      alert(msg);
    });

    newSocket.on('turnTimer', (payload: { playerId: string, timeLeft: number }) => {
      setTurnPlayerId(payload.playerId);
      setTurnTimeLeft(payload.timeLeft);
    });

    return () => {
      newSocket.close();
    };
  }, []);

  const joinGame = () => {
    if (socket && playerName.trim() && playerName.length >= 2) {
      socket.emit('joinGame', { name: playerName.trim(), position: selectedPosition });
    }
  };

  const fold = () => {
    if (socket) {
      socket.emit('fold');
    }
  };

  const call = () => {
    if (socket) {
      socket.emit('call');
    }
  };

  const raise = () => {
    if (socket && currentBet > 0) {
      socket.emit('raise', { amount: currentBet });
    }
  };

  const myPlayer = myId ? gameState.players.find(p => p.id === myId) : undefined;
  const isMyTurn = !!myPlayer && myPlayer.position === gameState.currentPlayer;

  const renderPlayerSeats = () => {
    const seats = [];
    const container = tableRef.current;
    const containerSize = container ? Math.min(container.offsetWidth, container.offsetHeight) : 800;
    const seatOffset = 80; // space from edge for seat
    const radius = Math.max(100, Math.floor(containerSize / 2 - seatOffset));
    for (let i = 0; i < 10; i++) {
      const player = gameState.players.find(p => p.position === i);
      const angle = (i * 36) - 90 + 18; // 36 degrees apart, starting from top-left-ish
      const radian = (angle * Math.PI) / 180;
      const x = Math.cos(radian) * radius;
      const y = Math.sin(radian) * radius;

      seats.push(
        <div
          key={i}
          className="player-seat"
          style={{
            top: '50%',
            left: '50%',
            transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
          }}
        >
          {player ? (
            <>
              <div className="player-name">{player.name}</div>
              <div className="player-chips">${player.chips}</div>
              {player.cards.length > 0 && (
                <div className="player-cards">
                  {player.cards.map((card, idx) => (
                    <div key={idx} className="card">{card}</div>
                  ))}
                </div>
              )}
              {player.isActive && <div className="glow"></div>}
              {turnPlayerId === player?.id && (
                <div className="seat-timer">{turnTimeLeft}s</div>
              )}
            </>
          ) : (
            <div className="player-name empty-seat">Empty Seat</div>
          )}
        </div>
      );
    }
    return seats;
  };

  if (!isConnected) {
    return (
      <div className="poker-table" ref={tableRef}>
        <div className="table-center">
          <h1>Connecting to Poker Server...</h1>
        </div>
      </div>
    );
  }

  if (!isJoined) {
    return (
      <div className="poker-table" ref={tableRef}>
        <div className="table-center">
          <h1>Enter Your Name</h1>
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && joinGame()}
            placeholder="Player Name"
          />
          <select
            value={selectedPosition}
            onChange={(e) => setSelectedPosition(Number(e.target.value))}
          >
            {Array.from({ length: 10 }, (_, i) => (
              <option key={i} value={i} disabled={gameState.players.some(p => p.position === i)}>
                Position {i + 1} {gameState.players.some(p => p.position === i) ? '(Taken)' : ''}
              </option>
            ))}
          </select>
          <button className="btn" onClick={joinGame} disabled={!playerName.trim() || playerName.length < 2}>Join Game</button>
        </div>
      </div>
    );
  }

  return (
    <div className="poker-table" ref={tableRef}>
      <div className="logo">
        <img src="/hazardzik.png" alt="Hazardzik Logo" />
      </div>
      <div className="player-seats">
        {renderPlayerSeats()}
      </div>
      <div className="table-center">
        <div className="community-cards">
          {gameState.communityCards.map((card, idx) => (
            <div key={idx} className="card">{card}</div>
          ))}
        </div>
        <div>Pot: ${gameState.pot}</div>
        <div>Phase: {gameState.phase}</div>
      </div>
      <div className="controls">
        <button className="btn" onClick={fold} disabled={!isMyTurn}>Fold</button>
        <button className="btn" onClick={call} disabled={!isMyTurn}>Call</button>
        <input
          type="number"
          value={currentBet}
          onChange={(e) => setCurrentBet(Number(e.target.value))}
          placeholder="Bet Amount"
          style={{ width: '80px', marginRight: '10px' }}
        />
        <button className="btn" onClick={raise} disabled={!isMyTurn}>Raise</button>
      </div>
    </div>
  );
}

export default App;
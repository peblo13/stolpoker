import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import './App.css';

const VITE_SOCKET_URL = (import.meta as any).env?.VITE_SOCKET_URL || 'http://localhost:8080';

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
  const [isConnected, setIsConnected] = useState(false);
  const [currentBet, setCurrentBet] = useState(0);

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

    return () => {
      newSocket.close();
    };
  }, []);

  const joinGame = () => {
    if (socket && playerName) {
      socket.emit('joinGame', { name: playerName });
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

  const renderPlayerSeats = () => {
    const seats = [];
    for (let i = 0; i < 10; i++) {
      const player = gameState.players.find(p => p.position === i);
      const angle = (i * 36) - 90; // 36 degrees apart, starting from top
      const radian = (angle * Math.PI) / 180;
      const radius = 250;
      const x = Math.cos(radian) * radius;
      const y = Math.sin(radian) * radius;

      seats.push(
        <div
          key={i}
          className="player-seat"
          style={{
            transform: `translate(${x}px, ${y}px) rotate(${angle + 90}deg)`,
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
            </>
          ) : (
            <div className="player-name">Empty</div>
          )}
        </div>
      );
    }
    return seats;
  };

  if (!isConnected) {
    return (
      <div className="poker-table">
        <div className="table-center">
          <h1>Connecting to Poker Server...</h1>
        </div>
      </div>
    );
  }

  if (!playerName) {
    return (
      <div className="poker-table">
        <div className="table-center">
          <h1>Enter Your Name</h1>
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Player Name"
            style={{ margin: '10px', padding: '5px' }}
          />
          <button className="btn" onClick={joinGame}>Join Game</button>
        </div>
      </div>
    );
  }

  return (
    <div className="poker-table">
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
        <button className="btn" onClick={fold}>Fold</button>
        <button className="btn" onClick={call}>Call</button>
        <input
          type="number"
          value={currentBet}
          onChange={(e) => setCurrentBet(Number(e.target.value))}
          placeholder="Bet Amount"
          style={{ width: '80px', marginRight: '10px' }}
        />
        <button className="btn" onClick={raise}>Raise</button>
      </div>
    </div>
  );
}

export default App;
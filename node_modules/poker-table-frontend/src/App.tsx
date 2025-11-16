import { useState, useEffect } from 'react';
import io from 'socket.io-client';
import './App.css';
import logo from './logo.png';

const socket = io('http://localhost:3004');

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

  useEffect(() => {
    socket.on('connect', () => {
      console.log('Connected to server');
      if (socket.id) {
        setMyId(socket.id);
      }
      setConnected(true);
    });
    socket.on('disconnect', () => {
      console.log('Disconnected from server');
      setConnected(false);
    });
    socket.on('gameUpdate', (data: GameState) => {
      setGameState(data);
    });

    return () => {
      socket.off('gameUpdate');
      socket.off('connect');
      socket.off('disconnect');
    };
  }, []);

  useEffect(() => {
    if (gameState.timer > 0 && gameState.timer < 30) {
      playSound('tick');
    }
  }, [gameState.timer]);

  const joinGame = () => {
    if (nickname.trim()) {
      socket.emit('joinGame', nickname);
      playSound('join');
    }
  };

  const startGame = () => {
    socket.emit('startGame');
    playSound('start');
  };

  const resetGame = () => {
    socket.emit('resetGame');
    playSound('reset');
  };

  return (
    <div className="app">
      <img src={logo} alt="Hazardzik.pl Logo" className="logo" />
      <h1>Poker Table</h1>
      {!connected && <div className="connection-status">Łączenie z serwerem...</div>}
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
        <div className="game-container">
          <div className="players">
            {Array.from({ length: 6 }, (_, seatNum) => {
              const player = gameState.players.find((p: any) => p.seat === seatNum);
              const isCurrent = gameState.currentPlayer === seatNum;
              return (
                <div key={seatNum} className={`player ${isCurrent ? 'current' : ''} ${player ? 'occupied' : 'empty'}`}>
                  {player ? (
                    <>
                      <div className="player-name">{player.name}</div>
                      <div className="player-chips">Żetony: {player.chips}</div>
                      {isCurrent && gameState.timer > 0 && <div className="timer">Timer: {gameState.timer}s</div>}
                    </>
                  ) : (
                    <div className="empty-seat">Puste miejsce</div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="table">
            <div className="community-cards">
              {gameState.communityCards && gameState.communityCards.map((card: any, index: number) => (
                <div key={index} className="card">
                  {card.value} of {card.suit}
                </div>
              ))}
            </div>
            <div className="pot">Pot: {gameState.pot || 0}</div>
            <div className="phase">Faza: {gameState.phase || 'waiting'}</div>
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
          <div className="controls">
            <button onClick={startGame}>Rozpocznij grę</button>
            <button onClick={resetGame}>Reset</button>
            <input
              type="number"
              value={betAmount}
              onChange={(e) => setBetAmount(Number(e.target.value))}
              min="1"
            />
            <button onClick={() => { socket.emit('raise', betAmount); playSound('bet'); }}>Raise</button>
            <button onClick={() => { socket.emit('call'); playSound('bet'); }}>Call</button>
            <button onClick={() => { socket.emit('fold'); playSound('fold'); }}>Fold</button>
            <button onClick={() => { socket.emit('allIn'); playSound('bet'); }}>All In</button>
            <button onClick={() => { socket.emit('nextPhase'); playSound('next'); }}>Następna faza</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;








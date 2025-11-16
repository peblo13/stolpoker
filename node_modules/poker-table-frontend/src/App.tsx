import { useState, useEffect } from 'react';
import io from 'socket.io-client';
import './App.css';
import logo from './hazardzik.pl.png';

const socket = io('http://localhost:3002');

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
  const [players, setPlayers] = useState([]);
  const [gameState, setGameState] = useState({});
  const [nickname, setNickname] = useState('');
  const [betAmount, setBetAmount] = useState(10);
  const [myId, setMyId] = useState('');
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    socket.on('connect', () => {
      console.log('Connected to server');
      setMyId(socket.id);
      setConnected(true);
    });
    socket.on('disconnect', () => {
      console.log('Disconnected from server');
      setConnected(false);
    });
    socket.on('gameUpdate', (data) => {
      setGameState(data);
    });

    return () => {
      socket.off('gameUpdate');
      socket.off('connect');
      socket.off('disconnect');
    };
  }, []);

  useEffect(() => {
    if (gameState.timer > 0 && gameState.timer < 30) { // Play tick sound when timer is running
      playSound('tick');
    }
  }, [gameState.timer]);

  return (
    <div className="App">
      <img src={logo} alt="Hazardzik.pl Logo" className="logo" />
      <h1>Poker Table</h1>
      <div>Status: {connected ? 'Połączony' : 'Rozłączony'}</div>
      <div className="table">
        <div className="table-title">Hazardzik.pl</div>
        <div className="dealer">Krupier</div>
        {[...Array(10)].map((_, i) => {
          const seatNum = i + 1;
          const player = (gameState.players || []).find(p => p.seat === seatNum);
          const isCurrent = false; // gameState.players && gameState.players[gameState.currentPlayer] && gameState.players[gameState.currentPlayer].seat === seatNum;
          return (
            <div key={seatNum} className={`seat seat-${seatNum}`}>
              {player ? `${player.name} (${player.chips})` : ''}
              {isCurrent && gameState.timer > 0 && <div className="timer">Timer: {gameState.timer}s</div>}
            </div>
          );
        })}
        <div className="community-cards">
          {gameState.communityCards && gameState.communityCards.map((card, index) => (
            <div key={index} className="card">{card.value} {card.suit}</div>
          ))}
        </div>
        <div className="pot">Pot: {gameState.pot || 0}</div>
        <div className="phase">Faza: {gameState.phase || 'waiting'}</div>
      </div>
      <div className="my-hand">
        {gameState.playerHands && gameState.playerHands[myId] && gameState.playerHands[myId].map((card, index) => (
          <div key={index} className="card">{card.value} {card.suit}</div>
        ))}
      </div>
      <div className="controls-left">
        <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Wpisz nick" />
        <button onClick={() => { if (nickname.trim()) { alert('Wysyłanie joinGame z ' + nickname); socket.emit('joinGame', nickname); playSound('join'); } }}>Dołącz do gry</button>
        <button onClick={() => { socket.emit('resetGame'); playSound('reset'); }}>Reset gry</button>
        <button onClick={() => { socket.emit('startGame'); playSound('start'); }}>Rozpocznij grę</button>
      </div>
      <div className="controls-right">
        <input type="number" min="10" value={betAmount} onChange={(e) => setBetAmount(Math.max(10, parseInt(e.target.value) || 10))} placeholder="Kwota zakładu" />
        <button onClick={() => { socket.emit('bet', betAmount); playSound('bet'); }}>Bet</button>
        <button onClick={() => { socket.emit('raise', betAmount); playSound('bet'); }}>Raise</button>
        <button onClick={() => { socket.emit('call'); playSound('bet'); }}>Call</button>
        <button onClick={() => { socket.emit('fold'); playSound('fold'); }}>Fold</button>
        <button onClick={() => { socket.emit('allIn'); playSound('bet'); }}>All In</button>
        <button onClick={() => { socket.emit('nextPhase'); playSound('next'); }}>Następna faza</button>
      </div>
    </div>
  );
}

export default App;








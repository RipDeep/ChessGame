const express = require("express");
const socket = require("socket.io");
const http = require("http");
const { Chess } = require("chess.js");
const path = require("path");

const app = express();
const rooms = {}; // store room info

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);
const io = socket(server);

const chess = new Chess();
let players = {};
let currentPlayer = "w";

app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.render("index", { title: "Chess Game" });
});

app.get("/game", (req, res) => {
  res.render("game", { title: "Chess Game" });
});

app.get("/game-ai", (req, res) => {
  res.render("game-ai", { title: "Play vs Computer" });
});

// Step 1: Friend invites from here
app.get("/game-friend", (req, res) => {
  res.render("game-friend", { title: "Chess Game - Play with Friend" });
});

// Step 2: Friends actually play here
app.get("/game/:roomId", (req, res) => {
  res.render("game-friend", {
    title: "Chess Game - Play with Friend",
    roomId: req.params.roomId,
  });
});

// const games = {};
let roomCounter = 1;


let matchmakingQueue = []; // array of socket IDs waiting for a match
let gameCounter = 1;
const games = {}; // store active games



io.on("connection", (socket) => {
// Add the player to the matchmaking queue
  matchmakingQueue.push(socket);

    tryToStartGame();

  // Find a game with only 1 player
  // let assignedRoom = null;
  // for (let roomId in games) {
  //   const game = games[roomId];
  //   if (Object.keys(game.players).length === 1) {
  //     assignedRoom = roomId;
  //     break;
  //   }
  // }

  // // If no room, create new
  // if (!assignedRoom) {
  //   assignedRoom = `room${roomCounter++}`;
  //   games[assignedRoom] = {
  //     players: {},
  //     chess: new Chess(),
  //     currentPlayer: "w",
  //   };
  // }

  // const game = games[assignedRoom];

  // // Assign role
  // let role = !game.players.w ? "w" : "b";
  // game.players[role] = socket.id;

  // socket.join(assignedRoom);
  // socket.emit("playerRole", role);




  function tryToStartGame() {
  while (matchmakingQueue.length >= 2) {
    const player1 = matchmakingQueue.shift();
    const player2 = matchmakingQueue.shift();

    const roomId = `game${gameCounter++}`;
    const chess = new Chess();

    games[roomId] = {
      chess,
      currentPlayer: "w",
      players: {
        w: player1.id,
        b: player2.id,
      },
    };

    player1.join(roomId);
    player2.join(roomId);

    player1.roomId = roomId;
    player2.roomId = roomId;

    player1.role = "w";
    player2.role = "b";

    // Notify players
    player1.emit("playerRole", "w");
    player2.emit("playerRole", "b");

    io.to(roomId).emit("gameReady");
    io.to(roomId).emit("boardState", chess.fen());
    io.to(roomId).emit("switchTurn", "w");

    console.log(`Started game ${roomId} between ${player1.id} (w) and ${player2.id} (b)`);
  }
}






  socket.on("joinFriendRoom", ({ roomId }) => {
    if (!rooms[roomId]) {
      rooms[roomId] = {
        players: [],
        chess: new Chess(),
        currentTurn: "w",
        timeoutCount: { w: 0, b: 0 },
      };
    }

    const room = rooms[roomId];

    // Assign role
    let role;
    if (room.players.length === 0) role = "w"; // host
    else if (room.players.length === 1) role = "b"; // opponent
    else role = "spectator"; // extra viewers

    room.players.push({ id: socket.id, role });
    socket.join(roomId);
    socket.roomId = roomId;
    socket.role = role;

    socket.emit("playerRole", role);
    if (role === "b") socket.to(roomId).emit("friendJoined"); // notify host

    
  });

  socket.on("friendMove", ({ roomId, from, to, promotion }) => {
    const game = rooms[roomId];
    if (!game) return;

    // 🛡️ Prevent out-of-turn move
    const playerRole = game.players.find((p) => p.id === socket.id)?.role;
    if (playerRole !== game.chess.turn()) {
      console.warn(`⚠️ ${playerRole} tried to move out of turn in ${roomId}`);
      socket.emit("boardState", game.chess.fen());
      return;
    }

    const moveObj = { from, to, promotion };
    const result = game.chess.move(moveObj);

    if (!result) {
      console.warn(`❌ Invalid move attempt in room ${roomId}:`, moveObj);
      socket.emit("boardState", game.chess.fen());
      return;
    }

   
    io.to(roomId).emit("friendMove", moveObj);
    io.to(roomId).emit("boardState", game.chess.fen());
  });

  socket.on("playerSkippedTurn", ({ roomId, skippedTurn, nextTurn }) => {
    if (!rooms[roomId]) return;
    const game = rooms[roomId];

    game.currentTurn = nextTurn;

    // ✅ Flip the turn inside the actual chess engine
    const parts = game.chess.fen().split(" ");
    parts[1] = nextTurn; // 'w' or 'b'
    game.chess.load(parts.join(" "));



    // ✅ Send update to all players
    io.to(roomId).emit("playerSkippedTurn", { skippedTurn, nextTurn });

    // ✅ Sync all clients to the correct FEN
    io.to(roomId).emit("boardState", game.chess.fen());
  });

  socket.on("startGame", ({ roomId }) => {
    io.to(roomId).emit("gameReady");
    io.to(roomId).emit("hideOverlay");
  });

  socket.on("switchTurn", (newTurn) => {
    if (!socket.roomId) return; // safety check
    socket.to(socket.roomId).emit("switchTurn", newTurn);
  });

  socket.on("gameOver", ({ roomId, winner, reason }) => {
    if (!rooms[roomId]) return;

    

    io.to(roomId).emit("gameOver", { winner, reason });

    // Disconnect everyone in the room after 2 seconds
    setTimeout(() => {
      const room = io.sockets.adapter.rooms.get(roomId);
      if (room) {
        for (const socketId of room) {
          const client = io.sockets.sockets.get(socketId);
          if (client) client.disconnect(true);
        }
      }
    }, 2000);
  });

  // if (Object.keys(game.players).length === 2) {
  //   io.to(assignedRoom).emit("gameReady");

  //   io.to(assignedRoom).emit("boardState", game.chess.fen());
  //   io.to(assignedRoom).emit("switchTurn", "w");
  // } else {
  //   socket.emit("gameNotReady");
  // }

  socket.on("gameNotReady", () => {
    gameActive = false;
    turnIndicator.textContent = "⏳ Waiting for opponent...";
    turnIndicator.style.backgroundColor = "#60a5fa"; // blue
    renderBoard();
  });


socket.on("gameOverForGame", ({roomId, winner, reason }) => {
  // io.emit("gameOver", { winner, reason });

  io.to(roomId).emit("gameOver", { winner, reason });
  
});

  

  socket.on("gameReady", () => {
    turnIndicator.textContent = "Opponent joined! Starting game...";
    turnIndicator.style.backgroundColor = "#facc15"; // gold

    setTimeout(() => {
      gameActive = true;
      renderBoard();
      startTimer(); // start timer automatically
      updateTurnIndicator();
    }, 2000); // 2s delay for effect
  });
socket.on("move", (move) => {
  const roomId = socket.roomId;
  if (!roomId) return; // socket not in a game

  const game = games[roomId];
  if (!game) return; // game not found (maybe ended)

  // Check if it's the player's turn
  if (game.currentPlayer !== socket.role) {
    socket.emit("invalidMove", move);
    return;
  }

  // Attempt the move
  const result = game.chess.move(move);
  if (!result) {
    socket.emit("invalidMove", move);
    return;
  }

  // Update whose turn it is
  game.currentPlayer = game.chess.turn(); // chess.js auto switches turn

  // Broadcast the move and updated board to both players
  io.to(roomId).emit("move", move);
  io.to(roomId).emit("boardState", game.chess.fen());
  io.to(roomId).emit("switchTurn", game.currentPlayer);

  // Check for checkmate
if (game.chess.isCheckmate()) {  // ✅ correct camelCase
  io.to(roomId).emit("gameOver", {
    winner: socket.role,
    reason: "Checkmate",
  });
  cleanupRoom(roomId);
}

// Optional: handle draw / stalemate
if (game.chess.isDraw() || game.chess.isStalemate()) {
  io.to(roomId).emit("gameOver", {
    winner: null,
    reason: "Draw",
  });
  cleanupRoom(roomId);
}

});


  socket.on("timeUp", ({ player }) => {
    if (player !== game.currentPlayer) return;

    game.currentPlayer = game.currentPlayer === "w" ? "b" : "w";
    const parts = game.chess.fen().split(" ");
    parts[1] = game.currentPlayer;
    game.chess.load(parts.join(" "));

    io.to(assignedRoom).emit("boardState", game.chess.fen());
    io.to(assignedRoom).emit("switchTurn", game.currentPlayer);
  });

socket.on("disconnect", () => {
  // Remove from matchmaking queue
  matchmakingQueue = matchmakingQueue.filter((s) => s.id !== socket.id);

  const roomId = socket.roomId;
  if (!roomId) return;

  // --- Handle random/matchmaking games ---
  if (games[roomId]) {
    const game = games[roomId];
    const opponentRole = socket.role === "w" ? "b" : "w";

    io.to(roomId).emit("gameOver", {
      winner: opponentRole,
      reason: "Opponent disconnected",
    });

    cleanupRoom(roomId); // removes the game from games[]
    return;
  }

  // --- Handle friend rooms ---
  if (rooms[roomId]) {
    const room = rooms[roomId];
    const player = room.players.find((p) => p.id === socket.id);
    if (player) {
      // Remove the player
      room.players = room.players.filter((p) => p.id !== socket.id);
    }

    if (room.gameOver) return;

    if (room.players.length === 1) {
      const opponent = room.players[0];
      io.to(opponent.id).emit("gameOver", {
        winner: opponent.role,
        reason: "Opponent disconnected",
      });
      room.gameOver = true;

      // Optional cleanup
      setTimeout(() => {
        const client = io.sockets.sockets.get(opponent.id);
        if (client) client.disconnect(true);
        delete rooms[roomId];
      }, 5000);
    } else {
      // No players left, just delete the room
      delete rooms[roomId];
    }
  }
});


  function cleanupRoom(roomId) {
    const game = games[roomId];
    if (!game) return;

    for (let role in game.players) {
      const sock = io.sockets.sockets.get(game.players[role]);
      if (sock) {
        sock.leave(roomId);
        delete sock.roomId;
        delete sock.role;
      }
    }
    delete games[roomId];
  }
});

server.listen(PORT, function () {
  console.log("Listening on", PORT);
});
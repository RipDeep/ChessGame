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

const games = {};
let roomCounter = 1;

io.on("connection", (socket) => {


  // Find a game with only 1 player
  let assignedRoom = null;
  for (let roomId in games) {
    const game = games[roomId];
    if (Object.keys(game.players).length === 1) {
      assignedRoom = roomId;
      break;
    }
  }

  // If no room, create new
  if (!assignedRoom) {
    assignedRoom = `room${roomCounter++}`;
    games[assignedRoom] = {
      players: {},
      chess: new Chess(),
      currentPlayer: "w",
    };
  }

  const game = games[assignedRoom];

  // Assign role
  let role = !game.players.w ? "w" : "b";
  game.players[role] = socket.id;

  socket.join(assignedRoom);
  socket.emit("playerRole", role);

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

  if (Object.keys(game.players).length === 2) {
    io.to(assignedRoom).emit("gameReady");

    io.to(assignedRoom).emit("boardState", game.chess.fen());
    io.to(assignedRoom).emit("switchTurn", "w");
  } else {
    socket.emit("gameNotReady");
  }

  socket.on("gameNotReady", () => {
    gameActive = false;
    turnIndicator.textContent = "⏳ Waiting for opponent...";
    turnIndicator.style.backgroundColor = "#60a5fa"; // blue
    renderBoard();
  });

socket.on("gameOverForGame", ({ winner, reason }) => {
  io.emit("gameOver", { winner, reason });
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
    if (game.chess.turn() !== role[0]) return;
    const result = game.chess.move(move);
    if (result) {
      game.currentPlayer = game.chess.turn();
      io.to(assignedRoom).emit("move", move);
      io.to(assignedRoom).emit("boardState", game.chess.fen());
      io.to(assignedRoom).emit("switchTurn", game.currentPlayer);
    } else {
      socket.emit("invalidMove", move);
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
    const opponentRole = role === "w" ? "b" : "w";

    if (socket.roomId || rooms[socket.roomId]) {
      const room = rooms[socket.roomId];
      const opponent = room.players.find((p) => p.id !== socket.id);
      const playerRole = socket.role;

      if (room.gameOver) return;

      if (opponent) {
        room.gameOver = true; // mark it
        io.to(room.socketRoom).emit("gameOver", {
          winner: opponent.role,
          reason: "Opponent disconnected",
        });
      }

      // Remove player from room
      room.players = room.players.filter((p) => p.id !== socket.id);
      if (room.players.length === 0) delete rooms[socket.roomId];
    }

    if (game.players[opponentRole]) {
      io.to(assignedRoom).emit("gameOver", {
        winner: opponentRole,
        reason: "disconnect",
      });
    }
    delete game.players[role];
    if (Object.keys(game.players).length === 0) delete games[assignedRoom];
  });
});

server.listen(PORT, function () {
  console.log("Listening on", PORT);
});

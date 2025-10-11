const express = require("express");
const socket = require("socket.io");
const http = require("http");
const { Chess } = require("chess.js");
const path = require("path");
const { title } = require("process");

const app = express();

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




const checkGameReady = () => {
  if (players.white && players.black) {
    io.emit("gameReady"); // both players connected
  } else {
    io.emit("gameNotReady"); // wait for players
  }
};




const games = {};
let roomCounter = 1;

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

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
    if (game.players[opponentRole]) {
      io.to(assignedRoom).emit("gameOver", { winner: opponentRole, reason: "disconnect" });
    }
    delete game.players[role];
    if (Object.keys(game.players).length === 0) delete games[assignedRoom];
  });
});

server.listen(PORT, function () {
  console.log("Listening on", PORT);
});

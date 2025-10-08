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

io.on("connection", function (uniquesocket) {
  console.log("Connected");

  if (!players.white) {
    players.white = uniquesocket.id;
    uniquesocket.emit("playerRole", "w");
  } else if (!players.black) {
    players.black = uniquesocket.id;
    uniquesocket.emit("playerRole", "b");
  } else {
    uniquesocket.emit("spectatorRole");
  }

  checkGameReady();

  uniquesocket.on("disconnect", function () {
    console.log("Player disconnected:", uniquesocket.id);

    let leavingPlayer = null;
    if (uniquesocket.id === players.white) leavingPlayer = "w";
    if (uniquesocket.id === players.black) leavingPlayer = "b";

    // Remove leaving player
    if (leavingPlayer === "w") delete players.white;
    if (leavingPlayer === "b") delete players.black;

    // If opponent exists, declare them winner

    if (leavingPlayer) {
      let winner = leavingPlayer === "w" ? "b" : "w";
      io.emit("gameOver", { winner, reason: "disconnect" });
      resetGame();
    }

    checkGameReady();
  });

  const resetGame = () => {
  chess.reset();
  currentPlayer = "w";
  io.emit("boardState", chess.fen());
  io.emit("switchTurn", currentPlayer);
};




  uniquesocket.on("move", (move) => {
    try {
      if (chess.turn() === "w" && uniquesocket.id !== players.white) {
        return;
      }
      if (chess.turn() === "b" && uniquesocket.id !== players.black) {
        return;
      }

      const result = chess.move(move);
      if (result) {
        currentPlayer = chess.turn();
        io.emit("move", move);
        io.emit("boardState", chess.fen());
        io.emit("switchTurn", currentPlayer);
      } else {
        console.log("Invalid move: ", move);
        uniquesocket.emit("invalidMove", move);
      }
    } catch (err) {
      console.log("Error: ", err);
      uniquesocket.emit("Invalid move: ", move);
    }
  });

  uniquesocket.on("timeUp", ({ player }) => {
    try {
      if (player !== currentPlayer) return;

      // Switch turn
      currentPlayer = currentPlayer === "w" ? "b" : "w";

      const parts = chess.fen().split(" ");
      parts[1] = currentPlayer;
      const newFen = parts.join(" ");
      chess.load(newFen);

      io.emit("boardState", chess.fen());
      io.emit("switchTurn", currentPlayer);
    } catch (err) {
      console.log("Error: ", err);
    }
  });
});

server.listen(PORT, function () {
  console.log("Listening on", PORT);
});

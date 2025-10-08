const socket = io();
const chess = new Chess();

const boardElement = document.querySelector(".chessboard");
let draggedPiece = null;
let sourceSquare = null;
let playerRole = null;
let gameActive = false;

let currentTurn = "w"; // chess.js starts with white
let timerInterval = null;
let timeLeft = 45;
const timerElement = document.getElementById("timer");
const turnIndicator = document.getElementById("turn-indicator");

const renderBoard = () => {
  const board = chess.board();
  boardElement.innerHTML = "";
  board.forEach((row, rowindex) => {
    row.forEach((square, squareindex) => {
      const squareElement = document.createElement("div");
      squareElement.classList.add(
        "square",
        (rowindex + squareindex) % 2 === 0 ? "light" : "dark"
      );

      squareElement.dataset.row = rowindex;
      squareElement.dataset.col = squareindex;

      if (square) {
        const pieceElement = document.createElement("div");
        pieceElement.classList.add(
          "piece",
          square.color === "w" ? "white" : "black"
        );

        pieceElement.innerText = getPieceUnicode(square);
        pieceElement.draggable = gameActive && playerRole === currentTurn;

        pieceElement.addEventListener("dragstart", (e) => {
          if (!gameActive) return;
          if (playerRole !== currentTurn || square.color !== playerRole) {
            e.preventDefault();
            return;
          }
          draggedPiece = pieceElement;
          sourceSquare = { row: rowindex, col: squareindex };
          e.dataTransfer.setData("text/plain", "");
        });
        pieceElement.addEventListener("dragend", (e) => {
          draggedPiece = null;
          sourceSquare = null;
        });

        squareElement.appendChild(pieceElement);
      }

      squareElement.addEventListener("dragover", (e) => {
        e.preventDefault();
      });

      squareElement.addEventListener("drop", (e) => {
        e.preventDefault();
        if (draggedPiece) {
          const targetSource = {
            row: parseInt(squareElement.dataset.row),
            col: parseInt(squareElement.dataset.col),
          };
          handleMove(sourceSquare, targetSource);
        }
      });
      boardElement.appendChild(squareElement);
    });
  });

  if (playerRole === "b") {
    boardElement.classList.add("flipped");
  } else {
    boardElement.classList.remove("flipped");
  }
};
const handleMove = (source, target) => {
  if (!gameActive) return;
  const move = {
    from: `${String.fromCharCode(97 + source.col)}${8 - source.row}`,
    to: `${String.fromCharCode(97 + target.col)}${8 - target.row}`,
    promotion: "q",
  };

  socket.emit("move", move);
};
const getPieceUnicode = (piece) => {
  const unicodePieces = {
    p: "♟", // black pawn
    r: "♜", // black rook
    n: "♞", // black knight
    b: "♝", // black bishop
    q: "♛", // black queen
    k: "♚", // black king
    P: "♙", // white pawn
    R: "♖", // white rook
    N: "♘", // white knight
    B: "♗", // white bishop
    Q: "♕", // white queen
    K: "♔", // white king
  };

  return unicodePieces[piece.type] || "";
};

socket.on("playerRole", function (role) {
  playerRole = role;
  renderBoard();
});

socket.on("spectatorRole", function () {
  playerRole = null;
  renderBoard();
});

socket.on("boardState", function (fen) {
  chess.load(fen);
  startTimer();
  updateTurnIndicator();
  renderBoard();
});

socket.on("gameReady", () => {
  gameActive = true;
  renderBoard(); // enable dragging
});

socket.on("gameNotReady", () => {
  gameActive = false;
  renderBoard(); // disable dragging
});

socket.on("move", function (move) {
  chess.move(move);
  //   switchTurn(); // sync turn after receiving move
  renderBoard();
});

// Reset and start the 45s timer for the current turn
const startTimer = () => {
  if (!gameActive) return;
  clearInterval(timerInterval);
  timeLeft = 5;
  updateTimerDisplay();

  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerDisplay();

    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      if (playerRole === currentTurn) {
        socket.emit("timeUp", { player: currentTurn });
      }
    }
  }, 1000);
};

const updateTimerDisplay = () => {
  timerElement.textContent = `⏱ ${timeLeft}s`;
};

const switchTurn = () => {
  currentTurn = currentTurn === "w" ? "b" : "w";
  startTimer();
  renderBoard();
  updateTurnIndicator();
};

const updateTurnIndicator = () => {
  if (!playerRole) {
    // Spectator view
    const current = currentTurn === "w" ? "White" : "Black";
    turnIndicator.textContent = `${current}'s Turn ♟`;
    turnIndicator.style.color = "#facc15"; // gold for spectator
  } else if (playerRole === currentTurn) {
    turnIndicator.textContent = "Your Turn ♟";
    turnIndicator.style.color = "#4ade80"; // green
  } else {
    turnIndicator.textContent = "Opponent's Turn ⏳";
    turnIndicator.style.color = "#f87171"; // red
  }
};

socket.on("switchTurn", (newTurn) => {
  currentTurn = newTurn;

  if (chess.turn() !== currentTurn) {
    // Manually flip turn without making a move
    chess._turn = currentTurn; // internal property used by chess.js
  }

  startTimer();
  updateTurnIndicator();
  renderBoard(); // pieces become draggable for the correct player
});

socket.on("forceTurnSync", (turn) => {
  currentTurn = turn;
  chess._turn = turn; // force sync chess.js internal state
  updateTurnIndicator();
  renderBoard();
});

socket.on("gameOver", ({ winner, reason }) => {
  let message = "";

  if (reason === "disconnect") {
    message = winner
      ? `🏆 Player ${winner === "w" ? "White" : "Black"} wins! (Opponent left)`
      : "Game ended — opponent left.";
  } else {
    message = winner
      ? `🏆 Player ${winner === "w" ? "White" : "Black"} wins by checkmate!`
      : "Game Over! It's a draw.";
  }

  //   alert(message);
});

socket.on("disconnect", () => {
  console.log("Player disconnected:", socket.id);

  let leftRole = null;

  if (socket.id === players.w) leftRole = "w";
  else if (socket.id === players.b) leftRole = "b";

  // Remove from players
  if (leftRole) delete players[leftRole];

  // If a player left and the opponent exists, declare opponent as winner
  const opponent = leftRole === "w" ? "b" : "w";
  if (leftRole && players[opponent]) {
    io.emit("gameOver", { winner: opponent, reason: "opponent left" });
    resetGame(); // reset chess.js and currentPlayer
  }
});

const stopGame = (winner, reason) => {
  gameActive = false;
  clearInterval(timerInterval); // stop timer

  // Show popup message
  const popup = document.createElement("div");
  popup.classList.add("game-over-popup");
  popup.innerHTML = `
    <div class="popup-content">
    <h2>Game Over</h2>
    <p class="result">${winner === playerRole ? "You Win!" : "You Lose!"}</p>
    <p class="reason">Reason: ${reason}</p>
    <button id="go-home-btn">Go to Home</button>
  </div>
  `;
  document.body.appendChild(popup);

  // Disable dragging pieces
  document.querySelectorAll(".piece").forEach((p) => (p.draggable = false));

  document.getElementById("go-home-btn").addEventListener("click", () => {
    window.location.href = "/";
  });
};

// Listen to server gameOver
socket.on("gameOver", ({ winner, reason }) => {
  stopGame(winner, reason);
});

const resetGame = () => {
  chess.reset();
  currentPlayer = "w";
  io.emit("boardState", chess.fen());
  io.emit("switchTurn", currentPlayer);
  // Do NOT reset players here! Only reset players when you want a completely new match.
};

renderBoard();

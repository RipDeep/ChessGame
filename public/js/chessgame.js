const socket = io();
const chess = new Chess();

const moveSound = new Audio("/sounds/move.mp3");
const captureSound = new Audio("/sounds/capture.mp3");
const checkSound = new Audio("/sounds/check.mp3");
const checkmateSound = new Audio("/sounds/checkmate.mp3");
const wrongSound = new Audio("/sounds/wrong.mp3");
const startGameSound = new Audio("/sounds/start.mp3");

const boardElement = document.querySelector(".chessboard");
let draggedPiece = null;
let sourceSquare = null;
let playerRole = null;
let selectedSquare = null;
let gameActive = false;

let currentTurn = "w"; // chess.js starts with white
let timerInterval = null;
let timeLeft = 45;
let highlightedTargets = []; // array of {row, col} for legal-move highlights

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

        // Highlight king in check
        const kingInCheck = chess.in_check();
        if (kingInCheck) {
          const kingSquare = chess
            .board()
            .flatMap((row, r) => row.map((sq, c) => ({ sq, r, c })))
            .find(
              ({ sq }) => sq && sq.type === "k" && sq.color === chess.turn()
            );

          if (kingSquare) {
            const { r, c } = kingSquare;
            const squareEl = boardElement.querySelector(
              `.square[data-row='${r}'][data-col='${c}']`
            );
            if (squareEl) {
              squareEl.classList.add("check");

              // Remove the class after animation ends
              setTimeout(() => {
                squareEl.classList.remove("check");
              }, 500);
            }
          }
        }

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

          const from = `${String.fromCharCode(97 + squareindex)}${
            8 - rowindex
          }`;
          highlightLegalMoves(from);

          e.dataTransfer.setData("text/plain", "");
        });
        pieceElement.addEventListener("dragend", (e) => {
          draggedPiece = null;
          sourceSquare = null;
          document
            .querySelectorAll(".square.highlight")
            .forEach((sq) => sq.classList.remove("highlight"));
        });

        squareElement.appendChild(pieceElement);

        // --- Mobile touch ---
        const isTouchDevice =
          "ontouchstart" in window || navigator.maxTouchPoints > 0;
        if (isTouchDevice) {
          pieceElement.addEventListener("touchstart", (e) => {
            if (!gameActive) return;
            if (playerRole !== currentTurn || square.color !== playerRole)
              return;

            draggedPiece = pieceElement;
            sourceSquare = { row: rowindex, col: squareindex };

            draggedPiece.style.position = "absolute";
            draggedPiece.style.zIndex = 1000;
          });

          pieceElement.addEventListener("touchmove", (e) => {
            if (!draggedPiece) return;
            const touch = e.touches[0];
            draggedPiece.style.left =
              touch.clientX - draggedPiece.offsetWidth / 2 + "px";
            draggedPiece.style.top =
              touch.clientY - draggedPiece.offsetHeight / 2 + "px";
          });

          pieceElement.addEventListener("touchend", (e) => {
            if (!draggedPiece) return;
            const touch = e.changedTouches[0];
            const targetElem = document.elementFromPoint(
              touch.clientX,
              touch.clientY
            );

            if (targetElem && targetElem.classList.contains("square")) {
              const targetSource = {
                row: parseInt(targetElem.dataset.row),
                col: parseInt(targetElem.dataset.col),
              };
              handleMove(sourceSquare, targetSource);
            }

            // Reset piece position
            draggedPiece.style.position = "";
            draggedPiece.style.zIndex = "";
            draggedPiece = null;
            sourceSquare = null;
          });
        }
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

      // --- Click-to-select and click-to-move ---
      squareElement.addEventListener("click", () => {
        if (!gameActive) return;

        const row = parseInt(squareElement.dataset.row);
        const col = parseInt(squareElement.dataset.col);
        const clickedPiece = chess.board()[row][col];

        // If no piece selected yet
        if (!selectedSquare) {
          // Only allow selecting own piece
          if (
            clickedPiece &&
            clickedPiece.color === playerRole &&
            playerRole === currentTurn
          ) {
            selectedSquare = { row, col };
            squareElement.classList.add("selected"); // highlight
            const from = `${String.fromCharCode(97 + col)}${8 - row}`;
            highlightLegalMoves(from);
          }
          return;
        }

        // If same square clicked again → deselect
        if (selectedSquare.row === row && selectedSquare.col === col) {
          selectedSquare = null;
          renderBoard(); // remove highlight
          return;
        }

        // Otherwise, try to move
        const targetSquare = { row, col };
        handleMove(selectedSquare, targetSquare);
        selectedSquare = null;
        renderBoard();
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

// Highlight all possible legal moves for a selected piece
const highlightLegalMoves = (fromSquare) => {
  // Clear previous highlights
  document
    .querySelectorAll(".square.highlight")
    .forEach((sq) => sq.classList.remove("highlight"));

  const legalMoves = chess.moves({ square: fromSquare, verbose: true });
  legalMoves.forEach((move) => {
    const to = move.to;
    const col = to.charCodeAt(0) - 97;
    const row = 8 - parseInt(to[1]);
    const targetSquare = document.querySelector(
      `.square[data-row='${row}'][data-col='${col}']`
    );
    if (targetSquare) {
      targetSquare.classList.add("highlight");
    }
  });
};

const handleMove = (source, target) => {
  if (!gameActive) return;

  const from = `${String.fromCharCode(97 + source.col)}${8 - source.row}`;
  const to = `${String.fromCharCode(97 + target.col)}${8 - target.row}`;

  const piece = chess.get(from); // get the piece at source
  const move = { from, to };

  // Only add promotion if pawn reaches last rank
  if (piece && piece.type === "p") {
    if (
      (piece.color === "w" && to[1] === "8") ||
      (piece.color === "b" && to[1] === "1")
    ) {
      move.promotion = "q"; // default to queen
    }
  }

  // Check if move is legal before sending to server
  const legalMoves = chess.moves({ square: from, verbose: true });
  const isLegal = legalMoves.some((m) => m.to === to);

  if (!isLegal) {
    wrongSound.play(); // play wrong move sound
    // Shake the piece

    document.querySelectorAll(".square").forEach((sq) => {
      sq.classList.remove("highlight");
      sq.classList.remove("selected");
    });

    selectedSquare = null;
    const pieceEl =
      document.querySelector(`.piece[draggable][style*="left"]`) ||
      document.querySelector(`.piece:contains('${getPieceUnicode(piece)}')`);

    if (pieceEl) {
      pieceEl.classList.add("shake");
      setTimeout(() => {
        pieceEl.classList.remove("shake");
      }, 500);
    }

    // after creating squareElement and setting dataset...
    // apply 'selected' class if this square matches selectedSquare
    if (
      selectedSquare &&
      selectedSquare.row === rowindex &&
      selectedSquare.col === squareindex
    ) {
      squareElement.classList.add("selected");
    }

    // apply highlight if this square is in highlightedTargets
    if (
      highlightedTargets.some(
        (h) => h.row === rowindex && h.col === squareindex
      )
    ) {
      squareElement.classList.add("highlight");
    }

    return; // do not send illegal move
  }

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
  // gameActive = true;

  startGameSound.play();
  document.querySelector("#turn-indicator").innerText =
    "Opponent joined! Starting...";
  setTimeout(() => {
    gameActive = true;
    renderBoard();
    startTimer(); // automatically start timer
    updateTurnIndicator();

    timerElement.classList.remove("hidden");
    setTimeout(() => overlay.classList.add("hidden"), 5000);
  }, 2100);
});

socket.on("gameNotReady", () => {
  gameActive = false;
  overlay.classList.remove("hidden");
  renderBoard(); // disable dragging
});

socket.on("move", function (move) {
  const prevFen = chess.fen(); // save FEN before move
  const result = chess.move(move);

  if (!result) return;

  // Check if a piece was captured
  if (result.captured) {
    captureSound.play();
  } else {
    moveSound.play();
  }

  if (chess.in_checkmate()) {
    checkmateSound.play();
    const winner = chess.turn() === "w" ? "b" : "w"; // the player who made the last move
    const loser = chess.turn(); // the player who is now in checkmate

    stopGame(winner, "Checkmate");
    return;
  } else if (chess.in_check()) {
    checkSound.play();
  }

  chess.move(move);
  //   switchTurn(); // sync turn after receiving move
  renderBoard();
});

// Reset and start the 45s timer for the current turn
const startTimer = () => {
  if (!gameActive) return;
  clearInterval(timerInterval);
  timeLeft = 45;
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
    turnIndicator.style.backgroundColor = "#facc15"; // gold for spectator
  } else if (playerRole === currentTurn) {
    turnIndicator.textContent = "Your Turn ♟";
    turnIndicator.style.backgroundColor = "#4ade80"; // green
  } else {
    turnIndicator.textContent = "Opponent's Turn ⏳";
    turnIndicator.style.backgroundColor = "#f87171"; // red
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

  setTimeout(() => {
    socket.disconnect();
    console.log("Socket disconnected automatically after game over.");
  }, 700);
};

// Listen to server gameOver
socket.on("gameOver", ({ winner, reason }) => {
  stopGame(winner, reason);
});

const overlay = document.getElementById("waiting-overlay");
const resetGame = () => {
  chess.reset();
  currentPlayer = "w";
  io.emit("boardState", chess.fen());
  io.emit("switchTurn", currentPlayer);
  // Do NOT reset players here! Only reset players when you want a completely new match.
};

renderBoard();

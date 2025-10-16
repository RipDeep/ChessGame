const socket = io();
const chess = new Chess();

const moveSound = new Audio("/sounds/move.mp3");
const captureSound = new Audio("/sounds/capture.mp3");
const checkSound = new Audio("/sounds/check.mp3");
const checkmateSound = new Audio("/sounds/checkmate.mp3");
const wrongSound = new Audio("/sounds/wrong.mp3");
const startGameSound = new Audio("/sounds/start.mp3");
const countdownSound = new Audio("/sounds/countdown.mp3");

const boardElement = document.querySelector(".chessboard");
let draggedPiece = null;
let sourceSquare = null;
let selectedSquare = null;
let gameActive = true;
let userTimeoutCount = 0; // counts consecutive user move misses
const MAX_TIMEOUTS = 3; // game ends if user misses 3 moves

let playAgainstComputer = true;
let computerRole = "b"; // Computer plays black
let currentTurn = "w"; // White moves first (user)
let timerInterval = null;
let timeLeft = 45;
let lastMove = null; // store {from, to} for highlighting

const timerElement = document.getElementById("timer");
const turnIndicator = document.getElementById("turn-indicator");

// ---------------- Highlight Legal Moves ----------------
let highlightedSquares = [];

function highlightLegalMoves(fromSquare) {
  // Remove previous highlights
  highlightedSquares.forEach((sq) => sq.classList.remove("highlight"));
  highlightedSquares = [];

  const legalMoves = chess.moves({ square: fromSquare, verbose: true });
  legalMoves.forEach((move) => {
    const to = move.to;
    const row = 8 - parseInt(to[1]);
    const col = to.charCodeAt(0) - 97;
    const squareEl = document.querySelector(
      `.square[data-row='${row}'][data-col='${col}']`
    );
    if (squareEl) {
      squareEl.classList.add("highlight");
      highlightedSquares.push(squareEl);
    }
  });
}

// ---------------- Check Effect ----------------
function highlightCheck() {
  const kingColor = chess.turn();
  if (!chess.in_check()) return;

  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece && piece.type === "k" && piece.color === kingColor) {
        const squareEl = document.querySelector(
          `.square[data-row='${r}'][data-col='${c}']`
        );
        if (squareEl) {
          squareEl.classList.add("check");
          setTimeout(() => squareEl.classList.remove("check"), 500);
        }
      }
    }
  }
}

function highlightLastMove(from, to) {
  // Remove previous highlights first
  document
    .querySelectorAll(".last-move")
    .forEach((el) => el.classList.remove("last-move"));

  // Highlight source square
  const fromRow = 8 - parseInt(from[1]);
  const fromCol = from.charCodeAt(0) - 97;
  const fromEl = document.querySelector(
    `.square[data-row='${fromRow}'][data-col='${fromCol}']`
  );
  if (fromEl) fromEl.classList.add("last-move");

  // Highlight target square
  const toRow = 8 - parseInt(to[1]);
  const toCol = to.charCodeAt(0) - 97;
  const toEl = document.querySelector(
    `.square[data-row='${toRow}'][data-col='${toCol}']`
  );
  if (toEl) toEl.classList.add("last-move");

  // Remove highlight after 1 second
  setTimeout(() => {
    if (fromEl) fromEl.classList.remove("last-move");
    if (toEl) toEl.classList.remove("last-move");
  }, 1500);
}

// ---------------- Update renderBoard ----------------
const renderBoard = () => {
  const board = chess.board();
  boardElement.innerHTML = "";

  board.forEach((row, rowIndex) => {
    row.forEach((square, colIndex) => {
      const squareElement = document.createElement("div");
      squareElement.classList.add(
        "square",
        (rowIndex + colIndex) % 2 === 0 ? "light" : "dark"
      );
      squareElement.dataset.row = rowIndex;
      squareElement.dataset.col = colIndex;

      if (square) {
        const pieceElement = document.createElement("div");
        pieceElement.classList.add(
          "piece",
          square.color === "w" ? "white" : "black"
        );
        pieceElement.draggable = gameActive && currentTurn === square.color;
        pieceElement.innerText = getPieceUnicode(square);

        // Drag start
        pieceElement.addEventListener("dragstart", (e) => {
          if (!gameActive || currentTurn !== square.color) e.preventDefault();
          draggedPiece = pieceElement;
          sourceSquare = { row: rowIndex, col: colIndex };

          const from = `${String.fromCharCode(97 + colIndex)}${8 - rowIndex}`;
          highlightLegalMoves(from);
        });

        squareElement.appendChild(pieceElement);
      }

      // Highlight last move
      if (lastMove) {
        const fromRow = 8 - parseInt(lastMove.from[1]);
        const fromCol = lastMove.from.charCodeAt(0) - 97;
        const toRow = 8 - parseInt(lastMove.to[1]);
        const toCol = lastMove.to.charCodeAt(0) - 97;

        if (
          (rowIndex === fromRow && colIndex === fromCol) ||
          (rowIndex === toRow && colIndex === toCol)
        ) {
          squareElement.classList.add("last-move");
        }
      }

      // Drag over and drop
      squareElement.addEventListener("dragover", (e) => e.preventDefault());
      squareElement.addEventListener("drop", (e) => {
        e.preventDefault();
        if (draggedPiece) {
          const target = { row: rowIndex, col: colIndex };
          handleMove(sourceSquare, target);
          draggedPiece = null;
          sourceSquare = null;
        }
      });

      // Click to select
      squareElement.addEventListener("click", () => {
        if (!gameActive) return;
        const row = parseInt(squareElement.dataset.row);
        const col = parseInt(squareElement.dataset.col);
        const clickedPiece = chess.board()[row][col];

        if (!selectedSquare) {
          if (clickedPiece && clickedPiece.color === currentTurn) {
            selectedSquare = { row, col };
            squareElement.classList.add("selected");

            const from = `${String.fromCharCode(97 + col)}${8 - row}`;
            highlightLegalMoves(from);
          }
          return;
        }

        if (selectedSquare.row === row && selectedSquare.col === col) {
          selectedSquare = null;
          renderBoard();
          return;
        }

        handleMove(selectedSquare, { row, col });
        selectedSquare = null;
        renderBoard();
      });

      boardElement.appendChild(squareElement);
    });
  });

  highlightCheck();
  boardElement.classList.toggle("flipped", computerRole === "w");
};

// ---------------- Piece Unicode ----------------
const getPieceUnicode = (piece) => {
  const unicodePieces = {
    p: "♟",
    r: "♜",
    n: "♞",
    b: "♝",
    q: "♛",
    k: "♚",
    P: "♙",
    R: "♖",
    N: "♘",
    B: "♗",
    Q: "♕",
    K: "♔",
  };
  return unicodePieces[piece.type] || "";
};

// ---------------- Handle Move ----------------
const handleMove = (source, target) => {
  const from = `${String.fromCharCode(97 + source.col)}${8 - source.row}`;
  const to = `${String.fromCharCode(97 + target.col)}${8 - target.row}`;
  let move = { from, to };

  const piece = chess.get(from);
  if (!piece) return;

  if (piece.color !== computerRole) {
    userTimeoutCount = 0;
  }

  // Pawn promotion
  if (piece.type === "p" && (to[1] === "8" || to[1] === "1"))
    move.promotion = "q";

  // Check legality
  const legalMoves = chess.moves({ square: from, verbose: true });
  const isLegal = legalMoves.some((m) => m.to === to);
  if (!isLegal) {
    wrongSound.currentTime = 0;
    wrongSound.play();
    return;
  }

  const result = chess.move(move);

  if (result.captured) {
    captureSound.currentTime = 0;
    captureSound.play();
  } else {
    moveSound.currentTime = 0;
  }
  moveSound.play();

  if (chess.in_checkmate()) {
    checkmateSound.currentTime = 0;
    checkmateSound.play();
    let reason = "Checkmate";
    socket.emit("gameOverForGame", { currentTurn, reason });
    stopGame(currentTurn, "Checkmate");
    gameActive = false;
    return;
  } else if (chess.in_check()) {
    checkSound.currentTime = 0;
    checkSound.play();
  }
  switchTurn();

  // If computer's turn, let it play
  if (playAgainstComputer && currentTurn === computerRole) {
    setTimeout(() => computerMove(), 500);
  }

  renderBoard();
};

// ---------------- Switch Turn ----------------
const switchTurn = () => {
  currentTurn = currentTurn === "w" ? "b" : "w";
  updateTurnIndicator();
  startTimer();
};

// ---------------- Turn Indicator ----------------
const updateTurnIndicator = () => {
  turnIndicator.textContent =
    currentTurn === computerRole ? "Computer's Turn" : "Your Turn";
  if (currentTurn === computerRole) {
    turnIndicator.style.backgroundColor = "#facc15";
  } else {
    turnIndicator.style.backgroundColor = "#4ade80";
  }
};

function forceTurn(color) {
  // Replace the FEN's active color (the part right after the space)
  const parts = chess.fen().split(" ");
  parts[1] = color; // 'w' or 'b'
  const newFen = parts.join(" ");
  chess.load(newFen);
}

// ---------------- Timer ----------------
// ---------------- Timer ----------------
const startTimer = () => {
  clearInterval(timerInterval);
  timeLeft = 45;
  updateTimerDisplay();

  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerDisplay();
    if (timeLeft <= 5) {
      countdownSound.currentTime = 0;
      countdownSound.play();
    }

    if (timeLeft <= 0) {
      clearInterval(timerInterval);

      if (currentTurn !== computerRole) {
        // USER missed their turn
        userTimeoutCount++;

        if (userTimeoutCount >= MAX_TIMEOUTS) {
          // End game — user missed 3 turns in a row
          let reason = "User missed 3 moves in a row";
          socket.emit("gameOverForGame", { computerRole, reason });
          stopGame(computerRole, "User missed 3 moves in a row");

          // Disconnect socket after short delay
          setTimeout(() => {
            if (socket && socket.connected) {
              socket.disconnect();
            }
          }, 1000);

          return; // Stop everything here
        }

        // Skip user's move — give turn to computer
        currentTurn = computerRole;
        forceTurn(computerRole); // sync chess.js turn
        updateTurnIndicator();
        renderBoard();

        // Let computer play after a short delay
        if (playAgainstComputer && gameActive) {
          setTimeout(() => {
            computerMove();
          }, 600);
        }
      } else {
        // COMPUTER timeout (safety)
        let reason = "Computer timeout";
        let winner = "w";
        socket.emit("gameOverForGame", { winner, reason });
        stopGame("w", "Computer timeout");
      }
    }
  }, 1000);
};

const updateTimerDisplay = () => {
  timerElement.textContent = `⏱ ${timeLeft}s`;
};

// ---------------- Computer AI ----------------
// ---------------- Computer AI ----------------
function computerMove() {
  if (!gameActive) return;
  if (chess.turn() !== computerRole) {
    console.warn("computerMove() called when it's not computer's turn.");
    return;
  }

  const bestMove = getBestMove(chess, 3);
  if (!bestMove) {
    stopGame("w", "Computer has no legal moves (stalemate or error)");
    return;
  }

  const moveResult = chess.move(bestMove);
  lastMove = { from: bestMove.from, to: bestMove.to };

  // Play sound
  if (moveResult.captured) {
    captureSound.currentTime = 0;
    captureSound.play();
  } else {
    moveSound.currentTime = 0;
    moveSound.play();
  }

  if (chess.in_checkmate()) {
    checkmateSound.currentTime = 0;
    checkmateSound.play();

    let reason = "Checkmate";
    socket.emit("gameOverForGame", { computerRole, reason });

    stopGame(computerRole, "Checkmate");
    return;
  }

  if (chess.in_check()) {
    checkSound.currentTime = 0;
    checkSound.play();
  }

  if (
    chess.in_stalemate() ||
    chess.in_draw() ||
    chess.in_threefold_repetition()
  ) {
    let winner = "No one";
    let reason = "Draw";
    socket.emit("gameOverForGame", { winner, reason });

    stopGame(null, "Draw");
    return;
  }

  // Switch back to user
  currentTurn = currentTurn === "w" ? "b" : "w";
  forceTurn(currentTurn); // ensure sync
  // userTimeoutCount = 0; // reset since computer moved
  updateTurnIndicator();
  renderBoard();
  startTimer();
}

// ---------------- Minimax + Alpha-Beta ----------------
function getBestMove(game, depth) {
  const moves = game.moves({ verbose: true });
  let bestValue = -Infinity;
  let bestMoves = [];

  for (const move of moves) {
    const clone = new Chess(game.fen());
    clone.move(move);
    const value = minimax(clone, depth - 1, -Infinity, Infinity, false);
    if (value > bestValue) {
      bestValue = value;
      bestMoves = [move];
    } else if (value === bestValue) {
      bestMoves.push(move);
    }
  }

  return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}

function minimax(game, depth, alpha, beta, isMaximizing) {
  if (depth === 0 || game.game_over()) return evaluateBoard(game.board());

  const moves = game.moves({ verbose: true });
  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      const clone = new Chess(game.fen());
      clone.move(move);
      const evalScore = minimax(clone, depth - 1, alpha, beta, false);
      maxEval = Math.max(maxEval, evalScore);
      alpha = Math.max(alpha, evalScore);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      const clone = new Chess(game.fen());
      clone.move(move);
      const evalScore = minimax(clone, depth - 1, alpha, beta, true);
      minEval = Math.min(minEval, evalScore);
      beta = Math.min(beta, evalScore);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

// ---------------- Board Evaluation ----------------
function evaluateBoard(board) {
  const values = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
  let score = 0;
  for (const row of board) {
    for (const piece of row) {
      if (!piece) continue;
      const val = values[piece.type] || 0;
      score += piece.color === computerRole ? val : -val;
    }
  }
  return score;
}

const stopGame = (winner, reason) => {
  gameActive = false;
  clearInterval(timerInterval); // stop timer

  // Show popup message
  const popup = document.createElement("div");
  popup.classList.add("game-over-popup");
  popup.innerHTML = `
    <div class="popup-content">
    <h2>Game Over</h2>
    <p class="result">"${winner === "b" ? "Computer" : "you"} win"</p>
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
  }, 700);
};

// ---------------- Init ----------------
renderBoard();
updateTurnIndicator();
startTimer();

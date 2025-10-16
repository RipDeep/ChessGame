const toast = document.getElementById("toast");

document.getElementById('copy-link-btn').addEventListener('click', () => {
  const link = document.getElementById('share-link').value;
  navigator.clipboard.writeText(link).then(() => {
    // Show toast
    toast.classList.add("show");

    // Hide after 2.5s
    setTimeout(() => toast.classList.remove("show"), 2500);
  });
});


const whatsappBtn = document.getElementById("share-whatsapp");
whatsappBtn.addEventListener("click", () => {
  const link = document.getElementById("share-link").value;
  const message = encodeURIComponent(`Hey! Let's play chess together. Join using this link: ${link}`);
  
  // WhatsApp Web or App
  const url = `https://wa.me/?text=${message}`;

  // Open in new tab
  window.open(url, "_blank");
});


// ------------------- Room Setup -------------------
let roomId = window.location.pathname.split("/").pop(); // extract roomId from URL

// Generate new room if none or default path
if (!roomId || roomId === "game-friend") {
  roomId = crypto.randomUUID(); // long unique roomId
  window.location.href = `/game/${roomId}`; // redirect host
}

const socket = io();
socket.emit("joinFriendRoom", { roomId });

document.getElementById(
  "share-link"
).value = `${window.location.origin}/game/${roomId}`;

// ------------------- Chess -------------------
const chess = new Chess();

// ------------------- Sounds -------------------
const sounds = {
  move: new Audio("/sounds/move.mp3"),
  capture: new Audio("/sounds/capture.mp3"),
  check: new Audio("/sounds/check.mp3"),
  checkmate: new Audio("/sounds/checkmate.mp3"),
  wrong: new Audio("/sounds/wrong.mp3"),
  start: new Audio("/sounds/start.mp3"),
};


const countdownSound = new Audio("/sounds/countdown.mp3");


// ------------------- DOM Elements -------------------
const boardElement = document.querySelector(".chessboard");
const timerElement = document.getElementById("timer");
const turnIndicator = document.getElementById("turn-indicator");
const startBtn = document.getElementById("start-game");
const shareLink = document.getElementById("share-link");
const overlay = document.querySelector(".overlay");

// ------------------- State -------------------
let playerRole = null; // "w", "b", or "spectator"
let gameActive = false;
let currentTurn = "w";
let timerInterval = null;
let timeLeft = 45;
let selectedSquare = null;
let draggedPiece = null;
let sourceSquare = null;
let timeoutCount = { w: 0, b: 0 };
const MAX_TIMEOUTS = 3;

// ------------------- Helpers -------------------
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

const updateTimerDisplay = () => (timerElement.textContent = `⏱ ${timeLeft}s`);

const updateTurnIndicator = () => {
  if (playerRole === "spectator") {
    turnIndicator.textContent = `${
      currentTurn === "w" ? "White" : "Black"
    }'s Turn ♟`;
    turnIndicator.style.backgroundColor = "#facc15";
  } else if (playerRole === currentTurn) {
    turnIndicator.textContent = "Your Turn ♟";
    turnIndicator.style.backgroundColor = "#4ade80";
  } else {
    turnIndicator.textContent = "Opponent's Turn ⏳";
    turnIndicator.style.backgroundColor = "#f87171";
  }
};

const startTimer = () => {
  clearInterval(timerInterval);
  if (!gameActive || playerRole === "spectator") return;

  // Reset time
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

      // Increase timeout count for current player
      timeoutCount[currentTurn] = (timeoutCount[currentTurn] || 0) + 1;

      // Check for 3 misses
      // if (timeoutCount[currentTurn] >= MAX_TIMEOUTS) {
      //   const winner = currentTurn === "w" ? "b" : "w";
      //   stopGame(winner, `${currentTurn.toUpperCase()} missed 3 turns in a row`);

      //   socket.emit("gameOver", { roomId, winner, reason });

      //   // socket.emit("gameOver", { winner, reason: "Opponent missed 3 moves" });
      //   // setTimeout(() => {
      //   //     if (socket && socket.connected) {
      //   //       socket.disconnect();
      //   //       console.log("Both  disconnected due to 3 missed turns.");
      //   //     }
      //   //     window.location.href = "/";
      //   //   }, 1000);
      //   return;
      // }

      if (timeoutCount[currentTurn] >= MAX_TIMEOUTS) {
        const winner = currentTurn === "w" ? "b" : "w";
        const reason = `${currentTurn.toUpperCase()} missed 3 turns in a row`;

        // Notify server and both clients
        socket.emit("gameOverForGame", {roomId, winner, reason });

        // Show result locally
        stopGame(winner, reason);

        // ✅ Auto-disconnect both clients after popup
        setTimeout(() => {
          if (socket && socket.connected) {
            socket.disconnect();
            
          }
          // Optionally redirect home
          // window.location.href = "/";
        }, 7000);

        return;
      }

      // Skip turn
      const skippedTurn = currentTurn;
      const nextTurn = currentTurn === "w" ? "b" : "w";

      forceTurn(nextTurn);
      updateTurnIndicator();
      renderBoard();

      // Emit skipped turn
      socket.emit("playerSkippedTurn", { roomId, skippedTurn, nextTurn });
    }
  }, 1000);
};

function forceTurn(color) {
  // Replace the FEN's active color (the part right after the space)
  const parts = chess.fen().split(" ");
  parts[1] = color; // 'w' or 'b'
  const newFen = parts.join(" ");
  chess.load(newFen);
}

// ------------------- Render Board -------------------
// ------------------- Render Board -------------------
const renderBoard = () => {
  boardElement.innerHTML = "";
  const board = chess.board();

  board.forEach((row, r) => {
    row.forEach((square, c) => {
      const squareEl = document.createElement("div");
      squareEl.classList.add("square", (r + c) % 2 === 0 ? "light" : "dark");
      squareEl.dataset.row = r;
      squareEl.dataset.col = c;

      if (square) {
        const pieceEl = document.createElement("div");
        pieceEl.classList.add(
          "piece",
          square.color === "w" ? "white" : "black"
        );
        pieceEl.innerText = getPieceUnicode(square);






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






        // ✅ Only allow current player's pieces to be draggable
        pieceEl.draggable =
          gameActive &&
          playerRole !== "spectator" &&
          square.color === playerRole &&
          playerRole === currentTurn;

        

        // ------------------- Drag & Drop -------------------
        pieceEl.addEventListener("dragstart", () => {
         
          if (!pieceEl.draggable) return;
          

          draggedPiece = pieceEl;
          sourceSquare = { row: r, col: c };
          highlightLegalMoves(`${String.fromCharCode(97 + c)}${8 - r}`);
        });
        pieceEl.addEventListener("dragend", () => {
          draggedPiece = null;
          sourceSquare = null;
          document
            .querySelectorAll(".square.highlight")
            .forEach((sq) => sq.classList.remove("highlight"));
        });

        squareEl.appendChild(pieceEl);
      }

      // ------------------- Drop & Click -------------------
      squareEl.addEventListener("dragover", (e) => e.preventDefault());
      squareEl.addEventListener("drop", (e) => {
        e.preventDefault();
        if (!draggedPiece || playerRole === "spectator") return;
        handleMove(sourceSquare, { row: r, col: c });
      });

      squareEl.addEventListener("click", () => {
        if (!gameActive || playerRole === "spectator") return;
        const clickedPiece = chess.board()[r][c];

        // Select piece if it's your turn and your piece
        if (!selectedSquare) {
          if (
            clickedPiece &&
            clickedPiece.color === playerRole &&
            playerRole === currentTurn
          ) {
            selectedSquare = { row: r, col: c };
            squareEl.classList.add("selected");
            highlightLegalMoves(`${String.fromCharCode(97 + c)}${8 - r}`);
          }
          return;
        }

        // Make move
        handleMove(selectedSquare, { row: r, col: c });
        selectedSquare = null;
        renderBoard();
      });

      boardElement.appendChild(squareEl);
    });
  });

  // Flip board for Black
  boardElement.classList.toggle("flipped", playerRole === "b");
};

// ------------------- Highlight Moves -------------------
const highlightLegalMoves = (from) => {
  document
    .querySelectorAll(".square.highlight")
    .forEach((sq) => sq.classList.remove("highlight"));
  const moves = chess.moves({ square: from, verbose: true });
  moves.forEach((m) => {
    const row = 8 - parseInt(m.to[1]);
    const col = m.to.charCodeAt(0) - 97;
    const target = document.querySelector(
      `.square[data-row='${row}'][data-col='${col}']`
    );
    if (target) target.classList.add("highlight");
  });
};

function showCheckEffect() {
  // Remove old highlights first
  document
    .querySelectorAll(".square.check, .square.checkmate")
    .forEach((sq) => {
      sq.classList.remove("check", "checkmate");
    });

  const isCheckmate = chess.in_checkmate();
  const isCheck = chess.in_check();

  if (!isCheck && !isCheckmate) return;

  const kingColor = chess.turn() === "w" ? "b" : "w"; // the color being threatened
  let kingSquare = null;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = chess.board()[r][c];
      if (piece && piece.type === "k" && piece.color === kingColor) {
        kingSquare = { r, c };
        break;
      }
    }
    if (kingSquare) break;
  }

  if (!kingSquare) return;

  const squareEl = boardElement.querySelector(
    `.square[data-row='${kingSquare.r}'][data-col='${kingSquare.c}']`
  );

  if (!squareEl) return;

  if (isCheckmate) {
    squareEl.classList.add("checkmate");
    sounds.checkmate.play();
    // Remove class after animation duration
    setTimeout(() => squareEl.classList.remove("checkmate"), 2000);
  } else if (isCheck) {
    squareEl.classList.add("check");
    sounds.check.play();
    setTimeout(() => squareEl.classList.remove("check"), 1000);
  }
}

// ------------------- Handle Moves -------------------
// ------------------- Handle Moves -------------------
// ------------------- Handle Moves -------------------
// ------------------- Handle Moves -------------------

const handleMove = (source, target) => {
  if (!gameActive || playerRole === "spectator") return;
  if (!source || !target) return;

  // --- NEW: don't allow sending a move if it's not this client's turn ---
  if (playerRole !== currentTurn) {
    console.warn("⏳ Not your turn — move blocked on client.");
    sounds.wrong.play();
    return;
  }

  const from = `${String.fromCharCode(97 + source.col)}${8 - source.row}`;
  const to = `${String.fromCharCode(97 + target.col)}${8 - target.row}`;
  const piece = chess.get(from);
  if (!piece) return;

  const moveObj = { from, to };
  if (
    piece.type === "p" &&
    ((piece.color === "w" && to[1] === "8") ||
      (piece.color === "b" && to[1] === "1"))
  ) {
    moveObj.promotion = "q";
  }

  const legalMoves = chess.moves({ square: from, verbose: true });
  if (!legalMoves.some((m) => m.to === to)) {
    sounds.wrong.play();
    return;
  }

  // Apply move locally immediately (keeps UI/timer consistent)
  const result = chess.move(moveObj);
  if (!result) {
    sounds.wrong.play();
    return;
  }

  showCheckEffect();

  // Play proper sound
  result.captured ? sounds.capture.play() : sounds.move.play();
  // showCheckEffect();

  // Reset timeout counter for the mover (they acted)

  timeoutCount[result.color] = 0;

  // Update currentTurn from engine so both are in sync
  currentTurn = chess.turn();

  // Render + indicator + restart timer
  renderBoard();
  updateTurnIndicator();
  startTimer();

  updateDraggablePieces(); // ← keep this
  // showCheckEffect();
  // Emit to server so opponent and server state update
  socket.emit("friendMove", {
    roomId,
    from: moveObj.from,
    to: moveObj.to,
    promotion: moveObj.promotion,
  });
};

// ------------------- Socket Events -------------------
socket.on("playerRole", (role) => {
  playerRole = role;
  shareLink.style.display = role === "w" ? "block" : "none";
  startBtn.style.display = role === "w" ? "block" : "none";
  renderBoard();
});

socket.on("friendJoined", () => {
  if (playerRole === "w") startBtn.disabled = false;
  socket.emit("startGame", { roomId });
});
socket.on("hideOverlay", () => overlay.classList.add("hidden"));

startBtn.addEventListener("click", () => {
  if (playerRole !== "w") return;
  socket.emit("startGame", { roomId });
});

socket.on("gameReady", () => {
  gameActive = true;
  sounds.start.play();
  renderBoard();
  startTimer();
  updateTurnIndicator();
});

socket.on("boardState", (fen) => {
  chess.load(fen);
  // keep client currentTurn in sync with engine
  currentTurn = chess.turn();
  renderBoard();
  updateTurnIndicator();
  // restart timer only if game active and not spectator
  startTimer();
});

socket.on("friendMove", ({ from, to, promotion, color }) => {
  // If server provides color include it; otherwise chess.move will reflect it
  const moveObj = { from, to };
  if (promotion) moveObj.promotion = promotion;

  const result = chess.move(moveObj);
  if (!result) return; // invalid/late update

  // showCheckEffect();

  // Play sound
  result.captured ? sounds.capture.play() : sounds.move.play();
  if (chess.in_checkmate()) {
    const winner = chess.turn() === "w" ? "b" : "w";
    const reason = "Checkmate";
    socket.emit("gameOverForGame", {roomId, winner, reason });
    stopGame(winner, "Checkmate");
  }
  if (chess.in_check()) {
    const kingInCheck = chess.in_check();
    sounds.check.play();

    if (kingInCheck) {
      const kingInCheck = chess.in_check();

      document
        .querySelectorAll(".square.highlight, .square.selected")
        .forEach((sq) => sq.classList.remove("highlight", "selected"));

      // Find the checked king
      const kingSquare = chess
        .board()
        .flatMap((row, r) => row.map((sq, c) => ({ sq, r, c })))
        .find(({ sq }) => sq && sq.type === "k" && sq.color === chess.turn());

      if (kingSquare) {
        const { r, c } = kingSquare;
        const squareEl = boardElement.querySelector(
          `.square[data-row='${r}'][data-col='${c}']`
        );
        if (squareEl) {
          squareEl.classList.add("check");

          // Remove after animation ends
          setTimeout(() => {
            squareEl.classList.remove("check");
          }, 1000);
        }
      }
    }
  }

  // Reset timeout counter for the player who moved (result.color)
  timeoutCount[result.color] = 0;

  // Update currentTurn from engine
  currentTurn = chess.turn();

  renderBoard();
  updateTurnIndicator();
  updateDraggablePieces(); // ← add this
  // Start timer for next player (if not spectator)
  startTimer();
});

// ------------------- Handle Skipped Turn -------------------

// socket.on("friendMove", ({ from, to, promotion, color }) => {
//   // Apply move
//   const moveObj = { from, to };
//   if (promotion) moveObj.promotion = promotion;

//   const result = chess.move(moveObj);
//   if (!result) return;

//   // --- Play proper sound ---
//   result.captured ? sounds.capture.play() : sounds.move.play();

//   // --- Update currentTurn ---
//   currentTurn = chess.turn();

//   // --- Render board fresh ---
//   renderBoard();
//   updateTurnIndicator();
//   updateDraggablePieces();

//   // --- Handle check / checkmate AFTER render ---
//   if (chess.in_checkmate()) {
//     stopGame(chess.turn() === "w" ? "b" : "w", "Checkmate");
//     return;
//   }

//   if (chess.in_check()) {
//     sounds.check.play();

//     // Find which king is in check
//     const turn = chess.turn(); // color of player in check
//     const board = chess.board();
//     let kingSquare = null;

//     for (let r = 0; r < 8; r++) {
//       for (let c = 0; c < 8; c++) {
//         const piece = board[r][c];
//         if (piece && piece.type === "k" && piece.color === turn) {
//           kingSquare = { r, c };
//         }
//       }
//     }

//     if (kingSquare) {
//       const squareEl = boardElement.querySelector(
//         `.square[data-row='${kingSquare.r}'][data-col='${kingSquare.c}']`
//       );
//       if (squareEl) {
//         // Remove any other highlights first
//         document
//           .querySelectorAll(".square.highlight, .square.selected")
//           .forEach((sq) => sq.classList.remove("highlight", "selected"));

//         // Add check class
//         squareEl.classList.add("check");

//         // Remove after 1 second
//         setTimeout(() => {
//           squareEl.classList.remove("check");
//         }, 5000);
//       }
//     }
//   }

//   // --- Restart timer for next turn ---
//   startTimer();
// });

socket.on("playerSkippedTurn", ({ skippedTurn, nextTurn }) => {
  clearInterval(timerInterval);
  currentTurn = nextTurn; // ⚡ important
  selectedSquare = null;

  timeLeft = 45;
  updateTimerDisplay();
  updateTurnIndicator();
renderBoard();
  // ✅ Update draggable properly
  updateDraggablePieces();

  if (playerRole === currentTurn && gameActive) startTimer();
});

// ------------------- Update Draggable Pieces -------------------
const updateDraggablePieces = () => {
  document.querySelectorAll(".piece").forEach((pieceEl) => {
    const square = pieceEl.parentElement;
    const row = parseInt(square.dataset.row);
    const col = parseInt(square.dataset.col);
    const piece = chess.board()[row][col];

    if (!piece) return;

    // Only current player's pieces are draggable
    pieceEl.draggable =
      gameActive &&
      playerRole !== "spectator" &&
      piece.color === playerRole &&
      playerRole === currentTurn; // ⚡ fixed

    // Optional debug
    
  });
};

socket.on("switchTurn", (newTurn) => {
  currentTurn = newTurn;
  updateTurnIndicator();
  renderBoard();
  updateDraggablePieces();
  startTimer();
});

socket.on("gameOver", ({ winner, reason }) => {
  socket.emit("gameOverForGame", {roomId, winner, reason })
  stopGame(winner, reason)
});
let gameAlreadyOver = false;

// ------------------- Game Over -------------------
const stopGame = (winner, reason) => {
  if (gameAlreadyOver) return;
  gameAlreadyOver = true;

  // Disable game for both players
  gameActive = false;
  clearInterval(timerInterval);

  // Remove all piece draggables
  document.querySelectorAll(".piece").forEach((p) => {
    p.draggable = false;
    p.style.pointerEvents = "none"; // block clicks/touches
  });

  // Overlay to prevent interaction
  overlay.classList.remove("hidden");
  overlay.innerHTML = `
    <div class="game-over-popup">
      <div class="popup-content">
        <h2>Game Over</h2>
        <p class="result">${
          !playerRole
            ? `🏆 Player ${winner === "w" ? "White" : "Black"} wins!`
            : playerRole === winner
            ? "You Win!"
            : "You Lose!"
        }</p>
        <p class="reason">${reason}</p>
        <button id="go-home-btn">Go to Home</button>
      </div>
    </div>
  `;

  document.getElementById("go-home-btn").addEventListener("click", () => {
    window.location.href = "/";
  });

  // Stop all timers and prevent further moves
  timeLeft = 0;
};

// ------------------- Initial Render -------------------
renderBoard();
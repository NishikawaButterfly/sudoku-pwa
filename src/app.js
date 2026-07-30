import { PUZZLES } from './puzzles.js';

const LEVELS = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  expert: 'Expert',
  pro: 'Pro',
  master: 'Master',
};

const STORAGE_KEY = 'sudoku-instantaneo-state-v2';
const STATE_VERSION = 3;
const HISTORY_LIMIT = 100;

const byId = (id) => document.getElementById(id);
const menuScreen = byId('menuScreen');
const gameScreen = byId('gameScreen');
const boardElement = byId('board');
const numberPad = byId('numberPad');
const modal = byId('modal');
const modalContent = byId('modalContent');
const appElement = byId('main');

let game = null;
let selected = -1;
let notesMode = false;
let paused = false;
let completed = false;
let timerId = null;
let history = [];
let lastFocusedElement = null;
let modalDismissible = true;

function readSavedGame() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeSavedGame(value) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    showToast('The game could not be saved');
  }
}

function removeSavedGame() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage may be disabled. The current game can still continue in memory.
  }
}

function readLastPuzzle(level) {
  try {
    return Number(sessionStorage.getItem(`last-${level}`));
  } catch {
    return Number.NaN;
  }
}

function writeLastPuzzle(level, index) {
  try {
    sessionStorage.setItem(`last-${level}`, String(index));
  } catch {
    // Puzzle selection still works when session storage is unavailable.
  }
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function cloneNotes(notes) {
  return notes.map((entry) => [...entry]);
}

function isIntegerBetween(value, minimum, maximum) {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

function isValidSolution(solution) {
  if (!Array.isArray(solution) || solution.length !== 81) return false;
  if (!solution.every((value) => isIntegerBetween(value, 1, 9))) return false;

  const units = [];
  for (let row = 0; row < 9; row += 1) {
    units.push(solution.slice(row * 9, row * 9 + 9));
  }
  for (let column = 0; column < 9; column += 1) {
    units.push(Array.from({ length: 9 }, (_, row) => solution[row * 9 + column]));
  }
  for (let boxRow = 0; boxRow < 3; boxRow += 1) {
    for (let boxColumn = 0; boxColumn < 3; boxColumn += 1) {
      const unit = [];
      for (let row = 0; row < 3; row += 1) {
        for (let column = 0; column < 3; column += 1) {
          unit.push(solution[(boxRow * 3 + row) * 9 + boxColumn * 3 + column]);
        }
      }
      units.push(unit);
    }
  }
  return units.every((unit) => new Set(unit).size === 9);
}

function normalizeSavedGame(saved) {
  if (!saved || typeof saved !== 'object') return null;
  if (!Object.prototype.hasOwnProperty.call(LEVELS, saved.level)) return null;
  if (!Array.isArray(saved.puzzle) || saved.puzzle.length !== 81) return null;
  if (!Array.isArray(saved.values) || saved.values.length !== 81) return null;
  if (!saved.puzzle.every((value) => isIntegerBetween(value, 0, 9))) return null;
  if (!saved.values.every((value) => isIntegerBetween(value, 0, 9))) return null;
  if (!isValidSolution(saved.solution)) return null;
  if (!isIntegerBetween(saved.elapsed, 0, 31_536_000)) return null;
  if (!isIntegerBetween(saved.mistakes, 0, 1_000_000)) return null;
  if (!isIntegerBetween(saved.hints, 0, 81)) return null;

  const notes = saved.notes ?? Array.from({ length: 81 }, () => []);
  if (!Array.isArray(notes) || notes.length !== 81) return null;
  const normalizedNotes = [];
  for (let index = 0; index < 81; index += 1) {
    if (saved.puzzle[index] && saved.puzzle[index] !== saved.solution[index]) return null;
    if (saved.puzzle[index] && saved.values[index] !== saved.puzzle[index]) return null;
    const entry = notes[index];
    if (!Array.isArray(entry) || !entry.every((value) => isIntegerBetween(value, 1, 9))) return null;
    const unique = [...new Set(entry)].sort((a, b) => a - b);
    if (unique.length !== entry.length) return null;
    normalizedNotes.push(saved.values[index] ? [] : unique);
  }

  return {
    version: STATE_VERSION,
    level: saved.level,
    puzzle: [...saved.puzzle],
    solution: [...saved.solution],
    values: [...saved.values],
    notes: normalizedNotes,
    elapsed: saved.elapsed,
    mistakes: saved.mistakes,
    hints: saved.hints,
  };
}

function newGame(level) {
  const available = PUZZLES[level];
  if (!available?.length) return;
  const previous = readLastPuzzle(level);
  let index = Math.floor(Math.random() * available.length);
  if (available.length > 1 && index === previous) index = (index + 1) % available.length;
  writeLastPuzzle(level, index);

  const item = available[index];
  game = {
    version: STATE_VERSION,
    level,
    puzzle: [...item.p].map(Number),
    solution: [...item.s].map(Number),
    values: [...item.p].map(Number),
    notes: Array.from({ length: 81 }, () => []),
    elapsed: 0,
    mistakes: 0,
    hints: 0,
  };

  selected = game.puzzle.findIndex((value) => value === 0);
  notesMode = false;
  paused = false;
  completed = false;
  history = [];
  showGame();
  render();
  saveGame();
  startTimer();
  gameScreen.focus({ preventScroll: true });
}

function showGame() {
  menuScreen.classList.remove('active');
  menuScreen.setAttribute('aria-hidden', 'true');
  gameScreen.classList.add('active');
  gameScreen.removeAttribute('aria-hidden');
  byId('levelBadge').textContent = LEVELS[game.level];
  byId('pauseCover').hidden = true;
}

function showMenu() {
  stopTimer();
  gameScreen.classList.remove('active');
  gameScreen.setAttribute('aria-hidden', 'true');
  menuScreen.classList.add('active');
  menuScreen.removeAttribute('aria-hidden');
  updateContinueButton();
  const target = byId('continueButton').hidden
    ? document.querySelector('[data-level="easy"]')
    : byId('continueButton');
  target?.focus({ preventScroll: true });
}

function updateContinueButton() {
  byId('continueButton').hidden = !readSavedGame();
}

function saveGame() {
  if (!game || completed) return;
  writeSavedGame(JSON.stringify({ ...game, version: STATE_VERSION, notes: cloneNotes(game.notes) }));
  updateContinueButton();
}

function loadGame() {
  try {
    const raw = readSavedGame();
    const saved = raw ? normalizeSavedGame(JSON.parse(raw)) : null;
    if (!saved) throw new Error('Invalid saved game');
    game = saved;
    selected = game.puzzle.findIndex((value, index) => !value && !game.values[index]);
    if (selected < 0) selected = game.puzzle.findIndex((value) => value === 0);
    notesMode = false;
    paused = false;
    completed = false;
    history = [];
    showGame();
    render();
    startTimer();
    gameScreen.focus({ preventScroll: true });
  } catch {
    removeSavedGame();
    updateContinueButton();
    showToast('The saved game was invalid and has been removed');
  }
}

function startTimer() {
  stopTimer();
  timerId = window.setInterval(() => {
    if (!game || paused || completed) return;
    game.elapsed += 1;
    byId('timer').textContent = formatTime(game.elapsed);
    if (game.elapsed % 5 === 0) saveGame();
  }, 1000);
}

function stopTimer() {
  if (!timerId) return;
  clearInterval(timerId);
  timerId = null;
}

function render() {
  renderBoard();
  renderNumberPad();
  byId('timer').textContent = formatTime(game.elapsed);
  byId('mistakes').textContent = `Mistakes: ${game.mistakes}`;
  byId('notesButton').classList.toggle('active', notesMode);
  byId('notesButton').setAttribute('aria-pressed', String(notesMode));
}

function cellDescription(index) {
  const row = Math.floor(index / 9) + 1;
  const column = index % 9 + 1;
  const value = game.values[index];
  if (value) {
    const origin = game.puzzle[index] ? ', given clue' : '';
    const status = !game.puzzle[index] && value !== game.solution[index] ? ', incorrect' : '';
    return `Row ${row}, column ${column}, number ${value}${origin}${status}`;
  }
  const candidates = game.notes[index];
  const noteText = candidates.length ? `, candidates ${candidates.join(', ')}` : '';
  return `Row ${row}, column ${column}, empty${noteText}`;
}

function renderBoard() {
  const restoreBoardFocus = boardElement.contains(document.activeElement);
  boardElement.replaceChildren();

  for (let row = 0; row < 9; row += 1) {
    const rowElement = document.createElement('div');
    rowElement.className = 'board-row';
    rowElement.setAttribute('role', 'row');

    for (let column = 0; column < 9; column += 1) {
      const index = row * 9 + column;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cell';
      button.dataset.index = String(index);
      button.id = `cell-${index}`;
      button.tabIndex = index === selected ? 0 : -1;
      button.setAttribute('role', 'gridcell');
      button.setAttribute('aria-rowindex', String(row + 1));
      button.setAttribute('aria-colindex', String(column + 1));
      button.setAttribute('aria-selected', String(index === selected));

      if (column === 2 || column === 5) button.classList.add('box-right');
      if (row === 2 || row === 5) button.classList.add('box-bottom');
      if (game.puzzle[index]) button.classList.add('given');

      const value = game.values[index];
      if (value) {
        button.textContent = String(value);
      } else if (game.notes[index].length) {
        const notes = document.createElement('span');
        notes.className = 'notes';
        notes.setAttribute('aria-hidden', 'true');
        for (let number = 1; number <= 9; number += 1) {
          const note = document.createElement('span');
          note.textContent = game.notes[index].includes(number) ? String(number) : '';
          notes.appendChild(note);
        }
        button.appendChild(notes);
      }

      button.setAttribute('aria-label', cellDescription(index));
      button.addEventListener('click', () => selectCell(index));
      rowElement.appendChild(button);
    }
    boardElement.appendChild(rowElement);
  }

  applyHighlights();
  if (restoreBoardFocus && selected >= 0) {
    window.requestAnimationFrame(() => boardElement.querySelector(`[data-index="${selected}"]`)?.focus());
  }
}

function selectCell(index, focus = false) {
  if (paused || completed || !modal.hidden) return;
  selected = index;
  applyHighlights();
  if (focus) boardElement.querySelector(`[data-index="${selected}"]`)?.focus();
}

function applyHighlights() {
  const cells = [...boardElement.querySelectorAll('.cell')];
  cells.forEach((cell, index) => {
    cell.classList.remove('peer', 'same', 'selected', 'wrong');
    cell.tabIndex = index === selected ? 0 : -1;
    cell.setAttribute('aria-selected', String(index === selected));
    cell.removeAttribute('aria-invalid');
  });
  if (selected < 0 || !cells[selected]) return;

  const selectedRow = Math.floor(selected / 9);
  const selectedColumn = selected % 9;
  const selectedBox = Math.floor(selectedRow / 3) * 3 + Math.floor(selectedColumn / 3);
  const selectedValue = game.values[selected];

  cells.forEach((cell, index) => {
    const row = Math.floor(index / 9);
    const column = index % 9;
    const box = Math.floor(row / 3) * 3 + Math.floor(column / 3);
    if (index !== selected && (row === selectedRow || column === selectedColumn || box === selectedBox)) {
      cell.classList.add('peer');
    }
    if (selectedValue && index !== selected && game.values[index] === selectedValue) {
      cell.classList.add('same');
    }
    if (!game.puzzle[index] && game.values[index] && game.values[index] !== game.solution[index]) {
      cell.classList.add('wrong');
      cell.setAttribute('aria-invalid', 'true');
    }
  });

  cells[selected].classList.add('selected');
}

function snapshot() {
  history.push({
    values: [...game.values],
    notes: cloneNotes(game.notes),
    mistakes: game.mistakes,
    hints: game.hints,
  });
  if (history.length > HISTORY_LIMIT) history.shift();
}

function interactionBlocked() {
  return !game || paused || completed || !modal.hidden;
}

function enterNumber(number) {
  if (interactionBlocked() || selected < 0 || game.puzzle[selected]) return;

  if (notesMode) {
    snapshot();
    const notes = game.notes[selected];
    const position = notes.indexOf(number);
    if (position >= 0) notes.splice(position, 1);
    else notes.push(number);
    notes.sort((a, b) => a - b);
    game.values[selected] = 0;
  } else {
    if (game.values[selected] === number) return;
    snapshot();
    game.values[selected] = number;
    game.notes[selected] = [];
    const correct = number === game.solution[selected];
    if (!correct) game.mistakes += 1;
    else removePeerNote(selected, number);
  }

  render();
  saveGame();
  checkWin();
}

function removePeerNote(index, number) {
  const row = Math.floor(index / 9);
  const column = index % 9;

  for (let other = 0; other < 81; other += 1) {
    const otherRow = Math.floor(other / 9);
    const otherColumn = other % 9;
    const sameBox = Math.floor(otherRow / 3) === Math.floor(row / 3)
      && Math.floor(otherColumn / 3) === Math.floor(column / 3);
    if (otherRow !== row && otherColumn !== column && !sameBox) continue;
    const position = game.notes[other].indexOf(number);
    if (position >= 0) game.notes[other].splice(position, 1);
  }
}

function erase() {
  if (interactionBlocked() || selected < 0 || game.puzzle[selected]) return;
  if (!game.values[selected] && !game.notes[selected].length) return;
  snapshot();
  game.values[selected] = 0;
  game.notes[selected] = [];
  render();
  saveGame();
}

function undo() {
  if (interactionBlocked() || !history.length) {
    if (!interactionBlocked()) showToast('Nothing to undo');
    return;
  }
  const previous = history.pop();
  game.values = previous.values;
  game.notes = previous.notes;
  game.mistakes = previous.mistakes;
  game.hints = previous.hints;
  render();
  saveGame();
}

function hint() {
  if (interactionBlocked()) return;
  const candidates = [];
  for (let index = 0; index < 81; index += 1) {
    if (!game.puzzle[index] && game.values[index] !== game.solution[index]) candidates.push(index);
  }
  if (!candidates.length) return;

  const index = selected >= 0 && candidates.includes(selected)
    ? selected
    : candidates[Math.floor(Math.random() * candidates.length)];

  snapshot();
  game.values[index] = game.solution[index];
  game.notes[index] = [];
  game.hints += 1;
  selected = index;
  removePeerNote(index, game.values[index]);
  render();
  saveGame();
  showToast('Hint placed');
  checkWin();
}

function renderNumberPad() {
  const focusedNumber = Number(document.activeElement?.dataset?.number);
  numberPad.replaceChildren();
  for (let number = 1; number <= 9; number += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'number';
    button.dataset.number = String(number);
    button.textContent = String(number);
    button.setAttribute('aria-label', `Enter number ${number}`);
    const complete = game.solution.every((value, index) => value !== number || game.values[index] === number);
    button.classList.toggle('completed', complete);
    button.disabled = complete;
    button.addEventListener('click', () => enterNumber(number));
    numberPad.appendChild(button);
  }
  if (isIntegerBetween(focusedNumber, 1, 9)) {
    window.requestAnimationFrame(() => numberPad.querySelector(`[data-number="${focusedNumber}"]`)?.focus());
  }
}

function checkWin() {
  if (!game.values.every((value, index) => value === game.solution[index])) return;
  completed = true;
  stopTimer();
  removeSavedGame();
  updateContinueButton();
  window.setTimeout(showWinModal, 150);
}

function showWinModal() {
  const result = `${LEVELS[game.level]} Sudoku completed in ${formatTime(game.elapsed)}. Mistakes: ${game.mistakes}. Hints: ${game.hints}.`;
  openModal(`
    <div aria-hidden="true" style="font-size:3rem">🏆</div>
    <h2 id="modalTitle">Completed!</h2>
    <p>${result}</p>
    <div class="modal-actions">
      <button class="primary" id="shareResultButton" type="button">Share result</button>
      <button class="secondary" id="newGameButton" type="button">Play again</button>
      <button class="secondary" id="menuButton" type="button">Menu</button>
    </div>
  `, { dismissible: false });
  byId('shareResultButton').addEventListener('click', () => shareText(`🧩 ${result} Can you beat it?`));
  byId('newGameButton').addEventListener('click', () => {
    closeModal({ force: true });
    newGame(game.level);
  });
  byId('menuButton').addEventListener('click', () => {
    closeModal({ force: true });
    game = null;
    completed = false;
    showMenu();
  });
}

function togglePause(forceResume = false) {
  if (!game || completed || !modal.hidden) return;
  paused = forceResume ? false : !paused;
  byId('pauseCover').hidden = !paused;
  if (!paused) {
    saveGame();
    boardElement.querySelector(`[data-index="${selected}"]`)?.focus();
  } else {
    byId('resumeButton').focus();
  }
}

function confirmBackToMenu() {
  if (!game || completed) return;
  openModal(`
    <h2 id="modalTitle">Return to menu</h2>
    <p>You can save this game and continue it later.</p>
    <div class="modal-actions">
      <button class="primary" id="saveExitButton" type="button">Save and exit</button>
      <button class="danger" id="deleteExitButton" type="button">Delete game</button>
      <button class="secondary" id="cancelExitButton" type="button">Cancel</button>
    </div>
  `);
  byId('saveExitButton').addEventListener('click', () => {
    saveGame();
    closeModal();
    showMenu();
  });
  byId('deleteExitButton').addEventListener('click', () => {
    removeSavedGame();
    game = null;
    closeModal();
    showMenu();
  });
  byId('cancelExitButton').addEventListener('click', closeModal);
}

function showHelp() {
  openModal(`
    <h2 id="modalTitle">How to play</h2>
    <div class="help">
      <p><strong>Goal:</strong> complete every row, column and 3 × 3 box with the numbers 1 to 9 without repeats.</p>
      <ul>
        <li>Select a cell and choose a number.</li>
        <li>Use <strong>Notes</strong> to record candidates.</li>
        <li><strong>Hint</strong> completes one cell correctly.</li>
        <li>Your game is saved automatically.</li>
        <li>Use number keys, arrow keys, Home, End, Delete and N on a keyboard.</li>
      </ul>
    </div>
    <div class="modal-actions"><button class="primary" id="closeHelpButton" type="button">Got it</button></div>
  `);
  byId('closeHelpButton').addEventListener('click', closeModal);
}

function openModal(content, { dismissible = true } = {}) {
  lastFocusedElement = document.activeElement;
  modalDismissible = dismissible;
  modalContent.innerHTML = content;
  modal.hidden = false;
  appElement.inert = true;
  modal.querySelector('button')?.focus();
}

function closeModal({ force = false } = {}) {
  if (!modalDismissible && !force) return;
  modal.hidden = true;
  modalContent.replaceChildren();
  appElement.inert = false;
  lastFocusedElement?.focus();
}

function trapModalFocus(event) {
  const focusable = [...modal.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function showToast(message) {
  const toast = byId('toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toast.timeoutId);
  toast.timeoutId = setTimeout(() => toast.classList.remove('visible'), 1800);
}

async function shareText(text, url = '') {
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Sudoku Instant', text, ...(url ? { url } : {}) });
      return;
    }
    await navigator.clipboard.writeText(url ? `${text} ${url}` : text);
    showToast('Copied to clipboard');
  } catch (error) {
    if (error?.name !== 'AbortError') showToast('The result could not be shared');
  }
}

function shareGame() {
  shareText('🧩 Play Sudoku Instant:', window.location.href);
}

function moveSelection(key) {
  if (selected < 0) selected = 0;
  const row = Math.floor(selected / 9);
  const column = selected % 9;
  let next = selected;
  if (key === 'ArrowLeft' && column > 0) next -= 1;
  if (key === 'ArrowRight' && column < 8) next += 1;
  if (key === 'ArrowUp' && row > 0) next -= 9;
  if (key === 'ArrowDown' && row < 8) next += 9;
  if (key === 'Home') next = row * 9;
  if (key === 'End') next = row * 9 + 8;
  selectCell(next, true);
}

document.querySelectorAll('[data-level]').forEach((button) => {
  button.addEventListener('click', () => newGame(button.dataset.level));
});
byId('continueButton').addEventListener('click', loadGame);
byId('shareGameButton').addEventListener('click', shareGame);
byId('helpButton').addEventListener('click', showHelp);
byId('backButton').addEventListener('click', confirmBackToMenu);
byId('undoButton').addEventListener('click', undo);
byId('eraseButton').addEventListener('click', erase);
byId('notesButton').addEventListener('click', () => {
  if (interactionBlocked()) return;
  notesMode = !notesMode;
  render();
  showToast(notesMode ? 'Notes enabled' : 'Normal entry enabled');
});
byId('hintButton').addEventListener('click', hint);
byId('pauseButton').addEventListener('click', () => togglePause());
byId('resumeButton').addEventListener('click', () => togglePause(true));
modal.addEventListener('click', (event) => {
  if (event.target === modal && modalDismissible) closeModal();
});

document.addEventListener('keydown', (event) => {
  if (!modal.hidden) {
    if (event.key === 'Tab') trapModalFocus(event);
    if (event.key === 'Escape' && modalDismissible) closeModal();
    return;
  }
  if (!game || paused || completed) return;
  if (/^[1-9]$/.test(event.key)) {
    event.preventDefault();
    enterNumber(Number(event.key));
  } else if (event.key === 'Backspace' || event.key === 'Delete') {
    event.preventDefault();
    erase();
  } else if (event.key.toLowerCase() === 'n') {
    event.preventDefault();
    notesMode = !notesMode;
    render();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    confirmBackToMenu();
  } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    moveSelection(event.key);
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game && !paused && !completed) {
    paused = true;
    byId('pauseCover').hidden = false;
    saveGame();
  }
});

window.addEventListener('beforeunload', saveGame);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((registration) => {
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              showToast('An update is ready for your next visit');
            }
          });
        });
      })
      .catch(() => showToast('Offline mode is unavailable'));
  });
}

menuScreen.removeAttribute('aria-hidden');
gameScreen.setAttribute('aria-hidden', 'true');
updateContinueButton();

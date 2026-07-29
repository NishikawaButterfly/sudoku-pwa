import { PUZZLES } from './puzzles.js';

const LEVELS = {
  easy: 'Fácil',
  medium: 'Medio',
  hard: 'Difícil',
  expert: 'Experto',
  pro: 'Pro',
  master: 'Maestro',
};

const STORAGE_KEY = 'sudoku-instantaneo-state-v2';
const HISTORY_LIMIT = 100;

const byId = (id) => document.getElementById(id);
const menuScreen = byId('menuScreen');
const gameScreen = byId('gameScreen');
const boardElement = byId('board');
const numberPad = byId('numberPad');
const modal = byId('modal');
const modalContent = byId('modalContent');

let game = null;
let selected = -1;
let notesMode = false;
let paused = false;
let timerId = null;
let history = [];
let lastFocusedElement = null;

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
    showToast('No se pudo guardar la partida');
  }
}

function removeSavedGame() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage may be disabled. The current game can still continue in memory.
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

function newGame(level) {
  const available = PUZZLES[level];
  const previous = Number(sessionStorage.getItem(`last-${level}`));
  let index = Math.floor(Math.random() * available.length);
  if (available.length > 1 && index === previous) index = (index + 1) % available.length;
  sessionStorage.setItem(`last-${level}`, String(index));

  const item = available[index];
  game = {
    level,
    puzzle: [...item.p].map(Number),
    solution: [...item.s].map(Number),
    values: [...item.p].map(Number),
    notes: Array.from({ length: 81 }, () => []),
    elapsed: 0,
    mistakes: 0,
    hints: 0,
  };

  selected = -1;
  notesMode = false;
  paused = false;
  history = [];
  showGame();
  render();
  saveGame();
  startTimer();
}

function showGame() {
  menuScreen.classList.remove('active');
  gameScreen.classList.add('active');
  byId('levelBadge').textContent = LEVELS[game.level];
  byId('pauseCover').hidden = true;
}

function showMenu() {
  stopTimer();
  gameScreen.classList.remove('active');
  menuScreen.classList.add('active');
  updateContinueButton();
}

function updateContinueButton() {
  byId('continueButton').hidden = !readSavedGame();
}

function saveGame() {
  if (!game) return;
  writeSavedGame(JSON.stringify({ ...game, notes: cloneNotes(game.notes) }));
  updateContinueButton();
}

function loadGame() {
  try {
    const saved = JSON.parse(readSavedGame());
    if (!saved?.puzzle || !saved?.solution || !saved?.values) return;
    game = saved;
    game.notes = (game.notes || Array.from({ length: 81 }, () => [])).map((entry) => Array.isArray(entry) ? entry : []);
    selected = -1;
    notesMode = false;
    paused = false;
    history = [];
    showGame();
    render();
    startTimer();
  } catch {
    removeSavedGame();
    updateContinueButton();
    showToast('La partida guardada estaba dañada y se eliminó');
  }
}

function startTimer() {
  stopTimer();
  timerId = window.setInterval(() => {
    if (!game || paused) return;
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
  byId('mistakes').textContent = `Errores: ${game.mistakes}`;
  byId('notesButton').classList.toggle('active', notesMode);
  byId('notesButton').setAttribute('aria-pressed', String(notesMode));
}

function renderBoard() {
  boardElement.replaceChildren();

  for (let index = 0; index < 81; index += 1) {
    const row = Math.floor(index / 9);
    const column = index % 9;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cell';
    button.dataset.index = String(index);
    button.setAttribute('role', 'gridcell');
    button.setAttribute('aria-rowindex', String(row + 1));
    button.setAttribute('aria-colindex', String(column + 1));

    if (column === 2 || column === 5) button.classList.add('box-right');
    if (row === 2 || row === 5) button.classList.add('box-bottom');
    if (game.puzzle[index]) button.classList.add('given');

    const value = game.values[index];
    if (value) {
      button.textContent = String(value);
      button.setAttribute('aria-label', `Fila ${row + 1}, columna ${column + 1}, número ${value}${game.puzzle[index] ? ', pista inicial' : ''}`);
    } else {
      button.setAttribute('aria-label', `Fila ${row + 1}, columna ${column + 1}, vacía`);
      if (game.notes[index].length) {
        const notes = document.createElement('span');
        notes.className = 'notes';
        for (let number = 1; number <= 9; number += 1) {
          const note = document.createElement('span');
          note.textContent = game.notes[index].includes(number) ? String(number) : '';
          notes.appendChild(note);
        }
        button.appendChild(notes);
      }
    }

    button.addEventListener('click', () => selectCell(index));
    boardElement.appendChild(button);
  }

  applyHighlights();
}

function selectCell(index) {
  if (paused) return;
  selected = index;
  applyHighlights();
}

function applyHighlights() {
  const cells = [...boardElement.children];
  cells.forEach((cell) => cell.classList.remove('peer', 'same', 'selected', 'wrong'));
  if (selected < 0) return;

  const selectedRow = Math.floor(selected / 9);
  const selectedColumn = selected % 9;
  const selectedBox = Math.floor(selectedRow / 3) * 3 + Math.floor(selectedColumn / 3);
  const selectedValue = game.values[selected];

  cells.forEach((cell, index) => {
    const row = Math.floor(index / 9);
    const column = index % 9;
    const box = Math.floor(row / 3) * 3 + Math.floor(column / 3);
    if (index !== selected && (row === selectedRow || column === selectedColumn || box === selectedBox)) cell.classList.add('peer');
    if (selectedValue && index !== selected && game.values[index] === selectedValue) cell.classList.add('same');
  });

  cells[selected].classList.add('selected');
  cells.forEach((cell, index) => {
    if (game.values[index] && hasConflict(index)) cell.classList.add('wrong');
  });
}

function hasConflict(index) {
  const value = game.values[index];
  if (!value) return false;
  const row = Math.floor(index / 9);
  const column = index % 9;

  for (let other = 0; other < 81; other += 1) {
    if (other === index || game.values[other] !== value) continue;
    const otherRow = Math.floor(other / 9);
    const otherColumn = other % 9;
    const sameBox = Math.floor(otherRow / 3) === Math.floor(row / 3) && Math.floor(otherColumn / 3) === Math.floor(column / 3);
    if (otherRow === row || otherColumn === column || sameBox) return true;
  }
  return false;
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

function enterNumber(number) {
  if (paused || selected < 0 || game.puzzle[selected]) return;
  snapshot();

  if (notesMode) {
    const notes = game.notes[selected];
    const position = notes.indexOf(number);
    if (position >= 0) notes.splice(position, 1);
    else notes.push(number);
    notes.sort((a, b) => a - b);
    game.values[selected] = 0;
  } else {
    game.values[selected] = number;
    game.notes[selected] = [];
    if (number !== game.solution[selected]) game.mistakes += 1;
    removePeerNote(selected, number);
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
    const sameBox = Math.floor(otherRow / 3) === Math.floor(row / 3) && Math.floor(otherColumn / 3) === Math.floor(column / 3);
    if (otherRow !== row && otherColumn !== column && !sameBox) continue;
    const position = game.notes[other].indexOf(number);
    if (position >= 0) game.notes[other].splice(position, 1);
  }
}

function erase() {
  if (paused || selected < 0 || game.puzzle[selected]) return;
  snapshot();
  game.values[selected] = 0;
  game.notes[selected] = [];
  render();
  saveGame();
}

function undo() {
  if (paused || !history.length) {
    showToast('Nada que deshacer');
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
  if (paused) return;
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
  showToast('Pista colocada');
  checkWin();
}

function renderNumberPad() {
  numberPad.replaceChildren();
  for (let number = 1; number <= 9; number += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'number';
    button.textContent = String(number);
    button.setAttribute('aria-label', `Introducir número ${number}`);
    if (game.values.filter((value) => value === number).length >= 9) button.classList.add('completed');
    button.addEventListener('click', () => enterNumber(number));
    numberPad.appendChild(button);
  }
}

function checkWin() {
  if (!game.values.every((value, index) => value === game.solution[index])) return;
  stopTimer();
  removeSavedGame();
  window.setTimeout(showWinModal, 150);
}

function showWinModal() {
  const result = `Sudoku ${LEVELS[game.level]} completado en ${formatTime(game.elapsed)}. Errores: ${game.mistakes}. Pistas: ${game.hints}.`;
  openModal(`
    <div aria-hidden="true" style="font-size:3rem">🏆</div>
    <h2 id="modalTitle">¡Completado!</h2>
    <p>${result}</p>
    <div class="modal-actions">
      <button class="primary" id="shareResultButton" type="button">Compartir resultado</button>
      <button class="secondary" id="newGameButton" type="button">Otra partida</button>
      <button class="secondary" id="menuButton" type="button">Menú</button>
    </div>
  `);
  byId('shareResultButton').addEventListener('click', () => shareText(`🧩 ${result} ¿Puedes superarme?`));
  byId('newGameButton').addEventListener('click', () => { closeModal(); newGame(game.level); });
  byId('menuButton').addEventListener('click', () => { closeModal(); game = null; showMenu(); });
}

function togglePause(forceResume = false) {
  if (!game) return;
  paused = forceResume ? false : !paused;
  byId('pauseCover').hidden = !paused;
  if (!paused) saveGame();
}

function confirmBackToMenu() {
  openModal(`
    <h2 id="modalTitle">Volver al menú</h2>
    <p>La partida puede guardarse para continuarla después.</p>
    <div class="modal-actions">
      <button class="primary" id="saveExitButton" type="button">Guardar y salir</button>
      <button class="danger" id="deleteExitButton" type="button">Borrar partida</button>
      <button class="secondary" id="cancelExitButton" type="button">Cancelar</button>
    </div>
  `);
  byId('saveExitButton').addEventListener('click', () => { saveGame(); closeModal(); showMenu(); });
  byId('deleteExitButton').addEventListener('click', () => { removeSavedGame(); game = null; closeModal(); showMenu(); });
  byId('cancelExitButton').addEventListener('click', closeModal);
}

function showHelp() {
  openModal(`
    <h2 id="modalTitle">Cómo jugar</h2>
    <div class="help">
      <p><strong>Objetivo:</strong> completa cada fila, columna y bloque de 3 × 3 con los números del 1 al 9 sin repetir.</p>
      <ul>
        <li>Selecciona una casilla y pulsa un número.</li>
        <li>Usa <strong>Notas</strong> para registrar candidatos.</li>
        <li><strong>Pista</strong> completa una casilla correcta.</li>
        <li>La partida se guarda automáticamente.</li>
        <li>También puedes jugar con el teclado.</li>
      </ul>
    </div>
    <div class="modal-actions"><button class="primary" id="closeHelpButton" type="button">Entendido</button></div>
  `);
  byId('closeHelpButton').addEventListener('click', closeModal);
}

function openModal(content) {
  lastFocusedElement = document.activeElement;
  modalContent.innerHTML = content;
  modal.hidden = false;
  modal.querySelector('button')?.focus();
}

function closeModal() {
  modal.hidden = true;
  modalContent.replaceChildren();
  lastFocusedElement?.focus();
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
      await navigator.share({ title: 'Sudoku Instantáneo', text, ...(url ? { url } : {}) });
      return;
    }
    await navigator.clipboard.writeText(url ? `${text} ${url}` : text);
    showToast('Copiado al portapapeles');
  } catch (error) {
    if (error?.name !== 'AbortError') showToast('No se pudo compartir');
  }
}

function shareGame() {
  shareText('🧩 Juega a Sudoku Instantáneo:', window.location.href);
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
byId('notesButton').addEventListener('click', () => { notesMode = !notesMode; render(); showToast(notesMode ? 'Modo notas activado' : 'Modo normal'); });
byId('hintButton').addEventListener('click', hint);
byId('pauseButton').addEventListener('click', () => togglePause());
byId('resumeButton').addEventListener('click', () => togglePause(true));
modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });

document.addEventListener('keydown', (event) => {
  if (!modal.hidden && event.key === 'Escape') { closeModal(); return; }
  if (!game || paused) return;
  if (/^[1-9]$/.test(event.key)) enterNumber(Number(event.key));
  if (event.key === 'Backspace' || event.key === 'Delete') erase();
  if (event.key.toLowerCase() === 'n') { notesMode = !notesMode; render(); }
  if (event.key === 'Escape') confirmBackToMenu();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game && !paused) {
    paused = true;
    byId('pauseCover').hidden = false;
    saveGame();
  }
});

window.addEventListener('beforeunload', saveGame);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

updateContinueButton();

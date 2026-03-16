export const TRACK_LENGTH = 12;
export const TOKEN_COUNT = 5;
export const SAFE_CELLS = new Set([0, TRACK_LENGTH - 1]);

function createCell(index) {
  const cell = document.createElement('button');
  cell.type = 'button';
  cell.className = 'cell';
  cell.dataset.index = String(index);
  if (SAFE_CELLS.has(index)) {
    cell.classList.add('safe');
  }
  return cell;
}

export function createBoard(boardEl, onCellClick) {
  boardEl.innerHTML = '';
  const cells = [];

  for (let i = 0; i < TRACK_LENGTH; i += 1) {
    const cell = createCell(i);
    cell.addEventListener('click', () => onCellClick(i));
    cells.push(cell);
    boardEl.appendChild(cell);
  }

  return cells;
}

export function renderBoard(cells, state) {
  cells.forEach((cell) => {
    cell.innerHTML = '';
    const idx = Number(cell.dataset.index);
    // Use light/dark instead of red/blue
    for (const color of ['light', 'dark']) {
      const tokens = state[color].tokens.filter((token) => token.position === idx);
      tokens.forEach(() => {
        const disc = document.createElement('div');
        disc.className = `disc ${color}`;
        cell.appendChild(disc);
      });
    }
  });
}

export function throwSticks(stickCount = 4) {
  const sticks = Array.from({ length: stickCount }, () => Math.random() < 0.5);
  const marked = sticks.filter(Boolean).length;
  const moveDistance = marked === 0 ? 5 : marked;
  return { sticks, moveDistance };
}

export function renderThrow(throwTrayEl, sticks) {
  throwTrayEl.innerHTML = '';
  sticks.forEach((marked) => {
    const stick = document.createElement('div');
    stick.className = `stick ${marked ? 'marked' : ''}`;
    throwTrayEl.appendChild(stick);
  });
}
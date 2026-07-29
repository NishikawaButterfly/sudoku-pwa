# Sudoku Instantáneo — Progressive Web App

[![Tests](https://github.com/NishikawaButterfly/sudoku-pwa/actions/workflows/test.yml/badge.svg)](https://github.com/NishikawaButterfly/sudoku-pwa/actions/workflows/test.yml)
[![Deploy to GitHub Pages](https://github.com/NishikawaButterfly/sudoku-pwa/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/NishikawaButterfly/sudoku-pwa/actions/workflows/deploy-pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A responsive and installable Sudoku game built with semantic HTML, modern CSS and vanilla JavaScript. It includes six difficulty levels, automatic local saving, candidate notes, hints, undo, keyboard controls and offline support.

[**Play the live demo**](https://jazzy-wisp-f7af77.netlify.app/)

## Project overview

The first version was distributed as a standalone HTML file. That approach worked in desktop browsers, but some mobile messaging applications opened it as a restricted document preview and prevented the JavaScript controls from working correctly.

This project solves that delivery problem by packaging the game as a Progressive Web App (PWA) that can be opened through a public HTTPS URL, installed on supported devices and used offline after the first visit.

## Features

- Six difficulty levels with 24 uniquely solvable puzzles
- Responsive touch interface for phones, tablets and desktops
- Candidate-note mode
- Hint, erase, undo and pause controls
- Timer, mistake counter and completion summary
- Automatic progress persistence with `localStorage`
- Native Web Share API support with clipboard fallback
- Keyboard controls and accessible labels
- Installable PWA manifest
- Offline application shell through a service worker
- No accounts, analytics, advertising or external runtime dependencies

## Technology

- Semantic HTML5
- Modern CSS and responsive layouts
- Vanilla JavaScript ES modules
- Web Storage API
- Service Worker and Cache API
- Web App Manifest
- Python puzzle-generation utility
- Playwright smoke tests
- GitHub Actions continuous integration
- GitHub Pages and Netlify deployment configuration

## Project structure

```text
sudoku-pwa/
├── .github/workflows/
│   ├── deploy-pages.yml
│   └── test.yml
├── assets/icons/
├── src/
│   ├── app.js
│   ├── puzzles.js
│   └── styles.css
├── tests/smoke.spec.js
├── tools/generate_puzzles.py
├── index.html
├── manifest.webmanifest
├── sw.js
├── netlify.toml
└── README.md
```

## Run locally

The service worker requires an HTTP origin, so open the project through a local server rather than double-clicking `index.html`.

```bash
python3 -m http.server 4173
```

Then visit `http://localhost:4173`.

## Tests

```bash
npm install
npx playwright install chromium
npm test
```

The smoke suite verifies that the application loads, exposes six difficulty levels, creates an 81-cell board, accepts input, saves the game state, activates note mode and pauses the game.

## Puzzle generation and validation

`tools/generate_puzzles.py` creates complete boards through randomized backtracking, removes clues and checks that every generated puzzle has exactly one solution. The validated puzzle data is stored in `src/puzzles.js`, so the browser does not need to perform expensive generation work at runtime.

The repository includes 24 puzzles: four for each of the six difficulty levels.

## Privacy

Game state is stored only in the user's browser. The application does not require registration and does not include analytics, tracking scripts or advertising code.

## Accessibility

The board exposes grid semantics, row and column labels, focus-visible states, keyboard number entry and reduced-motion support. Accessibility is treated as an ongoing part of the project; additional automated audits are included in the roadmap.

## Roadmap

- Add automated accessibility checks
- Add statistics by difficulty
- Add optional dark mode
- Add a daily challenge
- Add internationalisation
- Improve offline-update notifications

## License

Released under the [MIT License](LICENSE).

# Ridgeline

Compare lunar landing sites and dates: does a lander get sunlight and a line of sight to Earth, against the real horizon? Built for NASA Space Apps Challenge Singapore 2026 ("Lunar Landing Site Navigator").

Status: scaffold. Live URL, method and results are added as the build progresses.

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # unit tests
npm run typecheck
npm run lint
npm run build      # static export in out/, plus out/sw.js
npm run e2e        # Playwright smoke test
```

Pipeline (Python 3.12): `pip install -r pipeline/requirements.txt`, then `pytest pipeline/tests`.
Raw and work data live outside the repo at `LSP_DATA_DIR` (default `C:/Users/User/lsp-data`).

## Credits

- unslop by Damir Sokolovsky (@heydamir), CC BY 4.0
- Astryx by Meta
- Data sources: see [DATA_SOURCES.md](DATA_SOURCES.md)

Licence: MIT.

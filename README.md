# Chassu Rider v1.1.0

Endless downhill sled from Playadda. Steer the slope, jump the gaps, dodge pines, rocks, snowmen and rolling snowballs, and grab gifts before the mountain takes you.

## Run

```bash
npm install
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173/chassu-rider/`).

```bash
npx tsc -b
npm run build
npm run preview
```

Production assets are built with base `/chassu-rider/` to match the Playadda path `https://playadda.duckdns.org/chassu-rider/`.

Serve the SPA so client paths do not 404:

```nginx
location /chassu-rider/ {
    try_files $uri $uri/ /chassu-rider/index.html;
}
```

## Playadda UX

- Version stamp **v1.1.0** on the HUD and title card
- How to play + **Start** on the same title screen (no extra step)
- High score always shown; updates live when beaten (`localStorage`)

## Play

1. **Start** the run. The sled goes downhill on its own.
2. Steer with **A / D** or the arrow keys. On a phone, hold the left or right half of the screen.
3. Jump with **W**, **Up**, or **Space**. On a phone, tap the center or swipe up.
4. Gifts add to your score. Hitting a tree, rock, snowman, snowball, or falling into a gap ends the run.
5. Best score is kept in `localStorage`.

## Stack

- Vite + React 19 + TypeScript
- three.js (WebGL) endless slope
- Procedural SFX (Web Audio)

## License

Use and modify freely for personal or commercial projects.

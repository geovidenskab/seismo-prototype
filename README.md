# Kom til kernen — Seismisk netværk

Prototype: smartphones som seismiske stationer i et klasserum-netværk.

## Hurtig start

```bash
npm install
npm run dev        # starter server med --watch
```

Åbn `http://localhost:3000` — vælg "Opret session" (dashboard) eller "Tilslut station" (telefon).

## Sådan tester du

1. Åbn dashboard i en browser: `http://localhost:3000/dashboard/`
2. Tryk "Opret nyt seismisk netværk" → du får en 4-cifret kode og QR
3. Åbn station-URL på din telefon (samme netværk): `http://<din-ip>:3000/station/?code=XXXX`
4. Giv tilladelser → kalibrering → station er klar
5. Tryk "Countdown + start" på dashboardet
6. Bank på bordet ved telefonen → se seismogrammet

### Test på telefon (kræver HTTPS eller localhost)

Accelerometeret virker kun over HTTPS eller localhost. To muligheder:

**A) Ngrok (nemmest):**
```bash
npx ngrok http 3000
```
Brug den genererede https-URL.

**B) Cloudflare Tunnel:**
```bash
cloudflared tunnel --url http://localhost:3000
```

## Filstruktur

```
seismo/
├── server.js                 # Express + WebSocket server
├── package.json
├── public/
│   ├── index.html            # Landing page
│   ├── station/
│   │   └── index.html        # Mobilklient (telefon-seismograf)
│   └── dashboard/
│       └── index.html        # Lærer-dashboard
```

## API

### REST

| Endpoint | Metode | Beskrivelse |
|----------|--------|-------------|
| `/api/session` | POST | Opret ny session → `{ code, joinUrl, qr }` |
| `/api/session/:code` | GET | Session-info med stationsliste |
| `/api/session/:code/control` | POST | Styr optagelse: `{ action: "countdown"|"start"|"stop"|"reset" }` |

### WebSocket

Forbind: `ws://host/ws?code=XXXX&role=station|dashboard`

**Station → Server:**
- `sync:ping` — tidssynkronisering
- `station:ready` — metadata efter kalibrering
- `data` — accelerometer-batch `{ t, z, peak }`
- `trigger` — STA/LTA trigger-event

**Server → Alle:**
- `countdown` — nedtælling starter
- `recording:start` / `recording:stop` — optagelseskontrol
- `session:reset` — nulstil til lobby

**Server → Dashboard:**
- `station:joined` / `station:left` / `station:ready`
- `data` — videresendt fra stationer
- `trigger` — videresendt trigger-events

## Næste skridt

Se `kom-til-kernen-analyse.md` for den fulde udviklingsplan. Kort prioriteret:

1. **Kort over stationer** — Leaflet-integration på dashboard
2. **Triangulering** — beregn epicenter fra ankomsttider
3. **Jordens tværsnit** — bølge-visualisering med skyggezone
4. **Sonifikation** — Web Audio API, accelerometer → lyd
5. **Event-mode** — skalering til hundredvis af deltagere

## Tech stack

- **Server:** Node.js, Express, ws, qrcode
- **Klient:** Vanilla JS, DeviceMotion API, Geolocation API, Canvas
- **Ingen build-step** — serveres direkte som statiske filer

# Kom til kernen — Seismisk netværk

Prototype: smartphones som seismiske stationer i et klasserum-netværk. Inspireret af Inge Lehmanns opdagelse af Jordens indre kerne — eleverne bliver netværket.

## To øvelser

På dashboardet vælges en af to øvelser når en session oprettes:

**🔇 Hvor stille kan du være?** — én elevtelefon, kontinuerligt live-signal projiceret på lærertavlen. Ingen optagelses-knap; bare lyt og scroll tilbage hvis I så noget spændende. Mild high-pass + auto-skalering fanger selv hvisken. (Mode A — fuldt færdig)

**📐 Mål bølgehastigheden** — flere telefoner i kendt afstand, bank på bordet, mål Δt mellem trigger-tider. Klassisk countdown + optagelse + review-flow. (Mode B — afstands-input og hastigheds-beregning kommer i næste etape; selve flow'et virker)

## Hurtig start

```bash
npm install
npm run dev        # starter server med --watch
```

Åbn `http://localhost:3000` — vælg "Åbn lærer-dashboard" og pluk en øvelse.

## Sådan tester du

1. Åbn dashboard: `http://localhost:3000/dashboard.html`
2. Vælg en øvelse — du får en 4-cifret kode og QR
3. Åbn station-URL på telefonen (samme netværk): `http://<din-ip>:3000/station.html?code=XXXX`
4. Giv tilladelser → kalibrering → stationen kører
5. **Mode A**: læg telefon på bordet → signal vises live; tryk Pause for at spole tilbage
6. **Mode B**: tryk "Countdown + start" → bank på bordet → seismogram fyldes

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

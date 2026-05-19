# Kom til kernen — Seismisk netværk

Prototype: smartphones som seismiske stationer i et klasserum-netværk. Inspireret af Inge Lehmanns opdagelse af Jordens indre kerne — eleverne bliver netværket.

**Live:** [https://geo.sg.dk/seismograf](https://geo.sg.dk/seismograf)

## To øvelser

På dashboardet vælges en af to øvelser når en session oprettes:

**Hvor stille kan du være?** — én elevtelefon, kontinuerligt live-signal projiceret på lærertavlen. Ingen optagelses-knap; bare lyt og scroll tilbage hvis I så noget spændende. Mild high-pass + auto-skalering fanger selv hvisken. Klasse-magnitude (log-skala over baggrundstøj) vises i header.

**Mål bølgehastigheden** — flere telefoner i kendt afstand, bank på bordet, mål Δt mellem trigger-tider. Live-tabel i lobby viser ankomstider mens du måler; forsøgsplanlægger udregner hvilke hastigheder I pålideligt kan måle med jeres opstilling. Review giver lineær regression med R², usikkerhed, og PNG/CSV-eksport.

## Brug i klassen

1. Lærer åbner [geo.sg.dk/seismograf](https://geo.sg.dk/seismograf) → "Åbn lærer-dashboard"
2. Vælg øvelse → få 4-cifret kode + QR
3. Eleverne scanner QR (eller åbner samme URL på deres telefon og taster koden)
4. Telefonerne giver tilladelse til accelerometer + position
5. Læg telefon(er) på bordet → kalibrering kører automatisk
6. Følg flow'et for den valgte øvelse

Telefonerne kræver kun **internet** — ikke samme wifi som læreren.

## Lokal udvikling

```bash
npm install
npm run dev        # node --watch server.js
```

Åbn `http://localhost:3000`. Accelerometer-API'er kræver HTTPS eller localhost, så for at teste fra en ekstern telefon under udvikling:

```bash
cloudflared tunnel --url http://localhost:3000
# eller: npx ngrok http 3000
```

## Filstruktur

```
seismo/
├── server.js                 # Express 5 + WebSocket-broker
├── package.json
└── public/
    ├── index.html            # Landing-side
    ├── dashboard.html        # Lærer-dashboard (begge moduser)
    ├── station.html          # Mobil-klient
    ├── manifest.webmanifest  # PWA — installerbar som home-screen-app
    ├── icon.svg              # 512×512 SVG-ikon (any-purpose)
    └── icon-maskable.svg     # SVG-ikon (maskable-purpose)
```

## API

### REST

| Endpoint | Metode | Beskrivelse |
|----------|--------|-------------|
| `/api/info` | GET | `{ host, version }` — bruges til QR + footer |
| `/api/session` | POST | `{ mode }` → `{ code, mode }` |
| `/api/session/:code` | GET | Session-info inkl. mode og stationsliste |
| `/api/session/:code/qr` | GET | SVG QR-kode + station-URL |
| `/api/session/:code/control` | POST | `{ action: "countdown"\|"start"\|"stop"\|"reset"\|"silent:start"\|"silent:stop", duration? }` |

### WebSocket

Forbind: `wss://host/seismograf/ws?code=XXXX&role=station|dashboard` (eller `ws://host/ws?...` lokalt).

**Station → Server:**
- `sync:ping` — tidssynkronisering (8 ping-pong runder, kun wavespeed-mode)
- `station:ready` — metadata efter kalibrering (lat, lng, hz, noise, offset)
- `data` — accelerometer-batch `{ t, z, peak }`
- `trigger` — STA/LTA trigger `{ t, amplitude }` (kun wavespeed-mode)

**Dashboard → Server:**
- `station:settings` — `{ alpha?, sendInterval? }` videresendes til stationer i sessionen

**Server → Klient(er):**
- `welcome` til station: `{ stationId, name, mode, version }`
- `init` til dashboard: `{ mode, version, stations, recording }`
- `station:joined` / `station:left` / `station:ready`
- `data` + `trigger` videresendes til dashboard
- `countdown` / `recording:start` / `recording:stop` / `session:reset`
- `station:settings` (relayed til stationer)
- `error` med besked-tekst

## Næste skridt (ikke implementeret)

- **Sonifikation** — Web Audio API, accelerometer → lyd (knytter til "Hør kortet synge")
- **Kort over stationer** — Leaflet på dashboard (GPS-koordinater er allerede indsamlet)
- **Integration med kom-til-kernen-seismik** — embed bølgevisualisering som side-panel
- **Didaktisk indpakning** — lærervejledning, elevopgaver, fællesfaglig naturfagsprøve-ramme

## Tech stack

- **Server:** Node.js, Express 5, ws, qrcode
- **Klient:** Vanilla JS, Canvas 2D, DeviceMotion API, Geolocation API, Wake Lock API
- **Ingen build-step** — public/ serveres direkte som statiske filer
- **PWA** — installerbar via "Add to Home Screen"

## Deploy

Live deployment styres af `deploy-geo.sh` i `~/sans-science/GEO_site/deployment/`. App'en kører via PM2 som `seismograf` (port 3012) og Apache reverse-proxyer `/seismograf/*` → `localhost:3012/*`.

```bash
cd ~/sans-science/GEO_site/deployment
./deploy-geo.sh deploy Kom-til-kernen
```

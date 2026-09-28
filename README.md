# Spur

Spur turns Meshtastic location exports into interactive hiking maps. It detects route stages, calculates useful trip statistics, matches photos to waypoints, and creates a link that can be shared with everyone who joined the trip.

Route files are processed in the browser. Suggested stages can be renamed, rearranged, enabled, or excluded before sharing. Spur displays duration, distance, elevation gain and loss, pace, and climbing rate. Photos are matched by capture time, resized, and stripped of metadata. JPEG, PNG, WebP, HEIC, and HEIF are supported.

## Features

- Import Meshtastic location exports without uploading the source file.
- Detect and edit drives, walks, hikes, and pauses.
- Explore routes on an interactive topographic map and elevation profile.
- Analyse distance, duration, elevation, pace, and climbing statistics.
- Match photos to waypoints automatically (by time window) or attach them manually.
- Share selected route stages through a private link with your hiking friends

## Getting started

Spur requires Node.js 20 or newer. Fork the repository on GitHub, clone your fork, and install the dependencies:

```bash
git clone https://github.com/<your-user>/spur.git
cd spur
npm install
npm run dev
```

Open http://localhost:3000. Importing routes, editing stages, viewing statistics, and adding local photos work without additional configuration. Sharing requires Vercel Blob storage.

Run the project checks before opening a pull request:

```bash
npm run typecheck
npm test
```

## Deploying to Vercel

Import the GitHub repository as a new Vercel project. Vercel detects the Next.js configuration automatically. In the project dashboard, create a private Blob store and connect it to all environments. Frankfurt (`fra1`) is a suitable region for deployments in Europe. Redeploy the project once so the generated environment variables become available.

For local sharing support, run `npx vercel link` followed by `npx vercel env pull .env.local`, then restart the development server.

## Sharing and privacy

Sharing stores a snapshot containing only **active** stages and valid waypoints. Hidden stages, such as the drive to the trailhead, are not included in the public route.

The original route data is stored privately and can only be read with the edit token. The creator is recognized in the original browser and can copy a separate edit link for another device. Shared pages are excluded from search engines, and deleting a link permanently removes its route and photos.

## Input format

The import file needs a header row and may use tabs, commas, or semicolons. Recognized columns include `Latitude`, `Longitude`, `Altitude`, `Sats`, `Speed`, and `Zeitstempel`, with aliases such as `timestamp` and `time`. Timestamps may use `26.9.2026 10:39`, ISO 8601, or Unix time.

Invalid timestamps, exact duplicates, and GPS outliers are marked as excluded but are never removed from the source data. They can be inspected and restored from the route editor.

## Project structure

```text
app/                       Next.js pages and API routes
components/                Application interface and map components
lib/                       Parsing, route, statistics, and snapshot logic
lib/server/store.ts        Private Vercel Blob storage
tests/                     Logic tests
public/beispiel.txt        Example Meshtastic route
public/*.HEIC              Example route photo
```

## Notes

OpenTopoMap tiles are based on OpenStreetMap data. Their attribution must remain visible. Location intervals of five minutes can underestimate distance on winding trails; intervals close to **one minute** produce more accurate results.

## Roadmap

- Support GPX, JSON, and MQTT-derived route data.
- Add named waypoints and short route descriptions.
- Add telemetry such as battery levels and sensor readings.
- Organize multiple shared routes into collections.


**AI disclosure**

> This project was built with substantial assistance from AI, including implementation, debugging, testing, and documentation.

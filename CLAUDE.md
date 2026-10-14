# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and to human contributors
when working with code in this repository.

## What this is

A Gladys Assistant **external integration** (Node 22+, ESM, no build step, one runtime
dependency: `@gladysassistant/integration-sdk`) for **EcoleDirecte**, the French school
platform. It logs in with a parent or student account and turns each child into a
Gladys device: general average, last grade, homework, next lesson, absences, delays,
unread messages. Gladys 5.1+ adds scene triggers (new grade, new homework, new
absence, lesson cancelled, new message), scene actions (refresh, homework of a day,
timetable of a day) and three widgets (overview, homework, timetable).

It started from the official template
([GladysAssistant/integration-template-js](https://github.com/GladysAssistant/integration-template-js))
and uses the same workflows as [prohand/gladys-devmel](https://github.com/prohand/gladys-devmel).

## Commands

```bash
npm install
npm test                                    # node --test (built-in runner)
node --test test/runtime.test.js            # one file
node --test --test-name-pattern "grade"     # tests whose name matches
npm run lint                                # eslint .
npm run format:check                        # prettier --check . (CI gate)
npm run format                              # prettier --write .
npx github:GladysAssistant/integration-store .   # store admission checks
```

CI runs `format:check`, `lint`, `test` on Node 22 and 24, and on pull requests the
store checks and a Docker build. Releases: **Actions → Release** only (bumps
`package.json`, manifest `version` + `docker_image`, rolls the changelog, tags,
builds the multi-arch image, publishes the GitHub Release).

## Architecture

```
index.js                         SDK bootstrap only
src/app.js                       every Gladys handler, registered on one runtime
src/runtime.js                   session, sync loop, publication (devices, states, events,
                                 transports, connection status), double authentication
src/ecoledirecte/client.js       HTTP client: GTK cookie, login, token renewal, QCM
src/ecoledirecte/parse.js        raw API answers -> clean shapes (pure functions)
src/devices/student.js           the student device: features and states
src/capabilities/triggers.js     scene triggers: what is new since the last sync
src/capabilities/scenes.js       scene actions
src/capabilities/widgets.js      dashboard widgets
src/capabilities/days.js         today / tomorrow / next school day
src/actions.js                   Configuration screen buttons (test, security question)
src/store.js                     /data/ecoledirecte.json: cn/cv pair + ids already seen
src/config.js, src/dates.js, src/i18n.js
test/helpers/fakeEcoleDirecte.js fake API (fetch replacement) + fixtures
```

### Invariants worth knowing

- **The EcoleDirecte API is private.** Every call is a POST with `?verbe=` and a
  `data=<url-encoded JSON>` form body; the HTTP status is always 200, the outcome is
  the `code` of the JSON (200, 250 question, 505 credentials, 520/525 token, 517
  version, 535 school closed). Login needs the `GTK` cookie (GET `login.awp?gtk=1`)
  echoed in `X-Gtk`. A token only works with the User-Agent it was issued to: keep
  `USER_AGENT` constant. Reference: <https://github.com/EduWireApps/ecoledirecte-api-docs>.
- **Double authentication** (code 250): the user answers a question from two manifest
  actions; the answer gives a reusable `cn`/`cv` pair saved in `/data` and sent as
  `fa` at every login. While a question waits for its answer (10 min), automatic
  syncs are skipped: a new login would void it.
- **The first sync is a baseline**: it records the ids it sees and fires no event.
  Later syncs fire one event per new id, at most `MAX_EVENTS_PER_KIND` per kind. The
  ids are persisted, so a restart does not replay the year.
- **No `should_poll`**: one sync for every student, on the integration's own timer
  (`refresh_minutes`), plus a minute tick that republishes the time-dependent states
  (next lesson, homework for tomorrow) from memory with `publishChangedStates`.
- **Dates are school-local text** ("YYYY-MM-DD HH:mm") compared as strings, in the
  configured `timezone` (default Europe/Paris), never in the container's UTC.
- **A section that fails** (module off, endpoint down) keeps its previous value; a
  network, credentials or double-authentication error fails the whole sync, turns the
  transport badges to `unreachable` and sets the connection status.
- **Never log** the password, the token, the `cn`/`cv` pair.
- **The container rootfs is read-only**: write only under `/data`.
- External ids (`externalIds('student', <EcoleDirecte id>)`), feature keys, action,
  trigger, scene action, widget and config keys are stored by users: never rename them.

### Manifest

`test/manifest.test.js` keeps `gladys-assistant-integration.json` in sync with the
code (handlers, triggers fired, defaults, day options) and checks that every text
exists in the four languages. The manifest declares `"transports": ["cloud"]`:
EcoleDirecte is an internet service, there is no local channel.

## Rules

- **Versions belong to the Release workflow.** Never edit `version` in `package.json`
  or the manifest, nor the `docker_image` tag, by hand.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]` in
  `CHANGELOG.md` (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`). Never write
  a version heading: the Release workflow does it.
- **User-facing text** is `{ en, fr, de, es }` (built with `src/i18n.js`); user docs in
  `docs/en.md`, `docs/fr.md`, `docs/de.md` and `docs/es.md`, kept in sync.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why, in
  English. Tests never touch the network: use `test/helpers/fakeEcoleDirecte.js` and
  the SDK's `createFakeGladys()`.

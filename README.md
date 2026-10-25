# Gladys EcoleDirecte

External integration for [Gladys Assistant](https://gladysassistant.com) that brings
**EcoleDirecte** — the French school platform — into Gladys: grades and averages,
homework, timetable, absences and delays, messages. Built with the official
JavaScript SDK
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
from the [official template](https://github.com/GladysAssistant/integration-template-js).

- **Transport:** `cloud` (EcoleDirecte is an internet service; nothing runs on your LAN).
- **Gladys:** 5.3.0 or later (catalog keywords and countries; scene triggers, scene actions
  and widgets need 5.1.0).
- **Languages:** English, French, German, Spanish.

User documentation: [English](docs/en.md) · [Français](docs/fr.md) ·
[Deutsch](docs/de.md) · [Español](docs/es.md).

## What you get

| Surface        | Content                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Devices        | One per child: general average, last grade, homework for tomorrow / to do, next lesson, absences, delays, unread messages |
| Scene triggers | `new_grade`, `new_homework`, `new_absence`, `lesson_cancelled`, `new_message`                                             |
| Scene actions  | `refresh`, `get_homework` (today / tomorrow / next school day), `get_timetable`                                           |
| Widgets        | `student_overview`, `homework`, `timetable`                                                                               |
| Configuration  | `test_connection`, `double_auth_question` + `double_auth_answer` (EcoleDirecte security question)                         |

## Project structure

```
.
├─ index.js                          # SDK bootstrap
├─ src/
│  ├─ app.js                         # every Gladys handler
│  ├─ runtime.js                     # session, sync, publication, double authentication
│  ├─ actions.js                     # Configuration screen buttons
│  ├─ ecoledirecte/client.js         # HTTP client (GTK, login, token, QCM)
│  ├─ ecoledirecte/parse.js          # API answers -> clean data
│  ├─ devices/student.js             # the student device
│  ├─ capabilities/                  # triggers, scene actions, widgets, days
│  ├─ store.js                       # /data/ecoledirecte.json
│  └─ config.js, dates.js, i18n.js
├─ docs/{en,fr,de,es}.md             # user documentation (re-hosted by Gladys)
├─ test/                             # node --test, fake EcoleDirecte + fake Gladys
├─ gladys-assistant-integration.json # manifest
├─ Dockerfile                        # Node 24 Alpine, read-only rootfs ready
├─ CHANGELOG.md · CLAUDE.md · SECURITY.md
└─ .github/                          # CI, Release, build, GitHub releases, Dependabot
```

## Development

```bash
npm install
npm test               # unit tests (no network)
npm run lint           # ESLint
npm run format:check   # Prettier
npx github:GladysAssistant/integration-store .   # store checks
```

Run it against a Gladys instance:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="ecoledirecte" \
ECOLEDIRECTE_DATA_DIR="./data" \
LOG_LEVEL=debug \
npm start
```

## Workflows

The same as [prohand/gladys-devmel](https://github.com/prohand/gladys-devmel):

- **CI** (`ci.yml`) — Prettier, ESLint and tests on Node 22 and 24; on pull requests,
  the store admission checks and a Docker build.
- **Release** (`release.yml`) — Actions → Release → patch / minor / major: bumps
  `package.json` and the manifest, rolls `CHANGELOG.md`, tags, then calls the build
  and the GitHub Release.
- **Build** (`build.yml`) — multi-arch image (`linux/amd64`, `linux/arm64`) on
  `ghcr.io/prohand/gladys-ecoledirecte`.
- **GitHub releases** (`github-release.yml`) — one GitHub Release per version tag.
- **Dependabot** — npm weekly, GitHub Actions and Docker monthly.

To publish in the store, add the GitHub topic `gladys-assistant-integration` to the
repository, then run the Release workflow.

## A word on the API

EcoleDirecte has no public API. This integration uses the one the official web app
uses, as documented by the community
([EduWireApps/ecoledirecte-api-docs](https://github.com/EduWireApps/ecoledirecte-api-docs)).
It may change without notice: the Release workflow makes a fix quick to ship. The
integration is not affiliated with EcoleDirecte or its editor.

## License

Apache-2.0

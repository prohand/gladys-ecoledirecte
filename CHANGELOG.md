# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

## [Unreleased]

## [1.0.1] - 2026-10-14

### Added

- EcoleDirecte connection with a parent or a student account: GTK cookie, token renewal, and the security question (double authentication) answered from the Configuration screen, its answer kept in `/data` for the next starts.
- One device per child: general average, last grade (number and text), homework for tomorrow, homework to do, next lesson, absences, delays and unread messages.
- Scene triggers (Gladys 5.1+): new grade, new homework, new absence or delay, lesson cancelled, new message.
- Scene actions (Gladys 5.1+): refresh EcoleDirecte, get the homework of a day, get the timetable of a day (first start, last end, cancelled lessons).
- Dashboard widgets (Gladys 5.1+): school overview, homework, timetable.
- Cloud transport badge per child (cloud, or unreachable after a failed sync).
- English, French, German and Spanish texts (configuration screen, messages, widgets, documentation).
- `SECURITY.md`, `CHANGELOG.md` and `CLAUDE.md`.
- CI (format, lint, tests on Node 22 and 24, store checks and Docker build on pull requests), UI-driven Release workflow, multi-arch image build, GitHub Releases and Dependabot.

[Unreleased]: https://github.com/prohand/gladys-ecoledirecte/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/prohand/gladys-ecoledirecte/releases/tag/v1.0.1

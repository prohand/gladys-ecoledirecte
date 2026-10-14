# Security policy

## Supported versions

Only the latest release of the EcoleDirecte integration receives security fixes.
Update the integration from the Gladys store before reporting an issue.

| Version      | Supported |
| ------------ | --------- |
| 1.x (latest) | Yes       |
| older        | No        |

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Report it privately through GitHub: open the **Security** tab of
[prohand/gladys-ecoledirect](https://github.com/prohand/gladys-ecoledirect/security),
then **Report a vulnerability**.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- any log line that helps (remove usernames, passwords, tokens and children's
  names first).

You should get a first answer within 7 days. A fix is released as a new version of
the integration, and the advisory is published once users can update.

## Scope

In scope: the code of this repository and the Docker image it publishes.

Out of scope: Gladys Assistant itself (report to
[GladysAssistant/Gladys](https://github.com/GladysAssistant/Gladys/security)) and
EcoleDirecte (report to its editor, Aplim).

## What the integration handles

This integration reads school data about children: grades, homework, timetable,
absences and messages. It handles it this way:

- the EcoleDirecte password is stored by Gladys in a `secret` field and only sent to
  `api.ecoledirecte.com`, over HTTPS;
- the password, the session token and the double-authentication answer (`cn`/`cv`)
  are never written to the logs;
- the double-authentication answer and the ids of the items already seen are kept
  in `/data/ecoledirecte.json` (file mode `600`), inside the integration's own
  volume; nothing else is written to disk;
- the integration talks to no other service than EcoleDirecte and Gladys.

## Good practices for users

- Prefer a parent account to a child's account: it is the one meant to follow the
  schooling.
- Use a password you use nowhere else.
- Keep Gladys and the integration up to date.

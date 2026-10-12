# Project notes for Claude Code

The complete spec for this project is BUILD_SPEC.md. Follow it exactly.

- Before starting or continuing any phase, re-read BUILD_SPEC.md.
- Work through the phases in order. After each phase: run lint, typecheck, tests and build, fix every failure, then commit and push with the message "Phase N complete" and report each acceptance check as pass or fail.
- Stop after each phase and wait for "continue", unless my message for this run says to carry on to a later phase. Then stop only after that phase, or earlier if you need something from me (a token, a decision, a new dependency).
- Never add sample or demo content to /content. Test fixtures live only in tests/fixtures.
- Never commit .env files, tokens or secrets. Never print a token in the chat or in logs.
- Ask before adding any dependency that is not listed in BUILD_SPEC.md.
- Before starting work in a new session, run `git pull`: notes added from the admin panel arrive as commits on GitHub.

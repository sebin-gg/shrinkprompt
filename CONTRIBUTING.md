# Contributing to BrevityPrompt

Thanks for improving BrevityPrompt. Bugs, documentation corrections, test
coverage, and focused fixes are welcome.

Participation follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Before you start

- Search existing issues and pull requests. Open an issue first for changes
  that alter behavior, permissions, supported sites, privacy, or architecture.
- Keep each pull request single-purpose. Report unrelated findings separately.
- Read [AGENTS.md](AGENTS.md) before changing extension or Companion code.
- Do not add features, platforms, permissions, or non-localhost endpoints
  without maintainer agreement.

## Local setup

Requirements: Chrome or Chromium, Node.js with pnpm, and Python 3.12 for
Companion work. Podman Compose is preferred; Docker Compose is compatible.

```bash
git clone https://github.com/sebin-gg/shrinkprompt.git
cd shrinkprompt
sfw pnpm install
```

Copy `.env.example` to `.env` only when testing Fireworks. Never commit `.env`
or API keys. Start the optional Companion with:

```bash
podman compose up --build
# Docker-compatible fallback: docker compose up --build
```

Load the repository root as an unpacked extension from `chrome://extensions`.
See [INSTALL.md](INSTALL.md) and [DEVELOPMENT.md](DEVELOPMENT.md) for details.

## Make and verify changes

1. Create a focused branch from current `main` (`fix/...`, `docs/...`,
   `test/...`, or `chore/...`).
2. Preserve Manifest content-script order. Treat site selectors as fragile.
3. Update README/setup/privacy docs when observable behavior changes.
4. Run relevant checks before opening a PR:

   ```bash
   sfw pnpm test
   python -m unittest discover -s backend\tests -v
   git diff --check
   ```

5. Test affected ChatGPT, Claude, or Gemini flow manually when changing
   content scripts, adapters, or interception.

## Pull requests

- Use Conventional Commits: `fix: handle empty prompt`,
  `docs: clarify Companion setup`.
- Explain problem, solution, tests, and any privacy/permission impact.
- Keep unrelated formatting, generated files, debug logs, and dead code out.
- Do not force-push after review starts; add normal follow-up commits.
- Ensure checks pass before requesting review.

## Security and privacy

Do not include secrets, raw user prompts, or sensitive logs in issues, commits,
or screenshots. Report security vulnerabilities privately to project maintainers
rather than opening a public issue.

Contributions are submitted under the [Apache License 2.0](LICENSE).

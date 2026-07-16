# BrevityPrompt Privacy Policy

Effective date: 2026-07-16

BrevityPrompt shortens prompts on ChatGPT, Claude, and Gemini. It is local-first.

## Data processed

- Prompt text is processed in the extension to remove configured filler and optimize structure.
- The extension stores only settings and aggregate usage statistics in browser storage. It does not store raw prompt text.
- If the user enables Ollama, prompt text is sent only to the configured local Ollama endpoint.
- If the user enables Companion cloud compression and the prompt meets the user-configured length threshold, prompt text is sent to the configured local Companion endpoint. The Companion may send it to Fireworks AI when configured with a Fireworks API key.
- The optional Companion caches a hash of a prompt and its compressed result locally. It does not store raw prompts.

## Data not collected

BrevityPrompt has no analytics SDK, advertising, sale of data, remote code, or account system.

## User control

The extension is disabled by default. Users can disable it, disable remote options, and change optimization settings in the extension UI. Uninstalling the extension removes its browser storage according to browser behavior.

## Contact

Before store publication, replace this section with a monitored support email and host this policy at a public HTTPS URL used in the store listing.

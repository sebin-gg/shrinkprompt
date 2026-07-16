# Release Readiness

## Chrome Web Store

Build the upload ZIP:

```powershell
sfw pnpm run package:chrome
```

Upload `dist/brevityprompt-<version>-chrome.zip` to the Chrome Web Store. Before submission, the publisher must provide:

- Chrome Web Store developer account, agreements, and 2-step verification
- Store listing copy, screenshots, support email, and public HTTPS privacy-policy URL
- Permission justifications for `storage`, `activeTab`, `scripting`, and `webRequest`
- Accurate disclosure that prompts can be sent to a user-enabled local Companion and, when configured there, Fireworks AI

The manifest intentionally requests only permissions used by the extension. Keep permission changes minimal and document each one before submission.

## Firefox

Do not upload the Chrome ZIP to AMO. Firefox requires a separately validated MV3 build, Gecko ID/data-collection declarations, and desktop/mobile testing. The current MAIN-world telemetry and Chrome module service-worker design must be adapted or feature-gated first.

## Safari

Safari needs a separately tested Safari Web Extension wrapped in a signed macOS/iOS app and submitted through App Store Connect. It cannot target Windows, Linux, or Android.

## Platform scope

Supported release target after Chrome validation: Chrome/Chromium desktop on Windows, macOS, and Linux. Chrome Android does not support normal store extension installs. Firefox Android and Safari iOS require their separate release tracks.

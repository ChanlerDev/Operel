# Release Notes

## 0.1.0 Mac smoke checklist

Run from the repository root on a Mac with Screen Recording and Accessibility permissions granted:

```bash
npm run typecheck
npm run build
npm test
(cd macos && swift build)
./script/build_and_run.sh --verify
npm run smoke:signed-doctor
npm run smoke:agent
npm run smoke:textedit
```

`npm run smoke:signed-doctor` builds the Swift helper, ad-hoc signs it by default, then runs `operel-computer-use doctor --json` and requires:

- `helper_status = "ok"`
- `code_signing.status = "adhoc"` when `OPEREL_CODESIGN_IDENTITY` is not set

This proves the local helper is code-signed and that `doctor` can inspect the signing state. It is intentionally not a notarized distribution build.

To force a specific non-ad-hoc local identity:

```bash
OPEREL_CODESIGN_IDENTITY="Apple Development: Example (TEAMID)" npm run smoke:signed-doctor
```

With `OPEREL_CODESIGN_IDENTITY` set, the smoke requires `code_signing.status = "signed"` and a non-ad-hoc identity. In headless environments, this may require unlocking the keychain and granting `codesign` private-key access before running the smoke.

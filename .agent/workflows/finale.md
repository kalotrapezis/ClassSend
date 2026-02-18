---
description: Build, Release, and Deploy ClassSend
---

0. Version Validation **[NEW]**
// turbo
Run `git tag --sort=-v:refname | head -n 5` to see the most recent versions.
**Warn the user** if the proposed version number is lower than or equal to an existing tag (semver check).

1. Run Tests
// turbo
Run `npm test` to verify all checks pass.

2. Update Version Numbers (Comprehensive Sync)
Update `version` in the following files to match exactly:
- `package.json` (root)
- `client/package.json`
- `server/package.json`
- `server/package.json` -> `config.forge.makers[1].config.setupExe` (e.g., `ClassSend-9.2.0 Setup.exe`) **[CRITICAL]**
- `server/index.js` -> `api/discovery-info` endpoint (hardcoded version string)
- `client/index.html` -> CSS cache buster (e.g., `style.css?v=9.2.0`)
- `client/index.html` -> About section (`id="app-version-display"`)

3. Documentation
- Update `RELEASE_NOTES.md` with new changes.
- Update `README.md` if necessary.

4. Build Application
// turbo
Run the following to build the client and package the electron app:
```bash
# Build Client (must be done first)
cd client
npm run build

# Package Server (packages client assets into the build)
cd ../server
npm run make:win64-zip
```

5. Verification
- Verify artifacts exist in `server/out/make/zip/win32/x64/` and `server/out/make/squirrel.windows/x64/`.
- Verify the filenames contain the correct version number.

6. Upload to GitHub
- Commit all changes: `git add . && git commit -m "Release vX.X.X"`
- Tag the release: `git tag vX.X.X`
- Push to GitHub: `git push origin master --tags`
- **Upload**: Since `gh` CLI may be missing, manually upload the ZIP and EXE from `server/out/make/` to the GitHub Release page.
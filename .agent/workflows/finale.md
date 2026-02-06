---
description: Build, Release, and Deploy ClassSend
---

1. Run Tests
// turbo
Run `npm test` to verify all checks pass.

2. Update Version Numbers
Update `version` in:
- `client/package.json`
- `server/package.json`
- `package.json` (root)

*Versioning Logic:*
- **Major (x.0.0)**: Big changes / uncertainty.
- **Minor (0.x.0)**: New features.
- **Patch (0.0.x)**: Bug fixes.

3. Documentation
- Update `RELEASE_NOTES.md` with new changes.
- Update `README.md` if necessary.

4. Build Application
// turbo
Run the following to build the client and package the electron app:
```bash
cd client
npm run build
cd ../server
npm run make:win64-zip
```

5. Upload to GitHub
- Commit all changes: `git add . && git commit -m "Release vX.X.X"`
- Tag the release: `git tag vX.X.X`
- Push to GitHub: `git push && git push --tags`
- Upload the built `.zip` from `server/out/make/...` to the GitHub Release page.
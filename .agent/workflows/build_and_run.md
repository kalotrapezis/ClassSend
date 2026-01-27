---
description: Build and Run ClassSend
---

This workflow fixes the environment path for Node.js and builds/runs the application.

1. Set the environment PATH to include Node.js:
   ```powershell
   $env:Path = "C:\Program Files\nodejs;" + $env:Path
   ```

2. Install Client Dependencies:
   ```powershell
   // turbo
   cd client
   & "C:\Program Files\nodejs\npm.cmd" install
   ```

3. Build Client (outputs to ../server/public):
   ```powershell
   // turbo
   & "C:\Program Files\nodejs\npm.cmd" run build
   ```

4. Install Server Dependencies:
   ```powershell
   // turbo
   cd ../server
   & "C:\Program Files\nodejs\npm.cmd" install
   ```

5. Start the Application (Electron):
   ```powershell
   & "C:\Program Files\nodejs\npm.cmd" start
   ```

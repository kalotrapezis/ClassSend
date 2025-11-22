# ClassSend

## 📦 How to Transfer
1. Copy the entire `ClassSend` folder to the new computer.
2. **Tip**: You can delete the `node_modules` folders inside `client` and `server` before copying to make the transfer much faster. You will reinstall them in the next step.

## 🛠️ Prerequisites
- Install [Node.js](https://nodejs.org/) (LTS version).

## ⚙️ Setup on New Computer
1. **Install Server Dependencies**:
   Open a terminal in `ClassSend/server` and run:
   ```bash
   npm install
   ```
2. **Install Client Dependencies**:
   Open a terminal in `ClassSend/client` and run:
   ```bash
   npm install
   ```

## 📦 How to Run (Windows Executable)
The easiest way to run ClassSend!

1. Go to `ClassSend/server/dist`.
2. Double-click **`ClassSend.exe`**.
3. Open `http://localhost:3000` in your browser.
   - (Or `http://YOUR_IP:3000` for other devices on the network).

## 🚀 How to Run (Source Code)
Use this if you want to modify the code.

1. **Start Server**:
   In `ClassSend/server`:
   ```bash
   npm start
   ```
2. **Start Client**:
   In `ClassSend/client`:
   ```bash
   npm run dev
   ```
3. Open `http://localhost:5173` in your browser.

## 🌐 How to Run on Local Network
Use this to connect multiple computers (e.g., Teacher on Laptop, Students on Phones/Tablets).

1. **Find Server IP**:
   - Windows: Run `ipconfig` in terminal. Look for "IPv4 Address" (e.g., `192.168.1.X`).
   - Mac/Linux: Run `ifconfig`.

2. **Update Client Config**:
   Open `client/main.js` and replace `localhost` with your IP:
   ```javascript
   // Before
   const socket = io("http://localhost:3000");
   
   // After (Example)
   const socket = io("http://192.168.1.5:3000");
   ```

3. **Start Server**:
   ```bash
   npm start
   ```

4. **Start Client (Exposed)**:
   In `ClassSend/client`, run this special command to allow network access:
   ```bash
   npm run dev:host
   ```

5. **Connect**:
   On other devices, open `http://YOUR_IP:5173` (e.g., `http://192.168.1.5:5173`).

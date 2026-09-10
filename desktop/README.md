# SAMELCII Desktop Wrapper

This folder contains an Electron launcher for the existing SAMELCII web app.

What it does:
- Opens the current SAMELCII web UI in a desktop window
- Creates a per-client SQLite database in the user's profile
- Keeps the local database path outside the app folder so updates do not overwrite it

Local database path:
- Default: `%LOCALAPPDATA%/SAMELCII/desktop-cache/membership.sqlite`
- Override with `SAMELCII_SQLITE_PATH`

App URL:
- Default: `http://192.168.1.99/SAMELCII_WEB_SYSTEM/pages/auth/index.html`
- Change `server-url.txt` beside `SAMELCII Desktop.exe` to use another approved LAN, VPN, or HTTPS address.
- Managed PCs can still override it with `SAMELCII_APP_URL`.

Download and run on Windows:
1. Click **Download desktop app** on the login page.
2. Extract `SAMELCII-Desktop-Windows.zip`.
3. Open the extracted `SAMELCII Desktop` folder.
4. Double-click `SAMELCII Desktop.exe`.

Network use:
- Inside the office, keep the default address while the server computer is on and reachable.
- Outside the office, connect the computer to the company VPN, then use the VPN-reachable address in `server-url.txt`.
- A private `192.168.x.x` address cannot work directly over the public internet without a VPN or a properly secured public HTTPS server.

The portable package includes Electron and the required runtime modules. The employee computer does not need Node.js, npm, XAMPP, or the project source folder.

Build the downloadable package:
1. Install dependencies in this folder with `npm install` when needed.
2. Run `powershell -ExecutionPolicy Bypass -File .\build-portable.ps1`.
3. The generated file is `downloads/SAMELCII-Desktop-Windows.zip`.

Development run:
- Use `npm start` from this folder.

Launcher note:
- `START-DESKTOP.bat` remains available for development machines, but the login page now downloads the self-contained portable package.

Note:
- This is the desktop shell foundation.
- The existing web backend still handles the current app routes, while this creates the local SQLite base for future offline sync and client-side data storage.

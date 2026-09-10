# SAMELCII Web System - Complete Setup Guide for Server Admin (CODEX)

## Overview

This guide explains the complete setup for the SAMELCII Web System development workflow:

- **Developer** edits files locally on their machine
- **Auto-sync** automatically pushes changes to the server
- **Employees** access the system using `samelcii.local` domain

---

## What Has Been Set Up

### 1. Local Development Workflow
✅ **Developer Machine** (`C:\xampp\htdocs\007\amading-007`)
- Git repository initialized
- Auto-sync script created to watch for file changes
- Files automatically committed and pushed to server on save

### 2. Git Remote (Server)
✅ **Server Location** (`\\192.168.1.99\htdocs\SAMELCII_WEB_SYSTEM.git`)
- Bare git repository created on server
- Post-receive hook to auto-checkout files
- Ready to receive pushes from developer

### 3. Domain Name Setup
✅ **Developer machine** - Can already access `http://samelcii.local`
⏳ **Server Apache config** - Needs to be configured (YOU DO THIS)
⏳ **Employee machines** - Will need hosts file update

---

## YOUR Tasks (Server Admin)

### Task 1: Configure Apache VirtualHost

**File to use:** `samelcii-vhost.conf` (in the SAMELCII_WEB_SYSTEM folder)

#### Option A: Windows XAMPP Server
```
1. Open: C:\xampp\apache\conf\extra\httpd-vhosts.conf
2. Copy the content from samelcii-vhost.conf into it
3. Save the file
4. Open XAMPP Control Panel
5. Click "Restart" for Apache
```

#### Option B: Linux Apache Server
```bash
1. Copy samelcii-vhost.conf to: /etc/apache2/sites-available/samelcii.conf
   sudo cp samelcii-vhost.conf /etc/apache2/sites-available/samelcii.conf

2. Enable the site:
   sudo a2ensite samelcii

3. Test Apache config:
   sudo apache2ctl configtest
   (Should output: Syntax OK)

4. Restart Apache:
   sudo systemctl restart apache2
```

### Task 2: Verify Setup

Test that it works:
```
1. Open browser
2. Go to: http://samelcii.local/
3. Should see the SAMELCII_WEB_SYSTEM homepage

OR access by IP (always works):
http://192.168.1.99/SAMELCII_WEB_SYSTEM/
```

---

## How Developer Workflow Works

### Developer Side
```
1. Developer starts auto-sync script on their machine
2. Developer edits files in their local folder
3. Developer saves file (Ctrl+S)
4. Auto-sync automatically:
   - Detects the change
   - Commits to git
   - Pushes to server
5. Server files update automatically
```

### Files Flow
```
Local Machine                    Server (192.168.1.99)
============                    ====================
C:\xampp\htdocs\007\...
    ↓ (edit file)
    ↓ (save file)
    ↓ (auto-sync detects)
    → git commit
    → git push to server
                                \\192.168.1.99\htdocs\
                                SAMELCII_WEB_SYSTEM\
                                    (files updated!)
```

---

## Employee Access Setup

### For Windows Employees
Send them these instructions:

```
1. Open: C:\Windows\System32\drivers\etc\hosts
2. Add this line at the end:
   192.168.1.99    samelcii.local samelcii

3. Save the file

4. Now they can access:
   http://samelcii.local/pages/auth/index.html
   http://samelcii/pages/auth/index.html
```

### For Mac Employees
```bash
1. Open Terminal
2. Run: sudo nano /etc/hosts
3. Add this line:
   192.168.1.99    samelcii.local samelcii
4. Save: Ctrl+O, Enter, Ctrl+X
5. Now access: http://samelcii.local/pages/auth/index.html
```

### For Linux Employees
```bash
1. Open Terminal
2. Run: sudo nano /etc/hosts
3. Add this line:
   192.168.1.99    samelcii.local samelcii
4. Save: Ctrl+O, Enter, Ctrl+X
5. Now access: http://samelcii.local/pages/auth/index.html
```

---

## Troubleshooting

### Domain Not Working?
```bash
# Windows - Flush DNS cache
ipconfig /flushdns

# Mac - Flush DNS cache
sudo dscacheutil -flushcache

# Linux - Restart DNS service
sudo systemctl restart nscd
```

### Files Not Updating on Server?
1. Check auto-sync script is running on developer machine
2. Check git push is working: `git log --oneline`
3. Check folder permissions on server
4. Try manual push: `git deploy`

### Apache Not Starting?
1. Check Apache syntax: `httpd -t` (Windows) or `apache2ctl configtest` (Linux)
2. Check error logs in Apache folder
3. Ensure port 80 is not in use

---

## File Locations Reference

| Location | Purpose |
|----------|---------|
| `C:\xampp\htdocs\007\amading-007\...` | Developer local machine |
| `\\192.168.1.99\htdocs\SAMELCII_WEB_SYSTEM` | Server production files |
| `\\192.168.1.99\htdocs\SAMELCII_WEB_SYSTEM.git` | Git repository on server |
| `samelcii-vhost.conf` | Apache VirtualHost config |
| `auto-sync.ps1` | Auto-sync script (developer only) |

---

## Summary of What Developer Can Do Now

✅ **Developer can:**
- Edit files locally
- Auto-sync to server automatically
- Access: `http://samelcii.local/...`

✅ **Once YOU configure Apache:**
- Employees can access: `http://samelcii.local/...`
- No more typing long IP addresses
- Professional domain name

---

## Questions?

If something doesn't work, check:
1. Apache is running
2. VirtualHost config is added correctly
3. Hosts file entries are correct
4. DNS cache is flushed

Contact developer if needed!

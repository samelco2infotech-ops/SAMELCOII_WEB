# Quick Checklist for Server Admin (CODEX)

## ✓ What Developer Already Did

- [x] Set up git repository locally
- [x] Created auto-sync script
- [x] Configured git remote to server
- [x] Updated local hosts file for samelcii.local

---

## YOUR CHECKLIST (Server Admin)

### Step 1: Configure Apache VirtualHost

**Choose your server type:**

#### Windows XAMPP
```
[ ] 1. Open: C:\xampp\apache\conf\extra\httpd-vhosts.conf
[ ] 2. Copy content from: samelcii-vhost.conf file
[ ] 3. Paste it into httpd-vhosts.conf
[ ] 4. Save the file
[ ] 5. Open XAMPP Control Panel
[ ] 6. Click "Restart" for Apache
```

#### Linux Apache
```
[ ] 1. Copy file: cp samelcii-vhost.conf /etc/apache2/sites-available/samelcii.conf
[ ] 2. Enable site: sudo a2ensite samelcii
[ ] 3. Test config: sudo apache2ctl configtest
[ ] 4. Restart: sudo systemctl restart apache2
```

### Step 2: Verify It Works

```
[ ] 1. Open browser
[ ] 2. Go to: http://samelcii.local/
[ ] 3. Should load SAMELCII_WEB_SYSTEM homepage
[ ] 4. Try: http://samelcii.local/pages/auth/index.html
```

### Step 3: Create Employee Instructions Document

```
[ ] 1. Give employees: SERVER-SETUP-INSTRUCTIONS.md
[ ] 2. Or just tell them to add this line to their hosts file:
      192.168.1.99    samelcii.local samelcii
```

### Step 4: Done!

```
[ ] Employees can now access http://samelcii.local/
[ ] Developer auto-sync is working
```

---

## Quick Reference: How It Works

```
Developer edits file → Auto-sync detects → Git commit → Git push 
                                                ↓
                                    Server updated automatically
                                                ↓
                                    Employees access via samelcii.local
```

---

## Files You Need

1. **samelcii-vhost.conf** - Copy to Apache config
2. **CODEX-SETUP-GUIDE.md** - Detailed instructions (this folder)
3. **SERVER-SETUP-INSTRUCTIONS.md** - For employees

---

## If Something Doesn't Work

| Problem | Solution |
|---------|----------|
| samelcii.local not found | Check hosts file entry, flush DNS |
| Apache won't restart | Check vhost config syntax |
| Files not updating | Check auto-sync is running on developer machine |
| 404 error | Check VirtualHost DocumentRoot path is correct |

---

## Contact Developer If:
- Apache configuration help needed
- Files not syncing from developer machine
- Need to troubleshoot

Good luck! 🚀

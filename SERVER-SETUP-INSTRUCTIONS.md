# SAMELCII Domain Setup Instructions

## For Server Administrator (192.168.1.99)

### Step 1: Copy VirtualHost Configuration

Copy the content from `samelcii-vhost.conf` to your Apache configuration:

**If using XAMPP on Windows:**
```
C:\xampp\apache\conf\extra\httpd-vhosts.conf
```

**If using Linux/Apache:**
```
/etc/apache2/sites-available/samelcii.conf
```

### Step 2: Enable VirtualHost in Apache

In your main Apache config file (`httpd.conf`), make sure this line is uncommented:

**Windows XAMPP:**
```apache
Include conf/extra/httpd-vhosts.conf
```

**Linux:**
```apache
Include sites-enabled/*.conf
```

### Step 3: Restart Apache

**Windows XAMPP:**
- Open XAMPP Control Panel
- Click "Restart" for Apache

**Linux:**
```bash
sudo systemctl restart apache2
```

OR

```bash
sudo service apache2 restart
```

---

## For End Users / Employees

### For Windows Users

1. **Open hosts file:**
   ```
   C:\Windows\System32\drivers\etc\hosts
   ```

2. **Add this line at the end:**
   ```
   192.168.1.99    samelcii.local samelcii
   ```

3. **Save the file**

4. **Now you can access:**
   ```
   http://samelcii.local/pages/auth/index.html
   http://samelcii/pages/auth/index.html  (shorter version)
   ```

### For Mac/Linux Users

1. **Open Terminal**

2. **Edit hosts file:**
   ```bash
   sudo nano /etc/hosts
   ```

3. **Add this line:**
   ```
   192.168.1.99    samelcii.local samelcii
   ```

4. **Save** (Ctrl+O, then Enter, then Ctrl+X)

5. **Now you can access:**
   ```
   http://samelcii.local/pages/auth/index.html
   ```

---

## Testing

After setup, test with:
```
http://samelcii.local/
```

Should load the SAMELCII_WEB_SYSTEM homepage.

---

## Troubleshooting

**If it doesn't work:**

1. Check Apache is running
2. Check hosts file entry is correct
3. Try flushing DNS cache:
   - **Windows:** `ipconfig /flushdns`
   - **Mac:** `sudo dscacheutil -flushcache`
   - **Linux:** `sudo systemctl restart nscd`
4. Try accessing by IP: `http://192.168.1.99/SAMELCII_WEB_SYSTEM/`

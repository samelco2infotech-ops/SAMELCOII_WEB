# Frontend JWT Integration Guide

## Overview

The frontend has been updated to use JWT authentication with the new Node.js backend. This guide explains how to:

1. Update existing pages
2. Make API calls with JWT tokens
3. Implement page protection
4. Handle token expiration

---

## Quick Start

### 1. Include Required Scripts

Add these scripts to your HTML pages (in order):

```html
<!-- JWT API Client -->
<script src="/SAMELCII_WEB_SYSTEM/assets/js/api-client.js"></script>

<!-- Page Protection Utility -->
<script src="/SAMELCII_WEB_SYSTEM/assets/js/page-protection.js"></script>

<!-- Your page-specific script -->
<script src="/SAMELCII_WEB_SYSTEM/pages/your-module/index.js"></script>
```

### 2. Protect Pages

Add protection to your page's body tag:

```html
<body data-page-protection data-require-auth="true">
    <!-- Your content -->
</body>
```

Or in JavaScript:

```javascript
// On page load
PageProtection.setupPage({
    requiresAuth: true,
    minPrivilege: 0, // 0 = all users, 6+ = managers
});
```

### 3. Make API Calls

Use `APIClient.request()` for any API call:

```javascript
// GET request
const data = await APIClient.request('GET', '/dtr/records?year=2026&month=6');

// POST request
const result = await APIClient.request('POST', '/travel/create', {
    department: 'IT',
    destination: 'Cebu',
    purpose: 'Meeting',
    date: '2026-06-15'
});

// Handle errors
try {
    const result = await APIClient.request('POST', '/fuel/request', {
        liters: 50
    });
    console.log('Success:', result);
} catch (error) {
    console.error('Error:', error.message);
}
```

---

## API Client Methods

### Authentication

```javascript
// Login
const user = await APIClient.login(username, password);

// Register
const result = await APIClient.register(usercode, username, password);

// Reset Password
const result = await APIClient.resetPassword(identifier, newPassword);

// Logout
await APIClient.logout();

// Get Current User
const user = APIClient.getUser();

// Is Authenticated
const authed = APIClient.isAuthenticated();

// Get Token
const token = APIClient.getToken();
```

### User Methods

```javascript
// Search Employees
const employees = await APIClient.searchEmployees('john');

// Upload Profile Photo
await APIClient.uploadProfilePhoto(fileInput.files[0]);

// Get Current User (fresh from server)
const user = await APIClient.getCurrentUser();
```

### Generic API Calls

```javascript
// Any endpoint
const response = await APIClient.request('GET', '/dtr/records');
const response = await APIClient.request('POST', '/travel/create', {...});
```

---

## Page Protection

### Auto-Protection (Recommended)

Add to your page's `<body>`:

```html
<body data-page-protection 
      data-require-auth="true"
      data-min-privilege="0">
    <!-- Content is protected automatically -->
</body>
```

### Manual Protection

In your page's JavaScript:

```javascript
// Require authentication
if (!PageProtection.requireAuth()) {
    // User is not logged in, already redirected to login
    return;
}

// Require specific privilege (manager+)
if (!PageProtection.requirePrivilege(6)) {
    // User doesn't have required privilege
    return;
}

// Load and display user data
const user = await PageProtection.loadUserData();
PageProtection.displayUserInfo(user);

// Setup logout button
PageProtection.setupLogoutButton('.logout-btn');
```

---

## Displaying User Information

### HTML Elements

Use these data attributes to automatically populate user info:

```html
<!-- User Name -->
<span data-user-name></span>

<!-- User Avatar -->
<img data-user-avatar alt="User Avatar">

<!-- User Position -->
<span data-user-position></span>

<!-- User Department -->
<span data-user-department></span>
```

Call after page loads:

```javascript
PageProtection.displayUserInfo();
```

---

## Common Patterns

### DTR Module

```javascript
// Get monthly records
const response = await APIClient.request('GET', '/dtr/records?year=2026&month=6');
const records = response.records;

// Get daily record
const response = await APIClient.request('GET', '/dtr/daily?date=2026-06-01');
const daily = response.daily;

// Get yearly summary
const response = await APIClient.request('GET', '/dtr/summary?year=2026');
const summary = response.summary;
```

### Travel Orders

```javascript
// Get user's travel orders
const response = await APIClient.request('GET', '/travel/list');
const travels = response.travels;

// Create travel order
const response = await APIClient.request('POST', '/travel/create', {
    department: 'IT',
    destination: 'Manila',
    purpose: 'Conference',
    date: '2026-07-01'
});

// Approve travel order
await APIClient.request('POST', '/travel/approve?to_number=S2Y2600001');

// Reject travel order
await APIClient.request('POST', '/travel/reject?to_number=S2Y2600001', {
    reason: 'Duplicate'
});
```

### Fuel Management

```javascript
// Get fuel balance
const response = await APIClient.request('GET', '/fuel/balance?year=2026&month=6');
const balance = response.balance;

// Get fuel history
const response = await APIClient.request('GET', '/fuel/history?year=2026&month=6');
const history = response.history;

// Create fuel request
const response = await APIClient.request('POST', '/fuel/request', {
    liters: 50
});
const farCode = response.far_code;
```

### Leave Management

```javascript
// Get leave balance
const response = await APIClient.request('GET', '/leave/balance');
const balance = response.balance;

// Get leave history
const response = await APIClient.request('GET', '/leave/history?year=2026');
const history = response.history;

// Submit leave request
await APIClient.request('POST', '/leave/request', {
    leave_type: 'VL',
    date_from: '2026-06-15',
    date_to: '2026-06-17',
    reason: 'Vacation'
});
```

---

## Error Handling

### Standard Error Handling

```javascript
try {
    const result = await APIClient.request('POST', '/travel/create', {
        department: 'IT',
        destination: 'Cebu',
        purpose: 'Meeting',
        date: '2026-06-15'
    });
    
    console.log('Success:', result);
} catch (error) {
    if (error.message.includes('401')) {
        // Session expired, user is redirected automatically
        console.log('Session expired');
    } else {
        // Show error to user
        console.error('Error:', error.message);
    }
}
```

### User-Friendly Error Display

```javascript
// Show error message to user
const errorDisplay = (selector, message) => {
    const el = document.querySelector(selector);
    if (el) {
        el.textContent = message;
        el.style.display = 'block';
    }
};

try {
    const result = await APIClient.request('POST', '/leave/request', {...});
} catch (error) {
    errorDisplay('#error-message', error.message);
}
```

---

## Token Expiration Handling

Token expires after 7 days. The app automatically:

1. **Warns 1 hour before expiration** - Console warning and browser notification
2. **Redirects to login on 401** - API returns 401 when token expires
3. **Clears storage** - Invalid token is removed from localStorage

To manually check:

```javascript
// Check if user is still authenticated
if (!APIClient.isAuthenticated()) {
    window.location.href = '/SAMELCII_WEB_SYSTEM/pages/auth/index.html';
}
```

---

## Example: Complete DTR Page

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>DTR Records</title>
    <link rel="stylesheet" href="../../assets/css/style.css">
</head>
<body data-page-protection data-require-auth="true">
    <header>
        <h1>Duty Time Records</h1>
        <div>
            <span data-user-name></span>
            <button class="logout-btn">Logout</button>
        </div>
    </header>

    <div id="error-message" style="display:none;color:red;"></div>

    <div id="records-container">
        <!-- Records will be loaded here -->
    </div>

    <!-- Scripts -->
    <script src="../../assets/js/api-client.js"></script>
    <script src="../../assets/js/page-protection.js"></script>
    <script>
        // Load DTR records on page load
        document.addEventListener('DOMContentLoaded', async () => {
            try {
                // Get current month's records
                const year = new Date().getFullYear();
                const month = new Date().getMonth() + 1;
                
                const response = await APIClient.request(
                    'GET', 
                    `/dtr/records?year=${year}&month=${month}`
                );
                
                const container = document.getElementById('records-container');
                if (response.records.length === 0) {
                    container.innerHTML = '<p>No records found.</p>';
                    return;
                }

                // Display records
                container.innerHTML = response.records.map(record => `
                    <div class="record">
                        <p><strong>${record.work_date}</strong> (${record.day_name})</p>
                        <p>Morning: ${record.morning_in} - ${record.morning_out}</p>
                        <p>Afternoon: ${record.afternoon_in} - ${record.afternoon_out}</p>
                        <p>Undertime: ${record.undertime_min} mins</p>
                        <p>OT: ${record.ot_minutes} mins</p>
                    </div>
                `).join('');

            } catch (error) {
                document.getElementById('error-message').textContent = error.message;
                document.getElementById('error-message').style.display = 'block';
            }
        });
    </script>
</body>
</html>
```

---

## Migrating Existing Pages

### Step 1: Add Scripts to Page

```html
<!-- Add these before your page script -->
<script src="../../assets/js/api-client.js"></script>
<script src="../../assets/js/page-protection.js"></script>
```

### Step 2: Protect Page

```html
<body data-page-protection data-require-auth="true">
```

### Step 3: Update API Calls

**Node API call:**
```javascript
APIClient.request('GET', '/dtr/records')
    .then(response => { /* handle response.records */ })
    .catch(error => { /* handle error */ })
```

### Step 4: Remove Old Auth Code

Delete references to:
- `createSession()`
- `SESSION_KEY`
- `loginWithDatabase()`
- Old PHP API endpoints

---

## Troubleshooting

### "APIClient is not defined"

**Problem**: Scripts not included in right order

**Solution**: Ensure `api-client.js` is included BEFORE your page script

### "Token expired" on every page load

**Problem**: Token storage issues

**Solution**: 
```javascript
// Check if token exists
console.log(APIClient.getToken());
console.log(APIClient.isAuthenticated());
```

### 401 errors on API calls

**Problem**: User is logged out

**Solution**: User is automatically redirected to login. Check browser console for error details.

### User info not displaying

**Problem**: Page protection not setup

**Solution**:
```javascript
// Manually setup
PageProtection.setupPage({ requiresAuth: true });
PageProtection.displayUserInfo();
```

---

## Best Practices

### ✅ DO

- Include scripts in correct order (api-client → page-protection → your script)
- Use `APIClient.request()` for all API calls
- Add `data-page-protection` to protected pages
- Handle errors with try/catch
- Show meaningful error messages to users
- Use `PageProtection.setupPage()` for complex pages

### ❌ DON'T

- Make direct fetch calls to `/api/` endpoints (use APIClient)
- Store user data in localStorage manually (APIClient does it)
- Remove api-client.js from pages
- Hardcode API Base URL (use APIClient.CONFIG)
- Forget to include page-protection.js

---

## Configuration

### Change API Base URL

```javascript
// In api-client.js, modify CONFIG object
const CONFIG = {
    API_BASE: 'http://localhost:3000/api',  // ← Change this
    // ...
};
```

### Change Token Storage Key

```javascript
// In api-client.js
const TOKEN_KEY = 'samelcii_token';  // ← Change this
```

### Customize Logout Button

```javascript
// In your page
PageProtection.setupLogoutButton('#my-custom-logout-btn');
```

---

## Testing

### Test Login

1. Navigate to `/pages/auth/index.html`
2. Enter credentials (username: admin, password: admin123)
3. Should redirect to dashboard with token stored
4. Check localStorage: `localStorage.getItem('samelcii_token')`

### Test Protected Page

1. Open a protected page
2. Logout via button
3. Try to access the page directly
4. Should redirect to login

### Test API Calls

```javascript
// In browser console
APIClient.isAuthenticated()  // true if logged in
APIClient.getUser()          // Show current user
APIClient.request('GET', '/dtr/records')  // Test API
```

---

## Summary

The frontend now uses:
- ✅ JWT tokens (stateless, secure)
- ✅ Automatic token management
- ✅ Page protection utilities
- ✅ Unified API client
- ✅ Error handling & redirects

**All pages are ready to be migrated to the new JWT authentication system!**

---

**Generated**: June 1, 2026
**Version**: 1.0

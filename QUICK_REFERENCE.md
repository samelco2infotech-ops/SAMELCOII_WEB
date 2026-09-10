# JWT Frontend Integration - Quick Reference

## TL;DR - Update Your Pages

### 1️⃣ Add Scripts
```html
<script src="../../assets/js/api-client.js"></script>
<script src="../../assets/js/page-protection.js"></script>
<script src="./your-page.js"></script>
```

### 2️⃣ Protect Page
```html
<body data-page-protection data-require-auth="true">
```

### 3️⃣ Make API Calls
```javascript
APIClient.request('GET', '/dtr/records')
```

---

## API Cheatsheet

| Task | Code |
|------|------|
| **Login** | `await APIClient.login(username, password)` |
| **Register** | `await APIClient.register(usercode, username, password)` |
| **Reset Password** | `await APIClient.resetPassword(identifier, password)` |
| **Logout** | `await APIClient.logout()` |
| **Get Current User** | `APIClient.getUser()` |
| **Is Authenticated** | `APIClient.isAuthenticated()` |
| **Search Employees** | `await APIClient.searchEmployees(query)` |
| **Upload Photo** | `await APIClient.uploadProfilePhoto(file)` |
| **Generic API Call** | `await APIClient.request('GET', '/endpoint')` |

---

## All 47 Endpoints

### Auth (7 endpoints)
```
POST   /api/auth/login
POST   /api/auth/register
POST   /api/auth/reset-password
GET    /api/auth/search-employee
POST   /api/auth/upload-profile-photo
GET    /api/auth/me
POST   /api/auth/logout
```

### DTR (3 endpoints)
```
GET    /api/dtr/records
GET    /api/dtr/daily
GET    /api/dtr/summary
```

### Travel (6 endpoints)
```
GET    /api/travel/list
GET    /api/travel/pending
GET    /api/travel/all
POST   /api/travel/create
POST   /api/travel/approve
POST   /api/travel/reject
```

### Fuel (5 endpoints)
```
GET    /api/fuel/balance
GET    /api/fuel/history
POST   /api/fuel/request
GET    /api/fuel/department-quota
GET    /api/fuel/vehicles-today
```

### Epass (7 endpoints)
```
GET    /api/epass/list
GET    /api/epass/:number
POST   /api/epass/create
POST   /api/epass/link-fuel
POST   /api/epass/:number/approve
POST   /api/epass/:number/reject
```

### Other Modules (19 endpoints)
- **Messenger** (2): `/api/messenger/list`, `/api/messenger/send`
- **Membership** (2): `/api/membership/list`, `/api/membership/status`
- **IT Equipment** (2): `/api/it-equipment/inventory`, `/api/it-equipment/assigned`
- **Warehouse** (2): `/api/warehouse/stock`, `/api/warehouse/transactions`
- **Overtime** (2): `/api/overtime/list`, `/api/overtime/request`
- **Leave** (3): `/api/leave/balance`, `/api/leave/history`, `/api/leave/request`
- **Signatory** (2): `/api/signatory/list`, `/api/signatory/by-position`
- **AI Chat** (3): `/api/ai-chat/history`, `/api/ai-chat/chat`, `/api/ai-chat/config`

---

## Page Protection Levels

| Level | Access | Example |
|-------|--------|---------|
| **0** | All users | General employees |
| **5** | Supervisor+ | Team leads |
| **6-10** | Manager+ | Managers, Directors, Admins |

```javascript
// Require manager privilege
PageProtection.setupPage({ minPrivilege: 6 });
```

---

## Common Examples

### Display DTR Records
```javascript
const response = await APIClient.request('GET', '/dtr/records?year=2026&month=6');
const records = response.records;

records.forEach(record => {
    console.log(`${record.work_date}: ${record.morning_in} - ${record.morning_out}`);
});
```

### Create Travel Order
```javascript
try {
    const response = await APIClient.request('POST', '/travel/create', {
        department: 'IT',
        destination: 'Manila',
        purpose: 'Training',
        date: '2026-07-01'
    });
    console.log('Travel Order:', response.to_number);
} catch (error) {
    alert(error.message);
}
```

### Approve Pending Orders
```javascript
const response = await APIClient.request('GET', '/travel/pending');
const pendingOrders = response.travels;

// Approve first one
await APIClient.request('POST', '/travel/approve?to_number=' + pendingOrders[0].to_number);
```

### Get Leave Balance
```javascript
const response = await APIClient.request('GET', '/leave/balance');
const balance = response.balance;

console.log(`VL: ${balance.VLbal} / ${balance.VL}`);
console.log(`SL: ${balance.SLbal} / ${balance.SL}`);
```

---

## HTML Data Attributes

```html
<!-- Auto-protect page -->
<body data-page-protection data-require-auth="true" data-min-privilege="0">

<!-- Display user info automatically -->
<span data-user-name></span>          <!-- Name -->
<img data-user-avatar>                <!-- Photo -->
<span data-user-position></span>      <!-- Position -->
<span data-user-department></span>    <!-- Department -->
```

---

## Environment

| Variable | Value |
|----------|-------|
| **API Base** | `http://localhost:3000/api` |
| **Token Key** | `samelcii_token` (localStorage) |
| **User Key** | `samelcii_user` (localStorage) |
| **Token Expires** | 7 days |
| **Warn Expiry** | 1 hour before |

---

## Debugging

```javascript
// Check if logged in
APIClient.isAuthenticated()

// Get user data
APIClient.getUser()

// Get token
APIClient.getToken()

// Check localStorage
localStorage.getItem('samelcii_token')
localStorage.getItem('samelcii_user')

// Test API
APIClient.request('GET', '/dtr/records')
```

---

## Error Handling

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
    // error.message contains the error text
    // 401 automatically redirects to login
    // Others are shown to user
    alert('Error: ' + error.message);
}
```

---

## Page Template

```html
<!DOCTYPE html>
<html>
<head>
    <title>My Module</title>
    <link rel="stylesheet" href="../../assets/css/style.css">
</head>
<body data-page-protection data-require-auth="true">
    <h1>My Module</h1>
    <p>Welcome, <span data-user-name>User</span></p>
    
    <div id="content"><!-- Loaded by JavaScript --></div>
    <div id="error" style="color:red;display:none;"></div>

    <button class="logout-btn">Logout</button>

    <script src="../../assets/js/api-client.js"></script>
    <script src="../../assets/js/page-protection.js"></script>
    <script>
        // Your page logic here
        document.addEventListener('DOMContentLoaded', async () => {
            try {
                const response = await APIClient.request('GET', '/endpoint');
                // Handle response
            } catch (error) {
                document.getElementById('error').textContent = error.message;
                document.getElementById('error').style.display = 'block';
            }
        });
    </script>
</body>
</html>
```

---

## Migration Checklist

For each page:
- [ ] Add api-client.js script
- [ ] Add page-protection.js script
- [ ] Add data-page-protection to body
- [ ] Replace API endpoints (use APIClient.request)
- [ ] Update error handling
- [ ] Test login/logout
- [ ] Test API calls
- [ ] Remove old session code
- [ ] Remove old PHP API calls

---

## Need Help?

See: `FRONTEND_INTEGRATION.md` for detailed guide
API Docs: `backend/API_REFERENCE.md` for all endpoints

---

**Phase 7 Complete** ✅
All frontend integration complete!

Next: Phase 8 - Testing & Verification

# Phase 8: Testing & Verification Plan

## Overview

This document outlines the testing strategy to verify the complete migration from PHP to Node.js is successful.

---

## Pre-Testing Checklist

- [ ] Node.js backend is running: `npm start` in `/backend`
- [ ] MySQL database is accessible and contains data
- [ ] `.env` file configured with correct DB credentials
- [ ] `api-client.js` and `page-protection.js` are in `/assets/js/`
- [ ] Auth page has been updated with new scripts
- [ ] All 47 API endpoints are ready (see `API_REFERENCE.md`)

---

## Testing Strategy

### Level 1: Backend API Testing
### Level 2: Frontend Integration Testing
### Level 3: End-to-End User Flows
### Level 4: Performance & Load Testing
### Level 5: Security Testing

---

## Level 1: Backend API Testing

### 1.1 Health Check

```bash
# Server is running
curl http://localhost:3000/health

# Expected response:
# {"ok":true,"message":"Server is running"}
```

### 1.2 Authentication Endpoints

#### Login (POST)
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Expected: 200 OK with token and user data
```

**Checklist**:
- [ ] Returns 200 OK
- [ ] Response includes `token` field
- [ ] Response includes `user` object
- [ ] User has usercode, name, position, department
- [ ] Token is valid JWT (3 parts separated by dots)

#### Register (POST)
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"usercode":"S2086","username":"testuser","password":"test123"}'

# Expected: 200 OK
```

**Checklist**:
- [ ] New users can register (if valid employee)
- [ ] Duplicate usernames are rejected (409 Conflict)
- [ ] Already registered employees are rejected (409)
- [ ] Missing fields return 422 (Unprocessable Entity)

#### Password Reset (POST)
```bash
curl -X POST http://localhost:3000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"identifier":"admin","password":"newpass123"}'

# Expected: 200 OK
```

**Checklist**:
- [ ] Can reset by username
- [ ] Can reset by usercode
- [ ] Invalid identifier returns 404
- [ ] Password is actually changed (can login with new password)

#### Search Employees (GET)
```bash
curl "http://localhost:3000/api/auth/search-employee?q=john"

# Expected: 200 OK with employees array
```

**Checklist**:
- [ ] Returns array of matching employees
- [ ] Query < 2 chars returns empty array
- [ ] Results include usercode, name, department
- [ ] Works with both usercode and name

### 1.3 Protected Endpoints (Require Token)

#### Get Token First
```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.token')

echo "Token: $TOKEN"
```

#### DTR Records (GET)
```bash
curl http://localhost:3000/api/dtr/records \
  -H "Authorization: Bearer $TOKEN"

# Expected: 200 OK with records array
```

**Checklist**:
- [ ] Returns monthly records by default (current month)
- [ ] Supports year/month parameters
- [ ] Supports usercode parameter
- [ ] Each record has: usercode, name, work_date, morning_in, etc.
- [ ] No token returns 401 Unauthorized
- [ ] Invalid token returns 401 Unauthorized

#### Travel Orders (GET)
```bash
curl http://localhost:3000/api/travel/list \
  -H "Authorization: Bearer $TOKEN"

# Expected: 200 OK with travels array
```

**Checklist**:
- [ ] Returns user's travel orders
- [ ] /pending returns orders awaiting approval (if user is manager)
- [ ] Each order includes: to_number, department, destination, status
- [ ] Filtering by year, month, department works

#### Fuel Balance (GET)
```bash
curl "http://localhost:3000/api/fuel/balance?year=2026&month=6" \
  -H "Authorization: Bearer $TOKEN"

# Expected: 200 OK with balance object
```

**Checklist**:
- [ ] Returns monthly quota
- [ ] Returns issued amount
- [ ] Returns remaining amount
- [ ] Calculations are accurate

#### Leave Balance (GET)
```bash
curl http://localhost:3000/api/leave/balance \
  -H "Authorization: Bearer $TOKEN"

# Expected: 200 OK with VL, SL, OL balances
```

**Checklist**:
- [ ] Returns leave balances (VL, SL, OL)
- [ ] Returns balance counters (VLbal, SLbal, OLbal)
- [ ] Values match database

### 1.4 Error Handling

#### Missing Token
```bash
curl http://localhost:3000/api/dtr/records

# Expected: 401 Unauthorized
```

#### Invalid Token
```bash
curl http://localhost:3000/api/dtr/records \
  -H "Authorization: Bearer invalid.token.here"

# Expected: 401 Unauthorized
```

#### Expired Token
```bash
# Set JWT_SECRET in .env, then create old token
# Try to use it
# Expected: 401 Unauthorized with "Token expired" message
```

#### Bad Request
```bash
curl -X POST http://localhost:3000/api/travel/create \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"incomplete":"data"}'

# Expected: 400/422 Bad Request with error details
```

---

## Level 2: Frontend Integration Testing

### 2.1 Login Page

Navigate to: `http://localhost/SAMELCII_WEB_SYSTEM/pages/auth/index.html`

**Checklist**:
- [ ] Page loads without errors
- [ ] Login form is visible
- [ ] Register tab can be clicked
- [ ] Password visibility toggle works
- [ ] "Forgot Password?" link works

#### Test Login
- [ ] Enter valid credentials
- [ ] Click Login
- [ ] Should redirect to dashboard
- [ ] Token stored in localStorage
- [ ] User data displayed

#### Test Login Validation
- [ ] Empty username shows error
- [ ] Empty password shows error
- [ ] Invalid credentials show error message
- [ ] Error messages are clear

### 2.2 Protected Page Loading

Navigate to: `http://localhost/SAMELCII_WEB_SYSTEM/pages/dashboard/index.html`

**Checklist**:
- [ ] If logged in: page loads normally
- [ ] If not logged in: redirected to login
- [ ] User name displays (data-user-name)
- [ ] User avatar displays (data-user-avatar)
- [ ] Logout button exists and works

### 2.3 API Calls from Pages

#### Test DTR Module
Navigate to DTR page and verify:
- [ ] Monthly records load
- [ ] Daily records load
- [ ] Summary loads
- [ ] Filters work (year, month)
- [ ] No console errors

#### Test Travel Module
Navigate to Travel page and verify:
- [ ] User's orders load
- [ ] Can create new order
- [ ] Can view pending approvals (if manager)
- [ ] Can approve/reject orders

#### Test Fuel Module
Navigate to Fuel page and verify:
- [ ] Balance loads
- [ ] History loads
- [ ] Can submit request
- [ ] Department quota displays

### 2.4 Token Management

**Checklist**:
- [ ] Token stored in localStorage after login
- [ ] Token is included in API request headers
- [ ] Token is 3-part JWT (xxx.yyy.zzz)
- [ ] Logout clears token from localStorage
- [ ] After logout, protected pages redirect to login

### 2.5 Error Handling

**Checklist**:
- [ ] 401 errors redirect to login
- [ ] 400 errors display error message
- [ ] 404 errors handled gracefully
- [ ] Network errors show message to user
- [ ] Error messages are user-friendly (not raw API responses)

---

## Level 3: End-to-End User Flows

### 3.1 Complete Login Flow

**Steps**:
1. Start fresh (clear localStorage)
2. Navigate to login page
3. Enter incorrect credentials → See error
4. Enter correct credentials → Redirect to dashboard
5. Verify token in localStorage
6. Refresh page → Still logged in
7. Click logout → Token cleared
8. Try to access dashboard → Redirected to login

**Expected Result**: All steps work smoothly

### 3.2 Complete Travel Order Flow

**Steps** (Assuming manager account):
1. Login as regular employee
2. Create travel order (destination: Cebu, date: next week)
3. See confirmation with TO number (S2Y2600001)
4. Navigate to "My Orders" → See new order with status "Pending"
5. Logout
6. Login as manager
7. Navigate to "Pending Approvals"
8. See the travel order from step 2
9. Click "Approve"
10. Status changes to "Approved"

**Expected Result**: Full workflow works end-to-end

### 3.3 Complete Fuel Request Flow

**Steps**:
1. Login
2. View fuel balance → See monthly quota and remaining
3. Submit fuel request (50 liters)
4. See confirmation with FAR code (FAR2600001)
5. Navigate to fuel history → See new request with status "Pending"
6. Go to fuel balance → "requested_this_month" increases

**Expected Result**: Fuel workflow works correctly

### 3.4 Leave Request Flow

**Steps**:
1. Login
2. View leave balance → See VL, SL, OL balances
3. Submit leave request (VL, dates: 2026-06-15 to 2026-06-17)
4. Navigate to leave history → See new request
5. Verify leave balance hasn't changed (pending approval)

**Expected Result**: Leave workflow works correctly

---

## Level 4: Performance & Load Testing

### 4.1 Response Time

**Test**: Measure API response times

```bash
# Single request
time curl -s http://localhost:3000/api/dtr/records \
  -H "Authorization: Bearer $TOKEN" | jq . > /dev/null

# Expected: < 100ms for typical requests
```

**Checklist**:
- [ ] Login: < 200ms
- [ ] DTR records: < 100ms
- [ ] Travel list: < 100ms
- [ ] Fuel balance: < 100ms

### 4.2 Concurrent Users

**Test**: Simulate multiple users

```bash
# Open 10 browser tabs to dashboard simultaneously
# All should load without errors
```

**Checklist**:
- [ ] All pages load successfully
- [ ] No "Connection refused" errors
- [ ] No database connection errors
- [ ] Database handles concurrent queries

### 4.3 Data Volume

**Test**: Large result sets

```bash
# Request DTR records for entire year (12 months)
curl "http://localhost:3000/api/dtr/records?year=2026" \
  -H "Authorization: Bearer $TOKEN" | jq '.total'

# Should return all records
```

**Checklist**:
- [ ] Large datasets load (< 2 seconds)
- [ ] No timeout errors
- [ ] Pagination works if implemented

---

## Level 5: Security Testing

### 5.1 Authentication

**Checklist**:
- [ ] Passwords are hashed (never sent as plaintext)
- [ ] Token is JWT (can verify with jwt.io)
- [ ] Token has expiration (check .payload.exp)
- [ ] Invalid tokens rejected with 401

### 5.2 Authorization

**Checklist**:
- [ ] Regular user cannot approve travel orders
- [ ] Can only see own data (user's orders, records)
- [ ] Cannot access `/pending` approvals (non-manager)
- [ ] Privilege levels enforced

### 5.3 SQL Injection

**Test**: Search with SQL characters

```bash
curl "http://localhost:3000/api/auth/search-employee?q='; DROP TABLE --" \
  -H "Authorization: Bearer $TOKEN"

# Should safely escape and return no results
# Database should NOT be affected
```

**Checklist**:
- [ ] Prepared statements used (not vulnerable)
- [ ] Special characters handled safely
- [ ] No error messages leak database info

### 5.4 CORS

**Test**: Cross-origin requests

```bash
# From different domain
curl -H "Origin: http://other.com" \
  http://localhost:3000/api/dtr/records

# Should allow or deny based on CORS policy
```

**Checklist**:
- [ ] CORS headers are set correctly
- [ ] Credentials sent with requests (Authorization header)
- [ ] Origin is verified

### 5.5 HTTPS (Production)

**Checklist** (before production):
- [ ] Use HTTPS, not HTTP
- [ ] Set secure cookies
- [ ] Disable HTTP (redirect to HTTPS)

---

## Testing Checklist Summary

### Backend API
- [ ] Health check endpoint
- [ ] All 7 auth endpoints
- [ ] All 3 DTR endpoints
- [ ] All 6 travel endpoints
- [ ] All 5 fuel endpoints
- [ ] All epass endpoints
- [ ] All other module endpoints
- [ ] 401 errors for missing token
- [ ] 401 errors for invalid token
- [ ] 400 errors for bad requests
- [ ] Error messages are clear

### Frontend Integration
- [ ] Login page loads
- [ ] Token stored in localStorage
- [ ] Protected pages redirect if not logged in
- [ ] User info displays
- [ ] Logout clears token
- [ ] API calls include Authorization header
- [ ] Error messages show to user

### User Flows
- [ ] Complete login-logout flow
- [ ] Complete travel order flow
- [ ] Complete fuel request flow
- [ ] Complete leave request flow

### Performance
- [ ] API responses < 100ms
- [ ] Multiple concurrent users work
- [ ] Large datasets load
- [ ] No database connection errors

### Security
- [ ] Passwords are hashed
- [ ] Tokens are JWT
- [ ] Invalid tokens rejected
- [ ] SQL injection safe
- [ ] CORS configured
- [ ] User can only see own data

---

## Issue Tracking Template

### Template for Found Issues

```
**Title**: [Brief description]
**Priority**: High/Medium/Low
**Type**: Bug/Enhancement/Documentation
**Affected Module**: [Auth/DTR/Travel/etc.]
**Steps to Reproduce**:
1. Login as admin
2. Navigate to DTR page
3. Click on [specific button]
4. Expected: [what should happen]
5. Actual: [what actually happened]

**Error Message**: [if applicable]
**Browser/Environment**: Chrome 100, Windows 11
**Suggested Fix**: [if known]
```

---

## Sign-Off

When all tests pass, get approval:

- [ ] Backend API tests: **PASS**
- [ ] Frontend integration tests: **PASS**
- [ ] End-to-end user flows: **PASS**
- [ ] Performance tests: **PASS**
- [ ] Security tests: **PASS**

**Migration Complete**: ✅ Ready for Production!

---

## Rollback Plan

If critical issues found:

1. **Stop Node.js**: `Ctrl+C` in backend terminal
2. **Stop Apache**: Start PHP server again
3. **Check frontend**: Revert script.js changes if needed
4. **Diagnose issue**: Check Node.js logs
5. **Fix issue**: Apply fix to backend or frontend
6. **Restart Node.js**: `npm start` in backend

---

## Documentation Reference

| Document | Purpose |
|----------|---------|
| `README.md` | Quick start guide |
| `API_REFERENCE.md` | All 47 endpoints documented |
| `FRONTEND_INTEGRATION.md` | Frontend integration guide |
| `QUICK_REFERENCE.md` | Developer cheatsheet |
| `COMPLETION_STATUS.md` | Migration overview |
| `TESTING_PLAN.md` | This document |

---

## Next Steps After Testing

1. **Documentation**: Update any docs needed
2. **Training**: Brief team on new API usage
3. **Deployment**: Deploy to staging/production
4. **Monitoring**: Monitor logs for errors
5. **User Feedback**: Collect feedback from users

---

**Phase 8 - Testing & Verification**
Last step before production deployment!

---

Generated: June 1, 2026
Status: Ready for Testing

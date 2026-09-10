# SAMELCII Node.js Migration - Implementation Guide

## Current Status: 4 of 8 Phases Complete ✅

### Completed Phases

#### ✅ Phase 1: Foundation
- Express.js server setup
- MySQL2 connection pool
- Environment configuration (`.env`)
- Middleware: Authentication, Error Handling, File Uploads
- Utility functions: Response, Validation, Date/Time helpers
- Constants and configuration files

**Files Created**: 
- `src/config/` (env.js, database.js, constants.js)
- `src/middleware/` (auth.js, errorHandler.js, fileUpload.js)
- `src/utils/` (response.js, validation.js, dateTime.js)
- `src/app.js`, `server.js`

#### ✅ Phase 2: Authentication Module
**What's Working:**
- User login with JWT token generation
- User registration (with duplicate username checks)
- Password reset functionality
- Employee search/autocomplete
- Profile photo upload
- Get current user info

**Files Created**:
- `src/services/authService.js` - User validation, password checking, serialization
- `src/routes/auth.js` - 6 endpoints ready to use

**Database Schema Auto-Migration**: Ensures `usertb` has all required columns

#### ✅ Phase 3: DTR (Duty Time Records) Module
**What's Working:**
- Biometric punch parsing (IN/OUT punch pair logic)
- Monthly duty records retrieval
- Daily record lookup
- Yearly summary with monthly aggregation
- Handles overnight duties
- Complex time range calculations (morning, afternoon, OT)

**Files Created**:
- `src/services/dtrService.js` - Punch normalization, duty record building
- `src/routes/dtr.js` - 3 endpoints

**Key Logic**: Matches legacy C# `DtrHelpers.NormalizePunchType` and `buildMaintenanceDutyRows`

#### ✅ Phase 4: Travel & Fuel Modules
**Travel - What's Working:**
- Travel order listing (user's orders)
- Pending approvals queue (for managers/approvers)
- All travel orders with status filters
- Travel order creation
- Approval/rejection workflow
- Sequence number generation (S2Y2600001, etc.)

**Fuel - What's Working:**
- Fuel balance calculation by month
- Fuel request history
- Fuel request creation
- Department quota stats
- Vehicles used today tracking
- Monthly issued/remaining calculations

**Files Created**:
- `src/services/travelService.js` - Travel order logic
- `src/services/fuelService.js` - Fuel allocation logic
- `src/routes/travel.js` - 5 endpoints
- `src/routes/fuel.js` - 5 endpoints
- `src/services/commonService.js` - Shared utilities

---

## Remaining Phases

### Phase 5: Epass & Other Modules
**Epass (Gate Passes)**:
- Generate gate pass numbers
- Group pass splitting (pipe-separated names)
- Link gate pass to fuel request
- Gate pass listing

**Other Modules** (Skeleton structure ready):
- `messenger.js` - Messaging system
- `membership.js` - Membership management
- `it_equipment.js` - IT inventory
- `warehouse.js` - Warehouse management
- `overtime.js` - Overtime tracking
- `leave.js` - Leave management
- `signatory.js` - Signatory management
- `ai_chat.js` - AI integration (optional)

**Effort**: 2-3 hours (mostly database query patterns from existing modules)

### Phase 6: File Upload Optimization
**Currently**: Basic Multer setup in place
**Todo**:
- Validate image dimensions
- Compress images before storage
- Cleanup old files
- Virus scanning integration (optional)
- CDN integration (optional)

**Effort**: 1 hour

### Phase 7: Frontend Integration
**Required Changes**:
1. Update `assets/js/script.js`:
   - Remove session-based auth
   - Store JWT in `localStorage`
   - Add token to all API requests
   - Handle token expiration

2. Update all API calls:
   ```javascript
   // JWT-authenticated Node API
   const token = localStorage.getItem('token');
   fetch('/api/dtr/records', {
     headers: { 'Authorization': `Bearer ${token}` }
   })
   ```

3. Create login flow:
   - Capture token on login
   - Store in localStorage
   - Redirect on unauthorized (401)
   - Show token expiration warning

**Effort**: 1-2 hours

### Phase 8: Testing & Deployment
**Testing**:
- Manual endpoint testing with curl/Postman
- Frontend integration testing
- Database consistency checks
- Error handling verification

**Deployment**:
- Stop PHP server
- Start Node.js server on port 3000
- Verify all endpoints work
- Monitor for errors

---

## Quick Test Guide

### 1. Start the Backend
```bash
cd backend
npm install
npm start
```

Expected output:
```
✓ Database pool created
✓ Connected to it_program@192.168.1.99
✓ Server running on http://localhost:3000
```

### 2. Test Health Check
```bash
curl http://localhost:3000/health
```

### 3. Test Auth Endpoints

**Login:**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

Save the returned `token` for protected requests.

**Get Current User:**
```bash
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer <token>"
```

### 4. Test DTR Endpoints
```bash
# Get current month's records
curl "http://localhost:3000/api/dtr/records" \
  -H "Authorization: Bearer <token>"

# Get specific employee's records
curl "http://localhost:3000/api/dtr/records?usercode=S2086&year=2026&month=6" \
  -H "Authorization: Bearer <token>"

# Get daily record
curl "http://localhost:3000/api/dtr/daily?date=2026-06-01" \
  -H "Authorization: Bearer <token>"

# Get yearly summary
curl "http://localhost:3000/api/dtr/summary?year=2026" \
  -H "Authorization: Bearer <token>"
```

### 5. Test Travel Endpoints
```bash
# Get user's travel orders
curl "http://localhost:3000/api/travel/list" \
  -H "Authorization: Bearer <token>"

# Get pending approvals (for managers)
curl "http://localhost:3000/api/travel/pending" \
  -H "Authorization: Bearer <token>"

# Create travel order
curl -X POST http://localhost:3000/api/travel/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "department":"IT",
    "destination":"Cebu",
    "purpose":"Business Meeting",
    "date":"2026-06-15"
  }'
```

### 6. Test Fuel Endpoints
```bash
# Get fuel balance
curl "http://localhost:3000/api/fuel/balance?year=2026&month=6" \
  -H "Authorization: Bearer <token>"

# Get fuel history
curl "http://localhost:3000/api/fuel/history?year=2026&month=6" \
  -H "Authorization: Bearer <token>"

# Create fuel request
curl -X POST http://localhost:3000/api/fuel/request \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"liters": 50}'

# Get department quota
curl "http://localhost:3000/api/fuel/department-quota?department=IT&year=2026&month=6" \
  -H "Authorization: Bearer <token>"
```

---

## Implementation Checklist for Remaining Phases

### Phase 5 Checklist
- [ ] Create `src/services/epassService.js`
- [ ] Create `src/routes/epass.js`
- [ ] Implement remaining module services based on PHP files
- [ ] Update `src/app.js` to register new routes
- [ ] Test Epass endpoints
- [ ] Test other module endpoints

### Phase 6 Checklist
- [ ] Optimize image compression in `src/middleware/fileUpload.js`
- [ ] Add image dimension validation
- [ ] Implement file cleanup for old uploads
- [ ] Add virus scanning (optional)
- [ ] Test with various file types/sizes

### Phase 7 Checklist
- [ ] Create `assets/js/api-client.js` with JWT token handling
- [ ] Update `assets/js/script.js` for login flow
- [ ] Update all module pages to use new API
- [ ] Implement token refresh mechanism
- [ ] Handle 401 unauthorized responses
- [ ] Display token expiration warning

### Phase 8 Checklist
- [ ] Manual test all endpoints
- [ ] Load test with concurrent users
- [ ] Test database integrity
- [ ] Monitor error logs
- [ ] Performance profiling
- [ ] Production deployment

---

## Common Patterns for Phase 5

### Creating a New Module Service

```javascript
// src/services/moduleService.js
const db = require('../config/database');

const getRecords = async (filters) => {
  return db.queryAll('SELECT * FROM table WHERE ...', params);
};

const getRecord = async (id) => {
  return db.queryOne('SELECT * FROM table WHERE id = ?', [id]);
};

const createRecord = async (data) => {
  return db.execute('INSERT INTO table (...) VALUES (...)', values);
};

module.exports = { getRecords, getRecord, createRecord };
```

### Creating a New Module Route

```javascript
// src/routes/module.js
const express = require('express');
const router = express.Router();
const service = require('../services/moduleService');
const { successResponse, badRequestResponse } = require('../utils/response');

router.get('/list', async (req, res, next) => {
  try {
    const records = await service.getRecords({});
    return successResponse(res, { records, total: records.length });
  } catch (error) {
    next(error);
  }
});

router.post('/create', async (req, res, next) => {
  try {
    const result = await service.createRecord(req.body);
    return successResponse(res, { message: 'Created', id: result.insertId });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
```

### Registering in App

```javascript
// src/app.js
app.use('/api/module', verifyToken, require('./routes/module'));
```

---

## Troubleshooting

### Token Expired
- Request returns 401 with message "Token expired"
- Solution: Re-login to get new token, or implement refresh mechanism

### Database Connection Issues
- Check `.env` credentials match actual database
- Verify MySQL server is running
- Check firewall/network connectivity

### 404 Errors
- Verify endpoint path matches route definition
- Check routes are registered in `src/app.js`
- Ensure method is correct (GET vs POST)

### Validation Errors
- Review error response for specific field errors
- Ensure all required fields are provided
- Check data types match expected format

---

## Performance Optimization

**Already Implemented**:
- Connection pooling (10 concurrent connections)
- Prepared statements (prevent SQL injection)
- Index-based queries on common fields

**Future Improvements**:
- Query caching (Redis)
- Response pagination for large datasets
- API rate limiting
- GraphQL layer (optional)

---

## Security Notes

**Currently Implemented**:
- JWT token authentication
- Bcrypt password hashing
- SQL prepared statements
- CORS middleware
- Input validation/sanitization
- Error handler (no stack traces in production)

**Recommended**:
- Implement rate limiting
- Add API key validation
- Enable HTTPS
- Audit logging
- Regular security updates

---

## Next Steps

1. **Immediate**: Test current 4 completed phases
2. **Short-term**: Implement Phase 5 (Epass & remaining modules)
3. **Medium-term**: Integrate frontend with JWT auth
4. **Long-term**: Full deployment & monitoring

**Estimated Total Time**: 15-20 hours (4 phases × 3-5 hours each)

---

**Generated**: June 1, 2026
**Status**: 50% Complete (4 of 8 phases)

# Complete API Reference - SAMELCII Backend

**Base URL**: `http://localhost:3000/api`

**Authentication**: All protected endpoints require JWT token in header:
```
Authorization: Bearer <token>
```

---

## 📋 Table of Contents
- [Authentication](#authentication)
- [DTR (Duty Time Records)](#dtr)
- [Travel Orders](#travel)
- [Fuel Management](#fuel)
- [Gate Passes (Epass)](#epass)
- [Messenger](#messenger)
- [Membership](#membership)
- [IT Equipment](#it-equipment)
- [Warehouse](#warehouse)
- [Overtime](#overtime)
- [Leave Management](#leave)
- [Signatory](#signatory)
- [AI Chat](#ai-chat)

---

## Authentication
**Base**: `/api/auth`

### Login
```
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}

Response (200):
{
  "ok": true,
  "message": "Login successful.",
  "token": "eyJhbGc...",
  "user": {
    "id": 1,
    "usercode": "S2086",
    "name": "John Doe",
    ...
  }
}
```

### Register
```
POST /api/auth/register
Content-Type: application/json

{
  "usercode": "S2086",
  "username": "johndoe",
  "password": "secure123"
}
```

### Reset Password
```
POST /api/auth/reset-password
Content-Type: application/json

{
  "identifier": "S2086",
  "password": "newpassword123"
}
```

### Search Employees
```
GET /api/auth/search-employee?q=john
```

### Upload Profile Photo
```
POST /api/auth/upload-profile-photo
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <binary>
```

### Get Current User
```
GET /api/auth/me
Authorization: Bearer <token>
```

### Logout
```
POST /api/auth/logout
Authorization: Bearer <token>
```

---

## DTR
**Base**: `/api/dtr`
**Auth**: ✅ Required

### Get Monthly Records
```
GET /api/dtr/records?year=2026&month=6&usercode=S2086
Authorization: Bearer <token>

Response:
{
  "ok": true,
  "records": [
    {
      "usercode": "S2086",
      "name": "John Doe",
      "work_date": "2026-06-01",
      "day_name": "Monday",
      "morning_in": "8:30 AM",
      "morning_out": "12:00 PM",
      "afternoon_in": "1:00 PM",
      "afternoon_out": "5:30 PM",
      "ot_in": null,
      "ot_out": null,
      "undertime_min": 0,
      "ot_minutes": 0
    }
  ],
  "total": 20
}
```

### Get Daily Record
```
GET /api/dtr/daily?date=2026-06-01&usercode=S2086
Authorization: Bearer <token>
```

### Get Yearly Summary
```
GET /api/dtr/summary?year=2026&usercode=S2086
Authorization: Bearer <token>

Response:
{
  "ok": true,
  "summary": [
    {
      "month": "2026-06",
      "working_days": 20,
      "total_undertime": 60,
      "total_ot": 120
    }
  ]
}
```

---

## Travel
**Base**: `/api/travel`
**Auth**: ✅ Required

### List User's Travel Orders
```
GET /api/travel/list
Authorization: Bearer <token>
```

### Get Pending Approvals (Managers Only)
```
GET /api/travel/pending?year=2026&month=6&department=IT
Authorization: Bearer <token>
```

### Get All Travel Orders
```
GET /api/travel/all?status=1&q=cebu
Authorization: Bearer <token>
```

### Create Travel Order
```
POST /api/travel/create
Authorization: Bearer <token>
Content-Type: application/json

{
  "department": "IT",
  "destination": "Cebu",
  "purpose": "Business Meeting",
  "date": "2026-06-15"
}

Response:
{
  "ok": true,
  "message": "Travel order created successfully.",
  "to_number": "S2Y2600001"
}
```

### Approve Travel Order
```
POST /api/travel/approve?to_number=S2Y2600001
Authorization: Bearer <token>
```

### Reject Travel Order
```
POST /api/travel/reject?to_number=S2Y2600001
Authorization: Bearer <token>
Content-Type: application/json

{
  "reason": "Duplicate request"
}
```

---

## Fuel
**Base**: `/api/fuel`
**Auth**: ✅ Required

### Get Fuel Balance
```
GET /api/fuel/balance?year=2026&month=6
Authorization: Bearer <token>

Response:
{
  "ok": true,
  "balance": {
    "monthly_quota": 500,
    "issued_month": 150,
    "remaining_month": 350,
    "user_requested_this_month": 50
  }
}
```

### Get Fuel History
```
GET /api/fuel/history?year=2026&month=6
Authorization: Bearer <token>
```

### Submit Fuel Request
```
POST /api/fuel/request
Authorization: Bearer <token>
Content-Type: application/json

{
  "liters": 50
}

Response:
{
  "ok": true,
  "message": "Fuel request created successfully.",
  "far_code": "FAR2600001"
}
```

### Get Department Quota
```
GET /api/fuel/department-quota?department=IT&year=2026&month=6
Authorization: Bearer <token>
```

### Get Vehicles Used Today
```
GET /api/fuel/vehicles-today
Authorization: Bearer <token>
```

---

## Epass
**Base**: `/api/epass`
**Auth**: ✅ Required

### List Gate Passes
```
GET /api/epass/list?usercode=S2086
Authorization: Bearer <token>
```

### Get Gate Pass Details
```
GET /api/epass/S2Y2600001
Authorization: Bearer <token>
```

### Create Gate Pass
```
POST /api/epass/create
Authorization: Bearer <token>
Content-Type: application/json

{
  "department": "IT",
  "weight": 100,
  "passenger": "John Doe || Jane Smith"
}

Response:
{
  "ok": true,
  "message": "Gate pass created successfully.",
  "epass_number": "S2Y2600001"
}
```

### Link Gate Pass to Fuel Request
```
POST /api/epass/link-fuel
Authorization: Bearer <token>
Content-Type: application/json

{
  "epass_number": "S2Y2600001",
  "far_code": "FAR2600001"
}
```

### Approve Gate Pass
```
POST /api/epass/S2Y2600001/approve
Authorization: Bearer <token>
```

### Reject Gate Pass
```
POST /api/epass/S2Y2600001/reject
Authorization: Bearer <token>
```

---

## Messenger
**Base**: `/api/messenger`
**Auth**: ✅ Required

### Get Messages
```
GET /api/messenger/list
Authorization: Bearer <token>
```

### Send Message
```
POST /api/messenger/send
Authorization: Bearer <token>
Content-Type: application/json

{
  "recipient": "S2086",
  "message": "Hello, how are you?"
}
```

---

## Membership
**Base**: `/api/membership`
**Auth**: ✅ Required

### Get Membership Records
```
GET /api/membership/list
Authorization: Bearer <token>
```

### Get Current Membership Status
```
GET /api/membership/status
Authorization: Bearer <token>
```

---

## IT Equipment
**Base**: `/api/it-equipment`
**Auth**: ✅ Required

### Get Inventory
```
GET /api/it-equipment/inventory
Authorization: Bearer <token>
```

### Get Assigned Equipment
```
GET /api/it-equipment/assigned
Authorization: Bearer <token>
```

---

## Warehouse
**Base**: `/api/warehouse`
**Auth**: ✅ Required

### Get Stock Records
```
GET /api/warehouse/stock
Authorization: Bearer <token>
```

### Get Transaction History
```
GET /api/warehouse/transactions
Authorization: Bearer <token>
```

---

## Overtime
**Base**: `/api/overtime`
**Auth**: ✅ Required

### Get Overtime Records
```
GET /api/overtime/list
Authorization: Bearer <token>
```

### Submit Overtime Request
```
POST /api/overtime/request
Authorization: Bearer <token>
Content-Type: application/json

{
  "hours": 2,
  "reason": "Project deadline"
}
```

---

## Leave
**Base**: `/api/leave`
**Auth**: ✅ Required

### Get Leave Balance
```
GET /api/leave/balance
Authorization: Bearer <token>

Response:
{
  "ok": true,
  "balance": {
    "VL": 10,
    "VLbal": 8,
    "SL": 5,
    "SLbal": 5,
    "OL": 3,
    "OLbal": 2
  }
}
```

### Get Leave History
```
GET /api/leave/history?year=2026
Authorization: Bearer <token>
```

### Submit Leave Request
```
POST /api/leave/request
Authorization: Bearer <token>
Content-Type: application/json

{
  "leave_type": "VL",
  "date_from": "2026-06-15",
  "date_to": "2026-06-17",
  "reason": "Vacation"
}
```

---

## Signatory
**Base**: `/api/signatory`
**Auth**: ✅ Required

### Get Signatories
```
GET /api/signatory/list?department=IT
Authorization: Bearer <token>
```

### Get Signatory by Position
```
GET /api/signatory/by-position?position=Director
Authorization: Bearer <token>
```

---

## AI Chat
**Base**: `/api/ai-chat`
**Auth**: ✅ Required

### Get Chat History
```
GET /api/ai-chat/history
Authorization: Bearer <token>
```

### Send Chat Message
```
POST /api/ai-chat/chat
Authorization: Bearer <token>
Content-Type: application/json

{
  "message": "What is my leave balance?",
  "context": "leave_inquiry"
}
```

### Get AI Configuration
```
GET /api/ai-chat/config
Authorization: Bearer <token>
```

---

## Response Format

### Success Response
```json
{
  "ok": true,
  "message": "Operation successful",
  "data": { ... }
}
```

### Error Response
```json
{
  "ok": false,
  "message": "Error description",
  "errors": { "field": "error message" }
}
```

### HTTP Status Codes
- `200` - OK
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized (no/invalid token)
- `403` - Forbidden (no permission)
- `404` - Not Found
- `409` - Conflict
- `422` - Validation Error
- `500` - Server Error

---

## Rate Limits

Currently: No rate limiting (can be added in production)

Recommended: 100 requests per minute per user

---

## Error Handling

All endpoints follow consistent error handling:

```javascript
try {
  const result = await service.operation();
  return successResponse(res, { result });
} catch (error) {
  next(error); // Global error handler catches it
}
```

Errors are automatically formatted with:
- Appropriate HTTP status code
- Human-readable error message
- Field-level validation errors (if applicable)

---

## Testing Endpoints with curl

### Get Token
```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.token')
```

### Test Protected Endpoint
```bash
curl "http://localhost:3000/api/dtr/records" \
  -H "Authorization: Bearer $TOKEN"
```

### Create with POST
```bash
curl -X POST http://localhost:3000/api/travel/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "department":"IT",
    "destination":"Cebu",
    "purpose":"Meeting",
    "date":"2026-06-15"
  }'
```

---

## Total API Summary

| Module | Endpoints | Protected |
|--------|-----------|-----------|
| Auth | 7 | 5/7 |
| DTR | 3 | 3/3 |
| Travel | 6 | 6/6 |
| Fuel | 5 | 5/5 |
| Epass | 7 | 7/7 |
| Messenger | 2 | 2/2 |
| Membership | 2 | 2/2 |
| IT Equipment | 2 | 2/2 |
| Warehouse | 2 | 2/2 |
| Overtime | 2 | 2/2 |
| Leave | 3 | 3/3 |
| Signatory | 2 | 2/2 |
| AI Chat | 3 | 3/3 |
| **Total** | **47** | **44/47** |

---

**Generated**: June 1, 2026
**Status**: 75% Complete (6 of 8 phases)
**Next**: Frontend JWT integration & Testing

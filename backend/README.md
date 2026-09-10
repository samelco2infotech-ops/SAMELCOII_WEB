# SAMELCII API - Node.js Backend

Modern REST API backend for SAMELCII Web System, converted from PHP to Node.js with Express.js.

## Project Status

### ✅ Completed
- **Phase 1**: Project foundation (config, middleware, utilities, database setup)
- **Phase 2**: Authentication module (login, register, password reset, employee search, profile photos)
- **Phase 3**: DTR module (duty time records with punch pair logic)

### 🔄 In Progress / Remaining
- **Phase 4**: Travel & Fuel modules
- **Phase 5**: Epass & remaining modules
- **Phase 6**: File upload handling optimization
- **Phase 7**: Frontend integration with JWT tokens
- **Phase 8**: Full testing & deployment

---

## Quick Start

### Prerequisites
- Node.js 18+ (LTS)
- MySQL server with `it_program` database
- npm or yarn

### Installation

```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Copy and update environment variables
cp .env.example .env
# Edit .env with your database credentials
nano .env
```

### Running the Server

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

Server will start on `http://localhost:3000`

Health check: `curl http://localhost:3000/health`

### After Deploying Backend Changes to `.99`

Run these commands on the `192.168.1.99` server in **Administrator PowerShell** after deploying changes under `backend/`:

```powershell
cd C:\xampp\htdocs\SAMELCII_WEB_SYSTEM\backend
pm2.cmd restart samelcii-api
pm2.cmd status
curl.exe http://localhost:3000/health
```

The restart loads updated Node routes, services, middleware, and `.env` settings into the running process. HTML, CSS, and frontend JavaScript changes do not require a PM2 restart; use `Ctrl+F5` in the browser instead.

---

## API Endpoints

### Authentication (`/api/auth`)

#### Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

**Response:**
```json
{
  "ok": true,
  "message": "Login successful.",
  "token": "eyJhbGc...",
  "user": {
    "id": 1,
    "usercode": "S2086",
    "name": "John Doe",
    "department": "IT",
    "privilage": "9",
    ...
  }
}
```

#### Register
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"usercode":"S2086","username":"johndoe","password":"secure123"}'
```

#### Reset Password
```bash
curl -X POST http://localhost:3000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"identifier":"S2086","password":"newpassword123"}'
```

#### Search Employees
```bash
curl http://localhost:3000/api/auth/search-employee?q=john
```

#### Upload Profile Photo
```bash
curl -X POST http://localhost:3000/api/auth/upload-profile-photo \
  -H "Authorization: Bearer <token>" \
  -F "file=@photo.jpg"
```

#### Get Current User
```bash
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer <token>"
```

---

### DTR (Duty Time Records) - `/api/dtr`

#### Get Monthly Records
```bash
curl "http://localhost:3000/api/dtr/records?year=2026&month=6" \
  -H "Authorization: Bearer <token>"
```

Optional parameters:
- `usercode=S2086` - Specific employee (defaults to logged-in user)
- `year=2026` - Year (defaults to current)
- `month=6` - Month (defaults to current)

#### Get Daily Record
```bash
curl "http://localhost:3000/api/dtr/daily?date=2026-06-01" \
  -H "Authorization: Bearer <token>"
```

#### Get Yearly Summary
```bash
curl "http://localhost:3000/api/dtr/summary?year=2026" \
  -H "Authorization: Bearer <token>"
```

**Response includes:**
- morning_in / morning_out
- afternoon_in / afternoon_out
- ot_in / ot_out
- undertime_min (minutes)
- ot_minutes (overtime minutes)
- Work area for each punch

---

## Authentication

All protected endpoints require a JWT token in the `Authorization` header:

```
Authorization: Bearer <token>
```

Tokens expire in 7 days (configurable in `.env`)

---

## Project Structure

```
backend/
├── src/
│   ├── config/
│   │   ├── env.js              # Environment configuration
│   │   ├── database.js         # MySQL2 connection pool
│   │   └── constants.js        # App-wide constants
│   ├── middleware/
│   │   ├── auth.js             # JWT verification + token generation
│   │   ├── errorHandler.js     # Global error handling
│   │   └── fileUpload.js       # Multer configuration
│   ├── routes/
│   │   ├── auth.js             # Authentication endpoints
│   │   ├── dtr.js              # Duty time records
│   │   ├── travel.js           # Travel orders (coming)
│   │   ├── fuel.js             # Fuel management (coming)
│   │   ├── epass.js            # Gate passes (coming)
│   │   └── [other modules]
│   ├── services/
│   │   ├── authService.js      # Auth business logic
│   │   ├── dtrService.js       # DTR punch parsing logic
│   │   ├── commonService.js    # Shared utilities
│   │   └── [other services]
│   ├── utils/
│   │   ├── response.js         # JSON response helpers
│   │   ├── validation.js       # Input validation
│   │   └── dateTime.js         # Date/time utilities
│   └── app.js                  # Express app setup
├── server.js                   # Entry point
├── .env                        # Environment variables
├── package.json
└── README.md
```

---

## Database

The backend uses MySQL2 with a connection pool for better performance.

**Key Tables:**
- `usertb` - Employee/user accounts
- `dtr_punches` - Biometric clock records
- `traveltb` - Travel orders
- `fuelallocation_history` - Fuel requests
- `epasstb` - Gate passes
- `vehicletb` - Vehicle inventory

Schema auto-migration runs on server startup. Missing columns are automatically added.

---

## Error Handling

All responses follow a consistent format:

**Success:**
```json
{
  "ok": true,
  "message": "Operation successful",
  "data": { ... }
}
```

**Error:**
```json
{
  "ok": false,
  "message": "Error description",
  "errors": { "field": "validation message" }
}
```

HTTP Status Codes:
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `422` - Validation Error
- `500` - Server Error

---

## Configuration

### Environment Variables (`.env`)

```env
# Database
DB_HOST=localhost
DB_NAME=it_program
DB_USER=your_db_user
DB_PASS=your_db_password
DB_PORT=3306

# Server
PORT=3000
NODE_ENV=development

# JWT
JWT_SECRET=your_secret_key_here

# File Uploads
MAX_FILE_SIZE=160000
UPLOAD_DIR=uploads

# App
APP_NAME=SAMELCII
APP_WEB_PREFIX=/SAMELCII_WEB_SYSTEM
```

---

## Development Notes

### Adding New Endpoints

1. Create a service in `src/services/moduleService.js`
2. Create routes in `src/routes/module.js`
3. Register route in `src/app.js`
4. Use JWT middleware for protected routes

### Testing Auth Endpoints

```bash
# 1. Login to get token
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.token')

# 2. Use token for protected requests
curl http://localhost:3000/api/dtr/records \
  -H "Authorization: Bearer $TOKEN"
```

---

## Migration Notes (From PHP)

**Key Changes:**
1. JWT tokens replace PHP sessions
2. MySQL2 with promise API replaces PDO
3. Express.js routing replaces action-based PHP
4. Bcrypt password hashing (supports legacy plaintext)
5. Multer handles file uploads (replaces `$_FILES`)
6. Consistent JSON error responses

**Frontend Updates Required:**
1. Store JWT token in `localStorage`
2. Include token in `Authorization` header
3. Remove session-based auth logic
4. Handle token expiration (redirect to login)

---

## Next Steps

### Phase 4: Travel & Fuel Modules
- Travel order CRUD operations
- Approval workflow
- Fuel allocation management
- Vehicle assignment logic

### Phase 5: Epass & Other Modules
- Gate pass generation
- Fuel-to-epass linking
- Remaining modules (messenger, membership, etc.)

### Phase 6: Integration
- Frontend JWT authentication
- Token refresh mechanism
- Error handling improvements

---

## Troubleshooting

### Database Connection Failed
- Verify `DB_HOST`, `DB_USER`, `DB_PASS` in `.env`
- Ensure MySQL server is running
- Check network connectivity to database

### Port Already in Use
```bash
# Change PORT in .env or use:
PORT=3001 npm start
```

### Schema Errors
- Server auto-migrates missing columns on startup
- Check server logs for specific column errors
- Ensure database user has ALTER TABLE permissions

---

## Performance Considerations

- Connection pooling: 10 concurrent connections by default
- Prepare statements for all queries
- Indexed lookups on usercode, dates, status fields
- Stateless JWT reduces database session overhead

---

## Support

For issues or questions:
1. Check error messages in server logs
2. Verify database connectivity
3. Review request/response format in docs
4. Ensure token hasn't expired

---

**Last Updated**: 2026-06-01
**Status**: Core modules complete, integration pending

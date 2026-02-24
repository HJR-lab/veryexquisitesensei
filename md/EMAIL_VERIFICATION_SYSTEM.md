# Student Email Verification System

## Overview
A complete email verification and password setup flow for first-time student login.

## User Flow

### 1. First-Time Student Access
1. Student visits `/verify-email` page (linked from login page as "First time? Verify Your Email")
2. Enters their email address
3. System sends a 6-digit PIN code (currently logged to console, can be enhanced with email service)

### 2. PIN Verification
1. Student receives 6-digit PIN (e.g., 123456)
2. Enters PIN on verification page
3. System validates PIN and creates temporary token (valid for 30 minutes)

### 3. Password Setup
1. After successful PIN verification, student is redirected to `/setup-password`
2. Creates a secure password (minimum 8 characters)
3. Password strength indicator shows weak/medium/strong
4. Upon successful password setup:
   - Password is hashed and stored in database
   - Student is automatically logged in
   - Redirected to gallery page

### 4. Subsequent Logins
- Students can log in normally at `/login` with email and password
- No need to reverify email

## Backend Endpoints

### POST `/api/auth/request-verification`
**Purpose**: Generate and send 6-digit PIN code

**Request**:
```json
{
  "email": "student@example.com"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Verification code sent to your email",
  "code": "123456"  // Only in development mode
}
```

**Validations**:
- Email must exist in customers table
- Customer must not already have a password set
- Previous unverified codes are deleted
- Code expires in 15 minutes

### POST `/api/auth/verify-pin`
**Purpose**: Verify 6-digit PIN and issue temporary token

**Request**:
```json
{
  "email": "student@example.com",
  "code": "123456"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Email verified successfully",
  "tempToken": "eyJhbGciOiJ...",
  "customer": {
    "id": 123,
    "email": "student@example.com",
    "firstName": "John",
    "lastName": "Doe"
  }
}
```

**Validations**:
- Code must match and not be verified yet
- Code must not be expired
- Marks code as verified after successful validation

### POST `/api/auth/set-initial-password`
**Purpose**: Set initial password and log user in

**Request**:
```json
{
  "tempToken": "eyJhbGciOiJ...",
  "newPassword": "SecurePassword123"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Password set successfully. You are now logged in.",
  "user": {
    "id": "123456789",
    "dbId": 123,
    "email": "student@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "profilePicture": null,
    "isAdmin": false
  },
  "token": "eyJhbGciOiJ..."
}
```

**Validations**:
- Temporary token must be valid and not expired
- Token must have isTemporary and isVerified flags
- Password must be at least 8 characters
- Customer must not already have a password set
- Password is hashed with bcrypt (10 rounds)

### POST `/api/auth/login` (Updated)
**Purpose**: Login for both admin and students

**Admin Login**:
- Email: `info@ves.sg`
- Password: Hardcoded admin password
- Returns `isAdmin: true`

**Student Login**:
- Email: Any registered customer email
- Password: Password set during verification
- Returns `isAdmin: false`
- If no password set: Returns error with `needsVerification: true`

## Frontend Pages

### `/verify-email` (VerifyEmail.jsx)
**Features**:
- Two-step form (email entry → PIN entry)
- Resend code functionality
- Change email option
- Success/error messaging
- In development: Shows PIN in console

**Styling**:
- Uses existing Auth.css styles
- Clean, minimal design matching login page

### `/setup-password` (SetupPassword.jsx)
**Features**:
- Password strength indicator (weak/medium/strong)
- Password confirmation field
- Real-time validation
- Automatic login after successful setup
- Session timeout handling

**Styling**:
- Visual password strength meter
- Matches existing auth page design

## Database Schema

### `verification_codes` Table
```sql
CREATE TABLE verification_codes (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  code VARCHAR(6) NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_verification_codes_customer_id ON verification_codes(customer_id);
CREATE INDEX idx_verification_codes_email ON verification_codes(email);
```

**To create this table**: Run the SQL in `/server/verification-table.sql` in Supabase SQL Editor

### `customers` Table (Existing)
- `password_hash`: VARCHAR - Stores bcrypt hashed password
- Used for student authentication

## Security Features

1. **PIN Code Expiration**: Codes expire after 15 minutes
2. **Temporary Token**: Password setup token expires after 30 minutes
3. **bcrypt Password Hashing**: Passwords hashed with 10 rounds
4. **One-Time Verification**: PIN marked as verified after use
5. **Previous Code Cleanup**: Old unverified codes deleted when new one requested
6. **Password Validation**: Minimum 8 characters required
7. **Session Management**: JWT tokens with 7-day expiration

## Email Integration (Future Enhancement)

Currently, PIN codes are logged to console. To add email functionality:

1. **Install Email Service**:
```bash
npm install nodemailer
# or
npm install @sendgrid/mail
```

2. **Update `/api/auth/request-verification`**:
Replace console.log section (lines 430-436) with email sending code:

```javascript
// Example with nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

await transporter.sendMail({
  from: 'noreply@ves.sg',
  to: email,
  subject: 'VES Pottery - Email Verification Code',
  html: `
    <h1>Welcome to VES Pottery!</h1>
    <p>Your verification code is: <strong>${code}</strong></p>
    <p>This code will expire in 15 minutes.</p>
  `
});
```

## Testing the System

### Test with an Existing Student

1. Find a student without a password in the database:
```sql
SELECT email, first_name, last_name
FROM customers
WHERE password_hash IS NULL
LIMIT 1;
```

2. Visit `/verify-email` and enter their email

3. Check server console for the 6-digit PIN

4. Enter the PIN and set up a password

5. Login at `/login` with the new credentials

### Development Notes

- In development mode, the PIN is returned in the API response and logged to console
- In production, remove the code from the response (already conditionally handled)
- Temporary tokens and PINs have appropriate expiration times
- All passwords are securely hashed before storage

## Files Created/Modified

### Backend
- `/server/index.js`: Added 3 verification endpoints + updated login endpoint
- `/server/verification-table.sql`: Database schema
- `/server/create-verification-table.js`: Helper script (optional)

### Frontend
- `/frontend/src/pages/VerifyEmail.jsx`: Email + PIN verification page
- `/frontend/src/pages/SetupPassword.jsx`: Password setup page
- `/frontend/src/styles/Auth.css`: Added success-message, btn-secondary, btn-link styles
- `/frontend/src/App.jsx`: Added routes for new pages
- `/frontend/src/pages/Login.jsx`: Updated footer link to verification page

## Next Steps

1. **Create verification_codes table**: Run SQL from `verification-table.sql`
2. **Test the flow**: Use an existing customer without a password
3. **Add email service** (optional): Integrate nodemailer or SendGrid
4. **Customize email template**: Design email with branding
5. **Monitor verification logs**: Track successful/failed verifications

## Deployment

Remember to:
- Set `NODE_ENV=production` in production environment
- Add email service credentials to environment variables
- Test verification flow in production
- Monitor for verification errors

---

🎉 The system is ready to handle student email verification and password setup!

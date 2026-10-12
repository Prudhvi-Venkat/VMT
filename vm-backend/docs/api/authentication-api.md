# Authentication & Platform Admin API Specification

## Overview
All authentication endpoints are mounted under `/api/v1/auth`.

---

## Endpoints

### 1. User Login
- **Method**: `POST`
- **Path**: `/api/v1/auth/login`
- **Rate Limit**: 10 requests / 1 minute per IP (configurable)
- **Request Body**:
  ```json
  {
    "email": "admin@platform.local",
    "password": "StrongPassword#2026!"
  }
  ```
- **Responses**:
  - `200 OK`:
    ```json
    {
      "accessToken": "eyJhbGciOi...",
      "refreshToken": "ses_123.abc456...",
      "tokenType": "Bearer",
      "expiresIn": 900,
      "user": {
        "id": "usr_123",
        "email": "admin@platform.local",
        "roles": ["PLATFORM_ADMIN"],
        "status": "ACTIVE",
        "scope": "platform",
        "createdAt": "2026-09-28T00:00:00.000Z",
        "lastLoginAt": "2026-09-28T10:00:00.000Z"
      }
    }
    ```
    - Also sets `refreshToken` in `Set-Cookie` header (`HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/api/v1/auth`).
  - `401 Unauthorized`:
    ```json
    {
      "error": {
        "code": "INVALID_CREDENTIALS",
        "message": "Invalid credentials",
        "requestId": "req-uuid"
      }
    }
    ```
  - `429 Too Many Requests`: Rate limit exceeded.

---

### 2. Token Refresh
- **Method**: `POST`
- **Path**: `/api/v1/auth/refresh`
- **Rate Limit**: 20 requests / 1 minute per IP
- **Request Body** (optional if cookie is sent):
  ```json
  {
    "refreshToken": "ses_123.abc456..."
  }
  ```
- **Responses**:
  - `200 OK`:
    ```json
    {
      "accessToken": "eyJhbGciOi...",
      "refreshToken": "ses_123.newSecret...",
      "tokenType": "Bearer",
      "expiresIn": 900
    }
    ```
  - `401 Unauthorized`:
    - `REFRESH_TOKEN_REUSE_DETECTED`: If a previously rotated token is replayed. In this event, the entire session family is revoked.
    - `SESSION_INVALID` / `SESSION_EXPIRED` / `USER_INACTIVE`.
  - `409 Conflict`:
    - `ROTATION_CONFLICT`: Concurrent rotation request conflict.

---

### 3. User Logout (Single Session)
- **Method**: `POST`
- **Path**: `/api/v1/auth/logout`
- **Headers**: `Authorization: Bearer <accessToken>`
- **Responses**:
  - `200 OK`:
    ```json
    {
      "message": "Logged out successfully"
    }
    ```
    - Clears the `refreshToken` cookie.
  - `401 Unauthorized`: Missing or invalid access token.

---

### 4. Logout All Sessions
- **Method**: `POST`
- **Path**: `/api/v1/auth/logout-all`
- **Headers**: `Authorization: Bearer <accessToken>`
- **Responses**:
  - `200 OK`:
    ```json
    {
      "message": "All sessions logged out successfully"
    }
    ```
    - Revokes all active sessions for the user.

---

### 5. Get Current Profile
- **Method**: `GET`
- **Path**: `/api/v1/auth/me`
- **Headers**: `Authorization: Bearer <accessToken>`
- **Responses**:
  - `200 OK`:
    ```json
    {
      "id": "usr_123",
      "email": "admin@platform.local",
      "roles": ["PLATFORM_ADMIN"],
      "status": "ACTIVE",
      "scope": "platform",
      "createdAt": "2026-09-28T00:00:00.000Z",
      "lastLoginAt": "2026-09-28T10:00:00.000Z"
    }
    ```
  - `401 Unauthorized`: Invalid, expired token, or revoked session.

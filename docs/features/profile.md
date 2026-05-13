# Profile

| Method | Path | Body | Notes |
|--------|------|------|-------|
| GET | `/me` | — | Returns the public profile. |
| PATCH | `/me` | `{ fullName?, phone?, avatarUrl?, biography?, preferredLanguage? }` | Email + role immutable here. |

Users table includes `phone`, `avatar_url`, `biography`, `preferred_language` (default `en`).
The frontend `ProfilePage` (`/account`) hosts the form; the existing `/auth/me` stays in
place for compatibility.

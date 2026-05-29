# Auth: Remove Social Login + Enforce Role Match on Sign-in — Design

**Date:** 2026-05-29
**Status:** Approved, pending implementation

## Goals

1. Remove the (non-functional) Google/Apple buttons from the auth modal UI.
2. Make sign-in respect the selected role: if the chosen role doesn't match the
   account's role, show a clear error and do not sign in. Today the role toggle
   on sign-in is ignored — any valid credentials log in and redirect to the
   account's real role.

## Part 1 — Remove social login (frontend only)

In `frontend/src/pages/AuthPage.jsx`:
- Remove the "or" divider block.
- Remove the two-column grid of `SocialButton`s (Google, Apple).
- Remove the now-unused `SocialButton` function component.

Nothing else in the form changes. The `-apple-system` reference in
`frontend/src/index.css` is an unrelated font fallback and is left untouched.

## Part 2 — Role must match on sign-in

Enforced in the backend with an **optional** role field, so existing callers
(e2e tests) that omit `role` keep their current behavior.

### Backend

- `backend/src/auth/dto/login.dto.ts`: add an optional `role` field:
  ```ts
  @IsOptional()
  @IsIn(['buyer', 'seller'])
  role?: UserRole;
  ```
- `backend/src/auth/auth.service.ts` (`login`): after the existing password
  check passes, add:
  ```ts
  if (dto.role && dto.role !== user.role) {
    throw new UnauthorizedException(
      `This account is not registered as a ${dto.role} account.`,
    );
  }
  ```
  Because `role` is optional, a login request without `role` behaves exactly as
  before.

### Error message

`This account is not registered as a {role} account.` — e.g. "This account is
not registered as a seller account." This is reached only after the password is
verified, so it does reveal that the account exists under a different role. This
is an accepted trade-off for this project (the user explicitly wants a clear
message rather than a vague one).

### Frontend

- `frontend/src/services/auth.js`: `login({ email, password, role })` includes
  `role` in the POST body.
- `frontend/src/pages/AuthPage.jsx`: pass the selected role to
  `login({ email, password, role })`. On a 401 the backend's message surfaces in
  the existing red error alert (`ApiError.message`); no token is stored and the
  user stays on the form.

### Register is unchanged

The role chosen at sign-up *is* the account's role, so it is always "correct".
Only sign-in needs the match check.

## Testing

- Backend e2e (`backend/test/auth.e2e-spec.ts`) — add cases:
  - login with a `role` matching the account → `200`.
  - login with a `role` not matching the account → `401`, with the
    "not registered as a {role} account" message.
  - login with no `role` → `200` (backward compatibility).
  - Existing login tests (no `role`) must remain green.
- Frontend has no test harness (per `CLAUDE.md`) → verify visually on the auth
  page: social buttons gone; signing in with the wrong role shows the error and
  does not navigate; signing in with the correct role works and redirects
  (`/store` for seller, `/` for buyer).

## Documentation

Update `docs/features/auth.md`:
- Remove the "Google / Apple buttons in the UI are visual stubs" line.
- Document the optional `role` on `POST /auth/login` and the mismatch error.

This modifies an existing feature, so no new row is added to `docs/README.md`.

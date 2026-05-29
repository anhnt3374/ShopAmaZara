# Auth: Role Match on Sign-in + Remove Social Login — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the placeholder Google/Apple buttons from the auth UI and make sign-in reject a credential set when the selected role doesn't match the account's role.

**Architecture:** Backend enforces the role match via an optional `role` field on `LoginDto` (optional keeps existing role-less callers working). The frontend always sends the selected role and surfaces the backend's error in the existing alert. Register is unchanged.

**Tech Stack:** NestJS 10 + class-validator (backend), Jest + supertest (e2e), React 18 + Vite + Tailwind (frontend).

---

### Task 1: Backend — optional role on LoginDto + role-match check

**Files:**
- Modify: `backend/src/auth/dto/login.dto.ts`
- Modify: `backend/src/auth/auth.service.ts`
- Test: `backend/test/auth.e2e-spec.ts`

This project's e2e suite needs a running MySQL (`docker compose up -d mysql`). Follow TDD: add the failing e2e tests first.

- [ ] **Step 1: Add the failing e2e tests**

In `backend/test/auth.e2e-spec.ts`, inside the `describe('POST /auth/login', ...)` block (which already has a `beforeEach` registering `validBody`, a `buyer`), add these three tests after the existing `'returns user + accessToken on valid credentials'` test:

```ts
    it('returns 200 when the supplied role matches the account', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: validBody.email, password: validBody.password, role: 'buyer' });
      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe('buyer');
    });

    it('returns 401 when the supplied role does not match the account', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: validBody.email, password: validBody.password, role: 'seller' });
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('This account is not registered as a seller account.');
    });

    it('returns 400 when role is present but invalid', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: validBody.email, password: validBody.password, role: 'admin' });
      expect(res.status).toBe(400);
    });
```

(The existing `'returns user + accessToken on valid credentials'` test sends no `role` and must keep passing — that is the backward-compatibility check.)

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
cd /home/anhnt2112/Documents/temp/amazara/backend && npm run test:e2e -- auth
```

Expected: the "role matches" test fails (role currently ignored / 200 but no behavior), the "role does not match" test FAILS (currently returns 200, not 401), and "role present but invalid" FAILS (currently `role` is a non-whitelisted field → may already 400, but the matching/mismatch tests will fail). The key failing assertion is the 401 mismatch case.

- [ ] **Step 3: Add the optional role to LoginDto**

Edit `backend/src/auth/dto/login.dto.ts`. Add the imports and the field. The full file becomes:

```ts
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { UserRole } from '../../users/user.entity';

export class LoginDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @Length(8, 128)
  password!: string;

  @IsOptional()
  @IsIn(['buyer', 'seller'])
  role?: UserRole;
}
```

- [ ] **Step 4: Add the role-match check in AuthService.login**

Edit `backend/src/auth/auth.service.ts`. The current `login` method is:

```ts
  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.users.findByEmailWithHash(dto.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    return this.toAuthResponse(user);
  }
```

Replace it with (adds the role check after the password check):

```ts
  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.users.findByEmailWithHash(dto.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    if (dto.role && dto.role !== user.role) {
      throw new UnauthorizedException(
        `This account is not registered as a ${dto.role} account.`,
      );
    }
    return this.toAuthResponse(user);
  }
```

- [ ] **Step 5: Run the auth e2e suite to verify all pass**

```bash
cd /home/anhnt2112/Documents/temp/amazara/backend && npm run test:e2e -- auth
```

Expected: all tests in `auth.e2e-spec.ts` PASS, including the pre-existing role-less login test.

- [ ] **Step 6: Commit**

```bash
cd /home/anhnt2112/Documents/temp/amazara
git add backend/src/auth/dto/login.dto.ts backend/src/auth/auth.service.ts backend/test/auth.e2e-spec.ts
git commit -m "feat(auth): enforce role match on login via optional role field"
```

---

### Task 2: Frontend — send selected role on login

**Files:**
- Modify: `frontend/src/services/auth.js`
- Modify: `frontend/src/pages/AuthPage.jsx`

No frontend test harness; verified in Task 4.

- [ ] **Step 1: Send role from the auth service**

Edit `frontend/src/services/auth.js`. Change the `login` function from:

```js
export function login({ email, password }) {
  return api.post('/auth/login', { email, password });
}
```

to:

```js
export function login({ email, password, role }) {
  return api.post('/auth/login', { email, password, role });
}
```

Leave `register` and `me` unchanged.

- [ ] **Step 2: Pass the selected role from AuthPage**

Edit `frontend/src/pages/AuthPage.jsx`. In `handleSubmit`, the current call is:

```jsx
      const user =
        mode === 'signin'
          ? await login({ email, password })
          : await register({ email, password, fullName, role });
```

Change the sign-in branch to include `role`:

```jsx
      const user =
        mode === 'signin'
          ? await login({ email, password, role })
          : await register({ email, password, fullName, role });
```

Nothing else changes — `role` is already in component state and the existing `error` alert already renders `ApiError.message`.

- [ ] **Step 3: Commit**

```bash
cd /home/anhnt2112/Documents/temp/amazara
git add frontend/src/services/auth.js frontend/src/pages/AuthPage.jsx
git commit -m "feat(auth): send selected role when signing in"
```

---

### Task 3: Frontend — remove Google/Apple social login

**Files:**
- Modify: `frontend/src/pages/AuthPage.jsx`

- [ ] **Step 1: Remove the divider and social button grid**

In `frontend/src/pages/AuthPage.jsx`, delete this block (it sits between the submit `<button>` and the "New to AmaZara?" paragraph):

```jsx
          <div className="flex items-center gap-3 text-body-sm text-on-surface-variant my-2">
            <span className="flex-1 border-t border-outline-variant" />
            or
            <span className="flex-1 border-t border-outline-variant" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <SocialButton icon="g_translate" label="Google" />
            <SocialButton icon="apple" label="Apple" />
          </div>

```

Delete the entire block above (including the trailing blank line) so the submit button is directly followed by the "New to AmaZara?" paragraph.

- [ ] **Step 2: Remove the now-unused SocialButton component**

At the bottom of the same file, delete the entire `SocialButton` function component:

```jsx
function SocialButton({ icon, label }) {
  return (
    <button
      type="button"
      className="border border-outline-variant rounded-lg py-2.5 px-3 inline-flex items-center justify-center gap-2 text-label-md text-on-surface hover:bg-surface-container-low transition-colors"
    >
      <Icon name={icon} size={20} />
      {label}
    </button>
  );
}
```

Leave the `Field` component and the default export intact.

- [ ] **Step 3: Verify the build compiles**

```bash
cd /home/anhnt2112/Documents/temp/amazara/frontend && npx vite build 2>&1 | tail -20
```

Expected: build completes ("built in ...") with no errors. In particular, no "SocialButton is not defined" reference error.

- [ ] **Step 4: Commit**

```bash
cd /home/anhnt2112/Documents/temp/amazara
git add frontend/src/pages/AuthPage.jsx
git commit -m "feat(auth): remove Google/Apple social login buttons"
```

---

### Task 4: Visual verification

**Files:** none (manual verification)

- [ ] **Step 1: Start the stack**

```bash
cd /home/anhnt2112/Documents/temp/amazara && docker compose up -d
```

- [ ] **Step 2: Verify on the auth page**

Open `http://localhost:5173` and go to the sign-in/sign-up page. Confirm:
- The Google and Apple buttons and the "or" divider are gone.
- Register a buyer. Then sign out and try to sign in with the **Store Owner** role selected → the error "This account is not registered as a seller account." appears and you stay on the form (not redirected).
- Sign in again with the **Buyer** role selected → succeeds and redirects to `/`.
- Repeat with a seller account: wrong role (Buyer) → error; correct role (Store Owner) → redirects to `/store`.

No commit (verification only).

---

### Task 5: Update documentation

**Files:**
- Modify: `docs/features/auth.md`

- [ ] **Step 1: Update the login endpoint section**

In `docs/features/auth.md`, find the `### POST /auth/login` section. Replace its request body and responses (currently):

```markdown
Request body:

```json
{ "email": "jane@example.com", "password": "hunter2hunter2" }
```

Responses:
- `200 OK` → same shape as register success
- `400 Bad Request` → validation error
- `401 Unauthorized` → `{ "message": "Invalid credentials", ... }` for both wrong
  password and unknown email (intentional, to avoid user enumeration)
```

with:

```markdown
Request body (`role` is optional):

```json
{ "email": "jane@example.com", "password": "hunter2hunter2", "role": "buyer" }
```

Responses:
- `200 OK` → same shape as register success
- `400 Bad Request` → validation error (includes `role` not in `buyer`/`seller`)
- `401 Unauthorized` → `{ "message": "Invalid credentials", ... }` for both wrong
  password and unknown email (intentional, to avoid user enumeration)
- `401 Unauthorized` → `{ "message": "This account is not registered as a <role>
  account.", ... }` when `role` is supplied and does not match the account's role
```

- [ ] **Step 2: Update the known-limitations list**

In the `## Known limitations / follow-ups` section, remove this line:

```markdown
- Google / Apple buttons in the UI are visual stubs.
```

- [ ] **Step 3: Commit**

```bash
cd /home/anhnt2112/Documents/temp/amazara
git add docs/features/auth.md
git commit -m "docs(auth): document role on login, drop social-stub note"
```

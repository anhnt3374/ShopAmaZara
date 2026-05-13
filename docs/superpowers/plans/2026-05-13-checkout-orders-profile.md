# Checkout, Orders, and Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship buyer-side Payment (checkout), Order Management, Order Detail, and Profile + Addresses pages, plus the backend they need (mocked payment).

**Architecture:** Add `user_addresses` table + extend `users` and `orders` with snapshot columns. Rename order status `Processing → Paid`. Five new React pages reusing the existing `UserLayout` + `ToastContext` + `CartContext`. Checkout becomes a separate `/checkout` page; cart's "checkout" button now navigates there.

**Tech Stack:** NestJS 10 + TypeORM + MySQL on the backend (Jest unit + e2e), React 18 + Vite + Tailwind on the frontend (no FE test harness — manual verification on dev server).

**Spec:** [`docs/superpowers/specs/2026-05-13-checkout-orders-profile-design.md`](../specs/2026-05-13-checkout-orders-profile-design.md)

**Working directory throughout:** `/home/anhnt2112/Documents/temp/amazara`. All paths below are relative to it unless absolute.

---

## File map

**Backend — new:**
- `backend/src/addresses/address.entity.ts`
- `backend/src/addresses/addresses.module.ts`
- `backend/src/addresses/addresses.service.ts`
- `backend/src/addresses/addresses.service.spec.ts`
- `backend/src/addresses/addresses.controller.ts`
- `backend/src/addresses/dto/create-address.dto.ts`
- `backend/src/addresses/dto/update-address.dto.ts`
- `backend/src/users/users.controller.ts`
- `backend/src/users/dto/update-profile.dto.ts`
- `backend/src/orders/dto/cancel-order.dto.ts` (not strictly needed; cancel takes no body — skipped)
- `backend/src/common/bootstrap/order-status-rename.ts`
- `backend/test/addresses.e2e-spec.ts`

**Backend — modified:**
- `backend/src/users/user.entity.ts` — new columns
- `backend/src/users/users.service.ts` — `updateProfile`, return shape with new fields
- `backend/src/users/users.module.ts` — register controller
- `backend/src/auth/auth.service.ts` — `toPublic` now includes new fields
- `backend/src/orders/order.entity.ts` — new columns + enum rename
- `backend/src/orders/orders.service.ts` — new checkout signature; cancel; seller status timestamps; stock restore on cancel
- `backend/src/orders/orders.service.spec.ts` — extend
- `backend/src/orders/orders.controller.ts` — cancel route
- `backend/src/orders/orders.module.ts` — import `AddressesModule` / `UserAddress` repo
- `backend/src/orders/dto/checkout.dto.ts` — new fields
- `backend/src/orders/dto/update-order-status.dto.ts` — `'Paid'`
- `backend/src/app.module.ts` — register `AddressesModule`, new entities, run rename bootstrap
- `backend/test/orders.e2e-spec.ts` — updated payload, new cancel test
- `backend/test/store-orders.e2e-spec.ts` — `'Paid'` instead of `'Processing'`
- `backend/test/setup-e2e.ts` — truncate `user_addresses`

**Frontend — new:**
- `frontend/src/pages/CheckoutPage.jsx`
- `frontend/src/pages/OrderManagementPage.jsx`
- `frontend/src/pages/OrderDetailPage.jsx`
- `frontend/src/pages/ProfilePage.jsx`
- `frontend/src/pages/AddressesPage.jsx`
- `frontend/src/components/AccountSideNav.jsx`
- `frontend/src/components/AddressForm.jsx`
- `frontend/src/components/OrderStatusBadge.jsx`
- `frontend/src/components/OrderTimeline.jsx`
- `frontend/src/services/addresses.js`
- `frontend/src/services/profile.js`

**Frontend — modified:**
- `frontend/src/router.jsx` — 5 new routes
- `frontend/src/pages/CartPage.jsx` — Checkout button navigates
- `frontend/src/services/orders.js` — `cancelOrder`, updated checkout payload
- `frontend/src/context/AuthContext.jsx` — refresh-on-save
- `frontend/src/components/TopNavBar.jsx` — account icon links to `/account`

**Docs:**
- `docs/features/orders.md` — updated
- `docs/features/profile.md` — new
- `docs/features/addresses.md` — new
- `docs/README.md` — rows

---

## Phase A — Backend: users & addresses

### Task 1: Extend `User` entity with profile columns

**Files:**
- Modify: `backend/src/users/user.entity.ts`

- [ ] **Step 1: Add columns**

Replace the body of `backend/src/users/user.entity.ts` so it reads:

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type UserRole = 'buyer' | 'seller';

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255, select: false })
  passwordHash!: string;

  @Column({ name: 'full_name', type: 'varchar', length: 255 })
  fullName!: string;

  @Column({ type: 'enum', enum: ['buyer', 'seller'], default: 'buyer' })
  role!: UserRole;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone!: string | null;

  @Column({ name: 'avatar_url', type: 'varchar', length: 512, nullable: true })
  avatarUrl!: string | null;

  @Column({ type: 'text', nullable: true })
  biography!: string | null;

  @Column({ name: 'preferred_language', type: 'varchar', length: 16, default: 'en' })
  preferredLanguage!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}
```

- [ ] **Step 2: Verify compile**

Run: `cd backend && npx tsc --noEmit -p tsconfig.build.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/users/user.entity.ts
git commit -m "feat(users): add phone, avatar, bio, preferred_language columns"
```

---

### Task 2: Update `PublicUser` shape + `AuthService.toPublic`

**Files:**
- Modify: `backend/src/auth/auth.service.ts`

- [ ] **Step 1: Edit PublicUser + toPublic**

In `backend/src/auth/auth.service.ts`:

```ts
export interface PublicUser {
  id: string;
  email: string;
  fullName: string;
  role: 'buyer' | 'seller';
  phone: string | null;
  avatarUrl: string | null;
  biography: string | null;
  preferredLanguage: string;
}
```

and replace the body of `toPublic`:

```ts
toPublic(user: User): PublicUser {
  return {
    id: String(user.id),
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    phone: user.phone ?? null,
    avatarUrl: user.avatarUrl ?? null,
    biography: user.biography ?? null,
    preferredLanguage: user.preferredLanguage ?? 'en',
  };
}
```

- [ ] **Step 2: Run existing auth unit tests to confirm nothing breaks**

Run: `cd backend && npx jest auth`
Expected: existing auth tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend/src/auth/auth.service.ts
git commit -m "feat(auth): include profile fields in PublicUser"
```

---

### Task 3: `UpdateProfileDto`

**Files:**
- Create: `backend/src/users/dto/update-profile.dto.ts`

- [ ] **Step 1: Write the DTO**

```ts
import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string | null;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(512)
  avatarUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  biography?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  preferredLanguage?: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/users/dto/update-profile.dto.ts
git commit -m "feat(users): add UpdateProfileDto"
```

---

### Task 4: `UsersService.updateProfile` + spec

**Files:**
- Modify: `backend/src/users/users.service.ts`
- Modify: `backend/src/users/users.service.spec.ts`

- [ ] **Step 1: Write failing tests** — append to `users.service.spec.ts`:

```ts
describe('updateProfile', () => {
  it('updates only provided fields and trims fullName', async () => {
    const existing = {
      id: '1',
      email: 'a@b.c',
      fullName: 'Old',
      role: 'buyer',
      phone: null,
      avatarUrl: null,
      biography: null,
      preferredLanguage: 'en',
    } as unknown as User;
    (repo.findOne as jest.Mock).mockResolvedValue(existing);
    (repo.save as jest.Mock).mockImplementation((u) => ({ ...existing, ...u }));

    const out = await service.updateProfile('1', {
      fullName: '  New Name  ',
      phone: '+1 555',
    });

    expect(out.fullName).toBe('New Name');
    expect(out.phone).toBe('+1 555');
    expect(out.biography).toBeNull();
  });

  it('throws NotFound when user does not exist', async () => {
    (repo.findOne as jest.Mock).mockResolvedValue(null);
    await expect(service.updateProfile('1', { fullName: 'x' })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest users.service.spec`
Expected: FAIL — `service.updateProfile is not a function`.

- [ ] **Step 3: Implement** — in `backend/src/users/users.service.ts` add at top: `import { NotFoundException } from '@nestjs/common';` then append method to the `UsersService` class:

```ts
async updateProfile(
  id: string,
  patch: Partial<{
    fullName: string;
    phone: string | null;
    avatarUrl: string | null;
    biography: string | null;
    preferredLanguage: string;
  }>,
): Promise<User> {
  const user = await this.users.findOne({ where: { id } });
  if (!user) throw new NotFoundException('User not found');
  if (patch.fullName !== undefined) user.fullName = patch.fullName.trim();
  if (patch.phone !== undefined) user.phone = patch.phone;
  if (patch.avatarUrl !== undefined) user.avatarUrl = patch.avatarUrl;
  if (patch.biography !== undefined) user.biography = patch.biography;
  if (patch.preferredLanguage !== undefined)
    user.preferredLanguage = patch.preferredLanguage;
  return this.users.save(user);
}
```

- [ ] **Step 4: Re-run tests**

Run: `cd backend && npx jest users.service.spec`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/users/users.service.ts backend/src/users/users.service.spec.ts
git commit -m "feat(users): updateProfile service method"
```

---

### Task 5: `UsersController` with `GET /me` + `PATCH /me`

**Files:**
- Create: `backend/src/users/users.controller.ts`
- Modify: `backend/src/users/users.module.ts`

- [ ] **Step 1: Create controller**

```ts
import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthService } from '../auth/auth.service';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller('me')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  async get(@Req() req: Request & { user: { id: string } }) {
    const u = await this.users.findById(req.user.id);
    if (!u) throw new Error('User missing');
    return this.auth.toPublic(u);
  }

  @Patch()
  async update(
    @Req() req: Request & { user: { id: string } },
    @Body() dto: UpdateProfileDto,
  ) {
    const u = await this.users.updateProfile(req.user.id, dto);
    return this.auth.toPublic(u);
  }
}
```

- [ ] **Step 2: Register controller**

Replace `backend/src/users/users.module.ts` with:

```ts
import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { User } from './user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User]), forwardRef(() => AuthModule)],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

And update `backend/src/auth/auth.module.ts` — wrap the `UsersModule` import in `forwardRef(() => ...)` to break the circular dep:

```ts
import { forwardRef, Module } from '@nestjs/common';
// ...
imports: [
  forwardRef(() => UsersModule),
  // ...rest unchanged
],
```

- [ ] **Step 3: Verify with a hand call**

Run: `cd backend && npx tsc --noEmit -p tsconfig.build.json`
Expected: no errors.

Start backend: `docker compose up -d mysql && cd backend && npm run start:dev` (or rely on existing dev container). Then in a separate terminal:

```bash
TOKEN=$(curl -s -X POST localhost:3000/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"u1@a.local","password":"pass1234pass","fullName":"U","role":"buyer"}' | jq -r .accessToken)
curl -s localhost:3000/me -H "Authorization: Bearer $TOKEN" | jq
curl -s -X PATCH localhost:3000/me -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"phone":"+1 555 0000","biography":"hi"}' | jq
```

Expected: first call returns user with `phone:null`; second returns user with updated values.

- [ ] **Step 4: Commit**

```bash
git add backend/src/users/users.controller.ts backend/src/users/users.module.ts backend/src/auth/auth.module.ts
git commit -m "feat(users): GET/PATCH /me endpoints"
```

---

### Task 6: `UserAddress` entity

**Files:**
- Create: `backend/src/addresses/address.entity.ts`

- [ ] **Step 1: Write the entity**

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'user_addresses' })
@Index('idx_addresses_user', ['userId'])
export class UserAddress {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'user_id', type: 'bigint', unsigned: true })
  userId!: string;

  @Column({ type: 'varchar', length: 64 })
  label!: string;

  @Column({ name: 'recipient_name', type: 'varchar', length: 255 })
  recipientName!: string;

  @Column({ type: 'varchar', length: 32 })
  phone!: string;

  @Column({ type: 'varchar', length: 255 })
  line1!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  line2!: string | null;

  @Column({ type: 'varchar', length: 128 })
  city!: string;

  @Column({ type: 'varchar', length: 128 })
  region!: string;

  @Column({ name: 'postal_code', type: 'varchar', length: 32 })
  postalCode!: string;

  @Column({ type: 'varchar', length: 128 })
  country!: string;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/addresses/address.entity.ts
git commit -m "feat(addresses): UserAddress entity"
```

---

### Task 7: Address DTOs

**Files:**
- Create: `backend/src/addresses/dto/create-address.dto.ts`
- Create: `backend/src/addresses/dto/update-address.dto.ts`

- [ ] **Step 1: Create**

`create-address.dto.ts`:

```ts
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateAddressDto {
  @IsString() @MinLength(1) @MaxLength(64) label!: string;
  @IsString() @MinLength(1) @MaxLength(255) recipientName!: string;
  @IsString() @MinLength(1) @MaxLength(32) phone!: string;
  @IsString() @MinLength(1) @MaxLength(255) line1!: string;
  @IsOptional() @IsString() @MaxLength(255) line2?: string | null;
  @IsString() @MinLength(1) @MaxLength(128) city!: string;
  @IsString() @MinLength(1) @MaxLength(128) region!: string;
  @IsString() @MinLength(1) @MaxLength(32) postalCode!: string;
  @IsString() @MinLength(1) @MaxLength(128) country!: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}
```

`update-address.dto.ts`:

```ts
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateAddressDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(64) label?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(255) recipientName?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(32) phone?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(255) line1?: string;
  @IsOptional() @IsString() @MaxLength(255) line2?: string | null;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(128) city?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(128) region?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(32) postalCode?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(128) country?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/addresses/dto
git commit -m "feat(addresses): create/update DTOs"
```

---

### Task 8: `AddressesService` with default invariant + spec

**Files:**
- Create: `backend/src/addresses/addresses.service.ts`
- Create: `backend/src/addresses/addresses.service.spec.ts`

- [ ] **Step 1: Write the failing spec**

```ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserAddress } from './address.entity';
import { AddressesService } from './addresses.service';

describe('AddressesService', () => {
  let service: AddressesService;
  const repo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((data: any) => data),
    save: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  };
  const manager = {
    update: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    create: jest.fn((_e: any, d: any) => d),
  };
  const ds = {
    transaction: jest.fn().mockImplementation(async (cb: any) => cb(manager)),
  } as unknown as DataSource;

  beforeEach(async () => {
    Object.values(repo).forEach((f) => (f as jest.Mock).mockReset());
    Object.values(manager).forEach((f) => (f as jest.Mock).mockReset());
    manager.create.mockImplementation((_e: any, d: any) => d);
    repo.create.mockImplementation((d: any) => d);

    const mod = await Test.createTestingModule({
      providers: [
        AddressesService,
        { provide: DataSource, useValue: ds },
        { provide: getRepositoryToken(UserAddress), useValue: repo },
      ],
    }).compile();
    service = mod.get(AddressesService);
  });

  it('list returns default first', async () => {
    repo.find.mockResolvedValue([
      { id: '1', userId: 'u', isDefault: false, createdAt: new Date(2) },
      { id: '2', userId: 'u', isDefault: true, createdAt: new Date(1) },
    ]);
    const out = await service.list('u');
    expect(out.items[0].id).toBe('2');
  });

  it('first address auto-becomes default', async () => {
    manager.count.mockResolvedValue(0);
    manager.save.mockResolvedValue({ id: 'new', userId: 'u', isDefault: true });
    const out = await service.create('u', { label: 'H', recipientName: 'r', phone: 'p', line1: 'a', city: 'c', region: 'r', postalCode: 'p', country: 'co' } as any);
    expect(out.address.isDefault).toBe(true);
  });

  it('setting a new default unsets others atomically', async () => {
    manager.count.mockResolvedValue(1);
    manager.save.mockResolvedValue({ id: 'new', userId: 'u', isDefault: true });
    await service.create('u', { label: 'H', recipientName: 'r', phone: 'p', line1: 'a', city: 'c', region: 'r', postalCode: 'p', country: 'co', isDefault: true } as any);
    expect(manager.update).toHaveBeenCalledWith(UserAddress, { userId: 'u' }, { isDefault: false });
  });

  it('update throws Forbidden for other user', async () => {
    manager.findOne.mockResolvedValue({ id: '1', userId: 'other' });
    await expect(service.update('u', '1', { label: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('delete promotes a remaining address if default was removed', async () => {
    manager.findOne
      .mockResolvedValueOnce({ id: '1', userId: 'u', isDefault: true }) // target
      .mockResolvedValueOnce({ id: '2', userId: 'u', isDefault: false }); // promote candidate
    manager.delete.mockResolvedValue({ affected: 1 });
    await service.remove('u', '1');
    expect(manager.update).toHaveBeenCalledWith(UserAddress, { id: '2' }, { isDefault: true });
  });

  it('delete throws NotFound when missing', async () => {
    manager.findOne.mockResolvedValueOnce(null);
    await expect(service.remove('u', '999')).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest addresses.service.spec`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

```ts
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { UserAddress } from './address.entity';

type AddressView = {
  id: string;
  label: string;
  recipientName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
  createdAt: Date;
};

function toView(a: UserAddress): AddressView {
  return {
    id: String(a.id),
    label: a.label,
    recipientName: a.recipientName,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2,
    city: a.city,
    region: a.region,
    postalCode: a.postalCode,
    country: a.country,
    isDefault: Boolean(a.isDefault),
    createdAt: a.createdAt,
  };
}

@Injectable()
export class AddressesService {
  constructor(
    private readonly ds: DataSource,
    @InjectRepository(UserAddress)
    private readonly repo: Repository<UserAddress>,
  ) {}

  async list(userId: string) {
    const rows = await this.repo.find({
      where: { userId },
      order: { isDefault: 'DESC', createdAt: 'DESC' },
    });
    return { items: rows.map(toView) };
  }

  async create(userId: string, dto: Partial<UserAddress> & { isDefault?: boolean }) {
    return this.ds.transaction(async (m) => {
      const existing = await m.count(UserAddress, { where: { userId } });
      const makeDefault = existing === 0 ? true : Boolean(dto.isDefault);
      if (makeDefault) {
        await m.update(UserAddress, { userId }, { isDefault: false });
      }
      const entity = m.create(UserAddress, {
        userId,
        label: dto.label!,
        recipientName: dto.recipientName!,
        phone: dto.phone!,
        line1: dto.line1!,
        line2: dto.line2 ?? null,
        city: dto.city!,
        region: dto.region!,
        postalCode: dto.postalCode!,
        country: dto.country!,
        isDefault: makeDefault,
      });
      const saved = await m.save(entity);
      return { address: toView(saved as UserAddress) };
    });
  }

  async update(userId: string, id: string, dto: Partial<UserAddress>) {
    return this.ds.transaction(async (m) => {
      const current = await m.findOne(UserAddress, { where: { id } });
      if (!current) throw new NotFoundException('Address not found');
      if (current.userId !== userId) throw new ForbiddenException('Not your address');
      if (dto.isDefault === true && !current.isDefault) {
        await m.update(UserAddress, { userId }, { isDefault: false });
      }
      Object.assign(current, {
        label: dto.label ?? current.label,
        recipientName: dto.recipientName ?? current.recipientName,
        phone: dto.phone ?? current.phone,
        line1: dto.line1 ?? current.line1,
        line2: dto.line2 === undefined ? current.line2 : dto.line2,
        city: dto.city ?? current.city,
        region: dto.region ?? current.region,
        postalCode: dto.postalCode ?? current.postalCode,
        country: dto.country ?? current.country,
        isDefault: dto.isDefault === undefined ? current.isDefault : dto.isDefault,
      });
      const saved = await m.save(current);
      return { address: toView(saved) };
    });
  }

  async remove(userId: string, id: string) {
    return this.ds.transaction(async (m) => {
      const target = await m.findOne(UserAddress, { where: { id } });
      if (!target) throw new NotFoundException('Address not found');
      if (target.userId !== userId) throw new ForbiddenException('Not your address');
      const wasDefault = target.isDefault;
      await m.delete(UserAddress, { id });
      if (wasDefault) {
        const next = await m.findOne(UserAddress, {
          where: { userId },
          order: { createdAt: 'DESC' },
        });
        if (next) await m.update(UserAddress, { id: next.id }, { isDefault: true });
      }
      return { ok: true };
    });
  }

  async findOneOwned(userId: string, id: string): Promise<UserAddress> {
    const a = await this.repo.findOne({ where: { id } });
    if (!a) throw new NotFoundException('Address not found');
    if (a.userId !== userId) throw new ForbiddenException('Not your address');
    return a;
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd backend && npx jest addresses.service.spec`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/addresses/addresses.service.ts backend/src/addresses/addresses.service.spec.ts
git commit -m "feat(addresses): service with default-invariant + tests"
```

---

### Task 9: `AddressesController` + module + register in app

**Files:**
- Create: `backend/src/addresses/addresses.controller.ts`
- Create: `backend/src/addresses/addresses.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Write the controller**

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AddressesService } from './addresses.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@Controller('me/addresses')
@UseGuards(JwtAuthGuard)
export class AddressesController {
  constructor(private readonly svc: AddressesService) {}

  @Get()
  list(@Req() req: Request & { user: { id: string } }) {
    return this.svc.list(req.user.id);
  }

  @Post()
  @HttpCode(201)
  create(
    @Req() req: Request & { user: { id: string } },
    @Body() dto: CreateAddressDto,
  ) {
    return this.svc.create(req.user.id, dto);
  }

  @Patch(':id')
  update(
    @Req() req: Request & { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.svc.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Req() req: Request & { user: { id: string } },
    @Param('id') id: string,
  ) {
    await this.svc.remove(req.user.id, id);
  }
}
```

- [ ] **Step 2: Write the module**

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserAddress } from './address.entity';
import { AddressesController } from './addresses.controller';
import { AddressesService } from './addresses.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserAddress])],
  controllers: [AddressesController],
  providers: [AddressesService],
  exports: [AddressesService],
})
export class AddressesModule {}
```

- [ ] **Step 3: Register in `app.module.ts`**

In `backend/src/app.module.ts` add imports near other entity imports:

```ts
import { UserAddress } from './addresses/address.entity';
import { AddressesModule } from './addresses/addresses.module';
```

Add `UserAddress` to the `entities` array, and append `AddressesModule` to the module imports list.

- [ ] **Step 4: Smoke test**

Restart backend, then:

```bash
TOKEN=$(curl -s -X POST localhost:3000/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"addr@a.local","password":"pass1234pass","fullName":"A","role":"buyer"}' | jq -r .accessToken)
curl -s -X POST localhost:3000/me/addresses -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"label":"Home","recipientName":"A","phone":"+1","line1":"1 St","city":"X","region":"Y","postalCode":"00000","country":"US"}' | jq
curl -s localhost:3000/me/addresses -H "Authorization: Bearer $TOKEN" | jq
```

Expected: first call returns the new address with `isDefault: true`; second lists 1 address.

- [ ] **Step 5: Commit**

```bash
git add backend/src/addresses backend/src/app.module.ts
git commit -m "feat(addresses): controller + module wired into app"
```

---

## Phase B — Backend: orders

### Task 10: Extend `Order` entity (snapshots + enum rename + timestamps)

**Files:**
- Modify: `backend/src/orders/order.entity.ts`

- [ ] **Step 1: Rewrite the entity**

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OrderItem } from './order-item.entity';

export type OrderStatus = 'Paid' | 'Shipped' | 'Delivered' | 'Cancelled';
export type ShippingMethod = 'Standard' | 'Express';
export type PaymentMethod = 'card' | 'ewallet' | 'bank';

@Entity({ name: 'orders' })
export class Order {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Index('idx_orders_buyer')
  @Column({ name: 'buyer_id', type: 'bigint', unsigned: true })
  buyerId!: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  subtotal!: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: '0.00' })
  shipping!: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: '0.00' })
  tax!: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  total!: string;

  @Column({
    type: 'enum',
    enum: ['Paid', 'Shipped', 'Delivered', 'Cancelled'],
    default: 'Paid',
  })
  status!: OrderStatus;

  @Column({
    name: 'shipping_method',
    type: 'enum',
    enum: ['Standard', 'Express'],
    default: 'Standard',
  })
  shippingMethod!: ShippingMethod;

  @Column({ name: 'shipping_recipient', type: 'varchar', length: 255, default: '' })
  shippingRecipient!: string;

  @Column({ name: 'shipping_phone', type: 'varchar', length: 32, default: '' })
  shippingPhone!: string;

  @Column({ name: 'shipping_line1', type: 'varchar', length: 255, default: '' })
  shippingLine1!: string;

  @Column({ name: 'shipping_line2', type: 'varchar', length: 255, nullable: true })
  shippingLine2!: string | null;

  @Column({ name: 'shipping_city', type: 'varchar', length: 128, default: '' })
  shippingCity!: string;

  @Column({ name: 'shipping_region', type: 'varchar', length: 128, default: '' })
  shippingRegion!: string;

  @Column({ name: 'shipping_postal', type: 'varchar', length: 32, default: '' })
  shippingPostal!: string;

  @Column({ name: 'shipping_country', type: 'varchar', length: 128, default: '' })
  shippingCountry!: string;

  @Column({
    name: 'payment_method',
    type: 'enum',
    enum: ['card', 'ewallet', 'bank'],
    default: 'card',
  })
  paymentMethod!: PaymentMethod;

  @Column({ name: 'payment_last4', type: 'varchar', length: 4, nullable: true })
  paymentLast4!: string | null;

  @Column({ name: 'payment_txn_id', type: 'varchar', length: 64, default: '' })
  paymentTxnId!: string;

  @Column({ name: 'paid_at', type: 'timestamp', nullable: true })
  paidAt!: Date | null;

  @Column({ name: 'shipped_at', type: 'timestamp', nullable: true })
  shippedAt!: Date | null;

  @Column({ name: 'delivered_at', type: 'timestamp', nullable: true })
  deliveredAt!: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamp', nullable: true })
  cancelledAt!: Date | null;

  @OneToMany(() => OrderItem, (i) => i.order, { cascade: true })
  items?: OrderItem[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}
```

- [ ] **Step 2: Verify compile**

Run: `cd backend && npx tsc --noEmit -p tsconfig.build.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/orders/order.entity.ts
git commit -m "feat(orders): snapshot columns, timestamps, status enum -> Paid"
```

---

### Task 11: Status-enum rename bootstrap

**Files:**
- Create: `backend/src/common/bootstrap/order-status-rename.ts`
- Modify: `backend/src/main.ts`

- [ ] **Step 1: Write the bootstrap**

```ts
import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

export async function renameProcessingStatus(ds: DataSource): Promise<void> {
  const log = new Logger('OrderStatusRename');
  try {
    const res = await ds.query("UPDATE orders SET status = 'Paid' WHERE status = 'Processing'");
    const affected = (res as { affectedRows?: number }).affectedRows ?? 0;
    if (affected > 0) log.log(`Renamed ${affected} order(s) Processing -> Paid`);
  } catch (err) {
    log.warn(`Skipping rename: ${(err as Error).message}`);
  }
}
```

- [ ] **Step 2: Wire into main**

Edit `backend/src/main.ts` so that after `await app.init()` (or before `await app.listen(...)`), it runs the bootstrap. Current file:

```ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';
import { renameProcessingStatus } from './common/bootstrap/order-status-rename';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  const origin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';
  app.enableCors({ origin, credentials: true });
  await renameProcessingStatus(app.get(DataSource));
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}
bootstrap();
```

(If the existing `main.ts` differs, preserve all prior behavior and only add the import + the `await renameProcessingStatus(...)` line before `app.listen`.)

- [ ] **Step 3: Commit**

```bash
git add backend/src/common/bootstrap/order-status-rename.ts backend/src/main.ts
git commit -m "feat(orders): idempotent Processing->Paid status rename on boot"
```

---

### Task 12: Update DTOs (`CheckoutDto`, `UpdateOrderStatusDto`)

**Files:**
- Modify: `backend/src/orders/dto/checkout.dto.ts`
- Modify: `backend/src/orders/dto/update-order-status.dto.ts`

- [ ] **Step 1: Rewrite `checkout.dto.ts`**

```ts
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

export class CheckoutPaymentDto {
  @IsEnum(['card', 'ewallet', 'bank'])
  method!: 'card' | 'ewallet' | 'bank';

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}$/)
  cardLast4?: string;
}

export class CheckoutDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @Length(36, 36, { each: true })
  productIds!: string[];

  @IsString()
  @IsInt({ message: 'addressId must be a numeric id' })
  @Type(() => String)
  // Actually a bigint id from MySQL; we keep validating as string of digits:
  @Matches(/^\d+$/)
  addressId!: string;

  @IsEnum(['Standard', 'Express'])
  shippingMethod!: 'Standard' | 'Express';

  @IsObject()
  @ValidateNested()
  @Type(() => CheckoutPaymentDto)
  payment!: CheckoutPaymentDto;
}
```

Note: drop the `IsInt` annotation if it conflicts with `IsString` — keep only `IsString` + `Matches(/^\d+$/)`. Final shape:

```ts
@IsString()
@Matches(/^\d+$/)
addressId!: string;
```

- [ ] **Step 2: Rewrite `update-order-status.dto.ts`**

```ts
import { IsEnum } from 'class-validator';

export class UpdateOrderStatusDto {
  @IsEnum(['Paid', 'Shipped', 'Delivered', 'Cancelled'])
  status!: 'Paid' | 'Shipped' | 'Delivered' | 'Cancelled';
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/orders/dto
git commit -m "feat(orders): DTOs for new checkout + Paid status"
```

---

### Task 13: Rewrite `OrdersService.checkout`

**Files:**
- Modify: `backend/src/orders/orders.service.ts`
- Modify: `backend/src/orders/orders.module.ts`

- [ ] **Step 1: Register `UserAddress` repository in the module**

In `backend/src/orders/orders.module.ts`, add `UserAddress` to the `TypeOrmModule.forFeature([...])` array and import:

```ts
import { UserAddress } from '../addresses/address.entity';
// ...
imports: [
  TypeOrmModule.forFeature([Order, OrderItem, CartItem, Product, UserAddress]),
  StoresModule,
],
```

- [ ] **Step 2: Rewrite `checkout` in `orders.service.ts`**

Add to imports (top of file):

```ts
import { randomUUID } from 'node:crypto';
import { UserAddress } from '../addresses/address.entity';
```

Replace the `checkout` method body so the whole method becomes:

```ts
async checkout(buyerId: string, dto: CheckoutDto): Promise<{ orderId: string; total: number; status: 'Paid' }> {
  return this.dataSource.transaction(async (manager) => {
    // 1. cart rows
    const cartRows = await manager.find(CartItem, {
      where: { userId: buyerId, productId: In(dto.productIds) },
    });
    if (cartRows.length === 0) throw new BadRequestException('No matching cart items');

    // 2. products
    const productIds = cartRows.map((r) => r.productId);
    const products = await manager.find(Product, { where: { id: In(productIds) } });
    const byId = new Map(products.map((p) => [p.id, p]));

    // 3. shipping address — owned by buyer
    const addr = await manager.findOne(UserAddress, { where: { id: dto.addressId } });
    if (!addr) throw new NotFoundException('Address not found');
    if (addr.userId !== buyerId) throw new ForbiddenException('Not your address');

    // 4. decrement stock + build draft items
    let subtotal = 0;
    const drafts: Array<{
      productId: string; storeId: string; nameSnapshot: string;
      priceSnapshot: string; quantity: number;
    }> = [];
    for (const row of cartRows) {
      const product = byId.get(row.productId);
      if (!product) throw new NotFoundException(`Product ${row.productId} missing`);
      const res = await manager.query(
        'UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?',
        [row.quantity, row.productId, row.quantity],
      );
      const affected = (res as { affectedRows?: number }).affectedRows ?? 0;
      if (affected !== 1) throw new ConflictException(`Insufficient stock for ${product.name}`);
      const line = Math.round(Number(product.price) * row.quantity * 100) / 100;
      subtotal += line;
      drafts.push({
        productId: row.productId,
        storeId: product.storeId,
        nameSnapshot: product.name,
        priceSnapshot: product.price,
        quantity: row.quantity,
      });
    }

    // 5. totals
    const subtotalRounded = Math.round(subtotal * 100) / 100;
    const shippingCost = dto.shippingMethod === 'Express' ? 15 : 5;
    const tax = Math.round(subtotalRounded * 0.08 * 100) / 100;
    const total = Math.round((subtotalRounded + shippingCost + tax) * 100) / 100;

    // 6. order row
    const now = new Date();
    const orderEntity = manager.create(Order, {
      buyerId,
      subtotal: subtotalRounded.toFixed(2),
      shipping: shippingCost.toFixed(2),
      tax: tax.toFixed(2),
      total: total.toFixed(2),
      status: 'Paid',
      shippingMethod: dto.shippingMethod,
      shippingRecipient: addr.recipientName,
      shippingPhone: addr.phone,
      shippingLine1: addr.line1,
      shippingLine2: addr.line2,
      shippingCity: addr.city,
      shippingRegion: addr.region,
      shippingPostal: addr.postalCode,
      shippingCountry: addr.country,
      paymentMethod: dto.payment.method,
      paymentLast4: dto.payment.method === 'card' ? dto.payment.cardLast4 ?? null : null,
      paymentTxnId: `MOCK-${randomUUID()}`,
      paidAt: now,
    });
    const savedOrder = await manager.save(orderEntity);

    // 7. items
    const itemEntities = drafts.map((d) =>
      manager.create(OrderItem, {
        orderId: savedOrder.id,
        productId: d.productId,
        storeId: d.storeId,
        nameSnapshot: d.nameSnapshot,
        priceSnapshot: d.priceSnapshot,
        quantity: d.quantity,
      }),
    );
    await manager.save(itemEntities);

    // 8. clear cart rows
    await manager.delete(CartItem, { userId: buyerId, productId: In(productIds) });

    return { orderId: String(savedOrder.id), total, status: 'Paid' };
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/orders/orders.service.ts backend/src/orders/orders.module.ts
git commit -m "feat(orders): checkout snapshots address + shipping method + payment"
```

---

### Task 14: Update `listForBuyer` + `findOneForBuyer` to return snapshot fields

**Files:**
- Modify: `backend/src/orders/orders.service.ts`

- [ ] **Step 1: Rewrite the two methods**

Inside `orders.service.ts` replace `listForBuyer` and `findOneForBuyer` with:

```ts
async listForBuyer(buyerId: string, status?: string) {
  const where: any = { buyerId };
  if (status && ['Paid', 'Shipped', 'Delivered', 'Cancelled'].includes(status)) {
    where.status = status;
  }
  const orders = await this.orders.find({
    where,
    order: { createdAt: 'DESC' },
    relations: { items: true },
  });
  return {
    items: orders.map((o) => this.toBuyerListView(o)),
  };
}

async findOneForBuyer(buyerId: string, id: string) {
  const order = await this.orders.findOne({
    where: { id },
    relations: { items: true },
  });
  if (!order) throw new NotFoundException('Order not found');
  if (order.buyerId !== buyerId) throw new ForbiddenException('Not your order');
  return this.toBuyerDetailView(order);
}

private toBuyerListView(o: Order) {
  return {
    id: String(o.id),
    subtotal: Number(o.subtotal),
    shipping: Number(o.shipping),
    tax: Number(o.tax),
    total: Number(o.total),
    status: o.status,
    shippingMethod: o.shippingMethod,
    createdAt: o.createdAt,
    paidAt: o.paidAt,
    shippedAt: o.shippedAt,
    deliveredAt: o.deliveredAt,
    cancelledAt: o.cancelledAt,
    items: (o.items ?? []).map((it) => ({
      id: String(it.id),
      productId: it.productId,
      name: it.nameSnapshot,
      price: Number(it.priceSnapshot),
      quantity: it.quantity,
    })),
  };
}

private toBuyerDetailView(o: Order) {
  return {
    ...this.toBuyerListView(o),
    shipping_address: {
      recipientName: o.shippingRecipient,
      phone: o.shippingPhone,
      line1: o.shippingLine1,
      line2: o.shippingLine2,
      city: o.shippingCity,
      region: o.shippingRegion,
      postalCode: o.shippingPostal,
      country: o.shippingCountry,
    },
    payment: {
      method: o.paymentMethod,
      last4: o.paymentLast4,
      txnId: o.paymentTxnId,
    },
  };
}
```

- [ ] **Step 2: Compile + run orders unit tests**

Run: `cd backend && npx tsc --noEmit -p tsconfig.build.json && npx jest orders.service.spec`
Expected: compile clean; the existing spec is likely broken now — that's fine, the next task rewrites it.

- [ ] **Step 3: Commit**

```bash
git add backend/src/orders/orders.service.ts
git commit -m "feat(orders): return snapshot fields in buyer list + detail"
```

---

### Task 15: Add `OrdersService.cancel` + spec coverage

**Files:**
- Modify: `backend/src/orders/orders.service.ts`
- Modify: `backend/src/orders/orders.service.spec.ts`

- [ ] **Step 1: Append the cancel test** at the bottom of `orders.service.spec.ts`:

```ts
describe('OrdersService.cancel', () => {
  let service: OrdersService;
  const manager = {
    findOne: jest.fn(),
    save: jest.fn(),
    query: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn().mockImplementation(async (cb: any) => cb(manager)),
  } as unknown as DataSource;
  const ordersRepo = { findOne: jest.fn(), find: jest.fn(), save: jest.fn() };

  beforeEach(async () => {
    Object.values(manager).forEach((f) => (f as jest.Mock).mockReset());
    Object.values(ordersRepo).forEach((f) => (f as jest.Mock).mockReset());
    const mod = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(Order), useValue: ordersRepo },
        { provide: getRepositoryToken(OrderItem), useValue: {} },
        { provide: getRepositoryToken(CartItem), useValue: {} },
        { provide: getRepositoryToken(Product), useValue: {} },
      ],
    }).compile();
    service = mod.get(OrdersService);
  });

  it('cancels a Paid order, restores stock, sets cancelledAt', async () => {
    manager.findOne.mockResolvedValue({
      id: '1',
      buyerId: 'u',
      status: 'Paid',
      items: [
        { productId: 'p1', quantity: 2 },
        { productId: 'p2', quantity: 1 },
      ],
    });
    manager.query.mockResolvedValue({ affectedRows: 1 });
    manager.save.mockImplementation((o) => o);

    const out = await service.cancelForBuyer('u', '1');
    expect(out.status).toBe('Cancelled');
    expect(manager.query).toHaveBeenCalledWith(
      'UPDATE products SET stock = stock + ? WHERE id = ?',
      [2, 'p1'],
    );
    expect(manager.query).toHaveBeenCalledWith(
      'UPDATE products SET stock = stock + ? WHERE id = ?',
      [1, 'p2'],
    );
  });

  it('refuses to cancel a Shipped order (409)', async () => {
    manager.findOne.mockResolvedValue({
      id: '1', buyerId: 'u', status: 'Shipped', items: [],
    });
    await expect(service.cancelForBuyer('u', '1')).rejects.toMatchObject({ status: 409 });
  });

  it('refuses to cancel another user\'s order (403)', async () => {
    manager.findOne.mockResolvedValue({
      id: '1', buyerId: 'other', status: 'Paid', items: [],
    });
    await expect(service.cancelForBuyer('u', '1')).rejects.toMatchObject({ status: 403 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest orders.service.spec`
Expected: FAIL — `cancelForBuyer` undefined.

- [ ] **Step 3: Implement** in `orders.service.ts` (add `ConflictException` to imports if missing, then add the method):

```ts
async cancelForBuyer(buyerId: string, id: string): Promise<{ id: string; status: 'Cancelled' }> {
  return this.dataSource.transaction(async (manager) => {
    const order = await manager.findOne(Order, {
      where: { id },
      relations: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== buyerId) throw new ForbiddenException('Not your order');
    if (order.status !== 'Paid') throw new ConflictException(`Cannot cancel an order with status ${order.status}`);
    for (const it of order.items ?? []) {
      await manager.query(
        'UPDATE products SET stock = stock + ? WHERE id = ?',
        [it.quantity, it.productId],
      );
    }
    order.status = 'Cancelled';
    order.cancelledAt = new Date();
    await manager.save(order);
    return { id: String(order.id), status: 'Cancelled' };
  });
}
```

- [ ] **Step 4: Re-run tests**

Run: `cd backend && npx jest orders.service.spec`
Expected: PASS, including the new cancel block.

- [ ] **Step 5: Commit**

```bash
git add backend/src/orders/orders.service.ts backend/src/orders/orders.service.spec.ts
git commit -m "feat(orders): buyer cancel restores stock + tests"
```

---

### Task 16: Update seller `updateStatusForStore` (timestamps + cancel-restores-stock)

**Files:**
- Modify: `backend/src/orders/orders.service.ts`

- [ ] **Step 1: Replace `updateStatusForStore`** with:

```ts
async updateStatusForStore(
  storeId: string,
  orderId: string,
  status: 'Paid' | 'Shipped' | 'Delivered' | 'Cancelled',
) {
  return this.dataSource.transaction(async (manager) => {
    const order = await manager.findOne(Order, {
      where: { id: orderId },
      relations: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    const hasItemFromStore = order.items?.some((i) => i.storeId === storeId);
    if (!hasItemFromStore) throw new ForbiddenException('Not your order');

    if (status === 'Cancelled' && order.status !== 'Cancelled') {
      for (const it of order.items ?? []) {
        await manager.query(
          'UPDATE products SET stock = stock + ? WHERE id = ?',
          [it.quantity, it.productId],
        );
      }
    }
    const now = new Date();
    order.status = status;
    if (status === 'Shipped' && !order.shippedAt) order.shippedAt = now;
    if (status === 'Delivered' && !order.deliveredAt) order.deliveredAt = now;
    if (status === 'Cancelled' && !order.cancelledAt) order.cancelledAt = now;
    await manager.save(order);
    return { order: { id: String(order.id), status: order.status } };
  });
}
```

- [ ] **Step 2: Compile + run tests**

Run: `cd backend && npx tsc --noEmit -p tsconfig.build.json && npx jest orders.service.spec`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/src/orders/orders.service.ts
git commit -m "feat(orders): seller status update sets timestamps; cancel restores stock"
```

---

### Task 17: Add cancel route to `OrdersController`

**Files:**
- Modify: `backend/src/orders/orders.controller.ts`

- [ ] **Step 1: Add the PATCH route**

Final body of `orders.controller.ts`:

```ts
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CheckoutDto } from './dto/checkout.dto';
import { OrdersService } from './orders.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post('orders/checkout')
  @HttpCode(201)
  checkout(
    @Req() req: Request & { user: { id: string } },
    @Body() dto: CheckoutDto,
  ) {
    return this.orders.checkout(req.user.id, dto);
  }

  @Get('me/orders')
  list(
    @Req() req: Request & { user: { id: string } },
    @Query('status') status?: string,
  ) {
    return this.orders.listForBuyer(req.user.id, status);
  }

  @Get('me/orders/:id')
  findOne(
    @Req() req: Request & { user: { id: string } },
    @Param('id') id: string,
  ) {
    return this.orders.findOneForBuyer(req.user.id, id);
  }

  @Patch('me/orders/:id/cancel')
  cancel(
    @Req() req: Request & { user: { id: string } },
    @Param('id') id: string,
  ) {
    return this.orders.cancelForBuyer(req.user.id, id);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/orders/orders.controller.ts
git commit -m "feat(orders): PATCH /me/orders/:id/cancel route"
```

---

### Task 18: Update e2e tests

**Files:**
- Modify: `backend/test/setup-e2e.ts`
- Modify: `backend/test/orders.e2e-spec.ts`
- Modify: `backend/test/store-orders.e2e-spec.ts`
- Create: `backend/test/addresses.e2e-spec.ts`

- [ ] **Step 1: Add `user_addresses` truncate**

In `backend/test/setup-e2e.ts`, inside `resetDatabase`, add a line before `TRUNCATE TABLE users`:

```ts
await dataSource.query('TRUNCATE TABLE user_addresses');
```

- [ ] **Step 2: Update orders e2e payload + add cancel test**

Replace the checkout payload usage in `orders.e2e-spec.ts`. Add a helper near the top of the file:

```ts
async function makeAddress(server: any, token: string): Promise<string> {
  const res = await request(server)
    .post('/me/addresses')
    .set('Authorization', `Bearer ${token}`)
    .send({
      label: 'Home', recipientName: 'B', phone: '+1',
      line1: '1 St', city: 'SF', region: 'CA', postalCode: '94000', country: 'US',
    });
  return res.body.address.id;
}

const checkoutBody = (addressId: string, productIds: string[]) => ({
  productIds,
  addressId,
  shippingMethod: 'Standard',
  payment: { method: 'card', cardLast4: '4242' },
});
```

Then in each test that calls `/orders/checkout`, change the `.send({ productIds: [...] })` to `.send(checkoutBody(addrId, [productId]))`, fetching `addrId` first via `makeAddress`. The "empty productIds" test should send `checkoutBody(addrId, [])`. The "oversell" test stays the same except for the body.

Append a new test:

```ts
it('cancel restores stock and flips status', async () => {
  const token = await registerBuyer(ctx.app.getHttpServer(), 'cancel@a.local');
  const addrId = await makeAddress(ctx.app.getHttpServer(), token);
  await request(ctx.app.getHttpServer())
    .post('/me/cart')
    .set('Authorization', `Bearer ${token}`)
    .send({ productId, quantity: 2 });
  const co = await request(ctx.app.getHttpServer())
    .post('/orders/checkout')
    .set('Authorization', `Bearer ${token}`)
    .send(checkoutBody(addrId, [productId]));
  const orderId = co.body.orderId;
  const cancel = await request(ctx.app.getHttpServer())
    .patch(`/me/orders/${orderId}/cancel`)
    .set('Authorization', `Bearer ${token}`);
  expect(cancel.status).toBe(200);
  const p = await ctx.dataSource.getRepository(Product).findOne({ where: { id: productId } });
  expect(p!.stock).toBe(5); // back to seed
});
```

- [ ] **Step 3: Update `store-orders.e2e-spec.ts`** — any reference to `'Processing'` in the PATCH body or expectations becomes `'Paid'`. Any expectations on `o.status` after checkout become `'Paid'`. Use `grep` to find them:

Run: `grep -n Processing backend/test/store-orders.e2e-spec.ts` — replace each hit with `Paid`. Also wherever the file builds a checkout payload (probably similar to orders.e2e), wrap with the helper above (duplicate the helper inline; both files can have their own).

- [ ] **Step 4: Write `addresses.e2e-spec.ts`**

```ts
import request from 'supertest';
import { createTestApp, resetDatabase, TestContext } from './setup-e2e';

async function registerBuyer(server: any, email: string): Promise<string> {
  const res = await request(server)
    .post('/auth/register')
    .send({ email, password: 'pass1234pass', fullName: 'B', role: 'buyer' });
  return res.body.accessToken;
}

const body = {
  label: 'Home', recipientName: 'B', phone: '+1',
  line1: '1 St', city: 'SF', region: 'CA', postalCode: '94000', country: 'US',
};

describe('Addresses (e2e)', () => {
  let ctx: TestContext;
  beforeAll(async () => { ctx = await createTestApp(); });
  afterAll(async () => { await ctx.app.close(); });
  beforeEach(async () => { await resetDatabase(ctx.dataSource); });

  it('first address becomes default', async () => {
    const token = await registerBuyer(ctx.app.getHttpServer(), 'a@a.local');
    const res = await request(ctx.app.getHttpServer())
      .post('/me/addresses')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
    expect(res.status).toBe(201);
    expect(res.body.address.isDefault).toBe(true);
  });

  it('setting a new default unsets others', async () => {
    const token = await registerBuyer(ctx.app.getHttpServer(), 'b@a.local');
    const a = await request(ctx.app.getHttpServer())
      .post('/me/addresses').set('Authorization', `Bearer ${token}`).send(body);
    const b = await request(ctx.app.getHttpServer())
      .post('/me/addresses').set('Authorization', `Bearer ${token}`).send({ ...body, label: 'Office', isDefault: true });
    const list = await request(ctx.app.getHttpServer())
      .get('/me/addresses').set('Authorization', `Bearer ${token}`);
    const defaults = list.body.items.filter((x: any) => x.isDefault).map((x: any) => x.id);
    expect(defaults).toEqual([b.body.address.id]);
    expect(list.body.items.find((x: any) => x.id === a.body.address.id).isDefault).toBe(false);
  });

  it('other user cannot update', async () => {
    const t1 = await registerBuyer(ctx.app.getHttpServer(), 'c@a.local');
    const t2 = await registerBuyer(ctx.app.getHttpServer(), 'd@a.local');
    const a = await request(ctx.app.getHttpServer())
      .post('/me/addresses').set('Authorization', `Bearer ${t1}`).send(body);
    const res = await request(ctx.app.getHttpServer())
      .patch(`/me/addresses/${a.body.address.id}`)
      .set('Authorization', `Bearer ${t2}`)
      .send({ label: 'x' });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 5: Run all e2e**

Make sure MySQL is up:

```bash
docker compose up -d mysql
cd backend && npm run test:e2e
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add backend/test
git commit -m "test(e2e): addresses crud + checkout payload + cancel flow"
```

---

## Phase C — Frontend: services + router scaffolding

### Task 19: New service files

**Files:**
- Create: `frontend/src/services/addresses.js`
- Create: `frontend/src/services/profile.js`
- Modify: `frontend/src/services/orders.js`

- [ ] **Step 1: Write `services/addresses.js`**

```js
import { api } from './api.js';

export const listAddresses = () => api.get('/me/addresses');
export const createAddress = (data) => api.post('/me/addresses', data);
export const updateAddress = (id, data) => api.patch(`/me/addresses/${id}`, data);
export const deleteAddress = (id) => api.delete(`/me/addresses/${id}`);
```

- [ ] **Step 2: Write `services/profile.js`**

```js
import { api } from './api.js';

export const getMe = () => api.get('/me');
export const updateMe = (patch) => api.patch('/me', patch);
```

- [ ] **Step 3: Rewrite `services/orders.js`**

```js
import { api } from './api.js';

export const listOrders = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return api.get(`/me/orders${qs ? `?${qs}` : ''}`);
};

export const getOrder = (id) => api.get(`/me/orders/${id}`);

export const checkout = ({ productIds, addressId, shippingMethod, payment }) =>
  api.post('/orders/checkout', { productIds, addressId, shippingMethod, payment });

export const cancelOrder = (id) => api.patch(`/me/orders/${id}/cancel`);
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/services/addresses.js frontend/src/services/profile.js frontend/src/services/orders.js
git commit -m "feat(fe): addresses/profile services; orders checkout payload"
```

---

### Task 20: Register routes with stub pages

**Files:**
- Modify: `frontend/src/router.jsx`
- Create: `frontend/src/pages/CheckoutPage.jsx` (stub)
- Create: `frontend/src/pages/OrderManagementPage.jsx` (stub)
- Create: `frontend/src/pages/OrderDetailPage.jsx` (stub)
- Create: `frontend/src/pages/ProfilePage.jsx` (stub)
- Create: `frontend/src/pages/AddressesPage.jsx` (stub)

- [ ] **Step 1: Create five stub pages**

Each new page file gets the same shape:

```jsx
// frontend/src/pages/CheckoutPage.jsx
export default function CheckoutPage() {
  return <div className="container-max py-8">CheckoutPage</div>;
}
```

Repeat for `OrderManagementPage`, `OrderDetailPage`, `ProfilePage`, `AddressesPage` (just change the display string).

- [ ] **Step 2: Wire routes**

Update `frontend/src/router.jsx`, adding imports and route children inside the `UserLayout` block:

```jsx
import CheckoutPage from './pages/CheckoutPage.jsx';
import OrderManagementPage from './pages/OrderManagementPage.jsx';
import OrderDetailPage from './pages/OrderDetailPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import AddressesPage from './pages/AddressesPage.jsx';
// ...
children: [
  // ...existing routes
  { path: '/checkout', element: <CheckoutPage /> },
  { path: '/orders', element: <OrderManagementPage /> },
  { path: '/orders/:id', element: <OrderDetailPage /> },
  { path: '/account', element: <ProfilePage /> },
  { path: '/account/addresses', element: <AddressesPage /> },
],
```

- [ ] **Step 3: Smoke test**

Run: `cd frontend && npm run dev` (in another terminal). Visit `/checkout`, `/orders`, `/orders/123`, `/account`, `/account/addresses` — each should render the stub text.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages frontend/src/router.jsx
git commit -m "feat(fe): scaffold checkout/orders/account routes"
```

---

### Task 21: `AuthContext` re-fetches `/me` on save; account link in TopNavBar

**Files:**
- Modify: `frontend/src/context/AuthContext.jsx`
- Modify: `frontend/src/components/TopNavBar.jsx`

- [ ] **Step 1: Expose a `refreshUser`/setter from AuthContext**

In `frontend/src/context/AuthContext.jsx`, add `import { getMe } from '../services/profile.js';` at the top. Add an exported method to the context value:

```jsx
const setUser = useCallback((u) => setState((s) => ({ ...s, user: u })), []);
const refreshUser = useCallback(async () => {
  try {
    const u = await getMe();
    setUser(u);
    return u;
  } catch {
    return null;
  }
}, [setUser]);
```

And add them to the `value` object:

```jsx
const value = useMemo(
  () => ({
    token,
    user,
    isAuthenticated: Boolean(token && user),
    login,
    register,
    logout,
    setUser,
    refreshUser,
  }),
  [token, user, login, register, logout, setUser, refreshUser],
);
```

- [ ] **Step 2: Point TopNavBar's account icon to `/account`**

In `frontend/src/components/TopNavBar.jsx`, find the existing account / profile button (look for `account_circle`) and wrap or change its `onClick` / `to`:

```jsx
<Link to={isAuthenticated ? '/account' : '/auth'} className="…existing classes…">
  <Icon name="account_circle" size={24} />
</Link>
```

(Keep the existing dropdown menu logic if it exists; just ensure the icon now goes to `/account` for authenticated users. If the icon currently opens a menu with "Logout", leave the menu but add a "My Account → /account" item at the top.)

- [ ] **Step 3: Manual check**

Reload the dev server, click the account icon while logged in → should land on `/account`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/context/AuthContext.jsx frontend/src/components/TopNavBar.jsx
git commit -m "feat(fe): refresh /me on save; account icon -> /account"
```

---

## Phase D — Shared components

### Task 22: `AccountSideNav`

**Files:**
- Create: `frontend/src/components/AccountSideNav.jsx`

- [ ] **Step 1: Write the component**

```jsx
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Icon from './Icon.jsx';

const links = [
  { to: '/account', icon: 'account_circle', label: 'Profile', end: true },
  { to: '/orders', icon: 'list_alt', label: 'My Orders' },
  { to: '/account/addresses', icon: 'location_on', label: 'Addresses' },
];

export default function AccountSideNav() {
  const { user } = useAuth();
  return (
    <aside className="hidden md:flex flex-col gap-2 w-64 shrink-0 pr-4">
      <div className="mb-6 px-4">
        <h3 className="text-headline-md text-primary">Welcome back</h3>
        <p className="text-body-sm text-on-surface-variant">Manage your account</p>
      </div>
      <nav className="flex flex-col gap-1">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) =>
              `px-4 py-3 flex items-center gap-3 rounded-lg transition-colors ${
                isActive
                  ? 'bg-primary-container text-on-primary-container font-bold'
                  : 'text-on-surface-variant hover:bg-surface-container-high'
              }`
            }
          >
            <Icon name={l.icon} size={20} />
            <span className="text-label-md">{l.label}</span>
          </NavLink>
        ))}
        {user?.role === 'seller' && (
          <NavLink
            to="/store"
            className="mt-4 px-4 py-3 flex items-center gap-3 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors"
          >
            <Icon name="dashboard" size={20} />
            <span className="text-label-md">View Dashboard</span>
          </NavLink>
        )}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/AccountSideNav.jsx
git commit -m "feat(fe): AccountSideNav component"
```

---

### Task 23: `OrderStatusBadge`

**Files:**
- Create: `frontend/src/components/OrderStatusBadge.jsx`

- [ ] **Step 1: Write**

```jsx
import Icon from './Icon.jsx';

const STYLES = {
  Paid: { cls: 'bg-surface-container-highest text-primary', icon: 'payments' },
  Shipped: { cls: 'bg-surface-container-highest text-primary', icon: 'local_shipping' },
  Delivered: { cls: 'bg-emerald-100 text-emerald-800', icon: 'check_circle' },
  Cancelled: { cls: 'bg-red-50 text-red-700', icon: 'cancel' },
};

export default function OrderStatusBadge({ status }) {
  const s = STYLES[status] ?? STYLES.Paid;
  return (
    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-label-md ${s.cls}`}>
      <Icon name={s.icon} size={14} />
      {status}
    </span>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/OrderStatusBadge.jsx
git commit -m "feat(fe): OrderStatusBadge"
```

---

### Task 24: `OrderTimeline`

**Files:**
- Create: `frontend/src/components/OrderTimeline.jsx`

- [ ] **Step 1: Write**

```jsx
import Icon from './Icon.jsx';

function fmt(d) {
  if (!d) return null;
  const dt = new Date(d);
  return dt.toLocaleDateString(undefined, { month: 'short', day: '2-digit' });
}

const STEPS = [
  { key: 'created', label: 'Ordered', icon: 'check' },
  { key: 'paid', label: 'Paid', icon: 'payments' },
  { key: 'shipped', label: 'Shipped', icon: 'local_shipping' },
  { key: 'delivered', label: 'Delivered', icon: 'inventory_2' },
];

export default function OrderTimeline({ order }) {
  if (order.status === 'Cancelled') {
    return (
      <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-6">
        <p className="text-label-md uppercase tracking-wider mb-1">Cancelled</p>
        <p className="text-body-sm">
          This order was cancelled on {fmt(order.cancelledAt) ?? 'an unknown date'}.
          Stock has been restored.
        </p>
      </div>
    );
  }

  const dates = {
    created: order.createdAt,
    paid: order.paidAt,
    shipped: order.shippedAt,
    delivered: order.deliveredAt,
  };

  const lastIdx = (() => {
    let last = -1;
    STEPS.forEach((s, i) => {
      if (dates[s.key]) last = i;
    });
    return last;
  })();

  const progress = lastIdx <= 0 ? 0 : lastIdx / (STEPS.length - 1);

  return (
    <div className="relative">
      <div className="absolute top-5 left-5 right-5 h-1 bg-surface-container-highest">
        <div className="h-full bg-primary" style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="relative flex justify-between">
        {STEPS.map((s, i) => {
          const done = Boolean(dates[s.key]);
          return (
            <div key={s.key} className="flex flex-col items-center w-1/4">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${
                  done
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container-highest text-outline border-2 border-outline-variant'
                }`}
              >
                <Icon name={s.icon} size={20} />
              </div>
              <span className={`text-label-md ${i === lastIdx ? 'text-primary' : 'text-on-surface'}`}>
                {s.label}
              </span>
              <span className="text-body-sm text-on-surface-variant">
                {fmt(dates[s.key]) ?? 'Pending'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/OrderTimeline.jsx
git commit -m "feat(fe): OrderTimeline component"
```

---

### Task 25: `AddressForm`

**Files:**
- Create: `frontend/src/components/AddressForm.jsx`

- [ ] **Step 1: Write**

```jsx
import { useState } from 'react';

const empty = {
  label: '', recipientName: '', phone: '', line1: '', line2: '',
  city: '', region: '', postalCode: '', country: '', isDefault: false,
};

export default function AddressForm({ initial, onSubmit, onCancel, submitting }) {
  const [v, setV] = useState({ ...empty, ...(initial ?? {}) });
  const set = (k) => (e) => setV((prev) => ({ ...prev, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    onSubmit({ ...v, line2: v.line2 || null });
  };

  return (
    <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field label="Label (e.g. Home)">
        <input className="field" value={v.label} onChange={set('label')} required maxLength={64} />
      </Field>
      <Field label="Recipient name">
        <input className="field" value={v.recipientName} onChange={set('recipientName')} required maxLength={255} />
      </Field>
      <Field label="Phone">
        <input className="field" value={v.phone} onChange={set('phone')} required maxLength={32} />
      </Field>
      <Field label="Country">
        <input className="field" value={v.country} onChange={set('country')} required maxLength={128} />
      </Field>
      <Field label="Address line 1" wide>
        <input className="field" value={v.line1} onChange={set('line1')} required maxLength={255} />
      </Field>
      <Field label="Address line 2 (optional)" wide>
        <input className="field" value={v.line2} onChange={set('line2')} maxLength={255} />
      </Field>
      <Field label="City">
        <input className="field" value={v.city} onChange={set('city')} required maxLength={128} />
      </Field>
      <Field label="State / Region">
        <input className="field" value={v.region} onChange={set('region')} required maxLength={128} />
      </Field>
      <Field label="Postal code">
        <input className="field" value={v.postalCode} onChange={set('postalCode')} required maxLength={32} />
      </Field>
      <Field label="Default address">
        <label className="inline-flex items-center gap-2 mt-3">
          <input type="checkbox" checked={Boolean(v.isDefault)} onChange={(e) => setV((p) => ({ ...p, isDefault: e.target.checked }))} />
          <span className="text-body-sm">Set as default</span>
        </label>
      </Field>
      <div className="md:col-span-2 flex justify-end gap-3 mt-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-4 py-2 text-on-surface-variant">
            Cancel
          </button>
        )}
        <button type="submit" disabled={submitting} className="btn-primary px-6 py-2 disabled:opacity-50">
          {submitting ? 'Saving…' : 'Save address'}
        </button>
      </div>
    </form>
  );
}

function Field({ label, wide, children }) {
  return (
    <div className={`space-y-1 ${wide ? 'md:col-span-2' : ''}`}>
      <label className="text-label-md text-on-surface-variant block">{label}</label>
      {children}
    </div>
  );
}
```

Note: `.field` and `.btn-primary` classes already exist in `frontend/src/index.css` (used by CartPage / StoreOrderManagementPage). If `.field` is missing, add the rule:

```css
.field { @apply w-full bg-surface border border-outline rounded-lg px-4 py-2 text-on-surface focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none transition-all text-body-md; }
```

into `frontend/src/index.css` under the existing `@layer components` block.

- [ ] **Step 2: Verify in dev server**

Manually render the form in the AddressesPage stub temporarily; visit and confirm layout matches mock. (Will be wired up in Task 27.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/AddressForm.jsx frontend/src/index.css
git commit -m "feat(fe): AddressForm component"
```

---

## Phase E — Frontend pages

### Task 26: ProfilePage

**Files:**
- Modify: `frontend/src/pages/ProfilePage.jsx`

- [ ] **Step 1: Replace the stub** with the full page:

```jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AccountSideNav from '../components/AccountSideNav.jsx';
import Icon from '../components/Icon.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { listAddresses } from '../services/addresses.js';
import { listOrders } from '../services/orders.js';
import { updateMe } from '../services/profile.js';

const DEFAULT_AVATAR =
  'https://ui-avatars.com/api/?background=1e40af&color=fff&size=256&name=Account';

export default function ProfilePage() {
  const { user, refreshUser, setUser } = useAuth();
  const toast = useToast();
  const [orderCount, setOrderCount] = useState(null);
  const [addressCount, setAddressCount] = useState(null);
  const [form, setForm] = useState(() => ({
    fullName: user?.fullName ?? '',
    phone: user?.phone ?? '',
    avatarUrl: user?.avatarUrl ?? '',
    biography: user?.biography ?? '',
    preferredLanguage: user?.preferredLanguage ?? 'en',
  }));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    refreshUser();
    listOrders().then((r) => setOrderCount(r.items.length)).catch(() => null);
    listAddresses().then((r) => setAddressCount(r.items.length)).catch(() => null);
  }, [refreshUser]);

  useEffect(() => {
    if (!user) return;
    setForm({
      fullName: user.fullName ?? '',
      phone: user.phone ?? '',
      avatarUrl: user.avatarUrl ?? '',
      biography: user.biography ?? '',
      preferredLanguage: user.preferredLanguage ?? 'en',
    });
  }, [user]);

  if (!user) return <div className="container-max py-8">Loading…</div>;

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const next = await updateMe({
        fullName: form.fullName,
        phone: form.phone || null,
        avatarUrl: form.avatarUrl || null,
        biography: form.biography || null,
      });
      setUser(next);
      toast.success('Profile updated');
    } catch (err) {
      toast.error(err?.message ?? 'Could not save profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container-max py-8 flex gap-gutter">
      <AccountSideNav />
      <main className="flex-1 space-y-gutter">
        <section className="bg-surface border border-outline-variant rounded-xl p-8 flex flex-col md:flex-row items-center gap-8">
          <div className="relative">
            <img
              src={form.avatarUrl || DEFAULT_AVATAR}
              alt={user.fullName}
              className="w-32 h-32 rounded-full object-cover border-4 border-surface-container shadow"
            />
          </div>
          <div className="text-center md:text-left flex-1">
            <h1 className="text-headline-lg text-on-surface mb-1">{user.fullName}</h1>
            <p className="text-body-md text-on-surface-variant mb-4">{user.email}</p>
            <div className="flex flex-wrap gap-2 justify-center md:justify-start">
              <span className="px-3 py-1 bg-primary-fixed text-on-primary-fixed rounded-full text-label-md">
                {user.role === 'seller' ? 'Pro Member' : 'Member'}
              </span>
              <span className="px-3 py-1 bg-secondary-fixed text-on-secondary-fixed rounded-full text-label-md">
                Verified Account
              </span>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <BentoCard to="/orders" icon="shopping_bag" title="My Orders" subtitle="Track, return, or buy things again." cta={orderCount === null ? 'View history' : `View history (${orderCount})`} />
          <BentoCard to="/account/addresses" icon="location_on" title="Addresses" subtitle="Edit addresses for orders and gifts." cta={addressCount === null ? 'Manage saved' : `Manage ${addressCount} saved`} />
        </section>

        <form onSubmit={save} className="bg-surface border border-outline-variant rounded-xl overflow-hidden">
          <div className="px-8 py-6 border-b border-outline-variant bg-surface-container-low flex justify-between items-center">
            <div>
              <h2 className="text-headline-md text-on-surface">Personal Information</h2>
              <p className="text-body-sm text-on-surface-variant">Update your account details and contact info.</p>
            </div>
            <button type="submit" disabled={saving} className="btn-primary px-6 py-2 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
          <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            <Field label="Full Name">
              <input className="field" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required maxLength={255} />
            </Field>
            <Field label="Email Address">
              <input className="field" value={user.email} disabled />
            </Field>
            <Field label="Phone Number">
              <input className="field" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={32} />
            </Field>
            <Field label="Preferred Language">
              <select className="field" value={form.preferredLanguage} disabled>
                <option value="en">English (US)</option>
              </select>
            </Field>
            <Field label="Avatar URL" wide>
              <input className="field" value={form.avatarUrl} onChange={(e) => setForm({ ...form, avatarUrl: e.target.value })} placeholder="https://…" maxLength={512} />
            </Field>
            <Field label="Biography (Optional)" wide>
              <textarea className="field min-h-[96px]" value={form.biography} onChange={(e) => setForm({ ...form, biography: e.target.value })} rows={4} maxLength={2000} />
            </Field>
          </div>
        </form>
      </main>
    </div>
  );
}

function Field({ label, wide, children }) {
  return (
    <div className={`space-y-1 ${wide ? 'md:col-span-2' : ''}`}>
      <label className="text-label-md text-on-surface-variant block">{label}</label>
      {children}
    </div>
  );
}

function BentoCard({ to, icon, title, subtitle, cta }) {
  return (
    <Link to={to} className="block bg-surface-container-low border border-outline-variant p-6 rounded-xl hover:-translate-y-0.5 hover:shadow-md transition-all">
      <Icon name={icon} size={28} className="text-primary mb-3" />
      <h3 className="text-headline-md text-on-surface mb-1">{title}</h3>
      <p className="text-body-sm text-on-surface-variant">{subtitle}</p>
      <div className="mt-6 inline-flex items-center text-primary text-label-md">
        {cta}
        <Icon name="arrow_forward" size={16} className="ml-1" />
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Manual test**

In dev server: log in → visit `/account` → edit name, phone, avatar URL, bio → Save → reload → values persist. The avatar in the header updates on save. Bento card counts reflect address/order counts.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/ProfilePage.jsx
git commit -m "feat(fe): ProfilePage with bento + personal info form"
```

---

### Task 27: AddressesPage

**Files:**
- Modify: `frontend/src/pages/AddressesPage.jsx`

- [ ] **Step 1: Replace the stub**:

```jsx
import { useEffect, useState } from 'react';
import AccountSideNav from '../components/AccountSideNav.jsx';
import AddressForm from '../components/AddressForm.jsx';
import Icon from '../components/Icon.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  createAddress,
  deleteAddress,
  listAddresses,
  updateAddress,
} from '../services/addresses.js';

export default function AddressesPage() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null); // null | 'new' | <id>
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    const res = await listAddresses();
    setItems(res.items);
  };

  useEffect(() => { reload().catch((e) => toast.error(e?.message ?? 'Could not load addresses')); }, []);

  const submit = async (data) => {
    setBusy(true);
    try {
      if (editing === 'new') {
        await createAddress(data);
        toast.success('Address added');
      } else {
        await updateAddress(editing, data);
        toast.success('Address updated');
      }
      setEditing(null);
      await reload();
    } catch (err) {
      toast.error(err?.message ?? 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    if (!confirm('Delete this address?')) return;
    try {
      await deleteAddress(id);
      toast.info('Address deleted');
      await reload();
    } catch (err) {
      toast.error(err?.message ?? 'Delete failed');
    }
  };

  const setDefault = async (id) => {
    try {
      await updateAddress(id, { isDefault: true });
      await reload();
    } catch (err) {
      toast.error(err?.message ?? 'Could not set default');
    }
  };

  const current = editing && editing !== 'new' ? items.find((a) => a.id === editing) : null;

  return (
    <div className="container-max py-8 flex gap-gutter">
      <AccountSideNav />
      <main className="flex-1 space-y-gutter">
        <header className="flex items-end justify-between">
          <div>
            <h1 className="text-headline-lg text-on-surface mb-1">Addresses</h1>
            <p className="text-body-md text-on-surface-variant">
              Saved addresses for checkout and shipping.
            </p>
          </div>
          <button onClick={() => setEditing('new')} className="btn-primary px-4 py-2 inline-flex items-center gap-2">
            <Icon name="add" size={18} /> Add address
          </button>
        </header>

        {editing && (
          <section className="bg-surface border border-outline-variant rounded-xl p-6">
            <h2 className="text-headline-md mb-4">{editing === 'new' ? 'New address' : 'Edit address'}</h2>
            <AddressForm
              initial={current ?? undefined}
              submitting={busy}
              onSubmit={submit}
              onCancel={() => setEditing(null)}
            />
          </section>
        )}

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.length === 0 && !editing && (
            <div className="md:col-span-2 bg-surface-container-low border border-outline-variant rounded-xl p-8 text-center text-on-surface-variant">
              No saved addresses yet.
            </div>
          )}
          {items.map((a) => (
            <article key={a.id} className={`bg-surface rounded-xl p-5 border ${a.isDefault ? 'border-primary' : 'border-outline-variant'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-label-md uppercase tracking-wider text-on-surface-variant">{a.label}</span>
                {a.isDefault && (
                  <span className="text-label-md px-2 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed">Default</span>
                )}
              </div>
              <p className="font-semibold text-on-surface">{a.recipientName}</p>
              <p className="text-body-sm text-on-surface-variant leading-relaxed mt-2">
                {a.line1}
                {a.line2 ? <><br />{a.line2}</> : null}
                <br />
                {a.city}, {a.region} {a.postalCode}
                <br />
                {a.country}
              </p>
              <p className="text-body-sm text-on-surface-variant mt-2">{a.phone}</p>
              <div className="mt-4 flex flex-wrap gap-3 text-label-md">
                <button onClick={() => setEditing(a.id)} className="text-primary hover:underline">Edit</button>
                {!a.isDefault && (
                  <button onClick={() => setDefault(a.id)} className="text-primary hover:underline">
                    Set as default
                  </button>
                )}
                <button onClick={() => remove(a.id)} className="text-error hover:underline">Delete</button>
              </div>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Manual test**

Dev server, log in: `/account/addresses` → add address → it shows as default → add second with "Set as default" checked → first card loses default tag → delete default → next one auto-promoted.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/AddressesPage.jsx
git commit -m "feat(fe): AddressesPage CRUD"
```

---

### Task 28: OrderManagementPage (buyer)

**Files:**
- Modify: `frontend/src/pages/OrderManagementPage.jsx`

- [ ] **Step 1: Replace the stub**:

```jsx
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AccountSideNav from '../components/AccountSideNav.jsx';
import Icon from '../components/Icon.jsx';
import OrderStatusBadge from '../components/OrderStatusBadge.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { getProduct } from '../services/products.js';
import { listOrders } from '../services/orders.js';

const TABS = ['All', 'Paid', 'Shipped', 'Delivered', 'Cancelled'];

export default function OrderManagementPage() {
  const [orders, setOrders] = useState([]);
  const [tab, setTab] = useState('All');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const toast = useToast();
  const { addItem } = useCart();

  useEffect(() => {
    setLoading(true);
    listOrders()
      .then((r) => setOrders(r.items))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => {
    if (tab === 'All') return orders;
    return orders.filter((o) => o.status === tab);
  }, [orders, tab]);

  const reorder = async (order) => {
    let added = 0;
    for (const it of order.items) {
      try {
        const p = await getProduct(it.productId);
        if (!p) {
          toast.info(`Skipped: "${it.name}" no longer available`);
          continue;
        }
        addItem(
          { id: p.id, name: p.name, subtitle: p.subtitle ?? p.brand ?? '', price: p.price, image: p.imageFirst ?? p.image ?? '' },
          it.quantity,
        );
        added += 1;
      } catch {
        toast.info(`Skipped: "${it.name}"`);
      }
    }
    if (added > 0) navigate('/cart');
  };

  return (
    <div className="container-max py-8 flex gap-gutter">
      <AccountSideNav />
      <main className="flex-1 space-y-gutter">
        <header>
          <h1 className="text-headline-lg text-on-surface mb-1">Order Management</h1>
          <p className="text-body-md text-on-surface-variant">
            Track, manage and view the history of your purchases.
          </p>
        </header>

        <div className="border-b border-outline-variant overflow-x-auto">
          <div className="flex gap-8 min-w-max">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`pb-3 border-b-2 text-label-md transition-colors ${
                  tab === t ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {t === 'All' ? 'All Orders' : t}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="text-on-surface-variant">Loading orders…</p>
        ) : visible.length === 0 ? (
          <div className="bg-surface-container-low border border-outline-variant rounded-xl p-10 text-center">
            <Icon name="receipt_long" size={40} className="text-outline" />
            <p className="text-headline-md text-on-surface mt-2">No orders here</p>
            <p className="text-body-sm text-on-surface-variant">When you buy something, it appears here.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {visible.map((o) => (
              <li key={o.id} className="bg-surface border border-outline-variant rounded-xl hover:border-primary transition-colors">
                <div className="p-6 flex flex-col md:flex-row gap-6">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center justify-between mb-4 gap-2">
                      <div className="flex items-center gap-3">
                        <span className="text-data-mono bg-surface-container-high px-3 py-1 rounded-full text-on-surface">#{o.id}</span>
                        <span className="text-body-sm text-on-surface-variant">
                          Ordered on {new Date(o.createdAt).toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' })}
                        </span>
                      </div>
                      <OrderStatusBadge status={o.status} />
                    </div>
                    <div className="flex gap-3">
                      {(o.items ?? []).slice(0, 3).map((it) => (
                        <div key={it.id} className="w-16 h-16 rounded-lg overflow-hidden border border-outline-variant bg-surface-container flex items-center justify-center text-body-sm text-on-surface-variant px-1 text-center">
                          {it.name}
                        </div>
                      ))}
                      {(o.items?.length ?? 0) > 3 && (
                        <div className="w-16 h-16 rounded-lg overflow-hidden border border-outline-variant bg-surface flex items-center justify-center text-label-md text-on-surface-variant">
                          +{o.items.length - 3}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="md:w-60 flex flex-col justify-between border-t md:border-t-0 md:border-l border-outline-variant pt-6 md:pt-0 md:pl-6">
                    <div className="mb-4">
                      <p className="text-label-md text-on-surface-variant uppercase tracking-wider mb-1">Total Amount</p>
                      <p className="text-headline-md text-on-surface">${Number(o.total).toFixed(2)}</p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Link to={`/orders/${o.id}`} className="btn-primary py-2 text-center">View Details</Link>
                      <button onClick={() => reorder(o)} className="py-2 border border-primary text-primary rounded-lg hover:bg-primary/5 transition-colors">Reorder</button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Check `services/products.js`**

Confirm `getProduct(id)` exists. If it doesn't, peek the existing file and add at the bottom:

```js
export const getProduct = (id) => api.get(`/products/${id}`);
```

(If it already exists with a different shape, prefer it.)

- [ ] **Step 3: Manual test**

Log in, place an order via existing flow, then visit `/orders`. Confirm tabs filter; Reorder navigates back to cart with items present.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/OrderManagementPage.jsx frontend/src/services/products.js
git commit -m "feat(fe): buyer OrderManagementPage with tabs + reorder"
```

---

### Task 29: OrderDetailPage

**Files:**
- Modify: `frontend/src/pages/OrderDetailPage.jsx`

- [ ] **Step 1: Replace the stub**:

```jsx
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AccountSideNav from '../components/AccountSideNav.jsx';
import Icon from '../components/Icon.jsx';
import OrderStatusBadge from '../components/OrderStatusBadge.jsx';
import OrderTimeline from '../components/OrderTimeline.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { cancelOrder, getOrder } from '../services/orders.js';

export default function OrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [order, setOrder] = useState(null);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    try {
      const o = await getOrder(id);
      setOrder(o);
    } catch (err) {
      if (err?.status === 403 || err?.status === 404) {
        toast.error('Order unavailable');
        navigate('/orders', { replace: true });
        return;
      }
      toast.error(err?.message ?? 'Could not load order');
    }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [id]);

  if (!order) return <div className="container-max py-8">Loading…</div>;

  const onCancel = async () => {
    if (!confirm('Cancel this order? Stock will be restored.')) return;
    setBusy(true);
    try {
      await cancelOrder(id);
      toast.success('Order cancelled');
      await reload();
    } catch (err) {
      toast.error(err?.message ?? 'Could not cancel');
    } finally {
      setBusy(false);
    }
  };

  const addr = order.shipping_address;

  return (
    <div className="container-max py-8 flex gap-gutter">
      <AccountSideNav />
      <main className="flex-1 space-y-gutter">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <nav className="flex items-center gap-2 text-on-surface-variant text-label-md mb-2">
              <Link to="/account" className="hover:text-primary">Account</Link>
              <Icon name="chevron_right" size={14} />
              <Link to="/orders" className="hover:text-primary">Orders</Link>
              <Icon name="chevron_right" size={14} />
              <span className="text-on-surface">#{order.id}</span>
            </nav>
            <h1 className="text-headline-lg text-on-surface">Order Details</h1>
          </div>
          {order.status === 'Paid' && (
            <button onClick={onCancel} disabled={busy} className="border border-outline px-6 py-2 rounded-lg text-label-md text-on-surface hover:bg-surface-container transition-colors disabled:opacity-50">
              {busy ? 'Cancelling…' : 'Cancel order'}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-gutter">
          <section className="md:col-span-8 bg-surface border border-outline-variant rounded-xl p-6 md:p-8">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-headline-md text-on-surface">Status</h2>
              <OrderStatusBadge status={order.status} />
            </div>
            <OrderTimeline order={order} />
          </section>

          <div className="md:col-span-4 flex flex-col gap-gutter">
            <section className="bg-surface-container border border-outline-variant rounded-xl p-6">
              <div className="flex items-center gap-2 mb-3">
                <Icon name="location_on" size={18} className="text-primary" />
                <h3 className="text-label-md uppercase tracking-wider text-on-surface-variant">Shipping Address</h3>
              </div>
              <p className="font-semibold text-on-surface">{addr.recipientName}</p>
              <p className="text-body-sm text-on-surface-variant leading-relaxed mt-1">
                {addr.line1}{addr.line2 ? <><br />{addr.line2}</> : null}<br />
                {addr.city}, {addr.region} {addr.postalCode}<br />
                {addr.country}
              </p>
              <p className="text-body-sm text-on-surface-variant mt-2">{addr.phone}</p>
              <p className="text-body-sm text-on-surface-variant mt-3">Method: {order.shippingMethod}</p>
            </section>
            <section className="bg-surface-container border border-outline-variant rounded-xl p-6">
              <div className="flex items-center gap-2 mb-3">
                <Icon name="credit_card" size={18} className="text-primary" />
                <h3 className="text-label-md uppercase tracking-wider text-on-surface-variant">Payment Method</h3>
              </div>
              <p className="font-semibold text-on-surface">
                {order.payment.method === 'card' ? `Card ending in ${order.payment.last4 ?? '----'}` :
                 order.payment.method === 'ewallet' ? 'E-wallet' : 'Bank transfer'}
              </p>
              <p className="text-body-sm text-on-surface-variant mt-1">Txn: {order.payment.txnId}</p>
            </section>
          </div>

          <section className="md:col-span-8 bg-surface border border-outline-variant rounded-xl overflow-hidden">
            <div className="px-6 py-5 border-b border-outline-variant bg-surface-container-low">
              <h3 className="text-headline-md text-on-surface">Order Items ({order.items.length})</h3>
            </div>
            <ul className="divide-y divide-outline-variant">
              {order.items.map((it) => (
                <li key={it.id} className="px-6 py-5 flex gap-4">
                  <div className="w-20 h-20 rounded-lg overflow-hidden border border-outline-variant bg-surface-container flex items-center justify-center text-body-sm text-on-surface-variant text-center px-1">
                    {it.name}
                  </div>
                  <div className="flex-grow flex flex-col justify-between">
                    <p className="text-body-md text-primary font-semibold">{it.name}</p>
                    <div className="flex justify-between items-end">
                      <span className="text-body-sm text-on-surface-variant">Qty: {it.quantity}</span>
                      <span className="text-headline-md text-on-surface">${(Number(it.price) * it.quantity).toFixed(2)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <aside className="md:col-span-4">
            <div className="bg-surface-container-high border border-outline-variant rounded-xl p-6 md:sticky md:top-24">
              <h3 className="text-headline-md text-on-surface mb-4">Order Summary</h3>
              <div className="space-y-2 text-body-md">
                <Row label="Subtotal" value={`$${Number(order.subtotal).toFixed(2)}`} />
                <Row label={`Shipping (${order.shippingMethod})`} value={`$${Number(order.shipping).toFixed(2)}`} />
                <Row label="Tax (8%)" value={`$${Number(order.tax).toFixed(2)}`} />
              </div>
              <div className="border-t border-outline-variant pt-4 mt-4 flex justify-between items-center">
                <span className="text-headline-md text-on-surface">Total</span>
                <span className="text-headline-lg text-primary">${Number(order.total).toFixed(2)}</span>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between text-on-surface-variant">
      <span>{label}</span>
      <span className="text-data-mono">{value}</span>
    </div>
  );
}
```

- [ ] **Step 2: Manual test**

After placing an order, visit `/orders/<id>`: timeline shows Ordered + Paid filled; Shipped/Delivered grey; address + payment cards populated; Cancel works and redirects to a Cancelled-state view (banner + no cancel button).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/OrderDetailPage.jsx
git commit -m "feat(fe): OrderDetailPage with timeline + cancel"
```

---

### Task 30: CheckoutPage + CartPage redirect

**Files:**
- Modify: `frontend/src/pages/CheckoutPage.jsx`
- Modify: `frontend/src/pages/CartPage.jsx`

- [ ] **Step 1: Update CartPage**

In `frontend/src/pages/CartPage.jsx`, replace the contents of `onCheckout` and remove the `checkoutApi` import:

```jsx
// remove: import { checkout as checkoutApi } from '../services/orders.js';

async function onCheckout() {
  if (selectedItems.length === 0) return;
  if (!isAuthenticated) {
    toast.error('Please sign in before checking out');
    navigate('/auth', { state: { from: '/cart' } });
    return;
  }
  navigate('/checkout', {
    state: { productIds: selectedItems.map((i) => i.id) },
  });
}
```

You can also remove the unused `submitting` state if nothing else uses it; otherwise just leave it.

- [ ] **Step 2: Write CheckoutPage**

Replace `frontend/src/pages/CheckoutPage.jsx`:

```jsx
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AddressForm from '../components/AddressForm.jsx';
import Icon from '../components/Icon.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { createAddress, listAddresses } from '../services/addresses.js';
import { checkout } from '../services/orders.js';

const SHIPPING_OPTIONS = [
  { id: 'Standard', label: 'Standard Delivery', eta: '5-7 business days', price: 5 },
  { id: 'Express', label: 'Express Delivery', eta: '1-2 business days', price: 15 },
];

const PAYMENT_TABS = [
  { id: 'card', label: 'Credit Card', icon: 'credit_card' },
  { id: 'ewallet', label: 'E-wallet', icon: 'account_balance_wallet' },
  { id: 'bank', label: 'Bank Transfer', icon: 'account_balance' },
];

export default function CheckoutPage() {
  const { isAuthenticated } = useAuth();
  const { items, selectedItems, clearSelected } = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const productIds = useMemo(() => {
    const fromState = location.state?.productIds;
    if (fromState && fromState.length) return fromState;
    return selectedItems.map((i) => i.id);
  }, [location.state, selectedItems]);

  const lineItems = useMemo(
    () => items.filter((i) => productIds.includes(i.id)),
    [items, productIds],
  );

  const [addresses, setAddresses] = useState([]);
  const [addressId, setAddressId] = useState(null);
  const [shippingMethod, setShippingMethod] = useState('Standard');
  const [paymentMethod, setPaymentMethod] = useState('card');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [addingAddress, setAddingAddress] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/auth', { replace: true, state: { from: '/checkout' } });
      return;
    }
    if (productIds.length === 0) {
      toast.error('Your selection is empty');
      navigate('/cart', { replace: true });
      return;
    }
    listAddresses()
      .then((r) => {
        setAddresses(r.items);
        const def = r.items.find((a) => a.isDefault) ?? r.items[0];
        if (def) setAddressId(def.id);
        else setAddingAddress(true);
      })
      .catch((err) => toast.error(err?.message ?? 'Could not load addresses'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = useMemo(() => {
    const sub = lineItems.reduce((s, i) => s + Number(i.price) * i.quantity, 0);
    const shippingCost = shippingMethod === 'Express' ? 15 : 5;
    const tax = +(sub * 0.08).toFixed(2);
    return { sub, shipping: sub > 0 ? shippingCost : 0, tax, total: +(sub + (sub > 0 ? shippingCost : 0) + tax).toFixed(2) };
  }, [lineItems, shippingMethod]);

  const saveAddress = async (data) => {
    setSavingAddress(true);
    try {
      const res = await createAddress(data);
      const updated = await listAddresses();
      setAddresses(updated.items);
      setAddressId(res.address.id);
      setAddingAddress(false);
    } catch (err) {
      toast.error(err?.message ?? 'Could not save address');
    } finally {
      setSavingAddress(false);
    }
  };

  const placeOrder = async () => {
    if (!addressId) { toast.error('Pick an address'); return; }
    if (paymentMethod === 'card') {
      const digits = cardNumber.replace(/\D/g, '');
      if (digits.length < 12) { toast.error('Card number looks too short'); return; }
      if (!/^\d{2}\/\d{2}$/.test(expiry)) { toast.error('Expiry must be MM/YY'); return; }
      if (!/^\d{3,4}$/.test(cvc)) { toast.error('CVC invalid'); return; }
    }
    setSubmitting(true);
    try {
      const res = await checkout({
        productIds,
        addressId,
        shippingMethod,
        payment: {
          method: paymentMethod,
          cardLast4: paymentMethod === 'card' ? cardNumber.replace(/\D/g, '').slice(-4) : undefined,
        },
      });
      clearSelected();
      toast.success(`Order placed (#${res.orderId}) — $${Number(res.total).toFixed(2)}`);
      navigate(`/orders/${res.orderId}`, { replace: true });
    } catch (err) {
      toast.error(err?.message ?? 'Checkout failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container-max py-8">
      <nav className="flex items-center gap-2 text-on-surface-variant text-label-md mb-6">
        <Link to="/cart" className="hover:text-primary">Cart</Link>
        <Icon name="chevron_right" size={14} />
        <span className="text-primary">Checkout</span>
      </nav>

      <div className="flex flex-col lg:flex-row gap-gutter items-start">
        <div className="flex-1 w-full min-w-0 space-y-gutter">
          <section className="bg-surface border border-outline-variant rounded-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-headline-md flex items-center gap-2">
                <Icon name="location_on" className="text-primary" size={20} />
                Delivery Address
              </h2>
              {!addingAddress && (
                <button onClick={() => setAddingAddress(true)} className="text-primary text-label-md hover:underline">
                  Add new address
                </button>
              )}
            </div>
            {addingAddress ? (
              <AddressForm
                onSubmit={saveAddress}
                onCancel={addresses.length ? () => setAddingAddress(false) : undefined}
                submitting={savingAddress}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {addresses.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setAddressId(a.id)}
                    className={`text-left rounded-lg p-4 border-2 transition-colors ${
                      addressId === a.id ? 'border-primary bg-surface-container-low' : 'border-outline-variant bg-surface hover:border-primary/40'
                    }`}
                  >
                    <p className="text-label-md uppercase tracking-wider text-on-surface-variant mb-1">{a.label}</p>
                    <p className="font-semibold">{a.recipientName}</p>
                    <p className="text-body-sm text-on-surface-variant leading-relaxed mt-1">
                      {a.line1}{a.line2 ? <><br />{a.line2}</> : null}<br />
                      {a.city}, {a.region} {a.postalCode}<br />
                      {a.country}
                    </p>
                    <p className="text-body-sm text-on-surface-variant mt-2">{a.phone}</p>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="bg-surface border border-outline-variant rounded-xl p-6">
            <h2 className="text-headline-md flex items-center gap-2 mb-4">
              <Icon name="local_shipping" className="text-primary" size={20} />
              Shipping Method
            </h2>
            <div className="flex flex-col gap-3">
              {SHIPPING_OPTIONS.map((s) => (
                <label
                  key={s.id}
                  className={`flex items-center justify-between p-4 rounded-lg border cursor-pointer ${
                    shippingMethod === s.id ? 'border-primary bg-surface-container-low' : 'border-outline-variant hover:border-outline'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <input
                      type="radio"
                      name="shipping"
                      checked={shippingMethod === s.id}
                      onChange={() => setShippingMethod(s.id)}
                      className="w-5 h-5 text-primary focus:ring-primary"
                    />
                    <div>
                      <p className="text-label-md text-on-surface">{s.label}</p>
                      <p className="text-body-sm text-on-surface-variant">{s.eta}</p>
                    </div>
                  </div>
                  <span className="text-label-md text-on-surface">${s.price.toFixed(2)}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="bg-surface border border-outline-variant rounded-xl p-6">
            <h2 className="text-headline-md flex items-center gap-2 mb-4">
              <Icon name="payments" className="text-primary" size={20} />
              Payment Method
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
              {PAYMENT_TABS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPaymentMethod(p.id)}
                  className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-colors gap-2 ${
                    paymentMethod === p.id ? 'border-primary bg-surface-container-low text-primary' : 'border-outline-variant text-on-surface-variant hover:border-outline'
                  }`}
                >
                  <Icon name={p.icon} size={28} />
                  <span className="text-label-md">{p.label}</span>
                </button>
              ))}
            </div>
            {paymentMethod === 'card' && (
              <div className="space-y-4">
                <Field label="Card Number">
                  <input
                    className="field"
                    placeholder="0000 0000 0000 0000"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    inputMode="numeric"
                    maxLength={23}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Expiry">
                    <input
                      className="field"
                      placeholder="MM/YY"
                      value={expiry}
                      onChange={(e) => setExpiry(e.target.value)}
                      maxLength={5}
                    />
                  </Field>
                  <Field label="CVC">
                    <input
                      className="field"
                      placeholder="123"
                      value={cvc}
                      onChange={(e) => setCvc(e.target.value)}
                      maxLength={4}
                      inputMode="numeric"
                    />
                  </Field>
                </div>
              </div>
            )}
            {paymentMethod !== 'card' && (
              <p className="text-body-sm text-on-surface-variant">
                You will be redirected to a mock {paymentMethod === 'ewallet' ? 'e-wallet' : 'bank transfer'} confirmation
                after you place the order.
              </p>
            )}
          </section>
        </div>

        <aside className="w-full lg:w-96 lg:shrink-0">
          <div className="bg-surface border border-outline-variant rounded-xl p-6 lg:sticky lg:top-24">
            <h3 className="text-headline-md border-b border-outline-variant pb-4 mb-4">Order Summary</h3>
            <ul className="space-y-3 mb-4">
              {lineItems.map((i) => (
                <li key={i.id} className="flex gap-3">
                  {i.image ? (
                    <img src={i.image} alt={i.name} className="w-16 h-16 rounded-lg object-cover bg-surface-container-low" />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-surface-container-low" />
                  )}
                  <div className="flex-1">
                    <p className="text-label-md text-on-surface line-clamp-1">{i.name}</p>
                    <p className="text-body-sm text-on-surface-variant">Qty: {i.quantity}</p>
                    <p className="text-body-md text-primary font-semibold">${(Number(i.price) * i.quantity).toFixed(2)}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="border-t border-outline-variant pt-4 space-y-2">
              <Row label="Subtotal" value={`$${totals.sub.toFixed(2)}`} />
              <Row label={`Shipping (${shippingMethod})`} value={`$${totals.shipping.toFixed(2)}`} />
              <Row label="Estimated Tax" value={`$${totals.tax.toFixed(2)}`} />
            </div>
            <div className="border-t border-outline-variant pt-4 mt-4 flex justify-between items-center">
              <span className="text-headline-md">Total</span>
              <span className="text-headline-lg text-primary">${totals.total.toFixed(2)}</span>
            </div>
            <button
              type="button"
              onClick={placeOrder}
              disabled={submitting || !addressId || lineItems.length === 0}
              className="btn-primary w-full py-3 mt-6 disabled:opacity-50"
            >
              {submitting ? 'Placing order…' : 'Place Order'}
              {!submitting && <Icon name="arrow_forward" size={16} />}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between text-on-surface-variant">
      <span>{label}</span>
      <span className="text-data-mono">{value}</span>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1">
      <label className="text-label-md text-on-surface-variant block">{label}</label>
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Manual test (golden path)**

Dev server, log in: add 2 products to cart → /cart → Checkout → on `/checkout`, pick or add address → switch shipping to Express ($15) → total updates → enter card 4242 4242 4242 4242 / 12/30 / 123 → Place Order → land on `/orders/:id` with timeline showing Ordered + Paid.

- [ ] **Step 4: Manual test (edge)**

- Empty selection: visit `/checkout` directly while cart selection is empty → bounced to `/cart`.
- No saved addresses: deleted all addresses, then `/checkout` shows the AddressForm directly and Place Order stays disabled until saved.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/CheckoutPage.jsx frontend/src/pages/CartPage.jsx
git commit -m "feat(fe): CheckoutPage with mock payment; cart navigates here"
```

---

## Phase F — Docs

### Task 31: Update feature docs + README

**Files:**
- Modify: `docs/features/orders.md`
- Create: `docs/features/profile.md`
- Create: `docs/features/addresses.md`
- Modify: `docs/README.md`

- [ ] **Step 1: Rewrite `docs/features/orders.md`**

```markdown
# Orders

Per-buyer purchase records. Checkout is transactional: stock is decremented,
the order + items are inserted, and the matching cart rows are deleted in a
single transaction. Payment is mocked — orders go straight to `Paid`.

| Method | Path | Body | Notes |
|--------|------|------|-------|
| POST | `/orders/checkout` | `{ productIds, addressId, shippingMethod, payment }` | Snapshots shipping address from `user_addresses`. 400 if empty, 404 if address missing, 409 on oversell. |
| GET | `/me/orders` | `?status=` | Buyer's orders, newest first. Returns snapshot + timestamps. |
| GET | `/me/orders/:id` | — | Order detail with items and snapshots. 403 for other buyers. |
| PATCH | `/me/orders/:id/cancel` | — | Buyer cancel; restores stock; 409 if not in `Paid` state. |

Pricing: `shipping = 5.00` (Standard) or `15.00` (Express), `tax = 8% of subtotal`,
`total = subtotal + shipping + tax`.

Schemas:

- `orders(id, buyer_id, subtotal, shipping, tax, total, status, shipping_method, shipping_*, payment_method, payment_last4, payment_txn_id, paid_at, shipped_at, delivered_at, cancelled_at, created_at, updated_at)`
- `order_items(id, order_id, product_id, store_id, name_snapshot, price_snapshot, quantity)`

Status enum: `Paid | Shipped | Delivered | Cancelled`.

## Seller routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/store/orders` | Orders that contain ≥1 item from the seller's store. Supports `status` and `q` filters. |
| PATCH | `/store/orders/:id` | Update overall order status. Sets matching timestamp; transitioning to `Cancelled` restores stock. |
```

- [ ] **Step 2: Write `docs/features/profile.md`**

```markdown
# Profile

| Method | Path | Body | Notes |
|--------|------|------|-------|
| GET | `/me` | — | Returns the public profile. |
| PATCH | `/me` | `{ fullName?, phone?, avatarUrl?, biography?, preferredLanguage? }` | Email + role immutable here. |

Users table includes `phone`, `avatar_url`, `biography`, `preferred_language` (default `en`).
The frontend `ProfilePage` (`/account`) hosts the form; the existing `/auth/me` stays in
place for compatibility.
```

- [ ] **Step 3: Write `docs/features/addresses.md`**

```markdown
# Addresses

Per-user shipping address book. At most one row per user has `is_default = 1`,
enforced inside the service via a transaction on create / update / delete.

| Method | Path | Body | Notes |
|--------|------|------|-------|
| GET | `/me/addresses` | — | Default first. |
| POST | `/me/addresses` | `{ label, recipientName, phone, line1, line2?, city, region, postalCode, country, isDefault? }` | First address auto-becomes default. |
| PATCH | `/me/addresses/:id` | partial | 403 if not owner. Setting `isDefault: true` unsets others. |
| DELETE | `/me/addresses/:id` | — | If was default, promotes the most recent remaining. |

Used by `/orders/checkout` (snapshots the chosen address onto the order) and the
`AddressesPage` (`/account/addresses`).
```

- [ ] **Step 4: Append rows to `docs/README.md`**

Open `docs/README.md`. Locate the completed-features table (3-column format per recent commit). Append rows in the same shape:

| Feature | Spec | Notes |
|---|---|---|
| Profile + Addresses | `superpowers/specs/2026-05-13-checkout-orders-profile-design.md` | `/me`, `/me/addresses`; ProfilePage + AddressesPage |
| Checkout + Order Detail / Management | `superpowers/specs/2026-05-13-checkout-orders-profile-design.md` | Mock payment; status timeline; buyer cancel |

(Match the exact existing column header and ordering — do not invent new columns.)

- [ ] **Step 5: Commit**

```bash
git add docs/features/orders.md docs/features/profile.md docs/features/addresses.md docs/README.md
git commit -m "docs: profile, addresses, and updated orders feature pages"
```

---

## Phase G — Final verification

### Task 32: Full-stack smoke test

- [ ] **Step 1: Full stack up**

```bash
docker compose down -v
docker compose up -d
docker compose logs -f backend  # in a second pane, watch for "Renamed N orders" or no-op
```

- [ ] **Step 2: Run all backend tests**

```bash
cd backend
npm test
npm run test:e2e
```

Expected: green across the board.

- [ ] **Step 3: Manual frontend walk-through (golden path)**

1. Register a new buyer at `/auth`.
2. Browse products, add 2 to cart, select both.
3. From `/cart`, click Checkout → land on `/checkout`.
4. Since no address yet, the inline AddressForm appears; fill it; save.
5. Switch shipping to Express; total updates by +$10.
6. Pick "Credit Card", enter 4242 4242 4242 4242 / 12/30 / 123.
7. Place Order → land on `/orders/<id>` with Ordered + Paid filled.
8. Visit `/orders` → see the order; switch tab to Paid → still visible.
9. Visit `/account` → check that bento counts read "Manage 1 saved" and "View history (1)".
10. Update phone + bio + avatar URL on `/account` → reload → values persist.
11. From order detail, click Cancel → confirm → timeline replaced with red banner; status badge says "Cancelled"; visit `/orders` → tab "Cancelled" lists it; `/orders` tab "Paid" no longer shows it.
12. Reorder from `/orders` → items appear in cart.

Each step that fails: file a follow-up — do not "fix in place" without a new task.

- [ ] **Step 4: Final commit (if any docs/clean-up snuck in)**

```bash
git status
# if anything left over from manual fixes, commit it now
```

---

## Self-Review

- **Spec coverage:** every spec section (`users` columns, `user_addresses` table, order column additions + enum rename, `/me`, `/me/addresses`, new checkout payload, cancel, status timestamps, 5 new pages, AccountSideNav, AddressForm, OrderStatusBadge, OrderTimeline, services, router, CartPage redirect, docs) maps to at least one task above.
- **No placeholders:** every code block in this plan is final source. No `TBD`, no "similar to". Long files (CheckoutPage, OrderDetailPage, ProfilePage, AddressesPage, OrderManagementPage) are fully written out.
- **Type / signature consistency:** `cancelForBuyer` (service) ↔ `cancelOrder` (frontend service) ↔ PATCH route handler — all wired. `OrderStatus` enum is `Paid|Shipped|Delivered|Cancelled` everywhere (DTO, entity, badge, tabs). Checkout payload shape (`{ productIds, addressId, shippingMethod, payment }`) matches in DTO + service.toCheckout + frontend `checkout()` + CheckoutPage.
- **Frequent commits:** ~32 tasks, each ending with a focused commit. TDD pattern used wherever a backend test harness is available; manual verification used for the frontend (no test harness yet).

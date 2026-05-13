import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './user.entity';

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  fullName: string;
  role: UserRole;
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async findByEmailWithHash(email: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.email = :email', { email: normalizeEmail(email) })
      .getOne();
  }

  async findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  async create(input: CreateUserInput): Promise<User> {
    const email = normalizeEmail(input.email);
    const existing = await this.users.findOne({ where: { email } });
    if (existing) throw new ConflictException('Email already registered');

    const entity = this.users.create({
      email,
      passwordHash: input.passwordHash,
      fullName: input.fullName.trim(),
      role: input.role,
    });
    try {
      return await this.users.save(entity);
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: string }).code === 'ER_DUP_ENTRY'
      ) {
        throw new ConflictException('Email already registered');
      }
      throw err;
    }
  }

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
}

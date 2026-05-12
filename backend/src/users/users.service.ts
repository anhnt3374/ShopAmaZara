import { ConflictException, Injectable } from '@nestjs/common';
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

  async findByEmail(email: string): Promise<User | null> {
    return this.users.findOne({ where: { email: normalizeEmail(email) } });
  }

  async findByEmailWithHash(email: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.email = :email', { email: normalizeEmail(email) })
      .getOne();
  }

  async findById(id: string | number): Promise<User | null> {
    return this.users.findOne({ where: { id: Number(id) as unknown as User['id'] } });
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
    return this.users.save(entity);
  }
}

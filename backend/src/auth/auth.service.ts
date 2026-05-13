import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const BCRYPT_ROUNDS = 12;

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

export interface AuthResponse {
  user: PublicUser;
  accessToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.users.create({
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
      role: dto.role,
    });
    return this.toAuthResponse(user);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.users.findByEmailWithHash(dto.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    return this.toAuthResponse(user);
  }

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

  private async toAuthResponse(user: User): Promise<AuthResponse> {
    const publicUser = this.toPublic(user);
    const accessToken = await this.jwt.signAsync({
      sub: publicUser.id,
      email: publicUser.email,
      role: publicUser.role,
    });
    return { user: publicUser, accessToken };
  }
}

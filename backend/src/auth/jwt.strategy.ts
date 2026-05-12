import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../users/users.service';
import { AuthService, PublicUser } from './auth.service';

interface JwtPayload {
  sub: string;
  email: string;
  role: 'buyer' | 'seller';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly users: UsersService,
    private readonly auth: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') ?? '',
    });
  }

  async validate(payload: JwtPayload): Promise<PublicUser> {
    const user = await this.users.findById(payload.sub);
    if (!user) throw new UnauthorizedException();
    return this.auth.toPublic(user);
  }
}

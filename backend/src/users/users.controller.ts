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

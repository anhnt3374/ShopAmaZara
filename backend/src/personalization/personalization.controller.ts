import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PreferenceService } from './preference.service';

@Controller('me')
@UseGuards(JwtAuthGuard)
export class PersonalizationController {
  constructor(private readonly preference: PreferenceService) {}

  @Get('profile')
  profile(@Req() req: Request & { user: { id: string } }) {
    return this.preference.getProfile(req.user.id);
  }
}

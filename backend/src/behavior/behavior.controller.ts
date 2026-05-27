import { Body, Controller, HttpCode, Logger, Post, Req, UseGuards } from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BehaviorService } from './behavior.service';

class ViewEventDto {
  @IsString()
  @Length(36, 36)
  productId!: string;
}

@Controller('me/events')
@UseGuards(JwtAuthGuard)
export class BehaviorController {
  private readonly log = new Logger('BehaviorController');

  constructor(private readonly behavior: BehaviorService) {}

  @Post('view')
  @HttpCode(204)
  async view(
    @Req() req: Request & { user: { id: string } },
    @Body() dto: ViewEventDto,
  ): Promise<void> {
    try {
      await this.behavior.recordView(req.user.id, dto.productId);
    } catch (err) {
      this.log.warn(`recordView failed: ${(err as Error).message}`);
    }
  }
}

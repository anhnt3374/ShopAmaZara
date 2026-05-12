import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WishlistService } from './wishlist.service';

class AddWishlistDto {
  @IsString()
  @Length(36, 36)
  productId!: string;
}

@Controller('me/wishlist')
@UseGuards(JwtAuthGuard)
export class WishlistController {
  constructor(private readonly wishlist: WishlistService) {}

  @Get()
  list(@Req() req: Request & { user: { id: string } }) {
    return this.wishlist.list(req.user.id);
  }

  @Post()
  async add(
    @Req() req: Request & { user: { id: string } },
    @Body() dto: AddWishlistDto,
  ) {
    const out = await this.wishlist.add(req.user.id, dto.productId);
    return { item: out.item };
  }

  @Delete(':productId')
  @HttpCode(204)
  async remove(
    @Req() req: Request & { user: { id: string } },
    @Param('productId') productId: string,
  ) {
    await this.wishlist.remove(req.user.id, productId);
  }
}

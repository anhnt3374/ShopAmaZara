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
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

@Controller('me/cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  list(@Req() req: Request & { user: { id: string } }) {
    return this.cart.list(req.user.id);
  }

  @Post()
  async add(
    @Req() req: Request & { user: { id: string } },
    @Body() dto: AddCartItemDto,
  ) {
    const out = await this.cart.add(req.user.id, dto);
    return out;
  }

  @Patch(':productId')
  async update(
    @Req() req: Request & { user: { id: string } },
    @Res({ passthrough: true }) res: Response,
    @Param('productId') productId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    const item = await this.cart.update(req.user.id, productId, dto);
    if (!item) {
      res.status(204);
      return;
    }
    return { item };
  }

  @Delete(':productId')
  @HttpCode(204)
  async remove(
    @Req() req: Request & { user: { id: string } },
    @Param('productId') productId: string,
  ) {
    await this.cart.remove(req.user.id, productId);
  }

  @Delete()
  @HttpCode(204)
  async clear(@Req() req: Request & { user: { id: string } }) {
    await this.cart.clear(req.user.id);
  }
}

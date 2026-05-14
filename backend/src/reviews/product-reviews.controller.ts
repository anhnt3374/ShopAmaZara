import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateReviewDto } from './dto/create-review.dto';
import { ListReviewsDto } from './dto/list-reviews.dto';
import { ReviewsService } from './reviews.service';

@Controller('products/:productId/reviews')
export class ProductReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  list(@Param('productId') productId: string, @Query() dto: ListReviewsDto) {
    return this.reviews.listForProduct(productId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(
    @Req() req: Request & { user: { id: string } },
    @Param('productId') productId: string,
  ) {
    return this.reviews.myReviewForProduct(req.user.id, productId);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(
    @Req() req: Request & { user: { id: string } },
    @Param('productId') productId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviews.create(req.user.id, productId, dto);
  }
}

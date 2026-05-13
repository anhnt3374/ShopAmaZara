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
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AddressesService } from './addresses.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@Controller('me/addresses')
@UseGuards(JwtAuthGuard)
export class AddressesController {
  constructor(private readonly svc: AddressesService) {}

  @Get()
  list(@Req() req: Request & { user: { id: string } }) {
    return this.svc.list(req.user.id);
  }

  @Post()
  @HttpCode(201)
  create(
    @Req() req: Request & { user: { id: string } },
    @Body() dto: CreateAddressDto,
  ) {
    return this.svc.create(req.user.id, dto);
  }

  @Patch(':id')
  update(
    @Req() req: Request & { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.svc.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Req() req: Request & { user: { id: string } },
    @Param('id') id: string,
  ) {
    await this.svc.remove(req.user.id, id);
  }
}

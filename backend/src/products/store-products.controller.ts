import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SellerStoreGuard } from '../common/guards/seller-store.guard';
import { Store } from '../stores/store.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { ListStoreProductsDto } from './dto/list-store-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';
import { MAX_ROWS, ProductsBulkService } from './products.bulk.service';

@Controller('store/products')
@UseGuards(JwtAuthGuard, SellerStoreGuard)
export class StoreProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly bulk: ProductsBulkService,
  ) {}

  @Get()
  list(
    @Req() req: Request & { store: Store },
    @Query() dto: ListStoreProductsDto,
  ) {
    return this.products.listForStore(req.store.id, dto);
  }

  @Get('bulk/template')
  template(@Res() res: Response) {
    const csv =
      'name,sku,category,price,stock,brand,salePrice,model,description,imageUrl,isPublished\n' +
      'Example Product,NX-EXAMPLE-001,Electronics,99.99,10,Nexus,79.99,XP-2024,Sample description,,true\n';
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="products-template.csv"');
    res.send(csv);
  }

  @Post('bulk')
  @HttpCode(201)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10_000_000 },
    }),
  )
  async bulkUpload(
    @Req() req: Request & { store: Store },
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file');
    const lower = file.originalname.toLowerCase();
    const rows = lower.endsWith('.csv')
      ? this.bulk.parseCsvBuffer(file.buffer)
      : lower.endsWith('.xls') || lower.endsWith('.xlsx')
      ? this.bulk.parseXlsxBuffer(file.buffer)
      : (() => {
          throw new BadRequestException('Unsupported file extension');
        })();
    if (rows.length > MAX_ROWS) {
      throw new BadRequestException(`Too many rows (max ${MAX_ROWS})`);
    }
    const { valid, skipped } = this.bulk.validateRows(rows);
    const { created, skippedDuringInsert } = await this.products.createManyForStore(
      req.store.id,
      valid,
    );
    return { created, skippedRows: [...skipped, ...skippedDuringInsert] };
  }

  @Get(':id')
  async findOne(
    @Req() req: Request & { store: Store },
    @Param('id') id: string,
  ) {
    return this.products.findOneForStore(req.store.id, id);
  }

  @Post()
  async create(
    @Req() req: Request & { store: Store },
    @Body() dto: CreateProductDto,
  ) {
    const product = await this.products.createForStore(req.store.id, dto);
    return { product };
  }

  @Patch(':id')
  async update(
    @Req() req: Request & { store: Store },
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    const product = await this.products.updateForStore(req.store.id, id, dto);
    return { product };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Req() req: Request & { store: Store }, @Param('id') id: string) {
    await this.products.deleteForStore(req.store.id, id);
  }
}

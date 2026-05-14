import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import {
  BadRequestException,
  Controller,
  HttpCode,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SellerStoreGuard } from '../common/guards/seller-store.guard';

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

@Controller('uploads')
@UseGuards(JwtAuthGuard, SellerStoreGuard)
export class UploadsController {
  @Post('product-image')
  @HttpCode(201)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: 'uploads/products',
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase() || '.bin';
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: 5_000_000 },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME.has(file.mimetype)) cb(null, true);
        else cb(new BadRequestException('Unsupported image type'), false);
      },
    }),
  )
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file');
    return { url: `/static/products/${file.filename}` };
  }
}

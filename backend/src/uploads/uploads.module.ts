import { Module } from '@nestjs/common';
import { StoresModule } from '../stores/stores.module';
import { UploadsController } from './uploads.controller';
import { SellerStoreGuard } from '../common/guards/seller-store.guard';

@Module({
  imports: [StoresModule],
  controllers: [UploadsController],
  providers: [SellerStoreGuard],
})
export class UploadsModule {}

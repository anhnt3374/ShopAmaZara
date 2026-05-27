import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserProductEvent } from '../behavior/behavior-event.entity';
import { Order } from '../orders/order.entity';
import { SearchModule } from '../search/search.module';
import { PreferenceService } from './preference.service';
import { PersonalizationController } from './personalization.controller';

@Module({
  imports: [SearchModule, TypeOrmModule.forFeature([UserProductEvent, Order])],
  controllers: [PersonalizationController],
  providers: [PreferenceService],
  exports: [PreferenceService],
})
export class PersonalizationModule {}

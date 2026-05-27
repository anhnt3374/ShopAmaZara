import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserProductEvent } from './behavior-event.entity';
import { BehaviorService } from './behavior.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserProductEvent])],
  providers: [BehaviorService],
  exports: [BehaviorService],
})
export class BehaviorModule {}

import { IsEnum } from 'class-validator';

export class UpdateOrderStatusDto {
  @IsEnum(['Processing', 'Shipped', 'Delivered', 'Cancelled'])
  status!: 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled';
}

import { IsEnum } from 'class-validator';

export class UpdateOrderStatusDto {
  @IsEnum(['Paid', 'Shipped', 'Delivered', 'Cancelled'])
  status!: 'Paid' | 'Shipped' | 'Delivered' | 'Cancelled';
}

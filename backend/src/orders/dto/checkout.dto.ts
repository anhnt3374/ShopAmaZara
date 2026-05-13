import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';

export class CheckoutPaymentDto {
  @IsEnum(['card', 'ewallet', 'bank', 'cod'])
  method!: 'card' | 'ewallet' | 'bank' | 'cod';

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}$/)
  cardLast4?: string;
}

export class CheckoutDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @Length(36, 36, { each: true })
  productIds!: string[];

  @IsString()
  @Matches(/^\d+$/)
  addressId!: string;

  @IsEnum(['Standard', 'Express'])
  shippingMethod!: 'Standard' | 'Express';

  @IsObject()
  @ValidateNested()
  @Type(() => CheckoutPaymentDto)
  payment!: CheckoutPaymentDto;
}

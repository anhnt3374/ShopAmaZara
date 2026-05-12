import { ArrayMinSize, IsArray, IsString, Length } from 'class-validator';

export class CheckoutDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @Length(36, 36, { each: true })
  productIds!: string[];
}

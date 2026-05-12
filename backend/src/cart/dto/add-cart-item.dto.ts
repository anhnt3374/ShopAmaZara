import { Type } from 'class-transformer';
import { IsInt, IsString, Length, Max, Min } from 'class-validator';

export class AddCartItemDto {
  @IsString()
  @Length(36, 36)
  productId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  quantity!: number;
}

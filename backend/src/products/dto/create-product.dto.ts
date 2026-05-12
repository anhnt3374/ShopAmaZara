import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  @Length(1, 255)
  name!: string;

  @IsString()
  @Length(1, 255)
  brand!: string;

  @IsString()
  @Length(1, 255)
  category!: string;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  discount?: number;

  @IsInt()
  @Min(0)
  stock!: number;

  @IsUrl({ require_tld: false })
  imageFirst!: string;

  @IsOptional()
  @IsString()
  shortDescription?: string;

  @IsOptional()
  @IsString()
  longDescription?: string;

  @IsOptional()
  @IsArray()
  highlights?: unknown[];

  @IsOptional()
  availableColors?: unknown;

  @IsOptional()
  availableSizes?: unknown;

  @IsOptional()
  @IsString()
  material?: string;

  @IsOptional()
  @IsEnum(['men', 'women', 'unisex', 'kids'])
  targetGender?: 'men' | 'women' | 'unisex' | 'kids';

  @IsOptional()
  @IsString()
  targetAgeGroup?: string;

  @IsOptional()
  @IsArray()
  @Type(() => String)
  tags?: string[];
}

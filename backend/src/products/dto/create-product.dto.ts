import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
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

  @IsOptional()
  @IsString()
  @Length(1, 64)
  sku?: string;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  model?: string;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salePrice?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  discount?: number;

  @IsInt()
  @Min(0)
  stock!: number;

  @IsOptional()
  @IsBoolean()
  trackInventory?: boolean;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsString()
  imageFirst!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  images?: string[];

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

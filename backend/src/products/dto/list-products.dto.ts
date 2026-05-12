import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

function toArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value.map(String);
  return [String(value)];
}

export class ListProductsDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsArray()
  @Transform(({ value }) => toArray(value))
  category?: string[];

  @IsOptional()
  @IsArray()
  @Transform(({ value }) => toArray(value))
  brand?: string[];

  @IsOptional()
  @IsArray()
  @Transform(({ value }) => toArray(value))
  storeId?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @IsEnum(['men', 'women', 'unisex', 'kids'])
  gender?: 'men' | 'women' | 'unisex' | 'kids';

  @IsOptional()
  @IsString()
  ageGroup?: string;

  @IsOptional()
  @IsEnum(['featured', 'price-asc', 'price-desc', 'newest'])
  sort?: 'featured' | 'price-asc' | 'price-desc' | 'newest';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  limit?: number;
}

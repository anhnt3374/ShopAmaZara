import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateAddressDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(64) label?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(255) recipientName?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(32) phone?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(255) line1?: string;
  @IsOptional() @IsString() @MaxLength(255) line2?: string | null;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(128) city?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(128) region?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(32) postalCode?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(128) country?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

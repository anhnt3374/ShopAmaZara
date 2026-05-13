import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateAddressDto {
  @IsString() @MinLength(1) @MaxLength(64) label!: string;
  @IsString() @MinLength(1) @MaxLength(255) recipientName!: string;
  @IsString() @MinLength(1) @MaxLength(32) phone!: string;
  @IsString() @MinLength(1) @MaxLength(255) line1!: string;
  @IsOptional() @IsString() @MaxLength(255) line2?: string | null;
  @IsString() @MinLength(1) @MaxLength(128) city!: string;
  @IsString() @MinLength(1) @MaxLength(128) region!: string;
  @IsString() @MinLength(1) @MaxLength(32) postalCode!: string;
  @IsString() @MinLength(1) @MaxLength(128) country!: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

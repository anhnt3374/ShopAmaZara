import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string | null;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(512)
  avatarUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  biography?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  preferredLanguage?: string;
}

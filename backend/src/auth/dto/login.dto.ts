import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { UserRole } from '../../users/user.entity';

export class LoginDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @Length(8, 128)
  password!: string;

  @IsOptional()
  @IsIn(['buyer', 'seller'])
  role?: UserRole;
}

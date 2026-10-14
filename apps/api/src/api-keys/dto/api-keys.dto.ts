import { ArrayNotEmpty, IsArray, IsString, MinLength } from 'class-validator';

export class CreateApiKeyDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  scopes!: string[];
}

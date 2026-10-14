import { ArrayNotEmpty, IsArray, IsString, IsUrl } from 'class-validator';

export class CreateWebhookDto {
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  events!: string[];
}

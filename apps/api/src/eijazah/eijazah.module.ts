import { Module } from '@nestjs/common';
import {
  EijazahController,
  EijazahVerifyController,
} from './eijazah.controller';
import { EijazahService } from './eijazah.service';

@Module({
  controllers: [EijazahController, EijazahVerifyController],
  providers: [EijazahService],
})
export class EijazahModule {}

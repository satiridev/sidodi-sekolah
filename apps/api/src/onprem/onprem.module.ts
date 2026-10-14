import { Module } from '@nestjs/common';
import { OnpremService } from './onprem.service';
import { OnpremController } from './onprem.controller';

@Module({
  providers: [OnpremService],
  controllers: [OnpremController],
})
export class OnpremModule {}

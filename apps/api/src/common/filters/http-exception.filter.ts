import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

/**
 * Format error konsisten: { error: { code, message, details } }
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Terjadi kesalahan pada server';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
        code = HttpStatus[status] ?? 'ERROR';
      } else {
        const body = res as Record<string, unknown>;
        code = (body.error as string) ?? HttpStatus[status] ?? 'ERROR';
        const rawMessage = body.message;
        if (Array.isArray(rawMessage)) {
          message = 'Validasi gagal';
          details = rawMessage;
          code = 'VALIDATION_ERROR';
        } else {
          message = (rawMessage as string) ?? message;
        }
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    }

    response.status(status).json({
      error: { code, message, details },
    });
  }
}

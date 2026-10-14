import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { AuditModule } from './audit/audit.module';
import { StorageModule } from './storage/storage.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { SchoolsModule } from './schools/schools.module';
import { MembersModule } from './members/members.module';
import { AcademicModule } from './academic/academic.module';
import { FoldersModule } from './folders/folders.module';
import { DocumentsModule } from './documents/documents.module';
import { UploadsModule } from './uploads/uploads.module';
import { RetentionModule } from './retention/retention.module';
import { ComplianceModule } from './compliance/compliance.module';
import { StudentsModule } from './students/students.module';
import { ReportsModule } from './reports/reports.module';
import { EijazahModule } from './eijazah/eijazah.module';
import { FinanceModule } from './finance/finance.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { SsoModule } from './sso/sso.module';
import { SearchModule } from './search/search.module';
import { OcrModule } from './ocr/ocr.module';
import { BackupsModule } from './backups/backups.module';
import { OnpremModule } from './onprem/onprem.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    PrismaModule,
    CommonModule,
    AuditModule,
    StorageModule,
    HealthModule,
    AuthModule,
    SchoolsModule,
    MembersModule,
    AcademicModule,
    FoldersModule,
    DocumentsModule,
    UploadsModule,
    RetentionModule,
    ComplianceModule,
    StudentsModule,
    ReportsModule,
    EijazahModule,
    FinanceModule,
    AnalyticsModule,
    SsoModule,
    SearchModule,
    OcrModule,
    BackupsModule,
    OnpremModule,
    IntegrationsModule,
    ApiKeysModule,
    WebhooksModule,
  ],
})
export class AppModule {}

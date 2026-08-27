import { Module } from '@nestjs/common';

import { CoreEngineModule } from 'src/engine/core-modules/core-engine.module';
import { JobsModule } from 'src/engine/core-modules/message-queue/jobs.module';
import { MessageQueueModule } from 'src/engine/core-modules/message-queue/message-queue.module';
import { GlobalWorkspaceDataSourceModule } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource.module';
import { TwentyORMModule } from 'src/engine/twenty-orm/twenty-orm.module';
import { WorkspaceEventEmitterModule } from 'src/engine/workspace-event-emitter/workspace-event-emitter.module';
import { I18nModule } from 'src/engine/core-modules/i18n/i18n.module';

@Module({
  imports: [
    CoreEngineModule,
    MessageQueueModule.registerExplorer(),
    WorkspaceEventEmitterModule,
    JobsModule,
    TwentyORMModule,
    GlobalWorkspaceDataSourceModule,
    I18nModule,
  ],
})
export class QueueWorkerModule {}

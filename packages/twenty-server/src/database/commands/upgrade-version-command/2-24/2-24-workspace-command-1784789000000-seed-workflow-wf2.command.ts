import { Command } from 'nest-commander';
import { isDefined } from 'twenty-shared/utils';
import { EntityMetadataNotFoundError } from 'typeorm/error/EntityMetadataNotFoundError';

import { ProvisionedWorkspaceCommandRunner } from 'src/database/commands/command-runners/provisioned-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import {
  type WorkflowVersionWorkspaceEntity,
  WorkflowVersionStatus,
} from 'src/modules/workflow/common/standard-objects/workflow-version.workspace-entity';
import { type WorkflowWorkspaceEntity } from 'src/modules/workflow/common/standard-objects/workflow.workspace-entity';

const WORKFLOW_ID = 'f5be38bf-8b0c-4948-a4d6-af65b14bfd43';
const WORKFLOW_VERSION_ID = 'd99c5c49-88fc-4ada-a813-d3fbd7cc66e2';
const WORKFLOW_NAME = 'WF2: Tạo task follow-up new lead sau 24h';

@RegisteredWorkspaceCommand('2.24.0', 1784789000000)
@Command({
  name: 'upgrade:2-24:seed-workflow-wf2',
  description: 'Automatically seed WF2 follow-up workflow into workspaces',
})
export class SeedWorkflowWf2Command extends ProvisionedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({
    workspaceId,
    dataSource,
  }: RunOnWorkspaceArgs): Promise<void> {
    if (!isDefined(dataSource)) {
      return;
    }

    try {
      const workflowRepository =
        dataSource.getRepository<WorkflowWorkspaceEntity>('workflow', {
          shouldBypassPermissionChecks: true,
        });

      const workflowVersionRepository =
        dataSource.getRepository<WorkflowVersionWorkspaceEntity>(
          'workflowVersion',
          {
            shouldBypassPermissionChecks: true,
          },
        );

      const existingWorkflow = await workflowRepository.findOne({
        where: [{ id: WORKFLOW_ID }, { name: WORKFLOW_NAME }],
      });

      if (isDefined(existingWorkflow)) {
        this.logger.log(
          `Workflow WF2 already exists in workspace ${workspaceId}, skipping seed.`,
        );

        return;
      }

      const triggerPayload = {
        name: 'Record is created',
        type: 'DATABASE_EVENT',
        position: { x: 0, y: 0 },
        settings: { eventName: 'person.created', outputSchema: {} },
        nextStepIds: ['650477fa-b204-4f7d-b260-0fd33da773aa'],
      };

      const stepsPayload = [
        {
          id: '650477fa-b204-4f7d-b260-0fd33da773aa',
          name: 'Delay',
          type: 'DELAY',
          valid: true,
          position: { x: 0, y: 150 },
          settings: {
            input: {
              duration: { days: 0, hours: 0, minutes: 0, seconds: 30 },
              delayType: 'DURATION',
            },
            outputSchema: {},
            errorHandlingOptions: {
              retryOnFailure: { value: false },
              continueOnFailure: { value: false },
            },
          },
          nextStepIds: ['78aaf74b-1284-4596-b8e7-4454935c274a'],
        },
        {
          id: '78aaf74b-1284-4596-b8e7-4454935c274a',
          name: 'Code - Logic Function',
          type: 'CODE',
          valid: true,
          position: { x: 46.787506103515625, y: 249.45001220703125 },
          settings: {
            input: {
              logicFunctionId: '62d918ed-16f9-49d7-9420-41712bedef1c',
              logicFunctionInput: {},
            },
            outputSchema: {
              link: {
                tab: 'test',
                icon: 'IconVariable',
                label: 'Generate Function Output',
                isLeaf: true,
              },
              _outputSchemaType: 'LINK',
            },
            errorHandlingOptions: {
              retryOnFailure: { value: false },
              continueOnFailure: { value: false },
            },
            expectedOutputSchema: { hasActivity: false },
          },
          nextStepIds: ['ae171443-b850-4828-b428-51924f29a167'],
        },
        {
          id: 'ae171443-b850-4828-b428-51924f29a167',
          name: 'If/Else',
          type: 'IF_ELSE',
          valid: true,
          position: { x: 33, y: 400 },
          settings: {
            input: {
              branches: [
                {
                  id: '4ebbc609-2e96-4a9e-a14a-4ce554fc6c38',
                  nextStepIds: ['6fb93627-4500-4234-ba50-262f917cd0c8'],
                  filterGroupId: 'c88c7ab7-5d32-4f39-bc01-0e1a074a1e65',
                },
                {
                  id: '4a18ac03-2e4f-4ff1-a745-48e2f599a443',
                  nextStepIds: ['aa779bdb-9299-4cb6-88d3-bf91824bf899'],
                },
              ],
              stepFilters: [
                {
                  id: '9408a49e-ef6b-4623-a588-cd5f55e4bddf',
                  type: 'boolean',
                  value: 'false',
                  operand: 'IS',
                  isFullRecord: false,
                  stepOutputKey:
                    '{{78aaf74b-1284-4596-b8e7-4454935c274a.hasActivity}}',
                  stepFilterGroupId: 'c88c7ab7-5d32-4f39-bc01-0e1a074a1e65',
                  positionInStepFilterGroup: 0,
                },
              ],
              stepFilterGroups: [
                {
                  id: 'c88c7ab7-5d32-4f39-bc01-0e1a074a1e65',
                  logicalOperator: 'AND',
                },
              ],
            },
            outputSchema: {},
            errorHandlingOptions: {
              retryOnFailure: { value: false },
              continueOnFailure: { value: false },
            },
          },
        },
        {
          id: '6fb93627-4500-4234-ba50-262f917cd0c8',
          name: 'Create Record',
          type: 'CREATE_RECORD',
          valid: true,
          position: { x: -187, y: 566.1998443603516 },
          settings: {
            input: {
              objectName: 'task',
              objectRecord: {
                title: 'Follow-up lead mới tạo sau 24h',
                bodyV2: {
                  markdown: null,
                  blocknote:
                    '[{"type":"paragraph","content":[{"type":"text","text":"Lead này chưa có hoạt động nào sau 24h kể từ khi tạo. Vui lòng liên hệ lại ngay."}]}]',
                },
                status: 'TODO',
              },
            },
            outputSchema: {},
            errorHandlingOptions: {
              retryOnFailure: { value: false },
              continueOnFailure: { value: false },
            },
          },
          nextStepIds: [],
        },
        {
          id: 'aa779bdb-9299-4cb6-88d3-bf91824bf899',
          name: 'Add an Action',
          type: 'EMPTY',
          valid: true,
          position: { x: 198, y: 550 },
          settings: {
            input: {},
            outputSchema: {},
            errorHandlingOptions: {
              retryOnFailure: { value: false },
              continueOnFailure: { value: false },
            },
          },
        },
      ];

      await workflowVersionRepository.save({
        id: WORKFLOW_VERSION_ID,
        workflowId: WORKFLOW_ID,
        name: WORKFLOW_NAME,
        status: WorkflowVersionStatus.ACTIVE,
        trigger: triggerPayload as any,
        steps: stepsPayload as any,
      });

      await workflowRepository.save({
        id: WORKFLOW_ID,
        name: WORKFLOW_NAME,
        lastPublishedVersionId: WORKFLOW_VERSION_ID,
        statuses: [WorkflowVersionStatus.ACTIVE],
      });

      this.logger.log(
        `Successfully seeded Workflow WF2 into workspace ${workspaceId}`,
      );
    } catch (error) {
      if (error instanceof EntityMetadataNotFoundError) {
        return;
      }
      this.logger.error(
        `Failed to seed Workflow WF2 in workspace ${workspaceId}: ${error}`,
      );
    }
  }
}

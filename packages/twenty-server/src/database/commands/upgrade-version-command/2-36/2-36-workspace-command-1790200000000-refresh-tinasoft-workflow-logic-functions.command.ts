import { Command } from 'nest-commander';

import { ProvisionedWorkspaceCommandRunner } from 'src/database/commands/command-runners/provisioned-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { WorkflowVersionCoreSyncService } from 'src/engine/core-modules/workflow/services/workflow-version-core-sync.service';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { PrefillLogicFunctionService } from 'src/engine/workspace-manager/standard-objects-prefill-data/services/prefill-logic-function.service';
import {
  getWorkflowTemplateLogicFunctionDefinitions,
  getWorkflowTemplateLogicFunctionIds,
} from 'src/modules/tinasoft/workflow-template/catalog/workflow-template-logic-functions.constant';
import { type WorkflowVersionWorkspaceEntity } from 'src/modules/workflow/common/standard-objects/workflow-version.workspace-entity';
import { WorkflowActionType } from 'twenty-shared/workflow';
import { type WorkflowAction } from 'src/modules/workflow/workflow-executor/workflow-actions/types/workflow-action.type';

@RegisteredWorkspaceCommand('2.36.0', 1790200000000)
@Command({
  name: 'upgrade:2-36:refresh-tinasoft-workflow-logic-functions',
  description:
    'Refreshes TINASOFT workflow logic functions so existing workflows use the portable signature resolver and current catalog source',
})
export class RefreshTinasoftWorkflowLogicFunctionsCommand extends ProvisionedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly prefillLogicFunctionService: PrefillLogicFunctionService,
    private readonly workspaceOrmManager: WorkspaceOrmManager,
    private readonly workflowVersionCoreSyncService: WorkflowVersionCoreSyncService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({
    workspaceId,
    options,
  }: RunOnWorkspaceArgs): Promise<void> {
    if (options.dryRun) {
      this.logger.log(
        `[DRY RUN] Would refresh TINASOFT workflow logic functions for workspace ${workspaceId}`,
      );

      return;
    }

    await this.prefillLogicFunctionService.ensureSeeded({
      workspaceId,
      definitions: getWorkflowTemplateLogicFunctionDefinitions(workspaceId),
    });

    const workflowVersionRepository =
      this.workspaceOrmManager.getRepository<WorkflowVersionWorkspaceEntity>(
        'workflowVersion',
        { shouldBypassPermissionChecks: true },
      );
    const workflowVersions = await workflowVersionRepository.find();
    const { hrSendInterviewEmail } =
      getWorkflowTemplateLogicFunctionIds(workspaceId);
    const updatedWorkflowVersions: WorkflowVersionWorkspaceEntity[] = [];

    for (const workflowVersion of workflowVersions) {
      const repairedSteps = this.repairInterviewEmailSteps({
        steps: workflowVersion.steps,
        logicFunctionId: hrSendInterviewEmail,
      });

      if (!repairedSteps.changed) {
        continue;
      }

      await workflowVersionRepository.update(workflowVersion.id, {
        steps: repairedSteps.steps,
      });
      updatedWorkflowVersions.push({
        ...workflowVersion,
        steps: repairedSteps.steps,
      });
    }

    if (updatedWorkflowVersions.length > 0) {
      await this.workflowVersionCoreSyncService.upsertToCore(
        workspaceId,
        updatedWorkflowVersions,
      );
    }

    this.logger.log(
      `Refreshed TINASOFT workflow logic functions and repaired ${updatedWorkflowVersions.length} interview workflow version(s) for workspace ${workspaceId}`,
    );
  }

  private repairInterviewEmailSteps({
    steps,
    logicFunctionId,
  }: {
    steps: WorkflowVersionWorkspaceEntity['steps'];
    logicFunctionId: string;
  }): { steps: WorkflowAction[]; changed: boolean } {
    if (!Array.isArray(steps)) {
      return { steps: [], changed: false };
    }

    const codeStepIndex = steps.findIndex(
      (step) =>
        step.type === WorkflowActionType.CODE &&
        step.settings.input.logicFunctionId === logicFunctionId,
    );

    if (codeStepIndex < 0) {
      return { steps, changed: false };
    }

    const findStep = [...steps.slice(0, codeStepIndex)]
      .reverse()
      .find((step) => step.type === WorkflowActionType.FIND_RECORDS);

    if (!findStep) {
      return { steps, changed: false };
    }

    const signatureReference = `{{${findStep.id}.first.signature}}`;
    let changed = false;
    const repairedSteps = steps.map((step) => {
      if (
        step.type === WorkflowActionType.CODE &&
        step.settings.input.logicFunctionId === logicFunctionId
      ) {
        const currentSignature =
          step.settings.input.logicFunctionInput.signature;

        if (currentSignature !== signatureReference) {
          changed = true;
        }

        return {
          ...step,
          settings: {
            ...step.settings,
            input: {
              ...step.settings.input,
              logicFunctionInput: {
                ...step.settings.input.logicFunctionInput,
                signature: signatureReference,
              },
            },
          },
        };
      }

      if (step.id !== findStep.id) {
        return step;
      }

      const outputSchema = step.settings.outputSchema as Record<
        string,
        unknown
      >;
      const firstOutput = outputSchema.first;

      if (
        typeof firstOutput !== 'object' ||
        firstOutput === null ||
        Array.isArray(firstOutput) ||
        typeof (firstOutput as { value?: unknown }).value !== 'object' ||
        (firstOutput as { value?: unknown }).value === null
      ) {
        return step;
      }

      const firstOutputValue = (firstOutput as { value: Record<string, unknown> })
        .value;

      if ('signature' in firstOutputValue) {
        return step;
      }

      changed = true;

      return {
        ...step,
        settings: {
          ...step.settings,
          outputSchema: {
            ...outputSchema,
            first: {
              ...(firstOutput as Record<string, unknown>),
              value: {
                ...firstOutputValue,
                signature: signatureReference,
              },
            },
          },
        },
      };
    });

    return { steps: repairedSteps as WorkflowAction[], changed };
  }
}

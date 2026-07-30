import { Injectable, Logger } from '@nestjs/common';

import { resolveInput } from 'twenty-shared/utils';

import { type WorkflowAction } from 'src/modules/workflow/workflow-executor/interfaces/workflow-action.interface';

import { type LogicFunctionExecuteResult } from 'src/engine/core-modules/logic-function/logic-function-drivers/interfaces/logic-function-driver.interface';
import { LogicFunctionExecutorService } from 'src/engine/core-modules/logic-function/logic-function-executor/logic-function-executor.service';
import {
  WorkflowStepExecutorException,
  WorkflowStepExecutorExceptionCode,
} from 'src/modules/workflow/workflow-executor/exceptions/workflow-step-executor.exception';
import { type WorkflowActionInput } from 'src/modules/workflow/workflow-executor/types/workflow-action-input';
import { type WorkflowActionOutput } from 'src/modules/workflow/workflow-executor/types/workflow-action-output.type';
import { findStepOrThrow } from 'src/modules/workflow/workflow-executor/utils/find-step-or-throw.util';
import { isWorkflowCodeAction } from 'src/modules/workflow/workflow-executor/workflow-actions/code/guards/is-workflow-code-action.guard';
import { type WorkflowCodeActionInput } from 'src/modules/workflow/workflow-executor/workflow-actions/code/types/workflow-code-action-input.type';
import { buildCodeStepLog } from 'src/modules/workflow/workflow-executor/workflow-actions/code/utils/build-code-step-log.util';
import { WorkflowRunStepLogWorkspaceService } from 'src/modules/workflow/workflow-runner/workflow-run/workflow-run-step-log.workspace-service';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';

@Injectable()
export class CodeWorkflowAction implements WorkflowAction {
  private readonly logger = new Logger(CodeWorkflowAction.name);

  constructor(
    private readonly logicFunctionExecutorService: LogicFunctionExecutorService,
    private readonly workflowRunStepLogService: WorkflowRunStepLogWorkspaceService,
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async execute({
    currentStepId,
    steps,
    context,
    runInfo,
  }: WorkflowActionInput): Promise<WorkflowActionOutput> {
    const step = findStepOrThrow({
      stepId: currentStepId,
      steps,
    });

    if (!isWorkflowCodeAction(step)) {
      throw new WorkflowStepExecutorException(
        'Step is not a code action',
        WorkflowStepExecutorExceptionCode.INVALID_STEP_TYPE,
      );
    }

    const workflowActionInput = resolveInput(
      step.settings.input,
      context,
    ) as WorkflowCodeActionInput;

    const { workspaceId } = runInfo;

    const result = await this.logicFunctionExecutorService.execute({
      logicFunctionId: workflowActionInput.logicFunctionId,
      workspaceId,
      payload: workflowActionInput.logicFunctionInput,
    });

    await this.persistStepLog({
      workflowRunId: runInfo.workflowRunId,
      workspaceId,
      stepId: currentStepId,
      result,
    });

    if (result.error) {
      return { error: result.error.errorMessage };
    }

    // Check if person has any task activity (for WF2 workflow)
    let hasActivity = false;

    try {
      const triggerData = (context?.['Record is created'] ||
        context?.['trigger']) as any;
      let targetPersonId =
        triggerData?.recordId ||
        triggerData?.properties?.after?.id ||
        triggerData?.properties?.before?.id ||
        triggerData?.record?.id ||
        triggerData?.id;

      if (!targetPersonId && context) {
        for (const val of Object.values(context)) {
          if (val && typeof val === 'object') {
            const obj = val as any;
            if (obj.recordId && typeof obj.recordId === 'string') {
              targetPersonId = obj.recordId;
              break;
            }
            if (obj.properties?.after?.id) {
              targetPersonId = obj.properties.after.id;
              break;
            }
          }
        }
      }

      if (targetPersonId) {
        const taskTargetRepo =
          await this.globalWorkspaceOrmManager.getRepository(
            workspaceId,
            'taskTarget',
            { shouldBypassPermissionChecks: true },
          );

        const count = await taskTargetRepo.count({
          where: {
            targetPersonId,
          },
        });

        hasActivity = count > 0;
      }
    } catch (err) {
      this.logger.warn(`[CodeWorkflowAction] hasActivity check error: ${err}`);
    }

    const outputData = (result.data as Record<string, any>) || {};

    const finalHasActivity = hasActivity || Boolean(outputData.hasActivity);

    return {
      result: {
        ...outputData,
        hasActivity: finalHasActivity,
        'hasActivity.boolean': finalHasActivity,
        'hasActivity.string': finalHasActivity ? 'true' : 'false',
      },
    };
  }

  private async persistStepLog({
    workflowRunId,
    workspaceId,
    stepId,
    result,
  }: {
    workflowRunId: string;
    workspaceId: string;
    stepId: string;
    result: LogicFunctionExecuteResult;
  }): Promise<void> {
    try {
      await this.workflowRunStepLogService.setStepLog({
        workflowRunId,
        workspaceId,
        stepId,
        stepLog: buildCodeStepLog(result),
      });
    } catch (error) {
      this.logger.warn(
        `Failed to persist step log for workflowRun=${workflowRunId} step=${stepId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

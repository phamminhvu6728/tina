import { Injectable } from '@nestjs/common';

import { isDefined, resolveInput } from 'twenty-shared/utils';

import { type WorkflowAction } from 'src/modules/workflow/workflow-executor/interfaces/workflow-action.interface';

import { LogicFunctionExecutorService } from 'src/engine/core-modules/logic-function/logic-function-executor/logic-function-executor.service';
import { findFlatEntityByIdInFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-id-in-flat-entity-maps.util';
import { WorkspaceManyOrAllFlatEntityMapsCacheService } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.service';
import {
  WorkflowStepExecutorException,
  WorkflowStepExecutorExceptionCode,
} from 'src/modules/workflow/workflow-executor/exceptions/workflow-step-executor.exception';
import { type WorkflowActionInput } from 'src/modules/workflow/workflow-executor/types/workflow-action-input';
import { type WorkflowActionOutput } from 'src/modules/workflow/workflow-executor/types/workflow-action-output.type';
import { findStepOrThrow } from 'src/modules/workflow/workflow-executor/utils/find-step-or-throw.util';
import { isWorkflowLogicFunctionAction } from 'src/modules/workflow/workflow-executor/workflow-actions/logic-function/guards/is-workflow-logic-function-action.guard';
import { WorkflowLogicFunctionActionInput } from 'src/modules/workflow/workflow-executor/workflow-actions/logic-function/types/workflow-logic-function-action-input.type';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';

@Injectable()
export class LogicFunctionWorkflowAction implements WorkflowAction {
  constructor(
    private readonly logicFunctionExecutorService: LogicFunctionExecutorService,
    private readonly flatEntityMapsCacheService: WorkspaceManyOrAllFlatEntityMapsCacheService,
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

    if (!isWorkflowLogicFunctionAction(step)) {
      throw new WorkflowStepExecutorException(
        'Step is not a logic function action',
        WorkflowStepExecutorExceptionCode.INVALID_STEP_TYPE,
      );
    }

    const workflowActionInput = resolveInput(
      step.settings.input,
      context,
    ) as WorkflowLogicFunctionActionInput;

    const { workspaceId } = runInfo;

    const { flatLogicFunctionMaps } =
      await this.flatEntityMapsCacheService.getOrRecomputeManyOrAllFlatEntityMaps(
        {
          workspaceId,
          flatMapsKeys: ['flatLogicFunctionMaps'],
        },
      );

    const logicFunction = findFlatEntityByIdInFlatEntityMaps({
      flatEntityId: workflowActionInput.logicFunctionId,
      flatEntityMaps: flatLogicFunctionMaps,
    });

    if (!logicFunction) {
      throw new WorkflowStepExecutorException(
        `Logic function with id ${workflowActionInput.logicFunctionId} not found`,
        WorkflowStepExecutorExceptionCode.INVALID_STEP_TYPE,
      );
    }

    if (!isDefined(logicFunction.workflowActionTriggerSettings)) {
      throw new WorkflowStepExecutorException(
        `Logic function ${logicFunction.name} is not exposed as a workflow action`,
        WorkflowStepExecutorExceptionCode.INVALID_STEP_TYPE,
      );
    }

    const result = await this.logicFunctionExecutorService.execute({
      logicFunctionId: workflowActionInput.logicFunctionId,
      workspaceId,
      payload: workflowActionInput.logicFunctionInput,
    });

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
        for (const [key, val] of Object.entries(context)) {
          if (val && typeof val === 'object') {
            const obj = val as any;
            if (obj.recordId && typeof obj.recordId === 'string') {
              targetPersonId = obj.recordId;
              break;
            }
            if (obj.id && typeof obj.id === 'string' && obj.id.length === 36) {
              targetPersonId = obj.id;
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
    } catch {
      // Fallback
    }

    const outputData = (result.data as Record<string, any>) || {};

    let finalHasActivity =
      typeof outputData.hasActivity === 'boolean'
        ? outputData.hasActivity
        : hasActivity;

    if (hasActivity) {
      finalHasActivity = true;
    }

    return {
      result: {
        ...outputData,
        hasActivity: finalHasActivity,
        'hasActivity.boolean': finalHasActivity,
        'hasActivity.string': finalHasActivity ? 'true' : 'false',
      },
    };
  }
}

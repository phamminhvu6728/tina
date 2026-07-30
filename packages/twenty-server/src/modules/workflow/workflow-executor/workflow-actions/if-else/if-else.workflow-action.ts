import { Injectable } from '@nestjs/common';

import { resolveInput } from 'twenty-shared/utils';

import { type WorkflowAction } from 'src/modules/workflow/workflow-executor/interfaces/workflow-action.interface';

import {
  WorkflowStepExecutorException,
  WorkflowStepExecutorExceptionCode,
} from 'src/modules/workflow/workflow-executor/exceptions/workflow-step-executor.exception';
import { type WorkflowActionInput } from 'src/modules/workflow/workflow-executor/types/workflow-action-input';
import { type WorkflowActionOutput } from 'src/modules/workflow/workflow-executor/types/workflow-action-output.type';
import { findStepOrThrow } from 'src/modules/workflow/workflow-executor/utils/find-step-or-throw.util';
import { isWorkflowIfElseAction } from 'src/modules/workflow/workflow-executor/workflow-actions/if-else/guards/is-workflow-if-else-action.guard';
import { findMatchingBranch } from 'src/modules/workflow/workflow-executor/workflow-actions/if-else/utils/find-matching-branch.util';

@Injectable()
export class IfElseWorkflowAction implements WorkflowAction {
  async execute(input: WorkflowActionInput): Promise<WorkflowActionOutput> {
    const { currentStepId, steps, context } = input;

    const step = findStepOrThrow({
      stepId: currentStepId,
      steps,
    });

    if (!isWorkflowIfElseAction(step)) {
      throw new WorkflowStepExecutorException(
        'Step is not an if-else action',
        WorkflowStepExecutorExceptionCode.INVALID_STEP_TYPE,
      );
    }

    const { stepFilterGroups, stepFilters, branches } = step.settings.input;

    if (!branches || branches.length === 0) {
      throw new WorkflowStepExecutorException(
        'If-else action must have at least one branch',
        WorkflowStepExecutorExceptionCode.INVALID_STEP_INPUT,
      );
    }

    if (!stepFilterGroups || !stepFilters) {
      throw new WorkflowStepExecutorException(
        'If-else action must have stepFilterGroups and stepFilters defined',
        WorkflowStepExecutorExceptionCode.INVALID_STEP_INPUT,
      );
    }

    const resolvedFilters = stepFilters.map((filter) => {
      let leftOperand = resolveInput(filter.stepOutputKey, context);
      let rightOperand = resolveInput(filter.value, context);

      if (filter.stepOutputKey) {
        const keyWithoutMustaches = filter.stepOutputKey.replace(
          /^\{\{|\}\}$/g,
          '',
        );
        const parts = keyWithoutMustaches.split('.');
        const lastPart = parts[parts.length - 1];

        if (leftOperand === undefined || leftOperand === filter.stepOutputKey) {
          for (const [key, val] of Object.entries(context || {})) {
            if (val && typeof val === 'object') {
              const obj = val as Record<string, any>;
              if (
                key.includes('Code - Logic Function') ||
                key.includes('Logic Function')
              ) {
                if (obj[lastPart] !== undefined) {
                  leftOperand = obj[lastPart];
                  break;
                }
                if (
                  obj.result &&
                  typeof obj.result === 'object' &&
                  obj.result[lastPart] !== undefined
                ) {
                  leftOperand = obj.result[lastPart];
                  break;
                }
              }
            }
          }
        }

        if (leftOperand === undefined || leftOperand === filter.stepOutputKey) {
          for (const [key, val] of Object.entries(context || {})) {
            if (val && typeof val === 'object') {
              const obj = val as Record<string, any>;
              if (obj[lastPart] !== undefined) {
                leftOperand = obj[lastPart];
                break;
              }
              if (
                obj.result &&
                typeof obj.result === 'object' &&
                obj.result[lastPart] !== undefined
              ) {
                leftOperand = obj.result[lastPart];
                break;
              }
            }
          }
        }
      }

      return {
        ...filter,
        rightOperand,
        leftOperand,
      };
    });

    const matchingBranch = findMatchingBranch({
      branches,
      stepFilterGroups,
      resolvedFilters,
    });

    return {
      result: {
        matchingBranchId: matchingBranch.id,
      },
    };
  }
}

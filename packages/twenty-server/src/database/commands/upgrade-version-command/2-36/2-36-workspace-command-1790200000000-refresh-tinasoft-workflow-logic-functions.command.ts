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
import { v4 as uuidv4 } from 'uuid';

export function repairTinasoftInterviewEmailWorkflowSteps({
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
  const findStepIndex = steps.findIndex(
    (step) => step.type === WorkflowActionType.FIND_RECORDS,
  );
  const sendEmailStepIndex = steps.findIndex(
    (step, index) =>
      index > findStepIndex &&
      step.type === WorkflowActionType.SEND_EMAIL &&
      (/phỏng vấn|chữ ký|ký xác nhận/i.test(step.name) ||
        JSON.stringify(step.settings.input).includes('candidateEmail')),
  );

  if (findStepIndex < 0 || sendEmailStepIndex < 0) {
    return { steps, changed: false };
  }

  const findStep = steps[findStepIndex];
  const sendEmailStep = steps[sendEmailStepIndex];
  const formStepIndex = [...steps.slice(0, findStepIndex)]
    .map((step, index) => ({ step, index }))
    .reverse()
    .find(({ step }) => step.type === WorkflowActionType.FORM)?.index;

  if (formStepIndex === undefined) {
    return { steps, changed: false };
  }

  const formStep = steps[formStepIndex];
  const formSettings = formStep.settings as unknown as {
    input?: unknown;
    outputSchema?: Record<string, unknown>;
  };
  const formInput = Array.isArray(formSettings.input)
    ? [...formSettings.input]
    : [];
  let changed = false;

  for (const field of [
    {
      name: 'signerName',
      label: 'Người ký / Đại diện tuyển dụng',
      placeholder: 'Linh - Trưởng phòng Tuyển dụng',
    },
    {
      name: 'signature',
      label: 'Chữ ký điện tử (URL ảnh hoặc JSON file)',
      placeholder: 'Dán URL ảnh chữ ký hoặc JSON file đã tải lên',
    },
  ]) {
    if (
      !formInput.some(
        (input) =>
          typeof input === 'object' &&
          input !== null &&
          (input as { name?: unknown }).name === field.name,
      )
    ) {
      formInput.push({
        id: uuidv4(),
        name: field.name,
        type: 'TEXT',
        label: field.label,
        placeholder: field.placeholder,
      });
      changed = true;
    }
  }

  const formOutputSchema = { ...(formSettings.outputSchema ?? {}) };
  if (!('signerName' in formOutputSchema)) {
    formOutputSchema.signerName = {
      type: 'TEXT',
      label: 'Người ký / Đại diện tuyển dụng',
      isLeaf: true,
      value: 'Linh - Trưởng phòng Tuyển dụng',
    };
    changed = true;
  }
  if (!('signature' in formOutputSchema)) {
    formOutputSchema.signature = {
      type: 'TEXT',
      label: 'Chữ ký điện tử',
      isLeaf: true,
      value: '',
    };
    changed = true;
  }

  const findSettings = findStep.settings as unknown as {
    input: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
  };
  const findOutputSchema = { ...(findSettings.outputSchema ?? {}) };
  const firstOutput = findOutputSchema.first;
  if (
    typeof firstOutput === 'object' &&
    firstOutput !== null &&
    !Array.isArray(firstOutput) &&
    typeof (firstOutput as { value?: unknown }).value === 'object' &&
    (firstOutput as { value?: unknown }).value !== null
  ) {
    const firstValue = {
      ...((firstOutput as { value: Record<string, unknown> }).value ?? {}),
    };
    const signatureReference = `{{${findStep.id}.first.signature}}`;
    if (firstValue.signature !== signatureReference) {
      firstValue.signature = signatureReference;
      findOutputSchema.first = {
        ...(firstOutput as Record<string, unknown>),
        value: firstValue,
      };
      changed = true;
    }
  }

  const repairedSteps = steps.map((step, index) => {
    if (index === formStepIndex) {
      return {
        ...step,
        settings: {
          ...step.settings,
          input: formInput,
          outputSchema: formOutputSchema,
        },
      } as WorkflowAction;
    }

    if (index === findStepIndex) {
      return {
        ...step,
        settings: {
          ...step.settings,
          outputSchema: findOutputSchema,
        },
        nextStepIds: codeStepIndex >= 0 ? step.nextStepIds : [uuidv4()],
      } as WorkflowAction;
    }

    return step;
  });

  const resolvedFormStep = repairedSteps[formStepIndex];
  const resolvedFindStep = repairedSteps[findStepIndex];
  const resolvedCodeStep =
    codeStepIndex >= 0 ? repairedSteps[codeStepIndex] : undefined;
  const codeId = resolvedCodeStep?.id ?? uuidv4();
  const codeStep = (resolvedCodeStep ?? {
    id: codeId,
    name: 'Xử lý ký duyệt & Gắn chữ ký điện tử vào thư',
    type: WorkflowActionType.CODE,
    valid: true,
    position: {
      x: findStep.position.x,
      y: findStep.position.y + 150,
    },
    settings: {
      input: {
        logicFunctionId,
        logicFunctionInput: {},
      },
      outputSchema: {
        emailBody: {
          type: 'TEXT',
          label: 'Nội dung thư mời (HTML kèm chữ ký)',
          value: '',
          isLeaf: true,
        },
        emailSubject: {
          type: 'TEXT',
          label: 'Tiêu đề email',
          value: '',
          isLeaf: true,
        },
        candidateEmail: {
          type: 'TEXT',
          label: 'Email ứng viên',
          value: '',
          isLeaf: true,
        },
        signatureUrl: {
          type: 'TEXT',
          label: 'Đường dẫn ảnh chữ ký được áp dụng',
          value: '',
          isLeaf: true,
        },
      },
    },
    nextStepIds: [sendEmailStep.id],
  }) as WorkflowAction;

  const codeSettings = codeStep.settings as unknown as {
    input: {
      logicFunctionId: string;
      logicFunctionInput: Record<string, unknown>;
    };
  };
  codeSettings.input.logicFunctionId = logicFunctionId;
  codeSettings.input.logicFunctionInput = {
    ...codeSettings.input.logicFunctionInput,
    candidateName: `{{${resolvedFindStep.id}.first.candidateName}}`,
    candidateEmail: `{{${resolvedFindStep.id}.first.candidateEmail}}`,
    jobTitle: `{{${resolvedFindStep.id}.first.jobTitle}}`,
    interviewer: `{{${resolvedFindStep.id}.first.interviewer}}`,
    dateTime: `{{${resolvedFindStep.id}.first.dateTime}}`,
    meetingLink: `{{${resolvedFindStep.id}.first.meetingLink}}`,
    notes: `{{${resolvedFindStep.id}.first.notes}}`,
    signature: `{{${resolvedFormStep.id}.signature}}`,
    recordSignature: `{{${resolvedFindStep.id}.first.signature}}`,
    signerName: `{{${resolvedFormStep.id}.signerName}}`,
  };

  const updatedFindStep = {
    ...resolvedFindStep,
    nextStepIds: [codeId],
  } as WorkflowAction;
  const updatedSendEmailStep = {
    ...sendEmailStep,
    settings: {
      ...sendEmailStep.settings,
      input: {
        ...sendEmailStep.settings.input,
        subject: `{{${codeId}.emailSubject}}`,
        body: `{{${codeId}.emailBody}}`,
      },
    },
  } as WorkflowAction;

  const normalizedSteps = repairedSteps.map((step, index) => {
    if (index === findStepIndex) return updatedFindStep;
    if (index === sendEmailStepIndex) return updatedSendEmailStep;
    if (step.id === codeId) return codeStep;
    return step;
  });

  if (codeStepIndex < 0) {
    const insertAt = normalizedSteps.findIndex(
      (step) => step.id === sendEmailStep.id,
    );
    normalizedSteps.splice(insertAt, 0, codeStep);
    changed = true;
  } else if (
    JSON.stringify(resolvedCodeStep?.settings) !==
    JSON.stringify(codeStep.settings)
  ) {
    changed = true;
  }

  if (
    JSON.stringify(sendEmailStep.settings) !==
    JSON.stringify(updatedSendEmailStep.settings)
  ) {
    changed = true;
  }

  return { steps: normalizedSteps, changed };
}

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
      const repairedSteps = repairTinasoftInterviewEmailWorkflowSteps({
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
}

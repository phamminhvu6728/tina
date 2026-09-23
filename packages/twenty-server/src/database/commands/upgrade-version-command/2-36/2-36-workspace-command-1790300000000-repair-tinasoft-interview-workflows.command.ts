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
import { repairTinasoftInterviewEmailWorkflowSteps } from 'src/database/commands/upgrade-version-command/2-36/2-36-workspace-command-1790200000000-refresh-tinasoft-workflow-logic-functions.command';
import { type WorkflowVersionWorkspaceEntity } from 'src/modules/workflow/common/standard-objects/workflow-version.workspace-entity';
import { WorkflowActionType } from 'twenty-shared/workflow';
import { v4 as uuidv4 } from 'uuid';

function repairTinasoftScheduleInterviewWorkflowSteps({
  steps,
  logicFunctionId,
}: {
  steps: WorkflowVersionWorkspaceEntity['steps'];
  logicFunctionId: string;
}): { steps: WorkflowVersionWorkspaceEntity['steps']; changed: boolean } {
  if (!Array.isArray(steps)) return { steps, changed: false };

  const formIndex = steps.findIndex(
    (step) => step.type === WorkflowActionType.FORM,
  );
  const calendarIndex = steps.findIndex(
    (step) => step.type === WorkflowActionType.CREATE_CALENDAR_EVENT,
  );
  const createRecordIndex = steps.findIndex(
    (step) => step.type === WorkflowActionType.CREATE_RECORD,
  );
  const sendEmailIndex = steps.findIndex(
    (step, index) =>
      index > createRecordIndex && step.type === WorkflowActionType.SEND_EMAIL,
  );

  if (
    formIndex < 0 ||
    calendarIndex < 0 ||
    createRecordIndex < 0 ||
    sendEmailIndex < 0 ||
    steps.some(
      (step) =>
        step.type === WorkflowActionType.CODE &&
        step.settings.input.logicFunctionId === logicFunctionId,
    )
  ) {
    return { steps, changed: false };
  }

  const formStep = steps[formIndex];
  const formSettings = formStep.settings as unknown as {
    input?: unknown;
    outputSchema?: Record<string, unknown>;
  };
  const formInput = Array.isArray(formSettings.input)
    ? [...formSettings.input]
    : [];
  const formOutputSchema = { ...(formSettings.outputSchema ?? {}) };
  let changed = false;

  for (const field of [
    {
      name: 'signerName',
      label: 'Người ký / Đại diện tuyển dụng',
      placeholder: 'Linh - Trưởng phòng Tuyển dụng',
      value: 'Linh - Trưởng phòng Tuyển dụng',
    },
    {
      name: 'signature',
      label: 'Chữ ký điện tử (URL ảnh hoặc JSON file)',
      placeholder: 'Dán URL ảnh chữ ký hoặc JSON file đã tải lên',
      value: '',
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

    if (!(field.name in formOutputSchema)) {
      formOutputSchema[field.name] = {
        type: 'TEXT',
        label: field.label,
        isLeaf: true,
        value: field.value,
      };
      changed = true;
    }
  }

  const createRecordStep = steps[createRecordIndex];
  const sendEmailStep = steps[sendEmailIndex];
  const codeStepId = uuidv4();
  const formStepId = formStep.id;
  const scheduleStep = steps.find(
    (step) =>
      step.type === WorkflowActionType.CODE &&
      step.settings.input.logicFunctionId !== logicFunctionId,
  );

  if (!scheduleStep) return { steps, changed: false };

  const codeStep = {
    id: codeStepId,
    name: 'Xử lý ký duyệt & Gắn chữ ký điện tử vào thư',
    type: WorkflowActionType.CODE,
    valid: true,
    position: {
      x: createRecordStep.position.x,
      y: createRecordStep.position.y + 150,
    },
    settings: {
      input: {
        logicFunctionId,
        logicFunctionInput: {
          candidateName: `{{${formStepId}.candidateName}}`,
          candidateEmail: `{{${formStepId}.candidateEmail}}`,
          jobTitle: `{{${formStepId}.jobTitle}}`,
          interviewer: `{{${formStepId}.interviewer}}`,
          dateTime: `{{${scheduleStep.id}.startsAt}}`,
          meetingLink: `{{${steps[calendarIndex].id}.conferenceLink}}`,
          notes: `{{${formStepId}.notes}}`,
          signature: `{{${formStepId}.signature}}`,
          signerName: `{{${formStepId}.signerName}}`,
        },
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
        signatureUrl: {
          type: 'TEXT',
          label: 'Đường dẫn ảnh chữ ký được áp dụng',
          value: '',
          isLeaf: true,
        },
      },
    },
    nextStepIds: [sendEmailStep.id],
  } as WorkflowVersionWorkspaceEntity['steps'][number];

  const repairedSteps = steps.map((step, index) => {
    if (index === formIndex) {
      return {
        ...step,
        settings: {
          ...step.settings,
          input: formInput,
          outputSchema: formOutputSchema,
        },
      };
    }
    if (index === createRecordIndex) {
      return { ...step, nextStepIds: [codeStepId] };
    }
    if (index === sendEmailIndex) {
      return {
        ...step,
        settings: {
          ...step.settings,
          input: {
            ...step.settings.input,
            subject: `{{${codeStepId}.emailSubject}}`,
            body: `{{${codeStepId}.emailBody}}`,
          },
        },
      };
    }
    return step;
  });

  repairedSteps.splice(sendEmailIndex, 0, codeStep);
  changed = true;

  return { steps: repairedSteps, changed };
}

@RegisteredWorkspaceCommand('2.36.0', 1790300000000)
@Command({
  name: 'upgrade:2-36:repair-tinasoft-interview-workflows',
  description:
    'Repairs persisted TINASOFT interview workflows by adding the signature processing CODE step and form fields',
})
export class RepairTinasoftInterviewWorkflowsCommand extends ProvisionedWorkspaceCommandRunner {
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
        `[DRY RUN] Would repair TINASOFT interview workflows for workspace ${workspaceId}`,
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
      const repairedSteps = repairTinasoftInterviewWorkflowVersion({
        steps: workflowVersion.steps,
        interviewEmailLogicFunctionId: hrSendInterviewEmail,
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
      `Repaired ${updatedWorkflowVersions.length} TINASOFT interview workflow version(s) for workspace ${workspaceId}`,
    );
  }
}

function repairTinasoftInterviewWorkflowVersion({
  steps,
  interviewEmailLogicFunctionId,
}: {
  steps: WorkflowVersionWorkspaceEntity['steps'];
  interviewEmailLogicFunctionId: string;
}): { steps: WorkflowVersionWorkspaceEntity['steps']; changed: boolean } {
  const emailRepair = repairTinasoftInterviewEmailWorkflowSteps({
    steps,
    logicFunctionId: interviewEmailLogicFunctionId,
  });

  if (emailRepair.changed) return emailRepair;

  return repairTinasoftScheduleInterviewWorkflowSteps({
    steps,
    logicFunctionId: interviewEmailLogicFunctionId,
  });
}

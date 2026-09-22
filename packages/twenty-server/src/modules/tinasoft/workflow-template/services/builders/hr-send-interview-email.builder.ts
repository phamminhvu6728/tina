import { Injectable } from '@nestjs/common';
import { type I18n } from '@lingui/core';
import { v4 as uuidv4 } from 'uuid';

import { WorkflowActionType } from 'twenty-shared/workflow';

import { WorkflowTemplateDTO } from 'src/modules/tinasoft/workflow-template/api/dtos/workflow-template.dto';
import { IWorkflowTemplateBuilder } from 'src/modules/tinasoft/workflow-template/services/builders/workflow-template.builder.interface';
import {
  type WorkflowTemplateBuildContext,
  type WorkflowTemplateDefinition,
} from 'src/modules/tinasoft/workflow-template/types/workflow-template.type';
import { ERROR_HANDLING_OPTIONS } from 'src/modules/tinasoft/workflow-template/utils/workflow-template-builder-helpers.util';
import { WorkflowTriggerType } from 'src/modules/workflow/workflow-trigger/types/workflow-trigger.type';

@Injectable()
export class HrSendInterviewEmailWorkflowTemplateBuilder
  implements IWorkflowTemplateBuilder
{
  readonly id = 'hr-send-interview-email' as const;

  getDTO(_workspaceDisplayName: string, _i18n?: I18n): WorkflowTemplateDTO {
    return {
      id: this.id,
      name: 'Gửi email ký xác nhận phỏng vấn',
      description:
        'Chọn một hồ sơ phỏng vấn đã có sẵn, hệ thống lấy thông tin ứng viên (email, CC, BCC) và chữ ký tải lên trong hồ sơ rồi gửi email xác nhận kèm chữ ký.',
      shortDescription:
        'Gửi email xác nhận phỏng vấn kèm chữ ký từ hồ sơ phỏng vấn đã chọn.',
      purpose:
        'Tách bước gửi email xác nhận ra khỏi bước lên lịch: HR chọn hồ sơ phỏng vấn và hệ thống tự động soạn thư với CC/BCC và chữ ký đã cấu hình trong hồ sơ.',
      category: 'Tuyển dụng & HR',
      icon: 'IconMail',
      requiredSettings: [],
    };
  }

  build(_context: WorkflowTemplateBuildContext): WorkflowTemplateDefinition {
    const formStepId = uuidv4();
    const findStepId = uuidv4();
    const codeStepId = uuidv4();
    const sendEmailStepId = uuidv4();

    return {
      workflowName: 'HR: Gửi email ký xác nhận phỏng vấn',
      trigger: {
        name: 'Khởi chạy thủ công',
        type: WorkflowTriggerType.MANUAL,
        settings: {
          outputSchema: {},
          icon: 'IconMail',
          availability: { type: 'GLOBAL', locations: undefined },
        },
        position: { x: 0, y: 0 },
        nextStepIds: [formStepId],
      },
      steps: [
        {
          id: formStepId,
          name: 'Chọn hồ sơ & Người ký duyệt',
          type: WorkflowActionType.FORM,
          valid: true,
          position: { x: 0, y: 150 },
          settings: {
            input: [
              {
                id: uuidv4(),
                name: 'interview',
                type: 'RECORD',
                label: 'Hồ sơ phỏng vấn',
                settings: { objectName: 'interview' },
              },
              {
                id: uuidv4(),
                name: 'signerName',
                type: 'TEXT',
                label: 'Người ký / Đại diện tuyển dụng',
                placeholder: 'Linh - Trưởng phòng Tuyển dụng',
              },
            ],
            outputSchema: {
              interview: {
                type: 'RECORD',
                label: 'Hồ sơ phỏng vấn',
                isLeaf: true,
                value: {
                  id: `{{${formStepId}.interview.id}}`,
                },
              },
              signerName: {
                type: 'TEXT',
                label: 'Người ký / Đại diện tuyển dụng',
                isLeaf: true,
                value: 'Linh - Trưởng phòng Tuyển dụng',
              },
            },
            errorHandlingOptions: ERROR_HANDLING_OPTIONS,
          },
          nextStepIds: [findStepId],
        },
        {
          id: findStepId,
          name: 'Lấy thông tin hồ sơ phỏng vấn',
          type: WorkflowActionType.FIND_RECORDS,
          valid: true,
          position: { x: 0, y: 300 },
          settings: {
            input: {
              objectName: 'interview',
              limit: 1,
              filter: {
                recordFilters: [
                  {
                    fieldMetadataId: 'id',
                    type: 'UUID',
                    value: `{{${formStepId}.interview.id}}`,
                    operand: 'IS',
                  },
                ],
              },
            },
            outputSchema: {
              first: {
                type: 'RECORD',
                fieldName: 'first',
                isLeaf: false,
                value: {
                  id: `{{${findStepId}.first.id}}`,
                  candidateName: `{{${findStepId}.first.candidateName}}`,
                  candidateEmail: `{{${findStepId}.first.candidateEmail}}`,
                  jobTitle: `{{${findStepId}.first.jobTitle}}`,
                  interviewer: `{{${findStepId}.first.interviewer}}`,
                  dateTime: `{{${findStepId}.first.dateTime}}`,
                  timeZone: `{{${findStepId}.first.timeZone}}`,
                  meetingLink: `{{${findStepId}.first.meetingLink}}`,
                  notes: `{{${findStepId}.first.notes}}`,
                  signature: `{{${findStepId}.first.signature}}`,
                  cc: `{{${findStepId}.first.cc}}`,
                  bcc: `{{${findStepId}.first.bcc}}`,
                },
              },
            },
            errorHandlingOptions: ERROR_HANDLING_OPTIONS,
          },
          nextStepIds: [codeStepId],
        },
        {
          id: codeStepId,
          name: 'Xử lý ký duyệt & Gắn chữ ký điện tử vào thư',
          type: WorkflowActionType.CODE,
          valid: true,
          position: { x: 0, y: 450 },
          settings: {
            input: {
              logicFunctionId: 'd3a17e84-5f6b-4c91-a2e3-b78901234567',
              logicFunctionInput: {
                candidateName: `{{${findStepId}.first.candidateName}}`,
                candidateEmail: `{{${findStepId}.first.candidateEmail}}`,
                jobTitle: `{{${findStepId}.first.jobTitle}}`,
                interviewer: `{{${findStepId}.first.interviewer}}`,
                dateTime: `{{${findStepId}.first.dateTime}}`,
                meetingLink: `{{${findStepId}.first.meetingLink}}`,
                notes: `{{${findStepId}.first.notes}}`,
                signature: `{{${findStepId}.first.signature}}`,
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
              candidateName: {
                type: 'TEXT',
                label: 'Tên ứng viên',
                value: '',
                isLeaf: true,
              },
              candidateEmail: {
                type: 'TEXT',
                label: 'Email ứng viên',
                value: '',
                isLeaf: true,
              },
              signerName: {
                type: 'TEXT',
                label: 'Người ký duyệt',
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
            errorHandlingOptions: ERROR_HANDLING_OPTIONS,
          },
          nextStepIds: [sendEmailStepId],
        },
        {
          id: sendEmailStepId,
          name: 'Gửi Email thư mời phỏng vấn & Chữ ký xác nhận',
          type: WorkflowActionType.SEND_EMAIL,
          valid: true,
          position: { x: 0, y: 600 },
          settings: {
            input: {
              connectedAccountId: '',
              recipients: {
                to: `{{${findStepId}.first.candidateEmail}}`,
                cc: `{{${findStepId}.first.cc}}`,
                bcc: `{{${findStepId}.first.bcc}}`,
              },
              subject: `{{${codeStepId}.emailSubject}}`,
              body: `{{${codeStepId}.emailBody}}`,
              files: [],
            },
            outputSchema: {
              result: {
                type: 'RECORD',
                fieldName: 'result',
                isLeaf: true,
              },
            },
            errorHandlingOptions: ERROR_HANDLING_OPTIONS,
          },
        },
      ],
    };
  }
}
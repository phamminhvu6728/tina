import { Injectable } from '@nestjs/common';
import { type I18n } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { v4 as uuidv4 } from 'uuid';

import { FieldMetadataType } from 'twenty-shared/types';
import { WorkflowActionType } from 'twenty-shared/workflow';

import { WorkflowTemplateDTO } from 'src/modules/tinasoft/workflow-template/api/dtos/workflow-template.dto';
import { getWorkflowTemplateLogicFunctionIds } from 'src/modules/tinasoft/workflow-template/catalog/workflow-template-logic-functions.constant';
import { IWorkflowTemplateBuilder } from 'src/modules/tinasoft/workflow-template/services/builders/workflow-template.builder.interface';
import {
  type WorkflowTemplateBuildContext,
  type WorkflowTemplateDefinition,
} from 'src/modules/tinasoft/workflow-template/types/workflow-template.type';
import { ERROR_HANDLING_OPTIONS } from 'src/modules/tinasoft/workflow-template/utils/workflow-template-builder-helpers.util';
import { getStringWorkflowTemplateSetting } from 'src/modules/tinasoft/workflow-template/utils/workflow-template-settings.util';
import { WorkflowTriggerType } from 'src/modules/workflow/workflow-trigger/types/workflow-trigger.type';

@Injectable()
export class HrScheduleInterviewWorkflowTemplateBuilder implements IWorkflowTemplateBuilder {
  readonly id = 'hr-schedule-interview' as const;

  getDTO(_workspaceDisplayName: string, i18n?: I18n): WorkflowTemplateDTO {
    return {
      id: this.id,
      name: 'Lên lịch phỏng vấn & tạo link Google Meet (Kèm chữ ký)',
      description:
        'HR nhập thông tin buổi phỏng vấn (ứng viên, email, CC, BCC, vị trí, người phỏng vấn, người ký, ngày và khung giờ bắt đầu/kết thúc), hệ thống kiểm tra hợp lệ và tự động tạo sự kiện Google Calendar kèm link Google Meet, lưu hồ sơ phỏng vấn và gửi thư mời có khối chữ ký điện tử xác nhận cho ứng viên cùng CC/BCC.',
      shortDescription:
        'Xếp lịch phỏng vấn, tự động sinh link Google Meet và gửi email thư mời kèm chữ ký điện tử trong 1 workflow duy nhất.',
      purpose:
        'Rút gọn quy trình thành 1 bước duy nhất: tự động sinh link Meet, lưu CRM và gửi thư mời có kèm chữ ký điện tử chuyên nghiệp.',
      category: 'Tuyển dụng & HR',
      icon: 'IconCalendarEvent',
      requiredSettings: [
        {
          key: 'pmEmail',
          type: 'email',
          label:
            i18n?._(msg`PM / HR notification email`) ??
            'Email PM / Người nhận thông báo',
          defaultValue: 'tuyendung@tinasoft.vn',
        },
      ],
    };
  }

  build({
    settings,
    workspaceId,
  }: WorkflowTemplateBuildContext): WorkflowTemplateDefinition {
    const formStepId = uuidv4();
    const interviewScheduleStepId = uuidv4();
    const calendarEventStepId = uuidv4();
    const createRecordStepId = uuidv4();
    const signatureStepId = uuidv4();
    const sendEmailStepId = uuidv4();
    const { interviewSchedule, hrSendInterviewEmail } =
      getWorkflowTemplateLogicFunctionIds(workspaceId);
    const pmEmail =
      getStringWorkflowTemplateSetting({ settings, key: 'pmEmail' }) ||
      'tuyendung@tinasoft.vn';

    return {
      workflowName: 'HR: Lên lịch phỏng vấn & tạo link Google Meet',
      trigger: {
        name: 'Khởi chạy thủ công',
        type: WorkflowTriggerType.MANUAL,
        settings: {
          outputSchema: {},
          icon: 'IconCalendarEvent',
          availability: { type: 'GLOBAL', locations: undefined },
        },
        position: { x: 0, y: 0 },
        nextStepIds: [formStepId],
      },
      steps: [
        {
          id: formStepId,
          name: 'Biểu mẫu lên lịch phỏng vấn',
          type: WorkflowActionType.FORM,
          valid: true,
          position: { x: 0, y: 150 },
          settings: {
            input: [
              {
                id: uuidv4(),
                name: 'candidateName',
                type: FieldMetadataType.TEXT,
                label: 'Tên ứng viên',
                placeholder: 'Nguyen Van A',
              },
              {
                id: uuidv4(),
                name: 'candidateEmail',
                type: FieldMetadataType.TEXT,
                label: 'Email ứng viên',
                placeholder: 'candidate@example.vn',
              },
              {
                id: uuidv4(),
                name: 'jobTitle',
                type: FieldMetadataType.TEXT,
                label: 'Vị trí phỏng vấn',
                placeholder: 'NodeJS Developer',
              },
              {
                id: uuidv4(),
                name: 'interviewer',
                type: FieldMetadataType.TEXT,
                label: 'Người phỏng vấn',
                placeholder: 'Tên người phỏng vấn (kèm email nếu cần)',
              },
              {
                id: uuidv4(),
                name: 'interviewDate',
                type: FieldMetadataType.DATE,
                label: 'Ngày phỏng vấn',
                placeholder: '2026-09-20',
              },
              {
                id: uuidv4(),
                name: 'startHour',
                type: FieldMetadataType.NUMBER,
                label: 'Giờ bắt đầu (0-23)',
                placeholder: '10',
              },
              {
                id: uuidv4(),
                name: 'startMinute',
                type: FieldMetadataType.NUMBER,
                label: 'Phút bắt đầu (0-59)',
                placeholder: '0',
              },
              {
                id: uuidv4(),
                name: 'endHour',
                type: FieldMetadataType.NUMBER,
                label: 'Giờ kết thúc (0-23)',
                placeholder: '11',
              },
              {
                id: uuidv4(),
                name: 'endMinute',
                type: FieldMetadataType.NUMBER,
                label: 'Phút kết thúc (0-59)',
                placeholder: '0',
              },
              {
                id: uuidv4(),
                name: 'notes',
                type: FieldMetadataType.TEXT,
                label: 'Ghi chú phỏng vấn',
                settings: {
                  minRows: 4,
                  maxRows: 8,
                },
              },
              {
                id: uuidv4(),
                name: 'cc',
                type: FieldMetadataType.TEXT,
                label: 'CC (Email nhận kèm)',
                placeholder: 'tuyendung@tinasoft.vn, pm@tinasoft.vn',
              },
              {
                id: uuidv4(),
                name: 'bcc',
                type: FieldMetadataType.TEXT,
                label: 'BCC (Email ẩn danh)',
                placeholder: 'hr-archive@tinasoft.vn',
              },
              {
                id: uuidv4(),
                name: 'signerName',
                type: FieldMetadataType.TEXT,
                label: 'Người ký / Đại diện tuyển dụng',
                placeholder: 'Linh - Trưởng phòng Tuyển dụng',
              },
              {
                id: uuidv4(),
                name: 'signature',
                type: FieldMetadataType.TEXT,
                label: 'Chữ ký điện tử (URL ảnh hoặc JSON file)',
                placeholder: 'Dán URL ảnh chữ ký hoặc JSON file đã tải lên',
              },
            ],
            outputSchema: {
              candidateName: {
                type: FieldMetadataType.TEXT,
                label: 'Tên ứng viên',
                isLeaf: true,
                value: 'Nguyen Van A',
              },
              candidateEmail: {
                type: FieldMetadataType.TEXT,
                label: 'Email ứng viên',
                isLeaf: true,
                value: 'candidate@example.vn',
              },
              jobTitle: {
                type: FieldMetadataType.TEXT,
                label: 'Vị trí phỏng vấn',
                isLeaf: true,
                value: 'NodeJS Developer',
              },
              interviewer: {
                type: FieldMetadataType.TEXT,
                label: 'Người phỏng vấn',
                isLeaf: true,
                value: 'HR Interviewer',
              },
              interviewDate: {
                type: FieldMetadataType.DATE,
                label: 'Ngày phỏng vấn',
                isLeaf: true,
                value: '2026-09-20',
              },
              startHour: {
                type: FieldMetadataType.NUMBER,
                label: 'Giờ bắt đầu (0-23)',
                isLeaf: true,
                value: 10,
              },
              startMinute: {
                type: FieldMetadataType.NUMBER,
                label: 'Phút bắt đầu (0-59)',
                isLeaf: true,
                value: 0,
              },
              endHour: {
                type: FieldMetadataType.NUMBER,
                label: 'Giờ kết thúc (0-23)',
                isLeaf: true,
                value: 11,
              },
              endMinute: {
                type: FieldMetadataType.NUMBER,
                label: 'Phút kết thúc (0-59)',
                isLeaf: true,
                value: 0,
              },
              notes: {
                type: FieldMetadataType.TEXT,
                label: 'Ghi chú phỏng vấn',
                isLeaf: true,
                value: 'Phỏng vấn vòng 1',
              },
              cc: {
                type: FieldMetadataType.TEXT,
                label: 'CC (Email nhận kèm)',
                isLeaf: true,
                value: pmEmail,
              },
              bcc: {
                type: FieldMetadataType.TEXT,
                label: 'BCC (Email ẩn danh)',
                isLeaf: true,
                value: '',
              },
              signerName: {
                type: FieldMetadataType.TEXT,
                label: 'Người ký / Đại diện tuyển dụng',
                isLeaf: true,
                value: 'Linh - Trưởng phòng Tuyển dụng',
              },
              signature: {
                type: FieldMetadataType.TEXT,
                label: 'Chữ ký điện tử',
                isLeaf: true,
                value: '',
              },
            },
            errorHandlingOptions: ERROR_HANDLING_OPTIONS,
          },
          nextStepIds: [interviewScheduleStepId],
        },
        {
          id: interviewScheduleStepId,
          name: 'Kiểm tra & dựng khung giờ phỏng vấn',
          type: WorkflowActionType.CODE,
          valid: true,
          position: { x: 0, y: 300 },
          settings: {
            input: {
              logicFunctionId: interviewSchedule,
              logicFunctionInput: {
                interviewDate: `{{${formStepId}.interviewDate}}`,
                startHour: `{{${formStepId}.startHour}}`,
                startMinute: `{{${formStepId}.startMinute}}`,
                endHour: `{{${formStepId}.endHour}}`,
                endMinute: `{{${formStepId}.endMinute}}`,
              },
            },
            outputSchema: {
              interviewDate: {
                type: FieldMetadataType.TEXT,
                label: 'Ngày phỏng vấn',
                isLeaf: true,
                value: '2026-09-20',
              },
              startHour: {
                type: FieldMetadataType.NUMBER,
                label: 'Giờ bắt đầu',
                isLeaf: true,
                value: 10,
              },
              startMinute: {
                type: FieldMetadataType.NUMBER,
                label: 'Phút bắt đầu',
                isLeaf: true,
                value: 0,
              },
              endHour: {
                type: FieldMetadataType.NUMBER,
                label: 'Giờ kết thúc',
                isLeaf: true,
                value: 11,
              },
              endMinute: {
                type: FieldMetadataType.NUMBER,
                label: 'Phút kết thúc',
                isLeaf: true,
                value: 0,
              },
              startTime: {
                type: FieldMetadataType.TEXT,
                label: 'Thời gian bắt đầu',
                isLeaf: true,
                value: '10:00',
              },
              endTime: {
                type: FieldMetadataType.TEXT,
                label: 'Thời gian kết thúc',
                isLeaf: true,
                value: '11:00',
              },
              timeZone: {
                type: FieldMetadataType.TEXT,
                label: 'Time Zone',
                isLeaf: true,
                value: 'Asia/Ho_Chi_Minh',
              },
              startsAt: {
                type: FieldMetadataType.TEXT,
                label: 'Starts At (ISO)',
                isLeaf: true,
                value: '2026-09-20T10:00:00+07:00',
              },
              endsAt: {
                type: FieldMetadataType.TEXT,
                label: 'Ends At (ISO)',
                isLeaf: true,
                value: '2026-09-20T11:00:00+07:00',
              },
            },
            errorHandlingOptions: ERROR_HANDLING_OPTIONS,
          },
          nextStepIds: [calendarEventStepId],
        },
        {
          id: calendarEventStepId,
          name: 'Tạo sự kiện Google Calendar & Google Meet',
          type: WorkflowActionType.CREATE_CALENDAR_EVENT,
          valid: true,
          position: { x: 0, y: 450 },
          settings: {
            input: {
              connectedAccountId: '',
              title: `Phỏng vấn {{${formStepId}.candidateName}} - {{${formStepId}.jobTitle}}`,
              description: `Phỏng vấn {{${formStepId}.jobTitle}} vào {{${formStepId}.interviewDate}} ({{${interviewScheduleStepId}.startTime}} → {{${interviewScheduleStepId}.endTime}}). Người phỏng vấn: {{${formStepId}.interviewer}}. Ghi chú: {{${formStepId}.notes}}`,
              startsAt: `{{${interviewScheduleStepId}.startsAt}}`,
              endsAt: `{{${interviewScheduleStepId}.endsAt}}`,
              isFullDay: false,
              timeZone: 'Asia/Ho_Chi_Minh',
              attendees: `{{${formStepId}.candidateEmail}}`,
              sendInvitations: true,
              addConferencing: true,
            },
            outputSchema: {
              iCalUid: {
                type: FieldMetadataType.TEXT,
                label: 'iCal UID',
                isLeaf: true,
                value: '',
              },
              externalEventId: {
                type: FieldMetadataType.TEXT,
                label: 'Google Event ID',
                isLeaf: true,
                value: '',
              },
              title: {
                type: FieldMetadataType.TEXT,
                label: 'Title',
                isLeaf: true,
                value: 'Interview event',
              },
              startsAt: {
                type: FieldMetadataType.TEXT,
                label: 'Starts At',
                isLeaf: true,
                value: '2026-09-20T10:00:00Z',
              },
              endsAt: {
                type: FieldMetadataType.TEXT,
                label: 'Ends At',
                isLeaf: true,
                value: '2026-09-20T11:00:00Z',
              },
              conferenceLink: {
                type: FieldMetadataType.TEXT,
                label: 'Google Meet Link',
                isLeaf: true,
                value: 'https://meet.google.com/xxx-xxxx-xxx',
              },
              attendeeCount: {
                type: FieldMetadataType.NUMBER,
                label: 'Attendee Count',
                isLeaf: true,
                value: 1,
              },
              connectedAccountId: {
                type: FieldMetadataType.TEXT,
                label: 'Connected Account ID',
                isLeaf: true,
                value: '',
              },
            },
            errorHandlingOptions: ERROR_HANDLING_OPTIONS,
          },
          nextStepIds: [createRecordStepId],
        },
        {
          id: createRecordStepId,
          name: 'Lưu phiên phỏng vấn trên CRM',
          type: WorkflowActionType.CREATE_RECORD,
          valid: true,
          position: { x: 0, y: 600 },
          settings: {
            input: {
              objectName: 'interview',
              objectRecord: {
                name: `Phỏng vấn {{${formStepId}.candidateName}} - {{${formStepId}.jobTitle}}`,
                candidateName: `{{${formStepId}.candidateName}}`,
                candidateEmail: `{{${formStepId}.candidateEmail}}`,
                jobTitle: `{{${formStepId}.jobTitle}}`,
                interviewer: `{{${formStepId}.interviewer}}`,
                dateTime: `{{${interviewScheduleStepId}.startsAt}}`,
                meetingLink: `{{${calendarEventStepId}.conferenceLink}}`,
                status: 'SCHEDULED',
                notes: `{{${formStepId}.notes}}`,
                cc: `{{${formStepId}.cc}}`,
                bcc: `{{${formStepId}.bcc}}`,
              },
            },
            outputSchema: {
              id: {
                type: FieldMetadataType.TEXT,
                label: 'Interview ID',
                isLeaf: true,
                value: '',
              },
            },
            errorHandlingOptions: ERROR_HANDLING_OPTIONS,
          },
          nextStepIds: [signatureStepId],
        },
        {
          id: signatureStepId,
          name: 'Xử lý ký duyệt & Gắn chữ ký điện tử vào thư',
          type: WorkflowActionType.CODE,
          valid: true,
          position: { x: 0, y: 750 },
          settings: {
            input: {
              logicFunctionId: hrSendInterviewEmail,
              logicFunctionInput: {
                candidateName: `{{${formStepId}.candidateName}}`,
                candidateEmail: `{{${formStepId}.candidateEmail}}`,
                jobTitle: `{{${formStepId}.jobTitle}}`,
                interviewer: `{{${formStepId}.interviewer}}`,
                dateTime: `{{${interviewScheduleStepId}.startsAt}}`,
                meetingLink: `{{${calendarEventStepId}.conferenceLink}}`,
                notes: `{{${formStepId}.notes}}`,
                signature: `{{${formStepId}.signature}}`,
                signerName: `{{${formStepId}.signerName}}`,
              },
            },
            outputSchema: {
              emailBody: {
                type: FieldMetadataType.TEXT,
                label: 'Nội dung thư mời (HTML kèm chữ ký)',
                value: '',
                isLeaf: true,
              },
              emailSubject: {
                type: FieldMetadataType.TEXT,
                label: 'Tiêu đề email',
                value: '',
                isLeaf: true,
              },
              candidateEmail: {
                type: FieldMetadataType.TEXT,
                label: 'Email ứng viên',
                value: '',
                isLeaf: true,
              },
              signatureUrl: {
                type: FieldMetadataType.TEXT,
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
          name: 'Gửi Email thư mời phỏng vấn',
          type: WorkflowActionType.SEND_EMAIL,
          valid: true,
          position: { x: 0, y: 900 },
          settings: {
            input: {
              connectedAccountId: '',
              recipients: {
                to: `{{${formStepId}.candidateEmail}}`,
                cc: `{{${formStepId}.cc}}`,
                bcc: `{{${formStepId}.bcc}}`,
              },
              subject: `{{${signatureStepId}.emailSubject}}`,
              body: `{{${signatureStepId}.emailBody}}`,
              files: [],
              inReplyTo: '',
            },
            outputSchema: {},
            errorHandlingOptions: ERROR_HANDLING_OPTIONS,
          },
          nextStepIds: [],
        },
      ],
    };
  }
}

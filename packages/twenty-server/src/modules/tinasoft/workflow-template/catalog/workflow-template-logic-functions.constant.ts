import { v5 as uuidv5 } from 'uuid';

import { type PrefilledWorkflowCodeStepLogicFunctionDefinition } from 'src/engine/workspace-manager/standard-objects-prefill-data/utils/prefill-workflow-code-step-logic-functions.util';

const WORKFLOW_TEMPLATE_LOGIC_FUNCTION_NAMESPACE =
  '3dac99a2-34f7-4e76-a6d3-4ce4d0cddbbc';

const FILTER_EXPIRING_OPPORTUNITIES_SOURCE = `export const main = async (params) => {
  const opportunities = Array.isArray(params?.opportunities)
    ? params.opportunities
    : [];
  const daysBeforeExpiry = Number(params?.daysBeforeExpiry);

  if (!Number.isInteger(daysBeforeExpiry) || daysBeforeExpiry < 1) {
    return { opportunities: [] };
  }

  const targetDate = new Date();
  targetDate.setUTCHours(0, 0, 0, 0);
  targetDate.setUTCDate(targetDate.getUTCDate() + daysBeforeExpiry);
  const targetDateString = targetDate.toISOString().slice(0, 10);

  return {
    opportunities: opportunities.filter((opportunity) => {
      if (typeof opportunity?.closeDate !== 'string') {
        return false;
      }

      const closeDate = new Date(opportunity.closeDate);

      return (
        !Number.isNaN(closeDate.getTime()) &&
        closeDate.toISOString().slice(0, 10) === targetDateString
      );
    }),
  };
};`;

const CHECK_REPURCHASE_REMINDER_SOURCE = `export const main = async (params) => {
  const opportunities = Array.isArray(params?.opportunities)
    ? params.opportunities
    : [];
  const openOpportunities = Array.isArray(params?.openOpportunities)
    ? params.openOpportunities
    : [];
  const repurchaseDays = Number(params?.repurchaseDays);
  const company = params?.company;
  const opportunity = opportunities
    .filter((item) => typeof item?.closeDate === 'string')
    .sort((left, right) => right.closeDate.localeCompare(left.closeDate))[0];

  if (
    !opportunity ||
    openOpportunities.length > 0 ||
    !Number.isInteger(repurchaseDays) ||
    repurchaseDays < 1
  ) {
    return {
      shouldCreateReminder: false,
      daysSinceLastOrder: 0,
      assigneeId: '',
      reminders: [],
    };
  }

  const closeDate = new Date(opportunity.closeDate);

  if (Number.isNaN(closeDate.getTime())) {
    return {
      shouldCreateReminder: false,
      daysSinceLastOrder: 0,
      assigneeId: '',
      reminders: [],
    };
  }

  closeDate.setUTCHours(0, 0, 0, 0);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const daysSinceLastOrder = Math.floor((today.getTime() - closeDate.getTime()) / 86400000);
  const assigneeId =
    typeof company?.accountOwnerId === 'string' ? company.accountOwnerId : '';
  const companyId = typeof company?.id === 'string' ? company.id : '';
  const companyName = typeof company?.name === 'string' ? company.name : '';
  const shouldCreateReminder =
    daysSinceLastOrder === repurchaseDays && assigneeId !== '' && companyId !== '';

  return {
    shouldCreateReminder,
    daysSinceLastOrder,
    assigneeId,
    reminders: shouldCreateReminder
      ? [{ companyId, companyName, daysSinceLastOrder, assigneeId }]
      : [],
  };
};`;

const FILTER_TODAYS_BIRTHDAYS_SOURCE = `export const main = async (params) => {
  const people = Array.isArray(params?.people) ? params.people : [];
  const today = new Date();
  const month = today.getUTCMonth() + 1;
  const day = today.getUTCDate();

  return {
    people: people.filter((person) => {
      const birthday = person?.birthday;
      const primaryEmail = person?.emails?.primaryEmail;

      if (
        typeof birthday !== 'string' ||
        typeof primaryEmail !== 'string' ||
        primaryEmail.trim() === ''
      ) {
        return false;
      }

      const birthdayMatch = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(birthday);

      if (!birthdayMatch) {
        return false;
      }

      const year = Number(birthdayMatch[1]);
      const birthdayMonth = Number(birthdayMatch[2]);
      const birthdayDay = Number(birthdayMatch[3]);
      const daysInMonth = [
        31,
        year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
      ];

      return (
        year > 0 &&
        birthdayMonth >= 1 &&
        birthdayMonth <= 12 &&
        birthdayDay >= 1 &&
        birthdayDay <= daysInMonth[birthdayMonth - 1] &&
        birthdayMonth === month &&
        birthdayDay === day
      );
    }),
  };
};`;

const ADD_ONE_DAY_SOURCE = `export const main = async (params) => {
  const createdAt = typeof params?.createdAt === 'string' ? params.createdAt : '';
  const createdAtDate = new Date(createdAt);

  if (Number.isNaN(createdAtDate.getTime())) {
    return { dueAt: '' };
  }

  createdAtDate.setUTCDate(createdAtDate.getUTCDate() + 1);

  return { dueAt: createdAtDate.toISOString() };
};`;

export const getWorkflowTemplateLogicFunctionIds = (workspaceId: string) => ({
  filterExpiringOpportunities: uuidv5(
    `${workspaceId}:workflow-template:filter-expiring-opportunities:v2`,
    WORKFLOW_TEMPLATE_LOGIC_FUNCTION_NAMESPACE,
  ),
  checkRepurchaseReminder: uuidv5(
    `${workspaceId}:workflow-template:check-repurchase-reminder:v2`,
    WORKFLOW_TEMPLATE_LOGIC_FUNCTION_NAMESPACE,
  ),
  filterTodaysBirthdays: uuidv5(
    `${workspaceId}:workflow-template:filter-todays-birthdays`,
    WORKFLOW_TEMPLATE_LOGIC_FUNCTION_NAMESPACE,
  ),
  addOneDay: uuidv5(
    `${workspaceId}:workflow-template:add-one-day`,
    WORKFLOW_TEMPLATE_LOGIC_FUNCTION_NAMESPACE,
  ),
});

export const getWorkflowTemplateLogicFunctionDefinitions = (
  workspaceId: string,
): PrefilledWorkflowCodeStepLogicFunctionDefinition[] => {
  const {
    filterExpiringOpportunities,
    checkRepurchaseReminder,
    filterTodaysBirthdays,
    addOneDay,
  } = getWorkflowTemplateLogicFunctionIds(workspaceId);

  return [
    {
      id: filterExpiringOpportunities,
      name: 'Filter opportunities expiring on target day',
      description:
        'Keeps opportunities whose close date is exactly the configured number of days from today.',
      sourceHandlerCode: FILTER_EXPIRING_OPPORTUNITIES_SOURCE,
    },
    {
      id: checkRepurchaseReminder,
      name: 'Check re-purchase reminder threshold',
      description:
        'Calculates the elapsed days since the last completed opportunity and selects the company owner.',
      sourceHandlerCode: CHECK_REPURCHASE_REMINDER_SOURCE,
    },
    {
      id: filterTodaysBirthdays,
      name: "Find today's VIP birthdays",
      description:
        'Keeps VIP and VVIP people whose birthday is today and who have a primary email address.',
      sourceHandlerCode: FILTER_TODAYS_BIRTHDAYS_SOURCE,
    },
    {
      id: addOneDay,
      name: 'Add one day to a date',
      description: 'Adds one calendar day to an ISO date-time value.',
      sourceHandlerCode: ADD_ONE_DAY_SOURCE,
    },
  ];
};

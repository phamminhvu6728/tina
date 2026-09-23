import { Command } from 'nest-commander';

import { ProvisionedWorkspaceCommandRunner } from 'src/database/commands/command-runners/provisioned-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { PrefillLogicFunctionService } from 'src/engine/workspace-manager/standard-objects-prefill-data/services/prefill-logic-function.service';
import { getWorkflowTemplateLogicFunctionDefinitions } from 'src/modules/tinasoft/workflow-template/catalog/workflow-template-logic-functions.constant';

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

    this.logger.log(
      `Refreshed TINASOFT workflow logic functions for workspace ${workspaceId}`,
    );
  }
}

import { styled } from '@linaria/react';
import { Fragment, type ReactNode } from 'react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledContainer = styled.div`
  background: ${themeCssVariables.background.secondary};
  border-top: 1px solid ${themeCssVariables.border.color.light};
  bottom: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 100%;
`;

const StyledActionsRow = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: flex-end;
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
  width: 100%;
`;

type SidePanelFooterProps = {
  actions: React.ReactNode[];
  disclaimer?: ReactNode;
};

export const SidePanelFooter = ({
  actions,
  disclaimer,
}: SidePanelFooterProps) => {
  return (
    <StyledContainer>
      {disclaimer}
      <StyledActionsRow>
        {actions.map((action, index) => (
          <Fragment key={index}>{action}</Fragment>
        ))}
      </StyledActionsRow>
    </StyledContainer>
  );
};

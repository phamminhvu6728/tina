import { DEFAULT_WORKSPACE_LOGO } from '@/constants/DefaultWorkspaceLogo';
import { Img } from '@react-email/components';

const logoStyle = {
  marginBottom: '40px',
};

export const Logo = () => {
  return (
    <Img
      src={DEFAULT_WORKSPACE_LOGO}
      alt="Tina CRM logo"
      width="40"
      height="40"
      style={logoStyle}
    />
  );
};

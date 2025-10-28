import {
    CallToActionContainer,
    LinkNextToCTA,
    StyledButton,
} from '@/app/_components/ui/layout/header/styled';

export const CallToAction = () => {
  return (
    <CallToActionContainer>
      <LinkNextToCTA href="https://app.nodiaflow.com">Sign in</LinkNextToCTA>
      <a href="https://app.nodiaflow.com">
        <StyledButton>Get Started</StyledButton>
      </a>
    </CallToActionContainer>
  );
};

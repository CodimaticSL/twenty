import { type I18n } from '@lingui/core';
import { MainText } from 'src/components/MainText';
import { SubTitle } from 'src/components/SubTitle';

type WhatIsNodiaFlowProps = {
  i18n: I18n;
};

export const WhatIsNodiaFlow = ({ i18n }: WhatIsNodiaFlowProps) => {
  return (
    <>
      <SubTitle value={i18n._('What is NodiaFlow?')} />
      <MainText>
        {i18n._(
          "It's a CRM, a software to help businesses manage their customer data and relationships efficiently.",
        )}
      </MainText>
    </>
  );
};

// Mantener compatibilidad con código existente
export const WhatIsTwenty = WhatIsNodiaFlow;

import { SettingsRolePermissionsSettingsTableHeader } from '@/settings/roles/role-permissions/permission-flags/components/SettingsRolePermissionsSettingsTableHeader';
import { SettingsRolePermissionsSettingsTableRow } from '@/settings/roles/role-permissions/permission-flags/components/SettingsRolePermissionsSettingsTableRow';
import { type SettingsRolePermissionsSettingPermission } from '@/settings/roles/role-permissions/permission-flags/types/SettingsRolePermissionsSettingPermission';
import styled from '@emotion/styled';
import { t } from '@lingui/core/macro';
import {
  H2Title,
  IconEye,
} from 'twenty-ui/display';
import { Section } from 'twenty-ui/layout';
import { PermissionFlagType } from '~/generated-metadata/graphql';

const StyledTable = styled.div`
  border-bottom: 1px solid ${({ theme }) => theme.border.color.light};
`;

const StyledTableRows = styled.div`
  padding-bottom: ${({ theme }) => theme.spacing(2)};
  padding-top: ${({ theme }) => theme.spacing(2)};
`;

type SettingsRolePermissionsDataSectionProps = {
  roleId: string;
  isEditable: boolean;
};

export const SettingsRolePermissionsDataSection = ({
  roleId,
  isEditable,
}: SettingsRolePermissionsDataSectionProps) => {
  const dataPermissionsConfig: SettingsRolePermissionsSettingPermission[] = [
    {
      key: PermissionFlagType.VIEW_ONLY_OWN_OR_ASSIGNED_RECORDS,
      name: t`View Only Own or Assigned Records`,
      description: t`Can only view records they created or are assigned to`,
      Icon: IconEye,
    },
  ];

  return (
    <Section>
      <H2Title title={t`Data`} description={t`Data permissions`} />
      <StyledTable>
        <SettingsRolePermissionsSettingsTableHeader
          roleId={roleId}
          settingsPermissionsConfig={dataPermissionsConfig}
          isEditable={isEditable}
        />
        <StyledTableRows>
          {dataPermissionsConfig.map((permission) => (
            <SettingsRolePermissionsSettingsTableRow
              key={permission.key}
              roleId={roleId}
              permission={permission}
              isEditable={isEditable}
            />
          ))}
        </StyledTableRows>
      </StyledTable>
    </Section>
  );
};
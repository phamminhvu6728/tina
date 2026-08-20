import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { useLingui } from '@lingui/react/macro';
import { useEffect, useMemo } from 'react';

import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { useInvalidateMetadataStore } from '@/metadata-store/hooks/useInvalidateMetadataStore';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { Select } from '@/ui/input/components/Select';
import { useCountries } from '@/ui/input/components/internal/hooks/useCountries';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { logError } from '~/utils/logError';

const GET_WORKSPACE_PHONE_REGION = gql`
  query GetWorkspacePhoneRegion {
    currentWorkspace {
      id
      defaultPhoneCountryCode
    }
  }
`;

const UPDATE_WORKSPACE_PHONE_REGION = gql`
  mutation UpdateWorkspacePhoneRegion($countryCode: String!) {
    updateWorkspace(data: { defaultPhoneCountryCode: $countryCode }) {
      id
      defaultPhoneCountryCode
    }
  }
`;

type WorkspacePhoneRegionQuery = {
  currentWorkspace: {
    id: string;
    defaultPhoneCountryCode: string;
  };
};

type UpdateWorkspacePhoneRegionMutation = {
  updateWorkspace: {
    id: string;
    defaultPhoneCountryCode: string;
  };
};

export const RegionPicker = () => {
  const { t } = useLingui();
  const countries = useCountries();
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const setCurrentWorkspace = useSetAtomState(currentWorkspaceState);
  const { enqueueErrorSnackBar } = useSnackBar();
  const { invalidateMetadataStore } = useInvalidateMetadataStore();
  const { data, loading, error } = useQuery<WorkspacePhoneRegionQuery>(
    GET_WORKSPACE_PHONE_REGION,
    { fetchPolicy: 'network-only' },
  );
  const [updateRegion, { loading: isUpdating }] =
    useMutation<UpdateWorkspacePhoneRegionMutation>(
      UPDATE_WORKSPACE_PHONE_REGION,
    );

  const persistedCountryCode = data?.currentWorkspace.defaultPhoneCountryCode;

  useEffect(() => {
    if (!persistedCountryCode) {
      return;
    }

    setCurrentWorkspace((workspace) =>
      workspace === null
        ? null
        : { ...workspace, defaultPhoneCountryCode: persistedCountryCode },
    );
  }, [persistedCountryCode, setCurrentWorkspace]);

  useEffect(() => {
    if (error) {
      enqueueErrorSnackBar({ apolloError: error });
    }
  }, [enqueueErrorSnackBar, error]);

  const options = useMemo(
    () =>
      [...countries]
        .sort((countryA, countryB) =>
          countryA.countryName.localeCompare(countryB.countryName),
        )
        .map((country) => ({
          label: `${country.countryName} (${country.countryCode})`,
          value: country.countryCode,
          searchKeywords: `${country.countryName} ${country.countryCode} +${country.callingCode}`,
        })),
    [countries],
  );

  const handleChange = async (countryCode: string) => {
    try {
      const result = await updateRegion({
        variables: { countryCode },
        update: (cache, { data: mutationData }) => {
          if (!mutationData) {
            return;
          }

          cache.writeQuery<WorkspacePhoneRegionQuery>({
            query: GET_WORKSPACE_PHONE_REGION,
            data: { currentWorkspace: mutationData.updateWorkspace },
          });
        },
      });

      const savedCountryCode =
        result.data?.updateWorkspace.defaultPhoneCountryCode;

      if (!savedCountryCode) {
        throw new Error('Workspace region was not saved');
      }

      setCurrentWorkspace((workspace) =>
        workspace === null
          ? null
          : { ...workspace, defaultPhoneCountryCode: savedCountryCode },
      );
      invalidateMetadataStore();
    } catch (error) {
      logError(error);
      enqueueErrorSnackBar({
        apolloError: error instanceof Error ? error : new Error(String(error)),
      });
    }
  };

  const selectedCountryCode =
    persistedCountryCode ?? currentWorkspace?.defaultPhoneCountryCode ?? '';

  return (
    <Select<string>
      dropdownId="workspace-region"
      label={t`Region`}
      dropdownWidthAuto
      fullWidth
      withSearchInput
      emptyOption={{
        label: loading ? t`Loading...` : t`Select a region`,
        value: '',
      }}
      value={selectedCountryCode}
      options={options}
      onChange={handleChange}
      disabled={loading || isUpdating}
    />
  );
};

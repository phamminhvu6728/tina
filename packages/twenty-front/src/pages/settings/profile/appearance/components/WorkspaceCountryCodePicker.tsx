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

const GET_WORKSPACE_COUNTRY_CODE = gql`
  query GetWorkspaceCountryCode {
    currentWorkspace {
      id
      workspaceCountryCode
    }
  }
`;

const UPDATE_WORKSPACE_COUNTRY_CODE = gql`
  mutation UpdateWorkspaceCountryCode($countryCode: String!) {
    updateWorkspace(data: { workspaceCountryCode: $countryCode }) {
      id
      workspaceCountryCode
    }
  }
`;

type WorkspaceCountryCodeQuery = {
  currentWorkspace: {
    id: string;
    workspaceCountryCode: string;
  };
};

type UpdateWorkspaceCountryCodeMutation = {
  updateWorkspace: {
    id: string;
    workspaceCountryCode: string;
  };
};

export const WorkspaceCountryCodePicker = () => {
  const { t } = useLingui();
  const countries = useCountries();
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const setCurrentWorkspace = useSetAtomState(currentWorkspaceState);
  const { enqueueErrorSnackBar } = useSnackBar();
  const { invalidateMetadataStore } = useInvalidateMetadataStore();
  const { data, loading, error } = useQuery<WorkspaceCountryCodeQuery>(
    GET_WORKSPACE_COUNTRY_CODE,
    { fetchPolicy: 'network-only' },
  );
  const [updateWorkspaceCountryCode, { loading: isUpdating }] =
    useMutation<UpdateWorkspaceCountryCodeMutation>(
      UPDATE_WORKSPACE_COUNTRY_CODE,
    );

  const persistedCountryCode = data?.currentWorkspace.workspaceCountryCode;

  useEffect(() => {
    if (!persistedCountryCode) {
      return;
    }

    setCurrentWorkspace((workspace) =>
      workspace === null
        ? null
        : { ...workspace, workspaceCountryCode: persistedCountryCode },
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
      const result = await updateWorkspaceCountryCode({
        variables: { countryCode },
        update: (cache, { data: mutationData }) => {
          if (!mutationData) {
            return;
          }

          cache.writeQuery<WorkspaceCountryCodeQuery>({
            query: GET_WORKSPACE_COUNTRY_CODE,
            data: { currentWorkspace: mutationData.updateWorkspace },
          });
        },
      });

      const savedCountryCode =
        result.data?.updateWorkspace.workspaceCountryCode;

      if (!savedCountryCode) {
        throw new Error('Workspace region was not saved');
      }

      setCurrentWorkspace((workspace) =>
        workspace === null
          ? null
          : { ...workspace, workspaceCountryCode: savedCountryCode },
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
    persistedCountryCode ?? currentWorkspace?.workspaceCountryCode ?? '';

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

import { FieldMetadataType } from 'twenty-shared/types';
import { type EntityManager, type Repository } from 'typeorm';

import { WorkspacePhoneRegionService } from 'src/engine/core-modules/workspace/services/workspace-phone-region.service';
import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';

describe('WorkspacePhoneRegionService', () => {
  const workspaceId = '20202020-0000-0000-0000-000000000000';

  it('updates only the phone field metadata defaults', async () => {
    const phoneFields = [
      {
        id: '20202020-0000-0000-0000-000000000001',
        workspaceId,
        type: FieldMetadataType.PHONES,
        isActive: true,
        defaultValue: {
          primaryPhoneNumber: "''",
          primaryPhoneCountryCode: "'US'",
          primaryPhoneCallingCode: "'+1'",
          additionalPhones: null,
        },
      },
    ] as FieldMetadataEntity<FieldMetadataType.PHONES>[];
    const transactionalRepository = {
      find: jest.fn().mockResolvedValue(phoneFields),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const entityManager = {
      getRepository: jest.fn().mockReturnValue(transactionalRepository),
    } as unknown as EntityManager;
    const fieldMetadataRepository = {
      manager: {
        transaction: jest
          .fn()
          .mockImplementation(
            async (callback: (manager: EntityManager) => unknown) =>
              callback(entityManager),
          ),
      },
    } as unknown as Repository<FieldMetadataEntity>;
    const service = new WorkspacePhoneRegionService(fieldMetadataRepository);

    await service.applyCountryCode({ workspaceId, countryCode: 'VN' });

    expect(transactionalRepository.find).toHaveBeenCalledWith({
      where: {
        workspaceId,
        type: FieldMetadataType.PHONES,
        isActive: true,
      },
    });
    expect(transactionalRepository.update).toHaveBeenCalledTimes(1);
    expect(transactionalRepository.update).toHaveBeenCalledWith(
      { id: phoneFields[0].id, workspaceId },
      {
        defaultValue: {
          primaryPhoneNumber: "''",
          primaryPhoneCountryCode: "'VN'",
          primaryPhoneCallingCode: "'+84'",
          additionalPhones: null,
        },
      },
    );
  });
});

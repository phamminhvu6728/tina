import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { type CountryCode, getCountryCallingCode } from 'libphonenumber-js';
import { FieldMetadataType } from 'twenty-shared/types';
import { Repository } from 'typeorm';

import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';

@Injectable()
export class WorkspacePhoneRegionService {
  constructor(
    @InjectRepository(FieldMetadataEntity)
    private readonly fieldMetadataRepository: Repository<FieldMetadataEntity>,
  ) {}

  async applyCountryCode({
    workspaceId,
    countryCode,
  }: {
    workspaceId: string;
    countryCode: CountryCode;
  }): Promise<void> {
    await this.fieldMetadataRepository.manager.transaction(async (manager) => {
      const fieldMetadataRepository =
        manager.getRepository(FieldMetadataEntity);
      const phoneFields = await fieldMetadataRepository.find({
        where: {
          workspaceId,
          type: FieldMetadataType.PHONES,
          isActive: true,
        },
      });
      const callingCode = `+${getCountryCallingCode(countryCode)}`;

      for (const field of phoneFields) {
        const phoneField =
          field as FieldMetadataEntity<FieldMetadataType.PHONES>;

        await fieldMetadataRepository.update(
          { id: phoneField.id, workspaceId },
          {
            defaultValue: {
              ...(phoneField.defaultValue ?? {}),
              primaryPhoneCountryCode: `'${countryCode}'`,
              primaryPhoneCallingCode: `'${callingCode}'`,
            },
          },
        );
      }
    });
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { ServerService } from '../server.service';
import { StellarModuleConfig } from '../../types';
import { STELLAR_OPTIONS } from '../../constants';

@Injectable()
export class AssetsUtilsService {
  constructor(
    @Inject(STELLAR_OPTIONS) private readonly options: StellarModuleConfig,
    private readonly serverService: ServerService,
  ) {}
  public async doesAssetExist(assetName: string, issuer: string): Promise<boolean> {
    const asset = await this.serverService.assets().forCode(assetName).forIssuer(issuer).call();

    return !!asset.records.length;
  }
}

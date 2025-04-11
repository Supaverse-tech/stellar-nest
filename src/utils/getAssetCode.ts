import { Asset } from '@stellar/stellar-sdk';

export const getAssetCode = (asset: string): Asset => {
  if (asset === 'XLM') {
    return Asset.native();
  }
  return new Asset(asset.split(':')[0], asset.split(':')[1]);
};

import { TAssetConfig } from './utils.types';

export type AccountConfig = {
  type: string;
  public?: string;
  secret?: string;
  signers?: string[];
};

export type CreateAccountConfig = {
  create_by?: string;
  starting?: {
    balance: string;
    baseTrustline?: (string | TAssetConfig)[];
    homeDomain?: string;
  };
};

import { FactoryProvider, ModuleMetadata } from '@nestjs/common';
import { StellarModuleMode } from '../enums';
import { AccountConfig, CreateAccountConfig } from './stellar-accounts.types';

export type StellarGlobalConfig = {
  emitEvents?: boolean;
  mode: keyof typeof StellarModuleMode;
};

export type StellarAccountConfig = {
  config?: CreateAccountConfig;
  accounts: AccountConfig[];
};

export type StellarAssetsConfig = {
  config?: {
    create_by: string;
    pay_by: string;
    sponsor_by?: string;
  };
};
export type StellarServerConfig = {
  url?: string;
};

export type StellarModuleConfig = StellarGlobalConfig & {
  account: StellarAccountConfig;
  payments: StellarAssetsConfig;
  server?: StellarServerConfig;
  getSecrets?: () => Promise<Record<string, any>[]>;
};

export interface StellarAsyncModuleConfig<T> extends Pick<ModuleMetadata, 'imports'> {
  useFactory: (...args: any[]) => Promise<T> | T;
  inject?: FactoryProvider['inject'];
}

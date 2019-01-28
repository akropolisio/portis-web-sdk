export interface INetwork {
  nodeUrl: string;
  chainId?: number;
  nodeProtocol?: 'rpc' | 'pocket';
}

export interface IConnectionMethods {
  getAccounts: (config: ISDKConfig) => Promise<{ error: string; result: string[] }>;
  signTransaction: (txParams: ITransactionRequest, config: ISDKConfig) => Promise<{ error: string; result: string }>;
  signMessage: (msgParams: IMessageParams, config: ISDKConfig) => Promise<{ error: string; result: string }>;
  relay: (payload: IPayload, config: ISDKConfig) => Promise<{ error: string; result: any }>;
  showPortis: (config: ISDKConfig) => Promise<void>;
  login: (config: ISDKConfig) => Promise<void>;
}

export interface ISDKConfig {
  dappId: string;
  network: INetwork;
  version: string;
  defaultEmail?: string;
  scope?: Scope[];
}

export type Scope = 'email';

export interface IOptions {
  scope?: Scope[];
}

export interface ITransactionRequest {
  to?: string;
  from?: string;
  nonce?: string;
  gas?: string;
  gasPrice?: string;
  data?: string;
  value?: string;
  chainId?: number;
}

export interface IMessageParams {
  from: string;
  data: string | ITypedDataMessage[];
  messageStandard: 'signMessage' | 'signPersonalMessage' | 'signTypedMessage';
}

export interface ITypedDataMessage {
  name: string;
  type: string;
  value: string;
}

export interface IPayload {
  id: number;
  jsonrpc: string;
  method: string;
  params: any[];
}
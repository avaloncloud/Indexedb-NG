import { DebugOutputType } from "@avalon-cloud/debugger-ng";
import { Debugger } from "@avalon-cloud/debugger-ng";

export enum HashAlgorithm {
    SHA256 = 'SHA-256',
    SHA512 = 'SHA-512'
  }

export interface IndexConfig {
    name: string;
    keyPath: string | string[];
    options?: IDBIndexParameters;
  }

export interface StoreConfig {
    name: string;
    keyPath?: string | string[];
    autoIncrement?: boolean;
    indexes?: IndexConfig[];
  }

export interface DatabaseSchema {
    version: number;
    stores: StoreConfig[];
  }

export interface HashedRecord {
    hash?: string;
    [key: string]: any; // 其他資料
  }

export interface iDBOptions {
    debug?: boolean;  
    output?: DebugOutputType; 
    apiEndpoint?: string; 
    injectedDebugger?: Debugger; 
  }
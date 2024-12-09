import { Debugger, DebuggerFactoryOptions, OutputFactory, DebugOutputType, DebugLevel } from '@avalon-cloud/debugger-ng';
import { DatabaseSchema, HashAlgorithm, HashedRecord, iDBOptions } from './Data';

/**
 * iDB 類別：用於在 Angular 環境中使用 IndexedDB，並透過 Debugger 記錄與輸出日誌。
 */
export class iDB {

  private db: IDBDatabase | null = null;
  private debugger: Debugger;

  constructor(
    private dbName: string,
    private schema: DatabaseSchema,
    options?: iDBOptions
  ) {
    const debugMode = options?.debug ?? false;
    const outputMode = options?.output ?? DebugOutputType.Console;
    const apiEndpoint = options?.apiEndpoint;

    if (options?.injectedDebugger) {
      this.debugger = options.injectedDebugger;
    } else {
      const factoryOptions: DebuggerFactoryOptions = {
        debugOutputType: outputMode,
        apiEndpoint
      };
      const outputImplFactory = OutputFactory.create(factoryOptions);
      this.debugger = new Debugger(debugMode, outputImplFactory);
    }

    if (!this.validateSchema(this.schema)) {
      this.debugger.add({
        level: DebugLevel.Error,
        message: '資料庫結構驗證失敗，請檢查設定。',
        args: [],
        function: 'constructor'
      });
    }
  }

  private async computeHash(input: object, algorithm: HashAlgorithm): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(input));
    const hashBuffer = await crypto.subtle.digest(algorithm, data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private validateSchema(schema: DatabaseSchema): boolean {
    let valid = true;
    if (typeof schema.version !== 'number' || schema.version <= 0) {
      this.debugger.add({ level: DebugLevel.Error, message: '無效的資料庫版本號。', args: [], function: 'validateSchema' });
      valid = false;
    }

    if (!Array.isArray(schema.stores) || schema.stores.length === 0) {
      this.debugger.add({ level: DebugLevel.Error, message: '至少需要一個 Store。', args: [], function: 'validateSchema' });
      valid = false;
    } else {
      for (const store of schema.stores) {
        if (!store.name || store.name.trim() === '') {
          this.debugger.add({ level: DebugLevel.Error, message: 'Store 必須有有效的名稱。', args: [], function: 'validateSchema' });
          valid = false;
        }
      }
    }
    return valid;
  }

  async open(): Promise<boolean> {
    if (!this.validateSchema(this.schema)) {
      this.debugger.add({ level: DebugLevel.Error, message: `無法開啟資料庫 ${this.dbName}：結構無效。`, args: [], function: 'open' });
      await this.debugger.Output();
      return false;
    }

    return new Promise((resolve) => {
      const request = indexedDB.open(this.dbName, this.schema.version);

      request.onupgradeneeded = (event) => {
        this.debugger.add({ level: DebugLevel.Info, message: `正在升級資料庫 ${this.dbName}...`, args: [], function: 'open' });
        const db = (event.target as IDBOpenDBRequest).result;
        for (const storeConfig of this.schema.stores) {
          let store: IDBObjectStore;
          if (!db.objectStoreNames.contains(storeConfig.name)) {
            store = db.createObjectStore(storeConfig.name, {
              keyPath: storeConfig.keyPath,
              autoIncrement: storeConfig.autoIncrement,
            });
            this.debugger.add({ level: DebugLevel.Info, message: `已建立 Store：${storeConfig.name}`, args: [], function: 'open' });
          } else {
            store = (request.transaction as IDBTransaction).objectStore(storeConfig.name);
          }

          if (storeConfig.indexes) {
            for (const idx of storeConfig.indexes) {
              if (!store.indexNames.contains(idx.name)) {
                store.createIndex(idx.name, idx.keyPath, idx.options || {});
                this.debugger.add({ level: DebugLevel.Info, message: `已建立/更新索引：${idx.name}`, args: [], function: 'open' });
              }
            }
          }
        }
      };

      request.onsuccess = async () => {
        this.db = request.result;
        this.debugger.add({ level: DebugLevel.Info, message: `資料庫 ${this.dbName} 開啟成功。`, args: [], function: 'open' });
        await this.debugger.Output();
        resolve(true);
      };

      request.onerror = async () => {
        this.debugger.add({ level: DebugLevel.Error, message: `開啟資料庫失敗：${request.error}`, args: [], function: 'open' });
        await this.debugger.Output();
        resolve(false);
      };
    });
  }

  // 新增紀錄
  async add<T>(storeName: string, data: T): Promise<IDBValidKey | null> {
    if (!this.checkStoreName(storeName, 'add')) {
      await this.debugger.Output();
      return null;
    }

    this.debugger.add({ level: DebugLevel.Info, message: `正在新增資料至 ${storeName}`, args: [], function: 'add' });
    try {
      const key = await this.runTransaction(storeName, 'readwrite', store => this.requestToPromise(store.add(data)));
      this.debugger.add({ level: DebugLevel.Info, message: `新增資料成功 (key=${key})`, args: [], function: 'add' });
      await this.debugger.Output();
      return key;
    } catch (err) {
      this.debugger.add({ level: DebugLevel.Error, message: `新增資料失敗：${err}`, args: [], function: 'add' });
      await this.debugger.Output();
      return null;
    }
  }

  // 更新或新增紀錄
  async put<T>(storeName: string, data: T, key?: IDBValidKey): Promise<IDBValidKey | null> {
    if (!this.checkStoreName(storeName, 'put')) {
      await this.debugger.Output();
      return null;
    }

    this.debugger.add({ level: DebugLevel.Info, message: `正在更新/新增資料至 ${storeName}`, args: [], function: 'put' });
    try {
      const resultKey = await this.runTransaction(storeName, 'readwrite', store => this.requestToPromise(store.put(data, key)));
      this.debugger.add({ level: DebugLevel.Info, message: `更新/新增資料成功 (key=${resultKey})`, args: [], function: 'put' });
      await this.debugger.Output();
      return resultKey;
    } catch (err) {
      this.debugger.add({ level: DebugLevel.Error, message: `更新/新增資料失敗：${err}`, args: [], function: 'put' });
      await this.debugger.Output();
      return null;
    }
  }

  // 刪除整個資料庫
  async deleteDatabase(): Promise<boolean> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }

    this.debugger.add({ level: DebugLevel.Info, message: `正在刪除資料庫 ${this.dbName}`, args: [], function: 'deleteDatabase' });

    return new Promise((resolve) => {
      const request = indexedDB.deleteDatabase(this.dbName);

      request.onsuccess = async () => {
        this.debugger.add({ level: DebugLevel.Info, message: `資料庫 ${this.dbName} 刪除成功`, args: [], function: 'deleteDatabase' });
        await this.debugger.Output();
        resolve(true);
      };

      request.onerror = async () => {
        this.debugger.add({ level: DebugLevel.Error, message: `刪除資料庫失敗：${request.error}`, args: [], function: 'deleteDatabase' });
        await this.debugger.Output();
        resolve(false);
      };

      request.onblocked = () => {
        this.debugger.add({ level: DebugLevel.Warning, message: '刪除動作被阻擋，請關閉其他使用同資料庫的分頁。', args: [], function: 'deleteDatabase' });
        // Output 於 onsuccess或onerror階段再執行。
      };
    });
  }
// addWithHash
async addWithHash<T extends object>(storeName: string, data: T, algorithm: HashAlgorithm): Promise<IDBValidKey | null> {
  if (!this.checkStoreName(storeName, 'addWithHash')) {
    await this.debugger.Output();
    return null;
  }

  const cloned = { ...data } as HashedRecord;
  delete cloned.hash;
  cloned.hash = await this.computeHash(cloned, algorithm);

  this.debugger.add({ 
    level: DebugLevel.Info, 
    message: `新增帶雜湊值資料至 ${storeName}`, 
    args: [], 
    function: 'addWithHash' 
  });
  const result = await this.add(storeName, cloned);
  // add() 已在其內Output
  return result;
}

// putWithHash
async putWithHash<T extends object>(storeName: string, data: T, algorithm: HashAlgorithm, key?: IDBValidKey): Promise<IDBValidKey | null> {
  if (!this.checkStoreName(storeName, 'putWithHash')) {
    await this.debugger.Output();
    return null;
  }

  const cloned = { ...data } as HashedRecord;
  delete cloned.hash;
  cloned.hash = await this.computeHash(cloned, algorithm);

  this.debugger.add({ 
    level: DebugLevel.Info, 
    message: `更新/新增帶雜湊值資料至 ${storeName}`, 
    args: [], 
    function: 'putWithHash' 
  });
  const resultKey = await this.put(storeName, cloned, key);
  return resultKey; // put() 已在內Output
}

// validateWithHash
async validateWithHash<T extends HashedRecord>(storeName: string, key: IDBValidKey, algorithm: HashAlgorithm): Promise<boolean> {
  if (!this.checkStoreName(storeName, 'validateWithHash')) {
    await this.debugger.Output();
    return false;
  }

  this.debugger.add({ 
    level: DebugLevel.Info, 
    message: `驗證紀錄雜湊：Store=${storeName}, key=${key}`, 
    args: [], 
    function: 'validateWithHash' 
  });

  const record = await this.get<T>(storeName, key);
  if (!record) {
    this.debugger.add({ 
      level: DebugLevel.Warning, 
      message: '無法驗證，紀錄不存在', 
      args: [], 
      function: 'validateWithHash' 
    });
    await this.debugger.Output();
    return false;
  }

  if (!record.hash) {
    this.debugger.add({ 
      level: DebugLevel.Warning, 
      message: '紀錄無hash欄位，無法驗證', 
      args: [], 
      function: 'validateWithHash' 
    });
    await this.debugger.Output();
    return false;
  }

  const cloned = { ...record };
  const storedHash = cloned.hash;
  delete cloned.hash;

  const recalculated = await this.computeHash(cloned, algorithm);
  const valid = storedHash === recalculated;
  this.debugger.add({
    level: valid ? DebugLevel.Info : DebugLevel.Error,
    message: valid ? '雜湊驗證成功' : '雜湊驗證失敗，資料可能已被竄改',
    args: [],
    function: 'validateWithHash'
  });
  await this.debugger.Output();
  return valid;
}

// get紀錄
async get<T>(storeName: string, key: IDBValidKey, validateHash: boolean = false, algorithm?: HashAlgorithm): Promise<T | null> {
  if (!this.checkStoreName(storeName, 'get')) {
    await this.debugger.Output();
    return null;
  }

  this.debugger.add({ 
    level: DebugLevel.Info, 
    message: `取得紀錄：Store=${storeName}, key=${key}`, 
    args: [], 
    function: 'get' 
  });
  
  try {
    const record = await this.runTransaction(storeName, 'readonly', store => this.requestToPromise(store.get(key))) as T | undefined;
    if (!record) {
      this.debugger.add({ 
        level: DebugLevel.Warning, 
        message: '紀錄不存在', 
        args: [], 
        function: 'get' 
      });
      await this.debugger.Output();
      return null;
    }

    if (validateHash && algorithm) {
      const hashed = record as HashedRecord;
      if (hashed.hash) {
        const cloned = { ...hashed };
        const storedHash = cloned.hash;
        delete cloned.hash;

        const recalculated = await this.computeHash(cloned, algorithm);
        if (storedHash !== recalculated) {
          this.debugger.add({ 
            level: DebugLevel.Error, 
            message: '紀錄雜湊驗證失敗', 
            args: [], 
            function: 'get' 
          });
          await this.debugger.Output();
          return null;
        } else {
          this.debugger.add({ 
            level: DebugLevel.Info, 
            message: '紀錄雜湊驗證成功', 
            args: [], 
            function: 'get' 
          });
        }
      } else {
        this.debugger.add({ 
          level: DebugLevel.Warning, 
          message: '紀錄無hash欄位，跳過驗證', 
          args: [], 
          function: 'get' 
        });
      }
    }

    this.debugger.add({ level: DebugLevel.Info, message: '取得紀錄成功', args: [], function: 'get' });
    await this.debugger.Output();
    return record;
  } catch (err) {
    this.debugger.add({ level: DebugLevel.Error, message: `取得紀錄失敗：${err}`, args: [], function: 'get' });
    await this.debugger.Output();
    return null;
  }
}


  // 下列為輔助方法：runTransaction、requestToPromise、checkStoreName

  private async runTransaction<T>(
    storeName: string,
    mode: IDBTransactionMode,
    callback: (store: IDBObjectStore) => Promise<T>
  ): Promise<T> {
    if (!this.db) {
      this.debugger.add({ level: DebugLevel.Error, message: '尚未開啟資料���，請先呼叫 open()。', args: [], function: 'runTransaction' });
      return Promise.reject(new Error('DB not open'));
    }

    return new Promise((resolve, reject) => {
      let transaction: IDBTransaction;
      try {
        transaction = this.db!.transaction(storeName, mode);
      } catch (e: any) {
        this.debugger.add({ level: DebugLevel.Error, message: `建立交易時發生錯誤：${e.message}`, args: [], function: 'runTransaction' });
        reject(e);
        return;
      }

      transaction.onerror = () => {
        this.debugger.add({ level: DebugLevel.Error, message: `交易錯誤（Store：${storeName}）：${transaction.error}`, args: [], function: 'runTransaction' });
        reject(transaction.error);
      };

      callback(transaction.objectStore(storeName))
        .then((result) => {
          transaction.oncomplete = () => {
            resolve(result);
          };
        })
        .catch((err) => {
          this.debugger.add({ level: DebugLevel.Error, message: `交易回呼錯誤：${err}`, args: [], function: 'runTransaction' });
          reject(err);
        });
    });
  }

  private requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        this.debugger.add({ level: DebugLevel.Error, message: `IDB 請求錯誤：${request.error}`, args: [], function: 'requestToPromise' });
        reject(request.error);
      };
    });
  }

  private checkStoreName(storeName: string, func: string): boolean {
    const exists = this.schema.stores.some(s => s.name === storeName);
    if (!exists) {
      this.debugger.add({ level: DebugLevel.Error, message: `Store ${storeName} 不存在於結構中。`, args: [], function: func });
      return false;
    }
    return true;
  }
}

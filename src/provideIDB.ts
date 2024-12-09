import { Provider } from '@angular/core';
import { Debugger } from '@avalon-cloud/debugger-ng';
import { iDB } from './iDB';
import { DatabaseSchema } from './Data';

export function provideIDB(dbName: string, schema: DatabaseSchema): Provider {
  return {
    provide: iDB,
    useFactory: (dbg: Debugger) => new iDB(dbName, schema, { injectedDebugger: dbg }),
    deps: [Debugger]
  };
}
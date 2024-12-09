import 'fake-indexeddb/auto';
import { iDB } from '../src/iDB';
import { DatabaseSchema, HashAlgorithm, iDBOptions } from '../src/Data';
import { DebugOutputType } from '@avalon-cloud/debugger-ng';

describe('iDB Class Tests', () => {
  let dbName = 'TestDB';
  let schema: DatabaseSchema;
  let options: iDBOptions;
  let idb: iDB;

  beforeEach(() => {
    schema = {
      version: 1,
      stores: [
        {
          name: 'testStore',
          keyPath: 'id',
          autoIncrement: true,
          indexes: [{ name: 'nameIndex', keyPath: 'name' }]
        }
      ]
    };

    options = {
      debug: true,
      output: DebugOutputType.Console
    };

    idb = new iDB(dbName, schema, options);
  });

  afterEach(async () => {
    await idb.deleteDatabase();
  });

  test('should open the database successfully', async () => {
    const result = await idb.open();
    expect(result).toBe(true);
  });

  test('should add a record successfully', async () => {
    await idb.open();
    const key = await idb.add('testStore', { name: 'Test Record' });
    expect(key).not.toBeNull();
  });

  test('should update a record successfully', async () => {
    await idb.open();
    const key = await idb.add('testStore', { name: 'Test Record' });
    const updatedKey = await idb.put('testStore', { id: key, name: 'Updated Record' });
    expect(updatedKey).toEqual(key);
  });

  test('should delete the database successfully', async () => {
    await idb.open();
    const result = await idb.deleteDatabase();
    expect(result).toBe(true);
  });

  test('should get a record successfully', async () => {
    await idb.open();
    const key = await idb.add('testStore', { name: 'Test Record' });
    const record = await idb.get('testStore', key!);
    expect(record).toEqual({ id: key, name: 'Test Record' });
  });

  test('should fail to get a non-existent record', async () => {
    await idb.open();
    const record = await idb.get('testStore', 999);
    expect(record).toBeNull();
  });
}); 
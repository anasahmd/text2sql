import { DataSource } from 'typeorm';

class DBManager {
  constructor() {
    this.dataSource = null;
    this.dbType = null;
  }

  async connect(uri) {
    await this.disconnect();

    let type = 'better-sqlite3';
    if (uri.startsWith('postgres://') || uri.startsWith('postgresql://')) type = 'postgres';
    else if (uri.startsWith('mysql://')) type = 'mysql';

    const isSqlite = type === 'better-sqlite3';

    this.dataSource = new DataSource({
      type,
      url: !isSqlite ? uri : undefined,
      database: isSqlite ? uri : undefined,
      synchronize: false,
      logging: false,
    });

    await this.dataSource.initialize();
    this.dbType = type;

    const schema = await this._introspectSchema(type);
    return { type, tables: Object.keys(schema), schema };
  }

  async _introspectSchema(type) {
    const queryRunner = this.dataSource.createQueryRunner();
    const schema = {};

    try {
      let tables = [];

      if (type === 'better-sqlite3') {
        const result = await queryRunner.query(
          `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';`
        );
        tables = result.map((t) => t.name);
      } else if (type === 'postgres') {
        const result = await queryRunner.query(
          `SELECT table_name FROM information_schema.tables WHERE table_schema='public';`
        );
        tables = result.map((t) => t.table_name);
      } else if (type === 'mysql') {
        const result = await queryRunner.query(`SHOW TABLES;`);
        tables = result.map((t) => Object.values(t)[0]);
      }

      // Get column details for each table
      for (const table of tables) {
        let columns = [];

        if (type === 'better-sqlite3') {
          const cols = await queryRunner.query(`PRAGMA table_info("${table}");`);
          columns = cols.map((c) => ({
            name: c.name,
            type: c.type,
            nullable: !c.notnull,
            primaryKey: !!c.pk,
          }));
        } else if (type === 'postgres') {
          const cols = await queryRunner.query(
            `SELECT column_name, data_type, is_nullable, 
             (SELECT COUNT(*) FROM information_schema.key_column_usage kcu 
              JOIN information_schema.table_constraints tc ON kcu.constraint_name = tc.constraint_name 
              WHERE tc.constraint_type = 'PRIMARY KEY' AND kcu.table_name = c.table_name AND kcu.column_name = c.column_name) as is_pk
             FROM information_schema.columns c WHERE table_name = $1 ORDER BY ordinal_position;`,
            [table]
          );
          columns = cols.map((c) => ({
            name: c.column_name,
            type: c.data_type,
            nullable: c.is_nullable === 'YES',
            primaryKey: parseInt(c.is_pk) > 0,
          }));
        } else if (type === 'mysql') {
          const cols = await queryRunner.query(`DESCRIBE \`${table}\`;`);
          columns = cols.map((c) => ({
            name: c.Field,
            type: c.Type,
            nullable: c.Null === 'YES',
            primaryKey: c.Key === 'PRI',
          }));
        }

        schema[table] = columns;
      }
    } finally {
      await queryRunner.release();
    }

    return schema;
  }

  async disconnect() {
    if (this.dataSource?.isInitialized) {
      await this.dataSource.destroy();
    }
    this.dataSource = null;
    this.dbType = null;
  }

  getDataSource() {
    if (!this.dataSource?.isInitialized) {
      throw new Error('No database connected.');
    }
    return this.dataSource;
  }

  isConnected() {
    return !!this.dataSource?.isInitialized;
  }

  getType() {
    return this.dbType;
  }
}

export default new DBManager();

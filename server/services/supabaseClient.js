const { createClient } = require('@supabase/supabase-js');
const { db, formatRow } = require('../database/database');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

class SqliteQueryBuilder {
  constructor(tableName) {
    this.tableName = tableName;
    this.operation = 'select';
    this.selectCols = '*';
    this.whereConditions = [];
    this.whereParams = [];
    this.orderByStr = '';
    this.limitVal = null;
    this.offsetVal = null;
    this.insertData = null;
    this.updateData = null;
    this.isSingle = false;
    this.onConflict = 'company_id';
  }

  select(cols = '*', options = {}) {
    if (this.operation !== 'insert') {
      this.operation = 'select';
    }
    this.selectCols = cols;
    return this;
  }

  insert(data) {
    this.operation = 'insert';
    this.insertData = Array.isArray(data) ? data : [data];
    return this;
  }

  update(data) {
    this.operation = 'update';
    this.updateData = data;
    return this;
  }

  delete() {
    this.operation = 'delete';
    return this;
  }

  upsert(data, options = {}) {
    this.operation = 'upsert';
    this.insertData = Array.isArray(data) ? data : [data];
    if (options && options.onConflict) {
      this.onConflict = options.onConflict;
    }
    return this;
  }

  eq(column, value) {
    this.whereConditions.push(`${column} = ?`);
    this.whereParams.push(value);
    return this;
  }

  neq(column, value) {
    this.whereConditions.push(`${column} != ?`);
    this.whereParams.push(value);
    return this;
  }

  in(column, values) {
    if (!values || values.length === 0) {
      this.whereConditions.push('1 = 0');
    } else {
      const placeholders = values.map(() => '?').join(',');
      this.whereConditions.push(`${column} IN (${placeholders})`);
      this.whereParams.push(...values);
    }
    return this;
  }

  or(conditionStr) {
    const parts = conditionStr.split(',');
    const subConds = [];
    parts.forEach((p) => {
      const match = p.match(/(.+)\.(ilike|eq)\.(.+)/);
      if (match) {
        const col = match[1];
        const op = match[2];
        let val = match[3].replace(/%/g, '');
        if (op === 'ilike') {
          subConds.push(`${col} LIKE ?`);
          this.whereParams.push(`%${val}%`);
        } else {
          subConds.push(`${col} = ?`);
          this.whereParams.push(val);
        }
      }
    });
    if (subConds.length > 0) {
      this.whereConditions.push(`(${subConds.join(' OR ')})`);
    }
    return this;
  }

  order(column, { ascending = true } = {}) {
    this.orderByStr = ` ORDER BY ${column} ${ascending ? 'ASC' : 'DESC'}`;
    return this;
  }

  range(from, to) {
    this.offsetVal = from;
    this.limitVal = to - from + 1;
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  async then(resolve, reject) {
    try {
      const res = this.execute();
      resolve(res);
    } catch (err) {
      console.error(`[SQLite Adapter Error on ${this.tableName}]:`, err.message);
      resolve({ data: null, error: err });
    }
  }

  execute() {
    let whereClause = this.whereConditions.length > 0 ? ` WHERE ${this.whereConditions.join(' AND ')}` : '';
    
    // Fix ambiguous column name 'company_id' when joining tables
    if (whereClause.includes('company_id =')) {
      whereClause = whereClause.replace(/company_id =/g, `${this.tableName}.company_id =`);
    }

    if (this.operation === 'select') {
      let sqlCols = '*';
      let joinClause = '';

      if (typeof this.selectCols === 'string' && this.selectCols.includes('contacts(')) {
        if (this.tableName === 'pdf_files') {
          sqlCols = `pdf_files.*, c.name AS contact_name, c.mobile AS contact_mobile`;
          joinClause = ` LEFT JOIN contacts c ON pdf_files.matchedContactId = c.id`;
        }
      }

      let count = null;
      let countSql = `SELECT COUNT(*) as cnt FROM ${this.tableName}${joinClause}${whereClause}`;
      try {
        const countRow = db.prepare(countSql).get(...this.whereParams);
        count = countRow ? countRow.cnt : 0;
      } catch (e) {
        count = 0;
      }

      let limitSql = '';
      if (this.limitVal !== null) {
        limitSql = ` LIMIT ${this.limitVal}`;
        if (this.offsetVal !== null) {
          limitSql += ` OFFSET ${this.offsetVal}`;
        }
      }

      const querySql = `SELECT ${sqlCols} FROM ${this.tableName}${joinClause}${whereClause}${this.orderByStr}${limitSql}`;
      const rows = db.prepare(querySql).all(...this.whereParams);

      const formatted = rows.map((r) => {
        let item = formatRow ? formatRow(r) : r;
        if (r.contact_name || r.contact_mobile) {
          item.contacts = { name: r.contact_name, mobile: r.contact_mobile };
        }
        return item;
      });

      if (this.isSingle) {
        if (formatted.length === 0) {
          return { data: null, error: { message: 'Row not found', code: 'PGRST116' }, count: 0 };
        }
        return { data: formatted[0], error: null, count: 1 };
      }

      return { data: formatted, error: null, count };
    }

    if (this.operation === 'insert') {
      const inserted = [];
      const now = new Date().toISOString();
      for (const item of this.insertData) {
        const itemToInsert = { ...item };
        if (!itemToInsert.createdAt && !itemToInsert.created_at) {
          itemToInsert.createdAt = now;
        }
        if (!itemToInsert.updatedAt) {
          itemToInsert.updatedAt = now;
        }

        const keys = Object.keys(itemToInsert);
        const placeholders = keys.map(() => '?').join(',');
        const values = Object.values(itemToInsert);

        const sql = `INSERT INTO ${this.tableName} (${keys.join(',')}) VALUES (${placeholders})`;
        const info = db.prepare(sql).run(...values);

        const row = db.prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`).get(info.lastInsertRowid);
        inserted.push(formatRow(row));
      }

      if (this.isSingle) {
        return { data: inserted[0] || null, error: null };
      }
      return { data: inserted, error: null };
    }

    if (this.operation === 'update') {
      const keys = Object.keys(this.updateData);
      const setClause = keys.map((k) => `${k} = ?`).join(',');
      const values = Object.values(this.updateData);

      const sql = `UPDATE ${this.tableName} SET ${setClause}${whereClause}`;
      db.prepare(sql).run(...values, ...this.whereParams);

      const fetchSql = `SELECT * FROM ${this.tableName}${whereClause}`;
      const rows = db.prepare(fetchSql).all(...this.whereParams).map(formatRow);

      if (this.isSingle) {
        return { data: rows[0] || null, error: null };
      }
      return { data: rows, error: null };
    }

    if (this.operation === 'upsert') {
      const item = this.insertData[0];
      const now = new Date().toISOString();
      if (!item.updatedAt) item.updatedAt = now;
      if (!item.createdAt && !item.created_at) item.createdAt = now;

      const conflictCol = this.onConflict || 'company_id';
      const conflictVal = item[conflictCol];
      const existing = db.prepare(`SELECT * FROM ${this.tableName} WHERE ${conflictCol} = ?`).get(conflictVal);

      if (existing) {
        const keys = Object.keys(item).filter((k) => k !== conflictCol && k !== 'id');
        const setClause = keys.map((k) => `${k} = ?`).join(',');
        const values = keys.map((k) => item[k]);

        const sql = `UPDATE ${this.tableName} SET ${setClause} WHERE ${conflictCol} = ?`;
        db.prepare(sql).run(...values, conflictVal);
      } else {
        const keys = Object.keys(item);
        const placeholders = keys.map(() => '?').join(',');
        const values = Object.values(item);
        const sql = `INSERT INTO ${this.tableName} (${keys.join(',')}) VALUES (${placeholders})`;
        db.prepare(sql).run(...values);
      }

      const updatedRow = db.prepare(`SELECT * FROM ${this.tableName} WHERE ${conflictCol} = ?`).get(conflictVal);
      const res = formatRow(updatedRow);
      return { data: this.isSingle ? res : [res], error: null };
    }

    if (this.operation === 'delete') {
      const fetchSql = `SELECT * FROM ${this.tableName}${whereClause}`;
      const rows = db.prepare(fetchSql).all(...this.whereParams).map(formatRow);

      const sql = `DELETE FROM ${this.tableName}${whereClause}`;
      db.prepare(sql).run(...this.whereParams);

      return { data: rows, error: null };
    }

    return { data: null, error: null };
  }
}

let supabase = null;
if (supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http')) {
  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
  } catch (err) {
    console.warn('[Supabase] Failed to initialize Supabase client, using SQLite adapter:', err.message);
  }
}

if (!supabase) {
  console.log('[Database] Using local SQLite app.db database adapter');
  supabase = {
    from: (table) => new SqliteQueryBuilder(table),
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        download: async () => ({ data: null, error: new Error('Object not found') }),
        remove: async () => ({ error: null }),
      }),
    },
  };
}

module.exports = { supabase };

'use strict';
/**
 * Doble de MongoDB en memoria, solo para probar la app localmente.
 * Implementa las operaciones que usan app.js y app-movil.js.
 * Solo se usa desde pruebas/. La app en producción nunca lo carga.
 */
const { ObjectId } = require('mongodb');

// mongoose trae su propio bson: reconocer ObjectId por forma, no por clase
function esOid(v) {
  return !!v && typeof v === 'object' && (v._bsontype === 'ObjectId' || v._bsontype === 'ObjectID');
}

function coincide(doc, filtro) {
  for (const clave of Object.keys(filtro || {})) {
    const cond = filtro[clave];
    const valor = doc[clave];
    if (cond && typeof cond === 'object' && !Array.isArray(cond) && !esOid(cond) && !(cond instanceof Date)) {
      for (const op of Object.keys(cond)) {
        const esperado = cond[op];
        if (op === '$ne') {
          if (igual(valor, esperado)) return false;
        } else if (op === '$in') {
          if (!esperado.some((e) => igual(valor, e))) return false;
        } else if (op === '$nin') {
          if (esperado.some((e) => igual(valor, e))) return false;
        } else if (op === '$exists') {
          const existe = valor !== undefined;
          if (existe !== !!esperado) return false;
        } else if (op === '$gte') {
          if (!(valor >= esperado)) return false;
        } else if (op === '$lte') {
          if (!(valor <= esperado)) return false;
        } else if (op === '$gt') {
          if (!(valor > esperado)) return false;
        } else if (op === '$lt') {
          if (!(valor < esperado)) return false;
        } else {
          throw new Error('operador no soportado en el doble: ' + op);
        }
      }
    } else if (!igual(valor, cond)) {
      return false;
    }
  }
  return true;
}

function igual(a, b) {
  if (esOid(a) || esOid(b)) return String(a) === String(b);
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}

function ordenar(docs, orden) {
  if (!orden) return docs;
  const claves = Object.keys(orden);
  return docs.slice().sort((x, y) => {
    for (const k of claves) {
      const dir = orden[k] < 0 ? -1 : 1;
      const a = x[k];
      const b = y[k];
      if (a === b) continue;
      if (a === undefined || a === null) return 1 * dir;
      if (b === undefined || b === null) return -1 * dir;
      return (a < b ? -1 : 1) * dir;
    }
    return 0;
  });
}

function proyectar(doc, projection) {
  if (!projection) return doc;
  const claves = Object.keys(projection).filter((k) => projection[k]);
  if (!claves.length) return doc;
  const out = { _id: doc._id };
  for (const k of claves) if (doc[k] !== undefined) out[k] = doc[k];
  return out;
}

function aplicar(doc, cambio) {
  if (cambio.$set) Object.assign(doc, cambio.$set);
  if (cambio.$setOnInsert && doc.__nuevo) Object.assign(doc, cambio.$setOnInsert);
  if (cambio.$inc) {
    for (const k of Object.keys(cambio.$inc)) {
      doc[k] = (Number(doc[k]) || 0) + Number(cambio.$inc[k]);
    }
  }
  delete doc.__nuevo;
  return doc;
}

class Cursor {
  constructor(docs, opciones = {}) {
    this._docs = docs;
    this._opts = opciones;
    if (opciones.sort) this._docs = ordenar(this._docs, opciones.sort);
    if (opciones.limit) this._docs = this._docs.slice(0, opciones.limit);
  }
  sort(o) { this._docs = ordenar(this._docs, o); return this; }
  limit(n) { this._docs = this._docs.slice(0, n); return this; }
  async toArray() {
    return this._docs.map((d) => proyectar(JSON.parse(JSON.stringify(d), reviver), this._opts.projection));
  }
}

// Conserva ObjectId y Date al clonar
function reviver(k, v) {
  if (typeof v === 'string') {
    if (/^[0-9a-f]{24}$/.test(v) && (k === '_id' || k === 'registroId')) return new ObjectId(v);
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)) return new Date(v);
  }
  return v;
}

class Coleccion {
  constructor(nombre) {
    this.nombre = nombre;
    this.docs = [];
    this.indicesUnicos = [];
  }

  _clonar(d) { return JSON.parse(JSON.stringify(d), reviver); }

  async createIndex(spec, opciones = {}) {
    if (opciones.unique) this.indicesUnicos.push(Object.keys(spec));
    return 'idx';
  }

  _chequearUnicos(doc) {
    for (const claves of this.indicesUnicos) {
      const existe = this.docs.some((d) =>
        claves.every((k) => igual(d[k], doc[k])) && String(d._id) !== String(doc._id)
      );
      if (existe) {
        const err = new Error('E11000 duplicate key error');
        err.code = 11000;
        throw err;
      }
    }
  }

  find(filtro = {}, opciones = {}) {
    return new Cursor(this.docs.filter((d) => coincide(d, filtro)), opciones);
  }

  async findOne(filtro = {}, opciones = {}) {
    let hallados = this.docs.filter((d) => coincide(d, filtro));
    if (opciones.sort) hallados = ordenar(hallados, opciones.sort);
    return hallados.length ? this._clonar(hallados[0]) : null;
  }

  async insertOne(doc) {
    const nuevo = Object.assign({}, doc);
    if (!nuevo._id) nuevo._id = new ObjectId();
    this._chequearUnicos(nuevo);
    this.docs.push(nuevo);
    return { insertedId: nuevo._id, acknowledged: true };
  }

  async insertMany(docs, opciones = {}) {
    let n = 0;
    let ultimoError = null;
    for (const d of docs) {
      try { await this.insertOne(d); n++; }
      catch (e) { ultimoError = e; if (!opciones.ordered === false) { /* seguir */ } }
    }
    if (ultimoError && n === 0) throw ultimoError;
    return { insertedCount: n };
  }

  async updateOne(filtro, cambio, opciones = {}) {
    const idx = this.docs.findIndex((d) => coincide(d, filtro));
    if (idx === -1) {
      if (opciones.upsert) {
        const base = {};
        for (const k of Object.keys(filtro)) {
          if (typeof filtro[k] !== 'object' || esOid(filtro[k])) base[k] = filtro[k];
        }
        base.__nuevo = true;
        if (!base._id) base._id = new ObjectId();
        aplicar(base, cambio);
        this._chequearUnicos(base);
        this.docs.push(base);
        return { matchedCount: 0, modifiedCount: 0, upsertedId: base._id };
      }
      return { matchedCount: 0, modifiedCount: 0 };
    }
    aplicar(this.docs[idx], cambio);
    return { matchedCount: 1, modifiedCount: 1 };
  }

  async updateMany(filtro, cambio) {
    let n = 0;
    for (const d of this.docs) {
      if (coincide(d, filtro)) { aplicar(d, cambio); n++; }
    }
    return { matchedCount: n, modifiedCount: n };
  }

  async findOneAndUpdate(filtro, cambio, opciones = {}) {
    const idx = this.docs.findIndex((d) => coincide(d, filtro));
    if (idx === -1) {
      if (!opciones.upsert) return null;
      const base = {};
      for (const k of Object.keys(filtro)) {
        if (typeof filtro[k] !== 'object' || esOid(filtro[k])) base[k] = filtro[k];
      }
      base.__nuevo = true;
      if (!base._id) base._id = new ObjectId();
      aplicar(base, cambio);
      this.docs.push(base);
      return this._clonar(base);
    }
    const antes = this._clonar(this.docs[idx]);
    aplicar(this.docs[idx], cambio);
    return opciones.returnDocument === 'before' ? antes : this._clonar(this.docs[idx]);
  }

  async countDocuments(filtro = {}) {
    return this.docs.filter((d) => coincide(d, filtro)).length;
  }
}

class BaseFalsa {
  constructor() { this.colecciones = new Map(); }
  collection(nombre) {
    if (!this.colecciones.has(nombre)) this.colecciones.set(nombre, new Coleccion(nombre));
    return this.colecciones.get(nombre);
  }
}

module.exports = { BaseFalsa, Coleccion, ObjectId };

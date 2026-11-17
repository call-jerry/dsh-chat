
function isNullable(value) {
  return value === null || value === void 0;
}
function isPlainObject(data) {
  return data && typeof data === "object" && !Array.isArray(data);
}
function filterKeys(object, filter) {
  return Object.fromEntries(Object.entries(object).filter(([key, value]) => filter(key, value)));
}
function mapValues(object, transform) {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, transform(value, key)]));
}
function pick(source, keys, forced) {
  if (!keys) return { ...source };
  const result = {};
  for (const key of keys) if (forced || source[key] !== void 0) result[key] = source[key];
  return result;
}
var write = /* @__PURE__ */ Symbol.for("cosmokit.volatile.write");
function snapshot(value, ancestors = /* @__PURE__ */ new Set()) {
  if (typeof value === "function") throw new TypeError("volatile config cannot contain functions");
  if (value === null || typeof value !== "object") return value;
  if (ancestors.has(value)) throw new TypeError("volatile config cannot contain cycles");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return Object.freeze(value.map((item) => snapshot(item, ancestors)));
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError("volatile config objects must be plain objects or arrays");
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, snapshot(item, ancestors)])));
  } finally {
    ancestors.delete(value);
  }
}
function createVolatile(value) {
  let current = snapshot(value);
  return Object.freeze({
    get: () => current,
    [write]: (value2) => {
      current = value2;
    }
  });
}
function isVolatile(value) {
  return typeof value === "object" && value !== null && write in value;
}
function is(type, value) {
  if (arguments.length === 1) return (value2) => is(type, value2);
  return type in globalThis && value instanceof globalThis[type] || Object.prototype.toString.call(value).slice(8, -1) === type;
}
function isArrayBufferLike(value) {
  return is("ArrayBuffer", value) || is("SharedArrayBuffer", value);
}
function isArrayBufferSource(value) {
  return isArrayBufferLike(value) || ArrayBuffer.isView(value);
}
var Binary;
(function(Binary2) {
  Binary2.is = isArrayBufferLike;
  Binary2.isSource = isArrayBufferSource;
  function fromSource(source) {
    if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
    else return source;
  }
  Binary2.fromSource = fromSource;
  function toBase64(source) {
    source = fromSource(source);
    if (typeof Buffer !== "undefined") return Buffer.from(source).toString("base64");
    let binary = "";
    const bytes = new Uint8Array(source);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
  Binary2.toBase64 = toBase64;
  function fromBase64(source) {
    if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "base64"));
    return Uint8Array.from(atob(source), (c) => c.charCodeAt(0));
  }
  Binary2.fromBase64 = fromBase64;
  function toHex(source) {
    source = fromSource(source);
    if (typeof Buffer !== "undefined") return Buffer.from(source).toString("hex");
    return Array.from(new Uint8Array(source), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  Binary2.toHex = toHex;
  function fromHex(source) {
    if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "hex"));
    const hex = source.length % 2 === 0 ? source : source.slice(0, source.length - 1);
    const buffer = [];
    for (let i = 0; i < hex.length; i += 2) buffer.push(parseInt(`${hex[i]}${hex[i + 1]}`, 16));
    return Uint8Array.from(buffer).buffer;
  }
  Binary2.fromHex = fromHex;
})(Binary || (Binary = {}));
var base64ToArrayBuffer = Binary.fromBase64;
var arrayBufferToBase64 = Binary.toBase64;
var hexToArrayBuffer = Binary.fromHex;
var arrayBufferToHex = Binary.toHex;
function clone(source, refs = /* @__PURE__ */ new Map()) {
  if (!source || typeof source !== "object") return source;
  if (is("Date", source)) return new Date(source.valueOf());
  if (is("RegExp", source)) return new RegExp(source.source, source.flags);
  if (isArrayBufferLike(source)) return source.slice(0);
  if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
  const cached = refs.get(source);
  if (cached) return cached;
  if (Array.isArray(source)) {
    const result2 = [];
    refs.set(source, result2);
    source.forEach((value, index) => {
      result2[index] = Reflect.apply(clone, null, [value, refs]);
    });
    return result2;
  }
  const result = Object.create(Object.getPrototypeOf(source));
  refs.set(source, result);
  for (const key of Reflect.ownKeys(source)) {
    const descriptor = { ...Reflect.getOwnPropertyDescriptor(source, key) };
    if ("value" in descriptor) descriptor.value = Reflect.apply(clone, null, [descriptor.value, refs]);
    Reflect.defineProperty(result, key, descriptor);
  }
  return result;
}
function deepEqual(a, b, strict) {
  const ancestors = /* @__PURE__ */ new Set();
  function compare(a2, b2) {
    if (a2 === b2) return true;
    if (isVolatile(a2) || isVolatile(b2)) return isVolatile(a2) && isVolatile(b2);
    if (!strict && isNullable(a2) && isNullable(b2)) return true;
    if (typeof a2 !== typeof b2 || typeof a2 !== "object" || !a2 || !b2) return false;
    if (ancestors.has(a2)) return false;
    function check(test, then) {
      return test(a2) ? test(b2) ? then(a2, b2) : false : test(b2) ? false : void 0;
    }
    ancestors.add(a2);
    try {
      return check(Array.isArray, (a3, b3) => {
        if (a3.length !== b3.length) return false;
        for (let index = 0; index < a3.length; index++) if (!compare(a3[index], b3[index])) return false;
        return true;
      }) ?? check(is("Date"), (a3, b3) => a3.valueOf() === b3.valueOf()) ?? check(is("URL"), (a3, b3) => a3.href === b3.href) ?? check(is("RegExp"), (a3, b3) => a3.source === b3.source && a3.flags === b3.flags) ?? check(isArrayBufferLike, (a3, b3) => {
        if (a3.byteLength !== b3.byteLength) return false;
        const viewA = new Uint8Array(a3);
        const viewB = new Uint8Array(b3);
        for (let i = 0; i < viewA.length; i++) if (viewA[i] !== viewB[i]) return false;
        return true;
      }) ?? ((!strict || [a2, b2].every((value) => Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) && Object.keys({
        ...a2,
        ...b2
      }).every((key) => compare(a2[key], b2[key])));
    } finally {
      ancestors.delete(a2);
    }
  }
  return compare(a, b);
}
var Time;
(function(Time2) {
  Time2.millisecond = 1;
  Time2.second = 1e3;
  Time2.minute = Time2.second * 60;
  Time2.hour = Time2.minute * 60;
  Time2.day = Time2.hour * 24;
  Time2.week = Time2.day * 7;
  let timezoneOffset = (/* @__PURE__ */ new Date()).getTimezoneOffset();
  function setTimezoneOffset(offset) {
    timezoneOffset = offset;
  }
  Time2.setTimezoneOffset = setTimezoneOffset;
  function getTimezoneOffset() {
    return timezoneOffset;
  }
  Time2.getTimezoneOffset = getTimezoneOffset;
  function getDateNumber(date2 = /* @__PURE__ */ new Date(), offset) {
    if (typeof date2 === "number") date2 = new Date(date2);
    if (offset === void 0) offset = timezoneOffset;
    return Math.floor((date2.valueOf() / Time2.minute - offset) / 1440);
  }
  Time2.getDateNumber = getDateNumber;
  function fromDateNumber(value, offset) {
    const date2 = new Date(value * Time2.day);
    if (offset === void 0) offset = timezoneOffset;
    return new Date(+date2 + offset * Time2.minute);
  }
  Time2.fromDateNumber = fromDateNumber;
  const numeric = /\d+(?:\.\d+)?/.source;
  const timeRegExp = new RegExp(`^${[
    "w(?:eek(?:s)?)?",
    "d(?:ay(?:s)?)?",
    "h(?:our(?:s)?)?",
    "m(?:in(?:ute)?(?:s)?)?",
    "s(?:ec(?:ond)?(?:s)?)?"
  ].map((unit) => `(${numeric}${unit})?`).join("")}$`);
  function parseTime(source) {
    const capture = timeRegExp.exec(source);
    if (!capture) return 0;
    return (parseFloat(capture[1]) * Time2.week || 0) + (parseFloat(capture[2]) * Time2.day || 0) + (parseFloat(capture[3]) * Time2.hour || 0) + (parseFloat(capture[4]) * Time2.minute || 0) + (parseFloat(capture[5]) * Time2.second || 0);
  }
  Time2.parseTime = parseTime;
  function parseDate(date2) {
    const parsed = parseTime(date2);
    if (parsed) date2 = Date.now() + parsed;
    else if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(date2)) date2 = `${(/* @__PURE__ */ new Date()).toLocaleDateString()}-${date2}`;
    else if (/^\d{1,2}-\d{1,2}-\d{1,2}(:\d{1,2}){1,2}$/.test(date2)) date2 = `${(/* @__PURE__ */ new Date()).getFullYear()}-${date2}`;
    return date2 ? new Date(date2) : /* @__PURE__ */ new Date();
  }
  Time2.parseDate = parseDate;
  function format(ms) {
    const abs = Math.abs(ms);
    if (abs >= Time2.day - Time2.hour / 2) return Math.round(ms / Time2.day) + "d";
    else if (abs >= Time2.hour - Time2.minute / 2) return Math.round(ms / Time2.hour) + "h";
    else if (abs >= Time2.minute - Time2.second / 2) return Math.round(ms / Time2.minute) + "m";
    else if (abs >= Time2.second) return Math.round(ms / Time2.second) + "s";
    return ms + "ms";
  }
  Time2.format = format;
  function toDigits(source, length = 2) {
    return source.toString().padStart(length, "0");
  }
  Time2.toDigits = toDigits;
  function template(template2, time = /* @__PURE__ */ new Date()) {
    return template2.replace("yyyy", time.getFullYear().toString()).replace("yy", time.getFullYear().toString().slice(2)).replace("MM", toDigits(time.getMonth() + 1)).replace("dd", toDigits(time.getDate())).replace("hh", toDigits(time.getHours())).replace("mm", toDigits(time.getMinutes())).replace("ss", toDigits(time.getSeconds())).replace("SSS", toDigits(time.getMilliseconds(), 3));
  }
  Time2.template = template;
})(Time || (Time = {}));


var kSchema = /* @__PURE__ */ Symbol.for("schemastery");
var kValidationError = /* @__PURE__ */ Symbol.for("ValidationError");
globalThis.__schemastery_index__ ??= 0;
globalThis.__schemastery_refs__ = void 0;
var ValidationError = class extends TypeError {
  options;
  name = "ValidationError";
  constructor(message, options) {
    let prefix = "$";
    for (const segment of options.path || []) if (typeof segment === "string") prefix += "." + segment;
    else if (typeof segment === "number") prefix += "[" + segment + "]";
    else if (typeof segment === "symbol") prefix += `[Symbol(${segment.toString()})]`;
    if (prefix.startsWith(".")) prefix = prefix.slice(1);
    super((prefix === "$" ? "" : `${prefix} `) + message);
    this.options = options;
  }
  static is(error) {
    return !!error?.[kValidationError];
  }
};
Object.defineProperty(ValidationError.prototype, kValidationError, { value: true });
var Schema = function(options) {
  const schema = function(data, options2 = {}) {
    return Schema.resolve(data, schema, options2)[0];
  };
  if (options.refs) {
    const refs = mapValues(options.refs, (options2) => new Schema(options2));
    const getRef = (uid) => refs[uid];
    for (const key in refs) {
      const options2 = refs[key];
      options2.sKey = getRef(options2.sKey);
      options2.inner = getRef(options2.inner);
      options2.list = options2.list && options2.list.map(getRef);
      options2.dict = options2.dict && mapValues(options2.dict, getRef);
    }
    return refs[options.uid];
  }
  Object.assign(schema, options);
  if (typeof schema.callback === "string") try {
    schema.callback = new Function("return " + schema.callback)();
  } catch {
  }
  Object.defineProperty(schema, "uid", { value: globalThis.__schemastery_index__++ });
  Object.setPrototypeOf(schema, Schema.prototype);
  schema.meta ||= {};
  schema.toString = schema.toString.bind(schema);
  return schema;
};
Schema.prototype = Object.create(Function.prototype);
Schema.prototype[kSchema] = true;
Object.defineProperty(Schema.prototype, "~standard", { get() {
  return {
    version: 1,
    vendor: "schemastery",
    validate: (value) => {
      try {
        return { value: Schema.resolve(value, this, {})[0] };
      } catch (error) {
        if (ValidationError.is(error)) return { issues: [{
          message: error.message,
          path: error.options.path
        }] };
        throw error;
      }
    }
  };
} });
Schema.ValidationError = ValidationError;
Schema.prototype.toJSON = function toJSON() {
  if (globalThis.__schemastery_refs__) {
    globalThis.__schemastery_refs__[this.uid] ??= JSON.parse(JSON.stringify({ ...this }));
    return this.uid;
  }
  globalThis.__schemastery_refs__ = { [this.uid]: { ...this } };
  globalThis.__schemastery_refs__[this.uid] = JSON.parse(JSON.stringify({ ...this }));
  const result = {
    uid: this.uid,
    refs: globalThis.__schemastery_refs__
  };
  globalThis.__schemastery_refs__ = void 0;
  return result;
};
Schema.prototype.set = function set(key, value) {
  this.dict[key] = value;
  return this;
};
Schema.prototype.push = function push(value) {
  this.list.push(value);
  return this;
};
function mergeDesc(original, messages) {
  const result = typeof original === "string" ? { "": original } : { ...original };
  for (const locale in messages) {
    const value = messages[locale];
    if (value?.$description || value?.$desc) result[locale] = value.$description || value.$desc;
    else if (typeof value === "string") result[locale] = value;
  }
  return result;
}
function getInner(value) {
  return value?.$value ?? value?.$inner;
}
function extractKeys(data) {
  return filterKeys(data ?? {}, (key) => !key.startsWith("$"));
}
Schema.prototype.i18n = function i18n(messages) {
  const schema = Schema(this);
  const desc = mergeDesc(schema.meta.description, messages);
  if (Object.keys(desc).length) schema.meta.description = desc;
  if (schema.dict) schema.dict = mapValues(schema.dict, (inner, key) => {
    return inner.i18n(mapValues(messages, (data) => getInner(data)?.[key] ?? data?.[key]));
  });
  if (schema.list) schema.list = schema.list.map((inner, index) => {
    return inner.i18n(mapValues(messages, (data = {}) => {
      if (Array.isArray(getInner(data))) return getInner(data)[index];
      if (Array.isArray(data)) return data[index];
      return extractKeys(data);
    }));
  });
  if (schema.inner) schema.inner = schema.inner.i18n(mapValues(messages, (data) => {
    if (getInner(data)) return getInner(data);
    return extractKeys(data);
  }));
  if (schema.sKey) schema.sKey = schema.sKey.i18n(mapValues(messages, (data) => data?.$key));
  return schema;
};
Schema.prototype.extra = function extra(key, value) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
};
for (const key of [
  "required",
  "disabled",
  "collapse",
  "hidden",
  "loose"
]) Object.assign(Schema.prototype, { [key](value = true) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
} });
Schema.prototype.deprecated = function deprecated() {
  const schema = Schema(this);
  schema.meta.badges ||= [];
  schema.meta.badges.push({
    text: "deprecated",
    type: "danger"
  });
  return schema;
};
Schema.prototype.experimental = function experimental() {
  const schema = Schema(this);
  schema.meta.badges ||= [];
  schema.meta.badges.push({
    text: "experimental",
    type: "warning"
  });
  return schema;
};
Schema.prototype.pattern = function pattern(regexp) {
  const schema = Schema(this);
  const pattern2 = pick(regexp, ["source", "flags"]);
  schema.meta = {
    ...schema.meta,
    pattern: pattern2
  };
  return schema;
};
Schema.prototype.simplify = function simplify(value) {
  if (isVolatile(value)) value = value.get();
  if (deepEqual(value, this.meta.default, this.type === "dict")) return null;
  if (isNullable(value)) return value;
  if (this.type === "object" || this.type === "dict") {
    const result = {};
    for (const key in value) {
      const item = (this.type === "object" ? this.dict[key] : this.inner)?.simplify(value[key]);
      if (this.type === "dict" || !isNullable(item)) result[key] = item;
    }
    if (deepEqual(result, this.meta.default, this.type === "dict")) return null;
    return result;
  } else if (this.type === "array" || this.type === "tuple") {
    const result = [];
    value.forEach((value2, index) => {
      const schema = this.type === "array" ? this.inner : this.list[index];
      const item = schema ? schema.simplify(value2) : value2;
      result.push(item);
    });
    return result;
  } else if (this.type === "intersect") {
    const result = {};
    for (const item of this.list) Object.assign(result, item.simplify(value));
    return result;
  } else if (this.type === "union") for (const schema of this.list) try {
    Schema.resolve(value, schema, {});
    return schema.simplify(value);
  } catch {
  }
  return value;
};
Schema.prototype.toString = function toString(inline) {
  return formatters[this.type]?.(this, inline) ?? `Schema<${this.type}>`;
};
Schema.prototype.role = function role(role, extra2) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    role,
    extra: extra2
  };
  return schema;
};
for (const key of [
  "default",
  "link",
  "comment",
  "description",
  "max",
  "min",
  "step"
]) Object.assign(Schema.prototype, { [key](value) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
} });
Schema.prototype.volatile = function volatile() {
  if (this.meta.volatile) throw new TypeError("volatile schema is already wrapped");
  return this.extra("volatile", true);
};
var resolvers = {};
var checkedVolatile = /* @__PURE__ */ Symbol("checked-volatile-schema");
function validateVolatileSchema(schema, path = [], blocked = false, seen = /* @__PURE__ */ new Map()) {
  const states = seen.get(schema) ?? /* @__PURE__ */ new Set();
  if (states.has(blocked)) return;
  states.add(blocked);
  seen.set(schema, states);
  if (schema.meta?.volatile && blocked) throw new ValidationError("volatile fields require a fixed object path without an enclosing volatile field", { path });
  const nested = blocked || !!schema.meta?.volatile;
  if (schema.dict) for (const [key, child] of Object.entries(schema.dict)) validateVolatileSchema(child, [...path, key], nested, seen);
  if (schema.sKey) validateVolatileSchema(schema.sKey, [...path, "<key>"], true, seen);
  if (schema.inner && (schema.type !== "lazy" || schema.inner[kSchema])) validateVolatileSchema(schema.inner, [...path, "*"], true, seen);
  if (schema.list) for (let index = 0; index < schema.list.length; index++) validateVolatileSchema(schema.list[index], [...path, String(index)], true, seen);
}
Schema.extend = function extend(type, resolve2) {
  resolvers[type] = resolve2;
};
Schema.resolve = function resolve(data, schema, options = {}, strict = false) {
  if (!schema) return [data];
  if (!options[checkedVolatile]) {
    validateVolatileSchema(schema, options.path);
    options = {
      ...options,
      [checkedVolatile]: true
    };
  }
  if (schema.meta?.volatile) {
    const inner = Schema(schema);
    inner.meta = {
      ...schema.meta,
      volatile: false
    };
    const [value, adapted] = Schema.resolve(data, inner, options, strict);
    try {
      return [createVolatile(value), adapted];
    } catch (error) {
      throw new ValidationError(error instanceof Error ? error.message : String(error), options);
    }
  }
  if (options.ignore?.(data, schema)) return [data];
  if (isNullable(data) && schema.type !== "lazy") {
    if (schema.meta.required) throw new ValidationError(`missing required value`, options);
    let current = schema;
    let fallback = schema.meta.default;
    while (current?.type === "intersect" && isNullable(fallback)) {
      current = current.list[0];
      fallback = current?.meta.default;
    }
    if (isNullable(fallback)) return [data];
    data = clone(fallback);
  }
  const callback = resolvers[schema.type];
  if (!callback) throw new ValidationError(`unsupported type "${schema.type}"`, options);
  try {
    return callback(data, schema, options, strict);
  } catch (error) {
    if (!schema.meta.loose) throw error;
    return [schema.meta.default];
  }
};
Schema.from = function from(source) {
  if (isNullable(source)) return Schema.any();
  else if ([
    "string",
    "number",
    "boolean"
  ].includes(typeof source)) return Schema.const(source).required();
  else if (source[kSchema]) return source;
  else if (typeof source === "function") switch (source) {
    case String:
      return Schema.string().required();
    case Number:
      return Schema.number().required();
    case Boolean:
      return Schema.boolean().required();
    case Function:
      return Schema.function().required();
    default:
      return Schema.is(source).required();
  }
  else throw new TypeError(`cannot infer schema from ${source}`);
};
Schema.lazy = function lazy(builder) {
  const toJSON2 = () => {
    if (!schema.inner[kSchema]) {
      schema.inner = schema.builder();
      schema.inner.meta = {
        ...schema.meta,
        ...schema.inner.meta
      };
    }
    return schema.inner.toJSON();
  };
  const schema = new Schema({
    type: "lazy",
    builder,
    inner: { toJSON: toJSON2 }
  });
  return schema;
};
Schema.natural = function natural() {
  return Schema.number().step(1).min(0);
};
Schema.percent = function percent() {
  return Schema.number().step(0.01).min(0).max(1).role("slider");
};
Schema.date = function date() {
  return Schema.union([Schema.is(Date), Schema.transform(Schema.string().role("datetime"), (value, options) => {
    const date2 = new Date(value);
    if (isNaN(+date2)) throw new ValidationError(`invalid date "${value}"`, options);
    return date2;
  }, true)]);
};
Schema.regExp = function regExp(flag = "") {
  return Schema.union([Schema.is(RegExp), Schema.transform(Schema.string().role("regexp", { flag }), (value, options) => {
    try {
      return new RegExp(value, flag);
    } catch (e) {
      throw new ValidationError(e.message, options);
    }
  }, true)]);
};
Schema.arrayBuffer = function arrayBuffer(encoding) {
  return Schema.union([
    Schema.is(ArrayBuffer),
    Schema.is(SharedArrayBuffer),
    Schema.transform(Schema.any(), (value, options) => {
      if (Binary.isSource(value)) return Binary.fromSource(value);
      throw new ValidationError(`expected ArrayBufferSource but got ${value}`, options);
    }, true),
    ...encoding ? [Schema.transform(Schema.string(), (value, options) => {
      try {
        return encoding === "base64" ? Binary.fromBase64(value) : Binary.fromHex(value);
      } catch (e) {
        throw new ValidationError(e.message, options);
      }
    }, true)] : []
  ]);
};
Schema.extend("lazy", (data, schema, options, strict) => {
  if (!schema.inner[kSchema]) {
    schema.inner = schema.builder();
    schema.inner.meta = {
      ...schema.meta,
      ...schema.inner.meta
    };
    validateVolatileSchema(schema.inner, options.path, true);
  }
  return Schema.resolve(data, schema.inner, options, strict);
});
Schema.extend("any", (data) => {
  return [data];
});
Schema.extend("never", (data, _, options) => {
  throw new ValidationError(`expected nullable but got ${data}`, options);
});
Schema.extend("const", (data, { value }, options) => {
  if (deepEqual(data, value)) return [value];
  throw new ValidationError(`expected ${value} but got ${data}`, options);
});
function checkWithinRange(data, meta, description, options, skipMin = false) {
  const { max = Infinity, min = -Infinity } = meta;
  if (data > max) throw new ValidationError(`expected ${description} <= ${max} but got ${data}`, options);
  if (data < min && !skipMin) throw new ValidationError(`expected ${description} >= ${min} but got ${data}`, options);
}
Schema.extend("string", (data, { meta }, options) => {
  if (typeof data !== "string") throw new ValidationError(`expected string but got ${data}`, options);
  if (meta.pattern) {
    const regexp = new RegExp(meta.pattern.source, meta.pattern.flags);
    if (!regexp.test(data)) throw new ValidationError(`expect string to match regexp ${regexp}`, options);
  }
  checkWithinRange(data.length, meta, "string length", options);
  return [data];
});
function decimalShift(data, digits) {
  const str = data.toString();
  if (str.includes("e")) return data * Math.pow(10, digits);
  const index = str.indexOf(".");
  if (index === -1) return data * Math.pow(10, digits);
  const frac = str.slice(index + 1);
  const integer = str.slice(0, index);
  if (frac.length <= digits) return +(integer + frac.padEnd(digits, "0"));
  return +(integer + frac.slice(0, digits) + "." + frac.slice(digits));
}
function isMultipleOf(data, min, step) {
  step = Math.abs(step);
  if (!/^\d+\.\d+$/.test(step.toString())) return (data - min) % step === 0;
  const index = step.toString().indexOf(".");
  const digits = step.toString().slice(index + 1).length;
  return Math.abs(decimalShift(data, digits) - decimalShift(min, digits)) % decimalShift(step, digits) === 0;
}
Schema.extend("number", (data, { meta }, options) => {
  if (typeof data !== "number") throw new ValidationError(`expected number but got ${data}`, options);
  checkWithinRange(data, meta, "number", options);
  const { step } = meta;
  if (step && !isMultipleOf(data, meta.min ?? 0, step)) throw new ValidationError(`expected number multiple of ${step} but got ${data}`, options);
  return [data];
});
Schema.extend("boolean", (data, _, options) => {
  if (typeof data === "boolean") return [data];
  throw new ValidationError(`expected boolean but got ${data}`, options);
});
Schema.extend("bitset", (data, { bits, meta }, options) => {
  let value = 0, keys = [];
  if (typeof data === "number") {
    value = data;
    for (const key in bits) if (data & bits[key]) keys.push(key);
  } else if (Array.isArray(data)) {
    keys = data;
    for (const key of keys) {
      if (typeof key !== "string") throw new ValidationError(`expected string but got ${key}`, options);
      if (key in bits) value |= bits[key];
    }
  } else throw new ValidationError(`expected number or array but got ${data}`, options);
  if (value === meta.default) return [value];
  return [value, keys];
});
Schema.extend("function", (data, _, options) => {
  if (typeof data === "function") return [data];
  throw new ValidationError(`expected function but got ${data}`, options);
});
Schema.extend("is", (data, { constructor }, options) => {
  if (typeof constructor === "function") {
    if (data instanceof constructor) return [data];
    throw new ValidationError(`expected ${constructor.name} but got ${data}`, options);
  } else {
    if (isNullable(data)) throw new ValidationError(`expected ${constructor} but got ${data}`, options);
    let prototype = Object.getPrototypeOf(data);
    while (prototype) {
      if (prototype.constructor?.name === constructor) return [data];
      prototype = Object.getPrototypeOf(prototype);
    }
    throw new ValidationError(`expected ${constructor} but got ${data}`, options);
  }
});
function property(data, key, schema, options) {
  try {
    const [value, adapted] = Schema.resolve(data[key], schema, {
      ...options,
      path: [...options.path || [], key]
    });
    if (adapted !== void 0) data[key] = adapted;
    return value;
  } catch (e) {
    if (!options?.autofix) throw e;
    delete data[key];
    return schema.meta.volatile ? createVolatile(schema.meta.default) : schema.meta.default;
  }
}
Schema.extend("array", (data, { inner, meta }, options) => {
  if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
  checkWithinRange(data.length, meta, "array length", options, !isNullable(inner.meta.default));
  return [data.map((_, index) => property(data, index, inner, options))];
});
Schema.extend("dict", (data, { inner, sKey }, options, strict) => {
  if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
  const result = {};
  for (const key in data) {
    let rKey;
    try {
      rKey = Schema.resolve(key, sKey, options)[0];
    } catch (error) {
      if (strict) continue;
      throw error;
    }
    result[rKey] = property(data, key, inner, options);
    data[rKey] = data[key];
    if (key !== rKey) delete data[key];
  }
  return [result];
});
Schema.extend("tuple", (data, { list }, options, strict) => {
  if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
  const result = list.map((inner, index) => property(data, index, inner, options));
  if (strict) return [result];
  result.push(...data.slice(list.length));
  return [result];
});
function merge(result, data) {
  for (const key in data) {
    if (key in result) continue;
    result[key] = data[key];
  }
}
Schema.extend("object", (data, { dict }, options, strict) => {
  if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
  const result = {};
  for (const key in dict) {
    const value = property(data, key, dict[key], options);
    if (!isNullable(value) || key in data) result[key] = value;
  }
  if (!strict) merge(result, data);
  return [result];
});
Schema.extend("union", (data, { list, toString: toString2 }, options, strict) => {
  const messages = [];
  for (const inner of list) try {
    return Schema.resolve(data, inner, options, strict);
  } catch (error) {
    messages.push(error);
  }
  throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
});
Schema.extend("intersect", (data, { list, toString: toString2 }, options, strict) => {
  if (!list.length) return [data];
  let result;
  for (const inner of list) {
    const value = Schema.resolve(data, inner, options, true)[0];
    if (isNullable(value)) continue;
    if (isNullable(result)) result = value;
    else if (typeof result !== typeof value) throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
    else if (typeof value === "object") merge(result ??= {}, value);
    else if (result !== value) throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
  }
  if (!strict && isPlainObject(data)) merge(result, data);
  return [result];
});
Schema.extend("transform", (data, { inner, callback, preserve }, options) => {
  const [result, adapted = data] = Schema.resolve(data, inner, options, true);
  if (preserve) return [callback(result)];
  else return [callback(result), callback(adapted)];
});
var formatters = {};
function defineMethod(name2, keys, format) {
  formatters[name2] = format;
  Object.assign(Schema, { [name2](...args) {
    const schema = new Schema({ type: name2 });
    keys.forEach((key, index) => {
      switch (key) {
        case "sKey":
          schema.sKey = args[index] ?? Schema.string();
          break;
        case "inner":
          schema.inner = Schema.from(args[index]);
          break;
        case "list":
          schema.list = args[index].map(Schema.from);
          break;
        case "dict":
          schema.dict = mapValues(args[index], Schema.from);
          break;
        case "bits":
          schema.bits = {};
          for (const key2 in args[index]) {
            if (typeof args[index][key2] !== "number") continue;
            schema.bits[key2] = args[index][key2];
          }
          break;
        case "callback": {
          const callback = schema.callback = args[index];
          callback["toJSON"] ||= () => callback.toString();
          break;
        }
        case "constructor": {
          const constructor = schema.constructor = args[index];
          if (typeof constructor === "function") constructor["toJSON"] ||= () => constructor["name"];
          break;
        }
        default:
          schema[key] = args[index];
      }
    });
    if (name2 === "object" || name2 === "dict") schema.meta.default = {};
    else if (name2 === "array" || name2 === "tuple") schema.meta.default = [];
    else if (name2 === "bitset") schema.meta.default = 0;
    return schema;
  } });
}
defineMethod("is", ["constructor"], ({ constructor }) => {
  if (typeof constructor === "function") return constructor.name;
  else return constructor;
});
defineMethod("any", [], () => "any");
defineMethod("never", [], () => "never");
defineMethod("const", ["value"], ({ value }) => typeof value === "string" ? JSON.stringify(value) : value);
defineMethod("string", [], () => "string");
defineMethod("number", [], () => "number");
defineMethod("boolean", [], () => "boolean");
defineMethod("bitset", ["bits"], () => "bitset");
defineMethod("function", [], () => "function");
defineMethod("array", ["inner"], ({ inner }) => `${inner.toString(true)}[]`);
defineMethod("dict", ["inner", "sKey"], ({ inner, sKey }) => `{ [key: ${sKey.toString()}]: ${inner.toString()} }`);
defineMethod("tuple", ["list"], ({ list }) => `[${list.map((inner) => inner.toString()).join(", ")}]`);
defineMethod("object", ["dict"], ({ dict }) => {
  if (Object.keys(dict).length === 0) return "{}";
  return `{ ${Object.entries(dict).map(([key, inner]) => {
    return `${key}${inner.meta.required ? "" : "?"}: ${inner.toString()}`;
  }).join(", ")} }`;
});
defineMethod("union", ["list"], ({ list }, inline) => {
  const result = list.map(({ toString: format }) => format()).join(" | ");
  return inline ? `(${result})` : result;
});
defineMethod("intersect", ["list"], ({ list }) => {
  return `${list.map((inner) => inner.toString(true)).join(" & ")}`;
});
defineMethod("transform", [
  "inner",
  "callback",
  "preserve"
], ({ inner }, isInner) => inner.toString(isInner));

// src/index.ts
import { homedir } from "node:os";
import { join } from "node:path";

// src/proxy.ts
import { createServer } from "node:http";
import { request as httpsRequest } from "node:https";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
var CHAT_HOST = "chat.deepseek.com";
var STATIC_HOST = "fe-static.deepseek.com";
var STATIC_PREFIX = "/__static";
var DEFAULT_PORT = 18190;
var API_PREFIX = "/api/";
var UPSTREAM_IDLE_TIMEOUT_MS = 10 * 6e4;
var HOP_BY_HOP = /* @__PURE__ */ new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);
var STRIPPED_RESPONSE_HEADERS = /* @__PURE__ */ new Set([
  "content-security-policy",
  "content-security-policy-report-only",
  "x-frame-options",
  "strict-transport-security",
  "access-control-allow-origin",
  "access-control-allow-credentials",
  "access-control-allow-methods",
  "access-control-allow-headers",
  "access-control-expose-headers",
  "access-control-max-age"
]);
var DROPPED_REQUEST_HEADERS = /* @__PURE__ */ new Set(["host", "connection"]);
function rebindSetCookie(raw) {
  return raw.split(";").filter((part) => {
    const name2 = part.split("=")[0]?.trim().toLowerCase();
    return name2 !== "domain" && name2 !== "secure";
  }).join(";");
}
var REWRITE_PATTERN = new RegExp(
  [
    `https://${STATIC_HOST.replaceAll(".", "\\.")}`,
    `//${STATIC_HOST.replaceAll(".", "\\.")}`,
    `https://${CHAT_HOST.replaceAll(".", "\\.")}`,
    // The unquoted alternative must stop at `>` or whitespace: `\S+` alone would
    // swallow the rest of the tag (`integrity=sha384-x></script>`), which
    // truncated the markup. Quoted values are bounded by their own quote.
    String.raw`\s+integrity\s*=\s*(?:"sha[^"]*"|'sha[^']*'|sha[^\s>]+)`
  ].join("|"),
  "gi"
);
function rewriteBody(body) {
  return body.replace(REWRITE_PATTERN, (match) => {
    if (match.trimStart().toLowerCase().startsWith("integrity")) return "";
    if (match.includes(STATIC_HOST)) return STATIC_PREFIX;
    return "";
  });
}
var WECHAT_SHIM = `<script data-dsh-proxy-shim>(function(){
  /**
   * REPLACE THE QR WITH A NOTICE.
   *
   * WeChat OAuth cannot be completed inside this panel, and the reason is not
   * fixable at the plugin level:
   *
   *   1. qrconnect only accepts a redirect_uri on the appId's REGISTERED domain.
   *      Verified against the live endpoint: https://chat.deepseek.com/... returns a
   *      43 KiB QR page, while http://127.0.0.1, https://127.0.0.1 and
   *      http://localhost all return the 882-byte "redirect_uri \u53C2\u6570\u9519\u8BEF" page.
   *   2. So the OAuth code is only ever delivered to chat.deepseek.com, and the
   *      session cookie is set there. This panel runs on 127.0.0.1, a different
   *      origin: it can neither read that cookie nor receive the code.
   *   3. Serving the panel from chat.deepseek.com would need the browser to resolve
   *      that name to 127.0.0.1 plus a trusted certificate for it \u2014 i.e. editing the
   *      hosts file and installing a CA. A plugin cannot do that.
   *
   * The WeChat TAB is kept (removing it would be more surprising than explaining
   * it), but the QR area shows a notice instead of a code that can be scanned and
   * then goes nowhere.
   *
   * PHONE/SMS/PASSWORD LOGIN IS UNAFFECTED and remains the supported path.
   */
  var NOTICE_TEXT = '\u5FAE\u4FE1\u767B\u5F55\u6682\u4E0D\u53EF\u7528';

  /**
   * Build the notice block that replaces the QR.
   *
   * Sized 200x200 to match the real QR iframe exactly (the slot is 238x200 and centres
   * its child, so this lands on the same pixels and nothing reflows).
   */
  function makeNotice() {
    var box = document.createElement('div');
    box.setAttribute('data-dsh-wechat-notice', '');
    box.textContent = NOTICE_TEXT;
    box.style.cssText = [
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'box-sizing:border-box',
      'flex:0 0 auto',
      'margin:0',
      'padding:16px',
      'width:200px',
      'height:200px',
      'border-radius:8px',
      'border:1px dashed currentColor',
      // NOT "color: inherit": the slot inherits the document default, which computes
      // to purple, so the text came out pink. The colour is set explicitly below.
      'color:#8a8f98',
      'opacity:.75',
      'font-size:13px',
      'line-height:1.6',
      'text-align:center',
      'user-select:none',
    ].join(';');
    return box;
  }

  /**
   * Put the notice where the QR would be.
   *
   * ONLY into the widget's own container (id "wxLogin"). That container is the QR
   * slot: 238x200 inside the 240px-wide WeChat block, with the "\u5FAE\u4FE1\u626B\u7801\u767B\u5F55" label
   * stacked above it. Filling it inherits the page's own layout, so nothing moves.
   *
   * Do NOT fall back to a nearby ancestor. The WeChat block is a 240px flex row, so
   * inserting the notice as the label's sibling squeezes the label to 40px, its text
   * turns vertical and the notice is pinned to its right \u2014 the whole column reads as
   * misaligned. If the container is not there yet, wait: the observer below runs long
   * enough for React to render it.
   */
  function showNotice() {
    var slot = document.querySelector('#wxLogin, [id*="wxLogin"]');
    if (slot === null) return false;

    if (slot.querySelector('[data-dsh-wechat-notice]') !== null) return true;
    // A real QR is present (e.g. WeChat relaxed its policy) \u2014 leave it alone.
    if (slot.querySelector('iframe') !== null) return true;

    var box = makeNotice();
    // Borrow the page's own text colour so light/dark mode both look native.
    var label = document.querySelector('[class*="wechat-block__description"]');
    if (label !== null) {
      var inherited = window.getComputedStyle(label).color;
      if (inherited !== '') box.style.color = inherited;
    }
    slot.appendChild(box);
    return true;
  }

  /**
   * Belt and braces: stop the widget from ever rendering.
   *
   * The SPA loads the vendor script and calls new window.WxLogin(...). Neutralising
   * the global means no dead QR can appear, whatever path selects the WeChat tab.
   * The empty container is then filled with the notice by showNotice().
   */
  function neutralise() {
    function Stub() {}
    Stub.prototype = { __dshDisabled: true };
    try {
      Object.defineProperty(window, 'WxLogin', {
        configurable: true,
        get: function () { return Stub; },
        set: function () { /* ignore the vendor assignment */ },
      });
    } catch (e) {
      /* a locked-down window: the notice below still applies */
    }
  }

  neutralise();

  /**
   * The QR slot is rendered only once the WeChat tab is selected, which can happen at
   * any time \u2014 right after load if that tab is restored, or minutes later when the
   * user clicks it. So: watch the DOM for the first few seconds (covers the restored
   * case), and re-check after any click (covers the manual case) instead of keeping a
   * subtree observer on the whole document forever.
   */
  function recheck() {
    if (document.querySelector('[data-dsh-wechat-notice]') !== null) return;
    showNotice();
  }

  function recheckAfterClick() {
    if (document.querySelector('[data-dsh-wechat-notice]') !== null) return;
    recheck();
    // React renders on the next frame, so follow up a few times.
    setTimeout(recheck, 80);
    setTimeout(recheck, 300);
    setTimeout(recheck, 900);
  }

  try {
    var observer = new MutationObserver(function () { showNotice(); });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    // Stop watching once the page settles, so this does not run forever.
    setTimeout(function () { observer.disconnect(); }, 15000);
  } catch (e) {}

  showNotice();
  document.addEventListener('DOMContentLoaded', showNotice, false);
  document.addEventListener('click', recheckAfterClick, true);
})();</script>`;
var SHARE_SHIM = `<script data-dsh-proxy-shim>(function(){
  var PUBLIC_ORIGIN = 'https://chat.deepseek.com';
  var NEEDLE_PATH = '/share/';

  function localOrigin() {
    return window.location.origin;
  }

  /** Swap the local origin for the public one on /share/ URLs only. */
  function rewrite(text) {
    if (typeof text !== 'string' || text === '') return text;
    var needle = localOrigin() + NEEDLE_PATH;
    if (text.indexOf(needle) === -1) return text;
    return text.split(needle).join(PUBLIC_ORIGIN + NEEDLE_PATH);
  }

  // 1. The clipboard API. The bundle's "create and copy" calls this directly.
  try {
    var clip = navigator.clipboard;
    if (clip && typeof clip.writeText === 'function') {
      var writeText = clip.writeText;
      // Shadowing on the instance keeps the rest of the API untouched.
      clip.writeText = function (text) {
        return writeText.call(clip, rewrite(text));
      };
    }
  } catch (e) {
    /* clipboard blocked: the copy listener below still covers keyboard copies */
  }

  // 2. Selection-based copies (Ctrl+C, document.execCommand('copy')).
  function selectedText() {
    var el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') &&
        typeof el.selectionStart === 'number') {
      return String(el.value).slice(el.selectionStart, el.selectionEnd);
    }
    var selection = window.getSelection ? window.getSelection() : null;
    return selection === null ? '' : String(selection);
  }

  document.addEventListener('copy', function (event) {
    var text = selectedText();
    var fixed = rewrite(text);
    if (fixed === text) return;
    if (event.clipboardData === null || event.clipboardData === undefined) return;
    event.preventDefault();
    event.clipboardData.setData('text/plain', fixed);
  }, true);

  // 3. What the dialog SHOWS. React owns these nodes, so this is applied on demand
  //    (after a click) rather than with a permanent observer, and it is idempotent:
  //    once rewritten the node no longer contains the needle.
  function sweep() {
    var needle = localOrigin() + NEEDLE_PATH;
    if (document.body === null) return;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    var node;
    while ((node = walker.nextNode()) !== null) {
      var value = node.nodeValue;
      if (value !== null && value.indexOf(needle) !== -1) {
        node.nodeValue = value.split(needle).join(PUBLIC_ORIGIN + NEEDLE_PATH);
      }
    }
    var fields = document.querySelectorAll('input, textarea');
    for (var i = 0; i < fields.length; i++) {
      var field = fields[i];
      if (typeof field.value === 'string' && field.value.indexOf(needle) !== -1) {
        field.value = field.value.split(needle).join(PUBLIC_ORIGIN + NEEDLE_PATH);
      }
    }
  }

  // The share dialog is only on screen for a moment, and React may paint it a frame
  // or two after the click, so follow up a few times.
  document.addEventListener('click', function () {
    sweep();
    setTimeout(sweep, 120);
    setTimeout(sweep, 400);
    setTimeout(sweep, 1200);
  }, true);

  // A restored share page or a deep link can already contain the string.
  document.addEventListener('DOMContentLoaded', sweep, false);
})();</script>`;
function injectOriginShim(html) {
  if (html.includes("data-dsh-proxy-shim")) return html;
  const shims = WECHAT_SHIM + SHARE_SHIM;
  for (const anchor of [/<head[^>]*>/i, /<html[^>]*>/i]) {
    const match = anchor.exec(html);
    if (match !== null) {
      const at = match.index + match[0].length;
      return html.slice(0, at) + shims + html.slice(at);
    }
  }
  return shims + html;
}
function isRewritableType(contentType) {
  if (contentType === void 0) return false;
  return contentType.includes("text/html") || contentType.includes("text/css") || contentType.includes("javascript") || contentType.includes("ecmascript");
}
function resolveTarget(requestPath) {
  if (requestPath === STATIC_PREFIX || requestPath.startsWith(STATIC_PREFIX + "/")) {
    const rest = requestPath.slice(STATIC_PREFIX.length);
    return { host: STATIC_HOST, path: rest === "" ? "/" : rest };
  }
  return { host: CHAT_HOST, path: requestPath };
}
function upstreamHeaders(req, host, needsIdentity) {
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === void 0) continue;
    if (DROPPED_REQUEST_HEADERS.has(key.toLowerCase())) continue;
    headers[key] = value;
  }
  headers["host"] = host;
  if (needsIdentity) headers["accept-encoding"] = "identity";
  return headers;
}
function rebaseLocation(value) {
  const trimmed = value.trim();
  const absolute = new RegExp(`^https?://${CHAT_HOST.replaceAll(".", "\\.")}(?=/|$)`, "i");
  if (absolute.test(trimmed)) return trimmed.replace(absolute, "");
  const protocolRelative = new RegExp(`^//${CHAT_HOST.replaceAll(".", "\\.")}(?=/|$)`, "i");
  if (protocolRelative.test(trimmed)) return trimmed.replace(protocolRelative, "");
  return trimmed;
}
function downstreamHeaders(upstream) {
  const headers = {};
  for (const [key, value] of Object.entries(upstream.headers)) {
    if (value === void 0) continue;
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower) || STRIPPED_RESPONSE_HEADERS.has(lower)) continue;
    if (lower === "set-cookie") {
      const list = Array.isArray(value) ? value : [value];
      headers["set-cookie"] = list.map(rebindSetCookie);
      continue;
    }
    if (lower === "location") {
      headers[key] = typeof value === "string" ? rebaseLocation(value) : value;
      continue;
    }
    headers[key] = value;
  }
  return headers;
}
function handleProxy(req, res) {
  const requestPath = req.url ?? "/";
  const target = resolveTarget(requestPath);
  const needsIdentity = !requestPath.startsWith(API_PREFIX);
  const upstream = httpsRequest(
    {
      host: target.host,
      path: target.path,
      method: req.method,
      headers: upstreamHeaders(req, target.host, needsIdentity)
    },
    (response) => {
      const headers = downstreamHeaders(response);
      const contentEncoding = response.headers["content-encoding"];
      const isCompressed = contentEncoding !== void 0 && contentEncoding !== "identity";
      if (!isCompressed && isRewritableType(response.headers["content-type"])) {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          const rewritten = rewriteBody(raw);
          const contentType = response.headers["content-type"] ?? "";
          const body = Buffer.from(
            contentType.includes("text/html") ? injectOriginShim(rewritten) : rewritten,
            "utf8"
          );
          delete headers["content-length"];
          headers["content-length"] = String(body.length);
          delete headers["content-encoding"];
          res.writeHead(response.statusCode ?? 502, headers);
          res.end(body);
        });
        response.on("error", () => {
          if (!res.headersSent) res.writeHead(502);
          res.end();
        });
        return;
      }
      res.writeHead(response.statusCode ?? 502, headers);
      response.pipe(res);
    }
  );
  let clientGone = false;
  upstream.on("error", (error) => {
    if (clientGone) return;
    console.warn("[dsh-chat-deepseek] upstream request failed:", error.message);
    if (res.destroyed || res.writableEnded) return;
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    }
    res.end(`DeepSeek upstream error: ${error.message}`);
  });
  res.on("close", () => {
    clientGone = true;
    if (!upstream.destroyed) upstream.destroy();
  });
  upstream.setTimeout(UPSTREAM_IDLE_TIMEOUT_MS, () => {
    upstream.destroy(new Error(`upstream idle for ${UPSTREAM_IDLE_TIMEOUT_MS}ms`));
  });
  req.pipe(upstream);
}
function isLoopbackRequest(req) {
  const address = req.socket.remoteAddress;
  return address !== void 0 && (address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1");
}
var CHAT_ROUTE_PREFIX = "/a/chat/s/";
var HISTORY_MESSAGES_PATH = "/api/v0/chat/history_messages";
function conversationIdOf(requestPath) {
  const [pathname, search] = requestPath.split("?");
  if (pathname !== void 0 && pathname.startsWith(CHAT_ROUTE_PREFIX)) {
    const id = pathname.slice(CHAT_ROUTE_PREFIX.length).split("/")[0];
    if (id !== void 0 && id !== "") return id;
  }
  if (pathname === HISTORY_MESSAGES_PATH && search !== void 0) {
    const id = new URLSearchParams(search).get("chat_session_id");
    if (id !== null && id !== "") return id;
  }
  return void 0;
}
function createConversationTracker(file) {
  let last;
  let timer;
  if (file !== void 0) {
    try {
      const raw = readFileSync(file, "utf8");
      const parsed = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null) {
        const value = parsed.conversationId;
        if (typeof value === "string" && value !== "") last = value;
      }
    } catch {
    }
  }
  const flush = () => {
    timer = void 0;
    if (file === void 0 || last === void 0) return;
    try {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify({ conversationId: last }), "utf8");
    } catch (error) {
      console.warn("[dsh-chat-deepseek] could not persist last conversation:", error);
    }
  };
  return {
    observe(id) {
      if (id === last) return;
      last = id;
      if (timer !== void 0) clearTimeout(timer);
      timer = setTimeout(flush, 400);
    },
    current() {
      return last;
    },
    dispose() {
      if (timer !== void 0) {
        clearTimeout(timer);
        flush();
      }
    }
  };
}
async function startProxy(preferredPort = DEFAULT_PORT, stateFile) {
  const tracker = createConversationTracker(stateFile);
  const server = createServer((req, res) => {
    if (!isLoopbackRequest(req)) {
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      res.end("loopback only");
      return;
    }
    const conversationId = conversationIdOf(req.url ?? "/");
    if (conversationId !== void 0) tracker.observe(conversationId);
    handleProxy(req, res);
  });
  server.requestTimeout = 0;
  server.headersTimeout = 6e4;
  const port = await new Promise((resolve2, reject) => {
    const listen = (candidate, allowRetry) => {
      function onListening() {
        server.off("error", onError);
        const address = server.address();
        resolve2(typeof address === "object" && address !== null ? address.port : candidate);
      }
      function onError(error) {
        server.off("listening", onListening);
        if (allowRetry && error.code === "EADDRINUSE" && candidate !== 0) {
          listen(0, false);
          return;
        }
        reject(error);
      }
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(candidate, "127.0.0.1");
    };
    listen(preferredPort, true);
  });
  return {
    url: `http://127.0.0.1:${port}/`,
    port,
    lastConversation: () => tracker.current(),
    dispose: () => new Promise((resolve2) => {
      tracker.dispose();
      server.close(() => resolve2());
      server.closeAllConnections?.();
    })
  };
}

// src/index.ts
var name = "chat-deepseek";
var inject = ["webServer"];
var STATUS_PATH = "/api/dsh-chat-deepseek/status";
function isVolatile2(value) {
  return typeof value === "object" && value !== null && typeof value.get === "function";
}
var Config = Schema.object({
  enabled: Schema.boolean().required(false).volatile(),
  port: Schema.number().min(0).max(65535).required(false).volatile()
});
function unwrapConfig(config) {
  if (config === void 0) return {};
  const result = {};
  for (const [key, value] of Object.entries(config)) {
    const resolved = isVolatile2(value) ? value.get() : value;
    if (resolved === void 0) continue;
    result[key] = resolved;
  }
  return result;
}
function apply(ctx, config) {
  const resolved = unwrapConfig(config);
  const enabled = resolved.enabled !== false;
  const preferredPort = resolved.port ?? DEFAULT_PORT;
  if (!enabled) {
    console.log("[dsh-chat-deepseek] disabled by config");
    return;
  }
  let proxy;
  let failure;
  const stateFile = join(homedir(), ".dsh", "dsh-chat-deepseek", "last-conversation.json");
  const ready = startProxy(preferredPort, stateFile).then((handle) => {
    proxy = handle;
    console.log(`[dsh-chat-deepseek] proxy listening on ${handle.url}`);
    return handle;
  }).catch((error) => {
    failure = error instanceof Error ? error.message : String(error);
    console.warn("[dsh-chat-deepseek] proxy failed to start:", failure);
    return void 0;
  });
  const statusRoute = {
    kind: "exact",
    path: STATUS_PATH,
    handler: (req, res) => {
      void ready.then((handle) => {
        const payload = handle === void 0 ? { ready: false, error: failure ?? "proxy not started" } : {
          ready: true,
          url: handle.url,
          port: handle.port,
          lastConversation: handle.lastConversation() ?? null
        };
        res.writeHead(handle === void 0 ? 503 : 200, {
          "content-type": "application/json; charset=utf-8",
          // The proxy port can change between launches; never let it be cached.
          "cache-control": "no-store"
        });
        res.end(JSON.stringify(payload));
      });
    }
  };
  ctx.effect(
    () => {
      const disposeRoute = ctx.webServer.register(statusRoute);
      return () => {
        disposeRoute();
        void proxy?.dispose();
        proxy = void 0;
      };
    },
    "dsh-chat-deepseek: proxy + status route"
  );
}
export {
  Config,
  STATUS_PATH,
  apply,
  inject,
  name
};

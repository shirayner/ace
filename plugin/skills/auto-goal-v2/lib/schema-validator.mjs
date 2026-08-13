/**
 * Structural validator for the JSON Schema subset the V2 schemas use.
 *
 * Deliberately not a general JSON Schema engine: it supports only the keywords
 * the control-plane schemas actually need, and it fails on unknown keywords so a
 * schema typo cannot silently degrade into "everything passes".
 *
 * Structure is necessary but never sufficient — semantic validation (references,
 * transitions, evidence rungs) lives in semantic-validator.mjs (design §8.2).
 *
 * Supported: type, enum, const, required, properties, additionalProperties,
 * items, minItems, maxItems, uniqueItems, minimum, maximum, minLength,
 * maxLength, maxBytes, pattern, nullable, anyOf.
 */

import { SchemaValidationError } from './errors.mjs';
import { utf8Bytes } from './budgets.mjs';

const SUPPORTED_KEYWORDS = new Set([
  '$id',
  'title',
  'description',
  'type',
  'enum',
  'const',
  'required',
  'properties',
  'additionalProperties',
  'items',
  'minItems',
  'maxItems',
  'uniqueItems',
  'minimum',
  'maximum',
  'minLength',
  'maxLength',
  'maxBytes',
  'pattern',
  'nullable',
  'anyOf',
]);

function jsonType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  const type = typeof value;
  if (type === 'number') return 'number';
  return type; // string | boolean | object | undefined | function
}

function typeMatches(value, expected) {
  const actual = jsonType(value);
  if (expected === 'number') return actual === 'number' || actual === 'integer';
  return actual === expected;
}

function assertKnownKeywords(schema, schemaPath, schemaId) {
  for (const keyword of Object.keys(schema)) {
    if (!SUPPORTED_KEYWORDS.has(keyword)) {
      throw new TypeError(
        `Schema ${schemaId} uses unsupported keyword "${keyword}" at ${schemaPath || '<root>'}`,
      );
    }
  }
}

function validateNode(value, schema, instancePath, violations, schemaId) {
  assertKnownKeywords(schema, instancePath, schemaId);

  const report = (rule, message) => violations.push({ path: instancePath || '<root>', rule, message });

  if (value === null && schema.nullable === true) return;

  if (schema.type !== undefined) {
    const expected = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!expected.some((candidate) => typeMatches(value, candidate))) {
      report('type', `expected ${expected.join('|')}, received ${jsonType(value)}`);
      return; // Downstream keywords assume the type holds.
    }
  }

  if (schema.const !== undefined && value !== schema.const) {
    report('const', `expected constant ${JSON.stringify(schema.const)}`);
  }

  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    report('enum', `${JSON.stringify(value)} is not one of ${schema.enum.length} allowed values`);
  }

  const type = jsonType(value);

  if (type === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      report('minLength', `length ${value.length} < ${schema.minLength}`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      report('maxLength', `length ${value.length} > ${schema.maxLength}`);
    }
    // maxBytes gates real UTF-8 bytes; maxLength gates UTF-16 code units.
    if (schema.maxBytes !== undefined) {
      const bytes = utf8Bytes(value);
      if (bytes > schema.maxBytes) {
        report('maxBytes', `${bytes} UTF-8 bytes > ${schema.maxBytes}`);
      }
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) {
      report('pattern', `does not match ${schema.pattern}`);
    }
  }

  if (type === 'number' || type === 'integer') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      report('minimum', `${value} < ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      report('maximum', `${value} > ${schema.maximum}`);
    }
  }

  if (type === 'array') {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      report('minItems', `${value.length} items < ${schema.minItems}`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      report('maxItems', `${value.length} items > ${schema.maxItems}`);
    }
    if (schema.uniqueItems === true) {
      const seen = new Set(value.map((item) => JSON.stringify(item)));
      if (seen.size !== value.length) report('uniqueItems', 'array contains duplicates');
    }
    if (schema.items !== undefined) {
      value.forEach((item, index) => {
        validateNode(item, schema.items, `${instancePath}[${index}]`, violations, schemaId);
      });
    }
  }

  if (type === 'object') {
    for (const key of schema.required ?? []) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        report('required', `missing required property "${key}"`);
      }
    }

    const properties = schema.properties ?? {};
    for (const [key, childSchema] of Object.entries(properties)) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        const childPath = instancePath ? `${instancePath}.${key}` : key;
        validateNode(value[key], childSchema, childPath, violations, schemaId);
      }
    }

    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) {
          report('additionalProperties', `unexpected property "${key}"`);
        }
      }
    } else if (typeof schema.additionalProperties === 'object') {
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) {
          const childPath = instancePath ? `${instancePath}.${key}` : key;
          validateNode(value[key], schema.additionalProperties, childPath, violations, schemaId);
        }
      }
    }
  }

  if (schema.anyOf !== undefined) {
    const matched = schema.anyOf.some((branch) => {
      const branchViolations = [];
      validateNode(value, branch, instancePath, branchViolations, schemaId);
      return branchViolations.length === 0;
    });
    if (!matched) report('anyOf', `matches none of ${schema.anyOf.length} alternatives`);
  }
}

/**
 * Validate a value and collect every violation.
 * @returns {{valid: boolean, violations: Array<{path: string, rule: string, message: string}>}}
 */
export function validateSchema(value, schema) {
  const violations = [];
  const schemaId = schema.$id ?? '<anonymous>';
  validateNode(value, schema, '', violations, schemaId);
  return { valid: violations.length === 0, violations };
}

/**
 * Validate or throw. Use where a structural defect must stop the pipeline.
 * @throws {SchemaValidationError}
 */
export function assertSchema(value, schema) {
  const { valid, violations } = validateSchema(value, schema);
  if (!valid) {
    throw new SchemaValidationError(schema.$id ?? '<anonymous>', violations);
  }
  return value;
}

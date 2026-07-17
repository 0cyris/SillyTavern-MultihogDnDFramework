/**
 * schema-check.mjs — minimal JSON-Schema interpreter for cartridge.schema.json.
 *
 * Supports EXACTLY the frozen keyword subset documented in the schema's
 * $comment: type, required, properties, additionalProperties, items, enum,
 * const, pattern, maxLength, minimum, and local $ref (#/$defs/*).
 * Do not grow this interpreter — richer rules belong in lint-rules.mjs.
 */

function typeOf(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
}

function typeMatches(value, type) {
    const t = typeOf(value);
    if (type === 'number') return t === 'number' && Number.isFinite(value);
    if (type === 'integer') return t === 'number' && Number.isInteger(value);
    return t === type;
}

function resolveRef(ref, rootSchema) {
    if (!ref.startsWith('#/')) throw new Error(`Unsupported $ref: ${ref}`);
    let node = rootSchema;
    for (const part of ref.slice(2).split('/')) {
        node = node?.[part];
        if (node === undefined) throw new Error(`Unresolvable $ref: ${ref}`);
    }
    return node;
}

/**
 * Validate `value` against `schema`.
 * @returns {{path: string, message: string}[]} findings (empty = valid)
 */
export function schemaCheck(value, schema, rootSchema = schema, path = '$') {
    const findings = [];
    if (schema.$ref) {
        return schemaCheck(value, resolveRef(schema.$ref, rootSchema), rootSchema, path);
    }
    if (schema.const !== undefined && value !== schema.const) {
        findings.push({ path, message: `must be ${JSON.stringify(schema.const)} (got ${JSON.stringify(value)})` });
        return findings;
    }
    if (schema.enum && !schema.enum.includes(value)) {
        findings.push({ path, message: `must be one of ${JSON.stringify(schema.enum)} (got ${JSON.stringify(value)})` });
        return findings;
    }
    if (schema.type !== undefined) {
        const types = Array.isArray(schema.type) ? schema.type : [schema.type];
        if (!types.some((t) => typeMatches(value, t))) {
            findings.push({ path, message: `must be of type ${types.join('|')} (got ${typeOf(value)})` });
            return findings; // type mismatch — deeper checks are meaningless
        }
    }
    if (typeof value === 'string') {
        if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
            findings.push({ path, message: `must match pattern ${schema.pattern} (got ${JSON.stringify(value.length > 60 ? value.slice(0, 57) + '...' : value)})` });
        }
        if (schema.maxLength !== undefined && value.length > schema.maxLength) {
            findings.push({ path, message: `must be at most ${schema.maxLength} characters (got ${value.length})` });
        }
    }
    if (typeof value === 'number' && schema.minimum !== undefined && value < schema.minimum) {
        findings.push({ path, message: `must be >= ${schema.minimum} (got ${value})` });
    }
    if (Array.isArray(value) && schema.items) {
        value.forEach((item, i) => {
            findings.push(...schemaCheck(item, schema.items, rootSchema, `${path}[${i}]`));
        });
    }
    if (typeOf(value) === 'object') {
        for (const key of schema.required || []) {
            if (value[key] === undefined) {
                findings.push({ path, message: `missing required property "${key}"` });
            }
        }
        for (const [key, sub] of Object.entries(schema.properties || {})) {
            if (value[key] !== undefined) {
                findings.push(...schemaCheck(value[key], sub, rootSchema, `${path}.${key}`));
            }
        }
        const ap = schema.additionalProperties;
        if (ap && typeof ap === 'object') {
            for (const [key, v] of Object.entries(value)) {
                if (!(schema.properties && key in schema.properties)) {
                    findings.push(...schemaCheck(v, ap, rootSchema, `${path}.${key}`));
                }
            }
        }
    }
    return findings;
}

/**
 * loader-hooks.mjs — Node module customization hooks for running the
 * Multihog D&D Framework extension modules outside SillyTavern.
 *
 * Registered by framework-loader.mjs via module.register(). Two jobs:
 *  1. Repo extension files have no package.json and use ESM syntax in .js
 *     files, so force format:'module' for allowlisted repo modules.
 *  2. Any import that is NOT on the allowlist (browser-only modules like
 *     llm-client.js, ui-editors.js, SillyTavern core ../../../*.js) is
 *     replaced with a synthesized stub module whose export names were
 *     collected by framework-loader.mjs from the importers' import
 *     statements. Every stub export is a callable no-op function.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const STUB_SCHEME = 'multihog-stub:';

let repoRootUrl = '';
let allowNames = new Set();
let stubExports = {};

export function initialize(data) {
    repoRootUrl = data.repoRootUrl;
    allowNames = new Set(data.allowNames);
    stubExports = data.stubExports || {};
}

export function resolve(specifier, context, nextResolve) {
    const parent = context.parentURL || '';
    const fromRepoModule = parent.startsWith(repoRootUrl) || parent.startsWith(STUB_SCHEME);
    const isRelative = specifier.startsWith('./') || specifier.startsWith('../');
    if (isRelative && fromRepoModule) {
        const base = parent.startsWith(STUB_SCHEME) ? repoRootUrl : parent;
        const resolved = new URL(specifier, base).href;
        const name = resolved.split('/').pop();
        if (resolved.startsWith(repoRootUrl) && allowNames.has(name)) {
            return { url: resolved, shortCircuit: true };
        }
        return { url: STUB_SCHEME + encodeURIComponent(resolved), shortCircuit: true };
    }
    return nextResolve(specifier, context);
}

export function load(url, context, nextLoad) {
    if (url.startsWith(STUB_SCHEME)) {
        const resolved = decodeURIComponent(url.slice(STUB_SCHEME.length));
        const names = (stubExports[resolved] || []).filter((n) => n !== 'default');
        const source = [
            'const __mhStub = (name) => Object.assign(function __mhStubFn() { return undefined; }, { __mhStubName: name });',
            ...names.map((n) => `export const ${n} = __mhStub(${JSON.stringify(n)});`),
            "export default __mhStub('default');",
            '',
        ].join('\n');
        return { format: 'module', source, shortCircuit: true };
    }
    if (url.startsWith(repoRootUrl) && url.endsWith('.js')) {
        const name = url.split('/').pop();
        if (allowNames.has(name)) {
            return {
                format: 'module',
                source: readFileSync(fileURLToPath(url), 'utf8'),
                shortCircuit: true,
            };
        }
    }
    return nextLoad(url, context);
}

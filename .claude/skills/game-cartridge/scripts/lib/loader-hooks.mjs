/**
 * loader-hooks.mjs — Node module customization hooks for running the
 * Multihog D&D Framework extension modules outside SillyTavern.
 *
 * Registered by framework-loader.mjs via module.register(). Two jobs:
 *  1. Repo extension files have no package.json "type" for these deep paths
 *     and use ESM syntax in .js files, so force format:'module' for real
 *     (non-stubbed) repo modules.
 *  2. Any import NOT in the real-module set computed by framework-loader.mjs's
 *     resolveModuleGraph() (browser-only modules, SillyTavern core) is
 *     replaced with a synthesized stub module whose export names were
 *     collected during that same traversal. Every stub export is a callable
 *     no-op function.
 *
 * Real modules are matched by repo-relative path (e.g. "src/state/settings.js"),
 * not bare basename — multiple files can share a basename across directories.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const STUB_SCHEME = 'multihog-stub:';

let repoRootUrl = '';
let realPaths = new Set();
let stubExports = {};

export function initialize(data) {
    repoRootUrl = data.repoRootUrl;
    realPaths = new Set(data.realPaths);
    stubExports = data.stubExports || {};
}

function toRepoRelative(url) {
    return path.relative(fileURLToPath(repoRootUrl), fileURLToPath(url)).split(path.sep).join('/');
}

export function resolve(specifier, context, nextResolve) {
    const parent = context.parentURL || '';
    const fromRepoModule = parent.startsWith(repoRootUrl) || parent.startsWith(STUB_SCHEME);
    const isRelative = specifier.startsWith('./') || specifier.startsWith('../');
    if (isRelative && fromRepoModule) {
        const base = parent.startsWith(STUB_SCHEME) ? repoRootUrl : parent;
        const resolved = new URL(specifier, base).href;
        if (resolved.startsWith(repoRootUrl) && realPaths.has(toRepoRelative(resolved))) {
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
    if (url.startsWith(repoRootUrl) && url.endsWith('.js') && realPaths.has(toRepoRelative(url))) {
        return {
            format: 'module',
            source: readFileSync(fileURLToPath(url), 'utf8'),
            shortCircuit: true,
        };
    }
    return nextLoad(url, context);
}

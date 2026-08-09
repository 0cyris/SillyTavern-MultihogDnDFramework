import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { restoreEscapedCyoaChoiceMarkup } from '../src/ui/panel/cyoa-markup.js';

describe('restoreEscapedCyoaChoiceMarkup', () => {
    it('restores an escaped choices block into extension-owned DOM tags', () => {
        const input = 'Story.&lt;choices&gt;&lt;button&gt;1. Look&lt;/button&gt;&lt;button&gt;2. Leave&lt;/button&gt;&lt;/choices&gt;';

        expect(restoreEscapedCyoaChoiceMarkup(input))
            .toBe('Story.<choices><button>1. Look</button><button>2. Leave</button></choices>');
    });

    it('also restores bare escaped button sequences when XML wrapping is disabled', () => {
        const input = '&lt;button&gt;1. Look&lt;/button&gt;<br>&lt;button&gt;2. Leave&lt;/button&gt;';

        expect(restoreEscapedCyoaChoiceMarkup(input))
            .toBe('<button>1. Look</button><br><button>2. Leave</button>');
    });

    it('does not decode arbitrary markup or a lone literal button mention', () => {
        const input = 'Try &lt;button&gt; in your own template; &lt;script&gt;never&lt;/script&gt;.';

        expect(restoreEscapedCyoaChoiceMarkup(input)).toBe(input);
    });

    it('allows long mechanics text to wrap inside CYOA buttons', () => {
        const styles = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
        const dynamicStyles = readFileSync(new URL('../index.js', import.meta.url), 'utf8');

        expect(styles).toMatch(/\.rt-cyoa-mech[\s\S]*?white-space:\s*normal;/);
        expect(styles).toMatch(/\.rt-cyoa-mech[\s\S]*?overflow-wrap:\s*anywhere;/);
        expect(dynamicStyles).toMatch(/\.rt-cyoa-mech[\s\S]*?white-space:\s*normal\s*!important;/);
        expect(dynamicStyles).toMatch(/\.rt-cyoa-mech[\s\S]*?overflow-wrap:\s*anywhere\s*!important;/);
    });
});

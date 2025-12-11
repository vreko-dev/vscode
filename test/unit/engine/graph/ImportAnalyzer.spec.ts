import { describe, expect, it } from 'vitest';
import { ImportAnalyzer } from '../../../../src/engine/graph/ImportAnalyzer';

describe('ImportAnalyzer', () => {
    it('should parse imports from a file content with depth=1', async () => {
        const analyzer = new ImportAnalyzer();
        const content = `
            import { Foo } from './foo';
            import * as bar from './bar';
            const baz = require('./baz');
        `;

        const imports = await analyzer.parseImports(content);

        expect(imports).toEqual(['./foo', './bar', './baz']);
    });
});

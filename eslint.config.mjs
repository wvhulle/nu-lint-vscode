import eslint from '@eslint/js';
import typescriptEslint from 'typescript-eslint';

export default typescriptEslint.config(
    {
        ignores: ['out/**', 'node_modules/**', 'result/**', '.vscode-test/**', '*.mjs'],
    },
    eslint.configs.recommended,
    typescriptEslint.configs.strictTypeChecked,
    typescriptEslint.configs.stylisticTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                projectService: {
                    allowDefaultProject: [],
                },
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            '@typescript-eslint/explicit-function-return-type': 'error',
            '@typescript-eslint/explicit-module-boundary-types': 'error',
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/consistent-type-imports': 'error',
            'no-console': 'off',
            'id-length': ['error', { min: 2 }],
        },
    },
    {
        files: ['test/unit/**/*.ts'],
        rules: {
            '@typescript-eslint/no-floating-promises': 'off',
        },
    },
);

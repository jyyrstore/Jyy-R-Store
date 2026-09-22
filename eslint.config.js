const js=require('@eslint/js');
const globals=require('globals');

module.exports=[
  {
    name:'jyyr-store/ignores',
    ignores:[
      'node_modules/**',
      '.git/**',
      '.production-fix-backup-*/**',
      'coverage/**',
      'dist/**',
      'build/**'
    ]
  },

  js.configs.recommended,

  {
    name:'jyyr-store/javascript',
    files:['**/*.js'],
    languageOptions:{
      ecmaVersion:'latest',
      sourceType:'commonjs',
      globals:{
        ...globals.node,
        ...globals.browser,
        JYYRApi:'readonly'
      }
    },
    rules:{
      'no-unused-vars':'off'
    }
  }
];

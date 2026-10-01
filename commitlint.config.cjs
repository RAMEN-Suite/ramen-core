module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', ['feat', 'fix', 'perf', 'refactor', 'docs', 'test', 'build', 'ci', 'chore', 'revert', 'style']],
    'scope-enum': [2, 'always', ['model', 'tools', 'deps', 'release']],
    'scope-empty': [2, 'never'],
    'body-max-line-length': [0, 'always'],
  },
};

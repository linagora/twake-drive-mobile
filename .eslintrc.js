// An attribute set on the element itself, not on some JSX nested in a prop
// (an `icon={…}` render function can hold a labelled element of its own).
const ownAttribute = names => `> JSXAttribute[name.name=/^(${names.join('|')})$/]`
const namedOrHidden = ownAttribute(['accessibilityLabel', 'accessibilityElementsHidden'])

module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  extends: ['prettier', 'plugin:react-native-a11y/all'],
  plugins: ['prettier', '@typescript-eslint', 'import', 'react-native-a11y'],
  rules: {
    'prettier/prettier': 'error',
    // A hint is optional: it says what activating a control does when the
    // label alone does not. Requiring one next to every label makes a screen
    // reader repeat the obvious on each control.
    'react-native-a11y/has-accessibility-hint': 'off',
    // The plugin only knows React Native's own touchables. Paper's icon-only
    // controls render nothing a screen reader can read, so they need a label,
    // unless they are decorative and hidden on purpose.
    'no-restricted-syntax': [
      'error',
      {
        selector: `JSXOpeningElement[name.name='IconButton']:not(:has(${namedOrHidden}))`,
        message: 'An IconButton shows no text: give it an accessibilityLabel.'
      },
      {
        selector: `JSXOpeningElement[name.object.name='Appbar'][name.property.name='Action']:not(:has(${namedOrHidden}))`,
        message: 'An Appbar.Action shows no text: give it an accessibilityLabel.'
      },
      {
        selector: `JSXOpeningElement[name.name='FAB']:not(:has(${ownAttribute(['label', 'accessibilityLabel'])}))`,
        message: 'A FAB without a visible label needs an accessibilityLabel.'
      }
    ]
  },
  overrides: [
    {
      // Test harnesses render bare Pressables only to call a hook from a
      // press; they never reach a user.
      files: ['**/*.test.ts', '**/*.test.tsx'],
      rules: {
        'react-native-a11y/has-valid-accessibility-descriptors': 'off'
      }
    }
  ]
}

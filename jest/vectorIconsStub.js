// Stub for react-native-vector-icons during tests. The icon font is not
// installed in this project (jest-expo maps it to @expo/vector-icons which
// isn't a dependency either). We render a plain host component so render
// trees still work.
const React = require('react')

const Icon = props => React.createElement('Icon', props)

module.exports = Icon
module.exports.default = Icon

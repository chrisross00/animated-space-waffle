const { defineConfig } = require('@vue/cli-service')

module.exports = defineConfig({
  transpileDependencies: [
    'quasar'
  ],

  devServer: {
    proxy: 'http://localhost:3000/' //https://chrisross00-animated-space-waffle-6r5xgg77wgxcr95-3000.preview.app.github.dev/
  },

  pluginOptions: {
    quasar: {
      importStrategy: 'kebab',
      rtlSupport: false
    }
  }
})

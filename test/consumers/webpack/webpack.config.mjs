import { fileURLToPath } from 'node:url';

export default {
  mode: 'production',
  entry: fileURLToPath(new URL('./src/main.js', import.meta.url)),
  output: {
    path: fileURLToPath(new URL('./dist', import.meta.url)),
    filename: 'main.js',
    publicPath: '/',
    clean: true,
  },
  performance: { hints: false },
  stats: 'errors-warnings',
};

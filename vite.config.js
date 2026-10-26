import {defineConfig} from 'vite';
export default defineConfig({
  base:'./',
  build:{target:'es2022'},
  esbuild:{target:'es2022'},
  server:{proxy:{'/api':'http://localhost:3000'}}
});

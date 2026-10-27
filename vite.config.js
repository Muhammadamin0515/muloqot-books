import {defineConfig} from 'vite';
import {execSync} from 'node:child_process';
/* Short commit id shown in Profile so it is easy to tell which build a device is running. */
const build=(process.env.WORKERS_CI_COMMIT_SHA||(()=>{try{return execSync('git rev-parse HEAD').toString()}catch(e){return 'dev'}})()).trim().slice(0,7);
export default defineConfig({
  base:'./',
  define:{__BUILD__:JSON.stringify(build)},
  build:{target:'es2022'},
  esbuild:{target:'es2022'},
  server:{proxy:{'/api':'http://localhost:3000'}}
});

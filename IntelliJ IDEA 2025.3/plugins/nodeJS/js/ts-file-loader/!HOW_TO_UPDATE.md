# How to update?

1. Update `package.json` (if required)
2. Run following script: 
```shell
# PREPARING
rm -r node_modules
rm package-lock.json

# INSTALL
npm i

# CLEANUP
cd node_modules

rm **/*.ts
rm **/*.cts
rm **/*.mts

rm esbuild/esm/browser.js
rm esbuild/esm/browser.min.js
```
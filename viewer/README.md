# Viewer
A light browser application using three.js, webpack, and typescript.

(If you don't know what those are, read [this great article](https://medium.com/@peterxjang/modern-javascript-explained-for-dinosaurs-f695e9747b70)).

## Build process
Uses webpack.
Typescript compiles to es2015; in prod, es2015 is minified using babel-minify.

Inspired by:
https://github.com/blacksonic/typescript-webpack-tree-shaking

Note: dead code elimination works poorly for three.js, see: https://github.com/mrdoob/three.js/issues/9403
So bundle sizes may be large-ish (200kb gzip).

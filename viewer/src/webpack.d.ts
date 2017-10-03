/**
 * See webpack.config.js;
 * imported .png modules are just urls.
 */
declare module '*.png' {
    const value: string;
    export default value;
}
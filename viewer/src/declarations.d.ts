/**
 * See webpack.config.js;
 * imported .png modules are just urls.
 */
declare module '*.png' {
    const value: string;
    export default value;
}
declare module '*.jpg' {
    const value: string;
    export default value;
}
declare module '*.gif' {
    const value: string;
    export default value;
}
declare module '*.css' {}

// fix stat's wonky @types
declare module 'stats.js' {
    const Stats: any;
    export default Stats;
}

declare function require(m: string);
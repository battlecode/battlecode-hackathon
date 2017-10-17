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

// fix stat's wonky @types
declare module 'stats.js' {
    const Stats: any;
    export default Stats;
}
import {promisify} from 'util';
import * as fs from 'fs';
import * as path from 'path';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const readdir = promisify(fs.readdir);
const exists = promisify(fs.exists);
const mkdir = promisify(fs.mkdir);
const stat = promisify(fs.stat);

export default async function(topRoot: string, extension?: string): Promise<string[]> {
    let paths = new Array<string>();
    let stack = new Array<[string, Promise<string[]>]>();

    stack.push([topRoot, readdir(topRoot)]);

    while (stack.length > 0) {
        let next = stack.pop();
        if (next === undefined) continue;

        let [root, filesp] = next;

        let files = await filesp;
        files = files.map(f => path.join(root, f));

        let stats = await Promise.all(files.map(f => stat(f)));

        for (let i = 0; i < files.length; i++) {
            if (stats[i].isDirectory()) {
                stack.push([files[i], readdir(files[i])]);
            } else if (extension && files[i].endsWith(extension) || extension === undefined) {
                paths.push(path.relative(topRoot, files[i]));
            }
        }
    }

    paths.sort();
    return paths;
}
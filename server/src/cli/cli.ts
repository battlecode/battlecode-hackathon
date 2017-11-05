#!/usr/bin/env node

import * as yargs from 'yargs';
import chalk from 'chalk';
import * as path from 'path';

import * as start from './start';
import * as upload from './upload';

yargs
    .command(start)
    .command(upload)
    .command('openMaps', 'Open the battlecode map folder')
    .command('openSaves', 'Open the battlecode save folder')
    .demandCommand(1, 1, 'Please tell me what to do.', "I'm not a good multitasker.")
    .help()
    .argv;

#!/usr/bin/env node

import * as yargs from 'yargs';
import chalk from 'chalk';
import * as path from 'path';
import * as open from 'opn';

import * as start from './start';
import * as upload from './upload';
import * as openData from './openData';

import * as paths from '../paths';

yargs
    .command(start)
    .command(upload)
    .command(openData)
    .demandCommand(1, 1, 'Please tell me what to do.', "I'm not a good multitasker.")
    .help()
    .argv;

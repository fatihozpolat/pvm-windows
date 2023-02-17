#!/usr/bin/env node

const program = require('commander');
const {
    listDownloadablePHPVersions,
    listUsablePHPVersions,
    setPHPVersion,
    downloadPHP,
    createPvm
} = require('../index');

program
    .version('1.0.0')
    .description('PHP Version Manager');

program
    .command('list')
    .alias('l')
    .description('List all installed PHP versions')
    .action(async () => {
        await listUsablePHPVersions();
    });

program
    .command('install <version>')
    .alias('i')
    .description('Install a PHP version')
    .action(async (version) => {
        await downloadPHP(version);
    });

program
    .command('use <version>')
    .alias('u')
    .description('Use a PHP version')
    .action(async (version) => {
        await setPHPVersion(version);
    });

program
    .command('createdir')
    .alias('c')
    .description('Create the PVM directory for PHP versions')
    .action(async () => {
        createPvm();
    });

program
    .command('downloadable')
    .alias('d')
    .description('List all downloadable PHP versions')
    .action(async () => {
        await listDownloadablePHPVersions();
    });

program.parse(process.argv);
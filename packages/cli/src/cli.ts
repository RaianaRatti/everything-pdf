#!/usr/bin/env node
import { main, type Io } from "./main";

// Progress is drawn on one self-overwriting stderr line, and only in an interactive terminal.
let progressShown = false;
const clearProgress = () => {
  if (progressShown) process.stderr.write("\r\x1b[K");
  progressShown = false;
};

const io: Io = {
  cwd: process.cwd(),
  out(line) {
    clearProgress();
    process.stdout.write(`${line}\n`);
  },
  err(line) {
    clearProgress();
    process.stderr.write(`${line}\n`);
  },
  progress(line) {
    if (!process.stderr.isTTY) return;
    process.stderr.write(`\r${line}\x1b[K`);
    progressShown = true;
  },
};

process.exitCode = await main(process.argv.slice(2), io);

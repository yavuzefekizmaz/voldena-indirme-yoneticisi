#!/usr/bin/env node
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

let buffer = Buffer.alloc(0);

// Read Native Messaging format from stdin
process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  
  if (buffer.length >= 4) {
    const length = buffer.readUInt32LE(0);
    if (buffer.length >= 4 + length) {
      const message = buffer.slice(4, 4 + length).toString('utf8');
      try {
        handleMessage(JSON.parse(message));
      } catch (e) {}
      buffer = buffer.slice(4 + length);
    }
  }
});

function sendMessage(msg) {
  const msgStr = JSON.stringify(msg);
  const len = Buffer.alloc(4);
  len.writeUInt32LE(Buffer.byteLength(msgStr, 'utf8'), 0);
  process.stdout.write(len);
  process.stdout.write(msgStr);
}

function handleMessage(msg) {
  if (msg.action === 'download') {
    // Try to send to the running Electron app
    const req = http.request({
      hostname: '127.0.0.1',
      port: 41234,
      path: '/download',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }, (res) => {
      sendMessage({ success: true, status: 'Sent to app via HTTP' });
    });
    
    req.on('error', (e) => {
      // App is probably not running, we must spawn it
      const appPath = path.join(__dirname, '..', 'node_modules', '.bin', 'electron.cmd');
      const mainPath = path.join(__dirname, '..'); // package.json directory
      
      const child = spawn(appPath, [mainPath, `--download=${JSON.stringify(msg)}`], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false
      });
      child.unref();
      
      sendMessage({ success: true, status: 'App spawned' });
    });
    
    req.write(JSON.stringify(msg));
    req.end();
  } else {
      sendMessage({ success: true, message: "Unknown action" });
  }
}

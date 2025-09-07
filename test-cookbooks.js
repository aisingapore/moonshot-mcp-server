#!/usr/bin/env node

import { spawn } from 'child_process';

async function testListCookbooks() {
  console.log('🚀 Testing list_cookbooks command...\n');

  // Start the MCP server process
  const serverProcess = spawn('node', ['dist/index.js'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: process.cwd()
  });

  let responseBuffer = '';
  let initialized = false;
  let messageId = 1;

  // Handle server responses
  serverProcess.stdout.on('data', (data) => {
    const response = data.toString();
    responseBuffer += response;
    
    // Try to parse complete JSON messages
    const lines = responseBuffer.split('\n');
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim();
      if (line) {
        try {
          const parsed = JSON.parse(line);
          console.log('📋 Server Response:', JSON.stringify(parsed, null, 2));
          
          // Check if it's the initialization response
          if (parsed.id === 1 && parsed.result?.serverInfo) {
            initialized = true;
            console.log('\n✅ Server initialized successfully!\n');
            
            // Now send the list_resources command
            setTimeout(() => {
              const listMessage = {
                jsonrpc: '2.0',
                id: 2,
                method: 'tools/call',
                params: {
                  name: 'list_resources',
                  arguments: {
                    resource_type: 'cookbooks'
                  }
                }
              };
              
              console.log('📚 Sending list_cookbooks request...\n');
              serverProcess.stdin.write(JSON.stringify(listMessage) + '\n');
            }, 500);
          }
          
          // Check if it's the cookbooks response
          if (parsed.id === 2 && parsed.result) {
            console.log('\n✅ Cookbooks retrieved successfully!\n');
            
            // Extract cookbook list
            if (parsed.result.content && parsed.result.content[0]) {
              const text = parsed.result.content[0].text;
              console.log('📚 Cookbooks List:');
              console.log(text);
            }
            
            // Exit after getting the response
            setTimeout(() => {
              serverProcess.kill();
              process.exit(0);
            }, 1000);
          }
        } catch (e) {
          // Not a complete JSON message yet
        }
      }
    }
    
    // Keep the last incomplete line
    responseBuffer = lines[lines.length - 1];
  });

  serverProcess.stderr.on('data', (data) => {
    console.error('❌ Server Error:', data.toString());
  });

  serverProcess.on('exit', (code) => {
    console.log(`\nServer exited with code ${code}`);
  });

  // Send initialization message
  const initMessage = {
    jsonrpc: '2.0',
    id: messageId++,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'moonshot-test-client',
        version: '1.0.0'
      }
    }
  };

  console.log('📤 Sending initialization...\n');
  serverProcess.stdin.write(JSON.stringify(initMessage) + '\n');

  // Set a timeout to exit if we don't get a response
  setTimeout(() => {
    console.log('\n⏱️ Timeout reached. Exiting...');
    serverProcess.kill();
    process.exit(1);
  }, 300000);
}

// Run the test
testListCookbooks().catch(console.error);
#!/usr/bin/env node

import axios from 'axios';

async function testDirectAPI() {
  console.log('Testing direct API call to Moonshot...\n');
  
  try {
    // Test 1: Health check
    console.log('1. Testing health check at http://localhost:5000/');
    const healthResponse = await axios.get('http://localhost:5000/', {
      timeout: 5000
    });
    console.log('   ✅ Health check response:', healthResponse.data);
    
    // Test 2: Direct cookbooks endpoint
    console.log('\n2. Testing cookbooks endpoint at http://localhost:5000/api/v1/cookbooks');
    const cookbooksResponse = await axios.get('http://localhost:5000/api/v1/cookbooks', {
      timeout: 5000
    });
    console.log('   ✅ Cookbooks response received');
    console.log('   Number of cookbooks:', cookbooksResponse.data.length);
    console.log('   First cookbook:', cookbooksResponse.data[0]);
    
    // Test 3: Using axios instance like MoonshotClient
    console.log('\n3. Testing with axios instance (like MoonshotClient)');
    const api = axios.create({
      baseURL: 'http://localhost:5000/api/v1',
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    const instanceResponse = await api.get('/cookbooks');
    console.log('   ✅ Instance response received');
    console.log('   Number of cookbooks:', instanceResponse.data.length);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code) {
      console.error('   Error code:', error.code);
    }
    if (error.config) {
      console.error('   Request URL:', error.config.url);
      console.error('   Request timeout:', error.config.timeout);
    }
  }
}

testDirectAPI();
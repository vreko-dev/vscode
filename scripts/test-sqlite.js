#!/usr/bin/env node

/**
 * Test script to verify better-sqlite3 installation and basic functionality
 * This script is used to diagnose SQLite storage issues in the SnapBack VS Code extension
 */

console.log('🔍 Testing better-sqlite3 installation...');

try {
  // Try to load the better-sqlite3 module
  const Database = require('better-sqlite3');
  console.log('✅ better-sqlite3 module loaded successfully');

  // Try to create an in-memory database
  const db = new Database(':memory:');
  console.log('✅ SQLite database created successfully');

  // Try to run a simple query
  db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
  db.prepare('INSERT INTO test (name) VALUES (?)').run('test');
  const result = db.prepare('SELECT * FROM test').all();

  if (result.length > 0 && result[0].name === 'test') {
    console.log('✅ SQLite queries executed successfully');
    console.log('🎉 All SQLite tests passed! better-sqlite3 is working correctly.');
  } else {
    console.log('❌ SQLite query returned unexpected results');
  }

  // Close the database
  db.close();

} catch (error) {
  console.error('❌ Failed to test better-sqlite3:', error.message);
  console.error('_STACK:', error.stack);
  process.exit(1);
}

const fs = require('fs');
const path = require('path');

const clientPath = path.join(process.cwd(), 'node_modules', '.prisma', 'client');

if (fs.existsSync(clientPath)) {
  // Create default.ts
  fs.writeFileSync(
    path.join(clientPath, 'default.ts'),
    "export * from './client'"
  );
  
  // Create default.d.ts
  fs.writeFileSync(
    path.join(clientPath, 'default.d.ts'),
    "export * from './client'"
  );
  
  // Create default.js - re-export from client.ts
  // Next.js will handle TypeScript compilation
  fs.writeFileSync(
    path.join(clientPath, 'default.js'),
    `module.exports = require('./client.ts');`
  );
  
  console.log('✓ Created default export files for Prisma client');
}


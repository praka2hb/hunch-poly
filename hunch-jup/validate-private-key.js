const fs = require('fs');
const path = require('path');

console.log('\n' + '='.repeat(70));
console.log('🔐 PRIVATE KEY VALIDATOR & FORMATTER');
console.log('='.repeat(70) + '\n');

// Read the private key file
const keyPath = 'C:\\Users\\Kapil\\Downloads\\AuthKey_DZA3A74VVX.p8';

try {
    const keyContent = fs.readFileSync(keyPath, 'utf8');
    
    console.log('✅ Successfully read private key file\n');
    console.log('📋 File Analysis:');
    console.log('-'.repeat(70));
    
    const lines = keyContent.split('\n').filter(line => line.trim());
    console.log(`   Total lines: ${lines.length}`);
    console.log(`   Expected: 7 lines (BEGIN, 5 content lines, END)\n`);
    
    // Check line count
    if (lines.length !== 6 && lines.length !== 7) {
        console.log(`   ⚠️  Warning: Unusual line count (${lines.length})`);
    } else {
        console.log(`   ✅ Line count looks good`);
    }
    
    // Check first line
    const firstLine = lines[0].trim();
    if (firstLine === '-----BEGIN PRIVATE KEY-----') {
        console.log(`   ✅ BEGIN marker is correct`);
    } else {
        console.log(`   ❌ BEGIN marker is wrong: "${firstLine}"`);
    }
    
    // Check last line
    const lastLine = lines[lines.length - 1].trim();
    if (lastLine === '-----END PRIVATE KEY-----') {
        console.log(`   ✅ END marker is correct`);
    } else {
        console.log(`   ❌ END marker is wrong: "${lastLine}"`);
    }
    
    // Check for non-printable characters
    const nonPrintableChars = keyContent.match(/[\x00-\x1F\x7F-\x9F]/g);
    if (nonPrintableChars && nonPrintableChars.length > 2) { // Allow \n and \r
        console.log(`   ⚠️  Warning: Found ${nonPrintableChars.length} non-printable characters`);
    }
    
    console.log();
    console.log('📝 Correctly Formatted Private Key (Copy this):');
    console.log('='.repeat(70));
    console.log();
    
    // Clean and format
    const cleanedLines = lines.map(line => line.trim());
    const formatted = cleanedLines.join('\n');
    
    console.log(formatted);
    console.log();
    console.log('='.repeat(70));
    console.log();
    
    // Save cleaned version
    const outputPath = path.join(__dirname, 'AuthKey_CLEANED.p8');
    fs.writeFileSync(outputPath, formatted, 'utf8');
    console.log(`✅ Saved cleaned version to: ${outputPath}`);
    console.log();
    
    // Provide copy instructions
    console.log('📋 NEXT STEPS:');
    console.log('-'.repeat(70));
    console.log('1. Copy the key content above (between the = lines)');
    console.log('2. Go to Privy Dashboard: https://dashboard.privy.io');
    console.log('3. Settings → Login Methods → Social Login → Apple');
    console.log('4. DELETE the current Private Key field completely');
    console.log('5. Paste the cleaned key from above');
    console.log('6. Verify all 7 lines are present (BEGIN + 5 content + END)');
    console.log('7. Save configuration');
    console.log('8. Wait 5 minutes');
    console.log('9. Try Apple Sign In again\n');
    
    console.log('💡 TIP: The key has been saved to AuthKey_CLEANED.p8');
    console.log('        You can open it and copy from there too.\n');
    
    // Show hex dump of first few bytes for debugging
    console.log('🔬 Technical Details (for debugging):');
    console.log('-'.repeat(70));
    const buffer = Buffer.from(keyContent);
    console.log(`   File size: ${buffer.length} bytes`);
    console.log(`   Line endings: ${keyContent.includes('\r\n') ? 'Windows (CRLF)' : 'Unix (LF)'}`);
    console.log(`   First 20 bytes (hex): ${buffer.slice(0, 20).toString('hex')}`);
    console.log();
    
} catch (error) {
    console.log('❌ Error reading private key file:', error.message);
    console.log();
    console.log('💡 Make sure the file exists at:');
    console.log(`   ${keyPath}`);
    console.log();
    console.log('Or update the keyPath variable in this script.\n');
}

console.log('='.repeat(70) + '\n');
